/* =====================================================================
 * orcparam.js — ORÇAMENTO PELOS PARÂMETROS DA OBRA (motor PURO, Node-testável)
 *
 * Pedido do Rogério (20/10/2026): "quando a pessoa só colocar os parâmetros,
 * ele ser bem preciso e conseguir gerar o orçamento, sem o usuário ficar
 * preenchendo". O Escopo Inteligente lia o que a pessoa ESCREVIA; quem só
 * sabia "casa térrea de 100 m², padrão normal" recebia uma linha só, com
 * quantidade 1 "inferida", e montava o resto à mão.
 *
 * O QUE ELE FAZ. Recebe tipo, área, pavimentos, pé-direito, padrão,
 * banheiros, quartos, cobertura, forro e piso. Deduz a geometria (perímetro,
 * paredes internas, vãos) e devolve as linhas do orçamento — etapa, código
 * SINAPI, descrição, unidade, quantidade — CADA UMA COM A FÓRMULA ESCRITA.
 * Nada sai sem dizer de onde veio: a pessoa lê "alvenaria = (P + Li) × (h −
 * 0,30) × pav − vãos" e confere.
 *
 * ⚠ AS REGRAS QUE NÃO DOBRAM (é dinheiro):
 *   1. Os códigos SINAPI abaixo foram CONFERIDOS na base real (MG 2026-06) —
 *      descrição e unidade. tools/test-orcparam.js reprova se algum sumir ou
 *      mudar de unidade. Código não se inventa.
 *   2. Linha sem código (a SINAPI não tem o serviço inteiro, ex.: tesoura de
 *      telhado, limpeza final de obra) leva SÓ a descrição: o Orçamentista
 *      procura pela descrição e, sem achar, elabora composição própria por
 *      analogia. É esse o caminho que o pedido manda — nunca um código chute.
 *   3. Os coeficientes são PREMISSAS DE ESTIMATIVA, não projeto. Toda
 *      premissa sai em `premissas` e na fórmula da linha; quem tem projeto
 *      troca a quantidade na planilha. O orçamento continua sendo o
 *      documento de quem assina.
 *   4. Motor puro: não toca DOM, Store nem base. Quem casa código e preço é o
 *      Orçamentista (js/orcamentista.js), na base e competência do usuário.
 * ===================================================================== */
(function (global) {
  "use strict";

  function r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
  function r3(x) { return Math.round((Number(x) || 0) * 1000) / 1000; }
  function cima(x) { return Math.max(0, Math.ceil((Number(x) || 0) - 1e-9)); }
  function num(v, padrao) {
    if (typeof v === "number") return isFinite(v) ? v : padrao;
    var s = String(v == null ? "" : v).trim();
    if (!s) return padrao;
    /* "1.250,50" (BR) e "1250.5" (ponto decimal): o padrão de quem digita */
    if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : padrao;
  }
  function f2(x) { return String(r2(x)).replace(".", ","); }

  var PADROES = {
    popular: { rotulo: "Popular", ajuda: "Acabamento econômico: cerâmica 35×35, látex econômico, sem forro de gesso." },
    normal: { rotulo: "Normal", ajuda: "Padrão médio: cerâmica, massa corrida, látex standard, forro de gesso." },
    alto: { rotulo: "Alto", ajuda: "Porcelanato, massa corrida em parede e teto, látex premium, calha e calçada." }
  };
  var COBERTURAS = {
    ceramica: { rotulo: "Telha cerâmica", incl: 0.35 },
    concreto: { rotulo: "Telha de concreto", incl: 0.30 },
    fibrocimento: { rotulo: "Telha de fibrocimento", incl: 0.15 },
    metalica: { rotulo: "Telha metálica termoacústica", incl: 0.10 },
    laje: { rotulo: "Laje impermeabilizada (sem telhado)", incl: 0 }
  };
  var TIPOS = {
    residencial: { rotulo: "Residência (casa / sobrado)" },
    comercial: { rotulo: "Comercial (loja / sala / escritório)" }
  };
  var FORROS = { gesso: "Forro de gesso", laje: "Laje (forro em laje pré-moldada)", nenhum: "Sem forro" };
  var PISOS = { ceramica: "Cerâmica", porcelanato: "Porcelanato" };

  /* Códigos SINAPI conferidos (descrição + unidade) na base MG 2026-06.
     A descrição curta é o que o Orçamentista compara com a da base ao achar
     o código: a mesma régua que ele usa numa planilha importada. */
  var S = {
    limpeza: ["98524", "LIMPEZA MANUAL DE VEGETAÇÃO EM TERRENO COM ENXADA", "m²"],
    locacao: ["99059", "LOCAÇÃO CONVENCIONAL DE OBRA, GABARITO DE TÁBUAS CORRIDAS PONTALETADAS A CADA 2,00M", "m"],
    placa: ["103689", "PLACA DE OBRA COM CHAPA GALVANIZADA E ESTRUTURA DE MADEIRA", "m²"],
    escBald: ["96527", "ESCAVAÇÃO MANUAL PARA VIGA BALDRAME OU SAPATA CORRIDA", "m³"],
    escSap: ["96523", "ESCAVAÇÃO MANUAL PARA BLOCO DE COROAMENTO OU SAPATA", "m³"],
    lastroSap: ["96619", "LASTRO DE CONCRETO MAGRO, APLICADO EM BLOCOS DE COROAMENTO OU SAPATAS, ESPESSURA DE 5 CM", "m²"],
    concSap: ["96556", "CONCRETAGEM DE SAPATA, FCK 30 MPA, COM USO DE JERICA", "m³"],
    arm10f: ["104919", "ARMAÇÃO DE SAPATA ISOLADA, VIGA BALDRAME E SAPATA CORRIDA AÇO CA-50 DE 10 MM", "kg"],
    arm5f: ["104916", "ARMAÇÃO DE SAPATA ISOLADA, VIGA BALDRAME E SAPATA CORRIDA AÇO CA-60 DE 5 MM", "kg"],
    formaBald: ["96533", "FÔRMA PARA VIGA BALDRAME, EM MADEIRA SERRADA, E=25 MM, 2 UTILIZAÇÕES", "m²"],
    concBald: ["96555", "CONCRETAGEM DE BLOCO DE COROAMENTO OU VIGA BALDRAME, FCK 30 MPA, COM USO DE JERICA", "m³"],
    impBald: ["98557", "IMPERMEABILIZAÇÃO DE SUPERFÍCIE COM EMULSÃO ASFÁLTICA, 2 DEMÃOS", "m²"],
    reaterro: ["93382", "REATERRO MANUAL DE VALAS, COM COMPACTADOR DE SOLOS DE PERCUSSÃO", "m³"],
    formaPil: ["92411", "MONTAGEM E DESMONTAGEM DE FÔRMA DE PILARES RETANGULARES, PÉ-DIREITO SIMPLES, MADEIRA SERRADA, 2 UTILIZAÇÕES", "m²"],
    formaViga: ["92448", "MONTAGEM E DESMONTAGEM DE FÔRMA DE VIGA, ESCORAMENTO COM PONTALETE, PÉ-DIREITO SIMPLES, MADEIRA SERRADA, 4 UTILIZAÇÕES", "m²"],
    arm10e: ["92762", "ARMAÇÃO DE PILAR OU VIGA DE ESTRUTURA CONVENCIONAL DE CONCRETO ARMADO AÇO CA-50 DE 10,0 MM", "kg"],
    arm5e: ["92759", "ARMAÇÃO DE PILAR OU VIGA DE ESTRUTURA CONVENCIONAL DE CONCRETO ARMADO AÇO CA-60 DE 5,0 MM", "kg"],
    concPil: ["103669", "CONCRETAGEM DE PILARES, FCK = 25 MPA, COM USO DE BALDES", "m³"],
    lajePiso: ["106056", "LAJE PRÉ-MOLDADA UNIDIRECIONAL, BIAPOIADA, PARA PISO, ENCHIMENTO EM CERÂMICA, LT = 12 CM", "m²"],
    lajeForro: ["101964", "LAJE PRÉ-MOLDADA UNIDIRECIONAL, BIAPOIADA, PARA FORRO, ENCHIMENTO EM CERÂMICA, VIGOTA CONVENCIONAL, LT = 12 CM", "m²"],
    alvenaria: ["103328", "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X19X19 CM, PREPARO EM BETONEIRA", "m²"],
    verga: ["105024", "VERGA MOLDADA IN LOCO EM CONCRETO, ESPESSURA DE 10 CM", "m"],
    contraverga: ["105030", "CONTRAVERGA MOLDADA IN LOCO EM CONCRETO, ESPESSURA DE 10 CM", "m"],
    encunhamento: ["93200", "FIXAÇÃO (ENCUNHAMENTO) DE ALVENARIA DE VEDAÇÃO COM ARGAMASSA APLICADA COM BISNAGA", "m"],
    trama2: ["92539", "TRAMA DE MADEIRA COMPOSTA POR RIPAS, CAIBROS E TERÇAS PARA TELHADOS DE ATÉ 2 ÁGUAS PARA TELHA CERÂMICA OU DE CONCRETO", "m²"],
    tramaTerca: ["92543", "TRAMA DE MADEIRA COMPOSTA POR TERÇAS PARA TELHADOS DE ATÉ 2 ÁGUAS PARA TELHA ONDULADA DE FIBROCIMENTO, METÁLICA", "m²"],
    telhaCer: ["94201", "TELHAMENTO COM TELHA CERÂMICA CAPA-CANAL, TIPO COLONIAL, COM ATÉ 2 ÁGUAS", "m²"],
    telhaConc: ["94189", "TELHAMENTO COM TELHA DE CONCRETO DE ENCAIXE, COM ATÉ 2 ÁGUAS", "m²"],
    telhaFibro: ["94207", "TELHAMENTO COM TELHA ONDULADA DE FIBROCIMENTO E = 6 MM, INCLINAÇÃO MAIOR QUE 10°, ATÉ 2 ÁGUAS", "m²"],
    telhaMet: ["94216", "TELHAMENTO COM TELHA METÁLICA TERMOACÚSTICA E = 30 MM, COM ATÉ 2 ÁGUAS", "m²"],
    cumeCer: ["94221", "CUMEEIRA PARA TELHA CERÂMICA EMBOÇADA COM ARGAMASSA TRAÇO 1:2:9, ATÉ 2 ÁGUAS", "m"],
    cumeConc: ["94222", "CUMEEIRA PARA TELHA DE CONCRETO EMBOÇADA COM ARGAMASSA TRAÇO 1:2:9, ATÉ 2 ÁGUAS", "m"],
    calha: ["94228", "CALHA EM CHAPA DE AÇO GALVANIZADO NÚMERO 24, DESENVOLVIMENTO DE 50 CM", "m"],
    impLaje: ["98556", "IMPERMEABILIZAÇÃO DE SUPERFÍCIE COM ARGAMASSA POLIMÉRICA / MEMBRANA ACRÍLICA, 4 DEMÃOS, VÉU DE POLIÉSTER", "m²"],
    chapInt: ["87879", "CHAPISCO APLICADO EM ALVENARIAS E ESTRUTURAS DE CONCRETO INTERNAS, COM COLHER DE PEDREIRO, TRAÇO 1:3", "m²"],
    massaInt: ["87529", "MASSA ÚNICA, EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO, APLICADA MANUALMENTE EM PAREDES INTERNAS, E = 17,5MM, COM TALISCAS", "m²"],
    emboco: ["87535", "EMBOÇO, EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO, APLICADO MANUALMENTE EM PAREDES INTERNAS, E = 17,5MM, COM TALISCAS", "m²"],
    cerParede: ["87265", "REVESTIMENTO CERÂMICO PARA PAREDES INTERNAS COM PLACAS TIPO ESMALTADA DE 20X20 CM NA ALTURA INTEIRA DAS PAREDES", "m²"],
    chapExt: ["87905", "CHAPISCO APLICADO EM ALVENARIA (COM PRESENÇA DE VÃOS) E ESTRUTURAS DE CONCRETO DE FACHADA, COM COLHER DE PEDREIRO", "m²"],
    massaExt: ["87775", "EMBOÇO OU MASSA ÚNICA EM ARGAMASSA TRAÇO 1:2:8, BETONEIRA 400 L, PANOS DE FACHADA COM PRESENÇA DE VÃOS, ESPESSURA DE 25 MM", "m²"],
    lastroPiso: ["95241", "LASTRO DE CONCRETO MAGRO, APLICADO EM PISOS, LAJES SOBRE SOLO OU RADIERS, ESPESSURA DE 5 CM", "m²"],
    contrapiso: ["87643", "CONTRAPISO EM ARGAMASSA PRONTA, PREPARO MECÂNICO, APLICADO EM ÁREAS SECAS SOBRE LAJE, ADERIDO, ESPESSURA 4CM", "m²"],
    pisoCer: ["87248", "REVESTIMENTO CERÂMICO PARA PISO COM PLACAS TIPO ESMALTADA DE DIMENSÕES 35X35 CM, AMBIENTES DE ÁREA MAIOR QUE 10 M2", "m²"],
    pisoPorc: ["87263", "REVESTIMENTO CERÂMICO PARA PISO COM PLACAS TIPO PORCELANATO DE DIMENSÕES 60X60 CM, AMBIENTES DE ÁREA MAIOR QUE 10 M²", "m²"],
    rodape: ["88649", "RODAPÉ CERÂMICO DE 7CM DE ALTURA COM PLACAS TIPO ESMALTADA DE DIMENSÕES 45X45CM", "m"],
    impMolh: ["98555", "IMPERMEABILIZAÇÃO DE SUPERFÍCIE COM ARGAMASSA POLIMÉRICA / MEMBRANA ACRÍLICA, 3 DEMÃOS", "m²"],
    soleira: ["98689", "SOLEIRA EM GRANITO, LARGURA 15 CM, ESPESSURA 2,0 CM", "m"],
    peitoril: ["101965", "PEITORIL LINEAR EM GRANITO OU MÁRMORE, L = 15CM, ASSENTADO COM ARGAMASSA 1:6 COM ADITIVO", "m"],
    forroGesso: ["96109", "FORRO EM PLACAS DE GESSO, PARA AMBIENTES RESIDENCIAIS", "m²"],
    janela: ["94570", "JANELA DE ALUMÍNIO DE CORRER COM 2 FOLHAS PARA VIDROS (VIDROS INCLUSOS)", "m²"],
    portaInt: ["100681", "KIT DE PORTA DE MADEIRA FRISADA, SEMI-OCA, PADRÃO MÉDIO, 70X210CM, COM FECHADURA", "un"],
    portaExt: ["106146", "PORTA DE AÇO DE ABRIR, P/ VIDRO, C/ GUARNIÇÃO, 90X210CM, FIXAÇÃO COM ARGAMASSA", "un"],
    massaPar1: ["88495", "EMASSAMENTO COM MASSA LÁTEX, APLICAÇÃO EM PAREDE, UMA DEMÃO, LIXAMENTO MANUAL", "m²"],
    massaPar2: ["88497", "EMASSAMENTO COM MASSA LÁTEX, APLICAÇÃO EM PAREDE, DUAS DEMÃOS, LIXAMENTO MANUAL", "m²"],
    massaTeto: ["88494", "EMASSAMENTO COM MASSA LÁTEX, APLICAÇÃO EM TETO, UMA DEMÃO, LIXAMENTO MANUAL", "m²"],
    tintaParEco: ["104641", "PINTURA LÁTEX ACRÍLICA ECONÔMICA, APLICAÇÃO MANUAL EM PAREDES, DUAS DEMÃOS", "m²"],
    tintaParStd: ["104642", "PINTURA LÁTEX ACRÍLICA STANDARD, APLICAÇÃO MANUAL EM PAREDES, DUAS DEMÃOS", "m²"],
    tintaParPrem: ["88489", "PINTURA LÁTEX ACRÍLICA PREMIUM, APLICAÇÃO MANUAL EM PAREDES, DUAS DEMÃOS", "m²"],
    tintaTetoEco: ["104639", "PINTURA LÁTEX ACRÍLICA ECONÔMICA, APLICAÇÃO MANUAL EM TETO, DUAS DEMÃOS", "m²"],
    tintaTetoStd: ["104640", "PINTURA LÁTEX ACRÍLICA STANDARD, APLICAÇÃO MANUAL EM TETO, DUAS DEMÃOS", "m²"],
    tintaTetoPrem: ["88488", "PINTURA LÁTEX ACRÍLICA PREMIUM, APLICAÇÃO MANUAL EM TETO, DUAS DEMÃOS", "m²"],
    seladorExt: ["88415", "APLICAÇÃO MANUAL DE FUNDO SELADOR ACRÍLICO EM PAREDES EXTERNAS DE CASAS", "m²"],
    entrada: ["101501", "ENTRADA DE ENERGIA ELÉTRICA, AÉREA, BIFÁSICA, COM CAIXA DE EMBUTIR, CABO DE 10 MM2 E DISJUNTOR DIN 50A", "un"],
    quadro: ["101875", "QUADRO DE DISTRIBUIÇÃO DE ENERGIA EM CHAPA DE AÇO GALVANIZADO, DE EMBUTIR, PARA 12 DISJUNTORES DIN 100A", "un"],
    disj16: ["93654", "DISJUNTOR MONOPOLAR TIPO DIN, CORRENTE NOMINAL DE 16A", "un"],
    disj40: ["93665", "DISJUNTOR BIPOLAR TIPO DIN, CORRENTE NOMINAL DE 40A", "un"],
    eletroduto: ["91855", "ELETRODUTO FLEXÍVEL CORRUGADO REFORÇADO, PVC, DN 25 MM (3/4\"), PARA CIRCUITOS TERMINAIS, INSTALADO EM PAREDE", "m"],
    cabo: ["91926", "CABO DE COBRE FLEXÍVEL ISOLADO, 2,5 MM², ANTI-CHAMA 450/750 V, PARA CIRCUITOS TERMINAIS", "m"],
    caixaBaixa: ["91941", "CAIXA RETANGULAR 4\" X 2\" BAIXA (0,30 M DO PISO), PVC, INSTALADA EM PAREDE", "un"],
    caixaMedia: ["91940", "CAIXA RETANGULAR 4\" X 2\" MÉDIA (1,30 M DO PISO), PVC, INSTALADA EM PAREDE", "un"],
    tomada: ["91996", "TOMADA MÉDIA DE EMBUTIR (1 MÓDULO), 2P+T 10 A, INCLUINDO SUPORTE E PLACA", "un"],
    interruptor: ["91953", "INTERRUPTOR SIMPLES (1 MÓDULO), 10A/250V, INCLUINDO SUPORTE E PLACA", "un"],
    luminaria: ["103782", "LUMINÁRIA TIPO PLAFON CIRCULAR, DE SOBREPOR, COM LED DE 12/13 W", "un"],
    haste: ["96985", "HASTE DE ATERRAMENTO, DIÂMETRO 5/8\", COM 3 METROS", "un"],
    tubo25: ["89402", "TUBO, PVC, SOLDÁVEL, DE 25MM, INSTALADO EM RAMAL DE DISTRIBUIÇÃO DE ÁGUA", "m"],
    registro: ["89987", "REGISTRO DE GAVETA BRUTO, LATÃO, ROSCÁVEL, 3/4\", COM ACABAMENTO E CANOPLA CROMADOS", "un"],
    caixaDagua: ["102623", "CAIXA D´ÁGUA EM POLIETILENO, 1000 LITROS (INCLUSOS TUBOS, CONEXÕES E TORNEIRA DE BÓIA)", "un"],
    tubo40: ["89711", "TUBO PVC, SERIE NORMAL, ESGOTO PREDIAL, DN 40 MM, RAMAL DE DESCARGA OU RAMAL DE ESGOTO SANITÁRIO", "m"],
    tubo100: ["89714", "TUBO PVC, SERIE NORMAL, ESGOTO PREDIAL, DN 100 MM, RAMAL DE DESCARGA OU RAMAL DE ESGOTO SANITÁRIO", "m"],
    sifonada: ["89707", "CAIXA SIFONADA, PVC, DN 100 X 100 X 50 MM, JUNTA ELÁSTICA", "un"],
    gordura: ["98108", "CAIXA DE GORDURA DUPLA (CAPACIDADE: 126 L), EM ALVENARIA COM BLOCOS DE CONCRETO", "un"],
    fossa: ["98052", "TANQUE SÉPTICO CIRCULAR, EM CONCRETO PRÉ-MOLDADO, DIÂMETRO INTERNO = 1,10 M, PARA 5 CONTRIBUINTES", "un"],
    sumidouro: ["98062", "SUMIDOURO CIRCULAR, EM CONCRETO PRÉ-MOLDADO, DIÂMETRO INTERNO = 1,88 M, ALTURA INTERNA = 2,00 M", "un"],
    baciaPop: ["86931", "BACIA SANITÁRIA COM CAIXA ACOPLADA LOUÇA BRANCA, ENGATE FLEXÍVEL EM PLÁSTICO", "un"],
    baciaMed: ["86932", "BACIA SANITÁRIA COM CAIXA ACOPLADA LOUÇA BRANCA - PADRÃO MÉDIO, ENGATE FLEXÍVEL EM METAL CROMADO", "un"],
    lavPop: ["86939", "LAVATÓRIO LOUÇA BRANCA COM COLUNA, 44 X 35 CM, PADRÃO POPULAR, COM SIFÃO, VÁLVULA E TORNEIRA", "un"],
    lavMed: ["86903", "LAVATÓRIO LOUÇA BRANCA COM COLUNA, 54 X 44 CM OU EQUIVALENTE, PADRÃO MÉDIO", "un"],
    lavAlto: ["86940", "LAVATÓRIO LOUÇA BRANCA COM COLUNA, 45 X 55 CM, PADRÃO MÉDIO, COM SIFÃO, VÁLVULA, ENGATE E MISTURADOR", "un"],
    chuveiro: ["100860", "CHUVEIRO ELÉTRICO COMUM CORPO PLÁSTICO, TIPO DUCHA", "un"],
    pia: ["93442", "BANCADA MÁRMORE BRANCO 150 X 60 CM, COM CUBA DE EMBUTIR DE AÇO, VÁLVULA, SIFÃO, ENGATE E TORNEIRA, PIA COZINHA", "un"],
    tanque: ["86920", "TANQUE DE LOUÇA BRANCA COM COLUNA, 30L, COM SIFÃO, VÁLVULA PLÁSTICA E TORNEIRA PADRÃO POPULAR", "un"],
    calcada: ["94995", "EXECUÇÃO DE PASSEIO (CALÇADA) OU PISO DE CONCRETO, CONCRETO USINADO, ESPESSURA 8 CM, ARMADO", "m²"]
  };

  var OrcParam = {
    PADROES: PADROES, COBERTURAS: COBERTURAS, TIPOS: TIPOS, FORROS: FORROS, PISOS: PISOS,
    CODIGOS: S,

    /* ------------------------------------------------------------------
     * Parâmetros com os padrões que a pessoa não precisou digitar. Cada
     * padrão adotado vira premissa escrita — "não informado" nunca some.
     * ------------------------------------------------------------------ */
    normalizar: function (entrada) {
      var e = entrada || {}, prem = [], erros = [];
      var p = {};
      p.tipo = TIPOS[e.tipo] ? e.tipo : "residencial";
      p.area = num(e.area, 0);
      if (!(p.area > 0)) erros.push("Informe a área construída (m²).");
      if (p.area > 20000) erros.push("Área acima de 20.000 m²: use o orçamento por planilha — a estimativa paramétrica não serve para esse porte.");
      p.pavimentos = Math.max(1, Math.min(4, Math.round(num(e.pavimentos, 1))));
      if (e.pavimentos == null || e.pavimentos === "") prem.push("1 pavimento (não informado).");
      p.peDireito = num(e.peDireito, 0);
      if (!(p.peDireito >= 2.3 && p.peDireito <= 6)) { if (p.peDireito) prem.push("Pé-direito fora de 2,30–6,00 m; adotado 2,80 m."); else prem.push("Pé-direito 2,80 m (não informado)."); p.peDireito = 2.8; }
      p.padrao = PADROES[e.padrao] ? e.padrao : "normal";
      p.cobertura = COBERTURAS[e.cobertura] ? e.cobertura : "ceramica";
      p.forro = FORROS[e.forro] ? e.forro : (p.cobertura === "laje" ? "laje" : (p.padrao === "popular" ? "nenhum" : "gesso"));
      if (p.cobertura === "laje") p.forro = "laje";
      p.piso = PISOS[e.piso] ? e.piso : (p.padrao === "alto" ? "porcelanato" : "ceramica");
      var Ap = p.area / p.pavimentos;
      p.quartos = Math.round(num(e.quartos, 0));
      if (!(p.quartos >= 0) || e.quartos == null || e.quartos === "") {
        p.quartos = p.tipo === "comercial" ? 0 : Math.max(1, Math.min(6, Math.round(p.area / 30)));
        if (p.tipo !== "comercial") prem.push(p.quartos + " quarto(s) — estimado por 1 a cada 30 m² (não informado).");
      }
      p.banheiros = Math.round(num(e.banheiros, 0));
      if (!(p.banheiros >= 1) || e.banheiros == null || e.banheiros === "") {
        p.banheiros = Math.max(1, Math.min(6, Math.round(p.area / 50)));
        prem.push(p.banheiros + " banheiro(s) — estimado por 1 a cada 50 m² (não informado).");
      }
      p.perimetro = num(e.perimetro, 0);
      p.esgoto = e.esgoto === "fossa" ? "fossa" : "rede";
      return { ok: !erros.length, erros: erros, p: p, premissas: prem, Ap: Ap };
    },

    /* ------------------------------------------------------------------
     * Geometria deduzida. Cada número leva a conta escrita, para a tela e
     * para a planilha (`formula` da linha).
     * ------------------------------------------------------------------ */
    geometria: function (p) {
      var g = {}, prem = [];
      g.Ap = r2(p.area / p.pavimentos);
      /* planta retangular 1 : 1,5 tem P = 4,08 √A; recortes de fachada somam
         ~10 % → 4,5 √A. Informado vence. */
      if (p.perimetro > 0) { g.P = r2(p.perimetro); g.Pf = "perímetro informado"; }
      else { g.P = r2(4.5 * Math.sqrt(g.Ap)); g.Pf = "4,5 × √Ap (planta retangular 1:1,5 com recortes)"; prem.push("Perímetro externo estimado em " + f2(g.P) + " m = 4,5 × √" + f2(g.Ap) + " (informe o real para mais precisão)."); }
      /* paredes internas: ~0,50 m por m² de pavimento em residência (medido em
         plantas de 2–3 quartos); comercial tem salão: 0,25 */
      var kLi = p.tipo === "comercial" ? 0.25 : 0.50;
      g.Li = r2(kLi * g.Ap); g.Lif = f2(kLi) + " × Ap";
      prem.push("Paredes internas: " + f2(kLi) + " m por m² de pavimento (" + f2(g.Li) + " m por pavimento).");
      g.h = p.peDireito;
      g.Lmaior = r2(Math.sqrt(1.5 * g.Ap));       // lado maior do retângulo 1:1,5
      g.Autil = r2(0.88 * p.area);                // paredes ocupam ~12 % da área construída
      prem.push("Área útil (piso, forro) = 88 % da construída = " + f2(g.Autil) + " m².");
      g.Aj = r2(0.125 * g.Autil);                 // iluminação 1/6 nos cômodos de permanência, 1/8 na média
      g.Nj = cima(g.Aj / 1.44);                   // janela típica 1,20 × 1,20
      g.Npi = cima(p.area / 14);                  // uma porta interna a cada ~14 m²
      g.Npe = p.tipo === "comercial" ? 1 : 2;
      prem.push("Janelas = 1/8 da área útil (" + f2(g.Aj) + " m², " + g.Nj + " un de 1,20×1,20); " + g.Npi + " porta(s) interna(s) 0,70×2,10; " + g.Npe + " externa(s) 0,90×2,10.");
      g.Avaos = r2(g.Aj + g.Npi * 0.70 * 2.10 + g.Npe * 0.90 * 2.10);
      g.Npil = Math.max(4, cima(g.Ap / 12));      // malha de ~3,5 m
      prem.push(g.Npil + " pilares por pavimento (um a cada 12 m², malha ~3,5 m), seção 14×30 cm; vigas 14×30 cm sobre todas as paredes.");
      g.sap = p.pavimentos >= 3 ? 1.2 : (p.pavimentos === 2 ? 1.0 : 0.8);
      prem.push("Fundação rasa: sapatas " + f2(g.sap) + "×" + f2(g.sap) + " m (h média 0,30 m, assentes a 1,0 m) e vigas baldrame 15×30 cm. Confirmar com sondagem e projeto.");
      g.Lb = r2(g.P + g.Li);                     // baldrame sob todas as paredes do térreo
      return { g: g, premissas: prem };
    },

    /* ------------------------------------------------------------------
     * As linhas. `L(etapa, chave|null, descricao, unidade, qtd, formula)`
     * ------------------------------------------------------------------ */
    gerar: function (entrada) {
      var n = this.normalizar(entrada);
      if (!n.ok) return { ok: false, erros: n.erros, linhas: [], premissas: n.premissas };
      var p = n.p, geo = this.geometria(p), g = geo.g;
      var prem = n.premissas.concat(geo.premissas);
      var linhas = [];
      var pv = p.pavimentos, h = g.h;
      function L(etapa, chave, qtd, formula, descLivre, unLivre) {
        var q = r2(qtd);
        if (!(q > 0)) return;
        var c = chave ? S[chave] : null;
        linhas.push({
          etapa: etapa,
          codigo: c ? c[0] : "",
          fonte: c ? "SINAPI" : "",
          descricao: c ? c[1] : descLivre,
          unidade: c ? c[2] : unLivre,
          quantidade: q,
          formula: formula,
          parametrico: true
        });
      }
      var pad = p.padrao;

      // 1. SERVIÇOS PRELIMINARES
      var E1 = "SERVIÇOS PRELIMINARES";
      L(E1, "limpeza", g.Ap * 1.5, "Ap × 1,5 (projeção + faixa de trabalho) = " + f2(g.Ap) + " × 1,5");
      L(E1, "locacao", g.P + 12, "P + 12 (gabarito afastado 1,50 m) = " + f2(g.P) + " + 12");
      L(E1, "placa", 2, "placa 2,00 × 1,00 m");
      L(E1, null, 1, "1 conjunto (água e energia provisórias)", "LIGAÇÃO PROVISÓRIA DE ÁGUA E ENERGIA ELÉTRICA PARA CANTEIRO DE OBRA", "un");
      L(E1, null, p.area > 150 ? 9 : 6, p.area > 150 ? "9 m² (obra acima de 150 m²)" : "6 m² (obra até 150 m²)", "BARRACÃO DE OBRA PARA DEPÓSITO E SANITÁRIO, EM CHAPA DE MADEIRA COMPENSADA", "m²");

      // 2. INFRAESTRUTURA
      var E2 = "INFRAESTRUTURA (FUNDAÇÕES)";
      var nS = g.Npil, s = g.sap;
      var escB = g.Lb * 0.40 * 0.50, escS = nS * (s + 0.2) * (s + 0.2) * 1.0;
      var vB = g.Lb * 0.15 * 0.30, vS = nS * s * s * 0.30;
      L(E2, "escBald", escB, "Lb × 0,40 × 0,50 (vala) = " + f2(g.Lb) + " × 0,20; Lb = P + Li");
      L(E2, "escSap", escS, nS + " sapatas × (" + f2(s) + " + 0,20)² × 1,00");
      L(E2, "lastroSap", nS * s * s, nS + " × " + f2(s) + "²");
      L(E2, "arm10f", vS * 50 + g.Lb * 4 * 0.617 * 1.10, "sapatas 50 kg/m³ × " + f2(vS) + " m³ + baldrame 4Ø10 (0,617 kg/m, +10 % traspasse) × " + f2(g.Lb) + " m");
      L(E2, "arm5f", g.Lb * 0.82, "estribos Ø5 c/15 (0,80 m × 0,154 kg/m ÷ 0,15) = 0,82 kg/m × " + f2(g.Lb) + " m");
      L(E2, "formaBald", g.Lb * 2 * 0.30, "2 faces × 0,30 m × " + f2(g.Lb) + " m");
      L(E2, "concSap", vS, nS + " × " + f2(s) + "² × 0,30");
      L(E2, "concBald", vB, "0,15 × 0,30 × " + f2(g.Lb) + " m");
      L(E2, "impBald", g.Lb * 0.75, "(topo 0,15 + 2 faces × 0,30) × " + f2(g.Lb) + " m");
      L(E2, "reaterro", (escB + escS) - (vB + vS), "escavação − concreto enterrado = " + f2(escB + escS) + " − " + f2(vB + vS));

      // 3. SUPERESTRUTURA
      var E3 = "SUPERESTRUTURA";
      var hp = h + 0.30, nP = g.Npil * pv, Lv = (g.P + g.Li) * pv;
      L(E3, "formaPil", nP * 2 * (0.14 + 0.30) * hp, nP + " pilares × perímetro 0,88 m × " + f2(hp) + " m");
      /* viga sobre parede: o fundo é a própria alvenaria — fôrma só nas duas
         faces; a de 4 usos porque a mesma tábua roda a casa inteira */
      L(E3, "formaViga", Lv * 0.60, "2 faces × 0,30 × " + f2(Lv) + " m de viga (fundo = alvenaria)");
      L(E3, "arm10e", (nP * hp + Lv) * 4 * 0.617 * 1.15, "4Ø10 (0,617 kg/m, +15 % traspasse) × (" + nP + " × " + f2(hp) + " + " + f2(Lv) + ") m");
      L(E3, "arm5e", (nP * hp + Lv) * 0.82, "estribos Ø5 c/15 = 0,82 kg/m × " + f2(nP * hp + Lv) + " m");
      L(E3, "concPil", nP * 0.14 * 0.30 * hp, nP + " × 0,14 × 0,30 × " + f2(hp));
      L(E3, null, Lv * 0.14 * 0.30, "0,14 × 0,30 × " + f2(Lv) + " m", "CONCRETAGEM DE VIGAS, FCK 25 MPA, LANÇAMENTO COM BALDES, ADENSAMENTO E ACABAMENTO", "m³");
      if (pv > 1) L(E3, "lajePiso", g.Ap * (pv - 1), (pv - 1) + " laje(s) de piso × " + f2(g.Ap) + " m²");
      if (p.forro === "laje") L(E3, "lajeForro", g.Ap, "laje de cobertura/forro = Ap");

      // 4. ALVENARIA
      var E4 = "ALVENARIA E VEDAÇÃO";
      var Aalv = (g.P + g.Li) * (h - 0.30) * pv - g.Avaos;
      L(E4, "alvenaria", Aalv, "(P + Li) × (h − 0,30) × pav − vãos = (" + f2(g.P) + " + " + f2(g.Li) + ") × " + f2(h - 0.30) + " × " + pv + " − " + f2(g.Avaos));
      L(E4, "verga", g.Nj * (1.20 + 0.60) + (g.Npi + g.Npe) * (0.80 + 0.60), "vão + 0,30 de cada lado: " + g.Nj + " janelas × 1,80 + " + (g.Npi + g.Npe) + " portas × 1,40");
      L(E4, "contraverga", g.Nj * (1.20 + 0.60), g.Nj + " janelas × 1,80");
      L(E4, "encunhamento", (g.P + g.Li) * pv, "topo de todas as paredes = (P + Li) × pav");

      // 5. COBERTURA
      var E5 = "COBERTURA";
      if (p.cobertura === "laje") {
        L(E5, "impLaje", g.Ap * 1.10, "Ap × 1,10 (rodapé de 30 cm na platibanda)");
      } else {
        var inc = COBERTURAS[p.cobertura].incl, fi = Math.sqrt(1 + inc * inc);
        var At = g.Ap * 1.15 * fi;
        var fAt = "Ap × 1,15 (beiral 0,50 m) × " + String(r3(fi)).replace(".", ",") + " (inclinação " + Math.round(inc * 100) + " %)";
        L(E5, (p.cobertura === "ceramica" || p.cobertura === "concreto") ? "trama2" : "tramaTerca", At, fAt);
        L(E5, null, Math.max(2, cima(g.Lmaior / 3) + 1), "lado maior " + f2(g.Lmaior) + " m ÷ 3,00 m + 1", "FABRICAÇÃO E INSTALAÇÃO DE TESOURA INTEIRA EM MADEIRA NÃO APARELHADA, VÃO ATÉ 8 M, PARA TELHADO", "un");
        L(E5, { ceramica: "telhaCer", concreto: "telhaConc", fibrocimento: "telhaFibro", metalica: "telhaMet" }[p.cobertura], At, fAt);
        if (p.cobertura === "ceramica" || p.cobertura === "concreto") L(E5, p.cobertura === "ceramica" ? "cumeCer" : "cumeConc", g.Lmaior, "lado maior da projeção = √(1,5 × Ap)");
        if (pad !== "popular") {
          L(E5, "calha", 2 * g.Lmaior, "2 beirais × " + f2(g.Lmaior) + " m");
          L(E5, null, 4 * (h * pv + 0.5), "4 descidas × altura " + f2(h * pv + 0.5) + " m", "TUBO PVC SÉRIE R ÁGUA PLUVIAL DN 100 MM, CONDUTOR VERTICAL", "m");
        }
      }

      // 6. REVESTIMENTOS DE PAREDE
      var E6 = "REVESTIMENTOS DE PAREDE";
      var Sint = (g.P + 2 * g.Li) * h * pv - (g.Aj + 2 * g.Npi * 1.47 + g.Npe * 1.89);
      var Acer = p.banheiros * 7.5 * h + (p.tipo === "comercial" ? 0 : 10 * 1.5);
      var Aext = g.P * (h * pv + 0.50) - (g.Aj + g.Npe * 1.89);
      L(E6, "chapInt", Sint, "faces internas (P + 2 Li) × h × pav − vãos = " + f2((g.P + 2 * g.Li) * h * pv) + " − vãos");
      L(E6, "massaInt", Sint - Acer, "faces internas − áreas com cerâmica (" + f2(Acer) + " m²)");
      L(E6, "emboco", Acer, p.banheiros + " banheiro(s) × 7,5 m × " + f2(h) + (p.tipo === "comercial" ? "" : " + cozinha/serviço 10 m × 1,50"));
      L(E6, "cerParede", Acer, "a mesma área do emboço");
      L(E6, "chapExt", Aext, "P × (h × pav + 0,50 platibanda/oitão) − vãos externos");
      L(E6, "massaExt", Aext, "a mesma área do chapisco externo");

      // 7. PISOS
      var E7 = "PISOS";
      var AutilT = r2(g.Autil / pv);
      L(E7, null, g.Ap, "projeção do térreo = Ap", "COMPACTAÇÃO MECÂNICA DE SOLO PARA EXECUÇÃO DE PISO SOBRE SOLO, COM PLACA VIBRATÓRIA", "m²");
      L(E7, "lastroPiso", AutilT, "área útil do térreo = " + f2(AutilT) + " m²");
      L(E7, "contrapiso", g.Autil, "área útil total");
      L(E7, p.piso === "porcelanato" ? "pisoPorc" : "pisoCer", g.Autil, "área útil total");
      L(E7, "rodape", (g.P + 2 * g.Li) * pv - (g.Npi * 2 + g.Npe) * 0.80 - p.banheiros * 7.5, "perímetro dos cômodos (P + 2 Li) × pav − portas − banheiros (com cerâmica)");
      L(E7, "impMolh", p.banheiros * 5 + (p.tipo === "comercial" ? 0 : 4), p.banheiros + " banheiro(s) × 5 m² (piso + rodapé do box)" + (p.tipo === "comercial" ? "" : " + 4 m² área de serviço"));
      L(E7, "soleira", g.Npe * 0.90 + p.banheiros * 0.70, g.Npe + " porta(s) externa(s) × 0,90 + " + p.banheiros + " banheiro(s) × 0,70");
      L(E7, "peitoril", g.Nj * 1.20, g.Nj + " janelas × 1,20 m");
      if (pad !== "popular") L(E7, "calcada", g.P * 0.60, "calçada perimetral 0,60 m × P");

      // 8. FORRO
      if (p.forro === "gesso") L("FORRO", "forroGesso", g.Autil, "área útil total");

      // 9. ESQUADRIAS
      var E9 = "ESQUADRIAS";
      L(E9, "janela", g.Aj, "1/8 da área útil");
      L(E9, "portaInt", g.Npi, "1 porta a cada 14 m² construídos");
      L(E9, "portaExt", g.Npe, p.tipo === "comercial" ? "acesso principal" : "acesso social + serviço");

      // 10. PINTURA
      var E10 = "PINTURA";
      var Apint = Sint - Acer, Ateto = g.Autil;
      if (pad === "alto") L(E10, "massaPar2", Apint, "paredes internas com massa única");
      else if (pad === "normal") L(E10, "massaPar1", Apint, "paredes internas com massa única");
      if (pad !== "popular") L(E10, "massaTeto", Ateto, "teto = área útil");
      L(E10, { popular: "tintaParEco", normal: "tintaParStd", alto: "tintaParPrem" }[pad], Apint + Aext, "paredes internas " + f2(Apint) + " + fachada " + f2(Aext));
      L(E10, { popular: "tintaTetoEco", normal: "tintaTetoStd", alto: "tintaTetoPrem" }[pad], Ateto, "teto = área útil");
      L(E10, "seladorExt", Aext, "fachada");

      // 11. ELÉTRICA
      var E11 = "INSTALAÇÕES ELÉTRICAS";
      var Nt = cima(p.area / 5), Nl = cima(p.area / 9);
      var Leletro = 5 * (Nt + 2 * Nl);
      prem.push("Elétrica: " + Nt + " tomadas (1 a cada 5 m², NBR 5410 pede 1 a cada 5 m de perímetro), " + Nl + " pontos de luz e interruptores (1 a cada 9 m²), 5 m de eletroduto por ponto.");
      L(E11, "entrada", 1, "1 entrada bifásica");
      L(E11, "quadro", pv, "1 quadro por pavimento");
      L(E11, "disj16", cima(Nt / 6) + cima(Nl / 10), "circuitos: tomadas ÷ 6 + iluminação ÷ 10");
      L(E11, "disj40", p.banheiros, "1 circuito de chuveiro por banheiro");
      L(E11, "eletroduto", Leletro, "5 m × (" + Nt + " tomadas + " + Nl + " luzes + " + Nl + " interruptores)");
      L(E11, "cabo", Leletro * 3, "3 condutores (F + N + T) × " + f2(Leletro) + " m");
      L(E11, "caixaBaixa", Nt, Nt + " tomadas");
      L(E11, "caixaMedia", Nl, Nl + " interruptores");
      L(E11, "tomada", Nt, "1 a cada 5 m²");
      L(E11, "interruptor", Nl, "1 por ponto de luz");
      L(E11, "luminaria", Nl, "1 a cada 9 m²");
      L(E11, "haste", 1, "aterramento do padrão");

      // 12. HIDROSSANITÁRIO
      var E12 = "INSTALAÇÕES HIDROSSANITÁRIAS";
      var Npa = 3 * p.banheiros + (p.tipo === "comercial" ? 1 : 3);
      var morad = p.tipo === "comercial" ? Math.max(2, cima(p.area / 10)) : 2 * p.quartos;
      var litros = (p.tipo === "comercial" ? 50 : 150) * morad;
      prem.push("Hidráulica: " + Npa + " pontos de água (3 por banheiro" + (p.tipo === "comercial" ? " + copa" : " + pia, tanque e máquina") + "); reservação de 1 dia = " + litros + " L (" + morad + " pessoas × " + (p.tipo === "comercial" ? "50" : "150") + " L).");
      L(E12, "tubo25", Npa * 4 + 3 * h * pv, Npa + " pontos × 4 m + barrilete/prumada " + f2(3 * h * pv) + " m");
      L(E12, "registro", p.banheiros + 2, "1 por banheiro + cozinha + área de serviço");
      L(E12, "caixaDagua", Math.max(1, cima(litros / 1000)), litros + " L ÷ 1.000 L");
      L(E12, "tubo40", p.banheiros * 6 + 4, p.banheiros + " banheiro(s) × 6 m + 4 m (cozinha e serviço)");
      L(E12, "tubo100", p.banheiros * 4 + g.P / 2, p.banheiros + " × 4 m (bacia) + coletor P/2");
      L(E12, "sifonada", p.banheiros + 1, "1 por banheiro + área de serviço");
      if (p.tipo !== "comercial") L(E12, "gordura", 1, "1 caixa de gordura");
      L(E12, null, 2, "2 caixas (mudança de direção e saída)", "CAIXA DE INSPEÇÃO DE ESGOTO EM ALVENARIA, 60 X 60 CM, COM TAMPA DE CONCRETO", "un");
      if (p.esgoto === "fossa") { L(E12, "fossa", cima(morad / 5), "1 tanque para cada 5 contribuintes"); L(E12, "sumidouro", cima(morad / 5), "1 sumidouro por tanque séptico"); }
      L(E12, pad === "popular" ? "baciaPop" : "baciaMed", p.banheiros, "1 por banheiro");
      L(E12, { popular: "lavPop", normal: "lavMed", alto: "lavAlto" }[pad], p.banheiros, "1 por banheiro");
      L(E12, "chuveiro", p.tipo === "comercial" ? 0 : p.banheiros, "1 por banheiro");
      if (p.tipo !== "comercial") { L(E12, "pia", 1, "pia da cozinha"); L(E12, "tanque", 1, "tanque da área de serviço"); }

      // 13. SERVIÇOS FINAIS
      L("SERVIÇOS FINAIS", null, p.area, "área construída", "LIMPEZA FINAL DE OBRA, INCLUSIVE REMOÇÃO DE ENTULHO", "m²");

      return { ok: true, erros: [], p: p, g: g, linhas: linhas, premissas: prem };
    },

    /* Linhas → etapas no formato que o Orçamentista recebe do Importador. */
    paraEtapas: function (linhas) {
      var ordem = [], porNome = {};
      (linhas || []).forEach(function (l) {
        var nome = String(l.etapa || "ESCOPO").trim() || "ESCOPO";
        if (!porNome[nome]) { porNome[nome] = { nome: nome, itens: [] }; ordem.push(porNome[nome]); }
        porNome[nome].itens.push({
          codigo: l.codigo || "", fonte: l.fonte || "", descricao: l.descricao, unidade: l.unidade || "",
          quantidade: Number(l.quantidade) || 0, custoUnitario: 0, formula: l.formula || "",
          parametrico: !!l.parametrico, textoOriginal: l.textoOriginal || ""
        });
      });
      return ordem;
    },

    /* Texto do escopo para conferência (uma linha por serviço, com a conta). */
    resumoTexto: function (r) {
      if (!r || !r.ok) return "";
      return r.linhas.map(function (l) {
        return "[" + l.etapa + "] " + (l.codigo ? l.codigo + " · " : "") + l.descricao + " — " + f2(l.quantidade) + " " + l.unidade;
      }).join("\n");
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = OrcParam;
  global.OrcParam = OrcParam;
})(typeof window !== "undefined" ? window : globalThis);

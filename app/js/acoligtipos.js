/* =====================================================================
 * acoligtipos.js — CATÁLOGO DAS TIPOLOGIAS DE LIGAÇÃO em estrutura de aço
 * (motor de dados PURO, ES5, sem DOM, Node-testável).
 *
 * Cada tipologia diz: o nome em PT-BR, a FAMÍLIA (flexível / rígida /
 * semirrígida — e "reforço" para os complementos), ONDE se aplica, o MEIO
 * (parafusada, soldada, mista), os PARÂMETROS de partida, as LIMITAÇÕES, as
 * VERIFICAÇÕES aplicáveis (itens da ABNT NBR 8800, seção 6 e 5.7), os
 * REFORÇOS possíveis, o custo relativo de fabricação e de montagem e um
 * DESENHO esquemático (SVG em texto, sem escala) para a dica.
 *
 * Quem dimensiona é o js/acoligcalc2.js (campo `calc`); quem desenha no 3D é
 * o js/metalligacao.js (campo `geometria`: a macro e os parâmetros dela).
 * Tipologia sem macro de geometria: `geometria: null` — a tela diz que o
 * desenho no modelo ainda não é automático (nunca um botão que não faz nada).
 *
 * NORMA: a ABNT NBR 8800:2024 (Versão Corrigida:2025) está em vigor; o texto não está na biblioteca da RA. O motor de cálculo usa a
 * formulação da NBR 8800:2008 em tabela, com as mudanças da 2024 que foram
 * confirmadas em fonte secundária (cisalhamento do parafuso 0,45/0,56 e a
 * pressão no concreto) — ver js/acoligcalc.js. Os números de item abaixo são
 * os da 2008 (a numeração da 2024 deve ser conferida no texto): EDICAO.aviso.
 *
 * API
 *   AcoLigTipos.TIPOS            [tipologia…] (ordem de exibição)
 *   AcoLigTipos.obter(id)        tipologia ou null
 *   AcoLigTipos.porAplicacao(ap) tipologias que se aplicam a ap (APLICACOES)
 *   AcoLigTipos.verificacoesDe(id) [{ id, texto, item, norma }]
 *   AcoLigTipos.svg(id)          o desenho (texto SVG) — viewBox 0 0 320 200
 *   AcoLigTipos.APLICACOES, FAMILIAS, VERIF, EDICAO
 * Teste: node tools/test-aco-ligtipos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var EDICAO = {
    norma: "ABNT NBR 8800", vigente: "2024", motor: "2008",
    aviso: "A ABNT NBR 8800:2024 (Versão Corrigida:2025) está em vigor (o texto ainda não está na biblioteca da RA). O motor de ligações usa a formulação da NBR 8800:2008 em tabela, com as mudanças da 2024 confirmadas em fonte secundária (parafuso ao cisalhamento 0,45/0,56; pressão no concreto 0,85·fck/γc ≤ 1,7·fck/γc). Os itens citados são os da 2008 — conferir a numeração e as fórmulas no texto da 2024."
  };

  /* O QUE O CÁLCULO DAS LIGAÇÕES VERIFICA E O QUE NÃO (vai na tela e no memorial — nunca "aprovado" com lacuna escondida) */
  var ESCOPO = {
    verificado: "Parafusos (cisalhamento, tração, interação, pressão de contato e rasgamento entre furos e borda), colapso por rasgamento, chapas e cantoneiras (escoamento da área bruta e ruptura da líquida, flexão, flambagem de chapa comprimida), soldas de filete e de penetração (metal da solda e metal-base), forças localizadas no pilar (flexão local da mesa, escoamento local e enrugamento da alma → enrijecedores), painel da alma (→ chapa de reforço), seção recortada, placa de base (concreto, flexão, chumbadores, ancoragem), gusset (Whitmore), nós tubulares soldados (NBR 16239) e distâncias da Tabela 14 — pelas fórmulas da NBR 8800 citadas em cada passo.",
    naoVerificado: [
      "EFEITO ALAVANCA (NBR 8800:2024) — PENDENTE DO TEXTO: chapas de extremidade dimensionadas SEM alavanca (chapa espessa, a favor do parafuso).",
      "Método novo de PLACA DE BASE da NBR 8800:2024 — PENDENTE DO TEXTO: usado o AISC Design Guide 1 (2ª ed.).",
      "Rigidez rotacional e classificação da ligação (rígida / semirrígida / flexível) — a família é a da tipologia; não calculada.",
      "Fadiga (ponte rolante, máquinas vibratórias) — NBR 8800, Anexo K.",
      "Cone de concreto, bloco/pedestal e armadura de fretagem — projeto de fundação.",
      "Ligações fora do catálogo (perfis T e cantoneiras de mesa tracionados, viga mista, nós tubulares com sobreposição, geometria livre por elementos finitos)."
    ]
  };

  var APLICACOES = {
    "viga-mesa-pilar": "Viga na mesa do pilar",
    "viga-alma-pilar": "Viga na alma do pilar",
    "viga-viga": "Viga em viga (secundária na principal)",
    "emenda-viga": "Emenda de viga",
    "emenda-pilar": "Emenda de pilar",
    "emenda-barra": "Emenda de barra tracionada (cantoneira, U, chapa)",
    "base": "Base de pilar (fundação)",
    "contraventamento": "Contraventamento",
    "no-trelica": "Nó de treliça",
    "tubular": "Ligação tubular (perfis tubulares)",
    "terca": "Terça / travessa",
    "consolo": "Consolo (viga de rolamento)",
    "tirante": "Tirante / pendural"
  };
  var FAMILIAS = {
    flexivel: "Flexível (rotulada): transmite cortante e força normal; o momento é desprezível",
    rigida: "Rígida: transmite o momento sem rotação relativa significativa",
    semirrigida: "Semirrígida: transmite parte do momento, com rotação relativa (rigidez a avaliar)",
    reforco: "Reforço / complemento de outra ligação"
  };

  /* verificações (itens da NBR 8800:2008 — EDICAO.aviso) */
  var VERIF = {
    "paraf-cis": { texto: "Parafusos ao cisalhamento", item: "6.3.3.2", norma: "NBR 8800:2024 (0,45/0,56)" },
    "paraf-tra": { texto: "Parafusos à tração", item: "6.3.3.1", norma: "NBR 8800:2008" },
    "paraf-int": { texto: "Tração + cisalhamento nos parafusos", item: "6.3.3.4", norma: "NBR 8800:2008" },
    "pressao": { texto: "Pressão de contato e rasgamento entre furos e borda", item: "6.3.3.3", norma: "NBR 8800:2008" },
    "bordas": { texto: "Distâncias mínimas entre furos e à borda", item: "6.3.9 a 6.3.11, Tabela 14", norma: "NBR 8800:2008" },
    "rasgamento": { texto: "Colapso por rasgamento (cisalhamento de bloco)", item: "6.5.6", norma: "NBR 8800:2008" },
    "chapa-cis": { texto: "Chapa / cantoneira ao cisalhamento (escoamento da área bruta e ruptura da líquida)", item: "6.5.5", norma: "NBR 8800:2008" },
    "chapa-tra": { texto: "Chapa à tração (escoamento da área bruta e ruptura da líquida)", item: "5.2 e 6.5.3", norma: "NBR 8800:2008" },
    "chapa-comp": { texto: "Chapa à compressão (flambagem)", item: "5.3 e 6.5.4", norma: "NBR 8800:2024 (χ) / 2008" },
    "chapa-flex": { texto: "Chapa à flexão (excentricidade)", item: "6.5 — momento plástico t²·fy/4 por mm", norma: "NBR 8800:2008" },
    "solda-filete": { texto: "Solda de filete (metal da solda e metal-base)", item: "6.2.5, Tabela 8 e Tabela 10", norma: "NBR 8800:2008" },
    "solda-penetracao": { texto: "Solda de penetração total (resistência do metal-base)", item: "6.2.5, Tabela 8", norma: "NBR 8800:2008" },
    "mesa-local": { texto: "Flexão local da mesa do pilar", item: "5.7.2", norma: "NBR 8800:2008" },
    "alma-escoamento": { texto: "Escoamento local da alma", item: "5.7.3", norma: "NBR 8800:2008" },
    "alma-enrugamento": { texto: "Enrugamento da alma", item: "5.7.4", norma: "NBR 8800:2008" },
    "painel": { texto: "Cisalhamento do painel da alma do pilar (→ chapa de reforço ou diagonal)", item: "5.7 — Vpl = 0,60·d·tw·fy/γa1", norma: "NBR 8800:2008" },
    "enrijecedor": { texto: "Enrijecedores (área, esbeltez b/t ≤ 0,56·√(E/fy) e solda)", item: "5.7.9", norma: "NBR 8800:2008" },
    "alma-viga-cis": { texto: "Alma da viga ao cisalhamento na ligação", item: "5.4.3 / 6.5.5", norma: "NBR 8800:2008" },
    "recorte": { texto: "Seção recortada da viga (flexão local no recorte e rasgamento)", item: "6.5.6 + flexão da seção líquida", norma: "NBR 8800:2008" },
    "concreto": { texto: "Pressão no concreto sob a placa", item: "6.6", norma: "NBR 8800:2024" },
    "placa-flex": { texto: "Placa de base à flexão", item: "AISC Design Guide 1 (2ª ed.)", norma: "Guia 1" },
    "chumbador": { texto: "Chumbadores (tração, cisalhamento, interação, ancoragem)", item: "6.3.3 + NBR 6118 9.4.2", norma: "NBR 8800:2008 / NBR 6118" },
    "whitmore": { texto: "Gusset na seção de Whitmore (tração e flambagem)", item: "5.2, 5.3 e 6.5 (largura de Whitmore, 30°)", norma: "NBR 8800:2008" },
    "shear-lag": { texto: "Área líquida efetiva da diagonal (Ct)", item: "5.2.5", norma: "NBR 8800:2008" },
    "tubo-no": { texto: "Nó soldado de perfis tubulares (plastificação da face do banzo, punção)", item: "NBR 16239:2013 (formulação do EN 1993-1-8:2005, cap. 7)", norma: "NBR 16239:2013" },
    "barra-redonda": { texto: "Barra redonda: fuste, rosca e chapa de apoio", item: "5.2 e 6.3.3.1", norma: "NBR 8800:2008" },
    "chapa-fina": { texto: "Pressão de contato em chapa fina (perfil formado a frio)", item: "NBR 14762:2010 (ligações parafusadas)", norma: "NBR 14762:2010" }
  };

  /* custos relativos: 1 = baixo, 2 = médio, 3 = alto */
  function T(o) { return o; }
  var TIPOS = [
    /* ------------------------------------------------ viga → pilar / viga → viga: FLEXÍVEIS */
    T({ id: "cant-dupla-paraf", nome: "Cantoneira dupla na alma — parafusada", familia: "flexivel", meio: "parafusada",
        aplicacoes: ["viga-mesa-pilar", "viga-alma-pilar", "viga-viga"], calc: "cantoneiraDupla", geometria: { macro: "cantoneiraDupla" },
        parametros: [["cat", "Cantoneira", "L89X89X7.9"], ["parafuso", "Parafuso", "M20"], ["linhas", "Linhas de parafusos", "auto"]],
        limitacoes: ["Altura útil da alma (d − 2·(tf + r) − 20 mm) precisa caber o número de linhas.", "Na alma do pilar: a viga tem de caber entre as mesas (bf da viga ≤ d − 2tf do pilar)."],
        verificacoes: ["paraf-cis", "pressao", "bordas", "chapa-cis", "rasgamento", "alma-viga-cis"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "boa (as abas flexionam)",
        dica: "A ligação flexível mais usada: duas cantoneiras abraçam a alma da viga; tudo parafusado, montagem rápida e tolerante.", desenho: { cena: "vp", el: "cantDupla" } }),
    T({ id: "cant-dupla-sold-paraf", nome: "Cantoneira dupla — soldada na viga, parafusada no apoio", familia: "flexivel", meio: "mista",
        aplicacoes: ["viga-mesa-pilar", "viga-alma-pilar", "viga-viga"], calc: "cantoneiraDupla", calcPar: { soldadaNaViga: true }, geometria: { macro: "cantoneiraDupla" },
        parametros: [["cat", "Cantoneira", "L89X89X7.9"], ["parafuso", "Parafuso", "M20"], ["solda", "Perna do filete (mm)", "auto"]],
        limitacoes: ["Solda de fábrica na alma da viga (filete em C nas abas); no apoio, parafusos.", "O 3D desenha as cantoneiras e os furos do apoio; a solda da alma vai no desenho de fabricação."],
        verificacoes: ["solda-filete", "paraf-cis", "pressao", "bordas", "chapa-cis", "rasgamento"], reforcos: [],
        fabricacao: 2, montagem: 1, custo: 1, rotacao: "boa",
        dica: "Cantoneiras soldadas na fábrica na alma da viga: menos furos, montagem só com os parafusos do apoio.", desenho: { cena: "vp", el: "cantDupla", solda: true } }),
    T({ id: "cant-simples", nome: "Cantoneira simples na alma", familia: "flexivel", meio: "parafusada",
        aplicacoes: ["viga-mesa-pilar", "viga-alma-pilar", "viga-viga"], calc: "cantoneiraSimples", geometria: { macro: "cantoneiraDupla", par: { simples: true } },
        parametros: [["cat", "Cantoneira", "L102X102X9.5"], ["parafuso", "Parafuso", "M20"]],
        limitacoes: ["Excentricidade no apoio: o grupo de parafusos e a aba fletem (verificado pelo método elástico).", "Para vigas leves e reações pequenas; acesso de um lado só."],
        verificacoes: ["paraf-cis", "pressao", "bordas", "chapa-cis", "chapa-flex", "rasgamento"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "boa",
        dica: "Uma cantoneira só, de um lado da alma: barata e com acesso por um lado; serve para reações pequenas.", desenho: { cena: "vp", el: "cantSimples" } }),
    T({ id: "chapa-simples", nome: "Chapa simples de cisalhamento (soldada no apoio)", familia: "flexivel", meio: "mista",
        aplicacoes: ["viga-mesa-pilar", "viga-alma-pilar", "viga-viga"], calc: "chapaSimples", geometria: { macro: "chapaSimples" },
        parametros: [["t", "Espessura da chapa (mm)", "auto"], ["parafuso", "Parafuso", "M20"], ["a", "Distância da solda à linha de parafusos (mm)", 75]],
        limitacoes: ["Ductilidade: chapa com t ≤ db/2 + 1,6 mm (ou a alma da viga) — regra de prática corrente de ligação flexível.", "Uma linha vertical de 2 a 9 parafusos; excentricidade pelo método elástico (a favor)."],
        verificacoes: ["paraf-cis", "pressao", "bordas", "chapa-cis", "chapa-flex", "rasgamento", "solda-filete"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "boa (furo padrão; chapa fina)",
        dica: "Uma chapa soldada na fábrica no pilar (ou na viga principal) e a viga aparafusada nela: a mais econômica para reação média.", desenho: { cena: "vp", el: "chapaSimples" } }),
    T({ id: "chapa-dupla", nome: "Tala dupla de alma (duas chapas soldadas no apoio)", familia: "flexivel", meio: "mista",
        aplicacoes: ["viga-mesa-pilar", "viga-alma-pilar", "viga-viga"], calc: "chapaDupla", geometria: { macro: "chapaSimples", par: { dupla: true } },
        parametros: [["t", "Espessura de cada chapa (mm)", "auto"], ["parafuso", "Parafuso", "M20"]],
        limitacoes: ["Parafusos em dois planos de corte: reação maior que a chapa simples com o mesmo parafuso.", "A viga entra entre as duas chapas: montagem de cima para baixo (folga)."],
        verificacoes: ["paraf-cis", "pressao", "bordas", "chapa-cis", "chapa-flex", "rasgamento", "solda-filete", "alma-viga-cis"], reforcos: [],
        fabricacao: 2, montagem: 2, custo: 2, rotacao: "boa",
        dica: "Duas talas abraçam a alma da viga: os parafusos trabalham em dois planos.", desenho: { cena: "vp", el: "chapaSimples", dupla: true } }),
    T({ id: "chapa-topo-curta", nome: "Chapa de topo curta (flexível)", familia: "flexivel", meio: "mista",
        aplicacoes: ["viga-mesa-pilar", "viga-alma-pilar", "viga-viga"], calc: "chapaTopoCurta", geometria: { macro: "chapaExtremidade", par: { ext: 0, curta: true, papel: "Chapa de topo curta" } },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Parafuso", "M20"], ["gage", "Gabarito (mm)", "≥ 90"]],
        limitacoes: ["Chapa só na altura da alma, soldada na alma (sem soldar as mesas): flexível com t ≤ 10 mm e gabarito ≥ 90 mm (prática corrente).", "A viga precisa ter o comprimento exato (sem folga de montagem)."],
        verificacoes: ["paraf-cis", "pressao", "bordas", "chapa-cis", "rasgamento", "solda-filete", "alma-viga-cis"], reforcos: [],
        fabricacao: 2, montagem: 2, custo: 1, rotacao: "média (chapa fina e gabarito largo)",
        dica: "Chapa curta soldada só na alma da viga: rotula pela flexão da chapa; comprimento da viga sem folga.", desenho: { cena: "vp", el: "chapaTopoCurta" } }),
    T({ id: "cant-assento", nome: "Cantoneira de assento (sem enrijecedor) + cantoneira de topo", familia: "flexivel", meio: "parafusada",
        aplicacoes: ["viga-mesa-pilar", "viga-alma-pilar"], calc: "cantoneiraAssento", geometria: { macro: "assento" },
        parametros: [["cat", "Cantoneira de assento", "L102X102X12.7"], ["parafuso", "Parafuso", "M20"]],
        limitacoes: ["Para reações pequenas a médias; a viga apoia na aba (alma da viga ao escoamento local e ao enrugamento).", "A cantoneira de topo só estabiliza (não leva carga)."],
        verificacoes: ["alma-escoamento", "alma-enrugamento", "chapa-flex", "paraf-cis", "pressao", "bordas"], reforcos: ["enrijecedor do assento"],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "boa",
        dica: "A viga senta numa cantoneira presa no pilar: montagem fácil (a viga apoia antes de parafusar).", desenho: { cena: "vp", el: "assento" } }),
    T({ id: "cant-assento-enrij", nome: "Assento enrijecido (chapa de assento + enrijecedor)", familia: "flexivel", meio: "mista",
        aplicacoes: ["viga-mesa-pilar", "viga-alma-pilar"], calc: "cantoneiraAssento", calcPar: { enrijecido: true }, geometria: null,
        parametros: [["t", "Espessura do enrijecedor (mm)", "auto"], ["parafuso", "Parafuso", "M20"]],
        limitacoes: ["Para reações maiores que a cantoneira simples aguenta; o enrijecedor é soldado na chapa de assento.", "Na alma do pilar delgada, conferir a flexão local da alma (não verificado)."],
        verificacoes: ["alma-escoamento", "alma-enrugamento", "enrijecedor", "solda-filete", "paraf-cis", "pressao"], reforcos: [],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "boa",
        dica: "Assento com enrijecedor vertical: leva reação grande com a mesma montagem fácil.", desenho: { cena: "vp", el: "assentoEnrij" } }),

    /* ------------------------------------------------ viga → pilar: RÍGIDAS / SEMIRRÍGIDAS */
    T({ id: "chapa-ext-estendida", nome: "Chapa de extremidade estendida", familia: "rigida", meio: "mista",
        aplicacoes: ["viga-mesa-pilar"], calc: "chapaExtendida", geometria: { macro: "chapaExtremidade", par: { usarExt: true } },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Parafuso", "auto (M16 a M30)"], ["ext", "Extensão além da mesa (mm)", "auto"]],
        limitacoes: ["Momento num sentido predominante (pórtico de galpão); a chapa estende do lado tracionado (os dois lados quando o momento inverte).", "Chapa dimensionada sem efeito alavanca (chapa espessa) — a NBR 8800:2024 mudou o método (conferir)."],
        verificacoes: ["paraf-tra", "paraf-cis", "paraf-int", "pressao", "rasgamento", "chapa-flex", "solda-penetracao", "solda-filete", "mesa-local", "alma-escoamento", "alma-enrugamento", "painel", "bordas"], reforcos: ["enrijecedor de continuidade", "chapa de reforço da alma", "diagonal no painel"],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "rígida",
        dica: "A ligação de momento parafusada mais usada em pórtico: tudo soldado na fábrica, só parafuso na obra.", desenho: { cena: "vp", el: "chapaEst" } }),
    T({ id: "chapa-ext-estendida-enrij", nome: "Chapa de extremidade estendida com enrijecedores no pilar", familia: "rigida", meio: "mista",
        aplicacoes: ["viga-mesa-pilar"], calc: "chapaExtendida", calcPar: { comEnrijecedor: true }, geometria: { macro: "chapaExtremidade", par: { usarExt: true }, enrijecedores: true },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Parafuso", "auto"], ["tEnr", "Espessura dos enrijecedores (mm)", "≥ tf da viga"]],
        limitacoes: ["Enrijecedores de continuidade no pilar na altura das mesas da viga (pares, soldados na alma e nas mesas)."],
        verificacoes: ["paraf-tra", "paraf-cis", "paraf-int", "pressao", "chapa-flex", "solda-penetracao", "mesa-local", "alma-escoamento", "alma-enrugamento", "enrijecedor", "painel"], reforcos: ["chapa de reforço da alma"],
        fabricacao: 3, montagem: 1, custo: 2, rotacao: "rígida",
        dica: "Quando a mesa ou a alma do pilar não aguentam a força da mesa da viga: enrijecedores de continuidade.", desenho: { cena: "vp", el: "chapaEst", enrij: true } }),
    T({ id: "chapa-ext-ajustada", nome: "Chapa de extremidade ajustada (faceada)", familia: "semirrigida", meio: "mista",
        aplicacoes: ["viga-mesa-pilar", "emenda-viga"], calc: "chapaAjustada", geometria: { macro: "chapaExtremidade", par: { ext: 0 } },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Parafuso", "auto"]],
        limitacoes: ["Parafusos só entre as mesas: braço menor, momento menor; costuma ser semirrígida (rigidez a avaliar pelo projeto).", "Útil quando a chapa não pode sair da altura da viga (laje, forro)."],
        verificacoes: ["paraf-tra", "paraf-cis", "paraf-int", "pressao", "chapa-flex", "solda-penetracao", "mesa-local", "alma-escoamento", "alma-enrugamento", "painel"], reforcos: ["enrijecedor de continuidade"],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "semirrígida",
        dica: "Chapa do tamanho da viga, parafusos só por dentro das mesas: limpa, mas transmite menos momento.", desenho: { cena: "vp", el: "chapaAjust" } }),
    T({ id: "chapa-ext-ajustada-enrij", nome: "Chapa de extremidade ajustada com enrijecedores", familia: "semirrigida", meio: "mista",
        aplicacoes: ["viga-mesa-pilar"], calc: "chapaAjustada", calcPar: { comEnrijecedor: true }, geometria: { macro: "chapaExtremidade", par: { ext: 0 }, enrijecedores: true },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Parafuso", "auto"]],
        limitacoes: ["Como a ajustada, com enrijecedores de continuidade no pilar."],
        verificacoes: ["paraf-tra", "paraf-cis", "chapa-flex", "mesa-local", "alma-escoamento", "enrijecedor", "painel"], reforcos: [],
        fabricacao: 3, montagem: 1, custo: 2, rotacao: "semirrígida a rígida",
        dica: "Ajustada com enrijecedores no pilar.", desenho: { cena: "vp", el: "chapaAjust", enrij: true } }),
    T({ id: "talas-mesa-paraf", nome: "Talas de mesa parafusadas + chapa simples na alma", familia: "rigida", meio: "mista",
        aplicacoes: ["viga-mesa-pilar"], calc: "talasMesa", calcPar: { meio: "parafusada" }, geometria: { macro: "talasMesa" },
        parametros: [["t", "Espessura das talas (mm)", "auto"], ["parafuso", "Parafuso", "M20"]],
        limitacoes: ["Talas soldadas no pilar (fábrica) e parafusadas nas mesas da viga (obra): muitos furos nas mesas; a alma leva chapa simples.", "A tala comprimida é verificada à flambagem (K = 0,65 entre a face do pilar e o 1º parafuso)."],
        verificacoes: ["chapa-tra", "chapa-comp", "paraf-cis", "pressao", "rasgamento", "solda-penetracao", "mesa-local", "alma-escoamento", "alma-enrugamento", "painel"], reforcos: ["enrijecedor de continuidade", "chapa de reforço da alma"],
        fabricacao: 2, montagem: 2, custo: 2, rotacao: "rígida",
        dica: "Duas chapas (talas) ligam as mesas da viga ao pilar e levam o binário do momento.", desenho: { cena: "vp", el: "talas" } }),
    T({ id: "talas-mesa-sold", nome: "Talas de mesa soldadas", familia: "rigida", meio: "soldada",
        aplicacoes: ["viga-mesa-pilar"], calc: "talasMesa", calcPar: { meio: "soldada" }, geometria: { macro: "talasMesa", par: { soldada: true } },
        parametros: [["t", "Espessura das talas (mm)", "auto"], ["solda", "Perna do filete (mm)", "auto"]],
        limitacoes: ["Solda de campo nas mesas da viga (posição sobrecabeça na de baixo): exige inspeção."],
        verificacoes: ["chapa-tra", "chapa-comp", "solda-filete", "solda-penetracao", "mesa-local", "alma-escoamento", "alma-enrugamento", "painel"], reforcos: ["enrijecedor de continuidade", "chapa de reforço da alma"],
        fabricacao: 2, montagem: 3, custo: 2, rotacao: "rígida",
        dica: "Talas soldadas às mesas da viga: sem furos, mas com solda na obra.", desenho: { cena: "vp", el: "talas", solda: true } }),
    T({ id: "soldada-direta", nome: "Viga soldada direto no pilar (penetração total) com enrijecedores de continuidade", familia: "rigida", meio: "soldada",
        aplicacoes: ["viga-mesa-pilar"], calc: "soldadaDireta", geometria: { macro: "soldadaDireta" },
        parametros: [["solda", "Mesas: penetração total; alma: filete", "auto"]],
        limitacoes: ["Solda de penetração total das mesas: inspeção por ultrassom; sem tolerância de montagem. No 3D: a viga encosta no pilar (abertura da raiz 6 mm) com mata-juntas nas mesas; a solda vai no desenho de fabricação.", "Indicada para estrutura soldada na fábrica (pórtico pré-montado) ou com solda de campo controlada."],
        verificacoes: ["solda-penetracao", "solda-filete", "mesa-local", "alma-escoamento", "alma-enrugamento", "enrijecedor", "painel"], reforcos: ["enrijecedor de continuidade", "chapa de reforço da alma"],
        fabricacao: 2, montagem: 3, custo: 2, rotacao: "rígida",
        dica: "A ligação mais rígida e de menos peças: a viga soldada inteira na mesa do pilar.", desenho: { cena: "vp", el: "soldada", enrij: true } }),
    T({ id: "misula", nome: "Mísula na viga (com chapa de extremidade)", familia: "rigida", meio: "mista",
        aplicacoes: ["viga-mesa-pilar"], calc: "misula", geometria: { macro: "misula" },
        parametros: [["hm", "Altura da mísula (mm)", "auto (0,5·d a 1,0·d)"], ["Lm", "Comprimento (mm)", "auto"]],
        limitacoes: ["Aumenta o braço do binário quando a chapa estendida não basta; modelo simplificado (viga equivalente de altura d + hm) — conferir.", "Ocupa altura abaixo da viga (pé-direito livre)."],
        verificacoes: ["paraf-tra", "paraf-cis", "chapa-flex", "solda-penetracao", "mesa-local", "alma-escoamento", "painel"], reforcos: ["enrijecedor de continuidade"],
        fabricacao: 3, montagem: 1, custo: 3, rotacao: "rígida",
        dica: "Um trecho mais alto na ponta da viga: mais braço, menos força nos parafusos.", desenho: { cena: "vp", el: "misula" } }),
    T({ id: "reforco-alma-pilar", nome: "Chapa de reforço da alma do pilar (painel)", familia: "reforco", meio: "soldada",
        aplicacoes: ["viga-mesa-pilar"], calc: "painelAlma", geometria: { macro: null, reforco: true },
        parametros: [["t", "Espessura da chapa de reforço (mm)", "auto"]],
        limitacoes: ["Complemento das ligações rígidas quando o painel da alma do pilar não resiste ao cisalhamento do binário.", "Soldada na alma (e nas mesas) do pilar; alternativa: diagonal no painel."],
        verificacoes: ["painel", "solda-filete"], reforcos: [],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "—",
        dica: "Chapa colada na alma do pilar para o painel do nó não escoar por cisalhamento.", desenho: { cena: "vp", el: "doubler" } }),
    T({ id: "enrijecedor-continuidade", nome: "Enrijecedores de continuidade no pilar", familia: "reforco", meio: "soldada",
        aplicacoes: ["viga-mesa-pilar"], calc: "enrijecedorContinuidade", geometria: { macro: null, enrijecedores: true },
        parametros: [["t", "Espessura (mm)", "≥ tf da viga"], ["x", "Posição", "altura das mesas da viga"]],
        limitacoes: ["Pares de chapas na altura das mesas da viga, soldados na alma e nas mesas do pilar."],
        verificacoes: ["enrijecedor", "mesa-local", "alma-escoamento", "alma-enrugamento"], reforcos: [],
        fabricacao: 2, montagem: 1, custo: 1, rotacao: "—",
        dica: "Continuam a mesa da viga através do pilar: resolvem a flexão local da mesa e o escoamento da alma.", desenho: { cena: "vp", el: "enrij" } }),

    /* ------------------------------------------------ viga → viga */
    T({ id: "viga-viga-recorte-cant", nome: "Viga em viga com recorte da mesa + cantoneira dupla", familia: "flexivel", meio: "parafusada",
        aplicacoes: ["viga-viga"], calc: "vigaRecortada", calcPar: { conector: "cantoneiraDupla" }, geometria: { macro: "cantoneiraDupla" },
        parametros: [["dc", "Altura do recorte (mm)", "auto (tf da principal + 15)"], ["c", "Comprimento do recorte (mm)", "auto"], ["cat", "Cantoneira", "L89X89X7.9"]],
        limitacoes: ["Topo das vigas no mesmo nível: a mesa da secundária é recortada (marcar no desenho de fabricação — o 3D não recorta).", "Seção recortada: flexão local e rasgamento verificados; flambagem local da alma recortada só aviso quando c > 2·d."],
        verificacoes: ["recorte", "rasgamento", "paraf-cis", "pressao", "chapa-cis", "bordas"], reforcos: ["enrijecedor da alma recortada"],
        fabricacao: 2, montagem: 1, custo: 1, rotacao: "boa",
        dica: "Secundária no mesmo nível da principal: recorta-se a mesa e liga-se a alma por cantoneiras.", desenho: { cena: "vv", el: "cantDupla", recorte: true } }),
    T({ id: "viga-viga-recorte-chapa", nome: "Viga em viga com recorte + chapa simples", familia: "flexivel", meio: "mista",
        aplicacoes: ["viga-viga"], calc: "vigaRecortada", calcPar: { conector: "chapaSimples" }, geometria: { macro: "chapaSimples" },
        parametros: [["dc", "Altura do recorte (mm)", "auto"], ["t", "Espessura da chapa (mm)", "auto"]],
        limitacoes: ["Chapa soldada na alma da principal (fábrica); recorte da mesa marcado no desenho de fabricação."],
        verificacoes: ["recorte", "rasgamento", "paraf-cis", "pressao", "chapa-cis", "chapa-flex", "solda-filete"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "boa",
        dica: "A mais econômica para vigas de piso no mesmo nível.", desenho: { cena: "vv", el: "chapaSimples", recorte: true } }),
    T({ id: "viga-viga-chapa-topo", nome: "Viga em viga com chapa de topo curta (sem recorte)", familia: "flexivel", meio: "mista",
        aplicacoes: ["viga-viga"], calc: "chapaTopoCurta", geometria: { macro: "chapaExtremidade", par: { ext: 0, curta: true, papel: "Chapa de topo curta" } },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Parafuso", "M20"]],
        limitacoes: ["Secundária mais baixa que a altura livre da alma da principal (sem recorte)."],
        verificacoes: ["paraf-cis", "pressao", "chapa-cis", "rasgamento", "solda-filete"], reforcos: [],
        fabricacao: 2, montagem: 2, custo: 1, rotacao: "média",
        dica: "Secundária mais baixa que a principal: chapa de topo curta, sem recorte.", desenho: { cena: "vv", el: "chapaTopoCurta" } }),

    /* ------------------------------------------------ emendas */
    T({ id: "emenda-viga-talas-paraf", nome: "Emenda de viga por talas (alma e mesas) parafusadas", familia: "rigida", meio: "parafusada",
        aplicacoes: ["emenda-viga"], calc: "emendaVigaTalas", calcPar: { meio: "parafusada" }, geometria: { macro: "emendaCobrejunta" },
        parametros: [["tMesa", "Talas das mesas (mm)", "auto"], ["tAlma", "Talas da alma (mm)", "auto"], ["parafuso", "Parafuso", "M20"]],
        limitacoes: ["As mesas levam o momento (binário) e a alma leva a cortante (com a excentricidade do grupo) — a favor.", "Fazer a emenda perto do ponto de momento pequeno quando possível."],
        verificacoes: ["paraf-cis", "pressao", "rasgamento", "chapa-tra", "chapa-comp", "bordas"], reforcos: [],
        fabricacao: 2, montagem: 2, custo: 2, rotacao: "contínua",
        dica: "Talas dos dois lados da emenda: continuidade total sem solda na obra.", desenho: { cena: "emenda", el: "talas" } }),
    T({ id: "emenda-viga-talas-sold", nome: "Emenda de viga por talas soldadas", familia: "rigida", meio: "soldada",
        aplicacoes: ["emenda-viga"], calc: "emendaVigaTalas", calcPar: { meio: "soldada" }, geometria: null,
        parametros: [["tMesa", "Talas das mesas (mm)", "auto"], ["solda", "Perna (mm)", "auto"]],
        limitacoes: ["Solda de campo: inspeção visual e por líquido penetrante no mínimo."],
        verificacoes: ["solda-filete", "chapa-tra", "chapa-comp"], reforcos: [],
        fabricacao: 1, montagem: 3, custo: 2, rotacao: "contínua",
        dica: "Talas soldadas: sem furos, mas solda na obra.", desenho: { cena: "emenda", el: "talas", solda: true } }),
    T({ id: "emenda-viga-chapa-topo", nome: "Emenda de viga por chapas de topo (cumeeira)", familia: "rigida", meio: "mista",
        aplicacoes: ["emenda-viga"], calc: "chapaCumeeira", geometria: { macro: "chapaExtremidade", par: { usarExt: true } },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Parafuso", "auto"]],
        limitacoes: ["Duas chapas soldadas nas pontas, aparafusadas entre si: emenda de cumeeira e de transporte."],
        verificacoes: ["paraf-tra", "paraf-cis", "paraf-int", "pressao", "chapa-flex", "solda-penetracao", "solda-filete"], reforcos: [],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "rígida",
        dica: "A emenda de cumeeira do pórtico: duas chapas de topo aparafusadas.", desenho: { cena: "emenda", el: "chapaTopo" } }),
    T({ id: "emenda-tracao-talas", nome: "Emenda de barra tracionada por talas (cantoneira, U ou chapa)", familia: "flexivel", meio: "parafusada",
        aplicacoes: ["emenda-barra", "contraventamento", "tirante"], calc: "emendaTracao", geometria: null,
        parametros: [["t", "Espessura da tala (mm)", "auto"], ["parafuso", "Parafuso", "M16"]],
        limitacoes: ["Barra com força normal (banzo de treliça, diagonal, tirante): a tala na aba ligada (cantoneira, U) ou dos dois lados (chapa).", "Área líquida efetiva com Ct (NBR 8800, 5.2.5)."],
        verificacoes: ["paraf-cis", "pressao", "shear-lag", "chapa-tra", "rasgamento", "bordas"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "contínua (axial)",
        dica: "Emenda de cantoneira, U ou chapa tracionada com talas aparafusadas.", desenho: { cena: "emenda", el: "talas" } }),
    T({ id: "emenda-pilar-talas", nome: "Emenda de pilar por talas (com contato)", familia: "rigida", meio: "parafusada",
        aplicacoes: ["emenda-pilar"], calc: "emendaPilarTalas", geometria: { macro: "emendaCobrejunta" },
        parametros: [["tMesa", "Talas das mesas (mm)", "auto"], ["parafuso", "Parafuso", "M20"]],
        limitacoes: ["Faces de contato usinadas/serradas em esquadro: a compressão passa por contato; as talas levam a tração da mesa (momento) e o mínimo da premissa (50 % da compressão — prática da AISC 360-16, J1.4(b); conferir na NBR 8800).", "Pilares de alturas (d) diferentes: chapas de enchimento (não automático)."],
        verificacoes: ["paraf-cis", "pressao", "chapa-tra", "rasgamento", "bordas"], reforcos: [],
        fabricacao: 2, montagem: 2, custo: 2, rotacao: "contínua",
        dica: "Emenda acima do piso (≈ 1 m): talas nas mesas e na alma, contato pleno nas pontas.", desenho: { cena: "emendaPilar", el: "talas" } }),
    T({ id: "emenda-pilar-chapa-topo", nome: "Emenda de pilar por chapas de topo", familia: "rigida", meio: "mista",
        aplicacoes: ["emenda-pilar"], calc: "emendaPilarChapa", geometria: { macro: "chapaExtremidade", par: { usarExt: true, emenda: true } },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Parafuso", "auto"]],
        limitacoes: ["Útil na troca de perfil (pilar de cima menor): a chapa faz a transição."],
        verificacoes: ["paraf-tra", "paraf-cis", "chapa-flex", "solda-filete"], reforcos: [],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "rígida",
        dica: "Duas chapas de topo aparafusadas: emenda rápida e transição de perfil.", desenho: { cena: "emendaPilar", el: "chapaTopo" } }),
    T({ id: "emenda-pilar-soldada", nome: "Emenda de pilar soldada (penetração total)", familia: "rigida", meio: "soldada",
        aplicacoes: ["emenda-pilar"], calc: "emendaPilarSoldada", geometria: null,
        parametros: [["solda", "Penetração total nas mesas e na alma", "—"]],
        limitacoes: ["Solda de campo com chanfro e inspeção por ultrassom; usar cantoneiras de montagem provisórias."],
        verificacoes: ["solda-penetracao"], reforcos: [],
        fabricacao: 1, montagem: 3, custo: 2, rotacao: "contínua",
        dica: "Emenda soldada: a seção inteira continua; exige solda qualificada na obra.", desenho: { cena: "emendaPilar", el: "soldada" } }),

    /* ------------------------------------------------ bases */
    T({ id: "base-rotulada", nome: "Placa de base rotulada (chumbadores pré-instalados)", familia: "flexivel", meio: "mista",
        aplicacoes: ["base"], calc: "placaBase", calcPar: { tipo: "rotulada" }, geometria: { macro: "placaBase" },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Chumbador", "auto (3/4\" mínimo)"]],
        limitacoes: ["4 chumbadores com gancho, furo alargado na placa e graute sem retração.", "Cone de concreto e bloco: projeto de fundação."],
        verificacoes: ["concreto", "placa-flex", "chumbador", "solda-filete"], reforcos: ["barra de cisalhamento"],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "rotulada (fundação mais leve)",
        dica: "Base articulada: a fundação recebe só força, sem momento.", desenho: { cena: "base", el: "rotulada" } }),
    T({ id: "base-engastada", nome: "Placa de base engastada (sem enrijecedores)", familia: "rigida", meio: "mista",
        aplicacoes: ["base"], calc: "placaBase", calcPar: { tipo: "engastada" }, geometria: { macro: "placaBase" },
        parametros: [["t", "Espessura (mm)", "auto"], ["parafuso", "Chumbador", "auto"]],
        limitacoes: ["Chumbadores nas extremidades da direção do momento (2 a 4 por lado); placa grossa quando o momento é alto."],
        verificacoes: ["concreto", "placa-flex", "chumbador", "solda-filete", "solda-penetracao"], reforcos: ["nervuras (enrijecedores)", "barra de cisalhamento"],
        fabricacao: 1, montagem: 1, custo: 2, rotacao: "engastada",
        dica: "Base de momento: deixa o pórtico mais rígido; a fundação recebe o momento.", desenho: { cena: "base", el: "engastada" } }),
    T({ id: "base-engastada-enrij", nome: "Placa de base engastada com enrijecedores (nervuras)", familia: "rigida", meio: "soldada",
        aplicacoes: ["base"], calc: "placaBaseEnrijecida", geometria: { macro: "placaBase" },
        parametros: [["hs", "Altura das nervuras (mm)", "auto"], ["ts", "Espessura das nervuras (mm)", "auto"]],
        limitacoes: ["Nervuras no prolongamento das mesas reduzem o balanço da placa: placa mais fina; modelo simplificado (balanço reduzido) — conferir.", "O 3D desenha a placa e os chumbadores; as nervuras vão no desenho de fabricação."],
        verificacoes: ["concreto", "placa-flex", "chumbador", "enrijecedor", "solda-filete"], reforcos: [],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "engastada",
        dica: "Momento alto na base: nervuras soldadas no pilar e na placa.", desenho: { cena: "base", el: "enrijecida" } }),
    T({ id: "base-barra-cisalhamento", nome: "Placa de base com barra de cisalhamento", familia: "reforco", meio: "soldada",
        aplicacoes: ["base"], calc: "barraCisalhamento", geometria: null,
        parametros: [["bl", "Largura da barra (mm)", "auto"], ["hl", "Altura embutida (mm)", "auto"]],
        limitacoes: ["Leva a força horizontal por contato no concreto (nicho grauteado); os chumbadores ficam só à tração.", "O arrancamento do concreto à frente da barra é do projeto de fundação."],
        verificacoes: ["concreto", "chapa-flex", "solda-filete"], reforcos: [],
        fabricacao: 1, montagem: 2, custo: 1, rotacao: "—",
        dica: "Quando a cortante na base passa do que os chumbadores aguentam.", desenho: { cena: "base", el: "lug" } }),
    T({ id: "base-chumbador-quimico", nome: "Placa de base com chumbador químico (pós-instalado)", familia: "flexivel", meio: "mista",
        aplicacoes: ["base"], calc: "chumbadorQuimico", geometria: { macro: "placaBase" },
        parametros: [["parafuso", "Barra roscada", "auto"], ["hef", "Embutimento (mm)", "dado do fabricante"]],
        limitacoes: ["Para fundação existente: o aço da barra é verificado; a aderência do adesivo e o cone de concreto são dados do fabricante (avaliação técnica) — NÃO verificados aqui."],
        verificacoes: ["concreto", "placa-flex", "chumbador"], reforcos: [],
        fabricacao: 1, montagem: 2, custo: 2, rotacao: "rotulada",
        dica: "Base sobre bloco existente: furo, limpeza e adesivo; a resistência vem do catálogo do fabricante.", desenho: { cena: "base", el: "quimico" } }),

    /* ------------------------------------------------ contraventamento, treliça, tubular */
    T({ id: "gusset-contravento-no", nome: "Gusset de contraventamento no nó viga-pilar", familia: "flexivel", meio: "mista",
        aplicacoes: ["contraventamento"], calc: "gussetContravento", geometria: { macro: "contraventamento" },
        parametros: [["t", "Espessura do gusset (mm)", "auto"], ["parafuso", "Parafuso", "M16"], ["parafusos", "Parafusos na diagonal", "auto"]],
        limitacoes: ["Gusset soldado no apoio (fábrica), diagonal aparafusada; a força da diagonal é a do cálculo (tração e compressão)."],
        verificacoes: ["paraf-cis", "pressao", "rasgamento", "whitmore", "chapa-comp", "shear-lag", "solda-filete", "bordas"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "articulada",
        dica: "A chapa onde a diagonal chega: a força se espalha a 30° (largura de Whitmore).", desenho: { cena: "cv", el: "no" } }),
    T({ id: "gusset-contravento-meio", nome: "Gusset de contraventamento no meio do vão (V / V invertido)", familia: "flexivel", meio: "mista",
        aplicacoes: ["contraventamento"], calc: "gussetContravento", geometria: { macro: "contraventamento" },
        parametros: [["t", "Espessura do gusset (mm)", "auto"], ["parafuso", "Parafuso", "M16"]],
        limitacoes: ["Duas diagonais no meio da viga: a viga recebe a diferença das componentes verticais (verificar a viga no cálculo da estrutura)."],
        verificacoes: ["paraf-cis", "pressao", "rasgamento", "whitmore", "chapa-comp", "solda-filete"], reforcos: ["enrijecedor da viga no gusset"],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "articulada",
        dica: "Contraventamento em V: as duas diagonais chegam num gusset na viga.", desenho: { cena: "cv", el: "meio" } }),
    T({ id: "gusset-tubo-lingua", nome: "Diagonal tubular com chapa de língua (tubo fendido soldado)", familia: "flexivel", meio: "soldada",
        aplicacoes: ["contraventamento", "tubular"], calc: "gussetTubo", geometria: null,
        parametros: [["t", "Espessura da chapa de língua (mm)", "auto"], ["Lw", "Comprimento das soldas (mm)", "≥ D"]],
        limitacoes: ["O tubo é fendido e soldado nas duas faces da chapa (4 filetes); comprimento de solda ≥ D (Ct da NBR 8800, 5.2.5 — conferir).", "Ponta do tubo fechada (tampa) contra água."],
        verificacoes: ["solda-filete", "chapa-cis", "shear-lag", "whitmore", "chapa-comp"], reforcos: [],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "articulada",
        dica: "Diagonal de tubo: a ponta é fendida e soldada sobre a chapa (língua) que vai no gusset.", desenho: { cena: "cv", el: "lingua" } }),
    T({ id: "contravento-cruz", nome: "Cruzamento de diagonais em X (emenda da diagonal interrompida)", familia: "flexivel", meio: "parafusada",
        aplicacoes: ["contraventamento"], calc: "emendaTracao", calcPar: { cruz: true }, geometria: null,
        parametros: [["parafuso", "Parafuso", "M16"]],
        limitacoes: ["Uma diagonal passa contínua; a outra é interrompida e emendada por talas; um parafuso no cruzamento trava as duas fora do plano."],
        verificacoes: ["paraf-cis", "pressao", "shear-lag", "chapa-tra", "rasgamento"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "articulada",
        dica: "No X do contraventamento, as diagonais se cruzam com uma emenda e um parafuso de travamento.", desenho: { cena: "cv", el: "cruz" } }),
    T({ id: "contravento-barra-redonda", nome: "Contraventamento em barra redonda (rosca, porca e chapa de apoio)", familia: "flexivel", meio: "mista",
        aplicacoes: ["contraventamento", "tirante"], calc: "barraRedonda", geometria: { macro: "barraRedonda" },   /* SIMULAÇÃO S2 (14/10/2026): desenho esquemático (js/metalligacao.js) */
        parametros: [["d", "Diâmetro da barra (mm)", "do cálculo"]],
        limitacoes: ["Só tração (a barra frouxa sai na compressão); arruela biselada e contraporca."],
        verificacoes: ["barra-redonda", "chapa-flex", "solda-filete"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "articulada",
        dica: "O contraventamento mais leve de galpão: barra redonda tracionada.", desenho: { cena: "cv", el: "barra" } }),
    T({ id: "no-trelica-gusset", nome: "Nó de treliça com gusset parafusado", familia: "flexivel", meio: "parafusada",
        aplicacoes: ["no-trelica"], calc: "gussetContravento", calcPar: { trelica: true }, geometria: { macro: "noTrelica" },
        parametros: [["t", "Espessura do gusset (mm)", "auto"], ["parafuso", "Parafuso", "M16"]],
        limitacoes: ["As barras concorrem no nó (eixos no mesmo ponto) — a excentricidade do nó não é considerada.", "A barra mais carregada do nó governa o gusset."],
        verificacoes: ["paraf-cis", "pressao", "rasgamento", "whitmore", "chapa-comp", "shear-lag"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "articulada",
        dica: "Todas as barras do nó aparafusadas num gusset só.", desenho: { cena: "trelica", el: "gusset" } }),
    T({ id: "tubo-t-y", nome: "Nó soldado em perfil tubular — T / Y", familia: "flexivel", meio: "soldada",
        aplicacoes: ["no-trelica", "tubular"], calc: "noTubular", calcPar: { tipo: "T" }, geometria: null,
        parametros: [["theta", "Ângulo da diagonal (°)", "do modelo"]],
        limitacoes: ["Limites de validade (β, 2γ, d1/t1) da NBR 16239:2013 — fora deles, não verificado.", "Solda em todo o contorno (perna ≥ a resistência da barra)."],
        verificacoes: ["tubo-no", "solda-filete"], reforcos: ["chapa de reforço da face do banzo"],
        fabricacao: 2, montagem: 2, custo: 2, rotacao: "articulada",
        dica: "A diagonal tubular soldada direto no banzo: sem chapa, mas a face do banzo pode plastificar.", desenho: { cena: "tubo", el: "T" } }),
    T({ id: "tubo-k", nome: "Nó soldado em perfil tubular — K com afastamento", familia: "flexivel", meio: "soldada",
        aplicacoes: ["no-trelica", "tubular"], calc: "noTubular", calcPar: { tipo: "K" }, geometria: null,
        parametros: [["g", "Afastamento entre as diagonais (mm)", "≥ t1 + t2"]],
        limitacoes: ["Afastamento g ≥ t1 + t2 e dentro dos limites da NBR 16239:2013."],
        verificacoes: ["tubo-no", "solda-filete"], reforcos: [],
        fabricacao: 2, montagem: 2, custo: 2, rotacao: "articulada",
        dica: "Duas diagonais no mesmo nó do banzo, com uma folga entre elas.", desenho: { cena: "tubo", el: "K" } }),

    /* ------------------------------------------------ terça, consolo, tirante */
    T({ id: "clip-terca", nome: "Clip de terça (cantoneira soldada na viga)", familia: "flexivel", meio: "mista",
        aplicacoes: ["terca"], calc: "clipTerca", geometria: { macro: "clipTerca" },
        parametros: [["cat", "Cantoneira", "L76X76X6.4"], ["parafuso", "Parafuso", "M12"]],
        limitacoes: ["Terça de chapa fina: pressão de contato pela NBR 14762:2010."],
        verificacoes: ["paraf-cis", "chapa-fina", "chapa-flex", "solda-filete", "rasgamento"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "apoiada",
        dica: "O apoio da terça na viga do pórtico.", desenho: { cena: "terca", el: "clip" } }),
    T({ id: "consolo", nome: "Consolo soldado para viga de rolamento", familia: "rigida", meio: "soldada",
        aplicacoes: ["consolo"], calc: "consolo", geometria: { macro: "consolo" },
        parametros: [["perfil", "Perfil do consolo", "auto (W)"], ["e", "Excentricidade (mm)", "da viga de rolamento"]],
        limitacoes: ["FADIGA da ponte rolante (NBR 8800, Anexo K): NÃO verificada aqui — obrigatória no projeto.", "Força horizontal (frenagem/impacto) informada pelo projeto."],
        verificacoes: ["chapa-flex", "alma-viga-cis", "solda-penetracao", "solda-filete", "mesa-local", "alma-escoamento", "enrijecedor"], reforcos: ["enrijecedor de continuidade"],
        fabricacao: 2, montagem: 1, custo: 2, rotacao: "engastado no pilar",
        dica: "Braço soldado no pilar que recebe a viga da ponte rolante.", desenho: { cena: "consolo", el: "consolo" } }),
    T({ id: "tirante", nome: "Ligação de tirante / pendural (barra redonda com rosca)", familia: "flexivel", meio: "mista",
        aplicacoes: ["tirante"], calc: "barraRedonda", calcPar: { tirante: true }, geometria: null,
        parametros: [["d", "Diâmetro (mm)", "auto"]],
        limitacoes: ["Porca e contraporca sobre chapa de apoio soldada; só tração."],
        verificacoes: ["barra-redonda", "chapa-flex", "solda-filete"], reforcos: [],
        fabricacao: 1, montagem: 1, custo: 1, rotacao: "articulada",
        dica: "Barra que pendura ou amarra: rosca, porca e chapa de apoio.", desenho: { cena: "tirante", el: "tirante" } })
  ];
  var POR_ID = {}; TIPOS.forEach(function (t) { POR_ID[t.id] = t; });

  /* ================================================================ DESENHO (esquema didático, sem escala)
   * paleta igual à das dicas (js/metaldicas.js): traço #1d2733, aço #c5d0dc / #4f6275, ELEMENTO DA LIGAÇÃO
   * #e9a23b / #a86a10, parafuso #3a4652, concreto #d6d1c7, solda em triângulo */
  var INK = "#1d2733", ACO = "#c5d0dc", ACOL = "#4f6275", DST = "#e9a23b", DSTL = "#a86a10", PAR = "#3a4652", CONC = "#d6d1c7", AUX = "#8a94a3";
  function rc(x, y, w, h, f, s) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (f || ACO) + '" stroke="' + (s || ACOL) + '" stroke-width="1.2"/>'; }
  function dst(x, y, w, h) { return rc(x, y, w, h, DST, DSTL); }
  function bolt(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3.4" fill="' + PAR + '"/>'; }
  function bolts(x, y0, n, s) { var o = ""; for (var i = 0; i < n; i++) o += bolt(x, y0 + i * s); return o; }
  function pg(pts, f, s) { return '<polygon points="' + pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ") + '" fill="' + (f || ACO) + '" stroke="' + (s || ACOL) + '" stroke-width="1.2"/>'; }
  function ln(x1, y1, x2, y2, c, w, d) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (c || INK) + '" stroke-width="' + (w || 1.4) + '"' + (d ? ' stroke-dasharray="' + d + '"' : "") + "/>"; }
  function wd(x, y) { return pg([[x, y], [x + 6, y], [x, y - 6]], DSTL, DSTL); }
  function tx(x, y, s, a) { return '<text x="' + x + '" y="' + y + '" font-size="10" font-family="sans-serif" fill="' + INK + '" text-anchor="' + (a || "start") + '">' + s + "</text>"; }
  function svg(inner, leg) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">' + inner + (leg ? tx(160, 194, leg, "middle") : "") + "</svg>"; }
  /* pilar visto de lado (mesa de frente) e viga chegando pela direita */
  function pilarMesa(x) { return rc(x, 10, 12, 170) + rc(x + 12, 10, 34, 170, "#dde4ec") + rc(x + 46, 10, 12, 170) + ln(x + 29, 10, x + 29, 180, AUX, 0.8, "4 3"); }
  function vigaDir(x0, y, d, fim) { fim = fim || 300; return rc(x0, y, fim - x0, 7) + rc(x0, y + d - 7, fim - x0, 7) + rc(x0, y + 7, fim - x0, d - 14, "#dde4ec"); }
  function cenaVP(o) {
    var h = pilarMesa(60), xv = 124, y = 62, d = 76;
    if (o.el === "misula") { h += vigaDir(xv + 4, y, d) + pg([[xv + 4, y + d], [xv + 80, y + d], [xv + 4, y + d + 40]], DST, DSTL) + dst(xv - 6, y - 14, 10, d + 58) + bolts(xv - 1, y - 8, 2, 9) + bolts(xv - 1, y + d + 26, 2, 9); }
    else if (o.el === "chapaEst") { h += vigaDir(xv + 4, y, d) + dst(xv - 6, y - 22, 10, d + 44) + bolts(xv - 1, y - 14, 1, 0) + bolts(xv - 1, y + 14, 1, 0) + bolts(xv - 1, y + d - 14, 1, 0) + bolts(xv - 1, y + d + 14, 1, 0) + wd(xv + 4, y) + wd(xv + 4, y + d); }
    else if (o.el === "chapaAjust") { h += vigaDir(xv + 4, y, d) + dst(xv - 6, y, 10, d) + bolts(xv - 1, y + 16, 2, 12) + bolts(xv - 1, y + d - 28, 2, 12); }
    else if (o.el === "soldada") { h += vigaDir(118, y, d) + wd(118, y + 7) + wd(118, y + d) + tx(150, y - 6, "penetração total"); }
    else if (o.el === "talas") { h += vigaDir(130, y, d) + dst(118, y - 8, 90, 8) + dst(118, y + d, 90, 8) + bolts(150, y - 4, 1, 0) + bolts(170, y - 4, 1, 0) + bolts(190, y - 4, 1, 0) + bolts(150, y + d + 4, 1, 0) + bolts(170, y + d + 4, 1, 0) + bolts(190, y + d + 4, 1, 0) + (o.solda ? wd(200, y - 8) : "") + dst(120, y + 22, 26, 32) + bolts(138, y + 30, 2, 16); }
    else if (o.el === "cantDupla" || o.el === "cantSimples") { h += vigaDir(130, y, d) + dst(118, y + 14, 30, d - 28) + bolts(124, y + 22, 3, 16) + bolts(140, y + 22, 3, 16) + (o.solda ? wd(146, y + 14) : ""); }
    else if (o.el === "chapaSimples") { h += vigaDir(134, y, d) + dst(118, y + 12, 40, d - 24) + bolts(146, y + 20, 3, 18) + wd(118, y + 12) + (o.dupla ? rc(118, y + 8, 40, 4, "#f2c27a", DSTL) + tx(160, y + 6, "2 chapas") : ""); }
    else if (o.el === "chapaTopoCurta") { h += vigaDir(128, y, d) + dst(118, y + 10, 10, d - 20) + bolts(123, y + 20, 3, 18) + wd(128, y + 10); }
    else if (o.el === "assento" || o.el === "assentoEnrij") { h += vigaDir(130, y, d) + dst(118, y + d, 40, 7) + dst(118, y + d, 7, 36) + bolts(122, y + d + 22, 1, 0) + dst(118, y - 7, 30, 7) + (o.el === "assentoEnrij" ? pg([[125, y + d + 7], [156, y + d + 7], [125, y + d + 44]], DST, DSTL) : ""); }
    else if (o.el === "doubler") { h += vigaDir(118, y, d) + dst(76, y - 10, 26, d + 20) + tx(89, y - 14, "reforço", "middle"); }
    else if (o.el === "enrij") { h += vigaDir(118, y, d) + dst(72, y, 34, 7) + dst(72, y + d - 7, 34, 7); }
    if (o.enrij && o.el !== "enrij") h += dst(72, y, 34, 7) + dst(72, y + d - 7, 34, 7);
    if (o.recorte) h += "";
    return h;
  }
  function cenaVV(o) {
    /* viga principal em corte (I) à esquerda, secundária chegando pela direita */
    var h = rc(40, 50, 60, 9) + rc(66, 59, 8, 82, "#dde4ec") + rc(40, 141, 60, 9), y = 50, d = 70;
    if (o.recorte) { h += rc(100, y + 16, 200, 7) + rc(100, y + d - 7 + 16, 200, 7) + rc(100, y + 23, 200, d - 14, "#dde4ec") + pg([[100, 50], [140, 50], [140, 66], [100, 66]], "#ffffff", AUX); h = h.replace(/(<rect x="100" y="66")/, "$1"); }
    else h += vigaDir(100, y + 30, 50);
    var yy = o.recorte ? y + 30 : y + 40;
    if (o.el === "cantDupla") h += dst(74, yy, 34, 40) + bolts(80, yy + 8, 3, 12) + bolts(98, yy + 8, 3, 12);
    else if (o.el === "chapaSimples") h += dst(74, yy, 44, 40) + bolts(106, yy + 8, 3, 12) + wd(74, yy);
    else if (o.el === "chapaTopoCurta") h += dst(74, yy, 10, 34) + bolts(79, yy + 8, 3, 9);
    if (o.recorte) h += tx(150, 44, "recorte da mesa");
    return h;
  }
  function cenaEmenda(o) {
    var h = vigaDir(20, 70, 60, 157) + vigaDir(163, 70, 60, 300), y = 70, d = 60;
    if (o.el === "talas") h += dst(110, y - 7, 100, 7) + dst(110, y + d, 100, 7) + dst(125, y + 15, 70, 30) + bolts(120, y - 3, 1, 0) + bolts(140, y - 3, 1, 0) + bolts(180, y - 3, 1, 0) + bolts(200, y - 3, 1, 0) + bolts(140, y + 24, 2, 12) + bolts(180, y + 24, 2, 12) + (o.solda ? wd(110, y - 7) + wd(204, y - 7) : "");
    else if (o.el === "chapaTopo") h += dst(151, y - 16, 6, d + 32) + dst(157, y - 16, 6, d + 32) + bolts(157, y - 9, 1, 0) + bolts(157, y + 12, 2, 36) + bolts(157, y + d + 9, 1, 0);
    return h;
  }
  function cenaEmendaPilar(o) {
    var h = rc(130, 10, 12, 82) + rc(142, 10, 36, 82, "#dde4ec") + rc(178, 10, 12, 82) + rc(130, 98, 12, 82) + rc(142, 98, 36, 82, "#dde4ec") + rc(178, 98, 12, 82);
    if (o.el === "talas") h += dst(122, 60, 8, 70) + dst(190, 60, 8, 70) + bolts(126, 68, 2, 14) + bolts(126, 110, 2, 14) + bolts(194, 68, 2, 14) + bolts(194, 110, 2, 14) + dst(148, 70, 24, 50);
    else if (o.el === "chapaTopo") h += dst(116, 89, 88, 5) + dst(116, 94, 88, 5) + bolts(122, 94, 1, 0) + bolts(198, 94, 1, 0);
    else if (o.el === "soldada") h += wd(130, 96) + wd(178, 96) + tx(206, 98, "penetração total");
    return h;
  }
  function cenaBase(o) {
    var h = '<rect x="40" y="140" width="240" height="44" fill="' + CONC + '" stroke="' + AUX + '"/>' + rc(132, 20, 10, 112) + rc(142, 20, 36, 112, "#dde4ec") + rc(178, 20, 10, 112);
    var largo = o.el === "engastada" || o.el === "enrijecida";
    var x0 = largo ? 92 : 112, w = largo ? 136 : 96;
    h += dst(x0, 132, w, 9) + rc(x0, 141, w, 5, "#ece8de", AUX);
    var xs = largo ? [x0 + 14, x0 + w - 14] : [x0 + 12, x0 + w - 12];
    xs.forEach(function (x) { h += ln(x, 120, x, 180, PAR, 3) + rc(x - 6, 126, 12, 6, PAR, PAR) + (o.el !== "quimico" ? ln(x, 180, x + 8, 180, PAR, 3) : ""); });
    if (o.el === "enrijecida") h += pg([[x0, 132], [132, 132], [132, 92]], DST, DSTL) + pg([[188, 132], [x0 + w, 132], [188, 92]], DST, DSTL);
    if (o.el === "lug") h += dst(152, 146, 16, 26);
    if (o.el === "quimico") h += tx(250, 176, "adesivo");
    return h;
  }
  function cenaCV(o) {
    var h = pilarMesa(30) + vigaDir(88, 20, 40);
    if (o.el === "meio") { h = vigaDir(20, 30, 40) + dst(140, 70, 40, 30) + ln(150, 100, 60, 180, ACOL, 8) + ln(170, 100, 260, 180, ACOL, 8) + bolts(150, 92, 1, 0) + bolts(170, 92, 1, 0); return h; }
    if (o.el === "barra") return h + dst(88, 60, 26, 10) + ln(100, 66, 280, 180, PAR, 3) + rc(96, 58, 10, 6, PAR, PAR);
    if (o.el === "lingua") return h + pg([[88, 60], [150, 60], [150, 82], [110, 120], [88, 120]], DST, DSTL) + pg([[112, 88], [124, 80], [176, 160], [164, 168]], "#f2c27a", DSTL) + ln(170, 164, 280, 184, ACOL, 14) + wd(150, 110) + tx(200, 150, "tubo fendido");
    if (o.el === "cruz") return pilarMesa(30) + ln(90, 30, 290, 180, ACOL, 8) + ln(90, 180, 180, 112, ACOL, 8) + ln(200, 98, 290, 30, ACOL, 8) + dst(172, 92, 36, 30) + bolts(190, 105, 1, 0) + bolts(178, 112, 1, 0) + bolts(202, 98, 1, 0);
    return h + pg([[88, 60], [150, 60], [150, 82], [110, 120], [88, 120]], DST, DSTL) + ln(122, 92, 280, 184, ACOL, 10) + bolts(124, 94, 1, 0) + bolts(140, 104, 1, 0);
  }
  function cenaTrelica(o) {
    return rc(20, 120, 280, 12) + pg([[110, 60], [210, 60], [230, 120], [90, 120]], DST, DSTL) + ln(160, 120, 90, 20, ACOL, 10) + ln(160, 120, 230, 20, ACOL, 10) + bolts(130, 84, 1, 0) + bolts(145, 104, 1, 0) + bolts(190, 84, 1, 0) + bolts(175, 104, 1, 0) + bolts(120, 126, 1, 0) + bolts(200, 126, 1, 0);
  }
  function cenaTubo(o) {
    var h = rc(20, 120, 280, 26, ACO, ACOL);
    if (o.el === "K") h += pg([[118, 120], [138, 120], [88, 30], [68, 30]], ACO, ACOL) + pg([[182, 120], [202, 120], [252, 30], [232, 30]], ACO, ACOL) + wd(118, 120) + wd(196, 120) + tx(160, 114, "g", "middle");
    else h += pg([[150, 120], [172, 120], [172, 30], [150, 30]], ACO, ACOL) + wd(144, 120) + wd(172, 120);
    return h + tx(26, 160, "banzo (tubo)");
  }
  function cenaTerca(o) { return vigaDir(20, 110, 40) + dst(140, 74, 7, 36) + dst(140, 104, 34, 6) + rc(147, 60, 40, 50, "#dde4ec") + bolts(152, 82, 2, 12) + tx(196, 70, "terça"); }
  function cenaConsolo(o) { return pilarMesa(40) + dst(98, 80, 110, 8) + dst(98, 120, 80, 8) + pg([[98, 88], [208, 88], [178, 120], [98, 120]], "#f2c27a", DSTL) + rc(150, 50, 90, 30) + ln(195, 30, 195, 50, INK, 1.4) + pg([[189, 44], [201, 44], [195, 50]], INK, INK) + wd(98, 80) + wd(98, 128); }
  function cenaTirante(o) { return vigaDir(20, 20, 40) + dst(140, 60, 40, 8) + ln(160, 60, 160, 190, PAR, 3) + rc(152, 68, 16, 6, PAR, PAR) + rc(152, 75, 16, 5, PAR, PAR); }
  var CENAS = { vp: cenaVP, vv: cenaVV, emenda: cenaEmenda, emendaPilar: cenaEmendaPilar, base: cenaBase, cv: cenaCV, trelica: cenaTrelica, tubo: cenaTubo, terca: cenaTerca, consolo: cenaConsolo, tirante: cenaTirante };
  function desenho(id) {
    var t = POR_ID[id]; if (!t || !t.desenho) return null;
    var f = CENAS[t.desenho.cena]; if (!f) return null;
    return svg(f(t.desenho), FAMILIAS[t.familia] ? (t.familia === "flexivel" ? "flexível" : t.familia === "rigida" ? "rígida" : t.familia === "semirrigida" ? "semirrígida" : "reforço") + " · " + (t.meio === "mista" ? "soldada na fábrica + parafusada" : t.meio) : "");
  }

  var AcoLigTipos = {
    EDICAO: EDICAO, ESCOPO: ESCOPO, APLICACOES: APLICACOES, FAMILIAS: FAMILIAS, VERIF: VERIF, TIPOS: TIPOS,
    obter: function (id) { return Object.prototype.hasOwnProperty.call(POR_ID, id) ? POR_ID[id] : null; },
    ids: function () { return TIPOS.map(function (t) { return t.id; }); },
    porAplicacao: function (ap) { return TIPOS.filter(function (t) { return t.aplicacoes.indexOf(ap) >= 0; }); },
    porFamilia: function (f) { return TIPOS.filter(function (t) { return t.familia === f; }); },
    verificacoesDe: function (id) {
      var t = POR_ID[id]; if (!t) return [];
      return t.verificacoes.map(function (k) { var v = VERIF[k] || { texto: k, item: "?", norma: "?" }; return { id: k, texto: v.texto, item: v.item, norma: v.norma }; });
    },
    svg: desenho
  };
  global.AcoLigTipos = AcoLigTipos;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigTipos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

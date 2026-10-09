/* =====================================================================
 * bimpeso.js — O PESO DE CADA PEÇA DO MODELO (a base do plano de içamento)
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * O engenheiro clica numa peça e quer saber quanto ela pesa — em kg e em kN —
 * e quanto ela representa do peso da obra. Junta os pilares e os vidros e quer
 * o peso de cada um, por tipo e do conjunto. E é deste número que o plano de
 * içamento parte: guindaste e munck são escolhidos pela carga.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ DE ONDE O PESO VEM, EM ORDEM — e a ordem é a regra
 *
 *   1. a MASSA que o IFC publica (IfcQuantityWeight, líquida antes da bruta):
 *      é o que o projetista ou o fabricante declarou. Chapa, parafuso e
 *      conector costumam vir assim.
 *   2. VOLUME × PESO ESPECÍFICO do material. O volume é o do IFC
 *      (BaseQuantities); sem ele, o da malha da peça (estimado — ver
 *      `volumeMalha` no js/bim.js). O peso específico é, nesta ordem:
 *        a) o que o usuário informou para aquele material (ou para aquela
 *           classe de peça sem material);
 *        b) a massa específica que o PRÓPRIO IFC publica para o material;
 *        c) a tabela abaixo, casada pelo NOME do material.
 *   3. nada disso: a peça fica SEM PESO, com o motivo. ⚠ Nunca um peso de
 *      reserva. Peça sem peso some do total de um jeito que a tela mostra
 *      ("312 de 340 peças com peso"); peça com peso inventado entra no total,
 *      vai para o plano de içamento e escolhe o guindaste.
 *
 * ⚠ "PARTICIPAÇÃO NAS CARGAS" É SOBRE O PESO PRÓPRIO DA CONSTRUÇÃO. O modelo
 * não sabe a sobrecarga de uso, o vento nem o que vai em cima da laje — a
 * porcentagem é a fatia da peça no peso de tudo que tem peso no modelo,
 * TIRANDO solo e aterro (que são peças do modelo e pesam muito, mas não são
 * carga sobre a estrutura). A tela diz isso com essas palavras.
 *
 * ⚠ POR QUE PURO
 * Decide o número que escolhe o equipamento de içamento. `js/bim.js` e
 * `js/gestao.js` não entram no gate; isto entra (tools/test-bimpeso.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* aceleração da gravidade padrão (CGPM 1901 / ISO 80000-3): kg → N */
  var G = 9.80665;

  /* ---------------------------------------------------------------
   * TABELA DE PESOS ESPECÍFICOS (kN/m³) — ABNT NBR 6120:2019
   *
   * Tabela 1 (materiais de construção), Tabela A.1 (materiais armazenados) e
   * Tabela 7 (enchimentos). Onde a norma dá FAIXA, vale o valor médio que ela
   * mesma põe entre parênteses (item 5.3) — e a `ref` diz a faixa.
   * ⚠ Conferido linha a linha em duas cópias do texto integral (01/10/2026);
   *   a conferência final é na cópia licenciada da norma.
   * ⚠ Entrada sem `ref` não entra: número sem fonte, num recurso que escolhe
   *   guindaste, é o tipo de coisa que esta base proíbe.
   *
   * `chaves`: PALAVRAS do nome do material, já normalizadas (minúsculo, sem
   * acento, sem pontuação). Casam por palavra inteira: "aco" casa com "Aço
   * inox" e NÃO com "espaço" (ver `palavras`).
   * ⚠ A ORDEM DA LISTA É A ORDEM DE BUSCA: a mais específica vem antes
   *   ("bloco de concreto" antes de "concreto"), senão a genérica engole a
   *   específica — e o tools/test-bimpeso.js reprova se isso acontecer.
   * `solo: true`: pesa, mas não é carga sobre a estrutura.
   *
   * ⚠ TRÊS ESCOLHAS DE ENGENHARIA, DITAS NA PRÓPRIA `ref` (a tela mostra):
   *   - concreto SEM especificação → o do concreto armado (25): peça içada é
   *     armada, e errar para mais é o lado seguro no içamento;
   *   - Pinus (a norma não lista a espécie) → coníferas C30 (6), o maior da
   *     classe, pelo mesmo motivo;
   *   - argamassa sem especificação → a de cimento e areia (21).
   *   O que a norma não cobre (compensado sem espécie, placa cimentícia,
   *   gesso em kN/m³, "madeira" sem espécie) NÃO entra: a peça fica sem peso
   *   e o engenheiro informa — uma vez por material.
   * ------------------------------------------------------------- */
  var N1 = "NBR 6120:2019, Tab. 1", NA1 = "NBR 6120:2019, Tab. A.1", N7 = "NBR 6120:2019, Tab. 7";
  var TABELA = [
    /* ---- blocos e peças artificiais (Tab. 1 §2) — antes de "concreto" ---- */
    { id: "concreto-celular", nome: "Concreto celular autoclavado C25", kNm3: 5.5, ref: N1 + " — concreto celular autoclavado", chaves: ["concreto celular", "celular autoclavado"] },
    { id: "bloco-concreto", nome: "Bloco de concreto vazado", kNm3: 14, ref: N1 + " — bloco de concreto vazado (classes A e B)", chaves: ["bloco de concreto", "bloco estrutural de concreto", "concrete masonry"] },
    { id: "bloco-vidro", nome: "Bloco de vidro", kNm3: 9, ref: N1 + " — bloco de vidro", chaves: ["bloco de vidro", "tijolo de vidro"] },
    { id: "bloco-ceramico-macico", nome: "Bloco cerâmico maciço (tijolo maciço)", kNm3: 18, ref: N1 + " — bloco cerâmico maciço", chaves: ["tijolo macico", "bloco ceramico macico"] },
    { id: "bloco-ceramico", nome: "Bloco cerâmico vazado (paredes vazadas)", kNm3: 12, ref: N1 + " — bloco cerâmico vazado, paredes vazadas", chaves: ["bloco ceramico", "tijolo furado", "tijolo baiano", "tijolo ceramico furado"] },
    { id: "tijolo", nome: "Tijolo (maciço)", kNm3: 18, ref: N1 + " — bloco cerâmico maciço (tijolo sem especificação = maciço)", chaves: ["tijolo"] },
    { id: "silico-calcario", nome: "Bloco sílico-calcário", kNm3: 20, ref: N1 + " — bloco sílico-calcário", chaves: ["silico calcario"] },
    { id: "lajota", nome: "Lajota cerâmica", kNm3: 18, ref: N1 + " — lajota cerâmica", chaves: ["lajota"] },
    { id: "porcelanato", nome: "Porcelanato", kNm3: 23, ref: N1 + " — porcelanato", chaves: ["porcelanato"] },
    { id: "terracota", nome: "Terracota", kNm3: 21, ref: N1 + " — terracota", chaves: ["terracota"] },
    /* ---- concretos e argamassas (Tab. 1 §3; betuminoso na A.1) ---- */
    { id: "concreto-betuminoso", nome: "Concreto betuminoso", kNm3: 24.5, ref: NA1 + " — concreto betuminoso, 24 a 25 (24,5)", chaves: ["concreto betuminoso", "cbuq"] },
    { id: "concreto-simples", nome: "Concreto simples", kNm3: 24, ref: N1 + " — concreto simples", chaves: ["concreto simples", "concreto magro", "concreto nao armado", "plain concrete", "lean concrete"] },
    { id: "concreto-armado", nome: "Concreto armado", kNm3: 25, ref: N1 + " — concreto armado", chaves: ["concreto armado", "concreto estrutural", "concreto protendido", "reinforced concrete", "precast concrete"] },
    { id: "concreto", nome: "Concreto (sem especificação)", kNm3: 25, ref: N1 + " — concreto armado, adotado para concreto sem especificação (a favor da segurança no içamento)", chaves: ["concreto", "concrete"] },
    { id: "argamassa-autonivelante", nome: "Argamassa autonivelante", kNm3: 24, ref: N1 + " — argamassa autonivelante", chaves: ["autonivelante"] },
    { id: "argamassa-mista", nome: "Argamassa de cal, cimento e areia", kNm3: 19, ref: N1 + " — argamassa de cal, cimento e areia", chaves: ["argamassa de cal cimento", "argamassa mista"] },
    { id: "argamassa-cal", nome: "Argamassa de cal", kNm3: 15, ref: N1 + " — argamassa de cal, 12 a 18 (15)", chaves: ["argamassa de cal"] },
    { id: "argamassa-gesso", nome: "Argamassa de gesso", kNm3: 15, ref: N1 + " — argamassa de gesso, 12 a 18 (15)", chaves: ["argamassa de gesso"] },
    { id: "argamassa", nome: "Argamassa de cimento e areia", kNm3: 21, ref: N1 + " — argamassa de cimento e areia, 19 a 23 (21); adotada para argamassa sem especificação", chaves: ["argamassa", "reboco", "emboco", "chapisco", "contrapiso", "mortar"] },
    /* ---- metais (Tab. 1 §4) ---- */
    { id: "ferro-fundido", nome: "Ferro fundido", kNm3: 71.8, ref: N1 + " — ferro fundido, 71 a 72,5 (71,8)", chaves: ["ferro fundido", "cast iron"] },
    { id: "ferro-forjado", nome: "Ferro forjado", kNm3: 76, ref: N1 + " — ferro forjado", chaves: ["ferro forjado", "wrought iron"] },
    { id: "aco", nome: "Aço", kNm3: 77.8, ref: N1 + " — aço, 77 a 78,5 (77,8)", chaves: ["aco", "inox", "steel", "stainless", "galvanizado", "galvanizada", "vergalhao", "ca 50", "ca 60"] },
    { id: "aluminio", nome: "Alumínio e ligas", kNm3: 28, ref: N1 + " — alumínio e ligas", chaves: ["aluminio", "aluminum", "aluminium"] },
    { id: "cobre", nome: "Cobre", kNm3: 88, ref: N1 + " — cobre, 87 a 89 (88)", chaves: ["cobre", "copper"] },
    { id: "bronze-latao", nome: "Bronze / latão", kNm3: 84, ref: N1 + " — bronze e latão, 83 a 85 (84)", chaves: ["bronze", "latao", "brass"] },
    { id: "chumbo", nome: "Chumbo", kNm3: 113, ref: N1 + " — chumbo, 112 a 114 (113)", chaves: ["chumbo"] },
    { id: "zinco", nome: "Zinco", kNm3: 71.5, ref: N1 + " — zinco, 71 a 72 (71,5)", chaves: ["zinco", "zinc"] },
    { id: "estanho", nome: "Estanho", kNm3: 74, ref: N1 + " — estanho", chaves: ["estanho"] },
    /* ---- rochas (Tab. 1 §1) ---- */
    { id: "granito", nome: "Granito, sienito, pórfiro", kNm3: 28.5, ref: N1 + " — granito, sienito, pórfiro, 27 a 30 (28,5)", chaves: ["granito", "sienito", "porfiro", "granite"] },
    { id: "marmore", nome: "Mármore e calcário", kNm3: 28, ref: N1 + " — mármore e calcário", chaves: ["marmore", "calcario", "marble", "limestone"] },
    { id: "basalto", nome: "Basalto, diorito, gabro", kNm3: 29, ref: N1 + " — basalto, diorito, gabro, 27 a 31 (29)", chaves: ["basalto", "diorito", "gabro"] },
    { id: "arenito", nome: "Arenito", kNm3: 24, ref: N1 + " — arenito, 21 a 27 (24)", chaves: ["arenito", "sandstone"] },
    { id: "gnaisse", nome: "Gnaisse", kNm3: 30, ref: N1 + " — gnaisse", chaves: ["gnaisse"] },
    { id: "ardosia", nome: "Ardósia", kNm3: 28, ref: N1 + " — ardósia", chaves: ["ardosia", "slate"] },
    /* ---- vidro (Tab. A.1 §4) ---- */
    { id: "vidro", nome: "Vidro plano em chapas", kNm3: 26, ref: NA1 + " — vidro plano em chapas (comum ou laminado)", chaves: ["vidro", "glass"] },
    /* ---- chapas de madeira (Tab. 1 §5) — ANTES das espécies: "compensado de
       pinus" é compensado (5), não pinus maciço (6) ---- */
    { id: "compensado-resinosa", nome: "Compensado de resinosas", kNm3: 5, ref: N1 + " — compensado de resinosas", chaves: ["compensado de resinosa", "compensado de pinus", "compensado de pinho"] },
    { id: "aglomerado-cimento", nome: "Aglomerado de partículas com cimento", kNm3: 12, ref: N1 + " — aglomerado de partículas com cimento", chaves: ["aglomerado de cimento", "aglomerado com cimento", "cimento madeira"] },
    { id: "aglomerado", nome: "Aglomerado de partículas (resina)", kNm3: 7.5, ref: N1 + " — aglomerado de partículas com resina sintética, 7 a 8 (7,5)", chaves: ["aglomerado", "mdp"] },
    { id: "osb", nome: "OSB", kNm3: 7, ref: N1 + " — OSB (flakeboard / waferboard)", chaves: ["osb"] },
    { id: "mdf", nome: "MDF", kNm3: 8, ref: N1 + " — MDF", chaves: ["mdf"] },
    { id: "hardboard", nome: "Chapa dura (hardboard)", kNm3: 10, ref: N1 + " — hardboard", chaves: ["hardboard", "chapa dura"] },
    /* ---- madeiras (Tab. 1 §5, umidade 12 %) — espécie antes de classe ---- */
    { id: "eucalipto", nome: "Eucalipto", kNm3: 10, ref: N1 + " — eucalipto", chaves: ["eucalipto", "eucalyptus"] },
    { id: "pinus", nome: "Pinus (coníferas C30)", kNm3: 6, ref: N1 + " — coníferas C20/C25/C30 = 5/5,5/6; Pinus não é listado: adotado C30, o maior da classe (a favor da segurança no içamento)", chaves: ["pinus", "pine"] },
    { id: "pinho-cedro", nome: "Pinho, cedro", kNm3: 5, ref: N1 + " — pinho; cedro", chaves: ["pinho", "cedro"] },
    { id: "louro-imbuia", nome: "Louro, imbuia, pau-óleo", kNm3: 6.5, ref: N1 + " — louro, imbuia, pau-óleo", chaves: ["louro", "imbuia", "pau oleo"] },
    { id: "angico", nome: "Angico, cabriúva, tatajuba", kNm3: 10, ref: N1 + " — angico, cabriúva; eucalipto, tatajuba", chaves: ["angico", "cabriuva", "tatajuba"] },
    { id: "ipe", nome: "Ipê, jatobá, sucupira, champanhe", kNm3: 11, ref: N1 + " — champanhe, ipê, jatobá, sucupira", chaves: ["ipe", "jatoba", "sucupira", "champanhe"] },
    { id: "macaranduba", nome: "Maçaranduba, angelim-ferro", kNm3: 12, ref: N1 + " — angelim ferro, angelim pedra verdadeiro, catiúba, maçaranduba", chaves: ["macaranduba", "angelim ferro", "catiuba"] },
    /* ---- diversos (Tab. A.1) ---- */
    { id: "asfalto", nome: "Asfalto", kNm3: 13, ref: NA1 + " — asfalto", chaves: ["asfalto", "asphalt"] },
    { id: "eps", nome: "EPS (alta densidade)", kNm3: 0.3, ref: N7 + " — EPS de alta densidade", chaves: ["eps", "isopor"] },
    { id: "brita", nome: "Pedra britada", kNm3: 17.5, ref: NA1 + " — pedra britada, 15 a 20 (17,5)", chaves: ["brita", "pedra britada", "gravel"] },
    { id: "seixo", nome: "Seixo", kNm3: 19, ref: NA1 + " — seixo", chaves: ["seixo"] },
    { id: "areia-seca", nome: "Areia seca", kNm3: 15.5, ref: NA1 + " — areia seca, 15 a 16 (15,5)", chaves: ["areia seca"] },
    { id: "areia", nome: "Areia (umidade natural)", kNm3: 18, ref: NA1 + " — areia com umidade natural, 17 a 19 (18)", chaves: ["areia", "sand"] },
    { id: "entulho", nome: "Entulho com concreto", kNm3: 15, ref: NA1 + " — entulho com concreto", chaves: ["entulho"] },
    /* ---- terreno: pesa, mas não é carga sobre a estrutura ---- */
    { id: "argila-arenosa", nome: "Argila arenosa", kNm3: 18, ref: NA1 + " — argila arenosa", chaves: ["argila arenosa"], solo: true },
    { id: "argila", nome: "Argila", kNm3: 19, ref: NA1 + " — argila", chaves: ["argila", "clay"], solo: true },
    { id: "solo", nome: "Solo (enchimento)", kNm3: 18, ref: N7 + " — solo, 16 a 20 (18)", chaves: ["solo", "aterro", "terra", "soil", "earth"], solo: true }
  ];

  /* classes IFC que não são peça física: ambiente, abertura, anotação, grade.
     Não têm peso e não contam na cobertura ("N de M peças com peso"). */
  var NAO_FISICO = { IFCSPACE: 1, IFCOPENINGELEMENT: 1, IFCANNOTATION: 1, IFCGRID: 1, IFCVIRTUALELEMENT: 1, IFCSITE: 1, IFCZONE: 1 };
  /* classes que são TERRENO: pesam, mas não são carga sobre a estrutura */
  var CLASSE_SOLO = { IFCGEOGRAPHICELEMENT: 1, IFCEARTHWORKSFILL: 1, IFCEARTHWORKSCUT: 1 };
  /* ⚠ EQUIPAMENTO, MOBILIÁRIO, LOUÇA E ELÉTRICA: SÓ PELA MASSA.
   * Essas peças são modeladas como o VOLUME EXTERNO (a geladeira é uma caixa
   * de 0,7 × 0,7 × 1,9 m), e o material diz do que é a casca. Volume externo ×
   * peso específico do aço deu, no modelo real de uma obra (01/10/2026), 564 kN
   * de "mobiliário" — uma geladeira de 7 toneladas, somada no peso próprio e
   * pronta para escolher guindaste. Aqui o peso vem da massa publicada no IFC
   * ou do peso por peça que o engenheiro informa (catálogo do fabricante); sem
   * isso, a peça fica sem peso e diz o porquê. */
  var SO_MASSA = {
    IFCFURNITURE: 1, IFCFURNISHINGELEMENT: 1, IFCSANITARYTERMINAL: 1, IFCFLOWTERMINAL: 1, IFCLIGHTFIXTURE: 1, IFCLAMP: 1,
    IFCOUTLET: 1, IFCSWITCHINGDEVICE: 1, IFCELECTRICDISTRIBUTIONBOARD: 1, IFCJUNCTIONBOX: 1, IFCPROTECTIVEDEVICE: 1,
    IFCELECTRICAPPLIANCE: 1, IFCAUDIOVISUALAPPLIANCE: 1, IFCCOMMUNICATIONSAPPLIANCE: 1, IFCMEDICALDEVICE: 1,
    IFCTANK: 1, IFCPUMP: 1, IFCVALVE: 1, IFCFLOWCONTROLLER: 1, IFCFLOWMOVINGDEVICE: 1, IFCENERGYCONVERSIONDEVICE: 1,
    IFCUNITARYEQUIPMENT: 1, IFCAIRTERMINAL: 1, IFCFIRESUPPRESSIONTERMINAL: 1, IFCSENSOR: 1, IFCALARM: 1,
    IFCSTACKTERMINAL: 1, IFCWASTETERMINAL: 1, IFCTRANSPORTELEMENT: 1
  };

  /* rótulo da classe IFC em português, para agrupar "por tipo" */
  var ROTULO = {
    IFCWALL: "Parede", IFCWALLSTANDARDCASE: "Parede", IFCSLAB: "Laje", IFCBEAM: "Viga", IFCCOLUMN: "Pilar",
    IFCDOOR: "Porta", IFCWINDOW: "Janela", IFCROOF: "Cobertura", IFCSTAIR: "Escada", IFCSTAIRFLIGHT: "Lance de escada",
    IFCRAILING: "Guarda-corpo", IFCFURNISHINGELEMENT: "Mobiliário", IFCFURNITURE: "Mobiliário", IFCPLATE: "Chapa",
    IFCMEMBER: "Perfil/Montante", IFCFLOWTERMINAL: "Louça/terminal", IFCFLOWSEGMENT: "Tubo/duto", IFCFLOWFITTING: "Conexão",
    IFCPIPESEGMENT: "Tubo", IFCPIPEFITTING: "Conexão", IFCDUCTSEGMENT: "Duto", IFCDUCTFITTING: "Conexão de duto",
    IFCBUILDINGELEMENTPROXY: "Elemento genérico", IFCCOVERING: "Revestimento", IFCFOOTING: "Fundação", IFCPILE: "Estaca",
    IFCCURTAINWALL: "Fachada cortina", IFCMECHANICALFASTENER: "Fixador", IFCDISCRETEACCESSORY: "Acessório",
    IFCFASTENER: "Fixador", IFCREINFORCINGBAR: "Barra de armadura", IFCREINFORCINGMESH: "Tela de armadura",
    IFCTENDON: "Cordoalha", IFCLIGHTFIXTURE: "Luminária", IFCOUTLET: "Tomada", IFCSWITCHINGDEVICE: "Interruptor",
    IFCSANITARYTERMINAL: "Louça sanitária", IFCELECTRICDISTRIBUTIONBOARD: "Quadro elétrico", IFCTANK: "Reservatório",
    IFCCHIMNEY: "Chaminé", IFCSHADINGDEVICE: "Brise", IFCRAMP: "Rampa", IFCRAMPFLIGHT: "Lance de rampa",
    IFCGEOGRAPHICELEMENT: "Terreno", IFCEARTHWORKSFILL: "Aterro", IFCCABLECARRIERSEGMENT: "Eletrocalha",
    IFCCABLESEGMENT: "Cabo", IFCVALVE: "Registro/válvula", IFCPUMP: "Bomba"
  };

  function txt(s) { return String(s == null ? "" : s).trim(); }
  function num(x) { var n = +x; return isFinite(n) ? n : 0; }
  /* a normalização canônica do app (Util.normalizar), com a cópia para
     quando o js/util.js não carregou — a mesma regra: minúsculo, sem acento */
  function norm(s) {
    var U = global.Util;
    if (U && typeof U.normalizar === "function") return U.normalizar(s);
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }
  function classe(el) { return txt(el && el.tipo).toUpperCase(); }
  function rotuloTipo(el) {
    var c = classe(el);
    return ROTULO[c] || txt(el && el.nome) || c.replace(/^IFC/, "") || "Sem classe";
  }
  function chaveMaterial(nome) { return "mat:" + norm(nome); }
  function chaveClasse(cl) { return "tipo:" + txt(cl).toUpperCase(); }
  /* a chave do PESO POR PEÇA: pela família (o tipo da família — "Geladeira inox
     2 portas" vale para todas as geladeiras iguais); sem família, pelo nome da
     peça sem o número de instância do modelo (":123456"); sem nome, pela classe */
  function chavePeca(el) {
    var f = txt(el && el.familia);
    if (f) return "fam:" + norm(f);
    var n = txt(el && el.nomeIfc).replace(/:\d+$/, "");
    if (n) return "nome:" + norm(n);
    return "peca:" + txt(el && el.tipo).toUpperCase();
  }
  function rotuloPeca(el) {
    return txt(el && el.familia) || txt(el && el.nomeIfc).replace(/:\d+$/, "") || rotuloTipo(el);
  }

  /* as PALAVRAS de um nome, do jeito que a tabela as guarda: normalizado, sem
     pontuação e com o plural reduzido ("blocos cerâmicos" = "bloco
     cerâmico"). O mesmo corte vale dos dois lados (nome e chave), então
     "pinus" → "pinu" casa com "Pinus elliottii" sem ninguém escrever "pinu". */
  function palavras(s) {
    var p = norm(s).replace(/[^a-z0-9]+/g, " ").trim();
    if (!p) return [];
    return p.split(" ").map(function (w) { return (w.length > 3 && w.charAt(w.length - 1) === "s") ? w.slice(0, -1) : w; });
  }
  /* ⚠ POR PALAVRA INTEIRA, não por trecho: "aco" dentro de "espaço" faria a
     peça de um espaço técnico pesar como aço. */
  function contemSequencia(ws, cs) {
    if (!cs.length || cs.length > ws.length) return false;
    for (var i = 0; i + cs.length <= ws.length; i++) {
      var k = 0; while (k < cs.length && ws[i + k] === cs[k]) k++;
      if (k === cs.length) return true;
    }
    return false;
  }
  /* a entrada da tabela que casa com o NOME do material, ou null */
  function casarMaterial(nome, tabela) {
    var ws = palavras(nome); if (!ws.length) return null;
    var tb = tabela || TABELA;
    for (var i = 0; i < tb.length; i++) {
      var ch = tb[i].chaves || [];
      for (var j = 0; j < ch.length; j++) if (contemSequencia(ws, palavras(ch[j]))) return tb[i];
    }
    return null;
  }

  /* peso específico de UM material (kN/m³): usuário → IFC → tabela */
  function gamaDoMaterial(m, opts) {
    var dens = (opts && opts.densidades) || {};
    var u = dens[chaveMaterial(m.n)];
    if (u != null && num(u.kNm3) > 0) return { kNm3: num(u.kNm3), origem: "usuario", nome: m.n, ref: txt(u.ref) || "informado pelo usuário" };
    if (num(m.rho) > 0) return { kNm3: num(m.rho) * G / 1000, origem: "ifc", nome: m.n, ref: "massa específica publicada no IFC (" + num(m.rho) + " kg/m³)" };
    var t = casarMaterial(m.n, opts && opts.tabela);
    if (t) return { kNm3: t.kNm3, origem: "tabela", nome: m.n, ref: t.ref, entrada: t.id, rotulo: t.nome, solo: !!t.solo };
    return null;
  }

  /* ---------------------------------------------------------------
   * pesoEspecifico — o γ da PEÇA (kN/m³), ou o motivo de não haver
   *
   * ⚠ VÁRIOS MATERIAIS SEM PROPORÇÃO NÃO VIRAM MÉDIA. Janela de alumínio e
   * vidro "meio a meio" seria um número inventado. Só se combina quando o IFC
   * diz a fração (camadas pela espessura, constituintes pela Fraction) ou
   * quando todos dão o MESMO γ (a fração não muda nada).
   * ------------------------------------------------------------- */
  function pesoEspecifico(el, opts) {
    var dens = (opts && opts.densidades) || {};
    var mats = (el && Array.isArray(el.materiais)) ? el.materiais.filter(function (m) { return m && txt(m.n); }) : [];
    if (!mats.length) {
      var u = dens[chaveClasse(classe(el))];
      if (u != null && num(u.kNm3) > 0) return { ok: true, kNm3: num(u.kNm3), origem: "usuario", ref: txt(u.ref) || "informado pelo usuário para " + rotuloTipo(el), materiais: [] };
      return { ok: false, motivo: "sem material no IFC", semMaterial: true };
    }
    var gs = [], faltam = [];
    for (var i = 0; i < mats.length; i++) {
      var g = gamaDoMaterial(mats[i], opts);
      if (!g) faltam.push(mats[i].n); else { g.f = mats[i].f; gs.push(g); }
    }
    if (faltam.length) return { ok: false, motivo: "material sem peso específico: " + faltam.join(", "), faltam: faltam };
    var solo = gs.every(function (x) { return x.solo; });
    if (gs.length === 1) return { ok: true, kNm3: gs[0].kNm3, origem: gs[0].origem, ref: gs[0].ref, materiais: gs, solo: solo };
    var iguais = gs.every(function (x) { return Math.abs(x.kNm3 - gs[0].kNm3) < 1e-9; });
    if (iguais) return { ok: true, kNm3: gs[0].kNm3, origem: gs[0].origem, ref: gs[0].ref, materiais: gs, solo: solo };
    var comF = gs.every(function (x) { return x.f != null && x.f >= 0; }), soma = 0;
    gs.forEach(function (x) { soma += num(x.f); });
    if (!comF || !(soma > 0)) return { ok: false, motivo: "vários materiais sem proporção no IFC (" + gs.map(function (x) { return x.nome; }).join(" + ") + ")", composto: true };
    var k = 0; gs.forEach(function (x) { k += x.kNm3 * num(x.f) / soma; });
    return { ok: true, kNm3: k, origem: "composto", ref: "média pelas frações do IFC: " + gs.map(function (x) { return x.nome + " " + Math.round(num(x.f) / soma * 100) + "%"; }).join(", "), materiais: gs, solo: solo };
  }

  /* ---------------------------------------------------------------
   * pesoDe — o peso de UMA peça
   *   { ok, kg, kN, fonte: 'ifc' | 'volume' | 'malha', volume, volFonte,
   *     gama, estimado, solo, naoFisico, motivo }
   * `opts.volumeMalha(el)` → {volume} | null: o volume pela malha (js/bim.js),
   * chamado só quando o IFC não tem volume.
   * ------------------------------------------------------------- */
  function pesoDe(el, opts) {
    var cl = classe(el);
    if (NAO_FISICO[cl]) return { ok: false, naoFisico: true, motivo: "não é peça física (" + rotuloTipo(el) + ")" };
    var q = (el && el.qto) || {};
    var soloCl = !!CLASSE_SOLO[cl];
    if (num(q.massa) > 0) {
      var kg0 = num(q.massa);
      return { ok: true, kg: kg0, kN: kg0 * G / 1000, fonte: "ifc", massaFonte: txt(q.massaFonte), estimado: false, solo: soloCl,
        volume: num(q.volume) || null, volFonte: num(q.volume) > 0 ? "ifc" : "" };
    }
    if (SO_MASSA[cl]) {
      var pp = ((opts && opts.pesosPeca) || {})[chavePeca(el)];
      if (pp && num(pp.kg) > 0) {
        var kg1 = num(pp.kg);
        return { ok: true, kg: kg1, kN: kg1 * G / 1000, fonte: "peca", refPeca: txt(pp.ref) || "informado pelo usuário", estimado: false, solo: false, porPeca: true };
      }
      return { ok: false, porPeca: true, motivo: "equipamento/mobiliário: o volume modelado é o externo — informe o peso por peça (catálogo do fabricante)" };
    }
    var vol = num(q.volume), volFonte = vol > 0 ? "ifc" : "";
    /* ⚠ o peso específico ANTES do volume da malha: sem material não há peso de
       qualquer jeito, e medir a malha de cada peça de um modelo sem material
       (exportação comum de MEP) custaria segundos no primeiro clique à toa */
    var gama = pesoEspecifico(el, opts);
    if (!gama.ok) return { ok: false, motivo: gama.motivo, volume: vol || null, volFonte: volFonte, gama: null, semMaterial: !!gama.semMaterial, composto: !!gama.composto, faltam: gama.faltam || [], solo: soloCl };
    if (!(vol > 0) && opts && typeof opts.volumeMalha === "function") {
      var vm = null; try { vm = opts.volumeMalha(el); } catch (e) { vm = null; }
      if (vm && num(vm.volume) > 0) { vol = num(vm.volume); volFonte = "malha"; }
    }
    if (!(vol > 0)) return { ok: false, motivo: "sem volume no IFC e a malha não é fechada", gama: gama, solo: soloCl };
    var kN = vol * gama.kNm3;
    return { ok: true, kN: kN, kg: kN * 1000 / G, fonte: volFonte === "malha" ? "malha" : "volume", volume: vol, volFonte: volFonte,
      gama: gama, estimado: volFonte === "malha", solo: soloCl || !!gama.solo };
  }

  function somar(acc, el, p) {
    acc.n++;
    if (p && p.ok) { acc.kN += p.kN; acc.kg += p.kg; acc.comPeso++; if (p.estimado) acc.estimados++; }
    else if (p && !p.naoFisico) acc.semPeso++;
  }
  function novoAcc(chave, rotulo) { return { chave: chave, rotulo: rotulo, n: 0, comPeso: 0, semPeso: 0, estimados: 0, kN: 0, kg: 0, uids: [] }; }
  function porKN(a, b) { return b.kN - a.kN || String(a.rotulo).localeCompare(String(b.rotulo)); }

  /* ---------------------------------------------------------------
   * resumo — o modelo inteiro (ou a lista dada): totais, por tipo, por
   * material, por família, e o que ficou sem peso e por quê
   * ------------------------------------------------------------- */
  function resumo(elementos, opts) {
    var lista = Array.isArray(elementos) ? elementos : [];
    var itens = [], carga = novoAcc("carga", "Peso próprio da construção"), solo = novoAcc("solo", "Solo e aterro");
    var tipos = {}, mats = {}, fams = {}, sem = [], naoFis = 0, motivos = {};
    for (var i = 0; i < lista.length; i++) {
      var el = lista[i]; if (!el) continue;
      var p = pesoDe(el, opts);
      itens.push({ el: el, p: p });
      if (p.naoFisico) { naoFis++; continue; }
      if (!p.ok) { sem.push({ el: el, motivo: p.motivo }); motivos[p.motivo] = (motivos[p.motivo] || 0) + 1; }
      somar(p.ok && p.solo ? solo : carga, el, p);
      var rt = rotuloTipo(el), kt = "tipo:" + norm(rt);
      (tipos[kt] = tipos[kt] || novoAcc(kt, rt));
      somar(tipos[kt], el, p); tipos[kt].uids.push(el.uid);
      var mn = (el.materiais && el.materiais.length) ? el.materiais.map(function (m) { return txt(m.n); }).join(" + ") : "(sem material no IFC)";
      var km = "mat:" + norm(mn);
      (mats[km] = mats[km] || novoAcc(km, mn));
      somar(mats[km], el, p); mats[km].uids.push(el.uid);
      var fn = txt(el.familia) || "(sem família)", kf = "fam:" + norm(fn);
      (fams[kf] = fams[kf] || novoAcc(kf, fn));
      somar(fams[kf], el, p); fams[kf].uids.push(el.uid);
    }
    function lst(o) { return Object.keys(o).map(function (k) { return o[k]; }).sort(porKN); }
    var fisicas = lista.length - naoFis;
    return {
      itens: itens, total: carga, solo: solo,
      porTipo: lst(tipos), porMaterial: lst(mats), porFamilia: lst(fams),
      semPeso: sem, motivos: Object.keys(motivos).map(function (m) { return { motivo: m, n: motivos[m] }; }).sort(function (a, b) { return b.n - a.n; }),
      naoFisicos: naoFis, fisicas: fisicas,
      comPeso: carga.comPeso + solo.comPeso,
      cobertura: fisicas > 0 ? (carga.comPeso + solo.comPeso) / fisicas : 0
    };
  }

  /* fatia (%) de um peso no peso próprio da construção; null quando não há
     base para dividir (melhor "—" na tela do que 0 % ou infinito) */
  function participacao(kN, totalKN) {
    if (!(num(totalKN) > 0) || !(num(kN) >= 0)) return null;
    return num(kN) / num(totalKN) * 100;
  }

  /* ---------------------------------------------------------------
   * relatorio — o que vai para a planilha: peça a peça (da seleção, ou de
   * tudo), por tipo, e os totais com a fatia de cada um no peso próprio
   * ------------------------------------------------------------- */
  function relatorio(elementos, uidsSel, opts) {
    var r = resumo(elementos, opts), base = r.total.kN;
    var sel = null;
    if (uidsSel && uidsSel.length) { sel = {}; uidsSel.forEach(function (u) { sel[u] = 1; }); }
    var linhas = [], selAcc = novoAcc("sel", "Seleção"), tiposSel = {};
    r.itens.forEach(function (it) {
      if (it.p.naoFisico) return;
      if (sel && !sel[it.el.uid]) return;
      var el = it.el, p = it.p;
      linhas.push({
        uid: el.uid, nome: txt(el.nomeIfc) || txt(el.descricao) || txt(el.nome) || classe(el), tipo: rotuloTipo(el), classe: classe(el),
        familia: txt(el.familia), material: (el.materiais || []).map(function (m) { return txt(m.n); }).join(" + "),
        volume: p.volume || null, volFonte: p.volFonte || "", kNm3: p.gama ? p.gama.kNm3 : null, refGama: p.gama ? p.gama.ref : (p.refPeca || ""),
        kg: p.ok ? p.kg : null, kN: p.ok ? p.kN : null, pct: p.ok && !p.solo ? participacao(p.kN, base) : null,
        fonte: p.ok ? p.fonte : "", estimado: !!p.estimado, solo: !!p.solo, motivo: p.ok ? "" : p.motivo
      });
      somar(selAcc, el, p);
      var rt = rotuloTipo(el), kt = "tipo:" + norm(rt);
      (tiposSel[kt] = tiposSel[kt] || novoAcc(kt, rt));
      somar(tiposSel[kt], el, p);
    });
    linhas.sort(function (a, b) { return num(b.kN) - num(a.kN) || String(a.nome).localeCompare(String(b.nome)); });
    var porTipo = Object.keys(tiposSel).map(function (k) { var t = tiposSel[k]; t.pct = participacao(t.kN, base); return t; }).sort(porKN);
    selAcc.pct = participacao(selAcc.kN, base);
    return { linhas: linhas, porTipo: porTipo, selecao: selAcc, total: r.total, solo: r.solo, cobertura: r.cobertura, ehSelecao: !!sel, motivos: r.motivos };
  }

  /* ---------------------------------------------------------------
   * csv — a planilha (ponto e vírgula, vírgula decimal: abre direto no
   * Excel em português)
   * ------------------------------------------------------------- */
  function nbr(v, casas) {
    if (v == null || !isFinite(v)) return "";
    return (+v).toFixed(casas).replace(".", ",");
  }
  function cel(s) { s = String(s == null ? "" : s); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function csv(rel) {
    var L = [];
    L.push(["Peça", "Tipo", "Família", "Material", "Volume (m³)", "Origem do volume", "Peso específico (kN/m³)", "Peso (kg)", "Peso (kN)", "Participação no peso próprio (%)", "Origem do peso", "Observação"].map(cel).join(";"));
    (rel.linhas || []).forEach(function (l) {
      var origem = l.fonte === "ifc" ? "massa do IFC" : l.fonte === "peca" ? "peso por peça informado" : l.fonte === "malha" ? "volume da malha (estimado) × peso específico" : l.fonte === "volume" ? "volume do IFC × peso específico" : "";
      var obs = l.motivo || (l.solo ? "solo/aterro — fora da participação" : "") || l.refGama;
      L.push([l.nome, l.tipo, l.familia, l.material, nbr(l.volume, 4), l.volFonte === "malha" ? "malha (estimado)" : l.volFonte === "ifc" ? "IFC" : "",
        nbr(l.kNm3, 2), nbr(l.kg, 1), nbr(l.kN, 3), nbr(l.pct, 2), origem, obs].map(cel).join(";"));
    });
    L.push("");
    L.push(["Por tipo", "Peças", "Com peso", "Peso (kg)", "Peso (kN)", "Participação (%)"].map(cel).join(";"));
    (rel.porTipo || []).forEach(function (t) { L.push([t.rotulo, t.n, t.comPeso, nbr(t.kg, 1), nbr(t.kN, 3), nbr(t.pct, 2)].map(cel).join(";")); });
    L.push("");
    var s = rel.selecao || {};
    L.push([rel.ehSelecao ? "Total da seleção" : "Total", s.n, s.comPeso, nbr(s.kg, 1), nbr(s.kN, 3), nbr(s.pct, 2)].map(cel).join(";"));
    L.push(["Peso próprio da construção (base da participação)", rel.total ? rel.total.comPeso : "", "", nbr(rel.total && rel.total.kg, 1), nbr(rel.total && rel.total.kN, 3), "100,00"].map(cel).join(";"));
    return "﻿" + L.join("\r\n");
  }

  /* ---------------------------------------------------------------
   * SELEÇÃO POR TIPO — "todos os pilares + os vidros"
   * grupos(el, 'tipo'|'material'|'familia') → [{chave, rotulo, uids, n}]
   * uidsDe(grupos escolhidos) → a UNIÃO, sem repetir peça
   * ------------------------------------------------------------- */
  function grupos(elementos, criterio, opts) {
    var r = resumo(elementos, opts);
    var g = criterio === "material" ? r.porMaterial : criterio === "familia" ? r.porFamilia : r.porTipo;
    return g.map(function (x) { return { chave: x.chave, rotulo: x.rotulo, uids: x.uids.slice(), n: x.n, kN: x.kN, comPeso: x.comPeso }; });
  }
  function uidsDe(listaGrupos, chaves) {
    var quer = {}, vistos = {}, out = [];
    (chaves || []).forEach(function (c) { quer[c] = 1; });
    (listaGrupos || []).forEach(function (g) {
      if (!quer[g.chave]) return;
      g.uids.forEach(function (u) { if (!vistos[u]) { vistos[u] = 1; out.push(u); } });
    });
    return out;
  }
  /* ---------------------------------------------------------------
   * pesosDoModelo — a lista que o engenheiro confere e corrige: cada
   * MATERIAL do modelo (um por nome, não a combinação da peça) com o γ que
   * está valendo e de onde ele veio, e cada CLASSE de peça que chegou sem
   * material nenhum. É aqui que "Compensado naval" sem peso na tabela vira
   * um número informado — e passa a pesar.
   * ------------------------------------------------------------- */
  function pesosDoModelo(elementos, opts) {
    var mats = {}, classes = {}, pecas = {}, ordem = [];
    var pp = (opts && opts.pesosPeca) || {};
    (elementos || []).forEach(function (el) {
      if (!el || NAO_FISICO[classe(el)]) return;
      /* equipamento/mobiliário sem massa no IFC: o que se informa é o peso POR
         PEÇA (kg), não o peso específico do material */
      if (SO_MASSA[classe(el)]) {
        if (num(el.qto && el.qto.massa) > 0) return;
        var kp = chavePeca(el);
        if (!pecas[kp]) {
          var u0 = pp[kp];
          pecas[kp] = { chave: kp, nome: rotuloPeca(el), n: 0, porPeca: true, classe: classe(el),
            gama: (u0 && num(u0.kg) > 0) ? { kg: num(u0.kg), origem: "usuario", ref: txt(u0.ref) || "informado pelo usuário" } : null };
          ordem.push(pecas[kp]);
        }
        pecas[kp].n++;
        return;
      }
      var ms = Array.isArray(el.materiais) ? el.materiais.filter(function (m) { return m && txt(m.n); }) : [];
      if (!ms.length) {
        var kc = chaveClasse(classe(el));
        if (!classes[kc]) { classes[kc] = { chave: kc, nome: rotuloTipo(el) + " (sem material no IFC)", n: 0, semMaterial: true, classe: classe(el) }; ordem.push(classes[kc]); }
        classes[kc].n++;
        return;
      }
      ms.forEach(function (m) {
        var k = chaveMaterial(m.n);
        if (!mats[k]) { mats[k] = { chave: k, nome: txt(m.n), n: 0, rho: m.rho || null }; ordem.push(mats[k]); }
        mats[k].n++;
      });
    });
    var dens = (opts && opts.densidades) || {};
    ordem.forEach(function (x) {
      if (x.porPeca) return;
      if (x.semMaterial) {
        var u = dens[x.chave];
        x.gama = (u && num(u.kNm3) > 0) ? { kNm3: num(u.kNm3), origem: "usuario", ref: txt(u.ref) || "informado pelo usuário" } : null;
      } else x.gama = gamaDoMaterial({ n: x.nome, rho: x.rho }, opts);
    });
    /* sem peso primeiro (é o que precisa de mão), depois os que mais aparecem */
    return ordem.sort(function (a, b) { return (a.gama ? 1 : 0) - (b.gama ? 1 : 0) || b.n - a.n || a.nome.localeCompare(b.nome); });
  }

  /* liga/desliga uma peça na seleção de peso (o clique no modelo) */
  function alternar(uids, uid) {
    var l = (uids || []).slice(), i = l.indexOf(uid);
    if (!uid) return l;
    if (i >= 0) l.splice(i, 1); else l.push(uid);
    return l;
  }

  var BimPeso = {
    G: G, TABELA: TABELA, NAO_FISICO: NAO_FISICO,
    SO_MASSA: SO_MASSA, chavePeca: chavePeca,
    norm: norm, palavras: palavras, rotuloTipo: rotuloTipo, chaveMaterial: chaveMaterial, chaveClasse: chaveClasse,
    casarMaterial: casarMaterial, gamaMaterial: gamaDoMaterial, pesoEspecifico: pesoEspecifico, pesoDe: pesoDe, pesosDoModelo: pesosDoModelo,
    resumo: resumo, participacao: participacao, relatorio: relatorio, csv: csv,
    grupos: grupos, uidsDe: uidsDe, alternar: alternar
  };
  global.BimPeso = BimPeso;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPeso;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

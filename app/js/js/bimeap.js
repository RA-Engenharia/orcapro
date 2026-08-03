/* =====================================================================
 * bimeap.js — Agente EAP: modelo BIM (IFC) → etapas + serviços de obra
 * Motor PURO (ES5, Node-testável, sem DOM, sem Store, sem Bases).
 *
 * Recebe os elementos do viewer (js/bim.js via gestao._bimElementos):
 *   { id:'mid:eid', uid, arquivo, tipo:'IFCWALL...', nome, etapa|null (carimbo
 *     OrcaPRO_Etapa do plugin Revit), codOrc|null (OrcaPRO_CodOrc),
 *     fase|null (OrcaPRO_Fase: 'nova'|'demolir'|'existente'),
 *     qto:{comprimento,area,volume,contagem}|null (BaseQuantities m/m²/m³),
 *     aabb:{min:[],max:[]}|undefined (metros), disciplina:'arquitetura'|... }
 *
 * Devolve um PLANO: etapas na ordem de execução, cada uma com serviços
 * quantificados, rastreio por elemento (arquivo + expressID), memorial de
 * cálculo legível e termos de busca p/ casar SINAPI no wizard.
 *
 * Honestidade RA (regras de ouro):
 *  - NUNCA inventa código SINAPI nem preço — serviço sem match fica pendente;
 *  - quantidade vem do IFC (BaseQuantities) ou da caixa envolvente (marcada
 *    'estimado' com aviso); sem medida → só contagem, nunca chute;
 *  - forma/armadura/estrutura de telhado NÃO são deriváveis do IFC → viram
 *    avisos explícitos no checklist (jamais itens com número inventado);
 *  - elemento com fase 'existente' (reforma) fica FORA do orçamento;
 *  - todo fator aplicado (faces de parede, empolamento de entulho) é
 *    declarado no memorial e ajustável.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmt(v) { // número BR simples p/ memorial (sem depender de Util)
    var s = (Math.round(v * 100) / 100).toFixed(2);
    var p = s.split("."); return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + p[1];
  }

  // ---------- exclusões (mesma régua do BIMQto: espaciais/aberturas fora) ----------
  var EXCLUIR_PREFIXO = ["IFCOPENING", "IFCVIRTUAL"];
  var EXCLUIR_EXATO = { IFCSPACE: 1, IFCSITE: 1, IFCBUILDING: 1, IFCBUILDINGSTOREY: 1, IFCPROJECT: 1, IFCGRID: 1, IFCANNOTATION: 1, IFCSPATIALZONE: 1, IFCZONE: 1 };
  var MOBILIARIO_PREFIXO = ["IFCFURNISHING", "IFCFURNITURE", "IFCSYSTEMFURNITURE"];

  // ---------- disciplinas (ordem = ordem de execução = ordem das etapas) ----------
  // cats = id do Cronograma.CATS (prazo/4D); esperada = entra no checklist "não esquecer"
  var DISCIPLINAS = [
    { id: "preliminares", nome: "Serviços preliminares", cats: "preliminares", esperada: false },
    { id: "demolicao", nome: "Demolição e retiradas", cats: "demolicao", esperada: false },
    { id: "fundacao", nome: "Fundações", cats: "fundacao", esperada: true },
    { id: "estrutura", nome: "Estrutura", cats: "estrutura", esperada: true },
    { id: "alvenaria", nome: "Alvenaria e vedações", cats: "alvenaria", esperada: true },
    { id: "cobertura", nome: "Cobertura", cats: "cobertura", esperada: true },
    { id: "esquadrias", nome: "Esquadrias", cats: "esquadrias", esperada: true },
    { id: "hidraulica", nome: "Instalações hidrossanitárias", cats: "instalacoes", esperada: true },
    { id: "eletrica", nome: "Instalações elétricas", cats: "instalacoes", esperada: true },
    { id: "mecanica", nome: "Instalações mecânicas / AVAC", cats: "instalacoes", esperada: false },
    { id: "revestimento", nome: "Revestimentos", cats: "revestimento", esperada: false },
    { id: "pintura", nome: "Pintura", cats: "pintura", esperada: false },
    { id: "loucas", nome: "Louças e metais", cats: "loucas", esperada: false },
    { id: "diversos", nome: "Diversos (elementos genéricos)", cats: "outros", esperada: false },
    { id: "limpeza", nome: "Limpeza final", cats: "limpeza", esperada: false }
  ];

  /* ---------- REGRAS por tipo IFC (o cérebro do agente) ----------
   * match por PREFIXO (mais longo primeiro), com desempate por disciplina do
   * modelo quando o tipo IFC é ambíguo (IFC2x3 usa IFCFLOWSEGMENT p/ tubo,
   * eletroduto E duto — quem separa é a disciplina do arquivo federado).
   * medida: 'area'|'volume'|'comprimento'|'contagem'  unidade: rótulo BR
   * termos: sementes de busca SINAPI (o wizard mostra candidatos; nunca crava)
   * deriva: serviços-filho (parede-cebola) com fator × quantidade do pai
   */
  var REGRAS = [
    // --- fundações ---
    { id: "fundacao-bloco", tipos: ["IFCFOOTING"], disc: "fundacao", nome: "Concreto estrutural em fundações (sapatas/blocos)", medida: "volume", unidade: "m³", termos: ["concreto", "fundacao"], estrut: "fundacao" },
    { id: "fundacao-estaca", tipos: ["IFCPILE"], disc: "fundacao", nome: "Estaca de fundação", medida: "comprimento", unidade: "m", termos: ["estaca"] },
    // --- estrutura ---
    { id: "estrutura-pilar", tipos: ["IFCCOLUMN"], disc: "estrutura", nome: "Concreto estrutural em pilares", medida: "volume", unidade: "m³", termos: ["concretagem", "pilar"], estrut: "pilar" },
    { id: "estrutura-viga", tipos: ["IFCBEAM"], disc: "estrutura", nome: "Concreto estrutural em vigas", medida: "volume", unidade: "m³", termos: ["concretagem", "viga"], estrut: "viga" },
    { id: "estrutura-laje", tipos: ["IFCSLAB"], disc: "estrutura", nome: "Concreto em lajes / pisos estruturais", medida: "volume", unidade: "m³", termos: ["concretagem", "laje"], estrut: "laje" },
    { id: "estrutura-escada", tipos: ["IFCSTAIR"], disc: "estrutura", nome: "Escada (estrutura)", medida: "contagem", unidade: "un", termos: ["escada", "concreto"] },
    { id: "estrutura-metalica", tipos: ["IFCMEMBER", "IFCPLATE"], disc: "estrutura", nome: "Estrutura metálica (perfis/chapas)", medida: "comprimento", unidade: "m", termos: ["estrutura", "metalica"], aviso: "peso em kg não é derivável do IFC — confirme com o projeto estrutural" },
    { id: "estrutura-armadura", tipos: ["IFCREINFORCING"], disc: "estrutura", nome: "Armadura (barras modeladas)", medida: "comprimento", unidade: "m", termos: ["armadura", "aco"], aviso: "kg de aço exige bitola do projeto — o IFC só dá o comprimento" },
    // --- alvenaria (+ cebola: derivados de revestimento e pintura) ---
    {
      id: "alvenaria-parede", tipos: ["IFCWALL"], disc: "alvenaria", nome: "Alvenaria de vedação", medida: "area", unidade: "m²", termos: ["alvenaria", "vedacao"],
      deriva: [
        { id: "cebola-chapisco", disc: "revestimento", nome: "Chapisco em paredes", unidade: "m²", termos: ["chapisco", "alvenaria"], fatorFaces: true },
        { id: "cebola-massa", disc: "revestimento", nome: "Massa única / reboco em paredes", unidade: "m²", termos: ["massa", "unica"], fatorFaces: true },
        { id: "cebola-pintura", disc: "pintura", nome: "Pintura látex em paredes (2 demãos)", unidade: "m²", termos: ["pintura", "latex"], fatorFaces: true }
      ]
    },
    { id: "alvenaria-cortina", tipos: ["IFCCURTAINWALL"], disc: "alvenaria", nome: "Fachada cortina / pele de vidro", medida: "area", unidade: "m²", termos: ["vidro", "temperado"] },
    // --- cobertura ---
    { id: "cobertura-telhado", tipos: ["IFCROOF"], disc: "cobertura", nome: "Telhamento (cobertura)", medida: "area", unidade: "m²", termos: ["telhamento"], aviso: "estrutura de apoio do telhado (trama/madeiramento) não é derivável do IFC — acrescente conforme o projeto" },
    // --- esquadrias ---
    { id: "esquadria-porta", tipos: ["IFCDOOR"], disc: "esquadrias", nome: "Porta (fornecimento e instalação)", medida: "contagem", unidade: "un", termos: ["porta"] },
    { id: "esquadria-janela", tipos: ["IFCWINDOW"], disc: "esquadrias", nome: "Janela (fornecimento e instalação)", medida: "contagem", unidade: "un", termos: ["janela"] },
    { id: "esquadria-guardacorpo", tipos: ["IFCRAILING"], disc: "esquadrias", nome: "Guarda-corpo / corrimão", medida: "comprimento", unidade: "m", termos: ["guarda", "corpo"] },
    // --- revestimentos diretos ---
    { id: "revestimento-forro", tipos: ["IFCCOVERING"], disc: "revestimento", nome: "Revestimento / forro", medida: "area", unidade: "m²", termos: ["revestimento"] },
    // --- hidrossanitário (IFC4 nomeado + IFC2x3 por disciplina do modelo) ---
    { id: "hidraulica-tubo", tipos: ["IFCPIPESEGMENT"], disc: "hidraulica", nome: "Tubulação hidrossanitária", medida: "comprimento", unidade: "m", termos: ["tubo", "pvc"], aviso: "o IFC não separa por diâmetro — agregue por trecho se o edital exigir" },
    { id: "hidraulica-conexao", tipos: ["IFCPIPEFITTING"], disc: "hidraulica", nome: "Conexões hidráulicas", medida: "contagem", unidade: "un", termos: ["pvc"] },
    { id: "hidraulica-registro", tipos: ["IFCVALVE"], disc: "hidraulica", nome: "Registros / válvulas", medida: "contagem", unidade: "un", termos: ["registro"] },
    { id: "loucas-sanitario", tipos: ["IFCSANITARYTERMINAL"], disc: "loucas", nome: "Louças e metais sanitários", medida: "contagem", unidade: "un", termos: ["vaso", "sanitario"] },
    // --- elétrica ---
    { id: "eletrica-eletroduto", tipos: ["IFCCABLECARRIERSEGMENT", "IFCCONDUITSEGMENT", "IFCCABLESEGMENT"], disc: "eletrica", nome: "Eletrodutos / eletrocalhas / cabos", medida: "comprimento", unidade: "m", termos: ["eletroduto"] },
    { id: "eletrica-luminaria", tipos: ["IFCLIGHTFIXTURE"], disc: "eletrica", nome: "Luminárias", medida: "contagem", unidade: "un", termos: ["luminaria"] },
    { id: "eletrica-tomada", tipos: ["IFCOUTLET"], disc: "eletrica", nome: "Tomadas (pontos)", medida: "contagem", unidade: "un", termos: ["tomada"] },
    { id: "eletrica-interruptor", tipos: ["IFCSWITCHINGDEVICE"], disc: "eletrica", nome: "Interruptores (pontos)", medida: "contagem", unidade: "un", termos: ["interruptor"] },
    { id: "eletrica-quadro", tipos: ["IFCELECTRICDISTRIBUTIONBOARD", "IFCDISTRIBUTIONBOARD", "IFCELECTRICAPPLIANCE"], disc: "eletrica", nome: "Quadros / equipamentos elétricos", medida: "contagem", unidade: "un", termos: ["quadro", "distribuicao"] },
    // --- mecânica / AVAC ---
    { id: "mecanica-duto", tipos: ["IFCDUCTSEGMENT", "IFCDUCTFITTING"], disc: "mecanica", nome: "Dutos de ar", medida: "comprimento", unidade: "m", termos: ["duto"] },
    // --- IFC2x3: ocorrências MEP genéricas — a DISCIPLINA do modelo decide ---
    { id: "mep-trecho", tipos: ["IFCFLOWSEGMENT"], disc: "@disciplina", nome: "@Tubulação/eletroduto (trechos)", medida: "comprimento", unidade: "m", termos: null },
    { id: "mep-conexao", tipos: ["IFCFLOWFITTING"], disc: "@disciplina", nome: "@Conexões", medida: "contagem", unidade: "un", termos: null },
    { id: "mep-terminal", tipos: ["IFCFLOWTERMINAL"], disc: "@disciplina", nome: "@Pontos/terminais", medida: "contagem", unidade: "un", termos: null },
    { id: "mep-controle", tipos: ["IFCFLOWCONTROLLER"], disc: "@disciplina", nome: "@Registros/controles", medida: "contagem", unidade: "un", termos: null },
    // --- genéricos ---
    { id: "diversos-generico", tipos: ["IFCBUILDINGELEMENTPROXY"], disc: "diversos", nome: "Elementos genéricos do modelo", medida: "contagem", unidade: "un", termos: null, pendente: true, aviso: "elemento genérico (proxy) — identifique o serviço manualmente" }
  ];

  // IFC2x3 genérico → serviço concreto conforme a disciplina do MODELO
  var MEP_POR_DISCIPLINA = {
    "mep-trecho": {
      hidraulica: { disc: "hidraulica", nome: "Tubulação hidrossanitária", termos: ["tubo", "pvc"] },
      eletrica: { disc: "eletrica", nome: "Eletrodutos (trechos)", termos: ["eletroduto"] },
      mecanica: { disc: "mecanica", nome: "Dutos de ar (trechos)", termos: ["duto"] }
    },
    "mep-conexao": {
      hidraulica: { disc: "hidraulica", nome: "Conexões hidráulicas", termos: ["pvc"] },
      eletrica: { disc: "eletrica", nome: "Caixas e conexões elétricas", termos: ["caixa", "eletrica"] },
      mecanica: { disc: "mecanica", nome: "Conexões de dutos", termos: ["duto"] }
    },
    "mep-terminal": {
      hidraulica: { disc: "loucas", nome: "Louças / pontos hidráulicos", termos: ["vaso", "sanitario"] },
      eletrica: { disc: "eletrica", nome: "Pontos elétricos (terminais)", termos: ["tomada"] },
      mecanica: { disc: "mecanica", nome: "Terminais de ar (grelhas/difusores)", termos: ["grelha"] }
    },
    "mep-controle": {
      hidraulica: { disc: "hidraulica", nome: "Registros / válvulas", termos: ["registro"] },
      eletrica: { disc: "eletrica", nome: "Dispositivos de proteção", termos: ["disjuntor"] },
      mecanica: { disc: "mecanica", nome: "Dampers / controles", termos: ["duto"] }
    }
  };

  // demolição (reforma): tipo do elemento demolido → serviço de demolição
  var DEMOLICAO = [
    { tipos: ["IFCWALL", "IFCCURTAINWALL"], nome: "Demolição de alvenaria / vedações", medida: "area", unidade: "m²", termos: ["demolicao", "alvenaria"] },
    { tipos: ["IFCSLAB", "IFCBEAM", "IFCCOLUMN", "IFCFOOTING", "IFCSTAIR"], nome: "Demolição de concreto", medida: "volume", unidade: "m³", termos: ["demolicao", "concreto"] },
    { tipos: ["IFCCOVERING", "IFCROOF"], nome: "Retirada de revestimentos / cobertura", medida: "area", unidade: "m²", termos: ["remocao"] },
    { tipos: ["IFCDOOR", "IFCWINDOW"], nome: "Retirada de esquadrias", medida: "contagem", unidade: "un", termos: ["retirada", "esquadria"] }
  ];
  var DEMOLICAO_GENERICA = { nome: "Remoções diversas (reforma)", medida: "contagem", unidade: "un", termos: ["remocao"] };

  var DEFAULTS = { cebola: true, faces: 2, fatorEmpolamento: 1.3, incluirPreliminares: true, incluirLimpeza: true, estimarEstrutura: true };

  /* Taxas PARAMÉTRICAS de aço (kg por m³ de concreto) — faixas usuais da prática de projeto
   * estrutural brasileiro (fundação 60-90, pilar 90-130, viga 80-120, laje maciça 70-90).
   * São ESTIMATIVA declarada e ajustável no assistente — o projeto estrutural, quando
   * existir, substitui esses números. A fôrma NÃO usa taxa: sai da geometria de cada peça. */
  var TAXAS_ACO = { fundacao: 70, pilar: 110, viga: 100, laje: 80 };
  var ESTRUT_INFO = {
    fundacao: { rot: "fundações", acoTermos: ["armacao", "sapata"], formaTermos: ["forma", "sapata"] },
    pilar: { rot: "pilares", acoTermos: ["armacao", "pilar"], formaTermos: ["forma", "pilar"] },
    viga: { rot: "vigas", acoTermos: ["armacao", "viga"], formaTermos: ["forma", "viga"] },
    laje: { rot: "lajes", acoTermos: ["armacao", "laje"], formaTermos: ["forma", "laje"] }
  };
  // fôrma pela GEOMETRIA da caixa de cada peça, ORIENTADA pelo eixo vertical REAL do mundo do
  // viewer (Y — o modelRoot já converteu IFC Z-up p/ Three Y-up). Ordenar por tamanho descartaria
  // a orientação e erraria viga chata (+40%) e sapata alta (−25%).
  // pilar: perímetro da seção (planta) × altura · viga: fundo + 2 laterais × vão ·
  // laje: fundo (planta; a área MEDIDA do IFC tem prioridade no chamador) · fundação: laterais
  function formaAabb(modo, aabb) {
    if (!aabb || !aabb.min || !aabb.max) return 0;
    var dx = Math.abs(aabb.max[0] - aabb.min[0]);
    var dy = Math.abs(aabb.max[1] - aabb.min[1]); // VERTICAL (altura real da peça)
    var dz = Math.abs(aabb.max[2] - aabb.min[2]);
    if (modo === "pilar") return 2 * (dx + dz) * dy;
    if (modo === "viga") { var vao = Math.max(dx, dz), b = Math.min(dx, dz); return (b + 2 * dy) * vao; }
    if (modo === "laje") return dx * dz;
    if (modo === "fundacao") return 2 * (dx + dz) * dy;
    return 0;
  }

  // ---------- helpers ----------
  function tipoBase(tipo) { return String(tipo || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function excluivel(tipo) {
    // exatos de propósito: IFCSPACEHEATER começa com IFCSPACE mas é orçável (mesma régua do BIMQto)
    var t = tipoBase(tipo);
    if (EXCLUIR_EXATO[t]) return true;
    for (var i = 0; i < EXCLUIR_PREFIXO.length; i++) if (t.indexOf(EXCLUIR_PREFIXO[i]) === 0) return true;
    return false;
  }
  function ehMobiliario(tipo) {
    var t = tipoBase(tipo);
    for (var i = 0; i < MOBILIARIO_PREFIXO.length; i++) if (t.indexOf(MOBILIARIO_PREFIXO[i]) === 0) return true;
    return false;
  }
  function regraDe(tipo) { // prefixo mais longo vence
    var t = tipoBase(tipo), melhor = null, tam = 0;
    for (var i = 0; i < REGRAS.length; i++) {
      var r = REGRAS[i];
      for (var j = 0; j < r.tipos.length; j++) {
        var p = r.tipos[j];
        if (t.indexOf(p) === 0 && p.length > tam) { melhor = r; tam = p.length; }
      }
    }
    return melhor;
  }
  function demolicaoDe(tipo) {
    var t = tipoBase(tipo);
    for (var i = 0; i < DEMOLICAO.length; i++) {
      var d = DEMOLICAO[i];
      for (var j = 0; j < d.tipos.length; j++) if (t.indexOf(d.tipos[j]) === 0) return d;
    }
    return DEMOLICAO_GENERICA;
  }
  function bboxDim(aabb) {
    if (!aabb || !aabb.min || !aabb.max) return null;
    var d = [Math.abs(aabb.max[0] - aabb.min[0]), Math.abs(aabb.max[1] - aabb.min[1]), Math.abs(aabb.max[2] - aabb.min[2])];
    d.sort(function (a, b) { return b - a; });
    return d; // [maior, media, menor]
  }
  // mede o elemento numa grandeza: IFC (exato) > caixa envolvente (estimado) > sem-medida
  function medir(el, medida) {
    if (medida === "contagem") return { v: 1, fonte: "contagem" };
    var q = el.qto && num(el.qto[medida]);
    if (q > 0) return { v: q, fonte: "ifc" };
    var d = bboxDim(el.aabb);
    if (d) {
      if (medida === "comprimento" && d[0] > 0) return { v: d[0], fonte: "estimado" };
      if (medida === "area" && d[0] * d[1] > 0) return { v: d[0] * d[1], fonte: "estimado" };
      if (medida === "volume" && d[0] * d[1] * d[2] > 0) return { v: d[0] * d[1] * d[2], fonte: "estimado" };
    }
    return { v: 0, fonte: "sem-medida" };
  }
  function expressIdDe(el) { // gestao remapeia id p/ uid 'mid:eid' — recupera o expressID durável
    var s = String(el.uid || el.id || "");
    var p = s.split(":");
    return p.length > 1 ? p[p.length - 1] : s;
  }
  function fonteAgregada(nIfc, nEst, nCont, nSem) {
    if (nCont > 0 && nIfc === 0 && nEst === 0) return "contagem";
    if (nIfc > 0 && nEst === 0) return "ifc";
    if (nIfc === 0 && nEst > 0) return "estimado";
    if (nIfc > 0 && nEst > 0) return "misto";
    return nSem > 0 ? "sem-medida" : "contagem";
  }
  function normalizar(s) {
    return String(s || "").toLowerCase()
      .replace(/[áàâã]/g, "a").replace(/[éèê]/g, "e").replace(/[íì]/g, "i")
      .replace(/[óòôõ]/g, "o").replace(/[úù]/g, "u").replace(/ç/g, "c")
      .replace(/\s+/g, " ").trim();
  }

  var Bimeap = {

    DISCIPLINAS: DISCIPLINAS,
    REGRAS: REGRAS,

    /* unidade SINAPI → grandeza mensurável (null = não derivável da geometria: kg, sc, h, vb...) */
    grandezaDaUnidade: function (un) {
      var u = normalizar(un).replace(/²/g, "2").replace(/³/g, "3").replace(/[^a-z0-9]/g, "");
      if (u === "m2" || u === "m²") return "area";
      if (u === "m3" || u === "m³") return "volume";
      if (u === "m" || u === "ml") return "comprimento";
      if (u === "un" || u === "und" || u === "uni" || u === "pc" || u === "cj" || u === "par" || u === "jg" || u === "pt" || u === "pca") return "contagem";
      return null;
    },

    /* quantidade do serviço na unidade da composição escolhida (carimbados) */
    quantidadeDoServico: function (sv, unidade) {
      var g = this.grandezaDaUnidade(unidade);
      if (!g) return null; // kg/sc/vb: não derivável — o wizard exige quantidade manual
      var v = sv.somas ? num(sv.somas[g]) : 0;
      return v > 0 ? r2(v) : (g === "contagem" ? sv.nElementos : null);
    },

    /* fonte REAL da quantidade na unidade escolhida (a caixa envolvente nunca vira "medido no IFC") */
    fonteDaQuantidade: function (sv, unidade) {
      var g = this.grandezaDaUnidade(unidade);
      if (g === "contagem") return "contagem";
      if (g && sv.fontes && sv.fontes[g]) return sv.fontes[g];
      return sv.fonte;
    },

    /* confiança 0-100 de um candidato SINAPI p/ um serviço (mesma régua do Escopo) */
    pontuar: function (sv, itemBase) {
      if (!itemBase) return 0;
      if (sv.carimbo && sv.carimbo.codOrc && String(itemBase.codigo) === String(sv.carimbo.codOrc)) return 100;
      var termos = sv.termos || [], desc = normalizar(itemBase.descricao);
      if (!termos.length) return 30;
      var acertos = 0;
      for (var i = 0; i < termos.length; i++) if (desc.indexOf(normalizar(termos[i])) > -1) acertos++;
      var conf = (acertos / termos.length) * 80;
      var gU = this.grandezaDaUnidade(itemBase.unidade), gS = sv.medida;
      if (gU && gS && gU === gS) conf += 20;
      return Math.round(conf);
    },

    /* memorial de cálculo rastreável do serviço (ids IFC + fórmula + fonte REAL da grandeza usada) */
    memorial: function (sv, quantidadeFinal, unidadeFinal) {
      var linhas = [];
      var arqs = {}; (sv.elementos || []).forEach(function (e) { arqs[e.a] = (arqs[e.a] || 0) + 1; });
      var arqsTxt = Object.keys(arqs).map(function (a) { return a + " (" + arqs[a] + " elem.)"; }).join(", ");
      linhas.push("Gerado do modelo BIM — " + arqsTxt + ".");
      // grandeza e fonte REALMENTE usadas na quantidade final (podem diferir da medida da regra);
      // paramétrico (kg): o Σ é da grandeza-BASE (volume) — a unidade final não é geométrica
      var gF = this.grandezaDaUnidade(unidadeFinal || sv.unidade);
      var rot = gF || sv.medidaBase || sv.medida;
      var f = this.fonteDaQuantidade(sv, unidadeFinal || sv.unidade);
      if (sv.derivadoDe) {
        linhas.push("Derivado de “" + sv.derivadoDe + "”: " + fmt(sv.quantidadeBase) + " m² × " + sv.fator + " face(s) = " + fmt(num(quantidadeFinal)) + " " + (unidadeFinal || sv.unidade) + " (receita padrão parede — ajuste se houver face externa com outro acabamento).");
      } else if (sv.fator && sv.fator !== 1) {
        linhas.push("Σ " + rot + " dos elementos = " + fmt(sv.quantidadeBase) + " × fator " + String(sv.fator).replace(".", ",") + " (declarado, ajustável) = " + fmt(num(quantidadeFinal)) + " " + (unidadeFinal || sv.unidade) + ".");
      } else if (gF === "contagem" || (!gF && sv.medida === "contagem" && num(quantidadeFinal) === sv.nElementos)) {
        linhas.push("Contagem de elementos no modelo = " + sv.nElementos + " " + (unidadeFinal || "un") + ".");
      } else {
        linhas.push("Σ " + rot + " dos elementos = " + fmt(num(quantidadeFinal)) + " " + (unidadeFinal || sv.unidade) + ".");
      }
      if (f === "ifc") linhas.push("Fonte: medido no IFC (BaseQuantities).");
      else if (f === "estimado") linhas.push("Fonte: ESTIMADO pela caixa envolvente (o IFC não trouxe BaseQuantities) — revisar antes de fechar preço.");
      else if (f === "misto") linhas.push("Fonte: " + Math.max(0, sv.nElementos - sv.nEstimados - sv.nSemMedida) + " medidos no IFC + " + sv.nEstimados + " estimados pela caixa envolvente — revisar os estimados.");
      else if (f === "contagem") linhas.push("Fonte: contagem de elementos do modelo.");
      else if (f === "parametrico") linhas.push("Fonte: ESTIMATIVA do agente (taxa/geometria — detalhe abaixo), nunca medição.");
      else if (f === "sem-medida") linhas.push("Fonte: SEM medida derivável do modelo nesta unidade — quantidade informada manualmente.");
      if (sv.memorialExtra) linhas.push(sv.memorialExtra);
      if (sv.nSemMedida > 0) linhas.push("Atenção: " + sv.nSemMedida + " elemento(s)/serviço(s) sem medida no IFC não somaram quantidade.");
      var ids = (sv.elementos || []).slice(0, 30).map(function (e) { return e.a + "#" + e.e; }).join(", ");
      if (sv.elementos && sv.elementos.length > 30) ids += " (+" + (sv.elementos.length - 30) + " elementos)";
      if (ids) linhas.push("Elementos: " + ids + ".");
      if (sv.carimbo && sv.carimbo.etapa) linhas.push("Etapa carimbada no Revit (OrcaPRO_Etapa): “" + sv.carimbo.etapa + "”" + (sv.carimbo.codOrc ? " · código carimbado (OrcaPRO_CodOrc): " + sv.carimbo.codOrc : "") + ".");
      linhas.push("Regra do agente: " + (sv.regra || sv.chave) + ".");
      return linhas.join(" ");
    },

    /* ================= O AGENTE ================= */
    analisar: function (elementos, opts) {
      opts = opts || {};
      var o = {};
      for (var k in DEFAULTS) o[k] = (opts[k] != null) ? opts[k] : DEFAULTS[k];

      // taxas de aço: merge por chave — null/ausente = default; 0 (ou negativo) EXPLÍCITO = desligar a
      // categoria (laje pré-moldada etc.), nunca reverter em silêncio pro default
      var taxasAco = {};
      for (var kt in TAXAS_ACO) {
        if (opts.taxasAco && opts.taxasAco[kt] != null) { var tv = num(opts.taxasAco[kt]); taxasAco[kt] = tv > 0 ? tv : 0; }
        else taxasAco[kt] = TAXAS_ACO[kt];
      }
      o.taxasAco = taxasAco;

      var els = (elementos || []).filter(function (e) { return e && (e.tipo || e.nome); });
      var avisos = [];
      // reforma com 2 IFCs federados (modelo + *_DEMOLICAO do plugin): o arquivo de demolição
      // só contribui com os DEMOLIDOS — nova/existente vêm do modelo principal (senão duplicaria)
      var temDemoArq = false, temOutroArq = false;
      els.forEach(function (e) {
        if (/_demolicao/i.test(String(e.arquivo || ""))) temDemoArq = true; else temOutroArq = true;
      });
      var nDupDemo = 0;
      if (temDemoArq && temOutroArq) {
        els = els.filter(function (e) {
          if (!/_demolicao/i.test(String(e.arquivo || ""))) return true;
          var f = String(e.fase || "").toLowerCase();
          if (f === "demolir" || f === "demolicao") return true;
          nDupDemo++; return false;
        });
        if (nDupDemo > 0) avisos.push(nDupDemo + " elemento(s) do IFC de demolição ignorados (não-demolidos — já contam no modelo principal; evita dupla contagem).");
      }
      var resumo = { nElementos: els.length, nOrcaveis: 0, nExcluidos: 0, nExistentes: 0, nDemolir: 0, nMobiliario: 0, nCarimbados: 0, nSemMedida: 0 };
      var grupos = {}; // chave -> serviço em construção
      var porDisciplina = {}; // disciplina -> nº de elementos

      function grupo(chave, base) {
        if (!grupos[chave]) {
          grupos[chave] = {
            chave: chave, regra: base.regra || null, regraBase: base.regraBase || null, disc: base.disc, nome: base.nome,
            carimbo: base.carimbo || null, medida: base.medida || null, unidade: base.unidade || null,
            termos: base.termos || null, pendente: !!base.pendente, aviso: base.aviso || null,
            somas: { area: 0, volume: 0, comprimento: 0, contagem: 0 },
            somasIfc: { area: 0, volume: 0, comprimento: 0 }, // só o MEDIDO (BaseQuantities) — o entulho usa isto
            _gr: { area: { i: 0, e: 0, s: 0 }, volume: { i: 0, e: 0, s: 0 }, comprimento: { i: 0, e: 0, s: 0 } }, // origem de cada grandeza
            estrut: base.estrut || null, somaForma: 0, _formaSem: 0, // fôrma geométrica (peça a peça, pela caixa)
            quantidade: 0, nElementos: 0, nEstimados: 0, nSemMedida: 0, _nIfc: 0, _nCont: 0,
            elementos: []
          };
        }
        return grupos[chave];
      }
      function acumular(g, el, medida) {
        var m = medir(el, medida || g.medida);
        g.nElementos++;
        if (m.fonte === "ifc") g._nIfc++;
        else if (m.fonte === "estimado") g.nEstimados++;
        else if (m.fonte === "contagem") g._nCont++;
        else { g.nSemMedida++; resumo.nSemMedida++; }
        g.quantidade += m.v;
        // somas em TODAS as grandezas (carimbado escolhe a medida depois, pela unidade da composição),
        // CONTABILIZANDO a origem de cada uma — caixa envolvente NUNCA pode se passar por BaseQuantities
        ["area", "volume", "comprimento"].forEach(function (gr) {
          var q = el.qto && num(el.qto[gr]);
          if (q > 0) { g.somas[gr] += q; g.somasIfc[gr] += q; g._gr[gr].i++; }
          else {
            var d = bboxDim(el.aabb);
            if (d) { g.somas[gr] += (gr === "comprimento" ? d[0] : gr === "area" ? d[0] * d[1] : d[0] * d[1] * d[2]); g._gr[gr].e++; }
            else g._gr[gr].s++;
          }
        });
        g.somas.contagem += 1;
        if (g.estrut) { // fôrma: laje usa a área MEDIDA do IFC quando existe (IFC exato > caixa); resto, geometria da caixa
          var qA = g.estrut === "laje" && el.qto && num(el.qto.area) > 0 ? num(el.qto.area) : 0;
          if (qA > 0) g.somaForma += qA;
          else { var fF = formaAabb(g.estrut, el.aabb); if (fF > 0) g.somaForma += fF; else g._formaSem++; }
        }
        g.elementos.push({ a: el.arquivo || "modelo", e: expressIdDe(el), tipo: tipoBase(el.tipo), v: r2(m.v) });
      }

      els.forEach(function (el) {
        var t = tipoBase(el.tipo);
        if (excluivel(t)) { resumo.nExcluidos++; return; }
        if (ehMobiliario(t)) { resumo.nMobiliario++; return; }
        var fase = normalizar(el.fase || "");
        if (fase === "existente") { resumo.nExistentes++; return; } // reforma: o que já existe não se constrói
        resumo.nOrcaveis++;

        // ---- reforma: demolição primeiro ----
        if (fase === "demolir" || fase === "demolicao") {
          resumo.nDemolir++;
          porDisciplina.demolicao = (porDisciplina.demolicao || 0) + 1;
          var d = demolicaoDe(t);
          var gd = grupo("demolicao|" + d.nome, { regra: "demolicao", disc: "demolicao", nome: d.nome, medida: d.medida, unidade: d.unidade, termos: d.termos });
          acumular(gd, el);
          return;
        }

        // ---- prioridade 1: carimbo do plugin (OrcaPRO_Etapa) ----
        if (el.etapa) {
          resumo.nCarimbados++;
          var r0 = regraDe(t);
          var disc0 = r0 ? r0.disc : "diversos";
          if (disc0 === "@disciplina") {
            var mp0 = MEP_POR_DISCIPLINA[r0.id] || {};
            var res0 = mp0[el.disciplina];
            disc0 = res0 ? res0.disc : "diversos"; // disciplina não-MEP: sem chute de hidráulica
          }
          porDisciplina[disc0] = (porDisciplina[disc0] || 0) + 1;
          // estrutural: separa o grupo por TIPO mesmo com o mesmo carimbo (pilar+laje na mesma etapa
          // NÃO podem dividir taxa de aço nem fórmula de fôrma — cada tipo tem a sua)
          var chaveC = "carimbo|" + el.etapa + "|" + (el.codOrc || (r0 ? r0.id : t)) + (r0 && r0.estrut ? "|" + r0.id : "");
          var gc = grupo(chaveC, {
            regra: "carimbo-plugin", regraBase: r0 ? r0.id : null, disc: disc0,
            nome: el.codOrc ? ("Serviço carimbado " + el.codOrc + " — " + el.etapa) : ("Elementos da etapa “" + el.etapa + "”"),
            carimbo: { etapa: el.etapa, codOrc: el.codOrc || null },
            medida: r0 ? r0.medida : "contagem", unidade: r0 ? r0.unidade : "un",
            termos: r0 ? r0.termos : null, estrut: r0 ? r0.estrut : null
          });
          acumular(gc, el);
          return;
        }

        // ---- prioridade 2: regra por tipo IFC ----
        var r = regraDe(t);
        if (!r) { // orçável sem regra: vira genérico rastreado (nunca some em silêncio)
          porDisciplina.diversos = (porDisciplina.diversos || 0) + 1;
          var gx = grupo("diversos|" + t, { regra: "sem-regra", disc: "diversos", nome: "Elementos " + t.replace(/^IFC/, ""), medida: "contagem", unidade: "un", termos: null, pendente: true, aviso: "tipo IFC sem regra do agente — identifique o serviço" });
          acumular(gx, el);
          return;
        }
        var disc = r.disc, nome = r.nome, termos = r.termos, pend = !!r.pendente, avs = r.aviso || null;
        if (disc === "@disciplina") {
          var mp = MEP_POR_DISCIPLINA[r.id] || {};
          var res = mp[el.disciplina];
          if (res) { disc = res.disc; nome = res.nome; termos = res.termos; }
          else { // disciplina do modelo não é MEP: NUNCA chutar hidráulica
            disc = "diversos"; nome = r.nome.replace("@", "") + " (disciplina do modelo indefinida)"; termos = null;
            pend = true; avs = "elemento MEP em modelo de disciplina \"" + (el.disciplina || "não definida") + "\" — ajuste a disciplina no painel Modelos (ou identifique o serviço manualmente)";
          }
        }
        porDisciplina[disc] = (porDisciplina[disc] || 0) + 1;
        var g = grupo(r.id + "|" + disc, { regra: r.id, disc: disc, nome: nome, medida: r.medida, unidade: r.unidade, termos: termos, pendente: pend, aviso: avs, estrut: r.estrut });
        acumular(g, el);
      });

      // ---- fecha os grupos: quantidade final + fonte POR GRANDEZA + derivados (cebola) ----
      var servicos = [];
      Object.keys(grupos).forEach(function (ch) {
        var g = grupos[ch];
        g.fonte = fonteAgregada(g._nIfc, g.nEstimados, g._nCont, g.nSemMedida);
        g.quantidade = g.medida === "contagem" ? g.nElementos : r2(g.quantidade);
        // fonte de CADA grandeza (a caixa envolvente nunca se passa por BaseQuantities)
        g.fontes = {};
        ["area", "volume", "comprimento"].forEach(function (gr) {
          var x = g._gr[gr];
          g.fontes[gr] = fonteAgregada(x.i, x.e, 0, x.s);
          g.somas[gr] = r2(g.somas[gr]); g.somasIfc[gr] = r2(g.somasIfc[gr]);
        });
        delete g._nIfc; delete g._nCont; delete g._gr;
        servicos.push(g);
        // parede-cebola: derivados com fator de faces (carimbado deriva pela regra do TIPO — regraBase)
        if (o.cebola && g.regra) {
          var ridCeb = (g.regra === "carimbo-plugin" && g.regraBase) ? g.regraBase : g.regra;
          var rr = null;
          for (var i = 0; i < REGRAS.length; i++) if (REGRAS[i].id === ridCeb) rr = REGRAS[i];
          var areaCeb = g.medida === "area" ? g.quantidade : num(g.somas.area);
          if (rr && rr.deriva && areaCeb > 0) {
            rr.deriva.forEach(function (dv) {
              var fonteCeb = g.medida === "area" ? g.fonte : (g.fontes.area || g.fonte);
              servicos.push({
                chave: dv.id + "|" + ch, regra: dv.id, disc: dv.disc, nome: dv.nome,
                carimbo: null, medida: "area", unidade: dv.unidade, termos: dv.termos,
                pendente: false, aviso: null,
                somas: { area: r2(areaCeb * (dv.fatorFaces ? o.faces : 1)), volume: 0, comprimento: 0, contagem: g.nElementos },
                somasIfc: { area: 0, volume: 0, comprimento: 0 },
                fontes: { area: fonteCeb, volume: "sem-medida", comprimento: "sem-medida" },
                quantidade: r2(areaCeb * (dv.fatorFaces ? o.faces : 1)),
                quantidadeBase: r2(areaCeb), fator: dv.fatorFaces ? o.faces : 1,
                derivadoDe: g.nome, fonte: fonteCeb,
                nElementos: g.nElementos, nEstimados: g.nEstimados, nSemMedida: g.nSemMedida,
                elementos: g.elementos.slice()
              });
            });
          }
        }
      });

      // ---- armadura + fôrma da estrutura: ESTIMATIVA PARAMÉTRICA declarada ("não pode ficar sem") ----
      // Aço: taxa kg/m³ (usual da prática, ajustável) × volume dos elementos, propagando a FONTE do
      // volume (medido|estimado). Fôrma: geometria da caixa de cada peça (sem taxa). Elementos de
      // fase 'demolir' nunca chegam aqui (viram demolição antes) — só a estrutura NOVA deriva.
      if (o.estimarEstrutura) {
        // armadura MODELADA no IFC (barras) ou carimbada com código de armação: o aço paramétrico
        // seria dupla contagem — suprime e declara (o modelo/projeto vale mais que a taxa)
        var temArmaduraModelada = servicos.some(function (s) {
          return s.regra === "estrutura-armadura" || (s.regra === "carimbo-plugin" && s.regraBase === "estrutura-armadura");
        });
        if (temArmaduraModelada) avisos.push("Armadura MODELADA detectada no IFC — o aço paramétrico foi suprimido pra não contar duas vezes (valem as barras do modelo; a fôrma continua estimada).");
        var estrutBase = servicos.filter(function (s) { return s.estrut && !s.derivadoDe && !s.parametrico; });
        estrutBase.forEach(function (g) {
          var info = ESTRUT_INFO[g.estrut]; if (!info) return;
          var vol = num(g.somas.volume);
          var fonteVol = (g.fontes && g.fontes.volume) || g.fonte;
          var fonteVolTxt = fonteVol === "ifc" ? "medido no IFC" : fonteVol === "misto" ? "parcialmente medido no IFC (parte estimada pela caixa envolvente)" : "ESTIMADO pela caixa envolvente";
          var taxa = o.taxasAco[g.estrut];
          var avisoCod = (g.carimbo && g.carimbo.codOrc) ? " — ATENÇÃO: se a composição carimbada (" + g.carimbo.codOrc + ") já inclui armação/fôrma (concreto armado completo), desmarque este item" : "";
          if (vol > 0 && taxa > 0 && !temArmaduraModelada) {
            servicos.push({
              // medida null: a grandeza-própria é a UNIDADE (kg) — o wizard recalcula certo se o
              // usuário escolher composição em m³ (invariante medida↔quantidade preservada)
              chave: "aco|" + g.chave, regra: "estrutura-aco-" + g.estrut, disc: g.disc,
              nome: "Armação de aço — " + info.rot + " (estimativa paramétrica " + taxa + " kg/m³)",
              carimbo: null, medida: null, medidaBase: "volume", unidade: "kg", termos: info.acoTermos,
              pendente: false, parametrico: true,
              aviso: "estimado por taxa paramétrica — substitua pelo quantitativo do projeto estrutural quando disponível" + avisoCod,
              somas: { area: 0, volume: r2(vol), comprimento: 0, contagem: g.nElementos },
              somasIfc: { area: 0, volume: num(g.somasIfc && g.somasIfc.volume) || 0, comprimento: 0 },
              fontes: { area: "sem-medida", volume: fonteVol, comprimento: "sem-medida" },
              quantidade: r2(vol * taxa), quantidadeBase: r2(vol), fator: taxa,
              memorialExtra: "ESTIMATIVA PARAMÉTRICA (sem quantitativos de projeto estrutural no IFC): taxa " + taxa + " kg/m³ — faixa usual da prática para " + info.rot + ", ajustável no assistente — sobre volume " + fonteVolTxt + ". Substitua pelos quantitativos do projeto estrutural quando disponível.",
              derivadoDe: null, fonte: "parametrico", nElementos: g.nElementos, nEstimados: g.nEstimados, nSemMedida: g.nSemMedida,
              elementos: g.elementos.slice()
            });
          }
          if (g.somaForma > 0) {
            var avisoLaje = g.estrut === "laje" ? " Laje apoiada no solo (contrapiso/radier) NÃO tem fôrma de fundo — desmarque se for o caso." : "";
            servicos.push({
              chave: "forma|" + g.chave, regra: "estrutura-forma-" + g.estrut, disc: g.disc,
              nome: "Fôrma de madeira — " + info.rot + " (pela geometria do modelo)",
              carimbo: null, medida: "area", unidade: "m²", termos: info.formaTermos,
              pendente: false, parametrico: true,
              aviso: (g._formaSem > 0 ? g._formaSem + " peça(s) sem caixa envolvente ficaram fora da fôrma — " : "") + "estimada pela geometria; confira com o projeto de fôrmas." + avisoLaje + avisoCod,
              somas: { area: r2(g.somaForma), volume: 0, comprimento: 0, contagem: g.nElementos },
              somasIfc: { area: 0, volume: 0, comprimento: 0 },
              fontes: { area: "estimado", volume: "sem-medida", comprimento: "sem-medida" },
              quantidade: r2(g.somaForma), quantidadeBase: r2(g.somaForma), fator: 1,
              memorialExtra: "Fôrma estimada pela GEOMETRIA de cada peça, orientada pelo eixo vertical (" + (g.estrut === "pilar" ? "perímetro da seção × altura" : g.estrut === "viga" ? "fundo + 2 laterais × vão" : g.estrut === "laje" ? "área de fundo (área medida do IFC quando disponível)" : "perímetro da planta × altura") + ") — sem projeto de fôrmas; substitua pelos quantitativos do projeto quando disponível.",
              derivadoDe: null, fonte: "parametrico", nElementos: g.nElementos, nEstimados: g.nEstimados, nSemMedida: g._formaSem,
              elementos: g.elementos.slice()
            });
          }
        });
      }

      // ---- entulho da demolição: SÓ volume MEDIDO no IFC (bbox mentiria o m³) + fator declarado ----
      var volDemolido = 0, elsDemo = [], nDemoSemVol = 0;
      servicos.forEach(function (s) {
        if (s.disc !== "demolicao") return;
        s.elementos.forEach(function (e) { elsDemo.push(e); });
        if (s.medida === "volume" && (s.fontes ? s.fontes.volume === "ifc" : false)) volDemolido += s.quantidade;
        else if (s.somasIfc && num(s.somasIfc.volume) > 0) { volDemolido += num(s.somasIfc.volume); if (s.somasIfc.volume < s.somas.volume - 0.01) nDemoSemVol++; }
        else nDemoSemVol += s.nElementos || 1;
      });
      if (volDemolido > 0 || elsDemo.length) {
        var svEnt = {
          chave: "demolicao|entulho", regra: "demolicao-entulho", disc: "demolicao",
          nome: "Carga e remoção de entulho", carimbo: null, medida: "volume", unidade: "m³",
          termos: ["entulho"], pendente: volDemolido <= 0,
          aviso: nDemoSemVol > 0 ? ("apenas o volume MEDIDO no IFC entrou na conta — " + nDemoSemVol + " demolição(ões) sem volume no IFC ficaram de fora; complete manualmente") : null,
          somas: { area: 0, volume: r2(volDemolido * o.fatorEmpolamento), comprimento: 0, contagem: elsDemo.length },
          somasIfc: { area: 0, volume: r2(volDemolido), comprimento: 0 },
          fontes: { area: "sem-medida", volume: volDemolido > 0 ? "ifc" : "sem-medida", comprimento: "sem-medida" },
          quantidade: r2(volDemolido * o.fatorEmpolamento), quantidadeBase: r2(volDemolido), fator: o.fatorEmpolamento,
          derivadoDe: null, fonte: "derivado", nElementos: elsDemo.length, nEstimados: 0, nSemMedida: nDemoSemVol,
          elementos: elsDemo.slice(0, 60)
        };
        if (volDemolido > 0) servicos.push(svEnt);
        else avisos.push("Demolição sem volume medido no IFC — o entulho NÃO foi estimado (a caixa envolvente mentiria o m³); acrescente manualmente.");
      }

      // ---- limpeza final (derivada da área de lajes — declarado no memorial) ----
      if (o.incluirLimpeza) {
        var areaLajes = 0, elsLaje = [];
        servicos.forEach(function (s) {
          var ehLaje = s.regra === "estrutura-laje" || (s.regra === "carimbo-plugin" && s.regraBase === "estrutura-laje");
          if (ehLaje) { areaLajes += num(s.somas.area); s.elementos.forEach(function (e) { elsLaje.push(e); }); }
        });
        if (areaLajes > 0) {
          servicos.push({
            chave: "limpeza|final", regra: "limpeza-final", disc: "limpeza",
            nome: "Limpeza final da obra", carimbo: null, medida: "area", unidade: "m²",
            termos: ["limpeza", "final"], pendente: false, aviso: "área aproximada = Σ áreas de lajes do modelo",
            somas: { area: r2(areaLajes), volume: 0, comprimento: 0, contagem: elsLaje.length },
            somasIfc: { area: 0, volume: 0, comprimento: 0 },
            fontes: { area: "derivado", volume: "sem-medida", comprimento: "sem-medida" },
            quantidade: r2(areaLajes), quantidadeBase: r2(areaLajes), fator: 1,
            derivadoDe: null, fonte: "derivado", nElementos: elsLaje.length, nEstimados: 0, nSemMedida: 0,
            elementos: elsLaje.slice(0, 60)
          });
        }
      }

      // ---- preliminares (nunca derivável — entra como lembrete pendente) ----
      if (o.incluirPreliminares) {
        servicos.push({
          chave: "preliminares|adm", regra: "preliminares", disc: "preliminares",
          nome: "Administração local / canteiro de obras", carimbo: null, medida: "contagem", unidade: "vb",
          termos: ["administracao", "local"], pendente: true,
          aviso: "não derivável do modelo — dimensione pelo prazo e porte da obra",
          somas: { area: 0, volume: 0, comprimento: 0, contagem: 1 },
          quantidade: 1, nElementos: 0, nEstimados: 0, nSemMedida: 0, elementos: [], fonte: "manual"
        });
      }

      // ---- monta as etapas na ordem canônica ----
      var etapas = [];
      DISCIPLINAS.forEach(function (d) {
        var svs = servicos.filter(function (s) { return s.disc === d.id; });
        if (!svs.length) return;
        svs.sort(function (a, b) { return b.nElementos - a.nElementos; });
        etapas.push({ disciplina: d.id, nome: d.nome, cats: d.cats, servicos: svs });
      });

      // ---- checklist de cobertura ("não pode esquecer de nada") ----
      var cobertura = DISCIPLINAS.map(function (d) {
        var n = porDisciplina[d.id] || 0;
        var presente = n > 0 || servicos.some(function (s) { return s.disc === d.id; });
        var aviso = null;
        if (!presente && d.esperada) aviso = "NENHUM elemento de " + d.nome + " no modelo — modele no Revit ou acrescente manualmente ao orçamento.";
        return { disciplina: d.id, nome: d.nome, presente: presente, nElementos: n, aviso: aviso };
      });
      cobertura.forEach(function (c) { if (c.aviso) avisos.push("⚠️ " + c.aviso); });

      // ---- avisos estruturais honestos ----
      var temEstrutura = servicos.some(function (s) { return s.estrut && !s.derivadoDe; });
      var temParametrico = servicos.some(function (s) { return s.parametrico; });
      if (temParametrico) avisos.push("Armadura e fôrma foram ESTIMADAS (taxas paramétricas kg/m³ + geometria das peças) por não haver projeto estrutural no IFC — os fatores estão declarados no memorial de cada item; substitua pelos quantitativos do projeto estrutural quando disponível.");
      else if (temEstrutura) avisos.push("Forma e armadura de pilares/vigas/lajes NÃO são deriváveis do IFC (exigem projeto estrutural) — acrescente com as taxas do projeto, ou ligue a estimativa paramétrica no assistente.");
      var nEst = 0; servicos.forEach(function (s) { if (!s.derivadoDe && !s.parametrico) nEst += s.nEstimados || 0; }); // derivados/paramétricos repetem os elementos do pai — não recontar
      if (nEst > 0) avisos.push(nEst + " elemento(s) sem BaseQuantities: quantidade ESTIMADA pela caixa envolvente — revise antes de fechar preço.");
      if (resumo.nSemMedida > 0) avisos.push(resumo.nSemMedida + " elemento(s) sem nenhuma medida — entraram só como contagem.");
      if (resumo.nMobiliario > 0) avisos.push(resumo.nMobiliario + " elemento(s) de mobiliário ignorados (mobiliário não é serviço de obra — inclua como verba se for contratual).");
      if (resumo.nExistentes > 0) avisos.push(resumo.nExistentes + " elemento(s) com fase “existente” preservados (reforma) — fora do orçamento, como deve ser.");
      resumo.pctCarimbo = resumo.nOrcaveis > 0 ? Math.round(resumo.nCarimbados / resumo.nOrcaveis * 100) : 0;

      return { etapas: etapas, cobertura: cobertura, resumo: resumo, avisos: avisos, opts: o };
    }
  };

  global.Bimeap = Bimeap;
  if (typeof module !== "undefined" && module.exports) module.exports = Bimeap;
})(typeof window !== "undefined" ? window : globalThis);

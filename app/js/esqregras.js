/* =====================================================================
 * esqregras.js — PORTAS E JANELAS AUTOMÁTICAS: o CLASSIFICADOR de ambiente e os CRITÉRIOS (20/10/2026). Motor PURO, ES5.
 *
 * Pesquisa de origem: docs/arquitetura/esquadrias/ (RESUMO.md, REGRAS-JANELAS.md, REGRAS-PORTAS.md, dados/*.json) e
 * docs/acessibilidade/pesquisa/ (NBR 9050:2020). Cada critério leva { valor, nivel, fonte } e o NÍVEL vai para a tela e
 * para o memorial — ninguém lê "1/6" sem saber de onde veio:
 *   A  texto primário lido (NBR 9050:2020, Código Civil art. 1.301, NBR 15575-1:2013);
 *   B  trecho de lei citado em busca / agregador — Uberlândia LC 524/2011: o texto consolidado NÃO foi aberto (o site da
 *      prefeitura recusa leitura automática). Sai na tela como "provisório — conferir o texto consolidado";
 *   C  PRÁTICA DE PROJETO RA (decisão, não norma): peitoris, verga, boneca, larguras por ambiente, distância ao canto.
 *      Sai como "critério RA (editável)". O dono valida.
 *
 * O app não classificava o nome do ambiente (js/bimambiente.js guarda o nome livre). Aqui:
 *   EsqRegras.classificar(nome) → { id, rotulo, classe: "prolongada"|"transitoria"|null, casou, termo, def }
 *     normaliza (minúsculas, sem acento, sem pontuação, sem o número do fim: "Quarto 2"), casa por igualdade com um
 *     sinônimo e depois por PALAVRA contida, na ordem de desempate da pesquisa (banheiro > lavabo > cozinha > área de
 *     serviço > suíte > dormitório > jantar > estar > escritório > circulação): "Banheiro suíte" = banheiro.
 *     Sem casar: "generico" (classe prolongada, a mais restritiva) + aviso "nomeie o ambiente".
 *   EsqRegras.criterios(sobre) → os critérios com as trocas do usuário (sobre = { chave: valor }); o nível vira "C
 *     (alterado)" quando o valor não é o da fonte.
 *   EsqRegras.fracaoIluminacao(def, crit) · peitorilFaixa(def, crit) · rotuloNivel(nivel)
 * Teste: node tools/test-esquadrias-auto.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var UDI = "Uberlândia, LC 524/2011 (Código de Obras) — trecho citado em busca; provisório: conferir o texto consolidado";
  var NIVEIS = {
    A: "norma/lei lida (texto primário)",
    B: "provisório — conferir o texto consolidado",
    C: "critério RA (prática de projeto, editável)",
    X: "sem fonte — conferir"
  };
  function rotuloNivel(n) { var k = String(n || "").charAt(0); return NIVEIS[k] || NIVEIS.X; }

  /* ------------------------------------------------------------------ CRITÉRIOS (todos editáveis na tela) */
  var CRITERIOS = {
    fracaoProlongada: { valor: 1 / 6, nivel: "B", rotulo: "Iluminação mínima — permanência prolongada (fração da área do piso)", fonte: UDI + " (1/6)" },
    fracaoTransitoria: { valor: 1 / 8, nivel: "B", rotulo: "Iluminação mínima — permanência transitória", fonte: UDI + " (1/8)" },
    ventilacaoDaIluminacao: { valor: 0.5, nivel: "B", rotulo: "Ventilação efetiva mínima (fração da iluminação exigida)", fonte: UDI + " (≥ 50 % da iluminação)" },
    fatorVentCorrer: { valor: 0.5, nivel: "B", rotulo: "Ventilação efetiva da janela de correr 2 folhas (fração do vão)", fonte: "ORSE ES00114, Tabela 01 (50 % do vão)" },
    fatorVentBasculante: { valor: 0.5, nivel: "C", rotulo: "Ventilação efetiva da basculante (fração do vão)", fonte: "sem % publicado pelo fabricante: 0,5 adotado (conservador)" },
    divisaFrente: { valor: 1.5, nivel: "A", rotulo: "Distância mínima da janela à divisa que ela vê (de frente ou oblíqua)", fonte: "Código Civil, art. 1.301 caput (1,50 m); visão oblíqua conta como direta: Súmula 414 do STF e STJ REsp 1.531.094/SP (2016)" },
    divisaPerpendicular: { valor: 0.75, nivel: "A", rotulo: "Distância mínima à divisa que a janela não vê (perpendicular)", fonte: "Código Civil, art. 1.301, § 1º (0,75 m)" },
    anguloPerpendicular: { valor: 15, nivel: "C", rotulo: "Tolerância (graus) para tratar a divisa como perpendicular à janela", fonte: "critério RA: até 15° do eixo da janela a divisa conta como perpendicular (0,75 m); acima disso a visão é oblíqua e vale 1,50 m" },
    fracaoEnvidracada: { valor: 1, nivel: "C", rotulo: "Fração do vão que conta como iluminação (1 = vão inteiro; caixilho de alumínio ≈ 0,80)", fonte: "pendente: o texto de Uberlândia (B) não diz se a área de iluminação é o vão ou o vidro — 1,00 conta o vão; para contar só o vidro use 0,80 (estimativa RA do caixilho, conferir com o fabricante)" },
    verga: { valor: 2.2, nivel: "C", rotulo: "Verga (topo do vão das janelas, alinhado na fachada)", fonte: "prática de projeto RA; NBR 15575-1:2013 13.2.6 recomenda testeira ≤ 2,20 m (A)" },
    distanciaCanto: { valor: 0.2, nivel: "C", rotulo: "Janela: distância mínima do vão ao canto", fonte: "prática de projeto RA (≥ 0,20 m; ideal 0,30)" },
    trechoCego: { valor: 0.15, nivel: "C", rotulo: "Trecho cego mínimo entre dois vãos", fonte: "prática de projeto RA" },
    boneca: { valor: 0.1, nivel: "C", rotulo: "Porta: boneca (canto → vão, do lado da dobradiça)", fonte: "prática de projeto RA (0,10–0,15 m)" },
    bonecaMinima: { valor: 0.05, nivel: "C", rotulo: "Porta: boneca mínima", fonte: "prática de projeto RA (exemplo do dono, 18/10/2026: 5 cm)" },
    entreBatentes: { valor: 0.3, nivel: "C", rotulo: "Distância mínima entre batentes de duas portas", fonte: "prática de projeto RA" },
    vaoLivreAcessivel: { valor: 0.8, nivel: "A", rotulo: "Vão livre mínimo da porta em rota acessível", fonte: "NBR 9050:2020, 6.11.2.4 (0,80 × 2,10 m)" },
    descontoVaoLivre: { valor: 0.05, nivel: "C", rotulo: "Folha − vão livre (espessura da folha + batente)", fonte: "estimativa RA: folha de 0,90 dá vão livre ≥ 0,80 (conferir com o fabricante)" },
    portaMinimaFonte: { valor: 0, nivel: "B", rotulo: "Largura mínima da folha por ambiente (tabela do ambiente)", fonte: "Belo Horizonte, Lei 9.725/2009 Anexo III (multifamiliar) como referência — Uberlândia sem largura de porta nos trechos lidos (conferir)" },
    folgaMovel: { valor: 0.02, nivel: "C", rotulo: "Folga da folha aberta até móvel/louça", fonte: "geometria de desenho" }
  };

  /* ------------------------------------------------------------------ AMBIENTES (sinônimos da pesquisa: janelas.json) */
  /* janela: famId, peitoril [min, max] (C), exige (fachada obrigatória); porta: folha (cm, C), abre ("dentro" do ambiente | "fora") */
  var CORRER = "ra-janela-correr", BASC = "ra-janela-basculante";
  var AMB = [
    { id: "banheiro", rotulo: "Banheiro", classe: "transitoria", nivelClasse: "B", sin: ["banheiro", "wc", "bwc", "banho", "sanitario", "instalacao sanitaria", "banheiro social", "banheiro suite", "wc suite", "wc social", "toalete"],
      janela: { exige: true, famId: BASC, peitoril: [1.5, 1.6] }, porta: { minimo: 60, folha: 70, abre: "dentro" }, ventIndireta: true },
    { id: "lavabo", rotulo: "Lavabo", classe: "transitoria", nivelClasse: "B", sin: ["lavabo", "toalete social", "wc lavabo"],
      janela: { exige: true, famId: BASC, peitoril: [1.4, 1.6] }, porta: { minimo: 60, folha: 60, abre: "dentro" }, ventIndireta: true },
    { id: "cozinha", rotulo: "Cozinha", classe: "prolongada", nivelClasse: "X", obsClasse: "cozinha não aparece nos trechos lidos: prolongada adotada por prudência",
      sin: ["cozinha", "cozinha americana", "copa cozinha", "copa/cozinha", "kitchen", "cozinha gourmet"],
      janela: { exige: true, famId: CORRER, peitoril: [1.1, 1.2], bancada: true }, porta: { minimo: 70, folha: 80, abre: "dentro" } },
    { id: "area_servico", rotulo: "Área de serviço", classe: "prolongada", nivelClasse: "X", obsClasse: "área de serviço sem classe nos trechos lidos: prolongada adotada por prudência",
      sin: ["area de servico", "area servico", "a.s.", "as", "lavanderia", "servico", "tanque"],
      janela: { exige: true, famId: CORRER, peitoril: [1.1, 1.2] }, porta: { minimo: 80, folha: 80, abre: "fora" } },
    { id: "suite", rotulo: "Suíte", classe: "prolongada", nivelClasse: "B", sin: ["suite", "quarto suite", "master suite"],
      janela: { exige: true, famId: CORRER, peitoril: [0.9, 1.1] }, porta: { minimo: 70, folha: 80, abre: "dentro" } },
    { id: "dormitorio", rotulo: "Dormitório", classe: "prolongada", nivelClasse: "B", sin: ["dormitorio", "quarto", "dorm", "quarto casal", "quarto solteiro", "quarto de hospedes", "hospedes", "quarto infantil", "master", "quarto de empregada", "dependencia", "quarto de servico"],
      janela: { exige: true, famId: CORRER, peitoril: [0.9, 1.1] }, porta: { minimo: 70, folha: 80, abre: "dentro" } },
    { id: "sala_jantar", rotulo: "Sala de jantar", classe: "prolongada", nivelClasse: "B", sin: ["sala de jantar", "jantar", "copa", "sala de refeicoes", "estar/jantar", "estar jantar"],
      janela: { exige: true, famId: CORRER, peitoril: [0.9, 1.1] }, porta: { minimo: 70, folha: 80, abre: "dentro" } },
    { id: "sala_estar", rotulo: "Sala", classe: "prolongada", nivelClasse: "B", sin: ["sala", "sala de estar", "estar", "living", "sala de tv", "tv", "sala intima", "home theater", "sala de visitas"],
      janela: { exige: true, famId: CORRER, peitoril: [0.9, 1.1] }, porta: { minimo: 70, folha: 80, abre: "dentro" }, entrada: true },
    { id: "escritorio", rotulo: "Escritório", classe: "prolongada", nivelClasse: "B", sin: ["escritorio", "home office", "office", "biblioteca", "estudio", "atelier", "sala de estudos", "estudo"],
      janela: { exige: true, famId: CORRER, peitoril: [0.9, 1.1] }, porta: { minimo: 70, folha: 80, abre: "dentro" } },
    { id: "area_gourmet", rotulo: "Área gourmet", classe: "prolongada", nivelClasse: "X", sin: ["area gourmet", "gourmet", "churrasqueira", "edicula", "espaco gourmet", "salao de festas"],
      janela: { exige: true, famId: CORRER, peitoril: [0.9, 1.1] }, porta: { minimo: 80, folha: 90, abre: "dentro" } },
    { id: "despensa", rotulo: "Despensa / closet", classe: "transitoria", nivelClasse: "B", sin: ["despensa", "deposito", "almoxarifado", "arrumacao", "rouparia", "closet", "dml"],
      janela: { exige: false, famId: BASC, peitoril: [1.5, 1.6] }, porta: { minimo: 60, folha: 60, abre: "fora" } },
    { id: "circulacao", rotulo: "Circulação", classe: "transitoria", nivelClasse: "B", sin: ["corredor", "hall", "circulacao", "passagem", "vestibulo", "antecamara", "hall de entrada", "hall intimo", "foyer", "entrada"],
      janela: { exige: false, famId: BASC, peitoril: [1.1, 1.2] }, porta: { minimo: 70, folha: 80, abre: "dentro" }, semPortaPropria: true, entrada: true },
    { id: "escada", rotulo: "Escada", classe: "transitoria", nivelClasse: "B", sin: ["escada", "caixa de escada", "caixa da escada"],
      janela: { exige: false }, porta: null, semPortaPropria: true },
    { id: "varanda", rotulo: "Varanda", classe: null, nivelClasse: "X", sin: ["varanda", "sacada", "terraco", "deck", "balcao", "area externa", "terraco coberto"],
      janela: { exige: false }, porta: null, semPortaPropria: true, externo: true },
    { id: "garagem", rotulo: "Garagem", classe: null, nivelClasse: "X", sin: ["garagem", "abrigo", "carport", "vaga", "abrigo de veiculos"],
      janela: { exige: false }, porta: null, semPortaPropria: true, externo: true }
  ];
  var GENERICO = { id: "generico", rotulo: "Ambiente (sem tipo)", classe: "prolongada", nivelClasse: "C", obsClasse: "nome sem tipo conhecido: a regra mais restritiva (prolongada)",
    sin: [], janela: { exige: true, famId: CORRER, peitoril: [0.9, 1.1] }, porta: { minimo: 70, folha: 80, abre: "dentro" } };
  /* desempate (pesquisa: outras-regras.json › classificacao_por_nome) — o resto vem na ordem da lista */
  var ORDEM = ["banheiro", "lavabo", "cozinha", "area_servico", "suite", "dormitorio", "sala_jantar", "sala_estar", "escritorio", "circulacao"];
  /* a precedência do DESTINO privativo: a porta entre dois ambientes obedece ao mais privativo (C) */
  var PRIVACIDADE = ["banheiro", "lavabo", "despensa", "suite", "dormitorio", "area_servico", "cozinha", "escritorio", "area_gourmet", "generico", "sala_jantar", "sala_estar", "circulacao", "escada", "varanda", "garagem"];

  function normalizar(s) {
    var t = String(s == null ? "" : s).toLowerCase();
    var mapa = { "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "ê": "e", "è": "e", "í": "i", "ì": "i", "î": "i", "ó": "o", "ô": "o", "õ": "o", "ò": "o", "ú": "u", "ü": "u", "ù": "u", "ç": "c", "ñ": "n" };
    t = t.replace(/[áàâãäéêèíìîóôõòúüùçñ]/g, function (c) { return mapa[c] || c; });
    t = t.replace(/\b([a-z])\.([a-z])\.?/g, "$1$2");   /* "a.s." → "as" */
    t = t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    t = t.replace(/(\s+(\d+|[ivx]+|0\d))+$/, "").trim();   /* "quarto 2", "dorm 01", "suite ii" */
    return t;
  }
  var _ord = null;
  function ordenados() {
    if (_ord) return _ord;
    _ord = AMB.slice().sort(function (a, b) {
      var ia = ORDEM.indexOf(a.id), ib = ORDEM.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return _ord;
  }
  function contemPalavra(t, s) { return (" " + t + " ").indexOf(" " + s + " ") >= 0; }
  function classificar(nome) {
    var t = normalizar(nome), L = ordenados(), i, j, d;
    if (t) {
      for (i = 0; i < L.length; i++) for (j = 0; j < L[i].sin.length; j++) if (normalizar(L[i].sin[j]) === t) return saida(L[i], true, L[i].sin[j]);
      for (i = 0; i < L.length; i++) for (j = 0; j < L[i].sin.length; j++) {
        d = normalizar(L[i].sin[j]);
        if (d.length >= 2 && contemPalavra(t, d)) return saida(L[i], true, L[i].sin[j]);
      }
    }
    return saida(GENERICO, false, "");
  }
  function saida(def, casou, termo) { return { id: def.id, rotulo: def.rotulo, classe: def.classe, casou: casou, termo: termo, def: def }; }
  function porId(id) { for (var i = 0; i < AMB.length; i++) if (AMB[i].id === id) return AMB[i]; return id === "generico" ? GENERICO : null; }
  function privacidade(id) { var k = PRIVACIDADE.indexOf(id); return k < 0 ? PRIVACIDADE.indexOf("generico") : k; }

  /* os critérios com as trocas do usuário */
  function criterios(sobre) {
    var out = copia(CRITERIOS);
    Object.keys(sobre || {}).forEach(function (k) {
      var v = Number(sobre[k]);
      if (!out[k] || !isFinite(v)) return;
      if (Math.abs(v - out[k].valor) > 1e-9) { out[k].valor = v; out[k].nivelOriginal = out[k].nivel; out[k].nivel = "C"; out[k].alterado = true; out[k].fonte = "alterado pelo usuário (era " + out[k].fonte + ")"; }
    });
    return out;
  }
  function fracaoIluminacao(def, crit) {
    var c = crit || CRITERIOS;
    if (!def || !def.classe) return null;
    return def.classe === "transitoria" ? c.fracaoTransitoria : c.fracaoProlongada;
  }
  /* a parte do vão que conta como iluminação (critério fracaoEnvidracada) */
  function fatorIluminacao(famId, crit) { var c = crit || CRITERIOS; return c.fracaoEnvidracada ? c.fracaoEnvidracada.valor : 1; }
  function fatorVentilacao(famId, crit) {
    var c = crit || CRITERIOS;
    return famId === BASC ? c.fatorVentBasculante.valor : c.fatorVentCorrer.valor;
  }
  /* o catálogo que o lançador usa (os tipos da biblioteca RA: js/familiasra.js) */
  var CATALOGO = [
    { famId: CORRER, tipoId: "j1010", L: 1.0, H: 1.0 }, { famId: CORRER, tipoId: "j1210", L: 1.2, H: 1.0 }, { famId: CORRER, tipoId: "j1510", L: 1.5, H: 1.0 },
    { famId: CORRER, tipoId: "j1212", L: 1.2, H: 1.2 }, { famId: CORRER, tipoId: "j1512", L: 1.5, H: 1.2 }, { famId: CORRER, tipoId: "j2012", L: 2.0, H: 1.2 },
    { famId: CORRER, tipoId: "j6060", L: 0.6, H: 0.6 },
    { famId: BASC, tipoId: "b6060", L: 0.6, H: 0.6 }, { famId: BASC, tipoId: "b8060", L: 0.8, H: 0.6 }, { famId: BASC, tipoId: "b10060", L: 1.0, H: 0.6 }
  ];
  var PORTAS = [{ folha: 60, tipoId: "p60" }, { folha: 70, tipoId: "p70" }, { folha: 80, tipoId: "p80" }, { folha: 90, tipoId: "p90" }];
  var BATENTE = 0.05;   /* o da família ra-porta-giro (vão = folha + 2 × batente) */

  /* ORÇAMENTO das esquadrias lançadas: composição SINAPI (base MG 06/2026, conferida em data/sinapi-MG-analitico.json) por
     família e tamanho. Sem composição equivalente: a mais próxima e mais cara do mesmo material, marcada "aproximada" (a peça
     nunca some do orçamento); só fica sem código o que não tem nenhuma parecida (giro de 2 folhas: o lançador não a usa). */
  var SINAPI = {
    "ra-porta-giro": { p60: "90788", p70: "90789", p80: "90790", p90: "100675", rotulo: "kit de porta-pronta de madeira (exclusive fechadura)", un: "un" },
    "ra-janela-correr": { "*": "94570", rotulo: "janela de alumínio de correr 2 folhas com vidro", un: "m2" },
    "ra-porta-correr": { "*": "100702", rotulo: "porta de correr de alumínio 2 folhas com vidro", un: "m2" },
    /* a basculante de alumínio NÃO tem composição na SINAPI 06/2026 — mas não pode sumir do orçamento (regra do dono: orçamento 100 %,
       incerto = preço mais alto). Vai a mais próxima do MESMO material e com vidro: maxim-ar de alumínio 94569 (R$ 536,33/m² MG 06/2026,
       quase o dobro da de correr 94570); a de aço 94559 não inclui vidro. Marcada APROXIMADA na linha e na tela. */
    "ra-janela-basculante": { "*": "94569", un: "m2", rotulo: "janela de alumínio maxim-ar com vidro", curta: "APROXIMADA (maxim-ar)", aproximada: "APROXIMADA: a SINAPI 06/2026 não tem basculante de alumínio — usada a maxim-ar de alumínio com vidro (94569), a mais cara do mesmo material; troque em Propriedades › Orçamento se tiver cotação" },
    "ra-porta-giro-2f": { "*": null, un: "un", motivo: "a SINAPI 06/2026 não tem kit de porta de giro de 2 folhas: escolha a composição em Propriedades › Orçamento" }
  };
  function sinapiDe(famId, tipoId) {
    var m = SINAPI[famId]; if (!m) return { codigo: null, motivo: "família fora da tabela de esquadrias" };
    var c = Object.prototype.hasOwnProperty.call(m, tipoId) ? m[tipoId] : m["*"];
    return c ? { codigo: c, rotulo: m.rotulo, un: m.un, aproximada: m.aproximada || null, curta: m.curta || null } : { codigo: null, motivo: m.motivo || "sem composição para este tamanho" };
  }

  var EsqRegras = {
    NIVEIS: NIVEIS, CRITERIOS: CRITERIOS, AMBIENTES: AMB, GENERICO: GENERICO, CATALOGO: CATALOGO, PORTAS: PORTAS, BATENTE: BATENTE, SINAPI: SINAPI,
    CORRER: CORRER, BASCULANTE: BASC,
    normalizar: normalizar, classificar: classificar, porId: porId, privacidade: privacidade, criterios: criterios,
    fracaoIluminacao: fracaoIluminacao, fatorIluminacao: fatorIluminacao, fatorVentilacao: fatorVentilacao, rotuloNivel: rotuloNivel, sinapiDe: sinapiDe, arr: arr
  };
  global.EsqRegras = EsqRegras;
  if (typeof module !== "undefined" && module.exports) module.exports = EsqRegras;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

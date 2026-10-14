/* =====================================================================
 * blocokorc.js — ORÇAMENTO E CRONOGRAMA do sistema Blocok (motor PURO,
 * ES5, sem DOM, Node-testável). Fica em cima do js/blocokexec.js: a
 * QUANTIDADE vem sempre do consolidar() dele; aqui entram só as
 * composições próprias, o custo e o tempo.
 *
 *   BlocokOrc.composicoes(cfg [, resultado]) → composições próprias BLK-xx
 *   BlocokOrc.orcar(resultado, cfg)          → linhas de orçamento + totais
 *   BlocokOrc.cronograma(resultado, cfg)     → atividades, predecessoras, CPM
 *   BlocokOrc.histograma(resultado, cfg)     → MO por função por dia
 *   BlocokOrc.produtividade(cfg)             → a conta da produtividade, em texto
 *   BlocokOrc.precoPeca(esp, cfg)            → preço da peça por custo de produção (com a conta)
 *   BlocokOrc.PRECOS_REFERENCIA              → tabela de preços de referência RA (out/2026)
 *
 * ⚠ AS REGRAS QUE NÃO DOBRAM (é dinheiro — mesmo espírito de js/orcmodelo.js
 *   e js/composicaopropria.js):
 *   1. NUNCA se inventa código SINAPI. Toda composição daqui é PRÓPRIA, com
 *      código BLK-xx. `codigoSinapi` de cada insumo é null, a menos que o
 *      usuário informe em cfg.codigosSinapi[chaveDoInsumo]. Insumo sem código
 *      = "pendente" (não há equivalente confirmado na base).
 *   2. PREÇO (decisão do dono, 14/10/2026): o orçamento sai COMPLETO, com custo.
 *      Precedência por insumo: cfg.precos[chave] ("configurado") > cfg.base[chave]
 *      (preço da base SINAPI/própria que o chamador informar: número ou
 *      { preco, fonte }) > BlocokOrc.PRECOS_REFERENCIA ("referência RA", out/2026,
 *      editável). Cada linha diz a origem do preço. "sem preço" só aparece se o
 *      usuário APAGAR um preço (cfg.precos[chave] = null ou ""). BDI NÃO incluso.
 *      O preço da PEÇA Blocok não é público: sai do CUSTO DE PRODUÇÃO (ver precoPeca).
 *   3. Todo coeficiente que não é medido nem publicado é PARÂMETRO RA (editável):
 *      carrega `origem: "parâmetro RA (editável)"` e a FONTE em texto. O usuário
 *      sobrepõe em cfg.coeficientes["BLK-03:mat.concreto"] (origem passa a
 *      "informado pelo usuário"). Coeficiente null só existe sem resultado
 *      (não há quantidade para derivar o consumo).
 *   4. A unidade da quantidade é a unidade da composição (m² × m², m³ × m³).
 *      A linha carrega as duas e o teste confere.
 *
 * PRODUTIVIDADE (a conta, também em produtividade(cfg)):
 *   fabricante: "45 m² de parede por dia" (vídeo Pindamonhangaba, 05/2025) e
 *   48,2 m²/dia (quadro da franquia) — o TAMANHO DA EQUIPE NÃO É INFORMADO.
 *   Premissa RA: equipe de 1 pedreiro + 2 ajudantes, jornada de 8 h:
 *     pedreiro  = 1 × 8 h ÷ 45 m² = 0,1778 h/m²
 *     ajudante  = 2 × 8 h ÷ 45 m² = 0,3556 h/m²   (total 0,5333 h/m²)
 *   Conferência de ordem de grandeza: TCCs do sistema similar Blocom
 *   0,44 a 0,51 h/m² (total); SINAPI 101154 (bloco de concreto celular)
 *   0,803 h/m² pedreiro + 0,402 h/m² servente = 1,205 h/m². Referência de
 *   mercado (NÃO é preço do orçamento): R$ 400/m² de parede pronta com mão
 *   de obra (fábrica de Pindamonhangaba, 05/2025).
 *
 * Teste: node tools/test-blocokorc.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(root);
  else root.BlocokOrc = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function r2(n) { return Math.round((+n || 0) * 100) / 100; }
  function r3(n) { return Math.round((+n || 0) * 1000) / 1000; }
  function r4(n) { return Math.round((+n || 0) * 10000) / 10000; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function br(n, d) { return (+n).toFixed(d == null ? 2 : d).replace(".", ","); }
  function ehObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  function dep(nome, arq) {
    var m = root && root[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m;
  }
  function Exec() {
    var E = dep("BlocokExec", "./blocokexec.js");
    if (!E) throw new Error("BlocokOrc: BlocokExec ausente (carregue js/blocokexec.js antes)");
    return E;
  }

  /* ------------------------------------------------------------------
   * FUNÇÕES de mão de obra (rótulos únicos: o preço é por função)
   * ------------------------------------------------------------------ */
  var FUNC = { pedreiro: "Pedreiro (montador)", ajudante: "Ajudante", armador: "Armador" };
  var CHAVE_MO = { pedreiro: "mo.pedreiro", ajudante: "mo.ajudante", armador: "mo.armador" };

  var ORIGEM = {
    premissa: "Parâmetro RA (editável em cfg.coeficientes) — prática de obra da RA, sem fonte publicada; confirme com o franqueado/fabricante ou com a obra",
    motor: "Derivado dos quantitativos do motor BlocokExec",
    fabricante: "Fabricante (franquia Blocok): 45 m²/dia por equipe (vídeo Pindamonhangaba, 05/2025); equipe NÃO informada"
  };
  // categoria curta do coeficiente (campo `origem` do insumo); o texto longo fica em `fonte`
  var ORI = { param: "parâmetro RA (editável)", fab: "fabricante", norma: "diretriz SiNAT 019", usuario: "informado pelo usuário" };

  /* ------------------------------------------------------------------
   * PREÇOS DE REFERÊNCIA RA — R$, data-base out/2026, valores de mercado
   * brasileiros CONSERVADORES (arredondados para cima na dúvida). NÃO são
   * cotação nem SINAPI: são o ponto de partida para o orçamento sair completo.
   * Quem tem preço melhor sobrescreve em cfg.precos[chave].
   * Chave = a mesma de cfg.precos / dos insumos das composições.
   * ------------------------------------------------------------------ */
  var DATA_BASE_PRECOS = "out/2026";
  var FONTE_REF = "referência RA de mercado — editável";
  function pr(preco, unidade, descricao, nota) { return { preco: preco, unidade: unidade, descricao: descricao, nota: nota || "" }; }
  var PRECOS_REFERENCIA = {
    // micro concreto da peça (traço de js/blocok.js insumoDefaults) e EPS
    "mat.cimento-cpv": pr(0.85, "kg", "Cimento CP-V ARI (micro concreto das faces)", "saco 50 kg ≈ R$ 42,50"),
    "mat.areia": pr(130, "m³", "Areia média/industrial", "posta em obra"),
    "mat.pedrisco": pr(125, "m³", "Pedrisco", "posta em obra"),
    "mat.aditivo-micro": pr(14, "kg", "Aditivo polimérico do micro concreto"),
    "mat.eps": pr(380, "m³", "EPS classe F (antichama), núcleo da peça", "≈ 13 kg/m³ × R$ 29/kg"),
    // concreto e argamassa
    "mat.concreto": pr(650, "m³", "Concreto/graute C25 fluido para preenchimento", "volume pequeno: usinado com taxa de carga mínima ou graute; inclui lançamento em balde"),
    "mat.argamassa-assentamento": pr(1890, "m³", "Argamassa de assentamento/cola polimérica pronta", "≈ R$ 1,05/kg × 1.800 kg/m³ (produto do fabricante não definido: usa o preço mais alto)"),
    // aço (R$/kg, posto em obra, cortado e dobrado à parte na MO do armador)
    "aco.ca60-5": pr(9.6, "kg", "Aço CA-60 φ 5,0 mm (estribos)"),
    "aco.ca50-6.3": pr(9.2, "kg", "Aço CA-50 φ 6,3 mm"),
    "aco.ca50-8": pr(8.8, "kg", "Aço CA-50 φ 8,0 mm"),
    "aco.ca50-10": pr(8.5, "kg", "Aço CA-50 φ 10,0 mm"),
    "aco.ca50-12.5": pr(8.4, "kg", "Aço CA-50 φ 12,5 mm"),
    "aco.ca50-16": pr(8.4, "kg", "Aço CA-50 φ 16,0 mm"),
    "aco.ca50-20": pr(8.4, "kg", "Aço CA-50 φ 20,0 mm"),
    "mat.aco": pr(8.8, "kg", "Aço CA para armadura — média", "com resultado vira a média ponderada pelas bitolas do projeto (aco.*)"),
    "mat.arame": pr(14, "kg", "Arame recozido nº 18"),
    "mat.espacador": pr(0.6, "un", "Espaçador plástico (cobrimento)"),
    // tratamento de juntas
    "mat.ac3": pr(1.15, "kg", "Argamassa AC-III", "saco 25 kg ≈ R$ 28,75"),
    "mat.aditivo-ac3": pr(28, "L", "Aditivo de rejunte (resina para AC-III)"),
    "mat.tela-fibra": pr(1.6, "m", "Tela de fibra de vidro 10 cm"),
    "mat.selador": pr(15, "L", "Selador acrílico", "balde 18 L ≈ R$ 270"),
    // escoramento, ligações, encunhamento, corte
    "mat.escora": pr(18, "un", "Escora/gabarito de madeira (preço da peça; o reaproveitamento está no coeficiente)"),
    "mat.grampo": pr(3.5, "un", "Grampo de ligação (vergalhão dobrado/chumbado)"),
    "mat.encunhamento": pr(4800, "m³", "Argamassa expansiva/graute de encunhamento", "≈ R$ 2,50/kg × 1.900 kg/m³"),
    "mat.disco-corte": pr(70, "un", "Disco de corte diamantado"),
    // mão de obra (R$/h, com encargos)
    "mo.pedreiro": pr(31, "h", "Pedreiro/montador, com encargos"),
    "mo.ajudante": pr(22, "h", "Ajudante/servente, com encargos"),
    "mo.armador": pr(31, "h", "Armador, com encargos"),
    "mo.carpinteiro": pr(31, "h", "Carpinteiro, com encargos", "disponível para o usuário; a produtividade padrão não usa carpinteiro"),
    // equipamentos (R$/h de uso, com depreciação, energia e manutenção)
    "eq.misturador": pr(6, "h", "Misturador de argamassa"),
    "eq.maquita": pr(7, "h", "Serra/maquita com disco"),
    "eq.nivel-laser": pr(5, "h", "Nível a laser"),
    "eq.vibrador": pr(8, "h", "Vibrador de imersão"),
    // EPI (opcional)
    "mat.epi-pedreiro": pr(1.2, "h", "Rateio de EPI por hora — pedreiro"),
    "mat.epi-ajudante": pr(1.2, "h", "Rateio de EPI por hora — ajudante"),
    "mat.epi-armador": pr(1.2, "h", "Rateio de EPI por hora — armador")
  };

  function chaveAco(bit) {
    var b = +bit;
    if (b <= 5.5) return "aco.ca60-5";
    var op = [[6.3, "aco.ca50-6.3"], [8, "aco.ca50-8"], [10, "aco.ca50-10"], [12.5, "aco.ca50-12.5"], [16, "aco.ca50-16"], [20, "aco.ca50-20"]], m = op[0], i;
    for (i = 1; i < op.length; i++) if (Math.abs(op[i][0] - b) < Math.abs(m[0] - b)) m = op[i];
    return m[1];
  }
  // preço informado pelo usuário? { achou, preco (null = apagado) }
  function precoCfg(cfg, chave) {
    if (!cfg.precos || !Object.prototype.hasOwnProperty.call(cfg.precos, chave)) return { achou: false };
    var p = cfg.precos[chave];
    if (p === undefined) return { achou: false };
    if (p === null || p === "" || !isFinite(+p)) return { achou: true, preco: null };
    return { achou: true, preco: +p };
  }
  function precoBase(cfg, chave) {
    var b = cfg.base && cfg.base[chave];
    if (b == null) return null;
    var v = ehObj(b) ? b.preco : b;
    return (v != null && v !== "" && isFinite(+v)) ? { preco: +v, fonte: ehObj(b) && b.fonte ? b.fonte : "base informada em cfg.base" } : null;
  }
  /* preço efetivo de um insumo: { preco, origem, fonte } ; preco null = sem preço (só se o usuário apagou)
     ctx.acoPreco = média ponderada por bitola (calculada na composição) */
  function precoEfetivo(cfg, chave, ctx) {
    var c = precoCfg(cfg, chave);
    if (c.achou) return c.preco == null ? { preco: null, origem: null, fonte: "preço apagado pelo usuário" } : { preco: c.preco, origem: "configurado", fonte: "cfg.precos" };
    var b = precoBase(cfg, chave);
    if (b) return { preco: b.preco, origem: "base", fonte: b.fonte };
    var m = /^mat\.peca-(\d+)$/.exec(chave);
    if (m) { var pp = precoPeca(+m[1], cfg); return { preco: pp.preco, origem: "referência RA", fonte: "custo de produção × fator de fábrica " + br(pp.conta.fator, 1) }; }
    if (chave === "mat.aco" && ctx && ctx.acoPreco != null) return { preco: ctx.acoPreco, origem: "referência RA", fonte: "média ponderada por bitola do projeto — " + FONTE_REF + " (" + DATA_BASE_PRECOS + ")" };
    var t = PRECOS_REFERENCIA[chave];
    if (t) return { preco: t.preco, origem: "referência RA", fonte: FONTE_REF + " (" + DATA_BASE_PRECOS + ")" };
    return { preco: null, origem: null, fonte: "sem preço de referência para esta chave" };
  }

  /* ------------------------------------------------------------------
   * PREÇO DA PEÇA BLOCOK 90×90 por espessura — não existe preço público.
   * Custo de produção: faces de micro concreto + núcleo de EPS, × fator de
   * fábrica (mão de obra, cura, perdas, margem do franqueado).
   *   faces  = área da peça × 2 faces × espessura da face (1,5 cm)   [m³]
   *   traço  = cimento 380 kg + areia 0,50 + pedrisco 0,45 + aditivo 5,7 kg por m³
   *            (os mesmos números de js/blocok.js insumoDefaults)
   *   preço  = (faces × custo do traço + EPS × preço do EPS) × fator (2,0)
   * ------------------------------------------------------------------ */
  function precoPeca(esp, cfgIn) {
    var cfg = cfgIn && cfgIn._lida ? cfgIn : lerCfg(cfgIn), P = cfg.peca, E = Exec();
    var cat = E.CATALOGO[esp];
    if (!cat) return { espessura: esp, preco: null, conta: null, texto: "Espessura sem catálogo" };
    var u = function (k) { return precoEfetivo(cfg, k).preco || 0; };
    var mix = P.mix, areaM2 = P.areaM2;
    var facesM3 = areaM2 * 2 * P.faceM;
    var tracoM3 = mix.cimento * u("mat.cimento-cpv") + mix.areia * u("mat.areia") + mix.pedrisco * u("mat.pedrisco") + mix.aditivo * u("mat.aditivo-micro");
    var custoFaces = facesM3 * tracoM3, epsM3 = areaM2 * cat.nucleo, custoEPS = epsM3 * u("mat.eps");
    var material = custoFaces + custoEPS, fator = num(P.fatorFabrica, 2), preco = material * fator;
    var conta = { espessura: esp, areaM2: areaM2, facesM3: r4(facesM3), custoTracoM3: r2(tracoM3), custoFaces: r2(custoFaces), epsM3: r4(epsM3), custoEPS: r2(custoEPS),
      custoMaterial: r2(material), fator: fator, preco: r2(preco), precoM2: r2(preco / areaM2) };
    conta.texto = "Peça " + esp + " cm: faces " + br(areaM2, 2) + " m² × 2 × " + br(P.faceM, 3) + " m = " + br(facesM3, 4) + " m³ × traço R$ " + br(tracoM3) + "/m³ = R$ " + br(custoFaces) +
      "; EPS " + br(areaM2, 2) + " × " + br(cat.nucleo, 2) + " = " + br(epsM3, 4) + " m³ × R$ " + br(u("mat.eps")) + " = R$ " + br(custoEPS) +
      "; material R$ " + br(material) + " × fator de fábrica " + br(fator, 1) + " = R$ " + br(preco) + " por peça (R$ " + br(preco / areaM2) + "/m²).";
    var ref = num(cfg.mercadoRefM2, 400);
    conta.comparacao = "Informativo: só o painel custa R$ " + br(preco / areaM2) + "/m²; a referência pública de parede PRONTA com mão de obra é R$ " + br(ref) + "/m² (fábrica de Pindamonhangaba, 05/2025) — diferença de R$ " + br(ref - preco / areaM2) + "/m² para assentamento, concreto, aço e acabamento.";
    return { espessura: esp, preco: r2(preco), precoM2: r2(preco / areaM2), conta: conta, texto: conta.texto + " " + conta.comparacao };
  }
  // tabela completa (referência + peças) com o preço EFETIVO e a origem — alimenta a aba Preços
  function tabelaPrecos(cfgIn, ctx) {
    var cfg = cfgIn && cfgIn._lida ? cfgIn : lerCfg(cfgIn), E = Exec(), out = [];
    Object.keys(E.CATALOGO).forEach(function (k) {
      var e = precoEfetivo(cfg, "mat.peca-" + k);
      out.push({ chave: "mat.peca-" + k, descricao: "Painel Blocok 90×90 cm, esp. " + k + " cm (custo de produção × fator de fábrica; frete à parte)", unidade: "un", referencia: precoPeca(+k, lerCfg({ peca: cfg.peca })).preco,
        preco: e.preco, origem: e.origem, nota: "" });
    });
    Object.keys(PRECOS_REFERENCIA).forEach(function (k) {
      var t = PRECOS_REFERENCIA[k], e = precoEfetivo(cfg, k, ctx);
      out.push({ chave: k, descricao: t.descricao, unidade: t.unidade, referencia: t.preco, preco: e.preco, origem: e.origem, nota: t.nota });
    });
    return out;
  }

  /* ------------------------------------------------------------------
   * CONFIGURAÇÃO (tudo editável; cada número com a sua fonte acima)
   * ------------------------------------------------------------------ */
  function cfgPadrao() {
    return {
      jornadaH: 8,
      equipes: 1,                 // nº de equipes em paralelo
      assentamento: { pedreiro: 1, ajudante: 2, m2Dia: 45, discoM2PorUn: 27.5 },  // fabricante 45 m²/dia; equipe = parâmetro RA; 1 disco a cada ~27,5 m² (25–30)
      concretagem: { pedreiro: 1, ajudante: 2, m3Dia: 2.0 },     // parâmetro RA
      armacao: { armador: 1, ajudante: 1, kgDia: 100, arameKgPorKgAco: 0.025, espacadorUnPorMVerga: 2, espacadorUnPorMPilarete: 2 },  // parâmetro RA (arame ~2,5 % do aço)
      escoramento: { pedreiro: 1, ajudante: 1, unDia: 8, escorasPorVerga: 2, reusos: 5 },   // parâmetro RA
      juntas: { pedreiro: 1, ajudante: 1, mDia: 40, aditivoLPorKgAc3: 0.15 },   // parâmetro RA
      grampos: { pedreiro: 1, ajudante: 1, unDia: 40 },          // parâmetro RA
      encunhamento: { pedreiro: 1, ajudante: 1, mDia: 30, espRef: 0.15 },   // parâmetro RA
      perdas: { concreto: 0.05, aco: 0.10 },                     // parâmetro RA
      ferramentas: { verbaPctMO: 3 },                            // % da MO — parâmetro RA
      // peça Blocok por custo de produção (traço = js/blocok.js insumoDefaults); fatorFabrica = MO, cura, perdas e margem do franqueado
      peca: { areaM2: 0.81, faceM: 0.015, mix: { cimento: 380, areia: 0.50, pedrisco: 0.45, aditivo: 5.7 }, fatorFabrica: 2.0 },
      exec: {},                   // cfg do BlocokExec (mesma usada em paginar)
      precos: {},                 // { chaveDoInsumo: R$ } — sobrepõe a referência; null/"" apaga o preço (aí sim fica "sem preço")
      base: {},                   // { chaveDoInsumo: R$ | { preco, fonte } } — preço de uma base (SINAPI/própria) que o chamador resolveu
      codigosSinapi: {},          // { chaveDoInsumo: "código" } — só o que o usuário confirmar
      coeficientes: {},           // { "BLK-03:mat.concreto": número } — sobrepõe o parâmetro RA
      incluirEPI: false,
      mercadoRefM2: 400,
      // cronograma
      agrupar: "lote",            // "lote" | "parede"
      fundacaoDias: null,         // null = "a definir"
      marcacaoDias: 1,            // parâmetro RA
      curaConcretoDias: 3,        // parâmetro RA (espera após concretar pilaretes/vergas/cinta)
      lajeDias: null,             // fora do escopo Blocok — a definir
      lajeCuraDias: 7,            // parâmetro RA (cura da laje até retirar o escoramento)
      acabamentoDias: null        // a definir
    };
  }
  function mesclar(base, o) {
    if (!ehObj(o)) return base;
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (ehObj(v) && ehObj(base[k])) mesclar(base[k], v);
      else if (v !== undefined) base[k] = v;
    });
    return base;
  }
  function lerCfg(c) { var o = mesclar(cfgPadrao(), c ? clone(c) : null); o._lida = true; return o; }

  /* ------------------------------------------------------------------
   * RESULTADO → lista de paginações + consolidado
   *   aceita o objeto do BlocokCalc.calcular (paredes[].pag), uma lista de
   *   paginações do BlocokExec ou { paginas: [...] }.
   * ------------------------------------------------------------------ */
  function pagsDe(res) {
    var l = Array.isArray(res) ? res : (res && (res.paredes || res.paginas)) || [];
    return l.map(function (p) { return p && p.quant ? p : (p && p.pag); }).filter(function (p) { return p && p.quant; });
  }
  function consolidadoDe(res, pags) {
    if (res && !Array.isArray(res) && res.consolidado && res.consolidado.totais) return res.consolidado;
    return Exec().consolidar(pags);
  }
  function encunhamentoTotal(pags) { return pags.reduce(function (s, p) { return s + num(p.quant.encunhamentoM); }, 0); }

  /* ------------------------------------------------------------------
   * COMPOSIÇÕES PRÓPRIAS
   * ------------------------------------------------------------------ */
  function codigoDe(cfg, chave) {
    var c = cfg.codigosSinapi && cfg.codigosSinapi[chave];
    return c ? String(c) : null;
  }
  // insumo: coef null = pendente (só sem resultado). `cat` = categoria curta da origem do coeficiente (ORI.*); `fonte` = texto longo
  function ins(cfg, comp, chave, descricao, unidade, coef, tipo, fonte, cat, extra) {
    var ov = cfg.coeficientes && cfg.coeficientes[comp + ":" + chave];
    if (ov != null && ov !== "" && isFinite(+ov)) { coef = +ov; cat = ORI.usuario; fonte = "Informado pelo usuário (cfg.coeficientes)"; }
    var o = {
      chave: chave, descricao: descricao, unidade: unidade, coeficiente: coef == null ? null : coef,
      tipo: tipo, origem: cat, fonte: fonte,
      pendente: coef == null, codigoSinapi: codigoDe(cfg, chave)
    };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  // mão de obra a partir da equipe e da produtividade: h/unid = pessoas × jornada ÷ produção por dia
  function insMO(cfg, comp, crew, prodDia, unid, fonte, cat) {
    var out = [];
    ["pedreiro", "ajudante", "armador"].forEach(function (f) {
      var n = num(crew[f]);
      if (n <= 0) return;
      var coef = prodDia > 0 ? n * cfg.jornadaH / prodDia : null;
      out.push(ins(cfg, comp, CHAVE_MO[f], FUNC[f], "h", coef, "MO", fonte + " · " + n + " " + f + "(s) × " + cfg.jornadaH + " h ÷ " + prodDia + " " + unid + "/dia", cat, { funcao: FUNC[f] }));
    });
    return out;
  }
  // equipamento operado por uma pessoa da equipe durante todo o serviço: h/unid = jornada ÷ produção por dia
  function insEQ(cfg, comp, chave, desc, prodDia, unid) {
    return ins(cfg, comp, chave, desc, "h", prodDia > 0 ? cfg.jornadaH / prodDia : null, "EQ",
      "Uso contínuo na jornada de 1 equipe (" + cfg.jornadaH + " h ÷ " + prodDia + " " + unid + "/dia) — pode superestimar o tempo real de máquina; " + ORIGEM.premissa, ORI.param);
  }
  function insVerba(cfg, comp) {
    return ins(cfg, comp, "eq.ferramentas-verba", "Ferramentas manuais e pequenos equipamentos (linha, prumo, régua, mangueira de nível, espátula, colher) — verba % da MO",
      "%MO", num(cfg.ferramentas.verbaPctMO), "EQ", ORIGEM.premissa + " (percentual sobre o custo da mão de obra desta composição)", ORI.param);
  }
  function somaBarra(pags) { // comprimentos (m) de elementos de reforço, para os espaçadores
    var vg = 0, pl = 0;
    pags.forEach(function (p) {
      var rf = p.reforcos || {};
      (rf.vergas || []).concat(rf.contravergas || [], rf.cintas || []).forEach(function (e) { vg += num(e.w); });
      (rf.pilaretes || []).forEach(function (e) { pl += num(e.h); });
    });
    return { verga: vg, pilarete: pl };
  }
  function refDe(res) {
    if (!res) return null;
    var pags = pagsDe(res);
    if (!pags.length) return null;
    var c = consolidadoDe(res, pags), t = c.totais;
    return { totais: t, porEspessura: c.porEspessura, aco: c.aco || [], pags: pags, encunhamentoM: encunhamentoTotal(pags) };
  }
  // preço médio do aço ponderado pelas bitolas do projeto (cada bitola pelo seu preço efetivo)
  function acoPrecoMedio(cfg, ref) {
    if (!ref || !ref.aco.length) return null;
    var kg = 0, v = 0;
    ref.aco.forEach(function (x) { var e = precoEfetivo(cfg, chaveAco(x.bitola)); kg += num(x.kg); v += num(x.kg) * (e.preco == null ? 0 : e.preco); });
    return kg > 0 ? v / kg : null;
  }

  function composicoes(cfgIn, resultado) {
    var cfg = lerCfg(cfgIn), E = Exec(), ex = E.cfgPadrao();
    var exCfg = mesclar(ex, cfg.exec ? clone(cfg.exec) : null);
    var ref = refDe(resultado), lista = [];
    var A = cfg.assentamento, C = cfg.concretagem, R = cfg.armacao, S = cfg.escoramento, J = cfg.juntas, G = cfg.grampos, N = cfg.encunhamento;
    var P = cfg.perdas;
    var ctx = { acoPreco: acoPrecoMedio(cfg, ref) };

    // (1) fornecimento por espessura
    Object.keys(E.CATALOGO).forEach(function (k) {
      var cod = "BLK-01-" + k;
      lista.push({
        codigo: cod, etapa: "Fornecimento", descricao: "Fornecimento de painel Blocok 90×90 cm, espessura " + k + " cm (placa cheia, quantidade de compra com aproveitamento de retalho)",
        unidade: "un", espessura: +k, propria: true, quantidadeDe: "placasCompra[" + k + "]",
        insumos: [ins(cfg, cod, "mat.peca-" + k, "Painel Blocok 90×90 cm, esp. " + k + " cm — preço por custo de produção × fator de fábrica (frete à parte)", "un", 1, "MAT", E.FONTES.peca, ORI.fab, { peso: E.CATALOGO[k].peso })]
      });
    });

    // (2) assentamento por m² de parede (área líquida: eixo × altura − vãos)
    var argCoef = ref && ref.totais.areaLiquida > 0 ? ref.totais.argamassaM3 / ref.totais.areaLiquida : null;
    lista.push({
      codigo: "BLK-02", etapa: "Assentamento", descricao: "Assentamento de painel Blocok em amarração, junta cheia nos dois sentidos, com linha, prumo e nível — por m² de parede (área líquida, vãos descontados)",
      unidade: "m²", propria: true, quantidadeDe: "totais.areaLiquida",
      insumos: insMO(cfg, "BLK-02", A, A.m2Dia, "m²", ORIGEM.fabricante + "; equipe = parâmetro RA", ORI.param).concat([
        ins(cfg, "BLK-02", "mat.argamassa-assentamento", "Argamassa de assentamento (volume pronto: juntas verticais e horizontais + nivelamento + perda) — traço/produto NÃO definido pelo fabricante", "m³", argCoef, "MAT",
          ref ? ORIGEM.motor + ": (juntas × " + Math.round(exCfg.junta * 1000) + " mm × espessura + nivelamento) × (1 + perda " + Math.round(exCfg.argamassa.perda * 100) + " %) ÷ área líquida = " + br(ref.totais.argamassaM3, 4) + " m³ ÷ " + br(ref.totais.areaLiquida, 3) + " m²; consumo = parâmetro RA (fabricante não publica)"
              : "Depende da obra (juntas × espessura): informe o resultado do motor", ORI.param),
        insEQ(cfg, "BLK-02", "eq.misturador", "Misturador de argamassa (1 por equipe)", A.m2Dia, "m²"),
        insEQ(cfg, "BLK-02", "eq.maquita", "Serra/maquita com disco para corte de peças (1 por equipe)", A.m2Dia, "m²"),
        insEQ(cfg, "BLK-02", "eq.nivel-laser", "Nível a laser (ou mangueira) para alinhar as fiadas (1 por equipe)", A.m2Dia, "m²"),
        insVerba(cfg, "BLK-02"),
        ins(cfg, "BLK-02", "mat.disco-corte", "Disco de corte diamantado (1 disco a cada " + br(A.discoM2PorUn, 1) + " m² de parede)", "un", A.discoM2PorUn > 0 ? 1 / A.discoM2PorUn : null, "MAT",
          ORIGEM.premissa + " — ~1 disco a cada 25–30 m² de recortes; aqui aplicado a toda a área líquida (conservador). cfg.assentamento.discoM2PorUn", ORI.param)
      ])
    });

    // (3) concreto de preenchimento
    lista.push({
      codigo: "BLK-03", etapa: "Pilaretes, vergas e cintas", descricao: "Concreto de preenchimento de pilaretes, vergas, contravergas e cintas (EPS retirado; faces como fôrma) — lançamento em faixa estreita e adensamento, por m³",
      unidade: "m³", propria: true, quantidadeDe: "totais.concretoM3",
      insumos: [ins(cfg, "BLK-03", "mat.concreto", "Concreto de preenchimento (C25 fluido de referência; fck e traço conforme o projeto/cálculo) incl. perda", "m³", 1 + P.concreto, "MAT", ORIGEM.premissa + " (perda " + Math.round(P.concreto * 100) + " %)", ORI.param)]
        .concat(insMO(cfg, "BLK-03", C, C.m3Dia, "m³", ORIGEM.premissa, ORI.param))
        .concat([insEQ(cfg, "BLK-03", "eq.vibrador", "Vibrador de imersão de agulha fina", C.m3Dia, "m³"), insVerba(cfg, "BLK-03")])
    });

    // (4) armação
    var bar = ref ? somaBarra(ref.pags) : null, acoKg = ref ? ref.totais.acoKg : 0;
    var espUn = bar ? bar.verga * R.espacadorUnPorMVerga + bar.pilarete * R.espacadorUnPorMPilarete : null;
    lista.push({
      codigo: "BLK-04", etapa: "Armação", descricao: "Armação de pilaretes, vergas, contravergas e cintas — corte, dobra e montagem, por kg",
      unidade: "kg", propria: true, quantidadeDe: "totais.acoKg",
      insumos: [ins(cfg, "BLK-04", "mat.aco", "Aço CA para armadura (bitolas do projeto) incl. perda", "kg", 1 + P.aco, "MAT", ORIGEM.premissa + " (perda " + Math.round(P.aco * 100) + " %)", ORI.param),
        ins(cfg, "BLK-04", "mat.arame", "Arame recozido (amarração)", "kg", R.arameKgPorKgAco, "MAT", ORIGEM.premissa + " — " + br(R.arameKgPorKgAco, 3) + " kg de arame por kg de aço (prática de armação). cfg.armacao.arameKgPorKgAco", ORI.param),
        ins(cfg, "BLK-04", "mat.espacador", "Espaçadores plásticos de cobrimento", "un", espUn != null && acoKg > 0 ? espUn / acoKg : null, "MAT",
          bar ? ORIGEM.premissa + " — " + br(R.espacadorUnPorMVerga, 1) + " un/m de verga/contraverga/cinta (" + br(bar.verga, 1) + " m) + " + br(R.espacadorUnPorMPilarete, 1) + " un/m de pilarete (" + br(bar.pilarete, 1) + " m) = " + br(espUn, 0) + " un ÷ " + br(acoKg, 1) + " kg de aço"
              : "Depende da obra (metros de verga, cinta e pilarete): informe o resultado do motor", ORI.param)]
        .concat(insMO(cfg, "BLK-04", R, R.kgDia, "kg", ORIGEM.premissa, ORI.param)).concat([insVerba(cfg, "BLK-04")])
    });

    // (5) escoramento de verga
    lista.push({
      codigo: "BLK-05", etapa: "Escoramento", descricao: "Escoramento do fundo da verga (montagem e retirada), por verga",
      unidade: "un", propria: true, quantidadeDe: "totais.escoramentoVergas",
      insumos: insMO(cfg, "BLK-05", S, S.unDia, "un", ORIGEM.premissa, ORI.param).concat([
        ins(cfg, "BLK-05", "mat.escora", "Escoras e gabarito de madeira, com reaproveitamento (" + S.escorasPorVerga + " escoras por verga ÷ " + S.reusos + " usos)", "un", S.reusos > 0 ? S.escorasPorVerga / S.reusos : null, "MAT",
          ORIGEM.premissa + " — " + S.escorasPorVerga + " escoras por verga, " + S.reusos + " reusos. cfg.escoramento.escorasPorVerga / reusos", ORI.param)
      ])
    });

    // (6) tratamento de juntas
    var tr = exCfg.tratamento;
    lista.push({
      codigo: "BLK-06", etapa: "Tratamento de juntas", descricao: "Tratamento de juntas: raspagem, desbaste com maquita/disco flap, selador, AC-III aditivada, tela de fibra de vidro e 2ª demão — por m de junta tratada (cada face conta)",
      unidade: "m", propria: true, quantidadeDe: "totais.telaM",
      insumos: [
        ins(cfg, "BLK-06", "mat.selador", "Selador acrílico (diluído 1:1)", "L", tr.seladorLPorM, "MAT", ORIGEM.motor + " (cfg.exec.tratamento.seladorLPorM, parâmetro RA — vídeo oficial 11/06/2026 não dá consumo)", ORI.param),
        ins(cfg, "BLK-06", "mat.ac3", "Argamassa AC-III aditivada (2 demãos)", "kg", tr.acIIIkgPorM, "MAT", ORIGEM.motor + " (cfg.exec.tratamento.acIIIkgPorM, parâmetro RA)", ORI.param),
        ins(cfg, "BLK-06", "mat.tela-fibra", "Tela de fibra de vidro, largura " + Math.round(tr.telaLarguraM * 100) + " cm", "m", 1, "MAT", ORIGEM.motor + " (1 m de tela por m de junta)", ORI.param),
        ins(cfg, "BLK-06", "mat.aditivo-ac3", "Aditivo da AC-III (resina de rejunte)", "L", tr.acIIIkgPorM * J.aditivoLPorKgAc3, "MAT", ORIGEM.premissa + " — " + br(J.aditivoLPorKgAc3, 2) + " L por kg de AC-III (dosagem do fabricante não publicada). cfg.juntas.aditivoLPorKgAc3", ORI.param)
      ].concat(insMO(cfg, "BLK-06", J, J.mDia, "m", ORIGEM.premissa, ORI.param)).concat([
        insEQ(cfg, "BLK-06", "eq.maquita", "Maquita com disco flap para desbaste", J.mDia, "m"), insVerba(cfg, "BLK-06")
      ])
    });

    // (7) grampo de ligação
    lista.push({
      codigo: "BLK-07", etapa: "Ligações", descricao: "Grampo de ligação da parede à estrutura/parede transversal a cada fiada, ancorado ≥ 15 cm (Diretriz SiNAT 019), por unidade",
      unidade: "un", propria: true, quantidadeDe: "totais.grampos",
      insumos: [ins(cfg, "BLK-07", "mat.grampo", "Grampo de ligação — bitola e comprimento a confirmar no projeto", "un", 1, "MAT", E.FONTES.diretriz + " (1 grampo por fiada)", ORI.norma)]
        .concat(insMO(cfg, "BLK-07", G, G.unDia, "un", ORIGEM.premissa, ORI.param))
    });

    // (8) encunhamento
    lista.push({
      codigo: "BLK-08", etapa: "Encunhamento", descricao: "Encunhamento do topo da parede sob a estrutura (folga ≥ 30 mm — SiNAT 019), por m",
      unidade: "m", propria: true, quantidadeDe: "encunhamentoM",
      insumos: [ins(cfg, "BLK-08", "mat.encunhamento", "Material de encunhamento (argamassa expansiva/graute): " + Math.round(Math.max(exCfg.encunhamento, E.DIRETRIZ.encunhamentoMin) * 1000) + " mm × espessura " + Math.round(N.espRef * 100) + " cm", "m³",
        Math.max(exCfg.encunhamento, E.DIRETRIZ.encunhamentoMin) * N.espRef, "MAT", "Volume geométrico da folga × espessura de referência " + br(N.espRef, 2) + " m (cfg.encunhamento.espRef)", ORI.param)]
        .concat(insMO(cfg, "BLK-08", N, N.mDia, "m", ORIGEM.premissa, ORI.param))
    });

    // EPI por função (opcional): rateio por hora de MO daquela função
    if (cfg.incluirEPI) {
      ["pedreiro", "ajudante", "armador"].forEach(function (f, i) {
        var cod = "BLK-09-" + f;
        lista.push({
          codigo: cod, etapa: "Segurança (EPI)", descricao: "EPI — " + FUNC[f] + " (capacete, óculos, luvas, protetor auricular, máscara PFF2 no corte, botina) — rateio por hora trabalhada",
          unidade: "h", propria: true, opcional: true, funcao: FUNC[f], quantidadeDe: "horas." + f,
          insumos: [ins(cfg, cod, "mat.epi-" + f, "Rateio de EPI por hora trabalhada — " + FUNC[f], "h", 1, "MAT", "1 h de EPI por hora de MO; preço do kit por hora = referência RA", ORI.param)]
        });
      });
    }
    // preço e origem do preço em cada insumo (cfg.precos > cfg.base > referência RA)
    lista.forEach(function (c) {
      c.insumos.forEach(function (it) {
        if (it.unidade === "%MO") return;
        var e = precoEfetivo(cfg, it.chave, ctx);
        it.precoUnitario = e.preco; it.origemPreco = e.origem; it.fontePreco = e.fonte;
      });
    });
    return lista;
  }

  /* ------------------------------------------------------------------
   * CUSTO de uma composição: por insumo, MO/MAT/EQ, sem preço, horas
   * ------------------------------------------------------------------ */
  function precoDe(cfg, chave) { return precoEfetivo(cfg, chave).preco; }
  function precoIns(it, cfg) { return it.precoUnitario !== undefined ? it.precoUnitario : precoDe(cfg, it.chave); }
  function custoComposicao(comp, cfg) {
    var part = { MO: 0, MAT: 0, EQ: 0 }, semPreco = [], horas = {}, completo = true, i, it, preco, origens = [];
    // 1º passo: o que tem coeficiente e preço
    for (i = 0; i < comp.insumos.length; i++) {
      it = comp.insumos[i];
      if (it.unidade === "%MO") continue;
      if (it.tipo === "MO" && it.coeficiente != null) horas[it.funcao] = (horas[it.funcao] || 0) + it.coeficiente;
      if (it.coeficiente == null) { semPreco.push({ chave: it.chave, descricao: it.descricao, motivo: "coeficiente pendente" }); completo = false; continue; }
      preco = precoIns(it, cfg);
      if (preco == null) { semPreco.push({ chave: it.chave, descricao: it.descricao, motivo: "sem preço" }); completo = false; continue; }
      part[it.tipo] += it.coeficiente * preco;
      var og = it.origemPreco || precoEfetivo(cfg, it.chave).origem;
      if (og && origens.indexOf(og) < 0) origens.push(og);
    }
    // 2º passo: verba % da MO
    for (i = 0; i < comp.insumos.length; i++) {
      it = comp.insumos[i];
      if (it.unidade !== "%MO") continue;
      if (it.coeficiente == null) { semPreco.push({ chave: it.chave, descricao: it.descricao, motivo: "coeficiente pendente" }); completo = false; continue; }
      var moCompleta = comp.insumos.every(function (x) { return x.tipo !== "MO" || (x.coeficiente != null && precoIns(x, cfg) != null); });
      if (!moCompleta) { semPreco.push({ chave: it.chave, descricao: it.descricao, motivo: "depende do preço da mão de obra" }); completo = false; continue; }
      part.EQ += it.coeficiente / 100 * part.MO;
    }
    return { MO: part.MO, MAT: part.MAT, EQ: part.EQ, total: part.MO + part.MAT + part.EQ, completo: completo, semPreco: semPreco, horasPorUnidade: horas, origensPreco: origens };
  }

  /* ------------------------------------------------------------------
   * ORÇAR
   * ------------------------------------------------------------------ */
  function quantidades(ref, comps) {
    // devolve { codigoDaComposicao: quantidade }
    var q = {};
    ref.porEspessura.forEach(function (e) { q["BLK-01-" + e.espessura] = e.placasCompra; });
    q["BLK-02"] = ref.totais.areaLiquida;
    q["BLK-03"] = ref.totais.concretoM3;
    q["BLK-04"] = ref.totais.acoKg;
    q["BLK-05"] = ref.totais.escoramentoVergas;
    q["BLK-06"] = ref.totais.telaM;
    q["BLK-07"] = ref.totais.grampos;
    q["BLK-08"] = ref.encunhamentoM;
    return q;
  }
  function horasMO(comps, q) {
    // horas por função de todas as composições com MO (exceto EPI)
    var h = {};
    comps.forEach(function (c) {
      if (c.opcional) return;
      var qt = num(q[c.codigo]);
      c.insumos.forEach(function (it) { if (it.tipo === "MO" && it.coeficiente != null) h[it.funcao] = (h[it.funcao] || 0) + it.coeficiente * qt; });
    });
    return h;
  }

  function orcar(resultado, cfgIn) {
    var cfg = lerCfg(cfgIn), ref = refDe(resultado);
    if (!ref) return { ok: false, erro: "Sem paredes paginadas no resultado.", linhas: [], totais: null, pendencias: [] };
    var comps = composicoes(cfgIn, resultado), q = quantidades(ref, comps);
    var hTot = horasMO(comps, q), linhas = [], pend = [];
    var epiH = {};
    comps.forEach(function (c) {
      if (c.opcional) {
        var f = c.funcao, qt = hTot[f] || 0;
        if (qt > 0) epiH[c.codigo] = qt;
        q[c.codigo] = qt;
      }
    });
    var tot = { MO: 0, MAT: 0, EQ: 0, total: 0, parcial: false, linhasSemPreco: 0, horas: {}, horasTotal: 0, origensPreco: [] };
    comps.forEach(function (c) {
      var qt = num(q[c.codigo]);
      if (qt <= 0) return;                       // etapa que a obra não tem
      var cu = custoComposicao(c, cfg), horas = {};
      Object.keys(cu.horasPorUnidade).forEach(function (f) { horas[f] = r3(cu.horasPorUnidade[f] * qt); });
      var origemPreco = cu.origensPreco.length ? cu.origensPreco.join(" + ") : null;
      var insumosPreco = c.insumos.filter(function (it) { return it.unidade !== "%MO"; }).map(function (it) {
        return { chave: it.chave, descricao: it.descricao, unidade: it.unidade, tipo: it.tipo, coeficiente: it.coeficiente, preco: it.precoUnitario == null ? null : it.precoUnitario, origemPreco: it.origemPreco || null, origemCoeficiente: it.origem };
      });
      var L = {
        etapa: c.etapa, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, quantidade: r4(qt),
        quantidadeUnidade: c.unidade, quantidadeDe: c.quantidadeDe,
        custoUnitario: cu.completo ? r2(cu.total) : null,
        custoUnitarioParcial: r2(cu.total),
        custoTotal: cu.completo ? r2(cu.total * qt) : null,
        MO: r2(cu.MO * qt), MAT: r2(cu.MAT * qt), EQ: r2(cu.EQ * qt),
        horas: horas, semPreco: !cu.completo, insumosSemPreco: cu.semPreco,
        origemPreco: origemPreco, insumosPreco: insumosPreco,
        origem: "Quantidade do consolidar() do BlocokExec (" + c.quantidadeDe + ") × composição própria " + c.codigo + " · preço: " + (origemPreco || "sem preço") + " · coeficientes: " + (c.insumos.some(function (it) { return it.origem === ORI.param; }) ? "parâmetro RA (editável)" : "fabricante/diretriz")
      };
      linhas.push(L);
      tot.MO += cu.MO * qt; tot.MAT += cu.MAT * qt; tot.EQ += cu.EQ * qt;
      cu.origensPreco.forEach(function (o) { if (tot.origensPreco.indexOf(o) < 0) tot.origensPreco.push(o); });
      if (cu.completo) tot.total += cu.total * qt; else { tot.parcial = true; tot.linhasSemPreco++; tot.total += cu.total * qt; }
      Object.keys(horas).forEach(function (f) { tot.horas[f] = (tot.horas[f] || 0) + horas[f]; tot.horasTotal += horas[f]; });
      cu.semPreco.forEach(function (s) { pend.push({ tipo: s.motivo === "coeficiente pendente" ? "coeficiente" : "sem-preco", composicao: c.codigo, chave: s.chave, texto: c.codigo + " · " + s.descricao + " — " + s.motivo }); });
    });
    ["MO", "MAT", "EQ", "total", "horasTotal"].forEach(function (k) { tot[k] = r2(tot[k]); });
    Object.keys(tot.horas).forEach(function (f) { tot.horas[f] = r3(tot.horas[f]); });
    var area = ref.totais.areaLiquida;
    tot.areaParedeM2 = r3(area);
    tot.custoPorM2 = (!tot.parcial && area > 0) ? r2(tot.total / area) : null;
    tot.custoPorM2Parcial = area > 0 ? r2(tot.total / area) : null;
    tot.horasPorM2 = area > 0 ? r4(tot.horasTotal / area) : null;
    tot.porM2 = area > 0 ? { MO: r2(tot.MO / area), MAT: r2(tot.MAT / area), EQ: r2(tot.EQ / area), total: r2(tot.total / area) } : null;
    tot.bdiIncluso = false;
    tot.precosDeReferencia = tot.origensPreco.indexOf("referência RA") >= 0;
    var ref400 = num(cfg.mercadoRefM2, 400), comp = tot.custoPorM2;
    var mercado = {
      referenciaM2: ref400, ehPreco: false,
      fonte: "Fábrica de Pindamonhangaba-SP, vídeo de 05/2025: \"R$ 400 o m² com mão de obra, com material\" (parede pronta, parte cinza)",
      nota: "REFERÊNCIA de mercado, não preço deste orçamento. Não inclui BDI/impostos desta obra nem as condições locais.",
      comparavel: comp != null,
      diferencaPct: comp != null && ref400 > 0 ? r2((comp / ref400 - 1) * 100) : null,
      diferencaM2: comp != null ? r2(comp - ref400) : null,
      texto: comp != null ? ("Custo direto calculado R$ " + br(comp) + "/m² (material R$ " + br(tot.porM2.MAT) + " + mão de obra R$ " + br(tot.porM2.MO) + " + equipamento R$ " + br(tot.porM2.EQ) + ") contra R$ " + br(ref400) + "/m² de referência de parede pronta com mão de obra (" + (comp - ref400 >= 0 ? "+" : "") + br((comp / ref400 - 1) * 100, 1) + " %). BDI NÃO incluso.") : "Comparação indisponível: o usuário apagou algum preço — o custo por m² ficaria parcial."
    };
    // notas (não são pendência): preços de referência e BDI
    var notas = [];
    if (tot.precosDeReferencia) notas.push({ tipo: "preco-referencia", texto: "Preços de referência RA (" + DATA_BASE_PRECOS + ") — confira com o seu fornecedor. Sobrescreva em cfg.precos[chave]; a origem do preço está em cada linha." });
    notas.push({ tipo: "bdi", texto: "BDI e impostos NÃO estão incluídos: o total é custo direto." });
    notas.push({ tipo: "peca", texto: "Preço da peça Blocok por CUSTO DE PRODUÇÃO (faces + EPS) × fator de fábrica " + br(cfg.peca.fatorFabrica, 1) + " — não é tabela do fabricante; frete à parte." });
    // pendências gerais
    var semCodigo = true;
    pend.push({ tipo: "codigo", texto: "Sem código SINAPI associado: as composições BLK-xx são PRÓPRIAS (não existem na SINAPI). Informe cfg.codigosSinapi[chave] só onde houver equivalente confirmado na base." });
    comps.forEach(function (c) { c.insumos.forEach(function (it) { if (it.codigoSinapi) semCodigo = false; }); });
    pend = pend.concat(pendAco(resultado, ref));
    var pecas = Object.keys(Exec().CATALOGO).map(function (k) { return precoPeca(+k, cfg); });
    var acoCtx = { acoPreco: acoPrecoMedio(cfg, ref) };
    return { ok: true, linhas: linhas, totais: tot, mercado: mercado, composicoes: comps, quantidades: q, pendencias: pend, notas: notas, semCodigoSinapi: semCodigo,
      pecas: pecas, tabelaPrecos: tabelaPrecos(cfg, acoCtx), dataBasePrecos: DATA_BASE_PRECOS,
      produtividade: produtividade(cfgIn) };
  }

  /* conferência do aço: só quando o quantitativo ainda é a armadura CONSTRUTIVA
     (paginação sem cálculo). Depois do BlocokCalc o quant.aco JÁ É o calculado
     (quant.acoConstrutivo === false) e não há o que comparar — comparar o texto
     "n por face" com o total de barras dava falso positivo (14/10/2026). */
  function parseArm(s) {
    var m = /^\s*(\d+)\s*[φϕØ]\s*([\d.,]+)/.exec(String(s || ""));
    return m ? { n: +m[1], bit: parseFloat(m[2].replace(",", ".")) } : null;
  }
  function pendAco(resultado, ref) {
    var out = [];
    try {
      var ws = resultado && !Array.isArray(resultado) ? resultado.paredes || [] : [];
      var dif = [], tot = 0;
      ws.forEach(function (w) {
        if (!w.pag || w.pag.quant.acoConstrutivo === false) return;
        var constr = {};
        w.pag.quant.aco.forEach(function (a) {
          var m = /^(?:pilarete|verga|viga|contraverga|cinta[^]*?)\s+(\S+)$/.exec(a.elemento);
          if (m && !/^estribos/.test(a.elemento)) constr[m[1]] = { n: a.barras, bit: a.bitola };
        });
        function cmp(id, armadura) {
          var c = parseArm(armadura), k = constr[id];
          if (!c || !k) return;
          tot++;
          if (c.n !== k.n || Math.abs(c.bit - k.bit) > 0.01) dif.push(w.id + " " + id + ": calculado " + c.n + " φ" + c.bit + " × orçado " + k.n + " φ" + k.bit);
        }
        (w.pilaretes || []).forEach(function (p) { cmp(p.id, p.armadura); });
        (w.vergas || []).forEach(function (v) { cmp(v.id, v.armadura); });
        if (w.cinta && w.pag.reforcos.cintas[0]) cmp(w.pag.reforcos.cintas[0].id, w.cinta.armadura);
      });
      if (dif.length) out.push({ tipo: "aco", texto: "Aço orçado = armadura CONSTRUTIVA do motor executivo (" + br(ref.totais.acoKg, 1) + " kg). O cálculo (blocokcalc) pede armadura diferente em " + dif.length + " de " + tot + " elementos conferidos (ex.: " + dif.slice(0, 3).join("; ") + "). Ao fechar o projeto, trocar o aço do orçamento pelo calculado.", itens: dif });
    } catch (e) { /* conferência opcional */ }
    return out;
  }

  /* ------------------------------------------------------------------
   * PRODUTIVIDADE — a conta, em texto e em números
   * ------------------------------------------------------------------ */
  function produtividade(cfgIn) {
    var cfg = lerCfg(cfgIn), A = cfg.assentamento, j = cfg.jornadaH;
    var hp = A.pedreiro * j / A.m2Dia, ha = A.ajudante * j / A.m2Dia;
    return {
      m2Dia: A.m2Dia, jornadaH: j, pedreiros: A.pedreiro, ajudantes: A.ajudante,
      hPorM2: { pedreiro: hp, ajudante: ha, total: hp + ha },
      conferencia: { blocomTccHPorM2: [0.44, 0.51], sinapi101154: { pedreiro: 0.803, servente: 0.402, total: 1.205 } },
      texto: "Fabricante: " + A.m2Dia + " m²/dia por equipe (tamanho da equipe NÃO informado). Premissa RA: " + A.pedreiro + " pedreiro + " + A.ajudante + " ajudantes, " + j + " h/dia. " +
        "Pedreiro = " + A.pedreiro + " × " + j + " ÷ " + A.m2Dia + " = " + br(hp, 4) + " h/m²; ajudante = " + A.ajudante + " × " + j + " ÷ " + A.m2Dia + " = " + br(ha, 4) + " h/m²; total " + br(hp + ha, 4) + " h/m². " +
        "Conferência: TCCs Blocom 0,44 a 0,51 h/m²; SINAPI 101154 (bloco de concreto celular) 0,803 + 0,402 = 1,205 h/m²."
    };
  }

  /* ------------------------------------------------------------------
   * CRONOGRAMA (dias úteis relativos; dia 0 = início da obra)
   *   atividade: { id, nome, duracao (null = a definir), duracaoCalc, inicio, fim (fim = início + duração,
   *     exclusivo), marco, predecessoras:[ids], tipo:"TI", lag, categoria, foraEscopo, aDefinir, estimado,
   *     horas:{função:h}, folga, critica }
   *   campos compatíveis com o cronograma do sistema (js/cronograma.js, js/cronorede.js: TI/II/TT/IT).
   * ------------------------------------------------------------------ */
  function diasDe(qtd, prodDia, nEq) { return prodDia > 0 && nEq > 0 ? qtd / prodDia / nEq : 0; }
  function somaH(a, b) { var o = {}; [a, b].forEach(function (m) { Object.keys(m || {}).forEach(function (k) { o[k] = (o[k] || 0) + m[k]; }); }); return o; }
  function escalaH(m, k) { var o = {}; Object.keys(m || {}).forEach(function (f) { o[f] = m[f] * k; }); return o; }
  function horasDe(comp, qtd) {
    var h = {};
    if (!comp) return h;
    comp.insumos.forEach(function (it) { if (it.tipo === "MO" && it.coeficiente != null) h[it.funcao] = (h[it.funcao] || 0) + it.coeficiente * qtd; });
    return h;
  }
  // dias da etapa: a função que mais demora com a equipe dada
  function diasEtapa(h, crew, jornada, nEq) {
    var d = 0;
    ["pedreiro", "ajudante", "armador"].forEach(function (f) {
      var hf = h[FUNC[f]] || 0, n = num(crew[f]);
      if (hf > 0 && n > 0) d = Math.max(d, hf / (n * jornada * nEq));
    });
    return d;
  }

  function cronograma(resultado, cfgIn) {
    var cfg = lerCfg(cfgIn), ref = refDe(resultado);
    if (!ref) return { ok: false, erro: "Sem paredes paginadas no resultado.", atividades: [] };
    var comps = composicoes(cfgIn, resultado), porCod = {};
    comps.forEach(function (c) { porCod[c.codigo] = c; });
    var nEq = Math.max(1, Math.floor(num(cfg.equipes, 1))), jorn = cfg.jornadaH, A = cfg.assentamento;
    var avisos = [], atv = [];
    function nova(o) {
      o.tipo = "TI"; o.lag = o.lag || 0; o.predecessoras = o.predecessoras || [];
      o.marco = !!o.marco; o.foraEscopo = !!o.foraEscopo; o.horas = o.horas || {};
      if (o.duracao === undefined) o.duracao = null;
      o.aDefinir = o.duracao === null && !o.marcoPuro;
      o.duracaoCalc = o.duracao === null ? 0 : o.duracao;
      atv.push(o); return o;
    }
    function ceilMin(d, temTrabalho) { var c = Math.ceil(d - 1e-9); return temTrabalho ? Math.max(1, c) : Math.max(0, c); }

    // por parede: área líquida, área da 1ª fiada (escalada para a área líquida)
    var paredes = ref.pags.map(function (p) {
      var a1 = 0; p.pecas.forEach(function (pc) { if (pc.fiada === 1) a1 += pc.area; });
      var frac = p.quant.areaPecas > 0 ? Math.min(1, a1 / p.quant.areaPecas) : 0;
      return { id: p.id, nome: p.nome || p.id, area: p.quant.areaLiquida, a1: p.quant.areaLiquida * frac, grampos: p.quant.grampos };
    });
    var area1 = paredes.reduce(function (s, w) { return s + w.a1; }, 0);
    var cAss = porCod["BLK-02"], cGr = porCod["BLK-07"];

    // fundação
    var fund = nova({ id: "blk_fund", nome: "Fundação (fora do escopo Blocok)", categoria: "fundacao", foraEscopo: true,
      duracao: cfg.fundacaoDias == null ? null : Math.max(0, Math.ceil(+cfg.fundacaoDias)), origem: cfg.fundacaoDias == null ? "A definir pelo usuário" : "Informado pelo usuário" });
    if (fund.aDefinir) avisos.push("Duração da fundação a definir: as datas relativas contam 0 dia para ela.");

    // marcação + 1ª fiada
    var h1 = horasDe(cAss, area1);
    var d1 = ceilMin(num(cfg.marcacaoDias) + diasDe(area1, A.m2Dia, nEq), true);
    var marc = nova({ id: "blk_marc", nome: "Marcação e 1ª fiada", categoria: "alvenaria", predecessoras: ["blk_fund"], duracao: d1, horas: h1, origemDur: "parâmetro RA (editável)",
      origem: "Marcação " + cfg.marcacaoDias + " dia(s) (parâmetro RA) + 1ª fiada " + br(area1, 2) + " m² ÷ " + A.m2Dia + " m²/dia" });

    // assentamento
    var assIds = [];
    var restoAss = paredes.map(function (w) {
      var ar = Math.max(0, w.area - w.a1), dias = diasDe(ar, A.m2Dia, 1) + (cGr ? diasDe(w.grampos, cfg.grampos.unDia, 1) : 0);
      return { w: w, ar: ar, dias: dias, horas: somaH(horasDe(cAss, ar), horasDe(cGr, w.grampos)) };
    });
    if (cfg.agrupar === "parede" && paredes.length > 1) {
      var livre = []; for (var k = 0; k < nEq; k++) livre.push({ ult: null, fim: 0 });
      restoAss.forEach(function (r) {
        var best = 0; for (var z = 1; z < livre.length; z++) if (livre[z].fim < livre[best].fim) best = z;
        var preds = ["blk_marc"]; if (livre[best].ult) preds.push(livre[best].ult);
        var dur = ceilMin(r.dias, r.ar > 0 || r.horas && Object.keys(r.horas).length > 0);
        var a = nova({ id: "blk_ass_" + r.w.id, nome: "Assentamento — " + r.w.nome, categoria: "alvenaria", predecessoras: preds, duracao: dur, horas: r.horas, origemDur: "parâmetro RA (editável)",
          origem: br(r.ar, 2) + " m² ÷ " + A.m2Dia + " m²/dia + grampos", equipe: best + 1 });
        livre[best].ult = a.id; livre[best].fim += dur; assIds.push(a.id);
      });
    } else {
      var diasTot = restoAss.reduce(function (s, r) { return s + r.dias; }, 0), hAll = {};
      restoAss.forEach(function (r) { hAll = somaH(hAll, r.horas); });
      var ar = restoAss.reduce(function (s, r) { return s + r.ar; }, 0);
      nova({ id: "blk_ass", nome: "Assentamento das paredes (amarração + grampos)", categoria: "alvenaria", predecessoras: ["blk_marc"],
        duracao: ceilMin(diasTot / nEq, ar > 0), horas: hAll, origemDur: "parâmetro RA (editável)",
        origem: br(ar, 2) + " m² ÷ " + A.m2Dia + " m²/dia ÷ " + nEq + " equipe(s), mais grampos" });
      assIds.push("blk_ass");
    }

    // armação e escoramento → concretagem → cura
    var T = ref.totais;
    var hArm = horasDe(porCod["BLK-04"], T.acoKg), hEsc = horasDe(porCod["BLK-05"], T.escoramentoVergas);
    var dArm = diasEtapa(hArm, cfg.armacao, jorn, nEq), dEsc = diasEtapa(hEsc, cfg.escoramento, jorn, nEq);
    var temArmEsc = T.acoKg > 0 || T.escoramentoVergas > 0;
    var arm = nova({ id: "blk_arm", nome: "Armação e escoramento (pilaretes, vergas, cintas)", categoria: "estrutura", predecessoras: assIds.slice(),
      duracao: ceilMin(dArm + dEsc, temArmEsc), horas: somaH(hArm, hEsc), origemDur: "parâmetro RA (editável)", origem: br(T.acoKg, 1) + " kg de aço + " + T.escoramentoVergas + " escoramento(s) de verga" });
    var hConc = horasDe(porCod["BLK-03"], T.concretoM3);
    var conc = nova({ id: "blk_conc", nome: "Concretagem de pilaretes, vergas e cintas", categoria: "estrutura", predecessoras: ["blk_arm"],
      duracao: ceilMin(diasEtapa(hConc, cfg.concretagem, jorn, nEq), T.concretoM3 > 0), horas: hConc, origemDur: "parâmetro RA (editável)", origem: br(T.concretoM3, 3) + " m³" });
    var cura = nova({ id: "blk_cura", nome: "Cura do concreto (espera)", categoria: "estrutura", predecessoras: ["blk_conc"],
      duracao: Math.max(0, Math.ceil(num(cfg.curaConcretoDias))), origemDur: "parâmetro RA (editável)", espera: true, origem: "Espera parametrizada (cfg.curaConcretoDias) — premissa RA" });
    // laje: fora do escopo
    var laje = nova({ id: "blk_laje", nome: "Laje (fora do escopo Blocok — marco)", categoria: "estrutura", foraEscopo: true, marco: true, predecessoras: ["blk_cura"],
      duracao: cfg.lajeDias == null ? null : Math.max(0, Math.ceil(+cfg.lajeDias)), origem: cfg.lajeDias == null ? "A definir pelo usuário" : "Informado pelo usuário" });
    if (laje.aDefinir) avisos.push("Duração da laje a definir: as datas relativas contam 0 dia para ela.");
    var esc = nova({ id: "blk_escoras", nome: "Cura da laje e retirada do escoramento", categoria: "estrutura", foraEscopo: true, predecessoras: ["blk_laje"],
      duracao: Math.max(0, Math.ceil(num(cfg.lajeCuraDias))), origemDur: "parâmetro RA (editável)", espera: true, origem: "Espera parametrizada (cfg.lajeCuraDias) — premissa RA" });
    // tratamento de juntas — só depois de retirar as escoras da laje (vídeo oficial EXu-v2615_s)
    var hJ = horasDe(porCod["BLK-06"], T.telaM);
    var jun = nova({ id: "blk_juntas", nome: "Tratamento de juntas (só após retirar o escoramento da laje)", categoria: "acabamento", predecessoras: ["blk_escoras"],
      duracao: ceilMin(diasEtapa(hJ, cfg.juntas, jorn, nEq), T.telaM > 0), horas: hJ, origemDur: "parâmetro RA (editável)", origem: br(T.telaM, 1) + " m de junta (cada face conta)" });
    var finais = ["blk_juntas"];
    if (ref.encunhamentoM > 0) {
      var hE = horasDe(porCod["BLK-08"], ref.encunhamentoM);
      nova({ id: "blk_encunh", nome: "Encunhamento do topo sob a estrutura", categoria: "alvenaria", predecessoras: ["blk_escoras"],
        duracao: ceilMin(diasEtapa(hE, cfg.encunhamento, jorn, nEq), true), horas: hE, origemDur: "parâmetro RA (editável)", origem: br(ref.encunhamentoM, 2) + " m" });
      finais.push("blk_encunh");
    }
    var acab = nova({ id: "blk_acab", nome: "Acabamento (massa e pintura — fora do escopo Blocok)", categoria: "acabamento", foraEscopo: true, predecessoras: finais,
      duracao: cfg.acabamentoDias == null ? null : Math.max(0, Math.ceil(+cfg.acabamentoDias)), origem: cfg.acabamentoDias == null ? "A definir pelo usuário" : "Informado pelo usuário" });
    if (acab.aDefinir) avisos.push("Duração do acabamento a definir.");
    void acab; void jun; void esc; void cura; void conc; void arm; void marc;

    // CPM (finish-to-start; ordem do vetor já é topológica)
    var porId = {}; atv.forEach(function (a) { porId[a.id] = a; });
    atv.forEach(function (a) {
      var es = 0;
      a.predecessoras.forEach(function (p) { es = Math.max(es, porId[p].fim + a.lag); });
      a.inicio = es; a.fim = es + a.duracaoCalc;
    });
    var fimObra = atv.reduce(function (m, a) { return Math.max(m, a.fim); }, 0);
    var sucs = {}; atv.forEach(function (a) { a.predecessoras.forEach(function (p) { (sucs[p] = sucs[p] || []).push(a.id); }); });
    for (var i = atv.length - 1; i >= 0; i--) {
      var a = atv[i], lf = fimObra;
      (sucs[a.id] || []).forEach(function (s) { lf = Math.min(lf, porId[s].tardio - porId[s].lag); });
      a.tardioFim = lf; a.tardio = lf - a.duracaoCalc;
    }
    atv.forEach(function (a) { a.folga = a.tardio - a.inicio; a.critica = a.folga === 0; });
    var criticos = atv.filter(function (a) { return a.critica; }).map(function (a) { return a.id; });
    atv.forEach(function (a) { delete a.tardio; delete a.tardioFim; delete a.marcoPuro; });
    return { ok: true, atividades: atv, caminhoCritico: criticos, duracaoTotal: fimObra, equipes: nEq, agrupar: cfg.agrupar === "parede" ? "parede" : "lote",
      unidadeTempo: "dias úteis relativos (dia 0 = início da obra; fim exclusivo)", avisos: avisos, produtividade: produtividade(cfgIn) };
  }

  /* ------------------------------------------------------------------
   * HISTOGRAMA de MO: horas por função por dia (horas da atividade
   * espalhadas por igual nos dias dela; a soma fecha com a do orçamento)
   * ------------------------------------------------------------------ */
  function histograma(resultado, cfgIn, cronoPronto) {
    var cfg = lerCfg(cfgIn), cr = cronoPronto || cronograma(resultado, cfgIn);
    if (!cr.ok) return { ok: false, dias: [], porFuncao: {}, totalHoras: 0 };
    var fim = cr.duracaoTotal, dias = [], i;
    for (i = 0; i < fim; i++) dias.push({ dia: i, horas: {}, total: 0 });
    cr.atividades.forEach(function (a) {
      if (a.duracaoCalc <= 0) return;
      Object.keys(a.horas).forEach(function (f) {
        var h = a.horas[f] / a.duracaoCalc;
        for (var d = a.inicio; d < a.fim; d++) { dias[d].horas[f] = (dias[d].horas[f] || 0) + h; dias[d].total += h; }
      });
    });
    var porF = {}, tot = 0;
    dias.forEach(function (d) {
      Object.keys(d.horas).forEach(function (f) {
        porF[f] = porF[f] || { horas: 0, picoPessoas: 0 };
        porF[f].horas += d.horas[f]; porF[f].picoPessoas = Math.max(porF[f].picoPessoas, Math.ceil(d.horas[f] / cfg.jornadaH - 1e-9));
        d.horas[f] = r3(d.horas[f]);
      });
      tot += d.total; d.total = r3(d.total);
    });
    Object.keys(porF).forEach(function (f) { porF[f].horas = r3(porF[f].horas); });
    return { ok: true, dias: dias, porFuncao: porF, totalHoras: r3(tot), jornadaH: cfg.jornadaH };
  }

  return {
    FUNC: FUNC, ORIGEM: ORIGEM, ORI: ORI, cfgPadrao: cfgPadrao,
    PRECOS_REFERENCIA: PRECOS_REFERENCIA, DATA_BASE_PRECOS: DATA_BASE_PRECOS, precoPeca: precoPeca, precoEfetivo: function (cfgIn, chave) { return precoEfetivo(lerCfg(cfgIn), chave); },
    composicoes: composicoes, orcar: orcar, cronograma: cronograma, histograma: histograma, produtividade: produtividade,
    _custoComposicao: custoComposicao, _refDe: refDe
  };
});

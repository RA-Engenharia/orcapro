/* =====================================================================
 * mor/geometria.js — PARÂMETROS DA OBRA → GEOMETRIA DEDUZIDA (motor puro)
 *
 * Absorve `OrcParam.normalizar` e `OrcParam.geometria` (js/orcparam.js) para o
 * Motor de Orçamento por Regras. A conta é a MESMA, na mesma ordem das operações
 * — a paridade com o orçamento paramétrico antigo é provada em
 * tools/test-orcparam.js (tolerância 1e-9) e é o que impede o catálogo novo de
 * mudar preço de orçamento de cliente em silêncio.
 *
 * ⚠ TODA grandeza derivada tem a PREMISSA ESCRITA (PREMISSAS_DERIVADAS): o
 *   orçamentista lê "perímetro = 4,5 × √Ap" e decide se confia. Derivada sem
 *   premissa é número sem dono — o teste reprova se uma `g.<nome>` não tiver
 *   texto. Os coeficientes são ESTIMATIVAS de planta típica, não projeto:
 *   quem tem projeto informa o real (perímetro, pé-direito) e o informado vence.
 * ⚠ Cobertura: a área de telhado usa `fb = 1 + 0,30 × beiral`. O 0,30/m é o
 *   coeficiente que reproduz o 1,15 que o orçamento paramétrico sempre usou para
 *   beiral de 0,50 m (1 + 0,30 × 0,50 = 1,15). Não é fórmula geométrica exata
 *   (a exata depende do perímetro); é a calibração herdada, declarada.
 * Não toca DOM, Store nem base de preço.
 * ===================================================================== */
(function (global) {
  "use strict";

  function r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
  function cima(x) { return Math.max(0, Math.ceil((Number(x) || 0) - 1e-9)); }
  function num(v, padrao) {
    if (typeof v === "number") return isFinite(v) ? v : padrao;
    var s = String(v == null ? "" : v).replace(/^\s+|\s+$/g, "");
    if (!s) return padrao;
    /* "1.250,50" (BR) e "1250.5" (ponto decimal): o padrão de quem digita */
    if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : padrao;
  }
  function f2(x) { return String(r2(x)).replace(".", ","); }

  var PADROES = { popular: "Popular", normal: "Normal", alto: "Alto" };
  var COBERTURAS = {
    ceramica: { rotulo: "Telha cerâmica", incl: 35 },
    concreto: { rotulo: "Telha de concreto", incl: 30 },
    fibrocimento: { rotulo: "Telha de fibrocimento", incl: 15 },
    metalica: { rotulo: "Telha metálica termoacústica", incl: 10 },
    laje: { rotulo: "Laje impermeabilizada (sem telhado)", incl: 0 }
  };
  /* `tipo` de GEOMETRIA (não é a tipologia da obra): residencial = paredes internas
     densas; comercial = salão aberto. A tipologia aponta para um dos dois. */
  var TIPOS = { residencial: "Residencial", comercial: "Comercial / salão" };
  var FORROS = { gesso: "Forro de gesso", laje: "Laje (forro em laje pré-moldada)", nenhum: "Sem forro" };
  var PISOS = { ceramica: "Cerâmica", porcelanato: "Porcelanato" };

  /* uma premissa por grandeza derivada de `g` (e da cobertura) */
  var PREMISSAS_DERIVADAS = {
    Ap: "Área de projeção = área construída ÷ pavimentos.",
    P: "Perímetro externo = 4,5 × √Ap (planta retangular 1:1,5 com recortes de fachada ~10 %); o informado vence.",
    Li: "Paredes internas por pavimento = 0,50 m por m² de pavimento (residência de 2–3 quartos); 0,25 em salão comercial.",
    h: "Pé-direito informado (2,30–6,00 m); fora da faixa vale 2,80 m.",
    Lmaior: "Lado maior da planta = √(1,5 × Ap) (retângulo 1:1,5).",
    Autil: "Área útil (piso, forro) = 88 % da construída — as paredes ocupam ~12 %.",
    Aj: "Área de janelas = 1/8 da área útil (iluminação 1/6 nos cômodos de permanência, 1/8 na média).",
    Nj: "Janelas = área de janela ÷ 1,44 m² (janela típica 1,20 × 1,20).",
    Npi: "Portas internas = 1 a cada 14 m² construídos, 0,70 × 2,10 m.",
    Npe: "Portas externas = 2 em residência (social + serviço), 1 em comercial; 0,90 × 2,10 m.",
    Avaos: "Vãos = janelas + portas internas (0,70 × 2,10) + portas externas (0,90 × 2,10).",
    Npil: "Pilares por pavimento = 1 a cada 12 m² (malha ~3,5 m), mínimo 4; seção 14×30 cm.",
    sap: "Sapata quadrada de 1,2 m (3+ pav.), 1,0 m (2 pav.) ou 0,8 m (1 pav.), h média 0,30 m, assente a 1,0 m — confirmar com sondagem e projeto.",
    Lb: "Baldrame sob todas as paredes do térreo = P + Li; viga 15×30 cm.",
    /* cobertura */
    i: "Inclinação do telhado em decimal = inclinação (%) ÷ 100.",
    fi: "Fator de inclinação = √(1 + i²) (= 1/cos(atan i)): área inclinada ÷ área em projeção.",
    fb: "Fator de beiral = 1 + 0,30 × beiral (m); calibrado em 1,15 para o beiral de 0,50 m.",
    Acob: "Área de telhado = Ap × fb × fi (projeção, beiral e inclinação).",
    Lmenor: "Lado menor da planta = √(Ap ÷ 1,5) (retângulo 1:1,5).",
    Lcumeeira: "Cumeeira = lado maior da projeção (√(1,5 × Ap)) — telhado de 2 águas.",
    Lcalha: "Calha = 2 beirais × lado maior da projeção.",
    Hdesc: "Altura de cada descida pluvial = pé-direito × pavimentos + 0,50 m; 4 descidas."
  };

  var MorGeometria = {
    PADROES: PADROES, COBERTURAS: COBERTURAS, TIPOS: TIPOS, FORROS: FORROS, PISOS: PISOS,
    PREMISSAS_DERIVADAS: PREMISSAS_DERIVADAS,
    r2: r2, cima: cima, num: num, f2: f2,

    /* Parâmetros com os padrões que a pessoa não precisou digitar; cada padrão
       adotado vira premissa escrita — "não informado" nunca some. */
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

    /* Geometria deduzida: { g, premissas } — `premissas` em texto (tela) e
       `g` com uma entrada em PREMISSAS_DERIVADAS para cada chave. */
    derivar: function (p) {
      var g = {}, prem = [];
      g.Ap = r2(p.area / p.pavimentos);
      if (p.perimetro > 0) { g.P = r2(p.perimetro); g.Pf = "perímetro informado"; }
      else { g.P = r2(4.5 * Math.sqrt(g.Ap)); g.Pf = "4,5 × √Ap (planta retangular 1:1,5 com recortes)"; prem.push("Perímetro externo estimado em " + f2(g.P) + " m = 4,5 × √" + f2(g.Ap) + " (informe o real para mais precisão)."); }
      var kLi = p.tipo === "comercial" ? 0.25 : 0.50;
      g.Li = r2(kLi * g.Ap); g.Lif = f2(kLi) + " × Ap";
      prem.push("Paredes internas: " + f2(kLi) + " m por m² de pavimento (" + f2(g.Li) + " m por pavimento).");
      g.h = p.peDireito;
      g.Lmaior = r2(Math.sqrt(1.5 * g.Ap));
      g.Autil = r2(0.88 * p.area);
      prem.push("Área útil (piso, forro) = 88 % da construída = " + f2(g.Autil) + " m².");
      g.Aj = r2(0.125 * g.Autil);
      g.Nj = cima(g.Aj / 1.44);
      g.Npi = cima(p.area / 14);
      g.Npe = p.tipo === "comercial" ? 1 : 2;
      prem.push("Janelas = 1/8 da área útil (" + f2(g.Aj) + " m², " + g.Nj + " un de 1,20×1,20); " + g.Npi + " porta(s) interna(s) 0,70×2,10; " + g.Npe + " externa(s) 0,90×2,10.");
      g.Avaos = r2(g.Aj + g.Npi * 0.70 * 2.10 + g.Npe * 0.90 * 2.10);
      g.Npil = Math.max(4, cima(g.Ap / 12));
      prem.push(g.Npil + " pilares por pavimento (um a cada 12 m², malha ~3,5 m), seção 14×30 cm; vigas 14×30 cm sobre todas as paredes.");
      g.sap = p.pavimentos >= 3 ? 1.2 : (p.pavimentos === 2 ? 1.0 : 0.8);
      prem.push("Fundação rasa: sapatas " + f2(g.sap) + "×" + f2(g.sap) + " m (h média 0,30 m, assentes a 1,0 m) e vigas baldrame 15×30 cm. Confirmar com sondagem e projeto.");
      g.Lb = r2(g.P + g.Li);
      return { g: g, premissas: prem };
    },

    /* Grandezas do telhado a partir da geometria e das respostas da etapa:
       inclinacao em % (cob.inclinacao) e beiral em m (cob.beiral).
       Devolve { i, fi, fb, Acob, Lmenor, Lcumeeira, Lcalha, Hdesc } — mesma ordem de
       operações do orçamento paramétrico antigo (At = Ap × 1,15 × fi). */
    cobertura: function (g, p, inclinacaoPct, beiral) {
      var i = inclinacaoPct / 100;
      var fi = Math.sqrt(1 + i * i);
      var fb = 1 + 0.30 * beiral;
      return {
        i: i, fi: fi, fb: fb,
        Acob: g.Ap * fb * fi,
        Lmenor: Math.sqrt(g.Ap / 1.5),
        Lcumeeira: g.Lmaior,
        Lcalha: 2 * g.Lmaior,
        Hdesc: g.h * p.pavimentos + 0.5
      };
    },

    /* As quatro escolhas que o orçamento paramétrico antigo recebia na entrada,
       no formato de RESPOSTA do catálogo (id da pergunta → valor). No modo
       legado elas são respostas explícitas; no manual, quem responde é a pessoa
       e o resto vem do padrão de cada pergunta. */
    respostasLegado: function (p) {
      return { "cob.tipo": p.cobertura, "forro.tipo": p.forro, "piso.tipo": p.piso, "esgoto.tipo": p.esgoto };
    },

    /* Contexto PLANO que o avaliador de fórmulas enxerga (nomes com ponto
       são nomes inteiros). Respostas das perguntas entram por cima, pelo id. */
    contexto: function (p, g) {
      var c = {};
      c.area = p.area; c.pav = p.pavimentos; c.h = g.h;
      c.padrao = p.padrao; c.tipo = p.tipo; c.quartos = p.quartos; c.banheiros = p.banheiros;
      ["Ap", "P", "Li", "Lmaior", "Autil", "Aj", "Nj", "Npi", "Npe", "Avaos", "Npil", "sap", "Lb"].forEach(function (k) { c[k] = g[k]; });
      return c;
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MorGeometria;
  global.MorGeometria = MorGeometria;
})(typeof window !== "undefined" ? window : globalThis);

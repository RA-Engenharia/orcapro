/* =====================================================================
 * padraodet.js — PADRÃO DE DETALHAMENTO TÉCNICO (07/10/2026)
 *
 * Pedido do Rogério: "esse detalhamento, estilo de vista, tem que ser
 * replicado para dentro do nosso sistema; o sistema tem que ser capaz de ter
 * essas configurações também". O padrão é o de escritório de projeto
 * estrutural (prancha de armação estilo TQS + NBR 7191 / 8403 / 16752):
 * barra em linha grossa sobre contorno fino, notação "3 N1 Ø12.5 C=486",
 * cotas em cm com traço oblíquo, preto e branco por espessura de pena.
 *
 * MOTOR PURO (Node-testável, sem DOM): o padrão embutido, a normalização, a
 * pena e o traço de cada layer, a notação das barras, a massa por bitola e o
 * resumo do aço, a conversão para o estilo das vistas 2D (js/desenho2d.js),
 * importação/exportação do JSON e uma amostra em SVG para a tela de
 * configuração. A gravação (prefs da empresa) é a fiação fina do fim.
 *
 * ⚠ O PADRÃO EMBUTIDO É SÓ TÉCNICO: nada de nome de cliente, de pessoa ou de
 *   registro profissional (regra de js/ e test-cliente-nao-vaza). Ele é gerado
 *   do padrao_detalhamento_ra.json da RA pelos campos técnicos; a empresa
 *   pode importar o próprio JSON ou editar na tela "Padrão de detalhamento".
 * Teste: node tools/test-padraodet.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var PADRAO_RA = {
   "versao": "1.1",
   "principios": [
    "Dois jogos de pranchas separados: FÔRMA (carpintaria) e ARMAÇÃO (armador). Não misturar fôrma e armação na mesma prancha.",
    "Preto e branco na plotagem: a hierarquia vem SÓ da espessura e do tipo de linha (cor na tela = pena no CTB).",
    "Na armação, a barra é linha GROSSA e o contorno do concreto é linha FINA, sem cotas de fôrma.",
    "Barras longitudinais transladadas para fora da viga (acima as superiores, abaixo as inferiores), cada uma com as dobras cotadas e a notação.",
    "Cortes da seção (A, B, C...) com as barras em posição e o estribo desenhado à parte, com as medidas internas.",
    "Cotas em centímetros; níveis em metros.",
    "Numeração das posições (N1, N2...) em ordem crescente de bitola dentro da prancha; barra igual em peças diferentes leva o mesmo número.",
    "Cada desenho com título sublinhado + escala embaixo; desenhos alinhados em faixas, sem sobreposição, com respiro mínimo de 15 mm.",
    "Tabela de aço por elemento e Resumo do aço (bitola × comprimento × peso, +10%) na coluna da direita, acima do carimbo.",
    "Notas gerais em toda prancha de armação (concreto, CAA, cobrimentos, aço, normas, dobramentos, espaçadores, emendas)."
   ],
   "penas_mm": [
    0.09,
    0.13,
    0.18,
    0.25,
    0.35,
    0.5,
    0.7
   ],
   "cor_pena_ctb": {
    "1": {
     "cor": "vermelho",
     "pena": 0.13,
     "uso": "cotas, eixos, chamadas"
    },
    "2": {
     "cor": "amarelo",
     "pena": 0.18,
     "uso": "contorno do concreto na armação, ocultas/projeções, textos de barra"
    },
    "3": {
     "cor": "verde",
     "pena": 0.25,
     "uso": "concreto em vista (fôrma), texto geral"
    },
    "4": {
     "cor": "ciano",
     "pena": 0.35,
     "uso": "estribos, indicação de corte, títulos"
    },
    "5": {
     "cor": "azul",
     "pena": 0.5,
     "uso": "barras longitudinais, concreto cortado (fôrma)"
    },
    "6": {
     "cor": "magenta",
     "pena": 0.7,
     "uso": "moldura, destaques muito fortes"
    },
    "7": {
     "cor": "branco/preto",
     "pena": 0.25,
     "uso": "textos e tabelas"
    },
    "8": {
     "cor": "cinza",
     "pena": 0.13,
     "mantem_cor": true,
     "uso": "contexto (arquitetura, terreno, existente)"
    },
    "9": {
     "cor": "cinza claro",
     "pena": 0.09,
     "mantem_cor": true,
     "uso": "hachuras"
    }
   },
   "layers": [
    {
     "nome": "EST-FORMA-CORTE",
     "aci": 5,
     "tipo": "Continuous",
     "uso": "concreto cortado (planta de fôrma, cortes)"
    },
    {
     "nome": "EST-FORMA-VISTA",
     "aci": 3,
     "tipo": "Continuous",
     "uso": "concreto em vista"
    },
    {
     "nome": "EST-OCULTA",
     "aci": 2,
     "tipo": "TRACEJADA",
     "uso": "arestas ocultas, projeções, vigas invertidas"
    },
    {
     "nome": "EST-ARM-CONTORNO",
     "aci": 2,
     "tipo": "Continuous",
     "uso": "contorno do concreto no desenho de armação (fino, sem cotas)"
    },
    {
     "nome": "EST-ARM-LONG",
     "aci": 5,
     "tipo": "Continuous",
     "uso": "barras longitudinais (positivas/inferiores e superiores)"
    },
    {
     "nome": "EST-ARM-NEG",
     "aci": 5,
     "tipo": "TRACEJADA",
     "uso": "armadura negativa de laje (tracejada)"
    },
    {
     "nome": "EST-ARM-ESTRIBO",
     "aci": 4,
     "tipo": "Continuous",
     "uso": "estribos (vista e desenho do estribo)"
    },
    {
     "nome": "EST-ARM-PELE",
     "aci": 4,
     "tipo": "TRACEJADA",
     "uso": "armadura de pele / costela"
    },
    {
     "nome": "EST-ARM-SECAO",
     "aci": 5,
     "tipo": "Continuous",
     "uso": "barra em seção (ponto cheio nos cortes)"
    },
    {
     "nome": "EST-ARM-TEXTO",
     "aci": 2,
     "tipo": "Continuous",
     "uso": "notação das barras"
    },
    {
     "nome": "EST-COTA",
     "aci": 1,
     "tipo": "Continuous",
     "uso": "cotas e linhas de chamada"
    },
    {
     "nome": "EST-EIXO",
     "aci": 1,
     "tipo": "TRACO-PONTO",
     "uso": "eixos e linhas de centro"
    },
    {
     "nome": "EST-CORTE-IND",
     "aci": 4,
     "tipo": "TRACO-PONTO",
     "uso": "indicação de plano de corte (setas e letras)"
    },
    {
     "nome": "EST-NIVEL",
     "aci": 2,
     "tipo": "Continuous",
     "uso": "símbolo de nível"
    },
    {
     "nome": "EST-HACHURA",
     "aci": 9,
     "tipo": "Continuous",
     "uso": "hachuras (concreto, solo, lastro, madeira)"
    },
    {
     "nome": "EST-TEXTO",
     "aci": 7,
     "tipo": "Continuous",
     "uso": "textos e notas"
    },
    {
     "nome": "EST-TITULO",
     "aci": 4,
     "tipo": "Continuous",
     "uso": "títulos dos desenhos"
    },
    {
     "nome": "EST-TABELA",
     "aci": 7,
     "tipo": "Continuous",
     "uso": "tabelas de aço e resumo"
    },
    {
     "nome": "EST-CONTEXTO",
     "aci": 8,
     "tipo": "Continuous",
     "uso": "arquitetura, terreno, existente"
    },
    {
     "nome": "EST-CARIMBO",
     "aci": 7,
     "tipo": "Continuous",
     "uso": "carimbo/legenda"
    },
    {
     "nome": "EST-LINHA-FINA",
     "aci": 2,
     "tipo": "Continuous",
     "uso": "linhas finas secundárias: balões de eixo, símbolos, setas"
    },
    {
     "nome": "EST-PREENCH",
     "aci": 254,
     "tipo": "Continuous",
     "cor_verdadeira": true,
     "uso": "preenchimentos em cor verdadeira (fundo branco de tabelas, máscaras) — o CTB não altera"
    },
    {
     "nome": "EST-LIMITE",
     "aci": 4,
     "tipo": "TRACO-PONTO",
     "uso": "limites legais e de terreno (APP, divisa, recuo, faixa non aedificandi)"
    },
    {
     "nome": "EST-VIEWPORT",
     "aci": 9,
     "tipo": "Continuous",
     "plota": false,
     "uso": "molduras de viewport (não plota)"
    }
   ],
   "tipos_de_linha": {
    "TRACEJADA": {
     "padrao_mm": [
      3.0,
      -1.5
     ],
     "nbr8403": "linha tracejada — arestas/contornos não visíveis"
    },
    "TRACO-PONTO": {
     "padrao_mm": [
      9.6,
      -1.6,
      0.0,
      -1.6
     ],
     "nbr8403": "linha traço-ponto fina — eixos; grossa — planos de corte"
    }
   },
   "textos": {
    "fonte": "Arial (alternativa aceita: romans, como no TQS/CYPE)",
    "alturas_plotadas_mm": {
     "titulo_desenho": 5.0,
     "escala_sob_titulo": 2.5,
     "nome_viga_pilar": 5.0,
     "secao_ao_lado_do_nome": 2.5,
     "notacao_barra": 2.0,
     "cota": 2.0,
     "nota": 2.0,
     "tabela": 1.8,
     "letra_corte": 3.5,
     "balao_eixo": 3.0
    },
    "titulo": "sublinhado; à esquerda, abaixo do desenho; ex.: 'V509 19/75' (nome grande + seção b/h em cm menor ao lado)"
   },
   "cotas": {
    "unidade": "cm",
    "casas": 0,
    "terminal": "traço oblíquo 45°, 1,5 mm (tick)",
    "texto": "acima da linha, alinhado",
    "extensao_alem_da_cota_mm": 1.5,
    "afastamento_da_origem_mm": 1.0,
    "cotas_por_peca": "uma total + parciais",
    "niveis": "em metros, símbolo triangular"
   },
   "notacao": {
    "barra": "{q} N{pos} Ø{bit} C={comp}",
    "barra_exemplo": "3 N1 Ø12.5 C=486",
    "estribo": "{q} N{pos} Ø{bit} C/{esp} C={comp}",
    "estribo_exemplo": "47 N9 Ø5 C/17.5 C=179",
    "estribo_trecho_na_elevacao": "{q} Ø{bit} C/{esp}  N{pos} ({comp_trecho})",
    "pele": "{q}x{n} N{pos} Ø{bit} C={comp} (costela)",
    "secao": "{q} Ø{bit} com chamada até a barra no corte",
    "regras": [
     "comprimento RETIFICADO em cm (soma das dobras)",
     "dobras cotadas no desenho da barra",
     "ganchos e dobras pela NBR 6118 (diâmetro de dobramento)",
     "posições numeradas por bitola crescente; barra igual = mesmo número",
     "estribo desenhado à parte com as medidas internas e o gancho"
    ]
   },
   "escalas": {
    "planta_forma": "1:50",
    "corte_forma": "1:50",
    "planta_locacao": "1:50",
    "viga_elevacao": "1:50 (1:25 em vãos curtos ≤ 3 m)",
    "corte_viga": "1:20 ou 1:25",
    "pilar_secao": "1:20",
    "bloco_sapata": "1:20 ou 1:25",
    "laje_armacao": "1:50",
    "estribo": "sem escala (cotado)",
    "detalhe": "1:10",
    "isometrico": "sem escala"
   },
   "hachuras": {
    "concreto_em_corte_na_forma": "ANSI31 fino (EST-HACHURA), ou cinza 20% liso",
    "concreto_na_armacao": "SEM hachura (o contorno fino basta; as barras aparecem)",
    "solo": "EARTH",
    "lastro_brita": "pontos/GRAVEL",
    "madeira": "veio (WOOD)",
    "laje_acima_do_nivel_geral": "45° para a direita, fina e espaçada",
    "laje_abaixo_do_nivel_geral": "45° para a esquerda"
   },
   "tabelas": {
    "por_elemento": [
     "ELEMENTO",
     "AÇO",
     "POS",
     "BIT (mm)",
     "QUANT",
     "COMPR. UNIT (cm)",
     "COMPR. TOTAL (cm)"
    ],
    "resumo": [
     "AÇO",
     "BIT (mm)",
     "COMPR (m)",
     "PESO (kg)",
     "PESO +10% (kg)"
    ],
    "rodape_resumo": [
     "Peso total CA-50",
     "Peso total CA-60",
     "Volume de concreto (m³)",
     "Área de fôrma (m²)"
    ],
    "massa_linear_kg_m": {
     "5.0": 0.154,
     "6.3": 0.245,
     "8.0": 0.395,
     "10.0": 0.617,
     "12.5": 0.963,
     "16.0": 1.578,
     "20.0": 2.466,
     "25.0": 3.853,
     "32.0": 6.313
    },
    "massa_fonte": "NBR 7480 (massa nominal = π·d²/4 × 7850 kg/m³)"
   },
   "prancha": {
    "formato_padrao": "A1 (594×841) horizontal; A0/A2 conforme volume",
    "margens_mm": {
     "esquerda": 20,
     "direita": 10,
     "superior": 10,
     "inferior": 10
    },
    "legenda": "canto inferior direito, largura 175–205 mm (NBR 16752 + apostila UFRJ)",
    "organizacao": [
     "desenhos alinhados em faixas horizontais, da esquerda para a direita, na ordem dos elementos",
     "cortes da viga à direita da elevação, alinhados pelo topo",
     "estribos sob o corte correspondente",
     "tabela de aço + resumo na coluna direita, acima da legenda; notas gerais acima das tabelas",
     "respiro mínimo de 15 mm entre desenhos; nada encostando na moldura",
     "títulos alinhados entre si na mesma faixa"
    ],
    "jogos": {
     "forma": [
      "planta de locação",
      "planta de fôrma",
      "cortes de fôrma",
      "detalhes de fôrma"
     ],
     "armacao": [
      "vigas (elevação + cortes + estribos)",
      "pilares/pilaretes",
      "blocos/sapatas",
      "lajes",
      "tabelas e resumo"
     ]
    }
   },
   "conteudo_minimo": {
    "planta_forma": [
     "locação dos pilares/pilaretes",
     "numeração de pilares, vigas, lajes",
     "seções b×h",
     "distâncias face a face",
     "espessura e nível das lajes",
     "furos, aberturas, rebaixos",
     "planos de corte"
    ],
    "viga": [
     "elevação 1:50 com apoios e nomes dos apoios",
     "barras transladadas com notação e dobras",
     "trechos de estribos com quantidade/espaçamento",
     "indicação dos cortes",
     "cortes com barras e chamadas",
     "estribo desenhado e cotado",
     "pele/costela quando houver"
    ],
    "bloco_estaca": [
     "planta e corte 1:20/1:25",
     "arranque do pilar",
     "armadura do bloco (estribos horizontais, gaiola)",
     "embutimento e arrasamento da estaca",
     "cotas e níveis"
    ],
    "pilar_pilarete": [
     "seção 1:20 com barras e estribos",
     "arranque/emenda",
     "estribo cotado",
     "chumbadores/insertos quando houver"
    ],
    "laje": [
     "positivas contínuas, negativas tracejadas",
     "notação paralela à barra",
     "espaçamentos"
    ]
   },
   "notas_gerais_padrao": [
    "Concreto: fck ≥ {fck} MPa; a/c ≤ {ac}; classe de agressividade {caa}.",
    "Cobrimento nominal: {cobrimentos} (NBR 6118, Tab. 7.2); elementos em contato com o solo conforme a mesma tabela.",
    "Aço CA-50 e CA-60 (NBR 7480).",
    "Cotas em centímetros; níveis em metros.",
    "Dobramentos, ganchos, ancoragens e emendas conforme NBR 6118.",
    "Usar espaçadores plásticos ou de argamassa que garantam o cobrimento.",
    "Comprimentos retificados; conferir as medidas na obra antes do corte.",
    "Não emendar barras fora das posições indicadas sem consulta ao projetista."
   ],
   "checklist_conferencia": [
    "toda barra tem notação completa (q, N, Ø, C)",
    "toda posição aparece na tabela e a tabela fecha com o desenho",
    "resumo do aço confere com a soma da tabela",
    "cortes indicados na elevação existem desenhados",
    "nenhum texto sobre linha ou sobre outro texto",
    "escalas declaradas = escalas reais das viewports",
    "penas por layer conforme este padrão (CTB RA_Estrutural)",
    "notas gerais preenchidas (fck, CAA, cobrimentos)",
    "carimbo completo (RA Engenharia, RT, ART, revisão)"
   ]
  };

  var CAMPOS = ["versao", "principios", "penas_mm", "cor_pena_ctb", "layers", "tipos_de_linha", "textos", "cotas", "notacao", "escalas", "hachuras", "tabelas", "prancha", "conteudo_minimo", "notas_gerais_padrao", "checklist_conferencia"];
  var UNIDADES = { cm: 1, m: 1, mm: 1 };
  var CHAVE = "padraoDetalhamento";

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, d) { var n = +v; return isFinite(n) ? n : d; }
  function limita(v, a, b, d) { var n = num(v, d); return Math.max(a, Math.min(b, n)); }

  function padraoRA() { return clone(PADRAO_RA); }

  /* padrão salvo ou importado → completo e válido. Campo que falta vem do
     Padrão RA; pena fora de 0,05–2 mm e texto fora de 1–10 mm voltam ao valor
     do Padrão RA (um número digitado errado não pode apagar a linha da folha) */
  function normPadrao(p) {
    var base = padraoRA(), o = {};
    CAMPOS.forEach(function (k) { o[k] = (p && p[k] != null && typeof p[k] === typeof base[k]) ? clone(p[k]) : base[k]; });
    Object.keys(base.cor_pena_ctb).forEach(function (aci) {
      var b = base.cor_pena_ctb[aci], c = o.cor_pena_ctb[aci];
      if (!c || typeof c !== "object") { o.cor_pena_ctb[aci] = clone(b); return; }
      var pe = num(c.pena, NaN);
      c.pena = (pe >= 0.05 && pe <= 2) ? Math.round(pe * 100) / 100 : b.pena;
    });
    var al = o.textos && o.textos.alturas_plotadas_mm, alb = base.textos.alturas_plotadas_mm;
    if (!al || typeof al !== "object") o.textos.alturas_plotadas_mm = al = clone(alb);
    Object.keys(alb).forEach(function (k) { var v = num(al[k], NaN); al[k] = (v >= 1 && v <= 10) ? v : alb[k]; });
    if (!UNIDADES[o.cotas.unidade]) o.cotas.unidade = base.cotas.unidade;
    o.cotas.casas = Math.round(limita(o.cotas.casas, 0, 3, base.cotas.casas));
    ["barra", "estribo"].forEach(function (k) { if (typeof o.notacao[k] !== "string" || o.notacao[k].indexOf("{") < 0) o.notacao[k] = base.notacao[k]; });
    if (!o.layers || !o.layers.length) o.layers = base.layers;
    return o;
  }

  /* JSON da empresa (ou o padrao_detalhamento_ra.json inteiro, com decisão,
     referências e histórico) → só os campos técnicos, normalizados */
  function importarJSON(texto) {
    var d = typeof texto === "string" ? JSON.parse(texto) : texto;
    if (!d || typeof d !== "object" || !d.layers || !d.cor_pena_ctb) throw new Error("O arquivo não é um padrão de detalhamento (faltam layers e penas).");
    return normPadrao(d);
  }
  function exportarJSON(p) { return JSON.stringify(normPadrao(p), null, 1); }

  /* ----------------------------------------------------------- layers */
  function layerDe(p, nome) {
    var ls = (p && p.layers) || PADRAO_RA.layers;
    for (var i = 0; i < ls.length; i++) if (ls[i].nome === nome) return ls[i];
    return null;
  }
  /* traço do layer: espessura de pena (mm de papel), tracejado SVG e cor da tela */
  function linhaDe(p, nome) {
    var P = normPadrao(p), l = layerDe(P, nome);
    if (!l) return null;
    var cp = P.cor_pena_ctb[String(l.aci)] || {}, tl = P.tipos_de_linha[l.tipo];
    var dash = tl ? tl.padrao_mm.map(function (v) { return v === 0 ? 0.4 : Math.abs(v); }).join(" ") : null;
    return { layer: l.nome, aci: l.aci, mm: num(cp.pena, 0.25), dash: dash, cor: cp.cor || "", plota: l.plota !== false };
  }

  /* ----------------------------------------------------------- notação */
  /* 12.5 → "12.5", 10 → "10", 6.3 → "6.3" (ponto, como na notação de armadura) */
  function fmtBit(v) { var n = Math.round(num(v, 0) * 10) / 10; return n % 1 ? n.toFixed(1) : String(n); }
  function fmtBitola(bit) { return "Ø" + fmtBit(bit); }
  function preencher(fmt, d) { return String(fmt).replace(/\{(\w+)\}/g, function (_, k) { return d[k] == null ? "" : String(d[k]); }); }
  function fmtBarra(p, b) {
    var n = normPadrao(p).notacao;
    return preencher(n.barra, { q: b.q, pos: b.pos, bit: fmtBit(b.bit), comp: Math.round(num(b.comp, 0)) });
  }
  function fmtEstribo(p, b) {
    var n = normPadrao(p).notacao;
    return preencher(n.estribo, { q: b.q, pos: b.pos, bit: fmtBit(b.bit), esp: fmtBit(b.esp), comp: Math.round(num(b.comp, 0)) });
  }

  /* ----------------------------------------------------------- aço */
  /* massa nominal (kg/m) da tabela do padrão; bitola fora dela: π·d²/4 × 7850 */
  function massaLinear(p, bit) {
    var t = normPadrao(p).tabelas.massa_linear_kg_m, b = num(bit, 0);
    var ks = Object.keys(t);
    for (var i = 0; i < ks.length; i++) if (Math.abs(+ks[i] - b) < 1e-6) return +t[ks[i]];
    return Math.round(Math.PI * Math.pow(b / 1000, 2) / 4 * 7850 * 1000) / 1000;
  }
  /* barras [{aco, bit, q, comp (cm)}] → resumo por aço e bitola: comprimento (m), peso, peso + perda */
  function resumoAco(p, barras, perda) {
    var pr = perda == null ? 0.10 : num(perda, 0.10), mapa = {}, linhas = [], tot = {};
    (barras || []).forEach(function (b) {
      var aco = b.aco || "CA-50", bit = num(b.bit, 0), k = aco + "|" + bit;
      var m = mapa[k] || (mapa[k] = { aco: aco, bit: bit, compr_m: 0 });
      m.compr_m += num(b.q, 0) * num(b.comp, 0) / 100;
    });
    Object.keys(mapa).forEach(function (k) {
      var m = mapa[k];
      m.compr_m = Math.round(m.compr_m * 100) / 100;
      m.peso_kg = Math.round(m.compr_m * massaLinear(p, m.bit) * 10) / 10;
      m.peso_perda_kg = Math.round(m.peso_kg * (1 + pr) * 10) / 10;
      tot[m.aco] = Math.round(((tot[m.aco] || 0) + m.peso_perda_kg) * 10) / 10;
      linhas.push(m);
    });
    linhas.sort(function (a, b) { return a.aco < b.aco ? -1 : a.aco > b.aco ? 1 : a.bit - b.bit; });
    return { linhas: linhas, totais_com_perda: tot, perda: pr };
  }

  /* ----------------------------------------------------------- vistas 2D */
  /* padrão → estilo de vista do js/desenho2d.js (cota, unidade, texto, escala) */
  function estilo2D(p) {
    var P = normPadrao(p), esc = parseInt(String(P.escalas.planta_forma).split(":")[1], 10);
    var marca = /obl[ií]quo|tick/i.test(String(P.cotas.terminal)) ? "obliquo" : (/seta/i.test(String(P.cotas.terminal)) ? "seta" : "ponto");
    return { escala: esc > 0 ? esc : 50, pena: "media", preenchimento: "hachura", cotas: true, cotaParcial: true, marcaCota: marca,
             textoCota: P.textos.alturas_plotadas_mm.cota, unidade: P.cotas.unidade, casas: P.cotas.casas, niveis: true, marcasCorte: true, titulo: true };
  }

  /* ----------------------------------------------------------- amostra */
  /* viga de amostra (elevação + corte) desenhada COM o padrão, em mm de papel —
     é o que a tela de configuração mostra para a pessoa ver o efeito da mudança */
  function amostraSVG(p) {
    var P = normPadrao(p), at = P.textos.alturas_plotadas_mm;
    function tr(nome, extra) {
      var l = linhaDe(P, nome) || { mm: 0.25, dash: null };
      return ' stroke="#111" fill="none" stroke-width="' + l.mm + '"' + (l.dash ? ' stroke-dasharray="' + l.dash + '"' : "") + (extra || "");
    }
    function tx(x, y, t, h, anc, peso) {
      return '<text x="' + x + '" y="' + y + '" font-family="Arial" font-size="' + h + '" text-anchor="' + (anc || "start") + '"' + (peso ? ' font-weight="bold"' : "") + ">" + esc(t) + "</text>";
    }
    var s = [];
    s.push('<line x1="4" y1="34" x2="126" y2="34"' + tr("EST-EIXO") + "/>");
    s.push('<rect x="10" y="26" width="110" height="16"' + tr("EST-ARM-CONTORNO") + "/>");
    s.push('<polyline points="12,12 12,8 118,8 118,12"' + tr("EST-ARM-LONG") + "/>");
    s.push(tx(65, 6, fmtBarra(P, { q: 2, pos: 1, bit: 10, comp: 486 }), at.notacao_barra, "middle"));
    s.push('<polyline points="12,52 12,56 118,56 118,52"' + tr("EST-ARM-LONG") + "/>");
    s.push(tx(65, 61.5, fmtBarra(P, { q: 3, pos: 2, bit: 12.5, comp: 494 }), at.notacao_barra, "middle"));
    for (var x = 16; x <= 114; x += 7) s.push('<line x1="' + x + '" y1="27.5" x2="' + x + '" y2="40.5"' + tr("EST-ARM-ESTRIBO") + "/>");
    s.push(tx(65, 23.5, fmtEstribo(P, { q: 15, pos: 3, bit: 5, esp: 15, comp: 120 }), at.notacao_barra, "middle"));
    s.push('<line x1="10" y1="47" x2="120" y2="47"' + tr("EST-COTA") + "/>");
    s.push('<line x1="9" y1="48" x2="11" y2="46"' + tr("EST-COTA") + "/><line x1=\"119\" y1=\"48\" x2=\"121\" y2=\"46\"" + tr("EST-COTA") + "/>");
    s.push(tx(65, 46.2, P.cotas.unidade === "cm" ? "220" : (P.cotas.unidade === "mm" ? "2200" : "2,20"), at.cota, "middle"));
    s.push('<rect x="138" y="22" width="16" height="24"' + tr("EST-ARM-CONTORNO") + "/>");
    s.push('<rect x="140.5" y="24.5" width="11" height="19"' + tr("EST-ARM-ESTRIBO") + "/>");
    [[142, 26], [150, 26], [142, 42], [146, 42], [150, 42]].forEach(function (q) { s.push('<circle cx="' + q[0] + '" cy="' + q[1] + '" r="0.9" fill="#111"/>'); });
    s.push(tx(146, 52, "CORTE A", at.letra_corte * 0.8, "middle", true));
    s.push(tx(4, 72, "V1  20/50", at.nome_viga_pilar, "start", true));
    s.push('<line x1="4" y1="73.5" x2="40" y2="73.5" stroke="#111" stroke-width="0.35"/>');
    s.push(tx(4, 77.5, "ESC 1:" + (estilo2D(P).escala), at.escala_sob_titulo));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 165 80" width="100%" style="background:#fff">' + s.join("") + "</svg>";
  }
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ----------------------------------------------------------- gravação (fiação fina) */
  /* prefs da empresa, com carimbo de data: no merge com a nuvem o aparelho local vence campo a
     campo (js/nuvem.js), então o objeto vai inteiro sob uma chave só, com "em" para saber o mais novo */
  function ler(eid) {
    var S = global.Store;
    if (!S || !S.lerPrefs) return padraoRA();
    var pr = S.lerPrefs(eid) || {}, x = pr[CHAVE];
    return x && x.padrao ? normPadrao(x.padrao) : padraoRA();
  }
  function salvar(eid, p) {
    var S = global.Store;
    if (!S || !S.lerPrefs || !S.salvarPrefs) return false;
    var pr = S.lerPrefs(eid) || {};
    pr[CHAVE] = { padrao: normPadrao(p), em: Date.now() };
    S.salvarPrefs(eid, pr);
    return true;
  }
  function personalizado(eid) {
    var S = global.Store;
    if (!S || !S.lerPrefs) return false;
    var x = (S.lerPrefs(eid) || {})[CHAVE];
    return !!(x && x.padrao);
  }

  var PadraoDet = {
    CHAVE: CHAVE, CAMPOS: CAMPOS,
    padraoRA: padraoRA, normPadrao: normPadrao, importarJSON: importarJSON, exportarJSON: exportarJSON,
    layerDe: layerDe, linhaDe: linhaDe,
    fmtBitola: fmtBitola, fmtBarra: fmtBarra, fmtEstribo: fmtEstribo,
    massaLinear: massaLinear, resumoAco: resumoAco, estilo2D: estilo2D, amostraSVG: amostraSVG,
    ler: ler, salvar: salvar, personalizado: personalizado
  };
  global.PadraoDet = PadraoDet;
  if (typeof module !== "undefined" && module.exports) module.exports = PadraoDet;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

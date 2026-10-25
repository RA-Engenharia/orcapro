/* =====================================================================
 * familiasluz.js — FAMÍLIAS DE ILUMINAÇÃO RA com a fotometria do catálogo
 * (frente I2 da maquete viva, 21/10/2026)
 *
 * Pedido do Rogério: passear no projeto à noite com as luminárias acesas.
 * Inserir uma família daqui já dá a LUZ configurada (lm, K, abertura,
 * potência) para o render físico, a luz assada e o render ao vivo.
 *
 * DE ONDE VÊM OS NÚMEROS: só do catálogo I1 (data/iluminacao-catalogo.json,
 * docs/render-vivo/catalogo-iluminacao.md), produto a produto, com o link da
 * página. O tools/test-familias-luz.js confere que todo número de tipo é o
 * do catálogo. Campo sem dado no catálogo fica PENDENTE (valor 0 + o texto
 * em "Pendente"): a família desenha, mas não acende com fluxo inventado.
 * Luminária SEM lâmpada (soquete E27/E14/G9/GU10) leva a lâmpada do catálogo
 * escolhida no tipo — a lâmpada é que tem lm e K.
 *
 * A GEOMETRIA É NOSSA, paramétrica (js/mobgeo.js), com as cotas do catálogo.
 * Nenhum arquivo 3D nem .ies de fabricante é usado ou redistribuído. Medida
 * que o catálogo não publica (canopla, moldura do difusor, motor do
 * ventilador) é modelagem e está dita assim na descrição do parâmetro.
 *
 * CONTRATO COM A LIGAÇÃO ELÉTRICA (docs/eletrica/CONTRATO-ILUMINACAO.md, frente EL):
 *  · mep.peca = "luminaria" (o quantitativo do js/biminst.js e o motor da ligação);
 *  · conector "el" (sistema eletrica) na CANOPLA, no teto — na arandela, na parede;
 *    na fita, no ponto do driver (a ponta x = 0);
 *  · instância: Comando (quem acende junto), Circuito (legado, mesmo valor),
 *    Circuito_quadro (informativo), Altura_montagem; tipo: Potencia_W.
 *
 * AS EMISSÕES (o que vira luz — FamiliasLuz.luzes), nas grandezas do js/rendermat.js:
 *  · painel: retângulo/disco lambertiano de uma face, L = Φ / (π·A); rotX = −90°
 *    emite para baixo, +90° para cima, 0° para o lado (a fita de sanca);
 *  · spot: cone com o ângulo de facho do catálogo, I = Φ / Ω; `dir` aponta o facho
 *    (spot dirigível);
 *  · ponto: lâmpada que ilumina para todo lado, I = Φ / 4π (lustre, pendente,
 *    arandela, ventilador). Fica FORA de qualquer sólido opaco da família (o
 *    raio de sombra da luz assada bateria nele); bulbo e cristal são de material
 *    transparente, que a luz atravessa.
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var FM = dep("FamiliasMob", "familiasmob.js");
  var RAD = Math.PI / 180;
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* ------------------------------------------------ O CATÁLOGO (cópia dos números do data/iluminacao-catalogo.json 1.1.0)
     id → { W, lm, K:[…], ab, mm:{…}, link }. W e lm da fita são POR METRO. null = o catálogo não publica. */
  var TB = "https://www.taschibra.com.br/pt_BR/produto/", ST = "https://stella.com.br/";
  var CAT = {
    "pl-tb-lux18-red-sob": { W: 18, lm: 1260, K: [3000, 4000, 6500], ab: 120, mm: { d: 210, h: 26 }, link: TB + "teto/painelplafon-sobrepor-led/painel-led-18w-lux-redondo-sobrepor-3000k/18129" },
    "pl-tb-lux18-qua-sob": { W: 18, lm: 1260, K: [3000, 6500], ab: 120, mm: { l: 210, h: 25 }, link: TB + "teto/painelplafon-sobrepor-led/painel-led-18w-lux-quadrado-sobrepor-3000k/18137" },
    "pa-tb-lux18-red-emb": { W: 18, lm: 1260, K: [3000, 4000, 6500], ab: 120, mm: { d: 220, h: 15, nicho: 205 }, link: TB + "teto/painelplafon-embutir-led/painel-led-18w-lux-redondo-embutir-3000k/18111" },
    "pa-tb-lux18-qua-emb": { W: 18, lm: 1260, K: [3000, 4000, 6500], ab: 120, mm: { l: 216, h: 15, nicho: 205 }, link: TB + "teto/painelplafon-embutir-led/painel-led-18w-lux-quadrado-embutir-3000k/18121" },
    "pl-st-eco18-sob": { W: 18, lm: 1500, K: [3000, 4000], ab: 120, mm: { ies_l: 190, ies_h: 30 }, link: ST + "produto/plafon-sobrepor-eco-18w" },
    "pa-st-eco18-emb": { W: 18, lm: 1500, K: [3000, 4000], ab: 120, mm: { ies_l: 202, ies_h: 3 }, link: ST + "produtos/detalhes/painel-de-embutir-eco-143" },
    "sp-tb-alltop-mr16": { W: 5, lm: 400, K: [3000, 6500], ab: 38, mm: { l: 90, h: 27, nicho: 72 }, link: TB + "teto/spot-embutir-led/spot-embutir-quadrado-alltop-led-mr16-5w-3000k-38o-br/18356" },
    "sp-tb-conecta-mr16": { W: 15, lm: null, K: null, ab: null, mm: { l: 102, h: 36, nicho: 95 }, link: TB + "teto/spot-embutir-slamp/spot-embutir-conecta-quadrado-recuado-br-mr16/12321" },
    "sp-tb-conecta-ar70": { W: 20, lm: null, K: null, ab: null, mm: { l: 130, h: 36, nicho: 120 }, link: TB + "teto/spot-embutir-slamp/spot-embutir-conecta-quadrado-recuado-br-ar70/12324" },
    "sp-tb-conecta-ar111": { W: 20, lm: null, K: null, ab: null, mm: { l: 170, h: 36, nicho: 160 }, link: TB + "teto/spot-embutir-slamp/spot-embutir-conecta-quadrado-recuado-br-ar111/12333" },
    "lp-tb-mr16-tdl25-4w": { W: 4, lm: 250, K: [2700], ab: 38, mm: { d: 50, h: 54 }, link: TB + "lampadas/led-foco/lampada-led-mr16-tdl-25-4w-380-2700k/19075" },
    "lp-tb-ar70-24-48w": { W: 4.8, lm: 300, K: [4000], ab: 24, mm: { d: 70, h: 71 }, link: TB + "lampadas/led-foco/lampada-led-ar70-24o-autovolt-4000k-gu10/18971" },
    "lp-tb-ar111-24-12w": { W: 12, lm: 720, K: [2700], ab: 24, mm: { d: 111, h: 76 }, link: TB + "lampadas/led-foco/lampada-led-ar111-24o-12w-2700k-gu10/17733" },
    "lp-tb-tkl60-9w-3000k": { W: 9, lm: 803, K: [3000], ab: null, mm: { d: 60, h: 110 }, link: TB + "lampadas/led-bulbo/lampada-led-tkl-60-9w-3000k/16556" },
    "lp-tb-tkl40-7w-3000k": { W: 7, lm: 560, K: [3000], ab: null, mm: { d: 60, h: 110 }, link: TB + "lampadas/led-bulbo/lampada-led-tkl-40-7w-3000k/15193" },
    "lp-tb-tvl25-3w-2700k-e14": { W: 3, lm: 210, K: [2700], ab: 180, mm: { d: 35, h: 123 }, link: TB + "lampadas/led-bulbo/lampada-led-vela-bico-torcido-tvl-25-3w-2700k-e14/17726" },
    "lp-tb-g9-3w-3000k": { W: 3, lm: 200, K: [3000], ab: 300, mm: { d: 16.2, h: 53 }, link: TB + "lampadas/led-g9/lampada-led-bipino-g9-25-3w-3000k/16869" },
    "tr-st-trace-spot5": { W: 5, lm: 500, K: [3000], ab: 34, mm: { d: 40, h: 102 }, link: ST + "produtos/detalhes/trace-332" },
    "tr-tb-direct-mr16": { W: 6, lm: 450, K: [3000, 6500], ab: 38, mm: { c: 114, l: 59, h: 94 }, link: TB + "perfiltrilho/trilho/spot-led-trilho-direct-mr16-6w-3000k-branco/18461" },
    "pe-tb-td1003-cupula": { W: 60, lm: null, K: null, ab: null, mm: { d: 140, h: 330, cabo: 900 }, link: TB + "teto/pendente-slamp/luminaria-pendente-taschibra-td-1003-e-27-branco-fosco/15342" },
    "pe-tb-factory-m": { W: 60, lm: null, K: null, ab: null, mm: { d: 375, h: 335, cabo: 1400 }, link: TB + "teto/pendente-slamp/pendente-taschibra-factory-m-branca/18372" },
    "pe-st-plane60": { W: 16, lm: 1800, K: [3000, 4000, 5000], ab: 140, mm: { ies_l: 66, ies_c: 591, ies_h: 28 }, link: ST + "produtos/detalhes/plane-379" },
    "pe-tb-jabuticaba": { W: 100, lm: null, K: null, ab: null, mm: { c: 570, l: 250, h: 250, cabo: 900 }, link: TB + "teto/pendente-slamp/pendente-taschibra-jabuticaba-4xg9/18873" },
    "ar-tb-ray10": { W: 10, lm: null, K: [2700], ab: null, mm: { c: 95, l: 58, h: 180 }, link: TB + "parede/arandela-led/arandela-taschibra-ray-led-10w-2700k-branca/18147" },
    "ar-tb-quadre": { W: 4, lm: 280, K: [3000, 6500], ab: null, mm: { c: 86, l: 30, h: 122 }, link: TB + "parede/arandela-led/arandela-led-quadre-3000k-branco/18792" },
    "lu-tb-glam6": { W: 240, lm: null, K: null, ab: null, mm: { d: 580, h: 540, cabo: 500 }, link: TB + "teto/lustre-slamp/lustre-de-cristal-taschibra-glam-transparente-6xe14/18879" },
    "lu-tb-imperio400": { W: 240, lm: null, K: null, ab: null, mm: { d: 400, h: 650, cabo: 1200 }, link: TB + "teto/pendente-slamp/pendente-taschibra-imperio-400-cristal-transparente-6xe14/18895" },
    "lu-tb-equilibrium6": { W: 240, lm: null, K: null, ab: null, mm: { d: 420, h: 230, cabo: 1100 }, link: TB + "teto/pendente-slamp/pendente-taschibra-equilibrium-6xe27-preta/14320" },
    "fi-st-full19": { W: 19, lm: 2100, K: [2700, 3000, 4000], ab: null, mm: {}, link: ST + "produtos/detalhes/fita-full-led-24v-pro-176" },
    "fi-st-alllight14": { W: 14, lm: 900, K: [4000], ab: null, mm: {}, link: ST + "produtos/detalhes/fita-all-light-24v-pro-387" },
    "vt-ventisol-windlight": { W: 130, lm: null, K: null, ab: null, mm: { d: 960 }, link: "https://www.telhanorte.com.br/ventilador-de-teto-110v-com-3-pas-wind-light-preto-e-mogno-ventisol-1207105/p" },
    "vt-spirit-led": { W: 135, lm: 800, K: [6500], ab: null, mm: {}, link: "https://www.telhanorte.com.br/ventilador-de-teto-led-repelente-com-controle-3-pas-127v-135w-branco-spirit-1592351/p" },
    "vt-arno-ultimate": { W: 150, lm: null, K: null, ab: null, mm: { d: 1200 }, link: "https://www.buscape.com.br/ventilador-circulador/ventilador-de-teto-arno-ultimate-3-pas" }
  };
  /* o link de cada produto é o do JSON: o teste confere (aqui fica só para a tela, "Fonte" do tipo) */

  /* ------------------------------------------------ PARÂMETROS */
  function P(nome, tipoDado, valor, grupo, descricao, escopo) {
    var o = { nome: nome, tipoDado: tipoDado, escopo: escopo || "tipo", valor: valor, grupo: grupo || "Dimensões" };
    if (descricao) o.descricao = descricao;
    return o;
  }
  function F(nome, tipoDado, formula, grupo, descricao) { var o = { nome: nome, tipoDado: tipoDado, escopo: "tipo", formula: formula, grupo: grupo }; if (descricao) o.descricao = descricao; return o; }
  var MODEL = "Modelagem (o catálogo não publica esta cota): confira na peça comprada.";
  /* os parâmetros de TODA família de iluminação (contrato da ligação + fotometria) */
  function comuns(kind, op) {
    op = op || {};
    var l = [
      P("Emissor", "texto", kind, "Fotometria", "Como a família vira luz (não mudar): " + kind),
      P("Produto", "texto", "", "Fotometria", "Id do produto no catálogo de iluminação da RA (data/iluminacao-catalogo.json)"),
      P("Fonte", "texto", "", "Fotometria", "Página do fabricante de onde saíram os números deste tipo"),
      P("Pendente", "texto", "", "Fotometria", "O que o catálogo não publica e falta para a luz (vazio = completo)"),
      P("Temperatura_K", "numero", 3000, "Fotometria", "Temperatura de cor (K) do catálogo"),
      P("Angulo_facho", "angulo", 120, "Fotometria", "Abertura do facho (graus) do catálogo"),
      P("Tipo_luz", "texto", op.tipoLuz || "painel", "Fotometria", "painel (face que acende), spot (facho) ou pendente (lâmpada para todo lado)"),
      P("Modelo", "texto", op.modelo || kind, "Elétrica", "Descrição curta para o quantitativo"),
      P("Instalacao", "texto", op.instalacao || "sobrepor", "Elétrica", "embutir, sobrepor, pendente, parede ou trilho"),
      P("Altura_montagem", "comprimento", op.altura == null ? 2.60 : op.altura, "Restrições", op.alturaDesc || "Do piso à face de baixo do forro ou da laje (o teto onde a peça é fixada)", "instancia"),
      P("Comando", "texto", "", "Elétrica", "Comando (quem acende junto): o interruptor que a liga. Vazio = um comando por ambiente.", "instancia"),
      P("Circuito", "texto", "", "Elétrica", "Legado: o mesmo valor do Comando", "instancia"),
      P("Circuito_quadro", "texto", "", "Elétrica", "Circuito de proteção no quadro (ex.: C1) — informativo", "instancia")
    ];
    if (op.comLampada) {
      l.push(P("Lampada", "texto", "", "Fotometria", "Lâmpada do catálogo (a luminária sem lâmpada não publica lm)"));
      l.push(P("Lampadas", "inteiro", 1, "Fotometria", "Quantidade de soquetes/lâmpadas (catálogo)"));
      l.push(P("Fluxo_lampada_lm", "numero", 0, "Fotometria", "Fluxo de cada lâmpada (lm) do catálogo; 0 = pendente"));
      l.push(P("Potencia_lampada_W", "numero", 0, "Fotometria", "Potência de cada lâmpada (W) do catálogo"));
      l.push(F("Fluxo_lm", "numero", "Lampadas * Fluxo_lampada_lm", "Fotometria", "Fluxo total (lm) = lâmpadas × fluxo de cada"));
      l.push(F("Potencia_W", "numero", "Lampadas * Potencia_lampada_W", "Elétrica", "Potência instalada (W) = lâmpadas × potência de cada"));
    } else if (op.porMetro) {
      l.push(P("Fluxo_lm_m", "numero", 0, "Fotometria", "Fluxo por metro (lm/m) do catálogo"));
      l.push(P("Potencia_W_m", "numero", 0, "Elétrica", "Potência por metro (W/m) do catálogo"));
      l.push(F("Fluxo_lm", "numero", "Fluxo_lm_m * Comprimento", "Fotometria", "Fluxo total (lm) = lm/m × comprimento"));
      l.push(F("Potencia_W", "numero", "Potencia_W_m * Comprimento", "Elétrica", "Potência instalada (W) = W/m × comprimento"));
    } else {
      l.push(P("Fluxo_lm", "numero", 0, "Fotometria", "Fluxo luminoso (lm) do catálogo; 0 = pendente"));
      l.push(P("Potencia_W", "numero", 0, "Elétrica", "Potência (W) do catálogo"));
    }
    return l;
  }
  /* um tipo a partir do produto do catálogo (os números saem do CAT, nunca digitados duas vezes) */
  function tipoDe(id, nome, prodId, K, extra, lampId, nLamp) {
    var p = CAT[prodId], v = { Produto: prodId, Fonte: p.link };
    var pend = [];
    if (lampId) {
      var lp = CAT[lampId];
      v.Lampada = lampId; v.Lampadas = nLamp || 1; v.Fluxo_lampada_lm = lp.lm; v.Potencia_lampada_W = lp.W; v.Temperatura_K = lp.K[0];
      if (lp.ab) v.Angulo_facho = lp.ab;
      v.Fonte = p.link + " | lâmpada: " + lp.link;
    } else if (nLamp != null) {
      v.Lampada = ""; v.Lampadas = nLamp; v.Fluxo_lampada_lm = 0; v.Potencia_lampada_W = 0; pend.push("lâmpada (o catálogo não diz o soquete)");
    } else {
      if (p.lm != null) v.Fluxo_lm = p.lm; else pend.push("fluxo (lm)");
      if (p.W != null) v.Potencia_W = p.W; else pend.push("potência (W)");
      if (p.ab != null) v.Angulo_facho = p.ab;
    }
    if (!lampId) { if (K) v.Temperatura_K = K; else if (p.K && p.K.length) v.Temperatura_K = p.K[0]; else pend.push("temperatura de cor (K)"); }
    Object.keys(extra || {}).forEach(function (k) { v[k] = extra[k]; });
    if (extra && extra.Pendente) pend.push(extra.Pendente);
    v.Pendente = pend.join("; ");
    return { id: id, nome: nome, valores: v, fonte: v.Fonte };
  }

  /* ------------------------------------------------ AS FAMÍLIAS */
  var LISTA = [], EMI = {};
  function defLuz(o) {
    if (!FM || !FM.def) return null;
    var fam = FM.def({ id: o.id, nome: o.nome, categoria: "luminaria", descricao: o.descricao, semOrigem: true, parametros: o.parametros, tipos: o.tipos, gerar: o.gerar, quantDesc: o.nome });
    fam.descricao = o.descricao + " Os números de cada tipo vêm do catálogo de iluminação da RA, com a página do fabricante em \"Fonte\"; a geometria é paramétrica, nossa.";
    fam.disciplina = "eletrica";
    fam.mep = { peca: "luminaria" };
    fam.luz = o.kind;
    fam.conectores = [o.conector || { id: "el", nome: "Eletroduto (canopla)", sistema: "eletrica", dn: 25, x: "0", y: "Altura_montagem", z: "0" }];
    fam.quantitativo = { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: o.nome };
    EMI[o.kind] = o.emissores;
    LISTA.push(fam);
    return fam;
  }
  var BR = "branco", DIF = "acrilico branco", TRANSP = "acrílico transparente", PRETO = "metal preto", CROMO = "metal cromado";

  /* 1. PLAFON E PAINEL (sobrepor/embutir, redondo/quadrado) */
  defLuz({
    id: "ra-ilum-plafon", kind: "plafon", nome: "Plafon / painel LED",
    descricao: "Plafon de sobrepor ou painel de embutir, redondo ou quadrado, LED integrado. A face de baixo fica na Altura de montagem (forro ou laje); a luz sai pela face (difusor) para baixo.",
    parametros: comuns("plafon", { modelo: "plafon_circular" }).concat([
      P("Formato", "texto", "redondo", "Dimensões", "redondo ou quadrado"),
      P("Largura", "comprimento", 0.21, "Dimensões", "Diâmetro (redondo) ou lado (quadrado) externo — catálogo"),
      P("Altura_corpo", "comprimento", 0.026, "Dimensões", "Altura do corpo — catálogo"),
      P("Nicho", "comprimento", 0, "Dimensões", "Recorte no forro (embutir) — catálogo; 0 = sobrepor"),
      P("Lado", "comprimento", 0.19, "Fotometria", "Tamanho da face que acende. Stella: abertura luminosa do .ies; Taschibra não publica — " + MODEL)
    ]),
    tipos: [
      tipoDe("tb-red-sob-3000", "Taschibra Lux 18 W redondo, sobrepor, 3000 K", "pl-tb-lux18-red-sob", 3000, { Formato: "redondo", Largura: 0.21, Altura_corpo: 0.026, Lado: 0.19, Instalacao: "sobrepor", Modelo: "plafon_circular" }),
      tipoDe("tb-red-sob-4000", "Taschibra Lux 18 W redondo, sobrepor, 4000 K", "pl-tb-lux18-red-sob", 4000, { Formato: "redondo", Largura: 0.21, Altura_corpo: 0.026, Lado: 0.19, Instalacao: "sobrepor", Modelo: "plafon_circular" }),
      tipoDe("tb-qua-sob-3000", "Taschibra Lux 18 W quadrado, sobrepor, 3000 K", "pl-tb-lux18-qua-sob", 3000, { Formato: "quadrado", Largura: 0.21, Altura_corpo: 0.025, Lado: 0.19, Instalacao: "sobrepor", Modelo: "plafon_quadrado" }),
      tipoDe("tb-qua-sob-6500", "Taschibra Lux 18 W quadrado, sobrepor, 6500 K", "pl-tb-lux18-qua-sob", 6500, { Formato: "quadrado", Largura: 0.21, Altura_corpo: 0.025, Lado: 0.19, Instalacao: "sobrepor", Modelo: "plafon_quadrado" }),
      tipoDe("tb-red-emb-3000", "Taschibra Lux 18 W redondo, embutir, 3000 K", "pa-tb-lux18-red-emb", 3000, { Formato: "redondo", Largura: 0.22, Altura_corpo: 0.015, Nicho: 0.205, Lado: 0.20, Instalacao: "embutir", Modelo: "painel_circular" }),
      tipoDe("tb-red-emb-4000", "Taschibra Lux 18 W redondo, embutir, 4000 K", "pa-tb-lux18-red-emb", 4000, { Formato: "redondo", Largura: 0.22, Altura_corpo: 0.015, Nicho: 0.205, Lado: 0.20, Instalacao: "embutir", Modelo: "painel_circular" }),
      tipoDe("tb-qua-emb-3000", "Taschibra Lux 18 W quadrado, embutir, 3000 K", "pa-tb-lux18-qua-emb", 3000, { Formato: "quadrado", Largura: 0.216, Altura_corpo: 0.015, Nicho: 0.205, Lado: 0.196, Instalacao: "embutir", Modelo: "painel_quadrado" }),
      tipoDe("tb-qua-emb-4000", "Taschibra Lux 18 W quadrado, embutir, 4000 K", "pa-tb-lux18-qua-emb", 4000, { Formato: "quadrado", Largura: 0.216, Altura_corpo: 0.015, Nicho: 0.205, Lado: 0.196, Instalacao: "embutir", Modelo: "painel_quadrado" }),
      tipoDe("st-eco-sob-3000", "Stella ECO 18 W, sobrepor, 3000 K", "pl-st-eco18-sob", 3000, { Formato: "quadrado", Largura: 0.19, Altura_corpo: 0.03, Lado: 0.19, Instalacao: "sobrepor", Modelo: "plafon_quadrado", Pendente: "cota externa (desenho pela abertura luminosa do .ies)" }),
      tipoDe("st-eco-sob-4000", "Stella ECO 18 W, sobrepor, 4000 K", "pl-st-eco18-sob", 4000, { Formato: "quadrado", Largura: 0.19, Altura_corpo: 0.03, Lado: 0.19, Instalacao: "sobrepor", Modelo: "plafon_quadrado", Pendente: "cota externa (desenho pela abertura luminosa do .ies)" }),
      tipoDe("st-eco-emb-3000", "Stella ECO 18 W, embutir, 3000 K", "pa-st-eco18-emb", 3000, { Formato: "quadrado", Largura: 0.202, Altura_corpo: 0.003, Lado: 0.202, Instalacao: "embutir", Modelo: "painel_quadrado", Pendente: "cota externa e nicho (desenho pela abertura luminosa do .ies)" }),
      tipoDe("st-eco-emb-4000", "Stella ECO 18 W, embutir, 4000 K", "pa-st-eco18-emb", 4000, { Formato: "quadrado", Largura: 0.202, Altura_corpo: 0.003, Lado: 0.202, Instalacao: "embutir", Modelo: "painel_quadrado", Pendente: "cota externa e nicho (desenho pela abertura luminosa do .ies)" })
    ],
    gerar: function (c, v) {
      var A = num(v.Altura_montagem, 2.6), D = clamp(num(v.Largura, 0.2), 0.03, 1.5), H = clamp(num(v.Altura_corpo, 0.02), 0.002, 0.3), Ld = clamp(num(v.Lado, D), 0.02, D), red = v.Formato !== "quadrado";
      var emb = v.Instalacao === "embutir", e = emb ? Math.min(H, 0.006) : H;
      if (red) {
        if (emb) c.cil(BR, 0, A - e, 0, D / 2, e, { seg: 32 });
        else c.torno(BR, 0, 0, 0, [[0, A - H], [D / 2 - 0.004, A - H], [D / 2, A - H + 0.004], [D / 2, A]], { seg: 32 });
        c.cil(DIF, 0, A - e - 0.0008, 0, Ld / 2, 0.0008, { seg: 32 });
      } else {
        if (emb) c.caixa(BR, 0, A - e, 0, D, e, D); else c.caixaR(BR, 0, A - H, 0, D, H, D, Math.min(0.004, H / 3), { k: 1 });
        c.caixa(DIF, 0, A - e - 0.0008, 0, Ld, 0.0008, Ld);
      }
    },
    emissores: function (v) {
      var A = num(v.Altura_montagem, 2.6), H = num(v.Altura_corpo, 0.02), e = v.Instalacao === "embutir" ? Math.min(H, 0.006) : H, Ld = num(v.Lado, 0.19);
      return [{ k: "painel", x: 0, y: A - e - 0.0012, z: 0, w: Ld, h: Ld, circular: v.Formato !== "quadrado", lm: num(v.Fluxo_lm, 0) }];
    }
  });

  /* 2. SPOT DE EMBUTIR (LED integrado ou soquete GU10 com a lâmpada do catálogo) */
  defLuz({
    id: "ra-ilum-spot-embutir", kind: "spot_embutir", nome: "Spot de embutir",
    descricao: "Spot quadrado de embutir no forro. Os de soquete (Conecta MR16/AR70/AR111) levam a lâmpada GU10 do catálogo, que dá o fluxo, a cor e o facho.",
    parametros: comuns("spot_embutir", { tipoLuz: "spot", modelo: "spot_embutir", instalacao: "embutir" }).concat([
      P("Largura", "comprimento", 0.09, "Dimensões", "Lado da moldura — catálogo"),
      P("Altura_corpo", "comprimento", 0.027, "Dimensões", "Altura do corpo (acima do forro) — catálogo"),
      P("Nicho", "comprimento", 0.072, "Dimensões", "Recorte no forro — catálogo"),
      P("Diametro_face", "comprimento", 0.05, "Dimensões", "Face da lâmpada: o diâmetro da lâmpada do catálogo; LED integrado: " + MODEL),
      P("Lampada", "texto", "", "Fotometria", "Lâmpada GU10 do catálogo (vazio = LED integrado)"),
      P("Potencia_max_W", "numero", 0, "Elétrica", "Potência máxima do soquete (catálogo); a carga é a da lâmpada")
    ]),
    tipos: [
      tipoDe("alltop-3000", "Taschibra Alltop LED MR16 5 W 38°, 3000 K", "sp-tb-alltop-mr16", 3000, { Largura: 0.09, Altura_corpo: 0.027, Nicho: 0.072, Diametro_face: 0.05 }),
      tipoDe("alltop-6500", "Taschibra Alltop LED MR16 5 W 38°, 6500 K", "sp-tb-alltop-mr16", 6500, { Largura: 0.09, Altura_corpo: 0.027, Nicho: 0.072, Diametro_face: 0.05 }),
      spotLamp("conecta-mr16", "Taschibra Conecta MR16 + lâmpada MR16 4 W 38° 2700 K", "sp-tb-conecta-mr16", "lp-tb-mr16-tdl25-4w", 0.102, 0.095, 0.05),
      spotLamp("conecta-ar70", "Taschibra Conecta AR70 + lâmpada AR70 4,8 W 24° 4000 K", "sp-tb-conecta-ar70", "lp-tb-ar70-24-48w", 0.13, 0.12, 0.07),
      spotLamp("conecta-ar111", "Taschibra Conecta AR111 + lâmpada AR111 12 W 24° 2700 K", "sp-tb-conecta-ar111", "lp-tb-ar111-24-12w", 0.17, 0.16, 0.111)
    ],
    gerar: function (c, v) {
      var A = num(v.Altura_montagem, 2.6), L = clamp(num(v.Largura, 0.09), 0.03, 0.5), Df = clamp(num(v.Diametro_face, 0.05), 0.01, L);
      c.caixa(BR, 0, A - 0.004, 0, L, 0.004, L);
      c.caixa(PRETO, 0, A - 0.0045, 0, Math.min(L - 0.012, Df + 0.012), 0.0005, Math.min(L - 0.012, Df + 0.012));
      c.cil(DIF, 0, A - 0.0052, 0, Df / 2, 0.0007, { seg: 24 });
    },
    emissores: function (v) {
      var A = num(v.Altura_montagem, 2.6);
      return [{ k: "spot", x: 0, y: A - 0.0065, z: 0, dir: [0, -1, 0], ang: num(v.Angulo_facho, 36), lm: num(v.Fluxo_lm, 0) }];
    }
  });
  /* tipo de spot com lâmpada: a carga e a luz são da lâmpada; o soquete diz a potência máxima */
  function spotLamp(id, nome, prod, lamp, L, nicho, Df) {
    var p = CAT[prod], lp = CAT[lamp];
    return { id: id, nome: nome, fonte: p.link + " | lâmpada: " + lp.link,
      valores: { Produto: prod, Lampada: lamp, Fonte: p.link + " | lâmpada: " + lp.link, Pendente: "", Fluxo_lm: lp.lm, Potencia_W: lp.W, Potencia_max_W: p.W, Temperatura_K: lp.K[0], Angulo_facho: lp.ab,
        Largura: L, Altura_corpo: p.mm.h / 1000, Nicho: nicho, Diametro_face: Df } };
  }

  /* 3. SPOT DIRIGÍVEL (trilho ou sobrepor): inclina e gira */
  defLuz({
    id: "ra-ilum-spot-dirigivel", kind: "spot_dirigivel", nome: "Spot dirigível (trilho/sobrepor)",
    descricao: "Spot de trilho ou de sobrepor, com o corpo que inclina (Inclinação a partir da vertical) e gira (Azimute). O facho segue o corpo.",
    parametros: comuns("spot_dirigivel", { tipoLuz: "spot", modelo: "spot_trilho", instalacao: "trilho" }).concat([
      P("Diametro", "comprimento", 0.04, "Dimensões", "Diâmetro (ou largura) do corpo — catálogo"),
      P("Comprimento_corpo", "comprimento", 0.102, "Dimensões", "Comprimento do corpo — catálogo"),
      P("Inclinacao", "angulo", 30, "Restrições", "Inclinação do facho a partir da vertical (0 = para baixo)", "instancia"),
      P("Azimute", "angulo", 0, "Restrições", "Giro do facho em planta (0 = para a frente da peça, +Z)", "instancia")
    ]),
    tipos: [
      tipoDe("trace-5w-3000", "Stella Trace Spot LED 5 W 34°, 3000 K", "tr-st-trace-spot5", 3000, { Diametro: 0.04, Comprimento_corpo: 0.102 }),
      tipoDe("direct-mr16-3000", "Taschibra Direct MR16 6 W 38°, 3000 K", "tr-tb-direct-mr16", 3000, { Diametro: 0.059, Comprimento_corpo: 0.094 }),
      tipoDe("direct-mr16-6500", "Taschibra Direct MR16 6 W 38°, 6500 K", "tr-tb-direct-mr16", 6500, { Diametro: 0.059, Comprimento_corpo: 0.094 })
    ],
    gerar: function (c, v) {
      var A = num(v.Altura_montagem, 2.6), D = clamp(num(v.Diametro, 0.04), 0.01, 0.3), Lc = clamp(num(v.Comprimento_corpo, 0.1), 0.02, 0.6);
      var th = clamp(num(v.Inclinacao, 30), 0, 90), ph = num(v.Azimute, 0), py = A - 0.045;
      c.caixa(BR, 0, A - 0.03, 0, 0.034, 0.03, 0.05);                               /* adaptador do trilho: modelagem */
      c.cil(BR, 0, py, 0, 0.006, 0.015, {});                                         /* haste do pivô: modelagem */
      c.cil(BR, 0, py, 0, D / 2, Lc, { rotX: 180 - th, rotY: ph, seg: 20 });
      var d = dirSpot(th, ph);
      c.cil(DIF, d[0] * Lc, py + d[1] * Lc, d[2] * Lc, D / 2 - 0.004, 0.0008, { rotX: 180 - th, rotY: ph, seg: 20 });
    },
    emissores: function (v) {
      var A = num(v.Altura_montagem, 2.6), Lc = num(v.Comprimento_corpo, 0.1), d = dirSpot(clamp(num(v.Inclinacao, 30), 0, 90), num(v.Azimute, 0)), py = A - 0.045, s = Lc + 0.004;
      return [{ k: "spot", x: d[0] * s, y: py + d[1] * s, z: d[2] * s, dir: d, ang: num(v.Angulo_facho, 36), lm: num(v.Fluxo_lm, 0) }];
    }
  });
  /* direção do facho: inclinação θ a partir de −Y, giro φ em planta (θ = 0 → [0, −1, 0]; φ = 0 inclina para +Z) */
  function dirSpot(th, ph) { var t = th * RAD, p = ph * RAD; return [Math.sin(t) * Math.sin(p), -Math.cos(t), Math.sin(t) * Math.cos(p)]; }

  /* 4. PENDENTE (cúpula, industrial, linear, globos de vidro) */
  defLuz({
    id: "ra-ilum-pendente", kind: "pendente", nome: "Pendente",
    descricao: "Pendente pelo cabo do catálogo: cúpula, industrial, linear (LED integrado) ou barra com globos de vidro. A de soquete leva a lâmpada do catálogo.",
    parametros: comuns("pendente", { tipoLuz: "pendente", modelo: "pendente", instalacao: "pendente", comLampada: true }).concat([
      P("Forma", "texto", "cupula", "Dimensões", "cupula, industrial, linear ou globos"),
      P("Diametro", "comprimento", 0.14, "Dimensões", "Diâmetro (cúpula) ou comprimento (linear, barra) — catálogo"),
      P("Largura", "comprimento", 0.14, "Dimensões", "Largura (linear, barra) — catálogo"),
      P("Altura_corpo", "comprimento", 0.33, "Dimensões", "Altura do corpo — catálogo"),
      P("Comprimento_cabo", "comprimento", 0.9, "Restrições", "Cabo do teto ao corpo (catálogo; ajustável na obra)", "instancia")
    ]),
    tipos: [
      tipoDe("td1003-tkl60", "Taschibra TD 1003 E27 + lâmpada TKL 60 9 W 3000 K", "pe-tb-td1003-cupula", null, { Forma: "cupula", Diametro: 0.14, Largura: 0.14, Altura_corpo: 0.33 }, "lp-tb-tkl60-9w-3000k", 1),
      tipoDe("td1003-tkl40", "Taschibra TD 1003 E27 + lâmpada TKL 40 7 W 3000 K", "pe-tb-td1003-cupula", null, { Forma: "cupula", Diametro: 0.14, Largura: 0.14, Altura_corpo: 0.33 }, "lp-tb-tkl40-7w-3000k", 1),
      tipoDe("factory-tkl60", "Taschibra Factory M E27 + lâmpada TKL 60 9 W 3000 K", "pe-tb-factory-m", null, { Forma: "industrial", Diametro: 0.375, Largura: 0.375, Altura_corpo: 0.335 }, "lp-tb-tkl60-9w-3000k", 1),
      tipoDe("jabuticaba-g9", "Taschibra Jabuticaba 4×G9 + lâmpadas G9 3 W 3000 K", "pe-tb-jabuticaba", null, { Forma: "globos", Diametro: 0.57, Largura: 0.25, Altura_corpo: 0.25 }, "lp-tb-g9-3w-3000k", 4),
      { id: "plane60-3000", nome: "Stella Plane 60 cm 16 W, 3000 K (LED integrado)", fonte: CAT["pe-st-plane60"].link,
        valores: { Produto: "pe-st-plane60", Fonte: CAT["pe-st-plane60"].link, Pendente: "cota externa (desenho pela abertura luminosa do .ies)", Lampada: "", Lampadas: 1, Fluxo_lampada_lm: 1800, Potencia_lampada_W: 16, Temperatura_K: 3000, Angulo_facho: 140,
          Forma: "linear", Diametro: 0.591, Largura: 0.066, Altura_corpo: 0.028, Tipo_luz: "painel" } },
      { id: "plane60-4000", nome: "Stella Plane 60 cm 16 W, 4000 K (LED integrado)", fonte: CAT["pe-st-plane60"].link,
        valores: { Produto: "pe-st-plane60", Fonte: CAT["pe-st-plane60"].link, Pendente: "cota externa (desenho pela abertura luminosa do .ies)", Lampada: "", Lampadas: 1, Fluxo_lampada_lm: 1800, Potencia_lampada_W: 16, Temperatura_K: 4000, Angulo_facho: 140,
          Forma: "linear", Diametro: 0.591, Largura: 0.066, Altura_corpo: 0.028, Tipo_luz: "painel" } }
    ],
    gerar: function (c, v) {
      var A = num(v.Altura_montagem, 2.6), cabo = clamp(num(v.Comprimento_cabo, 0.9), 0.05, 4), H = clamp(num(v.Altura_corpo, 0.3), 0.01, 1.5), D = clamp(num(v.Diametro, 0.14), 0.03, 2), W = clamp(num(v.Largura, D), 0.02, 1);
      var yT = A - 0.025 - cabo, yB = yT - H, f = v.Forma;
      if (f === "linear" || f === "globos") {
        [-1, 1].forEach(function (s) { c.cil(BR, s * D * 0.4, A - 0.012, 0, 0.025, 0.012, { seg: 16 }); c.cil(PRETO, s * D * 0.4, yT, 0, 0.0015, A - 0.012 - yT, { seg: 6 }); });
        if (f === "linear") { c.caixa(BR, 0, yB, 0, D, H, W); c.caixa(DIF, 0, yB - 0.0008, 0, D - 0.004, 0.0008, W - 0.004); return; }
        var r = Math.min(W, D / 4) * 0.45;
        c.caixa(PRETO, 0, yT - 0.012, 0, D, 0.012, 0.02);
        for (var i = 0; i < 4; i++) { var x = -D / 2 + D / 8 + i * D / 4; c.cil(PRETO, x, yT - 0.03, 0, 0.008, 0.018, { seg: 10 }); c.elipsoide(TRANSP, x, yT - 0.03 - r, 0, r, r, r, { seg: 18 }); }
        return;
      }
      c.cil(BR, 0, A - 0.02, 0, 0.05, 0.02, { seg: 20 });                              /* canopla: modelagem */
      c.cil(PRETO, 0, yT, 0, 0.002, A - 0.02 - yT, { seg: 6 });
      var R = D / 2, t = 0.0015;
      if (f === "industrial") {
        c.torno(BR, 0, 0, 0, [[0.028, yT - t], [0.028, yT - 0.10], [R - t, yB], [R, yB], [0.03, yT - 0.10], [0.03, yT], [0.028, yT - t]], { aberto: true, seg: 32 });
        c.cil(BR, 0, yT - 0.003, 0, 0.028, 0.002, { seg: 16 });
      } else {
        c.torno(BR, 0, 0, 0, [[R - t, yB], [R - t, yT], [R, yT], [R, yB], [R - t, yB]], { aberto: true, seg: 28 });
        c.cil(BR, 0, yT - 0.002, 0, R - t, 0.002, { seg: 28 });
      }
      c.cil(PRETO, 0, yT - 0.04, 0, 0.016, 0.038, { seg: 12 });                        /* soquete: modelagem */
      c.elipsoide(TRANSP, 0, yT - 0.04 - 0.05, 0, 0.03, 0.05, 0.03, { seg: 16 });     /* bulbo (vidro: a luz passa) */
    },
    emissores: function (v) {
      var A = num(v.Altura_montagem, 2.6), cabo = num(v.Comprimento_cabo, 0.9), H = num(v.Altura_corpo, 0.3), D = num(v.Diametro, 0.14), W = num(v.Largura, D);
      var yT = A - 0.025 - cabo, yB = yT - H, n = Math.max(1, Math.round(num(v.Lampadas, 1))), lm = num(v.Fluxo_lampada_lm, 0);
      if (v.Forma === "linear") return [{ k: "painel", x: 0, y: yB - 0.0012, z: 0, w: D - 0.004, h: W - 0.004, lm: lm * n }];
      if (v.Forma === "globos") { var r = Math.min(W, D / 4) * 0.45, out = []; for (var i = 0; i < 4 && i < n; i++) out.push({ k: "ponto", x: -D / 2 + D / 8 + i * D / 4, y: yT - 0.03 - r, z: 0, lm: lm }); return out; }
      return [{ k: "ponto", x: 0, y: yT - 0.04 - 0.05, z: 0, lm: lm * n }];
    }
  });

  /* 5. LUSTRE (vários pontos de luz) */
  defLuz({
    id: "ra-ilum-lustre", kind: "lustre", nome: "Lustre",
    descricao: "Lustre de cristal ou moderno com vários braços; cada lâmpada é um ponto de luz próprio. A lâmpada (E14/E27) é a do catálogo.",
    parametros: comuns("lustre", { tipoLuz: "pendente", modelo: "lustre", instalacao: "pendente", comLampada: true }).concat([
      P("Estilo", "texto", "cristal", "Dimensões", "cristal ou moderno"),
      P("Diametro", "comprimento", 0.58, "Dimensões", "Diâmetro — catálogo"),
      P("Altura_corpo", "comprimento", 0.54, "Dimensões", "Altura do corpo — catálogo"),
      P("Raio_lampadas", "comprimento", 0.2, "Dimensões", "Raio do círculo das lâmpadas — " + MODEL),
      P("Comprimento_cabo", "comprimento", 0.5, "Restrições", "Haste/cabo do teto ao corpo (catálogo; ajustável)", "instancia")
    ]),
    tipos: [
      tipoDe("glam6-tvl25", "Taschibra Glam cristal 6×E14 + velas LED 3 W 2700 K", "lu-tb-glam6", null, { Estilo: "cristal", Diametro: 0.58, Altura_corpo: 0.54, Raio_lampadas: 0.21 }, "lp-tb-tvl25-3w-2700k-e14", 6),
      tipoDe("imperio400-tvl25", "Taschibra Império 400 cristal 6×E14 + velas LED 3 W 2700 K", "lu-tb-imperio400", null, { Estilo: "cristal", Diametro: 0.4, Altura_corpo: 0.65, Raio_lampadas: 0.14 }, "lp-tb-tvl25-3w-2700k-e14", 6),
      tipoDe("equilibrium6-tkl60", "Taschibra Equilibrium 6×E27 preto + lâmpadas TKL 60 9 W 3000 K", "lu-tb-equilibrium6", null, { Estilo: "moderno", Diametro: 0.42, Altura_corpo: 0.23, Raio_lampadas: 0.17 }, "lp-tb-tkl60-9w-3000k", 6)
    ],
    gerar: function (c, v) {
      var A = num(v.Altura_montagem, 2.6), cabo = clamp(num(v.Comprimento_cabo, 0.5), 0.05, 4), H = clamp(num(v.Altura_corpo, 0.5), 0.05, 2), D = clamp(num(v.Diametro, 0.5), 0.1, 3);
      var n = clamp(Math.round(num(v.Lampadas, 6)), 1, 24), Rl = clamp(num(v.Raio_lampadas, D * 0.36), 0.03, D / 2), cris = v.Estilo !== "moderno", met = cris ? CROMO : PRETO;
      var yT = A - 0.03 - cabo, yB = yT - H, yA = cris ? yB + H * 0.35 : yT - H * 0.45;
      c.cil(met, 0, A - 0.03, 0, 0.06, 0.03, { seg: 24 });
      c.cil(met, 0, yA, 0, 0.006, A - 0.03 - yA, { seg: 8 });
      for (var i = 0; i < n; i++) {
        var a = i * 2 * Math.PI / n, x = Math.cos(a) * Rl, z = Math.sin(a) * Rl;
        c.cil(met, 0, yA, 0, 0.004, Rl, { rotZ: -90, rotY: -a / RAD, seg: 6 });
        c.cil(met, x, yA, z, 0.014, 0.025, { seg: 12 });
        c.elipsoide(TRANSP, x, yA + 0.025 + 0.045, z, 0.016, 0.045, 0.016, { seg: 12 });
      }
      if (cris) {
        c.torno(met, 0, 0, 0, [[D / 2 - 0.004, yA - 0.004], [D / 2, yA - 0.004], [D / 2, yA], [D / 2 - 0.004, yA], [D / 2 - 0.004, yA - 0.004]], { aberto: true, seg: 40 });
        var m = Math.round(D * 60);
        for (var j = 0; j < m; j++) {
          var b = j * 2 * Math.PI / m, rr = D / 2 - 0.01, comp = (H * 0.35 - 0.02) * (0.55 + 0.45 * Math.abs(Math.sin(j * 1.7)));
          c.elipsoide(TRANSP, Math.cos(b) * rr, yA - 0.004 - comp / 2, Math.sin(b) * rr, 0.008, comp / 2, 0.008, { seg: 6 });
        }
      }
    },
    emissores: function (v) {
      var A = num(v.Altura_montagem, 2.6), cabo = num(v.Comprimento_cabo, 0.5), H = num(v.Altura_corpo, 0.5), D = num(v.Diametro, 0.5);
      var n = clamp(Math.round(num(v.Lampadas, 6)), 1, 24), Rl = clamp(num(v.Raio_lampadas, D * 0.36), 0.03, D / 2), cris = v.Estilo !== "moderno", lm = num(v.Fluxo_lampada_lm, 0);
      var yT = A - 0.03 - cabo, yB = yT - H, yA = cris ? yB + H * 0.35 : yT - H * 0.45, out = [];
      for (var i = 0; i < n; i++) { var a = i * 2 * Math.PI / n; out.push({ k: "ponto", x: Math.cos(a) * Rl, y: yA + 0.025 + 0.045, z: Math.sin(a) * Rl, lm: lm }); }
      return out;
    }
  });

  /* 6. FITA DE LED (sanca): emissor LINEAR */
  defLuz({
    id: "ra-ilum-fita", kind: "fita", nome: "Fita de LED (sanca)",
    descricao: "Fita de LED da sanca ou do perfil: a luz é um emissor linear do comprimento da fita, virado para cima (sanca), para a frente ou para baixo. A fita corre em +X a partir da origem (o ponto do driver).",
    parametros: comuns("fita", { tipoLuz: "painel", modelo: "fita_led", instalacao: "sanca", porMetro: true, altura: 2.45, alturaDesc: "Do piso até a fita (dentro da sanca)" }).concat([
      P("Comprimento", "comprimento", 1.0, "Dimensões", "Comprimento da fita", "instancia"),
      P("Direcao", "texto", "cima", "Restrições", "Para onde a fita acende: cima (sanca), frente (+Z) ou baixo", "instancia"),
      P("Largura_fita", "comprimento", 0.01, "Dimensões", "Largura da fita — " + MODEL)
    ]),
    tipos: [
      fitaT("full19-2700", "Stella Full LED PRO 19 W/m, 2700 K (IRC 97)", "fi-st-full19", 2700),
      fitaT("full19-3000", "Stella Full LED PRO 19 W/m, 3000 K (IRC 97)", "fi-st-full19", 3000),
      fitaT("full19-4000", "Stella Full LED PRO 19 W/m, 4000 K (IRC 97)", "fi-st-full19", 4000),
      fitaT("alllight14-4000", "Stella All Light COB 14 W/m, 4000 K (IRC 93)", "fi-st-alllight14", 4000)
    ],
    conector: { id: "el", nome: "Driver (ponta da fita)", sistema: "eletrica", dn: 20, x: "0", y: "Altura_montagem", z: "0" },
    gerar: function (c, v) {
      var A = num(v.Altura_montagem, 2.45), L = clamp(num(v.Comprimento, 1), 0.05, 50), w = clamp(num(v.Largura_fita, 0.01), 0.003, 0.05), d = v.Direcao;
      if (d === "frente") c.caixa(DIF, L / 2, A, 0, L, w, 0.002); else c.caixa(DIF, L / 2, A - (d === "baixo" ? 0.002 : 0), 0, L, 0.002, w);
    },
    emissores: function (v) {
      var A = num(v.Altura_montagem, 2.45), L = clamp(num(v.Comprimento, 1), 0.05, 50), w = clamp(num(v.Largura_fita, 0.01), 0.003, 0.05), d = v.Direcao, lm = num(v.Fluxo_lm_m, 0) * L;
      if (d === "frente") return [{ k: "painel", x: L / 2, y: A + w / 2, z: 0.0032, w: L, h: w, rotX: 0, rotY: 180, lm: lm }];
      if (d === "baixo") return [{ k: "painel", x: L / 2, y: A - 0.0032, z: 0, w: L, h: w, lm: lm }];
      return [{ k: "painel", x: L / 2, y: A + 0.0012, z: 0, w: L, h: w, rotX: 90, lm: lm }];
    }
  });
  function fitaT(id, nome, prod, K) {
    var p = CAT[prod];
    return { id: id, nome: nome, fonte: p.link, valores: { Produto: prod, Fonte: p.link, Pendente: "", Fluxo_lm_m: p.lm, Potencia_W_m: p.W, Temperatura_K: K } };
  }

  /* 7. ARANDELA (parede) */
  defLuz({
    id: "ra-ilum-arandela", kind: "arandela", nome: "Arandela",
    descricao: "Arandela de parede. Origem: na face da parede, no meio da peça, com a frente em +Z; a Altura de montagem é a do CENTRO da peça.",
    parametros: comuns("arandela", { tipoLuz: "pendente", modelo: "arandela", instalacao: "parede", altura: 1.8, alturaDesc: "Do piso ao centro da arandela (escolha do projeto)" }).concat([
      P("Largura", "comprimento", 0.086, "Dimensões", "Largura — catálogo"),
      P("Profundidade", "comprimento", 0.03, "Dimensões", "Profundidade (saliência da parede) — catálogo"),
      P("Altura_corpo", "comprimento", 0.122, "Dimensões", "Altura — catálogo")
    ]),
    tipos: [
      tipoDe("quadre-3000", "Taschibra Quadre LED 4 W, 3000 K (externa)", "ar-tb-quadre", 3000, { Largura: 0.086, Profundidade: 0.03, Altura_corpo: 0.122 }),
      tipoDe("quadre-6500", "Taschibra Quadre LED 4 W, 6500 K (externa)", "ar-tb-quadre", 6500, { Largura: 0.086, Profundidade: 0.03, Altura_corpo: 0.122 }),
      tipoDe("ray10-2700", "Taschibra Ray LED 10 W, 2700 K", "ar-tb-ray10", 2700, { Largura: 0.095, Profundidade: 0.058, Altura_corpo: 0.18 })
    ],
    conector: { id: "el", nome: "Eletroduto (parede, atrás do corpo)", sistema: "eletrica", dn: 20, x: "0", y: "Altura_montagem", z: "0" },
    gerar: function (c, v) {
      var A = num(v.Altura_montagem, 1.8), L = clamp(num(v.Largura, 0.09), 0.02, 1), P2 = clamp(num(v.Profundidade, 0.03), 0.005, 0.5), H = clamp(num(v.Altura_corpo, 0.12), 0.02, 1);
      c.caixaR(BR, 0, A - H / 2, P2 / 2, L, H, P2, Math.min(0.004, P2 / 3), { k: 1 });
      c.caixa(DIF, 0, A - H * 0.3, P2 + 0.0004, L * 0.7, H * 0.6, 0.0008);
    },
    emissores: function (v) {
      var A = num(v.Altura_montagem, 1.8), P2 = num(v.Profundidade, 0.03);
      return [{ k: "ponto", x: 0, y: A, z: P2 + 0.012, lm: num(v.Fluxo_lm, 0) }];
    }
  });

  /* 8. VENTILADOR DE TETO COM LUZ */
  defLuz({
    id: "ra-ilum-ventilador", kind: "ventilador", nome: "Ventilador de teto com luz",
    descricao: "Ventilador de teto com a luminária embaixo do motor. O diâmetro das pás e o número de pás são do catálogo; o motor e a haste são modelagem.",
    parametros: comuns("ventilador", { tipoLuz: "pendente", modelo: "ventilador_luz", instalacao: "teto", comLampada: true }).concat([
      P("Diametro", "comprimento", 0.96, "Dimensões", "Diâmetro das pás — catálogo (0 = não publicado)"),
      P("Pas", "inteiro", 3, "Dimensões", "Número de pás — catálogo"),
      P("Potencia_motor_W", "numero", 0, "Elétrica", "Potência do motor (W) — catálogo"),
      P("Haste", "comprimento", 0.25, "Restrições", "Do teto ao topo do motor — " + MODEL, "instancia"),
      P("Placa_led", "simnao", false, "Fotometria", "Luz por placa LED (ligado) ou por lâmpada em globo")
    ]),
    tipos: [
      tipoDe("windlight-tkl60", "Ventisol Wind Light 96 cm 3 pás + lâmpada TKL 60 9 W 3000 K", "vt-ventisol-windlight", null, { Diametro: 0.96, Pas: 3, Potencia_motor_W: 130 }, "lp-tb-tkl60-9w-3000k", 1),
      tipoDe("arno-ultimate", "Arno Ultimate 120 cm 3 pás (lâmpadas pendentes)", "vt-arno-ultimate", null, { Diametro: 1.2, Pas: 3, Potencia_motor_W: 150 }, null, 2),
      { id: "spirit-led", nome: "Spirit LED 3 pás, placa LED 800 lm 6500 K (diâmetro pendente)", fonte: CAT["vt-spirit-led"].link,
        valores: { Produto: "vt-spirit-led", Fonte: CAT["vt-spirit-led"].link, Pendente: "diâmetro das pás e potência da placa LED (não publicados)", Lampada: "", Lampadas: 1, Fluxo_lampada_lm: 800, Potencia_lampada_W: 0, Temperatura_K: 6500,
          Diametro: 0, Pas: 3, Potencia_motor_W: 135, Placa_led: true } }
    ],
    gerar: function (c, v) {
      var A = num(v.Altura_montagem, 2.6), h = clamp(num(v.Haste, 0.25), 0.02, 2), D = clamp(num(v.Diametro, 0), 0, 3), n = clamp(Math.round(num(v.Pas, 3)), 2, 8);
      var yM = A - h, hm = 0.11, rm = 0.1;
      c.cil(BR, 0, A - 0.04, 0, 0.06, 0.04, { seg: 24 });
      c.cil(BR, 0, yM, 0, 0.011, h - 0.04, { seg: 8 });
      c.torno(BR, 0, 0, 0, [[0.03, yM], [rm, yM - 0.02], [rm, yM - hm + 0.02], [0.05, yM - hm]], { seg: 32 });
      if (D > 0) for (var i = 0; i < n; i++) {
        var a = i * 360 / n, L = D / 2 - rm;
        c.grupo(0, yM - hm / 2, 0, a, function (cc) { cc.caixa(BR, rm + L / 2, -0.004, 0, L, 0.008, Math.max(0.09, D * 0.12), { rotX: 10 }); });
      }
      if (v.Placa_led) c.cil(DIF, 0, yM - hm - 0.012, 0, 0.09, 0.012, { seg: 32 });
      else c.elipsoide(TRANSP, 0, yM - hm - 0.06, 0, 0.1, 0.06, 0.1, { seg: 20, meia: false });
    },
    emissores: function (v) {
      var A = num(v.Altura_montagem, 2.6), h = num(v.Haste, 0.25), yM = A - h, hm = 0.11, n = Math.max(1, Math.round(num(v.Lampadas, 1))), lm = num(v.Fluxo_lampada_lm, 0);
      if (v.Placa_led) return [{ k: "ponto", x: 0, y: yM - hm - 0.024, z: 0, lm: lm * n }];
      var out = []; for (var i = 0; i < n; i++) out.push({ k: "ponto", x: n > 1 ? (i - (n - 1) / 2) * 0.06 : 0, y: yM - hm - 0.06, z: 0, lm: lm });
      return out;
    }
  });

  /* ------------------------------------------------ A LUZ (instância → luzes do motor) */
  /* o que falta para a luz desta peça (texto) ou "" — fluxo zero/sem K nunca acende com número inventado */
  function pendenteDe(v) {
    var p = [];
    if (!(num(v.Fluxo_lm, 0) > 0) && !(num(v.Fluxo_lm_m, 0) > 0)) p.push("fluxo (lm)");
    if (!(num(v.Temperatura_K, 0) >= 1800)) p.push("temperatura de cor (K)");
    return p.length ? "sem " + p.join(" e ") + " no catálogo" + (txt(v.Pendente) ? " (pendente: " + txt(v.Pendente) + ")" : "") : "";
  }
  /* emissores LOCAIS da família (sem a instância) — [] se não é família de luz */
  function emissores(v) { var f = EMI[txt(v && v.Emissor)]; if (!f) return []; try { return f(v) || []; } catch (e) { return []; } }
  /* valores avaliados + instância { x, y, z, rotY } (mundo) + extra { id, nome, circuito, comando } → { luzes, pendente }.
     R = js/rendermat.js (cor da temperatura e o objeto de luz do motor). */
  function luzes(v, inst, extra, R) {
    R = R || dep("RenderMat", "rendermat.js");
    var e = extra || {}, I = inst || {}, pend = pendenteDe(v || {}), out = [];
    if (!R || !EMI[txt(v && v.Emissor)]) return { luzes: out, pendente: pend || "não é família de luz" };
    if (pend) return { luzes: out, pendente: pend };
    var K = num(v.Temperatura_K, 3000), th = num(I.rotY, 0), cs = Math.cos(th), sn = Math.sin(th), lista = emissores(v);
    var cmd = txt(e.comando || v.Comando || v.Circuito || e.circuito);
    lista.forEach(function (m, i) {
      if (!(m.lm > 0)) return;
      var wx = num(I.x, 0) + m.x * cs + m.z * sn, wy = num(I.y, 0) + m.y, wz = num(I.z, 0) - m.x * sn + m.z * cs;
      var tipo = m.k === "painel" ? "painel" : (m.k === "spot" ? "spot" : "pendente");
      var l = R.luzDaLuminaria({ Fluxo_lm: m.lm, Temperatura_K: K, Tipo_luz: tipo, Angulo_facho: m.ang || num(v.Angulo_facho, 120), Lado: m.w || 0.1, Altura_montagem: 0, Circuito: cmd, Modelo: m.circular ? "redondo" : "" },
        { x: wx, y: wy, z: wz, rotY: th }, { id: txt(e.id) + (lista.length > 1 ? "#" + i : ""), nome: txt(e.nome) + (lista.length > 1 ? " · " + (i + 1) : "") });
      l.posicao = [wx, wy, wz];
      if (tipo === "painel") {
        l.largura = m.w; l.profundidade = m.h; l.circular = !!m.circular;
        var A = l.circular ? Math.PI * m.w * m.h / 4 : m.w * m.h;
        l.luminancia = m.lm / (Math.PI * A); l.intensidade = l.luminancia;
        if (m.rotX != null) l.rotX = m.rotX * RAD;
        l.rotY = th + (m.rotY || 0) * RAD;
      } else if (tipo === "spot") {
        var d = m.dir || [0, -1, 0];
        l.dir = [d[0] * cs + d[2] * sn, d[1], -d[0] * sn + d[2] * cs];
      } else {
        l.posicao = [wx, wy + 0.05, wz];   /* o ponto: os motores descem 5 cm (js/bimrendervivo.js, bimrendermotor.js, bimluzluminarias.js) */
      }
      l.comando = cmd; l.familiaLuz = txt(v.Emissor); l.produto = txt(v.Produto); l.potenciaW = num(v.Potencia_W, 0) / Math.max(1, lista.length);
      out.push(l);
    });
    return { luzes: out, pendente: "" };
  }

  var FamiliasLuz = {
    CATALOGO: CAT,
    lista: function () { return JSON.parse(JSON.stringify(LISTA)); },
    ids: function () { return LISTA.map(function (f) { return f.id; }); },
    ehLuz: function (v) { return !!EMI[txt(v && v.Emissor)]; },
    emissores: emissores, luzes: luzes, pendenteDe: pendenteDe, dirSpot: dirSpot,
    /* os tipos de uma família (para a tela do "Sugerir iluminação") */
    tipos: function (famId) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === famId) return JSON.parse(JSON.stringify(LISTA[i].tipos)); return []; }
  };
  if (FM && FM.registrar) FM.registrar();
  global.FamiliasLuz = FamiliasLuz;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasLuz;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

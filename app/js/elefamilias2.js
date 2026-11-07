/* =====================================================================
 * elefamilias2.js — LUMINÁRIAS QUE FALTAVAM E ELETRODOMÉSTICOS/EQUIPAMENTOS COM PONTO ELÉTRICO (Elétrica v2, lote L2b, 07/11/2026)
 *
 * Pedido do Rogério: "igual ao produto de loja" (volumetria, borda arredondada, difusor, aletas, canopla, alça, porta, visor, display, pés) — caixa genérica é
 * reprovada. Segue o MESMO padrão do js/elefamilias.js (L2a): famílias do js/familia.js com `geometria: "mob"` (FamiliasMob.def), tipos pelas cotas do catálogo L1
 * (js/elecatalogodados.js), `Item_catalogo`/`Fonte`/`Nivel_fonte`/`Cotas_a_conferir` em cada tipo, e a malha dos geradores de js/elefamilias2geo.js.
 * NÃO substitui nada: o que o js/familiasluz.js (plafon Taschibra/Stella, spot, pendente, lustre, fita, arandela, ventilador), o js/familiasmobcoz.js (geladeira,
 * lavadora, torre quente, cooktop da bancada) e o js/climfamilias.js (split, janela) já cobrem fica lá.
 *
 * LUMINÁRIAS (mep.peca "luminaria", conector `el` na CANOPLA no teto — na PAREDE para as de parede —, Comando/Circuito/Circuito_quadro, fotometria Fluxo_lm /
 * Temperatura_K / Potencia_W / Tipo_luz / Modelo / Lado / Angulo_facho): ids ele-lum-plafon, ele-lum-painel, ele-lum-tubular, ele-lum-emergencia, ele-lum-refletor,
 * ele-lum-balizador, ele-lum-tartaruga, ele-lum-bocal, ele-lum-spot-trilho. A luz vai ao render pelo caminho GENÉRICO (RenderMat.luzDaLuminaria, o mesmo das famílias
 * antigas), porque o mapa de emissores do familiasluz.js é privado: o fluxo e a cor saem certos; a direção do facho (refletor, spot inclinado) não — pendência dita no tipo.
 *
 * EQUIPAMENTOS (Potencia_W, Tensao_V, Tipo_ponto do catálogo, conector `el` onde o cabo sai do aparelho): ele-eq-microondas, ele-eq-forno-embutir, ele-eq-cooktop-inducao,
 * ele-eq-coifa, ele-eq-lava-loucas, ele-eq-secadora, ele-eq-lava-seca, ele-eq-freezer, ele-eq-torneira-eletrica, ele-eq-tv, ele-eq-motor-portao. Cada um está em
 * dados-fonte/eletrica/aparelhos.json (→ js/eleaparelhosdados.js), então AO COLOCAR a família pede o próprio ponto (EleAparelhos.aoColocar) — a tomada na altura da tabela.
 *
 * DE ONDE VÊM OS NÚMEROS: SÓ do catálogo L1. TODO item de luminária e de equipamento do L1 é nível `sem-fonte-conferir` (cotas e fluxos USUAIS de mercado — nenhum catálogo
 * de fabricante lido): o tipo carrega esse nível e a lista das cotas a conferir; NÃO usar em projeto assinado sem conferir o modelo comprado. O que o catálogo não tem e
 * foi preciso desenhar (calha de 2 tubos, freezer vertical, depurador, balizador de piso, altura do capelo) está nos parâmetros como `sem-fonte-conferir` com a descrição.
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
  var G = dep("EleFamilias2Geo", "elefamilias2geo.js");
  var Cat = dep("EleCatalogoDados", "elecatalogodados.js");
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function sim(v, nome) { return v[nome] === true; }
  function merge(a) { for (var i = 1; i < arguments.length; i++) { var b = arguments[i] || {}; Object.keys(b).forEach(function (k) { a[k] = b[k]; }); } return a; }

  /* ------------------------------------------------ O CATÁLOGO (cota que falta = erro na carga, nunca zero em silêncio) */
  function item(id) { var x = Cat && Cat.item(id); if (!x) throw new Error("catálogo elétrico (L1) sem o item \"" + id + "\""); return x; }
  function cotaMM(id, nome) { var x = Cat && Cat.cota(id, nome); if (!x) throw new Error("catálogo elétrico (L1): o item \"" + id + "\" não tem a cota \"" + nome + "\""); return x.valor; }
  function cotaM(id, nome) { return cotaMM(id, nome) / 1000; }
  function elet(id, nome) { var e = item(id).eletrico || {}; return Object.prototype.hasOwnProperty.call(e, nome) ? e[nome] : null; }
  var ORDEM_NIVEL = { "primaria-lida": 0, "secundaria-lida": 1, "decisao-RA": 2, "sem-fonte-conferir": 3 };
  function nivelDe(id) {
    var it = item(id), pior = "primaria-lida", det = [];
    Object.keys(it.cotas).forEach(function (k) {
      var n = Cat.cota(id, k).nivel;
      if ((ORDEM_NIVEL[n] || 0) > (ORDEM_NIVEL[pior] || 0)) pior = n;
      if (n !== "primaria-lida") det.push(k + ": " + n);
    });
    return { nivel: pior, detalhe: det };
  }
  function fonteDe(id) { var it = item(id); return "Catálogo RA L1 (dados-fonte/eletrica/catalogo) · " + id + " · nível " + it.fonte.nivel + (it.fonte.doc ? " · " + it.fonte.doc + (it.fonte.pagina ? " p." + it.fonte.pagina : "") : " · valor usual de mercado, conferir o modelo comprado"); }
  function vFonte(id) {
    var n = nivelDe(id);
    return { Item_catalogo: id, Fonte: fonteDe(id), Nivel_fonte: n.nivel, Cotas_a_conferir: n.detalhe.join("; ") };
  }

  /* ------------------------------------------------ PARÂMETROS */
  var P = FM.P, T = FM.T;
  function Pf(nome, tipoDado, valor, grupo, descricao, escopo) { return P(nome, tipoDado, valor, grupo, descricao, escopo); }
  function F(nome, tipoDado, formula, grupo, descricao) { var o = { nome: nome, tipoDado: tipoDado, escopo: "tipo", formula: formula, grupo: grupo }; if (descricao) o.descricao = descricao; return o; }
  function paramFonte() {
    return [
      Pf("Item_catalogo", "texto", "", "Fonte", "Id do item no catálogo elétrico da RA (dados-fonte/eletrica/catalogo), de onde saem as cotas do tipo"),
      Pf("Fonte", "texto", "", "Fonte", "Origem dos números do tipo (o catálogo L1 de luminárias e equipamentos é de valor usual de mercado, sem ficha de fabricante)"),
      Pf("Nivel_fonte", "texto", "", "Fonte", "A pior fonte entre as cotas usadas: primaria-lida · secundaria-lida · sem-fonte-conferir (valor usual, NÃO usar em projeto assinado)"),
      Pf("Cotas_a_conferir", "texto", "", "Fonte", "As cotas do tipo que NÃO são de ficha primária (nome: nível); vazio = todas primárias")
    ];
  }
  var LISTA_ID = [], CAT_IDS = {};
  function mkFamilia(o) {
    var fam = FM.def({ id: o.id, nome: o.nome, categoria: o.categoria, descricao: o.descricao, semOrigem: true, parametros: o.parametros, tipos: o.tipos, gerar: o.gerar, quantDesc: o.nome });
    fam.descricao = o.descricao + (o.aparte ? " Equipamento/mobiliário não tem composição SINAPI: orçar à parte (quantitativo em unidade); o PONTO elétrico dele é orçado pelo motor dos pontos." : "");
    fam.disciplina = o.disciplina;
    if (o.mep) fam.mep = { peca: o.mep };
    fam.conectores = o.conectores;
    fam.quantitativo = { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: o.nome };
    fam.catalogo = { ids: o.ids || [] };
    LISTA_ID.push(o.id); CAT_IDS[o.id] = o.ids || [];
    return fam;
  }
  function con(id, nome, dn, x, y, z, dir, aconf) {
    return { id: id, nome: nome, sistema: "eletrica", dn: dn, x: x, y: y, z: z, papel: "entrada", dir: dir, origemPos: "desenho", aConferir: aconf || "posição de projeto da saída do cabo/eletroduto: conferir no manual do modelo comprado" };
  }
  var D_TETO = { x: 0, y: 1, z: 0 }, D_FUNDO = { x: 0, y: 0, z: -1 };

  /* =====================================================================
   * LUMINÁRIAS — parâmetros comuns (fotometria + contrato da ligação, docs/eletrica/CONTRATO-ILUMINACAO.md)
   * ===================================================================== */
  function paramsLum(op) {
    var l = [
      Pf("Modelo", "texto", op.modelo, "Elétrica", "Descrição curta para o quantitativo e para o render (" + op.modelo + ")"),
      Pf("Tipo_luz", "texto", op.tipoLuz, "Fotometria", "Como a luz sai, para o render: painel (face que acende), spot (facho) ou pendente (lâmpada para todo lado)"),
      Pf("Temperatura_K", "numero", 0, "Fotometria", "Temperatura de cor (K) do catálogo; 0 = o catálogo não publica (pendente: o render usa o padrão e o diz)"),
      Pf("Angulo_facho", "angulo", op.angulo || 120, "Fotometria", "Abertura do facho (graus). O catálogo L1 não publica: valor usual, conferir"),
      Pf("Lado", "comprimento", op.lado || 0.2, "Fotometria", "Tamanho da face que acende (lado ou diâmetro equivalente) para o render do painel"),
      Pf("Instalacao", "texto", op.instalacao, "Elétrica", "embutir, sobrepor, parede, piso, pendente ou trilho"),
      Pf("Pendente", "texto", "", "Fotometria", "O que o catálogo não publica e falta para a luz (vazio = completo)"),
      Pf("Tensao_V", "texto", "bivolt", "Elétrica", "Tensão (catálogo)"),
      Pf("Altura_montagem", "comprimento", op.altura, "Restrições", op.alturaDesc, "instancia"),
      Pf("Comando", "texto", "", "Elétrica", "Comando (quem acende junto): o interruptor que a liga. Vazio = um comando por ambiente.", "instancia"),
      Pf("Circuito", "texto", "", "Elétrica", "Legado: o mesmo valor do Comando", "instancia"),
      Pf("Circuito_quadro", "texto", "", "Elétrica", "Circuito de proteção no quadro (ex.: C1) — informativo", "instancia")
    ];
    if (op.multi) {
      l.push(Pf(op.multi.qtd, "inteiro", op.multi.padrao, "Fotometria", op.multi.desc, op.multi.escopo || "instancia"));
      l.push(Pf(op.multi.fluxoUn, "numero", 0, "Fotometria", "Fluxo de cada unidade (lm) do catálogo"));
      l.push(Pf(op.multi.potUn, "numero", 0, "Elétrica", "Potência de cada unidade (W) do catálogo"));
      l.push(F("Fluxo_lm", "numero", op.multi.qtd + " * " + op.multi.fluxoUn, "Fotometria", "Fluxo total (lm) = unidades × fluxo de cada"));
      l.push(F("Potencia_W", "numero", op.multi.qtd + " * " + op.multi.potUn, "Elétrica", "Potência instalada (W) = unidades × potência de cada"));
    } else {
      l.push(Pf("Fluxo_lm", "numero", 0, "Fotometria", "Fluxo luminoso (lm) do catálogo; 0 = pendente"));
      l.push(Pf("Potencia_W", "numero", 0, "Elétrica", "Potência (W) do catálogo"));
    }
    return l.concat(op.extra || [], paramFonte());
  }
  /* valores do tipo a partir do item do catálogo (nunca digitados duas vezes) */
  function valoresLum(catId, extra, op) {
    op = op || {};
    var v = vFonte(catId), p = [];
    if (op.multi) {
      v[op.multi.fluxoUn] = elet(catId, "fluxo_lm") || 0; v[op.multi.potUn] = elet(catId, "potencia_W") || 0;
    } else {
      v.Fluxo_lm = elet(catId, "fluxo_lm") || 0; v.Potencia_W = elet(catId, "potencia_W") || 0;
    }
    var K = elet(catId, "temperatura_K"); v.Temperatura_K = K || 0;
    var tv = elet(catId, "tensao_V"); v.Tensao_V = tv == null ? "bivolt" : String(tv);
    if (!(num(v.Fluxo_lm != null ? v.Fluxo_lm : v[op.multi && op.multi.fluxoUn], 0) > 0)) p.push("fluxo (lm)");
    if (!K) p.push("temperatura de cor (K)");
    Object.keys(extra || {}).forEach(function (k) { v[k] = extra[k]; });
    if (extra && extra.Pendente) p.push(extra.Pendente);
    v.Pendente = p.join("; ");
    return v;
  }
  function tipoLum(id, nome, catId, extra, op) { return T(id, nome, valoresLum(catId, extra, op), fonteDe(catId)); }
  function conCanopla(dn, nome) { return con("el", nome || "Eletroduto (canopla, no teto)", dn || 25, "0", "Altura_montagem", "0", D_TETO, "luminária de teto: o ponto de luz é a caixa octogonal no teto, na vertical da canopla"); }
  function conParede(dn, nome) { return con("el", nome || "Eletroduto (parede, atrás do corpo)", dn || 20, "0", "Altura_montagem", "0", D_FUNDO, "luminária de parede: a caixa 4×2 atrás do corpo, na Altura de montagem"); }
  function defLum(o) {
    return mkFamilia({ id: o.id, nome: o.nome, categoria: "luminaria", disciplina: "eletrica", mep: "luminaria", descricao: o.descricao, parametros: paramsLum(o.op), tipos: o.tipos, gerar: o.gerar,
      conectores: [o.conector || conCanopla()], ids: o.ids });
  }

  /* ---------- 1. plafon de sobrepor (redondo | quadrado, 18 | 24 W) */
  function tPlafon(id, nome, cat, redondo) {
    var diam = redondo ? cotaM(cat, "diametro_mm") : cotaM(cat, "lado_mm");
    return tipoLum(id, nome, cat, { Formato: redondo ? "redondo" : "quadrado", Largura: diam, Altura_corpo: cotaM(cat, "altura_mm"), Lado: Math.round((diam - 0.03) * 1000) / 1000, Instalacao: "sobrepor", Modelo: redondo ? "plafon_circular" : "plafon_quadrado" });
  }
  defLum({
    id: "ele-lum-plafon", nome: "Plafon LED de sobrepor (redondo e quadrado)", ids: ["lum_plafon_redondo_18w", "lum_plafon_redondo_24w", "lum_plafon_quadrado_18w", "lum_plafon_quadrado_24w"],
    descricao: "Plafon LED de sobrepor, redondo ou quadrado, 18 ou 24 W: corpo com a borda arredondada, junta escura e difusor leitoso levemente abaulado. A face de baixo fica na Altura de montagem menos a altura do corpo (o corpo sobe até o teto). Conector `el` na canopla. Os tipos 18 W com ficha de fabricante (Taschibra Lux, Stella ECO) estão em ra-ilum-plafon; estes são os de catálogo L1 (valor usual, 24 W inclusive).",
    op: { modelo: "plafon_circular", tipoLuz: "painel", instalacao: "sobrepor", altura: 2.60, alturaDesc: "Do piso à face de baixo do forro ou da laje (o teto onde a peça é fixada)", lado: 0.195,
      extra: [Pf("Formato", "texto", "redondo", "Dimensões", "redondo ou quadrado"), Pf("Largura", "comprimento", 0.225, "Dimensões", "Diâmetro (redondo) ou lado (quadrado) externo — catálogo L1"),
        Pf("Altura_corpo", "comprimento", 0.04, "Dimensões", "Altura do corpo — catálogo L1")] },
    tipos: [tPlafon("red-18", "Plafon redondo 18 W (225 mm)", "lum_plafon_redondo_18w", true), tPlafon("red-24", "Plafon redondo 24 W (300 mm)", "lum_plafon_redondo_24w", true),
      tPlafon("qua-18", "Plafon quadrado 18 W (225 mm)", "lum_plafon_quadrado_18w", false), tPlafon("qua-24", "Plafon quadrado 24 W (300 mm)", "lum_plafon_quadrado_24w", false)],
    gerar: function (c, v) { G.plafon(c, { redondo: txt(v.Formato) !== "quadrado", D: num(v.Largura, 0.225), H: num(v.Altura_corpo, 0.04), A: num(v.Altura_montagem, 2.6), Ld: num(v.Lado, 0.195) }); }
  });

  /* ---------- 2. painel LED de embutir (60×60, 30×30, redondo 12 | 18 W) */
  function tPainel(id, nome, cat, redondo) {
    var D = redondo ? cotaM(cat, "diametro_mm") : cotaM(cat, "largura_mm");
    return tipoLum(id, nome, cat, { Formato: redondo ? "redondo" : "quadrado", Largura: D, Altura_corpo: cotaM(cat, "altura_mm"), Furo_forro: cotaM(cat, "furo_forro_mm"), Lado: Math.round((D - 0.016) * 1000) / 1000, Instalacao: "embutir", Modelo: redondo ? "painel_circular" : "painel_quadrado" });
  }
  defLum({
    id: "ele-lum-painel", nome: "Painel LED de embutir (borda fina)", ids: ["lum_painel_60x60_embutir", "lum_painel_30x30_embutir", "lum_painel_redondo_12w", "lum_painel_redondo_18w"],
    descricao: "Painel LED de embutir no forro, quadrado 60×60 e 30×30 ou redondo 12 e 18 W, com a borda fina (moldura de 4 mm abaixo do forro, 8 mm de largura) e o difusor leitoso. Acima do forro: o corpo que entra no recorte (Furo no forro) e a caixa do driver (modelagem). A Altura de montagem é a do forro. Conector `el` na canopla.",
    op: { modelo: "painel_quadrado", tipoLuz: "painel", instalacao: "embutir", altura: 2.60, alturaDesc: "Do piso à face de baixo do forro (a moldura fica rente)", lado: 0.58,
      extra: [Pf("Formato", "texto", "quadrado", "Dimensões", "redondo ou quadrado"), Pf("Largura", "comprimento", 0.595, "Dimensões", "Lado (quadrado) ou diâmetro (redondo) da moldura — catálogo L1"),
        Pf("Altura_corpo", "comprimento", 0.01, "Dimensões", "Espessura do painel — catálogo L1"), Pf("Furo_forro", "comprimento", 0.595, "Dimensões", "Recorte no forro — catálogo L1"),
        Pf("Borda", "comprimento", 0.008, "Dimensões", "Largura da moldura visível (borda fina) — modelagem, o catálogo não publica")] },
    tipos: [tPainel("q60", "Painel 60×60 cm, 40 W", "lum_painel_60x60_embutir", false), tPainel("q30", "Painel 30×30 cm, 24 W", "lum_painel_30x30_embutir", false),
      tPainel("r12", "Painel redondo 12 W (170 mm)", "lum_painel_redondo_12w", true), tPainel("r18", "Painel redondo 18 W (225 mm)", "lum_painel_redondo_18w", true)],
    gerar: function (c, v) { G.painel(c, { redondo: txt(v.Formato) === "redondo", D: num(v.Largura, 0.3), H: num(v.Altura_corpo, 0.01), furo: num(v.Furo_forro, 0.28), A: num(v.Altura_montagem, 2.6), borda: num(v.Borda, 0.008) }); }
  });

  /* ---------- 3. luminária tubular LED 1,20 m (calha de sobrepor, 1 ou 2 tubos) */
  defLum({
    id: "ele-lum-tubular", nome: "Luminária tubular LED 1,20 m (calha)", ids: ["lum_tubular_120"],
    descricao: "Calha de sobrepor com 1 ou 2 tubos LED T8 de 1,20 m: aba em U, dobras do refletor, tampas de ponta, soquetes bipino e driver. A Altura de montagem é a do teto; a calha desce a partir dela. Conector `el` na canopla.",
    op: { modelo: "calha_tubular", tipoLuz: "painel", instalacao: "sobrepor", altura: 2.60, alturaDesc: "Do piso à face de baixo do forro ou da laje", lado: 0.27,
      multi: { qtd: "Tubos", padrao: 1, escopo: "tipo", desc: "Quantidade de tubos na calha (1 ou 2) — vem do tipo", fluxoUn: "Fluxo_tubo_lm", potUn: "Potencia_tubo_W" },
      extra: [Pf("Comprimento", "comprimento", 1.2, "Dimensões", "Comprimento da calha — catálogo L1"), Pf("Largura", "comprimento", 0.06, "Dimensões", "Largura da calha — catálogo L1 (1 tubo); 2 tubos: usual, sem-fonte-conferir"),
        Pf("Altura_corpo", "comprimento", 0.04, "Dimensões", "Altura da calha — catálogo L1")] },
    tipos: [tipoLum("t1", "Calha 1,20 m com 1 tubo (18 W)", "lum_tubular_120", { Comprimento: cotaM("lum_tubular_120", "comprimento_mm"), Largura: cotaM("lum_tubular_120", "largura_mm"), Altura_corpo: cotaM("lum_tubular_120", "altura_mm"), Lado: 0.27, Instalacao: "sobrepor" }, { multi: { fluxoUn: "Fluxo_tubo_lm", potUn: "Potencia_tubo_W" } }),
      T("t2", "Calha 1,20 m com 2 tubos (2 × 18 W)", (function () {
        var v = valoresLum("lum_tubular_120", { Comprimento: cotaM("lum_tubular_120", "comprimento_mm"), Largura: 0.1, Altura_corpo: cotaM("lum_tubular_120", "altura_mm"), Lado: 0.34, Instalacao: "sobrepor" }, { multi: { fluxoUn: "Fluxo_tubo_lm", potUn: "Potencia_tubo_W" } });
        v.Cotas_a_conferir += "; largura da calha de 2 tubos: sem-fonte-conferir (usual 100 mm, o catálogo L1 só tem a de 1 tubo)";
        v.Tubos = 2; return v; })(), fonteDe("lum_tubular_120"))],
    gerar: function (c, v) { G.tubular(c, { L: num(v.Comprimento, 1.2), W: num(v.Largura, 0.06), H: num(v.Altura_corpo, 0.04), A: num(v.Altura_montagem, 2.6), tubos: num(v.Tubos, 1) }); }
  });

  /* ---------- 4. luminária de emergência 30 LEDs (de parede) */
  defLum({
    id: "ele-lum-emergencia", nome: "Luminária de emergência 30 LEDs (sobrepor de parede)", ids: ["lum_emergencia_30led"],
    descricao: "Luminária de emergência de sobrepor na parede, 30 LEDs em duas fileiras atrás de lente transparente, LED de carga e botão de teste (autonomia 3 h). Origem: na face da parede, no meio da peça, frente em +Z; a Altura de montagem é a do CENTRO. Conector `el` atrás do corpo.",
    op: { modelo: "emergencia", tipoLuz: "pendente", instalacao: "parede", altura: 2.20, alturaDesc: "Do piso ao centro da luminária (sobre a porta de saída: faixa usual 2,00-2,30 m)", lado: 0.1,
      extra: [Pf("Comprimento", "comprimento", 0.3, "Dimensões", "Comprimento — catálogo L1"), Pf("Largura", "comprimento", 0.1, "Dimensões", "Altura da peça na parede (cota 'largura' do catálogo) — catálogo L1"),
        Pf("Profundidade", "comprimento", 0.05, "Dimensões", "Saliência da parede — catálogo L1"), Pf("Autonomia_h", "numero", 3, "Elétrica", "Autonomia da bateria (h) — catálogo L1")] },
    conector: conParede(20),
    tipos: [tipoLum("l30", "Emergência 30 LEDs", "lum_emergencia_30led", { Comprimento: cotaM("lum_emergencia_30led", "comprimento_mm"), Largura: cotaM("lum_emergencia_30led", "largura_mm"), Profundidade: cotaM("lum_emergencia_30led", "altura_mm"), Autonomia_h: elet("lum_emergencia_30led", "autonomia_h"), Instalacao: "parede" })],
    gerar: function (c, v) { G.emergencia(c, { L: num(v.Comprimento, 0.3), W: num(v.Largura, 0.1), D: num(v.Profundidade, 0.05), A: num(v.Altura_montagem, 2.2) }); }
  });

  /* ---------- 5. refletor LED 50 | 100 W (aletas + suporte em U) */
  function tRef(id, nome, cat) { return tipoLum(id, nome, cat, { Largura: cotaM(cat, "largura_mm"), Altura_corpo: cotaM(cat, "altura_mm"), Profundidade: cotaM(cat, "profundidade_mm"), Instalacao: "parede", IP: elet(cat, "IP") || "" }); }
  defLum({
    id: "ele-lum-refletor", nome: "Refletor LED (aletas e suporte em U)", ids: ["lum_refletor_50w", "lum_refletor_100w"],
    descricao: "Refletor LED 50 ou 100 W, IP65: carcaça de alumínio injetado, vidro frontal sobre a placa de LED, aletas do dissipador atrás e suporte em U de aço com o parafuso de regulagem (Inclinacao para baixo). Origem: na face da parede, frente em +Z; Altura de montagem = o pivô (centro do corpo). Conector `el` atrás da chapa do suporte.",
    op: { modelo: "refletor", tipoLuz: "pendente", angulo: 120, instalacao: "parede", altura: 2.40, alturaDesc: "Do piso ao pivô (centro do corpo) do refletor", lado: 0.2,
      extra: [Pf("Largura", "comprimento", 0.215, "Dimensões", "Largura do corpo — catálogo L1"), Pf("Altura_corpo", "comprimento", 0.19, "Dimensões", "Altura do corpo — catálogo L1"),
        Pf("Profundidade", "comprimento", 0.04, "Dimensões", "Espessura do corpo sem as aletas — catálogo L1"), Pf("IP", "texto", "IP65", "Elétrica", "Grau de proteção — catálogo L1"),
        Pf("Inclinacao", "angulo", 20, "Restrições", "Inclinação do facho para baixo a partir da frente (graus). No render a luz sai como ponto: a direção do facho não é lida (pendência)", "instancia")] },
    conector: conParede(20, "Eletroduto (atrás do suporte)"),
    tipos: [tRef("w50", "Refletor LED 50 W", "lum_refletor_50w"), tRef("w100", "Refletor LED 100 W", "lum_refletor_100w")],
    gerar: function (c, v) { G.refletor(c, { W: num(v.Largura, 0.215), H: num(v.Altura_corpo, 0.19), Dp: num(v.Profundidade, 0.04), A: num(v.Altura_montagem, 2.4), tilt: num(v.Inclinacao, 20) }); }
  });

  /* ---------- 6. balizador de parede | piso */
  defLum({
    id: "ele-lum-balizador", nome: "Balizador LED (parede e piso)", ids: ["lum_balizador"],
    descricao: "Balizador LED IP65: de PAREDE (corpo de alumínio escuro com viseira e fendas de luz; Altura de montagem = o centro, origem na face da parede, frente em +Z) ou de PISO (moldura rente ao piso com as fendas e a caixa embutida abaixo; a face fica em Y = 0). A cota do catálogo é a do balizador de parede; a de piso usa a mesma pegada (sem-fonte-conferir). Conector `el` atrás do corpo (parede) ou sob a moldura (piso).",
    op: { modelo: "balizador", tipoLuz: "pendente", instalacao: "parede", altura: 0.40, alturaDesc: "Do piso ao centro do balizador de parede (balizamento usual 0,30-0,60 m). No tipo de piso é ignorada: a face fica no piso", lado: 0.1,
      extra: [Pf("Largura", "comprimento", 0.14, "Dimensões", "Largura — catálogo L1"), Pf("Altura_corpo", "comprimento", 0.07, "Dimensões", "Altura — catálogo L1"), Pf("Profundidade", "comprimento", 0.07, "Dimensões", "Profundidade — catálogo L1"),
        Pf("No_piso", "simnao", false, "Dimensões", "Tipo de piso (embutido, face rente ao piso)"), Pf("IP", "texto", "IP65", "Elétrica", "Grau de proteção — catálogo L1")] },
    conector: con("el", "Eletroduto (atrás do corpo ou sob a moldura)", 20, "0", "se(No_piso; 0; Altura_montagem)", "0", D_FUNDO, "balizador: a caixa 4×2 atrás do corpo (parede) ou a caixa embutida sob a moldura (piso)"),
    tipos: [tipoLum("parede", "Balizador de parede", "lum_balizador", { Largura: cotaM("lum_balizador", "largura_mm"), Altura_corpo: cotaM("lum_balizador", "altura_mm"), Profundidade: cotaM("lum_balizador", "profundidade_mm"), Instalacao: "parede", No_piso: false, IP: elet("lum_balizador", "IP") || "" }),
      (function () {
        var v = valoresLum("lum_balizador", { Largura: cotaM("lum_balizador", "largura_mm"), Altura_corpo: cotaM("lum_balizador", "altura_mm"), Profundidade: cotaM("lum_balizador", "profundidade_mm"), Instalacao: "piso", No_piso: true, IP: elet("lum_balizador", "IP") || "" });
        v.Cotas_a_conferir += "; balizador de piso: o catálogo L1 só tem o de parede (pegada reaproveitada), sem-fonte-conferir";
        return T("piso", "Balizador de piso (embutido)", v, fonteDe("lum_balizador"));
      })()],
    gerar: function (c, v) { G.balizador(c, { L: num(v.Largura, 0.14), H: num(v.Altura_corpo, 0.07), P: num(v.Profundidade, 0.07), A: num(v.Altura_montagem, 0.4), piso: sim(v, "No_piso") }); }
  });

  /* ---------- 7. arandela externa tartaruga (bocal E27) */
  defLum({
    id: "ele-lum-tartaruga", nome: "Arandela externa tipo tartaruga (E27)", ids: ["lum_arandela_tartaruga", "lum_bocal_e27_bulbo_9w"],
    descricao: "Arandela externa 'tartaruga': base oval, cúpula oval e grade de aletas horizontais, soquete E27 com lâmpada bulbo 9 W (a do catálogo L1: fluxo e potência vêm da lâmpada), IP54. Origem: na face da parede, frente em +Z; Altura de montagem = o centro. Conector `el` atrás da base.",
    op: { modelo: "arandela_tartaruga", tipoLuz: "pendente", instalacao: "parede", altura: 2.0, alturaDesc: "Do piso ao centro da arandela (faixa usual externa 1,80-2,20 m)", lado: 0.15,
      extra: [Pf("Largura", "comprimento", 0.2, "Dimensões", "Largura — catálogo L1"), Pf("Altura_corpo", "comprimento", 0.12, "Dimensões", "Altura — catálogo L1"), Pf("Profundidade", "comprimento", 0.09, "Dimensões", "Saliência da parede — catálogo L1"),
        Pf("IP", "texto", "IP54", "Elétrica", "Grau de proteção — catálogo L1"), Pf("Bocal", "texto", "E27", "Elétrica", "Soquete — catálogo L1")] },
    conector: conParede(20, "Eletroduto (atrás da base)"),
    tipos: [(function () {
      var v = valoresLum("lum_arandela_tartaruga", { Largura: cotaM("lum_arandela_tartaruga", "largura_mm"), Altura_corpo: cotaM("lum_arandela_tartaruga", "altura_mm"), Profundidade: cotaM("lum_arandela_tartaruga", "profundidade_mm"), Instalacao: "parede", IP: elet("lum_arandela_tartaruga", "IP"), Bocal: elet("lum_arandela_tartaruga", "bocal") });
      v.Fluxo_lm = elet("lum_bocal_e27_bulbo_9w", "fluxo_lm"); v.Potencia_W = elet("lum_arandela_tartaruga", "potencia_W");
      v.Pendente = "temperatura de cor (K); o fluxo é o da lâmpada bulbo 9 W do catálogo (lum_bocal_e27_bulbo_9w), a arandela não traz fluxo próprio";
      v.Fonte += " | lâmpada: " + fonteDe("lum_bocal_e27_bulbo_9w");
      return T("e27", "Arandela tartaruga E27 + bulbo 9 W", v, v.Fonte);
    })()],
    gerar: function (c, v) { G.tartaruga(c, { W: num(v.Largura, 0.2), H: num(v.Altura_corpo, 0.12), P: num(v.Profundidade, 0.09), A: num(v.Altura_montagem, 2.0) }); }
  });

  /* ---------- 8. bocal E27 com lâmpada bulbo 9 W */
  defLum({
    id: "ele-lum-bocal", nome: "Bocal E27 com lâmpada bulbo 9 W", ids: ["lum_bocal_e27_bulbo_9w"],
    descricao: "Ponto de luz simples de obra: rosácea no forro, bocal de plástico com a rosca coberta e lâmpada bulbo A60 leitosa 9 W. A Altura de montagem é a do teto; a lâmpada desce a partir dela (altura total da lâmpada 108 mm). Conector `el` na rosácea.",
    op: { modelo: "bocal_e27", tipoLuz: "pendente", instalacao: "sobrepor", altura: 2.60, alturaDesc: "Do piso à face de baixo do forro ou da laje", lado: 0.06,
      extra: [Pf("Diametro_bulbo", "comprimento", 0.06, "Dimensões", "Diâmetro do bulbo — catálogo L1"), Pf("Altura_total", "comprimento", 0.108, "Dimensões", "Altura total da lâmpada (rosca + vidro) — catálogo L1"),
        Pf("Diametro_rosca", "comprimento", 0.027, "Dimensões", "Diâmetro da rosca E27 — catálogo L1 (sem-fonte-conferir)"), Pf("Bocal", "texto", "E27", "Elétrica", "Soquete — catálogo L1")] },
    tipos: [tipoLum("e27", "Bocal E27 + bulbo 9 W (806 lm)", "lum_bocal_e27_bulbo_9w", { Diametro_bulbo: cotaM("lum_bocal_e27_bulbo_9w", "diametro_bulbo_mm"), Altura_total: cotaM("lum_bocal_e27_bulbo_9w", "altura_total_mm"), Diametro_rosca: cotaM("lum_bocal_e27_bulbo_9w", "diametro_rosca_mm"), Instalacao: "sobrepor" })],
    gerar: function (c, v) { G.bocal(c, { A: num(v.Altura_montagem, 2.6), dBulbo: num(v.Diametro_bulbo, 0.06), Htot: num(v.Altura_total, 0.108), dRosca: num(v.Diametro_rosca, 0.027) }); }
  });

  /* ---------- 9. spot de trilho + trilho eletrificado */
  defLum({
    id: "ele-lum-spot-trilho", nome: "Spot de trilho com trilho eletrificado", ids: ["lum_spot_trilho"],
    descricao: "Trilho eletrificado de alumínio (1 m do catálogo L1) com a fenda dos condutores, tampas de ponta e a alimentação (canopla) na ponta de x = −Comprimento/2, e 1 a 6 spots LED (adaptador, haste, pivô e cabeça que inclina). A Altura de montagem é a do teto. Conector `el` na alimentação do trilho. Cada spot do catálogo L1 tem 10 W e 800 lm.",
    op: { modelo: "spot_trilho", tipoLuz: "spot", angulo: 36, instalacao: "trilho", altura: 2.60, alturaDesc: "Do piso à face de baixo do forro ou da laje (onde o trilho é fixado)", lado: 0.07,
      multi: { qtd: "Spots", padrao: 1, desc: "Quantidade de spots no trilho (1 a 6)", fluxoUn: "Fluxo_spot_lm", potUn: "Potencia_spot_W" },
      extra: [Pf("Comprimento_trilho", "comprimento", 1.0, "Dimensões", "Comprimento do trilho — catálogo L1"), Pf("Diametro", "comprimento", 0.07, "Dimensões", "Diâmetro do spot — catálogo L1"),
        Pf("Altura_spot", "comprimento", 0.13, "Dimensões", "Altura do spot (adaptador + cabeça) — catálogo L1"),
        Pf("Inclinacao", "angulo", 30, "Restrições", "Inclinação do facho a partir da vertical (graus). No render a luz sai para baixo: a direção do facho não é lida (pendência)", "instancia")] },
    conector: con("el", "Alimentação do trilho (canopla na ponta)", 25, "-Comprimento_trilho/2+0.03", "Altura_montagem", "0", D_TETO, "trilho: o ponto de luz é a caixa octogonal no teto, sobre a alimentação (ponta do trilho)"),
    tipos: [tipoLum("tr10", "Spot de trilho LED 10 W + trilho de 1 m", "lum_spot_trilho", { Comprimento_trilho: cotaM("lum_spot_trilho", "comprimento_trilho_mm"), Diametro: cotaM("lum_spot_trilho", "diametro_mm"), Altura_spot: cotaM("lum_spot_trilho", "altura_mm"), Instalacao: "trilho", Lado: 0.07 }, { multi: { fluxoUn: "Fluxo_spot_lm", potUn: "Potencia_spot_W" } })],
    gerar: function (c, v) { G.spotTrilho(c, { L: num(v.Comprimento_trilho, 1), D: num(v.Diametro, 0.07), Hh: num(v.Altura_spot, 0.13), A: num(v.Altura_montagem, 2.6), incl: num(v.Inclinacao, 30), n: num(v.Spots, 1) }); }
  });

  /* =====================================================================
   * EQUIPAMENTOS COM PONTO ELÉTRICO
   * ===================================================================== */
  function paramsEq(op) {
    var l = [
      Pf("Largura", "comprimento", op.W, "Dimensões", "Largura — catálogo L1"), Pf("Altura", "comprimento", op.H, "Dimensões", "Altura — catálogo L1"), Pf("Profundidade", "comprimento", op.D, "Dimensões", "Profundidade — catálogo L1"),
      Pf("Potencia_W", "numero", 0, "Elétrica", "Potência típica (W) do catálogo L1 — a placa do aparelho comprado manda"),
      Pf("Tensao_V", "numero", 127, "Elétrica", "Tensão (V) do catálogo L1"),
      Pf("Tipo_ponto", "texto", "", "Elétrica", "Ponto que o aparelho pede (TUE, TUG dedicada, ligação direta) — catálogo L1"),
      Pf("Altura_ponto_m", "comprimento", 0.3, "Elétrica", "Altura do ponto elétrico (m do piso) do catálogo L1; o ponto lançado segue a tabela dos aparelhos (dados-fonte/eletrica/aparelhos.json)")
    ];
    if (op.acab) l.push(Pf("Acabamento", "texto", op.acab, "Materiais", "inox, branco ou preto (cor do corpo)", "instancia"));
    if (op.apoio) l.push(Pf(op.apoio.nome, "comprimento", op.apoio.padrao, "Restrições", op.apoio.desc, "instancia"));
    return l.concat(op.extra || [], paramFonte());
  }
  function valoresEq(catId, extra) {
    var v = vFonte(catId), it = item(catId);
    v.Potencia_W = elet(catId, "potencia_W") || 0; v.Tensao_V = num(elet(catId, "tensao_V"), 127); v.Tipo_ponto = elet(catId, "tipo_ponto") || "";
    v.Altura_ponto_m = num(elet(catId, "altura_ponto_m"), 0.3);
    Object.keys(extra || {}).forEach(function (k) { v[k] = extra[k]; });
    void it;
    return v;
  }
  function tipoEq(id, nome, catId, extra) { return T(id, nome, valoresEq(catId, extra), fonteDe(catId)); }
  function defEq(o) {
    return mkFamilia({ id: o.id, nome: o.nome, categoria: o.categoria || "mobiliario", disciplina: "mobiliario", aparte: true, descricao: o.descricao, parametros: paramsEq(o.op), tipos: o.tipos, gerar: o.gerar, conectores: [o.conector], ids: o.ids });
  }
  function dimsEq(cat) { return { Largura: cotaM(cat, "largura_mm"), Altura: cotaM(cat, "altura_mm"), Profundidade: cotaM(cat, "profundidade_mm") }; }

  /* ---------- micro-ondas de bancada 20 | 30 L */
  defEq({
    id: "ele-eq-microondas", nome: "Micro-ondas de bancada", ids: ["eq_microondas_20l", "eq_microondas_30l"],
    descricao: "Micro-ondas de bancada 20 ou 30 L: corpo arredondado, porta de vidro escuro com a alça vertical, painel com visor, teclas e seletor, grade lateral e pés. Origem: no apoio (Altura_apoio = o tampo da bancada), no meio da largura, com o FUNDO em Z = 0 e a frente em +Z. Conector `el` onde o cabo sai, atrás, embaixo, do lado direito.",
    op: { W: 0.44, H: 0.26, D: 0.34, acab: "inox", apoio: { nome: "Altura_apoio", padrao: 0.90, desc: "Do piso ao tampo da bancada onde o aparelho apoia (usual 0,90 m)" }, extra: [Pf("Capacidade_L", "inteiro", 20, "Dimensões", "Capacidade (litros) — nome do catálogo L1")] },
    conector: con("el", "Cabo de força (atrás, embaixo à direita)", 25, "Largura/2-0.06", "Altura_apoio+0.05", "0", D_FUNDO),
    tipos: [tipoEq("l20", "Micro-ondas 20 L (1.200 W)", "eq_microondas_20l", merge(dimsEq("eq_microondas_20l"), { Capacidade_L: 20 })), tipoEq("l30", "Micro-ondas 30 L (1.500 W)", "eq_microondas_30l", merge(dimsEq("eq_microondas_30l"), { Capacidade_L: 30 }))],
    gerar: function (c, v) { G.microondas(c, { W: num(v.Largura, 0.44), H: num(v.Altura, 0.26), D: num(v.Profundidade, 0.34), y0: num(v.Altura_apoio, 0.9), acab: txt(v.Acabamento) }); }
  });

  /* ---------- forno elétrico de embutir 50 L */
  defEq({
    id: "ele-eq-forno-embutir", nome: "Forno elétrico de embutir 50 L", ids: ["eq_forno_embutir_50l"],
    descricao: "Forno elétrico de embutir de 50 L (nicho 560 × 590 mm): testa de inox, faixa de comando com 4 manoplas e visor, porta com vidro escuro e alça-barra, ventilação sob a faixa e a carcaça que entra no nicho. Origem: na base do aparelho (Altura_apoio), no meio da largura, FUNDO em Z = 0, frente em +Z. Conector `el` onde o cabo sai, atrás.",
    op: { W: 0.595, H: 0.595, D: 0.55, apoio: { nome: "Altura_apoio", padrao: 0.90, desc: "Do piso à base do forro (usual 0,60-0,90 m na torre)" },
      extra: [Pf("Nicho_largura", "comprimento", 0.56, "Dimensões", "Largura do nicho — catálogo L1"), Pf("Nicho_altura", "comprimento", 0.59, "Dimensões", "Altura do nicho — catálogo L1")] },
    conector: con("el", "Cabo de força (atrás)", 25, "Largura/2-0.1", "Altura_apoio+0.12", "0", D_FUNDO),
    tipos: [tipoEq("l50", "Forno de embutir 50 L (4.500 W, 220 V)", "eq_forno_embutir_50l", merge(dimsEq("eq_forno_embutir_50l"), { Nicho_largura: cotaM("eq_forno_embutir_50l", "nicho_largura_mm"), Nicho_altura: cotaM("eq_forno_embutir_50l", "nicho_altura_mm") }))],
    gerar: function (c, v) { G.forno(c, { W: num(v.Largura, 0.595), H: num(v.Altura, 0.595), D: num(v.Profundidade, 0.55), y0: num(v.Altura_apoio, 0.9), Wn: num(v.Nicho_largura, 0.56) }); }
  });

  /* ---------- cooktop de indução 4 bocas (avulso, de embutir) */
  defEq({
    id: "ele-eq-cooktop-inducao", nome: "Cooktop de indução 4 bocas (de embutir)", ids: ["eq_cooktop_inducao_4b"],
    descricao: "Cooktop de indução de 4 bocas para embutir no tampo: vidro preto de 6 mm sobre o tampo, quatro zonas de anéis impressos, filete de inox na frente, faixa de comando por toque e o corpo abaixo do tampo. Origem: no tampo (Altura_tampo), no meio da largura, FUNDO em Z = 0, frente em +Z. Conector `el` onde o cabo sai, atrás embaixo. Sem a bancada (o cooktop da bancada de cozinha é o ra-coz-inferior).",
    op: { W: 0.59, H: 0.055, D: 0.52, apoio: { nome: "Altura_tampo", padrao: 0.90, desc: "Do piso ao tampo onde o cooktop é embutido (usual 0,90 m)" } },
    conector: con("el", "Cabo de força (atrás, embaixo)", 25, "Largura/2-0.08", "Altura_tampo-0.03", "0", D_FUNDO),
    tipos: [tipoEq("i4", "Cooktop de indução 4 bocas (7.000 W, 220 V)", "eq_cooktop_inducao_4b", dimsEq("eq_cooktop_inducao_4b"))],
    gerar: function (c, v) { G.cooktop(c, { W: num(v.Largura, 0.59), H: num(v.Altura, 0.055), D: num(v.Profundidade, 0.52), yt: num(v.Altura_tampo, 0.9) }); }
  });

  /* ---------- coifa de parede | depurador, 60 | 90 cm */
  function tCoifa(id, nome, cat, forma, cm) {
    var ex = merge(dimsEq(cat), { Forma: forma, Largura_cm: cm });
    var v = valoresEq(cat, ex);
    if (forma === "depurador") { v.Altura = 0.15; v.Cotas_a_conferir += "; altura do depurador: sem-fonte-conferir (o catálogo L1 dá 600 mm para a coifa de parede; o depurador slim usual tem ≈ 150 mm)"; }
    v.Altura_ponto_m = 2.0;
    return T(id, nome, v, fonteDe(cat));
  }
  defEq({
    id: "ele-eq-coifa", nome: "Coifa de parede e depurador", ids: ["eq_coifa_60", "eq_coifa_90"],
    descricao: "Coifa de PAREDE (capelo em trapézio de inox com chaminé, filtro metálico, lâmpadas e botões) ou DEPURADOR slim (corpo baixo, painel retrátil, filtro e saída de ar de 150 mm), 60 ou 90 cm. Origem: na face da parede, no meio da largura, FUNDO em Z = 0; Altura_instalacao = a borda de baixo (usual 0,65-0,75 m acima do cooktop). Conector `el` atrás da chaminé/do corpo.",
    op: { W: 0.6, H: 0.6, D: 0.5, apoio: { nome: "Altura_instalacao", padrao: 1.60, desc: "Do piso à borda de baixo da coifa (cooktop a 0,90 m + 0,65-0,75 m)" },
      extra: [Pf("Forma", "texto", "parede", "Dimensões", "parede (capelo + chaminé) ou depurador (slim)"), Pf("Largura_cm", "inteiro", 60, "Dimensões", "Largura nominal em cm (60 ou 90) — o nome do catálogo L1")] },
    conector: con("el", "Cabo de força (atrás, no alto)", 25, "0", "Altura_instalacao+Altura-0.1", "0", D_FUNDO),
    tipos: [tCoifa("par60", "Coifa de parede 60 cm (200 W)", "eq_coifa_60", "parede", 60), tCoifa("par90", "Coifa de parede 90 cm (250 W)", "eq_coifa_90", "parede", 90),
      tCoifa("dep60", "Depurador 60 cm (200 W)", "eq_coifa_60", "depurador", 60), tCoifa("dep90", "Depurador 90 cm (250 W)", "eq_coifa_90", "depurador", 90)],
    gerar: function (c, v) { G.coifa(c, { forma: txt(v.Forma), W: num(v.Largura, 0.6), H: num(v.Altura, 0.6), D: num(v.Profundidade, 0.5), yb: num(v.Altura_instalacao, 1.6) }); }
  });

  /* ---------- lava-louças 8 | 14 serviços */
  defEq({
    id: "ele-eq-lava-loucas", nome: "Lava-louças (8 e 14 serviços)", ids: ["eq_lava_loucas_8", "eq_lava_loucas_14"],
    descricao: "Lava-louças de 8 serviços (compacta, para bancada: informe a Altura_apoio) ou 14 serviços (no piso): corpo, faixa de comando com visor e teclas, porta com alça-barra, junta, rodapé recuado (14) ou pés (8). Origem: no apoio, no meio da largura, FUNDO em Z = 0, frente em +Z. Conector `el` onde o cabo sai, atrás.",
    op: { W: 0.6, H: 0.85, D: 0.6, acab: "inox", apoio: { nome: "Altura_apoio", padrao: 0, desc: "Do piso ao apoio (0 = no piso; a de 8 serviços sobre a bancada: 0,90 m)" } },
    conector: con("el", "Cabo de força (atrás, embaixo à direita)", 25, "Largura/2-0.08", "Altura_apoio+0.1", "0", D_FUNDO),
    tipos: [tipoEq("s8", "Lava-louças 8 serviços (1.500 W)", "eq_lava_loucas_8", dimsEq("eq_lava_loucas_8")), tipoEq("s14", "Lava-louças 14 serviços (1.500 W)", "eq_lava_loucas_14", dimsEq("eq_lava_loucas_14"))],
    gerar: function (c, v) { G.lavaLoucas(c, { W: num(v.Largura, 0.6), H: num(v.Altura, 0.85), D: num(v.Profundidade, 0.6), y0: num(v.Altura_apoio, 0), acab: txt(v.Acabamento) }); }
  });

  /* ---------- secadora e lava e seca */
  defEq({
    id: "ele-eq-secadora", nome: "Secadora de roupas", ids: ["eq_secadora"],
    descricao: "Secadora de roupas de carga frontal 600 × 850 × 650 mm: corpo branco, faixa de comando (visor, seletor, teclas), escotilha redonda com anel de cromo e vidro, ventilação do pé e pés. Origem: no piso, no meio da largura, FUNDO em Z = 0, frente em +Z. Conector `el` onde o cabo sai, atrás.",
    op: { W: 0.6, H: 0.85, D: 0.65, apoio: { nome: "Altura_apoio", padrao: 0, desc: "Do piso ao apoio (0 = no piso)" } },
    conector: con("el", "Cabo de força (atrás, embaixo à direita)", 25, "Largura/2-0.1", "Altura_apoio+0.12", "0", D_FUNDO),
    tipos: [tipoEq("s35", "Secadora (3.500 W, 220 V)", "eq_secadora", dimsEq("eq_secadora"))],
    gerar: function (c, v) { G.secadora(c, { W: num(v.Largura, 0.6), H: num(v.Altura, 0.85), D: num(v.Profundidade, 0.65), y0: num(v.Altura_apoio, 0), lavaseca: false }); }
  });
  defEq({
    id: "ele-eq-lava-seca", nome: "Lava e seca", ids: ["eq_lava_e_seca"],
    descricao: "Lava e seca de carga frontal 600 × 850 × 650 mm: como a secadora, com a escotilha maior e a gaveta de sabão na faixa de comando. Origem: no piso, no meio da largura, FUNDO em Z = 0, frente em +Z. Conector `el` onde o cabo sai, atrás. A mangueira de entrada e o esgoto são do hidrossanitário.",
    op: { W: 0.6, H: 0.85, D: 0.65, apoio: { nome: "Altura_apoio", padrao: 0, desc: "Do piso ao apoio (0 = no piso)" } },
    conector: con("el", "Cabo de força (atrás, embaixo à direita)", 25, "Largura/2-0.1", "Altura_apoio+0.12", "0", D_FUNDO),
    tipos: [tipoEq("ls25", "Lava e seca (2.500 W, 220 V)", "eq_lava_e_seca", dimsEq("eq_lava_e_seca"))],
    gerar: function (c, v) { G.secadora(c, { W: num(v.Largura, 0.6), H: num(v.Altura, 0.85), D: num(v.Profundidade, 0.65), y0: num(v.Altura_apoio, 0), lavaseca: true }); }
  });

  /* ---------- freezer horizontal | vertical */
  defEq({
    id: "ele-eq-freezer", nome: "Freezer (horizontal e vertical)", ids: ["eq_freezer_horizontal"],
    descricao: "Freezer HORIZONTAL (caixa com tampa articulada, alça na frente, dobradiças atrás, seletor de temperatura e LED) ou VERTICAL (porta única com alça vertical, seletor no topo e grade inferior), com pés. O catálogo L1 só tem o horizontal; o vertical é desenho usual (sem-fonte-conferir). Origem: no piso, no meio da largura, FUNDO em Z = 0, frente em +Z. Conector `el` onde o cabo sai, atrás.",
    op: { W: 1.0, H: 0.85, D: 0.65, apoio: { nome: "Altura_apoio", padrao: 0, desc: "Do piso ao apoio (0 = no piso)" }, extra: [Pf("Vertical", "simnao", false, "Dimensões", "Freezer vertical (porta única) em vez do horizontal (tampa)")] },
    conector: con("el", "Cabo de força (atrás, embaixo à direita)", 25, "Largura/2-0.1", "Altura_apoio+0.1", "0", D_FUNDO),
    tipos: [tipoEq("horiz", "Freezer horizontal (400 W)", "eq_freezer_horizontal", merge(dimsEq("eq_freezer_horizontal"), { Vertical: false })),
      (function () {
        var v = valoresEq("eq_freezer_horizontal", { Largura: 0.6, Altura: 1.7, Profundidade: 0.7, Vertical: true });
        v.Cotas_a_conferir += "; freezer vertical: o catálogo L1 só tem o horizontal — as cotas 600 × 1.700 × 700 mm são usuais, sem-fonte-conferir; a potência 400 W foi reaproveitada do horizontal";
        return T("vert", "Freezer vertical (porta única)", v, fonteDe("eq_freezer_horizontal"));
      })()],
    gerar: function (c, v) { G.freezer(c, { W: num(v.Largura, 1), H: num(v.Altura, 0.85), D: num(v.Profundidade, 0.65), y0: num(v.Altura_apoio, 0), vertical: sim(v, "Vertical") }); }
  });

  /* ---------- torneira elétrica */
  defEq({
    id: "ele-eq-torneira-eletrica", nome: "Torneira elétrica de parede", ids: ["eq_torneira_eletrica"],
    descricao: "Torneira elétrica de parede: flange, corpo do aquecedor, seletor de temperatura, LED de funcionamento e bico de cromo com arejador. Origem: na face da parede, no meio, frente em +Z; Altura de montagem = o centro do corpo. Conector `el` atrás da flange. A alimentação de água é do hidrossanitário.",
    op: { W: 0.11, H: 0.25, D: 0.2, apoio: { nome: "Altura_montagem", padrao: 1.10, desc: "Do piso ao centro do corpo da torneira (usual: 1,00-1,20 m sobre a pia)" } },
    conector: con("el", "Cabo de força (atrás da flange)", 25, "0", "Altura_montagem", "0", D_FUNDO),
    tipos: [tipoEq("e55", "Torneira elétrica (5.500 W, 220 V)", "eq_torneira_eletrica", dimsEq("eq_torneira_eletrica"))],
    gerar: function (c, v) { G.torneiraEletrica(c, { W: num(v.Largura, 0.11), H: num(v.Altura, 0.25), P: num(v.Profundidade, 0.2), A: num(v.Altura_montagem, 1.1) }); }
  });

  /* ---------- TV de parede 50" */
  defEq({
    id: "ele-eq-tv", nome: "TV de parede 50\"", ids: ["eq_tv_50"],
    descricao: "TV de 50\" na parede com suporte: corpo fino com a costela atrás, moldura fina e tela de vidro, LED na base. Origem: na face da parede, no meio da largura, frente em +Z; Altura de montagem = o centro da tela. Conector `el` atrás, no canto direito, embaixo. O ponto de rede/antena é do projeto de dados.",
    op: { W: 1.12, H: 0.65, D: 0.06, apoio: { nome: "Altura_montagem", padrao: 1.30, desc: "Do piso ao centro da tela (usual 1,10-1,40 m)" } },
    conector: con("el", "Cabo de força (atrás, embaixo à direita)", 20, "Largura/2-0.12", "Altura_montagem-Altura/2+0.06", "0", D_FUNDO),
    tipos: [tipoEq("t50", "TV 50\" com suporte (150 W)", "eq_tv_50", dimsEq("eq_tv_50"))],
    gerar: function (c, v) { G.tv(c, { W: num(v.Largura, 1.12), H: num(v.Altura, 0.65), D: num(v.Profundidade, 0.06), A: num(v.Altura_montagem, 1.3) }); }
  });

  /* ---------- motor de portão deslizante */
  defEq({
    id: "ele-eq-motor-portao", nome: "Motor de portão deslizante", ids: ["eq_motor_portao"],
    descricao: "Motor de portão deslizante de 1/2 CV: chapa de base com chumbadores, carcaça com tampa, cremalheira que atravessa o motor, fechadura de destravamento e LED. Origem: no piso (Altura_apoio = o topo da base de concreto), no meio da largura, FUNDO em Z = 0 (contra o muro). Conector `el` onde o cabo sai, atrás. O trilho/portão é da esquadria.",
    op: { W: 0.25, H: 0.27, D: 0.18, apoio: { nome: "Altura_apoio", padrao: 0, desc: "Do piso ao topo da base onde o motor é chumbado (0 = no piso)" } },
    conector: con("el", "Cabo de força (atrás, embaixo)", 25, "Largura/2-0.05", "Altura_apoio+0.04", "0", D_FUNDO),
    tipos: [tipoEq("m05", "Motor de portão 1/2 CV (370 W)", "eq_motor_portao", dimsEq("eq_motor_portao"))],
    gerar: function (c, v) { G.motorPortao(c, { W: num(v.Largura, 0.25), H: num(v.Altura, 0.27), D: num(v.Profundidade, 0.18), yb: num(v.Altura_apoio, 0) }); }
  });

  /* o registro: entra na biblioteca (FamiliasMob → FamiliasRA) */
  if (FM && FM.registrar) FM.registrar();

  var EleFamilias2 = {
    ids: function () { return LISTA_ID.slice(); },
    catalogoDe: function (id) { return arr(CAT_IDS[id]).slice(); },
    obter: function (id) { return FM.obter(id); },
    tiposDe: function (id) { var f = FM.obter(id); return f ? f.tipos : []; }
  };
  global.EleFamilias2 = EleFamilias2;
  if (typeof module !== "undefined" && module.exports) module.exports = EleFamilias2;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

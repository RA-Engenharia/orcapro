/* =====================================================================
 * elefamilias.js — FAMÍLIAS ELÉTRICAS v2 com as cotas do catálogo real (lote L2a, 06/11/2026)
 *
 * Pedido do Rogério (06/11/2026): "versão atualizada da elétrica, igual ao hidrossanitário" — caixas 4×2, 4×4 e octogonal (PVC amarela e
 * metálica), tampas, placas, disjuntor, DR, DPS e o quadro montado com os dispositivos do projeto, TUDO igual ao produto de loja.
 *
 * COMO FUNCIONA. São famílias do js/familia.js com `geometria: "mob"` (o mesmo caminho do js/familiasluz.js): os parâmetros, os tipos
 * e o quantitativo são os de qualquer família (Propriedades, tipo, instância); a malha sai dos geradores de js/elefamiliasgeo.js, e as
 * famílias entram na biblioteca por FamiliasRA.registrar (via FamiliasMob.registrar). NÃO substitui nada: `ra-tomada`, `ra-interruptor`,
 * `ra-quadro-distribuicao` ficam como estão (projeto gravado abre igual). Os ids novos: ele-caixa-4x2, ele-caixa-4x4, ele-caixa-octogonal,
 * ele-placa-4x2, ele-placa-4x4, ele-tampa-octogonal, ele-disjuntor, ele-dr, ele-dps, ele-barramento-pente, ele-trilho-din,
 * ele-barramento-neutro, ele-barramento-terra, ele-quadro.
 *
 * DE ONDE VÊM OS NÚMEROS: SÓ do js/elecatalogodados.js (EleCatalogoDados — gerado de dados-fonte/eletrica/catalogo/*.json). Cada tipo
 * guarda `Item_catalogo` (o id do item), `Fonte` (documento e página) e `Nivel_fonte` (a pior fonte entre as cotas que ele usa); o
 * que é interpretação ou valor usual está dito na descrição do parâmetro. tools/test-ele-familias-v2.js confere que cada cota de cada
 * tipo é a do catálogo (com controle negativo).
 *
 * O QUADRO MONTADO PELO PROJETO: EleFamilias.montarQuadro(projeto) lê o Projeto_eletrico gravado pelo js/elecircuitos.js e devolve os
 * itens na ordem da fileira (geral → DPS → DR → disjuntores do DR → circuitos sem DR → reserva com tampa cega). A família ele-quadro
 * desenha esses itens. A troca do lançamento (ra-quadro-distribuicao → ele-quadro no elecircuitos) FICA PARA O L6 — os testes do
 * elecircuitos fixam o id antigo —, mas o ele-quadro já lê os MESMOS parâmetros (Material_quadro, Instalacao, Disjuntores, Corrente,
 * Projeto_eletrico) e tem mep.peca "quadro": o orçamento e o eletroduto no quadro funcionam sem mudar nada.
 *
 * SINAPI: EleFamilias.sinapi(famId, valores) casa a peça com os códigos que JÁ existem (BimInstSinapi, EleTabelas.SINAPI) e devolve
 * { status: "ok" | "provisorio" | "pendente", codigo, … }. Sem código na base → pendente, nunca o parecido.
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
  var G = dep("EleFamiliasGeo", "elefamiliasgeo.js");
  var Cat = dep("EleCatalogoDados", "elecatalogodados.js");
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------ O CATÁLOGO (nunca zero em silêncio: cota que falta = erro na carga) */
  function item(id) { var x = Cat && Cat.item(id); if (!x) throw new Error("catálogo elétrico (L1) sem o item \"" + id + "\""); return x; }
  function cotaMM(id, nome) { var x = Cat && Cat.cota(id, nome); if (!x) throw new Error("catálogo elétrico (L1): o item \"" + id + "\" não tem a cota \"" + nome + "\""); return x.valor; }
  function cotaM(id, nome) { return cotaMM(id, nome) / 1000; }
  function cotaOr(id, nome, padraoMM) { var x = Cat && Cat.cota(id, nome); return (x ? x.valor : padraoMM) / 1000; }
  var ORDEM_NIVEL = { "primaria-lida": 0, "secundaria-lida": 1, "decisao-RA": 2, "sem-fonte-conferir": 3 };
  /* o pior nível entre as cotas do item que a família USA (as dadas em `nomes`; sem `nomes`, todas) */
  function nivelDe(ids, nomes) {
    var pior = "primaria-lida", lista = [], det = [];
    arr(ids).forEach(function (id) {
      var it = item(id);
      Object.keys(it.cotas).forEach(function (k) {
        if (nomes && nomes.indexOf(k) < 0) return;
        var n = Cat.cota(id, k).nivel;
        if ((ORDEM_NIVEL[n] || 0) > (ORDEM_NIVEL[pior] || 0)) pior = n;
        if (n !== "primaria-lida") det.push(k + ": " + n);
      });
      lista.push(it.fonte.nivel);
    });
    return { nivel: pior, detalhe: det };
  }
  function fonteDe(ids) {
    return arr(ids).map(function (id) { var it = item(id); return it.fonte.doc + (it.fonte.pagina ? " p." + it.fonte.pagina : "") + " [" + it.fonte.nivel + "]"; }).join(" | ");
  }

  /* ------------------------------------------------ PARÂMETROS */
  var P = FM.P, T = FM.T;
  function Pf(nome, tipoDado, valor, grupo, descricao, escopo) { return P(nome, tipoDado, valor, grupo, descricao, escopo); }
  function paramFonte() {
    return [
      Pf("Item_catalogo", "texto", "", "Fonte", "Id do item no catálogo elétrico da RA (dados-fonte/eletrica/catalogo), de onde saem as cotas do tipo"),
      Pf("Fonte", "texto", "", "Fonte", "Documento e página do fabricante (nível entre colchetes: primaria-lida, secundaria-lida, sem-fonte-conferir)"),
      Pf("Nivel_fonte", "texto", "", "Fonte", "A pior fonte entre as cotas usadas: primaria-lida · secundaria-lida · sem-fonte-conferir (valor usual, NÃO usar em projeto assinado)"),
      Pf("Cotas_a_conferir", "texto", "", "Fonte", "As cotas do tipo que NÃO são de ficha primária (nome: nível); vazio = todas primárias")
    ];
  }
  /* valores de fonte de um tipo */
  function vFonte(ids, nomes) {
    var n = nivelDe(ids, nomes);
    return { Item_catalogo: arr(ids)[0], Fonte: fonteDe(ids), Nivel_fonte: n.nivel, Cotas_a_conferir: n.detalhe.join("; ") };
  }
  function tipo(id, nome, valores, ids) {
    var t = T(id, nome, valores, fonteDe(ids));
    return t;
  }
  var LISTA_ID = [];
  var MODEL = " (modelagem RA — a ficha não publica)";

  /* o conector elétrico: sistema "eletrica", DN do eletroduto e a direção em que o tubo chega */
  function con(id, nome, x, y, z, dir, op) {
    var o = { id: id, nome: nome, sistema: "eletrica", dn: "Entrada_DN", x: x, y: y, z: z, papel: "entrada", dir: dir, origemPos: "catalogo" };
    if (op) o.opcional = true;
    return o;
  }
  function def(o) {
    var fam = FM.def({ id: o.id, nome: o.nome, categoria: o.categoria || "dispositivo_eletrico", descricao: o.descricao, semOrigem: true, parametros: o.parametros, tipos: o.tipos, gerar: o.gerar, quantDesc: o.nome });
    fam.descricao = o.descricao;
    fam.disciplina = "eletrica";
    if (o.mep) fam.mep = { peca: o.mep };
    if (o.conectores) fam.conectores = o.conectores;
    fam.quantitativo = { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: o.nome };
    fam.catalogo = { ids: o.ids || [] };
    LISTA_ID.push(o.id);
    return fam;
  }
  function sim(v, nome) { return v[nome] === true; }

  /* =====================================================================
   * 1. CAIXAS DE EMBUTIR (4×2, 4×4) — PVC amarela (Tigre) e metálica estampada
   * ===================================================================== */
  var NOM = 4 * 25.4;   /* 101,6 mm: o lado nominal de 4 polegadas */
  function paramsCaixa(extra) {
    return [
      Pf("Material_caixa", "texto", "PVC", "Materiais", "PVC (antichama, amarela) ou Metalica (chapa estampada, galvanizada): muda a aparência e a composição SINAPI"),
      Pf("Material", "material", "pvc amarelo caixa", "Materiais", "Material do corpo (nome do 3D); a metálica usa o aço galvanizado estampado"),
      Pf("Largura", "comprimento", 0.07, "Dimensões", "Largura do corpo — catálogo"),
      Pf("Altura", "comprimento", 0.1085, "Dimensões", "Altura total, com as orelhas — catálogo"),
      Pf("Profundidade", "comprimento", 0.0475, "Dimensões", "Profundidade — catálogo"),
      Pf("Parede", "comprimento", 0.002, "Dimensões", "Espessura da parede (PVC) ou da chapa (metálica) — a ficha da caixa PVC NÃO publica a espessura: valor usual, a conferir"),
      Pf("Dist_furos", "comprimento", 0.0835, "Dimensões", "Distância entre os furos das orelhas (parafusos do suporte), na vertical — catálogo; metálica: usual (83,5), a conferir"),
      Pf("Dist_furos_h", "comprimento", 0, "Dimensões", "Distância horizontal entre os furos (4×4: 45 mm do catálogo); 0 = um furo por orelha"),
      Pf("Orelha_sai", "comprimento", 0, "Dimensões", "Quanto a orelha passa do corpo nominal de 4″ (4×2 PVC: (108,5 − 101,6) ÷ 2) — interpretação do desenho da ficha"),
      Pf("Entrada_DN", "inteiro", 25, "Elétrica", "DN do eletroduto que entra (20 = 1/2″, 25 = 3/4″): o tampão pré-cortado tem DN + 2 mm", "instancia"),
      Pf("Altura_montagem", "comprimento", 0.30, "Restrições", "Do piso ao centro da caixa: a SINAPI separa baixa (0,30 m), média (1,30 m) e alta (2,00 m)", "instancia"),
      Pf("Circuito", "texto", "", "Elétrica", "Circuito de proteção no quadro (informativo)", "instancia")
    ].concat(extra || [], paramFonte());
  }
  function conectoresCaixa() {
    return [con("el", "Eletroduto (fundo)", "0", "Altura_montagem", "-Profundidade", { x: 0, y: 0, z: -1 }),
      con("el_e", "Eletroduto (lateral esquerda)", "-Largura/2", "Altura_montagem", "-Profundidade/2", { x: -1, y: 0, z: 0 }, true),
      con("el_d", "Eletroduto (lateral direita)", "Largura/2", "Altura_montagem", "-Profundidade/2", { x: 1, y: 0, z: 0 }, true)];
  }
  function gerarCaixa(kind) {
    return function (c, v) {
      var metal = /^metal/i.test(txt(v.Material_caixa)), oel = metal ? 0 : Math.max(0, num(v.Orelha_sai, 0));
      var W = Math.max(0.03, num(v.Largura, 0.07)), H = Math.max(0.05, num(v.Altura, 0.1085)) - 2 * oel, D = Math.max(0.02, num(v.Profundidade, 0.0475)), t = Math.min(0.006, Math.max(0.0008, num(v.Parede, 0.002)));
      G.caixaRet(c, { W: W, H: H, D: D, t: t, yc: num(v.Altura_montagem, 0.3), orelha: oel, furoV: num(v.Dist_furos, 0.0835), furoH: num(v.Dist_furos_h, 0), metal: metal,
        dn: num(v.Entrada_DN, 25), kind: kind, mat: metal ? G.MAT.GALV : (txt(v.Material) || G.MAT.PVC_AM) });
    };
  }
  function tipoCaixa(id, nome, cat, extra) {
    var it = item(cat), v = vFonte([cat], null), metal = /metal/.test(cat);
    var base = { Material_caixa: metal ? "Metalica" : "PVC", Material: metal ? G.MAT.GALV : (cat === "cx_4x4_pvc_wavin" ? G.MAT.PVC : G.MAT.PVC_AM),
      Largura: cotaM(cat, "largura_mm"), Altura: cotaM(cat, "altura_mm"), Profundidade: cotaM(cat, "profundidade_mm"),
      Parede: metal ? cotaM(cat, "chapa_mm") : cotaOr(cat, "parede_mm", 2), Dist_furos: cotaOr(cat, "dist_furos_orelha_mm", 83.5), Dist_furos_h: cotaOr(cat, "dist_furos_orelha_horizontal_mm", 0) };
    Object.keys(v).forEach(function (k) { base[k] = v[k]; });
    if (!metal && !Cat.cota(cat, "parede_mm")) base.Cotas_a_conferir = (base.Cotas_a_conferir ? base.Cotas_a_conferir + "; " : "") + "parede_mm: sem-fonte-conferir (a ficha não publica; usual 2 mm)";
    Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
    void it;
    return tipo(id, nome, base, [cat]);
  }
  var famCx42 = def({
    id: "ele-caixa-4x2", nome: "Caixa de luz 4×2 (embutir)", mep: "caixa_4x2", ids: ["cx_4x2_pvc", "cx_4x2_metal"], conectores: conectoresCaixa(),
    descricao: "Caixa de luz 4×2 de embutir (tomada, interruptor, ponto). Corpo OCO com a parede de verdade (de frente se vê o fundo), orelhas com o furo do parafuso do suporte a 83,5 mm, tampões pré-cortados no fundo, nas laterais, no topo e na base (DN + 2 mm) e nervuras. PVC amarela (Tigre Tigreflex) ou metálica estampada. Origem: na face da parede, no centro da caixa; o corpo fica atrás e a boca abre para +Z. A SINAPI orça pelo material e pela altura (baixa, média, alta).",
    parametros: paramsCaixa(),
    tipos: [tipoCaixa("pvc", "PVC amarela 4×2 (Tigre)", "cx_4x2_pvc", { Orelha_sai: (cotaMM("cx_4x2_pvc", "altura_mm") - NOM) / 2 / 1000 }),
            tipoCaixa("metal", "Metálica estampada 4×2 (galvanizada)", "cx_4x2_metal")],
    gerar: gerarCaixa("4x2")
  });
  var famCx44 = def({
    id: "ele-caixa-4x4", nome: "Caixa de luz 4×4 (embutir)", mep: "caixa_4x4", ids: ["cx_4x4_pvc", "cx_4x4_pvc_wavin", "cx_4x4_metal"], conectores: conectoresCaixa(),
    descricao: "Caixa de luz 4×4 de embutir (dois a seis módulos na placa 4×4). Corpo OCO, quatro pinos de parafuso (83,5 mm na vertical e 45 mm na horizontal, catálogo Tigre), tampões pré-cortados no fundo, nas laterais, no topo e na base. PVC amarela (Tigre), PVC (Amanco Wavin, eletroduto rígido) ou metálica estampada. Origem: na face da parede, no centro da caixa; o corpo fica atrás e a boca abre para +Z.",
    parametros: paramsCaixa(),
    tipos: [tipoCaixa("pvc", "PVC amarela 4×4 (Tigre)", "cx_4x4_pvc"),
            tipoCaixa("wavin", "PVC 4×4 (Amanco Wavin, eletroduto rígido)", "cx_4x4_pvc_wavin"),
            tipoCaixa("metal", "Metálica estampada 4×4 (galvanizada)", "cx_4x4_metal", { Dist_furos: 0.0835, Dist_furos_h: 0.045 })],
    gerar: gerarCaixa("4x4")
  });

  /* =====================================================================
   * 2. CAIXA OCTOGONAL (laje, fundo móvel)
   * ===================================================================== */
  function paramsOct() {
    return [
      Pf("Material_caixa", "texto", "PVC", "Materiais", "PVC (antichama, amarela) ou Metalica (chapa estampada, galvanizada)"),
      Pf("Material", "material", "pvc amarelo caixa", "Materiais", "Material do corpo (nome do 3D)"),
      Pf("Diametro_total", "comprimento", 0.1056, "Dimensões", "Diâmetro de ponta a ponta das orelhas (cota A da ficha Tigre); metálica: o diâmetro do catálogo"),
      Pf("Diametro_corpo", "comprimento", 0.0855, "Dimensões", "Diâmetro do corpo (cota B da ficha Tigre — interpretação: a ficha não traz legenda; a imagem da vista lateral dá o corpo); metálica: entre faces"),
      Pf("Profundidade", "comprimento", 0.0605, "Dimensões", "Profundidade — catálogo (cota C)"),
      Pf("Parede", "comprimento", 0.002, "Dimensões", "Espessura da parede / da chapa — PVC: usual, a ficha não publica; metálica: catálogo (chapa)"),
      Pf("Fundo_recuo", "comprimento", 0, "Dimensões", "Quanto o FUNDO MÓVEL desceu da posição de fábrica (0 = no fundo): o fundo se destaca e reduz a profundidade útil", "instancia"),
      Pf("Entrada_DN", "inteiro", 25, "Elétrica", "DN do eletroduto que entra (20 ou 25): o tampão pré-cortado tem DN + 2 mm", "instancia"),
      Pf("Altura_montagem", "comprimento", 2.60, "Restrições", "Do piso à face de baixo da laje ou do forro (a boca da caixa)", "instancia"),
      Pf("Aplicacao", "texto", "laje", "Elétrica", "laje ou forro (a SINAPI orça só laje: o forro usa a de laje)", "instancia"),
      Pf("Circuito", "texto", "", "Elétrica", "Circuito de proteção no quadro (informativo)", "instancia")
    ].concat(paramFonte());
  }
  function tipoOct(id, nome, cat, corpoNome, extra) {
    var metal = /metal/.test(cat), v = vFonte([cat], null);
    var base = { Material_caixa: metal ? "Metalica" : "PVC", Material: metal ? G.MAT.GALV : G.MAT.PVC_AM, Profundidade: cotaM(cat, "profundidade_mm"), Parede: metal ? cotaM(cat, "chapa_mm") : 0.002 };
    if (cat === "cx_oct_4x4_fundo_movel") { base.Diametro_total = cotaM(cat, "diametro_externo_mm"); base.Diametro_corpo = cotaM(cat, corpoNome); }
    else if (cat === "cx_oct_3x3_anel") { base.Diametro_total = cotaM(cat, "dim_A_mm"); base.Diametro_corpo = cotaM(cat, corpoNome); }
    else { base.Diametro_total = cotaM(cat, "diametro_externo_mm"); base.Diametro_corpo = base.Diametro_total; }
    Object.keys(v).forEach(function (k) { base[k] = v[k]; });
    Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
    return tipo(id, nome, base, [cat]);
  }
  var famOct = def({
    id: "ele-caixa-octogonal", nome: "Caixa octogonal 4×4 (laje)", mep: "caixa_octogonal", ids: ["cx_oct_4x4_fundo_movel", "cx_oct_3x3_anel", "cx_oct_4x4_metal"],
    conectores: [con("el", "Eletroduto (fundo móvel, por cima)", "0", "Altura_montagem + Profundidade", "0", { x: 0, y: 1, z: 0 }),
      con("el_l1", "Eletroduto (lateral +Z)", "0", "Altura_montagem + Profundidade*0.55", "Diametro_corpo/2", { x: 0, y: 0, z: 1 }, true),
      con("el_l2", "Eletroduto (lateral −Z)", "0", "Altura_montagem + Profundidade*0.55", "-Diametro_corpo/2", { x: 0, y: 0, z: -1 }, true)],
    descricao: "Caixa octogonal de embutir na laje (ponto de teto, luminária, caixa de passagem do forro). Corpo OCO, orelhas com o furo do parafuso, FUNDO MÓVEL (parâmetro Fundo_recuo), tampões pré-cortados no fundo (quatro, em losango) e na lateral (seis, sem tapar as orelhas). PVC amarela (Tigre fundo móvel e 3×3 com anel) ou metálica estampada de oito faces. Origem: na face de baixo da laje, no centro; a boca abre para BAIXO e o corpo sobe para dentro da laje. A lingueta da octogonal não serve para ventilador (nota da ficha Tigre).",
    parametros: paramsOct(),
    tipos: [tipoOct("pvc", "PVC amarela 4×4 fundo móvel (Tigre)", "cx_oct_4x4_fundo_movel", "dim_B_mm"),
            tipoOct("pvc3", "PVC amarela 3×3 com anel deslizante (Tigre)", "cx_oct_3x3_anel", "dim_B_mm"),
            tipoOct("metal", "Metálica estampada 4×4 (galvanizada)", "cx_oct_4x4_metal")],
    gerar: function (c, v) {
      var metal = /^metal/i.test(txt(v.Material_caixa));
      G.caixaOct(c, { Dc: Math.max(0.05, num(v.Diametro_corpo, 0.0855)), Dt: metal ? num(v.Diametro_corpo, 0.0855) : num(v.Diametro_total, 0.1056), D: Math.max(0.03, num(v.Profundidade, 0.0605)),
        t: Math.min(0.006, Math.max(0.0008, num(v.Parede, 0.002))), yc: num(v.Altura_montagem, 2.6), recuo: num(v.Fundo_recuo, 0), metal: metal, dn: num(v.Entrada_DN, 25),
        mat: metal ? G.MAT.GALV : (txt(v.Material) || G.MAT.PVC_AM) });
    }
  });

  /* =====================================================================
   * 3. PLACAS e TAMPA
   * ===================================================================== */
  var PASSO_POSTO = 0.0305, LINHA_4X4 = 0.0456;   /* passo do módulo e das duas linhas da 4×4: os mesmos do ra-tomada (PLACA_PARAMS, js/familiasra.js) */
  function paramsPlaca(postos) {
    return [
      Pf("Postos", "inteiro", postos, "Elétrica", "Número de postos (módulos) da placa; 0 = placa cega"),
      Pf("Placa_L", "comprimento", 0.12, "Dimensões", "Lado MAIOR da placa — catálogo"),
      Pf("Placa_A", "comprimento", 0.083, "Dimensões", "Lado MENOR da placa — catálogo"),
      Pf("Espessura", "comprimento", 0.0025, "Dimensões", "Espessura da placa (sem fonte: usual — conferir)"),
      Pf("Passo_posto", "comprimento", PASSO_POSTO, "Dimensões", "Distância entre os centros de dois postos (30,5 mm, a mesma da ra-tomada)"),
      Pf("Janela_L", "comprimento", 0.0265, "Dimensões", "Largura do rebaixo do posto (módulo 25 mm + folga)" + MODEL),
      Pf("Janela_A", "comprimento", 0.0515, "Dimensões", "Altura do rebaixo do posto (módulo 50 mm + folga)" + MODEL),
      Pf("Afastados", "simnao", false, "Dimensões", "2 postos AFASTADOS (placa de duas caixas): os postos ficam a um quarto da largura do centro"),
      Pf("Modulo_preenchido", "texto", "cego", "Elétrica", "cego (módulo cego no posto: a placa como sai da loja) ou vazio (o rebaixo escuro, sem módulo)", "instancia"),
      Pf("Altura_montagem", "comprimento", 0.30, "Restrições", "Do piso ao centro da placa", "instancia"),
      Pf("Material", "material", "plástico branco", "Materiais", "Termoplástico branco")
    ].concat(paramFonte());
  }
  function tipoPlaca(id, nome, cat, postos, extra) {
    var v = vFonte([cat], null);
    var base = { Postos: postos, Placa_L: cotaM(cat, "largura_mm"), Placa_A: cotaM(cat, "altura_mm"), Espessura: cotaM(cat, "espessura_mm") };
    Object.keys(v).forEach(function (k) { base[k] = v[k]; });
    Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
    return tipo(id, nome, base, [cat]);
  }
  /* centros dos postos [[x, y]…] e o lado da placa na posição de uso */
  function layoutPlaca(kind, v) {
    var n = Math.max(0, Math.round(num(v.Postos, 0))), L = num(v.Placa_L, 0.12), A = num(v.Placa_A, 0.083), pas = num(v.Passo_posto, PASSO_POSTO), pos = [], k;
    if (kind === "4x2") {
      if (n <= 1) { if (n === 1) pos.push([0, 0]); return { w: A, h: L, postos: pos }; }   /* em pé */
      var esp = sim(v, "Afastados") ? L / 4 * (n === 2 ? 1 : 1) : pas;
      for (k = 0; k < n; k++) pos.push([(k - (n - 1) / 2) * (sim(v, "Afastados") && n === 2 ? L / 2 : pas), 0]);
      void esp;
      return { w: L, h: A, postos: pos };   /* deitada */
    }
    var cols = Math.max(1, Math.ceil(n / 2)), r, cc;
    for (k = 0; k < n; k++) { r = Math.floor(k / cols); cc = k - cols * r; var nl = Math.min(cols, n - cols * r); pos.push([(cc - (nl - 1) / 2) * pas, LINHA_4X4 / 2 * (1 - 2 * r)]); }
    return { w: L, h: A, postos: pos };
  }
  function gerarPlaca(kind) {
    return function (c, v) {
      var Ly = layoutPlaca(kind, v);
      G.placa(c, { w: Ly.w, h: Ly.h, e: Math.max(0.0012, num(v.Espessura, 0.0025)), yc: num(v.Altura_montagem, 0.3), postos: Ly.postos, jan: [num(v.Janela_L, 0.0265), num(v.Janela_A, 0.0515)],
        cheio: txt(v.Modulo_preenchido) === "vazio" ? "vazio" : "cego" });
    };
  }
  var RA_NOTA = "Medida informada pelo Rogério em 28/10/2026 para Tramontina Liz e Pial Plus (a mesma da ra-tomada); o varejo publica a medida do catálogo L1 — conferir na ficha do modelo comprado.";
  var famPl42 = def({
    id: "ele-placa-4x2", nome: "Placa 4×2 (cega, 1 a 3 postos)", ids: ["placa_cega_4x2", "placa_4x2_liz", "placa_2postos_afastados_liz"],
    descricao: "Placa (espelho) 4×2 branca: cega, 1 posto (em pé), 2 ou 3 postos (deitada) e 2 postos afastados. Bordas arredondadas em degraus (chanfro) e o rebaixo escuro de cada posto; o módulo cego entra por padrão (Modulo_preenchido = vazio mostra o rebaixo escuro). Não duplica a tomada: a ra-tomada continua com a placa dela — esta é a placa avulsa, da medida do catálogo L1. Origem: na face da parede, no centro da placa; a placa sai para +Z.",
    parametros: paramsPlaca(1),
    tipos: [tipoPlaca("cega", "Placa cega 4×2", "placa_cega_4x2", 0), tipoPlaca("p1", "Placa 4×2, 1 posto", "placa_4x2_liz", 1), tipoPlaca("p2", "Placa 4×2, 2 postos", "placa_4x2_liz", 2),
      tipoPlaca("p3", "Placa 4×2, 3 postos", "placa_4x2_liz", 3), tipoPlaca("p2af", "Placa 4×2, 2 postos afastados", "placa_2postos_afastados_liz", 2, { Afastados: true }),
      { id: "ra-cega", nome: "Placa cega 4×2 (115 × 73, medida da ra-tomada)", valores: { Postos: 0, Placa_L: 0.115, Placa_A: 0.073, Espessura: 0.0025, Item_catalogo: "", Fonte: RA_NOTA, Nivel_fonte: "secundaria-lida", Cotas_a_conferir: "Placa_L, Placa_A: medida informada" }, fonte: RA_NOTA },
      { id: "ra-p1", nome: "Placa 4×2, 1 posto (115 × 73, medida da ra-tomada)", valores: { Postos: 1, Placa_L: 0.115, Placa_A: 0.073, Espessura: 0.0025, Item_catalogo: "", Fonte: RA_NOTA, Nivel_fonte: "secundaria-lida", Cotas_a_conferir: "Placa_L, Placa_A: medida informada" }, fonte: RA_NOTA },
      { id: "ra-p2", nome: "Placa 4×2, 2 postos (115 × 73, medida da ra-tomada)", valores: { Postos: 2, Placa_L: 0.115, Placa_A: 0.073, Espessura: 0.0025, Item_catalogo: "", Fonte: RA_NOTA, Nivel_fonte: "secundaria-lida", Cotas_a_conferir: "Placa_L, Placa_A: medida informada" }, fonte: RA_NOTA },
      { id: "ra-p3", nome: "Placa 4×2, 3 postos (115 × 73, medida da ra-tomada)", valores: { Postos: 3, Placa_L: 0.115, Placa_A: 0.073, Espessura: 0.0025, Item_catalogo: "", Fonte: RA_NOTA, Nivel_fonte: "secundaria-lida", Cotas_a_conferir: "Placa_L, Placa_A: medida informada" }, fonte: RA_NOTA }],
    gerar: gerarPlaca("4x2")
  });
  var famPl44 = def({
    id: "ele-placa-4x4", nome: "Placa 4×4 (cega, 2 a 6 postos)", ids: ["placa_cega_4x4", "placa_4x4_liz"],
    descricao: "Placa (espelho) 4×4 branca: cega e de 2 a 6 postos em duas linhas (30,5 mm entre postos, 45,6 mm entre linhas, como a ra-tomada). Bordas arredondadas em degraus e o rebaixo escuro de cada posto. Origem: na face da parede, no centro da placa; a placa sai para +Z.",
    parametros: paramsPlaca(2).map(function (p) { if (p.nome === "Placa_L") p.valor = 0.125; if (p.nome === "Placa_A") p.valor = 0.125; if (p.nome === "Janela_A") { p.valor = 0.0415; p.descricao = "Altura do rebaixo do posto na 4×4 (duas linhas a 45,6 mm)" + MODEL; } return p; }),
    tipos: [tipoPlaca("cega", "Placa cega 4×4", "placa_cega_4x4", 0), tipoPlaca("p2", "Placa 4×4, 2 postos", "placa_4x4_liz", 2), tipoPlaca("p3", "Placa 4×4, 3 postos", "placa_4x4_liz", 3),
      tipoPlaca("p4", "Placa 4×4, 4 postos", "placa_4x4_liz", 4), tipoPlaca("p5", "Placa 4×4, 5 postos", "placa_4x4_liz", 5), tipoPlaca("p6", "Placa 4×4, 6 postos", "placa_4x4_liz", 6),
      { id: "ra-p4", nome: "Placa 4×4, 4 postos (124 × 118, medida da ra-tomada)", valores: { Postos: 4, Placa_L: 0.124, Placa_A: 0.118, Espessura: 0.0025, Item_catalogo: "", Fonte: "Pial Plus, placa cega 4×4 branca, Telhanorte 632392 (a medida da ra-tomada, lote 2 de 28/10/2026)", Nivel_fonte: "secundaria-lida", Cotas_a_conferir: "Placa_L, Placa_A: varejo" }, fonte: "varejo" }],
    gerar: gerarPlaca("4x4")
  });
  var famTampa = def({
    id: "ele-tampa-octogonal", nome: "Tampa da octogonal (cega ou com furo do plafon)", ids: ["tampa_octogonal"],
    descricao: "Tampa cega da caixa octogonal 4×4 (tampa de laje), lisa ou com o FURO CENTRAL do plafon (a passagem do cabo da luminária), com os dois parafusos sobre as orelhas. O diâmetro é o do catálogo (105,6 mm, o do conjunto com orelhas) e o furo central de 25 mm é modelagem. Origem: na face de baixo da laje; a tampa fica logo abaixo dela.",
    parametros: [
      Pf("Diametro", "comprimento", 0.1056, "Dimensões", "Diâmetro da tampa — catálogo (sem fonte: tomado do conjunto Tigre; conferir)"),
      Pf("Espessura", "comprimento", 0.002, "Dimensões", "Espessura da tampa (usual — conferir)"),
      Pf("Furo_central", "comprimento", 0, "Dimensões", "Diâmetro do furo central do plafon (0 = tampa cega); 25 mm" + MODEL),
      Pf("Altura_montagem", "comprimento", 2.60, "Restrições", "Do piso à face de baixo da laje ou do forro", "instancia"),
      Pf("Material", "material", "pvc amarelo caixa", "Materiais", "PVC amarelo, a cor da caixa")
    ].concat(paramFonte()),
    tipos: [tipo("cega", "Tampa cega", Object.assign({ Diametro: cotaM("tampa_octogonal", "diametro_mm"), Espessura: cotaM("tampa_octogonal", "espessura_mm"), Furo_central: 0 }, vFonte(["tampa_octogonal"], null)), ["tampa_octogonal"]),
      tipo("plafon", "Tampa com furo central (plafon)", Object.assign({ Diametro: cotaM("tampa_octogonal", "diametro_mm"), Espessura: cotaM("tampa_octogonal", "espessura_mm"), Furo_central: 0.025 }, vFonte(["tampa_octogonal"], null)), ["tampa_octogonal"])],
    gerar: function (c, v) {
      G.tampaOct(c, { d: Math.max(0.05, num(v.Diametro, 0.1056)), e: Math.max(0.001, num(v.Espessura, 0.002)), yc: num(v.Altura_montagem, 2.6), furo: Math.max(0, num(v.Furo_central, 0)), mat: txt(v.Material) || G.MAT.PVC_AM });
    }
  });

  /* =====================================================================
   * 4. DISPOSITIVOS DIN: disjuntor, DR, DPS, pente, trilho, barramentos
   * ===================================================================== */
  function paramsDin(extra) {
    return [
      Pf("Polos", "inteiro", 1, "Elétrica", "Número de polos"),
      Pf("Largura", "comprimento", 0.0177, "Dimensões", "Largura (17,7 mm por polo, passo do módulo DIN) — catálogo Steck"),
      Pf("Altura", "comprimento", 0.08, "Dimensões", "Altura total — catálogo"),
      Pf("Profundidade", "comprimento", 0.073, "Dimensões", "Profundidade total, do fundo à ponta do manípulo — catálogo"),
      Pf("Prof_corpo", "comprimento", 0.039, "Dimensões", "Profundidade do corpo atrás da face (a parte de altura total) — catálogo"),
      Pf("Altura_frontal", "comprimento", 0.0448, "Dimensões", "Altura da face frontal (a que passa pela janela do espelho) — catálogo"),
      Pf("Altura_montagem", "comprimento", 1.50, "Restrições", "Do piso ao centro do dispositivo", "instancia"),
      Pf("Circuito", "texto", "", "Elétrica", "Circuito de proteção no quadro (Cn) — informativo", "instancia")
    ].concat(extra || [], paramFonte());
  }
  function gerarDin(tp) {
    return function (c, v) {
      var yc = num(v.Altura_montagem, 1.5);
      c.grupo(0, yc, 0, 0, function (g) {
        G.dispDin(g, { W: num(v.Largura, 0.0177), Ht: num(v.Altura, 0.08), Dc: num(v.Prof_corpo, 0.039), Dt: num(v.Profundidade, 0.073), Hf: num(v.Altura_frontal, 0.0448), gh: 0.0355, gd: 0.0055, polos: Math.max(1, Math.round(num(v.Polos, 1))), tipo: tp,
          rotulo: txt(v.Rotulo), mp: txt(v.Manipulo) === "vermelho" ? "vermelho" : "preto" });
      });
    };
  }
  var IN_DISJ = [6, 10, 16, 20, 25, 32, 40, 50, 63], IN_GERAL = [80, 100, 125];
  var tiposDisj = [];
  [1, 2, 3, 4].forEach(function (p) {
    var cat = "disj_mini_" + p + "p_steck";
    IN_DISJ.forEach(function (In) {
      if (item(cat).eletrico.In_A.indexOf(In) < 0) return;
      var v = vFonte([cat], null), vals = { Polos: p, Corrente_A: In, Curva: "C", Rotulo: "C" + In, Icn_kA: item(cat).eletrico.Icn_kA, Largura: cotaM(cat, "largura_mm"), Altura: cotaM(cat, "altura_mm"), Profundidade: cotaM(cat, "profundidade_mm"),
        Prof_corpo: cotaM(cat, "profundidade_corpo_mm"), Altura_frontal: cotaM(cat, "altura_frontal_mm") };
      Object.keys(v).forEach(function (k) { vals[k] = v[k]; });
      tiposDisj.push(tipo(p + "p-c" + In, "Mini-disjuntor " + p + "P curva C " + In + " A (Steck)", vals, [cat]));
    });
    if (p <= 4) IN_GERAL.forEach(function (In) {
      var cg = "disj_geral_80_125a_steck", cm2 = "disj_mini_" + p + "p_steck", v = vFonte([cg, cm2], null);
      var vals = { Polos: p, Corrente_A: In, Curva: "", Rotulo: String(In), Icn_kA: 0, Largura: cotaM(cg, "largura_" + p + "p_mm"), Altura: cotaM(cg, "altura_mm"), Profundidade: cotaM(cg, "profundidade_mm"),
        Prof_corpo: cotaM(cm2, "profundidade_corpo_mm"), Altura_frontal: cotaM(cm2, "altura_frontal_mm") };
      Object.keys(v).forEach(function (k) { vals[k] = v[k]; });
      tiposDisj.push(tipo("g" + p + "p-" + In, "Disjuntor geral " + p + "P " + In + " A (Steck, 80 a 125 A)", vals, [cg, cm2]));
    });
  });
  var famDisj = def({
    id: "ele-disjuntor", nome: "Disjuntor DIN (1P a 4P)", mep: "", ids: ["disj_mini_1p_steck", "disj_mini_2p_steck", "disj_mini_3p_steck", "disj_mini_4p_steck", "disj_geral_80_125a_steck"],
    descricao: "Mini-disjuntor DIN termomagnético 1P, 2P, 3P e 4P, curva C, 6 a 63 A (Steck: 17,7 mm por polo, 80 × 73 mm), e o geral de 80 a 125 A. Corpo em duas partes (atrás de altura total, com o rasgo do trilho de 35 mm; a face de 44,8 mm que passa pelo espelho), manípulo, janela de identificação com a marca (C16…) e os bornes de parafuso em cima e embaixo com a boca do fio. Origem: no fundo do dispositivo, no centro; a frente em +Z. A ficha lida da linha Steck descreve a manopla vermelha; o padrão da RA é o manípulo preto (parâmetro Manipulo).",
    parametros: paramsDin([Pf("Corrente_A", "numero", 16, "Elétrica", "Corrente nominal In (A)"), Pf("Curva", "texto", "C", "Elétrica", "Curva de disparo"), Pf("Rotulo", "texto", "C16", "Elétrica", "Marca gravada na janela de identificação (curva + In)"),
      Pf("Icn_kA", "numero", 3, "Elétrica", "Capacidade de interrupção (kA) — catálogo"), Pf("Manipulo", "texto", "preto", "Materiais", "preto (padrão RA, Easy9) ou vermelho (a ficha da linha Steck descreve manopla vermelha)")]),
    tipos: tiposDisj, gerar: gerarDin("disj")
  });
  var tiposDr = [];
  [2, 4].forEach(function (p) {
    var cat = "idr_" + p + "p_30ma_steck";
    item(cat).eletrico.In_A.forEach(function (In) {
      var v = vFonte([cat], null), vals = { Polos: p, Corrente_A: In, Sensibilidade_mA: item(cat).eletrico.IDn_mA, Rotulo: In + "A", Largura: cotaM(cat, "largura_mm"), Altura: cotaM(cat, "altura_mm"), Profundidade: cotaM(cat, "profundidade_mm"),
        Prof_corpo: cotaM(cat, "profundidade_corpo_mm"), Altura_frontal: cotaM(cat, "altura_frontal_mm") };
      Object.keys(v).forEach(function (k) { vals[k] = v[k]; });
      tiposDr.push(tipo(p + "p-" + In, "IDR " + p + "P " + In + " A, 30 mA (Steck)", vals, [cat]));
    });
  });
  var famDr = def({
    id: "ele-dr", nome: "Interruptor diferencial residual (IDR/DR)", ids: ["idr_2p_30ma_steck", "idr_4p_30ma_steck"],
    descricao: "Interruptor diferencial residual (IDR) 2P e 4P de 25, 40 e 63 A, 30 mA (Steck: 36 e 72 mm de largura, 90 × 78 mm). Corpo em duas partes (rasgo do trilho atrás), manípulo, BOTÃO DE TESTE 'T', janela de identificação e bornes de parafuso. A cor do botão de teste (amarelo) é USUAL: a ficha lida não diz a cor. Origem: no fundo do dispositivo, no centro; a frente em +Z.",
    parametros: paramsDin([Pf("Corrente_A", "numero", 25, "Elétrica", "Corrente nominal In (A)"), Pf("Sensibilidade_mA", "numero", 30, "Elétrica", "Corrente diferencial residual nominal IΔn (mA)"),
      Pf("Rotulo", "texto", "25A", "Elétrica", "Marca gravada na janela de identificação"), Pf("Manipulo", "texto", "preto", "Materiais", "preto ou vermelho")]).map(function (p) { if (p.nome === "Polos") p.valor = 2; if (p.nome === "Largura") p.valor = 0.036; if (p.nome === "Altura") p.valor = 0.09; if (p.nome === "Profundidade") p.valor = 0.078; if (p.nome === "Prof_corpo") p.valor = 0.05; if (p.nome === "Altura_frontal") p.valor = 0.045; return p; }),
    tipos: tiposDr, gerar: gerarDin("dr")
  });
  var tiposDps = [];
  item("dps_classe2_1p_steck").eletrico.Imax_kA.forEach(function (kA) {
    var cat = "dps_classe2_1p_steck", v = vFonte([cat], null), vals = { Polos: 1, Uc_V: item(cat).eletrico.Uc_V, Imax_kA: kA, Classe: "II", Rotulo: "II", Largura: cotaM(cat, "largura_mm"), Altura: cotaM(cat, "altura_mm"), Profundidade: cotaM(cat, "profundidade_mm"),
      Prof_corpo: cotaM(cat, "profundidade_corpo_mm"), Altura_frontal: cotaM(cat, "altura_face_mm") };
    Object.keys(v).forEach(function (k) { vals[k] = v[k]; });
    vals.Cotas_a_conferir = (vals.Cotas_a_conferir ? vals.Cotas_a_conferir + "; " : "") + "Imax_kA: sem-fonte-conferir (20/40 kA são os usuais do pedido)";
    tiposDps.push(tipo("1p-" + kA + "ka", "DPS classe II 1P 275 V " + kA + " kA (Steck)", vals, [cat]));
  });
  var famDps = def({
    id: "ele-dps", nome: "DPS classe II (1P, 275 V)", ids: ["dps_classe2_1p_steck"],
    descricao: "Dispositivo de proteção contra surtos classe II monobloco 1P, 275 V, 20 ou 40 kA (Steck: 18 × 92 × 70 mm; 44 mm sobre o trilho). Corpo em duas partes, cartucho com a JANELA DE INDICAÇÃO (verde = em ordem), nervura de puxar, bornes de parafuso. As correntes de 20/40 kA são as usuais do pedido (a ficha lida só traz o desenho: conferir a referência). Origem: no fundo do dispositivo, no centro; a frente em +Z.",
    parametros: paramsDin([Pf("Uc_V", "numero", 275, "Elétrica", "Tensão máxima de operação contínua Uc (V) — catálogo"), Pf("Imax_kA", "numero", 20, "Elétrica", "Corrente máxima de descarga (kA) — usual do pedido, a conferir"),
      Pf("Classe", "texto", "II", "Elétrica", "Classe do DPS"), Pf("Rotulo", "texto", "II", "Elétrica", "Marca gravada")]).map(function (p) { if (p.nome === "Altura") p.valor = 0.092; if (p.nome === "Profundidade") p.valor = 0.07; if (p.nome === "Prof_corpo") p.valor = 0.044; if (p.nome === "Altura_frontal") p.valor = 0.0358; return p; }),
    tipos: tiposDps, gerar: gerarDin("dps")
  });
  var tiposPente = [12, 16, 19, 57].map(function (n) {
    var cat = "pente_fase_" + n + "p", v = vFonte([cat], null), vals = { Polos: n, Comprimento: cotaM(cat, "comprimento_mm"), Passo: cotaM(cat, "passo_mm"), Espessura: cotaM(cat, "espessura_mm") };
    Object.keys(v).forEach(function (k) { vals[k] = v[k]; });
    return tipo(n + "p", "Barramento pente (fase) " + n + " polos", vals, [cat]);
  });
  var famPente = def({
    id: "ele-barramento-pente", nome: "Barramento pente (fase)", ids: ["pente_fase_12p", "pente_fase_16p", "pente_fase_19p", "pente_fase_57p"],
    descricao: "Barramento pente de fase 12, 16, 19 ou 57 polos (passo de 17,7 mm): barra de cobre com a capa isolante e os dentes que entram nos bornes de cima dos disjuntores. Origem: no centro da barra; os dentes saem para baixo.",
    parametros: [Pf("Polos", "inteiro", 12, "Elétrica", "Número de polos (dentes)"), Pf("Comprimento", "comprimento", 0.21, "Dimensões", "Comprimento — catálogo"), Pf("Passo", "comprimento", 0.0177, "Dimensões", "Passo entre os dentes — catálogo"),
      Pf("Espessura", "comprimento", 0.0015, "Dimensões", "Espessura do cobre (usual — a ficha não publica)"), Pf("Altura_montagem", "comprimento", 1.50, "Restrições", "Do piso ao centro da barra", "instancia")].concat(paramFonte()),
    tipos: tiposPente,
    gerar: function (c, v) { c.grupo(0, num(v.Altura_montagem, 1.5), 0, 0, function (g) { G.pente(g, { L: num(v.Comprimento, 0.21), polos: Math.max(1, Math.round(num(v.Polos, 12))), passo: num(v.Passo, 0.0177), esp: num(v.Espessura, 0.0015) }); }); }
  });
  var catTrilho = "trilho_din_35";
  var famTrilho = def({
    id: "ele-trilho-din", nome: "Trilho DIN 35 mm", ids: [catTrilho],
    descricao: "Trilho DIN 35 × 7,5 mm (perfil chapéu, aço zincado) com as fendas de fixação. O comprimento é da instância (a barra do catálogo tem 2 m). Origem: no centro do trilho, na face de baixo; o chapéu sobe para +Z.",
    parametros: [Pf("Largura_perfil", "comprimento", cotaM(catTrilho, "largura_mm"), "Dimensões", "Largura do perfil — catálogo"), Pf("Altura_perfil", "comprimento", cotaM(catTrilho, "altura_mm"), "Dimensões", "Altura do chapéu (7,5 mm: da norma de perfil, não lida)"),
      Pf("Espessura", "comprimento", cotaM(catTrilho, "espessura_mm"), "Dimensões", "Espessura da chapa (usual — conferir)"), Pf("Comprimento", "comprimento", 0.30, "Dimensões", "Comprimento do trecho", "instancia"),
      Pf("Altura_montagem", "comprimento", 1.50, "Restrições", "Do piso ao centro do trilho", "instancia")].concat(paramFonte()),
    tipos: [tipo("t35", "Trilho DIN 35 × 7,5 (aço zincado)", Object.assign({ Largura_perfil: cotaM(catTrilho, "largura_mm"), Altura_perfil: cotaM(catTrilho, "altura_mm"), Espessura: cotaM(catTrilho, "espessura_mm") }, vFonte([catTrilho], null)), [catTrilho])],
    gerar: function (c, v) { c.grupo(0, num(v.Altura_montagem, 1.5), 0, 0, function (g) { G.trilho(g, { L: Math.max(0.05, num(v.Comprimento, 0.3)), esp: num(v.Espessura, 0.001), w: num(v.Largura_perfil, 0.035), h: num(v.Altura_perfil, 0.0075) }); }); }
  });
  function tiposBarra(cor) {
    return [8, 12, 24, 36].map(function (n) {
      var cat = "barra_nt_" + n, v = vFonte([cat], ["comprimento_mm"]), vals = { Disjuntores: n, Comprimento: cotaM(cat, "comprimento_mm") };
      Object.keys(v).forEach(function (k) { vals[k] = v[k]; });
      return tipo("d" + n, "Barramento de " + cor + " para quadro de " + n + " disjuntores", vals, [cat]);
    });
  }
  function defBarra(id, nome, cor, ids) {
    return def({
      id: id, nome: nome, ids: ids,
      descricao: nome + " do kit do quadro (Wavin): base isolante " + (cor === "azul" ? "AZUL (neutro)" : "VERDE (terra)") + ", barra de latão e os bornes de parafuso, comprimento do catálogo para o quadro de 8, 12, 24 ou 36 disjuntores. A seção da barra e os furos não têm legenda na ficha: só o comprimento é cota. Origem: no centro da barra, no fundo; os bornes saem para +Z.",
      parametros: [Pf("Disjuntores", "inteiro", 12, "Dimensões", "Quadro a que a barra serve (8, 12, 24 ou 36 disjuntores)"), Pf("Comprimento", "comprimento", 0.077, "Dimensões", "Comprimento da barra — catálogo"),
        Pf("Altura_montagem", "comprimento", 1.50, "Restrições", "Do piso ao centro da barra", "instancia")].concat(paramFonte()),
      tipos: tiposBarra(cor === "azul" ? "neutro" : "terra"),
      gerar: function (c, v) { c.grupo(0, num(v.Altura_montagem, 1.5), 0, 0, function (g) { G.barraNT(g, { L: num(v.Comprimento, 0.077), cor: cor }); }); }
    });
  }
  var famBN = defBarra("ele-barramento-neutro", "Barramento de neutro", "azul", ["barra_nt_8", "barra_nt_12", "barra_nt_24", "barra_nt_36"]);
  var famBT = defBarra("ele-barramento-terra", "Barramento de terra", "verde", ["barra_nt_8", "barra_nt_12", "barra_nt_24", "barra_nt_36"]);

  /* =====================================================================
   * 5. QUADRO DE DISTRIBUIÇÃO MONTADO PELO PROJETO
   * ===================================================================== */
  var P17 = G.P17;
  var PADROES = [6, 12, 18, 24, 36];
  var CAP_PADRAO = { 6: [1, 6], 12: [1, 12], 18: [2, 9], 24: [2, 12], 36: [3, 12] };   /* [fileiras, módulos por fileira] — os do catálogo (6, 18: derivados dos vizinhos) */
  var CAT_PVC = { 6: "quadro_pvc_embutir_6din", 12: "quadro_pvc_embutir_12din", 18: "quadro_pvc_embutir_18din", 24: "quadro_pvc_embutir_24din", 36: "quadro_pvc_embutir_36din" };
  var CAT_BARRA = { 8: "barra_nt_8", 12: "barra_nt_12", 24: "barra_nt_24", 36: "barra_nt_36" };
  function barraDe(mod) { return CAT_BARRA[mod <= 8 ? 8 : (mod <= 12 ? 12 : (mod <= 24 ? 24 : 36))]; }
  /* as medidas de um dispositivo DIN do catálogo (metros) */
  function dimDisj(polos, In) {
    var geral = In > 63, cat = "disj_mini_" + polos + "p_steck", cg = "disj_geral_80_125a_steck";
    var d = { Ht: cotaM(cat, "altura_mm"), Dt: cotaM(cat, "profundidade_mm"), Dc: cotaM(cat, "profundidade_corpo_mm"), Hf: cotaM(cat, "altura_frontal_mm") };
    if (geral) { d.Ht = cotaM(cg, "altura_mm"); d.Dt = cotaM(cg, "profundidade_mm"); d.W = cotaM(cg, "largura_" + polos + "p_mm"); d.modulos = Math.ceil(d.W / P17 - 1e-9); }
    else d.modulos = polos;
    return d;
  }
  function dimDr(polos) { var cat = "idr_" + polos + "p_30ma_steck"; return { Ht: cotaM(cat, "altura_mm"), Dt: cotaM(cat, "profundidade_mm"), Dc: cotaM(cat, "profundidade_corpo_mm"), Hf: cotaM(cat, "altura_frontal_mm"), modulos: polos }; }
  function dimDps() { var cat = "dps_classe2_1p_steck"; return { Ht: cotaM(cat, "altura_mm"), Dt: cotaM(cat, "profundidade_mm"), Dc: cotaM(cat, "profundidade_corpo_mm"), Hf: cotaM(cat, "altura_face_mm"), modulos: 1 }; }
  function lerProjeto(p) {
    if (p && typeof p === "object") return p;
    if (typeof p === "string" && p) { try { var o = JSON.parse(p); return o && typeof o === "object" ? o : null; } catch (e) { return null; } }
    return null;
  }
  function tipoIdDisj(polos, In) { if (In > 63) return "g" + polos + "p-" + In; return polos + "p-c" + In; }
  /* monta a lista de itens na ordem da fileira.
     projeto: o Projeto_eletrico (objeto ou JSON) — { circuitos:[{id, nome, tipo, polos, disjuntor, dr}], drs:[{id, In, polos, circuitos}], dps:{quantidade, in_kA}|null, geral:{In, polos} };
     opc: { capacidade (módulos), fileiras, capFileira, disjuntores (sem projeto: quantos 1P) } — sem `capacidade`, o menor quadro padrão (6/12/18/24/36) que cabe.
     Resultado: { itens, usados, capacidade, fileiras, capFileira, reserva, excedeu, avisos, temProjeto } — itens: { ordem, tipo: geral|dps|dr|disj|reserva, famId, tipoId, polos, In,
     modulos, fileira, coluna, rotulo, etiqueta, circuito, dr, dim } */
  function montarQuadro(projeto, opc) {
    opc = opc || {};
    var pj = lerProjeto(projeto), avisos = [], seq = [];
    function dispositivo(tipoK, famId, tipoId, polos, In, dim, rot, et, circ, dr) {
      return { tipo: tipoK, famId: famId, tipoId: tipoId, polos: polos, In: In, modulos: dim.modulos, rotulo: rot, etiqueta: et, circuito: circ || null, dr: dr || null, dim: dim };
    }
    if (pj && (arr(pj.circuitos).length || pj.geral || arr(pj.drs).length)) {
      var porId = {}; arr(pj.circuitos).forEach(function (cc) { porId[String(cc.id)] = cc; });
      var feitos = {};
      function addCirc(cc, drId) {
        if (!cc || feitos[cc.id]) return; feitos[cc.id] = 1;
        var polos = Math.max(1, Math.min(4, Math.round(num(cc.polos, 1)))), In = num(cc.disjuntor, 0), In2 = In;
        if (!(In > 0)) { avisos.push(cc.id + ": sem corrente de disjuntor no projeto — desenhado 1P sem marca."); seq.push(dispositivo("disj", "ele-disjuntor", null, polos, null, dimDisj(polos, 16), "", cc.id, cc.id, drId)); return; }
        if (In2 < 6) In2 = 6;
        if (IN_DISJ.indexOf(In2) < 0 && In2 <= 63) { var melhor = 63; IN_DISJ.forEach(function (x) { if (x >= In2 && x < melhor) melhor = x; }); avisos.push(cc.id + ": disjuntor de " + In + " A fora da série do catálogo — desenhado como " + melhor + " A."); In2 = melhor; }
        if (In > 125) { avisos.push(cc.id + ": disjuntor de " + In + " A passa de 125 A (maior do catálogo) — desenhado como 125 A."); In2 = 125; }
        else if (In > 63 && IN_GERAL.indexOf(In) < 0) { In2 = In <= 80 ? 80 : (In <= 100 ? 100 : 125); }
        seq.push(dispositivo("disj", "ele-disjuntor", tipoIdDisj(polos, In2), polos, In2, dimDisj(polos, In2), In2 > 63 ? String(In2) : "C" + In2, cc.id, cc.id, drId));
      }
      if (pj.geral && num(pj.geral.In, 0) > 0) {
        var pg = Math.max(1, Math.min(4, Math.round(num(pj.geral.polos, 1)))), Ig = num(pj.geral.In, 0), Ig2 = Ig;
        if (Ig > 125) { avisos.push("Geral de " + Ig + " A passa de 125 A (maior do catálogo) — desenhado como 125 A."); Ig2 = 125; }
        else if (Ig > 63) Ig2 = Ig <= 80 ? 80 : (Ig <= 100 ? 100 : 125);
        else if (Ig < 6) Ig2 = 6;
        else if (IN_DISJ.indexOf(Ig2) < 0) { var mg = 63; IN_DISJ.forEach(function (x) { if (x >= Ig2 && x < mg) mg = x; }); Ig2 = mg; }
        seq.push(dispositivo("geral", "ele-disjuntor", tipoIdDisj(pg, Ig2), pg, Ig2, dimDisj(pg, Ig2), Ig2 > 63 ? String(Ig2) : "C" + Ig2, "G", null, null));
      }
      if (pj.dps && num(pj.dps.quantidade, 0) > 0) {
        var kA = num(pj.dps.in_kA, 20) >= 40 ? 40 : 20;
        for (var q = 0; q < Math.round(pj.dps.quantidade); q++) seq.push(dispositivo("dps", "ele-dps", "1p-" + kA + "ka", 1, kA, dimDps(), "II", "DPS", null, null));
      }
      arr(pj.drs).forEach(function (g) {
        var pd = num(g.polos, 2) >= 4 ? 4 : 2, Id = num(g.In, 0), Id2 = [25, 40, 63].filter(function (x) { return x >= Id; })[0] || 63;
        if (!(Id > 0)) avisos.push(g.id + ": sem corrente no projeto — desenhado 25 A.");
        else if (Id2 !== Id) avisos.push(g.id + ": DR de " + Id + " A fora da série do catálogo (25/40/63) — desenhado como " + Id2 + " A.");
        seq.push(dispositivo("dr", "ele-dr", pd + "p-" + (Id > 0 ? Id2 : 25), pd, Id > 0 ? Id2 : 25, dimDr(pd), (Id > 0 ? Id2 : 25) + "A", g.id, null, null));
        arr(g.circuitos).forEach(function (cid) { addCirc(porId[String(cid)], g.id); });
      });
      arr(pj.circuitos).forEach(function (cc) { addCirc(cc, null); });
    } else {
      var nd = Math.max(0, Math.round(num(opc.disjuntores, num(opc.capacidade, 0))));
      for (var i = 0; i < nd; i++) seq.push(dispositivo("disj", "ele-disjuntor", null, 1, null, dimDisj(1, 16), "", "", null, null));
    }
    /* capacidade e a fileira */
    var capFil, filas;
    function cabe(capRow, rows) {   /* simula a colocação (sem cruzar o fim da fileira) e devolve { ult, sobras } */
      var m = 0, ult = 0;
      seq.forEach(function (it) { var col = m % capRow; if (col + it.modulos > capRow) m += capRow - col; m += it.modulos; ult = m; });
      return { fim: ult, ok: ult <= capRow * rows };
    }
    if (num(opc.capacidade, 0) > 0) {
      capFil = num(opc.capFileira, 0) > 0 ? Math.round(opc.capFileira) : (CAP_PADRAO[opc.capacidade] ? CAP_PADRAO[opc.capacidade][1] : Math.min(12, Math.round(opc.capacidade)));
      filas = num(opc.fileiras, 0) > 0 ? Math.round(opc.fileiras) : Math.max(1, Math.ceil(opc.capacidade / capFil));
    } else {
      var ach = null;
      PADROES.forEach(function (n) { if (!ach && cabe(CAP_PADRAO[n][1], CAP_PADRAO[n][0]).ok) ach = n; });
      if (ach) { capFil = CAP_PADRAO[ach][1]; filas = CAP_PADRAO[ach][0]; }
      else { capFil = 12; filas = 3; while (!cabe(capFil, filas).ok && filas < 8) filas++; }
    }
    var capTotal = capFil * filas, m = 0, itens = [], excedeu = 0, usados = 0;
    seq.forEach(function (it) {
      var col = m % capFil;
      if (col + it.modulos > capFil) { var sobra = capFil - col; for (var s = 0; s < sobra && m < capTotal; s++) { itens.push(reserva(m, capFil, true)); m++; } col = 0; }
      if (m + it.modulos > capTotal) { excedeu += it.modulos; return; }
      var o = copia({ tipo: it.tipo, famId: it.famId, tipoId: it.tipoId, polos: it.polos, In: it.In, modulos: it.modulos, rotulo: it.rotulo, etiqueta: it.etiqueta, circuito: it.circuito, dr: it.dr, dim: it.dim });
      o.fileira = Math.floor(m / capFil); o.coluna = m % capFil; itens.push(o); m += it.modulos; usados += it.modulos;
    });
    while (m < capTotal) { itens.push(reserva(m, capFil, false)); m++; }
    function reserva(mm, cf, sobra) { return { tipo: "reserva", famId: "", tipoId: null, polos: 0, In: null, modulos: 1, rotulo: "", etiqueta: "", circuito: null, dr: null, fileira: Math.floor(mm / cf), coluna: mm % cf, sobra: !!sobra, dim: { Ht: 0.08, Dt: 0.073, Dc: 0.039, Hf: 0.0448, modulos: 1 } }; }
    if (excedeu) avisos.push("O quadro de " + capTotal + " módulos não comporta o projeto: faltam " + excedeu + " módulo(s) — escolha um quadro maior.");
    itens.forEach(function (it, i) { it.ordem = i; });
    return { itens: itens, usados: usados, capacidade: capTotal, fileiras: filas, capFileira: capFil, reserva: itens.filter(function (x) { return x.tipo === "reserva"; }).length, excedeu: excedeu, avisos: avisos, temProjeto: !!(pj && (arr(pj.circuitos).length || pj.geral)) };
  }

  /* os tipos do quadro: PVC de embutir (catálogo Wavin; 6 e 18 DIN derivados dos vizinhos) e metálico de sobrepor (catálogo só do 12 DIN; os outros derivados dele) */
  function tipoQuadro(n, metal, embutir) {   /* embutir (só com metal): o metálico de EMBUTIR (revisão M2, 07/11/2026): a SINAPI orça quadro de aço de embutir; o corpo é o do de sobrepor + a aba */
    var cat = CAT_PVC[n], cm = "quadro_metal_sobrepor_12din", fr = CAP_PADRAO[n][0], cap = CAP_PADRAO[n][1], cb = CAT_BARRA[n <= 8 ? 8 : (n <= 12 ? 12 : (n <= 24 ? 24 : 36))];
    var vals, ids;
    if (!metal) {
      ids = [cat, barraDe(n)];
      vals = { Material_quadro: "pvc", Instalacao: "embutir", Corrente: "", Disjuntores: n, Fileiras: fr, Modulos_fileira: cap, Largura: cotaM(cat, "largura_mm"), Altura: cotaM(cat, "altura_mm"), Profundidade: cotaM(cat, "profundidade_mm"),
        Aba: cotaOr(cat, "aba_frontal_mm", 22), Parede: 0.0025, Material: G.MAT.BRANCO };
    } else {
      ids = [cm, cat, barraDe(n)];
      var L = n === 12 ? cotaMM(cm, "largura_mm") : Math.round((cap * 17.7 + (cotaMM(cm, "largura_mm") - 12 * 17.7)) * 2) / 2;
      var A = n === 12 ? cotaMM(cm, "altura_mm") : cotaMM(cm, "altura_mm") + (fr - 1) * 115;
      vals = { Material_quadro: "aco", Instalacao: embutir ? "embutir" : "sobrepor", Corrente: "100A", Disjuntores: n, Fileiras: fr, Modulos_fileira: cap, Largura: L / 1000, Altura: A / 1000, Profundidade: cotaM(cm, "profundidade_mm"), Aba: embutir ? cotaOr(cat, "aba_frontal_mm", 22) : 0, Parede: cotaM(cm, "chapa_mm"), Material: G.MAT.QUADRO_METAL };
    }
    vals.Barra_N = cotaM(cb, "comprimento_mm"); vals.Barra_T = vals.Barra_N;
    var v = vFonte(ids, null);
    Object.keys(v).forEach(function (k) { vals[k] = v[k]; });
    if (!metal && (n === 6 || n === 18)) vals.Cotas_a_conferir = (vals.Cotas_a_conferir ? vals.Cotas_a_conferir + "; " : "") + "tamanho do quadro: sem-fonte-conferir (nem Wavin nem Tigre listam " + n + " DIN: medidas dos vizinhos)";
    if (metal) vals.Cotas_a_conferir = (vals.Cotas_a_conferir ? vals.Cotas_a_conferir + "; " : "") + (n === 12 ? "medidas: sem-fonte-conferir (usuais)" : "medidas DERIVADAS do metálico de 12 DIN (largura = módulos × 17,7 + a folga do 12; altura + 115 mm por fileira): sem-fonte-conferir");
    if (metal && embutir) vals.Cotas_a_conferir = (vals.Cotas_a_conferir ? vals.Cotas_a_conferir + "; " : "") + "metálico de EMBUTIR: corpo = o do de sobrepor e aba frontal = a do PVC (catálogo Wavin) — DERIVADO, sem-fonte-conferir (a ficha do metálico é só de sobrepor)";
    return tipo((metal ? (embutir ? "aco-e-" : "aco-s-") : "pvc-") + n, metal ? (embutir ? "Metálico de embutir, " : "Metálico de sobrepor, ") + n + " módulos DIN (chapa pintada, com porta)" : "PVC de embutir, " + n + " módulos DIN (porta fumê)", vals, ids);
  }
  var tiposQ = []; PADROES.forEach(function (n) { tiposQ.push(tipoQuadro(n, false)); }); PADROES.forEach(function (n) { tiposQ.push(tipoQuadro(n, true)); }); PADROES.forEach(function (n) { tiposQ.push(tipoQuadro(n, true, true)); });
  var famQuadro = def({
    id: "ele-quadro", nome: "Quadro de distribuição (montado pelo projeto)", categoria: "equipamento_eletrico", mep: "quadro", ids: ["quadro_pvc_embutir_12din", "quadro_metal_sobrepor_12din"],
    conectores: [con("el", "Eletroduto (entrada, por cima)", "0", "Altura_montagem + Altura/2", "Profundidade/2", { x: 0, y: 1, z: 0 })],
    descricao: "Quadro de distribuição com tudo dentro: corpo oco, aba de embutir, trilho DIN por fileira, espelho com a janela de cada fileira, barras de neutro (azul) e de terra (verde) e a porta (fumê no PVC, chapa no metálico; Porta_aberta). Os DISPOSITIVOS são montados pelo PROJETO: lê o Projeto_eletrico gravado pelo js/elecircuitos.js (geral → DPS → DR → disjuntores do DR → circuitos sem DR → reserva com tampa cega), com a etiqueta Cn de cada disjuntor; sem projeto, monta a quantidade de disjuntores 1P do tipo. Mesmos parâmetros do ra-quadro-distribuicao (Material_quadro, Instalacao, Disjuntores, Corrente) e mep.peca quadro: orçamento e eletroduto funcionam igual. Origem: no fundo do quadro (a parede), no meio da largura; a frente em +Z; Altura_montagem = o centro do quadro.",
    parametros: [
      Pf("Material_quadro", "texto", "pvc", "Elétrica", "pvc (de embutir) ou aco (chapa pintada) — o mesmo código do ra-quadro-distribuicao para o orçamento"),
      Pf("Instalacao", "texto", "embutir", "Elétrica", "embutir ou sobrepor"),
      Pf("Disjuntores", "inteiro", 12, "Elétrica", "Capacidade em módulos DIN (de 17,7 mm)"),
      Pf("Corrente", "texto", "", "Elétrica", "Barramento (aço): 100A, 150A"),
      Pf("Fileiras", "inteiro", 1, "Elétrica", "Fileiras de trilho DIN (derivado: altura ÷ 17,7 mm do catálogo)"),
      Pf("Modulos_fileira", "inteiro", 12, "Elétrica", "Módulos por fileira (derivado do catálogo)"),
      Pf("Largura", "comprimento", 0.381, "Dimensões", "Largura EXTERNA (com a aba de embutir) — catálogo"),
      Pf("Altura", "comprimento", 0.199, "Dimensões", "Altura EXTERNA (com a aba de embutir) — catálogo"),
      Pf("Profundidade", "comprimento", 0.1, "Dimensões", "Profundidade — catálogo"),
      Pf("Aba", "comprimento", 0.022, "Dimensões", "Largura da aba frontal de embutir (D da ficha Wavin); 0 = sobrepor"),
      Pf("Parede", "comprimento", 0.0025, "Dimensões", "Espessura da parede/chapa (PVC: usual, a ficha não publica; metálico: catálogo)"),
      Pf("Barra_N", "comprimento", 0.077, "Dimensões", "Comprimento da barra de neutro — catálogo (kit de barramento)"),
      Pf("Barra_T", "comprimento", 0.077, "Dimensões", "Comprimento da barra de terra — catálogo (kit de barramento)"),
      Pf("Material", "material", "plástico branco", "Materiais", "PVC antichama branco; metálico: chapa pintada"),
      Pf("Manipulo", "texto", "preto", "Materiais", "Cor dos manípulos dos disjuntores: preto (padrão RA) ou vermelho"),
      Pf("Altura_montagem", "comprimento", 1.50, "Restrições", "Do piso ao centro do quadro", "instancia"),
      Pf("Entrada_DN", "inteiro", 25, "Elétrica", "DN do eletroduto de entrada (informativo: o conector usa este DN)", "instancia"),
      Pf("Porta_aberta", "simnao", false, "Abertura", "Porta aberta (para ver os dispositivos) ou fechada. Só muda o desenho: a caixa envolvente é a do quadro fechado.", "instancia"),
      Pf("Projeto_eletrico", "texto", "", "Elétrica", "O projeto elétrico gravado pelo \"Circuitos e quadro\" (JSON); desenha os dispositivos na ordem da fileira. Vazio = só a quantidade de disjuntores.", "instancia")
    ].concat(paramFonte()),
    tipos: tiposQ,
    gerar: function (c, v) {
      var mont = montarQuadro(v.Projeto_eletrico, { capacidade: Math.max(1, Math.round(num(v.Disjuntores, 12))), fileiras: Math.max(1, Math.round(num(v.Fileiras, 1))), capFileira: Math.max(1, Math.round(num(v.Modulos_fileira, 12))), disjuntores: Math.round(num(v.Disjuntores, 12)) });
      mont.avisos.forEach(function (a) { (c.avisos = c.avisos || []).push(a); });
      var metal = txt(v.Material_quadro) === "aco" || num(v.Aba, 0) <= 0.001 && /sobrepor/.test(txt(v.Instalacao));
      G.quadro(c, { L: Math.max(0.12, num(v.Largura, 0.381)), A: Math.max(0.12, num(v.Altura, 0.199)), D: Math.max(0.06, num(v.Profundidade, 0.1)), aba: txt(v.Instalacao) === "embutir" ? num(v.Aba, 0.022) : 0,
        t: Math.min(0.006, Math.max(0.0008, num(v.Parede, 0.0025))), yc: num(v.Altura_montagem, 1.5), metal: metal, rows: Math.max(1, Math.round(num(v.Fileiras, 1))), capRow: Math.max(1, Math.round(num(v.Modulos_fileira, 12))),
        itens: mont.itens, portaAberta: sim(v, "Porta_aberta"), barraN: num(v.Barra_N, 0.077), barraT: num(v.Barra_T, 0.077), manipulo: txt(v.Manipulo) === "vermelho" ? "vermelho" : "preto" });
    }
  });

  /* =====================================================================
   * 6. SINAPI — só os códigos que JÁ existem (BimInstSinapi, EleTabelas); sem código → pendente
   * ===================================================================== */
  function alturaCaixa(a) {
    var A = { baixa: 0.30, media: 1.30, alta: 2.00 }, melhor = "baixa", d0 = Infinity; a = num(a, 0.30);
    Object.keys(A).forEach(function (k) { var d = Math.abs(A[k] - a); if (d < d0) { d0 = d; melhor = k; } });
    return melhor;
  }
  function pend(motivo) { return { status: "pendente", codigo: "", motivo: motivo }; }
  function porChave(chave, extraFiltro) {
    var BS = dep("BimInstSinapi", "biminstsinapi.js"), L = BS && BS.chaves && BS.chaves[chave];
    if (!L || !L.length) return null;
    var c = L[0];
    if (extraFiltro) { var f = L.filter(extraFiltro)[0]; if (f) c = f; }
    return { status: "ok", codigo: c[0], unidade: c[1], descricao: c[2], chave: chave };
  }
  function sinapi(famId, v) {
    v = v || {};
    var TB = dep("EleTabelas", "eletabelas.js");
    if (famId === "ele-caixa-4x2" || famId === "ele-caixa-4x4") {
      var mat = /^metal/i.test(txt(v.Material_caixa)) ? "metalica" : "pvc", ap = alturaCaixa(v.Altura_montagem), k = (famId === "ele-caixa-4x2" ? "caixa_4x2" : "caixa_4x4") + "|" + mat + "|" + ap + "|-";
      return porChave(k) || pend("a base de instalações não tem " + k);
    }
    if (famId === "ele-caixa-octogonal") {
      var m2 = /^metal/i.test(txt(v.Material_caixa)) ? "metalica" : "pvc", ap2 = txt(v.Aplicacao) === "forro" ? "forro" : "laje";
      return porChave("caixa_octogonal|" + m2 + "|" + ap2 + "|-") || pend("a base de instalações não tem a octogonal " + m2 + " " + ap2);
    }
    if (famId === "ele-disjuntor") {
      var p = Math.round(num(v.Polos, 1)), In = num(v.Corrente_A, 0);
      if (!TB) return pend("EleTabelas não carregou");
      if (In < 10) return pend("a SINAPI MG 06/2026 não tem disjuntor DIN de " + In + " A (a série começa em 10 A) — nunca o parecido");
      var d = TB.disjuntorCodigo(p, In);
      if (!d) return pend("acima do maior disjuntor da SINAPI");
      return d.provisorio ? { status: "provisorio", codigo: d.codigo, motivo: d.motivo } : { status: "ok", codigo: d.codigo, unidade: "UN" };
    }
    if (famId === "ele-dr") {
      var pd = Math.round(num(v.Polos, 2)), Id = num(v.Corrente_A, 0), cod = TB && TB.SINAPI.dr[pd] && TB.SINAPI.dr[pd][Id];
      return cod ? { status: "ok", codigo: cod, unidade: "UN" } : pend("a SINAPI MG 06/2026 não tem DR " + pd + "P " + Id + " A (30 mA tipo AC)");
    }
    if (famId === "ele-dps") {
      if (num(v.Imax_kA, 20) !== 20) return pend("a composição SINAPI do DPS é de 20 kA; o de " + num(v.Imax_kA, 0) + " kA não tem código — nunca o parecido");
      return TB ? { status: "ok", codigo: TB.SINAPI.dps, unidade: "UN", motivo: "DPS 20 kA, 175 V ou 275 V, 1 polo" } : pend("EleTabelas não carregou");
    }
    if (famId === "ele-quadro") {
      var n = Math.round(num(v.Disjuntores, 0)), ch = "quadro|" + txt(v.Material_quadro) + "|" + txt(v.Instalacao) + "|" + n;
      return porChave(ch, function (c) { return !txt(v.Corrente) || !c[3] || c[3].corrente === txt(v.Corrente); }) || pend("a SINAPI MG 06/2026 não tem o quadro " + txt(v.Material_quadro) + " " + txt(v.Instalacao) + " de " + n + " módulos");
    }
    if (famId === "ele-placa-4x2" || famId === "ele-placa-4x4" || famId === "ele-tampa-octogonal") return pend("a placa e a tampa avulsas não têm composição SINAPI (a placa vem no \"suporte e placa\" do módulo de tomada/interruptor)");
    return pend("sem composição SINAPI nas bases carregadas para " + famId);
  }

  /* o registro: entra na biblioteca (FamiliasMob → FamiliasRA) e fica o rótulo da cor na miniatura */
  var COR_MINI = { "pvc amarelo caixa": "#f2c500", "pvc laranja reforçado": "#e8731a", "aço galvanizado estampado": "#b9bec4", "plástico branco": "#f3f3f0", "acrílico": "#e4eef2", "acrílico translúcido": "#e4eef2", "plástico cinza din": "#d9d9d4",
    "manípulo preto": "#141414", "manípulo vermelho": "#c8201e", "cobre": "#b87333", "latão borne": "#c8a05a", "isolação azul": "#1f5fb4", "isolação verde-amarela": "#4fa02a", "isolação preta": "#1c1c1e", "isolação vermelha": "#c0282d",
    "isolação branca": "#eeeeea", "isolação cinza": "#8a8d90", "policarbonato fumê": "#4a545c", "botão de teste amarelo": "#f2c400", "indicador dps verde": "#2fb344" };
  if (FM && FM.CORES) Object.keys(COR_MINI).forEach(function (k) { FM.CORES[k] = COR_MINI[k]; });
  if (FM && FM.registrar) FM.registrar();

  var EleFamilias = {
    ids: function () { return LISTA_ID.slice(); },
    obter: function (id) { return FM.obter(id); },
    montarQuadro: montarQuadro, sinapi: sinapi, lerProjeto: lerProjeto,
    MATERIAIS_COR: COR_MINI, PADROES_QUADRO: PADROES.slice(), CAP_PADRAO: copia(CAP_PADRAO),
    /* aplica o Material_caixa a uma instância: o tipo pvc/metal já traz as cotas */
    tiposDe: function (id) { var f = FM.obter(id); return f ? f.tipos : []; }
  };
  void famCx42; void famCx44; void famOct; void famPl42; void famPl44; void famTampa; void famDisj; void famDr; void famDps; void famPente; void famTrilho; void famBN; void famBT; void famQuadro;
  global.EleFamilias = EleFamilias;
  if (typeof module !== "undefined" && module.exports) module.exports = EleFamilias;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

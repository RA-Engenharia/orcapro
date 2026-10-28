/* =====================================================================
 * familiasmob.js — BIBLIOTECA RA DE MOBILIÁRIO RESIDENCIAL (19/10/2026)
 *
 * Pedido do Rogério: distribuir móveis em todos os ambientes de uma casa contemporânea (estilo
 * caixote) para validar a arquitetura e gerar a planta humanizada, com peças de PROPORÇÃO e
 * DETALHE de produto (almofada, pé cônico, tampo com espessura, porta com friso, colchão +
 * cabeceira) e sem pesar a cena.
 *
 * COMO FUNCIONA. É uma família do js/familia.js com `geometria: "mob"`: os parâmetros, os tipos
 * (medidas de catálogo) e o quantitativo são os de qualquer família (Propriedades, tipo, instância);
 * a malha sai do gerador DESTE arquivo, com as ferramentas do js/mobgeo.js, e volta ao motor pelo
 * gancho `completar` (js/familia.js). As famílias entram na biblioteca por FamiliasRA.registrar.
 *
 * ORIGEM DAS PEÇAS (anotada na descrição de cada uma):
 *   · peça ENCOSTADA (sofá, rack, armário, cama, geladeira…): origem no PISO, no MEIO da largura,
 *     com o FUNDO da peça em Z = 0 e a frente em +Z — o ponto clicado é o da parede;
 *   · peça SOLTA (mesa, poltrona, ilha, tapete…): origem no PISO, no CENTRO da peça.
 * Giro (rotY) pelo posicionamento, como toda família.
 *
 * ⚠ REGRAS DA CASA (cada uma existe por um defeito que ela impede):
 *  1. Código de orçamento em BRANCO. Mobiliário não tem SINAPI: o quantitativo sai (unidade +
 *     quantidade) e a descrição diz "orçar à parte". Nunca inventar código nem preço.
 *  2. Medida de CATÁLOGO leva a fonte (tipo.fonte) e a data da consulta. Medida "usual de mercado" é
 *     dita assim na descrição do parâmetro — o engenheiro confere no modelo que for comprar.
 *  3. Nada de nome de cliente, endereço ou número de obra neste arquivo (test-cliente-nao-vaza).
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  var Mob = dep("Mob", "mobgeo.js");
  var PMov = dep("PartesMoveis", "partesmoveis.js");   /* porta, folha e gaveta que abrem (c.parte, js/mobgeo.js) */
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* ------------------------------------------------ MATERIAIS (nomes que o 3D conhece: js/bim.js FAM_PBR) */
  var MAT = {
    NOZ: "madeira nogueira", CLARA: "madeira clara", ESC: "madeira escura", DECK: "madeira deck", FREIJO: "madeira freijo",
    LACA: "laca branca", GRAFITE: "laca grafite", PRETO: "metal preto", INOX: "inox", CROMO: "metal cromado", LATAO: "latão",
    MARMORE: "marmore branco", QUARTZO: "quartzo branco", GRANITO: "granito preto", VIDRO: "vidro", ESPELHO: "espelho", FUME: "vidro fume",
    LOUCA: "louça branca", TELA: "tela preta", COURO: "couro caramelo", COLCHAO: "colchao", ROUPA: "roupa de cama", MANTA: "manta cinza",
    CONCRETO: "cimento queimado", TIJOLO: "tijolo refratario", PEDRA: "pedra cinza", ACRILICO: "acrilico branco", BORRACHA: "borracha preta",
    PALHA: "palha natural", LINHO: "linho natural", TERRA: "terra", CERAMICA: "ceramica terracota"
  };
  var TECIDOS = ["tecido cinza", "tecido bege", "tecido grafite", "tecido verde", "tecido terracota", "tecido azul", "linho natural", "couro caramelo"];

  var LISTA = [], GER = {}, SIMB = {};
  function P(nome, tipoDado, valor, grupo, descricao, escopo) {
    var o = { nome: nome, tipoDado: tipoDado, escopo: escopo || "tipo", valor: valor, grupo: grupo || "Dimensões" };
    if (descricao) o.descricao = descricao;
    return o;
  }
  function T(id, nome, valores, fonte) { var t = { id: id, nome: nome, valores: valores || {} }; if (fonte) t.fonte = fonte; return t; }
  var USUAL = "Medida usual de mercado — conferir o modelo comprado.";
  var ORIGEM_ENC = " Origem: no piso, no meio da largura, com o FUNDO em Z = 0 (encostar na parede) e a frente em +Z.";
  var ORIGEM_CEN = " Origem: no piso, no centro da peça.";
  var APARTE = " Mobiliário não tem composição SINAPI: orçar à parte (quantitativo em unidade).";
  function S(v, d) { return String(v == null || v === "" ? d : v).toLowerCase(); }

  /* ------------------------------------------------ FICHAS DE PRODUTO (LOTE 3a, 28/10/2026)
   * Cada modelo de mercado que virou TIPO tem aqui a ficha pública de onde saíram as cotas: [fabricante, endereço da ficha, data da consulta,
   * largura, profundidade, altura (cm), extras (cm)]. É a mesma pesquisa do docs/arquitetura/interiores/dados/catalogo-mobiliario.json (e
   * armarios-planejados.json para o closet); tools/test-familias-mob-catalogo.js confere cada linha contra esses arquivos, valor por valor.
   * O fabricante e o endereço ficam SÓ no dado (tipo.fonte); o nome do tipo na tela é genérico, sem marca. */
  var FICHAS = {
    "sofa-2l-oppa-nairobi-cinza-escuro": ["Oppa Design", "https://www.oppa.com.br/collections/sofa-2-lugares/products/sofa-2-lugares-nairobi-cinza-escuro", "2026-10-20", 180, 90, 83, {"altura_assento":44,"altura_braco":55,"vao_pes":15}],
    "sofa-3l-oppa-berlin-azul-210": ["Oppa Design", "https://www.oppa.com.br/collections/sofa-3-lugares/products/sofa-3-lugares-berlin-azul", "2026-10-20", 210, 90, 83, {"altura_assento":44,"altura_braco":56,"vao_pes":18}],
    "sofa-3l-tokstok-teo-deserto": ["Tok&Stok", "https://www.tokstok.com.br/sofa-3-lugares-mix-aveia-teo/p", "2026-10-20", 179, 74, 70, {"altura_assento":41,"altura_braco":59}],
    "sofa-3l-oppa-chanfre-bege-210": ["Oppa Design", "https://www.oppa.com.br/collections/sofa-3-lugares/products/sofa-3-lugares-chanfre-bege", "2026-10-20", 210, 89, 68, {"altura_assento":45,"altura_braco":62,"vao_pes":15}],
    "sofa-2l-oppa-arpoador-bege": ["Oppa Design", "https://www.oppa.com.br/collections/sofa-2-lugares/products/sofa-2-lugares-arpoador-bege", "2026-10-20", 110, 64, 73, {"altura_assento":43,"altura_braco":60}],
    "sofa-canto-tokstok-tablet-chaise-esq": ["Tok&Stok", "https://www.tokstok.com.br/sofa-3-lugares-c-chaise-esquerda-limao-siciliano-cinza-tablet/p", "2026-10-20", 212, 161, 69, {"altura_assento":41}],
    "sofa-canto-mobly-living-200-chaise": ["Mobly", "https://www.mobly.com.br/sofa-3-lugares-esquerdo-living-com-chaise-esquerdo-pe-palito-linho-cotton-azul-marinho-413488.html", "2026-10-20", 200, 160, 76, {"altura_assento":43}],
    "sofa-canto-montreal-gavea-238": ["Montreal", "https://www.madeiramadeira.com.br/sofa-de-canto-6-lugares-com-chaise-2-38m-industrial-suede-gavea-azul-776583.html", "2026-10-20", 238, 150, 85, {"altura_assento":43,"vao_pes":6}],
    "sofa-canto-imperio-bia-348": ["Império Estofados", "https://www.madeiramadeira.com.br/sofa-de-canto-6-lugares-com-chaise-bia-imperio-estofados-196317.html", "2026-10-20", 348, 206, 92, {"altura_assento":46,"vao_pes":6}],
    "poltrona-tokstok-win-camelo": ["Tok&Stok", "https://www.tokstok.com.br/poltrona-nozes-camelo-win/p", "2026-10-20", 69.5, 83.5, 73, {"altura_assento":42,"altura_braco":52}],
    "poltrona-oppa-moon-cappuccino": ["Oppa Design", "https://www.oppa.com.br/collections/poltrona/products/poltrona-giratoria-moon-cappuccino", "2026-10-20", 61, 63, 85, {"altura_assento":47}],
    "poltrona-tokstok-old-chap-couro": ["Tok&Stok", "https://www.tokstok.com.br/chap-poltrona-couro-nozes-old/p", "2026-10-20", 102, 82, 81, {"altura_assento":46,"altura_braco":57.5}],
    "poltrona-tokstok-leo-tauari": ["Tok&Stok", "https://www.tokstok.com.br/poltrona-tauari-leo/p", "2026-10-20", 56, 67, 68, {"altura_assento":38.5}],
    "mesa-centro-tokstok-allure-110x70": ["Tok&Stok", "https://www.tokstok.com.br/mesa-centro-1-10-m-x-70-cm-freijo-freijo-allure/p", "2026-10-20", 110, 70, 35, {"espessura_tampo":2.5}],
    "mesa-centro-tokstok-inglass-110x55": ["Tok&Stok", "https://www.tokstok.com.br/mesa-de-centro-1-10-m-x-55-cm-incolor-cromado-inglass/p", "2026-10-20", 110, 55, 35, {"espessura_tampo":1.2}],
    "mesa-centro-tokstok-sequence-120x55": ["Tok&Stok", "https://www.tokstok.com.br/mesa-de-centro-c-prateleira-1-20-m-x-55-cm-nozes-incolor-sequence/p", "2026-10-20", 120, 55, 40, {"espessura_tampo":0.3}],
    "mesa-centro-tokstok-jahari-redonda-80": ["Tok&Stok", "https://www.tokstok.com.br/mesa-de-centro-redonda-80-cm-preto-nozes-rustico-jahari/p", "2026-10-20", 80.2, 80.2, 35, {}],
    "mesa-centro-tokstok-pillen-baixa-redonda-90": ["Tok&Stok", "https://www.tokstok.com.br/de-centro-baixa-redonda-90-cm-pillen-freijo-mesa/p", "2026-10-20", 90, 90, 25, {}],
    "rack-oppa-kepler-gavetas-185": ["Oppa Design", "https://www.oppa.com.br/collections/rack-para-sala/products/rack-para-sala-com-gavetas-kepler-preto", "2026-10-20", 185, 40, 50, {"vao_pes":20}],
    "rack-tokstok-mid-century-120": ["Tok&Stok", "https://www.tokstok.com.br/1-20-m-x-36-cm-mid-century-i-preto-nozes-rack/p", "2026-10-20", 120, 36, 65.5, {}],
    "rack-tokstok-thrud-suspenso-200": ["Tok&Stok", "https://www.tokstok.com.br/suspenso-2-gavetas-2-m-x-38-cm-thrud-oak-tammi-rack/p", "2026-10-20", 200, 38, 25, {}],
    "rack-mobly-salah-painel-135": ["Mobly", "https://www.mobly.com.br/rack-com-painel-para-tv-ate-42-polegadas-salah-preto-135-cm-704073.html", "2026-10-20", 135, 34.3, 122, {}],
    "rack-cabecasa-cronos-painel-75": ["CabeCasa MadeiraMadeira", "https://www.madeiramadeira.com.br/rack-com-painel-para-tv-ate-75-polegadas-ripado-led-marrom-204x181cm-cronos-cabecasa-madeiraoriginal-865556.html", "2026-10-20", 181, 38, 204, {}],
    "aparador-tokstok-noah-110": ["Tok&Stok", "https://www.tokstok.com.br/aparador-1-10-m-x-38-cm-nozes-nozes-noah/p", "2026-10-20", 110, 38, 76.5, {}],
    "aparador-tokstok-niara-160": ["Tok&Stok", "https://www.tokstok.com.br/1-60-m-x-40-cm-niara-nozes-rustico-preto-aparador/p", "2026-10-20", 160, 40, 76, {}],
    "aparador-tokstok-mascavo-150": ["Tok&Stok", "https://www.tokstok.com.br/aparador-c-1-porta-basculante-1-50-m-x-37-cm-nozes-incolor-mascavo/p", "2026-10-20", 150, 37, 75, {}],
    "aparador-tokstok-armazem-2g-121": ["Tok&Stok", "https://www.tokstok.com.br/aparador-c-2-gavetas-1-21-m-x-37-cm-nozes-armazem/p", "2026-10-20", 121.7, 37, 76.5, {}],
    "aparador-oppa-tulum-136": ["Oppa Design", "https://www.oppa.com.br/collections/aparador-de-sala/products/aparador-136x41-cm-tulum", "2026-10-20", 136, 41, 85, {}],
    "tapete-mobly-sisal-redondo-200-camelo": ["Sisal / Mobly", "https://www.mobly.com.br/tapete-natural-redondo-sisal-200x200cm-camelo-727516.html", "2026-10-20", 200, 200, 0.5, {}],
    "tapete-saturs-felpudo-redondo-200-vermelho": ["Tapetes Saturs", "https://www.madeiramadeira.com.br/tapete-sala-felpudo-peludo-vermelho-redondo-200-cm-992059262.html", "2026-10-20", 200, 200, 1, {"altura_fios":3.5}],
    "tapete-magia-redondo-200-geometrico": ["Tapete Magia", "https://www.madeiramadeira.com.br/tapete-sala-redondo-200-cm-geometrico-celeste-preto-e-branco-680017260.html", "2026-10-20", 200, 200, 0.6, {}],
    "tapete-tellaio-caspio03-240x300": ["Tellaio", "https://www.madeiramadeira.com.br/tapete-sala-tellaio-caspio-03-2-40x3-00-420471877.html?origem=pla-420471877", "2026-10-20", 240, 300, 1, {}],
    "tapete-lancer-sisal-150x200-s561": ["Lancer", "https://www.madeiramadeira.com.br/tapete-sisal-sala-1-50-x-2-00-antiderrapante-preto-s-561-4457368.html", "2026-10-20", 150, 200, , {}],
    "mesa-jantar-4-tokstok-niara-redonda-110": ["Tok&Stok", "https://www.tokstok.com.br/mesa-redonda-1-10-m-preto-nozes-rustico-niara/p", "2026-10-20", 110, 110, 76, {}],
    "mesa-jantar-6-tokstok-mak-redonda-135": ["Tok&Stok", "https://www.tokstok.com.br/mesa-redonda-1-35-m-branco-branco-brilhante-mak/p", "2026-10-20", 135, 135, 77.5, {"espessura_tampo":2.5}],
    "mesa-jantar-6-tokstok-trevo-oval-165x90": ["Tok&Stok", "https://www.tokstok.com.br/mesa-oval-1-65-m-x-90-cm-nozes-trevo/p", "2026-10-20", 165.5, 90, 76.5, {"espessura_tampo":1.6}],
    "mesa-jantar-6-tokstok-quest-160x90": ["Tok&Stok", "https://www.tokstok.com.br/mesa-1-60-m-x-90-cm-nozes-branco-quest/p", "2026-10-20", 160.3, 90, 77.5, {}],
    "mesa-jantar-8-tokstok-organic-240x120": ["Tok&Stok", "https://www.tokstok.com.br/2-40-m-x-1-08-m-organic-freijo-freijo-mesa/p", "2026-10-20", 240, 120, 75, {"espessura_tampo":2.5}],
    "banqueta-bancada-tokstok-prosa": ["Tok&Stok", "https://www.tokstok.com.br/banco-alto-nozes-natural-prosa/p", "2026-10-20", 41, 50.5, 98, {"altura_assento":75}],
    "banqueta-bancada-tokstok-skand": ["Tok&Stok", "https://www.tokstok.com.br/banco-alto-cajueiro-japones-skand/p", "2026-10-20", 39, 47, 100, {"altura_assento":73}],
    "banqueta-bancada-tokstok-bent": ["Tok&Stok", "https://www.tokstok.com.br/banco-alto-ebanizado-cromado-bent/p", "2026-10-20", 41, 41, 81, {"altura_assento":67}],
    "banqueta-bancada-tokstok-ares-palhinha": ["Tok&Stok", "https://www.tokstok.com.br/banco-alto-com-palhinha-tauari-natural-ares/p", "2026-10-20", 45.5, 49.5, 96.5, {"altura_assento":73}],
    "cama-casal-tokstok-maboo-138": ["Tok&Stok", "https://www.tokstok.com.br/de-casal-1-38-m-maboo-preto-cama/p", "2026-10-20", 145, 198, 89, {}],
    "cama-casal-oppa-siena-estofada": ["Oppa Design", "https://www.oppa.com.br/products/cama-de-casal-estofada-siena", "2026-10-20", 162, 206, 120, {}],
    "cama-queen-oppa-siena-estofada": ["Oppa Design", "https://www.oppa.com.br/products/cama-de-queen-estofada-siena", "2026-10-20", 186, 216, 120, {}],
    "cama-king-abmaza-osaka-flutuante": ["Abmaza", "https://www.madeiramadeira.com.br/cama-box-king-osaka-flutuante-estilo-japonesa-193x203-base-estofada-linho-bege-abmaza-204566822.html?seller=16382", "2026-10-20", 193, 203, 27, {}],
    "cama-solteiro-tokstok-vila-88": ["Tok&Stok", "https://www.tokstok.com.br/cama-solteiro-88-cm-amendoa-amendoa-vila/p", "2026-10-20", 98, 197, 80, {}],
    "criado-mudo-tokstok-devon-3-gavetas": ["Tok&Stok", "https://www.tokstok.com.br/mesa-de-cabeceira-3-gavetas-amendoa-devon/p", "2026-10-20", 44, 43, 62.4, {}],
    "criado-mudo-tokstok-mascavo-1-gaveta": ["Tok&Stok", "https://www.tokstok.com.br/mesa-de-cabeceira-1-gaveta-nozes-mascavo/p", "2026-10-20", 55, 36.5, 63, {}],
    "criado-mudo-tokstok-palhandi-porta-correr": ["Tok&Stok", "https://www.tokstok.com.br/de-cabeceira-1-porta-de-correr-com-palhinha-palhandi-amendoa-natural-mesa/p", "2026-10-20", 54, 37.5, 56, {}],
    "criado-mudo-mobly-guara-nichos": ["Mobly", "https://www.mobly.com.br/mesa-de-cabeceira-guara-amendoa-e-preta-764588.html", "2026-10-20", 45, 30, 60, {}],
    "criado-mudo-tokstok-lin-1-gaveta": ["Tok&Stok", "https://www.tokstok.com.br/mesa-de-cabeceira-1-gaveta-branco-nozes-lin/p", "2026-10-20", 40, 35, 47, {}],
    "guarda-roupa-pronto-tokstok-mascavo-casal-2p-correr": ["Tok&Stok", "https://www.tokstok.com.br/guarda-roupa-2-portas-de-correr-nozes-mascavo/p", "2026-10-20", 200, 60, 220, {}],
    "guarda-roupa-pronto-yescasa-logan-4p": ["Yescasa", "https://www.madeiramadeira.com.br/guarda-roupa-4-portas-2-gavetas-logan-yescasa-branco-olmo-italiano-731594.html", "2026-10-20", 160.5, 56, 232.2, {}],
    "guarda-roupa-pronto-yescasa-ripado-6p-275": ["Yescasa", "https://www.madeiramadeira.com.br/guarda-roupa-casal-ripado-6-portas-6-gavetas-275cm-yescasa-marrom-cinamomo-859127.html", "2026-10-20", 275, 56, 232, {}],
    "guarda-roupa-pronto-tokstok-live-3p-2gav": ["Tok&Stok", "https://www.tokstok.com.br/3-portas-2-gavetas-live-flandres-guarda-roupa/p", "2026-10-20", 107.3, 47.3, 206, {}],
    "guarda-roupa-pronto-tokstok-wink-2p-4gav": ["Tok&Stok", "https://www.tokstok.com.br/guarda-roupa-2-portas-4-gavetas-natural-washed-branco-wink/p", "2026-10-20", 94, 45, 200, {}],
    "escrivaninha-tokstok-simple-90x45": ["Tok&Stok", "https://www.tokstok.com.br/escrivaninha-90-cm-x-45-cm-preto-preto-simple/p", "2026-10-20", 90, 45.2, 75, {}],
    "escrivaninha-tokstok-avril-110x55": ["Tok&Stok", "https://www.tokstok.com.br/escrivaninha-1-10-m-x-55-cm-natural-washed-branco-avril/p", "2026-10-20", 110, 55.5, 74, {"espessura_tampo":1.5}],
    "escrivaninha-tokstok-allure-170x72": ["Tok&Stok", "https://www.tokstok.com.br/1-gaveta-1-80-m-x-72-cm-allure-freijo-freijo-mesa/p", "2026-10-20", 170, 72, 75, {"espessura_tampo":2.5}],
    "escrivaninha-tokstok-niara-140x60": ["Tok&Stok", "https://www.tokstok.com.br/2-gavetas-1-40-m-x-60-cm-niara-nozes-rustico-preto-escrivaninha/p", "2026-10-20", 140, 60.5, 78, {}],
    "escrivaninha-tokstok-esgrima-185x80": ["Tok&Stok", "https://www.tokstok.com.br/1-80-m-x-80-cm-esgrima-konkret-mesa/p", "2026-10-20", 185, 80, 76, {"espessura_tampo":3}]
,
    "arauco-guia-closet": ["Arauco — Guia do Marceneiro (cap. 5, closet)", "https://arauco.com/brasil/wp-content/uploads/sites/17/2018/06/miolo_guia_marceneiros-2.pdf", "2026-10-20", 0, 55, 0, { calceiro: 75, maleiro: 45 }]
  };
  function cm(x) { return Math.round(x * 10) / 1000; }
  /* FT(ficha, id do tipo, nome genérico, mapa parâmetro → cota da ficha, valores fixos, nota): tipo cujas cotas vêm da ficha. "L", "P" e "A" são largura,
     profundidade e altura; as outras chaves são os extras da ficha (altura_assento, altura_braco, vao_pes, espessura_tampo…). O que a ficha NÃO traz entra em
     `fixos` e a nota diz qual é a medida usual adotada. Valor que a ficha não tem e o mapa pede = erro na carga (nunca zero em silêncio). */
  function FT(fid, tid, nome, mapa, fixos, nota) {
    var f = FICHAS[fid]; if (!f) throw new Error("ficha de mobiliário inexistente: " + fid);
    var dim = { L: f[3], P: f[4], A: f[5] }, ex = f[6] || {}, val = {}, partes = [];
    Object.keys(mapa || {}).forEach(function (k) {
      var src = mapa[k], dl = 0, x; if (Array.isArray(src)) { dl = src[1]; src = src[0]; } x = dim[src] != null ? dim[src] : ex[src];
      if (typeof x !== "number" || !(x > 0)) throw new Error("a ficha " + fid + " não traz \"" + src + "\" (parâmetro " + k + ")");
      val[k] = cm(x + dl);
    });
    Object.keys(fixos || {}).forEach(function (k) { val[k] = fixos[k]; });
    ["L", "P", "A"].forEach(function (k) { if (dim[k] > 0) partes.push(dim[k]); });
    var t = T(tid, nome, val, "Ficha pública de " + f[0] + ", consultada em " + f[2] + (partes.length ? " (" + partes.join(" × ") + " cm)" : "") + ": " + f[1] + (nota ? ". " + nota : ""));
    t.ficha = fid;
    return t;
  }

  /* def({id, nome, categoria, descricao, parametros, tipos, gerar, unidade, quantidade, quantDesc}) */
  function def(o) {
    var fam = {
      id: o.id, previa: "modelador", nome: o.nome, categoria: o.categoria || "mobiliario", hospedagem: "livre", geometria: "mob", mob: o.id, disciplina: "mobiliario",
      descricao: o.descricao + (o.semOrigem ? "" : (o.centro ? ORIGEM_CEN : ORIGEM_ENC)) + APARTE,
      parametros: o.parametros, tipos: o.tipos,
      quantitativo: { unidade: o.unidade || "un", quantidade: o.quantidade || "1", codigo: "", fonte: "", descricao: (o.quantDesc || o.nome) + " (orçar à parte)" }
    };
    if (o.fonteGeral) fam.fonteMedidas = o.fonteGeral;
    /* REVISÃO H7 (21/10/2026): serviços medidos da peça (o box: m² de vidro) — código vazio: só entram no orçamento com o código da
       instância (op "orcar", medida "servico:<id>"); sem eles o vidro em m² não casava com a peça em "un" (regra 2 do js/orcmodelo.js) */
    if (o.servicos) fam.servicos = o.servicos;
    /* PARTES MÓVEIS: a peça com porta/gaveta carrega o estado Aberto/Abertura na instância (o mesmo da pele de vidro); não entra no orçamento */
    if (o.moveis && PMov) fam.parametros = fam.parametros.concat(PMov.parametrosEstado());
    LISTA.push(fam); GER[o.id] = o.gerar; if (o.simbolo) SIMB[o.id] = o.simbolo;
    return fam;
  }

  /* ------------------------------------------------ PEÇAS COMUNS */
  var H = {};
  /* porta de armário: "liso" ou "friso" (moldura em relevo e miolo rebaixado). Frente em +Z; x,y,z = centro/base/face de trás */
  H.porta = function (c, mat, x, y, z, w, h, esp, estilo) {
    if (estilo === "friso" && w > 0.2 && h > 0.2) {
      var f = Math.min(0.06, w / 5), mi = esp * 0.55;
      c.caixa(mat, x, y, z, w, h, mi);
      c.caixa(mat, x, y, z + mi * 0.0, w, f, esp); c.caixa(mat, x, y + h - f, z, w, f, esp);
      c.caixa(mat, x - w / 2 + f / 2, y + f, z, f, h - 2 * f, esp); c.caixa(mat, x + w / 2 - f / 2, y + f, z, f, h - 2 * f, esp);
    } else c.caixaR(mat, x, y, z, w, h, esp, Math.min(0.006, esp / 2.5), { k: 1 });
  };
  /* puxador de barra (cilindro deitado) — vertical (eixo y) ou horizontal (eixo x) */
  H.puxador = function (c, x, y, z, comp, vertical, mat) {
    mat = mat || MAT.PRETO;
    if (vertical) { c.cil(mat, x, y - comp / 2, z + 0.03, 0.008, comp, { seg: 8 }); c.cil(mat, x, y - comp / 2 + 0.03, z, 0.005, 0.03, { seg: 6, rotX: 90, centro: true }); c.cil(mat, x, y + comp / 2 - 0.03, z, 0.005, 0.03, { seg: 6, rotX: 90, centro: true }); }
    else { c.cilH(mat, x, y, z + 0.03, 0.008, comp, "x", { seg: 8 }); c.cilH(mat, x - comp / 2 + 0.03, y, z + 0.015, 0.005, 0.03, "z", { seg: 6 }); c.cilH(mat, x + comp / 2 - 0.03, y, z + 0.015, 0.005, 0.03, "z", { seg: 6 }); }
  };
  /* puxador cava (reentrância preta fina) */
  H.cava = function (c, x, y, z, comp, mat) { c.caixa(mat || MAT.PRETO, x, y, z, comp, 0.012, 0.012); };
  /* ------------------------------------------------ PARTES MÓVEIS (porta, folha, gaveta — js/partesmoveis.js)
   * O 3D abre a parte no clique. Tudo o que `fn` desenha vira a parte; as coordenadas do eixo são as da PEÇA (as mesmas do desenho).
   *   H.giro(c, id, hx, hy, hz, lado, fn[, ang])  porta de giro que abre para a FRENTE (+Z): (hx, hz) = a dobradiça (borda da folha, meio da
   *       espessura), hy = meio da altura; lado = -1 dobradiça à ESQUERDA (a folha vai para +X) ou +1 à direita. Abre 105° (porta de armário).
   *   H.gaveta(c, id, curso, fn)                  gaveta que sai para a frente (+Z) o `curso` (= profundidade da gaveta x fração).
   *   H.correr(c, id, dx, fn)                     folha de correr: anda `dx` em X (o sinal manda; o curso é |dx|).
   *   H.gavetaCaixa(c, mat, x, y, zFrente, w, h, prof)  o corpo da gaveta (fundo, laterais, traseira) atrás da frente — anda junto. */
  H.giro = function (c, id, hx, hy, hz, lado, fn, ang) { c.parte(id, { tipo: "giro", eixo: [hx, hy, hz], angulo: ang || 105, sentido: lado < 0 ? -1 : 1 }, fn); };
  H.gaveta = function (c, id, curso, fn) { c.parte(id, { tipo: "gaveta", vetor: [0, 0, 1], curso: curso }, fn); };
  H.correr = function (c, id, dx, fn) { c.parte(id, { tipo: "correr", vetor: [dx < 0 ? -1 : 1, 0, 0], curso: Math.abs(dx) }, fn); };
  H.gavetaCaixa = function (c, mat, x, y, zf, w, h, prof) {
    var e = 0.012, ww = Math.max(0.05, w - 0.05), hh = Math.max(0.04, h - 0.05), pp = Math.max(0.08, prof);
    c.caixa(mat, x, y + 0.02, zf - pp / 2, ww, e, pp);                                              // fundo
    c.caixa(mat, x - ww / 2 + e / 2, y + 0.02, zf - pp / 2, e, hh, pp); c.caixa(mat, x + ww / 2 - e / 2, y + 0.02, zf - pp / 2, e, hh, pp);   // laterais
    c.caixa(mat, x, y + 0.02, zf - pp + e / 2, ww, hh, e);                                           // traseira
  };
  /* pé de móvel afunilado */
  H.pe = function (c, mat, x, z, alt, topo, base, giroX, giroZ) { c.tronco(mat, x, 0, z, base, base, topo, topo, alt, { rotX: giroX, rotZ: giroZ }); };
  /* almofada de decoração */
  H.almofada = function (c, mat, x, y, z, lado, giroY, inclina) { c.caixaR(mat, x, y, z, lado, lado, lado * 0.28, lado * 0.12, { k: 2, rotY: giroY || 0, rotX: inclina == null ? -12 : inclina }); };
  /* haste entre dois pontos (a ponta de baixo em a): perna aberta, travessa inclinada, barra de estrutura. r0 = raio em a, r1 = raio em b.
     A direção sai de duas rotações exatas: rotZ = −asin(dx/L), depois rotX = atan2(dz, dy) (o js/mobgeo.js gira rotZ e então rotX). */
  H.barra = function (c, mat, a, b, r0, r1, seg) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz), t;
    if (L < 1e-4) return;
    if (dy < 0) { t = a; a = b; b = t; dx = -dx; dy = -dy; dz = -dz; var q = r0; r0 = r1 == null ? r0 : r1; r1 = q; }
    c.cil(mat, a[0], a[1], a[2], r0, L, { r2: r1 == null ? r0 : r1, rotZ: -Math.asin(clamp(dx / L, -1, 1)) * 180 / Math.PI, rotX: Math.atan2(dz, dy) * 180 / Math.PI, seg: seg || 8 });
  };
  /* cadeira de jantar estofada, olhando para +Z (o assento voltado para +Z, o encosto em −Z). Enxuta (≈ 300 triângulos): a mesa de 8 lugares
     leva 8 cadeiras e a peça inteira tem de ficar sob o teto de 4.000 triângulos (LOTE 3a). */
  H.cadeiraJantar = function (c, tec, madeira) {
    var L = 0.46, hA = 0.46;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.tronco(madeira, s[0] * (L / 2 - 0.03), 0, s[1] * (L / 2 - 0.03), 0.045, 0.045, 0.03, 0.03, hA - 0.07, { rotX: s[1] * -4, rotZ: s[0] * 4 }); });
    c.caixa(madeira, 0, hA - 0.07, 0, L, 0.035, L);
    c.caixaR(tec, 0, hA - 0.035, 0.005, L - 0.02, 0.06, L - 0.02, 0.025);
    c.caixa(madeira, -L / 2 + 0.03, hA - 0.035, -L / 2 + 0.03, 0.04, 0.46, 0.035, { rotX: 8 });
    c.caixa(madeira, L / 2 - 0.03, hA - 0.035, -L / 2 + 0.03, 0.04, 0.46, 0.035, { rotX: 8 });
    c.caixaR(tec, 0, hA + 0.14, -L / 2 + 0.05, L - 0.06, 0.30, 0.05, 0.02, { rotX: 8 });
  };
  H.banqueta = function (c, hs, d, tec, es) {
    var r = d / 2;
    [0, 90, 180, 270].forEach(function (g) { var a = g * Math.PI / 180; c.cil(es, Math.cos(a) * (r - 0.04), 0, Math.sin(a) * (r - 0.04), 0.014, hs - 0.05, { r2: 0.011, rotZ: -Math.cos(a) * 5, rotX: Math.sin(a) * 5, seg: 8 }); });
    c.torno(es, 0, hs * 0.32, 0, [[r - 0.03, 0], [r - 0.03, 0.015], [r - 0.045, 0.015], [r - 0.045, 0]], { seg: 24 });
    c.cil(es, 0, hs - 0.06, 0, r - 0.02, 0.02, { seg: 24 });
    c.torno(tec, 0, hs - 0.05, 0, [[0, 0], [r, 0.0], [r, 0.04], [r - 0.02, 0.05], [0, 0.055]], { seg: 28 });
  };
  /* carcaça aberta na frente (fundo, laterais, tampo e base de 18 mm): o nicho enxerga o fundo */
  H.carcaca = function (c, mat, x, y, z, w, h, d) {
    var e = 0.018;
    c.caixa(mat, x - w / 2 + e / 2, y, z, e, h, d); c.caixa(mat, x + w / 2 - e / 2, y, z, e, h, d);
    c.caixa(mat, x, y + h - e, z, w - 2 * e, e, d); c.caixa(mat, x, y, z, w - 2 * e, e, d); c.caixa(mat, x, y + e, z - d / 2 + 0.005, w - 2 * e, h - 2 * e, 0.01);
  };
  H.MAT = MAT; H.TECIDOS = TECIDOS; H.P = P; H.T = T; H.def = def; H.USUAL = USUAL; H.clamp = clamp; H.num = num;

  /* ================================================================ SALA */
  var P_TEC = function (padrao) { return P("Tecido", "material", padrao || "tecido cinza", "Materiais", "Revestimento do estofado: " + TECIDOS.join(", ") + "."); };

  /* ---- sofá reto e em L ----
   * LOTE 3a (28/10/2026): a forma muda pelo MODELO (parâmetros de tipo Estilo_*), as cotas vêm da ficha do produto:
   *   Estilo_braco   reto | rolo (braço enrolado) | madeira (montantes de madeira com almofada fina)
   *   Estilo_pe      conico | palito (metal, aberto para fora) | rodape (saia de madeira + pés curtos)
   *   Estilo_encosto solto (almofadas inclinadas) | botone (painel fixo com botões)
   * Os tipos antigos não trazem nenhum Estilo_*: valem os padrões (reto, cônico, solto) e as cotas de sempre. */
  function gerarSofa(c, v, emL) {
    var W = v.Largura, D = v.Profundidade, Ht = v.Altura, hs = v.Altura_assento, br = v.Braco, n = Math.max(1, Math.round(v.Lugares)), tec = v.Tecido, madeira = v.Pe;
    var eBr = S(v.Estilo_braco, "reto"), ePe = S(v.Estilo_pe, "conico"), eEn = S(v.Estilo_encosto, "solto");
    var peH = v.Vao_pes > 0 ? clamp(v.Vao_pes, 0.04, hs - 0.22) : 0.13, cushT = 0.17, cushY = hs - cushT + 0.01;
    var ha = v.Altura_braco > 0 ? v.Altura_braco : hs + 0.17, mBr = eBr === "madeira";
    if (mBr) br = Math.min(br, 0.10);
    var Wc = emL ? clamp(v.Largura_chaise, 0.7, W - 2 * br - 0.5) : 0, Lc = emL ? Math.max(v.Comprimento_chaise, D + 0.2) : D;
    var lado = String(v.Lado_chaise).toLowerCase() === "esquerda" ? -1 : 1;
    // pés
    var ptsPe = [[-W / 2 + 0.1, 0.1], [W / 2 - 0.1, 0.1], [-W / 2 + 0.1, D - 0.1], [W / 2 - 0.1, D - 0.1]];
    if (emL) { ptsPe.push([lado * (W / 2 - 0.1), Lc - 0.1]); ptsPe.push([lado * (W / 2 - Wc + 0.1), Lc - 0.1]); }
    if (mBr) {   // montantes de madeira: pé da frente e de trás de cada lado sobem até o braço; trilho no topo
      [-1, 1].forEach(function (s) {
        var xs = s * (W / 2 - 0.02);
        [0.05, D - 0.05].forEach(function (z) { c.caixaR(madeira, xs, 0, z, 0.04, ha, 0.05, 0.008, { k: 1 }); });
        c.caixaR(madeira, xs, ha - 0.035, D / 2, 0.04, 0.035, D - 0.05, 0.008, { k: 1 });
        c.caixa(madeira, xs, peH + 0.02, D / 2, 0.03, 0.04, D - 0.05);
      });
    } else if (ePe === "palito") {
      ptsPe.forEach(function (p) { var sx = p[0] > 0 ? 1 : -1, sz = p[1] > D / 2 ? 1 : -1; H.barra(c, madeira, [p[0] + sx * 0.035, 0, p[1] + sz * 0.035], [p[0], peH + 0.01, p[1]], 0.011, 0.019, 8); });
    } else if (ePe === "rodape") {
      var yS = peH - 0.05;
      c.caixa(madeira, 0, yS, 0.012, W - 0.01, 0.05, 0.024); c.caixa(madeira, 0, yS, D - 0.012, W - 0.01, 0.05, 0.024);
      [-1, 1].forEach(function (s) { c.caixa(madeira, s * (W / 2 - 0.012), yS, D / 2, 0.024, 0.05, D - 0.05); });
      ptsPe.forEach(function (p) { c.tronco(madeira, p[0], 0, p[1], 0.05, 0.05, 0.036, 0.036, yS + 0.005); });
    } else ptsPe.forEach(function (p) { c.tronco(madeira, p[0], 0, p[1], 0.05, 0.05, 0.036, 0.036, peH + 0.01, { rotX: 0 }); });
    // estrutura (caixa baixa) e braços
    c.caixaR(tec, 0, peH, D / 2, W, cushY - peH, D, 0.03, { k: 1 });
    if (emL) c.caixaR(tec, lado * (W / 2 - Wc / 2), peH, (D + Lc) / 2 - 0.01, Wc, cushY - peH, Lc - D + 0.02, 0.03, { k: 1 });
    [-1, 1].forEach(function (s) {
      var comprim = (emL && s === lado) ? Lc : D, xb = s * (W / 2 - br / 2);
      if (eBr === "rolo") {
        var rr = br / 2;
        c.caixaR(tec, xb, peH, comprim / 2, br, ha - rr - peH, comprim, Math.min(0.05, br / 3));
        c.cilH(tec, xb, ha - rr, comprim / 2, rr, comprim, "z", { seg: 14 });
      } else if (mBr) c.caixaR(tec, s * (W / 2 - 0.04 - br / 2), cushY, D / 2, br, ha - 0.04 - cushY, D - 0.12, 0.03);
      else c.caixaR(tec, xb, peH, comprim / 2, br, ha - peH, comprim, Math.min(0.05, br / 3));
    });
    // encosto
    var wi = W - 2 * br, wn = wi / n, i;
    if (eEn === "botone") {   // painel fixo com botões (tufting)
      c.caixaR(tec, 0, cushY, 0.075, wi, Ht - cushY, 0.15, 0.05, { k: 1 });
      var nbx = Math.max(2, Math.round(wi / 0.3)), alt0 = cushY + cushT + 0.1, alt1 = Ht - 0.12;
      for (var bi = 0; bi < nbx; bi++) for (var bj = 0; bj < 2; bj++) {
        var xk = -wi / 2 + wi * (bi + 0.5) / nbx, yk = bj ? alt1 : alt0;
        c.elipsoide(tec, xk, yk, 0.152, 0.014, 0.014, 0.007, { seg: 8, aneis: 3 });
      }
      for (i = 0; i < n; i++) c.caixaR(tec, -wi / 2 + wn * (i + 0.5), cushY, 0.15 + (D - 0.15) / 2, wn - 0.012, cushT, D - 0.15 - 0.015, 0.055);
    } else {
      c.caixaR(tec, 0, cushY, 0.095, wi, Ht - 0.1 - cushY, 0.19, 0.04, { k: 1 });
      for (i = 0; i < n; i++) {
        var xi = -wi / 2 + wn * (i + 0.5);
        c.caixaR(tec, xi, cushY + cushT - 0.02, 0.28, wn - 0.012, (Ht - 0.013 - (cushY + cushT - 0.02)) / 0.988, 0.17, 0.06, { rotX: -9 });
        c.caixaR(tec, xi, cushY, 0.19 + (D - 0.19) / 2, wn - 0.012, cushT, D - 0.19 - 0.015, 0.055);
      }
    }
    if (emL) {   // chaise: almofada comprida
      c.caixaR(tec, lado * (W / 2 - Wc / 2 - br / 2 + 0.005), cushY, D + (Lc - D) / 2 - 0.005, Wc - br - 0.012, cushT, Lc - D + 0.005, 0.055);
    }
    // almofadas de decoração
    var na = Math.max(0, Math.round(v.Almofadas)), cor = v.Cor_almofada;
    for (var k = 0; k < na; k++) {
      var sg = (k % 2 === 0) ? -1 : 1, off = Math.floor(k / 2) * 0.19;
      H.almofada(c, cor, sg * (wi / 2 - 0.27 - off), hs + 0.02, 0.36 + (k % 3) * 0.02, 0.42, sg * -14, -14);
    }
  }
  var PAR_SOFA = function (L) {
    return [P("Largura", "comprimento", L, "Dimensões", "Largura total, com os braços. " + USUAL), P("Profundidade", "comprimento", 0.95, "Dimensões", USUAL), P("Altura", "comprimento", 0.88, "Dimensões", "Até o topo do encosto. " + USUAL),
      P("Altura_assento", "comprimento", 0.45, "Dimensões", "Do piso ao topo da almofada do assento. " + USUAL), P("Braco", "comprimento", 0.16, "Dimensões", "Largura de cada braço"),
      P("Lugares", "inteiro", 3, "Dimensões", "Almofadas de assento e encosto"), P("Almofadas", "inteiro", 2, "Construção", "Almofadas de decoração (0 a 4)"),
      P("Altura_braco", "comprimento", 0, "Dimensões", "Do piso ao topo do braço. 0 = automático (assento + 0,17 m)"), P("Vao_pes", "comprimento", 0, "Dimensões", "Vão livre sob o sofá (altura dos pés). 0 = automático (0,13 m)"),
      P("Estilo_braco", "texto", "reto", "Construção", "reto, rolo (braço enrolado) ou madeira (montantes de madeira)"), P("Estilo_pe", "texto", "conico", "Construção", "conico, palito (metal aberto) ou rodape (saia de madeira)"),
      P("Estilo_encosto", "texto", "solto", "Construção", "solto (almofadas inclinadas) ou botone (painel fixo com botões)"),
      P_TEC("tecido cinza"), P("Cor_almofada", "material", "tecido terracota", "Materiais"), P("Pe", "material", "madeira escura", "Materiais", "Material dos pés")];
  };
  def({
    id: "ra-mob-sofa-reto", nome: "Sofá reto 2 a 4 lugares", descricao: "Sofá estofado com estrutura baixa, braços, almofadas de assento e encosto inclinado, almofadas de decoração e pés. Os modelos de mercado mudam o braço (reto, enrolado, de madeira), o pé (cônico, palito, saia de madeira) e o encosto (almofadado ou com botões); as cotas vêm da ficha do produto.",
    parametros: PAR_SOFA(2.10),
    tipos: [T("s2", "2 lugares — 1,60 m", { Largura: 1.60, Lugares: 2, Almofadas: 2 }), T("s3", "3 lugares — 2,10 m", {}), T("s3g", "3 lugares — 2,30 m", { Largura: 2.30 }), T("s4", "4 lugares — 2,60 m", { Largura: 2.60, Lugares: 4, Almofadas: 4 }),
      FT("sofa-2l-oppa-nairobi-cinza-escuro", "s2-reto", "Sofá reto 2 lugares — braço reto baixo, pés cônicos", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento", Altura_braco: "altura_braco", Vao_pes: "vao_pes" }, { Lugares: 2, Almofadas: 0, Tecido: "tecido grafite" }),
      FT("sofa-3l-oppa-berlin-azul-210", "s3-fino", "Sofá reto 3 lugares — braço fino, pés palito de metal", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento", Altura_braco: "altura_braco", Vao_pes: "vao_pes" }, { Lugares: 3, Almofadas: 0, Braco: 0.10, Estilo_pe: "palito", Pe: "metal preto", Tecido: "tecido azul" }),
      FT("sofa-3l-oppa-chanfre-bege-210", "s3-saia", "Sofá reto 3 lugares — encosto baixo, saia de madeira", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento", Altura_braco: "altura_braco", Vao_pes: "vao_pes" }, { Lugares: 3, Almofadas: 0, Estilo_pe: "rodape", Pe: "madeira nogueira", Tecido: "linho natural" }),
      FT("sofa-3l-tokstok-teo-deserto", "s3-rolo", "Sofá reto 3 lugares — braço enrolado, encosto com botões", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento", Altura_braco: "altura_braco" }, { Lugares: 3, Almofadas: 0, Braco: 0.15, Estilo_braco: "rolo", Estilo_encosto: "botone", Vao_pes: 0.10, Pe: "madeira nogueira", Tecido: "linho natural" }, "O vão dos pés não consta da ficha: 0,10 m, medida usual."),
      FT("sofa-2l-oppa-arpoador-bege", "s2-madeira", "Sofá reto 2 lugares — montantes de madeira nos braços", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento", Altura_braco: "altura_braco" }, { Lugares: 2, Almofadas: 0, Estilo_braco: "madeira", Vao_pes: 0.20, Pe: "madeira clara", Tecido: "tecido bege" }, "O vão dos pés não consta da ficha: 0,20 m, medida usual.")],
    gerar: function (c, v) { gerarSofa(c, v, false); }
  });
  def({
    id: "ra-mob-sofa-l", nome: "Sofá em L com chaise", descricao: "Sofá com chaise comprida em uma das pontas. O lado e o tamanho da chaise são parâmetros. Os modelos de mercado mudam o pé (cônico, palito) e a altura do vão; as cotas vêm da ficha do produto.",
    parametros: PAR_SOFA(2.80).concat([P("Largura_chaise", "comprimento", 1.00, "Dimensões", "Largura da chaise"), P("Comprimento_chaise", "comprimento", 1.60, "Dimensões", "Profundidade total até a ponta da chaise"), P("Lado_chaise", "texto", "direita", "Construção", "direita ou esquerda (vista de frente)", "instancia")]),
    tipos: [T("l260", "Chaise à direita — 2,60 m", { Largura: 2.60, Lugares: 3 }), T("l280", "Chaise à direita — 2,80 m", { Lugares: 3 }), T("l320", "Chaise à direita — 3,20 m", { Largura: 3.20, Lugares: 4, Almofadas: 4 }), T("l280e", "Chaise à esquerda — 2,80 m", { Lado_chaise: "esquerda" }),
      FT("sofa-canto-mobly-living-200-chaise", "l200-palito", "Sofá 3 lugares com chaise à esquerda — pés palito", { Largura: "L", Comprimento_chaise: "P", Altura: "A", Altura_assento: "altura_assento" }, { Lugares: 3, Almofadas: 0, Lado_chaise: "esquerda", Profundidade: 0.88, Estilo_pe: "palito", Vao_pes: 0.18, Pe: "metal preto", Tecido: "tecido azul", Largura_chaise: 0.85 }, "Profundidade do assento, largura da chaise e vão dos pés não constam da ficha: 0,88 m, 0,85 m e 0,18 m, medidas usuais."),
      FT("sofa-canto-montreal-gavea-238", "l238", "Sofá de canto com chaise à direita — pés baixos", { Largura: "L", Comprimento_chaise: "P", Altura: "A", Altura_assento: "altura_assento", Vao_pes: "vao_pes" }, { Lugares: 4, Almofadas: 0, Profundidade: 0.90, Tecido: "tecido grafite", Largura_chaise: 0.95 }, "Profundidade do assento e largura da chaise não constam da ficha: 0,90 m e 0,95 m, medidas usuais."),
      FT("sofa-canto-imperio-bia-348", "l348", "Sofá de canto grande com chaise à direita", { Largura: "L", Comprimento_chaise: "P", Altura: "A", Altura_assento: "altura_assento", Vao_pes: "vao_pes" }, { Lugares: 5, Almofadas: 0, Profundidade: 0.95, Tecido: "tecido bege", Largura_chaise: 1.10 }, "Profundidade do assento e largura da chaise não constam da ficha: 0,95 m e 1,10 m, medidas usuais.")],
    gerar: function (c, v) { gerarSofa(c, v, true); }
  });

  /* ---- poltrona ----
   * Estilo: estofada (a de sempre) | escandinava (estrutura de madeira, braço inclinado, almofadas soltas) | giratoria (concha com base de 4 pernas
   * cruzadas) | clube (braço enrolado, couro) | moldada (assento e encosto de compensado moldado sobre estrutura de madeira). */
  function gerarPoltrona(c, v) {
    var W = v.Largura, D = v.Profundidade, Ht = v.Altura, hs = v.Altura_assento, tec = v.Tecido, mp = v.Pe, br = 0.14, est = S(v.Estilo, "estofada");
    var ha = v.Altura_braco > 0 ? v.Altura_braco : hs + 0.13;
    if (est === "escandinava") {
      [-1, 1].forEach(function (s) {
        var xs = s * (W / 2 - 0.021);
        H.barra(c, mp, [xs, 0, D / 2 - 0.021], [xs, ha - 0.02, D / 2 - 0.021], 0.021, 0.019, 8);                                   // montante da frente
        H.barra(c, mp, [xs, 0, -D / 2 + 0.2], [xs, Ht - 0.017, -D / 2 + 0.02], 0.019, 0.017, 8);                                         // montante de trás, inclinado até o topo do encosto
        H.barra(c, mp, [xs, ha, D / 2 - 0.021], [xs, ha + 0.04, -D / 2 + 0.1], 0.016, 0.016, 8);                                 // braço, subindo para trás
        c.caixa(mp, xs, hs - 0.2, 0.0, 0.035, 0.035, D - 0.2);                                                                    // travessa do assento
      });
      c.caixaR(tec, 0, hs - 0.14, 0.04, W - 0.1, 0.12, D * 0.72, 0.05);                                                          // almofada do assento
      c.caixaR(tec, 0, hs - 0.04, -D / 2 + 0.17, W - 0.1, Ht - hs - 0.02, 0.1, 0.05, { rotX: -16 });                              // almofada do encosto
    } else if (est === "giratoria") {
      var rs = Math.min(W, D) / 2;
      c.prisma(tec, 0, hs - 0.09, 0, Mob.contornoElipse(W / 2 - 0.04, D / 2 - 0.02, 24), 0.08);                                         // assento
      c.caixaR(tec, 0, hs - 0.02, -D / 2 + 0.07, W - 0.1, Ht - hs + 0.02, 0.07, 0.035, { k: 1, rotX: -10 });                       // concha do encosto
      [-1, 1].forEach(function (s) { c.caixaR(tec, s * (W / 2 - 0.045), hs - 0.02, -D / 2 + 0.13, 0.05, 0.3, 0.13, 0.02, { rotZ: -s * 4 }); });   // abas da concha
      c.cil(mp, 0, hs - 0.14, 0, 0.03, 0.06, { seg: 10 });
      for (var q = 0; q < 4; q++) { var a = (45 + 90 * q) * Math.PI / 180; H.barra(c, mp, [Math.cos(a) * (W / 2 - 0.03) * 0.95, 0, Math.sin(a) * (D / 2 - 0.02) * 0.95], [0, hs - 0.1, 0], 0.016, 0.024, 8); }
    } else if (est === "clube") {
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.tronco(MAT.PRETO, s[0] * (W / 2 - 0.1), 0, s[1] * (D / 2 - 0.1), 0.07, 0.07, 0.055, 0.055, 0.08); });
      c.caixaR(tec, 0, 0.07, 0, W, hs - 0.07 - 0.02, D, 0.05, { k: 1 });
      c.caixaR(tec, 0, hs - 0.12, 0.05, W - 2 * br - 0.04, 0.14, D - 0.2, 0.06);
      [-1, 1].forEach(function (s) {
        c.caixaR(tec, s * (W / 2 - br / 2), 0.07, 0, br, ha - 0.07 - br / 2, D, 0.05);
        c.cilH(tec, s * (W / 2 - br / 2), ha - br / 2, 0, br / 2, D, "z", { seg: 14 });
      });
      c.caixaR(tec, 0, hs - 0.06, -D / 2 + 0.17, W - 0.02, Ht - hs + 0.06, 0.24, 0.1, { k: 1, rotX: -8 });
    } else if (est === "moldada") {
      [-1, 1].forEach(function (s) {
        var xs = s * (W / 2 - 0.02);
        H.barra(c, mp, [xs, 0, D / 2 - 0.02], [xs, hs - 0.08, D / 2 - 0.12], 0.02, 0.018, 8);
        H.barra(c, mp, [xs, 0, -D / 2 + 0.1], [xs, hs - 0.08, -D / 2 + 0.2], 0.02, 0.018, 8);
        H.barra(c, mp, [xs, hs - 0.08, -D / 2 + 0.2], [xs, Ht - 0.016, -D / 2 + 0.02], 0.018, 0.016, 8);
      });
      c.caixa(mp, 0, hs - 0.1, D / 2 - 0.18, W - 0.1, 0.035, 0.035); c.caixa(mp, 0, hs - 0.1, -D / 2 + 0.2, W - 0.1, 0.035, 0.035);
      c.caixaR(tec, 0, hs - 0.07, -0.01, W - 0.04, 0.03, D * 0.86, 0.012, { k: 1, rotX: 4 });                                      // assento moldado
      c.caixaR(tec, 0, hs - 0.04, -D / 2 + 0.17, W - 0.04, Ht - hs - 0.02, 0.03, 0.012, { k: 1, rotX: -26 });                    // encosto moldado
    } else {   // estofada (padrão)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { c.cil(mp, s[0] * (W / 2 - 0.1), 0, s[1] * (D / 2 - 0.1), 0.028, 0.2, { r2: 0.02, rotX: s[1] * 7, rotZ: -s[0] * 7, seg: 10 }); });
      c.caixaR(tec, 0, 0.17, 0, W, hs - 0.17 - 0.12, D, 0.04, { k: 1 });
      c.caixaR(tec, 0, hs - 0.14, 0.04, W - 2 * br, 0.15, D - 0.14, 0.06);
      [-1, 1].forEach(function (s) { c.caixaR(tec, s * (W / 2 - br / 2), 0.17, 0, br, hs + 0.13 - 0.17, D, 0.05); });
      c.caixaR(tec, 0, hs - 0.05, -D / 2 + 0.1, W - 2 * br + 0.02, Ht - hs + 0.03, 0.2, 0.07, { rotX: -12 });
    }
  }
  def({
    id: "ra-mob-poltrona", centro: true, nome: "Poltrona", descricao: "Poltrona com assento e encosto e pés. Os modelos de mercado mudam a construção: estofada de braços cheios, escandinava de madeira, giratória em concha, de clube em couro e de compensado moldado; as cotas vêm da ficha do produto.",
    parametros: [P("Largura", "comprimento", 0.80, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.85, "Dimensões", USUAL), P("Altura", "comprimento", 0.85, "Dimensões", USUAL), P("Altura_assento", "comprimento", 0.43, "Dimensões"),
      P("Altura_braco", "comprimento", 0, "Dimensões", "Do piso ao topo do braço. 0 = automático (assento + 0,13 m)"), P("Estilo", "texto", "estofada", "Construção", "estofada, escandinava, giratoria, clube ou moldada"), P_TEC("tecido bege"), P("Pe", "material", "madeira nogueira", "Materiais")],
    tipos: [T("p80", "80 × 85 cm", {}), T("p70", "70 × 75 cm (compacta)", { Largura: 0.70, Profundidade: 0.75, Altura: 0.82 }),
      FT("poltrona-tokstok-win-camelo", "p-esc", "Poltrona escandinava — estrutura de madeira, braço inclinado", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento", Altura_braco: "altura_braco" }, { Estilo: "escandinava", Tecido: "tecido cinza", Pe: "madeira nogueira" }),
      FT("poltrona-oppa-moon-cappuccino", "p-giro", "Poltrona giratória — concha com pernas cruzadas", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento" }, { Estilo: "giratoria", Tecido: "tecido bege", Pe: "madeira clara" }),
      FT("poltrona-tokstok-old-chap-couro", "p-clube", "Poltrona de clube — braço enrolado, couro", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento", Altura_braco: "altura_braco" }, { Estilo: "clube", Tecido: "couro caramelo" }),
      FT("poltrona-tokstok-leo-tauari", "p-mold", "Poltrona de compensado moldado — estrutura de madeira", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento" }, { Estilo: "moldada", Tecido: "madeira clara", Pe: "madeira clara" })],
    gerar: function (c, v) { gerarPoltrona(c, v); }
  });

  /* ---- mesa de centro ----
   * Estrutura: pes (os 4 pés e a cinta, de sempre) | pedestal (base cônica maciça) | vidro (lâmina de vidro dobrada em C) |
   * tripe (3 pernas de metal com aro) | tambor (cilindro) | moldura (moldura de madeira com tampo de vidro e prateleira). */
  def({
    id: "ra-mob-mesa-centro", centro: true, nome: "Mesa de centro", descricao: "Mesa baixa com tampo de espessura real. Formato redondo, oval ou retangular. Os modelos de mercado mudam a estrutura: pés, pedestal, vidro dobrado, tripé de metal, tambor e moldura com prateleira; as cotas vêm da ficha do produto.",
    parametros: [P("Formato", "texto", "retangular", "Dimensões", "retangular, redonda ou oval"), P("Largura", "comprimento", 1.00, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.60, "Dimensões"), P("Altura", "comprimento", 0.40, "Dimensões"), P("Espessura_tampo", "comprimento", 0.03, "Dimensões"),
      P("Estilo_estrutura", "texto", "pes", "Construção", "pes, pedestal, vidro, tripe, tambor ou moldura"), P("Prateleira", "simnao", false, "Construção", "Prateleira inferior (moldura)"),
      P("Tampo", "material", "marmore branco", "Materiais"), P("Estrutura", "material", "metal preto", "Materiais")],
    tipos: [T("r100", "Retangular 1,00 × 0,60", {}), T("r120", "Retangular 1,20 × 0,70 (marmore)", { Largura: 1.20, Profundidade: 0.70, Altura: 0.38 }), T("o90", "Redonda Ø 0,90", { Formato: "redonda", Largura: 0.90, Profundidade: 0.90, Altura: 0.38, Estrutura: "madeira escura", Tampo: "madeira nogueira" }), T("ov", "Oval 1,10 × 0,70", { Formato: "oval", Largura: 1.10, Profundidade: 0.70, Altura: 0.38 }),
      FT("mesa-centro-tokstok-allure-110x70", "m-ped", "Mesa de centro retangular — pedestal cônico, tampo com borda arredondada", { Largura: "L", Profundidade: "P", Altura: "A", Espessura_tampo: "espessura_tampo" }, { Estilo_estrutura: "pedestal", Tampo: "madeira freijo", Estrutura: "madeira freijo" }),
      FT("mesa-centro-tokstok-inglass-110x55", "m-vid", "Mesa de centro de vidro dobrado em C", { Largura: "L", Profundidade: "P", Altura: "A", Espessura_tampo: "espessura_tampo" }, { Estilo_estrutura: "vidro", Tampo: "vidro", Estrutura: "metal cromado" }),
      FT("mesa-centro-tokstok-sequence-120x55", "m-mol", "Mesa de centro com moldura de madeira, tampo de vidro e prateleira", { Largura: "L", Profundidade: "P", Altura: "A" }, { Estilo_estrutura: "moldura", Prateleira: true, Espessura_tampo: 0.003, Tampo: "vidro", Estrutura: "madeira escura" }, "Tampo de vidro de 3 mm, informado na ficha."),
      FT("mesa-centro-tokstok-jahari-redonda-80", "m-tri", "Mesa de centro redonda — tripé de metal com aro", { Largura: "L", Profundidade: "P", Altura: "A" }, { Formato: "redonda", Estilo_estrutura: "tripe", Espessura_tampo: 0.03, Tampo: "madeira nogueira", Estrutura: "metal preto" }, "A espessura do tampo não consta da ficha: 0,03 m, medida usual."),
      FT("mesa-centro-tokstok-pillen-baixa-redonda-90", "m-tam", "Mesa de centro redonda baixa — tambor de madeira", { Largura: "L", Profundidade: "P", Altura: "A" }, { Formato: "redonda", Estilo_estrutura: "tambor", Tampo: "madeira clara", Estrutura: "madeira clara" })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Hh = v.Altura, e = v.Espessura_tampo, f = String(v.Formato).toLowerCase(), est = S(v.Estilo_estrutura, "pes"), redondo = f === "redonda" || f === "oval";
      if (est === "pedestal") {
        c.caixaR(v.Tampo, 0, Hh - e, 0, W, e, D, Math.min(0.12, D / 4), { k: 1 });
        c.caixaR(v.Estrutura, 0, 0, 0, W * 0.62, Hh - e, D * 0.62, Math.min(0.08, D / 6), { k: 1 });
      } else if (est === "vidro") {   // uma lâmina de vidro dobrada: tampo + duas abas laterais com a quina arredondada
        c.caixa(v.Tampo, 0, Hh - e, 0, W, e, D);
        [-1, 1].forEach(function (s) { c.caixa(v.Tampo, s * (W / 2 - e / 2), 0, 0, e, Hh - e, D); [-1, 1].forEach(function (t) { c.caixa(v.Estrutura, s * (W / 2 - e / 2), 0, t * (D / 2 - 0.03), e, 0.006, 0.02); }); });
      } else if (est === "moldura") {
        var ep = 0.035, ye = Hh - 0.03;
        [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { c.caixaR(v.Estrutura, s * (W / 2 - ep / 2), 0, t * (D / 2 - ep / 2), ep, Hh, ep, 0.005, { k: 1 }); }); });
        c.caixa(v.Estrutura, 0, ye, D / 2 - ep / 2, W - 2 * ep, 0.03, ep); c.caixa(v.Estrutura, 0, ye, -D / 2 + ep / 2, W - 2 * ep, 0.03, ep);
        c.caixa(v.Estrutura, W / 2 - ep / 2, ye, 0, ep, 0.03, D - 2 * ep); c.caixa(v.Estrutura, -W / 2 + ep / 2, ye, 0, ep, 0.03, D - 2 * ep);
        c.caixa(v.Tampo, 0, Hh - e - 0.006, 0, W - 2 * ep + 0.01, e, D - 2 * ep + 0.01);
        if (v.Prateleira) c.caixaR(MAT.ESC, 0, 0.12, 0, W - 2 * ep + 0.01, 0.02, D - 2 * ep + 0.01, 0.004, { k: 1 });
      } else if (est === "tripe") {
        c.prisma(v.Tampo, 0, Hh - e, 0, Mob.contornoElipse(W / 2, D / 2, 40), e);
        for (var q = 0; q < 3; q++) { var a = (90 + 120 * q) * Math.PI / 180; H.barra(c, v.Estrutura, [Math.cos(a) * W * 0.4, 0, Math.sin(a) * D * 0.4], [Math.cos(a) * W * 0.15, Hh - e, Math.sin(a) * D * 0.15], 0.009, 0.009, 8); }
        c.torno(v.Estrutura, 0, 0.12, 0, [[W * 0.27, 0], [W * 0.27, 0.012], [W * 0.265, 0.012], [W * 0.265, 0]], { seg: 24 });
      } else if (est === "tambor") {
        c.prisma(v.Tampo, 0, 0, 0, Mob.contornoElipse(W / 2, D / 2, 44), Hh);
      } else if (redondo) {
        var ct = Mob.contornoElipse(W / 2, D / 2, 40);
        c.prisma(v.Tampo, 0, Hh - e, 0, ct, e);
        c.torno(v.Estrutura, 0, 0, 0, [[0.16, 0], [0.16, 0.012], [0.06, 0.03], [0.05, Hh - e - 0.02], [0.2, Hh - e]], { seg: 20, ez: D / W });
      } else {
        c.caixaR(v.Tampo, 0, Hh - e, 0, W, e, D, 0.006, { k: 1 });
        [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { c.caixa(v.Estrutura, s * (W / 2 - 0.06), 0, t * (D / 2 - 0.06), 0.025, Hh - e, 0.025); }); });
        c.caixa(v.Estrutura, 0, Hh - e - 0.03, D / 2 - 0.06, W - 0.1, 0.025, 0.025); c.caixa(v.Estrutura, 0, Hh - e - 0.03, -D / 2 + 0.06, W - 0.1, 0.025, 0.025);
        c.caixa(v.Estrutura, W / 2 - 0.06, Hh - e - 0.03, 0, 0.025, 0.025, D - 0.1); c.caixa(v.Estrutura, -W / 2 + 0.06, Hh - e - 0.03, 0, 0.025, 0.025, D - 0.1);
      }
    }
  });

  /* ---- rack + painel + TV ----
   * Estilo_rack: portas (as portas e o nicho de sempre) | gavetas (frentes de gaveta e nichos) | prateleiras (módulos abertos com divisórias) | suspenso (duas gavetas sem puxador)
   * Estilo_pe:   suspenso (de sempre) | palito (pés de madeira abertos) | x (estrutura de metal em X). Com_painel / Com_tv ligam o painel e a TV. */
  def({
    id: "ra-mob-rack-tv", moveis: true, nome: "Rack com painel e TV", descricao: "Rack com portas, gavetas ou nichos, painel de fundo com ripas e TV. A TV tem as proporções 16:9 da polegada escolhida (largura = 0,8719 × diagonal; altura = 0,4905 × diagonal). Os modelos de mercado mudam o corpo (portas, gavetas, prateleiras), os pés e a presença do painel; as cotas vêm da ficha do produto.",
    parametros: [P("Comprimento", "comprimento", 1.80, "Dimensões", "Comprimento do rack. " + USUAL), P("Profundidade", "comprimento", 0.40, "Dimensões"), P("Altura_rack", "comprimento", 0.40, "Dimensões"), P("Altura_pe", "comprimento", 0.20, "Dimensões", "Vão livre sob o rack (suspenso)"),
      P("TV_polegadas", "inteiro", 55, "TV", "Diagonal da tela, em polegadas"), P("Altura_centro_tv", "comprimento", 1.10, "TV", "Do piso ao centro da tela", "instancia"),
      P("Painel_largura", "comprimento", 2.40, "Painel"), P("Painel_altura", "comprimento", 2.40, "Painel", "Do piso ao topo do painel"), P("Painel_ripado", "simnao", true, "Painel"),
      P("Com_painel", "simnao", true, "Painel", "Painel de fundo (desligado: só o rack)"), P("Com_tv", "simnao", true, "TV", "Desenha a TV (desligado: só o móvel)"),
      P("Estilo_rack", "texto", "portas", "Construção", "portas, gavetas, prateleiras ou suspenso"), P("Estilo_pe", "texto", "suspenso", "Construção", "suspenso, palito ou x"),
      P("Rack", "material", "madeira nogueira", "Materiais"), P("Painel", "material", "madeira freijo", "Materiais")],
    tipos: [T("r180", "Rack 1,80 + TV 55\"", {}), T("r220", "Rack 2,20 + TV 65\"", { Comprimento: 2.20, TV_polegadas: 65, Painel_largura: 2.80 }), T("r260", "Rack 2,60 + TV 75\"", { Comprimento: 2.60, TV_polegadas: 75, Painel_largura: 3.20 }), T("r150", "Rack 1,50 + TV 50\"", { Comprimento: 1.50, TV_polegadas: 50, Painel_largura: 2.00 }),
      FT("rack-oppa-kepler-gavetas-185", "r-gav", "Rack baixo com gavetas e nichos — pés palito abertos", { Comprimento: "L", Profundidade: ["P", -2.5], Altura_pe: "vao_pes" }, { Altura_rack: 0.30, Com_painel: false, Com_tv: false, Estilo_rack: "gavetas", Estilo_pe: "palito" }, "Altura total da ficha: 0,50 m (0,20 m de vão + 0,30 m de corpo)."),
      FT("rack-tokstok-mid-century-120", "r-prat", "Rack aberto com prateleiras — estrutura de metal em X", { Comprimento: "L", Profundidade: "P" }, { Altura_rack: 0.45, Altura_pe: 0.20, Com_painel: false, Com_tv: false, Estilo_rack: "prateleiras", Estilo_pe: "x" }, "Altura total da ficha: 0,655 m; o vão dos pés (0,20 m) e o corpo (0,45 m) são a divisão usual."),
      FT("rack-tokstok-thrud-suspenso-200", "r-susp", "Rack suspenso com duas gavetas, sem puxador", { Comprimento: "L", Profundidade: ["P", -1], Altura_rack: "A" }, { Altura_pe: 0.30, Com_painel: false, Com_tv: false, Estilo_rack: "suspenso", Estilo_pe: "suspenso" }, "A altura de fixação na parede não consta da ficha: 0,30 m do piso, medida usual."),
      FT("rack-mobly-salah-painel-135", "r-pnl", "Rack com painel para TV — nichos e porta de correr, pés palito", { Comprimento: "L", Profundidade: ["P", -7], Painel_altura: "A" }, { Painel_largura: 1.35, Painel_ripado: false, Altura_rack: 0.42, Altura_pe: 0.18, TV_polegadas: 42, Altura_centro_tv: 0.93, Estilo_rack: "portas", Estilo_pe: "palito", Rack: "laca grafite", Painel: "laca grafite" }, "Altura do corpo e dos pés não constam da ficha: 0,42 m e 0,18 m, medidas usuais; a ficha informa o conjunto até 122 cm e a profundidade do conjunto com o painel (corpo = ficha − 0,07 m do painel e da porta)."),
      FT("rack-cabecasa-cronos-painel-75", "r-rip", "Rack suspenso com painel ripado para TV de até 75 polegadas", { Comprimento: "L", Profundidade: ["P", -7], Painel_altura: "A" }, { Painel_largura: 1.81, Painel_ripado: true, Altura_rack: 0.36, Altura_pe: 0.25, TV_polegadas: 75, Altura_centro_tv: 1.25, Estilo_rack: "gavetas", Estilo_pe: "suspenso" }, "Altura do corpo e do vão não constam da ficha: 0,36 m e 0,25 m, medidas usuais; a profundidade da ficha é a do conjunto com o painel (corpo = ficha − 0,07 m do painel e da frente).")],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, h = v.Altura_rack, y0 = v.Altura_pe, pw = v.Painel_largura, ph = v.Painel_altura, ePe = S(v.Estilo_pe, "suspenso"), eRk = S(v.Estilo_rack, "portas");
      var dg = v.TV_polegadas * 0.0254, tw = dg * 0.8719, th = dg * 0.4905, yc = v.Altura_centro_tv, zb = v.Com_painel ? 0.05 : 0.0;
      // painel de fundo + ripas
      if (v.Com_painel) {
        c.caixa(v.Painel, 0, 0, 0.0125, pw, ph, 0.025);
        if (v.Painel_ripado) { var nr = Math.floor(pw / 0.075); for (var i = 0; i < nr; i++) c.caixa(v.Painel, -pw / 2 + 0.0375 + i * 0.075 + (pw - nr * 0.075) / 2, 0.0, 0.025 + 0.0125, 0.04, ph, 0.025); }
        else c.caixa(MAT.LACA, 0, 0, 0.03, pw, ph, 0.006);
      }
      // corpo do rack
      var zc = zb + D / 2, zf = zb + D, m, nm = Math.max(2, Math.round(L / 0.6)), wm = L / nm;
      if (ePe === "palito") {
        [-1, 1].forEach(function (s) { [0.12, D - 0.1].forEach(function (zz) { H.barra(c, v.Rack, [s * (L / 2 - 0.12) + s * 0.07, 0, zb + zz + (zz > D / 2 ? 0.04 : -0.04)], [s * (L / 2 - 0.12), y0 + 0.01, zb + zz], 0.014, 0.022, 8); }); });
      } else if (ePe === "x") {
        [-1, 1].forEach(function (s) {
          H.barra(c, MAT.PRETO, [s * (L / 2 - 0.02), 0, zc], [s * (L / 2 - 0.12), y0 + 0.01, zc], 0.006, 0.006, 6);
          H.barra(c, MAT.PRETO, [s * (L / 2 - 0.02), 0, zc + 0.02], [s * (L / 2 - 0.12), y0 + 0.01, zc - 0.02], 0.006, 0.006, 6);
        });
        H.barra(c, MAT.PRETO, [-(L / 2 - 0.06), y0 * 0.45, zc], [(L / 2 - 0.06), y0 * 0.45, zc], 0.004, 0.004, 6);
      }
      c.caixaR(v.Rack, 0, y0, zc, L, h, D, 0.006, { k: 1 });
      if (eRk === "gavetas") {
        // gaveta na ponta de cada lado e nichos no meio
        var wg = Math.max(0.3, L * 0.3);
        [-1, 1].forEach(function (s, ig) {
          var xg = s * (L / 2 - wg / 2 - 0.015);
          H.gaveta(c, "gaveta" + (ig + 1), (D - 0.1) * 0.7, function () { H.porta(c, MAT.FREIJO, xg, y0 + 0.012, zf, wg, h - 0.024, 0.02, "liso"); H.cava(c, xg, y0 + h - 0.05, zf + 0.02, wg * 0.4); H.gavetaCaixa(c, MAT.CLARA, xg, y0 + 0.012, zf, wg, h - 0.024, D - 0.1); });
        });
        c.caixa(MAT.GRAFITE, 0, y0 + 0.015, zf + 0.003, L - 2 * wg - 0.06, h - 0.03, 0.006);
        c.caixa(v.Rack, 0, y0 + h * 0.5, zf, L - 2 * wg - 0.06, 0.018, 0.04);
      } else if (eRk === "prateleiras") {
        var nv = Math.max(2, Math.round(L / 0.45));
        c.caixa(MAT.GRAFITE, 0, y0 + 0.018, zf + 0.003, L - 0.04, h - 0.036, 0.006);
        for (m = 1; m < nv; m++) c.caixa(v.Rack, -L / 2 + L * m / nv, y0 + 0.018, zf, 0.018, h - 0.036, 0.04);
        c.caixa(v.Rack, -L / 2 + L / nv * 0.5, y0 + h * 0.5, zf, L / nv - 0.02, 0.018, 0.04);
        c.caixa(v.Rack, L / 2 - L / nv * 0.5, y0 + h * 0.5, zf, L / nv - 0.02, 0.018, 0.04);
      } else if (eRk === "suspenso") {
        [-1, 1].forEach(function (s, ig) {
          var xg = s * (L / 4);
          H.gaveta(c, "gaveta" + (ig + 1), (D - 0.1) * 0.7, function () { H.porta(c, v.Rack, xg, y0 + 0.008, zf, L / 2 - 0.016, h - 0.016, 0.018, "liso"); H.gavetaCaixa(c, MAT.CLARA, xg, y0 + 0.008, zf, L / 2 - 0.016, h - 0.016, D - 0.1); });
        });
      } else {
        for (m = 0; m < nm; m++) {
          var xm = -L / 2 + wm * (m + 0.5);
          if (m === 1 && nm >= 3) { c.caixa(MAT.GRAFITE, xm, y0 + 0.02, zc, wm - 0.03, h - 0.04, D - 0.04); continue; }   // nicho aberto
          var wpR = wm - 0.012, ladoR = m % 2 ? 1 : -1;
          H.giro(c, "porta" + (m + 1), xm + ladoR * wpR / 2, y0 + h / 2, zf + 0.009, ladoR, function () { H.porta(c, v.Rack, xm, y0 + 0.01, zf, wpR, h - 0.02, 0.018, "liso"); H.cava(c, xm, y0 + h - 0.045, zf + 0.018, 0.12); });
        }
      }
      c.caixa(MAT.PRETO, 0, y0 - 0.02, zc, L - 0.08, 0.02, D - 0.1);
      // TV
      if (v.Com_tv) {
        var tz = zb + 0.02;
        c.caixaR(MAT.PRETO, 0, yc - th / 2, tz + 0.01, tw, th, 0.04, 0.008, { k: 1 });
        c.caixa(MAT.TELA, 0, yc - th / 2 + 0.01, tz + 0.0305, tw - 0.02, th - 0.02, 0.003);
      }
    }
  });


  /* ---- aparador ----
   * Estilo: armario (corpo com portas de friso e pés, de sempre) | console (tampo sobre pés, com cinta, gavetas e prateleira opcionais)
   * Estilo_pe (console): reto | conico | inclinado (abertos para fora) | trapezio (pés de metal em trapézio com travessa no piso) */
  def({
    id: "ra-mob-aparador", moveis: true, nome: "Aparador", descricao: "Aparador baixo: armário com portas de friso e pés cônicos, ou console com gavetas, prateleira, porta basculante de vidro ou tampo ripado. Os modelos de mercado mudam o corpo, os pés e o tampo; as cotas vêm da ficha do produto.",
    parametros: [P("Comprimento", "comprimento", 1.60, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.45, "Dimensões"), P("Altura", "comprimento", 0.80, "Dimensões"), P("Altura_pe", "comprimento", 0.15, "Dimensões"),
      P("Espessura_tampo", "comprimento", 0.025, "Dimensões"), P("Estilo", "texto", "armario", "Construção", "armario ou console"), P("Estilo_pe", "texto", "reto", "Construção", "console: reto, conico, inclinado ou trapezio"),
      P("Gavetas", "inteiro", 0, "Construção", "Console: gavetas sob o tampo (0 a 3)"), P("Prateleira_inferior", "simnao", false, "Construção", "Console: prateleira entre os pés"),
      P("Porta_basculante", "simnao", false, "Construção", "Console: painel de vidro basculante sob o tampo"), P("Tampo_ripado", "simnao", false, "Construção", "Console: tampo de ripas"),
      P("Corpo", "material", "madeira nogueira", "Materiais"), P("Tampo", "material", "marmore branco", "Materiais"), P("Pe", "material", "metal preto", "Materiais", "Console: material dos pés")],
    tipos: [T("a160", "1,60 m", {}), T("a120", "1,20 m", { Comprimento: 1.20 }), T("a200", "2,00 m", { Comprimento: 2.00 }),
      FT("aparador-tokstok-armazem-2g-121", "a-gav", "Aparador console com duas gavetas e prateleira — pés retos", { Comprimento: "L", Profundidade: "P", Altura: "A" }, { Estilo: "console", Estilo_pe: "reto", Gavetas: 2, Prateleira_inferior: true, Espessura_tampo: 0.03, Corpo: "madeira nogueira", Tampo: "madeira nogueira", Pe: "madeira nogueira" }, "A espessura do tampo não consta da ficha: 0,03 m, medida usual."),
      FT("aparador-tokstok-mascavo-150", "a-bas", "Aparador console com porta basculante de vidro — pés retos finos", { Comprimento: "L", Profundidade: "P", Altura: "A" }, { Estilo: "console", Estilo_pe: "reto", Porta_basculante: true, Espessura_tampo: 0.025, Corpo: "madeira freijo", Tampo: "madeira freijo", Pe: "madeira freijo" }, "Medidas da ficha com a peça aberta (75 cm de altura)."),
      FT("aparador-tokstok-niara-160", "a-trap", "Aparador de tampo maciço — pés de metal em trapézio", { Comprimento: "L", Profundidade: "P", Altura: "A" }, { Estilo: "console", Estilo_pe: "trapezio", Espessura_tampo: 0.06, Tampo: "madeira escura", Corpo: "madeira escura", Pe: "metal preto" }, "A espessura do tampo não consta da ficha: 0,06 m, medida usual."),
      FT("aparador-tokstok-noah-110", "a-con", "Aparador console liso — pés cônicos", { Comprimento: "L", Profundidade: "P", Altura: "A" }, { Estilo: "console", Estilo_pe: "conico", Espessura_tampo: 0.025, Corpo: "madeira nogueira", Tampo: "madeira nogueira", Pe: "madeira nogueira" }, "A espessura do tampo não consta da ficha: 0,025 m, medida usual."),
      FT("aparador-oppa-tulum-136", "a-rip", "Aparador console de tampo ripado — pés abertos", { Comprimento: "L", Profundidade: "P", Altura: "A" }, { Estilo: "console", Estilo_pe: "inclinado", Tampo_ripado: true, Espessura_tampo: 0.03, Corpo: "madeira clara", Tampo: "madeira clara", Pe: "madeira clara" }, "A espessura do tampo não consta da ficha: 0,03 m, medida usual.")],
    gerar: function (c, v) {
      var L = v.Comprimento, D = v.Profundidade, Ht = v.Altura, y0 = v.Altura_pe, e = v.Espessura_tampo, est = S(v.Estilo, "armario");
      if (est === "console") {
        var ePe = S(v.Estilo_pe, "reto"), ng = Math.max(0, Math.min(3, Math.round(v.Gavetas))), ah = ng > 0 || v.Porta_basculante ? 0.15 : 0.05, ytop = Ht - e, zc = D / 2, ix = L / 2 - 0.05, iz = D / 2 - 0.045;
        // tampo
        if (v.Tampo_ripado) {
          var nb = Math.max(4, Math.round(L / 0.07)), wb = L / nb;
          for (var ib = 0; ib < nb; ib++) c.caixa(v.Tampo, -L / 2 + wb * (ib + 0.5), ytop, zc, wb - 0.012, e, D);
          c.caixa(v.Tampo, 0, ytop - 0.012, zc - D / 2 + 0.02, L, 0.012, 0.03); c.caixa(v.Tampo, 0, ytop - 0.012, zc + D / 2 - 0.02, L, 0.012, 0.03);
        } else c.caixaR(v.Tampo, 0, ytop, zc, L, e, D, Math.min(0.01, e / 2.5), { k: 1 });
        // pés
        if (ePe === "trapezio") {
          [-1, 1].forEach(function (s) {
            [0.045, D - 0.045].forEach(function (z) { H.barra(c, v.Pe, [s * (L / 2 - 0.45), 0.03, z], [s * (L / 2 - 0.1), ytop, z], 0.017, 0.017, 8); });
          });
          c.caixa(v.Pe, 0, 0, zc, L - 0.9 + 0.05, 0.035, 0.04);
          c.caixa(v.Pe, 0, ytop - 0.03, zc, L - 0.2, 0.03, 0.04);
        } else [-1, 1].forEach(function (s) {
          [0.045, D - 0.045].forEach(function (z) {
            var sz = z > D / 2 ? 1 : -1;
            if (ePe === "inclinado") H.barra(c, v.Pe, [s * (L / 2 - 0.02), 0, z - sz * 0.01], [s * (L / 2 - 0.09), ytop - ah, z - sz * 0.03], 0.014, 0.019, 8);
            else if (ePe === "conico") c.tronco(v.Pe, s * ix, 0, z, 0.05, 0.05, 0.03, 0.03, ytop - ah);
            else c.caixaR(v.Pe, s * ix, 0, z, 0.04, ytop - ah, 0.04, 0.005, { k: 1 });
          });
        });
        // cinta, gavetas, porta basculante, prateleira
        if (ng > 0 || v.Porta_basculante) {
          c.caixaR(v.Corpo, 0, ytop - ah, zc, L - 0.06, ah, D - 0.04, 0.004, { k: 1 });
          if (v.Porta_basculante) c.caixa(MAT.VIDRO, 0, ytop - ah + 0.012, D - 0.02 + 0.012, L - 0.14, ah - 0.026, 0.006, { rotX: 0 });
        } else {
          c.caixa(v.Corpo, 0, ytop - ah, D - 0.045, L - 0.1, ah, 0.03); c.caixa(v.Corpo, 0, ytop - ah, 0.045, L - 0.1, ah, 0.03);
          c.caixa(v.Corpo, L / 2 - 0.045, ytop - ah, zc, 0.03, ah, D - 0.1); c.caixa(v.Corpo, -L / 2 + 0.045, ytop - ah, zc, 0.03, ah, D - 0.1);
        }
        if (ng > 0) {
          var wg = (L - 0.12) / ng;
          for (var ig = 0; ig < ng; ig++) {
            (function (xg, idg) {
              H.gaveta(c, "gaveta" + (idg + 1), (D - 0.1) * 0.7, function () { H.porta(c, v.Corpo, xg, ytop - ah + 0.012, D - 0.02, wg - 0.01, ah - 0.024, 0.02, "liso"); H.cava(c, xg, ytop - ah * 0.5, D - 0.004, Math.min(0.1, wg * 0.4)); H.gavetaCaixa(c, MAT.CLARA, xg, ytop - ah + 0.012, D - 0.02, wg - 0.01, ah - 0.024, D - 0.1); });
            })(-L / 2 + 0.06 + wg * (ig + 0.5), ig);
          }
        }
        if (v.Prateleira_inferior) c.caixaR(v.Corpo, 0, 0.12, zc, L - 0.1, 0.022, D - 0.08, 0.004, { k: 1 });
        return;
      }
      [[-1, 0.08], [1, 0.08], [-1, D - 0.08], [1, D - 0.08]].forEach(function (s) { c.tronco(MAT.PRETO, s[0] * (L / 2 - 0.1), 0, s[1], 0.04, 0.04, 0.028, 0.028, y0, { rotZ: 0 }); });
      c.caixaR(v.Corpo, 0, y0, D / 2, L - 0.02, Ht - y0 - 0.025, D - 0.02, 0.005, { k: 1 });
      c.caixaR(v.Tampo, 0, Ht - 0.025, D / 2, L, 0.025, D, 0.004, { k: 1 });
      var nm = Math.max(2, Math.round(L / 0.55)), wm = (L - 0.04) / nm;
      for (var m = 0; m < nm; m++) {
        var xm = -(L - 0.04) / 2 + wm * (m + 0.5), wpA = wm - 0.008, ladoA = m % 2 ? 1 : -1;   // o puxador fica do lado oposto à dobradiça
        H.giro(c, "porta" + (m + 1), xm + ladoA * wpA / 2, y0 + (Ht - y0 - 0.025) / 2, D + 0.01, ladoA, function () {
          H.porta(c, v.Corpo, xm, y0 + 0.02, D, wpA, Ht - y0 - 0.025 - 0.04, 0.02, "friso"); H.puxador(c, xm + (m % 2 ? -1 : 1) * (wm / 2 - 0.05), y0 + (Ht - y0) * 0.55, D + 0.02, 0.1, true);
        });
      }
    }
  });

  /* ---- tapete ----
   * Estilo: borda (moldura e miolo, de sempre) | sisal (trama em faixas e debrum) | felpudo (fios altos em ondas) | trelica (grade de losangos sobre fundo escuro) | losangos (fundo claro com losangos) */
  def({
    id: "ra-mob-tapete", centro: true, nome: "Tapete", descricao: "Tapete retangular ou redondo. Os modelos de mercado mudam a superfície: moldura e miolo, sisal trançado, felpudo de fios altos, treliça geométrica e losangos (dá a leitura de tapete na planta humanizada); as cotas vêm da ficha do produto.",
    parametros: [P("Formato", "texto", "retangular", "Dimensões", "retangular ou redondo"), P("Largura", "comprimento", 2.00, "Dimensões"), P("Profundidade", "comprimento", 3.00, "Dimensões"), P("Espessura", "comprimento", 0.012, "Dimensões"),
      P("Fios", "comprimento", 0, "Dimensões", "Altura dos fios do felpudo, além da espessura. 0 = sem fios"), P("Estilo", "texto", "borda", "Construção", "borda, sisal, felpudo, trelica ou losangos"),
      P("Miolo", "material", "tecido bege", "Materiais"), P("Borda", "material", "tecido grafite", "Materiais"), P("Desenho", "material", "linho natural", "Materiais", "Cor do desenho (trama, treliça, losangos)")],
    tipos: [T("t2030", "2,00 × 3,00 m", {}), T("t1520", "1,50 × 2,00 m", { Largura: 1.50, Profundidade: 2.00 }), T("t2535", "2,50 × 3,50 m", { Largura: 2.50, Profundidade: 3.50 }), T("tr20", "Redondo Ø 2,00 m", { Formato: "redondo", Largura: 2.00, Profundidade: 2.00 }),
      FT("tapete-mobly-sisal-redondo-200-camelo", "t-sisal", "Tapete redondo de sisal trançado — debrum e trama em faixas", { Largura: "L", Profundidade: "P", Espessura: "A" }, { Formato: "redondo", Estilo: "sisal", Miolo: "palha natural", Borda: "tecido bege", Desenho: "linho natural" }),
      FT("tapete-saturs-felpudo-redondo-200-vermelho", "t-felp", "Tapete redondo felpudo — fios altos", { Largura: "L", Profundidade: "P", Espessura: "A" }, { Formato: "redondo", Estilo: "felpudo", Fios: 0.035, Miolo: "tecido terracota", Borda: "tecido terracota", Desenho: "tecido terracota" }, "Fios de 3 a 4 cm; usado 3,5 cm."),
      FT("tapete-magia-redondo-200-geometrico", "t-trel", "Tapete redondo geométrico — treliça sobre fundo escuro", { Largura: "L", Profundidade: "P", Espessura: "A" }, { Formato: "redondo", Estilo: "trelica", Miolo: "tecido grafite", Borda: "tecido grafite", Desenho: "linho natural" }),
      FT("tapete-lancer-sisal-150x200-s561", "t-losa", "Tapete retangular de losangos — fundo claro", { Largura: "L", Profundidade: "P" }, { Espessura: 0.008, Estilo: "losangos", Miolo: "linho natural", Borda: "tecido grafite", Desenho: "tecido grafite" }, "A espessura não consta da ficha: 0,008 m, medida usual de tapete de sisal sintético.")],
    unidade: "m2", quantidade: "Largura * Profundidade",
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, e = v.Espessura, b = Math.min(0.06, Math.min(W, D) / 8), est = S(v.Estilo, "borda"), red = String(v.Formato).toLowerCase() === "redondo", i;
      function faixas(mat, passo, alt, x0, x1, z0, z1) {   // faixas paralelas ao eixo Z, cortadas pela forma (retângulo ou elipse)
        var n = Math.max(2, Math.round((x1 - x0) / passo)), w = (x1 - x0) / n;
        for (var k = 0; k < n; k++) {
          var xk = x0 + w * (k + 0.5), zl = z1 - z0;
          if (red) { var t = 1 - Math.pow(xk / ((x1 - x0) / 2), 2); if (t <= 0.01) continue; zl = (z1 - z0) * Math.sqrt(t); }
          if (k % 2 === 0) c.caixa(mat, xk, e, 0, w * 0.8, alt, zl - 0.004);
        }
      }
      if (est === "sisal") {
        if (red) { c.prisma(v.Borda, 0, 0, 0, Mob.contornoElipse(W / 2, D / 2, 48), e); c.prisma(v.Miolo, 0, e, 0, Mob.contornoElipse(W / 2 - 0.03, D / 2 - 0.03, 48), 0.001); }
        else { c.caixaR(v.Borda, 0, 0, 0, W, e, D, 0.003, { k: 1 }); c.caixa(v.Miolo, 0, e, 0, W - 0.06, 0.001, D - 0.06); }
        faixas(v.Desenho, 0.07, 0.0015, -W / 2 + 0.04, W / 2 - 0.04, -D / 2 + 0.04, D / 2 - 0.04);
      } else if (est === "felpudo") {
        var f = Math.max(0.01, v.Fios);
        if (red) {
          var R = W / 2, pf = [[0, e], [R * 0.2, e + f * 0.9], [R * 0.3, e + f * 0.55], [R * 0.45, e + f], [R * 0.58, e + f * 0.6], [R * 0.72, e + f * 0.95], [R * 0.84, e + f * 0.55], [R * 0.95, e + f * 0.8], [R, e + f * 0.4], [R, 0]];
          c.torno(v.Miolo, 0, 0, 0, pf, { seg: 40 });
        } else {
          var nl = Math.max(6, Math.round(D / 0.12)), wl = D / nl;
          c.caixaR(v.Borda, 0, 0, 0, W, e, D, 0.004, { k: 1 });
          for (i = 0; i < nl; i++) c.caixaR(v.Miolo, 0, e, -D / 2 + wl * (i + 0.5), W - 0.04, f * (i % 2 ? 0.7 : 1), wl * 0.9, Math.min(0.01, f / 2));
        }
      } else if (est === "trelica") {
        var Rr = W / 2 - 0.03, pas = 0.25;
        c.prisma(v.Borda, 0, 0, 0, Mob.contornoElipse(W / 2, D / 2, 48), e);
        c.prisma(v.Desenho, 0, e - 0.001, 0, Mob.contornoElipse(W / 2 - 0.02, D / 2 - 0.02, 48), 0.0015);
        c.prisma(v.Miolo, 0, e + 0.0004, 0, Mob.contornoElipse(W / 2 - 0.05, D / 2 - 0.05, 48), 0.0012);
        [45, -45].forEach(function (ang) {
          var cs = Math.cos(ang * Math.PI / 180), sn = Math.sin(ang * Math.PI / 180);
          for (var u = -Rr + pas / 2; u < Rr; u += pas) {
            var ch = 2 * Math.sqrt(Math.max(0, Rr * Rr - u * u)) - 0.06; if (ch < 0.1) continue;
            c.caixa(v.Desenho, u * cs, e + 0.0005, -u * sn, 0.03, 0.0016, ch, { rotY: ang });
          }
        });
      } else if (est === "losangos") {
        c.caixaR(v.Borda, 0, 0, 0, W, e, D, 0.003, { k: 1 });
        c.caixa(v.Miolo, 0, e - 0.0005, 0, W - 0.1, 0.0015, D - 0.1);
        var nx = Math.max(2, Math.round(W / 0.45)), nz = Math.max(2, Math.round(D / 0.45)), lado = Math.min((W - 0.2) / nx, (D - 0.2) / nz) / 1.414 * 0.92;
        for (var ix = 0; ix < nx; ix++) for (var iz = 0; iz < nz; iz++) c.caixa(v.Desenho, -W / 2 + 0.1 + (W - 0.2) * (ix + 0.5) / nx, e + 0.0005, -D / 2 + 0.1 + (D - 0.2) * (iz + 0.5) / nz, lado, 0.0016, lado, { rotY: 45 });
      } else if (red) { c.prisma(v.Borda, 0, 0, 0, Mob.contornoElipse(W / 2, D / 2, 40), e); c.prisma(v.Miolo, 0, 0.0005, 0, Mob.contornoElipse(W / 2 - b, D / 2 - b, 40), e + 0.001); }
      else { c.caixaR(v.Borda, 0, 0, 0, W, e, D, 0.004, { k: 1 }); c.caixa(v.Miolo, 0, 0.0005, 0, W - 2 * b, e + 0.001, D - 2 * b); }
    }
  });

  /* ================================================================ JANTAR */
  /* mesa de jantar com as cadeiras em volta.
   * Formato: retangular | redonda | oval | estadio (retângulo com pontas redondas). Estilo_base: pes (4 pés cônicos e cinta, de sempre) | pedestal (cone maciço) |
   * x (duas lâminas de metal com pés em X) | trevo (pernas abertas com travessa) | placa (duas lâminas inclinadas) | tambores (dois cilindros). */
  var P_CAD = function () { return [P("Cadeiras", "simnao", true, "Construção", "Desenha as cadeiras em volta da mesa")]; };
  def({
    id: "ra-mob-mesa-jantar", centro: true, nome: "Mesa de jantar com cadeiras (4, 6 ou 8 lugares)", descricao: "Mesa com tampo de madeira e as cadeiras estofadas em volta (retangular: duas por lado, uma em cada cabeceira nos tipos de 6 e 8; redonda: em círculo). O comprimento da mesa é do tipo. Os modelos de mercado mudam o formato do tampo e a base; as cotas vêm da ficha do produto.",
    parametros: [P("Comprimento", "comprimento", 1.80, "Dimensões", USUAL), P("Largura", "comprimento", 0.90, "Dimensões"), P("Altura", "comprimento", 0.75, "Dimensões", "Altura usual de mesa de refeição"), P("Lugares", "inteiro", 6, "Construção", "4, 6 ou 8"),
      P("Espessura_tampo", "comprimento", 0.04, "Dimensões"), P("Formato", "texto", "retangular", "Dimensões", "retangular, redonda, oval ou estadio"), P("Estilo_base", "texto", "pes", "Construção", "pes, pedestal, x, trevo, placa ou tambores")].concat(P_CAD()).concat([
      P("Tampo", "material", "madeira nogueira", "Materiais"), P("Tecido", "material", "tecido bege", "Materiais", "Estofado das cadeiras"), P("Pe", "material", "madeira escura", "Materiais")]),
    tipos: [T("j4", "4 lugares — 1,40 × 0,90", { Comprimento: 1.40, Lugares: 4 }), T("j6", "6 lugares — 1,80 × 0,90", {}), T("j8", "8 lugares — 2,40 × 1,00", { Comprimento: 2.40, Largura: 1.00, Lugares: 8 }),
      FT("mesa-jantar-4-tokstok-niara-redonda-110", "j-x", "Mesa de jantar redonda 4 lugares — tampo maciço, base de metal em X", { Comprimento: "L", Largura: "P", Altura: "A" }, { Lugares: 4, Formato: "redonda", Estilo_base: "x", Espessura_tampo: 0.05, Tampo: "madeira escura", Pe: "metal preto" }, "A espessura do tampo não consta da ficha: 0,05 m, medida usual."),
      FT("mesa-jantar-6-tokstok-mak-redonda-135", "j-ped", "Mesa de jantar redonda 6 lugares — pedestal cônico laqueado", { Comprimento: "L", Largura: "P", Altura: "A", Espessura_tampo: "espessura_tampo" }, { Lugares: 6, Formato: "redonda", Estilo_base: "pedestal", Tampo: "laca branca", Pe: "laca branca" }),
      FT("mesa-jantar-6-tokstok-trevo-oval-165x90", "j-trev", "Mesa de jantar oval 6 lugares — pernas abertas com travessa", { Comprimento: "L", Largura: "P", Altura: "A", Espessura_tampo: "espessura_tampo" }, { Lugares: 6, Formato: "estadio", Estilo_base: "trevo", Tampo: "madeira nogueira", Pe: "madeira nogueira" }),
      FT("mesa-jantar-6-tokstok-quest-160x90", "j-plac", "Mesa de jantar retangular 6 lugares — pés em lâmina inclinada", { Comprimento: "L", Largura: "P", Altura: "A" }, { Lugares: 6, Estilo_base: "placa", Espessura_tampo: 0.03, Tampo: "laca branca", Pe: "madeira escura" }, "A espessura do tampo não consta da ficha: 0,03 m, medida usual."),
      FT("mesa-jantar-8-tokstok-organic-240x120", "j-tamb", "Mesa de jantar 8 lugares — tampo estádio sobre dois tambores", { Comprimento: "L", Largura: "P", Altura: "A", Espessura_tampo: "espessura_tampo" }, { Lugares: 8, Formato: "estadio", Estilo_base: "tambores", Tampo: "madeira freijo", Pe: "madeira freijo" })],
    gerar: function (c, v) {
      var L = v.Comprimento, W = v.Largura, Ht = v.Altura, e = v.Espessura_tampo, lug = Math.round(v.Lugares), fm = S(v.Formato, "retangular"), eb = S(v.Estilo_base, "pes"), pi = Math.PI;
      // tampo
      if (fm === "redonda" || fm === "oval") c.prisma(v.Tampo, 0, Ht - e, 0, Mob.contornoElipse(L / 2, W / 2, 48), e);
      else if (fm === "estadio") c.prisma(v.Tampo, 0, Ht - e, 0, Mob.contornoRR(L, W, W / 2 - 0.002, 6), e);
      else c.caixaR(v.Tampo, 0, Ht - e, 0, L, e, W, 0.012);
      // base
      var yb = Ht - e;
      if (eb === "pedestal") { var rb = Math.min(0.32, Math.min(L, W) * 0.24); c.torno(v.Pe, 0, 0, 0, [[rb, 0], [rb, 0.01], [rb * 0.55, yb]], { seg: 28 }); }
      else if (eb === "x") {
        [-1, 1].forEach(function (s) { c.caixa(v.Pe, s * 0.2, 0.03, 0, 0.06, yb - 0.03, 0.14); });
        H.barra(c, v.Pe, [-0.33, 0.02, -0.33], [0.33, 0.02, 0.33], 0.026, 0.026, 8); H.barra(c, v.Pe, [-0.33, 0.02, 0.33], [0.33, 0.02, -0.33], 0.026, 0.026, 8);
      } else if (eb === "trevo") {
        c.caixa(v.Pe, 0, yb - 0.06, 0, L * 0.5, 0.06, 0.06);
        [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { H.barra(c, v.Pe, [s * L * 0.2 + s * 0.04, 0, t * (W / 2 - 0.2)], [s * L * 0.22, yb - 0.01, 0], 0.022, 0.03, 8); }); });
        c.caixa(v.Pe, 0, 0.3, 0, L * 0.4, 0.035, 0.035);
      } else if (eb === "placa") {
        [-1, 1].forEach(function (s) { c.caixa(v.Pe, s * (L / 2 - 0.2), 0, 0, 0.04, yb, W - 0.3, { rotZ: s * 8 }); c.caixa(v.Pe, s * (L / 2 - 0.2 + 0.065), 0, 0, 0.1, 0.03, W - 0.2); });
        c.caixa(v.Pe, 0, yb - 0.05, 0, L - 0.7, 0.05, 0.05);
      } else if (eb === "tambores") {
        var rt = Math.min(0.25, W * 0.17);
        [-1, 1].forEach(function (s) { c.prisma(v.Pe, s * L * 0.24, 0, 0, Mob.contornoElipse(rt, rt, 28), yb); });
      } else {
        c.caixa(v.Pe, 0, Ht - e - 0.06, 0, L - 0.5, 0.06, 0.07);
        [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { c.tronco(v.Pe, s * (L / 2 - 0.2), 0, t * (W / 2 - 0.12), 0.075, 0.075, 0.05, 0.05, Ht - e - 0.0); }); });
      }
      if (!v.Cadeiras) return;
      if (fm === "redonda") {
        var R = L / 2 + 0.02;
        for (var q = 0; q < lug; q++) { var t = 360 * q / lug; c.grupo(R * Math.sin(t * pi / 180), 0, -R * Math.cos(t * pi / 180), -t, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); }); }
        return;
      }
      var porLado = lug >= 8 ? 3 : 2, ends = lug >= 6;
      for (var i = 0; i < porLado; i++) {
        var x = (-0.5 + (i + 0.5) / porLado) * (L - 0.35);
        c.grupo(x, 0, -W / 2 - 0.02, 0, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); });
        c.grupo(x, 0, W / 2 + 0.02, 180, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); });
      }
      if (ends) { c.grupo(-L / 2 - 0.02, 0, 0, 90, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); }); c.grupo(L / 2 + 0.02, 0, 0, -90, function (k) { H.cadeiraJantar(k, v.Tecido, v.Pe); }); }
    }
  });
  /* ---- banqueta alta ----
   * Estilo: redonda (assento estofado redondo e travessa em aro, de sempre) | encosto (assento estofado quadrado, encosto e travessas) |
   * moldada (concha moldada com pernas dobradas e apoio de pés em aro) | windsor (assento de madeira, encosto de balaústres) */
  def({
    id: "ra-mob-banqueta", centro: true, nome: "Banqueta alta", descricao: "Banqueta de ilha: assento estofado redondo com travessa para os pés e pernas de metal, ou com encosto, de concha moldada ou de balaústres. Os modelos de mercado mudam a construção; as cotas vêm da ficha do produto.",
    parametros: [P("Altura_assento", "comprimento", 0.65, "Dimensões", "Balcão de 0,90 m: assento a 0,65 m. " + USUAL), P("Diametro", "comprimento", 0.36, "Dimensões"), P("Estilo", "texto", "redonda", "Construção", "redonda, encosto, moldada ou windsor"),
      P("Largura", "comprimento", 0.40, "Dimensões", "Estilos com encosto: largura do assento"), P("Profundidade", "comprimento", 0.45, "Dimensões", "Estilos com encosto: profundidade total"), P("Altura", "comprimento", 0.95, "Dimensões", "Estilos com encosto: altura total"),
      P("Encosto_material", "material", "tecido bege", "Materiais", "Material do encosto"), P("Tecido", "material", "couro caramelo", "Materiais"), P("Estrutura", "material", "metal preto", "Materiais")],
    tipos: [T("b65", "Assento a 0,65 m (balcão 0,90)", {}), T("b75", "Assento a 0,75 m (balcão 1,05)", { Altura_assento: 0.75 }), T("b45", "Assento a 0,45 m (mesa)", { Altura_assento: 0.45 }),
      FT("banqueta-bancada-tokstok-prosa", "b-enc", "Banqueta alta com encosto estofado — pernas de madeira com travessas", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento" }, { Estilo: "encosto", Tecido: "tecido bege", Encosto_material: "tecido bege", Estrutura: "madeira nogueira" }),
      FT("banqueta-bancada-tokstok-ares-palhinha", "b-pal", "Banqueta alta com encosto de palhinha", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento" }, { Estilo: "encosto", Tecido: "tecido bege", Encosto_material: "palha natural", Estrutura: "madeira nogueira" }),
      FT("banqueta-bancada-tokstok-bent", "b-mol", "Banqueta alta de concha moldada — pernas dobradas e aro para os pés", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento" }, { Estilo: "moldada", Tecido: "metal preto", Encosto_material: "metal preto", Estrutura: "metal preto" }),
      FT("banqueta-bancada-tokstok-skand", "b-win", "Banqueta alta de madeira com encosto de balaústres", { Largura: "L", Profundidade: "P", Altura: "A", Altura_assento: "altura_assento" }, { Estilo: "windsor", Tecido: "madeira clara", Encosto_material: "madeira clara", Estrutura: "madeira clara" })],
    gerar: function (c, v) {
      var est = S(v.Estilo, "redonda"), hs = v.Altura_assento;
      if (est === "redonda") { H.banqueta(c, hs, v.Diametro, v.Tecido, v.Estrutura); return; }
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, es = v.Estrutura, tc = v.Tecido, em = v.Encosto_material, xs = W / 2 - 0.03, zf = D / 2 - 0.035, zt = -D / 2 + 0.035;
      if (est === "encosto") {
        [-1, 1].forEach(function (s) {
          H.barra(c, es, [s * (xs + 0.008), 0, zf + 0.012], [s * xs, hs - 0.05, zf], 0.016, 0.02, 8);
          H.barra(c, es, [s * (xs + 0.008), 0, zt - 0.012], [s * xs, Ht - 0.04, zt], 0.016, 0.02, 8);
          c.caixa(es, s * xs, 0.28, (zf + zt) / 2, 0.022, 0.022, zf - zt); c.caixa(es, s * xs, hs - 0.09, (zf + zt) / 2, 0.025, 0.04, zf - zt);
        });
        c.caixa(es, 0, 0.28, zf, 2 * xs, 0.022, 0.022); c.caixa(es, 0, 0.28, zt, 2 * xs, 0.022, 0.022);
        c.caixaR(tc, 0, hs - 0.07, 0.0, W - 0.02, 0.07, D - 0.06, 0.025);
        c.caixaR(em, 0, hs + 0.03, zt - 0.005, W - 0.04, Ht - hs - 0.03, 0.05, 0.02);
      } else if (est === "moldada") {
        zf = D / 2 - 0.015; zt = -D / 2 + 0.015;
        [-1, 1].forEach(function (s) {
          H.barra(c, es, [s * (xs - 0.01 + 0.02), 0, zf - 0.02 + 0.02], [s * (xs - 0.01), hs - 0.04, zf - 0.04], 0.014, 0.014, 8);
          H.barra(c, es, [s * (xs - 0.01 + 0.02), 0, zt + 0.02 - 0.02], [s * (xs - 0.01), hs - 0.04, zt + 0.04], 0.014, 0.014, 8);
        });
        c.caixaR(tc, 0, hs - 0.06, 0, W, 0.04, D - 0.12, 0.02, { k: 1 });
        c.caixaR(tc, 0, hs - 0.04, zt + 0.045, W - 0.04, Ht - hs + 0.04, 0.035, 0.015, { k: 1, rotX: -10 });
        c.torno(MAT.INOX, 0, 0.3, 0, [[0.19, 0], [0.19, 0.012], [0.18, 0.012], [0.18, 0]], { seg: 24, ex: W / 0.4, ez: (zf - zt) / 0.4 });
      } else {   // windsor
        zf = D / 2 - 0.022; zt = -D / 2 + 0.022;
        c.prisma(tc, 0, hs - 0.04, 0, Mob.contornoRR(W, D - 0.1, 0.07, 4), 0.04);
        [-1, 1].forEach(function (s) { [zf, zt].forEach(function (z) { H.barra(c, es, [s * (xs - 0.005 + 0.012), 0, z + (z > 0 ? 0.012 : -0.012)], [s * (xs - 0.005), hs - 0.04, z], 0.013, 0.017, 8); }); });
        [0.22, 0.3].forEach(function (yy) { c.caixa(es, 0, yy, 0, 2 * xs, 0.02, 0.02); c.caixa(es, 0, yy, 0.0, 0.02, 0.02, zf - zt); });
        for (var q = 0; q < 5; q++) H.barra(c, es, [-xs + 2 * xs * q / 4, hs - 0.02, zt + 0.03], [-xs * 1.1 + 2.2 * xs * q / 4, Ht - 0.04, zt - 0.005], 0.01, 0.01, 6);
        c.caixaR(es, 0, Ht - 0.05, zt - 0.005, W - 0.01, 0.05, 0.035, 0.012, { k: 1 });
      }
    }
  });


  /* ================================================================ QUARTO */
  /* colchões usuais no Brasil (cm): solteiro 88 × 188; casal padrão 138 × 188; queen 158 × 198; king 193 × 203 */
  var FONTE_COLCHAO = "Medidas usuais de colchão no mercado brasileiro (solteiro 88×188, casal 138×188, queen 158×198, king 193×203 cm) — conferir o fabricante do colchão comprado; não verificado em catálogo único.";
  var COL = { Largura_colchao: "L", Comprimento_colchao: "P" };
  /* cama. Estilo_cama: box (base box baú com cabeceira estofada, de sempre — Largura_cama = 0) | estofada (base estofada baixa sobre pés, cabeceira alta com abas) |
   * metal (estrutura de tubo com barras na cabeceira e no pé) | plataforma (base estofada flutuante, sem cabeceira) | madeira (estrado com cabeceira e peseira de tábuas).
   * Largura_cama / Comprimento_cama são as medidas EXTERNAS da ficha (0 = automático, como antes). */
  function gerarCama(c, v) {
    var W = v.Largura_colchao, L = v.Comprimento_colchao, hb = v.Altura_base, hc = v.Altura_colchao, hh = v.Altura_cabeceira, est = S(v.Estilo_cama, "box"), zc;
    var Wt = v.Largura_cama > 0 ? v.Largura_cama : W + 0.06, Dt = v.Comprimento_cama > 0 ? v.Comprimento_cama : L + 0.16, topo = hb + hc, tb = est === "estofada" ? 0.12 : (est === "metal" ? 0.04 : (est === "madeira" ? 0.05 : 0.0));
    if (est === "box") {
      zc = 0.10 + L / 2 + 0.01;
      var Wb = W + 0.06;
      c.caixaR(v.Cabeceira, 0, 0.0, 0.05, Wb + 0.16, hh, 0.10, 0.04, { k: 2 });
      c.caixaR(v.Base, 0, 0.08, zc + 0.02, Wb, hb - 0.08, L + 0.06, 0.025);
      [[-1, 0.1], [1, 0.1], [-1, L], [1, L]].forEach(function (s) { c.cil(MAT.PRETO, s[0] * (Wb / 2 - 0.06), 0, s[1] + 0.1, 0.03, 0.08, { r2: 0.022, seg: 10 }); });
    } else {
      zc = Math.min(tb + 0.01 + L / 2, Dt - L / 2);
      if (est === "estofada") {
        c.caixaR(v.Base, 0, 0.1, Dt / 2, Wt - 0.04, hb - 0.1, Dt - 0.02, 0.03, { k: 1 });
        [-1, 1].forEach(function (s) { [0.12, Dt / 2, Dt - 0.12].forEach(function (z) { c.cil(MAT.ESC, s * (Wt / 2 - 0.1), 0, z, 0.022, 0.1, { r2: 0.018, seg: 8 }); }); });
        c.caixaR(v.Cabeceira, 0, hb - 0.04, 0.06, Wt, hh - hb + 0.04, 0.12, 0.04, { k: 1 });                                         // painel alto
        [-1, 1].forEach(function (s) { c.caixaR(v.Cabeceira, s * (Wt / 2 - 0.04), hb - 0.04, 0.2, 0.08, hh - hb - 0.25, 0.3, 0.035, { k: 1 }); });   // abas laterais
      } else if (est === "metal") {
        var r = 0.015, hf = Math.min(0.62, hh * 0.65);
        [-1, 1].forEach(function (s) {
          var xs = s * (Wt / 2 - r);
          H.barra(c, v.Base, [xs, 0, r], [xs, hh, r], r, r, 8); H.barra(c, v.Base, [xs, 0, Dt - r], [xs, hf, Dt - r], r, r, 8);
          H.barra(c, v.Base, [xs, hb - 0.06, r], [xs, hb - 0.06, Dt - r], 0.014, 0.014, 8);
        });
        c.cilH(v.Base, 0, hh - r, r, r, Wt - 2 * r, "x", { seg: 8 }); c.cilH(v.Base, 0, hf - r, Dt - r, r, Wt - 2 * r, "x", { seg: 8 });
        c.cilH(v.Base, 0, hb - 0.12, r, 0.012, Wt - 2 * r, "x", { seg: 6 }); c.cilH(v.Base, 0, hb - 0.12, Dt - r, 0.012, Wt - 2 * r, "x", { seg: 6 });
        var nbar = Math.max(4, Math.round(Wt / 0.1));
        for (var ib = 1; ib < nbar; ib++) { var xb = -Wt / 2 + Wt * ib / nbar; H.barra(c, v.Base, [xb, hb - 0.12, r], [xb, hh - r, r], 0.007, 0.007, 6); H.barra(c, v.Base, [xb, hb - 0.12, Dt - r], [xb, hf - r, Dt - r], 0.007, 0.007, 6); }
        c.caixa(MAT.ESC, 0, hb - 0.09, Dt / 2, Wt - 0.06, 0.03, Dt - 0.06);                                                         // estrado
      } else if (est === "plataforma") {
        c.caixaR(v.Base, 0, 0.12, Dt / 2, Wt, hb - 0.12, Dt, 0.04, { k: 1 });
        [-1, 1].forEach(function (s) { [0.3, Dt - 0.3].forEach(function (z) { c.caixa(MAT.ESC, s * (Wt / 2 - 0.25), 0, z, 0.1, 0.12, 0.1); }); });
      } else {   // madeira
        var pp = 0.05;
        [-1, 1].forEach(function (s) {
          var xs = s * (Wt / 2 - pp / 2);
          c.caixaR(v.Base, xs, 0, pp / 2, pp, hh, pp, 0.006, { k: 1 }); c.caixaR(v.Base, xs, 0, Dt - pp / 2, pp, Math.min(0.5, hh * 0.6), pp, 0.006, { k: 1 });
          c.caixa(v.Base, xs, hb - 0.2, Dt / 2, 0.025, 0.15, Dt - 2 * pp);
        });
        [0.62, 0.8, 0.98].forEach(function (f) { c.caixa(v.Base, 0, hh * f - 0.07, pp / 2, Wt - 2 * pp, 0.1, 0.022); });
        c.caixa(v.Base, 0, Math.min(0.5, hh * 0.6) - 0.16, Dt - pp / 2, Wt - 2 * pp, 0.13, 0.022);
        c.caixa(v.Base, 0, hb - 0.07, Dt / 2, Wt - 2 * pp, 0.025, Dt - 2 * pp);
      }
    }
    c.caixaR(MAT.COLCHAO, 0, hb, zc, W, hc, L, 0.06);
    c.caixaR(v.Roupa, 0, hb + hc - 0.03, zc, Math.min(W + 0.02, Wt), 0.045, L - 0.01, 0.02);                                  // lençol sobre o colchão
    var ze = L * 0.64 + 0.04, zce = (est === "box" ? zc + L / 2 + 0.03 : Math.min(zc + L / 2 + 0.03, Dt - 0.005)) - ze / 2;                                                    // edredom: do meio da cama até um pouco além do pé
    var Wd = est === "box" ? W + 0.05 : Math.min(W + 0.05, Wt - 0.01), xl = est === "box" ? W / 2 + 0.035 : Wd / 2 - 0.0225;
    c.caixaR(v.Edredom, 0, hb + hc - 0.005, zce, Wd, 0.07, ze, 0.035);
    [-1, 1].forEach(function (s) { c.caixaR(v.Edredom, s * xl, hb + 0.06, zce, 0.045, hc - 0.05, ze, 0.02); });   // caimento nas laterais
    c.caixaR(v.Edredom, 0, hb + hc + 0.05, zc + L / 2 - 0.2, Math.min(W + 0.03, Wd), 0.08, 0.34, 0.04);                         // dobra no pé da cama
    var nt = Math.round(v.Travesseiros), zt0 = zc - L / 2 + 0.34;
    for (var i = 0; i < nt; i++) {
      var col = nt === 1 ? 0 : (i % 2 ? 1 : -1), linha = Math.floor(i / 2), larg = nt === 1 ? 0.6 : (W - 0.1) / (nt > 2 ? 2 : nt) - 0.05;
      c.caixaR(v.Roupa, nt === 1 ? 0 : col * (W / 4), topo - 0.01, zt0 + (nt > 2 && i >= 2 ? 0.28 : 0), Math.min(0.7, larg), 0.14, 0.38, 0.06, { rotX: -7 });
    }
  }
  var T_CAMA = function (fid, tid, nome, mapa, fix, nota) { return FT(fid, tid, nome, mapa, fix, nota); };
  def({
    id: "ra-mob-cama", nome: "Cama com cabeceira e colchão", descricao: "Cama com colchão, roupa de cama (lençol, edredom dobrado no pé e travesseiros) e cabeceira. Solteiro, casal, queen e king. Os modelos de mercado mudam a estrutura: base box baú, estofada com abas, tubo de metal, plataforma flutuante e madeira com tábuas; as cotas vêm da ficha do produto.",
    parametros: [P("Largura_colchao", "comprimento", 1.58, "Dimensões", "Largura do colchão. " + FONTE_COLCHAO), P("Comprimento_colchao", "comprimento", 1.98, "Dimensões"), P("Altura_base", "comprimento", 0.30, "Dimensões", "Altura da base box (do piso ao topo)"), P("Altura_colchao", "comprimento", 0.26, "Dimensões"),
      P("Altura_cabeceira", "comprimento", 1.10, "Dimensões", "Do piso ao topo da cabeceira"), P("Travesseiros", "inteiro", 2, "Construção"),
      P("Largura_cama", "comprimento", 0, "Dimensões", "Largura EXTERNA da cama (ficha). 0 = automático (colchão + 0,06 m)"), P("Comprimento_cama", "comprimento", 0, "Dimensões", "Comprimento EXTERNO da cama (ficha). 0 = automático"),
      P("Estilo_cama", "texto", "box", "Construção", "box, estofada, metal, plataforma ou madeira"),
      P("Base", "material", "tecido grafite", "Materiais"), P("Cabeceira", "material", "tecido bege", "Materiais"), P("Roupa", "material", "roupa de cama", "Materiais"), P("Edredom", "material", "manta cinza", "Materiais")],
    tipos: [T("sol", "Solteiro 0,88 × 1,88", { Largura_colchao: 0.88, Comprimento_colchao: 1.88, Travesseiros: 1, Altura_cabeceira: 1.00 }, FONTE_COLCHAO), T("cas", "Casal 1,38 × 1,88", { Largura_colchao: 1.38, Comprimento_colchao: 1.88 }, FONTE_COLCHAO), T("que", "Queen 1,58 × 1,98", {}, FONTE_COLCHAO), T("kin", "King 1,93 × 2,03", { Largura_colchao: 1.93, Comprimento_colchao: 2.03, Travesseiros: 4 }, FONTE_COLCHAO),
      T_CAMA("cama-casal-oppa-siena-estofada", "cas-estof", "Cama de casal estofada — base baixa sobre pés, cabeceira alta com abas", { Largura_cama: "L", Comprimento_cama: "P", Altura_cabeceira: "A" }, { Largura_colchao: 1.38, Comprimento_colchao: 1.88, Travesseiros: 2, Altura_base: 0.28, Estilo_cama: "estofada", Base: "tecido cinza", Cabeceira: "tecido cinza" }, "Colchão de casal 138 × 188 cm, informado na ficha; a altura da base não consta: 0,28 m, medida usual."),
      T_CAMA("cama-casal-tokstok-maboo-138", "cas-metal", "Cama de casal de tubo de metal — cabeceira e pé com barras", { Largura_cama: "L", Comprimento_cama: "P", Altura_cabeceira: "A" }, { Largura_colchao: 1.38, Comprimento_colchao: 1.88, Travesseiros: 2, Altura_base: 0.38, Estilo_cama: "metal", Base: "metal preto", Cabeceira: "metal preto" }, "Colchão de casal 138 × 188 cm (nome da ficha); a altura do estrado não consta: 0,38 m, medida usual."),
      T_CAMA("cama-king-abmaza-osaka-flutuante", "kin-plat", "Cama king de plataforma flutuante — base estofada sem cabeceira", { Largura_cama: "L", Comprimento_cama: "P", Altura_base: "A" }, { Largura_colchao: 1.93, Comprimento_colchao: 2.03, Travesseiros: 4, Altura_cabeceira: 0, Estilo_cama: "plataforma", Base: "linho natural", Cabeceira: "linho natural" }, "Altura total com pés de 27 cm (base 15 + pés 12), da ficha; o colchão king 193 × 203 cm é o da ficha."),
      T_CAMA("cama-solteiro-tokstok-vila-88", "sol-mad", "Cama de solteiro de madeira — estrado com cabeceira e peseira de tábuas", { Largura_cama: "L", Comprimento_cama: "P", Altura_cabeceira: "A" }, { Largura_colchao: 0.88, Comprimento_colchao: 1.88, Travesseiros: 1, Altura_base: 0.33, Estilo_cama: "madeira", Base: "madeira clara", Cabeceira: "madeira clara" }, "Colchão de solteiro 88 × 188 cm (nome da ficha); a altura do estrado não consta: 0,33 m, medida usual.")],
    gerar: function (c, v) { gerarCama(c, v); }
  });
  /* criado-mudo. Estilo_corpo: gavetas (Gavetas gavetas empilhadas, de sempre) | gaveta_nicho (1 gaveta e nicho aberto) | nichos (dois cubos abertos deslocados) | correr (porta de correr de palhinha e nicho)
   * Estilo_pe: preto (pés de metal afunilados, de sempre) | reto (pés quadrados) | palito (pés de madeira abertos) */
  def({
    id: "ra-mob-criado", moveis: true, nome: "Criado-mudo", descricao: "Criado-mudo com gavetas, nicho aberto ou porta de correr, e pés. Os modelos de mercado mudam o corpo e os pés; as cotas vêm da ficha do produto.",
    parametros: [P("Largura", "comprimento", 0.50, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.40, "Dimensões"), P("Altura", "comprimento", 0.50, "Dimensões", "Em geral na altura do colchão. " + USUAL), P("Altura_pe", "comprimento", 0.15, "Dimensões"),
      P("Gavetas", "inteiro", 2, "Construção", "Estilo gavetas: 1 a 4"), P("Estilo_corpo", "texto", "gavetas", "Construção", "gavetas, gaveta_nicho, nichos ou correr"), P("Estilo_pe", "texto", "preto", "Construção", "preto, reto ou palito"),
      P("Corpo", "material", "madeira nogueira", "Materiais"), P("Frente", "material", "madeira nogueira", "Materiais", "Frente das gavetas e da porta")],
    tipos: [T("c50", "50 × 40 × 50", {}), T("c40", "40 × 35 × 45", { Largura: 0.40, Profundidade: 0.35, Altura: 0.45 }),
      FT("criado-mudo-tokstok-devon-3-gavetas", "c-3g", "Criado-mudo de três gavetas — pés baixos quadrados", { Largura: "L", Profundidade: "P", Altura: "A" }, { Gavetas: 3, Altura_pe: 0.05, Estilo_pe: "reto", Corpo: "madeira clara", Frente: "madeira clara" }, "A altura dos pés não consta da ficha: 0,05 m, medida usual."),
      FT("criado-mudo-tokstok-mascavo-1-gaveta", "c-gn", "Criado-mudo de uma gaveta e nicho aberto", { Largura: "L", Profundidade: "P", Altura: "A" }, { Estilo_corpo: "gaveta_nicho", Altura_pe: 0.04, Estilo_pe: "reto", Corpo: "madeira freijo", Frente: "madeira freijo" }, "A altura dos pés não consta da ficha: 0,04 m, medida usual."),
      FT("criado-mudo-tokstok-palhandi-porta-correr", "c-cor", "Criado-mudo de porta de correr com palhinha e nicho", { Largura: "L", Profundidade: "P", Altura: "A" }, { Estilo_corpo: "correr", Altura_pe: 0.08, Estilo_pe: "reto", Corpo: "madeira clara", Frente: "palha natural" }, "A altura dos pés não consta da ficha: 0,08 m, medida usual."),
      FT("criado-mudo-mobly-guara-nichos", "c-nic", "Criado-mudo de nichos abertos deslocados — pés altos", { Largura: "L", Profundidade: "P", Altura: "A" }, { Estilo_corpo: "nichos", Altura_pe: 0.20, Estilo_pe: "reto", Corpo: "laca grafite", Frente: "madeira nogueira" }, "A altura dos pés não consta da ficha: 0,20 m, medida usual."),
      FT("criado-mudo-tokstok-lin-1-gaveta", "c-pal", "Criado-mudo de uma gaveta — pés palito abertos", { Largura: "L", Profundidade: "P", Altura: "A" }, { Gavetas: 1, Altura_pe: 0.30, Estilo_pe: "palito", Corpo: "laca branca", Frente: "laca branca" }, "A altura dos pés não consta da ficha: 0,30 m, medida usual.")],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, y0 = v.Altura_pe, h = Ht - y0, ePe = S(v.Estilo_pe, "preto"), eC = S(v.Estilo_corpo, "gavetas");
      var px = ePe === "palito" ? W / 2 - 0.06 : W / 2 - 0.05, pz = ePe === "palito" ? 0.07 : 0.06;
      [[-1, pz], [1, pz], [-1, D - pz], [1, D - pz]].forEach(function (s) {
        if (ePe === "palito") H.barra(c, v.Corpo, [s[0] * (px + 0.04), 0, s[1] + (s[1] > D / 2 ? 0.03 : -0.03)], [s[0] * px, y0 + 0.01, s[1]], 0.014, 0.022, 8);
        else if (ePe === "reto") c.caixaR(v.Corpo, s[0] * px, 0, s[1], 0.04, (eC === "nichos" && s[0] > 0 ? y0 + h * 0.48 : y0) + 0.01, 0.04, 0.004, { k: 1 });
        else c.tronco(MAT.PRETO, s[0] * px, 0, s[1], 0.035, 0.035, 0.025, 0.025, y0);
      });
      if (eC === "nichos") {
        var wc = W * 0.5, hc = h * 0.52;
        H.carcaca(c, v.Corpo, -W / 2 + wc / 2, y0, D / 2, wc, h * 0.48, D); H.carcaca(c, v.Frente, W / 2 - wc / 2, y0 + h - hc, D / 2, wc, hc, D);
        return;
      }
      if (eC === "gaveta_nicho" || eC === "correr") H.carcaca(c, v.Corpo, 0, y0, D / 2 - 0.01, W, h, D - 0.02); else c.caixaR(v.Corpo, 0, y0, D / 2 - 0.01, W, h, D - 0.02, 0.006, { k: 1 });
      var profG = (D - 0.06) * 0.85;
      if (eC === "gaveta_nicho") {
        var hg1 = h * 0.38;
                H.gaveta(c, "gaveta1", profG * 0.75, function () { H.porta(c, v.Frente, 0, y0 + h - hg1, D - 0.02, W - 0.03, hg1 - 0.01, 0.02, "liso"); H.cava(c, 0, y0 + h - 0.05, D, W * 0.4); H.gavetaCaixa(c, MAT.CLARA, 0, y0 + h - hg1, D - 0.02, W - 0.03, hg1 - 0.01, profG); });
      } else if (eC === "correr") {
        c.caixa(v.Corpo, 0, y0 + h * 0.5, D / 2 - 0.01, W - 0.04, 0.018, D - 0.03);
        H.correr(c, "porta1", W * 0.44, function () { c.caixa(v.Frente, -W * 0.22, y0 + 0.02, D - 0.015, W * 0.5, h - 0.04, 0.02); c.caixa(v.Corpo, -W * 0.22, y0 + 0.02, D - 0.015 + 0.0, W * 0.5 + 0.0, 0.025, 0.026); c.caixa(v.Corpo, -W * 0.22, y0 + h - 0.045, D - 0.015, W * 0.5, 0.025, 0.026); });
      } else {
        var ng = Math.max(1, Math.min(4, Math.round(v.Gavetas))), hg = (h - 0.04 - 0.015 * (ng - 1)) / ng;
        for (var i = 0; i < ng; i++) {
          (function (yg, ig) {
            H.gaveta(c, "gaveta" + (ig + 1), profG * 0.75, function () { H.porta(c, v.Frente, 0, yg, D - 0.02, W - 0.03, hg, 0.02, "liso"); H.cava(c, 0, yg + hg - 0.03, D, W * 0.5); H.gavetaCaixa(c, MAT.CLARA, 0, yg, D - 0.02, W - 0.03, hg, profG); });
          })(y0 + 0.02 + i * (hg + 0.015), i);
        }
      }
    }
  });

  /* ---- guarda-roupa ----
   * Estilo_frente: friso (porta de friso, de sempre) | liso (porta lisa) | ripado (porta com ripas verticais). Estilo_base: rodape (rodapé recuado, de sempre) | pes (4 pés altos).
   * Gavetas (0 a 8): faixa de gavetas na base do armário de portas de abrir; Estilo_puxador: barra (de sempre) | cava (rebaixo vertical, sem barra). */
  def({
    id: "ra-mob-guarda-roupa", moveis: true, nome: "Guarda-roupa (portas de correr ou de abrir)", descricao: "Armário de quarto com portas de correr em trilho ou de abrir, bagageiro, gavetas na base, rodapé recuado ou pés e puxadores. Os modelos de mercado mudam a frente (friso, lisa, ripada), a base e as gavetas; as cotas vêm da ficha do produto.",
    parametros: [P("Largura", "comprimento", 2.40, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.60, "Dimensões"), P("Altura", "comprimento", 2.50, "Dimensões"), P("Altura_bagageiro", "comprimento", 0.45, "Dimensões", "0 = sem bagageiro"), P("Tipo_porta", "texto", "correr", "Construção", "correr ou abrir", "instancia"), P("Portas", "inteiro", 3, "Construção", "Folhas de porta (por faixa)"),
      P("Gavetas", "inteiro", 0, "Construção", "Gavetas na base (portas de abrir): 0 a 8"), P("Estilo_frente", "texto", "friso", "Construção", "friso, liso ou ripado"), P("Estilo_base", "texto", "rodape", "Construção", "rodape ou pes"), P("Altura_rodape", "comprimento", 0.08, "Dimensões", "Altura do rodapé ou dos pés"), P("Estilo_puxador", "texto", "barra", "Construção", "barra ou cava"),
      P("Corpo", "material", "madeira clara", "Materiais"), P("Frente", "material", "madeira freijo", "Materiais"), P("Espelho", "simnao", true, "Construção", "Uma folha com espelho")],
    tipos: [T("g240c", "2,40 m — 3 portas de correr", {}), T("g300c", "3,00 m — 4 portas de correr", { Largura: 3.00, Portas: 4 }), T("g180a", "1,80 m — 4 portas de abrir", { Largura: 1.80, Portas: 4, Tipo_porta: "abrir", Altura: 2.40 }), T("g240a", "2,40 m — 6 portas de abrir", { Tipo_porta: "abrir", Portas: 6 }),
      FT("guarda-roupa-pronto-tokstok-mascavo-casal-2p-correr", "g-cor", "Guarda-roupa de casal de duas portas de correr — frente de madeira sobre pés", { Largura: "L", Profundidade: ["P", -3], Altura: "A" }, { Portas: 2, Altura_bagageiro: 0, Estilo_frente: "liso", Estilo_base: "pes", Altura_rodape: 0.08, Espelho: false, Corpo: "madeira freijo", Frente: "madeira freijo" }, "A altura dos pés não consta da ficha: 0,08 m, medida usual; o corpo tem 3 cm a menos que a profundidade da ficha por causa das folhas de correr."),
      FT("guarda-roupa-pronto-yescasa-logan-4p", "g-4p", "Guarda-roupa de quatro portas e duas gavetas — frente lisa, puxador cava", { Largura: "L", Profundidade: "P", Altura: "A" }, { Portas: 4, Tipo_porta: "abrir", Gavetas: 2, Altura_bagageiro: 0, Estilo_frente: "liso", Estilo_puxador: "cava", Espelho: false, Corpo: "laca branca", Frente: "laca branca" }),
      FT("guarda-roupa-pronto-tokstok-wink-2p-4gav", "g-2p", "Guarda-roupa de duas portas e quatro gavetas — frente lisa", { Largura: "L", Profundidade: "P", Altura: "A" }, { Portas: 2, Tipo_porta: "abrir", Gavetas: 4, Altura_bagageiro: 0, Estilo_frente: "liso", Estilo_puxador: "cava", Espelho: false, Corpo: "laca branca", Frente: "laca branca" }),
      FT("guarda-roupa-pronto-yescasa-ripado-6p-275", "g-rip", "Guarda-roupa de seis portas e seis gavetas — frentes ripadas", { Largura: "L", Profundidade: "P", Altura: "A" }, { Portas: 6, Tipo_porta: "abrir", Gavetas: 6, Altura_bagageiro: 0, Estilo_frente: "ripado", Estilo_puxador: "cava", Espelho: false, Corpo: "madeira freijo", Frente: "madeira freijo" })],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, rod = v.Altura_rodape, esp = 0.018, nP = Math.max(2, Math.round(v.Portas)), correr = String(v.Tipo_porta).toLowerCase() === "correr", bag = v.Altura_bagageiro;
      var eF = S(v.Estilo_frente, "friso"), eB = S(v.Estilo_base, "rodape"), eP = S(v.Estilo_puxador, "barra"), ng = correr ? 0 : Math.max(0, Math.min(8, Math.round(v.Gavetas)));
      if (eB === "pes") {
        [-1, 1].forEach(function (s) { [0.07, D - 0.07].forEach(function (z) { c.tronco(MAT.PRETO, s * (W / 2 - 0.05), 0, z, 0.05, 0.05, 0.04, 0.04, rod); }); });
      } else c.caixa(MAT.PRETO, 0, 0, D / 2 - 0.04, W - 0.06, rod, D - 0.1);
      c.caixa(v.Corpo, 0, rod, D / 2, W, Ht - rod, D - 0.02);                                 // corpo (miolo fechado)
      var zf = D - 0.02, gcols = ng >= 6 ? 3 : (ng >= 4 ? 2 : (ng > 0 && W > 1.4 ? ng : 1)), grows = ng > 0 ? Math.ceil(ng / gcols) : 0, hz = grows * 0.2, hp = Ht - rod - bag - 0.03 - hz, y1 = rod + hz;
      // faixa de gavetas (portas de abrir)
      for (var ig = 0; ig < ng; ig++) {
        (function (idg) {
          var col = idg % gcols, row = Math.floor(idg / gcols), wg = W / gcols, xg = -W / 2 + wg * (col + 0.5), yg = rod + 0.01 + row * 0.2;
          H.gaveta(c, "gaveta" + (idg + 1), (D - 0.1) * 0.6, function () {
            H.porta(c, v.Frente, xg, yg, zf, wg - 0.01, 0.185, esp, "liso");
            if (eP === "cava") H.cava(c, xg, yg + 0.15, zf + esp, Math.min(0.2, wg * 0.5)); else H.puxador(c, xg, yg + 0.1, zf + esp, Math.min(0.2, wg * 0.5), false);
            H.gavetaCaixa(c, MAT.CLARA, xg, yg, zf, wg - 0.01, 0.185, D - 0.1);
          });
        })(ig);
      }
      function ripas(x, yb, w, h, z) {   // ripas verticais coladas na frente da porta
        var nr = Math.max(3, Math.round(w / 0.05)), wr = w / nr;
        for (var q = 0; q < nr; q++) c.caixa(v.Frente, x - w / 2 + wr * (q + 0.5), yb, z, wr * 0.55, h, 0.012);
      }
      if (correr) {
        var wf = (W + 0.08 * (nP - 1)) / nP;
        for (var i = 0; i < nP; i++) {
          var x = -W / 2 + wf / 2 + i * (W - wf) / (nP - 1), z = zf + 0.012 + (i % 2) * 0.026;
          var mat = (v.Espelho && i === nP - 1) ? MAT.ESPELHO : v.Frente;
          var folhaC = function () {
            c.caixaR(mat, x, rod + 0.02, z, wf, hp - 0.02, esp, 0.004, { k: 1 });
            if (eP === "cava") c.caixa(MAT.PRETO, x + (i % 2 ? -1 : 1) * (wf / 2 - 0.03), rod + hp * 0.45, z + esp / 2 + 0.003, 0.012, 0.3, 0.008);
            else { H.cava(c, x + (i % 2 ? -1 : 1) * (wf / 2 - 0.03), rod + hp * 0.5, z + esp / 2 + 0.006, 0.01); c.caixa(MAT.PRETO, x + (i % 2 ? -1 : 1) * (wf / 2 - 0.03), rod + hp * 0.45, z + esp / 2 + 0.003, 0.012, 0.3, 0.008); }
          };
          /* só as folhas da frente (ímpares) correm, por cima da vizinha de trás; as de trás ficam no trilho, como no móvel real */
          if (i % 2 === 1) H.correr(c, "folha" + (i + 1), -(W - wf) / (nP - 1), folhaC); else folhaC();
        }
        c.caixa(MAT.PRETO, 0, rod + hp - 0.005, zf + 0.02, W, 0.02, 0.07);
      } else {
        var wp = W / nP;
        for (var j = 0; j < nP; j++) {
          var xj = -W / 2 + wp * (j + 0.5), m2 = (v.Espelho && j === nP - 1) ? MAT.ESPELHO : v.Frente;
          var ladoG = j % 2 ? -1 : 1, wpG = wp - 0.006;   // a dobradiça fica do lado oposto ao puxador
          H.giro(c, "porta" + (j + 1), xj + ladoG * wpG / 2, y1 + hp * 0.5, zf + esp / 2, ladoG, function () {
            if (m2 === MAT.ESPELHO) c.caixa(m2, xj, y1 + 0.02, zf, wp - 0.006, hp - 0.02, 0.012);
            else {
              H.porta(c, m2, xj, y1 + 0.02, zf, wp - 0.006, hp - 0.02, esp, eF === "friso" ? "friso" : "liso");
              if (eF === "ripado") ripas(xj, y1 + 0.04, wp - 0.05, hp - 0.06, zf + esp);
            }
            if (eP === "cava") c.caixa(MAT.PRETO, xj + (j % 2 ? 1 : -1) * (wp / 2 - 0.02), y1 + hp * 0.5, zf + esp + 0.003, 0.012, 0.3, 0.008);
            else H.puxador(c, xj + (j % 2 ? 1 : -1) * (wp / 2 - 0.05), y1 + hp * 0.5, zf + esp, 0.2, true);
          });
        }
      }
      if (bag > 0.05) { var nb = Math.max(2, Math.round(W / 0.6)), wb = W / nb; for (var b = 0; b < nb; b++) { var xb = -W / 2 + wb * (b + 0.5), wbp = wb - 0.006, ladoB = b % 2 ? 1 : -1; H.giro(c, "bagageiro" + (b + 1), xb + ladoB * wbp / 2, Ht - bag / 2, zf + esp / 2, ladoB, function () { H.porta(c, v.Frente, xb, Ht - bag, zf, wbp, bag - 0.01, esp, "liso"); H.cava(c, xb, Ht - bag + 0.03, zf + esp, 0.1); }); } }
    }
  });

  /* ---- closet ----
   * Cabideiro_altura2 (0 = um só), Altura_maleiro (0 = sem; maleiro com duas portas de abrir no topo), Altura_calceiro (0 = sem; prateleiras inclinadas para sapatos na base).
   * As alturas livres vêm do guia de marcenaria (faixas de peça pendurada); a altura do tubo = piso do vão + peça pendurada + 0,05 m de folga. */
  def({
    id: "ra-mob-closet", moveis: true, nome: "Módulo de closet aberto (cabideiro e prateleiras)", descricao: "Módulo de closet sem portas: cabideiro de tubo (simples ou duplo), prateleiras, calceiro inclinado, maleiro com portas, gaveteiro inferior e fundo. Vários módulos lado a lado formam o closet. Os modelos de mercado mudam a divisão interna pelas alturas do guia de marcenaria.",
    parametros: [P("Largura", "comprimento", 1.20, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.55, "Dimensões"), P("Altura", "comprimento", 2.40, "Dimensões"), P("Prateleiras", "inteiro", 4, "Construção"), P("Gavetas", "inteiro", 2, "Construção"), P("Cabideiro_altura", "comprimento", 1.75, "Construção", "Do piso ao eixo do tubo"),
      P("Cabideiro_altura2", "comprimento", 0, "Construção", "Do piso ao eixo do segundo tubo (cabideiro duplo). 0 = um só"), P("Altura_maleiro", "comprimento", 0, "Construção", "Altura do maleiro no topo, com duas portas. 0 = sem"), P("Altura_calceiro", "comprimento", 0, "Construção", "Altura do calceiro na base (prateleiras inclinadas). 0 = sem"),
      P("Corpo", "material", "madeira clara", "Materiais"), P("Gaveta", "material", "madeira freijo", "Materiais"), P("Tubo", "material", "inox", "Materiais")],
    tipos: [T("c120", "1,20 m", {}), T("c90", "0,90 m", { Largura: 0.90 }), T("c60", "0,60 m", { Largura: 0.60, Prateleiras: 5, Gavetas: 0 }),
      FT("arauco-guia-closet", "c-duplo", "Closet aberto de cabideiro duplo — camisas, blusas e jaquetas", { Profundidade: "P" }, { Gavetas: 0, Prateleiras: 0, Cabideiro_altura: 1.04, Cabideiro_altura2: 1.99 }, "Peça pendurada de 90 a 110 cm: vão de 0,90 m (limite inferior da faixa) para caberem dois tubos em 2,40 m; tubos a 1,04 m e 1,99 m do piso (piso do vão 0,088 m + 0,90 m + 0,05 m de folga)."),
      FT("arauco-guia-closet", "c-longo", "Closet aberto de cabideiro longo — vestidos e casacos longos, com maleiro", { Profundidade: "P", Altura_maleiro: "maleiro" }, { Gavetas: 0, Prateleiras: 0, Cabideiro_altura: 1.74 }, "Peça pendurada de 140 a 160 cm: vão de 1,60 m (limite superior da faixa); tubo a 1,74 m do piso (0,088 m + 1,60 m + 0,05 m). Maleiro de 45 cm no topo."),
      FT("arauco-guia-closet", "c-calc", "Closet aberto com calceiro e cabideiro de casacos e saias", { Profundidade: "P", Altura_calceiro: "calceiro" }, { Gavetas: 0, Prateleiras: 0, Cabideiro_altura: 2.11 }, "Calceiro de 75 cm na base; casacos e saias de 120 cm; tubo a 2,11 m do piso (0,088 m + 0,75 m + 0,018 m + 1,20 m + 0,05 m).")],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, e = 0.018, ng = Math.round(v.Gavetas), np = Math.round(v.Prateleiras), rod = 0.07, cal = v.Altura_calceiro, mal = v.Altura_maleiro;
      c.caixa(v.Corpo, -W / 2 + e / 2, 0, D / 2, e, Ht, D); c.caixa(v.Corpo, W / 2 - e / 2, 0, D / 2, e, Ht, D);
      c.caixa(v.Corpo, 0, 0, 0.005, W, Ht, 0.01);
      c.caixa(v.Corpo, 0, Ht - e, D / 2, W - 2 * e, e, D); c.caixa(MAT.PRETO, 0, 0, D / 2 - 0.03, W - 2 * e, rod, D - 0.06); c.caixa(v.Corpo, 0, rod, D / 2, W - 2 * e, e, D);
      var hg = 0.16, y = rod + e;
      for (var g = 0; g < ng; g++) {
        (function (yg, ig) { H.gaveta(c, "gaveta" + (ig + 1), (D - 0.1) * 0.7, function () { H.porta(c, v.Gaveta, 0, yg, D - 0.01, W - 2 * e - 0.01, hg - 0.01, 0.02, "liso"); H.cava(c, 0, yg + hg - 0.035, D + 0.01, 0.15); H.gavetaCaixa(c, v.Gaveta, 0, yg, D - 0.01, W - 2 * e - 0.01, hg - 0.01, D - 0.1); }); })(y, g);
        y += hg;
      }
      function tubo(yt) {
        c.cilH(v.Tubo, 0, yt, D / 2, 0.015, W - 2 * e, "x", { seg: 10 });
        [-1, 1].forEach(function (s) { c.caixa(MAT.INOX, s * (W / 2 - e - 0.02), yt - 0.025, D / 2, 0.04, 0.05, 0.05); });   // suporte do tubo
      }
      tubo(v.Cabideiro_altura);
      if (v.Cabideiro_altura2 > 0) tubo(v.Cabideiro_altura2);
      for (var p = 0; p < np; p++) { var yp = Ht - e - 0.30 - p * 0.30; if (yp > v.Cabideiro_altura + 0.05) c.caixa(v.Corpo, 0, yp, D / 2, W - 2 * e, e, D - 0.02); }
      if (ng > 0) c.caixa(v.Corpo, 0, Math.max(rod + e + ng * hg + 0.30, 1.0), D / 2, W - 2 * e, e, D - 0.02);
      if (cal > 0) {   // calceiro: prateleiras inclinadas para a frente, com batente
        var nc = Math.max(2, Math.round(cal / 0.15)), y0 = rod + e;
        for (var k = 0; k < nc; k++) {
          var yk = y0 + 0.05 + k * (cal - 0.06) / nc;
          c.caixa(v.Corpo, 0, yk, D / 2 - 0.01, W - 2 * e, 0.014, D - 0.06, { rotX: -7 });
          c.caixa(MAT.INOX, 0, yk + 0.035, D - 0.04, W - 2 * e - 0.02, 0.012, 0.012);
        }
        c.caixa(v.Corpo, 0, y0 + cal, D / 2, W - 2 * e, e, D - 0.02);
      }
      if (mal > 0.05) {   // maleiro: prateleira e duas portas de abrir
        var ym = Ht - e - mal, wp = (W - 2 * e) / 2;
        c.caixa(v.Corpo, 0, ym, D / 2, W - 2 * e, e, D - 0.02);
        [-1, 1].forEach(function (s, i) {
          H.giro(c, "maleiro" + (i + 1), s * (W / 2 - e) , ym + e + (mal - e) / 2, D + 0.009, s, function () { H.porta(c, v.Gaveta, s * wp / 2, ym + e, D, wp - 0.006, mal - e - e, 0.018, "liso"); H.cava(c, s * 0.04, ym + e + 0.05, D + 0.018, 0.1); });
        });
      }
    }
  });

  /* ---- escrivaninha + cadeira ---- */
  H.cadeiraEscritorio = function (c, tec) {
    var hA = 0.47;
    for (var i = 0; i < 5; i++) { var a = i * 72 * Math.PI / 180; c.caixaR(MAT.PRETO, Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14, 0.30, 0.025, 0.045, 0.01, { k: 1, rotY: -i * 72 }); c.cil(MAT.PRETO, Math.cos(a) * 0.27, 0.0, Math.sin(a) * 0.27, 0.025, 0.045, { seg: 8 }); }
    c.cil(MAT.CROMO, 0, 0.06, 0, 0.025, hA - 0.12, { seg: 10 });
    c.caixaR(tec, 0, hA - 0.07, 0, 0.50, 0.08, 0.48, 0.03);
    c.caixaR(tec, 0, hA + 0.01, -0.22, 0.46, 0.52, 0.07, 0.03, { rotX: -6 });
    [-1, 1].forEach(function (s) { c.caixaR(MAT.PRETO, s * 0.27, hA + 0.08, -0.02, 0.04, 0.03, 0.26, 0.012, { k: 1 }); c.caixa(MAT.PRETO, s * 0.27, hA - 0.04, -0.02, 0.025, 0.12, 0.025); });
  };
  /* Estilo_pe: paineis (dois painéis laterais e painel de fundo, de sempre) | tambor (dois cilindros) | cavalete (dois cavaletes em A com travessa) | u (quadro de metal em U de um lado)
   * Gaveteiro: gavetas (de sempre) | prateleiras (módulo aberto) | nenhum. Formato_tampo: retangular | estadio. Gaveta_central: gaveta rasa sob o tampo. */
  def({
    id: "ra-mob-escrivaninha", moveis: true, nome: "Escrivaninha com cadeira", descricao: "Mesa de trabalho com tampo de madeira, gaveteiro suspenso ou módulo aberto e cadeira de escritório giratória com base estrela. A cadeira fica a 0,25 m da borda. Os modelos de mercado mudam os pés (painéis, tambores, cavaletes, quadro em U) e o gaveteiro; as cotas vêm da ficha do produto.",
    parametros: [P("Largura", "comprimento", 1.40, "Dimensões", USUAL), P("Profundidade", "comprimento", 0.60, "Dimensões"), P("Altura", "comprimento", 0.75, "Dimensões", "Altura usual de mesa de trabalho"), P("Com_cadeira", "simnao", true, "Construção"),
      P("Espessura_tampo", "comprimento", 0.03, "Dimensões"), P("Estilo_pe", "texto", "paineis", "Construção", "paineis, tambor, cavalete ou u"), P("Gaveteiro", "texto", "gavetas", "Construção", "gavetas, prateleiras ou nenhum"), P("Formato_tampo", "texto", "retangular", "Dimensões", "retangular ou estadio"), P("Gaveta_central", "simnao", false, "Construção", "Gaveta rasa sob o tampo, no centro"),
      P("Tampo", "material", "madeira nogueira", "Materiais"), P("Estrutura", "material", "metal preto", "Materiais"), P("Tecido", "material", "tecido grafite", "Materiais", "Estofado da cadeira")],
    tipos: [T("e140", "1,40 × 0,60", {}), T("e120", "1,20 × 0,60", { Largura: 1.20 }), T("e160", "1,60 × 0,70", { Largura: 1.60, Profundidade: 0.70 }),
      FT("escrivaninha-tokstok-allure-170x72", "e-tamb", "Escrivaninha de tampo estádio sobre dois tambores, com gaveta rasa", { Largura: "L", Profundidade: "P", Altura: "A", Espessura_tampo: "espessura_tampo" }, { Estilo_pe: "tambor", Gaveteiro: "nenhum", Formato_tampo: "estadio", Gaveta_central: true, Tampo: "madeira freijo", Estrutura: "madeira freijo" }),
      FT("escrivaninha-tokstok-avril-110x55", "e-cav", "Escrivaninha de tampo claro sobre cavaletes em A", { Largura: "L", Profundidade: "P", Altura: "A", Espessura_tampo: "espessura_tampo" }, { Estilo_pe: "cavalete", Gaveteiro: "nenhum", Tampo: "laca branca", Estrutura: "madeira clara" }),
      FT("escrivaninha-tokstok-niara-140x60", "e-u", "Escrivaninha de tampo maciço — quadro de metal em U e gaveteiro suspenso", { Largura: "L", Profundidade: "P", Altura: "A" }, { Estilo_pe: "u", Gaveteiro: "gavetas", Espessura_tampo: 0.05, Tampo: "madeira escura", Estrutura: "metal preto" }, "A espessura do tampo não consta da ficha: 0,05 m, medida usual."),
      FT("escrivaninha-tokstok-simple-90x45", "e-pre", "Escrivaninha compacta — quadro de metal em U e módulo aberto", { Largura: "L", Profundidade: "P", Altura: "A" }, { Estilo_pe: "u", Gaveteiro: "prateleiras", Espessura_tampo: 0.025, Tampo: "laca grafite", Estrutura: "metal preto" }, "A espessura do tampo não consta da ficha: 0,025 m, medida usual.")],
    gerar: function (c, v) {
      var W = v.Largura, D = v.Profundidade, Ht = v.Altura, e = v.Espessura_tampo, ePe = S(v.Estilo_pe, "paineis"), eG = S(v.Gaveteiro, "gavetas"), yt = Ht - e;
      if (S(v.Formato_tampo, "retangular") === "estadio") c.prisma(v.Tampo, 0, yt, D / 2, Mob.contornoRR(W, D, D / 2 - 0.002, 6), e);
      else c.caixaR(v.Tampo, 0, yt, D / 2, W, e, D, Math.min(0.005, e / 2.5), { k: 1 });
      if (ePe === "paineis") {
        c.caixa(v.Estrutura, -W / 2 + 0.03, 0, D / 2, 0.03, yt, D - 0.08); c.caixa(v.Estrutura, W / 2 - 0.03, 0, D / 2, 0.03, yt, D - 0.08);
        c.caixa(v.Estrutura, 0, yt - 0.25, 0.05, W - 0.1, 0.20, 0.015);
      } else if (ePe === "tambor") {
        var rt = Math.min(0.14, D * 0.2);
        [-1, 1].forEach(function (s) { c.prisma(v.Estrutura, s * (W / 2 - 0.3), 0, D / 2, Mob.contornoElipse(rt, rt, 28), yt); });
      } else if (ePe === "cavalete") {
        [-1, 1].forEach(function (s) {
          var xs = s * (W / 2 - 0.16);
          H.barra(c, v.Estrutura, [xs - 0.12, 0, D / 2], [xs, yt - 0.01, D / 2], 0.02, 0.02, 8); H.barra(c, v.Estrutura, [xs + 0.12, 0, D / 2], [xs, yt - 0.01, D / 2], 0.02, 0.02, 8);
        });
        c.caixa(v.Estrutura, 0, 0.12, D / 2, W - 0.2, 0.03, 0.03);
      } else {   // u: quadro de metal (esquerda) + módulo na direita
        var xs2 = -(W / 2 - 0.05);
        [0.04, D - 0.04].forEach(function (z) { c.caixa(v.Estrutura, xs2, 0, z, 0.03, yt, 0.03); });
        c.caixa(v.Estrutura, xs2, 0, D / 2, 0.03, 0.03, D - 0.04);
      }
      if (v.Gaveta_central) H.gaveta(c, "gaveta0", (D - 0.2) * 0.7, function () { H.porta(c, v.Tampo, 0, yt - 0.075, D - 0.1, W * 0.3, 0.07, 0.016, "liso"); H.gavetaCaixa(c, MAT.CLARA, 0, yt - 0.075, D - 0.1, W * 0.3, 0.07, D - 0.25); });
      if (eG === "gavetas") {
        var gx = W / 2 - 0.30;
        if (ePe === "u") gx = W / 2 - 0.22;
        c.caixaR(MAT.CLARA, gx, yt - 0.42, D / 2, 0.40, 0.40, D - 0.12, 0.005, { k: 1 });
        [0, 1].forEach(function (i) {
          H.gaveta(c, "gaveta" + (i + 1), (D - 0.2) * 0.7, function () { H.porta(c, MAT.FREIJO, gx, yt - 0.41 + i * 0.19, D - 0.06 + 0.01, 0.38, 0.18, 0.016, "liso"); H.cava(c, gx, yt - 0.41 + i * 0.19 + 0.14, D - 0.06 + 0.026, 0.14); H.gavetaCaixa(c, MAT.CLARA, gx, yt - 0.41 + i * 0.19, D - 0.05, 0.38, 0.18, D - 0.2); });
        });
      } else if (eG === "prateleiras") {
        var wm = Math.min(0.36, W * 0.4), xm = W / 2 - 0.02 - wm / 2;
        [-1, 1].forEach(function (s) { c.caixa(v.Tampo, xm + s * (wm / 2 - 0.009), 0, D / 2, 0.018, yt, D - 0.02); });
        [0.02, yt * 0.5, yt - 0.02].forEach(function (yy) { c.caixa(v.Tampo, xm, yy - (yy > yt * 0.9 ? 0.016 : 0.0), D / 2, wm - 0.036, 0.018, D - 0.02); });
        c.caixa(v.Tampo, xm, 0, 0.01, wm - 0.036, yt, 0.01);
      }
      if (v.Com_cadeira) c.grupo(-0.15, 0, D + 0.28, 180, function (k) { H.cadeiraEscritorio(k, v.Tecido); });
    }
  });


  /* ---------------------------------------------------------------- registro / gancho de geometria */
  function completar(fam, tipo, inst, saida) {
    var g = GER[fam.mob || fam.id];
    if (!g || !Mob) { saida.ok = false; saida.erros = (saida.erros || []).concat(["o gerador de mobiliário \"" + (fam.mob || fam.id) + "\" não carregou"]); return saida; }
    var c = Mob.cena(), v = saida.valores || {};
    /* CÓPIA ANTIGA DA FAMÍLIA (28/10/2026): a família copiada para o projeto (mob "ra-mob-rack-tv" numa cópia com id próprio) guarda a
       lista de parâmetros do dia em que foi copiada; o parâmetro que o gerador ganhou depois (Com_painel, Com_tv no lote 3a) chegava
       undefined = "desligado", e o painel ripado e a TV sumiam do rack. O que a cópia não tem vem com o padrão da definição atual. */
    var atual = null;
    for (var ia = 0; ia < LISTA.length; ia++) if (LISTA[ia].id === (fam.mob || fam.id)) { atual = LISTA[ia]; break; }
    if (atual) (atual.parametros || []).forEach(function (p) { if (!p.formula && v[p.nome] === undefined && p.valor !== undefined) v[p.nome] = p.valor; });
    try { g(c, v); } catch (e) { saida.ok = false; saida.erros = (saida.erros || []).concat(["mobiliário \"" + fam.nome + "\": " + e.message]); return saida; }
    /* aviso do gerador (ex.: o vão de eletro do armário planejado que não coube na largura total) chega a quem avalia */
    if (c.avisos && c.avisos.length) saida.avisos = (saida.avisos || []).concat(c.avisos);
    /* a QUANTIDADE que o desenho constrói (o armário planejado: módulos + tamponamentos, sem a sobra que não vira módulo) — vence a
       fórmula do quantitativo, que não sabe a fila de módulos (js/familiasplanejado.js gerar) */
    if (typeof c.quantidade === "number" && isFinite(c.quantidade) && saida.quantitativo) saida.quantitativo.quantidade = c.quantidade;
    saida.solidos = c.solidos(fam.id.replace(/^ra-/, "") + ":");
    saida.caixa = c.env ? { x0: c.env.x0, y0: c.env.y0, z0: c.env.z0, x1: c.env.x1, y1: c.env.y1, z1: c.env.z1 } : null;
    saida.mob = { triangulos: c.triangulos(), pecas: saida.solidos.length };
    /* PARTES MÓVEIS: as que o gerador declarou (c.parte); o eixo tem de estar dentro da caixa da peça e o ângulo de 0 a 180 */
    saida.partesMoveis = c.partes.slice(); saida.errosPartes = c.errosPartes.slice();
    if (PMov && c.partes.length) {
      var ck = PMov.checar(c.partes, saida.caixa);
      saida.errosPartes = saida.errosPartes.concat(ck.erros);
    }
    if (PMov) saida.estadoPartes = { fracao: PMov.fracaoDe(v, inst) };
    if (saida.errosPartes.length) { saida.ok = false; saida.erros = (saida.erros || []).concat(saida.errosPartes); }
    /* SÍMBOLO DE PLANTA (copa, faixa de forração): o desenho técnico usa no lugar do emaranhado de arestas da malha */
    var simK = SIMB[fam.id] ? fam.id : (fam.mob && SIMB[fam.mob] ? fam.mob : null);   /* a cópia da família numa obra (outro id) guarda o id de origem em `mob` */
    if (simK) { try { saida.simboloPlanta = SIMB[simK](v); } catch (eS) { /* sem símbolo: a planta usa a malha */ } }
    return saida;
  }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function registrarNoRA() {
    var RA = global.FamiliasRA || dep("FamiliasRA", "familiasra.js");
    if (RA && RA.registrar) RA.registrar(clonar(LISTA));
  }
  /* cor de cada material para a MINIATURA da biblioteca (a mesma da tabela FAM_PBR do js/bim.js — o teste de mobiliário (tools/test-*mobiliario.js) confere que os nomes existem lá) */
  var CORES = { "madeira nogueira": "#6b4a32", "madeira clara": "#b58a55", "madeira escura": "#3b2a20", "madeira deck": "#6a3d25", "madeira freijo": "#a27240", "laca branca": "#f2f2ef", "laca grafite": "#3a3d40",
    "metal preto": "#1f2023", "inox": "#d0d4d8", "metal cromado": "#cfd3d8", "latão": "#b89b47", "marmore branco": "#ece9e4", "quartzo branco": "#e9e8e4", "granito preto": "#1d1e20", "vidro": "#9fd3f0", "espelho": "#c9d3d8", "vidro fume": "#4a5560",
    "louça branca": "#f4f4f2", "tela preta": "#0b0c0e", "couro caramelo": "#9a5f34", "colchao": "#e9e5dc", "roupa de cama": "#e2ded4", "manta cinza": "#9a9a98", "cimento queimado": "#9b9a96", "tijolo refratario": "#c79a6a", "tijolinho aparente": "#b5683f", "tijolinho escuro": "#5d4a40",
    "pedra cinza": "#8a8d8f", "acrilico branco": "#f7f7f5", "borracha preta": "#1a1a1a", "linho natural": "#cdbfa6", "terra": "#5a4332", "ceramica terracota": "#b5623c", "tecido cinza": "#777a7e", "tecido bege": "#b09b7e",
    "tecido grafite": "#35383c", "tecido verde": "#5a7058", "tecido terracota": "#b4603f", "tecido azul": "#4a6a8a", "tronco palmeira": "#6a5238", "casca de arvore": "#7b6a5a", "folha verde escura": "#2f5a2e", "folha verde": "#4a7f35",
    "palha natural": "#c9b17f", "folha verde clara": "#7fae4a", "folha variegada": "#6f9a48", "flor amarela": "#f2c53a", "flor rosa": "#e58aa6", "flor lilas": "#b48ad2", "flor azul": "#6f7fd8", "flor branca": "#f4f2ee", "grama esmeralda": "#3f7d2b", "grama amendoim": "#5f9b35", "seixo": "#d8d0c0" };
  var _mini = {};
  /* miniatura(famId, tipoId): PNG (data URL) da peça em perspectiva isométrica; guardada por família + tipo. Só no navegador. */
  function miniatura(famId, tipoId) {
    var f = null, i, F = global.Familia;
    for (i = 0; i < LISTA.length; i++) if (LISTA[i].id === famId) f = LISTA[i];
    if (!f || !F || !Mob || !global.document) return "";
    var tp = tipoId || (f.tipos[0] || {}).id, k = famId + "|" + tp;
    if (_mini[k] != null) return _mini[k];
    var av = F.avaliar(f, tp, {});
    _mini[k] = av && av.ok ? Mob.miniatura(av.solidos, 96, function (m) { return CORES[String(m).toLowerCase()] || "#9a9a9a"; }) : "";
    return _mini[k];
  }
  /* ---------------------------------------------------------------- SÍMBOLO DE PLANTA (2D)
   * linhasPlanta(simbolo): segmentos [x1, z1, x2, z2, …] LOCAIS da família, que o desenho técnico (js/bim.js vista2d) usa no
   * lugar das arestas da malha. `simboloPlanta` vem do gerador: { copa: [{x, z, r, estilo}], tronco: [{x, z, r}], faixa: {x, z, larg, prof, trama, pontos} }.
   *   estilo "arvore"   = contorno ondulado (copa) + círculo interno + cruz e círculo do tronco;
   *   estilo "palmeira" = estrela de folhas com farpas; estilo "arbusto" = contorno ondulado miúdo;
   *   faixa (forração, pedras): retângulo + hachura a 45° (cruzada na grama-amendoim) ou pontos no seixo. */
  function linhasPlanta(sim) {
    var out = [], i, j;
    function seg(a, b, c, d) { out.push(a, b, c, d); }
    function poli(pts) { for (var k = 0; k + 1 < pts.length; k++) seg(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]); }
    ((sim && sim.copa) || []).forEach(function (cp) {
      var r = cp.r, est = cp.estilo || "arvore", n, pts = [];
      if (est === "palmeira") {
        n = clamp(Math.round(r * 9), 8, 18);
        for (i = 0; i < n; i++) {
          var a = Math.PI * 2 * i / n, ca = Math.cos(a), sa = Math.sin(a);
          seg(cp.x + ca * r * 0.12, cp.z + sa * r * 0.12, cp.x + ca * r, cp.z + sa * r);
          var bx = cp.x + ca * r * 0.62, bz = cp.z + sa * r * 0.62;
          seg(bx, bz, bx + Math.cos(a + 0.55) * r * 0.3, bz + Math.sin(a + 0.55) * r * 0.3); seg(bx, bz, bx + Math.cos(a - 0.55) * r * 0.3, bz + Math.sin(a - 0.55) * r * 0.3);
        }
        return;
      }
      n = est === "arbusto" ? clamp(Math.round(r * 22), 12, 36) : clamp(Math.round(r * 9), 10, 22);
      var amp = est === "arbusto" ? 0.07 : 0.1, N = n * 5;
      for (i = 0; i <= N; i++) { var t = Math.PI * 2 * i / N, rr = r * (1 + amp * Math.cos(t * n)) * 0.96; pts.push([cp.x + Math.cos(t) * rr, cp.z + Math.sin(t) * rr]); }
      poli(pts);
      if (est === "arvore") { var p2 = []; for (i = 0; i <= 24; i++) { var t2 = Math.PI * 2 * i / 24; p2.push([cp.x + Math.cos(t2) * r * 0.55, cp.z + Math.sin(t2) * r * 0.55]); } poli(p2); }
    });
    ((sim && sim.tronco) || []).forEach(function (tr) {
      var p = []; for (i = 0; i <= 14; i++) { var t = Math.PI * 2 * i / 14; p.push([tr.x + Math.cos(t) * tr.r, tr.z + Math.sin(t) * tr.r]); }
      poli(p); seg(tr.x - tr.r * 1.7, tr.z, tr.x + tr.r * 1.7, tr.z); seg(tr.x, tr.z - tr.r * 1.7, tr.x, tr.z + tr.r * 1.7);
    });
    /* SEGMENTOS PRONTOS (js/familiasandaime.js): a peça que já desenha o próprio símbolo (círculo do tubo, hachura da madeira) entrega `linhas` = [x1, z1, x2, z2, …] locais */
    if (sim && sim.linhas) for (j = 0; j + 3 < sim.linhas.length; j += 4) seg(sim.linhas[j], sim.linhas[j + 1], sim.linhas[j + 2], sim.linhas[j + 3]);
    var f = sim && sim.faixa;
    if (f) {
      var a2 = f.larg / 2, b2 = f.prof / 2, x0 = f.x - a2, x1 = f.x + a2, z0 = f.z - b2, z1 = f.z + b2;
      poli([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]);
      if (f.trama) {
        var st = f.passo || 0.28;
        for (var c0 = -(a2 + b2) + st / 2; c0 < a2 + b2; c0 += st) { var xa = Math.max(-a2, c0 - b2), xb = Math.min(a2, c0 + b2); if (xb - xa > 0.02) seg(f.x + xa, f.z + c0 - xa, f.x + xb, f.z + c0 - xb); }
        if (f.trama === "cruzada") for (var c1 = -(a2 + b2) + st / 2; c1 < a2 + b2; c1 += st) { var xc = Math.max(-a2, -c1 - b2), xd = Math.min(a2, -c1 + b2); if (xd - xc > 0.02) seg(f.x + xc, f.z + c1 + xc, f.x + xd, f.z + c1 + xd); }
      }
      if (f.pontos) {
        var rnd = Mob.sorteio(5), np = clamp(Math.round(f.larg * f.prof * 18), 10, 140);
        for (j = 0; j < np; j++) { var qx = f.x + rnd.entre(-a2 + 0.04, a2 - 0.04), qz = f.z + rnd.entre(-b2 + 0.04, b2 - 0.04), q = 0.025; seg(qx - q, qz, qx, qz - q); seg(qx, qz - q, qx + q, qz); seg(qx + q, qz, qx, qz + q); seg(qx, qz + q, qx - q, qz); }
      }
    }
    return out;
  }
  var FamiliasMob = {
    linhasPlanta: linhasPlanta,
    fichas: function () { return clonar(FICHAS); },   /* as fichas de produto de onde saem as cotas dos tipos de mercado (conferidas pelo tools/test-familias-mob-catalogo.js) */
    miniatura: miniatura, CORES: CORES,
    lista: function () { return clonar(LISTA); }, obter: function (id) { for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id) return clonar(LISTA[i]); return null; },
    completar: completar, gerador: function (id) { return GER[id] || null; }, def: def, H: H, MAT: MAT, P: P, T: T, registrar: registrarNoRA, TECIDOS: TECIDOS,
    ids: function () { return LISTA.map(function (f) { return f.id; }); }
  };
  global.FamiliasMob = FamiliasMob;
  registrarNoRA();
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasMob;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

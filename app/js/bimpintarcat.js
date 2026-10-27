/* =====================================================================
 * bimpintarcat.js (BimPintarCat) — CATÁLOGO DE ESCOLHAS DO PINTAR (27/10/2026, motor PURO, ES5)
 *
 * Pedido do Rogério: "o comando PT, que é o PINTAR, deveria ter MAIS escolhas para a gente selecionar".
 * Antes eram 8 materiais genéricos (js/bimpintar.js MATERIAIS) + 15 da paleta de fachada (js/bimacabvis.js), numa
 * caixa de seleção simples, sem pesquisa e sem recentes. Aqui o Pintar ganha um catálogo POR GRUPO:
 *
 *   Padrão RA ..... os 23 de antes, com os mesmos nomes (o que já foi pintado continua igual)
 *   Tintas ........ acrílica, látex, esmalte, textura, grafiato × acabamento (fosco, acetinado, semibrilho) × a cartela
 *   Cerâmicos ..... porcelanato (60x60, 60x120, 20x120 amadeirado, mármore, cimento queimado), cerâmica 30x60 e as de
 *                   composição SINAPI, subway 7,5x15, pastilha, ladrilho hidráulico
 *   Pedras ........ granitos e quartzo comuns, mármore Carrara, nanoglass
 *   Madeira e MDF . carvalho, nogueira, freijó, cinza, branco TX, louro, amêndoa
 *   Metais ........ inox escovado, alumínio natural/branco/preto, dourado, champanhe, corten
 *   Outros ........ vidro, espelho, tijolinho, cimento queimado, concreto aparente, papel de parede
 *
 * A INTERFACE é o seletor fino de js/biminsttipos.js (BimInstTipos: miniatura, pesquisa, recentes por usuário), com abas por grupo.
 * NÃO existe segundo jeito de pôr material na face: a escolha vira o mesmo `pintar` do js/bimpintar.js (material = o nome, codigo
 * = a composição, quando há).
 *
 * CADA ITEM leva a cor sRGB, a rugosidade, a metalicidade e (quando há) a textura da biblioteca CC0 já empacotada (img/texturas;
 * js/bimtextura.js): entra no catálogo visual (BimAcabVis.registrar), que é o que o 3D e o Realista leem. Rugosidade segue o
 * data/materiais-render-ra.json (fosco ~0,92, acetinado ~0,6, semibrilho ~0,35, polido ~0,25).
 *
 * ORÇAMENTO. `codigo` só quando o sistema JÁ trata aquele acabamento pela composição SINAPI (data/sinapi-familias-mapa.json,
 * classes pintura_parede e revestimento_parede; conferidos na base ES 2026-06): 88489 (pintura látex acrílica, 2 demãos), 95305
 * (textura acrílica), 87265/87269/87273/104611 (cerâmica esmaltada 20x20, 25x35, 33x45, 60x60, parede inteira) e 104616/104615
 * (pastilha de porcelana 2,5 e 5 cm). O resto fica SEM código e marcado `aOrcar: true` — nunca se chuta uma composição parecida;
 * a linha do orçamento sai com os m² e o aviso, e o preço segue a regra do sistema (js/orcmodelo.js).
 *
 * CORES E MARCAS. A cartela das tintas é GENÉRICA da RA: nome e hex próprios, código "RA-Cnn". Nenhum nome de cor de fabricante
 * foi usado. Texturas: só as da biblioteca (img/texturas/ORIGEM.txt) ou cor sólida.
 *
 *   PURO (Node-testável): GRUPOS, itens(), porNome(texto), pesquisar(q, grupoId), contagem(), antigos()
 *   LIGAÇÃO: registrarVisual() (BimAcabVis), registrar() (BimInstTipos, categoria "pintura"), host.escolher(item)
 * Teste: node tools/test-pintar-opcoes.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function AV() { return dep("BimAcabVis", "./bimacabvis.js"); }
  function PT() { return dep("BimPintar", "./bimpintar.js"); }
  function BIT() { return dep("BimInstTipos", "./biminsttipos.js"); }
  function norm(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : txt(s).toLowerCase(); }

  var CAT = "pintura";
  /* ordem das abas; "padrao" = os de antes */
  var GRUPOS = [
    { id: "padrao", rotulo: "Padrão RA" },
    { id: "tintas", rotulo: "Tintas" },
    { id: "ceramicos", rotulo: "Cerâmicos e porcelanato" },
    { id: "pedras", rotulo: "Pedras" },
    { id: "madeira", rotulo: "Madeira e MDF" },
    { id: "metais", rotulo: "Metais" },
    { id: "outros", rotulo: "Outros" }
  ];
  var ROT_GRUPO = {}, ORD_GRUPO = {};
  GRUPOS.forEach(function (g, i) { ROT_GRUPO[g.id] = g.rotulo; ORD_GRUPO[g.id] = i; });

  /* ---------------------------------------------------------------- TINTAS */
  /* cartela genérica da RA (nome + hex próprios; sem nome de cor de fabricante) */
  var CARTELA = [
    ["C01", "Branco neve", "#f5f4f0"], ["C02", "Branco gelo", "#ebe8e0"], ["C03", "Off-white", "#e7e2d6"], ["C04", "Creme", "#eadfc2"],
    ["C05", "Palha", "#dccfa8"], ["C06", "Areia", "#d4c3a0"], ["C07", "Bege", "#cdb99a"], ["C08", "Camurça", "#b99a73"],
    ["C09", "Terracota", "#b5694a"], ["C10", "Telha", "#9c4f36"], ["C11", "Ocre", "#d1a23c"], ["C12", "Verde sálvia", "#a9b59a"],
    ["C13", "Verde musgo", "#6f7a56"], ["C14", "Azul névoa", "#b9cbd6"], ["C15", "Azul petróleo", "#3f6877"], ["C16", "Azul marinho", "#26364f"],
    ["C17", "Cinza claro", "#d3d3d0"], ["C18", "Cinza médio", "#9a9c9d"], ["C19", "Cinza chumbo", "#5c5f62"], ["C20", "Grafite", "#3b3e42"],
    ["C21", "Preto", "#1f2022"], ["C22", "Rosa antigo", "#d8b4a6"], ["C23", "Vinho", "#5e2a33"], ["C24", "Marrom café", "#4b3a2f"]
  ];
  var RUG_ACAB = { fosco: 0.92, acetinado: 0.6, semibrilho: 0.35 };
  /* tipo de tinta → acabamentos, textura, composição (null = a orçar) e a classe do mapa SINAPI */
  var TIPOS_TINTA = [
    { id: "acrilica", rotulo: "Tinta acrílica", acabs: ["fosco", "acetinado", "semibrilho"], slug: "pintura_lisa", codigo: "88489" },
    { id: "latex", rotulo: "Tinta látex", acabs: ["fosco"], slug: "pintura_lisa", codigo: "88489" },
    { id: "esmalte", rotulo: "Esmalte sintético", acabs: ["fosco", "acetinado", "semibrilho"], slug: "pintura_lisa", codigo: "" },
    { id: "textura", rotulo: "Textura acrílica", acabs: ["fosco"], slug: "reboco_rustico_offwhite", codigo: "95305" },
    { id: "grafiato", rotulo: "Grafiato", acabs: ["fosco"], slug: "reboco_rustico_offwhite", codigo: "", rugBase: 0.97 }
  ];

  /* --------------------------------------------------------- DEMAIS GRUPOS
   * [id, rotulo, cor, slug, rug, met, extras]   extras: { sub, codigo, op, pad (padrão da miniatura) } */
  var CERAMICOS = [
    ["porc-60-polido-branco", "Porcelanato 60x60 polido branco", "#e9e8e3", "porcelanato_branco_60", 0.25, 0, { sub: "Porcelanato", pad: "grade60" }],
    ["porc-60-acet-areia", "Porcelanato 60x60 acetinado areia", "#d9ccb1", "porcelanato_acetinado_claro", 0.45, 0, { sub: "Porcelanato", pad: "grade60" }],
    ["porc-60-rustico-cinza", "Porcelanato 60x60 rústico cinza", "#9a958c", "porcelanato_antiderrapante_externo", 0.8, 0, { sub: "Porcelanato", pad: "grade60" }],
    ["porc-60-acet-grafite", "Porcelanato 60x60 acetinado grafite", "#4b4e52", "porcelanato_grafite", 0.45, 0, { sub: "Porcelanato", pad: "grade60" }],
    ["porc-60-cimento", "Porcelanato 60x60 efeito cimento queimado", "#9c9a95", "cimento_queimado", 0.7, 0, { sub: "Porcelanato", pad: "grade60" }],
    ["porc-120-polido-branco", "Porcelanato 60x120 polido branco", "#ecebe6", "porcelanato_branco_60", 0.22, 0, { sub: "Porcelanato", pad: "grade120" }],
    ["porc-120-acet-cinza", "Porcelanato 60x120 acetinado cinza", "#b6b4ae", "porcelanato_branco_60", 0.45, 0, { sub: "Porcelanato", pad: "grade120" }],
    ["porc-120-marmore", "Porcelanato 60x120 efeito mármore", "#e6e7ea", "marmore_branco", 0.2, 0, { sub: "Porcelanato", pad: "veio" }],
    ["porc-20x120-carvalho", "Porcelanato 20x120 amadeirado carvalho", "#b58a55", "piso_laminado_claro", 0.5, 0, { sub: "Porcelanato", pad: "madeira" }],
    ["porc-20x120-nogueira", "Porcelanato 20x120 amadeirado nogueira", "#6e4a31", "madeira_nogueira", 0.5, 0, { sub: "Porcelanato", pad: "madeira" }],
    ["porc-20x120-escuro", "Porcelanato 20x120 amadeirado escuro", "#4a3224", "madeira_escura_imbuia", 0.5, 0, { sub: "Porcelanato", pad: "madeira" }],
    ["cer-30x60-acet-branca", "Cerâmica 30x60 acetinada branca", "#f1f1ee", "azulejo_porcelanato_bwc", 0.35, 0, { sub: "Cerâmica", pad: "grade30" }],
    ["cer-30x60-brilho-branca", "Cerâmica 30x60 brilhante branca", "#f4f4f1", "azulejo_porcelanato_bwc", 0.15, 0, { sub: "Cerâmica", pad: "grade30" }],
    ["cer-30x60-acet-cinza", "Cerâmica 30x60 acetinada cinza", "#b9b9b6", "azulejo_porcelanato_bwc", 0.35, 0, { sub: "Cerâmica", pad: "grade30" }],
    ["cer-30x60-acet-bege", "Cerâmica 30x60 acetinada bege", "#d8cbb2", "azulejo_porcelanato_bwc", 0.35, 0, { sub: "Cerâmica", pad: "grade30" }],
    ["cer-20x20-branca", "Cerâmica esmaltada 20x20 branca", "#f1f1ee", "azulejo_porcelanato_bwc", 0.2, 0, { sub: "Cerâmica", pad: "grade20", codigo: "87265" }],
    ["cer-25x35-branca", "Cerâmica esmaltada 25x35 branca", "#f1f1ee", "azulejo_porcelanato_bwc", 0.2, 0, { sub: "Cerâmica", pad: "grade30", codigo: "87269" }],
    ["cer-33x45-branca", "Cerâmica esmaltada 33x45 branca", "#f1f1ee", "azulejo_porcelanato_bwc", 0.2, 0, { sub: "Cerâmica", pad: "grade30", codigo: "87273" }],
    ["cer-60x60-branca", "Cerâmica esmaltada 60x60 acetinada branca", "#eeeeeb", "azulejo_porcelanato_bwc", 0.4, 0, { sub: "Cerâmica", pad: "grade60", codigo: "104611" }],
    ["subway-branco-brilho", "Subway 7,5x15 branco brilhante", "#f3f3f0", "azulejo_porcelanato_bwc", 0.12, 0, { sub: "Subway 7,5x15", pad: "subway" }],
    ["subway-branco-acet", "Subway 7,5x15 branco acetinado", "#eeeeea", "azulejo_porcelanato_bwc", 0.4, 0, { sub: "Subway 7,5x15", pad: "subway" }],
    ["subway-cinza", "Subway 7,5x15 cinza claro", "#b7bab9", "azulejo_porcelanato_bwc", 0.15, 0, { sub: "Subway 7,5x15", pad: "subway" }],
    ["subway-grafite", "Subway 7,5x15 grafite", "#44484b", "azulejo_porcelanato_bwc", 0.15, 0, { sub: "Subway 7,5x15", pad: "subway" }],
    ["subway-verde", "Subway 7,5x15 verde", "#5f7f6c", "azulejo_porcelanato_bwc", 0.15, 0, { sub: "Subway 7,5x15", pad: "subway" }],
    ["pastilha-porcelana-25", "Pastilha de porcelana 2,5x2,5", "#d9dedf", "pastilha_vidro", 0.25, 0, { sub: "Pastilha e hidráulico", pad: "mosaico", codigo: "104616" }],
    ["pastilha-porcelana-5", "Pastilha de porcelana 5x5", "#d9dedf", "pastilha_vidro", 0.25, 0, { sub: "Pastilha e hidráulico", pad: "mosaico", codigo: "104615" }],
    ["pastilha-vidro", "Pastilha de vidro", "#7fb2bd", "pastilha_vidro", 0.15, 0, { sub: "Pastilha e hidráulico", pad: "mosaico" }],
    ["ladrilho-hidraulico", "Ladrilho hidráulico", "#a2835a", "ladrilho_hidraulico", 0.55, 0, { sub: "Pastilha e hidráulico", pad: "mosaico" }]
  ];
  var PEDRAS = [
    ["granito-sao-gabriel", "Granito preto São Gabriel", "#1d1e20", "granito_preto", 0.2, 0, { sub: "Granitos", pad: "veio" }],
    ["granito-itaunas", "Granito branco Itaúnas", "#d8d6d0", "granito_cinza", 0.25, 0, { sub: "Granitos", pad: "veio" }],
    ["granito-ubatuba", "Granito verde Ubatuba", "#2f3b33", "", 0.22, 0, { sub: "Granitos", pad: "veio" }],
    ["granito-andorinha", "Granito cinza Andorinha", "#a1a2a3", "granito_cinza", 0.25, 0, { sub: "Granitos", pad: "veio" }],
    ["quartzo-branco", "Quartzo branco", "#f1f0ec", "", 0.18, 0, { sub: "Quartzo e nanoglass", pad: "liso" }],
    ["nanoglass", "Nanoglass branco", "#f4f4f0", "", 0.08, 0, { sub: "Quartzo e nanoglass", pad: "liso" }],
    ["marmore-carrara", "Mármore Carrara", "#e4e5e8", "marmore_branco", 0.22, 0, { sub: "Mármores", pad: "veio" }]
  ];
  var MADEIRA = [
    ["mdf-carvalho", "MDF carvalho natural", "#b58a55", "piso_laminado_claro", 0.5, 0, { pad: "madeira" }],
    ["mdf-nogueira", "MDF nogueira", "#6e4a31", "madeira_nogueira", 0.5, 0, { pad: "madeira" }],
    ["mdf-freijo", "MDF freijó", "#c4a073", "madeira_clara_freijo", 0.5, 0, { pad: "madeira" }],
    ["mdf-cinza", "MDF cinza", "#8d8a85", "plastico_liso_branco", 0.5, 0, { pad: "liso" }],
    ["mdf-branco-tx", "MDF branco TX", "#f1f1ef", "plastico_liso_branco", 0.47, 0, { pad: "madeira" }],
    ["mdf-louro", "MDF louro", "#c9a46a", "madeira_clara_freijo", 0.5, 0, { pad: "madeira" }],
    ["mdf-amendoa", "MDF amêndoa", "#c8a77f", "madeira_tabua_vertical_avela", 0.5, 0, { pad: "madeira" }]
  ];
  var METAIS = [
    ["metal-inox-escovado", "Inox escovado", "#c4c8cc", "inox_escovado", 0.38, 0.85, { pad: "metal" }],
    ["metal-aluminio-natural", "Alumínio natural", "#d2d5d8", "aluminio_escovado", 0.4, 0.9, { pad: "metal" }],
    ["metal-aluminio-branco", "Alumínio branco", "#f1f1ef", "", 0.4, 0.7, { pad: "liso" }],
    ["metal-aluminio-preto", "Alumínio preto", "#1d1f21", "", 0.4, 0.7, { pad: "liso" }],
    ["metal-dourado", "Metal dourado", "#c9a24b", "", 0.28, 0.95, { pad: "metal" }],
    ["metal-champanhe", "Metal champanhe", "#cdb892", "", 0.3, 0.9, { pad: "metal" }],
    ["metal-corten", "Aço corten", "#8a4b2a", "", 0.72, 0.55, { pad: "liso" }]
  ];
  var OUTROS = [
    ["vidro-incolor", "Vidro incolor", "#dcebe8", "", 0.02, 0, { sub: "Vidros", pad: "vidro", op: 0.25 }],
    ["vidro-fume", "Vidro fumê", "#5f6766", "", 0.02, 0, { sub: "Vidros", pad: "vidro", op: 0.5 }],
    ["espelho-prata", "Espelho prata", "#e6e8ea", "", 0.02, 0.95, { sub: "Vidros", pad: "metal" }],
    ["tijolinho-palha", "Tijolinho aparente palha", "#d6b98f", "tijolo_macico_colonial_palha", 0.9, 0, { sub: "Alvenaria e concreto", pad: "tijolo" }],
    ["tijolinho-laranja", "Tijolinho aparente laranja", "#b86b43", "tijolinho_laranja", 0.9, 0, { sub: "Alvenaria e concreto", pad: "tijolo" }],
    ["cimento-queimado", "Cimento queimado", "#9d9b96", "cimento_queimado", 0.7, 0, { sub: "Alvenaria e concreto", pad: "liso" }],
    ["concreto-liso", "Concreto aparente liso", "#b9b7b1", "concreto_liso_claro", 0.8, 0, { sub: "Alvenaria e concreto", pad: "liso" }],
    ["papel-liso", "Papel de parede liso", "#d9cfc0", "pintura_lisa", 0.8, 0, { sub: "Papel de parede", pad: "liso" }],
    ["papel-texturizado", "Papel de parede texturizado", "#cfc3ad", "reboco_rustico_offwhite", 0.85, 0, { sub: "Papel de parede", pad: "linho" }]
  ];

  /* ------------------------------------------------------------ miniatura */
  function svg(corpo) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 52">' + corpo + "</svg>"); }
  function sombra(cor, k) {   /* a cor mais escura (k<0) ou mais clara (k>0), para as juntas e o veio */
    var m = /^#([0-9a-f]{6})$/i.exec(cor); if (!m) return "#888888";
    var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { v = Math.round(v + (k > 0 ? (255 - v) * k : v * k)); return Math.max(0, Math.min(255, v)); });
    return "#" + c.map(function (v) { return (v < 16 ? "0" : "") + v.toString(16); }).join("");
  }
  function miniatura(cor, pad) {
    var jn = sombra(cor, -0.18), cl = sombra(cor, 0.35), c = '<rect width="64" height="52" fill="' + cor + '"/>', i;
    if (pad === "grade60" || pad === "grade20" || pad === "grade30" || pad === "grade120" || pad === "mosaico") {
      var nx = pad === "grade20" ? 5 : (pad === "mosaico" ? 8 : (pad === "grade120" ? 2 : 3)), ny = pad === "grade20" ? 4 : (pad === "mosaico" ? 7 : (pad === "grade120" ? 3 : 3));
      for (i = 1; i < nx; i++) c += '<line x1="' + (64 * i / nx) + '" y1="0" x2="' + (64 * i / nx) + '" y2="52" stroke="' + jn + '" stroke-width="1.2"/>';
      for (i = 1; i < ny; i++) c += '<line x1="0" y1="' + (52 * i / ny) + '" x2="64" y2="' + (52 * i / ny) + '" stroke="' + jn + '" stroke-width="1.2"/>';
    } else if (pad === "subway" || pad === "tijolo") {
      var h = pad === "tijolo" ? 8.6 : 10.4, w = pad === "tijolo" ? 16 : 21;
      for (i = 1; i * h < 52; i++) {
        c += '<line x1="0" y1="' + (i * h) + '" x2="64" y2="' + (i * h) + '" stroke="' + jn + '" stroke-width="1.2"/>';
        for (var x = (i % 2 ? w / 2 : 0); x < 64; x += w) if (x > 0) c += '<line x1="' + x + '" y1="' + ((i - 1) * h) + '" x2="' + x + '" y2="' + (i * h) + '" stroke="' + jn + '" stroke-width="1.2"/>';
      }
    } else if (pad === "madeira") {
      for (i = 1; i < 6; i++) c += '<line x1="0" y1="' + (i * 8.6) + '" x2="64" y2="' + (i * 8.6) + '" stroke="' + jn + '" stroke-width="1"/>';
      for (i = 0; i < 6; i++) c += '<path d="M0 ' + (i * 8.6 + 4) + ' C20 ' + (i * 8.6 + 1) + ' 40 ' + (i * 8.6 + 7) + ' 64 ' + (i * 8.6 + 4) + '" fill="none" stroke="' + cl + '" stroke-width="0.8" opacity=".7"/>';
    } else if (pad === "veio") {
      c += '<path d="M-2 40 C14 28 26 44 40 24 S58 10 66 14" fill="none" stroke="' + jn + '" stroke-width="1.4" opacity=".75"/><path d="M6 52 C20 38 30 40 44 30" fill="none" stroke="' + cl + '" stroke-width="1" opacity=".8"/>';
    } else if (pad === "metal") {
      c += '<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="' + cl + '"/><stop offset=".5" stop-color="' + cor + '"/><stop offset="1" stop-color="' + jn + '"/></linearGradient></defs><rect width="64" height="52" fill="url(#g)"/>';
    } else if (pad === "vidro") {
      c = '<rect width="64" height="52" fill="#ffffff"/><rect x="6" y="6" width="52" height="40" fill="' + cor + '" opacity=".75" stroke="' + jn + '" stroke-width="1.5"/><path d="M14 40 L30 12" stroke="#ffffff" stroke-width="3" opacity=".7"/>';
    } else if (pad === "linho") {
      for (i = 1; i < 13; i++) c += '<line x1="' + (i * 5) + '" y1="0" x2="' + (i * 5) + '" y2="52" stroke="' + jn + '" stroke-width=".7" opacity=".6"/>';
    }
    return svg(c + '<rect x=".5" y=".5" width="63" height="51" fill="none" stroke="#00000033"/>');
  }

  /* ---------------------------------------------------------------- build */
  var _lista = null, _porNome = null, _porId = null;
  function nova(g, id, rotulo, cor, slug, rug, met, ex) {
    ex = ex || {};
    var cod = txt(ex.codigo);
    return { id: CAT + ":" + id, cat: CAT, idVis: "pc-" + id, nome: rotulo, material: rotulo, grupoId: g, grupo: ROT_GRUPO[g], ordemGrupo: ORD_GRUPO[g], sub: ex.sub || null,
             cor: cor, slug: slug || "", rug: rug, met: met || 0, op: ex.op || 0, codigo: cod, aOrcar: !cod, servico: ex.servico || "Revestimento",
             familia: txt(ex.busca), icone: miniatura(cor, ex.pad || "liso"), origem: "pintura" };
  }
  function construir() {
    var out = [], ant = antigos();
    /* os de antes, com os mesmos nomes; sem composição própria (o usuário digita a dele, como sempre) */
    ant.forEach(function (m) {
      var tinta = /pintura|textura|reboco|verniz/i.test(m.rotulo);
      out.push({ id: CAT + ":" + m.id, cat: CAT, idVis: null, nome: m.rotulo, material: m.rotulo, grupoId: "padrao", grupo: ROT_GRUPO.padrao, ordemGrupo: 0, sub: null,
                 cor: m.cor, slug: m.slug || "", rug: m.rug == null ? 0.8 : m.rug, met: m.met || 0, op: 0, codigo: "", aOrcar: false, servico: tinta ? "Pintura" : "Revestimento",
                 familia: "", icone: miniatura(m.cor, "liso"), origem: "pintura", antigo: true });
    });
    TIPOS_TINTA.forEach(function (t) {
      t.acabs.forEach(function (ac) {
        CARTELA.forEach(function (c) {
          var rug = t.rugBase || RUG_ACAB[ac];
          var it = nova("tintas", t.id + "-" + ac + "-" + c[0].toLowerCase(), t.rotulo + " " + ac + " — " + c[1] + " (RA-" + c[0] + ")", c[2], t.slug, rug, 0,
                        { sub: t.rotulo + " · " + ac, codigo: t.codigo, servico: "Pintura", pad: t.id === "textura" || t.id === "grafiato" ? "linho" : "liso",
                          busca: t.rotulo + " " + ac + " " + c[1] + " RA-" + c[0] + " " + c[2] + (t.id === "latex" ? " latex" : "") });
          out.push(it);
        });
      });
    });
    [["ceramicos", CERAMICOS], ["pedras", PEDRAS], ["madeira", MADEIRA], ["metais", METAIS], ["outros", OUTROS]].forEach(function (par) {
      par[1].forEach(function (d) {
        var ex = d[6] || {}, cp = {}; Object.keys(ex).forEach(function (k) { cp[k] = ex[k]; });
        cp.busca = d[1] + " " + d[2] + (cp.codigo ? " SINAPI " + cp.codigo : "");
        out.push(nova(par[0], d[0], d[1], d[2], d[3], d[4], d[5], cp));
      });
    });
    return out;
  }
  /* os materiais de antes: BimPintar.MATERIAIS (8) + os da fachada/metal já empurrados lá pelo js/bimpintar.js (e a cor/textura do catálogo visual) */
  function antigos() {
    var P = PT(), V = AV(), out = [];
    arr(P && P.MATERIAIS).forEach(function (m) {
      var e = V && V.porNome ? V.porNome(m.rotulo) : null;
      out.push({ id: m.id, rotulo: m.rotulo, cor: m.cor, slug: e ? e.slug : "", rug: e ? e.rug : undefined, met: e ? e.met : 0 });
    });
    return out;
  }

  /* o catálogo visual: cor + textura de cada item novo (o que o 3D e o Realista leem) */
  var BimPintarCat = {
    CAT: CAT, GRUPOS: GRUPOS, CARTELA: CARTELA, TIPOS_TINTA: TIPOS_TINTA, host: null, ultimo: null,

    itens: function () {
      if (_lista) return _lista;
      _lista = construir(); _porNome = {}; _porId = {};
      _lista.forEach(function (t) { if (!_porNome[norm(t.material)]) _porNome[norm(t.material)] = t; _porId[t.id] = t; });
      return _lista;
    },
    esquecer: function () { _lista = null; _porNome = null; _porId = null; },
    /* registra os itens novos no catálogo visual; os de antes já estão lá */
    registrarVisual: function () {
      var V = AV(); if (!V || !V.registrar) return 0;
      var novos = this.itens().filter(function (t) { return t.idVis; }).map(function (t) {
        var e = { id: t.idVis, rotulo: t.material, grupo: t.grupoId === "metais" ? "metal" : "fachada", cor: t.cor, slug: t.slug, rug: t.rug, met: t.met };
        if (t.op) e.op = t.op;
        return e;
      });
      V.registrar(novos); return novos.length;
    },
    /* o item pelo nome do material gravado na face (orçamento e tela) */
    porNome: function (texto) { this.itens(); return _porNome[norm(texto)] || null; },
    porId: function (id) { this.itens(); return _porId[id] || null; },
    grupoItens: function (grupoId) { return this.itens().filter(function (t) { return t.grupoId === grupoId; }); },
    contagem: function () {
      var por = {}, tot = 0;
      this.itens().forEach(function (t) { por[t.grupoId] = (por[t.grupoId] || 0) + 1; tot++; });
      return { total: tot, porGrupo: por };
    },
    /* pesquisa por palavras (sem acento, qualquer ordem); grupoId opcional filtra a aba */
    pesquisar: function (q, grupoId) {
      var n = norm(q).trim(), pal = n ? n.split(/\s+/) : [];
      return this.itens().filter(function (t) {
        if (grupoId && grupoId !== "todos" && t.grupoId !== grupoId) return false;
        if (!pal.length) return true;
        var s = norm(t.nome + " " + t.familia + " " + t.grupo + " " + (t.sub || ""));
        return pal.every(function (p) { return s.indexOf(p) >= 0; });
      });
    },
    /* o que o 'pintar' grava ao escolher o item: o nome e a composição (quando há) */
    opcoesDe: function (t) { return { material: t.material, codigo: t.codigo || "" }; },
    /* o serviço do orçamento para o nome gravado na face: { servico, aOrcar } ou null (material de antes ou digitado) */
    servicoDe: function (material) {
      var t = this.porNome(material); if (!t || t.antigo) return null;
      return { servico: t.servico, aOrcar: t.aOrcar, grupo: t.grupoId };
    },
    /* ------- ligação com o seletor fino (BimInstTipos) */
    aplicar: function (t) {
      if (!t) return false;
      this.ultimo = t;
      if (this.host && this.host.escolher) { try { this.host.escolher(t); } catch (e) { return false; } }
      return true;
    },
    registrar: function () {
      var B = BIT(); if (!B || !B.registrarCategoria) return false;
      var self = this;
      B.registrarCategoria(CAT, {
        rotulo: "Material do Pintar",
        abas: GRUPOS.filter(function (g) { return true; }),
        catalogo: function () { return self.itens(); },
        contexto: function () { return { cat: CAT, atual: self.ultimo, alvo: { pintura: true } }; },
        aplicar: function (t) { return self.aplicar(t); },
        esquecer: function () { /* o catálogo é fixo */ }
      });
      return true;
    }
  };

  BimPintarCat.registrarVisual();
  try { BimPintarCat.registrar(); } catch (eR) { /* o seletor ainda não carregou: a tela chama registrar() */ }
  if (typeof module !== "undefined" && module.exports) module.exports = BimPintarCat;
  global.BimPintarCat = BimPintarCat;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

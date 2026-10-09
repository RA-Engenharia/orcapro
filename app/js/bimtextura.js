/* =====================================================================
 * bimtextura.js — MATERIAIS REALISTAS DO BIM (motor puro)
 *
 * O que decide, e por que é puro: qual textura cada peça veste, em que escala,
 * com que tinta, e como ela se assenta na peça (as coordenadas de textura).
 * É isso que a pessoa VÊ — e um tijolo que sai deitado, esticado ou da cor
 * errada é defeito que ninguém pega olhando o código. `js/bim.js` só carrega
 * as imagens e põe nos materiais.
 *
 * ─────────────────────────────────────────────────────────────────────
 * QUAL TEXTURA (`escolher`), em três portas, nesta ordem:
 *   (a) a PROPRIEDADE do IFC: `IfcMaterialProperties` "RA_Material" com
 *       `Textura` (o nome da textura da biblioteca) e `Escala_m` (metros por
 *       repetição; faltando, vale o tamanho físico da biblioteca);
 *   (b) PALAVRA-CHAVE no nome do material (tijolo, pedra, madeira, telha,
 *       concreto, porcelanato, reboco, grama, brita, metal…);
 *   (c) nada: a peça fica com a cor do IFC, como sempre foi.
 *   Vidro não ganha textura: ganha física (brilho e transparência).
 *   No ESTILO VISUAL (prévia, 07/10/2026) entram mais duas coisas: antes de
 *   tudo, (0) a TROCA que a pessoa fez em Propriedades (gravada por obra), e
 *   a porta (b) passa a usar o dicionário v2 (DIC), com 44 texturas.
 *
 * ⚠ PEÇA TRANSPARENTE NÃO VESTE TEXTURA. Um elemento pode ter várias
 * geometrias e um material só ("pvc e vidro"): sem esta regra, o vidro de uma
 * porta de madeira sairia com veio de madeira.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A TINTA (`tinta`). A cor do IFC é a intenção do projetista; a textura dá o
 * detalhe. Por isso a textura é tingida para que a sua cor MÉDIA vire a cor do
 * IFC (fator por canal, em linear, com teto). A exceção é a cor CINZA genérica
 * (o "cinza padrão" de quem exportou sem material) sobre textura colorida: aí
 * vale a cor natural da textura — tingir tijolo de cinza não é realista.
 *
 * ─────────────────────────────────────────────────────────────────────
 * COMO ASSENTA (`uvDeMalha`). O IFC não traz coordenada de textura. A projeção
 * é PLANAR PELA NORMAL da face, em METROS do modelo:
 *   · eixo u = horizontal ao longo da face (cruz do "para cima" com a normal);
 *   · eixo v = sobe pela face (no telhado, sobe o caimento);
 *   · face horizontal (piso/forro): u = X, v = −Z (norte para cima).
 * Assim a parede tem o tijolo em pé e na escala certa, o telhado tem a fiada
 * seguindo o beiral SEM esticar com o caimento (o que a projeção de caixa
 * pura faria: +15% num telhado de 30°), e o piso segue os eixos do projeto.
 *
 * ⚠ A CONTA É FEITA EM DUPLA PRECISÃO, NO MODELO, RELATIVA A UMA ÂNCORA. A
 * posição da peça vem na MATRIZ (o web-ifc entrega a geometria local e a
 * matriz em double). Fazer a conta na placa de vídeo, em float32 e na
 * coordenada do mundo, faria a textura de um modelo georreferenciado
 * (~7.000.000 m) "nadar" em passos de meio metro. Aqui a matriz é aplicada em
 * double e a âncora é subtraída ANTES de virar float32 — a mesma lição da
 * agregação (js/bimagreg.js, D8).
 *
 * ⚠ A MESMA FUNÇÃO SERVE À PEÇA E À MALHA MESCLADA. É o que garante que a
 * textura não "pula" quando uma peça sai do mesclado (seleção, porta aberta):
 * a coordenada de cada vértice é a mesma nos dois desenhos, por construção.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PASTA = "img/texturas/";

  /* a biblioteca empacotada (tools/gerar-texturas.py imprime esta tabela):
     m = metros por repetição (largura), asp = altura/largura da imagem,
     media = cor média (média LINEAR devolvida em sRGB), metal = metalicidade,
     natural = a cor É o material (tijolo, madeira, pedra, grama): sobre o cinza
     genérico de um IFC sem material, vale a cor da própria textura.
     Fontes e licenças (todas CC0) em img/texturas/ORIGEM.txt. */
  /* `nome` (o que a pessoa lê na lista de Propriedades) e `cat` (a categoria
     da lista) chegaram com o estilo visual (07/10/2026). `pasta` = apelido:
     a MESMA imagem noutra escala (o azulejo de 12,5 cm vira porcelanato
     60×60 a 4,8 m por repetição) — sem baixar outra foto igual. */
  var BIB = {
    reboco_rustico_offwhite: { m: 1.0, asp: 1.0, media: [0.844, 0.829, 0.816], fonte: "ambientCG Plaster001", nome: "Reboco rústico", cat: "parede" },
    tijolo_macico_colonial_palha: { m: 1.3, asp: 1.0, media: [0.769, 0.728, 0.635], natural: 1, fonte: "ambientCG Bricks053", nome: "Tijolo maciço colonial", cat: "alvenaria" },
    pedra_moledo_clara: { m: 1.5, asp: 0.5, media: [0.686, 0.649, 0.513], natural: 1, fonte: "ambientCG Bricks084", nome: "Pedra moledo", cat: "pedra" },
    madeira_tabua_vertical_avela: { m: 1.0, asp: 2.0, media: [0.792, 0.758, 0.623], natural: 1, fonte: "ambientCG WoodSiding009 (girada 90°: tábuas em pé)", nome: "Tábua vertical (avelã)", cat: "madeira" },
    madeira_angelim_pedra: { m: 1.0, asp: 1.0, media: [0.669, 0.470, 0.328], natural: 1, fonte: "ambientCG Wood005", nome: "Madeira (angelim)", cat: "madeira" },
    telha_shingle_marrom: { m: 2.4, asp: 1.0, media: [0.241, 0.161, 0.110], natural: 1, fonte: "ambientCG RoofingTiles003 (cor reescalada para o castanho da shingle)", nome: "Telha shingle", cat: "cobertura" },
    pvc_amadeirado_caramelo: { m: 1.0, asp: 1.0, media: [0.671, 0.438, 0.199], natural: 1, fonte: "ambientCG Wood023", nome: "PVC amadeirado", cat: "madeira" },
    porcelanato_acetinado_claro: { m: 1.2, asp: 1.0, media: [0.876, 0.798, 0.676], natural: 1, fonte: "ambientCG Travertine009", nome: "Porcelanato acetinado claro", cat: "piso" },
    porcelanato_antiderrapante_externo: { m: 1.2, asp: 1.0, media: [0.679, 0.644, 0.546], natural: 1, fonte: "ambientCG PavingStones133", nome: "Piso externo antiderrapante", cat: "piso" },
    concreto_natural_greige: { m: 1.5, asp: 1.0, media: [0.636, 0.596, 0.530], fonte: "ambientCG Concrete048", nome: "Concreto natural", cat: "concreto" },
    piso_tijolo_macico: { m: 0.5, asp: 1.0, media: [0.394, 0.342, 0.274], natural: 1, fonte: "PolyHaven brick_floor", nome: "Piso de tijolo", cat: "externo" },
    forro_madeira_lambri: { m: 1.8, asp: 1.0, media: [0.609, 0.483, 0.369], natural: 1, fonte: "ambientCG WoodFloor051", nome: "Forro lambri", cat: "madeira" },
    grama: { m: 2.0, asp: 1.0, media: [0.399, 0.518, 0.172], natural: 1, fonte: "ambientCG Grass005", nome: "Grama", cat: "externo" },
    cascalho: { m: 1.5, asp: 1.0, media: [0.856, 0.841, 0.811], fonte: "ambientCG Gravel023", nome: "Brita / cascalho", cat: "externo" },
    piso_permeavel: { m: 1.92, asp: 1.0, media: [0.407, 0.371, 0.327], natural: 1, fonte: "PolyHaven concrete_pavers", nome: "Piso permeável (concregrama)", cat: "externo" },
    metal_preto_fosco: { m: 1.0, asp: 1.0, media: [0.117, 0.134, 0.130], metal: 0.3, fonte: "ambientCG Metal029", nome: "Metal preto fosco", cat: "metal" },
    azulejo_porcelanato_bwc: { m: 1.0, asp: 1.0, media: [0.972, 0.972, 0.970], fonte: "ambientCG Tiles107", nome: "Azulejo branco", cat: "piso" },
    madeira_deck: { m: 2.4, asp: 1.0, media: [0.574, 0.508, 0.392], natural: 1, fonte: "ambientCG Planks029S", nome: "Deck de madeira", cat: "madeira" },

    /* ---- leva do ESTILO VISUAL (07/10/2026): cor 1K, normal e rugosidade 512 ---- */
    bloco_ceramico_furado: { m: 1.8, asp: 1.0, media: [0.603, 0.366, 0.271], natural: 1, fonte: "ambientCG Bricks088", nome: "Bloco cerâmico (tijolo furado)", cat: "alvenaria" },
    tijolinho_laranja: { m: 1.1, asp: 1.0, media: [0.701, 0.465, 0.303], natural: 1, fonte: "ambientCG Bricks092", nome: "Tijolinho aparente", cat: "alvenaria" },
    /* ⚠ asp 1,4 FORÇADO: a foto é de tijolo cinza delgado; esticada na vertical a
       peça chega a ~39 × 19 cm (não há bloco de concreto CC0 — ver ORIGEM.txt) */
    bloco_concreto: { m: 1.75, asp: 1.4, media: [0.593, 0.590, 0.582], fonte: "ambientCG Bricks061", nome: "Bloco de concreto", cat: "alvenaria" },
    concreto_aparente_formas: { m: 3.6, asp: 1.0, media: [0.630, 0.630, 0.632], fonte: "ambientCG Concrete008", nome: "Concreto aparente (fôrma)", cat: "concreto" },
    concreto_liso_claro: { m: 1.1, asp: 0.5, media: [0.723, 0.723, 0.723], fonte: "ambientCG Concrete034", nome: "Concreto liso / pré-moldado", cat: "concreto" },
    cimento_queimado: { m: 2.0, asp: 1.0, media: [0.494, 0.514, 0.529], fonte: "ambientCG Concrete016", nome: "Cimento queimado", cat: "concreto" },
    pintura_lisa: { m: 1.5, asp: 1.0, media: [0.844, 0.830, 0.818], fonte: "ambientCG Plaster003", nome: "Pintura lisa (na cor do material)", cat: "parede" },
    porcelanato_branco_60: { pasta: "azulejo_porcelanato_bwc", m: 4.8, asp: 1.0, media: [0.972, 0.972, 0.970], fonte: "ambientCG Tiles107 (a foto do azulejo a 60 cm por peça)", nome: "Porcelanato branco 60×60", cat: "piso" },
    porcelanato_grafite: { m: 3.6, asp: 1.0, media: [0.316, 0.301, 0.287], natural: 1, fonte: "ambientCG Tiles140", nome: "Porcelanato grafite 60×60", cat: "piso" },
    pastilha_vidro: { m: 0.3, asp: 1.0, media: [0.822, 0.870, 0.880], natural: 1, fonte: "ambientCG Tiles133A", nome: "Pastilha de vidro", cat: "piso" },
    ladrilho_hidraulico: { m: 0.8, asp: 1.0, media: [0.636, 0.512, 0.345], natural: 1, fonte: "ambientCG Tiles131", nome: "Ladrilho hidráulico", cat: "piso" },
    pedra_sao_tome: { m: 2.0, asp: 1.0, media: [0.852, 0.708, 0.556], natural: 1, fonte: "ambientCG Tiles143", nome: "Pedra São Tomé", cat: "pedra" },
    granito_cinza: { m: 1.0, asp: 1.0, media: [0.632, 0.598, 0.604], natural: 1, fonte: "ambientCG Granite005A", nome: "Granito cinza", cat: "pedra" },
    marmore_branco: { m: 1.5, asp: 1.0, media: [0.678, 0.682, 0.715], natural: 1, fonte: "ambientCG Marble012", nome: "Mármore branco", cat: "pedra" },
    pedra_rachao: { m: 2.2, asp: 0.5, media: [0.514, 0.478, 0.351], natural: 1, fonte: "ambientCG Bricks089", nome: "Pedra rachão (muro)", cat: "pedra" },
    piso_laminado_claro: { m: 1.9, asp: 1.0, media: [0.717, 0.532, 0.335], natural: 1, fonte: "ambientCG WoodFloor040", nome: "Piso laminado / assoalho", cat: "madeira" },
    taco_espinha: { m: 1.5, asp: 1.0, media: [0.566, 0.444, 0.344], natural: 1, fonte: "ambientCG WoodFloor057", nome: "Taco espinha de peixe", cat: "madeira" },
    madeira_escura_imbuia: { m: 0.6, asp: 1.0, media: [0.353, 0.205, 0.077], natural: 1, fonte: "ambientCG Wood066 (girada 90°: veio em pé)", nome: "Madeira escura (imbuia)", cat: "madeira" },
    madeira_clara_freijo: { m: 0.8, asp: 1.0, media: [0.656, 0.512, 0.393], natural: 1, fonte: "ambientCG Wood094", nome: "Madeira clara (freijó, MDF)", cat: "madeira" },
    aluminio_escovado: { m: 1.0, asp: 1.0, media: [0.573, 0.583, 0.596], metal: 0.85, fonte: "ambientCG Metal009", nome: "Alumínio escovado / inox", cat: "metal" },
    telha_ceramica: { m: 2.2, asp: 1.0, media: [0.562, 0.359, 0.265], natural: 1, fonte: "ambientCG RoofingTiles014A", nome: "Telha cerâmica", cat: "cobertura" },
    telha_colonial: { m: 1.5, asp: 1.0, media: [0.464, 0.275, 0.184], natural: 1, fonte: "ambientCG RoofingTiles006", nome: "Telha colonial", cat: "cobertura" },
    telha_fibrocimento: { m: 1.06, asp: 1.0, media: [0.788, 0.785, 0.785], fonte: "ambientCG CorrugatedSteel003 (onda assada na cor)", nome: "Telha de fibrocimento", cat: "cobertura" },
    telha_metalica: { m: 0.76, asp: 1.0, media: [0.585, 0.591, 0.602], metal: 0.6, fonte: "ambientCG CorrugatedSteel005 (onda assada na cor)", nome: "Telha metálica", cat: "cobertura" },
    terra: { m: 2.0, asp: 1.0, media: [0.480, 0.381, 0.265], natural: 1, fonte: "ambientCG Ground067", nome: "Terra", cat: "externo" },
    areia: { m: 2.0, asp: 1.0, media: [0.708, 0.601, 0.453], natural: 1, fonte: "ambientCG Ground079L", nome: "Areia", cat: "externo" },
    asfalto: { m: 2.5, asp: 1.0, media: [0.338, 0.321, 0.281], natural: 1, fonte: "ambientCG Asphalt033", nome: "Asfalto", cat: "externo" }
  };

  /* as categorias da lista de Propriedades, na ordem em que aparecem */
  var CATEGORIAS = [
    { id: "alvenaria", nome: "Alvenaria e tijolo" },
    { id: "concreto", nome: "Concreto e cimento" },
    { id: "parede", nome: "Reboco e pintura" },
    { id: "piso", nome: "Porcelanato, cerâmica e azulejo" },
    { id: "pedra", nome: "Pedra e mármore" },
    { id: "madeira", nome: "Madeira" },
    { id: "metal", nome: "Metal e vidro" },
    { id: "cobertura", nome: "Telhas" },
    { id: "externo", nome: "Terreno e pavimento" }
  ];
  /* ⚠ TETOS DO PACOTE (vão a toda instalação e à placa de vídeo): a leva do
     estilo visual pode somar até 15 MB; a biblioteca inteira, 19 MB; cada mapa,
     250 KB. tools/test-bim-estilo-visual.js mede no disco. */
  var TETO = { novosMB: 15, totalMB: 19, mapaKB: 250 };

  /* ⚠ A ORDEM IMPORTA: o mais específico primeiro. "Piso de tijolo" não é
     parede de tijolo, "concregrama" não é grama, "PVC amadeirado" não é cano
     de PVC (cano fica sem textura: só "amadeirado" casa), e a madeira vem
     ANTES da pedra porque há madeira chamada "angelim pedra". */
  var REGRAS = [
    { re: /vidro|glass|cristal temperado/i, classe: "vidro" },
    { re: /alum[ií]nio|inox/i, classe: "metal" },
    { re: /concregrama|perme[aá]vel|intertravad|paver|bloquete/i, slug: "piso_permeavel" },
    { re: /piso[^|]*tijolo|tijolo[^|]*piso|ladrilho de barro/i, slug: "piso_tijolo_macico" },
    { re: /amadeirad/i, slug: "pvc_amadeirado_caramelo" },
    { re: /deck|assoalho|piso de madeira|taco/i, slug: "madeira_deck" },
    { re: /lambri|forro[^|]*madeira|macho.?f[eê]mea/i, slug: "forro_madeira_lambri" },
    { re: /t[aá]bua|siding|mata.?junta/i, slug: "madeira_tabua_vertical_avela" },
    { re: /madeira|angelim|eucalipto|pinus|cumaru|jatob[aá]|\bip[eê]\b|wood|timber/i, slug: "madeira_angelim_pedra" },
    { re: /tijolo|brick/i, slug: "tijolo_macico_colonial_palha" },
    { re: /pedra|moledo|granito|ard[oó]sia|stone/i, slug: "pedra_moledo_clara" },
    { re: /telha|shingle|roof/i, slug: "telha_shingle_marrom" },
    { re: /antiderrapante|piso externo/i, slug: "porcelanato_antiderrapante_externo" },
    { re: /porcelanato|piso cer[aâ]mico|cer[aâ]mica de piso/i, slug: "porcelanato_acetinado_claro" },
    { re: /azulejo|pastilha|revestimento cer[aâ]mico/i, slug: "azulejo_porcelanato_bwc" },
    { re: /concreto|concrete|cimentado/i, slug: "concreto_natural_greige" },
    { re: /reboco|textura|argamassa|chapisco|embo[cç]o|grafiato|pintura\s+(acr[ií]lica\s+)?externa/i, slug: "reboco_rustico_offwhite" },
    { re: /grama|gramado|grass/i, slug: "grama" },
    { re: /brita|cascalho|pedrisco|gravel/i, slug: "cascalho" },
    { re: /ferro|\ba[cç]o\b|met[aá]lic|metal|steel/i, slug: "metal_preto_fosco" }
  ];

  /* ---------------------------------------------------------------
   * DICIONÁRIO v2 — o casamento do ESTILO VISUAL (prévia `?previa=visual`)
   *
   * ⚠ POR QUE UM SEGUNDO DICIONÁRIO, e não mexer nas REGRAS. As REGRAS são o
   * que a frota usa hoje (Materiais realistas, 1.2.125) e a suíte delas grava
   * respostas que já estão no ar ("pintura interna lisa fica sem textura").
   * O v2 só vale onde o estilo visual está ligado; quando sair da prévia, ele
   * substitui as REGRAS de uma vez, com a suíte nova.
   *
   * O texto é NORMALIZADO antes (minúsculas, sem acento): o nome do material
   * do IFC é texto livre, em PT ou EN, e "Cerâmica"/"Ceramica"/"CERÂMICA" são
   * o mesmo material. A ORDEM IMPORTA, do mais específico ao mais genérico:
   *   1) vidro (a pastilha de vidro antes: é revestimento, não vidro);
   *   2) telhas (a metálica e a de fibrocimento antes da cerâmica genérica;
   *      "colonial" só com "telha" junto — "tijolo colonial" é tijolo);
   *   3) pisos e pedras com nome próprio;
   *   4) acabamento ANTES da alvenaria: "alvenaria rebocada e pintada" mostra
   *      a pintura, não o bloco. "Cerâmica" (substantivo, feminino) é
   *      revestimento; "cerâmico" (adjetivo) é do bloco — por isso o v2 casa
   *      `ceramica\b` e não `ceramic`;
   *   5) madeira; 6) alvenaria (o bloco de concreto antes do bloco cerâmico,
   *      que é o genérico de "alvenaria"); 7) concreto; 8) terreno; 9) metal;
   *   10) pedra genérica por último ("madeira angelim pedra" é madeira).
   * ------------------------------------------------------------- */
  var ACENTOS = { "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "ê": "e", "è": "e", "ë": "e", "í": "i", "ì": "i", "î": "i", "ï": "i",
                  "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o", "ú": "u", "ù": "u", "û": "u", "ü": "u", "ç": "c", "ñ": "n" };
  function normalizar(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[áàâãäéêèëíìîïóòôõöúùûüçñ]/g, function (c) { return ACENTOS[c] || c; })
      .replace(/[_\-\/]+/g, " ").replace(/\s+/g, " ").trim();
  }
  var DIC = [
    { re: /pastilha|glass mosaic|mosaico de vidro/, slug: "pastilha_vidro" },
    { re: /espelho|mirror/, classe: "metal" },
    { re: /vidro|glass|cristal|policarbonato/, classe: "vidro" },
    { re: /shingle/, slug: "telha_shingle_marrom" },
    { re: /telha.{0,30}(metal|aco|galvaniz|zinc|termoacust|sanduiche|trapez)|metal(lic)? roof|steel roof|termoacustic/, slug: "telha_metalica" },
    { re: /fibrocimento|fibro cimento|fib(er|re) ?cement|eternit|cimento amianto|telha ondulada/, slug: "telha_fibrocimento" },
    { re: /telha.{0,20}(colonial|capa|canal|romana|portuguesa|plan\b)|capa e canal|spanish tile|mission tile/, slug: "telha_colonial" },
    { re: /telha|roof ?til|clay roof|roofing/, slug: "telha_ceramica" },
    { re: /concregrama|permeavel|intertravad|paver|bloquete/, slug: "piso_permeavel" },
    { re: /piso.{0,20}tijolo|tijolo.{0,20}piso|ladrilho de barro|lajota/, slug: "piso_tijolo_macico" },
    { re: /ladrilho hidraulic|piso hidraulic|encaustic|cement tile/, slug: "ladrilho_hidraulico" },
    { re: /antiderrapante|piso externo|exterior floor/, slug: "porcelanato_antiderrapante_externo" },
    { re: /sao tome|miracema|pedra mineira|quartzito|pedra goia|arenito|sandstone|flagstone/, slug: "pedra_sao_tome" },
    { re: /rachao|pedra de mao|arrimo de pedra|alvenaria de pedra|muro de pedra|gabiao|rubble|fieldstone|stone wall/, slug: "pedra_rachao" },
    { re: /granito|granite/, slug: "granito_cinza" },
    { re: /marmore|marble|travertin/, slug: "marmore_branco" },
    { re: /ardosia|slate/, slug: "porcelanato_grafite" },
    { re: /porcelanato.{0,30}(grafite|preto|cinza escuro|chumbo|black|dark|antracite|anthracite)|(grafite|preto|chumbo).{0,20}porcelanato/, slug: "porcelanato_grafite" },
    { re: /porcelanato.{0,30}(branco|white|polido)|(branco|white).{0,20}porcelan/, slug: "porcelanato_branco_60" },
    { re: /azulejo|revestimento ceramic|wall til|subway/, slug: "azulejo_porcelanato_bwc" },
    { re: /porcelanato|porcelain|piso ceramic|ceramica\b|ceramic til|floor til|\btiles?\b/, slug: "porcelanato_acetinado_claro" },
    { re: /pintura|pintad|\btinta\b|painted|\bpaint\b|latex|gesso|drywall|gypsum|plasterboard|massa corrida|emassad/, slug: "pintura_lisa" },
    { re: /reboco|rebocad|emboco|argamassa|chapisco|grafiato|textura|plaster|stucco|\brender\b/, slug: "reboco_rustico_offwhite" },
    { re: /amadeirad/, slug: "pvc_amadeirado_caramelo" },
    { re: /\btaco|parquet|espinha|herringbone|chevron/, slug: "taco_espinha" },
    { re: /laminado|assoalho|vinilico|wood ?floor|flooring|piso de madeira|floorboard/, slug: "piso_laminado_claro" },
    { re: /\bdeck/, slug: "madeira_deck" },
    { re: /lambri|forro.{0,20}madeira|macho ?femea/, slug: "forro_madeira_lambri" },
    { re: /tabua|siding|mata ?junta|ripad/, slug: "madeira_tabua_vertical_avela" },
    { re: /imbuia|mogno|\bipe\b|cumaru|jatoba|tabaco|nogueira|walnut|mahogany|dark wood|madeira escura|wenge|cerejeira|cherry/, slug: "madeira_escura_imbuia" },
    { re: /freijo|carvalho|\boak\b|marfim|madeira clara|light wood|\bmdf\b|compensado|plywood|\bosb\b|birch|maple|betula|pinus|\bpine\b/, slug: "madeira_clara_freijo" },
    { re: /madeira|angelim|eucalipto|\bwood|timber/, slug: "madeira_angelim_pedra" },
    { re: /bloco.{0,15}concreto|concrete block|\bcmu\b|cinder ?block|bloco estrutural|blocket/, slug: "bloco_concreto" },
    { re: /tijolo macico|tijolo colonial|demolicao|tijolo de barro|adobe/, slug: "tijolo_macico_colonial_palha" },
    { re: /tijolinho|tijolo aparente|tijolo a vista|brick veneer|face brick|brick slip|\bbrick/, slug: "tijolinho_laranja" },
    { re: /bloco ceramic|tijolo furado|tijolo baiano|\d furos|ceramic block|clay block|hollow (clay )?brick|tijolo ceramic|alvenaria|masonry|vedacao|tijolo/, slug: "bloco_ceramico_furado" },
    { re: /concreto aparente|exposed concrete|fair ?faced|architectural concrete|board ?formed/, slug: "concreto_aparente_formas" },
    { re: /cimento queimado|polished concrete|cimentad|contrapiso|screed/, slug: "cimento_queimado" },
    { re: /pre ?moldad|pre ?fabricad|precast|concreto liso/, slug: "concreto_liso_claro" },
    { re: /concreto|concrete|cimento|\bfck|\bc[2-5][05]\b/, slug: "concreto_natural_greige" },
    { re: /grama|gramado|\bgrass|\blawn|relva/, slug: "grama" },
    { re: /asfalt|asphalt|cbuq|bitum|tarmac/, slug: "asfalto" },
    { re: /\bareia|\bsand\b/, slug: "areia" },
    { re: /brita|cascalho|pedrisco|gravel|seixo|pebble/, slug: "cascalho" },
    { re: /\bterra\b|\bsolo\b|\bsoil|\bearth\b|\bdirt\b|aterro|terreno/, slug: "terra" },
    { re: /alumini|aluminum|inox|stainless|anodiz/, slug: "aluminio_escovado" },
    { re: /ferro|\baco\b|metalic|metal|steel|galvaniz|chapa/, slug: "metal_preto_fosco" },
    { re: /pedra|stone|moledo|rocha|\brock/, slug: "pedra_moledo_clara" }
  ];
  /* o casamento de UM nome: a regra que venceu fica dita (rastreabilidade —
     a tela mostra "casou por: <termo>") */
  function casar(nome) {
    var t = normalizar(nome);
    if (!t) return null;
    for (var i = 0; i < DIC.length; i++) {
      var mm = DIC[i].re.exec(t);
      if (mm) return { slug: DIC[i].slug || "", classe: DIC[i].classe || "", termo: mm[0], regra: i };
    }
    return null;
  }
  /* a chave da TROCA feita pela pessoa: o nome do material normalizado (o
     mesmo material escrito com e sem acento é o mesmo material) */
  function chaveMaterial(nome) { return normalizar(nome); }

  function num(x) { var n = +x; return isFinite(n) ? n : 0; }
  function txt(s) { return String(s == null ? "" : s).trim(); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  function existe(slug) { return Object.prototype.hasOwnProperty.call(BIB, txt(slug)); }

  /* ---------------------------------------------------------------
   * escolher — a textura de UMA peça
   *
   * `materiais` é o que o viewer já lê do IFC por peça (bim.js lerMateriais):
   * [{ n: nome, f, rho, tx: textura da propriedade, esc: Escala_m }].
   * `opts.alfa` < 1 = geometria transparente (fica sem textura).
   * Devolve { slug, escala, asp, fonte: 'propriedade'|'palavra'|'', classe,
   *           material: nome que decidiu } — `slug` vazio = sem textura.
   * ------------------------------------------------------------- */
  function escolher(materiais, opts) {
    opts = opts || {};
    var lista = Array.isArray(materiais) ? materiais : [];
    var vazio = { slug: "", escala: 0, asp: 1, fonte: "", classe: "", material: "" };
    var alfa = opts.alfa == null ? 1 : num(opts.alfa);
    var i, m, nome;
    /* (0) a TROCA que a pessoa fez em Propriedades manda sobre tudo — até sobre
       a propriedade do IFC: ela olhou a peça e escolheu (gravada por obra) */
    var tr = opts.trocas;
    if (tr && typeof tr === "object") {
      for (i = 0; i < lista.length; i++) {
        nome = txt((lista[i] || {}).n);
        var v = nome ? tr[chaveMaterial(nome)] : null;
        if (!v) continue;
        if (v === "#cor") return { slug: "", escala: 0, asp: 1, fonte: "troca", classe: "", material: nome };
        if (v === "#vidro") return { slug: "", escala: 0, asp: 1, fonte: "troca", classe: "vidro", material: nome };
        if (!existe(v)) continue;
        if (alfa < 0.95) return vazio;
        return { slug: v, escala: BIB[v].m, asp: BIB[v].asp || 1, fonte: "troca", classe: "", material: nome };
      }
    }
    /* (a) a propriedade manda — em qualquer material da peça */
    for (i = 0; i < lista.length; i++) {
      m = lista[i] || {};
      if (m.tx && existe(m.tx)) {
        if (alfa < 0.95) return vazio;
        var e = num(m.esc);
        return { slug: txt(m.tx), escala: (e > 0.01 && e < 100) ? e : BIB[txt(m.tx)].m, asp: BIB[txt(m.tx)].asp || 1,
                 fonte: "propriedade", classe: "", material: txt(m.n) };
      }
    }
    /* (b) a palavra-chave, material por material, na ordem da peça —
       pelo dicionário v2 no estilo visual (ver DIC), pelas REGRAS no resto */
    if (opts.dic === "v2") {
      for (i = 0; i < lista.length; i++) {
        nome = txt((lista[i] || {}).n);
        var c2 = nome ? casar(nome) : null;
        if (!c2) continue;
        if (c2.classe) return { slug: "", escala: 0, asp: 1, fonte: "palavra", classe: c2.classe, material: nome, termo: c2.termo };
        if (alfa < 0.95) return vazio;
        return { slug: c2.slug, escala: BIB[c2.slug].m, asp: BIB[c2.slug].asp || 1, fonte: "palavra", classe: "", material: nome, termo: c2.termo };
      }
      return vazio;
    }
    for (i = 0; i < lista.length; i++) {
      nome = txt((lista[i] || {}).n);
      if (!nome) continue;
      for (var r = 0; r < REGRAS.length; r++) {
        if (!REGRAS[r].re.test(nome)) continue;
        if (REGRAS[r].classe) return { slug: "", escala: 0, asp: 1, fonte: "palavra", classe: REGRAS[r].classe, material: nome };
        if (alfa < 0.95) return vazio;
        var s = REGRAS[r].slug;
        return { slug: s, escala: BIB[s].m, asp: BIB[s].asp || 1, fonte: "palavra", classe: "", material: nome };
      }
    }
    return vazio;
  }

  /* a chave do material no cache do viewer: a mesma escolha = o mesmo material */
  function chave(esc) {
    if (!esc) return "";
    if (esc.slug) return esc.slug + "@" + num(esc.escala).toFixed(3);
    return esc.classe ? ("#" + esc.classe) : "";
  }

  /* ---------------------------------------------------------------
   * tinta — o fator (LINEAR, por canal) que leva a média da textura à cor do IFC
   * ------------------------------------------------------------- */
  function lin(c) { c = clamp(num(c), 0, 1); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function saturacao(c) { var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx > 0.001 ? (mx - mn) / mx : 0; }
  function tinta(corIfc, slug) {
    var b = BIB[txt(slug)];
    if (!b || !corIfc) return [1, 1, 1];
    var c = [num(corIfc[0]), num(corIfc[1]), num(corIfc[2])];
    /* cinza genérico sobre material de cor própria: a cor natural da textura */
    if (b.natural && saturacao(c) < 0.1) return [1, 1, 1];
    var out = [];
    for (var i = 0; i < 3; i++) out.push(clamp(lin(c[i]) / Math.max(lin(b.media[i]), 0.002), 0.2, 5));
    return out;
  }

  /* ---------------------------------------------------------------
   * uvPlanar / uvDeMalha — a coordenada de textura, em metros do modelo
   *
   * `p` já relativo à âncora e `n` unitário, os dois no espaço do modelo
   * (Y para cima). u, v em REPETIÇÕES (já divididos pela escala).
   * ------------------------------------------------------------- */
  function uvPlanar(px, py, pz, nx, ny, nz, escala, asp, fora, o) {
    var e = escala > 0 ? escala : 1, ev = e * (asp > 0 ? asp : 1);
    var tl = Math.sqrt(nx * nx + nz * nz), tx, tz, bx, by, bz;
    if (tl < 0.05) {
      /* horizontal: u = X; v = −Z (norte) no piso, +Z no forro (não espelha visto de baixo) */
      tx = 1; tz = 0; bx = 0; by = 0; bz = ny >= 0 ? -1 : 1;
    } else {
      /* T = cima × n (horizontal, ao longo da face);  B = n × T (sobe pela face) */
      tx = nz / tl; tz = -nx / tl;
      bx = ny * tz; by = nz * tx - nx * tz; bz = -ny * tx;
    }
    fora[o] = (px * tx + pz * tz) / e;
    fora[o + 1] = (px * bx + py * by + pz * bz) / ev;
    return fora;
  }

  /* toda a malha: `m` é a matriz do objeto (16, coluna-maior, double), a
     âncora [x,y,z] no espaço do modelo. `fora` e `offVert` permitem escrever
     direto dentro do buffer da malha mesclada. */
  function uvDeMalha(pos, nor, m, escala, asp, ancora, fora, offVert) {
    var nv = (pos.length / 3) | 0, o = (offVert | 0) * 2;
    var out = fora || new Float32Array(nv * 2);
    var a = ancora || [0, 0, 0], M = m || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (var v = 0; v < nv; v++) {
      var x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      var w = M[3] * x + M[7] * y + M[11] * z + M[15]; if (!w) w = 1;
      /* ⚠ a âncora sai ANTES de estreitar (ver o cabeçalho) */
      var px = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w - a[0];
      var py = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w - a[1];
      var pz = (M[2] * x + M[6] * y + M[10] * z + M[14]) / w - a[2];
      var nx0 = nor ? nor[v * 3] : 0, ny0 = nor ? nor[v * 3 + 1] : 1, nz0 = nor ? nor[v * 3 + 2] : 0;
      var nx = M[0] * nx0 + M[4] * ny0 + M[8] * nz0, ny = M[1] * nx0 + M[5] * ny0 + M[9] * nz0, nz = M[2] * nx0 + M[6] * ny0 + M[10] * nz0;
      var d = Math.sqrt(nx * nx + ny * ny + nz * nz); if (d > 1e-12) { nx /= d; ny /= d; nz /= d; }
      uvPlanar(px, py, pz, nx, ny, nz, escala, asp, out, o + v * 2);
    }
    return out;
  }

  /* a âncora: o centro (em double) das translações das peças, arredondado ao
     metro — determinístico pelo CONTEÚDO, então a textura não muda de lugar
     entre uma abertura e outra do mesmo arquivo */
  function ancoraDe(matrizes) {
    var sx = 0, sy = 0, sz = 0, n = 0;
    for (var i = 0; i < (matrizes || []).length; i++) {
      var m = matrizes[i]; if (!m || m.length < 16) continue;
      sx += num(m[12]); sy += num(m[13]); sz += num(m[14]); n++;
    }
    if (!n) return [0, 0, 0];
    return [Math.round(sx / n), Math.round(sy / n), Math.round(sz / n)];
  }

  /* ---------------------------------------------------------------
   * padrao — ligado ou não, sem a pessoa ter escolhido
   *
   * ⚠ LIGA SOZINHO SÓ QUANDO O MODELO PEDIU. Um modelo que traz a propriedade
   * RA_Material foi preparado para isso; um IFC qualquer casaria só
   * por palavra-chave, e virar a frota inteira de uma vez para textura
   * adivinhada mudaria a cara de todo modelo que já está aberto nas 38
   * instalações. Para esses, o botão está na fita.
   * ⚠ E NÃO LIGA SOZINHO EM APARELHO FRACO: a textura sobe para a placa de
   * vídeo (~4 MB por material) e o celular é o primeiro a perder o contexto.
   * A escolha da pessoa (`pref` '1'/'0') vale sobre tudo, menos a chave da
   * frota, que desliga o recurso inteiro.
   * ------------------------------------------------------------- */
  function aparelhoFraco(ap) {
    ap = ap || {};
    var mem = num(ap.memoria);
    if (mem && mem < 4) return true;
    if (ap.toque && num(ap.telaMax) && num(ap.telaMax) < 1000) return true;
    return false;
  }
  function padrao(o) {
    o = o || {};
    if (o.frota === false) return { ligado: false, motivo: "desligado para todas as instalações" };
    if (o.pref === "1") return { ligado: true, motivo: "ligado por você neste aparelho" };
    if (o.pref === "0") return { ligado: false, motivo: "desligado por você neste aparelho" };
    if (aparelhoFraco(o.aparelho)) return { ligado: false, motivo: "aparelho com pouca memória: ligue na fita se quiser" };
    if (o.temPropriedade) return { ligado: true, motivo: "o modelo traz as texturas dos materiais" };
    return { ligado: false, motivo: "o modelo não traz textura: ligue na fita para adivinhar pelo nome do material" };
  }

  function arquivos(slug, leve) {
    var s = txt(slug);
    if (!existe(s)) return null;
    /* o apelido (`pasta`) lê a imagem de outra entrada, em outra escala */
    var base = PASTA + (BIB[s].pasta || s) + "/";
    /* leve (aparelho fraco que ligou à mão, ou o modo Textura, que só usa a
       cor): só a cor — um mapa em vez de três */
    return leve ? { cor: base + "cor.jpg" } : { cor: base + "cor.jpg", normal: base + "normal.jpg", rugosidade: base + "rugosidade.jpg" };
  }

  /* ---------------------------------------------------------------
   * catalogo — a lista que Propriedades oferece para TROCAR a textura de um
   * material: por categoria, com o nome em PT-BR. Primeiro "só a cor".
   * ------------------------------------------------------------- */
  function catalogo() {
    var out = [{ id: "", nome: "Sem textura", itens: [{ slug: "#cor", nome: "Só a cor do material" }] }];
    CATEGORIAS.forEach(function (c) {
      var itens = Object.keys(BIB).filter(function (s) { return BIB[s].cat === c.id; })
        .map(function (s) { return { slug: s, nome: BIB[s].nome || s }; })
        .sort(function (a, b) { return a.nome < b.nome ? -1 : (a.nome > b.nome ? 1 : 0); });
      if (c.id === "metal") itens.push({ slug: "#vidro", nome: "Vidro (transparente, sem textura)" });
      if (itens.length) out.push({ id: c.id, nome: c.nome, itens: itens });
    });
    return out;
  }
  function nomeDe(slug) {
    if (slug === "#cor") return "Só a cor do material";
    if (slug === "#vidro") return "Vidro";
    return existe(slug) ? (BIB[slug].nome || slug) : "";
  }
  /* as trocas gravadas por obra passam por aqui ao ler: chave vazia, valor
     desconhecido (textura que saiu da biblioteca numa versão futura) e lixo
     ficam de fora — a peça cai no dicionário em vez de sumir */
  function limparTrocas(o) {
    var out = {};
    if (!o || typeof o !== "object") return out;
    Object.keys(o).forEach(function (k) {
      var kk = normalizar(k), v = txt(o[k]);
      if (!kk || kk.length > 200) return;
      if (v === "#cor" || v === "#vidro" || existe(v)) out[kk] = v;
    });
    return out;
  }
  /* o material que a peça MOSTRA (o primeiro com nome) — é ele que a troca
     de Propriedades grava */
  function materialPrincipal(materiais) {
    var l = Array.isArray(materiais) ? materiais : [];
    for (var i = 0; i < l.length; i++) { var n = txt((l[i] || {}).n); if (n) return n; }
    return "";
  }

  /* ---------------------------------------------------------------
   * ESTILO VISUAL — o que cada modo liga
   *
   * Uma tabela, e não `if` espalhado pelo viewer: é ela que diz que a linha
   * oculta é preto e branco (faces claras sem textura, arestas, fundo branco,
   * luz neutra e sem o tom ACES que puxa o branco para o cinza), que a textura
   * só usa a COR do material com luz simples, e que o realista liga relevo,
   * rugosidade, reflexo do ambiente e sombra. O viewer só obedece.
   * ------------------------------------------------------------- */
  var ESTILOS = ["linha", "sombreado", "textura", "realista"];
  var NOMES_ESTILO = { linha: "Linha oculta", sombreado: "Sombreado", textura: "Textura", realista: "Realista" };
  function estiloValido(s) { return ESTILOS.indexOf(txt(s)) >= 0; }
  function planoEstilo(s) {
    var e = estiloValido(s) ? txt(s) : "sombreado";
    var p = { estilo: e, nome: NOMES_ESTILO[e], texturas: false, pbr: false, arestas: false, fundoBranco: false, luzNeutra: false, semTom: false,
              facesClaras: false, sombras: false, env: null };
    if (e === "linha") { p.arestas = true; p.fundoBranco = true; p.luzNeutra = true; p.semTom = true; p.facesClaras = true; }
    else if (e === "textura") { p.texturas = true; p.env = 0.55; }
    else if (e === "realista") { p.texturas = true; p.pbr = true; p.sombras = true; p.env = 1.0; }
    return p;
  }

  var BimTextura = {
    PASTA: PASTA,
    BIB: BIB,
    REGRAS: REGRAS,
    existe: existe,
    escolher: escolher,
    chave: chave,
    tinta: tinta,
    uvPlanar: uvPlanar,
    uvDeMalha: uvDeMalha,
    ancoraDe: ancoraDe,
    aparelhoFraco: aparelhoFraco,
    padrao: padrao,
    arquivos: arquivos,
    /* estilo visual (07/10/2026) */
    CATEGORIAS: CATEGORIAS,
    TETO: TETO,
    DIC: DIC,
    ESTILOS: ESTILOS,
    normalizar: normalizar,
    casar: casar,
    chaveMaterial: chaveMaterial,
    catalogo: catalogo,
    nomeDe: nomeDe,
    limparTrocas: limparTrocas,
    materialPrincipal: materialPrincipal,
    estiloValido: estiloValido,
    planoEstilo: planoEstilo,
    _lin: lin
  };

  global.BimTextura = BimTextura;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTextura;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

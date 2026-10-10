/* =====================================================================
 * ifcsaida.js — IFC DE SAÍDA do que foi MODELADO no OrçaPRO (fase B7 do
 * PLANO-BIM-MODELADOR.md, 08/10/2026). Motor PURO, Node-testável.
 *
 * Entra o estado do editor (BimEdit.aplicar: paredes, lajes, pilares, vigas,
 * coberturas, famílias, volumes livres da B4) e sai um arquivo IFC4 (texto
 * STEP, ISO 10303-21) para abrir no Revit, no CYPE e em qualquer leitor IFC.
 *
 * DECISÃO — ESCRITOR STEP PRÓPRIO, NÃO O web-ifc:
 *  - o web-ifc 0.0.44 do vendor escreve, mas pede o WASM carregado, o modelo
 *    montado entidade por entidade pela API dele e muda de assinatura a cada
 *    versão; o arquivo sairia diferente conforme a versão do vendor;
 *  - aqui o texto é DETERMINÍSTICO (mesmo modelo + mesma data = mesmos bytes,
 *    o GlobalId nasce do hash do id da peça e da obra: reexportar não troca a
 *    identidade da peça no Revit), roda no Node sem WASM e é testável linha a
 *    linha;
 *  - e o web-ifc fica com o papel que ele faz melhor: LER. A prova de ida e
 *    volta (tools/test-ifc-saida.js) reabre o arquivo no web-ifc — um leitor
 *    independente deste escritor — e confere as peças, a hierarquia, as
 *    quantidades e o volume da geometria. Escritor e leitor do mesmo código
 *    concordariam até no erro.
 *
 * GEOMETRIA: prisma vai como IfcExtrudedAreaSolid (parede, laje, pilar, viga,
 * plano da cobertura, sólidos das famílias, volume extrudado da B4); o que não
 * é prisma (revolução, varredura, CSG, empurrar) vai como IfcFacetedBrep com
 * as faces planas JUNTADAS em polígonos. Nunca IfcTriangulatedFaceSet: o Revit
 * importa esse tipo SEM geometria (verificado em 01/10/2026).
 *
 * B2 E B5 (08/10/2026): o escritor nasceu antes do modelador e uma sonda
 * provou que escada virava proxy e tubo/eixo sumiam com os avisos VAZIOS.
 * Agora sai tudo o que a B2 (js/bimarq.js) e a B5 (js/biminst.js) modelam:
 *  - parede do modelador = os prismas REAIS do BimArq.pecasParede (cantos
 *    unidos, topo sob laje/cobertura; topo inclinado vai em Brep) + as
 *    camadas do tipo em IfcMaterialLayerSetUsage quando a soma bate;
 *  - laje por contorno com furo = IfcArbitraryProfileDefWithVoids;
 *  - pilar/viga por perfil = o perfil PARAMÉTRICO IFC4 (retângulo, círculo,
 *    I, U, L, tubos). A tela leva a seção para um par de eixos espelhado em
 *    relação à extrusão: o sólido nasce no topo (pilar) ou na ponta (viga) e
 *    volta — sem isso a L e o U sairiam do lado errado (o teste pega pelo
 *    centroide). Aviso: o web-ifc 0.0.44 lê o furo do
 *    IfcRectangleHollowProfileDef como X − t (o IFC4 é X − 2t); o arquivo
 *    segue o IFC4 — o volume desse perfil se confere no importador;
 *  - escada = IfcStair agregando IfcStairFlight (um por lance) + IfcSlab
 *    LANDING (patamar); guarda-corpo = IfcRailing; eixos = IfcGrid;
 *  - instalações = IfcPipeSegment/Fitting, IfcCableCarrierSegment/Fitting,
 *    IfcDuctSegment/Fitting, IfcSanitaryTerminal (ralo: RALO_IFC), IfcJunctionBox, com a
 *    inclinação real, um IfcDistributionSystem por sistema e o código
 *    SINAPI SÓ quando o BimInst já deu (pendente vai sem classificação).
 * O que não tem mapeamento vai para resumo.avisos com o motivo.
 *
 * INTEROPERABILIDADE (08/10/2026, ida e volta real no Revit 2027 — provas em
 * tools/): a classe de cada peça sai do MAPA_REVIT,
 * conferido no arquivo de mapeamento do próprio Revit; a conexão de tubo é
 * corpo de varredura (bolsas), não Brep; todo contorno de perfil passa pelo
 * poligonoSimples (o Revit ignora polilinha que volta sobre si); a escada
 * segue a estrutura IFC4 usual; o IfcGrid tem sempre U e V.
 *
 * P1-D (09/10/2026, plano do BIM, item 3.1 "IFC"): os Psets e Qtos
 * que eram escritos à mão aqui saem do REGISTRO ÚNICO (js/bimparam.js) — o
 * mesmo número da tela de Propriedades e do orçamento. Cada parâmetro com
 * `ifc` vai no Pset/Qto que ele diz, na medida IFC do dado; o de TIPO vai no
 * IfcTypeObject (IfcWallType, IfcSlabType, IfcColumnType…, um por tipo, com
 * IfcRelDefinesByType, GlobalId pela obra + categoria + tipoId); o valor que
 * o usuário gravou sem lugar próprio vai no Pset_OrcaPRO (o parâmetro do
 * projeto, no Pset_OrcaPRO_Projeto); a Marca vai na Tag (o id do OrçaPRO
 * passa para a Description). Aqui fica só o que é da geometria e não tem
 * parâmetro (volume bruto, área bruta da laje, seção pela geometria…).
 * Prova: tools/test-p1-saida.js.
 *
 * P2 (09/10/2026): AMBIENTE → IfcSpace (contorno na face extrudado na
 * altura; Name = Número, LongName = Nome; agregado ao nível) e FORRO →
 * IfcCovering CEILING (camadas em IfcMaterialLayerSetUsage; IfcRelCoversSpaces
 * para o ambiente). Categoria no "Abrir IFC" do Revit: MAPA_REVIT.ambiente /
 * .forro (medido 09/10/2026 no Revit 2027: IfcSpace → Ambiente (Room); o
 * IfcCovering CEILING veio Modelos genéricos — a forma sai de FORRO_IFC, a
 * prova é o tools/forro-prova-ifc.js). O sólido do IfcSpace vai até a altura
 * do VOLUME (o forro delimitador corta). Prova: tools/test-p2-saida.js.
 *
 * COORDENADAS: a cena é Y para cima (three.js); o IFC é Z para cima. O web-ifc
 * leva IFC (x, y, z) para a cena como (x, z, −y); aqui é o caminho inverso:
 * cena (x, y, z) → IFC (x, −z, y). Giro rotY da cena em volta de +Y = giro de
 * +rotY em volta de +Z no IFC (provado no teste pelo volume e pela caixa).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  /* ----------------------------------------------------- valores STEP */
  /* texto: apóstrofo dobra, barra invertida dobra, e o que não é ASCII vai
     em \X2\hhhh\X0\ (UTF-16) — o Revit lê acento assim e só assim */
  function S(s) {
    if (s == null) return "$";
    var t = String(s), out = "", run = "";
    function fecha() { if (run) { out += "\\X2\\" + run + "\\X0\\"; run = ""; } }
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i), ch = t.charAt(i);
      if (c > 126 || c < 32) { run += ("0000" + c.toString(16).toUpperCase()).slice(-4); continue; }
      fecha();
      out += ch === "'" ? "''" : (ch === "\\" ? "\\\\" : ch);
    }
    fecha();
    return "'" + out + "'";
  }
  /* real: sempre com ponto (STEP exige), sem notação exponencial */
  function R(v) {
    v = num(v, 0);
    if (Math.abs(v) < 5e-10) return "0.";
    var s = (Math.round(v * 1e9) / 1e9).toFixed(9).replace(/0+$/, "");
    return s;
  }
  /* P1-acab: QUANTIDADE (Qto) e medida de Pset com 15 algarismos significativos — a medida do
     registro vai inteira (a gravação usual é de 6 casas; com 9 casas fixas, um pilar de
     0,0047 m³ só teria 7 algarismos). Sem notação exponencial (STEP). */
  function RQ(v) {
    v = num(v, 0);
    if (Math.abs(v) < 1e-15) return "0.";
    var e = Math.floor(Math.log(Math.abs(v)) / Math.LN10), dec = Math.min(20, Math.max(9, 14 - e));
    return v.toFixed(dec).replace(/0+$/, "");
  }
  function E(x) { return "." + x + "."; }
  function L(a) { return "(" + a.join(",") + ")"; }
  function ref(n) { return "#" + n; }
  function P3(p) { return L([R(p[0]), R(p[1]), R(p[2])]); }
  function P2(p) { return L([R(p[0]), R(p[1])]); }

  /* ----------------------------------------------------------- GUID */
  /* GlobalId IFC = 128 bits em 22 caracteres do alfabeto do IFC. Os 128 bits
     saem do hash cyrb128 da semente (obra + id da peça): determinístico. */
  var ALFA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  function cyrb128(str) {
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (var i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  function guid(semente) {
    var h = cyrb128(String(semente)), b = [];
    h.forEach(function (x) { b.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
    function cv(n, dig) { var s = ""; for (var i = 0; i < dig; i++) { s = ALFA.charAt(n % 64) + s; n = Math.floor(n / 64); } return s; }
    var out = cv(b[0], 2);
    for (var i = 1; i < 16; i += 3) out += cv((b[i] << 16) + (b[i + 1] << 8) + b[i + 2], 4);
    return out;
  }
  function guidValido(g) { return typeof g === "string" && g.length === 22 && /^[0-3]/.test(g) && g.split("").every(function (c) { return ALFA.indexOf(c) >= 0; }); }

  /* -------------------------------------------------------- vetores */
  function cena2ifc(p) { return [p[0], -p[2], p[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 1]; }
  /* Rx(a) depois Ry(b) — a ordem 'YXZ' do three (matriz = Ry·Rx) */
  function rotYX(v, rotY, rotX) {
    var ca = Math.cos(rotX), sa = Math.sin(rotX), x = v[0], y = v[1] * ca - v[2] * sa, z = v[1] * sa + v[2] * ca;
    var cb = Math.cos(rotY), sb = Math.sin(rotY);
    return [x * cb + z * sb, y, -x * sb + z * cb];
  }

  function len(a) { return Math.sqrt(dot(a, a)); }
  /* área com sinal de um polígono 2D (positiva = anti-horário) */
  function areaS(pts) { var s = 0; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  /* tira ponto repetido em seguida (e o fechamento repetido) — o IFC não aceita aresta de comprimento zero */
  function semRepetido(pts, tol) {
    tol = tol || 1e-9;
    var o = [];
    pts.forEach(function (p) { var u = o[o.length - 1]; if (u && Math.abs(u[0] - p[0]) <= tol && Math.abs(u[1] - p[1]) <= tol) return; o.push(p); });
    while (o.length > 1 && Math.abs(o[0][0] - o[o.length - 1][0]) <= tol && Math.abs(o[0][1] - o[o.length - 1][1]) <= tol) o.pop();
    return o;
  }
  function sentido(pts, positivo) { var a = areaS(pts); return (a < 0) === !!positivo ? pts.slice().reverse() : pts.slice(); }
  /* o giro que o three faz em Quaternion.setFromUnitVectors(de, para), aplicado
     ao vetor v (o corrimão do guarda-corpo é uma BoxGeometry girada assim no
     js/bim.js: a seção quadrada fica com a MESMA orientação da tela) */
  function giroDeAte(de, para, v) {
    var r = dot(de, para) + 1, q;
    if (r < 1e-9) q = Math.abs(de[0]) > Math.abs(de[2]) ? [-de[1], de[0], 0, 0] : [0, -de[2], de[1], 0];
    else { var c = cross(de, para); q = [c[0], c[1], c[2], r]; }
    var l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); q = q.map(function (x) { return x / l; });
    var u = [q[0], q[1], q[2]], s = q[3], uv = cross(u, v), uuv = cross(u, uv);
    return add(v, add(mul(uv, 2 * s), mul(uuv, 2)));
  }

  /* ------------------------------------------------------ o escritor */
  var ENTIDADE_CAT = { porta: "IFCDOOR", janela: "IFCWINDOW", pilar: "IFCCOLUMN", viga: "IFCBEAM", parede: "IFCWALL", laje: "IFCSLAB", piso: "IFCSLAB" };
  var NOME_EDITOR = { parede: "Parede", laje: "Laje", pilar: "Pilar", viga: "Viga", escada: "Escada", guarda: "Guarda-corpo" };
  /* os nomes de material que o próprio editor já usa (js/bim.js, EST_NOMES_EDITOR) e as cores dele */
  var MAT_EDITOR = { parede: "Alvenaria", laje: "Laje de concreto", pilar: "Concreto armado", viga: "Concreto armado", cobertura: "Telha cerâmica", escada: "Concreto armado", guarda: "Aço" };
  var COR_MAT = { "alvenaria": 0xd8cfc0, "laje de concreto": 0x9aa7b4, "concreto armado": 0x7fa7d4, "telha cerâmica": 0xa65a3a, "concreto": 0xa9b0b8,
                  "madeira": 0xb88a5a, "madeira serrada": 0xb88a5a, "vidro": 0x9fd3f0, "alumínio": 0xc9ced6, "aço": 0x8a8f96, "metal": 0x8a8f96 };
  /* B5 (js/biminst.js): sistema → IfcDistributionSystemEnum; peça → PredefinedType */
  var SISTEMA_IFC = { agua_fria: "DOMESTICCOLDWATER", agua_quente: "DOMESTICHOTWATER", esgoto: "SEWAGE", ventilacao: "VENT", pluvial: "STORMWATER", eletrica: "ELECTRICAL", ar: "AIRCONDITIONING", bandeja: "ELECTRICAL" };   /* P12: eletrocalha */
  var PECA_IFC = { ralo_sifonado: "FLOORTRAP", ralo_seco: "FLOORWASTE", caixa_sifonada: "GULLYTRAP", caixa_4x2: "POWER", caixa_4x4: "POWER", caixa_octogonal: "POWER" };
  /* conexão deduzida → PredefinedType: tubo e duto (IfcPipeFittingTypeEnum =
     IfcDuctFittingTypeEnum) e eletroduto (IfcCableCarrierFittingTypeEnum) */
  var CONEXAO_TUBO = { joelho90: "BEND", joelho45: "BEND", te: "JUNCTION", te_reducao: "JUNCTION", juncao: "JUNCTION", cruzeta: "JUNCTION", luva: "CONNECTOR", reducao: "TRANSITION" };
  var CONEXAO_ELET = { joelho90: "BEND", joelho45: "BEND", te: "TEE", te_reducao: "TEE", juncao: "TEE", cruzeta: "CROSS", reducao: "REDUCER" };

  /* ----------------------------------------- CLASSE IFC ↔ CATEGORIA DO REVIT
   * FONTE: o arquivo de mapeamento do próprio Revit,
   *   C:\ProgramData\Autodesk\RVT 2027\exportlayers-ifc-IAI.txt (UTF-16;
   *   colunas: Categoria, Subcategoria, Classe IFC, Tipo, Tipo, Id).
   * Cada peça que o OrçaPRO exporta sai com a classe (e o PredefinedType,
   * quando o arquivo dá) da categoria do Revit em que ela tem de cair.
   * `linha` é a linha do arquivo (categoria + classe + tipo) — o
   * teste do mapa de classes confere cada uma contra o arquivo.
   *
   * POR QUE EXISTE (ida e volta real no Revit 2027, 08/10/2026): o ralo saía
   * IfcWasteTerminal e caiu em "Equipamento hidráulico" (no arquivo, Peças
   * hidrossanitárias = IfcFlowTerminal); o eletroduto caiu em "Bandejas de
   * cabos" mesmo com CONDUITSEGMENT (agora leva também o IfcCableCarrierSegmentType
   * CONDUITSEGMENT, na estrutura IFC4 usual).
   *
   * importa: o arquivo de EXPORTAÇÃO dá uma classe que o IMPORTADOR do Revit
   * não leva de volta para a categoria (P1-acab, ralo — ver RALO_IFC); vale a
   * classe do mapa de importação, com a fonte escrita.
   *
   * proxy: o arquivo manda a categoria para IfcBuildingElementProxy — e proxy
   * NÃO volta para a categoria (é o destino de dezenas delas e cai em Modelos
   * genéricos). Aí vale a classe própria, que a ida e volta provou chegar
   * na categoria certa; o motivo vai escrito.
   * parte: subcomponente exportado agregado a outro (lance e
   * patamar da escada) — o arquivo só lista o conjunto. */
  /* ---------------------------------------- RALO / CAIXA SIFONADA (P1-acab)
   * A ida e volta real (09/10/2026) levou o ralo
   * IfcFlowTerminal para "Modelos genéricos". O exportlayers-ifc-IAI.txt é a
   * tabela de EXPORTAÇÃO; quem decide a categoria no "Abrir IFC" é o
   * IMPORTADOR, e ele não usa esse arquivo.
   * FONTE: o importador do Revit é o revit-ifc da Autodesk (código aberto,
   *   LGPL; o Revit 2027 traz Revit.IFC.Import.dll), arquivo
   *   Source/Revit.IFC.Import/Utility/IFCCategoryUtil.cs — igual no master e
   *   no ramo Release_27.x.x (github.com/Autodesk/revit-ifc, lido em
   *   09/10/2026). A tabela padrão (InitEntityTypeToCategoryMaps; só não vale
   *   se Application.ImportIFCCategoryTable apontar um arquivo — nesta máquina
   *   não há nenhum) diz:
   *     IfcFlowTerminal          → OST_GenericModel        (Modelos genéricos)
   *     IfcFlowTerminal NOTDEFINED → OST_GenericModel
   *     IfcSanitaryTerminal(Type) → OST_PlumbingFixtures  (Peças hidrossanitárias)
   *     IfcWasteTerminal(Type)   → OST_PlumbingEquipment   (Equipamento hidráulico —
   *                                o que a ida e volta de 08/10 viu)
   *   e nenhuma linha por PredefinedType para Sanitary/WasteTerminal. Ordem
   *   da busca (GetCategoryIdForEntity): entidade + PredefinedType (+
   *   ObjectType), depois só a entidade; se der Modelos genéricos, tenta a
   *   classe do IfcTypeObject.
   * ESCOLHA: IfcSanitaryTerminal USERDEFINED, ObjectType = o nome da peça
   *   ("Ralo sifonado 100×40") e IfcSanitaryTerminalType igual — o IFC4 não
   *   tem ralo em IfcSanitaryTerminalTypeEnum (o ralo do IFC4 é
   *   IfcWasteTerminal FLOORTRAP, que o Revit leva para Equipamento
   *   hidráulico); a classe "de norma" segue no Pset
   *   OrcaPRO_Instalacao.ClasseIFC4 = IfcWasteTerminal.FLOORTRAP.
   *   Para trocar (se a prova no Revit disser outra coisa): RALO_IFC_CANDIDATOS.
   *   Arquivos de prova: tools/ralo-prova-ifc.js (um IFC por candidato). */
  var RALO_IFC_CANDIDATOS = {
    sanitario: { ifc: "IFCSANITARYTERMINAL", tipo: "USERDEFINED", revitImporta: "OST_PlumbingFixtures" },
    residuo: { ifc: "IFCWASTETERMINAL", tipo: null /* o do PECA_IFC: FLOORTRAP, FLOORWASTE, GULLYTRAP */, revitImporta: "OST_PlumbingEquipment" },
    fluxo: { ifc: "IFCFLOWTERMINAL", tipo: null /* sem PredefinedType no IFC4 */, revitImporta: "OST_GenericModel" }
  };
  var RALO_IFC = RALO_IFC_CANDIDATOS.sanitario;
  /* ---------------------------------------- FORRO (P2, ajuste de 09/10/2026)
   * A ida e volta real no Revit 2027 levou o IfcCovering .CEILING. (instância
   * CEILING + IfcCoveringType CEILING por IfcRelDefinesByType — o que sai
   * hoje) para "Modelos genéricos", apesar da tabela do importador.
   * O QUE O CÓDIGO DO IMPORTADOR DIZ (revit-ifc, ramo Release_27.x.x, lido em
   * 09/10/2026 — Source/Revit.IFC.Import):
   *   · Data/IFCObjectDefinition.cs Process: PredefinedType =
   *     GetPredefinedType(handle); Data/IFCObject.cs GetPredefinedType lê o
   *     atributo "PredefinedType" DA INSTÂNCIA (IFC4: para todas as classes;
   *     antes do IFC4, IfcCovering está na lista que tem o atributo).
   *   · Utility/IFCCategoryUtil.cs GetCategoryIdForEntity: se o
   *     PredefinedType da instância é vazio OU "NOTDEFINED", usa o do
   *     IfcTypeObject (GetAssociatedTypeEntityInfo: o 1º de TypeObjects, que
   *     vem do IsTypedBy = IfcRelDefinesByType); depois
   *     GetCategoryElementId(entidade, predefinido, ObjectType): tabela
   *     (entidade, predefinido, ObjectType) → (entidade, predefinido) →
   *     (EntityTypeKey, predefinido) → só a entidade. Para o IfcCovering:
   *     (IfcCovering, "CEILING") → OST_Ceilings; IfcCovering/IfcCoveringType
   *     sozinhos → OST_GenericModel. A chave é a grafia exata do enumerado
   *     ("CEILING", sem pontos). (IfcCovering, USERDEFINED) não tem linha:
   *     com USERDEFINED + ObjectType "CEILING" o código dá Modelos genéricos
   *     (a tabela por ObjectType não tem IfcCovering).
   *   · Utility/IFCElementUtil.cs CreateElement → GetDSValidCategoryId: o
   *     elemento importado é uma DirectShape; se
   *     DirectShape.IsValidCategoryId(categoria) for falso, o importador
   *     GRAVA no log "Creating DirectShape or DirectShapeType with disallowed
   *     category id: …, reverting to Generic Models." e põe em Modelos
   *     genéricos — nenhuma forma do IFC muda isso.
   *   · O revit-ifc não cria Room (o IfcSpace vira DirectShape), mas a ida e
   *     volta de 09/10 criou AMBIENTES (OST_Rooms) a partir do IfcSpace: o
   *     "Abrir IFC" do Revit 2027 não está seguindo só o código aberto. Ou
   *     seja: pela leitura, o que sai hoje JÁ deveria ir para Forros; a
   *     diferença está no caminho do importador (a DirectShape recusando a
   *     categoria, ou um importador que não é o revit-ifc). O log da
   *     importação (<arquivo>.ifc.log.html ao lado do IFC, quando é o
   *     revit-ifc) diz qual dos dois.
   * VARIANTES (os arquivos de prova: tools/forro-prova-ifc.js, um por chave):
   *   instancia  = IfcCovering CEILING, SEM IfcCoveringType
   *   tipo       = IfcCovering NOTDEFINED + IfcCoveringType CEILING
   *   ambos      = IfcCovering CEILING + IfcCoveringType CEILING (o de antes)
   *   objectType = IfcCovering USERDEFINED, ObjectType "CEILING", sem tipo
   * PADRÃO = ambos: é o caminho mais completo pela leitura do código (a
   * instância decide; o tipo cobre o importador que olhar só o tipo) e é o
   * que o próprio Revit exporta para o Forro. Trocar = uma linha (FORRO_IFC)
   * depois da prova no Revit; ver a nota de limitações do importador de IFC. */
  var FORRO_IFC_VARIANTES = {
    instancia:  { chave: "instancia", pre: "CEILING", tipo: false, objectType: null },
    tipo:       { chave: "tipo", pre: "NOTDEFINED", tipo: "CEILING", objectType: null },
    ambos:      { chave: "ambos", pre: "CEILING", tipo: "CEILING", objectType: null },
    objectType: { chave: "objectType", pre: "USERDEFINED", tipo: false, objectType: "CEILING" }
  };
  var FORRO_IFC = FORRO_IFC_VARIANTES.ambos;
  var MAPA_REVIT = {
    parede:            { ifc: "IFCWALL", revit: "Paredes", linha: "Paredes\t\tIfcWall" },
    laje:              { ifc: "IFCSLAB", tipo: "FLOOR", revit: "Pisos", linha: "Pisos\t\tIfcSlab\tFLOOR" },
    pilar:             { ifc: "IFCCOLUMN", revit: "Pilares estruturais", linha: "Pilares estruturais\t\tIfcColumn" },
    viga:              { ifc: "IFCBEAM", revit: "Quadro estrutural", linha: "Quadro estrutural\t\tIfcBuildingElementProxy",
                         proxy: "IfcBeam chega em Quadro estrutural (ida e volta 08/10/2026: v1 e v2 ok); proxy viraria Modelo genérico" },
    cobertura:         { ifc: "IFCROOF", revit: "Telhados", linha: "Telhados\t\tIfcRoof" },
    porta:             { ifc: "IFCDOOR", revit: "Portas", linha: "Portas\t\tIfcDoor" },
    janela:            { ifc: "IFCWINDOW", revit: "Janelas", linha: "Janelas\t\tIfcWindow" },
    generico:          { ifc: "IFCBUILDINGELEMENTPROXY", revit: "Modelos genéricos", linha: "Modelos genéricos\t\tIfcBuildingElementProxy" },
    escada:            { ifc: "IFCSTAIR", revit: "Escadas", linha: "Escadas\t\tIfcStair" },
    lance:             { ifc: "IFCSTAIRFLIGHT", tipo: "STRAIGHT", revit: "Escadas", parte: "escada" },
    patamar:           { ifc: "IFCSLAB", tipo: "LANDING", revit: "Escadas", parte: "escada" },
    guarda:            { ifc: "IFCRAILING", revit: "Guarda-corpos", linha: "Guarda-corpos\t\tIfcRailing" },
    /* P9 — RAMPA: "Rampas → IfcRamp" (exportlayers-ifc-IAI.txt do Revit 2027); IfcRamp agrega os
       IfcRampFlight (STRAIGHT) e os patamares (IfcSlab LANDING), como a escada */
    rampa:             { ifc: "IFCRAMP", revit: "Rampas", linha: "Rampas\t\tIfcRamp" },
    lanceRampa:        { ifc: "IFCRAMPFLIGHT", tipo: "STRAIGHT", revit: "Rampas", parte: "rampa" },
    patamarRampa:      { ifc: "IFCSLAB", tipo: "LANDING", revit: "Rampas", parte: "rampa" },
    eixos:             { ifc: "IFCGRID", revit: "Eixos", linha: "Eixos\t\tIfcGrid" },
    tubo:              { ifc: "IFCPIPESEGMENT", revit: "Tubulação", linha: "Tubulação\t\tIfcPipeSegment" },
    tuboFlexivel:      { ifc: "IFCPIPESEGMENT", tipo: "FLEXIBLESEGMENT", revit: "Tubulação flexível", linha: "Tubulação flexível\t\tIfcPipeSegment\tFLEXIBLESEGMENT" },
    conexaoTubo:       { ifc: "IFCPIPEFITTING", revit: "Conexões de tubo", linha: "Conexões de tubo\t\tIfcPipeFitting" },
    eletroduto:        { ifc: "IFCCABLECARRIERSEGMENT", tipo: "CONDUITSEGMENT", revit: "Conduites", linha: "Conduites\t\tIFCCableCarrierSegment\tCONDUITSEGMENT" },
    conexaoEletroduto: { ifc: "IFCCABLECARRIERFITTING", revit: "Conexões do conduite", linha: "Conexões do conduite\t\tIFCCableCarrierFitting" },
    duto:              { ifc: "IFCDUCTSEGMENT", revit: "Dutos", linha: "Dutos\t\tIfcDuctSegment" },
    dutoFlexivel:      { ifc: "IFCDUCTSEGMENT", tipo: "FLEXIBLESEGMENT", revit: "Dutos flexíveis", linha: "Dutos flexíveis\t\tIfcDuctSegment\tFLEXIBLESEGMENT" },
    conexaoDuto:       { ifc: "IFCDUCTFITTING", revit: "Conexões de duto", linha: "Conexões de duto\t\tIfcDuctFitting" },
    pecaHidro:         { ifc: RALO_IFC.ifc, tipo: RALO_IFC.tipo, revit: "Peças hidrossanitárias", linha: "Peças hidrossanitárias\t\tIfcFlowTerminal",
                         importa: "o importador do Revit leva IfcFlowTerminal para Modelos genéricos e IfcSanitaryTerminal para Peças hidrossanitárias (revit-ifc, IFCCategoryUtil.cs; ida e volta 09/10/2026: k1 em Modelos genéricos)" },
    caixaEletrica:     { ifc: "IFCJUNCTIONBOX", revit: "Dispositivos elétricos", linha: "Dispositivos elétricos\t\tIfcBuildingElementProxy",
                         proxy: "IfcJunctionBox chega em Dispositivos elétricos (ida e volta 08/10/2026: k2 ok); proxy viraria Modelo genérico" },
    /* P12 (09/10/2026). Onde o arquivo de EXPORTAÇÃO dá a classe do TIPO (IfcValveType,
       IfcLightFixtureType, IFCCableCarrierFittingType) a ocorrência é a classe sem "Type" e
       leva o IfcXxxType (IfcRelDefinesByType), na estrutura IFC4 usual. Onde ele dá proxy, vale a
       classe que o IMPORTADOR leva para a categoria (revit-ifc, IFCCategoryUtil.cs, lido em
       09/10/2026: IfcOutletType/IfcSwitchingDevice → OST_ElectricalFixtures; IfcElectricDistributionBoard
       → OST_ElectricalEquipment) — a provar na ida e volta. */
    bandeja:           { ifc: "IFCCABLECARRIERSEGMENT", tipo: "CABLETRAYSEGMENT", revit: "Bandejas de cabos", linha: "Bandejas de cabos\t\tIFCCableCarrierSegment\tCABLETRAYSEGMENT" },
    conexaoBandeja:    { ifc: "IFCCABLECARRIERFITTING", revit: "Conexões da bandeja de cabos", linha: "Conexões da bandeja de cabos\t\tIFCCableCarrierFittingType", comTipo: true },
    acessorioTubo:     { ifc: "IFCVALVE", revit: "Acessórios do tubo", linha: "Acessórios do tubo\t\tIfcValveType", comTipo: true },
    luminaria:         { ifc: "IFCLIGHTFIXTURE", revit: "Luminárias", linha: "Luminárias\t\tIfcLightFixtureType", comTipo: true },
    tomada:            { ifc: "IFCOUTLET", revit: "Dispositivos elétricos", linha: "Dispositivos elétricos\t\tIfcBuildingElementProxy",
                         proxy: "o importador do Revit leva IfcOutletType para Dispositivos elétricos (revit-ifc, IFCCategoryUtil.cs); proxy viraria Modelo genérico — a ocorrência vai com o IfcOutletType" },
    interruptor:       { ifc: "IFCSWITCHINGDEVICE", revit: "Dispositivos elétricos", linha: "Dispositivos elétricos\t\tIfcBuildingElementProxy",
                         proxy: "o importador do Revit leva IfcSwitchingDevice para Dispositivos elétricos (revit-ifc, IFCCategoryUtil.cs); proxy viraria Modelo genérico" },
    quadro:            { ifc: "IFCELECTRICDISTRIBUTIONBOARD", revit: "Equipamento elétrico", linha: "Equipamento elétrico\t\tIfcBuildingElementProxy",
                         proxy: "o importador do Revit leva IfcElectricDistributionBoard para Equipamento elétrico (revit-ifc, IFCCategoryUtil.cs); proxy viraria Modelo genérico" },
    /* P2 (09/10/2026) — AMBIENTE e FORRO. `abrirIfc` = a categoria em que o
       "Abrir IFC" do Revit 2027 põe a peça, pela tabela do IMPORTADOR
       (revit-ifc, Source/Revit.IFC.Import/Utility/IFCCategoryUtil.cs,
       InitEntityTypeToCategoryMaps — igual no master e no Release_27.x.x,
       lido em 09/10/2026):
         IfcSpace / IfcSpaceType      → OST_GenericModel (Modelos genéricos),
                                        subcategoria "IfcSpace" (azul-claro,
                                        75 % transparente; GetPredefinedColor…)
         IfcCovering (sem tipo)       → OST_GenericModel
         (IfcCovering, CEILING)       → OST_Ceilings   (Forros)
         (IfcCovering, FLOORING)      → OST_Floors; (IfcCovering, ROOFING) → OST_Roofs
       O arquivo de EXPORTAÇÃO (exportlayers-ifc-IAI.txt) dá "Ambientes →
       IfcSpace" e "Forros → IfcCovering" SEM PredefinedType: sem o CEILING o
       forro voltaria Modelo genérico — por isso o forro vai CEILING.
       MEDIDO na ida e volta de 09/10/2026 (Revit 2027): o IfcSpace virou
       AMBIENTE (Room, OST_Rooms) — o Abrir IFC do 2027 recria o Room, ao
       contrário do que o código aberto faz; e o IfcCovering CEILING veio
       Modelos genéricos (ver FORRO_IFC acima: o alvo segue Forros, a prova
       decide a forma). */
    ambiente:          { ifc: "IFCSPACE", tipo: null, revit: "Ambientes", linha: "Ambientes\t\tIfcSpace", abrirIfc: "Ambientes", abrirIfcOst: "OST_Rooms",
                         importa: "o Abrir IFC do Revit 2027 recria o AMBIENTE (Room) a partir do IfcSpace (ida e volta de 09/10/2026) — a área e o volume o Revit recalcula" },
    forro:             { ifc: "IFCCOVERING", tipo: FORRO_IFC.pre, tipoIfc: FORRO_IFC.tipo || null, objectType: FORRO_IFC.objectType, variante: FORRO_IFC.chave,
                         revit: "Forros", linha: "Forros\t\tIfcCovering", abrirIfc: "Forros", abrirIfcOst: "OST_Ceilings",
                         importa: "pela tabela do importador (revit-ifc, IFCCategoryUtil.cs) (IfcCovering, CEILING) vai para Forros; a ida e volta de 09/10/2026 levou para Modelos genéricos — a forma do IFC sai de FORRO_IFC (prova: tools/forro-prova-ifc.js)" },
    /* P11 (09/10/2026) — TERRENO. O EXPORTADOR do Revit 2027 (exportlayers-ifc-IAI.txt):
       "Sólido topográfico → IfcGeographicElement TERRAIN", "Subdivisões → IfcGeographicElement
       TERRAIN", "Terreno → IfcSite" (e "Plataformas → IfcSlab" como subcategoria do Terreno). O
       IMPORTADOR (revit-ifc, IFCCategoryUtil.cs, Release_27.x.x, lido em 09/10/2026) leva
       IfcGeographicElement e IfcSite para OST_Site (Terreno) — NÃO recria o Toposolid: o
       terreno volta como forma de Terreno (limitação do importador, LIMITACOES-IMPORTADOR-IFC.md).
       A plataforma do OrçaPRO é a REGIÃO CLASSIFICADA (o terreno terraplenado), não laje: vai
       como parte do terreno (IfcGeographicElement USERDEFINED "Plataforma"), com o corte e o
       aterro no OrcaPRO_Terraplenagem. */
    topossolido:       { ifc: "IFCGEOGRAPHICELEMENT", tipo: "TERRAIN", revit: "Sólido topográfico", linha: "Sólido topográfico\t\tIfcGeographicElement\tTERRAIN", abrirIfc: "Terreno", abrirIfcOst: "OST_Site",
                         importa: "o importador do Revit (IFCCategoryUtil.cs) leva IfcGeographicElement para Terreno (OST_Site) como forma; não recria o Sólido topográfico" },
    plataforma:        { ifc: "IFCGEOGRAPHICELEMENT", tipo: "USERDEFINED", revit: "Sólido topográfico", parte: "topossolido", abrirIfc: "Terreno", abrirIfcOst: "OST_Site" }
  };
  /* P3 (09/10/2026) — TELHADO, BORDAS e FUNDAÇÃO (o escritor é o js/ifcp3.js).
     `linha` = a do arquivo de EXPORTAÇÃO do Revit; `abrirIfcOst` = a do
     IMPORTADOR (revit-ifc, IFCCategoryUtil.cs, Release_27.x.x, lido em
     09/10/2026): IfcRoof → OST_Roofs; (IfcSlab, ROOF) → OST_Roofs; IfcFooting
     e IfcPile → OST_StructuralFoundation; (IfcSlab, BASESLAB) →
     OST_StructuralFoundation; IfcPipeSegment → OST_PipeCurves; IfcCovering
     sem CEILING/FLOORING/ROOFING → OST_GenericModel. A fundação isolada sai
     IfcFooting/IfcPile (a classe de exportação da família de fundação), não o
     IfcSlab BASESLAB da linha da categoria (essa é a do radier). */
  (function (o) { for (var k in o) if (o.hasOwnProperty(k)) MAPA_REVIT[k] = o[k]; })({
    telhado:      { ifc: "IFCROOF", revit: "Telhados", linha: "Telhados\t\tIfcRoof", abrirIfc: "Telhados", abrirIfcOst: "OST_Roofs" },
    aguaTelhado:  { ifc: "IFCSLAB", tipo: "ROOF", revit: "Telhados", parte: "telhado", abrirIfc: "Telhados", abrirIfcOst: "OST_Roofs" },
    calha:        { ifc: "IFCPIPESEGMENT", tipo: "GUTTER", revit: "Telhados", linha: "Telhados\tCalhas\tIfcPipeSegment\tGUTTER", abrirIfc: "Tubulação", abrirIfcOst: "OST_PipeCurves",
                    importa: "o importador do Revit leva IfcPipeSegment para Tubulação (revit-ifc, IFCCategoryUtil.cs; não há linha para GUTTER): a calha chega como tubo — calha nativa, só pelo plugin" },
    bordaTelhado: { ifc: "IFCCOVERING", tipo: "MOLDING", revit: "Telhados", linha: "Telhados\tBordas\tIfcCovering\tMOLDING", abrirIfc: "Modelos genéricos", abrirIfcOst: "OST_GenericModel",
                    importa: "o importador do Revit não tem linha para (IfcCovering, MOLDING): Modelos genéricos (revit-ifc, IFCCategoryUtil.cs)" },
    intradorso:   { ifc: "IFCCOVERING", tipo: "CLADDING", revit: "Telhados", linha: "Telhados\tIntradorsos de telhado\tIfcCovering\tCLADDING", abrirIfc: "Modelos genéricos", abrirIfcOst: "OST_GenericModel",
                    importa: "o importador do Revit não tem linha para (IfcCovering, CLADDING): Modelos genéricos (revit-ifc, IFCCategoryUtil.cs)" },
    sapata:       { ifc: "IFCFOOTING", tipo: "PAD_FOOTING", revit: "Fundações estruturais", linha: "Fundações estruturais\t\tIfcSlab\tBASESLAB", abrirIfc: "Fundações estruturais", abrirIfcOst: "OST_StructuralFoundation",
                    importa: "IfcFooting → OST_StructuralFoundation pela tabela do importador (revit-ifc, IFCCategoryUtil.cs)" },
    bloco:        { ifc: "IFCFOOTING", tipo: "PILE_CAP", revit: "Fundações estruturais", linha: "Fundações estruturais\t\tIfcSlab\tBASESLAB", abrirIfc: "Fundações estruturais", abrirIfcOst: "OST_StructuralFoundation",
                    importa: "IfcFooting → OST_StructuralFoundation pela tabela do importador (revit-ifc, IFCCategoryUtil.cs)" },
    baldrame:     { ifc: "IFCFOOTING", tipo: "FOOTING_BEAM", revit: "Fundações estruturais", linha: "Fundações estruturais\t\tIfcSlab\tBASESLAB", abrirIfc: "Fundações estruturais", abrirIfcOst: "OST_StructuralFoundation",
                    importa: "IfcFooting → OST_StructuralFoundation pela tabela do importador (revit-ifc, IFCCategoryUtil.cs)" },
    estaca:       { ifc: "IFCPILE", tipo: "BORED", revit: "Fundações estruturais", linha: "Fundações estruturais\t\tIfcSlab\tBASESLAB", abrirIfc: "Fundações estruturais", abrirIfcOst: "OST_StructuralFoundation",
                    importa: "IfcPile → OST_StructuralFoundation pela tabela do importador (revit-ifc, IFCCategoryUtil.cs)" },
    radier:       { ifc: "IFCSLAB", tipo: "BASESLAB", revit: "Fundações estruturais", linha: "Fundações estruturais\t\tIfcSlab\tBASESLAB", abrirIfc: "Fundações estruturais", abrirIfcOst: "OST_StructuralFoundation" }
  });
  /* a entidade de cada chave do editor (família, volume livre) → a chave do mapa */
  var MAPA_DA_ENTIDADE = { IFCWALL: "parede", IFCSLAB: "laje", IFCCOLUMN: "pilar", IFCBEAM: "viga", IFCROOF: "cobertura", IFCDOOR: "porta", IFCWINDOW: "janela", IFCBUILDINGELEMENTPROXY: "generico",
                           IFCSPACE: "ambiente", IFCCOVERING: "forro", IFCGEOGRAPHICELEMENT: "topossolido" };   /* P11 */
  /* peça da B5 (js/biminst.js PECAS) → chave do mapa; a classe específica do IFC4 vai no Pset (OrcaPRO_Instalacao.ClasseIFC4) */
  var PECA_MAPA = { ralo_sifonado: "pecaHidro", ralo_seco: "pecaHidro", caixa_sifonada: "pecaHidro", caixa_4x2: "caixaEletrica", caixa_4x4: "caixaEletrica", caixa_octogonal: "caixaEletrica" };

  /* -------------------------------------------- polígono SIMPLES de perfil
   * O Revit IGNORA a IfcPolyline autointersectante (aviso "As IfcPolyLines a
   * seguir são autointersectantes e serão ignoradas") e a peça chega sem o
   * sólido — o lance da escada chegou assim em 08/10/2026 por uma "agulha":
   * (2,03; 1,225) → (2,03; 1,40) → (2,03; 1,08), um segmento que volta sobre
   * o anterior. Aqui sai o ponto repetido e TODO vértice no meio de uma reta
   * (vizinhos colineares, indo ou voltando): a sequência de pontos na mesma
   * reta vira um segmento só, da entrada à saída. A área com sinal NÃO muda
   * (o trecho de ida e volta na mesma reta soma zero) — o volume é o mesmo. */
  function poligonoSimples(pts, tol) {
    tol = tol || 1e-9;
    var o = semRepetido(pts, tol), mudou = true;
    while (mudou && o.length > 3) {
      mudou = false;
      for (var i = 0; i < o.length && o.length > 3; i++) {
        var a = o[(i - 1 + o.length) % o.length], b = o[i], c = o[(i + 1) % o.length];
        var ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
        var lu = Math.sqrt(ux * ux + uy * uy), lv = Math.sqrt(vx * vx + vy * vy);
        /* aresta nula, ou seno do ângulo em b ~ 0 (colinear: segue reto ou dá meia-volta) */
        if (lu <= tol || lv <= tol || Math.abs(ux * vy - uy * vx) <= tol * lu * lv) { o.splice(i, 1); mudou = true; break; }
      }
      o = semRepetido(o, tol);
    }
    return o;
  }
  /* dois segmentos NÃO vizinhos que se tocam = autointerseção */
  function autointersecta(pts) {
    var n = pts.length;
    function lado(p, q, r) { var v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return Math.abs(v) < 1e-12 ? 0 : (v > 0 ? 1 : -1); }
    function noSeg(p, q, r) { return Math.min(p[0], r[0]) - 1e-12 <= q[0] && q[0] <= Math.max(p[0], r[0]) + 1e-12 && Math.min(p[1], r[1]) - 1e-12 <= q[1] && q[1] <= Math.max(p[1], r[1]) + 1e-12; }
    function cruza(p1, q1, p2, q2) {
      var o1 = lado(p1, q1, p2), o2 = lado(p1, q1, q2), o3 = lado(p2, q2, p1), o4 = lado(p2, q2, q1);
      if (o1 !== o2 && o3 !== o4) return true;
      return (o1 === 0 && noSeg(p1, p2, q1)) || (o2 === 0 && noSeg(p1, q2, q1)) || (o3 === 0 && noSeg(p2, p1, q2)) || (o4 === 0 && noSeg(p2, q1, q2));
    }
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (cruza(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
    return false;
  }
  /* CONEXÃO NO IFC: o raio é o da bola da tela (js/biminstui.js: DN/2 × 1,45,
     mínimo 8 mm × 1,45); o corpo é uma bolsa cilíndrica por ramo, que nasce
     r ATRÁS do centro (fecha o canto do joelho) e vai BOLSA × r para o lado
     do trecho. bolsasConexao devolve as direções na CENA (y para cima). */
  var BOLSA = 1.5;
  function raioConexao(c) { return Math.max((num(c.dn, 0) || 40) / 2000, 0.008) * 1.45; }
  function bolsasConexao(c, trechoPorId) {
    var P = [num(c.x, 0), num(c.y, 0), num(c.z, 0)], ds = [];
    function poe(d) { if (len(d) < 1e-9) return; d = norm(d); if (!ds.some(function (e) { return dot(e, d) > 0.9999; })) ds.push(d); }
    arr(c.ramos).forEach(function (id) {
      var t = trechoPorId[id]; if (!t) return;
      var a = [t.p1.x, t.p1.y, t.p1.z], b = [t.p2.x, t.p2.y, t.p2.z], da = len(sub(a, P)), db = len(sub(b, P));
      /* o nó na ponta: a bolsa vai para dentro do trecho; no meio (trecho passante): para os dois lados */
      if (Math.min(da, db) <= 0.03) poe(da <= db ? sub(b, a) : sub(a, b));
      else { poe(sub(b, a)); poe(sub(a, b)); }
    });
    if (!ds.length) ds.push([0, 1, 0], [0, -1, 0]);
    return ds;
  }
  function corDe(nome) {
    var k = String(nome || "").toLowerCase().trim();
    if (COR_MAT[k] != null) return COR_MAT[k];
    var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return 0x808080 + (h & 0x3f3f3f);
  }

  function gerar(estado, opts) {
    opts = opts || {};
    var BE = dep("BimEdit", "./bimedit.js"), BV = dep("BimVolume", "./bimvolume.js");
    /* B2 (parede unida e recortada) e B5 (a rede de instalações): motores puros */
    var BA = dep("BimArq", "./bimarq.js"), BI = dep("BimInst", "./biminst.js");
    var BC = dep("BimCurva", "./bimcurva.js");   /* CURVA: parede curva e contorno com arco */
    var linhas = [], n = 0, avisos = [], porEnt = {}, elementos = [], todosEls = [], regPorChave = {};
    var famIfc = {};   /* P12: famílias exportadas (as portas dos conectores) */
    function w(tipo, args) { n++; linhas.push("#" + n + "=" + tipo + "(" + args.join(",") + ");"); return n; }
    var semente = String(opts.semente || opts.projeto || "orcapro");
    function G(chave) { return S(guid(semente + "|" + chave)); }
    var agora = opts.agora ? new Date(opts.agora) : new Date();
    if (isNaN(agora.getTime())) agora = new Date(0);

    /* ---- cabeçalho do projeto: dono, aplicação, unidades, contextos ---- */
    var pessoa = w("IFCPERSON", ["$", S(opts.autor || "Usuário OrçaPRO"), "$", "$", "$", "$", "$", "$"]);
    var org = w("IFCORGANIZATION", ["$", S(opts.empresa || "OrçaPRO"), "$", "$", "$"]);
    var po = w("IFCPERSONANDORGANIZATION", [ref(pessoa), ref(org), "$"]);
    var orgApp = w("IFCORGANIZATION", ["$", S("RA Engenharia"), S("OrçaPRO"), "$", "$"]);
    var app = w("IFCAPPLICATION", [ref(orgApp), S(opts.versaoApp || "1"), S("OrçaPRO — modelador BIM"), S("OrcaPRO")]);
    var dono = w("IFCOWNERHISTORY", [ref(po), ref(app), "$", E("ADDED"), "$", "$", "$", String(Math.floor(agora.getTime() / 1000))]);
    var OH = ref(dono);
    var origem3 = w("IFCCARTESIANPOINT", [P3([0, 0, 0])]), origem2 = w("IFCCARTESIANPOINT", [P2([0, 0])]);
    var dirZ = w("IFCDIRECTION", [P3([0, 0, 1])]), dirX = w("IFCDIRECTION", [P3([1, 0, 0])]);
    var eixo0 = w("IFCAXIS2PLACEMENT3D", [ref(origem3), ref(dirZ), ref(dirX)]);
    var eixo2d = w("IFCAXIS2PLACEMENT2D", [ref(origem2), "$"]);
    var ctx = w("IFCGEOMETRICREPRESENTATIONCONTEXT", ["$", S("Model"), "3", "1.E-05", ref(eixo0), "$"]);
    var ctxCorpo = w("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", [S("Body"), S("Model"), "*", "*", "*", "*", ref(ctx), "$", E("MODEL_VIEW"), "$"]);
    var ctxEixo = w("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", [S("Axis"), S("Model"), "*", "*", "*", "*", ref(ctx), "$", E("GRAPH_VIEW"), "$"]);
    var unidades = [
      w("IFCSIUNIT", ["*", E("LENGTHUNIT"), "$", E("METRE")]), w("IFCSIUNIT", ["*", E("AREAUNIT"), "$", E("SQUARE_METRE")]),
      w("IFCSIUNIT", ["*", E("VOLUMEUNIT"), "$", E("CUBIC_METRE")]), w("IFCSIUNIT", ["*", E("PLANEANGLEUNIT"), "$", E("RADIAN")]),
      w("IFCSIUNIT", ["*", E("MASSUNIT"), E("KILO"), E("GRAM")])   /* massa do perfil de aço (B2) em kg */
    ];
    var ua = w("IFCUNITASSIGNMENT", [L(unidades.map(ref))]);
    var projeto = w("IFCPROJECT", [G("projeto"), OH, S(opts.projeto || "Projeto OrçaPRO"), S("Modelado no OrçaPRO"), "$", "$", "$", L([ref(ctx)]), ref(ua)]);
    var plSite = w("IFCLOCALPLACEMENT", ["$", ref(eixo0)]);
    var site = w("IFCSITE", [G("site"), OH, S(opts.terreno || "Terreno"), "$", "$", ref(plSite), "$", "$", E("ELEMENT"), "$", "$", "$", "$", "$"]);
    var plEd = w("IFCLOCALPLACEMENT", [ref(plSite), ref(eixo0)]);
    var edificio = w("IFCBUILDING", [G("edificio"), OH, S(opts.edificio || opts.projeto || "Edificação"), "$", "$", ref(plEd), "$", "$", E("ELEMENT"), "$", "$", "$"]);
    w("IFCRELAGGREGATES", [G("rel:projeto-site"), OH, "$", "$", ref(projeto), L([ref(site)])]);
    w("IFCRELAGGREGATES", [G("rel:site-edificio"), OH, "$", "$", ref(site), L([ref(edificio)])]);

    /* ---- níveis → IfcBuildingStorey; cada peça vai para o nível de baixo dela ---- */
    var niveis = arr(opts.niveis).filter(function (x) { return x && isFinite(Number(x.elevacao)); })
      .map(function (x) { return { nome: String(x.nome || "Nível"), elevacao: Number(x.elevacao), id: x.id }; })
      .sort(function (a, b) { return a.elevacao - b.elevacao; });
    if (!niveis.length) niveis = [{ nome: "Térreo", elevacao: 0 }];
    niveis.forEach(function (nv, i) {
      var pt = w("IFCCARTESIANPOINT", [P3([0, 0, nv.elevacao])]);
      var ax = w("IFCAXIS2PLACEMENT3D", [ref(pt), ref(dirZ), ref(dirX)]);
      nv.pl = w("IFCLOCALPLACEMENT", [ref(plEd), ref(ax)]);
      nv.ent = w("IFCBUILDINGSTOREY", [G("nivel:" + (nv.id || nv.nome + "@" + nv.elevacao)), OH, S(nv.nome), "$", "$", ref(nv.pl), "$", "$", E("ELEMENT"), R(nv.elevacao)]);
      nv.contidos = [];
    });
    w("IFCRELAGGREGATES", [G("rel:edificio-niveis"), OH, "$", "$", ref(edificio), L(niveis.map(function (x) { return ref(x.ent); }))]);
    function nivelDe(yBase) {
      var esc = niveis[0];
      niveis.forEach(function (nv) { if (nv.elevacao <= yBase + 0.01) esc = nv; });
      return esc;
    }
    /* B2: a peça do modelador sabe o nível em que nasceu (c.nivelId) — vale ele; sem ele, a cota */
    function nivelDaPeca(c, yBase) {
      if (c && c.nivelId != null) for (var i = 0; i < niveis.length; i++) if (niveis[i].id != null && String(niveis[i].id) === String(c.nivelId)) return niveis[i];
      return nivelDe(yBase);
    }
    /* ponto da cena → IFC, relativo ao nível */
    function W2I(p, nv) { var q = cena2ifc(p); q[2] -= nv.elevacao; return q; }

    /* ---- caches: direção, material (com estilo de cor), classificação ---- */
    var dirs = {};
    function D(v) { v = norm(v); var k = R(v[0]) + "," + R(v[1]) + "," + R(v[2]); if (!dirs[k]) dirs[k] = w("IFCDIRECTION", [P3(v)]); return dirs[k]; }
    function pt3(p) { return w("IFCCARTESIANPOINT", [P3(p)]); }
    function eixo(p, z, x) { return w("IFCAXIS2PLACEMENT3D", [ref(pt3(p)), ref(D(z || [0, 0, 1])), ref(D(x || [1, 0, 0]))]); }
    function placement(relTo, p, z, x) { return w("IFCLOCALPLACEMENT", [relTo ? ref(relTo) : "$", ref(eixo(p, z, x))]); }
    var mats = {};
    /* cor: opcional, só na 1ª vez (B5: o tubo leva a cor do SISTEMA, como na tela) */
    /* MATERIAIS (js/bimmateriais.js ifcOpts): os materiais DO PROJETO — { porId: {id: {nome, cor, transparencia}}, porNome } */
    var MPJ = opts.materiaisProjeto && opts.materiaisProjeto.porId ? opts.materiaisProjeto : null, matForcado = null;
    /* enquanto UMA peça é escrita, o material do projeto dela manda no nome do IfcMaterial e no estilo */
    function comMat(fn) { return function (x) { matForcado = MPJ && x && x.materialProj ? (MPJ.porId[String(x.materialProj)] || null) : null; try { return fn.apply(this, arguments); } finally { matForcado = null; } }; }
    function material(nome, cor) {
      nome = String(nome || "Indefinido").trim() || "Indefinido";
      if (mats[nome]) return mats[nome];
      var pj = MPJ && MPJ.porNome ? MPJ.porNome[nome] : null;   /* MATERIAIS: a cor e a transparência do projeto */
      var c = pj ? pj.cor : (cor != null ? cor : corDe(nome));
      var rgb = w("IFCCOLOURRGB", ["$", R(((c >> 16) & 255) / 255), R(((c >> 8) & 255) / 255), R((c & 255) / 255)]);
      var vidro = /vidro/i.test(nome);
      var sh = w("IFCSURFACESTYLESHADING", [ref(rgb), R(pj ? pj.transparencia : (vidro ? 0.65 : 0))]);
      /* o estilo tem o MESMO nome do material: é assim que o Revit pinta (importação do IFC) */
      var est = w("IFCSURFACESTYLE", [S(nome), E("BOTH"), L([ref(sh)])]);
      var m = w("IFCMATERIAL", [S(nome), "$", "$"]);
      var si = w("IFCSTYLEDITEM", ["$", L([ref(est)]), "$"]);
      var sr = w("IFCSTYLEDREPRESENTATION", [ref(ctxCorpo), S("Style"), S("Material"), L([ref(si)])]);
      w("IFCMATERIALDEFINITIONREPRESENTATION", ["$", "$", L([ref(sr)]), ref(m)]);
      mats[nome] = { m: m, estilo: est, elementos: [] };
      return mats[nome];
    }
    function pintar(item, nomeMat, cor) { if (matForcado) { nomeMat = matForcado.nome; cor = null; } w("IFCSTYLEDITEM", [ref(item), L([ref(material(nomeMat, cor).estilo)]), "$"]); }   /* MATERIAIS */
    var classif = null, refsCod = {};
    function codigo(cod, fonte) {
      cod = String(cod || "").trim(); if (!cod) return null;
      if (!classif) classif = w("IFCCLASSIFICATION", ["$", "$", "$", S("Código de orçamento OrçaPRO"), S("Composição do orçamento (SINAPI ou própria) ligada à peça no OrçaPRO"), "$", "$"]);
      if (!refsCod[cod]) refsCod[cod] = { r: w("IFCCLASSIFICATIONREFERENCE", ["$", S(cod), S(fonte ? fonte + " " + cod : cod), ref(classif), "$", "$"]), elementos: [] };
      return refsCod[cod];
    }

    /* ---- uma peça: entidade, contenção, material, Pset, Qto, código ---- */
    function retangulo(xd, yd) { return w("IFCRECTANGLEPROFILEDEF", [E("AREA"), "$", ref(eixo2d), R(xd), R(yd)]); }
    function extrudado(perfil, pos, prof) { return w("IFCEXTRUDEDAREASOLID", [ref(perfil), ref(pos), ref(D([0, 0, 1])), R(prof)]); }
    function forma(itens, tipoRep, extras) {
      var reps = [w("IFCSHAPEREPRESENTATION", [ref(ctxCorpo), S("Body"), S(tipoRep), L(itens.map(ref))])];
      (extras || []).forEach(function (x) { reps.unshift(x); });
      return w("IFCPRODUCTDEFINITIONSHAPE", ["$", "$", L(reps.map(ref))]);
    }
    /* P1-D: Psets e Qtos são JUNTADOS por peça (el.conj) e escritos no fim
       (escreverConjuntos): o que é da geometria entra aqui, o que é do
       REGISTRO (js/bimparam.js) entra depois e manda — o mesmo número da
       tela de Propriedades e do orçamento. */
    function conj(dono, nome, ehQto) {
      var c = dono.conj || (dono.conj = { ordem: [], por: {} });
      if (!c.por[nome]) { c.por[nome] = { nome: nome, qto: !!ehQto, ordem: [], props: {} }; c.ordem.push(nome); }
      return c.por[nome];
    }
    function por(cj, prop, tipo, valor, defId) {
      if (!cj.props[prop]) cj.ordem.push(prop);
      cj.props[prop] = { tipo: tipo, valor: valor, def: defId || null };
    }
    function pset(el, nome, props) {
      props.filter(function (p) { return p && p[2] != null && p[2] !== ""; }).forEach(function (p) { por(conj(el, nome, false), p[0], p[1], p[2]); });
    }
    var QTD = { L: "IFCQUANTITYLENGTH", A: "IFCQUANTITYAREA", V: "IFCQUANTITYVOLUME", C: "IFCQUANTITYCOUNT", W: "IFCQUANTITYWEIGHT" };
    function qto(el, nome, qs) {
      qs.filter(function (q) { return q && isFinite(Number(q[2])); }).forEach(function (q) { por(conj(el, nome, true), q[0], q[1], Number(q[2])); });
    }
    function valorProp(tipo, v) {
      return tipo + "(" + (tipo === "IFCBOOLEAN" ? (v ? ".T." : ".F.") : (/MEASURE|IFCREAL|IFCINTEGER|IFCCOUNT/.test(tipo) ? (tipo === "IFCINTEGER" ? String(Math.round(v)) : RQ(v)) : S(v))) + ")";
    }
    /* escreve os conjuntos de UM dono: a peça (IfcRelDefinesByProperties) ou
       o tipo (vão em HasPropertySets — devolve as referências) */
    function escreverConjuntos(dono, chaveG, ligar) {
      var refs = [];
      arr(dono.conj && dono.conj.ordem).forEach(function (nome) {
        var cj = dono.conj.por[nome]; if (!cj.ordem.length) return;
        if (cj.qto) {
          if (ligar) dono.qto = dono.qto || {};
          var ids = cj.ordem.map(function (k) { var p = cj.props[k]; if (ligar) dono.qto[k] = p.valor; return w(QTD[p.tipo], [S(k), "$", "$", RQ(p.valor), "$"]); });
          var eq = w("IFCELEMENTQUANTITY", [G((ligar ? "qto:" : "tqto:") + chaveG + ":" + nome), OH, S(nome), "$", S("OrçaPRO — medido na geometria modelada"), L(ids.map(ref))]);
          if (ligar) w("IFCRELDEFINESBYPROPERTIES", [G("rdq:" + chaveG + ":" + nome), OH, "$", "$", L([ref(dono.ent)]), ref(eq)]);
          refs.push(eq);
        } else {
          var ps = cj.ordem.map(function (k) { var p = cj.props[k]; return w("IFCPROPERTYSINGLEVALUE", [S(k), "$", valorProp(p.tipo, p.valor), "$"]); });
          var s = w("IFCPROPERTYSET", [G((ligar ? "pset:" : "tpset:") + chaveG + ":" + nome), OH, S(nome), "$", L(ps.map(ref))]);
          if (ligar) w("IFCRELDEFINESBYPROPERTIES", [G("rdp:" + chaveG + ":" + nome), OH, "$", "$", L([ref(dono.ent)]), ref(s)]);
          refs.push(s);
        }
      });
      return refs;
    }
    /* o.parte: peça AGREGADA a outra (lance da escada) — não vai direto para o
       nível, quem está no nível é o todo; o.semente: a semente do GlobalId
       quando o id não é estável (conexão deduzida: vale o lugar e o tipo) */
    function peca(chave, entidade, nome, objType, pl, rep, extra, yBase, nivel, o) {
      o = o || {};
      var sem = o.semente || ("el:" + chave);
      /* P1-D: a peça do registro leva a MARCA no atributo Tag (o equivalente
         ao "Mark" dos importadores); o id do OrçaPRO passa para a Description — a ida e
         volta e os testes acham a peça por ele */
      var rp = entidade !== "IFCOPENINGELEMENT" ? regPorChave[chave] : null, marca = rp && rp.marca ? String(rp.marca) : "";
      if (!marca && o.marca) marca = String(o.marca);   /* METÁLICA: a marca de fabricação (P1, CH3, A2) */
      var tag = marca ? S(marca) : S("ORC_edit_" + chave), desc = marca ? S("ORC_edit_" + chave) : "$";
      var nv = nivel || nivelDe(yBase), args = [S(guid(semente + "|" + sem)), OH, S(nome), desc, objType ? S(objType) : "$", ref(pl), rep ? ref(rep) : "$", tag];
      /* P2: o IfcSpace é ELEMENTO ESPACIAL — não tem Tag (depois da Representation
         vêm LongName, CompositionType, PredefinedType, ElevationWithFlooring): o
         id do OrçaPRO vai na Description, e ele é AGREGADO ao nível
         (IfcRelAggregates), não contido — o IFC4 proíbe elemento espacial em
         IfcRelContainedInSpatialStructure (WR31) */
      if (o.espacial) args = [S(guid(semente + "|" + sem)), OH, S(nome), S("ORC_edit_" + chave), objType ? S(objType) : "$", ref(pl), rep ? ref(rep) : "$"];
      args = args.concat(extra || []);
      var ent = w(entidade, args);
      if (o.espacial) (nv.espacos = nv.espacos || []).push(ent);
      else if (entidade !== "IFCOPENINGELEMENT" && !o.parte) nv.contidos.push(ent);
      porEnt[entidade] = (porEnt[entidade] || 0) + 1;
      var el = { chave: chave, ent: ent, entidade: entidade, nome: nome, nivel: nv.nome, guid: guid(semente + "|" + sem) };
      /* o PredefinedType da ocorrência (o do tipo segue o dela): porta/janela, o 3º extra; o resto, o último enumerado */
      var ens = arr(extra).filter(function (x) { return /^\.[A-Z_]+\.$/.test(String(x)); });
      el.pre = ens.length ? String(entidade === "IFCDOOR" || entidade === "IFCWINDOW" ? ens[0] : ens[ens.length - 1]).replace(/\./g, "") : null;
      if (rp) { el.reg = rp; el.marca = marca || null; }
      todosEls.push(el);
      if (o.parte) el.parteDe = o.parte;
      /* a categoria do Revit em que a peça tem de cair (MAPA_REVIT) */
      var km = o.mapa || MAPA_DA_ENTIDADE[entidade];
      if (km && MAPA_REVIT[km]) { el.mapa = km; el.revit = MAPA_REVIT[km].revit; }
      if (entidade !== "IFCOPENINGELEMENT") elementos.push(el);
      return el;
    }
    function ligarMaterial(el, nome) { if (matForcado) nome = matForcado.nome; var m = material(nome); m.elementos.push(el.ent); el.material = String(nome); }   /* MATERIAIS */
    function ligarCodigos(el, cods, fonte) {
      el.codigos = [];
      arr(cods).forEach(function (c) { var r = codigo(c, fonte); if (r && r.elementos.indexOf(el.ent) < 0) { r.elementos.push(el.ent); el.codigos.push(String(c).trim()); } });
    }
    function origemPset(el, extra) {
      pset(el, "OrcaPRO_Origem", [["Origem", "IFCLABEL", "Criado no OrçaPRO"], ["IdOrcaPRO", "IFCIDENTIFIER", el.chave]].concat(extra || []));
    }

    var st = estado || {}, avaliarFam = typeof opts.avaliarFam === "function" ? opts.avaliarFam : function () { return null; };
    var vaos = BE && BE.vaosDasParedes ? BE.vaosDasParedes(st, avaliarFam) : {};

    /* ================= P1-D: o REGISTRO ÚNICO DE PARÂMETROS =================
     * js/bimparam.js resolve cada peça (o MESMO resolver da tela de
     * Propriedades e do orçamento): a marca vai na Tag, cada parâmetro com
     * `ifc` vai no Pset/Qto que ele diz, o de TIPO vai no IfcTypeObject, e o
     * valor gravado pelo usuário sem lugar próprio vai no Pset_OrcaPRO. */
    var BP = dep("BimParam", "./bimparam.js"), resReg = null;
    /* a chave da peça no IFC a partir do id do registro (lance "es:lance:0" → "es:lance1") */
    function chaveDoRegistro(p) { var m = /^(.*):lance:(\d+)$/.exec(String(p.id)); return m ? m[1] + ":lance" + (Number(m[2]) + 1) : String(p.id); }
    if (BP && typeof BP.resolver === "function") {
      try {
        resReg = BP.resolver(st, { avaliarFam: avaliarFam, categoriaFam: opts.categoriaFam, nomeFam: opts.nomeFam, familia: opts.familia, niveis: opts.niveis,
                                   projeto: opts.parametrosProjeto, ifcGuid: function (p) { return guid(semente + "|el:" + chaveDoRegistro(p)); } });
        resReg.pecas.forEach(function (p) { regPorChave[chaveDoRegistro(p)] = p; });
        resReg.avisos.forEach(function (a) { avisos.push("registro de parâmetros: " + a); });
      } catch (eReg) { avisos.push("registro de parâmetros (js/bimparam.js) falhou: " + (eReg && eReg.message) + " — os Psets/Qtos do registro ficaram de fora"); resReg = null; }
    } else avisos.push("o registro de parâmetros (js/bimparam.js) não carregou: os Psets/Qtos, a marca e os tipos que saem dele ficaram de fora do IFC");
    var paredesIfc = {};   /* id da parede → { el, pl } (para as aberturas) */

    /* ================= GEOMETRIA COMUM DA B2/B5 ================= */
    function ponto2(q) { return w("IFCCARTESIANPOINT", [P2(q)]); }
    function poli2(pts) { return w("IFCPOLYLINE", [L(pts.concat([pts[0]]).map(function (q) { return ref(ponto2(q)); }))]); }
    /* contorno qualquer (com ou sem furos): externo anti-horário, furos horários.
       Todo contorno passa pelo poligonoSimples (o Revit ignora a polilinha que
       volta sobre si); o que ainda se cruza vai com aviso, nunca calado. */
    function perfilPoli(pts, furos, nome, quem) {
      function limpo(p) {
        var s = poligonoSimples(p);
        if (s.length >= 3 && autointersecta(s)) avisos.push((quem || "perfil" + (nome ? " " + nome : "")) + ": o contorno se cruza — o Revit ignora a polilinha autointersectante e a peça chega sem sólido");
        return s;
      }
      pts = limpo(pts); furos = arr(furos).map(limpo);
      var ext = poli2(sentido(pts, true)), fs = furos.filter(function (f) { return f.length >= 3; });
      if (!fs.length) return w("IFCARBITRARYCLOSEDPROFILEDEF", [E("AREA"), nome ? S(nome) : "$", ref(ext)]);
      return w("IFCARBITRARYPROFILEDEFWITHVOIDS", [E("AREA"), nome ? S(nome) : "$", ref(ext), L(fs.map(function (f) { return ref(poli2(sentido(f, false))); }))]);
    }
    function circulo(r) { return w("IFCCIRCLEPROFILEDEF", [E("AREA"), "$", ref(eixo2d), R(r)]); }
    function pos3(o, z, x) { return w("IFCAXIS2PLACEMENT3D", [ref(pt3(o)), z ? ref(D(z)) : "$", x ? ref(D(x)) : "$"]); }
    /* um sólido de faces planas (já orientadas para FORA, em coordenadas do
       placement): IfcFacetedBrep. Ponto repetido na face cai; face que sobra
       com menos de 3 pontos (aresta que encolheu a zero) não entra. */
    function brepFaces(faces) {
      var cache = {}, fs = [];
      function P(p) { var k = R(p[0]) + "," + R(p[1]) + "," + R(p[2]); if (!cache[k]) cache[k] = w("IFCCARTESIANPOINT", [P3(p)]); return cache[k]; }
      faces.forEach(function (f) {
        var rs = [];
        f.forEach(function (p) { var r = P(p); if (rs[rs.length - 1] !== r) rs.push(r); });
        while (rs.length > 1 && rs[0] === rs[rs.length - 1]) rs.pop();
        if (rs.length < 3) return;
        var loop = w("IFCPOLYLOOP", [L(rs.map(ref))]);
        fs.push(w("IFCFACE", [L([ref(w("IFCFACEOUTERBOUND", [ref(loop), ".T."]))])]));
      });
      return fs.length >= 4 ? w("IFCFACETEDBREP", [ref(w("IFCCLOSEDSHELL", [L(fs.map(ref))]))]) : null;
    }
    /* prisma de base plana (z0) e topo PLANO INCLINADO (zt por vértice) — o
       pedaço de parede sob o telhado. base2 anti-horário. */
    function prismaBrep(base2, z0, zt) {
      var n = base2.length, bot = base2.map(function (q) { return [q[0], q[1], z0]; }), top = base2.map(function (q, i) { return [q[0], q[1], zt[i]]; }), faces = [bot.slice().reverse(), top];
      for (var i = 0; i < n; i++) { var j = (i + 1) % n; faces.push([bot[i], bot[j], top[j], top[i]]); }
      return brepFaces(faces);
    }
    /* tipo de MEP (IfcXxxType + IfcRelDefinesByType), na estrutura IFC4 usual:
       um por classe + nome + PredefinedType, ligado no fim às ocorrências */
    var tiposMEP = {}, ordemTipos = [];
    function tipoMEP(classe, nome, pre, el) {
      var k = classe + "|" + nome + "|" + pre;
      if (!tiposMEP[k]) {
        tiposMEP[k] = { t: w(classe + "TYPE", [G("tipo:" + k), OH, S(nome), "$", "$", "$", "$", "$", pre === "USERDEFINED" ? S(nome) : "$", E(pre)]), els: [] };
        ordemTipos.push(k);
      }
      tiposMEP[k].els.push(el.ent); el.tipoIfc = classe + "TYPE";
    }
    /* referencial de uma peça: origem O e eixo X horizontal (IFC); devolve o ponto no local */
    function quadro(O, X) { var Y = [-X[1], X[0], 0]; return function (p) { var d = sub(p, O); return [dot(d, X), dot(d, Y), d[2]]; }; }

    /* ================= METÁLICA & MECÂNICA (js/metalpeca.js, js/metalfab.js) =================
     * chapa → IfcPlate (contorno com os furos em IfcArbitraryProfileDefWithVoids), perfil →
     * IfcColumn/IfcBeam/IfcMember (perfil paramétrico; com corte inclinado, Brep do prisma
     * cortado), parafuso/chumbador → IfcMechanicalFastener (BOLT/ANCHORBOLT, diâmetro e
     * comprimento nominais, a norma da classe por classificação), peça mecânica →
     * IfcDiscreteAccessory. Furo nos perfis (das ligações) → IfcOpeningElement +
     * IfcRelVoidsElement. Com opts.fabricacao: um IfcElementAssembly por CONJUNTO de
     * montagem (a peça principal + o que é soldado nela), por IfcRelAggregates. */
    var BMt = dep("BimMetal", "./metalpeca.js"), BMf = dep("BimMetalFab", "./metalfab.js"), metalPorChave = {}, clsNorma = null, refsNorma = {};
    var PRE_MEMBRO = [[/terça/i, "PURLIN"], [/contravento/i, "BRACE"], [/banzo/i, "CHORD"], [/montante/i, "POST"], [/diagonal/i, "STRUT"]];
    function metalSolido(sd, nv, cisalhaOk) {
      var Ui = cena2ifc(sd.U), Wi = cena2ifc(sd.W), Vi = cena2ifc(sd.Vv), h = dot(cross(Wi, Ui), Vi) < 0 ? -1 : 1;
      var poli = sd.poli.map(function (q) { return [q[0], h * q[1]]; }), furos = arr(sd.furos).map(function (f) { return f.map(function (q) { return [q[0], h * q[1]]; }); });
      if (sd.cisalha && cisalhaOk) {
        /* prisma CORTADO (as duas pontas inclinadas): Brep — o contorno de baixo, o de cima e as faces laterais, para fora */
        var Co = sentido(sd.poli, true), hR = dot(cross(sd.U, sd.Vv), sd.W) > 0;
        var bot = Co.map(function (q) { return W2I(sd.ponto(q[0], q[1], sd.z0), nv); }), top = Co.map(function (q) { return W2I(sd.ponto(q[0], q[1], sd.z1), nv); });
        var fs = [bot.slice().reverse(), top.slice()];
        for (var i = 0; i < Co.length; i++) { var j = (i + 1) % Co.length; fs.push([bot[i], bot[j], top[j], top[i]]); }
        if (!hR) fs = fs.map(function (f) { return f.slice().reverse(); });
        return { item: brepFaces(fs), tipo: "Brep" };
      }
      var perf = perfilPoli(poli, furos, null, "peça metálica");
      var pos = w("IFCAXIS2PLACEMENT3D", [ref(pt3(W2I(sd.ponto(0, 0, sd.z0), nv))), ref(D(Wi)), ref(D(Ui))]);
      return { item: extrudado(perf, pos, sd.z1 - sd.z0), tipo: "SweptSolid" };
    }
    function metalPeca(c) {
      if (!BMt) { avisos.push("peça metálica " + c.id + ": o motor da metálica (js/metalpeca.js) não carregou — ficou de fora"); return; }
      var m = c.metal, sols = BMt.solidos(c);
      if (!sols.length) { avisos.push("peça metálica " + c.id + " sem geometria — ficou de fora"); return; }
      var yb = num(c.cy, 0) - num(c.altura, 0) / 2, nv = nivelDe(yb), itens = [], tipos = {};
      var temFuroInterno = sols.some(function (s) { return arr(s.furos).length; });
      sols.forEach(function (sd) {
        if (sd.cisalha && temFuroInterno) avisos.push("peça metálica " + c.id + ": tubo com corte inclinado foi como prisma reto no IFC (o corte está no DSTV)");
        var r = metalSolido(sd, nv, !temFuroInterno); if (!r || !r.item) return;
        pintar(r.item, "Aço"); itens.push(r.item); tipos[r.tipo] = 1;
      });
      if (!itens.length) { avisos.push("peça metálica " + c.id + ": o sólido não fechou — ficou de fora"); return; }
      var tipoRep = Object.keys(tipos).length === 1 ? Object.keys(tipos)[0] : "SolidModel";
      var pl = placement(nv.pl, [0, 0, 0]), nome = BMt.nome(c), ent, extra, objType = m.papel;
      if (m.kind === "parafuso") { ent = "IFCMECHANICALFASTENER"; extra = [R(num(m.db, 0) / 1000), R(num(m.Lmm, 0) / 1000), E(m.chumbador ? "ANCHORBOLT" : "BOLT")]; }
      else if (m.kind === "chapa") { ent = "IFCPLATE"; extra = [E("USERDEFINED")]; }
      else if (m.kind === "perfil") {
        ent = c.ifc === "IFCCOLUMN" ? "IFCCOLUMN" : (c.ifc === "IFCBEAM" ? "IFCBEAM" : "IFCMEMBER");
        var pre = ent === "IFCCOLUMN" ? "COLUMN" : (ent === "IFCBEAM" ? "BEAM" : "MEMBER");
        PRE_MEMBRO.forEach(function (k) { if (ent === "IFCMEMBER" && k[0].test(m.papel)) pre = k[1]; });
        extra = [E(pre)];
      } else { ent = "IFCDISCRETEACCESSORY"; extra = [E("USERDEFINED")]; }
      var el = peca(c.id, ent, nome, objType, pl, forma(itens, tipoRep), extra, yb, nv, { marca: c.marca || null });
      var matN = "Aço " + (m.aco || (m.kind === "parafuso" ? ((BimNormaClasse(m.classe) || {}).nome || m.classe) : ""));
      ligarMaterial(el, matN.trim());
      var ps = [["Funcao", "IFCLABEL", m.papel], ["Aco", "IFCLABEL", m.aco || ""], ["Massa", "IFCMASSMEASURE", c.massa], ["Ligacao", "IFCIDENTIFIER", m.lig || ""]];
      if (m.kind === "chapa") ps.push(["Espessura", "IFCPOSITIVELENGTHMEASURE", m.t]);
      if (m.kind === "perfil") ps.push(["Perfil", "IFCLABEL", m.perfilRotulo || (m.perfil && (m.perfil.cat || m.perfil.forma))], ["Comprimento", "IFCPOSITIVELENGTHMEASURE", m.L]);
      if (m.kind === "parafuso") ps.push(["Classe", "IFCLABEL", m.classe], ["Comprimento", "IFCPOSITIVELENGTHMEASURE", num(m.Lmm, 0) / 1000], ["Aperto", "IFCPOSITIVELENGTHMEASURE", m.aperto]);
      if (m.solda) ps.push(["Solda", "IFCLABEL", (m.solda.tipo === "topo" ? "Topo" : "Filete") + " " + m.solda.perna + " mm" + (m.solda.campo ? " (campo)" : " (oficina)")]);
      pset(el, "OrcaPRO_Fabricacao", ps);
      if (m.kind === "parafuso") {
        var BN = dep("BimMetalNorma", "./metalnorma.js"), pf = BN ? BN.parafuso(m.id) : null;
        pset(el, "Pset_MechanicalFastenerBolt", [["ThreadDiameter", "IFCPOSITIVELENGTHMEASURE", num(m.db, 0) / 1000], ["NutsCount", "IFCCOUNTMEASURE", 1], ["WashersCount", "IFCCOUNTMEASURE", num(m.arrCabeca, 0) + num(m.arrPorca, 0)],
                                                      ["HeadShape", "IFCLABEL", m.chumbador ? "" : "Sextavada"], ["NutShape", "IFCLABEL", "Sextavada"]]);
        /* a norma da classe por classificação (ASTM F3125 A325, ISO 898-1 8.8…) */
        var cl = (BN && BN.CLASSES[m.classe]) || { norma: m.classe };
        if (!clsNorma) clsNorma = w("IFCCLASSIFICATION", ["$", "$", "$", S("Normas de parafusos e chumbadores"), S("Classe e norma do fixador (OrçaPRO Modela — metálica)"), "$", "$"]);
        if (!refsNorma[m.classe]) refsNorma[m.classe] = { r: w("IFCCLASSIFICATIONREFERENCE", ["$", S(m.classe), S(cl.norma), ref(clsNorma), "$", "$"]), els: [] };
        refsNorma[m.classe].els.push(el.ent);
        void pf;
      }
      qto(el, m.kind === "chapa" ? "Qto_PlateBaseQuantities" : (m.kind === "perfil" ? (ent === "IFCCOLUMN" ? "Qto_ColumnBaseQuantities" : (ent === "IFCBEAM" ? "Qto_BeamBaseQuantities" : "Qto_MemberBaseQuantities")) : "Qto_BuildingElementProxyQuantities"),
          [["NetVolume", "V", c.volume], ["NetWeight", "W", c.massa]].concat(m.kind === "perfil" ? [["Length", "L", m.L]] : []).concat(m.kind === "chapa" ? [["NetArea", "A", m.dim && m.dim.areaLiq]] : []));
      origemPset(el, [["Modelador", "IFCLABEL", "Metálica"]]);
      el.volume = r6(num(c.volume, 0)); el.massa = num(c.massa, 0); el.metal = m.kind;
      metalPorChave[String(c.id)] = el;
    }
    function BimNormaClasse(k) { var BN = dep("BimMetalNorma", "./metalnorma.js"); return BN && BN.CLASSES[k]; }
    function metalFinal() {
      if (!BMt) return;
      /* os FUROS dos perfis (pilar/viga do modelador e perfil da metálica) → IfcOpeningElement */
      var nAb = 0;
      arr(st.caixas).forEach(function (c) {
        if (!c) return;
        var fs = BMt.furosDe(c); if (!fs.length) return;
        var dono = null;
        for (var i = 0; i < todosEls.length; i++) { var e0 = todosEls[i]; if (String(e0.chave) === String(c.id) && /^(IFCBEAM|IFCCOLUMN|IFCMEMBER)$/.test(e0.entidade)) { dono = e0; break; } }
        var mb = BMt.membro(c); if (!dono || !mb) return;
        fs.forEach(function (f, k) {
          var fm = BMt.furoMundo(mb, f); if (!fm) return;
          var nv = nivelDe(fm.P[1]), prof = fm.t + 0.004, raio = num(f.d, num(f.db, 0) + 1.5) / 2000;
          var O = W2I([fm.P[0] - fm.eixo[0] * prof / 2, fm.P[1] - fm.eixo[1] * prof / 2, fm.P[2] - fm.eixo[2] * prof / 2], nv), Z = cena2ifc(fm.eixo);
          var Xr = Math.abs(Z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], X = norm(sub(Xr, mul(Z, dot(Xr, Z))));
          var sol = extrudado(circulo(raio), pos3(O, Z, X), prof);
          var chave = c.id + "-furo" + (k + 1);
          var ab = peca(chave, "IFCOPENINGELEMENT", "Furo Ø" + num(f.d, 0) + " mm (" + (f.face || "") + ")", "Furo", placement(nv.pl, [0, 0, 0]), forma([sol], "SweptSolid"), [E("OPENING")], fm.P[1], nv);
          w("IFCRELVOIDSELEMENT", [G("void:" + chave), OH, "$", "$", ref(dono.ent), ref(ab.ent)]);
          nAb++;
        });
      });
      Object.keys(refsNorma).forEach(function (k) { var r = refsNorma[k]; w("IFCRELASSOCIATESCLASSIFICATION", [G("clsnorma:" + k), OH, "$", "$", L(r.els.map(ref)), ref(r.r)]); });
      if (!opts.fabricacao || !BMf) return;
      /* CONJUNTOS DE MONTAGEM: o conjunto fica no nível; as peças, agregadas a ele (saem do nível) */
      var nu = BMf.numerar(st), nAs = 0;
      nu.conjuntos.forEach(function (g) {
        g.conjuntos.forEach(function (k, ix) {
          var partes = k.ids.map(function (id) { return metalPorChave[String(id)] || todosEls.filter(function (e1) { return String(e1.chave) === String(id) && /^(IFCBEAM|IFCCOLUMN|IFCMEMBER|IFCPLATE|IFCDISCRETEACCESSORY)$/.test(e1.entidade); })[0]; }).filter(Boolean);
          if (!partes.length) return;
          var pr = partes[0], nv = niveis.filter(function (x) { return x.nome === pr.nivel; })[0] || niveis[0];
          var asm = peca("conj:" + k.principal, "IFCELEMENTASSEMBLY", g.marca, "Conjunto de montagem", placement(nv.pl, [0, 0, 0]), null, [E("FACTORY"), E("USERDEFINED")], nv.elevacao, nv, { marca: g.marca });
          pset(asm, "OrcaPRO_Fabricacao", [["Conjunto", "IFCLABEL", g.marca], ["PecaPrincipal", "IFCLABEL", g.principal], ["Partes", "IFCLABEL", g.partes.join(", ")], ["Massa", "IFCMASSMEASURE", g.massa]]);
          var ents = partes.map(function (e2) { return e2.ent; });
          niveis.forEach(function (nv2) { nv2.contidos = nv2.contidos.filter(function (x) { return ents.indexOf(x) < 0; }); });
          partes.forEach(function (e3) { e3.parteDe = asm.ent; e3.conjunto = g.marca; pset(e3, "OrcaPRO_Fabricacao", [["Marca", "IFCLABEL", nu.marcaDe[e3.chave] || ""], ["Conjunto", "IFCLABEL", g.marca]]); });
          w("IFCRELAGGREGATES", [G("conj:" + k.principal + ":" + ix), OH, S(g.marca), "$", ref(asm.ent), L(ents.map(ref))]);
          nAs++;
        });
      });
      void nAb; void nAs;
    }

    /* ================= B2 — MODELADOR (js/bimarq.js) ================= */
    /* devolve true se a peça foi escrita (ou ficou de fora COM aviso); false = segue o caminho antigo da caixa */
    function b2Peca(c) {
      if (c.tipo === "metal" && c.metal) { metalPeca(c); return true; }   /* METÁLICA & MECÂNICA */
      if (c.tipo === "parede" && c.b2) {
        if (!BA || !BA.pecasParede) { avisos.push("parede " + c.id + ": o motor da B2 (js/bimarq.js) não carregou — foi como caixa, sem a união dos cantos e o topo recortado"); return false; }
        paredeB2(c); return true;
      }
      if (c.tipo === "laje" && arr(c.contorno).length >= 3) { lajeB2(c); return true; }
      if ((c.tipo === "pilar" || c.tipo === "viga") && c.perfil) {
        if (!perfilSuportado(c.perfil)) { avisos.push((c.tipo === "pilar" ? "pilar " : "viga ") + c.id + ": perfil " + (c.perfil.forma || "?") + " sem perfil IFC4 correspondente — ficou de fora"); return true; }
        if (c.tipo === "pilar") pilarB2(c); else vigaB2(c);
        return true;
      }
      if (c.tipo === "escada") {
        if (!c.escada || !arr(c.escada.lances).length) { avisos.push("escada " + c.id + " sem lances calculados (parâmetros inválidos) — ficou de fora"); return true; }
        escadaB2(c); return true;
      }
      if (c.tipo === "guarda") {
        if (!c.guarda || !arr(c.guarda.montantes).length) { avisos.push("guarda-corpo " + c.id + " sem caminho válido — ficou de fora"); return true; }
        guardaB2(c); return true;
      }
      if (c.tipo === "rampa") {   /* P9 — GANCHO */
        if (!c.rampa || !arr(c.rampa.lances).length) { avisos.push("rampa " + c.id + " sem segmentos calculados (parâmetros inválidos) — ficou de fora"); return true; }
        rampaB2(c); return true;
      }
      return false;
    }

    /* camadas do tipo de parede → IfcMaterialLayerSet (uma vez por tipo e espessura) */
    var conjCamadas = {}, usos = {};
    function usoCamadas(c) {
      var tp = c.tipoParede, cam = arr(tp && tp.camadas);
      if (!cam.length) return null;
      var soma = cam.reduce(function (s, k) { return s + num(k.e, 0); }, 0);
      if (Math.abs(soma - num(c.espessura, 0)) > 5e-4) {
        avisos.push("parede " + c.id + ": as camadas do tipo \"" + tp.rotulo + "\" somam " + R(soma) + " m e a parede tem " + R(c.espessura) + " m — foi com o material único, sem as camadas");
        return null;
      }
      var kc = String(tp.id) + "|" + R(soma);
      if (!conjCamadas[kc]) {
        var lays = cam.map(function (k) {
          var nm = String(k.rotulo || k.id || "Camada");
          var m = material(nm);
          return w("IFCMATERIALLAYER", [ref(m.m), R(num(k.e, 0)), "$", S(nm), "$", S(k.face === "nucleo" ? "Núcleo" : (k.face === "fora" ? "Face de fora" : "Face de dentro")), "$"]);
        });
        conjCamadas[kc] = w("IFCMATERIALLAYERSET", [L(lays.map(ref)), S(tp.rotulo), "$"]);
      }
      /* a face "fora" é a do lado w < 0 (à esquerda de quem anda de p1 a p2) =
         +Y local do IFC; as camadas vão de fora para dentro = de +Y para −Y.
         Faces invertidas: o contrário. */
      var inv = !!c.inverterFaces, ku = kc + "|" + (inv ? "+" : "-");
      if (!usos[ku]) usos[ku] = { u: w("IFCMATERIALLAYERSETUSAGE", [ref(conjCamadas[kc]), E("AXIS2"), E(inv ? "POSITIVE" : "NEGATIVE"), R(inv ? -soma / 2 : soma / 2), "$"]), elementos: [] };
      return usos[ku];
    }

    function paredeB2(c) {
      if (BC && BC.ehCurva(c)) return paredeCurvaB2(c);   /* CURVA: o perfil com os arcos exatos */
      var f = BA.frameDe(c), yb = f.y0, th = num(c.rotY, 0), dir = [Math.cos(th), Math.sin(th), 0];
      var nv = nivelDaPeca(c, yb), O = W2I([c.cx, yb, c.cz], nv), loc = quadro(O, dir);
      var pl = placement(nv.pl, O, [0, 0, 1], dir);
      /* os prismas REAIS (cantos unidos, topo sob a laje/cobertura) — sem os
         vãos: as portas/janelas furam por IfcOpeningElement, como sempre */
      var r = BA.pecasParede(c, []), partes = [], planos = true;
      r.pecas.forEach(function (pc) {
        var b = [], zt = [];
        pc.pts.forEach(function (q, i) {
          var l = loc(W2I([q[0], pc.y0, q[1]], nv)), u = b[b.length - 1];
          if (u && Math.abs(u[0] - l[0]) < 1e-9 && Math.abs(u[1] - l[1]) < 1e-9) return;
          b.push([l[0], l[1]]); zt.push(pc.ytopo[i] - yb);
        });
        while (b.length > 1 && Math.abs(b[0][0] - b[b.length - 1][0]) < 1e-9 && Math.abs(b[0][1] - b[b.length - 1][1]) < 1e-9) { b.pop(); zt.pop(); }
        if (b.length < 3 || Math.abs(areaS(b)) < 1e-12) return;
        if (areaS(b) < 0) { b.reverse(); zt.reverse(); }
        if (zt.some(function (z) { return Math.abs(z - zt[0]) > 1e-9; })) planos = false;
        partes.push({ b: b, z0: pc.y0 - yb, zt: zt });
      });
      if (!partes.length) { avisos.push("parede " + c.id + " sem volume depois das uniões e do topo — ficou de fora"); return; }
      var uso = usoCamadas(c), nucleo = uso ? arr(c.tipoParede.camadas).filter(function (k) { return k.face === "nucleo"; })[0] : null;
      var matN = nucleo ? String(nucleo.rotulo || "Núcleo") : MAT_EDITOR.parede;
      /* topo plano: extrusão (exata e leve); topo inclinado: Brep (o Revit importa; TriangulatedFaceSet não) */
      var itens = partes.map(function (p) {
        var s = planos ? extrudado(perfilPoli(p.b), pos3([0, 0, p.z0]), p.zt[0] - p.z0) : prismaBrep(p.b, p.z0, p.zt);
        pintar(s, matN); return s;
      }).filter(Boolean);
      var p0 = ponto2([-f.L / 2, 0]), p1 = ponto2([f.L / 2, 0]);
      var eixoRep = w("IFCSHAPEREPRESENTATION", [ref(ctxEixo), S("Axis"), S("Curve2D"), L([ref(w("IFCPOLYLINE", [L([ref(p0), ref(p1)])]))])]);
      var tipoRef = c.tipoParede ? String(c.tipoParede.rotulo) : "Parede " + String(Math.round(c.espessura * 1000) / 10).replace(".", ",") + " cm";
      var ew = peca(c.id, "IFCWALL", "Parede " + c.id, tipoRef, pl, forma(itens, planos ? "SweptSolid" : "Brep", [eixoRep]), [E("NOTDEFINED")], yb, nv);
      if (uso) { uso.elementos.push(ew.ent); ew.material = matN; ew.camadas = arr(c.tipoParede.camadas).map(function (k) { return String(k.rotulo || k.id); }); }
      else ligarMaterial(ew, matN);
      pset(ew, "Pset_WallCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      var vz = vaos[c.id], aV = vz ? vz.areaVaos : 0, vol = num(c.volume, 0), t = num(c.espessura, 0);
      /* P1-D: Length, Height, Width, Gross/NetSideArea, NetVolume e as áreas
         das faces saem do REGISTRO (fecharRegistro); aqui só o que é da
         geometria e não tem parâmetro (o volume bruto dos prismas) */
      qto(ew, "Qto_WallBaseQuantities", [["GrossVolume", "V", vol]]);
      pset(ew, "OrcaPRO_Parede", [["UniaoCantos", "IFCBOOLEAN", c.unir !== false], ["AnexarTopo", "IFCBOOLEAN", !!c.anexarTopo],
                                  ["Juntas", "IFCLABEL", arr(c.juntas).map(function (j) { return j.tipo + " com " + j.com; }).join("; ") || null]]);
      ligarCodigos(ew, arr(c.servicos).map(function (s) { return s.codigo; })); origemPset(ew, [["Modelador", "IFCLABEL", "B2"]]);
      ew.volume = r6(vol - aV * t); ew.volumeBruto = r6(vol);
      paredesIfc[c.id] = { el: ew, pl: pl, c: c, nivel: nv, conflitos: vz ? vz.conflitos : [] };
    }

    /* ================= CURVA — PAREDE CURVA (js/bimcurva.js) =================
     * Cada fatia (entre os cortes das pontas, das quebras do topo) é um
     * IfcExtrudedAreaSolid de IfcArbitraryClosedProfileDef cujo contorno é um
     * IfcIndexedPolyCurve com IfcLineIndex (reta) e IfcArcIndex (arco pelos três
     * pontos: início, meio, fim) — o arco EXATO, não as cordas. O vão da porta
     * é o IfcOpeningElement reto na tangente (bloco das famílias). */
    function perfilCurvo(segs, nome) {
      var pts = [], idx = [];
      function ponto(q) { var u = pts[pts.length - 1]; if (u && Math.abs(u[0] - q[0]) < 1e-12 && Math.abs(u[1] - q[1]) < 1e-12) return pts.length; pts.push(q); return pts.length; }
      /* sentido anti-horário (a área pelas cordas e o meio de cada arco basta para o sinal) */
      var A = 0; segs.forEach(function (sg) {
        var a = sg.a, b = sg.m || sg.b; A += (a[0] * b[1] - b[0] * a[1]) / 2;
        if (sg.m) A += (sg.m[0] * sg.b[1] - sg.b[0] * sg.m[1]) / 2;
      });
      if (A < 0) segs = segs.slice().reverse().map(function (sg) { return { a: sg.b, b: sg.a, m: sg.m }; });
      segs.forEach(function (sg, k) {
        var i0 = k === 0 ? ponto(sg.a) : pts.length, ult = k === segs.length - 1;
        if (sg.m) { var im = ponto(sg.m), ib = ult ? 1 : ponto(sg.b); idx.push("IFCARCINDEX(" + L([i0, im, ib]) + ")"); }
        else { var ib2 = ult ? 1 : ponto(sg.b); idx.push("IFCLINEINDEX(" + L([i0, ib2]) + ")"); }
      });
      var lista = w("IFCCARTESIANPOINTLIST2D", [L(pts.map(function (q) { return P2(q); }))]);
      var curva = w("IFCINDEXEDPOLYCURVE", [ref(lista), L(idx), ".F."]);
      return w("IFCARBITRARYCLOSEDPROFILEDEF", [E("AREA"), nome ? S(nome) : "$", ref(curva)]);
    }
    function paredeCurvaB2(c) {
      var f = BA.frameDe(c), yb = f.y0, th = num(c.rotY, 0), dir = [Math.cos(th), Math.sin(th), 0];
      var nv = nivelDaPeca(c, yb), O = W2I([c.cx, yb, c.cz], nv), loc = quadro(O, dir);
      var pl = placement(nv.pl, O, [0, 0, 1], dir);
      function L2(q) { var l = loc(W2I([q.x, yb, q.z], nv)); return [l[0], l[1]]; }
      var r = BC.pecas(c, []), itens = [], planos = true;
      var uso = usoCamadas(c), nucleo = uso ? arr(c.tipoParede.camadas).filter(function (k) { return k.face === "nucleo"; })[0] : null;
      var matN = nucleo ? String(nucleo.rotulo || "Núcleo") : MAT_EDITOR.parede;
      r.pecas.forEach(function (pc) {
        var zt = pc.ytopo, z0 = pc.y0 - yb, plano = zt.every(function (z) { return Math.abs(z - zt[0]) < 1e-9; }), sol;
        if (plano) {
          var sg2 = pc.segs.map(function (sg) { var o = { a: L2(sg.a), b: L2(sg.b) }; if (sg.tipo === "arco") o.m = L2(sg.m); return o; });
          sol = extrudado(perfilCurvo(sg2), pos3([0, 0, z0]), zt[0] - pc.y0);
        } else {
          /* parede reta com ponta em arco sob telhado inclinado: as cordas (tolerância de 2 mm) */
          planos = false;
          var b = pc.pts.map(function (q) { return L2({ x: q[0], z: q[1] }); }), ztl = zt.map(function (z) { return z - yb; });
          if (areaS(b) < 0) { b.reverse(); ztl.reverse(); }
          sol = prismaBrep(b, z0, ztl);
        }
        if (sol) { pintar(sol, matN); itens.push(sol); }
      });
      if (!itens.length) { avisos.push("parede " + c.id + " sem volume depois das uniões e do topo — ficou de fora"); return; }
      /* o EIXO: o arco do meio da espessura (ou a reta, na parede reta com ponta em arco) */
      var W = BC.modelo(c), eixoRep;
      if (W.arco) {
        var qm = W.pt(0, 0), la = L2({ x: W.E[0][0], z: W.E[0][1] }), lm = L2({ x: qm[0], z: qm[1] }), lb = L2({ x: W.E[1][0], z: W.E[1][1] });
        var lst = w("IFCCARTESIANPOINTLIST2D", [L([P2(la), P2(lm), P2(lb)])]);
        eixoRep = w("IFCSHAPEREPRESENTATION", [ref(ctxEixo), S("Axis"), S("Curve2D"), L([ref(w("IFCINDEXEDPOLYCURVE", [ref(lst), L(["IFCARCINDEX((1,2,3))"]), ".F."]))])]);
      } else {
        eixoRep = w("IFCSHAPEREPRESENTATION", [ref(ctxEixo), S("Axis"), S("Curve2D"), L([ref(w("IFCPOLYLINE", [L([ref(ponto2([-f.L / 2, 0])), ref(ponto2([f.L / 2, 0]))])]))])]);
      }
      var tipoRef = c.tipoParede ? String(c.tipoParede.rotulo) : "Parede " + String(Math.round(c.espessura * 1000) / 10).replace(".", ",") + " cm";
      var ew = peca(c.id, "IFCWALL", "Parede " + c.id, tipoRef, pl, forma(itens, planos ? "SweptSolid" : "Brep", [eixoRep]), [E("NOTDEFINED")], yb, nv);
      if (uso) { uso.elementos.push(ew.ent); ew.material = matN; ew.camadas = arr(c.tipoParede.camadas).map(function (k) { return String(k.rotulo || k.id); }); }
      else ligarMaterial(ew, matN);
      pset(ew, "Pset_WallCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      var vz = vaos[c.id], aV = vz ? vz.areaVaos : 0, vol = num(c._exato && isFinite(c._exato.volume) ? c._exato.volume : c.volume, 0), t = num(c.espessura, 0);
      qto(ew, "Qto_WallBaseQuantities", [["GrossVolume", "V", vol]]);
      pset(ew, "OrcaPRO_Parede", [["UniaoCantos", "IFCBOOLEAN", c.unir !== false], ["AnexarTopo", "IFCBOOLEAN", !!c.anexarTopo],
                                  ["Juntas", "IFCLABEL", arr(c.juntas).map(function (j) { return j.tipo + " com " + j.com; }).join("; ") || null],
                                  ["Curva", "IFCBOOLEAN", !!c.arco], ["Raio", "IFCPOSITIVELENGTHMEASURE", W.arco ? W.R : null]]);
      ligarCodigos(ew, arr(c.servicos).map(function (s2) { return s2.codigo; })); origemPset(ew, [["Modelador", "IFCLABEL", "B2"]]);
      ew.volume = r6(vol - aV * t); ew.volumeBruto = r6(vol);
      paredesIfc[c.id] = { el: ew, pl: pl, c: c, nivel: nv, conflitos: vz ? vz.conflitos : [], loc: loc, W: W };
      /* (avisos do topo: superfície inclinada sobre a curva) */
      arr(c._avisosCurva).forEach(function (a) { avisos.push("parede " + c.id + ": " + a); });
    }

    /* CURVA: a viga curva (seção retangular) = o anel extrudado do fundo ao topo, com os arcos exatos */
    function vigaCurvaB2(c) {
      var vp = BC.vigaPlanta(c); if (!vp) { avisos.push("viga " + c.id + ": o arco não serve — ficou de fora"); return; }
      var nv = nivelDaPeca(c, vp.y1), pl = placement(nv.pl, [0, 0, vp.y0 - nv.elevacao]);
      var sol = extrudado(perfilCurvo(vp.segs.map(function (sg) { var o = { a: [sg.a.x, -sg.a.z], b: [sg.b.x, -sg.b.z] }; if (sg.tipo === "arco") o.m = [sg.m.x, -sg.m.z]; return o; })), pos3([0, 0, 0]), vp.y1 - vp.y0);
      var matN = matPerfil(c); pintar(sol, matN);
      var tipoRef = "Viga " + (c.perfilRotulo || c.perfil.forma) + " curva";
      var ev = peca(c.id, "IFCBEAM", "Viga " + c.id, tipoRef, pl, forma([sol], "SweptSolid"), [E("BEAM")], vp.y1, nv);
      ligarMaterial(ev, matN);
      pset(ev, "Pset_BeamCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      qtoPerfil(ev, c, "Qto_BeamBaseQuantities", num(c.comprimentoViga, 0));
      ligarCodigos(ev, arr(c.servicos).map(function (s) { return s.codigo; })); origemPset(ev, [["Modelador", "IFCLABEL", "B2"]]);
      ev.volume = r6(c.volume);
    }
    function lajeB2(c) {
      var yb = c.cy - c.altura / 2, yt = c.cy + c.altura / 2, nv = nivelDaPeca(c, yt);
      var pl = placement(nv.pl, [0, 0, yb - nv.elevacao]);
      var C = semRepetido(c.contorno.map(function (p) { return [p.x, -p.z]; }));
      var F = arr(c.furos).map(function (fu) { return semRepetido(arr(fu && fu.pts).map(function (p) { return [p.x, -p.z]; })); });
      var tipoRef = c.tipoLaje && c.tipoLaje.rotulo ? String(c.tipoLaje.rotulo) : "Laje " + String(Math.round(c.altura * 1000) / 10).replace(".", ",") + " cm";
      /* CURVA: aresta em arco — o perfil com IfcArcIndex (com furo, o contorno vai pelas cordas de 2 mm) */
      var perfC = null;
      if (BC && BC.temArco(c.contorno)) {
        if (F.length) C = BC.pontosContorno(c.contorno).map(function (q) { return [q[0], -q[1]]; });
        else perfC = perfilCurvo(BC.segsContorno(c.contorno).map(function (sg) { var o = { a: [sg.a.x, -sg.a.z], b: [sg.b.x, -sg.b.z] }; if (sg.tipo === "arco") o.m = [sg.m.x, -sg.m.z]; return o; }), tipoRef);
      }
      var sol = extrudado(perfC || perfilPoli(C, F, tipoRef), pos3([0, 0, 0]), c.altura);
      pintar(sol, MAT_EDITOR.laje);
      var el = peca(c.id, "IFCSLAB", "Laje " + c.id, tipoRef, pl, forma([sol], "SweptSolid"), [E("FLOOR")], yb, nv);
      ligarMaterial(el, MAT_EDITOR.laje);
      pset(el, "Pset_SlabCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      var bruta = num(c.area, 0) + num(c.areaFuros, 0);
      /* P1-D: Width, Perimeter, NetArea, NetVolume e a área dos furos: do registro */
      qto(el, "Qto_SlabBaseQuantities", [["GrossArea", "A", bruta], ["GrossVolume", "V", bruta * c.altura]]);
      pset(el, "OrcaPRO_Laje", [["Furos", "IFCINTEGER", F.length]]);
      ligarCodigos(el, arr(c.servicos).map(function (s) { return s.codigo; })); origemPset(el, [["Modelador", "IFCLABEL", "B2"]]);
      el.volume = r6(c.volume);
    }

    /* o perfil paramétrico IFC4 de cada família geométrica do BimArq.secao
       (centro da caixa da seção na origem, como lá). null = sem correspondente. */
    var CAMPOS_PERFIL = { ret: ["b", "h"], circ: ["d"], I: ["d", "bf", "tw", "tf"], U: ["d", "bf", "tw", "tf"], L: ["a", "b", "t"], "tubo-ret": ["b", "h", "t"], "tubo-circ": ["D", "t"] };
    function perfilSuportado(p) {
      var cs = p && CAMPOS_PERFIL[p.forma];
      return !!cs && cs.every(function (k) { return num(p[k], NaN) > 0; });
    }
    function perfilIfc(p, nome) {
      var f = p && p.forma, g = function (k) { return num(p[k], NaN); }, nm = nome ? S(nome) : "$", ps = ref(eixo2d);
      function ok() { for (var i = 0; i < arguments.length; i++) if (!(arguments[i] > 0)) return false; return true; }
      if (f === "ret" && ok(g("b"), g("h"))) return w("IFCRECTANGLEPROFILEDEF", [E("AREA"), nm, ps, R(g("b")), R(g("h"))]);
      if (f === "circ" && ok(g("d"))) return w("IFCCIRCLEPROFILEDEF", [E("AREA"), nm, ps, R(g("d") / 2)]);
      /* raio de concordância do perfil de catálogo (js/perfisaco.js): o FilletRadius do IFC4 — sem ele, "$" como sempre */
      var raio = function (k) { var v = num(p[k], 0); return v > 0 ? R(v) : "$"; };
      if (f === "I" && ok(g("d"), g("bf"), g("tw"), g("tf"))) return w("IFCISHAPEPROFILEDEF", [E("AREA"), nm, ps, R(g("bf")), R(g("d")), R(g("tw")), R(g("tf")), raio("r"), "$", "$"]);
      if (f === "U" && ok(g("d"), g("bf"), g("tw"), g("tf"))) return w("IFCUSHAPEPROFILEDEF", [E("AREA"), nm, ps, R(g("d")), R(g("bf")), R(g("tw")), R(g("tf")), raio("r"), "$", "$"]);
      if (f === "L" && ok(g("a"), g("b"), g("t"))) return w("IFCLSHAPEPROFILEDEF", [E("AREA"), nm, ps, R(g("a")), R(g("b")), R(g("t")), raio("r"), "$", "$"]);
      if (f === "tubo-ret" && ok(g("b"), g("h"), g("t"))) return w("IFCRECTANGLEHOLLOWPROFILEDEF", [E("AREA"), nm, ps, R(g("b")), R(g("h")), R(g("t")), raio("ri"), raio("ro")]);
      if (f === "tubo-circ" && ok(g("D"), g("t"))) return w("IFCCIRCLEHOLLOWPROFILEDEF", [E("AREA"), nm, ps, R(g("D") / 2), R(g("t"))]);
      return null;
    }
    function matPerfil(c) {
      var M = BA && BA.MATERIAIS && BA.MATERIAIS[c.material];
      return M ? M.rotulo : ({ aco: "Aço", madeira: "Madeira serrada" }[c.material] || "Concreto armado");
    }
    function qtoPerfil(el, c, nomeQ, Lp) {
      /* P1-D: Length, NetVolume e NetWeight (o peso exato) saem do registro;
         CrossSectionArea e OuterSurfaceArea ficam aqui como a medida da
         geometria e o registro as substitui quando tem (perfil de catálogo,
         área de pintura do aço) */
      qto(el, nomeQ, [["CrossSectionArea", "A", c.secaoArea], ["OuterSurfaceArea", "A", num(c.perimetroSecao, NaN) * Lp], ["GrossVolume", "V", c.volume]]);
      pset(el, "OrcaPRO_Perfil", [["Forma", "IFCLABEL", c.perfil.forma], ["Perfil", "IFCLABEL", c.perfilRotulo], ["Material", "IFCLABEL", c.material], ["Massa", "IFCMASSMEASURE", c.massa],
                                  ["AreaForma", "IFCAREAMEASURE", c.areaForma]]);
    }
    /* PILAR: a tela leva a seção (a, b) para (eixo u, espessura w) — um par
       que, com a altura para CIMA, é espelhado. O sólido nasce no TOPO e desce
       (eixo −Z local): aí o perfil cai no mesmo lado da tela, sem espelho
       (a cantoneira L e o U não são simétricos — o teste confere o centroide). */
    function pilarB2(c) {
      var H = num(c.altura, 0), yb = c.cy - H / 2, th = num(c.rotY, 0), dir = [Math.cos(th), Math.sin(th), 0];
      var nv = nivelDaPeca(c, yb), O = W2I([c.cx, yb, c.cz], nv);
      var pl = placement(nv.pl, O, [0, 0, 1], dir);
      /* P9 — GANCHO: pilar inclinado — o eixo do sólido vai da base ao topo deslocado (js/bimestrut.js) */
      var E9 = dep("BimEstrut", "./bimestrut.js");
      if (E9 && E9.inclinado(c) && BA) { var gp = E9.geomPilar(c, BA.secao(c.perfil)); H = gp.Lax; pl = placement(nv.pl, W2I(gp.B, nv), cena2ifc(gp.T), cena2ifc(gp.U)); }
      var sol = extrudado(perfilIfc(c.perfil, c.perfilRotulo), pos3([0, 0, H], [0, 0, -1], [1, 0, 0]), H);
      var matN = matPerfil(c); pintar(sol, matN);
      var tipoRef = "Pilar " + (c.perfilRotulo || c.perfil.forma);
      var ep = peca(c.id, "IFCCOLUMN", "Pilar " + c.id, tipoRef, pl, forma([sol], "SweptSolid"), [E("COLUMN")], yb, nv);
      ligarMaterial(ep, matN);
      pset(ep, "Pset_ColumnCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      qtoPerfil(ep, c, "Qto_ColumnBaseQuantities", num(c.comprimentoPilar, H));
      ligarCodigos(ep, arr(c.servicos).map(function (s) { return s.codigo; })); origemPset(ep, [["Modelador", "IFCLABEL", "B2"]]);
      ep.volume = r6(c.volume);
    }
    /* VIGA: a tela leva (a, b) para (espessura w, altura) ao longo do eixo u —
       com u para a frente, espelhado. O sólido nasce na PONTA e volta (−u). */
    function vigaB2(c) {
      if (c.arco && BC) return vigaCurvaB2(c);   /* CURVA */
      /* comprimento de CORTE: a viga para na face do pilar (recuos do BimArq.derivar) */
      var rI = num(c.recuoIni, 0), rF = num(c.recuoFim, 0), Lv = num(c.comprimento, 0) - rI - rF, yt = c.cy + c.altura / 2, th = num(c.rotY, 0), dir = [Math.cos(th), Math.sin(th), 0];
      var nv = nivelDaPeca(c, yt), ini = sub(W2I([c.cx, c.cy, c.cz], nv), mul(dir, num(c.comprimento, 0) / 2 - rI));
      var pl = placement(nv.pl, ini, [0, 0, 1], dir);
      /* P9 — GANCHO: justificação, deslocamentos, extensões e inclinação (js/bimestrut.js): o sólido
         nasce na ponta do trecho, com X no eixo inclinado e Z na normal da seção */
      var E9 = dep("BimEstrut", "./bimestrut.js");
      if (E9 && E9.temViga(c) && BA) {
        var gv = E9.geomViga(c, BA.secao(c.perfil)), S0 = [gv.C[0] + gv.T[0] * gv.s0, gv.C[1] + gv.T[1] * gv.s0, gv.C[2] + gv.T[2] * gv.s0];
        Lv = gv.s1 - gv.s0; pl = placement(nv.pl, W2I(S0, nv), cena2ifc(gv.N), cena2ifc(gv.T));
      }
      /* local Y do IFC = −w da cena: o perfil x vai para +w = (0, −1, 0) local */
      var sol = extrudado(perfilIfc(c.perfil, c.perfilRotulo), pos3([Lv, 0, 0], [-1, 0, 0], [0, -1, 0]), Lv);
      var matN = matPerfil(c); pintar(sol, matN);
      var tipoRef = "Viga " + (c.perfilRotulo || c.perfil.forma);
      var ev = peca(c.id, "IFCBEAM", "Viga " + c.id, tipoRef, pl, forma([sol], "SweptSolid"), [E("BEAM")], yt, nv);
      ligarMaterial(ev, matN);
      pset(ev, "Pset_BeamCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      qtoPerfil(ev, c, "Qto_BeamBaseQuantities", num(c.comprimentoViga, Lv));
      ligarCodigos(ev, arr(c.servicos).map(function (s) { return s.codigo; })); origemPset(ev, [["Modelador", "IFCLABEL", "B2"]]);
      ev.volume = r6(c.volume);
    }

    /* ESCADA: IfcStair (o todo, no nível) agregando um IfcStairFlight por lance
       e o patamar como IfcSlab LANDING — o que o IFC4 pede para escada com
       patamar. Cada lance = o perfil lateral (degraus + laje inclinada)
       extrudado na largura, exatamente como o js/bim.js desenha. */
    function escadaB2(c) {
      var es = c.escada, par = es.par || {}, calc = es.calc || {}, md = c.medidas || {};
      var nv = nivelDaPeca(c, num(par.base, c.cy - c.altura / 2)), plE = placement(nv.pl, [0, 0, 0]);
      var L2 = par.forma === "L", U2 = par.forma === "U", tipoRef = "Escada " + (L2 ? "em L" : (U2 ? "em U" : "reta")) + " " + md.espelhos + " espelhos";   /* P9: U */
      /* a estrutura IFC4 usual da escada: o IfcStair no
         nível, SEM corpo próprio, agregando por IfcRelAggregates um
         IfcStairFlight por lance e o IfcSlab LANDING do patamar; cada parte com
         ObjectPlacement RELATIVO ao do IfcStair e fora da contenção do nível
         (quem está no nível é o todo). O guarda-corpo vai à parte (IfcRailing
         no nível), mesmo quando hospedado na escada. */
      var est = peca(c.id, "IFCSTAIR", "Escada " + c.id, tipoRef, plE, null, [E(L2 ? "QUARTER_TURN_STAIR" : (U2 ? "HALF_TURN_STAIR" : "STRAIGHT_RUN_STAIR"))], 0, nv, { mapa: "escada" });
      var partes = [], volTot = 0, matE = MAT_EDITOR.escada;
      es.lances.forEach(function (l, i) {
        var du = [Math.cos(l.ang), 0, Math.sin(l.ang)], dw = [-Math.sin(l.ang), 0, Math.cos(l.ang)], W = num(l.largura, 0);
        var org = W2I([l.x - W / 2 * dw[0], l.y, l.z - W / 2 * dw[2]], nv);
        var pts = poligonoSimples(arr(l.perfil).map(function (q) { return [q.u, q.y]; }));
        var A = Math.abs(areaS(pts));
        /* perfil no plano (u, y): x = u, y = cima; extrusão na largura (+w) */
        var sol = extrudado(perfilPoli(pts, null, null, "escada " + c.id + ", lance " + (i + 1)), pos3(org, cena2ifc(dw), cena2ifc(du)), W);
        pintar(sol, matE);
        var k = Math.round(num(l.k, 0)), chave = c.id + ":lance" + (i + 1);
        var fl = peca(chave, "IFCSTAIRFLIGHT", "Lance " + (i + 1) + " da escada " + c.id, k + " espelhos", placement(plE, [0, 0, 0]), forma([sol], "SweptSolid"),
          [String(k), String(Math.max(0, k - 1)), R(calc.e), R(calc.p), E("STRAIGHT")], 0, nv, { parte: c.id, mapa: "lance" });
        ligarMaterial(fl, matE);
        /* P1-D: Pset_StairFlightCommon e o NetVolume do lance saem do registro */
        qto(fl, "Qto_StairFlightBaseQuantities", [["Length", "L", Math.max(0, k - 1) * num(calc.p, 0)], ["GrossVolume", "V", A * W]]);
        origemPset(fl, [["Escada", "IFCIDENTIFIER", c.id]]);
        fl.volume = r6(A * W); volTot += A * W; partes.push(fl.ent);
      });
      if (es.patamar) {
        var pp = es.patamar, C = semRepetido(arr(pp.pts).map(function (p) { return [p.x, -p.z]; })), t = num(pp.y1, 0) - num(pp.y0, 0);
        var sol2 = extrudado(perfilPoli(C, null, null, "escada " + c.id + ", patamar"), pos3([0, 0, num(pp.y0, 0) - nv.elevacao]), t);
        pintar(sol2, matE);
        var lp = peca(c.id + ":patamar", "IFCSLAB", "Patamar da escada " + c.id, "Patamar", placement(plE, [0, 0, 0]), forma([sol2], "SweptSolid"), [E("LANDING")], 0, nv, { parte: c.id, mapa: "patamar" });
        ligarMaterial(lp, matE);
        var aP = Math.abs(areaS(C));
        /* P1-D: Width, NetArea e NetVolume do patamar saem do registro */
        origemPset(lp, [["Escada", "IFCIDENTIFIER", c.id]]);
        lp.volume = r6(aP * t); volTot += aP * t; partes.push(lp.ent);
      }
      w("IFCRELAGGREGATES", [G("rel:escada:" + c.id), OH, "$", "$", ref(est.ent), L(partes.map(ref))]);
      ligarMaterial(est, matE);
      /* P1-D: espelhos, pisos, espelho, piso, volume e áreas saem do registro */
      pset(est, "Pset_StairCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      pset(est, "OrcaPRO_Escada", [["Forma", "IFCLABEL", L2 ? "L" : (U2 ? "U" : "reta")], ["Blondel", "IFCLENGTHMEASURE", calc.blondel], ["RegraCalculo", "IFCLABEL", calc.regra === "blondel" ? "Blondel RA" : "Regras do tipo"]]);
      ligarCodigos(est, arr(c.servicos).map(function (s) { return s.codigo; })); origemPset(est, [["Modelador", "IFCLABEL", "B2"]]);
      est.volume = r6(volTot); est.partes = partes.length; est.semGeometriaPropria = true;
    }

    /* P9 — RAMPA: IfcRamp (o todo, no nível, sem corpo) agregando um
       IfcRampFlight por segmento (o perfil lateral — a laje inclinada —
       extrudado na largura, como o js/bim.js desenha) e cada patamar como
       IfcSlab LANDING. A mesma estrutura da escada (lances e patamares
       vão como partes). */
    function rampaB2(c) {
      var rp = c.rampa, par = rp.par || {}, calc = rp.calc || {};
      var nv = nivelDaPeca(c, num(par.base, c.cy - c.altura / 2)), plR = placement(nv.pl, [0, 0, 0]), U2 = par.forma === "U";
      var tipoRef = "Rampa " + String(num(calc.inclinacao, 0)).replace(".", ",") + " % " + (U2 ? "em U" : "reta");
      var ram = peca(c.id, "IFCRAMP", "Rampa " + c.id, tipoRef, plR, null, [E(U2 ? "HALF_TURN_RAMP" : (rp.lances.length === 2 ? "TWO_STRAIGHT_RUN_RAMP" : "STRAIGHT_RUN_RAMP"))], 0, nv, { mapa: "rampa" });
      var partes = [], volTot = 0, matR = "Concreto armado";
      rp.lances.forEach(function (l, i) {
        var du = [Math.cos(l.ang), 0, Math.sin(l.ang)], dw = [-Math.sin(l.ang), 0, Math.cos(l.ang)], W = num(l.largura, 0);
        var org = W2I([l.x - W / 2 * dw[0], l.y, l.z - W / 2 * dw[2]], nv);
        var pts = poligonoSimples(arr(l.perfil).map(function (q) { return [q.u, q.y]; })), A = Math.abs(areaS(pts));
        var sol = extrudado(perfilPoli(pts, null, null, "rampa " + c.id + ", segmento " + (i + 1)), pos3(org, cena2ifc(dw), cena2ifc(du)), W);
        pintar(sol, matR);
        var fl = peca(c.id + ":seg" + (i + 1), "IFCRAMPFLIGHT", "Segmento " + (i + 1) + " da rampa " + c.id, "Segmento " + (i + 1), placement(plR, [0, 0, 0]), forma([sol], "SweptSolid"), [E("STRAIGHT")], 0, nv, { parte: c.id, mapa: "lanceRampa" });
        ligarMaterial(fl, matR);
        qto(fl, "Qto_RampFlightBaseQuantities", [["Length", "L", num(calc.comprimentoSegmento, 0)], ["Width", "L", W], ["GrossVolume", "V", A * W], ["NetVolume", "V", A * W]]);
        origemPset(fl, [["Rampa", "IFCIDENTIFIER", c.id]]);
        fl.volume = r6(A * W); volTot += A * W; partes.push(fl.ent);
      });
      arr(rp.patamares).forEach(function (pp, i) {
        var C = semRepetido(arr(pp.pts).map(function (p) { return [p.x, -p.z]; })), t = num(pp.y1, 0) - num(pp.y0, 0);
        var sol2 = extrudado(perfilPoli(C, null, null, "rampa " + c.id + ", patamar " + (i + 1)), pos3([0, 0, num(pp.y0, 0) - nv.elevacao]), t);
        pintar(sol2, matR);
        var lp = peca(c.id + ":patamar" + (i + 1), "IFCSLAB", "Patamar " + (i + 1) + " da rampa " + c.id, "Patamar", placement(plR, [0, 0, 0]), forma([sol2], "SweptSolid"), [E("LANDING")], 0, nv, { parte: c.id, mapa: "patamarRampa" });
        ligarMaterial(lp, matR);
        var aP = Math.abs(areaS(C));
        qto(lp, "Qto_SlabBaseQuantities", [["Width", "L", t], ["NetArea", "A", aP], ["NetVolume", "V", aP * t]]);
        origemPset(lp, [["Rampa", "IFCIDENTIFIER", c.id]]);
        lp.volume = r6(aP * t); volTot += aP * t; partes.push(lp.ent);
      });
      w("IFCRELAGGREGATES", [G("rel:rampa:" + c.id), OH, "$", "$", ref(ram.ent), L(partes.map(ref))]);
      ligarMaterial(ram, matR);
      pset(ram, "Pset_RampCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      pset(ram, "OrcaPRO_Rampa", [["Forma", "IFCLABEL", U2 ? "U" : "reta"], ["Inclinacao", "IFCPOSITIVERATIOMEASURE", num(calc.inclinacao, 0) / 100], ["DesnivelPorSegmento", "IFCLENGTHMEASURE", calc.h], ["Norma", "IFCLABEL", "NBR 9050:2020 (limites a conferir)"]]);
      ligarCodigos(ram, arr(c.servicos).map(function (s) { return s.codigo; })); origemPset(ram, [["Modelador", "IFCLABEL", "P9"]]);
      ram.volume = r6(volTot); ram.partes = partes.length; ram.semGeometriaPropria = true;
    }

    /* GUARDA-CORPO: IfcRailing com os montantes (barra quadrada em pé) e o
       corrimão (barra quadrada de ponta a ponta, girada como a BoxGeometry da tela) */
    function guardaB2(c) {
      var g = c.guarda, par = g.par || {}, alt = num(par.altura, 1.1), sm = num(par.secMontante, 0.04), sc = num(par.secCorrimao, 0.05), md = c.medidas || {};
      var y0 = Math.min.apply(null, arr(g.pts).map(function (p) { return num(p.y, 0); }).concat([c.cy - c.altura / 2]));
      var nv = nivelDaPeca(c, y0), pl = placement(nv.pl, [0, 0, 0]), itens = [], vol = 0, matG = MAT_EDITOR.guarda;
      g.montantes.forEach(function (q) {
        var s = extrudado(retangulo(sm, sm), pos3(W2I([q.x, q.y, q.z], nv)), alt);
        pintar(s, matG); itens.push(s); vol += sm * sm * alt;
      });
      arr(g.corrimao).concat(arr(g.corrimaos)).forEach(function (sg) {   /* P9: + os corrimãos 1 e 2 */
        var a = [sg.a.x, sg.a.y, sg.a.z], b = [sg.b.x, sg.b.y, sg.b.z], Ls = len(sub(b, a));
        if (!(Ls > 1e-6)) return;
        var d = norm(sub(b, a)), yr = giroDeAte([1, 0, 0], d, [0, 1, 0]);
        var s = extrudado(retangulo(sc, sc), pos3(W2I(a, nv), cena2ifc(d), cena2ifc(yr)), Ls);
        pintar(s, matG); itens.push(s); vol += sc * sc * Ls;
      });
      var tipoRef = "Guarda-corpo h = " + String(Math.round(alt * 100)) + " cm";
      var er = peca(c.id, "IFCRAILING", "Guarda-corpo " + c.id, tipoRef, pl, forma(itens, "SweptSolid"), [E("GUARDRAIL")], y0, nv, { mapa: "guarda" });
      ligarMaterial(er, matG);
      /* P1-D: comprimento, montantes e área saem do registro; a altura é de TIPO
         (vai no IfcRailingType) e continua na ocorrência, com o valor do registro */
      pset(er, "Pset_RailingCommon", [["Reference", "IFCIDENTIFIER", tipoRef], ["Height", "IFCPOSITIVELENGTHMEASURE", alt]]);
      pset(er, "OrcaPRO_GuardaCorpo", [["SecaoMontante", "IFCPOSITIVELENGTHMEASURE", sm], ["SecaoCorrimao", "IFCPOSITIVELENGTHMEASURE", sc]]);
      ligarCodigos(er, arr(c.servicos).map(function (s) { return s.codigo; })); origemPset(er, [["Modelador", "IFCLABEL", "B2"]]);
      er.volumeGeometria = r6(vol);   /* o app não mede volume de guarda-corpo (orça por metro): este é só o das barras */
    }

    /* ================= PAREDE, LAJE, PILAR, VIGA (caixas) ================= */
    arr(st.caixas).forEach(comMat(function (c) {   /* MATERIAIS: a peça com material do projeto */
      /* B2 — as peças do modelador vão pela geometria DELAS (a mesma do js/bim.js) */
      if (c.b2 || c.contorno || c.perfil || c.tipo === "escada" || c.tipo === "guarda") { if (b2Peca(c)) return; }
      /* o nível da peça: parede e pilar pelo PÉ; laje e viga pelo
         TOPO (a laje do 2º piso tem o topo no nível dele e pendura para baixo) */
      var yb = c.cy - c.altura / 2, yt = c.cy + c.altura / 2, nv = nivelDe(c.tipo === "laje" || c.tipo === "viga" ? yt : yb), th = num(c.rotY, 0), dir = [Math.cos(th), Math.sin(th), 0];
      var base = cena2ifc([c.cx, yb, c.cz]); base[2] -= nv.elevacao;
      var nome = (NOME_EDITOR[c.tipo] || "Elemento") + " " + c.id, ent, rep, pl, extra, tipoRef;
      var servCods = arr(c.servicos).map(function (s) { return s.codigo; });
      if (c.tipo === "viga") {
        /* viga: extrudada AO LONGO do eixo (convenção IFC), do início ao fim */
        var ini = add(base, mul(dir, -c.comprimento / 2)); ini[2] += c.altura / 2;
        pl = placement(nv.pl, ini, [0, 0, 1], dir);
        var posV = w("IFCAXIS2PLACEMENT3D", [ref(origem3), ref(D([1, 0, 0])), ref(D([0, 1, 0]))]);
        var sol = extrudado(retangulo(c.espessura, c.altura), posV, c.comprimento);
        pintar(sol, MAT_EDITOR.viga); rep = forma([sol], "SweptSolid");
        tipoRef = "Viga " + Math.round(c.espessura * 100) + " × " + Math.round(c.altura * 100);
        var ev = peca(c.id, "IFCBEAM", nome, tipoRef, pl, rep, [E("BEAM")], yb, nv);
        ligarMaterial(ev, MAT_EDITOR.viga);
        pset(ev, "Pset_BeamCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
        var Lv = num(c.comprimentoViga, c.comprimento);
        /* P1-D: Length e NetVolume saem do registro */
        qto(ev, "Qto_BeamBaseQuantities", [["CrossSectionArea", "A", c.espessura * c.altura], ["OuterSurfaceArea", "A", 2 * (c.espessura + c.altura) * Lv], ["GrossVolume", "V", c.volume]]);
        ligarCodigos(ev, servCods); origemPset(ev);
        ev.volume = r6(c.volume);
        return;
      }
      pl = placement(nv.pl, base, [0, 0, 1], dir);
      var solido = extrudado(retangulo(c.comprimento, c.espessura), w("IFCAXIS2PLACEMENT3D", [ref(origem3), "$", "$"]), c.altura);
      var matN = MAT_EDITOR[c.tipo] || "Concreto"; pintar(solido, matN);
      if (c.tipo === "parede") {
        var p0 = w("IFCCARTESIANPOINT", [P2([-c.comprimento / 2, 0])]), p1 = w("IFCCARTESIANPOINT", [P2([c.comprimento / 2, 0])]);
        var eixoRep = w("IFCSHAPEREPRESENTATION", [ref(ctxEixo), S("Axis"), S("Curve2D"), L([ref(w("IFCPOLYLINE", [L([ref(p0), ref(p1)])]))])]);
        rep = forma([solido], "SweptSolid", [eixoRep]);
        tipoRef = "Parede " + String(Math.round(c.espessura * 1000) / 10).replace(".", ",") + " cm";
        var ew = peca(c.id, "IFCWALL", nome, tipoRef, pl, rep, [E("NOTDEFINED")], yb, nv);
        ligarMaterial(ew, matN);
        pset(ew, "Pset_WallCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
        var vz = vaos[c.id], aV = vz ? vz.areaVaos : 0, bruta = c.comprimento * c.altura;
        /* P1-D: Length, Height, Width, Gross/NetSideArea e NetVolume saem do registro */
        qto(ew, "Qto_WallBaseQuantities", [["GrossVolume", "V", bruta * c.espessura]]);
        ligarCodigos(ew, servCods); origemPset(ew);
        ew.volume = r6((bruta - aV) * c.espessura); ew.volumeBruto = r6(bruta * c.espessura);
        paredesIfc[c.id] = { el: ew, pl: pl, c: c, nivel: nv, conflitos: vz ? vz.conflitos : [] };
        return;
      }
      rep = forma([solido], "SweptSolid");
      if (c.tipo === "pilar") {
        tipoRef = "Pilar " + Math.round(c.comprimento * 100) + " × " + Math.round(c.espessura * 100);
        var ep = peca(c.id, "IFCCOLUMN", nome, tipoRef, pl, rep, [E("COLUMN")], yb, nv);
        ligarMaterial(ep, matN);
        pset(ep, "Pset_ColumnCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
        var Lp = num(c.comprimentoPilar, c.altura);
        /* P1-D: Length e NetVolume saem do registro */
        qto(ep, "Qto_ColumnBaseQuantities", [["CrossSectionArea", "A", c.comprimento * c.espessura], ["OuterSurfaceArea", "A", 2 * (c.comprimento + c.espessura) * Lp], ["GrossVolume", "V", c.volume]]);
        ligarCodigos(ep, servCods); origemPset(ep);
        ep.volume = r6(c.volume);
      } else if (c.tipo === "laje") {
        tipoRef = "Laje " + String(Math.round(c.altura * 1000) / 10).replace(".", ",") + " cm";
        var el2 = peca(c.id, "IFCSLAB", nome, tipoRef, pl, rep, [E("FLOOR")], yb, nv);
        ligarMaterial(el2, matN);
        pset(el2, "Pset_SlabCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
        /* P1-D: Width, Perimeter, NetArea e NetVolume saem do registro */
        qto(el2, "Qto_SlabBaseQuantities", [["GrossArea", "A", c.area], ["GrossVolume", "V", c.volume]]);
        ligarCodigos(el2, servCods); origemPset(el2);
        el2.volume = r6(c.volume);
      } else {
        /* tipo sem entidade própria: vai como caixa genérica — e diz (nunca some calado) */
        avisos.push("peça " + c.id + " (" + (c.tipo || "sem tipo") + ") não tem entidade IFC própria no escritor: foi como IfcBuildingElementProxy com a caixa dela");
        var ex = peca(c.id, "IFCBUILDINGELEMENTPROXY", nome, c.tipo || "Elemento", pl, rep, [E("ELEMENT")], yb, nv);
        ligarMaterial(ex, matN);
        qto(ex, "Qto_BuildingElementProxyQuantities", [["NetVolume", "V", c.comprimento * c.altura * c.espessura]]);
        ligarCodigos(ex, servCods); origemPset(ex);
        ex.volume = r6(c.comprimento * c.altura * c.espessura);
      }
    }));

    /* ================= UNIÃO DE PAREDES (js/bimuniao.js) =================
     * Cada par unido (L, T, X, emenda — as juntas que o BimArq derivou) vira
     * IfcRelConnectsPathElements: RelatingElement = a que passa (L em topo),
     * a que recebe (T) ou a primeira criada (X); AtStart/AtEnd = a ponta do
     * eixo no encontro, AtPath = no meio. A geometria já sai aparada (os
     * prismas do BimArq.pecasParede). Ordem do IFC4: ... RelatingPriorities,
     * RelatedPriorities, RelatedConnectionType, RelatingConnectionType. */
    var BU = dep("BimUniao", "./bimuniao.js"), nCon = 0;
    if (BU && BU.conexoes) {
      BU.conexoes(arr(st.caixas).filter(function (c) { return c && c.tipo === "parede" && paredesIfc[c.id]; })).forEach(function (k) {
        var pa = paredesIfc[k.a], pb = paredesIfc[k.b]; if (!pa || !pb) return;
        var rot = { L: "Canto em L", T: "Encontro em T", X: "Cruzamento em X", I: "Emenda" }[k.tipo] || "Junta";
        w("IFCRELCONNECTSPATHELEMENTS", [G("uniao:" + k.a + "|" + k.b), OH, S(rot + (k.modo ? " (" + k.modo + ")" : "")), S("Parede " + k.a + " × parede " + k.b), "$",
          ref(pa.el.ent), ref(pb.el.ent), "()", "()", E(k.ondeB), E(k.ondeA)]);
        nCon++;
      });
    }
    void nCon;

    /* ================= COBERTURA ================= */
    arr(st.coberturas).forEach(comMat(function (cb) {   /* MATERIAIS: a peça com material do projeto */
      var nv = nivelDe(num(cb.base, 0)), itens = [];   /* a cobertura é do nível onde ela apoia */
      arr(cb.planos).forEach(function (p) {
        var Xb = rotYX([1, 0, 0], p.rotY, p.rotX), Yb = rotYX([0, 1, 0], p.rotY, p.rotX);
        var ori = cena2ifc(sub([p.cx, p.cy, p.cz], mul(Yb, p.espessura / 2))); ori[2] -= nv.elevacao;
        var pos = w("IFCAXIS2PLACEMENT3D", [ref(pt3(ori)), ref(D(cena2ifc(Yb))), ref(D(cena2ifc(Xb)))]);
        var s = extrudado(retangulo(p.comprimento, p.largura), pos, p.espessura);
        pintar(s, MAT_EDITOR.cobertura); itens.push(s);
      });
      if (!itens.length) return;
      var pl = placement(nv.pl, [0, 0, 0]);
      var tipoRef = "Cobertura " + (cb.aguas === 1 ? "1 água" : "2 águas") + " " + String(cb.inclinacao).replace(".", ",") + "%";
      var er = peca(cb.id, "IFCROOF", "Cobertura " + cb.id, tipoRef, pl, forma(itens, "SweptSolid"), [E(cb.aguas === 1 ? "SHED_ROOF" : "GABLE_ROOF")], num(cb.base, 0), nv, { mapa: "cobertura" });
      ligarMaterial(er, MAT_EDITOR.cobertura);
      pset(er, "Pset_RoofCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      /* P1-D: NetArea e ProjectedArea (e o volume e a cumeeira, no OrcaPRO_Cobertura) saem do registro */
      qto(er, "Qto_RoofBaseQuantities", [["GrossArea", "A", cb.area]]);
      ligarCodigos(er, arr(cb.servicos).map(function (s) { return s.codigo; })); origemPset(er);
      er.volume = r6(cb.volume);
    }));

    /* ================= FAMÍLIAS (livres e hospedadas) ================= */
    arr(st.familias).forEach(comMat(function (f) {   /* MATERIAIS: a peça com material do projeto */
      var av = avaliarFam(f.famId, f.tipoId, f.inst);
      if (!av || !arr(av.solidos).length) { avisos.push("família " + f.id + " (" + f.famId + ") não está na biblioteca deste aparelho — ficou de fora do IFC"); return; }
      var cat = (opts.categoriaFam && opts.categoriaFam(f.famId)) || "generico";
      var entidade = ENTIDADE_CAT[cat] || "IFCBUILDINGELEMENTPROXY";
      /* P12: dispositivo MEP (tomada, interruptor, luminária, quadro): a classe do motor das instalações */
      var DSP = av.mep && BI && BI.DISPOSITIVOS ? BI.DISPOSITIVOS[av.mep.peca] : null;
      if (DSP) entidade = DSP.ifc;
      /* FAMIMPORT (js/familiamalha.js): a família importada sai na classe da CATEGORIA DO REVIT dela (MAPA_REVIT) */
      var FIM = av.importada || null, kmFim = FIM && MAPA_REVIT[FIM.mapaIfc] ? FIM.mapaIfc : null;
      if (kmFim) entidade = MAPA_REVIT[kmFim].ifc;
      var nv = nivelDe(num(f.y, 0)), th = num(f.rotY, 0);
      var base = cena2ifc([f.x, f.y, f.z]); base[2] -= nv.elevacao;
      var pl = placement(nv.pl, base, [0, 0, 1], [Math.cos(th), Math.sin(th), 0]);
      var itens = [], volTot = 0, contMat = {}, temBrep = false, volAberto = false;
      arr(av.solidos).forEach(function (s) {
        var rot = num(s.rot, 0) * Math.PI / 180, loc = [s.x, -s.z, s.y], solido = null;
        if (s.forma === "malha") {
          /* FAMIMPORT: a malha vira IfcFacetedBrep (um por material; NUNCA IfcTriangulatedFaceSet — o Revit o lê sem geometria).
             Local (x, y para cima, z) → IFC (x, −z, y), a mesma conta do `loc` acima */
          var faces = [], vv = s.v, ff = s.f;
          for (var tf = 0; tf + 2 < ff.length; tf += 3) faces.push([0, 1, 2].map(function (k) { var i3 = ff[tf + k] * 3; return [num(s.x, 0) + vv[i3], -(num(s.z, 0) + vv[i3 + 2]), num(s.y, 0) + vv[i3 + 1]]; }));
          solido = brepFaces(faces);
          if (!solido) { avisos.push("família " + f.id + ": a parte \"" + (s.material || s.id) + "\" tem menos de 4 faces — ficou de fora do IFC"); return; }
          temBrep = true; if (s.volume == null) volAberto = true; else volTot += num(s.volume, 0);   /* malha aberta: sem volume (o Qto não leva zero) */
          var hx = /^#([0-9a-f]{6})$/i.exec(String(s.cor || "")), mnB = s.material || "Indefinido";
          pintar(solido, mnB, hx ? parseInt(hx[1], 16) : undefined); contMat[mnB] = (contMat[mnB] || 0) + ff.length / 3;
          itens.push(solido); return;
        }
        if (s.forma === "caixa") {
          solido = extrudado(retangulo(s.dx, s.dz), w("IFCAXIS2PLACEMENT3D", [ref(pt3(loc)), ref(D([0, 0, 1])), ref(D([Math.cos(rot), Math.sin(rot), 0]))]), s.dy);
          volTot += s.dx * s.dy * s.dz;
        } else if (s.forma === "cilindro") {
          var circ = w("IFCCIRCLEPROFILEDEF", [E("AREA"), "$", ref(eixo2d), R(s.raio)]);
          var ax = s.eixo === "x" ? [[1, 0, 0], [0, 1, 0]] : (s.eixo === "z" ? [[0, -1, 0], [1, 0, 0]] : [[0, 0, 1], [1, 0, 0]]);
          solido = extrudado(circ, w("IFCAXIS2PLACEMENT3D", [ref(pt3(loc)), ref(D(ax[0])), ref(D(ax[1]))]), s.altura);
          volTot += Math.PI * s.raio * s.raio * s.altura;
        } else {
          var frente = s.plano === "frente";
          var pts = arr(s.contorno).map(function (q) { return frente ? [q[0], q[1]] : [q[0], -q[1]]; });
          if (pts.length < 3) return;
          var poly = w("IFCPOLYLINE", [L(pts.concat([pts[0]]).map(function (q) { return ref(w("IFCCARTESIANPOINT", [P2(q)])); }))]);
          var prof = w("IFCARBITRARYCLOSEDPROFILEDEF", [E("AREA"), "$", ref(poly)]);
          var z = frente ? [Math.sin(rot), -Math.cos(rot), 0] : [0, 0, 1], x = [Math.cos(rot), Math.sin(rot), 0];
          solido = extrudado(prof, w("IFCAXIS2PLACEMENT3D", [ref(pt3(loc)), ref(D(z)), ref(D(x))]), s.altura);
          var a2 = 0; for (var i = 0; i < pts.length; i++) { var u = pts[i], v = pts[(i + 1) % pts.length]; a2 += u[0] * v[1] - v[0] * u[1]; }
          volTot += Math.abs(a2) / 2 * s.altura;
        }
        var mn = s.material || "Indefinido", hxS = /^#([0-9a-f]{6})$/i.exec(String(s.cor || ""));   /* MARCENARIA: a cor da chapa (catálogo) */
        pintar(solido, mn, hxS ? parseInt(hxS[1], 16) : undefined); contMat[mn] = (contMat[mn] || 0) + 1;
        itens.push(solido);
      });
      if (!itens.length) { avisos.push("família " + f.id + " sem sólido exportável"); return; }
      if (volAberto) volTot = NaN;   /* FAMIMPORT: malha aberta — o Qto não recebe volume (filtra o não finito) */
      /* MARCENARIA (js/marcenaria.js): o móvel sai como IfcFurniture (a estrutura de madeira, IfcElementAssembly)
         SEM forma própria; cada PEÇA do corte é uma parte com a sua forma (IfcBuildingElementPart; na madeira,
         IfcMember), agregada a ele (IfcRelAggregates) — o mesmo arranjo da escada e dos lances */
      if (av.marcenaria && arr(av.solidos).length === itens.length) {
        var carpM = !!av.marcenaria.carpintaria, tipoM = av.marcenaria.modulo ? av.marcenaria.modulo.tipo : "";
        var nomeTipoM = av.tipo ? av.tipo.nome : "", nomeFamM = (opts.nomeFam && opts.nomeFam(f.famId)) || f.famId;
        var extraM = carpM ? [E("NOTDEFINED"), E(av.marcenaria.carpintaria === "tesoura" ? "TRUSS" : "NOTDEFINED")] : [E(tipoM === "prateleira" || tipoM === "nicho" ? "SHELF" : "NOTDEFINED")];
        var elM = peca(f.id, carpM ? "IFCELEMENTASSEMBLY" : "IFCFURNITURE", nomeFamM + (nomeTipoM ? " : " + nomeTipoM : ""), nomeTipoM || nomeFamM, pl, null, extraM, num(f.y, 0), nv, { mapa: "generico" });
        var partesM = [], volM = 0, contM = {}, MEMB = { COLUMN: "POST", BEAM: "MEMBER", RAFTER: "RAFTER", CHORD: "CHORD", POST: "POST", STRUT: "STRUT", PLATE: "PLATE" };
        av.solidos.forEach(function (s, i) {
          var pe = s.peca || {}, vol = 0;
          if (s.forma === "caixa") vol = s.dx * s.dy * s.dz;
          else { var aM = 0, ct = arr(s.contorno); for (var iM = 0; iM < ct.length; iM++) { var uM = ct[iM], vM = ct[(iM + 1) % ct.length]; aM += uM[0] * vM[1] - vM[0] * uM[1]; } vol = Math.abs(aM) / 2 * num(s.altura, 0); }
          var parte = peca(f.id + ":pc" + (i + 1), carpM ? "IFCMEMBER" : "IFCBUILDINGELEMENTPART", s.nome || ("Peça " + (i + 1)), pe.funcao || s.nome || "peça", placement(pl, [0, 0, 0]),
            forma([itens[i]], "SweptSolid"), [E(carpM ? (MEMB[pe.ifc] || "MEMBER") : "USERDEFINED")], num(f.y, 0), nv, { parte: f.id });
          ligarMaterial(parte, s.material || "Indefinido"); contM[s.material || "Indefinido"] = (contM[s.material || "Indefinido"] || 0) + 1;
          pset(parte, "OrcaPRO_Marcenaria", [["Funcao", "IFCLABEL", pe.funcao], ["Medidas", "IFCLABEL", pe.medidas], ["Veio", "IFCBOOLEAN", pe.veio == null ? null : !!pe.veio],
            ["Fitas", "IFCLABEL", pe.fitas], ["Secao", "IFCLABEL", pe.secao], ["Corte1", "IFCLABEL", pe.corte1], ["Corte2", "IFCLABEL", pe.corte2], ["Especie", "IFCLABEL", pe.especie]]);
          origemPset(parte, [["Movel", "IFCIDENTIFIER", f.id]]);
          parte.volume = r6(vol); volM += vol; partesM.push(parte.ent);
        });
        w("IFCRELAGGREGATES", [G("rel:marcenaria:" + f.id), OH, "$", "$", ref(elM.ent), L(partesM.map(ref))]);
        ligarMaterial(elM, Object.keys(contM).sort(function (a, b) { return contM[b] - contM[a]; })[0]);
        var qM = av.quantitativo || {};
        pset(elM, "OrcaPRO_Quantitativo", [["Descricao", "IFCTEXT", qM.descricao], ["CodigoOrcamento", "IFCIDENTIFIER", qM.codigo]]);
        pset(elM, "OrcaPRO_Marcenaria", [["Pecas", "IFCINTEGER", partesM.length], ["Tipo", "IFCLABEL", carpM ? av.marcenaria.carpintaria : tipoM]]);
        ligarCodigos(elM, [qM.codigo].concat(arr(f.servicos).map(function (s) { return s.codigo; })), qM.fonte);
        origemPset(elM, [["Familia", "IFCLABEL", nomeFamM], ["Tipo", "IFCLABEL", nomeTipoM]]);
        elM.volume = r6(volM); elM.partes = partesM.length; elM.semGeometriaPropria = true;
        famIfc[f.id] = { el: elM, pl: pl, av: av };
        return;
      }
      var nomeTipo = av.tipo ? av.tipo.nome : "";
      var nomeFam = (opts.nomeFam && opts.nomeFam(f.famId)) || f.famId;
      var extra = [E(entidade === "IFCDOOR" ? "DOOR" : entidade === "IFCWINDOW" ? "WINDOW" : entidade === "IFCCOLUMN" ? "COLUMN" : entidade === "IFCBEAM" ? "BEAM" : entidade === "IFCSLAB" ? "FLOOR" : entidade === "IFCWALL" ? "NOTDEFINED" : "ELEMENT")];
      if (entidade === "IFCDOOR" || entidade === "IFCWINDOW") {
        var ab = av.abertura || {};
        extra = [ab.altura ? R(ab.altura) : "$", ab.largura ? R(ab.largura) : "$", E(entidade === "IFCDOOR" ? "DOOR" : "WINDOW"), E("NOTDEFINED"), "$"];
      }
      if (DSP) extra = [E(DSP.pre)];
      /* FAMIMPORT: classe de instalação/elétrica — o PredefinedType do MAPA_REVIT (ou NOTDEFINED; "ELEMENT" não existe nelas) */
      var preFim = kmFim && !/^(IFCDOOR|IFCWINDOW|IFCCOLUMN|IFCBEAM|IFCBUILDINGELEMENTPROXY)$/.test(entidade) ? (MAPA_REVIT[kmFim].tipo || "NOTDEFINED") : null;
      if (preFim) extra = [E(preFim)];
      var el = peca(f.id, entidade, nomeFam + (nomeTipo ? " : " + nomeTipo : ""), nomeTipo || nomeFam, pl, forma(itens, temBrep ? "Brep" : "SweptSolid"), extra, num(f.y, 0), nv, DSP ? { mapa: av.mep.peca } : (kmFim ? { mapa: kmFim } : null));
      famIfc[f.id] = { el: el, pl: pl, av: av };   /* P12: as portas dos conectores (abaixo, nas instalações) */
      if (DSP && !el.reg) tipoMEP(entidade, nomeTipo || nomeFam, DSP.pre, el);   /* sem o registro, o tipo sai aqui (o importador olha o IfcXxxType) */
      if (preFim && MAPA_REVIT[kmFim].comTipo && !el.reg) tipoMEP(entidade, nomeTipo || nomeFam, preFim, el);   /* FAMIMPORT: luminária, acessório — com o IfcXxxType (o MAPA_REVIT pede o tipo nessas classes) */
      /* FAMIMPORT: TODOS os parâmetros da família importada num Pset com o nome da família */
      if (FIM && arr(FIM.pset).length) pset(el, String(nomeFam).slice(0, 120), FIM.pset);
      var matPrinc = Object.keys(contMat).sort(function (a, b) { return contMat[b] - contMat[a]; })[0];
      ligarMaterial(el, matPrinc);
      var q = av.quantitativo || {};
      if (entidade === "IFCDOOR" || entidade === "IFCWINDOW") {
        /* P1-D: Width, Height e Area (o vão) saem do registro */
        pset(el, entidade === "IFCDOOR" ? "Pset_DoorCommon" : "Pset_WindowCommon", [["Reference", "IFCIDENTIFIER", nomeTipo]]);
      } else {
        var psN = { IFCCOLUMN: "Pset_ColumnCommon", IFCBEAM: "Pset_BeamCommon", IFCWALL: "Pset_WallCommon", IFCSLAB: "Pset_SlabCommon", IFCBUILDINGELEMENTPROXY: "Pset_BuildingElementProxyCommon" }[entidade];
        if (psN || !FIM) pset(el, psN, [["Reference", "IFCIDENTIFIER", nomeTipo]]);   /* FAMIMPORT: classe de instalação importada não tem Pset_…Common aqui */
        var qN = { IFCCOLUMN: "Qto_ColumnBaseQuantities", IFCBEAM: "Qto_BeamBaseQuantities", IFCWALL: "Qto_WallBaseQuantities", IFCSLAB: "Qto_SlabBaseQuantities", IFCBUILDINGELEMENTPROXY: "Qto_BuildingElementProxyQuantities" }[entidade];
        if (qN || !FIM) qto(el, qN, [["GrossVolume", "V", entidade === "IFCBUILDINGELEMENTPROXY" ? NaN : volTot], ["NetVolume", "V", volTot]]);
      }
      /* P1-D: Unidade e Quantidade saem do registro; o código de orçamento é de
         TIPO (vai no tipo) e continua na ocorrência, com o valor do registro */
      pset(el, "OrcaPRO_Quantitativo", [["Descricao", "IFCTEXT", q.descricao], ["CodigoOrcamento", "IFCIDENTIFIER", q.codigo]]);
      ligarCodigos(el, [q.codigo].concat(arr(av.servicos).map(function (s) { return s.codigo; })).concat(arr(f.servicos).map(function (s) { return s.codigo; })), q.fonte);
      origemPset(el, [["Familia", "IFCLABEL", nomeFam], ["Tipo", "IFCLABEL", nomeTipo]]);
      el.volume = r6(volTot);
      /* hospedada: o vão vira IfcOpeningElement que fura a parede e a peça o preenche */
      if (f.host && paredesIfc[f.host.id] && av.abertura) {
        var pw = paredesIfc[f.host.id], c = pw.c;
        if (pw.conflitos.indexOf(f.id) >= 0) { avisos.push(f.id + " encavala outro vão na parede " + c.id + " — vai sem abertura"); return; }
        var tA = f.host.t + (num(av.abertura.deslocX, 0) || 0);   /* FAMIMPORT: vão fora do centro da família */
        var h2 = c.comprimento / 2, x0 = Math.max(-h2, tA - av.abertura.largura / 2), x1 = Math.min(h2, tA + av.abertura.largura / 2);
        var y0 = Math.max(0, num(av.abertura.peitoril, 0)), y1 = Math.min(c.altura, num(av.abertura.peitoril, 0) + av.abertura.altura);
        if (x1 - x0 <= 0.01 || y1 - y0 <= 0.01) return;
        var plA = placement(pw.pl, [(x0 + x1) / 2, 0, y0]);
        /* 4 cm mais grossa que a parede: o furo atravessa sem deixar película */
        var sA = extrudado(retangulo(x1 - x0, c.espessura + 0.04), w("IFCAXIS2PLACEMENT3D", [ref(origem3), "$", "$"]), y1 - y0);
        /* CURVA: na parede curva o vão é a caixa RETA na tangente do ponto da porta, funda o bastante
           para passar a face de dentro (a flecha da corda) — corta a faixa ∩ o anel, como o motor mede */
        if (pw.W && pw.W.arco) {
          var Wc = pw.W, lg = av.abertura.largura, pm = Wc.pt(num(f.host.t, 0), 0), Tg = Wc.tan(num(f.host.t, 0)), yb2 = BA.frameDe(c).y0;
          var lp = pw.loc(W2I([pm[0], yb2, pm[1]], pw.nivel)), lq = pw.loc(W2I([pm[0] + Tg[0], yb2, pm[1] + Tg[1]], pw.nivel));
          var ri = Math.min(Wc.rho(-c.espessura / 2), Wc.rho(c.espessura / 2)), flecha = ri - Math.sqrt(Math.max(0, ri * ri - lg * lg / 4));
          x0 = -lg / 2; x1 = lg / 2;
          plA = placement(pw.pl, [lp[0], lp[1], y0], [0, 0, 1], [lq[0] - lp[0], lq[1] - lp[1], 0]);
          sA = extrudado(retangulo(lg, c.espessura + 2 * flecha + 0.04), w("IFCAXIS2PLACEMENT3D", [ref(origem3), "$", "$"]), y1 - y0);
        }
        var abr = peca(f.id + "-vao", "IFCOPENINGELEMENT", "Vão de " + el.nome, "Vão", plA, forma([sA], "SweptSolid"), [E("OPENING")], 0, pw.nivel);
        qto(abr, "Qto_OpeningElementBaseQuantities", [["Width", "L", x1 - x0], ["Height", "L", y1 - y0], ["Depth", "L", c.espessura]]);
        w("IFCRELVOIDSELEMENT", [G("void:" + f.id), OH, "$", "$", ref(pw.el.ent), ref(abr.ent)]);
        w("IFCRELFILLSELEMENT", [G("fill:" + f.id), OH, "$", "$", ref(abr.ent), ref(el.ent)]);
        el.hospedeiro = c.id;
      }
    }));

    /* ================= VOLUMES LIVRES (B4) ================= */
    arr(st.volumes).forEach(comMat(function (v) {   /* MATERIAIS: a peça com material do projeto */
      var malha = v.malha, medidas = v.medidas;
      if (!malha && BV) {
        var a = BV.avaliar(v.receita, opts.csg || null, opts.cacheVolume || {});
        if (a.ok) { malha = a.malha; medidas = BV.medir(a.malha, v.receita, a.meta); }
        else { avisos.push("volume " + v.id + " ficou de fora: " + a.erro); return; }
      }
      if (!malha || !malha.f || !malha.f.length) { avisos.push("volume " + v.id + " sem geometria — ficou de fora"); return; }
      var cx = BV ? BV.caixa(malha) : null, yb = cx ? cx.min[1] : 0, nv = nivelDe(yb);
      var pl = placement(nv.pl, [0, 0, 0]), item, tipoRep, prisma = BV ? BV.prismaDe(v.receita) : null;
      if (prisma) {
        /* prisma reto: o contorno no plano dele, puxado na normal (exato e leve) */
        var o = cena2ifc(prisma.plano.o); o[2] -= nv.elevacao;
        var poly = w("IFCPOLYLINE", [L(prisma.contorno.concat([prisma.contorno[0]]).map(function (q) { return ref(w("IFCCARTESIANPOINT", [P2(q)])); }))]);
        var prof = w("IFCARBITRARYCLOSEDPROFILEDEF", [E("AREA"), "$", ref(poly)]);
        var pos = w("IFCAXIS2PLACEMENT3D", [ref(pt3(o)), ref(D(cena2ifc(prisma.plano.n))), ref(D(cena2ifc(prisma.plano.u)))]);
        item = extrudado(prof, pos, prisma.altura); tipoRep = "SweptSolid";
      } else {
        item = brep(malha, nv.elevacao); tipoRep = "Brep";
        if (!item) { avisos.push("volume " + v.id + ": malha sem face — ficou de fora"); return; }
      }
      pintar(item, v.material);
      var ent = v.ifc || "IFCBUILDINGELEMENTPROXY";
      var pre = { IFCWALL: "NOTDEFINED", IFCSLAB: "FLOOR", IFCCOLUMN: "COLUMN", IFCBEAM: "BEAM", IFCROOF: "NOTDEFINED", IFCBUILDINGELEMENTPROXY: "ELEMENT" }[ent] || "NOTDEFINED";
      var nomeV = v.nome || ("Volume " + v.id);
      var el = peca(v.id, ent, nomeV, "Volume livre (" + (v.categoria || "genérico") + ")", pl, forma([item], tipoRep), [E(pre)], yb, nv);
      ligarMaterial(el, v.material);
      var vol = medidas ? medidas.volume : (BV ? Math.abs(BV.volume(malha)) : NaN), ar = medidas ? medidas.area : (BV ? BV.area(malha) : NaN);
      var qn = { IFCWALL: "Qto_WallBaseQuantities", IFCSLAB: "Qto_SlabBaseQuantities", IFCCOLUMN: "Qto_ColumnBaseQuantities", IFCBEAM: "Qto_BeamBaseQuantities", IFCROOF: "Qto_RoofBaseQuantities", IFCBUILDINGELEMENTPROXY: "Qto_BuildingElementProxyQuantities" }[ent];
      if (ent === "IFCROOF") qto(el, qn, [["ProjectedArea", "A", medidas && medidas.areaProjecao != null ? medidas.areaProjecao : NaN]]);
      else if (ent === "IFCBUILDINGELEMENTPROXY") qto(el, qn, [["NetSurfaceArea", "A", ar], ["NetVolume", "V", vol]]);
      else qto(el, qn, [["GrossVolume", "V", vol], ["NetVolume", "V", vol]]);
      pset(el, "OrcaPRO_Volume", [["Forma", "IFCLABEL", formaRaiz(v.receita)], ["Volume", "IFCVOLUMEMEASURE", vol], ["AreaSuperficie", "IFCAREAMEASURE", ar],
        ["Comprimento", "IFCLENGTHMEASURE", medidas && medidas.comprimento != null ? medidas.comprimento : null], ["Altura", "IFCLENGTHMEASURE", medidas && medidas.altura != null ? medidas.altura : null]]);
      ligarCodigos(el, arr(v.servicos).map(function (s) { return s.codigo; })); origemPset(el, [["Categoria", "IFCLABEL", v.categoria]]);
      el.volume = r6(vol);
    }));
    function formaRaiz(r) { var t = r; while (t && t.forma === "mover") t = t.base; return t ? { extrusao: "Extrusão", revolucao: "Revolução", varredura: "Varredura", bool: t.tipo === "subtracao" ? "Subtração" : (t.tipo === "uniao" ? "União" : "Interseção"), empurrar: "Empurrar/puxar" }[t.forma] || t.forma : ""; }
    /* IfcFacetedBrep: cada face PLANA da malha (triângulos coplanares juntos)
       vira um IfcFace com o contorno externo e os furos; face que não fecha
       o contorno vai em triângulos (ainda Brep, nunca TriangulatedFaceSet) */
    function brep(malha, elev) {
      var regs = BV.regioesPlanas(malha), pts = {}, faces = [];
      function P(i) { if (!pts[i]) { var c = cena2ifc([malha.v[3 * i], malha.v[3 * i + 1], malha.v[3 * i + 2]]); c[2] -= elev; pts[i] = w("IFCCARTESIANPOINT", [P3(c)]); } return pts[i]; }
      regs.forEach(function (rg) {
        var lc = BV.lacos(malha, rg);
        if (lc && lc.length) {
          /* o externo é o de maior área projetada no plano da face */
          var u = norm(Math.abs(rg.n[0]) < 0.9 ? cross(rg.n, [1, 0, 0]) : cross(rg.n, [0, 1, 0])), vv = cross(rg.n, u);
          var areas = lc.map(function (l) { var s = 0; for (var i = 0; i < l.length; i++) { var a = l[i], b = l[(i + 1) % l.length]; var pa = [malha.v[3 * a], malha.v[3 * a + 1], malha.v[3 * a + 2]], pb = [malha.v[3 * b], malha.v[3 * b + 1], malha.v[3 * b + 2]]; s += dot(pa, u) * dot(pb, vv) - dot(pb, u) * dot(pa, vv); } return Math.abs(s); });
          var ext = areas.indexOf(Math.max.apply(null, areas));
          var bounds = lc.map(function (l, i) {
            var loop = w("IFCPOLYLOOP", [L(l.map(function (k) { return ref(P(k)); }))]);
            return w(i === ext ? "IFCFACEOUTERBOUND" : "IFCFACEBOUND", [ref(loop), ".T."]);
          });
          faces.push(w("IFCFACE", [L(bounds.map(ref))]));
        } else {
          rg.tris.forEach(function (t) {
            var loop = w("IFCPOLYLOOP", [L([0, 1, 2].map(function (k) { return ref(P(malha.f[3 * t + k])); }))]);
            faces.push(w("IFCFACE", [L([ref(w("IFCFACEOUTERBOUND", [ref(loop), ".T."]))])]));
          });
        }
      });
      if (!faces.length) return null;
      return w("IFCFACETEDBREP", [ref(w("IFCCLOSEDSHELL", [L(faces.map(ref))]))]);
    }

    /* ================= P2 — AMBIENTE (IfcSpace) e FORRO (IfcCovering CEILING) =================
     * AMBIENTE (js/bimambiente.js): o CONTORNO NA FACE da parede (o sólido do
     * ambiente: o volume é sempre o da face, qualquer que seja a regra da
     * área) extrudado na Altura não delimitada, da base do ambiente. Name =
     * Número, LongName = Nome (convenção do IfcSpace); agregado ao nível.
     * Qto_SpaceBaseQuantities, Pset_SpaceCoveringRequirements (os textos dos
     * acabamentos) e o resto saem do REGISTRO (js/bimparam.js); aqui vão o
     * Pset_SpaceCommon (Reference = o Número do registro), o pé-direito
     * acabado (FinishCeilingHeight, quando há forro plano no ambiente) e as
     * QUANTIDADES DO ACABAMENTO (js/bimacabamento.js) no OrcaPRO_Acabamento.
     * Ambiente não delimitado ou redundante não tem região: fica de fora COM
     * aviso (ambiente não delimitado não tem sólido).
     * FORRO (js/bimforro.js): o contorno (com furos) extrudado na espessura do
     * tipo a partir da FACE DE BAIXO (a altura do deslocamento); inclinado,
     * o perfil vai no PLANO DO FORRO e a extrusão na normal dele (volume = área
     * inclinada × espessura, a mesma conta do motor). Camadas do tipo em
     * IfcMaterialLayerSetUsage (AXIS3, POSITIVE: de baixo para cima);
     * IfcRelCoversSpaces liga o forro ao ambiente em que ele está
     * (ambienteId, derivado no replay). */
    var BAmb = dep("BimAmbiente", "./bimambiente.js"), BAca = dep("BimAcabamento", "./bimacabamento.js");
    var espacosIfc = {}, forrosDoAmb = {};
    arr(st.forros).forEach(function (f) { if (f && f.ok !== false && f.ambienteId != null) (forrosDoAmb[String(f.ambienteId)] = forrosDoAmb[String(f.ambienteId)] || []).push(f); });
    var ambsIfc = arr(st.ambientes).filter(function (a) { return a && a.id != null; });
    if (ambsIfc.length) {
      var faceDe = null, QAc = null;
      try { QAc = BAca ? BAca.quantidades(st, { avaliarFam: avaliarFam, vaos: vaos }) : null; }
      catch (eQ) { avisos.push("ambientes: as quantidades do acabamento (js/bimacabamento.js) falharam (" + (eQ && eQ.message) + ") — o OrcaPRO_Acabamento ficou de fora"); }
      ambsIfc.forEach(function (a) {
        var k = a.calc || {}, nomeA = String(a.nome || "Ambiente");
        if (k.estado !== "delimitado") { avisos.push("ambiente " + a.id + " (" + nomeA + "): " + (k.estado === "redundante" ? "redundante" : "não delimitado") + " — sem região fechada, ficou de fora do IFC (ambiente sem área não vira IfcSpace)"); return; }
        /* o contorno NA FACE: o do replay quando a regra é a face; senão, o mesmo ambiente medido na face */
        var kf = k;
        if (k.regra && k.regra !== "face") {
          if (!faceDe) faceDe = BAmb && BAmb.calcular ? BAmb.calcular(st, { regra: "face", niveis: opts.niveis }).porId : {};
          kf = faceDe[a.id] || null;
        }
        var H = num(k.altura, 0);
        /* o forro delimitador corta o volume do ambiente (js/bimambiente.js, FORRO × VOLUME): o sólido do
           IfcSpace vai até a ALTURA DO VOLUME (volume ÷ área na face) — o NetVolume do Qto e o sólido batem */
        var Hv = isFinite(Number(k.alturaVolume)) && Number(k.alturaVolume) > 0 && Number(k.alturaVolume) < H ? Number(k.alturaVolume) : H;
        if (!kf || arr(kf.contorno).length < 3 || !(H > 0)) { avisos.push("ambiente " + a.id + " (" + nomeA + "): sem contorno na face ou sem altura — ficou de fora do IFC"); return; }
        var nv = nivelDaPeca(a, num(k.base, 0)), pl = placement(nv.pl, [0, 0, num(k.base, 0) - nv.elevacao]);
        var C = kf.contorno.map(function (p) { return [p.x, -p.z]; }), F = arr(kf.furos).map(function (fu) { return arr(fu).map(function (p) { return [p.x, -p.z]; }); });
        var sol = extrudado(perfilPoli(C, F, null, "ambiente " + a.id), pos3([0, 0, 0]), Hv);
        var numero = BAmb && BAmb.numero ? BAmb.numero(a) : (a.numero || k.numeroAuto || null);
        var el = peca(a.id, "IFCSPACE", numero || nomeA, "Ambiente", pl, forma([sol], "SweptSolid"), [S(nomeA), E("ELEMENT"), E("INTERNAL"), "$"], num(k.base, 0), nv, { mapa: "ambiente", espacial: true });
        var rp = regPorChave[a.id], refNum = rp && rp.porId && rp.porId.ROOM_NUMBER && rp.porId.ROOM_NUMBER.valor != null ? String(rp.porId.ROOM_NUMBER.valor) : numero;
        pset(el, "Pset_SpaceCommon", [["Reference", "IFCIDENTIFIER", refNum], ["IsExternal", "IFCBOOLEAN", false]]);
        /* o pé-direito acabado: a face de baixo do forro plano do ambiente − a base (o mais baixo, se houver mais de um) */
        var fps = arr(forrosDoAmb[String(a.id)]).filter(function (f) { return !(num(f.inclinacao, 0) > 0) && isFinite(Number(f.cota)); });
        if (fps.length) qto(el, "Qto_SpaceBaseQuantities", [["FinishCeilingHeight", "L", Math.min.apply(null, fps.map(function (f) { return Number(f.cota); })) - num(k.base, 0)]]);
        pset(el, "OrcaPRO_Ambiente", [["Situacao", "IFCLABEL", "Delimitado"], ["RegraArea", "IFCLABEL", k.regraNome || null], ["AreaNaFace", "IFCAREAMEASURE", k.areaFace], ["PerimetroNaFace", "IFCLENGTHMEASURE", k.perimetroFace]]);
        var Q = QAc && QAc.porId ? QAc.porId[String(a.id)] : null;
        if (Q && Q.estado === "delimitado") pset(el, "OrcaPRO_Acabamento", [["AreaPiso", "IFCAREAMEASURE", Q.areaPiso], ["Rodape", "IFCLENGTHMEASURE", Q.rodape], ["AreaParede", "IFCAREAMEASURE", Q.areaParede],
                                                                         ["AreaTeto", "IFCAREAMEASURE", Q.areaTeto], ["TetoFonte", "IFCLABEL", Q.tetoFonte === "forro" ? "Forro" : "Ambiente"]]);
        ligarCodigos(el, arr(a.servicos).map(function (s) { return s.codigo; })); origemPset(el, [["Modelador", "IFCLABEL", "P2"]]);
        el.volume = r6(num(kf.areaFace, 0) * Hv); el.alturaSolido = r6(Hv); el.volumeApp = k.volume; el.numero = numero; el.nomeLongo = nomeA;
        espacosIfc[String(a.id)] = el;
      });
    }
    arr(st.forros).forEach(comMat(function (f) {   /* MATERIAIS: a peça com material do projeto */
      if (!f || f.id == null) return;
      if (!f.ok) { avisos.push("forro " + f.id + ": " + (arr(f.avisos)[0] || "sem contorno") + " — ficou de fora do IFC"); return; }
      var t = f.tipoForro || {}, esp = num(f.espessura, 0);
      if (!(esp > 0) || arr(f.contorno).length < 3) { avisos.push("forro " + f.id + ": sem espessura ou sem contorno — ficou de fora do IFC"); return; }
      var nv = nivelDaPeca(f, num(f.elevNivel, num(f.cota, 0)));
      var th = num(f.inclinacao, 0) * Math.PI / 180, dr = num(f.dirInclinacao, 0) * Math.PI / 180;
      /* a direção em que o forro SOBE, no plano do IFC (cena (x, z) → IFC (x, −z)) */
      var da = Math.cos(dr), db = -Math.sin(dr), co = Math.cos(th), si = Math.sin(th), incl = th > 1e-12;
      /* origem: o ponto (0, 0) da planta, na altura da face de baixo ali (BimForro.cotaEm) */
      var z0 = num(f.cota, 0) - (incl ? num(f.projMin, 0) * Math.tan(th) : 0) - nv.elevacao;
      var X = incl ? [da * co, db * co, si] : [1, 0, 0], Z = incl ? [-da * si, -db * si, co] : [0, 0, 1];
      function loc(p) { var x = p.x, y = -p.z; if (!incl) return [x, y]; return [(x * da + y * db) / co, -x * db + y * da]; }
      var pl = placement(nv.pl, [0, 0, z0], Z, X);
      var tipoRef = String(t.rotulo || "Forro");
      var sol = extrudado(perfilPoli(f.contorno.map(loc), arr(f.furos).map(function (fu) { return arr(fu && fu.pts).map(loc); }), tipoRef, "forro " + f.id), pos3([0, 0, 0]), esp);
      var cam = arr(t.camadas), matN = String((cam[0] && (cam[0].material || cam[0].rotulo)) || "Forro");
      pintar(sol, matN);
      /* a forma do IfcCovering para o Revit: FORRO_IFC (PredefinedType, ObjectType e, no registro mais abaixo, o IfcCoveringType) */
      var el = peca(f.id, "IFCCOVERING", "Forro " + f.id, FORRO_IFC.objectType || tipoRef, pl, forma([sol], "SweptSolid"), [E(FORRO_IFC.pre)], num(f.cota, 0), nv, { mapa: "forro" });
      el.forroIfc = FORRO_IFC.chave;
      /* as camadas do tipo (de baixo para cima, a partir da face acabada) */
      var soma = cam.reduce(function (s, k) { return s + num(k.e, 0); }, 0);
      if (cam.length && Math.abs(soma - esp) <= 5e-4) {
        var kc = "forro|" + String(t.id || tipoRef) + "|" + R(soma);
        if (!conjCamadas[kc]) conjCamadas[kc] = w("IFCMATERIALLAYERSET", [L(cam.map(function (k) {
          return ref(w("IFCMATERIALLAYER", [ref(material(String(k.material || k.rotulo || "Camada")).m), R(num(k.e, 0)), "$", S(String(k.rotulo || k.material || "Camada")), "$", "$", "$"]));
        })), S(tipoRef), "$"]);
        var ku = kc + "|AXIS3";
        if (!usos[ku]) usos[ku] = { u: w("IFCMATERIALLAYERSETUSAGE", [ref(conjCamadas[kc]), E("AXIS3"), E("POSITIVE"), R(0), "$"]), elementos: [] };
        usos[ku].elementos.push(el.ent); el.material = matN; el.camadas = cam.map(function (k) { return String(k.material || k.rotulo); });
      } else { if (cam.length) avisos.push("forro " + f.id + ": as camadas do tipo somam " + R(soma) + " m e o forro tem " + R(esp) + " m — foi com o material único"); ligarMaterial(el, matN); }
      pset(el, "Pset_CoveringCommon", [["Reference", "IFCIDENTIFIER", tipoRef]]);
      pset(el, "OrcaPRO_Forro", [["Modo", "IFCLABEL", f.modo === "automatico" ? "Automático (pelas paredes)" : "Desenhado (contorno)"], ["Ambiente", "IFCIDENTIFIER", f.ambienteId != null ? String(f.ambienteId) : null]]);
      ligarCodigos(el, arr(f.servicos).map(function (s) { return s.codigo; })); origemPset(el, [["Modelador", "IFCLABEL", "P2"]]);
      el.volume = r6(num(f.volume, 0)); el.area = f.area;
      var sp = f.ambienteId != null ? espacosIfc[String(f.ambienteId)] : null;
      if (sp) { w("IFCRELCOVERSSPACES", [G("cobre:" + f.id), OH, "$", "$", ref(sp.ent), L([ref(el.ent)])]); el.ambiente = String(f.ambienteId); }
    }));

    /* ================= P11 — TERRENO (js/bimterreno.js) ==========     * Pelo MAPA_REVIT.topossolido: o SÓLIDO
     * TOPOGRÁFICO vai como IfcGeographicElement .TERRAIN., CONTIDO NO IfcSite
     * (o terreno é do lote, não de um pavimento), corpo IfcFacetedBrep fechado:
     * os triângulos da superfície (normal para cima), as paredes da borda e o
     * fundo plano na cota do fundo (o volume do registro). A PLATAFORMA vai
     * como parte do terreno (USERDEFINED "Plataforma"): a placa no plano dela,
     * com o corte e o aterro no OrcaPRO_Terraplenagem (pelo registro). As
     * SUB-REGIÕES viram o OrcaPRO_Subregioes do topossólido (área por
     * material). A LINHA DE DIVISA vai no IfcSite (Qto_SiteBaseQuantities
     * GrossArea/GrossPerimeter e Pset_SiteCommon.TotalArea). A IMPLANTAÇÃO
     * vai no IfcSite (RefLatitude/RefLongitude/RefElevation) e no TrueNorth
     * do contexto. Componentes de terreno: IfcBuildingElementProxy (como
     * "Vegetação"/"Estacionamento" no arquivo de exportação de camadas IFC). */
    var T11 = st.terreno, siteContidos = [];
    if (T11) {
      var BTer = dep("BimTerreno", "./bimterreno.js");
      var tirarDoNivel = function (el) { niveis.forEach(function (nv) { var ix = nv.contidos.indexOf(el.ent); if (ix >= 0) nv.contidos.splice(ix, 1); }); siteContidos.push(el.ent); };
      var subsDe = {};
      arr(T11.subregioes).forEach(function (sr) { if (sr && sr.ok && sr.topoHost != null) (subsDe[sr.topoHost] = subsDe[sr.topoHost] || []).push(sr); });
      arr(T11.topos).forEach(function (t) {
        if (!t || t.id == null) return;
        var S = t.ok && BTer && BTer.superficieDe ? BTer.superficieDe(st, t.id) : null;
        if (!S || !S.ok || arr(S.borda).length < 3) { avisos.push("sólido topográfico " + t.id + ": " + ((t.avisos || [])[0] || "sem superfície") + " — ficou de fora do IFC"); return; }
        var V = S.P.map(function (q) { return [q[0], -q[1], q[2]]; }), zb = Number(t.cotaFundo), faces = [];
        S.T.forEach(function (tr) {
          var a = V[tr[0]], b = V[tr[1]], c = V[tr[2]], nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          faces.push(nz > 0 ? [a, b, c] : [a, c, b]);
        });
        var Bd = S.borda.map(function (k) { return V[k]; }), aB = 0;
        for (var ib = 0; ib < Bd.length; ib++) { var q1 = Bd[ib], q2 = Bd[(ib + 1) % Bd.length]; aB += q1[0] * q2[1] - q2[0] * q1[1]; }
        if (aB < 0) Bd.reverse();
        var bot = Bd.map(function (q) { return [q[0], q[1], zb]; });
        for (var j = 0; j < Bd.length; j++) { var j2 = (j + 1) % Bd.length; faces.push([Bd[j], bot[j], bot[j2], Bd[j2]]); }
        faces.push(bot.slice().reverse());
        var brep = brepFaces(faces);
        if (!brep) { avisos.push("sólido topográfico " + t.id + ": o sólido não fechou — ficou de fora do IFC"); return; }
        var matT = String(t.material || "Terra");
        pintar(brep, matT, 0x8a6d46);
        var el = peca(t.id, "IFCGEOGRAPHICELEMENT", String(t.nome || "Sólido topográfico " + t.id), "Sólido topográfico", placement(plSite, [0, 0, 0]), forma([brep], "Brep"), [E("TERRAIN")], 0, niveis[0], { mapa: "topossolido" });
        tirarDoNivel(el); ligarMaterial(el, matT);
        pset(el, "OrcaPRO_Terreno", [["Origem", "IFCLABEL", t.origem === "dxf" ? "Curvas de nível (DXF)" : (t.origem === "csv" ? "Pontos (CSV)" : "Pontos")], ["Pontos", "IFCINTEGER", t.nPontos], ["Triangulos", "IFCINTEGER", t.nTriangulos], ["CotaFundo", "IFCLENGTHMEASURE", zb]]);
        var ss = subsDe[String(t.id)];
        if (ss) pset(el, "OrcaPRO_Subregioes", ss.map(function (sr) { return [String(sr.material || "Sub-região") + " (" + sr.id + ")", "IFCAREAMEASURE", sr.areaSuperficie]; }));
        ligarCodigos(el, arr(t.servicos).map(function (sv) { return sv.codigo; })); origemPset(el, [["Modelador", "IFCLABEL", "P11"]]);
        el.volume = t.volume; el.areaProjetada = t.areaProjetada;
      });
      arr(T11.plataformas).forEach(function (pl) {
        if (!pl || pl.id == null) return;
        if (!pl.ok || arr(pl.contorno).length < 3) { avisos.push("plataforma " + pl.id + ": " + ((pl.avisos || [])[0] || "sem contorno") + " — ficou de fora do IFC"); return; }
        var C2 = pl.contorno.map(function (q) { return [q.x, -q.z]; }), ESP = 0.05;
        var solP = extrudado(perfilPoli(C2, [], "Plataforma", "plataforma " + pl.id), pos3([0, 0, Number(pl.cota) - ESP]), ESP);
        pintar(solP, "Plataforma (terraplenagem)", 0xb59a6a);
        var elP = peca(pl.id, "IFCGEOGRAPHICELEMENT", String(pl.nome || "Plataforma " + pl.id), "Plataforma", placement(plSite, [0, 0, 0]), forma([solP], "SweptSolid"), [E("USERDEFINED")], 0, niveis[0], { mapa: "plataforma" });
        tirarDoNivel(elP); ligarMaterial(elP, "Plataforma (terraplenagem)");
        if (pl.solo && pl.solo.furo) pset(elP, "OrcaPRO_Terraplenagem", [["FuroSondagem", "IFCIDENTIFIER", String(pl.solo.furo.id)]]);
        ligarCodigos(elP, arr(pl.servicos).map(function (sv) { return sv.codigo; })); origemPset(elP, [["Modelador", "IFCLABEL", "P11"]]);
        elP.corte = pl.corte; elP.aterro = pl.aterro;
      });
      arr(T11.componentes).forEach(function (cp) {
        if (!cp || cp.id == null) return;
        var TC = (BTer && BTer.TIPOS_COMP && BTer.TIPOS_COMP[cp.tipoComp]) || { raio: 0.5 }, H = Number(cp.alturaEf) || 1, rr = Math.max(0.05, Math.min(Number(TC.raio) || 0.5, 3));
        var solC = extrudado(circulo(rr), pos3([0, 0, 0]), H);
        var elC = peca(cp.id, "IFCBUILDINGELEMENTPROXY", String(cp.rotulo || "Componente de terreno"), String(cp.rotulo || "Componente de terreno"), placement(plSite, cena2ifc([Number(cp.x) || 0, Number(cp.y) || 0, Number(cp.z) || 0])), forma([solC], "SweptSolid"), [E("NOTDEFINED")], 0, niveis[0], { mapa: "generico" });
        tirarDoNivel(elC); ligarMaterial(elC, cp.tipoComp === "arvore" || cp.tipoComp === "arbusto" ? "Vegetação" : "Componente de terreno");
        ligarCodigos(elC, arr(cp.servicos).map(function (sv) { return sv.codigo; })); origemPset(elC, [["Modelador", "IFCLABEL", "P11"]]);
      });
      /* o LOTE e a IMPLANTAÇÃO no IfcSite (a linha do IfcSite e do contexto são reescritas: elas nascem no começo do arquivo) */
      var divs = arr(T11.divisas).filter(function (d0) { return d0 && d0.ok; }), imp = T11.implantacao;
      if (divs.length) {
        var donoSite = { ent: site, chave: "site" };
        var aL = divs.reduce(function (a0, d0) { return a0 + Number(d0.area || 0); }, 0), pL = divs.reduce(function (a0, d0) { return a0 + Number(d0.perimetro || 0); }, 0);
        qto(donoSite, "Qto_SiteBaseQuantities", [["GrossArea", "A", aL], ["GrossPerimeter", "L", pL]]);
        pset(donoSite, "Pset_SiteCommon", [["TotalArea", "IFCAREAMEASURE", aL]]);
        pset(donoSite, "OrcaPRO_Divisa", divs.map(function (d0) { return ["Divisa " + d0.id, "IFCLABEL", arr(d0.segmentos).map(function (g) { return g.de + "-" + g.para + " " + g.rumo + " " + R(g.distancia) + " m"; }).join("; ")]; }));
        escreverConjuntos(donoSite, "site", true);
      }
      if (imp) {
        var cmp = function (g) {
          var sg = g < 0 ? -1 : 1, a = Math.abs(g), dd = Math.floor(a), mf = (a - dd) * 60, mm = Math.floor(mf), sf = (mf - mm) * 60, se = Math.floor(sf), mi = Math.round((sf - se) * 1e6);
          if (mi >= 1e6) { mi -= 1e6; se++; } if (se >= 60) { se -= 60; mm++; } if (mm >= 60) { mm -= 60; dd++; }
          return "(" + [dd, mm, se, mi].map(function (v) { return String(sg * v); }).join(",") + ")";
        };
        var latOk = isFinite(Number(imp.lat)) && imp.lat != null, lonOk = isFinite(Number(imp.lon)) && imp.lon != null;
        linhas[site - 1] = "#" + site + "=IFCSITE(" + [G("site"), OH, S(opts.terreno || "Terreno"), "$", "$", ref(plSite), "$", imp.local ? S(String(imp.local)) : "$", E("ELEMENT"),
          latOk ? cmp(Number(imp.lat)) : "$", lonOk ? cmp(Number(imp.lon)) : "$", isFinite(Number(imp.elevacao)) && imp.elevacao != null ? R(Number(imp.elevacao)) : "$", "$", "$"].join(",") + ");";
        var an = Number(imp.anguloNorte) || 0;
        if (an) {
          /* o norte verdadeiro girado a partir do +Y (norte do projeto), anti-horário (convenção do js/icargeo.js) */
          var dN = w("IFCDIRECTION", [L([R(-Math.sin(an * Math.PI / 180)), R(Math.cos(an * Math.PI / 180))])]);
          linhas[ctx - 1] = "#" + ctx + "=IFCGEOMETRICREPRESENTATIONCONTEXT(" + ["$", S("Model"), "3", "1.E-05", ref(eixo0), ref(dN)].join(",") + ");";
        }
      }
    }
    /* ================= P3 — TELHADO, BORDAS e FUNDAÇÃO (o escritor é o js/ifcp3.js) ================= */
    var nP3 = arr(st.telhados).length + arr(st.bordas).length + arr(st.fundacoes).length, IP3 = nP3 ? dep("IfcP3", "./ifcp3.js") : null;
    if (nP3 && IP3 && IP3.escrever) IP3.escrever({ w: w, ref: ref, S: S, E: E, L: L, R: R, G: G, OH: OH, dep: dep, peca: peca, placement: placement, pos3: pos3, extrudado: extrudado, perfilPoli: perfilPoli,
      circulo: circulo, retangulo: retangulo, forma: forma, brepFaces: brepFaces, pintar: pintar, ligarMaterial: ligarMaterial, ligarCodigos: ligarCodigos, origemPset: origemPset,
      pset: pset, qto: qto, nivelDaPeca: nivelDaPeca, avisos: avisos }, st);
    else if (nP3) avisos.push("telhado/borda/fundação: o escritor js/ifcp3.js não carregou — " + nP3 + " peça(s) ficaram de fora do IFC");

    /* ================= EIXOS (B2) → IfcGrid ================= */
    var resumoEixos = null;
    var lsE = arr(st.eixos).filter(function (ex) { return ex && [ex.x0, ex.z0, ex.x1, ex.z1].every(function (v) { return isFinite(Number(v)); }); });
    if (lsE.length) {
      /* a grade fica no nível da cota 0 (onde a tela a desenha), no plano dele */
      var nvG = nivelDe(0), plG = placement(nvG.pl, [0, 0, 0]), U = [], V = [], curvas = [], retos = true, nomesU = [], nomesV = [];
      lsE.forEach(function (ex) {
        var a = [Number(ex.x0), -Number(ex.z0)], b = [Number(ex.x1), -Number(ex.z1)];
        var cv = w("IFCPOLYLINE", [L([ref(ponto2(a)), ref(ponto2(b))])]); curvas.push(cv);
        var ga = w("IFCGRIDAXIS", [S(ex.nome || "?"), ref(cv), ".T."]);
        /* corre mais em X (letra, na convenção do BimArq) = U; mais em Z (número) = V */
        if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) { U.push(ga); nomesU.push(String(ex.nome)); } else { V.push(ga); nomesV.push(String(ex.nome)); }
        if (Math.abs(b[0] - a[0]) > 1e-6 && Math.abs(b[1] - a[1]) > 1e-6) retos = false;
      });
      /* o IFC4 exige UAxes e VAxes com ao menos 1 eixo cada (SET [1:?]); com
         eixos numa direção só, a outra lista repete o 1º eixo (a MESMA
         IfcGridAxis — o importador do Revit trata eixo repetido e cria um só) */
      if (!U.length || !V.length) {
        avisos.push("eixos: só há eixos numa direção (" + (U.length ? "letras" : "números") + ") — o IFC4 pede eixos U e V; a outra lista repete o 1º eixo (o Revit cria um eixo só)");
        if (!U.length) U.push(V[0]); else V.push(U[0]);
      }
      var ctxPlanta = w("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", [S("FootPrint"), S("Model"), "*", "*", "*", "*", ref(ctx), "$", E("PLAN_VIEW"), "$"]);
      var repG = w("IFCSHAPEREPRESENTATION", [ref(ctxPlanta), S("FootPrint"), S("GeometricCurveSet"), L([ref(w("IFCGEOMETRICCURVESET", [L(curvas.map(ref))]))])]);
      var grade = w("IFCGRID", [G("el:eixos"), OH, S("Eixos"), "$", S("Grade de eixos do OrçaPRO"), ref(plG), ref(w("IFCPRODUCTDEFINITIONSHAPE", ["$", "$", L([ref(repG)])])),
                                L(U.map(ref)), L(V.map(ref)), "$", E(retos && U.length && V.length ? "RECTANGULAR" : "IRREGULAR")]);
      nvG.contidos.push(grade);
      porEnt.IFCGRID = (porEnt.IFCGRID || 0) + 1;
      resumoEixos = { guid: guid(semente + "|el:eixos"), nivel: nvG.nome, u: nomesU, v: nomesV, mapa: "eixos", revit: MAPA_REVIT.eixos.revit };
    }

    /* ================= INSTALAÇÕES (B5, js/biminst.js) ================= */
    var resumoSistemas = [], inst = st.instalacoes || {}, resumoPortas = null;
    if (arr(inst.trechos).length || arr(inst.pecas).length || arr(inst.acessorios).length) {   /* P12: + acessórios */
      if (!BI || !BI.rede) avisos.push("instalações: o motor js/biminst.js não carregou — " + arr(inst.trechos).length + " trecho(s) e " + arr(inst.pecas).length + " peça(s) ficaram de fora");
      else instalacoes();
    }
    function instalacoes() {
      var Rd = BI.rede(st, avaliarFam), cods = {}, grupos = {}, ordemS = [];
      /* código SINAPI SÓ quando o BimInst já deu (status ok, da tabela gerada do
         mapa); pendente vai sem classificação — nunca a composição "parecida" */
      try { BI.servicosOrc(st, avaliarFam).forEach(function (l) { if (l && l.codigo) cods[l.id] = String(l.codigo); }); }
      catch (eS) { avisos.push("instalações: a tabela SINAPI não respondeu (" + (eS && eS.message) + ") — tubos e peças foram sem código"); }
      function noSistema(s, el) { if (!grupos[s]) { grupos[s] = []; ordemS.push(s); } grupos[s].push(el.ent); el.sistema = s; }
      function propsBase(el, sis, mat, extra) {
        var S0 = BI.SISTEMAS[sis] || {}, M = BI.MATERIAIS[mat];
        pset(el, "OrcaPRO_Instalacao", [["Sistema", "IFCLABEL", S0.nome], ["SistemaCodigo", "IFCIDENTIFIER", sis], ["Material", "IFCLABEL", M ? M.nome : mat], ["Norma", "IFCLABEL", M ? M.norma : null]].concat(extra || []));
      }
      var trechoPorId = {}; Rd.trechos.forEach(function (t) { trechoPorId[t.id] = t; });
      var infoTrecho = {}, infoCx = {}, infoPeca = {}, infoAc = {};   /* P12: elemento + placement de cada peça da rede (para as portas) */
      Rd.trechos.forEach(function (t) {
        var S0 = BI.SISTEMAS[t.sistema], M = BI.MATERIAIS[t.material] || {}, gr = S0.grupo, ret = M.secao === "retangular";
        /* a classe e o PredefinedType vêm do MAPA_REVIT (eletroduto → Conduites;
           tubo/duto flexível → Tubulação/Dutos flexíveis); o rígido, que o
           arquivo deixa sem tipo, vai RIGIDSEGMENT */
        var km = gr === "eletrica" ? "eletroduto" : (gr === "bandeja" ? "bandeja" : (gr === "ar" ? (M.flexivel ? "dutoFlexivel" : "duto") : (M.flexivel ? "tuboFlexivel" : "tubo")));   /* P12: eletrocalha */
        var ent = MAPA_REVIT[km].ifc, pre = MAPA_REVIT[km].tipo || "RIGIDSEGMENT";
        var a = [t.p1.x, t.p1.y, t.p1.z], b = [t.p2.x, t.p2.y, t.p2.z], nv = nivelDe(Math.min(a[1], b[1]));
        var us = norm(sub(b, a)), ws = Math.abs(us[1]) > 0.99 ? [1, 0, 0] : norm(cross([0, 1, 0], us)), Lg = len(sub(b, a));
        /* o eixo do trecho de p1 a p2 COM a inclinação; a seção como a da tela
           (cilindro de raio DN/2, mínimo 8 mm; duto largura × altura) */
        var pl = placement(nv.pl, W2I(a, nv), cena2ifc(us), cena2ifc(ws));
        var raio = Math.max(num(t.dn, 0) / 2000, 0.008);
        var sol = extrudado(ret ? retangulo(t.larg, t.alt) : circulo(raio), pos3([0, 0, 0]), Lg);
        var nomeM = M.nome || t.material; pintar(sol, nomeM, parseInt(String(S0.cor).slice(1), 16));
        var dnTxt = ret ? Math.round(t.larg * 100) + "×" + Math.round(t.alt * 100) + " cm" : "DN " + t.dn;
        var el = peca(t.id, ent, S0.nome + " · " + dnTxt + " (" + t.id + ")", nomeM + " " + dnTxt, pl, forma([sol], "SweptSolid"), [E(pre)], Math.min(a[1], b[1]), nv, { mapa: km });
        ligarMaterial(el, nomeM);
        /* o eletroduto leva o IfcCableCarrierSegmentType CONDUITSEGMENT, na estrutura
           IFC4 usual do conduíte: com o tipo só na ocorrência, chegou em
           "Bandejas de cabos" (ida e volta 08/10/2026) */
        if (km === "eletroduto") tipoMEP(ent, nomeM + " " + dnTxt, pre, el);
        if (km === "bandeja") tipoMEP(ent, nomeM + " " + dnTxt, pre, el);   /* P12: a eletrocalha também leva o tipo (CABLETRAYSEGMENT) */
        infoTrecho[t.id] = { el: el, pl: pl, L: Lg, t: t };
        var q = BI.quantidadeTrecho(t), area = ret ? t.larg * t.alt : Math.PI * raio * raio, per = ret ? 2 * (t.larg + t.alt) : 2 * Math.PI * raio;
        var qn = ent === "IFCPIPESEGMENT" ? "Qto_PipeSegmentBaseQuantities" : (ent === "IFCDUCTSEGMENT" ? "Qto_DuctSegmentBaseQuantities" : "Qto_CableCarrierSegmentBaseQuantities");
        qto(el, qn, [["Length", "L", t.comprimento], ["GrossCrossSectionArea", "A", area], ["OuterSurfaceArea", "A", ret ? q.quantidade : per * t.comprimento]]);
        propsBase(el, t.sistema, t.material, [["DN", "IFCLABEL", ret ? null : String(t.dn)], ["Largura", "IFCPOSITIVELENGTHMEASURE", ret ? t.larg : null], ["Altura", "IFCPOSITIVELENGTHMEASURE", ret ? t.alt : null],
          ["Aplicacao", "IFCLABEL", t.aplicacao], ["Inclinacao", "IFCREAL", t.inclinacao], ["Desnivel", "IFCLENGTHMEASURE", t.desnivel], ["ComprimentoPlanta", "IFCLENGTHMEASURE", t.comprimentoH],
          ["PN", "IFCLABEL", t.pn], ["Classe", "IFCLABEL", t.classe], ["Isolamento", "IFCLABEL", t.iso], ["Bitola", "IFCLABEL", t.bitola]]);
        if (!ret) pset(el, ent === "IFCPIPESEGMENT" ? "Pset_PipeSegmentTypeCommon" : (ent === "IFCDUCTSEGMENT" ? "Pset_DuctSegmentTypeCommon" : "Pset_CableCarrierSegmentTypeConduitSegment"), [["NominalDiameter", "IFCPOSITIVELENGTHMEASURE", t.dn / 1000]]);
        if (ent === "IFCPIPESEGMENT" && t.inclinacao > 0) pset(el, "Pset_PipeSegmentOccurrence", [["Gradient", "IFCPOSITIVERATIOMEASURE", t.inclinacao / 100]]);
        pset(el, "OrcaPRO_Quantitativo", [["Unidade", "IFCLABEL", q.unidade], ["Quantidade", "IFCREAL", q.quantidade], ["CodigoOrcamento", "IFCIDENTIFIER", cods[t.id] || null]]);
        if (cods[t.id]) ligarCodigos(el, [cods[t.id]], "SINAPI");
        origemPset(el, [["Modelador", "IFCLABEL", "B5"]]);
        el.comprimento = t.comprimento; el.inclinacao = t.inclinacao; el.volumeGeometria = r6(area * Lg);
        noSistema(t.sistema, el);
      });
      Rd.conexoes.forEach(function (c) {
        var S0 = BI.SISTEMAS[c.sistema] || {}, gr = S0.grupo, M = BI.MATERIAIS[c.material] || {};
        var km = gr === "eletrica" ? "conexaoEletroduto" : (gr === "bandeja" ? "conexaoBandeja" : (gr === "ar" ? "conexaoDuto" : "conexaoTubo")), ent = MAPA_REVIT[km].ifc;   /* P12: eletrocalha */
        var CXE = gr === "eletrica" || gr === "bandeja";
        var pre = (CXE ? CONEXAO_ELET : CONEXAO_TUBO)[c.tipo];
        if (!pre) { pre = "USERDEFINED"; if (c.tipo !== "luva") avisos.push("conexão " + c.id + " (" + c.tipo + "): sem PredefinedType IFC — foi como USERDEFINED"); }
        var nv = nivelDe(c.y), O = W2I([c.x, c.y, c.z], nv), r = raioConexao(c);
        /* CORPO SÓLIDO DE VARREDURA (SweptSolid), como o tubo, que o importador já
           lê: uma bolsa cilíndrica por ramo, do centro para o lado de cada
           trecho. A bola em Brep (a da tela) chegou no Revit 2027 SEM
           GEOMETRIA e na categoria "Linha de centro" (ida e volta 08/10/2026). */
        var nomeM = M.nome || c.material, itens = bolsasConexao(c, trechoPorId).map(function (d) {
          var di = cena2ifc(d), x = Math.abs(di[2]) < 0.9 ? norm(cross([0, 0, 1], di)) : [1, 0, 0];
          var s = extrudado(circulo(r), pos3(mul(di, -r), di, x), r + BOLSA * r);
          pintar(s, nomeM, parseInt(String(S0.cor).slice(1), 16)); return s;
        });
        var nomeC = (c.nome || c.tipo) + " DN " + c.dn + (c.dn2 ? " × " + c.dn2 : "");
        /* a conexão é DEDUZIDA a cada replay e o id dela (cx0, cx1…) muda quando
           a rede muda: o GlobalId sai do lugar + tipo + DN (reexportar não troca) */
        var sem = "cx:" + c.sistema + "@" + R(c.x) + "," + R(c.y) + "," + R(c.z) + ":" + c.tipo + ":" + c.dn + ":" + (c.dn2 || 0);
        var plC = placement(nv.pl, O);
        var el = peca(c.id, ent, nomeC + " (conexão automática)", nomeC, plC, forma(itens, "SweptSolid"), [E(pre)], c.y, nv, { semente: sem, mapa: km });
        el._pl = plC;
        ligarMaterial(el, nomeM);
        tipoMEP(ent, nomeC, pre, el);
        propsBase(el, c.sistema, c.material, [["Conexao", "IFCLABEL", c.nome], ["Tipo", "IFCIDENTIFIER", c.tipo], ["DN", "IFCLABEL", String(c.dn)], ["DN2", "IFCLABEL", c.dn2 ? String(c.dn2) : null],
          ["Aplicacao", "IFCLABEL", c.aplicacao], ["Trechos", "IFCLABEL", arr(c.ramos).join(", ")], ["Deduzida", "IFCBOOLEAN", true]]);
        pset(el, "OrcaPRO_Quantitativo", [["Unidade", "IFCLABEL", "un"], ["Quantidade", "IFCREAL", 1], ["CodigoOrcamento", "IFCIDENTIFIER", cods[c.id] || null]]);
        if (cods[c.id]) ligarCodigos(el, [cods[c.id]], "SINAPI");
        origemPset(el, [["Modelador", "IFCLABEL", "B5"]]);
        el.tipoConexao = c.tipo;
        infoCx[c.id] = { el: el, pl: el._pl };
        noSistema(c.sistema, el);
      });
      Rd.pecas.forEach(function (k) {
        var P = BI.PECAS[k.peca], S0 = BI.SISTEMAS[k.sistema] || {};
        if (!P) { avisos.push("peça " + k.id + " (" + k.peca + ") sem mapeamento IFC — ficou de fora"); return; }
        /* a classe vem do MAPA_REVIT (ralo e caixa sifonada → RALO_IFC =
           Peças hidrossanitárias no IMPORTADOR do Revit; caixa elétrica →
           IfcJunctionBox); a classe específica do IFC4 (IfcWasteTerminal
           FLOORTRAP…) segue no Pset */
        var km = PECA_MAPA[k.peca] || (P.sistemas[0] === "eletrica" ? "caixaEletrica" : "pecaHidro"), ent = MAPA_REVIT[km].ifc;
        var pre = (km === "pecaHidro" && MAPA_REVIT[km].tipo) || PECA_IFC[k.peca] || "NOTDEFINED", eletr = P.sistemas[0] === "eletrica";
        /* IfcFlowTerminal não tem PredefinedType (9 atributos no IFC4) */
        var extraP = ent === "IFCFLOWTERMINAL" ? [] : [E(pre)];
        var nv = nivelDe(k.y), th = num(k.rotY, 0), sol, O;
        if (P.forma === "caixa") { O = W2I([k.x, k.y - P.hh / 2, k.z], nv); sol = extrudado(retangulo(P.w, P.d), pos3([0, 0, 0]), P.hh); }
        else { O = W2I([k.x, k.y - P.h, k.z], nv); sol = extrudado(circulo(P.r), pos3([0, 0, 0]), P.h); }
        var nomeM = eletr ? (k.material === "metalica" ? "Aço galvanizado (caixa elétrica)" : "PVC (caixa elétrica)") : "PVC";
        pintar(sol, nomeM, parseInt(String(eletr ? BI.COR_CAIXA_ELETRICA : S0.cor).slice(1), 16));
        var nomeP = P.nome + (k.dn && k.dn !== "-" ? " " + String(k.dn).replace(/x/g, "×") : "");
        var plK = placement(nv.pl, O, [0, 0, 1], [Math.cos(th), Math.sin(th), 0]);
        var el = peca(k.id, ent, nomeP + " (" + k.id + ")", nomeP, plK, forma([sol], "SweptSolid"), extraP, k.y, nv, { mapa: km });
        infoPeca[k.id] = { el: el, pl: plK };
        ligarMaterial(el, nomeM);
        /* P1-acab: o ralo leva o IfcXxxType (o importador tenta a classe do tipo quando a da peça dá Modelos genéricos) */
        if (km === "pecaHidro" && ent !== "IFCFLOWTERMINAL") tipoMEP(ent, nomeP, pre, el);
        var cl4 = P.ifc ? ({ IFCWASTETERMINAL: "IfcWasteTerminal", IFCJUNCTIONBOX: "IfcJunctionBox", IFCSANITARYTERMINAL: "IfcSanitaryTerminal" }[P.ifc] || String(P.ifc)) : null;
        propsBase(el, k.sistema, k.material, [["Peca", "IFCLABEL", P.nome], ["ClasseIFC4", "IFCLABEL", cl4 ? cl4 + (PECA_IFC[k.peca] ? "." + PECA_IFC[k.peca] : "") : null],
          ["DN", "IFCLABEL", k.dn && k.dn !== "-" ? String(k.dn) : null], ["Aplicacao", "IFCLABEL", k.aplicacao],
          ["AlturaDoPiso", "IFCLENGTHMEASURE", k.alturaPiso], ["TubosLigados", "IFCINTEGER", (Rd.ligacoesPeca || {})[k.id] || 0]]);
        pset(el, "OrcaPRO_Quantitativo", [["Unidade", "IFCLABEL", "un"], ["Quantidade", "IFCREAL", 1], ["CodigoOrcamento", "IFCIDENTIFIER", cods[k.id] || null]]);
        if (cods[k.id]) ligarCodigos(el, [cods[k.id]], "SINAPI");
        origemPset(el, [["Modelador", "IFCLABEL", "B5"]]);
        noSistema(k.sistema, el);
      });
      /* P12: ACESSÓRIOS DE TUBO (registro, válvula) — IfcValve (+ IfcValveType: o arquivo de exportação
         do Revit dá "Acessórios do tubo → IfcValveType" e o importador leva IfcValve(Type) para
         OST_PipeAccessory — revit-ifc, IFCCategoryUtil.cs, lido em 09/10/2026). Corpo = o cilindro
         face a face no eixo do tubo (o volante fica na família). */
      arr(Rd.acessorios).forEach(function (a) {
        var A = BI.ACESSORIOS[a.acessorio], S0 = BI.SISTEMAS[a.sistema] || {}, V = A.variantes[a.variante] || {};
        var pa = [a.a.x, a.a.y, a.a.z], u = norm([a.dir.x, a.dir.y, a.dir.z]), xs = Math.abs(u[1]) > 0.99 ? [1, 0, 0] : norm(cross([0, 1, 0], u)), nv = nivelDe(a.centro.y);
        var pl = placement(nv.pl, W2I(pa, nv), cena2ifc(u), cena2ifc(xs));
        var r = Math.max(num(a.dn, 25) / 2000 * 1.7, 0.012), sol = extrudado(circulo(r), pos3([0, 0, 0]), a.comprimento);
        var nomeM = V.material === "latao" ? "Latão" : (V.material === "bronze" ? "Bronze" : "PVC"); pintar(sol, nomeM, parseInt(String(S0.cor).slice(1), 16));
        var nomeA = A.nome + " DN " + a.dn;
        var el = peca(a.id, MAPA_REVIT.acessorioTubo.ifc, nomeA + " (" + a.id + ")", nomeA + " — " + V.rot, pl, forma([sol], "SweptSolid"), [E(A.pre)], a.centro.y, nv, { mapa: "acessorioTubo" });
        ligarMaterial(el, nomeM);
        tipoMEP("IFCVALVE", A.nome + " — " + V.rot, A.pre, el);
        propsBase(el, a.sistema, a.material, [["Acessorio", "IFCLABEL", A.nome], ["Variante", "IFCLABEL", V.rot], ["DN", "IFCLABEL", String(a.dn)], ["FaceAFace", "IFCPOSITIVELENGTHMEASURE", a.comprimento],
          ["Trechos", "IFCLABEL", [a.trecho, a.novoId].filter(function (x) { return x != null; }).join(", ")]]);
        pset(el, "OrcaPRO_Quantitativo", [["Unidade", "IFCLABEL", "un"], ["Quantidade", "IFCREAL", 1], ["CodigoOrcamento", "IFCIDENTIFIER", cods[a.id] || null]]);
        if (cods[a.id]) ligarCodigos(el, [cods[a.id]], "SINAPI");
        origemPset(el, [["Modelador", "IFCLABEL", "P12"]]);
        infoAc[a.id] = { el: el, pl: pl, L: a.comprimento };
        noSistema(a.sistema, el);
      });
      /* ================= P12: PORTAS (IfcDistributionPort) e LIGAÇÕES (IfcRelConnectsPorts) =================
         Estrutura IFC4 usual (conferida num IFC exportado de referência): cada peça
         da rede leva as portas dela (IfcRelNests 'NestedPorts'), com o lugar RELATIVO ao da
         peça; cada encontro vira um IfcRelConnectsPorts entre as duas portas. O "Abrir IFC" do
         Revit 2027 NÃO recria as ligações nem as conexões nativas (LIMITACOES-IMPORTADOR-IFC.md):
         é para os outros programas (e a ida e volta pelo web-ifc) — não se tenta contornar o importador. */
      var portasDe = {}, ligadas = {}, nPortas = 0, nLig = 0;
      function tipoPorta(sis) { var g = (BI.SISTEMAS[sis] || {}).grupo; return g === "eletrica" || g === "bandeja" ? "CABLECARRIER" : (g === "ar" ? "DUCT" : "PIPE"); }
      function porta(info, local, sis, rot) {
        if (!info || !info.pl) return null;
        var l = portasDe[info.el.chave] || (portasDe[info.el.chave] = { el: info.el, lista: [] }), k = l.lista.length;
        var g = guid(semente + "|porta:" + info.el.chave + ":" + (rot || k));
        var p = w("IFCDISTRIBUTIONPORT", [S(g), OH, S("Port_" + info.el.chave + "_" + k), S("Flow"), "$", ref(placement(info.pl, local)), "$", E("SOURCEANDSINK"), E(tipoPorta(sis)), E(SISTEMA_IFC[sis] || "NOTDEFINED")]);
        var o = { ent: p, guid: g }; l.lista.push(o); nPortas++;
        return o;
      }
      function ligar(a, b) {
        if (!a || !b) return;
        var k = a.guid < b.guid ? a.guid + "|" + b.guid : b.guid + "|" + a.guid; if (ligadas[k]) return; ligadas[k] = 1;
        w("IFCRELCONNECTSPORTS", [G("ligaporta:" + k), OH, S(k), S("Flow"), ref(a.ent), ref(b.ent), "$"]); nLig++;
      }
      var pontaPorta = {};   /* "trecho:0|1" → a porta da ponta (uma só por ponta) */
      function portaPonta(tid, lado) {
        var k = tid + ":" + lado; if (pontaPorta[k]) return pontaPorta[k];
        var ti = infoTrecho[tid]; if (!ti) return null;
        return (pontaPorta[k] = porta(ti, lado ? [0, 0, ti.L] : [0, 0, 0], ti.t.sistema, lado ? "fim" : "inicio"));
      }
      function pontaPerto(tid, p) {
        var ti = infoTrecho[tid]; if (!ti) return null;
        var d0 = Math.hypot(ti.t.p1.x - p.x, ti.t.p1.y - p.y, ti.t.p1.z - p.z), d1 = Math.hypot(ti.t.p2.x - p.x, ti.t.p2.y - p.y, ti.t.p2.z - p.z);
        if (Math.min(d0, d1) > 0.035) return null;
        return d0 <= d1 ? 0 : 1;
      }
      var usadaPonta = {};
      Rd.conexoes.forEach(function (c) {
        var ci = infoCx[c.id]; if (!ci) return;
        arr(c.ramos).forEach(function (tid) { var lado = pontaPerto(tid, c); if (lado == null) return; usadaPonta[tid + ":" + lado] = 1; ligar(portaPonta(tid, lado), porta(ci, [0, 0, 0], c.sistema, tid)); });
      });
      Rd.ligacoes.forEach(function (lg) {
        var lado = pontaPerto(lg.trecho, lg); if (lado == null) return;
        var alvo = null, sis = (infoTrecho[lg.trecho] || {}).t ? infoTrecho[lg.trecho].t.sistema : null;
        if (lg.tipo === "peca") alvo = infoPeca[lg.alvo] ? porta(infoPeca[lg.alvo], [0, 0, 0], sis, lg.trecho) : null;
        else if (lg.tipo === "acessorio") { var ai = infoAc[lg.famInst]; if (ai) alvo = porta(ai, /:s$/.test(lg.alvo) ? [0, 0, ai.L] : [0, 0, 0], sis, lg.alvo); }
        else if (lg.tipo === "aparelho") {
          var fi = famIfc[lg.famInst], kc = String(lg.alvo).split(":").slice(1).join(":");
          var kk = fi && arr(fi.av.conectores).filter(function (k) { return k.id === kc; })[0];
          if (fi && kk) alvo = porta(fi, [kk.x, -kk.z, kk.y], sis, lg.alvo);
        }
        if (alvo) { usadaPonta[lg.trecho + ":" + lado] = 1; ligar(portaPonta(lg.trecho, lado), alvo); }
      });
      /* emenda sem peça (eletrocalha em linha: a emenda está no metro) — as duas pontas, direto */
      var pontas = [];
      Rd.trechos.forEach(function (t) { [0, 1].forEach(function (lado) { if (!usadaPonta[t.id + ":" + lado]) pontas.push({ t: t, lado: lado, p: lado ? t.p2 : t.p1 }); }); });
      pontas.forEach(function (a, i) {
        for (var j = i + 1; j < pontas.length; j++) {
          var b = pontas[j]; if (b.t.id === a.t.id || b.t.sistema !== a.t.sistema) continue;
          if (Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y, a.p.z - b.p.z) <= 0.02) ligar(portaPonta(a.t.id, a.lado), portaPonta(b.t.id, b.lado));
        }
      });
      /* as pontas soltas e os pontos de aparelho sem tubo também têm porta (o "Mostrar desconexões" de quem abrir) */
      Rd.pontasLivres.forEach(function (p) { var lado = pontaPerto(p.trecho, p); if (lado != null) portaPonta(p.trecho, lado); });
      Object.keys(portasDe).forEach(function (k) {
        var l = portasDe[k];
        w("IFCRELNESTS", [G("ninhoportas:" + k), OH, S("NestedPorts"), S("Flow"), ref(l.el.ent), L(l.lista.map(function (o) { return ref(o.ent); }))]);
      });
      resumoPortas = { portas: nPortas, ligacoes: nLig, pecas: Object.keys(portasDe).length };
      /* um IfcDistributionSystem por sistema, com as peças dele, servindo a edificação */
      ordemS.forEach(function (s) {
        var S0 = BI.SISTEMAS[s] || { nome: s, abrev: s };
        var sy = w("IFCDISTRIBUTIONSYSTEM", [G("sistema:" + s), OH, S(S0.nome), "$", S("Sistema " + S0.abrev + " do OrçaPRO"), S(S0.abrev), E(SISTEMA_IFC[s] || "NOTDEFINED")]);
        w("IFCRELASSIGNSTOGROUP", [G("grupo:" + s), OH, "$", "$", L(grupos[s].map(ref)), "$", ref(sy)]);
        w("IFCRELSERVICESBUILDINGS", [G("serve:" + s), OH, "$", "$", ref(sy), L([ref(edificio)])]);
        resumoSistemas.push({ sistema: s, nome: S0.nome, n: grupos[s].length, guid: guid(semente + "|sistema:" + s) });
      });
    }

    /* o que a tela tem e o IFC não leva (não é peça): diz, não some calado */
    if (arr(st.anotacoes).length) avisos.push(arr(st.anotacoes).length + " anotação(ões) do editor não vão no IFC (são notas da tela, não peças)");
    if (arr(st.cotas).length) avisos.push(arr(st.cotas).length + " cota(s) do modelador não vão no IFC (são desenho da tela; refaça as cotas no programa que abrir o IFC)");

    /* ================= P1-D: o REGISTRO no IFC — Psets, Qtos e TIPOS =================
     * Cada parâmetro com `ifc` vai no Pset/Qto que o registro diz, na medida
     * IFC do dado dele; o que o usuário gravou sem lugar próprio vai no
     * Pset_OrcaPRO (o parâmetro do projeto, no Pset_OrcaPRO_Projeto). Quantidade
     * (Qto_*) fica sempre na ocorrência; propriedade de TIPO vai no
     * IfcTypeObject (HasPropertySets), na estrutura IFC4 usual — e a ocorrência
     * que já levava aquela propriedade continua levando, com o mesmo valor. */
    var TIPO_PROP = { "Pset_WallCommon.IsExternal": "IFCBOOLEAN", "OrcaPRO_Quantitativo.CodigoOrcamento": "IFCIDENTIFIER", "Pset_RailingCommon.Height": "IFCPOSITIVELENGTHMEASURE",
                      "Pset_StairCommon.NumberOfRiser": "IFCCOUNTMEASURE", "Pset_StairCommon.NumberOfTreads": "IFCCOUNTMEASURE", "Pset_StairCommon.RiserHeight": "IFCPOSITIVELENGTHMEASURE", "Pset_StairCommon.TreadLength": "IFCPOSITIVELENGTHMEASURE",
                      "Pset_StairFlightCommon.NumberOfRiser": "IFCCOUNTMEASURE", "Pset_StairFlightCommon.NumberOfTreads": "IFCCOUNTMEASURE", "Pset_StairFlightCommon.RiserHeight": "IFCPOSITIVELENGTHMEASURE", "Pset_StairFlightCommon.TreadLength": "IFCPOSITIVELENGTHMEASURE" };
    var MEDIDA_DADO = { comprimento: "IFCLENGTHMEASURE", area: "IFCAREAMEASURE", volume: "IFCVOLUMEMEASURE", massa: "IFCMASSMEASURE", inteiro: "IFCINTEGER", numero: "IFCREAL",
                        angulo: "IFCPLANEANGLEMEASURE", inclinacao: "IFCREAL", secao: "IFCREAL", simnao: "IFCBOOLEAN" };
    var QTD_DADO = { comprimento: "L", area: "A", volume: "V", massa: "W", inteiro: "C", secao: "A" };
    /* o valor do registro na unidade do IFC (SI): seção em cm² → m², ângulo em graus → radiano */
    var PARA_SI = { "cm²": 1e-4, "cm³": 1e-6, "cm⁴": 1e-8, "cm⁶": 1e-12 };
    function numIfc(d, v) {
      if (typeof v === "boolean" || v == null || v === "") return null;
      var x = Number(v); if (!isFinite(x)) return null;
      if (PARA_SI[d.un]) x *= PARA_SI[d.un];
      if (d.dado === "angulo") x *= Math.PI / 180;
      return x;
    }
    function propDoRegistro(d, v, nomePs, prop, tipoAntes) {
      var tipo = TIPO_PROP[nomePs + "." + prop] || tipoAntes || MEDIDA_DADO[d.dado] || "IFCLABEL";
      if (tipo === "IFCBOOLEAN") return { tipo: tipo, valor: typeof v === "string" ? (v === "Exterior" || v === "Sim") : !!v };
      if (/MEASURE|IFCREAL|IFCINTEGER/.test(tipo)) { var x = numIfc(d, v); return x == null ? null : { tipo: tipo, valor: x }; }
      return { tipo: tipo, valor: String(v) };
    }
    /* o PredefinedType do tipo: o da categoria (parede STANDARD), ou o das ocorrências quando é um só */
    var TIPO_PRE = { IFCWALLTYPE: "STANDARD", IFCCOLUMNTYPE: "COLUMN", IFCBEAMTYPE: "BEAM", IFCRAILINGTYPE: "GUARDRAIL", IFCDOORTYPE: "DOOR", IFCWINDOWTYPE: "WINDOW", IFCSTAIRFLIGHTTYPE: "STRAIGHT" };
    function preTipo(tp) { if (tp.classe === "IFCCOVERINGTYPE" && FORRO_IFC.tipo) return FORRO_IFC.tipo; if (TIPO_PRE[tp.classe]) return TIPO_PRE[tp.classe]; var ps = Object.keys(tp.pres); return ps.length === 1 ? ps[0] : "NOTDEFINED"; }
    var tiposReg = {}, ordemTiposReg = [], resumoTipos = [];
    todosEls.forEach(function (el) {
      var rp = el.reg; if (!rp) return;
      var tp = null;
      /* FORRO_IFC sem tipo (instancia, objectType): o forro sai sem IfcCoveringType — os parâmetros de tipo ficam na peça */
      if (rp.tipoId != null && rp.tipoId !== "" && !(el.entidade === "IFCCOVERING" && !FORRO_IFC.tipo)) {
        var kT = rp.categoria + ":" + rp.tipoId;
        tp = tiposReg[kT];
        if (!tp) {
          var fam = rp.porId.ELEM_FAMILY_PARAM ? rp.porId.ELEM_FAMILY_PARAM.valor : null;
          tp = tiposReg[kT] = { chave: kT, classe: el.entidade + "TYPE", categoria: rp.categoria, tipoId: String(rp.tipoId), nome: (fam ? fam + ":" : "") + (rp.tipoNome || rp.tipoId), els: [], pres: {}, primeiro: el };
          ordemTiposReg.push(kT);
        }
        if (tp.classe !== el.entidade + "TYPE") { avisos.push(el.chave + ": o tipo " + tp.nome + " já é " + tp.classe + " e a peça é " + el.entidade + " — foi sem tipo"); tp = null; }
        else { tp.els.push(el.ent); tp.pres[el.pre || "NOTDEFINED"] = 1; el.tipoIfc = tp.classe; el.tipoGuid = guid(semente + "|tipo:" + kT); el.tipoNome = tp.nome; }
      }
      rp.params.forEach(function (it) {
        var d = it.def, v = it.valor;
        if (v == null || v === "" || (d.ifc && d.ifc.atributo)) return;
        if (d.ifc && d.ifc.omitir != null && v === d.ifc.omitir) return;   /* P10: "Fase demolida" = Nenhum não vai (valor vazio não se grava) */
        var nomePs = d.ifc && d.ifc.pset ? d.ifc.pset : (it.usuario ? (d.fonte === "projeto" ? "Pset_OrcaPRO_Projeto" : "Pset_OrcaPRO") : null);
        if (!nomePs) return;
        var prop = d.ifc && d.ifc.prop ? d.ifc.prop : d.nome;
        if (/^Qto_/.test(nomePs)) {
          var x = numIfc(d, v), q = QTD_DADO[d.dado];
          if (x != null && q) por(conj(el, nomePs, true), prop, q, x, d.id);
          return;
        }
        var cjI = el.conj && el.conj.por[nomePs], antes = cjI ? cjI.props[prop] : null;
        var pv = propDoRegistro(d, v, nomePs, prop, antes ? antes.tipo : null); if (!pv) return;
        if (d.lado === "tipo" && tp) {
          if (tp.primeiro === el) por(conj(tp, nomePs, false), prop, pv.tipo, pv.valor, d.id);
          if (antes) por(cjI, prop, pv.tipo, pv.valor, d.id);
        } else por(conj(el, nomePs, false), prop, pv.tipo, pv.valor, d.id);
      });
    });
    metalFinal();   /* METÁLICA: furos dos perfis (IfcOpeningElement) e, na saída de fabricação, os conjuntos (IfcElementAssembly) */
    /* um IfcTypeObject por tipo usado (IfcWallType, IfcSlabType, IfcColumnType…), com
       os parâmetros de TIPO em HasPropertySets e o IfcRelDefinesByType das ocorrências */
    ordemTiposReg.forEach(function (k) {
      var tp = tiposReg[k], hps = escreverConjuntos(tp, "tipo:" + k, false);
      var a = [G("tipo:" + k), OH, S(tp.nome), "$", "$", hps.length ? L(hps.map(ref)) : "$", "$", S(tp.tipoId), "$", E(preTipo(tp))];
      if (tp.classe === "IFCDOORTYPE" || tp.classe === "IFCWINDOWTYPE") a.push(E("NOTDEFINED"), "$", "$");
      if (tp.classe === "IFCFURNITURETYPE") a.splice(9, 0, E("NOTDEFINED"));   /* MARCENARIA: o IfcFurnitureType tem AssemblyPlace antes do PredefinedType */
      tp.ent = w(tp.classe, a);
      w("IFCRELDEFINESBYTYPE", [G("rdtipo:" + k), OH, "$", "$", L(tp.els.map(ref)), ref(tp.ent)]);
      resumoTipos.push({ chave: k, classe: tp.classe, nome: tp.nome, categoria: tp.categoria, tipoId: tp.tipoId, guid: guid(semente + "|tipo:" + k), n: tp.els.length, predefinido: preTipo(tp),
                         propriedades: arr(tp.conj && tp.conj.ordem).map(function (nm) { return nm + ":" + tp.conj.por[nm].ordem.join(","); }) });
    });
    /* os conjuntos de cada peça (os GlobalIds de sempre: pset:/qto:/rdp:/rdq: + chave + nome) */
    todosEls.forEach(function (el) { escreverConjuntos(el, el.chave, true); });

    /* ---- relações em lote: tipo de MEP, nível, material, código ---- */
    ordemTipos.forEach(function (k) {
      var tp = tiposMEP[k]; w("IFCRELDEFINESBYTYPE", [G("rdt:" + k), OH, "$", "$", L(tp.els.map(ref)), ref(tp.t)]);
    });
    niveis.forEach(function (nv) {
      if (nv.contidos.length) w("IFCRELCONTAINEDINSPATIALSTRUCTURE", [G("cont:" + nv.ent), OH, "$", "$", L(nv.contidos.map(ref)), ref(nv.ent)]);
      /* P2: os ambientes (IfcSpace) do nível, por agregação — estrutura IFC4 usual */
      if (arr(nv.espacos).length) w("IFCRELAGGREGATES", [G("espacos:" + (nv.id != null ? nv.id : nv.nome + "@" + nv.elevacao)), OH, "$", "$", ref(nv.ent), L(nv.espacos.map(ref))]);
    });
    /* P11: o terreno fica CONTIDO NO IfcSite (não num pavimento) */
    if (siteContidos.length) w("IFCRELCONTAINEDINSPATIALSTRUCTURE", [G("cont:site"), OH, "$", "$", L(siteContidos.map(ref)), ref(site)]);
    Object.keys(mats).forEach(function (k) {
      var m = mats[k]; if (m.elementos.length) w("IFCRELASSOCIATESMATERIAL", [G("mat:" + k), OH, "$", "$", L(m.elementos.map(ref)), ref(m.m)]);
    });
    Object.keys(usos).forEach(function (k) {
      var u = usos[k]; if (u.elementos.length) w("IFCRELASSOCIATESMATERIAL", [G("camadas:" + k), OH, "$", "$", L(u.elementos.map(ref)), ref(u.u)]);
    });
    Object.keys(refsCod).forEach(function (k) {
      var r = refsCod[k]; if (r.elementos.length) w("IFCRELASSOCIATESCLASSIFICATION", [G("cls:" + k), OH, "$", "$", L(r.elementos.map(ref)), ref(r.r)]);
    });

    var nomeArq = String(opts.arquivo || "modelo-orcapro.ifc");
    var iso = agora.toISOString().slice(0, 19);
    var cab = [
      "ISO-10303-21;", "HEADER;",
      "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1');",
      "FILE_NAME(" + S(nomeArq) + "," + S(iso) + ",(" + S(opts.autor || "Usuário OrçaPRO") + "),(" + S(opts.empresa || "OrçaPRO") + ")," + S("OrçaPRO IfcSaida 1.0") + "," + S("OrçaPRO " + (opts.versaoApp || "")) + ",'');",
      "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;"
    ];
    var texto = cab.concat(linhas).concat(["ENDSEC;", "END-ISO-10303-21;", ""]).join("\n");
    return { texto: texto, resumo: { porEntidade: porEnt, elementos: elementos, niveis: niveis.map(function (x) { return { nome: x.nome, elevacao: x.elevacao, n: x.contidos.length }; }), avisos: avisos, linhas: n,
                                     eixos: resumoEixos, sistemas: resumoSistemas, tipos: resumoTipos, portas: resumoPortas } };
  }

  var IfcSaida = { gerar: gerar, guid: guid, guidValido: guidValido, texto: S, real: R, cena2ifc: cena2ifc, ENTIDADE_CAT: ENTIDADE_CAT, MAT_EDITOR: MAT_EDITOR,
                   MAPA_REVIT: MAPA_REVIT, PECA_MAPA: PECA_MAPA, RALO_IFC: RALO_IFC, RALO_IFC_CANDIDATOS: RALO_IFC_CANDIDATOS, FORRO_IFC: FORRO_IFC, FORRO_IFC_VARIANTES: FORRO_IFC_VARIANTES, poligonoSimples: poligonoSimples, autointersecta: autointersecta, bolsasConexao: bolsasConexao, raioConexao: raioConexao, BOLSA: BOLSA };
  global.IfcSaida = IfcSaida;
  if (typeof module !== "undefined" && module.exports) module.exports = IfcSaida;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

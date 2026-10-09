/* =====================================================================
 * familiamalha.js — FAMÍLIA IMPORTADA (malha por tipo) — motor puro,
 *                   Node-testável. Prévia `?previa=modelador`.
 *
 * Pedido do Rogério (09/10/2026): "configurar o nosso BIM para reconhecer as
 * famílias que já existem no mercado e usar as próprias famílias — com todos
 * os parâmetros. Família de tipo, porta, janela, tudo. Tubulações, tudo."
 *
 * De onde a família vem:
 *   .opfam VERSÃO 2 — o plugin "OrçaPRO for Revit" converte uma pasta de .rfa
 *     (contrato abaixo: tipos, parâmetros, malha por tipo com materiais,
 *     linhas de planta, vão, conectores). Entra com TUDO.
 *   .rfa direto (js/cfb.js + daRfa): o fluxo PartAtom traz família,
 *     categoria, tipos e os parâmetros da tabela de tipos — a GEOMETRIA não
 *     (fluxos binários proprietários). Entra com uma CAIXA marcada
 *     "geometria pendente — converter pelo plugin OrçaPRO for Revit".
 *
 * A família importada é uma FAMÍLIA DE PLENO DIREITO do js/familia.js: os
 * parâmetros (nome sem espaço + `rotulo` original), os tipos com os valores,
 * Familia.avaliar resolve padrão → tipo → instância. O que muda é a
 * geometria: `geometria: "malha"` e a malha de cada TIPO mora fora da
 * família (registro em memória + IndexedDB + nuvem, `importada.ref`), porque
 * a lista de famílias da nuvem tem teto de 1 MiB e recusa lista dentro de
 * lista. Familia.avaliar chama `completar` (abaixo), que devolve os sólidos
 * "malha" (um por material), o vão, os conectores (pontos de ligação da
 * B5/P12), a luz da luminária, a caixa e as linhas da planta.
 *
 * ⚠ HONESTIDADE: o arquivo importado não traz a fórmula GEOMÉTRICA da família. Parâmetro de medida
 *   mudado (no tipo ou na instância) muda o VALOR e a QUANTIDADE; a forma 3D
 *   continua a do tipo importado — `avisos` diz isso, e a paleta mostra.
 *   Exceção que fazemos de verdade: o peitoril da janela (é só deslocar).
 * ⚠ NUNCA código SINAPI inventado: a família importada nasce sem código; o
 *   orçamento oferece as composições da classe da categoria (mapa SINAPI) e
 *   o que não tem composição fica pendente.
 *
 * CONTRATO .opfam v2 — o texto final é o docs/opfam-v2.md do repositório do
 * plugin (3.10.0, com os campos ➕ que ele acrescentou: valoresTexto, frente,
 * hospedagemRevit, vao.eixoParedeY/xMin/xMax, conector.sistemaRotulo/forma,
 * nomeIngles, os `dado` de grandeza). Resumo (campo a mais é aceito e guardado
 * em `importada.extras`):
 * { formato:"opfam", versao:2, origem:{arquivo, revit, exportadoEm, plugin},
 *   familia:{ nome, categoria:"OST_…", categoriaNome, hospedagem:"parede"|"piso"|"teto"|"face"|"livre"|"linha",
 *             corteVao, unidades:"m", eixoVertical:"Z" },
 *   parametros:[{ nome, grupo, lado:"tipo"|"instancia", dado, unidade, formula, compartilhado, guid, somenteLeitura }],
 *   tipos:[{ nome, valores:{param: valor SI}, malha:{ vertices:[x,y,z,…], indices:[i,j,k,…], faixas:[{material, inicio, contagem}] },
 *            linhas2d:{ planta:[x1,y1,x2,y2,…], elevacao:[…] }, vao:{largura, altura, peitoril}|null,
 *            conectores:[{x,y,z, dx,dy,dz, dominio:"tubo"|"duto"|"eletrico"|"eletroduto", sistema, diametro, largura, altura, fluxo}],
 *            caixa:{min:[x,y,z], max:[x,y,z]} }],
 *   materiais:[{nome, cor:"#rrggbb", transparencia, brilho, classe}], miniatura:"data:image/png;base64,…"|null, avisos:[] }
 * Metros, Z para cima, origem = ponto de inserção; família de parede: X ao
 * longo da parede, Y para fora da face. `faixas.inicio/contagem` contam
 * ÍNDICES (múltiplos de 3).
 *
 * EIXOS (contrato → OrçaPRO): o OrçaPRO é Y para cima (js/familia.js:
 * x ao longo da parede, y para cima, z para fora). A conversão é a MESMA
 * rotação do js/familiarevit.js (X_r = X, Y_r = −Z, Z_r = Y), na volta:
 *   x = X, y = Z, z = −Y
 * — rotação própria (não espelha a peça). Consequência: o "+Y para fora" do
 * contrato é o −z do OrçaPRO; a porta que o plugin exporta e o B6 devolve ao
 * Revit volta virada para o mesmo lado.
 * Teste: node tools/test-familiamalha.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(txt(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }

  /* ------------------------------------------------ CATEGORIA DO REVIT
   * cat  = a categoria do OrçaPRO (js/familia.js CATEGORIAS) — decide a
   *        biblioteca, o registro de parâmetros e a CLASSE do mapa SINAPI
   *        ("familia:<cat>", js/sinapimapa.js);
   * mapa = a chave do IfcSaida.MAPA_REVIT (a classe IFC que volta para a
   *        mesma categoria no Revit — a tabela conferida no arquivo de
   *        exportação de camadas IFC do Revit);
   * conectores = expõe os conectores como pontos de ligação (B5/P12);
   * luz = luminária (o dado da luz fica à mão para o render). */
  var CAT_OST = {
    OST_Doors: { cat: "porta", mapa: "porta", nome: "Portas" },
    OST_Windows: { cat: "janela", mapa: "janela", nome: "Janelas" },
    OST_StructuralColumns: { cat: "pilar", mapa: "pilar", nome: "Pilares estruturais", estrutural: true },
    OST_Columns: { cat: "pilar", mapa: "pilar", nome: "Pilares" },
    OST_StructuralFraming: { cat: "viga", mapa: "viga", nome: "Quadro estrutural", estrutural: true },
    OST_PlumbingFixtures: { cat: "loucas", mapa: "pecaHidro", nome: "Peças hidrossanitárias", conectores: true },
    OST_PlumbingEquipment: { cat: "equipamento", mapa: "generico", nome: "Equipamento hidráulico", conectores: true },
    OST_MechanicalEquipment: { cat: "equipamento", mapa: "generico", nome: "Equipamento mecânico", conectores: true },
    OST_PipeFitting: { cat: "conexao_tubo", mapa: "conexaoTubo", nome: "Conexões de tubo", conectores: true },
    OST_PipeAccessory: { cat: "acessorio_tubo", mapa: "acessorioTubo", nome: "Acessórios do tubo", conectores: true },
    OST_DuctFitting: { cat: "conexao_duto", mapa: "conexaoDuto", nome: "Conexões de duto", conectores: true },
    OST_DuctAccessory: { cat: "equipamento", mapa: "generico", nome: "Acessórios de duto", conectores: true },
    OST_DuctTerminal: { cat: "equipamento", mapa: "generico", nome: "Terminais de ar", conectores: true },
    OST_ConduitFitting: { cat: "conexao_eletroduto", mapa: "conexaoEletroduto", nome: "Conexões do conduite", conectores: true },
    OST_LightingFixtures: { cat: "luminaria", mapa: "luminaria", nome: "Luminárias", conectores: true, luz: true },
    OST_LightingDevices: { cat: "dispositivo_eletrico", mapa: "interruptor", nome: "Dispositivos de iluminação", conectores: true },
    OST_ElectricalFixtures: { cat: "dispositivo_eletrico", mapa: "tomada", nome: "Dispositivos elétricos", conectores: true },
    OST_ElectricalEquipment: { cat: "equipamento_eletrico", mapa: "quadro", nome: "Equipamento elétrico", conectores: true },
    OST_Furniture: { cat: "mobiliario", mapa: "generico", nome: "Mobiliário" },
    OST_FurnitureSystems: { cat: "mobiliario", mapa: "generico", nome: "Sistemas de mobiliário" },
    OST_Casework: { cat: "mobiliario", mapa: "generico", nome: "Marcenaria" },
    OST_SpecialityEquipment: { cat: "equipamento", mapa: "generico", nome: "Equipamento especializado" },
    OST_GenericModel: { cat: "generico", mapa: "generico", nome: "Modelos genéricos" },
    OST_StructuralFoundation: { cat: "estrutural", mapa: "generico", nome: "Fundações estruturais", estrutural: true },
    OST_Planting: { cat: "generico", mapa: "generico", nome: "Vegetação" },
    OST_Entourage: { cat: "generico", mapa: "generico", nome: "Entourage" },
    OST_Site: { cat: "generico", mapa: "generico", nome: "Terreno" }
  };
  /* o nome da categoria no PartAtom (inglês ou português) → OST */
  var NOME_OST = {
    "doors": "OST_Doors", "portas": "OST_Doors", "windows": "OST_Windows", "janelas": "OST_Windows",
    "structural columns": "OST_StructuralColumns", "pilares estruturais": "OST_StructuralColumns", "columns": "OST_Columns", "pilares": "OST_Columns",
    "structural framing": "OST_StructuralFraming", "quadro estrutural": "OST_StructuralFraming", "framing estrutural": "OST_StructuralFraming",
    "plumbing fixtures": "OST_PlumbingFixtures", "peças hidrossanitárias": "OST_PlumbingFixtures", "aparelhos hidrossanitários": "OST_PlumbingFixtures",
    "plumbing equipment": "OST_PlumbingEquipment", "equipamento hidráulico": "OST_PlumbingEquipment",
    "mechanical equipment": "OST_MechanicalEquipment", "equipamento mecânico": "OST_MechanicalEquipment",
    "pipe fittings": "OST_PipeFitting", "conexões de tubo": "OST_PipeFitting", "conexões do tubo": "OST_PipeFitting",
    "pipe accessories": "OST_PipeAccessory", "acessórios do tubo": "OST_PipeAccessory", "acessórios de tubo": "OST_PipeAccessory",
    "duct fittings": "OST_DuctFitting", "conexões de duto": "OST_DuctFitting", "duct accessories": "OST_DuctAccessory", "acessórios de duto": "OST_DuctAccessory",
    "air terminals": "OST_DuctTerminal", "terminais de ar": "OST_DuctTerminal",
    "conduit fittings": "OST_ConduitFitting", "conexões do conduite": "OST_ConduitFitting",
    "lighting fixtures": "OST_LightingFixtures", "luminárias": "OST_LightingFixtures", "lighting devices": "OST_LightingDevices", "dispositivos de iluminação": "OST_LightingDevices",
    "electrical fixtures": "OST_ElectricalFixtures", "dispositivos elétricos": "OST_ElectricalFixtures",
    "electrical equipment": "OST_ElectricalEquipment", "equipamento elétrico": "OST_ElectricalEquipment",
    "furniture": "OST_Furniture", "mobiliário": "OST_Furniture", "furniture systems": "OST_FurnitureSystems", "casework": "OST_Casework", "marcenaria": "OST_Casework",
    "specialty equipment": "OST_SpecialityEquipment", "equipamento especializado": "OST_SpecialityEquipment",
    "generic models": "OST_GenericModel", "modelos genéricos": "OST_GenericModel",
    "structural foundations": "OST_StructuralFoundation", "fundações estruturais": "OST_StructuralFoundation",
    "planting": "OST_Planting", "vegetação": "OST_Planting", "entourage": "OST_Entourage", "site": "OST_Site", "terreno": "OST_Site"
  };
  function infoCategoria(ost) { return CAT_OST[ost] || CAT_OST.OST_GenericModel; }

  /* --------------------------------------------------- SISTEMA DO CONECTOR
   * Os SISTEMAS da B5 (js/biminst.js). Conector de tubo com sistema
   * genérico (o "Fitting"/"Global" da conexão do Revit, "OtherPipe", vazio)
   * pega o sistema da INSTÂNCIA (parâmetro "Sistema da tubulação", padrão
   * Água fria, com aviso): o arquivo não diz o sistema, então a escolha fica
   * com quem modela, na cara. */
  var SISTEMAS_NOME = { agua_fria: "Água fria", agua_quente: "Água quente", esgoto: "Esgoto", ventilacao: "Ventilação", pluvial: "Pluvial" };
  var SISTEMA_GENERICO = "*tubo";
  function sistemaB5(dominio, sistema) {
    var d = txt(dominio).toLowerCase(), s = txt(sistema).toLowerCase().replace(/[\s_-]+/g, "");
    if (d === "eletrico" || d === "eletroduto" || d === "electrical" || d === "conduit") return "eletrica";
    if (d === "duto" || d === "duct") return "ar";
    if (d && d !== "tubo" && d !== "pipe") return null;
    if (/coldwater|aguafria|domesticcold|^af$/.test(s)) return "agua_fria";
    if (/hotwater|aguaquente|domestichot|^aq$/.test(s)) return "agua_quente";
    if (/sanit|esgoto|sewage|waste/.test(s)) return "esgoto";
    if (/vent/.test(s)) return "ventilacao";
    if (/storm|pluvial|rain/.test(s)) return "pluvial";
    return SISTEMA_GENERICO;
  }
  function sistemaPorNome(nome) {
    var n = txt(nome).trim().toLowerCase();
    for (var k in SISTEMAS_NOME) if (SISTEMAS_NOME.hasOwnProperty(k) && (k === n || SISTEMAS_NOME[k].toLowerCase() === n)) return k;
    return null;
  }

  /* --------------------------------------------------- PARÂMETROS */
  var RESERVADAS = { e: 1, ou: 1, nao: 1, sim: 1, verdadeiro: 1, falso: 1, se: 1, min: 1, max: 1, arred: 1, raiz: 1, abs: 1, teto: 1, piso: 1, sen: 1, cos: 1, tan: 1, pi: 1 };
  /* "Largura bruta" → "Largura_bruta" (o js/familia.js e o registro exigem
     nome sem espaço; a tela mostra o `rotulo` de volta) */
  function nomeSeguro(n, usados) {
    var s = txt(n).trim().replace(/[^A-Za-zÀ-ÿ0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (!s) s = "Parametro";
    if (/^[0-9]/.test(s)) s = "p_" + s;
    if (RESERVADAS[s.toLowerCase()]) s += "_";
    var b = s, i = 2;
    while (usados && usados[s.toLowerCase()]) s = b + "_" + (i++);
    if (usados) usados[s.toLowerCase()] = 1;
    return s;
  }
  /* o tipo de dado do Revit (nome PT/EN, ForgeTypeId ou o "typeOfParameter" do PartAtom) → js/familia.js TIPOS_DADO */
  function tipoDado(dado, unidade, valor) {
    var d = txt(dado).toLowerCase(), u = txt(unidade).toLowerCase();
    if (/yes\/?no|yesno|sim\/?n[aã]o|simnao|bool/.test(d)) return "simnao";
    /* o plugin 3.10 manda "opcao" (enumerado: o número + o rótulo em valoresTexto) e "medida"/"moeda" (número com unidade própria) */
    if (/^(opcao|op[cç][aã]o|enum|choice)$/.test(d)) return "texto";
    if (/^(medida|measure|moeda|currency)$/.test(d)) return "numero";
    /* as grandezas do contrato (docs/opfam-v2.md do plugin): número na unidade SI do campo `unidade` */
    if (/^(massa|densidade|forca|pressao|vazao|velocidade|potencia|potenciaaparente|tensao|corrente|fluxoluminoso|iluminancia|intensidadeluminosa|luminancia|temperatura|temperaturacor|frequencia|tempo)$/.test(d)) return "numero";
    if (/^(referencia|tipofamilia|imagem|url|classificacaocarga|outro)$/.test(d)) return "texto";
    if (/material/.test(d)) return "material";
    if (/integer|inteiro|^int$/.test(d)) return "inteiro";
    if (/text|texto|string|url|familytype|tipo de fam/.test(d)) return "texto";
    if (/area|área/.test(d) && !/sectionarea/.test(d)) return "area";
    if (/volume/.test(d)) return "volume";
    if (/angle|[aâ]ngulo|slope/.test(d)) return "angulo";
    if (/length|comprimento|diameter|di[aâ]metro|radius|raio|thickness|espessura|distance|dist[aâ]ncia|pipesize|ductsize|barsize/.test(d)) return "comprimento";
    if (/number|n[uú]mero|real|double|power|pot[eê]ncia|flux|fluxo|temperature|temperatura|flow|vaz[aã]o|current|corrente|voltage|tens[aã]o|illuminance|efficacy|wattage|luminous/.test(d)) return "numero";
    if (u === "m" || u === "mm" || u === "cm") return "comprimento";
    if (u === "m2" || u === "m²") return "area";
    if (u === "m3" || u === "m³") return "volume";
    if (typeof valor === "boolean") return "simnao";
    if (typeof valor === "number") return "numero";
    return "texto";
  }
  /* o grupo do Revit (nome, BuiltInParameterGroup "PG_…" ou GroupTypeId) → o rótulo PT-BR da paleta */
  var GRUPO_PT = { geometry: "Cotas", dimensions: "Cotas", constraints: "Restrições", materials: "Materiais e acabamentos", identitydata: "Dados de identidade",
    construction: "Construção", mechanical: "Mecânico", plumbing: "Hidráulica", electrical: "Elétrico", electricallighting: "Elétrico - iluminação", lighting: "Elétrico - iluminação",
    electricalloads: "Elétrico - cargas", structural: "Estrutural", structuralanalysis: "Análise estrutural", analysisresults: "Resultados da análise", graphics: "Gráficos",
    phasing: "Fases", text: "Texto", data: "Dados", ifcparameters: "Parâmetros IFC", general: "Outros", other: "Outros", invalid: "Outros", energyanalysis: "Análise de energia",
    mechanicalairflow: "Mecânico - fluxo", fireprotection: "Proteção contra incêndio", visibility: "Visibilidade" };
  function grupoPt(g) {
    var s = txt(g).trim(); if (!s) return "Outros";
    var k = s.replace(/^PG_/i, "").replace(/^autodesk\.parameter\.group:/i, "").replace(/-[\d.]+$/, "").replace(/[\s_]+/g, "").toLowerCase();
    return GRUPO_PT[k] || s;
  }
  function converterValor(td, v, unidade) {
    if (td === "simnao") return v === true || v === 1 || /^(1|sim|yes|true|verdadeiro)$/i.test(txt(v).trim());
    if (td === "texto" || td === "material") return v == null ? "" : String(v);
    var n = num(v, NaN);
    if (!isFinite(n)) return td === "inteiro" ? 0 : 0;
    /* ângulo vem em SI (radiano) pelo contrato; o OrçaPRO trabalha em graus */
    if (td === "angulo" && !/grau|deg|°/i.test(txt(unidade))) n = n * 180 / Math.PI;
    return td === "inteiro" ? Math.round(n) : r6(n);
  }

  /* ------------------------------------------------- EIXOS (ver cabeçalho) */
  function ponto(X, Y, Z) { return [X, Z, -Y]; }
  function caixaConv(cx) {
    if (!cx || !Array.isArray(cx.min) || !Array.isArray(cx.max)) return null;
    var a = ponto(num(cx.min[0], 0), num(cx.min[1], 0), num(cx.min[2], 0)), b = ponto(num(cx.max[0], 0), num(cx.max[1], 0), num(cx.max[2], 0));
    return { min: [r4(Math.min(a[0], b[0])), r4(Math.min(a[1], b[1])), r4(Math.min(a[2], b[2]))], max: [r4(Math.max(a[0], b[0])), r4(Math.max(a[1], b[1])), r4(Math.max(a[2], b[2]))] };
  }
  function caixaDeVertices(v) {
    if (!v || v.length < 3) return null;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i + 2 < v.length; i += 3) for (var k = 0; k < 3; k++) { if (v[i + k] < mn[k]) mn[k] = v[i + k]; if (v[i + k] > mx[k]) mx[k] = v[i + k]; }
    return { min: mn.map(r4), max: mx.map(r4) };
  }
  /* volume com sinal (teorema da divergência) — malha fechada e orientada para fora = volume */
  function volumeMalha(v, f, ini, n) {
    var s = 0, a = ini || 0, b = n == null ? f.length : a + n;
    for (var t = a; t + 2 < b; t += 3) {
      var i = f[t] * 3, j = f[t + 1] * 3, k = f[t + 2] * 3;
      s += (v[i] * (v[j + 1] * v[k + 2] - v[j + 2] * v[k + 1]) - v[i + 1] * (v[j] * v[k + 2] - v[j + 2] * v[k]) + v[i + 2] * (v[j] * v[k + 1] - v[j + 1] * v[k])) / 6;
    }
    return s;
  }

  /* fechada = cada aresta (sem sentido) está em exatamente DUAS faces; vértice repetido na mesma posição conta pelo lugar */
  function malhaFechada(f, v) {
    var ar = {}, n = 0, k, can = {}, id = [];
    /* o Revit repete o vértice por face/material: a aresta se reconhece pela POSIÇÃO (0,01 mm), não pelo índice */
    for (var i = 0; v && i + 2 < v.length; i += 3) { var kp = Math.round(v[i] * 1e5) + "," + Math.round(v[i + 1] * 1e5) + "," + Math.round(v[i + 2] * 1e5); if (can[kp] == null) can[kp] = i / 3; id.push(can[kp]); }
    for (var t = 0; t + 2 < f.length; t += 3) for (var e = 0; e < 3; e++) {
      var a = v ? id[f[t + e]] : f[t + e], b = v ? id[f[t + (e + 1) % 3]] : f[t + (e + 1) % 3]; if (a === b) continue;
      k = a < b ? a + "," + b : b + "," + a; ar[k] = (ar[k] || 0) + 1; n++;
    }
    if (!n) return false;
    var par = true;
    for (k in ar) if (ar.hasOwnProperty(k) && ar[k] % 2) { par = false; break; }
    /* aresta em 4 faces = dois sólidos encostados (batente e folha): continua fechada. Aresta solta (costura da
       triangulação do Revit numa curva) decide pela FÍSICA: o volume de malha fechada não muda ao transladar */
    if (par || !v) return par;
    var v0 = volumeMalha(v, f), v1 = 0;
    for (var t2 = 0; t2 + 2 < f.length; t2 += 3) {
      var P = [f[t2], f[t2 + 1], f[t2 + 2]].map(function (x) { return [v[x * 3] + 1, v[x * 3 + 1] + 2, v[x * 3 + 2] + 3]; });
      v1 += (P[0][0] * (P[1][1] * P[2][2] - P[1][2] * P[2][1]) - P[0][1] * (P[1][0] * P[2][2] - P[1][2] * P[2][0]) + P[0][2] * (P[1][0] * P[2][1] - P[1][1] * P[2][0])) / 6;
    }
    return Math.abs(v1 - v0) <= Math.max(1e-9, Math.abs(v0) * 0.01);
  }

  /* ------------------------------------------- REGISTRO DA GEOMETRIA (memória)
   * ref → { tipos: { <tipoId>: { v, f, faixas:[{material,inicio,contagem}], planta, elevacao } }, miniatura }
   * Quem enche: a importação (na hora) e a tela, ao carregar do IndexedDB/nuvem. */
  var GEO = {};
  function registrarGeometria(ref, geo) { if (ref && geo && geo.tipos) GEO[ref] = geo; return !!GEO[ref]; }
  function geometria(ref) { return ref && GEO.hasOwnProperty(ref) ? GEO[ref] : null; }
  function esquecerGeometria(ref) { delete GEO[ref]; }
  var FORMATO_GEO = "OrcaPRO-FamiliaGeometria";
  /* o arquivo da geometria (vai para o IndexedDB e a nuvem): JSON com as listas planas, 0,1 mm */
  function geometriaParaTexto(geo, famId) {
    var o = { formato: FORMATO_GEO, versao: 1, famId: txt(famId), miniatura: geo.miniatura || null, tipos: {} };
    Object.keys(geo.tipos || {}).forEach(function (k) {
      var t = geo.tipos[k];
      o.tipos[k] = { v: arr(t.v).map(r4), f: arr(t.f).slice(), faixas: arr(t.faixas), planta: arr(t.planta).map(r4), elevacao: arr(t.elevacao).map(r4) };
    });
    return JSON.stringify(o);
  }
  function geometriaDeTexto(s) {
    var o; try { o = JSON.parse(txt(s)); } catch (e) { return { ok: false, erro: "a geometria da família está ilegível" }; }
    if (!o || o.formato !== FORMATO_GEO) return { ok: false, erro: "o arquivo não é a geometria de uma família importada" };
    if (o.versao > 1) return { ok: false, erro: "geometria de família de versão mais nova — atualize o OrçaPRO" };
    return { ok: true, geometria: { tipos: o.tipos || {}, miniatura: o.miniatura || null }, famId: o.famId };
  }
  /* SHA-256 curto da geometria (identidade da ref) — o do js/opformato.js */
  function hashCurto(s) { var OF = dep("OpFormato", "./opformato.js"); return OF ? OF.sha256(s).slice(0, 12) : String(s.length); }

  /* ------------------------------------------------------- MALHA DO TIPO */
  function lerMalha(m, avisos, rot) {
    if (!m || typeof m !== "object") return null;
    var V = arr(m.vertices), I = arr(m.indices);
    if (!V.length || !I.length) return null;
    if (V.length % 3) { avisos.push(rot + ": a lista de vértices não é múltipla de 3 — geometria ignorada"); return null; }
    if (I.length % 3) { avisos.push(rot + ": a lista de índices não é múltipla de 3 — geometria ignorada"); return null; }
    var nv = V.length / 3, v = new Array(V.length), f = new Array(I.length), i;
    for (i = 0; i < nv; i++) {
      var X = num(V[3 * i], NaN), Y = num(V[3 * i + 1], NaN), Z = num(V[3 * i + 2], NaN);
      if (!fin(X) || !fin(Y) || !fin(Z)) { avisos.push(rot + ": vértice " + i + " não é número — geometria ignorada"); return null; }
      var p = ponto(X, Y, Z); v[3 * i] = p[0]; v[3 * i + 1] = p[1]; v[3 * i + 2] = p[2];
    }
    for (i = 0; i < I.length; i++) {
      var k = I[i];
      if (typeof k !== "number" || k < 0 || k >= nv || Math.floor(k) !== k) { avisos.push(rot + ": índice " + k + " fora da malha — geometria ignorada"); return null; }
      f[i] = k;
    }
    /* faixas: cobrem os índices por material; buraco ou sobra vira faixa sem material */
    var fx = arr(m.faixas).filter(function (q) { return q && fin(q.inicio) && fin(q.contagem) && q.contagem > 0 && q.inicio >= 0 && q.inicio % 3 === 0 && q.contagem % 3 === 0 && q.inicio + q.contagem <= f.length; })
      .map(function (q) { return { material: txt(q.material) || "Padrão", inicio: q.inicio, contagem: q.contagem }; })
      .sort(function (a, b) { return a.inicio - b.inicio; });
    var coberto = 0, ok = true;
    fx.forEach(function (q) { if (q.inicio !== coberto) ok = false; coberto = q.inicio + q.contagem; });
    if (!fx.length || !ok || coberto !== f.length) {
      if (fx.length) avisos.push(rot + ": as faixas de material não cobrem a malha inteira — a peça vai num material só");
      fx = [{ material: fx.length ? fx[0].material : "Padrão", inicio: 0, contagem: f.length }];
    }
    return { v: v, f: f, faixas: fx };
  }
  function linhasPlanta(l, eixoY) {
    var a = arr(l), out = [], e = eixoY || 0;
    for (var i = 0; i + 3 < a.length; i += 4) {
      var x1 = num(a[i], NaN), y1 = num(a[i + 1], NaN), x2 = num(a[i + 2], NaN), y2 = num(a[i + 3], NaN);
      if (fin(x1) && fin(y1) && fin(x2) && fin(y2)) out.push(r6(x1), r6(-(y1 - e)), r6(x2), r6(-(y2 - e)));   /* (X, Y) → (x, z = −(Y − eixo da parede)) */
    }
    return out;
  }

  /* -------------------------------------------- LER O .opfam VERSÃO 2
   * devolve { ok, erros, avisos, familia (a LEVE, vai para a biblioteca),
   *           geometria (a PESADA: registrar e guardar fora), meta } */
  function ehOpfamV2(o) { return !!o && typeof o === "object" && o.formato === "opfam"; }
  function lerOpfamV2(entrada, opts) {
    opts = opts || {};
    var o = entrada;
    if (typeof entrada === "string") { var s = entrada.charCodeAt(0) === 0xfeff ? entrada.slice(1) : entrada; try { o = JSON.parse(s); } catch (e) { return { ok: false, erros: ["o arquivo não é JSON (" + e.message + ")"] }; } }
    if (!o || typeof o !== "object") return { ok: false, erros: ["o arquivo está vazio"] };
    if (o.formato !== "opfam") return { ok: false, erros: ["o arquivo não é uma família convertida pelo plugin (formato \"" + txt(o.formato) + "\")"] };
    if (!(o.versao >= 2)) return { ok: false, erros: ["versão " + txt(o.versao) + " do .opfam do plugin — esperada a 2"] };
    if (o.versao > 2) return { ok: false, erros: ["o .opfam é da versão " + o.versao + "; este OrçaPRO lê até a 2. Atualize o OrçaPRO."] };
    var F = o.familia || {}, erros = [], avisos = arr(o.avisos).map(function (a) { return "plugin: " + txt(a); });
    if (!txt(F.nome).trim()) erros.push("a família não tem nome");
    if (txt(F.unidades) && txt(F.unidades) !== "m") erros.push("unidades \"" + F.unidades + "\" — o contrato é em metros");
    if (txt(F.eixoVertical) && txt(F.eixoVertical).toUpperCase() !== "Z") erros.push("eixo vertical \"" + F.eixoVertical + "\" — o contrato é Z para cima");
    if (!arr(o.tipos).length) erros.push("a família não tem tipo");
    if (erros.length) return { ok: false, erros: erros };
    /* família 2D (anotação, etiqueta, detalhe — "ViewBased" no Revit): só parâmetros, nenhuma malha — não é peça do modelo */
    var semMalha = arr(o.tipos).every(function (t) { return !(t && t.malha && arr(t.malha.indices).length); });
    if (semMalha && (/^ViewBased/i.test(txt(F.hospedagemRevit)) || /Tags$/.test(txt(F.categoria))))
      return { ok: false, erros: ["\"" + txt(F.nome) + "\" é família 2D/anotação (" + (txt(F.categoriaNome) || txt(F.categoria)) + "): não é peça do modelo 3D"] };
    var ost = txt(F.categoria) || "OST_GenericModel", ic = CAT_OST[ost];
    if (!ic) avisos.push("categoria " + ost + " (" + txt(F.categoriaNome) + ") sem comportamento próprio aqui — entra como componente genérico");
    ic = ic || CAT_OST.OST_GenericModel;
    var hospOrig = txt(F.hospedagem) || "livre", hosp = hospOrig === "parede" ? "parede" : "livre";
    if (hospOrig !== "parede" && hospOrig !== "livre" && hospOrig !== "face") avisos.push("no Revit a família é hospedada em " + hospOrig + "; aqui ela entra LIVRE, no plano do nível");
    var corteVao = F.corteVao !== false;

    /* parâmetros: nome seguro + rótulo original */
    var usados = {}, mapaNome = {}, parametros = [];
    arr(o.parametros).forEach(function (p, i) {
      if (!p || !txt(p.nome).trim()) { avisos.push("parâmetro " + (i + 1) + " sem nome — ignorado"); return; }
      if (mapaNome.hasOwnProperty(txt(p.nome))) { avisos.push("parâmetro \"" + p.nome + "\" repetido — fica o primeiro"); return; }
      var nm = nomeSeguro(p.nome, usados), td = tipoDado(p.dado, p.unidade, null);
      mapaNome[txt(p.nome)] = nm;
      var q = { nome: nm, rotulo: txt(p.nome), tipoDado: td, escopo: p.lado === "instancia" ? "instancia" : "tipo", valor: null, grupo: grupoPt(p.grupo), importado: true };
      if (txt(p.unidade)) q.unidade = txt(p.unidade);
      if (txt(p.formula).trim()) q.formulaRevit = txt(p.formula);
      if (p.somenteLeitura || q.formulaRevit) q.somenteLeitura = true;
      if (p.compartilhado) q.compartilhado = true;
      if (txt(p.guid)) q.guid = txt(p.guid);
      if (txt(p.dado)) q.dadoRevit = txt(p.dado);
      if (txt(p.nomeIngles)) q.nomeIngles = txt(p.nomeIngles);   /* o nome do parâmetro embutido em inglês (Width, Wattage…) — acha a luz e as medidas em arquivo de outro idioma */
      parametros.push(q);
    });
    var porNome = {}; parametros.forEach(function (p) { porNome[p.nome] = p; });

    var materiais = {}; arr(o.materiais).forEach(function (m) { if (m && txt(m.nome)) materiais[txt(m.nome)] = { nome: txt(m.nome), cor: /^#[0-9a-f]{6}$/i.test(txt(m.cor)) ? txt(m.cor).toLowerCase() : "", transparencia: num(m.transparencia, 0), brilho: num(m.brilho, 0), classe: txt(m.classe) }; });

    var tipos = [], geo = { tipos: {}, miniatura: null }, idsUsados = {}, totalTri = 0, genericos = 0, abertas = 0, desviradas = 0;
    /* enumerado: o rótulo de cada número, juntado de TODOS os tipos (o plugin às vezes manda o texto só em alguns) */
    var rotEnum = {};
    arr(o.tipos).forEach(function (t) { Object.keys((t && t.valoresTexto) || {}).forEach(function (k) { var v = t.valores ? t.valores[k] : null; if (v != null && t.valoresTexto[k] != null) (rotEnum[k] = rotEnum[k] || {})[String(v)] = t.valoresTexto[k]; }); });
    arr(o.tipos).forEach(function (t, i) {
      var nomeT = txt(t && t.nome).trim() || ("Tipo " + (i + 1)), rot = "tipo \"" + nomeT + "\"";
      /* opts.idsTipo {nome do tipo → id}: a conversão que SUBSTITUI a família do .rfa mantém o id de cada tipo (as instâncias seguem) */
      var id = (opts.idsTipo && opts.idsTipo[nomeT.toLowerCase()]) || ("t" + (i + 1)); while (idsUsados[id]) id += "_"; idsUsados[id] = 1;
      var valores = {};
      Object.keys((t && t.valores) || {}).forEach(function (k) {
        var nm = mapaNome[k];
        if (!nm) {   /* valor de parâmetro que não foi declarado: declara (do tipo), sem perder */
          var v0 = t.valores[k], td0 = tipoDado("", "", v0);
          nm = nomeSeguro(k, usados); mapaNome[k] = nm;
          var q0 = { nome: nm, rotulo: k, tipoDado: td0, escopo: "tipo", valor: null, grupo: "Outros", importado: true, somenteLeitura: false };
          parametros.push(q0); porNome[nm] = q0;
          avisos.push(rot + ": o valor de \"" + k + "\" veio sem o parâmetro declarado — entrou como parâmetro do tipo");
        }
        /* enumerado (Função: 0 = "Interior"): vale o RÓTULO que o plugin manda em valoresTexto */
        var ehEnum = /^(opcao|op[cç][aã]o|enum|choice)$/i.test(txt(porNome[nm].dadoRevit)), vtx = t.valores[k];
        if (ehEnum && t.valoresTexto && t.valoresTexto[k] != null) vtx = t.valoresTexto[k];
        else if (ehEnum && rotEnum[k] && rotEnum[k][String(t.valores[k])] != null) vtx = rotEnum[k][String(t.valores[k])];
        valores[nm] = converterValor(porNome[nm].tipoDado, vtx, porNome[nm].unidade);
      });
      var malha = lerMalha(t && t.malha, avisos, rot);
      var eixoY0 = hosp === "parede" && t && t.vao && fin(num(t.vao.eixoParedeY, NaN)) ? num(t.vao.eixoParedeY, 0) : 0;
      if (malha && eixoY0) for (var iz = 2; iz < malha.v.length; iz += 3) malha.v[iz] = malha.v[iz] + eixoY0;   /* z = −(Y − eixo) */
      var caixa = malha ? caixaDeVertices(malha.v) : caixaConv(t && t.caixa);
      if (!malha && caixa && eixoY0) { caixa.min[2] += eixoY0; caixa.max[2] += eixoY0; }
      if (!malha && !caixa) avisos.push(rot + ": sem malha e sem caixa — vai uma caixa de 0,5 m marcando o lugar");
      var vao = null;
      if (hosp === "parede" && corteVao && t && t.vao && num(t.vao.largura, 0) > 0 && num(t.vao.altura, 0) > 0)
        vao = { largura: r6(num(t.vao.largura, 0)), altura: r6(num(t.vao.altura, 0)), peitoril: r6(num(t.vao.peitoril, 0)) };
      /* o eixo da parede no arquivo (vao.eixoParedeY; 0 nas portas da biblioteca) vira a origem do OrçaPRO; e o vão
         fora do centro (xMin/xMax do recorte real) anda junto com a peça (deslocX, que o BimEdit soma ao t do hospedeiro) */
      var eixoY = hosp === "parede" && t && t.vao && fin(num(t.vao.eixoParedeY, NaN)) ? num(t.vao.eixoParedeY, 0) : 0;
      if (vao && t.vao && fin(num(t.vao.xMin, NaN)) && fin(num(t.vao.xMax, NaN))) { var cxv = (num(t.vao.xMin, 0) + num(t.vao.xMax, 0)) / 2; if (Math.abs(cxv) > 1e-6) vao.deslocX = r6(cxv); }
      else if (hosp === "parede" && corteVao && (ic.cat === "porta" || ic.cat === "janela")) avisos.push(rot + ": porta/janela sem o vão no arquivo — não abre a parede");
      var conectores = [];
      arr(t && t.conectores).forEach(function (k, j) {
        if (!k) return;
        var sis = sistemaB5(k.dominio, k.sistema), d = num(k.diametro, 0), dn = 0;
        if (d > 0) { dn = d > 2 ? Math.round(d) : Math.round(d * 1000); if (d > 2) avisos.push(rot + ", conector " + (j + 1) + ": diâmetro " + d + " lido como milímetro (o contrato é em metro)"); }
        if (!sis) { avisos.push(rot + ", conector " + (j + 1) + ": domínio \"" + txt(k.dominio) + "\" não é ligação de tubo, duto ou eletroduto aqui — fica de fora"); return; }
        if (sis === SISTEMA_GENERICO) genericos++;
        var p = ponto(num(k.x, 0), num(k.y, 0) - eixoY, num(k.z, 0)), dd = ponto(num(k.dx, 0), num(k.dy, 0), num(k.dz, 0));
        var c = { id: "c" + (j + 1), nome: ((sis !== SISTEMA_GENERICO && txt(k.sistemaRotulo)) || SISTEMAS_NOME[sis] || (sis === "eletrica" ? "Elétrica" : (sis === "ar" ? "Ar" : "Tubo"))) + " " + (j + 1), sistema: sis, sistemaRevit: txt(k.sistema), dominio: txt(k.dominio),
                  dn: dn, x: r6(p[0]), y: r6(p[1]), z: r6(p[2]), dx: r6(dd[0]), dy: r6(dd[1]), dz: r6(dd[2]) };
        if (num(k.largura, 0) > 0) c.largura = r6(num(k.largura, 0));
        if (num(k.altura, 0) > 0) c.altura = r6(num(k.altura, 0));
        if (k.fluxo != null && k.fluxo !== "") c.fluxo = k.fluxo;
        if (txt(k.forma)) c.forma = txt(k.forma);
        if (txt(k.descricao)) c.descricao = txt(k.descricao);
        conectores.push(c);
      });
      /* VOLUME só de malha FECHADA (toda aresta em exatamente duas faces). Fechada e virada para dentro: as faces
         são desviradas aqui (o IfcFacetedBrep precisa da normal para fora). Aberta (superfície, como a lente de uma
         luminária): sem volume — dizer um número seria inventar. */
      var fechada = malha ? malhaFechada(malha.f, malha.v) : false, vol = malha && fechada ? volumeMalha(malha.v, malha.f) : null, nTri = malha ? malha.f.length / 3 : 0;
      if (malha && fechada && vol < -1e-12) { for (var iv = 0; iv + 2 < malha.f.length; iv += 3) { var tmp = malha.f[iv + 1]; malha.f[iv + 1] = malha.f[iv + 2]; malha.f[iv + 2] = tmp; } vol = -vol; desviradas++; }
      if (malha && !fechada) abertas++;
      totalTri += nTri;
      var tipo = { id: id, nome: nomeT, valores: valores, vao: vao, conectores: conectores, caixa: caixa || { min: [-0.25, 0, -0.25], max: [0.25, 0.5, 0.25] },
                   volume: vol == null ? null : r6(Math.abs(vol)), triangulos: nTri, fechada: !!fechada };
      tipos.push(tipo);
      if (malha || (t && t.linhas2d)) geo.tipos[id] = { v: malha ? malha.v : [], f: malha ? malha.f : [], faixas: malha ? malha.faixas : [],
        planta: linhasPlanta(t && t.linhas2d && t.linhas2d.planta, eixoY0), elevacao: arr(t && t.linhas2d && t.linhas2d.elevacao).filter(fin) };
    });
    if (abertas) avisos.push(abertas + " tipo(s) com malha ABERTA (superfície, não sólido): o volume não é medido — a quantidade da peça vai em unidade");
    if (desviradas) avisos.push(desviradas + " tipo(s) com a malha virada para dentro: as faces foram desviradas (o volume e o IFC saem certos)");
    /* parâmetro "número" que o arquivo preenche com TEXTO (a "Classificação de carga" do Revit vem como medida): vira texto, sem perder o valor */
    parametros.forEach(function (p) {
      if (!/^(numero|inteiro)$/.test(p.tipoDado)) return;
      var temTexto = false;
      arr(o.tipos).forEach(function (t0, i0) { var k0 = p.rotulo, v0 = t0 && t0.valores ? t0.valores[k0] : null; if (typeof v0 === "string" && v0.trim() && !isFinite(Number(v0.replace(",", ".")))) temTexto = true; });
      if (!temTexto) return;
      p.tipoDado = "texto";
      arr(o.tipos).forEach(function (t0, i0) { var v0 = t0 && t0.valores ? t0.valores[p.rotulo] : undefined; if (tipos[i0] && v0 !== undefined) tipos[i0].valores[p.nome] = v0 == null ? "" : String(v0); });
    });
    /* janela hospedada: o peitoril é parâmetro de INSTÂNCIA (o registro escreve inst.Peitoril) */
    if (hosp === "parede" && ic.cat === "janela" && tipos.some(function (t) { return t.vao; }) && !porNome.Peitoril) {
      var pp = { nome: "Peitoril", rotulo: "Peitoril", tipoDado: "comprimento", escopo: "instancia", valor: (tipos[0].vao || {}).peitoril || 0, grupo: "Restrições", importado: true, sintetico: true };
      parametros.push(pp); porNome.Peitoril = pp;
      tipos.forEach(function (t) { if (t.vao) t.valores.Peitoril = t.vao.peitoril; });
    }
    /* família BASEADA EM FACE: no arquivo, Z é a normal da face (o plugin coloca a peça na face de cima de um piso).
       Aqui ela entra livre e a pessoa diz em que face ela vai: Piso (Z para cima), Parede (Z sai da parede — o
       lavatório suspenso) ou Teto (Z para baixo — luminária de embutir, chuveiro de teto), e a Elevação de
       instalação. O padrão vem da categoria e do nome; a altura do teto e da parede é dita no aviso, não escondida. */
    var faceInfo = null;
    if (hospOrig === "face") {
      var nm0 = txt(F.nome), fPad = /OST_Lighting(Fixtures|Devices)/.test(ost) || /teto|ceiling|forro/i.test(nm0) ? "Teto" : (/wall|parede|suspens|mounted/i.test(nm0) ? "Parede" : "Piso");
      var ePad = fPad === "Teto" ? 2.5 : 0;
      parametros.push({ nome: "Face_hospedeira", rotulo: "Face hospedeira", tipoDado: "texto", escopo: "instancia", valor: fPad, grupo: "Restrições", opcoes: ["Piso", "Parede", "Teto"], importado: true, sintetico: true });
      parametros.push({ nome: "Elevacao_instalacao", rotulo: "Elevação de instalação", tipoDado: "comprimento", escopo: "instancia", valor: ePad, grupo: "Restrições", importado: true, sintetico: true });
      porNome.Face_hospedeira = parametros[parametros.length - 2]; porNome.Elevacao_instalacao = parametros[parametros.length - 1];
      faceInfo = fPad;
      avisos.push("família baseada em face: entra na face \"" + fPad + "\"" + (fPad === "Teto" ? " a 2,50 m do nível" : (fPad === "Parede" ? " na altura do nível" : "")) + " — troque em Propriedades › Face hospedeira e Elevação de instalação");
    }
    if (genericos && !porNome.Sistema_da_tubulacao) {
      var ps = { nome: "Sistema_da_tubulacao", rotulo: "Sistema da tubulação", tipoDado: "texto", escopo: "instancia", valor: SISTEMAS_NOME.agua_fria, grupo: "Hidráulica",
                 opcoes: Object.keys(SISTEMAS_NOME).map(function (k) { return SISTEMAS_NOME[k]; }), importado: true, sintetico: true };
      parametros.push(ps); porNome[ps.nome] = ps;
      avisos.push(genericos + " conector(es) de tubo sem sistema definido no Revit (conexão genérica): assumem Água fria — troque em Propriedades › Sistema da tubulação");
    }
    /* valor PADRÃO de cada parâmetro = o do 1º tipo (o tipo dá o resto) */
    parametros.forEach(function (p) {
      if (p.valor != null) return;
      var t0 = tipos.filter(function (t) { return t.valores.hasOwnProperty(p.nome); })[0];
      p.valor = t0 ? t0.valores[p.nome] : (p.tipoDado === "simnao" ? false : (p.tipoDado === "texto" || p.tipoDado === "material" ? "" : 0));
    });
    var mini = typeof o.miniatura === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(o.miniatura) ? o.miniatura : null;
    var extras = {}; Object.keys(o).forEach(function (k) { if (["formato", "versao", "origem", "familia", "parametros", "tipos", "materiais", "miniatura", "avisos"].indexOf(k) < 0) extras[k] = o[k]; });
    var extrasFam = {}; Object.keys(F).forEach(function (k) { if (["nome", "categoria", "categoriaNome", "hospedagem", "corteVao", "unidades", "eixoVertical"].indexOf(k) < 0) extrasFam[k] = F[k]; });
    var fam = montarFamilia({ nome: txt(F.nome).trim(), ost: ost, ic: ic, categoriaNome: txt(F.categoriaNome), hosp: hosp, hospOrig: hospOrig, corteVao: corteVao,
      parametros: parametros, tipos: tipos, materiais: materiais, origem: o.origem || {}, formato: "opfam", versao: 2, avisos: avisos, extras: extras, extrasFamilia: extrasFam, geometriaPendente: false,
      triangulos: totalTri, id: opts.id, face: faceInfo });
    geo.miniatura = mini;
    finalizarRef(fam, geo, mini);
    return { ok: true, erros: [], avisos: avisos, familia: fam, geometria: geo, meta: { origem: o.origem || {} } };
  }
  /* a família LEVE do OrçaPRO (o que vai para a biblioteca) */
  function montarFamilia(d) {
    var id = d.id || ("fimp-" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36));
    var fam = {
      id: id, nome: d.nome, categoria: d.ic.cat, descricao: (d.categoriaNome || d.ic.nome) + " — família importada" + (d.formato === "rfa" ? " do .rfa" : " (plugin OrçaPRO for Revit)"),
      hospedagem: d.hosp, geometria: "malha",
      importada: { formato: d.formato, versao: d.versao, origem: d.origem, categoriaRevit: d.ost, categoriaNome: d.categoriaNome || d.ic.nome, mapaIfc: d.ic.mapa,
                   hospedagemRevit: d.hospOrig, face: d.face || null, corteVao: d.corteVao, materiais: d.materiais, avisos: d.avisos.slice(0, 40), geometriaPendente: !!d.geometriaPendente,
                   triangulos: d.triangulos || 0, estrutural: !!d.ic.estrutural, conectores: !!d.ic.conectores, luz: !!d.ic.luz, ref: "", bytes: 0 },
      parametros: d.parametros, tipos: d.tipos, solidos: [],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: d.nome }
    };
    if (d.extras && Object.keys(d.extras).length) fam.importada.extras = d.extras;
    if (d.extrasFamilia && Object.keys(d.extrasFamilia).length) fam.importada.extrasFamilia = d.extrasFamilia;
    /* pilar e viga: o quantitativo é o VOLUME da malha do tipo (concreto em m³) — sem malha, unidade */
    if (d.ic.estrutural && (d.ic.cat === "pilar" || d.ic.cat === "viga") && d.tipos.some(function (t) { return t.volume > 0; })) fam.quantitativo.unidade = "m3";
    return fam;
  }
  /* a referência da geometria = id + hash do conteúdo; miniatura pequena fica na família (a lista de famílias da nuvem tem teto) */
  var MINI_INLINE = 16 * 1024;
  function finalizarRef(fam, geo, mini) {
    var texto = geometriaParaTexto(geo, fam.id);
    fam.importada.ref = "famgeo:" + fam.id + ":" + hashCurto(texto);
    fam.importada.bytes = texto.length;
    if (mini && mini.length <= MINI_INLINE) fam.miniatura = mini;
    else fam.miniatura = null;
    registrarGeometria(fam.importada.ref, geo);
    return texto;
  }

  /* ------------------------------------------------ AVALIAR (js/familia.js)
   * chamada pelo Familia.avaliar depois de resolver os valores. Acrescenta à
   * `saida` o que vem da malha do tipo. */
  function completar(fam, tipo, instancia, saida) {
    var imp = fam.importada || {}, ic = infoCategoria(imp.categoriaRevit), inst = instancia || {};
    var tf = tipo && tipo.vao !== undefined ? tipo : (arr(fam.tipos).filter(function (t) { return t.id === (tipo && tipo.id); })[0] || arr(fam.tipos)[0] || {});
    var g = geometria(imp.ref), gt = g && g.tipos ? g.tipos[tf.id] : null, avisos = [];
    /* peitoril da janela: o único parâmetro de medida que muda a forma de verdade (a peça só desce/sobe) */
    var dy = 0, abertura = null;
    if (fam.hospedagem === "parede" && tf.vao) {
      var pe = tf.vao.peitoril;
      if (ic.cat === "janela") { var pv = saida.valores && saida.valores.Peitoril; if (fin(pv)) pe = pv; dy = pe - tf.vao.peitoril; }
      abertura = { largura: tf.vao.largura, altura: tf.vao.altura, peitoril: r6(pe) };
      if (tf.vao.deslocX) abertura.deslocX = tf.vao.deslocX;
    }
    var solidos = [], volume = 0, caixa = null, cores = imp.materiais || {};
    var fechadaT = tf.fechada !== false;   /* família gravada antes da marca: conta como fechada (era o que valia) */
    /* hospedada em parede SEM vão (tomada, arandela, quadro de embutir): no arquivo ela encosta na face da parede do
       template de origem (20 cm na tomada da biblioteca); aqui encosta na face da parede de VERDADE — a peça inteira de
       um lado do eixo anda até a face (Espessura_parede vem do hospedeiro). Peça que atravessa o eixo fica onde está. */
    var dzF = 0, cxT = tf.caixa, esp = num(inst.Espessura_parede, NaN);
    if (fam.hospedagem === "parede" && !tf.vao && cxT && fin(esp) && esp > 0) {
      if (cxT.max[2] <= 1e-6) dzF = -esp / 2 - cxT.max[2];
      else if (cxT.min[2] >= -1e-6) dzF = esp / 2 - cxT.min[2];
    }
    /* família baseada em FACE (ver lerOpfamV2): a face escolhida gira a peça (giro de verdade — o volume e o sentido das
       faces ficam) e a Elevação de instalação a sobe. Piso = como veio. */
    var face = imp.face ? txt(saida.valores && saida.valores.Face_hospedeira) || imp.face : null;
    if (face && face !== "Parede" && face !== "Teto") face = "Piso";
    if (imp.face) dy += num(saida.valores && saida.valores.Elevacao_instalacao, 0);
    var T = face === "Parede" ? function (x, y, z) { return [x, -z, y]; } : (face === "Teto" ? function (x, y, z) { return [x, -y, -z]; } : null);
    var vF = gt ? (T ? verticesGirados(gt, face, T) : gt.v) : null;
    if (gt && arr(gt.f).length) {
      gt.faixas.forEach(function (fx, i) {
        var f = gt.f.slice(fx.inicio, fx.inicio + fx.contagem), m = cores[fx.material] || {};
        solidos.push({ id: "m" + (i + 1), nome: fx.material, forma: "malha", v: vF, f: f, x: 0, y: r6(dy), z: r6(dzF), rot: 0, material: fx.material, cor: m.cor || "", transparencia: m.transparencia || 0,
                       /* com sinal: as partes de um sólido fechado somam o volume dele; malha aberta não tem volume (null, não 0) */
                       volume: fechadaT ? volumeMalha(vF, f) : null });
      });
      volume = fechadaT ? Math.abs(volumeMalha(vF, gt.f)) : null;
      var cb = caixaDeVertices(vF); caixa = { x0: cb.min[0], y0: cb.min[1] + dy, z0: cb.min[2] + dzF, x1: cb.max[0], y1: cb.max[1] + dy, z1: cb.max[2] + dzF };
    } else {
      /* sem malha (o .rfa direto, ou a geometria ainda não carregou): uma CAIXA no lugar, dita */
      var c0 = tf.caixa || { min: [-0.25, 0, -0.25], max: [0.25, 0.5, 0.25] };
      if (T) { var qa = T(c0.min[0], c0.min[1], c0.min[2]), qb = T(c0.max[0], c0.max[1], c0.max[2]); c0 = { min: [Math.min(qa[0], qb[0]), Math.min(qa[1], qb[1]), Math.min(qa[2], qb[2])], max: [Math.max(qa[0], qb[0]), Math.max(qa[1], qb[1]), Math.max(qa[2], qb[2])] }; }
      var dx = Math.max(0.01, c0.max[0] - c0.min[0]), dyb = Math.max(0.01, c0.max[1] - c0.min[1]), dz = Math.max(0.01, c0.max[2] - c0.min[2]);
      solidos.push({ id: "caixa", nome: "Caixa (geometria pendente)", forma: "caixa", x: r6((c0.min[0] + c0.max[0]) / 2), y: r6(c0.min[1] + dy), z: r6((c0.min[2] + c0.max[2]) / 2), rot: 0,
                     dx: r6(dx), dy: r6(dyb), dz: r6(dz), material: "Geometria pendente", cor: "#f59e0b" });
      caixa = { x0: c0.min[0], y0: c0.min[1] + dy, z0: c0.min[2], x1: c0.max[0], y1: c0.max[1] + dy, z1: c0.max[2] };
      avisos.push(imp.geometriaPendente ? "geometria pendente — a família veio do .rfa sem a forma 3D; converta pelo plugin OrçaPRO for Revit" :
                  (imp.ref && !g ? "a geometria desta família ainda não carregou neste aparelho — aparece uma caixa no lugar" : "este tipo veio sem malha — aparece uma caixa no lugar"));
    }
    /* conectores (pontos de ligação da B5): o genérico pega o sistema da instância */
    var sisInst = sistemaPorNome(saida.valores && saida.valores.Sistema_da_tubulacao) || "agua_fria";
    var conectores = ic.conectores ? arr(tf.conectores).map(function (k) {
      var P = T ? T(k.x, k.y, k.z) : [k.x, k.y, k.z], Dd = T ? T(k.dx, k.dy, k.dz) : [k.dx, k.dy, k.dz];
      return { id: k.id, nome: k.nome, sistema: k.sistema === SISTEMA_GENERICO ? sisInst : k.sistema, dn: k.dn, x: r6(P[0]), y: r6(P[1] + dy), z: r6(P[2] + dzF), dx: r6(Dd[0]), dy: r6(Dd[1]), dz: r6(Dd[2]), largura: k.largura, altura: k.altura };
    }) : [];
    /* o que muda só o VALOR: parâmetro de medida diferente do tipo (instância) — honesto e curto */
    var mudados = [];
    arr(fam.parametros).forEach(function (p) {
      if (p.sintetico || p.escopo !== "instancia" || !/^(comprimento|area|volume|angulo)$/.test(p.tipoDado)) return;
      var vt = tf.valores && tf.valores.hasOwnProperty(p.nome) ? tf.valores[p.nome] : p.valor, vi = saida.valores ? saida.valores[p.nome] : vt;
      if (fin(vi) && fin(vt) && Math.abs(vi - vt) > 1e-9) mudados.push(p.rotulo || p.nome);
    });
    if (mudados.length) avisos.push(mudados.join(", ") + ": mudou o valor e a quantidade; a forma 3D continua a do tipo importado");
    /* luminária: o dado da luz à mão (render) */
    var luz = null;
    if (ic.luz) {
      var vals = saida.valores || {}, rot = {};
      arr(fam.parametros).forEach(function (p) { rot[p.nome] = (p.rotulo || p.nome) + (p.nomeIngles ? " " + p.nomeIngles : "") + (p.dadoRevit ? " " + p.dadoRevit : ""); });   /* o `dado` do contrato (potencia, fluxoLuminoso, temperaturaCor) também acha */
      var achar = function (re) { var k = Object.keys(vals).filter(function (n) { return re.test(rot[n] || n) && fin(vals[n]); })[0]; return k ? vals[k] : null; };
      var acharTxt = function (re) { var k = Object.keys(vals).filter(function (n) { return re.test(rot[n] || n) && typeof vals[n] === "string" && vals[n].trim(); })[0]; return k ? vals[k] : null; };
      /* o que não veio no arquivo fica null (o Revit não exporta a intensidade/cor inicial: tipo "outro", sem valor) */
      luz = { potencia: achar(/pot[eê]ncia|wattage|watts?\b|power|carga aparente|apparent load/i), fluxo: achar(/fluxo|luminous flux|l[uú]mens?|intensity|intensidade/i),
              temperatura: achar(/temperatura|temperature|kelvin|\bcct\b/i), ies: acharTxt(/fotom[eé]tric|photometric|\.ies\b/i),
              posicao: caixa ? [r6((caixa.x0 + caixa.x1) / 2), r6(caixa.y0), r6((caixa.z0 + caixa.z1) / 2)] : [0, 0, 0] };
    }
    if (fam.quantitativo && fam.quantitativo.unidade === "m3" && saida.quantitativo) {
      if (gt && arr(gt.f).length && volume != null) saida.quantitativo.quantidade = r6(volume);
      else if (fin(tf.volume)) saida.quantitativo.quantidade = tf.volume;
      else { saida.quantitativo.unidade = "un"; saida.quantitativo.quantidade = 1; avisos.push("sem volume medido (malha aberta ou geometria pendente): a peça vai em unidade, não em m³"); }
    }
    saida.solidos = solidos;
    saida.abertura = abertura;
    saida.conectores = conectores;
    saida.caixa = caixa;
    /* linhas de planta: na Parede a "planta" do arquivo é a vista de frente — não serve, a planta sai da malha; no Teto, espelha em z */
    saida.linhasPlanta = gt && arr(gt.planta).length && face !== "Parede" ? (dzF || face === "Teto" ? gt.planta.map(function (q, i) { return i % 2 ? r6((face === "Teto" ? -q : q) + dzF) : q; }) : gt.planta) : null;
    saida.luz = luz;
    saida.avisos = (saida.avisos || []).concat(avisos);
    saida.importada = { categoriaRevit: imp.categoriaRevit, mapaIfc: imp.mapaIfc || ic.mapa, geometriaPendente: !!imp.geometriaPendente || !(gt && arr(gt.f).length),
                        volume: volume == null ? null : r6(volume), formato: imp.formato, estrutural: !!imp.estrutural, pset: psetDaFamilia(fam, saida.valores) };
    return saida;
  }
  /* os vértices do tipo girados para a face escolhida (guardados na própria geometria em memória: girar 80 mil vértices a cada
     avaliação travaria a tela; o arquivo gravado não leva isto — geometriaParaTexto só copia v, f, faixas, planta, elevacao) */
  function verticesGirados(gt, face, T) {
    var k = "_v" + face; if (gt[k]) return gt[k];
    var v = gt.v, o = new Array(v.length);
    for (var i = 0; i + 2 < v.length; i += 3) { var q = T(v[i], v[i + 1], v[i + 2]); o[i] = q[0]; o[i + 1] = q[1]; o[i + 2] = q[2]; }
    try { Object.defineProperty(gt, k, { value: o, enumerable: false, configurable: true }); } catch (e) { gt[k] = o; }
    return o;
  }
  /* os parâmetros que vão no Pset com o nome da família (IFC): [rótulo, tipo IFC, valor] */
  function psetDaFamilia(fam, valores) {
    var T = { comprimento: "IFCLENGTHMEASURE", area: "IFCAREAMEASURE", volume: "IFCVOLUMEMEASURE", angulo: "IFCREAL", numero: "IFCREAL", inteiro: "IFCINTEGER", simnao: "IFCBOOLEAN", texto: "IFCLABEL", material: "IFCLABEL" };
    var out = [];
    arr(fam && fam.parametros).forEach(function (p) {
      var v = valores ? valores[p.nome] : p.valor;
      if (v == null || v === "") return;
      if ((p.tipoDado === "texto" || p.tipoDado === "material") && String(v).length > 250) v = String(v).slice(0, 250);
      out.push([(p.rotulo || p.nome) + (p.tipoDado === "angulo" ? " (graus)" : ""), T[p.tipoDado] || "IFCLABEL", p.tipoDado === "simnao" ? !!v : v]);
    });
    return out;
  }

  /* ------------------------------------------------- .rfa (sem o Revit)
   * PartAtom (XML Atom) → família leve com tipos e parâmetros; a geometria
   * é uma CAIXA marcada como pendente. Leitor de XML próprio (o Node não tem
   * DOMParser e o PartAtom é simples: elementos com atributos e texto). */
  function decodXml(s) { return txt(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); }).replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, "&"); }
  /* árvore mínima: { tag, attrs, filhos, texto } */
  function xmlArvore(s) {
    var raiz = { tag: "#raiz", attrs: {}, filhos: [], texto: "" }, pilha = [raiz], re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.\-]*)((?:\s+[\w:.\-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g, m;
    while ((m = re.exec(s))) {
      var topo = pilha[pilha.length - 1];
      if (m[1] != null) { topo.texto += m[1]; continue; }
      if (m[6] != null) { topo.texto += decodXml(m[6]); continue; }
      if (!m[3]) continue;
      if (m[2] === "/") { if (pilha.length > 1) pilha.pop(); continue; }
      var attrs = {}, ra = /([\w:.\-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, a;
      while ((a = ra.exec(m[4] || ""))) attrs[a[1]] = decodXml(a[3] != null ? a[3] : a[4]);
      var no = { tag: m[3], attrs: attrs, filhos: [], texto: "" };
      topo.filhos.push(no);
      if (m[5] !== "/") pilha.push(no);
    }
    return raiz;
  }
  function filhos(no, tag) { return arr(no && no.filhos).filter(function (f) { return f.tag === tag; }); }
  function achar(no, tag) {
    if (!no) return null; if (no.tag === tag) return no;
    for (var i = 0; i < arr(no.filhos).length; i++) { var r = achar(no.filhos[i], tag); if (r) return r; }
    return null;
  }
  /* valor do PartAtom → SI pela unidade ("850" mm → 0,85 m; "2' 10\"" → m) */
  var UN_SI = { mm: 0.001, millimeters: 0.001, cm: 0.01, centimeters: 0.01, m: 1, meters: 1, ft: 0.3048, feet: 0.3048, "in": 0.0254, inches: 0.0254,
                "m²": 1, m2: 1, "m³": 1, m3: 1, "mm²": 1e-6, "cm²": 1e-4, "ft²": 0.09290304, sf: 0.09290304, "ft³": 0.028316846592, cf: 0.028316846592 };
  function valorPartAtom(texto, tipoP, units) {
    var t = txt(texto).trim(), td = tipoDado(tipoP, "", null);
    if (td === "simnao") return { td: td, v: /^(yes|sim|1|true)$/i.test(t) };
    if (td === "texto" || td === "material") return { td: td, v: t };
    var pes = /^(-?\d+(?:\.\d+)?)'\s*(?:-?\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?")?$/.exec(t);
    if (pes && (td === "comprimento")) { var inch = num(pes[2], 0) + (pes[3] ? num(pes[3], 0) / num(pes[4], 1) : 0); return { td: td, v: r6(num(pes[1], 0) * 0.3048 + inch * 0.0254) }; }
    var m = /^(-?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?)/i.exec(t);
    if (!m) return { td: "texto", v: t };
    var n = num(m[1], 0), u = txt(units).toLowerCase();
    if ((td === "comprimento" || td === "area" || td === "volume") && UN_SI[u] != null) n = n * UN_SI[u];
    return { td: td, v: td === "inteiro" ? Math.round(n) : r6(n), unidade: td === "numero" ? txt(units) : "" };
  }
  var GRUPO_RFA = [
    [/^(width|height|thickness|depth|rough width|rough height|length|b|h|d|largura|altura|espessura|profundidade|comprimento|diameter|di[aâ]metro|radius|raio|default sill height|sill height)$/i, "Cotas"],
    [/material/i, "Materiais e acabamentos"],
    [/^(function|wall closure|construction type|fun[cç][aã]o|fechamento)/i, "Construção"],
    [/thermal|solar|visual light|heat transfer|analytic|t[eé]rmic|transmit/i, "Propriedades analíticas"],
    [/manufacturer|model|cost|description|keynote|url|assembly|type comments|fabricante|modelo|descri[cç][aã]o|coment/i, "Dados de identidade"],
    [/wattage|apparent load|luminous|lamp|light|watts|pot[eê]ncia|fluxo|l[aâ]mpada|temperatura de cor|voltage|tens[aã]o/i, "Elétrico - iluminação"],
    [/flow|fixture units|loss|k coefficient|vaz[aã]o|perda/i, "Mecânico"]
  ];
  function grupoRfa(nome) { for (var i = 0; i < GRUPO_RFA.length; i++) if (GRUPO_RFA[i][0].test(nome)) return GRUPO_RFA[i][1]; return "Outros"; }
  /* o CATÁLOGO DE TIPOS do Revit (.txt ao lado do .rfa): ",Width##length##millimeters,..." e uma linha por tipo */
  function lerCatalogo(texto) {
    var linhas = txt(texto).replace(/^﻿/, "").split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (linhas.length < 2) return null;
    function campos(l) { var out = [], cur = "", q = false; for (var i = 0; i < l.length; i++) { var c = l.charAt(i); if (c === '"') { q = !q; continue; } if (c === "," && !q) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; }
    var cab = campos(linhas[0]).slice(1).map(function (h) { var p = h.split("##"); return { nome: p[0].trim(), tipo: (p[1] || "").trim(), un: (p[2] || "").trim() }; });
    var UNC = { millimeters: "mm", centimeters: "cm", meters: "m", feet: "ft", inches: "in", square_meters: "m²", cubic_meters: "m³", degrees: "°" };
    var tipos = linhas.slice(1).map(function (l) {
      var c = campos(l), t = { nome: txt(c[0]).trim(), params: [] };
      cab.forEach(function (h, i) { if (c[i + 1] == null || c[i + 1] === "") return; var tp = h.tipo.toLowerCase() === "other" ? "Text" : h.tipo; t.params.push({ nome: h.nome, tipo: tp, units: UNC[h.un.toLowerCase()] || h.un, texto: c[i + 1] }); });
      return t;
    }).filter(function (t) { return t.nome; });
    return tipos.length ? tipos : null;
  }
  function primeiro(vals, nomes) { for (var i = 0; i < nomes.length; i++) if (fin(vals[nomes[i]])) return vals[nomes[i]]; return null; }
  /* PartAtom (texto) + nome do arquivo → família leve (geometria pendente) */
  function daPartAtom(xml, nomeArquivo, opts) {
    opts = opts || {};
    var arv = xmlArvore(txt(xml)), entry = achar(arv, "entry");
    if (!entry) return { ok: false, erros: ["o PartAtom do .rfa está ilegível (sem <entry>)"] };
    var cat = achar(entry, "category"), termo = cat ? txt((filhos(cat, "term")[0] || {}).texto).trim() : "";
    var ost = NOME_OST[termo.toLowerCase()] || (/^OST_/.test(termo) ? termo : null), avisos = [];
    if (/tags?$|etiqueta|anota|annotation|title ?blocks|carimbo|detail items|itens de detalhe|profiles?$|perfis?$/i.test(termo))
      return { ok: false, erros: ["\"" + termo + "\" é família de anotação/2D — não é peça do modelo 3D"] };
    if (!ost) { avisos.push("categoria \"" + termo + "\" do .rfa sem comportamento próprio aqui — entra como componente genérico"); ost = "OST_GenericModel"; }
    var ic = CAT_OST[ost] || CAT_OST.OST_GenericModel;
    var fam = achar(entry, "A:family"), hostTxt = txt((filhos(fam, "Host")[0] || {}).texto).trim();
    if (!hostTxt) { var feat = achar(entry, "Host"); hostTxt = feat ? txt(feat.texto).trim() : ""; }
    var hosp = /^(wall|parede)$/i.test(hostTxt) || ((ic.cat === "porta" || ic.cat === "janela") && !hostTxt) ? "parede" : "livre";
    if (hostTxt && hosp === "livre" && !/^(none|nenhum|level|nível)?$/i.test(hostTxt)) avisos.push("no Revit a família é hospedada em " + hostTxt + "; aqui ela entra LIVRE, no plano do nível");
    var partes = filhos(fam, "A:part").map(function (pt) {
      var t = { nome: txt((filhos(pt, "title")[0] || {}).texto).trim(), params: [] };
      pt.filhos.forEach(function (f) { if (f.tag === "title") return; t.params.push({ nome: f.attrs.displayName || f.tag.replace(/_/g, " ").trim(), tipo: f.attrs.typeOfParameter || "", units: f.attrs.units || "", texto: f.texto }); });
      return t;
    });
    var cat2 = opts.catalogo ? lerCatalogo(opts.catalogo) : null;
    if (cat2) { partes = cat2; avisos.push("tipos do catálogo de tipos (.txt): " + cat2.length); }
    if (!partes.length) partes = [{ nome: "Padrão", params: [] }];
    var nomeFam = txt(nomeArquivo).replace(/^.*[\\/]/, "").replace(/\.rfa$/i, "").trim() || txt((filhos(entry, "title")[0] || {}).texto);
    /* parâmetros: a união dos de todos os tipos (do TIPO; o PartAtom não traz os de instância) */
    var usados = {}, porRot = {}, parametros = [];
    partes.forEach(function (pt) { pt.params.forEach(function (q) {
      if (porRot[q.nome]) return;
      var vv = valorPartAtom(q.texto, q.tipo, q.units), p = { nome: nomeSeguro(q.nome, usados), rotulo: q.nome, tipoDado: vv.td, escopo: "tipo", valor: null, grupo: grupoRfa(q.nome), importado: true };
      if (vv.unidade) p.unidade = vv.unidade;
      if (q.tipo) p.dadoRevit = q.tipo;
      porRot[q.nome] = p; parametros.push(p);
    }); });
    var tipos = partes.map(function (pt, i) {
      var valores = {}, porRotV = {};
      pt.params.forEach(function (q) { var p = porRot[q.nome]; var vv = valorPartAtom(q.texto, q.tipo, q.units); valores[p.nome] = vv.td === p.tipoDado ? vv.v : (p.tipoDado === "texto" ? txt(q.texto) : vv.v); porRotV[q.nome.toLowerCase()] = valores[p.nome]; });
      /* a CAIXA provisória e o vão, pelas medidas que o próprio tipo declara */
      var L = primeiro(porRotV, ["rough width", "largura bruta", "width", "largura", "b", "diameter", "diâmetro"]);
      var H = primeiro(porRotV, ["rough height", "altura bruta", "height", "altura", "h"]);
      var P = primeiro(porRotV, ["thickness", "espessura", "depth", "profundidade", "frame depth"]);
      var vao = null;
      if (hosp === "parede" && (ic.cat === "porta" || ic.cat === "janela") && L > 0 && H > 0) {
        var peit = ic.cat === "janela" ? primeiro(porRotV, ["default sill height", "sill height", "altura do peitoril", "peitoril"]) : 0;
        if (ic.cat === "janela" && peit == null) { peit = 1; if (i === 0) avisos.push("o .rfa não diz o peitoril da janela: entra 1,00 m — ajuste em Propriedades › Altura do peitoril"); }
        vao = { largura: r6(L), altura: r6(H), peitoril: r6(peit || 0) };
      }
      var lx = L > 0 ? L : 0.5, hy = ic.cat === "pilar" ? 3 : (H > 0 ? H : 0.5), dz = P > 0 ? P : (ic.cat === "pilar" && H > 0 ? H : (ic.cat === "porta" || ic.cat === "janela" ? 0.1 : 0.5));
      if (ic.cat === "pilar") lx = primeiro(porRotV, ["b", "width", "largura", "diameter", "diâmetro"]) || 0.3;
      var y0 = vao ? vao.peitoril : 0;
      return { id: "t" + (i + 1), nome: pt.nome || ("Tipo " + (i + 1)), valores: valores, vao: vao, conectores: [],
               caixa: { min: [r6(-lx / 2), r6(y0), r6(-dz / 2)], max: [r6(lx / 2), r6(y0 + (vao ? vao.altura : hy)), r6(dz / 2)] }, volume: null, triangulos: 0 };
    });
    if (hosp === "parede" && ic.cat === "janela" && tipos.some(function (t) { return t.vao; })) {
      parametros.push({ nome: "Peitoril", rotulo: "Peitoril", tipoDado: "comprimento", escopo: "instancia", valor: (tipos[0].vao || {}).peitoril || 0, grupo: "Restrições", importado: true, sintetico: true });
      tipos.forEach(function (t) { if (t.vao) t.valores.Peitoril = t.vao.peitoril; });
    }
    parametros.forEach(function (p) { if (p.valor != null) return; var t0 = tipos.filter(function (t) { return t.valores.hasOwnProperty(p.nome); })[0]; p.valor = t0 ? t0.valores[p.nome] : (p.tipoDado === "simnao" ? false : (p.tipoDado === "texto" || p.tipoDado === "material" ? "" : 0)); });
    avisos.unshift("geometria pendente: o .rfa traz tipos e parâmetros, não a forma 3D — converta pelo plugin OrçaPRO for Revit");
    if (ic.conectores) avisos.push("os conectores (pontos de ligação) só vêm pela conversão no plugin");
    var famL = montarFamilia({ nome: nomeFam, ost: ost, ic: ic, categoriaNome: termo, hosp: hosp, hospOrig: hostTxt || (hosp === "parede" ? "parede" : "livre"), corteVao: true,
      parametros: parametros, tipos: tipos, materiais: {}, origem: { arquivo: txt(nomeArquivo).replace(/^.*[\\/]/, ""), revit: txt((achar(entry, "A:product-version") || {}).texto), plugin: "" }, formato: "rfa", versao: 0,
      avisos: avisos, geometriaPendente: true, triangulos: 0, id: opts.id });
    var geo = { tipos: {}, miniatura: opts.miniatura || null };
    finalizarRef(famL, geo, opts.miniatura || null);
    return { ok: true, erros: [], avisos: avisos, familia: famL, geometria: geo };
  }
  /* a miniatura do RevitPreview4.0: o PNG começa na assinatura e vai até o IEND */
  function pngDoPreview(b) {
    if (!b) return null;
    for (var i = 0; i + 8 < b.length; i++) {
      if (b[i] === 0x89 && b[i + 1] === 0x50 && b[i + 2] === 0x4e && b[i + 3] === 0x47) {
        for (var j = i + 8; j + 8 <= b.length; j++) if (b[j] === 0x49 && b[j + 1] === 0x45 && b[j + 2] === 0x4e && b[j + 3] === 0x44) return b.subarray(i, Math.min(b.length, j + 8));
        return null;
      }
    }
    return null;
  }
  function base64(b) {
    if (typeof Buffer !== "undefined") return Buffer.from(b).toString("base64");
    var s = "", n = 0x8000; for (var i = 0; i < b.length; i += n) s += String.fromCharCode.apply(null, Array.prototype.slice.call(b.subarray(i, i + n)));
    return btoa(s);
  }
  function deUtf8(b) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(b);
    return Buffer.from(b).toString("utf8");
  }
  /* bytes do .rfa → família (via js/cfb.js) */
  function lerRfa(bytes, nomeArquivo, opts) {
    var C = dep("Cfb", "./cfb.js");
    if (!C) return { ok: false, erros: ["o leitor de .rfa (js/cfb.js) não carregou"] };
    var r = C.ler(bytes);
    if (!r.ok) return { ok: false, erros: [txt(nomeArquivo).replace(/^.*[\\/]/, "") + ": " + r.erro] };
    var pa; try { pa = r.fluxo("PartAtom"); } catch (e) { return { ok: false, erros: ["PartAtom ilegível: " + e.message] }; }
    if (!pa) return { ok: false, erros: ["o arquivo é um documento composto, mas sem o fluxo PartAtom — não é uma família do Revit (.rfa)"] };
    var mini = null; try { var png = pngDoPreview(r.fluxo("RevitPreview4.0")); if (png) mini = "data:image/png;base64," + base64(png); } catch (e2) {}
    var o2 = {}; Object.keys(opts || {}).forEach(function (k) { o2[k] = opts[k]; }); o2.miniatura = mini;
    var d = daPartAtom(deUtf8(pa), nomeArquivo, o2);
    if (d.ok) d.partAtom = deUtf8(pa);
    return d;
  }

  /* ------------------------------------------------ TAMANHO e SIMPLIFICAR */
  var LIMITE_BYTES = 2 * 1024 * 1024;
  /* aglomeração por grade: vértices na mesma célula viram um; triângulo que
     encolhe some. Procura a célula que deixa ≤ alvo triângulos. */
  function simplificarTipo(gt, alvoTri) {
    var v = gt.v, f = gt.f, nTri = f.length / 3;
    if (nTri <= alvoTri) return { v: v.slice(), f: f.slice(), faixas: gt.faixas.slice(), planta: gt.planta, elevacao: gt.elevacao };
    var cb = caixaDeVertices(v), diag = Math.sqrt(Math.pow(cb.max[0] - cb.min[0], 2) + Math.pow(cb.max[1] - cb.min[1], 2) + Math.pow(cb.max[2] - cb.min[2], 2)) || 1;
    function rodar(cel) {
      var mapa = {}, nv = [], novo = new Array(v.length / 3), soma = [];
      for (var i = 0; i < v.length / 3; i++) {
        var k = Math.floor((v[3 * i] - cb.min[0]) / cel) + "," + Math.floor((v[3 * i + 1] - cb.min[1]) / cel) + "," + Math.floor((v[3 * i + 2] - cb.min[2]) / cel);
        if (mapa[k] == null) { mapa[k] = soma.length; soma.push([0, 0, 0, 0]); }
        var s = soma[mapa[k]]; s[0] += v[3 * i]; s[1] += v[3 * i + 1]; s[2] += v[3 * i + 2]; s[3]++; novo[i] = mapa[k];
      }
      soma.forEach(function (s) { nv.push(r4(s[0] / s[3]), r4(s[1] / s[3]), r4(s[2] / s[3])); });
      var nf = [], faixas = [];
      gt.faixas.forEach(function (fx) {
        var ini = nf.length;
        for (var t = fx.inicio; t < fx.inicio + fx.contagem; t += 3) { var a = novo[f[t]], b = novo[f[t + 1]], c = novo[f[t + 2]]; if (a !== b && b !== c && a !== c) nf.push(a, b, c); }
        if (nf.length > ini) faixas.push({ material: fx.material, inicio: ini, contagem: nf.length - ini });
      });
      return { v: nv, f: nf, faixas: faixas, planta: gt.planta, elevacao: gt.elevacao };
    }
    var lo = diag / 4000, hi = diag / 4, melhor = rodar(hi);
    for (var it = 0; it < 18; it++) {
      var mid = Math.sqrt(lo * hi), r = rodar(mid);
      if (r.f.length / 3 <= alvoTri) { melhor = r; hi = mid; } else lo = mid;
    }
    return melhor;
  }
  /* simplifica a família inteira para caber no limite; devolve { familia, geometria, antes, depois } */
  function simplificar(fam, geo, limiteBytes) {
    limiteBytes = limiteBytes || LIMITE_BYTES;
    var antes = geometriaParaTexto(geo, fam.id).length;
    if (antes <= limiteBytes) return { familia: fam, geometria: geo, antes: antes, depois: antes };
    var fator = limiteBytes / antes * 0.85, nova = { tipos: {}, miniatura: geo.miniatura };
    Object.keys(geo.tipos).forEach(function (k) { var gt = geo.tipos[k]; nova.tipos[k] = simplificarTipo(gt, Math.max(12, Math.floor(gt.f.length / 3 * fator))); });
    var f2 = JSON.parse(JSON.stringify(fam)), tri = 0;
    f2.tipos.forEach(function (t) { var gt = nova.tipos[t.id]; if (gt) { t.triangulos = gt.f.length / 3; t.volume = r6(Math.abs(volumeMalha(gt.v, gt.f))); tri += t.triangulos; } });
    f2.importada.triangulos = tri;
    f2.importada.avisos = (f2.importada.avisos || []).concat(["malha simplificada na importação (" + Math.round(antes / 1024) + " kB → ~" + Math.round(limiteBytes / 1024) + " kB): detalhe pequeno pode ter sumido"]);
    esquecerGeometria(fam.importada.ref);
    finalizarRef(f2, nova, nova.miniatura);
    return { familia: f2, geometria: nova, antes: antes, depois: f2.importada.bytes };
  }

  /* -------------------------------- ARQUIVO .opfam (v1) com a geometria junto
   * Exportar/.opbim: a família importada viaja com a malha embutida
   * (`malhaEmbutida`, texto); ao ler, a geometria volta ao registro e sai
   * da família. */
  function embutir(fam) {
    if (!fam || fam.geometria !== "malha" || !fam.importada) return fam;
    var g = geometria(fam.importada.ref), c = JSON.parse(JSON.stringify(fam));
    if (g) c.malhaEmbutida = geometriaParaTexto(g, fam.id);
    return c;
  }
  function desembutir(fam) {
    if (!fam || !fam.malhaEmbutida) return fam;
    var r = geometriaDeTexto(fam.malhaEmbutida), c = JSON.parse(JSON.stringify(fam));
    delete c.malhaEmbutida;
    if (r.ok && c.importada && c.importada.ref) registrarGeometria(c.importada.ref, r.geometria);
    return c;
  }

  /* lista dentro de lista em algum lugar? (a nuvem recusa) — para as ops e o registro do Store */
  function temListaEmLista(o, dentro) {
    if (Array.isArray(o)) { if (dentro) return true; for (var i = 0; i < o.length; i++) if (temListaEmLista(o[i], true)) return true; return false; }
    if (o && typeof o === "object") { for (var k in o) if (o.hasOwnProperty(k) && temListaEmLista(o[k], dentro)) return true; }
    return false;
  }

  var FamiliaMalha = {
    CAT_OST: CAT_OST, NOME_OST: NOME_OST, SISTEMAS_NOME: SISTEMAS_NOME, SISTEMA_GENERICO: SISTEMA_GENERICO, LIMITE_BYTES: LIMITE_BYTES, FORMATO_GEO: FORMATO_GEO,
    ehOpfamV2: ehOpfamV2, lerOpfamV2: lerOpfamV2, lerRfa: lerRfa, daPartAtom: daPartAtom, lerCatalogo: lerCatalogo, xmlArvore: xmlArvore, pngDoPreview: pngDoPreview,
    completar: completar, psetDaFamilia: psetDaFamilia, infoCategoria: infoCategoria, sistemaB5: sistemaB5, sistemaPorNome: sistemaPorNome,
    nomeSeguro: nomeSeguro, tipoDado: tipoDado, grupoPt: grupoPt, ponto: ponto, volumeMalha: volumeMalha, caixaDeVertices: caixaDeVertices,
    registrarGeometria: registrarGeometria, geometria: geometria, esquecerGeometria: esquecerGeometria, geometriaParaTexto: geometriaParaTexto, geometriaDeTexto: geometriaDeTexto,
    simplificar: simplificar, simplificarTipo: simplificarTipo, embutir: embutir, desembutir: desembutir, temListaEmLista: temListaEmLista
  };
  global.FamiliaMalha = FamiliaMalha;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliaMalha;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

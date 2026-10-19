/* =====================================================================
 * hidtemplates.js — TEMPLATES (.optpl) DO HIDROSSANITÁRIO E DA CLIMATIZAÇÃO, por uso da edificação.
 * Motor PURO, ES5, sem DOM, Node-testável. Frente "templates + manual" (17/10/2026).
 *
 * PEDIDO DO ROGÉRIO: "as famílias todas parametrizadas e com nosso tipo de extensão do nosso
 * sistema, onde já vai vir dentro de cada template parametrizado"; "tudo pensado para o usuário
 * não precisar configurar nada". Cada template já traz, para o uso escolhido:
 *   · os SISTEMAS ativos e o MATERIAL padrão de cada um (os do js/biminst.js — nenhum material novo);
 *   · as FAMÍLIAS (.opfam inteiras) de js/hidfamilias.js, js/climfamilias.js e js/hidtanques.js
 *     relevantes ao uso, com todos os tipos do catálogo;
 *   · as OPÇÕES do dimensionamento (uso do HidNormas, ligado/tipo de AQ, pluvial, incêndio,
 *     tratamento, industrial — os mesmos campos da tela, js/hidcalcui.js) e da climatização
 *     (tipo de edificação, usos de ambiente, ocupação, PMOC);
 *   · o PADRÃO DE PRANCHA (docs/hidro/PADRAO-PRANCHA-HIDRO.md) e a lista de folhas;
 *   · os FILTROS/CORES por sistema (a cor é a do modelo 3D: biminst.SISTEMAS[].cor).
 *
 *   HidTemplates.lista()                → [{ id, nome, descricao, uso, sistemas, familias, ... }]
 *   HidTemplates.obter(id)              → o objeto do template (o que vai dentro do .optpl)
 *   HidTemplates.paraOptpl(id, meta)    → texto do .optpl (OpFormato.templateParaArquivo)
 *   HidTemplates.aplicar(estado, id)    → { ok, estado, mudancas, sistemas, familias, ... } — PURO
 *   HidTemplates.verificar(id)          → problemas de coerência (famílias/materiais/uso inexistentes)
 *
 * ⚠ REGRAS (cada uma existe por um defeito que ela impede):
 *  1. O template NÃO inventa valor de norma. Os parâmetros de dimensionamento apontam para as
 *     CHAVES do HidNormas (normas.*) e para o `uso` das tabelas dele; nenhum limite, pressão,
 *     declividade ou UHC mora aqui (tools/test-hid-sem-numero-magico.js varre este arquivo).
 *  2. O material padrão de cada sistema é o PRIMEIRO da lista do biminst (SISTEMAS[].material).
 *     Trocar de material é escolha do projeto; o template só não deixa o sistema sem nenhum.
 *  3. A divisão de ocupação do incêndio (A-1, D-1, E-1…) é uma CLASSIFICAÇÃO da tabela
 *     in.it01.classificacao_ocupacao, não um valor de norma — mas o enquadramento real de uma obra
 *     é do responsável técnico: por isso cada template lista suas `decisoes` (o que o RT confirma).
 *  4. Preço e dado de cliente nunca entram (OpFormato.semPreco tira o que for de preço).
 *  5. aplicar() preenche SÓ o que o template é dono (uso, ligado/tipo dos sistemas, ocupação do
 *     incêndio, clima). Nunca toca em porte (valores), população, alimentação nem recalque — o
 *     dado da obra do usuário vale mais que o padrão. Aplicar duas vezes dá o mesmo estado.
 *  6. Sistema sem layer no PADRÃO DE PRANCHA (frigorígeno, dreno) sai com layer null e aviso:
 *     nunca um nome de layer inventado.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arquivo); } catch (e) { return null; } }
    return null;
  }
  function Fam() { return dep("HidFamilias", "hidfamilias.js"); }
  function Clim() { return dep("ClimFamilias", "climfamilias.js"); }
  function Tanq() { return dep("HidTanques", "hidtanques.js"); }
  function BI() { return dep("BimInst", "biminst.js"); }
  function OpF() { return dep("OpFormato", "opformato.js"); }
  function TRA() { return dep("TemplatesRA", "templatesra.js"); }

  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function tem(lista, x) { return arr(lista).indexOf(x) >= 0; }

  /* ----------------------------------------------------------- SISTEMAS
   * ordem de apresentação (a do PADRÃO DE PRANCHA: água, esgoto, pluvial, incêndio; depois clima) */
  var ORDEM = ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "incendio", "industrial", "frigorigeno", "dreno"];
  /* classe do material (campo "classe" do template RA): só plástico ou metal — nada além do que o biminst já diz */
  var CLASSE_MATERIAL = { pvc_soldavel: "Plástico", pvc_esgoto: "Plástico", pvc_serie_r: "Plástico", pvc_esgoto_enterrado: "Plástico", ppr: "Plástico", cpvc: "Plástico", pead: "Plástico",
                          cobre: "Metal", cobre_frigorigeno: "Metal", aco_galvanizado: "Metal", aco_preto: "Metal", aco_carbono: "Metal", inox: "Metal" };
  /* layer de tubo no PADRÃO DE PRANCHA (§1: AF, AQ, ES, VE, AP) e nos que o js/hidpranchas.js já gera (IN, IND).
     Frigorígeno e dreno NÃO estão no padrão: layer null + aviso (regra 6). */
  var LAYER = { agua_fria: "HID-AF-TUBO", agua_quente: "HID-AQ-TUBO", esgoto: "HID-ES-TUBO", ventilacao: "HID-VE-TUBO", pluvial: "HID-AP-TUBO",
                incendio: "HID-IN-TUBO", industrial: "HID-IND-TUBO" };
  /* pena (mm de papel) — tabela do PADRAO-PRANCHA-HIDRO.md §1; os que o padrão não traz ficam null */
  var PENA = { agua_fria: 0.35, agua_quente: 0.35, esgoto: 0.5, ventilacao: 0.25, pluvial: 0.35 };   /* hid:ok pena do PADRAO-PRANCHA-HIDRO §1 */
  var NOME_FOLHA = { agua_fria: "ÁGUA FRIA", agua_quente: "ÁGUA QUENTE", esgoto: "ESGOTO E VENTILAÇÃO", pluvial: "ÁGUAS PLUVIAIS", incendio: "INCÊNDIO", industrial: "FLUIDO INDUSTRIAL" };
  /* notas gerais típicas — as do PADRÃO DE PRANCHA §5 que não levam valor de norma */
  var NOTAS = [
    "DN em mm; comprimentos em cm; alturas e níveis em m, do piso acabado.",
    "O isométrico não tem escala: vale a cota.",
    "DN, vazões e declividades são os do dimensionamento; conferir antes de executar.",
    "Conferir cotas e compatibilização com arquitetura, estrutura e elétrico antes de furar ou cortar elemento estrutural.",
    "Declividade do esgoto indicada em cada trecho; nunca executar com menor.",
    "Detalhes típicos esquemáticos; dimensão do fabricante escolhido."
  ];

  /* ------------------------------------------------------ GRUPOS DE FAMÍLIAS (ids reais; teste confere) */
  var GRP = {
    banhoRes:   ["hid-bacia-caixa-acoplada", "hid-lavatorio-coluna", "hid-cuba-apoio", "hid-chuveiro", "hid-ducha-higienica", "hid-torneira", "hid-misturador"],
    banhoCom:   ["hid-bacia-convencional", "hid-valvula-descarga", "hid-lavatorio-suspenso", "hid-cuba-apoio", "hid-torneira", "hid-misturador"],
    banhoColet: ["hid-bacia-convencional", "hid-valvula-descarga", "hid-caixa-descarga-embutida", "hid-lavatorio-suspenso", "hid-mictorio", "hid-torneira", "hid-chuveiro"],
    servico:    ["hid-pia-cozinha", "hid-tanque-lavar"],
    registros:  ["hid-registro-gaveta", "hid-registro-pressao", "hid-registro-esfera"],
    esgoto:     ["hid-caixa-sifonada", "hid-ralo", "hid-caixa-gordura", "hid-caixa-inspecao"],
    reserv:     ["hid-caixa-dagua", "hid-cisterna"],
    reservGr:   ["hid-caixa-dagua", "hid-cisterna", "hid-reservatorio-tanque"],
    trat:       ["hid-tanque-ret-esgoto", "hid-sumidouro", "hid-vala-infiltracao"],
    tratInd:    ["hid-tanque-ret-esgoto", "hid-tanque-ret-agua", "hid-tanque-cil-esgoto", "hid-tanque-cil-agua", "hid-sumidouro", "hid-vala-infiltracao"],
    drenoClim:  ["ra-clim-condensadora", "ra-clim-suporte-condensadora", "ra-clim-sifao-dreno", "ra-clim-bomba-dreno"]
  };
  function junta() { var o = [], v = {}; Array.prototype.slice.call(arguments).forEach(function (g) { arr(g).forEach(function (x) { if (!v[x]) { v[x] = 1; o.push(x); } }); }); return o; }

  /* ------------------------------------------------------------- OS TEMPLATES
   * sistemas: quais ficam ATIVOS; os desligados não entram no .optpl (a tela os oferece depois).
   * dim: opções da tela (js/hidcalcui.js E.aq/ap/inc/tr/ind) — só ligado/tipo/ocupação.
   *   aq.tipo/energia = o padrão da própria tela (passagem a gás); trocar é decisão do RT.
   * clima: edificacao ("residencial"|"comercial", js/climcarga.js ehResidencial); usos = amb.uso que
   *   o ClimCarga conhece (rótulo de ocupação e de atividade); uso sem rótulo = pendência no cálculo
   *   (nunca o rótulo "parecido"). */
  var USOS = [
    { id: "residencial_unifamiliar", nome: "Residencial unifamiliar", uso: "residencial_unifamiliar", ocup: "A-1",
      descricao: "Casa: banheiros e cozinha com louças de uso residencial, água quente por aquecedor, pluvial, reservação superior e inferior, split com dreno.",
      sistemas: ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "frigorigeno", "dreno"],
      dim: { aq: true, ap: true, inc: false, tr: false, ind: false },
      familias: junta(GRP.banhoRes, GRP.servico, GRP.registros, GRP.esgoto, GRP.reserv, GRP.trat),
      clim: { edificacao: "residencial", usos: ["dormitorio", "sala", "cozinha"], pmoc: "uso privado: conferir o alcance na Lei 13.589/2018",
              familias: junta(["ra-clim-evap-hiwall"], GRP.drenoClim) },
      decisoes: ["Existe rede pública de esgoto? Se não, ligar o tratamento (fossa, filtro, sumidouro ou vala) na aba de tratamento.",
                 "Aquecimento: o padrão é aquecedor de passagem a gás; trocar por acumulação, solar ou elétrico conforme o projeto.",
                 "Incêndio: o enquadramento (A-1) é da tabela in.it01; a exigência de rede de hidrantes quem diz é o cálculo, ligando o incêndio."] },
    { id: "residencial_multifamiliar", nome: "Residencial multifamiliar (predial)", uso: "residencial_multifamiliar", ocup: "A-2",
      descricao: "Edifício de apartamentos: prumadas, reservação superior e inferior, água quente, pluvial, incêndio e split multi com dreno.",
      sistemas: ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "incendio", "frigorigeno", "dreno"],
      dim: { aq: true, ap: true, inc: true, tr: false, ind: false },
      familias: junta(GRP.banhoRes, GRP.servico, GRP.registros, GRP.esgoto, GRP.reservGr, GRP.trat),
      clim: { edificacao: "residencial", usos: ["dormitorio", "sala", "cozinha"], pmoc: "conferir o alcance (áreas comuns e de uso coletivo) na Lei 13.589/2018",
              familias: junta(["ra-clim-evap-hiwall", "ra-clim-condensadora-multi"], GRP.drenoClim) },
      decisoes: ["Altura, número de pavimentos e área para o incêndio: o cálculo pede; sem eles fica pendente.",
                 "Aquecimento central ou individual por apartamento: a tela parte do individual (passagem a gás).",
                 "Esgoto: confirmar a ligação à rede pública."] },
    { id: "comercial_loja", nome: "Comercial / loja", uso: "comercial", ocup: "C-2",
      descricao: "Loja ou galeria: sanitários de público e funcionários, copa, pluvial, incêndio e climatização por cassete e duto.",
      sistemas: ["agua_fria", "esgoto", "ventilacao", "pluvial", "incendio", "frigorigeno", "dreno"],
      dim: { aq: false, ap: true, inc: true, tr: false, ind: false },
      familias: junta(GRP.banhoCom, ["hid-pia-cozinha"], GRP.registros, GRP.esgoto, GRP.reserv, GRP.trat),
      clim: { edificacao: "comercial", usos: ["loja"], pmoc: "ambiente de uso público e coletivo: PMOC conforme a Lei 13.589/2018 (texto fora do acervo: conferir)",
              familias: junta(["ra-clim-evap-cassete", "ra-clim-evap-duto", "ra-clim-evap-pisoteto", "ra-clim-condensadora-multi", "ra-clim-grelha-difusor"], GRP.drenoClim) },
      decisoes: ["Divisão de ocupação: C-2 (carga de incêndio média ou alta) é o lado seguro; C-1 se a carga for baixa — o RT enquadra.",
                 "Água quente só se houver ponto (copa, vestiário): ligar na aba de água quente.",
                 "Esgoto: confirmar a ligação à rede pública."] },
    { id: "escritorio", nome: "Escritório", uso: "escritorio", ocup: "D-1",
      descricao: "Escritório corporativo: sanitários coletivos, copa, pluvial, incêndio e climatização por cassete e duto.",
      sistemas: ["agua_fria", "esgoto", "ventilacao", "pluvial", "incendio", "frigorigeno", "dreno"],
      dim: { aq: false, ap: true, inc: true, tr: false, ind: false },
      familias: junta(GRP.banhoColet, ["hid-pia-cozinha"], GRP.registros, GRP.esgoto, GRP.reserv, GRP.trat),
      clim: { edificacao: "comercial", usos: ["escritorio", "reuniao"], pmoc: "ambiente de uso público e coletivo: PMOC conforme a Lei 13.589/2018 (texto fora do acervo: conferir)",
              familias: junta(["ra-clim-evap-cassete", "ra-clim-evap-duto", "ra-clim-evap-hiwall", "ra-clim-condensadora-multi", "ra-clim-grelha-difusor"], GRP.drenoClim) },
      decisoes: ["Pessoas por m²: a ocupação vem da tabela cl.ocupacao.densidade; informe o número real se for diferente.",
                 "Esgoto: confirmar a ligação à rede pública."] },
    { id: "escola", nome: "Escola", uso: "escola_externato", ocup: "E-1",
      descricao: "Escola (externato): sanitários coletivos por pavimento, bebedouros e cozinha de apoio, pluvial, incêndio e climatização das salas.",
      sistemas: ["agua_fria", "esgoto", "ventilacao", "pluvial", "incendio", "frigorigeno", "dreno"],
      dim: { aq: false, ap: true, inc: true, tr: false, ind: false },
      familias: junta(GRP.banhoColet, ["hid-pia-cozinha", "hid-tanque-lavar"], GRP.registros, GRP.esgoto, GRP.reservGr, GRP.trat),
      clim: { edificacao: "comercial", usos: ["escola", "reuniao"], pmoc: "ambiente de uso público e coletivo: PMOC conforme a Lei 13.589/2018 (texto fora do acervo: conferir)",
              familias: junta(["ra-clim-evap-hiwall", "ra-clim-evap-cassete", "ra-clim-condensadora-multi", "ra-clim-grelha-difusor"], GRP.drenoClim) },
      decisoes: ["Tipo de escola (externato, semi-internato, internato, creche): o `uso` do HidNormas troca de acordo; E-5 para creche.",
                 "Alunos e funcionários: informe o porte; o padrão da tela é só ponto de partida.",
                 "Esgoto: confirmar a ligação à rede pública."] },
    { id: "saude_clinica", nome: "Saúde (clínica / ambulatório)", uso: "ambulatorio", ocup: "H-6",
      descricao: "Clínica ou consultório sem internação: sanitários, lavatórios nas salas, água quente, pluvial, incêndio e climatização.",
      sistemas: ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "incendio", "frigorigeno", "dreno"],
      dim: { aq: true, ap: true, inc: true, tr: false, ind: false },
      familias: junta(GRP.banhoColet, ["hid-pia-cozinha", "hid-ducha-higienica", "hid-misturador"], GRP.registros, GRP.esgoto, GRP.reservGr, GRP.trat),
      clim: { edificacao: "comercial", usos: ["outro"], pmoc: "ambiente de uso público e coletivo: PMOC conforme a Lei 13.589/2018 (texto fora do acervo: conferir)",
              familias: junta(["ra-clim-evap-hiwall", "ra-clim-evap-cassete", "ra-clim-evap-duto", "ra-clim-condensadora-multi", "ra-clim-grelha-difusor"], GRP.drenoClim) },
      decisoes: ["Clínica sem uso mapeado no ClimCarga (a tabela de densidade tem `saude_eas`, mas o motor ainda não mapeia): informe pessoas e atividade por ambiente.",
                 "Com internação ou centro cirúrgico a divisão passa a H-3 e há exigências próprias (RDC 50 da Anvisa, fora do acervo): não coberto por este template.",
                 "Esgoto: confirmar a ligação à rede pública."] },
    { id: "restaurante", nome: "Restaurante", uso: "restaurante", ocup: "F-8",
      descricao: "Restaurante: cozinha com caixa de gordura, sanitários de público e equipe, água quente, pluvial, incêndio e climatização do salão.",
      sistemas: ["agua_fria", "agua_quente", "esgoto", "ventilacao", "pluvial", "incendio", "frigorigeno", "dreno"],
      dim: { aq: true, ap: true, inc: true, tr: false, ind: false },
      familias: junta(GRP.banhoColet, GRP.servico, GRP.registros, GRP.esgoto, GRP.reservGr, GRP.trat),
      clim: { edificacao: "comercial", usos: ["restaurante", "cozinha"], pmoc: "ambiente de uso público e coletivo: PMOC conforme a Lei 13.589/2018 (texto fora do acervo: conferir)",
              familias: junta(["ra-clim-evap-cassete", "ra-clim-evap-duto", "ra-clim-evap-pisoteto", "ra-clim-condensadora-multi", "ra-clim-grelha-difusor"], GRP.drenoClim) },
      decisoes: ["Refeições por dia e área do salão: o porte da tela é só ponto de partida.",
                 "Gordura: toda a cozinha passa por caixa de gordura antes da rede; dimensão da caixa e destino conforme o cálculo e a concessionária.",
                 "Esgoto: confirmar a ligação à rede pública."] },
    { id: "industria", nome: "Indústria", uso: "industria", ocup: "I-1",
      descricao: "Indústria: sanitários e vestiários, reservação grande, pluvial, incêndio, tanques e disposição; a rede de fluido industrial fica desligada até o RT escolher o fluido.",
      sistemas: ["agua_fria", "esgoto", "ventilacao", "pluvial", "incendio", "industrial", "frigorigeno", "dreno"],
      dim: { aq: false, ap: true, inc: true, tr: false, ind: false },
      familias: junta(GRP.banhoColet, ["hid-pia-cozinha", "hid-tanque-lavar"], GRP.registros, GRP.esgoto, GRP.reservGr, GRP.tratInd),
      clim: { edificacao: "comercial", usos: ["escritorio", "outro"], pmoc: "ambiente de uso público e coletivo (áreas administrativas): PMOC conforme a Lei 13.589/2018 (texto fora do acervo: conferir)",
              familias: junta(["ra-clim-evap-hiwall", "ra-clim-evap-duto", "ra-clim-condensadora-multi", "ra-clim-grelha-difusor"], GRP.drenoClim) },
      decisoes: ["Divisão I-1 (carga até a menor faixa da tabela) é o ponto de partida; I-2 e I-3 dependem da carga de incêndio real — o RT enquadra.",
                 "Fluido industrial: escolher fluido, estado, temperatura e pressão na aba de fluidos antes de ligá-la.",
                 "Efluente industrial: tratamento próprio e licença ambiental estão fora deste template.",
                 "Esgoto sanitário: confirmar a ligação à rede pública."] }
  ];

  function acharUso(id) { var r = null; USOS.forEach(function (u) { if (u.id === id) r = u; }); return r; }

  /* ------------------------------------------------------------- TEMPLATES POR DISCIPLINA (18/10/2026)
   * Pedido do Rogério: "deixa um template de hidrossanitário pronto, um para cada disciplina". Cada um traz, além do que o
   * template por uso já leva: os TIPOS DE TUBO (material + DN do catálogo de geometria) e as CONEXÕES de cada material, os
   * MODELOS DE VISTA e os FILTROS do padrão de apresentação (js/biminstpadrao.js), o NÍVEL DE DETALHE de cada vista
   * (js/biminstnivel.js), o CONJUNTO DE PRANCHAS pronto para o "Gerar pranchas" (js/hidpranchas.js configPadrao), os
   * RÓTULOS e os PARÂMETROS DE PROJETO. Nenhum valor de norma: o que é número vem dos módulos citados.
   *   disc.sistemas   os sistemas do biminst que a disciplina usa (ventilação junto do esgoto)
   *   disc.liga       o que o template LIGA na tela do cálculo (merge: nunca desliga o que a obra já ligou)
   *   disc.prefixo    o prefixo da numeração das folhas (HID-01, AF-01, GAS-01…)
   *   disc.modelos    os modelos de vista do padrão (ids de js/biminstpadraodados.js) */
  var PARAM_BASE = [
    { nome: "RA_Sistema", tipo: "texto", grupo: "Instalações", descricao: "Sistema do trecho/peça (AF, AQ, ES, VE, AP, IN, IND…): o mesmo do modelo" },
    { nome: "RA_DN", tipo: "inteiro", grupo: "Instalações", descricao: "Diâmetro nominal (mm) — o do cálculo depois de Aplicar" },
    { nome: "RA_Material", tipo: "texto", grupo: "Instalações", descricao: "Material do trecho (lista do sistema no js/biminst.js)" },
    { nome: "RA_Pavimento", tipo: "texto", grupo: "Identidade", descricao: "Pavimento (nível da obra)" },
    { nome: "RA_Ambiente", tipo: "texto", grupo: "Identidade", descricao: "Ambiente molhado (banheiro, cozinha…) — o do isométrico" },
    { nome: "RA_Folha", tipo: "texto", grupo: "Documentação", descricao: "Folha onde a peça aparece (HID-01…): carimbo da prancha" }
  ];
  var DISCIPLINAS = [
    { id: "disc-agua-fria", nome: "Água fria", prefixo: "AF", sistemas: ["agua_fria"], liga: {}, modelos: ["inst-planta-agua", "inst-isometrico", "inst-detalhe", "inst-3d-coordenacao"],
      familias: junta(GRP.banhoRes, GRP.banhoCom, GRP.servico, GRP.registros, GRP.reservGr, ["hid-bomba"]),
      parametros: [{ nome: "AF_Pressao_kPa", tipo: "numero", grupo: "Cálculo", descricao: "Pressão dinâmica no ponto (resultado do cálculo)" }, { nome: "AF_Vazao_Ls", tipo: "numero", grupo: "Cálculo", descricao: "Vazão de projeto do trecho (resultado)" }],
      descricao: "Água fria: alimentação, reservação, barrilete, colunas, ramais e sub-ramais; registros e louças; plantas, isométricos por banheiro, esquema vertical e detalhes (kit da bacia, barrilete, reservatório).",
      decisoes: ["Alimentação: rede pública direta, indireta (reservatório superior) ou mista — informar na aba de alimentação.", "Material: PVC soldável é o padrão; PPR, CPVC ou cobre conforme o projeto."] },
    { id: "disc-agua-quente", nome: "Água quente", prefixo: "AQ", sistemas: ["agua_quente"], liga: { aq: true }, modelos: ["inst-planta-agua", "inst-isometrico", "inst-detalhe", "inst-3d-coordenacao"],
      familias: junta(["hid-aquecedor-gas", "hid-misturador", "hid-chuveiro", "hid-registro-pressao", "hid-registro-gaveta"]),
      parametros: [{ nome: "AQ_Temperatura_C", tipo: "numero", grupo: "Cálculo", descricao: "Temperatura de projeto do ponto (do cálculo; a tabela é a da norma pelo HidNormas)" }, { nome: "AQ_Isolamento", tipo: "texto", grupo: "Instalações", descricao: "Isolamento térmico do trecho (especificação)" }],
      descricao: "Água quente: aquecedor (passagem a gás por padrão), misturadores e pontos; PPR por padrão; plantas e isométricos de água quente.",
      decisoes: ["Aquecimento: passagem a gás é o padrão da tela; acumulação, solar ou elétrico é decisão do RT."] },
    { id: "disc-esgoto", nome: "Esgoto e ventilação", prefixo: "ES", sistemas: ["esgoto", "ventilacao"], liga: {}, modelos: ["inst-planta-esgoto", "inst-isometrico", "inst-detalhe", "inst-3d-coordenacao"],
      familias: junta(GRP.esgoto, ["hid-caixa-areia"], GRP.banhoRes, GRP.servico),
      parametros: [{ nome: "ES_Declividade_pct", tipo: "numero", grupo: "Cálculo", descricao: "Declividade do trecho (a do modelo, conferida pelo cálculo)" }, { nome: "ES_UHC", tipo: "numero", grupo: "Cálculo", descricao: "Unidades Hunter de contribuição acumuladas (resultado)" }],
      descricao: "Esgoto sanitário e ventilação: ramais, caixa sifonada, tubo de queda, coluna e ramal de ventilação, subcoletor, caixas de inspeção e de gordura; seta de escoamento e declividade em cada trecho.",
      decisoes: ["Destino: rede pública ou tratamento (fossa, filtro, sumidouro) — ligar o tratamento se não houver rede."] },
    { id: "disc-pluvial", nome: "Águas pluviais", prefixo: "AP", sistemas: ["pluvial"], liga: { ap: true }, modelos: ["inst-planta-esgoto", "inst-isometrico", "inst-detalhe", "inst-3d-coordenacao"],
      familias: junta(["hid-ralo", "hid-caixa-areia", "hid-caixa-inspecao", "hid-cisterna"]),
      parametros: [{ nome: "AP_Area_m2", tipo: "numero", grupo: "Cálculo", descricao: "Área de contribuição do condutor/calha" }, { nome: "AP_Intensidade_mmh", tipo: "numero", grupo: "Cálculo", descricao: "Intensidade de chuva adotada (informada com a fonte)" }],
      descricao: "Águas pluviais: calhas, condutores verticais e horizontais, caixas de areia/inspeção e aproveitamento de chuva (cisterna).",
      decisoes: ["Intensidade de chuva da cidade: informar com a fonte (sem fonte fica pendente)."] },
    { id: "disc-incendio", nome: "Incêndio (hidrantes, chuveiros automáticos e extintores)", prefixo: "INC", sistemas: ["incendio"], liga: { inc: true }, modelos: ["inst-3d-coordenacao", "inst-isometrico", "inst-detalhe"],
      familias: junta(["hid-hidrante-abrigo", "hid-extintor", "hid-sprinkler", "hid-bomba", "hid-reservatorio-tanque", "hid-registro-gaveta"]),
      parametros: [{ nome: "INC_Ocupacao", tipo: "texto", grupo: "Cálculo", descricao: "Divisão de ocupação (tabela in.it01) — enquadramento do RT" }, { nome: "INC_Risco", tipo: "texto", grupo: "Cálculo", descricao: "Classe de risco dos chuveiros automáticos (resultado)" }],
      descricao: "Incêndio: rede de hidrantes/mangotinhos, chuveiros automáticos e extintores; planta com raio de cobertura, bomba e reserva técnica.",
      decisoes: ["Enquadramento (ocupação, altura, área) e exigências: do RT, pela tabela da IT; o template só liga o cálculo."] },
    { id: "disc-gas", nome: "Gás combustível (GN/GLP)", prefixo: "GAS", sistemas: ["industrial"], liga: { ind: true }, fluido: "gn", modelos: ["inst-3d-coordenacao", "inst-isometrico", "inst-detalhe"],
      familias: junta(["hid-aquecedor-gas", "hid-registro-esfera"]),
      parametros: [{ nome: "GAS_Tipo", tipo: "texto", grupo: "Cálculo", descricao: "GN ou GLP (o motor de fluidos industriais calcula pelo anexo da norma de gás)" }, { nome: "GAS_Pressao_kPa", tipo: "numero", grupo: "Cálculo", descricao: "Pressão manométrica de operação" }],
      descricao: "Gás combustível residencial/comercial (GN ou GLP) pela rede de fluidos: trechos, registros de esfera, aquecedor; o cálculo usa o fluido \"gn\" ou \"glp\" do motor de fluidos industriais.",
      decisoes: ["Fluido: GN é o padrão; GLP se não houver rede da concessionária.", "Material: o primeiro da lista do sistema (aço carbono); cobre ou PEAD conforme o projeto e a concessionária."] },
    { id: "disc-climatizacao", nome: "Climatização", prefixo: "CLI", sistemas: ["frigorigeno", "dreno"], liga: {}, clima: true, modelos: ["inst-3d-coordenacao", "inst-detalhe"],
      familias: junta(["ra-clim-evap-hiwall", "ra-clim-evap-cassete", "ra-clim-evap-duto", "ra-clim-evap-pisoteto", "ra-clim-condensadora", "ra-clim-condensadora-multi", "ra-clim-grelha-difusor"], GRP.drenoClim),
      parametros: [{ nome: "CLI_Carga_W", tipo: "numero", grupo: "Cálculo", descricao: "Carga térmica do ambiente (resultado do cálculo hora a hora)" }, { nome: "CLI_Capacidade_BTUh", tipo: "numero", grupo: "Instalações", descricao: "Capacidade do equipamento escolhido" }],
      descricao: "Climatização: evaporadoras, condensadoras, linhas frigorígenas (líquido e sucção), dreno de condensado e dutos; carga térmica por ambiente e as pranchas CLI.",
      decisoes: ["Tipo de edificação e uso dos ambientes: o template parte de comercial; residencial muda a ocupação.", "PMOC: conferir o alcance da Lei 13.589/2018 para a obra."] },
    { id: "disc-industrial", nome: "Fluidos industriais", prefixo: "IND", sistemas: ["industrial"], liga: { ind: true }, modelos: ["inst-3d-coordenacao", "inst-isometrico", "inst-detalhe"],
      familias: junta(["hid-registro-esfera", "hid-registro-gaveta", "hid-bomba"], GRP.tratInd),
      parametros: [{ nome: "IND_Fluido", tipo: "texto", grupo: "Cálculo", descricao: "Fluido (água, vapor, ar comprimido, óleo, gás)" }, { nome: "IND_Classe_Pressao", tipo: "texto", grupo: "Cálculo", descricao: "Classe de pressão do trecho (resultado)" }],
      descricao: "Fluidos industriais: ar comprimido, vapor e condensado, óleo térmico, água gelada/industrial; classe de pressão, dilatação e golpe por trecho.",
      decisoes: ["Fluido, estado, temperatura e pressão: escolher na aba de fluidos antes de ligar."] },
    { id: "disc-tratamento", nome: "Tratamento (fossa, filtro, ETE, ETA)", prefixo: "TRA", sistemas: ["esgoto"], liga: { tr: true }, modelos: ["inst-planta-esgoto", "inst-detalhe", "inst-3d-coordenacao"],
      familias: junta(GRP.tratInd, ["hid-caixa-inspecao", "hid-caixa-gordura"]),
      parametros: [{ nome: "TRA_Contribuicao_Ld", tipo: "numero", grupo: "Cálculo", descricao: "Contribuição diária de esgoto (resultado)" }, { nome: "TRA_Infiltracao", tipo: "texto", grupo: "Cálculo", descricao: "Coeficiente de infiltração do solo (ensaio informado)" }],
      descricao: "Tratamento: tanque séptico, filtro anaeróbio, sumidouro ou vala de infiltração; ETE e ETA paramétricas; planta e corte das unidades cotados.",
      decisoes: ["Ensaio de infiltração do solo: sem ele o sumidouro fica pendente.", "Escopo acima do limite do tanque: passa para ETE (o cálculo avisa)."] }
  ];
  var DISC_COMPLETO = { id: "disc-completo", nome: "Hidrossanitário completo", prefixo: "HID", completo: true,
    descricao: "Todas as disciplinas juntas: água fria e quente, esgoto e ventilação, pluvial, incêndio, gás, climatização, fluidos e tratamento — um conjunto de pranchas único (HID-01…).",
    decisoes: ["Disciplinas sem uso na obra ficam desligadas na tela do cálculo: ligar o que a obra tem."] };
  (function () {
    var s = [], f = [], p = [], m = [], d = [];
    DISCIPLINAS.forEach(function (x) {
      x.sistemas.forEach(function (k) { if (s.indexOf(k) < 0) s.push(k); });
      f = junta(f, x.familias); p = p.concat(x.parametros); x.modelos.forEach(function (k) { if (m.indexOf(k) < 0) m.push(k); });
    });
    m.unshift("inst-planta-completo");
    DISC_COMPLETO.sistemas = ORDEM.filter(function (k) { return s.indexOf(k) >= 0; }); DISC_COMPLETO.familias = f; DISC_COMPLETO.parametros = p; DISC_COMPLETO.modelos = m;
    DISC_COMPLETO.liga = { aq: true, ap: true }; DISC_COMPLETO.clima = true; void d;
  })();
  var TODAS_DISC = DISCIPLINAS.concat([DISC_COMPLETO]);
  function acharDisc(id) { var r = null; TODAS_DISC.forEach(function (u) { if (u.id === id) r = u; }); return r; }

  function GEOD() { return dep("BimInstGeoDados", "biminstgeodados.js"); }
  function PADR() { var p = dep("BimInstPadrao", "biminstpadrao.js"); return p && p.pronto && p.pronto() ? p : null; }
  function NIVL() { return dep("BimInstNivel", "biminstnivel.js"); }
  function PRAN() { return dep("HidPranchas", "hidpranchas.js"); }
  /* os tipos de tubo de cada sistema: os materiais permitidos e os DN do catálogo de geometria (o que existe para comprar) */
  function tiposTubo(sist) {
    var G = GEOD(), B = BI(), MM = B ? B.MATERIAIS : {}, out = [];
    sist.forEach(function (s) {
      arr(s.materiaisPermitidos).forEach(function (m) {
        var t = G && G.tubos ? G.tubos[m] : null, dns = t && t.dns ? Object.keys(t.dns).map(Number).filter(function (v) { return isFinite(v); }).sort(function (a, b) { return a - b; }) : [];
        out.push({ sistema: s.id, material: m, nome: MM[m] ? MM[m].nome : m, padrao: m === s.material, norma: t ? t.norma : (MM[m] ? MM[m].norma || null : null), dns: dns,
                   conexoes: G && G.conexoes && G.conexoes[m] ? Object.keys(G.conexoes[m]) : [], semCatalogo: !t });
      });
    });
    return out;
  }
  function modelosDe(u) {
    var P = PADR(), N = NIVL(), out = [];
    u.modelos.forEach(function (id) {
      var m = P ? P.modelo(id) : null;
      if (!m) { out.push({ id: id, ausente: true }); return; }
      var tv = m.tipoVista === "3d" ? "3d" : m.tipoVista;
      out.push({ id: m.id, nome: m.nome, tipoVista: m.tipoVista, escala: m.valores && m.valores.escala || null,
                 nivelDetalhe: (m.valores && m.valores.nivelDetalhe) || (N ? N.padraoVista(tv) : null), filtros: m.valores ? m.valores.filtros || null : null });
    });
    return out;
  }
  function rotulosDe(u) {
    var P = PADR(), d = P ? P.dados() : null;
    return { tubo: d && d.rotulos ? copia(d.rotulos.tubo) : null, peca: d && d.rotulos ? copia(d.rotulos.peca) : null, pecas: d && d.rotulos ? copia(d.rotulos.pecas) : null,
             setaFluxo: d && d.rotulos ? copia(d.rotulos.setaFluxo) : null, sistemas: u.sistemas.slice(),
             aviso: "formato do rótulo do padrão de apresentação (js/biminstpadrao.js rotuloTrecho/rotuloPeca); o número vem do modelo e do cálculo" };
  }
  function pranchasDe(u) {
    var HP = PRAN(), c = HP && HP.configPadrao ? HP.configPadrao() : { conjuntos: {} };
    c.prefixo = u.prefixo;
    c.sistemas = u.completo ? [] : u.sistemas.filter(function (s) { return s !== "ventilacao" && s !== "frigorigeno" && s !== "dreno"; }).concat(u.liga && u.liga.tr ? ["tratamento"] : []);
    if (u.id === "disc-incendio") c.conjuntos = { plantas: true, cortes: false, isometricos: false, esquema: false, detalhes: false, quadro: true };
    if (u.id === "disc-tratamento") c.conjuntos = { plantas: true, cortes: false, isometricos: false, esquema: false, detalhes: true, quadro: true };
    if (u.id === "disc-climatizacao") { c.conjuntos = { plantas: false, cortes: false, isometricos: false, esquema: false, detalhes: false, quadro: true }; c.pranchasClima = "CLI-01 a CLI-04 (js/climpranchas.js)"; }
    return c;
  }
  function obterDisc(u) {
    var B = BI(), SS = B ? B.SISTEMAS : {}, P = PADR(), avisos = [], fams = [], faltam = [];
    var sist = ORDEM.filter(function (s) { return tem(u.sistemas, s); }).map(function (s) {
      var S = SS[s] || {}, ps = P ? P.sistema(s) : null, m = S.material ? S.material : null;
      return { id: s, nome: S.nome || s, abrev: S.abrev || "", cor: S.cor || null, material: m, materialNome: m && B && B.MATERIAIS[m] ? B.MATERIAIS[m].nome : null,
               materiaisPermitidos: copia(arr(S.materiais)), layer: LAYER[s] || null, pena: ps ? ps.mm : (PENA[s] == null ? null : PENA[s]), linha: ps ? ps.padrao : null, corDe: ps ? "padrão de apresentação" : "cor RA (sem filtro na fonte)" };
    });
    u.familias.forEach(function (fid) { var f = achaFamilia(fid); if (f) fams.push(copia(f)); else faltam.push(fid); });
    sist.forEach(function (s) { if (!s.layer) avisos.push("sistema \"" + s.nome + "\" sem layer no PADRAO-PRANCHA-HIDRO: layer a definir (não inventado)"); });
    var filtros = sist.map(function (s) { var f = P ? P.filtroDoSistema(s.id) : null; return { id: f && f.id || "filtro-" + s.id, nome: s.abrev + " — " + s.nome, sistema: s.id, cor: s.cor, layer: s.layer, pena: s.pena, regra: f ? f.regras || f.regra || null : null }; });
    var nv = NIVL(), pr = pranchasDe(u), tra = TRA(), est = {};
    if (tra && tra.obter) { try { var base = tra.obter("ra-tpl-residencial-terreo", { obter: function () { return null; } }); est = base && base.estilos2d ? copia(base.estilos2d) : {}; } catch (e) { est = {}; } }
    var liga = u.liga || {};
    return {
      nome: "RA — " + u.nome, descricao: u.descricao, niveis: [], tiposParede: [], tiposLaje: [], materiais: materiaisDe(sist), estilos2d: est,
      prancha: { formato: "A1", orientacao: "paisagem", carimbo: { modelo: "RA" }, codigo: u.prefixo, padrao: "docs/hidro/PADRAO-PRANCHA-HIDRO.md v1.0",
                 coluna: [{ titulo: "Notas", itens: copia(NOTAS) }], gerar: pr },
      familias: fams,
      hidro: {
        versao: 2, tipo: "disciplina", id: u.id, disciplina: u.nome, prefixo: u.prefixo,
        sistemas: sist, tiposTubo: tiposTubo(sist), filtros: filtros, modelosVista: modelosDe(u),
        nivelDetalhe: nv ? copia(nv.PADRAO_VISTA) : null, pranchas: pr, rotulos: rotulosDe(u),
        parametrosProjeto: PARAM_BASE.concat(u.parametros || []),
        dimensionamento: { aq: { ligado: !!liga.aq }, ap: { ligado: !!liga.ap }, inc: { ligado: !!liga.inc }, tr: { ligado: !!liga.tr }, ind: { ligado: !!liga.ind, fluido: u.fluido || null } },
        clima: u.clima ? { ligado: true, edificacao: "comercial", aviso: "uso e ocupação por ambiente na tela da climatização" } : null,
        familiasIds: u.familias.slice(), decisoes: copia(u.decisoes),
        avisos: avisos.concat(faltam.map(function (f) { return "família " + f + " não carregou: template sem ela"; }))
      }
    };
  }

  /* --------------------------------------------------------- MONTAGEM */
  function sistemaInfo(u) {
    var B = BI(), SS = B ? B.SISTEMAS : {}, MM = B ? B.MATERIAIS : {};
    return ORDEM.filter(function (s) { return tem(u.sistemas, s); }).map(function (s) {
      var S = SS[s] || {}, m = S.material || null;
      return { id: s, nome: S.nome || s, abrev: S.abrev || "", cor: S.cor || null, material: m, materialNome: m && MM[m] ? MM[m].nome : null,
               materiaisPermitidos: copia(arr(S.materiais)), layer: LAYER[s] || null, pena: PENA[s] == null ? null : PENA[s] };
    });
  }
  function materiaisDe(sist) {
    var B = BI(), MM = B ? B.MATERIAIS : {}, visto = {}, out = [];
    sist.forEach(function (s) {
      if (!s.material || visto[s.material]) return;
      visto[s.material] = 1;
      var M = MM[s.material] || {};
      out.push({ nome: M.nome || s.material, id: s.material, cor: s.cor, classe: CLASSE_MATERIAL[s.material] || null, pesoEspecifico: null, fonte: M.norma || "" });
    });
    return out;
  }
  function folhasDe(u, sist) {
    var f = [], ids = sist.map(function (s) { return s.id; });
    ["agua_fria", "agua_quente", "esgoto", "pluvial"].forEach(function (s) { if (tem(ids, s)) f.push({ tipo: "planta", sistema: s, titulo: "PLANTA DE " + NOME_FOLHA[s] + " (uma por pavimento)" }); });
    if (tem(ids, "incendio")) f.push({ tipo: "incendio", sistema: "incendio", titulo: "PLANTA DE INCÊNDIO - HIDRANTES E EXTINTORES (uma por pavimento)" });
    if (tem(ids, "industrial")) f.push({ tipo: "planta", sistema: "industrial", titulo: "PLANTA DE FLUIDO INDUSTRIAL (se ligado)" });
    f.push({ tipo: "tratamento", sistema: "tratamento", titulo: "TRATAMENTO - PLANTA E CORTE DAS UNIDADES (se ligado)" });
    ["agua_fria", "esgoto"].forEach(function (s) { if (tem(ids, s)) f.push({ tipo: "isometrico", sistema: s, titulo: "ISOMÉTRICO DE " + NOME_FOLHA[s] + " (um por ambiente molhado)" }); });
    f.push({ tipo: "esquema", sistema: "agua_fria+esgoto", titulo: "ESQUEMA VERTICAL - ÁGUA FRIA E ESGOTO" });
    f.push({ tipo: "detalhes", sistema: "todos", titulo: "DETALHES TÍPICOS" });
    return f;
  }
  function parametros(u) {
    var d = u.dim || {};
    return {
      uso: u.uso,
      aq: { ligado: !!d.aq, tipo: "passagem", energia: "gas" },       /* o padrão da própria tela (hidcalcui E.aq) */
      ap: { ligado: !!d.ap },
      inc: { ligado: !!d.inc, ocupacao: u.ocup },
      tr: { ligado: !!d.tr },
      ind: { ligado: !!d.ind }
    };
  }
  function normasDe(u) {
    return {
      programa: ["programa.consumo_per_capita", "programa.populacao", "programa.reservacao", "programa.aparelhos_minimos"],
      agua_fria: ["af.pressao.dinamica_minima_ponto", "af.velocidade.maxima"],
      esgoto: ["es.declividade_minima", "es.uhc_aparelhos"],
      incendio: ["in.it01.classificacao_ocupacao", "in.it01.exigencias_por_ocupacao"],
      clima: ["cl.ocupacao.densidade", "cl.pessoas.calor", "cl.ar_exterior_re9_2003", "cl.condicoes_externas_mg_ashrae_tmyx"],
      aviso: "Chaves do HidNormas: o valor é lido da tabela no cálculo, com edição e página. O template não guarda número de norma."
    };
  }
  function climaDe(u) {
    var c = u.clim || {};
    return { ligado: true, edificacao: c.edificacao, usos: copia(c.usos), familias: copia(c.familias),
             condicaoInterna: "centro da faixa de verão da tabela cl.ar_exterior_re9_2003 (padrão do motor, sem digitar)",
             ocupacao: "densidade da tabela cl.ocupacao.densidade pelo uso do ambiente; pessoas informadas no ambiente valem mais",
             pmoc: c.pmoc };
  }

  /* a família pelo id, nas três bibliotecas (hidfamilias, climfamilias, hidtanques) */
  function achaFamilia(fid) {
    var fontes = [Fam(), Clim(), Tanq()], i, f;
    for (i = 0; i < fontes.length; i++) { if (fontes[i]) { try { f = fontes[i].porId(fid); } catch (e) { f = null; } if (f) return f; } }
    return null;
  }

  /* o objeto do template: o que vai DENTRO do .optpl (campos do formato v1 + o bloco `hidro`) */
  function obter(id) {
    var u = acharUso(id); if (!u) { var dz = acharDisc(id); return dz ? obterDisc(dz) : null; }
    var sist = sistemaInfo(u), avisos = [], fams = [], faltam = [];
    u.familias.concat(u.clim.familias).forEach(function (fid) {
      var f = achaFamilia(fid);
      if (f) fams.push(copia(f)); else faltam.push(fid);
    });
    sist.forEach(function (s) { if (!s.layer) avisos.push("sistema \"" + s.nome + "\" sem layer no PADRAO-PRANCHA-HIDRO: layer a definir (não inventado)"); });
    var tra = TRA(), est = {};
    if (tra && tra.obter) { try { var base = tra.obter("ra-tpl-residencial-terreo", { obter: function () { return null; } }); est = base && base.estilos2d ? copia(base.estilos2d) : {}; } catch (e) { est = {}; } }
    var t = {
      nome: "RA — Hidrossanitário e climatização · " + u.nome,
      descricao: u.descricao,
      niveis: [],                  /* os níveis são os da arquitetura da obra: o template não cria nível */
      tiposParede: [], tiposLaje: [],
      materiais: materiaisDe(sist),
      estilos2d: est,
      prancha: { formato: "A1", orientacao: "paisagem", carimbo: { modelo: "RA" }, codigo: "HID", padrao: "docs/hidro/PADRAO-PRANCHA-HIDRO.md v1.0",
                 folhas: folhasDe(u, sist), coluna: [{ titulo: "Notas", itens: copia(NOTAS) }] },
      familias: fams,
      hidro: {
        versao: 1, id: u.id, uso: u.uso,
        sistemas: sist,
        filtros: sist.map(function (s) { return { id: "filtro-" + s.id, nome: s.abrev + " — " + s.nome, sistema: s.id, cor: s.cor, layer: s.layer, pena: s.pena }; }),
        dimensionamento: parametros(u),
        clima: climaDe(u),
        normas: normasDe(u),
        familiasIds: u.familias.concat(u.clim.familias),
        decisoes: copia(u.decisoes),
        avisos: avisos.concat(faltam.map(function (f) { return "família " + f + " não carregou: template sem ela"; }))
      }
    };
    return t;
  }

  function lista() {
    return USOS.map(function (u) {
      var sist = sistemaInfo(u);
      return { id: u.id, nome: u.nome, descricao: u.descricao, uso: u.uso, ocupacao: u.ocup,
               sistemas: sist.map(function (s) { return s.id; }), familias: u.familias.length + u.clim.familias.length, decisoes: u.decisoes.length };
    });
  }

  function paraOptpl(id, meta) {
    var O = OpF(), t = obter(id);
    if (!O) throw new Error("hidtemplates: js/opformato.js não carregou");
    if (!t) throw new Error("hidtemplates: template \"" + id + "\" não existe");
    return O.templateParaArquivo(t, meta || { app: "OrçaPRO", autor: "RA Engenharia", descricao: t.descricao });
  }

  /* ------------------------------------------------------------ APLICAR
   * estado = o da tela do hidrossanitário ({ uso, valores, populacao, aq, ap, inc, tr, ind, … }); pode ser
   * vazio. Devolve o estado NOVO (clone) e a lista do que mudou. Nunca altera o objeto recebido. */
  function aplicar(estadoProjeto, id) {
    var u = acharUso(id);
    if (!u && acharDisc(id)) return aplicarDisc(estadoProjeto, acharDisc(id));
    if (!u) return { ok: false, erros: ["template \"" + txt(id) + "\" não existe"], estado: copia(estadoProjeto || {}), mudancas: [] };
    var ant = estadoProjeto && typeof estadoProjeto === "object" ? estadoProjeto : {}, novo = copia(ant), mud = [];
    function por(grupo, campo, valor) {
      var alvo = grupo ? (novo[grupo] = novo[grupo] && typeof novo[grupo] === "object" ? novo[grupo] : {}) : novo;
      var antes = alvo[campo];
      if (JSON.stringify(antes) !== JSON.stringify(valor)) { mud.push({ campo: (grupo ? grupo + "." : "") + campo, de: antes === undefined ? null : antes, para: valor }); alvo[campo] = copia(valor); }
    }
    var p = parametros(u);
    por(null, "uso", p.uso);
    /* "ligado" é MERGE: o template só LIGA o que traz; o que o usuário já ligou continua ligado (obra sem rede de esgoto, incêndio exigido…) */
    var preservados = [];
    ["aq", "ap", "inc", "tr", "ind"].forEach(function (g) {
      Object.keys(p[g]).forEach(function (k) {
        var v = p[g][k];
        if (k === "ligado" && !v && ant[g] && ant[g].ligado === true) { v = true; preservados.push(g + ".ligado"); }
        por(g, k, v);
      });
    });
    por(null, "clima", climaDe(u));
    por(null, "hidTemplate", u.id);
    var sist = sistemaInfo(u), t = obter(id);
    return { ok: true, id: u.id, nome: u.nome, estado: novo, mudancas: mud, sistemas: sist, materiais: materiaisDe(sist),
             familias: u.familias.concat(u.clim.familias), filtros: t.hidro.filtros, prancha: t.prancha,
             preservados: preservados, naoToca: ["valores (porte)", "populacao", "alim (alimentação)", "rec (recalque)"], decisoes: copia(u.decisoes), avisos: copia(t.hidro.avisos) };
  }

  /* o template POR DISCIPLINA na tela do cálculo: só LIGA o que a disciplina usa (nunca desliga), marca o template e devolve
     a configuração das pranchas — o resto (uso, porte, população) é da obra */
  function aplicarDisc(estadoProjeto, u) {
    var ant = estadoProjeto && typeof estadoProjeto === "object" ? estadoProjeto : {}, novo = copia(ant), mud = [];
    function por(grupo, campo, valor) {
      var alvo = grupo ? (novo[grupo] = novo[grupo] && typeof novo[grupo] === "object" ? novo[grupo] : {}) : novo;
      if (JSON.stringify(alvo[campo]) !== JSON.stringify(valor)) { mud.push({ campo: (grupo ? grupo + "." : "") + campo, de: alvo[campo] === undefined ? null : alvo[campo], para: valor }); alvo[campo] = copia(valor); }
    }
    Object.keys(u.liga || {}).forEach(function (g) { if (u.liga[g]) por(g, "ligado", true); });
    if (u.fluido && !(novo.ind && novo.ind.fluido)) por("ind", "fluido", { tipo: u.fluido });
    if (u.clima && !(novo.clima && novo.clima.ligado)) por(null, "clima", { ligado: true, edificacao: "comercial", usos: [] });
    por(null, "hidTemplate", u.id);
    var t = obterDisc(u);
    return { ok: true, id: u.id, nome: u.nome, estado: novo, mudancas: mud, sistemas: t.hidro.sistemas, materiais: t.materiais, familias: u.familias.slice(), filtros: t.hidro.filtros,
             prancha: t.prancha, pranchas: t.hidro.pranchas, modelosVista: t.hidro.modelosVista, parametrosProjeto: t.hidro.parametrosProjeto, preservados: [],
             naoToca: ["uso", "valores (porte)", "populacao", "alim (alimentação)", "rec (recalque)"], decisoes: copia(u.decisoes), avisos: copia(t.hidro.avisos) };
  }
  function listaDisciplinas() {
    return TODAS_DISC.map(function (u) { return { id: u.id, nome: u.nome, descricao: u.descricao, prefixo: u.prefixo, sistemas: u.sistemas.slice(), familias: u.familias.length, completo: !!u.completo }; });
  }

  /* ------------------------------------------------------------ VERIFICAR
   * coerência com o resto do código: família que não existe, material fora da lista do sistema,
   * sistema que o biminst não conhece, uso sem linha no HidNormas, ocupação fora da tabela. */
  function verificar(id, deps) {
    deps = deps || {};
    var u = acharUso(id), p = [];
    if (!u && acharDisc(id)) {
      var dz = acharDisc(id), Bd = BI(), Pd = PADR();
      dz.familias.forEach(function (fid) { if (!achaFamilia(fid)) p.push("família inexistente: " + fid); });
      dz.sistemas.forEach(function (s) { if (!Bd || !Bd.SISTEMAS[s]) p.push("sistema desconhecido no biminst: " + s); });
      if (Pd) dz.modelos.forEach(function (m) { if (!Pd.modelo(m)) p.push("modelo de vista inexistente no padrão: " + m); });
      return p;
    }
    if (!u) return ["template \"" + txt(id) + "\" não existe"];
    var B = BI(), N = deps.HidNormas || global.HidNormas || null;
    u.familias.concat(u.clim.familias).forEach(function (fid) {
      if (!achaFamilia(fid)) p.push("família inexistente: " + fid);
    });
    sistemaInfo(u).forEach(function (s) {
      if (!B || !B.SISTEMAS[s.id]) p.push("sistema desconhecido no biminst: " + s.id);
      else if (!tem(B.SISTEMAS[s.id].materiais, s.material)) p.push("material " + s.material + " fora da lista do sistema " + s.id);
      else if (!B.MATERIAIS[s.material]) p.push("material desconhecido no biminst: " + s.material);
    });
    if (N) {
      var linhas = []; try { linhas = arr(N.linhas("programa.consumo_per_capita")); } catch (e) {}
      if (!linhas.some(function (l) { return l.uso === u.uso; })) p.push("uso \"" + u.uso + "\" sem linha em programa.consumo_per_capita do HidNormas");
      var cl = []; try { cl = arr(N.linhas("in.it01.classificacao_ocupacao")); } catch (e2) {}
      if (!cl.some(function (l) { return l.divisao === u.ocup; })) p.push("divisão de ocupação \"" + u.ocup + "\" fora de in.it01.classificacao_ocupacao");
      var ch = N.chaves ? N.chaves() : [], nm = normasDe(u);
      ["programa", "agua_fria", "esgoto", "incendio", "clima"].forEach(function (g) { nm[g].forEach(function (k) { if (ch.indexOf(k) < 0) p.push("chave de norma inexistente no HidNormas: " + k); }); });
    }
    var CC = deps.ClimCarga || global.ClimCarga;
    if (CC && CC.ATIVIDADE_DO_USO) arr(u.clim.usos).forEach(function (x) { if (!Object.prototype.hasOwnProperty.call(CC.ATIVIDADE_DO_USO, x)) p.push("uso de ambiente \"" + x + "\" desconhecido no ClimCarga"); });
    return p;
  }

  var HidTemplates = { VERSAO: 2, lista: lista, obter: obter, paraOptpl: paraOptpl, aplicar: aplicar, verificar: verificar, ids: function () { return USOS.map(function (u) { return u.id; }); },
                       disciplinas: listaDisciplinas, idsDisciplinas: function () { return TODAS_DISC.map(function (u) { return u.id; }); }, PARAM_BASE: PARAM_BASE,
                       ORDEM: ORDEM, LAYER: LAYER, NOTAS: NOTAS };
  global.HidTemplates = HidTemplates;
  if (typeof module !== "undefined" && module.exports) module.exports = HidTemplates;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

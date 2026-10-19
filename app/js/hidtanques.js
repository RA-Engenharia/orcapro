/* =====================================================================
 * hidtanques.js — TANQUES PARAMÉTRICOS do tratamento (fossa, filtro,
 * sumidouro, vala, UASB, floculador, decantador, filtro da ETA). Fase 4 do
 * plano docs/hidro/PLANO-HIDROSSANITARIO.md; contrato em
 * docs/hidro/CONTRATO-TRATAMENTO.md.
 *
 * O PEDIDO: "tanques parametrizados que vão estar configurados de acordo com
 * a quantidade que chega de volume". Por isso as COTAS das famílias são
 * FÓRMULAS (js/familia.js, avaliador próprio, sem eval) da VAZÃO e do TEMPO
 * DE DETENÇÃO que o motor entrega:
 *     Volume_util = Vazao_m3_dia × TDH_dia + Volume_extra_m3
 *     Largura     = teto(máx(Largura_min; √(V / (h · Relacao_CL))))      (cm)
 *     Comprimento = teto(máx(Relacao_CL · Largura; V / (h · Largura)))   (cm)
 * Mudou a vazão → o tanque muda de tamanho, sem ninguém redesenhar.
 * As mesmas contas estão no motor (hidtrat/hidete/hideta) e o teste confere
 * que a família reproduz as dimensões do motor (se divergir, um dos dois
 * está errado e o desenho sairia diferente do memorial).
 *
 * ⚠ Nenhum valor de norma aqui: os limites (largura mínima, relação, altura,
 *   desnível…) chegam como parâmetro de INSTÂNCIA vindo do motor, que os lê
 *   do HidNormas. Os números escritos abaixo são GEOMETRIA DE RESERVA (espessura
 *   de parede, borda livre) — o cálculo estrutural define; ficam listados em
 *   "Conferir" e marcados hid:ok (tools/test-hid-sem-numero-magico.js).
 * ⚠ Convenção local (familia.js): origem no FUNDO EXTERNO, no centro da
 *   planta; X = comprimento (entrada em −X, saída em +X), Y para cima.
 *   A instância é colocada com y = cota do fundo externo.
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function Fam() { return dep("Familia", "./familia.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v !== null && v !== undefined && v !== "" && isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }                    /* hid:ok arredondamento de coordenada (0,1 mm) */
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  var PSET = "RA_Hidro";
  /* ⚠ teto ao centímetro com a MESMA tolerância do HidTrat.util.teto2 (1e-7 em cm): sem ela, 1,0000000002 m
     virava 1,01 m na família e 1,00 m no motor — o desenho e o memorial divergiam por um ponto flutuante */
  function TETO(expr) { return "teto((" + expr + ") * 100 - 0,0000001) / 100"; }

  /* ACABAMENTO (geometria fiel, 17/10/2026): tubos de entrada e de saída como cilindros que saem da parede até 0,2 m
     (o raio é o DN/2; sem DN, raio de reserva 0,05 m) — o conector fica na face da parede, na geratriz inferior do tubo */
  var R_ENT = "se(DN_entrada > 0; DN_entrada / 2000; 0.05)", R_SAI = "se(DN_saida > 0; DN_saida / 2000; 0.05)";
  function tubo(id, nome, x, cota, rExpr) {
    return { id: id, nome: nome, forma: "cilindro", eixo: "x", x: x, y: cota + " + " + rExpr, z: "0", raio: rExpr, altura: "0.2", material: "PVC" };
  }

  function P(nome, tipoDado, escopo, valor, grupo, descricao, formula) {
    var p = { nome: nome, tipoDado: tipoDado, escopo: escopo, valor: valor, grupo: grupo, descricao: descricao };
    if (formula) p.formula = formula;
    return p;
  }
  var GEO = "Dimensões", HID = PSET, EST = "Estrutura (reserva)";

  /* parâmetros de vazão → volume (iguais nas duas formas) */
  function paramsVolume() {
    return [
      P("Funcao", "texto", "instancia", "", HID, "Função da unidade (tanque séptico, filtro anaeróbio, UASB, decantador…)"),
      P("Vazao_m3_dia", "numero", "instancia", 0, HID, "Vazão que chega (m³/dia) — vem do motor (HidTrat/HidETE/HidETA)"),
      P("TDH_dia", "numero", "instancia", 0, HID, "Tempo de detenção hidráulica (dia) — vem do motor, com a edição da norma"),
      P("Volume_extra_m3", "volume", "instancia", 1, HID, "Volume que não depende da vazão (parcela fixa + lodo do tanque séptico; volume mínimo do filtro) — vem do motor"),
      P("Volume_min_m3", "volume", "instancia", 0, HID, "Volume mínimo da norma (piso; ex.: filtro anaeróbio) — vem do motor; 0 = sem piso"),
      P("Volume_util", "volume", "tipo", 0, HID, "Volume útil = máx(Vazao × TDH + Volume_extra; Volume_min)", "max(Vazao_m3_dia * TDH_dia + Volume_extra_m3; Volume_min_m3)"),
      P("Profundidade_util", "comprimento", "instancia", 1, GEO, "Profundidade útil (lâmina, ou leito do filtro) — vem do motor (faixa da norma)"),
      P("Fundo_falso", "comprimento", "instancia", 0, GEO, "Altura do fundo falso DENTRO da altura útil (17076 D.2.3: altura útil = fundo falso + meio suporte) — 0 = sem fundo falso"),
      P("Desnivel_ES", "comprimento", "instancia", 0, GEO, "Desnível entre a entrada e a saída — vem do motor (norma)"),
      P("Altura_livre", "comprimento", "instancia", 0.3, GEO, "Folga acima da entrada até a laje — vem do motor (17076 A.4: nível de água → laje ≥ 0,30 m); sem ela, geometria de reserva"),   /* hid:ok geometria de reserva (não é norma) */
      P("Tampa_diametro", "comprimento", "instancia", 0, GEO, "Tampa de inspeção (diâmetro livre) — vem do motor; 0 = sem tampa desenhada"),
      P("DN_tubo_guia", "numero", "instancia", 0, HID, "DN do tubo-guia de limpeza (mm) — vem do motor; 0 = sem"),
      P("DN_entrada", "numero", "instancia", 0, HID, "DN da entrada (mm). 0 = o dimensionamento (HidES) define"),
      P("DN_saida", "numero", "instancia", 0, HID, "DN da saída (mm). 0 = o dimensionamento (HidES) define"),
      P("Espessura_fundo", "comprimento", "tipo", 0.15, EST, "Laje de fundo — GEOMETRIA DE RESERVA (o cálculo estrutural define)"),       /* hid:ok geometria de reserva */
      P("Espessura_tampa", "comprimento", "tipo", 0.1, EST, "Laje de tampa — GEOMETRIA DE RESERVA (o cálculo estrutural define)"),        /* hid:ok geometria de reserva */
      P("Espessura_fundo_falso", "comprimento", "tipo", 0.08, EST, "Laje perfurada do fundo falso — GEOMETRIA DE RESERVA"),              /* hid:ok geometria de reserva */
      P("Material", "material", "tipo", "Concreto armado", "Materiais", "Material de aparência"),
      P("Conferir", "texto", "tipo", "Espessuras de parede/fundo/tampa e borda livre são geometria de reserva: o cálculo estrutural e o RT definem.", HID, "O que conferir"),
      P("A_conferir", "simnao", "tipo", true, HID, "Há cota de reserva a conferir")
    ];
  }

  /* ---------------------------------------------------------------- RETANGULAR */
  function retangular(sistema) {
    var ps = paramsVolume().concat([
      P("Relacao_CL", "numero", "instancia", 1, GEO, "Relação comprimento/largura adotada — vem do motor (faixa da norma ou geometria)"),
      P("Largura_min", "comprimento", "instancia", 0, GEO, "Largura interna mínima — vem do motor (norma)"),
      P("Largura", "comprimento", "tipo", 0, GEO, "Largura interna (fórmula do volume)", TETO("max(Largura_min; raiz(Volume_util / (Profundidade_util * Relacao_CL)))")),
      P("Comprimento", "comprimento", "tipo", 0, GEO, "Comprimento interno (fórmula do volume)", TETO("max(Relacao_CL * Largura; Volume_util / (Profundidade_util * Largura))")),
      P("Volume_real", "volume", "tipo", 0, HID, "Volume útil desenhado (≥ Volume_util)", "Comprimento * Largura * Profundidade_util"),
      P("Compartimentos", "inteiro", "instancia", 1, GEO, "Câmaras em série (1 a 4): paredes divisórias iguais"),
      P("Espessura_parede", "comprimento", "tipo", 0.15, EST, "Parede — GEOMETRIA DE RESERVA (o cálculo estrutural define)"),           /* hid:ok geometria de reserva */
      P("Cota_saida", "comprimento", "tipo", 0, HID, "Geratriz inferior da saída, a partir do fundo externo (o volume útil fica todo abaixo dela)", "Espessura_fundo + Profundidade_util"),
      P("Cota_entrada", "comprimento", "tipo", 0, HID, "Geratriz inferior da entrada, a partir do fundo externo", "Cota_saida + Desnivel_ES"),
      P("Altura_interna", "comprimento", "tipo", 0, GEO, "Altura interna", "Profundidade_util + Desnivel_ES + Altura_livre"),
      P("Altura_total", "comprimento", "tipo", 0, GEO, "Altura externa total", "Espessura_fundo + Altura_interna + Espessura_tampa"),
      P("Comprimento_externo", "comprimento", "tipo", 0, GEO, "Comprimento externo", "Comprimento + 2 * Espessura_parede"),
      P("Largura_externa", "comprimento", "tipo", 0, GEO, "Largura externa", "Largura + 2 * Espessura_parede"),
      P("Volume_concreto", "volume", "tipo", 0, EST, "Volume de concreto do casco", "Comprimento_externo * Largura_externa * Altura_total - Comprimento * Largura * Altura_interna")
    ]);
    var sol = [
      { id: "fundo", nome: "Laje de fundo", forma: "caixa", x: "0", y: "0", z: "0", dx: "Comprimento_externo", dy: "Espessura_fundo", dz: "Largura_externa", material: "Material" },
      { id: "p-ent", nome: "Parede da entrada", forma: "caixa", x: "-(Comprimento + Espessura_parede) / 2", y: "Espessura_fundo", z: "0", dx: "Espessura_parede", dy: "Altura_interna", dz: "Largura_externa", material: "Material" },
      { id: "p-sai", nome: "Parede da saída", forma: "caixa", x: "(Comprimento + Espessura_parede) / 2", y: "Espessura_fundo", z: "0", dx: "Espessura_parede", dy: "Altura_interna", dz: "Largura_externa", material: "Material" },
      { id: "p-fre", nome: "Parede lateral", forma: "caixa", x: "0", y: "Espessura_fundo", z: "-(Largura + Espessura_parede) / 2", dx: "Comprimento", dy: "Altura_interna", dz: "Espessura_parede", material: "Material" },
      { id: "p-tra", nome: "Parede lateral", forma: "caixa", x: "0", y: "Espessura_fundo", z: "(Largura + Espessura_parede) / 2", dx: "Comprimento", dy: "Altura_interna", dz: "Espessura_parede", material: "Material" },
      { id: "tampa", nome: "Laje de tampa", forma: "caixa", x: "0", y: "Espessura_fundo + Altura_interna", z: "0", dx: "Comprimento_externo", dy: "Espessura_tampa", dz: "Largura_externa", material: "Material" },
      { id: "ff", nome: "Fundo falso (laje perfurada)", forma: "caixa", x: "0", y: "Espessura_fundo + Fundo_falso - Espessura_fundo_falso", z: "0", dx: "Comprimento", dy: "Espessura_fundo_falso", dz: "Largura", material: "Material", visivel: "Fundo_falso > 0" },
      { id: "insp", nome: "Tampa de inspeção", forma: "cilindro", eixo: "y", x: "0", y: "Altura_total", z: "0", raio: "Tampa_diametro / 2", altura: "Espessura_tampa", material: "Ferro fundido", visivel: "Tampa_diametro > 0" },
      { id: "guia", nome: "Tubo-guia de limpeza", forma: "cilindro", eixo: "y", x: "-Comprimento / 4", y: "Espessura_fundo + Fundo_falso", z: "0", raio: "DN_tubo_guia / 2000", altura: "Altura_interna - Fundo_falso + Espessura_tampa", material: "PVC", visivel: "DN_tubo_guia > 0" }
    ];
    sol.push(tubo("tubo-ent", "Tubo de entrada", "-Comprimento_externo / 2 - 0.2", "Cota_entrada", R_ENT));
    sol.push(tubo("tubo-sai", "Tubo de saída", "Comprimento_externo / 2", "Cota_saida", R_SAI));
    /* divisórias de câmara: até 3 (4 câmaras); escondidas pela fórmula de visibilidade */
    for (var i = 1; i <= 3; i++) {                                                                                        /* hid:ok até 4 câmaras */
      sol.push({ id: "div" + i, nome: "Parede divisória " + i, forma: "caixa", x: "-Comprimento / 2 + " + i + " * Comprimento / Compartimentos", y: "Espessura_fundo", z: "0",
                 dx: "Espessura_parede", dy: "Profundidade_util", dz: "Largura", material: "Material", visivel: "Compartimentos > " + i });
    }
    return {
      id: "hid-tanque-ret-" + (sistema === "esgoto" ? "esgoto" : "agua"), nome: "Tanque retangular paramétrico (" + (sistema === "esgoto" ? "esgoto" : "água") + ")",
      categoria: "equipamento", hospedagem: "livre", pset: PSET, origem: "HidTanques", sistemas: [sistema],
      descricao: "Tanque moldado no local que se dimensiona pela vazão e pelo tempo de detenção (fórmulas). Origem = centro do fundo externo. [Gerada por HidTanques — não editar à mão.]",
      parametros: ps, tipos: [{ id: "t-padrao", nome: "Moldado no local", valores: {} }], solidos: sol,
      conectores: [
        { id: "entrada", nome: "Entrada", sistema: sistema, dn: "DN_entrada", x: "-Comprimento_externo / 2", y: "Cota_entrada", z: "0" },
        { id: "saida", nome: "Saída", sistema: sistema, dn: "DN_saida", x: "Comprimento_externo / 2", y: "Cota_saida", z: "0" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Tanque retangular moldado no local" },
      servicos: [
        { id: "escavacao", descricao: "Escavação", unidade: "m3", quantidade: "Comprimento_externo * Largura_externa * Altura_total" },
        { id: "concreto", descricao: "Concreto do casco", unidade: "m3", quantidade: "Volume_concreto" }
      ]
    };
  }

  /* ---------------------------------------------------------------- CILÍNDRICO (moldado OU produto) */
  function cilindrico(sistema) {
    var ps = paramsVolume().concat([
      P("Diametro_min", "comprimento", "instancia", 0, GEO, "Diâmetro interno mínimo — vem do motor (norma)"),
      P("Diametro_produto", "comprimento", "instancia", 0, HID, "Diâmetro do corpo do PRODUTO do catálogo (0 = moldado no local, diâmetro pela fórmula)"),
      P("Altura_produto", "comprimento", "instancia", 0, HID, "Altura total do produto (catálogo; 0 = moldado)"),
      P("Cota_entrada_produto", "comprimento", "instancia", 0, HID, "Altura do tubo de entrada do produto (catálogo; 0 = moldado)"),
      P("Cota_saida_produto", "comprimento", "instancia", 0, HID, "Altura do tubo de saída do efluente do produto (catálogo; 0 = moldado)"),
      P("Espessura_parede", "comprimento", "tipo", 0.15, EST, "Parede — GEOMETRIA DE RESERVA (moldado)"),                                 /* hid:ok geometria de reserva */
      P("Diametro", "comprimento", "tipo", 0, GEO, "Diâmetro interno (fórmula do volume) ou o do produto",
        "se(Diametro_produto > 0; Diametro_produto; " + TETO("max(Diametro_min; raiz(4 * Volume_util / (pi() * Profundidade_util)))") + ")"),
      P("Diametro_externo", "comprimento", "tipo", 0, GEO, "Diâmetro externo", "se(Diametro_produto > 0; Diametro_produto; Diametro + 2 * Espessura_parede)"),
      P("Volume_real", "volume", "tipo", 0, HID, "Volume útil desenhado (moldado)", "pi() * Diametro ^ 2 / 4 * Profundidade_util"),
      P("Cota_saida", "comprimento", "tipo", 0, HID, "Geratriz inferior da saída, a partir do fundo", "se(Cota_saida_produto > 0; Cota_saida_produto; Espessura_fundo + Profundidade_util)"),
      P("Cota_entrada", "comprimento", "tipo", 0, HID, "Geratriz inferior da entrada, a partir do fundo", "se(Cota_entrada_produto > 0; Cota_entrada_produto; Cota_saida + Desnivel_ES)"),
      P("Altura_total", "comprimento", "tipo", 0, GEO, "Altura total", "se(Altura_produto > 0; Altura_produto; Espessura_fundo + Profundidade_util + Desnivel_ES + Altura_livre + Espessura_tampa)")
    ]);
    return {
      id: "hid-tanque-cil-" + (sistema === "esgoto" ? "esgoto" : "agua"), nome: "Tanque cilíndrico paramétrico (" + (sistema === "esgoto" ? "esgoto" : "água") + ")",
      categoria: "equipamento", hospedagem: "livre", pset: PSET, origem: "HidTanques", sistemas: [sistema],
      descricao: "Tanque cilíndrico: moldado (diâmetro pela fórmula do volume) ou produto do catálogo (cotas do fabricante). Origem = centro do fundo. [Gerada por HidTanques — não editar à mão.]",
      parametros: ps, tipos: [{ id: "t-padrao", nome: "Cilíndrico", valores: {} }],
      solidos: [
        { id: "corpo", nome: "Corpo", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "0", raio: "Diametro_externo / 2", altura: "Altura_total", material: "Material" },
        { id: "insp", nome: "Tampa de inspeção", forma: "cilindro", eixo: "y", x: "0", y: "Altura_total", z: "0", raio: "Tampa_diametro / 2", altura: "Espessura_tampa", material: "Ferro fundido", visivel: "Tampa_diametro > 0" },
        tubo("tubo-ent", "Tubo de entrada", "-Diametro_externo / 2 - 0.2", "Cota_entrada", R_ENT),
        tubo("tubo-sai", "Tubo de saída", "Diametro_externo / 2", "Cota_saida", R_SAI)
      ],
      conectores: [
        { id: "entrada", nome: "Entrada", sistema: sistema, dn: "DN_entrada", x: "-Diametro_externo / 2", y: "Cota_entrada", z: "0" },
        { id: "saida", nome: "Saída", sistema: sistema, dn: "DN_saida", x: "Diametro_externo / 2", y: "Cota_saida", z: "0" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Tanque cilíndrico" }
    };
  }

  /* ---------------------------------------------------------------- SUMIDOURO */
  function sumidouro() {
    return {
      id: "hid-sumidouro", nome: "Sumidouro paramétrico", categoria: "equipamento", hospedagem: "livre", pset: PSET, origem: "HidTanques", sistemas: ["esgoto"],
      descricao: "Sumidouro cilíndrico: a profundidade útil sai da área de infiltração (vazão ÷ coeficiente do ensaio) e do diâmetro. Origem = centro do fundo (sob a brita). [Gerada por HidTanques.]",
      parametros: [
        P("Funcao", "texto", "instancia", "Sumidouro", HID, "Função"),
        P("Vazao_L_dia", "numero", "instancia", 1, HID, "Vazão de efluente que esta unidade recebe (L/dia) — vem do HidTrat"),
        P("Coef_infiltracao", "numero", "instancia", 1, HID, "Taxa máxima de aplicação (L/m².dia) — da Tabela N.1 da 17076 pelo ensaio de percolação"),
        P("Area_infiltracao", "area", "tipo", 0, HID, "Área de infiltração = vazão ÷ coeficiente", "Vazao_L_dia / Coef_infiltracao"),
        P("Diametro", "comprimento", "instancia", 1, GEO, "Diâmetro interno — vem do motor (limitado pela profundidade máxima)"),
        P("Profundidade_util", "comprimento", "tipo", 0, GEO, "Altura útil abaixo da entrada: A = π·D²/4 + π·D·H", TETO("(Area_infiltracao - pi() * Diametro ^ 2 / 4) / (pi() * Diametro)")),
        P("Brita", "comprimento", "instancia", 0, GEO, "Camada de brita no fundo (a 17076 não fixa; 0 = sem camada)"),
        P("Altura_entrada", "comprimento", "instancia", 0.3, GEO, "Da entrada até a tampa — GEOMETRIA DE RESERVA"),                       /* hid:ok geometria de reserva */
        P("Espessura_parede", "comprimento", "tipo", 0.1, EST, "Anel/parede — GEOMETRIA DE RESERVA"),                                     /* hid:ok geometria de reserva */
        P("DN_entrada", "numero", "instancia", 0, HID, "DN da entrada (mm); 0 = o dimensionamento define"),
        P("Cota_entrada", "comprimento", "tipo", 0, HID, "Geratriz inferior da entrada, a partir do fundo", "Brita + Profundidade_util"),
        P("Altura_total", "comprimento", "tipo", 0, GEO, "Altura total", "Brita + Profundidade_util + Altura_entrada"),
        P("Material", "material", "tipo", "Concreto pré-moldado (anéis)", "Materiais", "Material"),
        P("Conferir", "texto", "tipo", "Espessura do anel e altura acima da entrada são geometria de reserva.", HID, "O que conferir"),
        P("A_conferir", "simnao", "tipo", true, HID, "Há cota de reserva a conferir")
      ],
      tipos: [{ id: "t-padrao", nome: "Sumidouro", valores: {} }],
      solidos: [
        { id: "corpo", nome: "Anéis", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "0", raio: "Diametro / 2 + Espessura_parede", altura: "Altura_total", material: "Material" },
        { id: "brita", nome: "Brita", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "0", raio: "Diametro / 2", altura: "Brita", material: "Brita", visivel: "Brita > 0" },
        { id: "tampa", nome: "Tampa de inspeção", forma: "cilindro", eixo: "y", x: "0", y: "Altura_total", z: "0", raio: "(Diametro / 2 + Espessura_parede) * 0.35", altura: "0.06", material: "Ferro fundido" },
        tubo("tubo-ent", "Tubo de entrada", "-(Diametro / 2 + Espessura_parede) - 0.2", "Cota_entrada", R_ENT)
      ],
      conectores: [{ id: "entrada", nome: "Entrada", sistema: "esgoto", dn: "DN_entrada", x: "-(Diametro / 2 + Espessura_parede)", y: "Cota_entrada", z: "0" }],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Sumidouro" },
      servicos: [{ id: "escavacao", descricao: "Escavação", unidade: "m3", quantidade: "pi() * (Diametro / 2 + Espessura_parede) ^ 2 * Altura_total" }]
    };
  }

  /* ---------------------------------------------------------------- VALA DE INFILTRAÇÃO */
  function vala() {
    return {
      id: "hid-vala-infiltracao", nome: "Vala de infiltração paramétrica", categoria: "equipamento", hospedagem: "livre", pset: PSET, origem: "HidTanques", sistemas: ["esgoto"],
      descricao: "Vala: o comprimento sai da vazão ÷ (coeficiente do ensaio × largura × nº de valas). Origem = centro do fundo. [Gerada por HidTanques.]",
      parametros: [
        P("Funcao", "texto", "instancia", "Vala de infiltração", HID, "Função"),
        P("Vazao_L_dia", "numero", "instancia", 1, HID, "Vazão de efluente (L/dia) — vem do HidTrat"),
        P("Coef_infiltracao", "numero", "instancia", 1, HID, "Taxa máxima de aplicação (L/m².dia) — da Tabela N.1 da 17076 pelo ensaio de percolação"),
        P("Largura", "comprimento", "instancia", 1, GEO, "Largura útil — vem do motor (mínima da norma ou módulo do catálogo)"),
        P("N_valas", "inteiro", "instancia", 1, GEO, "Número de valas entre as quais a vazão se divide (1 = esta vala recebe a vazão informada)"),
        P("Comprimento", "comprimento", "tipo", 0, GEO, "Comprimento = vazão ÷ (coeficiente × largura × nº de valas)", TETO("Vazao_L_dia / (Coef_infiltracao * Largura * N_valas)")),
        P("Altura", "comprimento", "instancia", 1, GEO, "Altura da vala — vem do motor (faixa da norma)"),
        P("DN_distribuicao", "numero", "instancia", 0, HID, "DN do tubo de distribuição (mm); 0 = a definir"),
        P("Material", "material", "tipo", "Brita", "Materiais", "Material")
      ],
      tipos: [{ id: "t-padrao", nome: "Vala", valores: {} }],
      solidos: [{ id: "vala", nome: "Vala (brita)", forma: "caixa", x: "0", y: "0", z: "0", dx: "Comprimento", dy: "Altura", dz: "Largura", material: "Material" }],
      conectores: [{ id: "entrada", nome: "Entrada", sistema: "esgoto", dn: "DN_distribuicao", x: "-Comprimento / 2", y: "Altura", z: "0" }],
      quantitativo: { unidade: "m", quantidade: "Comprimento", codigo: "", fonte: "", descricao: "Vala de infiltração" }
    };
  }

  var CACHE = null;
  function familias() {
    if (CACHE) return CACHE;
    CACHE = [retangular("esgoto"), retangular("agua_fria"), cilindrico("esgoto"), cilindrico("agua_fria"), sumidouro(), vala()];
    return CACHE;
  }
  function porId(id) { var t = familias(); for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i]; return null; }
  function ids() { return familias().map(function (f) { return f.id; }); }

  /* unidade do motor → família */
  function famIdDe(u) {
    var agua = u.sistema === "agua_fria";
    if (u.forma === "sumidouro") return "hid-sumidouro";
    if (u.forma === "vala") return "hid-vala-infiltracao";
    if (u.forma === "cilindrica") return agua ? "hid-tanque-cil-agua" : "hid-tanque-cil-esgoto";
    if (u.forma === "retangular" || u.forma === "prismatica") return agua ? "hid-tanque-ret-agua" : "hid-tanque-ret-esgoto";
    return null;
  }
  function instancia(u) {
    var famId = famIdDe(u);
    if (!famId) return null;
    var inst = copia(u.param || {});
    if (u.nome) inst.Funcao = u.nome;
    return { famId: famId, tipoId: "t-padrao", inst: inst };
  }
  function avaliar(u) {
    var i = instancia(u), F = Fam();
    if (!i || !F) return { ok: false, erros: [!i ? "unidade sem família (forma \"" + u.forma + "\")" : "js/familia.js não carregou"] };
    var r = F.avaliar(porId(i.famId), i.tipoId, i.inst);
    r.famId = i.famId;
    return r;
  }
  /* as famílias de que um conjunto precisa (para registrar no projeto antes das ops) */
  function familiasDoConjunto(unidades) {
    var vistos = {}, out = [];
    arr(unidades).forEach(function (u) { var id = famIdDe(u); if (id && !vistos[id]) { vistos[id] = 1; out.push(copia(porId(id))); } });
    return out;
  }
  function paraOpfam(id, meta) {
    var f = porId(id), OpF = dep("OpFormato", "./opformato.js");
    if (!f) throw new Error("hidtanques: família \"" + id + "\" não existe");
    if (!OpF) throw new Error("hidtanques: js/opformato.js não carregou");
    return OpF.familiaParaArquivo(f, meta || { autor: "RA Engenharia", descricao: f.nome + " — tanque paramétrico do tratamento" });
  }

  /* ---------------------------------------------------------------- COLOCAR NO MODELO
   * opc = { origem: {x, y, z}  — ponto onde o coletor chega (y = cota da GERATRIZ INFERIOR do tubo),
   *         declividade (m/m)  — da chegada; sem ela: es.declividade_minima do HidNormas pelo DN;
   *         dn (mm)            — DN das ligações entre unidades (o do coletor que chega),
   *         espacamento_m      — folga entre unidades (o motor manda o afastamento da norma),
   *         prefixo }
   * Linhas em paralelo (u.linha) vão lado a lado em Z; a disposição final depois, em X.
   * As cotas de fundo saem da chegada descendo a declividade em cada ligação. */
  function conectorDe(av, id) { var cs = arr(av.conectores); for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i]; return null; }
  function declividadeDe(opc, avisos, pend) {
    if (num(opc.declividade, null) != null) return num(opc.declividade, null);
    var H = dep("HidNormas", "./hidnormas.js"), dn = num(opc.dn, null);
    if (H && dn != null) {
      var ls = H.linhas("es.declividade_minima", {}) || [], ach = null;
      ls.forEach(function (l) { if (ach == null && (l.dn_max === "*" || num(l.dn_max, 0) >= dn)) ach = num(l.declividade_pct, null); });
      if (ach != null) { avisos.push({ gravidade: "info", texto: "ligações entre unidades com a declividade mínima do esgoto para DN " + dn + ": " + ach + " % (es.declividade_minima)", corrigir: null }); return ach / 100; }
    }
    pend.push({ chave: "opc.declividade", motivo: "sem a declividade da chegada (nem DN para a mínima da norma) as cotas de fundo ficam no nível da chegada" });
    avisos.push({ gravidade: "aviso", texto: "declividade das ligações não informada: unidades no mesmo nível da chegada (cotas de fundo NÃO definitivas)", corrigir: { texto: "informar opc.declividade (m/m) ou opc.dn (o DN do coletor) para usar a mínima da norma" } });
    return 0;
  }
  function opsConjunto(unidades, opc) {
    opc = opc || {};
    var o0 = opc.origem || { x: 0, y: 0, z: 0 }, pre = opc.prefixo || "trat", esp = num(opc.espacamento_m, 0), avisos = [], pend = [];
    var i0 = declividadeDe(opc, avisos, pend), ops = [], desf = [], pos = [], porLinha = {}, disp = [];
    arr(unidades).forEach(function (u) {
      if (u.forma === "sumidouro" || u.forma === "vala") disp.push(u);
      else { var k = u.linha || 0; (porLinha[k] = porLinha[k] || []).push(u); }
    });
    if (esp === 0) avisos.push({ gravidade: "aviso", texto: "espaçamento entre unidades não informado: encostadas", corrigir: { texto: "informar opc.espacamento_m (afastamento mínimo da norma entre tanque, filtro e disposição)" } });
    function ligar(id, a, b, dn) {
      if (!(num(dn, 0) > 0)) { avisos.push({ gravidade: "aviso", texto: "ligação " + id + " sem DN: não criada", corrigir: { texto: "informar opc.dn (DN do coletor que chega) ou o DN de saída da unidade" } }); return; }
      ops.push({ op: "trecho", id: id, sistema: "esgoto", material: "pvc_esgoto", dn: dn, p1: { x: r4(a.x), y: r4(a.y), z: r4(a.z) }, p2: { x: r4(b.x), y: r4(b.y), z: r4(b.z) } });
      desf.push({ op: "apagar", id: id });
    }
    function colocar(u, xIni, z, cotaEntrada, xEntrada) {
      var av = avaliar(u);
      if (!av.ok) { avisos.push({ gravidade: "erro", texto: "família de " + u.id + " não avaliou: " + arr(av.erros).join("; "), corrigir: null }); return null; }
      var ce = conectorDe(av, "entrada"), cs = conectorDe(av, "saida"), cx = av.caixa || { x0: 0, x1: 0, z0: 0, z1: 0 };
      var X = xEntrada != null && ce ? xEntrada - ce.x : xIni - cx.x0, Y = cotaEntrada - (ce ? ce.y : 0), id = pre + "-" + u.id, inst = instancia(u);
      ops.push({ op: "familia", id: id, famId: inst.famId, tipoId: inst.tipoId, x: r4(X), y: r4(Y), z: r4(z), rotY: 0, inst: inst.inst });
      desf.push({ op: "apagar", id: id });
      var p = { id: id, unidade: u.id, famId: inst.famId, x: r4(X), y: r4(Y), z: r4(z), cotaFundo: r4(Y), cotaEntrada: ce ? r4(Y + ce.y) : null, cotaSaida: cs ? r4(Y + cs.y) : null,
                entrada: ce ? { x: X + ce.x, y: Y + ce.y, z: z + ce.z } : null, saida: cs ? { x: X + cs.x, y: Y + cs.y, z: z + cs.z } : null, xMax: X + cx.x1, larguraZ: cx.z1 - cx.z0 };
      pos.push(p);
      return p;
    }
    var linhas = Object.keys(porLinha).sort(), zAt = num(o0.z, 0), xFim = num(o0.x, 0), saidas = [];
    linhas.forEach(function (k, li) {
      var lst = porLinha[k], cota = num(o0.y, 0), ant = null, larg = 0;
      /* linha 2+ : derivação a partir da chegada, descendo a declividade até a entrada */
      lst.forEach(function (u, j) {
        var p;
        if (j === 0) {
          var dz = zAt - num(o0.z, 0);
          cota = num(o0.y, 0) - i0 * Math.abs(dz);
          p = colocar(u, null, zAt, cota, num(o0.x, 0));
          if (p && li > 0) ligar(pre + "-lig-chegada-" + k, { x: num(o0.x, 0), y: num(o0.y, 0), z: num(o0.z, 0) }, p.entrada, num(opc.dn, u.param && u.param.DN_entrada));
        } else {
          var xIni = ant.xMax + esp, pv = colocar(u, xIni, zAt, 0, null);
          if (!pv) return;
          /* recoloca na cota certa: entrada = saída anterior − i × distância horizontal */
          var dist = Math.abs(pv.entrada.x - ant.saida.x), ce = ant.saida.y - i0 * dist;
          ops.pop(); desf.pop(); pos.pop();
          p = colocar(u, xIni, zAt, ce, null);
          if (p) ligar(pre + "-lig-" + ant.unidade + "-" + u.id, ant.saida, p.entrada, num(opc.dn, u.param && u.param.DN_entrada));
        }
        if (!p) return;
        larg = Math.max(larg, p.larguraZ);
        if (p.xMax > xFim) xFim = p.xMax;
        ant = p;
      });
      if (ant && ant.saida) saidas.push(ant);
      zAt += larg + esp;
    });
    /* disposição: depois da última unidade, lado a lado em Z (espaçamento do motor: 3·D entre sumidouros) */
    var zD = num(o0.z, 0), xD = xFim + esp, origemD = saidas[0];
    disp.forEach(function (u) {
      var pv = colocar(u, xD, zD, 0, null);
      if (!pv) return;
      var cota = origemD && origemD.saida ? origemD.saida.y - i0 * (Math.abs(pv.entrada.x - origemD.saida.x) + Math.abs(pv.entrada.z - origemD.saida.z)) : num(o0.y, 0);
      ops.pop(); desf.pop(); pos.pop();
      var p = colocar(u, xD, zD, cota, null);
      if (p && origemD) ligar(pre + "-lig-" + origemD.unidade + "-" + u.id, origemD.saida, p.entrada, num(opc.dn, u.param && (u.param.DN_entrada || u.param.DN_distribuicao)));
      if (p) zD += p.larguraZ + Math.max(esp, num(u.espacamento_m, 0));
    });
    if (disp.length && saidas.length > 1) avisos.push({ gravidade: "info", texto: "as " + saidas.length + " linhas em paralelo descarregam na disposição pela linha 1: modelar a caixa de reunião/distribuição", corrigir: { texto: "colocar caixa de passagem entre os filtros e a disposição" } });
    return { ops: ops, opsDesfazer: desf.reverse(), posicoes: pos, avisos: avisos, pendencias: pend, declividade: i0, familias: familiasDoConjunto(unidades) };
  }

  var HidTanques = { VERSAO: 1, familias: familias, porId: porId, ids: ids, famIdDe: famIdDe, instancia: instancia, avaliar: avaliar, familiasDoConjunto: familiasDoConjunto,
                     paraOpfam: paraOpfam, opsConjunto: opsConjunto, PSET: PSET, TETO: TETO };
  global.HidTanques = HidTanques;
  if (typeof module !== "undefined" && module.exports) module.exports = HidTanques;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

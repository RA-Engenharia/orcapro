/* =====================================================================
 * climfamilias.js — FAMÍLIAS PARAMÉTRICAS (.opfam) DA CLIMATIZAÇÃO, geradas do catálogo
 * (frente C1b, 17/10/2026; molde: js/hidfamilias.js; contrato: docs/hidro/CONTRATO-CLIMA.md §5
 * e PATCH-BIMINST-CLIMA.md §5).
 *
 * Os ids são os de ClimDimensionar.FAMILIAS (ra-clim-*): é com eles que as ops
 * {op:"familia"} do motor chegam ao modelo. Cada PRODUTO do catálogo (HidCatalogo, domínio
 * "clim", gerado por tools/gerar-hid-catalogo.js --clima) é um TIPO da família, e o id do
 * tipo = o código do catálogo (é o `tipoId` que o motor manda). O PRIMEIRO tipo é sempre o
 * GENÉRICO (cotas de reserva, "a conferir"): op sem tipoId (central sem catálogo, bomba de
 * dreno, sifão, suporte) cai nele — nunca num produto de fabricante escolhido sem querer.
 *
 * Convenção local (familia.js): ORIGEM NO CENTRO DO CORPO, Y para cima, +Z = a FRENTE da
 * unidade (o jato / o ventilador) — o `rotY` do ClimLocal põe o +Z na frente.
 *
 * ⚠ REGRAS (cada uma existe por um defeito que ela impede):
 *  1. Cota que o catálogo não dá entra com valor de RESERVA e fica listada em "Conferir" no
 *     tipo, no aviso da família e em ClimFamilias.avisosDoTipo(): reserva nunca parece cota
 *     de fabricante.
 *  2. Posição de conector: o catálogo não traz o desenho da saída dos tubos em texto — vai na
 *     extremidade do corpo e está marcada "a conferir" (a posição do manual fica pendente).
 *  3. DN frigorígeno em mm (polegada convertida pelo catálogo: 6,35 · 9,52 …). 0 = o catálogo
 *     não informa; o ClimRede define a linha pelo conjunto.
 *  4. Preço e código SINAPI NÃO existem aqui (quantitativo.codigo fica vazio).
 *  5. Pset RA_Clima: o grupo "RA_Clima" é o que a exportação leva ao IFC.
 * Número escrito no código = geometria de reserva (clim:ok), nunca valor de norma nem de fabricante.
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function carregar(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arquivo); } catch (e) { return null; } }
    return null;
  }
  function Cat() { return carregar("HidCatalogo", "hidcatalogo.js"); }
  function Eq() { return carregar("ClimEquip", "climequip.js"); }
  function Fam() { return carregar("Familia", "familia.js"); }
  function OpF() { return carregar("OpFormato", "opformato.js"); }

  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v) { var n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; }
  function mm(v) { return Math.round(v * 10) / 10000; }                      /* clim:ok mm → m com 0,1 mm */
  function r4(v) { return Math.round(v * 10000) / 10000; }                   /* clim:ok arredondamento */
  var PSET = "RA_Clima", GRUPO = PSET;

  var AV_CONECTOR = "Posição dos conectores (tubos, dreno, força): o catálogo não traz o desenho da saída dos tubos em texto; colocada na extremidade do corpo, a conferir no manual do modelo.";
  var AV_RESERVA = "Cotas de reserva (sem produto no catálogo): conferir antes de usar em desenho ou compatibilização.";

  /* geometria de RESERVA (m): corpo L × A × P. Só vale quando não há catálogo; tudo "a conferir". */
  var RESERVA = {
    hiwall:    [0.80, 0.28, 0.22],   /* clim:ok reserva, a conferir */
    pisoteto:  [1.20, 0.24, 0.67],   /* clim:ok reserva, a conferir */
    cassete:   [0.84, 0.24, 0.84],   /* clim:ok reserva, a conferir */
    duto:      [0.90, 0.20, 0.45],   /* clim:ok reserva, a conferir */
    janela:    [0.55, 0.36, 0.60],   /* clim:ok reserva, a conferir */
    cond:      [0.90, 0.65, 0.35],   /* clim:ok reserva, a conferir */
    condmulti: [0.96, 0.66, 0.40],   /* clim:ok reserva, a conferir */
    suporte:   [0.80, 0.04, 0.50],   /* clim:ok reserva, a conferir */
    bomba:     [0.20, 0.10, 0.08],   /* clim:ok reserva, a conferir */
    sifao:     [0.08, 0.20, 0.08],   /* clim:ok reserva, a conferir */
    grelha:    [0.30, 0.15, 0.03]    /* clim:ok reserva, a conferir */
  };
  var AFAST_LINHAS = 0.04;           /* clim:ok afastamento entre os conectores das duas linhas (reserva) */
  var QUARTO = 4;                    /* clim:ok divisor: o conector fica a 1/4 da largura */

  /* ---------------------------------------------------------- ESPECIFICAÇÕES */
  /* PORTAS (papel/dir — frente 2, 27/10/2026): `papel` entrada | saida (o lado da peça: dreno e líquido que sai da condensadora = saída; linha de
     sucção = o gás que volta à condensadora entra nela e sai da evaporadora) e `dir` = para onde o tubo SAI da peça (vetor unitário local, +Z = a
     frente da família). O catálogo não cota a saída dos tubos: a direção e a posição seguem o desenho e ficam em aConferir (AV_CONECTOR). O motor
     ainda não lê papel/dir (frente 1b); o auditor tools/hid-auditar-portas.js cobra. */
  var DIRS = { esq: [-1, 0, 0], dir: [1, 0, 0], cima: [0, 1, 0], piso: [0, -1, 0], frente: [0, 0, 1], parede: [0, 0, -1] };
  function C(id, nome, sistema, dn, x, y, z, papel, dirNome) {
    var o = { id: id, nome: nome, sistema: sistema, dn: dn, x: x, y: y, z: z };
    if (papel) { var a = DIRS[dirNome]; o.papel = papel; o.dir = { x: a[0], y: a[1], z: a[2] }; o.origemPos = "extremidade"; o.aConferir = "o catálogo não traz a saída dos tubos: posição e direção do desenho"; }
    return o;
  }
  var LIN = "-Largura/" + QUARTO, FUNDO = "-Profundidade/2", BAIXO = "-Altura/2";
  var CON_EVAP = [
    C("liquido", "Linha de líquido", "frigorigeno", "DN_liquido", LIN, BAIXO, FUNDO, "entrada", "parede"),
    C("succao", "Linha de sucção", "frigorigeno", "DN_succao", LIN + " + Afast_linhas", BAIXO, FUNDO, "saida", "parede"),
    C("dreno", "Dreno de condensado", "dreno", "DN_dreno", "Largura/" + QUARTO, BAIXO, FUNDO, "saida", "parede"),
    C("eletrica", "Alimentação elétrica", "eletrica", "0", "Largura/2", "0", FUNDO, "entrada", "dir")
  ];
  var CON_COND = [
    C("liquido", "Válvula de líquido", "frigorigeno", "DN_liquido", "Largura/2", BAIXO + " + Altura/" + QUARTO, "0", "saida", "dir"),
    C("succao", "Válvula de sucção", "frigorigeno", "DN_succao", "Largura/2", BAIXO + " + Altura/" + QUARTO + " + Afast_linhas", "0", "entrada", "dir"),
    C("eletrica", "Alimentação elétrica", "eletrica", "0", "Largura/2", "Altura/" + QUARTO, "0", "entrada", "dir")
  ];
  function caixa(nome) { return [{ id: "corpo", nome: nome, forma: "caixa", x: "0", y: "0", z: "0", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }]; }

  var ESPECS = [
    { id: "ra-clim-evap-hiwall", nome: "Evaporadora hi-wall (split)", papel: "evaporadora", tipoClim: "hiwall", res: "hiwall", conectores: CON_EVAP, sistemas: ["frigorigeno", "dreno", "eletrica"],
      descricao: "Evaporadora de parede (hi-wall). Origem = centro do corpo; +Z = frente (o jato). Montar com o fundo na parede, a ~2,2 m do piso conforme o manual." },
    { id: "ra-clim-evap-pisoteto", nome: "Evaporadora piso-teto", papel: "evaporadora", tipoClim: "pisoteto", res: "pisoteto", conectores: CON_EVAP, sistemas: ["frigorigeno", "dreno", "eletrica"],
      descricao: "Evaporadora piso-teto. Origem = centro do corpo; +Z = frente." },
    { id: "ra-clim-evap-cassete", nome: "Evaporadora cassete", papel: "evaporadora", tipoClim: "cassete", res: "cassete", conectores: CON_EVAP, sistemas: ["frigorigeno", "dreno", "eletrica"],
      descricao: "Evaporadora cassete embutida no forro. Origem = centro do corpo (a face de baixo fica no plano do forro)." },
    { id: "ra-clim-evap-duto", nome: "Evaporadora dutada (built-in)", papel: "evaporadora", tipoClim: "duto", res: "duto", sistemas: ["frigorigeno", "dreno", "eletrica", "ar"],
      conectores: CON_EVAP.concat([C("insuflamento", "Boca de insuflamento", "ar", "0", "0", "0", "Profundidade/2", "saida", "frente"), C("retorno", "Boca de retorno", "ar", "0", "0", "0", FUNDO, "entrada", "parede")]),
      descricao: "Evaporadora dutada no plenum do forro. O duto é o sistema ar do biminst; as bocas ficam em +Z (insuflamento) e −Z (retorno)." },
    { id: "ra-clim-janela", nome: "Ar-condicionado de janela", papel: null, res: "janela", sistemas: ["eletrica", "dreno"],
      conectores: [C("dreno", "Dreno de condensado", "dreno", "DN_dreno", "0", BAIXO, FUNDO, "saida", "parede"), C("eletrica", "Alimentação elétrica", "eletrica", "0", "Largura/2", "0", FUNDO, "entrada", "dir")],
      descricao: "Aparelho de janela (compacto, sem linha frigorígena). Sem produto no catálogo: tipo genérico." },
    { id: "ra-clim-condensadora", nome: "Condensadora (split)", papel: "condensadora", res: "cond", conectores: CON_COND, sistemas: ["frigorigeno", "eletrica"],
      descricao: "Condensadora individual. Origem = centro do corpo; +Z = face da descarga de ar." },
    { id: "ra-clim-condensadora-multi", nome: "Condensadora multi split", papel: "condensadora_multi", res: "condmulti", conectores: CON_COND, sistemas: ["frigorigeno", "eletrica"],
      descricao: "Condensadora multi split (uma para vários ambientes). Os diâmetros do catálogo são os de cada ramal; o tronco e os ramais por unidade interna ficam por conta do ClimRede." },
    { id: "ra-clim-suporte-condensadora", nome: "Suporte (mão-francesa) da condensadora", papel: null, res: "suporte", sistemas: [], conectores: [],
      descricao: "Par de mãos-francesas da condensadora de fachada (NBR 16655-1: cada uma resiste a N × o maior entre o peso e o peso mínimo, lidos do HidNormas). O parâmetro CargaPorMaoFrancesa_kg é preenchido pela verificação." },
    { id: "ra-clim-bomba-dreno", nome: "Bomba de dreno de condensado", papel: null, res: "bomba", sistemas: ["dreno", "eletrica"],
      conectores: [C("entrada", "Entrada do dreno", "dreno", "DN_dreno", "-Largura/2", "0", "0", "entrada", "esq"), C("saida", "Recalque", "dreno", "DN_dreno", "Largura/2", "Altura/2", "0", "saida", "cima"), C("eletrica", "Alimentação elétrica", "eletrica", "0", "0", BAIXO, "0", "entrada", "piso")],
      descricao: "Bomba de condensado para quando o dreno não chega ao ponto de esgoto/pluvial por gravidade. Sem produto no catálogo: tipo genérico." },
    { id: "ra-clim-sifao-dreno", nome: "Sifão do dreno de condensado", papel: null, res: "sifao", sistemas: ["dreno"],
      conectores: [C("entrada", "Entrada", "dreno", "DN_dreno", "0", "Altura/2", "0", "entrada", "cima"), C("saida", "Saída", "dreno", "DN_dreno", "0", BAIXO, "0", "saida", "piso")],
      descricao: "Sifão (fecho hídrico) do dreno de condensado ligado ao esgoto, contra o retorno de odor." },
    { id: "ra-clim-grelha-difusor", nome: "Grelha / difusor de ar (genérico)", papel: null, res: "grelha", sistemas: ["ar"],
      conectores: [C("duto", "Ligação ao duto", "ar", "0", "0", "0", "-Profundidade/2", "entrada", "parede")],
      descricao: "Grelha ou difusor de ar. Sem catálogo de fabricante nesta fase: cotas de reserva, a conferir. A vazão vai no parâmetro Vazao_m3h (instância)." }
  ];


  /* ============================================================ GEOMETRIA FIEL
   * (pedido do Rogério, 17/10/2026: "equipamentos modelados como nos catálogos".) A forma é reconhecível e é
   * FÓRMULA das 3 cotas do tipo (Largura, Altura, Profundidade): o volume envolvente continua o do catálogo e os
   * conectores ficam onde estavam. Origem no centro do corpo; +Z = a frente. Detalhe que o catálogo não dá (grade,
   * aleta, pés) é proporção de reserva sobre a cota — a família segue "a conferir". Revolução: js/familia.js. */
  function S(v) { return String(v); }
  function cxs(id, nome, x, y, z, dx, dy, dz, mat) { return { id: id, nome: nome, forma: "caixa", x: S(x), y: S(y), z: S(z), dx: S(dx), dy: S(dy), dz: S(dz), material: mat || "Material" }; }
  function cil(id, nome, eixo, x, y, z, r, h, mat) { return { id: id, nome: nome, forma: "cilindro", eixo: eixo, x: S(x), y: S(y), z: S(z), raio: S(r), altura: S(h), material: mat || "Material" }; }
  function rev(id, nome, x, y, z, perfil, o) {
    o = o || {};
    var r = { id: id, nome: nome, forma: "revolucao", x: S(x), y: S(y), z: S(z), perfil: perfil.map(function (q) { return [S(q[0]), S(q[1])]; }), material: o.mat || "Material" };
    if (o.ex) r.ex = S(o.ex);
    if (o.ez) r.ez = S(o.ez);
    if (o.eixo) r.eixo = o.eixo;
    if (o.fechar) r.fechar = o.fechar;
    return r;
  }
  var ESCURO = "Cinza escuro", CLARO = "Cinza claro", PRETO = "Preto";
  function geoCondensadora() {
    var R = "min(Largura; Altura)*0.38", zf = "Profundidade/2 - 0.01";
    var s = [cxs("gabinete", "Gabinete", "-0.01", "-Altura/2 + 0.03", "-0.005", "Largura - 0.02", "Altura - 0.03", "Profundidade - 0.01"),
      cxs("pe-esq", "Pé (esquerda)", "-Largura*0.35", "-Altura/2", "0", "0.08", "0.03", "Profundidade*0.8", ESCURO),
      cxs("pe-dir", "Pé (direita)", "Largura*0.35", "-Altura/2 + 0.015", "0", "0.08", "0.03", "Profundidade*0.8", ESCURO),
      cxs("tampa-valvulas", "Tampa das válvulas", "Largura/2 - 0.01", "-Altura*0.4", "0", "0.02", "Altura*0.7", "Profundidade*0.3", ESCURO),
      cil("abertura", "Abertura do ventilador", "z", "0", "0", zf, R + "*0.96", "0.002", PRETO),
      cil("hub", "Hub do ventilador", "z", "0", "0", zf, R + "*0.14", "0.012", ESCURO)];
    [[1, 0.94], [0.7, 0.66], [0.42, 0.38]].forEach(function (f, i) {                                                  /* clim:ok anéis da grade (reserva) */
      s.push(rev("anel-" + (i + 1), "Anel da grade " + (i + 1), "0", "0", zf, [[R + "*" + f[0], "0"], [R + "*" + f[0], "0.01"], [R + "*" + f[1], "0.01"], [R + "*" + f[1], "0"]], { eixo: "z", fechar: "perfil", mat: ESCURO }));
    });
    s.push(cxs("travessa-h", "Travessa horizontal", "0", "-0.004", zf + " + 0.004", R + "*2", "0.008", "0.008", ESCURO));
    s.push(cxs("travessa-v", "Travessa vertical", "0", "-" + R, zf + " + 0.004", "0.008", R + "*2", "0.008", ESCURO));
    return s;
  }
  var GEO_CLIM = {
    /* hi-wall: tubo de seção oval deitado (Altura × Profundidade) ao longo do X, placa de fixação, saída de ar e visor */
    "ra-clim-evap-hiwall": function () {
      return [rev("corpo", "Corpo", "-Largura/2", "0", "0", [["1", "0"], ["1", "Largura"]], { eixo: "x", ex: "Altura/2", ez: "Profundidade/2" }),
        cxs("placa", "Placa de fixação", "0", "-Altura*0.45", "-Profundidade/2 + 0.01", "Largura*0.96", "Altura*0.9", "0.02", CLARO),
        cxs("saida-ar", "Saída de ar (aleta)", "0", "-Altura/2", "Profundidade*0.2", "Largura*0.88", "Altura*0.16", "Profundidade*0.55", ESCURO),
        cxs("visor", "Visor", "Largura*0.3", "Altura*0.08", "Profundidade/2 - 0.005", "0.06", "0.02", "0.01", PRETO)];
    },
    "ra-clim-evap-pisoteto": function () {
      return [cxs("corpo", "Corpo", "0", "-Altura/2", "-0.01", "Largura", "Altura", "Profundidade - 0.02"),
        cxs("painel", "Painel frontal", "0", "-Altura*0.45", "Profundidade/2 - 0.01", "Largura*0.96", "Altura*0.9", "0.02", CLARO),
        cxs("saida-ar", "Saída de ar", "0", "-Altura*0.425", "Profundidade/2 - 0.01", "Largura*0.8", "Altura*0.25", "0.02", ESCURO),
        cxs("visor", "Visor", "Largura*0.38", "Altura*0.2", "Profundidade/2 - 0.01", "0.06", "0.02", "0.02", PRETO)];
    },
    "ra-clim-evap-cassete": function () {
      var y = "-Altura/2";
      return [cxs("corpo", "Corpo (acima do forro)", "0", "-Altura/2 + 0.036", "0", "Largura*0.9", "Altura - 0.036", "Profundidade*0.9"),
        cxs("painel", "Painel decorativo", "0", "-Altura/2 + 0.006", "0", "Largura", "0.03", "Profundidade"),
        cxs("grade", "Grade de retorno", "0", y, "0", "Largura*0.5", "0.012", "Profundidade*0.5", ESCURO),
        cxs("saida-1", "Saída de ar (frente)", "0", y, "Profundidade/2 - 0.04", "Largura*0.7", "0.008", "0.03", ESCURO),
        cxs("saida-2", "Saída de ar (trás)", "0", y, "-Profundidade/2 + 0.04", "Largura*0.7", "0.008", "0.03", ESCURO),
        cxs("saida-3", "Saída de ar (esquerda)", "-Largura/2 + 0.04", y, "0", "0.03", "0.008", "Profundidade*0.7", ESCURO),
        cxs("saida-4", "Saída de ar (direita)", "Largura/2 - 0.04", y, "0", "0.03", "0.008", "Profundidade*0.7", ESCURO)];
    },
    "ra-clim-evap-duto": function () {
      return [cxs("corpo", "Corpo", "0", "-Altura/2", "0", "Largura", "Altura", "Profundidade - 0.06", CLARO),
        cxs("colar-insuflamento", "Colar de insuflamento", "0", "-Altura*0.4", "Profundidade/2 - 0.015", "Largura*0.8", "Altura*0.8", "0.03", ESCURO),
        cxs("colar-retorno", "Colar de retorno", "0", "-Altura*0.4", "-Profundidade/2 + 0.015", "Largura*0.8", "Altura*0.8", "0.03", ESCURO)];
    },
    "ra-clim-janela": function () {
      return [cxs("corpo", "Corpo", "0", "-Altura/2", "-0.015", "Largura", "Altura", "Profundidade - 0.03"),
        cxs("painel", "Painel frontal", "0", "-Altura/2", "Profundidade/2 - 0.017", "Largura", "Altura", "0.026", CLARO),
        cxs("grade", "Grade de saída", "0", "-Altura*0.3", "Profundidade/2 - 0.006", "Largura*0.7", "Altura*0.4", "0.012", ESCURO),
        cxs("visor", "Visor", "Largura*0.35", "Altura*0.3", "Profundidade/2 - 0.006", "0.05", "0.02", "0.012", PRETO)];
    },
    /* condensadora: gabinete, pés, tampa da válvula e a GRADE DO VENTILADOR (anéis concêntricos + hub + travessas) */
    "ra-clim-condensadora": geoCondensadora,
    "ra-clim-condensadora-multi": geoCondensadora,
    "ra-clim-suporte-condensadora": function () {
      return [cxs("trilho-esq", "Trilho (esquerda)", "-Largura/2 + 0.025", "-Altura/2", "0", "0.05", "Altura", "Profundidade", ESCURO),
        cxs("trilho-dir", "Trilho (direita)", "Largura/2 - 0.025", "-Altura/2", "0", "0.05", "Altura", "Profundidade", ESCURO),
        cxs("travessa-frente", "Travessa (frente)", "0", "-Altura/2", "Profundidade/2 - 0.015", "Largura - 0.1", "Altura", "0.03", ESCURO),
        cxs("travessa-fundo", "Travessa (fundo)", "0", "-Altura/2", "-Profundidade/2 + 0.015", "Largura - 0.1", "Altura", "0.03", ESCURO)];
    },
    "ra-clim-bomba-dreno": function () {
      return [cxs("corpo", "Corpo", "0", "-Altura/2", "0", "Largura*0.8", "Altura*0.8", "Profundidade"),
        cil("cabeca", "Cabeça do motor", "y", "-Largura*0.1", "Altura*0.3", "0", "Profundidade*0.3", "Altura*0.2", PRETO),
        cil("entrada", "Boca de entrada", "x", "-Largura/2", "0", "0", "Profundidade*0.2", "Largura*0.1", ESCURO),
        cil("saida", "Boca de recalque", "x", "Largura*0.4", "Altura/2 - Profundidade*0.15", "0", "Profundidade*0.15", "Largura*0.1", ESCURO)];
    },
    "ra-clim-sifao-dreno": function () {
      return [cil("copo", "Copo do sifão", "y", "0", "-Altura/2", "0", "Largura/2", "Altura*0.4", "Branco"),
        cil("tubo", "Tubo de entrada", "y", "0", "-Altura*0.1", "0", "Largura*0.15", "Altura*0.6", "Branco"),
        cil("porca", "Porca", "y", "0", "-Altura/2 + Altura*0.4", "0", "Largura*0.3", "Altura*0.05", CLARO)];
    },
    "ra-clim-grelha-difusor": function () {
      var s = [cxs("moldura-sup", "Moldura (alto)", "0", "Altura/2 - 0.02", "0", "Largura", "0.02", "Profundidade", CLARO),
        cxs("moldura-inf", "Moldura (baixo)", "0", "-Altura/2", "0", "Largura", "0.02", "Profundidade", CLARO),
        cxs("moldura-esq", "Moldura (esquerda)", "-Largura/2 + 0.01", "-Altura/2", "0", "0.02", "Altura", "Profundidade", CLARO),
        cxs("moldura-dir", "Moldura (direita)", "Largura/2 - 0.01", "-Altura/2", "0", "0.02", "Altura", "Profundidade", CLARO)];
      ["-0.3", "-0.1", "0.1", "0.3"].forEach(function (f, i) { s.push(cxs("palheta-" + (i + 1), "Palheta " + (i + 1), "0", "Altura*(" + f + ") - 0.004", "0", "Largura - 0.04", "0.008", "Profundidade", CLARO)); });   /* clim:ok posição das palhetas (reserva) */
      return s;
    }
  };

  /* QUALIDADE VISUAL 3 (17/10/2026): GEOMETRIA REAL pelo js/hidlouca.js — hi-wall (perfil arredondado por
     subdivisão e aleta), condensadora (gabinete, grade concêntrica, hélice, válvulas nos conectores), cassete
     (painel, saídas com aletas; 1 via quando o corpo é comprido) e piso-teto. Mesmas cotas (Largura, Altura,
     Profundidade); conectores intocados; sem o gerador, valem as formas acima (GEO_CLIM). Detalhe sem cota no
     catálogo (raio, aleta, grade) é proporção de desenho RA — a família segue "a conferir". */
  function Lou() { return carregar("HidLouca", "hidlouca.js"); }
  function gerada(g, p) {
    return function () { return [{ id: "forma", nome: "Forma", forma: "gerada", gerador: g, x: "0", y: "0", z: "0", p: p, material: "Material",
      env: { x: "0", y: "-Altura/2", z: "0", dx: "Largura", dy: "Altura", dz: "Profundidade" } }]; };
  }
  var LWH = { L: "Largura", H: "Altura", P: "Profundidade" };
  var GERADA_CLIM = { "ra-clim-evap-hiwall": gerada("hiwall", LWH), "ra-clim-evap-cassete": gerada("cassete", LWH), "ra-clim-evap-pisoteto": gerada("pisoteto", LWH),
    "ra-clim-condensadora": gerada("condensadora", { L: "Largura", H: "Altura", P: "Profundidade", Af: "Afast_linhas" }),
    "ra-clim-condensadora-multi": gerada("condensadora", { L: "Largura", H: "Altura", P: "Profundidade", Af: "Afast_linhas" }) };
  function geoDe(id) {
    var L_ = Lou(), g = GERADA_CLIM[id];
    if (g && L_ && L_.existe(g()[0].gerador)) return g();
    return GEO_CLIM[id] ? GEO_CLIM[id]() : null;
  }

  var COMUNS = [
    ["Fabricante", "texto", "", "Fabricante do produto", "instancia"], ["Linha", "texto", "", "Linha/ficha do catálogo"], ["Codigo", "texto", "", "Código do fabricante (não é código SINAPI)"],
    ["Descricao_ficha", "texto", "", "Descrição como impressa no catálogo"], ["Link_ficha", "texto", "", "Endereço do fabricante citado na ficha"], ["Arquivo_ficha", "texto", "", "Nome do PDF guardado na biblioteca técnica"],
    ["Edicao_ficha", "texto", "", "Edição/revisão da ficha"], ["Pagina_ficha", "inteiro", 0, "Página do PDF onde o produto aparece (0 = família genérica, sem ficha)"],
    ["Capacidade_BTUh", "numero", 0, "Capacidade de resfriamento em Btu/h (0 = não informada); a op do ClimDimensionar a preenche", "instancia"],
    ["Peso_kg", "numero", 0, "Massa sem embalagem em kg (0 = o catálogo não informa)"], ["Vazao_ar_m3h", "numero", 0, "Vazão de ar máxima em m³/h (0 = não informa)"],
    ["Disjuntor_A", "numero", 0, "Disjuntor recomendado em A (0 = não informa)"], ["Comprimento_max_m", "numero", 0, "Comprimento máximo da linha frigorígena em m (0 = não informa)"],
    ["Desnivel_max_m", "numero", 0, "Desnível máximo em m (0 = não informa)"], ["Carga_adicional_g_m", "numero", 0, "Carga adicional de fluido em g/m (0 = não informa)"],
    ["A_conferir", "simnao", true, "Sim = há cota/posição/DN que o catálogo não dá"], ["Conferir", "texto", "", "Lista do que conferir neste tipo (ver ClimFamilias.avisosDoTipo)"],
    ["Sistemas_RA", "texto", "", "Sistemas dos conectores (biminst)"]
  ];

  function dimParams(res) {
    return [["Largura", res[0], "Largura do corpo (catálogo; reserva se sem produto)"], ["Altura", res[1], "Altura do corpo"], ["Profundidade", res[2], "Profundidade do corpo"]];
  }
  function parametrosDe(e) {
    var ps = [];
    COMUNS.forEach(function (c) { ps.push({ nome: c[0], tipoDado: c[1], escopo: c[4] || "tipo", valor: c[0] === "Sistemas_RA" ? e.sistemas.join(",") : c[2], grupo: GRUPO, descricao: c[3] }); });   /* clim:ok índices da tupla de COMUNS */
    dimParams(RESERVA[e.res]).forEach(function (d) { ps.push({ nome: d[0], tipoDado: "comprimento", escopo: "tipo", valor: d[1], grupo: "Dimensões", descricao: d[2] }); });
    if (e.conectores.length) {
      ps.push({ nome: "Afast_linhas", tipoDado: "comprimento", escopo: "tipo", valor: AFAST_LINHAS, grupo: "Instalação", descricao: "Afastamento entre os conectores das duas linhas (reserva, a conferir)" });
      ["DN_liquido", "DN_succao", "DN_dreno"].forEach(function (n) { ps.push({ nome: n, tipoDado: "numero", escopo: "tipo", valor: 0, grupo: GRUPO, descricao: n.replace("_", " ") + " em mm. 0 = o catálogo não informa; o ClimRede/HidES define" }); });
    }
    if (e.id === "ra-clim-suporte-condensadora") ps.push({ nome: "CargaPorMaoFrancesa_kg", tipoDado: "numero", escopo: "instancia", valor: 0, grupo: GRUPO, descricao: "Carga de cálculo por mão-francesa (kg), da verificação NBR 16655-1; 0 = não verificada" });
    if (e.id === "ra-clim-grelha-difusor") ps.push({ nome: "Vazao_m3h", tipoDado: "numero", escopo: "instancia", valor: 0, grupo: GRUPO, descricao: "Vazão de ar do terminal em m³/h (0 = não definida)" });
    ps.push({ nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Branco", grupo: "Materiais", descricao: "Material de aparência" });
    return ps;
  }

  /* ----------------------------------------------------------- TIPOS DO CATÁLOGO */
  function conectorDe(it, sis) { return arr(it.conectores).filter(function (c) { return c.sistema === sis; })[0] || null; }
  function montarTipo(e, it, usados) {
    var v = {}, conferir = [], avisos = [], d = it.dados || {}, dim = it.dim || {};
    var id = txt(it.codigo); if (usados[id]) id = id + "#" + it.fabricante; usados[id] = 1;
    function dm(chave, nome) { var n = num(dim[chave]); if (n != null && n > 0) v[nome] = mm(n); else conferir.push(nome + " (padrão de reserva)"); }
    dm("largura_mm", "Largura"); dm("altura_mm", "Altura"); dm("profundidade_mm", "Profundidade");
    v.Fabricante = it.fabricante; v.Linha = it.linha; v.Codigo = it.codigo; v.Descricao_ficha = txt(it.descricao);
    v.Link_ficha = it.fonte.url; v.Arquivo_ficha = it.fonte.arquivo; v.Edicao_ficha = it.fonte.edicao; v.Pagina_ficha = it.fonte.pagina || 0;
    var cap = num(d.capacidadeResfriamento_Btu_h); if (cap != null) v.Capacidade_BTUh = cap;
    var pe = num(d.pesoEvaporadora_kg), pc = num(d.pesoCondensadora_kg), pm = num(d.massaSemEmbalagem_kg), peso = e.papel === "evaporadora" ? pe : (pc != null ? pc : pm);
    if (peso != null) v.Peso_kg = peso; else conferir.push("Peso_kg (o catálogo não informa)");
    var vz = num(d.vazaoArMaximaResfriamento_m3_h); if (vz != null) v.Vazao_ar_m3h = vz;
    var dj = num(d.disjuntor_A != null ? d.disjuntor_A : d.disjuntorRecomendado_A); if (dj != null) v.Disjuntor_A = dj;
    var cm = num(d.comprimentoMaximoTubulacao_m != null ? d.comprimentoMaximoTubulacao_m : d.comprimentoTubosMaximo_m); if (cm != null) v.Comprimento_max_m = cm;
    var dn = num(d.desnivelMaximo_m); if (dn != null) v.Desnivel_max_m = dn;
    var ca = null; Object.keys(d).forEach(function (k) { if (/^cargaAdicional_g_por_m/.test(k) && num(d[k]) != null) ca = num(d[k]); }); if (ca != null) v.Carga_adicional_g_m = ca;
    var l = conectorDe(it, "frigorigeno_liquido"), s = conectorDe(it, "frigorigeno_succao"), dr = conectorDe(it, "dreno");
    if (e.conectores.length) {
      if (l && num(l.dn_mm) != null) v.DN_liquido = num(l.dn_mm); else if (e.papel) conferir.push("DN_liquido (o catálogo não informa)");
      if (s && num(s.dn_mm) != null) v.DN_succao = num(s.dn_mm); else if (e.papel) conferir.push("DN_succao (o catálogo não informa)");
      if (dr && num(dr.dn_mm) != null) v.DN_dreno = num(dr.dn_mm); else if (e.papel === "evaporadora") conferir.push("DN_dreno (o catálogo não informa)");
    }
    conferir.push("posição dos conectores (a conferir no manual)");
    avisos.push(AV_CONECTOR);
    v.Conferir = conferir.join("; "); v.A_conferir = true;
    return { id: id, nome: it.fabricante + " " + it.codigo + " — " + txt(it.descricao).replace(/\s+/g, " ").slice(0, 80), valores: v, fonte: it.fonte.arquivo + ", pág. " + it.fonte.pagina, avisos: avisos, conferir: conferir };   /* clim:ok corte de texto */
  }
  function montarGenerico(e) {
    var conferir = ["Largura, Altura e Profundidade (padrão de reserva)", "posição dos conectores (a conferir)"];
    if (e.conectores.length) conferir.push("DN_liquido, DN_succao e DN_dreno (0: o ClimRede/HidES define)");
    return { id: "t-generico", nome: "Genérico (sem produto no catálogo) — a conferir", valores: { Fabricante: "(sem produto no catálogo)", Conferir: conferir.join("; "), A_conferir: true },
             fonte: "", avisos: [AV_RESERVA, AV_CONECTOR], conferir: conferir };
  }

  function itensDe(e) {
    var C_ = Cat(), Q = Eq();
    if (!C_ || !Q || !e.papel) return [];
    return C_.itens({ dominio: "clim" }).filter(function (it) {
      if (e.papel === "evaporadora") return it.tipo === "evaporadora" && Q.tipoDe(it) === e.tipoClim;
      return it.tipo === e.papel;
    });
  }
  function construir(e) {
    var usados = {}, its = itensDe(e);
    var fam = {
      id: e.id, nome: e.nome, categoria: "equipamento", hospedagem: "livre", pset: PSET, origem: "HidCatalogo (clim)",
      descricao: e.descricao + " [Gerada do catálogo — não editar à mão; regerar por ClimFamilias.]",
      avisos: [AV_CONECTOR].concat(its.length ? [] : [AV_RESERVA]), sistemas: e.sistemas.slice(),
      parametros: parametrosDe(e), tipos: [montarGenerico(e)], solidos: JSON.parse(JSON.stringify(geoDe(e.id) || caixa(e.nome))), conectores: JSON.parse(JSON.stringify(e.conectores)),
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: e.nome }
    };
    its.forEach(function (it) { fam.tipos.push(montarTipo(e, it, usados)); });
    return fam;
  }

  var CACHE = null;
  function todas() { if (!CACHE) CACHE = ESPECS.map(construir); return CACHE; }
  function reiniciar() { CACHE = null; }
  function porId(id) { var t = todas(), i; for (i = 0; i < t.length; i++) if (t[i].id === id) return t[i]; return null; }
  function obter(id) { var f = porId(id); return f ? JSON.parse(JSON.stringify(f)) : null; }
  function ids() { return ESPECS.map(function (e) { return e.id; }); }
  function avisosDoTipo(famId, tipoId) {
    var f = porId(famId), i;
    if (!f) return [];
    for (i = 0; i < f.tipos.length; i++) if (f.tipos[i].id === tipoId) return f.tipos[i].avisos.slice();
    return [];
  }
  function paraOpfam(id, meta) {
    var f = porId(id), O = OpF();
    if (!f) throw new Error("climfamilias: família \"" + id + "\" não existe");
    if (!O) throw new Error("climfamilias: js/opformato.js não carregou");
    return O.familiaParaArquivo(f, meta || { autor: "RA Engenharia", descricao: f.nome + " — gerada do catálogo de climatização" });
  }
  function resumo() { return todas().map(function (f) { return { id: f.id, nome: f.nome, tipos: f.tipos.length, aConferir: f.tipos.filter(function (t) { return t.conferir.length; }).length }; }); }
  function validar(id) { var F = Fam(); return F ? F.validar(porId(id)) : { ok: false, erros: ["familia.js não carregou"] }; }

  var ClimFamilias = { VERSAO: 1, PSET: PSET, ESPECS: ESPECS, todas: todas, porId: porId, obter: obter, ids: ids, avisosDoTipo: avisosDoTipo, paraOpfam: paraOpfam, resumo: resumo, validar: validar, reiniciar: reiniciar, r4: r4 };
  global.ClimFamilias = ClimFamilias;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimFamilias;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

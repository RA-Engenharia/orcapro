/* =====================================================================
 * hidfamilias.js — FAMÍLIAS PARAMÉTRICAS (.opfam) DO HIDROSSANITÁRIO, geradas do catálogo
 * (fase 1 do plano: docs/hidro/PLANO-HIDROSSANITARIO.md §3, frente F4).
 *
 * UMA FAMÍLIA POR TIPO DE PRODUTO (bacia, lavatório, registro, caixa sifonada,
 * reservatório…); cada PRODUTO DO CATÁLOGO é um TIPO da família, com fabricante,
 * código, link e página da ficha, pressão e vazão quando o catálogo as dá, e as
 * cotas que o catálogo traz. Os conectores (sistema + DN + posição) seguem o
 * formato do js/familia.js e os sistemas do js/biminst.js (agua_fria, agua_quente,
 * esgoto…). Convenção local (familia.js): origem no PISO, X ao longo da parede,
 * Y para cima, Z para fora da parede.
 *
 * ⚠ REGRAS DESTE ARQUIVO (cada uma existe por um defeito que ela impede):
 *  1. NUNCA número inventado em silêncio. Toda cota que o catálogo não dá — ou que
 *     é só uma LETRA do desenho da ficha (A, B, C… sem legenda em texto) — entra com
 *     valor padrão E fica listada no parâmetro "Conferir" do tipo, no aviso da
 *     família e em HidFamilias.avisosDoTipo(). Sem isso um valor de reserva parece
 *     cota de fabricante e vai para o desenho.
 *  2. Cota lida por letra só vale dentro de uma faixa plausível (a faixa só DESCARTA
 *     leitura duvidosa; nunca cria valor). Fora dela usa-se o padrão e o fato vai
 *     para HidFamilias.problemas() — ex.: tabela da coluna atribuída ao lavatório.
 *  3. DN que o catálogo não dá fica 0 = "o dimensionamento define" (HidES/HidAF).
 *     DN de ramal é valor de norma e vem do HidNormas — não se escreve aqui
 *     (test-hid-sem-numero-magico.js).
 *  4. Peso e UHC NÃO são parâmetros: vêm do motor de norma. Preço e código SINAPI
 *     também não (quantitativo.codigo fica vazio; quem preenche é o orçamento).
 *  5. Posição de conector sem cota no catálogo: na extremidade do corpo e marcada
 *     "a conferir". Onde o catálogo dá a instalação (regras do Deca, pág. 31/68/69/
 *     116) a posição vem dela — eixos convertidos: Deca (x ao longo da parede,
 *     y distância da parede, z altura) → família (x, y = altura, z = para fora).
 *  6. Pset RA_Hidro: os parâmetros do grupo "RA_Hidro" são os que a exportação
 *     deve levar ao IFC (a ligação à exportação é de outra frente).
 * Todo número escrito no código fora de texto leva "hid:ok" (geometria padrão de
 * reserva, nunca valor de norma) — exigência do test-hid-sem-numero-magico.js.
 * ES5, IIFE, sem dependência de DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function carregar(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arquivo); } catch (e) { return null; } }
    return null;
  }
  var Cat = carregar("HidCatalogo", "hidcatalogo.js");
  var Fam = carregar("Familia", "familia.js");
  var OpF = carregar("OpFormato", "opformato.js");

  function txt(v) { return v == null ? "" : String(v); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function mm(v) { return Math.round(v * 10) / 10000; }                       /* hid:ok mm → m, 0,1 mm */
  function r4(v) { return Math.round(v * 10000) / 10000; }                    /* hid:ok arredondamento */
  var PSET = "RA_Hidro";
  var GRUPO = PSET;

  /* ------------------------------------------------ leitores de cota */
  /* letra do desenho da ficha: sem legenda em texto → INTERPRETAÇÃO (a conferir) */
  function L(letra) { return function (it) { var v = it.dim[letra]; return v == null ? null : { v: mm(v), origem: "interpretado", letra: letra, bruto: v }; }; }
  /* cota com nome na legenda do próprio catálogo (ex.: altura_com_tampa_mm) → vale como o catálogo */
  function N(chave) { return function (it) { var v = it.dim[chave]; return v == null ? null : { v: mm(v), origem: "catalogo" }; }; }
  /* número impresso no NOME do produto (ex.: "CORPO CX SIFONADA 100X150XDN50": C x A x DN) */
  function NOME(idx) {
    return function (it) {
      var m = /(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)\s*X\s*DN\s*(\d+)/i.exec(it.descricao);
      if (!m) return null;
      return { v: mm(parseFloat(m[idx].replace(",", "."))), origem: "catalogo" };
    };
  }
  function DADO(chave, fator) { return function (it) { var v = it.dados[chave]; return typeof v === "number" ? { v: fator ? mm(v) : v, origem: "catalogo" } : null; }; }
  /* valor da regra de instalação do Deca (pos_mm em mm) → m; sempre "interpretado" quando aplicado a outra marca */
  function regra(cod) { return Cat ? Cat.porCodigo("Deca", cod) : null; }
  function conectorDaRegra(cod, sistema) {
    var r = regra(cod), cs = r ? arr(r.conectores) : [], i;
    for (i = 0; i < cs.length; i++) if (cs[i].sistema === sistema) return cs[i];
    return null;
  }
  function DECA(cod, sistema, eixo) {   /* eixo: "x" | "y" | "z" (do Deca) ou "dn" */
    return function () {
      var c = conectorDaRegra(cod, sistema);
      if (!c) return null;
      if (eixo === "dn") return typeof c.dn === "number" ? { v: c.dn, origem: "interpretado" } : null;
      var p = c.pos_mm || {};
      return { v: mm(typeof p[eixo] === "number" ? p[eixo] : 0), origem: "interpretado" };    /* hid:ok eixo ausente = 0 no catálogo */
    };
  }
  /* QUALIDADE VISUAL 2 (17/10/2026): a coluna suspensa NÃO segue os 200 mm da coluna de piso — o Deca dá a
     posição LATERAL de cada ponto de água em relação ao eixo do esgoto (interno 70 mm, externo 340 mm). O
     parâmetro é o afastamento ENTRE os dois pontos (água fria a +A/2, quente a −A/2): 2 × a lateral. */
  function DECALAT(cod, opcao) { return function () { var r = regra(cod), o = r && r.dados ? r.dados.opcoesLateraisPontoAgua_mm : null, v = o ? o[opcao] : null; return typeof v === "number" ? { v: mm(2 * v), origem: "interpretado" } : null; }; }   /* hid:ok os dois pontos são simétricos ao eixo */
  /* QUALIDADE VISUAL 2 (rodada 2) — CUBA FUNDA: os 160 mm do Deca (pág. 116) são da cuba de APOIO com válvula oculta.
     Na de embutir/sobrepor e na de semi-encaixe a bacia desce abaixo do tampo (Altura_cuba inteira / 0,55 dela, a
     proporção do desenho do js/hidlouca.js) e o ponto caía DENTRO dela (a frente das louças anotou). Lá o ponto fica
     abaixo do fundo + a válvula e o sifão de copo (VALV_SIFAO); a Tabela 3 do Deca dá 205–460 mm por produto Deca — os
     tipos do catálogo são Celite, então o valor sai "interpretado" e a conferir. */
  var APOIO_TAB3 = 0.35;   /* hid:ok Deca p.115 tabela 3: cuba de apoio, ponto de esgoto abaixo do tampo — o maior da classe (reserva da js/marmoraria.js) */
  var VALV_SIFAO = 0.11, SEMI_FUNDO = 0.55, CUBA_H = { def: 0.13, min: 0.08, max: 0.3 };   /* hid:ok geometria (válvula 3 cm + sifão de copo até a saída 8 cm; proporção do desenho; faixa do Altura_cuba) */
  function ESGOTO_CUBA(it) {
    var base = DECADADO(D_CUBA, "esgotoCubaValvulaOculta_abaixoDoTampo_mm")();
    var d = txt(it && it.descricao), mod = /APOIO/i.test(d) ? 0 : (/SEMI/i.test(d) ? 2 : 1);
    /* N23 EMBUTIDO (revisão adversarial, 26/10/2026): os 160 mm da Deca (p.116) são SÓ da cuba de apoio com VÁLVULA OCULTA ("Cuba de apoio
       (exceto cuba com válvula oculta)", dados-fonte/hidro/catalogos/deca-instalacao-loucas.json); a cuba de apoio comum vai pela Tabela 3
       (p.115), o maior da classe — 350 mm (a mesma leitura do js/marmoraria.js REGRA.esgoto.apoio): o sifão alcança o ponto mais alto
       encurtando o tubo, o mais baixo não. Agora que a saída do sifão vai até a parede, a altura importa. */
    if (mod === 0 && !/OCULTA/i.test(d)) { var Mm = carregar("Marmoraria", "marmoraria.js"), ap = Mm && Mm.REGRA && Mm.REGRA.esgoto ? Mm.REGRA.esgoto.apoio : null; return { v: typeof ap === "number" && ap > 0 ? ap : APOIO_TAB3, origem: "interpretado" }; }
    if (!base || mod === 0) return base;
    var hc = it && it.dim ? L("C")(it) : null, h = hc && hc.v >= CUBA_H.min && hc.v <= CUBA_H.max ? hc.v : CUBA_H.def;
    var fundo = mod === 1 ? h : h * SEMI_FUNDO;
    return { v: Math.max(base.v, Math.round((fundo + VALV_SIFAO) * 1000) / 1000), origem: "interpretado" };   /* hid:ok mm */
  }
  function DECADADO(cod, chave) { return function () { var r = regra(cod), v = r && r.dados ? r.dados[chave] : null; return typeof v === "number" ? { v: mm(v), origem: "interpretado" } : null; }; }

  /* ------------------------------------------- especificação dos parâmetros */
  /* ponto do mictório (letra F de água, E de esgoto) sobre a BASE da louça: letra − (D − C), todas da mesma ficha */
  function PONTO_MIC(letra) { return function (it) { var d = it.dim || {}; return typeof d[letra] === "number" && typeof d.D === "number" && typeof d.C === "number" ? { v: mm(d[letra] - (d.D - d.C)), origem: "interpretado" } : null; }; }
  function G(nome, def, faixa, le, desc) { return { nome: nome, tipoDado: "comprimento", def: def, faixa: faixa, le: le, desc: desc, grupo: "Dimensões" }; }
  function I(nome, def, le, desc) { return { nome: nome, tipoDado: "comprimento", def: def, faixa: null, le: le, desc: desc, grupo: "Instalação" }; }
  function DN(nome, le, desc) { return { nome: nome, tipoDado: "numero", def: 0, faixa: null, le: le, desc: (desc || "") + " (mm). 0 = o dimensionamento (HidES/HidAF) define", grupo: GRUPO, ehDN: true }; }
  function DNCAT(f) { return function (it) { var v = f(it); return typeof v === "number" ? { v: v, origem: "catalogo" } : null; }; }
  function DNINT(f) { return function (it) { var v = f(it); return typeof v === "number" ? { v: v, origem: "interpretado" } : null; }; }
  function DNREF(k) {   /* "DN100" / "DN50 / DN40" → o maior */
    return function (it) {
      var s = it.dimReferenciasDN ? txt(it.dimReferenciasDN[k]) : "", re = /DN\s*(\d+)/g, m, mx = null;
      while ((m = re.exec(s))) { var n = parseInt(m[1], 10); if (mx == null || n > mx) mx = n; } /* hid:ok base decimal */
      return mx == null ? null : { v: mx, origem: "catalogo" };
    };
  }
  function conectorCat(role) {   /* conectores[] do catálogo com papel entrada/saída (Amanco caixas) */
    return function (it) {
      var cs = arr(it.conectores), i;
      for (i = 0; i < cs.length; i++) if (txt(cs[i].papel).indexOf(role) === 0 && typeof cs[i].dn === "number") return { v: cs[i].dn, origem: "catalogo" };
      return null;
    };
  }

  /* ---------------------------------------------------------- FAMÍLIAS */
  var D_BACIA_CX = "DECA-INST-BACIA-CAIXA-ACOPLADA", D_BACIA_CV = "DECA-INST-BACIA-CONVENCIONAL", D_LAV_COL = "DECA-INST-LAVATORIO-COM-COLUNA",
      D_LAV_SUSP = "DECA-INST-LAVATORIO-COLUNA-SUSPENSA", D_CUBA = "DECA-INST-CUBA-DE-APOIO", D_VALV = "DECA-INST-VALVULA-DESCARGA-HYDRA";
  var AV_LETRAS = "Cotas lidas pelas LETRAS do desenho da ficha (sem legenda em texto): interpretação a conferir na imagem da página.";
  var AV_CONECTOR = "Posição dos conectores sem cota no catálogo: colocada na extremidade do corpo; conferir.";
  var AV_REGRA = "Posições de instalação = sugestão do catálogo Deca (regras das págs. 68-69/116), aplicadas a qualquer marca: confirmar com o folheto do modelo.";
  var AV_ESQ = "Volume envolvente esquemático (sem cota no catálogo): conferir antes de usar em desenho ou compatibilização.";

  var ESPECS = [
    { id: "hid-bacia-caixa-acoplada", nome: "Bacia sanitária com caixa acoplada", categoria: "loucas", sistemas: ["esgoto", "agua_fria"], tipos: ["bacia_caixa_acoplada"],
      descricao: "Bacia de piso com caixa acoplada. Origem = eixo da saída de esgoto, no piso; a parede fica em Z = −Esgoto_parede.",
      avisos: [AV_LETRAS, AV_REGRA, AV_CONECTOR],
      geo: [
        G("Comprimento", 0.65, [0.4, 0.9], L("A"), "Profundidade em planta (letra A da ficha)"),                    /* hid:ok geometria */
        G("Largura", 0.36, [0.25, 0.5], L("B"), "Largura em planta (letra B)"),                                      /* hid:ok geometria */
        G("Altura_borda", 0.4, [0.3, 0.55], L("C"), "Altura da borda/assento (letra C)"),                            /* hid:ok geometria */
        G("Altura_total", 0.8, [0.6, 1.1], L("D"), "Altura total com a caixa (letra D)"),                            /* hid:ok geometria */
        G("Prof_caixa", 0.2, null, null, "Profundidade da caixa acoplada (o catálogo só dá a caixa em ficha à parte)"), /* hid:ok geometria */
        I("Esgoto_parede", 0, DECA(D_BACIA_CX, "esgoto", "y"), "Eixo do esgoto até a parede acabada"),
        I("Agua_altura", 0, DECA(D_BACIA_CX, "agua_fria", "z"), "Altura do ponto de água sobre o piso"),
        I("Agua_lateral", 0, DECA(D_BACIA_CX, "agua_fria", "x"), "Afastamento lateral do ponto de água ao eixo do esgoto (− = à esquerda)"),
        DN("DN_esgoto", DECA(D_BACIA_CX, "esgoto", "dn"), "DN da saída de esgoto"),
        DN("DN_agua", null, "DN do ponto de água")
      ],
      solidos: [
        { id: "corpo", nome: "Bacia", forma: "caixa", x: "0", y: "0", z: "-Esgoto_parede + Comprimento/2", dx: "Largura", dy: "Altura_borda", dz: "Comprimento", material: "Material" },
        { id: "caixa", nome: "Caixa acoplada", forma: "caixa", x: "0", y: "Altura_borda", z: "-Esgoto_parede + Prof_caixa/2", dx: "Largura", dy: "Altura_total - Altura_borda", dz: "Prof_caixa", material: "Material" }
      ],
      conectores: [
        { id: "esgoto", nome: "Saída de esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "0", z: "0" },
        { id: "af", nome: "Água fria (caixa)", sistema: "agua_fria", dn: "DN_agua", x: "Agua_lateral", y: "Agua_altura", z: "-Esgoto_parede" }
      ], material: "Louça branca" },

    { id: "hid-bacia-convencional", nome: "Bacia sanitária convencional (válvula de descarga)", categoria: "loucas", sistemas: ["esgoto", "agua_fria"], tipos: ["bacia_convencional"],
      descricao: "Bacia de piso para válvula de descarga ou caixa alta. Origem = eixo da saída de esgoto, no piso; a parede fica em Z = −Esgoto_parede.",
      avisos: [AV_LETRAS, AV_REGRA, AV_CONECTOR],
      geo: [
        G("Comprimento", 0.6, [0.4, 0.9], L("A"), "Profundidade em planta (letra A da ficha)"),                      /* hid:ok geometria */
        G("Largura", 0.36, [0.25, 0.5], L("B"), "Largura em planta (letra B)"),                                      /* hid:ok geometria */
        G("Altura_borda", 0.4, [0.3, 0.55], L("C"), "Altura da borda/assento (letra C)"),                            /* hid:ok geometria */
        I("Esgoto_parede", 0, DECA(D_BACIA_CV, "esgoto", "y"), "Eixo do esgoto até a parede acabada"),
        I("Agua_altura", 0, DECA(D_BACIA_CV, "agua_fria", "z"), "Altura do tubo de ligação sobre o piso"),
        I("Agua_lateral", 0, DECA(D_BACIA_CV, "agua_fria", "x"), "Afastamento lateral do ponto de água ao eixo do esgoto"),
        DN("DN_esgoto", DECA(D_BACIA_CV, "esgoto", "dn"), "DN da saída de esgoto"),
        DN("DN_agua", null, "DN do ponto de água (válvula de descarga)")
      ],
      solidos: [{ id: "corpo", nome: "Bacia", forma: "caixa", x: "0", y: "0", z: "-Esgoto_parede + Comprimento/2", dx: "Largura", dy: "Altura_borda", dz: "Comprimento", material: "Material" }],
      conectores: [
        { id: "esgoto", nome: "Saída de esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "0", z: "0" },
        { id: "af", nome: "Água fria (tubo de ligação)", sistema: "agua_fria", dn: "DN_agua", x: "Agua_lateral", y: "Agua_altura", z: "-Esgoto_parede" }
      ], material: "Louça branca" },

    { id: "hid-lavatorio-coluna", nome: "Lavatório com coluna", categoria: "loucas", sistemas: ["esgoto", "agua_fria", "agua_quente"], tipos: ["lavatorio_coluna"],
      descricao: "Lavatório de pedestal. Origem no piso, centro do aparelho; a parede fica em Z = −Profundidade/2.",
      avisos: [AV_LETRAS, AV_REGRA, AV_CONECTOR, "Água quente à esquerda de quem olha a parede (convenção); conferir."],
      geo: [
        G("Largura", 0.55, [0.3, 0.8], L("B"), "Largura (letra B da ficha)"),                                        /* hid:ok geometria */
        G("Profundidade", 0.45, [0.25, 0.65], L("A"), "Profundidade (letra A)"),                                     /* hid:ok geometria */
        G("Altura_borda", 0.82, [0.7, 1], L("D"), "Altura da borda sobre o piso (letra D)"),                         /* hid:ok geometria */
        G("Altura_cuba", 0.16, null, null, "Espessura vertical da cuba (sem cota no catálogo)"),                      /* hid:ok geometria */
        G("Raio_coluna", 0.06, null, null, "Raio da coluna (sem cota no catálogo)"),                                  /* hid:ok geometria */
        I("Agua_altura", 0, DECA(D_LAV_COL, "agua_fria", "z"), "Altura dos pontos de água"),
        I("Esgoto_altura", 0, DECA(D_LAV_COL, "esgoto", "z"), "Altura do ponto de esgoto"),
        I("Agua_afastamento", 0, DECADADO(D_LAV_COL, "afastamentoEntrePontosAgua_mm"), "Afastamento entre os dois pontos de água"),
        DN("DN_esgoto", null, "DN do esgoto"), DN("DN_agua", null, "DN da água")
      ],
      solidos: [
        { id: "cuba", nome: "Lavatório", forma: "caixa", x: "0", y: "Altura_borda - Altura_cuba", z: "0", dx: "Largura", dy: "Altura_cuba", dz: "Profundidade", material: "Material" },
        { id: "coluna", nome: "Coluna", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "-Profundidade/2 + Raio_coluna", raio: "Raio_coluna", altura: "Altura_borda - Altura_cuba", material: "Material" }
      ],
      conectores: [
        { id: "esgoto", nome: "Esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "Esgoto_altura", z: "-Profundidade/2" },
        { id: "af", nome: "Água fria", sistema: "agua_fria", dn: "DN_agua", x: "Agua_afastamento/2", y: "Agua_altura", z: "-Profundidade/2" },
        { id: "aq", nome: "Água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Agua_afastamento/2", y: "Agua_altura", z: "-Profundidade/2" }
      ], material: "Louça branca" },

    { id: "hid-lavatorio-suspenso", nome: "Lavatório suspenso (coluna suspensa)", categoria: "loucas", sistemas: ["esgoto", "agua_fria", "agua_quente"], tipos: ["lavatorio_suspenso"],
      descricao: "Lavatório com coluna suspensa. Origem no piso, centro do aparelho; a parede fica em Z = −Profundidade/2.",
      avisos: [AV_LETRAS, AV_REGRA, AV_CONECTOR, "Água quente à esquerda de quem olha a parede (convenção); conferir."],
      geo: [
        G("Largura", 0.55, [0.3, 0.8], L("B"), "Largura (letra B da ficha)"),                                        /* hid:ok geometria */
        G("Profundidade", 0.45, [0.25, 0.65], L("A"), "Profundidade (letra A)"),                                     /* hid:ok geometria */
        G("Altura_borda", 0.82, [0.7, 1], L("D"), "Altura da borda sobre o piso (letra D)"),                         /* hid:ok geometria */
        G("Altura_cuba", 0.16, null, null, "Espessura vertical da cuba (sem cota no catálogo)"),                      /* hid:ok geometria */
        I("Agua_altura", 0, DECA(D_LAV_SUSP, "agua_fria", "z"), "Altura dos pontos de água"),
        I("Esgoto_altura", 0, DECA(D_LAV_SUSP, "esgoto", "z"), "Altura do ponto de esgoto"),
        I("Agua_afastamento", 0, DECALAT(D_LAV_SUSP, "interno"), "Afastamento entre os dois pontos de água: 2 × o ponto INTERNO do Deca (70 mm do eixo do esgoto, pág. 68; o externo é 340 mm)"),
        DN("DN_esgoto", null, "DN do esgoto"), DN("DN_agua", null, "DN da água")
      ],
      solidos: [{ id: "cuba", nome: "Lavatório", forma: "caixa", x: "0", y: "Altura_borda - Altura_cuba", z: "0", dx: "Largura", dy: "Altura_cuba", dz: "Profundidade", material: "Material" }],
      conectores: [
        { id: "esgoto", nome: "Esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "Esgoto_altura", z: "-Profundidade/2" },
        { id: "af", nome: "Água fria", sistema: "agua_fria", dn: "DN_agua", x: "Agua_afastamento/2", y: "Agua_altura", z: "-Profundidade/2" },
        { id: "aq", nome: "Água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Agua_afastamento/2", y: "Agua_altura", z: "-Profundidade/2" }
      ], material: "Louça branca" },

    { id: "hid-cuba-apoio", nome: "Cuba / lavatório de bancada", categoria: "loucas", sistemas: ["esgoto", "agua_fria", "agua_quente"], tipos: ["cuba"],
      descricao: "Cuba de apoio, de embutir ou de semi-encaixe. Origem = superfície do tampo, centro da cuba; ela sobe Altura_cuba acima do tampo.",
      avisos: [AV_LETRAS, AV_REGRA, AV_CONECTOR, "Esgoto 'abaixo do tampo' é a cota de cuba com válvula oculta (pág. 116); cuba comum varia por produto (tabela 3, pág. 115)."],
      geo: [
        G("Largura", 0.45, [0.25, 0.8], L("A"), "Largura (letra A da ficha)"),                                       /* hid:ok geometria */
        G("Profundidade", 0.4, [0.2, 0.65], L("B"), "Profundidade (letra B; ficha de cuba redonda só traz A e B)"),   /* hid:ok geometria */
        G("Altura_cuba", 0.13, [0.08, 0.3], L("C"), "Altura da cuba (letra C)"),                                     /* hid:ok geometria */
        I("Esgoto_abaixo_tampo", 0, ESGOTO_CUBA, "Ponto de esgoto abaixo do tampo (apoio: Deca p.115 tabela 3, 350 mm — 160 mm só com válvula oculta, p.116; embutir/semi-encaixe: abaixo da bacia + válvula + sifão, a conferir)"),
        DN("DN_esgoto", null, "DN do esgoto")
      ],
      solidos: [{ id: "cuba", nome: "Cuba", forma: "caixa", x: "0", y: "0", z: "0", dx: "Largura", dy: "Altura_cuba", dz: "Profundidade", material: "Material" }],
      /* FRENTE H7 (21/10/2026 — o Rogério: "coloquei uma cuba e ele não queria colocar de jeito nenhum a água fria nela, colocou só o
         esgoto"): a cuba de bancada só tinha o ponto de ESGOTO e o kit do lavatório ("ponto" af) acusava "sem ponto de água fria na
         família". Agora os pontos de água da TORNEIRA da cuba ficam na PAREDE atrás dela (Distancia_parede, que o Traçar
         automaticamente mede): mesa = 220 mm abaixo do tampo, parede = 220 mm acima (Deca p.116, a mesma leitura do js/marmoraria.js);
         água quente só com misturador (Agua_quente). Parâmetros e o engate flexível no bloco de geometria (adiante). */
      conectores: [{ id: "esgoto", nome: "Esgoto (saída do sifão, na parede)", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "-Esgoto_abaixo_tampo", z: "se(Distancia_parede > Profundidade/2; -Distancia_parede; 0)" },
        { id: "af", nome: "Água fria (torneira da cuba)", sistema: "agua_fria", dn: "DN_agua", x: "Agua_afastamento/2", y: "se(Torneira_de_parede; Agua_acima_tampo; -Agua_abaixo_tampo)", z: "-Distancia_parede" },
        { id: "aq", nome: "Água quente (misturador da cuba)", sistema: "agua_quente", dn: "DN_agua", x: "-Agua_afastamento/2", y: "se(Torneira_de_parede; Agua_acima_tampo; -Agua_abaixo_tampo)", z: "-Distancia_parede", visivel: "Agua_quente" }],
      material: "Louça branca" },

    { id: "hid-pia-cozinha", nome: "Pia de cozinha", categoria: "mobiliario", sistemas: ["esgoto"], tipos: [], generico: true,
      descricao: "Pia de cozinha. O catálogo extraído (F2) NÃO tem pia: família GENÉRICA, todas as cotas a conferir. Origem = superfície do tampo, centro da pia.",
      avisos: ["Sem produto de pia nos catálogos extraídos: todas as cotas são padrão de reserva — conferir ou preencher com o fabricante escolhido.", AV_CONECTOR],
      geo: [
        G("Largura", 1.2, [0.4, 2.5], null, "Largura da pia"),                                                        /* hid:ok geometria */
        G("Profundidade", 0.55, [0.35, 0.8], null, "Profundidade da pia"),                                           /* hid:ok geometria */
        G("Altura_cuba", 0.2, [0.1, 0.4], null, "Profundidade da cuba"),                                             /* hid:ok geometria */
        DN("DN_esgoto", null, "DN do esgoto")
      ],
      solidos: [{ id: "cuba", nome: "Pia", forma: "caixa", x: "0", y: "-Altura_cuba", z: "0", dx: "Largura", dy: "Altura_cuba", dz: "Profundidade", material: "Material" }],
      /* QUALIDADE VISUAL 2 (rodada 2): o ponto de esgoto é a SAÍDA do sifão sanfonado, na parede de trás (6 cm abaixo do
         fundo da cuba, como o js/hidlouca.js o desenha) — antes ficava na válvula, acima do sifão. Sem ficha de pia: a conferir */
      conectores: [{ id: "esgoto", nome: "Esgoto (saída do sifão, na parede)", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "-Altura_cuba - 0.06", z: "-Profundidade/2" }], material: "Aço inox" },   /* hid:ok geometria do sifão desenhado */

    { id: "hid-tanque-lavar", nome: "Tanque de lavar roupa", categoria: "loucas", sistemas: ["esgoto"], tipos: ["tanque"],
      descricao: "Tanque de louça (laundry sink). Origem no piso, centro do aparelho; a parede fica em Z = −Profundidade/2.",
      avisos: [AV_LETRAS, AV_CONECTOR, "A torneira é outra família (hid-torneira)."],
      geo: [
        G("Largura", 0.59, [0.4, 0.9], L("B"), "Largura (letra B da ficha)"),                                        /* hid:ok geometria */
        G("Profundidade", 0.52, [0.35, 0.7], L("A"), "Profundidade (letra A)"),                                      /* hid:ok geometria */
        G("Altura", 0.845, [0.6, 1.1], L("D"), "Altura total sobre o piso (letra D)"),                               /* hid:ok geometria */
        DN("DN_esgoto", null, "DN do esgoto")
      ],
      solidos: [{ id: "corpo", nome: "Tanque", forma: "caixa", x: "0", y: "0", z: "0", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }],
      conectores: [{ id: "esgoto", nome: "Esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "0", z: "-Profundidade/2" }], material: "Louça branca" },

    { id: "hid-mictorio", nome: "Mictório", categoria: "loucas", sistemas: ["agua_fria", "esgoto"], tipos: ["mictorio"],
      descricao: "Mictório de louça. Origem na base do aparelho, centro; a parede fica em Z = −Profundidade/2.",
      avisos: [AV_LETRAS, AV_CONECTOR, "A válvula/descarga do mictório não está nesta família."],
      geo: [
        G("Largura", 0.315, [0.2, 0.6], L("A"), "Largura (letra A da ficha)"),                                       /* hid:ok geometria */
        G("Profundidade", 0.345, [0.2, 0.6], L("B"), "Profundidade (letra B)"),                                      /* hid:ok geometria */
        G("Altura", 0.565, [0.4, 1.1], L("C"), "Altura do corpo (letra C; a letra D, 940 mm, pode ser altura de instalação)"), /* hid:ok geometria */
        DN("DN_agua", null, "DN da água"), DN("DN_esgoto", null, "DN do esgoto"),
        /* NBR 8160:1999, Tabela 3 (p.16): o UHC e o DN mínimo do ramal de descarga do mictório dependem do tipo de descarga.
           Índice da lista HidES.MICTORIO_DESCARGA; instância sem valor = padrão declarado do HidES (válvula: maior UHC e DN — lado seguro). */
        X("Tipo_descarga", "inteiro", 0, "Instalação", "Tipo de descarga (NBR 8160:1999, Tabela 3 — muda o UHC e o DN do ramal de descarga): 0 = válvula de descarga (padrão declarado: maior UHC e DN, lado seguro), 1 = caixa de descarga, 2 = descarga automática, 3 = de calha (UHC por metro: informe Comprimento_calha)"),
        X("Comprimento_calha", "comprimento", 0, "Instalação", "Mictório de calha (Tipo_descarga = 3): comprimento da calha em m — a Tabela 3 da NBR 8160 dá o UHC por metro; 0 = não informado"),
        /* PONTOS pela ficha (Celite 08280, pág. 52): F = piso até o ponto de água (1050), E = piso até a saída de esgoto (490), D = piso até o
           topo da louça (940), C = altura da louça (565). A origem da família é a BASE da louça (a 375 = D − C do piso, altura padrão da
           colocação em dados-fonte/hidro/kits/alturas-instalacao.json): os pontos ficam F − (D − C) e E − (D − C) acima dela */
        I("Agua_altura", 0.675, PONTO_MIC("F"), "Altura do ponto de água sobre a base da louça (letra F − (D − C) da pág. 52)"),   /* hid:ok geometria: padrão = F − (D − C) da ficha */
        I("Esgoto_altura", 0.115, PONTO_MIC("E"), "Altura da saída de esgoto sobre a base da louça (letra E − (D − C) da pág. 52)")   /* hid:ok geometria: padrão = E − (D − C) da ficha */
      ],
      solidos: [{ id: "corpo", nome: "Mictório", forma: "caixa", x: "0", y: "0", z: "0", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }],
      conectores: [
        { id: "af", nome: "Água fria (válvula)", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "Agua_altura", z: "-Profundidade/2" },
        { id: "esgoto", nome: "Esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "Esgoto_altura", z: "-Profundidade/2" }
      ], material: "Louça branca" }
  ];

  /* --- metais (Docol): sem cota no catálogo; origem = ponto de alimentação de água --- */
  function metal(id, nome, tipos, sistemas, conectores, descr, extraAv) {
    return {
      id: id, nome: nome, categoria: "loucas", sistemas: sistemas, tipos: tipos, volume: true,
      descricao: descr + " Origem = ponto de alimentação de água (o catálogo não traz cotas de instalação): coloque a instância na altura do ponto.",
      avisos: [AV_ESQ].concat(extraAv || [], ["Pressão e temperatura do Docol são as impressas na PÁGINA do produto, não necessariamente de cada código."]),
      geo: [
        G("Largura", 0.06, null, null, "Largura do volume envolvente"),                                              /* hid:ok geometria */
        G("Altura", 0.12, null, null, "Altura do volume envolvente"),                                                /* hid:ok geometria */
        G("Profundidade", 0.15, null, null, "Projeção a partir do ponto de água"),                                   /* hid:ok geometria */
        DN("DN_agua", DNINT(function (it) { return it.dn; }), "DN da ligação (bitola do catálogo convertida pela correspondência polegada→DN dos catálogos)")
      ],
      solidos: [{ id: "corpo", nome: "Volume envolvente", forma: "caixa", x: "0", y: "0", z: "Profundidade/2", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }],
      conectores: conectores, material: "Metal cromado"
    };
  }
  var CON_AF = [{ id: "af", nome: "Água fria", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "0", z: "0" }];
  var CON_AF_AQ = [{ id: "af", nome: "Água fria", sistema: "agua_fria", dn: "DN_agua", x: "0.04", y: "0", z: "0" },       /* hid:ok afastamento entre pontos do misturador: a conferir */
                   { id: "aq", nome: "Água quente", sistema: "agua_quente", dn: "DN_agua", x: "-0.04", y: "0", z: "0" }];  /* hid:ok idem */
  /* ⚠ REVISÃO H5 (21/10/2026, ALTO): o chuveiro só tinha o ponto de ÁGUA FRIA — com aquecedor no modelo, a ducha (o principal ponto
     de água quente da casa) ficava sem água quente e o Traçar não via nada a traçar. Agora a DUCHA (não elétrica: a metálica do
     catálogo Docol, que não aquece) tem o ponto de ÁGUA QUENTE do misturador de parede (registros de AF e AQ separados): na altura do
     registro de pressão (RP), ao lado do eixo do braço. O chuveiro ELÉTRICO (Eletrico = sim) aquece a água: só a água fria.
     Desnível = CH − RP da tabela da Tigre (Manual Técnico 2025, p.40: CH 2,20 m, RP 1,10 m — dados-fonte/hidro/kits/alturas-pontos.json);
     o afastamento lateral entre os registros não tem cota no catálogo (a conferir, aviso da família). */
  var CON_CHUVEIRO = [CON_AF[0], { id: "aq", nome: "Água quente (misturador de parede, na altura do RP)", sistema: "agua_quente", dn: "DN_agua", x: "-Misturador_afastamento", y: "-Misturador_desnivel", z: "0", visivel: "1 - Eletrico" }];
  ESPECS.push(metal("hid-chuveiro", "Chuveiro / ducha", ["chuveiro"], ["agua_fria", "agua_quente"], CON_CHUVEIRO, "Chuveiro e ducha de parede ou de teto (Docol). A ducha recebe água fria e água quente pelo misturador de parede (dois registros); o chuveiro elétrico, só água fria.",
    ["Afastamento lateral entre o registro de água fria e o de água quente do misturador sem cota no catálogo: conferir."]));
  ESPECS[ESPECS.length - 1].geo.push(
    X("Eletrico", "simnao", false, "Instalação", "Chuveiro elétrico (corpo com resistência) no lugar da ducha metálica — só água fria (sem o ponto de água quente)"),
    I("Misturador_desnivel", 1.1, null, "Desnível do braço (ponto CH) ao ponto de água quente do misturador (registro na altura RP): CH − RP da Tigre p.40 (2,20 − 1,10)"),   /* hid:ok geometria: CH − RP da tabela da Tigre p.40 */
    I("Misturador_afastamento", 0.15, null, "Afastamento lateral do ponto de água quente do misturador ao eixo do braço (sem cota no catálogo: a conferir)"));   /* hid:ok geometria a conferir (sem cota no catálogo) */
  ESPECS.push(metal("hid-ducha-higienica", "Ducha higiênica", ["ducha_higienica"], ["agua_fria"], CON_AF, "Ducha higiênica com registro (Docol).", []));
  ESPECS.push(metal("hid-torneira", "Torneira", ["torneira"], ["agua_fria"], CON_AF, "Torneira de lavatório, cozinha, jardim e tanque (Docol).", []));
  ESPECS.push(metal("hid-misturador", "Misturador (água fria + quente)", ["misturador"], ["agua_fria", "agua_quente"], CON_AF_AQ, "Misturador de lavatório, cozinha, bidê e chuveiro (Docol).",
    ["Afastamento entre os pontos de água fria e quente do misturador sem cota no catálogo: conferir."]));
  /* o misturador tem DOIS pontos: acerta a descrição da posição dos conectores */
  /* registros: em linha */
  function registro(id, nome, tipos, descr) {
    return {
      id: id, nome: nome, categoria: "acessorio_tubo", sistemas: ["agua_fria"], tipos: tipos, volume: true,
      descricao: descr + " Em linha: origem no centro do corpo, tubo ao longo do X.",
      avisos: [AV_ESQ, "DN do registro = o do catálogo (PVC soldável = diâmetro externo em mm; roscável/metal = bitola em polegada convertida pelos catálogos)."],
      geo: [
        G("Comprimento", 0.07, null, null, "Comprimento do corpo entre as pontas"),                                    /* hid:ok geometria */
        G("Altura", 0.08, null, null, "Altura do corpo com a manopla"),                                               /* hid:ok geometria */
        G("Profundidade", 0.05, null, null, "Largura do corpo"),                                                      /* hid:ok geometria */
        DN("DN_agua", DNCAT(function (it) { return it.dn; }), "DN do registro")
      ],
      solidos: [{ id: "corpo", nome: "Corpo do registro", forma: "caixa", x: "0", y: "-Altura/2", z: "0", dx: "Comprimento", dy: "Altura", dz: "Profundidade", material: "Material" }],
      conectores: [
        { id: "a", nome: "Ponta A", sistema: "agua_fria", dn: "DN_agua", x: "-Comprimento/2", y: "0", z: "0" },
        { id: "b", nome: "Ponta B", sistema: "agua_fria", dn: "DN_agua", x: "Comprimento/2", y: "0", z: "0" }
      ], material: "Metal"
    };
  }
  ESPECS.push(registro("hid-registro-gaveta", "Registro de gaveta", ["registro_gaveta"], "Registro de gaveta."));
  ESPECS.push(registro("hid-registro-pressao", "Registro de pressão", ["registro_pressao"], "Registro de pressão (chuveiro/torneira)."));
  ESPECS.push(registro("hid-registro-esfera", "Registro de esfera", ["registro_esfera"], "Registro de esfera, soldável e roscável."));

  ESPECS.push({
    id: "hid-valvula-descarga", nome: "Válvula de descarga", categoria: "acessorio_tubo", sistemas: ["agua_fria"], tipos: ["valvula_descarga"], volume: true,
    descricao: "Válvula de descarga Deca (Hydra e Slim). Origem = ponto da entrada de água; a bitola (DN32/DN40) é a do catálogo.",
    avisos: [AV_ESQ, "Vazão em L/s não consta do catálogo Deca (só o volume de descarga, em texto): fica por conta do motor de norma."],
    geo: [
      G("Largura", 0.1, null, null, "Largura do volume envolvente"),                                                  /* hid:ok geometria */
      G("Altura", 0.2, null, null, "Altura do volume envolvente"),                                                    /* hid:ok geometria */
      G("Profundidade", 0.1, null, null, "Projeção"),                                                                 /* hid:ok geometria */
      I("Altura_acionamento", 0, DECADADO(D_VALV, "alturaDoAcionamentoDaValvula_mm"), "Altura do acionamento sobre o piso (dica de instalação Hydra, pág. 31)"),
      DN("DN_agua", function (it) { var c = arr(it.conectores)[0]; return c && typeof c.dn === "number" ? { v: c.dn, origem: "catalogo" } : null; }, "DN da entrada")
    ],
    solidos: [{ id: "corpo", nome: "Volume envolvente", forma: "caixa", x: "0", y: "-Altura*0.4", z: "Profundidade/2", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }],
    /* ⚠ a SAÍDA (descarga para a bacia) é um conector de verdade (frente A, 19/10/2026 — D-02 do diagnóstico): sem ele a
       descida do kit começava no ar, abaixo da válvula, marcada "continua" para o verificador não acusar a ponta solta.
       Posição no volume envolvente esquemático (AV_ESQ): abaixo da entrada, no mesmo prumo */
    conectores: [{ id: "af", nome: "Entrada de água", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "0", z: "0" },
                 { id: "descarga", nome: "Saída para a bacia (descarga)", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "-Altura*0.4", z: "0" }], material: "Metal"   /* hid:ok geometria do volume esquemático */
  });
  ESPECS.push({
    id: "hid-caixa-descarga-embutida", nome: "Caixa de descarga embutida", categoria: "equipamento", sistemas: ["agua_fria"], tipos: ["caixa_descarga_embutida"], volume: true,
    descricao: "Caixa de descarga embutida Deca (Hydra), mecânica ou pneumática. Origem = ponto da entrada de água, centro da caixa.",
    avisos: [AV_ESQ, "Algumas cotas do catálogo estão só em desenho (altura da caixa): conferir."],
    geo: [
      G("Largura", 0.46, null, DADO("largura_mm", true), "Largura (catálogo)"),                                       /* hid:ok geometria */
      G("Espessura", 0.08, null, DADO("espessura_mm", true), "Espessura da caixa (catálogo)"),                        /* hid:ok geometria */
      G("Altura", 0.6, null, null, "Altura da caixa (só em desenho no catálogo)"),                                    /* hid:ok geometria */
      DN("DN_agua", function (it) { var m = /DN\s*(\d+)/i.exec(txt(it.dados.registroIntegrado)); return m ? { v: parseInt(m[1], 10), origem: "catalogo" } : null; }, "DN do registro integrado") /* hid:ok base decimal */
    ],
    solidos: [{ id: "corpo", nome: "Caixa embutida", forma: "caixa", x: "0", y: "0", z: "-Espessura/2", dx: "Largura", dy: "Altura", dz: "Espessura", material: "Material" }],
    conectores: [{ id: "af", nome: "Entrada de água", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "0", z: "0" }], material: "Plástico"
  });

  /* --- caixas e ralos: origem no piso acabado, corpo para baixo (Y negativo) --- */
  var CX_CORPO = [{ id: "corpo", nome: "Corpo", forma: "caixa", x: "0", y: "-Altura", z: "0", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }];
  ESPECS.push({
    id: "hid-caixa-sifonada", nome: "Caixa sifonada / caixa seca", categoria: "equipamento", sistemas: ["esgoto"], tipos: ["caixa_sifonada", "caixa_seca"],
    descricao: "Caixa sifonada ou seca de PVC (Amanco, Tigre). Origem = piso acabado, centro da caixa; o corpo desce Altura abaixo do piso.",
    avisos: ["Amanco: Largura e Altura são os números 1º e 2º do nome do modelo (C×A×DN; a ficha confirma A = altura nominal). Tigre: o catálogo não define o significado de '100 x 140 x 50' — cotas a conferir.", AV_CONECTOR],
    geo: [
      G("Largura", 0.15, [0.08, 0.35], NOME(1), "Lado da caixa em planta"),                                           /* hid:ok geometria */
      G("Profundidade", 0.15, [0.08, 0.35], NOME(1), "Lado da caixa em planta (caixa quadrada)"),                     /* hid:ok geometria */
      G("Altura", 0.1, [0.05, 0.3], NOME(2), "Altura nominal do corpo"),                                              /* hid:ok geometria */
      DN("DN_entrada", conectorCat("entrada"), "DN das entradas"), DN("DN_saida", conectorCat("saida"), "DN da saída")
    ],
    extraDados: [["Fecho_hidrico_mm", "fechoHidrico_mm", "Fecho hídrico"], ["Entradas", "entradas", "Número de entradas"]],
    solidos: CX_CORPO,
    conectores: [
      { id: "entrada", nome: "Entrada", sistema: "esgoto", dn: "DN_entrada", x: "-Largura/2", y: "0", z: "0" },
      { id: "saida", nome: "Saída", sistema: "esgoto", dn: "DN_saida", x: "Largura/2", y: "-Altura", z: "0" }
    ], material: "PVC"
  });
  ESPECS.push({
    id: "hid-ralo", nome: "Ralo", categoria: "equipamento", sistemas: ["esgoto"], tipos: ["ralo"],
    descricao: "Ralo seco ou sifonado de PVC (Amanco, Tigre). Origem = piso acabado, centro; o corpo desce Altura abaixo do piso.",
    avisos: ["Amanco: Largura e Altura são os números do nome do modelo (grelha × altura × DN). Tigre: o catálogo não traz cotas — conferir.", AV_CONECTOR],
    geo: [
      G("Largura", 0.1, [0.05, 0.3], function (it) { var m = /(\d+)\s*X\s*(\d+)\s*X\s*DN/i.exec(it.descricao); return m ? { v: mm(parseInt(m[1], 10)), origem: "catalogo" } : null; }, "Lado/diâmetro da grelha"), /* hid:ok geometria */
      G("Profundidade", 0.1, [0.05, 0.3], function (it) { var m = /(\d+)\s*X\s*(\d+)\s*X\s*DN/i.exec(it.descricao); return m ? { v: mm(parseInt(m[1], 10)), origem: "catalogo" } : null; }, "Lado/diâmetro da grelha"), /* hid:ok geometria */
      G("Altura", 0.06, [0.02, 0.3], NOME(2), "Altura do corpo"),                                                     /* hid:ok geometria */
      DN("DN_saida", conectorCat("saida"), "DN da saída")
    ],
    extraDados: [["Fecho_hidrico_mm", "fechoHidrico_mm", "Fecho hídrico"]],
    solidos: CX_CORPO,
    conectores: [{ id: "saida", nome: "Saída", sistema: "esgoto", dn: "DN_saida", x: "0", y: "-Altura", z: "0" }], material: "PVC"
  });
  function caixaCil(id, nome, tipo, altLetra, descr, sistema) {
    sistema = sistema || "esgoto";
    return {
      id: id, nome: nome, categoria: "equipamento", sistemas: [sistema], tipos: [tipo],
      descricao: descr + " Origem = piso acabado, centro; o corpo desce Altura abaixo do piso.",
      avisos: [AV_LETRAS, AV_CONECTOR, "Diâmetro = DN nominal do catálogo (DN300 nas caixas Amanco); Tigre sem cotas."],
      geo: [
        G("Diametro", 0.3, [0.15, 0.6], function (it) { return typeof it.dn === "number" && it.dn >= 200 ? { v: mm(it.dn), origem: "catalogo" } : null; }, "Diâmetro nominal da caixa"),   /* hid:ok geometria */
        G("Altura", 0.42, [0.2, 0.9], L(altLetra), "Altura do corpo (letra " + altLetra + ")"),                       /* hid:ok geometria */
        DN("DN_entrada", DNREF("D2"), "DN da entrada"), DN("DN_saida", DNREF("D1"), "DN da saída")
      ],
      extraDados: [["Volume_retencao_L", "volumeRetencaoCaixaGordura_L", "Volume de retenção"]],
      solidos: [{ id: "corpo", nome: "Corpo", forma: "cilindro", eixo: "y", x: "0", y: "-Altura", z: "0", raio: "Diametro/2", altura: "Altura", material: "Material" }],
      conectores: [
        { id: "entrada", nome: "Entrada", sistema: sistema, dn: "DN_entrada", x: "-Diametro/2", y: "0", z: "0" },
        { id: "saida", nome: "Saída", sistema: sistema, dn: "DN_saida", x: "Diametro/2", y: "-Altura", z: "0" }
      ], material: "PVC"
    };
  }
  ESPECS.push(caixaCil("hid-caixa-gordura", "Caixa de gordura", "caixa_gordura", "C", "Caixa de gordura de PVC (Amanco DN300, Tigre)."));
  ESPECS.push(caixaCil("hid-caixa-inspecao", "Caixa de inspeção", "caixa_inspecao", "C1", "Caixa de inspeção de PVC (Amanco DN300, Tigre)."));
  /* pluvial (NBR 10844 5.7.3–5.7.5): inspeção aparente ou caixa de areia enterrada — os mesmos produtos de caixa de inspeção do catálogo */
  ESPECS.push(caixaCil("hid-caixa-areia", "Caixa de areia / inspeção (pluvial)", "caixa_inspecao", "C1", "Caixa de areia ou de inspeção do pluvial (produtos de caixa de inspeção do catálogo).", "pluvial"));

  /* --- reservatórios (Fortlev: cotas com nome na legenda; Amanco: só volume) --- */
  function reserv(id, nome, tipo, dia, alt, descr) {
    return {
      id: id, nome: nome, categoria: "equipamento", sistemas: ["agua_fria"], tipos: [tipo],
      descricao: descr + " Origem = centro da base, no piso.",
      avisos: [AV_CONECTOR, "Cotas do catálogo em metros aproximados (Fortlev); Amanco só traz o volume (cotas só em desenho). Extravasor e limpeza não estão modelados nesta versão."],
      geo: [
        G("Diametro", 1.2, [0.4, 4], N(dia), "Diâmetro externo (" + dia + ")"),                                       /* hid:ok geometria */
        G("Altura", 1, [0.3, 5], N(alt), "Altura total (" + alt + ")"),                                              /* hid:ok geometria */
        DN("DN_entrada", null, "DN da entrada"), DN("DN_saida", null, "DN da saída")
      ],
      extraDados: [["Volume_L", "volume_L", "Volume nominal (L)"], ["Flange_saida_max_mm", "flangeSaidaMaximo_mm", "Flange de saída: bitola máxima (mm); NÃO é o DN de projeto"]],
      solidos: [{ id: "corpo", nome: "Reservatório", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "0", raio: "Diametro/2", altura: "Altura", material: "Material" }],
      conectores: [
        { id: "entrada", nome: "Entrada (alimentação)", sistema: "agua_fria", dn: "DN_entrada", x: "-Diametro/2", y: "Altura", z: "0" },
        { id: "saida", nome: "Saída (consumo)", sistema: "agua_fria", dn: "DN_saida", x: "Diametro/2", y: "0", z: "0" }
      ], material: "Polietileno"
    };
  }
  ESPECS.push(reserv("hid-caixa-dagua", "Caixa d'água", "reservatorio_caixa_dagua", "diametro_com_tampa_mm", "altura_com_tampa_mm", "Caixa d'água de polietileno (Fortlev)."));
  ESPECS.push(reserv("hid-cisterna", "Cisterna", "reservatorio_cisterna", "diametro_base_mm", "altura_total_mm", "Cisterna (Fortlev e Amanco)."));
  ESPECS.push(reserv("hid-reservatorio-tanque", "Reservatório tipo tanque (polietileno)", "reservatorio_tanque", "diametro_total_mm", "altura_total_mm",
    "Tanques Fortlev (uso geral, verde, industrial) — são reservatórios, não o tanque de lavar roupa. Alguns são retangulares: comprimento × largura ficam em Cotas_ficha."));
  /* QUALIDADE VISUAL 2 (rodada 2): o furo da ENTRADA (torneira de boia) é no CORPO, abaixo da tampa — o conector estava na
     borda de cima (y = Altura, a tampa) e o adaptador desenhado (js/hidlouca.js) a 0,86 da altura do corpo; a SAÍDA é na
     base, no adaptador (3 cm acima do fundo, na face do corpo). Na caixa de polietileno os furos são feitos na obra (a
     ficha Fortlev não os cota): a posição é a do desenho, a conferir. Corpo: Altura_corpo/Diametro_corpo do catálogo,
     ou a proporção do desenho quando o tipo não traz. */
  (function () {
    var RES = {   /* hid:ok proporções e folgas do desenho dos reservatórios (js/hidlouca.js geoReservatorio) */
      "hid-caixa-dagua": { R: "se(Diametro_corpo > 0; Diametro_corpo; Diametro*0.993)/2", B: "se(Altura_corpo > 0; Altura_corpo; Altura*0.784)", kE: "0.97" },
      "hid-cisterna": { R: "Diametro/2", B: "se(Altura_corpo > 0; Altura_corpo; Altura*0.93)", kE: "0.96" },
      "hid-reservatorio-tanque": { R: "Diametro/2", B: "Altura*0.93", kE: "0.96" }
    };
    ESPECS.forEach(function (e) {
      var r = RES[e.id]; if (!r) return;
      e.conectores = [
        { id: "entrada", nome: "Entrada (alimentação, no corpo)", sistema: "agua_fria", dn: "DN_entrada", x: "-(" + r.R + "*" + r.kE + " + 0.056)", y: "(" + r.B + ")*0.86", z: "0" },   /* hid:ok adaptador desenhado */
        { id: "saida", nome: "Saída (consumo, na base)", sistema: "agua_fria", dn: "DN_saida", x: r.R + " + 0.026", y: "0.03", z: "0" }   /* hid:ok adaptador desenhado */
      ];
      /* N23 (26/10/2026): a 2ª saída (coluna exclusiva da válvula de descarga) — só existe quando o Traçar a grava (Ad_saida2 > 0), no
         mesmo raio e cota da saída, girada de Ang_saida2. O cálculo a trata como o mesmo nó da saída (js/hidgrafo.js) */
      if (e.id !== "hid-cisterna") e.conectores.push({ id: "saida2", nome: "2ª saída (válvula de descarga)", sistema: "agua_fria", dn: "Ad_saida2", visivel: "Ad_saida2 > 0",
        x: "(" + r.R + " + 0.026)*cos(Ang_saida2*57.2957795)", y: "0.03", z: "-(" + r.R + " + 0.026)*sen(Ang_saida2*57.2957795)" });   /* hid:ok rad → graus (as fórmulas da família usam graus) */
    });
  })();

  /* --- incêndio e bomba: famílias GENÉRICAS (o catálogo extraído não traz cotas desses produtos) ---
     As medidas de reserva do hidrante, do extintor e do sprinkler são as das peças do js/biminst.js (PECAS);
     bomba é reserva. Tudo a conferir com o folheto do modelo escolhido. */
  var AV_GENERICA = "Sem cotas do produto nos catálogos extraídos: todas as cotas são padrão de reserva — conferir ou preencher com o modelo escolhido.";
  ESPECS.push({
    id: "hid-bomba", nome: "Bomba centrífuga (motor + voluta + base)", categoria: "equipamento", sistemas: ["agua_fria"], tipos: [], generico: true,
    descricao: "Bomba centrífuga de eixo horizontal. Origem = piso, centro da base; eixo da bomba ao longo do X; sucção em −X, recalque para cima.",
    avisos: [AV_GENERICA, AV_CONECTOR],
    geo: [
      G("Comprimento", 0.55, [0.2, 1.5], null, "Comprimento da base (eixo da bomba)"),                                    /* hid:ok geometria de reserva */
      G("Largura", 0.25, [0.12, 0.8], null, "Largura da base e da voluta"),                                               /* hid:ok geometria de reserva */
      G("Altura", 0.32, [0.15, 1], null, "Altura total até a boca de recalque"),                                          /* hid:ok geometria de reserva */
      DN("DN_succao", null, "DN da sucção"), DN("DN_recalque", null, "DN do recalque")
    ],
    solidos: [],
    conectores: [
      { id: "succao", nome: "Sucção", sistema: "agua_fria", dn: "DN_succao", x: "-Comprimento/2", y: "0.03 + Largura/2", z: "0" },
      { id: "recalque", nome: "Recalque", sistema: "agua_fria", dn: "DN_recalque", x: "-Comprimento/2 + Comprimento*0.3", y: "Altura", z: "0" }
    ], material: "Azul" });
  /* N23 (23/10/2026): BASE DE APOIO da caixa d'água elevada — pedido do Rogério: "se a pressão não atende, sugere elevar a caixa com base
     de apoio, madeira ou metálica, estrutura + caixa em cima, peso cheio no cálculo do apoio, orçada". As cotas e as seções vêm do
     dimensionamento (js/hidbaseapoio.js), gravadas na INSTÂNCIA; o preço da metálica (sem composição SINAPI) vai pela referência
     pública marcada PROVISÓRIA (Preco_unitario/Fonte_preco — o Orçamento do modelo a lança como "REF-MERC"); a de madeira, pelas
     composições SINAPI dos serviços (op "orcar"). */
  function IC(nome, def, desc) { var g = I(nome, def, null, desc); g.semConferir = true; return g; }
  ESPECS.push({
    id: "hid-base-caixa", nome: "Base de apoio da caixa d'água (madeira ou metálica)", categoria: "equipamento", sistemas: ["agua_fria"], tipos: [], generico: true,
    descricao: "Torre de apoio da caixa d'água elevada: 4 pilares, 2 vigas, barrotes, tablado, travessas e contraventamento em X nas 4 faces. Origem = centro da base, no apoio (laje/forro); o topo do tablado é a base da caixa. Seções pelo dimensionamento (peso da caixa CHEIA).",
    avisos: ["As seções e as cotas vêm do pré-dimensionamento (Corrigir da pressão / Montar barrilete): o vento (NBR 6123) e a ligação na laje de apoio ficam com o RT."],
    geo: [
      IC("Lado", 1.3, "Lado do tablado (m)"), IC("Altura", 1.0, "Altura do apoio ao topo do tablado (m)"), IC("Secao_pilar", 0.15, "Seção quadrada do pilar (m)"),   /* hid:ok reserva de desenho: o dimensionamento grava */
      IC("Base_viga", 0.06, "Base da viga principal (m)"), IC("Altura_viga", 0.16, "Altura da viga principal (m)"), IC("Base_barrote", 0.06, "Base do barrote (m)"),   /* hid:ok reserva de desenho */
      IC("Altura_barrote", 0.12, "Altura do barrote (m)"), IC("Espessura_tablado", 0.025, "Espessura do tablado (m)"),   /* hid:ok reserva de desenho */
      X("N_barrotes", "numero", 4, "Instalação", "Número de barrotes sobre as vigas"), X("Metalica", "simnao", false, "Instalação", "Estrutura metálica (tubo quadrado, chapa xadrez); não = madeira serrada"),   /* hid:ok reserva de desenho */
      X("Peso_cheio_kN", "numero", 0, "Instalação", "Peso da caixa CHEIA que o apoio recebe (kN, característico) — do dimensionamento"),
      X("Preco_unitario", "numero", 0, "Instalação", "Preço da base (R$) quando não há composição SINAPI (a metálica): referência pública"),
      X("Fonte_preco", "texto", "", "Instalação", "Fonte do preço (base pública, código, data)"), X("Peca_catalogo", "texto", "", "Instalação", "Identificação da referência de preço"),
      X("Preco_provisorio", "simnao", false, "Instalação", "Preço provisório (cotar com o fornecedor)"), X("Motivo_preco", "texto", "", "Instalação", "Por que o preço é provisório"), X("Data_preco", "texto", "", "Instalação", "Data-base do preço")
    ],
    solidos: [], conectores: [], material: "madeira escura",
    /* os SERVIÇOS MEDIDOS da base (o Orçamento do modelo: op "orcar" com medida "servico:<id>"; o código é da instância — a madeira; a
       metálica vai pela referência pública e não usa estes). As medidas são as da forma (js/hidlouca.js geoBaseCaixa) */
    servicos: [
      { id: "pilares", descricao: "Pilares da base (4 × a altura do pilar)", unidade: "m", quantidade: "4 * max(Secao_pilar; Altura - Espessura_tablado - Altura_barrote - Altura_viga)", codigo: "" },
      { id: "vigas", descricao: "Vigas principais (2 × o lado)", unidade: "m", quantidade: "2 * Lado", codigo: "" },
      { id: "barrotes", descricao: "Barrotes (n × o lado)", unidade: "m", quantidade: "N_barrotes * Lado", codigo: "" },
      { id: "contravento", descricao: "Travessas e diagonais (X nas 4 faces)", unidade: "m", quantidade: "4 * (Lado - Secao_pilar) + 8 * raiz((Lado - 2 * Secao_pilar) * (Lado - 2 * Secao_pilar) + (Altura - Espessura_tablado - Altura_barrote - Altura_viga) * (Altura - Espessura_tablado - Altura_barrote - Altura_viga))", codigo: "" },
      { id: "tablado", descricao: "Tablado (lado × lado)", unidade: "m2", quantidade: "Lado * Lado", codigo: "" }
    ] });
  ESPECS.push({
    id: "hid-hidrante-abrigo", nome: "Abrigo de hidrante (mangueira + registro)", categoria: "equipamento", sistemas: ["incendio"], tipos: [], generico: true,
    descricao: "Abrigo de mangueira com porta de vidro. Origem = piso, centro da caixa; a parede fica em Z = −Profundidade/2.",
    avisos: [AV_GENERICA, AV_CONECTOR],
    geo: [
      G("Largura", 0.75, [0.3, 1.5], null, "Largura do abrigo"),                                                           /* hid:ok geometria de reserva (peça hidrante_abrigo do biminst) */
      G("Altura", 0.9, [0.4, 1.8], null, "Altura do abrigo"),                                                              /* hid:ok geometria de reserva (peça hidrante_abrigo do biminst) */
      G("Profundidade", 0.3, [0.15, 0.6], null, "Profundidade do abrigo"),                                                 /* hid:ok geometria de reserva (peça hidrante_abrigo do biminst) */
      DN("DN_ramal", null, "DN da ligação do registro")
    ],
    solidos: [],
    conectores: [{ id: "entrada", nome: "Entrada do registro", sistema: "incendio", dn: "DN_ramal", x: "-Largura*0.25", y: "Altura*0.35", z: "-Profundidade/2" }], material: "Vermelho" });
  ESPECS.push({
    id: "hid-extintor", nome: "Extintor portátil", categoria: "equipamento", sistemas: ["incendio"], tipos: [], generico: true,
    descricao: "Extintor portátil. Origem = piso, centro do cilindro. Sem conector: não liga a rede.",
    avisos: [AV_GENERICA],
    geo: [
      G("Diametro", 0.18, [0.08, 0.4], null, "Diâmetro do cilindro"),                                                      /* hid:ok geometria de reserva (peça extintor do biminst: raio 0,09) */
      G("Altura", 0.55, [0.3, 1.2], null, "Altura total com a válvula")                                                    /* hid:ok geometria de reserva (peça extintor do biminst) */
    ],
    solidos: [], conectores: [], material: "Vermelho" });
  ESPECS.push({
    id: "hid-sprinkler", nome: "Chuveiro automático (sprinkler pendente)", categoria: "equipamento", sistemas: ["incendio"], tipos: [], generico: true,
    descricao: "Sprinkler pendente. Origem = a rosca de ligação, no teto; o corpo desce Altura abaixo dela.",
    avisos: [AV_GENERICA, AV_CONECTOR],
    geo: [
      G("Diametro", 0.06, [0.03, 0.12], null, "Diâmetro do defletor"),                                                     /* hid:ok geometria de reserva (peça chuveiro_automatico do biminst) */
      G("Altura", 0.06, [0.03, 0.15], null, "Altura da rosca ao defletor"),                                                /* hid:ok geometria de reserva (peça chuveiro_automatico do biminst) */
      DN("DN_ramal", null, "DN da rosca de ligação")
    ],
    solidos: [],
    conectores: [{ id: "entrada", nome: "Rosca de ligação", sistema: "incendio", dn: "DN_ramal", x: "0", y: "0", z: "0" }], material: "Metal cromado" });

  /* ============================================================ GEOMETRIA FIEL
   * (pedido do Rogério, 17/10/2026: "equipamentos modelados como nos catálogos".)
   * Cada família ganha FORMA RECONHECÍVEL, toda em FÓRMULA das cotas do tipo — nada de malha importada:
   * revolução (bacia, lavatório, cuba, reservatório, extintor, crivo), cilindro e caixa. O VOLUME
   * ENVOLVENTE é o de sempre (Largura × Altura × Profundidade do tipo): a forma preenche a caixa das cotas e
   * os conectores seguem nas posições de antes — o teste test-hid-geometria.js prova as duas coisas.
   * Detalhe do fabricante que o catálogo não dá (curvas, raios) é proporção de reserva sobre a cota — e
   * a família segue marcada "a conferir". Teto de triângulos por família: ver TETO_TRIANGULOS. */
  function S(v) { return String(v); }
  function cxs(id, nome, x, y, z, dx, dy, dz, mat, vis) {
    var s = { id: id, nome: nome, forma: "caixa", x: S(x), y: S(y), z: S(z), dx: S(dx), dy: S(dy), dz: S(dz), material: mat || "Material" };
    if (vis) s.visivel = vis;
    return s;
  }
  function cil(id, nome, eixo, x, y, z, r, h, mat, vis) {
    var s = { id: id, nome: nome, forma: "cilindro", eixo: eixo, x: S(x), y: S(y), z: S(z), raio: S(r), altura: S(h), material: mat || "Material" };
    if (vis) s.visivel = vis;
    return s;
  }
  function rev(id, nome, x, y, z, perfil, o) {
    o = o || {};
    var s = { id: id, nome: nome, forma: "revolucao", x: S(x), y: S(y), z: S(z), perfil: perfil.map(function (q) { return [S(q[0]), S(q[1])]; }), material: o.mat || "Material" };
    if (o.ex) s.ex = S(o.ex);
    if (o.ez) s.ez = S(o.ez);
    if (o.eixo) s.eixo = o.eixo;
    if (o.fechar) s.fechar = o.fechar;
    if (o.vis) s.visivel = o.vis;
    return s;
  }
  var CROMO = "Metal cromado", INOX = "Inox", LOUCA = "Louça branca", VIDRO = "Vidro";
  /* bacia: concha oval por revolução (r em fração do semi-eixo), borda, cavidade e assento */
  function concha(zc, alt) {
    return rev("corpo", "Bacia", "0", "0", zc, [["0.55", "0"], ["0.66", alt + "*0.3"], ["0.9", alt + "*0.66"], ["1", alt + "*0.86"], ["1", alt + "*0.92"],
      ["0.8", alt + "*0.92"], ["0.7", alt + "*0.8"], ["0.3", alt + "*0.74"], ["0", alt + "*0.72"]], { ex: "Largura/2", ez: "Comprimento/2", mat: LOUCA });
  }
  function assento(zc, alt) {
    return rev("assento", "Assento", "0", "0", zc, [["1", alt + "*0.92"], ["1", alt], ["0.74", alt], ["0.74", alt + "*0.92"]], { ex: "Largura/2", ez: "Comprimento/2", fechar: "perfil", mat: "Branco" });
  }
  /* cuba retangular oca (fundo + 4 paredes), do y0 ao topo y0+h */
  function cubaOca(pref, y0, h, w, p, e, mat) {
    return [
      cxs(pref + "-fundo", "Fundo", "0", y0, "0", w, e, p, mat),
      cxs(pref + "-frente", "Parede frontal", "0", y0, "(" + p + ")/2 - " + e + "/2", w, h, e, mat),
      cxs(pref + "-fundo-p", "Parede de trás", "0", y0, "-(" + p + ")/2 + " + e + "/2", w, h, e, mat),
      cxs(pref + "-esq", "Parede esquerda", "-(" + w + ")/2 + " + e + "/2", y0, "0", e, h, "(" + p + ") - 2*" + e, mat),
      cxs(pref + "-dir", "Parede direita", "(" + w + ")/2 - " + e + "/2", y0, "0", e, h, "(" + p + ") - 2*" + e, mat)
    ];
  }
  var GEO_FAM = {
    "hid-bacia-caixa-acoplada": function () {
      var zc = "-Esgoto_parede + Comprimento/2", zq = "-Esgoto_parede + Prof_caixa/2";
      return [concha(zc, "Altura_borda"), assento(zc, "Altura_borda"),
        cxs("caixa", "Caixa acoplada", "0", "Altura_borda", zq, "Largura*0.92", "Altura_total - Altura_borda - 0.045", "Prof_caixa", LOUCA),
        cxs("tampa-caixa", "Tampa da caixa", "0", "Altura_total - 0.045", "-Esgoto_parede + Prof_caixa/2 + 0.01", "Largura*0.96", "0.03", "Prof_caixa + 0.02", LOUCA),
        cil("botao", "Botão de descarga", "y", "0", "Altura_total - 0.015", zq, "0.022", "0.015", CROMO)];
    },
    "hid-bacia-convencional": function () {
      var zc = "-Esgoto_parede + Comprimento/2";
      return [concha(zc, "Altura_borda"), assento(zc, "Altura_borda")];
    },
    "hid-lavatorio-coluna": function () {
      var alt = "Altura_cuba", y0 = "Altura_borda - Altura_cuba";
      return [rev("cuba", "Lavatório", "0", y0, "0", [["0.38", "0"], ["0.8", alt + "*0.4"], ["1", alt + "*0.82"], ["1", alt], ["0.84", alt], ["0.74", alt + "*0.5"], ["0", alt + "*0.4"]],
          { ex: "Largura/2", ez: "Profundidade/2", mat: LOUCA }),
        cxs("respaldo", "Respaldo", "0", y0, "-Profundidade/2 + 0.015", "Largura*0.9", alt, "0.03", LOUCA),
        rev("coluna", "Coluna", "0", "0", "-Profundidade/2 + Raio_coluna*1.5", [["Raio_coluna*1.5", "0"], ["Raio_coluna*1.5", "0.03"], ["Raio_coluna", "0.12"], ["Raio_coluna*1.1", y0]], { mat: LOUCA })];
    },
    "hid-lavatorio-suspenso": function () {
      var alt = "Altura_cuba", y0 = "Altura_borda - Altura_cuba";
      return [rev("cuba", "Lavatório", "0", y0, "0", [["0.38", "0"], ["0.8", alt + "*0.4"], ["1", alt + "*0.82"], ["1", alt], ["0.84", alt], ["0.74", alt + "*0.5"], ["0", alt + "*0.4"]],
          { ex: "Largura/2", ez: "Profundidade/2", mat: LOUCA }),
        cxs("respaldo", "Respaldo", "0", y0, "-Profundidade/2 + 0.015", "Largura*0.9", alt, "0.03", LOUCA),
        cxs("semicoluna", "Coluna suspensa", "0", "(" + y0 + ")*0.6", "-Profundidade/2 + 0.06", "0.1", "(" + y0 + ")*0.4", "0.12", LOUCA)];
    },
    "hid-cuba-apoio": function () {
      var alt = "Altura_cuba";
      return [rev("cuba", "Cuba", "0", "0", "0", [["0.5", "0"], ["0.85", alt + "*0.3"], ["1", alt + "*0.7"], ["1", alt], ["0.88", alt], ["0.78", alt + "*0.35"], ["0", alt + "*0.28"]],
          { ex: "Largura/2", ez: "Profundidade/2", mat: LOUCA }),
        cil("valvula", "Válvula e sifão", "y", "0", "-Esgoto_abaixo_tampo", "0", "0.02", "Esgoto_abaixo_tampo", CROMO, "Esgoto_abaixo_tampo > 0")];
    },
    "hid-pia-cozinha": function () {
      var wc = "Largura*0.5", pc = "(Profundidade - 0.1)", lado = "(Largura - " + wc + ")/2";
      return [cxs("tampo-frente", "Tampo (frente)", "0", "-0.02", "Profundidade/2 - 0.025", "Largura", "0.02", "0.05"),
        cxs("tampo-tras", "Tampo (fundo)", "0", "-0.02", "-Profundidade/2 + 0.025", "Largura", "0.02", "0.05"),
        cxs("tampo-esq", "Escorredor (esquerda)", "-(Largura + " + wc + ")/4", "-0.02", "0", lado, "0.02", pc),
        cxs("tampo-dir", "Escorredor (direita)", "(Largura + " + wc + ")/4", "-0.02", "0", lado, "0.02", pc)
      ].concat(cubaOca("cuba", "-Altura_cuba", "Altura_cuba", wc, pc, "0.01"));
    },
    "hid-tanque-lavar": function () {
      var y0 = "Altura*0.55", cuba = cubaOca("cuba", y0, "Altura*0.4", "Largura", "Profundidade", "0.025", LOUCA);
      cuba[2] = cxs("cuba-respaldo", "Respaldo", "0", y0, "-Profundidade/2 + 0.0125", "Largura", "Altura*0.45", "0.025", LOUCA);
      return [cxs("coluna", "Coluna", "0", "0", "-Profundidade/2 + Profundidade*0.2", "Largura*0.45", y0, "Profundidade*0.4", LOUCA)].concat(cuba);
    },
    "hid-mictorio": function () {
      return [cxs("placa", "Placa traseira", "0", "0", "-Profundidade/2 + Profundidade*0.15", "Largura", "Altura", "Profundidade*0.3", LOUCA),
        rev("concha", "Concha", "0", "0", "Profundidade*0.1", [["0.45", "0"], ["0.75", "Altura*0.2"], ["1", "Altura*0.5"], ["0.9", "Altura*0.8"], ["0.6", "Altura*0.97"], ["0.3", "Altura"]],
          { ex: "Largura/2*0.92", ez: "Profundidade*0.4", mat: LOUCA })];
    },
    "hid-chuveiro": function () {
      return [cil("haste", "Haste", "y", "0", "0", "0.012", "0.012", "Altura", CROMO),
        cil("braco", "Braço", "z", "0", "Altura - 0.012", "0", "0.012", "Profundidade - Largura/2", CROMO),
        rev("crivo", "Crivo", "0", "Altura - 0.012 - Altura*0.3", "Profundidade - Largura/2", [["1", "0"], ["1", "Altura*0.06"], ["0.35", "Altura*0.3"]], { ex: "Largura/2", ez: "Largura/2", mat: CROMO })];
    },
    "hid-ducha-higienica": function () {
      var yc = "Largura/2";
      return [cil("canopla", "Canopla", "z", "0", yc, "0", "Largura/2 - 0.005", "0.01", CROMO),
        cil("corpo", "Corpo do registro", "z", "0", yc, "0.01", "0.014", "Profundidade*0.6", CROMO),
        cil("volante", "Volante", "y", "0", yc + " + 0.014", "Profundidade*0.4", "0.018", "0.012", CROMO),
        cil("ducha", "Ducha", "y", "0", "0.04", "Profundidade - 0.014", "0.011", "Altura - 0.04", CROMO)];
    },
    "hid-torneira": function () {
      var zc = "Largura/2";
      return [cil("canopla", "Canopla", "y", "0", "0", zc, "Largura*0.4", "0.02", CROMO),
        cil("corpo", "Corpo", "y", "0", "0", zc, "0.015", "Altura*0.85", CROMO),
        cil("bica", "Bica", "z", "0", "Altura*0.85 - 0.012", zc, "0.01", "Profundidade - Largura/2", CROMO),
        cil("arejador", "Arejador", "y", "0", "Altura*0.85 - 0.032", "Profundidade - 0.012", "0.012", "0.02", CROMO),
        cil("volante", "Volante", "y", "0", "Altura*0.85", zc, "Largura/2", "Altura*0.15", CROMO)];
    },
    "hid-misturador": function () {
      var zc = "Largura/2";
      return [cil("canopla-af", "Canopla (fria)", "z", "0.04", "0.03", "0", "0.03", "0.01", CROMO),
        cil("canopla-aq", "Canopla (quente)", "z", "-0.04", "0.03", "0", "0.03", "0.01", CROMO),
        cil("corpo-af", "Registro (frio)", "z", "0.04", "0.03", "0.01", "0.015", "Profundidade*0.4", CROMO),
        cil("corpo-aq", "Registro (quente)", "z", "-0.04", "0.03", "0.01", "0.015", "Profundidade*0.4", CROMO),
        cil("volante-af", "Volante (frio)", "z", "0.04", "0.03", "Profundidade*0.4", "0.025", "0.015", CROMO),
        cil("volante-aq", "Volante (quente)", "z", "-0.04", "0.03", "Profundidade*0.4", "0.025", "0.015", CROMO),
        cil("cruzeta", "Cruzeta", "x", "-0.04", "0.03", "0.012", "0.01", "0.08", CROMO),
        cil("coluna-central", "Coluna central", "y", "0", "0.03", "0.012", "0.012", "Altura - 0.042", CROMO),
        cil("bica", "Bica", "z", "0", "Altura - 0.012", "0", "0.011", "Profundidade", CROMO)];
    }
  };
  /* registros em linha: corpo ao longo do X (conectores nas pontas), castelo e manopla para cima; Altura inclui a manopla */
  function geoRegistro(tipo) {
    return function () {
      var r = "Profundidade/2", topo = "Altura - Profundidade/2";
      var s = [cil("corpo", "Corpo", "x", "-Comprimento/2", "0", "0", r, "Comprimento", CROMO),
        cil("castelo", "Castelo", "y", "0", "0", "0", "Profundidade*0.35", "(" + topo + ")*0.4", CROMO)];
      if (tipo === "esfera") {
        s.push(cil("haste", "Haste", "y", "0", "0", "0", "Profundidade*0.12", "(" + topo + ") - 0.008", CROMO));
        s.push(cxs("alavanca", "Alavanca", "0", "(" + topo + ") - 0.008", "0", "Comprimento*0.8", "0.008", "Profundidade*0.3", "Vermelho"));
      } else {
        s.push(cil("haste", "Haste", "y", "0", "0", "0", "Profundidade*0.12", "(" + topo + ") - 0.012", CROMO));
        s.push(cil("volante", "Volante", "y", "0", "(" + topo + ") - 0.012", "0", tipo === "pressao" ? "Profundidade*0.4" : r, "0.012", tipo === "pressao" ? CROMO : "Vermelho"));
      }
      return s;
    };
  }
  GEO_FAM["hid-registro-gaveta"] = geoRegistro("gaveta");
  GEO_FAM["hid-registro-pressao"] = geoRegistro("pressao");
  GEO_FAM["hid-registro-esfera"] = geoRegistro("esfera");
  GEO_FAM["hid-valvula-descarga"] = function () {
    /* a placa desce o vão da SAÍDA (conector "descarga" a Altura*0.4 abaixo da entrada — D-02, 19/10/2026): os dois tubos ficam
       dentro do volume envolvente (tools/test-hid-geometria.js) */
    return [cxs("placa", "Acabamento na parede", "0", "-Altura*0.4", "0.005", "Largura", "Altura", "0.01", CROMO),
      cil("botao", "Botão", "z", "0", "Altura*0.1", "0.01", "Largura*0.28", "0.015", CROMO),
      cil("tubo", "Tubo de ligação", "z", "0", "0", "0.01", "0.016", "Profundidade - 0.01", CROMO),
      cil("tubo-saida", "Tubo de saída (descarga)", "z", "0", "-Altura*0.4", "0.01", "0.016", "Profundidade - 0.01", CROMO)];
  };
  GEO_FAM["hid-caixa-descarga-embutida"] = function () {
    return [cxs("corpo", "Caixa embutida", "0", "0", "-Espessura*0.075", "Largura", "Altura", "Espessura*0.85", "Branco"),
      cxs("placa", "Placa de acionamento", "0", "Altura*0.55", "Espessura*0.425", "Largura*0.7", "Altura*0.28", "Espessura*0.15", CROMO),
      cil("botao-1", "Botão (descarga menor)", "z", "-Largura*0.12", "Altura*0.69", "Espessura*0.4", "0.02", "Espessura*0.1", "Branco"),
      cil("botao-2", "Botão (descarga maior)", "z", "Largura*0.12", "Altura*0.69", "Espessura*0.4", "0.02", "Espessura*0.1", "Branco")];
  };
  GEO_FAM["hid-caixa-sifonada"] = function () {
    return [cxs("corpo", "Corpo", "0", "-Altura", "0", "Largura", "Altura - 0.008", "Profundidade", "PVC"),
      cxs("grelha", "Porta-grelha", "0", "-0.008", "0", "Largura", "0.008", "Profundidade", INOX),
      cil("grelha-ralo", "Grelha redonda", "y", "0", "-0.008", "0", "min(Largura; Profundidade)*0.36", "0.008", INOX)];
  };
  GEO_FAM["hid-ralo"] = function () {
    return [cil("corpo", "Corpo", "y", "0", "-Altura", "0", "min(Largura; Profundidade)/2*0.92", "Altura - 0.006", "PVC"),
      cil("aro", "Aro", "y", "0", "-0.006", "0", "min(Largura; Profundidade)/2", "0.006", INOX),
      cil("grelha", "Grelha", "y", "0", "-0.002", "0", "min(Largura; Profundidade)/2*0.8", "0.002", "Preto")];
  };
  function geoCaixaCil() {
    return [cil("corpo", "Corpo", "y", "0", "-Altura", "0", "Diametro/2", "Altura - 0.02", "PVC"),
      cil("tampa", "Tampa", "y", "0", "-0.02", "0", "Diametro/2", "0.02", "Cinza claro"),
      cxs("puxador", "Puxador da tampa", "0", "-0.01", "0", "Diametro*0.25", "0.01", "0.012", "Cinza escuro")];
  }
  GEO_FAM["hid-caixa-gordura"] = geoCaixaCil;
  GEO_FAM["hid-caixa-inspecao"] = geoCaixaCil;
  /* reservatórios Fortlev: corpo levemente cônico (base menor), aba da tampa e tampa abaulada; a cisterna e o tanque vão retos */
  function geoReservatorio(cisterna) {
    return function () {
      var R = "Diametro/2", H = "Altura";
      var perfil = cisterna
        ? [["0.97", "0"], ["0.97", H + "*0.9"], ["1", H + "*0.9"], ["1", H + "*0.93"], ["0.9", H + "*0.93"], ["0.3", H + "*0.985"]]
        : [["0.88", "0"], ["0.97", H + "*0.93"], ["1", H + "*0.93"], ["1", H + "*0.96"], ["0.92", H + "*0.96"], ["0.85", H + "*0.985"], ["0.15", H]];
      perfil = perfil.map(function (q) { return [R + "*" + q[0], q[1]]; });
      var s = [rev("corpo", "Reservatório", "0", "0", "0", perfil, { mat: cisterna ? "Concreto" : "Polietileno azul" })];
      if (cisterna) s.push(cil("boca", "Boca de inspeção", "y", "0", H + "*0.985", "0", R + "*0.3", H + "*0.015", "Cinza escuro"));
      s.push(cil("tubo-entrada", "Tubo de entrada", "x", "-" + R, H + "*0.985 - 0.015", "0", "0.015", "0.1", "PVC"));
      s.push(cil("tubo-saida", "Tubo de saída", "x", R + "*0.88", "0.02", "0", "0.02", R + "*0.12", "PVC"));
      return s;
    };
  }
  GEO_FAM["hid-caixa-dagua"] = geoReservatorio(false);
  GEO_FAM["hid-cisterna"] = geoReservatorio(true);
  GEO_FAM["hid-reservatorio-tanque"] = geoReservatorio(false);
  GEO_FAM["hid-bomba"] = function () {
    var yc = "0.03 + Largura/2";
    return [cxs("base", "Base", "0", "0", "0", "Comprimento", "0.03", "Largura", "Cinza escuro"),
      cil("motor", "Motor", "x", "-Comprimento/2 + Comprimento*0.4", yc, "0", "Largura*0.4", "Comprimento*0.5", "Azul"),
      cil("ventilador", "Tampa do ventilador", "x", "-Comprimento/2 + Comprimento*0.9", yc, "0", "Largura*0.34", "Comprimento*0.1", "Preto"),
      cxs("caixa-ligacao", "Caixa de ligação", "-Comprimento/2 + Comprimento*0.65", yc + " + Largura*0.4", "0", "Comprimento*0.14", "Largura*0.12", "Largura*0.2", "Preto"),
      cil("voluta", "Voluta", "x", "-Comprimento/2 + Comprimento*0.18", yc, "0", "Largura/2", "Comprimento*0.22", "Ferro fundido"),
      cil("succao", "Boca de sucção", "x", "-Comprimento/2", yc, "0", "Largura*0.14", "Comprimento*0.18", "Ferro fundido"),
      cil("recalque", "Boca de recalque", "y", "-Comprimento/2 + Comprimento*0.3", yc, "0", "Largura*0.12", "Altura - (" + yc + ")", "Ferro fundido")];
  };
  GEO_FAM["hid-hidrante-abrigo"] = function () {
    var t = "0.04";
    return [cxs("corpo", "Caixa do abrigo", "0", "0", "-0.01", "Largura", "Altura", "Profundidade - 0.02", "Vermelho"),
      cxs("vidro", "Porta de vidro", "0", "Altura*0.06", "Profundidade/2 - 0.005", "Largura - 2*" + t, "Altura - 0.12*Altura", "0.01", VIDRO),
      cxs("moldura-sup", "Moldura (alto)", "0", "Altura - " + t, "Profundidade/2 - 0.01", "Largura", t, "0.02", "Vermelho"),
      cxs("moldura-inf", "Moldura (baixo)", "0", "0", "Profundidade/2 - 0.01", "Largura", t, "0.02", "Vermelho"),
      cxs("moldura-esq", "Moldura (esquerda)", "-Largura/2 + " + t + "/2", "0", "Profundidade/2 - 0.01", t, "Altura", "0.02", "Vermelho"),
      cxs("moldura-dir", "Moldura (direita)", "Largura/2 - " + t + "/2", "0", "Profundidade/2 - 0.01", t, "Altura", "0.02", "Vermelho"),
      cil("rolo", "Mangueira enrolada", "z", "Largura*0.15", "Altura*0.5", "-Profundidade/2 + 0.03", "Altura*0.18", "Profundidade*0.4", "Branco"),
      cil("registro", "Registro", "z", "-Largura*0.25", "Altura*0.35", "-Profundidade/2", "0.03", "Profundidade*0.5", "Latão")];
  };
  GEO_FAM["hid-extintor"] = function () {
    var R = "Diametro/2", H = "Altura";
    return [rev("cilindro", "Cilindro", "0", "0", "0", [[R + "*0.62", "0"], [R, H + "*0.05"], [R, H + "*0.74"], [R + "*0.55", H + "*0.84"], [R + "*0.2", H + "*0.88"]], { mat: "Vermelho" }),
      cil("cabeca", "Cabeça e válvula", "y", "0", H + "*0.88", "0", R + "*0.3", H + "*0.1", "Preto"),
      cxs("alavanca", "Alavanca", "0", H + " - 0.012", "0", "0.03", "0.012", "Diametro*0.9", "Preto"),
      cil("manometro", "Manômetro", "z", "0", H + "*0.9", "0", "0.018", R + "*0.3", CROMO)];
  };
  GEO_FAM["hid-sprinkler"] = function () {
    return [cil("niple", "Rosca", "y", "0", "-Altura*0.3", "0", "0.011", "Altura*0.3", "Latão"),
      cil("corpo", "Corpo", "y", "0", "-Altura*0.65", "0", "0.013", "Altura*0.35", "Latão"),
      cxs("braco-1", "Braço (1)", "Diametro*0.2", "-Altura + 0.003", "0", "0.004", "Altura*0.4", "0.008", "Latão"),
      cxs("braco-2", "Braço (2)", "-Diametro*0.2", "-Altura + 0.003", "0", "0.004", "Altura*0.4", "0.008", "Latão"),
      cil("bulbo", "Ampola", "y", "0", "-Altura*0.9", "0", "0.003", "Altura*0.25", "Vermelho"),
      cil("defletor", "Defletor", "y", "0", "-Altura", "0", "Diametro/2", "0.003", "Latão")];
  };

  /* teto de triângulos por família (ver tools/test-hid-geometria.js, que mede e reprova passando disso) */
  var TETO_TRIANGULOS = 2000;                                                                                       /* hid:ok teto de desenho 3D por família */

  /* geometria de reserva dos metais: cotas do volume envolvente que a forma preenche (a conferir, como antes) */
  function padrao(id, nome, v) { ESPECS.forEach(function (e) { if (e.id === id) e.geo.forEach(function (g) { if (g.nome === nome) g.def = v; }); }); }
  padrao("hid-chuveiro", "Largura", 0.15); padrao("hid-chuveiro", "Altura", 0.35); padrao("hid-chuveiro", "Profundidade", 0.25);  /* hid:ok geometria de reserva: crivo Ø150, braço de parede */
  padrao("hid-ducha-higienica", "Largura", 0.08); padrao("hid-ducha-higienica", "Altura", 0.22); padrao("hid-ducha-higienica", "Profundidade", 0.08);  /* hid:ok geometria de reserva */
  padrao("hid-misturador", "Largura", 0.14); padrao("hid-misturador", "Altura", 0.16); padrao("hid-misturador", "Profundidade", 0.17);  /* hid:ok geometria de reserva: duas manoplas a ±0,04 */
  /* hid:geometria-inicio — ============================================ GEOMETRIA REAL (QUALIDADE VISUAL 3)
   * (17/10/2026: o Rogério reprovou o 3D — "a bacia e o lavatório viraram caixas brancas".) A forma de cada
   * louça, metal e equipamento passa a ser GERADA pelo js/hidlouca.js (loft de seções, torno, tubo varrido,
   * caixa arredondada) a partir das MESMAS cotas do tipo: o sólido { forma: "gerada" } leva o nome do gerador e
   * os parâmetros dele em fórmula. Os CONECTORES não mudam (são da frente de traçado). Detalhe que o catálogo não
   * dá (curva da louça, raio, espessura, posição da torneira) é PROPORÇÃO DE DESENHO RA sobre a cota — aviso
   * AV_FORMA em toda família gerada. Sem o gerador carregado, valem as formas de antes (GEO_FAM) e a caixa `env`.
   * Nenhum objeto, malha ou nome de fabricante: só "bacia com caixa acoplada", "lavatório com coluna"…
   * Os números deste bloco são desenho, nunca valor de norma. */
  var Lou = carregar("HidLouca", "hidlouca.js");
  var AV_FORMA = "Forma 3D desenhada pela RA a partir das cotas do catálogo (curvas, raios, espessuras e a posição de metais/sifão são proporção de desenho, não cota do fabricante): para o objeto oficial, importe a família do fabricante (Biblioteca de famílias › Importar família).";
  /* parâmetro extra da família: liga/desliga (instância) ou lido da DESCRIÇÃO do catálogo (tipo) — não entra no "Conferir" */
  function X(nome, tipoDado, def, grupo, desc, le) { return { nome: nome, tipoDado: tipoDado, def: def, faixa: null, le: le || null, desc: desc, grupo: grupo, semConferir: true }; }
  function DESC(re, sim, nao) { return function (it) { return { v: re.test(txt(it.descricao)) ? sim : nao, origem: "catalogo" }; }; }
  var METAIS = X("Com_metais", "simnao", true, "Instalação", "Desenha os metais, a válvula, o sifão e os engates (desligue quando a torneira/o sifão for outra família)");
  var TAMPA = X("Tampa_aberta", "simnao", true, "Instalação", "Tampa do assento levantada (padrão: sim — a vista de cima mostra a abertura do assento, não um bloco)");
  /* N23 (26/10/2026): os ADAPTADORES COM FLANGE da caixa no DN real (antes Ø 52 mm fixo). Quem grava é o Traçar automaticamente
     (js/hidbarrilete.js); 0 = DN 25 na entrada/saída e a peça não desenhada no extravasor, na limpeza e na 2ª saída. Ângulo em
     radianos a partir da saída (o eixo +X da família); cota em m acima da base. */
  var GA = "Adaptadores (Traçar)";
  var ADAPT_X = [X("Ad_entrada", "numero", 0, GA, "DN do adaptador da entrada (boia), mm"), X("Ad_saida", "numero", 0, GA, "DN do adaptador da saída, mm"),
    X("Ad_saida2", "numero", 0, GA, "DN da 2ª saída (coluna exclusiva da válvula de descarga), mm; 0 = sem"), X("Ang_saida2", "numero", 0, GA, "Ângulo da 2ª saída (rad, a partir da 1ª)"),
    X("Ad_extravasor", "numero", 0, GA, "DN do adaptador do extravasor (ladrão), mm; 0 = sem"), X("Ang_extravasor", "numero", 0, GA, "Ângulo do extravasor (rad, a partir da saída)"), X("Y_extravasor", "numero", 0, GA, "Cota do eixo do extravasor acima da base (m)"),
    X("Ad_limpeza", "numero", 0, GA, "DN do adaptador da limpeza, mm; 0 = sem"), X("Ang_limpeza", "numero", 0, GA, "Ângulo da limpeza (rad, a partir da saída)"), X("Y_limpeza", "numero", 0, GA, "Cota do eixo da limpeza acima da base (m)")];
  ADAPT_X.forEach(function (x) { x.instancia = true; });   /* de cada caixa (o Traçar grava na instância), não do tipo */
  /* cada família → { g: gerador, p: {chave: fórmula}, env: caixa de reserva, x: parâmetros extras } */
  var GERADA = {
    "hid-bacia-caixa-acoplada": { g: "bacia_caixa", p: { L: "Largura", C: "Comprimento", Hb: "Altura_borda", Ht: "Altura_total", Pc: "Prof_caixa", Ep: "Esgoto_parede", Aa: "Agua_altura", Al: "Agua_lateral", aberta: "Tampa_aberta", metais: "Com_metais" },
      env: ["0", "0", "-Esgoto_parede + Comprimento/2", "Largura", "Altura_total", "Comprimento"], x: [METAIS, TAMPA] },
    "hid-bacia-convencional": { g: "bacia_valvula", p: { L: "Largura", C: "Comprimento", Hb: "Altura_borda", Ep: "Esgoto_parede", Aa: "Agua_altura", Al: "Agua_lateral", aberta: "Tampa_aberta", metais: "Com_metais" },
      env: ["0", "0", "-Esgoto_parede + Comprimento/2", "Largura", "Altura_borda", "Comprimento"], x: [METAIS, TAMPA] },
    "hid-lavatorio-coluna": { g: "lavatorio", p: { W: "Largura", P: "Profundidade", Hb: "Altura_borda", Hc: "Altura_cuba", Rc: "Raio_coluna", Aa: "Agua_altura", Ea: "Esgoto_altura", Af: "Agua_afastamento", suspenso: "0", metais: "Com_metais" },
      env: ["0", "0", "0", "Largura", "Altura_borda", "Profundidade"], x: [METAIS] },
    "hid-lavatorio-suspenso": { g: "lavatorio", p: { W: "Largura", P: "Profundidade", Hb: "Altura_borda", Hc: "Altura_cuba", Rc: "0.055", Aa: "Agua_altura", Ea: "Esgoto_altura", Af: "Agua_afastamento", suspenso: "1", metais: "Com_metais" },
      env: ["0", "Altura_borda - Altura_cuba", "0", "Largura", "Altura_cuba", "Profundidade"], x: [METAIS] },
    "hid-cuba-apoio": { g: "cuba", p: { W: "Largura", P: "Profundidade", Hc: "Altura_cuba", Ea: "Esgoto_abaixo_tampo", Dp: "Distancia_parede", modelo: "Modelo_cuba", ret: "Retangular", metais: "Com_metais" },
      env: ["0", "0", "0", "Largura", "Altura_cuba", "Profundidade"],
      x: [METAIS, X("Modelo_cuba", "inteiro", 0, "Forma 3D", "0 = de apoio (sobre o tampo), 1 = de embutir/sobrepor (a cuba que não diz \"de apoio\" nem \"semi-encaixe\" é de embutir), 2 = de semi-encaixe — lido da descrição do catálogo", function (it) { var d = txt(it.descricao); return { v: /APOIO/i.test(d) ? 0 : (/SEMI/i.test(d) ? 2 : 1), origem: "catalogo" }; }),
        X("Retangular", "simnao", false, "Forma 3D", "Cuba retangular/quadrada (lido da descrição do catálogo); não = oval/redonda", DESC(/RETANG|QUADRAD|QR?\s*\d/i, 1, 0))] },
    "hid-pia-cozinha": { g: "pia", p: { L: "Largura", P: "Profundidade", Hc: "Altura_cuba", metais: "Com_metais" }, env: ["0", "-Altura_cuba", "0", "Largura", "Altura_cuba", "Profundidade"], x: [METAIS] },
    "hid-tanque-lavar": { g: "tanque", p: { W: "Largura", P: "Profundidade", H: "Altura", metais: "Com_metais" }, env: ["0", "0", "0", "Largura", "Altura", "Profundidade"], x: [METAIS] },
    "hid-mictorio": { g: "mictorio", p: { W: "Largura", P: "Profundidade", H: "Altura", Ya: "Agua_altura", Ye: "Esgoto_altura", metais: "Com_metais" }, env: ["0", "0", "0", "Largura", "Altura", "Profundidade"], x: [METAIS] },
    "hid-chuveiro": { g: "chuveiro", p: { L: "Largura", H: "Altura", P: "Profundidade", eletrico: "Eletrico" }, env: ["0", "0", "Profundidade/2", "Largura", "Altura", "Profundidade"],
      x: [X("Eletrico", "simnao", false, "Instalação", "Chuveiro elétrico (corpo com resistência) no lugar da ducha metálica")] },
    "hid-ducha-higienica": { g: "ducha_higienica", p: { W: "Largura", H: "Altura", P: "Profundidade" }, env: ["0", "-Altura*0.8", "Profundidade/2", "Largura", "Altura", "Profundidade"], x: [] },
    "hid-torneira": { g: "torneira", p: { W: "Largura", H: "Altura", P: "Profundidade", modelo: "Modelo_torneira" }, env: ["0", "0", "Profundidade/2", "Largura", "Altura", "Profundidade"],
      x: [X("Modelo_torneira", "inteiro", 0, "Forma 3D", "0 = de parede (origem no ponto de água da parede), 1 = de mesa (origem na base, sobre o tampo) — lido da descrição do catálogo", DESC(/MESA/i, 1, 0))] },
    "hid-misturador": { g: "misturador", p: { W: "Largura", H: "Altura", P: "Profundidade", modelo: "Modelo_torneira" }, env: ["0", "0", "Profundidade/2", "Largura", "Altura", "Profundidade"],
      x: [X("Modelo_torneira", "inteiro", 0, "Forma 3D", "0 = de parede, 1 = de mesa — lido da descrição do catálogo", DESC(/MESA/i, 1, 0))] },
    "hid-registro-gaveta": { g: "registro", p: { C: "Comprimento", H: "Altura", P: "Profundidade", tipo: "0", parede: "Na_parede" }, env: ["0", "-Profundidade/2", "Altura/2", "Comprimento", "Profundidade", "Altura"],
      x: [X("Na_parede", "simnao", true, "Instalação", "Embutido na parede: castelo, canopla e volante para fora da parede (+Z); não = volante para cima (barrilete)")] },
    "hid-registro-pressao": { g: "registro", p: { C: "Comprimento", H: "Altura", P: "Profundidade", tipo: "1", parede: "Na_parede" }, env: ["0", "-Profundidade/2", "Altura/2", "Comprimento", "Profundidade", "Altura"],
      x: [X("Na_parede", "simnao", true, "Instalação", "Embutido na parede: castelo, canopla e volante para fora da parede (+Z); não = volante para cima")] },
    "hid-registro-esfera": { g: "registro", p: { C: "Comprimento", H: "Altura", P: "Profundidade", tipo: "2", parede: "Na_parede" }, env: ["0", "-Profundidade/2", "0", "Comprimento", "Altura", "Profundidade"],
      x: [X("Na_parede", "simnao", false, "Instalação", "Alavanca para fora da parede (+Z); não = alavanca para cima")] },
    "hid-valvula-descarga": { g: "valvula_descarga", p: { W: "Largura", H: "Altura", P: "Profundidade" }, env: ["0", "-Altura*0.4", "0", "Largura", "Altura", "Profundidade"], x: [] },   /* a base desce até a saída (conector descarga, D-02) */
    "hid-caixa-descarga-embutida": { g: "caixa_descarga_embutida", p: { W: "Largura", H: "Altura", E: "Espessura" }, env: ["0", "0", "-Espessura/2", "Largura", "Altura", "Espessura"], x: [] },
    "hid-caixa-sifonada": { g: "caixa_sifonada", p: { W: "Largura", P: "Profundidade", H: "Altura" }, env: ["0", "-Altura", "0", "Largura", "Altura", "Profundidade"], x: [] },
    "hid-ralo": { g: "ralo", p: { D: "min(Largura; Profundidade)", H: "Altura", quadrado: "Grelha_quadrada" }, env: ["0", "-Altura", "0", "Largura", "Altura", "Profundidade"],
      x: [X("Grelha_quadrada", "simnao", true, "Forma 3D", "Grelha quadrada (lido da descrição do catálogo: QD/QUADRADO); não = redonda", DESC(/\bQD\b|QUADRAD|\bQ\b/i, 1, 0))] },
    "hid-caixa-gordura": { g: "caixa_cil", p: { D: "Diametro", H: "Altura" }, env: ["0", "-Altura", "0", "Diametro", "Altura", "Diametro"], x: [] },
    "hid-caixa-inspecao": { g: "caixa_cil", p: { D: "Diametro", H: "Altura" }, env: ["0", "-Altura", "0", "Diametro", "Altura", "Diametro"], x: [] },
    "hid-caixa-areia": { g: "caixa_cil", p: { D: "Diametro", H: "Altura" }, env: ["0", "-Altura", "0", "Diametro", "Altura", "Diametro"], x: [] },
    "hid-caixa-dagua": { g: "reservatorio", p: { D: "Diametro", H: "Altura", Hc: "Altura_corpo", Dc: "Diametro_corpo", Db: "Diametro_base", Dt: "0", tipo: "0", aS: "Ad_saida", aE: "Ad_entrada", a2: "Ad_saida2", g2: "Ang_saida2", aX: "Ad_extravasor", gX: "Ang_extravasor", yX: "Y_extravasor", aL: "Ad_limpeza", gL: "Ang_limpeza", yL: "Y_limpeza" }, env: ["0", "0", "0", "Diametro", "Altura", "Diametro"],
      x: ADAPT_X.concat([G("Altura_corpo", 0, [0.2, 4], N("altura_sem_tampa_mm"), "Altura sem a tampa (B da ficha); 0 = proporção do 1000 L"), G("Diametro_corpo", 0, [0.3, 4], N("diametro_sem_tampa_mm"), "Diâmetro sem a tampa (D da ficha); 0 = proporção"),
        G("Diametro_base", 0, [0.3, 4], N("diametro_base_mm"), "Diâmetro da base (E da ficha); 0 = proporção")]) },
    "hid-cisterna": { g: "reservatorio", p: { D: "Diametro", H: "Altura", Hc: "Altura_corpo", Dc: "0", Db: "0", Dt: "Diametro_tampa", tipo: "1" }, env: ["0", "0", "0", "Diametro", "Altura", "Diametro"],
      x: [G("Altura_corpo", 0, [0.2, 4], N("altura_corpo_mm"), "Altura do corpo sem a tampa; 0 = proporção"), G("Diametro_tampa", 0, [0.1, 2], N("diametro_tampa_mm"), "Diâmetro da tampa de inspeção; 0 = proporção")] },
    "hid-reservatorio-tanque": { g: "reservatorio", p: { D: "Diametro", H: "Altura", Hc: "0", Dc: "0", Db: "0", Dt: "Diametro_tampa", tipo: "2", aS: "Ad_saida", aE: "Ad_entrada", a2: "Ad_saida2", g2: "Ang_saida2", aX: "Ad_extravasor", gX: "Ang_extravasor", yX: "Y_extravasor", aL: "Ad_limpeza", gL: "Ang_limpeza", yL: "Y_limpeza" }, env: ["0", "0", "0", "Diametro", "Altura", "Diametro"],
      x: ADAPT_X.concat([G("Diametro_tampa", 0, [0.1, 2], N("diametro_tampa_inspecao_mm"), "Diâmetro da tampa de inspeção; 0 = proporção")]) },
    "hid-bomba": { g: "bomba", p: { C: "Comprimento", W: "Largura", H: "Altura" }, env: ["0", "0", "0", "Comprimento", "Altura", "Largura"], x: [] },
    "hid-base-caixa": { g: "base_caixa", p: { L: "Lado", H: "Altura", sp: "Secao_pilar", bv: "Base_viga", hv: "Altura_viga", bb: "Base_barrote", hb: "Altura_barrote", nb: "N_barrotes", et: "Espessura_tablado", met: "se(Metalica; 1; 0)" },
      env: ["0", "0", "0", "Lado", "Altura", "Lado"], x: [] },
    "hid-aquecedor-gas": { g: "aquecedor", p: { W: "Largura", H: "Altura", P: "Profundidade", ch: "1" }, env: ["0", "0", "Profundidade/2", "Largura", "Altura", "Profundidade"], x: [] },
    /* FRENTE H6: o elétrico de passagem (mesmo corpo, sem gás nem chaminé) e os de ACUMULAÇÃO (boiler elétrico de parede e a gás de piso) */
    "hid-aquecedor-eletrico-passagem": { g: "aquecedor", p: { W: "Largura", H: "Altura", P: "Profundidade", ch: "0" }, env: ["0", "0", "Profundidade/2", "Largura", "Altura", "Profundidade"], x: [] },
    "hid-boiler-eletrico": { g: "boiler", p: { D: "Diametro", H: "se(Horizontal; Diametro; Altura)", Lh: "se(Horizontal; Comprimento; 0)", hz: "se(Horizontal; 1; 0)", gas: "0", vs: "se(Valvula_seguranca; 1; 0)", vh: "Valvula_altura", xa: "se(Horizontal; Comprimento/4; Diametro/4)" },
      env: ["0", "se(Valvula_seguranca; -Valvula_altura; 0)", "Diametro/2", "se(Horizontal; Comprimento; Diametro)", "se(Horizontal; Diametro; Altura) + se(Valvula_seguranca; Valvula_altura; 0)", "Diametro"], x: [] },
    "hid-boiler-gas": { g: "boiler", p: { D: "Diametro", H: "Altura", Lh: "0", hz: "0", gas: "1", vs: "0", vh: "0", xa: "Diametro/4" }, env: ["0", "0", "Diametro/2", "Diametro", "Altura + 0.22", "Diametro"], x: [] }
  };
  /* AQUECEDOR A GÁS DE PASSAGEM (família nova): tipos = os aquecedores de passagem do catálogo. Cotas: as do
     catálogo com nome (altura_mm…) ou as da ficha impressa "Dimensões LxAxP (cm)"; conectores sem cota → a conferir */
  function DIMFICHA(idx, chave) {
    return function (it) {
      var v = it.dim ? it.dim[chave] : null;
      if (typeof v === "number") return { v: mm(v), origem: "catalogo" };
      var fi = it.dados && it.dados.fichaTecnicaComoImpressa, s = "";
      if (fi) Object.keys(fi).forEach(function (k) { if (/Dimens.es\s+LxAxP\s*\(cm\)/i.test(k) && !/embalagem/i.test(k)) s = txt(fi[k]); });
      var m = /([\d.,]+)\s*x\s*([\d.,]+)\s*x\s*([\d.,]+)/i.exec(s);
      return m ? { v: parseFloat(m[idx + 1].replace(",", ".")) / 100, origem: "catalogo" } : null;
    };
  }
  ESPECS.push({
    id: "hid-aquecedor-gas", nome: "Aquecedor a gás de passagem", categoria: "equipamento", sistemas: ["agua_fria", "agua_quente"], tipos: ["aquecedor_gas_passagem"],
    descricao: "Aquecedor de passagem a gás, de parede. Origem = centro da face de baixo, rente à parede; o corpo sobe Altura e sai Profundidade da parede. Coloque a instância na altura de instalação do manual do modelo.",
    avisos: [AV_CONECTOR, "Entrada de água fria à direita e saída de água quente à esquerda de quem olha o aparelho (a ficha de alguns modelos diz isso em texto); a ligação de gás e a chaminé estão desenhadas, sem conector (a rede de gás não é traçada por esta família)."],
    geo: [
      G("Largura", 0.35, [0.2, 0.8], DIMFICHA(0, "largura_mm"), "Largura (catálogo)"),
      G("Altura", 0.6, [0.3, 1.2], DIMFICHA(1, "altura_mm"), "Altura (catálogo)"),
      G("Profundidade", 0.17, [0.08, 0.45], DIMFICHA(2, "profundidade_mm"), "Profundidade (catálogo)"),
      DN("DN_agua", null, "DN das ligações de água")
    ],
    solidos: [],
    conectores: [
      { id: "af", nome: "Entrada de água fria", sistema: "agua_fria", dn: "DN_agua", x: "Largura/4", y: "0", z: "Profundidade*0.45" },
      { id: "aq", nome: "Saída de água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Largura/4", y: "0", z: "Profundidade*0.45" }
    ], material: "Branco" });
  /* FRENTE H6 (21/10/2026): NBR 13103:2020 — o TIPO quanto à exaustão (Anexo A), a POTÊNCIA e o duto viram parâmetros do tipo, lidos da
     ficha. "B23 (exaustão forçada)" (Rinnai) = B23; "Forçada" sem dizer onde está o ventilador (Komeco) = "B22/B23" (as regras dos dois
     são as mesmas: 6.4.2.1, 7.3), INTERPRETADO; tiragem "Natural" com chaminé (Orbis) = B11, INTERPRETADO (a ficha não diz se tem o
     sensor AS/BS do 6.3.2.1). Sem fonte = vazio → pendência no Traçar, nunca um padrão silencioso. */
  function SC(g) { g.semConferir = true; return g; }   /* cota que só vale numa orientação (vertical × horizontal) ou de desenho: não entra no Conferir */
  function XC(nome, tipoDado, def, grupo, desc, le) { var o = X(nome, tipoDado, def, grupo, desc, le); o.semConferir = false; return o; }
  function fichaImp(it, re) { var fi = it.dados && it.dados.fichaTecnicaComoImpressa, s = null; if (fi) Object.keys(fi).forEach(function (k) { if (s == null && re.test(k)) s = txt(fi[k]); }); return s; }
  function TIPOGAS(it) {
    var d = it.dados || {}, t = txt(d.tipoDeExaustao), m = /\b(A[123]?(AS)?|B11(AS|BS)?|B2[23]|C[135])\b/.exec(t.toUpperCase());
    if (m) return { v: m[1], origem: "catalogo" };
    if (/natural/i.test(t)) return { v: "B11", origem: "interpretado" };
    var ex = fichaImp(it, /^Exaust/i) || t;
    if (/for[cç]ad/i.test(ex)) return { v: "B22/B23", origem: "interpretado" };
    return null;
  }
  function POTGAS(it) {
    var d = it.dados || {}, n = typeof d.potenciaNominal_kW === "number" ? d.potenciaNominal_kW : null;
    if (n == null && (typeof d.potenciaNominal_kW_GLP === "number" || typeof d.potenciaNominal_kW_GN === "number")) n = Math.max(typeof d.potenciaNominal_kW_GLP === "number" ? d.potenciaNominal_kW_GLP : 0, typeof d.potenciaNominal_kW_GN === "number" ? d.potenciaNominal_kW_GN : 0);   /* a maior dos dois gases (lado seguro) */
    if (n == null) { var s = fichaImp(it, /^Pot[eê]ncia nominal/i), m = s ? /\(([\d.,]+)\s*kW\)/i.exec(s) : null; if (m) n = parseFloat(m[1].replace(",", ".")); }
    return n != null && n > 0 ? { v: n, origem: "catalogo" } : null;
  }
  function CHAMGAS(it) {
    var d = it.dados || {}, n = typeof d.diametroChamine_mm === "number" ? d.diametroChamine_mm : null;
    if (n == null) { var s = fichaImp(it, /^Di[aâ]metro da chamin/i); if (s && isFinite(parseFloat(s))) n = parseFloat(s); }
    return n != null && n > 0 ? { v: n, origem: "catalogo" } : null;
  }
  function DADONUM(chave) { return function (it) { var v = (it.dados || {})[chave]; return typeof v === "number" ? { v: v, origem: "catalogo" } : null; }; }
  function DADOTXT(chave) { return function (it) { var v = (it.dados || {})[chave]; return v != null && txt(v) ? { v: txt(v), origem: "catalogo" } : null; }; }
  var PARAM_GAS = [
    XC("Tipo_NBR13103", "texto", "", GRUPO, "Tipo do aparelho a gás quanto à exaustão (ABNT NBR 13103:2020, Anexo A): A1/A2/A3 (AS = sensor), B11/B11AS/B11BS, B22, B23, C1/C3/C5. Vazio = a ficha não diz (pendência)", TIPOGAS),
    XC("Potencia_kW", "numero", 0, GRUPO, "Potência nominal do aparelho a gás (kW), da ficha; 0 = a ficha não dá (pendência)", POTGAS),
    X("Chamine_diametro_mm", "numero", 0, GRUPO, "Diâmetro do duto de exaustão da ficha (mm); 0 = a ficha não dá → NBR 13103, Anexo E, Método 2", CHAMGAS),
    X("Chamine_saida", "texto", "fachada", "Instalação", "Por onde sai o duto de exaustão: fachada (pela parede atrás do aparelho) ou cobertura (B11 acima de 24,4 kW: NBR 13103:2020 7.2.1)")
  ];
  ESPECS.forEach(function (e) { if (e.id === "hid-aquecedor-gas") PARAM_GAS.forEach(function (g) { e.geo.push(g); }); });
  /* N23 (23/10/2026, orçamento 100 %): a peça SEM composição SINAPI do produto (o chuveiro/ducha metálico — a SINAPI só tem o elétrico
     de plástico) entra no Orçamento do modelo pela referência de PREÇO da ficha (js/hidpecas.js, estimativa com a fonte), marcada
     PROVISÓRIA — antes ficava "pendente" e o chuveiro saía do orçamento. O "Equipar ambiente" grava estes campos na instância */
  var PRECO_INST = [X("Preco_unitario", "numero", 0, "Instalação", "Preço da peça (R$) quando não há composição SINAPI do produto: a referência da ficha"),
    X("Fonte_preco", "texto", "", "Instalação", "Fonte do preço (base, código, data)"), X("Peca_catalogo", "texto", "", "Instalação", "Identificação da referência de preço"),
    X("Preco_provisorio", "simnao", false, "Instalação", "Preço provisório (cotar com o fornecedor)"), X("Motivo_preco", "texto", "", "Instalação", "Por que o preço é provisório"), X("Data_preco", "texto", "", "Instalação", "Data-base do preço")];
  ESPECS.forEach(function (e) { if (e.id === "hid-chuveiro") PRECO_INST.forEach(function (g) { if (!e.geo.some(function (x) { return x.nome === g.nome; })) e.geo.push(JSON.parse(JSON.stringify(g))); }); });
  /* AQUECEDOR ELÉTRICO DE PASSAGEM (central, vários pontos): Cardal Aquecedor Central (manual IM-588/R.01). Origem e conectores como o
     de passagem a gás (centro da face de baixo, rente à parede; entradas embaixo — a ficha cota o corpo, não a posição das roscas) */
  ESPECS.push({
    id: "hid-aquecedor-eletrico-passagem", nome: "Aquecedor elétrico de passagem", categoria: "equipamento", sistemas: ["agua_fria", "agua_quente"], tipos: ["aquecedor_eletrico_passagem"],
    descricao: "Aquecedor elétrico de passagem de parede (central, atende vários pontos). Origem = centro da face de baixo, rente à parede; o corpo sobe Altura e sai Profundidade da parede.",
    avisos: [AV_CONECTOR, "Entrada de água fria e saída de água quente com rosca macho 1/2\" BSP (ficha); a posição exata das roscas na face de baixo não é cotada. O circuito exclusivo (disjuntor e fio da ficha) é do projeto elétrico: o Traçar lança o ponto de força como pendência."],
    geo: [
      G("Largura", 0.154, [0.08, 0.6], DIMFICHA(0, "largura_mm"), "Largura (catálogo)"),
      G("Altura", 0.205, [0.1, 0.9], DIMFICHA(1, "altura_mm"), "Altura (catálogo)"),
      G("Profundidade", 0.112, [0.05, 0.4], DIMFICHA(2, "profundidade_mm"), "Profundidade (catálogo)"),
      DN("DN_agua", null, "DN das ligações de água"),
      XC("Potencia_W", "numero", 0, GRUPO, "Potência elétrica (W) da ficha", DADONUM("potencia_W")),
      X("Tensao_V", "texto", "", GRUPO, "Tensão (ficha)", DADOTXT("tensao_V")),
      X("Disjuntor_A", "numero", 0, GRUPO, "Disjuntor indicado pelo fabricante (A); 0 = a ficha não dá", DADONUM("disjuntor_A")),
      X("Bitola_mm2", "numero", 0, GRUPO, "Seção mínima do fio indicada pelo fabricante (mm²); 0 = a ficha não dá", DADONUM("bitolaFio_mm2"))
    ],
    solidos: [],
    conectores: [
      { id: "af", nome: "Entrada de água fria", sistema: "agua_fria", dn: "DN_agua", x: "Largura/4", y: "0", z: "Profundidade*0.45" },
      { id: "aq", nome: "Saída de água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Largura/4", y: "0", z: "Profundidade*0.45" }
    ], material: "Branco" });
  /* AQUECEDOR ELÉTRICO DE ACUMULAÇÃO (boiler de parede, vertical ou horizontal): Cumulus (manual rev. out/2004) e Albacete (manual
     08/07/2021). A VÁLVULA DE SEGURANÇA de pressão faz parte do conjunto: o manual Cumulus (p.8) manda instalá-la na ENTRADA DE ÁGUA
     FRIA, entre o registro de gaveta e o aquecedor, nunca na saída de água quente; o Albacete (p.4): "na entrada de água fria". A
     entrada de água fria da família é a ponta de baixo da válvula (o Traçar liga ali; o registro fica a montante). O RESPIRO (Cumulus
     p.3/9/10: no ponto mais alto da água quente, 0,80 m acima do nível máximo da caixa d'água, em instalação de baixa pressão) não é
     modelado: o Traçar o declara como pendência com o valor. */
  ESPECS.push({
    id: "hid-boiler-eletrico", nome: "Aquecedor elétrico de acumulação (boiler)", categoria: "equipamento", sistemas: ["agua_fria", "agua_quente"], tipos: ["aquecedor_eletrico_acumulacao"],
    descricao: "Boiler elétrico de parede (cilindro vertical ou horizontal). Origem = centro da face de baixo, rente à parede; o corpo sai Diametro da parede. Válvula de segurança na entrada de água fria (manual do fabricante).",
    avisos: [AV_CONECTOR, "Conexões de água na face de baixo (posição não cotada na ficha). Válvula de segurança na entrada de água fria (manual Cumulus p.8; Albacete p.4). Respiro em instalação de baixa pressão: pendência do Traçar."],
    geo: [
      G("Diametro", 0.46, [0.25, 0.9], N("diametro_mm"), "Diâmetro do corpo (catálogo)"),
      SC(G("Altura", 0.96, [0.3, 2.5], N("altura_mm"), "Altura total do vertical (catálogo; no horizontal não é usada)")),
      SC(G("Comprimento", 0.94, [0.3, 2.5], N("largura_mm"), "Comprimento do horizontal (catálogo; no vertical não é usado)")),
      DN("DN_agua", null, "DN das ligações de água"),
      X("Horizontal", "simnao", false, GRUPO, "Boiler horizontal (lido do modelo do catálogo)", function (it) { return { v: !!it.horizontal || /horizontal/i.test(txt(it.codigo)), origem: "catalogo" }; }),
      XC("Potencia_W", "numero", 0, GRUPO, "Potência da resistência (W) da ficha; 0 = a ficha não dá", DADONUM("potencia_W")),
      X("Tensao_V", "texto", "", GRUPO, "Tensão (ficha)", DADOTXT("tensao_V")),
      X("Valvula_seguranca", "simnao", true, "Instalação", "Válvula de segurança de pressão na entrada de água fria (manual do fabricante: entre o registro e o aquecedor)"),
      SC(I("Valvula_altura", 0.12, null, "Altura da válvula de segurança abaixo do corpo (desenho: o conector de água fria é a ponta de baixo dela)"))
    ],
    extraDados: [["Volume_L", "volume_L", "Volume nominal (L)"]],
    solidos: [],
    conectores: [
      { id: "af", nome: "Entrada de água fria (ponta da válvula de segurança)", sistema: "agua_fria", dn: "DN_agua", x: "se(Horizontal; Comprimento/4; Diametro/4)", y: "se(Valvula_seguranca; -Valvula_altura; 0)", z: "Diametro/2" },
      { id: "aq", nome: "Saída de água quente", sistema: "agua_quente", dn: "DN_agua", x: "-se(Horizontal; Comprimento/4; Diametro/4)", y: "0", z: "Diametro/2" }
    ], material: "Branco" });
  /* AQUECEDOR A GÁS DE ACUMULAÇÃO (boiler de piso): Orbis (ficha HTML do site oficial; o manual só sai com cadastro — não baixado).
     A ficha não cota as conexões: água fria e água quente no TOPO (o padrão do tipo; a conferir), chaminé no centro do topo. A válvula
     de segurança para alívio de pressão é do próprio produto ("Válvula de segurança para alívio de pressão", ficha). */
  ESPECS.push({
    id: "hid-boiler-gas", nome: "Aquecedor a gás de acumulação (boiler)", categoria: "equipamento", sistemas: ["agua_fria", "agua_quente"], tipos: ["aquecedor_gas_acumulacao"],
    descricao: "Boiler a gás de piso (cilindro vertical, chaminé no topo). Origem = centro da base no piso, rente à parede.",
    avisos: [AV_CONECTOR, "Conexões de água no topo (a ficha do fabricante não as cota: posição a conferir). Válvula de segurança de alívio de pressão: do produto (ficha). Ficha: 'local permanentemente ventilado' — a ventilação e o duto de exaustão são conferidos pela NBR 13103 no Traçar."],
    geo: [
      G("Diametro", 0.45, [0.3, 0.9], N("diametro_mm"), "Diâmetro (catálogo)"),
      G("Altura", 1.5, [0.6, 2.4], N("altura_mm"), "Altura (catálogo)"),
      DN("DN_agua", null, "DN das ligações de água")
    ].concat(PARAM_GAS),
    extraDados: [["Volume_L", "volume_L", "Volume nominal (L)"]],
    solidos: [],
    conectores: [
      { id: "af", nome: "Entrada de água fria", sistema: "agua_fria", dn: "DN_agua", x: "Diametro/4", y: "Altura", z: "Diametro/2" },
      { id: "aq", nome: "Saída de água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Diametro/4", y: "Altura", z: "Diametro/2" }
    ], material: "Branco" });
  /* registros embutidos: a canopla (Ø) e o castelo com o volante são o volume envolvente de reserva */
  /* reservas pelas FICHAS COTADAS (QV3, rodada final): acabamento DocolBase (canopla Ø 58, projeção 64,9 da parede + 50 de
     embutimento), torneira de mesa Docol Trio (Ø 47,3 × 83 × 154), motobomba Dancor CAM-W4C ½ cv (266 × 156 × 202 = D 170
     + os 32 mm a mais do eixo pela fórmula do conector) — continuam "a conferir" no tipo */
  padrao("hid-registro-gaveta", "Altura", 0.115); padrao("hid-registro-gaveta", "Profundidade", 0.058);
  padrao("hid-registro-pressao", "Altura", 0.115); padrao("hid-registro-pressao", "Profundidade", 0.058);
  padrao("hid-bomba", "Comprimento", 0.266); padrao("hid-bomba", "Largura", 0.156); padrao("hid-bomba", "Altura", 0.202);
  padrao("hid-chuveiro", "Altura", 0.2); padrao("hid-chuveiro", "Profundidade", 0.38);
  padrao("hid-torneira", "Largura", 0.047); padrao("hid-torneira", "Altura", 0.083); padrao("hid-torneira", "Profundidade", 0.154);
  padrao("hid-misturador", "Altura", 0.2); padrao("hid-misturador", "Profundidade", 0.16);
  function solidoGerado(e, d) {
    return { id: "forma", nome: e.nome, forma: "gerada", gerador: d.g, x: "0", y: "0", z: "0", p: JSON.parse(JSON.stringify(d.p)), material: "Material",
      env: { x: d.env[0], y: d.env[1], z: d.env[2], dx: d.env[3], dy: d.env[4], dz: d.env[5] } };
  }
  function leitor(famId, nome, le, faixa, desc) { ESPECS.forEach(function (e) { if (e.id === famId) e.geo.forEach(function (g) { if (g.nome === nome) { g.le = le; g.faixa = faixa; if (desc) g.desc = desc; } }); }); }
  leitor("hid-bacia-caixa-acoplada", "Prof_caixa", L("L"), [0.1, 0.26], "Profundidade da caixa acoplada (letra L do desenho: Celite pág. 19/32)");
  leitor("hid-mictorio", "Largura", L("B"), [0.2, 0.6], "Largura (letra B: no desenho da pág. 52 o B é a largura, o A a profundidade)");
  leitor("hid-mictorio", "Profundidade", L("A"), [0.2, 0.6], "Profundidade (letra A do desenho, pág. 52)");
  ESPECS.forEach(function (e) {
    var d = Lou && GERADA[e.id];
    if (d && Lou.existe(d.g)) {
      d.x.forEach(function (p) { if (!e.geo.some(function (g) { return g.nome === p.nome; })) e.geo.push(p); });
      e.solidos = [solidoGerado(e, d)];
      if (e.avisos.indexOf(AV_FORMA) < 0) e.avisos.push(AV_FORMA);
    } else if (GEO_FAM[e.id]) e.solidos = GEO_FAM[e.id]();
  });
  /* REVISÃO H5 (21/10/2026, modelar como se executa): a DUCHA (não elétrica) tem o REGISTRO DO MISTURADOR de água quente na parede,
     no ponto de AQ (altura RP, ao lado do braço) — a canopla e o volante do acabamento DocolBase (Docol, catálogo geral pág. 44: canopla
     Ø 58 × 40 mm, volante Ø 57 × 25 mm; as mesmas cotas do registro do traçado, js/biminstgeo.js), saindo da face da parede. Assim a
     caixa envolvente da família inclui o conector de AQ (test-hid-geometria). O chuveiro ELÉTRICO não tem (visivel = 1 − Eletrico) */
  ESPECS.forEach(function (e) {
    if (e.id !== "hid-chuveiro") return;
    e.solidos = e.solidos.concat([
      { id: "misturador-aq-canopla", nome: "Registro do misturador (água quente): canopla", forma: "cilindro", eixo: "z", x: "-Misturador_afastamento", y: "-Misturador_desnivel", z: "0", raio: "Canopla_diametro/2", altura: "Canopla_altura", visivel: "1 - Eletrico", naParede: true, material: "Material" },
      { id: "misturador-aq-volante", nome: "Registro do misturador (água quente): volante", forma: "cilindro", eixo: "z", x: "-Misturador_afastamento", y: "-Misturador_desnivel", z: "Canopla_altura", raio: "Volante_diametro/2", altura: "Volante_altura", visivel: "1 - Eletrico", naParede: true, material: "Material" }]);
    e.geo.push(
      I("Canopla_diametro", 0.058, null, "Diâmetro da canopla do registro do misturador (DocolBase, Docol catálogo geral p.44: Ø 58 mm)"),
      I("Canopla_altura", 0.04, null, "Altura da canopla do registro do misturador (DocolBase, Docol catálogo geral p.44: 40 mm)"),
      I("Volante_diametro", 0.057, null, "Diâmetro do volante do registro do misturador (DocolBase, Docol catálogo geral p.44: Ø 57 mm)"),
      I("Volante_altura", 0.025, null, "Altura do volante do registro do misturador (DocolBase, Docol catálogo geral p.44: 25 mm)"));
  });
  /* FRENTE H7 (21/10/2026): a CUBA DE BANCADA recebe água — a torneira (de mesa ou de parede) e o ponto na parede atrás da cuba.
     A origem da família é a face do tampo, no eixo da cuba: a parede fica a Distancia_parede atrás (o Traçar automaticamente mede a
     parede de verdade e acerta este valor; o padrão é a bancada de 0,55 m do js/marmoraria.js com a cuba centrada). O ENGATE flexível
     sai do ponto da parede e chega sob a torneira: além de ser a peça da obra, põe a face de trás do corpo na parede (o ponto vira
     ponto de PAREDE no js/biminst.js e o traçado chega por dentro dela). Alturas: Deca p.116 (cotas do desenho 220/200 — a leitura do
     js/marmoraria.js REGRA: água 220 mm abaixo do tampo, 200 mm entre os pontos; metais de parede 170 a 220 mm acima — adotado 220). */
  var MMR = (function () { var M = carregar("Marmoraria", "marmoraria.js"); return (M && M.REGRA) || {}; })();
  ESPECS.forEach(function (e) {
    if (e.id !== "hid-cuba-apoio") return;
    var yA = "se(Torneira_de_parede; Agua_acima_tampo; -Agua_abaixo_tampo)", vis = "Distancia_parede > Profundidade/2";
    e.solidos = e.solidos.concat([
      { id: "engate-af", nome: "Engate flexível da água fria (do ponto na parede à torneira)", forma: "cilindro", eixo: "z", x: "Agua_afastamento/2", y: yA, z: "-Distancia_parede", raio: "Engate_diametro/2", altura: "max(0.01; Distancia_parede - Profundidade/2)", material: "Metal cromado", visivel: vis, naParede: true },
      { id: "engate-aq", nome: "Engate flexível da água quente (do ponto na parede ao misturador)", forma: "cilindro", eixo: "z", x: "-Agua_afastamento/2", y: yA, z: "-Distancia_parede", raio: "Engate_diametro/2", altura: "max(0.01; Distancia_parede - Profundidade/2)", material: "Metal cromado", visivel: "Agua_quente e (" + vis + ")", naParede: true }]);
    e.geo.push(
      X("Torneira_de_parede", "simnao", false, "Instalação", "Torneira de PAREDE (o ponto de água sobe para 220 mm acima do tampo, Deca p.116); desligado = torneira de MESA (ponto 220 mm abaixo do tampo)"),
      X("Agua_quente", "simnao", false, "Instalação", "Misturador (água fria + quente): dois pontos a ±Agua_afastamento/2 do eixo; desligado = torneira só de água fria (um ponto, a Agua_afastamento/2 do eixo: o esgoto da cuba entra na parede no eixo e a água não cruza com ele — critério RA R-C3, N23 26/10/2026)"),
      I("Distancia_parede", 0.275, null, "Do eixo da cuba à face da parede atrás dela (m). Padrão = a bancada de 0,55 m com a cuba centrada (js/marmoraria.js); o Traçar automaticamente mede a parede e acerta"),
      I("Agua_abaixo_tampo", num0(MMR.aguaAbaixoTampo) || 0.22, null, "Ponto de água da torneira de MESA abaixo da face do tampo — Deca p.116 (220 mm)"),
      I("Agua_acima_tampo", num0(MMR.metalParedeAcimaTampo) || 0.22, null, "Ponto de água da torneira de PAREDE acima da face do tampo — Deca p.116 (170 a 220 mm; adotado 220)"),
      I("Agua_afastamento", num0(MMR.entrePontosAgua) || 0.2, null, "Afastamento entre os pontos de água fria e quente do misturador — Deca p.116 (200 mm)"),
      I("Engate_diametro", 0.016, null, "Diâmetro do engate flexível desenhado (geometria de desenho)"),
      DN("DN_agua", null, "DN da água"));
  });
  function num0(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }
  /* hid:geometria-fim */

  /* -------------------------------------------------- PARÂMETROS COMUNS */
  function P(nome, tipoDado, valor, descricao) { return { nome: nome, tipoDado: tipoDado, escopo: "tipo", valor: valor, grupo: GRUPO, descricao: descricao }; }
  var COMUNS = [
    P("Fabricante", "texto", "", "Fabricante do produto"), P("Linha", "texto", "", "Linha/ficha do catálogo"), P("Codigo", "texto", "", "Código do fabricante (não é código SINAPI)"),
    P("Descricao_ficha", "texto", "", "Descrição como impressa no catálogo"), P("Link_ficha", "texto", "", "Endereço da ficha/catálogo do fabricante"),
    P("Arquivo_ficha", "texto", "", "Nome do PDF guardado na biblioteca técnica"), P("Edicao_ficha", "texto", "", "Edição/revisão da ficha"),
    P("Pagina_ficha", "inteiro", 0, "Página do PDF onde o produto aparece (0 = família genérica, sem ficha)"), P("Pagina_cotas", "inteiro", 0, "Página do PDF com a tabela de cotas (0 = não há)"),
    P("Vazao_L_min", "numero", 0, "Vazão do catálogo em L/min (0 = o catálogo não informa; vazão de projeto vem do motor de norma)"),
    P("Pressao_min_kPa", "numero", 0, "Pressão mínima de operação do catálogo (kPa; 0 = não informa)"), P("Pressao_max_kPa", "numero", 0, "Pressão máxima de operação do catálogo (kPa; 0 = não informa)"),
    P("Pressao_texto", "texto", "", "Pressão como impressa no catálogo"), P("Cotas_ficha", "texto", "", "Cotas brutas da ficha em mm (letras do desenho)"),
    P("A_conferir", "simnao", true, "Sim = há cota/posição/DN que o catálogo não dá ou que é leitura de letra do desenho"),
    P("Conferir", "texto", "", "Lista do que conferir neste tipo (ver também HidFamilias.avisosDoTipo)"),
    P("Sistemas_RA", "texto", "", "Sistemas dos conectores (biminst)")
  ];

  /* ----------------------------------------------------------- MONTAGEM */
  var PROBLEMAS = [];
  function nomeLimpo(it) {
    var segs = txt(it.descricao).split("|").map(function (s) { return s.trim(); }), bons;
    if (it.fabricante === "Celite") {
      bons = segs.filter(function (s) { return s && !/[a-z]{3}/.test(s); }); /* hid:ok tamanho de palavra */
      if (bons.length) return bons.join(" ").replace(/\s+/g, " ").slice(0, 80);                                       /* hid:ok corte de texto */
    }
    return txt(it.descricao).replace(/\s*\|\s*/g, " · ").replace(/\s+/g, " ").slice(0, 80);                         /* hid:ok corte de texto */
  }
  var VAZIO = { dim: {}, dimTexto: {}, dados: {}, conectores: [], descricao: "", dn: null };
  /* lê o parâmetro do item; item null = valor PADRÃO DA FAMÍLIA (só regras de instalação do Deca respondem) */
  function lerParam(p, it, fam, tipoNome) {
    var r = p.le ? p.le(it || VAZIO) : null;
    if (it && r && p.faixa && (r.v < p.faixa[0] || r.v > p.faixa[1])) {
      PROBLEMAS.push({ familia: fam, tipo: tipoNome, param: p.nome, letra: r.letra || "", valorMm: r.bruto != null ? r.bruto : Math.round(r.v * 1000),    /* hid:ok m → mm */
        motivo: "cota fora da faixa plausível — leitura da letra descartada, usado o padrão (tabela provavelmente de outro produto)" });
      return { rejeitado: true, v: null, origem: "padrao" };
    }
    return r;
  }
  function cotasTexto(it) {
    var o = [];
    Object.keys(it.dim).forEach(function (k) { o.push(k + "=" + it.dim[k]); });
    Object.keys(it.dimTexto).forEach(function (k) { o.push(k + "=" + it.dimTexto[k]); });
    return o.join("; ");
  }
  function sistemasTxt(e) { return e.sistemas.join(","); }

  function parametrosDe(e) {
    var ps = [], seen = {};
    COMUNS.forEach(function (c) { ps.push(JSON.parse(JSON.stringify(c))); });
    ps.forEach(function (p) { if (p.nome === "Sistemas_RA") p.valor = sistemasTxt(e); });
    e.geo.forEach(function (g) {
      var def = g.def, r = g.le ? lerParam(g, null, e.id, "") : null;
      if (r && r.v != null && (g.grupo === "Instalação" || g.ehDN)) def = r.v;               /* padrão da família = valor da regra de instalação do catálogo */
      if (seen[g.nome]) return; seen[g.nome] = 1;
      ps.push({ nome: g.nome, tipoDado: g.tipoDado, escopo: g.grupo === "Instalação" || g.instancia ? "instancia" : "tipo", valor: def, grupo: g.grupo, descricao: g.desc });
      if (g.semConferir && g.grupo === "Dimensões") ps[ps.length - 1].soNumaOrientacao = true;   /* FRENTE H6: a cota do boiler que só vale no vertical (Altura) ou no horizontal (Comprimento) — o tipo da outra orientação não a tem */
    });
    arr(e.extraDados).forEach(function (x) { ps.push({ nome: x[0], tipoDado: "numero", escopo: "tipo", valor: 0, grupo: GRUPO, descricao: x[2] + " (0 = o catálogo não informa)" }); });
    ps.push({ nome: "Material", tipoDado: "material", escopo: "tipo", valor: e.material || "", grupo: "Materiais", descricao: "Material de aparência" });
    return ps;
  }

  function montarTipo(e, it) {
    var valores = {}, conferir = [], avisos = [], nome = it.fabricante + " " + it.codigo + " — " + nomeLimpo(it);
    var f = Cat.fonte(it);
    valores.Fabricante = it.fabricante; valores.Linha = it.linha; valores.Codigo = it.codigo; valores.Descricao_ficha = txt(it.descricao).replace(/\s*\|\s*/g, " | ");
    valores.Link_ficha = it.fonte.url; valores.Arquivo_ficha = it.fonte.arquivo; valores.Edicao_ficha = it.fonte.edicao;
    valores.Pagina_ficha = it.fonte.pagina; valores.Pagina_cotas = it.fonte.paginaDim || 0;
    valores.Vazao_L_min = it.vazao_L_min != null ? it.vazao_L_min : 0;
    valores.Pressao_min_kPa = it.pressaoMin_kPa != null ? it.pressaoMin_kPa : 0; valores.Pressao_max_kPa = it.pressaoMax_kPa != null ? it.pressaoMax_kPa : 0;
    valores.Pressao_texto = it.pressaoTexto; valores.Cotas_ficha = cotasTexto(it);
    e.geo.forEach(function (g) {
      var r = g.le ? lerParam(g, it, e.id, nome) : null;
      if (r && r.rejeitado) { conferir.push(g.nome + " (letra " + (PROBLEMAS[PROBLEMAS.length - 1].letra) + " = " + PROBLEMAS[PROBLEMAS.length - 1].valorMm + " mm descartada: fora da faixa plausível)"); avisos.push("Cota " + g.nome + ": a letra da ficha trouxe valor fora da faixa plausível; usado o padrão."); return; }
      if (r && r.v != null) {
        valores[g.nome] = g.ehDN || typeof r.v !== "number" ? r.v : r4(r.v);   /* FRENTE H6: texto (o tipo da NBR 13103) não passa pelo arredondamento */
        if (r.origem !== "catalogo") conferir.push(g.nome + (g.ehDN ? " (DN vindo de regra/interpretação)" : r.letra ? " (letra " + r.letra + ")" : (r.origem === "interpretado" ? " (interpretado da ficha: " + r.v + ")" : " (regra de instalação Deca)")));
      } else if (!g.semConferir) conferir.push(g.nome + (g.ehDN ? " (DN: o dimensionamento define)" : " (padrão de reserva)"));   /* semConferir: liga/desliga de desenho (QUALIDADE VISUAL 3) */
    });
    arr(e.extraDados).forEach(function (x) { var v = it.dados[x[1]]; if (typeof v === "number") valores[x[0]] = v; });
    if (it.fabricante === "Amanco Wavin" && it.tipo === "caixa_sifonada" && typeof it.dim.A === "number") { /* A = altura nominal confirmada pela ficha; já vem do nome */ }
    if (txt(it.dados.bitolaCatalogo)) valores.Cotas_ficha = (valores.Cotas_ficha ? valores.Cotas_ficha + "; " : "") + "bitola_catalogo=" + it.dados.bitolaCatalogo;
    if (it.dimLetras) avisos.push(AV_LETRAS);
    avisos = avisos.concat(e.avisos);
    valores.Conferir = conferir.join("; ");
    valores.A_conferir = conferir.length > 0;
    return { id: "t-" + it.id, nome: nome, valores: valores, fonte: f.texto, avisos: avisos, conferir: conferir };
  }

  function montarGenerico(e) {
    var conferir = e.geo.filter(function (g) { return !g.semConferir; }).map(function (g) { return g.nome + (g.ehDN ? " (DN: o dimensionamento define)" : " (padrão de reserva)"); });
    return { id: "t-generico", nome: "Genérico (sem produto no catálogo) — a conferir",
      valores: { Fabricante: "(sem produto no catálogo)", Conferir: conferir.join("; "), A_conferir: true }, fonte: "", avisos: e.avisos.slice(), conferir: conferir };
  }

  function construir(e) {
    var fam = {
      id: e.id, nome: e.nome, categoria: e.categoria, hospedagem: "livre", pset: PSET, origem: "HidCatalogo", aparelhoPrograma: APARELHO[e.id] || null,
      descricao: e.descricao + " [Gerada do catálogo — não editar à mão; regerar por HidFamilias.]",
      avisos: e.avisos.slice(), sistemas: e.sistemas.slice(),
      parametros: parametrosDe(e), tipos: [], solidos: JSON.parse(JSON.stringify(e.solidos)), conectores: JSON.parse(JSON.stringify(e.conectores)),
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: e.nome }
    };
    if (e.servicos) { fam.servicos = JSON.parse(JSON.stringify(e.servicos)); fam.quantitativo.porServicos = true; }   /* N23: os serviços medidos (a base da caixa d'água) — o orçamento é por eles (js/orcmodelo.js) */
    if (e.generico) fam.tipos.push(montarGenerico(e));
    else {
      var its = [];
      e.tipos.forEach(function (t) { Cat.porTipo(t).forEach(function (x) { its.push(x); }); });
      its.forEach(function (x) { fam.tipos.push(montarTipo(e, x)); });
    }
    return fam;
  }

  /* nome do aparelho no programa de necessidades (HidPrograma): bacia com caixa E bacia com válvula são "bacia".
     null = peça de rede/acessório, não conta como aparelho. Quem mapeia família → chave do HidNormas lê este campo. */
  var APARELHO = { "hid-bacia-caixa-acoplada": "bacia", "hid-bacia-convencional": "bacia", "hid-lavatorio-coluna": "lavatorio", "hid-lavatorio-suspenso": "lavatorio",
    "hid-cuba-apoio": "lavatorio", "hid-pia-cozinha": "pia", "hid-tanque-lavar": "tanque", "hid-mictorio": "mictorio", "hid-chuveiro": "chuveiro",
    "hid-ducha-higienica": "ducha_higienica", "hid-torneira": null, "hid-misturador": null };
  var CACHE = null;
  function todas() {
    if (CACHE) return CACHE;
    if (!Cat) throw new Error("hidfamilias: js/hidcatalogo.js não carregou");
    PROBLEMAS = [];
    CACHE = ESPECS.map(construir);
    /* PRESSURIZAÇÃO (js/hidpressao.js): as famílias de cada pressurizador do catálogo (volumetria da ficha), base, união e ponto de força */
    var HPZ = carregar("HidPressao", "hidpressao.js");
    try { if (HPZ && HPZ.familias) HPZ.familias().forEach(function (f) { CACHE.push(JSON.parse(JSON.stringify(f))); }); } catch (eP) {}
    return CACHE;
  }
  function porId(id) { var t = todas(), i; for (i = 0; i < t.length; i++) if (t[i].id === id) return t[i]; return null; }
  function ids() { return ESPECS.map(function (e) { return e.id; }); }
  function avisosDoTipo(famId, tipoId) {
    var f = porId(famId), t = null, i;
    if (!f) return [];
    for (i = 0; i < f.tipos.length; i++) if (f.tipos[i].id === tipoId) t = f.tipos[i];
    return t ? t.avisos.slice() : [];
  }
  function problemas() { todas(); return PROBLEMAS.slice(); }
  /* .opfam pelo js/opformato.js (cabeçalho + hash). Devolve o TEXTO do arquivo. */
  function paraOpfam(id, meta) {
    var f = porId(id);
    if (!f) throw new Error("hidfamilias: família \"" + id + "\" não existe");
    if (!OpF) throw new Error("hidfamilias: js/opformato.js não carregou");
    return OpF.familiaParaArquivo(f, meta || { autor: "RA Engenharia", descricao: f.nome + " — gerada do catálogo hidrossanitário" });
  }
  function resumo() { return todas().map(function (f) { return { id: f.id, nome: f.nome, tipos: f.tipos.length, aConferir: f.tipos.filter(function (t) { return t.conferir.length; }).length }; }); }

  var HidFamilias = { todas: todas, porId: porId, ids: ids, paraOpfam: paraOpfam, avisosDoTipo: avisosDoTipo, problemas: problemas, resumo: resumo, TETO_TRIANGULOS: TETO_TRIANGULOS, PSET: PSET, validar: function (id) { return Fam.validar(porId(id)); } };
  global.HidFamilias = HidFamilias;
  if (typeof module !== "undefined" && module.exports) module.exports = HidFamilias;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

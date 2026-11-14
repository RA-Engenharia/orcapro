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
  /* DIREÇÃO DE SAÍDA DO TUBO (papel/dir de cada conector — 27/10/2026, frente 2 "de onde é a entrada e a saída"): vetor unitário em
     coordenadas LOCAIS da família (convenção do js/familia.js: Y para cima, Z para FORA da parede). Ponto de parede → −Z (para dentro da
     parede); ponto de piso → −Y. O motor (js/biminst.js) ainda NÃO lê papel/dir/opcional/bidirecional: a leitura é da frente 1b; o auditor
     tools/hid-auditar-portas.js cobra que todo conector os declare. */
  var DIRS = { parede: [0, 0, -1], piso: [0, -1, 0], cima: [0, 1, 0], esq: [-1, 0, 0], dir: [1, 0, 0], frente: [0, 0, 1] };
  function dv(nome) { var a = DIRS[nome]; return { x: a[0], y: a[1], z: a[2] }; }

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
        { id: "esgoto", nome: "Saída de esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "0", z: "0", papel: "saida", dir: dv("piso"), origemPos: "regra", aConferir: "saída pelo PISO (a família não tem opção de saída pela parede)" },
        { id: "af", nome: "Água fria (caixa)", sistema: "agua_fria", dn: "DN_agua", x: "Agua_lateral", y: "Agua_altura", z: "-Esgoto_parede", papel: "entrada", dir: dv("parede"), origemPos: "regra" }
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
        { id: "esgoto", nome: "Saída de esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "0", z: "0", papel: "saida", dir: dv("piso"), origemPos: "regra", aConferir: "saída pelo PISO (a família não tem opção de saída pela parede)" },
        { id: "af", nome: "Água fria (tubo de ligação)", sistema: "agua_fria", dn: "DN_agua", x: "Agua_lateral", y: "Agua_altura", z: "-Esgoto_parede", papel: "entrada", dir: dv("parede"), origemPos: "regra" }
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
        { id: "esgoto", nome: "Esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "Esgoto_altura", z: "-Profundidade/2", papel: "saida", dir: dv("parede"), origemPos: "regra" },
        { id: "af", nome: "Água fria", sistema: "agua_fria", dn: "DN_agua", x: "Agua_afastamento/2", y: "Agua_altura", z: "-Profundidade/2", papel: "entrada", dir: dv("parede"), origemPos: "regra" },
        { id: "aq", nome: "Água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Agua_afastamento/2", y: "Agua_altura", z: "-Profundidade/2", papel: "entrada", dir: dv("parede"), origemPos: "regra" }
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
        { id: "esgoto", nome: "Esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "Esgoto_altura", z: "-Profundidade/2", papel: "saida", dir: dv("parede"), origemPos: "regra" },
        { id: "af", nome: "Água fria", sistema: "agua_fria", dn: "DN_agua", x: "Agua_afastamento/2", y: "Agua_altura", z: "-Profundidade/2", papel: "entrada", dir: dv("parede"), origemPos: "regra" },
        { id: "aq", nome: "Água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Agua_afastamento/2", y: "Agua_altura", z: "-Profundidade/2", papel: "entrada", dir: dv("parede"), origemPos: "regra" }
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
      conectores: [{ id: "esgoto", nome: "Esgoto (saída do sifão, na parede)", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "-Esgoto_abaixo_tampo", z: "se(Distancia_parede > Profundidade/2; -Distancia_parede; 0)", papel: "saida", dir: dv("parede"), origemPos: "regra", aConferir: "cota do esgoto abaixo do tampo varia por produto (Deca p.115 tabela 3)" },
        { id: "af", nome: "Água fria (torneira da cuba)", sistema: "agua_fria", dn: "DN_agua", x: "Agua_afastamento/2", y: "se(Torneira_de_parede; Agua_acima_tampo; -Agua_abaixo_tampo)", z: "-Distancia_parede", papel: "entrada", dir: dv("parede"), origemPos: "regra" },
        { id: "aq", nome: "Água quente (misturador da cuba)", sistema: "agua_quente", dn: "DN_agua", x: "-Agua_afastamento/2", y: "se(Torneira_de_parede; Agua_acima_tampo; -Agua_abaixo_tampo)", z: "-Distancia_parede", visivel: "Agua_quente", papel: "entrada", dir: dv("parede"), origemPos: "regra" }],
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
      conectores: [{ id: "esgoto", nome: "Esgoto (saída do sifão, na parede)", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "-Altura_cuba - 0.06", z: "-Profundidade/2", papel: "saida", dir: dv("parede"), origemPos: "desenho", aConferir: "sem ficha de pia no catálogo: posição do desenho do sifão" }], material: "Aço inox" },   /* hid:ok geometria do sifão desenhado */

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
      conectores: [{ id: "esgoto", nome: "Esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "0", z: "-Profundidade/2", papel: "saida", dir: dv("parede"), origemPos: "extremidade", aConferir: "altura do esgoto do tanque sem cota na ficha (colocado no piso, na parede de trás)" }], material: "Louça branca" },

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
        { id: "af", nome: "Água fria (válvula)", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "Agua_altura", z: "-Profundidade/2", papel: "entrada", dir: dv("parede"), origemPos: "interpretado" },
        { id: "esgoto", nome: "Esgoto", sistema: "esgoto", dn: "DN_esgoto", x: "0", y: "Esgoto_altura", z: "-Profundidade/2", papel: "saida", dir: dv("parede"), origemPos: "interpretado" }
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
  var CON_AF = [{ id: "af", nome: "Água fria", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "0", z: "0", papel: "entrada", dir: dv("parede"), origemPos: "extremidade", aConferir: "o catálogo Docol não traz cotas de instalação: ponto na origem da família, tubo chegando pela parede" }];
  var CON_AF_AQ = [{ id: "af", nome: "Água fria", sistema: "agua_fria", dn: "DN_agua", x: "0.04", y: "0", z: "0", papel: "entrada", dir: dv("parede"), origemPos: "extremidade", aConferir: "afastamento entre os pontos de AF e AQ sem cota no catálogo Docol" },       /* hid:ok afastamento entre pontos do misturador: a conferir */
                   { id: "aq", nome: "Água quente", sistema: "agua_quente", dn: "DN_agua", x: "-0.04", y: "0", z: "0", papel: "entrada", dir: dv("parede"), origemPos: "extremidade", aConferir: "afastamento entre os pontos de AF e AQ sem cota no catálogo Docol" }];  /* hid:ok idem */
  /* ⚠ REVISÃO H5 (21/10/2026, ALTO): o chuveiro só tinha o ponto de ÁGUA FRIA — com aquecedor no modelo, a ducha (o principal ponto
     de água quente da casa) ficava sem água quente e o Traçar não via nada a traçar. Agora a DUCHA (não elétrica: a metálica do
     catálogo Docol, que não aquece) tem o ponto de ÁGUA QUENTE do misturador de parede (registros de AF e AQ separados): na altura do
     registro de pressão (RP), ao lado do eixo do braço. O chuveiro ELÉTRICO (Eletrico = sim) aquece a água: só a água fria.
     Desnível = CH − RP da tabela da Tigre (Manual Técnico 2025, p.40: CH 2,20 m, RP 1,10 m — dados-fonte/hidro/kits/alturas-pontos.json);
     o afastamento lateral entre os registros não tem cota no catálogo (a conferir, aviso da família). */
  var CON_CHUVEIRO = [CON_AF[0], { id: "aq", nome: "Água quente (misturador de parede, na altura do RP)", sistema: "agua_quente", dn: "DN_agua", x: "-Misturador_afastamento", y: "-Misturador_desnivel", z: "0", visivel: "1 - Eletrico", papel: "entrada", dir: dv("parede"), origemPos: "interpretado", aConferir: "afastamento lateral entre os registros sem cota no catálogo (desnível CH − RP da Tigre p.40)" }];
  ESPECS.push(metal("hid-chuveiro", "Chuveiro / ducha", ["chuveiro"], ["agua_fria", "agua_quente"], CON_CHUVEIRO, "Chuveiro e ducha de parede ou de teto (Docol). A ducha recebe água fria e água quente pelo misturador de parede (dois registros); o chuveiro elétrico, só água fria.",
    ["Afastamento lateral entre o registro de água fria e o de água quente do misturador sem cota no catálogo: conferir."]));
  ESPECS[ESPECS.length - 1].avisos.push("Chuveiro de parede: forma do Docol Clássico (catálogo geral pág. 186); conferir o modelo — só o Clássico tem desenho cotado aqui. O chuveiro ELÉTRICO mantém o desenho de chuveiro elétrico.");
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
        { id: "a", nome: "Ponta A (entrada)", sistema: "agua_fria", dn: "DN_agua", x: "-Comprimento/2", y: "0", z: "0", papel: "entrada", dir: dv("esq"), bidirecional: true, origemPos: "extremidade", aConferir: "comprimento do corpo é de reserva (o catálogo não cota)" },
        { id: "b", nome: "Ponta B (saída)", sistema: "agua_fria", dn: "DN_agua", x: "Comprimento/2", y: "0", z: "0", papel: "saida", dir: dv("dir"), bidirecional: true, origemPos: "extremidade", aConferir: "comprimento do corpo é de reserva (o catálogo não cota)" }
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
    conectores: [{ id: "af", nome: "Entrada de água", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "0", z: "0", papel: "entrada", dir: dv("parede"), origemPos: "extremidade", aConferir: "a ficha Deca só dá o acionamento; ponto na origem, tubo pela parede" },
                 { id: "descarga", nome: "Saída para a bacia (descarga)", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "-Altura*0.4", z: "0", papel: "saida", dir: dv("piso"), origemPos: "desenho", aConferir: "posição do volume esquemático (sem cota no catálogo)" }], material: "Metal"   /* hid:ok geometria do volume esquemático */
  });
  ESPECS.push({
    id: "hid-caixa-descarga-embutida", nome: "Caixa de descarga embutida", categoria: "equipamento", sistemas: ["agua_fria"], tipos: ["caixa_descarga_embutida"], volume: true,
    descricao: "Caixa de descarga embutida Deca (Hydra), mecânica ou pneumática. Origem = ponto da entrada de água, centro da caixa.",
    avisos: [AV_ESQ, "Altura, largura e espessura da caixa: vistas cotadas do Catálogo Hydra (págs. impressas 426-428); na 2502 (drywall) a profundidade é regulável 120–180 mm: adotada a mínima."],
    geo: [
      G("Largura", 0.46, null, DADO("largura_mm", true), "Largura (catálogo)"),                                       /* hid:ok geometria */
      G("Espessura", 0.08, null, DADO("espessura_mm", true), "Espessura da caixa (catálogo)"),                        /* hid:ok geometria */
      G("Altura", 0.6, null, DADO("altura_mm", true), "Altura da caixa (cota do desenho do catálogo Hydra, págs. 426-428)"),   /* hid:ok geometria — FAMÍLIAS REAIS 07/11/2026: 570 / 635 / 1150 lidos do desenho */
      DN("DN_agua", function (it) { var m = /DN\s*(\d+)/i.exec(txt(it.dados.registroIntegrado)); return m ? { v: parseInt(m[1], 10), origem: "catalogo" } : null; }, "DN do registro integrado") /* hid:ok base decimal */
    ],
    solidos: [{ id: "corpo", nome: "Caixa embutida", forma: "caixa", x: "0", y: "0", z: "-Espessura/2", dx: "Largura", dy: "Altura", dz: "Espessura", material: "Material" }],
    conectores: [{ id: "af", nome: "Entrada de água", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "0", z: "0", papel: "entrada", dir: dv("parede"), origemPos: "extremidade", aConferir: "ponto de entrada sem cota no catálogo (caixa embutida: o tubo chega pela parede)" }], material: "Plástico"
  });

  /* --- caixas e ralos: origem no piso acabado, corpo para baixo (Y negativo) --- */
  var CX_CORPO = [{ id: "corpo", nome: "Corpo", forma: "caixa", x: "0", y: "-Altura", z: "0", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Material" }];
  /* CAIXA SIFONADA: N BOCAS DE ENTRADA + 1 de saída. O catálogo Amanco diz quantas entradas o modelo tem (parâmetro Entradas: 1, 3, 5 ou 7); a
     1ª fica sempre (id "entrada", como antes) e as demais aparecem pelo parâmetro (visivel). A ficha NÃO cota onde cada boca fica no corpo:
     distribuição pelas faces menos a da saída (+X), marcada "a conferir". Entrada além da 1ª que não recebe tubo é boca TAMPADA — por isso
     `opcional: true` (o motor deve honrar: não é desconexão). Tigre/sem número de entradas: só a 1ª. */
  var ENTRADAS_SIFONADA = [
    { id: "entrada", nome: "Entrada 1", sistema: "esgoto", dn: "DN_entrada", x: "se(Diametro_corpo > 0; -Diametro_corpo/2; -Largura/2)", y: "-Entrada_prof", z: "0", papel: "entrada", dir: dv("esq"), origemPos: "extremidade", aConferir: "tipo da ficha: Ø do corpo e altura das entradas da tabela das peças (a mesma do motor de bocas); demais tipos: posição não cotada" }
  ];
  (function () {
    var slots = [   /* [x, z, dir] — fração da Largura/Profundidade; a saída fica na face +X */
      ["0", "Profundidade/2", "frente"], ["0", "-Profundidade/2", "parede"], ["-Largura/4", "Profundidade/2", "frente"],
      ["-Largura/4", "-Profundidade/2", "parede"], ["Largura/4", "Profundidade/2", "frente"], ["Largura/4", "-Profundidade/2", "parede"]
    ], k;
    for (k = 0; k < slots.length; k++) {
      /* FAMÍLIAS CAIXAS: com o Ø do corpo da ficha (Diametro_corpo), a boca fica NO RAIO do corpo (as diagonais a 45°, como o js/hidbocas.js) */
      var rx = { "0": "0", "-Largura/4": "-0.7071*Diametro_corpo/2", "Largura/4": "0.7071*Diametro_corpo/2" }[slots[k][0]], rz = (slots[k][0] === "0" ? "" : "0.7071*") + "Diametro_corpo/2";
      ENTRADAS_SIFONADA.push({ id: "entrada" + (k + 2), nome: "Entrada " + (k + 2), sistema: "esgoto", dn: "DN_entrada", x: "se(Diametro_corpo > 0; " + rx + "; " + slots[k][0] + ")", y: "-Entrada_prof",
        z: "se(Diametro_corpo > 0; " + (/^-/.test(slots[k][1]) ? "-" : "") + rz + "; " + slots[k][1] + ")", visivel: "Entradas >= " + (k + 2),
        papel: "entrada", dir: dv(slots[k][2]), opcional: true, origemPos: "extremidade", aConferir: "posição das bocas de entrada não cotada na ficha; boca não usada fica tampada" });
    }
  })();
  ESPECS.push({
    id: "hid-caixa-sifonada", nome: "Caixa sifonada / caixa seca", categoria: "equipamento", sistemas: ["esgoto"], tipos: ["caixa_sifonada", "caixa_seca"],
    descricao: "Caixa sifonada ou seca de PVC (Amanco, Tigre). Origem = piso acabado, centro da caixa; o corpo desce Altura abaixo do piso.",
    avisos: ["Amanco: Largura e Altura são os números 1º e 2º do nome do modelo (C×A×DN; a ficha confirma A = altura nominal). Tigre: o catálogo não define o significado de '100 x 140 x 50' — cotas a conferir.", AV_CONECTOR],
    geo: [
      G("Largura", 0.15, [0.08, 0.35], NOME(1), "Lado da caixa em planta"),                                           /* hid:ok geometria */
      G("Profundidade", 0.15, [0.08, 0.35], NOME(1), "Lado da caixa em planta (caixa quadrada)"),                     /* hid:ok geometria */
      G("Altura", 0.1, [0.05, 0.3], NOME(2), "Altura nominal do corpo"),                                              /* hid:ok geometria */
      DN("DN_entrada", conectorCat("entrada"), "DN das entradas"), DN("DN_saida", conectorCat("saida"), "DN da saída"),
      /* Obra de terceiro (06/11/2026): a ficha não cota a altura das bocas de entrada; 0 = no topo do corpo (como antes). O projeto que precisa
         (ramal que chega abaixo do piso acabado) grava a profundidade na instância — a conferir na ficha do produto escolhido */
      I("Entrada_prof", 0, null, "Profundidade do eixo das bocas de entrada abaixo do piso acabado (m); 0 = no topo do corpo (a ficha não cota)")
    ],
    extraDados: [["Fecho_hidrico_mm", "fechoHidrico_mm", "Fecho hídrico"], ["Entradas", "entradas", "Número de entradas"]],
    solidos: CX_CORPO,
    conectores: ENTRADAS_SIFONADA.concat([
      { id: "saida", nome: "Saída", sistema: "esgoto", dn: "DN_saida", x: "se(Diametro_corpo > 0; Diametro_corpo/2; Largura/2)", y: "se(Saida_altura > 0; -Altura + Saida_altura; -Altura)", z: "0", papel: "saida", dir: dv("dir"), origemPos: "extremidade", aConferir: "tipo da ficha: hSaida e Ø do corpo da tabela das peças (a mesma do motor de bocas); demais tipos: no fundo, lado oposto à 1ª entrada" }
    ]), material: "PVC"
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
    conectores: [{ id: "saida", nome: "Saída", sistema: "esgoto", dn: "DN_saida", x: "0", y: "-Altura", z: "0", papel: "saida", dir: dv("piso"), origemPos: "extremidade", aConferir: "saída pelo fundo do corpo; ralo seco e sifonado têm a mesma saída (DN da ficha)" }], material: "PVC"
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
        { id: "entrada", nome: "Entrada", sistema: sistema, dn: "DN_entrada", x: "-Diametro/2", y: "0", z: "0", papel: "entrada", dir: dv("esq"), origemPos: "extremidade", aConferir: "cota da entrada: letras do desenho da ficha, sem legenda em texto" },
        { id: "saida", nome: "Saída", sistema: sistema, dn: "DN_saida", x: "Diametro/2", y: "-Altura", z: "0", papel: "saida", dir: dv("dir"), origemPos: "extremidade", aConferir: "cota da saída: no fundo do corpo (abaixo da entrada); a ficha só dá letras do desenho" }
      ], material: "PVC"
    };
  }
  ESPECS.push(caixaCil("hid-caixa-gordura", "Caixa de gordura", "caixa_gordura", "C", "Caixa de gordura de PVC (Amanco DN300, Tigre)."));
  ESPECS.push(caixaCil("hid-caixa-inspecao", "Caixa de inspeção", "caixa_inspecao", "C1", "Caixa de inspeção de PVC (Amanco DN300, Tigre)."));
  /* FAMÍLIAS CAIXAS: no tipo Tigre (Estilo_tigre) as bocas da ficha ficam a Bocas_abaixo_topo do topo do corpo e na ponta das bolsas
     (Largura_bocais/2): entrada e saída na MESMA cota (ficha Tigre p.1). Os tipos Amanco seguem com as posições de antes. */
  ESPECS.forEach(function (e) {
    if (e.id !== "hid-caixa-gordura" && e.id !== "hid-caixa-inspecao") return;
    e.conectores.forEach(function (k) {
      if (k.id === "entrada") { k.x = "se(Estilo_tigre; -Largura_bocais/2; -Diametro/2)"; k.y = "se(Estilo_tigre; -Altura; 0)"; }
      if (k.id === "saida") { k.x = "se(Estilo_tigre; Largura_bocais/2; Diametro/2)"; k.y = "se(Estilo_tigre; -Altura; " + k.y + ")"; k.aConferir = "tipo Tigre da ficha: entrada e saída na MESMA cota, a Bocas_abaixo_topo do topo do corpo, na ponta das bolsas; demais tipos: " + k.aConferir; }
      if (k.id === "entrada") k.aConferir = "tipo Tigre da ficha: na cota das bocas (Bocas_abaixo_topo), na ponta da bolsa; demais tipos: " + k.aConferir;
    });
  });
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
      /* AS CINCO TUBULAÇÕES DO RESERVATÓRIO (27/10/2026): alimentação (com a boia, perto do topo), distribuição (perto do fundo, ACIMA dele
         para não puxar sedimento), extravasor (acima do nível máximo), limpeza (no fundo) e ventilação (no topo, OPCIONAL: a tampa da caixa
         de polietileno já respira). `porta` = o nome padrão; os ids antigos (entrada/saida/saida2) ficam, as portas novas usam o próprio
         nome. A ficha Fortlev diz que a posição e o DN de extravasor/limpeza "a ficha só dá orientação em desenho": as alturas abaixo são a
         PROPORÇÃO do desenho do corpo, a conferir; o DN delas fica 0 = o dimensionamento define. Azimutes: alimentação −X, distribuição +X,
         extravasor +Z, limpeza −Z, sucção da cisterna a 45°. O sistema das portas de serviço (extravasor, limpeza) é agua_fria só para o
         motor tratá-las como linha de água; a destinação (visível/pluvial, NBR 5626) é do traçado — a conferir. */
      e.conectores = [
        { id: "entrada", nome: "Entrada (alimentação, no corpo)", sistema: "agua_fria", dn: "DN_entrada", x: "-(" + r.R + "*" + r.kE + " + 0.056)", y: "(" + r.B + ")*0.86", z: "0",   /* hid:ok adaptador desenhado */
          porta: "alimentacao", papel: "entrada", dir: dv("esq"), origemPos: "desenho", aConferir: "furo feito na obra (a ficha Fortlev não cota): altura = proporção do desenho, com a boia" },
        { id: "saida", nome: "Saída (consumo, na base)", sistema: "agua_fria", dn: "DN_saida", x: r.R + " + 0.026", y: "0.03", z: "0",   /* hid:ok adaptador desenhado */
          porta: "distribuicao", papel: "saida", dir: dv("dir"), origemPos: "desenho", aConferir: "furo feito na obra: 3 cm acima do fundo (não puxa sedimento); a ficha não cota" },
        { id: "extravasor", nome: "Extravasor (acima do nível máximo)", sistema: "agua_fria", dn: "DN_extravasor", x: "0", y: "(" + r.B + ")*0.93", z: r.R,   /* hid:ok proporção do desenho */  /* o Traçar (barrilete) grava Ad/Ang/Y_extravasor: o conector SEGUE o furo e o tubo (27/10/2026, frente 1b-ii D9) — ver o ajuste logo abaixo do ESPECS.forEach */
          porta: "extravasor", papel: "saida", dir: dv("frente"), origemPos: "desenho", aConferir: "posição e DN do extravasor: a ficha Fortlev só dá orientação em desenho; altura = proporção do desenho acima da alimentação; furo na parede do corpo (o 3D ainda não desenha o adaptador dele)" },
        { id: "limpeza", nome: "Limpeza (no fundo)", sistema: "agua_fria", dn: "DN_limpeza", x: "0", y: "0", z: "-(" + r.R + ")",
          porta: "limpeza", papel: "saida", dir: dv("parede"), origemPos: "desenho", aConferir: "posição e DN da limpeza: a ficha só dá orientação em desenho; no fundo do corpo" },
        { id: "ventilacao", nome: "Ventilação (no topo, opcional)", sistema: "ventilacao", dn: "DN_ventilacao", x: "0", y: "(" + r.B + ")", z: "0",
          porta: "ventilacao", papel: "respiro", dir: dv("cima"), opcional: true, origemPos: "desenho", aConferir: "opcional: a tampa da caixa de polietileno já tem respiro; posição no topo, a ficha não cota" }
      ];
      e.geo.push(DN("DN_extravasor", null, "DN do extravasor"), DN("DN_limpeza", null, "DN da limpeza"), DN("DN_ventilacao", null, "DN da ventilação (opcional)"));
      e.avisos = e.avisos.map(function (a) { return a.replace(" Extravasor e limpeza não estão modelados nesta versão.", " Extravasor, limpeza e ventilação: posição e DN a conferir (a ficha Fortlev só dá orientação em desenho)."); });
      /* 27/10/2026 (frente 1b-ii, D9): o barrilete lança o extravasor e a limpeza e grava na instância o DN (Ad_), o ângulo a partir da saída (Ang_, rad) e a
         cota do eixo (Y_, m acima da base) de cada furo — o MESMO que o desenho do adaptador usa. O conector da porta passa a seguir esse furo (raio + 3 mm de folga do barrilete + o raio do tubo = Ad_/2000, o mesmo ponto onde o
         tubo nasce); sem o Traçar (Ad_ = 0) fica a posição de desenho de antes. Cisterna não tem esses parâmetros (o barrilete não a monta). */
      if (e.id !== "hid-cisterna") e.conectores.forEach(function (k) {
        if (k.id !== "extravasor" && k.id !== "limpeza") return;
        var A = "Ad_" + k.id, G2 = "Ang_" + k.id, Y2 = "Y_" + k.id;
        /* o raio de onde o barrilete tira o tubo = o MAIOR entre o corpo e o diâmetro nominal (js/hidbarrilete.js Rface), não a proporção 0,993 do desenho */
        var RF = e.id === "hid-caixa-dagua" ? "se(Diametro_corpo > Diametro; Diametro_corpo; Diametro)/2" : r.R;
        k.x = "se(" + A + " > 0; (" + RF + " + 0.003 + " + A + "/2000)*cos(" + G2 + "*57.2957795); " + k.x + ")";   /* hid:ok rad → graus; 0,003 = a folga que o barrilete deixa da face; Ad_/2000 = raio do tubo */
        k.y = "se(" + A + " > 0; " + Y2 + "; " + k.y + ")";
        k.z = "se(" + A + " > 0; -(" + RF + " + 0.003 + " + A + "/2000)*sen(" + G2 + "*57.2957795); " + k.z + ")";   /* hid:ok idem */
      });
      if (e.id === "hid-cisterna") e.conectores.push({ id: "succao", nome: "Sucção da bomba", sistema: "agua_fria", dn: "DN_succao", x: "(" + r.R + ")*0.7071", y: "0.05", z: "(" + r.R + ")*0.7071",   /* hid:ok furo a 45° na parede do corpo */
        porta: "succao", papel: "succao", dir: dv("dir"), origemPos: "desenho", aConferir: "sucção da bomba da cisterna: posição e DN de reserva (o dimensionamento da bomba define)" }), e.geo.push(DN("DN_succao", null, "DN da sucção da bomba (cisterna)"));
      /* N23 (26/10/2026): a 2ª saída (coluna exclusiva da válvula de descarga) — só existe quando o Traçar a grava (Ad_saida2 > 0), no
         mesmo raio e cota da saída, girada de Ang_saida2. O cálculo a trata como o mesmo nó da saída (js/hidgrafo.js) */
      if (e.id !== "hid-cisterna") e.conectores.push({ id: "saida2", nome: "2ª saída (válvula de descarga)", sistema: "agua_fria", dn: "Ad_saida2", visivel: "Ad_saida2 > 0", porta: "distribuicao", papel: "saida", dir: dv("dir"), origemPos: "desenho", aConferir: "a direção acompanha Ang_saida2 (aqui, no ângulo 0)",
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
      DN("DN_succao", null, "DN da sucção"), DN("DN_recalque", null, "DN do recalque"),
      /* LOTE 3-5 (13/11/2026): bocas pela ficha (Dancor CAM-W4C, Catálogo Geral 60 Hz p.160, letras C e B+J). 0 = desenho antigo (projeto gravado com o t-generico não mexe) */
      X("Eixo_succao", "comprimento", 0, "Dimensões", "Altura do eixo da sucção acima do piso (letra C da ficha); 0 = proporção antiga (0,03 + Largura/2)"),
      X("Recuo_recalque", "comprimento", 0, "Dimensões", "Distância da face da sucção ao eixo do recalque (letras B + J da ficha); 0 = proporção antiga (30 % do comprimento)")
    ],
    solidos: [],
    conectores: [
      { id: "succao", nome: "Sucção", sistema: "agua_fria", dn: "DN_succao", x: "-Comprimento/2", y: "se(Eixo_succao > 0; Eixo_succao; 0.03 + Largura/2)", z: "0", papel: "succao", dir: dv("esq"), origemPos: "desenho", aConferir: "tipo genérico: bocais de reserva; nos tipos Dancor, letra C da ficha" },
      { id: "recalque", nome: "Recalque", sistema: "agua_fria", dn: "DN_recalque", x: "-Comprimento/2 + se(Recuo_recalque > 0; Recuo_recalque; Comprimento*0.3)", y: "Altura", z: "0", papel: "recalque", dir: dv("cima"), origemPos: "desenho", aConferir: "tipo genérico: bocais de reserva; nos tipos Dancor, letras B + J e D da ficha" }
    ], material: "Azul",
    /* Dancor CAM-W4C (Catálogo Geral 60 Hz, p.160, "Dimensionais (mm)"): A 186 (1/4 e 1/3 cv) / 211 (1/2 cv); B 55; C 76; D 170; E 137; F 156; G 173,5; J 40;
       sucção 1" e recalque 3/4" BSP. Comprimento = A + B; Largura = F (pé); Altura = D (topo do bocal de recalque); a caixa de ligação chega a G = 173,5 */
    tiposFicha: [["14", "1/4 cv", 0.186, 6.1], ["13", "1/3 cv", 0.186, 6.1], ["12", "1/2 cv", 0.211, 6.4]].map(function (m) {
      return fichaQ("t-dancor-cam-w4c-" + m[0], "Dancor CAM-W4C " + m[1] + " — " + Math.round((m[2] + 0.055) * 1000) + " × 156 × 170 mm, sucção 1\", recalque 3/4\"",
        { Fabricante: "Dancor", Linha: "Série CAM — CAM W-4C (centrífuga de aplicação múltipla)", Codigo: "CAM-W4C " + m[1], Descricao_ficha: "Motobomba centrífuga CAM-W4C " + m[1] + ", monofásica, 3.500 rpm",
          Link_ficha: "https://www.dancor.com.br/wp-content/uploads/2021/11/cam-w4c-pbe_cat-1.pdf", Edicao_ficha: "Catálogo Geral 60 Hz, página 160 (arquivo publicado em 11/2021)", Pagina_ficha: 1, Pagina_cotas: 1,
          Cotas_ficha: "A=" + Math.round(m[2] * 1000) + "; B=55; C=76; D=170; E=137; F=156; G=173,5; H=69,8; I=8,7; J=40; peso " + String(m[3]).replace(".", ",") + " kg",
          Comprimento: Math.round((m[2] + 0.055) * 1000) / 1000, Largura: 0.156, Altura: 0.17, Eixo_succao: 0.076, Recuo_recalque: 0.095, DN_succao: 25, DN_recalque: 20 },   /* hid:ok cotas da ficha Dancor CAM-W4C p.160 */
        "Dancor, Catálogo Geral 60 Hz, CAM W-4C, p.160 (Dimensionais): A " + Math.round(m[2] * 1000) + ", B 55, C 76, D 170, F 156, J 40 mm", ["Recuo_recalque (B + J: leitura do desenho lateral)"]);
    }) });
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
    /* LOTE 3-5 (13/11/2026): o abrigo de sobrepor do mercado é 90 × 60 × 17 cm (altura × largura × profundidade) — SINAPI insumo 20963
       (abrigo para mangueira de sobrepor 90 × 60 × 17 cm, chapa de aço) e EstriboFire (AECweb, produto 95368, chapa 21, 1 mangueira de 20 a 30 m).
       É COTA DE CATÁLOGO GENÉRICO (norma/insumo), não de desenho cotado de fabricante: o tipo diz isso em Conferir. */
    tiposFicha: [fichaQ("t-abrigo-sobrepor-90x60x17", "Abrigo de sobrepor 90 × 60 × 17 cm (chapa de aço, porta com visor)",
      { Fabricante: "(catálogo genérico — EstriboFire/AECweb)", Linha: "Abrigo para mangueira de sobrepor", Codigo: "EstriboFire 90x60x17 (AECweb 95368)", Descricao_ficha: "Abrigo para mangueira de incêndio, de sobrepor, 90 × 60 × 17 cm, chapa de aço com pintura vermelha e visor (a mesma descrição do insumo SINAPI 20963)",
        Link_ficha: "https://www.aecweb.com.br/produto/abrigo-para-mangueira-com-tampa-de-vidro-sobrepor/95368", Edicao_ficha: "descrição do insumo SINAPI 20963 + página do produto EstriboFire no AECweb, lidas em 13/11/2026", Pagina_ficha: 1, Pagina_cotas: 1,
        Cotas_ficha: "altura 900; largura 600; profundidade 170 mm", Largura: 0.6, Altura: 0.9, Profundidade: 0.17 },
      "SINAPI insumo 20963 (abrigo de sobrepor 90 × 60 × 17 cm) e EstriboFire/AECweb 95368 — cota genérica de catálogo", ["Largura, Altura e Profundidade: cota genérica (SINAPI 20963), sem desenho cotado de fabricante — conferir o abrigo comprado", "posição do registro dentro do abrigo: desenho"])],
    geo: [
      G("Largura", 0.75, [0.3, 1.5], null, "Largura do abrigo"),                                                           /* hid:ok geometria de reserva (peça hidrante_abrigo do biminst) */
      G("Altura", 0.9, [0.4, 1.8], null, "Altura do abrigo"),                                                              /* hid:ok geometria de reserva (peça hidrante_abrigo do biminst) */
      G("Profundidade", 0.3, [0.15, 0.6], null, "Profundidade do abrigo"),                                                 /* hid:ok geometria de reserva (peça hidrante_abrigo do biminst) */
      DN("DN_ramal", null, "DN da ligação do registro")
    ],
    solidos: [],
    conectores: [{ id: "entrada", nome: "Entrada do registro", sistema: "incendio", dn: "DN_ramal", x: "-Largura*0.25", y: "Altura*0.35", z: "-Profundidade/2", papel: "entrada", dir: dv("parede"), origemPos: "desenho", aConferir: "abrigo genérico: posição do registro de reserva" }], material: "Vermelho" });
  ESPECS.push({
    id: "hid-extintor", nome: "Extintor portátil", categoria: "equipamento", sistemas: ["incendio"], tipos: [], generico: true,
    descricao: "Extintor portátil. Origem = piso, centro do cilindro. Sem conector: não liga a rede. A família com fabricante, capacidade e preço por tipo é a inc-extintor (IT 16); esta fica para o Hidro (cálculo e templates).",
    avisos: [AV_GENERICA],
    tiposFicha: [{ id: "t-kidde-kb-p4abc55", nome: "Kidde Brasil KB-P4ABC55 — pó ABC 4 kg, 445 × Ø137 mm",
      valores: { Fabricante: "Kidde Brasil", Linha: "Convencional", Codigo: "KB-P4ABC55", Descricao_ficha: "Extintor portátil com carga de pó ABC, 2-A:20-B:C, ABNT NBR 15808", Link_ficha: "https://www.aecweb.com.br/produto/extintor-portatil-com-carga-de-po-abc-linha-convencional/38687", Edicao_ficha: "página de produto no AECweb (Kidde Brasil), lida em 28/10/2026", Pagina_ficha: 1, Pagina_cotas: 1, Cotas_ficha: "altura 445 mm; diâmetro 137 mm; peso bruto aprox. 6,1 kg", Diametro: 0.137, Altura: 0.445, A_conferir: false, Conferir: "" },   /* hid:ok cotas da ficha Kidde Brasil KB-P4ABC55 */
      fonte: "Kidde Brasil, KB-P4ABC55, página de produto no AECweb (Convencional): altura 445 mm, Ø 137 mm" }],
    geo: [
      G("Diametro", 0.18, [0.08, 0.4], null, "Diâmetro do cilindro"),                                                      /* hid:ok geometria de reserva (peça extintor do biminst: raio 0,09) */
      G("Altura", 0.55, [0.3, 1.2], null, "Altura total com a válvula")                                                    /* hid:ok geometria de reserva (peça extintor do biminst) */
    ],
    solidos: [], conectores: [], material: "Vermelho" });
  ESPECS.push({
    id: "hid-sprinkler", nome: "Chuveiro automático (sprinkler pendente)", categoria: "equipamento", sistemas: ["incendio"], tipos: [], generico: true,
    descricao: "Sprinkler pendente. Origem = a rosca de ligação, no teto; o corpo desce Altura abaixo dela.",
    avisos: [AV_GENERICA, AV_CONECTOR],
    tiposFicha: [{ id: "t-reliable-kfr56", nome: "Reliable KFR56 — pendente 1/2\" NPT, K 5,6, 57 mm, defletor Ø 24 mm",
      valores: { Fabricante: "Reliable", Linha: "KFR56 (SIN RA3614)", Codigo: "KFR56 pendente", Descricao_ficha: "Sprinkler pendente de resposta rápida, K 5,6 (80 métrico), rosca 1/2\" NPT ou ISO7-1R1/2", Link_ficha: "https://www.reliablesprinkler.com/files/bulletins/036.pdf", Edicao_ficha: "Reliable Bulletin 036, julho/2025", Pagina_ficha: 2, Pagina_cotas: 2, Cotas_ficha: "figura 1 (p.2): altura total 2 1/4\" (57 mm), defletor 1\" (24 mm); com protetor S-1 opcional 3 1/4\" (83 mm)", Diametro: 0.024, Altura: 0.057, A_conferir: true, Conferir: "DN_ramal (DN: o dimensionamento define)" },   /* hid:ok cotas da ficha Reliable Bulletin 036 p.2 (Figura 1) */
      fonte: "Reliable, Bulletin 036 (jul/2025), p.2, Figura 1: altura 57 mm e defletor Ø 24 mm (cotas no desenho, lidas na imagem)" }],
    geo: [
      G("Diametro", 0.06, [0.03, 0.12], null, "Diâmetro do defletor"),                                                     /* hid:ok geometria de reserva (peça chuveiro_automatico do biminst) */
      G("Altura", 0.06, [0.03, 0.15], null, "Altura da rosca ao defletor"),                                                /* hid:ok geometria de reserva (peça chuveiro_automatico do biminst) */
      DN("DN_ramal", null, "DN da rosca de ligação")
    ],
    solidos: [],
    conectores: [{ id: "entrada", nome: "Rosca de ligação", sistema: "incendio", dn: "DN_ramal", x: "0", y: "0", z: "0", papel: "entrada", dir: dv("cima"), origemPos: "extremidade", aConferir: "sprinkler genérico: pendente, o ramal chega por cima" }], material: "Metal cromado" });

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
    var yc = "se(Eixo_succao > 0; Eixo_succao; 0.03 + Largura/2)";
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
    /* FAMÍLIAS R2 (print): a caixa era um bloco cheio e escondia a mangueira atrás do vidro — agora é a caixa de chapa ABERTA na frente
       (fundo + 4 laterais), como o abrigo do catálogo, e a mangueira aparece pelo visor */
    var ch = "0.008";
    return [cxs("corpo", "Fundo do abrigo", "0", "0", "-Profundidade/2 + " + ch + "/2", "Largura", "Altura", ch, "Vermelho"),
      cxs("lat-esq", "Lateral (esquerda)", "-Largura/2 + " + ch + "/2", "0", "0", ch, "Altura", "Profundidade", "Vermelho"),
      cxs("lat-dir", "Lateral (direita)", "Largura/2 - " + ch + "/2", "0", "0", ch, "Altura", "Profundidade", "Vermelho"),
      cxs("teto", "Teto", "0", "Altura - " + ch, "0", "Largura", ch, "Profundidade", "Vermelho"),
      cxs("piso", "Fundo de baixo", "0", "0", "0", "Largura", ch, "Profundidade", "Vermelho"),
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
      cil("manometro", "Manômetro", "z", "0", H + "*0.9", "0", "0.018", R + "*0.3", CROMO),
      /* LOTE 3-5: mangueira e difusor (Kidde KB-P4ABC55: a mangueira desce pela lateral até a presilha no cilindro) */
      cil("mangueira", "Mangueira", "y", R + " + 0.008", H + "*0.42", "0", "0.006", H + "*0.46", "Preto"),
      cil("difusor", "Difusor", "y", R + " + 0.008", H + "*0.36", "0", "0.009", H + "*0.06", "Preto"),
      cxs("presilha", "Presilha da mangueira", R + " - 0.002", H + "*0.36", "0", "0.016", "0.012", "0.02", "Preto")];
  };
  GEO_FAM["hid-sprinkler"] = function () {
    return [cil("niple", "Rosca", "y", "0", "-Altura*0.3", "0", "0.0107", "Altura*0.3", "Latão"),   /* 1/2\" NPT: Ø externo 21,3 mm */
      cil("corpo", "Corpo (chaves da rosca)", "y", "0", "-Altura*0.5", "0", "0.0095", "Altura*0.2", "Latão"),   /* Lote 1b: o corpo era mais largo que o defletor da ficha (Reliable KFR56: defletor Ø 24 mm, armação estreita); Ø de desenho, conferir */
      cxs("braco-1", "Braço (1)", "Diametro*0.33", "-Altura + 0.003", "0", "0.004", "Altura*0.5", "0.008", "Latão"),
      cxs("braco-2", "Braço (2)", "-Diametro*0.33", "-Altura + 0.003", "0", "0.004", "Altura*0.5", "0.008", "Latão"),
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
  var CX_INSPECAO = [G("Corpo_diametro", 0.332, [0.2, 0.5], L("A"), "Ø do tambor (letra A da ficha, pág. 8)"), G("Corpo_altura", 0.201, [0.1, 0.5], L("B"), "Altura do tambor sob a tampa (letra B, pág. 8)"),   /* hid:ok geometria: o padrão é a DN300 da ficha */
    G("Largura_bocais", 0.424, [0.3, 0.7], L("C1"), "Largura nos bocais, eixo X (letra C1, pág. 8)"), G("Largura_bocais_z", 0.386, [0.3, 0.7], L("C2"), "Largura nos bocais, eixo Z (letra C2, pág. 8)"),   /* hid:ok geometria */
    G("Tampa_lado", 0.321, [0.2, 0.5], L("F"), "Lado da tampa quadrada (letra F, pág. 8)"), G("Tampa_esp", 0.047, [0.02, 0.1], L("G"), "Espessura da tampa (letra G, pág. 8)")];   /* hid:ok geometria */
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
    "hid-chuveiro": { g: "chuveiro", p: { L: "se(Eletrico; Largura; Cl_diametro)", H: "se(Eletrico; Altura; Cl_queda)", P: "se(Eletrico; Profundidade; Cl_alcance)", eletrico: "Eletrico", est: "1" },
      env: ["0", "se(Eletrico; 0; -Cl_queda)", "se(Eletrico; Profundidade; Cl_alcance)/2", "se(Eletrico; Largura; Cl_diametro)", "se(Eletrico; Altura; Cl_queda)", "se(Eletrico; Profundidade; Cl_alcance)"],
      x: [X("Eletrico", "simnao", false, "Instalação", "Chuveiro elétrico (corpo com resistência) no lugar da ducha metálica — mantém o desenho de chuveiro elétrico"),
        X("Cl_diametro", "comprimento", 0.0958, "Dimensões", "Ø do crivo do Docol Clássico (catálogo geral pág. 186: 95,8 mm) — chuveiro de parede NÃO elétrico"),   /* hid:ok Docol pág. 186 */
        X("Cl_queda", "comprimento", 0.1137, "Dimensões", "Do eixo do braço à face do crivo (pág. 186: 113,7 mm)"),   /* hid:ok Docol pág. 186 */
        X("Cl_alcance", "comprimento", 0.2237, "Dimensões", "Da parede à borda do crivo (pág. 186: 223,7 mm)")] },   /* hid:ok Docol pág. 186 */
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
    "hid-valvula-descarga": { g: "valvula_descarga", p: { W: "Largura", H: "Altura", P: "Profundidade", cod: "@Codigo" },   /* @: o texto do parâmetro (o modelo do acabamento, catálogo Hydra) */ env: ["0", "-Altura*0.4", "0", "Largura", "Altura", "Profundidade"], x: [] },   /* a base desce até a saída (conector descarga, D-02) */
    "hid-caixa-descarga-embutida": { g: "caixa_descarga_embutida", p: { W: "Largura", H: "Altura", E: "Espessura" }, env: ["0", "0", "-Espessura/2", "Largura", "Altura", "Espessura"], x: [] },
    "hid-caixa-sifonada": { g: "caixa_sifonada", p: { W: "Largura", P: "Profundidade", H: "Altura", pf: "se(Peca_ficha; 1; 0)", dn: "se(DN_saida > 0; DN_saida; 50)" }, env: ["0", "-Altura", "0", "Largura", "Altura", "Profundidade"],
      x: [X("Peca_ficha", "simnao", false, "Forma 3D", "Corpo, grelha e bocas desenhados pelas cotas da ficha (o mesmo motor da peça do traçado, js/biminstgeo.js)"),
        X("Diametro_corpo", "comprimento", 0, "Dimensões", "Ø do corpo pela ficha (as bocas ficam nesse raio); 0 = a regra antiga (a face da Largura)"),
        X("Saida_altura", "comprimento", 0, "Dimensões", "Eixo da saída acima do fundo do corpo (hSaida da ficha); 0 = no fundo")] },
    "hid-ralo": { g: "ralo", p: { D: "min(Largura; Profundidade)", H: "Altura", quadrado: "Grelha_quadrada" }, env: ["0", "-Altura", "0", "Largura", "Altura", "Profundidade"],
      x: [X("Grelha_quadrada", "simnao", true, "Forma 3D", "Grelha quadrada (lido da descrição do catálogo: QD/QUADRADO); não = redonda", DESC(/\bQD\b|QUADRAD|\bQ\b/i, 1, 0))] },
    /* CAIXAS ENTERRADAS (27/10/2026): cada uma tem a FORMA do produto da Amanco Wavin (FT FTC000003, págs. 7 a 10) — ver o bloco no js/hidlouca.js.
       `Altura` (a profundidade do ponto de saída, usada pelo nivelamento e pelos conectores) NÃO muda: o desenho é que ganhou a forma do catálogo. */
    "hid-caixa-gordura": { g: "caixa_gordura", p: { D: "Corpo_diametro", H: "Corpo_altura", Ft: "Tampa_lado", Gt: "Tampa_esp", Cx: "Largura_bocais", Cz: "Largura_bocais", Dn: "se(DN_saida > 0; DN_saida; 100)", n3: "1", tg: "se(Estilo_tigre; 1; 0)", yb: "Bocas_abaixo_topo", Fpt: "Porta_tampa_lado" },   /* hid:ok DN100 da saída (D1 da ficha) quando o tipo não traz */
      env: ["0", "-max(Altura; Tampa_esp + Corpo_altura)", "0", "max(Largura_bocais; Tampa_lado)", "max(Altura; Tampa_esp + Corpo_altura)", "max(Corpo_diametro; Tampa_lado)"],
      x: [G("Corpo_diametro", 0.308, [0.2, 0.5], L("A"), "Ø do corpo (letra A da ficha, pág. 7)"), G("Corpo_altura", 0.461, [0.3, 0.8], L("B"), "Altura do corpo sob a tampa (letra B, pág. 7)"),   /* hid:ok geometria: o padrão é a DN300 da ficha */
        G("Largura_bocais", 0.422, [0.3, 0.7], L("C"), "Largura total com os bocais (letra C, pág. 7)"), G("Tampa_lado", 0.321, [0.2, 0.5], L("F"), "Lado da tampa quadrada (letra F, pág. 7)"),   /* hid:ok geometria */
        G("Tampa_esp", 0.047, [0.02, 0.1], L("G"), "Espessura da tampa (letra G, pág. 7)"), X("Estilo_tigre", "simnao", false, "Forma 3D", "Forma das caixas múltiplas Tigre (corpo cinza-escuro, porta-tampa e tampa reforçada preta) — o tipo da ficha Tigre liga"), X("Bocas_abaixo_topo", "comprimento", 0, "Dimensões", "Eixo das bocas abaixo do topo do corpo (letra C do desenho Tigre); 0 = a regra antiga"), X("Porta_tampa_lado", "comprimento", 0, "Dimensões", "Lado do porta-tampa (Tigre: C = 388 mm); 0 = 1,11 × a tampa")] },   /* hid:ok geometria */
    "hid-caixa-inspecao": { g: "caixa_inspecao", p: { D: "Corpo_diametro", H: "Corpo_altura", Ft: "Tampa_lado", Gt: "Tampa_esp", Cx: "Largura_bocais", Cz: "Largura_bocais_z", Pr: "max(0; Altura - Tampa_esp - Corpo_altura)", Dn: "se(DN_saida > 0; DN_saida; 100)", tg: "se(Estilo_tigre; 1; 0)", yb: "Bocas_abaixo_topo", Fpt: "Porta_tampa_lado" },   /* hid:ok DN100 dos bocais (D1/D2 da ficha) quando o tipo não traz; o prolongador DN300 (Amanco p.10) é cortado até a profundidade do ponto de saída */
      env: ["0", "-max(Altura; Tampa_esp + Corpo_altura)", "0", "max(Largura_bocais; Tampa_lado)", "max(Altura; Tampa_esp + Corpo_altura)", "max(Largura_bocais_z; Tampa_lado)"],
      x: CX_INSPECAO.concat([X("Estilo_tigre", "simnao", false, "Forma 3D", "Forma das caixas múltiplas Tigre (corpo cinza-escuro, porta-tampa e tampa reforçada preta) — o tipo da ficha Tigre liga"), X("Bocas_abaixo_topo", "comprimento", 0, "Dimensões", "Eixo das bocas abaixo do topo do corpo (letra C do desenho Tigre); 0 = a regra antiga"), X("Porta_tampa_lado", "comprimento", 0, "Dimensões", "Lado do porta-tampa (Tigre: C = 388 mm); 0 = 1,11 × a tampa")]) },
    "hid-caixa-areia": { g: "caixa_inspecao", p: { D: "Corpo_diametro", H: "Corpo_altura", Ft: "Tampa_lado", Gt: "Tampa_esp", Cx: "Largura_bocais", Cz: "Largura_bocais_z", Pr: "max(0; Altura + Bolsao - Tampa_esp - Corpo_altura)", Dn: "se(DN_saida > 0; DN_saida; 100)" },   /* hid:ok DN100 dos bocais quando o tipo não traz */
      env: ["0", "-max(Altura + Bolsao; Tampa_esp + Corpo_altura)", "0", "max(Largura_bocais; Tampa_lado)", "max(Altura + Bolsao; Tampa_esp + Corpo_altura)", "max(Largura_bocais_z; Tampa_lado)"],
      x: CX_INSPECAO.concat([X("Bolsao", "comprimento", 0.15, "Dimensões", "Bolsão de areia abaixo do tubo de saída (NBR 10844: ≥ 0,15 m): o tambor da inspeção sobre um prolongador DN300 cortado até a profundidade da saída + o bolsão (Amanco FT p.10, prolongador 300 × 200 ou 300 × 420)")]) },   /* hid:ok 0,15 m: mínimo da NBR 10844 */
    "hid-caixa-dagua": { g: "reservatorio", p: { D: "Diametro", H: "Altura", Hc: "Altura_corpo", Dc: "Diametro_corpo", Db: "Diametro_base", Dt: "0", tipo: "0", mc: "1", aS: "Ad_saida", aE: "Ad_entrada", a2: "Ad_saida2", g2: "Ang_saida2", aX: "Ad_extravasor", gX: "Ang_extravasor", yX: "Y_extravasor", aL: "Ad_limpeza", gL: "Ang_limpeza", yL: "Y_limpeza" }, env: ["0", "0", "0", "Diametro", "Altura", "Diametro"],
      x: ADAPT_X.concat([G("Altura_corpo", 0, [0.2, 4], N("altura_sem_tampa_mm"), "Altura sem a tampa (B da ficha); 0 = proporção do 1000 L"), G("Diametro_corpo", 0, [0.3, 4], N("diametro_sem_tampa_mm"), "Diâmetro sem a tampa (D da ficha); 0 = proporção"),
        G("Diametro_base", 0, [0.3, 4], N("diametro_base_mm"), "Diâmetro da base (E da ficha); 0 = proporção")]) },
    "hid-cisterna": { g: "reservatorio", p: { D: "Diametro", H: "Altura", Hc: "Altura_corpo", Dc: "0", Db: "0", Dt: "Diametro_tampa", tipo: "1" }, env: ["0", "0", "0", "Diametro", "Altura", "Diametro"],
      x: [G("Altura_corpo", 0, [0.2, 4], N("altura_corpo_mm"), "Altura do corpo sem a tampa; 0 = proporção"), G("Diametro_tampa", 0, [0.1, 2], N("diametro_tampa_mm"), "Diâmetro da tampa de inspeção; 0 = proporção")] },
    "hid-reservatorio-tanque": { g: "reservatorio", p: { D: "Diametro", H: "Altura", Hc: "0", Dc: "0", Db: "0", Dt: "Diametro_tampa", tipo: "2", aS: "Ad_saida", aE: "Ad_entrada", a2: "Ad_saida2", g2: "Ang_saida2", aX: "Ad_extravasor", gX: "Ang_extravasor", yX: "Y_extravasor", aL: "Ad_limpeza", gL: "Ang_limpeza", yL: "Y_limpeza" }, env: ["0", "0", "0", "Diametro", "Altura", "Diametro"],
      x: ADAPT_X.concat([G("Diametro_tampa", 0, [0.1, 2], N("diametro_tampa_inspecao_mm"), "Diâmetro da tampa de inspeção; 0 = proporção")]) },
    "hid-bomba": { g: "bomba", p: { C: "Comprimento", W: "Largura", H: "Altura", yc: "Eixo_succao", xr: "Recuo_recalque" }, env: ["0", "0", "0", "Comprimento", "Altura", "Largura"], x: [] },
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
      { id: "af", nome: "Entrada de água fria", sistema: "agua_fria", dn: "DN_agua", x: "Largura/4", y: "0", z: "Profundidade*0.45", papel: "entrada", dir: dv("piso"), origemPos: "interpretado", aConferir: "ligações na base do aparelho (a ficha não cota; AF à direita, AQ à esquerda de quem olha)" },
      { id: "aq", nome: "Saída de água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Largura/4", y: "0", z: "Profundidade*0.45", papel: "saida", dir: dv("piso"), origemPos: "interpretado", aConferir: "ligações na base do aparelho (a ficha não cota; AF à direita, AQ à esquerda de quem olha)" }
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
      { id: "af", nome: "Entrada de água fria", sistema: "agua_fria", dn: "DN_agua", x: "Largura/4", y: "0", z: "Profundidade*0.45", papel: "entrada", dir: dv("piso"), origemPos: "interpretado", aConferir: "ligações na base do aparelho (a ficha não cota; AF à direita, AQ à esquerda de quem olha)" },
      { id: "aq", nome: "Saída de água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Largura/4", y: "0", z: "Profundidade*0.45", papel: "saida", dir: dv("piso"), origemPos: "interpretado", aConferir: "ligações na base do aparelho (a ficha não cota; AF à direita, AQ à esquerda de quem olha)" }
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
      { id: "af", nome: "Entrada de água fria (ponta da válvula de segurança)", sistema: "agua_fria", dn: "DN_agua", x: "se(Horizontal; Comprimento/4; Diametro/4)", y: "se(Valvula_seguranca; -Valvula_altura; 0)", z: "Diametro/2", papel: "entrada", dir: dv("piso"), origemPos: "catalogo", aConferir: "sentido do tubo (para baixo) assumido pela posição das conexões do manual" },
      { id: "aq", nome: "Saída de água quente", sistema: "agua_quente", dn: "DN_agua", x: "-se(Horizontal; Comprimento/4; Diametro/4)", y: "0", z: "Diametro/2", papel: "saida", dir: dv("piso"), origemPos: "catalogo", aConferir: "sentido do tubo (para baixo) assumido pela posição das conexões do manual" }
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
      { id: "af", nome: "Entrada de água fria", sistema: "agua_fria", dn: "DN_agua", x: "Diametro/4", y: "Altura", z: "Diametro/2", papel: "entrada", dir: dv("cima"), origemPos: "interpretado", aConferir: "ligações no topo (a ficha Orbis não cota)" },
      { id: "aq", nome: "Saída de água quente", sistema: "agua_quente", dn: "DN_agua", x: "-Diametro/4", y: "Altura", z: "Diametro/2", papel: "saida", dir: dv("cima"), origemPos: "interpretado", aConferir: "ligações no topo (a ficha Orbis não cota)" }
    ], material: "Branco" });
  /* registros embutidos: a canopla (Ø) e o castelo com o volante são o volume envolvente de reserva */
  /* reservas pelas FICHAS COTADAS (QV3, rodada final): acabamento DocolBase (canopla Ø 58, projeção 64,9 da parede + 50 de
     embutimento), torneira de mesa Docol Trio (Ø 47,3 × 83 × 154), motobomba Dancor CAM-W4C ½ cv (266 × 156 × 202 = D 170
     + os 32 mm a mais do eixo pela fórmula do conector) — continuam "a conferir" no tipo */
  padrao("hid-registro-gaveta", "Altura", 0.115); padrao("hid-registro-gaveta", "Profundidade", 0.058);
  padrao("hid-registro-pressao", "Altura", 0.115); padrao("hid-registro-pressao", "Profundidade", 0.058);
  padrao("hid-bomba", "Comprimento", 0.266); padrao("hid-bomba", "Largura", 0.156); padrao("hid-bomba", "Altura", 0.202);
  padrao("hid-chuveiro", "Altura", 0.2); padrao("hid-chuveiro", "Profundidade", 0.38);   /* o chuveiro ELÉTRICO segue com estas medidas; o de parede usa as Cl_* (Docol Clássico) */
  padrao("hid-torneira", "Largura", 0.047); padrao("hid-torneira", "Altura", 0.083); padrao("hid-torneira", "Profundidade", 0.154);
  padrao("hid-misturador", "Altura", 0.2); padrao("hid-misturador", "Profundidade", 0.16);

  /* ======================== SANEAMENTO ENTERRADO E EQUIPAMENTOS (06/11/2026) ========================
   * Pedido do Rogério: um hidrossanitário de terceiro modelado DENTRO do sistema, só com famílias, tubos e conexões do sistema —
   * "nada de volumetria esquisita". O CATÁLOGO só tem famílias e tipos GENÉRICOS (o "t-generico" de cada família, com as cotas padrão
   * marcadas "a conferir") e o que vem de FABRICANTE (Bakof, Komeco). As cotas de uma obra (detalhes do projeto de terceiro) NUNCA
   * entram aqui: quem monta o modelo (tools/hid-montar-de-json.js) cria os tipos locais DENTRO do .opbim, lendo-as de um JSON externo.
   * PORTAS DE PROJETO: as caixas e poços recebem tubos em posições que o PROJETO define (não o catálogo). Cada porta é um
   * conjunto de parâmetros de INSTÂNCIA (P1_x, P1_y, P1_z em m no sistema local da família; P1_dn em mm; 0 = porta inexistente)
   * gravados por quem monta o modelo no ponto do traçado. Origem das câmaras enterradas: TOPO DA TAMPA, centro; o corpo desce. */
  var GP = "Portas de projeto";
  function portasProjeto(n, sistema, rotulo) {
    var ps = [], cs = [], i, k;
    for (i = 1; i <= n; i++) {
      k = "P" + i;
      ps.push(X(k + "_x", "comprimento", 0, GP, rotulo + " " + i + ": X local do ponto de ligação (m)"), X(k + "_y", "comprimento", 0, GP, rotulo + " " + i + ": Y local (m; negativo = abaixo do topo)"),
        X(k + "_z", "comprimento", 0, GP, rotulo + " " + i + ": Z local (m)"), X(k + "_dn", "numero", 0, GP, rotulo + " " + i + ": DN do tubo (mm); 0 = porta inexistente"));
      cs.push({ id: "p" + i, nome: rotulo + " " + i, sistema: sistema, dn: k + "_dn", x: k + "_x", y: k + "_y", z: k + "_z", visivel: k + "_dn > 0", porta: "p" + i,
        papel: "entrada", dir: dv("esq"), bidirecional: true, origemPos: "projeto", aConferir: "porta no ponto do traçado do projeto (gravada na instância)" });
    }
    ps.forEach(function (p) { p.instancia = true; });
    return { params: ps, conectores: cs };
  }
  function fichaQ(id, nome, valores, fonte, conferir) {
    var v = JSON.parse(JSON.stringify(valores)); v.Conferir = conferir.join("; "); v.A_conferir = conferir.length > 0;
    return { id: id, nome: nome, valores: v, fonte: fonte, conferir: conferir.slice() };
  }
  var AV_PORTAS = "Portas de projeto: as ligações ficam onde o projeto manda (parâmetros P1…Pn da instância); sem DN a porta não existe.";
  var NOVAS = {};

  /* 1) SUMIDOURO DE ANÉIS DE CONCRETO com envelope de brita 3 e manta geotêxtil */
  var pSum = portasProjeto(2, "esgoto", "Entrada");   /* a ducha (águas servidas) chega em porta; a limpeza do reservatório (pluvial) termina em tela sobre a grelha */
  ESPECS.push({ id: "hid-sumidouro-aneis", nome: "Sumidouro de anéis de concreto (brita 3 e manta geotêxtil)", categoria: "equipamento", sistemas: ["pluvial", "esgoto"], tipos: [], generico: true,
    descricao: "Sumidouro de anéis pré-moldados de concreto com tampa hermética, grelha metálica e envelope de brita 3 envolto em manta geotêxtil (a manta não é desenhada no 3D). Origem = topo da tampa, centro; o corpo desce.",
    avisos: [AV_PORTAS, "A tubulação de LIMPEZA do reservatório descarrega POR CIMA da grelha, sem ligar dentro do sumidouro (nota do projeto): termina numa tela, não numa porta."],
    geo: [G("Diametro_interno", 0.6, [0.3, 2], null, "Ø interno dos anéis"), G("Espessura_anel", 0.1, [0.04, 0.2], null, "Espessura da parede do anel"),
      G("Altura_util", 1, [0.3, 3], null, "Altura útil abaixo da grelha"), G("Altura_anel", 0.5, [0.2, 1], null, "Altura de UM anel pré-moldado"),
      G("Brita_fundo", 0.2, [0, 0.6], null, "Camada de brita sob o fundo"), G("Lado_brita", 1.9, [0.8, 4], null, "Lado do envelope de brita em planta"),
      G("Tampa_esp", 0.05, [0.02, 0.2], null, "Espessura da tampa hermética"), I("Prof_grelha", 0.2, null, "Profundidade da grelha abaixo do topo da tampa (m) — da instância")].concat(pSum.params),
    solidos: [], conectores: pSum.conectores, material: "Concreto", });
  NOVAS["hid-sumidouro-aneis"] = { g: "sumidouro_aneis", p: { Di: "Diametro_interno", E: "Espessura_anel", Hr: "Prof_grelha - Tampa_esp + Altura_util", Ha: "Altura_anel", Hb: "Brita_fundo", Lb: "Lado_brita", Tt: "Tampa_esp", Pg: "Prof_grelha" },
    env: ["0", "-(Prof_grelha + Altura_util + Brita_fundo)", "0", "Lado_brita", "Prof_grelha + Altura_util + Brita_fundo", "Lado_brita"], x: [] };

  /* 2) CÂMARA CILÍNDRICA ENTERRADA — poço de recalque (poço úmido), PV da concessionária, caixa de gradeamento de PRFV */
  var pCil = portasProjeto(3, "esgoto", "Porta");
  ESPECS.push({ id: "hid-camara-cilindrica", nome: "Câmara cilíndrica enterrada (poço de recalque, PV, gradeamento)", categoria: "equipamento", sistemas: ["esgoto"], tipos: [], generico: true,
    descricao: "Poço/caixa cilíndrica enterrada: parede, laje de fundo e tampa. Origem = topo da tampa, centro; o corpo desce Tampa_esp + Profundidade_interna.",
    avisos: [AV_PORTAS],
    geo: [G("Diametro_interno", 0.8, [0.3, 3], null, "Ø interno"), G("Espessura_parede", 0.1, [0.004, 0.3], null, "Espessura da parede"),
      G("Tampa_esp", 0.05, [0.01, 0.3], null, "Espessura da tampa"), G("Laje_fundo", 0.15, [0.004, 0.4], null, "Espessura da laje de fundo"),
      X("Diametro_tampa", "comprimento", 0, "Forma 3D", "Ø da tampa (0 = o externo)"), X("Diametro_base", "comprimento", 0, "Forma 3D", "Ø da laje de base (0 = o externo)"),
      X("PRFV", "simnao", false, "Materiais", "Corpo de PRFV (produto industrializado); não = concreto"),
      I("Profundidade_interna", 1, null, "Do fundo da tampa ao fundo interno (m) — da instância, pelo traçado")].concat(pCil.params),
    solidos: [], conectores: pCil.conectores, material: "Concreto", });
  NOVAS["hid-camara-cilindrica"] = { g: "camara_cil", p: { Di: "Diametro_interno", E: "Espessura_parede", H: "Profundidade_interna", Tt: "Tampa_esp", Hl: "Laje_fundo", Dt: "Diametro_tampa", Db: "Diametro_base", mat: "se(PRFV; 1; 0)" },
    env: ["0", "-(Tampa_esp + Profundidade_interna + Laje_fundo)", "0", "max(Diametro_interno + 2*Espessura_parede; max(Diametro_tampa; Diametro_base))", "Tampa_esp + Profundidade_interna + Laje_fundo", "max(Diametro_interno + 2*Espessura_parede; max(Diametro_tampa; Diametro_base))"], x: [] };

  /* 3) CÂMARA RETANGULAR ENTERRADA — inspeção, gordura especial, quebra de pressão, retenção de sólidos grosseiros */
  var pRet = portasProjeto(4, "esgoto", "Porta");
  ESPECS.push({ id: "hid-camara-retangular", nome: "Caixa retangular enterrada (inspeção, gordura, quebra de pressão, retenção)", categoria: "equipamento", sistemas: ["esgoto"], tipos: [], generico: true,
    descricao: "Caixa de alvenaria/concreto enterrada: 4 paredes, laje de fundo, tampa; septo e grade de barras opcionais. Origem = topo da tampa, centro; X = comprimento interno.",
    avisos: [AV_PORTAS],
    geo: [G("Comprimento_interno", 0.6, [0.3, 3], null, "Comprimento interno (X)"), G("Largura_interna", 0.6, [0.3, 3], null, "Largura interna (Z)"),
      G("Espessura_parede", 0.1, [0.05, 0.4], null, "Espessura da parede"), G("Tampa_esp", 0.05, [0.02, 0.2], null, "Espessura da tampa"), G("Laje_fundo", 0.1, [0.05, 0.3], null, "Laje de fundo"),
      X("Septo", "simnao", false, "Instalação", "Tem septo"), X("Grade", "simnao", false, "Instalação", "Tem grade de barras"),
      I("Profundidade_interna", 0.6, null, "Do fundo da tampa ao fundo interno (m) — da instância"), I("Septo_x", 0, null, "X do septo (m)"),
      I("Septo_fundo", 0.6, null, "Fundo do septo abaixo do topo da tampa (m)"), I("Septo_topo", 0.1, null, "Topo do septo abaixo do topo da tampa (m)"),
      I("Grade_x", 0, null, "X do pé da grade (m)"), I("Grade_angulo", 55, null, "Inclinação da grade em relação à horizontal (graus)"), I("Grade_espacamento", 0.0275, null, "Espaçamento entre as barras (m)")].concat(pRet.params),
    solidos: [], conectores: pRet.conectores, material: "Concreto", });
  NOVAS["hid-camara-retangular"] = { g: "camara_ret", p: { Li: "Comprimento_interno", Wi: "Largura_interna", E: "Espessura_parede", H: "Profundidade_interna", Tt: "Tampa_esp", Hl: "Laje_fundo",
      se: "se(Septo; 1; 0)", sx: "Septo_x", sb: "Septo_fundo", st: "Septo_topo", gr: "se(Grade; 1; 0)", gx: "Grade_x", ga: "Grade_angulo", eg: "Grade_espacamento" },
    env: ["0", "-(Tampa_esp + Profundidade_interna + Laje_fundo)", "0", "Comprimento_interno + 2*Espessura_parede", "Tampa_esp + Profundidade_interna + Laje_fundo", "Largura_interna + 2*Espessura_parede"], x: [] };

  /* 4) RESERVATÓRIO RETANGULAR DE PRFV (paredes inclinadas) — Bakof Tec */
  var pRes = { params: [], conectores: [] };
  [["alimentacao", "agua_fria", "Alimentação (boia)", "entrada"], ["saida", "agua_fria", "Saída (consumo)", "saida"], ["saida2", "agua_fria", "2ª saída (consumo)", "saida"],
    ["extravasor", "pluvial", "Extravasor", "saida"], ["limpeza", "pluvial", "Limpeza", "saida"]].forEach(function (d) {
    var k = "R_" + d[0];
    pRes.params.push(X(k + "_x", "comprimento", 0, GP, d[2] + ": X local (m)"), X(k + "_y", "comprimento", 0, GP, d[2] + ": Y local, acima da base (m)"), X(k + "_z", "comprimento", 0, GP, d[2] + ": Z local (m)"),
      X(k + "_dn", "numero", 0, GP, d[2] + ": DN (mm); 0 = sem tubo nesta porta"));
    pRes.conectores.push({ id: d[0], nome: d[2], sistema: d[1], dn: k + "_dn", x: k + "_x", y: k + "_y", z: k + "_z", visivel: k + "_dn > 0", porta: d[0], papel: d[3], dir: dv("esq"),
      origemPos: "projeto", aConferir: "furo feito na obra no ponto do projeto (a ficha não cota)" });
  });
  pRes.params.forEach(function (p) { p.instancia = true; });
  ESPECS.push({ id: "hid-reservatorio-retangular", nome: "Reservatório retangular de PRFV (paredes inclinadas)", categoria: "equipamento", sistemas: ["agua_fria", "pluvial"], tipos: [], generico: true,
    descricao: "Reservatório retangular de fibra de vidro com paredes inclinadas e tampa. Origem = centro da base; X = comprimento.",
    avisos: [AV_PORTAS, "Extravasor e limpeza: sistema pluvial (descarregam em local visível/sumidouro, nunca no esgoto — nota do projeto)."],
    geo: [G("Comprimento_topo", 1.88, [0.5, 5], null, "Comprimento no topo"), G("Largura_topo", 1.23, [0.4, 4], null, "Largura no topo"),
      G("Comprimento_fundo", 1.53, [0.4, 5], null, "Comprimento no fundo"), G("Largura_fundo", 0.88, [0.3, 4], null, "Largura no fundo"),
      G("Altura", 0.68, [0.3, 3], null, "Altura total"), G("Tampa_altura", 0.06, [0.01, 0.3], null, "Altura da tampa"), G("Raio_canto", 0.2, [0.01, 0.6], null, "Raio de canto em planta (topo)")].concat(pRes.params),
    solidos: [], conectores: pRes.conectores, material: "Azul",
    tiposFicha: [fichaQ("t-bakof-tec-1000", "Bakof Tec 1.000 L (PRFV)",
      { Fabricante: "Bakof", Linha: "Bakof Tec", Codigo: "Bakof Tec 1000 L", Descricao_ficha: "Reservatório Bakof Tec 1000 L — compr. 1,88 m, largura 1,23 m, altura 0,68 m (tabela do fabricante)", Link_ficha: "https://www.bakof.com.br", Arquivo_ficha: "", Edicao_ficha: "tabela do fabricante Bakof Tec — a conferir na ficha vigente",
        Pagina_ficha: 1, Pagina_cotas: 1, Cotas_ficha: "topo 1,88 × 1,23; fundo 1,53 × 0,88; altura 0,68", Comprimento_topo: 1.88, Largura_topo: 1.23, Comprimento_fundo: 1.53, Largura_fundo: 0.88, Altura: 0.68, Tampa_altura: 0.06, Raio_canto: 0.2 },
      "Bakof (fabricante), tabela do reservatório Bakof Tec — a conferir na ficha vigente", ["ficha do fabricante (conferir a edição vigente)", "Tampa_altura e Raio_canto (a tabela não traz: de desenho)", "posição dos furos (feitos na obra, no ponto do projeto)"])] });
  NOVAS["hid-reservatorio-retangular"] = { g: "reservatorio_ret", p: { Lt: "Comprimento_topo", Wt: "Largura_topo", Lb: "Comprimento_fundo", Wb: "Largura_fundo", H: "Altura", Ht: "Tampa_altura", Rc: "Raio_canto" },
    env: ["0", "0", "0", "Comprimento_topo + 0.06", "Altura", "Largura_topo + 0.06"], x: [] };

  /* 5) PRESSURIZADOR COMPACTO (gabinete vertical) — Komeco TP 825 */
  ESPECS.push({ id: "hid-pressurizador-compacto", nome: "Pressurizador compacto (gabinete vertical)", categoria: "equipamento", sistemas: ["agua_fria"], tipos: [], generico: true,
    descricao: "Pressurizador compacto de gabinete vertical, sobre base nivelada. Origem = centro da base.",
    avisos: [AV_CONECTOR, "Posição das bocas de entrada e saída no gabinete: a ficha não cota (no alto, de desenho)."],
    geo: [G("Largura", 0.165, [0.1, 0.6], null, "Largura (L)"), G("Altura", 0.42, [0.2, 1], null, "Altura (A)"), G("Profundidade", 0.21, [0.1, 0.6], null, "Profundidade (P)"),
      DN("DN_entrada", null, "DN da entrada"), DN("DN_saida", null, "DN da saída"), X("Peso_kg", "numero", 0, GP, "Peso líquido (kg) da ficha")],
    solidos: [], material: "Branco",
    conectores: [
      { id: "entrada", nome: "Entrada (sucção)", sistema: "agua_fria", dn: "DN_entrada", x: "0", y: "Altura + 0.035", z: "-Profundidade/4", papel: "succao", dir: dv("cima"), origemPos: "desenho", aConferir: "a ficha não cota a posição da boca" },
      { id: "saida", nome: "Saída (recalque)", sistema: "agua_fria", dn: "DN_saida", x: "0", y: "Altura + 0.035", z: "Profundidade/4", papel: "recalque", dir: dv("cima"), origemPos: "desenho", aConferir: "a ficha não cota a posição da boca" }],
    tiposFicha: [fichaQ("t-komeco-tp825-g2", "Komeco TP 825 (G2) — 165 × 420 × 210 mm, 7,6 kg, conexões 1\"",
      { Fabricante: "Komeco", Linha: "TP 820/825 G2", Codigo: "TP 825", Descricao_ficha: "Pressurizador TP 825: dimensões L × A × P 165 × 420 × 210 mm, peso líquido 7,6 kg, conexões de entrada/saída 1\"",
        Link_ficha: "https://www.komeco.com.br/arquivos/datasheet/bombas-pressurizadores/pressurizadores/datasheet-bomba-tp-820-825.pdf", Edicao_ficha: "datasheet TP 820/825 G2 (Komeco) e boletim BTAQC 002/17", Pagina_ficha: 1, Pagina_cotas: 1,
        Cotas_ficha: "165 × 420 × 210 mm; 7,6 kg; conexões 1\"", Largura: 0.165, Altura: 0.42, Profundidade: 0.21, Peso_kg: 7.6 },
      "Komeco, datasheet TP 820/825 G2 (komeco.com.br) e boletim técnico BTAQC 002/17", ["posição das bocas no gabinete (a ficha não cota)", "geração do produto: conferir a geração (G2) na ficha vigente do fabricante"])] });
  NOVAS["hid-pressurizador-compacto"] = { g: "pressurizador", p: { L: "Largura", H: "Altura", Pp: "Profundidade" }, env: ["0", "0", "0", "Largura", "Altura + 0.035", "Profundidade"], x: [] };

  /* 6) MOTOBOMBA SUBMERSÍVEL — LOTE 3-5 (13/11/2026): tipos pela ficha KSB KRT Drainer (Catálogo Linha Housing 17/04/18, p.36, "Dimensionais":
     A = largura total até a face do recalque lateral, B = altura total, C = eixo do recalque DN2 acima da base). O "t-generico" (projeto antigo)
     continua com a caixa de reserva e o recalque no topo; nos tipos da ficha a saída é LATERAL e sobe por uma curva de 90° (o desenho de instalação,
     item 8 da mesma página): o conector "recalque" fica no topo da curva, para cima, como antes. */
  ESPECS.push({ id: "hid-bomba-submersivel", nome: "Motobomba submersível (drenagem e águas servidas)", categoria: "equipamento", sistemas: ["esgoto"], tipos: [], generico: true,
    descricao: "Motobomba submersível no fundo do poço úmido. Origem = centro da base; o recalque sai pela lateral (+X) e sobe por uma curva de 90° (tipos da ficha KSB) ou pelo topo (genérico).",
    avisos: ["Tipo genérico: MEDIDA A CONFERIR (caixa de reserva). Tipos KSB KRT Drainer: A, B, C e o recalque pela ficha; o diâmetro do corpo é leitura do desenho (a ficha não cota). Esgoto bruto: conferir a passagem de sólidos exigida.", AV_CONECTOR],
    geo: [G("Largura", 0.24, [0.1, 0.8], null, "Largura (X) — letra A da ficha (até a face do recalque)"), G("Profundidade", 0.18, [0.1, 0.8], null, "Profundidade (Z) — diâmetro do corpo"), G("Altura", 0.46, [0.2, 1.5], null, "Altura total — letra B da ficha"),
      DN("DN_recalque", null, "DN do recalque"),
      X("Saida_lateral", "simnao", false, "Dimensões", "Recalque lateral com curva de 90° (ficha KSB); não = boca no topo (genérico)"),
      X("Cota_recalque", "comprimento", 0, "Dimensões", "Eixo do recalque lateral acima da base — letra C da ficha")],
    solidos: [], material: "Ferro fundido",
    conectores: [{ id: "recalque", nome: "Recalque", sistema: "esgoto", dn: "DN_recalque", x: "se(Saida_lateral; Largura/2 + 0.05; 0)", y: "se(Saida_lateral; Cota_recalque + 0.09; Altura)", z: "0", papel: "recalque", dir: dv("cima"), origemPos: "desenho", aConferir: "genérico: medida a conferir; KSB: letras A e C da ficha + curva de 90°" }],
    tiposFicha: [["fi-m500", "KRT Drainer FI M 500 (1/2 cv, monofásica)", 0.222, 0.41, 0.13, "35", 13.5], ["fi-m1000", "KRT Drainer FI M 1000.1 (1 cv, monofásica)", 0.222, 0.464, 0.13, "35", 18.5],
      ["f1500", "KRT Drainer F 1500 (1,5 cv, trifásica)", 0.32, 0.37, 0.141, "9", 28], ["k1500", "KRT Drainer K 1500 (1,5 cv, trifásica)", 0.334, 0.429, 0.211, "35", 36]].map(function (m) {
      return fichaQ("t-ksb-krt-" + m[0], "KSB " + m[1] + " — A " + Math.round(m[2] * 1000) + " × B " + Math.round(m[3] * 1000) + " mm, recalque 2\" BSP",
        { Fabricante: "KSB", Linha: "KRT Drainer (submersível)", Codigo: m[1], Descricao_ficha: "Bomba submersível KSB " + m[1] + ", passagem de sólidos " + m[5] + " mm, recalque 2\" BSP",
          Link_ficha: "https://www.ksb.com/pt-br", Arquivo_ficha: "KSB - Catalogo Linha Housing 170418.pdf", Edicao_ficha: "Catálogo Linha Housing (17/04/2018), p.36", Pagina_ficha: 36, Pagina_cotas: 36,
          Cotas_ficha: "A=" + Math.round(m[2] * 1000) + "; B=" + Math.round(m[3] * 1000) + "; C=" + Math.round(m[4] * 1000) + "; recalque 2\" BSP; peso " + String(m[6]).replace(".", ",") + " kg",
          Largura: m[2], Altura: m[3], Profundidade: Math.round(m[2] * 0.62 * 1000) / 1000, Saida_lateral: true, Cota_recalque: m[4], DN_recalque: 50 },   /* hid:ok cotas da ficha KSB KRT Drainer p.36 */
        "KSB, Catálogo Linha Housing 17/04/2018, p.36 (Dimensionais): A " + Math.round(m[2] * 1000) + ", B " + Math.round(m[3] * 1000) + ", C " + Math.round(m[4] * 1000) + " mm",
        ["Profundidade (diâmetro do corpo: 0,62 × A, leitura do desenho; a ficha não cota)", "curva de 90° no recalque: desenho de instalação da ficha (item 8)"]);
    }) });
  /* 8) DUCHA ELÉTRICA ZAGONEL — LOTE 3-5 (13/11/2026, pedido do Rogério com as fichas): Moment Eletrônica e Ducali Eletrônica pelo desenho
     cotado e pelas características técnicas das fichas do fabricante (js/hidlouca.js geoDuchaZagonel). Origem = o ponto de água. */
  var FZ_MOMENT = "https://www.zagonel.com.br/uploads/file-1774627382583-930118458.pdf", FZ_DUCALI = "https://novo.zagonel.com.br/uploads/file-1762438448021-923946897.pdf";
  function tipoZagonel(id, nome, mod, W, Pp, H, Hc, pot, tensao, codigo, pVazao) {
    var moment = mod === 1;
    return fichaQ(id, nome, { Fabricante: "Zagonel", Linha: moment ? "Moment Eletrônica" : "Ducali Eletrônica", Codigo: codigo,
      Descricao_ficha: (moment ? "Ducha Moment Eletrônica " : "Ducha Ducali Eletrônica ") + pot + " W " + tensao + " V, branca",
      Link_ficha: moment ? FZ_MOMENT : FZ_DUCALI, Edicao_ficha: moment ? "Ficha técnica Zagonel Rev. 03 — mar/2026" : "Ficha técnica Zagonel Rev. 02 — jun/2024", Pagina_ficha: 3, Pagina_cotas: 8,
      Cotas_ficha: moment ? "182 × 350 (planta); 126 (cabeça); 360 (até o puxador); espalhador Ø150 (75 furos Ø0,9)" : "476 × 265; 237 (corpo); 458 (total); espalhador 210 × 130 (76 furos Ø1)",
      /* revisão 13/11: a pressão MÍNIMA que o cálculo de cores usa é a "mínima para vazão (3 L/min)" da ficha (Moment 16 kPa, Ducali 10 kPa);
         a de ACIONAMENTO (10 kPa nas duas) fica no campo próprio */
      Pressao_min_kPa: pVazao, Pressao_acionamento_kPa: 10, Pressao_max_kPa: 400, Pressao_texto: "acionamento 10 kPa; mínima para vazão (3 L/min) " + pVazao + " kPa; estática máxima 400 kPa",
      Eletrico: true,
      Modelo: mod, Largura: W, Profundidade: Pp, Altura: H, Altura_cabeca: Hc, Potencia_W: pot, Tensao_V: tensao, DN_agua: 20 },
      "Zagonel, ficha técnica " + (moment ? "Moment Eletrônica (Rev.03)" : "Ducali Eletrônica (Rev.02)") + ": desenho cotado p.8 e características técnicas p.3", ["DN_agua (rosca 1/2\" = DN 20 soldável: regra de ligação)"]);
  }
  ESPECS.push({ id: "hid-ducha-eletrica", nome: "Ducha elétrica (Zagonel Moment / Ducali, Lorenzetti Acqua Duo)", categoria: "aparelho", sistemas: ["agua_fria", "eletrica"], tipos: [], generico: true,
    descricao: "Ducha elétrica de parede pelo desenho cotado do fabricante. Origem = o ponto de água (rosca de 1/2\"); a ducha sai da parede para +Z.",
    avisos: ["Tipos com a ficha Zagonel (desenho p.8 e características p.3). Raios, espessura da placa e braços: proporção do desenho."],
    geo: [G("Largura", 0.182, [0.1, 0.6], null, "Largura (ficha)"), G("Profundidade", 0.35, [0.15, 0.7], null, "Da parede à frente (ficha)"), G("Altura", 0.36, [0.1, 0.8], null, "Altura total até a ponta do puxador (ficha)"),
      X("Altura_cabeca", "comprimento", 0.126, "Dimensões", "Moment: topo do espalhador ao fundo da câmara (126); Ducali: topo ao fundo do corpo (237)"),
      X("Modelo", "numero", 1, "Dimensões", "1 = Zagonel Moment (espalhador redondo, entrada no topo); 2 = Zagonel Ducali (placa, entrada atrás); 3 = Lorenzetti Acqua Duo (espalhador quadrado, entrada atrás). Acima de 1,5 = entrada atrás (geometria e conector usam a mesma régua)"),
      X("Pressao_acionamento_kPa", "numero", 0, "Dados", "Pressão mínima de ACIONAMENTO da resistência (kPa) — ficha; a mínima para vazão vai em Pressao_min_kPa"),
      X("Eletrico", "simnao", true, "Dados", "Aparelho elétrico (entra na carga do quadro como chuveiro elétrico — js/eleaparelhosdados.js)"),
      X("Potencia_W", "numero", 0, "Dados", "Potência nominal (W) da ficha"), X("Tensao_V", "numero", 0, "Dados", "Tensão nominal (V)"), DN("DN_agua", null, "DN da água fria")],
    solidos: [], material: "Branco",
    conectores: [
      { id: "af", nome: "Água fria (rosca no topo)", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "0", z: "0.03", visivel: "Modelo < 1.5", papel: "entrada", dir: dv("cima"), origemPos: "catalogo", aConferir: "rosca de 1/2\" no topo (desenho da ficha)" },
      { id: "af_parede", nome: "Água fria (rosca na parede)", sistema: "agua_fria", dn: "DN_agua", x: "0", y: "0", z: "0", visivel: "Modelo > 1.5", papel: "entrada", dir: dv("parede"), origemPos: "catalogo", aConferir: "rosca de 1/2\" atrás do corpo (desenho da ficha)" }],
    tiposFicha: [
      tipoZagonel("t-zagonel-moment-7500-220", "Zagonel Moment Eletrônica 7.500 W 220 V — 182 × 350 × 360 mm", 1, 0.182, 0.35, 0.36, 0.126, 7500, 220, "DMOEL75220BR03", 16),
      tipoZagonel("t-zagonel-moment-6800-220", "Zagonel Moment Eletrônica 6.800 W 220 V — 182 × 350 × 360 mm", 1, 0.182, 0.35, 0.36, 0.126, 6800, 220, "DMOEL68220BR03", 16),
      tipoZagonel("t-zagonel-ducali-7500-220", "Zagonel Ducali Eletrônica 7.500 W 220 V — 476 × 265 × 458 mm", 2, 0.265, 0.476, 0.458, 0.237, 7500, 220, "DDCEL75220BR03", 10),
      tipoZagonel("t-zagonel-ducali-6800-220", "Zagonel Ducali Eletrônica 6.800 W 220 V — 476 × 265 × 458 mm", 2, 0.265, 0.476, 0.458, 0.237, 6800, 220, "DDCEL68220BR03", 10),
      tipoZagonel("t-zagonel-ducali-4400-220", "Zagonel Ducali Eletrônica 4.400 W 220 V — 476 × 265 × 458 mm", 2, 0.265, 0.476, 0.458, 0.237, 4400, 220, "DDCEL44220BR03", 10),
      /* FAMÍLIAS R2 (14/11/2026): LORENZETTI ACQUA DUO (linha Acqua Ultra) 7.800 W 220 V. Potência, disjuntor, pressões (10 a 400 kPa) e a
         entrada DN15 (1/2"): manual do FABRICANTE (lorenzetti.com.br/manuais/acquaultra, seção 2 "Especificação", tabela da linha Acqua Ultra:
         127 V 5.500 W; 220 V 6.800 W; 220 V 7.800 W com disjuntor 40 A e cabo 6 mm²). O manual não traz desenho cotado: A × L × P
         228 × 210 × 520 mm seguem do varejo (Ponto Frio / AnalisaMelhor) — FONTE SECUNDÁRIA, marcada em Conferir. */
      fichaQ("t-lorenzetti-acqua-duo-7800-220", "Lorenzetti Acqua Duo Ultra 7.800 W 220 V — 210 × 520 × 228 mm",
        { Fabricante: "Lorenzetti", Linha: "Acqua Duo (Ultra)", Codigo: "Acqua Duo Ultra 7800W 220V", Descricao_ficha: "Ducha eletrônica Acqua Duo Ultra, 7.800 W, 220 V, multitemperatura",
          Link_ficha: "https://www.lorenzetti.com.br/manuais/acquaultra/", Edicao_ficha: "manual Lorenzetti Acqua Ultra (site do fabricante, seção 2: tabela de especificação, lida em 14/11/2026); medidas: Ponto Frio / AnalisaMelhor (varejo)", Pagina_ficha: 2, Pagina_cotas: 0,
          Cotas_ficha: "A × L × P = 228 × 210 × 520 mm (varejo); espalhador quadrado", Pressao_min_kPa: 10, Pressao_acionamento_kPa: 10, Pressao_max_kPa: 400,
          Pressao_texto: "funcionamento de 1,0 a 40 m.c.a. (10 a 400 kPa) — manual Lorenzetti", Eletrico: true,
          Modelo: 3, Largura: 0.21, Profundidade: 0.52, Altura: 0.228, Altura_cabeca: 0.228, Potencia_W: 7800, Tensao_V: 220, DN_agua: 20 },
        "Lorenzetti, manual Acqua Ultra no site do fabricante (potência 7.800 W, disjuntor 40 A, pressões 10–400 kPa, entrada DN15); medidas do varejo (fonte secundária)",
        ["Largura, Profundidade e Altura: medidas do varejo (o manual não traz desenho cotado) — conferir na caixa do produto", "corpo, braço e espessura do espalhador: proporção da foto", "DN_agua (rosca 1/2\" = DN 20 soldável: regra de ligação)"])] });
  NOVAS["hid-ducha-eletrica"] = { g: "ducha_zagonel", p: { W: "Largura", P: "Profundidade", H: "Altura", Hc: "Altura_cabeca", mod: "se(Modelo > 2.5; 3; se(Modelo > 1.5; 2; 1))" },
    env: ["0", "se(Modelo > 1.5; 0.022 - Altura; -0.012 - Altura)", "Profundidade/2", "Largura", "Altura + 0.012", "Profundidade"], x: [] };

  /* 9) TORNEIRA DE BOIA — FAMÍLIAS R2 (14/11/2026): Docol Alta Vazão 1/2" 00032100 pelo desenho cotado (Catálogo Geral Docol, p.253).
     Família solta (a peça da entrada da caixa); a caixa d'água e o barrilete NÃO mudam (o motor continua lançando a entrada pela porta
     "alimentacao" do reservatório). Origem = a ponta da rosca; o tubo chega por −X. */
  ESPECS.push({ id: "hid-torneira-boia", nome: "Torneira de boia (Docol Alta Vazão)", categoria: "acessorio_tubo", sistemas: ["agua_fria"], tipos: [], generico: true,
    descricao: "Torneira de boia de entrada de reservatório. Origem = a ponta da rosca G 1/2\" (passa pela parede da caixa); a boia fica dentro da caixa, em +X.",
    avisos: ["Tipo da ficha: cotas do desenho Docol p.253. Cabeça, porca e degraus da boia: proporção do desenho."],
    geo: [G("Comprimento", 0.1665, [0.1, 0.4], null, "Da ponta da rosca ao fim do regulador (ficha)"), G("Altura", 0.25, [0.12, 0.5], null, "Do topo da cabeça ao fim do tubo de baixo (ficha)"),
      G("Largura", 0.072, [0.04, 0.2], null, "Largura em planta (33 + 39 da ficha)"), DN("DN_entrada", null, "DN da entrada")],
    solidos: [], material: "Branco",
    conectores: [{ id: "entrada", nome: "Entrada (rosca G 1/2\")", sistema: "agua_fria", dn: "DN_entrada", x: "0", y: "0", z: "0", papel: "entrada", dir: dv("esq"), origemPos: "catalogo", aConferir: "ponta da rosca do desenho da ficha" }],
    tiposFicha: [fichaQ("t-docol-00032100", "Docol Torneira de Boia Alta Vazão 1/2\" — 00032100",
      { Fabricante: "Docol", Linha: "Docol Básicos — Torneira de boia", Codigo: "00032100", Descricao_ficha: "Torneira de Boia Alta Vazão 1/2\" (peneira, regulagem de nível, porca de conexão tipo união)",
        Link_ficha: "http://api.aecweb.com.br/cls/catalogos/docol/catalogo_geral_docol.pdf", Arquivo_ficha: "Docol - Catalogo Geral de Produtos.pdf", Edicao_ficha: "Catálogo Geral Docol (AECweb)", Pagina_ficha: 253, Pagina_cotas: 253,
        Cotas_ficha: "166,5; 106; 33 (eixo ao topo); 250 (altura); G 1/2\"; planta 33 + 39", Vazao_L_min: 40, Pressao_texto: "1.200 L em 30 min com pressão dinâmica de 3 kgf/cm² (gráfico da ficha)",
        Comprimento: 0.1665, Altura: 0.25, Largura: 0.072, DN_entrada: 20 },
      "Docol, Catálogo Geral, p.253 (desenho cotado da Torneira de Boia Alta Vazão)", ["DN_entrada (rosca G 1/2\" = DN 20 soldável: regra de ligação)", "Vazao_L_min: 1.200 L / 30 min do gráfico a 300 kPa (não é vazão nominal)"])] });
  NOVAS["hid-torneira-boia"] = { g: "boia", p: { L: "Comprimento", H: "Altura", W: "Largura" }, env: ["Comprimento/2", "0.033*Altura/0.25 - Altura", "0", "Comprimento", "Altura", "Largura"], x: [] };

  /* 7) TELA NA PONTA DO TUBO — saída do extravasor e da limpeza (nota do projeto: "telas ou malhas de material resistente") */
  ESPECS.push({ id: "hid-tela-ponta", nome: "Tela de proteção na ponta do tubo (extravasor / limpeza)", categoria: "equipamento", sistemas: ["pluvial"], tipos: [], generico: true,
    descricao: "Tela ou malha de material resistente na ponta livre do tubo (extravasor em local visível, limpeza sobre a grelha do sumidouro). Origem = ponta do tubo; o tubo chega pelo −X.",
    avisos: ["A área livre das frestas deve passar a da seção interna do tubo (nota do projeto). Produto não especificado: luva + tela de desenho."],
    geo: [DN("DN_tubo", null, "DN do tubo")],
    solidos: [], material: "Inox",
    conectores: [{ id: "tubo", nome: "Tubo", sistema: "pluvial", dn: "DN_tubo", x: "0", y: "0", z: "0", papel: "entrada", dir: dv("esq"), origemPos: "desenho", aConferir: "produto não especificado no projeto" }], });
  GEO_FAM["hid-bomba-submersivel"] = function () {
    /* genérico (Saida_lateral = não): a caixa de reserva de antes. Ficha KSB: corpo redondo (hidráulica embaixo, motor em cima, alça), recalque lateral e curva */
    var L = "Saida_lateral", G0 = "nao(Saida_lateral)", xc = "-Largura/2 + Profundidade/2", R = "Profundidade/2", rr = "max(0.02; DN_recalque/2000 + 0.004)";
    return [cxs("corpo", "Motobomba (volume a conferir)", "0", "0", "0", "Largura", "Altura*0.85", "Profundidade", "Ferro fundido", G0),
      cil("pescoco", "Boca de recalque", "y", "0", "Altura*0.85", "0", rr, "Altura*0.15", "Ferro fundido", G0),
      cxs("alca", "Alça de içamento", "0", "Altura*0.85", "Profundidade*0.3", "Largura*0.6", "Altura*0.1", "0.012", "Aço", G0),
      rev("hidraulica", "Carcaça da hidráulica e pés", xc, "0", "0", [[R + "*0.7", "0"], [R + "*0.98", "0.012"], [R, "Cota_recalque*0.4"], [R, "Cota_recalque + 0.045"], [R + "*0.86", "Cota_recalque + 0.06"]], { mat: "Ferro fundido", vis: L }),
      rev("motor", "Motor (carcaça)", xc, "Cota_recalque + 0.06", "0", [[R + "*0.86", "0"], [R + "*0.86", "(Altura - Cota_recalque)*0.62"], [R + "*0.7", "(Altura - Cota_recalque)*0.7"], ["0", "(Altura - Cota_recalque)*0.72"]], { mat: "Cinza escuro", vis: L }),
      cxs("alca-ksb", "Alça de içamento", xc, "Cota_recalque + 0.06 + (Altura - Cota_recalque)*0.7", "0", "Profundidade*0.55", "Altura - Cota_recalque - 0.06 - (Altura - Cota_recalque)*0.7", "0.014", "Preto", L),
      cil("saida", "Bocal do recalque 2\" BSP", "x", xc + " + " + R + "*0.9", "Cota_recalque", "0", rr, "Largura/2 - (" + xc + " + " + R + "*0.9)", "Ferro fundido", L),
      cil("tubo-curva", "Curva de 90° (trecho horizontal)", "x", "Largura/2", "Cota_recalque", "0", rr + " + 0.004", "0.05 + " + rr, "PVC", L),
      cil("subida", "Curva de 90° (trecho de subida)", "y", "Largura/2 + 0.05", "Cota_recalque - " + rr, "0", rr + " + 0.004", "0.09 + " + rr, "PVC", L)];
  };
  GEO_FAM["hid-tela-ponta"] = function () {
    return [cil("luva", "Luva", "x", "0", "0", "0", "max(0.012; DN_tubo/2000 + 0.004)", "0.04", "PVC"),
      cil("tela", "Tela", "x", "0.04", "0", "0", "max(0.012; DN_tubo/2000 + 0.004)", "0.003", "Inox")];
  };
  Object.keys(NOVAS).forEach(function (k) { GERADA[k] = NOVAS[k]; });
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
    var ZT = "se(Modelo_cuba = 1; max(-Profundidade/2 - 0.05; -Distancia_parede + 0.03); -Profundidade/2 + min(0.08; Profundidade*0.2))";   /* o z da torneira de mesa: js/hidlouca.js geoCuba (zT) */
    var YT = "se(Modelo_cuba = 1; 0; Altura_cuba*se(Modelo_cuba = 2; 0.45; 1))";   /* a base da torneira: o deck da cuba (yTopo) */
    e.solidos = e.solidos.concat([
      /* Lote 1b (28/10/2026): o engate TERMINAVA NO AR (parava na face de trás da cuba, 20 cm da torneira e 22 cm abaixo dela): a conferência da galeria achou a peça solta.
         Agora, com a torneira de MESA, ele corre do ponto da parede até o prumo da torneira (ZT = o z da torneira do js/hidlouca.js geoCuba), segue pelo x até o eixo e SOBE até a
         base da torneira: um tubo contínuo, sem ponta solta. Com a torneira de PAREDE o trecho da parede fica como era (a torneira de parede não é desenhada nesta família). */
      { id: "engate-af", nome: "Engate flexível da água fria (do ponto na parede à torneira)", forma: "cilindro", eixo: "z", x: "Agua_afastamento/2", y: yA, z: "-Distancia_parede", raio: "Engate_diametro/2", altura: "se(Torneira_de_parede; max(0.01; Distancia_parede - Profundidade/2); max(0.01; Distancia_parede + " + ZT + "))", material: "Metal cromado", visivel: vis, naParede: true },
      { id: "engate-aq", nome: "Engate flexível da água quente (do ponto na parede ao misturador)", forma: "cilindro", eixo: "z", x: "-Agua_afastamento/2", y: yA, z: "-Distancia_parede", raio: "Engate_diametro/2", altura: "se(Torneira_de_parede; max(0.01; Distancia_parede - Profundidade/2); max(0.01; Distancia_parede + " + ZT + "))", material: "Metal cromado", visivel: "Agua_quente e (" + vis + ")", naParede: true },
      { id: "engate-af-x", nome: "Engate da água fria: do prumo do ponto ao eixo da torneira", forma: "cilindro", eixo: "x", x: "0", y: yA, z: ZT, raio: "Engate_diametro/2", altura: "Agua_afastamento/2", material: "Metal cromado", visivel: "(" + vis + ") e Torneira_de_parede = 0" },
      { id: "engate-aq-x", nome: "Engate da água quente: do prumo do ponto ao eixo do misturador", forma: "cilindro", eixo: "x", x: "-Agua_afastamento/2", y: yA, z: ZT, raio: "Engate_diametro/2", altura: "Agua_afastamento/2", material: "Metal cromado", visivel: "Agua_quente e (" + vis + ") e Torneira_de_parede = 0" },
      { id: "engate-sobe", nome: "Engate: sobe até a base da torneira", forma: "cilindro", eixo: "y", x: "0", y: yA, z: ZT, raio: "Engate_diametro/2", altura: "max(0.01; " + YT + " - (" + yA + "))", material: "Metal cromado", visivel: "(" + vis + ") e Torneira_de_parede = 0" }]);
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
    /* LOTE 3-5 (13/11/2026): de onde vêm vazão e pressões do aparelho de consumo — "ficha" (catálogo do fabricante) ou "norma" (NBR 5626) — e a fonte escrita */
    /* FAMÍLIAS CAIXAS: o link do produto no fabricante e o PREÇO DE REFERÊNCIA (lido, com loja e data) — informativo: o orçamento
       segue pela composição SINAPI/mapa de sempre (nunca este número) */
    P("Link_fabricante", "texto", "", "Página do produto no site do fabricante"), P("Preco_referencia", "numero", 0, "Preço de referência lido (R$; 0 = não lido) — NÃO entra no orçamento"),
    P("Preco_fonte", "texto", "", "Onde o preço de referência foi lido (loja/anúncio)"), P("Preco_data", "texto", "", "Data da leitura do preço de referência (AAAA-MM-DD)"),
    P("Origem_hidraulica", "texto", "", "ficha = valores do catálogo do fabricante; norma = mínimo da NBR 5626 (sem ficha); vazio = não é aparelho de consumo"),
    P("Fonte_hidraulica", "texto", "", "Documento, item/tabela e página de cada valor hidráulico do tipo"),
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
    /* FAMÍLIAS REAIS (07/11/2026): ficha sem letras de desenho, mas com as cotas em mm nos dados (ex.: caixa de descarga embutida
       Hydra: largura, altura e espessura da vista cotada) — também são cota de catálogo */
    if (!o.length) Object.keys(it.dados || {}).forEach(function (k) { if (/^(largura|altura|espessura|comprimento|profundidade|diametro)_mm$/.test(k) && typeof it.dados[k] === "number") o.push(k.replace(/_mm$/, "") + "=" + it.dados[k]); });
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

  /* FAMÍLIAS REAIS (07/11/2026, pedido do Rogério: tirar o "a conferir" das louças com a cota do catálogo e a fonte): o sentido
     de cada LETRA do desenho Celite foi conferido nas vistas cotadas (Catálogo Geral Celite, pág. 21 — bacia com caixa acoplada
     54359/54510; pág. 19 — bacia convencional 54321; as demais páginas usam o mesmo desenho). Caixa acoplada: A comprimento, B
     largura, C altura da borda, D altura total, E projeção da parede, F parede → eixo do esgoto, G afastamento lateral da água,
     H altura da água, J largura da caixa, L profundidade da caixa. Convencional: A comprimento, B largura, C altura da borda,
     D projeção, E parede → eixo do esgoto, F altura da entrada de água (no eixo). Só vale para o tipo cujo desenho tem o MESMO
     arranjo (as cotas de instalação nas faixas desse desenho) e, para posição de ponto de ligação, só quando o valor que o
     sistema já usa É o da letra (nada muda de lugar). */
  var DESENHO_CELITE = {
    "hid-bacia-caixa-acoplada": { ok: function (D) { return D.F >= 300 && D.F <= 305 && D.H === 200 && (D.G === 150 || D.G === 190) && D.L > 100 && D.L < 260; },   /* hid:ok faixas e mm do desenho Celite */
      letra: { Comprimento: "A", Largura: "B", Altura_borda: "C", Altura_total: "D", Prof_caixa: "L" }, pos: { Esgoto_parede: "F", Agua_altura: "H", Agua_lateral: "G" } },
    "hid-bacia-convencional": { ok: function (D) { return D.E === 260 && D.F === 330 && D.A > 400 && D.A < 700; },   /* hid:ok faixas e mm do desenho Celite */
      letra: { Comprimento: "A", Largura: "B", Altura_borda: "C" }, pos: { Esgoto_parede: "E", Agua_altura: "F", Agua_lateral: "0" } }   /* hid:ok faixas e mm do desenho Celite */
  };
  function conferidoNoDesenho(famId, nome, v, it) {
    var R = DESENHO_CELITE[famId], D = it && it.dim; if (!R || !D || !R.ok(D)) return false;
    if (R.letra[nome]) return true;
    var L = R.pos[nome]; if (!L) return false;
    var alvo = L === "0" ? 0 : D[L] / 1000; return typeof v === "number" && typeof alvo === "number" && Math.abs(Math.abs(v) - alvo) < 0.0005;   /* hid:ok faixas e mm do desenho Celite */
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
        if (r.origem !== "catalogo" && !conferidoNoDesenho(e.id, g.nome, r.v, it)) conferir.push(g.nome + (g.ehDN ? " (DN vindo de regra/interpretação)" : r.letra ? " (letra " + r.letra + ")" : (r.origem === "interpretado" ? " (interpretado da ficha: " + r.v + ")" : " (regra de instalação Deca)")));
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

  /* LOTE 3-5 (13/11/2026, pedido do Rogério: "torneira demais — qualidade, não quantidade"): torneira e misturador mostram UM tipo por USO
     (o 1º modelo do catálogo em cada uso, na ordem do catálogo); os outros ~290 ficam com `legado: true` — fora da lista do seletor e do painel, mas DEFINIDOS:
     o projeto salvo com qualquer um deles abre igual (mesmo id, mesmos conectores e quantitativo) e a busca do seletor ainda os acha. */
  var USOS_ENXUTOS = {
    "hid-torneira": [/Lavatório de Mesa$/, /Lavatório de Mesa Bica Alta$/, /Lavatório de Parede$/, /Lavatório de Mesa PressMatic/, /Cozinha de Mesa 1\/2”$/, /Cozinha de Parede 1\/2” e 3\/4”$/, /Jardim\/Tanque/, /Longa de Parede/],
    "hid-misturador": [/Misturador para Lavatório de Mesa$/, /Misturador para Lavatório de Mesa Bica Alta$/, /Misturador para Lavatório de Parede$/, /Misturador Monocomando para Lavatório de Mesa$/,
      /Misturador para Cozinha de Mesa( 1\/2”)?$/, /Misturador para Cozinha de Parede( 1\/2” e 3\/4”)?$/, /Misturador Monocomando para Cozinha de Mesa$/, /Misturador para Bidê$/]
  };
  /* LOTE 3-5 (13/11/2026, pedido do Rogério): TODO aparelho de consumo leva vazão, pressão mínima e estática máxima — alimentam o cálculo de
     pressão em cores do barrilete. Valor da ficha vence; o que a ficha não traz vem da NORMA, com a fonte escrita e Origem_hidraulica = "norma":
       pressão dinâmica mínima no ponto 10 kPa (NBR 5626:2020, 6.9.2) e estática máxima 400 kPa (6.9.5) — dados-fonte/hidro/normas/nbr5626-2020.json;
       vazão de projeto da NBR 5626:1998 Tabela A.1 (excluída na edição 2020; lida via TCC UFRGS 2022 — fonte SECUNDÁRIA) — dados-fonte/hidro/normas/nbr5626.json.
     Nada de valor inventado: aparelho sem linha na Tabela A.1 (aquecedor, boiler) fica sem vazão de norma e diz isso na fonte. */
  var CONSUMO = {   /* família → vazão de projeto (L/s) da Tabela A.1, por nome do tipo quando a linha depende do uso */
    "hid-bacia-caixa-acoplada": 0.15, "hid-caixa-descarga-embutida": 0.15, "hid-bacia-convencional": 1.7, "hid-valvula-descarga": 1.7,
    "hid-lavatorio-coluna": 0.15, "hid-lavatorio-suspenso": 0.15, "hid-cuba-apoio": 0.15, "hid-pia-cozinha": 0.25, "hid-tanque-lavar": 0.25, "hid-mictorio": 0.15,
    "hid-chuveiro": 0.2, "hid-ducha-higienica": 0.2, "hid-ducha-eletrica": 0.1,   /* Tabela A.1: "Chuveiro elétrico — registro de pressão" 0,10 L/s */
    "hid-torneira": function (n) { return /Cozinha|Pia/i.test(n) ? 0.25 : /Jardim|Tanque|Longa/i.test(n) ? 0.2 : 0.15; },
    "hid-misturador": function (n) { return /Bidê/i.test(n) ? 0.1 : /Cozinha/i.test(n) ? 0.25 : /Banheira/i.test(n) ? 0.3 : /Chuveiro|Ducha/i.test(n) ? 0.2 : 0.15; },
    "hid-aquecedor-gas": null, "hid-aquecedor-eletrico-passagem": null, "hid-boiler-eletrico": null, "hid-boiler-gas": null
  };
  var F_PMIN = "NBR 5626:2020, 6.9.2 (pressão dinâmica mínima no ponto de utilização, 10 kPa)", F_PMAX = "NBR 5626:2020, 6.9.5 (pressão estática máxima, 400 kPa)",
      F_VAZ = "NBR 5626:1998, Tabela A.1 (vazão de projeto; via RHEINHEIMER, TCC UFRGS 2022, p.33 — fonte secundária)";
  function hidraulica(fam) {
    if (!Object.prototype.hasOwnProperty.call(CONSUMO, fam.id)) return;
    var regra = CONSUMO[fam.id];
    fam.tipos.forEach(function (t) {
      var v = t.valores, fontes = [], deNorma = false, temFicha = v.Vazao_L_min > 0 || v.Pressao_min_kPa > 0 || v.Pressao_max_kPa > 0;
      if (!(v.Vazao_L_min > 0)) {
        var q = typeof regra === "function" ? regra(String(t.nome)) : regra;
        if (q > 0) { v.Vazao_L_min = Math.round(q * 60 * 100) / 100; fontes.push("vazão " + v.Vazao_L_min + " L/min: " + F_VAZ); deNorma = true; }
        else fontes.push("vazão: a Tabela A.1 não tem linha para este aparelho — usar a da ficha do modelo");
      } else fontes.push("vazão " + v.Vazao_L_min + " L/min: ficha do fabricante");
      if (!(v.Pressao_min_kPa > 0)) { v.Pressao_min_kPa = 10; fontes.push("pressão mínima 10 kPa: " + F_PMIN); deNorma = true; } else fontes.push("pressão mínima " + v.Pressao_min_kPa + " kPa: ficha do fabricante");
      if (!(v.Pressao_max_kPa > 0)) { v.Pressao_max_kPa = 400; fontes.push("estática máxima 400 kPa: " + F_PMAX); deNorma = true; } else fontes.push("pressão máxima " + v.Pressao_max_kPa + " kPa: ficha do fabricante");
      v.Origem_hidraulica = deNorma ? (temFicha ? "ficha + norma" : "norma") : "ficha";
      v.Fonte_hidraulica = fontes.join("; ");
    });
  }
  /* FAMÍLIAS CAIXAS (14/11/2026, pedido do Rogério: "entra no fabricante, acha o modelo, tem os preços, coloca o link, pega a foto"): os tipos
     Tigre das caixas múltiplas vinham do catálogo predial SEM cotas (tudo "padrão de reserva"). As cotas são as da FICHA do fabricante:
       Caixa de Gordura DN 100 (100019323): ficha técnica Tigre "Caixas de Gordura" (nov/2018, p.1 desenho e p.4 tampa) e a página do produto
       em tigre.com.br (tabela: D = 295, E = 392, h = 449, C = 5, Dn1 50, Dn2 75, Dn3 100); tampa reforçada A = B = 348, porta-tampa C = 388, E = 50.
       Caixa de Inspeção DN 100 (27801056): AECweb (Tigre) 218 × 300 mm, 3 entradas DN 100 + saída DN 100; a mesma tampa e porta-tampa da linha.
     O PREÇO é de REFERÊNCIA (parâmetro informativo — o orçamento segue pela composição SINAPI/mapa): o valor lido, a loja e a data. */
  var FICHA_TIGRE = {
    "hid-caixa-gordura": { tipo: /^t-tigre-100019323/, v: { Corpo_diametro: 0.295, Corpo_altura: 0.399, Largura_bocais: 0.392, Tampa_lado: 0.348, Tampa_esp: 0.05, Porta_tampa_lado: 0.388, Bocas_abaixo_topo: 0.05,
        Altura: 0.1, DN_entrada: 75, DN_saida: 100, Diametro: 0.3, Estilo_tigre: true, Volume_retencao_L: 18,   /* DN_entrada 75 = a entrada Dn2 da ficha (as outras duas são DN 50, Dn1); a família tem um DN de entrada só */
        Cotas_ficha: "D=295; E=392; h=449; C=5 cm; Dn1=50; Dn2=75; Dn3=100; tampa A=B=348, porta-tampa C=388, E=50 (ficha Tigre nov/2018 + tigre.com.br)",
        Link_fabricante: "https://www.tigre.com.br/produto/caixa-de-gordura-dn-100", Link_ficha: "https://tigresite.s3.amazonaws.com/fichastecnica/default/files/produtos/ficha-tecnica/FT_Caixa%20de%20Gordura-compactado%20%281%29.pdf",
        Edicao_ficha: "ficha técnica Tigre Caixas de Gordura (nov/2018) e página do produto (lida em 14/11/2026)", Pagina_ficha: 1, Pagina_cotas: 4,
        Preco_referencia: 373.7, Preco_fonte: "Amazon BR, anúncio Caixa de gordura DN 100 Tigre (busca do Rogério, print de 14/11/2026)", Preco_data: "2026-11-14" },
      conferir: ["Corpo_altura (h = 449 menos a tampa de 50: leitura do desenho)", "Altura (ponto de saída a C = 5 cm do topo do corpo + a tampa)", "DN_entrada 75 = a entrada Dn2 da ficha; as duas laterais (Dn1) são DN 50"] },
    "hid-caixa-inspecao": { tipo: /^t-tigre-27801056/, v: { Corpo_diametro: 0.3, Corpo_altura: 0.218, Largura_bocais: 0.42, Largura_bocais_z: 0.42, Tampa_lado: 0.348, Tampa_esp: 0.05, Porta_tampa_lado: 0.388,
        Bocas_abaixo_topo: 0.109, Altura: 0.159, DN_entrada: 100, DN_saida: 100, Diametro: 0.3, Estilo_tigre: true,
        Cotas_ficha: "218 x 300 mm; 3 entradas DN 100 + saída DN 100 (AECweb/Tigre); tampa A=B=348, porta-tampa C=388, E=50 (ficha Tigre da linha)",
        Link_fabricante: "https://www.aecweb.com.br/produto/caixa-de-inspecao-tigre/12995", Link_ficha: "https://www.aecweb.com.br/produto/caixa-de-inspecao-tigre/12995",
        Edicao_ficha: "AECweb (página da Tigre, lida em 14/11/2026); tampa: ficha técnica Tigre da linha (nov/2018, p.4)", Pagina_ficha: 1, Pagina_cotas: 1,
        Preco_referencia: 0, Preco_fonte: "sem preço lido do modelo 27801056 (as ofertas da busca são de outros modelos)", Preco_data: "" },
      conferir: ["Largura_bocais e Largura_bocais_z (Ø 300 + as bolsas DN 100: leitura da foto, a ficha não cota)", "Bocas_abaixo_topo (meia altura do corpo: foto)"] }
  };
  /* FAMÍLIAS CAIXAS (14/11/2026, "uma fonte só"): as caixas sifonadas Amanco do catálogo levam as cotas da MESMA tabela que o motor de bocas
     (js/hidbocas.js) e a peça do traçado (js/biminstgeo.js cotasPeca) usam — js/biminstgeodados.js pecas.caixa_sifonada (ficha Amanco
     "caixas sifonadas e ralos", p.8): Ø do corpo, altura, hSaida (eixo da saída acima do fundo), DN e número de entradas. As entradas ficam
     a DN/2 + 5 mm abaixo do topo do corpo (a regra do js/hidbocas.js). */
  function dadosPecas() { var D = global.HidGeoDados || (typeof require === "function" ? (function () { try { return require("./biminstgeodados.js"); } catch (e) { return null; } })() : null); return (D && (D.pecas || (global.HidGeoDados && global.HidGeoDados.pecas))) || null; }
  function fichaSifonada(fam) {
    if (fam.id !== "hid-caixa-sifonada") return;
    var tab = (dadosPecas() || {}).caixa_sifonada; if (!tab) return;
    /* decisão da coordenação (14/11): o tipo ANTIGO fica igual ao master (legado: fora da lista, abre e desenha como antes — o projeto salvo
       não solta cano); a geometria da ficha vai num TIPO NOVO "<id>-ficha", logo antes dele (o padrão da família). Trocar uma caixa antiga: js/hidcaixaficha.js */
    var novos = [];
    fam.tipos.forEach(function (t0) {
      var v0 = t0.valores; if (v0.Fabricante !== "Amanco Wavin" || !/SIFONADA/i.test(String(v0.Descricao_ficha || "")) || !(v0.Largura > 0) || !(v0.Altura > 0)) return;
      if (!tab[Math.round(v0.Largura * 1000) + "x" + Math.round(v0.Altura * 1000) + "x" + Math.round(v0.DN_saida || 0)]) return;
      var t = JSON.parse(JSON.stringify(t0)); t.id = t0.id + "-ficha"; t.nome = t0.nome + " — medidas da ficha"; t0.legado = true; novos.push([t0, t]);
    });
    novos.forEach(function (par) { var i = fam.tipos.indexOf(par[0]); fam.tipos.splice(i, 0, par[1]); });   /* antes do antigo: o 1º tipo da família (o padrão de quem coloca) é o da ficha */
    novos.map(function (par) { return par[1]; }).forEach(function (t) {
      var v = t.valores; if (v.Fabricante !== "Amanco Wavin" || !/SIFONADA/i.test(String(v.Descricao_ficha || "")) || !(v.Largura > 0) || !(v.Altura > 0)) return;   /* a caixa SECA não é a peça da tabela (sem sifão) */
      var ct = tab[Math.round(v.Largura * 1000) + "x" + Math.round(v.Altura * 1000) + "x" + Math.round(v.DN_saida || 0)]; if (!ct) return;
      v.Peca_ficha = true; v.Diametro_corpo = ct.diam / 1000; v.Saida_altura = Math.round(ct.hSaida * 10) / 10000;
      v.Entrada_prof = Math.round(ct.dnEntrada / 2 + 5) / 1000; v.DN_entrada = ct.dnEntrada; v.Entradas = ct.entradas;
      v.Cotas_ficha = "Ø corpo " + ct.diam + "; altura " + ct.alt + "; saída a " + ct.hSaida + " do fundo (DN " + ct.dnSaida + "); " + ct.entradas + " entradas DN " + ct.dnEntrada + "; fecho " + ct.fecho + " mm (ficha Amanco p." + ct.pag + ", js/biminstgeodados.js)";
      var conf = ["Diametro_corpo e Saida_altura: leitura do desenho cotado da ficha (p." + ct.pag + ") — a mesma do motor de bocas"];
      v.Conferir = conf.join("; "); v.A_conferir = true; t.conferir = conf;
    });
  }
  function fichaTigre(fam) {
    var F = FICHA_TIGRE[fam.id]; if (!F) return;
    /* revisão 14/11 (C1): o tipo Tigre do catálogo fica IGUAL ao master (legado: projeto salvo com tubo nas bocas antigas não solta cano nem
       muda o cálculo — DN, retenção); as cotas da ficha vão num tipo NOVO "<id>-ficha", posto ANTES dele (o padrão de quem coloca a caixa) */
    var pares = [];
    fam.tipos.forEach(function (t0) { if (F.tipo.test(t0.id) && !/-ficha$/.test(t0.id)) pares.push(t0); });
    pares.forEach(function (t0) {
      var t = JSON.parse(JSON.stringify(t0)); t.id = t0.id + "-ficha"; t.nome = t0.nome + " — medidas da ficha"; t0.legado = true;
      Object.keys(F.v).forEach(function (k) { t.valores[k] = F.v[k]; });
      t.valores.Conferir = F.conferir.join("; "); t.valores.A_conferir = true; t.conferir = F.conferir.slice();
      t.fonte = "Tigre: " + F.v.Edicao_ficha;
      fam.tipos.splice(fam.tipos.indexOf(t0), 0, t);
      fam.tipoIcone = t.id;   /* a miniatura do seletor sai do tipo da ficha Tigre (tools/hid-icones.html) */
    });
  }
  function enxugar(fam) {
    var usos = USOS_ENXUTOS[fam.id]; if (!usos) return;
    var fica = {};
    usos.forEach(function (re) {
      var t = fam.tipos.filter(function (x) { return re.test(String(x.nome).replace(/^[^—]*— /, "").trim()); })[0];
      if (t) fica[t.id] = 1;
    });
    fam.tipos.forEach(function (t) { if (!fica[t.id]) t.legado = true; });
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
    /* LOTE 1b (28/10/2026): tipos de FICHA escritos à mão (peça sem catálogo em dados-fonte/hidro/catalogos): vêm ANTES do genérico, que continua existindo
       (projeto antigo grava "t-generico"). Cada um leva fabricante, documento, página e a cota lida. */
    arr(e.tiposFicha).forEach(function (tf) { fam.tipos.push({ id: tf.id, nome: tf.nome, valores: JSON.parse(JSON.stringify(tf.valores)), fonte: tf.fonte, avisos: arr(tf.avisos).slice(), conferir: arr(tf.conferir).slice() }); });
    if (e.generico) fam.tipos.push(montarGenerico(e));
    else {
      var its = [];
      e.tipos.forEach(function (t) { Cat.porTipo(t).forEach(function (x) { its.push(x); }); });
      its.forEach(function (x) { fam.tipos.push(montarTipo(e, x)); });
    }
    enxugar(fam);
    fichaTigre(fam);
    fichaSifonada(fam);
    hidraulica(fam);
    return fam;
  }

  /* nome do aparelho no programa de necessidades (HidPrograma): bacia com caixa E bacia com válvula são "bacia".
     null = peça de rede/acessório, não conta como aparelho. Quem mapeia família → chave do HidNormas lê este campo. */
  var APARELHO = { "hid-bacia-caixa-acoplada": "bacia", "hid-bacia-convencional": "bacia", "hid-lavatorio-coluna": "lavatorio", "hid-lavatorio-suspenso": "lavatorio",
    "hid-cuba-apoio": "lavatorio", "hid-pia-cozinha": "pia", "hid-tanque-lavar": "tanque", "hid-mictorio": "mictorio", "hid-chuveiro": "chuveiro",
    "hid-ducha-higienica": "ducha_higienica", "hid-torneira": null, "hid-misturador": null,
    "hid-ducha-eletrica": "chuveiro" };   /* LOTE 3-5 (revisão 13/11): a ducha elétrica Zagonel entra no programa de aparelhos como chuveiro (peso e vazão) */
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

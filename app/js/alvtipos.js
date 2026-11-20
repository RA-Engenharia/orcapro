/* =====================================================================
 * alvtipos.js — TIPO DE PAREDE: as camadas com espessura real.
 *
 * Motor PURO (Node-testável, ES5). Espessuras em MILÍMETROS (é assim que
 * se especifica revestimento), geometria em metros.
 *
 * Isto é a estrutura do tipo ("Editar tipo → Estrutura"): a parede não tem uma
 * espessura digitada, ela tem CAMADAS, e a espessura é a soma delas. É a
 * diferença entre a parede crua ("14 cm") e a parede executiva:
 *
 *   bloco 14 cm  +  chapisco 5 + reboco 20 (dentro)
 *                +  chapisco 5 + emboço 25 (fora)   =  19,5 cm de verdade
 *
 * Sem isso: o 3D fica com a espessura errada, o revestimento não tem
 * área, e o peso — que o usuário pediu por parede, por nível e total —
 * não existe.
 *
 * O QUE ESTE MOTOR NÃO FAZ: casar código SINAPI. Isso é do
 * paredecebola.js, que já explode a parede em SERVIÇOS com código real
 * vindo do Escopo Inteligente. Aqui é a GEOMETRIA e o PESO das camadas.
 * Os dois se encontram pelo nome da camada.
 *
 * FONTES (verificáveis, nada inventado):
 *   · NBR 13749:2013 — espessuras admissíveis de revestimento de argamassa:
 *       parede interna  5 a 20 mm · parede externa 20 a 30 mm · teto ≤ 20 mm
 *   · NBR 7200:1998 — execução de revestimento de argamassa
 *   · NBR 6120:2019 — pesos específicos aparentes (Tabela 1 e 2)
 *   · NBR 6136-1:2026 — bloco vazado de concreto (via blocos.js; a 6136:2016 foi cancelada em 02/2026; conferida em 21/10/2026)
 * Onde o valor é PRÁTICA e não norma, está escrito assim no campo `fonte`.
 *
 * Teste: node tools/test-alvtipos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js). Este módulo é puro — o
     gate o roda em Node, onde `Util` não existe — então a regra vem copiada.
     ⚠ E CÓPIA APODRECE CALADA: as duas versões curtas que existiam neste
     projeto erram em direções OPOSTAS, e as duas já moveram dinheiro:
     `replace(/\./g,"")` lê "1234.56" como 123456 (×100); tratar o ponto só
     quando há vírgula lê "1.850.000" como 1,85 (÷1.000.000).
     A paridade com o `Util.parseNum` real é cobrada em tools/test-numbr.js. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, "");
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else { var iP = s.lastIndexOf("."); s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1); }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }

  var AlvTipos = {

    /* ---------------------------------------------------------------
     * PESOS ESPECÍFICOS — NBR 6120:2019, em kg/m³.
     * (a norma dá em kN/m³; aqui já convertido por 1 kN/m³ ≈ 102 kg/m³)
     * --------------------------------------------------------------- */
    PESO: {
      argamassa_cimento_areia:    2100,  /* 21,0 kN/m³ */
      argamassa_cal_cimento_areia: 1900, /* 19,0 kN/m³ */
      argamassa_gesso:            1250,  /* 12,5 kN/m³ */
      gesso:                      1250,
      ceramica:                   1800,  /* 18,0 kN/m³ */
      porcelanato:                2300,  /* prática — mais denso que a cerâmica comum */
      concreto_simples:           2400,
      concreto_armado:            2500,
      graute:                     2400,
      tinta:                        60   /* prática — desprezível na estrutura, entra por completude */
    },

    /* ---------------------------------------------------------------
     * NBR 13749:2013 — o que é espessura ADMISSÍVEL
     * --------------------------------------------------------------- */
    LIMITES: {
      interna: { min: 5, max: 20, fonte: "NBR 13749:2013" },
      externa: { min: 20, max: 30, fonte: "NBR 13749:2013" },
      teto:    { min: 5, max: 20, fonte: "NBR 13749:2013" }
    },

    /* ---------------------------------------------------------------
     * CAMADAS DE ACABAMENTO — o vocabulário brasileiro.
     * `e` = espessura em mm (padrão) · `porFace` = existe em cada face
     * `servico` = a chave que o paredecebola.js usa para casar o SINAPI
     * --------------------------------------------------------------- */
    CAMADAS: {
      chapisco:      { rotulo: "Chapisco",              e: 5,  material: "argamassa_cimento_areia",     traco: "1:3 (cimento : areia)",                 servico: "Chapisco",              fonte: "NBR 7200 — prática 3 a 5 mm" },
      emboco:        { rotulo: "Emboço",                e: 20, material: "argamassa_cal_cimento_areia", traco: "1:2:8 (cimento : cal : areia)",         servico: "Emboço",                fonte: "NBR 13749" },
      reboco:        { rotulo: "Reboco",                e: 5,  material: "argamassa_cal_cimento_areia", traco: "1:2:9 (cimento : cal : areia)",         servico: "Reboco",                fonte: "NBR 13749" },
      massa_unica:   { rotulo: "Massa única",           e: 20, material: "argamassa_cal_cimento_areia", traco: "1:2:8 (cimento : cal : areia)",         servico: "Massa única (reboco)",  fonte: "NBR 13749 — emboço e reboco numa camada só" },
      gesso_liso:    { rotulo: "Gesso liso",            e: 5,  material: "gesso",                       traco: "gesso em pó + água",                    servico: "Revestimento em gesso", fonte: "prática — só interno, não pega umidade" },
      massa_corrida: { rotulo: "Massa corrida PVA",     e: 1,  material: "tinta",                       traco: "massa PVA pronta",                      servico: "Massa corrida PVA",     fonte: "prática" },
      massa_acrilica:{ rotulo: "Massa acrílica",        e: 1,  material: "tinta",                       traco: "massa acrílica pronta",                 servico: "Massa acrílica",        fonte: "prática — resiste a intempérie" },
      pintura_latex: { rotulo: "Pintura látex PVA",     e: 0,  material: "tinta",                       traco: "2 demãos",                              servico: "Pintura látex",         fonte: "espessura desprezível" },
      pintura_acril: { rotulo: "Pintura acrílica",      e: 0,  material: "tinta",                       traco: "2 demãos",                              servico: "Pintura acrílica",      fonte: "espessura desprezível" },
      textura:       { rotulo: "Textura acrílica",      e: 2,  material: "tinta",                       traco: "textura pronta",                        servico: "Textura acrílica",      fonte: "prática" },
      ceramica:      { rotulo: "Revestimento cerâmico", e: 15, material: "ceramica",                    traco: "placa 8 mm + argamassa colante AC-II",  servico: "Revestimento cerâmico", fonte: "prática — placa + colante" },
      porcelanato:   { rotulo: "Porcelanato",           e: 18, material: "porcelanato",                 traco: "placa 10 mm + argamassa colante AC-III", servico: "Porcelanato",          fonte: "prática — placa + colante" },
      /* WOOD FRAME (20/11/2026, js/woodframequadro.js): as camadas de fora para dentro do sistema leve de madeira. Espessuras = as do pedido do
         Rogério (siding/cimentícia 10, ripa 20, OSB 11,1 ou 9,5, gesso 12,5); membrana e barreira de vapor entram com 0,2 mm (filme, só para
         ter posição e linha na planta). `hach` = o desenho da camada na planta (js/desenho2d.js). Peso: sem valor de norma → fica de fora (0). */
      cimenticia_10: { rotulo: "Placa cimentícia 10 mm",           e: 10,   material: "cimenticia",       traco: "placa cimentícia 10 mm", servico: "Placa cimentícia 10 mm",                  fonte: "pedido RA (Wood Frame); espessura comercial usual — conferir o fabricante", hach: "cimenticia" },
      siding:        { rotulo: "Siding 10 mm",                     e: 10,   material: "siding",           traco: "réguas de siding",      servico: "Siding (fachada Wood Frame)",             fonte: "pedido RA (Wood Frame) — conferir o fabricante", hach: "cimenticia" },
      camara_ripa_20:{ rotulo: "Câmara ventilada (ripa 20 mm)",     e: 20,   material: "madeira_ripa",     traco: "ripa 20 mm",            servico: "Ripa da câmara ventilada",                fonte: "pedido RA (Wood Frame)", hach: "ripa" },
      membrana_hidrofuga: { rotulo: "Membrana hidrófuga (água e vento)", e: 0.2, material: "membrana",      traco: "membrana respirável",   servico: "Membrana hidrófuga",                      fonte: "pedido RA (Wood Frame) — espessura de filme, só para a posição na planta", hach: "membrana" },
      osb:           { rotulo: "OSB 11,1 mm",                      e: 11.1, material: "osb",              traco: "chapa OSB",             servico: "Chapa de OSB (contraventamento)",         fonte: "pedido RA (Wood Frame): 11,1 mm, ou 9,5 mm pelo parâmetro do tipo (wf.osbE)", hach: "osb" },
      barreira_vapor:{ rotulo: "Barreira de vapor",                e: 0.2,  material: "membrana",         traco: "filme de barreira de vapor", servico: "Barreira de vapor",                  fonte: "pedido RA (Wood Frame) — opcional; espessura de filme", hach: "vapor" },
      gesso_acart:   { rotulo: "Gesso acartonado 12,5 mm",         e: 12.5, material: "gesso_acartonado", traco: "chapa ST 12,5 mm",      servico: "Gesso acartonado 12,5 mm",                fonte: "pedido RA (Wood Frame)", hach: "gesso" },
      gesso_acart_ru:{ rotulo: "Gesso acartonado RU 12,5 mm",      e: 12.5, material: "gesso_acartonado", traco: "chapa RU 12,5 mm (resistente à umidade)", servico: "Gesso acartonado RU 12,5 mm", fonte: "pedido RA (Wood Frame) — área molhada", hach: "gesso" },
      impermeabilizacao_wf: { rotulo: "Impermeabilização (área molhada)", e: 2, material: "impermeabilizante", traco: "manta ou membrana líquida", servico: "Impermeabilização de parede de área molhada", fonte: "pedido RA (Wood Frame) — 2 mm é espessura nominal; conferir o sistema do fabricante", hach: "imper" }
    },

    /* ---------------------------------------------------------------
     * NÚCLEOS — o miolo estrutural ou de vedação.
     * `bloco` aponta para a família do blocos.js, quando houver.
     * --------------------------------------------------------------- */
    /* ATENÇÃO ao campo `peso`: aqui ele é MASSA ESPECÍFICA, em kg/m³ — a
     * mesma unidade da tabela PESO acima. No blocos.js, `peso` é kg POR
     * PEÇA. Foi essa ambiguidade que produziu o bloco cerâmico dez vezes
     * leve; por isso cada núcleo declara a unidade. */
    NUCLEOS: {
      /* `alv` / `alvPorFuncao`: a FAMÍLIA DE ASSENTAMENTO (js/alvunidades.js) — é por ela que a parede crua mostra
         os blocos como assentados (js/alvassentamento3d.js) e o assentamento conta as peças. */
      bloco_concreto_14:  { rotulo: "Bloco de concreto 14 cm",  e: 140, familia: "39-14", peso: null, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6136-1:2026 Tabela 2 — família 15 × 40 (39), largura 140 mm", alvPorFuncao: { estrutural: "bc-M15-39", vedacao: "bc-M15-ved" } },
      bloco_concreto_14_29: { rotulo: "Bloco de concreto 14 cm (família 29)", e: 140, familia: "29", peso: null, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6136-1:2026 Tabela 2 — família 15 × 30 (29), 140 × 190 × 290", alv: "bc-M15-29" },
      bloco_concreto_19:  { rotulo: "Bloco de concreto 19 cm",  e: 190, familia: "39-19", peso: null, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6136-1:2026 Tabela 2 — família 20 × 40 (39), largura 190 mm", alvPorFuncao: { estrutural: "bc-M20-39", vedacao: "bc-M20-ved" } },
      /* familia: null de propósito — não existe família de 9 cm no catálogo.
         Apontava para a "29", que é de 14 cm de largura: no dia em que o peso
         fosse ligado, a divisória de 9 receberia carga de parede de 14 (+55%). */
      bloco_concreto_9:   { rotulo: "Bloco de concreto 9 cm",   e: 90,  familia: null,    peso: null, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6136-1:2026 Tabelas 2 e 4 — família 10 × 40, largura 90 mm, classe C", alv: "bc-M10-ved" },
      /* 13 kN/m³ × 102 ≈ 1300 kg/m³. Estava 130 — dez vezes leve, e saindo
         com selo de "peso completo". Uma parede cerâmica de 14 cm, 3,0 × 2,8 m,
         era anunciada com 153 kg de nucleo quando o certo sao 1.528,8 kg
         (2.344,6 kg com o revestimento das duas faces). */
      bloco_ceramico_14:  { rotulo: "Bloco cerâmico 14 cm",     e: 140, familia: null,    peso: 1300, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6120:2019 — alvenaria de bloco cerâmico vazado ≈ 13 kN/m³", alv: "cv-9f-14" },
      bloco_ceramico_9:   { rotulo: "Bloco cerâmico 9 cm",      e: 90,  familia: null,    peso: 1300, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6120:2019", alv: "cv-8f-9" },
      /* 20/10/2026 — as unidades como se assentam no Brasil (js/alvunidades.js): a espessura do núcleo é a LARGURA real da peça */
      cer_8f_9:        { rotulo: "Cerâmico 8 furos 9×19×19 (furos na horizontal)", e: 90,  familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019 (bloco cerâmico vazado ≈ 13 kN/m³); peça: SINAPI 7271", alv: "cv-8f-9" },
      cer_8f_9_29:     { rotulo: "Cerâmico 8 furos 9×19×29", e: 90, familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019; peça: SINAPI 7268", alv: "cv-8f-9-29" },
      cer_6f_9:        { rotulo: "Cerâmico 6 furos 9×14×19 em pé", e: 90,  familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019; peça: SINAPI 7267", alv: "cv-6f-9" },
      cer_6f_deitado:  { rotulo: "Cerâmico 6 furos 9×14×19 deitado (parede de 14)", e: 140, familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019; SINAPI 103334 (bloco deitado)", alv: "cv-6f-9-deitado" },
      cer_9f_11:       { rotulo: "Cerâmico 9 furos 11,5×14×24", e: 115, familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019; peça: SINAPI 44459", alv: "cv-9f-11" },
      cer_9f_14:       { rotulo: "Cerâmico 9 furos 14×19×29", e: 140, familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019; peça: SINAPI 44462", alv: "cv-9f-14" },
      cer_9f_19:       { rotulo: "Cerâmico 9 furos 19×19×29", e: 190, familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019; peça: SINAPI 44464", alv: "cv-9f-19" },
      cer_est_14:      { rotulo: "Cerâmico estrutural 14×19×29", e: 140, familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019 (≈ 13 kN/m³ — conferir o estrutural na ficha); peça: SINAPI 34586", alv: "ce-29" },
      cer_est_14_39:   { rotulo: "Cerâmico estrutural 14×19×39", e: 140, familia: null, peso: 1300, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019; peça: SINAPI 34588", alv: "ce-39" },
      tijolo_macico_10: { rotulo: "Tijolo maciço 5×10×20 (deitado)", e: 100, familia: null, peso: 1800, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019 Tabela 1 — cerâmica 18 kN/m³ (o mesmo do PESO.ceramica); peça: SINAPI 7258", alv: "tm-10" },
      tijolinho_11:    { rotulo: "Tijolinho laminado aparente 5,5×11×23", e: 110, familia: null, peso: 1800, unidade: "kg/m3", tipo: "bloco", fonte: "NBR 6120:2019 Tabela 1 — cerâmica 18 kN/m³ (o laminado de 21 furos é mais leve — conferir ficha); peça: SINAPI 34401", alv: "tl-11" },
      concreto_armado_15: { rotulo: "Parede de concreto 15 cm", e: 150, familia: null,    peso: 2500, unidade: "kg/m3", tipo: "concreto", fonte: "NBR 6120:2019 — concreto armado 25 kN/m³" },
      drywall_70:         { rotulo: "Drywall montante 70 mm",   e: 95,  familia: null,    peso: 280,  unidade: "kg/m3", tipo: "seco",   fonte: "prática — 70 mm + 2 chapas de 12,5 mm" },
      /* BLOCOK (módulo à parte, js/blocokexec.js): painel 90×90 de EPS com 2 faces de
         microconcreto de 1,5 cm. Massa específica APARENTE da peça = peso da peça ÷
         (0,81 m² × espessura): 38/45/50/62 kg (tabela de franqueado — ver o
         cabeçalho do js/blocokexec.js). Pilaretes, vergas e cintas embutidos são
         somados à parte pelo motor do Blocok, não aqui. */
      /* WOOD FRAME (js/woodframequadro.js): o núcleo é o QUADRO de madeira (montantes + guias) com lã entre eles. `e` = a profundidade do montante
         (89 = 38×89; 64 = 38×64). Sem `peso`: não há massa específica de norma para o conjunto — o peso fica pendente (nunca inventado). */
      wf_89: { rotulo: "Quadro de madeira 38×89 + lã", e: 89, familia: null, peso: null, unidade: "kg/m3", tipo: "woodframe", fonte: "pedido RA (Wood Frame): montante 38×89; a seção bruta do catálogo Nibra é 50×100 — confirmar o beneficiamento com o fornecedor" },
      wf_64: { rotulo: "Quadro de madeira 38×64 + lã", e: 64, familia: null, peso: null, unidade: "kg/m3", tipo: "woodframe", fonte: "pedido RA (Wood Frame): montante 38×64 (divisória interna não portante)" },
      blocok_10: { rotulo: "Blocok 10 cm (painel EPS)", e: 100, familia: null, peso: 469, unidade: "kg/m3", tipo: "blocok", modulo: "blocok", fonte: "38 kg ÷ (0,81 m² × 0,10 m) — franqueado Blocok" },
      blocok_13: { rotulo: "Blocok 13 cm (painel EPS)", e: 130, familia: null, peso: 427, unidade: "kg/m3", tipo: "blocok", modulo: "blocok", fonte: "45 kg ÷ (0,81 m² × 0,13 m) — franqueado Blocok" },
      blocok_15: { rotulo: "Blocok 15 cm (painel EPS)", e: 150, familia: null, peso: 412, unidade: "kg/m3", tipo: "blocok", modulo: "blocok", fonte: "50 kg ÷ (0,81 m² × 0,15 m) — franqueado Blocok (laudo UFMG: ~45 kg)" },
      blocok_20: { rotulo: "Blocok 20 cm (painel EPS)", e: 200, familia: null, peso: 383, unidade: "kg/m3", tipo: "blocok", modulo: "blocok", fonte: "62 kg ÷ (0,81 m² × 0,20 m) — franqueado Blocok" }
    },

    /* ---------------------------------------------------------------
     * TIPOS PREDEFINIDOS — o que o usuário pediu: "configurações
     * predefinidas para os tipos de parede e acabamentos mais usuais no
     * Brasil". Cada um é uma receita completa e editável.
     * `dentro`/`fora` são as pilhas de camadas de cada face.
     * --------------------------------------------------------------- */
    TIPOS: {
      "est-14-int": {
        rotulo: "Estrutural · bloco 14 · duas faces internas",
        funcao: "estrutural", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "Parede interna de alvenaria estrutural. Massa única (emboço e reboco numa camada só) é o mais usado em obra corrente."
      },
      "est-14-fachada": {
        rotulo: "Estrutural · bloco 14 · fachada",
        funcao: "estrutural", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "emboco", "massa_acrilica", "pintura_acril"],
        notaFora: "A face externa vai a 25 mm de emboço porque a NBR 13749 exige de 20 a 30 mm em parede externa.",
        nota: "Face externa com massa e pintura acrílicas — resistem a chuva e sol."
      },
      "est-19-fachada": {
        rotulo: "Estrutural · bloco 19 · fachada",
        funcao: "estrutural", nucleo: "bloco_concreto_19",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "emboco", "massa_acrilica", "pintura_acril"],
        nota: "Bloco de 19 cm — usado quando a carga ou a altura pede mais espessura."
      },
      "ved-14-int": {
        rotulo: "Vedação · bloco 14 · interna",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "Vedação em bloco de concreto — não recebe carga da estrutura."
      },
      "ved-9-int": {
        rotulo: "Vedação · bloco 9 · divisória interna",
        funcao: "vedacao", nucleo: "bloco_concreto_9",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "Divisória leve. Não use em parede que recebe armário suspenso pesado sem reforço."
      },
      "ved-14-molhada": {
        rotulo: "Vedação · bloco 14 · área molhada (banho/cozinha)",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "emboco", "ceramica"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "Face molhada com cerâmica sobre emboço. Sem massa corrida embaixo de cerâmica — a massa PVA não é base para colante."
      },
      "ved-14-fachada": {
        rotulo: "Vedação · bloco 14 · fachada",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "emboco", "massa_acrilica", "pintura_acril"],
        nota: "Vedação de fachada."
      },
      "ved-14-fachada-ceramica": {
        rotulo: "Vedação · bloco 14 · fachada com cerâmica",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "emboco", "ceramica"],
        nota: "Fachada revestida — pastilha ou cerâmica de fachada sobre emboço."
      },
      "cer-14-int": {
        rotulo: "Vedação · bloco cerâmico 14 · interna",
        funcao: "vedacao", nucleo: "bloco_ceramico_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "O bloco cerâmico furado é o mais comum na vedação da obra corrente brasileira."
      },
      /* BLOCOK — sem chapisco nem reboco: acabamento direto sobre a peça depois do
         tratamento de juntas (vídeo oficial da franquia, 11/06/2026). Cerâmica colada
         direto. Só aparecem com o módulo Blocok liberado (`modulo`). */
      "blk-20-fachada": {
        rotulo: "Blocok 20 · fachada (recebe laje)", funcao: "vedacao", nucleo: "blocok_20", modulo: "blocok",
        dentro: ["massa_corrida", "pintura_latex"], fora: ["massa_acrilica", "pintura_acril"],
        nota: "Peça de 20 cm: o pilar embutido tem 15 cm — é a que pode receber laje (NBR 6118 13.2.3 com γn)."
      },
      "blk-15-fachada": {
        rotulo: "Blocok 15 · fachada", funcao: "vedacao", nucleo: "blocok_15", modulo: "blocok",
        dentro: ["massa_corrida", "pintura_latex"], fora: ["massa_acrilica", "pintura_acril"],
        nota: "Fechamento. O pilarete embutido (10 cm) só trava a parede ao vento — não recebe laje."
      },
      "blk-15-int": {
        rotulo: "Blocok 15 · interna", funcao: "vedacao", nucleo: "blocok_15", modulo: "blocok",
        dentro: ["massa_corrida", "pintura_latex"], fora: ["massa_corrida", "pintura_latex"],
        nota: "Parede interna sem acabamento de argamassa."
      },
      "blk-13-int": {
        rotulo: "Blocok 13 · interna", funcao: "vedacao", nucleo: "blocok_13", modulo: "blocok",
        dentro: ["massa_corrida", "pintura_latex"], fora: ["massa_corrida", "pintura_latex"],
        nota: "Divisória SEM porta/janela, entre paredes nas duas pontas, até 4,0 m, encunhada sob a laje: o concreto embutido de 8 cm não comporta verga, pilarete nem cinta (NBR 6118 13.2.2)."
      },
      "blk-13-molhada": {
        rotulo: "Blocok 13 · área molhada", funcao: "vedacao", nucleo: "blocok_13", modulo: "blocok",
        dentro: ["ceramica"], fora: ["massa_corrida", "pintura_latex"],
        nota: "Cerâmica colada direto na peça. Mesmas limitações da 13 cm: sem vão, pontas travadas, até 4,0 m."
      },
      "blk-10-div": {
        rotulo: "Blocok 10 · divisória leve", funcao: "vedacao", nucleo: "blocok_10", modulo: "blocok",
        dentro: ["massa_corrida", "pintura_latex"], fora: ["massa_corrida", "pintura_latex"],
        nota: "Não aceita concreto embutido: só divisória SEM vão, entre paredes travadas, até 4,0 m, encunhada sob a laje."
      },
      /* WOOD FRAME (20/11/2026, js/woodframequadro.js): camadas de fora para dentro (a lista é do núcleo para a face; a foto do tipo inverte a de fora).
         `wf` = os parâmetros do TIPO (Editar tipo): espac (mm entre eixos dos montantes), montante [espessura, profundidade] em mm, osbE (mm),
         canto ("3montantes" | "bloco"). A seção do montante e a profundidade do quadro andam juntas (89 ↔ wf_89, 64 ↔ wf_64). */
      "wf-ext": {
        rotulo: "Wood Frame · externa (cimentícia + OSB + gesso)",
        funcao: "estrutural", nucleo: "wf_89", wf: { espac: 400, montante: [38, 89], osbE: 11.1, canto: "3montantes" },
        dentro: ["gesso_acart"],
        fora:   ["osb", "membrana_hidrofuga", "camara_ripa_20", "cimenticia_10"],
        nota: "Fachada: placa cimentícia 10 mm, câmara ventilada de 20 mm, membrana hidrófuga, OSB 11,1 mm, quadro 38×89 com lã e gesso acartonado 12,5 mm. Montantes a 400 mm (parâmetro do tipo)."
      },
      "wf-ext-vapor": {
        rotulo: "Wood Frame · externa com barreira de vapor",
        funcao: "estrutural", nucleo: "wf_89", wf: { espac: 400, montante: [38, 89], osbE: 11.1, canto: "3montantes" },
        dentro: ["barreira_vapor", "gesso_acart"],
        fora:   ["osb", "membrana_hidrofuga", "camara_ripa_20", "cimenticia_10"],
        nota: "Igual à externa, com barreira de vapor entre a lã e o gesso (opcional — clima e projeto decidem)."
      },
      "wf-ext-siding": {
        rotulo: "Wood Frame · externa com siding",
        funcao: "estrutural", nucleo: "wf_89", wf: { espac: 400, montante: [38, 89], osbE: 11.1, canto: "3montantes" },
        dentro: ["gesso_acart"],
        fora:   ["osb", "membrana_hidrofuga", "camara_ripa_20", "siding"],
        nota: "Fachada com siding de 10 mm no lugar da placa cimentícia."
      },
      "wf-ext-ru": {
        rotulo: "Wood Frame · externa, gesso RU (área molhada por dentro)",
        funcao: "estrutural", nucleo: "wf_89", wf: { espac: 400, montante: [38, 89], osbE: 11.1, canto: "3montantes" },
        dentro: ["gesso_acart_ru"],
        fora:   ["osb", "membrana_hidrofuga", "camara_ripa_20", "cimenticia_10"],
        nota: "Fachada cujo lado de dentro é banheiro/cozinha: gesso acartonado resistente à umidade (RU)."
      },
      "wf-int-89": {
        rotulo: "Wood Frame · interna 38×89 (gesso + lã + gesso)",
        funcao: "vedacao", nucleo: "wf_89", wf: { espac: 400, montante: [38, 89], osbE: 11.1, canto: "3montantes" },
        dentro: ["gesso_acart"], fora: ["gesso_acart"],
        nota: "Divisória interna em quadro 38×89 com lã e gesso 12,5 mm nas duas faces."
      },
      "wf-int-64": {
        rotulo: "Wood Frame · interna 38×64 (gesso + lã + gesso)",
        funcao: "vedacao", nucleo: "wf_64", wf: { espac: 400, montante: [38, 64], osbE: 11.1, canto: "3montantes" },
        dentro: ["gesso_acart"], fora: ["gesso_acart"],
        nota: "Divisória interna leve em quadro 38×64: verga simples (parede não portante)."
      },
      "wf-molhada": {
        rotulo: "Wood Frame · área molhada (cimentícia + impermeabilização)",
        funcao: "vedacao", nucleo: "wf_89", wf: { espac: 400, montante: [38, 89], osbE: 11.1, canto: "3montantes" },
        dentro: ["cimenticia_10", "impermeabilizacao_wf"], fora: ["gesso_acart"],
        nota: "Divisória do banheiro/cozinha: placa cimentícia 10 mm com impermeabilização no lado molhado (dentro) e gesso 12,5 mm do outro lado."
      },
      /* PAREDE CRUA COMO É EXECUTADA (20/10/2026): sem revestimento, a parede mostra os blocos ASSENTADOS
         (js/alvassentamento3d.js) — fiadas, juntas, amarração, verga e contraverga. */
      "crua-cer-8f-9": {
        rotulo: "Crua · cerâmico 8 furos 9×19×19 (sem revestimento)", funcao: "vedacao", nucleo: "cer_8f_9", dentro: [], fora: [],
        nota: "O tijolo baiano de 8 furos, furos na horizontal paralelos à parede. Ponto de partida da vedação corrente; o revestimento entra depois."
      },
      "crua-cer-9f-14": {
        rotulo: "Crua · cerâmico 9 furos 14×19×29 (sem revestimento)", funcao: "vedacao", nucleo: "cer_9f_14", dentro: [], fora: [],
        nota: "Vedação de 14 cm em bloco cerâmico de 9 furos."
      },
      "crua-cer-6f-deitado": {
        rotulo: "Crua · cerâmico 6 furos deitado (parede de 14)", funcao: "vedacao", nucleo: "cer_6f_deitado", dentro: [], fora: [],
        nota: "O 9×14×19 assentado deitado dá parede de 14 cm (SINAPI 103334) — os furos seguem paralelos à parede."
      },
      "crua-cer-est-14": {
        rotulo: "Crua · cerâmico estrutural 14×19×29", funcao: "estrutural", nucleo: "cer_est_14", dentro: [], fora: [],
        nota: "Alvenaria estrutural cerâmica: furos verticais, canaleta na última fiada e nas vergas."
      },
      "crua-bc-14-est": {
        rotulo: "Crua · bloco de concreto estrutural 14 (M15, família 39)", funcao: "estrutural", nucleo: "bloco_concreto_14", dentro: [], fora: [],
        nota: "Bloco aparente: alvéolos verticais, amarração L de 34 e T de 54, canaleta grauteada na verga, contraverga e respaldo."
      },
      "crua-bc-14-29": {
        rotulo: "Crua · bloco de concreto estrutural 14 (M15, família 29)", funcao: "estrutural", nucleo: "bloco_concreto_14_29", dentro: [], fora: [],
        nota: "Família 29: módulo de 15 cm, o canto fecha com o próprio inteiro; bloco e meio (44) no T."
      },
      "crua-tijolinho": {
        rotulo: "Tijolinho aparente 5,5×11×23 (laminado)", funcao: "vedacao", nucleo: "tijolinho_11", dentro: [], fora: [],
        nota: "Tijolinho laminado à vista, assentado deitado; os 21 furos ficam na junta."
      },
      "crua": {
        rotulo: "Parede crua (só o núcleo)",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: [], fora: [],
        nota: "Só o núcleo, sem revestimento. É o ponto de partida — o painel de camadas transforma numa parede executiva."
      }
    },

    /* ================================================================
     * MONTAR — a parede crua vira parede executiva.
     * opts: { nucleo, dentro:[], fora:[], espessuras:{camada:mm},
     *         funcao, rotulo }
     * Aceita também `base:"est-14-fachada"` para partir de um predefinido.
     * ================================================================ */
    montar: function (opts) {
      opts = opts || {};
      var base = opts.base && this.TIPOS[opts.base] ? this.TIPOS[opts.base] : null;
      var nucleoId = opts.nucleo || (base && base.nucleo) || "bloco_concreto_14";
      var nucleo = this.NUCLEOS[nucleoId];
      if (!nucleo) return { ok: false, motivo: "Núcleo desconhecido: " + nucleoId + "." };

      var esp = opts.espessuras || {};
      var self = this;
      /* WOOD FRAME: os parâmetros do tipo (espaçamento, seção do montante, OSB, canto) — o do pedido vale sobre o do tipo base */
      var wfp = null;
      if ((base && base.wf) || opts.wf || nucleo.tipo === "woodframe") {
        wfp = { espac: 400, montante: [38, nucleo.e], osbE: 11.1, canto: "3montantes" };
        [base && base.wf, opts.wf].forEach(function (o) { if (o) for (var kw in o) if (Object.prototype.hasOwnProperty.call(o, kw) && o[kw] != null) wfp[kw] = (kw === "montante" && o[kw] && o[kw].slice) ? o[kw].slice() : o[kw]; });
      }
      function pilha(lista, face) {
        return (lista || []).map(function (id, i) {
          var c = self.CAMADAS[id];
          if (!c) return { id: id, erro: "Camada desconhecida: " + id + "." };
          var e = esp[id] != null ? num(esp[id]) : (esp[face + ":" + id] != null ? num(esp[face + ":" + id]) : c.e);
          /* fachada pede 20 a 30 mm; se o usuário não mexeu, sobe o emboço
             para 25 mm em vez de deixar 20 no limite exato da norma */
          if (face === "fora" && id === "emboco" && esp[id] == null && esp["fora:" + id] == null) e = 25;
          /* WOOD FRAME: o OSB tem a espessura do parâmetro do tipo (11,1 ou 9,5 mm) quando ninguém digitou outra */
          if (id === "osb" && wfp && esp[id] == null && esp[face + ":" + id] == null) e = num(wfp.osbE) || c.e;
          /* o rótulo do OSB diz a espessura que o tipo usa (9,5 ou 11,1 mm), não a do catálogo */
          var rotC = (id === "osb" && wfp) ? "OSB " + String(r2(e)).replace(".", ",") + " mm" : c.rotulo;
          return {
            id: id, ordem: i + 1, face: face, rotulo: rotC,
            espessura: r2(e), material: c.material, traco: c.traco,
            servico: c.servico, fonte: c.fonte,
            pesoM2: r2(e / 1000 * (self.PESO[c.material] || 0))
          };
        });
      }

      var dentro = pilha(opts.dentro || (base && base.dentro) || [], "dentro");
      var fora = pilha(opts.fora || (base && base.fora) || [], "fora");
      var erros = dentro.concat(fora).filter(function (c) { return c.erro; }).map(function (c) { return c.erro; });
      if (erros.length) return { ok: false, motivo: erros[0], erros: erros };

      var eNucleo = opts.espessuraNucleo != null ? num(opts.espessuraNucleo) : (wfp && wfp.montante && num(wfp.montante[1]) > 0 && nucleo.tipo === "woodframe" ? num(wfp.montante[1]) : nucleo.e);
      var somaD = dentro.reduce(function (s, c) { return s + c.espessura; }, 0);
      var somaF = fora.reduce(function (s, c) { return s + c.espessura; }, 0);

      return {
        ok: true,
        id: opts.id || (opts.base || "custom"),
        rotulo: opts.rotulo || (base && base.rotulo) || ("Parede " + nucleo.rotulo),
        funcao: opts.funcao || (base && base.funcao) || "vedacao",
        nucleo: { id: nucleoId, rotulo: nucleo.rotulo, espessura: r2(eNucleo), familia: nucleo.familia, tipo: nucleo.tipo, peso: nucleo.peso, fonte: nucleo.fonte },
        dentro: dentro, fora: fora,
        espessuraNucleo: r2(eNucleo),
        espessuraDentro: r2(somaD),
        espessuraFora: r2(somaF),
        espessura: r2(eNucleo + somaD + somaF),            /* mm */
        espessuraM: r3((eNucleo + somaD + somaF) / 1000),  /* m — é o que o 3D usa */
        wf: wfp,                                           /* WOOD FRAME: parâmetros do quadro (null nos outros tipos) */
        nota: (base && base.nota) || ""
      };
    },

    /* Atalho: pega um predefinido pronto. */
    tipo: function (id, opts) {
      if (!this.TIPOS[id]) return { ok: false, motivo: "Tipo de parede desconhecido: " + id + "." };
      var o = {};
      for (var k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
      o.base = id; o.id = id;
      return this.montar(o);
    },

    /* MÓDULOS À PARTE — tipo com `modulo` só aparece se quem vende o módulo
       disser que está liberado (o js/blocokexecui.js pluga a função). Sem a
       função, fica escondido: módulo pago não vaza na lista de quem não comprou. */
    moduloLiberado: null,
    visivel: function (id) {
      var t = this.TIPOS[id]; if (!t) return false;
      if (!t.modulo) return true;
      try { return typeof this.moduloLiberado === "function" && !!this.moduloLiberado(t.modulo); } catch (e) { return false; }
    },
    listar: function () {
      var self = this, out = [];
      for (var id in this.TIPOS) {
        if (!Object.prototype.hasOwnProperty.call(this.TIPOS, id)) continue;
        if (!this.visivel(id)) continue;
        var t = self.tipo(id);
        out.push({ id: id, rotulo: this.TIPOS[id].rotulo, funcao: this.TIPOS[id].funcao,
                   espessura: t.ok ? t.espessura : null, espessuraM: t.ok ? t.espessuraM : null });
      }
      return out;
    },

    /* ================================================================
     * CONFERIR — as espessuras batem com a NBR 13749?
     * `faceExterna` diz qual pilha está exposta ao tempo.
     * ================================================================ */
    conferir: function (tipo, opts) {
      opts = opts || {};
      var faceExterna = opts.faceExterna || "fora";
      var avisos = [], erros = [], self = this;

      function somaArgamassa(pilha) {
        return pilha.filter(function (c) {
          return c.id === "chapisco" || c.id === "emboco" || c.id === "reboco" || c.id === "massa_unica";
        }).reduce(function (s, c) { return s + c.espessura; }, 0);
      }

      [["dentro", tipo.dentro], ["fora", tipo.fora]].forEach(function (par) {
        var face = par[0], pilha = par[1] || [];
        if (!pilha.length) return;
        var arg = somaArgamassa(pilha);
        if (arg <= 0) return;
        /* o chapisco é camada de aderência, não conta na espessura de
           revestimento que a NBR 13749 limita */
        var semChapisco = arg - pilha.filter(function (c) { return c.id === "chapisco"; })
                                     .reduce(function (s, c) { return s + c.espessura; }, 0);
        var lim = (face === faceExterna) ? self.LIMITES.externa : self.LIMITES.interna;
        var qual = (face === faceExterna) ? "externa" : "interna";
        if (semChapisco < lim.min) {
          avisos.push("A face " + face + " tem " + semChapisco.toFixed(0) + " mm de revestimento; a " + lim.fonte +
                      " pede no mínimo " + lim.min + " mm em parede " + qual + ".");
        }
        if (semChapisco > lim.max) {
          avisos.push("A face " + face + " tem " + semChapisco.toFixed(0) + " mm de revestimento; a " + lim.fonte +
                      " admite no máximo " + lim.max + " mm em parede " + qual + ". Acima disso o revestimento precisa de tela.");
        }
      });

      /* erros de sequência que a obra não perdoa */
      function seq(pilha, face) {
        var ids = pilha.map(function (c) { return c.id; });
        var iCer = Math.max(ids.indexOf("ceramica"), ids.indexOf("porcelanato"));
        var iMassa = Math.max(ids.indexOf("massa_corrida"), ids.indexOf("massa_acrilica"));
        if (iCer >= 0 && iMassa >= 0 && iMassa < iCer) {
          erros.push("Na face " + face + " há massa corrida embaixo da cerâmica. A argamassa colante não adere na massa — a placa cai.");
        }
        if (ids.length && ids[0] !== "chapisco" && ids[0] !== "gesso_liso") {
          avisos.push("A face " + face + " começa com \"" + (self.CAMADAS[ids[0]] || {}).rotulo + "\" sem chapisco. Sem a camada de aderência, o revestimento descola.");
        }
        var iGesso = ids.indexOf("gesso_liso");
        if (iGesso >= 0 && face === (opts.faceExterna || "fora")) {
          erros.push("Gesso na face externa. Gesso não resiste à umidade — em fachada ele empola e cai.");
        }
      }
      seq(tipo.dentro || [], "dentro");
      seq(tipo.fora || [], "fora");

      return { ok: erros.length === 0, erros: erros, avisos: avisos };
    },

    /* ================================================================
     * QUANTIFICAR — área de parede → quantidade por camada + PESO.
     * area = m² de face (uma face). O núcleo usa a área uma vez; as
     * camadas de acabamento usam a área de CADA face.
     * ================================================================ */
    quantificar: function (tipo, area, opts) {
      opts = opts || {};
      var A = num(area);
      if (A <= 0) return { ok: false, motivo: "Área de parede tem que ser maior que zero." };
      var self = this;
      var linhas = [], pesoTotal = 0;

      /* núcleo */
      var nu = tipo.nucleo || {};
      var volNucleo = r3(A * (num(tipo.espessuraNucleo) / 1000));
      var pesoNucleo = null, obsNucleo = "";
      if (nu.peso != null) {
        pesoNucleo = r2(volNucleo * nu.peso);
        obsNucleo = nu.fonte || "";
      } else if (nu.familia && opts.pesoBlocoM2 != null) {
        pesoNucleo = r2(A * num(opts.pesoBlocoM2));
        obsNucleo = "peso por m² informado pelo catálogo de blocos";
      } else if (nu.familia) {
        obsNucleo = "peso do bloco vem do catálogo (blocos.js) — informe pesoBlocoM2 ou classe do bloco";
      } else {
        /* sem massa específica E sem família: sem este ramo a observação saía
           vazia e o peso do núcleo sumia sem nenhuma explicação na tela */
        obsNucleo = nu.tipo === "woodframe" ? "Quadro de madeira: peças, chapas e fixações pelo quantitativo do quadro (js/woodframequadro.js); sem massa específica de norma para o conjunto." : "Não há família de bloco desta espessura no catálogo — informe o peso do seu fornecedor.";
      }
      linhas.push({
        camada: nu.rotulo || "Núcleo", face: "núcleo", tipoLinha: "nucleo",
        espessura: tipo.espessuraNucleo, area: r2(A), volume: volNucleo,
        peso: pesoNucleo, obs: obsNucleo, servico: "Alvenaria"
      });
      if (pesoNucleo != null) pesoTotal += pesoNucleo;

      /* acabamentos, face a face */
      [["dentro", tipo.dentro], ["fora", tipo.fora]].forEach(function (par) {
        (par[1] || []).forEach(function (c) {
          var vol = r3(A * (c.espessura / 1000));
          var peso = r2(vol * (self.PESO[c.material] || 0));
          pesoTotal += peso;
          linhas.push({
            camada: c.rotulo, face: par[0], tipoLinha: "acabamento",
            espessura: c.espessura, area: r2(A), volume: vol,
            peso: peso, traco: c.traco, servico: c.servico, obs: c.fonte,
            material: c.material
          });
        });
      });

      var pesoConhecido = pesoNucleo != null;
      return {
        ok: true,
        area: r2(A),
        areaTotalFaces: r2(A * ((tipo.dentro || []).length ? 1 : 0) + A * ((tipo.fora || []).length ? 1 : 0)),
        linhas: linhas,
        /* argamassa de REVESTIMENTO (chapisco, emboço, reboco, massa única).
           A de assentamento do bloco é outra conta, e sai do blocos.js. */
        volumeArgamassa: r3(linhas.filter(function (l) {
          return l.material === "argamassa_cimento_areia" || l.material === "argamassa_cal_cimento_areia";
        }).reduce(function (s, l) { return s + l.volume; }, 0)),
        peso: r2(pesoTotal),
        pesoPorM2: r2(pesoTotal / A),
        pesoCompleto: pesoConhecido,
        avisoPeso: pesoConhecido ? "" : "O peso não inclui o núcleo — o peso do bloco vem do catálogo. Informe a família e a classe do bloco para fechar o total."
      };
    },

    /* Peso por m² de parede pronta — o número que vai para a fundação. */
    pesoPorM2: function (tipo, opts) {
      var q = this.quantificar(tipo, 1, opts);
      return q.ok ? { peso: q.pesoPorM2, completo: q.pesoCompleto, aviso: q.avisoPeso } : q;
    },

    /* A lista de serviços, na ordem de execução — é a ponte com o
     * paredecebola.js, que casa cada um com o código SINAPI. */
    servicos: function (tipo) {
      var out = [{ servico: "Alvenaria", face: "núcleo", seq: 1 }];
      var n = 1;
      [["dentro", tipo.dentro], ["fora", tipo.fora]].forEach(function (par) {
        (par[1] || []).forEach(function (c) { out.push({ servico: c.servico, face: par[0], seq: ++n, espessura: c.espessura, traco: c.traco }); });
      });
      return out;
    }
  };

  global.AlvTipos = AlvTipos;
  if (typeof module !== "undefined" && module.exports) module.exports = AlvTipos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

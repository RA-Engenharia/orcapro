/* =====================================================================
 * eletabelas.js — AS TABELAS dos CIRCUITOS ELÉTRICOS (frente E2, 21/10/2026). Dados PUROS, ES5, Node-testável.
 *
 * Cada número daqui tem a FONTE, o ITEM/TABELA e como foi conferido. Nada de memória: a pesquisa de 20/10/2026
 * (docs/eletrica/pesquisa/CIRCUITOS-QUADRO.md) trazia as tabelas da NBR 5410 "de memória, sem fonte — conferir"; aqui elas
 * foram LIDAS NA IMAGEM da página do PDF (renderizada a 200 dpi, lida e apagada). Uma célula da pesquisa estava ERRADA:
 * Tabela 36, B1 com 3 condutores carregados, 35 mm² = 110 A (a pesquisa dizia 111).
 *
 * NBR 5410:2004 — cópia que NÃO é exemplar licenciado à RA (exemplarLicenciado: false): só o VALOR com o item/tabela; o PDF
 *   não é arquivado; nenhuma identificação de comprador. A cópia é o ORIGINAL de 2004 SEM a Errata 1/2008 (a vigente é a
 *   "2004 Versão Corrigida 2008"): todo valor sai citado como "NBR 5410:2004 (sem a Errata 1/2008 — conferir)".
 *   Páginas lidas na imagem (página do PDF → página impressa): 71→63 (5.3.4.1), 98→90 e 100→92 (Tabela 33), 109→101
 *   (Tabela 36), 114→106 (Tabela 40), 116→108 (Tabela 42), 120→112 (Tabela 46), 121→113 (Tabela 47), 141→133 (Tabela 49),
 *   158→150 (Tabela 58), 165→157 (Tabela 59). Texto corrido (OCR bom, conferido no item): 4.2.5.5, 4.2.5.6, 5.1.3.2.2,
 *   5.4.2.1.1, 6.1.5.3, 6.2.5.5.2, 6.2.5.8, 6.2.7, 6.2.11.1.6, 6.2.11.1.7, 6.3.5.2.1, 6.5.4.7, 9.5.3, 9.5.4.
 * CEMIG ND-5.1 rev. MAR/2026 (PDF público da CEMIG, primária): Tabelas 1, 2, 3, 10, 12, 13 e o item 8.2.3 — transcritos na
 *   pesquisa (conferidos na imagem) e a Tabela 10, o 8.2.3, o 4.5.1 e as Tabelas 1/2 RECONFERIDOS no texto do PDF nesta frente.
 * FABRICANTES (catálogo público, lido na imagem): SIL "Cabo Flexsil 750 V" (diâmetro externo); Plastubos FTC000076
 *   "Eletroduto Corrugado" (diâmetro mínimo do eletroduto pelo número de condutores); LAPP T11 (resistência máxima do condutor a
 *   20 °C, que reproduz a IEC 60228:2004 = NBR NM 280, que a RA não tem).
 * SINAPI MG 06/2026 (data/sinapi-MG-2026-06.json): os códigos foram conferidos na base (código + descrição).
 *
 * NÍVEIS (os mesmos do js/eleregras.js): N norma lida (cópia não licenciada) · A fonte primária/fabricante lida · C critério RA ·
 *   X sem fonte lida (valor usual, conferir).
 * Teste: node tools/test-ele-tabelas.js (confere as células-chave contra a transcrição)
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }

  var CIT = "NBR 5410:2004 (sem a Errata 1/2008 — conferir)";
  var NORMA = { id: "ABNT NBR 5410:2004", edicaoLida: "original 30.09.2004, sem a Errata 1 de 17.03.2008", vigente: "ABNT NBR 5410:2004 Versão Corrigida 2008",
    exemplarLicenciado: false, conferidaEm: "2026-10-21", citar: CIT,
    ressalva: "Valores e itens conferidos numa cópia de consulta da NBR 5410:2004 que NÃO é exemplar licenciado à RA Engenharia, edição original de 2004 SEM a Errata 1/2008. Antes de assinar, conferir no exemplar licenciado da edição vigente (Versão Corrigida 2008)." };
  function n5410(item) { return CIT + ", " + item; }

  var FONTES = {
    NBR: CIT + " — cópia não licenciada à RA, só o valor com o item",
    CEMIG: "CEMIG ND-5.1 rev. MAR/2026 (edificações individuais, rede aérea, 127/220 V)",
    SIL: "SIL, catálogo \"Cabo Flexsil 750 V\" (NBR NM 247-3), p. 4 — fabricante",
    PLASTUBOS: "Plastubos, ficha técnica FTC000076 \"Eletroduto Corrugado\", p. 2 — fabricante",
    LAPP: "LAPP, tabela técnica T11 \"Resistência e estrutura do condutor\" (reproduz a IEC 60228:2004 = NBR NM 280, não lida) — fabricante",
    SINAPI: "SINAPI MG 06/2026 (não desonerado), código e descrição conferidos na base"
  };

  /* ------------------------------------------------------------------ TABELA 33 — método de instalação → método de referência
     (PDF p. 98 e 100, na imagem). A aplicação do eletroduto no modelo (js/biminst.js APLICACOES.eletrica) vira o método. */
  var T33 = {
    item: "Tabela 33", fonte: FONTES.NBR, conferido: "imagem PDF p. 98 e 100",
    parede:   { metodo: 7, ref: "B1", nivel: "N", desc: "condutores isolados em eletroduto de seção circular embutido em alvenaria" },
    laje:     { metodo: 7, ref: "B1", nivel: "C", desc: "eletroduto embutido na laje de concreto lido como \"embutido em alvenaria\" (a Tabela 33 não tem linha própria para laje — critério RA)" },
    forro:    { metodo: 22, ref: "B2", nivel: "N", desc: "condutores isolados em eletroduto de seção circular em espaço de construção, 1,5 De ≤ V < 20 De (B2; com V ≥ 20 De seria B1 — o motor fica no B2, conservador)" },
    aparente: { metodo: 3, ref: "B1", nivel: "N", desc: "condutores isolados em eletroduto aparente de seção circular sobre parede" },
    parede_isolante: { metodo: 1, ref: "A1", nivel: "N", desc: "condutores isolados em eletroduto embutido em parede termicamente isolante (drywall com isolante)" }
  };
  /* a pior condição do percurso manda (6.2.5.8): a ordem do MENOR Iz para o maior, nos métodos que o motor usa */
  var ORDEM_METODO = ["A1", "A2", "B2", "B1", "C", "D"];

  /* ------------------------------------------------------------------ TABELA 36 — cobre, PVC 70 °C, 30 °C ar (PDF p. 109, na imagem) */
  var T36 = {
    item: "Tabela 36", fonte: FONTES.NBR, conferido: "imagem PDF p. 109 (norma p. 101), cobre 1,5 a 95 mm²",
    secoes: [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95],
    /* colunas: A1(2,3) A2(2,3) B1(2,3) B2(2,3) C(2,3) D(2,3) */
    dados: [
      [14.5, 13.5, 14, 13, 17.5, 15.5, 16.5, 15, 19.5, 17.5, 22, 18],
      [19.5, 18, 18.5, 17.5, 24, 21, 23, 20, 27, 24, 29, 24],
      [26, 24, 25, 23, 32, 28, 30, 27, 36, 32, 38, 31],
      [34, 31, 32, 29, 41, 36, 38, 34, 46, 41, 47, 39],
      [46, 42, 43, 39, 57, 50, 52, 46, 63, 57, 63, 52],
      [61, 56, 57, 52, 76, 68, 69, 62, 85, 76, 81, 67],
      [80, 73, 75, 68, 101, 89, 90, 80, 112, 96, 104, 86],
      [99, 89, 92, 83, 125, 110, 111, 99, 138, 119, 125, 103],
      [119, 108, 110, 99, 151, 134, 133, 118, 168, 144, 148, 122],
      [151, 136, 139, 125, 192, 171, 168, 149, 213, 184, 183, 151],
      [182, 164, 167, 150, 232, 207, 201, 179, 258, 223, 216, 179]
    ],
    colunas: ["A1", "A2", "B1", "B2", "C", "D"]
  };
  function iz(ref, nCarregados, secao) {
    var i = T36.secoes.indexOf(Number(secao)), c = T36.colunas.indexOf(ref);
    if (i < 0 || c < 0) return null;
    return T36.dados[i][c * 2 + (Number(nCarregados) === 3 ? 1 : 0)];
  }

  /* ------------------------------------------------------------------ TABELA 40 — temperatura ambiente ≠ 30 °C, PVC (PDF p. 114) */
  var T40 = { item: "Tabela 40", fonte: FONTES.NBR, conferido: "imagem PDF p. 114 (norma p. 106)", referencia_C: 30,
    pvc: [[10, 1.22], [15, 1.17], [20, 1.12], [25, 1.06], [30, 1.00], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.50]] };
  /* a temperatura entre duas linhas usa o fator da linha de temperatura MAIOR (conservador); acima de 60 °C o PVC não vale */
  function fatorTemperatura(tC) {
    var t = Number(tC); if (!isFinite(t)) t = 30;
    for (var i = 0; i < T40.pvc.length; i++) if (T40.pvc[i][0] >= t - 1e-9) return T40.pvc[i][1];
    return null;
  }

  /* ------------------------------------------------------------------ TABELA 42 — agrupamento, linha 1 "em feixe… embutidos; em conduto
     fechado" (métodos A a F; nota 3: o número é de CIRCUITOS) (PDF p. 116) */
  var T42 = { item: "Tabela 42, referência 1", fonte: FONTES.NBR, conferido: "imagem PDF p. 116 (norma p. 108)",
    feixe: [[1, 1.00], [2, 0.80], [3, 0.70], [4, 0.65], [5, 0.60], [6, 0.57], [7, 0.54], [8, 0.52], [11, 0.50], [15, 0.45], [19, 0.41], [Infinity, 0.38]] };
  function fatorAgrupamento(nCircuitos) {
    var k = Math.max(1, Math.round(Number(nCircuitos) || 1));
    for (var i = 0; i < T42.feixe.length; i++) if (k <= T42.feixe[i][0]) return T42.feixe[i][1];
    return T42.feixe[T42.feixe.length - 1][1];
  }

  /* 6.2.5.5.2 (texto corrido): condutor com IB ≤ 30 % da sua capacidade (já com o fator de agrupamento) pode ser desconsiderado no
     fator de agrupamento do restante do grupo */
  var AGRUP30 = 0.30;

  /* ------------------------------------------------------------------ TABELA 46 — condutores carregados (PDF p. 120) */
  var T46 = { item: "Tabela 46", fonte: FONTES.NBR, conferido: "imagem PDF p. 120 (norma p. 112)",
    monofasico2: 2, monofasico3: 2, duasFasesSemNeutro: 2, duasFasesComNeutro: 3, trifasicoSemNeutro: 3, trifasicoComNeutro: "3 ou 4 (6.2.5.6.1)" };

  /* ------------------------------------------------------------------ TABELA 47 — seção mínima (PDF p. 121) */
  var T47 = { item: "Tabela 47", fonte: FONTES.NBR, conferido: "imagem PDF p. 121 (norma p. 113)", iluminacao: 1.5, forca: 2.5, sinal: 0.5,
    nota: "instalações fixas, condutores e cabos isolados de cobre; nota 2: circuitos de tomadas são circuitos de força; nota 1: mínimos por razões mecânicas" };

  /* ------------------------------------------------------------------ TABELA 58 — condutor de proteção (PDF p. 158) */
  var T58 = { item: "Tabela 58", fonte: FONTES.NBR, conferido: "imagem PDF p. 158 (norma p. 150)" };
  /* S > 35: S/2 — e, quando S/2 não é seção padronizada (95/2 = 47,5), a padronizada seguinte (6.4.3.1.3: "a seção padronizada
     mais próxima"; a de cima, conservador) */
  var SECOES_PADRAO = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];
  function secaoPE(S) {
    S = Number(S); if (S <= 16) return S; if (S <= 35) return 16;
    var m = S / 2; for (var i = 0; i < SECOES_PADRAO.length; i++) if (SECOES_PADRAO[i] >= m - 1e-9) return SECOES_PADRAO[i];
    return m;
  }

  /* ------------------------------------------------------------------ TABELA 59 — reserva no quadro (6.5.4.7) (PDF p. 165) */
  var T59 = { item: "6.5.4.7 / Tabela 59", fonte: FONTES.NBR, conferido: "imagem PDF p. 165 (norma p. 157)" };
  function reserva(N) { N = Number(N) || 0; return N <= 6 ? 2 : (N <= 12 ? 3 : (N <= 30 ? 4 : Math.ceil(0.15 * N))); }

  /* ------------------------------------------------------------------ 6.2.7 — queda de tensão (texto corrido) */
  var QUEDA = { item: "6.2.7.1 c) e 6.2.7.2", fonte: FONTES.NBR, entregaSecundaria_pct: 5, trafoProprio_pct: 7, terminal_pct: 4,
    texto: "5 % a partir do ponto de entrega com fornecimento em tensão secundária (6.2.7.1 c); em nenhum caso mais de 4 % no circuito terminal (6.2.7.2); calculada com a corrente de projeto (6.2.7.4)" };

  /* ------------------------------------------------------------------ 6.2.11.1.6 / 6.2.11.1.7 — eletrodutos (texto corrido) */
  var ELETRODUTO = { item: "6.2.11.1.6 e 6.2.11.1.7", fonte: FONTES.NBR,
    taxa_pct: { 1: 53, 2: 31, 3: 40 }, trechoInterno_m: 15, trechoExterno_m: 30, reducaoPorCurva_m: 3, curvasMax: 3,
    texto: "taxa de ocupação ≤ 53 % (1 condutor), 31 % (2), 40 % (3 ou mais) — a); trecho contínuo sem caixa ≤ 15 m interno / 30 m externo, menos 3 m por curva de 90° — b); no máximo 3 curvas de 90° entre caixas (6.2.11.1.7); caixa em toda emenda/derivação (6.2.11.1.9 b, 6.2.11.1.11)" };

  /* ------------------------------------------------------------------ 5.3.4.1 — coordenação condutor × disjuntor (PDF p. 71, na imagem) */
  var COORD = { item: "5.3.4.1", fonte: FONTES.NBR, conferido: "imagem PDF p. 71 (norma p. 63)", texto: "a) IB ≤ In ≤ Iz; b) I2 ≤ 1,45 Iz",
    i2: { valor: 1.45, nivel: "X", fonte: "I2 = 1,45 In do disjuntor da NBR NM 60898 (norma do produto, NÃO lida — conferir): com ele, a condição b) se reduz a In ≤ Iz" } };

  /* ------------------------------------------------------------------ 5.1.3.2.2 — DR ≤ 30 mA obrigatório (texto corrido) */
  var DR = { item: "5.1.3.2.2", fonte: FONTES.NBR,
    casos: {
      a: "circuitos que sirvam a pontos de utilização em locais contendo banheira ou chuveiro (ver 9.1)",
      b: "circuitos que alimentem tomadas em áreas externas à edificação",
      c: "circuitos de tomadas em áreas internas que possam alimentar equipamentos no exterior",
      d: "em habitação, circuitos que sirvam a pontos em cozinhas, copas-cozinhas, lavanderias, áreas de serviço, garagens e demais dependências molhadas ou sujeitas a lavagens"
    },
    nota1_tomadaAte_A: 32, nota3_luzAltura_m: 2.50,
    notas: "nota 1: para tomadas, vale até 32 A; nota 3: na alínea d) admite-se excluir os pontos de iluminação a 2,50 m ou mais" };

  /* ------------------------------------------------------------------ DPS — 5.4.2.1.1 (quando) + Tabela 49 (Uc) (PDF p. 141) */
  var DPS = { item: "5.4.2.1.1, 6.3.5.2.1 e Tabela 49", fonte: FONTES.NBR, conferido: "Tabela 49 na imagem PDF p. 141 (norma p. 133)",
    quando: "linha de alimentação total ou parcialmente aérea em região AQ2 (mais de 25 dias de trovoada por ano) — a); ou região AQ3 — b)",
    ucTNS: { faseNeutro: 1.1, fasePE: 1.1, neutroPE: 1.0, base: "Uo (fase-neutro)" },
    inMin_kA: 5, inNPE_mono_kA: 10, inNPE_tri_kA: 20,
    onde: "junto ao ponto de entrada ou no quadro de distribuição principal o mais próximo possível dele (6.3.5.2.1 a)" };

  /* ------------------------------------------------------------------ 9.5.3 / 4.2.5.5 / 9.5.4 — divisão (texto corrido) */
  var DIVISAO = { fonte: FONTES.NBR,
    luzTomadaSeparados: "4.2.5.5 — circuitos terminais distintos para iluminação e para tomadas",
    equilibrio: "4.2.5.6 — cargas distribuídas entre as fases com o maior equilíbrio possível",
    exclusivo10A: "9.5.3.1 — ponto para equipamento com corrente nominal superior a 10 A constitui circuito independente",
    cozinhaServico: "9.5.3.2 — tomadas de cozinhas, copas, áreas de serviço, lavanderias e análogos em circuitos exclusivos dessas tomadas",
    excecaoHabitacao: "9.5.3.3 — em habitação, luz + tomadas num circuito comum só com IB ≤ 16 A e sem concentrar toda a luz ou todas as tomadas num só (o motor NÃO usa a exceção)",
    multipolar: "9.5.4 — o dispositivo de proteção secciona todas as fases (multipolar no circuito de duas fases)",
    cores: "6.1.5.3 — neutro azul-claro; PE verde-amarelo ou verde; fase qualquer outra cor (não só amarelo)",
    excecao16A: 16 };

  /* ------------------------------------------------------------------ FABRICANTES */
  /* SIL Flexsil 750 V — diâmetro nominal externo (mm), p. 4 do catálogo, na imagem */
  var DIAMETRO_CABO = { fonte: FONTES.SIL, url: "docs/eletrica/pesquisa (endereço público do documento; fora do pacote — test-privacidade)", nivel: "A",
    mm: { 1.5: 2.9, 2.5: 3.4, 4: 4.0, 6: 4.5, 10: 5.9, 16: 7.0, 25: 8.8, 35: 9.9, 50: 11.8, 70: 13.7, 95: 16.2 } };
  /* Plastubos — diâmetro mínimo do eletroduto corrugado (DN mm) pelo número de condutores (1 a 9) da MESMA seção, p. 2 na imagem.
     null = não cabe (a ficha traz "-"). A ficha não dá o diâmetro interno: a taxa de 40 % da 6.2.11.1.6 a) fica com o fabricante. */
  var OCUPACAO = { fonte: FONTES.PLASTUBOS, url: "docs/eletrica/pesquisa (endereço público do documento; fora do pacote — test-privacidade)", nivel: "A",
    dn: {
      1.5: [20, 20, 20, 20, 25, 25, 25, 25, 32],
      2.5: [20, 20, 20, 25, 25, 25, 32, 32, 32],
      4:   [20, 25, 25, 25, 25, 32, 32, 32, 32],
      6:   [20, 25, 25, 25, 32, 32, 32, 32, null],
      10:  [20, 32, 32, 32, 32, null, null, null, null],
      16:  [20, 32, 32, null, null, null, null, null, null]
    },
    regra: "mais de uma seção no mesmo eletroduto: todos contados como a MAIOR seção (critério RA conservador — a ficha só traz seção única)" };
  /* o DN mínimo para n condutores de seção S (null = não cabe em DN 32 ou fora da ficha) */
  function dnMinimo(nCondutores, secaoMaior) {
    var L = OCUPACAO.dn[Number(secaoMaior)], k = Math.round(Number(nCondutores));
    if (!L || !(k >= 1)) return null;
    return k > L.length ? null : L[k - 1];
  }
  /* LAPP T11 — resistência máxima do condutor de cobre nu classe 5 a 20 °C (Ω/km), na imagem */
  var RESISTENCIA = { fonte: FONTES.LAPP, url: "docs/eletrica/pesquisa (endereço público do documento; fora do pacote — test-privacidade)", nivel: "A",
    r20: { 1.5: 13.3, 2.5: 7.98, 4: 4.95, 6: 3.30, 10: 1.91, 16: 1.21, 25: 0.780, 35: 0.554, 50: 0.386, 70: 0.272, 95: 0.206 },
    alfa: { valor: 0.00393, nivel: "X", fonte: "coeficiente de temperatura do cobre recozido, valor usual (não lido) — conferir" },
    tCondutor: 70 };
  /* resistência a 70 °C (temperatura máxima do PVC em regime, conservador) em Ω/km */
  function r70(S) { var r = RESISTENCIA.r20[Number(S)]; return r == null ? null : r * (1 + RESISTENCIA.alfa.valor * (RESISTENCIA.tCondutor - 20)); }

  /* ------------------------------------------------------------------ SINAPI MG 06/2026 (códigos conferidos na base) */
  var SINAPI = { fonte: FONTES.SINAPI,
    cabo: { 1.5: "91924", 2.5: "91926", 4: "91928", 6: "91930", 10: "91932", 16: "91934" },   /* 450/750 V, circuitos terminais, M */
    disjuntor: {
      1: { 10: "93653", 16: "93654", 20: "93655", 25: "93656", 32: "93657", 40: "93658", 50: "93659" },
      2: { 10: "93660", 16: "93661", 20: "93662", 25: "93663", 32: "93664", 40: "93665", 50: "93666" },
      3: { 10: "93667", 16: "93668", 20: "93669", 25: "93670", 32: "93671", 40: "93672", 50: "93673", 63: "106020" }
    },
    dr: { 2: { 25: "93674", 40: "93675", 63: "106030" }, 4: { 25: "93676", 40: "97711" } },   /* insumo: DR 30 mA tipo AC */
    dps: "106027",   /* DPS 20 kA 175 V ou 275 V, 1 polo (insumo: classe II) */
    quadro: [   /* [espaços (disjuntores DIN), material, instalação, corrente do barramento, código] — os de PVC sem barramento e os de aço */
      [3, "pvc", "embutir", "", "101877"], [6, "pvc", "embutir", "", "101876"], [12, "aco", "embutir", "100A", "101875"], [18, "aco", "embutir", "100A", "101883"],
      [24, "aco", "embutir", "100A", "101879"], [28, "aco", "embutir", "100A", "106021"], [30, "aco", "embutir", "150A", "101880"], [36, "aco", "embutir", "100A", "106022"],
      [40, "aco", "embutir", "100A", "101881"], [48, "aco", "embutir", "100A", "106023"]
    ] };
  /* ACIMA do que a SINAPI orça exato (o disjuntor GERAL de um sobrado passa de 63 A; o alimentador passa de 16 mm²) — regra do
     orçamento 100 % (revisão 21/10/2026: antes o geral e o alimentador saíam do orçamento em silêncio): a composição pública de
     MAIOR preço que cobre a corrente/seção, marcada "provisório — cotar com o fornecedor" quando os polos ou a faixa não batem.
     Códigos e descrições conferidos na base SINAPI MG 06/2026 (data/sinapi-MG-2026-06.json) nesta revisão. */
  var DISJ_MAIOR = [   /* [In até (A), código, descrição curta, polos da composição, In mínimo da faixa] */
    [63, "106020", "DISJUNTOR TRIPOLAR DIN 63A", 3, 63],
    [100, "101894", "DISJUNTOR TRIPOLAR TIPO NEMA, CORRENTE NOMINAL DE 60 ATÉ 100A", 3, 60],
    [125, "101895", "DISJUNTOR TERMOMAGNÉTICO TRIPOLAR, CORRENTE NOMINAL DE 125A", 3, 125],
    [200, "101896", "DISJUNTOR TERMOMAGNÉTICO TRIPOLAR, CORRENTE NOMINAL DE 200A", 3, 200],
    [250, "101897", "DISJUNTOR TERMOMAGNÉTICO TRIPOLAR, CORRENTE NOMINAL DE 250A", 3, 250]
  ];
  var GERAL_A = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];   /* correntes nominais usuais do geral (série IEC) */
  /* cabo acima de 16 mm²: a SINAPI MG não tem o 450/750 V de circuito terminal; o de MAIOR preço é o 0,6/1 kV "rede enterrada"
     (o mesmo que a CEMIG pede no trecho enterrado) — provisório */
  var CABO_MAIOR = { 25: "92984", 35: "92986", 50: "92988", 70: "92990", 95: "92992" };
  /* eletroduto do ALIMENTADOR (não está no modelo): o DN da Tabela 1/2 da ND-5.1 para a faixa, composição pública de maior preço
     do DN — provisório */
  var ELETRODUTO_ALIM = { 32: "91872", 40: "91873", 50: "93008", 60: "93009", 75: "93010" };
  function disjuntorCodigo(polos, In) {
    var p = Number(polos), i = Number(In), ex = (SINAPI.disjuntor[p] || {})[i];
    if (ex) return { codigo: ex, provisorio: false };
    for (var k = 0; k < DISJ_MAIOR.length; k++) {
      var d = DISJ_MAIOR[k]; if (i > d[0] + 1e-9) continue;
      var exato = p === d[3] && i >= d[4] - 1e-9;
      return { codigo: d[1], provisorio: !exato, motivo: exato ? "" : "provisório — cotar com o fornecedor: a SINAPI MG 06/2026 não tem o disjuntor " + p + "P " + i + " A; orçado pelo de maior preço que o cobre (" + d[1] + " " + d[2] + ")" };
    }
    return null;
  }
  var DISJUNTORES_A = [10, 16, 20, 25, 32, 40, 50];   /* DIN da SINAPI (o tripolar tem 63 A) */
  var DR_A = [25, 40, 63];
  var SECOES = [1.5, 2.5, 4, 6, 10, 16];   /* as que a SINAPI orça como cabo de circuito terminal 450/750 V */

  /* ------------------------------------------------------------------ CEMIG ND-5.1 */
  var CEMIG = { fonte: FONTES.CEMIG, url: "docs/eletrica/pesquisa (endereço público do documento; fora do pacote — test-privacidade)",
    tipos: {
      A: { item: "4.5.1.1", fios: 2, fases: 1, ate_kW: 8, texto: "2 fios (F-N, 127 V), carga instalada até 8 kW, sem motor monofásico > 2 cv nem solda > 2 kVA" },
      B: { item: "4.5.1.2", fios: 3, fases: 2, ate_kW: 16, texto: "3 fios (2F-N), até 16 kW" },
      C: { item: "4.5.1.3", fios: 4, fases: 3, ate_kW: 75, demandaAte_kVA: 75, texto: "4 fios (3F-N), 16,1 a 75,0 kW e demanda provável até 75 kVA" }
    },
    /* [faixa, de, até, fios, fases, disjuntor IEC (A), Cu (mm²), eletroduto PVC (mm), aço (mm), aterramento Cu nu (mm²), hastes, PE (mm²)] */
    tabela1: { item: "Tabela 1 (p. 61)", base: "carga instalada (kW)", dados: [["A1", 0, 8, 2, 1, 63, 16, 32, 25, 10, 1, 16], ["B1", 8.1, 16, 3, 2, 63, 16, 32, 25, 10, 1, 16]] },
    tabela2: { item: "Tabela 2 (p. 62)", base: "demanda provável (kVA)", dados: [["C1", 0, 24.0, 4, 3, 63, 16, 32, 25, 10, 2, 16], ["C2", 24.1, 30.5, 4, 3, 80, 25, 40, 32, 10, 2, 16], ["C3", 30.6, 38.1, 4, 3, 100, 35, 40, 32, 10, 2, 16],
      ["C4", 38.2, 47.6, 4, 3, 125, 50, 50, 40, 10, 2, 25], ["C5", 47.7, 57.1, 4, 3, 150, 70, 60, 50, 10, 3, 35], ["C6", 57.2, 75.0, 4, 3, 200, 95, 75, 65, 10, 3, 35]] },
    tabela10: { item: "Tabela 10 (p. 72)", dados: [[1, 0.86], [2, 0.81], [3, 0.76], [4, 0.72], [5, 0.68], [6, 0.64], [7, 0.60], [8, 0.57], [9, 0.54], [10, 0.52], [Infinity, 0.45]],
      nota: "tomadas e lâmpadas de descarga: kVA = kW / 0,92" },
    tabela12: { item: "Tabela 12 (p. 74)", dados: [[1, 0.80, 1.00], [2, 0.75, 1.00], [3, 0.70, 0.80], [4, 0.66, 0.65], [5, 0.62, 0.55], [6, 0.59, 0.50], [7, 0.56, 0.45], [8, 0.53, 0.43], [9, 0.51, 0.40], [10, 0.49, 0.36], [11, 0.47, 0.35], [12, 0.45, 0.34]],
      nota: "fornos e fogões: coluna até 3,5 kW / acima de 3,5 kW; kW = kVA" },
    tabela13: { item: "Tabela 13 (p. 75)", dados: [[1, 100], [2, 92], [3, 84], [4, 76], [5, 70], [6, 65], [7, 60], [8, 57], [9, 54], [10, 52], [11, 49], [12, 48], [13, 46], [14, 45], [15, 44], [16, 43], [17, 42], [18, 41], [19, 40], [20, 40], [21, 39], [22, 39], [23, 39], [24, 38], [25, 38], [30, 37], [40, 36], [50, 35], [60, 34], [Infinity, 33]],
      nota: "aplicada à carga de cada grupo separadamente; aquecimento: kW = kVA; demais: kVA = kW / 0,92" },
    demanda: { item: "8.2.3 (pp. 56-57)", formula: "D = a + b + c + d + e + f (kVA)",
      termos: "a iluminação e tomadas (Tabela 10); b aparelhos por grupo (Tabela 13; b3 fornos e fogões pela Tabela 12): b1 chuveiros, torneiras e cafeteiras; b2 aquecedores de água; b3 fornos, fogões e grill; b4 lavar/secar roupa, lava-louças e ferro; b5 demais; c condicionadores de ar (Tabela 13); d motores (Tabelas 14 e 15)" }
  };
  function fdTabela10(kW) { var L = CEMIG.tabela10.dados; for (var i = 0; i < L.length; i++) if (kW <= L[i][0] + 1e-9) return L[i][1]; return L[L.length - 1][1]; }
  function fdTabela13(n) { var L = CEMIG.tabela13.dados; for (var i = 0; i < L.length; i++) if (n <= L[i][0]) return L[i][1] / 100; return 0.33; }
  function fdTabela12(n, acima35) { var L = CEMIG.tabela12.dados, k = Math.max(1, Math.min(12, Math.round(n))); return L[k - 1][acima35 ? 2 : 1]; }

  var EleTabelas = {
    NORMA: NORMA, CIT: CIT, FONTES: FONTES, n5410: n5410,
    AGRUP30: AGRUP30, T33: T33, ORDEM_METODO: ORDEM_METODO, T36: T36, T40: T40, T42: T42, T46: T46, T47: T47, T58: T58, T59: T59,
    QUEDA: QUEDA, ELETRODUTO: ELETRODUTO, COORD: COORD, DR: DR, DPS: DPS, DIVISAO: DIVISAO,
    DIAMETRO_CABO: DIAMETRO_CABO, OCUPACAO: OCUPACAO, RESISTENCIA: RESISTENCIA, SINAPI: SINAPI, CEMIG: CEMIG,
    DISJUNTORES_A: DISJUNTORES_A, DR_A: DR_A, SECOES: SECOES, SECOES_PADRAO: SECOES_PADRAO, GERAL_A: GERAL_A, DISJ_MAIOR: DISJ_MAIOR, CABO_MAIOR: CABO_MAIOR,
    ELETRODUTO_ALIM: ELETRODUTO_ALIM, disjuntorCodigo: disjuntorCodigo,
    iz: iz, fatorTemperatura: fatorTemperatura, fatorAgrupamento: fatorAgrupamento, secaoPE: secaoPE, reserva: reserva,
    dnMinimo: dnMinimo, r70: r70, fdTabela10: fdTabela10, fdTabela12: fdTabela12, fdTabela13: fdTabela13, arr: arr
  };
  global.EleTabelas = EleTabelas;
  if (typeof module !== "undefined" && module.exports) module.exports = EleTabelas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

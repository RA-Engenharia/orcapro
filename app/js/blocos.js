/* =====================================================================
 * blocos.js — Catálogo e modulação de ALVENARIA EM BLOCO DE CONCRETO.
 *
 * Motor PURO (Node-testável, ES5). Nada de DOM, nada de three.js.
 * É o alicerce do módulo de alvenaria: quem sabe que peça existe, quanto
 * ela pesa, quantas cabem num metro quadrado e como fechar uma parede
 * sem recorte.
 *
 * ---------------------------------------------------------------------
 * DE ONDE VÊM OS NÚMEROS (nada aqui foi inventado)
 * ---------------------------------------------------------------------
 * · Dimensões e famílias: ABNT NBR 6136 + catálogos de fabricante.
 *   Regra mestra: dimensão REAL = dimensão NOMINAL (modular) − 10 mm.
 *   Real 140→nominal 150 · 190→200 · 290→300 · 390→400 · 540→550.
 * · Consumo de argamassa "modo orçamento": coeficientes da própria base
 *   SINAPI (89470, 89453, 89478, 89464), que já embutem perdas.
 * · Pesos: são dado de FABRICANTE, não de norma — o mesmo 14x19x39
 *   aparece com 13,27 kg (Original Blocos), 12,35 kg (Casa Fácil) e
 *   11,9 kgf (Pavibloco). Por isso peso aqui é DEFAULT editável.
 * · Classes A/B/C e limite de pavimentos: NBR 6136:2016.
 *
 * ---------------------------------------------------------------------
 * TRÊS ERROS CLÁSSICOS QUE ESTE ARQUIVO IMPEDE
 * ---------------------------------------------------------------------
 * 1) "Família 20" não existe. As famílias são a 29 (módulo de 15 cm em
 *    planta) e a 39 (módulo de 20 cm). Quem diz "família de 20" quase
 *    sempre quer dizer a família 39.
 * 2) O meio-bloco NÃO é o mesmo nas duas: família 29 usa 14x19x14 e
 *    família 39 usa 14x19x19. Trocar um pelo outro quebra a modulação
 *    (na 29, metade de 30 é 15 → peça de 14 + 1 de junta).
 * 3) Compensador não é "4x19x39". A notação é LARGURA x ALTURA x
 *    COMPRIMENTO, e o compensador encurta o COMPRIMENTO: 14x19x09 e
 *    14x19x04. Não existe bloco de 4 cm de largura.
 *
 * Teste: node tools/test-blocos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v).trim();
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(s) || 0;
  }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }
  function r4(n) { return Math.round(num(n) * 10000) / 10000; }

  var JUNTA_PADRAO = 0.010;   // 10 mm — é o que a modulação pressupõe
  var ALT_FIADA = 0.20;       // 19 cm de bloco + 1 cm de junta, em TODAS as famílias

  /* ---------------------------------------------------------------
   * CATÁLOGO
   * Toda medida em METROS, na ordem largura × altura × comprimento
   * (a mesma da norma e dos catálogos). "papel" diz para que serve.
   * --------------------------------------------------------------- */
  var FAMILIAS = {
    "29": {
      id: "29", rotulo: "Família 29 (módulo 15 cm)",
      modulo: 0.15, larguras: [0.14],
      nota: "Módulo do comprimento igual ao da largura (15 cm): os encontros em L fecham sozinhos, alternando as fiadas.",
      pecas: [
        { id: "29-inteiro",   nome: "Bloco inteiro",        papel: "inteiro",     l: 0.14, a: 0.19, c: 0.29, peso: 11.79 },
        { id: "29-meio",      nome: "Meio bloco",           papel: "meio",        l: 0.14, a: 0.19, c: 0.14, peso: 5.28 },
        { id: "29-amarr-t",   nome: "Bloco e meio (T)",     papel: "amarracao-t", l: 0.14, a: 0.19, c: 0.44, peso: 14.90 },
        { id: "29-can-u",     nome: "Canaleta U inteira",   papel: "canaleta-u",  l: 0.14, a: 0.19, c: 0.29, peso: 8.90 },
        { id: "29-can-u-meia",nome: "Meia canaleta U",      papel: "canaleta-u",  l: 0.14, a: 0.19, c: 0.14, peso: 4.61 },
        { id: "29-can-j",     nome: "Canaleta J inteira",   papel: "canaleta-j",  l: 0.14, a: 0.19, c: 0.29, peso: 8.51 },
        { id: "29-can-j-meia",nome: "Canaleta J curta",     papel: "canaleta-j",  l: 0.14, a: 0.19, c: 0.14, peso: 5.18 },
        { id: "29-comp-9",    nome: "Compensador 1/4",      papel: "compensador", l: 0.14, a: 0.19, c: 0.09, peso: 3.40 },
        { id: "29-comp-4",    nome: "Compensador 1/8",      papel: "compensador", l: 0.14, a: 0.19, c: 0.04, peso: null },
        { id: "29-meia-alt",  nome: "Bloco de meia altura", papel: "meia-altura", l: 0.14, a: 0.09, c: 0.29, peso: null }
      ]
    },
    "39-14": {
      id: "39-14", rotulo: "Família 39 · largura 14 (módulo 20 cm)",
      modulo: 0.20, larguras: [0.14],
      nota: "Módulo do comprimento (20 cm) diferente do da largura (15 cm) — por isso precisa dos blocos de amarração 34 (canto) e 54 (T).",
      pecas: [
        { id: "39-inteiro",    nome: "Bloco inteiro",          papel: "inteiro",     l: 0.14, a: 0.19, c: 0.39, peso: 13.27 },
        { id: "39-meio",       nome: "Meio bloco",             papel: "meio",        l: 0.14, a: 0.19, c: 0.19, peso: 7.33 },
        { id: "39-amarr-l",    nome: "Amarração L (canto)",    papel: "amarracao-l", l: 0.14, a: 0.19, c: 0.34, peso: 12.23 },
        { id: "39-amarr-t",    nome: "Amarração T",            papel: "amarracao-t", l: 0.14, a: 0.19, c: 0.54, peso: 16.27 },
        { id: "39-can-u",      nome: "Canaleta U inteira",     papel: "canaleta-u",  l: 0.14, a: 0.19, c: 0.39, peso: 13.27 },
        { id: "39-can-u-meia", nome: "Meia canaleta U",        papel: "canaleta-u",  l: 0.14, a: 0.19, c: 0.19, peso: 6.82 },
        { id: "39-can-j",      nome: "Canaleta J",             papel: "canaleta-j",  l: 0.14, a: 0.19, c: 0.39, peso: 10.69 },
        { id: "39-can-comp",   nome: "Canaleta compensadora",  papel: "meia-altura", l: 0.14, a: 0.11, c: 0.19, peso: 4.23 },
        { id: "39-comp-9",     nome: "Compensador 1/4",        papel: "compensador", l: 0.14, a: 0.19, c: 0.09, peso: 3.40 },
        { id: "39-comp-4",     nome: "Compensador 1/8",        papel: "compensador", l: 0.14, a: 0.19, c: 0.04, peso: null },
        { id: "39-meia-alt",   nome: "Bloco de meia altura",   papel: "meia-altura", l: 0.14, a: 0.09, c: 0.39, peso: null }
      ]
    },
    "39-19": {
      id: "39-19", rotulo: "Família 39 · largura 19 (módulo 20 cm)",
      modulo: 0.20, larguras: [0.19],
      nota: "Aqui o módulo da largura (20 cm) coincide com o do comprimento — não precisa de bloco especial de amarração.",
      pecas: [
        { id: "39x19-inteiro",   nome: "Bloco inteiro",      papel: "inteiro",     l: 0.19, a: 0.19, c: 0.39, peso: 16.0 },
        { id: "39x19-meio",      nome: "Meio bloco",         papel: "meio",        l: 0.19, a: 0.19, c: 0.19, peso: 7.0 },
        { id: "39x19-can-u",     nome: "Canaleta U inteira", papel: "canaleta-u",  l: 0.19, a: 0.19, c: 0.39, peso: 16.0 },
        { id: "39x19-can-u-meia",nome: "Meia canaleta U",    papel: "canaleta-u",  l: 0.19, a: 0.19, c: 0.19, peso: 7.5 },
        { id: "39x19-comp-9",    nome: "Compensador 1/4",    papel: "compensador", l: 0.19, a: 0.19, c: 0.09, peso: 4.44 },
        { id: "39x19-comp-4",    nome: "Compensador 1/8",    papel: "compensador", l: 0.19, a: 0.19, c: 0.04, peso: 3.48 }
      ]
    }
  };

  /* =================================================================
   * PESOS DE REFERÊNCIA — kg POR PEÇA
   *
   * O peso do bloco varia muito entre fabricantes, então ele vem
   * PRÉ-DEFINIDO aqui (o orçamento fecha sem o usuário fazer nada) e
   * o usuário troca depois pelo catálogo do fornecedor dele.
   *
   * Isto NÃO é catálogo de fabricante nenhum: é compilação de seis
   * (Tatu, Pavibloco, JB, Original, ArtBlocos, Portital). Numa parede
   * da família 39-14 o inteiro vem da Tatu e a canaleta da Pavibloco —
   * nenhum fabricante vende essa parede. Por isso cada peça grava de
   * ONDE veio, e a tela diz isso ao usuário.
   *
   * REGRAS DE ESCOLHA (aplicadas nesta ordem):
   *  R1  Uma linha por fabricante: a estrutural de menor fbk >= 4 MPa,
   *      que é a que casa com as composições SINAPI já usadas aqui.
   *  R2  Só valor publicado com número explícito. "Aproximadamente" de
   *      tabela agregada fica fora, e o motivo vai gravado.
   *  R3b COERÊNCIA INTERNA, antes de escolher: descarta-se o valor que
   *      (i) implique espessura de parede abaixo dos 25 mm mínimos da
   *      NBR 6136, resolvendo a espessura pelo peso com y = 2200 kg/m3;
   *      ou (ii) viole relação obrigatória DENTRO do mesmo fabricante —
   *      canaleta mais leve que o inteiro, meia canaleta mais leve que
   *      o meio, meio bloco nunca menos denso que o inteiro.
   *  R3  O padrão é o valor publicado MAIS PRÓXIMO DA MEDIANA dos que
   *      sobraram. Nunca a média: média produz número que não existe em
   *      catálogo nenhum.
   *  R5  Sem fonte confiável, o peso fica NULO e o software pede ao
   *      usuário. Nunca um chute silencioso.
   *  R5b Exceção única: peça geometricamente determinada. O compensador
   *      de 4 cm não comporta vazio com parede de 25 mm, logo é maciço,
   *      e o peso sai da geometria com a fórmula à vista. Marcado como
   *      CALCULADO, nunca como referência publicada.
   *
   * y = 2200 kg/m3 é AJUSTE, não publicação: foi calibrado resolvendo a
   * espessura que reproduz os pesos publicados do 14x19x39 (dá 27,5 /
   * 29,1 / 33,5 mm, todos acima do mínimo de 25 mm da norma). Nenhum
   * fabricante publica a massa específica do concreto dele. Está escrito
   * na fórmula de cada peça calculada.
   *
   * O valor é guardado como publicado (12.476); quem arredonda para
   * 12,5 kg é a tela. Arredondar no dado quebraria a regra de que todo
   * padrão é número que existe em catálogo real.
   * ================================================================= */
  var PESOS_REF_VERSAO = "2026-07";
  var Y_CONCRETO = 2200;   /* kg/m3, calibrado — ver acima */

  function macico(l, a, c) { return Math.round(l * a * c * Y_CONCRETO * 100) / 100; }

  var PESOS_REF = {
    /* ---- família 29 (14 x 19, módulo 15) ---- */
    "29-inteiro":    { kg: 10.00, fabricante: "JB", metodo: "publicado", confianca: "media",
                       pesoMin: 9.00, pesoMax: 11.00, n: 3,
                       nota: "Original 11,79 descartado: o meio-bloco dela sai a 1418 kg/m3 contra 1528 do inteiro dela — meio menos denso que o inteiro e impossivel, porque a metade tem mais septo por volume. Sobraram Pavibloco 9,00 / JB 10,00 / ArtBlocos 11,00.",
                       confere: "o modelo geométrico calibrado na família 39 devolve 10,01 kg" },
    "29-meio":       { kg: 5.28,  fabricante: "Original", metodo: "publicado", confianca: "alta",
                       pesoMin: 5.00, pesoMax: 5.30, n: 3 },
    "29-amarr-t":    { kg: 14.90, fabricante: "Original", metodo: "publicado", confianca: "media",
                       pesoMin: 13.50, pesoMax: 14.90, n: 2 },
    "29-can-u":      { kg: 8.90,  fabricante: "Original", metodo: "publicado", confianca: "alta",
                       pesoMin: 8.00, pesoMax: 8.90, n: 2, confere: "modelo geométrico devolve 8,86 kg" },
    "29-can-u-meia": { kg: 4.61,  fabricante: "Original", metodo: "publicado", confianca: "media",
                       pesoMin: 4.61, pesoMax: 4.61, n: 1, nota: "fonte única" },
    "29-can-j":      { kg: 8.51,  fabricante: "Original", metodo: "publicado", confianca: "media",
                       pesoMin: 7.40, pesoMax: 8.51, n: 2 },
    "29-can-j-meia": { kg: null,  fabricante: "", metodo: "sem-fonte", confianca: "nenhuma", n: 0,
                       nota: "os 5,18 kg que estavam aqui são da canaleta J de 19 cm; esta peça tem 14 cm. Dimensão diferente não é aproximação." },
    "29-comp-9":     { kg: 3.40,  fabricante: "JB|Original", metodo: "publicado", confianca: "alta",
                       pesoMin: 3.40, pesoMax: 3.40, n: 2,
                       nota: "Pavibloco 1,90 descartado: implicaria parede de 10,9 mm, menos da metade do mínimo da NBR 6136." },
    "29-comp-4":     { kg: macico(0.14, 0.19, 0.04), fabricante: "", metodo: "geometrico-macico", confianca: "media",
                       formula: "0,14 x 0,19 x 0,04 x 2200 kg/m3 — peça maciça: 4 cm não comportam vazio com parede de 25 mm" },
    "29-meia-alt":   { kg: null,  fabricante: "", metodo: "sem-fonte", confianca: "nenhuma", n: 0,
                       nota: "nenhum fabricante do levantamento publica o bloco de meia altura" },

    /* ---- família 39-14 (14 x 19, módulo 20) ---- */
    "39-inteiro":    { kg: 12.476, fabricante: "Tatu", metodo: "publicado", confianca: "alta",
                       pesoMin: 11.90, pesoMax: 14.00, n: 6, catalogoRef: "linha estrutural 4,5 MPa" },
    "39-meio":       { kg: 7.00,  fabricante: "JB", metodo: "publicado", confianca: "media",
                       pesoMin: 7.00, pesoMax: 7.33, n: 2,
                       nota: "Pavibloco 5,40 descartado: implicaria parede de 22,7 mm, abaixo do mínimo de 25 mm." },
    "39-amarr-l":    { kg: 12.23, fabricante: "Original", metodo: "publicado", confianca: "media",
                       pesoMin: 10.30, pesoMax: 12.23, n: 2,
                       nota: "é a peça que mais se afasta do modelo geométrico — primeira a conferir numa balança" },
    "39-amarr-t":    { kg: 17.00, fabricante: "JB", metodo: "publicado", confianca: "alta",
                       pesoMin: 16.27, pesoMax: 17.00, n: 2, confere: "modelo geométrico devolve 17,07 kg" },
    "39-can-u":      { kg: 10.90, fabricante: "Pavibloco", metodo: "publicado", confianca: "media",
                       /* sobrou UMA fonte: min = max. Antes a faixa ia ate 13,50,
                          que e justamente o valor descartado por impossivel — a
                          tela oferecia como referencia o numero que o metodo
                          rejeitou */
                       pesoMin: 10.90, pesoMax: 10.90, n: 1,
                       nota: "os descartados pesavam o mesmo que o bloco cheio; canaleta é bloco com o septo rebaixado, tem que ser mais leve." },
    "39-can-u-meia": { kg: 6.82,  fabricante: "Original", metodo: "publicado", confianca: "media",
                       pesoMin: 6.82, pesoMax: 7.50, n: 2 },
    "39-can-j":      { kg: 10.69, fabricante: "Original", metodo: "publicado", confianca: "media",
                       pesoMin: 10.69, pesoMax: 10.69, n: 1, nota: "fonte única" },
    "39-can-comp":   { kg: 4.23,  fabricante: "", metodo: "herdado-v1", confianca: "baixa", n: 0,
                       nota: "veio da primeira versão e não achei fonte para reconferir. A geometria não recusa. Fica com pendência em vez de virar nulo — nulo sumiria da soma em silêncio." },
    "39-comp-9":     { kg: 3.40,  fabricante: "JB|Original", metodo: "publicado", confianca: "alta",
                       pesoMin: 3.40, pesoMax: 3.40, n: 2 },
    "39-comp-4":     { kg: macico(0.14, 0.19, 0.04), fabricante: "", metodo: "geometrico-macico", confianca: "media",
                       formula: "0,14 x 0,19 x 0,04 x 2200 kg/m3 — peça maciça" },
    "39-meia-alt":   { kg: null,  fabricante: "", metodo: "sem-fonte", confianca: "nenhuma", n: 0,
                       nota: "nenhum fabricante do levantamento publica o bloco de meia altura" },

    /* ---- família 39-19 (19 x 19, módulo 20) ---- */
    "39x19-inteiro":    { kg: 16.00, fabricante: "Pavibloco|JB", metodo: "publicado", confianca: "alta",
                          pesoMin: 15.90, pesoMax: 17.97, n: 4 },
    "39x19-meio":       { kg: 7.80,  fabricante: "Pavibloco", metodo: "publicado", confianca: "media",
                          pesoMin: 7.72, pesoMax: 7.80, n: 2,
                          nota: "JB 7,00 e ArtBlocos 7,50 descartados: seriam menos densos que o inteiro dos próprios fabricantes, e a metade tem mais septo por volume — é impossível." },
    "39x19-can-u":      { kg: 15.63, fabricante: "Original", metodo: "publicado", confianca: "media",
                          pesoMin: 13.00, pesoMax: 15.63, n: 2,
                          nota: "razão 0,98 contra o bloco inteiro é alta para uma canaleta — segunda peça a conferir numa balança" },
    "39x19-can-u-meia": { kg: 7.50,  fabricante: "JB", metodo: "publicado", confianca: "media",
                          pesoMin: 7.50, pesoMax: 7.50, n: 1,
                          nota: "8,56 descartado: ficaria mais pesado que o meio-bloco, e meia canaleta perde o septo." },
    "39x19-comp-9":     { kg: 4.44,  fabricante: "JB", metodo: "publicado", confianca: "media",
                          pesoMin: 4.44, pesoMax: 4.44, n: 1, nota: "fonte única" },
    "39x19-comp-4":     { kg: macico(0.19, 0.19, 0.04), fabricante: "", metodo: "geometrico-macico", confianca: "media",
                          formula: "0,19 x 0,19 x 0,04 x 2200 kg/m3 — peça maciça",
                          nota: "os 3,48 kg herdados são fisicamente impossíveis: exigiriam concreto de 2410 kg/m3, acima do vibro-prensado." }
  };

  /* Snapshot congelado, montado ANTES de qualquer troca do usuário — é para
     onde o botão de voltar ao padrão devolve. */
  var PESO_PADRAO = (function () {
    var m = {};
    for (var k in PESOS_REF) if (Object.prototype.hasOwnProperty.call(PESOS_REF, k)) m[k] = PESOS_REF[k].kg;
    return m;
  })();
  /* o revert precisa devolver também o MÉTODO e o fabricante, senão a peça
     volta ao peso de fábrica mas continua carimbada como "meu fornecedor" */
  var REF_PADRAO = (function () {
    var m = {};
    for (var k in PESOS_REF) {
      if (!Object.prototype.hasOwnProperty.call(PESOS_REF, k)) continue;
      var r = PESOS_REF[k];
      m[k] = { metodo: r.metodo, fabricante: r.fabricante, confianca: r.confianca };
    }
    return m;
  })();

  /* PESOS_REF é a fonte de verdade; o campo `peso` da peça é derivado dela.
     Peça e tabela têm que casar exatamente: peça sem entrada perderia o peso
     em silêncio, e entrada sem peça é peso que ninguém lê. */
  var PESOS_DESSINCRONIZADOS = (function () {
    var erros = [], vistos = {};
    for (var f in FAMILIAS) {
      if (!Object.prototype.hasOwnProperty.call(FAMILIAS, f)) continue;
      FAMILIAS[f].pecas.forEach(function (p) {
        vistos[p.id] = 1;
        if (!Object.prototype.hasOwnProperty.call(PESOS_REF, p.id)) { erros.push("peça " + p.id + " não tem entrada em PESOS_REF"); return; }
        p.peso = PESOS_REF[p.id].kg;
      });
    }
    for (var k in PESOS_REF) if (Object.prototype.hasOwnProperty.call(PESOS_REF, k) && !vistos[k]) erros.push("PESOS_REF tem " + k + ", que não é peça de nenhuma família");
    return erros;
  })();

  /* Classes da NBR 6136:2016 — fbk sobre a área bruta.
   * O limite de pavimentos vale para a Classe C COM função estrutural. */
  var CLASSES = {
    A: { id: "A", fbkMin: 8.0, uso: "Estrutural, acima ou abaixo do nível do solo", limitePav: null },
    B: { id: "B", fbkMin: 4.0, uso: "Estrutural, apenas acima do nível do solo", limitePav: null },
    C: { id: "C", fbkMin: 3.0, uso: "Com ou sem função estrutural", limitePav: { 0.09: 1, 0.115: 2, 0.14: 5, 0.19: 5 } }
  };

  /* Consumo de argamassa de assentamento — coeficientes da BASE SINAPI.
   * Já incluem perda: NUNCA aplicar perda por cima destes valores. */
  var ARGAMASSA_SINAPI = [
    { codigo: "89470", familia: "39-14", tecnica: "colher",  fbk: 4.5,  traco: "1:2:9",     m3porM2: 0.0168, pedreiroH: 0.62, serventeH: 0.62 },
    { codigo: "89453", familia: "39-14", tecnica: "palheta", fbk: 4.5,  traco: "1:2:9",     m3porM2: 0.0113, pedreiroH: 0.45, serventeH: 0.45 },
    { codigo: "89478", familia: "29",    tecnica: "colher",  fbk: 4.5,  traco: "1:2:9",     m3porM2: 0.0187, pedreiroH: 1.05, serventeH: 1.05 },
    { codigo: "89464", familia: "29",    tecnica: "palheta", fbk: 14.0, traco: "1:0,5:4,5", m3porM2: 0.0125, pedreiroH: 0.80, serventeH: 0.80 }
  ];

  var Blocos = {
    JUNTA_PADRAO: JUNTA_PADRAO,
    ALT_FIADA: ALT_FIADA,
    FAMILIAS: FAMILIAS,
    CLASSES: CLASSES,
    ARGAMASSA_SINAPI: ARGAMASSA_SINAPI,

    /* faixa aceitável de junta: fora disso a norma de execução não aceita
     * (e o pedreiro não consegue manter). Parametrizável pelo usuário. */
    JUNTA_MIN: 0.007,
    JUNTA_MAX: 0.013,

    familias: function () {
      var out = [];
      for (var k in FAMILIAS) out.push({ id: k, rotulo: FAMILIAS[k].rotulo, modulo: FAMILIAS[k].modulo, nota: FAMILIAS[k].nota });
      return out;
    },
    familia: function (id) { return FAMILIAS[String(id)] || null; },
    pecas: function (famId) {
      var f = this.familia(famId);
      return f ? f.pecas.slice() : [];
    },
    peca: function (famId, papel) {
      var f = this.familia(famId);
      if (!f) return null;
      for (var i = 0; i < f.pecas.length; i++) if (f.pecas[i].papel === papel) return f.pecas[i];
      return null;
    },
    pecaPorId: function (id) {
      for (var k in FAMILIAS) {
        var ps = FAMILIAS[k].pecas;
        for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
      }
      return null;
    },

    /* ---- nomenclatura ------------------------------------------------
     * Aceita "14x19x39", "14 x 19 x 39", "14X19X39". Devolve em metros e
     * DIZ quando a notação está trocada — o erro mais comum é escrever a
     * largura no lugar do comprimento ("4x19x39"), que não existe. */
    lerDimensao: function (txt) {
      var m = String(txt == null ? "" : txt).replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
      if (!m) return { ok: false, erro: "Escreva no formato largura x altura x comprimento, por exemplo 14x19x39." };
      var l = num(m[1]) / 100, a = num(m[2]) / 100, c = num(m[3]) / 100;
      if (l < 0.08) {
        return {
          ok: false, l: l, a: a, c: c,
          erro: "Não existe bloco com " + Math.round(l * 100) + " cm de largura. A ordem é largura x altura x comprimento — o compensador encurta o COMPRIMENTO.",
          sugestao: "14x19x" + (m[1].length < 2 ? "0" + m[1] : m[1])
        };
      }
      return { ok: true, l: r3(l), a: r3(a), c: r3(c) };
    },

    /* ---- contagem ---------------------------------------------------- */
    /* Peças por m² de parede — 1 / (comprimento modular × altura modular).
     * Aplicar sobre a área LÍQUIDA (descontados os vãos), que é o critério
     * de medição do SINAPI. */
    blocosPorM2: function (famId, junta) {
      var f = this.familia(famId); if (!f) return 0;
      var p = this.peca(famId, "inteiro"); if (!p) return 0;
      var j = junta != null ? num(junta) : JUNTA_PADRAO;
      var cmod = p.c + j, amod = p.a + j;
      if (!(cmod > 0) || !(amod > 0)) return 0;
      return r4(1 / (cmod * amod));
    },
    fiadas: function (alturaParede, junta) {
      var j = junta != null ? num(junta) : JUNTA_PADRAO;
      var h = num(alturaParede);
      if (!(h > 0)) return 0;
      return Math.ceil(r4(h / (0.19 + j)) - 1e-6);
    },

    /* ---- a peça certa para cada encontro -----------------------------
     * Erro clássico: usar o meio-bloco de uma família na outra. Aqui a
     * escolha é por tabela, nunca por adivinhação. */
    pecaDeEncontro: function (famId, tipo) {
      var f = this.familia(famId);
      if (!f) return { ok: false, motivo: "Família desconhecida." };
      var t = String(tipo || "").toUpperCase();
      if (famId === "39-19") {
        return { ok: true, peca: null, nota: "Nesta família o módulo da largura é igual ao do comprimento — o encontro fecha com o próprio bloco inteiro, alternando as fiadas." };
      }
      if (famId === "29") {
        if (t === "T") { var pt = this.peca("29", "amarracao-t"); return { ok: true, peca: pt, nota: "Bloco e meio (14x19x44) na fiada que atravessa." }; }
        if (t === "L") return { ok: true, peca: null, nota: "Na família 29 o canto fecha com o próprio inteiro, alternando as fiadas." };
      }
      if (famId === "39-14") {
        if (t === "T") { var p1 = this.peca("39-14", "amarracao-t"); return { ok: true, peca: p1, nota: "Bloco de amarração 14x19x54 na fiada que atravessa." }; }
        if (t === "L") { var p2 = this.peca("39-14", "amarracao-l"); return { ok: true, peca: p2, nota: "Bloco de amarração 14x19x34 no canto." }; }
      }
      if (t === "X") return { ok: true, peca: null, nota: "Encontro em cruz: alterne a direção que atravessa a cada fiada." };
      return { ok: false, motivo: "Tipo de encontro deve ser L, T ou X." };
    },

    /* ---- MODULAÇÃO DE UMA FIADA -------------------------------------
     * O coração do módulo. Dado o comprimento da parede, monta a fiada
     * com as peças do catálogo.
     *
     * A conta: n peças inteiras ocupam n·c + (n−1)·j — a última peça não
     * tem junta depois dela.
     *
     * Quando sobra um resto, há três saídas, nesta ordem de preferência:
     *   1. ABRIR OU FECHAR A JUNTA. Se existir uma junta dentro da faixa
     *      aceitável que faça a fiada fechar exata, é a melhor solução:
     *      não entra peça nenhuma e a parede fica limpa. É o que o
     *      pedreiro experiente faz no olho — aqui sai calculado.
     *   2. COMPLEMENTAR COM PEÇA (meio bloco, compensador de 9 ou de 4).
     *   3. Se nem assim fechar, avisar que vai precisar de corte — e
     *      dizer de quanto, para o usuário decidir.
     * ----------------------------------------------------------------- */
    /* JUNTA DE EXTREMIDADE (`bordas`) — a conta que confunde todo mundo.
     * Dez blocos de 39 têm NOVE juntas entre eles: 10×0,39 + 9×0,01 = 3,99 m.
     * Mas o projeto modular fala em 4,00 m, porque a cota nominal já embute a
     * junta do encontro com a parede transversal. Daí o parâmetro:
     *   bordas = 1 (padrão) — parede que encontra outra de um lado. É o caso
     *            do projeto modular: L = n × módulo, e 4,00 m fecha exato.
     *   bordas = 0 — parede solta nas duas pontas (uma mureta, por exemplo):
     *            L = n×c + (n−1)×j, e aí o que fecha exato é 3,99 m.
     *   bordas = 2 — parede entre duas transversais, contando as duas juntas.
     * Sem isto, o mesmo trecho de parede dá "não fecha" ou "fecha" conforme
     * quem digitou a cota — e ninguém entende por quê. */
    modularFiada: function (comprimento, famId, opts) {
      opts = opts || {};
      var f = this.familia(famId);
      var inteiro = this.peca(famId, "inteiro");
      if (!f || !inteiro) return { ok: false, motivo: "Família desconhecida." };

      var L = num(comprimento);
      if (!(L > 0)) return { ok: false, motivo: "Comprimento precisa ser maior que zero." };

      var jAlvo = opts.junta != null ? num(opts.junta) : JUNTA_PADRAO;
      var jMin = opts.juntaMin != null ? num(opts.juntaMin) : this.JUNTA_MIN;
      var jMax = opts.juntaMax != null ? num(opts.juntaMax) : this.JUNTA_MAX;
      var tol = opts.tolerancia != null ? num(opts.tolerancia) : 0.002;  // 2 mm
      var permitirAjuste = opts.ajustarJunta !== false;
      var bordas = opts.bordas != null ? Math.max(0, Math.min(2, Math.round(num(opts.bordas)))) : 1;
      var c = inteiro.c;

      /* nº de juntas = (n − 1) entre as peças + as de extremidade */
      function juntasDe(n) { return Math.max(0, n - 1) + bordas; }

      var n = Math.floor((L + jAlvo * (1 - bordas)) / (c + jAlvo) + 1e-9);
      if (n < 1) {
        return this._fiadaSoComplemento(L, famId, jAlvo, tol, bordas);
      }
      var ocupado = n * c + juntasDe(n) * jAlvo;
      var resto = r4(L - ocupado);

      /* 1) fecha exato na junta padrão? */
      if (Math.abs(resto) <= tol) {
        return this._fiada(famId, [{ peca: inteiro, qtd: n }], jAlvo, L, 0, "Fecha exato com bloco inteiro.", bordas);
      }

      /* 2) existe junta dentro da faixa que fecha exato? */
      if (permitirAjuste) {
        var nj = juntasDe(n);
        if (nj > 0) {
          var jExato = (L - n * c) / nj;
          if (jExato >= jMin && jExato <= jMax) {
            return this._fiada(famId, [{ peca: inteiro, qtd: n }], jExato, L, 0,
              "Junta ajustada para " + (Math.round(jExato * 1000)) + " mm — fecha sem peça de compensação.", bordas);
          }
        }
        /* e com uma peça a mais? (junta mais fechada) */
        var n2 = n + 1, nj2 = juntasDe(n2);
        if (nj2 > 0) {
          var jExato2 = (L - n2 * c) / nj2;
          if (jExato2 >= jMin && jExato2 <= jMax) {
            return this._fiada(famId, [{ peca: inteiro, qtd: n2 }], jExato2, L, 0,
              "Cabe mais um bloco fechando a junta para " + (Math.round(jExato2 * 1000)) + " mm — sem peça de compensação.", bordas);
          }
        }
      }

      /* 3) completar com peça: meio bloco, compensador de 9, de 4 */
      var comp = this._melhorComplemento(resto, famId, jAlvo, tol);
      if (comp.pecas.length) {
        var lista = [{ peca: inteiro, qtd: n }].concat(comp.pecas);
        return this._fiada(famId, lista, jAlvo, L, comp.sobra,
          comp.sobra > tol
            ? "Completado com peça, mas ainda sobram " + Math.round(comp.sobra * 1000) + " mm — vai precisar de corte."
            : "Completado com peça de compensação.", bordas);
      }

      /* 4) não fechou */
      return this._fiada(famId, [{ peca: inteiro, qtd: n }], jAlvo, L, resto,
        "Sobram " + Math.round(resto * 1000) + " mm. Ajuste o comprimento da parede para um múltiplo de " +
        Math.round(f.modulo * 100) + " cm, ou aceite o corte.", bordas);
    },

    _fiadaSoComplemento: function (L, famId, j, tol, bordas) {
      var comp = this._melhorComplemento(L, famId, j, tol);
      if (!comp.pecas.length) return { ok: false, motivo: "Parede curta demais para qualquer peça desta família." };
      return this._fiada(famId, comp.pecas, j, L, comp.sobra, "Parede curta: resolvida só com peça de compensação.", bordas);
    },

    /* acha a combinação de até 2 peças de complemento que melhor preenche `resto` */
    _melhorComplemento: function (resto, famId, j, tol) {
      var f = this.familia(famId);
      var cands = [];
      f.pecas.forEach(function (p) {
        if (p.papel === "meio" || p.papel === "compensador") cands.push(p);
      });
      cands.sort(function (a, b) { return b.c - a.c; });   // maior primeiro

      var melhor = { pecas: [], sobra: resto };
      /* uma peça */
      for (var i = 0; i < cands.length; i++) {
        var s = r4(resto - (j + cands[i].c));
        if (Math.abs(s) <= tol) return { pecas: [{ peca: cands[i], qtd: 1 }], sobra: 0 };
        if (s > 0 && s < melhor.sobra) melhor = { pecas: [{ peca: cands[i], qtd: 1 }], sobra: s };
      }
      /* duas peças */
      for (var a = 0; a < cands.length; a++) {
        for (var b = a; b < cands.length; b++) {
          var s2 = r4(resto - (j + cands[a].c) - (j + cands[b].c));
          if (Math.abs(s2) <= tol) {
            return a === b
              ? { pecas: [{ peca: cands[a], qtd: 2 }], sobra: 0 }
              : { pecas: [{ peca: cands[a], qtd: 1 }, { peca: cands[b], qtd: 1 }], sobra: 0 };
          }
          if (s2 > 0 && s2 < melhor.sobra) {
            melhor = a === b
              ? { pecas: [{ peca: cands[a], qtd: 2 }], sobra: s2 }
              : { pecas: [{ peca: cands[a], qtd: 1 }, { peca: cands[b], qtd: 1 }], sobra: s2 };
          }
        }
      }
      return melhor;
    },

    _fiada: function (famId, lista, junta, L, sobra, nota, bordas) {
      var b = bordas != null ? bordas : 1;
      var self = this;
      var nPecas = 0, comprimentoPecas = 0, peso = 0, semPeso = 0, semPesoIds = [];
      lista.forEach(function (x) {
        nPecas += x.qtd;
        comprimentoPecas += x.qtd * x.peca.c;
        /* o peso sai de pesoDe(id), não do objeto: o objeto pode ser o
           fallback da remontagem da fiada par, e aí seria o peso errado */
        var kg = self.pesoDe(x.peca.id);
        if (kg == null) { semPeso += x.qtd; if (semPesoIds.indexOf(x.peca.id) < 0) semPesoIds.push(x.peca.id); }
        else peso += x.qtd * kg;
      });
      var nJuntas = Math.max(0, nPecas - 1) + b;
      return {
        ok: true, familia: famId, comprimento: r4(L),
        junta: r4(junta), juntaAjustada: Math.abs(junta - JUNTA_PADRAO) > 1e-9,
        bordas: b, nJuntas: nJuntas,
        /* cada peça carrega DE ONDE veio o peso dela — a proveniência mora
           no dado, não só na tela, senão nenhum teste consegue verificá-la */
        pecas: lista.map(function (x) {
          var o = self.origemDoPeso(x.peca.id);
          return { id: x.peca.id, nome: x.peca.nome, papel: x.peca.papel,
                   comprimento: x.peca.c, qtd: x.qtd, peso: self.pesoDe(x.peca.id),
                   origem: o.fonte, selo: o.rotulo, fabricante: o.fabricante,
                   confianca: o.confianca, faixa: o.faixa, formula: o.formula };
        }),
        nPecas: nPecas, sobra: r4(Math.max(0, sobra)), fecha: r4(sobra) <= 0.002,
        peso: r3(peso), pecasSemPeso: semPeso, pecasSemPesoIds: semPesoIds,
        ocupado: r4(comprimentoPecas + nJuntas * junta),
        nota: nota
      };
    },

    /* ---- PAREDE INTEIRA ---------------------------------------------
     * Empilha as fiadas. Fiada par e ímpar se alternam (a amarração é
     * justamente isso: a junta vertical de uma fiada cai no meio do
     * bloco da fiada de baixo). */
    modularParede: function (comprimento, altura, famId, opts) {
      opts = opts || {};
      var f = this.familia(famId);
      if (!f) return { ok: false, motivo: "Família desconhecida." };
      var j = opts.junta != null ? num(opts.junta) : JUNTA_PADRAO;
      var nFiadas = this.fiadas(altura, j);
      if (!(nFiadas > 0)) return { ok: false, motivo: "Altura precisa ser maior que zero." };

      var impar = this.modularFiada(comprimento, famId, opts);
      if (!impar.ok) return impar;

      /* fiada par: começa com meio bloco para deslocar a junta vertical */
      var meio = this.peca(famId, "meio");
      var par = impar;
      if (meio) {
        var restante = r4(num(comprimento) - meio.c - j);
        if (restante > 0) {
          var resto = this.modularFiada(restante, famId, opts);
          if (resto.ok) {
            /* Se o id não for achado, a peça vira MEIO-BLOCO em silêncio e o
               peso e o comprimento saem errados. Não pode acontecer — mas se
               acontecer, tem que aparecer, não virar outra peça. */
            var perdidas = [];
            var lista = [{ peca: meio, qtd: 1 }].concat(resto.pecas.map(function (p) {
              var pc = Blocos.pecaPorId(p.id);
              if (!pc) { perdidas.push(p.id); pc = meio; }
              return { peca: pc, qtd: p.qtd };
            }));
            par = this._fiada(famId, lista, resto.junta, num(comprimento), resto.sobra, "Fiada par: começa com meio bloco para amarrar.");
            if (perdidas.length) par.pecasPerdidas = perdidas;
          }
        }
      }

      var nImpares = Math.ceil(nFiadas / 2), nPares = nFiadas - nImpares;
      var total = {}, peso = 0, semPeso = 0, semPesoIds = [], pesoDoUsuario = 0;
      var fabricantes = [], calculadas = [];
      function soma(fiada, vezes) {
        fiada.pecas.forEach(function (p) {
          if (!total[p.id]) total[p.id] = { id: p.id, nome: p.nome, papel: p.papel, qtd: 0, peso: p.peso,
            origem: p.origem, selo: p.selo, fabricante: p.fabricante, confianca: p.confianca,
            faixa: p.faixa, formula: p.formula };
          total[p.id].qtd += p.qtd * vezes;
          if (p.peso == null) {
            semPeso += p.qtd * vezes;
            if (semPesoIds.indexOf(p.id) < 0) semPesoIds.push(p.id);
          } else {
            var kg = p.qtd * vezes * p.peso;
            peso += kg;
            if (p.origem === "informado") pesoDoUsuario += kg;
            if (p.origem === "geometrico-macico" && calculadas.indexOf(p.id) < 0) calculadas.push(p.id);
            /* o campo pode trazer mais de um fabricante ("JB|Original"): sem
               separar, a contagem dizia 2 e a lista mostrava 3 nomes repetidos */
            if (p.fabricante) String(p.fabricante).split("|").forEach(function (f) {
              f = f.trim();
              if (f && fabricantes.indexOf(f) < 0) fabricantes.push(f);
            });
          }
        });
      }
      soma(impar, nImpares); soma(par, nPares);

      var lista = [];
      for (var k in total) lista.push(total[k]);
      lista.sort(function (a, b) { return b.qtd - a.qtd; });

      return {
        ok: true, familia: famId, familiaRotulo: f.rotulo,
        comprimento: r4(num(comprimento)), altura: r4(num(altura)),
        area: r4(num(comprimento) * num(altura)),
        junta: r4(j), nFiadas: nFiadas, alturaReal: r4(nFiadas * (0.19 + j)),
        fiadaImpar: impar, fiadaPar: par,
        pecas: lista, nPecas: lista.reduce(function (s, p) { return s + p.qtd; }, 0),
        peso: r3(peso), pecasSemPeso: semPeso, pecasSemPesoIds: semPesoIds,
        /* ---- proveniência do peso, no DADO ---- */
        pesosVersao: PESOS_REF_VERSAO,
        /* a fatia em KG, não em contagem de peças: informar só o bloco
           inteiro é 1 peça e cobre uns 75% do peso */
        pesoDoUsuarioPct: peso > 0 ? Math.round(pesoDoUsuario / peso * 100) : 0,
        pecasCalculadas: calculadas,
        fabricantes: fabricantes,
        /* o total é um piso, não o peso final: falta peça sem peso, e a
           canaleta, a verga e a cinta não entram na soma desta versão */
        parcial: semPeso > 0,
        escopoDoPeso: "só os blocos das fiadas — não inclui canaleta, verga, cinta, amarração nem a argamassa de assentamento",
        fecha: impar.fecha && par.fecha,
        avisos: this._avisosParede(impar, par, f, num(comprimento))
      };
    },

    _avisosParede: function (impar, par, f, L) {
      var av = [];
      if (!impar.fecha) av.push("A fiada ímpar não fecha: sobram " + Math.round(impar.sobra * 1000) + " mm.");
      if (!par.fecha) av.push("A fiada par não fecha: sobram " + Math.round(par.sobra * 1000) + " mm.");
      if (impar.juntaAjustada) av.push("Junta ajustada para " + Math.round(impar.junta * 1000) + " mm — confira se a execução aceita.");
      var modulos = L / f.modulo;
      if (Math.abs(modulos - Math.round(modulos)) > 0.02) {
        av.push("O comprimento não é múltiplo de " + Math.round(f.modulo * 100) + " cm. O múltiplo mais próximo é " +
          (Math.round(modulos) * f.modulo).toFixed(2) + " m.");
      }
      if (impar.pecasSemPeso || par.pecasSemPeso) av.push("Há peças sem peso de catálogo — informe o peso do seu fornecedor para o cálculo de carga.");
      return av;
    },

    /* ---- argamassa ---------------------------------------------------
     * Dois modos, de propósito:
     *  · "orcamento" usa o coeficiente do SINAPI (já tem perda dentro) —
     *    é o que vai para a planilha e para a licitação;
     *  · "geometrico" calcula pela geometria da junta — é o que casa com
     *    o modelo 3D e responde "e se eu mudar a junta?".
     * Misturar os dois (aplicar perda sobre o SINAPI) inflaria o custo. */
    argamassaAssentamento: function (areaM2, famId, opts) {
      opts = opts || {};
      var modo = opts.modo || "orcamento";
      var A = num(areaM2);
      if (!(A > 0)) return { ok: false, motivo: "Área precisa ser maior que zero." };

      if (modo === "orcamento") {
        var tec = opts.tecnica || "colher";
        var achado = null;
        for (var i = 0; i < ARGAMASSA_SINAPI.length; i++) {
          var r = ARGAMASSA_SINAPI[i];
          if (r.familia === famId && r.tecnica === tec) { achado = r; break; }
        }
        if (!achado) {
          return { ok: false, motivo: "Não há coeficiente SINAPI para " + famId + " com " + tec + ". Use o modo geométrico ou informe o consumo." };
        }
        return {
          ok: true, modo: "orcamento", fonte: "SINAPI " + achado.codigo, tecnica: tec, traco: achado.traco,
          m3porM2: achado.m3porM2, volume: r4(A * achado.m3porM2),
          pedreiroH: r3(A * achado.pedreiroH), serventeH: r3(A * achado.serventeH),
          nota: "Coeficiente da base SINAPI — já inclui perdas. Não aplique perda por cima."
        };
      }

      var f = this.familia(famId), inteiro = this.peca(famId, "inteiro");
      if (!f || !inteiro) return { ok: false, motivo: "Família desconhecida." };
      var j = opts.junta != null ? num(opts.junta) : JUNTA_PADRAO;
      var cmod = inteiro.c + j, amod = inteiro.a + j;
      /* cordão duplo assenta só sobre os dois septos longitudinais */
      var larguraEfetiva = opts.cordaoDuplo
        ? (opts.larguraSepto != null ? num(opts.larguraSepto) * 2 : (inteiro.l >= 0.19 ? 0.064 : 0.050))
        : inteiro.l;
      var v = (1 / amod + 1 / cmod) * j * larguraEfetiva;
      return {
        ok: true, modo: "geometrico", fonte: "geometria da junta",
        m3porM2: r4(v), volume: r4(A * v), junta: j, larguraEfetiva: r3(larguraEfetiva),
        nota: opts.cordaoDuplo ? "Cordão duplo, sobre os septos." : "Junta cheia, em toda a largura.",
        aviso: "Cálculo geométrico, SEM perda. Para a planilha, use o modo orçamento."
      };
    },

    /* ---- validação de uso -------------------------------------------- */
    validarClasse: function (classe, larguraM, pavimentos, estrutural, abaixoDoSolo) {
      var C = CLASSES[String(classe || "").toUpperCase()];
      if (!C) return { ok: false, motivo: "Classe deve ser A, B ou C." };
      if (abaixoDoSolo && C.id !== "A") {
        return { ok: false, motivo: "Abaixo do nível do solo a NBR 6136 exige Classe A." };
      }
      if (C.id === "B" && abaixoDoSolo) return { ok: false, motivo: "Classe B só é permitida acima do nível do solo." };
      if (C.id === "C" && estrutural) {
        var lim = C.limitePav[num(larguraM)];
        if (lim == null) return { ok: true, aviso: "Largura fora da tabela de limite da Classe C — confira a norma." };
        if (num(pavimentos) > lim) {
          return { ok: false, motivo: "Classe C com " + Math.round(num(larguraM) * 100) + " cm suporta no máximo " + lim + " pavimento(s) com função estrutural." };
        }
      }
      return { ok: true, motivo: "" };
    },

    /* peso é dado de fabricante: o usuário sobrescreve o default */
    /* ================================================================
     * PESO: referência do sistema × catálogo do fornecedor
     *
     * O peso vem pré-definido para o orçamento fechar sozinho, e o
     * usuário troca depois pelo catálogo de quem ele compra. A regra é
     * que ele NUNCA fique sem saber de onde veio o número.
     * ================================================================ */
    PESOS_REF: PESOS_REF,
    PESOS_REF_VERSAO: PESOS_REF_VERSAO,
    PESO_PADRAO: PESO_PADRAO,
    Y_CONCRETO: Y_CONCRETO,
    /* peças e tabela têm que casar — o teste falha se dessincronizar */
    dessincronizados: function () { return PESOS_DESSINCRONIZADOS.slice(); },

    /* Fonte única do peso. Resolve por ID, não por objeto: a remontagem
       da fiada par cai num fallback para o meio-bloco quando o id não é
       achado, e isso trocaria o peso da peça em silêncio. */
    pesoDe: function (pecaId) {
      var id = String(pecaId);
      var ref = PESOS_REF[id];
      return ref ? ref.kg : null;
    },

    /* De onde veio este número — é o que a tela mostra ao lado da peça. */
    origemDoPeso: function (pecaId) {
      var id = String(pecaId), ref = PESOS_REF[id];
      if (!ref) return { fonte: "desconhecida", rotulo: "peça fora do catálogo" };
      var rot = { "publicado": "REFERÊNCIA", "geometrico-macico": "CALCULADO",
                  "herdado-v1": "SEM FONTE", "sem-fonte": "SEM FONTE",
                  "informado": "MEU FORNECEDOR" }[ref.metodo] || "REFERÊNCIA";
      return {
        fonte: ref.metodo, rotulo: rot, kg: ref.kg,
        fabricante: ref.fabricante || "", confianca: ref.confianca || "",
        faixa: (ref.pesoMin != null && ref.pesoMax != null && ref.pesoMin !== ref.pesoMax)
          ? { min: ref.pesoMin, max: ref.pesoMax, n: ref.n || 0 } : null,
        formula: ref.formula || "", nota: ref.nota || "", confere: ref.confere || "",
        versao: PESOS_REF_VERSAO
      };
    },

    /* Confere se um peso digitado é possível PARA AQUELA PEÇA, pela massa
       específica aparente. Uma faixa fixa em kg deixaria passar erro de
       vírgula num compensador e recusaria um bloco de 19 legítimo. */
    plausibilidade: function (pecaId, kg) {
      var p = this.pecaPorId(pecaId);
      if (!p) return { ok: false, motivo: "Peça desconhecida." };
      var v = num(kg);
      if (!(v > 0)) return { ok: false, motivo: "O peso tem que ser maior que zero." };
      var vol = p.l * p.a * p.c;
      var d = v / vol;
      /* concreto vibro-prensado maciço não passa de 2400; bloco vazado bom
         fica entre 1000 e 1550 de massa específica aparente */
      if (d > 2400) return { ok: false, motivo: "Com " + v.toFixed(2) + " kg esta peça teria " + Math.round(d) +
        " kg/m³ — acima do concreto maciço. Confira a vírgula." };
      if (d < 700) return { ok: false, motivo: "Com " + v.toFixed(2) + " kg esta peça teria " + Math.round(d) +
        " kg/m³ — leve demais para bloco de concreto. Confira a unidade (é kg por peça, não por m²)." };
      if (d < 1000 || d > 1750) return { ok: true, suspeito: true, densidade: Math.round(d),
        motivo: "Possível, mas fora do usual: " + Math.round(d) + " kg/m³. O comum fica entre 1000 e 1550." };
      return { ok: true, suspeito: false, densidade: Math.round(d) };
    },

    /* O usuário informa o peso do fornecedor dele.
       Contrato novo: devolve {ok, motivo}. Peso zero ou negativo é RECUSA,
       não apagamento — antes, digitar 0 zerava o padrão sem avisar. */
    definirPeso: function (pecaId, kg, meta) {
      var p = this.pecaPorId(pecaId);
      if (!p) return { ok: false, motivo: "Peça desconhecida: " + pecaId + "." };
      var pl = this.plausibilidade(pecaId, kg);
      if (!pl.ok) return { ok: false, motivo: pl.motivo };
      var v = num(kg);
      var ref = PESOS_REF[String(pecaId)];
      /* digitar o MESMO valor da referência CONFIRMA em vez de sobrescrever:
         é o dado mais valioso que isto coleta — alguém conferiu e bateu */
      var padrao = PESO_PADRAO[String(pecaId)];
      var confirma = padrao != null && Math.abs(v - padrao) < 0.005;
      ref.kg = v;
      ref.metodo = confirma ? "publicado" : "informado";
      ref.confirmado = !!confirma;
      ref.fabricante = (meta && meta.fabricante) || (confirma ? ref.fabricante : "");
      ref.catalogoRef = (meta && meta.catalogoRef) || "";
      ref.coletadoEm = (meta && meta.coletadoEm) || "";
      ref.confianca = confirma ? ref.confianca : "informada";
      p.peso = v;
      return { ok: true, confirmado: confirma, suspeito: !!pl.suspeito, motivo: pl.motivo || "" };
    },

    /* Carrega o catálogo do fornecedor desta empresa por cima da referência.
     * RESTAURA o padrão antes, senão o peso de uma empresa vaza para a outra
     * quando o usuário troca de conta sem recarregar a página.
     * Todo acesso ao Store é guardado: este motor tem que rodar em Node puro. */
    _ovrEmpresa: null,
    usarOverrides: function (empresaId) {
      var self = this;
      /* 1) volta tudo ao padrão de fábrica */
      for (var id in PESOS_REF) if (Object.prototype.hasOwnProperty.call(PESOS_REF, id)) this.reverterPeso(id);
      this._ovrEmpresa = empresaId || null;
      if (!empresaId || typeof Store === "undefined" || !Store.listar) return { ok: true, aplicados: 0, semStore: true };

      var regs = [];
      try { regs = Store.listar(empresaId, "pesos_bloco") || []; } catch (e) { return { ok: false, motivo: "Não consegui ler os pesos salvos." }; }
      var n = 0, recusados = [];
      regs.forEach(function (r) {
        if (!r || !r.pecaId) return;
        var res = self.definirPeso(r.pecaId, r.kg, { fabricante: r.fabricante, catalogoRef: r.catalogoRef, coletadoEm: r.coletadoEm });
        if (res.ok) n++; else recusados.push({ pecaId: r.pecaId, motivo: res.motivo });
      });
      return { ok: true, aplicados: n, recusados: recusados, empresaId: empresaId };
    },

    /* A empresa carregada bate com a de agora? Se não bater, nenhum selo de
       "meu fornecedor" pode ser pintado — selo verde errado compra mais
       confiança do que selo nenhum. */
    overridesConferem: function (empresaId) {
      return this._ovrEmpresa === (empresaId || null);
    },

    /* Volta ao padrão de fábrica desta peça. */
    reverterPeso: function (pecaId) {
      var id = String(pecaId), ref = PESOS_REF[id], p = this.pecaPorId(id);
      if (!ref) return { ok: false, motivo: "Peça desconhecida: " + pecaId + "." };
      var pad = REF_PADRAO[id] || {};
      ref.kg = PESO_PADRAO[id];
      ref.metodo = pad.metodo;             /* volta o carimbo, não só o número */
      ref.fabricante = pad.fabricante;
      ref.confianca = pad.confianca;
      ref.confirmado = false;
      ref.catalogoRef = "";
      ref.coletadoEm = "";
      if (p) p.peso = ref.kg;
      return { ok: true, kg: ref.kg };
    },

    /* Peso por m² de parede pronta — DOIS números, nunca misturados.
       Um é só o bloco (compra, frete, carga no piso da obra); o outro é o
       de projeto da NBR 6120, que já inclui argamassa e graute. Dividir um
       pelo outro, ou somar, é erro. */
    pesoParedePorM2: function (famId) {
      var f = FAMILIAS[String(famId)];
      if (!f) return { ok: false, motivo: "Família desconhecida." };
      var inteiro = null;
      f.pecas.forEach(function (p) { if (p.papel === "inteiro") inteiro = p; });
      if (!inteiro || inteiro.peso == null) return { ok: false, motivo: "Sem peso de bloco inteiro nesta família." };
      /* peças por m²: aritmética do módulo, não fonte de fabricante */
      var pecasM2 = 1 / ((inteiro.c + JUNTA_PADRAO) * ALT_FIADA);
      return {
        ok: true,
        porPecas: {
          kgM2: Math.round(pecasM2 * inteiro.peso * 10) / 10,
          pecasM2: Math.round(pecasM2 * 100) / 100,
          rotulo: "só os blocos — para compra, frete e carga no piso da obra",
          nota: "peças por m² é aritmética do módulo (1 ÷ (comprimento+junta) ÷ altura de fiada), não dado de fabricante"
        },
        porNorma: {
          rotulo: "valor de projeto — já inclui argamassa; é este que se lança na estrutura",
          nota: "a diferença para o peso dos blocos é a argamassa de assentamento (~21 kg/m²) mais o graute dos furos cheios",
          conferido: false,
          aviso: "os valores da NBR 6120 embarcados aqui vêm de espelho, não do PDF oficial da ABNT — confira antes de usar em memorial de cálculo"
        }
      };
    },
    NORMA_CONFERIDA: false
  };

  global.Blocos = Blocos;
  if (typeof module !== "undefined" && module.exports) module.exports = Blocos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

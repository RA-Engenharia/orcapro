/* =====================================================================
 * eletilumdados.js — OS NÚMEROS DA LIGAÇÃO ELÉTRICA DA ILUMINAÇÃO (dados, sem lógica)
 *
 * Fonte: a pesquisa de 20/10/2026 em docs/eletrica/pesquisa/ (RESUMO.md, REGRAS-AMBIENTE.md,
 * CIRCUITOS-QUADRO.md e dados/*.json). Cada valor leva a etiqueta da pesquisa:
 *   primaria-lida · secundaria-lida · sem-fonte-conferir · decisao-ra
 * "sem-fonte-conferir" = o valor usual da prática, que a pesquisa NÃO achou no texto da norma (a NBR 5410
 * não está na biblioteca da RA). O motor usa e LISTA na tela como "conferir no exemplar licenciado".
 * tools/test-eletilum.js confere cada número contra o JSON da pesquisa (nada de número de cabeça aqui).
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = {
    versao: 1,
    fontes: {
      F_PROCOBRE: "Procobre/H. Moreno — NBR 5410 (slides), secundária lida",
      F_ENG360: "engenharia360 — tomadas, interruptores e demais pontos (blog, sem item de norma)",
      F_SINAPI_MG: "SINAPI MG 06/2026 (descrições oficiais das composições)",
      F_CEMIG51: "CEMIG ND-5.1 rev. MAR/2026",
      F_NBR5410: "ABNT NBR 5410:2004 — cópia de consulta (6.2.6.1.1/Tabela 47 e 6.2.11.1.6 lidos em 21/10/2026; exemplar licenciado pendente)",
      F_NBR9050: "ABNT NBR 9050:2020 — 4.6.9, Figura 26 (lida em 21/10/2026)"
    },
    valores: {
      /* altura do centro do interruptor (pontos-por-ambiente.json → alturas[id=interruptor]) */
      alturaInterruptor: { valor: 1.00, faixa: [0.60, 1.00], unidade: "m", fonte: "F_NBR9050", tipo: "primaria-lida",
        item: "NBR 9050:2020 4.6.9, Figura 26: interruptor 0,60–1,00 m (a NBR 5410 não fixa)", origem: "pontos-por-ambiente.json alturas.interruptor" },
      /* do batente (face do marco) à borda da placa, do lado da maçaneta (regras[id=interruptor_lado_macaneta]) */
      distBatente: { valor: 0.10, faixa: [0.10, 0.15], unidade: "m", fonte: "F_ENG360", tipo: "decisao-ra",
        item: "interruptor do lado da maçaneta, 10–15 cm do batente, fora do arco da folha", origem: "pontos-por-ambiente.json regras.interruptor_lado_macaneta" },
      /* seção do condutor do circuito de iluminação (dimensionamento.json → secaoMinima; criterioMotor.iluminacao) */
      secaoIluminacao: { valor: 1.5, unidade: "mm²", fonte: "F_NBR5410", tipo: "primaria-lida",
        item: "Tabela 47 (seção mínima, cobre): iluminação 1,5 mm²", origem: "dimensionamento.json secaoMinima" },
      /* carga mínima de iluminação do cômodo (pontos-por-ambiente.json → iluminacao.cargaMinima) */
      cargaMinima: { ateM2: 6, vaBase: 100, passoM2: 4, vaPasso: 60, fonte: "F_PROCOBRE", tipo: "secundaria-lida",
        item: "NBR 5410 9.5.2.1.2 (a, b)", origem: "pontos-por-ambiente.json iluminacao.cargaMinima" },
      /* teto do circuito de iluminação (dimensionamento.json → divisaoCircuitos.criterioMotor.iluminacao) */
      limiteCircuito: { va: 1270, a: 10, fonte: "F_PROCOBRE", tipo: "decisao-ra",
        item: "recomendação de projeto (10 A a 127 V), não limite normativo", origem: "dimensionamento.json criterioMotor.iluminacao" },
      /* tensão fase-neutro da rede secundária (pontos-por-ambiente.json → tensao) */
      tensao: { valor: 127, fonte: "F_CEMIG51", tipo: "primaria-lida", item: "Tabelas 1 e 2 (rede 127/220 V)", origem: "pontos-por-ambiente.json" },
      /* eletroduto pelo número de condutores — REGRA PROVISÓRIA da pesquisa (sem o Ø externo dos cabos e o Ø interno do eletroduto
         não dá para calcular a ocupação; CIRCUITOS-QUADRO.md "regra provisória marcada") */
      dnPorCondutores: { regra: [[3, 20], [6, 25], [99, 32]], fonte: "F_NBR5410", tipo: "sem-fonte-conferir",
        item: "NBR 5410 6.2.11.1.6: ocupação ≤ 40% (3+ condutores) e ≤ 15 m sem caixa (−3 m por curva); a contagem abaixo é regra RA, conferir o Ø interno do catálogo: DN 20 até 3 cabos de 1,5–2,5 mm²; DN 25 até 6; DN 32 acima", origem: "CIRCUITOS-QUADRO.md" },
      /* placa 4×2 com 3 postos: até 3 módulos na caixa 4×2 (decisão RA, catálogo das placas 4×2 de 3 postos) */
      modulosCaixa4x2: { valor: 3, tipo: "decisao-ra", item: "caixa 4×2 com placa de 3 postos; 4 módulos ou mais: caixa 4×4" }
    },
    /* PE em todo circuito (dimensionamento.json → divisaoCircuitos.regras[id=pe_todos_circuitos]): o terra vai a cada ponto de luz */
    terraEmTodoPontoDeLuz: { valor: true, fonte: "F_PROCOBRE", tipo: "secundaria-lida", origem: "dimensionamento.json pe_todos_circuitos" }
  };
  global.EletIlumDados = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

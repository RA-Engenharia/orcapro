/* =====================================================================
 * icarcatalogo.js — CATÁLOGO DE EQUIPAMENTOS DE IÇAMENTO (guindastes e muncks)
 *
 * O QUE ESTE ARQUIVO É
 * Dados, não regra: as TABELAS DE CARGA de guindastes telescópicos e de
 * guindastes articulados (munck) mais usados no Brasil, exatamente como estão
 * nos documentos dos fabricantes, com a fonte ao lado de cada modelo. Quem
 * calcula é o js/icarplano.js.
 *
 * ⚠ NENHUM NÚMERO AQUI FOI ESTIMADO. Levantamento de 01/10/2026 (PDFs dos
 *   fabricantes, valores tirados pela posição do texto e conferidos contra a
 *   página renderizada). `status` de cada tabela:
 *     "C" — o número está escrito no PDF/página oficial;
 *     "V" — está impresso no gráfico (imagem), lido a 300 dpi: CONFERIR na
 *           placa de carga do equipamento antes de usar no plano.
 *   O que o documento não traz fica null — nunca preenchido "de cabeça".
 * ⚠ A TABELA DO FABRICANTE NÃO É A DO EQUIPAMENTO QUE CHEGA NA OBRA. Variante,
 *   contrapeso, patola, ADC, lança a 20°… a capacidade de verdade é a da placa
 *   na cabine (NR-18 18.10.1.25e). O plano mostra isso em todas as folhas, e
 *   aceita a tabela do equipamento real ("Outro equipamento").
 * ⚠ Guindaste: os valores INCLUEM o moitão e os acessórios — o peso deles
 *   entra na carga do içamento (nota dos fabricantes).
 *
 * Unidades: tabelas de guindaste em toneladas (como os PDFs da Liebherr) ou
 * kg (XCMG/Sany) — o campo `unidade` diz; munck sempre em kg. Raio em metros.
 * ===================================================================== */
(function (global) {
  "use strict";

  var LIEB = "https://assets-cdn.liebherr.com/versions/";
  /* guindaste: tabela = { unidade, condicao, lancas: [m…], linhas: [[raio, [cap por lança, null = não tabelado]], …] } */
  var GUINDASTES = [
    { id: "liebherr-ltm-1030-2-1", fabricante: "Liebherr", modelo: "LTM 1030-2.1", classe: "35 t (30,3 t em 360°)",
      fonte: { doc: "Technical Data LTM 1030-2.1 — td-200-02-defisr02-2023", url: LIEB + "a209e3e9-6cd0-4a9e-9764-7f213091b51b/original/" },
      lanca_m: [9.2, 30], altura_max_m: 44, raio_max_m: 40, contrapeso_t: 5.5, eixos: 2, dim_m: [10.31, 2.55, 3.55],
      patolas_m: [6.305, 6.028], patolas_status: "inferido do desenho de dimensões", forca_patola_kN: [230, 300], moitao_kg: null,
      notas: ["35 t a 3 m só com a lança para trás; em 360° a lança mínima dá 30,3 t a 3 m", "acima de 31,9 t só com moitão adicional"],
      tabela: { status: "C", unidade: "t", condicao: "contrapeso 5,5 t, patolas totalmente estendidas, 360°, sem jib", lancas: [9.2, 14.4, 19.6, 24.8, 30],
        linhas: [[3, [30.3, 19.3, null, null, null]], [3.5, [27.3, 19.8, 17.3, null, null]], [4, [24.9, 20.3, 17.6, 13, null]], [5, [20.7, 20.6, 17.3, 13, 8.3]],
          [6, [16.9, 17.1, 16, 13, 8.3]], [7, [null, 14.2, 13.5, 12, 8.3]], [8, [null, 11.4, 11.3, 10.7, 7.9]], [9, [null, 9.4, 9.5, 9.2, 7.6]],
          [10, [null, 7.9, 8, 8, 7.2]], [12, [null, 5.9, 6, 6, 6]], [14, [null, null, 4.6, 4.7, 4.7]], [16, [null, null, 3.7, 3.8, 3.8]],
          [18, [null, null, null, 3.1, 3.1]], [20, [null, null, null, 2.5, 2.5]], [22, [null, null, null, 2.1, 2.1]], [24, [null, null, null, null, 1.7]],
          [26, [null, null, null, null, 1.4]]] } },
    { id: "liebherr-ltm-1040-2-1", fabricante: "Liebherr", modelo: "LTM 1040-2.1", classe: "40 t (30,6 t em 360°)",
      fonte: { doc: "Technical Data LTM 1040-2.1 — td-196-02-defisr03-2023", url: LIEB + "bb9a2b2c-31d2-4ce5-bcfb-a97c937ca59b/original/" },
      lanca_m: [10.5, 35], altura_max_m: 44, raio_max_m: 39, contrapeso_t: 6.5, eixos: 2, dim_m: [10.93, 2.55, 3.55],
      patolas_m: [6.305, 6.028], patolas_status: "inferido do desenho de dimensões", forca_patola_kN: [250, 310], moitao_kg: null,
      notas: ["40 t a 2,5 m só com a lança para trás; em 360° a lança mínima dá 30,6 t a 3 m", "acima de 31,9 t / 34,9 t só com moitão adicional ou equipamento especial"],
      tabela: { status: "C", unidade: "t", condicao: "contrapeso 6,5 t, patolas estendidas, 360°, sem jib", lancas: [10.5, 15.4, 20.3, 25.2, 30.1, 35],
        linhas: [[3, [30.6, 19.7, null, null, null, null]], [4, [25.6, 20.6, 18, 15.1, null, null]], [5, [21.6, 21.3, 18.8, 14.3, 10.6, null]],
          [6, [18.5, 18.8, 18.7, 13.3, 10.2, 7.4]], [7, [15.4, 15.7, 15.3, 12.4, 9.6, 7.2]], [8, [null, 13, 12.8, 11.5, 8.9, 6.9]], [9, [null, 10.7, 10.8, 10.4, 8.4, 6.6]],
          [10, [null, 9, 9.1, 9.1, 7.9, 6.3]], [12, [null, 6.7, 6.8, 6.9, 6.9, 5.8]], [14, [null, null, 5.3, 5.4, 5.4, 5.4]], [16, [null, null, 4.3, 4.3, 4.4, 4.4]],
          [18, [null, null, null, 3.5, 3.6, 3.6]], [20, [null, null, null, 2.9, 3, 3]], [22, [null, null, null, 2.5, 2.5, 2.5]], [24, [null, null, null, null, 2.1, 2.1]],
          [26, [null, null, null, null, 1.7, 1.8]], [28, [null, null, null, null, null, 1.5]], [30, [null, null, null, null, null, 1.2]], [31, [null, null, null, null, null, 1.1]]] } },
    { id: "liebherr-ltm-1050-3-1", fabricante: "Liebherr", modelo: "LTM 1050-3.1", classe: "50 t (42 t em 360°)",
      fonte: { doc: "Technical Data LTM 1050-3.1 — td-185-02-defisr01-2023", url: LIEB + "e57b2c0c-a794-4463-bfdc-40af69903c8d/original/" },
      lanca_m: [11.4, 38], altura_max_m: 54, raio_max_m: 44, contrapeso_t: 9, eixos: 3, dim_m: [12.391, 2.55, 3.785],
      patolas_m: [7.151, 6.4], patolas_status: "inferido do desenho de dimensões", forca_patola_kN: [295, 420], moitao_kg: null,
      notas: ["50 t a 3 m só com a lança para trás; em 360° 42 t a 3 m", "acima de 42 t só com moitão adicional", "≤ 40 t no canteiro com 9 t de contrapeso"],
      tabela: { status: "C", unidade: "t", condicao: "contrapeso 9 t, patolas estendidas, 360°, sem jib (coluna normal, sem telescopagem sob carga)", lancas: [11.4, 16.7, 22, 27.3, 32.6, 38],
        linhas: [[3, [42, 24.7, 24.6, 17, null, null]], [4, [36.5, 26.5, 25.1, 16.6, 11.5, null]], [5, [30.6, 27.8, 24.2, 16, 11.3, null]],
          [6, [25.5, 26, 22.7, 15.3, 11, 7.5]], [7, [21.5, 21.8, 21, 14.4, 10.7, 7.2]], [8, [16.8, 18.5, 18.6, 13.4, 10.2, 7]], [9, [null, 15.5, 15.6, 12.5, 9.7, 6.7]],
          [10, [null, 13.1, 13.4, 11.6, 9.2, 6.5]], [12, [null, 10, 10.1, 10.1, 8, 6]], [14, [null, null, 7.8, 7.8, 7.1, 5.6]], [16, [null, null, 6.3, 6.4, 6.4, 5.2]],
          [18, [null, null, 5.2, 5.3, 5.4, 4.8]], [20, [null, null, null, 4.3, 4.4, 4.3]], [22, [null, null, null, 3.6, 3.7, 3.7]], [24, [null, null, null, 3, 3.1, 3.2]],
          [26, [null, null, null, null, 2.7, 2.7]], [28, [null, null, null, null, 2.2, 2.3]], [30, [null, null, null, null, null, 1.9]], [32, [null, null, null, null, null, 1.6]],
          [34, [null, null, null, null, null, 1.4]]] } },
    { id: "liebherr-ltm-1060-3-1", fabricante: "Liebherr", modelo: "LTM 1060-3.1", classe: "60 t (42,3 t em 360°)",
      fonte: { doc: "Technical Data LTM 1060-3.1 — td-250-04-defisr12-2025", url: LIEB + "0a2bf980-365f-43a7-a1a0-1f361f9be062/original/" },
      lanca_m: [10.3, 48], altura_max_m: 63, raio_max_m: 48, contrapeso_t: 12.8, eixos: 3, dim_m: [11.976, 2.55, 3.75],
      patolas_m: [7.341, 6.298], patolas_status: "inferido do desenho de dimensões", forca_patola_kN: [280, 445], moitao_kg: null,
      notas: ["60 t a 2,1 m só com a lança para trás; em 360° 42,3 t a 3 m", "acima de 42,3 t só com moitão adicional", "≤ 46 t no canteiro com 12,8 t de contrapeso"],
      tabela: { status: "C", unidade: "t", condicao: "contrapeso 12,8 t, patolas estendidas, 360°, sem jib", lancas: [10.3, 17.3, 24.2, 31.2, 38.1, 48],
        linhas: [[3, [42.3, 40.4, 29.6, null, null, null]], [4, [40.5, 38.1, 30.2, 18.6, null, null]], [5, [34.2, 32.9, 29.6, 19.1, null, null]],
          [6, [28.7, 29.3, 26.6, 19.2, 11.7, null]], [7, [24.1, 24.8, 23.9, 18.7, 12, null]], [8, [null, 21.1, 20.9, 17.7, 12.1, 6.1]], [9, [null, 18.3, 18, 15.9, 11.9, 6.2]],
          [10, [null, 15.8, 15.7, 14.3, 11.5, 6.3]], [12, [null, 11.9, 11.9, 11.6, 10.4, 6.2]], [14, [null, 9.4, 9.4, 9.4, 8.7, 5.9]], [16, [null, null, 8.1, 7.7, 7.6, 5.7]],
          [18, [null, null, 6.7, 6.6, 6.4, 5.4]], [20, [null, null, 5.7, 5.7, 5.5, 4.9]], [22, [null, null, null, 4.9, 4.7, 4.2]], [24, [null, null, null, 4.2, 4, 3.6]],
          [26, [null, null, null, 3.7, 3.5, 3]], [28, [null, null, null, 3.3, 3, 2.6]], [30, [null, null, null, null, 2.6, 2.2]], [32, [null, null, null, null, 2.3, 1.9]],
          [34, [null, null, null, null, 2, 1.6]], [36, [null, null, null, null, null, 1.3]], [38, [null, null, null, null, null, 1.1]], [40, [null, null, null, null, null, 0.9]]] } },
    { id: "liebherr-ltm-1090-4-2", fabricante: "Liebherr", modelo: "LTM 1090-4.2", classe: "90 t (59,2 t em 360°)",
      fonte: { doc: "Technical Data LTM 1090-4.2 — td-271-06-defisr11-2023", url: LIEB + "06b44b8e-873d-4805-b9c4-3ea285217eb6/original/" },
      lanca_m: [11.4, 60], altura_max_m: 76, raio_max_m: 62, contrapeso_t: 22.5, eixos: 4, dim_m: [13.39, 2.55, 3.95],
      patolas_m: [7.446, 7.3], patolas_status: "inferido do desenho de dimensões", forca_patola_kN: [400, 533], moitao_kg: null,
      notas: ["90 t a 3 m só com a lança para trás; em 360° 59,2 t a 3 m", "acima de 59,2 t / 68 t só com moitão adicional ou equipamento especial",
        "valores marcados no PDF em amarelo-escuro valem para o raio do contrapeso de 4,71 m (VarioBallast); os demais, 3,77 m", "≤ 64 t no canteiro com 22,5 t",
        "as 52 células com o contrapeso a 4,71 m só entram no cálculo quando o plano confirma essa montagem (leitura da legenda do ícone: conferir no PDF)"],
      tabela: { status: "C", unidade: "t", condicao: "contrapeso 22,5 t, patolas estendidas, 360°, sem jib (parte dos valores com o contrapeso a 4,71 m — ver notas)", lancas: [11.4, 22.6, 30, 41.2, 52.4, 60],
        linhas: [[3, [59.2, 48, null, null, null, null]], [4, [54.9, 47.5, null, null, null, null]], [5, [46.7, 41.7, 30, null, null, null]], [6, [40.3, 36.7, 28.8, null, null, null]],
          [7, [35.3, 33.6, 27.6, 15.2, null, null]], [8, [30.9, 30.5, 26.4, 15.1, null, null]], [9, [27, 27.7, 25, 15, null, null]], [10, [null, 24.7, 23.5, 14.4, 7.3, null]],
          [12, [null, 19.7, 19.9, 13.3, 7, 4.1]], [14, [null, 16.3, 16.2, 12.2, 6.7, 4.1]], [16, [null, 13.8, 13.5, 11.3, 5.9, 4]], [18, [null, 11.6, 11.4, 10.4, 5.4, 3.9]],
          [20, [null, 9.9, 9.6, 9.3, 5, 3.7]], [22, [null, null, 8.2, 7.9, 4.6, 3.6]], [24, [null, null, 7.3, 6.8, 4.3, 3.4]], [26, [null, null, 6.7, 5.8, 4, 3.2]],
          [28, [null, null, null, 5.1, 3.8, 3]], [30, [null, null, null, 4.8, 3.5, 2.9]], [32, [null, null, null, 4.2, 3.3, 2.7]], [34, [null, null, null, 3.8, 3.1, 2.6]],
          [36, [null, null, null, 3.4, 2.9, 2.4]], [38, [null, null, null, 3.1, 2.8, 2.3]], [40, [null, null, null, null, 2.6, 2.2]], [42, [null, null, null, null, 2.3, 2]],
          [44, [null, null, null, null, 2.2, 1.9]], [46, [null, null, null, null, 1.9, 1.8]], [48, [null, null, null, null, 1.7, 1.6]], [50, [null, null, null, null, 1.6, 1.4]],
          [52, [null, null, null, null, null, 1.2]], [54, [null, null, null, null, null, 1]], [56, [null, null, null, null, null, 0.8]]],
        /* ⚠ células marcadas no PDF (†): só valem com o contrapeso a 4,71 m. Sem a confirmação no plano, o motor não as usa. */
        condicional: { id: "variobal-471", rotulo: "contrapeso VarioBallast a 4,71 m", celulas: { 4: [0], 5: [0], 6: [0], 7: [0], 8: [0, 1], 9: [0, 1], 10: [1, 2], 12: [1, 2],
          14: [1, 2], 16: [1, 2], 18: [1, 2, 3], 20: [1, 2, 3], 22: [2, 3], 24: [2, 3], 26: [2, 3], 28: [3], 30: [3], 32: [3], 34: [3, 4], 36: [3, 4], 38: [3, 4],
          40: [4, 5], 42: [4, 5], 44: [4, 5], 46: [4, 5], 48: [4, 5], 50: [4, 5], 52: [5], 54: [5], 56: [5] } } } },
    { id: "xcmg-qy25k5", fabricante: "XCMG", modelo: "QY25K5", classe: "25 t (caminhão-guindaste)",
      fonte: { doc: "Catálogo XCMG QY25B-5/K-2/K5/K5-1 (brochure_en, cópia em cranepedia.com — versão antiga)", url: "https://cranepedia.com/spec/hydraulic-truck-crane/xcmg-qy25k-2" },
      lanca_m: [10.1, 38.5], altura_max_m: 38.5, raio_max_m: 34, contrapeso_t: null, eixos: null, dim_m: [12, 2.5, 3.38], peso_kg: 31000,
      patolas_m: [5.14, 6], patolas_status: "C", forca_patola_kN: null, moitao_kg: null, momento_kNm: 961,
      notas: ["tabela vale para trabalho lateral e traseiro; 360° só com a 5ª patola", "altura 46,8 m com jib", "peso 31.000 a 31.750 kg conforme a versão", "raio máximo tirado do último ponto da tabela"],
      tabela: { status: "C", unidade: "kg", condicao: "patolas totalmente estendidas, lateral e traseira (360° com a 5ª patola), sem jib, contrapeso não informado", lancas: [10.1, 17.2, 22.52, 27.85, 33.18, 38.5],
        linhas: [[3, [25000, null, null, null, null, null]], [4, [24200, 17000, null, null, null, null]], [4.5, [21800, 16000, 12000, null, null, null]],
          [5, [19100, 15000, 11400, 9500, null, null]], [6, [15800, 13000, 10400, 8400, 6600, null]], [7, [12200, 11500, 9400, 7600, 6000, 5000]],
          [8, [10500, 10200, 8500, 7300, 5600, 4600]], [9, [null, 8430, 7800, 6600, 5300, 4300]], [10, [null, 6930, 7100, 6100, 4900, 4000]],
          [12, [null, 4830, 5420, 5200, 4300, 3500]], [14, [null, 3440, 4020, 4260, 3700, 3160]], [16, [null, null, 3020, 3260, 3100, 2850]],
          [18, [null, null, 2260, 2500, 2720, 2550]], [20, [null, null, 1680, 2010, 2130, 2160]], [22, [null, null, null, 1540, 1660, 1820]],
          [24, [null, null, null, 1160, 1380, 1450]], [26, [null, null, null, null, 1060, 1140]], [28, [null, null, null, null, 780, 880]],
          [30, [null, null, null, null, 550, 660]], [32, [null, null, null, null, null, 480]], [34, [null, null, null, null, null, 320]]] } },
    { id: "sany-stc250", fabricante: "Sany", modelo: "STC250", classe: "25 t (caminhão-guindaste)",
      fonte: { doc: "Catálogo Sany STC250_spec_mt_ch_v201403 (cópia em cranepedia.com)", url: "https://cranepedia.com/spec/hydraulic-truck-crane/sany-stc250/" },
      lanca_m: [10.65, 33.5], altura_max_m: 34, raio_max_m: 25, contrapeso_t: null, eixos: 3, dim_m: [12.75, 2.5, 3.55], peso_kg: 30000,
      patolas_m: [5.3, 6.2], patolas_status: "C", forca_patola_kN: null, moitao_kg: 320, momento_kNm: 962,
      notas: ["valores incluem o gancho principal (320 kg)", "com o jib montado, tirar 450 kg", "tabela só lateral e traseira (360° não declarado)"],
      tabela: { status: "C", unidade: "kg", condicao: "patolas totalmente estendidas, lateral e traseira, sem jib", lancas: [10.65, 18.3, 25.9, 29.7, 33.5],
        linhas: [[3, [25000, null, null, null, null]], [3.5, [25000, 15000, null, null, null]], [4, [24300, 14900, 9200, null, null]], [4.5, [21820, 14900, 9200, null, null]],
          [5, [18900, 14500, 9150, 7500, null]], [5.5, [17350, 13800, 9150, 7500, null]], [6, [15800, 13300, 8900, 7500, null]], [7, [12200, 11300, 8300, 7400, null]],
          [8, [9700, 9800, 7600, 6500, 6150]], [9, [null, 8250, 7200, 6200, 5600]], [10, [null, 6900, 6500, 5700, 5100]], [11, [null, 5850, 5700, 5200, 4800]],
          [12, [null, 5160, 5100, 4800, 4380]], [13, [null, 4600, 4510, 4400, 4200]], [14, [null, 4000, 3950, 3900, 3850]], [15, [null, 3500, 3550, 3550, 3700]],
          [16, [null, null, 3150, 3150, 3150]], [17, [null, null, 2800, 2850, 2900]], [18, [null, null, 2580, 2580, 2550]], [19, [null, null, 2210, 2200, 2200]],
          [20, [null, null, 2050, 2000, 1970]], [21, [null, null, 1800, 1800, 1800]], [22, [null, null, 1650, 1600, 1600]], [23, [null, null, null, 1400, 1400]],
          [24, [null, null, null, null, 1300]], [25, [null, null, null, null, 1100]]] } },
    { id: "sany-stc500", fabricante: "Sany", modelo: "STC500", classe: "50 t (caminhão-guindaste)",
      fonte: { doc: "Catálogo Sany STC500_spec_mt_en_v201403 (cópia em cranepedia.com)", url: "https://cranepedia.com/spec/hydraulic-truck-crane/sany-stc500/" },
      lanca_m: [11.5, 43], altura_max_m: 43.2, raio_max_m: 32, contrapeso_t: 5, eixos: 4, dim_m: [13.75, 2.75, 3.65], peso_kg: 42000,
      patolas_m: [6, 7.2], patolas_status: "C", forca_patola_kN: null, moitao_kg: 610,
      notas: ["valores incluem o gancho (610 kg)", "360° só com a 5ª patola", "jib aberto tira 2.300 kg", "lança intermediária no modo de telescopagem I (o modo II está no PDF, p. 8)"],
      tabela: { status: "C", unidade: "kg", condicao: "contrapeso 5 t (3 t fixo + 2 t móvel), patolas estendidas, lateral e traseira (360° com a 5ª patola), sem jib, modo I", lancas: [11.5, 19.38, 27.25, 35.15, 43],
        linhas: [[3, [50000, 33000, null, null, null]], [3.5, [50000, 33000, null, null, null]], [4, [46000, 33000, null, null, null]], [4.5, [42000, 33000, 22000, null, null]],
          [5, [38000, 30000, 22000, null, null]], [5.5, [35000, 28000, 22000, null, null]], [6, [31000, 26000, 21000, null, null]], [6.5, [28000, 25000, 20000, 15000, null]],
          [7, [25000, 23000, 19000, 15000, null]], [7.5, [22000, 22000, 18000, 14500, null]], [8, [20000, 21000, 17000, 14000, 9000]], [9, [16000, 16000, 16000, 13000, 9000]],
          [10, [null, 13000, 14000, 12000, 9000]], [11, [null, 11000, 12000, 11000, 9000]], [12, [null, 9000, 10000, 10000, 8500]], [14, [null, 6000, 7500, 8000, 7500]],
          [16, [null, 4000, 5500, 6000, 6800]], [18, [null, null, 4000, 4500, 5500]], [20, [null, null, 3000, 3500, 4500]], [22, [null, null, 2500, 3000, 3500]],
          [24, [null, null, null, 2000, 3000]], [26, [null, null, null, 1500, 2300]], [28, [null, null, null, 1000, 1800]], [30, [null, null, null, null, 1400]],
          [32, [null, null, null, null, 1000]]] } }
  ];

  /* munck: tabela = { status, unidade "kg", condicao, pontos: [[raio, kg, prolongaManual], …] } — `prolongaManual` = ponto com prolonga
     manual (desconte o peso dela da carga). Pontos "máx." sem raio escrito não entram (não há como usar sem o raio). */
  function m(id, fab, modelo, momento, peso, pbt, patolas, giro, alcHid, alcMax, altMax, fonteDoc, url, condicao, status, pontos, notas) {
    return { id: id, fabricante: fab, modelo: modelo, momento_tm: momento, peso_kg: peso, pbt_min_t: pbt, patolas_m: patolas, giro: giro,
      alcance_hid_m: alcHid, alcance_max_m: alcMax, altura_max_m: altMax, fonte: { doc: fonteDoc, url: url }, notas: notas || [],
      tabela: { status: status, unidade: "kg", condicao: condicao, pontos: pontos } };
  }
  var PAL = "https://www.palfinger.com/content/dam/palfinger/";
  var MUNCKS = [
    /* ---------------- fabricados/vendidos no Brasil ---------------- */
    m("imap-im7", "IMAP", "IM 7", 6.4, 1250, null, null, "400°", null, 10.2, 13.05, "imap.com.br/im-7 (gráfico)", "https://www.imap.com.br/im-7",
      "3 lanças hidráulicas + 1 manual", "V", [[3.4, 1880], [5.0, 1250], [6.6, 910], [8.4, 700], [10.2, 580, true]], ["\"Ponto A\": 3.980 kgf a 1,6 m só com manilha opcional — fora da tabela usada no cálculo"]),
    m("masal-ms6503", "Masal", "MS 6503", 6.5, 1450, 6.7, [3.04], "360°", 5.04, 6.02, 8.92, "Catálogo Masal MS 6503 (PDF oficial)", "https://www.masal.com.br/_files/ugd/1a11bb_663dccb92ea64062958cf7b9a84f125e.pdf",
      "2 lanças hidráulicas + 1 manual", "C", [[3.04, 2138], [4.04, 1608], [5.04, 1289], [6.02, 1079, true]], ["a capa do PDF diz \"MC 6503\"; tabela e site dizem \"MS 6503\""]),
    m("argos-agi7-6", "Argos", "AGI 7.6 (3H1M)", 7.6, 1460, 7.0, null, "362°", null, 9.7, 12.8, "Ficha Argos AGI 7.6 (portal Cargotec/HIAB)", "https://cargotec-cp.picturepark.com/v/UEGXtfNm",
      "3 lanças hidráulicas + 1 manual (3H1M)", "C", [[3.7, 2010], [5.1, 1420], [6.6, 995], [8.1, 745], [9.7, 560, true]], ["peso = 1.175 kg da máquina + 285 kg do kit de montagem"]),
    m("masal-mc10605", "Masal", "MC 10605", 10.6, 1550, 9, [4.48], "410°", 8.8, 12.0, 15.2, "Catálogo Masal MC 10605 (PDF oficial)", "https://www.masal.com.br/_files/ugd/1a11bb_d41e86d9e6ed41728cd6b76c38038f94.pdf",
      "3 lanças hidráulicas + 2 manuais", "C", [[4.06, 2610], [5.64, 1880], [7.22, 1400], [8.80, 1050], [10.40, 750, true], [12.00, 500, true]]),
    m("tka-12700", "TKA", "TKA 12.700 (3H2M)", null, 1655, 11, [4.8], "360°", 8.4, 11.3, 14.5, "Gráfico de carga TKA 12.700 (PDF oficial)", "https://storage.googleapis.com/tka-cranes-8b306.firebasestorage.app/produtos/2ReGZRlxukhweNSHa6yV/grafico/grafico-de-carga-TKA12.700.pdf",
      "3 lanças hidráulicas + 2 manuais (3H2M)", "C", [[3.7, 3420], [5.2, 2430], [6.8, 1860], [8.4, 1480], [9.9, 1200, true], [11.3, 1000, true]], ["PBT mínimo sujeito a estudo de integração ao caminhão"]),
    m("imap-im13", "IMAP", "IM 13", 12.5, 2200, null, [4.08], "380°", null, 13.6, 16.9, "imap.com.br/guindaste-articulado-im-13 (gráfico)", "https://www.imap.com.br/guindaste-articulado-im-13",
      "3 lanças hidráulicas + 2 manuais", "V", [[4.1, 3110], [5.8, 2150], [7.6, 1590], [9.5, 1250], [11.5, 890, true], [13.6, 680, true]], ["\"Ponto A\": 6.000 kgf a 2 m só com manilha opcional — fora da tabela usada no cálculo"]),
    m("madal-pk17001-sld", "Madal Palfinger", "PK 17.001 SLD (variante D)", 16.8, 1655, null, [5.0, 6.6], "420°", 14.7, 19.0, 22.0, "CAT-PK17.001SLDc-BR (PDF oficial)", PAL + "latam/brazil/products/loader-cranes/models/pk-17001-sld/CAT-PK17.001SLDc-BR.pdf",
      "variante D, lança a 20° (\"não são os alcances máximos\")", "C", [[4.3, 3600], [6.3, 2300], [8.3, 1620], [10.4, 1220], [12.6, 980], [14.7, 830], [17.0, 670, true], [19.0, 550, true]],
      ["o catálogo traz uma segunda coluna \"kg SL4\" sem explicar — aqui a coluna kg", "prolongas V1 (49 kg) e V2 (35 kg) nos dois últimos pontos"]),
    m("argos-agi16-5", "Argos", "AGI 16.5 (3H2M)", 16.5, 3066, 13, [5.195], "360°", null, 13.4, 16.7, "Ficha Argos AGI 16.5 (portal Cargotec/HIAB)", "https://cargotec-cp.picturepark.com/v/BJTibURh",
      "3 lanças hidráulicas + 2 manuais (3H2M)", "C", [[4.0, 4120], [5.7, 2880], [7.3, 2190], [9.3, 1710], [11.3, 1400, true], [13.4, 1140, true]], ["peso = 2.560 kg + 506 kg do kit"]),
    m("argos-agi20-5", "Argos", "AGI 20.5 (4H3M)", 20.5, 3691, 15, [5.226], "368°", null, 18.8, 21.8, "Ficha Argos AGI 20.5 (portal Cargotec/HIAB)", "https://cargotec-cp.picturepark.com/v/M2SOfjWI",
      "4 lanças hidráulicas + 3 manuais (4H3M)", "C", [[4.3, 4767], [6.1, 3262], [8.0, 2475], [10.0, 1886], [12.1, 1509], [14.3, 1160, true], [16.5, 879, true], [18.8, 465, true]],
      ["peso = 2.918 kg + 773 kg do kit", "o resumo da ficha diz 4.674 kg a 4,3 m; o gráfico, 4.767 — divergência da própria ficha"]),
    m("tka-20700", "TKA", "TKA 20.700 (4H3M)", null, 2600, 17, [5.7], "370°", 12.0, 18.7, 22.2, "Gráfico de carga TKA 20.700 (PDF oficial)", "https://storage.googleapis.com/tka-cranes-8b306.firebasestorage.app/produtos/rZHzIu28UBHHVizSsoPM/grafico/grafico-de-carga-TKA20.700.pdf",
      "4 lanças hidráulicas + 3 manuais (4H3M)", "C", [[4.3, 5060], [6.1, 3430], [8.1, 2520], [10.0, 1940], [12.0, 1550], [14.1, 1210, true], [16.3, 910, true], [18.7, 650, true]]),
    m("imap-im21", "IMAP", "IM 21", 20.5, 2950, null, [5.30], "380°", null, 18.0, 21.4, "imap.com.br/guindaste-articulado-im-21 (gráfico)", "https://www.imap.com.br/guindaste-articulado-im-21",
      "4 lanças hidráulicas + 3 manuais", "V", [[4.1, 5000], [5.8, 3450], [7.6, 2560], [9.5, 2000], [11.6, 1610], [13.7, 1100, true], [15.8, 800, true], [18.0, 600, true]],
      ["\"Ponto A\": 10.000 kgf a 2 m só com manilha opcional — fora da tabela usada no cálculo", "gráfico em PNG de baixa resolução"]),
    m("masal-mc23607", "Masal", "MC 23607", 23.6, 3330, 17, [5.50], "415°", 16.51, 18.47, 22.18, "Catálogo Masal MC 23607 (PDF oficial)", "https://www.masal.com.br/_files/ugd/1a11bb_448a8157a5774d7ea1cc85ca5b3dd2bb.pdf",
      "versão C (alcance hidráulico 16,51 m)", "C", [[4.80, 4300], [6.75, 2900], [8.70, 2100], [10.65, 1650], [12.60, 1300], [14.55, 1130], [16.51, 950], [18.47, 600, true]]),
    m("madal-md30007", "Madal Palfinger", "MD 30007", 30, 3200, null, [5.7], "360°", 11.5, 17.5, 20.5, "CAT-MD30007e-BR (PDF oficial)", PAL + "data/importdata/product-data/psa/loader-cranes/images/md-30007/CAT-MD30007e-BR.pdf",
      "configuração CV3C (4 hidráulicas + 3 manuais)", "V", [[4.00, 7500], [6.00, 5000], [7.80, 3850], [9.70, 3100], [11.50, 2600], [13.50, 1400, true], [15.50, 900, true], [17.50, 500, true]],
      ["gráfico em desenho vetorial sem texto"]),
    m("tka-30700", "TKA", "TKA 30.700 (5H2M)", null, 3495, 23, [5.7], "370°", 14.0, 18.3, 21.8, "Gráfico de carga TKA 30.700 (PDF oficial)", "https://storage.googleapis.com/tka-cranes-8b306.firebasestorage.app/produtos/m642kSBxq5puT34WEL4A/grafico/grafico-de-carga-TKA30.700.pdf",
      "5 lanças hidráulicas + 2 manuais (5H2M)", "C", [[4.2, 5800], [6.1, 3850], [8.0, 2850], [10.0, 2250], [12.0, 1850], [14.0, 1450], [16.1, 1150, true], [18.3, 900, true]]),
    m("madal-pk36080", "Madal Palfinger", "PK 36080 MHPLS (variante D)", 34.8, 3130, null, [6.0], "400°", 13.8, 20.7, 24.4, "CAT-PK36080e-BR (PDF oficial)", PAL + "latam/hub-master/products/loader-cranes/models/pk-36080e/CAT-PK36080e-BR.pdf",
      "variante D com prolongas V1 a V3", "C", [[4.8, 6700], [6.0, 5210], [7.9, 3870], [9.8, 2990], [11.9, 2440], [13.8, 2070], [16.1, 1300, true], [18.4, 900, true], [20.7, 600, true]],
      ["prolongas de 67, 56 e 45 kg"]),
    m("masal-mc35607", "Masal", "MC 35607", 35.6, 3380, 23, [6.25], "360°", 14.0, 18.0, 21.0, "Catálogo Masal MC 35607 (PDF oficial)", "https://www.masal.com.br/_files/ugd/1a11bb_ccb63cf4c7c34ab9a26881b06d2e3cae.pdf",
      "versão B (5H2M)", "C", [[4.20, 8500], [6.15, 5500], [8.10, 4100], [10.06, 3140], [12.00, 2580], [14.00, 1810], [15.96, 1520, true], [18.00, 1050, true]]),
    m("argos-agi43", "Argos", "AGI 43.0 (4H3M)", 43.0, 5400, 23, null, "370°", null, 17.9, 21.6, "Ficha Argos AGI 43.0 (portal Cargotec/HIAB)", "https://cargotec-cp.picturepark.com/v/JBhkDmlp",
      "4 lanças hidráulicas + 3 manuais (4H3M)", "C", [[4.5, 9550], [6.1, 7040], [7.7, 5570], [9.5, 4175], [11.3, 3000], [13.4, 1750, true], [15.6, 1110, true], [17.9, 850, true]],
      ["peso = 4.560 kg + 840 kg do kit", "alcance 17,9 m e altura 21,6 m são da 4H3M (esta tabela); o gráfico 4H4M vai a 20,2 m / 23,8 m"]),
    m("madal-md45007", "Madal Palfinger", "MD 45007", 45, 3800, null, [5.7], "334°", 11.5, 17.5, 20.5, "CAT-MD45007-PT (PDF oficial)", PAL + "data/importdata/product-data/psa/loader-cranes/images/md-45007/CAT-MD45007-PT.pdf",
      "4 hidráulicas + 3 manuais", "V", [[4.18, 10900], [5.98, 7300], [7.83, 5200], [9.68, 3900], [11.53, 3300], [13.46, 1900, true], [15.46, 1200, true], [17.51, 900, true]],
      ["gráfico em desenho vetorial sem texto"]),
    m("masal-ms46008", "Masal", "MS 46008 (5H3M)", 46, 4300, 23, [6.14], "350°", 13.39, 19.30, 22.76, "Catálogo Masal MS 46008 (PDF oficial)", "https://www.masal.com.br/_files/ugd/1a11bb_9f4f1683a7a5421288b3023c6aa4284d.pdf",
      "versão 5H3M", "C", [[4.23, 10880], [6.03, 7620], [7.87, 5740], [9.71, 4420], [11.55, 3430], [13.39, 2390], [15.36, 1630, true], [17.33, 1120, true], [19.30, 820, true]]),
    m("madal-md480", "Madal Palfinger", "MD 480 (configuração D)", 48, 4200, null, [5.9, 7.8], "380°", 13.0, 13.0, 16.8, "CAT-MD480-PT (PDF oficial)", PAL + "data/importdata/product-data/psa/loader-cranes/images/md-480/CAT-MD480-PT.pdf",
      "configuração D (só hidráulico)", "C", [[3.3, 14500], [4.1, 11500], [5.5, 8500], [7.2, 6400], [9.0, 5000], [11.0, 4150], [13.0, 3500]],
      ["alcance 13,0 m e altura 16,8 m hidráulicos (esta tabela); com prolongas manuais vai a 19,7 m / 23,5 m — não cadastrado"]),
    /* ---------------- importados (fichas oficiais) ---------------- */
    m("palfinger-pk10000", "Palfinger", "PK 10000 Performance (variante B)", 9.5, 1031, null, [3.3, 5.6], "400°", 12.4, 16.2, null, "kppk10000m2en (PDF oficial)", "https://assets.palfinger.com/importdata/product-data/loader-cranes/brochures/pk-10000-performance/kppk10000m2en.pdf",
      "variante B, lança a 20°", "C", [[4.4, 2010], [6.1, 1410], [8.0, 1030], [10.1, 800], [12.4, 490, true], [14.4, 380, true], [16.4, 300, true]],
      ["a ficha dá alcance máximo de 16,2 m e o gráfico vai a 16,4 m — divergência da própria ficha"]),
    m("palfinger-pk15500", "Palfinger", "PK 15500 Performance (variante C)", 14.6, 1633, null, [4.6, 6.6], "420°", 14.5, 18.8, null, "kppk15500m2enansicht (PDF oficial)", PAL + "data/importdata/product-data/loader-cranes/brochures/pk-15500/kppk15500m2enansicht.pdf",
      "variante C, lança a 20°", "C", [[2.0, 5850], [4.5, 2960], [6.1, 2050], [8.0, 1470], [10.1, 1110], [12.2, 910], [14.3, 710, true], [16.5, 580, true], [18.4, 480, true]]),
    m("palfinger-pk23500", "Palfinger", "PK 23500 Performance (variante E)", 23.0, 2346, null, [4.8, 6.6], "400°", 16.7, 18.8, null, "KPPK23500M2ENAnsicht (PDF oficial)", "https://assets.palfinger.com/paldrive-images/attachments/KPPK23500M2ENAnsicht_2.pdf",
      "variante E, lança a 20°", "C", [[4.6, 4520], [6.1, 3180], [8.0, 2280], [10.1, 1700], [12.3, 1340], [14.4, 1110], [16.5, 960], [18.5, 620, true]]),
    m("palfinger-pk34002", "Palfinger", "PK 34002 SH (variante E)", 32.6, 2931, null, [5.6, 7.4], "contínuo", 21.3, 23.3, null, "kphpk34002shm2en (PDF oficial)", PAL + "data/importdata/product-data/loader-cranes/brochures/pk-34002-sh/kphpk34002shm2en.pdf",
      "variante E, lança a 20° (Palfinger)", "C", [[4.4, 6700], [6.3, 4450], [8.2, 3250], [10.3, 2450], [12.4, 1960], [14.5, 1640], [16.7, 1420], [18.8, 1200, true], [21.0, 1000, true]]),
    m("palfinger-pk44502", "Palfinger", "PK 44502 (variante E)", 41.9, 4399, null, [7.4], "400°", 16.3, 23.3, null, "kph4448002em2en (PDF oficial)", "https://assets.palfinger.com/importdata/product-data/loader-cranes/brochures/pk-44502-48002-eh/kph4448002em2en.pdf",
      "variante E, lança a 20° (Palfinger)", "C", [[4.3, 8800], [6.0, 6100], [7.8, 4500], [9.7, 3450], [11.7, 2800], [13.9, 2300], [16.2, 2000], [18.5, 1640, true], [20.8, 1250, true], [23.1, 900, true]],
      ["capacidade máx. 16.600 kg no quadro técnico e 15.600 kg na tabela da variante A — divergência da própria ficha"]),
    m("palfinger-pk48002", "Palfinger", "PK 48002 EH (variante E)", 46.5, 4420, null, [7.4], "400°", 16.3, 23.3, null, "kph4448002em2en (PDF oficial)", "https://assets.palfinger.com/importdata/product-data/loader-cranes/brochures/pk-44502-48002-eh/kph4448002em2en.pdf",
      "variante E, lança a 20° (Palfinger)", "C", [[4.3, 9800], [6.0, 6900], [7.8, 5100], [9.7, 3950], [11.7, 3200], [13.9, 2650], [16.2, 2300], [18.5, 1800, true], [20.8, 1250, true], [23.1, 900, true]]),
    m("fassi-f110b", "Fassi", "F110B.0 .24 (Extra CE)", 9.07, 1420, null, null, "410°", 12.05, 15.9, null, "f110b.0-nc (PDF oficial)", "https://www.fassi.com/wp-content/uploads/gru/6219/f110b.0-nc.pdf",
      "variante .24", "C", [[3.90, 2320], [5.70, 1485], [7.70, 1045], [9.75, 750], [11.80, 580], [13.90, 440, true], [15.90, 355, true]],
      ["giro: 416° na tabela, 410° no resumo da página — adotado o menor", "alcance máximo tirado do último ponto da tabela"]),
    m("fassi-f155a", "Fassi", "F155A.0 .24 (Extra CE)", 12.64, 2080, null, null, "390°", 12.55, 18.8, null, "f155a.0-nc (PDF oficial)", "https://www.fassi.com/wp-content/uploads/gru/5753/f155a.0-nc.pdf",
      "variante .24", "C", [[4.45, 2835], [6.25, 1905], [8.15, 1390], [10.15, 1080], [12.20, 885], [14.40, 695, true], [16.55, 560, true], [18.80, 445, true]]),
    m("fassi-f215a", "Fassi", "F215A.0 .24 (Extra CE)", 17.84, 2505, null, null, "400°", 12.55, 18.65, null, "f215a.0-nc (PDF oficial)", "https://www.fassi.com/wp-content/uploads/gru/5832/f215a.0-nc.pdf",
      "variante .24", "C", [[4.45, 4000], [6.25, 2720], [8.20, 2000], [10.20, 1555], [12.30, 1220], [14.35, 955, true], [16.50, 770, true], [18.65, 585, true]]),
    m("fassi-f275a", "Fassi", "F275A e-dynamic .2.24 (CE)", 24.16, 3175, null, null, "420°", 12.30, 19.15, null, "f275a.2-e-dynamic (PDF oficial)", "https://www.fassi.com/wp-content/uploads/gru/6798/f275a.2-e-dynamic.pdf",
      "variante .2.24, lança a 15°", "C", [[4.50, 5365], [6.35, 3645], [8.30, 2680], [10.25, 2105], [12.25, 1745], [14.55, 1370, true], [16.85, 1075, true], [19.15, 870, true]]),
    m("fassi-f365a", "Fassi", "F365A e-dynamic .2.24 (CE)", 32.82, 3800, null, null, "400°", 12.30, 19.30, null, "f365a.2-e-dynamic (PDF oficial)", "https://www.fassi.com/wp-content/uploads/gru/7003/f365a.2-e-dynamic.pdf",
      "variante .2.24, lança a 15°", "C", [[4.50, 7300], [6.35, 5045], [8.30, 3765], [10.30, 2980], [12.25, 2480], [14.55, 1900, true], [16.85, 1500, true], [19.30, 1200, true]]),
    m("fassi-f455a", "Fassi", "F455A e-dynamic .2.24 (CE)", 41.28, 4700, null, null, "430°", 12.15, 19.15, null, "f455a.2-e-dynamic (PDF oficial)", "https://www.fassi.com/wp-content/uploads/gru/3827/f455a.2-e-dynamic.pdf",
      "variante .2.24, lança a 15°", "C", [[4.35, 9500], [6.20, 6535], [8.15, 4890], [10.15, 3885], [12.15, 3235], [14.40, 2550, true], [16.70, 2060, true], [19.15, 1680, true]]),
    m("hiab-xhipro142", "Hiab", "X-HiPro 142 E-3", 12.4, 1830, null, null, "415°", 10.5, 17.4, 19.8, "Ficha X-HiPro 142 (portal Cargotec)", "https://cargotec-cp.picturepark.com/v/OEqsQ0ae",
      "E-3, linha ADC da placa (sem ADC é menor)", "C", [[2.6, 4600], [4.6, 2700], [6.4, 1860], [8.3, 1400], [10.4, 1100], [12.6, 860, true], [15.0, 680, true], [17.3, 540, true]],
      ["momento 12,4 t·m com ADC (11 t·m sem ADC)"]),
    m("hiab-xhipro162", "Hiab", "X-HiPro 162 E-4", 14.1, 2080, null, null, "415°", 12.8, 15.0, 19.8, "Ficha X-HiPro 162 (portal Cargotec)", "https://cargotec-cp.picturepark.com/v/lgRzzrhJ",
      "E-4, linha ADC da placa", "C", [[2.5, 5300], [4.7, 3000], [6.5, 2000], [8.4, 1500], [10.5, 1160], [12.7, 940], [15.0, 740, true]],
      ["momento 14,1 t·m com ADC (12,2 t·m sem ADC)", "alcance máximo tirado do último ponto da tabela (a ficha diz \"0\")"]),
    m("hiab-xhipro232", "Hiab", "X-HiPro 232 E-5", 19.8, 2445, null, null, "415°", 15.1, 17.5, 19.9, "Ficha X-HiPro 232 (portal Cargotec)", "https://cargotec-cp.picturepark.com/v/WdbP1FAP",
      "E-5, linha ADC da placa", "C", [[3.6, 5500], [4.9, 4050], [6.6, 2850], [8.6, 2100], [10.7, 1620], [12.8, 1320], [15.0, 1120], [17.4, 560, true]],
      ["momento 19,8 t·m com ADC (18,1 t·m sem ADC)"]),
    m("hiab-xhipro302", "Hiab", "X-HiPro 302 E-6", 25, 3480, null, null, "420°", 16.2, 18.4, 23.1, "Ficha X-HiPro 302 (portal Cargotec)", "https://cargotec-cp.picturepark.com/v/RhHRDEVP",
      "E-6, linha ADC da placa", "C", [[2.6, 9400], [4.5, 5500], [6.1, 3900], [7.9, 2840], [9.8, 2180], [11.8, 1740], [13.9, 1420], [16.1, 1220], [18.3, 980, true]],
      ["momento 25 t·m com ADC (23,3 t·m sem ADC)"]),
    m("hiab-xhipro358", "Hiab", "X-HiPro 358 E-7", 30.8, 4608.8, null, null, "contínuo", 18.6, null, null, "Placa de carga 358 E-7 (2004610.pdf) + folha US", "https://hiabstorageproduction.blob.core.windows.net/product-media/2004610.pdf",
      "E-7, linha ADC (raios convertidos de pés da folha US)", "C", [[2.8, 9600], [4.70, 6500], [6.30, 4550], [8.10, 3300], [10.01, 2500], [11.99, 1980], [14.10, 1620], [16.31, 1360], [18.59, 1180]]),
    m("hiab-xhipro408", "Hiab", "X-HiPro 408 E-8", 35.1, 4497, null, null, "contínuo", 21, 22.7, null, "Placa de carga 408 E-8 (1357613.pdf) + folha US", "https://hiabstorageproduction.blob.core.windows.net/product-media/1357613.pdf",
      "E-8, linha ADC (raios convertidos de pés da folha US)", "C", [[2.8, 12000], [4.70, 7400], [6.30, 5200], [8.10, 3750], [10.01, 2850], [11.99, 2240], [14.10, 1800], [16.31, 1500], [18.59, 1280], [20.90, 1140]],
      ["peso 4.497 kg na brochura e 4.954,8 kg no site — divergência do fabricante", "o primeiro ponto (2,8 m / 12.000 kg) diverge da folha americana (10.000 kg a 3,20 m): confira na placa"]),
    m("hiab-xhipro548", "Hiab", "X-HiPro 548 E-9", 45.3, 5488, null, [8], "contínuo", 21.8, 24.0, null, "Ficha X-HiPro 548 (BD-548-EN-EU_151013)", "https://cargotec-cp.picturepark.com/v/4zQlmJAy",
      "E-9, 1ª lança a 10°, 2ª horizontal", "C", [[4.7, 9600], [6.2, 6900], [7.9, 5100], [9.7, 3900], [11.5, 3100], [13.5, 2500], [15.6, 2060], [17.6, 1760], [19.7, 1540], [21.7, 1380], [24.0, 800, true]])
  ];

  GUINDASTES.forEach(function (g) {
    g.tipo = "guindaste"; g.fonte.levantamento = "01/10/2026";
    /* Liebherr: "tabelas de carga em geral calculadas para até 9 m/s" (liebherr.com, "Stable and strong in the wind").
       É o padrão do plano para estes modelos — o limite de cada tabela está no manual do equipamento. */
    if (g.fabricante === "Liebherr") { g.vento_ms = 9; g.vento_fonte = "Liebherr: tabelas em geral para até 9 m/s — conferir no manual do equipamento"; }
  });
  MUNCKS.forEach(function (x) { x.tipo = "munck"; x.fonte.levantamento = "01/10/2026"; });
  /* ======================================================================
   * FICHA DE FABRICANTE (o que o PDF publica ALÉM da tabela de carga) — levantamento de 02/10/2026, para a física do içamento
   * (js/icarficha.js → js/icarfisica.js). Cada número com a PÁGINA do mesmo PDF da tabela (campo `fonte` do modelo).
   * ⚠ O "Fmax" das Liebherr ("Max. Stützkräfte / max. supporting forces") é a força que UMA PATOLA DESCARREGA NO CHÃO no pior
   *   caso, em duas configurações de patola (ícones da página) — NÃO é capacidade da patola. Para o solo, o lado seguro é o
   *   MAIOR valor. Até 01/10 a ficha adotava o menor, lendo-o como capacidade; a página do PDF desfez o engano.
   * ⚠ giroFrente/giroTras = do EIXO DE GIRO às patolas dianteiras/traseiras, cotas do desenho de dimensões (vista em planta):
   *   o giro fica ATRÁS do centro das patolas em todos estes modelos.
   * ⚠ O fabricante NÃO publica massa/CG da superestrutura, da lança nem o raio do CG do contrapeso: as reações por patola
   *   continuam cinza — o solo é conferido pelo pior caso (Fmax) até alguém informar esses números com fonte.
   * moitões: [capacidade t, polias, pernas (linhas), massa t]; cabo: [diâmetro mm, comprimento m, tração máx. por perna kN].
   * ====================================================================== */
  var FICHAS_FAB = {
    "liebherr-ltm-1030-2-1": { pagDim: 3, pagDados: 7, giroFrente_m: 3.9155, giroTras_m: 2.3895, sapata_m: 0.5, raioTraseira_m: [3.15],
      moitoes: [[34.9, 5, 11, 0.265], [22.8, 3, 7, 0.165], [10.1, 1, 3, 0.145], [3.4, 0, 1, 0.075]], fmax_kN: [230, 300],
      cabo: [13, 150, 34], icar_m_min: 120, giro_rpm: 2.4, alfaMax_graus: 81, notas: ["p. 6: em estrada ≤ 24 t com 2,3 t de contrapeso, 12 t por eixo"] },
    "liebherr-ltm-1040-2-1": { pagDim: 3, pagDados: 7, giroFrente_m: 3.9155, giroTras_m: 2.3895, sapata_m: 0.5, raioTraseira_m: [3.33],
      moitoes: [[34.9, 5, 11, 0.265], [22.8, 3, 7, 0.165], [10.1, 1, 3, 0.145], [3.4, 0, 1, 0.075]], fmax_kN: [250, 310],
      cabo: [13, 150, 34], icar_m_min: 120, giro_rpm: 2.4, alfaMax_graus: 81, notas: [] },
    "liebherr-ltm-1050-3-1": { pagDim: 3, pagDados: 9, giroFrente_m: 4.526, giroTras_m: 2.625, sapata_m: 0.5, raioTraseira_m: [3.53, 4.07],
      moitoes: [[50, 7, 12, 0.40], [46.1, 5, 11, 0.40], [30.2, 3, 7, 0.28], [13.3, 1, 3, 0.195], [4.5, 0, 1, 0.075]], fmax_kN: [295, 420],
      cabo: [15, 185, 45], icar_m_min: 120, giro_rpm: 1.9, alfaMax_graus: 81, notas: ["dois guinchos com o mesmo cabo (p. 9)"] },
    "liebherr-ltm-1060-3-1": { pagDim: 3, pagDados: 8, giroFrente_m: 4.826, giroTras_m: 2.515, sapata_m: 0.5, raioTraseira_m: [3.54],
      moitoes: [[60, 7, 15, 0.40], [46.1, 5, 11, 0.40], [30.2, 3, 7, 0.28], [13.3, 1, 3, 0.20], [4.5, 0, 1, 0.10]], fmax_kN: [280, 445],
      cabo: [15, 220, 45], icar_m_min: 130, giro_rpm: 1.5, alfaMax_graus: 82, notas: ["dois guinchos com o mesmo cabo (p. 8)"] },
    "liebherr-ltm-1090-4-2": { pagDim: 3, pagDados: 9, giroFrente_m: 4.729, giroTras_m: 2.717, sapata_m: 0.5, raioTraseira_m: [3.77, 4.71],
      moitoes: [[68, 7, 12, 0.76], [59.2, 5, 10, 0.53], [42.3, 3, 7, 0.45], [18.7, 1, 3, 0.30], [6.3, 0, 1, 0.14]], fmax_kN: [400, 533],
      cabo: [17, 240, 63], icar_m_min: 135, giro_rpm: 1.5, alfaMax_graus: 82, notas: ["dois guinchos com o mesmo cabo (p. 9)"] },
    /* munck: o catálogo da Masal (p. 2, tabela "Especificações") — sem o comprimento de cada braço (os braços seguem estimados) */
    "masal-mc10605": { pagDados: 2, larguraTransporte_m: 2.60, espacoMontagem_m: 1.20, anguloAbertura_graus: 80, raioMin_m: 1.00,
      alcanceVertHid_m: 11.90, giroGraus: 410, torqueGiro_kgfm: 2062, pressao_bar: 250, oleo_L: 80, lancasHid: 3, lancasManuais: 2, notas: [] }
  };
  GUINDASTES.concat(MUNCKS).forEach(function (x) { x.ficha = FICHAS_FAB[x.id] || null; });
  var TODOS = GUINDASTES.concat(MUNCKS);

  function porId(id) {
    for (var i = 0; i < TODOS.length; i++) if (TODOS[i].id === id) return TODOS[i];
    return null;
  }

  var IcarCatalogo = { GUINDASTES: GUINDASTES, MUNCKS: MUNCKS, TODOS: TODOS, porId: porId };
  global.IcarCatalogo = IcarCatalogo;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarCatalogo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

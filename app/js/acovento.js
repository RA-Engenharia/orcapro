/* =====================================================================
 * acovento.js — AÇÃO DO VENTO EM GALPÕES pela ABNT NBR 6123 (motor PURO,
 * ES5, sem DOM, Node-testável).
 *
 * O usuário dá o endereço (ou V0), o terreno e o galpão; o motor devolve
 * a pressão dinâmica, os coeficientes de pressão externa de paredes e
 * cobertura POR ZONA (com a geometria de cada zona em metros), os
 * coeficientes de pressão interna com o motivo, os CASOS de vento prontos
 * para o montador do modelo (pressão em kN/m² por zona e por face) e a
 * MEMÓRIA DE CÁLCULO passo a passo (fórmula, valores, resultado, item e
 * tabela da norma, edição).
 *
 *   AcoVento.calcular(entrada, opcoes) → resultado     (contrato abaixo)
 *   AcoVento.fatorS1 / fatorS2 / fatorS3 / cpiAnexoD    (partes, testáveis)
 *   AcoVento.TABELAS                                    (dados transcritos)
 *
 * EDIÇÃO. A vigente é a NBR 6123:2023, mas a biblioteca só tem o texto de
 * 1988 (_ÍNDICE/texto/ABNT NBR 6123-1988.txt e o PDF). TODA tabela daqui
 * veio desse texto: cada valor leva a linha do .txt (Tabelas 1, 2, 3, 4 e
 * os itens de texto) ou a página do PDF quando a tabela é imagem no PDF
 * (Tabelas 5, 6, 17 e 18 — não há camada de texto nelas). Tudo sai marcado
 * "1988 (conferir na 2023)" e o memorial mostra isso. O mapa de isopletas
 * é o mesmo nas duas edições (js/acoisopletas.js, quando existir).
 *
 * CONVENÇÕES (o montador depende disto)
 *   planta: x de 0 a b ao longo do VÃO, z de 0 a a ao longo do COMPRIMENTO;
 *     a cumeeira corre em z, em x = b/2.
 *   faces: frente = oitão em z = 0; fundo = oitão em z = a;
 *     esquerda = lateral em x = 0; direita = lateral em x = b.
 *     Coordenada ao longo da face (s): frente/fundo → s = x; laterais → s = z.
 *   vento: 0° sopra no sentido +z (bate na frente); 90° no sentido +x (bate
 *     na esquerda); 180° bate no fundo; 270° bate na direita.
 *   uma água: a água cai de uma lateral para a outra (ao longo de x); o
 *     beiral ALTO fica em geometria.ladoAlto ("esquerda" é o padrão);
 *     h = beiral BAIXO e hCumeeira = beiral ALTO (Tabela 6, corte AA).
 *   sinais (4.2.1 e 4.2.2): coeficiente e pressão POSITIVOS = sobrepressão,
 *     a força empurra a face PARA DENTRO (parede) ou PARA BAIXO (cobertura);
 *     negativos = sucção. Pressão p = q·(Cpe − Cpi), em kN/m².
 *   zonas da cobertura: retângulos em planta {x0, x1, z0, z1}; zonas das
 *     paredes: trechos {s0, s1} ao longo da face, na altura toda da face.
 *   aberturas: { area (m²), dominante, s0, s1 (opcionais: trecho ocupado ao
 *     longo da face, na coordenada s) }. Face com fechada: false = face toda
 *     aberta (abertura dominante permanente). vedacao: "telha" (padrão,
 *     permeável), "alvenaria"/"bloco"/"concreto"/"pré-moldado" (impermeável
 *     se não tiver abertura — 6.2.2), "misto" (permeável).
 *
 * CONTRATO
 *   entrada = {
 *     local: { lat, lon, v0 (opcional, sobrescreve o mapa), descricao },
 *     s1: { tipo: "plano"|"talude"|"morro"|"vale", theta, d, z (opcional), valor (opcional) },
 *     categoria: "I".."V", grupoS3: 1..5, classe (opcional: "A"|"B"|"C" fixa),
 *     geometria: { a, b, h, hCumeeira, inclinacaoGraus, cobertura: "duas-aguas"|"uma-agua",
 *                  aberta (cobertura isolada), ladoAlto, nervuras: "lisa"|"onduladas"|"retangulares",
 *                  obstrucoes (cobertura isolada com obstrução embaixo) },
 *     faces: { frente, fundo, esquerda, direita: { fechada, aberturas: [...], area, vedacao, permeavel } },
 *     estanque (opcional, 6.2.6)
 *   }
 *   opcoes = { isopletas (módulo a usar; null = não procurar), todasDirecoes (casos 180°/270° sempre) }
 *   resultado = { ok, erros, avisos, v0, v0Info, s1, s2 {valor, z, classe, b, p, Fr, f(z, classe),
 *     porDirecao}, s3, vk, q (kN/m², a maior das direções), qLocal (classe A), qVedacao (classe A,
 *     S3 do grupo 4), porDirecao {0, 90, 180, 270: classe, s1, s2, vk, q},
 *     cpe {paredes[dir]{zona: Ce}, cobertura[dir]{zona: Ce}, locais, fonte},
 *     zonas {paredes[dir][face]: [{zona, s0, s1, cpe}], cobertura[dir]: [{zona, agua, x0, x1, z0,
 *     z1, cpe}], locais {paredes[face], cobertura, regra}, medidas},
 *     cpi: [{direcao, valor, cenario, item, motivo, referencia}],
 *     casos: [{id "V0_cpi+0,8", nome, direcao, cpi, cpiMotivo, q, classe, coef {paredes{zona},
 *     cobertura{zona}}, pressao {paredes[face]: [{zona, s0, s1, cpe, coef, p}], cobertura:
 *     [{zona, agua, x0, x1, z0, z1, cpe, coef, p}]}, atrito (6.4/8.2.5, quando houver)}],
 *     simetria {z, x, direcoes}, excentricidade (6.6), memoria: [{n, passo, formula, valores,
 *     resultado, resultadoTexto, unidade, referencia, edicao, interpolado}], tabelasUsadas }
 *   Cobertura isolada de uma água (Tabela 17): a pressão varia linear em x — o item traz coef0/p0
 *   (em x0) e coef1/p1 (em x1) além da média.
 *
 * O QUE O MOTOR FAZ (e o item da norma)
 *   V0 (5.1, Figura 1) · S1 (5.2: plano, talude/morro no ponto B, vale) ·
 *   S2 (5.3: categoria I–V, classe A/B/C pela superfície frontal de cada
 *   direção, S2 = b·Fr·(z/10)^p, Tabela 1, piso da Tabela 2) · S3 (5.4,
 *   Tabela 3) · Vk e q (4.2) · paredes (Tabela 4) · telhado de duas águas
 *   (Tabela 5) e de uma água (Tabela 6), com os cpe médios das zonas de
 *   borda · Cpi (6.2.5-a/b/c, 6.2.6 e Anexo D, que é o caminho da norma para
 *   os casos que 6.2.5 não cobre — 6.2.11) · atrito (6.4) · coberturas
 *   isoladas (8.2, Tabelas 17 e 18; 8.2.4 quando h < 0,5·l2).
 *
 * O QUE NÃO FAZ (e avisa): efeitos dinâmicos (cap. 9, relevantes só com
 *   T1 > 1 s), vizinhança (Anexo G), reduções de alta turbulência (6.5 — o
 *   motor fica a favor da segurança), torção por excentricidade (6.6 — dá
 *   ea e eb, não monta o caso), vento oblíquo da Tabela 6 (45° e −45°),
 *   telhados múltiplos (Tabelas 7 e 8), coberturas curvas (Anexo E), abas
 *   (8.2.8), lanternim e aberturas na cobertura.
 *
 * Teste: node tools/test-aco-vento.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var NORMA = "NBR 6123:1988";
  var ED = "1988 (conferir na 2023)";
  var RAD = Math.PI / 180;
  var FACES = ["frente", "fundo", "esquerda", "direita"];
  var DIRS = [0, 90, 180, 270];
  var CATS = ["I", "II", "III", "IV", "V"];

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arred(v, n) { var k = Math.pow(10, n == null ? 4 : n); return Math.round(v * k) / k; }
  /* número no padrão brasileiro: vírgula decimal, menos tipográfico */
  function br(v, n) {
    if (!fin(v)) return v === Infinity ? "∞" : String(v);
    var s = Math.abs(v).toFixed(n == null ? 2 : n).replace(".", ",");
    return (v < 0 && Number(s.replace(",", ".")) !== 0 ? "−" : "") + s;
  }
  /* idem, sem zeros à direita (0,80 → 0,8) */
  function bt(v, n) { var s = br(v, n == null ? 2 : n); if (s.indexOf(",") >= 0) s = s.replace(/0+$/, "").replace(/,$/, ""); return s; }
  function bts(v, n) { return (v > 0 ? "+" : "") + bt(v, n); }
  /* coeficiente com sinal e ao menos uma casa (−1 → "−1,0"; 0,7 → "+0,7") */
  function fc(v) { if (!fin(v)) return String(v); var s = bts(v, 3); return (s.indexOf(",") < 0 && v !== 0) ? s + ",0" : s; }
  /* número de tabela com a grafia da norma: ao menos duas casas (0,10; 0,105) */
  function ft(v) { var s = bt(v, 3); if (s.indexOf(",") < 0) return s + ",00"; return s.split(",")[1].length < 2 ? s + "0" : s; }
  /* número para o id do caso: "+0,8", "-0,3", "0" */
  function idNum(v) { var s = bt(Math.abs(v), 2); return (v > 0 ? "+" : (v < 0 && s !== "0" ? "-" : "")) + s; }
  function interp(x, x0, x1, y0, y1) { return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  function soma(lista) { var s = 0; lista.forEach(function (o) { s += o.area; }); return s; }
  function ref(item, extra) { return NORMA + ", " + item + (extra ? " — " + extra : ""); }
  function linhaTxt(l) { return fin(l) ? "linha " + l : "linha " + l[0] + " (" + (l[1] + 1) + "º número)"; }

  /* ====================================================== TABELAS (texto)
   * Linha (l) = linha do arquivo "ABNT NBR 6123-1988.txt" da biblioteca.
   * Quando um valor divide a linha com outro, a referência é [linha, i]
   * (i = posição do número na linha, a partir de 0).
   * --------------------------------------------------------------------- */

  /* TABELA 1 — Parâmetros meteorológicos (5.3.3; linhas 803–865).
   * b e p por categoria e classe (A, B, C); Fr só aparece na categoria II
   * porque "o fator de rajada Fr é sempre o correspondente à categoria II"
   * (linhas 782–783). zg = altura do gradiente (até onde vale a fórmula). */
  var TAB1 = {
    I:   { zg: 250, lzg: 817, b: [1.10, 1.11, 1.12], lb: [813, 814, 815], p: [0.06, 0.065, 0.07], lp: [819, 820, 821] },
    II:  { zg: 300, lzg: 827, b: [1.00, 1.00, 1.00], lb: [823, 824, 825], p: [0.085, 0.09, 0.10], lp: [833, 834, 835] },
    III: { zg: 350, lzg: 841, b: [0.94, 0.94, 0.93], lb: [837, 838, 839], p: [0.10, 0.105, 0.115], lp: [843, 844, 845] },
    IV:  { zg: 420, lzg: 851, b: [0.86, 0.85, 0.84], lb: [847, 848, 849], p: [0.12, 0.125, 0.135], lp: [853, 854, 855] },
    V:   { zg: 500, lzg: 861, b: [0.74, 0.73, 0.71], lb: [857, 858, 859], p: [0.15, 0.16, 0.175], lp: [863, 864, 865] },
    Fr:  [1.00, 0.98, 0.95], lFr: [829, 830, 831]
  };

  /* TABELA 2 — Fator S2 (linhas 898–1278). Cada linha da tabela começa na
   * linha "linha" do .txt (o rótulo z) e os 15 valores vêm nas 15 linhas
   * seguintes, na ordem I(A,B,C), II(A,B,C), III, IV, V. null = "-".
   * O motor CALCULA S2 pela fórmula (5.3.3); a Tabela 2 serve de conferência
   * no memorial e no teste. "≤ 5" = piso de 5 m (abaixo de 5 m vale 5 m). */
  var TAB2 = [
    { z: 5, linha: 927, v: [1.06, 1.04, 1.01, 0.94, 0.92, 0.89, 0.88, 0.86, 0.82, 0.79, 0.76, 0.73, 0.74, 0.72, 0.67] },
    { z: 10, linha: 943, v: [1.10, 1.09, 1.06, 1.00, 0.98, 0.95, 0.94, 0.92, 0.88, 0.86, 0.83, 0.80, 0.74, 0.72, 0.67] },
    { z: 15, linha: 959, v: [1.13, 1.12, 1.09, 1.04, 1.02, 0.99, 0.98, 0.96, 0.93, 0.90, 0.88, 0.84, 0.79, 0.76, 0.72] },
    { z: 20, linha: 975, v: [1.15, 1.14, 1.12, 1.06, 1.04, 1.02, 1.01, 0.99, 0.96, 0.93, 0.91, 0.88, 0.82, 0.80, 0.76] },
    { z: 30, linha: 991, v: [1.17, 1.17, 1.15, 1.10, 1.08, 1.06, 1.05, 1.03, 1.00, 0.98, 0.96, 0.93, 0.87, 0.85, 0.82] },
    { z: 40, linha: 1007, v: [1.20, 1.19, 1.17, 1.13, 1.11, 1.09, 1.08, 1.06, 1.04, 1.01, 0.99, 0.96, 0.91, 0.89, 0.86] },
    { z: 50, linha: 1023, v: [1.21, 1.21, 1.19, 1.15, 1.13, 1.12, 1.10, 1.09, 1.06, 1.04, 1.02, 0.99, 0.94, 0.93, 0.89] },
    { z: 60, linha: 1039, v: [1.22, 1.22, 1.21, 1.16, 1.15, 1.14, 1.12, 1.11, 1.09, 1.07, 1.04, 1.02, 0.97, 0.95, 0.92] },
    { z: 80, linha: 1055, v: [1.25, 1.24, 1.23, 1.19, 1.18, 1.17, 1.16, 1.14, 1.12, 1.10, 1.08, 1.06, 1.01, 1.00, 0.97] },
    { z: 100, linha: 1071, v: [1.26, 1.26, 1.25, 1.22, 1.21, 1.20, 1.18, 1.17, 1.15, 1.13, 1.11, 1.09, 1.05, 1.03, 1.01] },
    { z: 120, linha: 1087, v: [1.28, 1.28, 1.27, 1.24, 1.23, 1.22, 1.20, 1.20, 1.18, 1.16, 1.14, 1.12, 1.07, 1.06, 1.04] },
    { z: 140, linha: 1103, v: [1.29, 1.29, 1.28, 1.25, 1.24, 1.24, 1.22, 1.22, 1.20, 1.18, 1.16, 1.14, 1.10, 1.09, 1.07] },
    { z: 160, linha: 1119, v: [1.30, 1.30, 1.29, 1.27, 1.26, 1.25, 1.24, 1.23, 1.22, 1.20, 1.18, 1.16, 1.12, 1.11, 1.10] },
    { z: 180, linha: 1135, v: [1.31, 1.31, 1.31, 1.28, 1.27, 1.27, 1.26, 1.25, 1.23, 1.22, 1.20, 1.18, 1.14, 1.14, 1.12] },
    { z: 200, linha: 1151, v: [1.32, 1.32, 1.32, 1.29, 1.28, 1.28, 1.27, 1.26, 1.25, 1.23, 1.21, 1.20, 1.16, 1.16, 1.14] },
    { z: 250, linha: 1167, v: [1.34, 1.34, 1.33, 1.31, 1.31, 1.31, 1.30, 1.29, 1.28, 1.27, 1.25, 1.23, 1.20, 1.20, 1.18] },
    { z: 300, linha: 1183, v: [null, null, null, 1.34, 1.33, 1.33, 1.32, 1.32, 1.31, 1.29, 1.27, 1.26, 1.23, 1.23, 1.22] },
    { z: 350, linha: 1199, v: [null, null, null, null, null, null, 1.34, 1.34, 1.33, 1.32, 1.30, 1.29, 1.26, 1.26, 1.26] },
    { z: 400, linha: 1215, v: [null, null, null, null, null, null, null, null, null, 1.34, 1.32, 1.32, 1.29, 1.29, 1.29] },
    { z: 420, linha: 1231, v: [null, null, null, null, null, null, null, null, null, 1.35, 1.35, 1.33, 1.30, 1.30, 1.30] },
    { z: 450, linha: 1247, v: [null, null, null, null, null, null, null, null, null, null, null, null, 1.32, 1.32, 1.32] },
    { z: 500, linha: 1263, v: [null, null, null, null, null, null, null, null, null, null, null, null, 1.34, 1.34, 1.34] }
  ];

  /* TABELA 3 — Valores mínimos do fator estatístico S3 (5.4; linhas 872–897) */
  var TAB3 = {
    1: { s3: 1.10, l: 880, desc: "edificações cuja ruína total ou parcial pode afetar a segurança ou possibilidade de socorro a pessoas após uma tempestade destrutiva (hospitais, quartéis de bombeiros e de forças de segurança, centrais de comunicação etc.)" },
    2: { s3: 1.00, l: 885, desc: "edificações para hotéis e residências; edificações para comércio e indústria com alto fator de ocupação" },
    3: { s3: 0.95, l: 890, desc: "edificações e instalações industriais com baixo fator de ocupação (depósitos, silos, construções rurais etc.)" },
    4: { s3: 0.88, l: 893, desc: "vedações (telhas, vidros, painéis de vedação etc.)" },
    5: { s3: 0.83, l: 896, desc: "edificações temporárias; estruturas dos grupos 1 a 3 durante a construção" }
  };

  /* TABELA 4 — Ce e cpe externos para PAREDES de planta retangular (6.1;
   * valores nas linhas 1616–1720 do .txt, conferidos com a imagem do PDF
   * p. 14; zonas pela figura da mesma página). a = maior dimensão em planta,
   * b = menor, h = altura. Colunas: α = 0° (vento paralelo a a): A1/B1,
   * A2/B2, C (barlavento), D (sotavento); α = 90°: A (barlavento), B
   * (sotavento), C1/D1, C2/D2; e o cpe médio (faixa de alta sucção).
   *   nota a (linha 1586): 3/2 < a/b < 2 → interpolar linearmente;
   *   nota b (linhas 1587–1591): vento 0°, A3 e B3: a/b = 1 → igual a A2/B2;
   *     a/b ≥ 2 → Ce = −0,2; entre 1 e 2 → interpolar;
   *   nota c (linhas 1738–1742): cpe médio na parte de barlavento das paredes
   *     paralelas ao vento, numa distância 0,2·b ou h (o menor);
   *   figura (PDF p. 14): A1/B1 até b/3 ou a/4 (o maior, porém ≤ 2h); A2/B2
   *     até a/2; C1/D1 com 2h ou b/2 (o menor). */
  var TAB4 = {
    col: ["A1B1", "A2B2", "C", "D", "A", "B", "C1D1", "C2D2", "cpeMedio"],
    linhas: [
      { faixaHb: 1, faixaAb: 1, rot: "h/b ≤ 1/2 e 1 ≤ a/b ≤ 3/2", v: [-0.8, -0.5, 0.7, -0.4, 0.7, -0.4, -0.8, -0.4, -0.9], l: [1616, 1617, 1618, 1619, 1620, 1621, 1622, 1623, 1624] },
      { faixaHb: 1, faixaAb: 2, rot: "h/b ≤ 1/2 e 2 ≤ a/b ≤ 4", v: [-0.8, -0.4, 0.7, -0.3, 0.7, -0.5, -0.9, -0.5, -1.0], l: [1628, 1629, 1630, 1631, [1632, 0], [1632, 1], 1633, 1634, 1635] },
      { faixaHb: 2, faixaAb: 1, rot: "1/2 < h/b ≤ 3/2 e 1 ≤ a/b ≤ 3/2", v: [-0.9, -0.5, 0.7, -0.5, 0.7, -0.5, -0.9, -0.5, -1.1], l: [1653, 1654, 1655, 1656, [1657, 0], [1657, 1], 1658, 1659, 1660] },
      { faixaHb: 2, faixaAb: 2, rot: "1/2 < h/b ≤ 3/2 e 2 ≤ a/b ≤ 4", v: [-0.9, -0.4, 0.7, -0.3, 0.7, -0.6, -0.9, -0.5, -1.1], l: [1680, 1681, 1682, 1683, [1684, 0], [1684, 1], 1685, 1686, 1687] },
      { faixaHb: 3, faixaAb: 1, rot: "3/2 < h/b ≤ 6 e 1 ≤ a/b ≤ 3/2", v: [-1.0, -0.6, 0.8, -0.6, 0.8, -0.6, -1.0, -0.6, -1.2], l: [1698, 1699, 1700, 1701, [1702, 0], [1702, 1], 1703, 1704, 1705] },
      { faixaHb: 3, faixaAb: 2, rot: "3/2 < h/b ≤ 6 e 2 ≤ a/b ≤ 4", v: [-1.0, -0.5, 0.8, -0.3, 0.8, -0.6, -1.0, -0.6, -1.2], l: [1713, 1714, 1715, 1716, [1717, 0], [1717, 1], 1718, 1719, 1720] }
    ],
    a3b3: -0.2, la3b3: 1590
  };

  /* TABELA 5 — Ce e cpe externos para TELHADOS DE DUAS ÁGUAS simétricos,
   * planta retangular (6.1). A tabela é IMAGEM no PDF (p. 15): o .txt só
   * tem o título (linha 1764) e as notas (linhas 1752–1763); os valores
   * foram transcritos da imagem da p. 15 e conferidos célula a célula.
   * h = altura até o beiral (Detalhe 1), b = vão, a ≥ b (cumeeira ao longo
   * de a), θ = inclinação. α = 90°: EF = água de barlavento, GH = sotavento;
   * α = 0°: EG = faixa junto ao oitão de barlavento até b/3 ou a/4 (o maior,
   * porém ≤ 2h), FH = dali até a/2, IJ = metade de sotavento (nota d).
   * cpe médio (zonas de borda da figura da p. 15; y = h ou 0,15·b, o menor):
   *   oitao    (hachura em diagonal "/"):  faixa y ao longo da borda do oitão;
   *   beiral1  (hachura em diagonal "\"):  faixa y ao longo do beiral, de y
   *            até b/3 ou a/4;
   *   beiral2  (hachura horizontal):       faixa y ao longo do beiral, de
   *            b/3 ou a/4 até a/2;
   *   cumeeira (pontilhado):               faixa y junto à cumeeira.
   * null = célula em branco; "--" = traço impresso (θ = 0°, sem cumeeira). */
  var TAB5 = {
    pdf: 15, ltitulo: 1764, lnotas: "1752–1763",
    blocos: [
      { rot: "h/b ≤ 1/2", hbMax: 0.5,
        th: [0, 5, 10, 15, 20, 30, 45, 60],
        EF: [-0.8, -0.9, -1.2, -1.0, -0.4, 0, 0.3, 0.7],
        GH: [-0.4, -0.4, -0.4, -0.4, -0.4, -0.4, -0.5, -0.6],
        EG: [-0.8, -0.8, -0.8, -0.8, -0.7, -0.7, -0.7, -0.7],
        FH: [-0.4, -0.4, -0.6, -0.6, -0.6, -0.6, -0.6, -0.6],
        oitao:    [-2.0, -1.4, -1.4, -1.4, -1.0, -0.8, null, null],
        beiral1:  [-2.0, -1.2, -1.4, -1.2, null, null, null, null],
        beiral2:  [-2.0, -1.2, null, null, null, null, null, null],
        cumeeira: ["--", -1.0, -1.2, -1.2, -1.2, -1.1, -1.1, -1.1] },
      { rot: "1/2 < h/b ≤ 3/2", hbMax: 1.5,
        th: [0, 5, 10, 15, 20, 30, 45, 60],
        EF: [-0.8, -0.9, -1.1, -1.0, -0.7, -0.2, 0.2, 0.6],
        GH: [-0.6, -0.6, -0.6, -0.6, -0.5, -0.5, -0.5, -0.5],
        EG: [-1.0, -0.9, -0.8, -0.8, -0.8, -0.8, -0.8, -0.8],
        FH: [-0.6, -0.6, -0.6, -0.6, -0.6, -0.8, -0.8, -0.8],
        oitao:    [-2.0, -2.0, -2.0, -1.8, -1.5, -1.0, null, null],
        beiral1:  [-2.0, -2.0, -2.0, -1.5, -1.5, null, null, null],
        beiral2:  [-2.0, -1.5, -1.5, -1.5, -1.5, null, null, null],
        cumeeira: ["--", -1.0, -1.2, -1.2, -1.0, -1.0, null, null] },
      { rot: "3/2 < h/b ≤ 6", hbMax: 6,
        th: [0, 5, 10, 15, 20, 30, 40, 50, 60],
        EF: [-0.8, -0.8, -0.8, -0.8, -0.8, -1.0, -0.2, 0.2, 0.5],
        GH: [-0.6, -0.6, -0.6, -0.6, -0.6, -0.5, -0.5, -0.5, -0.5],
        EG: [-0.9, -0.8, -0.8, -0.8, -0.8, -0.8, -0.8, -0.8, -0.8],
        FH: [-0.7, -0.8, -0.8, -0.8, -0.8, -0.7, -0.7, -0.7, -0.7],
        oitao:    [-2.0, -2.0, -2.0, -1.8, -1.5, -1.5, -1.0, null, null],
        beiral1:  [-2.0, -2.0, -2.0, -1.8, -1.5, null, null, null, null],
        beiral2:  [-2.0, -1.5, -1.5, -1.5, -1.5, null, null, null, null],
        cumeeira: ["--", -1.0, -1.2, -1.2, -1.2, null, null, null, null] }
    ],
    /* nota d (linhas 1760–1763): vento 0°, partes I e J: a/b = 1 → igual a F
     * e H; a/b ≥ 2 → Ce = −0,2; interpolar entre os dois. */
    ij: -0.2, lij: 1762
  };

  /* TABELA 6 — Ce e cpe externos para TELHADOS DE UMA ÁGUA, planta
   * retangular, h/b < 2 (6.1). IMAGEM no PDF (p. 16); no .txt só o título
   * (linhas 1772–1773) e as notas (1774–1779). H = metade do lado do beiral
   * ALTO, L = metade do lado do beiral BAIXO (no corte AA o h é medido no
   * beiral baixo). α: 90° = vento perpendicular aos beirais chegando pelo
   * lado alto (H); −90° = chegando pelo lado baixo (L); 0° = vento paralelo
   * aos beirais (bate no oitão); 45° e −45° = oblíquos (não montados).
   * 0°: (A) até a profundidade b/2, (B) de b/2 até a/2; nota: I e J (metade
   * de sotavento) a/b = 1 → "mesmo valor das partes H e L", a/b = 2 → −0,2.
   * cpe médio: y = h ou 0,15·b (o menor); He/Le = faixa y ao longo do oitão
   * (metade alta/baixa); H1/L1 = faixa y ao longo do beiral alto/baixo, de y
   * até a distância b do oitão; H2/L2 = de b até a/2. */
  var TAB6 = {
    pdf: 16, ltitulo: 1772, lnotas: "1774–1779",
    th: [5, 10, 15, 20, 25, 30],
    a90:  { H: [-1.0, -1.0, -0.9, -0.8, -0.7, -0.5], L: [-0.5, -0.5, -0.5, -0.5, -0.5, -0.5] },
    a45:  { H: [-1.0, -1.0, -1.0, -1.0, -1.0, -1.0], L: [-0.9, -0.8, -0.7, -0.6, -0.6, -0.6] },
    a0:   { A: [-1.0, -1.0, -1.0, -0.9, -0.8, -0.8], B: [-0.5, -0.5, -0.5, -0.5, -0.5, -0.5] },
    am45: { H: [-0.9, -0.8, -0.6, -0.5, -0.3, -0.1], L: [-1.0, -1.0, -1.0, -1.0, -0.9, -0.6] },
    am90: { H: [-0.5, -0.4, -0.3, -0.2, -0.1, 0], L: [-1.0, -1.0, -1.0, -1.0, -0.9, -0.6] },
    medio: {
      H1: [-2.0, -2.0, -1.8, -1.8, -1.8, -1.8],
      H2: [-1.5, -1.5, -0.9, -0.8, -0.7, -0.5],
      L1: [-2.0, -2.0, -1.8, -1.8, -0.9, -0.5],
      L2: [-1.5, -1.5, -1.4, -1.4, -0.9, -0.5],
      He: [-2.0, -2.0, -2.0, -2.0, -2.0, -2.0],
      Le: [-2.0, -2.0, -2.0, -2.0, -2.0, -2.0] },
    ij: -0.2, lij: 1779
  };

  /* TABELA 17 — cobertura isolada a UMA ÁGUA plana (8.2; imagem no PDF
   * p. 34; condições de 8.2.3 nas linhas 2519–2529). Coeficientes de pressão
   * LÍQUIDOS (as duas faces juntas, 8.2.2), variando LINEARMENTE do bordo de
   * barlavento ao de sotavento. Sentido pelas setas da tabela:
   *   vento chegando pelo lado ALTO (a água desce no sentido do vento):
   *     1º carregamento PARA CIMA, 2º PARA BAIXO;
   *   vento chegando pelo lado BAIXO: 1º PARA BAIXO, 2º PARA CIMA.
   * 1º carregamento, 0 ≤ tg θ ≤ 0,7: 2,0 no bordo de barlavento, tg θ no de
   *   sotavento. 2º carregamento, 0 ≤ tg θ ≤ 0,2: os mesmos 2,0 e tg θ;
   *   0,2 ≤ tg θ ≤ 0,3: 6 − 20·tg θ e 0,6 − 2·tg θ; acima de 0,3 a tabela
   *   não traz 2º carregamento. */
  var T17 = {
    pdf: 34, ltitulo: 2604, faixa: [0, 0.7],
    c1: function (tg) { return { barl: 2.0, sota: tg }; },
    c2: function (tg) {
      if (tg <= 0.2) return { barl: 2.0, sota: tg };
      if (tg <= 0.3) return { barl: 6 - 20 * tg, sota: 0.6 - 2 * tg };
      return null;
    }
  };
  /* TABELA 18 — cobertura isolada a DUAS ÁGUAS planas simétricas (imagem no
   * PDF p. 34). cpb = água de barlavento, cps = água de sotavento; positivo
   * = para baixo na cobertura com cumeeira para cima (croqui "sentidos
   * positivos"). Uniforme em cada água. Vale para 0,07 ≤ tg θ ≤ 0,6.
   *   1º: 0,07–0,4: cpb = 2,4 tg θ + 0,6; cps = 3,0 tg θ − 0,5
   *       0,4–0,6:  cpb = 2,4 tg θ + 0,6 ≤ 2,0; cps = +0,7
   *   2º: 0,07–0,4: cpb = 0,6 tg θ − 0,74; cps = −1,0
   *       0,4–0,6:  cpb = 6,5 tg θ − 3,1; cps = 5,0 tg θ − 3,0 */
  var T18 = {
    pdf: 34, ltitulo: "2605–2606", faixa: [0.07, 0.6],
    c1: function (tg) { return tg <= 0.4 ? { cpb: 2.4 * tg + 0.6, cps: 3.0 * tg - 0.5 } : { cpb: Math.min(2.4 * tg + 0.6, 2.0), cps: 0.7 }; },
    c2: function (tg) { return tg <= 0.4 ? { cpb: 0.6 * tg - 0.74, cps: -1.0 } : { cpb: 6.5 * tg - 3.1, cps: 5.0 * tg - 3.0 }; }
  };

  /* 6.2.5 e 6.2.6 — Cpi (linhas 1476–1540) */
  var CPI = {
    duasOpostas: { perm: 0.2, lperm: 1483, imperm: -0.3, limperm: 1485 },          /* 6.2.5-a */
    quatro: [-0.3, 0], lquatro: "1492–1493",                                     /* 6.2.5-b */
    estanque: [-0.2, 0], lestanque: "1536–1540",                                 /* 6.2.6 */
    /* 6.2.5-c, abertura dominante a barlavento: razão (aberturas na face de
     * barlavento / aberturas nas faces em sucção) → cpi (linhas 1501–1505) */
    barl: { razao: [1, 1.5, 2, 3, 6], cpi: [0.1, 0.3, 0.5, 0.6, 0.8], l: [1501, 1502, 1503, 1504, 1505] },
    /* 6.2.5-c, abertura dominante em zona de alta sucção externa: razão
     * (área na zona / outras aberturas nas faces em sucção) → cpi
     * (linhas 1522–1533; o valor fica na linha seguinte à da razão) */
    succao: { razao: [0.25, 0.5, 0.75, 1.0, 1.5, 3], cpi: [-0.4, -0.5, -0.6, -0.7, -0.8, -0.9], l: [1523, 1525, 1527, 1529, 1531, 1533] }
  };

  /* 6.4.3 — coeficiente de atrito Cf (linhas 1886–1892) */
  var CF = {
    lisa: { cf: 0.01, l: 1886, desc: "superfícies sem nervuras transversais à direção do vento" },
    onduladas: { cf: 0.02, l: 1888, desc: "superfícies com nervuras arredondadas (ondulações) transversais à direção do vento" },
    retangulares: { cf: 0.04, l: 1891, desc: "superfícies com nervuras retangulares transversais à direção do vento" }
  };

  /* ====================================================== INTERPOLAÇÃO */
  function indices(ths, th) {
    var n = ths.length;
    if (th <= ths[0]) return { i0: 0, i1: 0, fora: th < ths[0] };
    if (th >= ths[n - 1]) return { i0: n - 1, i1: n - 1, fora: th > ths[n - 1] };
    for (var i = 0; i < n - 1; i++) {
      if (th === ths[i]) return { i0: i, i1: i };
      if (th > ths[i] && th < ths[i + 1]) return { i0: i, i1: i + 1 };
    }
    return { i0: n - 1, i1: n - 1 };
  }
  /* valor da tabela em θ: na linha, ou interpolado entre as duas vizinhas */
  function emTheta(ths, arr, th) {
    var k = indices(ths, th);
    if (k.i0 === k.i1) return { v: arr[k.i0], interpolado: false, th0: ths[k.i0], th1: ths[k.i1] };
    return { v: interp(th, ths[k.i0], ths[k.i1], arr[k.i0], arr[k.i1]), interpolado: true, th0: ths[k.i0], th1: ths[k.i1], v0: arr[k.i0], v1: arr[k.i1] };
  }
  /* cpe médio em θ, com as células em branco: no ângulo exato da linha vale
   * a célula (em branco = a zona não tem cpe médio próprio); entre uma célula
   * cheia e uma em branco o motor MANTÉM o valor da cheia (a favor da
   * segurança — a tabela não diz como passar para "nada"; fica no memorial). */
  function localEmTheta(ths, arr, th) {
    var k = indices(ths, th);
    function ok(x) { return typeof x === "number" && isFinite(x); }
    if (k.i0 === k.i1) return ok(arr[k.i0]) ? { v: arr[k.i0], interpolado: false } : null;
    var a0 = arr[k.i0], a1 = arr[k.i1];
    if (ok(a0) && ok(a1)) return { v: interp(th, ths[k.i0], ths[k.i1], a0, a1), interpolado: true, th0: ths[k.i0], th1: ths[k.i1] };
    if (ok(a0)) return { v: a0, mantido: true, thCheio: ths[k.i0], thVazio: ths[k.i1] };
    if (ok(a1)) return { v: a1, mantido: true, thCheio: ths[k.i1], thVazio: ths[k.i0] };
    return null;
  }

  /* ====================================================== FATORES S1 S2 S3 */
  /* S1 (5.2). Talude e morro: valor no ponto B (topo), o mais desfavorável
   * da Figura 2 — entre A e B e entre B e C a norma interpola (nota). */
  function fatorS1(s1, z) {
    s1 = s1 || {};
    var tipo = String(s1.tipo || "plano").toLowerCase();
    if (fin(num(s1.valor, NaN))) return { valor: num(s1.valor), tipo: tipo, informado: true, formula: "S1 informado pelo usuário (estudo específico)", referencia: ref("5.2") };
    if (tipo === "plano") return { valor: 1, tipo: tipo, formula: "terreno plano ou fracamente acidentado: S1 = 1,0", referencia: ref("5.2-a", "linha 567") };
    if (tipo === "vale") return { valor: 0.9, tipo: tipo, formula: "vale profundo, protegido de ventos de qualquer direção: S1 = 0,9", referencia: ref("5.2-c", "linhas 627–628") };
    if (tipo !== "talude" && tipo !== "morro") return { erro: "s1.tipo deve ser plano, talude, morro ou vale" };
    var th = num(s1.theta, NaN), d = num(s1.d, NaN);
    if (!(th >= 0) || !(d > 0)) return { erro: "talude/morro: informe s1.theta (inclinação média, graus) e s1.d (desnível entre base e topo, m)" };
    var zd = z / d, k = 2.5 - zd;
    var f = function (t) { return Math.max(1, 1 + k * Math.tan((t - 3) * RAD)); };
    var f45 = Math.max(1, 1 + k * 0.31), v, formula, interpolado = false;
    if (th <= 3) { v = 1; formula = "θ = " + bt(th, 2) + "° ≤ 3°: S1 = 1,0"; }
    else if (th < 6) {
      v = interp(th, 3, 6, 1, f(6)); interpolado = true;
      formula = "3° < θ < 6°: interpolação linear entre S1(3°) = 1,0 e S1(6°) = 1,0 + (2,5 − z/d)·tg 3° = " + br(f(6), 4);
    } else if (th <= 17) {
      v = f(th);
      formula = "6° ≤ θ ≤ 17°: S1(z) = 1,0 + (2,5 − z/d)·tg(θ − 3°) ≥ 1 = 1,0 + (2,5 − " + br(zd, 3) + ")·tg " + bt(th - 3, 2) + "°";
    } else if (th < 45) {
      v = interp(th, 17, 45, f(17), f45); interpolado = true;
      formula = "17° < θ < 45°: interpolação linear entre S1(17°) = 1,0 + (2,5 − z/d)·tg 14° = " + br(f(17), 4) + " e S1(45°) = 1,0 + (2,5 − z/d)·0,31 = " + br(f45, 4);
    } else { v = f45; formula = "θ ≥ 45°: S1(z) = 1,0 + (2,5 − z/d)·0,31 ≥ 1 = 1,0 + (2,5 − " + br(zd, 3) + ")·0,31"; }
    return { valor: v, tipo: tipo, theta: th, d: d, z: z, ponto: "B (topo do " + tipo + ")", formula: formula, interpolado: interpolado,
             referencia: ref("5.2-b", "linhas 568–626 (fórmulas na p. 5 do PDF; Figura 2, p. 7)") };
  }

  /* classe pela maior dimensão horizontal ou vertical da superfície frontal
   * (5.3.2, linhas 758–776): A ≤ 20 m; B de 20 a 50 m; C > 50 m */
  function classePorDimensao(dim) { return dim <= 20 ? "A" : (dim <= 50 ? "B" : "C"); }

  /* S2 = b·Fr·(z/10)^p (5.3.3, linha 781), Fr da categoria II; piso de 5 m
   * (Tabela 2, linha "≤ 5") e, na categoria V, S2 constante até 10 m (linhas
   * 797–799); vale até zg (linhas 783–785). */
  function fatorS2(cat, classe, z) {
    var t = TAB1[cat], i = "ABC".indexOf(classe);
    if (CATS.indexOf(cat) < 0 || !t || i < 0) return null;
    var zmin = cat === "V" ? 10 : 5;
    var zz = Math.min(Math.max(z, zmin), t.zg);
    var v = t.b[i] * TAB1.Fr[i] * Math.pow(zz / 10, t.p[i]);
    return { valor: v, categoria: cat, classe: classe, b: t.b[i], p: t.p[i], Fr: TAB1.Fr[i], zg: t.zg, zmin: zmin, z: z, zUsado: zz,
             linhas: { b: t.lb[i], p: t.lp[i], Fr: TAB1.lFr[i], zg: t.lzg } };
  }
  /* Tabela 2 nas alturas que cercam z (só para CONFERÊNCIA da fórmula; o
   * motor não interpola a Tabela 2): [{z, v, linha}] — uma ou duas linhas */
  function s2Tabela2(cat, classe, z) {
    var j = CATS.indexOf(cat) * 3 + "ABC".indexOf(classe);
    if (CATS.indexOf(cat) < 0 || "ABC".indexOf(classe) < 0) return null;
    var rows = TAB2.filter(function (r) { return r.v[j] != null; });
    function it(r) { return { z: r.z, v: r.v[j], linha: r.linha + 1 + j }; }
    if (z <= rows[0].z) return [it(rows[0])];
    for (var i = 0; i < rows.length - 1; i++) {
      if (z === rows[i + 1].z) return [it(rows[i + 1])];
      if (z < rows[i + 1].z) return [it(rows[i]), it(rows[i + 1])];
    }
    return [it(rows[rows.length - 1])];
  }

  /* S3 (5.4, Tabela 3) */
  function fatorS3(grupo) {
    var t = TAB3[grupo];
    return t ? { valor: t.s3, grupo: Number(grupo), desc: t.desc, linha: t.l, referencia: ref("5.4 / Tabela 3", "linha " + t.l) } : null;
  }

  /* ====================================================== GEOMETRIA */
  var BARL = { 0: "frente", 90: "esquerda", 180: "fundo", 270: "direita" };
  var SOTA = { 0: "fundo", 90: "direita", 180: "frente", 270: "esquerda" };
  var PARAL = { 0: ["esquerda", "direita"], 90: ["frente", "fundo"], 180: ["esquerda", "direita"], 270: ["frente", "fundo"] };
  var OPOSTA = { frente: "fundo", fundo: "frente", esquerda: "direita", direita: "esquerda" };
  function papel(f, d) { return BARL[d] === f ? "barlavento" : (SOTA[d] === f ? "sotavento" : "paralela"); }

  function compFace(G, f) { return (f === "frente" || f === "fundo") ? G.b : G.a; }
  function areaFace(G, f) {
    if (f === "frente" || f === "fundo") return G.cob === "duas-aguas" ? G.b * G.h + G.b * (G.hc - G.h) / 2 : G.b * (G.h + G.hc) / 2;
    if (G.cob === "uma-agua") return G.a * (f === G.ladoAlto ? G.hc : G.h);
    return G.a * G.h;
  }
  /* coordenada s, numa face paralela ao vento, a uma distância "dist" da
   * borda de barlavento */
  function sDist(G, d, dist) {
    if (d === 0) return dist;
    if (d === 180) return G.a - dist;
    if (d === 90) return dist;
    return G.b - dist;
  }
  function sobreposicao(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

  function lerGeometria(g, aviso, erro) {
    g = g || {};
    var a = num(g.a, NaN), b = num(g.b, NaN), h = num(g.h, NaN);
    if (!(a > 0) || !(b > 0) || !(h > 0)) { erro("geometria: informe a (comprimento), b (vão) e h (altura até o beiral), em metros, maiores que zero"); return null; }
    if (g.cobertura && g.cobertura !== "uma-agua" && g.cobertura !== "duas-aguas") aviso("cobertura \"" + g.cobertura + "\" não reconhecida: adotada duas águas");
    var cob = g.cobertura === "uma-agua" ? "uma-agua" : "duas-aguas";
    var proj = cob === "duas-aguas" ? b / 2 : b;
    var th = num(g.inclinacaoGraus, NaN), hc = num(g.hCumeeira, NaN);
    if (!fin(th) && fin(hc)) th = Math.atan(Math.max(0, hc - h) / proj) / RAD;
    if (!fin(th)) { erro("geometria: informe inclinacaoGraus ou hCumeeira"); return null; }
    if (th < 0 || th >= 90) { erro("geometria: inclinação fora de 0° a 90°"); return null; }
    var hcCalc = h + proj * Math.tan(th * RAD);
    if (!fin(hc)) hc = hcCalc;
    else if (Math.abs(hc - hcCalc) > 0.02 * hc + 0.01) aviso("hCumeeira informada (" + br(hc) + " m) difere da calculada pela inclinação (" + br(hcCalc) + " m): usada a informada como altura de referência");
    var ladoAlto = g.ladoAlto === "direita" ? "direita" : "esquerda";
    return { a: a, b: b, h: h, hc: Math.max(hc, h), th: th, tg: Math.tan(th * RAD), cob: cob, ladoAlto: ladoAlto,
             aberta: !!g.aberta, obstrucoes: !!g.obstrucoes,
             nervuras: CF[g.nervuras] ? g.nervuras : "retangulares", nervurasInformadas: !!CF[g.nervuras],
             /* altura das paredes para a Tabela 4: o beiral; na uma água, o beiral
              * alto (a parede mais alta — a favor da segurança, fica no memorial) */
             hParede: cob === "uma-agua" ? Math.max(h, hc) : h };
  }

  /* ====================================================== PAREDES (Tab. 4) */
  function linhaT4(fh, fa) { for (var i = 0; i < TAB4.linhas.length; i++) { var L = TAB4.linhas[i]; if (L.faixaHb === fh && L.faixaAb === fa) return L; } return null; }

  function cpeParedesTab4(G) {
    var aT = Math.max(G.a, G.b), bT = Math.min(G.a, G.b), hT = G.hParede;
    var hb = hT / bT, ab = aT / bT;
    var out = { aT: aT, bT: bT, hT: hT, hb: hb, ab: ab, avisos: [], erro: null };
    var fh = hb <= 0.5 ? 1 : (hb <= 1.5 ? 2 : (hb <= 6 ? 3 : 0));
    if (!fh) { out.erro = "paredes: h/b = " + br(hb, 2) + " > 6, fora da Tabela 4"; return out; }
    var L1 = linhaT4(fh, 1), L2 = linhaT4(fh, 2), v;
    if (ab <= 1.5) { v = L1.v.slice(); out.usadas = [L1]; out.interpolado = false; }
    else if (ab < 2) {
      v = L1.v.map(function (x, k) { return interp(ab, 1.5, 2, x, L2.v[k]); });
      out.usadas = [L1, L2]; out.interpolado = true;
    } else {
      v = L2.v.slice(); out.usadas = [L2]; out.interpolado = false;
      if (ab > 4) out.avisos.push("paredes: a/b = " + br(ab, 2) + " > 4, além da última linha da Tabela 4 — adotados os valores de 2 ≤ a/b ≤ 4 (conferir)");
    }
    var c = {}; TAB4.col.forEach(function (nm, k) { c[nm] = arred(v[k], 6); });
    /* nota b: A3 e B3 a 0° */
    c.A3B3 = arred(ab >= 2 ? TAB4.a3b3 : interp(ab, 1, 2, L1.v[1], TAB4.a3b3), 6);
    out.a3Interpolado = ab > 1 && ab < 2;
    out.c = c;
    out.x1 = Math.min(Math.max(bT / 3, aT / 4), 2 * hT);   /* A1/B1 */
    out.x2 = Math.min(2 * hT, bT / 2);                        /* C1/D1 */
    out.e = Math.min(0.2 * bT, hT);                           /* faixa do cpe médio */
    return out;
  }

  /* zonas das paredes numa direção do vento (trechos s0–s1 por face) */
  function zonasParedes(G, T, d) {
    var aLongoZ = G.a >= G.b;
    var aoLongo = (d === 0 || d === 180) ? aLongoZ : !aLongoZ;   /* vento ao longo da maior dimensão = α 0° da tabela */
    var fw = BARL[d], fl = SOTA[d], par = PARAL[d];
    var Z = { frente: [], fundo: [], esquerda: [], direita: [] };
    var Lw = compFace(G, fw), Lp = compFace(G, par[0]);
    function seg(face, zona, d0, d1, cpe) {
      var s0 = sDist(G, d, d0), s1 = sDist(G, d, d1);
      if (s0 > s1) { var t = s0; s0 = s1; s1 = t; }
      if (s1 - s0 > 1e-9) Z[face].push({ zona: zona, s0: arred(s0, 6), s1: arred(s1, 6), cpe: cpe });
    }
    if (aoLongo) {
      Z[fw].push({ zona: "C", s0: 0, s1: Lw, cpe: T.c.C });
      Z[fl].push({ zona: "D", s0: 0, s1: Lw, cpe: T.c.D });
      [["A", par[0]], ["B", par[1]]].forEach(function (pp) {
        seg(pp[1], pp[0] + "1", 0, T.x1, T.c.A1B1);
        seg(pp[1], pp[0] + "2", T.x1, Lp / 2, T.c.A2B2);
        seg(pp[1], pp[0] + "3", Lp / 2, Lp, T.c.A3B3);
      });
    } else {
      Z[fw].push({ zona: "A", s0: 0, s1: Lw, cpe: T.c.A });
      Z[fl].push({ zona: "B", s0: 0, s1: Lw, cpe: T.c.B });
      [["C", par[0]], ["D", par[1]]].forEach(function (pp) {
        seg(pp[1], pp[0] + "1", 0, T.x2, T.c.C1D1);
        seg(pp[1], pp[0] + "2", T.x2, Lp, T.c.C2D2);
      });
    }
    FACES.forEach(function (f) { Z[f].sort(function (p, q) { return p.s0 - q.s0; }); });
    var e0 = sDist(G, d, 0), e1 = sDist(G, d, T.e);
    return { d: d, alfaTabela: aoLongo ? 0 : 90, zonas: Z, faixaAltaSuccao: { faces: par.slice(), s0: Math.min(e0, e1), s1: Math.max(e0, e1), cpe: T.c.cpeMedio } };
  }
  function ceMedioFace(zf) { var s = 0, L = 0; zf.forEach(function (z) { s += z.cpe * (z.s1 - z.s0); L += z.s1 - z.s0; }); return L > 0 ? s / L : NaN; }
  function ceTrecho(zf, s0, s1) {
    var s = 0, L = 0;
    zf.forEach(function (z) { var o = sobreposicao(s0, s1, z.s0, z.s1); s += z.cpe * o; L += o; });
    return L > 0 ? s / L : ceMedioFace(zf);
  }
  function zonasNoTrecho(zf, s0, s1) { return zf.filter(function (z) { return sobreposicao(s0, s1, z.s0, z.s1) > 1e-9; }); }

  /* ====================================================== TELHADO (Tab. 5) */
  function cpeTelhado5(G) {
    var hb = G.h / G.b, ab = G.a / G.b, th = G.th, out = { tabela: 5, hb: hb, ab: ab, avisos: [], erro: null };
    if (G.a < G.b) { out.erro = "cobertura: a Tabela 5 pede a ≥ b, com a cumeeira ao longo do lado maior (comprimento " + br(G.a) + " m < vão " + br(G.b) + " m)"; return out; }
    var bl = hb <= 0.5 ? TAB5.blocos[0] : (hb <= 1.5 ? TAB5.blocos[1] : (hb <= 6 ? TAB5.blocos[2] : null));
    if (!bl) { out.erro = "cobertura: h/b = " + br(hb, 2) + " > 6, fora da Tabela 5"; return out; }
    if (th > bl.th[bl.th.length - 1]) { out.erro = "cobertura: θ = " + bt(th, 2) + "° > 60°, fora da Tabela 5"; return out; }
    var c = {}, info = {};
    ["EF", "GH", "EG", "FH"].forEach(function (k) { var r = emTheta(bl.th, bl[k], th); c[k] = arred(r.v, 6); info[k] = r; });
    c.IJ = arred(ab >= 2 ? TAB5.ij : interp(ab, 1, 2, c.FH, TAB5.ij), 6);
    var loc = {};
    ["oitao", "beiral1", "beiral2", "cumeeira"].forEach(function (k) { loc[k] = localEmTheta(bl.th, bl[k], th); if (loc[k]) loc[k].v = arred(loc[k].v, 6); });
    out.c = c; out.info = info; out.loc = loc; out.bloco = bl; out.ijInterpolado = ab > 1 && ab < 2;
    out.y = Math.min(G.h, 0.15 * G.b);
    out.y1 = Math.min(Math.max(G.b / 3, G.a / 4), 2 * G.h);
    return out;
  }
  function zonasTelhado5(G, T, d) {
    var b = G.b, a = G.a, m = b / 2, Z = [];
    function ret(zona, agua, x0, x1, z0, z1, cpe) { if (x1 - x0 > 1e-9 && z1 - z0 > 1e-9) Z.push({ zona: zona, agua: agua, x0: arred(x0, 6), x1: arred(x1, 6), z0: arred(z0, 6), z1: arred(z1, 6), cpe: cpe }); }
    if (d === 90 || d === 270) {
      var esq = d === 90;
      ret("EF", esq ? "esquerda" : "direita", esq ? 0 : m, esq ? m : b, 0, a, T.c.EF);
      ret("GH", esq ? "direita" : "esquerda", esq ? m : 0, esq ? b : m, 0, a, T.c.GH);
    } else {
      var bands = d === 0 ? [["EG", 0, T.y1], ["FH", T.y1, a / 2], ["IJ", a / 2, a]] : [["EG", a - T.y1, a], ["FH", a / 2, a - T.y1], ["IJ", 0, a / 2]];
      bands.forEach(function (bd) { ret(bd[0], "esquerda", 0, m, bd[1], bd[2], T.c[bd[0]]); ret(bd[0], "direita", m, b, bd[1], bd[2], T.c[bd[0]]); });
    }
    Z.sort(function (p, q) { return (p.z0 - q.z0) || (p.x0 - q.x0); });
    return Z;
  }
  function locaisTelhado5(G, T) {
    var a = G.a, b = G.b, y = T.y, y1 = T.y1, L = [];
    function ret(zona, x0, x1, z0, z1) { var v = T.loc[zona]; if (v && x1 - x0 > 1e-9 && z1 - z0 > 1e-9) L.push({ zona: zona, x0: arred(x0, 6), x1: arred(x1, 6), z0: arred(z0, 6), z1: arred(z1, 6), cpe: v.v }); }
    ret("oitao", 0, b, 0, y); ret("oitao", 0, b, a - y, a);
    [[0, y], [b - y, b]].forEach(function (xs) {
      ret("beiral1", xs[0], xs[1], y, y1); ret("beiral1", xs[0], xs[1], a - y1, a - y);
      ret("beiral2", xs[0], xs[1], y1, a - y1);
    });
    ret("cumeeira", b / 2 - y, b / 2 + y, 0, a);
    return L;
  }

  /* ====================================================== TELHADO (Tab. 6) */
  function cpeTelhado6(G) {
    var hb = G.h / G.b, ab = G.a / G.b, th = G.th, out = { tabela: 6, hb: hb, ab: ab, avisos: [], erro: null };
    if (G.a < G.b) { out.erro = "cobertura: a Tabela 6 pede a ≥ b, com os beirais ao longo do lado maior (comprimento " + br(G.a) + " m < vão " + br(G.b) + " m)"; return out; }
    if (hb >= 2) { out.erro = "cobertura: h/b = " + br(hb, 2) + " ≥ 2, fora da Tabela 6"; return out; }
    if (th > 30) { out.erro = "cobertura: θ = " + bt(th, 2) + "° > 30°, fora da Tabela 6"; return out; }
    var thU = th;
    if (th < 5) { thU = 5; out.avisos.push("cobertura de uma água: θ = " + bt(th, 2) + "° < 5°, abaixo da primeira linha da Tabela 6 — adotados os valores de θ = 5° (conferir)"); }
    out.thUsado = thU;
    var c = {}, info = {};
    function pega(nome, arr) { var r = emTheta(TAB6.th, arr, thU); c[nome] = arred(r.v, 6); info[nome] = r; }
    pega("H90", TAB6.a90.H); pega("L90", TAB6.a90.L);
    pega("Hm90", TAB6.am90.H); pega("Lm90", TAB6.am90.L);
    pega("A0", TAB6.a0.A); pega("B0", TAB6.a0.B);
    pega("H45", TAB6.a45.H); pega("L45", TAB6.a45.L); pega("Hm45", TAB6.am45.H); pega("Lm45", TAB6.am45.L);
    /* nota: I e J a 0° — a/b = 1 → "mesmo valor das partes H e L": a 0° H e L
     * têm dois valores, (A) e (B); o motor usa o (B), a faixa vizinha de I/J
     * (como F/H na Tabela 5 e A2/B2 na Tabela 4). Interpretação — no memorial. */
    c.IJ = arred(ab >= 2 ? TAB6.ij : interp(ab, 1, 2, c.B0, TAB6.ij), 6);
    var loc = {};
    Object.keys(TAB6.medio).forEach(function (k) { loc[k] = localEmTheta(TAB6.th, TAB6.medio[k], thU); if (loc[k]) loc[k].v = arred(loc[k].v, 6); });
    out.c = c; out.info = info; out.loc = loc; out.ijInterpolado = ab > 1 && ab < 2;
    out.y = Math.min(G.h, 0.15 * G.b);
    return out;
  }
  function metades6(G) {
    var m = G.b / 2, altoEsq = G.ladoAlto === "esquerda";
    return { H: altoEsq ? [0, m] : [m, G.b], L: altoEsq ? [m, G.b] : [0, m], altoEsq: altoEsq };
  }
  /* vento 90° (bate na esquerda) chega pelo lado alto quando o alto é a esquerda */
  function chegaPeloAlto(G, d) { return (d === 90) === (G.ladoAlto === "esquerda"); }
  function zonasTelhado6(G, T, d) {
    var b = G.b, a = G.a, M = metades6(G), Z = [];
    function ret(zona, agua, x0, x1, z0, z1, cpe) { if (x1 - x0 > 1e-9 && z1 - z0 > 1e-9) Z.push({ zona: zona, agua: agua, x0: arred(x0, 6), x1: arred(x1, 6), z0: arred(z0, 6), z1: arred(z1, 6), cpe: cpe }); }
    if (d === 90 || d === 270) {
      var alto = chegaPeloAlto(G, d);
      ret("H", "metade alta", M.H[0], M.H[1], 0, a, alto ? T.c.H90 : T.c.Hm90);
      ret("L", "metade baixa", M.L[0], M.L[1], 0, a, alto ? T.c.L90 : T.c.Lm90);
    } else {
      var bands = d === 0 ? [["HL(A)", 0, b / 2, T.c.A0], ["HL(B)", b / 2, a / 2, T.c.B0], ["IJ", a / 2, a, T.c.IJ]]
                          : [["HL(A)", a - b / 2, a, T.c.A0], ["HL(B)", a / 2, a - b / 2, T.c.B0], ["IJ", 0, a / 2, T.c.IJ]];
      bands.forEach(function (bd) { ret(bd[0], "água única", 0, b, bd[1], bd[2], bd[3]); });
    }
    Z.sort(function (p, q) { return (p.z0 - q.z0) || (p.x0 - q.x0); });
    return Z;
  }
  function locaisTelhado6(G, T) {
    var a = G.a, b = G.b, y = T.y, M = metades6(G), L = [];
    var xHs = M.altoEsq ? [0, y] : [b - y, b], xLs = M.altoEsq ? [b - y, b] : [0, y], zb = Math.min(b, a / 2);
    function ret(zona, xs, z0, z1) { var v = T.loc[zona]; if (v && xs[1] - xs[0] > 1e-9 && z1 - z0 > 1e-9) L.push({ zona: zona, x0: arred(xs[0], 6), x1: arred(xs[1], 6), z0: arred(z0, 6), z1: arred(z1, 6), cpe: v.v }); }
    ret("He", M.H, 0, y); ret("He", M.H, a - y, a);
    ret("Le", M.L, 0, y); ret("Le", M.L, a - y, a);
    ret("H1", xHs, y, zb); ret("H1", xHs, a - zb, a - y);
    ret("L1", xLs, y, zb); ret("L1", xLs, a - zb, a - y);
    ret("H2", xHs, zb, a - zb); ret("L2", xLs, zb, a - zb);
    return L;
  }

  /* ====================================================== Cpi */
  function cpiBarlavento(R) {
    var t = CPI.barl;
    if (!(R < Infinity) || R >= t.razao[t.razao.length - 1]) return { v: t.cpi[t.cpi.length - 1], faixa: "6 ou mais", interpolado: false, linha: t.l[t.l.length - 1] };
    if (R < t.razao[0]) return null;
    for (var i = 0; i < t.razao.length - 1; i++) {
      if (R === t.razao[i]) return { v: t.cpi[i], interpolado: false, linha: t.l[i] };
      if (R > t.razao[i] && R < t.razao[i + 1]) return { v: interp(R, t.razao[i], t.razao[i + 1], t.cpi[i], t.cpi[i + 1]), interpolado: true, linha: [t.l[i], t.l[i + 1]] };
    }
    return { v: t.cpi[t.cpi.length - 1], interpolado: false };
  }
  function cpiSuccao(R) {
    var t = CPI.succao;
    if (!(R < Infinity) || R >= t.razao[t.razao.length - 1]) return { v: t.cpi[t.cpi.length - 1], faixa: "3 ou mais", interpolado: false, linha: t.l[t.l.length - 1] };
    if (R < t.razao[0]) return null;
    for (var i = 0; i < t.razao.length - 1; i++) {
      if (R === t.razao[i]) return { v: t.cpi[i], interpolado: false, linha: t.l[i] };
      if (R > t.razao[i] && R < t.razao[i + 1]) return { v: interp(R, t.razao[i], t.razao[i + 1], t.cpi[i], t.cpi[i + 1]), interpolado: true, linha: [t.l[i], t.l[i + 1]] };
    }
    return { v: t.cpi[t.cpi.length - 1], interpolado: false };
  }

  /* ANEXO D (D.5): Σ ±A·√|Ce − cpi| = 0, sinal de (Ce − cpi). A soma cai
   * monotonamente com cpi: bissecção entre o menor e o maior Ce. O adotado
   * é o valor com uma casa decimal, como nos quatro exemplos do Anexo D
   * (p. 47–49), que este solver reproduz (tools/test-aco-vento.js). */
  function cpiAnexoD(aberturas) {
    var L = (aberturas || []).filter(function (o) { return o && o.A > 0 && fin(o.ce); });
    if (!L.length) return null;
    function f(ci) { var s = 0; L.forEach(function (o) { var d = o.ce - ci; s += (d >= 0 ? 1 : -1) * o.A * Math.sqrt(Math.abs(d)); }); return s; }
    var lo = Infinity, hi = -Infinity;
    L.forEach(function (o) { lo = Math.min(lo, o.ce); hi = Math.max(hi, o.ce); });
    var x;
    if (hi - lo < 1e-12) x = lo;
    else { for (var i = 0; i < 80; i++) { x = (lo + hi) / 2; if (f(x) > 0) lo = x; else hi = x; } x = (lo + hi) / 2; }
    return { exato: x, adotado: Math.round(x * 10) / 10, soma: f, aberturas: L };
  }

  function lerFaces(G, faces) {
    faces = faces || {};
    var F = {};
    FACES.forEach(function (k) {
      var f = faces[k] || {}, L = compFace(G, k);
      var A = num(f.area, NaN) > 0 ? num(f.area) : areaFace(G, k);
      var lista = [];
      (f.aberturas || []).forEach(function (o, i) {
        if (!o) return;
        var ar = num(o.area, NaN); if (!(ar > 0)) return;
        var s0 = num(o.s0, NaN), s1 = num(o.s1, NaN), pos = fin(s0) && fin(s1) && s1 > s0;
        lista.push({ nome: o.nome || (k + " — abertura " + (i + 1)), area: ar, dominante: !!o.dominante, s0: pos ? Math.max(0, s0) : null, s1: pos ? Math.min(L, s1) : null });
      });
      var aberta = f.fechada === false;
      if (aberta) lista = [{ nome: k + " (face aberta)", area: A, dominante: true, s0: 0, s1: L, faceAberta: true }];
      var ved = String(f.vedacao || "telha").toLowerCase();
      var vedImperm = /alvenaria|bloco|tijolo|pedra|concreto|moldado/.test(ved) && ved.indexOf("misto") < 0;
      var perm = f.permeavel != null ? !!f.permeavel : (aberta || lista.length > 0 || !vedImperm);
      F[k] = { face: k, comp: L, area: A, aberta: aberta, aberturas: lista, permeavel: perm, vedacao: ved };
    });
    return F;
  }

  /* envoltória dos candidatos: valores iguais se juntam; mais de dois → o
   * menor e o maior (os extremos governam) */
  function reduzir(cand, referencia, item) {
    var u = [];
    cand.forEach(function (c) {
      var ex = u.filter(function (x) { return Math.abs(x.valor - c.valor) < 1e-9; })[0];
      if (ex) ex.motivos.push(c.motivo); else u.push({ valor: c.valor, motivos: [c.motivo], interpolado: !!c.interpolado });
    });
    u.sort(function (p, q) { return p.valor - q.valor; });
    if (u.length > 2) {
      var meio = u.slice(1, u.length - 1).map(function (x) { return bts(x.valor, 2); }).join(", ");
      u = [u[0], u[u.length - 1]];
      u[1].motivos.push("valores intermediários (" + meio + ") ficam entre os extremos");
    }
    return u.map(function (x) { return { valor: x.valor, item: item, interpolado: x.interpolado, motivo: x.motivos.join("; ") + (u.length > 1 ? " — envoltória: considerados os extremos" : ""), referencia: referencia }; });
  }

  function cpiAnexoDFaces(ZP, d, itens) {
    var Z = ZP[d].zonas, ab = [];
    itens.forEach(function (x) {
      var o = x.o, zf = Z[x.face];
      var ce = o.s0 != null ? ceTrecho(zf, o.s0, o.s1) : ceMedioFace(zf);
      ab.push({ nome: o.nome, face: x.face, A: o.area, ce: ce });
    });
    var r = cpiAnexoD(ab);
    if (!r) return [];
    return [{ valor: r.adotado, exato: r.exato, item: "Anexo D",
              motivo: "Anexo D (6.2.11): Σ ±A·√|Ce − cpi| = 0 com " + ab.map(function (o) { return o.nome + " (A = " + bt(o.A, 2) + " m², Ce = " + bts(o.ce, 3) + ")"; }).join("; ") +
                      " → cpi = " + bts(r.exato, 3) + ", adotado " + bts(r.adotado, 1) + " (uma casa decimal, como nos exemplos do Anexo D)",
              referencia: ref("6.2.11 e Anexo D", "linhas 1577–1579 e 3234–3356; exemplos nas p. 47–49 do PDF") }];
  }

  function cpiSemDominante(G, F, ZP, d, entrada, aviso) {
    if (entrada.estanque) return CPI.estanque.map(function (v) { return { valor: v, item: "6.2.6", motivo: "edificação efetivamente estanque, janelas fixas: cpi = −0,2 ou 0 (o mais nocivo)", referencia: ref("6.2.6", "linhas " + CPI.lestanque) }; });
    var P = FACES.filter(function (k) { return F[k].permeavel; });
    if (P.length === 4) {
      /* só as aberturas não dominantes (a dominante fechada vale como fresta) */
      var ar = FACES.map(function (k) { return soma(F[k].aberturas.filter(function (o) { return !o.dominante; })); });
      if (Math.max.apply(null, ar) - Math.min.apply(null, ar) > 1e-9) aviso("Cpi 6.2.5-b supõe as quatro faces igualmente permeáveis; as aberturas informadas diferem entre as faces — se as áreas reais forem conhecidas, o Anexo D (6.2.11) dá o valor exato");
      return CPI.quatro.map(function (v) { return { valor: v, item: "6.2.5-b", motivo: "quatro faces igualmente permeáveis: cpi = −0,3 ou 0 (considerar o mais nocivo)", referencia: ref("6.2.5-b", "linhas " + CPI.lquatro) }; });
    }
    if (P.length === 2 && OPOSTA[P[0]] === P[1]) {
      var perp = P.indexOf(BARL[d]) >= 0;
      return [{ valor: perp ? CPI.duasOpostas.perm : CPI.duasOpostas.imperm, item: "6.2.5-a",
                motivo: "duas faces opostas permeáveis (" + P.join(" e ") + "), as outras impermeáveis; vento perpendicular a uma face " + (perp ? "permeável: cpi = +0,2" : "impermeável: cpi = −0,3"),
                referencia: ref("6.2.5-a", "linha " + (perp ? CPI.duasOpostas.lperm : CPI.duasOpostas.limperm)) }];
    }
    if (P.length === 0) {
      aviso("nenhuma parede permeável (alvenaria/concreto sem aberturas, 6.2.2): adotado 6.2.6, cpi = −0,2 ou 0 — confira se a edificação é de fato estanque");
      return CPI.estanque.map(function (v) { return { valor: v, item: "6.2.6", motivo: "paredes impermeáveis (6.2.2), edificação tratada como estanque: cpi = −0,2 ou 0", referencia: ref("6.2.6", "linhas " + CPI.lestanque) }; });
    }
    var listadas = P.every(function (k) { return F[k].aberturas.length > 0; }), itens = [];
    P.forEach(function (k) {
      if (listadas) F[k].aberturas.forEach(function (o) { itens.push({ face: k, o: o }); });
      else itens.push({ face: k, o: { nome: k + " (permeabilidade da face)", area: F[k].area, s0: null, s1: null } });
    });
    aviso("faces permeáveis: " + P.join(", ") + " — combinação fora de 6.2.5-a/b; Cpi pelo Anexo D (6.2.11) " + (listadas ? "com as aberturas informadas" : "supondo permeabilidade igual por m² nas faces permeáveis"));
    return cpiAnexoDFaces(ZP, d, itens);
  }

  function cpiDominante(G, F, ZP, d, face, doms, outras, aviso) {
    var Z = ZP[d].zonas, pf = papel(face, d);
    var suc = FACES.filter(function (k) { return ceMedioFace(Z[k]) < 0; });
    var outrasSuc = soma(outras.filter(function (x) { return suc.indexOf(x.face) >= 0; }).map(function (x) { return x.o; }));
    if (pf === "barlavento") {
      var nb = soma(doms.map(function (x) { return x.o; })) + soma(outras.filter(function (x) { return x.face === face; }).map(function (x) { return x.o; }));
      var R = outrasSuc > 0 ? nb / outrasSuc : Infinity, r = cpiBarlavento(R);
      if (!r) { aviso("abertura dominante a barlavento com razão " + br(R, 2) + " < 1 (abaixo de 6.2.5-c): Cpi pelo Anexo D"); return cpiAnexoDFaces(ZP, d, doms.concat(outras)); }
      return [{ valor: r.v, item: "6.2.5-c", interpolado: r.interpolado,
                motivo: "abertura dominante na face de barlavento (" + face + "); razão aberturas na face de barlavento / aberturas nas faces em sucção = " +
                        (R === Infinity ? "∞ (nenhuma outra abertura informada nas faces em sucção → \"6 ou mais\")" : bt(nb, 2) + " / " + bt(outrasSuc, 2) + " = " + br(R, 2)) +
                        " → cpi = " + bts(r.v, 3) + (r.interpolado ? " (interpolado linearmente entre os valores de 6.2.5-c)" : ""),
                referencia: ref("6.2.5-c", "linhas 1494–1505") }];
    }
    if (pf === "sotavento") {
      var ce = ceMedioFace(Z[face]);
      return [{ valor: ce, item: "6.2.5-c", motivo: "abertura dominante na face de sotavento (" + face + "): cpi = Ce da face (zona " + Z[face][0].zona + ", Tabela 4) = " + bts(ce, 2),
                referencia: ref("6.2.5-c", "linhas 1506–1508 e Tabela 4") }];
    }
    /* face paralela ao vento */
    var fx = ZP[d].faixaAltaSuccao, temFaixa = fx.faces.indexOf(face) >= 0;
    var cand = [], areaZona = 0, desconhecida = false;
    doms.forEach(function (x) {
      var o = x.o;
      if (o.s0 != null) {
        if (temFaixa) { var ov = sobreposicao(o.s0, o.s1, fx.s0, fx.s1); if (ov > 1e-9) areaZona += o.area * ov / (o.s1 - o.s0); }
        zonasNoTrecho(Z[face], o.s0, o.s1).forEach(function (z) {
          cand.push({ valor: z.cpe, motivo: "abertura dominante na face paralela ao vento (" + face + ", s = " + bt(o.s0, 2) + " a " + bt(o.s1, 2) + " m), na zona " + z.zona + ", fora da zona de alta sucção: cpi = Ce = " + bts(z.cpe, 2) });
        });
      } else {
        desconhecida = true; areaZona += temFaixa ? o.area : 0;
        Z[face].forEach(function (z) { cand.push({ valor: z.cpe, motivo: "posição da abertura dominante na face " + face + " não informada — pode estar na zona " + z.zona + " (Ce = " + bts(z.cpe, 2) + ")" }); });
      }
    });
    if (areaZona > 1e-9) {
      var Rz = outrasSuc > 0 ? areaZona / outrasSuc : Infinity, rz = cpiSuccao(Rz);
      if (rz) {
        if (!desconhecida) cand = [];
        cand.push({ valor: rz.v, interpolado: rz.interpolado,
                    motivo: "abertura dominante" + (desconhecida ? " (se estiver)" : "") + " na zona de alta sucção externa da face " + face + " (faixa s = " + bt(fx.s0, 2) + " a " + bt(fx.s1, 2) + " m); razão área na zona / outras aberturas nas faces em sucção = " +
                            (Rz === Infinity ? "∞ (nenhuma outra abertura informada → \"3 ou mais\")" : br(Rz, 2)) + " → cpi = " + bts(rz.v, 3) + (rz.interpolado ? " (interpolado)" : "") });
      } else aviso("a parte da abertura dominante dentro da zona de alta sucção é pequena (razão < 0,25, abaixo do primeiro valor de 6.2.5-c): adotado o Ce do local");
    }
    return reduzir(cand, ref("6.2.5-c", "linhas 1509–1535 e Tabela 4"), "6.2.5-c");
  }

  function analisarCpi(G, F, ZP, entrada, aviso) {
    var lista = [];
    var flag = [], abertas = [];
    FACES.forEach(function (k) { F[k].aberturas.forEach(function (o) { if (o.faceAberta) abertas.push(k); else if (o.dominante) flag.push(k); }); });
    var outras = [];
    FACES.forEach(function (k) { F[k].aberturas.forEach(function (o) { if (!o.dominante) outras.push({ face: k, o: o }); }); });
    var cen = [];
    if (flag.length) cen.push({ id: "dominante-fechada", nome: "abertura dominante fechada", comFlag: false });
    cen.push({ id: flag.length ? "dominante-aberta" : (abertas.length ? "face-aberta" : "sem-dominante"),
               nome: flag.length ? "abertura dominante aberta" : (abertas.length ? "face aberta" : "sem abertura dominante"), comFlag: true });
    cen.forEach(function (c) {
      var doms = [];
      FACES.forEach(function (k) { F[k].aberturas.forEach(function (o) { if (o.faceAberta || (o.dominante && c.comFlag)) doms.push({ face: k, o: o }); }); });
      var fd = [];
      doms.forEach(function (x) { if (fd.indexOf(x.face) < 0) fd.push(x.face); });
      var aDom = soma(doms.map(function (x) { return x.o; })), aOut = soma(outras.map(function (x) { return x.o; }));
      if (fd.length === 1 && aDom < aOut) aviso("a abertura marcada como dominante (" + fd[0] + ", " + bt(aDom, 2) + " m²) é menor que a soma das demais (" + bt(aOut, 2) + " m²) — não atende 6.2.4; Cpi desse cenário pelo Anexo D");
      if (fd.length > 1) aviso("aberturas dominantes em mais de uma face (" + fd.join(", ") + "): fora de 6.2.5-c, Cpi pelo Anexo D (6.2.11)");
      DIRS.forEach(function (d) {
        var res;
        if (!fd.length) res = cpiSemDominante(G, F, ZP, d, entrada, aviso);
        else if (fd.length === 1 && aDom >= aOut) res = cpiDominante(G, F, ZP, d, fd[0], doms, outras, aviso);
        else res = cpiAnexoDFaces(ZP, d, doms.concat(outras));
        res.forEach(function (r) { r.direcao = d; r.cenario = c.id; r.cenarioNome = c.nome; lista.push(r); });
      });
    });
    return lista;
  }

  /* simetria das aberturas: decide se 180° e 270° precisam de casos próprios */
  function assinatura(F, k, espelho, L) {
    var f = F[k];
    var s = f.aberturas.map(function (o) {
      var s0 = o.s0, s1 = o.s1;
      if (s0 != null && espelho) { var t = L - s1; s1 = L - s0; s0 = t; }
      return [arred(o.area, 3), o.dominante ? 1 : 0, s0 == null ? "?" : arred(s0, 3), s1 == null ? "?" : arred(s1, 3)].join("|");
    }).sort().join(";");
    return (f.permeavel ? "P" : "I") + (f.aberta ? "A" : "") + ":" + s;
  }
  function simetrias(G, F) {
    var sz = assinatura(F, "frente") === assinatura(F, "fundo")
      && assinatura(F, "esquerda") === assinatura(F, "esquerda", true, G.a)
      && assinatura(F, "direita") === assinatura(F, "direita", true, G.a);
    var sx = G.cob === "duas-aguas"
      && assinatura(F, "esquerda") === assinatura(F, "direita")
      && assinatura(F, "frente") === assinatura(F, "frente", true, G.b)
      && assinatura(F, "fundo") === assinatura(F, "fundo", true, G.b);
    return { z: sz, x: sx };
  }

  /* ====================================================== ATRITO (6.4) */
  function atrito64(G, d, q) {
    var ao0 = d === 0 || d === 180;
    var l1 = ao0 ? G.b : G.a, l2 = ao0 ? G.a : G.b, h = G.h;
    if (!(l2 / h > 4 || l2 / l1 > 4)) return null;
    var cf = CF[G.nervuras], lim = h <= l1 ? 4 * h : 4 * l1, comp = Math.max(0, l2 - lim);
    if (comp <= 0) return null;
    var Ft = cf.cf * q * l1 * comp, Fp = cf.cf * q * 2 * h * comp;
    var ini = (d === 0 || d === 90) ? lim : 0, fim = (d === 0 || d === 90) ? l2 : l2 - lim;
    return { cf: cf.cf, nervuras: G.nervuras, l1: l1, l2: l2, h: h, inicio: arred(ini, 6), fim: arred(fim, 6), eixo: ao0 ? "z" : "x",
             sentido: d === 0 ? "+z" : (d === 180 ? "−z" : (d === 90 ? "+x" : "−x")),
             porArea: arred(cf.cf * q, 6), telhado: arred(Ft, 4), paredes: arred(Fp, 4), total: arred(Ft + Fp, 4),
             formula: h <= l1 ? "F' = Cf·q·l1·(l2 − 4h) + Cf·q·2h·(l2 − 4h)" : "F' = Cf·q·l1·(l2 − 4l1) + Cf·q·2h·(l2 − 4l1)",
             referencia: ref("6.4.2 e 6.4.3", "linhas 1873–1892") };
  }

  /* ====================================================== V0 */
  function obterIsopletas(opcoes) {
    if (opcoes && Object.prototype.hasOwnProperty.call(opcoes, "isopletas")) return opcoes.isopletas;
    if (global && global.AcoIsopletas) return global.AcoIsopletas;
    if (typeof module !== "undefined" && module.exports && typeof require === "function") { try { return require("./acoisopletas.js"); } catch (e) { return null; } }
    return null;
  }

  /* ====================================================== CÁLCULO */
  function calcular(entrada, opcoes) {
    entrada = entrada || {}; opcoes = opcoes || {};
    var R = { ok: true, norma: NORMA, edicao: ED, edicaoVigente: "NBR 6123:2023", avisos: [], erros: [], memoria: [], tabelasUsadas: [] };
    var nPasso = 0;
    function mem(o) {
      nPasso++; o.n = nPasso; if (!o.edicao) o.edicao = ED;
      o.resultadoTexto = (typeof o.resultado === "number" ? (o.unidade === "m/s" ? br(o.resultado, 2) : (o.unidade === "kN/m²" ? br(o.resultado, 4) : bt(o.resultado, 4))) : String(o.resultado)) + (o.unidade ? " " + o.unidade : "");
      R.memoria.push(o);
    }
    function aviso(t) { if (R.avisos.indexOf(t) < 0) R.avisos.push(t); }
    function erro(t) { if (R.erros.indexOf(t) < 0) R.erros.push(t); R.ok = false; }
    function tabela(t, fonte) { if (!R.tabelasUsadas.filter(function (x) { return x.tabela === t; }).length) R.tabelasUsadas.push({ tabela: t, fonte: fonte, edicao: ED }); }

    var G = lerGeometria(entrada.geometria, aviso, erro);
    var cat = String(entrada.categoria || "").toUpperCase();
    if (CATS.indexOf(cat) < 0) erro("categoria de rugosidade deve ser I, II, III, IV ou V (5.3.1)");
    var S3 = fatorS3(num(entrada.grupoS3, NaN));
    if (!S3) erro("grupoS3 deve ser 1, 2, 3, 4 ou 5 (Tabela 3)");
    if (!G || !R.ok) return R;
    R.geometria = { a: G.a, b: G.b, h: G.h, hCumeeira: G.hc, inclinacaoGraus: G.th, tgTheta: G.tg, cobertura: G.cob, aberta: G.aberta,
                    ladoAlto: G.cob === "uma-agua" ? G.ladoAlto : undefined, zRef: G.hc };

    /* ---------- V0 */
    var loc = entrada.local || {}, iso = obterIsopletas(opcoes), v0 = num(loc.v0, NaN), mapa = null, origem = "";
    var lat = num(loc.lat, NaN), lon = num(loc.lon, NaN);
    if (iso && typeof iso.v0 === "function" && fin(lat) && fin(lon)) { try { mapa = iso.v0(lat, lon); } catch (e) { mapa = null; aviso("isopletas: " + (e && e.message)); } }
    if (fin(v0)) {
      origem = "informado";
      if (mapa && fin(mapa.v0Adotado) && Math.abs(mapa.v0Adotado - v0) > 0.01) aviso("V0 informado (" + bt(v0, 1) + " m/s) difere do mapa de isopletas (" + bt(mapa.v0Adotado, 1) + " m/s): usado o informado");
    } else if (mapa && fin(mapa.v0Adotado)) { v0 = mapa.v0Adotado; origem = "isopletas"; }
    else { erro("V0 não definido: informe local.v0 (m/s) ou lat/lon com o js/acoisopletas.js carregado"); return R; }
    if (v0 < 25 || v0 > 55) aviso("V0 = " + bt(v0, 1) + " m/s fora da faixa do mapa de isopletas do Brasil (30 a 50 m/s) — conferir");
    R.v0 = v0;
    R.v0Info = { origem: origem, lat: fin(lat) ? lat : null, lon: fin(lon) ? lon : null, descricao: loc.descricao || "", mapa: mapa };
    mem({ passo: "Velocidade básica do vento", formula: "V0 = rajada de 3 s, excedida em média uma vez em 50 anos, a 10 m do terreno em campo aberto e plano",
          valores: origem === "isopletas" ? (mapa.texto || ("isopleta no ponto " + bt(lat, 5) + ", " + bt(lon, 5))) : ("informado" + (loc.descricao ? " — " + loc.descricao : "") + (mapa && fin(mapa.v0Adotado) ? " (o mapa dá " + bt(mapa.v0Adotado, 1) + " m/s)" : "")),
          resultado: v0, unidade: "m/s", referencia: ref("5.1 / Figura 1", "linhas 551–563; isopletas — o mapa é o mesmo na 2023") });

    /* ---------- S1 */
    var s1c = entrada.s1 || {}, tipoS1 = String(s1c.tipo || "plano").toLowerCase();
    var s1Var = (tipoS1 === "talude" || tipoS1 === "morro") && !fin(num(s1c.valor, NaN));
    var s1Teste = fatorS1(s1c, 0);
    if (s1Teste.erro) { erro(s1Teste.erro); return R; }
    if (s1Var) aviso("S1 de talude/morro calculado no ponto B (topo), o mais desfavorável da Figura 2; entre A e B e entre B e C a norma interpola linearmente (5.2, nota) — os valores de 5.2-b são primeira aproximação e devem ser usados com precaução");
    function produtoS1S2(classe) {
      var zr = G.hc, s2r = fatorS2(cat, classe, zr);
      if (!s1Var) { var s1 = fatorS1(s1c, zr); return { z: zr, zS1: zr, s1: s1, s2: s2r, prod: s1.valor * s2r.valor, varrido: false }; }
      if (fin(num(s1c.z, NaN))) { var s1z = fatorS1(s1c, num(s1c.z)); return { z: zr, zS1: num(s1c.z), s1: s1z, s2: s2r, prod: s1z.valor * s2r.valor, varrido: false }; }
      var best = null, n = 400;
      for (var i = 0; i <= n; i++) {
        var z = zr * i / n, a1 = fatorS1(s1c, z), a2 = fatorS2(cat, classe, z), p = a1.valor * a2.valor;
        if (!best || p > best.prod + 1e-12) best = { z: z, zS1: z, s1: a1, s2: a2, prod: p, varrido: true };
      }
      return best;
    }

    /* ---------- classe, S2, Vk e q por direção */
    var classeFixa = entrada.classe && "ABC".indexOf(String(entrada.classe)) >= 0 && String(entrada.classe).length === 1 ? String(entrada.classe) : null;
    var porDir = {}, cache = {};
    DIRS.forEach(function (d) {
      var ao0 = d === 0 || d === 180;
      var largura = ao0 ? G.b : G.a, dim = Math.max(largura, G.hc);
      var classe = classeFixa || classePorDimensao(dim);
      var ps = cache[classe] || (cache[classe] = produtoS1S2(classe));
      var vk = v0 * ps.s1.valor * ps.s2.valor * S3.valor, q = 0.613 * vk * vk / 1000;
      porDir[d] = { classe: classe, larguraFrontal: largura, alturaFrontal: G.hc, dimFrontal: dim, z: ps.z, zS1: ps.zS1, s1: ps.s1.valor, s2: ps.s2.valor, s2Info: ps.s2, s1Info: ps.s1, vk: vk, q: q, varrido: ps.varrido };
      if (dim > 80) aviso("superfície frontal com mais de 80 m (direção " + d + "°): a norma permite o intervalo de tempo do Anexo A (5.3.2) — o motor ficou na classe C");
    });
    var dGov = 0; DIRS.forEach(function (d) { if (porDir[d].q > porDir[dGov].q + 1e-12) dGov = d; });
    var gov = porDir[dGov];
    var psA = cache.A || (cache.A = produtoS1S2("A"));
    var vkA = v0 * psA.s1.valor * psA.s2.valor * S3.valor, qLocal = 0.613 * vkA * vkA / 1000;
    var S3v = TAB3[4].s3, vkV = v0 * psA.s1.valor * psA.s2.valor * S3v, qVed = 0.613 * vkV * vkV / 1000;

    R.s1 = { valor: gov.s1, tipo: tipoS1, z: gov.zS1, formula: gov.s1Info.formula, referencia: gov.s1Info.referencia };
    R.s3 = S3.valor; R.s3Info = S3;
    R.s2 = { valor: gov.s2, z: gov.z, classe: gov.classe, categoria: cat, b: gov.s2Info.b, p: gov.s2Info.p, Fr: gov.s2Info.Fr, zg: gov.s2Info.zg, zmin: gov.s2Info.zmin, direcao: dGov,
             f: function (z, classe) { var r = fatorS2(cat, classe || gov.classe, z); return r ? r.valor : NaN; },
             porDirecao: {} };
    DIRS.forEach(function (d) { var p = porDir[d]; R.s2.porDirecao[d] = { classe: p.classe, dimFrontal: p.dimFrontal, valor: p.s2, b: p.s2Info.b, p: p.s2Info.p, Fr: p.s2Info.Fr, s1: p.s1, vk: p.vk, q: p.q }; });
    R.vk = gov.vk; R.q = gov.q;
    R.qLocal = qLocal; R.qVedacao = qVed;
    R.porDirecao = porDir;

    /* memória: S1, categoria, classe, S2, S3, Vk, q */
    mem({ passo: "Fator topográfico S1", formula: gov.s1Info.formula,
          valores: s1Var ? ("θ = " + bt(s1c.theta, 2) + "°, d = " + bt(s1c.d, 2) + " m, ponto B" + (gov.varrido ? "; S1(z)·S2(z) varrido de 0 a " + br(G.hc) + " m, máximo em z = " + br(gov.zS1) + " m (q único, a favor da segurança)" : ", z = " + br(gov.zS1) + " m")) : "—",
          resultado: arred(gov.s1, 4), unidade: "", referencia: gov.s1Info.referencia, interpolado: !!gov.s1Info.interpolado });
    var descCat = { I: "superfícies lisas de grandes dimensões (mar calmo, lagos e rios, pântanos sem vegetação)", II: "terrenos abertos em nível, poucos obstáculos isolados; cota média do topo dos obstáculos ≤ 1,0 m", III: "terrenos planos ou ondulados com obstáculos (sebes, muros, edificações baixas e esparsas); cota média dos obstáculos 3,0 m", IV: "obstáculos numerosos e pouco espaçados (zona florestal, industrial ou urbanizada); cota média 10 m", V: "obstáculos numerosos, grandes, altos e pouco espaçados (centros de grandes cidades, complexos industriais); cota média ≥ 25 m" };
    var lCat = { I: "682–687", II: "688–697", III: "698–707", IV: "708–721", V: "722–728" };
    mem({ passo: "Rugosidade do terreno", formula: "categoria " + cat, valores: descCat[cat], resultado: cat, unidade: "", referencia: ref("5.3.1", "linhas " + lCat[cat]) });
    var txtClasse = [];
    [[0, "0° e 180°"], [90, "90° e 270°"]].forEach(function (par) { var p = porDir[par[0]]; txtClasse.push(par[1] + ": superfície frontal " + br(p.larguraFrontal) + " × " + br(p.alturaFrontal) + " m → maior dimensão " + br(p.dimFrontal) + " m → classe " + p.classe); });
    mem({ passo: "Classe da edificação (dimensões)", formula: classeFixa ? "classe informada: " + classeFixa : "classe A: maior dimensão ≤ 20 m; B: 20 a 50 m; C: > 50 m (superfície frontal de cada direção)",
          valores: txtClasse.join("; "), resultado: classeFixa || (porDir[0].classe + " / " + porDir[90].classe), unidade: "", referencia: ref("5.3.2", "linhas 758–776") });
    var classesFeitas = {};
    [0, 90].forEach(function (d) {
      var p = porDir[d], s = p.s2Info; if (classesFeitas[p.classe]) return; classesFeitas[p.classe] = true;
      tabela("Tabela 1", "linhas 803–865");
      mem({ passo: "Parâmetros de S2 — categoria " + cat + ", classe " + p.classe, formula: "b, p (Tabela 1) e Fr (sempre o da categoria II)",
            valores: "b = " + ft(s.b) + " (linha " + s.linhas.b + "); p = " + ft(s.p) + " (linha " + s.linhas.p + "); Fr = " + ft(s.Fr) + " (linha " + s.linhas.Fr + "); zg = " + s.zg + " m (linha " + s.linhas.zg + ")",
            resultado: "b = " + ft(s.b) + "; p = " + ft(s.p) + "; Fr = " + ft(s.Fr), unidade: "", referencia: ref("5.3.3 / Tabela 1", "linhas 781–788 e 803–865") });
      var t2 = s2Tabela2(cat, p.classe, s.zUsado);
      mem({ passo: "Fator S2 — classe " + p.classe, formula: "S2 = b·Fr·(z/10)^p, " + (p.varrido ? "z = " + br(p.z) + " m (altura do maior S1·S2, ver S1)" : "z = altura de referência (topo, " + br(G.hc) + " m)") + (s.zUsado !== s.z ? " — z abaixo de " + s.zmin + " m usa " + s.zmin + " m (" + (cat === "V" ? "5.3.3, categoria V constante até 10 m" : "Tabela 2, linha \"≤ 5\"") + ")" : ""),
            valores: ft(s.b) + " × " + ft(s.Fr) + " × (" + br(s.zUsado, 2) + "/10)^" + ft(s.p) +
                     (t2 ? " — conferência na Tabela 2: " + t2.map(function (x) { return "z = " + x.z + " m → " + ft(x.v) + " (linha " + x.linha + ")"; }).join("; ") : ""),
            resultado: arred(s.valor, 4), unidade: "", referencia: ref("5.3.3", "linha 781; Tabela 2, linhas 898–1278") });
    });
    tabela("Tabela 3", "linhas 872–897");
    mem({ passo: "Fator estatístico S3", formula: "grupo " + S3.grupo + ": " + S3.desc, valores: "Tabela 3, linha " + S3.linha, resultado: S3.valor, unidade: "", referencia: S3.referencia });
    [0, 90].forEach(function (d) {
      var p = porDir[d];
      if (d === 90 && p.classe === porDir[0].classe) return;
      mem({ passo: "Velocidade característica — classe " + p.classe + (porDir[0].classe !== porDir[90].classe ? " (vento " + (d === 0 ? "0°/180°" : "90°/270°") + ")" : ""), formula: "Vk = V0·S1·S2·S3",
            valores: bt(v0, 2) + " × " + br(p.s1, 4) + " × " + br(p.s2, 4) + " × " + ft(S3.valor), resultado: arred(p.vk, 3), unidade: "m/s", referencia: ref("4.2-b", "linha 458") });
      mem({ passo: "Pressão dinâmica — classe " + p.classe, formula: "q = 0,613·Vk² (q em N/m², Vk em m/s)",
            valores: "0,613 × " + br(p.vk, 3) + "² = " + br(p.q * 1000, 1) + " N/m²", resultado: arred(p.q, 4), unidade: "kN/m²", referencia: ref("4.2-c", "linhas 459–470") });
    });
    mem({ passo: "Pressão dinâmica para vedações e estrutura secundária", formula: "S2 da classe A (6.1.3); telhas e painéis com S3 do grupo 4 (Tabela 3)",
          valores: "q (estrutura secundária, S3 = " + bt(S3.valor, 2) + ") = " + br(qLocal, 4) + " kN/m²; q (vedações, S3 = " + bt(S3v, 2) + ") = " + br(qVed, 4) + " kN/m²",
          resultado: arred(qLocal, 4), unidade: "kN/m²", referencia: ref("6.1.3 e Tabela 3", "linhas 1393–1400 e 893") });

    /* ---------- direções que viram caso */
    var F = lerFaces(G, entrada.faces);
    var sim = simetrias(G, F), dirs;
    if (opcoes.todasDirecoes) dirs = DIRS.slice();
    else { dirs = [0, 90]; if (!sim.z) dirs.push(180); if (!sim.x) dirs.push(270); dirs.sort(function (p, q) { return p - q; }); }
    R.simetria = { z: sim.z, x: sim.x, direcoes: dirs.slice(),
                   nota: (sim.z ? "0° e 180° são espelho (z ↔ a − z)" : "0° e 180° diferem") + "; " + (sim.x ? "90° e 270° são espelho (x ↔ b − x)" : "90° e 270° diferem") };

    R.excentricidade = { ea: 0.075 * G.a, eb: 0.075 * G.b, eaVizinhanca: 0.15 * G.a, ebVizinhanca: 0.15 * G.b, aplicada: false,
                         nota: "torção por vento oblíquo ou vizinhança (6.6.2): forças de arrasto com excentricidade ea (direção do comprimento) e eb (direção do vão) — o motor não monta esse caso",
                         referencia: ref("6.6.2", "linhas 1934–1950") };
    aviso("efeitos dinâmicos (cap. 9) não verificados: para período fundamental T1 ≤ 1 s a resposta flutuante já está no S2 (9.1) — caso dos galpões usuais");

    if (G.aberta) { coberturaIsolada(R, G, porDir, dirs, qLocal, qVed, aviso, erro, mem, tabela); return finalizar(R); }

    /* ---------- edificação fechada: paredes */
    var T4 = cpeParedesTab4(G);
    if (T4.erro) { erro(T4.erro); return finalizar(R); }
    T4.avisos.forEach(aviso);
    tabela("Tabela 4", "linhas 1586–1742 (valores 1616–1720); figura no PDF p. 14");
    var ZP = {}; DIRS.forEach(function (d) { ZP[d] = zonasParedes(G, T4, d); });
    var L4 = T4.usadas;
    mem({ passo: "Coeficientes externos das paredes", formula: "h/b e a/b da edificação → linha da Tabela 4" + (G.cob === "uma-agua" ? " (uma água: h = parede mais alta, a favor da segurança)" : ""),
          valores: "h/b = " + br(T4.hT) + "/" + br(T4.bT) + " = " + br(T4.hb, 3) + "; a/b = " + br(T4.aT) + "/" + br(T4.bT) + " = " + br(T4.ab, 3) + " → " + L4.map(function (L) { return "\"" + L.rot + "\" (linhas " + linhaTxt(L.l[0]).replace("linha ", "") + "–" + linhaTxt(L.l[8]).replace("linha ", "") + ")"; }).join(" e ") + (T4.interpolado ? " — interpolação linear em a/b (nota a)" : ""),
          resultado: "α 0°: A1/B1 = " + fc(T4.c.A1B1) + "; A2/B2 = " + fc(T4.c.A2B2) + "; A3/B3 = " + fc(T4.c.A3B3) + "; C = " + fc(T4.c.C) + "; D = " + fc(T4.c.D) +
                     " | α 90°: A = " + fc(T4.c.A) + "; B = " + fc(T4.c.B) + "; C1/D1 = " + fc(T4.c.C1D1) + "; C2/D2 = " + fc(T4.c.C2D2) + " | cpe médio = " + fc(T4.c.cpeMedio),
          unidade: "", referencia: ref("6.1 / Tabela 4", "PDF p. 14"), interpolado: T4.interpolado });
    mem({ passo: "A3 e B3 com vento a 0°", formula: "nota b da Tabela 4: a/b = 1 → igual a A2/B2; a/b ≥ 2 → −0,2; entre 1 e 2, interpolar",
          valores: "a/b = " + br(T4.ab, 3) + (T4.a3Interpolado ? " → interpolado entre " + fc(L4[0].v[1]) + " (a/b = 1) e −0,2 (a/b = 2)" : ""),
          resultado: arred(T4.c.A3B3, 4), unidade: "", referencia: ref("Tabela 4, nota b", "linhas 1587–1591"), interpolado: T4.a3Interpolado });
    mem({ passo: "Zonas das paredes", formula: "A1/B1: b/3 ou a/4 (o maior), porém ≤ 2h; A2/B2: até a/2; C1/D1: 2h ou b/2 (o menor); cpe médio: 0,2·b ou h (o menor), na borda de barlavento das paredes paralelas ao vento",
          valores: "A1 = min(max(" + br(T4.bT) + "/3; " + br(T4.aT) + "/4); 2 × " + br(T4.hT) + ") = " + br(T4.x1) + " m; C1 = min(2 × " + br(T4.hT) + "; " + br(T4.bT) + "/2) = " + br(T4.x2) + " m; faixa do cpe médio = min(0,2 × " + br(T4.bT) + "; " + br(T4.hT) + ") = " + br(T4.e) + " m",
          resultado: "A1 = " + br(T4.x1) + " m; C1 = " + br(T4.x2) + " m; faixa = " + br(T4.e) + " m", unidade: "", referencia: ref("Tabela 4 (figura e nota c)", "PDF p. 14; linhas 1738–1742") });

    /* ---------- telhado */
    var TR = G.cob === "duas-aguas" ? cpeTelhado5(G) : cpeTelhado6(G);
    if (TR.erro) { erro(TR.erro); return finalizar(R); }
    TR.avisos.forEach(aviso);
    var ZR = {}; DIRS.forEach(function (d) { ZR[d] = G.cob === "duas-aguas" ? zonasTelhado5(G, TR, d) : zonasTelhado6(G, TR, d); });
    var LR = G.cob === "duas-aguas" ? locaisTelhado5(G, TR) : locaisTelhado6(G, TR);
    memoriaTelhado(R, G, TR, mem, tabela, aviso);

    /* ---------- Cpi */
    var CPL = analisarCpi(G, F, ZP, entrada, aviso);
    R.cpi = CPL.filter(function (c) { return dirs.indexOf(c.direcao) >= 0; }).map(function (c) {
      return { direcao: c.direcao, valor: arred(c.valor, 4), cenario: c.cenario, cenarioNome: c.cenarioNome, item: c.item, motivo: c.motivo, interpolado: !!c.interpolado, referencia: c.referencia };
    });
    tabela("6.2.5 (Cpi)", "linhas 1476–1540");
    dirs.forEach(function (d) {
      var l = R.cpi.filter(function (c) { return c.direcao === d; });
      mem({ passo: "Pressão interna — vento " + d + "°", formula: "6.2.5 (permeabilidade das faces e abertura dominante)",
            valores: l.map(function (c) { return "[" + c.cenarioNome + "] " + c.motivo; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(" | "),
            resultado: l.map(function (c) { return fc(c.valor); }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(" ou "), unidade: "",
            referencia: l.map(function (c) { return c.referencia; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join("; "),
            interpolado: l.some(function (c) { return c.interpolado; }) });
    });

    /* ---------- cpe (resumo por direção) e zonas */
    R.cpe = { paredes: {}, cobertura: {}, locais: {}, fonte: "" };
    DIRS.forEach(function (d) {
      var mp = {}; FACES.forEach(function (k) { ZP[d].zonas[k].forEach(function (z) { mp[z.zona] = z.cpe; }); }); R.cpe.paredes[d] = mp;
      var mc = {}; ZR[d].forEach(function (z) { mc[z.zona] = z.cpe; }); R.cpe.cobertura[d] = mc;
    });
    if (G.cob === "uma-agua") R.cpe.coberturaObliquo = { "45": { H: TR.c.H45, L: TR.c.L45 }, "-45": { H: TR.c.Hm45, L: TR.c.Lm45 },
      nota: "Tabela 6, vento oblíquo (quadrantes de barlavento) — valores informativos, o motor não monta esses casos" };
    R.cpe.locais = { paredes: T4.c.cpeMedio, cobertura: {} };
    Object.keys(TR.loc).forEach(function (k) { if (TR.loc[k]) R.cpe.locais.cobertura[k] = TR.loc[k].v; });
    R.cpe.fonte = "Tabela 4 (.txt linhas 1616–1720; PDF p. 14) e " + (G.cob === "duas-aguas" ? "Tabela 5 (PDF p. 15; notas nas linhas 1752–1763)" : "Tabela 6 (PDF p. 16; notas nas linhas 1774–1779)") + " — " + ED;

    var cpis = R.cpi.map(function (c) { return c.valor; });
    var cpiMax = Math.max.apply(null, cpis);
    var locP = {};
    FACES.forEach(function (k) {
      /* a faixa de alta sucção fica nas paredes paralelas ao vento: laterais com
       * vento 0°/180°, oitões com 90°/270° — nas duas pontas de cada face */
      var L = compFace(G, k), faixas = [];
      faixas.push({ zona: "cpe médio", s0: 0, s1: arred(Math.min(T4.e, L), 6) });
      faixas.push({ zona: "cpe médio", s0: arred(Math.max(0, L - T4.e), 6), s1: L });
      locP[k] = faixas.map(function (f) { var c = T4.c.cpeMedio - cpiMax; return { zona: f.zona, s0: f.s0, s1: f.s1, cpe: T4.c.cpeMedio, cpi: cpiMax, coef: arred(c, 4), p: arred(qLocal * c, 4), pVedacao: arred(qVed * c, 4) }; });
    });
    R.zonas = {
      paredes: {}, cobertura: {},
      locais: { paredes: locP, cobertura: LR.map(function (z) { var c = z.cpe - cpiMax; return { zona: z.zona, x0: z.x0, x1: z.x1, z0: z.z0, z1: z.z1, cpe: z.cpe, cpi: cpiMax, coef: arred(c, 4), p: arred(qLocal * c, 4), pVedacao: arred(qVed * c, 4) }; }),
                regra: "cpe médio só para vedações, suas fixações e estrutura secundária (6.1.2), com q da classe A (6.1.3); onde duas zonas locais se sobrepõem vale a mais negativa; p com o cpi mais desfavorável (" + bts(cpiMax, 2) + ")" },
      medidas: { A1: T4.x1, C1: T4.x2, faixaParedes: T4.e, y: TR.y, y1: TR.y1 }
    };
    DIRS.forEach(function (d) { R.zonas.paredes[d] = ZP[d].zonas; R.zonas.cobertura[d] = ZR[d]; });

    /* ---------- atrito (6.4) */
    var atr = {};
    DIRS.forEach(function (d) { atr[d] = atrito64(G, d, porDir[d].q); });
    [0, 90].forEach(function (d) {
      var a = atr[d]; if (!a) return;
      mem({ passo: "Força de atrito — vento " + (d === 0 ? "0°/180°" : "90°/270°"), formula: a.formula + " (só quando l2/h ou l2/l1 > 4)",
            valores: "l1 = " + br(a.l1) + " m; l2 = " + br(a.l2) + " m; h = " + br(a.h) + " m; Cf = " + bt(a.cf, 2) + " (" + CF[a.nervuras].desc + (G.nervurasInformadas ? "" : " — adotado por falta de informação, a favor da segurança") + ", linha " + CF[a.nervuras].l + "); q = " + br(porDir[d].q, 4) + " kN/m²",
            resultado: "telhado " + br(a.telhado, 2) + " kN + paredes " + br(a.paredes, 2) + " kN = " + br(a.total, 2) + " kN (a partir de " + br(a.l2 - (a.fim - a.inicio)) + " m da borda de barlavento)", unidade: "", referencia: a.referencia });
    });

    /* ---------- casos */
    var casos = [];
    dirs.forEach(function (d) {
      var pd = porDir[d], vals = [];
      CPL.filter(function (c) { return c.direcao === d; }).forEach(function (c) {
        var ex = vals.filter(function (v) { return Math.abs(v.valor - c.valor) < 1e-9; })[0];
        var mot = "[" + c.cenarioNome + "] " + c.motivo;
        if (ex) { if (ex.motivos.indexOf(mot) < 0) ex.motivos.push(mot); } else vals.push({ valor: c.valor, motivos: [mot] });
      });
      vals.sort(function (p, q) { return p.valor - q.valor; });
      vals.forEach(function (v) {
        var caso = { id: "V" + d + "_cpi" + idNum(v.valor), nome: "Vento " + d + "° — Cpi = " + bts(v.valor, 2), direcao: d, cpi: arred(v.valor, 4), cpiMotivo: v.motivos,
                     q: arred(pd.q, 6), classe: pd.classe, coef: { paredes: {}, cobertura: {} }, pressao: { paredes: {}, cobertura: [] } };
        FACES.forEach(function (k) {
          caso.pressao.paredes[k] = ZP[d].zonas[k].map(function (z) { var c = z.cpe - v.valor; caso.coef.paredes[z.zona] = arred(c, 4); return { zona: z.zona, s0: z.s0, s1: z.s1, cpe: z.cpe, coef: arred(c, 4), p: arred(pd.q * c, 4) }; });
        });
        ZR[d].forEach(function (z) {
          var c = z.cpe - v.valor; caso.coef.cobertura[z.zona] = arred(c, 4);
          caso.pressao.cobertura.push({ zona: z.zona, agua: z.agua, x0: z.x0, x1: z.x1, z0: z.z0, z1: z.z1, cpe: z.cpe, coef: arred(c, 4), p: arred(pd.q * c, 4) });
        });
        if (atr[d]) caso.atrito = atr[d];
        casos.push(caso);
      });
    });
    R.casos = casos;
    if (opcoes.obliquos) { var ob = casosObliquos(R, opcoes); R.casos = casos.concat(ob.casos); ob.avisos.forEach(aviso); casos = R.casos; }
    mem({ passo: "Casos de vento", formula: "p = q·(Cpe − Cpi) por zona (positivo empurra a face para dentro / a cobertura para baixo)",
          valores: casos.map(function (c) { return c.id; }).join(", ") + (dirs.length < 4 ? " — " + R.simetria.nota : ""),
          resultado: casos.length, unidade: "casos", referencia: ref("4.2.1", "linhas 471–493") });
    return finalizar(R);
  }

  function memoriaTelhado(R, G, TR, mem, tabela, aviso) {
    if (TR.tabela === 5) {
      var bl = TR.bloco, inf = TR.info, txtI = [];
      ["EF", "GH", "EG", "FH"].forEach(function (k) { var r = inf[k]; if (r.interpolado) txtI.push(k + ": " + fc(r.v0) + " (θ = " + r.th0 + "°) e " + fc(r.v1) + " (θ = " + r.th1 + "°)"); });
      tabela("Tabela 5", "PDF p. 15 (imagem); título linha 1764; notas 1752–1763");
      mem({ passo: "Coeficientes externos do telhado (duas águas)", formula: "h/b e θ → bloco e linha da Tabela 5" + (txtI.length ? "; θ entre linhas: interpolação linear (a tabela não traz regra para θ; adotada a interpolação)" : ""),
            valores: "h/b = " + br(G.h) + "/" + br(G.b) + " = " + br(TR.hb, 3) + " → bloco \"" + bl.rot + "\"; θ = " + bt(G.th, 2) + "°" + (txtI.length ? " — " + txtI.join("; ") : ""),
            resultado: "α 90°: EF = " + fc(TR.c.EF, 3) + "; GH = " + fc(TR.c.GH, 3) + " | α 0°: EG = " + fc(TR.c.EG, 3) + "; FH = " + fc(TR.c.FH, 3) + "; IJ = " + fc(TR.c.IJ, 3),
            unidade: "", referencia: ref("6.1 / Tabela 5", "PDF p. 15"), interpolado: txtI.length > 0 });
      mem({ passo: "I e J com vento a 0°", formula: "nota d da Tabela 5: a/b = 1 → igual a F e H; a/b ≥ 2 → −0,2; interpolar",
            valores: "a/b = " + br(TR.ab, 3), resultado: arred(TR.c.IJ, 4), unidade: "", referencia: ref("Tabela 5, nota d", "linhas 1760–1763"), interpolado: TR.ijInterpolado });
      var lt = [];
      [["oitao", "faixa do oitão"], ["beiral1", "beiral junto ao oitão"], ["beiral2", "beiral, trecho central"], ["cumeeira", "cumeeira"]].forEach(function (p) {
        var v = TR.loc[p[0]];
        lt.push(p[1] + ": " + (v ? fc(v.v, 3) + (v.interpolado ? " (interpolado)" : "") + (v.mantido ? " (θ entre " + v.thCheio + "° e " + v.thVazio + "°, célula vizinha em branco — mantido o valor de " + v.thCheio + "°, a favor da segurança)" : "") : "sem cpe médio (célula em branco)"));
        if (v && v.mantido) aviso("Tabela 5, cpe médio \"" + p[1] + "\": θ entre uma célula cheia e uma em branco — mantido o valor de " + v.thCheio + "° (a favor da segurança)");
      });
      mem({ passo: "cpe médio do telhado (zonas de borda)", formula: "y = h ou 0,15·b (o menor); faixa EG = b/3 ou a/4 (o maior), porém ≤ 2h",
            valores: "y = min(" + br(G.h) + "; 0,15 × " + br(G.b) + ") = " + br(TR.y) + " m; b/3 ou a/4 = " + br(TR.y1) + " m — " + lt.join("; "),
            resultado: lt.join("; "), unidade: "", referencia: ref("Tabela 5 (figura) e 6.1.2", "PDF p. 15; linhas 1383–1392") });
      aviso("beiral: a face inferior do beiral tem o mesmo Ce da parede correspondente (Tabela 5, nota a); a Tabela 5 vale para beiral até 0,1·b (Detalhe 1)");
    } else {
      tabela("Tabela 6", "PDF p. 16 (imagem); título linhas 1772–1773; notas 1774–1779");
      var alto90 = chegaPeloAlto(G, 90);
      mem({ passo: "Coeficientes externos do telhado (uma água)", formula: "θ → linha da Tabela 6 (h/b < 2); H = metade do beiral alto, L = metade do beiral baixo",
            valores: "h/b = " + br(G.h) + "/" + br(G.b) + " = " + br(TR.hb, 3) + "; θ = " + bt(G.th, 2) + "°" + (TR.thUsado !== G.th ? " (usado " + TR.thUsado + "°)" : "") + "; beiral alto na " + G.ladoAlto,
            resultado: "vento chegando pelo lado alto (α 90°): H = " + fc(TR.c.H90, 3) + ", L = " + fc(TR.c.L90, 3) + " | pelo lado baixo (α −90°): H = " + fc(TR.c.Hm90, 3) + ", L = " + fc(TR.c.Lm90, 3) +
                       " | α 0°: (A) = " + fc(TR.c.A0, 3) + ", (B) = " + fc(TR.c.B0, 3) + ", I/J = " + fc(TR.c.IJ, 3) + " — o vento 90° chega pelo lado " + (alto90 ? "alto" : "baixo"),
            unidade: "", referencia: ref("6.1 / Tabela 6", "PDF p. 16"), interpolado: Object.keys(TR.info).some(function (k) { return TR.info[k].interpolado; }) });
      mem({ passo: "I e J com vento a 0° (uma água)", formula: "nota da Tabela 6: a/b = 1 → \"mesmo valor das partes H e L\" (adotado o valor (B), a faixa vizinha); a/b = 2 → −0,2; interpolar",
            valores: "a/b = " + br(TR.ab, 3), resultado: arred(TR.c.IJ, 4), unidade: "", referencia: ref("Tabela 6, nota", "linhas 1777–1779"), interpolado: TR.ijInterpolado });
      var l6 = Object.keys(TR.loc).map(function (k) { var v = TR.loc[k]; return k + " = " + (v ? fc(v.v, 3) : "—"); });
      mem({ passo: "cpe médio do telhado de uma água", formula: "y = h ou 0,15·b (o menor); H1/L1 até a distância b do oitão; H2/L2 de b até a/2",
            valores: "y = " + br(TR.y) + " m", resultado: l6.join("; "), unidade: "", referencia: ref("Tabela 6 (figura)", "PDF p. 16") });
      aviso("Tabela 6: o vento oblíquo (45° e −45°) tem valores próprios para os quadrantes de barlavento, às vezes mais severos que 90°/−90° — o motor não monta esses casos (valores em cpe.coberturaObliquo)");
    }
  }

  /* ====================================================== COBERTURA ISOLADA (8.2) */
  function coberturaIsolada(R, G, porDir, dirs, qLocal, qVed, aviso, erro, mem, tabela) {
    var l2 = G.b, tg = G.tg, a = G.a, b = G.b, m = b / 2;
    var cond = G.cob === "uma-agua" ? (tg >= 0 && tg <= 0.7 && G.h >= 0.5 * l2) : (tg >= 0.07 && tg <= 0.6 && G.h >= 0.5 * l2);
    var condTxt = G.cob === "uma-agua" ? "0 ≤ tg θ ≤ 0,7 e h ≥ 0,5·l2" : "0,07 ≤ tg θ ≤ 0,6 e h ≥ 0,5·l2";
    mem({ passo: "Cobertura isolada — campo das Tabelas 17/18", formula: condTxt + " (h = altura livre até a aresta horizontal mais baixa; l2 = profundidade da cobertura)",
          valores: "tg θ = " + br(tg, 4) + "; h = " + br(G.h) + " m; 0,5·l2 = 0,5 × " + br(l2) + " = " + br(0.5 * l2) + " m",
          resultado: cond ? "atende 8.2.3" : "não atende 8.2.3 → 8.2.4", unidade: "", referencia: ref("8.2.3", "linhas 2519–2529") });
    R.cpi = []; R.cpe = { paredes: {}, cobertura: {}, locais: { vedacao: [2.0, -2.0] }, fonte: "" };
    R.zonas = { paredes: {}, cobertura: {}, locais: { paredes: {}, cobertura: [], regra: "cada elemento de vedação com cp = ±2,0 (8.2.10)" }, medidas: {} };
    var casos = [];
    function q(d) { return porDir[d].q; }
    if (cond) {
      tabela(G.cob === "uma-agua" ? "Tabela 17" : "Tabela 18", "PDF p. 34 (imagem); 8.2, linhas 2501–2572");
      dirs.forEach(function (d) {
        if (d === 0 || d === 180) {
          var Fat = 0.05 * q(d) * a * b;
          casos.push({ id: "V" + d + "_atrito", nome: "Vento " + d + "° — atrito na cobertura (8.2.5)", direcao: d, cpi: null, q: arred(q(d), 6), coef: { paredes: {}, cobertura: {} },
                       pressao: { paredes: {}, cobertura: [] },
                       atrito: { coef: 0.05, porArea: arred(0.05 * q(d), 6), total: arred(Fat, 4), eixo: "z", sentido: d === 0 ? "+z" : "−z", formula: "Fat = 0,05·q·a·b", referencia: ref("8.2.5", "linhas 2537–2543") } });
          return;
        }
        var xw = d === 90 ? 0 : b;   /* bordo de barlavento */
        if (G.cob === "uma-agua") {
          var alto = chegaPeloAlto(G, d);
          [[1, T17.c1(tg)], [2, T17.c2(tg)]].forEach(function (cc) {
            var c = cc[1]; if (!c) return;
            var sentido = (cc[0] === 1) === alto ? -1 : 1;   /* 1º com vento pelo alto: para cima */
            var cw = sentido * c.barl, cl = sentido * c.sota;
            var c0 = xw === 0 ? cw : cl, c1 = xw === 0 ? cl : cw;
            casos.push({ id: "V" + d + "_c" + cc[0], nome: "Vento " + d + "° — " + cc[0] + "º carregamento (Tabela 17)", direcao: d, cpi: null, q: arred(q(d), 6),
                         coef: { paredes: {}, cobertura: { cobertura: arred((c0 + c1) / 2, 4) } },
                         pressao: { paredes: {}, cobertura: [{ zona: "cobertura", agua: "água única", x0: 0, x1: b, z0: 0, z1: a, variacao: "linear em x", coef0: arred(c0, 4), coef1: arred(c1, 4), p0: arred(q(d) * c0, 4), p1: arred(q(d) * c1, 4), coef: arred((c0 + c1) / 2, 4), p: arred(q(d) * (c0 + c1) / 2, 4) }] },
                         nota: "coeficiente líquido (as duas faces), " + (sentido < 0 ? "para cima" : "para baixo") + "; " + fc(c.barl).replace("+", "") + " no bordo de barlavento e " + fc(c.sota).replace("+", "") + " no de sotavento, variação linear; vento chegando pelo lado " + (alto ? "alto" : "baixo") });
          });
        } else {
          [[1, T18.c1(tg)], [2, T18.c2(tg)]].forEach(function (cc) {
            var c = cc[1];
            var esqBarl = d === 90;
            var itens = [{ zona: "cpb", agua: esqBarl ? "esquerda" : "direita", x0: esqBarl ? 0 : m, x1: esqBarl ? m : b, v: c.cpb },
                         { zona: "cps", agua: esqBarl ? "direita" : "esquerda", x0: esqBarl ? m : 0, x1: esqBarl ? b : m, v: c.cps }];
            casos.push({ id: "V" + d + "_c" + cc[0], nome: "Vento " + d + "° — " + cc[0] + "º carregamento (Tabela 18)", direcao: d, cpi: null, q: arred(q(d), 6),
                         coef: { paredes: {}, cobertura: { cpb: arred(c.cpb, 4), cps: arred(c.cps, 4) } },
                         pressao: { paredes: {}, cobertura: itens.map(function (it) { return { zona: it.zona, agua: it.agua, x0: it.x0, x1: it.x1, z0: 0, z1: a, coef: arred(it.v, 4), p: arred(q(d) * it.v, 4) }; }) },
                         nota: "coeficientes líquidos (as duas faces); positivo = para baixo" });
          });
        }
      });
      if (G.cob === "uma-agua") {
        mem({ passo: "Coeficientes da cobertura isolada de uma água", formula: "Tabela 17: 1º carregamento 2,0 (barlavento) → tg θ (sotavento); 2º " + (tg <= 0.2 ? "2,0 → tg θ" : (tg <= 0.3 ? "(6 − 20·tg θ) → (0,6 − 2·tg θ)" : "não existe para tg θ > 0,3")),
              valores: "tg θ = " + br(tg, 4), resultado: "1º: 2,0 e " + br(tg, 3) + (T17.c2(tg) ? "; 2º: " + br(T17.c2(tg).barl, 3) + " e " + br(T17.c2(tg).sota, 3) : ""), unidade: "", referencia: ref("8.2 / Tabela 17", "PDF p. 34") });
      } else {
        var c1 = T18.c1(tg), c2 = T18.c2(tg);
        mem({ passo: "Coeficientes da cobertura isolada de duas águas", formula: tg <= 0.4 ? "1º: cpb = 2,4 tg θ + 0,6; cps = 3,0 tg θ − 0,5 | 2º: cpb = 0,6 tg θ − 0,74; cps = −1,0" : "1º: cpb = 2,4 tg θ + 0,6 ≤ 2,0; cps = +0,7 | 2º: cpb = 6,5 tg θ − 3,1; cps = 5,0 tg θ − 3,0",
              valores: "tg θ = " + br(tg, 4), resultado: "1º: cpb = " + fc(c1.cpb, 3) + ", cps = " + fc(c1.cps, 3) + " | 2º: cpb = " + fc(c2.cpb, 3) + ", cps = " + fc(c2.cps, 3), unidade: "", referencia: ref("8.2 / Tabela 18", "PDF p. 34") });
      }
    }
    if (!cond || G.obstrucoes) {
      aviso(!cond ? "cobertura isolada fora de 8.2.3 (" + condTxt + "): calculada como edificação fechada de mesma cobertura com cpi = +0,8 e −0,3 (8.2.4), na cobertura toda"
                  : "obstruções sob a cobertura: acrescentados os casos de 8.2.4 (edificação fechada de mesma cobertura, cpi = +0,8 e −0,3)");
      var TR = G.cob === "duas-aguas" ? cpeTelhado5(G) : cpeTelhado6(G);
      if (TR.erro) { erro(TR.erro); }
      else {
        TR.avisos.forEach(aviso);
        memoriaTelhado(R, G, TR, mem, tabela, aviso);
        dirs.forEach(function (d) {
          var Z = G.cob === "duas-aguas" ? zonasTelhado5(G, TR, d) : zonasTelhado6(G, TR, d);
          R.zonas.cobertura[d] = Z;
          var mc = {}; Z.forEach(function (z) { mc[z.zona] = z.cpe; }); R.cpe.cobertura[d] = mc;
          [[0.8, "obstrução na borda de sotavento"], [-0.3, "obstrução na borda de barlavento"]].forEach(function (ci) {
            R.cpi.push({ direcao: d, valor: ci[0], cenario: "8.2.4", cenarioNome: "cobertura isolada com obstrução", item: "8.2.4", motivo: ci[1] + ": cpi = " + fc(ci[0], 1), referencia: ref("8.2.4", "linhas 2530–2536") });
            var caso = { id: "V" + d + "_cpi" + idNum(ci[0]), nome: "Vento " + d + "° — 8.2.4, cpi = " + fc(ci[0], 1), direcao: d, cpi: ci[0], cpiMotivo: [ci[1]], q: arred(q(d), 6), coef: { paredes: {}, cobertura: {} }, pressao: { paredes: {}, cobertura: [] } };
            Z.forEach(function (z) { var c = z.cpe - ci[0]; caso.coef.cobertura[z.zona] = arred(c, 4); caso.pressao.cobertura.push({ zona: z.zona, agua: z.agua, x0: z.x0, x1: z.x1, z0: z.z0, z1: z.z1, cpe: z.cpe, coef: arred(c, 4), p: arred(q(d) * c, 4) }); });
            casos.push(caso);
          });
        });
        R.zonas.medidas = { y: TR.y, y1: TR.y1 };
      }
    }
    R.casos = casos;
    R.cpe.fonte = (cond ? (G.cob === "uma-agua" ? "Tabela 17" : "Tabela 18") + " (PDF p. 34)" : "") + (!cond || G.obstrucoes ? (cond ? " e " : "") + (G.cob === "duas-aguas" ? "Tabela 5 (PDF p. 15)" : "Tabela 6 (PDF p. 16)") + " com 8.2.4" : "") + " — " + ED;
    R.zonas.locais.vedacao = { cp: 2.0, p: arred(qVed * 2.0, 4), pEstruturaSecundaria: arred(qLocal * 2.0, 4), sinal: "±" };
    mem({ passo: "Vedações da cobertura isolada", formula: "cada elemento de vedação: cp = ±2,0", valores: "q (vedações) = " + br(qVed, 4) + " kN/m²",
          resultado: "± " + br(qVed * 2, 4), unidade: "kN/m²", referencia: ref("8.2.10", "linhas 2571–2572") });
    mem({ passo: "Casos de vento (cobertura isolada)", formula: cond ? "vento perpendicular à geratriz: Tabelas 17/18 (dois carregamentos independentes, 8.2.2); paralelo: atrito 8.2.5" : "8.2.4",
          valores: casos.map(function (c) { return c.id; }).join(", "), resultado: casos.length, unidade: "casos", referencia: ref("8.2", "linhas 2501–2572") });
  }

  function finalizar(R) {
    R.tabelasUsadas.forEach(function (t) { t.edicao = ED; });
    if (!R.casos) R.casos = [];
    return R;
  }

  /* ====================================================== E1 (madeira engenharada): oblíquos, beiral, abertura dominante */
  var COEF_BEIRAL_BAIXO = 0.8;   // pressão POR BAIXO do beiral a barlavento = Ce de barlavento da parede (Tabela 5 nota a; 0,7 a 0,8) — adotado 0,8, a favor da segurança (Casa Mar R02)
  var DELTA_CPI_DOMINANTE = 0.8; // 6.2.5: abertura dominante a barlavento, cpi até +0,8 (valor-limite usado como caso EXCEPCIONAL)

  /**
   * Casos de vento OBLÍQUOS (45/135/225/315) da cobertura — opção `obliquos:true` do calcular (padrão desligado: não muda quem já usa).
   * Cobertura: pressão UNIFORME q·(cpe mais severo de H e L) com cpi 0 — as duas metades do quadrante com o MESMO valor, a favor da
   * segurança (adoção da R02: Tabela 6 dá H −1,0 / L −0,9 e −0,9 / −1,0). Uma água: cpe de `cpe.coberturaObliquo` (45 → 45° e 135°;
   * −45 → 225° e 315°; troque com opcoes.mapaObliquo). Duas águas: a Tabela 5 NÃO traz oblíquo → sem caso e com aviso; só com
   * opcoes.envoltoriaDuasAguas:true usa o cpe mais severo das 4 direções ortogonais (ENVOLTÓRIA adotada, não é valor de tabela).
   * Paredes: 0,707 × (soma dos dois casos ortogonais vizinhos com cpi mais próximo de 0) — ESTIMATIVA (revisão C3/N5), não é da norma.
   * Cada caso traz `barlavento: [dir, dir]` (as duas faces a barlavento, para o beiral) e `obliquo: true`.
   */
  function casosObliquos(R, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], out = [], casos = R.casos || [];
    /* M3: o mapa depende do lado alto (espelho em x: d → 360° − d troca 45 ↔ −45) */
    var altoDir = R.geometria && R.geometria.ladoAlto === "direita";
    var mapa = opcoes.mapaObliquo || (altoDir ? { "45": "-45", "135": "-45", "225": "45", "315": "45" } : { "45": "45", "135": "45", "225": "-45", "315": "-45" });
    function cpiZero(d) {
      var c = casos.filter(function (k) { return k.direcao === d && !k.obliquo && k.cpi != null; });
      c.sort(function (a, b) { return Math.abs(a.cpi) - Math.abs(b.cpi); });
      return c[0] || null;
    }
    var tem = [0, 90, 180, 270].every(function (d) { return cpiZero(d); });
    if (!tem) { avisos.push("vento oblíquo: faltam os casos ortogonais das 4 direções (use todasDirecoes:true) — oblíquos não montados"); return { casos: out, avisos: avisos }; }
    var cpe;
    function cpeCob(chave) {
      if (R.cpe && R.cpe.coberturaObliquo && R.cpe.coberturaObliquo[chave]) { var o = R.cpe.coberturaObliquo[chave]; return Math.min(o.H, o.L); }
      return null;
    }
    var duas = !(R.cpe && R.cpe.coberturaObliquo);
    if (duas && !opcoes.envoltoriaDuasAguas) {
      avisos.push("vento oblíquo na cobertura de duas águas: a Tabela 5 não traz valores oblíquos — caso NÃO montado (opcoes.envoltoriaDuasAguas:true adota o cpe mais severo das 4 direções, envoltória fora de tabela)");
      return { casos: out, avisos: avisos };
    }
    var env = null;
    if (duas) {
      env = 0; [0, 90, 180, 270].forEach(function (d) { var m = R.cpe.cobertura[d] || {}; Object.keys(m).forEach(function (z) { if (typeof m[z] === "number" && m[z] < env) env = m[z]; }); });
      avisos.push("vento oblíquo na cobertura de duas águas: ENVOLTÓRIA do cpe mais severo das 4 direções ortogonais (" + env + ") — adoção, não valor da Tabela 5");
    }
    [[45, 0, 90], [135, 90, 180], [225, 180, 270], [315, 270, 0]].forEach(function (t) {
      var d = t[0], ca = cpiZero(t[1]), cb = cpiZero(t[2]);
      var cp = duas ? env : cpeCob(mapa[String(d)]);
      if (cp == null) { avisos.push("vento oblíquo " + d + "°: sem cpe na Tabela 6 — não montado"); return; }
      var q = Math.max(ca.q, cb.q), paredes = {};
      ["frente", "fundo", "esquerda", "direita"].forEach(function (f) {
        var za = ca.pressao.paredes[f] || [], zb = cb.pressao.paredes[f] || [];
        var pts = []; za.concat(zb).forEach(function (z) { pts.push(z.s0, z.s1); });
        pts.sort(function (x, y) { return x - y; }); pts = pts.filter(function (v, i) { return i === 0 || v - pts[i - 1] > 1e-9; });
        function pn(L, s) { for (var i = 0; i < L.length; i++) if (s >= L[i].s0 - 1e-6 && s <= L[i].s1 + 1e-6) return L[i].p; return 0; }
        var L = [];
        for (var i = 0; i + 1 < pts.length; i++) { var m = (pts[i] + pts[i + 1]) / 2; L.push({ zona: "obliquo", s0: pts[i], s1: pts[i + 1], p: 0.707 * (pn(za, m) + pn(zb, m)) }); }
        paredes[f] = L;
      });
      out.push({ id: "V" + d + "_obliquo", nome: "Vento " + d + "° oblíquo (cpi 0)", direcao: d, obliquo: true, cpi: 0, q: q, barlavento: [t[1], t[2]],
        coef: { cobertura: { obliquo: cp } }, cpeCobertura: cp,
        pressao: { paredes: paredes, cobertura: [{ zona: "obliquo", agua: 1, x0: 0, x1: 1e9, z0: 0, z1: 1e9, cpe: cp, coef: cp, p: q * cp }] },
        fonte: duas ? "envoltória adotada (Tabela 5 sem oblíquo)" : "Tabela 6, cpe.coberturaObliquo (cpe mais severo de H e L); paredes 0,707 × soma dos ortogonais" });
    });
    return { casos: out, avisos: avisos };
  }

  /** BEIRAL: pressão da cobertura no ponto (já negativa = sucção) mais a pressão POR BAIXO do beiral a barlavento (0,8·q, empurra para cima → soma sucção) */
  function pressaoBeiral(pCobertura, q, aBarlavento, coef) { return aBarlavento ? pCobertura - (coef == null ? COEF_BEIRAL_BAIXO : coef) * q : pCobertura; }

  /** ABERTURA DOMINANTE como caso EXCEPCIONAL (γ = 1): Δcpi = +0,8 → pressão interna 0,8·q (telhado para cima, paredes para fora) */
  function casoAberturaDominante(q, dcpi) {
    var d = dcpi == null ? DELTA_CPI_DOMINANTE : dcpi;
    return { id: "DCPI", tipo: "E", nome: "abertura dominante (Δcpi +" + String(d).replace(".", ",") + ")", dcpi: d, q: q, p: d * q,
      nota: "combinação excepcional: G 1,0 + vento (cpi 0) 1,0 + este caso 1,0 (NBR 8681); NBR 6123 6.2.5" };
  }

  /**
   * M4 — ABERTURA DOMINANTE EM FACE DE SUCÇÃO (6.2.5): a pressão interna passa a ser cpi = Ce da zona onde está a abertura (negativo). Sem saber onde ela está, o motor adota o Ce MAIS NEGATIVO
   * das zonas de parede (resultado `r` do calcular, todas as direções) — conservador. O incremento sobre o caso cpi = 0 é +|cpi|·q: sobrepressão PARA DENTRO nas fachadas de barlavento
   * (Ce 0,7 + |cpi|) e para baixo na cobertura. Caso EXCEPCIONAL (γ = 1) como o DCPI. Devolve null se não houver Ce de parede negativo.
   */
  function casoAberturaDominanteSuccao(r, q) {
    var m = 0;
    if (r && r.cpe && r.cpe.paredes) Object.keys(r.cpe.paredes).forEach(function (d) { var z = r.cpe.paredes[d]; Object.keys(z).forEach(function (k) { if (typeof z[k] === "number" && z[k] < m) m = z[k]; }); });
    if (!(m < 0)) return null;
    var dc = -m;
    return { id: "DCPIS", tipo: "E", nome: "abertura dominante em face de sucção (cpi " + String(m).replace(".", ",") + ")", dcpi: dc, cpi: m, q: q, p: dc * q,
      nota: "combinação excepcional: G 1,0 + vento (cpi 0) 1,0 + este caso 1,0; NBR 6123 6.2.5 — cpi = Ce da zona de sucção onde a abertura se encontra (adotado o mais negativo das paredes)" };
  }

  var AcoVento = {
    casoAberturaDominanteSuccao: casoAberturaDominanteSuccao,
    calcular: calcular, casosObliquos: casosObliquos, pressaoBeiral: pressaoBeiral, casoAberturaDominante: casoAberturaDominante,
    COEF_BEIRAL_BAIXO: COEF_BEIRAL_BAIXO, DELTA_CPI_DOMINANTE: DELTA_CPI_DOMINANTE,
    fatorS1: fatorS1, fatorS2: fatorS2, fatorS3: fatorS3, s2Tabela2: s2Tabela2, classePorDimensao: classePorDimensao,
    cpiAnexoD: cpiAnexoD, cpiBarlavento: cpiBarlavento, cpiSuccao: cpiSuccao,
    TABELAS: { TAB1: TAB1, TAB2: TAB2, TAB3: TAB3, TAB4: TAB4, TAB5: TAB5, TAB6: TAB6, T17: T17, T18: T18, CPI: CPI, CF: CF },
    _interno: { cpeParedesTab4: cpeParedesTab4, zonasParedes: zonasParedes, cpeTelhado5: cpeTelhado5, cpeTelhado6: cpeTelhado6,
                zonasTelhado5: zonasTelhado5, zonasTelhado6: zonasTelhado6, locaisTelhado5: locaisTelhado5, locaisTelhado6: locaisTelhado6,
                emTheta: emTheta, localEmTheta: localEmTheta, lerGeometria: lerGeometria },
    NORMA: NORMA, EDICAO: ED
  };
  global.AcoVento = AcoVento;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoVento;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

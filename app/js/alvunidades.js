/* =====================================================================
 * alvunidades.js — CATÁLOGO DAS UNIDADES DE ALVENARIA como são assentadas
 * no Brasil (motor puro, ES5, Node-testável). Metros.
 *
 * Pedido do Rogério (20/10/2026): "Toda modelagem tem de ser do jeito que é
 * executado na obra. Se é tijolo: o de 6 furos, de 8 furos, de 12 — os que
 * se usam no Brasil. Bloco de concreto: todas as famílias; o estrutural tem
 * os alvéolos; bloco de 50 (39 + junta), meio bloco, canaleta… para quando
 * estivermos mostrando uma parede crua, sem reboco."
 *
 * QUEM FAZ O QUÊ
 *   · js/blocos.js      — a família de CONCRETO para a modulação de fiada e o
 *                         PESO de referência das peças (compilação de seis
 *                         fabricantes, com a regra de escolha). Aqui ele é
 *                         REUSADO: a massa do bloco de concreto vem dele.
 *   · js/alvenaria.js   — regras de projeto (verga, contraverga, cinta).
 *   · ESTE ARQUIVO      — todas as unidades (cerâmico de vedação, cerâmico
 *                         estrutural, tijolo maciço, concreto), cada uma com
 *                         a medida REAL, os furos/alvéolos NA ORIENTAÇÃO DE
 *                         ASSENTAMENTO, o código SINAPI conferido na base MG
 *                         06/2026 local e a FONTE; e a GEOMETRIA da peça
 *                         (caixas: casca + septos) para o 3D da parede crua.
 *   · js/alvassentamento.js — a parede inteira: fiadas, amarração, vãos,
 *                         verga/contraverga, cortes, quantitativo e orçamento.
 *
 * CONVENÇÃO DE MEDIDA: largura × altura × comprimento (L × A × C) da peça
 * ASSENTADA — L é a espessura da parede, A a altura da fiada, C o comprimento
 * ao longo da parede. É a ordem da NBR 15270-1, da NBR 6136 e do SINAPI
 * ("(L X A X C)"). ⚠ Exceção que confunde: no tijolo maciço o SINAPI escreve
 * "5 X 10 X 20" e a composição diz "ESPESSURA 10CM" — o 5 é a ALTURA da fiada
 * e o 10 é a largura (o tijolo vai deitado). Aqui fica l = 0,10 e a = 0,05.
 *
 * A ORIENTAÇÃO DOS FUROS (o defeito da textura de 20/10/2026)
 *   · CERÂMICO DE VEDAÇÃO "furos na horizontal" (SINAPI 103328 e família):
 *     os furos correm PARALELOS AO COMPRIMENTO da parede (eixo x da peça). A
 *     seção furada (L × A) só aparece na PONTA da parede, no requadro do vão
 *     e na fiada de amarração do canto. A FACE da parede (z = ±L/2) é cheia.
 *     "Deitado" (SINAPI 103334, 14X9X19) gira a seção (L ↔ A): os furos
 *     continuam paralelos à parede.
 *   · CERÂMICO "furos na vertical" e ESTRUTURAL, CONCRETO (alvéolos): os
 *     furos correm na VERTICAL (eixo y) — é por eles que passa o graute.
 *   · TIJOLO MACIÇO: sem furo (o laminado de 21 furos tem os furos na
 *     vertical, escondidos na junta de assentamento).
 *   Prova: tools/test-alvunidades.js [furos] — com o controle negativo (a
 *   peça girada com o furo na face REPROVA).
 *
 * DE ONDE VEM CADA NÚMERO (nada inventado)
 *   · existência, nome, número de furos e medida: o INSUMO SINAPI da base
 *     local (descrição da Caixa), conferido por tools/test-alvunidades.js;
 *   · consumo por m²: o COEFICIENTE do insumo na composição SINAPI analítica
 *     MG (data/sinapi-MG-analitico.json) — já com a perda da Caixa;
 *   · concreto: NBR 6136-1:2026 (Tabela 2 famílias, Tabelas 1 e 6 classes, Tabela 4 paredes) via js/blocos.js;
 *   · cerâmico: NBR 15270-1:2023 (Tabelas 3 e 4 dimensões nominais, Tabela 2 paredes);
 *     (conferido em 21/10/2026 no texto das duas edições — cópia NÃO licenciada à RA: só valores,
 *     `exemplarLicenciado: false`; prova: tools/test-alv-normas-2026.js)
 *   · espessura de parede e septo: NBR 15270-1:2023 Tabela 2 / NBR 6136-1:2026 Tabela 4 como
 *     MÍNIMO; a geometria usa o valor de ficha quando há, senão o mínimo da
 *     norma marcado "conferir ficha do fornecedor";
 *   · massa: ficha de fabricante (URL no campo `fontes`); sem ficha, NULO e
 *     "sem fonte — conferir" — a massa CALCULADA pela geometria fica à parte
 *     (`massaCalculada`, com a fórmula), nunca no lugar da publicada.
 *
 * Teste: node tools/test-alvunidades.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function BL() { return dep("Blocos", "./blocos.js"); }

  var JUNTA = 0.010;   /* 1 cm — a que a modulação brasileira pressupõe (NBR 15270-1 / NBR 6136 / SINAPI) */

  /* ---------------------------------------------------------------- FONTES */
  var FONTES = {
    SINAPI: { doc: "SINAPI — Caixa: insumos e composições MG 06/2026, não desonerado (base local data/sinapi-MG-2026-06.json e data/sinapi-MG-analitico.json)",
              url: "https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx" },
    /* ⚠ EDIÇÕES: a NBR 15270-1:2017 foi substituída pela edição 12/2023 e a NBR 6136:2016 foi CANCELADA em 02/2026
       (NBR 6136-1 e 6136-2:2026). Em 21/10/2026 o texto das duas edições vigentes foi conferido contra os valores daqui
       (cópia NÃO licenciada à RA — só valores, nunca o PDF; `exemplarLicenciado: false`): tools/test-alv-normas-2026.js.
       O que a edição nova NÃO traz fica marcado em `conferir`. */
    NBR15270: { doc: "ABNT NBR 15270-1:2023 — Componentes cerâmicos — Blocos e tijolos para alvenaria — Parte 1: Requisitos (publicada em 14/12/2023, cancelou a 2017; valores conferidos no texto em 21/10/2026 — Tabela 2 paredes e resistência, Tabelas 3 e 4 dimensões nominais, itens 5.1 tolerâncias e 5.2 espessuras)",
                exemplarLicenciado: false,
                url: "https://www.normas.com.br/visualizar/abnt-nbr-nm/24627/abnt-nbr15270-1-componentes-ceramicos-blocos-e-tijolos-para-alvenaria-parte-1-requisitos",
                secundaria: { doc: "SUDECAP/PBH — Caderno de encargos cap. 7 (29/08/2024), Tabelas 2 e 4 (NBR 15270-1:2017, edição anterior — a primária 2023 já foi conferida)",
                              url: "https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/obras-e-infraestrutura/cap07-24-08-29_0.pdf" },
                nota: "a NBR 7170 (tijolo maciço) foi cancelada em 11/2017 e incorporada à 15270 (CBIC). 15270-1:2023, item 5.1: tolerância de largura, altura e comprimento VED/BFS ± 5,0 mm individual e ± 3,0 mm na média, EST ± 3,0 mm individual; itens 5.3 e 5.4: esquadro e planeza ≤ 3,0 mm" },
    NBR6136: { doc: "ABNT NBR 6136-1:2026 — Blocos vazados de concreto para alvenaria — Parte 1: Requisitos (1ª edição, 27/02/2026; cancela e substitui a NBR 6136:2016; a Parte 2 é de métodos de ensaio; valores conferidos no texto em 21/10/2026 — Tabela 1 classes, Tabela 2 dimensões nominais, Tabela 3 tolerâncias, Tabela 4 paredes, Tabela 6 resistência e pavimentos)",
               exemplarLicenciado: false,
               url: "https://normas.com.br/visualizar/abnt-nbr-nm/14326/abnt-nbr6136-1-blocos-vazados-de-concreto-para-alvenaria-parte-1-requisitos",
               secundaria: { doc: "SUDECAP/PBH cap. 7, Tabelas 3 e 6 (NBR 6136:2016, edição anterior — a primária 2026 já foi conferida)",
                             url: "https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/obras-e-infraestrutura/cap07-24-08-29_0.pdf" },
               nota: "classes (6136-1:2026, Tabela 1): A fbk ≥ 8,0 MPa; B 4,0 ≤ fbk ≤ 6,0 MPa (a Tabela 6 ainda subclassifica amostras B de 6 a 7,9 MPa — texto da norma, conferir); C fbk ≥ 3,0 MPa. Tolerâncias (Tabela 3): largura ± 2,0 mm, altura e comprimento ± 3,0 mm, espessura de parede − 1,0 mm" },
    NBR16868: { doc: "ABNT NBR 16868-1:2020 — Alvenaria estrutural — Parte 1: Projeto (substitui NBR 15961 e NBR 15812)", url: "https://www.abntcatalogo.com.br/" },
    NBR8545: { doc: "ABNT NBR 8545:1984 — Execução de alvenaria sem função estrutural de tijolos e blocos cerâmicos — verga/contraverga 20 cm de cada lado (via js/alvenaria.js)", url: "https://www.abntcatalogo.com.br/" },
    BLOCOS_JS: { doc: "js/blocos.js — família e peso de referência do bloco de concreto (compilação de 6 fabricantes: Tatu, Pavibloco, JB, Original, ArtBlocos, Portital; regra R1–R5 no cabeçalho)", url: null }
  };

  /* -------------------------------------------------------- GEOMETRIA PADRÃO
   * A casca e o septo que a peça modela quando a ficha não diz. É o MÍNIMO da
   * norma (o bloco real costuma ter mais) — marcado em cada peça. */
  var PAREDE = {
    ceramico_vedacao: { ext: 0.007, septo: 0.006, fonte: "NBR 15270-1:2023 Tabela 2 — parede externa ≥ 7 mm (VED15, vazados horizontais; VED40 e EST de vazados verticais: externa ≥ 7 e interna ≥ 6 mm). Septo de 6 mm: a norma vigente NÃO traz mínimo de septo para o VED15 (só a soma das paredes de um corte ≥ 20 mm, item 5.2) — 6 mm é o padrão de geometria, conferir a ficha do fornecedor" },
    ceramico_estrutural: { ext: 0.0121, septo: 0.0127, fonte: "FAD 003 (PBQP-H) Tabela 1 — 14×19×29 medido: paredes 12,1 mm, septos 12,7 mm (NBR 15270-1:2023 Tabela 2, EST de vazados verticais: externa ≥ 7 e interna ≥ 6 mm nas classes EST40 a EST80; ≥ 8 e ≥ 7 mm de EST100 a EST140 — leitura do texto extraído da tabela, conferir)" },
    concreto_AB: { ext: 0.025, septo: 0.025, fonte: "NBR 6136-1:2026 Tabela 4 — classes A e B, 140 × 390 e 140 × 290: parede longitudinal e transversal ≥ 25 mm (o mesmo mínimo que o js/blocos.js usa na regra R3b)" },
    concreto_M20: { ext: 0.032, septo: 0.025, fonte: "NBR 6136-1:2026 Tabela 4 — classes A e B, 190 × 390: parede longitudinal ≥ 32 mm, transversal ≥ 25 mm" },
    concreto_C: { ext: 0.018, septo: 0.018, fonte: "NBR 6136-1:2026 Tabela 4 — classe C (vedação) de 90 a 190 mm de largura: paredes ≥ 18 mm (a de 65 mm pede 15 mm)" }
  };

  /* -------------------------------------------------------------- UNIDADES
   * id · grupo · nome · l a c (m, REAIS) · furos {eixo: "x" (horizontal,
   * paralelo à parede) | "y" (vertical) | null, nz (na largura), ny (na
   * altura) | nx (ao longo do comprimento, nos verticais)} · parede (chave de
   * PAREDE ou {ext, septo}) · sinapi (insumo) · massa {kg, fonte} · papel.
   * ⚠ A contagem de furos de cada uma é a do NOME do insumo SINAPI; a grade
   * (nz × ny) é a única que dá esse número na seção da peça. */
  function U(o) { return o; }
  var UNIDADES = [
    /* ---- CERÂMICO DE VEDAÇÃO, furos na HORIZONTAL (paralelos à parede) ---- */
    U({ id: "cv-4f-9x9x19",   grupo: "ceramico_vedacao", nome: "Bloco cerâmico 4 furos 9×9×19",   l: 0.09, a: 0.09, c: 0.19, furos: { eixo: "x", nz: 2, ny: 2 }, parede: "ceramico_vedacao", sinapi: "7270" }),
    U({ id: "cv-6f-9x14x19",  grupo: "ceramico_vedacao", nome: "Bloco cerâmico 6 furos 9×14×19 (em pé)", l: 0.09, a: 0.14, c: 0.19, furos: { eixo: "x", nz: 2, ny: 3 }, parede: "ceramico_vedacao", sinapi: "7267" }),
    U({ id: "cv-6f-14x9x19",  grupo: "ceramico_vedacao", nome: "Bloco cerâmico 6 furos 9×14×19 deitado (parede de 14)", l: 0.14, a: 0.09, c: 0.19, furos: { eixo: "x", nz: 3, ny: 2 }, parede: "ceramico_vedacao", sinapi: "7267", deitado: "cv-6f-9x14x19" }),
    U({ id: "cv-6f-9x14x24",  grupo: "ceramico_vedacao", nome: "Bloco cerâmico 6 furos 9×14×24",  l: 0.09, a: 0.14, c: 0.24, furos: { eixo: "x", nz: 2, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44458" }),
    U({ id: "cv-6f-9x19x39",  grupo: "ceramico_vedacao", nome: "Bloco cerâmico 6 furos 9×19×39",  l: 0.09, a: 0.19, c: 0.39, furos: { eixo: "x", nz: 2, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44457" }),
    U({ id: "cv-6f-11x19x29", grupo: "ceramico_vedacao", nome: "Bloco cerâmico 6 furos 11,5×19×29", l: 0.115, a: 0.19, c: 0.29, furos: { eixo: "x", nz: 2, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44460", massa: { kg: 3.61, fonte: "Cerâmica Auxiliadora (AECweb)", metodo: "publicado" }, fontes: [{ doc: "Cerâmica Auxiliadora — blocos de vedação", item: "11,5×19×29 = 3,61 kg", url: "https://www.aecweb.com.br/produto/blocos-de-vedacao-ceramica-auxiliadora/34391" }] }),
    U({ id: "cv-6f-11x19x39", grupo: "ceramico_vedacao", nome: "Bloco cerâmico 6 furos 11,5×19×39", l: 0.115, a: 0.19, c: 0.39, furos: { eixo: "x", nz: 2, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44461" }),
    U({ id: "cv-8f-9x19x19",  grupo: "ceramico_vedacao", nome: "Bloco cerâmico 8 furos 9×19×19 (tijolo baiano)", l: 0.09, a: 0.19, c: 0.19, furos: { eixo: "x", nz: 2, ny: 4 }, sinapi: "7271", massa: { kg: 2.05, fonte: "FAD 47 (PBQP-H/IPT) Tabela 1 — massa seca 2.049 g", metodo: "publicado" }, parede: { ext: 0.006, septo: 0.006, fonte: "FAD 47 Tabela 1 — paredes 6 mm, septos 6 mm (amostra medida 88×187×189 mm; a parede externa de 6 mm fica ABAIXO do mínimo de 7 mm da NBR 15270-1:2023 Tabela 2 — conferir a ficha atual do fornecedor)" }, fontes: [{ doc: "FAD 47 — bloco cerâmico de vedação 9×19×19 (PBQP-H, ensaio IPT)", item: "Tabela 1 e Figura 1 (2 × 4 furos horizontais)", url: "https://pbqp-h.mdr.gov.br/wp-content/uploads/2021/09/FAD-47.pdf" }, { doc: "Cerâmica Auxiliadora — blocos de vedação", item: "9×19×19 = 1,85 kg", url: "https://www.aecweb.com.br/produto/blocos-de-vedacao-ceramica-auxiliadora/34391" }] }),
    U({ id: "cv-8f-9x19x29",  grupo: "ceramico_vedacao", nome: "Bloco cerâmico 8 furos 9×19×29",  l: 0.09, a: 0.19, c: 0.29, furos: { eixo: "x", nz: 2, ny: 4 }, parede: "ceramico_vedacao", sinapi: "7268", massa: { kg: 2.82, fonte: "Cerâmica Auxiliadora (AECweb)", metodo: "publicado" }, fontes: [{ doc: "Cerâmica Auxiliadora — blocos de vedação", item: "9×19×29 = 2,82 kg", url: "https://www.aecweb.com.br/produto/blocos-de-vedacao-ceramica-auxiliadora/34391" }] }),
    U({ id: "cv-8f-11x19x19", grupo: "ceramico_vedacao", nome: "Bloco cerâmico 11,5×19×19 (furos na horizontal)", l: 0.115, a: 0.19, c: 0.19, furos: { eixo: "x", nz: 2, ny: 4 }, parede: "ceramico_vedacao", sinapi: "38783",
        conferir: ["o insumo SINAPI 38783 não diz o número de furos: a grade 2×4 (8 furos) é a do 8 furos de 9 cm — conferir a ficha do fornecedor"] }),
    U({ id: "cv-9f-11x14x24", grupo: "ceramico_vedacao", nome: "Bloco cerâmico 9 furos 11,5×14×24", l: 0.115, a: 0.14, c: 0.24, furos: { eixo: "x", nz: 3, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44459", massa: { kg: 2.20, fonte: "Cerâmica Auxiliadora (AECweb)", metodo: "publicado" }, fontes: [{ doc: "Cerâmica Auxiliadora — blocos de vedação", item: "11,5×14×24 = 2,20 kg", url: "https://www.aecweb.com.br/produto/blocos-de-vedacao-ceramica-auxiliadora/34391" }] }),
    U({ id: "cv-9f-14x19x29", grupo: "ceramico_vedacao", nome: "Bloco cerâmico 9 furos 14×19×29", l: 0.14, a: 0.19, c: 0.29, furos: { eixo: "x", nz: 3, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44462", massa: { kg: 4.39, fonte: "Cerâmica Auxiliadora (AECweb)", metodo: "publicado" }, fontes: [{ doc: "Cerâmica Auxiliadora — blocos de vedação", item: "14×19×29 = 4,39 kg", url: "https://www.aecweb.com.br/produto/blocos-de-vedacao-ceramica-auxiliadora/34391" }] }),
    U({ id: "cv-9f-14x19x39", grupo: "ceramico_vedacao", nome: "Bloco cerâmico 9 furos 14×19×39", l: 0.14, a: 0.19, c: 0.39, furos: { eixo: "x", nz: 3, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44463" }),
    U({ id: "cv-9f-19x19x29", grupo: "ceramico_vedacao", nome: "Bloco cerâmico 9 furos 19×19×29", l: 0.19, a: 0.19, c: 0.29, furos: { eixo: "x", nz: 3, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44464" }),
    U({ id: "cv-9f-19x19x39", grupo: "ceramico_vedacao", nome: "Bloco cerâmico 9 furos 19×19×39", l: 0.19, a: 0.19, c: 0.39, furos: { eixo: "x", nz: 3, ny: 3 }, parede: "ceramico_vedacao", sinapi: "44465" }),

    /* ---- CERÂMICO DE VEDAÇÃO, furos na VERTICAL ---- */
    U({ id: "cvv-9x19x39",  grupo: "ceramico_vedacao_v", nome: "Bloco cerâmico de vedação 9×19×39 (furos na vertical)",   l: 0.09, a: 0.19, c: 0.39, furos: { eixo: "y", nz: 2, nx: 4 }, parede: "ceramico_vedacao", sinapi: "37592",
        conferir: ["SINAPI não diz o número de furos: grade 2×4 representativa — conferir a ficha"] }),
    U({ id: "cvv-14x19x29", grupo: "ceramico_vedacao_v", nome: "Bloco cerâmico de vedação 14×19×29 (furos na vertical)",  l: 0.14, a: 0.19, c: 0.29, furos: { eixo: "y", nz: 2, nx: 3 }, parede: "ceramico_vedacao", sinapi: "44468",
        conferir: ["SINAPI não diz o número de furos: grade 2×3 representativa — conferir a ficha"] }),
    U({ id: "cvv-14x19x39", grupo: "ceramico_vedacao_v", nome: "Bloco cerâmico de vedação 14×19×39 (furos na vertical)",  l: 0.14, a: 0.19, c: 0.39, furos: { eixo: "y", nz: 2, nx: 4 }, parede: "ceramico_vedacao", sinapi: "37593",
        conferir: ["SINAPI não diz o número de furos: grade 2×4 representativa — conferir a ficha"] }),

    /* ---- CERÂMICO ESTRUTURAL (furos verticais; família 29 e família 39) ---- */
    U({ id: "ce-14x19x29", grupo: "ceramico_estrutural", nome: "Bloco cerâmico estrutural 14×19×29", l: 0.14, a: 0.19, c: 0.29, furos: { eixo: "y", nz: 1, nx: 2 }, parede: "ceramico_estrutural", sinapi: "34586", papel: "inteiro", familia: "ce-29", massa: { kg: 6.30, fonte: "Pauluzzi — bloco estrutural 14 cm 7 MPa", metodo: "publicado" }, fontes: [{ doc: "Pauluzzi — bloco cerâmico estrutural 14 cm", item: "6,30 kg; 16,70 peças/m²", url: "https://pauluzzi.com.br/blocos-ceramicos-estruturais/bloco-14cm-7-mpa/" }, { doc: "FAD 003 — bloco cerâmico estrutural 14×19×29 (PBQP-H)", item: "Tabela 1: paredes 12,1 mm, septos 12,7 mm", url: "https://pbqp-h.mdr.gov.br/wp-content/uploads/2021/09/FAD003-bloco-cer%C3%A2mico-estrutural-14x19x29-com-argamassa_18-12-vlimpa.pdf" }] }),
    U({ id: "ce-14x19x14", grupo: "ceramico_estrutural", nome: "Meio bloco cerâmico estrutural 14×19×14", l: 0.14, a: 0.19, c: 0.14, furos: { eixo: "y", nz: 1, nx: 1 }, parede: "ceramico_estrutural", sinapi: "34788", papel: "meio", familia: "ce-29", massa: { kg: 3.20, fonte: "Pauluzzi — complementares", metodo: "publicado" }, fontes: [{ doc: "Pauluzzi — bloco cerâmico estrutural 14 cm", item: "meio 14×19×14 = 3,20 kg", url: "https://pauluzzi.com.br/blocos-ceramicos-estruturais/bloco-14cm-7-mpa/" }] }),
    U({ id: "ce-14x19x44", grupo: "ceramico_estrutural", nome: "Bloco cerâmico estrutural de amarração 14×19×44", l: 0.14, a: 0.19, c: 0.44, furos: { eixo: "y", nz: 1, nx: 3 }, parede: "ceramico_estrutural", sinapi: null, papel: "amarracao-t", familia: "ce-29",
        conferir: ["sem insumo SINAPI: a peça de 44 (bloco e meio) é de catálogo de fabricante — conferir a ficha"], massa: { kg: 9.60, fonte: "Pauluzzi — complementares", metodo: "publicado" }, fontes: [{ doc: "Pauluzzi — bloco cerâmico estrutural 14 cm", item: "bloco e meio 14×19×44 = 9,60 kg", url: "https://pauluzzi.com.br/blocos-ceramicos-estruturais/bloco-14cm-7-mpa/" }] }),
    U({ id: "ce-can-14x19x29", grupo: "ceramico_estrutural", nome: "Canaleta cerâmica estrutural 14×19×29", l: 0.14, a: 0.19, c: 0.29, furos: null, canaleta: "U", parede: "ceramico_estrutural", sinapi: "34649", papel: "canaleta-u", familia: "ce-29", massa: { kg: 5.20, fonte: "Pauluzzi — canaleta (sem função estrutural, segundo a ficha)", metodo: "publicado" }, fontes: [{ doc: "Pauluzzi — bloco cerâmico estrutural 14 cm", item: "canaleta U 14×19×29 = 5,20 kg", url: "https://pauluzzi.com.br/blocos-ceramicos-estruturais/bloco-14cm-7-mpa/" }] }),
    U({ id: "ce-14x19x39", grupo: "ceramico_estrutural", nome: "Bloco cerâmico estrutural 14×19×39", l: 0.14, a: 0.19, c: 0.39, furos: { eixo: "y", nz: 1, nx: 2 }, parede: "ceramico_estrutural", sinapi: "34588", papel: "inteiro", familia: "ce-39", fontes: [{ doc: "Cerâmica City — família 14", item: "14×19×39 EST 100 e 120; canaleta 14×19×39; canaleta J", url: "https://www.ceramicacity.com.br/familia14" }] }),
    U({ id: "ce-14x19x19", grupo: "ceramico_estrutural", nome: "Meio bloco cerâmico estrutural 14×19×19", l: 0.14, a: 0.19, c: 0.19, furos: { eixo: "y", nz: 1, nx: 1 }, parede: "ceramico_estrutural", sinapi: "34781", papel: "meio", familia: "ce-39" }),
    U({ id: "ce-14x19x34", grupo: "ceramico_estrutural", nome: "Bloco cerâmico estrutural de amarração 14×19×34", l: 0.14, a: 0.19, c: 0.34, furos: { eixo: "y", nz: 1, nx: 2 }, parede: "ceramico_estrutural", sinapi: "38603", papel: "amarracao-l", familia: "ce-39" }),
    U({ id: "ce-can-14x19x39", grupo: "ceramico_estrutural", nome: "Canaleta cerâmica estrutural 14×19×39", l: 0.14, a: 0.19, c: 0.39, furos: null, canaleta: "U", parede: "ceramico_estrutural", sinapi: "34655", papel: "canaleta-u", familia: "ce-39" }),
    U({ id: "ce-can-14x19x19", grupo: "ceramico_estrutural", nome: "Meia canaleta cerâmica estrutural 14×19×19", l: 0.14, a: 0.19, c: 0.19, furos: null, canaleta: "U", parede: "ceramico_estrutural", sinapi: "38548", papel: "meia-canaleta", familia: "ce-39" }),

    /* ---- TIJOLO MACIÇO / TIJOLINHO APARENTE (assentado deitado) ---- */
    U({ id: "tm-5x10x20", grupo: "tijolo_macico", nome: "Tijolo cerâmico maciço comum 5×10×20", l: 0.10, a: 0.05, c: 0.20, furos: null, parede: null, sinapi: "7258",
        nota: "SINAPI escreve 5 X 10 X 20 (L X A X C) e a composição 101159 diz ESPESSURA 10 CM: o tijolo vai deitado, 5 cm é a altura da fiada" }),
    U({ id: "tm-ap-6x12x24", grupo: "tijolo_macico", nome: "Tijolo cerâmico maciço aparente 6×12×24", l: 0.12, a: 0.06, c: 0.24, furos: null, parede: null, sinapi: "7260" }),
    U({ id: "tm-ap2f-6x10x20", grupo: "tijolo_macico", nome: "Tijolo maciço aparente 2 furos 6,5×10×20", l: 0.10, a: 0.065, c: 0.20, furos: { eixo: "y", nz: 1, nx: 2, d: 0.025 }, parede: null, sinapi: "7256" }),
    U({ id: "tl-21f-5x11x23", grupo: "tijolo_macico", nome: "Tijolinho laminado 21 furos 5,5×11×23 (aparente)", l: 0.11, a: 0.055, c: 0.23, furos: { eixo: "y", nz: 3, nx: 7, d: 0.012 }, parede: null, sinapi: "34401",
        nota: "os 21 furos são verticais (atravessam a face de assentamento): somem na junta, a face aparente é cheia", massa: { kg: 1.98, fonte: "Cerâmica Braúnas — bloco laminado (AECweb)", metodo: "publicado" }, fontes: [{ doc: "Cerâmica Braúnas — bloco laminado", item: "5,5×11×23 = 1,98 kg; 75 peças/m²", url: "https://www.aecweb.com.br/produto/bloco-laminado/42314" }] }),

    /* ---- CONCRETO NBR 6136 — vedação classe C (alvéolos verticais) ---- */
    U({ id: "bc-ved-9x19x39",  grupo: "concreto", nome: "Bloco de concreto de vedação 9×19×39 (classe C)",  l: 0.09, a: 0.19, c: 0.39, alveolos: 2, parede: "concreto_C", sinapi: "650", papel: "inteiro", familia: "bc-M10-ved", massa: { kg: 7.80, fonte: "Bloco Morumbi — blocos 9 (AECweb)", metodo: "publicado" }, fontes: [{ doc: "Bloco Morumbi — blocos 9", item: "vedação 7,8 kg", url: "https://www.aecweb.com.br/produto/blocos-9/49114" }] }),
    U({ id: "bc-ved-9x19x19",  grupo: "concreto", nome: "Meio bloco de concreto de vedação 9×19×19",      l: 0.09, a: 0.19, c: 0.19, alveolos: 1, parede: "concreto_C", sinapi: "34764", papel: "meio", familia: "bc-M10-ved", massa: { kg: 4.60, fonte: "Bloco Morumbi — blocos 9 (AECweb)", metodo: "publicado" }, fontes: [{ doc: "Bloco Morumbi — blocos 9", item: "meio 9×19×19 = 4,6 kg", url: "https://www.aecweb.com.br/produto/blocos-9/49114" }] }),
    U({ id: "bc-ved-can-9x19x19", grupo: "concreto", nome: "Canaleta de concreto 9×19×19 (classe C)",     l: 0.09, a: 0.19, c: 0.19, canaleta: "U", parede: "concreto_C", sinapi: "658", papel: "meia-canaleta", familia: "bc-M10-ved" }),
    U({ id: "bc-ved-14x19x39", grupo: "concreto", nome: "Bloco de concreto de vedação 14×19×39 (classe C)", l: 0.14, a: 0.19, c: 0.39, alveolos: 2, parede: "concreto_C", sinapi: "651", papel: "inteiro", familia: "bc-M15-ved", massa: { kg: 9.70, fonte: "Bloco Morumbi — blocos 14 (vedação vazado)", metodo: "publicado" }, fontes: [{ doc: "Bloco Morumbi — blocos 14", item: "vedação vazado 9,7 kg", url: "https://www.aecweb.com.br/produto/blocos-14/49115" }] }),
    U({ id: "bc-ved-14x19x19", grupo: "concreto", nome: "Meio bloco de concreto de vedação 14×19×19",     l: 0.14, a: 0.19, c: 0.19, alveolos: 1, parede: "concreto_C", sinapi: "34774", papel: "meio", familia: "bc-M15-ved", massa: { kg: 4.20, fonte: "Bloco Morumbi — blocos 14 (meio vedação)", metodo: "publicado" }, fontes: [{ doc: "Bloco Morumbi — blocos 14", item: "meio vedação 4,2 kg", url: "https://www.aecweb.com.br/produto/blocos-14/49115" }] }),
    U({ id: "bc-ved-can-14x19x19", grupo: "concreto", nome: "Canaleta de concreto 14×19×19 (classe C)",   l: 0.14, a: 0.19, c: 0.19, canaleta: "U", parede: "concreto_C", sinapi: "659", papel: "meia-canaleta", familia: "bc-M15-ved" }),
    U({ id: "bc-ved-19x19x39", grupo: "concreto", nome: "Bloco de concreto de vedação 19×19×39 (classe C)", l: 0.19, a: 0.19, c: 0.39, alveolos: 2, parede: "concreto_C", sinapi: "654", papel: "inteiro", familia: "bc-M20-ved", massa: { kg: 11.60, fonte: "Bloco Morumbi — blocos 19 (vedação vazado)", metodo: "publicado" }, fontes: [{ doc: "Bloco Morumbi — blocos 19", item: "vazado 11,6 kg", url: "https://www.aecweb.com.br/produto/blocos-19/49116" }] }),
    U({ id: "bc-ved-19x19x19", grupo: "concreto", nome: "Meio bloco de concreto de vedação 19×19×19",     l: 0.19, a: 0.19, c: 0.19, alveolos: 1, parede: "concreto_C", sinapi: "34771", papel: "meio", familia: "bc-M20-ved" }),
    U({ id: "bc-ved-can-19x19x19", grupo: "concreto", nome: "Canaleta de concreto 19×19×19 (classe C)",   l: 0.19, a: 0.19, c: 0.19, canaleta: "U", parede: "concreto_C", sinapi: "660", papel: "meia-canaleta", familia: "bc-M20-ved" }),

    /* ---- CONCRETO NBR 6136 — ESTRUTURAL M15 família 39 (as peças do js/blocos.js "39-14") ---- */
    U({ id: "bc-14x19x39", grupo: "concreto", nome: "Bloco de concreto estrutural 14×19×39", l: 0.14, a: 0.19, c: 0.39, alveolos: 2, parede: "concreto_AB", sinapi: "25070", papel: "inteiro", familia: "bc-M15-39", blocos: "39-inteiro", fontes: [{ doc: "Tatu — FT-ENG-05 Linha de blocos", item: "desenho: 2 alvéolos", url: "https://www.tatu.com.br/Conteudo/Pdf/pdf_atualizado/FT-ENG-05_Linha_de_Blocos.pdf" }, { doc: "Bloco Morumbi — blocos 14", item: "estrutural 11,6 kg (o padrão é o do js/blocos.js)", url: "https://www.aecweb.com.br/produto/blocos-14/49115" }] }),
    U({ id: "bc-14x19x19", grupo: "concreto", nome: "Meio bloco de concreto estrutural 14×19×19", l: 0.14, a: 0.19, c: 0.19, alveolos: 1, parede: "concreto_AB", sinapi: "38589", papel: "meio", familia: "bc-M15-39", blocos: "39-meio", fontes: [{ doc: "Tatu — FT-ENG-05", item: "meio bloco: 1 alvéolo", url: "https://www.tatu.com.br/Conteudo/Pdf/pdf_atualizado/FT-ENG-05_Linha_de_Blocos.pdf" }, { doc: "Bloco Morumbi — blocos 14", item: "meio estrutural 5,9 kg", url: "https://www.aecweb.com.br/produto/blocos-14/49115" }] }),
    U({ id: "bc-14x19x34", grupo: "concreto", nome: "Bloco de amarração L 14×19×34", l: 0.14, a: 0.19, c: 0.34, alveolos: 2, parede: "concreto_AB", sinapi: "38591", papel: "amarracao-l", familia: "bc-M15-39", blocos: "39-amarr-l", fontes: [{ doc: "Tatu — FT-ENG-05", item: "14×34: 2 alvéolos", url: "https://www.tatu.com.br/Conteudo/Pdf/pdf_atualizado/FT-ENG-05_Linha_de_Blocos.pdf" }] }),
    U({ id: "bc-14x19x54", grupo: "concreto", nome: "Bloco de amarração T 14×19×54", l: 0.14, a: 0.19, c: 0.54, alveolos: 3, parede: "concreto_AB", sinapi: null, papel: "amarracao-t", familia: "bc-M15-39", blocos: "39-amarr-t",
        conferir: ["sem insumo SINAPI do 54: a composição 89470 conta o 34 e o meio bloco; o 54 é peça de fabricante (peso em js/blocos.js)"], fontes: [{ doc: "Tatu — FT-ENG-05", item: "54: 3 alvéolos", url: "https://www.tatu.com.br/Conteudo/Pdf/pdf_atualizado/FT-ENG-05_Linha_de_Blocos.pdf" }, { doc: "JB Blocos — família 14 classe A", item: "14×19×54 = 17 kg", url: "https://www.aecweb.com.br/produto/bloco-de-concreto-estrutural-familia-14-classe-a/47166" }] }),
    U({ id: "bc-can-14x19x39", grupo: "concreto", nome: "Canaleta U estrutural 14×19×39", l: 0.14, a: 0.19, c: 0.39, canaleta: "U", parede: "concreto_AB", sinapi: "38597", papel: "canaleta-u", familia: "bc-M15-39", blocos: "39-can-u", fontes: [{ doc: "Bloco Morumbi — blocos 14", item: "canaleta 10,3 kg; meia 5,5 kg", url: "https://www.aecweb.com.br/produto/blocos-14/49115" }] }),
    U({ id: "bc-can-14x19x19", grupo: "concreto", nome: "Meia canaleta U estrutural 14×19×19", l: 0.14, a: 0.19, c: 0.19, canaleta: "U", parede: "concreto_AB", sinapi: "38595", papel: "meia-canaleta", familia: "bc-M15-39", blocos: "39-can-u-meia" }),
    U({ id: "bc-canj-14x19x39", grupo: "concreto", nome: "Canaleta J 14×19×39 (borda de laje)", l: 0.14, a: 0.19, c: 0.39, canaleta: "J", parede: "concreto_AB", sinapi: null, papel: "canaleta-j", familia: "bc-M15-39", blocos: "39-can-j",
        conferir: ["sem insumo SINAPI da canaleta J — peça de fabricante (peso em js/blocos.js)"] }),
    U({ id: "bc-14x19x09", grupo: "concreto", nome: "Compensador 14×19×9", l: 0.14, a: 0.19, c: 0.09, alveolos: 1, parede: "concreto_AB", sinapi: null, papel: "compensador", familia: "bc-M15-39", blocos: "39-comp-9" }),
    U({ id: "bc-14x19x04", grupo: "concreto", nome: "Compensador 14×19×4 (maciço)", l: 0.14, a: 0.19, c: 0.04, alveolos: 0, parede: "concreto_AB", sinapi: null, papel: "compensador", familia: "bc-M15-39", blocos: "39-comp-4" }),

    /* ---- CONCRETO NBR 6136 — ESTRUTURAL M15 família 29 (js/blocos.js "29") ---- */
    U({ id: "bc-14x19x29", grupo: "concreto", nome: "Bloco de concreto estrutural 14×19×29", l: 0.14, a: 0.19, c: 0.29, alveolos: 2, parede: "concreto_AB", sinapi: "38590", papel: "inteiro", familia: "bc-M15-29", blocos: "29-inteiro", fontes: [{ doc: "JB Blocos — família 14 classe A", item: "14×19×29 = 10 kg", url: "https://www.aecweb.com.br/produto/bloco-de-concreto-estrutural-familia-14-classe-a/47166" }] }),
    U({ id: "bc-14x19x14", grupo: "concreto", nome: "Meio bloco de concreto estrutural 14×19×14", l: 0.14, a: 0.19, c: 0.14, alveolos: 1, parede: "concreto_AB", sinapi: "38588", papel: "meio", familia: "bc-M15-29", blocos: "29-meio" }),
    U({ id: "bc-14x19x44", grupo: "concreto", nome: "Bloco e meio (amarração T) 14×19×44", l: 0.14, a: 0.19, c: 0.44, alveolos: 3, parede: "concreto_AB", sinapi: null, papel: "amarracao-t", familia: "bc-M15-29", blocos: "29-amarr-t", fontes: [{ doc: "Tatu — FT-ENG-05", item: "44: 3 alvéolos", url: "https://www.tatu.com.br/Conteudo/Pdf/pdf_atualizado/FT-ENG-05_Linha_de_Blocos.pdf" }] }),
    U({ id: "bc-can-14x19x29", grupo: "concreto", nome: "Canaleta U estrutural 14×19×29", l: 0.14, a: 0.19, c: 0.29, canaleta: "U", parede: "concreto_AB", sinapi: "38596", papel: "canaleta-u", familia: "bc-M15-29", blocos: "29-can-u" }),
    U({ id: "bc-can-14x19x14", grupo: "concreto", nome: "Meia canaleta U 14×19×14", l: 0.14, a: 0.19, c: 0.14, canaleta: "U", parede: "concreto_AB", sinapi: null, papel: "meia-canaleta", familia: "bc-M15-29", blocos: "29-can-u-meia" }),

    /* ---- CONCRETO NBR 6136 — ESTRUTURAL M20 (js/blocos.js "39-19") ---- */
    U({ id: "bc-19x19x39", grupo: "concreto", nome: "Bloco de concreto estrutural 19×19×39", l: 0.19, a: 0.19, c: 0.39, alveolos: 2, parede: "concreto_M20", sinapi: "25067", papel: "inteiro", familia: "bc-M20-39", blocos: "39x19-inteiro", fontes: [{ doc: "Bloco Morumbi — blocos 19", item: "estrutural 14,8 kg; canaleta 16; meio 8", url: "https://www.aecweb.com.br/produto/blocos-19/49116" }] }),
    U({ id: "bc-19x19x19", grupo: "concreto", nome: "Meio bloco de concreto estrutural 19×19×19", l: 0.19, a: 0.19, c: 0.19, alveolos: 1, parede: "concreto_M20", sinapi: null, papel: "meio", familia: "bc-M20-39", blocos: "39x19-meio",
        conferir: ["SINAPI MG 06/2026 só tem o meio bloco 19×19×19 de VEDAÇÃO (34771); o estrutural é de fabricante"] }),
    U({ id: "bc-can-19x19x39", grupo: "concreto", nome: "Canaleta U estrutural 19×19×39", l: 0.19, a: 0.19, c: 0.39, canaleta: "U", parede: "concreto_M20", sinapi: null, papel: "canaleta-u", familia: "bc-M20-39", blocos: "39x19-can-u" }),
    U({ id: "bc-can-19x19x19", grupo: "concreto", nome: "Meia canaleta U 19×19×19", l: 0.19, a: 0.19, c: 0.19, canaleta: "U", parede: "concreto_M20", sinapi: "660", papel: "meia-canaleta", familia: "bc-M20-39", blocos: "39x19-can-u-meia" }),
    U({ id: "bc-19x19x09", grupo: "concreto", nome: "Compensador 19×19×9", l: 0.19, a: 0.19, c: 0.09, alveolos: 1, parede: "concreto_M20", sinapi: null, papel: "compensador", familia: "bc-M20-39", blocos: "39x19-comp-9" }),
    U({ id: "bc-19x19x04", grupo: "concreto", nome: "Compensador 19×19×4 (maciço)", l: 0.19, a: 0.19, c: 0.04, alveolos: 0, parede: "concreto_M20", sinapi: null, papel: "compensador", familia: "bc-M20-39", blocos: "39x19-comp-4" }),

    /* ---- CONCRETO NBR 6136 — ESTRUTURAL M10 (9×19×39) ---- */
    U({ id: "bc-9x19x39", grupo: "concreto", nome: "Bloco de concreto estrutural 9×19×39", l: 0.09, a: 0.19, c: 0.39, alveolos: 2, parede: "concreto_C", sinapi: "25071", papel: "inteiro", familia: "bc-M10-39",
        conferir: ["NBR 6136-1:2026 Tabelas 4 e 6: bloco de 90 mm só na classe C, até um pavimento — conferir a classe do fornecedor"], fontes: [{ doc: "Bloco Morumbi — blocos 9", item: "9×19×39 7,8 kg; meio 4,6", url: "https://www.aecweb.com.br/produto/blocos-9/49114" }] })
  ];

  /* ------------------------------------------------------------ FAMÍLIAS
   * O que a paginação precisa: a peça de cada papel, a função, a composição
   * SINAPI por m² (que JÁ CONTA as unidades — regra do telhado) e as de
   * verga/contraverga pela espessura. `meio: null` = a obra CORTA o bloco
   * (o cerâmico de vedação não tem meio bloco no SINAPI). */
  var FAMILIAS = {
    "cv-8f-9":   { rotulo: "Cerâmico 8 furos 9×19×19 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-8f-9x19x19" }, comp: "103328", espCm: 10 },
    "cv-8f-9-29": { rotulo: "Cerâmico 8 furos 9×19×29 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-8f-9x19x29" }, comp: "103356", espCm: 10 },
    "cv-8f-11":  { rotulo: "Cerâmico 11,5×19×19 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-8f-11x19x19" }, comp: "103330", espCm: 10 },
    "cv-6f-9":   { rotulo: "Cerâmico 6 furos 9×14×19 em pé (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-6f-9x14x19" }, comp: "103332", espCm: 10 },
    "cv-6f-9-deitado": { rotulo: "Cerâmico 6 furos 9×14×19 deitado — parede de 14 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-6f-14x9x19" }, comp: "103334", espCm: 15 },
    "cv-6f-9-24": { rotulo: "Cerâmico 6 furos 9×14×24 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-6f-9x14x24" }, comp: "103352", espCm: 10 },
    "cv-6f-11":  { rotulo: "Cerâmico 6 furos 11,5×19×29 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-6f-11x19x29" }, comp: "103358", espCm: 10 },
    "cv-9f-11":  { rotulo: "Cerâmico 9 furos 11,5×14×24 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-9f-11x14x24" }, comp: "103354", espCm: 10 },
    "cv-9f-14":  { rotulo: "Cerâmico 9 furos 14×19×29 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-9f-14x19x29" }, comp: "103360", espCm: 15 },
    "cv-9f-14-39": { rotulo: "Cerâmico 9 furos 14×19×39 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-9f-14x19x39" }, comp: "103368", espCm: 15 },
    "cv-9f-19":  { rotulo: "Cerâmico 9 furos 19×19×29 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-9f-19x19x29" }, comp: "103362", espCm: 20 },
    "cv-4f-9":   { rotulo: "Cerâmico 4 furos 9×9×19 (vedação)", funcao: "vedacao", grupo: "ceramico_vedacao", pecas: { inteiro: "cv-4f-9x9x19" }, comp: "103350", espCm: 10 },
    "cvv-14":    { rotulo: "Cerâmico de vedação 14×19×29 furos na vertical", funcao: "vedacao", grupo: "ceramico_vedacao_v", pecas: { inteiro: "cvv-14x19x29" }, comp: "103346", espCm: 15 },
    "ce-29":     { rotulo: "Cerâmico estrutural 14×19×29 (família 29)", funcao: "estrutural", grupo: "ceramico_estrutural", pecas: { inteiro: "ce-14x19x29", meio: "ce-14x19x14", "amarracao-t": "ce-14x19x44", "canaleta-u": "ce-can-14x19x29" }, comp: "89290", espCm: 15 },
    "ce-39":     { rotulo: "Cerâmico estrutural 14×19×39 (família 39)", funcao: "estrutural", grupo: "ceramico_estrutural", pecas: { inteiro: "ce-14x19x39", meio: "ce-14x19x19", "amarracao-l": "ce-14x19x34", "canaleta-u": "ce-can-14x19x39", "meia-canaleta": "ce-can-14x19x19" }, comp: "89282", espCm: 15 },
    "tm-10":     { rotulo: "Tijolo maciço 5×10×20 (parede de 10)", funcao: "vedacao", grupo: "tijolo_macico", pecas: { inteiro: "tm-5x10x20" }, comp: "101159", espCm: 10,
                   conferir: ["a composição SINAPI 101159 conta 73,49 tijolos/m² — menos que a modulação de 1 cm de junta (79,37/m²): a premissa da Caixa é de junta mais grossa. O assentamento conta pela junta de 1 cm; o preço é o da composição"] },
    "tl-11":     { rotulo: "Tijolinho laminado aparente 5,5×11×23", funcao: "vedacao", grupo: "tijolo_macico", pecas: { inteiro: "tl-21f-5x11x23" }, comp: null, espCm: 10,
                   conferir: ["SINAPI MG 06/2026 não tem composição de alvenaria de tijolinho laminado: o insumo 34401 existe, a composição fica PENDENTE (escolha no Orçamento do modelo)"] },
    "tm-ap-12":  { rotulo: "Tijolo maciço aparente 6×12×24", funcao: "vedacao", grupo: "tijolo_macico", pecas: { inteiro: "tm-ap-6x12x24" }, comp: null, espCm: 10,
                   conferir: ["SINAPI MG 06/2026 não tem composição de alvenaria deste tijolo: composição PENDENTE"] },
    "bc-M10-ved": { rotulo: "Bloco de concreto 9×19×39 vedação (M10, classe C)", funcao: "vedacao", grupo: "concreto", pecas: { inteiro: "bc-ved-9x19x39", meio: "bc-ved-9x19x19", "meia-canaleta": "bc-ved-can-9x19x19" }, comp: "103316", espCm: 10 },
    "bc-M15-ved": { rotulo: "Bloco de concreto 14×19×39 vedação (M15, classe C)", funcao: "vedacao", grupo: "concreto", pecas: { inteiro: "bc-ved-14x19x39", meio: "bc-ved-14x19x19", "meia-canaleta": "bc-ved-can-14x19x19" }, comp: "103318", espCm: 15 },
    "bc-M20-ved": { rotulo: "Bloco de concreto 19×19×39 vedação (M20, classe C)", funcao: "vedacao", grupo: "concreto", pecas: { inteiro: "bc-ved-19x19x39", meio: "bc-ved-19x19x19", "meia-canaleta": "bc-ved-can-19x19x19" }, comp: "103320", espCm: 20 },
    "bc-M15-39": { rotulo: "Bloco de concreto estrutural 14×19×39 (M15, família 39)", funcao: "estrutural", grupo: "concreto", blocos: "39-14",
                   pecas: { inteiro: "bc-14x19x39", meio: "bc-14x19x19", "amarracao-l": "bc-14x19x34", "amarracao-t": "bc-14x19x54", "canaleta-u": "bc-can-14x19x39", "meia-canaleta": "bc-can-14x19x19", "canaleta-j": "bc-canj-14x19x39", comp9: "bc-14x19x09", comp4: "bc-14x19x04" },
                   comp: "89453", compPorClasse: { "4.5": "89453", "14": "89455" }, espCm: 15 },
    "bc-M15-29": { rotulo: "Bloco de concreto estrutural 14×19×29 (M15, família 29)", funcao: "estrutural", grupo: "concreto", blocos: "29",
                   pecas: { inteiro: "bc-14x19x29", meio: "bc-14x19x14", "amarracao-t": "bc-14x19x44", "canaleta-u": "bc-can-14x19x29", "meia-canaleta": "bc-can-14x19x14" },
                   comp: "89462", compPorClasse: { "4.5": "89462", "14": "89464" }, espCm: 15 },
    "bc-M20-39": { rotulo: "Bloco de concreto estrutural 19×19×39 (M20)", funcao: "estrutural", grupo: "concreto", blocos: "39-19",
                   pecas: { inteiro: "bc-19x19x39", meio: "bc-19x19x19", "canaleta-u": "bc-can-19x19x39", "meia-canaleta": "bc-can-19x19x19", comp9: "bc-19x19x09", comp4: "bc-19x19x04" },
                   comp: null, espCm: 20,
                   conferir: ["SINAPI MG 06/2026 não tem composição de alvenaria ESTRUTURAL 19×19×39: composição PENDENTE (a de vedação 103320 não serve para estrutural)"] }
  };

  /* verga e contraverga SINAPI por espessura (AF_03/2024, conferidas na base MG 06/2026):
     moldada com bloco canaleta (estrutural e concreto) ou pré-moldada (cerâmico de vedação) */
  var VERGA_SINAPI = {
    canaleta: { verga: { 10: "105026", 15: "105025", 20: "93191" }, contraverga: { 10: "105032", 15: "105031", 20: "93199" } },
    /* pré-moldada: a composição de verga vale "COM ATÉ 1,5 M DE VÃO"; acima disso, moldada in loco em concreto */
    premoldada: { verga: { 10: "105022", 15: "105021", 20: "93184" }, contraverga: { 10: "105028", 15: "105027", 20: "93194" } },
    moldada: { verga: { 10: "105024", 15: "105023", 20: "93187" }, contraverga: { 10: "105030", 15: "105029", 20: "93197" } }
  };
  /* graute das canaletas da ALVENARIA ESTRUTURAL (AF_06/2026, conferidas na base MG 06/2026): a canaleta já está
     na composição por m² (89453… têm o insumo CANALETA); à parte, só o graute por m³ e a armadura por kg */
  var AVISO_EDICAO = "valor da edição anterior — conferir na edição vigente";
  var GRAUTE_SINAPI = { verga: "89995", cinta: "89995", contraverga: "89994" };   /* GRAUTEAMENTO DE CINTA SUPERIOR OU DE VERGA / DE CINTA INTERMEDIÁRIA OU DE CONTRAVERGA EM ALVENARIA ESTRUTURAL, FGK = 20 MPA — M3 */
  var ENCUNHAMENTO_SINAPI = "93200";   /* FIXAÇÃO (ENCUNHAMENTO) DE ALVENARIA DE VEDAÇÃO COM ARGAMASSA APLICADA COM BISNAGA. AF_03/2024 — M */

  var POR_ID = {};
  UNIDADES.forEach(function (u) { POR_ID[u.id] = u; });

  function paredeDe(u) {
    if (!u || !u.parede) return null;
    if (typeof u.parede === "object") return u.parede;
    return PAREDE[u.parede] || null;
  }

  /* massa publicada (concreto: o peso de referência do js/blocos.js) */
  function massaDe(u) {
    if (!u) return { kg: null, fonte: "", metodo: "sem-fonte" };
    if (u.massa && u.massa.kg != null) return u.massa;
    var B = BL();
    if (u.blocos && B && B.pesoDe) {
      var kg = B.pesoDe(u.blocos), org = B.origemDoPeso ? B.origemDoPeso(u.blocos) : null;
      if (kg != null) return { kg: kg, fonte: "js/blocos.js (" + u.blocos + (org && org.fabricante ? " — " + org.fabricante : "") + ")", metodo: org && org.metodo ? org.metodo : "referencia" };
    }
    return { kg: null, fonte: "sem fonte — conferir a ficha do fornecedor", metodo: "sem-fonte" };
  }

  /* ================================================== GEOMETRIA DA PEÇA
   * Caixas {x,y,z,w,h,d} (canto mínimo + tamanho), no referencial da peça:
   * x ao longo da parede [0, c], y para cima [0, a], z na espessura
   * [-l/2, l/2]. `c`/`a` opcionais: a peça CORTADA (o pedaço que a obra
   * serra) — os furos horizontais seguem inteiros no corte (é o mesmo bloco
   * serrado); os verticais são recontados no comprimento novo.
   * Devolve também `furos` (as cavidades, com o eixo) para a conferência.
   * ================================================================== */
  function geometria(idOuU, opts) {
    opts = opts || {};
    var u = typeof idOuU === "string" ? POR_ID[idOuU] : idOuU;
    if (!u) return null;
    var c = num(opts.c, u.c), a = num(opts.a, u.a), l = u.l;
    var cx = [], furos = [], pw = paredeDe(u);
    function caixa(x, y, z, w, h, d) { if (w > 1e-5 && h > 1e-5 && d > 1e-5) cx.push({ x: r4(x), y: r4(y), z: r4(z), w: r4(w), h: r4(h), d: r4(d) }); }
    var f = u.furos;
    if (opts.simples || (!f && !u.alveolos && !u.canaleta)) {
      caixa(0, 0, -l / 2, c, a, l);
      return { caixas: cx, furos: furos, triangulos: cx.length * 12, unidade: u.id };
    }
    if (u.canaleta) {
      var e = pw ? pw.ext : 0.02, fundo = Math.max(0.03, e);
      caixa(0, 0, -l / 2, c, a, e);                         /* casca da face de fora */
      var hDentro = u.canaleta === "J" ? a - 0.05 : a;      /* J: a face de dentro mais baixa (apoio da laje) */
      caixa(0, 0, l / 2 - e, c, hDentro, e);                /* casca da face de dentro */
      caixa(0, 0, -l / 2 + e, c, fundo, l - 2 * e);         /* fundo do U */
      furos.push({ eixo: "x", x: 0, y: fundo, z: -l / 2 + e, w: c, h: a - fundo, d: l - 2 * e, canal: true });
      return { caixas: cx, furos: furos, triangulos: cx.length * 12, unidade: u.id };
    }
    if (f && f.eixo === "x") {
      /* furos HORIZONTAIS, paralelos ao comprimento: a seção L × A tem a grade nz × ny */
      var ext = pw.ext, s = pw.septo, nz = f.nz, ny = f.ny;
      var fw = (l - 2 * ext - (nz - 1) * s) / nz, fh = (a - 2 * ext - (ny - 1) * s) / ny;
      caixa(0, 0, -l / 2, c, a, ext);                 /* face cheia de fora (z−) */
      caixa(0, 0, l / 2 - ext, c, a, ext);            /* face cheia de dentro (z+) */
      caixa(0, 0, -l / 2 + ext, c, ext, l - 2 * ext);         /* casca de baixo */
      caixa(0, a - ext, -l / 2 + ext, c, ext, l - 2 * ext);   /* casca de cima */
      for (var i = 1; i < nz; i++) caixa(0, ext, -l / 2 + ext + i * fw + (i - 1) * s, c, a - 2 * ext, s);
      for (var k = 1; k < ny; k++) caixa(0, ext + k * fh + (k - 1) * s, -l / 2 + ext, c, s, l - 2 * ext);
      for (var zi = 0; zi < nz; zi++) for (var yi = 0; yi < ny; yi++)
        furos.push({ eixo: "x", x: 0, y: r4(ext + yi * (fh + s)), z: r4(-l / 2 + ext + zi * (fw + s)), w: c, h: r4(fh), d: r4(fw) });
      return { caixas: cx, furos: furos, triangulos: cx.length * 12, unidade: u.id, furoW: r4(fw), furoH: r4(fh) };
    }
    /* furos VERTICAIS (alvéolos do concreto, cerâmico estrutural, vedação "na vertical", tijolo de 2/21 furos) */
    var nzv = f ? f.nz : 1, nx;
    if (u.alveolos != null) nx = u.alveolos;
    else nx = f ? f.nx : 0;
    if (opts.c != null && u.c > 0 && nx > 0) nx = Math.max(0, Math.round(nx * c / u.c));   /* peça cortada: menos alvéolos */
    if (f && f.d && !u.alveolos) {
      /* furos pequenos (tijolo maciço com furos, laminado): a peça é cheia por fora; os furos não mudam a face */
      caixa(0, 0, -l / 2, c, a, l);
      var px = c / nx, pz = l / nzv;
      for (var ix = 0; ix < nx; ix++) for (var iz = 0; iz < nzv; iz++)
        furos.push({ eixo: "y", x: r4((ix + 0.5) * px - f.d / 2), y: 0, z: r4(-l / 2 + (iz + 0.5) * pz - f.d / 2), w: f.d, h: a, d: f.d, oculto: true });
      return { caixas: cx, furos: furos, triangulos: cx.length * 12, unidade: u.id };
    }
    var exv = pw ? pw.ext : 0.025, sv = pw ? pw.septo : 0.025;
    if (!(nx > 0)) { caixa(0, 0, -l / 2, c, a, l); return { caixas: cx, furos: furos, triangulos: cx.length * 12, unidade: u.id, macico: true }; }
    caixa(0, 0, -l / 2, c, a, exv);                  /* casca longitudinal de fora (a FACE) */
    caixa(0, 0, l / 2 - exv, c, a, exv);             /* casca longitudinal de dentro */
    var vaoX = (c - (nx + 1) * sv) / nx;
    for (var w = 0; w <= nx; w++) caixa(w * (vaoX + sv), 0, -l / 2 + exv, sv, a, l - 2 * exv);   /* septos transversais (inclusive as pontas) */
    var vaoZ = (l - 2 * exv - (nzv - 1) * sv) / nzv;
    for (var z2 = 1; z2 < nzv; z2++) caixa(0, 0, -l / 2 + exv + z2 * vaoZ + (z2 - 1) * sv, c, a, sv);   /* septo longitudinal interno */
    for (var a1 = 0; a1 < nx; a1++) for (var a2 = 0; a2 < nzv; a2++)
      furos.push({ eixo: "y", x: r4(sv + a1 * (vaoX + sv)), y: 0, z: r4(-l / 2 + exv + a2 * (vaoZ + sv)), w: r4(vaoX), h: a, d: r4(vaoZ) });
    return { caixas: cx, furos: furos, triangulos: cx.length * 12, unidade: u.id, alveolo: { w: r4(vaoX), d: r4(vaoZ) } };
  }

  /* A FACE DA PAREDE É CHEIA? (z = −l/2 e z = +l/2). Cada face tem de estar
   * 100% coberta por caixas encostadas nela, e nenhum furo pode abrir nela.
   * É a régua do defeito "furos para frente". */
  function faceCheia(geo, u, lado) {
    if (!geo || !u) return false;
    var zf = lado > 0 ? u.l / 2 : -u.l / 2, area = 0, c = 0, a = 0;
    geo.caixas.forEach(function (b) { c = Math.max(c, b.x + b.w); a = Math.max(a, b.y + b.h); });
    geo.caixas.forEach(function (b) {
      var toca = lado > 0 ? Math.abs(b.z + b.d - zf) < 1e-4 : Math.abs(b.z - zf) < 1e-4;
      if (toca) area += b.w * b.h;
    });
    var furoNaFace = geo.furos.some(function (h) {
      if (h.oculto || h.canal) return false;
      return lado > 0 ? Math.abs(h.z + h.d - zf) < 1e-4 : Math.abs(h.z - zf) < 1e-4;
    });
    return !furoNaFace && area >= c * a - 1e-6;
  }

  /* volume de material da peça (as caixas só se sobrepõem no cruzamento de dois septos: s × s × c, desprezível) */
  function volumeSolido(geo) {
    var v = 0; if (!geo) return 0;
    geo.caixas.forEach(function (b) { v += b.w * b.h * b.d; });
    return v;
  }

  var AlvUnidades = {
    JUNTA: JUNTA, FONTES: FONTES, PAREDE: PAREDE, UNIDADES: UNIDADES, FAMILIAS: FAMILIAS,
    VERGA_SINAPI: VERGA_SINAPI, ENCUNHAMENTO_SINAPI: ENCUNHAMENTO_SINAPI, GRAUTE_SINAPI: GRAUTE_SINAPI, AVISO_EDICAO: AVISO_EDICAO,
    unidade: function (id) { return POR_ID[String(id)] || null; },
    familia: function (id) { var f = FAMILIAS[String(id)]; if (!f) return null; var o = clone(f); o.id = String(id); return o; },
    listarFamilias: function () { return Object.keys(FAMILIAS).map(function (k) { return { id: k, rotulo: FAMILIAS[k].rotulo, funcao: FAMILIAS[k].funcao, grupo: FAMILIAS[k].grupo }; }); },
    /* a peça de um papel na família (null: a obra corta o inteiro) */
    peca: function (famId, papel) { var f = FAMILIAS[famId]; if (!f) return null; var id = f.pecas[papel]; return id ? POR_ID[id] : null; },
    geometria: geometria,
    faceCheia: faceCheia,
    volumeSolido: volumeSolido,
    massa: function (id) { return massaDe(POR_ID[id]); },
    /* massa CALCULADA pela geometria (nunca no lugar da publicada): γ em kg/m³ do material da peça */
    massaCalculada: function (id) {
      var u = POR_ID[id]; if (!u) return null;
      var g = geometria(u), v = volumeSolido(g);
      var gama = u.grupo === "concreto" ? 2200 : 1800;   /* concreto: o γ calibrado do js/blocos.js; cerâmica: NBR 6120:2019 Tabela 1 (18 kN/m³, como o js/alvtipos.js) */
      return { kg: Math.round(v * gama * 100) / 100, formula: "volume das caixas da peça (" + r4(v * 1e3) + " L) × " + gama + " kg/m³ — CALCULADO, não publicado", gama: gama };
    },
    /* peças por m² na modulação (sem perda): 1 / ((c + j)(a + j)) */
    pecasPorM2: function (id, junta) {
      var u = POR_ID[id]; if (!u) return 0;
      var j = junta != null ? num(junta, JUNTA) : JUNTA;
      return r4(1 / ((u.c + j) * (u.a + j)));
    },
    /* a ficha que a tela e o teste leem */
    ficha: function (id) {
      var u = POR_ID[id]; if (!u) return null;
      var g = geometria(u), m = massaDe(u);
      var fontes = [{ doc: FONTES.SINAPI.doc, item: u.sinapi ? "insumo " + u.sinapi : "sem insumo SINAPI", url: FONTES.SINAPI.url }];
      if (u.grupo === "concreto") fontes.push({ doc: FONTES.NBR6136.doc, item: "Tabela 2 (dimensões nominais), Tabela 4 (paredes), Tabelas 1 e 6 (classe e pavimentos)", url: FONTES.NBR6136.url });
      else if (u.grupo !== "tijolo_macico") fontes.push({ doc: FONTES.NBR15270.doc, item: "Tabelas 3 e 4 (dimensões nominais), Tabela 2 e item 5.2 (parede e septo)", url: FONTES.NBR15270.url });
      if (u.blocos) fontes.push({ doc: FONTES.BLOCOS_JS.doc, item: u.blocos, url: null });
      /* EDIÇÃO DA NORMA: dimensões, paredes e classes foram conferidas em 21/10/2026 no texto da 6136-1:2026 e da
         15270-1:2023 (tools/test-alv-normas-2026.js). Fica marcado só o que a norma vigente não traz. */
      var conferir = (u.conferir || []).slice();
      if (u.parede === "ceramico_vedacao") conferir.push("septo de 6 mm: a NBR 15270-1:2023 não traz mínimo de septo para o VED15 (só a soma das paredes ≥ 20 mm, item 5.2) — padrão de geometria, conferir a ficha do fornecedor");
      if (u.grupo === "tijolo_macico") conferir.push("a medida comercial do tijolo (SINAPI) não é uma das dimensões nominais da Tabela 5 da NBR 15270-1:2023 (largura 90, 115 ou 140 mm; altura 53, 57, 65, 90 ou 115 mm; comprimento 190, 240 ou 290 mm) — conferir a ficha do fornecedor");
      (u.fontes || []).forEach(function (f) { fontes.push(f); });
      return {
        id: u.id, nome: u.nome, grupo: u.grupo,
        real: { l: u.l, a: u.a, c: u.c },
        nominal: { l: r3(u.l + JUNTA), a: r3(u.a + JUNTA), c: r3(u.c + JUNTA) },
        junta: JUNTA,
        furos: u.furos ? { eixo: u.furos.eixo, n: geometria(u).furos.length, orientacao: u.furos.eixo === "x" ? "horizontal, paralelos à parede" : "vertical" } : (u.alveolos != null ? { eixo: "y", n: u.alveolos, orientacao: "vertical (alvéolos)" } : (u.canaleta ? { eixo: "x", n: 1, orientacao: "canal aberto em cima (canaleta " + u.canaleta + ")" } : null)),
        parede: paredeDe(u),
        massa: m, massaCalculada: this.massaCalculada(id),
        pecasPorM2: this.pecasPorM2(id), sinapi: u.sinapi || null,
        triangulos: g.triangulos, fontes: fontes, conferir: conferir, nota: u.nota || ""
      };
    }
  };

  global.AlvUnidades = AlvUnidades;
  if (typeof module !== "undefined" && module.exports) module.exports = AlvUnidades;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

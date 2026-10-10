/* =====================================================================
 * padraodet.js — PADRÃO DE DETALHAMENTO TÉCNICO (07/10/2026)
 *
 * Pedido do Rogério: "esse detalhamento, estilo de vista, tem que ser
 * replicado para dentro do nosso sistema; o sistema tem que ser capaz de ter
 * essas configurações também". O padrão é o de escritório de projeto
 * estrutural (prancha de armação estilo TQS + NBR 7191 / 8403 / 16752):
 * barra em linha grossa sobre contorno fino, notação "3 N1 Ø12.5 C=486",
 * cotas em cm com traço oblíquo, preto e branco por espessura de pena.
 *
 * MOTOR PURO (Node-testável, sem DOM): o padrão embutido, a normalização, a
 * pena e o traço de cada layer, a notação das barras, a massa por bitola e o
 * resumo do aço, a conversão para o estilo das vistas 2D (js/desenho2d.js),
 * importação/exportação do JSON e uma amostra em SVG para a tela de
 * configuração. A gravação (prefs da empresa) é a fiação fina do fim.
 *
 * ⚠ O PADRÃO EMBUTIDO É SÓ TÉCNICO: nada de nome de cliente, de pessoa ou de
 *   registro profissional (regra de js/ e test-cliente-nao-vaza). Ele é gerado
 *   do padrao_detalhamento_ra.json da RA pelos campos técnicos; a empresa
 *   pode importar o próprio JSON ou editar na tela "Padrão de detalhamento".
 *
 * VERSÃO 2 (09/10/2026) — o padrão visual passou a ser o do TQS (decisão do
 * dono): notação "3 N1 Ø 12.5 C=486" (espaço depois do Ø), estribo de viga
 * sem o espaçamento (vai nos trechos), barra desdobrada na cor 30 (0,60 mm),
 * cores de tela legíveis (42/92/150/200, mesmas penas das 2/3/4/5), textos
 * por proporção (cota 2,5 mm). O CARIMBO não muda com o padrão (é o modelo
 * "RA" do js/prancha.js). Para trazer uma versão nova do JSON:
 *   node tools/padraodet-sincronizar.js <padrao_detalhamento_ra.json>
 * (troca só o literal PADRAO_RA; o sincronizador antigo, que regerava o
 * arquivo inteiro de um molde, apagaria o código que veio depois).
 * Teste: node tools/test-padraodet.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var PADRAO_RA = {
   "versao": "2.1",
   "principios": [
    "Padrão visual do TQS em todo detalhamento de concreto armado (v2.0, 09/10/2026). Carimbo RA intocado.",
    "Pranchas separadas por TIPO, como o TQS emite: fôrma; vigas (quantas folhas precisar); pilares; lajes — armadura POSITIVA; lajes — armadura NEGATIVA; blocos/sapatas; vigas baldrame. Não misturar tipos nem fôrma com armação (exceção TQS: sapata isolada leva as cotas de fôrma junto da armação, ref. Unipar).",
    "Preto e branco na plotagem: a hierarquia vem SÓ da espessura (cor na tela = pena no CTB). As cores do TQS na tela (seção verde, chamada vermelha) não vão para o papel.",
    "Barra desdobrada = linha mais GROSSA da folha (TQS 0,59–0,60 mm); barra na posição dentro da elevação e estribo = média (0,38); contorno do concreto = fina (0,20–0,21); cotas e chamadas = finíssima.",
    "Barras longitudinais desenhadas DENTRO da elevação (traço médio, com a quantidade por trecho '2 Ø 16') e REPETIDAS FORA, desdobradas e cotadas: superiores/negativas acima da elevação, inferiores/positivas abaixo; reto escrito em cima, dobras escritas ao lado das pernas, notação embaixo.",
    "Título do elemento = nome grande + seção pequena ao lado ('V223 20/40'), SEM sublinhado; a seção b/h é repetida sobre cada vão, junto da seta de corte.",
    "Cortes 'Corte A', 'Corte B' à direita da elevação, alinhados pelo topo; estribo desenhado aberto logo abaixo do seu corte, cotado, com a notação embaixo.",
    "TABELA ÚNICA de aço na coluna da direita, agrupada por elemento (linha de título com o nome), e RESUMO AÇO CA 50-60 por bitola com 'Peso Total 50A = … kg' e 'Volume de Concreto = … m3' — SEM '+10%' (perda é do orçamento, não do desenho).",
    "Letra monolinha (traço único) fina, espaçada: romans.shx no DWG, RomanS TTF no PDF/SVG.",
    "Cotas em centímetros; níveis em metros com 2 casas e 'm' ('103,35m') sobre o triângulo.",
    "Numeração das posições (N1, N2…) por elemento, na ordem do TQS (barras longitudinais de cima para baixo, depois estribos e pele); barra igual na mesma peça = mesmo número.",
    "Notas gerais em toda prancha de armação, em blocos 'NOTAS' e 'NORMAS UTILIZADAS' acima do carimbo."
   ],
   "penas_mm": [
    0.09,
    0.13,
    0.18,
    0.25,
    0.35,
    0.5,
    0.6,
    0.7
   ],
   "cor_pena_ctb": {
    "1": {
     "cor": "vermelho",
     "pena": 0.13,
     "uso": "cotas, eixos, linhas de chamada (inclusive em leque), setas de corte, projeção dos apoios"
    },
    "2": {
     "cor": "amarelo",
     "pena": 0.18,
     "uso": "contorno do concreto na armação, ocultas/projeções, textos de barra (letra monolinha)"
    },
    "3": {
     "cor": "verde",
     "pena": 0.25,
     "uso": "concreto em vista (fôrma), texto geral"
    },
    "4": {
     "cor": "ciano",
     "pena": 0.35,
     "uso": "estribos (vista, corte e desenho do estribo), barras NA POSIÇÃO dentro da elevação, indicação de corte, títulos"
    },
    "5": {
     "cor": "azul",
     "pena": 0.5,
     "uso": "concreto cortado (fôrma), barra em seção; (até a v1.3 também as barras longitudinais — agora cor 30)"
    },
    "6": {
     "cor": "magenta",
     "pena": 0.7,
     "uso": "moldura, destaques muito fortes"
    },
    "7": {
     "cor": "branco/preto",
     "pena": 0.25,
     "uso": "textos, tabelas e CARIMBO RA (não mudar: muda o carimbo)"
    },
    "8": {
     "cor": "cinza",
     "pena": 0.13,
     "mantem_cor": true,
     "uso": "contexto (arquitetura, terreno, existente)"
    },
    "9": {
     "cor": "cinza claro",
     "pena": 0.09,
     "mantem_cor": true,
     "uso": "hachuras"
    },
    "30": {
     "cor": "laranja",
     "pena": 0.6,
     "uso": "BARRAS LONGITUDINAIS DESDOBRADAS (fora da peça), barras de laje, barras desdobradas de bloco/sapata/pilar — a linha mais grossa do desenho"
    },
    "42": {
     "cor": "dourado escuro",
     "pena": 0.18,
     "uso": "mesmo uso e mesma pena da cor 2 (v2.1, 09/10/2026: cor de TELA legível no fundo escuro do Model e no branco das folhas; a cor 2 fica no CTB para DWG antigo)"
    },
    "92": {
     "cor": "verde escuro",
     "pena": 0.25,
     "uso": "mesmo uso e mesma pena da cor 3 (v2.1, 09/10/2026: cor de TELA legível no fundo escuro do Model e no branco das folhas; a cor 3 fica no CTB para DWG antigo)"
    },
    "150": {
     "cor": "azul médio",
     "pena": 0.35,
     "uso": "mesmo uso e mesma pena da cor 4 (v2.1, 09/10/2026: cor de TELA legível no fundo escuro do Model e no branco das folhas; a cor 4 fica no CTB para DWG antigo)"
    },
    "200": {
     "cor": "violeta",
     "pena": 0.5,
     "uso": "mesmo uso e mesma pena da cor 5 (v2.1, 09/10/2026: cor de TELA legível no fundo escuro do Model e no branco das folhas; a cor 5 fica no CTB para DWG antigo)"
    }
   },
   "layers": [
    {
     "nome": "EST-FORMA-CORTE",
     "aci": 200,
     "tipo": "Continuous",
     "uso": "concreto cortado (planta de fôrma, cortes)",
     "aci_v2_0": 5
    },
    {
     "nome": "EST-FORMA-VISTA",
     "aci": 92,
     "tipo": "Continuous",
     "uso": "concreto em vista",
     "aci_v2_0": 3
    },
    {
     "nome": "EST-OCULTA",
     "aci": 42,
     "tipo": "TRACEJADA",
     "uso": "arestas ocultas, projeções, vigas invertidas",
     "aci_v2_0": 2
    },
    {
     "nome": "EST-ARM-CONTORNO",
     "aci": 42,
     "tipo": "Continuous",
     "uso": "contorno do concreto no desenho de armação (fino, sem cotas, SEM preenchimento)",
     "aci_v2_0": 2
    },
    {
     "nome": "EST-ARM-LONG",
     "aci": 30,
     "tipo": "Continuous",
     "uso": "barras longitudinais DESDOBRADAS fora da peça (superiores acima, inferiores abaixo) e barras de laje/bloco/sapata/pilar desdobradas. v2.0: aci 5→30 (0,60 mm, TQS nível 6)"
    },
    {
     "nome": "EST-ARM-LONG-ELEV",
     "aci": 150,
     "tipo": "Continuous",
     "uso": "barras longitudinais NA POSIÇÃO dentro da elevação da viga/pilar (TQS nível 4, 0,38 mm). Novo na v2.0",
     "aci_v2_0": 4
    },
    {
     "nome": "EST-ARM-NEG",
     "aci": 30,
     "tipo": "TRACEJADA",
     "uso": "armadura negativa de laje quando aparecer na prancha da positiva (referência); na prancha própria de negativos, ver laje.negativa. v2.0: aci 5→30"
    },
    {
     "nome": "EST-ARM-ESTRIBO",
     "aci": 150,
     "tipo": "Continuous",
     "uso": "estribos e grampos (corte e desenho do estribo)",
     "aci_v2_0": 4
    },
    {
     "nome": "EST-ARM-PELE",
     "aci": 150,
     "tipo": "TRACEJADA",
     "uso": "armadura de pele / costela (linha tracejada acompanhando a barra desdobrada)",
     "aci_v2_0": 4
    },
    {
     "nome": "EST-ARM-SECAO",
     "aci": 200,
     "tipo": "Continuous",
     "uso": "barra em seção (ponto cheio nos cortes)",
     "aci_v2_0": 5
    },
    {
     "nome": "EST-ARM-TEXTO",
     "aci": 42,
     "tipo": "Continuous",
     "uso": "notação das barras, trechos de estribo, reto e dobras (letra monolinha)",
     "aci_v2_0": 2
    },
    {
     "nome": "EST-ARM-CHAMADA",
     "aci": 1,
     "tipo": "Continuous",
     "uso": "linhas de chamada das posições (em leque nos blocos, ref. Pato Branco) e chamadas '3 Ø 16' dos cortes. Novo na v2.0"
    },
    {
     "nome": "EST-COTA",
     "aci": 1,
     "tipo": "Continuous",
     "uso": "cotas e linhas de chamada"
    },
    {
     "nome": "EST-EIXO",
     "aci": 1,
     "tipo": "TRACO-PONTO",
     "uso": "eixos, linhas de centro e PROJEÇÃO DOS APOIOS que desce da elevação pelas barras desdobradas (ref. IFAL/UFU)"
    },
    {
     "nome": "EST-CORTE-IND",
     "aci": 150,
     "tipo": "TRACO-PONTO",
     "uso": "indicação de plano de corte (setas e letras)",
     "aci_v2_0": 4
    },
    {
     "nome": "EST-NIVEL",
     "aci": 42,
     "tipo": "Continuous",
     "uso": "símbolo de nível",
     "aci_v2_0": 2
    },
    {
     "nome": "EST-HACHURA",
     "aci": 9,
     "tipo": "Continuous",
     "uso": "hachuras (lastro, solo, pilar que passa)"
    },
    {
     "nome": "EST-TEXTO",
     "aci": 7,
     "tipo": "Continuous",
     "uso": "textos e notas"
    },
    {
     "nome": "EST-TITULO",
     "aci": 150,
     "tipo": "Continuous",
     "uso": "títulos dos desenhos",
     "aci_v2_0": 4
    },
    {
     "nome": "EST-TABELA",
     "aci": 7,
     "tipo": "Continuous",
     "uso": "tabelas de aço e resumo"
    },
    {
     "nome": "EST-CONTEXTO",
     "aci": 8,
     "tipo": "Continuous",
     "uso": "arquitetura, terreno, existente"
    },
    {
     "nome": "EST-CARIMBO",
     "aci": 7,
     "tipo": "Continuous",
     "uso": "carimbo/legenda RA — NÃO MUDA na v2.0"
    },
    {
     "nome": "EST-LINHA-FINA",
     "aci": 42,
     "tipo": "Continuous",
     "uso": "linhas finas secundárias: balões de eixo, símbolos, setas",
     "aci_v2_0": 2
    },
    {
     "nome": "EST-PREENCH",
     "aci": 254,
     "tipo": "Continuous",
     "cor_verdadeira": true,
     "uso": "preenchimentos em cor verdadeira (fundo branco de tabelas, máscaras) — o CTB não altera. v2.0: NÃO usar para pintar concreto (o cinza do estilo FNDE/Eberick saiu)"
    },
    {
     "nome": "EST-LIMITE",
     "aci": 150,
     "tipo": "TRACO-PONTO",
     "uso": "limites legais e de terreno (APP, divisa, recuo, faixa non aedificandi)",
     "aci_v2_0": 4
    },
    {
     "nome": "EST-VIEWPORT",
     "aci": 9,
     "tipo": "Continuous",
     "plota": false,
     "uso": "molduras de viewport (não plota)"
    }
   ],
   "tipos_de_linha": {
    "TRACEJADA": {
     "padrao_mm": [
      3,
      -1.5
     ],
     "nbr8403": "linha tracejada — arestas/contornos não visíveis"
    },
    "TRACO-PONTO": {
     "padrao_mm": [
      9.6,
      -1.6,
      0,
      -1.6
     ],
     "nbr8403": "linha traço-ponto fina — eixos; grossa — planos de corte"
    }
   },
   "textos": {
    "fonte": "romans.shx (DWG/AutoCAD) · RomanS TTF = C:\\Windows\\Fonts\\romans__.ttf (PDF/SVG do motor). Antes (v1.3): Arial.",
    "fonte_dwg": "romans.shx — traço único, nativo do AutoCAD 2026 (Fonts\\romans.shx), já usado pelo CYPE (estilo CYPETXT_romans) e presente no PDF de pilares da referência. Estilo de texto 'RA_TQS': romans.shx, altura 0 (variável), fator de largura 1,0, oblíquo 0.",
    "fonte_ttf": "RomanS (romans__.ttf, instalada em C:\\Windows\\Fonts com o AutoCAD) para o que o motor gera em SVG/PDF; se o renderizador não aceitar, isocpeur.ttf (ISOCPEUR, também em C:\\Windows\\Fonts).",
    "fonte_tabela": "a mesma RomanS; a tabela de aço do TQS exportado sai em fonte monoespaçada (Lucida Console = lucon.ttf nos PDFs Pato Branco/UFU p.105). Usar Lucida Console só se a coluna de números desalinhar na 1ª prancha.",
    "espacamento": "TQS nativo é monoespaçado: passo entre caracteres ≈ 1,0–1,2 × altura da maiúscula (medido na prévia 13, 'V101' e 'Corte A'). romans.shx é proporcional: no DWG usar MTEXT com tracking (\\T) — fator a definir na 1ª prancha (pendência), começando em \\T1.2; no SVG, letter-spacing equivalente.",
    "alturas_plotadas_mm": {
     "titulo_desenho": 4.2,
     "escala_sob_titulo": 3,
     "nome_viga_pilar": 8.5,
     "secao_ao_lado_do_nome": 3.8,
     "notacao_barra": 2.5,
     "cota": 2.5,
     "nota": 2.5,
     "tabela": 2.5,
     "letra_corte": 3.4,
     "balao_eixo": 3,
     "notacao_estribo_trecho": 2.1,
     "nome_apoio": 3.2,
     "tabela_cabecalho": 3.1,
     "titulo_pilar_lance": 5,
     "nivel": 3.8,
     "titulo_bloco_sapata": 6,
     "titulo_quadro": 7.5
    },
    "titulo": "SEM sublinhado. Viga: nome grande + seção b/h em cm menor ao lado, alinhados pela base ('V223 20/40'), acima e à esquerda da elevação; sem escala sob o nome (a escala vai no carimbo). Vistas: 'Corte A', 'Corte B' (maiúscula só na inicial) sobre o corte. Bloco/sapata: nome + linhas '(CÁLICE RUGOSO)', '(ESCALA 1:25)' embaixo (Pato Branco/Unipar); vistas 'PLANTA', 'CORTE A-A', 'CORTE B-B' em maiúsculas. Pilar: 'P1 Lance 2' / 'P2 Lances 2 a 4' no topo da coluna do pilar, escala '1:25' no pé. Laje: título da folha 'PRIMEIRO PAVIMENTO - ARMADURA POSITIVA' + 'ESCALA 1:50' no canto superior esquerdo; nome da laje 'L301' + 'h=12' no centro da laje.",
    "titulo_v13": "(até 1.3) sublinhado; à esquerda, abaixo do desenho; ex.: 'V509 19/75' — SUBSTITUÍDO pela regra 'titulo' acima"
   },
   "cotas": {
    "unidade": "cm",
    "casas": 0,
    "terminal": "PONTO CHEIO nas cotas de trecho (estribos, negativos) — TQS (prévias 12 e 13); traço curto nas cotas de fôrma de bloco/sapata (prévia 15/10). Diâmetro do ponto ≈ 0,5 × altura da maiúscula da notação (prévia 13) — conferir na 1ª prancha. (v1.3: traço oblíquo 45°)",
    "texto": "acima da linha, alinhado; em cota vertical, girado 90° lendo de baixo para cima",
    "extensao_alem_da_cota_mm": 1.5,
    "afastamento_da_origem_mm": 1,
    "cotas_por_peca": "barra desdobrada: SEM linha de cota — o reto é escrito acima do trecho reto e cada dobra escrita ao lado da perna (girada 90°); estribo desenhado: altura e largura internas escritas ao lado, gancho em itálico na ponta (prévia 12: '34' e '14'); trecho de estribo: linha de cota com pontos nos limites, '22 Ø 6.3 C/20' em cima e 'N4 (438)' embaixo; fôrma de bloco/sapata: cotas totais e parciais (Pato Branco).",
    "niveis": "em metros, 2 casas com vírgula e 'm' ('103,35m') sobre triângulo; cota de arrasamento 'C.A.=98,10' nos blocos; 'EL. 752,25m' aceito (Pato Branco)"
   },
   "notacao": {
    "barra": "{q} N{pos} Ø {bit} C={comp}",
    "barra_exemplo": "2 N1 Ø 16 C=1023",
    "barra_longa": "em barra longa o 'C=' pode descer para a 2ª linha centrada",
    "bitola": "sem zeros inúteis, ponto decimal: 5, 6.3, 8, 10, 12.5, 16, 20, 25 (formato %g). Espaço entre Ø e a bitola. (v1.2 FNDE 'ø10.0' DESCONTINUADO)",
    "estribo": "{q} N{pos} Ø {bit} C={comp}",
    "estribo_exemplo": "46 N4 Ø 6.3 C=112",
    "estribo_nota": "na VIGA o estribo desenhado leva só quantidade total, posição, bitola e comprimento — o espaçamento vai nos trechos da elevação. v1.3 tinha 'C/{esp}' aqui: agora em 'estribo_pilar'.",
    "estribo_pilar": "{q} N{pos} Ø {bit} C/{esp} C={comp}",
    "estribo_pilar_exemplo": "29 N7 Ø 6.3 C/12 C=150",
    "grampo_pilar": "{n}x{q} N{pos} Ø {bit} C/{esp}",
    "grampo_pilar_exemplo": "2x29 N8 Ø 6.3 C/12",
    "estribo_trecho_na_elevacao": "{q} Ø {bit} C/{esp}\nN{pos} ({comp_trecho})",
    "estribo_trecho_exemplo": "22 Ø 6.3 C/20 / N4 (438) — 1ª linha acima da linha de cota do trecho, 2ª abaixo",
    "barra_na_elevacao": "{q} Ø {bit}",
    "barra_na_elevacao_exemplo": "2 Ø 16 (sobre a barra superior em cada trecho) / 3 Ø 12.5 (sob a inferior)",
    "pele": "(costela)\n{q}x{n} N{pos} Ø {bit} C={comp}",
    "pele_exemplo": "(costela) / 2x3 N8 Ø 5 C=878",
    "segunda_camada": "({q} Ø 2aCAM)",
    "segunda_camada_exemplo": "(1 Ø 2aCAM) — escrito ao lado do reto da barra que vai na 2ª camada",
    "secao": "{q} Ø {bit} com chamada até a barra no corte",
    "secao_exemplo": "3 Ø 16",
    "laje": "{q} N{pos} Ø {bit} C/{esp} C={comp}",
    "laje_nota": "faixa de barras = UMA linha representativa com ganchos nas pontas; reto escrito sob a linha e ganchos nas pontas ('16 | 674 | 16'); notação paralela à barra",
    "malha_bloco_sapata": "{q} N{pos} Ø {bit} C/{esp} C={comp}",
    "malha_exemplo": "14 N1 Ø 10 C/11 C=168 (Unipar) · 2x3 N17 Ø 10 C/4 C=667 (Pato Branco)",
    "comprimento_variavel": "C=VAR (Pato Branco, barras de cálice)",
    "secao_viga": "{b}/{h}",
    "secao_viga_exemplo": "20/40 — ao lado do nome e repetida sobre cada vão junto da seta de corte",
    "regras": [
     "comprimento RETIFICADO em cm (soma das dobras)",
     "reto e dobras escritos no desenho da barra desdobrada",
     "ganchos e dobras pela NBR 6118 (diâmetro de dobramento); quadro 'DOBRAS E DIST. ENTRE BARRAS' quando a prancha tiver pilares",
     "posições numeradas por elemento; barra igual na mesma peça = mesmo número",
     "estribo desenhado à parte, aberto, com as medidas internas e o gancho",
     "Ø com espaço antes da bitola; bitola em %g"
    ]
   },
   "escalas": {
    "planta_forma": "1:50",
    "corte_forma": "1:50",
    "planta_locacao": "1:50",
    "viga_elevacao": "1:50 no comprimento. A altura da viga no PDF de referência mede ~17 mm para 40 cm (≈1:25) — possível escala vertical diferenciada do TQS: CONFERIR na 1ª prancha antes de adotar.",
    "corte_viga": "1:25",
    "pilar_secao": "1:25; UFU usa 1:20",
    "pilar_elevacao": "1:25 no comprimento do lance; UFU 1:35",
    "bloco_sapata": "1:25",
    "laje_armacao": "1:50",
    "estribo": "sem escala (cotado)",
    "detalhe": "1:10",
    "isometrico": "sem escala"
   },
   "hachuras": {
    "concreto_em_corte_na_forma": "ANSI31 fino (EST-HACHURA), ou cinza 20% liso",
    "concreto_na_armacao": "SEM hachura e SEM preenchimento. O verde da seção é só a tela do TQS; o cinza do 'estilo FNDE' (Eberick) saiu na v2.0",
    "solo": "EARTH",
    "lastro_brita": "pontos/GRAVEL",
    "lastro_concreto_magro": "faixa hachurada em 45° sob o bloco/sapata, com o rótulo 'LASTRO DE CONCRETO MAGRO'",
    "madeira": "veio (WOOD)",
    "pilar_que_passa": "hachura 45° no quadro do pilar; pilar que nasce = em branco; pilar que morre = cheio preto",
    "laje_acima_do_nivel_geral": "45° para a direita, fina e espaçada",
    "laje_abaixo_do_nivel_geral": "45° para a esquerda"
   },
   "tabelas": {
    "por_elemento": [
     "AÇO",
     "POS",
     "BIT (mm)",
     "QUANT",
     "COMPRIMENTO UNIT (cm)",
     "COMPRIMENTO TOTAL (cm)"
    ],
    "por_elemento_layout": "TABELA ÚNICA por folha, no topo da coluna da direita. Cabeçalho em 2 linhas: 'COMPRIMENTO' sobre 'UNIT' e 'TOTAL', unidades '(mm)'/'(cm)' na 3ª linha. Cada elemento abre com uma linha de título só com o nome (V222, P1 Lance 2, pav1 - Armadura positiva) e as posições em ordem. ELEMENTO deixou de ser coluna (v1.3 tinha). Ref.: prévia 12, prévia 03.",
    "aco_codigo": "50A = CA-50 nervurado; 60B = CA-60; Unipar usa 60A. RA adota 50A / 60B.",
    "resumo": [
     "AÇO",
     "BIT (mm)",
     "COMPR (m)",
     "PESO (kg)"
    ],
    "resumo_titulo": "RESUMO AÇO CA 50-60",
    "resumo_nota": "uma linha por aço+bitola; peso em kg inteiro; SEM coluna '+10%' (v1.3 tinha 'PESO +10% (kg)'). A perda de aço continua no orçamento/quantitativo, NUNCA no desenho.",
    "rodape_resumo": [
     "Peso Total 50A = … kg",
     "Peso Total 60B = … kg",
     "Volume de Concreto = … m3",
     "Área de Forma = … m2"
    ],
    "tabela_volume_forma_bloco": [
     "Pavimento",
     "Quant",
     "Volume m3",
     "Área de forma m2"
    ],
    "tabela_volume_forma_bloco_nota": "junto de cada bloco (Pato Branco prévia 15): linha do bloco + linha TOTAIS (quantidade de blocos iguais × volume)",
    "massa_linear_kg_m": {
     "5.0": 0.154,
     "6.3": 0.245,
     "8.0": 0.395,
     "10.0": 0.617,
     "12.5": 0.963,
     "16.0": 1.578,
     "20.0": 2.466,
     "25.0": 3.853,
     "32.0": 6.313
    },
    "massa_fonte": "NBR 7480 (massa nominal = π·d²/4 × 7850 kg/m³)"
   },
   "prancha": {
    "formato_padrao": "A1 (594×841) horizontal; A0 quando a planta pedir",
    "margens_mm": {
     "esquerda": 20,
     "direita": 10,
     "superior": 10,
     "inferior": 10
    },
    "legenda": "carimbo RA no canto inferior direito — EXATAMENTE o atual (ver chave 'carimbo')",
    "organizacao": [
     "VIGAS: uma viga por faixa horizontal, elevação a partir da esquerda; título 'V223 20/40' acima; negativos/superiores desdobrados acima da elevação e positivos/inferiores abaixo; projeção dos apoios descendo pelas barras; cortes 'Corte A/B' à direita da elevação alinhados pelo topo, estribo desenhado abaixo do corte; viga contínua longa pode ocupar a largura toda.",
     "PILARES: uma coluna vertical por pilar dentro de um quadro, título 'P2 Lances 2 a 4' no topo, níveis em m à esquerda, seção + estribo + grampos em cada lance, barras longitudinais verticais com a notação na vertical, arranque com a dobra cotada no pé; legenda passa/nasce/morre, 'DET. DOS GANCHOS' e 'DOBRAS E DIST. ENTRE BARRAS' abaixo da tabela.",
     "LAJES: planta da laje inteira em 1:50, uma prancha para POSITIVA e outra para NEGATIVA; título da folha no canto superior esquerdo; 'NOTAS' e 'NORMAS UTILIZADAS' em colunas à direita da planta.",
     "BLOCOS (Pato Branco prévia 15): por bloco, faixa com FÔRMA (planta + corte A-A + corte B-B, cotados) à esquerda e ARMADURA (planta + corte A-A + corte B-B, chamadas em leque) à direita, barras desdobradas ao lado; tabela de volume/fôrma sob a fôrma.",
     "SAPATAS (Unipar prévia 10): por sapata, planta com a fôrma cotada e uma barra representativa por direção, corte lateral à direita e corte frontal abaixo, barras desdobradas sob o corte; 'PREVER ARRANQUES'.",
     "tabela única de aço + resumo no topo da coluna da direita; notas acima do carimbo (Pato Branco/IFAL)",
     "respiro mínimo de 15 mm entre desenhos; nada encostando na moldura"
    ],
    "pranchas_por_tipo": [
     "FÔRMA — planta de locação/fôrma e cortes de fôrma",
     "ARMAÇÃO DAS VIGAS (n folhas)",
     "ARMAÇÃO DOS PILARES",
     "ARMAÇÃO DAS LAJES — ARMADURA POSITIVA",
     "ARMAÇÃO DAS LAJES — ARMADURA NEGATIVA",
     "FÔRMA E ARMAÇÃO DOS BLOCOS / SAPATAS",
     "ARMAÇÃO DAS VIGAS BALDRAME"
    ],
    "codigo_prancha": "FORMATO DO ESCRITÓRIO (RA), o que já sai no carimbo: código-base da obra + revisão + número da folha. O TQS usa EDI-PAV-VIG-004-R00 e a referência 'S - 04/32' — NÃO adotar: o código é campo do carimbo RA. O tipo da prancha vai escrito no campo 'CONTEÚDO DA PRANCHA' (ex.: 'ARMAÇÃO DAS VIGAS — 1/2').",
    "jogos": {
     "forma": [
      "planta de locação",
      "planta de fôrma",
      "cortes de fôrma",
      "detalhes de fôrma"
     ],
     "armacao": [
      "vigas (elevação + barras desdobradas + cortes + estribos)",
      "pilares (coluna por lance)",
      "blocos/sapatas (fôrma + armadura lado a lado)",
      "lajes positivas",
      "lajes negativas",
      "vigas baldrame"
     ]
    },
    "organizacao_folha": {
     "regra": "desenhos ENCOSTADOS À DIREITA, a 15–30 mm da coluna de notas/tabelas (borda direita ≈ 610 mm do papel A1); folhas de vigas com ~35 mm entre uma viga (com título) e a próxima e topo a ~40 mm; folhas de blocos/pilaretes com o conjunto centrado na altura; planta de fôrma no meio da folha com o corte abaixo. Nunca mudar escala nem tamanho de janela para organizar.",
     "v2_tqs": "Continua valendo onde não contraria o TQS: no TQS a elevação começa à esquerda e o conjunto viga + cortes + estribos termina junto da coluna da tabela (o que equivale a 'encostar à direita'). Os ~35 mm entre vigas continuam. Conferir na 1ª prancha v2.0.",
     "implementacao": "projeto_fundacao_concreto_V18/organizar_folha.py (Folha.add/emitir); medição: plotar_dwg_editado.py --levantar"
    }
   },
   "conteudo_minimo": {
    "planta_forma": [
     "locação dos pilares/pilaretes",
     "numeração de pilares, vigas, lajes",
     "seções b×h",
     "distâncias face a face",
     "espessura e nível das lajes",
     "furos, aberturas, rebaixos",
     "planos de corte"
    ],
    "viga": [
     "título 'Vnnn b/h' sem sublinhado",
     "elevação com apoios nomeados e barras na posição com quantidade por trecho",
     "trechos de estribos '{q} Ø {b} C/{s}' / 'N{pos} ({trecho})'",
     "barras desdobradas fora da viga (superiores acima, inferiores abaixo) com reto, dobras e notação",
     "seção b/h sobre cada vão + setas de corte",
     "cortes com barras e chamadas '3 Ø 16'",
     "estribo desenhado e cotado com '{q} N{pos} Ø {b} C={c}'",
     "pele '(costela)' e '(1 Ø 2aCAM)' quando houver"
    ],
    "bloco_estaca": [
     "título com nome, blocos iguais, tipo e '(ESCALA 1:25)'",
     "fôrma: planta, corte A-A, corte B-B cotados, níveis e arrasamento",
     "armadura: planta, corte A-A, corte B-B com chamadas em leque",
     "arranque do pilar",
     "barras desdobradas com notação",
     "embutimento e arrasamento da estaca",
     "lastro",
     "tabela volume/fôrma + TOTAIS"
    ],
    "sapata": [
     "planta com fôrma cotada e barra representativa por direção",
     "cortes lateral e frontal",
     "barras desdobradas com ganchos",
     "lastro",
     "PREVER ARRANQUES"
    ],
    "pilar_pilarete": [
     "coluna por lance com níveis em m",
     "seção 1:25 com barras e estribos em cada trecho",
     "estribo desenhado '{q} N{pos} Ø {b} C/{s} C={c}' e grampos '{n}x{q} N{pos} …'",
     "barras longitudinais verticais com notação",
     "arranque/emenda",
     "legenda passa/nasce/morre",
     "chumbadores/insertos quando houver"
    ],
    "laje": [
     "prancha separada para positiva e negativa",
     "nome da laje + h",
     "faixa = linha única com ganchos e notação paralela",
     "reto e ganchos escritos",
     "linha de distribuição",
     "aberturas 'VAZIO' e 'BORDA LIVRE'"
    ]
   },
   "notas_gerais_padrao": [
    "Concreto: fck ≥ {fck} MPa; a/c ≤ {ac}; classe de agressividade {caa}.",
    "Cobrimento nominal: {cobrimentos} (NBR 6118, Tab. 7.2); elementos em contato com o solo conforme a mesma tabela.",
    "Aço CA-50 e CA-60 (NBR 7480).",
    "Cotas em centímetros; níveis em metros.",
    "Dobramentos, ganchos, ancoragens e emendas conforme NBR 6118.",
    "Usar espaçadores plásticos ou de argamassa que garantam o cobrimento.",
    "Comprimentos retificados; conferir as medidas na obra antes do corte.",
    "Não emendar barras fora das posições indicadas sem consulta ao projetista."
   ],
   "checklist_conferencia": [
    "toda barra tem notação completa no formato TQS (q, N, Ø b, C)",
    "toda posição aparece na tabela única e a tabela fecha com o desenho",
    "resumo do aço confere com a soma da tabela e NÃO tem '+10%'",
    "cortes indicados na elevação existem desenhados, com o estribo embaixo",
    "seção b/h sobre cada vão",
    "concreto sem preenchimento cinza; P&B na plotagem",
    "letra romans (DWG) / RomanS (PDF); alturas do padrão v2.0",
    "uma prancha por tipo (vigas, pilares, laje positiva, laje negativa, blocos/sapatas, baldrames, fôrma)",
    "nenhum texto sobre linha ou sobre outro texto",
    "escalas declaradas = escalas reais das viewports",
    "penas por layer conforme este padrão (CTB RA_Estrutural, com a cor 30)",
    "notas gerais preenchidas (fck, CAA, cobrimentos) e normas com edição vigente",
    "carimbo RA IDÊNTICO ao da última emissão (RA Engenharia, RT, ART, revisão)"
   ]
  };

  var CAMPOS = ["versao", "principios", "penas_mm", "cor_pena_ctb", "layers", "tipos_de_linha", "textos", "cotas", "notacao", "escalas", "hachuras", "tabelas", "prancha", "conteudo_minimo", "notas_gerais_padrao", "checklist_conferencia"];
  var UNIDADES = { cm: 1, m: 1, mm: 1 };
  var CHAVE = "padraoDetalhamento";

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, d) { var n = +v; return isFinite(n) ? n : d; }
  function limita(v, a, b, d) { var n = num(v, d); return Math.max(a, Math.min(b, n)); }

  function padraoRA() { return clone(PADRAO_RA); }

  /* padrão salvo ou importado → completo e válido. Campo que falta vem do
     Padrão RA; pena fora de 0,05–2 mm e texto fora de 1–10 mm voltam ao valor
     do Padrão RA (um número digitado errado não pode apagar a linha da folha) */
  function normPadrao(p) {
    var base = padraoRA(), o = {};
    CAMPOS.forEach(function (k) { o[k] = (p && p[k] != null && typeof p[k] === typeof base[k]) ? clone(p[k]) : base[k]; });
    Object.keys(base.cor_pena_ctb).forEach(function (aci) {
      var b = base.cor_pena_ctb[aci], c = o.cor_pena_ctb[aci];
      if (!c || typeof c !== "object") { o.cor_pena_ctb[aci] = clone(b); return; }
      var pe = num(c.pena, NaN);
      c.pena = (pe >= 0.05 && pe <= 2) ? Math.round(pe * 100) / 100 : b.pena;
    });
    var al = o.textos && o.textos.alturas_plotadas_mm, alb = base.textos.alturas_plotadas_mm;
    if (!al || typeof al !== "object") o.textos.alturas_plotadas_mm = al = clone(alb);
    Object.keys(alb).forEach(function (k) { var v = num(al[k], NaN); al[k] = (v >= 1 && v <= 10) ? v : alb[k]; });
    if (!UNIDADES[o.cotas.unidade]) o.cotas.unidade = base.cotas.unidade;
    o.cotas.casas = Math.round(limita(o.cotas.casas, 0, 3, base.cotas.casas));
    ["barra", "estribo"].forEach(function (k) { if (typeof o.notacao[k] !== "string" || o.notacao[k].indexOf("{") < 0) o.notacao[k] = base.notacao[k]; });
    if (!o.layers || !o.layers.length) o.layers = base.layers;
    return o;
  }

  /* JSON da empresa (ou o padrao_detalhamento_ra.json inteiro, com decisão,
     referências e histórico) → só os campos técnicos, normalizados */
  function importarJSON(texto) {
    var d = typeof texto === "string" ? JSON.parse(texto) : texto;
    if (!d || typeof d !== "object" || !d.layers || !d.cor_pena_ctb) throw new Error("O arquivo não é um padrão de detalhamento (faltam layers e penas).");
    return normPadrao(d);
  }
  function exportarJSON(p) { return JSON.stringify(normPadrao(p), null, 1); }

  /* ----------------------------------------------------------- layers */
  function layerDe(p, nome) {
    var ls = (p && p.layers) || PADRAO_RA.layers;
    for (var i = 0; i < ls.length; i++) if (ls[i].nome === nome) return ls[i];
    return null;
  }
  /* traço do layer: espessura de pena (mm de papel), tracejado SVG e cor da tela */
  function linhaDe(p, nome) {
    var P = normPadrao(p), l = layerDe(P, nome);
    if (!l) return null;
    var cp = P.cor_pena_ctb[String(l.aci)] || {}, tl = P.tipos_de_linha[l.tipo];
    var dash = tl ? tl.padrao_mm.map(function (v) { return v === 0 ? 0.4 : Math.abs(v); }).join(" ") : null;
    return { layer: l.nome, aci: l.aci, mm: num(cp.pena, 0.25), dash: dash, cor: cp.cor || "", plota: l.plota !== false };
  }

  /* ----------------------------------------------------------- notação */
  /* 12.5 → "12.5", 10 → "10", 6.3 → "6.3" (ponto, como na notação de armadura) */
  function fmtBit(v) { var n = Math.round(num(v, 0) * 10) / 10; return n % 1 ? n.toFixed(1) : String(n); }
  function fmtBitola(bit) { return "Ø " + fmtBit(bit); }   /* v2 (TQS): espaço entre o Ø e a bitola — "Ø 12.5" */
  function preencher(fmt, d) { return String(fmt).replace(/\{(\w+)\}/g, function (_, k) { return d[k] == null ? "" : String(d[k]); }); }
  function fmtBarra(p, b) {
    var n = normPadrao(p).notacao;
    return preencher(n.barra, { q: b.q, pos: b.pos, bit: fmtBit(b.bit), comp: Math.round(num(b.comp, 0)) });
  }
  function fmtEstribo(p, b) {
    var n = normPadrao(p).notacao;
    return preencher(n.estribo, { q: b.q, pos: b.pos, bit: fmtBit(b.bit), esp: fmtBit(b.esp), comp: Math.round(num(b.comp, 0)) });
  }

  /* ----------------------------------------------------------- aço */
  /* massa nominal (kg/m) da tabela do padrão; bitola fora dela: π·d²/4 × 7850 */
  function massaLinear(p, bit) {
    var t = normPadrao(p).tabelas.massa_linear_kg_m, b = num(bit, 0);
    var ks = Object.keys(t);
    for (var i = 0; i < ks.length; i++) if (Math.abs(+ks[i] - b) < 1e-6) return +t[ks[i]];
    return Math.round(Math.PI * Math.pow(b / 1000, 2) / 4 * 7850 * 1000) / 1000;
  }
  /* barras [{aco, bit, q, comp (cm)}] → resumo por aço e bitola: comprimento (m), peso, peso + perda */
  function resumoAco(p, barras, perda) {
    var pr = perda == null ? 0.10 : num(perda, 0.10), mapa = {}, linhas = [], tot = {};
    (barras || []).forEach(function (b) {
      var aco = b.aco || "CA-50", bit = num(b.bit, 0), k = aco + "|" + bit;
      var m = mapa[k] || (mapa[k] = { aco: aco, bit: bit, compr_m: 0 });
      m.compr_m += num(b.q, 0) * num(b.comp, 0) / 100;
    });
    Object.keys(mapa).forEach(function (k) {
      var m = mapa[k];
      m.compr_m = Math.round(m.compr_m * 100) / 100;
      m.peso_kg = Math.round(m.compr_m * massaLinear(p, m.bit) * 10) / 10;
      m.peso_perda_kg = Math.round(m.peso_kg * (1 + pr) * 10) / 10;
      tot[m.aco] = Math.round(((tot[m.aco] || 0) + m.peso_perda_kg) * 10) / 10;
      linhas.push(m);
    });
    linhas.sort(function (a, b) { return a.aco < b.aco ? -1 : a.aco > b.aco ? 1 : a.bit - b.bit; });
    return { linhas: linhas, totais_com_perda: tot, perda: pr };
  }

  /* ----------------------------------------------------------- vistas 2D */
  /* padrão → estilo de vista do js/desenho2d.js (cota, unidade, texto, escala) */
  function estilo2D(p) {
    var P = normPadrao(p), esc = parseInt(String(P.escalas.planta_forma).split(":")[1], 10);
    /* as vistas 2D do modelo são de FÔRMA (planta, corte, elevação): na v2 o terminal de fôrma é o "traço
       curto" (o ponto cheio é das cotas de trecho da armação) — o texto do padrão diz os dois */
    var term = String(P.cotas.terminal);
    var marca = /tra[cç]o (curto|obl[ií]quo)|obl[ií]quo|tick/i.test(term) ? "obliquo" : (/seta/i.test(term) ? "seta" : "ponto");
    return { escala: esc > 0 ? esc : 50, pena: "media", preenchimento: "hachura", cotas: true, cotaParcial: true, marcaCota: marca,
             textoCota: P.textos.alturas_plotadas_mm.cota, unidade: P.cotas.unidade, casas: P.cotas.casas, niveis: true, marcasCorte: true, titulo: true };
  }

  /* ----------------------------------------------------------- amostra */
  /* viga de amostra (elevação + corte) desenhada COM o padrão, em mm de papel —
     é o que a tela de configuração mostra para a pessoa ver o efeito da mudança */
  function amostraSVG(p) {
    var P = normPadrao(p), at = P.textos.alturas_plotadas_mm;
    function tr(nome, extra) {
      var l = linhaDe(P, nome) || { mm: 0.25, dash: null };
      return ' stroke="#111" fill="none" stroke-width="' + l.mm + '"' + (l.dash ? ' stroke-dasharray="' + l.dash + '"' : "") + (extra || "");
    }
    function tx(x, y, t, h, anc, peso) {
      return '<text x="' + x + '" y="' + y + '" font-family="RomanS, ISOCPEUR, Arial" font-size="' + h + '" text-anchor="' + (anc || "start") + '"' + (peso ? ' font-weight="bold"' : "") + ">" + esc(t) + "</text>";
    }
    var s = [];
    s.push('<line x1="4" y1="34" x2="126" y2="34"' + tr("EST-EIXO") + "/>");
    s.push('<rect x="10" y="26" width="110" height="16"' + tr("EST-ARM-CONTORNO") + "/>");
    s.push('<polyline points="12,12 12,8 118,8 118,12"' + tr("EST-ARM-LONG") + "/>");
    s.push(tx(65, 6, fmtBarra(P, { q: 2, pos: 1, bit: 10, comp: 486 }), at.notacao_barra, "middle"));
    s.push('<polyline points="12,52 12,56 118,56 118,52"' + tr("EST-ARM-LONG") + "/>");
    s.push(tx(65, 61.5, fmtBarra(P, { q: 3, pos: 2, bit: 12.5, comp: 494 }), at.notacao_barra, "middle"));
    for (var x = 16; x <= 114; x += 7) s.push('<line x1="' + x + '" y1="27.5" x2="' + x + '" y2="40.5"' + tr("EST-ARM-ESTRIBO") + "/>");
    s.push(tx(65, 23.5, fmtEstribo(P, { q: 15, pos: 3, bit: 5, esp: 15, comp: 120 }), at.notacao_barra, "middle"));
    s.push('<line x1="10" y1="47" x2="120" y2="47"' + tr("EST-COTA") + "/>");
    s.push('<line x1="9" y1="48" x2="11" y2="46"' + tr("EST-COTA") + "/><line x1=\"119\" y1=\"48\" x2=\"121\" y2=\"46\"" + tr("EST-COTA") + "/>");
    s.push(tx(65, 46.2, P.cotas.unidade === "cm" ? "220" : (P.cotas.unidade === "mm" ? "2200" : "2,20"), at.cota, "middle"));
    s.push('<rect x="138" y="22" width="16" height="24"' + tr("EST-ARM-CONTORNO") + "/>");
    s.push('<rect x="140.5" y="24.5" width="11" height="19"' + tr("EST-ARM-ESTRIBO") + "/>");
    [[142, 26], [150, 26], [142, 42], [146, 42], [150, 42]].forEach(function (q) { s.push('<circle cx="' + q[0] + '" cy="' + q[1] + '" r="0.9" fill="#111"/>'); });
    s.push(tx(146, 52, "CORTE A", at.letra_corte * 0.8, "middle", true));
    /* v2: título SEM sublinhado — o nome grande e a seção ao lado, menor */
    var hn = at.nome_viga_pilar, hs = at.secao_ao_lado_do_nome || hn * 0.45;
    s.push(tx(4, 74, "V1", hn, "start", true));
    s.push(tx(4 + hn * 1.35, 74, "20/50", hs, "start"));
    s.push(tx(4, 78.6, "ESC 1:" + (estilo2D(P).escala), Math.min(at.escala_sob_titulo, 3)));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 165 80" width="100%" style="background:#fff">' + s.join("") + "</svg>";
  }
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ----------------------------------------------------------- gravação (fiação fina) */
  /* prefs da empresa, com carimbo de data: no merge com a nuvem o aparelho local vence campo a
     campo (js/nuvem.js), então o objeto vai inteiro sob uma chave só, com "em" para saber o mais novo */
  function ler(eid) {
    var S = global.Store;
    if (!S || !S.lerPrefs) return padraoRA();
    var pr = S.lerPrefs(eid) || {}, x = pr[CHAVE];
    return x && x.padrao ? normPadrao(x.padrao) : padraoRA();
  }
  function salvar(eid, p) {
    var S = global.Store;
    if (!S || !S.lerPrefs || !S.salvarPrefs) return false;
    var pr = S.lerPrefs(eid) || {};
    pr[CHAVE] = { padrao: normPadrao(p), em: Date.now() };
    S.salvarPrefs(eid, pr);
    return true;
  }
  function personalizado(eid) {
    var S = global.Store;
    if (!S || !S.lerPrefs) return false;
    var x = (S.lerPrefs(eid) || {})[CHAVE];
    return !!(x && x.padrao);
  }

  var PadraoDet = {
    CHAVE: CHAVE, CAMPOS: CAMPOS,
    padraoRA: padraoRA, normPadrao: normPadrao, importarJSON: importarJSON, exportarJSON: exportarJSON,
    layerDe: layerDe, linhaDe: linhaDe,
    fmtBitola: fmtBitola, fmtBarra: fmtBarra, fmtEstribo: fmtEstribo,
    massaLinear: massaLinear, resumoAco: resumoAco, estilo2D: estilo2D, amostraSVG: amostraSVG,
    ler: ler, salvar: salvar, personalizado: personalizado
  };
  global.PadraoDet = PadraoDet;
  if (typeof module !== "undefined" && module.exports) module.exports = PadraoDet;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

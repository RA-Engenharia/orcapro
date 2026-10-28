/* =====================================================================
 * familiasinc.js — FAMÍLIAS DE INCÊNDIO da biblioteca RA (21/10/2026): placa de sinalização, luminária de emergência e extintor.
 *
 * Todas "livres", com a ORIGEM NA FACE DA PAREDE, no piso do pavimento (y = piso) e o +Z local para DENTRO do ambiente (o mesmo jeito
 * das tomadas do js/eleauto.js). A altura é parâmetro de instância — o lançador (js/incauto.js) e o auditor (js/incauditor.js) leem dela:
 *   inc-placa       Altura_base (IT 15: 1,80 m; saída acima da porta a ≤ 0,10 m da verga), Distancia_leitura → Area_minima = L²/2000 (IT 15 Anexo A)
 *   inc-luminaria   Altura_montagem, Tensao_V (IT 13 5.5: ≤ 30 V abaixo de 2,5 m), Fluxo_lm (NBR 10898:2023 6.1.2.4 ≥ 300 lm — cópia não licenciada)
 *   inc-extintor    Altura_alca (IT 16 5.2.2.2: ≤ 1,60 m) → Base = alça − altura do extintor (≥ 0,20 m), Capacidade_extintora, Agente
 * MEDIDAS (Lote 1b, 28/10/2026 — dados-fonte/hidro/familias/fichas-1b.json traz fabricante, documento e página de cada uma):
 *   placa: dimensões pela distância de leitura (CBMMG IT 15 Anexo A Tabela 1, p.12/32, que adota a NBR 13434-2:2004) e espessura de 2 mm
 *     (SINAPI 37558); luminária: Intelbras LEA 30 (manual 01/23, p.1) e LEA 31 (datasheet); extintor: Kidde Brasil (fichas no AECweb: linhas
 *     Convencional/Mega, KB-P4ABC55 etc.); barra: NBR 9050:2020 4.6.5, 7.6.1, 7.6.3, 7.7.2.2, 7.8.1 e 7.10.2. O que o desenho completa sem cota
 *     de ficha (proporção do ombro do cilindro, pictograma da placa, fixação da barra) está marcado como desenho nos avisos da família.
 * PREÇO (regra RA: orçamento 100 %, sem "A COTAR"):
 *   - com composição SINAPI 06/2026 → o tipo leva o CÓDIGO (o preço vem da base vigente na hora da conta, js/orcmodelo.js):
 *     extintor água 10 L (101905), PQS BC 4/6/8/12 kg (101908–101911), CO2 4/6 kg (101906/101907); luminária 30 LEDs 2 W (97599).
 *   - sem composição SINAPI → Preco_unitario = o MAIOR preço público lido, marcado PROVISÓRIO ("cotar com o fornecedor"), com as fontes:
 *     extintor pó ABC 4 kg e 6 kg; placas (a SINAPI só tem o INSUMO, sem a fixação).
 * Teste: node tools/test-inc-acs.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var FR = dep("FamiliasRA", "./familiasra.js");
  if (!FR || !FR.registrar) return;
  var DATA = "2026-10-21";
  function P(nome, tipoDado, valor, grupo, descricao, escopo) { return { nome: nome, tipoDado: tipoDado, escopo: escopo || "tipo", valor: valor, grupo: grupo, descricao: descricao || "" }; }
  function F(nome, tipoDado, formula, grupo, descricao) { return { nome: nome, tipoDado: tipoDado, escopo: "instancia", formula: formula, grupo: grupo, descricao: descricao || "" }; }
  var PRECO = [
    P("Preco_unitario", "numero", 0, "Catálogo e preço", "R$ por unidade, SEM BDI — só quando o tipo não tem composição SINAPI (provisório = o maior preço público lido)"),
    P("Fonte_preco", "texto", "", "Catálogo e preço", "De onde veio o preço"),
    P("Data_preco", "texto", "", "Catálogo e preço", "Data da consulta (AAAA-MM-DD)"),
    P("Peca_catalogo", "texto", "", "Catálogo e preço", "Identificador da peça na referência de mercado"),
    P("Preco_provisorio", "simnao", false, "Catálogo e preço", "Preço provisório: cotar com o fornecedor"),
    P("Motivo_preco", "texto", "", "Catálogo e preço", "Por que o preço é provisório")
  ];
  function preco(v, pr, fonte, peca, motivo) { v.Preco_unitario = pr; v.Fonte_preco = fonte; v.Data_preco = DATA; v.Peca_catalogo = peca; v.Preco_provisorio = true; v.Motivo_preco = motivo; return v; }

  /* ------------------------------------------------------------------ PLACA */
  var MOT_PLACA = "a SINAPI 06/2026 só tem o INSUMO da placa (sem a fixação); valor = o maior preço público lido em MG para o tamanho";
  var placas = [
    { id: "saida-40x20", nome: "SAÍDA (S12) acima da porta — 0,40 × 0,20 m", v: { Codigo_simbolo: "S12", Funcao: "saida", Pictograma: 1, Largura: 0.40, Altura: 0.20, Cor: "#1b7a3a" },
      p: [27.96, "PROVISÓRIO: SINAPI MG 06/2026 insumo 37558 (placa fotoluminescente 20 × 40 cm, PVC 2 mm, NBR 16820) R$ 27,96 — o maior; SETOP-MG 08/2023 ED-50205 (S12 38 × 19 cm, com fixação) R$ 19,01", "INC-PLACA-S12-40X20"] },
    { id: "saida-26x13", nome: "SAÍDA (S12) acima da porta — 0,26 × 0,13 m (leitura até 8 m)", v: { Codigo_simbolo: "S12", Funcao: "saida", Pictograma: 1, Largura: 0.26, Altura: 0.13, Cor: "#1b7a3a" },
      p: [15.00, "PROVISÓRIO: SINAPI MG 06/2026 insumo 37539 (placa fotoluminescente 13 × 26 cm, PVC 2 mm, NBR 16820) R$ 15,00", "INC-PLACA-S12-26X13"] },
    { id: "rota-40x20", nome: "Orientação da rota (S1/S2, seta) — 0,40 × 0,20 m", v: { Codigo_simbolo: "S1/S2", Funcao: "orientacao", Pictograma: 2, Largura: 0.40, Altura: 0.20, Cor: "#1b7a3a" },
      p: [27.96, "PROVISÓRIO: SINAPI MG 06/2026 insumo 37558 (20 × 40 cm) R$ 27,96 — o maior; SETOP-MG 08/2023 ED-50202/ED-50201 (S1/S2 38 × 19 cm, com fixação) R$ 19,01", "INC-PLACA-S1-40X20"] },
    { id: "extintor-20x20", nome: "Extintor (E5) acima do equipamento — 0,20 × 0,20 m", v: { Codigo_simbolo: "E5", Funcao: "equipamento", Pictograma: 3, Largura: 0.20, Altura: 0.20, Cor: "#c62828", Vermelha: 1 },
      p: [17.35, "PROVISÓRIO: SINAPI MG 06/2026 insumo 37556 (20 × 20 cm) R$ 17,35 — o maior; SETOP-MG 08/2023 ED-50199 (E5 30 × 30 cm, com fixação) R$ 16,03", "INC-PLACA-E5-20X20"] },
    { id: "pavimento-15x15", nome: "Número do pavimento (S17) na escada — 0,15 × 0,15 m", v: { Codigo_simbolo: "S17", Funcao: "pavimento", Pictograma: 4, Largura: 0.15, Altura: 0.15, Cor: "#1b7a3a" },
      p: [11.23, "PROVISÓRIO: SETOP-MG 08/2023 ED-29411 (S17 15 × 15 cm, com fixação) R$ 11,23 — o maior; SINAPI MG 06/2026 insumo 37557 (14 × 14 cm) R$ 8,96", "INC-PLACA-S17-15X15"] },
    { id: "piso-E12", nome: "Sinalização de piso E12 (extintor em garagem/depósito) — 1,00 × 1,00 m", v: { Codigo_simbolo: "E12", Funcao: "piso", Pictograma: 5, Largura: 1.00, Altura: 1.00, Cor: "#c62828", Altura_base_padrao: 0, No_piso: 1, Vermelha: 1 },
      p: [66.71, "PROVISÓRIO: SETOP-MG 08/2023 ED-29395 (E12 instalada em piso, 100 × 100 cm, com fixação) R$ 66,71 — única referência lida (base de 2023: atualizar)", "INC-PLACA-E12"] }
  ];
  /* PICTOGRAMA (desenho esquemático, não a arte oficial da IT 15 Anexo B): 1 saída · 2 orientação · 3 equipamento · 4 pavimento · 5 piso.
     Altura/Largura da placa são as cotas; o pictograma é proporcional à ALTURA, em branco (fotoluminescente: IT 15 Anexo A notas 6 e 7). */
  var ZP = "0.001 + Espessura";   /* a face da placa: o pictograma começa aqui */
  var CY = "Altura_base + Altura/2";
  function pic(id, nome, cond, extra) { var o = { id: id, nome: nome, visivel: cond, material: "Branco", cor: "#f4f4f2" }; Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
  var VERT = "No_piso = 0 e Pictograma = ";
  var solidosPlaca = [
    { id: "placa", nome: "Placa (verde)", forma: "caixa", visivel: "Vermelha = 0", x: "0", y: "se(No_piso = 1; 0; Altura_base)", z: "se(No_piso = 1; Altura/2 + 0.05; 0.001 + Espessura/2)", dx: "Largura", dy: "se(No_piso = 1; Espessura; Altura)", dz: "se(No_piso = 1; Altura; Espessura)", material: "Branco", cor: "#1b7a3a" },
    { id: "placa-v", nome: "Placa (vermelha)", forma: "caixa", visivel: "Vermelha = 1", x: "0", y: "se(No_piso = 1; 0; Altura_base)", z: "se(No_piso = 1; Altura/2 + 0.05; 0.001 + Espessura/2)", dx: "Largura", dy: "se(No_piso = 1; Espessura; Altura)", dz: "se(No_piso = 1; Altura; Espessura)", material: "Vermelho", cor: "#c62828" },
    /* 1 saída: figura (cabeça e tronco) à esquerda e seta para a direita */
    pic("pic-saida-cabeca", "Pictograma saída: cabeça", VERT + "1", { forma: "cilindro", eixo: "z", x: "-Altura*0.55", y: CY + " + Altura*0.22", z: ZP, raio: "Altura*0.07", altura: "0.0005" }),
    pic("pic-saida-tronco", "Pictograma saída: tronco", VERT + "1", { forma: "caixa", x: "-Altura*0.55", y: CY + " - Altura*0.3", z: ZP + " + 0.00025", dx: "Altura*0.16", dy: "Altura*0.42", dz: "0.0005" }),
    pic("pic-saida-seta", "Pictograma saída: seta", VERT + "1", { forma: "extrusao", plano: "frente", x: "0", y: "0", z: ZP, altura: "0.0005",
      contorno: [["-Altura*0.2", CY + " + Altura*0.07"], ["Altura*0.35", CY + " + Altura*0.07"], ["Altura*0.35", CY + " + Altura*0.2"], ["Altura*0.65", CY], ["Altura*0.35", CY + " - Altura*0.2"], ["Altura*0.35", CY + " - Altura*0.07"], ["-Altura*0.2", CY + " - Altura*0.07"]] }),
    /* 2 orientação: seta grande, centrada */
    pic("pic-rota-seta", "Pictograma orientação: seta", VERT + "2", { forma: "extrusao", plano: "frente", x: "0", y: "0", z: ZP, altura: "0.0005",
      contorno: [["-Altura*0.7", CY + " + Altura*0.1"], ["Altura*0.2", CY + " + Altura*0.1"], ["Altura*0.2", CY + " + Altura*0.28"], ["Altura*0.7", CY], ["Altura*0.2", CY + " - Altura*0.28"], ["Altura*0.2", CY + " - Altura*0.1"], ["-Altura*0.7", CY + " - Altura*0.1"]] }),
    /* 3 equipamento (E5): silhueta do extintor (cilindro e cabeça) */
    pic("pic-ext-corpo", "Pictograma equipamento: cilindro", VERT + "3", { forma: "cilindro", eixo: "y", x: "0", y: CY + " - Altura*0.36", z: ZP, raio: "Altura*0.14", altura: "Altura*0.5" }),
    pic("pic-ext-cabeca", "Pictograma equipamento: válvula", VERT + "3", { forma: "caixa", x: "Altura*0.05", y: CY + " + Altura*0.16", z: ZP + " + 0.00025", dx: "Altura*0.3", dy: "Altura*0.1", dz: "0.0005" }),
    /* 4 pavimento (S17): o algarismo, esquematizado por uma barra */
    pic("pic-pav", "Pictograma pavimento: algarismo", VERT + "4", { forma: "caixa", x: "0", y: CY + " - Altura*0.31", z: ZP + " + 0.00025", dx: "Altura*0.14", dy: "Altura*0.62", dz: "0.0005" }),
    /* 5 piso (E12): a silhueta do extintor deitada sobre a placa de piso */
    pic("pic-piso-corpo", "Pictograma piso: cilindro", "No_piso = 1", { forma: "cilindro", eixo: "z", x: "0", y: "Espessura + Altura*0.14", z: "Altura/2 + 0.05 - Altura*0.3", raio: "Altura*0.14", altura: "Altura*0.5" })
  ];
  FR.registrar([{
    id: "inc-placa", nome: "Placa de sinalização de emergência (IT 15 CBMMG)", categoria: "equipamento", hospedagem: "livre",
    descricao: "Placa fotoluminescente de sinalização de emergência (saída, orientação, equipamento, pavimento, piso). Origem na face da parede, no piso; a placa fica com a BASE em Altura_base (IT 15: 1,80 m; a de saída acima da porta, a no máximo 0,10 m da verga). Área ≥ L²/2000 (IT 15 Anexo A); espessura 2 mm (SINAPI 37558). Dimensões pela distância de leitura (IT 15 Anexo A Tabela 1, que adota a NBR 13434-2). O pictograma é esquemático (desenho), não a arte oficial do Anexo B.",
    avisos: ["Pictograma esquemático: a arte oficial (IT 15 Anexo B / NBR 13434-2) não é desenhada; o que vale é a forma, a cor, a cota e o código do símbolo."],
    parametros: [
      P("Codigo_simbolo", "texto", "S12", "Sinalização", "Código do símbolo da IT 15 (Anexo B): S12 saída, S1/S2 orientação, E5 extintor, S17 pavimento, E12 piso"),
      P("Funcao", "texto", "saida", "Sinalização", "saida · orientacao · equipamento · pavimento · piso"),
      P("Pictograma", "inteiro", 1, "Sinalização", "Desenho do símbolo: 1 saída · 2 orientação · 3 equipamento · 4 pavimento · 5 piso"),
      P("Largura", "comprimento", 0.40, "Dimensões"), P("Altura", "comprimento", 0.20, "Dimensões"),
      P("Espessura", "comprimento", 0.002, "Dimensões", "Espessura da placa: 2 mm (SINAPI 37558/37539/37556/37557: placa fotoluminescente em PVC 2 mm, NBR 16820)"),
      P("Cor", "texto", "#1b7a3a", "Materiais", "Verde (saída/orientação) ou vermelho (equipamento), fotoluminescente"),
      P("Vermelha", "inteiro", 0, "Materiais", "1 = placa de equipamento (fundo vermelho, IT 15 Anexo B)"),
      P("Altura_base_padrao", "comprimento", 1.80, "Norma", "IT 15 6.1.1 a 6.1.4: base da placa a 1,80 m do piso (a de saída fica acima da porta)"),
      P("No_piso", "inteiro", 0, "Sinalização", "1 = sinalização de piso (E12, deitada no chão, à frente do equipamento)"),
      P("Altura_base", "comprimento", 1.80, "Restrições", "Do piso à base da placa", "instancia"),
      P("Distancia_leitura", "comprimento", 4.0, "Norma", "Distância de leitura L (m), mínimo 4 m (IT 15 Anexo A)", "instancia"),
      P("Seta", "texto", "", "Sinalização", "Placa de orientação: direita / esquerda (sentido da saída visto de frente para a placa)", "instancia"),
      P("Fotoluminescente", "simnao", true, "Sinalização", "IT 15 6.3 e), f): orientação, salvamento e equipamentos fotoluminescentes"),
      F("Area_minima", "numero", "max(Distancia_leitura; 4)^2/2000", "Norma", "A ≥ L²/2000 (m²) — IT 15 Anexo A"),
      F("Conforme", "numero", "se(Largura*Altura >= Area_minima - 0.000001; 1; 0)", "Norma", "1 se a placa tem a área mínima para a distância de leitura"),
      F("Distancia_maxima", "numero", "(2000*Largura*Altura)^0.5", "Norma", "Maior distância de leitura (m) que a placa atende: L = (2000·A)^0,5 (IT 15 Anexo A nota 1)")
    ].concat(PRECO),
    tipos: placas.map(function (t) { return { id: t.id, nome: t.nome, valores: preco(JSON.parse(JSON.stringify(t.v)), t.p[0], t.p[1], t.p[2], MOT_PLACA) }; }),
    solidos: solidosPlaca,
    quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Placa de sinalização de emergência fotoluminescente (IT 15 CBMMG)" }
  }]);

  /* ------------------------------------------------------------------ LUMINÁRIA DE EMERGÊNCIA */
  /* Lote 1b (28/10/2026): a forma e as cotas do corpo vêm da FICHA do produto, não de desenho.
       Intelbras LEA 30 — manual 01/23 (backend.intelbras.com/sites/default/files/2023-05/Manual_LEA_30_01-23_site[1].pdf), item 2, p.1:
         160 × 41 × 25,6 mm (L × A × P), 94 g, 30 LEDs autobrilho, 55 a 100 lm, autonomia 6 h (fluxo mínimo) / 3 h (máximo), bateria 3,7 Vdc 1 Ah.
       Intelbras LEA 31 — datasheet (backend.intelbras.com/sites/default/files/2024-10/Datasheet LEA31.pdf), p.1: 48 × 175 × 28 mm (L × A × P no datasheet; o manual
         dá 175 × 48 × 23,6 mm: a profundidade diverge entre as duas fontes e vale a do datasheet), 110 g, 30 LEDs, 50 a 100 lm, 4 h (mín.) / 2 h (máx.), 3,7 V 500 mAh.
     O tipo "led30-2w" (SINAPI 97599, o que o lançador usa) fica com a forma do LEA 30 e SEM fluxo declarado (a SINAPI não cita produto);
     "lea30" e "lea31" levam o fluxo e a autonomia da ficha e orçam pela MESMA composição (97599: bloco autônomo de 30 LEDs — a SINAPI não cita marca).
     LEE 304 (embutir, 15 LEDs, 300 lm, 119,8 × 84,8 × 32,5 mm), BLA 1204 C (2 faróis, 1200 lm, 195 × 173,8 × 45,8 mm) e o balizamento: fichas em
     dados-fonte/hidro/familias/fichas-1b.json, SEM tipo aqui — não há composição SINAPI nem preço público lido para eles (pendência de preço). */
  var FICHA_LUM = "Intelbras (backend.intelbras.com): ";
  FR.registrar([{
    id: "inc-luminaria", nome: "Luminária de emergência (IT 13 CBMMG)", categoria: "luminaria", hospedagem: "livre",
    descricao: "Luminária de emergência de aclaramento (bloco autônomo de 30 LEDs). Origem na face da parede, no piso; o corpo fica a Altura_montagem. IT 13: até 15 m entre pontos; abaixo de 2,5 m, ≤ 30 V. Cotas do corpo: ficha Intelbras LEA 30 / LEA 31.",
    avisos: ["Balizamento (placa luminosa de saída) e luminárias de embutir/2 faróis: sem tipo nesta família (nenhuma ficha com preço lido) — ver dados-fonte/hidro/familias/fichas-1b.json."],
    parametros: [
      P("Funcao", "texto", "aclaramento", "Elétrica", "aclaramento · balizamento"),
      P("Sistema", "texto", "bloco autonomo", "Elétrica", "bloco autônomo · centralizado"),
      P("Tensao_V", "numero", 30, "Elétrica", "Tensão nas lâmpadas (V). IT 13 5.5: ≤ 30 V abaixo de 2,5 m (ou DR 30 mA + 10 A). Bloco autônomo de LED: a bateria é de 3,7 V (ficha)"),
      P("Fluxo_lm", "numero", 0, "Fotometria", "Fluxo luminoso máximo (lm). 0 = não declarado pela base de preço (SINAPI): conferir na ficha (NBR 10898:2023 6.1.2.4: ≥ 300 lm ou estudo luminotécnico — cópia não licenciada)"),
      P("Fluxo_min_lm", "numero", 0, "Fotometria", "Fluxo luminoso mínimo (lm) da ficha; 0 = não declarado"),
      P("Autonomia_h", "numero", 0, "Elétrica", "Autonomia (h) no fluxo máximo. 0 = não declarada: conferir (NBR 10898:2023 4.9: mínimo 2 h — cópia não licenciada; a IT 13 da biblioteca (1ª ed., Portaria 5/2005) cita a NBR 10898/1999; edição adotada em MG: conferir)"),
      P("Fabricante", "texto", "", "Catálogo e preço", "Fabricante da ficha"), P("Modelo", "texto", "", "Catálogo e preço", "Modelo da ficha"),
      P("Link_ficha", "texto", "", "Catálogo e preço", "Manual ou datasheet do fabricante"), P("Pagina_ficha", "inteiro", 0, "Catálogo e preço", "Página do PDF com as cotas"),
      P("Largura", "comprimento", 0.160, "Dimensões", "Largura (L) da ficha"), P("Altura", "comprimento", 0.041, "Dimensões", "Altura (A) da ficha"), P("Profundidade", "comprimento", 0.0256, "Dimensões", "Profundidade (P) da ficha"),
      P("Altura_montagem", "comprimento", 2.30, "Restrições", "Do piso ao centro da luminária", "instancia")
    ].concat(PRECO),
    tipos: [
      { id: "led30-2w", nome: "Bloco autônomo 30 LEDs 2 W (SINAPI 97599) — forma do Intelbras LEA 30", codigo: "97599", fonte: "SINAPI 06/2026 97599 — LUMINÁRIA DE EMERGÊNCIA, COM 30 LÂMPADAS LED DE 2 W, SEM REATOR - FORNECIMENTO E INSTALAÇÃO", valores: { Fabricante: "(a SINAPI não cita marca)", Modelo: "forma do Intelbras LEA 30" } },
      { id: "lea30", nome: "Intelbras LEA 30 — 30 LEDs, 160 × 41 × 25,6 mm", codigo: "97599", fonte: "SINAPI 06/2026 97599 (composição da mesma classe: bloco autônomo de 30 LEDs; a SINAPI não cita marca) · ficha Intelbras LEA 30",
        valores: { Fabricante: "Intelbras", Modelo: "LEA 30", Link_ficha: "https://backend.intelbras.com/sites/default/files/2023-05/Manual_LEA_30_01-23_site%5B1%5D.pdf", Pagina_ficha: 1, Largura: 0.160, Altura: 0.041, Profundidade: 0.0256, Tensao_V: 3.7, Fluxo_lm: 100, Fluxo_min_lm: 55, Autonomia_h: 3 } },
      { id: "lea31", nome: "Intelbras LEA 31 — 30 LEDs, 175 × 48 × 28 mm", codigo: "97599", fonte: "SINAPI 06/2026 97599 (composição da mesma classe: bloco autônomo de 30 LEDs; a SINAPI não cita marca) · ficha Intelbras LEA 31",
        valores: { Fabricante: "Intelbras", Modelo: "LEA 31", Link_ficha: "https://backend.intelbras.com/sites/default/files/2024-10/Datasheet%20LEA31.pdf", Pagina_ficha: 1, Largura: 0.175, Altura: 0.048, Profundidade: 0.028, Tensao_V: 3.7, Fluxo_lm: 100, Fluxo_min_lm: 50, Autonomia_h: 2 } }
    ],
    solidos: [
      { id: "corpo", nome: "Corpo", forma: "caixa", x: "0", y: "Altura_montagem - Altura/2", z: "Profundidade/2", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Branco" },
      { id: "lente", nome: "Faixa de LEDs", forma: "caixa", x: "0", y: "Altura_montagem - Altura*0.25", z: "Profundidade + 0.0005", dx: "Largura*0.82", dy: "Altura*0.5", dz: "0.001", material: "Vidro" },
      { id: "teste", nome: "Botão de teste e LED de carga", forma: "cilindro", eixo: "z", x: "Largura*0.4", y: "Altura_montagem + Altura*0.3", z: "Profundidade", raio: "0.0035", altura: "0.001", material: "Vermelho" }
    ],
    quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Luminária de emergência" }
  }]);

  var MOT_ABC = "a SINAPI 06/2026 não tem composição de extintor de pó ABC; valor = o maior preço público lido";
  /* FICHAS (Lote 1b, 28/10/2026): Kidde Brasil, páginas de produto do AECweb (portal de catálogos; o fabricante publica ali as cotas):
       linha Convencional  https://www.aecweb.com.br/produto/extintor-portatil-com-carga-de-po-abc-linha-convencional/38687 (ABC KB-P4/6/8/12ABC55)
                           https://www.aecweb.com.br/produto/extintor-portatil-com-carga-de-po-bc/38681 (BC KB-P4/6/8/12BCK95)
                           https://www.aecweb.com.br/produto/extintor-portatil-com-carga-de-agua/38682 (água 10 L, sem código de modelo na página)
                           https://www.aecweb.com.br/produto/extintor-portatil-com-carga-de-co/38683 (CO2 KB-CO2-4 e KB-CO2-6)
       H = altura, D = diâmetro, M = peso bruto aproximado. As fichas dão a carga em LITROS para o pó (4 l, 6 l...) e a SINAPI em kg: a equivalência
       é de classe (4 kg ≈ 4 l), não de conversão. O tipo "abc-40b" é EXIGÊNCIA (IT 16), não produto: leva as cotas do KB-P12ABC55 (6-A:40-B:C) só como referência. */
  var AEC = "https://www.aecweb.com.br/produto/";
  var FICHA_EXT = {
    "abc4": { mod: "KB-P4ABC55", H: 0.445, D: 0.137, M: 6.1, cap: "2-A:20-B:C", url: AEC + "extintor-portatil-com-carga-de-po-abc-linha-convencional/38687" },
    "abc6-3a": { mod: "KB-P6ABC55", H: 0.590, D: 0.137, M: 8.7, cap: "3-A:20-B:C", url: AEC + "extintor-portatil-com-carga-de-po-abc-linha-convencional/38687" },
    "abc-40b": { mod: "KB-P12ABC55 (referência: 6-A:40-B:C)", H: 0.705, D: 0.177, M: 16, url: AEC + "extintor-portatil-com-carga-de-po-abc-linha-convencional/38687", referencia: true },
    "pqs4bc": { mod: "KB-P4BCK95", H: 0.445, D: 0.137, M: 6.1, cap: "20-B:C", url: AEC + "extintor-portatil-com-carga-de-po-bc/38681" },
    "pqs6bc": { mod: "KB-P6BCK95", H: 0.590, D: 0.137, M: 8.7, cap: "20-B:C", url: AEC + "extintor-portatil-com-carga-de-po-bc/38681" },
    "pqs8bc": { mod: "KB-P8BCK95", H: 0.525, D: 0.177, M: 11.5, cap: "40-B:C", url: AEC + "extintor-portatil-com-carga-de-po-bc/38681" },
    "pqs12bc": { mod: "KB-P12BCK95", H: 0.705, D: 0.177, M: 16, cap: "40-B:C", url: AEC + "extintor-portatil-com-carga-de-po-bc/38681" },
    "agua10": { mod: "Convencional, água 10 L", H: 0.685, D: 0.177, M: 14.3, cap: "2-A", url: AEC + "extintor-portatil-com-carga-de-agua/38682" },
    "co2-4": { mod: "KB-CO2-4", H: 0.470, D: 0.165, M: 14.1, cap: "5-B:C", url: AEC + "extintor-portatil-com-carga-de-co/38683", corneta: 1 },
    "co2-6": { mod: "KB-CO2-6", H: 0.620, D: 0.165, M: 19, cap: "5-B:C", url: AEC + "extintor-portatil-com-carga-de-co/38683", corneta: 1 }
  };
  function ext(id, nome, ag, carga, cap, classe, cod, fonte, extra) {
    var fk = FICHA_EXT[id];
    if (fk && fk.cap) cap = fk.cap;
    var t = { id: id, nome: nome, valores: { Agente: ag, Carga: carga, Capacidade_extintora: cap, Classe: classe } };
    if (fk) {
      t.valores.Fabricante = "Kidde Brasil"; t.valores.Modelo = fk.mod; t.valores.Link_ficha = fk.url; t.valores.Pagina_ficha = 1;
      t.valores.Diametro = fk.D; t.valores.Altura_total = fk.H; t.valores.Peso_kg = fk.M; t.valores.Corneta = fk.corneta || 0; t.valores.Ficha_referencia = !!fk.referencia;
    }
    if (cod) { t.codigo = cod; t.fonte = fonte; }
    if (extra) preco(t.valores, extra[0], extra[1], extra[2], MOT_ABC);
    return t;
  }
  FR.registrar([{
    id: "inc-extintor", nome: "Extintor portátil (IT 16 CBMMG)", categoria: "equipamento", hospedagem: "livre",
    descricao: "Extintor portátil de parede com suporte. Origem na face da parede, no piso; a ALÇA fica em Altura_alca (IT 16 5.2.2.2: ≤ 1,60 m) e a base do extintor ≥ 0,20 m do piso. Cilindro, válvula, alavanca, mangueira e suporte pelas cotas da ficha Kidde Brasil do tipo (Ø e altura); o ombro do cilindro e a mangueira são desenho.",
    avisos: ["Ombro do cilindro, alavanca, mangueira e suporte: proporções de desenho; Ø, altura e peso são da ficha do tipo. A ficha dá a carga em litros para o pó."],
    parametros: [
      P("Agente", "texto", "Pó ABC", "Extintor", "Agente extintor"),
      P("Carga", "texto", "4 kg", "Extintor", "Carga nominal"),
      P("Capacidade_extintora", "texto", "2-A:20-B:C", "Extintor", "Capacidade extintora do rótulo (IT 16 Tabela 1: mínimo pó ABC 2-A:20-B:C; pó BC 20-B:C; água 2-A; CO2 5-B:C)"),
      P("Classe", "texto", "ABC", "Extintor", "Classes de fogo"),
      P("Diametro", "comprimento", 0.137, "Dimensões", "Ø do cilindro (ficha Kidde Brasil do tipo)"),
      P("Altura_total", "comprimento", 0.445, "Dimensões", "Altura total com a válvula (ficha Kidde Brasil do tipo)"),
      P("Peso_kg", "numero", 6.1, "Dimensões", "Peso bruto aproximado (ficha)"),
      P("Corneta", "inteiro", 0, "Dimensões", "1 = com difusor/corneta (CO2)"),
      P("Fabricante", "texto", "", "Catálogo e preço", "Fabricante da ficha"), P("Modelo", "texto", "", "Catálogo e preço", "Modelo da ficha"),
      P("Link_ficha", "texto", "", "Catálogo e preço", "Página do produto no portal de catálogos"), P("Pagina_ficha", "inteiro", 0, "Catálogo e preço", "Página"),
      P("Ficha_referencia", "simnao", false, "Catálogo e preço", "As cotas são de um produto de referência (o tipo é uma exigência, não um produto)"),
      P("Altura_alca", "comprimento", 1.50, "Restrições", "Do piso à alça de manuseio (IT 16 5.2.2.2: no máximo 1,60 m; 1,50 m = critério RA)", "instancia"),
      F("Base", "comprimento", "Altura_alca - Altura_total", "Norma", "Do piso à parte de baixo do extintor (IT 16 5.2.2.2: ≥ 0,20 m)"),
      F("Conforme", "numero", "se(Altura_alca <= 1.6 + 0.000001 e Base >= 0.2 - 0.000001; 1; 0)", "Norma", "1 se a alça ≤ 1,60 m e a base ≥ 0,20 m (IT 16 5.2.2.2)")
    ].concat(PRECO),
    tipos: [
      ext("abc4", "Pó ABC 4 kg — 2-A:20-B:C", "Pó ABC", "4 kg", "2-A:20-B:C", "ABC", "", "", [352.90, "PROVISÓRIO: maior preço público lido em 21/10/2026 — varejo (Magazine Luiza, extintor pó ABC 4 kg Resil Gold 2A:20BC) R$ 352,90; IOPES-ES 05/2026 160607 (ABC 2A-20B:C 4 kg com suporte) R$ 185,71; SUDECAP-BH 04/2026 73.55.33 (ABC 4 kg 2-A:20-B:C) R$ 146,92", "INC-EXT-ABC4"]),
      ext("abc6-3a", "Pó ABC 6 kg — 3-A:20-B:C (risco médio/alto)", "Pó ABC", "6 kg", "3-A:20-B:C", "ABC", "", "", [352.90, "PROVISÓRIO: maior preço público lido para o ABC 6 kg: ORSE-SE 01511 R$ 226,94; GOINFRA 04/2026 085006 R$ 225,27 (lida em orcamentor.com, fonte secundária); SETOP-MG ED-50193 R$ 212,44; IOPES-ES 160605 R$ 198,82. Nenhum varejo de 6 kg foi lido, e o de 4 kg custa R$ 352,90 (Magazine Luiza, 21/10/2026): adotado esse piso, porque o 6 kg não custa menos que o 4 kg (incerto = preço mais alto); rótulo 3-A:20-B:C: ficha de fabricante (AECweb) — conferir no produto comprado e cotar", "INC-EXT-ABC6-3A"]),
      /* GARAGEM em risco médio/alto (revisão 27/10/2026): IT 16 Tabela 5 (PDF p.7) pede classe B 40-B (médio, 15 m; alto, 40-B a 10 m ou 80-B a 15 m).
         NENHUM produto com capacidade B declarada foi achado em fonte (SINAPI 06/2026 101908–101911 descreve só "PQS ... classe BC", sem 20-B/40-B; catálogo/INMETRO
         não lidos): por isso o tipo leva a EXIGÊNCIA (40-B) como capacidade declarada e "especificar fabricante" — o auditor emite AVISO (INC_EXT_ESPECIFICAR) enquanto
         o tipo não for trocado por um produto real. Preço = o maior preço público de extintor de pó do sistema (R$ 352,90, varejo, igual ao ABC 6 kg; o PQS 12 kg BC da
         SINAPI MG 101911 custa R$ 276,55 — menor), PROVISÓRIO: cotar com fornecedor. */
      ext("abc-40b", "Extintor classe B ≥ 40-B (especificar fabricante) — risco médio/alto em garagem", "Pó ABC", "a especificar", "3-A:40-B:C = exigência das Tabelas 4 e 5 da IT 16, não rótulo de produto — especificar fabricante", "ABC", "", "", [352.90, "PROVISÓRIO — cotar com fornecedor: maior preço público lido para extintor de pó (varejo Magazine Luiza, 21/10/2026, ABC 4 kg R$ 352,90; SINAPI MG 06/2026 101911 PQS 12 kg BC R$ 276,55 e 101910 8 kg R$ 241,93 são menores). 3-A:40-B:C = exigência das Tabelas 4 e 5 da IT 16 (Tabela 5: PDF p.7), não rótulo de produto: nenhum com 40-B declarado foi achado em fonte", "INC-EXT-ABC-40B"]),
      ext("pqs4bc", "Pó BC 4 kg (SINAPI 101908)", "Pó BC", "4 kg", "conferir no rótulo (mínimo 20-B:C)", "BC", "101908", "SINAPI 06/2026 101908 — EXTINTOR PQS 4 KG CLASSE BC"),
      ext("pqs6bc", "Pó BC 6 kg (SINAPI 101909)", "Pó BC", "6 kg", "conferir no rótulo (mínimo 20-B:C)", "BC", "101909", "SINAPI 06/2026 101909"),
      ext("pqs8bc", "Pó BC 8 kg (SINAPI 101910)", "Pó BC", "8 kg", "conferir no rótulo (mínimo 20-B:C)", "BC", "101910", "SINAPI 06/2026 101910"),
      ext("pqs12bc", "Pó BC 12 kg (SINAPI 101911)", "Pó BC", "12 kg", "conferir no rótulo (mínimo 20-B:C)", "BC", "101911", "SINAPI 06/2026 101911"),
      ext("agua10", "Água pressurizada 10 L (SINAPI 101905)", "Água", "10 L", "conferir no rótulo (mínimo 2-A)", "A", "101905", "SINAPI 06/2026 101905"),
      ext("co2-4", "CO2 4 kg (SINAPI 101906)", "CO2", "4 kg", "conferir no rótulo (mínimo 5-B:C)", "BC", "101906", "SINAPI 06/2026 101906"),
      ext("co2-6", "CO2 6 kg (SINAPI 101907)", "CO2", "6 kg", "conferir no rótulo (mínimo 5-B:C)", "BC", "101907", "SINAPI 06/2026 101907")
    ],
    solidos: [
      { id: "placa-suporte", nome: "Placa do suporte de parede", forma: "caixa", x: "0", y: "Base + Altura_total*0.45 - 0.10", z: "0.003", dx: "0.08", dy: "0.20", dz: "0.006", material: "Preto" },
      { id: "cinta", nome: "Cinta do suporte", forma: "cilindro", eixo: "y", x: "0", y: "Base + Altura_total*0.45", z: "0.02 + Diametro/2", raio: "Diametro/2 + 0.004", altura: "0.035", material: "Preto" },
      { id: "cilindro", nome: "Cilindro", forma: "revolucao", eixo: "y", x: "0", y: "Base", z: "0.02 + Diametro/2",
        perfil: [["Diametro/2*0.62", "0"], ["Diametro/2*0.9", "Altura_total*0.012"], ["Diametro/2", "Altura_total*0.05"], ["Diametro/2", "Altura_total*0.74"], ["Diametro/2*0.93", "Altura_total*0.80"], ["Diametro/2*0.55", "Altura_total*0.86"], ["Diametro/2*0.22", "Altura_total*0.88"]],
        material: "Vermelho" },
      { id: "valvula", nome: "Válvula", forma: "cilindro", eixo: "y", x: "0", y: "Base + Altura_total*0.86", z: "0.02 + Diametro/2", raio: "Diametro*0.16", altura: "Altura_total*0.1", material: "Preto" },
      { id: "alavanca", nome: "Alavanca e alça de manuseio", forma: "caixa", x: "0", y: "Base + Altura_total - 0.012", z: "0.02 + Diametro/2", dx: "0.03", dy: "0.012", dz: "Diametro*0.9", material: "Preto" },
      { id: "mangueira", nome: "Mangueira", forma: "cilindro", eixo: "y", x: "Diametro/2*0.55", y: "Base + Altura_total*0.3", z: "0.02 + Diametro/2 + Diametro/2*0.78", raio: "0.0075", altura: "Altura_total*0.56", material: "Preto" },
      { id: "corneta", nome: "Difusor (corneta) do CO2", forma: "revolucao", eixo: "y", visivel: "Corneta = 1", x: "Diametro/2*0.55", y: "Base + Altura_total*0.1", z: "0.02 + Diametro/2 + Diametro/2*0.78",
        perfil: [["0.0075", "Altura_total*0.2"], ["0.03", "0.0"], ["0.0075", "0.0"]], material: "Preto" }
    ],
    quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Extintor de incêndio portátil" }
  }]);
  /* ------------------------------------------------------------------ BARRA DE APOIO (sanitário acessível) */
  /* Revisão 27/10/2026: o "Corrigir" de "nenhum sanitário acessível" só renomeava o banheiro; as barras (NBR 9050:2020 7.7.2.2) ficavam fora do modelo e do orçamento.
     Orçamento pela composição SINAPI 06/2026 do tipo (preço da base vigente na hora da conta, js/orcmodelo.js): 100868 barra reta inox 80 cm; 100867 reta inox 70 cm;
     100863 / 100864 barra em L inox 70 × 70 / 80 × 80 cm; 100866 reta inox 60 cm (a menor da SINAPI: o tipo de 40 cm orça por ela — incerto = o mais alto).
     LOTE 1b (28/10/2026) — a forma é a da NBR 9050:2020 (texto em ABNT NBR 9050-2020, biblioteca da RA):
       4.6.5 (p.38): afastamento ≥ 40 mm da parede; seção circular de Ø 30 a 45 mm.
       7.6.1 (p.87): 40 mm entre a base de suporte (parede) e a FACE INTERNA da barra; suportes intermediários sob a empunhadura.
       7.6.3 e Figura 102: seção Ø 30 a 45 mm. 7.6.4: barras fixas retas, em "U" ou em "L".
       7.7.2.2.1 (p.90): horizontal ≥ 0,80 m a 0,75 m do piso (eixo); vertical ≥ 0,70 m a 0,10 m acima da horizontal (base a 0,85 m).
       7.8.1 e) (lavatório): vertical a 0,90 m do piso com comprimento ≥ 0,40 m. 7.10.2 e Figura 118: barra em "L" de 0,70 × 0,70 m.
     O Ø adotado (38 mm) é de PROJETO dentro da faixa da norma (a SINAPI 100867/100868 não declara o Ø; o insumo 36207 diz "diâmetro mínimo 3 cm"); a fixação
     (suporte de Ø 24 mm nas pontas) é desenho: conferir o produto comprado. */
  FR.registrar([{
    id: "acs-barra", nome: "Barra de apoio do sanitário acessível (NBR 9050)", categoria: "equipamento", hospedagem: "livre",
    descricao: "Barra de apoio de aço inox, de seção circular, afastada 40 mm da parede (face interna), fixada por suportes nas pontas (sanitário acessível). Reta ou em L. Origem na face da parede, no piso; o +Z local aponta para DENTRO do ambiente. Horizontal: eixo a Altura_eixo (0,75 m); vertical: base a Altura_eixo (0,85 m). Em L: a perna horizontal vai a +X do canto, a vertical sobe a partir do eixo. NBR 9050:2020 4.6.5, 7.6.1, 7.6.3.",
    avisos: ["Ø de projeto (38 mm) dentro da faixa 30 a 45 mm da NBR 9050:2020 4.6.5; suportes das pontas são desenho — conferir o produto."],
    parametros: [
      P("Comprimento", "comprimento", 0.80, "Dimensões", "Comprimento da barra reta, ou da perna horizontal da barra em L (NBR 9050:2020 7.7.2.2: horizontais ≥ 0,80 m; vertical ≥ 0,70 m; lavatório 7.8.1 e): vertical ≥ 0,40 m)"),
      P("Comprimento_v", "comprimento", 0, "Dimensões", "Perna vertical da barra em L (0 = barra reta); NBR 9050:2020 7.10.2: L de 0,70 × 0,70 m"),
      P("Vertical", "inteiro", 0, "Dimensões", "1 = barra vertical; 0 = horizontal"),
      P("Diametro", "comprimento", 0.038, "Dimensões", "Ø da seção (m): 30 a 45 mm — NBR 9050:2020 4.6.5, 7.6.3 e Figura 102. Valor de projeto; a SINAPI não declara"),
      P("Afastamento", "comprimento", 0.04, "Dimensões", "Da parede à FACE INTERNA da barra: ≥ 40 mm (NBR 9050:2020 4.6.5 e 7.6.1)"),
      P("Suporte_raio", "comprimento", 0.012, "Dimensões", "Raio do suporte de fixação (desenho; conferir o produto)"),
      F("Eixo_z", "comprimento", "Afastamento + Diametro/2", "Dimensões", "Da parede ao EIXO da barra"),
      F("Conforme", "numero", "se(Diametro >= 0.03 - 0.000001 e Diametro <= 0.045 + 0.000001 e Afastamento >= 0.04 - 0.000001; 1; 0)", "Norma", "1 se Ø de 30 a 45 mm e afastamento ≥ 40 mm (NBR 9050:2020 4.6.5)"),
      P("Altura_eixo", "comprimento", 0.75, "Restrições", "Do piso ao eixo da barra horizontal (0,75 m) ou à BASE da vertical (0,85 m = 0,10 m acima da horizontal) — NBR 9050:2020 7.7.2.2.1, p.90, Figuras 106 e 107, p.91-92", "instancia")
    ].concat(PRECO),
    tipos: [
      { id: "reta-80", nome: "Barra reta inox 80 cm (SINAPI 100868)", codigo: "100868", fonte: "SINAPI 06/2026 100868 — BARRA DE APOIO RETA, EM AÇO INOX POLIDO, COMPRIMENTO 80 CM, FIXADA NA PAREDE - FORNECIMENTO E INSTALAÇÃO", valores: { Comprimento: 0.80, Vertical: 0 } },
      { id: "reta-70", nome: "Barra reta inox 70 cm, vertical (SINAPI 100867)", codigo: "100867", fonte: "SINAPI 06/2026 100867 — BARRA DE APOIO RETA, EM AÇO INOX POLIDO, COMPRIMENTO 70 CM, FIXADA NA PAREDE - FORNECIMENTO E INSTALAÇÃO", valores: { Comprimento: 0.70, Vertical: 1 } },
      { id: "reta-40", nome: "Barra reta inox 40 cm, vertical do lavatório (SINAPI 100866, a de 60 cm)", codigo: "100866", fonte: "SINAPI 06/2026 100866 — BARRA DE APOIO RETA, EM AÇO INOX POLIDO, COMPRIMENTO 60 CM: a SINAPI não tem a de 40 cm; orça pela menor existente (NBR 9050:2020 7.8.1 e): vertical do lavatório ≥ 0,40 m, base a 0,90 m)", valores: { Comprimento: 0.40, Vertical: 1, Altura_eixo: 0.90 } },
      { id: "l-70", nome: "Barra em L inox 70 × 70 cm (SINAPI 100863)", codigo: "100863", fonte: "SINAPI 06/2026 100863 — BARRA DE APOIO EM \"L\", EM AÇO INOX POLIDO 70 X 70 CM, FIXADA NA PAREDE - FORNECIMENTO E INSTALAÇÃO (NBR 9050:2020 7.10.2, Figura 118)", valores: { Comprimento: 0.70, Comprimento_v: 0.70, Vertical: 0 } },
      { id: "l-80", nome: "Barra em L inox 80 × 80 cm (SINAPI 100864)", codigo: "100864", fonte: "SINAPI 06/2026 100864 — BARRA DE APOIO EM \"L\", EM AÇO INOX POLIDO 80 X 80 CM, FIXADA NA PAREDE - FORNECIMENTO E INSTALAÇÃO", valores: { Comprimento: 0.80, Comprimento_v: 0.80, Vertical: 0 } }
    ],
    solidos: [
      { id: "barra-h", nome: "Barra horizontal", forma: "cilindro", eixo: "x", visivel: "Vertical = 0", x: "-Comprimento/2 - se(Comprimento_v > 0; Diametro/2; 0)", y: "Altura_eixo", z: "Eixo_z", raio: "Diametro/2", altura: "Comprimento + se(Comprimento_v > 0; Diametro/2; 0)", material: "Inox" },
      { id: "barra-v", nome: "Barra vertical", forma: "cilindro", eixo: "y", visivel: "Vertical = 1", x: "0", y: "Altura_eixo", z: "Eixo_z", raio: "Diametro/2", altura: "Comprimento", material: "Inox" },
      { id: "perna-v", nome: "Perna vertical da barra em L", forma: "cilindro", eixo: "y", visivel: "Vertical = 0 e Comprimento_v > 0", x: "-Comprimento/2", y: "Altura_eixo - Diametro/2", z: "Eixo_z", raio: "Diametro/2", altura: "Comprimento_v + Diametro/2", material: "Inox" },
      { id: "sup-1", nome: "Suporte 1", forma: "cilindro", eixo: "z", x: "se(Vertical = 1; 0; -Comprimento/2 + 0.02)", y: "se(Vertical = 1; Altura_eixo + 0.04; Altura_eixo)", z: "0", raio: "Suporte_raio", altura: "Afastamento + Diametro/2", material: "Inox" },
      { id: "sup-2", nome: "Suporte 2", forma: "cilindro", eixo: "z", x: "se(Vertical = 1; 0; Comprimento/2 - 0.02)", y: "se(Vertical = 1; Altura_eixo + Comprimento - 0.04; Altura_eixo)", z: "0", raio: "Suporte_raio", altura: "Afastamento + Diametro/2", material: "Inox" },
      { id: "sup-3", nome: "Suporte da perna vertical", forma: "cilindro", eixo: "z", visivel: "Vertical = 0 e Comprimento_v > 0", x: "-Comprimento/2", y: "Altura_eixo + Comprimento_v - 0.04", z: "0", raio: "Suporte_raio", altura: "Afastamento + Diametro/2", material: "Inox" }
    ],
    quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Barra de apoio em aço inox, fixada na parede" }
  }]);
  global.FamiliasInc = { ids: ["inc-placa", "inc-luminaria", "inc-extintor", "acs-barra"], DATA_PRECO: DATA };
  if (typeof module !== "undefined" && module.exports) module.exports = global.FamiliasInc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

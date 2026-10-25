/* =====================================================================
 * familiasinc.js — FAMÍLIAS DE INCÊNDIO da biblioteca RA (21/10/2026): placa de sinalização, luminária de emergência e extintor.
 *
 * Todas "livres", com a ORIGEM NA FACE DA PAREDE, no piso do pavimento (y = piso) e o +Z local para DENTRO do ambiente (o mesmo jeito
 * das tomadas do js/eleauto.js). A altura é parâmetro de instância — o lançador (js/incauto.js) e o auditor (js/incauditor.js) leem dela:
 *   inc-placa       Altura_base (IT 15: 1,80 m; saída acima da porta a ≤ 0,10 m da verga), Distancia_leitura → Area_minima = L²/2000 (IT 15 Anexo A)
 *   inc-luminaria   Altura_montagem, Tensao_V (IT 13 5.5: ≤ 30 V abaixo de 2,5 m), Fluxo_lm (NBR 10898:2023 6.1.2.4 ≥ 300 lm — cópia não licenciada)
 *   inc-extintor    Altura_alca (IT 16 5.2.2.2: ≤ 1,60 m) → Base = alça − altura do extintor (≥ 0,20 m), Capacidade_extintora, Agente
 * MEDIDAS: placas nas medidas dos itens das bases públicas (SINAPI 06/2026 e SETOP-MG); luminária e extintor com medidas de DESENHO
 *   (símbolo no 3D — as mesmas da peça "extintor" do js/biminst.js), não de catálogo: conferir no fabricante.
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
    { id: "saida-40x20", nome: "SAÍDA (S12) acima da porta — 0,40 × 0,20 m", v: { Codigo_simbolo: "S12", Funcao: "saida", Largura: 0.40, Altura: 0.20, Cor: "#1b7a3a" },
      p: [27.96, "PROVISÓRIO: SINAPI MG 06/2026 insumo 37558 (placa fotoluminescente 20 × 40 cm, PVC 2 mm, NBR 16820) R$ 27,96 — o maior; SETOP-MG 08/2023 ED-50205 (S12 38 × 19 cm, com fixação) R$ 19,01", "INC-PLACA-S12-40X20"] },
    { id: "saida-26x13", nome: "SAÍDA (S12) acima da porta — 0,26 × 0,13 m (leitura até 8 m)", v: { Codigo_simbolo: "S12", Funcao: "saida", Largura: 0.26, Altura: 0.13, Cor: "#1b7a3a" },
      p: [15.00, "PROVISÓRIO: SINAPI MG 06/2026 insumo 37539 (placa fotoluminescente 13 × 26 cm, PVC 2 mm, NBR 16820) R$ 15,00", "INC-PLACA-S12-26X13"] },
    { id: "rota-40x20", nome: "Orientação da rota (S1/S2, seta) — 0,40 × 0,20 m", v: { Codigo_simbolo: "S1/S2", Funcao: "orientacao", Largura: 0.40, Altura: 0.20, Cor: "#1b7a3a" },
      p: [27.96, "PROVISÓRIO: SINAPI MG 06/2026 insumo 37558 (20 × 40 cm) R$ 27,96 — o maior; SETOP-MG 08/2023 ED-50202/ED-50201 (S1/S2 38 × 19 cm, com fixação) R$ 19,01", "INC-PLACA-S1-40X20"] },
    { id: "extintor-20x20", nome: "Extintor (E5) acima do equipamento — 0,20 × 0,20 m", v: { Codigo_simbolo: "E5", Funcao: "equipamento", Largura: 0.20, Altura: 0.20, Cor: "#c62828", Vermelha: 1 },
      p: [17.35, "PROVISÓRIO: SINAPI MG 06/2026 insumo 37556 (20 × 20 cm) R$ 17,35 — o maior; SETOP-MG 08/2023 ED-50199 (E5 30 × 30 cm, com fixação) R$ 16,03", "INC-PLACA-E5-20X20"] },
    { id: "pavimento-15x15", nome: "Número do pavimento (S17) na escada — 0,15 × 0,15 m", v: { Codigo_simbolo: "S17", Funcao: "pavimento", Largura: 0.15, Altura: 0.15, Cor: "#1b7a3a" },
      p: [11.23, "PROVISÓRIO: SETOP-MG 08/2023 ED-29411 (S17 15 × 15 cm, com fixação) R$ 11,23 — o maior; SINAPI MG 06/2026 insumo 37557 (14 × 14 cm) R$ 8,96", "INC-PLACA-S17-15X15"] },
    { id: "piso-E12", nome: "Sinalização de piso E12 (extintor em garagem/depósito) — 1,00 × 1,00 m", v: { Codigo_simbolo: "E12", Funcao: "piso", Largura: 1.00, Altura: 1.00, Cor: "#c62828", Altura_base_padrao: 0, No_piso: 1, Vermelha: 1 },
      p: [66.71, "PROVISÓRIO: SETOP-MG 08/2023 ED-29395 (E12 instalada em piso, 100 × 100 cm, com fixação) R$ 66,71 — única referência lida (base de 2023: atualizar)", "INC-PLACA-E12"] }
  ];
  FR.registrar([{
    id: "inc-placa", nome: "Placa de sinalização de emergência (IT 15 CBMMG)", categoria: "equipamento", hospedagem: "livre",
    descricao: "Placa fotoluminescente de sinalização de emergência (saída, orientação, equipamento, pavimento, piso). Origem na face da parede, no piso; a placa fica com a BASE em Altura_base (IT 15: 1,80 m; a de saída acima da porta, a no máximo 0,10 m da verga). Área ≥ L²/2000 (IT 15 Anexo A).",
    parametros: [
      P("Codigo_simbolo", "texto", "S12", "Sinalização", "Código do símbolo da IT 15 (Anexo B): S12 saída, S1/S2 orientação, E5 extintor, S17 pavimento, E12 piso"),
      P("Funcao", "texto", "saida", "Sinalização", "saida · orientacao · equipamento · pavimento · piso"),
      P("Largura", "comprimento", 0.40, "Dimensões"), P("Altura", "comprimento", 0.20, "Dimensões"),
      P("Cor", "texto", "#1b7a3a", "Materiais", "Verde (saída/orientação) ou vermelho (equipamento), fotoluminescente"),
      P("Vermelha", "inteiro", 0, "Materiais", "1 = placa de equipamento (fundo vermelho, IT 15 Anexo B)"),
      P("Altura_base_padrao", "comprimento", 1.80, "Norma", "IT 15 6.1.1 a 6.1.4: base da placa a 1,80 m do piso (a de saída fica acima da porta)"),
      P("No_piso", "inteiro", 0, "Sinalização", "1 = sinalização de piso (E12, deitada no chão, à frente do equipamento)"),
      P("Altura_base", "comprimento", 1.80, "Restrições", "Do piso à base da placa", "instancia"),
      P("Distancia_leitura", "comprimento", 4.0, "Norma", "Distância de leitura L (m), mínimo 4 m (IT 15 Anexo A)", "instancia"),
      P("Seta", "texto", "", "Sinalização", "Placa de orientação: direita / esquerda (sentido da saída visto de frente para a placa)", "instancia"),
      P("Fotoluminescente", "simnao", true, "Sinalização", "IT 15 6.3 e), f): orientação, salvamento e equipamentos fotoluminescentes"),
      F("Area_minima", "numero", "max(Distancia_leitura; 4)^2/2000", "Norma", "A ≥ L²/2000 (m²) — IT 15 Anexo A"),
      F("Conforme", "numero", "se(Largura*Altura >= Area_minima - 0.000001; 1; 0)", "Norma", "1 se a placa tem a área mínima para a distância de leitura")
    ].concat(PRECO),
    tipos: placas.map(function (t) { return { id: t.id, nome: t.nome, valores: preco(JSON.parse(JSON.stringify(t.v)), t.p[0], t.p[1], t.p[2], MOT_PLACA) }; }),
    solidos: [
      { id: "placa", nome: "Placa (verde)", forma: "caixa", visivel: "Vermelha = 0", x: "0", y: "se(No_piso = 1; 0; Altura_base)", z: "se(No_piso = 1; Altura/2 + 0.05; 0.003)", dx: "Largura", dy: "se(No_piso = 1; 0.003; Altura)", dz: "se(No_piso = 1; Altura; 0.004)", material: "Branco", cor: "#1b7a3a" },
      { id: "placa-v", nome: "Placa (vermelha)", forma: "caixa", visivel: "Vermelha = 1", x: "0", y: "se(No_piso = 1; 0; Altura_base)", z: "se(No_piso = 1; Altura/2 + 0.05; 0.003)", dx: "Largura", dy: "se(No_piso = 1; 0.003; Altura)", dz: "se(No_piso = 1; Altura; 0.004)", material: "Vermelho", cor: "#c62828" }
    ],
    quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Placa de sinalização de emergência fotoluminescente (IT 15 CBMMG)" }
  }]);

  /* ------------------------------------------------------------------ LUMINÁRIA DE EMERGÊNCIA */
  FR.registrar([{
    id: "inc-luminaria", nome: "Luminária de emergência (IT 13 CBMMG)", categoria: "luminaria", hospedagem: "livre",
    descricao: "Luminária de emergência de aclaramento (bloco autônomo). Origem na face da parede, no piso; o corpo fica a Altura_montagem. IT 13: até 15 m entre pontos; abaixo de 2,5 m, ≤ 30 V. Medidas de desenho (conferir no fabricante).",
    parametros: [
      P("Funcao", "texto", "aclaramento", "Elétrica", "aclaramento · balizamento"),
      P("Sistema", "texto", "bloco autonomo", "Elétrica", "bloco autônomo · centralizado"),
      P("Tensao_V", "numero", 30, "Elétrica", "Tensão nas lâmpadas (V). IT 13 5.5: ≤ 30 V abaixo de 2,5 m (ou DR 30 mA + 10 A). Bloco autônomo de LED: conferir na ficha"),
      P("Fluxo_lm", "numero", 0, "Fotometria", "Fluxo luminoso (lm). 0 = não declarado pela base de preço: conferir na ficha (NBR 10898:2023 6.1.2.4: ≥ 300 lm ou estudo luminotécnico — cópia não licenciada)"),
      P("Autonomia_h", "numero", 0, "Elétrica", "Autonomia (h). 0 = não declarada: conferir (NBR 10898:2023 4.9: mínimo 2 h — cópia não licenciada; MG adota a 2013)"),
      P("Largura", "comprimento", 0.30, "Dimensões", "Medida de desenho"), P("Altura", "comprimento", 0.07, "Dimensões", "Medida de desenho"), P("Profundidade", "comprimento", 0.05, "Dimensões", "Medida de desenho"),
      P("Altura_montagem", "comprimento", 2.30, "Restrições", "Do piso ao centro da luminária", "instancia")
    ].concat(PRECO),
    tipos: [
      { id: "led30-2w", nome: "Bloco autônomo 30 LEDs 2 W (SINAPI 97599)", codigo: "97599", fonte: "SINAPI 06/2026 97599 — LUMINÁRIA DE EMERGÊNCIA, COM 30 LÂMPADAS LED DE 2 W, SEM REATOR - FORNECIMENTO E INSTALAÇÃO", valores: {} }
    ],
    solidos: [
      { id: "corpo", nome: "Corpo", forma: "caixa", x: "0", y: "Altura_montagem - Altura/2", z: "Profundidade/2", dx: "Largura", dy: "Altura", dz: "Profundidade", material: "Branco" },
      { id: "lente", nome: "Lente", forma: "caixa", x: "0", y: "Altura_montagem - Altura/2 - 0.004", z: "Profundidade + 0.002", dx: "Largura*0.8", dy: "Altura*0.6", dz: "0.004", material: "Vidro" }
    ],
    quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Luminária de emergência" }
  }]);

  /* ------------------------------------------------------------------ EXTINTOR */
  var MOT_ABC = "a SINAPI 06/2026 não tem composição de extintor de pó ABC; valor = o maior preço público lido";
  function ext(id, nome, ag, carga, cap, classe, cod, fonte, extra) {
    var t = { id: id, nome: nome, valores: { Agente: ag, Carga: carga, Capacidade_extintora: cap, Classe: classe } };
    if (cod) { t.codigo = cod; t.fonte = fonte; }
    if (extra) preco(t.valores, extra[0], extra[1], extra[2], MOT_ABC);
    return t;
  }
  FR.registrar([{
    id: "inc-extintor", nome: "Extintor portátil (IT 16 CBMMG)", categoria: "equipamento", hospedagem: "livre",
    descricao: "Extintor portátil de parede com suporte. Origem na face da parede, no piso; a ALÇA fica em Altura_alca (IT 16 5.2.2.2: ≤ 1,60 m) e a base do extintor ≥ 0,20 m do piso. Medidas do cilindro de desenho (as da peça extintor do js/biminst.js) — conferir no fabricante.",
    parametros: [
      P("Agente", "texto", "Pó ABC", "Extintor", "Agente extintor"),
      P("Carga", "texto", "4 kg", "Extintor", "Carga nominal"),
      P("Capacidade_extintora", "texto", "2-A:20-B:C", "Extintor", "Capacidade extintora do rótulo (IT 16 Tabela 1: mínimo pó ABC 2-A:20-B:C; pó BC 20-B:C; água 2-A; CO2 5-B:C)"),
      P("Classe", "texto", "ABC", "Extintor", "Classes de fogo"),
      P("Diametro", "comprimento", 0.18, "Dimensões", "Medida de desenho (peça extintor do js/biminst.js: raio 0,09)"),
      P("Altura_total", "comprimento", 0.55, "Dimensões", "Medida de desenho, com a válvula"),
      P("Altura_alca", "comprimento", 1.50, "Restrições", "Do piso à alça de manuseio (IT 16 5.2.2.2: no máximo 1,60 m; 1,50 m = critério RA)", "instancia"),
      F("Base", "comprimento", "Altura_alca - Altura_total", "Norma", "Do piso à parte de baixo do extintor (IT 16 5.2.2.2: ≥ 0,20 m)"),
      F("Conforme", "numero", "se(Altura_alca <= 1.6 + 0.000001 e Base >= 0.2 - 0.000001; 1; 0)", "Norma", "1 se a alça ≤ 1,60 m e a base ≥ 0,20 m (IT 16 5.2.2.2)")
    ].concat(PRECO),
    tipos: [
      ext("abc4", "Pó ABC 4 kg — 2-A:20-B:C", "Pó ABC", "4 kg", "2-A:20-B:C", "ABC", "", "", [352.90, "PROVISÓRIO: maior preço público lido em 21/10/2026 — varejo (Magazine Luiza, extintor pó ABC 4 kg Resil Gold 2A:20BC) R$ 352,90; IOPES-ES 05/2026 160607 (ABC 2A-20B:C 4 kg com suporte) R$ 185,71; SUDECAP-BH 04/2026 73.55.33 (ABC 4 kg 2-A:20-B:C) R$ 146,92", "INC-EXT-ABC4"]),
      ext("abc6-3a", "Pó ABC 6 kg — 3-A:20-B:C (risco médio/alto)", "Pó ABC", "6 kg", "3-A:20-B:C", "ABC", "", "", [352.90, "PROVISÓRIO: maior preço público lido para o ABC 6 kg: ORSE-SE 01511 R$ 226,94; GOINFRA 04/2026 085006 R$ 225,27 (lida em orcamentor.com, fonte secundária); SETOP-MG ED-50193 R$ 212,44; IOPES-ES 160605 R$ 198,82. Nenhum varejo de 6 kg foi lido, e o de 4 kg custa R$ 352,90 (Magazine Luiza, 21/10/2026): adotado esse piso, porque o 6 kg não custa menos que o 4 kg (incerto = preço mais alto); rótulo 3-A:20-B:C: ficha de fabricante (AECweb) — conferir no produto comprado e cotar", "INC-EXT-ABC6-3A"]),
      ext("pqs4bc", "Pó BC 4 kg (SINAPI 101908)", "Pó BC", "4 kg", "conferir no rótulo (mínimo 20-B:C)", "BC", "101908", "SINAPI 06/2026 101908 — EXTINTOR PQS 4 KG CLASSE BC"),
      ext("pqs6bc", "Pó BC 6 kg (SINAPI 101909)", "Pó BC", "6 kg", "conferir no rótulo (mínimo 20-B:C)", "BC", "101909", "SINAPI 06/2026 101909"),
      ext("pqs8bc", "Pó BC 8 kg (SINAPI 101910)", "Pó BC", "8 kg", "conferir no rótulo (mínimo 20-B:C)", "BC", "101910", "SINAPI 06/2026 101910"),
      ext("pqs12bc", "Pó BC 12 kg (SINAPI 101911)", "Pó BC", "12 kg", "conferir no rótulo (mínimo 20-B:C)", "BC", "101911", "SINAPI 06/2026 101911"),
      ext("agua10", "Água pressurizada 10 L (SINAPI 101905)", "Água", "10 L", "conferir no rótulo (mínimo 2-A)", "A", "101905", "SINAPI 06/2026 101905"),
      ext("co2-4", "CO2 4 kg (SINAPI 101906)", "CO2", "4 kg", "conferir no rótulo (mínimo 5-B:C)", "BC", "101906", "SINAPI 06/2026 101906"),
      ext("co2-6", "CO2 6 kg (SINAPI 101907)", "CO2", "6 kg", "conferir no rótulo (mínimo 5-B:C)", "BC", "101907", "SINAPI 06/2026 101907")
    ],
    solidos: [
      { id: "suporte", nome: "Suporte de parede", forma: "caixa", x: "0", y: "Base + Altura_total*0.45", z: "0.01", dx: "0.06", dy: "Altura_total*0.5", dz: "0.02", material: "Preto" },
      { id: "cilindro", nome: "Cilindro", forma: "cilindro", eixo: "y", x: "0", y: "Base", z: "0.02 + Diametro/2", raio: "Diametro/2", altura: "Altura_total*0.82", material: "Vermelho" },
      { id: "valvula", nome: "Válvula e alça", forma: "cilindro", eixo: "y", x: "0", y: "Base + Altura_total*0.82", z: "0.02 + Diametro/2", raio: "Diametro*0.16", altura: "Altura_total*0.18", material: "Preto" }
    ],
    quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Extintor de incêndio portátil" }
  }]);
  global.FamiliasInc = { ids: ["inc-placa", "inc-luminaria", "inc-extintor"], DATA_PRECO: DATA };
  if (typeof module !== "undefined" && module.exports) module.exports = global.FamiliasInc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

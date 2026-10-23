/* =====================================================================
 * familiasguarda.js — FAMÍLIA PARAMÉTRICA DE GUARDA-CORPO (ra-guarda-corpo), pela NBR 14718:2019 (21/10/2026)
 *
 * Um MÓDULO de guarda-corpo (até 1,20 m entre montantes, como as composições da SINAPI), livre, com origem no pé do montante
 * inicial e o comprimento ao longo de X (+Z = lado do VAZIO). Os números vêm da norma e moram em js/guardacorpo.js — a tabela de
 * cargas é a MESMA do auditor (as fórmulas desta família são geradas dela, não digitadas duas vezes).
 *
 *   Altura (instância)         H ≥ 1,10 m (4.4.1.1); o auditor reprova menos
 *   Modo (tipo)                1 barras verticais · 2 travessas horizontais + fechamento interno até 0,45 m · 3 vidro (painel)
 *   Vao_luz (tipo)             vão-luz máximo (0,11 m, 4.4.2.1): o número de barras/travessas sai dele — nunca de um passo fixo
 *   N_barras · Gap_barras      barras verticais entre os montantes, o vão REAL entre elas e até o montante
 *   N_trav · Gap_trav          travessas horizontais e o vão REAL entre elas (modo 2: ≤ 0,11 m, 4.4.2.2)
 *   Rodape                     barreira de piso (esfera de 0,05 m, 4.4.2.5)
 *   Grupo_uso · Pavimentos · Regiao → Carga_uso e Carga_seguranca (N/m, Tabela 1): as cargas que o ENSAIO do fabricante cumpre
 *   Conforme                   1 se H, vão-luz e barreira de piso atendem
 * NÃO é dimensionado aqui: montante, ancoragem (mínimo de 70 mm no concreto, 4.4.3.3) e vidro (NBR 7199) — a norma é de desempenho
 * (ensaio de protótipo, Anexos A a C) e o laudo é do fabricante. Região do país (I a V) da Tabela 1: NBR 10821-2 Fig. 4, não lida → V.
 * Preço: SINAPI 06/2026 MG (js/guardacorpo.js sinapiDe), provisório até o vão-luz do gradil ser conferido com o fornecedor.
 * Teste: node tools/test-guardacorpo.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var GC = dep("GuardaCorpo", "./guardacorpo.js"), FR = dep("FamiliasRA", "./familiasra.js");
  if (!FR || !FR.registrar) return;
  var CF = GC ? GC.cargaFormulas() : { uso: "500", seguranca: "800" }, N = GC ? GC.NORMA : null;
  var H0 = N ? N.altura.valor : 1.10, VAO = N ? N.vaoLuz.valor : 0.11, ESF = N ? N.esferaPiso.valor : 0.05, ESC = N ? N.escalada.valor : 0.45;
  var NB = 24, NT = 12;   /* o máximo de barras (módulo de até 3,0 m) e de travessas (altura até ~1,6 m) que a família sabe desenhar */

  var solidos = [
    { id: "m1", nome: "Montante inicial", forma: "caixa", x: "0", y: "0", z: "0", dx: "Sec_montante", dy: "Altura - Sec_corrimao", dz: "Sec_montante", material: "Material_metal" },
    { id: "m2", nome: "Montante final", forma: "caixa", x: "Comprimento", y: "0", z: "0", dx: "Sec_montante", dy: "Altura - Sec_corrimao", dz: "Sec_montante", material: "Material_metal" },
    { id: "co", nome: "Corrimão (travessa superior)", forma: "caixa", x: "Comprimento/2", y: "Altura - Sec_corrimao", z: "0", dx: "Comprimento + Sec_montante", dy: "Sec_corrimao", dz: "Sec_corrimao", material: "Material_metal" },
    { id: "ro", nome: "Rodapé (barreira de piso)", forma: "caixa", x: "Comprimento/2", y: "0", z: "0", dx: "Livre", dy: "Rodape", dz: "0.03", material: "Material_metal" },
    { id: "fe", nome: "Fechamento interno até 0,45 m", forma: "caixa", x: "Comprimento/2", y: "0", z: "-0.02", dx: "Livre", dy: "Altura_fechamento", dz: "0.006", material: "Material_metal", visivel: "Modo = 2" },
    { id: "vi", nome: "Vidro (painel)", forma: "caixa", x: "Comprimento/2", y: "Rodape", z: "0", dx: "Livre", dy: "Altura - Sec_corrimao - Rodape", dz: "Esp_vidro", material: "Material_vidro", visivel: "Modo = 3" }
  ];
  var i;
  for (i = 1; i <= NB; i++) solidos.push({ id: "b" + i, nome: "Barra vertical " + i, forma: "caixa", x: "Sec_montante/2 + Gap_barras*" + i + " + Larg_barra*" + (i - 0.5), y: "Rodape", z: "0", dx: "Larg_barra", dy: "Altura - Sec_corrimao - Rodape", dz: "Larg_barra", material: "Material_metal", visivel: "Modo = 1 e N_barras >= " + i });
  for (i = 1; i <= NT; i++) solidos.push({ id: "t" + i, nome: "Travessa horizontal " + i, forma: "caixa", x: "Comprimento/2", y: "Rodape + Gap_trav*" + i + " + Larg_trav*" + (i - 1), z: "0", dx: "Livre", dy: "Larg_trav", dz: "Larg_trav", material: "Material_metal", visivel: "Modo = 2 e N_trav >= " + i });

  FR.registrar([{
    id: "ra-guarda-corpo", nome: "Guarda-corpo (NBR 14718:2019)", categoria: "guarda_corpo", hospedagem: "livre",
    descricao: "Módulo de guarda-corpo (até 1,20 m entre montantes): altura, vão-luz, escalabilidade e cargas pela NBR 14718:2019. Origem no pé do montante inicial; +Z é o lado do vazio.",
    parametros: [
      { nome: "Comprimento", tipoDado: "comprimento", escopo: "instancia", valor: 1.20, grupo: "Dimensões", descricao: "Entre os eixos dos montantes (módulo de até 1,20 m)" },
      { nome: "Altura", tipoDado: "comprimento", escopo: "instancia", valor: H0, grupo: "Dimensões", descricao: "Altura de proteção H ≥ 1,10 m acima da zona de estacionamento normal (NBR 14718, 4.4.1.1)" },
      { nome: "Modo", tipoDado: "inteiro", escopo: "tipo", valor: 1, grupo: "Construção", descricao: "1 barras verticais · 2 travessas horizontais com fechamento interno até 0,45 m · 3 vidro" },
      { nome: "Vao_luz", tipoDado: "comprimento", escopo: "tipo", valor: VAO, grupo: "Norma", descricao: "Vão-luz máximo entre perfis (NBR 14718, 4.4.2.1): ≤ 0,11 m" },
      { nome: "Larg_barra", tipoDado: "comprimento", escopo: "tipo", valor: 0.02, grupo: "Dimensões", descricao: "Barra vertical 20 × 20 mm" },
      { nome: "Larg_trav", tipoDado: "comprimento", escopo: "tipo", valor: 0.02, grupo: "Dimensões", descricao: "Travessa horizontal (modo 2)" },
      { nome: "Sec_montante", tipoDado: "comprimento", escopo: "tipo", valor: 0.04, grupo: "Dimensões" },
      { nome: "Sec_corrimao", tipoDado: "comprimento", escopo: "tipo", valor: 0.05, grupo: "Dimensões" },
      { nome: "Rodape", tipoDado: "comprimento", escopo: "tipo", valor: 0.10, grupo: "Norma", descricao: "Barreira de piso: nenhuma esfera de 0,05 m rola pelo piso (NBR 14718, 4.4.2.5)" },
      { nome: "Altura_fechamento", tipoDado: "comprimento", escopo: "tipo", valor: ESC, grupo: "Norma", descricao: "Fechamento no lado interno onde há apoios para escalar até 0,45 m (NBR 14718, 4.4.2.2)" },
      { nome: "Esp_vidro", tipoDado: "comprimento", escopo: "tipo", valor: 0.008, grupo: "Dimensões", descricao: "Vidro laminado 8 mm (4+4): NÃO dimensionado aqui (NBR 7199 e fabricante)" },
      { nome: "Material_metal", tipoDado: "material", escopo: "tipo", valor: "Metal", grupo: "Materiais" },
      { nome: "Material_vidro", tipoDado: "material", escopo: "tipo", valor: "Vidro", grupo: "Materiais" },
      { nome: "Grupo_uso", tipoDado: "inteiro", escopo: "instancia", valor: 1, grupo: "Cargas (Tabela 1)", descricao: "1 residencial/comercial de uso privativo e áreas técnicas · 2 coletivo de médio tráfego · 3 coletivo de alto tráfego" },
      { nome: "Pavimentos", tipoDado: "inteiro", escopo: "instancia", valor: 2, grupo: "Cargas (Tabela 1)", descricao: "Nº de pavimentos do edifício (Tabela 1: 2, 5, 10, 20, 30 — cai no bloco igual ou maior)" },
      { nome: "Regiao", tipoDado: "inteiro", escopo: "instancia", valor: 5, grupo: "Cargas (Tabela 1)", descricao: "Região do país I a V (1 a 5) pela NBR 10821-2, Fig. 4 — NÃO lida: V (a mais exigente) até ser informada" },
      { nome: "Livre", tipoDado: "comprimento", escopo: "instancia", formula: "Comprimento - Sec_montante", grupo: "Quantidades" },
      { nome: "N_barras", tipoDado: "inteiro", escopo: "instancia", formula: "max(1; teto((Livre - Vao_luz)/(Vao_luz + Larg_barra) - 0.000001))", grupo: "Norma" },
      { nome: "Gap_barras", tipoDado: "comprimento", escopo: "instancia", formula: "(Livre - N_barras*Larg_barra)/(N_barras + 1)", grupo: "Norma" },
      { nome: "H_livre", tipoDado: "comprimento", escopo: "instancia", formula: "Altura - Sec_corrimao - Rodape", grupo: "Norma" },
      { nome: "N_trav", tipoDado: "inteiro", escopo: "instancia", formula: "max(1; teto((H_livre - Vao_luz)/(Vao_luz + Larg_trav) - 0.000001))", grupo: "Norma" },
      { nome: "Gap_trav", tipoDado: "comprimento", escopo: "instancia", formula: "(H_livre - N_trav*Larg_trav)/(N_trav + 1)", grupo: "Norma" },
      { nome: "Vao_real", tipoDado: "comprimento", escopo: "instancia", formula: "se(Modo = 1; Gap_barras; se(Modo = 2; Gap_trav; 0))", grupo: "Norma", descricao: "O vão-luz que a geometria entrega (0 no vidro)" },
      { nome: "Carga_uso", tipoDado: "numero", escopo: "instancia", formula: CF.uso, grupo: "Cargas (Tabela 1)", descricao: "Carga horizontal de uso do ensaio (N/m); deslocamento ≤ 25 mm, residual ≤ 3 mm (5.1.1)" },
      { nome: "Carga_seguranca", tipoDado: "numero", escopo: "instancia", formula: CF.seguranca, grupo: "Cargas (Tabela 1)", descricao: "Carga de segurança do ensaio (N/m); deslocamento ≤ 150 mm (5.1.2); na vertical ≤ 20 mm (5.2); impacto de 600 J (5.3)" },
      { nome: "Conforme", tipoDado: "numero", escopo: "instancia", formula: "se(Altura >= " + H0 + " e Vao_real <= " + (VAO + 0.000001) + " e Rodape >= " + ESF + "; 1; 0)", grupo: "Norma", descricao: "1 se a altura, o vão-luz e a barreira de piso atendem à NBR 14718" }
    ],
    tipos: [
      { id: "gcb", nome: "Barras verticais (vão-luz ≤ 11 cm)", valores: { Modo: 1 } },
      { id: "gct", nome: "Travessas horizontais + fechamento interno até 45 cm", valores: { Modo: 2 } },
      { id: "gcv", nome: "Vidro laminado (painel)", valores: { Modo: 3 } }
    ],
    solidos: solidos,
    quantitativo: { unidade: "m", quantidade: "Comprimento", codigo: "", fonte: "", descricao: "Guarda-corpo de aço (barras verticais, travessas ou vidro) — NBR 14718:2019" }
  }]);
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

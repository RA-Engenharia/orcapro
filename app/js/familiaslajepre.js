/* =====================================================================
 * familiaslajepre.js — FAMÍLIA PARAMÉTRICA "LAJE PRÉ-FABRICADA" (ra-laje-pre) (14/11/2026)
 *
 * Laje treliçada / protendida com vigota, enchimento (EPS ou cerâmica), nervuras moldadas no local e capa como SÓLIDOS REAIS.
 * Os TIPOS vêm do catálogo (js/lajespredados.js — fabricante, documento, página): quem quiser duplica um tipo e muda os parâmetros
 * (a cópia fica por conta do usuário: a tabela do fabricante deixa de valer — o motor js/lajespre.js avisa).
 * A geometria é a MESMA do motor puro js/lajespregeo.js (modelo de células); o teste prova as duas lado a lado.
 *
 *   Comprimento (instância)   ao longo das vigotas (m) — é o VÃO que a tabela do fabricante usa
 *   Largura (instância)       perpendicular às vigotas (m): o intereixo se repete aqui
 *   Direcao (instância)       1 = vigotas ao longo de X · 2 = ao longo de Z (origem no canto mínimo; y = face inferior)
 *   Intereixo · B_vigota · H_base · H_ench · H_capa · L_ench · Compr_ench (tipo)   do catálogo
 *   N_cel · I_ef · W_ench                                                             calculados (intereixo efetivo ≤ nominal)
 *
 * Capacidade: NC = 36 células (≈ 15 m de largura a 0,42 m); acima disso Capacidade_ok = 0 e a família avisa (o motor puro não tem esse limite).
 * Quantitativo: m² de laje. Código SINAPI: NÃO preenchido (nenhum código foi conferido para este sistema).
 * Teste: node tools/test-lajespre.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  var FR = dep("FamiliasRA", "./familiasra.js"), LP = dep("LajesPre", "./lajespre.js");
  if (!FR || !FR.registrar || !LP) return;
  var NC = 36;
  var D = function (c) { return "se(D_x; " + c[0] + "; " + c[1] + ")"; };

  var solidos = [];
  var i;
  /* vigotas e nervuras (uma por célula) */
  for (i = 1; i <= NC; i++) {
    var vc = "I_ef*" + (i - 0.5), vis = "N_cel >= " + i;
    solidos.push({ id: "v" + i, nome: "Vigota " + i, forma: "caixa", x: D(["Comprimento/2", vc]), y: "0", z: D([vc, "Comprimento/2"]), dx: D(["Comprimento", "B_vigota"]), dy: "H_base", dz: D(["B_vigota", "Comprimento"]), material: "Material_concreto", visivel: vis });
    solidos.push({ id: "n" + i, nome: "Nervura " + i, forma: "caixa", x: D(["Comprimento/2", vc]), y: "H_base", z: D([vc, "Comprimento/2"]), dx: D(["Comprimento", "Nerv"]), dy: "H_ench - H_base", dz: D(["Nerv", "Comprimento"]), material: "Material_concreto", visivel: vis });
    solidos.push({ id: "pe" + i, nome: "Nervura (pé esquerdo) " + i, forma: "caixa", x: D(["Comprimento/2", vc + " - (Nerv + B_vigota)/4"]), y: "0", z: D([vc + " - (Nerv + B_vigota)/4", "Comprimento/2"]), dx: D(["Comprimento", "(Nerv - B_vigota)/2"]), dy: "H_base", dz: D(["(Nerv - B_vigota)/2", "Comprimento"]), material: "Material_concreto", visivel: vis + " e Nerv > B_vigota + 0.000001" });
    solidos.push({ id: "pd" + i, nome: "Nervura (pé direito) " + i, forma: "caixa", x: D(["Comprimento/2", vc + " + (Nerv + B_vigota)/4"]), y: "0", z: D([vc + " + (Nerv + B_vigota)/4", "Comprimento/2"]), dx: D(["Comprimento", "(Nerv - B_vigota)/2"]), dy: "H_base", dz: D(["(Nerv - B_vigota)/2", "Comprimento"]), material: "Material_concreto", visivel: vis + " e Nerv > B_vigota + 0.000001" });
  }
  /* enchimento: N_cel + 1 vãos (índices 0..N_cel); as duas bordas com meia peça */
  for (i = 0; i <= NC; i++) {
    var borda = "(" + i + " = 0 ou " + i + " = N_cel)", cx = "se(" + i + " = 0; W_ench/4; se(" + i + " = N_cel; Largura - W_ench/4; I_ef*" + i + "))", larg = "se(" + borda + "; W_ench/2; W_ench)";
    var cxp = "se(" + i + " = 0; Gap/4; se(" + i + " = N_cel; Largura - Gap/4; I_ef*" + i + "))", largp = "se(" + borda + "; Gap/2; Gap)";
    solidos.push({ id: "ec" + i, nome: "Enchimento " + i + " (corpo)", forma: "caixa", x: D(["Comprimento/2", cx]), y: "se(Degrau = 1; H_base; 0)", z: D([cx, "Comprimento/2"]), dx: D(["Comprimento", larg]), dy: "se(Degrau = 1; H_ench - H_base; H_ench)", dz: D([larg, "Comprimento"]), material: "Material_ench", visivel: "N_cel >= " + i });
    solidos.push({ id: "ep" + i, nome: "Enchimento " + i + " (pé)", forma: "caixa", x: D(["Comprimento/2", cxp]), y: "0", z: D([cxp, "Comprimento/2"]), dx: D(["Comprimento", largp]), dy: "H_base", dz: D([largp, "Comprimento"]), material: "Material_ench", visivel: "N_cel >= " + i + " e Degrau = 1" });
  }
  solidos.push({ id: "capa", nome: "Capa de concreto", forma: "caixa", x: D(["Comprimento/2", "Largura/2"]), y: "H_ench", z: D(["Largura/2", "Comprimento/2"]), dx: D(["Comprimento", "Largura"]), dy: "H_capa", dz: D(["Largura", "Comprimento"]), material: "Material_concreto" });

  /* tipos do catálogo: só os que têm geometria de laje com enchimento (treliçadas e a protendida); alveolar fica fora */
  var tipos = [], aviso = [];
  LP.series({ semUsuario: true }).forEach(function (s) {
    if (!s.intereixo || s.hEnch == null || (s.tabela && s.tabela.tipo === "vao-maximo-por-painel")) return;
    var g = LP.geometria(s);
    tipos.push({ id: "lp-" + s.id, nome: s.fabricante + " " + s.designacao + (s.enchimento === "eps" ? " EPS" : " cerâmica") + (s.tipoVigota === "VP" ? " (vigota protendida)" : ""),
      fonte: LP.fonteTxt(s) + (g.assumidos.length ? " · ASSUMIDO: " + g.assumidos.join("; ") : ""),
      valores: { Intereixo: s.intereixo / 100, B_vigota: s.bVigota / 100, H_base: g.hBase, H_ench: s.hEnch / 100, H_capa: s.hCapa / 100, L_ench: g.wEnch, Compr_ench: g.comprEnch || 0, Tipo_ench: s.enchimento === "eps" ? 1 : 2, Material_ench: s.enchimento === "eps" ? "EPS" : "Cerâmica", Peso_proprio: s.pesoProprio, Consumo_concreto: s.consumoConcreto } });
  });

  FR.registrar([{
    id: "ra-laje-pre", nome: "Laje pré-fabricada (vigota + enchimento + capa)", categoria: "laje", hospedagem: "livre",
    descricao: "Laje unidirecional de vigotas pré-fabricadas (treliçada ou protendida) com enchimento de EPS ou cerâmica, nervuras e capa como peças reais. Os tipos vêm do catálogo dos fabricantes (com a fonte); duplicar um tipo e mudar os parâmetros o marca como parâmetro do usuário.",
    justificativaForma: "A laje pré-fabricada é um conjunto de prismas retos: vigota (base de concreto), enchimento (bloco de EPS ou lajota cerâmica), nervuras moldadas no local e capa. Essa é a forma real das peças; as dimensões vêm do catálogo do fabricante.",
    parametros: [
      { nome: "Comprimento", tipoDado: "comprimento", escopo: "instancia", valor: 4.0, grupo: "Dimensões", descricao: "Ao longo das vigotas (m): é o vão que a tabela do fabricante usa" },
      { nome: "Largura", tipoDado: "comprimento", escopo: "instancia", valor: 3.0, grupo: "Dimensões", descricao: "Perpendicular às vigotas (m): onde o intereixo se repete" },
      { nome: "Direcao", tipoDado: "inteiro", escopo: "instancia", valor: 1, grupo: "Dimensões", descricao: "1 = nervuras ao longo de X · 2 = ao longo de Z" },
      { nome: "Intereixo", tipoDado: "comprimento", escopo: "tipo", valor: 0.42, grupo: "Catálogo" },
      { nome: "B_vigota", tipoDado: "comprimento", escopo: "tipo", valor: 0.12, grupo: "Catálogo", descricao: "Largura da base de concreto da vigota" },
      { nome: "H_base", tipoDado: "comprimento", escopo: "tipo", valor: 0.03, grupo: "Catálogo", descricao: "Altura da base de concreto da vigota" },
      { nome: "H_ench", tipoDado: "comprimento", escopo: "tipo", valor: 0.07, grupo: "Catálogo", descricao: "Altura do enchimento (NBR 14859-1:2002, he)" },
      { nome: "H_capa", tipoDado: "comprimento", escopo: "tipo", valor: 0.04, grupo: "Catálogo", descricao: "Altura da capa (NBR 14859-1:2002, hc; mínimo resistente da Tabela 8)" },
      { nome: "L_ench", tipoDado: "comprimento", escopo: "tipo", valor: 0.30, grupo: "Catálogo", descricao: "Largura do enchimento" },
      { nome: "Compr_ench", tipoDado: "comprimento", escopo: "tipo", valor: 0.20, grupo: "Catálogo", descricao: "Comprimento da peça de enchimento ao longo da vigota (0 = não informado)" },
      { nome: "Tipo_ench", tipoDado: "inteiro", escopo: "tipo", valor: 2, grupo: "Catálogo", descricao: "1 = EPS · 2 = cerâmica" },
      { nome: "Peso_proprio", tipoDado: "numero", escopo: "tipo", valor: 0, grupo: "Catálogo", descricao: "Peso próprio publicado pelo fabricante (kgf/m²)" },
      { nome: "Consumo_concreto", tipoDado: "numero", escopo: "tipo", valor: 0, grupo: "Catálogo", descricao: "Consumo de concreto no local publicado (L/m²)" },
      { nome: "Material_concreto", tipoDado: "material", escopo: "tipo", valor: "Concreto", grupo: "Materiais" },
      { nome: "Material_ench", tipoDado: "material", escopo: "tipo", valor: "Cerâmica", grupo: "Materiais" },
      { nome: "H_total", tipoDado: "comprimento", escopo: "instancia", formula: "H_ench + H_capa", grupo: "Quantidades" },
      { nome: "N_cel", tipoDado: "inteiro", escopo: "instancia", formula: "max(1; teto(Largura/Intereixo - 0.000001))", grupo: "Quantidades", descricao: "Número de vigotas (uma por célula)" },
      { nome: "I_ef", tipoDado: "comprimento", escopo: "instancia", formula: "Largura/N_cel", grupo: "Quantidades", descricao: "Intereixo efetivo (≤ nominal)" },
      { nome: "W_ench", tipoDado: "comprimento", escopo: "instancia", formula: "L_ench - (Intereixo - I_ef)", grupo: "Quantidades", descricao: "Largura efetiva do enchimento (encolhe junto com o intereixo)" },
      { nome: "Nerv", tipoDado: "comprimento", escopo: "instancia", formula: "Intereixo - L_ench", grupo: "Quantidades", descricao: "Largura da nervura moldada no local" },
      { nome: "Gap", tipoDado: "comprimento", escopo: "instancia", formula: "I_ef - B_vigota", grupo: "Quantidades", descricao: "Vão livre entre as bases de duas vigotas" },
      { nome: "Degrau", tipoDado: "inteiro", escopo: "instancia", formula: "se(L_ench > Intereixo - B_vigota + 0.000001; 1; 0)", grupo: "Quantidades", descricao: "1 se o enchimento apoia nas abas da base da vigota (EPS mais largo que o vão entre bases)" },
      { nome: "D_x", tipoDado: "inteiro", escopo: "instancia", formula: "se(Direcao = 1; 1; 0)", grupo: "Quantidades" },
      { nome: "Area", tipoDado: "area", escopo: "instancia", formula: "Comprimento*Largura", grupo: "Quantidades" },
      { nome: "Vigotas_m", tipoDado: "comprimento", escopo: "instancia", formula: "N_cel*Comprimento", grupo: "Quantidades", descricao: "Metros de vigota" },
      { nome: "Pecas_ench", tipoDado: "numero", escopo: "instancia", formula: "se(Compr_ench > 0; N_cel*Comprimento/Compr_ench; 0)", grupo: "Quantidades", descricao: "Peças de enchimento (0 se o comprimento da peça não foi informado)" },
      { nome: "Vol_capa", tipoDado: "volume", escopo: "instancia", formula: "Area*H_capa", grupo: "Quantidades" },
      { nome: "Vol_nervuras", tipoDado: "volume", escopo: "instancia", formula: "N_cel*Comprimento*(Nerv*(H_ench - H_base) + se(Nerv > B_vigota; (Nerv - B_vigota)*H_base; 0))", grupo: "Quantidades" },
      { nome: "Capacidade_ok", tipoDado: "inteiro", escopo: "instancia", formula: "se(N_cel <= " + NC + "; 1; 0)", grupo: "Quantidades", descricao: "0 se a largura precisa de mais de " + NC + " vigotas (a família só desenha " + NC + ")" }
    ],
    tipos: tipos,
    solidos: solidos,
    quantitativo: { unidade: "m2", quantidade: "Area", codigo: "", fonte: "", descricao: "Laje pré-fabricada (vigota treliçada/protendida + enchimento + capa) — catálogo de fabricantes" }
  }]);
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

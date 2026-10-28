/* =====================================================================
 * hidgasfam.js — FAMÍLIAS DO GÁS GLP (F3, Casa 487, 27/10/2026). ES5, sem DOM.
 *
 * Quatro famílias novas, no formato de js/familia.js, registradas na biblioteca RA (FamiliasRA.registrar):
 *   ra-gas-abrigo     ABRIGO EXTERNO de 2 botijões P13 (um em uso, um reserva), com a câmara técnica atrás para o regulador e o registro de
 *                     corte geral; ventilado (grelhas nas portas), com o conector de SAÍDA na face de trás (ponto de parede: o tubo entra na parede);
 *   ra-gas-regulador  regulador de pressão (peça em linha, X ao longo do tubo, conectores nas faces);
 *   ra-gas-registro   registro de esfera para gás (peça em linha) — o de corte geral e o do ponto de consumo;
 *   ra-gas-ponto      ponto de consumo com flexível metálico (a ponta da rede: o cooktop liga aqui).
 *
 * ⚠ DIMENSÕES = MODELAGEM DA RA (a conferir). O acervo não tem ficha de abrigo, de regulador nem de registro de gás: as medidas abaixo são
 *   de modelagem (botijão P13 usual do fabricante de GLP, regulador e registro do tamanho de uma peça de 1/2"), não de catálogo; cada família
 *   diz isso na descrição. Quantitativo em unidade e CÓDIGO EM BRANCO (regra da casa: nunca código de orçamento inventado) — o preço sai
 *   como mercado/pendência. O afastamento do abrigo a ralos, caixas, ignição e casa de máquinas (NBR 13523) NÃO está no acervo: pendência
 *   no memorial (ver js/hidgasrede.js).
 * Convenção local (js/familia.js): origem no PISO; Y para cima; o abrigo tem o FUNDO em Z = 0 (encosta na parede) e a frente em +Z.
 * ===================================================================== */
(function (global) {
  "use strict";
  /* hid:geometria-inicio — as medidas abaixo são de MODELAGEM 3D da RA (não são valor de norma nem de ficha): ver PROV */
  var PROV = "Medida de MODELAGEM da RA (sem ficha de fabricante no acervo) — conferir com a peça escolhida.";

  function inline(id, nome, descricao, corpoR, comprimento, solidosExtra) {
    return {
      id: id, previa: "modelador", nome: nome, categoria: "acessorio_tubo", hospedagem: "livre",
      descricao: descricao + " Origem no eixo do tubo, X ao longo dele; conectores nas duas faces. " + PROV + " Orçar pelo fornecedor (sem composição SINAPI mapeada).",
      parametros: [
        { nome: "DN", tipoDado: "numero", escopo: "instancia", valor: 22, grupo: "Conexões", descricao: "DN do tubo de cobre em mm (vem do tubo em que entra)" },
        { nome: "Comprimento", tipoDado: "comprimento", escopo: "tipo", valor: comprimento, grupo: "Dimensões", descricao: "Face a face (modelagem)" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Latão", grupo: "Materiais" }
      ],
      tipos: [{ id: "padrao", nome: "Padrão", valores: {} }],
      solidos: [{ id: "corpo", nome: "Corpo", forma: "cilindro", eixo: "x", x: "-Comprimento/2", y: "0", z: "0", raio: corpoR, altura: "Comprimento", material: "Material" }].concat(solidosExtra || []),
      conectores: [
        { id: "e", nome: "Face 1 (entrada)", sistema: "gas", dn: "DN", x: "-Comprimento/2", y: "0", z: "0", papel: "entrada", dir: { x: -1, y: 0, z: 0 }, bidirecional: id === "ra-gas-registro", origemPos: "catalogo", aConferir: PROV },
        { id: "s", nome: "Face 2 (saída)", sistema: "gas", dn: "DN", x: "Comprimento/2", y: "0", z: "0", papel: "saida", dir: { x: 1, y: 0, z: 0 }, bidirecional: id === "ra-gas-registro", origemPos: "catalogo", aConferir: PROV }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: nome }
    };
  }

  var LISTA = [
    {
      id: "ra-gas-abrigo", previa: "modelador", nome: "Abrigo de GLP (2 botijões P13)", categoria: "gas", hospedagem: "livre",
      descricao: "Abrigo EXTERNO para 2 botijões P13 (um em uso, um reserva, com troca pelo registro), ventilado por grelhas nas portas, com câmara técnica atrás (regulador e registro de corte geral). O FUNDO (Z = 0) encosta na parede; a saída do gás é um ponto de parede na face de trás. " +
        "Fica fora da projeção da edificação, ao ar livre, acessível pela área externa. " + PROV + " O afastamento a ralos, caixas, ignição e casa de máquinas (NBR 13523) NÃO está no acervo: conferir.",
      parametros: [
        { nome: "Largura", tipoDado: "comprimento", escopo: "tipo", valor: 1.00, grupo: "Dimensões", descricao: "Interna, 2 botijões lado a lado (modelagem)" },
        { nome: "Profundidade", tipoDado: "comprimento", escopo: "tipo", valor: 0.80, grupo: "Dimensões", descricao: "Botijão + câmara técnica atrás (modelagem)" },
        { nome: "Altura", tipoDado: "comprimento", escopo: "tipo", valor: 1.20, grupo: "Dimensões", descricao: "Total (modelagem)" },
        { nome: "Camara", tipoDado: "comprimento", escopo: "tipo", valor: 0.40, grupo: "Dimensões", descricao: "Câmara técnica atrás dos botijões (regulador + registro de corte geral)" },
        { nome: "Altura_saida", tipoDado: "comprimento", escopo: "instancia", valor: 0.15, grupo: "Conexões", descricao: "Cota da saída da rede (face de trás), do piso do abrigo — premissa da RA, conferir" },
        { nome: "Diametro_botijao", tipoDado: "comprimento", escopo: "tipo", valor: 0.32, grupo: "Dimensões", descricao: "P13 usual (fabricante de GLP, a conferir)" },
        { nome: "Altura_botijao", tipoDado: "comprimento", escopo: "tipo", valor: 0.48, grupo: "Dimensões", descricao: "P13 usual (fabricante de GLP, a conferir)" },
        { nome: "Material", tipoDado: "material", escopo: "tipo", valor: "Alvenaria", grupo: "Materiais" },
        { nome: "Material_botijao", tipoDado: "material", escopo: "tipo", valor: "Metal", grupo: "Materiais" }
      ],
      tipos: [{ id: "p13x2", nome: "2 × P13 (um em uso, um reserva)", valores: {} }],
      solidos: [
        { id: "base", nome: "Laje de base", forma: "caixa", x: "0", y: "0", z: "Profundidade/2", dx: "Largura + 0.20", dy: "0.05", dz: "Profundidade", material: "Material" },
        { id: "fundo", nome: "Fundo", forma: "caixa", x: "0", y: "0.05", z: "0.05", dx: "Largura + 0.20", dy: "Altura - 0.05", dz: "0.10", material: "Material" },
        { id: "latE", nome: "Lateral esquerda", forma: "caixa", x: "-Largura/2 - 0.05", y: "0.05", z: "Profundidade/2", dx: "0.10", dy: "Altura - 0.05", dz: "Profundidade", material: "Material" },
        { id: "latD", nome: "Lateral direita", forma: "caixa", x: "Largura/2 + 0.05", y: "0.05", z: "Profundidade/2", dx: "0.10", dy: "Altura - 0.05", dz: "Profundidade", material: "Material" },
        { id: "teto", nome: "Tampa", forma: "caixa", x: "0", y: "Altura", z: "Profundidade/2", dx: "Largura + 0.20", dy: "0.05", dz: "Profundidade", material: "Material" },
        { id: "b1", nome: "Botijão 1 (em uso)", forma: "cilindro", eixo: "y", x: "-Largura/4", y: "0.05", z: "Camara + Diametro_botijao/2", raio: "Diametro_botijao/2", altura: "Altura_botijao", material: "Material_botijao" },
        { id: "b2", nome: "Botijão 2 (reserva)", forma: "cilindro", eixo: "y", x: "Largura/4", y: "0.05", z: "Camara + Diametro_botijao/2", raio: "Diametro_botijao/2", altura: "Altura_botijao", material: "Material_botijao" },
        { id: "grelha", nome: "Grelha de ventilação (portas)", forma: "caixa", x: "0", y: "0.10", z: "Profundidade - 0.01", dx: "Largura", dy: "Altura - 0.30", dz: "0.02", material: "Metal" }
      ],
      conectores: [
        { id: "saida", nome: "Saída da rede de gás (cobre)", sistema: "gas", dn: 22, x: "Largura/4", y: "Altura_saida", z: "0", papel: "saida", dir: { x: 0, y: 0, z: -1 }, origemPos: "catalogo", aConferir: "cota e posição da saída: modelagem da RA — conferir com o abrigo escolhido" }
      ],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: "Abrigo de GLP para 2 botijões P13 (alvenaria, ventilado)" }
    },
    inline("ra-gas-regulador", "Regulador de pressão de GLP", "Regulador de pressão do gás (peça em linha, 1/2\"); a pressão de saída é a do regulador escolhido (premissa 2,8 kPa no memorial).", "0.020", 0.12,
      [{ id: "bojo", nome: "Bojo", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "0", raio: "0.045", altura: "0.06", material: "Material" }]),
    inline("ra-gas-registro", "Registro de esfera para gás", "Registro de esfera para gás (corte geral e ponto de consumo), com alavanca.", "0.018", 0.07,
      [{ id: "alavanca", nome: "Alavanca", forma: "caixa", x: "0", y: "0.02", z: "0", dx: "0.07", dy: "0.012", dz: "0.014", material: "Material" }]),
    inline("ra-gas-ponto", "Ponto de gás com flexível metálico", "Ponto de consumo de gás com ligação por flexível metálico (a ponta da rede: o aparelho se liga aqui).", "0.016", 0.10, [])
  ];
  /* o ponto de consumo é a PONTA da rede: só a face de entrada tem conector (a de saída seria um tubo solto no flexível) */
  (function () {
    var f = LISTA[3];
    f.conectores = [f.conectores[0]];
    f.conectores[0].aConferir = PROV + " A saída é o flexível metálico até o aparelho (fora do modelo).";
  })();

  /* hid:geometria-fim */

  var Gas = { LISTA: LISTA, IDS: LISTA.map(function (f) { return f.id; }), PROV: PROV };
  global.HidGasFam = Gas;
  var RA = global.FamiliasRA || (typeof require === "function" ? (function () { try { return require("./familiasra.js"); } catch (e) { return null; } })() : null);
  if (RA && RA.registrar) RA.registrar(JSON.parse(JSON.stringify(LISTA)));
  if (typeof module !== "undefined" && module.exports) module.exports = Gas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

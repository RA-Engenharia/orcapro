/* test-orcamentista.js — conferência do Importador (v1.2.83) e do Agente
 * Orçamentista com bases SINTÉTICAS (sem arquivo de cliente). Roda em Node:
 *   node ferramentas/test-orcamentista.js
 * Falhou = exit 1 com a linha que reprovou. */
var path = require("path");
var Importador = require(path.join(__dirname, "..", "app", "js", "importador.js"));
var Orc = require(path.join(__dirname, "..", "app", "js", "orcamentista.js"));
var falhas = 0;
function ok(cond, msg) { if (cond) console.log("  ok  " + msg); else { falhas++; console.log("  FALHOU  " + msg); } }

console.log("Importador");
var m = [
  ["Item", "Fonte", "Código", "Descrição", "Unid.", "Quant.", "VALOR UNITARIO", "VL . BDI", "VALOR TOTAL"],
  [1, null, null, "SERVIÇOS PRELIMINARES", null, null, null, null, null],
  [1.1, null, "02.06.020", "Placa de identificação para obra", "m²", 6, null, null, null],
  ["3.0", null, null, "FUNDAÇÃO E ESTRUTURA", null, null, null, null, null],
  ["3.1", null, null, "FUNDAÇÃO", null, null, null, null, null],
  ["3.1.1", null, "12.05.020", "Estaca escavada", "m", 332, null, null, null],
  ["9.2.1", null, "4114.620", "Luminária retangular", "un", 48, null, null, null],
  ["9.2.6", "SINAPI", "90447", "RASGO LINEAR MANUAL EM ALVENARIA", "M", 118, null, null, null],
  ["10.1.15", null, null, "Expurgo em inox", "un", 1, null, null, null],
  [null, null, null, "Total Geral:", null, null, null, null, null]
];
var r = Importador.analisar(m);
ok(r.colunas.codigo === 2 && r.colunas.fonte === 1 && r.colunas.item === 0, "Fonte, Código e Item têm papéis próprios (" + JSON.stringify([r.colunas.codigo, r.colunas.fonte, r.colunas.item]) + ")");
var itens = []; r.etapas.forEach(function (e) { e.itens.forEach(function (i) { itens.push(i); }); });
ok(itens.length === 5, "5 itens (linha de total ignorada): " + itens.length);
ok(itens[0].codigo === "02.06.020", "código CPOS preservado: " + itens[0].codigo);
ok(itens[2].codigo === "41.14.620" && itens[2].codigoOriginal === "4114.620", "CPOS mal digitado normalizado: " + itens[2].codigo);
ok(itens[3].fonte === "SINAPI" && itens[3].codigo === "90447", "fonte declarada viaja com o item");
ok(itens[4].codigo === "" && itens[4].descricao === "Expurgo em inox", "item sem código entra sem inventar código");
var fund = r.etapas.filter(function (e) { return e.nome === "FUNDAÇÃO"; })[0];
ok(fund && fund.codigo === "3.1" && fund.pai === "FUNDAÇÃO E ESTRUTURA", "hierarquia: 3.1 FUNDAÇÃO sabe que a mãe é 3.0");
var meta = Importador.metaCabecalho([["Composição Sintética de Serviços-Padrão por Custo Unitário com BDI 20,81% - Alfabética"], [""], ["Data Base: MAIO/26"]]);
ok(meta.competencia === "2026-05" && meta.bdiIncluso === 20.81, "cabeçalho da tabela: competência 2026-05 e BDI 20,81% → " + JSON.stringify(meta));
var cols = Importador._detectarColunas([["Serviço", "Descrição do Serviço", "Unid.", "R$ Unit."], ["003247", "ABRIGO ALVENARIA", "UN", 9577.84], ["003847", "ABRIGO DE GAS", "UN", 2359.43], ["003168", "ACABAMENTO", "M2", 0.33]], 0, 4);
ok(cols.codigo === 0 && cols.descricao === 1 && cols.custoUnit === 3, "tabela oficial: 'Serviço' é o código, 'Descrição do Serviço' é a descrição");

console.log("Orçamentista");
var SIN = [
  { codigo: "90447", descricao: "RASGO LINEAR MANUAL EM ALVENARIA, PARA ELETRODUTOS", unidade: "M", custoUnitario: 12.92 },
  { codigo: "91845", descricao: "ELETRODUTO FLEXÍVEL CORRUGADO REFORÇADO, PVC, DN 25 MM (3/4\"), INSTALADO EM LAJE", unidade: "M", custoUnitario: 9.52 },
  { codigo: "87878", descricao: "CHAPISCO APLICADO EM ALVENARIAS E ESTRUTURAS DE CONCRETO INTERNAS", unidade: "M2", custoUnitario: 4.1 },
  { codigo: "101567", descricao: "CABO DE COBRE FLEXÍVEL ISOLADO, 95 MM²", unidade: "M", custoUnitario: 116 },
  { codigo: "377", descricao: "ASSENTO SANITARIO DE PLASTICO, TIPO CONVENCIONAL", unidade: "UN", custoUnitario: 43.5 }
];
var SBC = [{ codigo: "000020", descricao: "LOCACAO DA OBRA", unidade: "M2", custoUnitario: 10.69, bdiIncluso: 20.81 }];
var BASES = { SINAPI: SIN, SBC: SBC };
function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%\/,.]+/g, " ").replace(/\s+/g, " ").trim(); }
var ctx = {
  fontes: ["SINAPI", "SBC"], normalizar: norm,
  obter: function (f, c) { return (BASES[f] || []).filter(function (i) { return i.codigo === String(c); })[0] || null; },
  itensDe: function (f) { return BASES[f] || []; },
  buscar: function (t, o) { var ts = norm(t).split(" "), out = []; (o.fontes || ctx.fontes).forEach(function (f) { (BASES[f] || []).forEach(function (i) { var h = norm(i.codigo + " " + i.descricao); if (ts.every(function (x) { return h.indexOf(x) > -1; })) out.push({ item: i, fonte: f }); }); }); return out; },
  elaborar: function (desc, o) {
    if (/emboco/.test(norm(desc))) return { ok: true, comp: { codigo: "PROP-REV-001", descricao: desc, unidade: o.unidade, insumos: [{ codigo: "88316", descricao: "SERVENTE", unidade: "H", coeficiente: 0.5, custoUnitario: 20, categoria: "MO" }] }, custo: { total: 10, mo: 10, mat: 0, eq: 0 }, referencia: { codigo: "87879", descricao: "EMBOÇO", unidade: "M2", score: 0.7 }, confianca: "media", rota: { tipo: "calculada" } };
    if (/armadura/.test(norm(desc))) return { ok: true, comp: { codigo: "PROP-X", descricao: desc, unidade: o.unidade, insumos: [{ coeficiente: 1, custoUnitario: 1 }] }, custo: { total: 1 }, referencia: { codigo: "100863", descricao: "X", unidade: "UN", score: 0.6 }, confianca: "media", rota: { tipo: "propria" } };
    return { ok: false, erro: "sem análoga" };
  }
};
var etapas = [{ nome: "E", itens: [
  { codigo: "90447", fonte: "SINAPI", descricao: "RASGO LINEAR MANUAL EM ALVENARIA, PARA ELETRODUTOS", unidade: "m", quantidade: 10 },
  { codigo: "9845", fonte: "SINAPI", descricao: "ELETRODUTO FLEXÍVEL CORRUGADO REFORÇADO, PVC, DN 25 MM (3/4\"), INSTALADO EM LAJE", unidade: "m", quantidade: 5 },
  { codigo: "101567", fonte: "SINAPI", descricao: "ENTRADA DE ENERGIA ELÉTRICA, AÉREA, TRIFÁSICA", unidade: "un", quantidade: 1 },
  { codigo: "20", fonte: "", descricao: "Locação de obra de edificação", unidade: "m²", quantidade: 400 },
  { codigo: "17.02.020", descricao: "Chapisco", unidade: "m²", quantidade: 100 },
  { codigo: "17.02.120", descricao: "Emboço comum", unidade: "m²", quantidade: 100 },
  { codigo: "17.02.120", descricao: "Emboço comum", unidade: "m²", quantidade: 50 },
  { codigo: "10.01.040", descricao: "Armadura em barra de aço CA-50", unidade: "kg", quantidade: 100 },
  { codigo: "", descricao: "Posto de consumo completo dupla retenção", unidade: "un", quantidade: 14 },
  { codigo: "", descricao: "Assento sanitario de plastico, tipo convencional", unidade: "un", quantidade: 3 }
] }];
var P = Orc.planejar(etapas, ctx).plano;
ok(P[0].status === "casado" && P[0].via === "codigo" && P[0].confianca === 100 && P[0].custoUnitario === 12.92, "código na base declarada → casado 100%");
ok(P[1].status === "casado" && P[1].via === "descricao-exata" && P[1].codigo === "91845", "código truncado (9845) recuperado pela descrição idêntica → 91845");
ok(P[2].status === "revisar" && P[2].candidatos.some(function (c) { return c.via === "codigo" && /OUTRO/.test(c.motivo); }), "código declarado com descrição de outro serviço → revisar, nunca aceito calado");
ok(P[3].status === "casado" && P[3].fonte === "SBC" && P[3].codigo === "000020" && P[3].custoUnitario === 10.69, "zero à esquerda perdido (20 → 000020) casado na SBC pelo código + descrição");
ok(P[3].avisos.some(function (a) { return /BDI/.test(a); }), "aviso de preço publicado com BDI");
ok(P[4].status === "revisar" && P[4].codigo === "87878", "descrição vaga (Chapisco) → candidato com revisão");
ok(P[5].status === "propria" && P[5].comp && P[5].comp.insumos.length === 1 && P[5].custoUnitario === 10, "sem match → composição própria por analogia com insumos e coeficiente");
ok(P[6].status === "propria" && P[6].compartilhada && P[6].codigo === P[5].codigo, "descrição repetida reusa a MESMA composição própria");
ok(P[7].status === "pendente" && /por UN e o item é por kg/.test(P[7].avisos.join(" ")), "análoga com unidade diferente (UN × kg) não vira composição → pendente");
ok(P[8].status === "pendente" && P[8].comp && P[8].comp.insumos.length === 0, "nada casou e sem análoga → pendente com casca (sem insumo inventado)");
ok(P[9].status === "casado" && P[9].codigo === "377" && P[9].via === "descricao-exata", "sem código, descrição idêntica (insumo) → casado");
var item = Orc.itemParaOrcamento(P[0]);
ok(item.codigo === "90447" && item.baseFonte === null && item.orcamentista.via === "codigo", "itemParaOrcamento leva rastreabilidade");
var v = Orc.validarComposicaoIA(P[8], { unidade: "un", insumos: [{ descricao: "assento sanitario de plastico convencional", unidade: "un", coeficiente: 1, categoria: "MAT" }, { descricao: "valvula dupla retencao 1/2", unidade: "un", coeficiente: 2, categoria: "MAT" }] }, ctx);
ok(v && v.insumos.length === 2 && v.insumos[0].codigo === "377" && v.aCotar === 1 && v.custo.total === 43.5, "proposta da IA validada: insumo real ganha código/preço, o resto vira 'a cotar' (preço 0)");
ok(Orc.reconhecer("02.06.020").fonteProvavel === "CPOS" && Orc.reconhecer("101567").fonteProvavel === "SINAPI" && Orc.reconhecer("C.04.000.064086").fonteProvavel === null, "reconhecimento de formato de código");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

/* =====================================================================
 * demo-gestao.js — Dados de VITRINE da Gestão de Obras (só no ?demo=1)
 * Semeia a empresa "demo" com obra/RDO/medição/equipe/financeiro
 * plausíveis para: (a) screenshots reais do site, (b) o possível cliente
 * explorar a Gestão ao vivo sem cadastro. NUNCA toca em dados reais.
 * Idempotente: se a obra-vitrine já existe, não duplica.
 * ===================================================================== */
(function (global) {
  "use strict";

  var EID = "demo";

  var DemoGestao = {
    seed: function () {
      try {
        if (typeof Store === "undefined") return false;
        var jaTem = (Store.listar(EID, "obras") || []).some(function (o) { return o.id === "dg-obra1"; });
        if (jaTem) return true;

        Store.salvar(EID, "clientes", {
          id: "dg-cli1", nome: "Incorporadora Horizonte Ltda", tipo: "PJ", doc: "12.345.678/0001-90",
          telefone: "(34) 99876-5432", email: "obras@horizonte.com.br", cidade: "Uberlândia", uf: "MG",
          status: "ativo", origem: "indicacao"
        });

        Store.salvar(EID, "obras", {
          id: "dg-obra1", nome: "Residencial Vila Verde — 8 casas", clienteId: "dg-cli1",
          tipo: "residencial", fase: "estrutura", status: "andamento",
          local: "Uberlândia / MG", endereco: "Rua das Palmeiras, 450 — B. Jardim Colina",
          valor: 1850000, inicio: "2026-03-02", previsaoFim: "2026-12-18",
          responsavel: "Eng. João da Silva"
        });
        Store.salvar(EID, "obras", {
          id: "dg-obra2", nome: "Reforma Loja Center Sul", clienteId: "dg-cli1",
          tipo: "reforma", fase: "acabamento", status: "andamento",
          local: "Uberlândia / MG", valor: 240000, inicio: "2026-05-11", previsaoFim: "2026-08-30"
        });

        Store.salvar(EID, "contratos", {
          id: "dg-ct1", numero: "CT-2026-014", clienteId: "dg-cli1", clienteNome: "Incorporadora Horizonte Ltda",
          obraId: "dg-obra1", tipo: "empreitada_unitario", regime: "indireta", formaPgto: "medicao_retencao",
          valor: 1850000, retencaoPct: 5, status: "ativo", assinadoEm: "2026-02-20"
        });

        ["dg-col1|José Carlos Pereira|Mestre de obras|4200",
         "dg-col2|Antônio Souza|Pedreiro|2800",
         "dg-col3|Marcos Lima|Servente|1900"].forEach(function (s) {
          var p = s.split("|");
          Store.salvar(EID, "colaboradores", { id: p[0], nome: p[1], funcao: p[2], salario: Number(p[3]), status: "ativo", obraId: "dg-obra1", admissao: "2026-03-02" });
        });

        Store.salvar(EID, "rdo", {
          id: "dg-rdo1", numero: "RDO-0042", obraId: "dg-obra1", data: "2026-07-03",
          climaManha: "ensolarado", climaTarde: "ensolarado", efetivoDireto: 7, efetivoIndireto: 2,
          atividades: "Concretagem da laje do bloco B (32 m³, fck 25). Início da alvenaria estrutural das casas 5 e 6. Recebimento de 12 t de aço CA-50.",
          ocorrencias: "Sem ocorrências. Vistoria do cliente às 10h — sem apontamentos.",
          equipamentos: "1 betoneira 400L · 1 vibrador de imersão · andaimes fachadeiros",
          responsavel: "José Carlos Pereira", status: "finalizado", fotos: []
        });
        Store.salvar(EID, "rdo", {
          id: "dg-rdo2", numero: "RDO-0043", obraId: "dg-obra1", data: "2026-07-04",
          climaManha: "ensolarado", climaTarde: "nublado", efetivoDireto: 6, efetivoIndireto: 2,
          atividades: "Desforma da laje do bloco B. Alvenaria estrutural casas 5 e 6 (fiadas 4 a 9). Marcação das instalações elétricas do bloco A.",
          ocorrencias: "Atraso de 2h na entrega de blocos (fornecedor) — remanejada a equipe para desforma.",
          equipamentos: "andaimes fachadeiros · serra circular de bancada",
          responsavel: "José Carlos Pereira", status: "finalizado", fotos: []
        });

        Store.salvar(EID, "medicoes", {
          id: "dg-med1", numero: "BM-02", obraId: "dg-obra1", orcamentoNumero: "ORC-2026-0820",
          periodoInicio: "2026-05-01", periodoFim: "2026-05-31",
          percentual: 11.2, valor: 207200, retencaoPct: 5, status: "paga"
        });
        Store.salvar(EID, "medicoes", {
          id: "dg-med2", numero: "BM-03", obraId: "dg-obra1", orcamentoNumero: "ORC-2026-0820",
          periodoInicio: "2026-06-01", periodoFim: "2026-06-30",
          percentual: 18.5, valor: 342500, retencaoPct: 5, status: "aprovada",
          itens: [
            { itemId: "dgi1", etapa: "2.0 Estrutura", codigo: "103670", descricao: "Laje maciça de concreto armado, fck 25 MPa", unidade: "m³", qtdContratada: 180, precoUnit: 2350, pctAnterior: 35, pctPeriodo: 20, qtdMedida: 36, valor: 84600 },
            { itemId: "dgi2", etapa: "3.0 Alvenaria", codigo: "89464", descricao: "Alvenaria de blocos de concreto estrutural 14x19x39", unidade: "m²", qtdContratada: 2200, precoUnit: 92.5, pctAnterior: 18, pctPeriodo: 25, qtdMedida: 550, valor: 50875 },
            { itemId: "dgi3", etapa: "4.0 Instalações", codigo: "91926", descricao: "Eletroduto flexível corrugado 25 mm com fiação", unidade: "m", qtdContratada: 3400, precoUnit: 18.4, pctAnterior: 0, pctPeriodo: 12, qtdMedida: 408, valor: 7507.2 }
          ]
        });

        [["dg-f1", "2026-06-05", "Medição BM-02 recebida", "medicao", "receita", 207200, "pago"],
         ["dg-f2", "2026-06-12", "Aço CA-50 (12 t) — Gerdau", "material", "despesa", 58800, "pago"],
         ["dg-f3", "2026-06-20", "Folha de pessoal — junho", "mao_obra", "despesa", 41300, "pago"],
         ["dg-f4", "2026-07-02", "Locação de andaimes — julho", "equipamento", "despesa", 6400, "pendente"]].forEach(function (a) {
          Store.salvar(EID, "financeiro", { id: a[0], data: a[1], desc: a[2], categoria: a[3], obraId: "dg-obra1", tipo: a[4], valor: a[5], status: a[6] });
        });

        return true;
      } catch (e) { return false; }
    }
  };

  global.DemoGestao = DemoGestao;
  if (typeof module !== "undefined" && module.exports) module.exports = DemoGestao;
})(typeof window !== "undefined" ? window : this);

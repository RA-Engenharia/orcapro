/* =====================================================================
 * demo.js — Orçamento genérico de DEMONSTRAÇÃO (para prints e teste na página)
 * Usado só quando a URL tem ?demo=1. Não toca em dados reais.
 * ===================================================================== */
(function (global) {
  "use strict";

  function it(codigo, desc, un, qtd, cu, fMO, fMAT) {
    var mo = Math.round(cu * fMO * 100) / 100;
    var mat = Math.round(cu * fMAT * 100) / 100;
    var eq = Math.round((cu - mo - mat) * 100) / 100;
    return {
      id: Util.uid("itm"),
      origem: codigo ? "SINAPI" : "PROPRIO",
      baseFonte: codigo ? "SINAPI" : null,
      codigo: codigo || "—",
      descricao: desc, unidade: un,
      quantidade: qtd, custoUnitario: cu,
      custoMO: mo, custoMAT: mat, custoEQ: eq
    };
  }
  function eta(codigo, nome, itens) { return { id: Util.uid("eta"), codigo: codigo, nome: nome, itens: itens }; }

  var OrcDemo = {
    build: function () {
      var orc = Orcamento.novo({ numero: "ORC-2026-0820", nome: "Residência Unifamiliar — 120 m²" });
      orc.cliente = { nome: "Construtora Modelo Ltda", doc: "00.000.000/0001-00", contato: "contato@construtoramodelo.com.br" };
      orc.obra = { nome: "Residência Unifamiliar 120 m²", local: "Uberlândia / MG", regime: "Empreitada" };
      orc.art = "BR20260000000";
      orc.competenciaSinapi = orc.competenciaSinapi || "2026-05";
      orc.uf = orc.uf || "MG";

      orc.etapas = [
        eta("1.0", "Serviços Preliminares", [
          it("98525", "Placa de obra em chapa galvanizada", "m²", 6, 612.00, .25, .70),
          it("99059", "Limpeza mecanizada do terreno", "m²", 120, 5.80, .20, .00),
          it("96995", "Locação de obra com gabarito de tábuas", "m²", 120, 28.40, .65, .30)
        ]),
        eta("2.0", "Fundações", [
          it("96523", "Escavação manual de valas (fundação)", "m³", 18, 95.00, .90, .00),
          it("94965", "Concreto magro para lastro, e=5cm", "m³", 4, 520.00, .25, .70),
          it("94970", "Concreto usinado fck=25MPa para sapatas", "m³", 12, 620.00, .25, .70),
          it("92449", "Fôrma de madeira para fundação", "m²", 60, 78.00, .55, .42),
          it("92759", "Armação de aço CA-50 (fundação)", "kg", 850, 12.40, .25, .73)
        ]),
        eta("3.0", "Estrutura de Concreto Armado", [
          it("94972", "Concreto usinado fck=25MPa (pilares/vigas/lajes)", "m³", 28, 640.00, .25, .70),
          it("92447", "Fôrma de madeira para estrutura", "m²", 320, 82.00, .55, .42),
          it("92761", "Armação de aço CA-50 (estrutura)", "kg", 2100, 12.40, .25, .73),
          it("98557", "Laje pré-moldada para piso/forro", "m²", 90, 145.00, .35, .62)
        ]),
        eta("4.0", "Alvenaria e Vedações", [
          it("103333", "Alvenaria de bloco cerâmico 14x19x29cm", "m²", 240, 78.00, .45, .53),
          it("93183", "Vergas e contravergas em concreto armado", "m", 40, 38.00, .45, .53)
        ]),
        eta("5.0", "Cobertura", [
          it("92541", "Estrutura de madeira para telha cerâmica", "m²", 150, 92.00, .45, .53),
          it("94216", "Telha cerâmica tipo portuguesa", "m²", 150, 48.00, .40, .58)
        ]),
        eta("6.0", "Revestimentos e Acabamentos", [
          it("87905", "Chapisco em paredes internas/externas", "m²", 480, 9.80, .55, .43),
          it("87529", "Massa única (reboco) para recebimento de pintura", "m²", 480, 38.00, .58, .40),
          it("87703", "Contrapiso em argamassa, e=4cm", "m²", 120, 42.00, .45, .53),
          it("87263", "Revestimento cerâmico (porcelanato) para piso", "m²", 120, 118.00, .40, .58),
          it("88489", "Pintura látex acrílica, 2 demãos", "m²", 480, 26.00, .55, .43),
          it("87275", "Revestimento cerâmico de parede (áreas molhadas)", "m²", 60, 85.00, .45, .53)
        ]),
        eta("7.0", "Instalações", [
          it("89714", "Ponto de instalação hidrossanitária", "pto", 28, 185.00, .50, .47),
          it("93128", "Ponto de instalação elétrica", "pto", 42, 142.00, .50, .47),
          it(null, "Louças, metais e acessórios (verba)", "vb", 1, 6800.00, .20, .78)
        ])
      ];

      orc.cronogramaMeses = 6;
      orc.cronograma = { params: { equipes: 4, paralelismo: 0.30, diasUteisSemana: 5, custoDiaEquipe: 750 } };
      try {
        if (typeof DnitBdi !== "undefined") Orcamento.aplicarBdi(orc, "dnit", DnitBdi.params());
      } catch (e) {}
      orc.criadoEm = Util.agoraISO();
      orc.atualizadoEm = orc.criadoEm;
      return orc;
    }
  };

  global.OrcDemo = OrcDemo;
})(window);

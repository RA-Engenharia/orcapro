/* =====================================================================
 * orcamento.js — Modelo de domínio do Orçamento
 * Estrutura: Orçamento -> Etapas -> Itens (SINAPI ou próprios)
 * Calcula custo direto, BDI e preço de venda; gera analítico e sintético.
 * Lógica pura: não toca no DOM (a UI consome estes resultados).
 * ===================================================================== */
(function (global) {
  "use strict";

  var Orcamento = {

    /* Cria um orçamento novo, já com schema atual. */
    novo: function (dados) {
      dados = dados || {};
      var bdiParams = Bdi.paramsDoModelo("padrao");
      return {
        id: Util.uid("orc"),
        schemaVersao: CONFIG.schemaVersao,
        numero: dados.numero || ("ORC-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000)),
        nome: dados.nome || "Novo Orçamento",
        cliente: { nome: dados.cliente || "", doc: "", contato: "" },
        obra: { nome: dados.obra || "", local: "", regime: "Empreitada" },
        competenciaSinapi: Sinapi.competencia || CONFIG.sinapi.competenciaPadrao,
        uf: Sinapi.uf || CONFIG.sinapi.ufPadrao,
        desonerado: false,
        bdi: { modeloId: "padrao", params: bdiParams, percentual: Bdi.calcular(bdiParams) },
        comercial: this.comercialPadrao(),
        cronogramaMeses: 6,
        etapas: [],
        criadoEm: Util.agoraISO(),
        atualizadoEm: Util.agoraISO()
      };
    },

    comercialPadrao: function () {
      return {
        apresentacao: "",
        condicoesPagamento: "Pagamento por medição mensal dos serviços executados, com vencimento em 5 dias úteis após a aprovação da medição.",
        prazoExecucao: "A combinar conforme cronograma físico-financeiro.",
        validadeProposta: "15 dias corridos a contar da data de emissão.",
        garantia: "Garantia legal de 5 (cinco) anos para a solidez e segurança da obra, nos termos do art. 618 do Código Civil.",
        incluso: "Fornecimento de materiais e mão de obra dos serviços orçados;\nLeis sociais e encargos trabalhistas;\nFerramentas e equipamentos de execução;\nLimpeza periódica e final da obra.",
        excluso: "Projetos complementares e taxas de aprovação;\nLigações definitivas de água, energia e esgoto;\nMobiliário, paisagismo e itens de decoração;\nServiços não descritos expressamente nesta proposta."
      };
    },

    garantirComercial: function (orc) {
      if (!orc.comercial || typeof orc.comercial !== "object") orc.comercial = this.comercialPadrao();
      var pad = this.comercialPadrao();
      for (var k in pad) { if (orc.comercial[k] == null) orc.comercial[k] = pad[k]; }
      return orc.comercial;
    },

    // ---- Etapas ----
    addEtapa: function (orc, nome) {
      orc.etapas.push({ id: Util.uid("eta"), codigo: this._proxCodigoEtapa(orc), nome: nome || "Nova Etapa", itens: [] });
      return orc;
    },
    _proxCodigoEtapa: function (orc) {
      return String(Util.arr(orc.etapas).length + 1) + ".0";
    },
    removerEtapa: function (orc, etapaId) {
      orc.etapas = Util.arr(orc.etapas).filter(function (e) { return e.id !== etapaId; });
      return orc;
    },

    // ---- Itens ----
    // origem: item SINAPI (do motor) OU objeto próprio { descricao, unidade, custoUnitario }
    addItem: function (orc, etapaId, sinapiItem, quantidade) {
      var etapa = this._etapa(orc, etapaId);
      if (!etapa) return orc;
      var it = {
        id: Util.uid("itm"),
        origem: sinapiItem.codigo ? "SINAPI" : "PROPRIO",
        baseFonte: sinapiItem.baseFonte || (sinapiItem.codigo ? "SINAPI" : null),
        codigo: sinapiItem.codigo || "—",
        descricao: sinapiItem.descricao || "Item próprio",
        unidade: sinapiItem.unidade || "un",
        quantidade: Util.num(quantidade) || 1,
        custoUnitario: Util.num(sinapiItem.custoUnitario),
        custoMO: Util.num(sinapiItem.custoMO),
        custoMAT: Util.num(sinapiItem.custoMAT),
        custoEQ: Util.num(sinapiItem.custoEQ)
      };
      etapa.itens.push(it);
      return orc;
    },
    atualizarItem: function (orc, etapaId, itemId, campos) {
      var etapa = this._etapa(orc, etapaId);
      if (!etapa) return orc;
      var it = etapa.itens.filter(function (x) { return x.id === itemId; })[0];
      if (!it) return orc;
      if (campos.quantidade != null) it.quantidade = Util.num(campos.quantidade);
      if (campos.custoUnitario != null) it.custoUnitario = Util.num(campos.custoUnitario);
      if (campos.descricao != null) it.descricao = campos.descricao;
      return orc;
    },
    removerItem: function (orc, etapaId, itemId) {
      var etapa = this._etapa(orc, etapaId);
      if (etapa) etapa.itens = etapa.itens.filter(function (x) { return x.id !== itemId; });
      return orc;
    },
    _etapa: function (orc, etapaId) {
      return Util.arr(orc.etapas).filter(function (e) { return e.id === etapaId; })[0] || null;
    },

    // ---- BDI ----
    aplicarBdi: function (orc, modeloId, paramsCustom) {
      var params = paramsCustom || Bdi.paramsDoModelo(modeloId || "padrao");
      orc.bdi = { modeloId: modeloId || "custom", params: params, percentual: Bdi.calcular(params) };
      return orc;
    },

    // ---- Cálculos / Totais ----
    custoItem: function (it) { return Util.num(it.quantidade) * Util.num(it.custoUnitario); },

    totais: function (orc) {
      var custoDireto = 0, mo = 0, mat = 0, eq = 0, qtdItens = 0;
      Util.arr(orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          var ct = Util.num(it.quantidade) * Util.num(it.custoUnitario);
          custoDireto += ct;
          mo += Util.num(it.quantidade) * Util.num(it.custoMO);
          mat += Util.num(it.quantidade) * Util.num(it.custoMAT);
          eq += Util.num(it.quantidade) * Util.num(it.custoEQ);
          qtdItens++;
        });
      });
      var pct = orc.bdi ? orc.bdi.percentual : 0;
      var precoVenda = Bdi.aplicar(custoDireto, pct);
      return {
        custoDireto: custoDireto,
        mo: mo, mat: mat, eq: eq,
        bdiPercentual: pct,
        bdiValor: precoVenda - custoDireto,
        precoVenda: precoVenda,
        qtdItens: qtdItens,
        qtdEtapas: Util.arr(orc.etapas).length
      };
    },

    // Resumo sintético: uma linha por etapa
    sintetico: function (orc) {
      var pct = orc.bdi ? orc.bdi.percentual : 0;
      var totalGeral = this.totais(orc).precoVenda || 1;
      return Util.arr(orc.etapas).map(function (e) {
        var custo = 0;
        Util.arr(e.itens).forEach(function (it) { custo += Util.num(it.quantidade) * Util.num(it.custoUnitario); });
        var venda = Bdi.aplicar(custo, pct);
        return {
          codigo: e.codigo, nome: e.nome, qtdItens: Util.arr(e.itens).length,
          custoDireto: custo, precoVenda: venda, peso: (venda / totalGeral) * 100
        };
      });
    },

    // Linha a linha (analítico) — útil p/ export
    analitico: function (orc) {
      var linhas = [], pct = orc.bdi ? orc.bdi.percentual : 0;
      Util.arr(orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          var custo = Util.num(it.quantidade) * Util.num(it.custoUnitario);
          linhas.push({
            etapa: e.codigo + " " + e.nome,
            origem: it.origem, codigo: it.codigo, descricao: it.descricao, unidade: it.unidade,
            quantidade: Util.num(it.quantidade), custoUnitario: Util.num(it.custoUnitario),
            custoTotal: custo, precoVenda: Bdi.aplicar(custo, pct)
          });
        });
      });
      return linhas;
    },

    // Exporta o analítico como CSV (separador ; — padrão Excel BR)
    exportarCSV: function (orc) {
      var linhas = this.analitico(orc);
      var head = ["Etapa", "Origem", "Codigo", "Descricao", "Unid", "Qtd", "Custo Unit", "Custo Total", "Preco Venda"];
      var rows = [head.join(";")];
      linhas.forEach(function (l) {
        rows.push([
          '"' + l.etapa + '"', l.origem, l.codigo, '"' + l.descricao + '"', l.unidade,
          Util.fmtNum(l.quantidade, 2), Util.fmtNum(l.custoUnitario, 2),
          Util.fmtNum(l.custoTotal, 2), Util.fmtNum(l.precoVenda, 2)
        ].join(";"));
      });
      var t = this.totais(orc);
      rows.push("");
      rows.push(["TOTAL", "", "", "", "", "", "", Util.fmtNum(t.custoDireto, 2), Util.fmtNum(t.precoVenda, 2)].join(";"));
      return "﻿" + rows.join("\r\n"); // BOM p/ acentos no Excel
    },

    // ---- Curva ABC (itens ordenados por custo, classes A/B/C) ----
    curvaABC: function (orc) {
      var itens = [];
      Util.arr(orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          var custo = Util.num(it.quantidade) * Util.num(it.custoUnitario);
          itens.push({ codigo: it.codigo, descricao: it.descricao, unidade: it.unidade,
            quantidade: Util.num(it.quantidade), custoTotal: custo, etapa: e.nome });
        });
      });
      itens.sort(function (a, b) { return b.custoTotal - a.custoTotal; });
      var total = itens.reduce(function (s, x) { return s + x.custoTotal; }, 0) || 1;
      var acum = 0;
      var resumo = { A: { qtd: 0, valor: 0 }, B: { qtd: 0, valor: 0 }, C: { qtd: 0, valor: 0 } };
      itens.forEach(function (x) {
        x.pct = (x.custoTotal / total) * 100;
        acum += x.custoTotal;
        x.acumPct = (acum / total) * 100;
        x.classe = x.acumPct <= 80 ? "A" : (x.acumPct <= 95 ? "B" : "C");
        resumo[x.classe].qtd++;
        resumo[x.classe].valor += x.custoTotal;
      });
      ["A", "B", "C"].forEach(function (k) { resumo[k].pct = (resumo[k].valor / total) * 100; });
      return { linhas: itens, total: total, resumo: resumo };
    },

    // ---- Cronograma físico-financeiro ----
    // Distribui o custo de cada etapa sequencialmente ao longo de N meses,
    // proporcional ao peso da etapa (modelo de "tempo-custo" exato: a soma
    // mensal fecha com o total). Usa preço de venda (com BDI).
    cronograma: function (orc, meses) {
      meses = parseInt(meses || orc.cronogramaMeses || 6, 10);
      if (meses < 1) meses = 1;
      var sint = this.sintetico(orc);
      var total = sint.reduce(function (s, e) { return s + e.precoVenda; }, 0) || 1;

      var etapas = [], cum = 0;
      sint.forEach(function (e) {
        var c0 = cum / total, c1 = (cum + e.precoVenda) / total; cum += e.precoVenda;
        var linha = { codigo: e.codigo, nome: e.nome, total: e.precoVenda, meses: [] };
        for (var m = 0; m < meses; m++) {
          var ms = m / meses, me = (m + 1) / meses;
          var overlap = Math.max(0, Math.min(c1, me) - Math.max(c0, ms));
          linha.meses.push(overlap * total);
        }
        etapas.push(linha);
      });

      var totaisMes = [], acum = [], soma = 0;
      for (var m = 0; m < meses; m++) {
        var tm = etapas.reduce(function (s, e) { return s + e.meses[m]; }, 0);
        soma += tm; totaisMes.push(tm); acum.push((soma / total) * 100);
      }
      return { meses: meses, etapas: etapas, totaisMes: totaisMes, acumPct: acum, total: total };
    }
  };

  global.Orcamento = Orcamento;
})(window);

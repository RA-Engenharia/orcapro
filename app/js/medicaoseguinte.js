/* =====================================================================
 * medicaoseguinte.js — A MEDIÇÃO DO MÊS QUE VEM, A PARTIR DA ANTERIOR
 *
 * Pedido do cliente, em uma linha: "poder criar medições puxando mês
 * anterior". O que dói hoje é redigitar a mesma lista de serviços todo
 * mês — a obra é a mesma, o contrato é o mesmo, os itens são os mesmos.
 * O que muda é o quanto andou.
 *
 * ⚠ COPIAR MEDIÇÃO É PERIGOSO, E O PERIGO TEM NOME: COBRAR DUAS VEZES.
 * Um boletim é documento de dinheiro. Copiar "tudo" traria junto o valor,
 * as quantidades e o status aprovado do mês passado — e sairia um segundo
 * boletim, com outro número, cobrando o mesmo serviço. Por isso a cópia é
 * uma ALLOWLIST, não um clone: entra o que descreve O QUE se mede, e fica
 * de fora tudo que diz QUANTO já foi medido.
 *
 *   VEM JUNTO ........ obra, contrato, modo, orçamento, retenção,
 *                      a LISTA de itens (código, descrição, unidade,
 *                      preço unitário, quantidade contratada)
 *   NÃO VEM .......... valor, quantidades e percentuais do período,
 *                      status, datas de aprovação, quem aprovou,
 *                      número do boletim, id, data de pagamento
 *
 * ⚠ E O ACUMULADO ANTERIOR NÃO É COPIADO — É RECALCULADO.
 * Na medição por itens, `pctAnterior` é quanto o item já tinha sido medido
 * ANTES daquele boletim. Copiar o `pctAnterior` do mês passado faria o mês
 * novo ignorar o próprio mês passado, e o item poderia ser medido duas
 * vezes até 100%. Aqui ele é somado de novo, a partir dos boletins que
 * existem — e só dos que têm data ATÉ a do novo período.
 *
 * Esse último detalhe já custou caro neste sistema: o acumulado "anterior"
 * somava boletim com data POSTERIOR, e o erro só apareceu quando alguém
 * leu o impresso.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v == null ? "" : v).trim();
    if (!s) return 0;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function texto(s) { return String(s == null ? "" : s).trim(); }
  function r2(n) { return Math.round(n * 100) / 100; }

  /* --------------------------------------------------------------------
   * Qual é a medição "anterior" de uma obra.
   * A mais recente pelo FIM do período; empate resolve pelo número, e
   * depois pela ordem de criação. Ordenar só por número seria frágil:
   * "10ª" vem antes de "2ª" em ordem alfabética.
   * ------------------------------------------------------------------ */
  function ultimaDaObra(medicoes, obraId, ate) {
    var lista = (medicoes || []).filter(function (m) {
      if (!m || texto(m.obraId) !== texto(obraId)) return false;
      if (m.status === "rejeitada") return false; // v1.1.234 — puxar de boletim recusado semearia acumulado errado
      if (ate && texto(m.periodoFim) && texto(m.periodoFim) > ate) return false;
      return true;
    });
    if (!lista.length) return null;
    lista.sort(function (a, b) {
      var fa = texto(a.periodoFim), fb = texto(b.periodoFim);
      if (fa !== fb) return fa < fb ? -1 : 1;
      var na = numeroDe(a), nb = numeroDe(b);
      if (na !== nb) return na - nb;
      return num(a.criadoEm) - num(b.criadoEm);
    });
    return lista[lista.length - 1];
  }

  /* "10ª" -> 10. Sem isto, a ordenação por texto põe a 10ª antes da 2ª. */
  function numeroDe(m) {
    var d = String((m && m.numero) || "").replace(/\D+/g, "");
    return d ? parseInt(d, 10) : 0;
  }

  /* --------------------------------------------------------------------
   * O PERÍODO SEGUINTE.
   * Começa no dia seguinte ao fim do anterior e vai até o fim do mês desse
   * dia. Assim, medição de 01/07–31/07 gera 01/08–31/08 sem ninguém digitar.
   *
   * ⚠ Datas em UTC de propósito. `new Date("2026-08-31")` já é UTC; misturar
   * com construtor local faz o dia 1º virar o último dia do mês anterior em
   * fuso negativo — e o Brasil inteiro é fuso negativo.
   * ------------------------------------------------------------------ */
  function periodoSeguinte(fimAnterior) {
    var f = texto(fimAnterior);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { inicio: "", fim: "" };
    var d = new Date(f + "T12:00:00Z");
    if (isNaN(d.getTime())) return { inicio: "", fim: "" };
    d.setUTCDate(d.getUTCDate() + 1);
    var ini = d.toISOString().slice(0, 10);
    /* fim = último dia do mês do início */
    var fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12));
    return { inicio: ini, fim: fim.toISOString().slice(0, 10) };
  }

  function proximoNumero(medicoes, obraId) {
    var maior = 0;
    (medicoes || []).forEach(function (m) {
      if (!m || (obraId && texto(m.obraId) !== texto(obraId))) return;
      var n = numeroDe(m);
      if (n > maior) maior = n;
    });
    return String(maior + 1).padStart(2, "0") + "ª";
  }

  /* --------------------------------------------------------------------
   * O ACUMULADO ANTERIOR DE CADA ITEM, recalculado dos boletins.
   * `ate` é a data de INÍCIO do novo período: boletim que termina depois
   * disso não é "anterior" — é futuro, e não entra (a armadilha que já
   * apareceu na medição por preços unitários).
   * ------------------------------------------------------------------ */
  function acumuladoAte(medicoes, obraId, ate, excluirId) {
    var porItem = {}, porAtividade = {};
    (medicoes || []).forEach(function (m) {
      if (!m || texto(m.obraId) !== texto(obraId)) return;
      if (m.status === "rejeitada") return; // v1.1.234
      if (excluirId && texto(m.id) === texto(excluirId)) return;
      var fim = texto(m.periodoFim);
      if (ate && fim && fim >= ate) return;          // só o que fechou ANTES
      (m.itens || []).forEach(function (it) {
        if (!it) return;
        if (it.itemId) porItem[it.itemId] = r2((porItem[it.itemId] || 0) + num(it.pctPeriodo));
        if (it.atividadeId) porAtividade[it.atividadeId] = r2((porAtividade[it.atividadeId] || 0) + num(it.qtd));
      });
    });
    return { porItem: porItem, porAtividade: porAtividade };
  }

  /* --------------------------------------------------------------------
   * A SEMENTE da próxima medição.
   *
   * `d`: { medicoes, obraId, hoje }
   * Devolve `{ ok, medicao, base, avisos }` — ou `{ ok:false, motivo }`
   * quando não há de onde puxar.
   * ------------------------------------------------------------------ */
  function puxar(d) {
    d = d || {};
    var obraId = texto(d.obraId);
    if (!obraId) return { ok: false, motivo: "sem-obra" };

    /* ⚠ A REGRA DO FUTURO VALE TAMBÉM PARA ESCOLHER A BASE.
       Eu tinha aplicado "boletim do futuro não conta" só no acumulado, e o
       teste pegou: com um boletim lançado para dezembro, ele virava a BASE
       em agosto — o período novo saía em janeiro e o acumulado engolia os
       90% de dezembro. Boletim com data futura costuma ser erro de
       digitação; ignorá-lo em silêncio seria esconder o erro, então ele é
       excluído E dito. */
    var hoje = texto(d.hoje);
    var base = ultimaDaObra(d.medicoes, obraId, hoje || null);
    if (!base) {
      /* se existe medição mas todas são futuras, o motivo é outro e o
         usuário precisa saber qual */
      var futuras = (d.medicoes || []).filter(function (m) {
        return m && texto(m.obraId) === obraId && texto(m.periodoFim) > (hoje || "");
      }).length;
      if (futuras) return { ok: false, motivo: "so-futuras", futuras: futuras };
      return { ok: false, motivo: "sem-anterior" };
    }

    var per = periodoSeguinte(base.periodoFim);
    var avisos = [];
    if (!per.inicio) {
      /* sem período no boletim anterior não dá para adivinhar o seguinte —
         melhor deixar em branco e dizer, do que inventar um mês */
      avisos.push("A medição anterior não tinha período preenchido — informe as datas do novo período.");
    }

    var acum = acumuladoAte(d.medicoes, obraId, per.inicio || d.hoje, null);

    /* ⚠ O ORÇAMENTO DA BASE PODE TER SUMIDO.
       Eu copiava `orcamentoId` sem conferir. O e2e mostrou o estrago: com um
       orçamento inexistente, o formulário não acha o registro, o seletor volta
       vazio e a medição DEGRADA para o modo manual — sem itens e sem ninguém
       avisado. O usuário salvaria um boletim de valor solto achando que estava
       medindo por itens. Agora, se o chamador informar quais orçamentos
       existem, a falta é dita em voz alta. */
    if (Array.isArray(d.orcamentosValidos) && texto(base.orcamentoId)) {
      var existe = d.orcamentosValidos.some(function (o) {
        return texto(o && (o.id || o)) === texto(base.orcamentoId);
      });
      if (!existe) {
        avisos.push("O orçamento da medição anterior não existe mais — escolha o orçamento antes de salvar, ou a medição vira manual.");
      }
    }

    var comFuturo = (d.medicoes || []).filter(function (m) {
      return m && texto(m.obraId) === obraId && hoje && texto(m.periodoFim) > hoje;
    }).length;
    if (comFuturo) {
      avisos.push(comFuturo + " boletim(ns) com período em data futura foram ignorados — confira se a data está certa.");
    }

    var itens = (base.itens || []).map(function (it) {
      if (!it) return null;
      var novo = {
        /* identidade e descrição: é o que o usuário não quer redigitar */
        itemId: it.itemId || "", atividadeId: it.atividadeId || "",
        codigo: it.codigo || "", descricao: it.descricao || "", unidade: it.unidade || "",
        etapa: it.etapa || ""
      };
      if (it.atividadeId) {
        /* modo ATIVIDADES: preço unitário volta, quantidade do período NÃO */
        novo.valorUnitario = num(it.valorUnitario);
        novo.qtd = 0;
        novo.qtdAnterior = acum.porAtividade[it.atividadeId] || 0;
        novo.valor = 0;
      } else {
        /* modo ORÇAMENTO: contratado e preço voltam; o % do período NÃO */
        novo.qtdContratada = num(it.qtdContratada);
        novo.precoUnit = num(it.precoUnit);
        novo.pctAnterior = acum.porItem[it.itemId] || 0;
        novo.pctPeriodo = 0;
        novo.qtdMedida = 0;
        novo.valor = 0;
      }
      return novo;
    }).filter(Boolean);

    var cheios = itens.filter(function (it) {
      return it.pctAnterior != null && it.pctAnterior >= 100;
    }).length;
    if (cheios) {
      avisos.push(cheios + " item(ns) já estão em 100% medidos — confira se ainda devem entrar neste boletim.");
    }

    var medicao = {
      /* ⚠ ALLOWLIST. Nada de `Object.assign(base)`: um spread traria valor,
         status e aprovação do mês passado, e o boletim novo nasceria
         cobrando de novo o que já foi pago. */
      obraId: base.obraId || "",
      contratoId: base.contratoId || "",
      modo: base.modo || (base.orcamentoId ? "orcamento" : (itens.some(function (i) { return i.atividadeId; }) ? "atividades" : "valor")),
      orcamentoId: base.orcamentoId || null,
      retencao: base.retencao == null ? 5 : num(base.retencao),
      numero: proximoNumero(d.medicoes, obraId),
      periodoInicio: per.inicio,
      periodoFim: per.fim,
      /* SEMPRE pendente: boletim nasce para ser conferido, não aprovado */
      status: "pendente",
      valor: 0,
      percentual: 0,
      descricao: "",
      itens: itens.length ? itens : null,
      /* rastro: de onde esta medição foi puxada, para quem conferir depois
         saber que ela não foi digitada do zero */
      puxadaDe: base.id || "",
      puxadaEm: d.hoje || ""
    };

    return {
      ok: true, medicao: medicao, avisos: avisos,
      base: { id: base.id, numero: base.numero, periodoInicio: base.periodoInicio,
              periodoFim: base.periodoFim, itens: (base.itens || []).length, valor: num(base.valor) }
    };
  }

  var MedicaoSeguinte = {
    puxar: puxar, ultimaDaObra: ultimaDaObra, periodoSeguinte: periodoSeguinte,
    proximoNumero: proximoNumero, acumuladoAte: acumuladoAte
  };
  global.MedicaoSeguinte = MedicaoSeguinte;
  if (typeof module !== "undefined" && module.exports) module.exports = MedicaoSeguinte;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

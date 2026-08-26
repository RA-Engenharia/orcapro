/* =====================================================================
 * reconciliacao.js — DINHEIRO FECHADO QUE NINGUÉM LANÇOU
 *
 * O OrçaPRO já liga tudo: folha semanal vira despesa, produção vira folha,
 * medição paga vira receita. Só que cada uma dessas pontes é um BOTÃO que
 * alguém tem de apertar. Quando ninguém aperta, não acontece nada — sem
 * erro, sem marca, sem alarme. A obra simplesmente aparece mais lucrativa
 * do que é, e o dono descobre no fim.
 *
 * Numa obra tocada por diarista, mão de obra é a maior despesa. Uma semana
 * de folha esquecida some do custo da obra e a margem sobe sozinha.
 *
 * ⚠ O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO
 * Não corrige nada e não lança nada. Ele só mostra o que ficou pelo
 * caminho, com o valor e o caminho para resolver. Automação que lança
 * dinheiro sozinha é como se descobre, seis meses depois, que a metade
 * estava errada.
 *
 * E não inventa: cada achado abaixo se apoia numa marca que o próprio
 * sistema grava. Nada é heurística de texto livre.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? 0 : v).replace(/\./g, "").replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  function texto(s) { return String(s == null ? "" : s).trim(); }

  /* a segunda-feira da semana de uma data ISO — mesma chave da Folha Semanal */
  function semanaDe(iso) {
    var d = new Date(texto(iso) + "T12:00:00Z");
    if (isNaN(d.getTime())) return "";
    var dow = d.getUTCDay();                       // 0=dom
    var ate = dow === 0 ? 6 : dow - 1;             // volta para segunda
    d.setUTCDate(d.getUTCDate() - ate);
    return d.toISOString().slice(0, 10);
  }
  function diasEntre(isoA, isoB) {
    var a = new Date(texto(isoA) + "T12:00:00Z"), b = new Date(texto(isoB) + "T12:00:00Z");
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.round((b - a) / 86400000);
  }

  /* --------------------------------------------------------------------
   * `d`: { fsLancamentos, financeiro, producaoMed, medicoes, obras, hoje }
   * `opc.diasMedicao`: quantos dias uma medição aprovada pode ficar sem o
   *    recebimento registrado antes de virar achado (padrão 15).
   * ------------------------------------------------------------------ */
  function achar(d, opc) {
    d = d || {}; var o = opc || {};
    var hoje = texto(d.hoje) || "";
    var diasMed = typeof o.diasMedicao === "number" ? o.diasMedicao : 15;
    var fin = d.financeiro || [];
    var obras = d.obras || [];
    var nomeObra = {};
    obras.forEach(function (ob) { if (ob && ob.id) nomeObra[ob.id] = ob.nome || ""; });
    var achados = [];

    /* ---- 1) SEMANA DE FOLHA FECHADA E NÃO LANÇADA ----
       A marca é a mesma que o `fsFinanceiro` grava: "[Folha semanal AAAA-MM-DD]"
       no início da descrição, uma despesa por obra. Semana SEM essa marca é
       trabalho pago à mão de obra que nunca virou custo da obra. */
    var semanaAtual = hoje ? semanaDe(hoje) : "";
    var porSemanaObra = {};
    (d.fsLancamentos || []).forEach(function (l) {
      if (!l) return;
      var sem = texto(l.semana), ob = texto(l.obraId);
      if (!sem || !ob) return;
      /* a semana corrente ainda está aberta: cobrar dela seria o alarme que
         toca todo dia e que ninguém mais escuta */
      if (semanaAtual && sem >= semanaAtual) return;
      var k = sem + "|" + ob;
      if (!porSemanaObra[k]) porSemanaObra[k] = { semana: sem, obraId: ob, total: 0, n: 0 };
      porSemanaObra[k].total += num(l.valor) + num(l.he) +
        ["seg", "ter", "qua", "qui", "sex", "sab", "dom"].reduce(function (s, dia) {
          return s + num(l.dias && l.dias[dia]);
        }, 0);
      porSemanaObra[k].n++;
    });
    Object.keys(porSemanaObra).forEach(function (k) {
      var g = porSemanaObra[k];
      if (g.total <= 0) return;
      var marca = "[Folha semanal " + g.semana + "]";
      var lancado = fin.some(function (f) {
        return f && texto(f.obraId) === g.obraId && texto(f.desc).indexOf(marca) === 0;
      });
      if (lancado) return;
      achados.push({
        tipo: "folha-nao-lancada", gravidade: 3,
        titulo: "Semana de folha fechada e não lançada",
        detalhe: "Semana de " + g.semana + " · " + g.n + " lançamento(s)"
          + (nomeObra[g.obraId] ? " · " + nomeObra[g.obraId] : ""),
        porque: "Esse custo de mão de obra não está na obra — a margem dela aparece maior do que é.",
        valor: g.total, obraId: g.obraId, view: "folhasemanal",
        acao: "Abra a Folha Semanal nessa semana e use “Lançar no Financeiro”."
      });
    });

    /* ---- 2) PRODUÇÃO APROVADA QUE NÃO VIROU FOLHA ----
       `prodParaFolha` grava `fsLancamentoId` no boletim. Aprovado sem esse
       campo é serviço medido e conferido que ninguém mandou pagar. */
    (d.producaoMed || []).forEach(function (m) {
      if (!m || m.cancelada) return;
      if (texto(m.status) !== "aprovado" && texto(m.status) !== "aprovada") return;
      if (texto(m.fsLancamentoId)) return;
      var v = num(m.total);
      if (v <= 0) return;
      achados.push({
        tipo: "producao-sem-folha", gravidade: 3,
        titulo: "Produção aprovada que não foi para a folha",
        detalhe: "Boletim de " + texto(m.de) + " a " + texto(m.ate)
          + (nomeObra[m.obraId] ? " · " + nomeObra[m.obraId] : ""),
        porque: "O serviço foi conferido e aprovado, mas ninguém mandou pagar — e o custo não entrou na obra.",
        valor: v, obraId: m.obraId, view: "producao",
        acao: "Abra Produção, no boletim aprovado, e use “Mandar para a folha”."
      });
    });

    /* ---- 3) MEDIÇÃO APROVADA E NÃO RECEBIDA ----
       A receita nasce quando a medição é marcada como PAGA (dataPgto). Medição
       aprovada há tempo sem isso é dinheiro que a construtora já pode cobrar e
       que não aparece em lugar nenhum do caixa.

       ⚠ Tem prazo de propósito. Toda medição passa por "aprovada e ainda não
       paga" — é o estado normal por alguns dias. Sem o prazo, este achado
       apareceria sempre e viraria ruído. */
    (d.medicoes || []).forEach(function (m) {
      if (!m) return;
      var st = texto(m.status);
      if (st !== "aprovado" && st !== "aprovada") return;
      if (texto(m.dataPgto)) return;
      var v = num(m.valor);
      if (v <= 0) return;
      var desde = texto(m.aprovadoEm) || texto(m.periodoFim) || texto(m.criadoEm).slice(0, 10);
      var dias = hoje && desde ? diasEntre(desde, hoje) : 0;
      if (dias < diasMed) return;
      achados.push({
        tipo: "medicao-sem-recebimento", gravidade: 2,
        titulo: "Medição aprovada há " + dias + " dias e não recebida",
        detalhe: "Medição " + (texto(m.numero) || "—")
          + (nomeObra[m.obraId] ? " · " + nomeObra[m.obraId] : ""),
        porque: "Você aprovou e o recebimento não foi registrado. Não entra no caixa nem alerta de atraso.",
        valor: v, obraId: m.obraId, view: "medicoes",
        acao: "Se o cliente pagou, marque a data de pagamento. Se não pagou, é cobrança em aberto."
      });
    });

    /* ---- 4) APURAÇÃO DA REMUNERAÇÃO VARIÁVEL APROVADA E NÃO ENVIADA À FOLHA ----
       ⚠ ESTA É A PONTE MAIS SILENCIOSA DAS QUATRO. `rv-folha` grava
       `fsLancamentos` na apuração e muda o estado para "paga". Uma apuração que
       ficou em "aprovada" é mês homologado pela gestão que ninguém mandou pagar
       — e a metragem dela JÁ conta como paga (`RemunVar.jaPago` trata
       "aprovada" como paga, para não pagar duas vezes). Ou seja: não volta na
       apuração seguinte, não vira dinheiro, e não aparece em lugar nenhum.
       Trabalho aprovado que some.

       Para quem usa o perfil da carpintaria isto é o principal: das outras
       três pontes, duas nascem de módulos que o perfil deles esconde. */
    (d.remunApur || []).forEach(function (a2) {
      if (!a2) return;
      if (texto(a2.estado) !== "aprovada") return;         // "paga" já foi; "rascunho" ainda não é hora
      var vivos = (a2.fsLancamentos || []).length;
      if (vivos) return;
      /* ⚠ O VALOR MORA EM `poteCent`, EM CENTAVOS INTEIROS — não existe campo
         `total` na apuração gravada (ver o que `RemunVar.aprovar` escreve).
         Ler `total` devolvia 0 em todas, o `v <= 0` descartava todas, e esta
         regra existiria sem nunca achar nada. Foi o que quase aconteceu aqui:
         o teste passava porque a FIXTURE inventava o campo. */
      var v = num(a2.poteCent) / 100;
      if (v <= 0) return;
      /* prazo, como o da medição: aprovar hoje e mandar à folha amanhã é o
         normal. Sem isso o alarme tocaria no dia da aprovação, todo mês — e
         alarme que toca sempre é alarme que ninguém escuta. */
      var desdeAp = texto(a2.aprovadaEm).slice(0, 10);
      if (hoje && desdeAp && diasEntre(desdeAp, hoje) < 3) return;
      achados.push({
        tipo: "apuracao-sem-folha", gravidade: 3,
        titulo: "Apuração aprovada que não foi para a folha",
        detalhe: "Competência " + (texto(a2.competencia) || "—")
          + (nomeObra[a2.obraId] ? " · " + nomeObra[a2.obraId] : ""),
        porque: "A gestão homologou o mês e ninguém mandou pagar. A metragem já conta como paga, então ela não volta sozinha na apuração seguinte.",
        valor: v, obraId: a2.obraId, view: "remunvar",
        acao: "Abra Remuneração variável, no histórico, e use “Mandar para a Folha Semanal”."
      });
    });

    achados.sort(function (a, b) {
      if (b.gravidade !== a.gravidade) return b.gravidade - a.gravidade;
      return b.valor - a.valor;
    });
    return {
      total: achados.length,
      valor: achados.reduce(function (s, a) { return s + a.valor; }, 0),
      /* separado porque a leitura muda: um é custo que falta (a margem está
         mentindo para cima), o outro é receita que falta (o caixa está
         mentindo para baixo) */
      custoQueFalta: achados.filter(function (a) { return a.tipo !== "medicao-sem-recebimento"; })
        .reduce(function (s, a) { return s + a.valor; }, 0),
      receitaQueFalta: achados.filter(function (a) { return a.tipo === "medicao-sem-recebimento"; })
        .reduce(function (s, a) { return s + a.valor; }, 0),
      itens: achados
    };
  }

  var Reconciliacao = { achar: achar, semanaDe: semanaDe, diasEntre: diasEntre };
  global.Reconciliacao = Reconciliacao;
  if (typeof module !== "undefined" && module.exports) module.exports = Reconciliacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

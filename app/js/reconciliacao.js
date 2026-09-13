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

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js). Este módulo é puro — o
     gate o roda em Node, onde `Util` não existe — então a regra vem copiada.
     ⚠ E CÓPIA APODRECE CALADA: as duas versões curtas que existiam neste
     projeto erram em direções OPOSTAS, e as duas já moveram dinheiro:
     `replace(/\./g,"")` lê "1234.56" como 123456 (×100); tratar o ponto só
     quando há vírgula lê "1.850.000" como 1,85 (÷1.000.000).
     A paridade com o `Util.parseNum` real é cobrada em tools/test-numbr.js. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, "");
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else { var iP = s.lastIndexOf("."); s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1); }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function texto(s) { return String(s == null ? "" : s).trim(); }
  /* módulo puro, sem `Util`: "R$ 24.827,61" à mão — só para o texto do achado */
  function moeda(v) {
    var p = (Math.round(num(v) * 100) / 100).toFixed(2).split(".");
    return "R$ " + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + p[1];
  }

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
   * BOLETIM PAGO QUE NÃO ESTÁ NO FINANCEIRO
   *
   * ⚠ O ROTEIRO (revisão do orçamentista, 13/09/2026). Na mesma obra, o
   *   boletim 01a com status PAGA; a tela de Medições dizendo "Recebido
   *   R$ 24.827,61"; o Painel dizendo "Recebido R$ 0,00"; o Financeiro vazio.
   *   Três telas, três respostas para "quanto entrou".
   *   Pelo fluxo do app isso NÃO acontece: o botão "Registrar pgto" (e o
   *   select do formulário) lança a receita com o carimbo `docTipo:"MED"` +
   *   `docId`. O boletim da revisão foi gravado "pago" por fora — e é
   *   exatamente o que chega por backup antigo, importação, dado de outro
   *   aparelho ou baixa registrada antes de 01/09/2026. O Painel lê o
   *   Financeiro e estava CERTO em somar zero; o que mentia era o silêncio:
   *   nada na tela dizia que havia um boletim pago que o caixa não conhece.
   *
   * ⚠ O QUE ESTA FUNÇÃO NÃO FAZ: não lança, não liga e não conserta. Dinheiro
   *   se liga por carimbo ou não se liga (skill `dinheiro`). Casar a receita
   *   pelo valor, pela descrição "Recebimento medição 01a" ou pela data é o
   *   palpite que um dia trava um pagamento legítimo ou libera um duplicado.
   *
   * ⚠ POR QUE O CARIMBO SOZINHO NÃO BASTA — MEDIDO, NÃO DEDUZIDO. O carimbo
   *   da receita da medição só existe desde 01/09/2026 (a6ff289). Na base de
   *   trabalho da RA (backup de 12/09) havia 4 boletins pagos e os 4 SEM
   *   receita carimbada — com as 5 receitas de medição lá, lançadas pela
   *   versão antiga. Um aviso "pago sem receita pelo carimbo" acenderia para
   *   todo boletim histórico das 38 instalações: alarme que toca sempre e
   *   que ensina a ignorar o dia em que ele está certo.
   *   Por isso o aviso só afirma o que dá para afirmar sem palpite: o
   *   boletim NÃO tem receita com o carimbo dele E a obra dele NÃO tem
   *   nenhuma receita viva sem carimbo que pudesse ser a dele. Não se compara
   *   valor. Quando existe receita sem carimbo na obra, o aviso cala — ele
   *   não tem como saber de qual boletim ela é, e não finge saber. O preço
   *   aceito: obra com 3 boletins pagos e só 1 receita antiga lançada fica
   *   quieta. Calar ali não afirma que está tudo bem; o cartão continua
   *   dizendo que mostra só o que está no Financeiro.
   *
   * `receitaDoBoletim(m)` é INJETADA: devolve o lançamento vivo com o carimbo
   *   do boletim, ou null. Quem responde é `Gestao._lancVivoDoDoc` — a MESMA
   *   função que trava o "Registrar pgto" em dobro. Uma cópia dela aqui
   *   divergiria na primeira vez que o conceito de "lançamento anulado"
   *   crescer, e o Painel diria "sem receita" do mesmo boletim cujo pagamento
   *   a trava recusa por "já tem receita". Sem a função, não há como conferir
   *   pelo carimbo — e então não se afirma nada (lista vazia, `verificado`
   *   false).
   * ------------------------------------------------------------------ */
  function statusAnulado(f) {
    var st = f && f.status;
    /* pergunta ao FinStatus quando ele está carregado — a lista de estados
       mora lá; sem ele, a mesma comparação que `Gestao._finAnulado` faz */
    if (typeof FinStatus !== "undefined" && FinStatus && FinStatus.norm) return FinStatus.norm(st) === "cancelado";
    return String(st == null ? "" : st).trim().toLowerCase() === "cancelado";
  }
  function pagasSemReceita(medicoes, financeiro, receitaDoBoletim) {
    var r = { verificado: typeof receitaDoBoletim === "function", total: 0, valor: 0, liquido: 0, itens: [] };
    if (!r.verificado) return r;
    var fin = financeiro || [];
    /* o espelho do estorno aponta para o original: estornado = anulado */
    var estornados = {};
    fin.forEach(function (f) { if (f && f.estornoDe) estornados[texto(f.estornoDe)] = 1; });
    /* obras com ALGUMA receita viva sem carimbo — as que podem ser de boletim
       antigo. Fica de fora: o espelho do estorno (é crédito, não recebimento),
       o lançamento estornado ou cancelado (registro morto) e a devolução de
       retenção (`retencaoDe`: é outro dinheiro, nasce só DEPOIS de o boletim
       estar pago, e calaria justamente o caso que este aviso existe para
       mostrar). */
    var obraComReceitaSemCarimbo = {}, semCarimboPorObra = {}, nSemCarimbo = 0;
    fin.forEach(function (f) {
      if (!f || texto(f.tipo) !== "receita") return;
      if (texto(f.docTipo)) return;
      if (f.estornoDe || f.retencaoDe) return;
      if (f.id != null && estornados[texto(f.id)]) return;
      if (statusAnulado(f)) return;
      obraComReceitaSemCarimbo[texto(f.obraId)] = 1;
      semCarimboPorObra[texto(f.obraId)] = (semCarimboPorObra[texto(f.obraId)] || 0) + 1;
      nSemCarimbo++;
    });
    /* ⚠ A RECEITA ANTIGA QUE ESTÁ FORA DA OBRA DO BOLETIM (revisão de
       13/09/2026). Receita sem carimbo lançada SEM obra, ou numa obra
       diferente (o boletim trocou de obra depois), não cala o aviso — e nem
       deve: pela obra não dá para dizer que é dela. Mas o dinheiro dela ESTÁ
       no Recebido do Painel sem filtro de obra, e o cartão afirmava "não estão
       neste número"; pior, a ação mandava "Registrar pgto", cuja trava só
       enxerga carimbo — e lançava o mesmo dinheiro de novo.
       Aqui se CONTA quantas existem (nunca se compara valor, descrição ou
       data: seria ligar por semelhança). O texto usa a contagem para mandar
       conferir ANTES de registrar, e para não afirmar o que não sabe. */
    function foraDaObra(obraId) { return nSemCarimbo - (semCarimboPorObra[texto(obraId)] || 0); }
    (medicoes || []).forEach(function (m) {
      if (!m || texto(m.status) !== "paga") return;   /* mesma régua do PorObra.totaisMedicoes e do Atencao.retencaoPresa */
      if (receitaDoBoletim(m)) return;
      if (obraComReceitaSemCarimbo[texto(m.obraId)]) return;
      var bruto = num(m.valor);
      if (!(bruto > 0)) return;
      /* o caixa recebe o LÍQUIDO: é o que o "Registrar pgto" lança */
      var liq = bruto * (1 - num(m.retencao) / 100);
      r.total++; r.valor += bruto; r.liquido += liq;
      r.itens.push({ id: m.id, numero: texto(m.numero), obraId: texto(m.obraId),
        valor: bruto, liquido: liq, dataPgto: texto(m.dataPgto).slice(0, 10),
        semCarimboForaDaObra: foraDaObra(m.obraId) });
    });
    /* quantas receitas sem carimbo fora da obra de ALGUM boletim listado —
       é o número que o cartão do Painel usa para não afirmar "não estão aqui" */
    r.semCarimboForaDaObra = r.itens.reduce(function (mx, it) { return Math.max(mx, it.semCarimboForaDaObra); }, 0);
    return r;
  }

  /* --------------------------------------------------------------------
   * `d`: { fsLancamentos, financeiro, producaoMed, medicoes, obras, hoje,
   *        receitaDoBoletim }
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

    /* ---- 3b) BOLETIM PAGO QUE NÃO ESTÁ NO FINANCEIRO ----
       Ver `pagasSemReceita`. Sem prazo, ao contrário do 3): aqui não existe
       estado normal de passagem — pelo fluxo do app a receita nasce no mesmo
       clique que marca o boletim como pago. Se ela não está lá, não vai
       chegar sozinha.
       Gravidade 3: o documento AFIRMA que o dinheiro entrou e o caixa não o
       tem. É mais grave que o 3), onde ninguém afirma nada ainda. */
    var semRec = pagasSemReceita(d.medicoes, fin, d.receitaDoBoletim);
    semRec.itens.forEach(function (it) {
      var bruto = it.valor, liq = it.liquido;
      achados.push({
        tipo: "medicao-paga-sem-receita", gravidade: 3,
        /* "sem receita encontrada", não "que não está": ver o ⚠ do `porque` */
        titulo: "Boletim marcado como pago sem receita encontrada no Financeiro",
        detalhe: "Medição " + (it.numero || "—")
          + (nomeObra[it.obraId] ? " · " + nomeObra[it.obraId] : "")
          + (it.dataPgto ? " · pago em " + it.dataPgto.split("-").reverse().join("/") : "")
          + (Math.abs(bruto - liq) > 0.005 ? " · valor líquido de retenção (bruto " + moeda(bruto) + ")" : ""),
        /* ⚠ "NÃO ENCONTREI", nunca "não está": receita antiga sem carimbo sem
           obra (ou de outra obra) pode ser este dinheiro, e ela está no
           Recebido do Painel — ver `semCarimboForaDaObra` em pagasSemReceita. */
        porque: "O boletim diz que foi pago, mas não encontrei a receita dele no Financeiro: nenhuma com o carimbo do boletim, e nenhuma receita sem carimbo nesta obra."
          + (it.semCarimboForaDaObra > 0
            ? " Há " + it.semCarimboForaDaObra + " receita(s) sem carimbo sem obra ou de outra obra — se uma delas é este recebimento, o dinheiro já está no Recebido do Painel."
            : ""),
        valor: liq, obraId: it.obraId, view: "medicoes",
        /* ⚠ A PORTA NÃO PODE DUPLICAR NEM APAGAR A DATA. A trava do "Registrar
           pgto" só enxerga carimbo: com a receita antiga fora da obra, ele
           lançaria o mesmo dinheiro de novo. E ele grava a data de HOJE
           (gestao.js, "pagar-medicao"), enquanto o boletim foi pago em outro dia
           — a data original se perde na reabertura, que limpa `dataPgto`. */
        acao: (it.semCarimboForaDaObra > 0
            ? "ANTES de registrar: no Financeiro, confira as " + it.semCarimboForaDaObra + " receita(s) sem carimbo sem obra ou de outra obra. Se uma delas é o recebimento deste boletim, ponha nela a obra certa e NÃO registre de novo — o aviso some. "
            : "")
          + "Se o cliente pagou e a receita não está lá: abra a medição, volte o Status para Aprovada e use “Registrar pgto” — a receita entra com o carimbo do boletim, mas com a data de HOJE"
          + (it.dataPgto ? "; depois, no Financeiro, troque a data dela para " + it.dataPgto.split("-").reverse().join("/") + ", a do pagamento que o boletim registrava" : "")
          + ". Se não pagou, volte o Status para Aprovada: é cobrança em aberto."
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
      /* ⚠ o custo era "tudo que não é medição sem recebimento" — pela
         negação. O boletim pago sem receita, que é RECEITA, cairia no custo e
         a frase do Painel diria "de custo que ainda não entrou na obra" sobre
         dinheiro do cliente. Lista positiva de receita, então. */
      custoQueFalta: achados.filter(function (a) { return !RECEITA[a.tipo]; })
        .reduce(function (s, a) { return s + a.valor; }, 0),
      receitaQueFalta: achados.filter(function (a) { return a.tipo === "medicao-sem-recebimento"; })
        .reduce(function (s, a) { return s + a.valor; }, 0),
      /* separado do de cima porque a frase é outra: lá ninguém afirmou que
         recebeu; aqui o boletim afirma e o caixa não tem */
      pagoSemReceita: achados.filter(function (a) { return a.tipo === "medicao-paga-sem-receita"; })
        .reduce(function (s, a) { return s + a.valor; }, 0),
      itens: achados
    };
  }
  var RECEITA = { "medicao-sem-recebimento": 1, "medicao-paga-sem-receita": 1 };

  var Reconciliacao = { achar: achar, semanaDe: semanaDe, diasEntre: diasEntre, pagasSemReceita: pagasSemReceita };
  global.Reconciliacao = Reconciliacao;
  if (typeof module !== "undefined" && module.exports) module.exports = Reconciliacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

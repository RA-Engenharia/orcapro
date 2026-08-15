/* =====================================================================
 * porobra.js — SEPARAR POR OBRA (Financeiro, Compras e o que vier)
 *
 * GENÉRICO DE PROPÓSITO. Nasceu no Financeiro (v1.1.198) e Compras entrou
 * junto (v1.1.199) sem copiar uma linha: a classificação por obra, os dois
 * baldes especiais, o seletor com contagem e a conferência de integridade são
 * os mesmos. O que muda de módulo para módulo é só O QUE SE SOMA — por isso
 * `porObra` recebe o agregador. Medições, RDO e estoque também têm `obraId` e
 * cabem aqui; duplicar isso em cada módulo é como as regras divergem.
 *
 * POR QUE EXISTE: o módulo Financeiro listava todo lançamento da empresa numa
 * tabela só. Com três obras rodando, a tela vira uma mistura de compra de
 * cimento da obra A, medição recebida da obra B e conta de luz do escritório,
 * ordenadas só por data. Não dá para responder a pergunta que o dono faz toda
 * semana — "quanto essa obra já consumiu?" — sem exportar e abrir no Excel.
 *
 * ------------------------------------------------------------------
 * AS QUATRO REGRAS QUE NÃO PODEM CAIR
 *
 * 1) FILTRO NÃO PODE SUMIR COM DINHEIRO. Todo lançamento tem de estar em
 *    ALGUM recorte. Lançamento sem obra (conta do escritório, imposto,
 *    pró-labore) existe e é legítimo — por isso "Sem obra" é uma opção
 *    EXPLÍCITA e contável, não um resto que fica de fora da lista.
 *
 * 2) ⚠ OBRA APAGADA NÃO EVAPORA O LANÇAMENTO. Se a obra é excluída e os
 *    lançamentos continuam apontando para o id dela, eles não caem em
 *    "Sem obra" (têm obraId) nem em obra nenhuma da lista (o id não existe
 *    mais): sumiriam de TODOS os recortes, inclusive dos totais. Vira
 *    dinheiro invisível. Aqui eles caem num balde próprio, "Obra removida",
 *    que aparece na tela com o aviso.
 *
 * 3) O TOTAL É SEMPRE DO QUE ESTÁ NA TELA. Saldo calculado sobre a empresa
 *    inteira, com a tabela mostrando uma obra, são dois números sobre coisas
 *    diferentes lado a lado — e quem lê acredita no que está escrito. Mesma
 *    doutrina do escopo único do Painel.
 *
 * 4) O QUE SAI NO CSV É O QUE ESTÁ NA TELA. Filtrar, exportar e receber a
 *    empresa inteira é a pior forma de errar: o arquivo parece o recorte.
 * ===================================================================== */
(function (global) {
  "use strict";

  var TODAS = "todas";
  var SEM_OBRA = "__sem__";
  var ORFAO = "__orfao__";     /* obraId que não corresponde a obra nenhuma */

  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function texto(v) { return v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* mapa id → obra, para decidir em UMA passada se o vínculo existe */
  function indice(obras) {
    var m = {};
    arr(obras).forEach(function (o) { if (o && o.id != null) m[texto(o.id)] = o; });
    return m;
  }

  /* Em que balde este lançamento cai. É a função que garante a regra 1:
     TODO lançamento devolve alguma chave, nunca undefined. */
  function baldeDe(lanc, idxObras) {
    var oid = texto((lanc || {}).obraId).trim();
    if (!oid) return SEM_OBRA;
    if (idxObras && !idxObras[oid]) return ORFAO;    /* regra 2 */
    return oid;
  }

  /* ---------------------------------------------------------------
   * FILTRAR — `sel` aceita "todas", "__sem__", "__orfao__", um id ou uma
   * lista de ids (a mesma forma do filtro do Painel, para quem já conhece
   * um não precisar aprender outro).
   * ------------------------------------------------------------- */
  function filtrar(lancamentos, sel, obras) {
    var L = arr(lancamentos);
    if (sel == null || sel === "" || sel === TODAS) return L.slice();
    var idx = indice(obras);
    var alvos = Array.isArray(sel) ? sel.map(texto) : [texto(sel)];
    if (!alvos.length) return L.slice();
    return L.filter(function (f) { return alvos.indexOf(baldeDe(f, idx)) > -1; });
  }

  /* ---------------------------------------------------------------
   * TOTAIS — receita, despesa e saldo do CONJUNTO QUE RECEBEU (regra 3).
   * Quem chama passa a lista já filtrada; não há como somar "a empresa toda"
   * por engano porque esta função não conhece a lista completa.
   *
   * `previsto` separa o que ainda não aconteceu: um saldo que mistura conta
   * paga com conta a pagar não é saldo de caixa nem de competência.
   * ------------------------------------------------------------- */
  function totais(lancamentos) {
    var r = { receita: 0, despesa: 0, saldo: 0, n: 0,
      recebido: 0, pago: 0, aReceber: 0, aPagar: 0, saldoRealizado: 0 };
    arr(lancamentos).forEach(function (f) {
      if (!f) return;
      var v = num(f.valor), ehReceita = texto(f.tipo) === "receita";
      /* Só "pago" é dinheiro que entrou ou saiu. Qualquer outro valor conta
         como NÃO quitado — chutar o contrário inflaria o caixa realizado com
         dinheiro que não entrou. Este módulo já era o único leitor defensivo
         do app quando o cadastro tinha só dois estados. */
      var FS = global.FinStatus;
      var quitado = FS ? FS.realizado(f) : (texto(f.status) === "pago");
      /* ⚠ mas "não quitado" não é o mesmo que "ainda devo". Com o ciclo de
         vida completo existem CANCELADO e ESTORNADO: registro morto, que não
         é dívida nem crédito. Sem esta distinção o `else` os somaria em
         "a receber"/"a pagar" para sempre, e o dono cobraria um cliente que
         já cancelou. Sem o FinStatus carregado, mantém o comportamento
         antigo — que é o correto enquanto só existirem pago/pendente. */
      var aberto = FS ? FS.emAberto(f) : !quitado;
      r.n++;
      if (ehReceita) { r.receita += v; if (quitado) r.recebido += v; else if (aberto) r.aReceber += v; }
      else { r.despesa += v; if (quitado) r.pago += v; else if (aberto) r.aPagar += v; }
    });
    r.saldo = r.receita - r.despesa;
    r.saldoRealizado = r.recebido - r.pago;
    return r;
  }

  /* ---------------------------------------------------------------
   * POR OBRA — o quadro que responde "quanto cada obra consumiu" sem que o
   * usuário precise escolher uma por vez. Ordenado pelo movimento total
   * (receita + despesa): obra parada não ocupa o topo da tela.
   *
   * Os baldes "Sem obra" e "Obra removida" entram na lista como qualquer
   * outro — some deles é que seria o defeito.
   * ------------------------------------------------------------- */
  function porObra(lancamentos, obras, agregador) {
    var idx = indice(obras), grupos = {}, ordem = [];
    var agg = agregador || totais;
    arr(lancamentos).forEach(function (f) {
      if (!f) return;
      var k = baldeDe(f, idx);
      if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
      grupos[k].push(f);
    });
    var out = ordem.map(function (k) {
      var t = agg(grupos[k]);
      var g = {
        chave: k,
        nome: k === SEM_OBRA ? "Sem obra vinculada"
          : k === ORFAO ? "Obra removida"
          : ((idx[k] || {}).nome || "Obra " + k),
        semObra: k === SEM_OBRA,
        orfao: k === ORFAO,
        obraId: (k === SEM_OBRA || k === ORFAO) ? "" : k,
        itens: grupos[k]
      };
      /* o agregador manda: quem chama decide o que somar (o financeiro soma
         receita/despesa; compras soma comprometido/recebido). `movimento` é o
         que define a ordem, e cada agregador devolve o seu. */
      for (var campo in t) { if (Object.prototype.hasOwnProperty.call(t, campo)) g[campo] = t[campo]; }
      if (g.movimento == null) g.movimento = num(t.total != null ? t.total : (num(t.receita) + num(t.despesa)));
      return g;
    });
    out.sort(function (a, b) { return b.movimento - a.movimento; });
    return out;
  }

  /* ---------------------------------------------------------------
   * AGREGADOR DE COMPRAS — o dinheiro de um pedido de compra não é como o de
   * um lançamento financeiro, e somar tudo junto seria mentira:
   *
   *   cotação   → intenção. Ninguém se comprometeu com nada ainda.
   *   aprovado  → COMPROMISSO assumido, mercadoria não chegou.
   *   recebido  → realizado.
   *   rejeitado / cancelado → NÃO É DINHEIRO. Não entra em total nenhum.
   *
   * ⚠ O total da tela somava TUDO, inclusive rejeitado e cancelado — pedido
   * recusado inflava o "Total" de compras da obra. Aqui `total` é só o que
   * vale (cotação + aprovado + recebido) e o descartado vai à parte, visível,
   * para ninguém achar que sumiu.
   * ------------------------------------------------------------- */
  function totaisCompras(compras) {
    var r = { n: 0, total: 0, cotacao: 0, aprovado: 0, recebido: 0, descartado: 0,
      nCotacao: 0, nAprovado: 0, nRecebido: 0, nDescartado: 0, comprometido: 0, movimento: 0 };
    arr(compras).forEach(function (c) {
      if (!c) return;
      var v = num(c.valor), st = texto(c.status);
      r.n++;
      if (st === "rejeitado" || st === "cancelado") { r.descartado += v; r.nDescartado++; return; }
      if (st === "recebido") { r.recebido += v; r.nRecebido++; }
      else if (st === "aprovado") { r.aprovado += v; r.nAprovado++; }
      else { r.cotacao += v; r.nCotacao++; }      /* cotação e qualquer status novo */
      r.total += v;
    });
    /* o que já foi decidido e ainda vai sair do caixa */
    r.comprometido = r.aprovado;
    r.movimento = r.total;
    return r;
  }

  /* ---------------------------------------------------------------
   * AGREGADOR DE MEDIÇÕES — é o dinheiro que a obra FATURA, e cada status
   * significa uma coisa diferente para quem espera receber:
   *
   *   pendente  → medida, ainda não aprovada pelo cliente. Não é faturável.
   *   aprovada  → aprovada e A RECEBER. É o que sustenta o fluxo de caixa.
   *   paga      → entrou.
   *   rejeitada → NÃO É DINHEIRO. Fora de qualquer total.
   *
   * `medido` é o que vale (pendente + aprovada + paga); `aReceber` é a
   * aprovada que ainda não entrou — a pergunta que o dono faz antes de
   * assumir compromisso. Rejeitada aparece à parte, como em Compras: some do
   * total, nunca da tela.
   * ------------------------------------------------------------- */
  function totaisMedicoes(medicoes) {
    var r = { n: 0, medido: 0, total: 0, pendente: 0, aprovada: 0, paga: 0, rejeitada: 0,
      nPendente: 0, nAprovada: 0, nPaga: 0, nRejeitada: 0, aReceber: 0, movimento: 0 };
    arr(medicoes).forEach(function (m) {
      if (!m) return;
      var v = num(m.valor), st = texto(m.status);
      r.n++;
      if (st === "rejeitada") { r.rejeitada += v; r.nRejeitada++; return; }
      if (st === "paga") { r.paga += v; r.nPaga++; }
      else if (st === "aprovada") { r.aprovada += v; r.nAprovada++; }
      else { r.pendente += v; r.nPendente++; }   /* pendente e status novo */
      r.medido += v;
    });
    r.total = r.medido;            /* nome genérico, para o quadro por obra */
    r.aReceber = r.aprovada;
    r.movimento = r.medido;
    return r;
  }

  /* ---------------------------------------------------------------
   * AGREGADOR DO DIÁRIO (RDO) — aqui não há dinheiro. O que a obra "acumula"
   * no diário é PROVA: dias registrados, gente em campo e fotos. E a pergunta
   * que o gestor faz olhando várias obras não é "quanto", é:
   *
   *   "faz quantos dias que ninguém escreve o diário desta obra?"
   *
   * Diário é a peça que sustenta pleito de prazo, defende a empresa em
   * discussão contratual e alimenta o avanço físico. Buraco no diário só
   * aparece quando alguém precisa dele — e aí não dá mais para preencher.
   * Por isso `diasSemDiario` é o número que ordena o quadro: a obra mais
   * ABANDONADA sobe, não a mais movimentada.
   *
   * ⚠ `hoje` entra por PARÂMETRO. Ler o relógio aqui dentro tornaria o teste
   * dependente do dia em que roda — e um teste que passa hoje e falha em
   * janeiro é um teste que alguém vai desabilitar.
   * ------------------------------------------------------------- */
  function diasEntre(aISO, bISO) {
    var a = String(aISO || "").slice(0, 10), b = String(bISO || "").slice(0, 10);
    if (a.length !== 10 || b.length !== 10) return null;
    var ta = Date.parse(a + "T00:00:00Z"), tb = Date.parse(b + "T00:00:00Z");
    if (isNaN(ta) || isNaN(tb)) return null;
    return Math.round((tb - ta) / 86400000);
  }
  function totaisRdo(rdos, hoje) {
    var r = { n: 0, homensDia: 0, comFoto: 0, nFotos: 0,
      rascunho: 0, emAprovacao: 0, emRevisao: 0, aprovado: 0, publicado: 0,
      primeiraData: "", ultimaData: "", diasSemDiario: null, movimento: 0 };
    arr(rdos).forEach(function (d) {
      if (!d) return;
      r.n++;
      r.homensDia += num(d.efetivoDireto) + num(d.efetivoIndireto);
      var nf = (d.fotos && d.fotos.length) ? d.fotos.length : 0;
      if (nf) { r.comFoto++; r.nFotos += nf; }
      var data = texto(d.data).slice(0, 10);
      if (data) {
        if (!r.primeiraData || data < r.primeiraData) r.primeiraData = data;
        if (!r.ultimaData || data > r.ultimaData) r.ultimaData = data;
      }
      /* o diário ANTIGO não tem `estado` e já estava ao alcance do cliente —
         contá-lo como rascunho seria repetir o defeito que a lista já teve */
      var est = texto(d.estado);
      if (!est) est = texto(d.status) === "finalizado" ? "publicado" : "rascunho";
      if (est === "publicado" || est === "publicado_legado" || est === "publicado_sem_portal") r.publicado++;
      else if (est === "aprovado") r.aprovado++;
      else if (est === "em_revisao") r.emRevisao++;
      else if (est === "em_aprovacao") r.emAprovacao++;
      else r.rascunho++;
    });
    if (hoje && r.ultimaData) r.diasSemDiario = diasEntre(r.ultimaData, hoje);
    /* ORDENAÇÃO PELO ABANDONO: quanto mais dias sem diário, mais alto.
       ⚠ O `1e9` NÃO é "obra sem diário nenhum" — essa nem chega aqui, porque
       `porObra` só cria balde para obra que tem item. É o balde cujos diários
       estão todos SEM DATA VÁLIDA: não dá para saber há quanto tempo, e dado
       corrompido é o que mais precisa de olho, então sobe ao topo em vez de
       afundar num zero silencioso. Sem `hoje`, a ordem cai no volume. */
    if (hoje) r.movimento = (r.diasSemDiario == null) ? 1e9 : r.diasSemDiario;
    else r.movimento = r.n;
    return r;
  }

  /* ---------------------------------------------------------------
   * OPÇÕES DO SELETOR — com a contagem em cada uma. Sem o número, o usuário
   * escolhe uma obra, vê a tela vazia e não sabe se filtrou errado ou se
   * realmente não há lançamento ali.
   *
   * Obra SEM lançamento nenhum continua na lista (com "0"): ela existe, e
   * esconder faria parecer que a obra não está cadastrada.
   * ------------------------------------------------------------- */
  function opcoes(lancamentos, obras) {
    var grupos = porObra(lancamentos, obras), porChave = {};
    grupos.forEach(function (g) { porChave[g.chave] = g; });
    var L = arr(lancamentos);
    var out = [{ valor: TODAS, rotulo: "Todas as obras", n: L.length, especial: true }];

    arr(obras).forEach(function (o) {
      if (!o || o.id == null) return;
      var k = texto(o.id), g = porChave[k];
      out.push({ valor: k, rotulo: texto(o.nome) || ("Obra " + k), n: g ? g.n : 0, especial: false });
    });
    /* os dois baldes especiais só aparecem se tiverem conteúdo — opção que
       nunca seleciona nada é ruído; mas quando têm, são obrigatórios */
    if (porChave[SEM_OBRA]) out.push({ valor: SEM_OBRA, rotulo: "Sem obra vinculada", n: porChave[SEM_OBRA].n, especial: true });
    if (porChave[ORFAO]) out.push({ valor: ORFAO, rotulo: "Obra removida", n: porChave[ORFAO].n, especial: true, alerta: true });
    return out;
  }

  /* rótulo do recorte, para o cabeçalho dizer o que está sendo somado */
  function rotuloDe(sel, obras) {
    if (sel == null || sel === "" || sel === TODAS) return "Todas as obras";
    if (sel === SEM_OBRA) return "Sem obra vinculada";
    if (sel === ORFAO) return "Obra removida";
    if (Array.isArray(sel)) {
      if (!sel.length) return "Todas as obras";
      if (sel.length === 1) return rotuloDe(sel[0], obras);
      return sel.length + " obras";
    }
    var idx = indice(obras);
    return (idx[texto(sel)] || {}).nome || "Obra";
  }

  /* ⚠ CONFERÊNCIA DE INTEGRIDADE: a soma dos baldes tem de ser a lista
     inteira. Se um dia alguém acrescentar um caso em `baldeDe` e esquecer de
     tratá-lo, é aqui que aparece — em vez de dinheiro sumindo da tela.
     Conta só entrada válida: `null` na lista não é dinheiro e não deve
     aparecer como divergência.

     `baldeFn` existe para o TESTE poder injetar uma classificação quebrada e
     provar que esta função acusa. Sem isso ela seria inverificável: com o
     código íntegro nunca devolve `false`, e um `return {ok:true}` fixo
     passaria despercebido — que é justamente a mentira mais perigosa num
     canário. Em produção ninguém passa o parâmetro. */
  function confere(lancamentos, obras, baldeFn) {
    var L = arr(lancamentos).filter(function (f) { return !!f && typeof f === "object"; });
    var idx = indice(obras), fn = baldeFn || baldeDe;
    var vistos = {}, soma = 0;
    L.forEach(function (f) {
      var k = fn(f, idx);
      if (k == null || k === "") return;          /* lançamento sem balde: não é contado */
      if (!vistos[k]) vistos[k] = 0;
      vistos[k]++; soma++;
    });
    return { ok: soma === L.length, nosBaldes: soma, naLista: L.length, baldes: Object.keys(vistos).length };
  }

  var PorObra = {
    TODAS: TODAS, SEM_OBRA: SEM_OBRA, ORFAO: ORFAO,
    baldeDe: baldeDe, filtrar: filtrar, totais: totais,
    totaisCompras: totaisCompras, totaisMedicoes: totaisMedicoes, totaisRdo: totaisRdo,
    diasEntre: diasEntre,
    porObra: porObra, opcoes: opcoes, rotuloDe: rotuloDe, confere: confere,
    _num: num
  };
  global.PorObra = PorObra;
  if (typeof module !== "undefined" && module.exports) module.exports = PorObra;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

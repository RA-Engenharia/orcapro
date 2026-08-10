/* =====================================================================
 * finobra.js — O FINANCEIRO SEPARADO POR OBRA
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
      /* o cadastro só tem "pago" (rotulado "Pago / Recebido") e "pendente".
         Qualquer outro valor conta como NÃO quitado — chutar o contrário
         inflaria o caixa realizado com dinheiro que não entrou. */
      var quitado = texto(f.status) === "pago";
      r.n++;
      if (ehReceita) { r.receita += v; if (quitado) r.recebido += v; else r.aReceber += v; }
      else { r.despesa += v; if (quitado) r.pago += v; else r.aPagar += v; }
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
  function porObra(lancamentos, obras) {
    var idx = indice(obras), grupos = {}, ordem = [];
    arr(lancamentos).forEach(function (f) {
      if (!f) return;
      var k = baldeDe(f, idx);
      if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
      grupos[k].push(f);
    });
    var out = ordem.map(function (k) {
      var t = totais(grupos[k]);
      return {
        chave: k,
        nome: k === SEM_OBRA ? "Sem obra vinculada"
          : k === ORFAO ? "Obra removida"
          : ((idx[k] || {}).nome || "Obra " + k),
        semObra: k === SEM_OBRA,
        orfao: k === ORFAO,
        obraId: (k === SEM_OBRA || k === ORFAO) ? "" : k,
        n: t.n, receita: t.receita, despesa: t.despesa, saldo: t.saldo,
        recebido: t.recebido, pago: t.pago, aReceber: t.aReceber, aPagar: t.aPagar,
        movimento: t.receita + t.despesa
      };
    });
    out.sort(function (a, b) { return b.movimento - a.movimento; });
    return out;
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

  var FinObra = {
    TODAS: TODAS, SEM_OBRA: SEM_OBRA, ORFAO: ORFAO,
    baldeDe: baldeDe, filtrar: filtrar, totais: totais,
    porObra: porObra, opcoes: opcoes, rotuloDe: rotuloDe, confere: confere,
    _num: num
  };
  global.FinObra = FinObra;
  if (typeof module !== "undefined" && module.exports) module.exports = FinObra;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

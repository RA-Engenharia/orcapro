/* =====================================================================
 * ccagente.js — PARA QUAL CENTRO DE CUSTO VAI CADA DINHEIRO QUE JÁ SAIU,
 * E POR QUE ESSE E NÃO OUTRO.
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * O `js/centrocusto.js` sabe QUAIS centros existem e a que nó do orçamento
 * cada um pertence. Ele não responde a pergunta seguinte, que é a que decide
 * compra: "esta despesa de R$ 30.000 é de qual centro?". Hoje quem responde
 * isso é o vínculo direto (a etapa do lançamento, a etapa ou o centro do
 * pedido) — e ele cobre uma fatia do dinheiro. Folha, ponto, frota, nota
 * fiscal sem pedido e gasto rápido entram TODOS sem vínculo nenhum.
 *
 * ⚠ E O BURACO NÃO É A LINHA "SEM CENTRO" — É A TELA AFIRMAR UM NÚMERO
 * INCOMPLETO COM CARA DE COMPLETO. "CC-05 Estrutura: orçado 200k, realizado
 * 8k" com a folha da equipe da estrutura fora da conta manda autorizar a
 * próxima compra. Por isso a aba Centros se RECUSA a afirmar quando há regra
 * ou decisão no disco e este arquivo não está carregado (`conferido: false`,
 * js/gestao.js:28942) — e por isso ele precisa existir de verdade.
 *
 * AS TRÊS PORTAS DE PARÂMETRO, EM ORDEM FIXA
 *   1. o VÍNCULO por id (etapa do lançamento, pedido, itens do boletim,
 *      pedidos da nota) — ninguém digita nada, sai do carimbo;
 *   2. a REGRA (`cc_regras`), que a pessoa escreve uma vez: "a folha desta
 *      obra vai para Administração local";
 *   3. a DECISÃO (`cc_aprop`), que a pessoa toma num fato específico.
 * A decisão vence a regra, e a regra perde para o vínculo. O motivo de cada
 * precedência está escrito no degrau correspondente do `resolver`.
 *
 * ⚠ POR QUE ELE É PURO (sem DOM, sem Store, sem Util)
 * É a conta que decide se há saldo. Conta que decide compra não pode ser
 * código sem teste, e `js/gestao.js` não entra no gate. Tudo chega por
 * parâmetro — mesmo padrão de `js/custoetapa.js`, `js/centrocusto.js` e
 * `js/porobra.js`. Onde a régua de outro módulo não chega, o motor NÃO
 * chuta: ele diz no aviso que faltou.
 *
 * ⚠ ELE NUNCA GRAVA, E NUNCA LIGA DINHEIRO POR SEMELHANÇA.
 * Nenhuma função daqui escreve no disco: quem grava é a fiação, pela
 * `Gestao._ccGravarEscolha`. E toda ligação entre um lançamento e um
 * documento é por CARIMBO (`docTipo` + `docId`, `estornoDe`, `compraId`,
 * `retencaoDe`) — nunca por descrição, valor ou data. A skill `dinheiro`
 * conta o que custou aprender isso: casar por semelhança ou trava um
 * pagamento legítimo ou libera um duplicado, e ninguém descobre qual dos
 * dois aconteceu.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------
   * auxiliares locais (mesmo comportamento dos do centrocusto.js)
   * ---------------------------------------------------------------- */
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(s) { return String(s == null ? "" : s).trim(); }
  function obj(o) { return (o && typeof o === "object" && !Array.isArray(o)) ? o : null; }
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  function temCC() { return typeof CentroCusto !== "undefined" && CentroCusto ? CentroCusto : null; }
  function soDigitos(s) { return txt(s).replace(/\D/g, ""); }
  /* pontos-base → "12,5%" (só para recado) */
  function fmtPct(pb) {
    var v = Math.round(num(pb)), s = String(Math.floor(Math.abs(v) / 100)), r = Math.abs(v) % 100;
    return (v < 0 ? "-" : "") + s + (r ? "," + (r < 10 ? "0" + r : String(r)).replace(/0$/, "") : "") + "%";
  }
  /* centavos → "R$ 1.234,56", só para recado (o motor não enxerga `Util`) */
  function fmtCent(c) {
    var v = Math.round(num(c)), neg = v < 0, a = Math.abs(v);
    var inteiro = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    var cc = String(a % 100); if (cc.length < 2) cc = "0" + cc;
    return "R$ " + (neg ? "-" : "") + inteiro + "," + cc;
  }

  /* ⚠ CENTAVOS SÃO A UNIDADE DO MOTOR INTEIRO, e a conversão é UMA só.
     Roteiro do defeito que isto impede (lição "Precisão morre na
     serialização"): somar reais em ponto flutuante e comparar com o valor do
     fato faz a invariante I6 (as partes fecham ao centavo) reprovar por
     0,000000001 — e aí alguém "conserta" afrouxando a comparação, que é
     exatamente a guarda que impede o rateio de perder um centavo. */
  function cent(v, reguas) {
    if (reguas && typeof reguas.paraCentavos === "function") return Math.round(reguas.paraCentavos(v));
    return Math.round(num(v) * 100);
  }

  /* ------------------------------------------------------------------
   * CATÁLOGO FECHADO DE MOTIVOS (§4.9)
   *
   * ⚠ CATÁLOGO FECHADO, e não string solta no ponto da falha. Motivo
   * digitado onde ele nasce vira texto diferente para a mesma causa em três
   * telas — foi assim que a mesma despesa era "(pelo pedido)" numa porta e
   * "(pelo centro do pedido)" na outra (js/gestao.js:18422), e é a mesma
   * pessoa que lê as duas na mesma semana. Motivo fora desta tabela é
   * defeito de programação, não estado do dado.
   * ---------------------------------------------------------------- */
  var MOTIVOS = {
    "sem-regra": "Não há vínculo com o orçamento nem regra que alcance este lançamento.",
    "sem-centro-pedido": "O pedido não tem centro de custo nem etapa do orçamento.",
    "nota-pedido-sem-centro": "Um dos pedidos desta nota não tem centro de custo.",
    "nota-pedido-outra-obra": "A nota cobre pedidos de outra obra; esta parcela é desta obra.",
    "nota-sem-obra-pedidos-de-obras": "Parcela sem obra de uma nota com pedidos de obras diferentes — use a triagem da nota para ratear.",
    "regras-empate": "Duas regras de mesma especificidade mandam este lançamento para centros diferentes.",
    "destino-sumiu": "O centro escolhido não existe mais.",
    "destino-outra-obra": "O centro escolhido é de outra obra.",
    "destino-desativado": "O centro escolhido estava desativado na data deste lançamento.",
    "destino-cabecalho": "O centro escolhido conta a obra inteira — ele não recebe lançamento.",
    "no-dois-centros": "Duas ou mais linhas ativas apontam para a mesma etapa.",
    "etapa-sem-centro": "A etapa deste lançamento não tem centro de custo.",
    "estorno-orfao": "Estorno de um lançamento que não está neste aparelho.",
    "estorno-outra-obra": "Estorno de um lançamento que hoje está em outra obra; o estorno ficou nesta.",
    "boletim-parcial": "Parte dos itens deste boletim está em etapas sem centro de custo.",
    "boletim-orcamento-ausente": "O orçamento deste boletim não está neste aparelho.",
    "boletim-sem-valor-por-item": "O boletim tem valor, mas nenhum item dele tem valor para dividir.",
    "sem-obra": "Lançamento sem obra: só uma regra de despesa sem obra alcança ele.",
    "decisao-invalida": "A decisão gravada para este lançamento não pôde ser lida.",
    "sem-apropriacao": "Ninguém apropriou este lançamento ainda.",
    "carimbo-sem-documento": "O lançamento tem carimbo de documento, mas não diz qual documento.",
    "obra-em-rateio": "Esta obra ainda divide o gasto pelo valor orçado — converta os centros antigos para usar a Fila."
  };

  /* ⚠ MOTIVO QUE NÃO ENTRA NA FILA. O fato não está esperando decisão de
     ninguém: a OBRA é que ainda não adotou os centros novos. Pôr esses fatos
     na Fila daria uma lista de centenas de linhas que nenhum clique resolve —
     e fila que não esvazia ensina a ignorar a fila (§4.9). */
  var FORA_DA_FILA = { "obra-em-rateio": 1 };

  function textoMotivo(m) { return MOTIVOS[txt(m)] || MOTIVOS["sem-apropriacao"]; }

  /* ------------------------------------------------------------------
   * CHAVE DA DECISÃO — `ap_<k>_<d>`, e `k`/`d` NÃO são gravados (§1.7)
   *
   * ⚠ Roteiro do defeito (revisão adversarial da mc-6A, registrado no
   * `apontaPara` do centrocusto.js): a tela contava decisões lendo `a.d`.
   * O campo não existe no disco — a contagem dava 0 sempre e o app apagava
   * um centro com N decisões apontando para ele. Quem quer `k` ou `d`
   * pergunta AQUI; ler o registro é como se errou.
   * ---------------------------------------------------------------- */
  function chaveDa(k, d) { return "ap_" + txt(k) + "_" + txt(d); }

  function chaveDe(id) {
    var s = txt(id);
    if (s.indexOf("ap_") !== 0) return null;
    var resto = s.slice(3), corte = resto.indexOf("_");
    /* ⚠ PARTE NO PRIMEIRO `_`, NUNCA NO ÚLTIMO. `k` não tem `_`; `d` é TODO
       o resto — e id de documento tem `_` dentro (`com_mf3k9a2qxyz`).
       Partir no último `_` devolveria k:"PC_com" e d:"mf3k9a2qxyz", a chave
       não casaria com nada e a decisão da pessoa ficaria invisível: o
       lançamento voltaria calado para a fila depois de ela ter decidido. */
    if (corte <= 0) return null;
    var k = resto.slice(0, corte), d = resto.slice(corte + 1);
    if (!k || !d) return null;
    return { k: k, d: d };
  }

  /* ------------------------------------------------------------------
   * 4.2 ORIGEM DO LANÇAMENTO
   *
   * ⚠ A ORDEM É FIXA E O ESTORNO VEM PRIMEIRO. O espelho do estorno copia
   * obra e etapa do original, mas NÃO o `docTipo`/`docId` (`finEstornar`).
   * Lê-lo pelo `docTipo` o mandaria para a chave do documento original — e a
   * decisão tomada sobre a despesa passaria a valer também para o crédito
   * que a desfaz. O espelho nunca tem decisão própria (§1.7): ele SEGUE o
   * original, pelo degrau 1 do resolver, com o sinal dele.
   * ---------------------------------------------------------------- */
  var ORIGENS_DOC = { MED: 1, PC: 1, NF: 1, FOL: 1, PON: 1, FSM: 1, FRT: 1 };

  function origemDe(f) {
    var r = obj(f) || {}, avisos = [];
    if (txt(r.estornoDe)) return { k: "ESP", d: txt(r.estornoDe), avisos: avisos };
    if (txt(r.retencaoDe)) return { k: "MED", d: txt(r.retencaoDe), avisos: avisos };
    var dt = txt(r.docTipo);
    if (dt) {
      var di = txt(r.docId);
      if (ORIGENS_DOC[dt] && di) {
        /* ⚠ A CHAVE DA NOTA CARREGA A OBRA (crítica D11). Uma nota fiscal
           cobre pedidos de obras diferentes, e cada parcela é de uma obra.
           Com a chave só no `notaId`, decidir o centro da parcela da obra A
           mudaria calado a parcela da obra B — dinheiro de outra obra movido
           por um clique que não falava dela. */
        if (dt === "NF") return { k: "NF", d: di + "~" + txt(r.obraId), avisos: avisos };
        return { k: dt, d: di, avisos: avisos };
      }
      if (!di) {
        /* ⚠ CARIMBO SEM DOCUMENTO NÃO VIRA CHAVE VAZIA (crítica D14). Com
           `d` vazio a chave seria `ap_PC_`, a MESMA para todo lançamento
           nessa situação: uma decisão tomada num deles valeria para todos os
           outros, em qualquer obra. Ele cai para `FIN` + o id próprio, que é
           único, e o aviso conta o resto. */
        avisos.push({ tipo: "carimbo-sem-documento", msg: "Lançamento com carimbo " + dt + " e sem o id do documento — tratado como lançamento avulso." });
        return { k: "FIN", d: txt(r.id), avisos: avisos, frouxo: true };
      }
    }
    if (txt(r.origem) === "carp_proposta" && txt(r.origemId)) return { k: "CARP", d: txt(r.origemId), avisos: avisos };
    if (txt(r.origem) === "rapido") return { k: "RAP", d: txt(r.id), avisos: avisos };
    return { k: "FIN", d: txt(r.id), avisos: avisos };
  }

  /* ------------------------------------------------------------------
   * DESTINO VÁLIDO — conferido em TODO degrau, sobre a lista CRUA
   *
   * ⚠ DESTINO INVÁLIDO NÃO DESCE PARA O DEGRAU SEGUINTE. Se a decisão da
   * pessoa aponta para um centro apagado, o fato vai para a Fila com
   * `destino-sumiu` — ele NÃO cai na regra nem no vínculo. Descer inventaria
   * um destino que ninguém escolheu, por cima de uma escolha explícita que
   * só está quebrada: a pessoa veria o dinheiro num centro que ela não
   * escolheu e sem nada na tela dizendo que a escolha dela morreu.
   * ---------------------------------------------------------------- */
  function validarDestino(ccId, fato, I, degrau) {
    var id = txt(ccId);
    if (!id) return { ok: false, motivo: "destino-sumiu" };
    var cc = I.ccs[id];
    if (!cc) return { ok: false, motivo: "destino-sumiu" };
    var n = I.normal[id];
    if (!n) return { ok: false, motivo: "destino-sumiu" };
    if (txt(n.apura) === "obra") return { ok: false, motivo: "destino-cabecalho" };
    var obraCC = txt(cc.obraId), obraF = txt(fato.obraId);
    /* centro da empresa (`obraId:""`) recebe fato de qualquer obra (K28) */
    if (obraCC && obraCC !== obraF) return { ok: false, motivo: "destino-outra-obra" };
    if (!n._ativo) {
      /* ⚠ NO VÍNCULO, CENTRO DESATIVADO SEMPRE RESPONDE (MC14, invariante
         I4). Desativar um centro não pode fazer o gasto que já está nele
         pular para "Sem centro": o realizado dele sumiria da tela e o total
         da obra deixaria de fechar (I1). Fora do vínculo, ele só responde
         por fato ANTERIOR à desativação. */
      if (degrau !== "vinculo") {
        var lim = txt(cc.desativadoEm).slice(0, 10), dataF = txt(fato.data).slice(0, 10);
        if (!lim || !dataF || dataF > lim) return { ok: false, motivo: "destino-desativado" };
      }
    }
    return { ok: true, motivo: "" };
  }

  /* ------------------------------------------------------------------
   * PARTES a partir de uma decisão (`cc`/`pt`) ou de um `entao` de regra
   * ---------------------------------------------------------------- */
  function partesDe(alvo, totalCent, fato, I, degrau) {
    var o = obj(alvo);
    if (!o) return { ok: false, motivo: "decisao-invalida" };
    var un = txt(o.cc) || txt(o.c);
    if (un) {
      var v = validarDestino(un, fato, I, degrau);
      if (!v.ok) return { ok: false, motivo: v.motivo };
      return { ok: true, partes: [{ cc: un, c: totalCent }] };
    }
    var lista = arr(o.pt).length ? arr(o.pt) : arr(o.partes);
    if (!lista.length) return { ok: false, motivo: "decisao-invalida" };
    var ids = [], pesos = [], i, vis = {};
    for (i = 0; i < lista.length; i++) {
      var p = obj(lista[i]);
      if (!p) return { ok: false, motivo: "decisao-invalida" };
      var cid = txt(p.cc) || txt(p.c);
      if (!cid || vis[cid]) return { ok: false, motivo: "decisao-invalida" };
      vis[cid] = 1;
      var vd = validarDestino(cid, fato, I, degrau);
      if (!vd.ok) return { ok: false, motivo: vd.motivo };
      ids.push(cid);
      pesos.push(num(p.p));
    }
    var CC = temCC();
    if (!CC || typeof CC.dividirCentavos !== "function") return { ok: false, motivo: "decisao-invalida" };
    /* ⚠ A DIVISÃO É A DO `CentroCusto.dividirCentavos`, NÃO UMA CÓPIA.
       Lição "Réplica de parser apodrece": 33 módulos copiaram o
       `Util.parseNum` e dois erraram em direções opostas, movendo dinheiro.
       Aqui a sobra do arredondamento tem dono determinístico (maior peso
       primeiro, empate pela posição) e a invariante I6 depende disso. */
    var d = CC.dividirCentavos(totalCent, pesos);
    if (!d.ok) return { ok: false, motivo: "decisao-invalida" };
    var partes = [];
    for (i = 0; i < ids.length; i++) partes.push({ cc: ids[i], c: d.partes[i] });
    return { ok: true, partes: partes };
  }

  /* ------------------------------------------------------------------
   * 4.8 REGRAS — leitura, validação e escolha
   * ---------------------------------------------------------------- */
  var CHAVES_QUANDO = { o: 1, cat: 1, forn: 1, cnpj: 1, frota: 1, atv: 1 };
  var ORIGENS_REGRA = { MED: 1, PC: 1, NF: 1, FOL: 1, PON: 1, FSM: 1, FRT: 1, RAP: 1, FIN: 1, CARP: 1, "*": 1 };

  function quandoCanonico(q) {
    var o = obj(q) || {}, chaves = [], k, i;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) {
      if (!CHAVES_QUANDO[k]) continue;
      if (!txt(o[k])) continue;
      if (k === "o" && txt(o[k]) === "*") continue;   /* `*` não entra no canônico */
      chaves.push(k);
    }
    chaves.sort();
    var out = [];
    for (i = 0; i < chaves.length; i++) out.push(chaves[i] + "=" + txt(o[chaves[i]]));
    return out.join("|");
  }

  function especificidade(q) {
    var o = obj(q) || {}, n = 0, k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) {
      if (!CHAVES_QUANDO[k]) continue;
      if (!txt(o[k])) continue;
      if (k === "o" && txt(o[k]) === "*") continue;
      n++;
    }
    return n;
  }

  function regraAtiva(r) {
    if (r.ativa === undefined || r.ativa === null) return true;
    if (r.ativa === true) return true;
    return num(r.ativa) === 1;
  }

  function regraLegivel(r) {
    if (!obj(r) || !txt(r.id)) return false;
    var q = obj(r.quando);
    if (!q) return false;
    var k;
    for (k in q) if (Object.prototype.hasOwnProperty.call(q, k)) {
      /* ⚠ CHAVE DESCONHECIDA INVALIDA A REGRA INTEIRA — ela não decide nada.
         Ignorar a chave que não se entende e aplicar o resto faria a regra
         "folha DA OBRA X com a categoria Y" virar "folha de qualquer coisa"
         num aparelho com versão antiga do motor: dinheiro caindo num centro
         que ninguém escolheu, em silêncio, por causa de uma atualização pela
         metade. É o mesmo princípio do `conferido:false` da aba Centros —
         recusar decidir é melhor que decidir com meia régua. */
      if (!CHAVES_QUANDO[k]) return false;
    }
    if (txt(q.o) && !ORIGENS_REGRA[txt(q.o)]) return false;
    if (txt(q.forn) && txt(q.o) !== "PC") return false;
    if (txt(q.cnpj) && txt(q.o) !== "NF") return false;
    if (txt(q.frota) && txt(q.o) !== "FRT") return false;
    if (txt(q.atv) && txt(q.o) !== "MED") return false;
    var e = obj(r.entao);
    if (!e) return false;
    var t = txt(e.t);
    if (t !== "cc" && t !== "rateio") return false;
    if (t === "cc" && !txt(e.cc)) return false;
    if (t === "rateio") {
      var ps = arr(e.partes), soma = 0, i, vis = {};
      if (ps.length < 2 || ps.length > 12) return false;
      for (i = 0; i < ps.length; i++) {
        var p = obj(ps[i]);
        if (!p || !txt(p.cc) || vis[txt(p.cc)]) return false;
        vis[txt(p.cc)] = 1;
        soma += num(p.p);
      }
      /* ⚠ SOMA EXATA DE 10000 PONTOS-BASE, sem tolerância. Uma régua que
         aceita 9999 deixa 0,01% do valor sem destino em todo fato que passar
         por ela, e ninguém procura um centavo. */
      if (Math.round(soma) !== 10000) return false;
    }
    if (txt(r.ate) && txt(r.desde) && txt(r.ate) < txt(r.desde)) return false;
    return true;
  }

  function vigenciaSobrepoe(a, b) {
    var ai = txt(a.desde) || "0000-00-00", af = txt(a.ate) || "9999-12-31";
    var bi = txt(b.desde) || "0000-00-00", bf = txt(b.ate) || "9999-12-31";
    return ai <= bf && bi <= af;
  }

  function validarRegra(regra, crus) {
    var c = obj(crus) || {};
    var r = obj(regra);
    if (!r) return { ok: false, campo: "", msg: "Regra ilegível." };
    if (!txt(r.nome)) return { ok: false, campo: "nome", msg: "Dê um nome à regra — é por ele que ela aparece na trilha de cada lançamento." };
    if (txt(r.nome).length > 80) return { ok: false, campo: "nome", msg: "O nome da regra passa de 80 caracteres." };
    var tipo = txt(r.tipo);
    if (tipo !== "despesa" && tipo !== "receita") return { ok: false, campo: "tipo", msg: "A regra precisa dizer se vale para despesa ou para receita." };
    if (txt(r.obraId) === "*") return { ok: false, campo: "obraId", msg: "Regra para todas as obras ainda não existe nesta versão — escolha uma obra, ou “sem obra”." };
    if (txt(r.ate) && txt(r.desde) && txt(r.ate) < txt(r.desde)) return { ok: false, campo: "ate", msg: "A data final é anterior à inicial." };
    var q = obj(r.quando);
    if (!q) return { ok: false, campo: "quando", msg: "A regra precisa dizer em que situação ela vale." };
    if (txt(q.forn) && txt(q.o) !== "PC") return { ok: false, campo: "forn", msg: "Fornecedor só vale para pedido de compra." };
    if (txt(q.cnpj) && txt(q.o) !== "NF") return { ok: false, campo: "cnpj", msg: "CNPJ só vale para nota fiscal." };
    if (txt(q.frota) && txt(q.o) !== "FRT") return { ok: false, campo: "frota", msg: "Veículo só vale para custo de frota." };
    if (txt(q.atv) && txt(q.o) !== "MED") return { ok: false, campo: "atv", msg: "Atividade só vale para medição." };
    /* ⚠ REGRA "SEM OBRA" SÓ PARA QUEM ENXERGA TODAS AS OBRAS (§7). Ela
       alcança a despesa do escritório inteiro; criada por quem só acompanha
       duas obras, ela mudaria o centro de dinheiro que essa pessoa nem vê. */
    if (!txt(r.obraId) && c.restrito) return { ok: false, campo: "obraId", msg: "Esta regra vale para despesas sem obra — só quem enxerga todas as obras pode criá-la." };

    /* ⚠ A RECUSA DA OBRA EM RATEIO VEM ANTES DA DO DESTINO, e a ordem é o
       recado. Ali nenhum destino vale para fato da obra (degrau 0 do
       resolver), então NENHUMA regra dessa obra decidiria nada — trocar o
       centro não resolve. Com esta guarda depois da do destino (como estava
       quando a suíte a pegou), a pessoa corrigia o centro, reenviava e só
       então descobria o bloqueio real: duas viagens para uma recusa, e a
       porta ([Converter os centros antigos…]) só aparecia na segunda.
       Trava sem saída é o que ensina a mentir no formulário — skill
       `dinheiro` §6. */
    var CC = temCC();
    if (txt(r.obraId) && CC && typeof CC.modoDaObra === "function") {
      var m = CC.modoDaObra(txt(r.obraId), arr(c.ccs));
      if (m && m.modo === "legado-rateio") {
        return { ok: false, campo: "obraId", porta: "cc-converter", msg: "Esta obra ainda divide o gasto pelo valor orçado. Converta os centros antigos dela antes de criar regras." };
      }
    }

    /* ⚠ O DESTINO É RECUSADO DIZENDO O QUE ESTÁ ERRADO NELE (§4.8-1). O
       `regraLegivel` abaixo recusa tudo isto também, mas com uma frase só
       ("condição ou destino que este sistema não reconhece") — e a pessoa
       que dividiu 60% + 30% ficava sem saber que faltam 10%, reenviava e
       levava a mesma recusa. Trava sem saída, pelo texto. */
    var ent = obj(r.entao);
    if (!ent || (txt(ent.t) !== "cc" && txt(ent.t) !== "rateio")) return { ok: false, campo: "entao", msg: "Escolha para onde a regra manda o lançamento: um centro, ou a divisão entre centros." };
    if (txt(ent.t) === "cc" && !txt(ent.cc)) return { ok: false, campo: "entao", msg: "Escolha o centro de custo para onde a regra manda o lançamento." };
    if (txt(ent.t) === "rateio") {
      var psV = arr(ent.partes), somaV = 0, visV = {}, iv;
      if (psV.length < 2 || psV.length > 12) return { ok: false, campo: "partes", msg: "A divisão precisa de 2 a 12 centros (hoje " + psV.length + ")." };
      for (iv = 0; iv < psV.length; iv++) {
        var pV = obj(psV[iv]);
        if (!pV || !txt(pV.cc)) return { ok: false, campo: "partes", msg: "A parte " + (iv + 1) + " da divisão está sem centro." };
        if (visV[txt(pV.cc)]) return { ok: false, campo: "partes", msg: "O mesmo centro aparece duas vezes na divisão — junte as duas partes numa só." };
        visV[txt(pV.cc)] = 1;
        if (!(Math.round(num(pV.p)) > 0) || Math.round(num(pV.p)) !== num(pV.p)) return { ok: false, campo: "partes", msg: "A parte " + (iv + 1) + " da divisão precisa de um percentual maior que zero, com até duas casas." };
        somaV += Math.round(num(pV.p));
      }
      if (somaV !== 10000) {
        var faltaV = 10000 - somaV;
        return { ok: false, campo: "partes", msg: "As partes somam " + fmtPct(somaV) + " — precisam somar exatamente 100% (" + (faltaV > 0 ? "faltam " + fmtPct(faltaV) : "sobram " + fmtPct(-faltaV)) + ")." };
      }
    }
    if (!regraLegivel(r)) return { ok: false, campo: "quando", msg: "A regra tem condição ou destino que este sistema não reconhece." };

    /* destino: centro precisa existir e ser da obra da regra (ou da empresa) */
    var ccs = {}, i;
    arr(c.ccs).forEach(function (x) { if (x && x.id) ccs[txt(x.id)] = x; });
    var alvos = [];
    if (txt(r.entao && r.entao.t) === "cc") alvos.push(txt(r.entao.cc));
    else arr(r.entao && r.entao.partes).forEach(function (p) { alvos.push(txt(p && p.cc)); });
    for (i = 0; i < alvos.length; i++) {
      var cc = ccs[alvos[i]];
      if (!cc) return { ok: false, campo: "entao", msg: "O centro de custo escolhido não existe mais." };
      var obraCC = txt(cc.obraId);
      if (obraCC && obraCC !== txt(r.obraId)) return { ok: false, campo: "entao", msg: "O centro “" + (txt(cc.codigo) || txt(cc.nome)) + "” é de outra obra." };
    }

    /* ⚠ REGRA IGUAL É RECUSADA QUALQUER QUE SEJA O `entao` (crítica D24).
       Duas regras com as MESMAS condições e destinos diferentes caem no
       empate do degrau 5 e mandam o fato para a Fila — a pessoa criaria a
       segunda achando que corrigiu a primeira e o dinheiro sairia das duas
       linhas. Recusar na porta, dizendo qual regra já existe e abrindo ela,
       é a única saída que não exige adivinhar qual das duas ela quis. */
    var canon = quandoCanonico(r.quando), idNovo = txt(r.id);
    var iguais = arr(c.regras).filter(function (x) {
      if (!obj(x) || txt(x.id) === idNovo) return false;
      if (!regraAtiva(x)) return false;
      if (txt(x.obraId) !== txt(r.obraId)) return false;
      if (txt(x.tipo) !== tipo) return false;
      if (quandoCanonico(x.quando) !== canon) return false;
      return vigenciaSobrepoe(x, r);
    });
    if (iguais.length) {
      return { ok: false, campo: "quando", porta: "cc-abrir-regra", regraId: txt(iguais[0].id), msg: "Já existe a regra “" + txt(iguais[0].nome) + "” com as mesmas condições nesse período." };
    }
    /* ⚠ O TETO É MEDIDO PELA ASSINATURA DO DONO: `cabe(entidade, lista,
       novos)`. Até 24/09/2026 esta linha chamava `CC.cabe(lista, regra,
       teto, bytes)` — a lista no lugar do nome da entidade —, o `cabe`
       respondia "entidade sem teto declarado" com `cabe: true`, e a
       conferência lia `cabe.ok`, um campo que o `cabe` nunca devolve. As
       duas metades erradas se cancelavam em silêncio: o teto de 1.000
       regras / 650 KB NUNCA recusava nada, e a lista podia passar do
       documento de 1 MiB da nuvem, onde a sincronização para calada. */
    if (CC && typeof CC.cabe === "function") {
      var cabe = CC.cabe("cc_regras", arr(c.regras), [r]);
      if (cabe && cabe.cabe === false) return { ok: false, campo: "teto", porta: "cc-regras-teto", msg: cabe.msg || "A lista de regras chegou ao limite deste aparelho." };
    }
    return { ok: true, campo: "", msg: "" };
  }

  /* condições da regra batem com o fato? SEMPRE igualdade de campo por id */
  function regraBate(r, fato) {
    var q = obj(r.quando) || {};
    var o = txt(q.o);
    if (o && o !== "*" && o !== txt(fato.k)) return false;
    if (txt(q.cat) && txt(q.cat) !== txt(fato.cat)) return false;
    if (txt(q.forn) && txt(q.forn) !== txt(fato.forn)) return false;
    if (txt(q.cnpj) && txt(q.cnpj) !== soDigitos(fato.cnpj)) return false;
    /* ⚠ A FROTA VEM DO `frota_mov` DO CARIMBO, nunca do texto do lançamento
       (crítica D22). O lançamento de combustível traz o nome do veículo na
       descrição; casar por ele é ligar dinheiro por semelhança — uma placa
       escrita numa observação mandaria a despesa de outro veículo para o
       mesmo centro, e ninguém veria. Quem preenche `fato.frota` é o
       `montarIndice`, pelo id do movimento. */
    if (txt(q.frota) && txt(q.frota) !== txt(fato.frota)) return false;
    if (txt(q.atv) && txt(q.atv) !== txt(fato.atv)) return false;
    return true;
  }

  function regraPara(fato, I) {
    var data = txt(fato.data).slice(0, 10), obraF = txt(fato.obraId), tipo = txt(fato.tipo) || "despesa";
    var cands = [], i;
    for (i = 0; i < I.regras.length; i++) {
      var r = I.regras[i];
      if (!regraLegivel(r)) continue;
      if (!regraAtiva(r)) continue;
      if (txt(r.obraId) !== obraF) continue;
      if (txt(r.tipo) !== tipo) continue;
      if (txt(r.desde) && data && data < txt(r.desde).slice(0, 10)) continue;
      if (txt(r.ate) && data && data > txt(r.ate).slice(0, 10)) continue;
      if (!regraBate(r, fato)) continue;
      cands.push(r);
    }
    if (!cands.length) return { ok: false, motivo: "" };
    /* ⚠ ORDEM DETERMINÍSTICA (invariante I7): especificidade decrescente e,
       no empate, o id. Sem o segundo critério a mesma entrada daria saídas
       diferentes conforme a ordem em que o Store devolveu a lista — e o
       realizado de um centro mudaria entre dois aparelhos sem nada mudar. */
    cands.sort(function (a, b) {
      var d = especificidade(b.quando) - especificidade(a.quando);
      if (d) return d;
      return txt(a.id) < txt(b.id) ? -1 : (txt(a.id) > txt(b.id) ? 1 : 0);
    });
    var topo = especificidade(cands[0].quando);
    var empate = [];
    for (i = 0; i < cands.length; i++) if (especificidade(cands[i].quando) === topo) empate.push(cands[i]);
    if (empate.length > 1) {
      /* mesmo destino em todas: tanto faz qual responde (§4.3, degrau 5) */
      var assin = JSON.stringify(empate[0].entao);
      for (i = 1; i < empate.length; i++) {
        if (JSON.stringify(empate[i].entao) !== assin) {
          var ids = [];
          for (var j = 0; j < empate.length; j++) ids.push(txt(empate[j].id));
          return { ok: false, motivo: "regras-empate", ids: ids };
        }
      }
    }
    return { ok: true, regra: cands[0] };
  }

  /* ------------------------------------------------------------------
   * ÍNDICE — tudo o que a cadeia precisa, montado UMA vez
   *
   * ⚠ UMA VOLTA SÓ PELAS LISTAS. Lição do `_ccFatos`: resolver fato por fato
   * lendo `Store.obter` dentro do laço é o que faz a tela de uma obra com
   * 4.000 lançamentos demorar segundos. Aqui as listas cruas entram uma vez
   * e viram dicionário por id.
   *
   * ⚠ LISTA CRUA, e não a podada pelo escopo do sub-usuário. A guarda conta o
   * DISCO INTEIRO: com a lista podada, um destino de obra que a pessoa não
   * enxerga apareceria como `destino-sumiu` e o fato iria para a Fila dela —
   * onde qualquer clique moveria dinheiro de uma obra que ela não acompanha.
   * O RECORTE do que ela vê é aplicado depois, no `fila`/`consolidar`.
   * ---------------------------------------------------------------- */
  function montarIndice(ctx) {
    var c = obj(ctx) || {}, CC = temCC(), avisos = [];
    var I = {
      ccs: {}, ccsCrus: arr(c.ccs), normal: {}, aprop: {}, regras: [],
      fin: {}, compra: {}, medicao: {}, fiscal: {}, frotaMov: {}, obras: {},
      modo: {}, indice: {}, orcCache: {},
      reguas: obj(c.reguas) || {},
      orcamento: typeof c.orcamento === "function" ? c.orcamento : function () { return null; },
      familiaDe: typeof c.familiaDe === "function" ? c.familiaDe : function () { return []; },
      obrasVisiveis: Array.isArray(c.obrasVisiveis) ? c.obrasVisiveis : null,
      hoje: txt(c.hoje),
      avisos: avisos
    };
    if (!CC) {
      /* ⚠ SEM O CADASTRO NÃO HÁ AGENTE, e o agente DIZ isso em vez de
         devolver lista vazia. Lista vazia é lida como "nada pendente". */
      avisos.push({ tipo: "cc-sem-cadastro", msg: "O cadastro de centros de custo (js/centrocusto.js) não está carregado neste aparelho — nenhuma apropriação pode ser conferida." });
      I.semCadastro = true;
    }
    arr(c.ccs).forEach(function (x) { if (obj(x) && txt(x.id)) I.ccs[txt(x.id)] = x; });
    arr(c.financeiro).forEach(function (x) { if (obj(x) && txt(x.id)) I.fin[txt(x.id)] = x; });
    arr(c.compras).forEach(function (x) { if (obj(x) && txt(x.id)) I.compra[txt(x.id)] = x; });
    arr(c.medicoes).forEach(function (x) { if (obj(x) && txt(x.id)) I.medicao[txt(x.id)] = x; });
    arr(c.fiscal).forEach(function (x) { if (obj(x) && txt(x.id)) I.fiscal[txt(x.id)] = x; });
    arr(c.frotaMov).forEach(function (x) { if (obj(x) && txt(x.id)) I.frotaMov[txt(x.id)] = x; });
    arr(c.obras).forEach(function (x) { if (obj(x) && txt(x.id)) I.obras[txt(x.id)] = x; });
    arr(c.decisoes).forEach(function (x) { if (obj(x) && txt(x.id)) I.aprop[txt(x.id)] = x; });
    arr(c.regras).forEach(function (x) { if (obj(x)) I.regras.push(x); });

    /* modo de CADA obra que aparece: o do centro e o do fato */
    var obrasVistas = {};
    arr(c.ccs).forEach(function (x) { if (obj(x)) obrasVistas[txt(x.obraId)] = 1; });
    arr(c.obras).forEach(function (x) { if (obj(x) && txt(x.id)) obrasVistas[txt(x.id)] = 1; });
    var k;
    for (k in obrasVistas) if (Object.prototype.hasOwnProperty.call(obrasVistas, k)) {
      I.modo[k] = (CC && typeof CC.modoDaObra === "function") ? CC.modoDaObra(k, I.ccsCrus) : { modo: "sem-centros", legados: 0, novos: 0, adocaoEm: "" };
    }
    /* normalização do legado na LEITURA (§4.5.1): o `apura` de cada centro
       depende do modo da obra DELE, não da obra do fato */
    arr(c.ccs).forEach(function (x) {
      if (!obj(x) || !txt(x.id)) return;
      var m = I.modo[txt(x.obraId)];
      I.normal[txt(x.id)] = (CC && typeof CC.normalizar === "function")
        ? CC.normalizar(x, m ? m.modo : "sem-centros")
        : { apura: "lanc", _ativo: true, _gerado: false };
    });
    return I;
  }

  /* índice nó → centro da obra, com cache por obra dentro da chamada */
  function indiceDaObra(obraId, I) {
    var o = txt(obraId);
    if (I.indice[o]) return I.indice[o];
    var CC = temCC();
    if (!CC || typeof CC.indicePorNo !== "function") { I.indice[o] = null; return null; }
    var obra = I.obras[o], orc = null;
    if (obra && txt(obra.orcamentoId)) orc = I.orcamento(txt(obra.orcamentoId));
    I.indice[o] = CC.indicePorNo(I.ccsCrus, o, I.familiaDe(o), orc);
    return I.indice[o];
  }

  function noDoItemDe(orc, I) {
    if (!orc || !txt(orc.id)) return {};
    var chave = txt(orc.id) + "|" + txt(orc.atualizadoEm);
    if (I.orcCache[chave]) return I.orcCache[chave];
    var CC = temCC();
    I.orcCache[chave] = (CC && typeof CC.noDoItem === "function") ? CC.noDoItem(orc) : {};
    return I.orcCache[chave];
  }

  /* ------------------------------------------------------------------
   * 4.3 CADEIA DE DECISÃO — ordem fixa; o primeiro degrau que responde manda
   * ---------------------------------------------------------------- */
  var LIMITE_PROF = 6;   /* espelho de espelho de nota: nunca passa de 3 na prática */

  function resolver(fato, I, prof) {
    prof = prof || 0;
    /* ⚠ GUARDA DE PROFUNDIDADE. Um estorno cujo original é ele mesmo (dado
       corrompido, ou lápide mal aplicada em dois aparelhos) faria a recursão
       girar até estourar a pilha e derrubar a tela INTEIRA no meio do render
       — sem os números e sem as outras portas. Recusar é pior que travar. */
    if (prof > LIMITE_PROF) return { ok: false, motivo: "decisao-invalida", via: "" };

    var obraF = txt(fato.obraId);

    /* ---- degrau 0: MODO DA OBRA ---------------------------------- */
    if (obraF) {
      var m = I.modo[obraF];
      /* ⚠ OBRA EM RATEIO: NENHUM destino vale para fato dela. A obra ainda
         divide o gasto pelo orçado; apropriar um fato ali tiraria o valor do
         rateio e o poria num centro só, e os DOIS números apareceriam na
         mesma tela sem nada dizendo que a régua mudou no meio. A saída é a
         conversão explícita, com prévia antes → depois (§4.0). */
      if (m && m.modo === "legado-rateio") return { ok: false, motivo: "obra-em-rateio", via: "" };
    }

    /* ---- degrau 1: ESPELHO DE ESTORNO ---------------------------- */
    var reg = obj(fato.reg) || {};
    if (fato.t === "lanc" && txt(reg.estornoDe)) {
      var orig = I.fin[txt(reg.estornoDe)];
      if (!orig) return { ok: false, motivo: "estorno-orfao", via: "" };
      if (txt(orig.obraId) !== obraF) return { ok: false, motivo: "estorno-outra-obra", via: "" };
      /* ⚠ O ESPELHO SEGUE O ORIGINAL, e o sinal é o DELE. O crédito do
         estorno pertence ao centro que recebeu a despesa: mandá-lo para "Sem
         centro" deixa o saldo do centro menor do que é e a guarda de soma
         não acusa, porque o TOTAL fecha em zero (roteiro medido em
         22/09/2026, js/gestao.js:28809). */
      var sub = resolver(fatoDoLanc(orig, I), I, prof + 1);
      if (!sub.ok) return { ok: false, motivo: sub.motivo, via: "espelho" };
      var pesos = [], ids = [], i;
      for (i = 0; i < sub.partes.length; i++) { ids.push(sub.partes[i].cc); pesos.push(Math.abs(sub.partes[i].c)); }
      var rep = repartir(fato.cent, ids, pesos);
      if (!rep.ok) return { ok: false, motivo: "decisao-invalida", via: "espelho" };
      return { ok: true, partes: rep.partes, via: "espelho", segue: txt(orig.id) };
    }

    /* ---- degrau 2: DECISÃO DA PESSOA no próprio lançamento ------- */
    if (fato.t === "lanc" && txt(fato.id)) {
      var apFin = I.aprop[chaveDa("FIN", txt(fato.id))];
      if (apFin && (txt(apFin.cc) || arr(apFin.pt).length)) {
        var pf = partesDe(apFin, fato.cent, fato, I, "pessoa");
        if (!pf.ok) return { ok: false, motivo: pf.motivo, via: "pessoa" };
        return { ok: true, partes: pf.partes, via: "pessoa", aprop: txt(apFin.id) };
      }
    }

    /* ---- degrau 3: DECISÃO DA PESSOA no documento ----------------- */
    /* ⚠ A PESSOA VENCE O VÍNCULO, e isso é intencional: item orçado numa
       etapa e executado por outra equipe. A trilha na tela diz "o vínculo do
       item foi substituído pela decisão de Fulano em dd/mm" — sem essa frase
       a pessoa não entende por que o número dela não é o do orçamento. */
    if (txt(fato.k) && txt(fato.k) !== "FIN" && txt(fato.d)) {
      var apDoc = I.aprop[chaveDa(fato.k, fato.d)];
      /* decisão MED só com `rs` NÃO responde aqui: ela é o RESTO do boletim
         por itens, usada no degrau 4b */
      if (apDoc && (txt(apDoc.cc) || arr(apDoc.pt).length)) {
        var pd = partesDe(apDoc, fato.cent, fato, I, "pessoa");
        if (!pd.ok) return { ok: false, motivo: pd.motivo, via: "pessoa" };
        return { ok: true, partes: pd.partes, via: "pessoa", aprop: txt(apDoc.id) };
      }
    }

    /* ---- degrau 4: VÍNCULO POR ID -------------------------------- */
    var v4 = vinculo(fato, I, prof);
    if (v4) return v4;

    /* ---- degrau 5: REGRA ----------------------------------------- */
    var rr = regraPara(fato, I);
    if (rr.motivo) return { ok: false, motivo: rr.motivo, via: "regra", ids: rr.ids };
    if (rr.ok) {
      var pr = partesDe(rr.regra.entao, fato.cent, fato, I, "regra");
      if (!pr.ok) return { ok: false, motivo: pr.motivo, via: "regra", regraId: txt(rr.regra.id) };
      return { ok: true, partes: pr.partes, via: "regra", regraId: txt(rr.regra.id), regraNome: txt(rr.regra.nome) };
    }

    /* ---- degrau 6: FILA ------------------------------------------ */
    return { ok: false, motivo: motivoDeFila(fato, I), via: "" };
  }

  /* reparte um total entre ids com pesos, pela régua ÚNICA do CentroCusto */
  function repartir(totalCent, ids, pesos) {
    if (!ids.length) return { ok: false, partes: [] };
    if (ids.length === 1) return { ok: true, partes: [{ cc: ids[0], c: totalCent }] };
    var CC = temCC();
    if (!CC || typeof CC.dividirCentavos !== "function") return { ok: false, partes: [] };
    var d = CC.dividirCentavos(totalCent, pesos);
    if (!d.ok) return { ok: false, partes: [] };
    var partes = [], i;
    for (i = 0; i < ids.length; i++) partes.push({ cc: ids[i], c: d.partes[i] });
    return { ok: true, partes: partes };
  }

  /* motivo do degrau 6, escolhido pelo TIPO do fato (§4.9) */
  function motivoDeFila(fato, I) {
    if (!txt(fato.obraId)) return "sem-obra";
    var k = txt(fato.k);
    if (k === "PC" || fato.t === "pedido") return "sem-centro-pedido";
    if (k === "FIN" && !txt((obj(fato.reg) || {}).etapaId)) return "sem-apropriacao";
    return "sem-regra";
  }

  /* ------------------------------------------------------------------
   * DEGRAU 4 — o vínculo, sub-degrau por sub-degrau
   * ---------------------------------------------------------------- */
  function vinculo(fato, I, prof) {
    var reg = obj(fato.reg) || {}, k = txt(fato.k);

    /* 4a — etapa PRÓPRIA do lançamento
       ⚠ ELA VENCE O PEDIDO (4a antes de 4e), e é a régua do `CustoEtapa`
       (js/custoetapa.js:225-230). Com as duas iguais a invariante I3 fecha
       com o agente ligado e desligado — trocar a ordem aqui faria o mesmo
       dinheiro cair em linhas diferentes na tela de Centros e no Previsto ×
       Realizado, que é a pior divergência possível: duas telas do mesmo app
       respondendo diferente para a mesma pergunta. */
    if (fato.t === "lanc" && txt(reg.etapaId)) {
      return doNo(txt(reg.etapaId), fato, I, "etapa do lançamento");
    }

    /* 4b/4c/4d — boletim de medição */
    if (fato.t === "boletim") return doBoletim(fato, I, prof);

    /* 4b' — a receita (ou a retenção) carimbada MED SEGUE O BOLETIM (§4.12:
       "Receita da medição / retenção → segue o boletim").
       ⚠ Sem este degrau o boletim por itens caía nos centros pelos itens e o
       recebimento DO MESMO boletim ia para a Fila com "sem regra": o centro
       mostraria R$ 50.000 medidos e R$ 0 recebidos de um boletim pago, e a
       pessoa iria cobrar o cliente de um dinheiro que já entrou. O valor
       repartido é o do LANÇAMENTO (a retenção é uma fração do boletim), pelos
       mesmos pesos dos itens. Boletim por valor devolve `null` aqui e desce
       para a regra, como o próprio boletim. */
    if (fato.t === "lanc" && k === "MED" && txt(fato.d) && I.medicao[txt(fato.d)] && prof < LIMITE_PROF) {
      var bol = I.medicao[txt(fato.d)];
      var fb = {
        t: "boletim", id: txt(bol.id), k: "MED", d: txt(bol.id),
        obraId: txt(fato.obraId), data: txt(fato.data), tipo: txt(fato.tipo) || "receita",
        cent: fato.cent, cat: "", forn: "", cnpj: "", frota: "", atv: "", reg: bol
      };
      var rb = doBoletim(fb, I, prof + 1);
      if (rb) return rb;
      return null;
    }

    /* 4e — pedido de compra (o próprio, ou a despesa carimbada dele) */
    if (fato.t === "pedido" || k === "PC") {
      var cid = fato.t === "pedido" ? txt(fato.id) : txt(fato.d);
      if (!cid && txt(reg.compraId)) cid = txt(reg.compraId);
      var cp = I.compra[cid];
      if (cp) {
        /* o centro PRÓPRIO do documento manda sobre a etapa dele: foi
           escolha da pessoa no pedido (§1.8) */
        if (txt(cp.ccId)) {
          var vv = validarDestino(txt(cp.ccId), fato, I, "vinculo");
          if (!vv.ok) return { ok: false, motivo: vv.motivo, via: "vinculo" };
          return { ok: true, partes: [{ cc: txt(cp.ccId), c: fato.cent }], via: "vinculo", fonte: "centro do pedido" };
        }
        if (txt(cp.etapaId)) return doNo(txt(cp.etapaId), fato, I, "etapa do pedido");
      }
      return null;   /* não responde: desce para a regra */
    }

    /* 4f — nota fiscal: dividida PELO VALOR DE CADA PEDIDO */
    if (k === "NF") return daNota(fato, I, prof);

    /* 4d (medição por valor) e 4g (frota) não respondem: descem para a regra.
       A frota chega ao degrau 5 com `fato.frota` preenchido pelo `frota_mov`
       do carimbo, nunca pelo texto. */
    return null;
  }

  function doNo(noId, fato, I, fonte) {
    var idx = indiceDaObra(txt(fato.obraId), I);
    var CC = temCC();
    if (!idx || !CC) return { ok: false, motivo: "etapa-sem-centro", via: "vinculo" };
    var d = CC.centroDoNo(idx, txt(noId));
    if (!d || !d.cc || !txt(d.cc.id)) return { ok: false, motivo: txt(d && d.motivo) || "etapa-sem-centro", via: "vinculo", ids: d && d.ids };
    var v = validarDestino(txt(d.cc.id), fato, I, "vinculo");
    if (!v.ok) return { ok: false, motivo: v.motivo, via: "vinculo" };
    return { ok: true, partes: [{ cc: txt(d.cc.id), c: fato.cent }], via: "vinculo", fonte: fonte };
  }

  /* ------------------------------------------------------------------
   * 4f — A NOTA FISCAL, DIVIDIDA PELO VALOR DE CADA PEDIDO
   *
   * ⚠ OS PEDIDOS SÃO FILTRADOS PELA OBRA DA PARCELA, e é por isso que a
   * chave da decisão carrega a obra (§4.2). Uma nota cobre pedidos de obras
   * diferentes; sem o filtro, a parcela da obra A seria repartida também
   * entre centros da obra B — dinheiro de uma obra aparecendo no centro de
   * outra, por rateio que ninguém pediu. E a divisão é pelo VALOR de cada
   * pedido, nunca em partes iguais: partes iguais num pedido de R$ 90.000 e
   * outro de R$ 1.000 erraria R$ 44.500 de lugar.
   * ---------------------------------------------------------------- */
  function daNota(fato, I, prof) {
    var notaId = txt(fato.d).split("~")[0];
    var nf = I.fiscal[notaId];
    var CN = (typeof CompraNota !== "undefined" && CompraNota) ? CompraNota : null;
    if (!nf || !CN || typeof CN.pedidosDaNota !== "function") return null;   /* desce para a regra (cnpj) */
    var todos = arr(CN.pedidosDaNota(nf));
    if (!todos.length) return null;                                          /* nota sem pedido: regra por cnpj */

    var obraF = txt(fato.obraId), i, obrasDosPedidos = {}, filtrados = [];
    for (i = 0; i < todos.length; i++) {
      var cp = I.compra[txt(todos[i].id)];
      var oc = cp ? txt(cp.obraId) : "";
      obrasDosPedidos[oc] = 1;
      if (oc === obraF) filtrados.push(todos[i]);
    }
    var nObras = 0, kk;
    for (kk in obrasDosPedidos) if (Object.prototype.hasOwnProperty.call(obrasDosPedidos, kk)) nObras++;

    if (!obraF && nObras > 1) return { ok: false, motivo: "nota-sem-obra-pedidos-de-obras", via: "vinculo" };
    if (!filtrados.length) return { ok: false, motivo: "nota-pedido-outra-obra", via: "vinculo" };

    var pesos = [], j;
    for (j = 0; j < filtrados.length; j++) pesos.push(Math.abs(cent(filtrados[j].valor, I.reguas)));
    var fatia = repartir(fato.cent, filtrados.map(function (p) { return txt(p.id); }), pesos);
    if (!fatia.ok) return { ok: false, motivo: "nota-pedido-sem-centro", via: "vinculo" };

    var partes = [];
    for (j = 0; j < filtrados.length; j++) {
      /* cada pedido responde pela CADEIA INTEIRA (decisão da pessoa no
         pedido, centro do pedido, etapa do pedido, regra de PC): a nota não
         tem régua própria, ela herda a de cada pedido que cobre */
      var subFato = {
        t: "lanc", id: "", k: "PC", d: txt(filtrados[j].id),
        obraId: obraF, data: txt(fato.data), tipo: txt(fato.tipo) || "despesa",
        cent: fatia.partes[j].c, reg: {}, cat: txt(fato.cat)
      };
      var sub = resolver(subFato, I, prof + 1);
      /* ⚠ UM PEDIDO SEM CENTRO REPROVA A NOTA INTEIRA. Apropriar só a parte
         que tem centro e deixar o resto em "Sem centro" parte um documento em
         dois estados e a pessoa vê a nota metade dentro, metade fora, sem
         nada dizendo por quê. Motivo próprio (`nota-pedido-sem-centro`)
         manda ela para o pedido que falta, que é onde o conserto mora. */
      if (!sub.ok) return { ok: false, motivo: "nota-pedido-sem-centro", via: "vinculo", pedido: txt(filtrados[j].id) };
      partes = partes.concat(sub.partes);
    }
    return { ok: true, partes: partes, via: "vinculo", fonte: "pedidos da nota, pelo valor de cada um" };
  }

  /* ------------------------------------------------------------------
   * 4b/4c/4d — O BOLETIM DE MEDIÇÃO
   * ---------------------------------------------------------------- */
  function doBoletim(fato, I, prof) {
    var m = obj(fato.reg) || {}, modo = txt(m.modo);

    /* 4d — por valor: não responde, desce para a regra/decisão */
    if (modo === "valor" || (!arr(m.itens).length && modo !== "atividades")) return null;

    /* 4c — por atividades: cada item pela regra com `quando.atv` */
    if (modo === "atividades") {
      var itensA = arr(m.itens), pesosA = [], idsA = [], partesA = [], jA;
      for (jA = 0; jA < itensA.length; jA++) pesosA.push(Math.abs(cent(itensA[jA].valor, I.reguas)));
      var somaA = 0;
      for (jA = 0; jA < pesosA.length; jA++) somaA += pesosA[jA];
      if (!(somaA > 0)) return { ok: false, motivo: "boletim-sem-valor-por-item", via: "vinculo" };
      for (jA = 0; jA < itensA.length; jA++) idsA.push("i" + jA);
      var fatA = repartir(fato.cent, idsA, pesosA);
      if (!fatA.ok) return { ok: false, motivo: "boletim-sem-valor-por-item", via: "vinculo" };
      for (jA = 0; jA < itensA.length; jA++) {
        var subA = { t: "lanc", id: "", k: "MED", d: "", obraId: txt(fato.obraId), data: txt(fato.data),
          tipo: txt(fato.tipo) || "despesa", cent: fatA.partes[jA].c, reg: {}, atv: txt(itensA[jA].atividadeId) };
        var rA = regraPara(subA, I);
        if (rA.motivo) return { ok: false, motivo: rA.motivo, via: "regra", ids: rA.ids };
        if (!rA.ok) return { ok: false, motivo: "boletim-parcial", via: "vinculo" };
        var pA = partesDe(rA.regra.entao, fatA.partes[jA].c, subA, I, "regra");
        if (!pA.ok) return { ok: false, motivo: pA.motivo, via: "regra" };
        partesA = partesA.concat(pA.partes);
      }
      return { ok: true, partes: partesA, via: "vinculo", fonte: "atividades do boletim" };
    }

    /* 4b — por itens do orçamento */
    var orc = null, orcId = txt(m.orcamentoId);
    if (orcId) orc = I.orcamento(orcId);
    if (!orc) {
      /* ⚠ O ORÇAMENTO DO BOLETIM, NÃO O DA OBRA (crítica D30). Eles divergem
         quando a obra foi passada para uma revisão nova: o boletim antigo
         mediu itens da R1 e a obra aponta para a R2. Usar o da obra casaria
         `itemId` de orçamentos diferentes — e itens da R1 que não existem na
         R2 sairiam sem centro, calados. Só quando o do boletim está na
         FAMÍLIA do da obra (ids conservados) o da obra serve. */
      var obra = I.obras[txt(fato.obraId)];
      var fam = I.familiaDe(txt(fato.obraId)) || [];
      var naFamilia = false, fi;
      for (fi = 0; fi < fam.length; fi++) if (txt(fam[fi]) === orcId) naFamilia = true;
      if (obra && txt(obra.orcamentoId) && naFamilia) orc = I.orcamento(txt(obra.orcamentoId));
      if (!orc) return { ok: false, motivo: "boletim-orcamento-ausente", via: "vinculo" };
    }
    var mapa = noDoItemDe(orc, I), idx = indiceDaObra(txt(fato.obraId), I), CC = temCC();
    var itens = arr(m.itens), pesos = [], somaPesos = 0, j;
    for (j = 0; j < itens.length; j++) {
      var p = Math.abs(cent(itens[j].valor, I.reguas));
      pesos.push(p);
      somaPesos += p;
    }
    if (!(somaPesos > 0)) {
      /* boletim com valor e nenhum item valorado: não há como dividir, e
         dividir igual inventaria destino */
      if (fato.cent !== 0) return { ok: false, motivo: "boletim-sem-valor-por-item", via: "vinculo" };
      return { ok: false, motivo: "boletim-parcial", via: "vinculo" };
    }
    var ids = [];
    for (j = 0; j < itens.length; j++) ids.push("i" + j);
    var fat = repartir(fato.cent, ids, pesos);
    if (!fat.ok) return { ok: false, motivo: "boletim-sem-valor-por-item", via: "vinculo" };

    var partes = [], restoCent = 0, temResto = false;
    for (j = 0; j < itens.length; j++) {
      var noInfo = mapa[txt(itens[j].itemId)];
      var no = noInfo ? (txt(noInfo.subEtapaId) || txt(noInfo.etapaId)) : "";
      var alvo = (no && idx && CC) ? CC.centroDoNo(idx, no) : null;
      if (alvo && alvo.cc && txt(alvo.cc.id)) {
        var vd = validarDestino(txt(alvo.cc.id), fato, I, "vinculo");
        if (vd.ok) { partes.push({ cc: txt(alvo.cc.id), c: fat.partes[j].c }); continue; }
      }
      /* item sem centro entra no RESTO */
      temResto = true;
      restoCent += fat.partes[j].c;
    }
    if (!temResto) return { ok: true, partes: partes, via: "vinculo", fonte: "itens do boletim" };

    /* o RESTO: decisão `rs` do boletim → regra MED → fila `boletim-parcial` */
    var ap = I.aprop[chaveDa("MED", txt(fato.id))];
    if (ap && obj(ap.rs)) {
      var pr = partesDe(ap.rs, restoCent, fato, I, "pessoa");
      if (!pr.ok) return { ok: false, motivo: pr.motivo, via: "pessoa" };
      return { ok: true, partes: partes.concat(pr.partes), via: "vinculo", resto: "pessoa", fonte: "itens do boletim, resto decidido" };
    }
    var rg = regraPara(fato, I);
    if (rg.motivo) return { ok: false, motivo: rg.motivo, via: "regra", ids: rg.ids };
    if (rg.ok) {
      var pg = partesDe(rg.regra.entao, restoCent, fato, I, "regra");
      if (!pg.ok) return { ok: false, motivo: pg.motivo, via: "regra" };
      return { ok: true, partes: partes.concat(pg.partes), via: "vinculo", resto: "regra", regraId: txt(rg.regra.id), fonte: "itens do boletim, resto pela regra" };
    }
    /* ⚠ PARCIAL NÃO É APROPRIADO. Um boletim com metade dos itens em etapas
       sem centro vai INTEIRO para a Fila, com `boletim-parcial`. Apropriar a
       metade que fecha e deixar a outra em "Sem centro" faria a soma do
       boletim não bater com nenhuma linha da tela, e a pessoa não teria como
       descobrir de onde vinha a diferença. */
    return { ok: false, motivo: "boletim-parcial", via: "vinculo", faltam: restoCent };
  }

  /* ------------------------------------------------------------------
   * FATOS (§4.1) — o dinheiro que já está no disco, com o que a regra lê
   * ---------------------------------------------------------------- */
  function fatoDoLanc(f, I) {
    var o = origemDe(f);
    return {
      t: "lanc", id: txt(f.id), k: o.k, d: o.d,
      obraId: txt(f.obraId), data: txt(f.data).slice(0, 10),
      tipo: txt(f.tipo) || "despesa",
      cent: cent(f.valor, I.reguas),
      cat: txt(f.categoria),
      forn: txt(f.fornecedorId),
      cnpj: soDigitos(f.cnpj || f.cnpjEmitente),
      /* ⚠ A FROTA SAI DO `frota_mov` APONTADO PELO CARIMBO (crítica D22),
         não do texto do lançamento. Sem carimbo FRT, `frota` fica vazio e
         nenhuma regra de veículo alcança o fato — que é o certo: melhor não
         decidir do que decidir pelo nome escrito na descrição. */
      frota: (o.k === "FRT" && I.frotaMov[o.d]) ? txt(I.frotaMov[o.d].frotaId) : "",
      atv: "",
      pago: ehPago(f, I),
      dataPgto: dataDoPagamento(f, I),
      avisos: o.avisos,
      reg: f
    };
  }

  /* ⚠ O PEDIDO COMPROMETIDO VIRA FATO NUM LUGAR SÓ. Ele nasce em DOIS
     caminhos: na volta pelas listas (`fatos`, que alimenta a Fila e o
     `consolidar`) e no `partesPorNo`, que o `CustoEtapa.consolidar` chama
     pedido a pedido. Com duas cópias desta conta, o valor que o agente
     reparte e o valor que o Previsto × Realizado credita divergiriam no
     primeiro conserto esquecido — e o motor de lá acusa a divergência
     ("a apropriação … não fecha com o valor deles"), mas só depois de a
     tela ter mostrado o número. Devolve `null` para pedido que não é
     compromisso ou que já virou despesa inteiro. */
  function fatoDoPedido(cp, I) {
    var r = I.reguas || {};
    if (!obj(cp) || !txt(cp.id)) return null;
    var st = txt(cp.status).toLowerCase();
    var comp = (typeof r.ehCompromisso === "function") ? !!r.ehCompromisso(st)
      : (st === "aprovado" || st === "enviado" || st === "confirmado");
    if (!comp) return null;
    var ja = (r.jaEDespesa && typeof r.jaEDespesa === "object") ? num(r.jaEDespesa[txt(cp.id)]) : 0;
    var val = (typeof r.valorComprometido === "function")
      ? num(r.valorComprometido(cp, ja, num(cp.valor)))
      : Math.max(0, num(cp.valor) - ja);
    var vc = cent(val, r);
    if (!(vc > 0)) return null;
    return {
      t: "pedido", id: txt(cp.id), k: "PC", d: txt(cp.id),
      obraId: txt(cp.obraId), data: txt(cp.data).slice(0, 10),
      tipo: "despesa", cent: vc, cat: txt(cp.categoria), forn: txt(cp.fornecedorId),
      cnpj: "", frota: "", atv: "", pago: false, dataPgto: "", avisos: [], reg: cp
    };
  }

  /* ⚠ A RECEITA DA MEDIÇÃO NASCE SEM `dataPgto`, E A DATA DELA É A DO
     PAGAMENTO. As duas portas que a criam (o [Registrar pgto] e o select de
     Status do boletim) gravam `data: <dataPgto do boletim>`, `status:
     "pago"` e o carimbo `docTipo:"MED"` — e nenhuma põe `dataPgto` no
     lançamento. Sem esta leitura, a caixa do D20 dizia "a data do pagamento
     não está registrada" sobre uma receita paga hoje (medido no navegador,
     Parte D, e2e-cc-selects [3]). A leitura é pelo CARIMBO, nunca por
     semelhança (skill `dinheiro` §2): só lançamento `MED` quitado; qualquer
     outro sem `dataPgto` continua dizendo que não está registrada, porque
     ali a `data` pode ser a do lançamento e não a do pagamento (§4.1).
     ⚠ As portas NÃO foram mexidas — a skill `dinheiro` §3 manda as quatro
     concordarem, e esta é uma leitura, não uma quinta regra de baixa. */
  function dataDoPagamento(f, I) {
    var dp = txt(f.dataPgto || f.dataRecebimento).slice(0, 10);
    if (dp) return dp;
    if (txt(f.docTipo) === "MED" && txt(f.docId) && !txt(f.estornoDe) && ehPago(f, I)) return txt(f.data).slice(0, 10);
    return "";
  }

  function ehPago(f, I) {
    var r = I.reguas || {};
    if (typeof r.realizado === "function") return !!r.realizado(f);
    /* sem a régua do FinStatus: sem status = pago (§4.1) */
    var st = txt(f.status);
    return !st || st === "pago" || st === "recebido";
  }

  function fatos(ctx, I) {
    var c = obj(ctx) || {};
    I = I || montarIndice(ctx);
    var r = I.reguas || {}, out = [];
    var alvo = txt(c.obraId);
    function daObraQueInteressa(oid) { return alvo === "" || txt(oid) === alvo; }

    arr(c.financeiro).forEach(function (f) {
      if (!obj(f) || !txt(f.id)) return;
      if (!daObraQueInteressa(f.obraId)) return;
      /* cancelado fora (ehMorto); sem status = pago (ehQuitado) */
      if (typeof r.ehMorto === "function" && r.ehMorto(f)) return;
      if (typeof r.anulado === "function" && r.anulado(f)) return;
      out.push(fatoDoLanc(f, I));
    });

    arr(c.compras).forEach(function (cp) {
      if (!obj(cp) || !txt(cp.id)) return;
      if (!daObraQueInteressa(cp.obraId)) return;
      var fp = fatoDoPedido(cp, I);
      if (fp) out.push(fp);
    });

    arr(c.medicoes).forEach(function (m) {
      if (!obj(m) || !txt(m.id)) return;
      if (!daObraQueInteressa(m.obraId)) return;
      var st = txt(m.status).toLowerCase();
      if (st === "rejeitada" || st === "rejeitado") return;
      var aprov = (typeof r.ehAprovado === "function") ? !!r.ehAprovado(m) : (st === "aprovado" || st === "pago");
      out.push({
        t: "boletim", id: txt(m.id), k: "MED", d: txt(m.id),
        obraId: txt(m.obraId), data: txt(m.periodoFim || m.data).slice(0, 10),
        tipo: "receita", cent: cent(m.valor, r), cat: "", forn: "", cnpj: "", frota: "", atv: "",
        medido: aprov, emAnalise: !aprov, pago: st === "pago", dataPgto: txt(m.dataRecebimento).slice(0, 10),
        avisos: [], reg: m
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------
   * FILA — quem está esperando decisão de uma pessoa
   *
   * ⚠ QUEM ENTRA NA FILA É FATO DE OBRA QUE ADOTOU OS CENTROS NOVOS (§4.9).
   * Listar fato de obra que ainda não adotou daria uma fila de centenas de
   * linhas que nenhum clique resolve — e fila que não esvazia ensina a
   * ignorar a fila. A obra em outro modo aparece com a PORTA da conversão,
   * não com os fatos dela.
   * ---------------------------------------------------------------- */
  function temCentroDaEmpresa(I) {
    for (var i = 0; i < I.ccsCrus.length; i++) {
      var cc = I.ccsCrus[i];
      if (obj(cc) && !txt(cc.obraId) && num(cc.fmt) === 2) return true;
    }
    return false;
  }
  function mapaVisiveis(I) {
    if (!I.obrasVisiveis) return null;
    var v = {};
    for (var i = 0; i < I.obrasVisiveis.length; i++) v[txt(I.obrasVisiveis[i])] = 1;
    return v;
  }
  /* ⚠ QUEM ENTRA NA FILA É DECIDIDO NUM LUGAR SÓ, e a `fila` e o
     `consolidar` perguntam aqui. Duas cópias desta regra dariam uma Fila com
     N linhas e um "Sem centro" com outra conta na aba ao lado — as duas
     abas da mesma tela discordando sobre o mesmo dinheiro. Devolve a linha,
     ou `null` para fato que não entra. */
  function entradaDaFila(f, res, I, temEmpresa, visiveis) {
    if (res.ok) return null;
    if (FORA_DA_FILA[res.motivo]) return null;
    var obraF = txt(f.obraId);
    if (obraF) {
      var m = I.modo[obraF];
      if (!m || m.modo !== "novo") return null;                 /* obra sem adoção: fora da Fila */
      if (visiveis && !visiveis[obraF]) return null;            /* recorte do usuário restrito */
    } else if (!temEmpresa) {
      return null;                                              /* sem centro da empresa, fato sem obra não tem destino */
    }
    return {
      t: f.t, id: f.id, k: f.k, d: f.d, obraId: obraF, data: f.data,
      /* ⚠ `tipo` VAI JUNTO porque a Fila tem despesa E receita, e as duas
         saem com valor POSITIVO. Sem este campo a tela não tem como
         distinguir, e uma receita de R$ 50.000 numa lista lida como "o que
         já saiu" vira uma despesa aos olhos de quem confere. */
      tipo: txt(f.tipo) || "despesa",
      cent: f.cent, valor: f.cent / 100, pago: !!f.pago, dataPgto: f.dataPgto,
      motivo: res.motivo, texto: textoMotivo(res.motivo), via: res.via,
      /* ⚠ `desc` PRIMEIRO: é o campo que o Financeiro grava (formulário,
         gasto rápido, portas de baixa). `descricao`/`numero` são de
         documento (pedido, boletim). Lendo só `descricao`, a Fila mostrava a
         linha do lançamento de verdade SEM descrição nenhuma — medido no
         navegador na Parte D (e2e-cc-selects); as suítes semeavam
         `descricao` e passavam. */
      ids: res.ids || null, desc: txt((obj(f.reg) || {}).desc || (obj(f.reg) || {}).descricao || (obj(f.reg) || {}).numero)
    };
  }
  /* ⚠ ORDEM ESTÁVEL (invariante I7): data decrescente e, no empate, o id.
     Sem o segundo critério a Fila embaralha a cada render e a pessoa perde
     a linha que ela estava lendo. */
  function ordenarFila(out) {
    out.sort(function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? 1 : -1;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return a.t < b.t ? -1 : (a.t > b.t ? 1 : 0);
    });
    return out;
  }

  function fila(ctx) {
    var I = montarIndice(ctx), fs = fatos(ctx, I), out = [], porMotivo = {}, i;
    var temCentroEmpresa = temCentroDaEmpresa(I);
    var visiveis = mapaVisiveis(I);
    for (i = 0; i < fs.length; i++) {
      var f = fs[i];
      var res = resolver(f, I, 0);
      var linha = entradaDaFila(f, res, I, temCentroEmpresa, visiveis);
      if (!linha) continue;
      out.push(linha);
      /* ⚠ A QUEBRA POR MOTIVO SEPARA DESPESA DE RECEITA. Somadas, "ninguém
         apropriou ainda — R$ 55.000" juntava R$ 5.000 de diesel com
         R$ 50.000 de recebimento: um número que não responde nada e que se
         lê como gasto. Quem consome escolhe o que mostrar; o motor não
         entrega os dois já misturados, porque depois não há como separar. */
      if (!porMotivo[res.motivo]) porMotivo[res.motivo] = { desp: 0, rec: 0, n: 0 };
      porMotivo[res.motivo][txt(f.tipo) === "receita" ? "rec" : "desp"] += f.cent;
      porMotivo[res.motivo].n++;
    }
    ordenarFila(out);
    return { fila: out, porMotivo: porMotivo, avisos: I.avisos };
  }

  /* ------------------------------------------------------------------
   * PAGOS AFETADOS (D20) — a confirmação que diz QUANTO já está lançado
   *
   * ⚠ A PERGUNTA NÃO É "ESTE DOCUMENTO JÁ FOI PAGO?", QUE MORA NUM CAMPO
   * EDITÁVEL. Reabrir um documento pago APAGA o `dataPgto` de propósito
   * (senão ele ficaria aprovado e impossível de pagar para sempre) — com a
   * data limpa, a guarda que a lesse liberaria calada. A pergunta certa é
   * "que dinheiro JÁ LANÇADO muda de centro se eu aplicar isto?", e ela se
   * responde comparando as duas resoluções sobre os fatos PAGOS. Skill
   * `dinheiro` §5.
   * ---------------------------------------------------------------- */
  function pagosAfetados(fatosLista, resolverAntes, resolverDepois, reguas) {
    var out = { n: 0, valor: 0, maisRecente: "", lista: [] }, i;
    var fs = arr(fatosLista);
    for (i = 0; i < fs.length; i++) {
      var f = fs[i];
      if (!f || !f.pago) continue;
      var a = typeof resolverAntes === "function" ? resolverAntes(f) : null;
      var b = typeof resolverDepois === "function" ? resolverDepois(f) : null;
      if (assinaturaPartes(a) === assinaturaPartes(b)) continue;
      out.n++;
      out.valor += num(f.cent) / 100;
      var dp = txt(f.dataPgto);
      if (dp && dp > out.maisRecente) out.maisRecente = dp;
      out.lista.push({
        fato: txt(f.id), valor: num(f.cent) / 100, dataPgto: dp,
        de: assinaturaPartes(a), para: assinaturaPartes(b)
      });
    }
    out.valor = Math.round(out.valor * 100) / 100;
    return out;
  }

  function assinaturaPartes(res) {
    if (!res || !res.ok) return "";
    var ps = arr(res.partes).slice(0);
    ps.sort(function (a, b) { return txt(a.cc) < txt(b.cc) ? -1 : (txt(a.cc) > txt(b.cc) ? 1 : 0); });
    var out = [], i;
    for (i = 0; i < ps.length; i++) out.push(txt(ps[i].cc) + ":" + Math.round(num(ps[i].c)));
    return out.join(",");
  }

  /* ------------------------------------------------------------------
   * SUGESTÃO (§4.9) — sempre com a palavra "sugestão", nunca aplicada só
   *
   * ⚠ ELA CASA POR ID, NUNCA POR DESCRIÇÃO. A chave é o fornecedor do
   * pedido, o CNPJ da nota, o veículo do `frota_mov` ou, para lançamento
   * avulso, `categoria` + `etapaId` — e sem etapa não há sugestão nenhuma
   * (crítica D32). Sugerir por texto parecido é o caminho mais curto para a
   * pessoa aceitar um destino errado com um clique, achando que o sistema
   * sabia algo que ela não sabia.
   * ---------------------------------------------------------------- */
  function sugerir(fato, I) {
    var chave = chaveDeSugestao(fato);
    if (!chave) return null;
    var vistos = [], k, i;
    for (k in I.aprop) if (Object.prototype.hasOwnProperty.call(I.aprop, k)) {
      var ap = I.aprop[k];
      if (!obj(ap) || txt(ap.obraId) !== txt(fato.obraId)) continue;
      var part = chaveDe(k);
      if (!part) continue;
      var alvo = txt(ap.cc);
      if (!alvo) continue;                        /* rateio não vira sugestão de um centro */
      var outro = fatoDaChave(part, I);
      if (!outro) continue;
      if (chaveDeSugestao(outro) !== chave) continue;
      vistos.push({ cc: alvo, em: txt(ap.criadoEm) });
    }
    if (!vistos.length) return null;
    vistos.sort(function (a, b) { return a.em < b.em ? 1 : (a.em > b.em ? -1 : 0); });
    vistos = vistos.slice(0, 20);
    var conta = {}, topo = "", nTopo = 0;
    for (i = 0; i < vistos.length; i++) {
      conta[vistos[i].cc] = (conta[vistos[i].cc] || 0) + 1;
      if (conta[vistos[i].cc] > nTopo) { nTopo = conta[vistos[i].cc]; topo = vistos[i].cc; }
    }
    if (!topo) return null;
    return { cc: topo, n: nTopo, de: vistos.length, chave: chave };
  }

  function chaveDeSugestao(fato) {
    var k = txt(fato.k);
    if (k === "PC" && txt(fato.forn)) return "forn:" + txt(fato.forn);
    if (k === "NF") return txt(fato.forn) ? ("forn:" + txt(fato.forn)) : (soDigitos(fato.cnpj) ? "cnpj:" + soDigitos(fato.cnpj) : "");
    if (k === "FRT" && txt(fato.frota)) return "frota:" + txt(fato.frota);
    if (k === "FIN" || k === "RAP") {
      var et = txt((obj(fato.reg) || {}).etapaId);
      /* ⚠ SEM ETAPA, NENHUMA SUGESTÃO (crítica D32). "Categoria material" é
         metade dos lançamentos de uma obra: sugerir por ela sozinha acertaria
         por acaso e ensinaria a confiar no acaso. */
      if (!et || !txt(fato.cat)) return "";
      return "cat:" + txt(fato.cat) + "|etapa:" + et;
    }
    return "";
  }

  function fatoDaChave(part, I) {
    if (part.k === "FIN" || part.k === "RAP") {
      var f = I.fin[part.d];
      return f ? fatoDoLanc(f, I) : null;
    }
    if (part.k === "PC") {
      var cp = I.compra[part.d];
      if (!cp) return null;
      return { t: "pedido", id: txt(cp.id), k: "PC", d: txt(cp.id), obraId: txt(cp.obraId),
        forn: txt(cp.fornecedorId), cat: txt(cp.categoria), cnpj: "", frota: "", reg: cp };
    }
    if (part.k === "NF") {
      var notaId = txt(part.d).split("~")[0], nf = I.fiscal[notaId];
      if (!nf) return null;
      return { t: "lanc", id: "", k: "NF", d: txt(part.d), obraId: txt(part.d).split("~")[1] || "",
        cnpj: soDigitos(nf.cnpjEmitente || nf.cnpj), forn: txt(nf.fornecedorId), cat: "", frota: "", reg: nf };
    }
    if (part.k === "FRT") {
      var mv = I.frotaMov[part.d];
      if (!mv) return null;
      return { t: "lanc", id: "", k: "FRT", d: part.d, obraId: txt(mv.obraId),
        frota: txt(mv.frotaId), cat: "", forn: "", cnpj: "", reg: mv };
    }
    return null;
  }

  /* ------------------------------------------------------------------
   * O NÓ "NATIVO" DE UM FATO — onde a régua de hoje do Previsto × Realizado
   * já o põe (`CustoEtapa.herancaDireta`/`resolverNo`, js/custoetapa.js)
   *
   * ⚠ ESPELHO DO `CustoEtapa`, DE PROPÓSITO, e só para uma pergunta: "o
   * centro que o agente escolheu é o MESMO que esse nó já daria?". Se é, a
   * parte vai para o nó nativo — que pode ser a SUBETAPA — em vez do nó do
   * centro (`origem.s || origem.e`). Roteiro do que isto impede: lançamento
   * carimbado na subetapa 1.1 de uma etapa 1 NÃO detalhada (o centro é o da
   * etapa inteira). Pela letra da §4.6 a parte iria para "1"; a linha 1
   * continuaria certa, mas a linha 1.1 do Previsto × Realizado PERDERIA o
   * valor que mostra hoje — o agente piorando a régua de hoje, que é o que a
   * §4.6 diz que ele nunca faz. O nível 1 é o mesmo nos dois casos (I2/I3).
   * ---------------------------------------------------------------- */
  function herancaDireta(f, I) {
    var r = obj(f) || {};
    if (txt(r.etapaId)) return txt(r.etapaId);
    var cp = null;
    if (txt(r.docTipo) === "PC" && txt(r.docId)) cp = I.compra[txt(r.docId)];
    if (cp && txt(cp.etapaId)) return txt(cp.etapaId);
    if (txt(r.compraId)) { cp = I.compra[txt(r.compraId)]; if (cp && txt(cp.etapaId)) return txt(cp.etapaId); }
    return "";
  }
  function noNativo(fato, I) {
    var r = obj(fato.reg) || {};
    if (fato.t === "pedido") return txt(r.etapaId);
    if (fato.t !== "lanc") return "";
    var d = herancaDireta(r, I);
    if (d) return d;
    if (!txt(r.estornoDe)) return "";
    var o = I.fin[txt(r.estornoDe)];
    if (!o || txt(o.obraId) !== txt(r.obraId)) return "";
    return herancaDireta(o, I);
  }

  /* família do orçamento da obra, como mapa (cache por obra na chamada) */
  function familiaMapa(obraId, I) {
    if (!I._fam) I._fam = {};
    var k = txt(obraId);
    if (I._fam[k]) return I._fam[k];
    var m = {}, l = I.familiaDe(k), i, kk;
    if (Array.isArray(l)) {
      for (i = 0; i < l.length; i++) { if (txt(l[i])) m[txt(l[i])] = 1; }
    } else if (obj(l)) {
      for (kk in l) { if (Object.prototype.hasOwnProperty.call(l, kk) && l[kk]) m[txt(kk)] = 1; }
    }
    I._fam[k] = m;
    return m;
  }

  /* o nó onde a parte de um centro cai no Previsto × Realizado */
  function noDaParte(ccId, fato, nat, I) {
    var cc = I.ccs[txt(ccId)];
    var CC = temCC();
    if (!cc || !CC || typeof CC.origemValida !== "function") return "";
    var o = CC.origemValida(cc.origem);
    /* centro sem origem (Administração local, canteiro) → sem nó: vai ao
       balde `apropriadoSemEtapa`, que está nos totais (I9) */
    if (!o) return "";
    /* ⚠ ORIGEM FORA DA FAMÍLIA DA OBRA É CENTRO PRÓPRIO (D-CC5). O nó dele é
       de OUTRO orçamento; mandá-lo para esse id faria o Previsto × Realizado
       declará-lo "etapa fora do orçamento atual" e tirá-lo das linhas — ele
       está apropriado, só não tem linha aqui. */
    var fam = familiaMapa(txt(cc.obraId) || txt(fato.obraId), I);
    var dono = txt(o.o) || txt(o.r);
    if (!dono || !fam[dono]) return "";
    var no = txt(o.s) || txt(o.e);
    if (nat && no && nat !== no && typeof CC.centroDoNo === "function") {
      var idx = indiceDaObra(txt(fato.obraId), I);
      var d = idx ? CC.centroDoNo(idx, nat) : null;
      if (d && d.cc && txt(d.cc.id) === txt(ccId)) return nat;
    }
    return no;
  }

  /* ------------------------------------------------------------------
   * 4.6 PARTES POR NÓ — a tomada do `CustoEtapa.consolidar` (`apropriar`)
   *
   * ⚠ `null` PARA TODO FATO QUE O AGENTE NÃO RESOLVEU, e nunca "sem nó".
   * Roteiro do defeito (crítica D1): na revisão 1 da espec a Fila devolvia
   * `no:null`, e o motor de lá punha o fato em "não apropriado" (ou no balde):
   * a obra de demonstração PERDIA R$ 105.860 das etapas no dia em que o
   * agente fosse ligado. `null` diz "faça como hoje" (`etapaHerdada`,
   * `c.etapaId`): quem o agente não resolveu continua exatamente onde está.
   * ⚠ Nada aqui grava; o índice é montado UMA vez e cada fato é resolvido
   * uma vez por chamada (memo), porque o Painel chama isto a cada render.
   * ---------------------------------------------------------------- */
  function partesPorNo(ctx) {
    var I = montarIndice(ctx), memo = {};
    function paraNos(fato) {
      var res = resolver(fato, I, 0);
      if (!res || !res.ok || !arr(res.partes).length) return null;
      var nat = noNativo(fato, I), out = [], i;
      for (i = 0; i < res.partes.length; i++) {
        var p = res.partes[i];
        out.push({ no: noDaParte(p.cc, fato, nat, I), c: Math.round(num(p.c)), cc: txt(p.cc) });
      }
      return out;
    }
    function copia(l) {
      if (!l) return null;
      var o = [], i;
      for (i = 0; i < l.length; i++) o.push({ no: l[i].no, c: l[i].c, cc: l[i].cc });
      return o;
    }
    return {
      lanc: function (f) {
        if (!obj(f) || !txt(f.id)) return null;
        var k = "l:" + txt(f.id);
        if (!Object.prototype.hasOwnProperty.call(memo, k)) memo[k] = paraNos(fatoDoLanc(f, I));
        return copia(memo[k]);
      },
      pedido: function (cp) {
        if (!obj(cp) || !txt(cp.id)) return null;
        var k = "p:" + txt(cp.id);
        if (!Object.prototype.hasOwnProperty.call(memo, k)) {
          var fp = fatoDoPedido(cp, I);
          memo[k] = fp ? paraNos(fp) : null;
        }
        return copia(memo[k]);
      }
    };
  }

  /* ------------------------------------------------------------------
   * 4.5 CONSOLIDAR — os números de cada centro, por UMA passada de fatos
   *
   * ⚠ TODO VALOR DA SAÍDA É EM CENTAVOS INTEIROS. A conversão para reais é
   * da tela. Somar reais em ponto flutuante aqui faria a I1 (as quatro
   * parcelas de uma obra fecham com o total dela) reprovar por
   * 0,000000001, e o conserto seria afrouxar a comparação que impede um
   * centavo de sumir.
   *
   * ⚠ CADA FATO É CONTADO UMA VEZ — na obra dele, e em "Sem obra" o que
   * não tem obra (crítica D3). A soma de todas as obras mais "Sem obra" é o
   * total vivo da empresa; somar por centro e depois por obra contaria o
   * centro da empresa uma vez em cada obra que o usa.
   *
   * ⚠ RECORTE DO USUÁRIO RESTRITO (crítica F6): com `obrasVisiveis`, SÓ o
   * visível e o sem obra somam. O fato de obra oculta que cai num centro da
   * empresa marca `ocultoOutrasObras` SEM número — a tela diz que há valores
   * que a pessoa não acompanha. A resolução continua na lista crua (a guarda
   * conta o disco inteiro).
   *
   * ⚠ NÃO GRAVA, NÃO MUDA O QUE RECEBE (I5). A saída é objeto novo.
   * ---------------------------------------------------------------- */
  function resolverFatos(ctx, I) {
    I = I || montarIndice(ctx);
    var fs = fatos(ctx, I), out = [], i;
    for (i = 0; i < fs.length; i++) out.push({ fato: fs[i], res: resolver(fs[i], I, 0) });
    return out;
  }

  function quitadoLanc(f, I) {
    var r = I.reguas || {};
    if (typeof r.ehQuitado === "function") return !!r.ehQuitado(f);
    var st = txt(f && f.status).toLowerCase();
    return st === "" || st === "pago";
  }

  function consolidar(ctx) {
    var c = obj(ctx) || {};
    var I = montarIndice(c);
    var CC = temCC();
    var alvo = txt(c.obraId);
    var visiveis = mapaVisiveis(I);
    var temEmpresa = temCentroDaEmpresa(I);
    var avisos = [], vistoAviso = {};
    function aviso(a) {
      if (!a) return;
      var ch = txt(a.tipo) + "|" + txt(a.msg);
      if (vistoAviso[ch]) return;
      vistoAviso[ch] = 1;
      avisos.push({ tipo: txt(a.tipo), msg: txt(a.msg) });
    }
    arr(I.avisos).forEach(aviso);

    var centros = {}, obras = {}, rateioLegado = {}, porFato = {}, filaOut = [];
    var semObra = { totalVivo: 0, emCentrosDaEmpresa: 0, semCentro: 0 };
    function visivel(oid) { return !visiveis || !txt(oid) || !!visiveis[txt(oid)]; }

    function novoCentro(cc) {
      var n = I.normal[txt(cc.id)] || {};
      var marcas = [];
      if (n._ativo === false) marcas.push("desativado");
      if (n._arquivado) marcas.push("arquivado");
      if (txt(n.apura) === "obra") marcas.push("cabecalho");
      if (txt(n.apura) === "rateio") marcas.push("rateio");
      return {
        orcado: 0, orcadoFonte: "digitado", comprometido: 0, realizadoComp: 0, realizadoCaixa: 0, saldo: 0,
        medido: 0, emAnalise: 0, recebido: 0, receitaOutras: 0, n: 0,
        porVia: { vinculo: 0, regra: 0, pessoa: 0, espelho: 0 }, porObra: {},
        ocultoOutrasObras: false, marcas: marcas, obraId: txt(cc.obraId)
      };
    }
    I.ccsCrus.forEach(function (cc) {
      if (!obj(cc) || !txt(cc.id)) return;
      var oid = txt(cc.obraId);
      if (alvo && oid && oid !== alvo) return;
      if (oid && !visivel(oid)) return;
      centros[txt(cc.id)] = novoCentro(cc);
    });

    function obraDe(oid) {
      if (!obras[oid]) {
        var m = I.modo[oid] || ((CC && typeof CC.modoDaObra === "function") ? CC.modoDaObra(oid, I.ccsCrus) : { modo: "sem-centros" });
        obras[oid] = { modo: txt(m.modo) || "sem-centros", totalVivo: 0, emCentrosDaObra: 0, emCentrosDaEmpresa: 0, semCentro: 0, obraInteira: {} };
      }
      return obras[oid];
    }
    /* toda obra visível do recorte aparece, mesmo sem dinheiro: "R$ 0,00" é
       resposta; ausência seria lida como "esta obra não existe" */
    arr(c.obras).forEach(function (o) {
      if (!obj(o) || !txt(o.id)) return;
      if (alvo && txt(o.id) !== alvo) return;
      if (!visivel(o.id)) return;
      obraDe(txt(o.id));
    });

    var lista = resolverFatos(c, I), i, j;
    for (i = 0; i < lista.length; i++) {
      var f = lista[i].fato, res = lista[i].res;
      var oid = txt(f.obraId);
      arr(f.avisos).forEach(aviso);
      if (!visivel(oid)) {
        /* ⚠ SEM NÚMERO. Só a marca, e só no centro da empresa. */
        if (res.ok) for (j = 0; j < res.partes.length; j++) {
          var cO = centros[txt(res.partes[j].cc)];
          if (cO && !cO.obraId) cO.ocultoOutrasObras = true;
        }
        continue;
      }
      var ehDespLanc = f.t === "lanc" && (txt(f.tipo) || "despesa") === "despesa";
      var chave = f.t + ":" + txt(f.id);
      var ent = {
        t: f.t, id: txt(f.id), k: f.k, d: f.d, obraId: oid, tipo: txt(f.tipo) || "despesa",
        valor: f.cent, pago: !!f.pago, dataPgto: txt(f.dataPgto),
        rotulo: txt((obj(f.reg) || {}).desc || (obj(f.reg) || {}).descricao || (obj(f.reg) || {}).numero),
        via: txt(res.via), motivo: res.ok ? "" : txt(res.motivo),
        regraId: txt(res.regraId), regraNome: txt(res.regraNome), fonte: txt(res.fonte),
        no: noNativo(f, I)
      };
      if (res.ok) {
        if (res.partes.length === 1) ent.cc = txt(res.partes[0].cc);
        else ent.partes = res.partes.map(function (p) { return { cc: txt(p.cc), c: Math.round(num(p.c)) }; });
      } else ent.cc = "";
      porFato[chave] = ent;

      /* a obra (I1) — só a DESPESA lançada, que é o "total vivo" */
      if (ehDespLanc) {
        var B = oid ? obraDe(oid) : semObra;
        B.totalVivo += f.cent;
        if (res.ok) {
          for (j = 0; j < res.partes.length; j++) {
            var ccP = I.ccs[txt(res.partes[j].cc)];
            if (ccP && !txt(ccP.obraId)) B.emCentrosDaEmpresa += res.partes[j].c;
            else if (oid) B.emCentrosDaObra += res.partes[j].c;
            /* fato sem obra só alcança centro da empresa (validarDestino);
               o `else` acima nunca roda para ele — mas se rodasse, o dinheiro
               ficaria em "sem centro" em vez de sumir */
            else B.semCentro += res.partes[j].c;
          }
        } else B.semCentro += f.cent;
      }

      if (!res.ok) {
        var lf = entradaDaFila(f, res, I, temEmpresa, visiveis);
        if (lf) filaOut.push(lf);
        continue;
      }
      var contado = {};
      for (j = 0; j < res.partes.length; j++) {
        var p = res.partes[j], cid = txt(p.cc);
        var C = centros[cid];
        if (!C) {
          /* ⚠ CENTRO FORA DO RECORTE QUE RECEBEU DINHEIRO DO RECORTE: ele
             entra, em vez de o dinheiro sumir da saída. (Só acontece com
             centro da empresa de outra obra filtrada — que o `validarDestino`
             já recusa —, mas a regra aqui é "nunca perder um centavo".) */
          if (!I.ccs[cid]) continue;
          C = centros[cid] = novoCentro(I.ccs[cid]);
        }
        if (!contado[cid]) { C.n++; contado[cid] = 1; }
        var v = Math.round(num(p.c));
        if (f.t === "pedido") C.comprometido += v;
        else if (f.t === "boletim") { if (f.medido) C.medido += v; else C.emAnalise += v; }
        else if (ehDespLanc) {
          C.realizadoComp += v;
          if (quitadoLanc(f.reg, I)) C.realizadoCaixa += v;
          var via = txt(res.via) || "vinculo";
          if (C.porVia[via] === undefined) C.porVia[via] = 0;
          C.porVia[via] += v;
          if (!C.obraId) C.porObra[oid] = (C.porObra[oid] || 0) + v;
        } else {
          /* receita lançada: a da medição quitada é "recebido"; as demais
             ficam num bloco à parte (K23) — nunca somadas à despesa */
          /* ⚠ `f.pago`, NÃO o `ehQuitado` da despesa: receita quitada nasce
             "recebido", e o `ehQuitado` só conhece "pago" — o recebimento de
             um boletim pago sairia R$ 0,00 no centro. */
          if (txt(f.k) === "MED") { if (f.pago) C.recebido += v; }
          else C.receitaOutras += v;
        }
      }
    }
    ordenarFila(filaOut);

    /* orçado ao vivo (§4.7.2) — a régua é a do CentroCusto, não uma cópia */
    var ctxOrc = {};
    function ctxOrcDe(oid) {
      if (ctxOrc[oid]) return ctxOrc[oid];
      var obra = I.obras[oid], orc = null;
      if (obra && txt(obra.orcamentoId)) orc = I.orcamento(txt(obra.orcamentoId));
      ctxOrc[oid] = { orc: orc, familia: I.familiaDe(oid), indice: oid ? indiceDaObra(oid, I) : null };
      return ctxOrc[oid];
    }
    var k2;
    for (k2 in centros) if (Object.prototype.hasOwnProperty.call(centros, k2)) {
      var CX = centros[k2], ccR = I.ccs[k2];
      if (ccR && CC && typeof CC.orcadoDe === "function") {
        var od = CC.orcadoDe(ccR, ctxOrcDe(txt(ccR.obraId)));
        CX.orcado = Math.round(num(od.valor) * 100);
        CX.orcadoFonte = txt(od.fonte) || "digitado";
        arr(od.avisos).forEach(aviso);
      } else if (ccR) {
        CX.orcado = cent(ccR.valorOrcado, I.reguas);
        CX.orcadoFonte = "digitado";
      }
      CX.saldo = CX.orcado - CX.comprometido - CX.realizadoComp;
    }

    /* cabeçalho "obra inteira" e rateio legado (§4.5.1) — por obra */
    var oidK;
    for (oidK in obras) if (Object.prototype.hasOwnProperty.call(obras, oidK)) {
      var O = obras[oidK];
      var daObraLeg = I.ccsCrus.filter(function (x) { return obj(x) && txt(x.obraId) === oidK; });
      var abracado = O.totalVivo - O.emCentrosDaEmpresa;
      daObraLeg.forEach(function (x) {
        var nx = I.normal[txt(x.id)] || {};
        if (txt(nx.apura) === "obra") O.obraInteira[txt(x.id)] = abracado;
      });
      if (O.modo === "legado-rateio" && CC && typeof CC.dividirCentavos === "function") {
        var leg = daObraLeg.filter(function (x) { return txt((I.normal[txt(x.id)] || {}).apura) === "rateio"; });
        leg.sort(function (a, b) { return txt(a.id) < txt(b.id) ? -1 : (txt(a.id) > txt(b.id) ? 1 : 0); });
        if (leg.length) {
          var pesos = leg.map(function (x) { return Math.max(0, cent(x.valorOrcado, I.reguas)); });
          var soma = 0; pesos.forEach(function (p2) { soma += p2; });
          /* sem orçado nenhum: partes iguais, como a 1.2.81 faz */
          if (!(soma > 0)) pesos = leg.map(function () { return 1; });
          var dv = CC.dividirCentavos(abracado, pesos);
          if (dv.ok) leg.forEach(function (x, ix) { rateioLegado[txt(x.id)] = dv.partes[ix]; });
        }
      }
    }

    /* ⚠ GUARDA-DO-GUARDA DA I1 CONTRA A RÉGUA ÚNICA. `totalVivo` aqui é a
       soma dos fatos; o `CustoEtapa.totalVivo` é a conta que Painel,
       Relatórios e Centros usam. Divergiu (régua de "morto" diferente, lista
       diferente), o motor DIZ — não escolhe um dos dois. */
    if (typeof CustoEtapa !== "undefined" && CustoEtapa && typeof CustoEtapa.totalVivo === "function") {
      var fin = arr(c.financeiro), oo;
      for (oo in obras) if (Object.prototype.hasOwnProperty.call(obras, oo)) {
        var tv = Math.round(num(CustoEtapa.totalVivo(fin, { obraId: oo, tipo: "despesa" }).valor) * 100);
        if (tv !== obras[oo].totalVivo) {
          avisos.push({ tipo: "cc-total-diverge", obraId: oo, msg: "O gasto desta obra somado pelo agente (" + fmtCent(obras[oo].totalVivo) +
            ") não bate com o do Financeiro (" + fmtCent(tv) + ") — os números por centro desta obra não foram conferidos." });
        }
      }
    }

    var totDesp = 0, totResolv = 0, kf;
    for (kf in porFato) if (Object.prototype.hasOwnProperty.call(porFato, kf)) {
      var e2 = porFato[kf];
      if (e2.t !== "lanc" || e2.tipo !== "despesa") continue;
      totDesp += Math.abs(e2.valor);
      if (!e2.motivo) totResolv += Math.abs(e2.valor);
    }
    return {
      centros: centros, obras: obras, semObra: semObra, rateioLegado: rateioLegado,
      fila: filaOut, porFato: porFato,
      cobertura: { pctApropriado: totDesp > 0 ? (totResolv / totDesp * 100) : 100 },
      avisos: avisos
    };
  }

  /* ==================================================================
   * 4.8 — O QUE UMA REGRA MUDA, ANTES DE ELA EXISTIR
   *
   * ⚠ REGRA É DINHEIRO MUDANDO DE CENTRO EM LOTE, SEM NINGUÉM OLHAR FATO
   *   A FATO. Uma regra "folha desta obra → Administração" com `desde` em
   *   janeiro tira de uma vez oito meses de folha da Fila (ou de outro
   *   centro) e põe no centro dela — e parte disso já foi pago. Por isso
   *   toda porta da aba Regras (criar, mudar, encerrar, excluir, compactar)
   *   pergunta AQUI, antes de gravar: quantos fatos, quanto, de onde para
   *   onde, e quais pagos. A conta é a do `resolver` antes × depois sobre
   *   os MESMOS fatos — nunca uma estimativa pela condição da regra, que
   *   esqueceria o vínculo e a decisão da pessoa (que vencem a regra).
   * ================================================================== */
  function copiaCtx(c, troca) {
    var o = {}, k;
    for (k in c) if (Object.prototype.hasOwnProperty.call(c, k)) o[k] = c[k];
    for (k in troca) if (Object.prototype.hasOwnProperty.call(troca, k)) o[k] = troca[k];
    return o;
  }
  /* destino como a tela o nomeia: "" = Fila; um centro; "rateio:a+b" */
  function destinoDe(res) {
    if (!res || !res.ok) return "";
    var ps = arr(res.partes);
    if (ps.length === 1) return txt(ps[0].cc);
    var ids = [], i;
    for (i = 0; i < ps.length; i++) ids.push(txt(ps[i].cc));
    ids.sort();
    return "rateio:" + ids.join("+");
  }
  /* o fato é dinheiro que a pessoa confere como PAGO? (a régua do D20 da
     Parte B: lançamento vivo quitado, que não é espelho nem foi estornado).
     ⚠ O boletim e o pedido ficam fora: o "pago" deles é o lançamento
     carimbado, que já está na lista — contá-los pediria a confirmação do
     mesmo dinheiro duas vezes, com o dobro do valor. */
  function pagoParaD20(f, estornados) {
    var r = obj(f && f.reg) || {};
    return !!(f && f.t === "lanc" && f.pago && !txt(r.estornoDe) && !estornados[txt(f.id)]);
  }

  /* previaRegra(ctx, regrasDepois, opcoes) — PURA, não grava.
     `ctx` = o contexto do agente com as regras de HOJE; `regrasDepois` = a
     lista inteira como ficaria (a nova, a encerrada, a substituída).
     `opcoes.regraIds` = as regras que esta ação cria ou muda (para contar as
     decisões e os vínculos que continuam vencendo ELAS). */
  function previaRegra(ctx, regrasDepois, opcoes) {
    var c = obj(ctx) || {}, op = obj(opcoes) || {};
    var Ia = montarIndice(c);
    var Id = montarIndice(copiaCtx(c, { regras: arr(regrasDepois) }));
    var fs = fatos(c, Ia), i;
    var alvo = {}, temAlvo = false;
    arr(op.regraIds).forEach(function (id) { if (txt(id)) { alvo[txt(id)] = 1; temAlvo = true; } });
    var estornados = {};
    arr(c.financeiro).forEach(function (f) { if (obj(f) && txt(f.estornoDe)) estornados[txt(f.estornoDe)] = 1; });
    var visiveis = mapaVisiveis(Ia);
    var out = {
      n: 0, cent: 0, valor: 0,
      boletins: { n: 0, cent: 0 },
      grupos: [], lista: [],
      paraFila: { n: 0, cent: 0 }, saiDaFila: { n: 0, cent: 0 },
      decisoes: { n: 0, cent: 0 }, vinculo: { n: 0, cent: 0 },
      pagos: { n: 0, valor: 0, maisRecente: "", lista: [] },
      oculto: false, avisos: Ia.avisos
    };
    var porGrupo = {}, antes = {}, depois = {};
    for (i = 0; i < fs.length; i++) {
      var f = fs[i];
      var ra = resolver(f, Ia, 0), rd = resolver(f, Id, 0);
      antes[f.t + ":" + f.id] = ra; depois[f.t + ":" + f.id] = rd;
      /* ⚠ "AS DECISÕES QUE CONTINUAM VALENDO" (§4.8-2): o fato que a regra
         alcançaria, mas onde a pessoa (ou o vínculo) continua mandando. Sem
         esta linha a pessoa lê "a regra leva 3 lançamentos" e acha que as
         outras 12 folhas da obra também foram — e não foram, porque alguém
         decidiu cada uma à mão antes. */
      if (temAlvo && rd.ok && (rd.via === "pessoa" || rd.via === "vinculo") && f.t !== "boletim") {
        var rp = regraPara(f, Id);
        if (rp.ok && alvo[txt(rp.regra.id)]) {
          var qual = rd.via === "pessoa" ? out.decisoes : out.vinculo;
          qual.n++; qual.cent += num(f.cent);
        }
      }
      var de = destinoDe(ra), para = destinoDe(rd);
      if (assinaturaPartes(ra) === assinaturaPartes(rd) && ra.ok === rd.ok) continue;
      if (visiveis && txt(f.obraId) && !visiveis[txt(f.obraId)]) out.oculto = true;
      /* ⚠ O BOLETIM FICA NUMA CONTA À PARTE. Ele é o valor de VENDA medido;
         a receita que ele gerou é um lançamento, que já está na conta. Somar
         os dois dizia o dobro do dinheiro que muda de centro. */
      if (f.t === "boletim") { out.boletins.n++; out.boletins.cent += num(f.cent); }
      else {
        out.n++; out.cent += num(f.cent);
        if (!para) { out.paraFila.n++; out.paraFila.cent += num(f.cent); }
        if (!de) { out.saiDaFila.n++; out.saiDaFila.cent += num(f.cent); }
      }
      var chG = de + ">" + para;
      if (!porGrupo[chG]) { porGrupo[chG] = { de: de, para: para, n: 0, cent: 0 }; out.grupos.push(porGrupo[chG]); }
      porGrupo[chG].n++; if (f.t !== "boletim") porGrupo[chG].cent += num(f.cent);
      out.lista.push({ t: f.t, id: f.id, obraId: txt(f.obraId), data: f.data, tipo: f.tipo, cent: f.cent,
        de: de, para: para, pago: pagoParaD20(f, estornados), desc: txt((obj(f.reg) || {}).desc || (obj(f.reg) || {}).descricao || (obj(f.reg) || {}).numero) });
    }
    out.valor = out.cent / 100;
    out.grupos.sort(function (a, b) { return (b.cent - a.cent) || (a.de + ">" + a.para < b.de + ">" + b.para ? -1 : 1); });
    ordenarFila(out.lista);
    /* D20 pela régua ÚNICA (`pagosAfetados`), sobre as MESMAS resoluções */
    out.pagos = pagosAfetados(fs.filter(function (f) { return pagoParaD20(f, estornados); }),
      function (f) { return antes[f.t + ":" + f.id]; }, function (f) { return depois[f.t + ":" + f.id]; }, c.reguas);
    return out;
  }

  /* a confirmação trazida pela tela vale para ESTE número? (n, R$ e os
     pagos). ⚠ Confirmar uma prévia e gravar outra é assinar papel em
     branco: se entre o clique e a gravação outro aparelho lançou mais uma
     folha, o número mudou e a porta pergunta de novo. */
  function previaConfere(conf, p) {
    var k = obj(conf);
    if (!k || !p) return false;
    return Math.round(num(k.n)) === p.n && Math.round(num(k.cent)) === Math.round(p.cent) &&
      Math.round(num(k.pagosN)) === p.pagos.n && Math.round(num(k.pagosValor) * 100) === Math.round(p.pagos.valor * 100) &&
      Math.round(num(k.boletinsN)) === p.boletins.n;
  }
  function previaAssinatura(p) {
    return { n: p.n, cent: Math.round(p.cent), pagosN: p.pagos.n, pagosValor: p.pagos.valor, boletinsN: p.boletins.n };
  }

  /* estatisticasRegras(ctx) → {id: {decidiu:{n,cent}, excecoes:{n,cent,lista}}}
     ⚠ "DECIDIU" CONTA NA LISTA CRUA (§4.8-5), qualquer que seja o recorte
     de quem olha: é a guarda do [Excluir]. Uma regra que decidiu a folha de
     uma obra que o sub-usuário não acompanha NÃO é "Decidiu 0" — apagá-la
     mudaria dinheiro daquela obra. O valor, esse sim, só das visíveis. */
  function estatisticasRegras(ctx) {
    var c = copiaCtx(obj(ctx) || {}, { obraId: "" });
    var I = montarIndice(c), fs = fatos(c, I), out = {}, i;
    var visiveis = mapaVisiveis(I);
    function de(id) {
      if (!out[id]) out[id] = { decidiu: { n: 0, cent: 0, oculto: false }, excecoes: { n: 0, cent: 0, lista: [] } };
      return out[id];
    }
    arr(c.regras).forEach(function (r) { if (obj(r) && txt(r.id)) de(txt(r.id)); });
    for (i = 0; i < fs.length; i++) {
      var f = fs[i], res = resolver(f, I, 0);
      var vis = !visiveis || !txt(f.obraId) || !!visiveis[txt(f.obraId)];
      if (res.ok && res.via === "regra" && res.regraId) {
        var e = de(txt(res.regraId));
        e.decidiu.n++;
        if (f.t !== "boletim") { if (vis) e.decidiu.cent += num(f.cent); else e.decidiu.oculto = true; }
        continue;
      }
      /* ⚠ EXCEÇÃO = A PESSOA DECIDIU À MÃO UM FATO QUE A REGRA ALCANÇARIA
         (§4.8-7). O sistema nunca aprende sozinho: ele só MOSTRA quantas são,
         para a pessoa ver que a regra não está fazendo o que ela pensa. */
      if (res.ok && res.via === "pessoa" && f.t !== "boletim") {
        var rp = regraPara(f, I);
        if (rp.ok && vis) {
          var x = de(txt(rp.regra.id));
          x.excecoes.n++; x.excecoes.cent += num(f.cent);
          if (x.excecoes.lista.length < 50) {
            x.excecoes.lista.push({ t: f.t, id: f.id, data: f.data, cent: f.cent, obraId: txt(f.obraId), aprop: res.aprop,
              desc: txt((obj(f.reg) || {}).desc || (obj(f.reg) || {}).descricao || (obj(f.reg) || {}).numero), cc: destinoDe(res) });
          }
        }
      }
    }
    return out;
  }

  /* ==================================================================
   * 4.8-6 COMPACTAÇÃO — decisões repetidas viram UMA regra
   *
   * ⚠ ELA NÃO PODE MUDAR NÚMERO NENHUM DAS DECISÕES QUE APAGA. O objetivo
   *   é caber no documento da nuvem (teto de 650 KB), não reclassificar.
   *   Por isso a ORDEM É FIXA (crítica D9): (1) grava a regra; (2) confere,
   *   pelo `resolver`, que cada fato do grupo dá O MESMO resultado sem a
   *   decisão; (3) só então apaga as conferidas. Apagar antes de conferir
   *   deixaria o fato que a regra NÃO alcança (a folha lançada com etapa,
   *   que o vínculo pega primeiro; um centro desativado no meio) pular de
   *   centro calado — e a decisão da pessoa, que era a única coisa dizendo
   *   onde aquele dinheiro estava, já não existiria para ninguém conferir.
   *
   * ⚠ SÓ FATO SEM VÍNCULO POSSÍVEL (§4.8-6): FOL, PON, FRT, FSM, RAP, CARP e
   *   FIN sem etapa. Decisão de MED, PC, NF ou FIN com etapa fica fora: a
   *   regra PERDE para o vínculo, e a decisão da pessoa não pode ser
   *   rebaixada a uma regra que, no dia em que o pedido ganhar centro,
   *   deixaria de valer para ele sem ninguém escolher isso.
   * ================================================================== */
  var K_COMPACTA = { FOL: 1, PON: 1, FRT: 1, FSM: 1, RAP: 1, CARP: 1, FIN: 1 };
  var NOME_ORIGEM = { FOL: "folha", PON: "ponto", FRT: "frota", FSM: "folha semanal", RAP: "gasto rápido", CARP: "carpintaria", FIN: "lançamento avulso" };
  function chavesDoFato(f) {
    var out = [];
    if (f.t === "lanc" && txt(f.id)) out.push(chaveDa("FIN", f.id));
    if (txt(f.k) && txt(f.k) !== "FIN" && txt(f.k) !== "RAP" && txt(f.k) !== "ESP" && txt(f.d)) out.push(chaveDa(f.k, f.d));
    return out;
  }
  function idCompactada(obraId, tipo, quando, desde) {
    var CC = temCC();
    if (!CC || typeof CC._fnv1a32hex !== "function") return "";
    /* ⚠ ID DETERMINÍSTICO (§1.6, crítica D24): a retentativa depois de uma
       falha no meio acha a MESMA regra e continua a conferência de onde
       parou, em vez de criar uma segunda — que empataria com a primeira e
       mandaria o grupo inteiro para a Fila. */
    return "ccr_c" + CC._fnv1a32hex(txt(obraId) + "|" + txt(tipo) + "|" + quandoCanonico(quando) + "|" + txt(desde));
  }

  /* compactar(decisoes, regras, fatos, opcoes) → {grupos, fora, avisos} — PURA.
     Cada grupo traz a regra proposta e TODAS as decisões do grupo (a
     conferência é que diz quais saem). */
  function compactar(decisoes, regras, fatosLista, opcoes) {
    var op = obj(opcoes) || {};
    var porChave = {};
    arr(fatosLista).forEach(function (f) {
      if (!obj(f)) return;
      chavesDoFato(f).forEach(function (k) { (porChave[k] = porChave[k] || []).push(f); });
    });
    var fora = { n: 0, porMotivo: {} };
    function tira(motivo, id) { fora.n++; (fora.porMotivo[motivo] = fora.porMotivo[motivo] || []).push(id); }
    var grupos = {}, ordem = [];
    arr(decisoes).forEach(function (d) {
      if (!obj(d) || !txt(d.id)) return;
      var ch = chaveDe(d.id);
      if (!ch) { tira("decisao-invalida", txt(d.id)); return; }
      if (arr(d.pt).length || !txt(d.cc)) { tira("partes", txt(d.id)); return; }
      var fs = porChave[txt(d.id)] || [];
      if (!fs.length) { tira("sem-fato", txt(d.id)); return; }
      var f0 = fs[0], k = txt(f0.k) || "FIN";
      if (!K_COMPACTA[k]) { tira("vinculo", txt(d.id)); return; }
      var misto = false, j;
      for (j = 1; j < fs.length; j++) {
        if (txt(fs[j].k) !== k || txt(fs[j].cat) !== txt(f0.cat) || txt(fs[j].obraId) !== txt(f0.obraId) ||
            txt(fs[j].tipo) !== txt(f0.tipo) || txt(fs[j].frota) !== txt(f0.frota)) misto = true;
      }
      if (misto) { tira("misturado", txt(d.id)); return; }
      /* ⚠ LANÇAMENTO AVULSO COM ETAPA TEM VÍNCULO (degrau 4a): a regra
         nunca o alcançaria. Para as outras origens a §4.8 NÃO pede este
         corte — e a conferência é que pega a folha lançada com etapa. */
      if ((k === "FIN" || k === "RAP") && txt((obj(f0.reg) || {}).etapaId)) { tira("fin-com-etapa", txt(d.id)); return; }
      var quando = { o: k };
      if (txt(f0.cat)) quando.cat = txt(f0.cat);
      if (k === "FRT" && txt(f0.frota)) quando.frota = txt(f0.frota);
      var cond = txt(f0.obraId) + "|" + (txt(f0.tipo) || "despesa") + "|" + quandoCanonico(quando);
      var chG = cond + ">" + txt(d.cc);
      if (!grupos[chG]) {
        grupos[chG] = { cond: cond, obraId: txt(f0.obraId), tipo: txt(f0.tipo) || "despesa", quando: quando, cc: txt(d.cc),
          decisaoIds: [], fatos: [], n: 0, cent: 0, desde: "" };
        ordem.push(chG);
      }
      var g = grupos[chG];
      g.decisaoIds.push(txt(d.id));
      fs.forEach(function (f) {
        g.fatos.push(f.t + ":" + f.id);
        if (f.t !== "boletim") g.cent += num(f.cent);
        var dt = txt(f.data).slice(0, 10);
        if (dt && (!g.desde || dt < g.desde)) g.desde = dt;
      });
      g.n = g.decisaoIds.length;
    });
    /* ⚠ UMA PROPOSTA POR CONDIÇÃO. Duas regras com a MESMA condição (obra,
       tipo, origem, categoria, veículo) e destinos diferentes são "regra
       igual" (crítica D24) — a segunda seria recusada. Fica a maior; as
       decisões do outro destino continuam à mão, e o recado diz quantas. */
    var porCond = {};
    ordem.forEach(function (chG) {
      var g = grupos[chG];
      if (g.n < 2) { g.decisaoIds.forEach(function (id) { tira("sozinha", id); }); return; }
      var atual = porCond[g.cond];
      if (!atual || g.n > atual.n || (g.n === atual.n && (g.cent > atual.cent || (g.cent === atual.cent && g.cc < atual.cc)))) {
        if (atual) atual.decisaoIds.forEach(function (id) { tira("outro-destino", id); });
        porCond[g.cond] = g;
      } else g.decisaoIds.forEach(function (id) { tira("outro-destino", id); });
    });
    var out = [], cn;
    for (cn in porCond) if (Object.prototype.hasOwnProperty.call(porCond, cn)) {
      var G = porCond[cn];
      var desde = G.desde || txt(op.hoje).slice(0, 10);
      var rot = NOME_ORIGEM[txt(G.quando.o)] || txt(G.quando.o);
      var nome = ("Decisões repetidas: " + rot + (G.quando.cat ? " (" + txt(G.quando.cat) + ")" : "") + (G.quando.frota ? " do veículo" : "") +
        " → " + (typeof op.nomeCentro === "function" ? txt(op.nomeCentro(G.cc)) : G.cc)).slice(0, 80);
      var regra = { id: idCompactada(G.obraId, G.tipo, G.quando, desde), obraId: G.obraId, nome: nome, tipo: G.tipo,
        quando: G.quando, entao: { t: "cc", cc: G.cc }, desde: desde, ate: null, ativa: 1, ant: "", subst: "",
        por: txt(op.por).slice(0, 40) };
      out.push({ id: regra.id, regra: regra, decisaoIds: G.decisaoIds.slice(0).sort(), fatos: G.fatos, n: G.n, cent: G.cent });
    }
    out.sort(function (a, b) { return (b.n - a.n) || (a.id < b.id ? -1 : 1); });
    return { grupos: out, fora: fora, avisos: temCC() ? [] : [{ tipo: "cc-sem-cadastro", msg: "Sem o cadastro de centros (js/centrocusto.js) não há id determinístico — nada é compactado." }] };
  }

  /* conferirCompactacao(ctx, ids) — PURA. Com as regras de HOJE (a da
     compactação já gravada), quais destas decisões podem sair sem que
     nenhum fato mude de centro? Devolve {conferidas, naoConferem, motivo}. */
  function conferirCompactacao(ctx, ids) {
    var c = obj(ctx) || {};
    var I = montarIndice(c), fs = fatos(c, I);
    var restantes = [], naoConferem = [], motivo = {}, porDec = {};
    arr(ids).forEach(function (id) {
      var s = txt(id);
      if (!s || porDec[s]) return;
      porDec[s] = [];
      if (!I.aprop[s]) { naoConferem.push(s); motivo[s] = "ja-apagada"; return; }
      restantes.push(s);
    });
    fs.forEach(function (f) { chavesDoFato(f).forEach(function (k) { if (porDec[k]) porDec[k].push(f); }); });
    restantes = restantes.filter(function (s) {
      if (porDec[s].length) return true;
      naoConferem.push(s); motivo[s] = "sem-fato"; return false;
    });
    var volta;
    for (volta = 0; volta < 8 && restantes.length; volta++) {
      var sai = {};
      restantes.forEach(function (s) { sai[s] = 1; });
      var Is = montarIndice(copiaCtx(c, { decisoes: arr(c.decisoes).filter(function (x) { return !(obj(x) && sai[txt(x.id)]); }) }));
      var falhou = {}, algum = false;
      restantes.forEach(function (s) {
        porDec[s].forEach(function (f) {
          var a = resolver(f, I, 0), b = resolver(f, Is, 0);
          if (!a.ok || !b.ok || assinaturaPartes(a) !== assinaturaPartes(b)) { falhou[s] = 1; algum = true; }
        });
      });
      if (algum) {
        restantes = restantes.filter(function (s) {
          if (!falhou[s]) return true;
          naoConferem.push(s); motivo[s] = "resultado-muda"; return false;
        });
        continue;
      }
      /* ⚠ E NENHUM OUTRO FATO PODE MUDAR. Um fato de outra chave não lê
         estas decisões hoje — mas "hoje" é a régua deste arquivo, e a
         conferência não pode depender de ninguém lembrar disso quando o
         resolver ganhar um degrau novo. */
      var mudou = false;
      fs.forEach(function (f) {
        if (mudou) return;
        var a2 = resolver(f, I, 0), b2 = resolver(f, Is, 0);
        if (assinaturaPartes(a2) !== assinaturaPartes(b2) || a2.ok !== b2.ok) mudou = true;
      });
      if (mudou) {
        restantes.forEach(function (s) { naoConferem.push(s); motivo[s] = "outro-fato-muda"; });
        restantes = [];
      }
      break;
    }
    return { conferidas: restantes.sort(), naoConferem: naoConferem.sort(), motivo: motivo };
  }

  /* planoCompactacao(ctx, opcoes) — PURA. A proposta que a tela mostra:
     cada grupo com a prévia da regra (o que ela leva ALÉM das decisões) e a
     previsão da conferência. A fiação refaz tudo ao gravar. */
  function planoCompactacao(ctx, opcoes) {
    var c = obj(ctx) || {}, op = obj(opcoes) || {};
    var I = montarIndice(c), fs = fatos(c, I);
    var comp = compactar(c.decisoes, c.regras, fs, op);
    var grupos = [];
    comp.grupos.forEach(function (g) {
      var ja = false, regrasDepois = [];
      arr(c.regras).forEach(function (r) {
        if (obj(r) && txt(r.id) === g.id) { ja = true; regrasDepois.push(r); } else regrasDepois.push(r);
      });
      if (!ja) regrasDepois.push(g.regra);
      var v = ja ? { ok: true } : validarRegra(g.regra, { ccs: c.ccs, regras: c.regras, restrito: !!op.restrito });
      var pv = previaRegra(c, regrasDepois, { regraIds: [g.id] });
      var cf = conferirCompactacao(copiaCtx(c, { regras: regrasDepois }), g.decisaoIds);
      grupos.push({ id: g.id, regra: g.regra, jaGravada: ja, decisaoIds: g.decisaoIds, n: g.n, cent: g.cent,
        valida: !!v.ok, recusa: v.ok ? "" : v.msg, previa: pv, previsao: { conferidas: cf.conferidas.length, naoConferem: cf.naoConferem.length } });
    });
    return { grupos: grupos, fora: comp.fora, avisos: comp.avisos };
  }

  var CCAgente = {
    MOTIVOS: MOTIVOS,
    FORA_DA_FILA: FORA_DA_FILA,
    montarIndice: montarIndice,
    resolver: resolver,
    fatos: fatos,
    fatoDoLanc: fatoDoLanc,
    fila: fila,
    consolidar: consolidar,
    partesPorNo: partesPorNo,
    resolverFatos: resolverFatos,
    fatoDoPedido: fatoDoPedido,
    pagosAfetados: pagosAfetados,
    sugerir: sugerir,
    assinaturaPartes: assinaturaPartes,
    textoMotivo: textoMotivo,
    chaveDa: chaveDa,
    chaveDe: chaveDe,
    origemDe: origemDe,
    validarDestino: validarDestino,
    validarRegra: validarRegra,
    regraPara: regraPara,
    quandoCanonico: quandoCanonico,
    especificidade: especificidade,
    regraLegivel: regraLegivel,
    regraAtiva: regraAtiva,
    vigenciaSobrepoe: vigenciaSobrepoe,
    previaRegra: previaRegra,
    previaConfere: previaConfere,
    previaAssinatura: previaAssinatura,
    estatisticasRegras: estatisticasRegras,
    compactar: compactar,
    conferirCompactacao: conferirCompactacao,
    planoCompactacao: planoCompactacao,
    idCompactada: idCompactada,
    destinoDe: destinoDe,
    _partesDe: partesDe,
    _cent: cent
  };

  global.CCAgente = CCAgente;
  if (typeof module !== "undefined" && module.exports) module.exports = CCAgente;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

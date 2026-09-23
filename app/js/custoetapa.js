/* =====================================================================
 * custoetapa.js — QUANTO JÁ SAIU EM CADA ETAPA, E POR QUAL PORTA ENTROU
 * O QUE NINGUÉM ETIQUETOU.
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * A pergunta "quanto já gastei na etapa de estrutura?" só tem resposta se o
 * gasto souber a que etapa pertence. Hoje ele quase nunca sabe: `etapaId` é
 * escrito no formulário manual e na cópia do estorno, e NENHUM dos caminhos
 * automáticos o carimba — compra recebida, parcela de nota fiscal, folha e
 * medição entram todos sem etiqueta. Como material e mão de obra entram
 * justamente por esses caminhos, "Não apropriado" tende a ser a maior linha
 * da tabela.
 *
 * ⚠ E O PIOR NÃO É A LINHA GRANDE — É A TELA RESPONDER ERRADO COM CARA DE
 * CERTA. As etapas aparecem com consumo perto de zero, sugerindo folga
 * orçamentária onde o dinheiro já saiu. Quem lê "Estrutura: orçado 200k,
 * realizado 8k" autoriza a próxima compra.
 *
 * POR ISSO `naoApropriado.porOrigem` É O PRODUTO, NÃO SOBRA.
 * Ele diz por QUAL PORTA o dinheiro entrou sem etiqueta — e é o que prova,
 * depois, que o carimbo novo funcionou. Um número grande em `PC` aponta para
 * o recebimento de compra; em `folha`, para o fechamento da folha. Sem essa
 * quebra, "72% não apropriado" é uma reclamação; com ela, é uma lista de
 * consertos.
 *
 * ⚠ POR QUE ELE É PURO (sem DOM, sem Store, sem Util)
 * É a conta que decide se há saldo para comprar. Conta que decide compra não
 * pode ser código sem teste, e `js/gestao.js` não entra no gate. Tudo chega
 * por parâmetro — mesmo padrão de `js/porobra.js`, `js/bimpeca.js` e
 * `js/bimtubo.js`.
 *
 * ⚠ TRÊS REGIMES DE "REALIZADO", E ELES NÃO SÃO O MESMO NÚMERO
 *   · competência — o que já é obrigação (pago + em aberto). É o que se
 *     compara contra o orçamento, porque o orçamento também é obrigação.
 *   · caixa       — só o que saiu da conta. É o que se compara com o extrato.
 *   · comprometido— pedido de compra APROVADO e ainda não recebido. Não é
 *     despesa ainda, e é justamente o número que falta na hora de autorizar
 *     a próxima compra.
 * Misturar os três num só "realizado" é o defeito que o Painel já tem em
 * outra forma; aqui eles saem separados e rotulados.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js) — e ela precisou de DUAS
   * tentativas, o que é a lição. O módulo é puro (o gate o roda em Node, onde
   * `Util` não existe), então a regra vem copiada; mas meia regra erra tanto
   * quanto nenhuma, e nas duas direções:
   *   - `replace(/\./g,"")` às cegas lê "1234.56" como 123456   (×100)
   *   - só tratar o ponto quando há vírgula lê "1.850.000" como 1,85
   *     (÷1.000.000) — e essa foi a que eu escrevi consertando a primeira.
   * O segundo erro é pior: infla o saldo da etapa e a tela que decide compra
   * mostra a obra praticamente sem gasto.
   * A paridade com o `Util.parseNum` real é verificada em tools/test-numbr.js;
   * se um dos dois lados mudar, o gate acusa. */
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
  function arr(a) { return Array.isArray(a) ? a : []; }
  /* pt-BR na mão: o módulo é puro e não enxerga `Util` (o gate o roda em Node) */
  function fmt(v) {
    var n = Math.abs(num(v)), s = n.toFixed(2).split(".");
    return "R$ " + (num(v) < 0 ? "-" : "") + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1];
  }
  function txt(s) { return String(s == null ? "" : s).trim(); }

  /* ⚠ ESTADO MORTO NÃO É GASTO. `cancelado` é registro morto: não é dívida
     nem saída. A tela antiga somava tudo, inclusive cancelado — e Compras já
     descartava, então as duas telas discordavam sobre a mesma obra.
     `estornado` não é estado: é o espelho de sinal oposto, que se cancela
     sozinho na soma (doutrina do js/finstatus.js). */
  function ehMorto(f) { return txt(f.status).toLowerCase() === "cancelado"; }
  function ehQuitado(f) {
    /* ⚠ SEM STATUS É PAGO, não é pendente. É a doutrina do js/finstatus.js
       (`norm(undefined) === "pago"`), e o registro legado do cliente nasceu
       sem o campo. Exigindo a string, `realizadoCaixa` descartava tudo que é
       anterior ao ciclo de vida novo — e a coluna que diz o que JÁ SAIU DO
       BANCO mostrava menos do que saiu, na mesma tela em que
       `realizadoCompetencia` contava certo. */
    var st = txt(f.status).toLowerCase();
    return st === "" || st === "pago";
  }

  /* De qual porta veio o lançamento sem etiqueta. O carimbo `docTipo` existe
     em compra (PC) e nota (NF); os outros se reconhecem pela descrição, que é
     o que há — e quando nem isso, entra em `semCarimbo`, que é a resposta
     honesta. */
  /* ⚠ ROTULO HUMANO AO LADO DE QUEM CRIA A CHAVE. `semCarimbo` e nome de
     CAMPO, e vazava para a tela dentro do aviso de cobertura: o usuario lia
     "Entrou principalmente por: compra, semCarimbo". A tela de Previsto x
     Realizado ja tinha o mapa de rotulos, mas o aviso e montado AQUI, no
     motor, e nao passava por ele. Nome interno na frase do usuario e
     vazamento de implementacao — quem le nao sabe o que e "semCarimbo". */
  var ROT_ORIGEM = { compra: "compra recebida", nota: "nota fiscal", folha: "folha",
    medicao: "medição", frota: "frota", semCarimbo: "sem origem identificada",
    /* portas que ganharam carimbo próprio na 1.2.83 (mc-5B) — o rótulo entra
       aqui JUNTO com a chave, senão a tela volta a escrever "folhaSemanal" na
       frase do usuário, que é o defeito que a nota acima descreve */
    ponto: "ponto", folhaSemanal: "folha semanal", rapido: "gasto rápido",
    /* ⚠ NÃO É "SEM ETIQUETA": o lançamento TEM etapa, e a etapa é que não
       existe mais no orçamento vinculado hoje (revisão do orçamento, item
       apagado). Dizer "sem origem identificada" mandaria a pessoa procurar
       carimbo onde o problema é outro — ver a §4.6 da ESPEC (crítica D2). */
    foraDoOrcamento: "etapa fora do orçamento atual",
    /* ⚠ OS DOIS CASOS EM QUE O ESPELHO DO ESTORNO NÃO SEGUE O ORIGINAL
       (ESPEC-medicao-cc §4.9). Sem rótulo próprio a pessoa lia "sem origem
       identificada" e ia procurar carimbo — e o que falta ali é o original,
       não o carimbo. */
    estornoOrfao: "estorno cujo lançamento original não está mais na base",
    estornoOutraObra: "estorno de um lançamento que hoje está em outra obra" };
  function rotuloOrigem(k) { return ROT_ORIGEM[k] || txt(k); }

  /* ⚠ CARIMBO ANTES DE DESCRIÇÃO, SEMPRE, E A ORDEM É O TESTE.
   * Roteiro do defeito (controle negativo de tools/test-custoetapa-apropriar.js):
   * a folha fechada por um pagamento a fornecedor nasce com
   * `docTipo:"FOL"` e descrição "Compra de vale-transporte…". Com a leitura
   * da descrição antes do carimbo, esse dinheiro era contado como "compra
   * recebida" — e a linha que diz POR QUAL PORTA consertar apontava para o
   * recebimento de compra, onde não há nada a consertar.
   * Descrição é texto que alguém edita; carimbo é campo que o app grava. */
  function origemDe(f) {
    /* retenção segue o boletim que a gerou (§4.2): ela é medição, não
       "lançamento manual sem origem" */
    if (txt(f.retencaoDe)) return "medicao";
    var d = txt(f.docTipo).toUpperCase();
    if (d === "PC") return "compra";
    if (d === "NF") return "nota";
    /* ⚠ a receita da medição passou a ter carimbo próprio. Hoje o resultado
       é o mesmo que a descrição já dava — mas descrição é texto, e texto alguém
       edita: no dia em que “Recebimento medição 01ª” virar outra coisa, o
       dinheiro deixaria de ser atribuído à medição sem ninguém notar. */
    if (d === "MED") return "medicao";
    if (d === "FOL") return "folha";
    if (d === "PON") return "ponto";
    if (d === "FSM") return "folhaSemanal";
    if (d === "FRT") return "frota";
    if (txt(f.origem).toLowerCase() === "rapido") return "rapido";
    /* leitura do legado SEM carimbo — só depois dos carimbos, e é por isso
       que ela está aqui embaixo */
    var s = txt(f.desc).toLowerCase();
    if (/^folha /.test(s)) return "folha";
    if (/^compra /.test(s)) return "compra";
    if (/medi[cç][aã]o/.test(s)) return "medicao";
    if (/^frota|ve[ií]culo/.test(s)) return "frota";
    return "semCarimbo";
  }

  /* =====================================================================
   * totalVivo — A ÚNICA CONTA DE "QUANTO JÁ SAIU NESTA OBRA"
   *
   * ⚠ POR QUE ISTO EXISTE. Até a 1.2.82 cada tela respondia essa pergunta com
   * a régua dela: o Painel somava `f.etapaId` só no nível 1 (e o gasto
   * carimbado numa SUBETAPA sumia da conta), o Centro de Custo e os
   * Relatórios somavam por conta própria, e o relatório executivo por outra.
   * Nesta base isso já custou caro pelo menos duas vezes: a mesma obra deu
   * R$ 130.693 numa tela e R$ 125.693 noutra, e o engenheiro viu 50% onde o
   * cliente viu 80%. Régua repetida não fica igual — ela diverge no primeiro
   * conserto que alguém esquece de repetir.
   *
   * ⚠ O QUE ENTRA E O QUE NÃO ENTRA
   *   · `cancelado` fora (`ehMorto`): registro morto não é dívida nem saída;
   *   · o espelho do estorno entra COM O SINAL DELE (valor negativo), para o
   *     par somar zero. Pular o espelho devolveria ao custo um dinheiro que
   *     voltou; somar o módulo dele contaria a devolução como gasto;
   *   · competência (pago + em aberto), que é a base comparável com o
   *     orçamento. Caixa é outra pergunta e tem outra coluna.
   *
   * `de` e `ate` são datas ISO (yyyy-mm-dd), inclusivas. ⚠ Com qualquer uma
   * das duas, lançamento SEM data fica de fora — é o que o relatório
   * executivo sempre fez (`ateFim` devolvia falsy), e mudar isso faria o
   * acumulado do mês crescer sozinho na primeira instalação com data vazia.
   * ===================================================================== */
  function totalVivo(financeiro, o) {
    o = o || {};
    var obraId = txt(o.obraId), tipo = txt(o.tipo), de = txt(o.de), ate = txt(o.ate);
    var valor = 0, n = 0;
    arr(financeiro).forEach(function (f) {
      if (!f) return;
      if (tipo && txt(f.tipo) !== tipo) return;
      if (obraId && txt(f.obraId) !== obraId) return;
      if (ehMorto(f)) return;
      if (de || ate) {
        var d = txt(f.data).slice(0, 10);
        if (!d) return;
        if (de && d < de) return;
        if (ate && d > ate) return;
      }
      valor += num(f.valor); n++;
    });
    return { valor: valor, n: n };
  }

  /* ---------------------------------------------------------------
   * A árvore: etapa raiz e subetapa, com o item apontando para uma das duas
   * ------------------------------------------------------------- */
  function montarLinhas(orcamento) {
    var linhas = [], porId = {};
    arr(orcamento && orcamento.etapas).forEach(function (e) {
      var raiz = {
        etapaId: e.id, subEtapaId: "", nivel: 1,
        nome: (e.codigo ? e.codigo + " " : "") + (e.nome || "Etapa"),
        previsto: 0, comprometido: 0, realizadoCompetencia: 0, realizadoCaixa: 0
      };
      linhas.push(raiz); porId[e.id] = raiz;
      arr(e.subetapas).forEach(function (s) {
        var sub = {
          etapaId: e.id, subEtapaId: s.id, nivel: 2,
          nome: (s.codigo ? s.codigo + " " : "") + (s.nome || "Subetapa"),
          previsto: 0, comprometido: 0, realizadoCompetencia: 0, realizadoCaixa: 0
        };
        linhas.push(sub); porId[s.id] = sub;
      });
      /* ⚠ O PREVISTO É CUSTO DIRETO, SEM BDI — a mesma base do "custo real",
         senão previsto e realizado seriam grandezas diferentes com o mesmo
         nome, e o saldo mentiria a favor da obra. */
      arr(e.itens).forEach(function (it) {
        var v = num(it.quantidade) * num(it.custoUnitario);
        raiz.previsto += v;
        var sid = txt(it.subEtapaId);
        if (sid && porId[sid] && porId[sid].nivel === 2) porId[sid].previsto += v;
      });
    });
    return { linhas: linhas, porId: porId };
  }

  /* Onde o valor cai: na linha exata e, quando ela é subetapa, TAMBÉM na
     raiz — sem contar duas vezes no total (o total soma só nível 1). */
  function creditar(porId, id, campo, valor) {
    var alvo = porId[txt(id)];
    if (!alvo) return false;
    alvo[campo] += valor;
    if (alvo.nivel === 2) {
      var raiz = porId[alvo.etapaId];
      if (raiz && raiz !== alvo) raiz[campo] += valor;
    }
    return true;
  }

  /* ---------------------------------------------------------------
   * consolidar
   * ------------------------------------------------------------- */
  function consolidar(entrada) {
    entrada = entrada || {};
    var obraId = txt(entrada.obraId);
    var m = montarLinhas(entrada.orcamento);
    var linhas = m.linhas, porId = m.porId;

    var naoApropriado = { valor: 0, n: 0, porOrigem: {} };
    var compSemEtapa = { valor: 0, n: 0 };

    /* =================================================================
     * ⚠ `entrada.apropriar` — O AGENTE DECIDE, ESTE MOTOR SÓ CREDITA.
     *
     * `{lanc(f), pedido(c)}`, cada uma devolvendo `[{no, c}]` em CENTAVOS ou
     * `null`. Contrato na §4.6 da ESPEC-medicao-cc.
     *
     * ⚠ `null` É "NÃO RESOLVI", E TEM DE VALER A RÉGUA DE HOJE (crítica D1).
     * Na primeira redação da espec o agente devolvia `no:null` para o fato que
     * ele mandava à Fila, e o motor tratava isso como "não apropriado": a obra
     * de demonstração PERDIA R$ 105.860 das etapas no dia em que o agente
     * fosse ligado — dinheiro que hoje aparece na etapa certa sairia dela sem
     * ninguém ter pedido nada. Quem não foi resolvido continua exatamente
     * onde está hoje (`etapaHerdada` / `c.etapaId`).
     *
     * ⚠ SEM `apropriar`, A SAÍDA É IDÊNTICA À DE HOJE — a chave
     * `apropriadoSemEtapa` nem existe no objeto. `tools/test-custoetapa.js`
     * compara objetos INTEIROS, e um campo a mais reprovaria por motivo bobo.
     * ================================================================= */
    var ap = entrada.apropriar || null;
    var apLanc = (ap && typeof ap.lanc === "function") ? ap.lanc : null;
    var apPed = (ap && typeof ap.pedido === "function") ? ap.pedido : null;
    /* balde dos centros SEM nó (administração local, canteiro, o centro geral
       da obra): é dinheiro apropriado — só não tem linha de etapa onde
       aparecer. Fica FORA de `naoApropriado` e de `comprometidoSemEtapa`, e
       DENTRO dos totais (invariante I9). */
    /* ⚠ O BALDE NASCE DAS FUNÇÕES, NÃO DO OBJETO. `apropriar: {}` (um chamador
       que passa a chave sem as funções) não apropria nada — e fazer a chave
       nova aparecer ali mudaria a forma da saída sem que uma vírgula do
       número tivesse mudado. */
    var balde = (apLanc || apPed) ? { realizado: { valor: 0, caixa: 0, n: 0, porCentro: {} },
                       comprometido: { valor: 0, n: 0, porCentro: {} } } : null;
    /* ⚠ PARTE QUE NÃO FECHA COM O FATO É DINHEIRO APARECENDO OU SUMINDO.
       O motor não conserta (não sabe qual ponta está certa) — ele DIZ. */
    var divergN = 0, divergValor = 0;
    /* centavos → reais, arredondando no centavo: o agente decide em inteiro
       justamente para a soma das partes fechar com o fato */
    function reais(c) { return Math.round(num(c)) / 100; }
    /* ⚠ ARRAY VAZIO NÃO É "RESOLVIDO EM NADA". Fato resolvido em zero partes
       faria o valor dele desaparecer de todas as linhas E de `naoApropriado`,
       sem aviso nenhum — o pior desfecho possível numa conta de custo. Vazio
       (ou o que não for lista) volta a ser "não resolvi". */
    function partesDe(fn, fato, valorDoFato) {
      if (!fn) return null;
      var p = null;
      try { p = fn(fato); } catch (e) { p = null; }
      if (!Array.isArray(p) || !p.length) return null;
      var soma = 0;
      p.forEach(function (x) { soma += reais(x && x.c); });
      if (Math.abs(soma - valorDoFato) > 0.005) {
        divergN++; divergValor += (soma - valorDoFato);
      }
      return p;
    }
    /* ⚠ O ÍNDICE VEM DO MESMO `financeiro` QUE ESTE MOTOR ACABOU DE SOMAR EM
       "realizado". É isso que faz comprometido e realizado nunca contarem o
       mesmo dinheiro, e é por isso que ele é montado AQUI e não recebido de
       fora: consumidor que depende de o chamador lembrar de passar um campo
       derivado é consumidor que nasce vazio no dia em que alguém esquece. */
    var jaDespIdx = entrada.jaEDespesa
      || ((typeof CompraNota !== "undefined" && CompraNota.jaEDespesaPorPedido)
        ? CompraNota.jaEDespesaPorPedido(entrada.financeiro, entrada.compras) : null);
    /* entrega gravada no pedido que NÃO tem despesa viva correspondente */
    var entregaSemDespesa = { valor: 0, n: 0 };
    var semDescontoN = 0;

    /* =================================================================
     * ⚠ A DESPESA NASCIDA DO PEDIDO HERDA A ETAPA DELE — PELO CARIMBO.
     *
     * ⚠ MEDIDO EM 07/09/2026, e só apareceu quando o comprometido passou a
     * descontar a entrega já lançada: a despesa que `_lancDespesaDaEntrega`
     * cria NÃO carrega `etapaId` (nenhum dos caminhos automáticos carrega), mas
     * o PEDIDO carrega. Descontar R$ 7.500 do comprometido da etapa sem
     * creditar esses R$ 7.500 no realizado DELA tirava o dinheiro da vista da
     * etapa: o Saldo subia de R$ 10.000 para R$ 17.500 e a tela passava a
     * convidar a gastar o que já está gasto — trocaríamos um defeito por outro,
     * na pior direção.
     *
     * ⚠ LIGA POR CARIMBO, NUNCA POR SEMELHANÇA: `docTipo:"PC"` + `docId` para a
     * despesa do pedido, e `compraId` para a parcela da nota que substituiu essa
     * despesa. Nada casa por valor, data ou descrição (regra 2 da skill
     * `dinheiro`). E só vale quando a linha do Financeiro NÃO tem etapa
     * própria: quem foi apropriado à mão (ou pela triagem da nota) manda.
     * ================================================================= */
    var etapaDoPedido = {};
    arr(entrada.compras).forEach(function (c) {
      if (c && txt(c.id) && txt(c.etapaId)) etapaDoPedido[txt(c.id)] = txt(c.etapaId);
    });
    /* ⚠ O ESPELHO DO ESTORNO SEGUE O ORIGINAL — ESPEC-medicao-cc §4.3, degrau 1.
     *
     * ⚠ MEDIDO NA REVISÃO FINAL (22/09/2026, no navegador, com clique e tecla
     * reais): pedido PC-1 de R$ 30.000 na etapa `e2`, recebido, baixado e
     * depois ESTORNADO pelo botão da lista. O `finEstornar` copia obra,
     * contrato e etapa para o espelho, mas NÃO copia o carimbo
     * (`docTipo`/`docId`/`compraId`) — e a despesa do pedido é apropriada
     * justamente POR HERANÇA do carimbo, porque nenhum caminho automático
     * grava `etapaId` nela. Resultado: a despesa de R$ 30.000 ficava na etapa
     * `e2` (centro "2 Estrutura") e o crédito de −R$ 30.000 caía em "sem
     * etapa". O saldo do centro ficava R$ 30.000 MENOR do que é — na tela, nos
     * dois CSV, no quadro dos Relatórios e no Previsto × Realizado —, e o
     * total da obra fechava em R$ 0,00, então nenhuma guarda de soma acusava:
     * o erro é de REPARTIÇÃO, não de total.
     *
     * ⚠ ESTE DEGRAU É O QUE CONSERTA A BASE JÁ INSTALADA. Copiar o carimbo no
     * `finEstornar` (feito também) só vale para estorno NOVO; os espelhos que
     * as 38 instalações já têm gravados nasceram sem carimbo nenhum.
     *
     * ⚠ UM SALTO SÓ, E COM A MESMA OBRA. Espelho de outra obra não segue o
     * original (o crédito é da obra onde ele está — §4.9 `estorno-outra-obra`),
     * e original fora do corpus também não (`estorno-orfao`). Os dois motivos
     * viram rótulo no aviso da tela, senão a pessoa lê "sem origem
     * identificada" e vai procurar carimbo onde o problema é outro. */
    var finPorId = {};
    arr(entrada.financeiro).forEach(function (f) { if (f && txt(f.id)) finPorId[txt(f.id)] = f; });
    function herancaDireta(f) {
      if (txt(f.etapaId)) return f.etapaId;
      if (txt(f.docTipo) === "PC" && etapaDoPedido[txt(f.docId)]) return etapaDoPedido[txt(f.docId)];
      if (txt(f.compraId) && etapaDoPedido[txt(f.compraId)]) return etapaDoPedido[txt(f.compraId)];
      return "";
    }
    /* devolve { no, motivo }: `motivo` só existe quando NÃO resolveu e o
       porquê é do estorno — é ele que vai para `naoApropriado.porOrigem` */
    function resolverNo(f) {
      var direto = herancaDireta(f);
      if (direto) return { no: direto, motivo: "" };
      if (!txt(f.estornoDe)) return { no: "", motivo: "" };
      var orig = finPorId[txt(f.estornoDe)];
      if (!orig) return { no: "", motivo: "estornoOrfao" };
      if (txt(orig.obraId) !== txt(f.obraId)) return { no: "", motivo: "estornoOutraObra" };
      /* ⚠ `herancaDireta` do ORIGINAL, não `resolverNo`: espelho de espelho não
         existe (o `finEstornar` recusa estornar o que já foi estornado) e a
         recursão só abriria um laço infinito para um dado corrompido. */
      return { no: herancaDireta(orig), motivo: "" };
    }
    function etapaHerdada(f) { return resolverNo(f).no || f.etapaId; }

    /* o fato entrou em `naoApropriado`: conta UMA vez, por mais partes que
       ele tenha — "N lançamentos sem etapa" é contagem de lançamento */
    function naoApropriar(f, v, chave, jaContou) {
      naoApropriado.valor += v;
      if (!jaContou) naoApropriado.n++;
      var o = chave || origemDe(f);
      naoApropriado.porOrigem[o] = (naoApropriado.porOrigem[o] || 0) + v;
    }

    arr(entrada.financeiro).forEach(function (f) {
      if (!f || txt(f.tipo) !== "despesa") return;
      if (obraId && txt(f.obraId) !== obraId) return;
      if (ehMorto(f)) return;
      var v = num(f.valor);
      var quitado = ehQuitado(f);
      var partes = partesDe(apLanc, f, v);
      if (partes) {
        var contou = false;
        partes.forEach(function (p) {
          var vp = reais(p && p.c);
          var no = txt(p && p.no);
          if (!no) {
            /* centro sem nó: apropriado, mas sem linha de etapa onde aparecer */
            balde.realizado.valor += vp; balde.realizado.n++;
            if (quitado) balde.realizado.caixa += vp;
            var ccB = txt(p && p.cc);
            if (ccB) balde.realizado.porCentro[ccB] = (balde.realizado.porCentro[ccB] || 0) + vp;
            return;
          }
          if (creditar(porId, no, "realizadoCompetencia", vp)) {
            if (quitado) creditar(porId, no, "realizadoCaixa", vp);
            return;
          }
          /* ⚠ NÓ QUE NÃO EXISTE NO ORÇAMENTO DE HOJE (revisão do orçamento,
             etapa apagada). Some da tabela se ninguém o declarar — e o total
             da obra passaria a ser menor que o Financeiro. */
          naoApropriar(f, vp, "foraDoOrcamento", contou); contou = true;
        });
        return;
      }
      var res = resolverNo(f);
      var caiu = creditar(porId, res.no, "realizadoCompetencia", v);
      if (caiu) { if (quitado) creditar(porId, res.no, "realizadoCaixa", v); return; }
      naoApropriar(f, v, res.motivo, false);
    });

    /* ⚠ COMPROMETIDO É PEDIDO COMPROMETIDO E AINDA NÃO RECEBIDO.
       Recebido já virou despesa e seria contado duas vezes.
       ⚠ A LISTA DE STATUS NÃO SE ESCREVE AQUI. Ela era `=== "aprovado"`, e
       quando a Fase 0b criou `enviado` e `confirmado` esta tela passou a
       ZERAR o comprometido no clique de um botão que promete não mover
       dinheiro — o Saldo da etapa subia sozinho e o alarme de estouro se
       apagava, enquanto a tela de Compras, corrigida no mesmo lote, seguia
       mostrando o valor certo. Duas telas, a mesma palavra, dois números.
       A regra mora em ComprasLinha.ehCompromisso; aqui só se pergunta. */
    var ehComp = (typeof ComprasLinha !== "undefined" && ComprasLinha.ehCompromisso)
      ? function (st) { return ComprasLinha.ehCompromisso(st); }
      : function (st) { return st === "aprovado" || st === "enviado" || st === "confirmado"; };
    arr(entrada.compras).forEach(function (c) {
      if (!c) return;
      if (obraId && txt(c.obraId) !== obraId) return;
      if (!ehComp(txt(c.status).toLowerCase())) return;
      /* ⚠ O PEDIDO EM ENTREGA PARCIAL NÃO ESTÁ INTEIRO COMPROMETIDO. O status só
         vira "recebido" na última viagem; até lá, o que já chegou virou despesa
         (está em realizado/naoApropriado) e contar o pedido cheio aqui reservava
         o mesmo dinheiro duas vezes — medido: R$ 17.500 de exposição num pedido
         de R$ 10.000, com o Saldo da etapa R$ 7.500 abaixo do real. A fonte do
         desconto é `CompraNota.jaEDespesa` (despesa VIVA + faturado por nota),
         nunca o histórico das viagens — ver o ⚠ de lá. */
      var ja = jaDespIdx ? num(jaDespIdx[txt(c.id)]) : 0;
      var registrado = (typeof ComprasLinha !== "undefined" && ComprasLinha.registradoNasEntregas)
        ? num(ComprasLinha.registradoNasEntregas(c)) : 0;
      if (!jaDespIdx && registrado > 0.005) semDescontoN++;
      /* ⚠ O RECADO QUE IMPEDE O DINHEIRO DE SUMIR CALADO. Se a entrega está
         gravada no pedido mas a despesa dela não está mais viva (cancelada,
         estornada ou apagada), o valor VOLTA para o comprometido — o número
         fecha com o pedido. Mas a pessoa precisa saber, porque o material está
         na obra e a conta não existe. As duas pontas se comparam PELO CARIMBO,
         nunca por valor ou descrição. O app não conserta sozinho — não sabe qual
         ponta está certa —, ele DIZ. */
      if (registrado - ja > 0.005) { entregaSemDespesa.valor += (registrado - ja); entregaSemDespesa.n++; }
      var v = (typeof ComprasLinha !== "undefined" && ComprasLinha.valorComprometido)
        ? num(ComprasLinha.valorComprometido(c, ja, num(c.valor)))
        : Math.max(0, Math.round((num(c.valor) - ja) * 100) / 100);
      /* pedido todo entregue e ainda "aprovado" não empenha nada — e somar zero
         inflaria a CONTAGEM do aviso ("2 pedidos somando R$ 2.500") */
      if (!(v > 0.005)) return;
      var partesP = partesDe(apPed, c, v);
      if (partesP) {
        var contouP = false;
        partesP.forEach(function (p) {
          var vp = reais(p && p.c);
          var no = txt(p && p.no);
          if (!no) {
            balde.comprometido.valor += vp; balde.comprometido.n++;
            var ccB = txt(p && p.cc);
            if (ccB) balde.comprometido.porCentro[ccB] = (balde.comprometido.porCentro[ccB] || 0) + vp;
            return;
          }
          if (creditar(porId, no, "comprometido", vp)) return;
          compSemEtapa.valor += vp;
          if (!contouP) { compSemEtapa.n++; contouP = true; }
        });
        return;
      }
      if (creditar(porId, c.etapaId, "comprometido", v)) return;
      compSemEtapa.valor += v; compSemEtapa.n++;
    });

    var tot = { previsto: 0, comprometido: 0, realizadoCompetencia: 0, realizadoCaixa: 0 };
    linhas.forEach(function (l) {
      /* ⚠ O SALDO DESCONTA O COMPROMETIDO. É o número que decide se dá para
         comprar: "orçado 500k, realizado 300k, saldo 200k" convida a gastar
         quando há 180k em pedidos já aprovados esperando entrega. */
      l.saldo = l.previsto - l.comprometido - l.realizadoCompetencia;
      l.pct = l.previsto > 0 ? (l.realizadoCompetencia / l.previsto * 100)
        : (l.realizadoCompetencia > 0 ? 999 : 0);
      l.estouro = (l.comprometido + l.realizadoCompetencia) > l.previsto + 0.005;
      l.semPrevisto = !(l.previsto > 0);
      if (l.nivel === 1) {
        tot.previsto += l.previsto; tot.comprometido += l.comprometido;
        tot.realizadoCompetencia += l.realizadoCompetencia; tot.realizadoCaixa += l.realizadoCaixa;
      }
    });
    tot.saldo = tot.previsto - tot.comprometido - tot.realizadoCompetencia;

    /* ⚠ A COBERTURA É O AVISO QUE IMPEDE A TELA DE MENTIR. Com 70% do gasto
       sem etiqueta, as etapas parecem folgadas — e é exatamente aí que
       alguém autoriza a próxima compra olhando um saldo que não existe. */
    /* ⚠ O BALDE ENTRA NO NUMERADOR **E** NO DENOMINADOR. Dinheiro num centro
       sem nó está apropriado — contá-lo como "sem etiqueta" faria a cobertura
       despencar no dia em que a obra adotasse um centro de administração
       local, e a faixa vermelha ensinaria a ignorar a faixa vermelha. */
    var baldeReal = balde ? balde.realizado.valor : 0;
    var gastoTotal = tot.realizadoCompetencia + baldeReal + naoApropriado.valor;
    var pctApropriado = gastoTotal > 0 ? ((tot.realizadoCompetencia + baldeReal) / gastoTotal * 100) : 100;
    var avisos = [];
    /* ⚠ `> 0` CALAVA O AVISO NO CASO NEGATIVO, e era o caso em que ele mais
       fazia falta. Medido em 21/09/2026: obra com um espelho de estorno órfão
       de −R$ 8.400 sem etapa — as linhas por etapa somavam R$ 8.800,00 e o
       total da obra dizia R$ 400,00, sem UMA palavra de onde vinha a
       diferença. Quem soma a tabela à mão acha o buraco e não descobre a
       causa; quem não soma, decide a próxima compra pelo saldo errado. */
    if (naoApropriado.valor > 0.005) {
      avisos.push(Math.round(100 - pctApropriado) + "% do gasto desta obra não está apropriado em etapa — " +
        "as etapas abaixo parecem ter mais saldo do que têm.");
      var portas = Object.keys(naoApropriado.porOrigem)
        .sort(function (a, b) { return naoApropriado.porOrigem[b] - naoApropriado.porOrigem[a]; });
      if (portas.length) avisos.push("Entrou principalmente por: " + portas.slice(0, 3).map(rotuloOrigem).join(", ") + ".");
    } else if (naoApropriado.valor < -0.005) {
      /* ⚠ AQUI NÃO SE USA O `pctApropriado`: com o balde negativo ele passa
         de 100 (medido: 2.200%), e "−2.100% do gasto não está apropriado" é
         recado que mente. O que a pessoa precisa saber é o VALOR e que ele
         não está em linha nenhuma — número ela confere, porcentagem
         impossível ela ignora. */
      avisos.push(fmt(Math.abs(naoApropriado.valor)) + " de CRÉDITO sem etapa (estorno cujo lançamento original " +
        "não está mais na base) reduzem o total desta obra e não aparecem em nenhuma linha por etapa — " +
        "some as linhas abaixo e a diferença para o total é exatamente esta.");
      var portasNeg = Object.keys(naoApropriado.porOrigem)
        .sort(function (a, b) { return naoApropriado.porOrigem[a] - naoApropriado.porOrigem[b]; });
      if (portasNeg.length) avisos.push("Veio principalmente de: " + portasNeg.slice(0, 3).map(rotuloOrigem).join(", ") + ".");
    }
    if (semDescontoN > 0) {
      avisos.push("O motor da nota fiscal (compranota.js) não carregou, então o Comprometido está SEM o desconto do que já virou despesa em " +
        semDescontoN + " pedido(s) com entrega registrada — o número está para cima. Recarregue o app.");
    }
    if (entregaSemDespesa.valor > 0.005) {
      avisos.push(entregaSemDespesa.n + " pedido(s) registraram entrega somando " + fmt(entregaSemDespesa.valor) +
        " que não tem despesa viva no Financeiro (cancelada, estornada ou apagada). Esse valor voltou para o Comprometido — se foi cancelamento por engano, relance a despesa por lá.");
    }
    if (compSemEtapa.valor > 0) {
      avisos.push(compSemEtapa.n + " pedido(s) de compra aprovado(s) somando " + fmt(compSemEtapa.valor) +
        " sem etapa — o dinheiro já está empenhado, mas não baixa o saldo de etapa nenhuma.");
    }
    /* ⚠ O BALDE APARECE NOS TOTAIS E NÃO APARECE NAS LINHAS — e é por isso
       que ele precisa ser DITO. Sem esta frase, quem soma as linhas da tabela
       à mão acha uma diferença e não descobre de onde ela veio. O nome dos
       centros entra na tela (a fiação os tem); o motor diz o valor. */
    if (balde && balde.realizado.valor > 0.005) {
      avisos.push(fmt(balde.realizado.valor) + " estão em centros de custo sem etapa — " +
        "não aparecem nas linhas por etapa abaixo, mas estão nos totais.");
    }
    if (divergN > 0) {
      avisos.push("A apropriação de " + divergN + " lançamento(s)/pedido(s) não fecha com o valor deles: " +
        fmt(Math.abs(divergValor)) + (divergValor > 0 ? " a mais" : " a menos") +
        ". Os números por etapa abaixo podem estar " + (divergValor > 0 ? "para cima" : "para baixo") +
        " — confira a Fila do centro de custo.");
    }

    var saida = {
      linhas: linhas,
      naoApropriado: naoApropriado,
      comprometidoSemEtapa: compSemEtapa,
      /* ⚠ campo NOVO, nunca dentro de `comprometidoSemEtapa`: tools/test-custoetapa.js
         compara aquele objeto INTEIRO, e um campo a mais ali reprovaria por
         motivo bobo. */
      entregaSemDespesa: entregaSemDespesa,
      totais: tot,
      cobertura: { pctApropriado: pctApropriado, avisos: avisos }
    };
    /* ⚠ A CHAVE SÓ NASCE COM `apropriar` — nem como `null`. Ver o ⚠ do bloco
       `entrada.apropriar`: sem o agente, a saída deste motor tem de ser a
       MESMA de hoje, campo a campo, e `test-custoetapa.js` compara objetos
       inteiros. */
    if (balde) saida.apropriadoSemEtapa = balde;
    return saida;
  }

  var CustoEtapa = {
    consolidar: consolidar,
    totalVivo: totalVivo,
    origemDe: origemDe,
    /* ⚠ EXPORTADOS PARA QUE EXISTA **UMA** DEFINIÇÃO DE "MORTO" E DE "JÁ SAIU
       DO BANCO" no app inteiro. `Gestao._finAnulado` chama `ehMorto` daqui; o
       agente dos centros de custo (§4.1) chama os dois. Régua copiada é régua
       que diverge no primeiro conserto que alguém esquece de repetir. */
    ehMorto: ehMorto,
    ehQuitado: ehQuitado,
    rotuloOrigem: rotuloOrigem,
    ROT_ORIGEM: ROT_ORIGEM,
    _montarLinhas: montarLinhas
  };

  global.CustoEtapa = CustoEtapa;
  if (typeof module !== "undefined" && module.exports) module.exports = CustoEtapa;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

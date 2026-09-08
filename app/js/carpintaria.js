/* =====================================================================
 * carpintaria.js — ORÇAMENTO DE CARPINTARIA: madeira + mão de obra por m²
 *
 * Motor puro (sem DOM, sem Store) do orçamento de quem vende deck, forro,
 * ripado e caibro. NÃO é uma variação do módulo `orcamentos`: a planilha
 * SINAPI com BDI do TCU, curva ABC e composição analítica é ferramenta de
 * obra pesada, e para uma carpintaria é atrito puro. Aqui a conta é outra —
 * material comprado com margem, mais mão de obra cobrada por m².
 *
 * ---------------------------------------------------------------------
 * A CONTA INTEIRA
 * ---------------------------------------------------------------------
 *
 *   madeira  = Σ (qtd × custo unitário do FORNECEDOR ESCOLHIDO)
 *   venda    = madeira × (1 + margem da proposta)
 *   moBase   = Σ (m² do serviço × R$/m² do serviço)
 *
 *   acréscimo de faixa   = (fator − 1) × base, se a metragem < o corte
 *   acréscimo de detalhe = (Σ % dos detalhes) × base   (degrau, curva, …)
 *
 *   total = venda + moBase + os dois acréscimos
 *
 * Cada "base" acima é decidida por parâmetro (`incideAcrescimo`,
 * `incideDetalhe`): a mão de obra sozinha ou o total da proposta. Não é
 * escolha nossa — foi pergunta feita ao cliente, com resposta gravada em
 * no documento de decisões daquele cliente, fora do pacote (`clientes/`).
 *
 * ---------------------------------------------------------------------
 * OITO REGRAS QUE NÃO PODEM SAIR DAQUI PARA A TELA
 * ---------------------------------------------------------------------
 *
 * 1) NENHUM NÚMERO DE NEGÓCIO NASCE NESTE ARQUIVO.
 *    Corte de metragem, percentual de acréscimo, percentual de cada detalhe
 *    e validade são PARÂMETROS. `PADRAO` traz tudo vazio de propósito —
 *    exceto os 30 dias de validade, que são praxe comercial e não conta de
 *    dinheiro. Uma carpintaria tem 65 m² e +50%; a próxima terá outros. Um
 *    default plausível aqui viraria uma proposta errada lá, calada.
 *
 * 2) SEM PREÇO NÃO SE INVENTA ZERO.
 *    Item de madeira sem preço para o fornecedor escolhido não entra como
 *    R$ 0,00 — vira PENDÊNCIA e derruba `podeFechar`. Zero é uma linha
 *    bonita que cobra nada, e ninguém confere o que parece certo. (A mesma
 *    regra 3 do producao.js, pelo mesmo motivo.)
 *
 * 3) MARGEM VAZIA TRAVA O FECHAMENTO — NÃO VIRA 0%.
 *    O cliente decidiu definir a margem à mão em cada proposta (A1). Margem
 *    digitada é margem que pode ficar em branco, e proposta sem margem é
 *    venda a preço de custo. `podeFechar` recusa; a tela não deve deixar
 *    fechar assim. Validar DEPOIS de gravar é como o gate de medição que
 *    lançava receita antes de o formulário terminar — o dinheiro sai e a
 *    validação chega atrasada.
 *
 * 4) FECHAR É CONGELAR, E CONGELADO NÃO SE RECALCULA.
 *    `congelar` copia para dentro da proposta o preço unitário, o fornecedor
 *    escolhido, a data do preço e os DOIS fatores. Depois disso `calcular`
 *    lê o que está gravado e ignora o cadastro.
 *    ⚠ Isso é o que responde B4 ("obra que cruza a faixa durante a execução
 *      mantém o preço fechado"). Se o fator de faixa fosse recalculado a
 *      cada abertura, uma obra que crescesse de 60 para 70 m² viraria
 *      cobrança retroativa — o oposto do que foi combinado.
 *
 * 5) A METRAGEM DA FAIXA É DA OBRA INTEIRA, E SÓ CONTA O QUE É m².
 *    Decisão da 1ª rodada: três decks de 20 m² são 60 m², não três vezes 20.
 *    Serviço em outra unidade (forro e ripado em metro linear) não entra na
 *    soma da faixa — mas É COBRADO normalmente e recebe o acréscimo junto,
 *    porque a faixa é propriedade da OBRA, não da linha.
 *    ⚠ Isso é AVISO (`avisos`), NUNCA pendência. Enquanto foi pendência, a
 *      proposta mais comum do cliente — deck em m² mais forro em metro
 *      linear — era impossível de fechar, e a única saída aparente era
 *      cadastrar o forro em m², o que corromperia a própria metragem da faixa.
 *
 * 6) DOIS ACRÉSCIMOS SOBRE A MESMA BASE SE SOMAM; NÃO SE MULTIPLICAM.
 *    "+50% abaixo de 65 m²" e "+8,3% de degrau" foram descritos os dois como
 *    percentual "a mais sobre o valor de tabela" — então os dois incidem
 *    sobre a tabela, e não um sobre o outro.
 *    ⚠ A diferença é dinheiro real: 1 + 0,50 + 0,083 = 1,583 contra
 *      1,50 × 1,083 = 1,6245. Em R$ 10.000 de mão de obra são R$ 415.
 *    Como as respostas não fecham a questão sozinhas, ela é PARÂMETRO
 *    (`composicaoAcrescimos`), com o somado por padrão — e está na lista de
 *    perguntas a fazer antes da primeira proposta.
 *
 * 7) O CUSTO DE CAMPO SOMA NO TOTAL, MAS NÃO RECEBE ACRÉSCIMO NEM ENTRA NA
 *    METRAGEM.
 *    Deslocamento, mobilização, alojamento e insumo (`itensExtra`) existem
 *    porque o cliente lançava isso por dentro do material ou do m² da mão de
 *    obra: o preço subia e o cliente FINAL lia só "está caro", sem ver o
 *    custo que existe de verdade. Agora é bloco próprio, e aparece separado
 *    no papel.
 *    ⚠ Eles ficam FORA da base dos dois acréscimos (`incideExtra: "fora"`).
 *      O +50% de obra pequena existe porque obra pequena é mais cara de
 *      executar — o deslocamento JÁ É esse custo, agora lançado à parte.
 *      Somá-lo à base cobraria duas vezes a mesma coisa. É parâmetro para
 *      quem vender de outro jeito, mas o padrão nunca cobra a mais sozinho.
 *    ⚠ E não entram na metragem da faixa: metro quadrado de deck é o que
 *      decide a faixa; diária de alojamento não é obra executada.
 *
 * 8) O QUE ELE COMPRA E REVENDE SEGUE O CAMINHO DA MADEIRA.
 *    Deslocamento e alojamento têm um valor só — o que o cliente paga. Verniz,
 *    óleo, lixa e tinta, não: ele COMPRA. Com `comMargem`, o valor da linha é
 *    o custo e o cliente paga `custo × (1 + margem da proposta)`, exatamente
 *    como a tábua. Sem isso ele teria de fazer a conta da margem de cabeça em
 *    cada proposta, e a margem que digitou no topo não valeria para o insumo.
 *    ⚠ E ISSO CRIA CUSTO INTERNO ONDE NÃO HAVIA. Enquanto o custo de campo
 *      tinha um valor só, não existia nada a esconder do cliente final; agora
 *      existe, e `CarpProposta.auditar` procura o custo e o lucro destas
 *      linhas no papel como já procurava os da madeira. Mexer num sem mexer no
 *      outro reabre o buraco que aquelas três camadas existem para fechar.
 *    ⚠ Margem vazia NÃO vira 0% aqui — é a regra 3 de novo. E o LUCRO só conta
 *      o que tem custo: somar o bloco inteiro contaria o repasse do
 *      deslocamento como margem, e a tela mostraria um ganho que não existe.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Carpintaria = {};

  /* ---------- número como o brasileiro escreve ----------
     Delega para o helper do app quando ele existe (núcleo único), e traz uma
     cópia enxuta para rodar em teste Node sem carregar o util.js. */
  function num(x) {
    if (typeof x === "number") return isFinite(x) ? x : 0;
    if (global.Util && global.Util.parseNum) {
      var v = global.Util.parseNum(x);
      return isFinite(v) ? v : 0;
    }
    var s = String(x == null ? "" : x).replace(/[^0-9,.\-]/g, "");
    if (!s) return 0;
    if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  Carpintaria.num = num;

  /* Dinheiro em 2 casas. Usa a política do app quando disponível; aqui o modo
     é `arred2` e não o `truncar2` do TCU — proposta privada de carpintaria
     não é licitação, e truncar centavo a menos em toda linha é perda sem
     motivo. */
  function money(v) {
    if (global.Arred && global.Arred.valor) return global.Arred.valor(num(v), "arred2");
    return Math.round(num(v) * 100) / 100;
  }
  Carpintaria.money = money;

  function txt(x) { return String(x == null ? "" : x).trim(); }
  function arr(x) { return Array.isArray(x) ? x : []; }

  /* ===================================================================
   * PARÂMETROS
   * =================================================================== */

  /* ⚠ Vazio é de propósito — ver a regra 1 do cabeçalho. */
  Carpintaria.PADRAO = {
    corteM2: null,                 // metragem que separa as duas faixas
    acrescimoAbaixoPct: null,      // quanto se cobra a mais abaixo do corte
    incideAcrescimo: "mo",         // "mo" | "total"
    detalhes: [],                  // [{id, nome, pct}]
    incideDetalhe: "mo",           // "mo" | "total"
    composicaoAcrescimos: "somado",// "somado" | "composto"  — ver regra 6
    validadeDias: 30,              // praxe comercial, não conta de dinheiro
    unidadeMO: "m2",
    incideExtra: "fora"            // "fora" | "dentro" — ver regra 7
  };

  Carpintaria.BASES = { mo: "só a mão de obra", total: "o total da proposta" };

  /* Os grupos existem para o PAPEL: é agrupado por eles que a despesa aparece
     separada para o cliente final — que é o pedido inteiro. A chave é estável
     (vai gravada na proposta); o rótulo é texto de tela. */
  Carpintaria.GRUPOS_EXTRA = [
    ["mobilizacao", "Mobilização e deslocamento"],
    ["hospedagem", "Hospedagem e alimentação"],
    ["insumo", "Insumos e consumíveis"],
    ["outro", "Outras despesas"]
  ];

  Carpintaria.rotuloGrupo = function (g) {
    var achado = "";
    Carpintaria.GRUPOS_EXTRA.forEach(function (par) { if (par[0] === txt(g)) achado = par[1]; });
    /* ⚠ grupo desconhecido NÃO vira "Outras despesas". Um grupo gravado por uma
       versão futura (ou digitado à mão) seria silenciosamente renomeado no
       papel do cliente, e a linha apareceria embaixo do título errado. Sem
       rótulo conhecido, o próprio valor é o título. */
    return achado || txt(g) || "Outras despesas";
  };

  Carpintaria.BASES_EXTRA = {
    fora: "não recebem os acréscimos",
    dentro: "recebem os acréscimos junto com o resto"
  };
  Carpintaria.COMPOSICOES = {
    somado: "somados sobre a tabela (1 + 50% + 8,3%)",
    composto: "um sobre o outro (1,50 × 1,083)"
  };

  /* Normaliza o que veio das prefs. Nunca inventa: o que não veio fica null,
     e é `validarParametros` que diz o que falta. */
  Carpintaria.parametros = function (bruto) {
    var b = bruto && typeof bruto === "object" ? bruto : {};
    var p = {
      corteM2: b.corteM2 == null || txt(b.corteM2) === "" ? null : num(b.corteM2),
      acrescimoAbaixoPct: b.acrescimoAbaixoPct == null || txt(b.acrescimoAbaixoPct) === "" ? null : num(b.acrescimoAbaixoPct),
      incideAcrescimo: Carpintaria.BASES[b.incideAcrescimo] ? b.incideAcrescimo : "mo",
      incideDetalhe: Carpintaria.BASES[b.incideDetalhe] ? b.incideDetalhe : "mo",
      composicaoAcrescimos: Carpintaria.COMPOSICOES[b.composicaoAcrescimos] ? b.composicaoAcrescimos : "somado",
      validadeDias: b.validadeDias == null || txt(b.validadeDias) === "" ? 30 : num(b.validadeDias),
      unidadeMO: txt(b.unidadeMO) || "m2",
      /* ⚠ "fora" é o padrão e é decisão de dinheiro, não conveniência: o
         acréscimo de obra pequena existe porque obra pequena é mais cara de
         executar — e o deslocamento da equipe JÁ É esse custo, lançado à
         parte. Cobrá-lo outra vez por dentro do +50% cobra duas vezes a mesma
         coisa, na proposta que o cliente final lê. Quem quiser o contrário
         muda nos Parâmetros, vendo o que muda. */
      incideExtra: Carpintaria.BASES_EXTRA[b.incideExtra] ? b.incideExtra : "fora",
      detalhes: []
    };
    arr(b.detalhes).forEach(function (d) {
      if (!d) return;
      var nome = txt(d.nome);
      var id = txt(d.id) || chaveDe(nome);
      if (!id) return;
      p.detalhes.push({ id: id, nome: nome || id, pct: d.pct == null || txt(d.pct) === "" ? null : num(d.pct) });
    });
    return p;
  };

  /* "Iluminação embutida" -> "iluminacao-embutida" */
  function chaveDe(s) {
    var v = txt(s).toLowerCase();
    if (global.Util && global.Util.normalizar) v = global.Util.normalizar(v);
    else v = v.normalize ? v.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : v;
    return v.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  Carpintaria.chaveDe = chaveDe;

  /* O que impede de orçar. Devolve lista de frases prontas para a tela. */
  Carpintaria.validarParametros = function (par) {
    var p = Carpintaria.parametros(par);
    var f = [];
    if (p.corteM2 == null) f.push("Falta a metragem que separa as duas faixas de mão de obra.");
    else if (p.corteM2 <= 0) f.push("A metragem de corte precisa ser maior que zero.");
    if (p.acrescimoAbaixoPct == null) f.push("Falta o acréscimo cobrado abaixo da metragem de corte.");
    p.detalhes.forEach(function (d) {
      if (d.pct == null) f.push('O detalhe "' + d.nome + '" está sem percentual — cadastre ou remova.');
    });
    return f;
  };

  /* ===================================================================
   * MADEIRAS — item × fornecedor → preço de compra, com data
   *
   * ⚠ Não é "um preço por item". O mesmo item muda de preço conforme o
   *   fornecedor (decisão da 1ª rodada), e o fornecedor é escolhido a cada
   *   proposta (A2). Guardar um preço só apagaria a escolha.
   * =================================================================== */

  Carpintaria.descricaoMadeira = function (m) {
    if (!m) return "";
    return [txt(m.especie), txt(m.aplicacao), txt(m.dimensao)]
      .filter(function (x) { return x; }).join(" · ");
  };

  Carpintaria.fornecedoresDe = function (madeira) {
    var vistos = {}, out = [];
    arr(madeira && madeira.precos).forEach(function (p) {
      var id = txt(p && p.fornecedorId);
      if (!id || vistos[id]) return;
      vistos[id] = 1; out.push(id);
    });
    return out;
  };

  /* O preço daquele fornecedor. Havendo mais de um lançamento para o mesmo
     fornecedor, vale o MAIS RECENTE — o cadastro é histórico, não sobrescrita.
     Sem fornecedor escolhido devolve null: escolher é do usuário (A2), e o
     sistema pegar "o primeiro da lista" seria decidir por ele. */
  Carpintaria.precoFornecedor = function (madeira, fornecedorId) {
    var alvo = txt(fornecedorId);
    if (!alvo) return null;
    var melhor = null;
    arr(madeira && madeira.precos).forEach(function (p) {
      if (!p || txt(p.fornecedorId) !== alvo) return;
      if (p.valor == null || txt(p.valor) === "") return;
      /* ⚠ `>=`, NÃO `>`. Com `>` o empate de data ficava com o PRIMEIRO
         lançamento, e corrigir um preço digitado errado no mesmo dia não
         tinha efeito nenhum: a pessoa lançava 240 no lugar de 2.400, corrigia
         em seguida e a proposta continuava com o valor errado, sem nada na
         tela explicando. Como o cadastro só acrescenta (nunca sobrescreve), o
         mais recente na ORDEM é a correção — e é ele que tem de valer. */
      if (!melhor || txt(p.data) >= txt(melhor.data)) melhor = p;
    });
    if (!melhor) return null;
    return { fornecedorId: alvo, valor: num(melhor.valor), data: txt(melhor.data) };
  };

  /* O MENOR custo vigente entre os fornecedores da madeira.
   * ⚠ Serve para LISTA DE REFERÊNCIA (a tabela do parceiro), nunca para
   *   proposta: na proposta o fornecedor é escolhido caso a caso (resposta
   *   A2), e escolher pelo sistema seria decidir por quem vende.
   *   "Vigente" = o preço mais recente de cada fornecedor; entre eles, o
   *   menor. Comparar todos os lançamentos históricos pegaria um preço de
   *   três meses atrás que ninguém consegue mais. */
  Carpintaria.menorCusto = function (madeira) {
    var melhor = null;
    Carpintaria.fornecedoresDe(madeira).forEach(function (fid) {
      var p = Carpintaria.precoFornecedor(madeira, fid);
      if (!p) return;
      if (!melhor || p.valor < melhor.valor) melhor = p;
    });
    return melhor;
  };

  /* ===================================================================
   * MÃO DE OBRA — serviço → R$/m²
   * =================================================================== */

  Carpintaria.indiceMO = function (lista) {
    var ix = {};
    arr(lista).forEach(function (s) {
      if (s && txt(s.id)) ix[txt(s.id)] = s;
    });
    return ix;
  };

  /* ===================================================================
   * OS DOIS FATORES
   * =================================================================== */

  /* Metragem da OBRA INTEIRA — regra 5. Devolve também o que ficou de fora,
     para a tela poder dizer em vez de esconder. */
  Carpintaria.metragem = function (itensMO, par) {
    var p = Carpintaria.parametros(par);
    var un = String(p.unidadeMO).toLowerCase();
    var total = 0, fora = [];
    arr(itensMO).forEach(function (i) {
      if (!i) return;
      var u = String(txt(i.unidade) || un).toLowerCase().replace("²", "2");
      if (u !== un) { fora.push(txt(i.servico) || txt(i.servicoId)); return; }
      total += num(i.qtd);
    });
    return { total: total, fora: fora };
  };

  Carpintaria.fatorFaixa = function (metragem, par) {
    var p = Carpintaria.parametros(par);
    if (p.corteM2 == null || p.acrescimoAbaixoPct == null) {
      return { fator: 1, abaixo: false, corte: p.corteM2, pct: p.acrescimoAbaixoPct, indefinido: true };
    }
    var abaixo = num(metragem) > 0 && num(metragem) < p.corteM2;
    return {
      fator: abaixo ? 1 + p.acrescimoAbaixoPct / 100 : 1,
      abaixo: abaixo, corte: p.corteM2, pct: p.acrescimoAbaixoPct, indefinido: false
    };
  };

  /* ⚠ Metragem ZERO não é "obra pequena". Proposta sem mão de obra cairia na
     faixa cara por acidente — e cobraria +50% sobre uma base que não existe.
     O `> 0` acima é o que impede isso; este comentário é para não o tirarem. */

  Carpintaria.fatorDetalhe = function (ids, par) {
    var p = Carpintaria.parametros(par);
    var ix = {};
    p.detalhes.forEach(function (d) { ix[d.id] = d; });
    var soma = 0, aplicados = [], desconhecidos = [], semPct = [];
    arr(ids).forEach(function (raw) {
      var id = txt(raw);
      var d = ix[id];
      if (!d) { desconhecidos.push(id); return; }
      if (d.pct == null) { semPct.push(d.nome); return; }
      soma += d.pct;
      aplicados.push({ id: d.id, nome: d.nome, pct: d.pct });
    });
    return { fator: 1 + soma / 100, pct: soma, aplicados: aplicados, desconhecidos: desconhecidos, semPct: semPct };
  };

  /* ===================================================================
   * OS CUSTOS DE CAMPO — deslocamento, alojamento, insumo
   *
   * ⚠ POR QUE ESTA É UMA TERCEIRA LISTA, e não mais uma linha da mão de obra.
   *   Foi o pedido do cliente: ele lançava o deslocamento por dentro do valor
   *   do material ou do m² da mão de obra, e o cliente final lia "está caro"
   *   sem ver o custo que existe de verdade. Pendurar isso em `itensMO`
   *   resolveria a soma e estragaria duas contas de uma vez:
   *     1. a metragem da faixa (regra 5) só soma o que está em m² — o
   *        deslocamento entraria como "fora da unidade", enchendo de aviso
   *        uma proposta correta;
   *     2. e, pior, item fora da unidade RECEBE o acréscimo de faixa junto
   *        (também regra 5, e de propósito) — o alojamento sairia com +50%
   *        em obra pequena, cobrando duas vezes o mesmo custo.
   *
   * ⚠ O VALOR MORA NA LINHA, não no catálogo. Madeira e mão de obra têm preço
   *   de tabela porque são os mesmos em toda obra; deslocamento depende da
   *   distância e alojamento do número de diárias. O catálogo aqui só
   *   SUGERE um valor de referência — obrigar cadastro por obra faria nascer
   *   "Deslocamento Curitiba", "Deslocamento Joinville" e um catálogo que
   *   ninguém mantém.
   *
   * ⚠ SEM VALOR NÃO SE INVENTA ZERO — a mesma regra 2 da madeira. A linha
   *   vira pendência e não entra no total.
   * =================================================================== */
  Carpintaria.linhasExtra = function (proposta, ctx, fechada, margemPct) {
    var pr = proposta || {}, c = ctx || {};
    var ix = {};
    arr(c.custos).forEach(function (x) { if (x && txt(x.id)) ix[txt(x.id)] = x; });
    var linhas = [], total = 0, custoTotal = 0, vendaComCusto = 0, pend = [];
    var margem = margemPct == null || txt(margemPct) === "" ? null : num(margemPct);

    arr(pr.itensExtra).forEach(function (it, i) {
      var cad = ix[txt(it && it.custoId)] || null;
      var desc = txt(it && it.descricao) || (cad && txt(cad.nome)) || ("custo " + (i + 1));
      var grupo = txt(it && it.grupo) || (cad && txt(cad.grupo)) || "outro";
      var unid = txt(it && it.unidade) || (cad && txt(cad.unidade)) || "";
      var qtd = num(it && it.qtd);
      var unit = null;

      /* ---------------------------------------------------------------
       * INSUMO COMPRADO: o valor digitado é CUSTO, e o cliente paga custo
       * + a margem da proposta.
       *
       * ⚠ É o caminho da madeira, não um segundo jeito de fazer preço. Ele
       *   compra verniz, óleo e lixa como compra tábua — e pediu para
       *   "colocar isso como custo no orçamento". Com um valor só, ele
       *   precisaria fazer a conta da margem de cabeça em cada proposta, e a
       *   margem que ele digitou no topo não valeria para o insumo.
       *
       * ⚠ E ISTO CRIA CUSTO INTERNO ONDE NÃO HAVIA. Enquanto o custo de campo
       *   tinha um valor só, não existia nada a esconder do cliente final.
       *   Agora existe: `auditar` (js/carpproposta.js) passou a procurar o
       *   custo e o lucro DESTAS linhas no papel, como já fazia com a madeira.
       *   Mexer aqui sem mexer lá reabre exatamente o buraco que as três
       *   camadas daquele arquivo existem para fechar.
       * --------------------------------------------------------------- */
      var comMargem = !!(it && it.comMargem);
      var custoUnit = null;
      if (comMargem) {
        var bruto = it && it.custoUnit != null && txt(it.custoUnit) !== "" ? it.custoUnit
          : (!fechada && cad && cad.valor != null && txt(cad.valor) !== "" ? cad.valor : null);
        if (bruto != null) custoUnit = num(bruto);
        /* ⚠ FECHADA LÊ O QUE FOI CONGELADO, NÃO RECALCULA — regra 4. Recalcular
           `custo × (1 + margem)` a cada abertura faria a proposta já enviada
           mudar de valor se alguém encostasse na margem ou no custo gravado, e
           é exatamente contra isso que `congelar` existe. */
        if (fechada && it && it.valorUnit != null && txt(it.valorUnit) !== "") {
          unit = num(it.valorUnit);
        } else if (bruto == null) {
          pend.push('"' + desc + '": falta o custo de compra deste item.');
        } else if (num(bruto) < 0) {
          pend.push('"' + desc + '": o custo não pode ser negativo.');
          custoUnit = null;
        } else if (margem == null) {
          /* ⚠ margem vazia NÃO vira 0% aqui, pela mesma regra 3 da madeira:
             seria vender insumo a preço de custo sem ninguém decidir isso. */
          pend.push('"' + desc + '": sem a margem da proposta este item sairia a preço de custo.');
        } else {
          unit = money(custoUnit * (1 + margem / 100));
        }
        if (custoUnit != null) custoTotal += money(qtd * custoUnit);
        if (qtd <= 0) pend.push('"' + desc + '": quantidade zerada.');
        var subM = unit == null ? null : money(qtd * unit);
        if (subM != null) { total += subM; vendaComCusto += subM; }
        linhas.push({
          custoId: txt(it && it.custoId), descricao: desc, grupo: grupo,
          unidade: unid, qtd: qtd, comMargem: true, custoUnit: custoUnit,
          valorUnit: unit, subtotal: subM, semPreco: unit == null
        });
        return;
      }

      var naLinha = it && it.valorUnit != null && txt(it.valorUnit) !== "";
      if (naLinha) {
        unit = num(it.valorUnit);        // congelado (regra 4) ou digitado agora
      } else if (fechada) {
        /* ⚠ PROPOSTA FECHADA NÃO VOLTA AO CADASTRO, nem para preencher buraco.
           `congelar` grava o valor de toda linha, então chegar aqui significa
           dado adulterado ou vindo de fora — e nesse caso ler o catálogo de
           HOJE mudaria, calada, o valor de uma proposta já enviada ao cliente.
           Sem valor gravado, a proposta acusa; ela não adivinha. */
        pend.push('"' + desc + '": a proposta está fechada e este custo não tem valor congelado.');
      } else if (cad && cad.valor != null && txt(cad.valor) !== "") {
        unit = num(cad.valor);                          // valor de referência
      } else {
        pend.push('"' + desc + '": falta o valor deste custo.');
      }

      if (qtd <= 0) pend.push('"' + desc + '": quantidade zerada.');
      if (unit != null && unit < 0) { pend.push('"' + desc + '": o valor não pode ser negativo.'); unit = null; }

      var sub = unit == null ? null : money(qtd * unit);
      if (sub != null) total += sub;
      linhas.push({
        custoId: txt(it && it.custoId), descricao: desc, grupo: grupo,
        unidade: unid, qtd: qtd, comMargem: false, custoUnit: null,
        valorUnit: unit, subtotal: sub, semPreco: unit == null
      });
    });

    return {
      linhas: linhas, total: money(total),
      /* o que ELE pagou pelos itens comprados — conta interna, nunca papel.
         ⚠ O lucro é só do que TEM custo: somar o total inteiro contaria
         deslocamento e alojamento (valor único, custo zero) como lucro puro,
         e a tela mostraria uma margem que não existe. */
      custo: money(custoTotal), lucro: money(money(vendaComCusto) - money(custoTotal)),
      pendencias: pend
    };
  };

  /* ===================================================================
   * A CONTA
   *
   * `ctx` = { madeiras: [], servicos: [], custos: [], parametros: {} }
   * Proposta FECHADA ignora o ctx e lê o que foi congelado nela — regra 4.
   * =================================================================== */
  Carpintaria.calcular = function (proposta, ctx) {
    var pr = proposta || {};
    var c = ctx || {};
    var fechada = Carpintaria.estaFechada(pr);
    var par = Carpintaria.parametros(fechada && pr.parametros ? pr.parametros : c.parametros);
    var ixMad = {}, ixMO = Carpintaria.indiceMO(c.servicos);
    arr(c.madeiras).forEach(function (m) { if (m && txt(m.id)) ixMad[txt(m.id)] = m; });

    var pend = [];
    var linhasMadeira = [], custoMadeira = 0;

    arr(pr.itensMadeira).forEach(function (it, i) {
      var mad = ixMad[txt(it && it.madeiraId)] || null;
      var desc = txt(it && it.descricao) || Carpintaria.descricaoMadeira(mad) || ("item " + (i + 1));
      var qtd = num(it && it.qtd);
      var forn = txt(it && it.fornecedorId);
      var unit = null, dataPreco = "";

      if (fechada && it && it.custoUnit != null && txt(it.custoUnit) !== "") {
        unit = num(it.custoUnit);            // congelado — regra 4
        dataPreco = txt(it.dataPreco);
      } else if (!forn) {
        pend.push('"' + desc + '": falta escolher o fornecedor.');
      } else {
        var pf = mad ? Carpintaria.precoFornecedor(mad, forn) : null;
        if (!pf) pend.push('"' + desc + '": sem preço cadastrado para o fornecedor escolhido.');
        else { unit = pf.valor; dataPreco = pf.data; }
      }

      if (qtd <= 0) pend.push('"' + desc + '": quantidade zerada.');
      /* regra 2: sem preço a linha NÃO entra no total */
      var sub = unit == null ? null : money(qtd * unit);
      if (sub != null) custoMadeira += sub;
      linhasMadeira.push({
        madeiraId: txt(it && it.madeiraId), descricao: desc,
        unidade: txt(it && it.unidade) || (mad && txt(mad.unidade)) || "",
        qtd: qtd, fornecedorId: forn, custoUnit: unit, dataPreco: dataPreco,
        subtotal: sub, semPreco: unit == null
      });
    });
    custoMadeira = money(custoMadeira);

    var margem = pr.margemPct == null || txt(pr.margemPct) === "" ? null : num(pr.margemPct);
    if (margem == null) pend.push("Falta a margem da proposta — sem ela a madeira sai a preço de custo.");
    else if (margem < 0) pend.push("A margem não pode ser negativa.");
    var vendaMadeira = margem == null ? null : money(custoMadeira * (1 + margem / 100));

    var linhasMO = [], moBase = 0;
    arr(pr.itensMO).forEach(function (it, i) {
      var srv = ixMO[txt(it && it.servicoId)] || null;
      var nome = txt(it && it.servico) || (srv && txt(srv.servico)) || ("serviço " + (i + 1));
      var qtd = num(it && it.qtd);
      var unit = null;
      if (fechada && it && it.valorUnit != null && txt(it.valorUnit) !== "") unit = num(it.valorUnit);
      else if (srv && srv.valor != null && txt(srv.valor) !== "") unit = num(srv.valor);
      else pend.push('"' + nome + '": sem valor por m² na tabela de mão de obra.');
      if (qtd <= 0) pend.push('"' + nome + '": metragem zerada.');
      var sub = unit == null ? null : money(qtd * unit);
      if (sub != null) moBase += sub;
      linhasMO.push({
        servicoId: txt(it && it.servicoId), servico: nome,
        unidade: txt(it && it.unidade) || (srv && txt(srv.unidade)) || par.unidadeMO,
        qtd: qtd, valorUnit: unit, subtotal: sub, semPreco: unit == null
      });
    });
    moBase = money(moBase);

    var med = Carpintaria.metragem(linhasMO, par);
    /* ⚠ AVISO NÃO É IMPEDIMENTO, e confundir os dois travou a proposta mais
     * comum do cliente. Ele vende deck em m² E forro/ripado/caibro em metro
     * linear; a faixa dos 65 m² é medida em m², então o serviço em outra
     * unidade fica fora DESSA CONTA — e só dela. Enquanto isso ia para
     * `pendencias`, `podeFechar` recusava, e não havia saída pela tela: a
     * única forma de fechar era cadastrar o forro em m², o que corromperia
     * justamente a metragem que decide a faixa.
     * O serviço continua cobrado normalmente e continua recebendo o
     * acréscimo de faixa — a faixa é uma propriedade da OBRA (obra pequena
     * custa mais caro de executar), não de cada linha. */
    var avisos = med.fora.map(function (n) {
      return '"' + n + '" não está em ' + par.unidadeMO + ": ele é cobrado normalmente, mas não entra na metragem que decide a faixa.";
    });

    /* os custos de campo entram DEPOIS da mão de obra e ANTES dos acréscimos,
       porque é a base dos acréscimos que precisa saber se eles contam */
    var ext = Carpintaria.linhasExtra(pr, c, fechada, margem);
    arr(ext.pendencias).forEach(function (x) { pend.push(x); });

    var faixa = fechada && pr.faixa ? pr.faixa : Carpintaria.fatorFaixa(med.total, par);
    var det = fechada && pr.detalhe ? pr.detalhe : Carpintaria.fatorDetalhe(pr.detalhes, par);
    if (faixa.indefinido) pend.push("Os parâmetros da faixa de metragem não estão preenchidos.");
    arr(det.semPct).forEach(function (n) { pend.push('O detalhe "' + n + '" está sem percentual.'); });
    arr(det.desconhecidos).forEach(function (n) { pend.push('Detalhe "' + n + '" não existe mais nos parâmetros.'); });

    /* --- os dois acréscimos, regra 6 --- */
    /* ⚠ QUEM ENTRA NA BASE "TOTAL" É DECISÃO DE DINHEIRO, e por isso é
       parâmetro. Com `incideExtra = "fora"` (o padrão), a base continua sendo
       exatamente a de antes desta funcionalidade existir — madeira vendida
       mais mão de obra —, e proposta nenhuma muda de valor por causa dela. */
    var baseTotal = money((vendaMadeira || 0) + moBase + (par.incideExtra === "dentro" ? ext.total : 0));
    var baseFaixa = par.incideAcrescimo === "total" ? baseTotal : moBase;
    var baseDet = par.incideDetalhe === "total" ? baseTotal : moBase;
    var addFaixa, addDet;
    if (par.composicaoAcrescimos === "composto" && par.incideAcrescimo === par.incideDetalhe) {
      /* composto só faz sentido quando os dois batem na mesma base */
      var comp = money(baseFaixa * faixa.fator * det.fator);
      addFaixa = money(baseFaixa * (faixa.fator - 1));
      addDet = money(comp - baseFaixa - addFaixa);
    } else {
      addFaixa = money(baseFaixa * (faixa.fator - 1));
      addDet = money(baseDet * (det.fator - 1));
    }

    var total = vendaMadeira == null ? null : money(vendaMadeira + moBase + addFaixa + addDet + ext.total);

    return {
      fechada: fechada,
      linhasMadeira: linhasMadeira, linhasMO: linhasMO, linhasExtra: ext.linhas,
      totalExtras: ext.total, custoExtras: ext.custo, lucroExtras: ext.lucro,
      custoMadeira: custoMadeira, margemPct: margem, vendaMadeira: vendaMadeira,
      lucroMadeira: vendaMadeira == null ? null : money(vendaMadeira - custoMadeira),
      metragem: med.total, moBase: moBase,
      faixa: faixa, detalhe: det,
      acrescimoFaixa: addFaixa, acrescimoDetalhe: addDet,
      moTotal: money(moBase + (par.incideAcrescimo === "mo" ? addFaixa : 0) + (par.incideDetalhe === "mo" ? addDet : 0)),
      total: total,
      pendencias: pend,
      /* o que a tela DEVE dizer mas NÃO impede de fechar — ver a nota da
         unidade acima. Misturar os dois foi o defeito. */
      avisos: avisos,
      completa: pend.length === 0 && total != null,
      parametros: par
    };
  };

  /* ===================================================================
   * FECHAR, CONGELAR E VENCER
   * =================================================================== */

  Carpintaria.estaFechada = function (pr) { return !!(pr && pr.fechadaEm); };

  Carpintaria.podeFechar = function (proposta, ctx) {
    var r = Carpintaria.calcular(proposta, ctx);
    var f = r.pendencias.slice();
    if (!arr(proposta && proposta.itensMadeira).length && !arr(proposta && proposta.itensMO).length
      && !arr(proposta && proposta.itensExtra).length) {
      f.push("A proposta está vazia.");
    }
    return { ok: f.length === 0, pendencias: f, resultado: r };
  };

  /* Grava dentro da proposta tudo o que a conta usou — regra 4.
     `hojeISO` entra por parâmetro para o teste não depender do relógio. */
  /* ⚠ QUEM FECHOU E QUEM REABRIU FICAM GRAVADOS. Fechar é o instante em que
     preço de madeira, fornecedor e os dois fatores viram compromisso com o
     cliente; reabrir apaga tudo isso e devolve a proposta ao cadastro de hoje.
     Só a DATA era guardada — com seis pessoas na conta, uma proposta já enviada
     podia ser reaberta e o sistema não sabia dizer por quem. A apuração da
     folha, no módulo irmão, guarda `aprovadaPor` desde o primeiro dia; aqui
     faltava a metade simétrica. */
  Carpintaria.congelar = function (proposta, ctx, hojeISO, quem) {
    var chk = Carpintaria.podeFechar(proposta, ctx);
    if (!chk.ok) return { ok: false, pendencias: chk.pendencias };
    var r = chk.resultado;
    var pr = proposta;
    pr.itensMadeira = r.linhasMadeira.map(function (l) {
      return {
        madeiraId: l.madeiraId, descricao: l.descricao, unidade: l.unidade,
        qtd: l.qtd, fornecedorId: l.fornecedorId, custoUnit: l.custoUnit, dataPreco: l.dataPreco
      };
    });
    pr.itensMO = r.linhasMO.map(function (l) {
      return { servicoId: l.servicoId, servico: l.servico, unidade: l.unidade, qtd: l.qtd, valorUnit: l.valorUnit };
    });
    /* ⚠ o custo de campo congela igual aos outros dois. A descrição e o GRUPO
       vão junto: é o grupo que dá o título do bloco no papel do cliente, e um
       catálogo editado depois do envio renomearia o que já foi assinado. */
    pr.itensExtra = arr(r.linhasExtra).map(function (l) {
      return {
        custoId: l.custoId, descricao: l.descricao, grupo: l.grupo,
        unidade: l.unidade, qtd: l.qtd, valorUnit: l.valorUnit,
        /* ⚠ o item comprado congela os DOIS números: o de venda porque é o
           compromisso com o cliente, e o de custo porque é a conta interna que
           responde "quanto sobrou nesta proposta". Sem o custo congelado, um
           reajuste de verniz reescreveria o lucro de uma obra já entregue. */
        comMargem: !!l.comMargem, custoUnit: l.comMargem ? l.custoUnit : null
      };
    });
    pr.parametros = r.parametros;   // inclusive a composição dos acréscimos
    pr.faixa = r.faixa;
    pr.detalhe = r.detalhe;
    pr.totais = {
      custoMadeira: r.custoMadeira, vendaMadeira: r.vendaMadeira, moBase: r.moBase,
      acrescimoFaixa: r.acrescimoFaixa, acrescimoDetalhe: r.acrescimoDetalhe,
      moTotal: r.moTotal, metragem: r.metragem, totalExtras: r.totalExtras,
      custoExtras: r.custoExtras, lucroExtras: r.lucroExtras, total: r.total
    };
    pr.fechadaEm = txt(hojeISO) || (global.Util && global.Util.agoraISO ? global.Util.agoraISO() : new Date().toISOString());
    if (txt(quem)) pr.fechadaPor = txt(quem);
    return { ok: true, proposta: pr, resultado: r };
  };

  /* Reabrir descongela: some tudo o que `congelar` gravou, e a proposta volta
     a seguir o cadastro. Meio-termo — reabrir mantendo os fatores congelados —
     seria a pior das duas, porque a tela mostraria preço novo com fator velho. */
  Carpintaria.reabrir = function (proposta, quem, quandoISO) {
    var pr = proposta || {};
    /* o rastro da reabertura NÃO é apagado junto com o resto: é justamente ele
       que responde "quem mexeu na proposta que eu já tinha enviado?" */
    if (pr.fechadaEm) {
      pr.reabertaEm = txt(quandoISO) || (global.Util && global.Util.agoraISO ? global.Util.agoraISO() : new Date().toISOString());
      if (txt(quem)) pr.reabertaPor = txt(quem);
      pr.fechadaAnteriorEm = pr.fechadaEm;
    }
    delete pr.fechadaEm; delete pr.fechadaPor; delete pr.faixa; delete pr.detalhe;
    delete pr.totais; delete pr.parametros;
    arr(pr.itensMadeira).forEach(function (i) { delete i.custoUnit; delete i.dataPreco; });
    arr(pr.itensMO).forEach(function (i) { delete i.valorUnit; });
    /* ⚠ O CUSTO DE CAMPO NÃO É DESCONGELADO — e a diferença não é descuido.
       O preço da madeira e o m² da mão de obra são CÓPIA do cadastro: apagar
       a cópia devolve a proposta ao cadastro de hoje, e nada se perde. O valor
       do deslocamento desta obra foi DIGITADO aqui e não existe em lugar
       nenhum além desta linha — apagá-lo ao reabrir jogaria fora o que a
       pessoa escreveu, trocando por um valor de referência que ela já tinha
       decidido não usar. Reabrir para corrigir uma quantidade não pode
       reescrever o combinado da obra.
       ⚠ A EXCEÇÃO É O ITEM COMPRADO (`comMargem`): ali o valor de venda É
       derivado — custo mais a margem da proposta —, exatamente como o preço
       da madeira. O custo digitado fica; o preço de venda volta a ser
       calculado, senão mudar a margem ao reabrir não mexeria no insumo. */
    arr(pr.itensExtra).forEach(function (i) { if (i && i.comMargem) delete i.valorUnit; });
    return pr;
  };

  function dia(iso) {
    var s = txt(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  }

  /* Dias corridos desde o fechamento. Proposta não fechada não vence — não
     existe validade de rascunho. */
  Carpintaria.validade = function (proposta, hojeISO, par) {
    var pr = proposta || {};
    var p = Carpintaria.parametros(Carpintaria.estaFechada(pr) && pr.parametros ? pr.parametros : par);
    if (!Carpintaria.estaFechada(pr)) return { aplicavel: false, vencida: false, restam: null, dias: p.validadeDias };
    var a = dia(pr.fechadaEm), b = dia(hojeISO);
    if (a == null || b == null) return { aplicavel: true, vencida: false, restam: null, dias: p.validadeDias };
    var passados = Math.floor((b - a) / 86400000);
    var restam = p.validadeDias - passados;
    return { aplicavel: true, vencida: restam < 0, restam: restam, passados: passados, dias: p.validadeDias };
  };

  /* ⚠ Vencer NÃO recalcula nada — decisão A3, o reajuste é manual. O sistema
     avisa e oferece refazer; refazer é uma proposta NOVA, com os preços do
     dia. Recalcular a antiga em silêncio reescreveria o que já foi enviado
     ao cliente. */
  Carpintaria.refazer = function (proposta, hojeISO) {
    var velha = proposta || {};
    var nova = {
      clienteId: velha.clienteId, obraId: velha.obraId,
      titulo: txt(velha.titulo), margemPct: velha.margemPct,
      detalhes: arr(velha.detalhes).slice(),
      refazDe: txt(velha.id),
      data: txt(hojeISO) || (global.Util && global.Util.agoraISO ? global.Util.agoraISO() : new Date().toISOString()),
      itensMadeira: arr(velha.itensMadeira).map(function (i) {
        return { madeiraId: i.madeiraId, descricao: i.descricao, unidade: i.unidade, qtd: i.qtd, fornecedorId: i.fornecedorId };
      }),
      itensMO: arr(velha.itensMO).map(function (i) {
        return { servicoId: i.servicoId, servico: i.servico, unidade: i.unidade, qtd: i.qtd };
      }),
      /* o custo de campo vem inteiro, COM o valor — pelo mesmo motivo de
         `reabrir`: ele foi digitado, não copiado de tabela nenhuma. Refazer é
         reaproveitar; obrigar a redigitar deslocamento e diárias faria a
         pessoa preferir editar a proposta vencida. */
      itensExtra: arr(velha.itensExtra).map(function (i) {
        return {
          custoId: i.custoId, descricao: i.descricao, grupo: i.grupo,
          unidade: i.unidade, qtd: i.qtd,
          /* item comprado não leva o preço de VENDA velho: ele é derivado do
             custo mais a margem da proposta nova, e carregar o número antigo
             deixaria na linha um valor que ninguém usa e todo mundo lê */
          valorUnit: i.comMargem ? null : i.valorUnit,
          comMargem: !!i.comMargem, custoUnit: i.comMargem ? i.custoUnit : null
        };
      })
    };
    return nova;   // sem custoUnit/valorUnit de madeira e MO: esses vêm do cadastro de hoje
  };

  global.Carpintaria = Carpintaria;
  if (typeof module !== "undefined" && module.exports) module.exports = Carpintaria;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

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
 * SEIS REGRAS QUE NÃO PODEM SAIR DAQUI PARA A TELA
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
    unidadeMO: "m2"
  };

  Carpintaria.BASES = { mo: "só a mão de obra", total: "o total da proposta" };
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
   * A CONTA
   *
   * `ctx` = { madeiras: [], servicos: [], parametros: {} }
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

    var faixa = fechada && pr.faixa ? pr.faixa : Carpintaria.fatorFaixa(med.total, par);
    var det = fechada && pr.detalhe ? pr.detalhe : Carpintaria.fatorDetalhe(pr.detalhes, par);
    if (faixa.indefinido) pend.push("Os parâmetros da faixa de metragem não estão preenchidos.");
    arr(det.semPct).forEach(function (n) { pend.push('O detalhe "' + n + '" está sem percentual.'); });
    arr(det.desconhecidos).forEach(function (n) { pend.push('Detalhe "' + n + '" não existe mais nos parâmetros.'); });

    /* --- os dois acréscimos, regra 6 --- */
    var baseFaixa = par.incideAcrescimo === "total" ? money((vendaMadeira || 0) + moBase) : moBase;
    var baseDet = par.incideDetalhe === "total" ? money((vendaMadeira || 0) + moBase) : moBase;
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

    var total = vendaMadeira == null ? null : money(vendaMadeira + moBase + addFaixa + addDet);

    return {
      fechada: fechada,
      linhasMadeira: linhasMadeira, linhasMO: linhasMO,
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
    if (!arr(proposta && proposta.itensMadeira).length && !arr(proposta && proposta.itensMO).length) {
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
    pr.parametros = r.parametros;   // inclusive a composição dos acréscimos
    pr.faixa = r.faixa;
    pr.detalhe = r.detalhe;
    pr.totais = {
      custoMadeira: r.custoMadeira, vendaMadeira: r.vendaMadeira, moBase: r.moBase,
      acrescimoFaixa: r.acrescimoFaixa, acrescimoDetalhe: r.acrescimoDetalhe,
      moTotal: r.moTotal, metragem: r.metragem, total: r.total
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
      })
    };
    return nova;   // sem custoUnit/valorUnit: os preços vêm do cadastro de hoje
  };

  global.Carpintaria = Carpintaria;
  if (typeof module !== "undefined" && module.exports) module.exports = Carpintaria;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

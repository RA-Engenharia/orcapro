/* =====================================================================
 * fechamento.js — FECHAR O ORÇAMENTO EM UM VALOR ALVO
 *
 * O problema real: a planilha deu R$ 130.000 e o negócio precisa fechar em
 * R$ 150.000 (ou o cliente pediu desconto e tem de sair R$ 120.000). Hoje
 * isso se resolve na unha, item a item, e o que sobra é uma planilha que
 * ninguém consegue explicar depois.
 *
 * ⚠ ONDE A DIFERENÇA CAI NÃO É DETALHE — É A DIFERENÇA ENTRE UM ORÇAMENTO
 *   DEFENSÁVEL E UM QUE NÃO SE SUSTENTA NUMA ANÁLISE.
 *
 *   BDI é o único lugar onde a diferença é HONESTA por natureza: o custo
 *   continua sendo o custo (o que a obra consome de verdade), e o que muda é
 *   a remuneração. Por isso é o padrão. Mexer em custo unitário faz o item
 *   DIVERGIR da base oficial — é legítimo (preço de mercado difere da
 *   referência), mas exige justificativa escrita quando o orçamento vai para
 *   órgão público (Lei 14.133/2021, art. 23). Este módulo registra essa
 *   justificativa item a item, via Ajustes, para que a divergência nunca seja
 *   silenciosa.
 *
 * ⚠ TRUNCAMENTO, NÃO ARREDONDAMENTO. O motor da casa TRUNCA em 2 casas
 *   (padrão TCU). Isso significa que multiplicar tudo por um fator k e
 *   truncar SEMPRE dá um total MENOR que o pretendido — o erro é de um lado
 *   só, não se compensa como no arredondamento. Um fator aplicado uma vez
 *   erra o alvo por dezenas de reais num orçamento grande. Por isso este
 *   módulo ITERA e depois joga o resíduo em um item, em vez de confiar na
 *   multiplicação (ver `_convergir` e `_resolverResiduo`).
 *
 * Módulo PURO: sem DOM, sem rede, testável no Node.
 * ===================================================================== */
(function (global) {
  "use strict";

  function _dep(nome) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") {
      try { var m = require("./" + nome.toLowerCase() + ".js"); if (m) return m; } catch (e) {}
    }
    return null;
  }
  function U() { return _dep("Util"); }
  function O() { return _dep("Orcamento"); }
  function A() { return global.Arred || _dep("Arred") || null; }

  function num(v) { var U0 = U(); return U0 ? U0.num(v) : (Number(v) || 0); }
  function tr2(v) {
    var A0 = A();
    if (A0 && A0.valor) return A0.valor(v, "truncar2");
    var n = Number(v); if (!isFinite(n)) return 0;
    var s = n < 0 ? -1 : 1;
    return s * (Math.floor(Math.abs(n) * 100 + 1e-9) / 100);
  }

  /* ===================================================================
   * OS MODOS. Cada um responde "de onde sai (ou para onde vai) o dinheiro".
   * A ordem aqui é a ordem de recomendação.
   * =================================================================== */
  var MODOS = {
    bdi: {
      id: "bdi",
      rotulo: "No BDI (lucro e despesas indiretas)",
      resumo: "Não toca em nenhum custo. O custo direto continua sendo o que a obra consome; muda a sua remuneração.",
      quando: "É o mais defensável e o padrão. Use sempre que puder.",
      mexeEmCusto: false
    },
    total: {
      id: "total",
      rotulo: "Distribuído em todos os itens",
      resumo: "Rateia proporcionalmente no custo de cada item, respeitando o peso de cada um no orçamento.",
      quando: "Quando o preço de mercado do seu fornecedor realmente difere da base de referência.",
      mexeEmCusto: true, parcela: null
    },
    mo: {
      id: "mo",
      rotulo: "Somente na mão de obra",
      resumo: "A diferença inteira cai na parcela de MO dos itens que têm mão de obra.",
      quando: "Quando o seu custo de equipe difere do encargo da base (produtividade própria, região).",
      mexeEmCusto: true, parcela: "custoMO"
    },
    mat: {
      id: "mat",
      rotulo: "Somente no material",
      resumo: "A diferença inteira cai na parcela de material dos itens que têm material.",
      quando: "Quando você tem cotação de fornecedor diferente da referência.",
      mexeEmCusto: true, parcela: "custoMAT"
    },
    eq: {
      id: "eq",
      rotulo: "Somente em equipamento",
      resumo: "A diferença inteira cai na parcela de equipamento.",
      quando: "Frota própria ou locação com preço diferente da referência.",
      mexeEmCusto: true, parcela: "custoEQ"
    }
  };
  var ORDEM_MODOS = ["bdi", "total", "mo", "mat", "eq"];

  /* Item entra no rateio? Fora ficam os que não têm o que ratear e os que o
     usuário travou. Item pendente de quantidade não pode participar: ele não
     soma no total hoje, então distribuir nele é jogar dinheiro num buraco. */
  function elegivel(it, parcela) {
    if (!it) return false;
    if (it.fechamentoTravado) return false;
    if (it.qtdPendente) return false;
    if (!(num(it.quantidade) > 0)) return false;
    if (!(num(it.custoUnitario) > 0)) return false;
    if (parcela) return num(it[parcela]) > 0;
    return true;
  }

  /* Base de rateio: o total (em R$) sobre o qual o fator vai incidir. */
  function baseDe(orc, parcela) {
    var soma = 0;
    ((orc && orc.etapas) || []).forEach(function (e) {
      (e.itens || []).forEach(function (it) {
        if (!elegivel(it, parcela)) return;
        soma += num(it.quantidade) * num(parcela ? it[parcela] : it.custoUnitario);
      });
    });
    return tr2(soma);
  }

  function itensElegiveis(orc, parcela) {
    var out = [];
    ((orc && orc.etapas) || []).forEach(function (e) {
      (e.itens || []).forEach(function (it) { if (elegivel(it, parcela)) out.push({ etapa: e, item: it }); });
    });
    return out;
  }

  /* ===================================================================
   * SIMULAR — calcula o que aconteceria, SEM tocar no orçamento.
   * É o que a tela mostra antes de o usuário confirmar. Devolve os avisos
   * que importam, porque a decisão de seguir ou não é dele.
   * =================================================================== */
  function simular(orc, alvo, modoId) {
    var Orc = O();
    if (!Orc) return { ok: false, erro: "Motor de orçamento indisponível." };
    var modo = MODOS[modoId];
    if (!modo) return { ok: false, erro: "Forma de distribuição desconhecida." };

    var t = Orc.totais(orc);
    var atual = num(t.precoVenda), custo = num(t.custoDireto);
    alvo = num(alvo);

    if (!(alvo > 0)) return { ok: false, erro: "Informe o valor final desejado." };
    if (!(custo > 0)) return { ok: false, erro: "O orçamento não tem custo lançado — não há o que distribuir." };
    if (Math.abs(alvo - atual) < 0.01) return { ok: false, erro: "O orçamento já está nesse valor." };

    var delta = tr2(alvo - atual);
    var avisos = [], bloqueios = [];
    var out = {
      ok: true, modo: modoId, alvo: alvo, atual: atual, delta: delta,
      sentido: delta > 0 ? "acrescimo" : "desconto",
      custoAtual: custo, bdiAtual: num(t.bdiPercentual)
    };

    if (modoId === "bdi") {
      /* pct' tal que custo × (1+pct'/100) = alvo.
         O custo NÃO muda — é isso que torna este modo o mais limpo. */
      var novoPct = (alvo / custo - 1) * 100;
      out.bdiNovo = Math.round(novoPct * 10000) / 10000;
      out.itensAfetados = 0;
      if (novoPct < 0) {
        bloqueios.push("O valor pedido (" + fmt(alvo) + ") é MENOR que o custo direto (" + fmt(custo) +
          "). Isso é BDI negativo: você venderia abaixo do que a obra consome, com prejuízo de " +
          fmt(custo - alvo) + " antes de qualquer imprevisto.");
      } else if (novoPct < 5) {
        avisos.push("BDI de " + fmtPct(novoPct) + " não cobre nem os impostos na maioria dos casos (só o ISS + PIS/COFINS já passa de 8%). Confira se sobra lucro.");
      }
      if (novoPct > 40) {
        avisos.push("BDI de " + fmtPct(novoPct) + " fica acima da faixa do Acórdão TCU 2.622/2013 para praticamente todo tipo de obra. Em licitação isso é questionado.");
      }
      if (orc && orc.config && orc.config.licitacao && orc.config.licitacao.ativo && novoPct > 30) {
        avisos.push("Este orçamento está marcado como LICITAÇÃO e o BDI passaria de 30% — prepare a justificativa.");
      }
      out.avisos = avisos; out.bloqueios = bloqueios;
      return out;
    }

    // ---- modos que mexem em custo ----
    var parcela = modo.parcela;
    var base = baseDe(orc, parcela);
    var elegiveis = itensElegiveis(orc, parcela);
    out.itensAfetados = elegiveis.length;
    out.base = base;

    if (!elegiveis.length) {
      return { ok: false, erro: parcela
        ? "Nenhum item deste orçamento tem " + nomeParcela(parcela) + " com valor — não há onde distribuir. Escolha outra forma."
        : "Nenhum item elegível para receber a diferença." };
    }

    /* O alvo é de PREÇO DE VENDA; o rateio acontece no CUSTO. Com o BDI fixo,
       o custo que leva ao alvo é alvo/(1+bdi). É essa a conta que o usuário
       não faz de cabeça e é onde o "distribuí na mão" costuma errar. */
    var fatorBdi = 1 + num(t.bdiPercentual) / 100;
    var custoAlvo = fatorBdi > 0 ? (alvo / fatorBdi) : alvo;
    var deltaCusto = custoAlvo - custo;
    out.custoAlvo = tr2(custoAlvo);
    out.deltaCusto = tr2(deltaCusto);

    var novaBase = base + deltaCusto;
    out.fator = base > 0 ? (novaBase / base) : 0;

    if (novaBase <= 0) {
      bloqueios.push("O desconto pedido (" + fmt(Math.abs(delta)) + ") é maior que " +
        (parcela ? "toda a " + nomeParcela(parcela) + " do orçamento (" + fmt(base) + ")" : "o custo inteiro") +
        ". Não dá para tirar mais do que existe.");
    } else if (parcela && out.fator > 3) {
      avisos.push("A " + nomeParcela(parcela) + " teria de " + (out.fator > 1 ? "subir" : "cair") + " " +
        fmtPct((out.fator - 1) * 100) + " para absorver a diferença sozinha, porque ela é só " +
        fmtPct(base / custo * 100) + " do custo. O preço unitário desses itens vai ficar irreconhecível — considere distribuir em todos os itens ou no BDI.");
    } else if (parcela && out.fator < 0.4) {
      avisos.push("A " + nomeParcela(parcela) + " cairia " + fmtPct((1 - out.fator) * 100) +
        ". Confira se o custo restante ainda paga a execução.");
    }

    /* Itens SINAPI com custo alterado divergem da base oficial. Não é
       proibido — é o que exige justificativa por escrito. */
    var nOficiais = 0;
    elegiveis.forEach(function (x) {
      var f = String(x.item.baseFonte || x.item.origem || "").toUpperCase();
      if (f && f !== "PROPRIA" && f !== "PROPRIO" && f !== "OUTRA") nOficiais++;
    });
    if (nOficiais > 0) {
      avisos.push(nOficiais + " item(ns) vêm de base oficial e ficarão com preço diferente da referência. " +
        "O sistema registra a justificativa em cada um, e ela sai na aba de justificativas do Excel — exigência da Lei 14.133 em obra pública.");
    }

    out.avisos = avisos; out.bloqueios = bloqueios;
    return out;
  }

  function nomeParcela(p) {
    return p === "custoMO" ? "mão de obra" : (p === "custoMAT" ? "material" : (p === "custoEQ" ? "equipamento" : "parcela"));
  }
  function fmt(v) { var U0 = U(); return U0 && U0.fmtMoeda ? U0.fmtMoeda(v) : ("R$ " + Number(v).toFixed(2)); }
  function fmtPct(v) { var U0 = U(); return (U0 && U0.fmtNum ? U0.fmtNum(v, 2) : Number(v).toFixed(2)) + "%"; }

  /* ===================================================================
   * APLICAR
   * =================================================================== */
  function aplicar(orc, alvo, modoId, opts) {
    opts = opts || {};
    var Orc = O();
    var sim = simular(orc, alvo, modoId);
    if (!sim.ok) return { ok: false, erro: sim.erro };
    if (sim.bloqueios && sim.bloqueios.length && !opts.forcar) {
      return { ok: false, erro: sim.bloqueios[0], bloqueios: sim.bloqueios };
    }

    // snapshot ANTES de qualquer escrita: é ele que faz o desfazer existir
    var antes = { bdiPercentual: (orc.bdi ? num(orc.bdi.percentual) : 0), itens: [] };
    var motivo = opts.motivo || ("Fechamento do orçamento em " + fmt(sim.alvo) +
                 " (" + (sim.sentido === "acrescimo" ? "acréscimo" : "desconto") + " de " + fmt(Math.abs(sim.delta)) + ")");

    if (modoId === "bdi") {
      orc.bdi = orc.bdi || {};
      antes.itens = [];
      orc.bdi.modeloId = "manual";
      orc.bdi.params = null;
      orc.bdiEraManual = true;
      var achado = _melhorBdi(orc, sim.alvo, sim.bdiNovo);
      orc.bdi.percentual = achado.pct;
      var depoisB = Orc.totais(orc);
      orc.fechamento = registro(sim, modoId, antes, motivo, opts);
      var resB = { ok: true, modo: modoId, alvo: sim.alvo, atingido: num(depoisB.precoVenda),
                   bdiNovo: achado.pct, itensAfetados: 0, avisos: (sim.avisos || []).slice() };
      /* Quando o BDI incide no unitário, o preço final é a SOMA de valores
         truncados item a item — uma função ESCADA do percentual. Pode
         simplesmente não existir um BDI que dê o alvo ao centavo. Nesse caso
         entrega-se o degrau mais próximo e DIZ-SE isso, em vez de mostrar o
         alvo na tela e gravar outro número na planilha. */
      var sobraB = tr2(sim.alvo - num(depoisB.precoVenda));
      if (Math.abs(sobraB) >= 0.01) {
        resB.sobra = sobraB;
        resB.avisos.push("Com o BDI embutido no preço unitário, o total é a soma de valores arredondados item a item — o mais perto que dá deste alvo é " +
          fmt(num(depoisB.precoVenda)) + " (" + (sobraB > 0 ? "faltam " : "passou ") + fmt(Math.abs(sobraB)) +
          "). Para bater exato ao centavo, distribua nos itens em vez do BDI.");
      }
      return resB;
    }

    var parcela = MODOS[modoId].parcela;
    var lista = itensElegiveis(orc, parcela);
    lista.forEach(function (x) {
      antes.itens.push({
        etapaId: x.etapa.id, itemId: x.item.id,
        custoUnitario: num(x.item.custoUnitario), custoMO: num(x.item.custoMO),
        custoMAT: num(x.item.custoMAT), custoEQ: num(x.item.custoEQ)
      });
    });

    var res = _convergir(orc, sim, parcela, lista);
    _registrarJustificativas(orc, antes, lista, motivo);
    orc.fechamento = registro(sim, modoId, antes, motivo, opts);

    var avisosC = (sim.avisos || []).slice();
    /* ⚠ O ALVO NEM SEMPRE É ALCANÇÁVEL, e isso não é defeito — é aritmética.
       O menor movimento possível é 1 centavo no custo unitário, que vale
       `quantidade × 0,01 × (1+BDI)` no total. Se o item mais leve elegível tem
       120 m³, o passo mínimo é R$ 1,50: um resíduo de R$ 0,80 simplesmente não
       existe nessa moeda. Dizer isso é obrigatório — mostrar o alvo na tela e
       gravar outro número na planilha seria a pior saída possível. */
    if (Math.abs(num(res.sobra)) >= 0.01) {
      var menorQ = null;
      lista.forEach(function (x) { var q = num(x.item.quantidade); if (q > 0 && (menorQ === null || q < menorQ)) menorQ = q; });
      var passoMin = menorQ ? tr2(menorQ * 0.01 * (1 + num(sim.bdiAtual) / 100)) : 0;
      /* A saída sugerida só faz sentido se houver outra: quem JÁ está no modo
         que usa todos os itens não tem para onde mandar — ali o limite é do
         próprio orçamento, e dizer "tente distribuir em todos os itens" para
         quem acabou de fazer isso é o tipo de conselho que destrói a
         confiança na ferramenta. */
      var saida = modoId === "total"
        ? "É o limite deste orçamento: com as quantidades que ele tem, nenhuma combinação de centavos chega mais perto."
        : "Distribuir em todos os itens costuma fechar exato, porque entram itens de quantidade menor.";
      avisosC.push("Cheguei a " + fmt(num(res.atingido)) + " — " + fmt(Math.abs(num(res.sobra))) +
        (num(res.sobra) > 0 ? " abaixo" : " acima") + " do alvo. O menor ajuste possível aqui é " + fmt(passoMin) +
        " (um centavo no item de menor quantidade), então esta diferença não cabe em nenhum item. " + saida);
    }

    return { ok: true, modo: modoId, alvo: sim.alvo, atingido: res.atingido,
             itensAfetados: lista.length, sobra: res.sobra, voltas: res.voltas,
             avisos: avisosC };
  }

  /* Busca o percentual que chega mais perto do alvo. A fórmula direta
     (alvo/custo − 1) erra: ela supõe preço = custo × (1+BDI), mas quando o BDI
     entra no unitário o preço é a soma de unitários TRUNCADOS, e o erro de
     cada item se acumula — medido, R$ 92 de diferença num orçamento de R$ 400
     mil. Busca binária sobre o valor que o motor realmente devolve. */
  function _melhorBdi(orc, alvo, chute) {
    var Orc = O();
    var base = num(chute);
    var lo = Math.max(0, base - 5), hi = base + 5;
    var melhor = { pct: base, erro: Infinity };
    var testar = function (p) {
      orc.bdi.percentual = Math.round(p * 1e6) / 1e6;
      var v = num(Orc.totais(orc).precoVenda);
      var e = Math.abs(alvo - v);
      if (e < melhor.erro) melhor = { pct: orc.bdi.percentual, erro: e };
      return v;
    };
    testar(base);
    for (var i = 0; i < 60 && melhor.erro >= 0.005; i++) {
      var meio = (lo + hi) / 2;
      var v = testar(meio);
      if (v < alvo) lo = meio; else hi = meio;
      if (hi - lo < 1e-9) break;
    }
    orc.bdi.percentual = melhor.pct;
    return melhor;
  }

  function registro(sim, modoId, antes, motivo, opts) {
    return {
      em: opts.agora || (U() && U().agoraISO ? U().agoraISO() : new Date().toISOString()),
      alvo: sim.alvo, antes: antes, modo: modoId, motivo: motivo,
      valorAnterior: sim.atual, delta: sim.delta,
      por: opts.por || ""
    };
  }

  /* ⚠ O CORAÇÃO. Por que iterar em vez de multiplicar uma vez:
     o motor TRUNCA cada unitário em 2 casas. Truncar sempre puxa para BAIXO,
     e o erro de 60 itens não se cancela — ele se soma. Medido: num orçamento
     de R$ 130 mil, o fator aplicado uma vez erra o alvo em dezenas de reais,
     sempre para menos. Cada volta recalcula o fator sobre o que FALTA, e o
     resíduo final (centavos que nenhum fator alcança) vai para um item só. */
  function _convergir(orc, sim, parcela, lista) {
    var Orc = O();
    var campo = parcela || "custoUnitario";
    var voltas = 0, MAX = 12;

    for (voltas = 1; voltas <= MAX; voltas++) {
      var t = Orc.totais(orc);
      var falta = sim.alvo - num(t.precoVenda);
      if (Math.abs(falta) < 0.005) break;

      var fatorBdi = 1 + num(t.bdiPercentual) / 100;
      var faltaCusto = fatorBdi > 0 ? (falta / fatorBdi) : falta;
      var baseAtual = baseDe(orc, parcela);
      if (!(baseAtual > 0)) break;
      var k = (baseAtual + faltaCusto) / baseAtual;
      if (!isFinite(k) || k <= 0) break;

      lista.forEach(function (x) {
        var it = x.item;
        var antesParcela = num(it[campo]);
        var novo = antesParcela * k;
        // não deixa nenhuma parcela virar negativa por efeito do fator
        if (novo < 0) novo = 0;
        novo = tr2(novo);
        if (parcela) {
          var dif = novo - antesParcela;
          it[campo] = novo;
          it.custoUnitario = tr2(num(it.custoUnitario) + dif);
          if (it.custoUnitario < 0) it.custoUnitario = 0;
        } else {
          /* Rateio no custo cheio. ⚠ AQUI MORAVA UM BUG: escalar as três
             parcelas e o unitário de forma independente trunca QUATRO vezes,
             e os truncamentos não fecham entre si — medido, o item de concreto
             ficou com parcelas somando 208,45 contra um unitário de 208,57.
             Doze centavos que fazem a aba Insumos e a Curva ABC mentirem.
             A correção é construir na ordem certa: escala as parcelas, e o
             unitário passa a ser a SOMA delas. Assim a coerência não depende
             de sorte de arredondamento — ela é o próprio jeito de calcular.
             Item sem parcelas discriminadas segue pelo caminho simples. */
          var razao = antesParcela > 0 ? (novo / antesParcela) : 1;
          var temParcelas = (num(it.custoMO) + num(it.custoMAT) + num(it.custoEQ)) > 0;
          if (temParcelas) {
            var soma = 0;
            ["custoMO", "custoMAT", "custoEQ"].forEach(function (p) {
              if (num(it[p]) > 0) { it[p] = tr2(num(it[p]) * razao); soma += num(it[p]); }
            });
            it.custoUnitario = tr2(soma);
          } else {
            it.custoUnitario = novo;
          }
        }
      });
    }

    var sobra = _resolverResiduo(orc, sim, parcela, lista);
    var fim = Orc.totais(orc);
    return { atingido: num(fim.precoVenda), sobra: sobra, voltas: voltas };
  }

  /* Os centavos que sobram depois da convergência. Um fator multiplicativo
     não consegue mover R$ 0,03 — mas o total tem de FECHAR, senão o usuário
     digita 150.000 e a tela mostra 149.999,97, o que destrói a confiança no
     recurso inteiro. O resíduo vai para o item de MAIOR valor: é onde ele
     representa a menor distorção percentual. */
  /* ⚠ ISTO É UM PROBLEMA DE TROCO, e a primeira versão errou por não ver isso.
     O menor movimento possível num item é UM CENTAVO no custo unitário — e
     esse centavo vale `quantidade × 0,01 × (1+BDI)` no preço final. No item de
     aço do teste (8.500 kg), um único centavo move R$ 106: não existe ajuste
     fino nele. Jogar o resíduo "no item de maior valor" (a intuição óbvia, e o
     que eu tinha feito) simplesmente NÃO MUDAVA NADA, porque o incremento
     necessário era menor que um centavo e o truncamento o engolia — o alvo
     ficava errando por R$ 5 a R$ 17, sempre para menos.
     O jeito certo é pagar o resíduo como se paga troco: com as moedas
     disponíveis, da menor para a maior. Item de quantidade PEQUENA é a moeda
     pequena — é ele que permite chegar ao centavo exato. */
  function _resolverResiduo(orc, sim, parcela, lista) {
    var Orc = O();
    var campo = parcela || "custoUnitario";

    // moedas disponíveis: o passo (em R$ de venda) de 1 centavo em cada item
    var moedas = lista.map(function (x) {
      return { it: x.item, q: num(x.item.quantidade) };
    }).filter(function (m) { return m.q > 0; });
    if (!moedas.length) return num(sim.alvo) - num(Orc.totais(orc).precoVenda);
    moedas.sort(function (a, b) { return a.q - b.q; }); // moeda pequena primeiro

    for (var passada = 0; passada < 4; passada++) {
      var t = Orc.totais(orc);
      var falta = num(sim.alvo) - num(t.precoVenda);
      if (Math.abs(falta) < 0.005) return 0;
      var fatorBdi = 1 + num(t.bdiPercentual) / 100;
      var faltaCusto = fatorBdi > 0 ? (falta / fatorBdi) : falta;
      var mexeu = false;

      for (var i = 0; i < moedas.length && Math.abs(faltaCusto) >= 0.005; i++) {
        var m = moedas[i];
        // quantos centavos no unitário deste item cobrem o que falta
        var centavos = Math.round(faltaCusto / 0.01 / m.q);
        if (!centavos) continue;
        var delta = tr2(centavos * 0.01);
        var atualC = num(m.it[campo]);
        var novoC = tr2(atualC + delta);
        if (novoC < 0) { novoC = 0; delta = tr2(novoC - atualC); }
        if (Math.abs(delta) < 0.005) continue;

        if (parcela) {
          m.it[campo] = novoC;
          m.it.custoUnitario = tr2(num(m.it.custoUnitario) + delta);
          if (m.it.custoUnitario < 0) m.it.custoUnitario = 0;
        } else {
          /* mesmo cuidado da convergência: o resíduo entra numa PARCELA e o
             unitário volta a ser a soma delas — senão é justamente o último
             centavo que descola as parcelas do total. */
          var temP = (num(m.it.custoMO) + num(m.it.custoMAT) + num(m.it.custoEQ)) > 0;
          if (temP) {
            var maiorP = "custoMAT";
            ["custoMO", "custoMAT", "custoEQ"].forEach(function (p) {
              if (num(m.it[p]) > num(m.it[maiorP])) maiorP = p;
            });
            var pNovo = tr2(num(m.it[maiorP]) + delta);
            if (pNovo < 0) pNovo = 0;
            m.it[maiorP] = pNovo;
            m.it.custoUnitario = tr2(num(m.it.custoMO) + num(m.it.custoMAT) + num(m.it.custoEQ));
          } else {
            m.it.custoUnitario = novoC;
          }
        }
        /* relê do motor em vez de deduzir: o truncamento por item faz o efeito
           real diferir da conta de guardanapo, e é o motor que manda */
        var novoFalta = num(sim.alvo) - num(Orc.totais(orc).precoVenda);
        faltaCusto = fatorBdi > 0 ? (novoFalta / fatorBdi) : novoFalta;
        mexeu = true;
      }
      if (!mexeu) break;
    }
    return tr2(num(sim.alvo) - num(Orc.totais(orc).precoVenda));
  }

  /* Cada item que mudou de preço ganha o registro do PORQUÊ. Sem isto, seis
     meses depois ninguém sabe por que aquele item está R$ 12 acima da SINAPI
     — e em obra pública isso é o que o analista pergunta primeiro. */
  function _registrarJustificativas(orc, antes, lista, motivo) {
    if (typeof Ajustes === "undefined" || !Ajustes.registrar) return;
    var porId = {};
    antes.itens.forEach(function (a) { porId[a.itemId] = a; });
    lista.forEach(function (x) {
      var a = porId[x.item.id];
      if (!a) return;
      if (Math.abs(num(x.item.custoUnitario) - a.custoUnitario) < 0.005) return;
      try {
        Ajustes.registrar(x.item, "custoUnitario", a.custoUnitario, num(x.item.custoUnitario), {
          motivo: motivo,
          fonte: x.item.baseFonte || x.item.origem || "",
          competencia: (orc && orc.competenciaSinapi) || "",
          uf: (orc && orc.uf) || ""
        });
      } catch (e) {}
    });
  }

  /* ===================================================================
   * DESFAZER — volta exatamente ao estado anterior.
   * Um recurso que mexe no preço de todos os itens SEM ter volta é um
   * recurso que ninguém usa duas vezes.
   * =================================================================== */
  function desfazer(orc) {
    var f = orc && orc.fechamento;
    if (!f || !f.antes) return { ok: false, erro: "Este orçamento não tem fechamento para desfazer." };

    if (f.modo === "bdi") {
      orc.bdi = orc.bdi || {};
      orc.bdi.percentual = num(f.antes.bdiPercentual);
    } else {
      var porEtapa = {};
      ((orc.etapas) || []).forEach(function (e) { porEtapa[e.id] = e; });
      (f.antes.itens || []).forEach(function (a) {
        var e = porEtapa[a.etapaId];
        if (!e) return;
        var it = (e.itens || []).filter(function (x) { return x.id === a.itemId; })[0];
        if (!it) return;
        it.custoUnitario = a.custoUnitario;
        it.custoMO = a.custoMO; it.custoMAT = a.custoMAT; it.custoEQ = a.custoEQ;
        // tira o selo de "alterado por você" que o fechamento criou
        try { if (typeof Ajustes !== "undefined" && Ajustes.restaurar) Ajustes.restaurar(it, "custoUnitario"); } catch (eR) {}
      });
    }
    var alvoAntigo = f.alvo;
    delete orc.fechamento;
    var Orc = O();
    return { ok: true, voltouPara: Orc ? num(Orc.totais(orc).precoVenda) : 0, alvoDesfeito: alvoAntigo };
  }

  function ativo(orc) { return !!(orc && orc.fechamento); }

  global.Fechamento = {
    MODOS: MODOS, ORDEM_MODOS: ORDEM_MODOS,
    simular: simular, aplicar: aplicar, desfazer: desfazer, ativo: ativo,
    baseDe: baseDe, itensElegiveis: itensElegiveis, elegivel: elegivel
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.Fechamento;
})(typeof window !== "undefined" ? window : globalThis);

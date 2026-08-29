/* =====================================================================
 * fisico.js — AVANÇO FÍSICO DA OBRA: por etapa, por serviço e no tempo
 *
 * POR QUE EXISTE: a "Execução física" que o cliente lê no Portal vinha do
 * ACUMULADO DAS MEDIÇÕES (`pctExecutado`). Numa obra com 36 diários lançados
 * e nenhum boletim emitido, ela mostrava **0%** — com a equipe em campo há
 * dois meses. O RDO sabia o que foi executado; o painel do cliente não lia.
 *
 * Aqui o avanço físico passa a nascer de onde o fato acontece: o diário.
 *
 * ------------------------------------------------------------------
 * AS SEIS REGRAS QUE NÃO PODEM CAIR
 *
 * 1) NÃO INVENTAR DENOMINADOR. Sem quantidade prevista não existe "%".
 *    Serviço sem previsto entra no relatório como quantidade executada e
 *    fica FORA da conta do percentual — e o número de itens de fora é
 *    devolvido, para a tela poder dizer "22% (3 serviços sem quantidade
 *    prevista ficaram de fora)". Espremer esses itens num zero implícito
 *    puxaria a obra inteira para baixo; contá-los como 100% empurraria
 *    para cima. As duas mentiras são piores que a lacuna declarada.
 *
 * 2) NÃO SOMAR UNIDADES DIFERENTES. 200 m² + 50 m³ = 250 do quê? A soma de
 *    quantidade só sai POR UNIDADE. O que atravessa unidades é o
 *    percentual ponderado — e só ele.
 *
 * 3) O PESO É FINANCEIRO QUANDO DÁ, E ISSO É DITO. 1 m² de pintura não vale
 *    o mesmo que 1 m³ de concreto: média simples de percentuais faz a obra
 *    "andar" pintando parede. Quando existe preço do item (orçamento ou
 *    tabela da obra), o peso é `qtdPrevista × valorUnitário`; quando não
 *    existe, é média simples — e a base usada vai carimbada no resultado
 *    (`base: "financeira" | "simples"`), porque um cliente que compara dois
 *    meses precisa saber se a régua mudou.
 *
 * 4) ITEM NÃO PASSA DE 100% NA CONTA DA OBRA. Executar 210 de 200 previstos
 *    é fato e aparece — mas não pode empurrar o total da obra acima do que
 *    ela é. Na agregação cada item entra aparado em 100%; o excedente vai
 *    separado, em `excedentes`, para quem lê saber que houve.
 *
 * 5) PREVISTO É O MAIOR JÁ VISTO, NÃO A SOMA. O mesmo serviço se repete em
 *    todo diário carregando a quantidade prevista junto; somar daria
 *    "200 m² × número de dias". (Mesma regra de `Avanco.resumoObra`.)
 *
 * 6) ETAPA VAZIA NÃO VIRA OUTRA COISA EM SILÊNCIO. Serviço sem etapa cai em
 *    "Sem etapa", visível e contável — para o usuário ver que precisa
 *    classificar, em vez de o número aparecer diluído numa etapa errada.
 *
 * ------------------------------------------------------------------
 * IDENTIDADE DE SERVIÇO é a de `Avanco.chaveServico` — vínculo (origem+refId)
 * primeiro, depois código, depois descrição, SEMPRE com a unidade junto. Duas
 * chaves diferentes na mesma casa fariam o preço de um serviço ponderar outro,
 * que é exatamente o defeito que a folha por produção já pagou caro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Av = global.Avanco;
  if (!Av && typeof require !== "undefined") { try { Av = require("./avancoservico.js"); } catch (e) {} }

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
  function normal(s) {
    var t = texto(s).toLowerCase();
    if (t.normalize) t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return t.replace(/\s+/g, " ");
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function pct1(n) { return Math.round(n * 10) / 10; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  var SEM_ETAPA = "Sem etapa";

  /* -------------------------------------------------------------------
   * A CHAVE DO SERVIÇO é a de `Avanco.chaveServico`. SEM CÓPIA LOCAL.
   *
   * ⚠ Havia aqui um fallback que repetia a mesma ordem de desempate "para o
   * caso de o motor não estar carregado". A mutação provou o que ele era:
   * código morto — o `Avanco` sempre está carregado, então o fallback nunca
   * rodava e nenhum teste o alcançava. Duas cópias da regra de identidade,
   * uma delas sem cobertura, é exatamente o que o cabeçalho deste módulo
   * proíbe: bastava alguém "melhorar" uma das duas para o peso de um serviço
   * passar a ponderar outro. Se o motor faltar, é para quebrar alto na hora
   * de carregar — não para calcular percentual por uma segunda régua secreta.
   * ----------------------------------------------------------------- */
  if (!Av || !Av.chaveServico) {
    throw new Error("fisico.js exige avancoservico.js carregado antes (identidade de serviço).");
  }
  function chave(it) { return Av.chaveServico(it); }

  /* -------------------------------------------------------------------
   * PREÇOS: o que dá peso financeiro ao percentual.
   *
   * Aceita itens do orçamento e/ou linhas da tabela de preços da obra, em
   * qualquer mistura. O índice tem três entradas por preço — chave cheia,
   * código+unidade e descrição+unidade — porque a tabela de preços da obra
   * não tem `refId` e mesmo assim precisa achar o serviço lançado no diário.
   * ----------------------------------------------------------------- */
  function indicePrecos(precos) {
    var idx = {};
    function por(k, v) { if (k && idx[k] === undefined) idx[k] = v; }
    (precos || []).forEach(function (p) {
      if (!p) return;
      var vu = num(p.valorUnitario != null ? p.valorUnitario : p.precoUnitario);
      if (!(vu > 0)) return;
      var un = normal(p.unidade);
      por(chave(p), vu);
      var cod = texto(p.codigo) || texto(p.numero);
      if (cod) por("c|" + normal(cod) + "|" + un, vu);
      var d = normal(p.descricao);
      if (d) por("d|" + d + "|" + un, vu);
    });
    return idx;
  }
  /* Acha o preço do item lançado no diário tentando, em ordem, as mesmas três
     portas. Devolve 0 quando não achou — e quem chama trata isso como "este
     item não tem peso financeiro", nunca como "custa zero".

     ⚠ ISTO SÓ FUNCIONA PORQUE A LINHA CONSOLIDADA GUARDA O `refId`.
     Ela não guardava: `porServico` montava a linha com descrição, número e
     unidade, e o vínculo com a fonte ficava para trás. Aí `chave(linha)`
     caía direto na porta da descrição, e preço vindo do ORÇAMENTO — que é
     indexado por `r|orcamento|<refId>|<un>` e muitas vezes não tem descrição
     no cadastro de preço — NUNCA casava. A ponderação financeira desabava
     calada para média simples: a obra "andava" pintando parede, com o
     percentual errado na cara do cliente e nada acendendo em lugar nenhum.
     É o pior formato de defeito que este sistema conhece, e só apareceu
     quando um teste comparou a conta do app com a conta que o Portal refaz.

     A invariante que segura isso é `chave(linha) === linha.chave` — testada
     em test-fisico.js. Enquanto ela valer, qualquer caminho até o preço dá
     no mesmo lugar. */
  function precoDe(idx, it) {
    if (!idx || !it) return 0;
    var un = normal(it.unidade);
    var k = chave(it);
    if (k && idx[k] !== undefined) return idx[k];
    var cod = texto(it.numero) || texto(it.codigo);
    if (cod) { var kc = "c|" + normal(cod) + "|" + un; if (idx[kc] !== undefined) return idx[kc]; }
    var d = normal(it.descricao);
    if (d) { var kd = "d|" + normal(d) + "|" + un; if (idx[kd] !== undefined) return idx[kd]; }
    return 0;
  }

  /* -------------------------------------------------------------------
   * CONSOLIDAÇÃO POR SERVIÇO — a base de tudo o que vem depois.
   *
   * Varre os diários da obra e devolve UMA linha por serviço, com etapa,
   * previsto (o maior visto), executado (a soma), peso financeiro e os
   * lançamentos que o compõem (data + quantidade), que é o que permite
   * filtrar por dia/semana/mês sem varrer os diários de novo.
   * ----------------------------------------------------------------- */
  function porServico(rdos, obraId, opc) {
    var o = opc || {};
    var idx = indicePrecos(o.precos);
    var estados = (o.estados && o.estados.length) ? o.estados : null;
    var mapa = {}, ordem = [];

    (rdos || []).forEach(function (r) {
      if (!r) return;
      if (obraId && texto(r.obraId) !== texto(obraId)) return;
      if (o.ate && texto(r.data) && texto(r.data) > o.ate) return;
      if (o.de && texto(r.data) && texto(r.data) < o.de) return;
      if (estados) {
        var e = texto(r.estado) || texto(r.status);
        if (estados.indexOf(e) < 0) return;
      }
      (r.atividadesItens || r.servicos || r.ativ || []).forEach(function (it) {
        var k = chave(it);
        if (!k) return;
        if (!mapa[k]) {
          mapa[k] = {
            chave: k, etapa: texto(it.etapa) || SEM_ETAPA,
            descricao: texto(it.descricao), numero: texto(it.numero) || texto(it.codigo),
            unidade: texto(it.unidade), origem: texto(it.origem),
            /* o vínculo com a fonte VIAJA JUNTO: sem ele a linha consolidada
               não consegue mais achar o próprio preço (ver `precoDe`) */
            refId: texto(it.refId), codigo: texto(it.codigo),
            previsto: 0, executado: 0, refeito: 0, lancamentos: []
          };
          ordem.push(k);
        }
        var L = mapa[k];
        /* a etapa só é preenchida se ainda não havia uma: diário mais antigo
           sem classificação não pode apagar a etapa que alguém já corrigiu */
        if (L.etapa === SEM_ETAPA && texto(it.etapa)) L.etapa = texto(it.etapa);
        var prev = num(it.qtdPrevista);
        if (prev > L.previsto) L.previsto = prev;   // regra 5
        var q = num(it.qtdExecutada);
        /* ⚠ REFAZER NÃO É AVANÇAR — E ESTE ARQUIVO QUASE FICOU DE FORA.
         * `js/avancoservico.js` passou a excluir o que está marcado como
         * "Retrabalho" do acumulado (a quantidade refeita não é obra nova, e
         * contá-la de novo infla o físico). Mas quem monta o pacote do PORTAL
         * DO CLIENTE, a curva S, a previsão de término e o Painel é ESTE
         * arquivo — e ele não tinha a regra.
         * O resultado seria pior que o defeito original: numa parede de
         * 200 m² com 100 executados e 60 refeitos, o engenheiro veria 50% na
         * tela dele e o cliente veria 80% no Portal, no mesmo dia, na mesma
         * obra. Antes os dois diziam 80% — errado, mas IGUAIS.
         * Conserto pela metade em dois arquivos é duas verdades. */
        if (q && texto(it.situacao) === "retrabalho") {
          L.refeito = r2((L.refeito || 0) + q);
          return;
        }
        if (q) {
          L.executado = r2(L.executado + q);
          L.lancamentos.push({ data: texto(r.data), rdoId: texto(r.id), numero: texto(r.numero), qtd: q });
        }
      });
    });

    return ordem.map(function (k) {
      var L = mapa[k];
      L.valorUnitario = precoDe(idx, L);
      /* peso financeiro do serviço no bolo da obra. Sem previsto não há peso:
         não se sabe quanto o serviço representa do todo. */
      L.peso = (L.valorUnitario > 0 && L.previsto > 0) ? r2(L.valorUnitario * L.previsto) : 0;
      L.temPeso = L.peso > 0;
      L.temPrevisto = L.previsto > 0;
      L.saldo = L.temPrevisto ? r2(L.previsto - L.executado) : 0;
      L.pct = L.temPrevisto ? pct1((L.executado / L.previsto) * 100) : null;   // regra 1
      L.excedeu = L.temPrevisto && L.executado > L.previsto;
      L.excedente = L.excedeu ? r2(L.executado - L.previsto) : 0;
      L.concluido = L.temPrevisto && L.executado >= L.previsto;
      L.lancamentos.sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); });
      return L;
    }).sort(function (a, b) {
      if (a.etapa !== b.etapa) return a.etapa.localeCompare(b.etapa, "pt-BR");
      var na = a.numero || "", nb = b.numero || "";
      if (na && nb && na !== nb) return na.localeCompare(nb, "pt-BR", { numeric: true });
      return a.descricao.localeCompare(b.descricao, "pt-BR");
    });
  }

  /* -------------------------------------------------------------------
   * O PERCENTUAL PONDERADO de um conjunto de serviços.
   *
   * Devolve `{ pct, base, ... }` — e `pct: null` quando não há um único
   * serviço com quantidade prevista. Nesse caso a tela mostra "—", não "0%":
   * "0%" afirma que nada foi feito, e o que se sabe é que não dá para medir.
   * ----------------------------------------------------------------- */
  function ponderar(linhas) {
    var comPrev = (linhas || []).filter(function (l) { return l.temPrevisto; });
    var semPrev = (linhas || []).filter(function (l) { return !l.temPrevisto; });
    if (!comPrev.length) {
      return { pct: null, base: "indisponivel", itens: 0, itensSemPrevisto: semPrev.length,
               pesoTotal: 0, pesoExecutado: 0, itensSemPeso: 0, excedentes: 0 };
    }
    var comPeso = comPrev.filter(function (l) { return l.temPeso; });
    /* A régua financeira só vale quando a maior parte do previsto tem preço.
       Ponderar 3 itens por R$ e os outros 40 por média simples produziria um
       número que não é nem uma coisa nem outra. */
    var financeira = comPeso.length >= Math.ceil(comPrev.length * 0.6);
    var pesoTotal = 0, pesoExec = 0, excedentes = 0;

    comPrev.forEach(function (l) {
      var p = financeira ? (l.temPeso ? l.peso : 0) : 1;
      if (!p) return;                                    // sem preço, fica fora da régua financeira
      var fracao = Math.min(1, l.executado / l.previsto); // regra 4: aparado em 100%
      pesoTotal += p;
      pesoExec += p * fracao;
      if (l.excedeu) excedentes++;
    });
    if (!(pesoTotal > 0)) {
      return { pct: null, base: "indisponivel", itens: comPrev.length, itensSemPrevisto: semPrev.length,
               pesoTotal: 0, pesoExecutado: 0, itensSemPeso: comPrev.length, excedentes: excedentes };
    }
    return {
      pct: pct1((pesoExec / pesoTotal) * 100),
      base: financeira ? "financeira" : "simples",
      itens: comPrev.length,
      itensSemPrevisto: semPrev.length,
      itensSemPeso: financeira ? (comPrev.length - comPeso.length) : comPrev.length,
      pesoTotal: r2(pesoTotal), pesoExecutado: r2(pesoExec),
      excedentes: excedentes
    };
  }

  /* -------------------------------------------------------------------
   * AGRUPAMENTO POR ETAPA — o que o cliente pediu para ver no painel.
   *
   * Cada etapa traz o seu próprio percentual ponderado, a quantidade
   * acumulada POR UNIDADE (regra 2) e os serviços dentro dela.
   * ----------------------------------------------------------------- */
  /* -------------------------------------------------------------------
   * `porEtapa` e `serie` aceitam OU a lista crua de diários OU a lista já
   * consolidada por `porServico` — quem monta o pacote do Portal consolida
   * uma vez e reusa, em vez de varrer os diários quatro vezes.
   *
   * ⚠ ISTO JÁ QUEBROU: `serie` reconsolidava sempre, e ao receber a lista
   * pronta (que não tem `atividadesItens`) devolvia ZERO períodos. O gráfico
   * do cliente chegava vazio, sem erro em lugar nenhum — o mesmo formato de
   * defeito do `latest.json` e do instalador. A detecção mora aqui, uma vez
   * só, para não haver duas opiniões sobre o que é uma lista consolidada.
   * ----------------------------------------------------------------- */
  function consolidado(x) {
    return !!(x && typeof x === "object" && x.chave && Array.isArray(x.lancamentos));
  }
  function consolidar(rdos, obraId, opc) {
    if (Array.isArray(rdos) && rdos.length && consolidado(rdos[0])) return rdos;
    return porServico(rdos, obraId, opc);
  }

  function porEtapa(rdos, obraId, opc) {
    var linhas = consolidar(rdos, obraId, opc);
    var mapa = {}, ordem = [];
    linhas.forEach(function (l) {
      var e = l.etapa || SEM_ETAPA;
      if (!mapa[e]) { mapa[e] = { etapa: e, itens: [], unidades: {} }; ordem.push(e); }
      mapa[e].itens.push(l);
      var un = l.unidade || "un";
      if (!mapa[e].unidades[un]) mapa[e].unidades[un] = { unidade: un, previsto: 0, executado: 0 };
      mapa[e].unidades[un].previsto = r2(mapa[e].unidades[un].previsto + l.previsto);
      mapa[e].unidades[un].executado = r2(mapa[e].unidades[un].executado + l.executado);
    });
    /* "Sem etapa" sempre por último: é lacuna de cadastro, não é etapa da obra */
    ordem.sort(function (a, b) {
      if (a === SEM_ETAPA) return 1;
      if (b === SEM_ETAPA) return -1;
      return a.localeCompare(b, "pt-BR");
    });
    var totalPeso = 0;
    ordem.forEach(function (e) { mapa[e].itens.forEach(function (l) { totalPeso += l.peso; }); });

    return ordem.map(function (e) {
      var g = mapa[e];
      var p = ponderar(g.itens);
      var pesoEtapa = 0;
      g.itens.forEach(function (l) { pesoEtapa += l.peso; });
      return {
        etapa: e,
        pct: p.pct, base: p.base,
        servicos: g.itens.length,
        itensSemPrevisto: p.itensSemPrevisto,
        excedentes: p.excedentes,
        concluidos: g.itens.filter(function (l) { return l.concluido; }).length,
        /* quanto ESTA etapa representa da obra (só quando há peso financeiro em
           tudo o que dá) — é o que permite ao cliente ver que "Fundação" pesa
           18% e "Pintura" 3%, em vez de as duas parecerem iguais na lista */
        pesoRelativo: totalPeso > 0 ? pct1((pesoEtapa / totalPeso) * 100) : null,
        unidades: Object.keys(g.unidades).map(function (u) {
          var x = g.unidades[u];
          x.pct = x.previsto > 0 ? pct1((x.executado / x.previsto) * 100) : null;
          x.saldo = x.previsto > 0 ? r2(x.previsto - x.executado) : 0;
          return x;
        }),
        itens: g.itens
      };
    });
  }

  /* -------------------------------------------------------------------
   * O NÚMERO DO CABEÇALHO — "Execução física: X% concluído do total previsto"
   * ----------------------------------------------------------------- */
  function pctObra(rdos, obraId, opc) {
    var linhas = consolidar(rdos, obraId, opc);
    var p = ponderar(linhas);
    p.servicos = linhas.length;
    p.aviso = avisoDaBase(p);
    return p;
  }
  /* A frase honesta sobre COMO o número foi feito. Vai à tela do cliente —
     quem compara dois meses precisa saber se a régua mudou no meio. */
  function avisoDaBase(p) {
    if (!p || p.pct === null) return "Ainda não há serviço com quantidade prevista lançada — sem isso não existe percentual a calcular.";
    var f = p.base === "financeira"
      ? "Percentual ponderado pelo peso de cada serviço no orçamento."
      : "Percentual pela média dos serviços (esta obra não tem preço unitário cadastrado para ponderar).";
    var extras = [];
    if (p.itensSemPrevisto) extras.push(p.itensSemPrevisto + " serviço(s) sem quantidade prevista ficaram de fora da conta");
    if (p.base === "financeira" && p.itensSemPeso) extras.push(p.itensSemPeso + " sem preço cadastrado ficaram de fora da ponderação");
    if (p.excedentes) extras.push(p.excedentes + " serviço(s) passaram da quantidade prevista");
    return f + (extras.length ? " " + extras.join("; ") + "." : "");
  }

  /* -------------------------------------------------------------------
   * O TEMPO — série por dia, semana ou mês.
   *
   * A semana usa a MESMA chave do Last Planner (a data da segunda-feira):
   * duas numerações de semana no mesmo sistema fariam o relatório semanal do
   * cliente discordar do PPC da equipe, sobre a mesma semana.
   *
   * ⚠ Data ISO vira Date pelo construtor LOCAL (`new Date(a, m-1, d)`).
   * `new Date("2026-08-09")` é meia-noite UTC — no fuso do Brasil isso é dia
   * 8 às 21h, e a segunda-feira calculada sairia uma semana atrás em toda
   * data que caísse na segunda.
   * ----------------------------------------------------------------- */
  function dataLocal(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    if (p.length !== 3) return null;
    var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    return isFinite(d.getTime()) ? d : null;
  }
  function segundaDe(iso) {
    var d = dataLocal(iso); if (!d) return "";
    var dow = d.getDay();                       // 0=domingo
    d.setDate(d.getDate() - ((dow + 6) % 7));    // recua até a segunda
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function balde(iso, gran) {
    var s = String(iso || "").slice(0, 10);
    if (!s) return "";
    if (gran === "mes") return s.slice(0, 7);
    if (gran === "semana") return segundaDe(s);
    return s;
  }
  function rotuloBalde(chaveB, gran) {
    if (!chaveB) return "";
    if (gran === "mes") {
      var p = chaveB.split("-");
      var nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      return (nomes[(+p[1]) - 1] || p[1]) + "/" + p[0];
    }
    var d = dataLocal(chaveB); if (!d) return chaveB;
    var dia = pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1);
    if (gran === "semana") {
      var f = new Date(d.getTime()); f.setDate(f.getDate() + 6);
      return dia + "–" + pad2(f.getDate()) + "/" + pad2(f.getMonth() + 1);
    }
    return dia;
  }

  /* `serie` devolve, para cada período: quanto andou (em peso, quando há), o
     acumulado até ali, quantos diários e a quantidade por unidade. */
  function serie(rdos, obraId, opc) {
    var o = opc || {};
    var gran = o.granularidade || "dia";
    var linhas = consolidar(rdos, obraId, { precos: o.precos, estados: o.estados, de: o.de, ate: o.ate });
    var geral = ponderar(linhas);
    /* denominador do acumulado: o MESMO da conta do cabeçalho, senão a curva
       do período e o número grande da tela contariam histórias diferentes */
    var financeira = geral.base === "financeira";
    var pesoDe = {}, previstoDe = {}, unidadeDe = {}, etapaDe = {};
    var pesoTotal = 0;
    linhas.forEach(function (l) {
      if (!l.temPrevisto) return;
      var p = financeira ? (l.temPeso ? l.peso : 0) : 1;
      pesoDe[l.chave] = p; previstoDe[l.chave] = l.previsto;
      unidadeDe[l.chave] = l.unidade; etapaDe[l.chave] = l.etapa;
      pesoTotal += p;
    });

    var baldes = {}, ordem = [];
    /* Aparar em 100% aqui exige acompanhar o acumulado POR SERVIÇO ao longo do
       tempo: o excedente do dia 20 não pode entrar na curva como avanço, senão
       a curva passa de 100% enquanto o cabeçalho (que apara) não passa. */
    var acumServ = {};
    var todos = [];
    linhas.forEach(function (l) {
      l.lancamentos.forEach(function (x) { todos.push({ chave: l.chave, data: x.data, qtd: x.qtd, rdoId: x.rdoId }); });
    });
    todos.sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); });

    todos.forEach(function (x) {
      var b = balde(x.data, gran); if (!b) return;
      if (!baldes[b]) {
        baldes[b] = { chave: b, rotulo: rotuloBalde(b, gran), inicio: gran === "mes" ? b + "-01" : b,
                      pesoPeriodo: 0, diarios: {}, unidades: {}, etapas: {}, lancamentos: 0 };
        ordem.push(b);
      }
      var B = baldes[b];
      B.lancamentos++;
      if (x.rdoId) B.diarios[x.rdoId] = 1;
      var un = unidadeDe[x.chave] || "un";
      if (!B.unidades[un]) B.unidades[un] = 0;
      B.unidades[un] = r2(B.unidades[un] + x.qtd);
      var et = etapaDe[x.chave] || SEM_ETAPA;
      if (!B.etapas[et]) B.etapas[et] = 0;
      B.etapas[et] = r2(B.etapas[et] + x.qtd);

      var prev = previstoDe[x.chave];
      var p = pesoDe[x.chave];
      if (prev > 0 && p > 0) {
        var antes = acumServ[x.chave] || 0;
        var depois = antes + x.qtd;
        var fAntes = Math.min(1, antes / prev), fDepois = Math.min(1, depois / prev);
        acumServ[x.chave] = depois;
        B.pesoPeriodo += p * (fDepois - fAntes);   // só o que ainda cabia dentro dos 100%
      }
    });

    ordem.sort();
    var acum = 0;
    return {
      granularidade: gran, base: geral.base, pct: geral.pct,
      periodos: ordem.map(function (b) {
        var B = baldes[b];
        acum += B.pesoPeriodo;
        return {
          chave: B.chave, rotulo: B.rotulo, inicio: B.inicio,
          diarios: Object.keys(B.diarios).length,
          lancamentos: B.lancamentos,
          pctPeriodo: pesoTotal > 0 ? pct1((B.pesoPeriodo / pesoTotal) * 100) : null,
          pctAcumulado: pesoTotal > 0 ? pct1((acum / pesoTotal) * 100) : null,
          unidades: Object.keys(B.unidades).map(function (u) { return { unidade: u, qtd: B.unidades[u] }; }),
          etapas: Object.keys(B.etapas).map(function (e) { return { etapa: e, qtd: B.etapas[e] }; })
                    .sort(function (a, c) { return c.qtd - a.qtd; })
        };
      })
    };
  }

  /* -------------------------------------------------------------------
   * O PACOTE COMPLETO — é o que o snapshot do Portal carrega.
   *
   * `pesos` sai NORMALIZADO (fração de 0 a 1, somando 1). O portal precisa do
   * peso para recalcular o percentual a cada filtro que o cliente aplica; o
   * que ele NÃO pode receber é o preço unitário, que é margem. A fração dá a
   * conta certa sem revelar o valor.
   * ----------------------------------------------------------------- */
  function pacote(rdos, obraId, opc) {
    var o = opc || {};
    var linhas = consolidar(rdos, obraId, o);
    var geral = ponderar(linhas);
    geral.servicos = linhas.length;
    geral.aviso = avisoDaBase(geral);

    var financeira = geral.base === "financeira";
    var somaPeso = 0;
    linhas.forEach(function (l) { if (l.temPrevisto) somaPeso += financeira ? (l.temPeso ? l.peso : 0) : 1; });
    var pesos = {};
    linhas.forEach(function (l) {
      if (!l.temPrevisto) return;
      var p = financeira ? (l.temPeso ? l.peso : 0) : 1;
      pesos[l.chave] = somaPeso > 0 ? Math.round((p / somaPeso) * 1e6) / 1e6 : 0;
    });

    return {
      pct: geral.pct, base: geral.base, aviso: geral.aviso,
      servicos: geral.servicos, itensSemPrevisto: geral.itensSemPrevisto,
      itensSemPeso: geral.itensSemPeso, excedentes: geral.excedentes,
      etapas: porEtapa(linhas, obraId, o).map(function (e) {
        /* sem os itens crus: o portal remonta os serviços a partir dos diários
           publicados, e mandar a lista duas vezes só engorda o snapshot */
        return { etapa: e.etapa, pct: e.pct, base: e.base, servicos: e.servicos,
                 concluidos: e.concluidos, excedentes: e.excedentes,
                 itensSemPrevisto: e.itensSemPrevisto, pesoRelativo: e.pesoRelativo,
                 unidades: e.unidades };
      }),
      pesos: pesos,
      /* as três granularidades vão prontas: são baratas de gerar aqui e o
         portal precisa delas para trocar de filtro sem pedir nada ao servidor */
      serieDia: serie(linhas, obraId, { granularidade: "dia", precos: o.precos }),
      serieSemana: serie(linhas, obraId, { granularidade: "semana", precos: o.precos }),
      serieMes: serie(linhas, obraId, { granularidade: "mes", precos: o.precos })
    };
  }

  /* -------------------------------------------------------------------
   * PREVISÃO DE TÉRMINO — a pergunta que o cliente realmente faz
   *
   * O painel mostrava a data do CONTRATO e mais nada. Quem acompanha uma obra
   * quer saber outra coisa: **no ritmo de hoje, quando acaba?**
   *
   * ⚠ A ARMADILHA QUE TORNA TODA PROJEÇÃO DE OBRA MENTIROSA:
   * medir o ritmo pelas semanas em que se TRABALHOU. Uma equipe que produziu
   * 8% em duas semanas, mas ficou parada nas outras seis, tem ritmo de 1%/
   * semana — não de 4%. Dividir pelo número de semanas COM LANÇAMENTO produz
   * uma data bonita e falsa, e é exatamente o número que vira discussão
   * contratual. Aqui o denominador é o calendário: da primeira semana com
   * avanço até a última, inteiro, buracos incluídos.
   *
   * O que sai é uma FAIXA, nunca um número só:
   *   otimista  — ritmo das últimas 4 semanas (a obra como está agora)
   *   provável  — o menor entre os dois ritmos (o conservador)
   *   pessimista— ritmo desde o início (carrega as paradas que já houve)
   *
   * E `ok:false` com motivo sempre que não houver base: obra sem percentual,
   * ritmo zero ou negativo, menos de 3 semanas de histórico. Projeção sem
   * base não é estimativa, é chute com cara de dado.
   * ----------------------------------------------------------------- */
  function diffSemanas(isoA, isoB) {
    var a = dataLocal(isoA), b = dataLocal(isoB);
    if (!a || !b) return 0;
    return (b.getTime() - a.getTime()) / (7 * 86400000);
  }
  function somaDias(iso, dias) {
    var d = dataLocal(iso); if (!d) return "";
    d.setDate(d.getDate() + Math.round(dias));
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  /* ritmo (% por semana) entre dois pontos da série, com o calendário como
     denominador — ver ⚠ acima */
  function ritmoEntre(periodos, iAlvo, iFim) {
    if (iAlvo < 0 || iFim <= iAlvo) return 0;
    var p0 = periodos[iAlvo], p1 = periodos[iFim];
    if (!p0 || !p1 || p0.pctAcumulado === null || p1.pctAcumulado === null) return 0;
    var sem = diffSemanas(p0.chave, p1.chave);
    if (!(sem > 0)) return 0;
    return (p1.pctAcumulado - p0.pctAcumulado) / sem;
  }

  function previsao(serieSemana, opc) {
    var o = opc || {};
    var ps = (serieSemana && serieSemana.periodos) || [];
    var pctAtual = o.pct;
    var vazio = function (motivo, txt) {
      return { ok: false, motivo: motivo, explicacao: txt, pct: pctAtual == null ? null : pctAtual };
    };
    if (pctAtual === null || pctAtual === undefined) {
      return vazio("sem-percentual", "Não há serviço com quantidade prevista lançada — sem isso não existe percentual, e sem percentual não há como projetar prazo.");
    }
    if (pctAtual >= 100) {
      return { ok: true, concluida: true, pct: pctAtual, explicacao: "Os serviços acompanhados já atingiram 100% do previsto." };
    }
    if (ps.length < 3) {
      return vazio("historico-curto", "Ainda são poucos diários para estimar ritmo. A projeção aparece a partir de 3 semanas com lançamento.");
    }

    var ult = ps.length - 1;
    /* últimas 4 semanas de CALENDÁRIO (não os últimos 4 baldes: quatro baldes
       podem cobrir dez semanas se a obra ficou parada no meio) */
    var i4 = 0, i12 = 0, k;
    for (k = ult; k >= 0; k--) { if (diffSemanas(ps[k].chave, ps[ult].chave) >= 4) { i4 = k; break; } }
    for (k = ult; k >= 0; k--) { if (diffSemanas(ps[k].chave, ps[ult].chave) >= 12) { i12 = k; break; } }
    var rRecente = ritmoEntre(ps, i4, ult);
    var rLongo = ritmoEntre(ps, 0, ult);
    var rMedio = ritmoEntre(ps, i12, ult);

    var otimista = Math.max(rRecente, rMedio, rLongo);
    var pessimista = Math.min.apply(null, [rRecente, rMedio, rLongo].filter(function (r) { return r > 0; }).concat([Infinity]));
    if (!isFinite(pessimista)) pessimista = 0;
    /* o PROVÁVEL é o conservador de propósito: numa obra, quem promete pelo
       melhor ritmo entrega atrasado — e a projeção vai à tela do cliente */
    var provavel = pessimista > 0 ? pessimista : otimista;

    if (!(otimista > 0)) {
      return vazio("sem-ritmo", "Não houve avanço registrado nas últimas semanas, então não há ritmo para projetar. Assim que voltarem os lançamentos, a projeção reaparece.");
    }

    var restante = 100 - pctAtual;
    var base = ps[ult].chave;                 // a semana do último lançamento
    function dataPara(r) { return r > 0 ? somaDias(base, (restante / r) * 7) : ""; }
    var dProv = dataPara(provavel), dOtm = dataPara(otimista), dPes = dataPara(pessimista);
    var semRest = Math.ceil(restante / provavel);

    /* ⚠ PROJEÇÃO CORRETA E INÚTIL É PIOR QUE PROJEÇÃO NENHUMA.
     * Uma obra que andou 10% em dois meses e quase parou projeta, com toda
     * honestidade aritmética, término em 2032. O número está certo; a
     * COMUNICAÇÃO está errada — o cliente lê "2032" e conclui que o sistema
     * está com defeito, e aí ele deixa de acreditar também no que está certo.
     * Acima de 5 anos a data não vai: vai o fato ("o ritmo caiu a ponto de
     * não haver término previsível"), que é a mesma informação em linguagem
     * que se pode levar para uma reunião. */
    var LIMITE_SEMANAS = 260;
    var foraDeEscala = semRest > LIMITE_SEMANAS;

    function pctBR(n) { return String(Math.round(n * 10) / 10).replace(".", ","); }
    var out = {
      ok: true, concluida: false, pct: pctAtual,
      foraDeEscala: foraDeEscala,
      ritmoSemanal: Math.round(provavel * 100) / 100,
      ritmoOtimista: Math.round(otimista * 100) / 100,
      semanasRestantes: semRest,
      dataProvavel: foraDeEscala ? "" : dProv,
      dataOtimista: foraDeEscala ? "" : dOtm,
      dataPessimista: foraDeEscala ? "" : dPes,
      baseCalculo: base, semanasHistorico: Math.round(diffSemanas(ps[0].chave, ps[ult].chave) * 10) / 10,
      explicacao: foraDeEscala
        ? ("No ritmo das últimas semanas (" + pctBR(provavel) + "% por semana) não há data de término previsível. "
           + "O avanço registrado caiu muito em relação ao que falta executar — vale conversar com a equipe sobre o que travou.")
        : ("Projeção pelo ritmo de " + pctBR(provavel) + "% por semana observado nos diários, contando o calendário inteiro (semanas paradas incluídas).")
    };
    /* desvio em relação ao término CONTRATADO — é isso que vira conversa */
    if (o.termino && dProv && !foraDeEscala) {
      var dias = Math.round(diffSemanas(o.termino, dProv) * 7);
      out.terminoContrato = o.termino;
      out.desvioDias = dias;
      out.situacao = dias > 7 ? "atrasada" : (dias < -7 ? "adiantada" : "no-prazo");
    } else if (foraDeEscala && o.termino) {
      out.terminoContrato = o.termino;
      out.situacao = "sem-ritmo-para-projetar";
    } else {
      out.situacao = "sem-referencia";
    }
    return out;
  }

  var Fisico = {
    SEM_ETAPA: SEM_ETAPA,
    previsao: previsao, somaDias: somaDias, diffSemanas: diffSemanas,
    chave: chave, indicePrecos: indicePrecos, precoDe: precoDe,
    porServico: porServico, consolidar: consolidar, ponderar: ponderar, porEtapa: porEtapa,
    pctObra: pctObra, avisoDaBase: avisoDaBase,
    segundaDe: segundaDe, balde: balde, rotuloBalde: rotuloBalde,
    serie: serie, pacote: pacote
  };
  global.Fisico = Fisico;
  if (typeof module !== "undefined" && module.exports) module.exports = Fisico;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * pleito.js — DOSSIÊ DE PRORROGAÇÃO DE PRAZO
 *
 * O sistema já tinha todas as peças e nunca as somou. Quando chove e a obra
 * para, o engenheiro tem direito a pedir aditivo de prazo — e hoje ele abre
 * diário por diário, anota "choveu 54,2 mm, 87% do dia", copia para o Word e
 * monta o pleito à mão. Numa obra de oito meses são ~240 diários.
 *
 * Este módulo consolida um período de diários num DOSSIÊ: quantos dias são
 * pleiteáveis, com que memória de cálculo, e — a parte que sustenta o
 * documento quando a fiscalização contesta — quais dias FICARAM DE FORA e por
 * quê.
 *
 * AS DUAS REGRAS QUE MANDAM AQUI, e nenhuma delas é conveniência:
 *
 *  1) DIA SEM `clima.fonte` FICA DE FORA DA SOMA. O pleito só se sustenta com
 *     clima de fonte externa verificável (o app grava `fonte: "Open-Meteo"`,
 *     js/rdo.js:317). Chuva digitada à mão pelo encarregado não é prova contra
 *     a fiscalização — é a palavra da construtora contra a do cliente. O
 *     dossiê separa os dois grupos e DIZ quantos dias ficaram de fora por
 *     falta de fonte. Somá-los calado seria montar um pleito que cai na
 *     primeira contestação — e cair uma vez contamina o documento inteiro,
 *     inclusive os dias que estavam certos.
 *
 *  2) DOMINGO E FERIADO NÃO ENTRAM, nem com 61 mm. js/rdo.js:114-125 explica:
 *     não se pleiteia dia que não seria trabalhado, e é exatamente isso que
 *     "derruba o pleito inteiro" quando a fiscalização acha um domingo na
 *     lista. O domingo continua aparecendo — na lista de DESCARTADOS, com o
 *     motivo escrito. Mostrar que você mesmo tirou o domingo vale mais do que
 *     torcer para ninguém reparar.
 *
 * ⚠ ESTE NÚMERO DIVERGE DO PORTAL DO CLIENTE, E DIVERGE DE PROPÓSITO.
 *   `loja/portal.html` já tem "Clima e dias improdutivos" com um Resumo do
 *   período — mas ele conta DIA INTEIRO pela condição salva no registro (o
 *   <select> que o usuário pode sobrescrever). O dossiê conta a FRAÇÃO do
 *   DNIT/SICRO, só de dias com fonte externa, e sem domingo. O mesmo período
 *   sai como "3 dias impraticáveis" lá e "1,75 dia pleiteável" aqui. Não é
 *   bug: são duas perguntas diferentes. Por isso o dossiê carrega o bloco
 *   `divergencia` — os dois números lado a lado e a explicação da diferença,
 *   escritos ANTES de o cliente perguntar.
 *
 * ⚠ E ESTE MÓDULO NÃO É PARA O PORTAL. `loja/portal.html:1957` fecha o
 *   relatório do cliente com ressalva deliberada ("Este relatório é
 *   informativo: prorrogação de prazo depende do que estiver previsto em
 *   contrato"). Escrever "X dias pleiteáveis" na tela do cliente é abrir
 *   negociação de aditivo sem o engenheiro na sala. O dossiê é do engenheiro.
 *
 * Módulo PURO: nada de DOM, nada de Store. Recebe dados, devolve dados.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* O motor do diário é a ÚNICA fonte do critério de chuva. Nada aqui
   * recalcula a fração DNIT/SICRO: se a fórmula mudar lá, o dossiê muda junto.
   * Copiar a tabela para cá criaria uma segunda verdade — e a segunda verdade
   * é sempre a que fica desatualizada sem ninguém perceber. */
  var RDO = global.RDO;
  if (!RDO && typeof require !== "undefined") {
    try { RDO = require("./rdo.js"); } catch (e) { /* view sem o motor: tratado abaixo */ }
  }

  var Pleito = {};
  Pleito.VERSAO = 1;

  /* ---------------------------------------------------------------
   * MOTIVOS DE DESCARTE
   *
   * Esta lista É o produto. Um pleito que só mostra os dias favoráveis é lido
   * como peça de venda; um que mostra o que foi descartado e por quê é lido
   * como trabalho técnico. A fiscalização vai procurar o domingo e o dia sem
   * fonte de qualquer jeito — melhor que ela os encontre já separados, com o
   * motivo escrito pela nossa mão.
   * --------------------------------------------------------------- */
  Pleito.MOTIVOS_DESCARTE = {
    domingo: "Domingo — dia que não seria trabalhado; o DNIT exclui, e um domingo na lista derruba o pleito inteiro.",
    feriado: "Feriado marcado no diário — dia que não seria trabalhado.",
    sem_fonte: "Chuva sem fonte externa no registro — valor digitado à mão não é prova contra a fiscalização.",
    sem_medicao: "Dia apontado como parado no diário, mas sem medição de chuva — não há o que somar.",
    abaixo_limiar: "Chuva abaixo do limiar do critério DNIT/SICRO — não gera parada pleiteável."
  };

  /* Ordem em que o motivo PRINCIPAL é escolhido quando mais de um se aplica.
   * O dia não trabalhável vem primeiro porque ele é definitivo: nem com fonte
   * perfeita aquele domingo entraria. */
  var ORDEM_MOTIVOS = ["domingo", "feriado", "sem_fonte", "sem_medicao", "abaixo_limiar"];

  /* ---------------------------------------------------------------
   * FORMATO E DATAS — só apresentação, nenhuma regra mora aqui
   * --------------------------------------------------------------- */

  /* `RDO.numBR` arredonda em 1 casa, o que é bom para um diário e ruim para um
   * pleito: 1,75333 dia sairia como "1,8" e a fiscalização conferiria a soma
   * com um número diferente do nosso. Aqui a casa decimal é do chamador. */
  Pleito.numBR = function (n, casas) {
    var c = (casas == null) ? 2 : Number(casas);
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    var s = v.toFixed(c);
    if (c > 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s.replace(".", ",");
  };

  Pleito.dataBR = function (iso) {
    var s = String(iso || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
  };

  /* Soma dias a uma data ISO. Meio-dia UTC pelo mesmo motivo de js/rdo.js:130:
   * fuso não pode virar o dia num documento que fala de datas contratuais. */
  function somarDias(iso, n) {
    var s = String(iso || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    var t = Date.parse(s + "T12:00:00Z");
    if (isNaN(t)) return "";
    return new Date(t + Number(n || 0) * 86400000).toISOString().slice(0, 10);
  }
  Pleito.somarDias = somarDias;

  /* Cinco casas é a precisão em que a tabela do DNIT casa (js/rdo.js:96) — a
   * soma tem de fechar na mesma casa que as parcelas, senão o total impresso
   * não bate com a coluna somada à mão. */
  function arred5(v) { return Math.round(Number(v || 0) * 100000) / 100000; }

  function rotuloImpedimento(id) {
    var achou = "";
    (RDO && RDO.IMPEDIMENTOS ? RDO.IMPEDIMENTOS : []).forEach(function (x) {
      if (x.id === id) achou = x.rotulo;
    });
    return achou || String(id || "");
  }

  /* ---------------------------------------------------------------
   * MEMÓRIA DE CÁLCULO DE UM DIA DE CHUVA
   *
   * ⚠ O NÚMERO FINAL SAI SEMPRE DE `RDO.fracaoDiaPerdidoPorChuva`. Os passos
   * intermediários abaixo são a leitura em voz alta do critério documentado em
   * js/rdo.js:78-108 (intensidade em 8 h = chuva ÷ 3; desconta o limiar de 5;
   * divide pela faixa de 15). Eles existem para o documento se explicar
   * sozinho — NÃO são uma segunda implementação da fórmula, e há teste
   * conferindo que o texto termina no mesmo número que o motor devolve.
   * --------------------------------------------------------------- */
  Pleito.memoriaChuva = function (clima) {
    if (!clima || !RDO) return "";
    var mm = Number(clima.chuvaMm || 0);
    var h = Number(clima.chuvaHoras || 0);
    var fracao = RDO.fracaoDiaPerdidoPorChuva(mm);
    return "Chuva de " + Pleito.numBR(mm, 1) + " mm em " + Pleito.numBR(h, 1) + " h" +
      " (fonte: " + (clima.fonte || "não informada") + ")" +
      " · intensidade em 8 h = " + Pleito.numBR(mm, 1) + " ÷ 3 = " + Pleito.numBR(mm / 3, 2) + " mm" +
      " · (" + Pleito.numBR(mm / 3, 2) + " − 5) ÷ 15 = " + Pleito.numBR(fracao, 5) +
      " do dia · critério DNIT/SICRO";
  };

  /* ---------------------------------------------------------------
   * CONSOLIDAR — a única porta de entrada do módulo
   *
   * params:
   *   rdos   [obrigatório]  lista de diários (o formato que o app grava)
   *   obra   [opcional]     { id, nome, inicio, termino } — sem ela não há
   *                         confronto com o prazo contratual
   *   obraId [opcional]     default obra.id; sem nenhum dos dois o dossiê soma
   *                         a lista inteira e AVISA (pleito é sempre de UMA obra)
   *   de / ate [opcional]   recorte ISO; default = primeiro e último diário
   * --------------------------------------------------------------- */
  Pleito.consolidar = function (params) {
    var p = params || {};
    if (!RDO) {
      return { erro: "O motor do diário (js/rdo.js) não está carregado — sem ele não há critério de chuva, e inventar um aqui seria o defeito que o RDO já pagou caro." };
    }

    var obra = p.obra || null;
    var obraId = String(p.obraId || (obra && obra.id) || "");
    var avisos = [];

    var todos = (p.rdos || []).filter(function (r) { return r && r.data; });
    var daObra = obraId
      ? todos.filter(function (r) { return String(r.obraId || "") === obraId; })
      : todos;
    if (!obraId) {
      avisos.push("Nenhuma obra informada: o dossiê somou a lista recebida inteira. Pleito de prazo é sempre de UMA obra — confira o recorte antes de imprimir.");
    }

    /* recorte: o que o usuário pediu, ou tudo o que existe */
    var datas = daObra.map(function (r) { return String(r.data); }).sort();
    var de = String(p.de || datas[0] || "");
    var ate = String(p.ate || datas[datas.length - 1] || "");
    if (de && ate && de > ate) { var tmp = de; de = ate; ate = tmp; }

    var noPeriodo = daObra.filter(function (r) {
      var d = String(r.data);
      return (!de || d >= de) && (!ate || d <= ate);
    }).sort(function (a, b) { return String(a.data) < String(b.data) ? -1 : 1; });

    /* ---------- passagem única, dia a dia ---------- */
    var linhasChuva = [];      // dias que ENTRAM na soma por chuva
    var linhasImped = [];      // dias com fato impeditivo não imputável
    var descartados = [];      // dias que pareciam pleito e não entraram
    var pendencias = [];       // o que ainda falta para cada dia se sustentar
    var somaChuva = 0;
    var somaCombinada = 0;     // com impedimento, teto de 1 dia por dia
    var somaDescartada = 0;    // fração que se perdeu no descarte
    var porMotivo = {};
    var semFonteQualquer = 0;  // conta o motivo mesmo quando ele não é o principal
    var efetivoPessoasDia = 0, efetivoHh = 0, efetivoHhOcioso = 0, diasComEfetivo = 0;
    var portalImpraticaveis = 0, portalParciais = 0;
    var naoHomologados = 0;

    noPeriodo.forEach(function (r) {
      var clima = r.clima || null;
      var naoTrabalhavel = RDO.diaNaoTrabalhavel(r);
      var ehDomingo = RDO.ehDomingo(r.data);

      /* a fração que a CHUVA sozinha daria — usada para dizer quanto se perdeu
         no descarte ("aquele domingo valia 1 dia inteiro") */
      var fracaoBruta = clima ? RDO.fracaoDiaPerdidoPorChuva(clima.chuvaMm) : 0;

      /* `condicaoPorClima` já devolvia `fracaoPerdida` — zerada em dia não
         trabalhável — e NENHUM código de produção lia esse campo. É ele que o
         dossiê consome; a duplicação da regra do domingo aqui seria a forma
         mais fácil de os dois lugares discordarem no futuro. */
      var cond = clima ? RDO.condicaoPorClima(clima, naoTrabalhavel) : null;
      var fracaoClima = cond ? Number(cond.fracaoPerdida || 0) : 0;

      /* A REGRA DE OURO. Sem fonte externa a fração não entra na soma — nem
         como parcela pequena, nem "só para constar". */
      var temFonte = !!(clima && String(clima.fonte || "").trim());
      var fracaoContada = temFonte ? fracaoClima : 0;

      /* impedimento não imputável: a lista de js/rdo.js:770 é declaradamente de
         fatos NÃO imputáveis a quem executa */
      var ids = (r.impedimentos || []).filter(Boolean);
      var houvePar = !!(r.paralisacao && r.paralisacao.houve);
      var horasParadas = 0;
      (r.ocorrenciasItens || []).forEach(function (o) { horasParadas += Number((o && o.horasParadas) || 0); });

      /* ⚠ IMPEDIMENTO SÓ VIRA DIA INTEIRO QUANDO A PARALISAÇÃO ESTÁ REGISTRADA.
       * "Frente não liberada" pode ter custado o dia todo ou duas horas — o
       * diário não diz. Converter o impedimento em dia cheio por conta própria
       * seria inventar o número mais caro do documento. Quando o diário
       * registra a paralisação (`paralisacao.houve`, com motivo obrigatório em
       * js/gestao.js:12185), aí sim o dia inteiro está documentado. */
      var paradoPorImpedimento = ids.length > 0 && houvePar && !naoTrabalhavel;

      /* teto de 1 dia: um dia com 0,87 de chuva E paralisação por frente não
         liberada não vira 1,87 dia. Somar duas causas no mesmo dia é o erro
         que a fiscalização acha em trinta segundos. */
      var fracaoDia = Math.min(1, arred5(fracaoContada + (paradoPorImpedimento ? 1 : 0)));

      somaChuva = arred5(somaChuva + fracaoContada);
      somaCombinada = arred5(somaCombinada + fracaoDia);

      if (fracaoContada > 0) {
        linhasChuva.push({
          data: r.data,
          dataBR: Pleito.dataBR(r.data),
          numero: r.numero || "",
          rdoId: r.id || "",
          chuvaMm: Number(clima.chuvaMm || 0),
          chuvaHoras: Number(clima.chuvaHoras || 0),
          fonte: clima.fonte || "",
          fracao: arred5(fracaoContada),
          pctDoDia: arred5(fracaoContada * 100),
          condicaoDNIT: cond.condicao,
          memoria: Pleito.memoriaChuva(clima),
          /* a evidência que o próprio RDO já redigia para o impresso */
          evidencia: cond.motivo || "",
          mediaHistoricaMm: (r.chuvaMediaHistoricaMm == null) ? null : Number(r.chuvaMediaHistoricaMm),
          extraordinaria: RDO.chuvaExtraordinaria(clima.chuvaMm, r.chuvaMediaHistoricaMm),
          impactoRegistrado: String(r.impactoChuva || "").trim()
        });

        var falta = RDO.pendenciasDoPleito(r);
        if (falta.length) {
          pendencias.push({ data: r.data, dataBR: Pleito.dataBR(r.data), numero: r.numero || "", itens: falta });
        }
      }

      /* ---------- descarte: só do que PARECIA pleito ---------- */
      var motivos = [];
      if (fracaoBruta > 0 || houvePar || /impratic|parcial/i.test(String(r.condicao || ""))) {
        if (ehDomingo) motivos.push("domingo");
        else if (naoTrabalhavel) motivos.push("feriado");
        if (fracaoBruta > 0 && !temFonte) motivos.push("sem_fonte");
        if (!clima && (houvePar || /impratic|parcial/i.test(String(r.condicao || "")))) motivos.push("sem_medicao");
        if (clima && temFonte && fracaoBruta === 0 && !naoTrabalhavel &&
            /impratic|parcial/i.test(String(r.condicao || "")) && !paradoPorImpedimento) {
          motivos.push("abaixo_limiar");
        }
      }
      /* um dia parado por impedimento documentado NÃO é descarte, mesmo que a
         chuva dele não conte — ele entra pela outra porta */
      if (motivos.length && !paradoPorImpedimento) {
        var principal = "";
        ORDEM_MOTIVOS.forEach(function (m) { if (!principal && motivos.indexOf(m) > -1) principal = m; });
        porMotivo[principal] = (porMotivo[principal] || 0) + 1;
        if (motivos.indexOf("sem_fonte") > -1) semFonteQualquer++;
        somaDescartada = arred5(somaDescartada + fracaoBruta);
        descartados.push({
          data: r.data,
          dataBR: Pleito.dataBR(r.data),
          numero: r.numero || "",
          rdoId: r.id || "",
          motivo: principal,
          motivoTexto: Pleito.MOTIVOS_DESCARTE[principal] || principal,
          motivos: motivos,
          motivosTexto: motivos.map(function (m) { return Pleito.MOTIVOS_DESCARTE[m] || m; }),
          chuvaMm: clima ? Number(clima.chuvaMm || 0) : null,
          fonte: clima ? (clima.fonte || "") : "",
          fracaoQueSeriaPerdida: arred5(fracaoBruta),
          condicaoNoDiario: r.condicao || ""
        });
      }

      /* ---------- impedimentos ---------- */
      if (ids.length) {
        linhasImped.push({
          data: r.data,
          dataBR: Pleito.dataBR(r.data),
          numero: r.numero || "",
          rdoId: r.id || "",
          ids: ids,
          rotulos: ids.map(rotuloImpedimento),
          observacao: String(r.impedimentosObs || "").trim(),
          paralisacaoRegistrada: houvePar,
          motivoParalisacao: (r.paralisacao && r.paralisacao.motivo) || "",
          horasParadas: arred5(horasParadas),
          contado: paradoPorImpedimento,
          /* sem paralisação registrada o dia não vira parcela — e o dossiê diz
             por quê, em vez de omitir a linha e o engenheiro achar que sumiu */
          porQueNaoContado: paradoPorImpedimento ? "" :
            (naoTrabalhavel
              ? "Dia não trabalhável — não entra em pleito."
              : "Impedimento registrado sem paralisação de dia inteiro no diário. Quantifique pelas horas paradas antes de somar.")
        });
      }

      /* ---------- efetivo ocioso nos dias pleiteáveis ---------- */
      if (fracaoDia > 0) {
        var tef = RDO.totaisEfetivo(r.efetivo);
        if (tef.pessoas > 0) diasComEfetivo++;
        efetivoPessoasDia += tef.pessoas;
        efetivoHh = arred5(efetivoHh + tef.horas);
        efetivoHhOcioso = arred5(efetivoHhOcioso + tef.horas * fracaoDia);
      }

      /* ---------- espelho do Portal, para o bloco de divergência ----------
       * Mesma leitura de loja/portal.html:1938-1943: condição salva no
       * registro (com queda para a derivada do clima), dia INTEIRO, sem olhar
       * fração, fonte nem domingo. Reproduzido aqui para o dossiê poder dizer
       * de onde vem a diferença — o portal não é tocado. */
      var condPortal = String(r.condicao || (cond ? cond.condicao : "") || "");
      if (/impratic|parad/i.test(condPortal)) portalImpraticaveis++;
      else if (/parcial/i.test(condPortal)) portalParciais++;

      var est = RDO.estadoDe(r, false);
      if (est === "rascunho" || est === "em_aprovacao" || est === "em_revisao") naoHomologados++;
    });

    /* ---------------------------------------------------------------
     * BURACOS NA SEQUÊNCIA
     *
     * Dia sem diário NÃO conta como pleiteável: não há prova. E o buraco é a
     * primeira coisa que a fiscalização procura (js/rdo.js:873-876) — diário
     * que pula justamente o dia de chuva perde credibilidade na hora em que
     * ela seria útil. Melhor o engenheiro ver o buraco aqui do que na reunião.
     * --------------------------------------------------------------- */
    var buracos = RDO.buracosNaSequencia(daObra, obraId).filter(function (d) {
      return (!de || d >= de) && (!ate || d <= ate);
    });
    var buracosDomingo = buracos.filter(function (d) { return RDO.ehDomingo(d); }).length;
    var diasCorridos = (de && ate) ? (RDO.diasEntre(de, ate) + 1) : noPeriodo.length;

    /* ---------------------------------------------------------------
     * CONFRONTO COM O PRAZO CONTRATUAL
     * --------------------------------------------------------------- */
    var pz = obra ? RDO.prazo(obra, ate) : null;
    /* ⚠ ARREDONDAR PARA CIMA É CONVENÇÃO DECLARADA, NÃO CONTA ESCONDIDA.
     * Aditivo se pede em dias inteiros; 1,75333 dia vira 2 dias de pedido. O
     * número exato fica exposto ao lado, para a fiscalização conferir a soma
     * com a mesma casa decimal com que ela foi feita. */
    var pedidoDias = Math.ceil(somaCombinada - 0.0000001);
    /* `> 0` e não `< 0`: `Math.ceil(-0.0000001)` devolve -0, que passa por
       qualquer teste de negativo e ainda assim polui o documento. */
    if (!(pedidoDias > 0)) pedidoDias = 0;
    var prazo = {
      temContrato: !!pz,
      inicio: (obra && obra.inicio) || "",
      termino: (obra && obra.termino) || "",
      totalDias: pz ? pz.totalDias : null,
      decorridoDias: pz ? pz.decorridoDias : null,
      aVencerDias: pz ? pz.aVencerDias : null,
      pctDecorrido: pz ? pz.pctDecorrido : null,
      estourado: pz ? pz.estourado : null,
      diasPleiteaveis: somaCombinada,
      diasPleiteaveisArredondado: pedidoDias,
      arredondamento: "Pedido em dias inteiros (arredondado para cima). O valor exato apurado é " + Pleito.numBR(somaCombinada, 5) + " dia(s).",
      novoTermino: (obra && obra.termino) ? somarDias(obra.termino, pedidoDias) : "",
      pctDoPrazo: (pz && pz.totalDias > 0) ? arred5((somaCombinada / pz.totalDias) * 100) : null
    };
    if (!pz && obra) {
      avisos.push("A obra não tem início e término contratuais cadastrados — sem eles o dossiê não confronta o pleito com o prazo, e não vai inventar as datas.");
    }

    /* ---------------------------------------------------------------
     * AVISOS — o que o engenheiro precisa saber ANTES de imprimir
     * --------------------------------------------------------------- */
    if (semFonteQualquer > 0) {
      avisos.push(semFonteQualquer + " dia(s) com chuva registrada FICARAM DE FORA da soma por não terem clima de fonte externa. Busque o clima desses dias no diário antes de protocolar — hoje eles não são prova.");
    }
    if (buracos.length) {
      avisos.push(buracos.length + " dia(s) do período não têm diário. Dia sem diário não conta como pleiteável, e buraco na sequência é a primeira coisa que a fiscalização procura.");
    }
    if (naoHomologados > 0) {
      avisos.push(naoHomologados + " diário(s) do período ainda não passaram pela aprovação. Pleito construído sobre rascunho é contestável no primeiro pedido de vista.");
    }
    if (pendencias.length) {
      avisos.push(pendencias.length + " dia(s) de chuva ainda têm pendência de instrução (impacto, efetivo ou média histórica). Chuva sozinha não ganha pleito.");
    }
    if (linhasImped.some(function (l) { return !l.contado; })) {
      avisos.push("Há impedimento registrado sem paralisação de dia inteiro. O dossiê NÃO converte esses dias em parcela — quantifique pelas horas paradas e some à mão, com o contrato na frente.");
    }

    /* ---------------------------------------------------------------
     * PENDÊNCIA EXPLÍCITA DO MÓDULO (não é bug, é limite conhecido)
     * --------------------------------------------------------------- */
    var pendenciasDoMotor = [
      "Jornada contratual não existe no cadastro da obra: por isso horas paradas por impedimento NÃO viram fração de dia aqui. Enquanto o campo não existir, essa conversão é do engenheiro.",
      "Feriado municipal não é deduzido — só domingo (js/rdo.js:124). Feriado precisa estar marcado no diário, senão entra na soma como dia útil."
    ];

    return {
      versao: Pleito.VERSAO,
      obraId: obraId,
      obra: (obra && obra.nome) || "",
      periodo: {
        de: de, ate: ate,
        deBR: Pleito.dataBR(de), ateBR: Pleito.dataBR(ate),
        diasCorridos: diasCorridos,
        diariosNoPeriodo: noPeriodo.length
      },

      chuva: {
        /* O NÚMERO DO DOSSIÊ: soma das frações DNIT/SICRO dos dias com fonte
           externa e trabalháveis. */
        dias: somaChuva,
        diasTexto: Pleito.numBR(somaChuva, 5),
        linhas: linhasChuva,
        criterio: "Fração de dia perdida pelo Fator de Influência de Chuvas do DNIT/SICRO, apurada dia a dia sobre a precipitação de fonte externa registrada no diário."
      },

      impedimentos: {
        diasParados: linhasImped.filter(function (l) { return l.contado; }).length,
        diasComRegistro: linhasImped.length,
        horasParadasRegistradas: arred5(linhasImped.reduce(function (a, l) { return a + l.horasParadas; }, 0)),
        linhas: linhasImped,
        criterio: "Fatos impeditivos não imputáveis a quem executa (js/rdo.js:770). Vira dia inteiro só quando a paralisação está registrada no diário do dia."
      },

      efetivoOcioso: {
        diasComEfetivo: diasComEfetivo,
        pessoasDia: efetivoPessoasDia,
        hhRegistrado: efetivoHh,
        hhOcioso: efetivoHhOcioso,
        criterio: "Homem-hora ocioso = horas do efetivo presente × fração do dia perdida naquele dia. É a segunda perna do pleito: sem efetivo ocioso, a chuva é boletim do tempo (js/rdo.js:163-171)."
      },

      descartes: {
        total: descartados.length,
        porMotivo: porMotivo,
        semFonte: semFonteQualquer,
        diasPerdidosNoDescarte: somaDescartada,
        linhas: descartados,
        criterio: "Dias que pareciam pleito e não entraram na soma. A lista é o que sustenta o documento quando a fiscalização contesta."
      },

      sequencia: {
        diasCorridos: diasCorridos,
        diasComDiario: noPeriodo.length,
        buracos: buracos,
        buracosQtd: buracos.length,
        buracosEmDomingo: buracosDomingo,
        criterio: "Dia sem diário não conta como pleiteável — não há prova. A numeração do RDO é sequencial contínua, inclusive domingo e dia parado."
      },

      qualidade: {
        diariosNaoHomologados: naoHomologados,
        diasComPendencia: pendencias.length,
        pendenciasPorDia: pendencias
      },

      prazo: prazo,

      /* ---------- O BLOCO QUE EVITA A BRIGA ---------- */
      divergencia: {
        portal: {
          diasImpraticaveis: portalImpraticaveis,
          diasParciais: portalParciais,
          comoConta: "Relatório \"Clima e dias improdutivos\" do Portal do Cliente: conta DIA INTEIRO pela condição salva no registro (o campo que o usuário pode sobrescrever), sem aplicar fração, sem exigir fonte externa e sem excluir domingo."
        },
        dossie: {
          diasPleiteaveis: somaCombinada,
          comoConta: "Este dossiê: soma a FRAÇÃO do dia pelo critério DNIT/SICRO, só de dias com clima de fonte externa e só de dias trabalháveis, com teto de um dia por data."
        },
        explicacao: "Os dois números são diferentes de propósito, porque respondem a perguntas diferentes: o Portal informa ao cliente quantos dias tiveram tempo ruim; o dossiê apura quanto prazo é tecnicamente pleiteável. Se a fiscalização confrontar os dois, esta é a resposta — e ela vem escrita no documento, não improvisada na reunião.",
        divergem: (portalImpraticaveis + portalParciais) !== somaCombinada
      },

      total: {
        diasPleiteaveis: somaCombinada,
        diasPleiteaveisTexto: Pleito.numBR(somaCombinada, 5),
        porChuva: somaChuva,
        porImpedimento: linhasImped.filter(function (l) { return l.contado; }).length,
        sobreposicaoRemovida: arred5(
          somaChuva + linhasImped.filter(function (l) { return l.contado; }).length - somaCombinada
        ),
        pedidoEmDias: pedidoDias
      },

      avisos: avisos,
      pendenciasDoMotor: pendenciasDoMotor,
      usoRestrito: "Documento técnico interno do engenheiro. Não publicar no Portal do Cliente: prorrogação de prazo depende do que estiver previsto em contrato, e o número apurado aqui abre negociação de aditivo."
    };
  };

  /* ---------------------------------------------------------------
   * RESUMO EM UMA FRASE — o que vai no alto do documento e no card da tela
   * --------------------------------------------------------------- */
  Pleito.resumoTexto = function (dossie) {
    var d = dossie || {};
    if (d.erro) return d.erro;
    if (!d.periodo) return "";
    var partes = [];
    partes.push("Período de " + d.periodo.deBR + " a " + d.periodo.ateBR +
      " (" + d.periodo.diasCorridos + " dias corridos, " + d.periodo.diariosNoPeriodo + " diários).");
    partes.push("Pleiteável por chuva: " + Pleito.numBR(d.chuva.dias, 5) +
      " dia(s), pelo critério DNIT/SICRO e só com clima de fonte externa.");
    if (d.impedimentos.diasParados) {
      partes.push("Dias parados por impedimento não imputável: " + d.impedimentos.diasParados + ".");
    }
    partes.push("Total apurado: " + Pleito.numBR(d.total.diasPleiteaveis, 5) +
      " dia(s) — pedido de " + d.total.pedidoEmDias + " dia(s) inteiro(s).");
    if (d.descartes.total) {
      partes.push("Ficaram de fora " + d.descartes.total + " dia(s)" +
        (d.descartes.semFonte ? ", sendo " + d.descartes.semFonte + " por falta de fonte externa" : "") + ".");
    }
    if (d.sequencia.buracosQtd) {
      partes.push(d.sequencia.buracosQtd + " dia(s) do período não têm diário e por isso não entram.");
    }
    return partes.join(" ");
  };

  if (typeof window !== "undefined") window.Pleito = Pleito;
  if (typeof module !== "undefined" && module.exports) module.exports = Pleito;
})(typeof window !== "undefined" ? window : globalThis);

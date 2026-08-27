/* =====================================================================
 * rdo.js — motor do Diário de Obra (RDO)
 *
 * Módulo PURO e testável em Node: nada de DOM, nada de Store. Quem grava e
 * quem desenha é a view (js/gestao.js). Aqui moram as regras que precisam
 * estar certas mesmo quando ninguém está olhando:
 *
 *   1) CLIMA COM PROVA. O clima do diário era um <select> que o encarregado
 *      escolhia na mão. Isso não vale nada numa discussão de prazo: o cliente
 *      contesta e não há o que mostrar. Agora o clima vem do Open-Meteo (sem
 *      chave de API, com histórico), e a paralisação por chuva sai com número:
 *      "choveu 23,4 mm em 5 h". Isso é evidência.
 *   2) ATIVIDADES DE ONDE ELAS JÁ EXISTEM. O que se executa no dia sai do
 *      orçamento, do cronograma ou do Last Planner — e o que não estiver em
 *      lugar nenhum pode ser digitado na hora, sem travar quem está na obra.
 *   3) APROVAÇÃO ANTES DE PUBLICAR. O diário nasce rascunho, vai ao gestor, e
 *      só chega ao cliente depois de aprovado. Quem pede revisão escreve o
 *      motivo, e o motivo volta ao autor.
 * ===================================================================== */
(function (global) {
  "use strict";

  var RDO = {};

  /* ---------------------------------------------------------------
   * 1) CLIMA — Open-Meteo (open-meteo.com, uso livre, sem chave)
   *
   * Duas rotas de propósito: a de previsão só responde de ~5 dias atrás em
   * diante; o arquivo histórico cobre o passado. Diário quase sempre é
   * preenchido com atraso, então sem o arquivo isso não serviria para nada.
   * --------------------------------------------------------------- */
  RDO.CLIMA_URL_PREV = "https://api.open-meteo.com/v1/forecast";
  RDO.CLIMA_URL_HIST = "https://archive-api.open-meteo.com/v1/archive";
  RDO.GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";

  /* Códigos WMO → texto em português + se a condição atrapalha a obra.
   * A tabela é do padrão WMO 4677, que é o que a API devolve. */
  var WMO = {
    0:  ["Céu limpo", "bom"],
    1:  ["Predominantemente limpo", "bom"],
    2:  ["Parcialmente nublado", "bom"],
    3:  ["Encoberto", "bom"],
    45: ["Nevoeiro", "atencao"],
    48: ["Nevoeiro com geada", "atencao"],
    51: ["Garoa fraca", "atencao"],
    53: ["Garoa moderada", "atencao"],
    55: ["Garoa forte", "ruim"],
    56: ["Garoa congelante fraca", "ruim"],
    57: ["Garoa congelante forte", "ruim"],
    61: ["Chuva fraca", "atencao"],
    63: ["Chuva moderada", "ruim"],
    65: ["Chuva forte", "ruim"],
    66: ["Chuva congelante fraca", "ruim"],
    67: ["Chuva congelante forte", "ruim"],
    71: ["Neve fraca", "ruim"],
    73: ["Neve moderada", "ruim"],
    75: ["Neve forte", "ruim"],
    77: ["Grãos de neve", "ruim"],
    80: ["Pancadas de chuva fracas", "atencao"],
    81: ["Pancadas de chuva moderadas", "ruim"],
    82: ["Pancadas de chuva violentas", "ruim"],
    85: ["Pancadas de neve fracas", "ruim"],
    86: ["Pancadas de neve fortes", "ruim"],
    95: ["Trovoada", "ruim"],
    96: ["Trovoada com granizo leve", "ruim"],
    99: ["Trovoada com granizo forte", "ruim"]
  };

  RDO.descreverWMO = function (codigo) {
    var e = WMO[Number(codigo)];
    return e ? e[0] : "Condição não informada";
  };
  RDO.severidadeWMO = function (codigo) {
    var e = WMO[Number(codigo)];
    return e ? e[1] : "bom";
  };

  /* ---------- QUANTO DO DIA A CHUVA COMEU — critério DNIT/SICRO ----------
   *
   * ⚠ Este trecho tinha um critério INVENTADO por mim (4 h ou 25 mm de chuva
   * ⚠ = dia impraticável). Não existe respaldo nenhum para esses números, e
   * ⚠ um diário que justifica dia parado com critério de casa não se sustenta
   * ⚠ numa medição contestada — que é justamente quando ele é lido.
   *
   * O critério brasileiro com fonte é o Fator de Influência de Chuvas do
   * DNIT/SICRO. Cuidado com o "5 mm" que circula: ele NÃO é 5 mm por dia — é a
   * intensidade em 8 HORAS, e a intensidade em 8 h é a chuva diária ÷ 3.
   *
   *     nd = (chuva_diária / 3 − 5) / 15        (limitado entre 0 e 1)
   *
   * `chuva/3` é a intensidade em 8 h; `−5` desconta o limiar; `/15` é a faixa
   * até saturar. Escrito assim ele se explica sozinho, e a forma algébrica
   * equivalente que aparece nas tabelas é `chuva/45 − 1/3`.
   *
   * Conferido contra a tabela de exemplo do próprio DNIT, casando na 5ª casa:
   *     30,6 mm → 0,34667 · 54,2 mm → 0,87111 · 16,1 mm → 0,02444
   * E os limites fecham sozinhos: 15 mm → 0 (nada parado) e 60 mm → 1 (dia
   * inteiro perdido). Essa coerência é o que dá confiança de ser a fórmula
   * real, e não um número decorado.
   *
   * Devolve a FRAÇÃO do dia perdida, que é mais honesta que um carimbo de
   * "impraticável": meio dia de chuva é meio dia, não um dia. */
  RDO.fracaoDiaPerdidoPorChuva = function (chuvaMm) {
    var mm = Number(chuvaMm || 0);
    if (!(mm > 0)) return 0;
    var nd = (mm / 3 - 5) / 15;
    return Math.max(0, Math.min(1, Math.round(nd * 100000) / 100000));
  };

  /* Rótulo do dia. A FRAÇÃO é do DNIT; os cortes que viram palavra
   * ("parcial"/"impraticável") são convenção nossa e estão escritos no
   * impresso — número exposto se discute, número escondido vira briga.
   *
   * `diaNaoTrabalhavel` existe porque o próprio DNIT exclui domingo e feriado
   * mesmo com chuva forte: não se pleiteia dia que não seria trabalhado. */
  /* Domingo não é dia de obra parada por chuva — é dia sem obra.
   *
   * ⚠ `condicaoPorClima` sempre aceitou `diaNaoTrabalhavel`, e NADA no app
   * calculava esse valor: um domingo de chuva forte entrava como "dia
   * impraticável" e ia para a conta do pleito. Fiscalização derruba o pleito
   * inteiro quando acha um domingo na lista — e com razão: aquele dia não
   * seria trabalhado de qualquer jeito.
   *
   * Domingo o app deduz sozinho da data. Feriado ele NÃO adivinha: a lista
   * muda por município e por ano, e chutar seria pior que perguntar. O
   * usuário marca, e a marcação fica no registro. */
  RDO.ehDomingo = function (dataISO) {
    var s = String(dataISO || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + "T12:00:00");   /* meio-dia: fuso não vira o dia */
    return !isNaN(d.getTime()) && d.getDay() === 0;
  };

  /* O dia é trabalhável? Domingo (deduzido) ou feriado (marcado à mão). */
  RDO.diaNaoTrabalhavel = function (rdo) {
    var r = rdo || {};
    if (r.feriado === true) return true;
    if (r.diaNaoTrabalhavel === true) return true;   /* marcação explícita antiga */
    return RDO.ehDomingo(r.data);
  };

  RDO.condicaoPorClima = function (clima, diaNaoTrabalhavel) {
    if (!clima) return { condicao: "praticavel", motivo: "", fracaoPerdida: 0 };
    if (diaNaoTrabalhavel) {
      return { condicao: "praticavel", motivo: "Dia não trabalhável — não entra em pleito.", fracaoPerdida: 0 };
    }
    var mm = Number(clima.chuvaMm || 0);
    var h = Number(clima.chuvaHoras || 0);
    var nd = RDO.fracaoDiaPerdidoPorChuva(mm);
    var evid = "Chuva de " + RDO.numBR(mm) + " mm em " + RDO.numBR(h) + " h" +
               " · critério DNIT/SICRO: " + RDO.numBR(nd * 100) + "% do dia";

    if (nd >= 0.75) return { condicao: "impraticavel", motivo: evid, fracaoPerdida: nd };
    if (nd > 0)     return { condicao: "parcial",      motivo: evid, fracaoPerdida: nd };
    /* sem chuva que conte, mas tempo severo (trovoada, vendaval): a condição
       cai para parcial e QUEM decide é quem está lá — só sinalizamos */
    if (RDO.severidadeWMO(clima.codigo) === "ruim") {
      return { condicao: "parcial", motivo: RDO.descreverWMO(clima.codigo) + " (sem chuva acumulada relevante)", fracaoPerdida: 0 };
    }
    return { condicao: "praticavel", motivo: "", fracaoPerdida: 0 };
  };

  /* ---------- O DADO DE CHUVA SOZINHO NÃO GANHA PLEITO ----------
   * O TCU e o IBAPE são expressos: chuva dentro da média já deveria estar no
   * preço e no prazo. Provar que choveu não basta — é preciso mostrar (a) que
   * a chuva foi EXTRAORDINÁRIA para aquele lugar e época, e (b) o IMPACTO
   * REAL registrado no mesmo dia: frentes paradas, efetivo ocioso, horas
   * perdidas. Sem a perna (b), o diário vira boletim do tempo.
   *
   * Esta função não decide nada: ela diz ao usuário o que ainda falta para o
   * dia parado ter chance de se sustentar. */
  RDO.pendenciasDoPleito = function (rdo) {
    var r = rdo || {}, falta = [];
    /* ⚠ DOMINGO E FERIADO NÃO INSTRUEM PLEITO NENHUM. `condicaoPorClima` logo
       acima já devolve fração 0 nesses dias — mas esta função calculava `nd`
       direto da chuva e nunca perguntava. Resultado: num domingo com 61 mm a
       tela dizia "Dia não trabalhável — não entra em pleito" e, na linha
       seguinte, cobrava três providências para instruir esse mesmo pleito.
       Proteção pela metade: um lado sabia, o outro não perguntava. */
    var nd = (r.clima && !RDO.diaNaoTrabalhavel(r)) ? RDO.fracaoDiaPerdidoPorChuva(r.clima.chuvaMm) : 0;
    if (nd <= 0) return falta;                       // não há pleito de chuva a instruir
    if (!r.clima || !r.clima.fonte) falta.push("Buscar o clima do dia de fonte externa (o valor digitado à mão não é prova).");
    if (r.chuvaMediaHistoricaMm == null) falta.push("Comparar com a média histórica do local — chuva dentro da média não gera pleito.");
    if (!String(r.impactoChuva || "").trim()) falta.push("Descrever o IMPACTO do dia: que frentes pararam, quanto efetivo ficou ocioso, quantas horas.");
    if (!(r.efetivo && r.efetivo.length)) falta.push("Registrar o efetivo presente — é ele que comprova a mão de obra ociosa.");
    return falta;
  };

  /* Foi chuva fora do normal? Só dá para responder com a média histórica do
   * lugar; sem ela devolvemos null e a tela diz "não comparado" — em vez de
   * afirmar "extraordinária" sem base. */
  RDO.chuvaExtraordinaria = function (chuvaMm, mediaHistoricaMm) {
    var mm = Number(chuvaMm || 0), med = Number(mediaHistoricaMm);
    if (!(med > 0)) return null;
    return { extraordinaria: mm > med, chuvaMm: mm, mediaMm: med,
             vezes: Math.round((mm / med) * 10) / 10 };
  };

  RDO.numBR = function (n) {
    var v = Number(n || 0);
    return (Math.round(v * 10) / 10).toString().replace(".", ",");
  };

  /* Monta a URL certa para a data pedida.
   * A rota de previsão não entrega o passado distante e o arquivo histórico
   * leva ~5 dias para consolidar — daí o corte. Errar isso devolve JSON sem
   * `daily`, que é o modo silencioso de o clima "não funcionar". */
  RDO.urlClima = function (lat, lon, dataISO, hojeISO) {
    if (lat == null || lon == null || !dataISO) return "";
    var dias = RDO.diasEntre(dataISO, hojeISO || dataISO);
    var base = (dias > 5) ? RDO.CLIMA_URL_HIST : RDO.CLIMA_URL_PREV;
    var campos = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,wind_speed_10m_max";
    return base + "?latitude=" + encodeURIComponent(lat) +
      "&longitude=" + encodeURIComponent(lon) +
      "&start_date=" + encodeURIComponent(dataISO) +
      "&end_date=" + encodeURIComponent(dataISO) +
      "&daily=" + campos +
      "&timezone=America%2FSao_Paulo";
  };

  /* O endereço da obra é UM campo livre ("Rua, nº, bairro, cidade"). O
   * geocodificador precisa de MUNICÍPIO — mandar a rua devolve qualquer
   * homônima do Brasil, ou nada, e o diário sai com a chuva de outra cidade.
   * Isso destrói exatamente o que o clima automático veio dar: credibilidade
   * ao pleito por dia impraticável.
   *
   * Devolve { cidade, uf } fazendo o melhor palpite honesto. Quando o campo
   * só tem rua e número, devolve a rua — e quem chama avisa que não achou,
   * em vez de buscar em silêncio no lugar errado. */
  /* UF → nome oficial do estado, como o geocodificador devolve em `admin1`.
   *
   * ⚠ NÃO USE `indexOf` PARA CASAR UF COM NOME DE ESTADO. Conferi contra a API
   * de verdade: `"Espírito Santo".indexOf("SP")` CASA (É-sp-írito). Uma obra em
   * São Paulo com um homônimo no ES pegava a coordenada capixaba e o código
   * ainda marcava "estado conferido". E `admin1_code` — que eu tentei usar
   * primeiro — simplesmente NÃO EXISTE na resposta: os campos são
   * id, name, latitude, longitude, elevation, feature_code, country_code,
   * admin1_id..admin3_id, timezone, population, country_id, country,
   * admin1, admin2, admin3. */
  RDO.UF_ESTADO = {
    AC: "acre", AL: "alagoas", AP: "amapá", AM: "amazonas", BA: "bahia",
    CE: "ceará", DF: "distrito federal", ES: "espírito santo", GO: "goiás",
    MA: "maranhão", MT: "mato grosso", MS: "mato grosso do sul",
    MG: "minas gerais", PA: "pará", PB: "paraíba", PR: "paraná",
    PE: "pernambuco", PI: "piauí", RJ: "rio de janeiro",
    RN: "rio grande do norte", RS: "rio grande do sul", RO: "rondônia",
    RR: "roraima", SC: "santa catarina", SP: "são paulo", SE: "sergipe",
    TO: "tocantins"
  };

  /* Tira acento e caixa: o geocodificador às vezes devolve "SAO PAULO". */
  function semAcento(s) {
    return String(s || "").toLowerCase()
      .replace(/[àáâãä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
      .replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u").replace(/ç/g, "c").trim();
  }
  RDO._semAcento = semAcento;

  /* O `admin1` devolvido é o estado desta UF? Comparação EXATA, sem indexOf. */
  RDO.ufBate = function (uf, admin1) {
    var nome = RDO.UF_ESTADO[String(uf || "").toUpperCase()];
    if (!nome || !admin1) return false;
    return semAcento(admin1) === semAcento(nome);
  };

  /* O resultado é um MUNICÍPIO, ou é país/estado/região?
   * `feature_code` PPL* = povoado/cidade. PCLI = país, ADM1 = estado.
   * Sem esta checagem, um endereço terminado em "Brasil" fazia o app aceitar
   * o PAÍS como município e gravar lat −10 / lon −55 — o centro geográfico do
   * Brasil, no meio do Mato Grosso — como coordenada da obra. */
  RDO.ehMunicipio = function (r) {
    var fc = String((r || {}).feature_code || "");
    return fc.indexOf("PPL") === 0 || fc === "ADM2" || fc === "ADM3";
  };

  RDO.municipioDoEndereco = function (local) {
    var cru = String(local || "").split(",").map(function (p) { return p.trim(); }).filter(Boolean);
    if (!cru.length) return { cidade: "", uf: "" };
    /* ⚠ "…, Uberaba, MG, Brasil" é forma comuníssima de digitar. Com o país no
     * fim, a UF era engolida no meio e a "cidade" saía como "Brasil". Tiro o
     * país antes de qualquer coisa — ele nunca é o município. */
    while (cru.length > 1 && /^(brasil|brazil|br)$/i.test(cru[cru.length - 1])) cru.pop();
    var uf = "";
    /* "…, Uberlândia, MG": a UF vem SOZINHA no fim. Capturar antes de
       descartar — ela é o desempate entre municípios homônimos. */
    var fim = cru[cru.length - 1];
    if (/^[A-Za-z]{2}$/.test(fim)) { uf = fim.toUpperCase(); cru.pop(); }
    var partes = cru.filter(function (p) {
      if (/^\d{5}-?\d{3}$/.test(p)) return false;               // CEP
      if (/^n?[ºo°]?\s*\d+$/i.test(p)) return false;            // número isolado
      return true;
    });
    var cidade = partes[partes.length - 1] || cru[cru.length - 1] || "";
    /* "Uberaba/MG" ou "Uberaba - MG" grudados */
    var m = cidade.match(/^(.+?)\s*[\/\-]\s*([A-Za-z]{2})$/);
    if (m) { cidade = m[1].trim(); uf = uf || m[2].toUpperCase(); }
    return { cidade: cidade, uf: uf };
  };

  RDO.diasEntre = function (aISO, bISO) {
    var a = Date.parse(aISO + "T12:00:00Z"), b = Date.parse(bISO + "T12:00:00Z");
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000);
  };

  /* Normaliza a resposta da API. Devolve null quando não veio nada aproveitável
   * — e a view mostra "não consegui buscar", em vez de inventar sol. */
  RDO.lerRespostaClima = function (json) {
    if (!json || !json.daily || !json.daily.time || !json.daily.time.length) return null;
    var d = json.daily, i = 0;
    function v(campo) { return (d[campo] && d[campo][i] != null) ? Number(d[campo][i]) : null; }
    var codigo = v("weather_code");
    if (codigo == null) return null;
    return {
      data: d.time[i],
      codigo: codigo,
      descricao: RDO.descreverWMO(codigo),
      tempMax: v("temperature_2m_max"),
      tempMin: v("temperature_2m_min"),
      chuvaMm: v("precipitation_sum") || 0,
      chuvaHoras: v("precipitation_hours") || 0,
      ventoMax: v("wind_speed_10m_max"),
      fonte: "Open-Meteo",
      buscadoEm: null   // carimbado por quem chama (o motor não lê relógio)
    };
  };

  /* Frase pronta para o impresso e para o Portal. É o que o cliente lê quando
   * questiona um dia parado. */
  RDO.textoClima = function (clima) {
    if (!clima) return "Clima não registrado.";
    var p = [clima.descricao];
    if (clima.tempMin != null && clima.tempMax != null) {
      p.push("mín. " + RDO.numBR(clima.tempMin) + " °C / máx. " + RDO.numBR(clima.tempMax) + " °C");
    }
    if (Number(clima.chuvaMm) > 0) {
      p.push("chuva de " + RDO.numBR(clima.chuvaMm) + " mm em " + RDO.numBR(clima.chuvaHoras) + " h");
    } else {
      p.push("sem chuva registrada");
    }
    return p.join(" · ") + " (fonte: " + (clima.fonte || "—") + ").";
  };

  /* ---------------------------------------------------------------
   * 2) ATIVIDADES — de onde vêm
   *
   * O encarregado não deve redigitar o que a empresa já orçou. Estas funções
   * achatam as fontes num formato único, com a origem carimbada em cada linha
   * (para o avanço saber voltar para o item certo do orçamento).
   * --------------------------------------------------------------- */

  /* Do ORÇAMENTO: etapa › sub etapa › item, já numerado. */
  RDO.atividadesDoOrcamento = function (orc) {
    var out = [];
    if (!orc || !orc.etapas) return out;
    orc.etapas.forEach(function (e, ie) {
      var numE = String(ie + 1);
      var subs = e.subetapas || [];
      var idxSub = {};
      subs.forEach(function (s, is) { idxSub[s.id] = numE + "." + (is + 1); });
      (e.itens || []).forEach(function (it, ii) {
        var pai = (it.subEtapaId && idxSub[it.subEtapaId]) ? idxSub[it.subEtapaId] : numE;
        out.push({
          origem: "orcamento",
          refId: it.id || "",
          etapa: e.nome || "",
          numero: pai + "." + (ii + 1),
          descricao: it.descricao || "",
          unidade: it.unidade || "",
          /* ⚠ o item do orçamento guarda `quantidade` (Orcamento.addItem), não
             `qtd`. Lendo o campo errado, TODO serviço puxado do orçamento
             nascia com quantidade prevista ZERO e a tela mostrava "—", sem erro
             nenhum. As duas suítes passavam porque montavam o item à mão. */
          qtdPrevista: Number(it.quantidade || it.qtd || 0),
          codigo: it.codigo || ""
        });
      });
    });
    return out;
  };

  /* Do CRONOGRAMA: as etapas com data, filtradas pelas que estão em curso na
   * data do diário — quem está em obra quer ver o que é DE HOJE, não a lista
   * inteira do contrato. */
  RDO.atividadesDoCronograma = function (cron, dataISO) {
    var out = [];
    if (!cron || !cron.etapas) return out;
    cron.etapas.forEach(function (e, i) {
      var vigente = true;
      if (dataISO && e.dataInicio && e.dataFim) {
        vigente = (String(e.dataInicio) <= dataISO && dataISO <= String(e.dataFim));
      }
      if (!vigente) return;
      out.push({
        origem: "cronograma",
        refId: e.id || String(i),
        etapa: e.nome || e.titulo || "",
        numero: String(i + 1),
        descricao: e.nome || e.titulo || "",
        unidade: "",
        qtdPrevista: 0,
        codigo: ""
      });
    });
    return out;
  };

  /* Do LAST PLANNER: as tarefas planejadas para a semana e ainda abertas. */
  RDO.atividadesDoLastPlanner = function (tarefas, semana) {
    return (tarefas || []).filter(function (t) {
      return (!semana || t.semana === semana) && t.status !== "feito";
    }).map(function (t) {
      return {
        origem: "lastplanner",
        refId: t.id || "",
        etapa: t.frente || "",
        numero: "",
        descricao: t.titulo || "",
        unidade: "",
        qtdPrevista: 0,
        codigo: ""
      };
    });
  };

  /* Digitada na hora, quando não existe em fonte nenhuma.
   *
   * ⚠ A ETAPA É PARÂMETRO, NÃO SOBRA. Ela nascia sempre "" aqui — e como o
   * serviço avulso é justamente o que a obra tem de fora do orçamento, todo
   * apontamento digitado em campo caía em "Sem etapa" no painel do cliente.
   * O avanço por etapa (Fisico.porEtapa) só existe se alguém disser a qual
   * etapa o serviço pertence, e o único momento em que se sabe isso é o
   * cadastro. Continua aceitando vazio: obrigar a classificar na pressa do
   * canteiro faria o encarregado escolher qualquer uma para o formulário
   * deixar salvar — e etapa errada é pior que etapa em branco. */
  RDO.atividadeAvulsa = function (descricao, unidade, qtdPrevista, etapa) {
    return {
      origem: "avulsa",
      refId: "",
      etapa: String(etapa || "").trim(),
      numero: "",
      descricao: String(descricao || "").trim(),
      unidade: String(unidade || "").trim(),
      qtdPrevista: Number(qtdPrevista || 0),
      codigo: ""
    };
  };

  RDO.ORIGENS = { orcamento: "Orçamento", cronograma: "Cronograma", lastplanner: "Last Planner", avulsa: "Cadastrada no diário" };

  /* ---------------------------------------------------------------
   * O NÚMERO DO DIÁRIO — SEQUÊNCIA POR OBRA
   *
   * Antes o número saía de `lista("rdo").length + 1`: contagem GLOBAL de
   * todos os diários do escritório. Com duas obras rodando juntas, a obra A
   * ficava com 1, 3, 4, 7 e a obra B com 2, 5, 6 — cada diário impresso
   * saindo com um número que não diz nada sobre a própria obra. Numa
   * empresa com dez obras isso é ilegível, e diário é documento: o número
   * é como ele é citado numa medição, num pleito e no Portal do cliente.
   *
   * ⚠ E `length + 1` REPETE NÚMERO. Apagar um diário reduz a contagem, e o
   * próximo nasce com um número que já existe na base — dois documentos
   * distintos com a mesma identificação. Aqui a conta é MAIOR JÁ USADO + 1,
   * que é imune a exclusão.
   *
   * ⚠ NÃO RENUMERA O QUE JÁ EXISTE. Diário publicado já foi visto pelo
   * cliente no Portal, pode estar citado num boletim e ter aceite gravado
   * com aquele número. Mudar a identificação de um documento emitido é o
   * tipo de "arrumação" que quebra a confiança na base inteira. Obra que já
   * tem diário com a numeração antiga CONTINUA de onde parou; obra nova
   * começa em 1.
   * --------------------------------------------------------------- */
  RDO.numeroSeq = function (numero) {
    /* pega a sequência de qualquer formato já usado: "RDO-0007", "0007",
       "7", "DIARIO 7/2026". Vale o ÚLTIMO grupo de dígitos — em "7/2026" o
       que identifica o diário é o 7, mas em "RDO-0007" é o 0007, e os dois
       casos se resolvem pegando o primeiro grupo depois de um prefixo de
       letras. Sem dígito nenhum, devolve 0 (não entra na conta). */
    var s = String(numero == null ? "" : numero).trim();
    if (!s) return 0;
    var m = /(\d+)/.exec(s);
    return m ? parseInt(m[1], 10) || 0 : 0;
  };

  RDO.proximoNumero = function (rdos, obraId, opc) {
    var o = opc || {};
    var prefixo = o.prefixo === undefined ? "RDO-" : o.prefixo;
    var casas = o.casas || 4;
    var maior = 0;
    (rdos || []).forEach(function (r) {
      if (!r) return;
      /* SÓ a obra pedida. É isto que separa as sequências. */
      if (String(r.obraId || "") !== String(obraId || "")) return;
      var n = RDO.numeroSeq(r.numero);
      if (n > maior) maior = n;
    });
    var prox = maior + 1;
    var txt = String(prox);
    while (txt.length < casas) txt = "0" + txt;
    return prefixo + txt;
  };

  /* Quantos diários esta obra já tem — para a tela poder dizer
     "é o 8º diário desta obra" em vez de só mostrar um número solto. */
  RDO.quantosNaObra = function (rdos, obraId) {
    var n = 0;
    (rdos || []).forEach(function (r) {
      if (r && String(r.obraId || "") === String(obraId || "")) n++;
    });
    return n;
  };

  /* O avanço do dia. `qtdExecutada` é o que vale; a % é derivada dela quando há
   * quantidade prevista — nunca as duas digitadas em paralelo, senão elas
   * divergem e ninguém sabe qual é a verdade. */
  RDO.calcAvanco = function (linha) {
    var prev = Number((linha && linha.qtdPrevista) || 0);
    var exec = Number((linha && linha.qtdExecutada) || 0);
    if (prev > 0) {
      var pct = (exec / prev) * 100;
      return { pct: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)), derivada: true };
    }
    var manual = Number((linha && linha.pctManual) || 0);
    return { pct: Math.max(0, Math.min(100, manual)), derivada: false };
  };

  /* ---------------------------------------------------------------
   * 3) APROVAÇÃO — o diário não vai ao cliente sem passar pelo gestor
   *
   *   rascunho ──enviar──> em_aprovacao ──aprovar──> aprovado ──publicar──> publicado
   *                             │
   *                             └──pedir revisão──> em_revisao ──enviar──> em_aprovacao
   *
   * Publicar exige aprovado. É o ponto do pedido: o gestor tem controle antes
   * de qualquer coisa chegar ao cliente.
   * --------------------------------------------------------------- */
  RDO.ESTADOS = {
    rascunho:     { rotulo: "Rascunho",           cor: "cinza",  cliente: false },
    em_aprovacao: { rotulo: "Aguardando aprovação", cor: "ambar", cliente: false },
    em_revisao:   { rotulo: "Revisão solicitada",  cor: "vermelho", cliente: false },
    aprovado:     { rotulo: "Aprovado",           cor: "verde",  cliente: false },
    publicado:    { rotulo: "Publicado ao cliente", cor: "azul", cliente: true },
    /* diário escrito ANTES de a aprovação existir: já estava ao alcance do
       cliente e continua — mas agora com nome próprio na tela, em vez de
       aparecer como "Rascunho" enquanto o cliente o lia */
    publicado_legado: { rotulo: "Publicado (diário antigo)", cor: "azul", cliente: true },
    /* mesmo diário antigo, em obra que NUNCA teve Portal: ele foi finalizado e
       ficou no escritório. Dizer "publicado" aqui seria mentir para o outro
       lado — e é mentira que o gestor não teria como conferir. */
    finalizado_legado: { rotulo: "Finalizado (diário antigo)", cor: "cinza", cliente: false }
  };

  var TRANSICOES = {
    rascunho:     { enviar: "em_aprovacao" },
    em_aprovacao: { aprovar: "aprovado", revisar: "em_revisao" },
    em_revisao:   { enviar: "em_aprovacao" },
    aprovado:     { publicar: "publicado", revisar: "em_revisao" },
    publicado:    { despublicar: "aprovado" },
    /* o diário antigo estava sem saída: ele JÁ estava no ar e o botão
       Despublicar só aparece para "publicado" — o gestor via um diário errado
       no Portal do cliente e não tinha como tirar. */
    publicado_legado: { despublicar: "aprovado", revisar: "em_revisao" },
    /* o diário antigo do escritório entra no fluxo novo por onde deveria ter
       entrado: enviando para aprovação. E ganha "despublicar" também, porque a
       obra pode ter Portal hoje e o registro ainda não saber disso. */
    finalizado_legado: { enviar: "em_aprovacao", despublicar: "aprovado", revisar: "em_revisao" }
  };

  /* ⚠ A sessão do app identifica o usuário por `usuarioId` (js/auth.js:323).
   * NÃO existe `.id`. Ler `u.id` fazia `autor` ser SEMPRE false, e isso
   * derrubava o fluxo pelos dois lados: o encarregado não conseguia enviar o
   * próprio diário (autor=false e gestor=false), e o gestor que redigiu
   * aprovava o dele mesmo — justamente o controle que este fluxo veio dar.
   * O dono da conta não tem `usuarioId` (é null em js/auth.js:323); para ele o
   * e-mail é a identidade estável. */
  RDO.idDoUsuario = function (u) {
    u = u || {};
    return String(u.usuarioId || u.id || u.email || "");
  };

  /* Diário gravado antes de a autoria passar a ser carimbada — não dá para
     saber quem escreveu. A UI usa isto para avisar em vez de fingir controle. */
  RDO.autoriaIncerta = function (r) { return !String((r || {}).autorId || "").trim(); };

  /* Carimba a autoria. Quem salva o diário chama isto: sem o carimbo,
   * `autorId` fica vazio e a regra "o autor não aprova o próprio" não tem como
   * valer. ⚠ FIAÇÃO PENDENTE em js/gestao.js:6553, que hoje grava `_eu.id`
   * (inexistente) e produz autorId "" em todo diário. */
  RDO.carimbarAutor = function (r, u) {
    r = r || {};
    if (RDO.autoriaIncerta(r)) r.autorId = RDO.idDoUsuario(u);
    return r;
  };

  /* ⚠ Existe OUTRA pessoa capaz de aprovar nesta conta?
   *
   * A regra "o autor não aprova o próprio diário" pressupõe duas pessoas. Numa
   * instalação de UM usuário — que é a maioria dos nossos clientes — aplicá-la
   * sem escapatória trava o produto: o diário sai do rascunho, entra em
   * "Aguardando aprovação" e morre ali, porque não há segundo aprovador,
   * `revisar` só devolve para em_revisao e `publicar` exige estado "aprovado".
   * Foi exatamente o que meu conserto anterior causou: antes o autor era sempre
   * desconhecido (bug), então ninguém percebia.
   *
   * Sub-usuário nunca fica sem saída: o dono da conta sempre pode aprovar.
   * O dono fica sem saída só se não nomeou nenhum aprovador na equipe — e aí a
   * auto-aprovação é liberada, mas fica REGISTRADA na trilha. */
  RDO.semOutroAprovador = function (usuario, equipe) {
    var u = usuario || {};
    if (u.papel === "usuario") return false;          // o dono existe e aprova
    var eu = RDO.idDoUsuario(u), l = equipe || [];
    for (var i = 0; i < l.length; i++) {
      var m = l[i];
      if (m && m.aprovador === true && String(m.id || m.login || "") !== eu) return false;
    }
    return true;
  };

  /* Quem pode o quê. O AUTOR não aprova o próprio diário — se pudesse, o
   * controle que o gestor pediu não existiria.
   * `ctx.semOutroAprovador` é a única exceção (ver acima). */
  RDO.podeAcao = function (acao, usuario, rdo, ctx) {
    var u = usuario || {}, r = rdo || {}, c = ctx || {};
    var eu = RDO.idDoUsuario(u);
    /* ⚠ NORMALIZA como a lista (js/gestao.js) e RDO.transicionar já faziam.
     * Comparar `r.estado` cru trancava o usuário fora de TODO diário sem o
     * campo — os migrados do ERP e os da OBRA TESTE nasceram sem `estado`. */
    var est = r.estado || "rascunho";
    var gestor = (u.papel !== "usuario");                       // admin/gestor/gerente
    /* o admin pode nomear um sub-usuário como aprovador (js/auth.js:228, mesma
       flag de medições e compras). Sem isto o aprovador nomeado não aprovava
       diário nenhum e só o dono da conta conseguia. */
    var aprovador = gestor || u.aprovador === true;
    var autor = !!(r.autorId && eu && String(r.autorId) === eu);
    var emAberto = (est === "rascunho" || est === "em_revisao");

    if (acao === "enviar")   return autor || gestor || RDO.autoriaIncerta(r);
    if (acao === "aprovar") {
      if (!aprovador) return false;
      if (!autor) return true;
      /* AUTOR APROVANDO O PRÓPRIO DIÁRIO
       *
       * A regra dos quatro olhos ("quem escreve não aprova") continua valendo
       * para SUB-USUÁRIO: encarregado não homologa o próprio dia.
       *
       * Mas ADMINISTRADOR aprova o que ele mesmo escreveu, e isso é decisão de
       * produto: a maior parte das contas é de uma pessoa só — o engenheiro
       * lança o diário e é ele quem responde tecnicamente por ele. Exigir um
       * segundo aprovador que não existe travava o diário em "aguardando" para
       * sempre, e o cliente ficava sem o documento.
       *
       * ⚠ O que se perde: o diário é prova em discussão contratual, e o
       * carimbo de aprovação vale mais quando outra pessoa confere. Quem
       * trabalha com contrato grande pode ligar `exigirOutroAprovador` na
       * Empresa e voltar aos quatro olhos — a trava continua no código, só
       * deixou de ser obrigatória. */
      /* regra 3 vence a trava: conta de um aprovador só não pode travar o
         diário para sempre, nem com `exigirOutroAprovador` ligado. */
      if (c.semOutroAprovador === true) return true;
      if (c.exigirOutroAprovador === true) return false;
      /* `autoAprovar` entrou junto com a autoaprovação do motor compartilhado
         (js/aprovacao.js, 08/2026): sub-usuário MARCADO homologa o próprio
         diário, do mesmo jeito que o admin. */
      return gestor || u.autoAprovar === true;
    }
    if (acao === "revisar")  return aprovador;
    /* ⚠ publicar/despublicar mexem no que o CLIENTE enxerga — voltaram a exigir
       gestor. A flag `aprovador` é rotulada na tela como medições/compras/
       requisições; quem a marca não está autorizando ninguém a publicar diário
       no Portal do cliente. */
    if (acao === "publicar" || acao === "despublicar") return gestor;
    if (acao === "editar") {
      if (est === "publicado") return false;   // ninguém reescreve o publicado
      if (autor && emAberto) return true;
      /* ⚠ autoria incerta NÃO libera sub-usuário a mexer no diário de outra
         pessoa. Antes liberava — e como o salvar recarimbava a autoria, o
         diário passava a constar como escrito por quem só o abriu. Diário de
         autoria desconhecida em aberto é do GESTOR. */
      if (gestor) return true;
      return false;
    }
    return false;
  };

  /* Aplica a transição. Devolve {ok, estado, erro} — nunca lança, porque isso
   * roda no meio de um clique na obra. */
  RDO.transicionar = function (rdo, acao, usuario, dados) {
    var r = rdo || {}, d = dados || {};
    /* estadoDe e não `r.estado ||`: o diário antigo (só `status`) precisa ter
       uma saída — ele JÁ está no Portal, e sem isto o gestor não conseguia
       tirar do ar um diário errado que o cliente estava lendo. */
    /* ⚠ `temPortal` viaja em `dados` porque o motor não conhece a obra. Sem
     * ele, um diário antigo de obra COM Portal era lido como
     * `finalizado_legado` (o default de estadoDe), que aceita "enviar": o
     * diário iria para "Aguardando aprovação" enquanto o cliente continuava
     * lendo ele no Portal — o registro dizendo uma coisa e o cliente vendo
     * outra. A tela já passa o argumento certo desde f4182c2; aqui é a mesma
     * verdade, para quem chamar o motor por fora dela. */
    var atual = RDO.estadoDe(r, d.temPortal);
    var mapa = TRANSICOES[atual] || {};
    var destino = mapa[acao];

    if (!destino) return { ok: false, erro: "Não dá para " + acao + " um diário " + ((RDO.ESTADOS[atual] || {}).rotulo || atual).toLowerCase() + "." };
    /* o contexto (há outro aprovador nesta conta?) viaja junto — sem ele a
       conta de um usuário só nunca sai de "Aguardando aprovação" */
    if (!RDO.podeAcao(acao, usuario, r, d)) {
      return { ok: false, erro: acao === "aprovar" && r.autorId && RDO.idDoUsuario(usuario) && String(r.autorId) === RDO.idDoUsuario(usuario)
        ? "Quem escreveu o diário não pode aprovar o próprio diário."
        : "Seu perfil não tem permissão para " + acao + " diários." };
    }
    if (acao === "revisar" && !String(d.motivo || "").trim()) {
      return { ok: false, erro: "Escreva o que precisa ser revisado — é essa mensagem que chega a quem redigiu." };
    }
    if (acao === "enviar") {
      var v = RDO.validar(r);
      if (!v.ok) return { ok: false, erro: v.erros[0] };
    }
    return { ok: true, estado: destino };
  };

  /* O que um diário precisa ter para valer como documento. */
  RDO.validar = function (r) {
    var e = [];
    r = r || {};
    if (!r.obraId) e.push("Escolha a obra do diário.");
    if (!r.data) e.push("Informe a data do diário.");
    /* ⚠ O formulário grava os serviços lançados em `atividadesItens` e o texto
     * livre em `atividades` (js/gestao.js:6531-6532) — e o salvar aceita um OU
     * outro (js/gestao.js:6566). Ler só `atividades`/`atividadesTexto` recusava
     * o diário com seis serviços lançados e o "Resumo do dia" em branco,
     * dizendo que ele "não tem atividade": o diário nunca saía do rascunho.
     * `atividadesTexto` não é escrito em lugar nenhum do app — fica aceito só
     * para não quebrar registro antigo. */
    var temAtiv = (r.atividades && r.atividades.length) ||
                  (r.atividadesItens && r.atividadesItens.length) ||
                  String(r.atividadesTexto || "").trim();
    if (!temAtiv) e.push("Um diário sem nenhuma atividade não registra nada — inclua ao menos uma.");
    if (r.condicao === "impraticavel" && !String(r.ocorrencias || "").trim() && !(r.clima && Number(r.clima.chuvaMm) > 0)) {
      e.push("Dia impraticável precisa de justificativa: descreva a ocorrência ou busque o clima do dia.");
    }
    return { ok: !e.length, erros: e };
  };

  /* ---------------------------------------------------------------
   * 3b) O QUE O DIÁRIO PRECISA TER — vocabulário do formulário oficial
   *
   * A referência é a NORMA DNIT 097/2025-PRO (out/2025), cujos Anexos A e B
   * são normativos e trazem o formulário campo a campo. É o modelo federal
   * mais recente e o único que achamos com força de norma.
   *
   * ⚠ Nada aqui é obrigação LEGAL genérica. Em obra privada, o diário obriga
   * ⚠ porque o CONTRATO manda — nenhuma lei brasileira exige "diário de obra"
   * ⚠ com esse nome. Em obra pública o que a lei obriga (Lei 14.133/2021,
   * ⚠ art. 117, §1º) é o FISCAL anotar as ocorrências em registro próprio; ela
   * ⚠ não lista campos. Quem lista é a norma do órgão e o edital. Vender isso
   * ⚠ como "exigência legal" seria mentira — o valor do RDO é ser PROVA.
   * --------------------------------------------------------------- */

  /* Lista FECHADA de ocorrência. Lista fechada existe para o dia ruim virar
   * estatística: com campo livre, "chuva", "choveu" e "tempo ruim" são três
   * coisas diferentes e ninguém consegue somar improdutividade no fim do mês. */
  RDO.TIPOS_OCORRENCIA = [
    { id: "pessoal",     rotulo: "Pessoal" },
    { id: "equipamento", rotulo: "Equipamento" },
    { id: "instalacoes", rotulo: "Instalações" },
    { id: "cronograma",  rotulo: "Cronograma" },
    { id: "qualidade",   rotulo: "Qualidade" },
    { id: "fiscalizacao", rotulo: "Atendimento à fiscalização" },
    { id: "administracao", rotulo: "Administração" },
    { id: "meioambiente", rotulo: "Meio ambiente" }
  ];

  /* Fatos impeditivos NÃO imputáveis a quem executa. Esta lista é o que
   * sustenta pedido de prazo: se a frente não foi liberada, o atraso não é da
   * construtora — mas só se estiver registrado NO DIA. */
  RDO.IMPEDIMENTOS = [
    { id: "frente", rotulo: "Frente de serviço não liberada" },
    { id: "projeto", rotulo: "Projeto ou licença pendente" },
    { id: "material_cliente", rotulo: "Material de fornecimento do cliente" },
    { id: "terceiro", rotulo: "Falha de terceiro fora da nossa ingerência" },
    { id: "escassez", rotulo: "Escassez de material no mercado" },
    { id: "geologia", rotulo: "Dificuldade geológica ou hídrica" }
  ];

  /* Situação de cada serviço no dia — o "retrabalho" é o que ninguém registra
   * e é justamente o que explica custo estourado sem avanço. */
  RDO.SITUACOES_SERVICO = [
    { id: "execucao", rotulo: "Em execução" },
    { id: "concluido", rotulo: "Concluído" },
    { id: "paralisado", rotulo: "Paralisado" },
    { id: "retrabalho", rotulo: "Retrabalho" },
    { id: "nao_previsto", rotulo: "Serviço não previsto" }
  ];

  RDO.PERIODOS = [
    { id: "manha", rotulo: "Manhã" },
    { id: "tarde", rotulo: "Tarde" },
    { id: "noite", rotulo: "Noite" }
  ];
  RDO.CONDICOES = [
    { id: "praticavel", rotulo: "Praticável" },
    { id: "parcial", rotulo: "Parcialmente praticável" },
    { id: "impraticavel", rotulo: "Impraticável" }
  ];

  RDO.FUNCOES = ["Engenheiro", "Mestre de obras", "Encarregado", "Técnico de segurança",
    "Apontador", "Pedreiro", "Servente", "Armador", "Carpinteiro", "Eletricista",
    "Encanador", "Pintor", "Azulejista", "Operador de máquina", "Motorista", "Vigia"];

  /* Direta é quem produz; indireta é quem apoia. A separação não é burocracia:
   * ela é o que permite comparar o efetivo com o Hh orçado do SINAPI. */
  RDO.MO_DIRETA = { pedreiro: 1, servente: 1, armador: 1, carpinteiro: 1, eletricista: 1,
    encanador: 1, pintor: 1, azulejista: 1, "operador de maquina": 1 };

  RDO.ehMaoDeObraDireta = function (funcao) {
    var f = String(funcao || "").toLowerCase()
      .replace(/[áàâã]/g, "a").replace(/[éê]/g, "e").replace(/í/g, "i")
      .replace(/[óôõ]/g, "o").replace(/ú/g, "u").replace(/ç/g, "c");
    return !!RDO.MO_DIRETA[f];
  };

  /* Totais do efetivo. `horas` por pessoa é o que vira Hh — e Hh é o que se
   * confronta com o orçamento quando o cliente pergunta por que a mão de obra
   * estourou. */
  RDO.totaisEfetivo = function (efetivo) {
    var t = { pessoas: 0, direta: 0, indireta: 0, terceiros: 0, horas: 0, horasExtras: 0, porFuncao: {} };
    (efetivo || []).forEach(function (p) {
      if (!p) return;
      var q = Number(p.qtd || 1);
      var h = Number(p.horas || 0);
      t.pessoas += q;
      t.horas += h * q;
      t.horasExtras += Number(p.horasExtras || 0) * q;
      if (p.terceiro) t.terceiros += q;
      else if (RDO.ehMaoDeObraDireta(p.funcao)) t.direta += q;
      else t.indireta += q;
      var k = p.funcao || "(sem função)";
      t.porFuncao[k] = (t.porFuncao[k] || 0) + q;
    });
    return t;
  };

  RDO.totaisEquipamentos = function (eqs) {
    var t = { itens: 0, hOperacao: 0, hOciosa: 0, hManutencao: 0, proprios: 0, alugados: 0 };
    (eqs || []).forEach(function (e) {
      if (!e) return;
      var q = Number(e.qtd || 1);
      t.itens += q;
      t.hOperacao += Number(e.hOperacao || 0);
      t.hOciosa += Number(e.hOciosa || 0);
      t.hManutencao += Number(e.hManutencao || 0);
      if (e.alugado) t.alugados += q; else t.proprios += q;
    });
    /* disponibilidade: quanto do tempo o equipamento realmente produziu. É o
       número que denuncia máquina alugada parada no canteiro. */
    var tot = t.hOperacao + t.hOciosa + t.hManutencao;
    t.disponibilidade = tot > 0 ? Math.round((t.hOperacao / tot) * 1000) / 10 : null;
    return t;
  };

  /* Prazo contratual, decorrido e a vencer — carimbados em cada registro.
   * É o campo que faz o diário mostrar sozinho que a obra está atrasada, sem
   * ninguém precisar montar planilha. */
  RDO.prazo = function (obra, dataISO) {
    var o = obra || {};
    if (!o.inicio || !o.termino || !dataISO) return null;
    var total = RDO.diasEntre(o.inicio, o.termino);
    var decorrido = RDO.diasEntre(o.inicio, dataISO);
    if (total <= 0) return null;
    return {
      totalDias: total,
      decorridoDias: Math.max(0, decorrido),
      aVencerDias: total - decorrido,           // negativo = prazo estourado
      pctDecorrido: Math.round((decorrido / total) * 1000) / 10,
      estourado: decorrido > total
    };
  };

  /* Numeração SEQUENCIAL CONTÍNUA — sem pular dia, inclusive domingo, feriado
   * e dia parado. O buraco na sequência é a primeira coisa que a fiscalização
   * procura: diário que pula o dia de chuva perde credibilidade justamente
   * quando ela seria útil. Esta função aponta os buracos. */
  RDO.buracosNaSequencia = function (rdos, obraId) {
    var datas = (rdos || []).filter(function (r) { return r && (!obraId || r.obraId === obraId) && r.data; })
                            .map(function (r) { return r.data; }).sort();
    if (datas.length < 2) return [];
    var faltando = [];
    var d = Date.parse(datas[0] + "T12:00:00Z");
    var fim = Date.parse(datas[datas.length - 1] + "T12:00:00Z");
    var tem = {}; datas.forEach(function (x) { tem[x] = 1; });
    while (d <= fim && faltando.length < 400) {
      var iso = new Date(d).toISOString().slice(0, 10);
      if (!tem[iso]) faltando.push(iso);
      d += 86400000;
    }
    return faltando;
  };

  /* ---------------------------------------------------------------
   * 4) FOTOS
   * --------------------------------------------------------------- */
  RDO.MAX_FOTOS = 20;

  /* Cabe mais uma foto? O teto existe porque a entidade `rdo` inteira vai num
   * único documento da nuvem, e documento tem limite de 1 MiB. Vinte fotos
   * comprimidas cabem; vinte fotos originais de celular, não — por isso a view
   * reduz antes de guardar, e este número sozinho não basta. */
  RDO.cabeFoto = function (fotosAtuais) {
    var n = (fotosAtuais || []).length;
    return { cabe: n < RDO.MAX_FOTOS, restam: Math.max(0, RDO.MAX_FOTOS - n) };
  };

  /* ---------------------------------------------------------------
   * 5) AVALIAÇÃO DO CLIENTE (Portal)
   * --------------------------------------------------------------- */
  RDO.NOTA_MIN = 1;
  RDO.NOTA_MAX = 5;

  RDO.notaValida = function (n) {
    var v = Number(n);
    return !isNaN(v) && v >= RDO.NOTA_MIN && v <= RDO.NOTA_MAX;
  };

  /* Média das notas de uma obra + quantas foram dadas. Sem nota nenhuma
   * devolve null — e a tela escreve "ainda sem avaliação", em vez de zero,
   * que passaria a impressão de nota péssima. */
  RDO.mediaNotas = function (rdos) {
    var ns = (rdos || []).map(function (r) { return (r.avaliacao && r.avaliacao.nota) || null; })
                          .filter(function (n) { return RDO.notaValida(n); })
                          .map(Number);
    if (!ns.length) return { media: null, qtd: 0 };
    var soma = ns.reduce(function (a, b) { return a + b; }, 0);
    return { media: Math.round((soma / ns.length) * 10) / 10, qtd: ns.length };
  };

  /* Ranking das obras por nota do cliente — é o que o gestor pediu para saber
   * onde a relação está boa e onde está azedando.
   * Obra sem nota nenhuma vai para o FIM da lista, nunca para o topo: sem
   * avaliação não é "nota máxima", é ausência de informação. */
  RDO.rankingObras = function (rdos, obras) {
    var porObra = {};
    (rdos || []).forEach(function (r) {
      if (!r.obraId) return;
      (porObra[r.obraId] = porObra[r.obraId] || []).push(r);
    });
    var nomes = {};
    (obras || []).forEach(function (o) { nomes[o.id] = o.nome; });
    return Object.keys(porObra).map(function (id) {
      var m = RDO.mediaNotas(porObra[id]);
      return { obraId: id, obra: nomes[id] || "(obra removida)", media: m.media, avaliacoes: m.qtd, diarios: porObra[id].length };
    }).sort(function (a, b) {
      if (a.media == null && b.media == null) return 0;
      if (a.media == null) return 1;
      if (b.media == null) return -1;
      return b.media - a.media;
    });
  };

  /* ---------------------------------------------------------------
   * 6) O QUE VAI PARA O PORTAL DO CLIENTE
   *
   * O Portal é a única parte do sistema que uma pessoa de FORA lê. Por isso o
   * que vai para lá não é o registro: é uma versão curada dele, montada aqui
   * (função pura, testável) e não no meio da tela.
   *
   * Três regras que valem a pena estarem escritas:
   *
   *   1) SÓ VAI O QUE O GESTOR PUBLICOU. O fluxo de aprovação não vale nada se
   *      o envio ao Portal varrer tudo que não é rascunho — era assim que
   *      estava, e o diário chegava ao cliente sem ninguém ter aprovado.
   *   2) NOME DE TRABALHADOR NÃO VAI. O efetivo sobe como total por função
   *      ("3 pedreiros, 2 serventes"), nunca como lista de pessoas. O cliente
   *      precisa saber o tamanho da equipe, não quem estava lá.
   *   3) ACIDENTE É DECISÃO DO RESPONSÁVEL TÉCNICO. O texto de acidente traz
   *      envolvido, causa e afastamento — dado pessoal, e às vezes de saúde.
   *      Vai só se quem publica marcar; por padrão o Portal mostra que houve
   *      registro e manda consultar o diário oficial.
   * --------------------------------------------------------------- */
  RDO.PORTAL_VERSAO = 2;

  /* O diário pode ser visto pelo cliente?
   *
   * Registro NOVO (tem `estado`): só publicado. Ponto.
   * Registro ANTIGO (nasceu antes do fluxo de aprovação, só tem `status`):
   * vale a regra que valia quando ele foi escrito. Aplicar a regra nova neste
   * caso APAGARIA do Portal o histórico que o cliente já acompanhava — o
   * cliente abriria o portal e veria a obra sem passado, sem nada ter
   * acontecido. */
  /* ⚠ O LEGADO PRECISA DE UM NOME.
   * O diário antigo (só `status`, sem `estado`) ia ao cliente — e a lista, que
   * lê `r.estado || "rascunho"`, mostrava **Rascunho** para ele. As duas telas
   * contavam histórias opostas sobre o mesmo diário, e não havia como tirá-lo
   * do ar: o botão Despublicar só aparece para quem está em "publicado".
   * Agora ele tem estado próprio: quem desenha e quem publica passam pela mesma
   * função e dizem a mesma coisa. */
  /* ⚠ E O RÓTULO NÃO PODE PROMETER O QUE NÃO ACONTECEU.
   * A sessão B levantou, com razão, que `status: "finalizado"` é um <select> que
   * alguém marcou — não é prova de que o diário foi ao cliente. Ele SÓ chegou lá
   * se a obra tem Portal publicado; numa obra sem Portal, nada saiu do
   * escritório, e chamá-lo de "Publicado" seria mentir na direção contrária à
   * que eu estava consertando.
   * Por isso o segundo argumento, e por isso ele começa em FALSO: quem afirma
   * que o cliente vê é quem sabe que existe Portal. */
  RDO.estadoDe = function (r, temPortal) {
    if (!r) return "rascunho";
    if (r.estado) return r.estado;
    if (!r.status || r.status === "rascunho") return "rascunho";
    return temPortal ? "publicado_legado" : "finalizado_legado";
  };

  /* aqui o `true` é literal: esta função só é consultada ao montar o que vai
     para uma obra que TEM Portal — é a única situação em que a pergunta faz
     sentido. */
  RDO.podeIrAoPortal = function (r) {
    var e = RDO.estadoDe(r, true);
    return e === "publicado" || e === "publicado_legado";
  };

  /* Efetivo em texto, sem nome de ninguém: "3 pedreiro, 2 servente (5 pessoas)". */
  RDO.efetivoResumo = function (efetivo) {
    var t = RDO.totaisEfetivo(efetivo);
    if (!t.pessoas) return "";
    var partes = [];
    Object.keys(t.porFuncao).forEach(function (f) {
      partes.push(t.porFuncao[f] + " " + String(f).toLowerCase());
    });
    return partes.join(" · ");
  };

  /* Uma linha por foto: { i: id no servidor, t: tenant, leg }.
   * Foto que nunca subiu não tem id remoto — vai como base64 (`d`), que é o
   * modo antigo, e é o único jeito de ela aparecer para o cliente. */
  function fotoDoPortal(f) {
    if (!f) return null;
    if (f.remoto && f.tenant) return { i: f.remoto, t: f.tenant, leg: f.leg || "" };
    if (f.d) return { d: f.d, leg: f.leg || "" };
    return null;   // ainda na fila de subida: some do Portal até subir
  }

  /* opts:
   *   rotClima(codigo)      → rótulo do clima do schema antigo (ensolarado…)
   *   rotCondicao(id)       → rótulo da condição do schema antigo
   *   incluirAcidente       → publica o TEXTO do acidente (padrão: não)
   *   maxFotos              → teto de fotos por diário (padrão RDO.MAX_FOTOS) */
  RDO.paraPortal = function (r, opts) {
    if (!r) return null;
    var o = opts || {};
    var rotC = typeof o.rotClima === "function" ? o.rotClima : function (x) { return x || ""; };
    var rotK = typeof o.rotCondicao === "function" ? o.rotCondicao : function (x) { return x || ""; };
    var maxF = o.maxFotos || RDO.MAX_FOTOS;

    var tEf = r.totaisEfetivo || RDO.totaisEfetivo(r.efetivo);
    var tEq = r.totaisEquip || RDO.totaisEquipamentos(r.equipamentosItens);
    /* efetivo em número: o campo do schema antigo quando ele existe, senão o
       total do efetivo lançado por função */
    var efetivoNum = (r.efetivoDireto != null || r.efetivoIndireto != null)
      ? (Number(r.efetivoDireto || 0) + Number(r.efetivoIndireto || 0))
      : tEf.pessoas;
    if (!efetivoNum && tEf.pessoas) efetivoNum = tEf.pessoas;

    var cond = r.clima ? RDO.condicaoPorClima(r.clima, RDO.diaNaoTrabalhavel(r)) : null;

    /* ⚠ PRODUÇÃO INDIVIDUAL FORA DO PACOTE DO CLIENTE.
     * A defesa que já funciona é o `map` de `servicos` logo abaixo: ele monta
     * um objeto NOVO campo a campo (allowlist), então `producao` nunca subiu.
     * Só que allowlist é uma linha de distância de deixar de ser: basta
     * alguém trocar por um spread "para não esquecer campo nenhum" e o nome
     * do trabalhador, com o valor que ele recebe, vai para o cliente.
     * `Producao.limparParaPortal` era a defesa DECLARADA no cabeçalho do
     * módulo e não estava ligada em lugar nenhum — código morto protegendo no
     * papel. Ligada aqui, sobre uma cópia: o diário original não é tocado. */
    var itensPortal = (typeof Producao !== "undefined" && Producao.limparParaPortal)
      ? Producao.limparParaPortal(r.atividadesItens || [])
      : (r.atividadesItens || []);

    var p = {
      v: RDO.PORTAL_VERSAO,
      id: r.id || "",
      numero: r.numero || "",
      data: r.data || "",
      /* --- campos que o Portal antigo já lê (não mexer nos nomes) --- */
      climaManha: rotC(r.climaManha),
      climaTarde: rotC(r.climaTarde),
      condicao: rotK(r.condicao),
      efetivo: efetivoNum || "",
      atividades: r.atividades || "",
      ocorrencias: r.ocorrencias || "",
      equipamentos: r.equipamentos || "",
      responsavel: r.responsavel || "",
      autor: r.autor || "",
      fotos: (r.fotos || []).slice(0, maxF).map(fotoDoPortal).filter(Boolean),
      /* --- o diário reconstruído --- */
      climaTexto: r.clima ? RDO.textoClima(r.clima) : "",
      climaEvidencia: (cond && cond.motivo) || "",
      climaCondicao: cond ? cond.condicao : "",
      servicos: itensPortal.map(function (a) {
        var av = RDO.calcAvanco(a);
        /* ⚠ ACUMULADO NO PACOTE DO CLIENTE.
         * `pct` sempre foi o do DIA (executado ÷ previsto), e sozinho ele
         * engana: 18 de 200 sai como 9% tanto no primeiro dia quanto no
         * último. Quem abre o Portal quer saber ONDE o serviço está, não
         * quanto andou hoje.
         * Só entra quando o chamador passa `opts.rdos` — sem a lista dos
         * outros diários não há acumulado, e inventar um seria pior que não
         * ter. `pct` fica no lugar: portal publicado antes desta versão
         * continua lendo o campo que já conhecia. */
        var ac = null;
        if (o.rdos && typeof Avanco !== "undefined") {
          ac = Avanco.calcular({ rdos: o.rdos, obraId: r.obraId, data: r.data, rdoId: r.id, item: a });
        }
        return {
          /* A CHAVE DO SERVIÇO VAI JUNTO — é o que permite ao Portal
             reagrupar, filtrar e ponderar do lado do cliente sem pedir nada
             ao servidor a cada clique de filtro. Ela não revela nada: é
             origem+refId (ou código, ou descrição) + unidade, tudo já visível
             na própria linha. O que NÃO vai é o preço — o peso viaja
             normalizado em `fisico.pesos`. */
          chave: (typeof Avanco !== "undefined" && Avanco.chaveServico) ? Avanco.chaveServico(a) : "",
          numero: a.numero || "", descricao: a.descricao || "", etapa: a.etapa || "",
          unidade: a.unidade || "", qtdPrevista: Number(a.qtdPrevista || 0),
          qtdExecutada: Number(a.qtdExecutada || 0), pct: av.pct,
          qtdAnterior: ac ? ac.anterior : null,
          qtdAcumulada: ac ? ac.total : null,
          qtdSaldo: ac && ac.temPrevisto ? ac.saldo : null,
          pctAcumulado: ac && ac.temPrevisto ? ac.pctTotal : null,
          situacao: a.situacao || "", situacaoRotulo: rotuloDe(RDO.SITUACOES_SERVICO, a.situacao)
        };
      }),
      efetivoResumo: RDO.efetivoResumo(r.efetivo),
      efetivoTotais: { pessoas: tEf.pessoas, direta: tEf.direta, indireta: tEf.indireta,
                       terceiros: tEf.terceiros, horas: tEf.horas },
      equipamentosLista: (r.equipamentosItens || []).map(function (e) {
        return { tipo: e.tipo || "", qtd: Number(e.qtd || 1), hOperacao: Number(e.hOperacao || 0),
                 hOciosa: Number(e.hOciosa || 0), alugado: !!e.alugado };
      }),
      equipamentosDisponibilidade: tEq.disponibilidade,
      ocorrenciasLista: (r.ocorrenciasItens || []).map(function (x) {
        return { tipo: x.tipo || "", tipoRotulo: rotuloDe(RDO.TIPOS_OCORRENCIA, x.tipo),
                 descricao: x.descricao || "", horasParadas: Number(x.horasParadas || 0) };
      }),
      semRestricoes: !!r.semRestricoes,
      paralisacao: (r.paralisacao && r.paralisacao.houve) ? {
        houve: true, inicio: r.paralisacao.inicio || "", fim: r.paralisacao.fim || "",
        motivo: r.paralisacao.motivo || "", previsaoReinicio: r.paralisacao.previsaoReinicio || ""
      } : null,
      impedimentos: (r.impedimentos || []).map(function (i) { return rotuloDe(RDO.IMPEDIMENTOS, i); }),
      visitas: r.visitas || "",
      /* acidente: o cliente sempre SABE que houve; o texto só com autorização
         de quem publica (envolvido/causa/afastamento é dado pessoal) */
      acidenteHouve: !!String(r.acidente || "").trim(),
      acidente: o.incluirAcidente ? (r.acidente || "") : "",
      publicadoEm: r.publicadoEm || "",
      aprovadoPor: r.aprovadoPor || ""
    };
    return p;
  };

  function rotuloDe(lista, id) {
    var achou = "";
    (lista || []).forEach(function (x) { if (x.id === id) achou = x.rotulo; });
    return achou || id || "";
  }

  /* Os ids de foto que o servidor precisa liberar para aquele cliente. Sem esta
   * lista o Portal pede a foto e leva 403 — o servidor de fotos só serve o que
   * está publicado AGORA. E o tenant vem por foto, não fixo: renovar a licença
   * muda o tenant, e as fotos antigas continuam na pasta antiga. */
  RDO.fotosPublicadas = function (rdosPortal) {
    var ids = {}, tenants = {};
    (rdosPortal || []).forEach(function (r) {
      (r.fotos || []).forEach(function (f) {
        if (f && f.i) { ids[f.i] = 1; if (f.t) tenants[f.t] = 1; }
      });
    });
    return { ids: Object.keys(ids), tenants: Object.keys(tenants) };
  };

  /* ---------------------------------------------------------------
   * 7) A VOLTA: o que o cliente escreveu
   *
   * O cliente avalia o diário e comenta. Isso vive no servidor (o app do
   * engenheiro pode estar fechado quando ele escreve), e o app puxa quando
   * abre. Aqui só a parte que precisa estar certa: casar cada avaliação com o
   * diário certo e não deixar nota inventada entrar.
   * --------------------------------------------------------------- */

  /* Casa o retorno do servidor com os diários locais.
   * A chave é o ID do diário; o NÚMERO ("RDO-0007") é aceito como segunda
   * chance porque diário publicado antes desta versão foi ao Portal sem id.
   * Devolve quantos registros mudaram — quem chama grava só esses. */
  function temPropria(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  RDO.aplicarAvaliacoes = function (rdos, avaliacoes) {
    var mudou = [];
    if (!rdos || !avaliacoes) return mudou;
    var porId = {}, porNumero = {};
    rdos.forEach(function (r) {
      if (!r) return;
      if (r.id) porId[r.id] = r;
      if (r.numero && !porNumero[r.numero]) porNumero[r.numero] = r;
    });
    Object.keys(avaliacoes).forEach(function (chave) {
      var a = avaliacoes[chave];
      if (!a || !RDO.notaValida(a.nota)) return;
      /* ⚠ `porId[chave]` sem esta guarda devolvia o que o Object TEM por
       * herança: com a chave "constructor" o alvo virava a função Object, e o
       * app do engenheiro gravava `avaliacao` DENTRO dela — depois mandava
       * isso para o Store como se fosse um diário. A chave vem do servidor,
       * que a recebeu do cliente: é entrada de fora, não dado nosso. */
      var alvo = temPropria(porId, chave) ? porId[chave] : (temPropria(porNumero, chave) ? porNumero[chave] : null);
      if (!alvo) return;
      var atual = alvo.avaliacao || {};
      /* só grava se mudou — senão toda abertura do app reescreve o registro
         inteiro e a nuvem sincroniza o mesmo dado para sempre */
      if (Number(atual.nota) === Number(a.nota) && (atual.comentario || "") === (a.comentario || "")) return;
      alvo.avaliacao = { nota: Number(a.nota), comentario: a.comentario || "", em: a.em || "" };
      mudou.push(alvo);
    });
    return mudou;
  };

  /* ====================================================================
   * BASEAR O DIÁRIO DE HOJE NO ANTERIOR
   *
   * Na obra, de um dia para o outro muda a ATIVIDADE — a equipe, os
   * equipamentos e as condições costumam ser os mesmos. Redigitar tudo é o
   * que faz o encarregado parar de lançar RDO.
   *
   * O QUE NUNCA É COPIADO, e por quê — esta lista é a parte importante:
   *  • clima e chuva: vêm da fonte meteorológica DAQUELE dia e alimentam o
   *    critério de dia impraticável (SICRO). Copiar a chuva de ontem é
   *    fabricar prova de paralisação.
   *  • ocorrências, acidente, paralisação, visitas, comunicações: são fatos
   *    de um dia específico. Um acidente que se repete sozinho no papel é
   *    problema sério, não conveniência.
   *  • fotos: são o registro daquele dia.
   *  • quantidade executada dos serviços: a descrição do serviço volta (é o
   *    que poupa digitação), mas o QUANTO foi feito nasce zerado — senão a
   *    medição do mês soma a mesma produção todo dia.
   *  • estado, aprovação, assinatura, número e data: o diário novo nasce
   *    rascunho, com número e data próprios.
   *
   * `origem` DEVE ser da mesma obra que se está lançando — quem chama é
   * responsável por isso, e a função marca `baseadoEm` para deixar rastro.
   * ==================================================================== */
  RDO.CAMPOS_HERDADOS = ["obraId", "condicao", "terceiros", "efetivoDireto", "efetivoIndireto", "semRestricoes", "impedimentos", "impedimentosObs"];

  RDO.basearEm = function (origem, opcoes) {
    var o = origem || {}, op = opcoes || {}, novo = {};
    RDO.CAMPOS_HERDADOS.forEach(function (k) { if (o[k] !== undefined) novo[k] = o[k]; });

    /* equipe e equipamentos vêm inteiros — é o grosso da digitação */
    novo.efetivo = (o.efetivo || []).map(function (e) { return JSON.parse(JSON.stringify(e)); });
    novo.equipamentosItens = (o.equipamentosItens || []).map(function (e) { return JSON.parse(JSON.stringify(e)); });

    /* serviços: volta a LISTA, zerada no que é produção do dia */
    novo.atividadesItens = (o.atividadesItens || []).map(function (a) {
      var n = JSON.parse(JSON.stringify(a));
      ["quantidade", "qtd", "qtdExecutada", "quantidadeExecutada", "percentual", "pct", "avanco"].forEach(function (k) {
        if (n[k] !== undefined) n[k] = 0;
      });
      /* a produção por colaborador é do dia; some, mas o serviço fica */
      if (n.producao) n.producao = [];
      if (n.situacao) n.situacao = "em_andamento";
      return n;
    });
    if (op.semServicos) novo.atividadesItens = [];

    novo.atividades = "";                 /* o texto do dia é do dia */
    novo.estado = "rascunho";
    novo.status = "rascunho";
    novo.fotos = [];
    novo.baseadoEm = o.id || "";
    novo.baseadoEmNumero = o.numero || "";
    return novo;
  };

  /* Último diário DA MESMA OBRA — nunca de outra: equipe e equipamentos de
     uma obra não descrevem outra, e herdar entre obras seria um erro que o
     usuário não teria como perceber no papel. */
  RDO.ultimoDaObra = function (diarios, obraId, exceptoId) {
    var alvo = String(obraId || ""), melhor = null;
    if (!alvo) return null;
    (diarios || []).forEach(function (r) {
      if (!r || String(r.obraId || "") !== alvo) return;
      if (exceptoId && r.id === exceptoId) return;
      if (!melhor) { melhor = r; return; }
      var a = String(r.data || ""), b = String(melhor.data || "");
      if (a > b || (a === b && String(r.numero || "") > String(melhor.numero || ""))) melhor = r;
    });
    return melhor;
  };

  if (typeof window !== "undefined") window.RDO = RDO;
  if (typeof module !== "undefined" && module.exports) module.exports = RDO;
})(typeof window !== "undefined" ? window : globalThis);

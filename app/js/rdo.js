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

  /* Traduz o clima do dia para a condição de trabalho do diário.
   *
   * O critério NÃO é o código do tempo sozinho: chuva de 10 minutos não para
   * obra nenhuma, e "encoberto" com 30 mm acumulados para. Quem manda é a
   * CHUVA MEDIDA — milímetros e, principalmente, horas de chuva, que é o que
   * de fato consome a jornada.
   *
   *   impraticavel : choveu 4 h ou mais, ou passou de 25 mm no dia
   *   parcial      : choveu 1 h ou mais, ou passou de 5 mm
   *   praticavel   : o resto
   *
   * Os cortes são convenção nossa e estão escritos no impresso justamente
   * para o cliente poder discordar sabendo do que se trata — número exposto
   * se discute; número escondido vira briga. */
  RDO.condicaoPorClima = function (clima) {
    if (!clima) return { condicao: "praticavel", motivo: "" };
    var mm = Number(clima.chuvaMm || 0);
    var h = Number(clima.chuvaHoras || 0);
    var sev = RDO.severidadeWMO(clima.codigo);

    if (h >= 4 || mm >= 25) {
      return { condicao: "impraticavel",
               motivo: "Chuva de " + RDO.numBR(mm) + " mm em " + RDO.numBR(h) + " h" };
    }
    if (h >= 1 || mm >= 5) {
      return { condicao: "parcial",
               motivo: "Chuva de " + RDO.numBR(mm) + " mm em " + RDO.numBR(h) + " h" };
    }
    if (sev === "ruim") {
      return { condicao: "parcial", motivo: RDO.descreverWMO(clima.codigo) };
    }
    return { condicao: "praticavel", motivo: "" };
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
          qtdPrevista: Number(it.qtd || 0),
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

  /* Digitada na hora, quando não existe em fonte nenhuma. */
  RDO.atividadeAvulsa = function (descricao, unidade, qtdPrevista) {
    return {
      origem: "avulsa",
      refId: "",
      etapa: "",
      numero: "",
      descricao: String(descricao || "").trim(),
      unidade: String(unidade || "").trim(),
      qtdPrevista: Number(qtdPrevista || 0),
      codigo: ""
    };
  };

  RDO.ORIGENS = { orcamento: "Orçamento", cronograma: "Cronograma", lastplanner: "Last Planner", avulsa: "Cadastrada no diário" };

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
    publicado:    { rotulo: "Publicado ao cliente", cor: "azul", cliente: true }
  };

  var TRANSICOES = {
    rascunho:     { enviar: "em_aprovacao" },
    em_aprovacao: { aprovar: "aprovado", revisar: "em_revisao" },
    em_revisao:   { enviar: "em_aprovacao" },
    aprovado:     { publicar: "publicado", revisar: "em_revisao" },
    publicado:    { despublicar: "aprovado" }
  };

  /* Quem pode o quê. O AUTOR não aprova o próprio diário — se pudesse, o
   * controle que o gestor pediu não existiria. */
  RDO.podeAcao = function (acao, usuario, rdo) {
    var u = usuario || {}, r = rdo || {};
    var gestor = (u.papel !== "usuario");                       // admin/gestor/gerente
    var autor = !!(r.autorId && u.id && r.autorId === u.id);
    if (acao === "enviar")   return autor || gestor;
    if (acao === "aprovar")  return gestor && !autor;           // nunca o próprio autor
    if (acao === "revisar")  return gestor;
    if (acao === "publicar") return gestor;
    if (acao === "despublicar") return gestor;
    if (acao === "editar")   return (autor && (r.estado === "rascunho" || r.estado === "em_revisao")) || (gestor && r.estado !== "publicado");
    return false;
  };

  /* Aplica a transição. Devolve {ok, estado, erro} — nunca lança, porque isso
   * roda no meio de um clique na obra. */
  RDO.transicionar = function (rdo, acao, usuario, dados) {
    var r = rdo || {}, d = dados || {};
    var atual = r.estado || "rascunho";
    var mapa = TRANSICOES[atual] || {};
    var destino = mapa[acao];

    if (!destino) return { ok: false, erro: "Não dá para " + acao + " um diário " + ((RDO.ESTADOS[atual] || {}).rotulo || atual).toLowerCase() + "." };
    if (!RDO.podeAcao(acao, usuario, r)) {
      return { ok: false, erro: acao === "aprovar" && r.autorId && usuario && r.autorId === usuario.id
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
    var temAtiv = (r.atividades && r.atividades.length) || String(r.atividadesTexto || "").trim();
    if (!temAtiv) e.push("Um diário sem nenhuma atividade não registra nada — inclua ao menos uma.");
    if (r.condicao === "impraticavel" && !String(r.ocorrencias || "").trim() && !(r.clima && Number(r.clima.chuvaMm) > 0)) {
      e.push("Dia impraticável precisa de justificativa: descreva a ocorrência ou busque o clima do dia.");
    }
    return { ok: !e.length, erros: e };
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
   * onde a relação está boa e onde está azedando. */
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

  if (typeof window !== "undefined") window.RDO = RDO;
  if (typeof module !== "undefined" && module.exports) module.exports = RDO;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
 * msproject.js — cronograma do OrçaPRO no formato MSPDI (MS Project XML).
 * Abre no MS Project, no ProjectLibre e no GanttProject.
 *
 * POR QUE EXISTE: construtora grande e órgão público pedem o cronograma "em
 * Project". Sem esta saída, alguém redigita 40 etapas com dependência à mão —
 * e o cronograma que vai ao contratante deixa de ser o que o app calculou.
 *
 * ⚠ A REDE VEM DO MOTOR, NÃO DAQUI. As datas, o lag efetivo de cada elo
 *   (`predDesloc`) e a duração saem do `Cronograma.estimar`. Este arquivo só
 *   traduz para XML. Recalcular qualquer coisa aqui abriria a porta para o
 *   Project mostrar um cronograma diferente do que o cliente viu em PDF.
 *
 * ⚠ UNIDADE DO LAG: no MSPDI o `LinkLag` é contado em DÉCIMOS DE MINUTO, e não
 *   em dias — com jornada de 8 h, 1 dia útil = 480 min = 4800 décimos. Escrever
 *   "7" onde se queria 7 dias vira 42 segundos de espera, e a cura do concreto
 *   desaparece do cronograma sem erro nenhum. O `LagFormat 7` só diz em que
 *   unidade o Project EXIBE o número.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MIN_DIA = 480;          // 8 h de jornada — a mesma que o calendário abaixo declara
  var DEC_POR_DIA = MIN_DIA * 10; // décimos de minuto num dia útil

  function x(s) {
    return String(s == null ? "" : s)
      // caractere de controle e ILEGAL em XML 1.0: um deles, vindo de
      // descricao colada de PDF, faz o Project recusar o arquivo inteiro
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function dt(d, hora) {
    if (!d || typeof d.getFullYear !== "function") return "";
    return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()) + "T" + hora;
  }
  function trabalha(wd, dpw) { return dpw >= 7 ? true : (dpw === 6 ? wd !== 0 : (wd !== 0 && wd !== 6)); }
  function ch(d) { return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  /* ⚠ o feriado precisa entrar no CALENDÁRIO do Project, não só nas datas. Sem
     a exceção, o Project recalcula a rede pelo calendário dele (que só conhece
     sábado e domingo) e devolve datas ANTERIORES às que o cliente recebeu em
     PDF — duas versões do mesmo cronograma, e a do contratante é a otimista. */
  function ehParado(d, dpw, feriados) { return !trabalha(d.getDay(), dpw) || !!(feriados && feriados[ch(d)]); }
  /* O `dataFim` do motor é o dia em que a etapa DEIXA de ocupar a equipe (fim =
     início + duração, em dias úteis). O Project quer o ÚLTIMO dia trabalhado,
     às 17 h — emitir o dia seguinte faz a etapa aparecer com um dia a mais lá
     dentro, e o cronograma impresso deixa de bater com o do contratante. */
  function ultimoDiaUtil(dataFim, dpw, feriados) {
    var d = new Date(dataFim.getTime()), guarda = 0;
    do { d.setDate(d.getDate() - 1); guarda++; } while (ehParado(d, dpw, feriados) && guarda < 40);
    return d;
  }

  var MSProject = {
    EXT: ".xml",

    nomeArquivo: function (orc) {
      var n = String((orc && (orc.numero || orc.nome)) || "cronograma").replace(/[^\wÀ-ÿ.-]+/g, "-").replace(/^-+|-+$/g, "");
      return "Cronograma-" + (n || "obra") + this.EXT;
    },

    // orc: orçamento · r: resultado de Cronograma.estimar (calcula se faltar)
    gerarXML: function (orc, r) {
      if (!r && typeof Cronograma !== "undefined" && Cronograma.estimar) r = Cronograma.estimar(orc);
      if (!r || !r.etapas) return "";
      var dpw = (r.params && r.params.diasUteisSemana) || 5;
      var mapaFer = (r.feriados && r.feriados.mapa) || {};
      var uid = {}; r.etapas.forEach(function (e, i) { uid[e.id] = i + 1; });

      var L = [];
      L.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
      L.push('<Project xmlns="http://schemas.microsoft.com/project">');
      L.push('<Name>' + x(MSProject.nomeArquivo(orc)) + '</Name>');
      L.push('<Title>' + x((orc && orc.nome) || "Cronograma da obra") + '</Title>');
      L.push('<Company>' + x((typeof Empresa !== "undefined" && Empresa.nomeDoc) ? Empresa.nomeDoc() : "") + '</Company>');
      L.push('<ScheduleFromStart>1</ScheduleFromStart>');
      L.push('<StartDate>' + dt(r.dataInicio, "08:00:00") + '</StartDate>');
      L.push('<CalendarUID>1</CalendarUID>');
      L.push('<DefaultStartTime>08:00:00</DefaultStartTime>');
      L.push('<DefaultFinishTime>17:00:00</DefaultFinishTime>');
      L.push('<MinutesPerDay>' + MIN_DIA + '</MinutesPerDay>');
      L.push('<MinutesPerWeek>' + (MIN_DIA * dpw) + '</MinutesPerWeek>');
      L.push('<DaysPerMonth>' + (dpw * 4) + '</DaysPerMonth>');
      L.push('<DurationFormat>7</DurationFormat>');   // 7 = dias
      L.push('<WorkFormat>2</WorkFormat>');

      // ---- calendário: a MESMA semana de trabalho do app (5, 6 ou 7 dias) ----
      L.push('<Calendars><Calendar><UID>1</UID><Name>Semana da obra</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>');
      for (var w = 1; w <= 7; w++) {   // 1 = domingo … 7 = sábado
        var util = trabalha(w - 1, dpw);
        L.push('<WeekDay><DayType>' + w + '</DayType><DayWorking>' + (util ? 1 : 0) + '</DayWorking>' +
          (util ? '<WorkingTimes>' +
            '<WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>' +
            '<WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>' +
            '</WorkingTimes>' : '') + '</WeekDay>');
      }
      L.push('</WeekDays>');
      // feriados do período viram EXCEÇÕES do calendário (o Project recalcula por ele)
      var fers = ((r.feriados && r.feriados.lista) || []).filter(function (f) {
        var d = new Date(f.data + "T12:00:00");
        return d >= r.dataInicio && d <= r.dataFim;
      });
      if (fers.length) {
        L.push('<Exceptions>');
        fers.forEach(function (f) {
          L.push('<Exception><EnteredByOccurrences>0</EnteredByOccurrences>' +
            '<TimePeriod><FromDate>' + f.data + 'T00:00:00</FromDate><ToDate>' + f.data + 'T23:59:00</ToDate></TimePeriod>' +
            '<Occurrences>1</Occurrences><Name>' + x(f.nome) + '</Name><Type>1</Type><DayWorking>0</DayWorking></Exception>');
        });
        L.push('</Exceptions>');
      }
      L.push('</Calendar></Calendars>');

      // ---- tarefas ----
      L.push('<Tasks>');
      r.etapas.forEach(function (e, i) {
        var marco = !!e.marco || !e.duracao;
        var horas = Math.round((e.duracao || 0) * 8);
        var fim = marco ? e.dataInicio : ultimoDiaUtil(e.dataFim, dpw, mapaFer);
        var nota = "Frente: " + (e.categoriaNome || e.categoria || "—") +
          (e.critico ? " | CAMINHO CRITICO (sem folga)" : " | folga: " + (e.folga || 0) + " dia(s)") +
          (e.editado ? " | duracao informada pela equipe" : "");
        L.push('<Task>');
        L.push('<UID>' + uid[e.id] + '</UID><ID>' + (i + 1) + '</ID>');
        L.push('<Name>' + x(((e.codigo ? e.codigo + " " : "") + (e.nome || "Etapa " + (i + 1))).trim()) + '</Name>');
        L.push('<Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull>');
        L.push('<OutlineLevel>1</OutlineLevel><WBS>' + (i + 1) + '</WBS>');
        L.push('<Start>' + dt(e.dataInicio, "08:00:00") + '</Start>');
        L.push('<Finish>' + dt(fim, marco ? "08:00:00" : "17:00:00") + '</Finish>');
        L.push('<Duration>PT' + horas + 'H0M0S</Duration><DurationFormat>7</DurationFormat>');
        L.push('<Milestone>' + (marco ? 1 : 0) + '</Milestone>');
        L.push('<ConstraintType>0</ConstraintType>');   // 0 = o quanto antes (a rede manda)
        L.push('<CalendarUID>1</CalendarUID>');
        L.push('<Critical>' + (e.critico ? 1 : 0) + '</Critical>');
        L.push('<Notes>' + x(nota) + '</Notes>');
        (e.preds || []).forEach(function (pid) {
          if (!uid[pid]) return;
          var dias = (e.predDesloc && e.predDesloc[pid] != null) ? e.predDesloc[pid] : 0;
          L.push('<PredecessorLink><PredecessorUID>' + uid[pid] + '</PredecessorUID>' +
            '<Type>1</Type><CrossProject>0</CrossProject>' +
            '<LinkLag>' + Math.round(dias * DEC_POR_DIA) + '</LinkLag><LagFormat>7</LagFormat></PredecessorLink>');
        });
        L.push('</Task>');
      });
      L.push('</Tasks>');
      L.push('</Project>');
      return L.join("\n");
    }
  };

  global.MSProject = MSProject;
  if (typeof module !== "undefined" && module.exports) module.exports = MSProject;
})(typeof window !== "undefined" ? window : this);

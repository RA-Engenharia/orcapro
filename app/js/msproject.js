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

  /* ---------------------------------------------------------------------
     CRONOGRAMA EXECUTIVO (opts.detalhe) — ajudantes do XML hierárquico
     ---------------------------------------------------------------------
     INSTANTE = dia + hora, como o Project enxerga: tarefa começa às 8 h e
     termina às 17 h do último dia trabalhado; marco (duração 0) começa e
     termina às 8 h. É isso que decide onde o sucessor término-início cai:
     fim às 17 h → manhã do PRÓXIMO dia útil; fim às 8 h (marco) → a MESMA
     manhã. Um resumo termina no maior fim dos filhos — e se o último filho é
     um marco no dia seguinte ao fim dos outros, o resumo termina "8 h do dia
     D+1", que para o sucessor é o mesmo que "17 h do dia D". */
  var MAX_NOME = 250;   // o Project recusa nome de tarefa com mais de 255 caracteres (descrição SINAPI passa disso)
  function nomeCurto(s) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    return s.length > MAX_NOME ? s.slice(0, MAX_NOME - 1) + "…" : s;
  }
  function ehData(d) { return !!d && typeof d.getTime === "function" && !isNaN(d.getTime()); }
  function inst(d, h) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime(); }
  function diaDe(k) { var d = new Date(k); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function manha(k) { return new Date(k).getHours() < 12; }
  function proxInicio(k, dpw, fer) {
    if (manha(k)) return k;
    var d = diaDe(k), g = 0;
    do { d.setDate(d.getDate() + 1); g++; } while (ehParado(d, dpw, fer) && g < 40);
    return inst(d, 8);
  }
  // [início, fim] da tarefa-FOLHA exatamente como ela é escrita no XML
  function instantesFolha(no, dpw, fer) {
    var zero = !!no.marco || !no.duracao;
    var fim = zero ? no.dataInicio : ultimoDiaUtil(no.dataFim, dpw, fer);
    return { a: inst(no.dataInicio, 8), b: inst(fim, zero ? 8 : 17), zero: zero };
  }
  function fmtQtd(q) { var s = String(Math.round((Number(q) || 0) * 1000) / 1000); return s.replace(".", ","); }

  var MSProject = {
    EXT: ".xml",

    nomeArquivo: function (orc) {
      var n = String((orc && (orc.numero || orc.nome)) || "cronograma").replace(/[^\wÀ-ÿ.-]+/g, "-").replace(/^-+|-+$/g, "");
      return "Cronograma-" + (n || "obra") + this.EXT;
    },

    /* opts.detalhe: "subetapa" (etapa → subetapas) ou "servico" (→ serviços).
       Qualquer outra coisa — ausente, "etapa", texto torto — é o XML de sempre.
       ⚠ Documento só detalha quando QUEM CHAMA pede: proposta e demais
       chamadores não passam `detalhe`, e o arquivo deles tem de sair byte a byte
       igual ao de antes (tools/test-crono-documentos.js compara com a cópia do
       master). */
    _detalhe: function (opts) {
      var d = opts && opts.detalhe;
      return (d === "subetapa" || d === "servico") ? d : null;
    },

    /* r com a árvore EAP, para quando o detalhe foi pedido sem r. Os números da
       planilha vêm do `Orcamento.calcular` quando ele está carregado. */
    _estimarEAP: function (orc) {
      if (typeof Cronograma === "undefined" || !Cronograma.estimar) return null;
      var ctx = { eap: true };
      try { if (typeof Orcamento !== "undefined" && Orcamento.calcular) ctx.calc = Orcamento.calcular(orc); } catch (e) { ctx.calc = null; }
      return Cronograma.estimar(orc, null, ctx);
    },

    /* PLANO do XML hierárquico, PURO (a tela usa para o recado com números).
       r = Cronograma.estimar(orc, override, {eap:true, ...}). Devolve
       {ok, motivo?, detalhe, linhas:[{no, nivel, resumo, uid, id, outline,
       filhos, a, b, links, semBase, recolhida}], contagens {etapas, resumos,
       folhas, servicos, semBase, elosInternos, elosCortados}, recolhidas:[{id,
       numero, motivo}]}.
       ⚠ RESUMO SÓ QUANDO OS FILHOS COBREM O PAI. No Project a tarefa-resumo não
         tem duração própria: ela vai do menor início ao maior fim dos filhos.
         Se os filhos não cobrem a janela do motor (etapa de 10 dias cujas
         subetapas são todas marco), o resumo encolheria para 0 e puxaria as
         sucessoras para trás — a entrega do Project sairia antes da do PDF.
         Nesse caso a etapa (ou a subetapa) vai como tarefa comum, com a
         duração do motor, e os filhos ficam fora com o motivo na nota.
       ⚠ SERVIÇO "sem quantidade" não vai: não tem data no motor (nenhum
         diário jamais o realiza) e uma tarefa sem data o Project põe no início
         do projeto. Sai contado em `semBase` e na nota da subetapa. */
    detalhar: function (r, detalhe) {
      if (detalhe !== "subetapa" && detalhe !== "servico") return { ok: false, motivo: "detalhe desconhecido: " + detalhe + " (use \"subetapa\" ou \"servico\")" };
      if (!r || !Array.isArray(r.atividades) || !r.etapas) {
        return { ok: false, motivo: (r && r.exec && r.exec.erro) || "o cronograma veio sem a árvore EAP — chame Cronograma.estimar(orc, override, {eap: true})" };
      }
      var dpw = (r.params && r.params.diasUteisSemana) || 5, fer = (r.feriados && r.feriados.mapa) || {};
      var porId = {}, cont = { etapas: 0, resumos: 0, folhas: 0, servicos: 0, semBase: 0, elosInternos: 0, elosCortados: 0 };
      var recolhidas = [], problema = null;
      r.atividades.forEach(function (n) { if (!Object.prototype.hasOwnProperty.call(porId, n.id)) porId[n.id] = n; });
      function filhosDe(n) { return (n.filhos || []).map(function (id) { return porId[id]; }).filter(function (x) { return !!x; }); }
      function folha(no, nivel) {
        if (!ehData(no.dataInicio) || !ehData(no.dataFim)) { problema = problema || ("o nó " + no.numero + " ficou sem data no cronograma"); return null; }
        var t = instantesFolha(no, dpw, fer);
        return { no: no, nivel: nivel, resumo: false, filhos: [], a: t.a, b: t.b, zero: t.zero, semBase: 0, recolhida: null };
      }
      // serviços de um pai (subetapa, grupo "N.g" ou etapa sem subetapa)
      function servicos(pai, nivel) {
        var out = [], sem = 0;
        filhosDe(pai).forEach(function (s) {
          if (s.tipo !== "servico") return;
          if (s.semBase || !ehData(s.dataInicio) || !ehData(s.dataFim)) { sem++; return; }
          var l = folha(s, nivel); if (l) out.push(l);
        });
        return { lista: out, semBase: sem };
      }
      // fecha o resumo com os filhos, ou devolve o pai como tarefa comum (ver ⚠ acima)
      function resumir(l, filhos) {
        if (!filhos.length) return l;
        var a = Infinity, b = -Infinity, todosZero = true;
        filhos.forEach(function (f) { if (f.a < a) a = f.a; if (f.b > b) b = f.b; if (!f.zero) todosZero = false; });
        if (a !== l.a || proxInicio(b, dpw, fer) !== proxInicio(l.b, dpw, fer)) {
          l.recolhida = todosZero && !l.zero ? "todas as subetapas sao marco (sem duracao) e a etapa dura " + l.no.duracao + " dia(s)"
            : "as partes nao cobrem o prazo desta tarefa no cronograma do OrcaPRO";
          recolhidas.push({ id: l.no.id, numero: l.no.numero, motivo: l.recolhida });
          return l;
        }
        l.resumo = true; l.filhos = filhos; l.a = a; l.b = b;
        return l;
      }
      var linhasEt = [];
      r.atividades.forEach(function (e) {
        if (e.tipo !== "etapa") return;
        var le = folha(e, 1); if (!le) return;
        cont.etapas++;
        var kids = [];
        if (e.papel === "resumo") {
          filhosDe(e).forEach(function (f) {
            if (f.tipo !== "subetapa" && f.tipo !== "soltos") return;
            var lf = folha(f, 2); if (!lf) return;
            if (detalhe === "servico") {
              var sv = servicos(f, 3);
              lf.semBase = sv.semBase; cont.semBase += sv.semBase;
              lf = resumir(lf, sv.lista);
            } else lf.semBase = filhosDe(f).filter(function (s) { return s.tipo === "servico" && s.semBase; }).length;
            kids.push(lf);
          });
        } else if (detalhe === "servico") {
          var sv2 = servicos(e, 2);
          le.semBase = sv2.semBase; cont.semBase += sv2.semBase;
          kids = sv2.lista;
        }
        linhasEt.push(resumir(le, kids));
      });
      if (problema) return { ok: false, motivo: problema };
      // achata na ordem da planilha, com UID/ID/nº de estrutura
      var linhas = [], prox = r.etapas.length, uidDe = {};
      function empilha(l, outline) {
        l.outline = outline; l.id = linhas.length + 1;
        l.uid = l.nivel === 1 ? l.no.etapaIdx + 1 : ++prox;
        uidDe[l.no.id] = l.uid; linhas.push(l);
        if (l.resumo) cont.resumos++;
        if (l.no.tipo === "subetapa" || l.no.tipo === "soltos") cont.folhas++;
        if (l.no.tipo === "servico") cont.servicos++;
        l.filhos.forEach(function (f, j) { empilha(f, outline + "." + (j + 1)); });
      }
      linhasEt.forEach(function (l, i) { empilha(l, String(i + 1)); });
      /* ELOS. Etapa: os de sempre (tarefa-resumo, `predDesloc` do motor), como
         no XML por etapa. Subetapa: os da rede INTERNA com o deslocamento
         EFETIVO desenhado (`predDesloc` da folha = início − fim, ou início −
         início no II) — ⚠ nunca o lag digitado (`predLag`/`predDeslocRede`): no
         modo padrão o "+7" de cura é escalonado para caber na etapa, e o
         Project, com o +7 cru, empurraria a subetapa para fora dela.
         ⚠ CICLO interno: o motor desenha quem sobrou ignorando o elo de volta
         (a folha que vem depois na lista não espera a de antes). Mandar esse
         elo faria o Project recusar a rede ("relação circular"); ele fica
         fora e conta em `elosCortados`. */
      var uidEt = {};
      r.etapas.forEach(function (e, i) { uidEt[e.id] = i + 1; });   // o mesmo mapa do XML por etapa
      linhas.forEach(function (l) {
        var no = l.no, links = [];
        if (l.nivel === 1) {
          (no.preds || []).forEach(function (pid) {
            if (!uidEt[pid]) return;
            links.push({ uid: uidEt[pid], tipo: 1, dias: (no.predDesloc && no.predDesloc[pid] != null) ? no.predDesloc[pid] : 0 });
          });
        } else if (no.tipo === "subetapa" || no.tipo === "soltos") {
          var irmas = (porId[no.paiId] && porId[no.paiId].filhos) || [];
          (no.preds || []).forEach(function (pid) {
            var p = porId[pid];
            if (!p || !uidDe[pid]) return;
            if (p.cicloDep && no.cicloDep && irmas.indexOf(pid) > irmas.indexOf(no.id)) { cont.elosCortados++; return; }
            links.push({ uid: uidDe[pid], tipo: (no.predTipo && no.predTipo[pid] === "II") ? 3 : 1,
              dias: (no.predDesloc && no.predDesloc[pid] != null) ? no.predDesloc[pid] : 0 });
            cont.elosInternos++;
          });
        }
        l.links = links;
      });
      return { ok: true, detalhe: detalhe, linhas: linhas, contagens: cont, recolhidas: recolhidas };
    },

    // tarefas do XML hierárquico (a partir do plano de `detalhar`)
    _tarefasHier: function (L, plano, r, dpw, mapaFer) {
      var rede = !!(r.exec && r.exec.rede);
      plano.linhas.forEach(function (l) {
        var no = l.no, serv = no.tipo === "servico", fl = no.tipo === "subetapa" || no.tipo === "soltos";
        var horas = Math.round((no.duracao || 0) * 8), nome, nota;
        if (l.nivel === 1) nome = ((no.codigo ? no.codigo + " " : "") + (no.nome || "Etapa " + l.outline));
        else if (fl) nome = no.numero + " " + (no.nome || "");
        else nome = no.numero + " " + (no.codigo ? no.codigo + " " : "") + (no.nome || "");
        var folgaTxt = no.critico ? " | CAMINHO CRITICO (sem folga)" : " | folga: " + (no.folga || 0) + " dia(s)";
        if (serv) {
          nota = "Servico | " + fmtQtd(no.quantidade) + " " + (no.unidade || "") +
            " | inicio fixado pelo OrcaPRO (nao iniciar antes de): sem isso o Project junta os servicos no inicio da subetapa e encurta a obra";
        } else {
          nota = (fl ? (no.tipo === "soltos" ? "Servicos gerais da etapa (itens fora das subetapas)" : "Subetapa") + " | " : "") +
            "Frente: " + (no.categoriaNome || no.categoria || "—") + folgaTxt +
            (no.editado ? " | duracao informada pela equipe" : "") +
            (fl && !rede ? " | datas ajustadas ao prazo da etapa (modo padrao)" : "") +
            (l.semBase ? " | " + l.semBase + " servico(s) sem quantidade fora do cronograma" : "") +
            (l.recolhida ? " | partes nao exportadas: " + l.recolhida : "");
        }
        var zero = !l.resumo && l.zero;
        L.push('<Task>');
        L.push('<UID>' + l.uid + '</UID><ID>' + l.id + '</ID>');
        L.push('<Name>' + x(nomeCurto(nome)) + '</Name>');
        L.push('<Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull>');
        /* WBS = nº da planilha ("2.g" no grupo de soltos); OutlineNumber = a
           POSIÇÃO na estrutura, que é o que o formato define (o Project o
           recalcula pela OutlineLevel e pela ordem, e outro leitor MSPDI pode
           montar a árvore por ele — "2.g" ali quebraria a hierarquia). O nº da
           planilha também vai no nome: se o Project renumerar a WBS pela
           máscara dele, o vínculo com a planilha continua visível. */
        L.push('<WBS>' + x(no.numero) + '</WBS><OutlineNumber>' + l.outline + '</OutlineNumber><OutlineLevel>' + l.nivel + '</OutlineLevel>');
        L.push('<Start>' + dt(diaDe(l.a), "08:00:00") + '</Start>');
        L.push('<Finish>' + dt(diaDe(l.b), manha(l.b) ? "08:00:00" : "17:00:00") + '</Finish>');
        L.push('<Duration>PT' + horas + 'H0M0S</Duration><DurationFormat>7</DurationFormat>');
        L.push('<Milestone>' + (zero ? 1 : 0) + '</Milestone><Summary>' + (l.resumo ? 1 : 0) + '</Summary><Critical>' + (no.critico ? 1 : 0) + '</Critical>');
        /* ⚠ SERVIÇO COM "NÃO INICIAR ANTES DE" (ConstraintType 4) na data do
           motor. Serviço não tem elo (é a distribuição do prazo da subetapa pelo
           esforço). Com o "o quanto antes" (0), o Project põe todos no início
           da subetapa, a subetapa-resumo encolhe para o maior serviço, as
           sucessoras andam para trás e a entrega sai MAIS CEDO que a do PDF. */
        if (serv) L.push('<ConstraintType>4</ConstraintType><CalendarUID>1</CalendarUID><ConstraintDate>' + dt(no.dataInicio, "08:00:00") + '</ConstraintDate>');
        else L.push('<ConstraintType>0</ConstraintType><CalendarUID>1</CalendarUID>');
        L.push('<Notes>' + x(nota) + '</Notes>');
        l.links.forEach(function (k) {
          // Type 1 = término-início; 3 = início-início (o "II" da subetapa)
          L.push('<PredecessorLink><PredecessorUID>' + k.uid + '</PredecessorUID>' +
            '<Type>' + k.tipo + '</Type><CrossProject>0</CrossProject>' +
            '<LinkLag>' + Math.round(k.dias * DEC_POR_DIA) + '</LinkLag><LagFormat>7</LagFormat></PredecessorLink>');
        });
        L.push('</Task>');
      });
    },

    // orc: orçamento · r: resultado de Cronograma.estimar (calcula se faltar)
    // opts.detalhe: ver `_detalhe` (sem ele, o XML por etapa de sempre)
    gerarXML: function (orc, r, opts) {
      var detalhe = MSProject._detalhe(opts);
      if (!r && detalhe) r = MSProject._estimarEAP(orc);
      if (!r && typeof Cronograma !== "undefined" && Cronograma.estimar) r = Cronograma.estimar(orc);
      if (!r || !r.etapas) return "";
      /* detalhe pedido e o plano não fecha (r sem árvore, nó sem data): sai o
         XML por etapa, que é o que o motor garante. Quem quiser dizer isso na
         tela chama `MSProject.detalhar(r, detalhe)` e lê `motivo`. */
      var plano = detalhe ? MSProject.detalhar(r, detalhe) : null;
      /* ⚠ detalhe "subetapa" num orçamento SEM subetapa: não há nada abaixo da
         etapa para mostrar — sai o XML de sempre, byte a byte. A tela já manda
         "etapa" nesse caso, mas outro chamador que forçasse o detalhe mudava o
         arquivo sem ter nada a mais (medido na Fase 2 no fixture da e2e). */
      if (plano && plano.ok && detalhe === "subetapa" && !plano.contagens.folhas) plano = null;
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
      if (plano && plano.ok) MSProject._tarefasHier(L, plano, r, dpw, mapaFer);
      else r.etapas.forEach(function (e, i) {
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

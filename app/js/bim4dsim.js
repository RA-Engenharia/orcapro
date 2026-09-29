/* =====================================================================
 * bim4dsim.js — O MOTOR DA SIMULAÇÃO 4D POR DATA (estilo TimeLiner).
 *
 * Motor PURO: sem DOM, sem Three, sem Store. Recebe o que o cronograma já
 * calculou (`Cronograma.estimar`) e o plano 4D dos elementos
 * (`BIM4D.planejar`), e responde, para QUALQUER data do calendário:
 *   - o estado de cada atividade (etapa) e de cada elemento:
 *       futuro | execucao | concluido | atrasado
 *   - o % planejado (e o real, quando a obra tem avanço lançado) na data;
 *   - as atividades ativas, os marcos, a contagem por estado;
 *   - a curva S planejado × real (× projetado) dia a dia;
 *   - a CENA (quem some, quem é pintado de quê) para o visualizador aplicar,
 *     já com os filtros e a aparência escolhidos.
 * Quem desenha (js/gestao.js + js/bim.js) só orquestra.
 *
 * ⚠ O EIXO É DATA, NÃO "SEMANA". O 4D antigo mostrava "Semana N / total" e os
 *   índices vinham do `inicio`/`fim` do `estimar` — que são DIAS ÚTEIS. Uma
 *   obra de 33 dias úteis aparecia como "Semana 33 / 33", e o engenheiro lia
 *   oito meses onde havia sete semanas. Aqui o eixo é o calendário corrido,
 *   um passo por dia, com o dia útil, o sábado, o domingo e o feriado ditos
 *   pelo NOME.
 *
 * ⚠ O CALENDÁRIO É O DO CRONOGRAMA, NUNCA UM PRÓPRIO. Dia útil é o que
 *   `Cronograma.diaUtil` diz, com o regime de dias por semana e o mapa de
 *   feriados que o próprio `estimar` devolveu (`r.params`, `r.feriados`).
 *   Um calendário paralelo aqui divergiria do Gantt no primeiro feriado
 *   local — e a simulação mostraria a laje subindo num dia em que o Gantt diz
 *   que a obra está parada.
 *
 * ⚠ DATA É TEXTO "AAAA-MM-DD" e a conta de dia usa Date LOCAL ao meio-dia.
 *   `new Date("2026-10-10")` é meia-noite UTC — 21h do dia 9 no Brasil —, e
 *   uma etapa que termina no dia 10 apareceria concluída no dia 9 (a mesma
 *   armadilha documentada no js/bimtarefa.js).
 *
 * ⚠ O TÉRMINO MOSTRADO É O ÚLTIMO DIA DE TRABALHO. O `estimar` devolve o
 *   `dataFim` EXCLUSIVO (o dia útil seguinte ao último trabalhado). Na régua
 *   do tempo isso fazia a etapa de segunda a sexta aparecer "em execução" no
 *   sábado e no domingo. Aqui a atividade é: futura antes do início, em
 *   execução do início ao último dia trabalhado (inclusive), concluída
 *   depois dele. O % é o do COMEÇO do dia: 0% no primeiro dia, 100% no dia
 *   seguinte ao último — nunca "em execução a 100%".
 *
 * ⚠ ATRASO SÓ EXISTE COM AVANÇO REAL, E SÓ ATÉ O CORTE. "Atrasada" = a obra
 *   tem avanço lançado, a data está até a data de corte do avanço, o término
 *   PLANEJADO já passou e a atividade não chegou a 100%. Depois do corte é
 *   plano (reprogramado): o futuro ainda não aconteceu, e pintar o futuro de
 *   vermelho seria ruído — a mesma regra do js/bimtarefa.js ("antes de hoje
 *   é realidade, depois é plano"). Sem avanço nenhum não existe atraso: o
 *   sistema não sabe, e não afirma.
 *
 * Node-testável: tools/test-bim4dsim.js (com controles negativos).
 * ===================================================================== */
(function (global) {
  "use strict";

  var ESTADOS = ["futuro", "execucao", "atrasado", "concluido"];
  var ROTULO = { futuro: "Não iniciada", execucao: "Em execução", atrasado: "Atrasada", concluido: "Concluída",
    demolindo: "Em demolição", removido: "Demolido", existente: "Existente" };
  var DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  var DIAS_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  /* As cores do estado. ⚠ "Concluído" NÃO tem cor: é o material natural da
     peça — a imagem da obra pronta tem de parecer a obra pronta, e não um
     modelo pintado de amarelo (a mesma decisão do APARENCIA_PADRAO do B6). */
  var COR = {
    execucao: "#f59e0b",   // âmbar: o que está sendo feito
    critico: "#7c3aed",    // roxo: em execução E no caminho crítico
    atrasado: "#dc2626",   // vermelho: passou do término planejado sem 100%
    fantasma: "#94a3b8",   // cinza translúcido: o que ainda vai existir
    demolicao: "#ea580c"   // laranja: reforma, sendo demolido
  };
  var OPAC = { execucao: 0.85, atrasado: 0.92, fantasma: 0.12, demolicao: 0.85, etapaExec: 0.72 };

  /* Paleta da cor POR ETAPA: qualitativa, sem o vermelho do atraso nem o
     cinza do fantasma — as duas continuam dizendo a mesma coisa nos dois
     modos. Etapa N recebe PALETA[N % 15]. */
  var PALETA = ["#2563eb", "#16a34a", "#9333ea", "#0891b2", "#ca8a04", "#db2777", "#4f46e5", "#059669",
    "#c2410c", "#0d9488", "#7c3aed", "#65a30d", "#be185d", "#1d4ed8", "#b45309"];

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function arr(a) { return (a && a.length) ? a : []; }
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d || 0); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  /* ---------------------------------------------------------------------
     DATAS (texto AAAA-MM-DD; Date local ao meio-dia só para contar)
     ------------------------------------------------------------------- */
  function ymd(v) {
    if (v == null || v === "") return "";
    if (typeof v === "string") {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (m) return m[1] + "-" + m[2] + "-" + m[3];
      m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      if (m) return m[3] + "-" + m[2] + "-" + m[1];
      return "";
    }
    if (typeof v === "number") v = new Date(v);
    if (v && typeof v.getTime === "function" && isFinite(v.getTime())) {
      return v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate());
    }
    return "";
  }
  function paraDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd(s));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null;
  }
  function somaDias(s, n) { var d = paraDate(s); if (!d) return ""; d.setDate(d.getDate() + n); return ymd(d); }
  function diasEntre(a, b) {
    var da = paraDate(a), db = paraDate(b);
    if (!da || !db) return 0;
    return Math.round((db.getTime() - da.getTime()) / 864e5);
  }
  /* mês seguinte no MESMO dia; dia que não existe (31/01 + 1 mês) vira o
     último do mês, e não 03/03 como o `setMonth` faria */
  function somaMeses(s, n) {
    var d = paraDate(s); if (!d) return "";
    var dia = d.getDate(), alvo = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
    var ult = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0, 12).getDate();
    alvo.setDate(Math.min(dia, ult));
    return ymd(alvo);
  }
  function br(s) { var x = ymd(s); return x ? x.slice(8, 10) + "/" + x.slice(5, 7) + "/" + x.slice(0, 4) : ""; }
  function brCurto(s) { var x = ymd(s); return x ? x.slice(8, 10) + "/" + x.slice(5, 7) : ""; }
  function diaSemana(s) { var d = paraDate(s); return d ? DIAS[d.getDay()] : ""; }
  function diaSemanaCurto(s) { var d = paraDate(s); return d ? DIAS_CURTO[d.getDay()] : ""; }
  function mesCurto(s) { var d = paraDate(s); return d ? MESES[d.getMonth()] + "/" + String(d.getFullYear()).slice(2) : ""; }
  function menor(a, b) { return !a ? b : (!b ? a : (a < b ? a : b)); }
  function maior(a, b) { return !a ? b : (!b ? a : (a > b ? a : b)); }

  /* o módulo do cronograma: o injetado (teste), o global (navegador) ou o
     require relativo (Node) */
  function modCrono(ent) {
    if (ent && ent.Cronograma) return ent.Cronograma;
    if (global.Cronograma) return global.Cronograma;
    if (typeof require !== "undefined") { try { return require("./cronograma.js"); } catch (e) {} }
    return null;
  }

  /* ---------------------------------------------------------------------
     O CALENDÁRIO DA SIMULAÇÃO — o do cronograma, dia a dia.
     `util(d)` pergunta ao `Cronograma.diaUtil` com o regime e os feriados do
     próprio resultado do `estimar`; `c[d]` é quantos dias úteis existem ANTES
     de d dentro do eixo (a régua do "% no começo do dia").
     ------------------------------------------------------------------- */
  function montarEixo(C, rCal, ini, fim) {
    var dpw = (rCal && rCal.params && rCal.params.diasUteisSemana) || 5;
    var fer = (rCal && rCal.feriados && rCal.feriados.mapa) || {};
    var dias = [], idx = {}, c = 0, d = ini, g = 0;
    while (d && d <= fim && g++ < 20000) {
      var dt = paraDate(d);
      var util = C && typeof C.diaUtil === "function" ? !!C.diaUtil(dt, dpw, fer) : (dt.getDay() !== 0 && dt.getDay() !== 6);
      var nomeFer = own(fer, d) ? String(fer[d]) : null;
      idx[d] = dias.length;
      dias.push({ data: d, util: util, feriado: nomeFer, c: c, dow: dt.getDay() });
      if (util) c++;
      d = somaDias(d, 1);
    }
    return { dias: dias, idx: idx, dpw: dpw, feriados: fer, totalUteis: c };
  }

  /* quantos dias úteis ANTES de `d` (começo do dia), dentro do eixo; fora
     dele, satura nas pontas */
  function cAntes(E, d) {
    if (!d) return 0;
    if (own(E.idx, d)) return E.dias[E.idx[d]].c;
    if (!E.dias.length) return 0;
    if (d < E.dias[0].data) return 0;
    return E.totalUteis;
  }
  /* dias úteis em [a, b] (inclusive dos dois lados) */
  function uteisEntre(E, a, b) {
    if (!a || !b || b < a) return 0;
    var fimMais = somaDias(b, 1);
    return cAntes(E, fimMais) - cAntes(E, a);
  }
  /* o último dia útil ANTES de `d` (exclusive) — o término inclusivo de quem
     tem `dataFim` exclusivo. Sem dia útil antes, devolve o dia anterior. */
  function ultimoUtilAntes(E, C, rCal, d) {
    var dpw = (rCal && rCal.params && rCal.params.diasUteisSemana) || 5;
    var fer = (rCal && rCal.feriados && rCal.feriados.mapa) || {};
    var x = somaDias(d, -1), g = 0;
    while (x && g++ < 60) {
      var util = own(E.idx, x) ? E.dias[E.idx[x]].util : (C && C.diaUtil ? !!C.diaUtil(paraDate(x), dpw, fer) : true);
      if (util) return x;
      x = somaDias(x, -1);
    }
    return somaDias(d, -1);
  }

  /* ---------------------------------------------------------------------
     O REAL de uma atividade: o registro de avanço (a verdade lançada) ou,
     na falta dele, o que o `estimar` expôs em `et.avanco`.
     ⚠ `et.avanco.iniReal` NÃO é sempre início real: o motor do cronograma o
       preenche com o início da REPROGRAMAÇÃO, inclusive para tarefa não
       iniciada (ver tools/test-crono-avanco-pct.js). Só vale como real quando
       o estado diz que a tarefa começou; o fim, só quando diz que terminou.
     ------------------------------------------------------------------- */
  /* quantas entradas o registro de avanço LIDO aceitou (`CronoAvanco.ler`
     devolve `lista`; um chamador antigo pode mandar só `porId`) */
  function nEntradas(av) {
    if (!av) return 0;
    if (av.lista && typeof av.lista.length === "number") return av.lista.length;
    return av.porId && typeof av.porId === "object" ? Object.keys(av.porId).length : 0;
  }
  function realDe(et, AV) {
    var e = AV && AV.porId && own(AV.porId, et.id) ? AV.porId[et.id] : null;
    if (e) {
      var ini = ymd(e.i), fim = ymd(e.f);
      return { ini: ini || null, fim: fim || null, pct: fim ? 100 : Math.max(0, Math.min(100, num(e.p, 0))), fonte: "lancado" };
    }
    var a = et.avanco;
    if (a && (a.estado === "andamento" || a.estado === "concluida")) {
      var conc = a.estado === "concluida";
      return { ini: ymd(a.iniReal) || null, fim: conc ? (ymd(a.fimReal) || null) : null,
        pct: conc ? 100 : Math.max(0, Math.min(100, num(a.pct, 0))), fonte: "motor" };
    }
    return { ini: null, fim: null, pct: 0, fonte: null };
  }

  /* ---------------------------------------------------------------------
     MONTAR — a simulação inteira, uma vez por (fonte, modelo, cronograma).
     ent = {
       r:        resultado do `Cronograma.estimar` (o vigente; com avanço, é
                 o REPROGRAMADO). null = sem cronograma (sequência padrão).
       base:     o PLANEJADO para comparar (ex.: `Cronograma.semAvanco`). Sem
                 ele, o planejado é o próprio `r`.
       avanco:   o registro de avanço LIDO (`CronoAvanco.ler`): {corte, porId}.
       plano:    `BIM4D.planejar(elementos, r.etapas)`.
       hoje:     "AAAA-MM-DD" — INJETADO (o motor não lê relógio).
       unidade:  "dia" (padrão) ou "semana" — a unidade das janelas do
                 `plano` para as peças sem etapa (sem cronograma o BIM4D
                 conta em semanas).
       Cronograma: o módulo (opcional; teste injeta).
     }
     ------------------------------------------------------------------- */
  function montar(ent) {
    ent = ent || {};
    var C = modCrono(ent);
    var hoje = ymd(ent.hoje) || ymd(new Date());
    var r = ent.r || null;
    var base = ent.base || r;
    var avisos = [];
    var rCal = r;
    var erroCrono = r ? "" : String(ent.erroCronograma || "").slice(0, 200);
    if (!rCal && C && typeof C.estimar === "function") {
      /* sem cronograma: o calendário ainda é o do motor (regime padrão e
         feriados nacionais), a partir de hoje — nunca um inventado aqui */
      try { rCal = C.estimar({ id: "__bim4d", nome: "", etapas: [], cronograma: { params: { dataInicio: hoje } } }); } catch (eC) { rCal = null; }
    }
    /* ⚠ FALHA DO CÁLCULO NÃO É "SEM CRONOGRAMA" (achado 25.3 da revisão da
       1.2.98). Quem chama engolia o erro do `Cronograma.estimar` e passava
       `r = null`; aqui isso virava "Sem cronograma ligado", e a nota da fonte
       dizia "sem avanço lançado". As duas frases eram falsas: o cronograma
       existe, só não foi calculado — e o erro, que era a única pista, sumia.
       Com `erroCronograma` o aviso diz o que aconteceu e onde olhar. */
    if (!r && erroCrono) {
      avisos.push({ tipo: "cronograma-falhou", msg: "Não consegui calcular o cronograma desta obra (" + erroCrono + "). O 3D está na sequência padrão por tipo de peça, com datas ilustrativas a partir de hoje — não é o cronograma desta obra. Abra a aba Cronograma da obra para ver o problema." });
    } else if (!r) {
      avisos.push({ tipo: "sem-cronograma", msg: "Sem cronograma ligado: a sequência é a padrão por tipo de peça, com datas ilustrativas a partir de hoje." });
    }
    var calK = null;
    try { calK = (C && rCal && typeof C.calendario === "function") ? C.calendario(rCal) : null; } catch (eK) { calK = null; }
    function dataDoIndice(k) {
      if (calK) { try { return ymd(calK.dia(Math.max(0, Math.round(k)))); } catch (e) {} }
      return somaDias(ymd(rCal && rCal.dataInicio) || hoje, Math.round(k));
    }
    var mult = ent.unidade === "semana" ? ((rCal && rCal.params && rCal.params.diasUteisSemana) || 5) : 1;

    /* ⚠ "REAL" SÓ COM AVANÇO QUE VALE (achado 25.2 da revisão da 1.2.98).
       Roteiro do defeito: o registro de avanço tinha data de corte mas
       nenhuma entrada válida (`nos: []`, ou todas descartadas pela leitura).
       Bastava o corte para ligar o modo real: a Fundação, que terminava
       antes do corte, virava "Atrasada" com Real 0%, e o HUD do projetor
       dizia "1 atrasada" — enquanto o Cronograma da obra, que só usa o
       avanço quando há entrada aceita (`AV.lista.length`, js/cronograma.js),
       não mostrava atraso nenhum. A régua é a mesma do motor do cronograma:
       sem entrada, sem real. E o `r.avanco` só existe quando o próprio
       `estimar` aceitou o avanço (com os ganchos da leitura). */
    var AV = (ent.avanco && ent.avanco.corte && nEntradas(ent.avanco) > 0) ? ent.avanco : null;
    var rAv = (r && r.avanco && r.avanco.corte) ? r.avanco : null;
    var corte = AV ? ymd(AV.corte) : "";
    var temReal = !!(r && (AV || rAv));
    if (!corte && rAv) corte = ymd(rAv.corte);
    if (temReal && !corte) temReal = false;

    /* ---- as atividades do cronograma (a ordem é a do cronograma) ---- */
    var etapas = arr(r && r.etapas), porIdBase = {};
    arr(base && base.etapas).forEach(function (e) { if (e && e.id != null) porIdBase[String(e.id)] = e; });
    var ini = "", fim = "";
    var brutas = etapas.map(function (e, i) {
      var A = ymd(e.dataInicio), Bx = ymd(e.dataFim);
      var eb = porIdBase[String(e.id)] || e;
      var Ab = ymd(eb.dataInicio) || A, Bbx = ymd(eb.dataFim) || Bx;
      var real = temReal ? realDe(e, AV) : null;
      ini = menor(ini, menor(A, Ab)); fim = maior(fim, maior(Bx, Bbx));
      if (real) { ini = menor(ini, real.ini); fim = maior(fim, real.fim ? somaDias(real.fim, 1) : ""); }
      return { e: e, eb: eb, A: A, Bx: Bx, Ab: Ab, Bbx: Bbx, real: real, i: i };
    });
    /* janelas das peças SEM etapa (estimadas pelo tipo IFC ou pela categoria):
       viram pseudo-atividades por janela, com a data do calendário do motor */
    var plano = ent.plano || { elementos: [] };
    var porAtv = {}, pseudo = {}, idsAtv = {};
    /* o selo "4D exato: N/M carimbados" (achado 40.5 da revisão da 1.2.98:
       o painel novo tinha tirado). N = peças cujo carimbo OrcaPRO_Etapa casou
       com uma ETAPA do cronograma — é o que põe a peça na data certa. O
       carimbo que casou só pela categoria entra à parte: a janela dela é a
       da categoria inteira, não a da etapa. */
    var nCarEtapa = 0, nCarCat = 0, nCarTarefa = 0;
    etapas.forEach(function (e) { idsAtv[String(e.id)] = true; });
    /* ⚠ AS TAREFAS DO PLANO EXECUTIVO (js/bimelo.js). Com a árvore da EAP
       (`r.atividades`, `estimar` com `{eap: true}`), cada SUBETAPA — e o
       grupo de serviços soltos — vira uma atividade FILHA da etapa, com as
       datas, a folga, a crítica e o avanço real dela. A peça cujo elo
       (`ent.elo.porEl`, do `BIMElo.resolver`) aponta para a tarefa sobe na
       data da TAREFA: antes, a laje subia junto com os pilares, na janela da
       etapa inteira.
       ⚠ A FILHA NÃO PESA (`peso` 0, fora da contagem, dos marcos e das
       ativas): a curva S, o % e o custo na data continuam pela etapa, que já
       contém o custo das tarefas — somar as duas contaria o dinheiro duas
       vezes, e mudaria o número que o gestor já mostrou na reunião. */
    var folhasArv = {}, ordemFolhas = [], baseArv = {};
    arr(r && r.atividades).forEach(function (n) {
      if (n && n.papel === "folha" && n.tipo !== "etapa" && n.id != null && n.etapaId != null && own(idsAtv, String(n.etapaId))) {
        folhasArv[String(n.id)] = n; ordemFolhas.push(String(n.id));
        /* a régua cobre a tarefa inteira (o eixo nasce logo abaixo) */
        ini = menor(ini, ymd(n.dataInicio)); fim = maior(fim, ymd(n.dataFim));
        if (n.avanco && (n.avanco.estado === "andamento" || n.avanco.estado === "concluida")) {
          ini = menor(ini, ymd(n.avanco.iniReal));
          if (n.avanco.fimReal) fim = maior(fim, somaDias(ymd(n.avanco.fimReal), 1));
        }
      }
    });
    arr(base && base.atividades).forEach(function (n) {
      if (!n || n.id == null) return;
      baseArv[String(n.id)] = n;
      if (own(folhasArv, String(n.id))) { ini = menor(ini, ymd(n.dataInicio)); fim = maior(fim, ymd(n.dataFim)); }
    });
    var eloDe = (ent.elo && ent.elo.porEl) ? ent.elo.porEl : null;
    var elementos = arr(plano.elementos).map(function (el) {
      var atv = null, eE = eloDe ? eloDe[String(el.id)] : null;
      /* ⚠ DEMOLIR FICA COM A JANELA DA DEMOLIÇÃO: o carimbo da peça a
         demolir diz a etapa da obra NOVA, não quando ela cai (a mesma regra
         do `BIM4D.planejar`) — o elo não passa por cima disso */
      if (eE && eE.noId != null && el.fase !== "demolir") {
        var kN = String(eE.noId);
        if (own(idsAtv, kN)) atv = kN;
        else if (own(folhasArv, kN)) { atv = kN; nCarTarefa++; }
        else if (eE.etapaId != null && own(idsAtv, String(eE.etapaId))) atv = String(eE.etapaId);
      }
      if (!atv) atv = (el.etapaId != null && own(idsAtv, String(el.etapaId))) ? String(el.etapaId) : null;
      if (atv) nCarEtapa++; else if (el.exato === true) nCarCat++;
      var fase = el.fase === "existente" || el.fase === "demolir" ? el.fase : null;
      if (!atv && fase !== "existente") {
        var a0 = num(el.semInicio, 0) * mult, a1 = num(el.semFim, 0) * mult;
        var chave = "cat:" + (el.cat || "outros") + ":" + a0 + ":" + a1 + (fase === "demolir" ? ":dem" : "");
        if (!own(pseudo, chave)) {
          var pA = dataDoIndice(a0), pB = dataDoIndice(a1);
          pseudo[chave] = { id: chave, cat: el.cat || "outros", A: pA, Bx: a1 > a0 ? pB : pA, demolicao: fase === "demolir" };
          ini = menor(ini, pA); fim = maior(fim, a1 > a0 ? pB : pA);
        }
        atv = chave;
      }
      if (atv) porAtv[atv] = (porAtv[atv] || 0) + 1;
      return { id: el.id, atv: atv, fase: fase };
    });

    if (!ini) ini = ymd(rCal && rCal.dataInicio) || hoje;
    if (!fim) fim = ymd(rCal && rCal.dataFim) || ini;
    if (corte) { ini = menor(ini, corte); fim = maior(fim, corte); }
    /* o eixo vai UM dia além do último término exclusivo: na última posição
       da régua tudo está concluído */
    var E = montarEixo(C, rCal, ini, maior(fim, somaDias(ini, 1)));

    function terminoIncl(A, Bx, marco) {
      if (!A) return "";
      if (marco || !Bx || Bx <= A) return A;
      return ultimoUtilAntes(E, C, rCal, Bx);
    }

    var atividades = brutas.map(function (b) {
      var e = b.e, marco = !!e.marco || num(e.duracao, 0) === 0;
      var T = terminoIncl(b.A, b.Bx, marco);
      var marcoB = !!b.eb.marco || num(b.eb.duracao, 0) === 0;
      var Tb = terminoIncl(b.Ab, b.Bbx, marcoB);
      return {
        id: String(e.id), codigo: e.codigo == null ? "" : String(e.codigo), nome: String(e.nome || "Etapa"),
        n: b.i + 1, categoria: e.categoria || "outros", corCat: e.cor || "#94a3b8", corEtapa: PALETA[b.i % PALETA.length],
        inicio: b.A, termino: T, fimExcl: b.Bx, duracao: num(e.duracao, 0), marco: marco,
        folga: e.folga == null ? null : num(e.folga, 0), critico: !!e.critico, custo: num(e.custo, 0),
        base: { inicio: b.Ab, termino: Tb, marco: marcoB },
        real: b.real, reprogramada: !!(b.real && (b.A !== b.Ab || T !== Tb)),
        nEl: porAtv[String(e.id)] || 0, estimado: false
      };
    });
    var nomeCat = (global.BIM4D && global.BIM4D.nomeCat) ? global.BIM4D.nomeCat : function (c) { return c; };
    var corCat = (global.BIM4D && global.BIM4D.corCat) ? global.BIM4D.corCat : function () { return "#94a3b8"; };
    Object.keys(pseudo).sort(function (a, b) { return pseudo[a].A < pseudo[b].A ? -1 : (pseudo[a].A > pseudo[b].A ? 1 : (a < b ? -1 : 1)); }).forEach(function (k, j) {
      var p = pseudo[k], T = terminoIncl(p.A, p.Bx, p.Bx <= p.A);
      atividades.push({
        id: k, codigo: "", nome: (p.demolicao ? "Demolição" : nomeCat(p.cat)) + " (estimado pelo tipo de peça)", n: atividades.length + 1,
        categoria: p.cat, corCat: corCat(p.cat), corEtapa: PALETA[(etapas.length + j) % PALETA.length],
        inicio: p.A, termino: T, fimExcl: p.Bx, duracao: uteisEntre(E, p.A, T), marco: p.Bx <= p.A,
        folga: null, critico: false, custo: 0, base: { inicio: p.A, termino: T, marco: p.Bx <= p.A },
        real: null, reprogramada: false, nEl: porAtv[k] || 0, estimado: true, demolicao: !!p.demolicao
      });
    });
    /* as TAREFAS (filhas), na ordem da árvore, DEPOIS das etapas e das
       estimadas: o nº e a cor de cada etapa ficam os de sempre (a cor por
       etapa é PALETA[i]) — a filha herda a cor da mãe e usa o nº da EAP */
    var idxEtapa = {};
    atividades.forEach(function (a, i) { if (!a.estimado) idxEtapa[a.id] = i; });
    ordemFolhas.forEach(function (id) {
      var n = folhasArv[id], mae = atividades[idxEtapa[String(n.etapaId)]];
      if (!mae) return;
      var A = ymd(n.dataInicio), Bx = ymd(n.dataFim);
      var nb = baseArv[id] || n, Ab = ymd(nb.dataInicio) || A, Bbx = ymd(nb.dataFim) || Bx;
      var marco = !!n.marco || (!!A && !(Bx > A));
      var marcoB = !!nb.marco || (!!Ab && !(Bbx > Ab));
      var T = terminoIncl(A, Bx, marco), Tb = terminoIncl(Ab, Bbx, marcoB);
      var real = temReal ? realDe(n, AV) : null;
      atividades.push({
        id: id, codigo: n.numero == null ? "" : String(n.numero), nome: String(n.nome || "Tarefa"),
        n: n.numero == null ? "" : String(n.numero), pai: mae.id, sub: true, tipoNo: n.tipo,
        categoria: n.categoria || mae.categoria, corCat: n.cor || mae.corCat, corEtapa: mae.corEtapa,
        inicio: A, termino: T, fimExcl: Bx, duracao: marco ? 0 : uteisEntre(E, A, T), marco: marco,
        folga: n.folga == null ? null : num(n.folga, 0), critico: !!n.critico, custo: 0, peso: 0,
        valor: n.valor == null ? null : num(n.valor, 0),
        base: { inicio: Ab, termino: Tb, marco: marcoB },
        real: real, reprogramada: !!(real && (A !== Ab || T !== Tb)),
        nEl: porAtv[id] || 0, estimado: false
      });
      mae.nFilhas = (mae.nFilhas || 0) + 1;
      mae.nEl += porAtv[id] || 0;
    });
    var porId = {};
    atividades.forEach(function (a, i) { porId[a.id] = i; });

    /* PESO da curva S: o CUSTO quando o orçamento tem custo; senão a DURAÇÃO
       planejada em dias úteis — e a tela diz qual dos dois. Contar peças
       (como o 4D antigo) mediria conexão de hidráulica como se fosse parede
       (ver o ⚠ "CONTAR PEÇA NÃO É MEDIR OBRA" no js/bim4d.js). */
    var somaCusto = 0;
    atividades.forEach(function (a) { if (!a.estimado) somaCusto += a.custo; });
    var pesoBase = somaCusto > 0 ? "custo" : "duracao";
    atividades.forEach(function (a) {
      if (a.estimado || a.sub) { a.peso = 0; return; }
      a.peso = pesoBase === "custo" ? a.custo : (a.base.marco ? 0 : uteisEntre(E, a.base.inicio, a.base.termino));
    });
    var pesoTotal = 0;
    atividades.forEach(function (a) { pesoTotal += a.peso; });

    var sim = {
      versao: 1, hoje: hoje, inicio: E.dias.length ? E.dias[0].data : ini, fim: E.dias.length ? E.dias[E.dias.length - 1].data : fim,
      eixo: E, atividades: atividades, porId: porId, elementos: elementos,
      temReal: temReal, corte: corte || null, temCronograma: !!r, erroCronograma: erroCrono || null,
      peso: pesoBase, pesoTotal: pesoTotal, avisos: avisos,
      custoTotal: somaCusto, carimbo: { etapa: nCarEtapa, categoria: nCarCat, total: elementos.length, tarefa: nCarTarefa },
      temTarefas: ordemFolhas.length > 0,
      dataInicioObra: ymd(r && r.dataInicio) || ymd(rCal && rCal.dataInicio) || ini,
      dataFimObra: r ? terminoIncl(ymd(r.dataInicio), ymd(r.dataFim), false) : "",
      feriadosNoPeriodo: E.dias.filter(function (d) { return d.feriado; }).map(function (d) { return { data: d.data, nome: d.feriado, util: d.util }; }),
      diasUteis: E.totalUteis
    };
    return sim;
  }

  /* ---------------------------------------------------------------------
     O ESTADO DE UMA ATIVIDADE NUMA DATA
     ------------------------------------------------------------------- */
  function pctJanela(E, A, T, marco, d) {
    if (!A) return 0;
    if (marco) return d >= A ? 1 : 0;
    if (d <= A) return 0;
    if (d > T) return 1;
    var tot = uteisEntre(E, A, T);
    if (tot <= 0) return d > T ? 1 : 0;
    return clamp01((cAntes(E, d) - cAntes(E, A)) / tot);
  }
  function estadoJanela(A, T, marco, d) {
    if (!A || d < A) return "futuro";
    if (marco) return "concluido";
    return d > T ? "concluido" : "execucao";
  }
  /* o real NUMA data (começo do dia), a partir do lançado no corte:
     concluída → rampa do início real ao fim real; em andamento → rampa do
     início real até o % lançado no fim do dia de corte.
     ⚠ É INTERPOLAÇÃO: o registro guarda o % NO CORTE, não a história. A tela
       diz isso ao lado da curva. */
  function pctRealEm(E, a, d, corte) {
    var R = a.real;
    if (!R || !R.ini || d <= R.ini) return 0;
    if (R.fim) {
      if (d > R.fim) return 1;
      var tf = uteisEntre(E, R.ini, R.fim);
      return tf > 0 ? clamp01((cAntes(E, d) - cAntes(E, R.ini)) / tf) : 1;
    }
    var tc = uteisEntre(E, R.ini, corte);
    var p = R.pct / 100;
    if (tc <= 0) return p;
    return clamp01(p * (cAntes(E, d) - cAntes(E, R.ini)) / tc);
  }
  function estadoAtividade(sim, a, d) {
    var E = sim.eixo;
    var pctPlan = pctJanela(E, a.base.inicio, a.base.termino, a.base.marco, d);
    var pctVig = pctJanela(E, a.inicio, a.termino, a.marco, d);
    var noReal = sim.temReal && a.real && d <= sim.corte;
    if (noReal) {
      var pr = pctRealEm(E, a, d, sim.corte), est;
      if (pr >= 1) est = "concluido";
      else if (!a.base.marco && a.base.termino && d > a.base.termino) est = "atrasado";
      else if (a.base.marco && a.base.inicio && d > a.base.inicio) est = "atrasado";
      else if (a.real.ini && d >= a.real.ini) est = "execucao";
      else est = "futuro";
      return { estado: est, pctPlan: pctPlan, pctReal: pr, pctVig: pctVig, fonte: "real" };
    }
    return { estado: estadoJanela(a.inicio, a.termino, a.marco, d), pctPlan: pctPlan, pctReal: null, pctVig: pctVig, fonte: sim.temReal ? "projetado" : "plano" };
  }

  function rotuloDia(sim, d) {
    var E = sim.eixo, x = own(E.idx, d) ? E.dias[E.idx[d]] : null;
    var util = x ? x.util : null, fer = x ? x.feriado : null;
    var motivo = null;
    if (x && !util) motivo = fer ? "feriado · " + fer : (x.dow === 0 ? "domingo" : (x.dow === 6 ? "sábado" : "sem expediente"));
    return { util: util, feriado: fer, motivo: motivo };
  }

  /* ---------------------------------------------------------------------
     ESTADO EM — a fotografia da obra numa data.
     ------------------------------------------------------------------- */
  function estadoEm(sim, data) {
    var d = clampData(sim, data);
    var porAtv = {}, lista = [], ativas = [], cont = { futuro: 0, execucao: 0, atrasado: 0, concluido: 0 };
    var contEl = { futuro: 0, execucao: 0, atrasado: 0, concluido: 0, demolindo: 0, removido: 0, existente: 0 };
    var somaPlan = 0, somaReal = 0, somaVig = 0, custoPlan = 0, custoReal = 0;
    sim.atividades.forEach(function (a) {
      var s = estadoAtividade(sim, a, d);
      s.id = a.id;
      porAtv[a.id] = s; lista.push(s);
      /* a tarefa (filha) não conta de novo o que a etapa dela já conta */
      if (!a.estimado && !a.sub) cont[s.estado]++;
      if (!a.sub && (s.estado === "execucao" || (s.estado === "atrasado" && (s.pctReal || 0) < 1))) ativas.push(a.id);
      somaPlan += a.peso * s.pctPlan;
      somaVig += a.peso * s.pctVig;
      somaReal += a.peso * (s.pctReal == null ? s.pctVig : s.pctReal);
      /* 5D-lite: o custo de cada etapa na proporção do % dela no começo do
         dia — o planejado e, até o corte, o do avanço lançado. É o mesmo
         custo que pondera a curva S (o do orçamento, por etapa). */
      if (!a.estimado && a.custo) {
        custoPlan += a.custo * s.pctPlan;
        custoReal += a.custo * (s.pctReal == null ? s.pctVig : s.pctReal);
      }
    });
    sim.elementos.forEach(function (el) {
      var k = estadoElemento(el, porAtv);
      contEl[k] = (contEl[k] || 0) + 1;
    });
    var rd = rotuloDia(sim, d);
    var real = sim.temReal && d <= sim.corte;
    var marcos = sim.atividades.filter(function (a) { return a.marco && !a.estimado && !a.sub; }).map(function (a) {
      return { id: a.id, nome: a.nome, data: a.inicio, atingido: porAtv[a.id].estado === "concluido", estado: porAtv[a.id].estado };
    });
    return {
      data: d, br: br(d), diaSemana: diaSemana(d), util: rd.util, feriado: rd.feriado, motivoNaoUtil: rd.motivo,
      diaUtilN: rd.util ? cAntes(sim.eixo, d) - cAntes(sim.eixo, sim.dataInicioObra) + 1 : null,
      fase: d < sim.dataInicioObra ? "antes" : (sim.dataFimObra && d > sim.dataFimObra ? "depois" : "durante"),
      real: real, atividades: lista, porAtv: porAtv, ativas: ativas, contagem: cont, contagemEl: contEl, marcos: marcos,
      pctPlan: sim.pesoTotal > 0 ? somaPlan / sim.pesoTotal : null,
      pctReal: real && sim.pesoTotal > 0 ? somaReal / sim.pesoTotal : null,
      pctVig: sim.pesoTotal > 0 ? somaVig / sim.pesoTotal : null,
      /* sem custo no orçamento não existe R$ — nunca um número inventado */
      custoTotal: sim.custoTotal > 0 ? sim.custoTotal : null,
      custoPlan: sim.custoTotal > 0 ? custoPlan : null,
      custoReal: real && sim.custoTotal > 0 ? custoReal : null
    };
  }

  /* o estado de UMA peça: o da atividade dela, com a reforma invertida
     (demolir: de pé antes, "em demolição" durante, some depois) */
  function estadoElemento(el, porAtv) {
    if (el.fase === "existente") return "existente";
    var s = el.atv && porAtv[el.atv] ? porAtv[el.atv].estado : "futuro";
    if (el.fase === "demolir") {
      if (s === "concluido") return "removido";
      if (s === "execucao" || s === "atrasado") return "demolindo";
      return "existente";
    }
    return s;
  }

  /* ---------------------------------------------------------------------
     A CENA — o que o visualizador aplica. Pura, para a regra de cor e de
     filtro ter teste (e não só uma olhada na tela).
     op = {
       cor: "status" | "etapa",
       futuro: "oculto" | "fantasma",
       criticas: true  → em execução e crítica sai ROXA (destaque),
       etapas: {id: true} | null  → filtro por etapa (null = todas),
       soCriticas, soExecucao
     }
     → { ocultos:[id], pinturas:{id:{cor,opacidade}}, visiveis, legenda:[{chave,cor,rotulo,n}] }
     ------------------------------------------------------------------- */
  function cena(sim, est, op) {
    op = op || {};
    var modoEtapa = op.cor === "etapa", fantasma = op.futuro === "fantasma", destacar = op.criticas !== false;
    var filtro = op.etapas || null;
    var ocultos = [], pinturas = {}, visiveis = 0;
    var leg = {}, ordemLeg = [];
    function conta(chave, cor, rotulo) {
      if (!own(leg, chave)) { leg[chave] = { chave: chave, cor: cor, rotulo: rotulo, n: 0 }; ordemLeg.push(chave); }
      leg[chave].n++;
    }
    sim.elementos.forEach(function (el) {
      var a = el.atv != null && own(sim.porId, el.atv) ? sim.atividades[sim.porId[el.atv]] : null;
      var k = estadoElemento(el, est.porAtv);
      /* ---- filtros: some quem não passa ---- */
      /* a peça da TAREFA passa com a tarefa marcada OU com a etapa-mãe
         marcada (isolar a etapa mostra as tarefas dela) */
      if (a && filtro && !filtro[a.id] && !(a.pai && filtro[a.pai])) { ocultos.push(el.id); return; }
      if (op.soCriticas && !(a && a.critico)) { ocultos.push(el.id); return; }
      if (op.soExecucao && !(k === "execucao" || k === "atrasado" || k === "demolindo")) { ocultos.push(el.id); return; }
      /* ---- aparência ---- */
      if (k === "removido") { ocultos.push(el.id); return; }
      if (k === "futuro") {
        if (!fantasma) { ocultos.push(el.id); return; }
        pinturas[el.id] = { cor: COR.fantasma, opacidade: OPAC.fantasma };
        conta("futuro", COR.fantasma, "Não iniciado (fantasma)");
        visiveis++; return;
      }
      visiveis++;
      if (k === "existente") { conta("existente", null, "Existente (reforma)"); return; }
      if (k === "demolindo") { pinturas[el.id] = { cor: COR.demolicao, opacidade: OPAC.demolicao }; conta("demolindo", COR.demolicao, "Em demolição"); return; }
      if (k === "atrasado") { pinturas[el.id] = { cor: COR.atrasado, opacidade: OPAC.atrasado }; conta("atrasado", COR.atrasado, "Atrasado"); return; }
      if (k === "execucao") {
        if (a && a.critico && destacar) { pinturas[el.id] = { cor: COR.critico, opacidade: OPAC.execucao }; conta("critico", COR.critico, "Em execução · crítica"); return; }
        if (modoEtapa && a) { pinturas[el.id] = { cor: a.corEtapa, opacidade: OPAC.etapaExec }; conta("e:" + a.id, a.corEtapa, a.nome + " (em execução)"); return; }
        pinturas[el.id] = { cor: COR.execucao, opacidade: OPAC.execucao }; conta("execucao", COR.execucao, "Em execução"); return;
      }
      /* concluído: material natural — ou a cor da etapa, no modo por etapa */
      if (modoEtapa && a) { pinturas[el.id] = { cor: a.corEtapa, opacidade: 1 }; conta("e:" + a.id, a.corEtapa, a.nome); return; }
      conta("concluido", null, "Concluído (material)");
    });
    return { ocultos: ocultos, pinturas: pinturas, visiveis: visiveis, total: sim.elementos.length,
      legenda: ordemLeg.map(function (k) { return leg[k]; }) };
  }

  /* ---------------------------------------------------------------------
     CURVA S — planejado × real (× projetado depois do corte), dia a dia.
     ------------------------------------------------------------------- */
  function curvaS(sim) {
    var datas = [], plan = [], real = [], proj = [];
    var temReal = sim.temReal && sim.corte;
    sim.eixo.dias.forEach(function (x) {
      var d = x.data, sp = 0, sr = 0, sv = 0;
      sim.atividades.forEach(function (a) {
        if (!a.peso) return;
        var s = estadoAtividade(sim, a, d);
        sp += a.peso * s.pctPlan;
        sv += a.peso * s.pctVig;
        sr += a.peso * (s.pctReal == null ? 0 : s.pctReal);
      });
      var T = sim.pesoTotal || 0;
      datas.push(d);
      plan.push(T > 0 ? Math.round(sp / T * 1000) / 10 : null);
      real.push(temReal && d <= sim.corte && T > 0 ? Math.round(sr / T * 1000) / 10 : null);
      proj.push(temReal && d >= sim.corte && T > 0 ? Math.round(sv / T * 1000) / 10 : null);
    });
    return { datas: datas, plan: plan, real: real, proj: proj, temReal: !!temReal, corte: sim.corte, peso: sim.peso, vazia: !(sim.pesoTotal > 0) };
  }

  /* ---------------------------------------------------------------------
     DESEMBOLSO MÊS A MÊS — o custo direto planejado (e o executado pelo
     avanço, até o corte) que cai em cada mês da simulação.
     ⚠ É A RÉGUA DESTA SIMULAÇÃO, NÃO O DESEMBOLSO DA PROPOSTA. O da
       proposta é preço de venda, por etapa, com o nº de meses que o
       orçamento travou; este é custo direto, dia útil a dia útil, no plano
       escolhido na Fonte. A tela diz isso ao lado — os dois podem diferir
       mês a mês, e não é defeito.
     ⚠ SEM CUSTO NO ORÇAMENTO NÃO HÁ LINHA: `vazio` com o motivo, nunca um
       mês com R$ 0,00 que parece medido.
     → { meses:[{mes:"AAAA-MM", rotulo, plan, real|null, acumPlan, acumReal|null}],
         total, temReal, vazio, motivo }
     ------------------------------------------------------------------- */
  function custoEm(sim, d) {
    var p = 0, re = 0;
    sim.atividades.forEach(function (a) {
      if (a.estimado || a.sub || !a.custo) return;
      var s = estadoAtividade(sim, a, d);
      p += a.custo * s.pctPlan;
      re += a.custo * (s.pctReal == null ? s.pctVig : s.pctReal);
    });
    return { plan: p, real: re };
  }
  function desembolso(sim) {
    if (!(sim && sim.custoTotal > 0)) return { meses: [], total: 0, temReal: false, vazio: true, motivo: "o orçamento desta obra não tem custo lançado — sem ele não há desembolso (nenhum valor é inventado)." };
    var ini = sim.inicio, fim = sim.fim, meses = [];
    var d = ini.slice(0, 7) + "-01", g = 0;
    var antes = custoEm(sim, ini), acP = 0, acR = 0, antesR = antes.real;
    var temReal = !!(sim.temReal && sim.corte);
    while (d <= fim && g++ < 600) {
      var prox = somaMeses(d, 1);
      /* o fim do intervalo é o COMEÇO do dia seguinte ao último do mês (o %
         é o do começo do dia), preso ao último dia da régua */
      var ate = prox > fim ? fim : prox;
      var agora = custoEm(sim, ate);
      var dp = Math.max(0, agora.plan - antes.plan);
      acP += dp;
      var real = null, acReal = null;
      /* o real só até o corte — a MESMA régua da curva S (depois do corte é
         plano reprogramado, não dinheiro executado) */
      if (temReal && d <= sim.corte) {
        var aR = custoEm(sim, ate > sim.corte ? sim.corte : ate).real;
        real = Math.max(0, aR - antesR); antesR = aR;
        acR += real; acReal = acR;
      }
      meses.push({ mes: d.slice(0, 7), rotulo: mesCurto(d), plan: Math.round(dp * 100) / 100, real: real == null ? null : Math.round(real * 100) / 100,
        acumPlan: Math.round(acP * 100) / 100, acumReal: acReal == null ? null : Math.round(acReal * 100) / 100 });
      antes = agora;
      d = prox;
    }
    return { meses: meses, total: Math.round(sim.custoTotal * 100) / 100, temReal: temReal, vazio: false, motivo: "" };
  }

  /* ---------------------------------------------------------------------
     A RÉGUA: limites, passo e posição
     ------------------------------------------------------------------- */
  function clampData(sim, data) {
    var d = ymd(data) || sim.inicio;
    if (d < sim.inicio) return sim.inicio;
    if (d > sim.fim) return sim.fim;
    return d;
  }
  /* intervalo: "dia" | "diaUtil" | "semana" | "mes"; sentido: +1 / -1 */
  function passo(sim, data, intervalo, sentido) {
    var d = clampData(sim, data), s = sentido < 0 ? -1 : 1, x;
    if (intervalo === "semana") x = somaDias(d, 7 * s);
    else if (intervalo === "mes") x = somaMeses(d, s);
    else if (intervalo === "diaUtil") {
      x = somaDias(d, s);
      var g = 0;
      while (x >= sim.inicio && x <= sim.fim && own(sim.eixo.idx, x) && !sim.eixo.dias[sim.eixo.idx[x]].util && g++ < 40) x = somaDias(x, s);
    } else x = somaDias(d, s);
    return clampData(sim, x);
  }
  function indiceDe(sim, data) { var d = clampData(sim, data); return own(sim.eixo.idx, d) ? sim.eixo.idx[d] : 0; }
  function dataDoIndice(sim, i) {
    var n = sim.eixo.dias.length; if (!n) return sim.inicio;
    var k = Math.max(0, Math.min(n - 1, Math.round(+i || 0)));
    return sim.eixo.dias[k].data;
  }
  /* a posição (0..1) de uma data no eixo — para barra de Gantt e marcador */
  function fracao(sim, data) {
    var n = sim.eixo.dias.length; if (n <= 1) return 0;
    var d = ymd(data); if (!d) return 0;
    if (d <= sim.inicio) return 0;
    if (d > sim.fim) return 1;
    return indiceDe(sim, d) / (n - 1);
  }

  /* elementos (ids) de uma atividade — "isolar esta etapa" e "enquadrar" */
  function elementosDe(sim, atvId) {
    var out = [];
    /* a etapa leva junto as peças das tarefas dela */
    sim.elementos.forEach(function (el) {
      if (el.atv === atvId) { out.push(el.id); return; }
      var a = el.atv != null && own(sim.porId, el.atv) ? sim.atividades[sim.porId[el.atv]] : null;
      if (a && a.pai === atvId) out.push(el.id);
    });
    return out;
  }
  /* a atividade de um elemento (clique no 3D → linha da lista) */
  function atividadeDoElemento(sim, elId) {
    for (var i = 0; i < sim.elementos.length; i++) if (sim.elementos[i].id === elId) return sim.elementos[i].atv;
    return null;
  }

  /* ---------------------------------------------------------------------
     OPÇÕES — a forma única do que o painel manda para a janela do 3D (e o
     que ela aceita). ⚠ Mensagem de outra janela é ENTRADA: lista branca
     campo a campo, nunca `Object.assign` do que chegou.
     ------------------------------------------------------------------- */
  function opcoes(o) {
    o = o || {};
    var out = {
      fonte: o.fonte === "plano" ? "plano" : "orcamento",
      data: ymd(o.data) || "",
      cor: o.cor === "etapa" ? "etapa" : "status",
      futuro: o.futuro === "fantasma" ? "fantasma" : "oculto",
      criticas: o.criticas !== false,
      soCriticas: o.soCriticas === true,
      soExecucao: o.soExecucao === true,
      etapas: null,
      focar: (typeof o.focar === "string" && o.focar.length <= 120) ? o.focar : ""
    };
    if (o.etapas && typeof o.etapas === "object") {
      var m = {}, n = 0;
      Object.keys(o.etapas).forEach(function (k) { if (o.etapas[k] === true && k.length <= 120 && n < 2000) { m[k] = true; n++; } });
      out.etapas = m;
    }
    return out;
  }

  /* ---------------------------------------------------------------------
     FOCO — o que a janela principal pede para a janela do 3D MOSTRAR, vindo
     de QUALQUER ferramenta do BIM: o conjunto isolado ou pintado, o conflito
     aberto, a divergência orçamento × modelo, o avanço pintado, a peça
     clicada. É o "de onde veio esta informação" na tela do projetor.
     ⚠ SÓ CHAVES DURÁVEIS (`modeloId::globalId`, js/bimid.js), NUNCA uid: o
       uid (`mid:expressID`) depende da ordem em que cada janela abriu os
       modelos — a mesma armadilha do estado da simulação (ver `opcoes`).
     ⚠ MENSAGEM DE OUTRA JANELA É ENTRADA: lista branca campo a campo; cor só
       em #hex; dono da pintura só dos conhecidos; tetos de tamanho.
     → null (descartar) | { modo, chaves:[], mapa:{chave: cor|{cor,opacidade}}|null,
                            dono, rotulo }
     ------------------------------------------------------------------- */
  var MODOS_FOCO = { isolar: 1, pintar: 1, focar: 1, selecao: 1, limpar: 1 };
  var DONOS_FOCO = { conjunto: 1, divergencia: 1, avanco: 1, versao: 1 };
  var RE_COR = /^#[0-9a-f]{3,8}$/i, TETO_FOCO = 20000;
  function foco(o) {
    o = o || {};
    if (typeof o.modo !== "string" || !own(MODOS_FOCO, o.modo)) return null;
    var out = { modo: o.modo, chaves: [], mapa: null, dono: "", rotulo: "" };
    arr(o.chaves).forEach(function (k) { if (typeof k === "string" && k.length && k.length <= 200 && out.chaves.length < TETO_FOCO) out.chaves.push(k); });
    if (o.modo === "pintar") {
      var m = {}, n = 0, src = (o.mapa && typeof o.mapa === "object") ? o.mapa : {};
      Object.keys(src).forEach(function (k) {
        if (n >= TETO_FOCO || !k || k.length > 200) return;
        var v = src[k];
        if (typeof v === "string" && RE_COR.test(v)) { m[k] = v; n++; }
        else if (v && typeof v === "object" && typeof v.cor === "string" && RE_COR.test(v.cor)) {
          var op = +v.opacidade;
          m[k] = { cor: v.cor, opacidade: isFinite(op) ? Math.max(0, Math.min(1, op)) : 1 }; n++;
        }
      });
      if (!n) return null;
      out.mapa = m;
      out.dono = (typeof o.dono === "string" && own(DONOS_FOCO, o.dono)) ? o.dono : "espelho";
    }
    if (typeof o.rotulo === "string") out.rotulo = o.rotulo.slice(0, 200);
    if ((o.modo === "isolar" || o.modo === "focar" || o.modo === "selecao") && !out.chaves.length) return null;
    return out;
  }

  /* ---------------------------------------------------------------------
     TECLADO DO PAINEL — o que uma tecla faz, a partir de onde está o foco.
     t = { key, tag, type, editavel } → "prox" | "ant" | "play" | null
     ⚠ A BARRA DE ESPAÇO É DO CONTROLE QUE TEM O FOCO (achado 40.6 da
       revisão da 1.2.98). O painel ouvia o espaço como "Simular" em quase
       todo lugar: com o foco no checkbox de uma etapa, em "Só atividades
       críticas" ou num <summary> (Fonte, Aparência, Filtros), a simulação
       disparava e o filtro não mudava — quem usa só o teclado não conseguia
       filtrar etapa nem abrir uma seção. Espaço só simula onde ele não tem
       ação própria (o slider da régua, a linha da lista, o fundo do painel).
       As setas andam a régua, menos onde elas já são do campo (data, texto,
       select, o próprio slider). */
  var ESPACO_NATIVO = { SELECT: 1, TEXTAREA: 1, BUTTON: 1, SUMMARY: 1, A: 1, OPTION: 1, LABEL: 1, DETAILS: 1 };
  function acaoDaTecla(t) {
    t = t || {};
    var tag = String(t.tag || "").toUpperCase(), tipo = String(t.type || "").toLowerCase();
    if (t.editavel) return null;
    if (t.key === "ArrowRight" || t.key === "ArrowLeft") {
      if (tag === "SELECT" || tag === "TEXTAREA") return null;
      if (tag === "INPUT" && tipo !== "checkbox" && tipo !== "radio") return null;
      return t.key === "ArrowRight" ? "prox" : "ant";
    }
    if (t.key === " " || t.key === "Spacebar") {
      if (tag === "INPUT") return tipo === "range" ? "play" : null;
      if (own(ESPACO_NATIVO, tag)) return null;
      return "play";
    }
    return null;
  }

  /* ---------------------------------------------------------------------
     O SELO DO PAINEL quando o 3D está na outra janela.
     o = { destacado, agora, ultimoEco (ms da última confirmação),
           pendenteDesde (ms do envio mais antigo ainda sem confirmação; 0 =
           nada pendente), janelaTemModelo (true | false | null),
           janelaAbrindo (a janela ainda reabre o modelo guardado) }
     → null (não destacado) | { texto, classe: "vivo"|"espera"|"aviso", dica }
     ⚠ "SINCRONIZADO" SÓ COM A CONFIRMAÇÃO DA OUTRA JANELA (achado 25.6 da
       revisão da 1.2.98). O selo aparecia com o "olá" da janela do 3D — que
       ela manda ao montar, com ou sem modelo — e não havia batimento: o
       painel dizia "sincronizado" com o projetor mostrando "Nenhum modelo
       guardado", ou com a janela travada. Agora a janela devolve um eco de
       cada estado que aplicou; sem eco recente, o selo diz que está
       esperando, e não afirma o que não sabe. */
  var SYNC_MS = 30000, PENDENTE_MS = 5000;
  function seloPainel(o) {
    o = o || {};
    if (!o.destacado) return null;
    var agora = num(o.agora, 0), eco = num(o.ultimoEco, 0), pend = num(o.pendenteDesde, 0);
    if (!eco || agora - eco >= SYNC_MS || (pend && agora - pend >= PENDENTE_MS)) {
      return { texto: "3D na outra janela · aguardando a outra janela", classe: "espera",
        dica: "A janela do 3D ainda não confirmou o que este painel mandou. Se ela foi fechada ou travou, use “Trazer o 3D de volta”." };
    }
    /* a janela ainda está reabrindo o modelo guardado: é espera, não falta */
    if (o.janelaTemModelo === false && o.janelaAbrindo) {
      return { texto: "3D na outra janela · abrindo o modelo…", classe: "espera", dica: "A janela do 3D respondeu e está reabrindo o modelo guardado nesta obra." };
    }
    if (o.janelaTemModelo === false) {
      return { texto: "3D na outra janela · aberta, sem modelo", classe: "aviso",
        dica: "A janela do 3D respondeu, mas não tem o modelo desta obra: o recado dela diz o que falta (arrastar o arquivo .IFC para lá resolve)." };
    }
    return { texto: "3D na outra janela · sincronizado", classe: "vivo", dica: "A janela do 3D confirmou a data e as escolhas deste painel." };
  }

  /* ---------------------------------------------------------------------
     O SELO DA JANELA DO 3D (o canto do projetor).
     o = { temModelo, restaurando, procurando (a janela ainda tenta reabrir),
           vivo (mensagem do painel recente),
           restauro: null | { total, faltando:[{nome}], naoDeu:[{nome, motivo}],
                              semRegistro:[{nome}], semIdb } }
     → { texto, classe: "vivo"|"espera"|"aviso" }
     ⚠ UM RECADO SÓ, FIXO E VERDADEIRO (achado 40.1 da revisão da 1.2.98).
       A janela tentava reabrir o modelo a cada 3 s, por até 3 min, e cada
       tentativa soltava o toast "Falta o arquivo de…" — no projetor, um
       aviso quase contínuo diante do cliente. E o selo dizia "esta janela
       reabre sozinha" também quando ela não reabre: modelo grande demais
       para guardar, ou aberto só em outro aparelho, não aparece aqui por
       mais que se reabra o IFC na principal. O recado agora nasce do que a
       tentativa ACHOU, e diz a ação que resolve (arrastar o arquivo). */
  function nomes(xs) {
    var l = arr(xs), s = l.slice(0, 3).map(function (x) { return "“" + String(x && x.nome != null ? x.nome : x) + "”"; }).join(", ");
    return s + (l.length > 3 ? " e mais " + (l.length - 3) : "");
  }
  function seloJanela(o) {
    o = o || {};
    var R = o.restauro || null;
    if (o.temModelo) {
      /* `simulando === false`: aberta como ESPELHO pelo cabeçalho do BIM (a
         simulação não está ligada) — dizer "Simulação 4D" ali seria dizer o
         que ela não está fazendo */
      var esp = o.simulando === false;
      var t = o.vivo ? (esp ? "3D da obra · segue a janela principal" : "Simulação 4D · segue o painel da janela principal")
        : (esp ? "Esperando a janela principal…" : "Esperando o painel da Simulação 4D na janela principal…");
      if (R && arr(R.faltando).length) t += " · Falta o arquivo de " + nomes(R.faltando) + " neste aparelho: arraste o .IFC para esta janela.";
      return { texto: t, classe: o.vivo ? "vivo" : "espera" };
    }
    if (o.restaurando || !R) return { texto: "Abrindo o modelo guardado nesta obra…", classe: "espera" };
    if (R.semIdb) return { texto: "Este navegador não deixou ler o modelo guardado (armazenamento indisponível). Arraste o arquivo .IFC para esta janela.", classe: "aviso" };
    if (arr(R.naoDeu).length) {
      return { texto: "Não consegui remontar " + arr(R.naoDeu).slice(0, 3).map(function (x) { return "“" + String(x.nome) + "”" + (x.motivo ? " (" + x.motivo + ")" : ""); }).join("; ") +
        ". Arraste o arquivo .IFC para esta janela, ou use o 3D da janela principal.", classe: "aviso" };
    }
    if (arr(R.faltando).length) {
      return { texto: "O arquivo de " + nomes(R.faltando) + " não está guardado neste aparelho, e esta janela não consegue reabri-lo sozinha (o modelo pode ser grande demais para guardar, ou ter sido aberto em outro aparelho). Arraste o arquivo .IFC para esta janela." +
        (o.procurando ? " Se ele acabou de ser aberto na janela principal, espere: confiro de novo a cada 3 s." : ""), classe: "aviso" };
    }
    if (arr(R.semRegistro).length) {
      return { texto: "O modelo " + nomes(R.semRegistro) + " está registrado nesta obra sem o arquivo. Arraste o arquivo .IFC para esta janela.", classe: "aviso" };
    }
    return { texto: "Nenhum modelo guardado nesta obra. Abra o arquivo .IFC na janela principal com esta obra escolhida, ou arraste o arquivo para esta janela." +
      (o.procurando ? " Esta janela confere de novo a cada 3 s, por até 3 minutos." : " Parei de procurar: feche esta janela e abra o 3D de novo pelo painel da Simulação 4D."), classe: "aviso" };
  }

  var BIM4DSim = {
    ESTADOS: ESTADOS, ROTULO: ROTULO, COR: COR, OPAC: OPAC, PALETA: PALETA, SYNC_MS: SYNC_MS,
    acaoDaTecla: acaoDaTecla, seloPainel: seloPainel, seloJanela: seloJanela,
    ymd: ymd, br: br, brCurto: brCurto, diaSemana: diaSemana, diaSemanaCurto: diaSemanaCurto, mesCurto: mesCurto,
    somaDias: somaDias, somaMeses: somaMeses, diasEntre: diasEntre,
    montar: montar, estadoEm: estadoEm, estadoAtividade: estadoAtividade, estadoElemento: estadoElemento,
    cena: cena, curvaS: curvaS, desembolso: desembolso,
    clampData: clampData, passo: passo, indiceDe: indiceDe, dataDoIndice: dataDoIndice, fracao: fracao,
    elementosDe: elementosDe, atividadeDoElemento: atividadeDoElemento, opcoes: opcoes, foco: foco,
    uteisEntre: function (sim, a, b) { return uteisEntre(sim.eixo, ymd(a), ymd(b)); }
  };

  global.BIM4DSim = BIM4DSim;
  if (typeof module !== "undefined" && module.exports) module.exports = BIM4DSim;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

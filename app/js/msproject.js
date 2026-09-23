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
 *
 * ---------------------------------------------------------------------
 * ⚠ TUDO QUE É NOVO ENTRA POR OPÇÃO (11/09/2026). Sem `opts.recursos`,
 *   `opts.custos`, `opts.base`, `opts.avanco` e `opts.restricoes`, o arquivo
 *   sai BYTE A BYTE igual ao de antes: a proposta comercial e os demais
 *   chamadores não passam opção nenhuma, e `tools/test-crono-documentos.js`
 *   compara a saída com a cópia do master. Documento de cliente não pode mudar
 *   porque alguém acrescentou recurso no export do Project.
 *
 * ⚠ ORDEM DOS ELEMENTOS: o schema do Project (mspdi_pj12.xsd) declara os
 *   filhos de Project, Task, Resource e Assignment em <xsd:sequence> — fora de
 *   ordem o arquivo é recusado. A ordem abaixo está copiada das páginas
 *   oficiais (learn.microsoft.com/en-us/office-project/xml-data-interchange,
 *   "… Elements and XML Structure"); o trecho que ESTE arquivo escreve é:
 *
 *   Project: Name · Title · Company · ScheduleFromStart · StartDate ·
 *     CurrencyDigits · CurrencySymbol · CurrencyCode · CurrencySymbolPosition ·
 *     CalendarUID · DefaultStartTime · DefaultFinishTime · MinutesPerDay ·
 *     MinutesPerWeek · DaysPerMonth · DurationFormat · WorkFormat ·
 *     BaselineForEarnedValue · StatusDate · CurrentDate · DefaultTaskEVMethod ·
 *     Calendars · Tasks · Resources · Assignments
 *   Task: UID · ID · Name · Active · Manual · Type · IsNull · WBS ·
 *     OutlineNumber · OutlineLevel · Start · Finish · Duration ·
 *     DurationFormat · Work · EffortDriven · Milestone · Summary · Critical ·
 *     FixedCost · PercentComplete · PercentWorkComplete · Cost · ActualStart ·
 *     ActualFinish · ConstraintType · CalendarUID · ConstraintDate · Deadline ·
 *     Notes · PhysicalPercentComplete · EarnedValueMethod · PredecessorLink ·
 *     Baseline(Number · Start · Finish · Duration · DurationFormat · Work · Cost)
 *   Resource: UID · ID · Name · Type · IsNull · Initials · Group · MaxUnits ·
 *     StandardRate · StandardRateFormat · CalendarUID · Notes
 *   Assignment: UID · TaskUID · ResourceUID · Finish · Start · Units · Work
 *     ⚠ na Assignment o `Finish` vem ANTES do `Start` na sequência oficial —
 *     é contraintuitivo e é assim mesmo.
 *
 *   ⚠ `Active` e `Manual` NÃO estão na sequência publicada de 2007 (são do
 *   schema 2010+, cuja sequência a Microsoft não publica na mesma página).
 *   Eles já saíam daqui antes desta revisão, no lugar em que estão, e não
 *   foram mexidos. `tools/test-msproject-releitura.js` confere a ordem contra
 *   uma lista escrita a partir da doc — sem ler este arquivo — e declara essa
 *   ressalva no lugar de fingir que ela não existe.
 *
 * ⚠ O QUE ESTA REVISÃO NÃO PROVOU: nenhum arquivo foi aberto no MS Project
 *   real. O assistente de importação de MSPDI é um diálogo modal que não se
 *   automatiza (memória `msproject-assistente-modal`). O que está provado é o
 *   que o leitor independente do teste relê e recalcula.
 *
 * ---------------------------------------------------------------------
 * ⚠ ETAPA OPCIONAL FORA DO PRAZO CONTRATADO — A DECISÃO DESTE ARQUIVO
 *   (12/09/2026, a segunda metade do defeito D4). O motor ganhou o
 *   `opcionaisNoPrazo` (js/cronograma.js): DESLIGADO — que é o PADRÃO de
 *   produto — a etapa marcada `opcional` fica no array com `duracao: 0`,
 *   `foraDoPrazo: true` e a duração que ela teria em `duracaoPlena`, porque o
 *   prazo impresso na proposta passou a ser o do escopo que o "Valor total"
 *   cobra.
 *
 *   ESTE ARQUIVO NÃO LIA NENHUMA DAS DUAS MARCAS. MEDIDO na fixture de 4
 *   etapas (a 2ª, "Piscina de fibra e deck", opcional e gorda):
 *     interruptor LIGADO   Duration [PT40H, PT312H, PT72H, PT48H] · Milestone [0,0,0,0]
 *     interruptor DESLIGADO Duration [PT40H, PT0H,  PT72H, PT48H] · Milestone [0,1,0,0]
 *   Ou seja: uma etapa de escopo real virava um LOSANGO MUDO no Gantt que o
 *   cliente abre, e a palavra "opcional" não aparecia no XML em caso nenhum. É
 *   o defeito "conserto que para no segundo consumidor": a tela do engenheiro
 *   passou a dizer a verdade e o arquivo do cliente passou a mentir de um
 *   jeito novo.
 *
 *   A SAÍDA ESCOLHIDA: **a etapa fora do prazo NÃO VAI PARA O ARQUIVO**, e o
 *   arquivo DIZ quantas ficaram de fora e quais (`<Subject>` do projeto, mais
 *   a nota da tarefa que perdeu o elo, mais `opts.relato.opcionais`).
 *
 *   POR QUE NÃO A OUTRA SAÍDA (carimbar o nome e emitir a `duracaoPlena`): a
 *   regra da casa neste arquivo é uma só, e ela está escrita em cada guarda
 *   daqui — A ENTREGA QUE O PROJECT CALCULA TEM DE SER A DO PDF. É por isso
 *   que o serviço leva ConstraintType 4, e é por isso que o "terminar até"
 *   estourado sai só como Deadline. O Project calcula o fim do projeto pelo
 *   MAIOR fim de tarefa; emitir a opcional com a duração plena, na posição em
 *   que o motor a deixa, dá um TERCEIRO número — MEDIDO na mesma fixture: a
 *   contratada acaba no dia útil 20, a opcional acabaria no 44, e o prazo COM
 *   opcionais é 59. Nenhum desses 44 existe em documento nenhum. E o Project
 *   recalcula o caminho crítico sozinho ao abrir: a barra da opcional, sendo a
 *   última a terminar, sairia VERMELHA de caminho crítico, contradizendo a
 *   nota que estivesse ao lado dela.
 *
 *   ⚠ `<Active>0</Active>` (tarefa inativa) FOI CONSIDERADO E RECUSADO. Ele
 *   faria exatamente o que se quer no MS Project Professional 2010+ (barra
 *   riscada, fora da rede, fora do fim do projeto), mas inativar tarefa é
 *   recurso do Professional, e este arquivo também abre no ProjectLibre e no
 *   GanttProject, que ignoram o campo — nesses, a opcional voltaria a empurrar
 *   a entrega, calada. Falha silenciosa em leitor que a gente não pode testar
 *   é pior que ausência: o que não se pode provar não vira o padrão.
 *
 *   ⚠ O ELO QUE APONTAVA PARA A OMITIDA VIRA DATA FIXADA. Com o interruptor
 *   desligado o motor MANTÉM o elo para a opcional (duração 0) — ver o aviso
 *   `depende-de-opcional`. Tirar a tarefa e deixar o elo pendurado faria o
 *   Project recusar a rede; tirar o elo e não pôr nada faria a sucessora
 *   andar para o começo da obra. Ela sai com "não iniciar antes de"
 *   (ConstraintType 4) na data do motor — a MESMA técnica do serviço, pelo
 *   MESMO motivo — e a nota diz de quem era o elo.
 *
 *   ⚠ NADA DISSO ENTRA NO CAMINHO DE SEMPRE. Sem etapa `foraDoPrazo` no
 *   resultado do motor, nem o `<Subject>` nem a omissão existem, e o arquivo
 *   continua byte a byte o do master (tools/test-crono-documentos.js).
 *   Diferente de recurso/custo/base/avanço, isto NÃO pode depender de
 *   `opts.*`: quem gera a proposta comercial não passa opção nenhuma, e é
 *   justamente esse chamador que estava mentindo.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MIN_DIA = 480;          // 8 h de jornada — a mesma que o calendário abaixo declara
  var DEC_POR_DIA = MIN_DIA * 10; // décimos de minuto num dia útil
  var H_DIA = MIN_DIA / 60;   // horas de trabalho num dia útil do arquivo (8)

  /* ⚠ TIPO DO ELO — os quatro do formato, com os números OFICIAIS:
       0 = TT (término-término / FF) · 1 = TI (término-início / FS)
       2 = IT (início-término / SF)  · 3 = II (início-início / SS)
     Fonte: "Type Element (Multiple Parents)", tabela do PredecessorLink.
     ⚠ NÃO É A SEQUÊNCIA QUE A INTUIÇÃO SUGERE (TT é 0 e IT é 2, não 2 e 3).
     Trocar 3 por 0 faz "a laje começa quando o pilar começa" virar "a laje
     termina quando o pilar termina": o arquivo abre, ninguém vê erro, e o
     Project desenha outro cronograma.
     ⚠ DESDE O PLANEJADOR (20/09/2026) O MOTOR PRODUZ OS QUATRO: a rede
     digitada sai em `predTipoRede` (o tipo, com TI omitido) e `predLagTipo` (a
     espera NA RÉGUA DO TIPO). Ver `eloDe`, logo abaixo. */
  var TIPO_ELO = { TT: 0, TI: 1, IT: 2, II: 3 };
  function tipoElo(t) {
    var k = String(t == null ? "" : t).toUpperCase();
    // ⚠ nunca `TIPO_ELO[k] || 1`: TT vale 0, e 0 é falsy — cairia em TI calado
    return Object.prototype.hasOwnProperty.call(TIPO_ELO, k) ? TIPO_ELO[k] : 1;
  }

  /* ⚠ RESTRIÇÃO DE DATA — ConstraintType, valores oficiais:
       0 o quanto antes (ASAP) · 1 o mais tarde possível · 2 deve começar em
       3 deve terminar em · 4 NÃO INICIAR ANTES DE (SNET)
       5 não iniciar DEPOIS de (SNLT) · 6 não terminar antes de (FNET)
       7 NÃO TERMINAR DEPOIS DE (FNLT)
     ⚠ 4 e 5 se parecem e fazem o contrário um do outro: 4 é um PISO (a tarefa
     não desce dali), 5 é um TETO no início (empurra para trás). O "não iniciar
     antes de" dos serviços, que segura a entrega igual à do PDF, é o 4. */
  var CT_ASAP = 0, CT_ALAP = 1, CT_DIA = 2, CT_DTA = 3, CT_NIA = 4, CT_NID = 5, CT_NTA = 6, CT_TAE = 7;
  /* As datas do planejador (`rede.datas` + as duas de sempre) e o
     ConstraintType de cada uma. ⚠ O `mtp` ("o mais tarde possível") está no
     mapa com o número oficial e NÃO É EMITIDO — ver `_restrDe`. */
  var CT_DE = { nia: CT_NIA, dia: CT_DIA, nid: CT_NID, nta: CT_NTA, dta: CT_DTA, tae: CT_TAE, mtp: CT_ALAP };
  // os tipos cujo alvo é o TÉRMINO (o instante é 17 h do último dia trabalhado)
  var RESTR_FIM = { nta: 1, dta: 1, tae: 1 };
  /* Os tipos cuja data digitada RECUA para o último dia de trabalho ≤ ela.
     São os TETOS (`nid`, `tae`) e o piso de TÉRMINO (`nta`) — o motor os
     converte assim (§2.3-E6 da espec: `tetoIniO = phi(u + 1 dia) − 1`,
     `fimMinR = k(u') + 1`, `recuar(cal, u, D)`), e escrever a data crua faria
     o Project julgar por um instante que o calendário do próprio arquivo
     declara parado. O `nia` NÃO entra: ele é piso de início e a data crua é a
     que a pessoa digitou — o Project sobe sozinho para a segunda-feira, do
     mesmo jeito que o motor (js/cronograma.js `_aplicarRestricoes`: "a data
     largada num domingo sobe, nunca desce"). O `dia` e o `dta` também não
     entram: neles sai a posição do PRÓPRIO motor, que já é dia de trabalho. */
  var RESTR_RECUA = { nid: 1, nta: 1, tae: 1, dta: 1 };

  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }

  /* O ELO COMO O MSPDI O QUER: o TIPO da rede digitada e a espera NA RÉGUA
     DESSE TIPO. Devolve {tipo (número do formato), dias, rede}.

     ⚠ NUNCA MANDE `predDesloc` NUM TT/IT/II. O `predDesloc` é, por contrato do
     motor (O20 da espec do planejador), o deslocamento EQUIVALENTE DE
     TÉRMINO-INÍCIO — `inicio(sucessora) ≥ fim(predecessora) + predDesloc` —
     justamente para que a versão anterior do app, que só conhece
     término-início, desenhe a mesma data. Num TT de +2 dias entre uma etapa de
     10 e uma de 6, ele vale 2 − 6 = −4. Emitido ao lado de `<Type>0</Type>`, o
     Project lê "termine 4 dias ANTES do fim da predecessora": a conta entra
     duas vezes, o arquivo abre, nenhum erro aparece, e o cronograma do
     contratante é outro. `tools/test-msproject-releitura.js` tem o controle
     negativo que troca um pelo outro e mede as datas que saem.

     ⚠ SEM REDE DIGITADA SAI EXATAMENTE O DE SEMPRE — o tipo LEGADO
     (`predTipo`, que na folha ainda é só "TI"/"II") e o `predDesloc`. É o que
     mantém o arquivo byte a byte igual ao do master em todo orçamento que não
     usou o planejador (tools/test-crono-documentos.js). */
  function eloDe(no, pid) {
    var tpR = (no.predTipoRede && own(no.predTipoRede, pid)) ? no.predTipoRede[pid] : null;
    var lgR = (no.predLagTipo && no.predLagTipo[pid] != null) ? Number(no.predLagTipo[pid]) : null;
    /* a rede digitada: `predTipoRede` só carrega o que NÃO é TI, e
       `predLagTipo` só carrega a espera EXPLÍCITA — um TT sem espera não tem
       entrada em nenhum dos dois mapas além do tipo, e vale 0 (§1.3 da espec:
       "`l` ausente = … 0 nos outros tipos") */
    if (tpR || lgR != null) return { tipo: tipoElo(tpR || "TI"), dias: lgR == null ? 0 : lgR, rede: true };
    return { tipo: tipoElo((no.predTipo && no.predTipo[pid]) || "TI"),
      dias: (no.predDesloc && no.predDesloc[pid] != null) ? no.predDesloc[pid] : 0, rede: false };
  }
  /* A TAREFA SEM PREÇO tem contrato PRÓPRIO e ele é outro: `predTipo` dela já
     é o tipo de verdade (os quatro) e `predLag` já é a espera na régua do tipo
     (js/cronograma.js `_saidaExtras`). Ela não tem `predDesloc` nenhum — usar
     o `eloDe` aqui devolveria espera 0 em todo elo com espera. */
  function eloDeExtra(x, pid) {
    return { tipo: tipoElo((x.predTipo && x.predTipo[pid]) || "TI"),
      dias: (x.predLag && x.predLag[pid] != null) ? Number(x.predLag[pid]) : 0, rede: true };
  }

  /* duração do MSPDI: PT{h}H{m}M{s}S. ⚠ o `Work` sai FRACIONÁRIO (12,5 h de
     pedreiro num serviço), e "PT12.5H0M0S" não é duração válida — o Project
     recusa o arquivo inteiro. Aqui vira PT12H30M0S. */
  function durISO(horas) {
    var seg = Math.max(0, Math.round((Number(horas) || 0) * 3600));
    return "PT" + Math.floor(seg / 3600) + "H" + Math.floor((seg % 3600) / 60) + "M" + (seg % 60) + "S";
  }
  /* decimal do XML: PONTO e 2 casas. ⚠ nunca formato BR aqui — "1.234,56" num
     <Cost> faz o Project ler 1,23 (ou recusar o arquivo). O R$ com vírgula é
     assunto da TELA do Project, e quem resolve isso é o CurrencySymbol. */
  function dec2(v) { var n = Number(v); return (isFinite(n) ? n : 0).toFixed(2); }
  function dec6(v) { var n = Number(v); return String(Math.round((isFinite(n) ? n : 0) * 1e6) / 1e6); }
  function pctInt(v) { var n = Math.round(Number(v)); return Math.max(0, Math.min(100, isFinite(n) ? n : 0)); }

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
  /* AS DUAS CORREÇÕES DE DATA DIGITADA, e elas vão em SENTIDOS OPOSTOS — é a
     decisão D9 da espec do planejador ("a data digitada nos tipos de término é
     o ÚLTIMO DIA TRABALHADO, como o MS Project mostra"):
       · data de INÍCIO ("não iniciar antes de", "deve iniciar em") largada num
         domingo sobe para a segunda — descer permitiria começar ANTES do que a
         pessoa pediu (é a mesma regra do motor, js/cronograma.js
         `_aplicarRestricoes`: "a data largada num domingo sobe, nunca desce");
       · data de TÉRMINO ("terminar até", "deve terminar em", "não terminar
         antes de") largada num domingo DESCE para a sexta — o motor a converte
         em `recuar(cal, u, D)`/`k(u') + 1`, ou seja, o último dia de trabalho
         ≤ a data. Subir faria o Project aceitar um plano que termina na
         segunda enquanto o OrçaPRO o acusa de estourado: duas verdades para o
         mesmo prazo, e a do contratante é a otimista.
     ⚠ Até 20/09/2026 o "terminar até" saía CRU (`dtIso(R.data, "17:00:00")`).
     Num prazo-limite caído no sábado, o Project lia sábado 17 h — um instante
     que o calendário do arquivo declara PARADO. */
  function recuarUtil(d, dpw, feriados) {
    var x = new Date(d.getTime()), g = 0;
    while (ehParado(x, dpw, feriados) && g++ < 400) x.setDate(x.getDate() - 1);
    return x;
  }
  function avancarUtil(d, dpw, feriados) {
    var x = new Date(d.getTime()), g = 0;
    while (ehParado(x, dpw, feriados) && g++ < 400) x.setDate(x.getDate() + 1);
    return x;
  }
  // n dias ÚTEIS a partir de `d` (n = 0 devolve o próprio dia, sem ajustar)
  function andarUtil(d, n, dpw, feriados) {
    var x = new Date(d.getTime()), passo = n < 0 ? -1 : 1, faltam = Math.abs(n), g = 0;
    while (faltam > 0 && g++ < 4000) { x.setDate(x.getDate() + passo); if (!ehParado(x, dpw, feriados)) faltam--; }
    return x;
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
  function fmtBR(v) {
    var n = Number(v); if (!isFinite(n)) n = 0;
    var p = Math.abs(n).toFixed(2).split("."), i = p[0], out = "";
    while (i.length > 3) { out = "." + i.slice(-3) + out; i = i.slice(0, -3); }
    return (n < 0 ? "-" : "") + i + out + "," + p[1];
  }
  // "AAAA-MM-DD" + hora -> instante do XML (o motor guarda restrição como texto)
  function dtIso(iso, hora) {
    var s = String(iso == null ? "" : iso).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T" + hora : "";
  }
  // Date, ms ou "AAAA-MM-DD" -> Date local (⚠ nunca `new Date("2026-09-08")`:
  // isso é UTC e, em UTC-3, volta um dia — a data do realizado sairia errada)
  function dataDe(v) {
    if (v == null || v === "") return null;
    if (typeof v.getTime === "function") return isNaN(v.getTime()) ? null : v;
    if (typeof v === "number") { var d0 = new Date(v); return isNaN(d0.getTime()) ? null : d0; }
    var s = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  function num0(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* AS ETAPAS FORA DO PRAZO CONTRATADO — ver o ⚠ do cabeçalho.
     Devolve {tem, ids:{noId:1}, etapas:[{id, numero, nome, dias}]}.
     ⚠ A marca desce a árvore inteira no motor (js/cronograma.js: "A MARCA
     `foraDoPrazo` DESCE A ÁRVORE INTEIRA"), então subetapa e serviço da etapa
     opcional também caem em `ids` — e é por isso que o varrimento de
     `atividades` vem junto: excluir só a etapa deixaria os filhos dela no
     arquivo, órfãos, com data e sem pai. */
  function forasDe(r) {
    var m = {}, lista = [];
    ((r && r.etapas) || []).forEach(function (e, i) {
      if (!e || e.foraDoPrazo !== true) return;
      m[e.id] = 1;
      lista.push({ id: e.id, numero: String(i + 1), nome: String(e.nome || ("Etapa " + (i + 1))), dias: num0(e.duracaoPlena) });
    });
    ((r && r.atividades) || []).forEach(function (n) { if (n && n.foraDoPrazo === true) m[n.id] = 1; });
    return { tem: lista.length > 0, ids: m, etapas: lista };
  }
  /* O texto que o arquivo leva — ⚠ no `<Subject>`, que é o campo de TEXTO
     LIVRE que a sequência do MSPDI dá ao elemento Project (ver a ORDEM do
     schema no cabeçalho: o Project NÃO tem `Notes`; inventar um elemento faria
     o Project recusar o arquivo inteiro). Ele aparece nas propriedades do
     documento; a visibilidade dentro do Gantt vem da nota da tarefa que perdeu
     o elo, e quem gera vê tudo em `opts.relato.opcionais`.
     ⚠ O TEXTO É LIMITADO DE PROPÓSITO. A propriedade do documento não é lugar
     de lista longa (nem se sabe, sem abrir o Project real, onde ela corta); o
     texto declara o NÚMERO — que é o que não pode faltar — lista as que cabem
     em `TETO` caracteres e conta o resto. A lista inteira sai no relato, que é
     o que a tela mostra. */
  var TETO_SUBJECT = 250;
  function fraseFora(F, totalEtapas) {
    if (F.etapas.length && F.etapas.length === totalEtapas) {
      return "TODAS as " + totalEtapas + " etapas deste orcamento estao marcadas como opcionais e nenhuma entra no prazo contratado: " +
        "este arquivo saiu SEM TAREFA NENHUMA, porque nao ha escopo contratado para programar.";
    }
    var cab = F.etapas.length + " etapa(s) opcional(is) NAO entra(m) neste cronograma: ";
    var pe = ". O prazo e o valor deste arquivo sao os do escopo contratado - o mesmo da proposta.";
    var sobra = TETO_SUBJECT - cab.length - pe.length, corpo = "", n = 0;
    for (var i = 0; i < F.etapas.length; i++) {
      var o = F.etapas[i], txt = o.numero + " " + o.nome + " (" + o.dias + " dia(s) util(eis) se contratada)";
      // ⚠ o primeiro entra mesmo estourando: um nome comprido não pode fazer o
      //   recado virar "0 listadas" — ele é cortado, e o resto é contado
      if (!n) { corpo = txt.slice(0, Math.max(40, sobra - 12)); n++; continue; }
      if (corpo.length + txt.length + 2 > sobra - 12) break;
      corpo += "; " + txt; n++;
    }
    if (n < F.etapas.length) corpo += " e mais " + (F.etapas.length - n);
    return cab + corpo + pe;
  }

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
      var porId = {}, cont = { etapas: 0, resumos: 0, folhas: 0, servicos: 0, semBase: 0, elosInternos: 0, elosCruzados: 0, elosCortados: 0, foraDoPrazo: 0 };
      var recolhidas = [], problema = null, FORA = forasDe(r);
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
          if (FORA.ids[s.id]) return;                       // ⚠ fora do prazo contratado: não vai (ver o ⚠ do cabeçalho)
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
        /* ⚠ ETAPA OPCIONAL FORA DO PRAZO: sai do arquivo inteira, com os
           filhos. Sem isto ela ia como marco mudo (duração 0) — ver o ⚠ do
           cabeçalho. Quem conta o que ficou de fora é `cont.foraDoPrazo`, e
           quem diz ao leitor do arquivo é o `<Subject>` do projeto. */
        if (FORA.ids[e.id]) { cont.foraDoPrazo++; return; }
        var le = folha(e, 1); if (!le) return;
        cont.etapas++;
        var kids = [];
        if (e.papel === "resumo") {
          filhosDe(e).forEach(function (f) {
            if (f.tipo !== "subetapa" && f.tipo !== "soltos") return;
            if (FORA.ids[f.id]) return;
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
        /* ⚠ ELO PARA TAREFA OMITIDA: o elo some e a data do motor vira "não
           iniciar antes de" na emissão (`_tarefasHier`). Elo pendurado para um
           UID que não está no arquivo o Project recusa; elo nenhum e sem piso,
           a sucessora anda para o começo da obra. Ver o ⚠ do cabeçalho. */
        function fora(pid) { if (!FORA.ids[pid]) return false; l.cortouFora = (l.cortouFora || []).concat([pid]); return true; }
        if (l.nivel === 1) {
          (no.preds || []).forEach(function (pid) {
            if (fora(pid)) return;
            if (!uidEt[pid]) return;
            // ⚠ `tipo: 1` fixo era o de antes do planejador — ver `eloDe`
            var E1 = eloDe(no, pid);
            links.push({ uid: uidEt[pid], tipo: E1.tipo, dias: E1.dias });
          });
        } else if (no.tipo === "subetapa" || no.tipo === "soltos") {
          var irmas = (porId[no.paiId] && porId[no.paiId].filhos) || [];
          (no.preds || []).forEach(function (pid) {
            if (fora(pid)) return;
            var p = porId[pid];
            if (!p || !uidDe[pid]) return;
            if (p.cicloDep && no.cicloDep && irmas.indexOf(pid) > irmas.indexOf(no.id)) { cont.elosCortados++; return; }
            /* ⚠ O TIPO PASSA PELO MAPA, não por um `? 3 : 1` escrito aqui.
               Com dois lugares traduzindo o mesmo elo, um deles apodrece: o
               `tipoElo` era código MORTO até 11/09/2026 justamente porque esta
               linha tinha a própria conta — o controle negativo que troca II
               por TT no mapa saía com o arquivo IDÊNTICO, e o assert "o mapa
               está certo" não provava nada. */
            var EF1 = eloDe(no, pid);
            links.push({ uid: uidDe[pid], tipo: EF1.tipo, dias: EF1.dias });
            cont.elosInternos++;
          });
          /* O ELO CRUZADO (O26): a subetapa que depende de uma subetapa de
             OUTRA etapa. Ele não está em `preds` — o motor o guarda como
             chave a mais em `predTipoRede`/`predLagTipo`, porque na sombra da
             versão anterior ele vira elo entre as ETAPAS ("a etapa anda em
             bloco", D7). No arquivo detalhado as duas folhas existem, então o
             elo vai inteiro: ele já está satisfeito na posição em que o motor
             pôs a folha, e emiti-lo é o que impede o Project de puxá-la para o
             começo da etapa se alguém mexer na rede lá dentro. */
          var jaLig = {};
          links.forEach(function (k2) { jaLig[k2.uid] = 1; });
          /* ⚠ REDE CIRCULAR ENTRE ETAPAS: o elo cruzado NÃO SAI. Quando o
             motor não conseguiu ordenar as etapas ele marca `cicloDep` e
             desenha ignorando o elo de volta — mas mantém a lista de
             predecessoras. No arquivo, um elo entre folhas de duas etapas que
             dependem uma da outra fecha o laço por dentro dos resumos (o
             resumo herda o fim dos filhos) e o Project recusa a REDE INTEIRA,
             que é pior que uma folha sem elo. É a mesma decisão do ciclo
             INTERNO, logo acima, e conta no mesmo `elosCortados`. */
          var paiN = porId[no.paiId];
          [no.predTipoRede, no.predLagTipo].forEach(function (mp) {
            if (!mp) return;
            Object.keys(mp).forEach(function (fid) {
              if ((no.preds || []).indexOf(fid) >= 0) return;         // já saiu acima
              if (fora(fid) || !uidDe[fid] || jaLig[uidDe[fid]]) return;
              // ⚠ marcar ANTES de decidir: os dois mapas (`predTipoRede` e
              //   `predLagTipo`) têm a mesma chave, e sem isto o mesmo elo
              //   cortado era contado DUAS vezes no relato
              jaLig[uidDe[fid]] = 1;
              var alvo = porId[fid], paiA = alvo ? porId[alvo.paiId] : null;
              if ((paiN && paiN.cicloDep) || (paiA && paiA.cicloDep) || (alvo && alvo.cicloDep)) { cont.elosCortados++; return; }
              var EX = eloDe(no, fid);
              links.push({ uid: uidDe[fid], tipo: EX.tipo, dias: EX.dias });
              cont.elosCruzados++;
            });
          });
        }
        l.links = links;
      });
      // `proxUid` = o maior UID já usado; as tarefas sem preço começam depois
      return { ok: true, detalhe: detalhe, linhas: linhas, contagens: cont, recolhidas: recolhidas, fora: FORA.etapas,
        proxUid: Math.max(prox, r.etapas.length) };
    },

    /* =================================================================
       ENRIQUECIMENTO (opcional) — recursos, dinheiro, linha de base, avanço
       e restrições de data. Cada bloco tem a sua opção, e nenhum roda sem ela.

       opts.recursos — PROVEDOR INJETADO. A fonte de hora-homem mora fora deste
         arquivo (o analítico da Execução, lido pelo js/histograma.js), e este
         módulo é puro. Duas formas aceitas:
           {hhDoItem: fn, analitico: A}  — o MESMO contrato do Histograma:
              hhDoItem(item, analitico) -> {prof: {"PEDREIRO": {hh: 12.5}}}
           {porServico: fn}              — direto: fn(no) -> {"PEDREIRO": 12.5}
         ⚠ SEM PROVEDOR NÃO SAI BLOCO NENHUM — nem vazio. Inventar "1 equipe"
         por tarefa encheria o Gráfico de Recursos do Project com gente que a
         medição da obra derruba, num arquivo que vai para a construtora. O
         `opts.relato` diz que não saiu e por quê.

       opts.custos — `true` usa `no.valor` (o VALOR DE VENDA que o
         `Cronograma.estimar` recebeu em `ctx.valores`); `{porId: {...}}` usa o
         mapa que o chamador der.
         ⚠ NUNCA `e.custo`/`n.custo`: aquilo é CUSTO DIRETO, número interno da
         RA. O arquivo do Project vai para o cliente e para a construtora — o
         dinheiro que sai daqui é preço de venda, e a nota da tarefa diz isso
         com todas as letras.
         ⚠ E NUNCA EM TAREFA-RESUMO: o Project soma os filhos no resumo;
         escrever lá dá o dobro no total do projeto, e quem descobre é o
         cliente somando na calculadora.

       opts.base — o registro de `CronoPlan.congelarBase` ({cal, nos}), ou
         `{porId: {noId: {inicio, fim, duracao, custo}}}` já resolvido.
         ⚠ As datas saem do calendário DA BASE (`base.cal`: início, dias por
         semana e feriados de quando ela foi congelada), nunca do cronograma de
         hoje. A base é a promessa antiga; recalculá-la com o calendário novo
         apagaria justamente o desvio que ela existe para mostrar.

       opts.avanco — {dataStatus, porNo: {noId: {pct, pctTrabalho, inicioReal,
         fimReal}}}.
         ⚠ SÓ SAI O QUE FOI APURADO. Nó sem entrada no mapa não recebe
         PercentComplete nenhum: escrever 0 % em tudo desenha a linha de
         andamento colada no início e faz uma obra em dia parecer parada.
         ⚠ ActualStart/ActualFinish só quando o provedor os der. Carimbar a
         data planejada como "realizada" é inventar medição.

       opts.restricoes — leva as datas fixadas do motor (`no.restricao`):
         "nia" (não iniciar antes de) -> ConstraintType 4;
         "tae" (terminar até)         -> ConstraintType 7 + Deadline.
         ⚠ "tae" ESTOURADA sai só como Deadline. No OrçaPRO ela avisa e não
         empurra a rede (js/cronograma.js: "a restrição avisa; ela não encurta
         a etapa nem empurra as outras"); no Project o ConstraintType 7 MANDA,
         e um plano que já não cabe viraria conflito com datas diferentes das
         do PDF. O Deadline é a seta que alerta sem mexer na rede.

       opts.relato — objeto do chamador, preenchido com o que entrou e o que
         ficou de fora (a tela precisa disso para não prometer o que o arquivo
         não tem). Não muda o XML.
       ================================================================= */
    _opcs: function (opts) {
      var o = opts || {};
      var e = { recursos: o.recursos || null, base: null, bases: null, avanco: o.avanco || null,
        restricoes: o.restricoes === true, custos: null,
        relato: (o.relato && typeof o.relato === "object") ? o.relato : null };
      /* `opts.base` continua aceitando UM registro (é o que os chamadores de
         antes passam, e o arquivo deles não muda). A lista
         `[{numero, reg, rotulo}]` é a das 11 linhas de base do formato. */
      if (Array.isArray(o.base)) e.bases = o.base.filter(function (b) { return b && typeof b === "object"; });
      else if (Array.isArray(o.bases)) e.bases = o.bases.filter(function (b) { return b && typeof b === "object"; });
      else e.base = o.base || null;
      if (e.bases && !e.bases.length) e.bases = null;
      if (o.custos === true) e.custos = { porId: null };
      else if (o.custos && typeof o.custos === "object") e.custos = { porId: o.custos.porId || o.custos };
      e.algum = !!(e.recursos || e.base || e.bases || e.avanco || e.restricoes || e.custos);
      return e;
    },

    // serviços descendentes de um nó da EAP (a folha do XML pode ser subetapa,
    // grupo "N.g", etapa sem subetapa, ou o próprio serviço)
    _servicosDe: function (no, porId) {
      if (!no) return [];
      if (no.tipo === "servico") return [no];
      var out = [], pilha = (no.filhos || []).slice(), g = 0;
      while (pilha.length && g++ < 20000) {   // guarda: árvore torta não trava o export
        var n = porId[pilha.pop()];
        if (!n) continue;
        if (n.tipo === "servico") { if (!n.semBase) out.push(n); }
        else (n.filhos || []).forEach(function (id) { pilha.push(id); });
      }
      return out;
    },

    /* RECURSOS E ALOCAÇÕES a partir do provedor. Devolve
       {ok, recursos:[{uid,nome,horas,pico}], porTarefa:{uid:{horas, prof:{}}},
        alocacoes:[{uid,tarefaUID,recursoUID,horas,units,a,b}], relato}.

       ⚠ A CONTA QUE IMPEDE O PROJECT DE MUDAR A DATA: `Units = Work ÷ duração
       da tarefa em horas`, com a duração em horas do DIA DE 8 h que este
       arquivo declara (MinutesPerDay 480) — não na jornada de quem mediu o
       Hh. Com isso `duração = Work ÷ (Units × 8 h)` fecha por construção, e o
       Project não reescalona nada. Junto com `<Type>1</Type>` (duração fixa) e
       `<EffortDriven>0</EffortDriven>`, é o que garante que acrescentar gente
       lá dentro não encurte a tarefa e a entrega continue sendo a do PDF. */
    _recursos: function (plano, r, prov) {
      var self = this;
      var rel = { ok: false, motivo: "", recursos: 0, alocacoes: 0, horas: 0,
        servicosComHora: 0, servicosSemHora: 0, tarefasSemAlocacao: 0, marcos: 0 };
      var vazio = { ok: false, recursos: [], porTarefa: {}, alocacoes: [], relato: rel };
      if (!plano || !plano.ok) {
        rel.motivo = "recurso só sai no cronograma detalhado (opts.detalhe \"subetapa\" ou \"servico\"): o XML por etapa não tem serviço para perguntar ao provedor.";
        return vazio;
      }
      var fn = null;
      if (prov && typeof prov.porServico === "function") {
        fn = function (no) { return prov.porServico(no) || {}; };
      } else if (prov && typeof prov.hhDoItem === "function") {
        fn = function (no) {
          var it = { id: no.itemId, codigo: no.codigo, descricao: no.nome, unidade: no.unidade, quantidade: no.quantidade };
          var rr = null;
          try { rr = prov.hhDoItem(it, prov.analitico || null); } catch (e1) { rr = null; }
          var p = (rr && rr.prof) || {}, out = {}, k;
          for (k in p) if (own(p, k)) out[k] = Number(p[k] && p[k].hh) || 0;
          return out;
        };
      }
      if (!fn) {
        rel.motivo = "provedor de recursos sem hhDoItem nem porServico — nenhum recurso foi escrito. Este arquivo não inventa profissão nem equipe.";
        return vazio;
      }
      var porId = {};
      (r.atividades || []).forEach(function (n) { if (!own(porId, n.id)) porId[n.id] = n; });

      var porTarefa = {}, totProf = {}, linhasFolha = [];
      plano.linhas.forEach(function (l) {
        if (l.resumo) return;                                  // o Project soma o resumo sozinho
        var horasTarefa = Math.round((l.no.duracao || 0) * H_DIA);
        if (!horasTarefa) { rel.marcos++; return; }             // marco: não há janela onde pôr trabalho
        var prof = {}, algum = false;
        self._servicosDe(l.no, porId).forEach(function (s) {
          var h = fn(s) || {}, k, soma = 0;
          for (k in h) if (own(h, k)) {
            var v = Number(h[k]) || 0;
            if (!(v > 0)) continue;
            var nome = String(k).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, 60);
            if (!nome) continue;
            prof[nome] = (prof[nome] || 0) + v; soma += v; algum = true;
          }
          if (soma > 0) rel.servicosComHora++; else rel.servicosSemHora++;
        });
        if (!algum) { rel.tarefasSemAlocacao++; return; }
        porTarefa[l.uid] = { prof: prof, horas: 0, horasTarefa: horasTarefa, no: l.no };
        linhasFolha.push(l);
        for (var p in prof) if (own(prof, p)) totProf[p] = (totProf[p] || 0) + prof[p];
      });
      var nomes = [];
      for (var pn in totProf) if (own(totProf, pn)) nomes.push(pn);
      if (!nomes.length) {
        rel.motivo = "nenhum serviço deste cronograma tem hora-homem no provedor (" + rel.servicosSemHora + " conferido(s)) — o bloco de recursos não foi escrito, em vez de sair vazio.";
        return vazio;
      }
      nomes.sort(function (a, b) { return totProf[b] - totProf[a] || (a < b ? -1 : 1); });
      var uidDe = {}, recursos = nomes.map(function (nm, i) {
        uidDe[nm] = i + 1;
        return { uid: i + 1, nome: nm, horas: totProf[nm], pico: 0 };
      });

      /* PICO de cada profissão = o maior nº de unidades simultâneas que o
         cronograma pede, por diferença acumulada no eixo de dias úteis. É o
         `MaxUnits` do recurso: abaixo disso o Project pinta superalocação
         vermelha num plano que ninguém disse ser impossível; acima, esconde a
         superalocação de verdade. */
      var fimMax = 0;
      linhasFolha.forEach(function (l) { if ((l.no.fim || 0) > fimMax) fimMax = l.no.fim || 0; });
      var delta = {};
      nomes.forEach(function (nm) { delta[nm] = []; for (var i = 0; i <= fimMax + 1; i++) delta[nm].push(0); });

      var alocacoes = [], uidA = 0;
      linhasFolha.forEach(function (l) {
        var T = porTarefa[l.uid], prof = T.prof, p;
        for (p in prof) if (own(prof, p)) {
          // ⚠ o Work EMITIDO (arredondado ao segundo) é a base do Units: derivar
          //   os dois do mesmo número mantém `Work = Units × duração` exato
          var horas = Math.round(prof[p] * 3600) / 3600;
          if (!(horas > 0)) continue;
          var units = horas / T.horasTarefa;
          T.horas += horas; rel.horas += horas;
          alocacoes.push({ uid: ++uidA, tarefaUID: l.uid, recursoUID: uidDe[p], recurso: p,
            horas: horas, units: units, a: l.a, b: l.b });
          var i0 = Math.max(0, Math.floor(l.no.inicio || 0)), i1 = Math.max(i0 + 1, Math.ceil(l.no.fim || 0));
          if (delta[p][i0] != null) delta[p][i0] += units;
          if (delta[p][i1] != null) delta[p][i1] -= units;
        }
      });
      recursos.forEach(function (R) {
        var acc = 0, pico = 0, d = delta[R.nome];
        for (var i = 0; i < d.length; i++) { acc += d[i]; if (acc > pico) pico = acc; }
        R.pico = Math.round(pico * 1e6) / 1e6;
      });
      rel.ok = true; rel.recursos = recursos.length; rel.alocacoes = alocacoes.length;
      rel.horas = Math.round(rel.horas * 100) / 100;
      rel.motivo = recursos.length + " profissão(ões), " + alocacoes.length + " alocação(ões), " +
        rel.horas + " hora(s)-homem. Units = trabalho ÷ duração da tarefa (dia de " + H_DIA + " h).";
      return { ok: true, recursos: recursos, porTarefa: porTarefa, alocacoes: alocacoes, relato: rel };
    },

    /* LINHA DE BASE resolvida em datas. Aceita o registro de
       `CronoPlan.congelarBase` (`{cal:{dataInicio,diasUteisSemana,feriados},
       nos:[{id,i,f,v}]}`) ou `{porId:{noId:{inicio,fim,duracao,custo}}}`.
       ⚠ `i`/`f` da base são ÍNDICES de dia útil, e o `f` é o dia em que o nó
       DEIXA de ocupar a equipe (o mesmo `fim` do motor). O Project quer o
       ÚLTIMO dia trabalhado, às 17 h — é a mesma armadilha do `ultimoDiaUtil`
       lá em cima, e errá-la põe a barra cinza um dia à frente da azul. */
    _base: function (base) {
      var rel = { ok: false, motivo: "", nos: 0, versao: null, custo: 0, ajusteInicio: null }, porId = {};
      if (!base || typeof base !== "object") { rel.motivo = "sem linha de base."; return { ok: false, porId: porId, relato: rel }; }
      if (base.porId && typeof base.porId === "object") {
        var k, n = 0;
        for (k in base.porId) if (own(base.porId, k)) {
          var b = base.porId[k], a = dataDe(b && b.inicio), z = dataDe(b && b.fim);
          if (!a || !z) continue;
          porId[k] = { a: a, b: z, dias: Number(b.duracao) || 0, custo: b.custo == null ? null : Number(b.custo) };
          n++; if (porId[k].custo) rel.custo += porId[k].custo;
        }
        rel.ok = n > 0; rel.nos = n; rel.versao = base.versao != null ? base.versao : null;
        rel.motivo = n ? n + " nó(s) com linha de base." : "o mapa porId da linha de base não trouxe nó nenhum com data.";
        return { ok: rel.ok, porId: porId, relato: rel };
      }
      var cal = base.cal, lista = base.nos;
      if (!cal || !Array.isArray(lista) || !lista.length) {
        rel.motivo = "registro de linha de base sem cal/nos — nada foi escrito (o formato esperado é o de CronoPlan.congelarBase).";
        return { ok: false, porId: porId, relato: rel };
      }
      var ini = dataDe(cal.dataInicio);
      if (!ini) { rel.motivo = "a linha de base não tem data de início (cal.dataInicio)."; return { ok: false, porId: porId, relato: rel }; }
      if (typeof Cronograma === "undefined" || !Cronograma.calendario) {
        rel.motivo = "motor do cronograma não carregado — não dá para converter os índices da linha de base em datas.";
        return { ok: false, porId: porId, relato: rel };
      }
      var dpw = Number(cal.diasUteisSemana) || 5, mapa = {};
      (cal.feriados || []).forEach(function (f) { mapa[String(f).slice(0, 10)] = 1; });
      /* ⚠ O DIA 0 DA BASE TEM DE SER DIA DE OBRA — a MESMA guarda que o
         `Cronograma.estimar` aplica ao cronograma de hoje (js/cronograma.js,
         "O DIA 0 TEM DE SER DIA DE OBRA"). Ela faltava aqui, e a régua estava
         duplicada em dois lugares com uma metade só. Reproduzido: registro com
         `cal.dataInicio` num DOMINGO produziu `<Baseline><Start>` num dia que o
         calendário DO PRÓPRIO ARQUIVO declara `DayWorking 0` — o Project empurra
         a barra cinza e o desvio previsto × realizado nasce de uma data que não
         existe no calendário da obra. O caminho do produto hoje não cai nisso
         (CronoPlan.congelarBase grava o início já ajustado), mas `_base` aceita
         registro de qualquer origem, e data que muda sozinha e calada é pior que
         erro visível: o ajuste vai no relato. */
      var iniPedido = ini, giros = 0;
      if (Cronograma.diaUtil) {
        ini = new Date(ini.getTime());
        while (!Cronograma.diaUtil(ini, dpw, mapa) && giros++ < 40) ini.setDate(ini.getDate() + 1);
      }
      if (ini.getTime() !== iniPedido.getTime()) {
        rel.ajusteInicio = { de: ch(iniPedido), para: ch(ini), motivo: mapa[ch(iniPedido)] ? "feriado" : "fim de semana" };
      }
      // ⚠ calendário DA BASE (início, semana e feriados de quando ela foi congelada)
      var tab = Cronograma.calendario({ dataInicio: ini, params: { diasUteisSemana: dpw }, feriados: { mapa: mapa } });
      if (!tab) { rel.motivo = "não consegui montar o calendário da linha de base."; return { ok: false, porId: porId, relato: rel }; }
      lista.forEach(function (b) {
        if (!b || b.id == null) return;
        var i = Number(b.i), f = Number(b.f);
        if (!isFinite(i) || !isFinite(f) || i < 0 || f < i) return;
        var a = tab.dia(i), z = (f === i) ? a : ultimoDiaUtil(tab.dia(f), dpw, mapa);
        porId[b.id] = { a: a, b: z, dias: f - i, custo: b.v == null ? null : Number(b.v) };
        rel.nos++; if (b.v) rel.custo += Number(b.v) || 0;
      });
      rel.ok = rel.nos > 0;
      rel.versao = base.versao != null ? base.versao : null;
      rel.motivo = rel.nos ? rel.nos + " nó(s) com linha de base" + (rel.versao != null ? " (versão " + rel.versao + ")" : "") +
        ", pelo calendário da própria base (início " + ch(ini) + ", " + dpw + " dias/semana, " +
        Object.keys(mapa).length + " feriado(s))" +
        (rel.ajusteInicio ? " — ⚠ o registro pedia " + rel.ajusteInicio.de + ", que e " + rel.ajusteInicio.motivo +
          " no calendario DA BASE; a base comeca no primeiro dia util, " + rel.ajusteInicio.para : "") +
        "." : "a linha de base não trouxe nó com índice válido.";
      return { ok: rel.ok, porId: porId, relato: rel };
    },

    /* ⚠ O DINHEIRO DA LINHA DE BASE SÓ PODE SAIR UMA VEZ POR RAMO.
       MEDIDO no Project real em 12/09/2026, e o resultado explica a assimetria
       que este arquivo tem com o `<Cost>`:
         · `Cost` o Project SOMA sozinho no resumo (100 + 200 nos filhos deram
           300 no pai, sem ninguém escrever lá). Por isso escrever `<Cost>` em
           resumo dá o dobro — é o ⚠ de `_campos.estado`.
         · `BaselineCost` ele NÃO soma (com 100 e 200 nos filhos, o pai ficou
           0,00). Ou seja: sem escrever no resumo, a barra cinza do resumo fica
           sem dinheiro — e no detalhe "serviço" TODA a base cai em resumo,
           porque `CronoPlan.congelarBase` guarda etapa/subetapa e não serviço.
           Proibir ali apagaria o custo de base do arquivo inteiro.
       O que sobra de problema é a DOBRA ENTRE NÍVEIS DA PRÓPRIA BASE: a base
       guarda a etapa (R$ 1.000) e as subetapas dela (R$ 600 + R$ 400), e somar
       a coluna dá R$ 2.000 de obra que custa R$ 1.000. Medido num orçamento
       real: 1,87× o total do projeto. Por isso o custo sai só no nó da base que
       não tem OUTRO nó da base abaixo dele; os de cima levam datas e duração,
       que é o que desenha a barra — e datas não se somam.

       ⚠ "ABAIXO" É NO ARQUIVO, NÃO NA ÁRVORE — e este ⚠ existe porque a
       primeira versão desta função errou exatamente aqui. Ela olhava só a EAP,
       e uma etapa cujo filho tem base mas NÃO vira tarefa (o grupo "N.g" no
       detalhe "subetapa") perdeu o custo para um herdeiro que não está no
       arquivo: R$ 7.327,50 de um total de R$ 71.882,15 sumiram calados. Quem
       achou foi a releitura do .mpp pelo próprio Project, não o gate. Só conta
       como "abaixo" o nó que também virou TAREFA. */
    _baseSemDobra: function (B, r, plano) {
      var porId = {}, temAbaixo = {}, noArquivo = {};
      (r && r.atividades || []).forEach(function (n) { if (!own(porId, n.id)) porId[n.id] = n; });
      if (plano && plano.ok) plano.linhas.forEach(function (l) { noArquivo[l.no.id] = 1; });
      else (r && r.etapas || []).forEach(function (e) { noArquivo[e.id] = 1; });
      Object.keys(B.porId).forEach(function (id) {
        var n = porId[id];
        if (!n) return;
        var pilha = (n.filhos || []).slice(), g = 0;
        while (pilha.length && g++ < 20000) {
          var f = porId[pilha.pop()];
          if (!f) continue;
          if (own(B.porId, f.id) && noArquivo[f.id]) { temAbaixo[id] = 1; break; }
          (f.filhos || []).forEach(function (k) { pilha.push(k); });
        }
      });
      var comCusto = 0, semCusto = 0, soma = 0;
      Object.keys(B.porId).forEach(function (id) {
        var b = B.porId[id];
        b.custoVai = b.custo != null && !temAbaixo[id];
        // o relato conta o que vai no ARQUIVO — nó que não virou tarefa não entra
        if (!noArquivo[id]) return;
        if (b.custoVai) { comCusto++; soma += Number(b.custo) || 0; }
        else if (b.custo != null) semCusto++;
      });
      B.relato.custoEm = comCusto;
      B.relato.custoOmitido = semCusto;
      B.relato.custoSoma = Math.round(soma * 100) / 100;
    },

    /* AVANÇO apurado. {dataStatus, porNo:{noId:{pct, pctTrabalho, inicioReal,
       fimReal}}} -> mapa normalizado. Nó ausente = SEM avanço escrito. */
    _avanco: function (av) {
      var rel = { ok: false, motivo: "", nos: 0, comInicio: 0, comFim: 0, partidas: 0, pinos: 0, dataStatus: null }, porId = {};
      if (!av || typeof av !== "object") { rel.motivo = "sem avanço apurado."; return { ok: false, porId: porId, dataStatus: null, relato: rel }; }
      var ds = dataDe(av.dataStatus);
      var m = av.porNo || av.porId || null;
      if (!m || typeof m !== "object") { rel.motivo = "avanço sem o mapa porNo — nada foi escrito."; return { ok: false, porId: porId, dataStatus: ds, relato: rel }; }
      var k;
      for (k in m) if (own(m, k)) {
        var v = m[k]; if (!v || typeof v !== "object") continue;
        var p = Number(v.pct);
        if (!isFinite(p)) continue;
        var o = { pct: pctInt(p), pctTrabalho: isFinite(Number(v.pctTrabalho)) ? pctInt(v.pctTrabalho) : null,
          a: dataDe(v.inicioReal), b: dataDe(v.fimReal),
          // a partida da tarefa em andamento e o pino do que o corte empurrou
          parou: dataDe(v.parouEm), retoma: dataDe(v.retomaEm), piso: dataDe(v.pisoEm),
          dias: (typeof v.diasTrabalho === "number" && v.diasTrabalho > 0) ? v.diasTrabalho : null };
        // ⚠ meia partida não existe: sem os DOIS lados o Project não sabe onde recomeçar
        if (!o.parou || !o.retoma) { o.parou = null; o.retoma = null; o.dias = null; }
        porId[k] = o; rel.nos++;
        if (o.a) rel.comInicio++;
        if (o.b) rel.comFim++;
        if (o.retoma) rel.partidas++;
        if (o.piso) rel.pinos++;
      }
      rel.ok = rel.nos > 0; rel.dataStatus = ds ? ch(ds) : null;
      /* ⚠ sem StatusDate o Project NÃO desenha a linha de andamento: o avanço
         fica nas barras e o gráfico que o contratante olha na reunião some. */
      rel.motivo = !rel.nos ? "o mapa de avanço não trouxe nó com percentual."
        : rel.nos + " nó(s) com avanço" + (ds ? ", data de status " + ch(ds) : " — ⚠ SEM data de status: o Project não desenha a linha de andamento") +
          " (" + rel.comInicio + " com início real, " + rel.comFim + " com término real" +
          (rel.partidas ? ", " + rel.partidas + " partida(s) Parar/Retomar" : "") +
          (rel.pinos ? ", " + rel.pinos + " empurrada(s) presa(s) na data de corte" : "") + ").";
      return { ok: rel.ok, porId: porId, dataStatus: ds, relato: rel };
    },

    /* Tudo junto, uma vez por arquivo. Devolve null quando nenhuma opção veio
       — e é esse null que faz o XML de sempre sair byte a byte igual. */
    _enriquecer: function (r, plano, opts) {
      var O = this._opcs(opts);
      if (!O.algum) return null;
      var E = { custos: null, valores: null, rec: null, base: null, bases: null, avanco: null, restricoes: O.restricoes,
        /* ⚠ O CALENDÁRIO DO ARQUIVO FICA AQUI, e não é enfeite: a correção da
           data digitada de término (D9, `recuarUtil`) e o dia em que o
           restante do avanço recomeça precisam saber quais dias a obra
           trabalha. Sem isso um prazo-limite no sábado sairia num instante que
           o próprio `<Calendar>` do arquivo declara parado. */
        dpw: (r && r.params && r.params.diasUteisSemana) || 5,
        fer: (r && r.feriados && r.feriados.mapa) || {},
        relato: { recursos: null, custo: null, base: null, avanco: null, restricoes: null, conferencia: null } };
      if (O.custos) {
        E.valores = O.custos.porId || null;   // null = ler `no.valor` do próprio nó
        E.custos = true;
        E.relato.custo = { ok: false, motivo: "", tarefas: 0, total: 0, totalEtapas: 0, residuo: 0, semValor: 0 };
      }
      if (O.recursos) {
        var R = this._recursos(plano, r, O.recursos);
        E.rec = R.ok ? R : null; E.relato.recursos = R.relato;
      }
      if (O.custos) E.relato.custo.folhasSemValor = 0;
      if (O.bases) {
        /* AS LINHAS DE BASE 0 a 10 (§3.5 da espec do planejador: 0 = a ATIVA,
           1 = a CONTRATUAL pelo selo, 2 a 10 = as demais, da mais nova para a
           mais velha). O MSPDI guarda cada uma num `<Baseline>` próprio,
           separado pelo `<Number>`; o Project mostra a 0 como "Linha de Base"
           e as outras como "Linha de Base 1..10".
           ⚠ O TETO DE 11 É DO FORMATO, não escolha nossa: `Number` vai de 0 a
           10. Base a mais não vira erro — fica de fora e o relato diz quantas,
           porque um arquivo recusado pelo Project é pior que uma barra cinza
           a menos. */
        E.bases = []; E.relato.base = { ok: false, motivo: "", pedidas: O.bases.length, escritas: 0, emResumo: 0, fora: 0, numeros: [] };
        var self0 = this;
        O.bases.forEach(function (b) {
          var n = Math.round(Number(b.numero));
          if (!(n >= 0 && n <= 10) || E.bases.length > 10) { E.relato.base.fora++; return; }
          var Bx = self0._base(b.reg || b);
          if (!Bx.ok) { E.relato.base.fora++; return; }
          Bx.numero = n; Bx.rotulo = String(b.rotulo || "");
          self0._baseSemDobra(Bx, r, plano);
          E.bases.push(Bx); E.relato.base.numeros.push(n);
          if (!E.base) E.base = Bx;   // a 1ª da lista responde pelo relato de custo de sempre
        });
        E.relato.base.ok = E.bases.length > 0;
        E.relato.base.motivo = E.bases.length
          ? E.bases.length + " linha(s) de base no arquivo (Number " + E.relato.base.numeros.join(", ") + ")"
          : "nenhuma linha de base entrou.";
        if (!E.bases.length) E.bases = null;
      } else if (O.base) {
        var B = this._base(O.base); E.base = B.ok ? B : null; E.relato.base = B.relato;
        B.relato.escritas = 0; B.relato.emResumo = 0;
        if (E.base) { B.numero = 0; B.rotulo = ""; this._baseSemDobra(E.base, r, plano); E.bases = [B]; }
      }
      if (O.avanco) {
        /* `opts.avanco === true` = LEIA O MOTOR. É a fonte única: o `r.avanco`
           e o `no.avanco` de cada nó já são o resultado apurado que a tela
           mostra ao lado. Uma segunda apuração aqui divergiria do que o
           cliente viu (memória `conserto-que-para-no-segundo-consumidor`). */
        var A = this._avanco(O.avanco === true ? this._avancoDoMotor(r, E.dpw, E.fer) : O.avanco);
        E.avanco = A.ok ? A : null; E.relato.avanco = A.relato;
        A.relato.escritos = 0; A.relato.emResumo = 0; A.relato.partidas = 0; A.relato.pinos = 0;
      }
      /* ⚠ `ok: false` DE SAÍDA, e ele vira `true` em `_fecharRelato` quando
         alguma data entrou. Ele FALTAVA: a tela lê `x.ok === true` para
         separar "o que foi" de "o que NÃO foi" (`js/cronoexecui.js`,
         `mspRelatoHtml`), e sem a chave as datas fixadas caíam SEMPRE em "o
         que NÃO foi" — inclusive num arquivo que as levava todas. MEDIDO na
         foto da e2e: o quadro dizia "Datas fixadas e prazos-limite: 0
         data(s)…" na lista do que não entrou. */
      if (O.restricoes) E.relato.restricoes = { ok: false, nia: 0, tae: 0, dia: 0, nid: 0, nta: 0, dta: 0, mtp: 0, estouradas: 0, ancoras: 0, deadlines: 0 };
      /* ⚠ O QUE NINGUÉM ABRIU NO MS PROJECT REAL. O assistente de importação
         de MSPDI é um diálogo modal que não se automatiza (memória
         `msproject-assistente-modal`), então nada do que está nesta lista foi
         VISTO dentro do Project — foi lido de volta por um leitor
         independente, que é outra coisa. A tela mostra este texto; recado que
         mente é pior que recado nenhum. */
      E.relato.conferencia = {
        ok: false,
        motivo: "Nada deste arquivo foi aberto no MS Project real — o assistente de importação é modal e não se automatiza. " +
          "O que está provado é a releitura por um leitor independente (tools/test-msproject-releitura.js) e, quando a ponte .mpp roda, " +
          "a conferência das datas dentro do próprio .mpp.",
        pendentes: ["linhas de base 1 a 10 (Baseline1Start e o Number)", "ConstraintType 1 (o mais tarde possível), que por isso NÃO é emitido",
          "restrição em tarefa-resumo", "a opção \"as tarefas sempre respeitam as datas de restrição\""]
      };
      E._destino = O.relato;
      return E;
    },

    /* O AVANÇO DIRETO DO MOTOR (§3.5 da espec: `PercentComplete`,
       `ActualStart`, `StatusDate` = corte, `Stop`/`Resume`, SNET em C).
       Devolve o MESMO contrato do provedor injetado, com três campos a mais.

       ⚠ `Stop`/`Resume` EXISTEM PORQUE A TAREFA EM ANDAMENTO É PARTIDA. O
       motor põe o que já foi feito onde ele foi feito e joga o RESTANTE para
       depois da data de corte (o "C"): entre as duas partes fica um vão de
       dias úteis em que ninguém trabalhou. Sem declarar a partida, o
       `<Duration>` (que é a duração de TRABALHO) não explica o `<Finish>`, e
       quem reler o arquivo — o Project ou o leitor da suíte — recalcula um fim
       mais cedo. Medido no leitor independente: a tarefa fechava no dia do
       `Stop` e as sucessoras andavam junto.
       `Stop` = 17 h do último dia trabalhado da parte feita.
       `Resume` = 8 h do primeiro dia de trabalho DEPOIS do corte. */
    _avancoDoMotor: function (r, dpw, fer) {
      var A = r && r.avanco;
      if (!A || !A.corte) return null;
      var corte = dataDe(A.corte);
      if (!corte) return null;
      var cd = new Date(corte.getTime()); cd.setDate(cd.getDate() + 1);
      var C = avancarUtil(cd, dpw, fer), cIso = ch(C), porNo = {}, n = 0;
      /* ⚠ `r.etapas` E `r.atividades` REPETEM OS IDS DE ETAPA, e a varredura
         passa pelas duas de propósito: só `r.atividades` tem as FOLHAS, que o
         arquivo detalhado precisa. A repetição é inofensiva porque o destino é
         um MAPA por id e o relato conta as chaves dele — MEDIDO: tirar uma
         guarda de duplicata não muda `relato.avanco.nos` nem os contadores de
         partida e de pino. ⚠ Não "otimize" isto para varrer só `atividades`:
         sem a árvore EAP carregada ela não existe, e o avanço sumiria do XML
         por etapa. */
      function poe(no) {
        var a = no && no.avanco;
        if (!a || !no.dataInicio) return;
        if (a.estado === "nao-iniciada" && !a.empurradoDias) return;
        var e = { pct: pctInt(a.pct) };
        if (a.iniReal) e.inicioReal = a.iniReal;
        /* ⚠ `fimReal` SÓ NA CONCLUÍDA. O motor preenche `fimReal` em todo nó
           que já tem posição — na tarefa EM ANDAMENTO ele é o término
           PREVISTO, não o realizado. Emitido como `<ActualFinish>`, ele
           fecharia no Project uma tarefa que está 40% feita, e o Gantt de
           Controle do contratante mostraria a obra pronta. */
        if (a.estado === "concluida" && a.fimReal) e.fimReal = a.fimReal;
        if (a.estado === "andamento" && a.feito > 0 && a.rest > 0) {
          var ini = dataDe(a.iniReal) || no.dataInicio;
          var parou = andarUtil(avancarUtil(ini, dpw, fer), a.feito - 1, dpw, fer);
          // ⚠ só é PARTIDA se o restante recomeça DEPOIS do que já foi feito
          if (parou < C) {
            e.parouEm = ch(parou); e.retomaEm = cIso;
            /* ⚠ E A DURAÇÃO DA TAREFA PARTIDA É O TRABALHO, NÃO O VÃO. O
               `no.duracao` de uma tarefa reprogramada é o VÃO (o que já foi
               feito + os dias parados + o que falta): na sonda, 13 dias para
               uma etapa de 6. No MS Project, partir uma tarefa MANTÉM a
               duração e empurra o fim — a duração é a soma dos pedaços
               trabalhados. Emitir o vão faria o Project calcular 13 dias de
               trabalho, a `ActualDuration` (que ele tira do percentual) sairia
               errada e o pedaço que falta não bateria com o `Resume`. */
            e.diasTrabalho = a.feito + a.rest;
          }
        }
        /* SNET EM C: a tarefa que o corte EMPURROU (não começou, e o motor a
           jogou para depois do corte) não tem elo que explique a posição nova
           — sem o pino ela volta para onde a rede a deixaria, que é antes de
           hoje. É a mesma técnica do serviço e do elo cortado. */
        if (a.estado !== "concluida" && a.empurradoDias > 0 && !e.parouEm) e.pisoEm = cIso;
        porNo[no.id] = e; n++;
      }
      arr(r.etapas).forEach(poe);
      arr(r.extras).forEach(poe);
      arr(r.atividades).forEach(poe);
      return n ? { dataStatus: A.corte, porNo: porNo, doMotor: true } : null;
    },

    // valor de VENDA de um nó (nunca custo direto — ver o bloco acima)
    _valor: function (E, no) {
      if (!E || !E.custos) return null;
      var v = E.valores ? (own(E.valores, no.id) ? E.valores[no.id] : null) : no.valor;
      if (v == null) return null;
      var n = Number(v);
      return isFinite(n) ? n : null;
    },

    /* Os campos de uma tarefa que dependem do enriquecimento, na ORDEM da
       sequência do schema (ver o cabeçalho). `pos` separa os três pontos em
       que eles entram: "durac" (depois de DurationFormat), "estado" (depois de
       Critical) e "restr" (no lugar do ConstraintType). */
    /* `piso` (8º argumento): o instante "não iniciar antes de" que a tarefa
       PRECISA ter porque perdeu um elo para uma etapa opcional omitida (ver o
       ⚠ do cabeçalho). Ele não vem de `opts` — é obrigação do arquivo, não
       enfeite pedido pelo chamador. Aqui ele só existe para não brigar com a
       restrição de data do motor quando as duas caem na mesma tarefa; quem
       escreve o piso sozinho é o emissor da tarefa. */
    _campos: function (L, E, no, uid, resumo, zero, dpwFmt, piso) {
      var self = this;
      /* ⚠ A DECISÃO SOBRE A DATA REAL É TOMADA UMA VEZ, AQUI — antes da nota e
         antes dos campos. Enquanto `estado()` decidia sozinho, a `nota()`
         (que corre ANTES dele) não tinha como dizer o que o arquivo ia deixar
         de fora, e o relato contava o mesmo nó duas vezes. */
      var AV = self._avancoReal(E, no, resumo, zero);
      return {
        trabalho: function () {
          if (!E) return;
          if (E.rec) {
            var T = E.rec.porTarefa[uid];
            if (T && T.horas > 0 && !resumo) L.push('<Work>' + durISO(T.horas) + '</Work>');
          }
          /* ⚠ `<Stop>`/`<Resume>` ENTRAM AQUI, entre `<Work>` e
             `<EffortDriven>`, porque é onde a sequência do schema os põe
             (ver a ORDEM no cabeçalho e em tools/test-msproject-releitura.js).
             Elemento fora de ordem = arquivo recusado pelo Project, e nenhum
             assert de valor pega isso.
             A tarefa em andamento é PARTIDA: o que foi medido fica onde foi
             feito e o restante vai para depois da data de corte. Sem declarar
             a partida, o `<Duration>` (que é duração de TRABALHO) não explica
             o `<Finish>`, e quem reler o arquivo fecha a tarefa no dia do
             `Stop` — medido no leitor independente: as sucessoras andaram
             junto, para trás. */
          var A = (E.avanco && own(E.avanco.porId, no.id)) ? E.avanco.porId[no.id] : null;
          if (A && A.retoma && !resumo) {
            L.push('<Stop>' + dt(A.parou, "17:00:00") + '</Stop>');
            L.push('<Resume>' + dt(A.retoma, "08:00:00") + '</Resume>');
            E.relato.avanco.partidasEscritas = (E.relato.avanco.partidasEscritas || 0) + 1;
          }
          /* ⚠ EffortDriven 0 em TODA tarefa quando há recurso: sem ele, quem
             acrescentar um pedreiro DENTRO do Project encurta a tarefa, e o
             cronograma deixa de bater com o PDF que o cliente recebeu. */
          if (E.rec) L.push('<EffortDriven>0</EffortDriven>');
        },
        estado: function () {
          /* ⚠ NUNCA CUSTO EM TAREFA-RESUMO. MEDIDO no Project (12/09/2026): com
             R$ 100 e R$ 200 nos filhos, o pai mostrou R$ 300 sem ninguém
             escrever lá — o `Cost` é ROLLUP. Escrever no resumo faria a coluna
             somar R$ 600 numa obra de R$ 300, e quem descobre é o cliente na
             calculadora. ⚠ O `<Baseline><Cost>` segue régua DIFERENTE e isso é
             de propósito: o Project NÃO faz rollup dele (medido: os mesmos 100 e
             200 nos filhos deixaram o pai em 0,00), então lá o resumo precisa do
             valor para ter barra cinza — ver `_baseSemDobra`. */
          var v = resumo ? null : self._valor(E, no);
          if (v != null) {
            L.push('<FixedCost>' + dec2(v) + '</FixedCost>');
            E.relato.custo.tarefas++; E.relato.custo.total += v;
          } else if (E.custos && !resumo) E.relato.custo.folhasSemValor++;
          var A = (E && E.avanco && own(E.avanco.porId, no.id)) ? E.avanco.porId[no.id] : null;
          /* ⚠ CONTAR O QUE SAIU, NÃO O QUE FOI PEDIDO. O nó pode ter avanço
             apurado e mesmo assim virar tarefa-RESUMO no arquivo (no detalhe
             "serviço" a subetapa é resumo) — e resumo não leva PercentComplete,
             porque o Project o calcula pelos filhos. Se o relato contasse o
             pedido, a tela diria "2 nós com avanço" num arquivo que não tem
             nenhum: recado que mente é pior que recado nenhum. */
          if (A) { if (resumo) E.relato.avanco.emResumo++; else E.relato.avanco.escritos++; }
          if (A && !resumo) {
            L.push('<PercentComplete>' + A.pct + '</PercentComplete>');
            if (A.pctTrabalho != null) L.push('<PercentWorkComplete>' + A.pctTrabalho + '</PercentWorkComplete>');
          }
          if (v != null) L.push('<Cost>' + dec2(v) + '</Cost>');
          if (AV) {
            if (AV.a) L.push('<ActualStart>' + AV.a + '</ActualStart>');
            if (AV.b) L.push('<ActualFinish>' + AV.b + '</ActualFinish>');
          }
        },
        // devolve true quando escreveu ConstraintType (o chamador não escreve o dele)
        restricao: function () {
          var D = self._restrDe(E, no, piso);
          if (!D) return false;
          var rel = E.relato.restricoes;
          if (own(rel, D.tipo)) rel[D.tipo]++;
          if (no.restricao.estourada) rel.estouradas++;
          if (D.ancora) rel.ancoras++;
          L.push('<ConstraintType>' + D.ct + '</ConstraintType><CalendarUID>1</CalendarUID>' +
            (D.data ? '<ConstraintDate>' + D.data + '</ConstraintDate>' : ''));
          if (D.deadline) { L.push('<Deadline>' + D.deadline + '</Deadline>'); rel.deadlines++; }
          return true;
        },
        valorAgregado: function () {
          var A = (E && E.avanco && own(E.avanco.porId, no.id)) ? E.avanco.porId[no.id] : null;
          if (!A || resumo) return;
          /* o NOSSO avanço é físico (quantidade executada), não de duração: é
             o `PhysicalPercentComplete`, e o EarnedValueMethod 1 manda o
             Project calcular o valor agregado por ele */
          L.push('<PhysicalPercentComplete>' + A.pct + '</PhysicalPercentComplete>');
          L.push('<EarnedValueMethod>1</EarnedValueMethod>');
        },
        /* ⚠ UM `<Baseline>` POR LINHA DE BASE, separados pelo `<Number>` (0 a
           10). A ordem entre eles é a da lista; o Project lê pelo Number, não
           pela posição, e `server/mpp.js` faz o mesmo — até 20/09/2026 ele
           pegava o PRIMEIRO bloco do documento, o que só funcionava enquanto
           existisse um só. */
        linhaBase: function () {
          if (!E || !E.bases) return;
          E.bases.forEach(function (B) {
            if (!own(B.porId, no.id)) return;
            var b = B.porId[no.id], marco = b.dias <= 0;
            if (resumo) E.relato.base.emResumo++; else E.relato.base.escritas++;
            L.push('<Baseline><Number>' + B.numero + '</Number>');
            L.push('<Start>' + dt(b.a, "08:00:00") + '</Start>');
            L.push('<Finish>' + dt(b.b, marco ? "08:00:00" : "17:00:00") + '</Finish>');
            L.push('<Duration>' + durISO(b.dias * H_DIA) + '</Duration><DurationFormat>' + dpwFmt + '</DurationFormat>');
            // ⚠ `custoVai` é decidido em `_baseSemDobra` — ver o comentário de lá:
            //   o custo sai só no nó de base mais fundo do ramo, senão a coluna
            //   soma a etapa e as subetapas dela e dá o dobro da obra.
            if (b.custo != null && b.custoVai) L.push('<Cost>' + dec2(b.custo) + '</Cost>');
            L.push('</Baseline>');
          });
        },
        nota: function (base) {
          if (!E) return base;
          var v = resumo ? null : self._valor(E, no), extra = "";
          if (v != null) extra += " | Valor de VENDA (preco ao cliente): R$ " + fmtBR(v) + " — nao e custo direto";
          var T = (E.rec && E.rec.porTarefa[uid]) || null;
          if (T && T.horas > 0 && !resumo) extra += " | " + (Math.round(T.horas * 10) / 10) + " Hh alocada(s)";
          var A = (E.avanco && own(E.avanco.porId, no.id)) ? E.avanco.porId[no.id] : null;
          if (A && !resumo) {
            extra += " | avanco fisico apurado: " + A.pct + "%";
            /* ⚠ A TAREFA PARTIDA PRECISA DIZER QUE ESTÁ PARTIDA. Sem isto a
               pessoa vê a barra com um vão no meio e acha que o arquivo veio
               errado; o vão é o intervalo em que ninguém trabalhou, entre o
               que foi medido e a data de corte. */
            if (A.retoma) extra += " | tarefa PARTIDA: o feito vai ate " + ch(A.parou) +
              " e o restante recomeca em " + ch(A.retoma) + " (o primeiro dia de trabalho depois da data de corte)";
            else if (A.piso) extra += " | nao comecou ate a data de corte: o inicio foi fixado em " + ch(A.piso) +
              " (nao iniciar antes de), que e onde o OrcaPRO a reprogramou";
          }
          /* ⚠ O QUE O ARQUIVO DEIXOU DE FORA TEM DE SER DITO NA TAREFA, e não
             só no relato: quem abre o .xml no Project não vê o relato. */
          if (AV && (AV.fora || AV.foraFim)) {
            extra += " | ⚠ o realizado apurado NAO entrou como data real neste arquivo (" +
              (AV.fora ? "inicio real " + AV.fora : "") + (AV.fora && AV.foraFim ? ", " : "") +
              (AV.foraFim ? "termino real " + AV.foraFim : "") +
              "): ele nao bate com a data que este cronograma programa, e no Project a data real MANDA — a tarefa e tudo depois dela sairiam do lugar. " +
              "Reprograme o plano no OrcaPRO e exporte de novo.";
          }
          /* ⚠ A NOTA E O ConstraintType SAEM DA MESMA DECISÃO (`_restrDe`).
             Enquanto eram duas contas, a nota falava de "Deadline" em casos em
             que o arquivo emitia outra coisa. */
          var D = self._restrDe(E, no, piso);
          if (D && D.nota) extra += D.nota;
          return base + extra;
        }
      };
    },

    /* =================================================================
       A DATA FIXADA DO NÓ TRADUZIDA UMA VEZ SÓ — para o `<ConstraintType>` e
       para a `<Notes>` dizerem a MESMA coisa. Devolve null (nada a escrever)
       ou {ct, data, deadline, ancora, nota, tipo}.

       A REGRA QUE MANDA AQUI É UMA: **a entrega que o Project calcula tem de
       ser a do PDF**. É a mesma que escolhe o ConstraintType 4 do serviço e a
       omissão da etapa opcional. Dela saem as três decisões abaixo.

       1. A RESTRIÇÃO CUMPRIDA SAI INTEIRA, com o número dela:
            "deve iniciar em"        (dia) -> 2   · "não iniciar depois de" (nid) -> 5
            "não terminar antes de"  (nta) -> 6   · "deve terminar em"      (dta) -> 3
            "terminar até"           (tae) -> 7 + Deadline
            "não iniciar antes de"   (nia) -> 4
          Cumprida, ela está satisfeita EXATAMENTE onde o motor pôs a tarefa —
          então o Project não a move, e o arquivo NÃO DEPENDE da opção "as
          tarefas sempre respeitam as datas de restrição" (§2.4 da espec do
          planejador): ligada ou desligada, a data é a mesma.

       2. A RESTRIÇÃO VIOLADA VIRA ÂNCORA (4) NA DATA DO MOTOR, mais o
          `<Deadline>` quando ela é de TÉRMINO. No OrçaPRO a restrição
          violada só AVISA — ela não encurta a etapa nem empurra as outras
          (js/cronograma.js). No Project, emitida como restrição, ela MANDA: o
          plano seria recalculado contra ela e o contratante veria datas que
          não estão em documento nenhum. A âncora prende a tarefa onde o PDF a
          mostra, e o Deadline é a seta que alerta sem mexer na rede.
          ⚠ O `<Deadline>` do MSPDI é prazo de TÉRMINO. Numa restrição de
          INÍCIO violada ("deve iniciar em", "não iniciar depois de") ele NÃO
          sai: a seta do Project apontaria para o prazo errado, e um cronograma
          que aponta a seta errada é pior que um sem seta. O que a pessoa lê
          nesses dois casos é a nota da tarefa.

       3. "O MAIS TARDE POSSÍVEL" (mtp) NÃO SAI COMO ConstraintType 1. O
          número oficial está no mapa `CT_DE` e é deliberadamente não usado: o
          1 é ALAP, e ALAP num projeto agendado a partir do início reprograma a
          tarefa pelo caminho de volta DO PROJECT, que não é o nosso (o nosso
          já pôs a tarefa no lugar, com a sombra `nia` — O5 da espec). Ninguém
          abriu isso no MS Project real (§6.4-1 da espec: "ConstraintType 1
          (mtp)" é pendência declarada), e o que não se pode provar não vira o
          padrão. Sai a âncora, com a nota dizendo o que era.
       ================================================================= */
    _restrDe: function (E, no, piso) {
      if (!E || !E.restricoes || !no.restricao) return null;
      var R = no.restricao, tipo = String(R.tipo || ""), dpw = E.dpw, fer = E.fer;
      if (!own(CT_DE, tipo)) return null;
      var ancora = no.dataInicio ? dt(no.dataInicio, "08:00:00") : "";
      if (piso && (!ancora || piso > ancora)) ancora = piso;
      function ancorar(motivo) {
        if (!ancora) return null;
        return { tipo: tipo, ct: CT_NIA, data: ancora, deadline: "", ancora: true, nota: motivo };
      }
      // a data digitada corrigida para dia de trabalho (D9 — ver RESTR_RECUA)
      var bruta = dataDe(R.data), corrigida = null;
      if (bruta) corrigida = own(RESTR_RECUA, tipo) ? recuarUtil(bruta, dpw, fer) : bruta;
      var dmaTxt = bruta ? ch(bruta).split("-").reverse().join("/") : "";

      if (tipo === "mtp") {
        return ancorar(" | esta tarefa esta marcada \"o mais tarde possivel\" no OrcaPRO: ela saiu com a data do plano fixada " +
          "(nao iniciar antes de), e NAO como a restricao 1 do Project — a conta de \"mais tarde\" do Project e a do caminho de volta dele, " +
          "que nao e a do OrcaPRO, e ninguem conferiu isso no Project real");
      }
      if (!corrigida) return null;

      if (tipo === "nia") {
        /* ⚠ as duas são PISO: vale a mais tarde. Escrever a do motor por cima
           de um piso maior deixaria a tarefa andar para trás. */
        var d4 = dt(corrigida, "08:00:00");
        if (piso && piso > d4) d4 = piso;
        return { tipo: tipo, ct: CT_NIA, data: d4, deadline: "", ancora: false, nota: "" };
      }

      var ehFim = own(RESTR_FIM, tipo);
      var dFim = dt(corrigida, "17:00:00"), dIni = dt(corrigida, "08:00:00");

      if (R.estourada) {
        var nomes = { dia: "deve iniciar em", nid: "nao iniciar depois de", nta: "nao terminar antes de",
          dta: "deve terminar em", tae: "prazo-limite" };
        var a = ancorar(" | \"" + nomes[tipo] + " " + dmaTxt + "\" NAO e cumprida pelo plano: a tarefa saiu na data do OrcaPRO (ancora) e " +
          (ehFim ? "a data foi so como Deadline (aviso)" : "a data ficou so nesta nota") +
          " — como restricao ela mudaria as datas dentro do Project");
        if (a && ehFim) a.deadline = dFim;
        return a;
      }
      /* ⚠ "TERMINAR ATÉ" (e qualquer teto de término) + ELO CORTADO: o piso
         VENCE o teto. O ConstraintType 7 é teto no FIM — ele não impede a
         tarefa de começar antes, e sem o piso ela voltaria para o começo da
         obra e levaria a rede inteira junto. O prazo-limite continua no
         `<Deadline>`, que alerta e não mexe na rede. */
      if (piso && ehFim) return { tipo: tipo, ct: CT_NIA, data: piso, deadline: dFim, ancora: true, nota: "" };
      /* Restrição de INÍCIO com piso: o piso é um "não iniciar antes de" que o
         motor não conhecia (ele nasce da etapa opcional omitida). Emitir a
         restrição de início por cima dele deixaria a tarefa voltar; vai a
         âncora, que já é o maior dos dois. */
      if (piso && !ehFim) return ancorar("");

      if (tipo === "dia") {
        /* "deve iniciar em", cumprida: o motor JÁ pôs a tarefa nesse dia (a
           data é piso e teto de início ao mesmo tempo). Sai a posição do
           motor, que é a data corrigida para dia de trabalho. */
        return { tipo: tipo, ct: CT_DIA, data: no.dataInicio ? dt(no.dataInicio, "08:00:00") : dIni, deadline: "", ancora: false, nota: "" };
      }
      if (tipo === "nid") return { tipo: tipo, ct: CT_NID, data: dIni, deadline: "", ancora: false, nota: "" };
      if (tipo === "nta") return { tipo: tipo, ct: CT_NTA, data: dFim, deadline: "", ancora: false, nota: "" };
      if (tipo === "dta") {
        /* "deve terminar em", cumprida: o fim do motor É a data. Sai o ÚLTIMO
           DIA TRABALHADO dele, às 17 h — o `dataFim` do motor é o dia em que a
           etapa já não ocupa ninguém (ver `ultimoDiaUtil`). */
        var uD = no.dataFim ? ultimoDiaUtil(no.dataFim, dpw, fer) : corrigida;
        return { tipo: tipo, ct: CT_DTA, data: dt(uD, "17:00:00"), deadline: "", ancora: false, nota: "" };
      }
      // tae cumprida: o teto sai inteiro, com a seta de prazo ao lado
      return { tipo: tipo, ct: CT_TAE, data: dFim, deadline: dFim, ancora: false, nota: "" };
    },

    /* =================================================================
       AS TAREFAS SEM PREÇO ("T1", "T2"…) NO ARQUIVO DO CLIENTE.

       ⚠ ELAS SAEM SEM `opts` NENHUM, como a etapa opcional omitida e pelo
       MESMO motivo: NÃO SÃO ENFEITE, SÃO A REDE. Uma tarefa sem preço
       ("aprovação do projeto pelo cliente", 10 dias) segura a etapa que vem
       depois dela — o motor já empurrou a etapa, o PDF já mostra a data
       empurrada, e um XML sem a tarefa T deixaria o Project puxar a etapa 10
       dias para trás. O arquivo mostraria uma entrega que não existe em
       documento nenhum. Nenhum orçamento anterior ao planejador tem tarefa
       sem preço, então isto não muda um byte de documento antigo
       (tools/test-crono-documentos.js).

       ⚠ ELAS NÃO LEVAM DINHEIRO. É o que o nome diz: não têm preço, não estão
       no "Valor total" e não podem aparecer com `<FixedCost>` — a coluna de
       custo do Project somaria um valor que a proposta não cobra.

       UID: depois de todas as tarefas que já estavam no arquivo (etapas, e as
       subetapas/serviços quando há detalhe). Renumerar as outras para abrir
       espaço mudaria o `<PredecessorUID>` de quem já estava lá.
       ================================================================= */
    _extrasDe: function (r, baseUid) {
      var lista = [], uid = {};
      arr(r && r.extras).forEach(function (x) {
        if (!x || !x.id || !x.dataInicio || !x.dataFim) return;
        lista.push(x);
      });
      lista.forEach(function (x, k) { uid[x.id] = baseUid + 1 + k; });
      return { lista: lista, uid: uid, tem: lista.length > 0,
        conta: { escritas: 0, doContratante: 0, depoisDaEntrega: 0 } };
    },
    /* Os elos que ENTRAM numa etapa vindos de tarefa sem preço. O motor os
       guarda em `et.porExtras` (e NÃO em `et.preds`, que por contrato só tem
       id de etapa — I3 da espec). Sem esta lista, a etapa segurada pela T1
       sairia sem nenhum elo que explique a data dela. */
    _linksExtras: function (no, X) {
      var out = [];
      arr(no && no.porExtras).forEach(function (q) {
        if (!q || !X.uid[q.id]) return;
        out.push({ uid: X.uid[q.id], tipo: tipoElo(q.tipo || "TI"), dias: q.lag != null ? Number(q.lag) : 0 });
      });
      return out;
    },
    RESP_T: { cliente: "a cargo do CONTRATANTE", construtora: "a cargo da construtora", terceiro: "a cargo de um terceiro" },
    _tarefasExtras: function (L, X, uidTudo, r, dpw, mapaFer, E, idIni, nivel, outIni, FORA) {
      var self = this;
      FORA = FORA || { ids: {}, etapas: [] };
      X.lista.forEach(function (xt, k) {
        var marco = !!xt.marco || !xt.duracao;
        var fim = marco ? xt.dataInicio : ultimoDiaUtil(xt.dataFim, dpw, mapaFer);
        var horas = Math.round((xt.duracao || 0) * 8);
        var num = xt.numero || ("T" + (k + 1));
        var nome = num + " " + (xt.nome || "Tarefa sem preco");
        var nota = "TAREFA SEM PRECO — " + (self.RESP_T[xt.resp] || self.RESP_T.construtora) +
          " | ela NAO tem custo no orcamento e NAO entra no \"Valor total\": entra no PRAZO" +
          (xt.critico ? " | CAMINHO CRITICO (sem folga)" : " | folga: " + (xt.folga || 0) + " dia(s)") +
          (xt.depoisDaEntrega ? " | ATENCAO: termina DEPOIS da entrega das etapas contratadas" : "") +
          (xt.cicloDep ? " | ATENCAO: dependencia circular — o OrcaPRO ignorou um elo de volta para conseguir programar" : "");
        /* ⚠ SEM `_campos` AQUI, DE PROPÓSITO: a tarefa sem preço não leva
           dinheiro, recurso, linha de base nem avanço — só a data. Passar por
           `_campos` abriria a porta para um `<FixedCost>` nela. */
        var pisoT = null;
        if (xt.restricao && xt.restricao.tipo === "nia" && xt.dataInicio) {
          /* "não iniciar antes de" digitado na tarefa sem preço: sai a posição
             do MOTOR (que já inclui o piso), porque é ela que o PDF mostra. */
          pisoT = dt(xt.dataInicio, "08:00:00");
          nota += " | inicio fixado (nao iniciar antes de) em " + ch(xt.dataInicio);
        }
        /* ⚠ ELO DA TAREFA T PARA UMA ETAPA OPCIONAL OMITIDA: o mesmo caso das
           etapas (ver o ⚠ do cabeçalho). O elo some — ele apontaria para um
           UID que não está no arquivo, e o Project recusa a rede inteira — e a
           data do motor vira "não iniciar antes de". Sem o pino, a T voltaria
           para o começo da obra levando a etapa que ela segura junto. */
        var cortT = [];
        arr(xt.preds).forEach(function (pid) { if (FORA.ids[pid]) cortT.push(pid); });
        if (cortT.length && xt.dataInicio) {
          var pc = dt(xt.dataInicio, "08:00:00");
          if (!pisoT || pc > pisoT) pisoT = pc;
          nota += self._notaCortada(cortT, FORA);
        }
        L.push('<Task>');
        L.push('<UID>' + X.uid[xt.id] + '</UID><ID>' + (idIni + k) + '</ID>');
        L.push('<Name>' + x(nomeCurto(nome)) + '</Name>');
        L.push('<Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull>');
        L.push('<WBS>' + x(num) + '</WBS>' +
          (outIni ? '<OutlineNumber>' + (outIni + k) + '</OutlineNumber>' : '') + '<OutlineLevel>' + nivel + '</OutlineLevel>');
        L.push('<Start>' + dt(xt.dataInicio, "08:00:00") + '</Start>');
        L.push('<Finish>' + dt(fim, marco ? "08:00:00" : "17:00:00") + '</Finish>');
        L.push('<Duration>PT' + horas + 'H0M0S</Duration><DurationFormat>7</DurationFormat>');
        L.push('<Milestone>' + (marco ? 1 : 0) + '</Milestone><Summary>0</Summary><Critical>' + (xt.critico ? 1 : 0) + '</Critical>');
        L.push('<ConstraintType>' + (pisoT ? CT_NIA : CT_ASAP) + '</ConstraintType><CalendarUID>1</CalendarUID>' +
          (pisoT ? '<ConstraintDate>' + pisoT + '</ConstraintDate>' : ''));
        L.push('<Notes>' + x(nota) + '</Notes>');
        arr(xt.preds).forEach(function (pid) {
          // o elo de uma T pode vir de uma ETAPA ou de outra T
          var up = FORA.ids[pid] ? null : (uidTudo[pid] || X.uid[pid]);
          if (!up) return;                // ⚠ elo pendurado: o Project recusa a rede inteira
          var q = eloDeExtra(xt, pid);
          L.push('<PredecessorLink><PredecessorUID>' + up + '</PredecessorUID>' +
            '<Type>' + q.tipo + '</Type><CrossProject>0</CrossProject>' +
            '<LinkLag>' + Math.round(q.dias * DEC_POR_DIA) + '</LinkLag><LagFormat>7</LagFormat></PredecessorLink>');
        });
        L.push('</Task>');
        X.conta.escritas++;
        if (xt.resp === "cliente") X.conta.doContratante++;
        if (xt.depoisDaEntrega) X.conta.depoisDaEntrega++;
      });
    },

    /* AS DATAS REAIS QUE CABEM NO ARQUIVO. Devolve null, ou
       {a, b, fora, foraFim} com os instantes prontos.

       ⚠ DATA REAL QUE NÃO BATE COM A DATA DO PLANO NÃO SAI — E O ARQUIVO DIZ
       QUE NÃO SAIU. Descoberto em 20/09/2026 pelo leitor independente, que
       passou a modelar o `ActualStart` como o MS Project o modela: ele MANDA.
       Uma tarefa que o arquivo declara começando em 16/09 com
       `<ActualStart>2026-09-21` abre no Project em 21/09, e tudo que vem
       depois dela anda junto — o contratante lê um cronograma que não é o do
       PDF, e nenhuma mensagem aparece. MEDIDO na fixture desta suíte: uma
       subetapa com início real 5 dias à frente do plano empurrou a etapa
       inteira, e o fim dela passou de 06/10 para 09/10.

       Quando o avanço vem do MOTOR (`opts.avanco === true`) isto nunca
       dispara: lá o nó JÁ está reprogramado na data real, e as duas batem. O
       caso que dispara é o mapa injetado por um chamador que apurou o
       realizado sem reprogramar o plano — e aí o certo é reprogramar, não
       entregar duas verdades no mesmo arquivo. */
    _avancoReal: function (E, no, resumo, zero) {
      if (!E || !E.avanco || resumo || !own(E.avanco.porId, no.id)) return null;
      var A = E.avanco.porId[no.id], out = { a: null, b: null, fora: null, foraFim: null };
      var iniPlano = no.dataInicio ? dt(no.dataInicio, "08:00:00") : null;
      var fimPlano = no.dataFim ? dt(zero ? no.dataInicio : ultimoDiaUtil(no.dataFim, E.dpw, E.fer), zero ? "08:00:00" : "17:00:00") : null;
      if (A.a) {
        var iA = dt(A.a, "08:00:00");
        if (!iniPlano || iA === iniPlano) out.a = iA;
        else { out.fora = ch(A.a); E.relato.avanco.foraDoPlano = (E.relato.avanco.foraDoPlano || 0) + 1; }
      }
      if (A.b) {
        var fA = dt(A.b, zero ? "08:00:00" : "17:00:00");
        if (!fimPlano || fA === fimPlano) out.b = fA;
        else { out.foraFim = ch(A.b); E.relato.avanco.foraDoPlano = (E.relato.avanco.foraDoPlano || 0) + 1; }
      }
      return out;
    },

    /* A DURAÇÃO que vai no `<Duration>`: a do motor, ou — na tarefa PARTIDA
       pelo avanço — a soma dos pedaços trabalhados (ver `_avancoDoMotor`). */
    _diasDaTarefa: function (E, no, resumo) {
      var d = Number(no.duracao) || 0;
      if (!E || !E.avanco || resumo || !own(E.avanco.porId, no.id)) return d;
      var A = E.avanco.porId[no.id];
      return (A.retoma && A.dias != null) ? A.dias : d;
    },

    /* O PINO DO AVANÇO (SNET em C). A tarefa que a data de corte EMPURROU não
       começou e não tem elo que explique a posição nova: o motor a jogou para
       depois do corte porque ninguém trabalhou nela, e a rede sozinha a
       devolveria para uma data JÁ PASSADA. O pino é a mesma técnica do serviço
       e do elo cortado, pelo mesmo motivo — a entrega do Project tem de ser a
       do PDF. Devolve o instante ou null. */
    _pisoAvanco: function (E, no, resumo) {
      if (!E || !E.avanco || resumo || !own(E.avanco.porId, no.id)) return null;
      var A = E.avanco.porId[no.id];
      if (!A.piso) return null;
      E.relato.avanco.pinosEscritos = (E.relato.avanco.pinosEscritos || 0) + 1;
      return dt(A.piso, "08:00:00");
    },

    // o pedaço de nota da tarefa que perdeu elo para uma etapa omitida
    _notaCortada: function (ids, FORA) {
      var nomes = [];
      (ids || []).forEach(function (pid) {
        FORA.etapas.forEach(function (o) { if (o.id === pid) nomes.push(o.numero + " " + o.nome); });
      });
      if (!nomes.length) nomes.push("uma etapa opcional");
      return " | a predecessora " + nomes.join(" e ") + " e OPCIONAL e nao entra no prazo contratado: ela NAO esta neste arquivo, " +
        "e o inicio desta tarefa ficou fixado na data do OrcaPRO (nao iniciar antes de) — sem isso o Project a puxaria para o comeco da obra";
    },

    // tarefas do XML hierárquico (a partir do plano de `detalhar`)
    _tarefasHier: function (L, plano, r, dpw, mapaFer, E, FORA, X) {
      var self = this, rede = !!(r.exec && r.exec.rede), nivel1 = 0;
      X = X || { tem: false, lista: [], uid: {} };
      var uidEt = {};
      r.etapas.forEach(function (e, i) { uidEt[e.id] = i + 1; });
      plano.linhas.forEach(function (l) {
        if (l.nivel === 1) nivel1++;
        var no = l.no, serv = no.tipo === "servico", fl = no.tipo === "subetapa" || no.tipo === "soltos";
        var horas = Math.round(self._diasDaTarefa(E, no, !!l.resumo) * 8), nome, nota;
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
        /* ⚠ PISO da tarefa que perdeu elo para uma etapa opcional omitida. Ele
           é escrito COM OU SEM `opts` — é a data do PDF, não enfeite. Numa
           tarefa-resumo o piso vai no próprio resumo: no Project (e no leitor
           do teste) a restrição do pai vale para os filhos, e pinar o pai
           basta para o bloco inteiro ficar no lugar. */
        var piso = l.cortouFora ? dt(no.dataInicio, "08:00:00") : null;
        if (piso) nota += self._notaCortada(l.cortouFora, FORA);
        // ⚠ dois pisos na mesma tarefa: vale o mais TARDE (piso é sempre "não
        //   desce daqui"; o menor deles não segura nada)
        var pAv = self._pisoAvanco(E, no, !!l.resumo);
        if (pAv && (!piso || pAv > piso)) piso = pAv;
        // ⚠ os campos novos entram pelos três pontos que a sequência do schema
        //   permite; com E null nenhum deles escreve nada (XML de sempre)
        var C = E ? self._campos(L, E, no, l.uid, !!l.resumo, zero, 7, piso) : null;
        if (C) nota = C.nota(nota);
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
        if (C) C.trabalho();
        L.push('<Milestone>' + (zero ? 1 : 0) + '</Milestone><Summary>' + (l.resumo ? 1 : 0) + '</Summary><Critical>' + (no.critico ? 1 : 0) + '</Critical>');
        if (C) C.estado();
        /* ⚠ SERVIÇO COM "NÃO INICIAR ANTES DE" (ConstraintType 4) na data do
           motor. Serviço não tem elo (é a distribuição do prazo da subetapa pelo
           esforço). Com o "o quanto antes" (0), o Project põe todos no início
           da subetapa, a subetapa-resumo encolhe para o maior serviço, as
           sucessoras andam para trás e a entrega sai MAIS CEDO que a do PDF. */
        if (serv) L.push('<ConstraintType>4</ConstraintType><CalendarUID>1</CalendarUID><ConstraintDate>' + dt(no.dataInicio, "08:00:00") + '</ConstraintDate>');
        else if (C && C.restricao()) { /* o ConstraintType saiu com a data fixada (o piso já entrou nela) */ }
        else if (piso) L.push('<ConstraintType>' + CT_NIA + '</ConstraintType><CalendarUID>1</CalendarUID><ConstraintDate>' + piso + '</ConstraintDate>');
        else L.push('<ConstraintType>0</ConstraintType><CalendarUID>1</CalendarUID>');
        L.push('<Notes>' + x(nota) + '</Notes>');
        if (C) C.valorAgregado();
        // a tarefa sem preço segura a ETAPA (nível 1); ela não está em `preds`
        var lks = l.nivel === 1 ? l.links.concat(self._linksExtras(no, X)) : l.links;
        lks.forEach(function (k) {
          // Type: os quatro do formato, pelo TIPO_ELO — ver `eloDe`
          L.push('<PredecessorLink><PredecessorUID>' + k.uid + '</PredecessorUID>' +
            '<Type>' + k.tipo + '</Type><CrossProject>0</CrossProject>' +
            '<LinkLag>' + Math.round(k.dias * DEC_POR_DIA) + '</LinkLag><LagFormat>7</LagFormat></PredecessorLink>');
        });
        if (C) C.linhaBase();
        L.push('</Task>');
      });
      /* As tarefas sem preço fecham o arquivo, no nível 1, com o número de
         estrutura logo depois da última etapa. */
      if (X.tem) this._tarefasExtras(L, X, uidEt, r, dpw, mapaFer, E, plano.linhas.length + 1, 1, nivel1 + 1, FORA);
    },

    /* Os blocos <Resources> e <Assignments> — DEPOIS de </Tasks>, que é onde a
       sequência do schema os põe. Só existem com provedor de recursos. */
    _blocosRecursos: function (L, E) {
      if (!E || !E.rec) return;
      L.push('<Resources>');
      E.rec.recursos.forEach(function (R) {
        L.push('<Resource>');
        L.push('<UID>' + R.uid + '</UID><ID>' + R.uid + '</ID>');
        L.push('<Name>' + x(R.nome) + '</Name>');
        /* ⚠ Type 1 = TRABALHO no MSPDI (0 é material). No modelo de objetos do
           Project, por COM, é o CONTRÁRIO: lá o recurso novo nasce 0 e 0 é
           trabalho — pôr 1 lá o transforma em material e o custo despenca sem
           erro nenhum (medido em 11/09/2026). Dois números, duas réguas. */
        L.push('<Type>1</Type><IsNull>0</IsNull>');
        L.push('<Initials>' + x(R.nome.slice(0, 3)) + '</Initials>');
        L.push('<Group>Mao de obra</Group>');
        // pico simultâneo do próprio cronograma: abaixo disso o Project pinta
        // superalocação num plano que ninguém disse ser impossível
        L.push('<MaxUnits>' + dec6(R.pico) + '</MaxUnits>');
        /* ⚠ TAXA ZERADA DE PROPÓSITO. O dinheiro deste arquivo é o PREÇO DE
           VENDA da tarefa, escrito uma vez em <FixedCost>. Uma taxa aqui
           somaria um SEGUNDO dinheiro (custo de equipe) ao mesmo serviço, e o
           total do Project deixaria de ser o total da proposta — que é o número
           que o cliente confere na calculadora. */
        L.push('<StandardRate>0</StandardRate><StandardRateFormat>2</StandardRateFormat>');
        L.push('<CalendarUID>1</CalendarUID>');
        L.push('<Notes>' + x("Profissao do histograma de mao de obra. Taxa zerada de proposito: o dinheiro deste arquivo e o preco de VENDA da tarefa (custo fixo); uma taxa aqui somaria um segundo valor ao mesmo servico.") + '</Notes>');
        L.push('</Resource>');
      });
      L.push('</Resources>');
      L.push('<Assignments>');
      E.rec.alocacoes.forEach(function (A) {
        L.push('<Assignment>');
        L.push('<UID>' + A.uid + '</UID><TaskUID>' + A.tarefaUID + '</TaskUID><ResourceUID>' + A.recursoUID + '</ResourceUID>');
        // ⚠ Finish ANTES de Start: é a ordem da sequência oficial da Assignment
        L.push('<Finish>' + dt(diaDe(A.b), manha(A.b) ? "08:00:00" : "17:00:00") + '</Finish>');
        L.push('<Start>' + dt(diaDe(A.a), "08:00:00") + '</Start>');
        L.push('<Units>' + dec6(A.units) + '</Units>');
        L.push('<Work>' + durISO(A.horas) + '</Work>');
        L.push('</Assignment>');
      });
      L.push('</Assignments>');
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
      /* ⚠ O UID CONTINUA SENDO O ÍNDICE DA ETAPA, com buraco no lugar da
         omitida. Renumerar para "fechar o buraco" faria o UID de uma etapa
         mudar conforme o cliente comprasse ou não um opcional — e é por UID
         que o `<PredecessorUID>` liga a rede. O `<ID>`, esse sim, é a LINHA da
         planilha e tem de ser 1..n sem furo. */
      var FORA = forasDe(r);
      /* AS TAREFAS SEM PREÇO entram DEPOIS de tudo que já existia, e os UIDs
         delas começam onde os de lá terminam (ver `_extrasDe`). No caminho
         hierárquico o teto é o maior UID de folha/serviço; no caminho por
         etapa, o número de etapas. */
      var X = MSProject._extrasDe(r, (plano && plano.ok && plano.proxUid) ? plano.proxUid : r.etapas.length);
      // ⚠ null sem opção nenhuma — é o que devolve o arquivo de sempre, byte a byte
      var E = MSProject._enriquecer(r, plano && plano.ok ? plano : null, opts);

      var L = [];
      L.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
      L.push('<Project xmlns="http://schemas.microsoft.com/project">');
      L.push('<Name>' + x(MSProject.nomeArquivo(orc)) + '</Name>');
      L.push('<Title>' + x((orc && orc.nome) || "Cronograma da obra") + '</Title>');
      /* ⚠ SÓ QUANDO HÁ ETAPA FORA DO PRAZO. É o único campo de texto livre que
         a sequência do MSPDI dá ao elemento Project — e ele só aparece quando
         há o que declarar, senão o arquivo de sempre mudaria de byte (ver o ⚠
         do cabeçalho e tools/test-crono-documentos.js). */
      if (FORA.tem) L.push('<Subject>' + x(fraseFora(FORA, r.etapas.length)) + '</Subject>');
      L.push('<Company>' + x((typeof Empresa !== "undefined" && Empresa.nomeDoc) ? Empresa.nomeDoc() : "") + '</Company>');
      L.push('<ScheduleFromStart>1</ScheduleFromStart>');
      L.push('<StartDate>' + dt(r.dataInicio, "08:00:00") + '</StartDate>');
      /* ⚠ MOEDA DECLARADA. Sem estes quatro, o Project imprime o orçamento em
         CIFRÃO DE DÓLAR mesmo numa instalação em PT-BR (medido em 11/09/2026:
         o projeto novo nasce sem moeda definida e uma taxa de 700 voltou como
         "$700.00"). Num arquivo que vai para construtora e órgão público, isso
         é o detalhe que faz o documento parecer de amador.
         CurrencySymbolPosition 0 = antes, sem espaço (R$1.234,56). */
      if (E && E.custos) {
        L.push('<CurrencyDigits>2</CurrencyDigits>');
        L.push('<CurrencySymbol>R$</CurrencySymbol>');
        L.push('<CurrencyCode>BRL</CurrencyCode>');
        L.push('<CurrencySymbolPosition>0</CurrencySymbolPosition>');
      }
      L.push('<CalendarUID>1</CalendarUID>');
      L.push('<DefaultStartTime>08:00:00</DefaultStartTime>');
      L.push('<DefaultFinishTime>17:00:00</DefaultFinishTime>');
      L.push('<MinutesPerDay>' + MIN_DIA + '</MinutesPerDay>');
      L.push('<MinutesPerWeek>' + (MIN_DIA * dpw) + '</MinutesPerWeek>');
      L.push('<DaysPerMonth>' + (dpw * 4) + '</DaysPerMonth>');
      L.push('<DurationFormat>7</DurationFormat>');   // 7 = dias
      L.push('<WorkFormat>2</WorkFormat>');
      if (E && E.base) L.push('<BaselineForEarnedValue>0</BaselineForEarnedValue>');   // a base 0 é a nossa
      /* ⚠ SEM StatusDate O PROJECT NÃO DESENHA A LINHA DE ANDAMENTO. O avanço
         fica dentro das barras e o gráfico que o contratante olha na reunião
         de medição simplesmente não existe lá dentro. */
      if (E && E.avanco && E.avanco.dataStatus) {
        L.push('<StatusDate>' + dt(E.avanco.dataStatus, "17:00:00") + '</StatusDate>');
        L.push('<CurrentDate>' + dt(E.avanco.dataStatus, "17:00:00") + '</CurrentDate>');
      }
      // 1 = % físico concluído: é a régua do NOSSO avanço (quantidade executada)
      if (E && E.avanco) L.push('<DefaultTaskEVMethod>1</DefaultTaskEVMethod>');

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
      if (plano && plano.ok) MSProject._tarefasHier(L, plano, r, dpw, mapaFer, E, FORA, X);
      else { var idSeq = 0; r.etapas.forEach(function (e, i) {
        // ⚠ etapa opcional fora do prazo contratado não vira tarefa — ver o ⚠
        //   do cabeçalho. Sem isto ela saía como marco mudo no Gantt do cliente.
        if (FORA.ids[e.id]) return;
        idSeq++;
        var marco = !!e.marco || !e.duracao;
        var horas = Math.round(MSProject._diasDaTarefa(E, e, false) * 8);
        var fim = marco ? e.dataInicio : ultimoDiaUtil(e.dataFim, dpw, mapaFer);
        var cortou = [];
        (e.preds || []).forEach(function (pid) { if (FORA.ids[pid]) cortou.push(pid); });
        var piso = cortou.length ? dt(e.dataInicio, "08:00:00") : null;
        var pisoAv = MSProject._pisoAvanco(E, e, false);
        if (pisoAv && (!piso || pisoAv > piso)) piso = pisoAv;
        var nota = "Frente: " + (e.categoriaNome || e.categoria || "—") +
          (e.critico ? " | CAMINHO CRITICO (sem folga)" : " | folga: " + (e.folga || 0) + " dia(s)") +
          (e.editado ? " | duracao informada pela equipe" : "") +
          // ⚠ `cortou.length`, nunca `piso`: desde o pino do avanço o `piso`
          //   pode existir sem elo cortado nenhum, e a nota acusaria uma
          //   predecessora opcional que não existe
          (cortou.length ? MSProject._notaCortada(cortou, FORA) : "");
        /* ⚠ SEM RECURSO NESTE CAMINHO: o provedor responde por SERVIÇO, e aqui
           a tarefa é a etapa inteira. O `relato.recursos.motivo` diz isso; o
           bloco não sai vazio nem com equipe inventada. */
        var C = E ? MSProject._campos(L, E, e, uid[e.id], false, marco, 7, piso) : null;
        if (C) nota = C.nota(nota);
        L.push('<Task>');
        L.push('<UID>' + uid[e.id] + '</UID><ID>' + idSeq + '</ID>');
        L.push('<Name>' + x(((e.codigo ? e.codigo + " " : "") + (e.nome || "Etapa " + (i + 1))).trim()) + '</Name>');
        L.push('<Active>1</Active><Manual>0</Manual><Type>1</Type><IsNull>0</IsNull>');
        L.push('<OutlineLevel>1</OutlineLevel><WBS>' + (i + 1) + '</WBS>');
        L.push('<Start>' + dt(e.dataInicio, "08:00:00") + '</Start>');
        L.push('<Finish>' + dt(fim, marco ? "08:00:00" : "17:00:00") + '</Finish>');
        L.push('<Duration>PT' + horas + 'H0M0S</Duration><DurationFormat>7</DurationFormat>');
        /* ⚠ `trabalho()` TAMBÉM NESTE CAMINHO, e não é o bloco de recursos: é
           aqui que a sequência do schema põe `<Stop>`/`<Resume>` (a tarefa
           PARTIDA pelo avanço). Neste caminho `E.rec` é sempre nulo — o
           provedor de hora-homem responde por SERVIÇO e aqui a tarefa é a
           etapa inteira —, então sem avanço ele não escreve nada e o arquivo
           continua byte a byte o de sempre. */
        if (C) C.trabalho();
        L.push('<Milestone>' + (marco ? 1 : 0) + '</Milestone>');
        /* ⚠ ORDEM HERDADA DO MASTER, NÃO MEXIDA AQUI: neste caminho o
           `<Critical>` sai DEPOIS de `<CalendarUID>`, e a sequência oficial o
           quer logo depois do `<Milestone>`. Mover uma linha muda o documento
           byte a byte, e `tools/test-crono-documentos.js` compara com a cópia
           do master b8907ef — a troca é um passo à parte, com a fixture do
           master regravada junto. O caminho hierárquico já sai na ordem certa.
           `tools/test-msproject-releitura.js` conta essa divergência
           NOMINALMENTE: divergência nova reprova; esta, conhecida, não.
           ⚠ Por isso o dinheiro/avanço entra AQUI, antes do ConstraintType: é
           o lugar da sequência oficial, e assim o `Critical` continua sendo a
           ÚNICA linha fora de ordem deste caminho. */
        if (C) C.estado();
        if (C && C.restricao()) { /* o ConstraintType saiu com a data fixada (o piso já entrou nela) */ }
        else if (piso) { L.push('<ConstraintType>' + CT_NIA + '</ConstraintType>'); L.push('<CalendarUID>1</CalendarUID><ConstraintDate>' + piso + '</ConstraintDate>'); }
        else { L.push('<ConstraintType>0</ConstraintType>'); L.push('<CalendarUID>1</CalendarUID>'); }
        L.push('<Critical>' + (e.critico ? 1 : 0) + '</Critical>');
        L.push('<Notes>' + x(nota) + '</Notes>');
        if (C) C.valorAgregado();
        var linksEt = [];
        (e.preds || []).forEach(function (pid) {
          if (FORA.ids[pid] || !uid[pid]) return;   // ⚠ elo pendurado: o Project recusa a rede
          var q = eloDe(e, pid);
          linksEt.push({ uid: uid[pid], tipo: q.tipo, dias: q.dias });
        });
        // a tarefa sem preço que segura esta etapa (ela NÃO está em `e.preds`)
        MSProject._linksExtras(e, X).forEach(function (q) { linksEt.push(q); });
        linksEt.forEach(function (q) {
          L.push('<PredecessorLink><PredecessorUID>' + q.uid + '</PredecessorUID>' +
            '<Type>' + q.tipo + '</Type><CrossProject>0</CrossProject>' +
            '<LinkLag>' + Math.round(q.dias * DEC_POR_DIA) + '</LinkLag><LagFormat>7</LagFormat></PredecessorLink>');
        });
        if (C) C.linhaBase();
        L.push('</Task>');
      });
      /* ⚠ sem `<OutlineNumber>` aqui: neste caminho as ETAPAS também não o
         têm, e uma tarefa com número de estrutura no meio de tarefas sem
         número faria outro leitor MSPDI montar meia árvore. */
      if (X.tem) MSProject._tarefasExtras(L, X, uid, r, dpw, mapaFer, E, idSeq + 1, 1, 0, FORA);
      }
      L.push('</Tasks>');
      MSProject._blocosRecursos(L, E);
      L.push('</Project>');
      if (E) MSProject._fecharRelato(E, r, plano, FORA);
      /* ⚠ O RELATO DAS OPCIONAIS SAI SEMPRE QUE O CHAMADOR PEDIR RELATO — não
         depende de `opts.custos`/`opts.recursos`/etc. A tela precisa saber o
         que NÃO está no arquivo para não prometer um cronograma completo; e
         precisa saber também quando não há nada a declarar, senão o silêncio
         vira "está tudo lá". */
      if (opts && opts.relato && typeof opts.relato === "object") {
        /* ⚠ o relato das TAREFAS T também não depende de opção nenhuma, pelo
           mesmo motivo: elas entram sem `opts`, e a tela precisa dizer o que
           está no arquivo. */
        var xc = X.conta;
        opts.relato.extras = { ok: xc.escritas > 0, escritas: xc.escritas, doContratante: xc.doContratante,
          depoisDaEntrega: xc.depoisDaEntrega,
          motivo: xc.escritas
            ? xc.escritas + " tarefa(s) sem preco no arquivo (" + xc.doContratante + " a cargo do contratante" +
              (xc.depoisDaEntrega ? ", " + xc.depoisDaEntrega + " terminando depois da entrega das etapas" : "") +
              "). Elas entram no PRAZO e nao no dinheiro: nenhuma leva custo."
            : "nenhuma tarefa sem preco neste cronograma." };
        opts.relato.opcionais = FORA.tem
          ? { fora: FORA.etapas.length, etapas: FORA.etapas, texto: fraseFora(FORA, r.etapas.length),
              motivo: FORA.etapas.length + " etapa(s) opcional(is) NAO foi/foram para o arquivo, porque o prazo e o valor deste cronograma sao os do escopo contratado. " +
                "O arquivo declara quais no campo Assunto (Subject) do projeto. Para ve-las no Project, ligue \"opcionais dentro do prazo\" no cronograma." }
          : { fora: 0, etapas: [], texto: "", motivo: "nenhuma etapa opcional fora do prazo — o arquivo tem o cronograma inteiro." };
      }
      return L.join("\n");
    },

    /* O RELATO — o que entrou no arquivo e o que ficou de fora, para a tela não
       prometer o que o XML não tem. Não muda um byte do XML.
       ⚠ O DINHEIRO SE CONFERE, NÃO SE AFIRMA: aqui se soma o que foi escrito e
       se compara com o total das etapas. Diferença ≠ 0 sai em `residuo` com o
       número — é o serviço que não virou tarefa (quantidade zerada, parte
       recolhida) levando o valor dele embora. Recado que mente é pior que
       recado nenhum: o arquivo não pode sair dizendo que é o total da proposta
       quando não é. */
    _fecharRelato: function (E, r, plano, FORA) {
      if (E.relato.custo) {
        var c = E.relato.custo, tot = 0, v;
        (r.atividades || []).forEach(function (n) {
          if (n.tipo !== "etapa") return;
          v = MSProject._valor(E, n);
          if (v == null) c.semValor++; else tot += v;
        });
        if (!r.atividades) {
          r.etapas.forEach(function (e) { v = MSProject._valor(E, e); if (v == null) c.semValor++; else tot += v; });
        }
        c.total = Math.round(c.total * 100) / 100;
        c.totalEtapas = Math.round(tot * 100) / 100;
        c.residuo = Math.round((c.totalEtapas - c.total) * 100) / 100;
        c.ok = c.tarefas > 0;
        c.motivo = !c.tarefas
          ? "nenhuma tarefa recebeu valor de venda (passe ctx.valores ao Cronograma.estimar, ou opts.custos.porId) — o arquivo saiu sem dinheiro, em vez de sair com custo direto."
          : c.tarefas + " tarefa(s) com preco de VENDA, total R$ " + fmtBR(c.total) +
            (c.residuo ? " — ⚠ R$ " + fmtBR(c.residuo) + " do total das etapas (R$ " + fmtBR(c.totalEtapas) +
              ") NAO esta no arquivo: e o que ficou fora do cronograma (servico sem quantidade, parte recolhida" +
              /* ⚠ o residuo de uma etapa opcional NÃO é buraco: é o preço que o
                 "Valor total" não cobra. Sem dizer isso, a tela acusaria de
                 furo justamente o número que está certo. */
              (FORA && FORA.tem ? ", e o preco de " + FORA.etapas.length + " etapa(s) OPCIONAL(IS) fora do prazo contratado — esse nao e furo: e o que o \"Valor total\" nao cobra" : "") + ")."
             : " — fecha com o total das etapas.") +
            (c.folhasSemValor ? " ⚠ " + c.folhasSemValor + " tarefa(s) sem valor no mapa ficaram sem dinheiro nenhum." : "") +
            " Custo direto nao sai daqui.";
      }
      /* ⚠ O RELATO CONTA O QUE SAIU, NÃO O QUE FOI PEDIDO — ver o ⚠ em
         `_campos.estado`. Linha de base e avanço num nó que virou tarefa-RESUMO
         não são escritos (o Project calcula o resumo pelos filhos); dizer o
         contrário faria a tela prometer um Gantt de Controle que o arquivo não
         tem. E a base escrita SÓ em resumo carrega um risco que este arquivo
         não pôde medir: se o Project recalcular a barra cinza pelos filhos (que
         ali não têm base), ela pode sair menor. O detalhe "subetapa" não tem
         esse caso, porque ali a folha da base é a folha do arquivo. */
      if (E.relato.base && E.relato.base.ok) {
        var b = E.relato.base;
        /* ⚠ MEDIDO no Project real (12/09/2026): o `BaselineCost` NÃO é somado
           pelo Project no resumo (ao contrário do `Cost`), então a barra cinza
           do resumo existe e o dinheiro dela não vira dobro com os filhos. O que
           era dobro — a etapa e as subetapas dela carregando o mesmo valor —
           está resolvido em `_baseSemDobra`, e o número sai aqui. */
        b.motivo += " No arquivo: " + b.escritas + " em tarefa-folha" +
          (b.emResumo ? " e " + b.emResumo + " em tarefa-RESUMO (a barra cinza do resumo: o Project nao a calcula sozinho)" : "") +
          (b.custoEm != null ? ". Dinheiro da base em " + b.custoEm + " tarefa(s), R$ " + fmtBR(b.custoSoma || 0) +
            (b.custoOmitido ? " — em " + b.custoOmitido + " no(s) de cima o valor NAO saiu de proposito: eles carregam o mesmo dinheiro dos de baixo e a coluna somaria duas vezes" : "") : "") + ".";
      }
      if (E.relato.avanco && E.relato.avanco.ok) {
        var a = E.relato.avanco;
        a.motivo += " No arquivo: " + a.escritos + " tarefa(s) com percentual" +
          (a.emResumo ? " — ⚠ em " + a.emResumo + " no(s) o percentual NAO foi escrito, porque eles sairam como tarefa-RESUMO e o Project calcula o resumo pelos filhos; num detalhe menos fundo esse mesmo no vira folha e a barra mostra o avanco" : "") + ".";
      }
      if (E.relato.restricoes) {
        var s = E.relato.restricoes;
        s.ok = (s.nia + s.tae + s.dia + s.nid + s.nta + s.dta + s.mtp) > 0;
        s.motivo = (s.ok ? "" : "nenhuma data fixada neste cronograma — ") +
          s.nia + " data(s) \"nao iniciar antes de\" (ConstraintType 4), " + s.tae + " prazo(s) \"terminar ate\"" +
          (s.dia ? ", " + s.dia + " \"deve iniciar em\"" : "") + (s.nid ? ", " + s.nid + " \"nao iniciar depois de\"" : "") +
          (s.nta ? ", " + s.nta + " \"nao terminar antes de\"" : "") + (s.dta ? ", " + s.dta + " \"deve terminar em\"" : "") +
          (s.mtp ? ", " + s.mtp + " \"o mais tarde possivel\"" : "") +
          (s.ancoras ? " — " + s.ancoras + " sairam como ANCORA (nao iniciar antes de, na data do OrcaPRO)" +
            (s.estouradas ? ", sendo " + s.estouradas + " ja estourada(s)" : "") +
            ", porque como restricao elas venceriam a rede dentro do Project e mudariam as datas do PDF" : "") +
          (s.deadlines ? ". " + s.deadlines + " prazo(s) tambem como Deadline (a seta que alerta sem mexer na rede)" : "") + ".";
      }
      if (E._destino) {
        var k;
        for (k in E.relato) if (own(E.relato, k)) E._destino[k] = E.relato[k];
      }
    }
  };

  global.MSProject = MSProject;
  if (typeof module !== "undefined" && module.exports) module.exports = MSProject;
})(typeof window !== "undefined" ? window : this);

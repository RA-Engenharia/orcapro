/* =====================================================================
 * cronoplan.js — PLANEJAMENTO DA OBRA: linha de base, realizado por nó e
 * previsto × realizado (espec v2 do cronograma executivo, 1.7 a 1.9)
 *
 * Funções PURAS, sem DOM e sem gravar nada:
 *   congelarBase(r, meta, opts)        → o registro compacto da linha de base
 *   realizadoPorNo(orc, linhas, opts)  → quanto de cada nó da EAP foi feito
 *   confrontoPorNo(base, r, real, opts)→ previsto × realizado por nó + IDP
 *   montarPainel(entrada)              → o PAINEL da obra (espec 3.2): junta
 *       plano, base, diários e medições nas três réguas, KPIs, curva S,
 *       tabela por nó e o que ficou de fora — o que a ficha da obra, a
 *       sub-aba Previsto × Realizado e o módulo "Cronograma da obra" desenham
 *
 * POR QUE NUM ARQUIVO PRÓPRIO (e não em `Cronograma.*`, como a espec
 * escreveu): o `js/cronograma.js` é o motor que 17 chamadores e a paridade
 * com o master b8907ef vigiam linha a linha. Planejamento da obra lê o
 * motor, os valores de venda e os diários — não é cálculo de data. Aqui ele
 * cresce sem mexer no arquivo que decide a entrega impressa na proposta.
 *
 * ⚠ AS REGRAS QUE NÃO CEDEM (espec v2, seção 0)
 *  1) VALOR É PREÇO DE VENDA, E É OBRIGATÓRIO. Toda conta em R$ daqui usa
 *     `Orcamento.valoresEAP` (ou o mapa {id: valor} que ele devolve). Sem
 *     ele: erro com o motivo — NUNCA o custo direto no lugar. Uma curva ou
 *     um IDP pesados por custo põem a margem do escritório na tela do
 *     cliente, e nenhum assert enxergaria a troca.
 *  2) O REALIZADO LIGA POR CARIMBO. Linha de diário entra no nó só pelo
 *     `refId` do item do orçamento — na mesma identidade de serviço do
 *     `Avanco.chaveServico` (origem + refId + unidade). Nada de casar por
 *     nome, descrição ou número: renomear uma etapa não pode mudar o avanço,
 *     e duas unidades nunca se somam.
 *  3) A RÉGUA NOVA É OUTRA RÉGUA. "Executado sobre o orçamento" divide pelo
 *     orçamento INTEIRO (serviço nunca lançado conta 0%). O Portal do cliente
 *     continua no `Fisico.pct` (só serviços já lançados). Toda tela que
 *     mostra a régua daqui mostra, na mesma linha, o número do Portal e o
 *     medido por boletins — são três perguntas diferentes, e o engenheiro
 *     precisa responder ao cliente que liga com o número da tela dele.
 *  4) RELÓGIO INJETÁVEL. `opts.agora` / `opts.hoje`: sem isso o teste não é
 *     determinístico e a "situação" muda conforme a hora em que roda.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* Dependências lidas NA HORA DA CHAMADA, nunca no carregamento: no
     index.html este arquivo vem logo depois do cronograma.js, e o fisico.js
     (com o avancoservico.js) só carrega bem mais abaixo. Em Node, o require
     relativo serve o mesmo módulo que as suítes carregam. */
  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }
  /* Módulos INJETADOS pelo `montarPainel(entrada)` (Cronograma, Fisico) —
     valem só durante aquela chamada (try/finally). ⚠ Sem isto o painel
     receberia um Cronograma e o realizado/confronto que ele chama usariam
     outro (o global): dois motores na mesma conta, e o teste que injeta um
     motor para provar a fiação estaria medindo o motor errado. */
  var INJ = null;
  function Cr() { return (INJ && INJ.Cronograma) || dep("Cronograma", "./cronograma.js"); }
  function Av() { return dep("Avanco", "./avancoservico.js"); }
  function Fi() { return (INJ && INJ.Fisico) || dep("Fisico", "./fisico.js"); }

  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  /* só número de verdade: valores e quantidades aqui já chegam como número
     (valoresEAP, eap, Fisico). ⚠ Não é parser de texto BR — string cai em 0
     de propósito, em vez de uma quarta réplica do `Util.parseNum`. */
  function n0(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function pct1(v) { return Math.round(v * 10) / 10; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  // chave local "AAAA-MM-DD" (nunca toISOString: em UTC-3 ele volta um dia)
  function ch(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  /* Date, "AAAA-MM-DD…" ou ms → "AAAA-MM-DD" (ou "" se não der). String
     ISO é lida como DATA, não como instante: "2026-04-21" não pode virar dia
     20 às 21h no fuso do Brasil. */
  function iso10(x) {
    if (x == null || x === "") return "";
    if (typeof x === "string") { var s = x.slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) && dataLocal(s) ? s : ""; }
    var d = (typeof x === "number") ? new Date(x) : x;
    return (d && typeof d.getTime === "function" && !isNaN(d.getTime())) ? ch(d) : "";
  }
  function dataLocal(s) {
    var p = String(s || "").slice(0, 10).split("-");
    if (p.length !== 3) return null;
    var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    return (isFinite(d.getTime()) && ch(d) === String(s).slice(0, 10)) ? d : null;
  }
  function br(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso || ""); }
  /* dias de calendário entre duas datas ISO (null se alguma não for data) */
  function diasEntre(isoA, isoB) {
    var a = dataLocal(isoA), b = dataLocal(isoB);
    return (a && b) ? Math.round((b.getTime() - a.getTime()) / 86400000) : null;
  }
  /* último dia do mês "AAAA-MM" — é o instante que cada ponto da curva mensal
     representa (o acumulado AO FIM do mês, como em `periodos().lista`) */
  function fimDoMes(k) { return ch(new Date(+String(k).slice(0, 4), +String(k).slice(5, 7), 0)); }
  function brNum(v) { return String(Math.round(v * 100) / 100).replace(".", ","); }
  /* ⚠ RITMO POSITIVO QUE ARREDONDA A ZERO NÃO PODE SER ESCRITO COMO "0".
     `brNum` corta em 2 casas, e obra na reta final anda 0,004 ponto por
     semana: o texto saía "ritmo medido: 0% por semana … a obra termina em
     22/03/2027" — o número se desmente na PRÓPRIA linha, que é pior que não
     ter número nenhum. Quem lê conclui que o sistema está com defeito e passa
     a duvidar também do que está certo. A saída não é esconder o ritmo (a
     data depende dele): é dizer o que se sabe — "menos de 0,01". É a mesma
     frase que o `vazio()` da projeção já usava quando nem reta havia, agora
     num lugar só, para as três telas do painel escreverem igual.
     ⚠ Não remover achando que é enfeite de formatação: o zero aqui é a
     contradição, não um arredondamento qualquer. */
  function brRitmo(v) {
    v = n0(v);
    if (v > 0 && Math.round(v * 100) / 100 === 0) return "menos de 0,01";
    return brNum(v);
  }
  // "12.345,60" — dinheiro no recado vai com centavo e milhar, como na planilha
  function brMoeda(v) {
    var s = Math.abs(v).toFixed(2).split("."), i = s[0], o = "";
    while (i.length > 3) { o = "." + i.slice(-3) + o; i = i.slice(0, -3); }
    return (v < 0 ? "-" : "") + i + o + "," + s[1];
  }
  function kb(b) { return String(Math.round(b / 102.4) / 10).replace(".", ","); }

  /* Bytes em UTF-8 — é o que o Firestore conta. `JSON.stringify(x).length`
     conta unidades UTF-16 e subestima todo acento do português; o teto tem
     que ser medido na régua de quem recusa o documento. */
  function bytesUtf8(s) {
    var n = 0, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  /* Valores de venda: `{ok, porId}` de `Orcamento.valoresEAP` ou o mapa
     simples {id: valor}. ⚠ Ausente ou ok:false é ERRO — ver a regra 1. */
  function lerValores(Vo) {
    if (!Vo || typeof Vo !== "object") return { erro: "valores de venda ausentes — o planejamento da obra só pesa por preço de venda (Orcamento.valoresEAP), nunca por custo direto." };
    if (Vo.ok === false) return { erro: Vo.motivo || "valores de venda indisponíveis para este orçamento." };
    var p = (Vo.porId && typeof Vo.porId === "object") ? Vo.porId : Vo;
    return { porId: p };
  }

  /* Calendário de dias úteis a partir de um registro de base (sem o
     orçamento): mesmo `Cronograma.calendario` do plano, com a semana e os
     feriados que a base congelou. É o que faz a base de março continuar
     medindo março depois que alguém mexeu nos feriados extras da empresa. */
  function calDaBase(base) {
    var C = Cr(), cal = base && base.cal;
    if (!C || !cal) return null;
    var d0 = dataLocal(cal.dataInicio);
    if (!d0) return null;
    var mapa = {};
    arr(cal.feriados).forEach(function (f) { mapa[f] = true; });
    return C.calendario({ dataInicio: d0, params: { diasUteisSemana: cal.diasUteisSemana || 5 }, feriados: { mapa: mapa } });
  }
  /* índice de dia útil de uma data ("AAAA-MM-DD") no calendário: o maior k
     com dia(k) ≤ data; −1 antes do início. `teto` só limita a construção. */
  function indiceDe(cal, iso, teto) {
    var d = dataLocal(iso);
    if (!cal || !d) return null;
    return cal.indice(d.getTime(), Math.max(0, teto || 0) + 4000);
  }

  /* PREVISTO LINEAR EM DIAS ÚTEIS dentro da janela [i, f) do nó: o k-ésimo
     dia útil conta como TRABALHADO (o diário daquele dia relata o que se fez
     nele). 0 antes da janela, 100 do último dia em diante. Marco (i === f):
     0 antes do dia dele, 100 a partir dele. */
  function previsto(i, f, k) {
    if (k == null || k < 0) return 0;
    if (!(f > i)) return k >= i ? 100 : 0;
    return Math.max(0, Math.min(1, (k + 1 - i) / (f - i))) * 100;
  }

  var SITUACOES = ["concluida", "adiantada", "no prazo", "atrasada", "nao iniciada", "atrasada (não iniciada)"];
  var TETO_BASE = 40000;            // bytes UTF-8 por versão de linha de base
  var TETO_ENTIDADE = 900 * 1024;   // o mesmo aviso de 900 KB da nuvem (nuvem.js:965), antes do 1 MiB do Firestore

  /* =====================================================================
     O TETO DO PLANO DA OBRA É O TEXTO DA IA, NÃO A REDE.

     ⚠ MEDIDO (tools/test-crono-obra-sync.js, fase 3): 20 planos de execução
     com todos os mapas preenchidos e um motivo da IA de 120 caracteres em
     cada um dos 120 nós ocupavam 877 KB — a entidade `crono_obra` INTEIRA
     (teto de 900 KB), e nenhuma linha de base cabia mais: 100 congelamentos
     recusados, todos honestos, e a obra ficava sem com que se comparar.
     Quase metade do peso de um plano assim é TEXTO QUE EXPLICA, não decide:
     a rede (duração, predecessora, lag, marco, equipe, tipo) e a MARCA DE
     ORIGEM de cada nó ficam inteiras — nada disso se corta nunca. O que se
     corta é o motivo.

     A RÉGUA, declarada:
       - cada motivo guardado no plano cabe em MOTIVO_MAX caracteres (é o
         mesmo corte que o app.js já faz ao gravar a resposta da IA);
       - o plano guarda no máximo MOTIVOS_MAX motivos, nesta ordem: ETAPA
         primeiro, depois subetapa, depois os que o modo executivo guardou em
         `exec.anterior` (também de etapa). Dentro de cada mapa vale a ordem
         em que as chaves estão — dois aparelhos podem guardar subconjuntos
         diferentes, e tudo bem: quem grava por último manda, como em qualquer
         edição do plano, e a rede é a mesma nos dois;
       - ⚠ O MOTIVO DE ETAPA QUE PASSAR DO LIMITE PERDE O TEXTO, MAS NÃO A
         CHAVE. A tabela do cronograma desenha a marca de que a duração veio
         da IA A PARTIR DO MOTIVO (cronoexecui.js, `fonteEt`; ui.js,
         `_renderCronogramaEtapa`) — apagar a chave apagaria da tela, sem
         aviso, a informação de quem escolheu aquele prazo. Na subetapa a
         marca vem de `sub.agente`, e ali a chave sai inteira.
     O texto completo continua no ORÇAMENTO: o plano é uma cópia, e o corte
     não toca no cronograma da proposta.
     ===================================================================== */
  var MOTIVO_MAX = 120;
  var MOTIVOS_MAX = 60;
  var MOTIVO_SEM_TEXTO = "motivo não guardado (limite do plano)";

  /* % de um conjunto de serviços pela régua do Portal (`Fisico.ponderar`),
     com o orçamento inteiro no denominador — o MESMO cálculo para o nó do
     realizado e para a folha da linha de base remontada no confronto (uma
     régua só: duas cópias desta conta divergiriam no primeiro ajuste).
     ⚠ Serviço sem quantidade (0 ou pendente) fica FORA: com a quantidade velha
     de um item pendente no denominador, 5/10 + 20/20 (75%) virava 50%. */
  function agregar(F, servs) {
    var med = arr(servs).filter(function (s) { return !s.semBase; });
    var o = { pct: null, base: "indisponivel", itens: 0, itensSemPeso: 0, inicioReal: null, fimReal: null };
    if (!med.length) return o;
    var p = F.ponderar(med.map(function (s) {
      return { temPrevisto: true, previsto: s.quantidade, executado: s.executado,
        temPeso: s.valor > 0, peso: s.valor > 0 ? s.valor : 0, excedeu: s.executado > s.quantidade };
    }));
    o.pct = p.pct; o.base = p.base; o.itens = med.length;
    o.itensSemPeso = med.filter(function (s) { return !(s.valor > 0); }).length;
    var todos = true;
    med.forEach(function (s) {
      if (s.inicioReal && (!o.inicioReal || s.inicioReal < o.inicioReal)) o.inicioReal = s.inicioReal;
      if (!s.fimReal) todos = false;
      else if (!o.fimReal || s.fimReal > o.fimReal) o.fimReal = s.fimReal;
    });
    if (!todos) o.fimReal = null;
    return o;
  }

  function situacao(prev, real, tol) {
    if (real >= 100) return "concluida";
    if (real <= 0) return prev >= tol ? "atrasada (não iniciada)" : "nao iniciada";
    var d = real - prev;
    return d >= tol ? "adiantada" : (d <= -tol ? "atrasada" : "no prazo");
  }

  /* =====================================================================
     PAINEL DA OBRA (espec 3.2) — as peças do `montarPainel`
     ===================================================================== */
  var ROT_EXEC = "Executado sobre o orçamento (diários publicáveis)";
  var ROT_PORTAL = "no Portal do cliente (serviços já lançados nos diários)";
  var ROT_MEDIDO = "Medido (boletins aprovados)";
  var SEM_CB = "módulo do planejamento da obra não carregado (cronobase.js) — sem ele não dá para aplicar o plano de execução nem achar a linha de base ativa; recarregue o app.";
  var MES_ROT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function chMes(p) {
    if (!p) return "";
    if (p.chave) return String(p.chave).slice(0, 7);
    return p.ano != null && p.mes != null ? p.ano + "-" + pad2(p.mes + 1) : "";
  }
  function rotMes(k) { return MES_ROT[(+k.slice(5, 7)) - 1] + "/" + k.slice(2, 4); }
  function proxMes(k) { var y = +k.slice(0, 4), m = +k.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return y + "-" + pad2(m); }
  function mesesDe(a, b) { var out = [], k = a, g = 0; while (k <= b && g++ < 1200) { out.push(k); k = proxMes(k); } return out; }
  function mesmoConj(a, b) { return arr(a).slice().sort().join("|") === arr(b).slice().sort().join("|"); }

  /* Curva PLANEJADA (formato `periodos().lista`, o que `Cronograma.confronto`
     lê) posta no eixo do painel: 0 antes do 1º mês dela e ⚠ PRESA no último
     acumulado (100%) depois do último — o plano acabou, não "voltou a zero".
     Zero ou null ali desenham uma queda a pique (memória
     "portal-le-null-como-zero"). */
  function serieNoEixo(lista, eixo) {
    var mapa = {}, ks = [];
    arr(lista).forEach(function (p) { var k = chMes(p); if (/^\d{4}-\d{2}$/.test(k)) { mapa[k] = n0(p.acumPct); ks.push(k); } });
    if (!ks.length) return [];
    ks.sort();
    var ini = ks[0], ult = 0;
    return eixo.map(function (k) {
      if (k < ini) return 0;
      if (own(mapa, k)) ult = mapa[k];
      return r2(ult);
    });
  }

  /* =====================================================================
     CURVA PROJETADA — a terceira curva, a que responde "e se continuar assim?"

     A curva S do painel tinha três traçados, mas NENHUM deles respondia a
     pergunta que o dono da obra faz: linha de base (o que foi combinado),
     plano atual (o que está combinado agora) e executado (o que foi feito).
     "Plano atual" não é projeção: ele não sabe nada do ritmo medido — é o
     mesmo CPM de sempre, que entrega na data que a rede diz, atrasado ou não.

     ⚠ A PROJEÇÃO NÃO É UMA RETA DESENHADA POR CIMA DO PLANO. Ela sai do
     ritmo MEDIDO nos diários publicados (`Fisico.previsao`), que já resolveu
     a armadilha que torna toda projeção de obra mentirosa: medir o ritmo só
     pelas semanas em que se trabalhou. O denominador de lá é o calendário
     inteiro, paradas incluídas — ver o ⚠ de js/fisico.js. Aqui só se
     transporta aquele modelo para o eixo de meses da curva.

     ⚠ SEM RITMO, NÃO SAI NADA. Obra sem percentual, com menos de 3 semanas
     de histórico, sem avanço nas últimas semanas ou com ritmo tão baixo que
     o término cairia daqui a mais de 5 anos (`foraDeEscala`): `projetado`
     volta `null` e o MOTIVO vai para a lista de avisos, em PT-BR. Inventar
     uma reta ali seria pôr na tela do cliente uma data que ninguém mediu —
     e projeção com cara de dado é o que vira discussão contratual.
     ⚠ MEDIDO NOS BACKUPS REAIS (34 arquivos, 11/09/2026): das 6 obras com
     diário publicado, NENHUMA tem 3 semanas distintas de lançamento. Ou
     seja: hoje, na base real, o produto desta função é o MOTIVO, não a
     curva. Por isso o motivo é frase inteira e diz o que fazer.

     O ponto da ÂNCORA (o mês do último executado) é o valor MEDIDO, para a
     linha continuar exatamente de onde o executado parou; os pontos
     seguintes saem do modelo do `Fisico.previsao` (mesma origem das datas
     provável/otimista/pessimista, para a curva e as datas nunca discordarem).
     ⚠ CONSEQUÊNCIA ACEITA: o primeiro trecho é mais inclinado que os demais,
     porque carrega os dias já corridos entre o último lançamento e o fim do
     mês da âncora. A alternativa — pôr no mês da âncora o valor do modelo —
     abriria um degrau vertical entre o executado e a projeção no mesmo mês, e
     a alternativa seguinte — contar as semanas a partir do fim do mês — faria
     a linha chegar a 100% um mês depois da data que a própria tela escreve
     como "término provável". Duas telas com dois prazos é o defeito caro; um
     trecho mais inclinado, não.
     ===================================================================== */
  var PROJ_BASE = "diarios";
  function projetarCurva(pv, eixo, executado) {
    function vazio(motivo) { return { projetado: null, projecao: null, motivo: motivo }; }
    if (!pv || typeof pv !== "object") return vazio("o motor do avanço físico não trouxe a projeção de término (Fisico.previsao) — recarregue o app.");
    if (!arr(eixo).length || !arr(executado).length) return vazio("nenhum serviço do orçamento foi lançado nos diários publicados até a data de corte — a projeção aparece assim que o executado começar.");
    if (pv.ok === false) return vazio(pv.explicacao || "sem ritmo medido nos diários para projetar.");
    if (pv.concluida) return vazio("os serviços acompanhados já chegaram a 100% — não há o que projetar.");
    if (pv.foraDeEscala) return vazio(pv.explicacao || "o ritmo medido não dá término previsível.");
    var D0 = iso10(pv.baseCalculo), P0 = n0(pv.pct);
    /* ⚠ O RITMO DE TELA NÃO SERVE PARA A CONTA — é a mesma correção que a ENT
       já tinha ("O IDC ARREDONDADO É PARA A TELA, NÃO PARA A CONTA", abaixo
       neste arquivo). `pv.ritmoSemanal` vem arredondado em 2 casas pelo
       `Fisico.previsao`, enquanto `pv.dataProvavel` foi calculada com a taxa
       EXATA. Obra na reta final: ritmo verdadeiro abaixo de 0,005 %/semana →
       o arredondado vira 0 e a projeção some, mas a data continua lá.
       MEDIDO: série 99,888 / 99,892 / 99,896 % dava `ritmoSemanal: 0` e
       `dataProvavel: 2027-03-22` — a pessoa lia "término provável 22/03/2027"
       numa tela e "sem ritmo medido nos diários" na outra. Duas telas com dois
       prazos é o defeito caro que o ⚠ acima declara evitar.
       A recuperação usa a PRÓPRIA data que o motor publicou, e não uma segunda
       cópia da fórmula do ritmo (memória "réplica de parser apodrece"): a reta
       que liga (D0, P0) a (dataProvavel, 100) É a mesma que o ritmo exato
       desenha — o `Fisico` calcula a data como base + (restante ÷ ritmo) × 7.
       Ela só entra quando o arredondado zerou; no caminho normal nada muda. */
    var ritmo = n0(pv.ritmoSemanal), ritmoFonte = "medido";
    if (!(ritmo > 0) && n0(pv.ritmoSemanalExato) > 0) { ritmo = n0(pv.ritmoSemanalExato); ritmoFonte = "exato"; }
    if (!(ritmo > 0) && D0 && P0 < 100) {
      var dFim = diasEntre(D0, iso10(pv.dataProvavel));
      if (dFim > 0) { ritmo = (100 - P0) / (dFim / 7); ritmoFonte = "recuperado-da-data"; }
    }
    if (!(ritmo > 0) || !D0) {
      /* ⚠ e se nem assim: o motivo não pode ser "sem ritmo medido" quando a
         outra tela mostra uma data. Ele DIZ que o ritmo é baixo demais e
         REPETE a data, para as duas telas não se contradizerem. */
      if (iso10(pv.dataProvavel)) {
        return vazio("o ritmo medido nos diários é baixo demais para desenhar a projeção no gráfico (menos de 0,01% por semana). "
          + "O término provável pelo mesmo ritmo continua sendo " + br(iso10(pv.dataProvavel)) + ".");
      }
      return vazio("sem ritmo medido nos diários para projetar.");
    }
    var a = executado.length - 1, pA = n0(executado[a]), mesA = eixo[a];
    if (!mesA) return vazio("o executado tem mais meses que o eixo da curva — recarregue o painel.");
    if (!(pA < 100)) return vazio("o executado já está em 100% no último mês com lançamento — não há o que projetar.");

    /* até onde a projeção vai: o mês do término provável, e nunca menos que o
       fim do eixo já desenhado (senão a projeção sumiria antes do plano) */
    var ultEixo = eixo[eixo.length - 1], fimP = iso10(pv.dataProvavel);
    var mesFim = fimP ? fimP.slice(0, 7) : ultEixo;
    if (mesFim < ultEixo) mesFim = ultEixo;
    if (mesFim < mesA) mesFim = mesA;
    /* ⚠ O TETO DE 100 TINHA PISO NENHUM, e a projeção podia DESPENCAR ou ficar
       negativa. A âncora do desenho é `pA` (o último executado do gráfico) e o
       ponto de partida da conta é `P0` (`pv.pct`); hoje a fiação alimenta os
       dois do mesmo `real.obra.pct` e eles batem — medido em 6 fixtures,
       diferença 0 —, mas `projetarCurva` é função pública e as três réguas de
       avanço do mesmo painel já divergiram 9,2 pontos entre si. Com P0 abaixo
       de pA, o cliente via a curva cair de 80% para 43% no mês seguinte; com a
       base de cálculo depois do mês da âncora, percentual NEGATIVO.
       Duas guardas: a projeção NUNCA desenha a obra andando para trás (piso em
       pA, que é o que já está feito), e quando as duas réguas discordam além
       da tolerância o motor devolve o MOTIVO em vez do número — uma linha que
       parte de um ponto que não está no gráfico é pior que linha nenhuma. */
    var TOL_ANCORA = 0.5;
    if (Math.abs(pA - P0) > TOL_ANCORA) {
      return vazio("o avanço do gráfico (" + brNum(pA) + "%) e o avanço que a projeção usa como partida (" + brNum(P0)
        + "%) não são a mesma régua — a diferença é de " + brNum(Math.abs(pA - P0))
        + " pontos. Projetar a partir de um ponto que não está no gráfico desenharia a obra andando para trás; confira qual régua de avanço o painel está usando.");
    }
    var eixoP = mesesDe(mesA, mesFim), valores = [], cheio = -1, i, d, v;
    for (i = 0; i < eixoP.length; i++) {
      if (i === 0) { valores.push(r2(pA)); continue; }
      d = diasEntre(D0, fimDoMes(eixoP[i]));
      v = d == null ? null : Math.max(pA, Math.min(100, P0 + ritmo * (d / 7)));
      valores.push(v == null ? null : r2(v));
      if (cheio < 0 && v != null && v >= 100) cheio = i;
    }
    // chegou a 100: a linha PARA ali (uma reta deitada em 100 fingiria plano)
    if (cheio > -1) { eixoP = eixoP.slice(0, cheio + 1); valores = valores.slice(0, cheio + 1); }

    var projetado = eixo.map(function (k, j) {
      if (j < a) return null;                       // antes da âncora quem fala é o executado
      var p = j - a;
      return p < valores.length ? valores[p] : null;
    });
    var alem = 0;
    for (i = 0; i < eixoP.length; i++) if (a + i >= eixo.length) alem++;
    return {
      projetado: projetado,
      projecao: {
        base: PROJ_BASE,
        rotulo: "Projeção pelo ritmo medido nos diários (" + brRitmo(ritmo) + "% por semana"
          + (ritmoFonte === "medido" ? "" : ", ritmo abaixo do arredondamento de tela — "
            + (ritmoFonte === "exato" ? "a conta usou o ritmo sem arredondar" : "recuperado da data de término provável")) + ")",
        /* ⚠ `ritmoSemanal` continua sendo o do `Fisico` (é o número que a tela
           já escreve); `ritmoUsado` e `ritmoFonte` dizem o que ENTROU na conta.
           Número sem origem declarada volta como discussão contratual.
           ⚠ E A RESSALVA VALIA SÓ PARA "recuperado-da-data", QUE FICOU
           INALCANÇÁVEL: quando o `Fisico.previsao` passou a publicar
           `ritmoSemanalExato`, o ramo "exato" entrou NA FRENTE e o
           "recuperado-da-data" só sobra para pv de outro produtor (foi o que
           manteve a fixture da suíte verde enquanto as três telas mentiam).
           MEDIDO com a série 99,888 / 99,892 / 99,896: ritmoFonte "exato",
           rótulo "0% por semana" e dataProvavel 22/03/2027 na mesma saída.
           `ritmoTexto` é a escrita honesta do ritmo QUE ENTROU NA CONTA, e é
           ela que as três telas usam — uma regra, um dono (o aviso do
           `montarPainel` e a frase do `CronoIA.narrativa` leem daqui, em vez
           de cada um formatar o seu, que é como parser replicado apodrece). */
        ritmoSemanal: pv.ritmoSemanal, ritmoUsado: Math.round(ritmo * 1e6) / 1e6, ritmoFonte: ritmoFonte,
        ritmoTexto: brRitmo(ritmo),
        ritmoOtimista: pv.ritmoOtimista,
        dataProvavel: pv.dataProvavel || "", dataOtimista: pv.dataOtimista || "", dataPessimista: pv.dataPessimista || "",
        semanasRestantes: pv.semanasRestantes == null ? null : pv.semanasRestantes,
        semanasHistorico: pv.semanasHistorico == null ? null : pv.semanasHistorico,
        ancora: { mes: mesA, pct: r2(pA), data: D0 },
        eixo: eixoP, rotulos: eixoP.map(rotMes), valores: valores, mesesAlemDoEixo: alem,
        terminoReferencia: pv.terminoContrato || "", desvioDias: pv.desvioDias == null ? null : pv.desvioDias,
        situacao: pv.situacao || "", explicacao: pv.explicacao || ""
      },
      motivo: ""
    };
  }

  /* =====================================================================
     VALOR AGREGADO COMPLETO (EVM) — e a régua de cada metade.

     O painel já tinha VP, VA e IDP: "estou atrasado?". Faltava a outra
     metade: "estou caro?". VC, IDC e ENT respondem isso, e "no ritmo de
     gasto de hoje esta obra termina custando R$ X" é a frase que muda
     decisão de diretoria.

     ⚠ AS DUAS METADES NÃO ESTÃO NA MESMA RÉGUA, E ISSO NÃO PODE FICAR
     IMPLÍCITO (skill `dinheiro`). O previsto do cronograma é PREÇO DE VENDA
     (é o que a proposta cobra, BDI dentro); o custo real do `CustoEtapa` é
     CUSTO DIRETO, sem BDI (é o que o Financeiro lança). Dividir VA de venda
     por CR de custo daria um IDC inflado pelo BDI inteiro — numa obra com
     BDI de 25% um desempenho exatamente no orçado apareceria como IDC 1,25,
     "sobrando dinheiro", que é a direção errada de errar.
     A CONVERSÃO, e por que ela é exata: `Orcamento.valoresEAP` rateia o valor
     de venda da etapa entre as folhas PROPORCIONALMENTE AO CUSTO DIRETO. Logo
     custo_folha = custo_etapa × (venda_folha ÷ venda_etapa) por construção —
     a razão k = custo direto da etapa ÷ venda da etapa vale igual em toda
     folha dela. É essa razão que traz o VA para a régua do custo.
     LIMITE DECLARADO: o custo direto vem do orçamento de HOJE e a venda pode
     vir de uma linha de base congelada antes de uma edição — mudou o custo de
     uma etapa depois de congelar, o k dela fica velho. Por isso `ontCusto`
     volta junto: a tela mostra o orçado em custo ao lado do orçado em venda.

     ⚠ O CR É O GASTO INTEIRO DA OBRA, APROPRIADO OU NÃO. `CustoEtapa` já
     filtra por obra; o que ele separa é o que tem ETIQUETA DE ETAPA. Somar
     só o etiquetado deixaria de fora justamente material e mão de obra (que
     entram por compra, nota e folha, e nenhum desses caminhos carimba etapa)
     e o IDC sairia otimista — o erro na direção que faz alguém autorizar a
     próxima compra. ⚠ MEDIDO nos backups reais (11/09/2026): 46 despesas com
     obra, 7 com etapa; 15 pedidos de compra, 0 com etapa; nas 4 obras com
     gasto a cobertura de apropriação é 0%. Com CR = só o apropriado, o IDC
     dessas quatro obras seria 0 ÷ 0 ou infinito. Com o gasto inteiro, ele
     sai certo no nível da OBRA — e é só nesse nível que ele sai.
     ⚠ POR ISSO NÃO HÁ IDC POR ETAPA. Com a cobertura no chão, custo por etapa
     é a tela que "responde errado com cara de certa" (ver o cabeçalho do
     js/custoetapa.js). A cobertura volta em `cobertura.pctApropriado` e a
     tela a diz; abaixo de COBERTURA_MIN sai aviso.
     ⚠ COMPROMETIDO NÃO ENTRA NO IDC. Pedido aprovado e não recebido ainda não
     é despesa; ele volta separado (e somado em `exposicao`), como no
     `CustoEtapa`.
     ⚠ ÍNDICE SÓ CONTRA LINHA DE BASE, a mesma trava do IDP: contra o plano
     atual (que se edita) todo índice tende a 1 sozinho depois de reprogramar.
     ===================================================================== */
  var COBERTURA_MIN = 60;   // a mesma régua de 60% que o `Fisico.ponderar` já usa para decidir se pondera por dinheiro
  var ROT_EVM = {
    vp: "Valor Previsto (VP) — quanto do contrato o plano dizia que já estaria entregue na data de corte, em preço de venda",
    va: "Valor Agregado (VA) — quanto do contrato já está entregue, medido pelo mesmo preço de venda do plano",
    ont: "Orçamento no Término, em venda (ONT) — o preço de venda do escopo que está sendo medido",
    idp: "Índice de Desempenho de Prazo (IDP = VA ÷ VP) — abaixo de 1, a obra entregou menos do que o plano previa para a data",
    vpr: "Variação de Prazo (VPR = VA − VP, em R$ de venda) — negativo é obra entregando menos do que o previsto para a data",
    cr: "Custo Real (CR) — as despesas desta obra no Financeiro, em custo direto, apropriadas em etapa ou não",
    ontCusto: "Orçamento no Término, em custo direto (ONT) — o custo direto orçado do escopo que está sendo medido",
    vaCusto: "Valor Agregado em custo direto — o VA trazido para a régua do custo, que é a única em que ele pode ser comparado com o CR",
    idc: "Índice de Desempenho de Custo (IDC = VA em custo ÷ CR) — abaixo de 1, cada real gasto rende menos obra do que o orçado",
    vc: "Variação de Custo (VC = VA em custo − CR) — negativo é dinheiro já gasto além do orçado para o que está feito",
    ent: "Estimativa no Término (ENT = ONT em custo ÷ IDC) — quanto a obra deve custar se o desempenho de custo continuar o mesmo",
    vnt: "Variação no Término (VNT = ONT em custo − ENT) — negativo é o estouro projetado",
    ept: "Estimativa para Terminar (EPT = ENT − CR) — quanto ainda falta gastar, no mesmo desempenho",
    crCaixa: "Custo Real em caixa — a parte do gasto que JÁ SAIU DA CONTA e tem etapa carimbada (o CustoEtapa só acompanha caixa no que está apropriado; o resto aparece no Custo Real, não aqui)",
    comprometido: "Comprometido — pedidos de compra aprovados e ainda não recebidos: não é despesa, e por isso não entra no IDC",
    exposicao: "Exposição — Custo Real + Comprometido: o que já saiu somado ao que já está empenhado"
  };
  var REGUA_EVM = {
    venda: "VP, VA, ONT (venda), IDP e VPR estão em PREÇO DE VENDA — a régua do cronograma e da proposta.",
    custo: "CR, VC, IDC, ENT e EPT estão em CUSTO DIRETO, sem BDI — a régua do Financeiro. As duas metades nunca se somam; o VA é convertido para o custo pela razão custo ÷ venda de cada etapa."
  };

  function evmDaObra(conf, custo, opts) {
    opts = opts || {};
    var comBase = !!opts.comBase;
    var out = {
      ok: false, motivo: "", comBase: comBase, contra: "",
      regua: REGUA_EVM, rotulos: ROT_EVM,
      vp: null, va: null, ont: null, idp: null, vpr: null, idpMotivo: "",
      ontCusto: null, vpCusto: null, vaCusto: null,
      cr: null, crApropriado: null, crNaoApropriado: null, crCaixa: null,
      comprometido: null, exposicao: null,
      idc: null, vc: null, ent: null, vnt: null, ept: null, idcMotivo: "",
      cobertura: null, avisosCusto: [],
      ate: iso10(opts.ate) || "", dataCorte: iso10(opts.dataCorte) || ""
    };
    if (!conf || !conf.totais || conf.totais.camada !== "folha" || !Array.isArray(conf.nos)) {
      out.motivo = "sem o previsto × realizado por nó — o valor agregado sai do CronoPlan.confrontoPorNo, na camada folha.";
      return out;
    }
    out.ok = true;
    var T = conf.totais;
    out.vp = T.VP; out.va = T.VA; out.ont = T.valorBase; out.contra = T.idpRotulo || "";
    if (comBase) {
      out.idp = T.IDP;
      out.vpr = (typeof T.VA === "number" && typeof T.VP === "number") ? r2(T.VA - T.VP) : null;
    } else {
      out.idpMotivo = "sem linha de base congelada — o IDP e o IDC só se comparam contra um plano congelado (o plano atual muda a cada edição, e aí o índice fica perto de 1 sozinho). Congele a linha de base da obra.";
      out.idcMotivo = out.idpMotivo;
    }

    /* ---- o CUSTO REAL, e a conversão do VA para a régua dele ---- */
    if (!custo || typeof custo !== "object" || !Array.isArray(custo.linhas) || !custo.totais || !custo.naoApropriado) {
      out.idcMotivo = "o custo real da obra não chegou ao painel — ele vem de CustoEtapa.consolidar({obraId, orcamento, financeiro, compras}). Sem ele não há CR, IDC nem ENT.";
      return out;
    }
    var crAp = r2(n0(custo.totais.realizadoCompetencia)), crNa = r2(n0(custo.naoApropriado.valor));
    out.crApropriado = crAp; out.crNaoApropriado = crNa; out.cr = r2(crAp + crNa);
    out.crCaixa = r2(n0(custo.totais.realizadoCaixa));
    out.comprometido = r2(n0(custo.totais.comprometido) + n0(custo.comprometidoSemEtapa && custo.comprometidoSemEtapa.valor));
    out.exposicao = r2(out.cr + out.comprometido);
    out.avisosCusto = (custo.cobertura && Array.isArray(custo.cobertura.avisos)) ? custo.cobertura.avisos.slice() : [];

    var custoE = {};
    arr(custo.linhas).forEach(function (l) { if (l && l.nivel === 1) custoE[String(l.etapaId)] = n0(l.previsto); });
    /* ⚠ O DENOMINADOR DA RAZÃO É A VENDA DA ETAPA INTEIRA, NÃO A SOMA DAS
       FOLHAS QUE ENTRARAM NO TOTAL. O `custo.linhas` de nível 1 traz o custo
       direto de TODOS os itens da etapa; dividi-lo pela venda de um
       subconjunto de folhas jogaria o custo da etapa inteira em cima desse
       subconjunto. MEDIDO na suíte (tools/test-crono-evm.js, bloco 5): etapa
       de R$ 12.500 de venda e R$ 10.000 de custo direto, com duas subetapas —
       a linha de base guardou as duas e depois a quantidade de uma virou
       PENDENTE, então ela deixa de ter serviço mensurável e sai do VP/VA.
       Pela soma das folhas que sobraram, o ONT em custo daria os R$ 10.000
       inteiros em cima da subetapa que ficou, em vez de R$ 6.000, e o IDC
       saltaria de 0,75 para 1,25 — a obra apareceria GASTANDO MENOS do que o
       orçado, que é a direção errada de errar (é com esse número que alguém
       autoriza a próxima compra). A venda da ETAPA vem do próprio confronto
       (o nó de tipo "etapa"); a soma das folhas é só o plano B para o caso de
       esse nó não existir na referência. */
    var vendaEtapa = {}, vendaFolhas = {}, folhas = [];
    conf.nos.forEach(function (n) {
      if (!n || n.previstoPct == null) return;
      if (n.tipo === "etapa" && n.valor > 0) vendaEtapa[String(n.id)] = n0(n.valor);
      // exatamente o conjunto que o confronto somou em VP/VA (camada folha, com valor e com % apurado)
      if (!n.folha || n.realPct == null || !(n.valor > 0)) return;
      folhas.push(n);
      vendaFolhas[String(n.etapaId)] = n0(vendaFolhas[String(n.etapaId)]) + n0(n.valor);
    });
    var ONTc = 0, VAc = 0, VPc = 0, semC = {}, comC = {}, vSemC = 0;
    folhas.forEach(function (n) {
      var E = String(n.etapaId), ce = own(custoE, E) ? custoE[E] : 0;
      var ve = n0(vendaEtapa[E]) > 0 ? n0(vendaEtapa[E]) : n0(vendaFolhas[E]);
      if (!(ve > 0) || !(ce > 0)) { semC[E] = true; vSemC += n0(n.valor); return; }
      var vc = n0(n.valor) * (ce / ve);
      comC[E] = true;
      ONTc += vc; VAc += vc * n0(n.realPct) / 100; VPc += vc * n0(n.previstoPct) / 100;
    });
    out.ontCusto = r2(ONTc); out.vaCusto = r2(VAc); out.vpCusto = r2(VPc);
    var pctAp = (custo.cobertura && typeof custo.cobertura.pctApropriado === "number") ? Math.round(custo.cobertura.pctApropriado * 10) / 10 : null;
    out.cobertura = {
      pctApropriado: pctAp, minimo: COBERTURA_MIN,
      suficiente: pctAp != null && pctAp >= COBERTURA_MIN,
      etapasComCusto: Object.keys(comC).length, etapasSemCusto: Object.keys(semC).length,
      valorVendaSemCusto: r2(vSemC),
      rotulo: "Cobertura de apropriação: a fração do gasto da obra que tem etapa carimbada. O IDC acima é da OBRA INTEIRA (todo o gasto entra no CR); é o custo POR ETAPA que depende desta cobertura."
    };

    /* ⚠ TRÊS CASOS, TRÊS RECADOS. A guarda era `if (!(out.cr > 0))` com uma
       frase só — "nenhuma despesa desta obra lançada no Financeiro" —, e ela
       saía também para custo real NEGATIVO (estorno maior que a despesa: HÁ
       despesa) e para número corrompido chegando como NaN (que o `n0` zera,
       apagando o fato de ter chegado torto). §7 do CLAUDE.md: recado que mente
       é pior que recado nenhum, e este é lido por quem vai autorizar a próxima
       compra. A entrada torta é conferida ANTES do `n0` zerar. */
    /* ⚠ CAMPO AUSENTE NÃO É CAMPO TORTO. `undefined`/`null`/"" é "não veio" e
       vale zero (é o que o `n0` sempre fez); torto é o valor que ESTÁ lá e não
       é número (NaN, texto). Confundir os dois faria toda obra sem despesa
       aparecer como dado corrompido — foi o defeito que este próprio conserto
       introduziu na primeira escrita, achado rodando o repro. */
    function tortoCru(v) { return v != null && v !== "" && !isFinite(Number(v)); }
    if (tortoCru(custo.totais.realizadoCompetencia) || tortoCru(custo.naoApropriado.valor)) {
      out.crCorrompido = true;
      out.idcMotivo = "o custo real desta obra chegou ao painel em formato inválido (não é um número) — o IDC não sai enquanto isso não for corrigido. "
        + "Não é o mesmo que não haver despesa: confira os lançamentos do Financeiro desta obra.";
      return out;
    }
    if (out.cr < 0) {
      out.idcMotivo = "o custo real desta obra está NEGATIVO (R$ " + brMoeda(out.cr) + ") — há estorno maior que a despesa lançada. "
        + "HÁ lançamento nesta obra; o que não fecha é a soma. Confira os estornos antes de ler o IDC.";
      return out;
    }
    if (!(out.cr > 0)) {
      out.idcMotivo = "nenhuma despesa desta obra lançada no Financeiro" + (out.ate ? " até " + br(out.ate) : "") +
        " — o IDC e a ENT saem quando o custo estiver lançado. Lance as despesas da obra (ou vincule as compras e as notas a ela).";
      return out;
    }
    if (!(ONTc > 0)) {
      out.idcMotivo = "o orçamento vinculado não tem custo direto nas etapas que estão sendo medidas — sem o orçado não dá para dizer se o gasto está alto ou baixo.";
      return out;
    }
    if (!comBase) return out;   // `idcMotivo` já diz que falta a linha de base
    /* ⚠ O IDC ARREDONDADO É PARA A TELA, NÃO PARA A CONTA. A ENT dividida
       pelo índice de 3 casas erra em dinheiro: num escopo de R$ 20.000 com
       IDC 0,714285…, a ENT exata é 28.000,00 e a calculada sobre 0,714 sai
       28.011,20 — R$ 11 de diferença que ninguém consegue explicar de onde
       vem, e que cresce com o tamanho da obra. A conta usa a razão inteira. */
    var idcExato = VAc / out.cr;
    out.idc = Math.round(idcExato * 1000) / 1000;
    out.vc = r2(VAc - out.cr);
    if (!(idcExato > 0)) {
      out.idcMotivo = "nada do escopo medido foi executado ainda — a estimativa no término só sai depois do primeiro serviço lançado nos diários.";
      return out;
    }
    out.ent = r2(ONTc / idcExato);
    out.vnt = r2(ONTc - out.ent);
    out.ept = r2(out.ent - out.cr);
    return out;
  }

  /* ⚠ RÉPLICA DA RÉGUA DE `Gestao._avancoMedido` (gestao.js) — o "Medido" do
     palco e do cartão da obra, que o engenheiro já vê. O gestao.js não carrega
     fora do app e o painel é motor puro, então a regra vem copiada — e a
     test-crono-painel EXECUTA a função real extraída do gestao.js num corpus
     e exige o mesmo número (sem isso esta cópia apodrece calada: memória
     "réplica de parser apodrece"). A regra de hoje: só boletim `aprovada` ou
     `paga` (lista de INCLUSÃO — boletim sem status fica fora); soma o
     `percentual` com `Util.num` e arredonda a inteiro; aprovados só em R$
     (sem percentual) → null, "não sei", nunca 0; nenhum boletim → 0. */
  function medidoDaObra(Ut, obraId, meds) {
    var minhas = arr(meds).filter(function (m) { return !!m && m.obraId === obraId && (m.status === "aprovada" || m.status === "paga"); });
    var emValor = r2(minhas.reduce(function (t, m) { return t + Ut.num(m.valor); }, 0));
    if (!minhas.length) return { pct: 0, emValor: 0, boletins: 0 };
    var temPct = minhas.some(function (m) { return m.percentual != null && m.percentual !== ""; });
    if (!temPct && minhas.some(function (m) { return Ut.num(m.valor) > 0; })) return { pct: null, emValor: emValor, boletins: minhas.length };
    return { pct: Math.round(minhas.reduce(function (t, m) { return t + Ut.num(m.percentual); }, 0)), emValor: emValor, boletins: minhas.length };
  }

  /* ⚠ A LINHA DE BASE TEM DE SER DO ORÇAMENTO DA OBRA (revisão 3, lente sync).
     O vínculo da obra muda livremente pelo cadastro (e pelo "vincular à obra"
     do BIM), e nenhum dos dois olha o `crono_obra`: a obra religada a um
     orçamento de fora da cadeia de revisões era medida contra a base antiga —
     previsto 100, real 0, IDP 0 e "atrasada (não iniciada)" numa obra 54%
     executada, sem aviso. Revisão (novaRevisao) conserva os ids das etapas, então
     base de uma revisão ANTERIOR vale; de outro orçamento, não.
     `orcamentos` (a lista) sobe a cadeia inteira; sem ela, só o pai direto.
     Base sem `orcamentoId` gravado não dá para conferir: vale, como sempre
     valeu (nenhuma gravação do app deixa de carimbar). */
  function cadeiaIdsDe(orc, orcamentos) {
    var porId = {}, ids = {}, cur = orc, n = 0;
    arr(orcamentos).forEach(function (o) { if (o && o.id != null) porId[String(o.id)] = o; });
    while (cur && cur.id != null && !own(ids, String(cur.id)) && n++ < 60) {
      ids[String(cur.id)] = true;
      if (!cur.revisaoDe) break;
      var pai = String(cur.revisaoDe);
      if (!own(porId, pai)) { ids[pai] = true; break; }
      cur = porId[pai];
    }
    return ids;
  }
  function baseVale(base, orc, orcamentos) {
    if (!base || !orc) return { ok: true };
    var bo = base.orcamentoId == null ? "" : String(base.orcamentoId);
    if (!bo) return { ok: true };
    return own(cadeiaIdsDe(orc, orcamentos), bo) ? { ok: true } : { ok: false, orcamentoId: bo, orcNumero: base.orcNumero == null ? "" : String(base.orcNumero) };
  }

  /* ⚠ RÉPLICA DO NÚMERO GRANDE DO PORTAL (`Gestao._snapshotPortal`, bloco
     "EXECUÇÃO FÍSICA"), na ordem de autoridade de lá:
       1) `obra.pctExecutado` gravado à mão manda;
       2) senão o `Fisico` dos diários publicáveis, pesado pelos PREÇOS que o
          snapshot monta — itens do orçamento por `valorUnitario ??
          precoUnitario` (campos que nenhum item grava hoje: por isso o Portal
          costuma cair na média simples) + a tabela de atividades da obra;
       3) senão o acumulado das medições aprovadas por `_ehAprovado` (mais
          largo que o `_avancoMedido`: aceita também aprovado/enviado/
          confirmado/recebido/comprada), sem as rejeitadas, preso em 100.
     O rótulo diz qual das três está na tela do cliente: "serviços lançados
     nos diários" em cima de um número digitado seria recado que mente. A
     test-crono-painel executa o trecho REAL do snapshot e exige o mesmo
     número nas três fontes. */
  var APROV_PORTAL = { aprovada: 1, aprovado: 1, enviado: 1, confirmado: 1, paga: 1, recebido: 1, comprada: 1 };
  function precosDoPortal(orcP, atividades, Ut, obraId) {
    var precos = [];
    if (orcP && orcP.etapas) {
      orcP.etapas.forEach(function (e) {
        (e.itens || []).forEach(function (it) {
          precos.push({ origem: "orcamento", refId: it.id || "", codigo: it.codigo || "", descricao: it.descricao || "", unidade: it.unidade || "",
            valorUnitario: Ut.num(it.valorUnitario != null ? it.valorUnitario : it.precoUnitario) });
        });
      });
    }
    // `atividades` = Gestao._atividadesDaObra(obraId): a MESMA lista e ORDEM do snapshot (o 1º preço de uma chave vence no índice)
    arr(atividades).forEach(function (a) {
      if (!a || String(a.obraId) !== String(obraId) || a.ativo === false) return;
      precos.push({ codigo: a.codigo || "", descricao: a.descricao || "", unidade: a.unidade || "", valorUnitario: Ut.num(a.valorUnitario) });
    });
    return precos;
  }
  function portalDaObra(Ut, obra, pf, meds) {
    if (obra.pctExecutado != null) return { pct: Ut.num(obra.pctExecutado), fonte: "manual" };
    if (pf && pf.pct !== null) return { pct: pf.pct, fonte: "diario" };
    var acum = 0;
    arr(meds).forEach(function (m) {
      if (!m || m.obraId !== obra.id || m.status === "rejeitada") return;
      if (own(APROV_PORTAL, m.status)) acum += Ut.num(m.percentual);
    });
    return { pct: Math.min(100, Math.round(acum * 10) / 10), fonte: "medicao" };
  }

  /* edições do plano que apontam para etapa/subetapa que não existe mais no
     orçamento: não quebram nada (o motor as ignora), mas a pessoa precisa
     saber que o que ela digitou ali não está valendo */
  function orfasDoPlano(orc, cron) {
    var ids = {}, vistos = {}, n = 0;
    arr(orc.etapas).forEach(function (e) {
      ids[e.id] = true; ids[e.id + "~g"] = true;
      arr(e.subetapas).forEach(function (s) { if (s) ids[s.id] = true; });
    });
    function varre(m) {
      if (!m || typeof m !== "object" || Array.isArray(m)) return;
      for (var k in m) if (own(m, k) && !own(ids, k) && !own(vistos, k)) { vistos[k] = true; n++; }
    }
    var s = (cron && cron.sub) || {};
    /* ⚠ `cron.restricoes` (as datas que o arrasto no Gantt fixa) entra na
       varredura: uma data fixada apontando para etapa apagada é órfã como
       qualquer outra, e sem ela aqui a única pista da perda era o aviso do
       motor — que até 12/09/2026 não chegava a tela nenhuma. */
    [cron.duracoes, cron.predecessoras, cron.marcos, cron.lags, cron.restricoes, s.duracoes, s.predecessoras, s.marcos, s.equipes].forEach(varre);
    return n;
  }
  function nomesEtapas(orc, ids) {
    var nm = {};
    arr(orc.etapas).forEach(function (e, i) { nm[e.id] = (i + 1) + " " + String(e.nome || ""); });
    return arr(ids).map(function (id) { return own(nm, id) ? nm[id] : String(id); }).join(", ");
  }
  function noPainel(n) {
    return { id: n.id, tipo: n.tipo, etapaId: n.etapaId, numero: n.numero, nome: n.nome, folha: !!n.folha, valor: n.valor,
      base: n.base, atual: n.atual, real: n.real, previstoPct: n.previstoPct, realPct: n.realPct, desvioPP: n.desvioPP,
      desvioTerminoDias: n.desvioTerminoDias, situacao: n.situacao,
      foraDaBase: !!n.foraDaBase, sumiuDoAtual: !!n.sumiuDoAtual, reagrupada: !!n.reagrupada, opcionalFora: !!n.opcionalFora };
  }

  /* a forma INTEIRA do painel, com tudo vazio: é o que volta também no erro
     e na exceção — a tela lê `kpis.portal.pct` sem perguntar se `kpis` existe */
  function formaDoPainel() {
    return {
      estado: "ok", obra: null, orcamento: null, plano: null, base: null, baseAlheia: null, termino: null, dataCorte: null, fonteCorte: null, ancora: null,
      kpis: { executadoOrcamento: { pct: null, base: "indisponivel", rotulo: ROT_EXEC },
        portal: { pct: null, rotulo: ROT_PORTAL, fonte: null }, medido: { pct: null, rotulo: ROT_MEDIDO },
        previstoNaData: null, idp: null, evm: null, situacao: null, situacaoContra: null, desvioTerminoDias: null },
      curva: { rotulos: [], eixo: [], base: [], atual: [], executado: [], projetado: null, projecao: null, projecaoMotivo: "" },
      nos: [], atencao: [],
      foraDaConta: { naoApropriadas: [], semQuantidade: [], opcionaisFora: [], escopoForaDaBase: [], valorForaDaBase: 0, msgForaDaBase: null,
        sumiramDoAtual: [], reagrupadas: [] },
      avisos: []
    };
  }

  function painel(e) {
    var C = Cr(), F = Fi();
    var Rd = e.RDO || dep("RDO", "./rdo.js"), O = e.Orcamento || dep("Orcamento", "./orcamento.js");
    var Ut = e.Util || dep("Util", "./util.js");
    var CB = e.CronoBase !== undefined ? e.CronoBase : dep("CronoBase", "./cronobase.js");
    var hoje = iso10(e.hoje) || ch(new Date());
    var out = formaDoPainel();
    function aviso(tipo, msg) { out.avisos.push({ tipo: tipo, msg: msg }); }
    function falha(estado, msg) { out.estado = estado; out.erro = msg; return out; }

    if (!C || !F || typeof F.porServico !== "function" || typeof F.pctObra !== "function") return falha("modulos", "módulos do planejamento não carregados (cronograma.js, fisico.js) — recarregue o app.");
    if (!Rd || typeof Rd.podeIrAoPortal !== "function") return falha("modulos", "módulo do diário não carregado (rdo.js) — sem ele não dá para saber quais diários foram ao Portal, e nenhum número sai daqui.");
    if (!Ut || typeof Ut.num !== "function") return falha("modulos", "módulo util.js não carregado — recarregue o app.");
    if (!O || typeof O.valoresEAP !== "function") return falha("modulos", "módulo do orçamento não carregado (orcamento.js) — sem os valores de venda o planejamento não pesa nada.");

    var obra = e.obra;
    if (!obra || typeof obra !== "object" || obra.id == null || obra.id === "") return falha("sem-obra", "sem obra — o previsto × realizado é de uma obra; abra-o pela ficha da obra.");
    var nomeObra = String(obra.nome == null ? "" : obra.nome);
    out.obra = { id: obra.id, nome: nomeObra, inicio: iso10(obra.inicio) };
    var orc = e.orc;
    if (!orc || typeof orc !== "object") return falha("sem-orcamento", "a obra " + (nomeObra || obra.id) + " não tem orçamento vinculado — vincule o orçamento da obra para acompanhar o previsto × realizado.");
    var revM = String(orc.numero || "").match(/-R(\d+)$/);
    out.orcamento = { id: orc.id, numero: orc.numero == null ? "" : String(orc.numero),
      revisao: typeof orc.revisaoNumero === "number" ? orc.revisaoNumero : (revM ? +revM[1] : 0) };
    var rotOrc = out.orcamento.numero || String(orc.id);
    if (!arr(orc.etapas).length) return falha("sem-etapas", "o orçamento " + rotOrc + " não tem etapas — lance as etapas e os serviços na planilha para planejar a obra.");
    // ⚠ VALOR DE VENDA É OBRIGATÓRIO (regra 1): sem ele o painel para aqui, nunca pesa por custo
    var V = O.valoresEAP(orc);
    if (!V || V.ok === false || !V.porId) return falha("sem-valores", (V && V.motivo) || "valores de venda indisponíveis para este orçamento — o planejamento só pesa por preço de venda, nunca por custo.");
    if (obra.orcamentoId != null && obra.orcamentoId !== "" && String(obra.orcamentoId) !== String(orc.id)) {
      aviso("obra-outro-orcamento", "a obra está ligada a outro orçamento (" + obra.orcamentoId + "); este painel mede sobre o " + rotOrc + " — o número do Portal usa os preços do orçamento ligado à obra.");
    }

    /* ---- plano atual: o PLANO DE EXECUÇÃO da obra, quando existe ---- */
    var orcAt = orc, pl = e.plano || null;
    out.plano = { fonte: "orcamento", id: null, atualizadoEm: null, por: null };
    if (pl) {
      if (typeof pl !== "object") return falha("plano-invalido", "o plano de execução passado não é um registro — nada foi comparado.");
      if (pl.tipo != null && pl.tipo !== "plano") return falha("plano-invalido", "o registro passado como plano de execução é do tipo \"" + pl.tipo + "\" — passe o registro tipo \"plano\" da obra (ou nenhum).");
      if (pl.obraId != null && String(pl.obraId) !== String(obra.id)) return falha("plano-invalido", "o plano de execução passado é da obra " + pl.obraId + ", não desta (" + obra.id + ") — nada foi comparado.");
      if (!pl.cronograma || typeof pl.cronograma !== "object") return falha("plano-invalido", "o plano de execução da obra está sem cronograma — inicie o plano de novo a partir do orçamento.");
      // o plano sobre o orçamento é regra do CronoBase (espec 3.1) — uma só, sem cópia local que apodreça
      if (!CB || typeof CB.orcComPlano !== "function") return falha("modulos", SEM_CB);
      try { orcAt = CB.orcComPlano(orc, pl); } catch (eP) { orcAt = null; }
      if (!orcAt || orcAt.erro || !orcAt.cronograma || !arr(orcAt.etapas).length) {
        return falha("plano-invalido", (orcAt && orcAt.erro) || "não consegui aplicar o plano de execução da obra ao orçamento — abra o cronograma da obra e salve o plano de novo.");
      }
      /* ⚠ O `orcComPlano` entrega o cronograma DO PLANO por referência (é o
         que a tela edita e grava). O painel só LÊ: calcula sobre uma cópia,
         para nada daqui — nem uma normalização do motor — cair no plano vivo
         da obra, que sincroniza e vale para todo aparelho. */
      orcAt.cronograma = JSON.parse(JSON.stringify(orcAt.cronograma));
      out.plano = { fonte: "plano", id: pl.id == null ? "" : String(pl.id), atualizadoEm: pl.atualizadoEm || "", por: pl.por || "" };
      if (pl.orcamentoId != null && pl.orcamentoId !== "" && String(pl.orcamentoId) !== String(orc.id)) {
        aviso("plano-outro-orcamento", "o plano de execução foi iniciado sobre outro orçamento (" + pl.orcamentoId + "); este painel mede sobre o " + rotOrc + " — valem só as edições das etapas e subetapas que existem nos dois.");
      }
      var orf = orfasDoPlano(orc, pl.cronograma);
      if (orf) aviso("plano-orfas", orf + " edição(ões) do plano de execução apontam para etapas ou subetapas que não existem neste orçamento — não entram na conta.");
    }

    /* linha de base ATIVA: a regra do CronoBase (maior versão; empate por
       data e id, para todo aparelho escolher A MESMA) — uma régua só. Uma
       cópia aqui sem o desempate deixaria a ORDEM da lista decidir, e dois
       aparelhos comparariam a obra contra bases diferentes. */
    var base = null;
    if (arr(e.bases).length) {
      if (!CB || typeof CB.ativa !== "function") return falha("modulos", SEM_CB);
      base = CB.ativa(arr(e.bases), obra.id);
    }
    if (base) {
      /* duas bases da MESMA versão (congeladas ao mesmo tempo em aparelhos
         diferentes — o id é único por gravação, nenhuma some no merge): vale a
         ativa do CronoBase (a mais recente, a mesma em todo aparelho) e a
         pessoa fica sabendo que a outra existe (revisão 3, lente sync) */
      var gem = arr(e.bases).filter(function (b) { return !!b && b.tipo === "base" && String(b.obraId) === String(obra.id) && b.versao === base.versao && b.id !== base.id; });
      if (gem.length) {
        aviso("bases-gemeas", "outra linha de base v" + base.versao + " foi congelada ao mesmo tempo em outro aparelho (" + br(iso10(gem[0].criadaEm)) + (gem[0].por ? ", por " + gem[0].por : "") +
          (gem[0].motivo ? " — " + gem[0].motivo : "") + "). Vale a de " + br(iso10(base.criadaEm)) + (base.por ? ", por " + base.por : "") + (base.motivo ? " — " + base.motivo : "") +
          ", a mais recente; a outra fica no histórico. Para mudar, reprograme (nova base).");
      }
      var bv = baseVale(base, orc, e.orcamentos);
      if (!bv.ok) {
        out.baseAlheia = { id: base.id, versao: base.versao, orcamentoId: bv.orcamentoId, orcNumero: bv.orcNumero };
        aviso("base-outro-orcamento", "a linha de base v" + base.versao + " foi congelada sobre o orçamento " + (bv.orcNumero || bv.orcamentoId) + ", e a obra agora mede pelo " + rotOrc +
          ", que não é revisão dele — as etapas não são as mesmas, então o previsto, a situação e o IDP contra essa base não valem e não aparecem. Reprograme (nova base) a partir do plano atual.");
        base = null;
      }
    }
    if (base) out.base = { id: base.id, versao: base.versao, criadaEm: base.criadaEm || "", por: base.por || "", motivo: base.motivo || "",
      dataInicio: base.cal ? base.cal.dataInicio : "", dataFim: base.dataFim || "", totalDias: base.totalDias };

    /* ---- ÂNCORA: a obra é o centro (espec 3.2; crítica dinheiro #5 e #10).
       Início da obra > início congelado na base > início do plano/orçamento.
       ⚠ A data da PROPOSTA nunca passa por cima da da obra: numa proposta
       feita para abril em obra que começou em junho, todas as barras voltariam
       dois meses e toda etapa sairia "atrasada" por um artefato de data. ---- */
    var cronA = orcAt.cronograma || {}, prA = (cronA.params && typeof cronA.params === "object") ? cronA.params : {};
    var obraIni = iso10(obra.inicio), planIni = iso10(prA.dataInicio);
    var baseIni = base && base.cal ? iso10(base.cal.pedido || base.cal.dataInicio) : "";
    var ancora = obraIni || baseIni || planIni;
    var fonteAnc = obraIni ? "obra" : (baseIni ? "base" : (planIni ? out.plano.fonte : ""));
    out.ancora = ancora ? { data: ancora, fonte: fonteAnc } : null;
    var quem = out.plano.fonte === "plano" ? "o plano de execução" : "a proposta";
    if (obra.inicio != null && obra.inicio !== "" && !obraIni) aviso("inicio-invalido", "a data de início da obra (" + obra.inicio + ") não é uma data válida — corrija o cadastro da obra.");
    if (obraIni && planIni && obraIni !== planIni) aviso("inicio-diverge", "Início: obra " + br(obraIni) + " (" + quem + " dizia " + br(planIni) + ") — o planejamento conta a partir do início da obra.");
    if (!obraIni && ancora) {
      aviso("obra-sem-inicio", "a obra não tem data de início — o planejamento usou a data " + (fonteAnc === "base" ? "da linha de base" : (fonteAnc === "plano" ? "do plano de execução" : "do orçamento")) +
        " (" + br(ancora) + "). Informe o início da obra: é dele que a linha de base congela.");
    }
    if (!ancora) aviso("sem-inicio", "sem data de início — não dá para dizer se está atrasada. Informe o início da obra (ou o início no cronograma do orçamento); os três percentuais abaixo não dependem dela.");

    var calc = null;
    try { calc = typeof O.calcular === "function" ? O.calcular(orc) : null; } catch (eC) { calc = null; }
    var rA = null;
    if (ancora) {
      rA = C.estimar(orcAt, { dataInicio: ancora }, { eap: true, calc: calc, valores: V });
      if (rA && rA.exec && rA.exec.erro) aviso("arvore", rA.exec.erro);
    }

    /* ---- DIÁRIOS: a MESMA seleção do PDF e do Portal (`RDO.podeIrAoPortal`).
       ⚠ Nunca uma cópia da regra de status: ela já mudou uma vez (diário
       segurado na aprovação), e uma cópia deixaria entrar num número interno
       um diário que o cliente não vê. ---- */
    var doObra = arr(e.rdos).filter(function (d) { return !!d && String(d.obraId) === String(obra.id); });
    var pub = doObra.filter(function (d) { return Rd.podeIrAoPortal(d); });
    var ult = "";
    pub.forEach(function (d) { var k = iso10(d.data); if (k > ult) ult = k; });
    var segurados = doObra.length - pub.length;

    // ---- DATA DE CORTE: a escolhida; senão o último diário publicável; senão hoje (relógio injetável)
    var corte = "", fCorte;
    if (e.dataCorte != null && e.dataCorte !== "") {
      corte = iso10(e.dataCorte);
      if (!corte) return falha("corte-invalido", "data de corte inválida (" + e.dataCorte + ") — escolha uma data no calendário.");
      fCorte = "informada";
      if (corte > hoje) aviso("corte-futuro", "a data de corte (" + br(corte) + ") é depois de hoje (" + br(hoje) + ") — o executado só tem o que foi lançado até agora.");
    } else if (ult) { corte = ult; fCorte = "ultimoDiario"; }
    else { corte = hoje; fCorte = "hoje"; }
    out.dataCorte = corte; out.fonteCorte = fCorte;
    if (!pub.length) {
      aviso("sem-diarios", "nenhum diário desta obra foi ao Portal ainda" + (segurados ? " (" + segurados + " em rascunho ou aguardando aprovação não contam)" : "") +
        " — o executado sai só dos diários publicados; sem eles, tudo aparece como não iniciado. Publique os diários da obra.");
    } else if (segurados) {
      aviso("diarios-fora", segurados + " diário(s) desta obra ainda não foram ao Portal (rascunho ou aguardando aprovação) — não contam em nenhum dos números.");
    }

    /* ---- ETAPA OPCIONAL: com base, vale a escolha feita ao congelar (a
       mesma do VP/VA); sem base, a pedida (padrão: nenhuma, como a proposta) ---- */
    var opc;
    if (base) {
      opc = arr(base.opcionaisIncluidos).slice();
      if (e.opcionaisIncluidos != null && !mesmoConj(e.opcionaisIncluidos, opc)) {
        aviso("opcionais-base", "com linha de base, valem as etapas opcionais escolhidas ao congelá-la (" + (opc.length ? nomesEtapas(orc, opc) : "nenhuma") + ") — para mudar, reprograme (nova versão da linha de base).");
      }
    } else opc = arr(e.opcionaisIncluidos).slice();

    /* ---- as TRÊS RÉGUAS, na mesma data de corte ---- */
    var linhas = F.porServico(pub, obra.id, { ate: corte, precos: precosDoPortal(orc, e.atividadesDaObra, Ut, obra.id) });
    var real = CronoPlan.realizadoPorNo(orc, linhas, { valores: V, dataCorte: corte, opcionaisIncluidos: opc, calc: calc });
    if (!real || real.erro) return falha("sem-realizado", (real && real.erro) || "não consegui apurar o realizado da obra.");
    var K = out.kpis;
    K.executadoOrcamento = { pct: real.obra.pct, base: real.obra.base, rotulo: ROT_EXEC, itens: real.obra.itens, itensSemPeso: real.obra.itensSemPeso };
    var pf = F.pctObra(linhas), po = portalDaObra(Ut, obra, pf, e.medicoes);
    /* `servicos` (os lançados COM quantidade prevista — exatamente os que o
       `Fisico.ponderar` do Portal pondera) e `doOrcamento` (os mensuráveis do
       orçamento): o denominador que a tela escreve ao lado do número — "média
       simples dos 11 lançados (o orçamento tem 24)" — sem mudar a régua */
    K.portal = { pct: po.pct, fonte: po.fonte, base: pf.base, pctDiarios: pf.pct, ate: corte,
      servicos: typeof pf.itens === "number" ? pf.itens : null, doOrcamento: real.obra.itens,
      rotulo: po.fonte === "diario" ? ROT_PORTAL : (po.fonte === "manual" ? "no Portal do cliente (percentual gravado à mão no cadastro da obra)" :
        "no Portal do cliente (acumulado das medições aprovadas — os diários não têm serviço com quantidade lançado)") };
    if (po.fonte === "manual") {
      aviso("portal-manual", "o Portal do cliente mostra " + brNum(po.pct) + "% porque o cadastro da obra tem um percentual gravado à mão — pelos diários publicados seriam " +
        (pf.pct == null ? "—" : brNum(pf.pct) + "%") + ". Esse campo não tem tela de edição nesta versão; para o Portal voltar a seguir os diários, fale com o suporte.");
    }
    if (po.fonte !== "diario" && fCorte === "informada") aviso("portal-corte", "o número do Portal vem " + (po.fonte === "manual" ? "do percentual gravado à mão" : "das medições") + " e não tem data de corte — é o de hoje.");
    var md = medidoDaObra(Ut, obra.id, e.medicoes);
    K.medido = { pct: md.pct, rotulo: ROT_MEDIDO, emValor: md.emValor, boletins: md.boletins, depoisDoCorte: 0 };
    if (md.pct === null) aviso("medido-valor", "os boletins aprovados desta obra foram medidos em R$ (R$ " + brMoeda(md.emValor) + "), sem percentual — não dá para dizer quanto da obra isso é.");
    if (fCorte === "informada") {
      /* ⚠ o boletim TEM data: "não tem data de corte" era recado falso. O
         medido não é cortado na data (a régua é a do cartão da obra, sem
         data), e o card diz quantos boletins contados são de depois do corte */
      K.medido.depoisDoCorte = arr(e.medicoes).filter(function (m) {
        return !!m && m.obraId === obra.id && (m.status === "aprovada" || m.status === "paga") && iso10(m.data) > corte;
      }).length;
      aviso("medido-corte", "o medido por boletins não foi cortado na data — é o acumulado aprovado até hoje" +
        (K.medido.depoisDoCorte ? " (inclui " + K.medido.depoisDoCorte + " boletim(ns) com data depois de " + br(corte) + ")." : "."));
    }

    /* ---- PREVISTO × REALIZADO (confronto na mesma data) ---- */
    var conf = null;
    if (rA) {
      conf = CronoPlan.confrontoPorNo(base || null, rA, real, { dataCorte: corte, hoje: hoje, ultimoDiario: ult || null });
      if (conf && conf.erro) { aviso("confronto", conf.erro); conf = null; }
    }
    if (conf && conf.totais) {
      var T = conf.totais;
      /* previsto da camada FOLHA (a mesma do IDP). ⚠ Sem base ele sai rotulado
         "plano atual": ele muda a cada edição do plano, e o IDP só aparece com
         base (crítica: perto de 1 sozinho depois de reprogramar). */
      K.previstoNaData = T.previstoPct == null ? null : { pct: T.previstoPct, fonte: base ? "base" : out.plano.fonte, realPct: T.realPct,
        rotulo: base ? "Previsto na data (linha de base v" + base.versao + ")" : "Previsto na data (plano atual — ainda sem linha de base)" };
      if (base && T.IDP != null) K.idp = { valor: T.IDP, vp: T.VP, va: T.VA, rotulo: T.idpRotulo };
      K.situacao = (T.realPct == null || T.previstoPct == null) ? null : situacao(T.previstoPct, T.realPct, conf.toleranciaPP);
      K.situacaoContra = base ? "linha de base v" + base.versao : "plano atual (sem linha de base)";
      /* ⚠ a situação e o IDP comparam o executado PESADO COMO O PREVISTO (valor
         de cada subetapa, na base); o número de cima pesa cada serviço pelo
         valor de hoje. Quando divergem, a tela diz os dois — senão "54% ×
         previsto 60%" ao lado de "no prazo" parece conta errada. */
      if (T.realPct != null && real.obra.pct != null && Math.abs(T.realPct - real.obra.pct) >= 0.5) {
        aviso("regua-da-comparacao", "o previsto e a situação comparam o executado pesado pelo valor de cada subetapa" + (base ? " na linha de base v" + base.versao : "") +
          " (" + brNum(T.realPct) + "%); o executado de cima pesa cada serviço pelo valor de hoje (" + brNum(real.obra.pct) + "%" +
          (real.obra.base === "simples" ? ", em média simples — menos de 60% dos serviços têm valor" : "") + ").");
      }
      /* desvio de término da OBRA em dias úteis do calendário da base (+ =
         atraso): concluída → dia do diário que fechou o último serviço contra
         o último dia útil da base; em andamento → fim do plano atual contra o
         fim da base. Sem base não há contra o quê. */
      if (base) {
        var calB = calDaBase(base);
        if (calB) {
          if (real.obra.fimReal) K.desvioTerminoDias = indiceDe(calB, real.obra.fimReal, base.totalDias) - Math.max(0, base.totalDias - 1);
          else if (rA && rA.dataFim) K.desvioTerminoDias = indiceDe(calB, ch(rA.dataFim), base.totalDias) - base.totalDias;
        }
      }
    }

    /* ---- TÉRMINO: o do cadastro da obra × o da linha de base (sem base, o do
       plano atual). ⚠ Revisão 3, lente UX: o início já seguia a obra ("a obra
       é o centro"), o término não era comparado com nada — a base congelava
       onze meses depois do término digitado e a MESMA ficha dava duas
       respostas de prazo (Resumo: 18/12/2026; Cronograma: "adiantada" contra
       uma base que termina em 2027). Só aviso: o cadastro não muda sozinho. ---- */
    var tObra = iso10(obra.termino), tRef = "", tFonte = "";
    if (base && base.dataFim) { tRef = iso10(base.dataFim); tFonte = "a linha de base v" + base.versao; }
    else if (rA && rA.dataFim) { tRef = ch(rA.dataFim); tFonte = out.plano.fonte === "plano" ? "o plano de execução" : "o cronograma do orçamento"; }
    if (tObra && tRef && tObra !== tRef) {
      var duT = null, calT = base ? calDaBase(base) : null;
      if (calT) {
        var i1 = indiceDe(calT, tRef, base.totalDias), i0 = indiceDe(calT, tObra, base.totalDias);
        if (i1 != null && i0 != null && i0 >= 0) duT = i1 - i0;
      } else if (rA && typeof C.diaUtilDoCorte === "function") {
        var j1 = C.diaUtilDoCorte(rA, tRef), j0 = C.diaUtilDoCorte(rA, tObra);
        if (j1 != null && j0 != null) duT = j1 - j0;
      }
      out.termino = { obra: tObra, ref: tRef, fonte: tFonte, diasUteis: duT };
      aviso("termino-diverge", "Término: cadastro da obra " + br(tObra) + "; " + tFonte + " termina em " + br(tRef) +
        (duT ? " (" + Math.abs(duT) + " dia(s) útil(eis) " + (duT > 0 ? "depois" : "antes") + ")" : "") +
        " — a ficha da obra (Resumo) usa o do cadastro. Confira o prazo combinado; para o cadastro passar a ter o da linha de base, marque isso ao congelar ou reprogramar.");
    }

    /* ---- revisão MAIS NOVA do orçamento da obra: a obra continua medindo
       pelo orçamento ligado a ela, e a pessoa fica sabendo onde está a porta ---- */
    if (e.orcamentos && String(obra.orcamentoId || "") === String(orc.id)) {
      var filhosR = {}, novasR = [], filaR = [String(orc.id)], gR = 0;
      arr(e.orcamentos).forEach(function (o) { if (o && o.revisaoDe) (filhosR[String(o.revisaoDe)] = filhosR[String(o.revisaoDe)] || []).push(o); });
      while (filaR.length && gR++ < 500) { arr(filhosR[filaR.shift()]).forEach(function (o) { novasR.push(String(o.numero || o.id)); filaR.push(String(o.id)); }); }
      if (novasR.length) aviso("revisao-mais-nova", "o orçamento " + rotOrc + " tem revisão mais nova (" + novasR.slice(0, 3).join(", ") + (novasR.length > 3 ? " e mais " + (novasR.length - 3) : "") +
        ") — a obra planeja e mede pelo " + rotOrc + ", que é o ligado a ela. Para medir pela revisão, abra-a na aba Cronograma e use [Passar a obra para esta revisão] (a passagem é recusada enquanto houver boletim feito sobre o " + rotOrc + ").");
    }

    /* ---- tabela por nó e os 5 que pedem atenção ---- */
    if (conf) out.nos = conf.nos.map(noPainel);
    else {
      out.nos = real.ordem.filter(function (id) { return real.porNo[id].tipo !== "servico"; }).map(function (id) {
        var n = real.porNo[id];
        return noPainel({ id: n.id, tipo: n.tipo === "etapa" ? "etapa" : "folha", etapaId: n.etapaId, numero: n.numero, nome: n.nome,
          folha: n.tipo !== "etapa" || n.papel === "folha", valor: n.valor, base: null, atual: null, real: { ini: n.inicioReal, fim: n.fimReal },
          previstoPct: null, realPct: n.pct, desvioPP: null, desvioTerminoDias: null, situacao: null, opcionalFora: !!n.foraDoTotal });
      });
    }
    /* o NOME é o de agora (o do plano atual), não o gravado na base: renomear
       "Fundação" para "Fundações e contenções" deixava o painel com o nome
       velho até a próxima base, enquanto o orçamento e o Portal diziam o novo
       (o vínculo é pelo id, o % já era o mesmo). O nome da base fica em
       `nomeBase`, para o histórico. */
    if (rA && Array.isArray(rA.atividades)) {
      var nmAt = {};
      rA.atividades.forEach(function (a) { if (a && a.id != null && a.nome != null) nmAt[a.id] = String(a.nome); });
      out.nos.forEach(function (n) { if (own(nmAt, n.id) && nmAt[n.id] !== n.nome) { n.nomeBase = n.nome; n.nome = nmAt[n.id]; } });
    }
    out.atencao = out.nos.map(function (n, i) { return { n: n, i: i }; }).filter(function (x) {
      return x.n.folha && x.n.desvioPP != null && (x.n.situacao === "atrasada" || x.n.situacao === "atrasada (não iniciada)");
    }).sort(function (a, b) { return (a.n.desvioPP - b.n.desvioPP) || (n0(b.n.valor) - n0(a.n.valor)) || (a.i - b.i); }).slice(0, 5).map(function (x) {
      var n = x.n;
      return { id: n.id, numero: n.numero, nome: n.nome, previstoPct: n.previstoPct, realPct: n.realPct, desvioPP: n.desvioPP,
        situacao: n.situacao, valor: n.valor, desvioTerminoDias: n.desvioTerminoDias };
    });

    /* ---- o que ficou FORA da conta ---- */
    var FC = out.foraDaConta;
    FC.naoApropriadas = real.naoApropriadas; FC.semQuantidade = real.semQuantidade;
    FC.opcionaisFora = real.opcionaisFora.map(function (id) {
      var n = real.porNo[id];
      return { id: id, numero: n.numero, nome: n.nome, valor: r2(n0(n.valor)),
        msg: base ? "opcional não incluída na linha de base v" + base.versao + " — fora do avanço, do previsto e do IDP." : "opcional não incluída — fora do avanço (a proposta imprime opcional fora do total)." };
    });
    if (conf && base) {
      var vF = 0;
      FC.escopoForaDaBase = conf.foraDaBase.filter(function (x) { return !/^opcional/.test(x.motivo); });
      FC.escopoForaDaBase.forEach(function (x) { vF += n0(x.valor); });
      FC.valorForaDaBase = r2(vF);
      FC.msgForaDaBase = FC.escopoForaDaBase.length ? "escopo fora da linha de base (R$ " + brMoeda(r2(vF)) + ") — não entra no IDP." : null;
      FC.sumiramDoAtual = conf.sumiramDoAtual; FC.reagrupadas = conf.reagrupadas;
    }
    if (conf) conf.avisos.forEach(function (a) { out.avisos.push(a); });

    /* ---- CURVA S: base × plano atual × executado, num eixo só.
       Eixo = do 1º ao último mês de QUALQUER das três (a crítica dinheiro #3
       pedia "até o maior entre o fim da base e o último mês real": o
       `Cronograma.confronto` só percorre os meses do plano, e a obra atrasada
       além do fim da base sumia da curva justamente quando o atraso existe).
       ⚠ O plano atual também estende o eixo — reprogramado para depois da
       base, cortar o fim dele esconderia o prazo que a obra persegue.
       Planejado preso em 100 depois do fim; executado TRUNCADO no último mês
       com lançamento (nunca null no meio, nunca projetado). ---- */
    var curvaBase = base ? arr(base.curva) : [], curvaAtual = [];
    if (rA && Array.isArray(rA.atividades)) {
      var Vz = {}, foraE = {}, kz;
      real.opcionaisFora.forEach(function (id) { foraE[id] = true; });
      for (kz in V.porId) if (own(V.porId, kz)) Vz[kz] = V.porId[kz];
      rA.atividades.forEach(function (n) { if (own(foraE, n.etapaId)) Vz[n.id] = 0; });   // a mesma escolha de opcional do realizado e da base
      var perA = C.periodos(rA, { camada: "folha", valores: { ok: true, porId: Vz } });
      if (perA && perA.erro) aviso("curva", "curva do plano atual indisponível: " + perA.erro);
      else if (perA) curvaAtual = perA.lista;
    }
    var ks = [];
    [curvaBase, curvaAtual, real.serieMes].forEach(function (L) {
      arr(L).forEach(function (p) { var k = chMes(p); if (/^\d{4}-\d{2}$/.test(k)) ks.push(k); });
    });
    if (ks.length) {
      ks.sort();
      var eixo = mesesDe(ks[0], ks[ks.length - 1]), rots = eixo.map(rotMes);
      out.curva.eixo = eixo; out.curva.rotulos = rots;
      out.curva.base = base ? serieNoEixo(curvaBase, eixo) : [];
      out.curva.atual = serieNoEixo(curvaAtual, eixo);
      // o executado passa pelo MESMO leitor do cronograma impresso (`Cronograma.confronto`), agora no eixo estendido
      var cf = C.confronto({ lista: eixo.map(function (k, i) { return { ano: +k.slice(0, 4), mes: +k.slice(5, 7) - 1, rotulo: rots[i], acumPct: 0 }; }) }, real.serieMes);
      var ex = cf ? cf.linhas.map(function (l) { return l.realizado; }) : [], fimEx = -1, q;
      for (q = 0; q < ex.length; q++) if (ex[q] != null) fimEx = q;
      out.curva.executado = ex.slice(0, fimEx + 1).map(function (v) { return v == null ? 0 : v; });   // antes do 1º lançamento: nada feito
    }
    out.curva.fonteBase = base ? "linha de base v" + base.versao : null;
    out.curva.fonteAtual = out.plano.fonte === "plano" ? "plano de execução da obra" : "cronograma do orçamento";

    /* ---- CURVA PROJETADA: o ritmo MEDIDO nos diários levado ao eixo de meses.
       ⚠ A série semanal vem do `realizadoPorNo` (régua "executado sobre o
       orçamento"), a MESMA da curva executada. Medir o ritmo na régua do
       Portal (só os serviços já lançados) e desenhá-lo em cima de uma curva na
       régua do orçamento faria a projeção sair de um ponto que não existe no
       gráfico. ⚠ `tRef` é o término de referência (base, senão plano): é
       contra ele que a projeção diz adiantada/atrasada — nunca contra a data
       da proposta, que a obra pode ter deixado para trás. ---- */
    var pv = null;
    if (typeof F.previsao === "function") {
      pv = F.previsao({ periodos: arr(real.serieSemana), base: real.obra.base, pct: real.obra.pct },
        { pct: real.obra.pct, termino: tRef || "" });
    }
    var pj = projetarCurva(pv, out.curva.eixo, out.curva.executado);
    out.curva.projetado = pj.projetado;
    out.curva.projecao = pj.projecao;
    out.curva.projecaoMotivo = pj.motivo;
    if (!pj.projetado) {
      /* ⚠ o motivo fica SEMPRE em `curva.projecaoMotivo` (a legenda da curva
         precisa dele), mas o aviso só sobe quando há diário publicado: em obra
         sem diário nenhum o painel já diz isso em cima, e repetir vira ruído —
         aviso que a pessoa lê como formalidade é aviso que ela deixa de ler. */
      if (pub.length) {
        aviso("sem-projecao", "Curva projetada indisponível: " + pj.motivo +
          " A projeção sai do ritmo medido nos diários publicados — nunca de uma reta desenhada por cima do plano.");
      }
    } else {
      var PJ = pj.projecao;
      if (PJ.mesesAlemDoEixo) {
        /* ⚠ O RITMO DO AVISO É O QUE ENTROU NA CONTA, NÃO O DE TELA. Este
           aviso escreve o ritmo e a data de término na MESMA frase: com
           `PJ.ritmoSemanal` (2 casas do `Fisico`) uma obra na reta final dizia
           "No ritmo medido (0% por semana), a obra termina em 12/07/2027" —
           ritmo zero não termina obra nenhuma, e quem lê conclui que a conta
           está quebrada. `ritmoTexto` é a escrita honesta do `ritmoUsado`,
           publicada pelo `projetarCurva` logo acima. */
        aviso("projecao-alem", "No ritmo medido (" + PJ.ritmoTexto + "% por semana), a obra termina em " + br(PJ.dataProvavel) +
          " — " + PJ.mesesAlemDoEixo + " mês(es) além do último mês do plano desenhado.");
      }
      if (PJ.terminoReferencia && PJ.desvioDias != null && Math.abs(PJ.desvioDias) > 7) {
        aviso("projecao-desvio", "Término provável pelo ritmo medido: " + br(PJ.dataProvavel) + "; " + (tFonte || "a referência") + " termina em " + br(PJ.terminoReferencia) +
          " (" + Math.abs(PJ.desvioDias) + " dia(s) corridos " + (PJ.desvioDias > 0 ? "depois" : "antes") + "). Faixa: " +
          br(PJ.dataOtimista) + " (otimista) a " + br(PJ.dataPessimista) + " (pessimista).");
      }
    }

    /* ---- VALOR AGREGADO COMPLETO (VP/VA/IDP/VPR + CR/IDC/VC/ENT).
       O custo real chega INJETADO (`entrada.custoEtapa` = saída de
       `CustoEtapa.consolidar`): este arquivo é motor puro e não lê Store. ---- */
    if (conf) {
      var ceIn = e.custoEtapa;
      if (ceIn != null && (typeof ceIn !== "object" || !Array.isArray(ceIn.linhas))) {
        aviso("custo-formato", "o custo real da obra veio num formato que não é o de CustoEtapa.consolidar — o CR, o IDC e a ENT não saíram.");
        ceIn = null;
      }
      K.evm = evmDaObra(conf, ceIn || null, { comBase: !!base, ate: e.custoEtapaAte, dataCorte: corte });
      var EV = K.evm;
      if (base && EV.idcMotivo) aviso("sem-idc", "IDC e ENT indisponíveis: " + EV.idcMotivo);
      if (EV.cr > 0) {
        /* ⚠ o custo real NÃO é cortado na data: o `CustoEtapa` soma as
           despesas da obra inteiras. Mesma doutrina do "medido" por boletins —
           o recado diz a régua em vez de fingir que as duas datas batem. */
        if (!EV.ate) aviso("custo-corte", "o Custo Real não foi cortado na data: é o acumulado das despesas da obra até hoje, enquanto o previsto e o executado acima param em " + br(corte) + ".");
        else if (EV.ate !== corte) aviso("custo-corte", "o Custo Real foi apurado até " + br(EV.ate) + " e o previsto × executado até " + br(corte) + " — as duas metades não estão na mesma data.");
        if (EV.cobertura && EV.cobertura.pctApropriado != null && !EV.cobertura.suficiente) {
          aviso("custo-cobertura", "Só " + brNum(EV.cobertura.pctApropriado) + "% do gasto desta obra está apropriado em etapa (o mínimo para uma leitura por etapa é " + COBERTURA_MIN +
            "%). O CR, o IDC e a ENT acima valem para a obra INTEIRA — todo o gasto entra no Custo Real —, mas o custo por etapa não: as etapas aparecem com mais saldo do que têm." +
            (EV.avisosCusto.length ? " " + EV.avisosCusto.join(" ") : ""));
        }
      }
    }

    out.estado = !ancora ? "sem-inicio" : (!pub.length ? "sem-diarios" : "ok");
    return out;
  }

  /* mapa de verdade (o motor lê objeto; lista ou null não têm chave com nome) */
  function mapaDe(o, k) {
    var m = o && typeof o === "object" && !Array.isArray(o) ? o[k] : null;
    return (m && typeof m === "object" && !Array.isArray(m)) ? m : null;
  }
  /* espaço colapsado e pontas aparadas: o motivo vem de um modelo de IA, que
     devolve quebra de linha e espaço dobrado — bytes que ninguém lê */
  function motivoLimpo(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }

  /* Ver "O TETO DO PLANO DA OBRA É O TEXTO DA IA" acima.
     ⚠ MEXE NO OBJETO RECEBIDO (é o `cronograma` do plano, o mesmo que a tela
     edita pelo `_cronoAlvo`): cortar numa cópia deixaria a tela com um texto
     que o disco não tem e faria o recado voltar a cada gravação.
     Idempotente: rodar de novo não muda nada e não tem o que contar. */
  function cortarMotivos(cron) {
    var rep = { mexeu: false, total: 0, guardados: 0, encurtados: 0, semTexto: 0, removidos: 0, msg: null };
    if (!cron || typeof cron !== "object" || Array.isArray(cron)) return rep;
    function trata(dono, chave, ehEtapa) {
      /* ⚠ SÓ MEXE NO QUE ENTENDE. Motivo é texto; valor de outro formato veio
         de uma versão mais nova do app pelo sync e passa INTACTO, como o
         resto do cronograma desconhecido (a mesma doutrina do `iniciarPlano`:
         chave que esta versão não conhece viaja junto). */
      if (typeof dono[chave] !== "string") return;
      var t = motivoLimpo(dono[chave]);
      if (!t) { delete dono[chave]; rep.mexeu = true; return; }   // motivo em branco não é motivo
      rep.total++;
      if (rep.guardados < MOTIVOS_MAX) {
        rep.guardados++;
        if (t.length > MOTIVO_MAX) { t = t.slice(0, MOTIVO_MAX - 1) + "…"; rep.encurtados++; }
        if (t !== dono[chave]) { dono[chave] = t; rep.mexeu = true; }
        return;
      }
      if (ehEtapa) {
        // ⚠ a chave FICA: é dela que a tabela tira a marca de IA da etapa
        if (dono[chave] !== MOTIVO_SEM_TEXTO) { dono[chave] = MOTIVO_SEM_TEXTO; rep.semTexto++; rep.mexeu = true; }
      } else { delete dono[chave]; rep.removidos++; rep.mexeu = true; }
    }
    var mE = mapaDe(cron, "iaMotivos");
    if (mE) Object.keys(mE).forEach(function (k) { trata(mE, k, true); });
    var sub = mapaDe(cron, "sub"), mS = sub ? mapaDe(sub, "iaMotivos") : null;
    if (mS) Object.keys(mS).forEach(function (k) { trata(mS, k, false); });
    /* `exec.anterior[etapaId].ia` é o motivo da duração guardada ao ligar o
       modo executivo: ele volta para `iaMotivos` ao desligar, então é motivo
       de ETAPA e segue a mesma regra da marca */
    var ex = mapaDe(cron, "exec"), ant = ex ? mapaDe(ex, "anterior") : null;
    if (ant) Object.keys(ant).forEach(function (k) {
      var a = ant[k];
      if (a && typeof a === "object" && !Array.isArray(a) && a.ia != null) trata(a, "ia", true);
    });
    if (rep.encurtados || rep.semTexto || rep.removidos) {
      var partes = [];
      if (rep.encurtados) partes.push(rep.encurtados + " motivo(s) encurtado(s) em " + MOTIVO_MAX + " caracteres");
      if (rep.semTexto) partes.push(rep.semTexto + " etapa(s) ficaram com a marca da IA sem o texto");
      if (rep.removidos) partes.push(rep.removidos + " motivo(s) de subetapa saíram");
      rep.msg = "O plano de execução guarda no máximo " + MOTIVOS_MAX + " motivos da IA (o planejamento de todas as obras da empresa sincroniza num documento só de 1 MiB, e sem espaço não dá para congelar linha de base): " +
        partes.join("; ") + ". As durações, as dependências e a marca de quem definiu cada prazo continuam inteiras, e o texto completo segue no orçamento.";
    }
    return rep;
  }

  var CronoPlan = {
    SITUACOES: SITUACOES,
    TETO_BASE: TETO_BASE,
    TETO_ENTIDADE: TETO_ENTIDADE,
    COBERTURA_MIN: COBERTURA_MIN,
    ROTULOS_EVM: ROT_EVM,
    /* CURVA PROJETADA (pura): recebe a saída de `Fisico.previsao`, o eixo de
       meses da curva e o executado truncado; devolve
       `{projetado (alinhado ao eixo, null quando não dá), projecao, motivo}`.
       Ver o comentário grande acima — sem ritmo medido, `projetado` é null e
       o motivo é o produto. */
    projetarCurva: projetarCurva,
    /* VALOR AGREGADO COMPLETO (pura): `confrontoPorNo` + `CustoEtapa.consolidar`
       → VP/VA/IDP/VPR em venda e CR/VC/IDC/ENT/EPT em custo direto, cada um
       com o rótulo do que significa. Ver o ⚠ das duas réguas acima. */
    valorAgregado: evmDaObra,
    MOTIVO_MAX: MOTIVO_MAX,
    MOTIVOS_MAX: MOTIVOS_MAX,
    MOTIVO_SEM_TEXTO: MOTIVO_SEM_TEXTO,
    /* corta os TEXTOS de motivo da IA de um `cronograma` de plano de obra —
       nunca a rede. Quem chama: CronoBase.salvarPlano (ver lá). */
    cortarMotivos: cortarMotivos,
    bytes: function (x) { return bytesUtf8(typeof x === "string" ? x : JSON.stringify(x)); },
    calendarioDaBase: calDaBase,
    /* a linha de base vale para este orçamento? (dele ou de uma revisão
       anterior dele). O painel e o KPI do Last Planner usam a MESMA regra. */
    baseVale: baseVale,
    /* data ("AAAA-MM-DD") do k-ésimo dia útil de uma base */
    dataDaBase: function (base, k) { var c = calDaBase(base); return c && k != null ? ch(c.dia(k)) : null; },
    previstoLinear: previsto,

    /* =================================================================
       1.7 LINHA DE BASE — o plano congelado com que a obra se compara.

       Entrada: `r` = `Cronograma.estimar(orc, {dataInicio: obra.inicio},
       {eap: true})`; `meta` = {obraId, versao, orcamentoId, orcNumero,
       motivo, por, id?}; `opts` = {valores (OBRIGATÓRIO), dataInicio
       (OBRIGATÓRIO, o início da OBRA), opcionaisIncluidos:[etapaIds],
       agora}.

       Saída: o registro COMPACTO (só "AAAA-MM-DD", números e texto curto),
       ou {erro: texto}. Só ETAPA + FOLHAS — sem serviço: o documento da
       nuvem é UM para todas as bases da empresa (nuvem.js:937), e 300
       serviços × 5 reprogramações × 20 obras não cabem em 1 MiB. As datas de
       cada nó saem de `cal` + offset (`dataDaBase`), nunca de Date gravado.

       ⚠ TETO DE 40 KB por versão, medido em UTF-8. Passou: erro com o
       tamanho — a base não é gravada pela metade.
       ⚠ `dataInicio` TEM DE SER O DO `r`: congelar com a data da obra um
       cronograma calculado com a data da proposta guardaria as datas da
       proposta com a etiqueta da obra. Recusa e diz as duas datas.
       ⚠ Etapa OPCIONAL fica FORA por padrão (segue a proposta, que imprime
       opcional fora do total — decisão de produto pendente do Rogério): sem
       valor, sem curva, listada em `opcionaisFora`. Entra quem vier em
       `opts.opcionaisIncluidos`.
       ================================================================= */
    congelarBase: function (r, meta, opts) {
      meta = meta || {}; opts = opts || {};
      var C = Cr();
      if (!C) return { erro: "motor do cronograma não carregado (js/cronograma.js)." };
      if (!r || !arr(r.etapas).length) return { erro: "orçamento sem etapas — não há plano para congelar." };
      if (r.exec && r.exec.erro) return { erro: r.exec.erro };
      if (!Array.isArray(r.atividades)) return { erro: "o cronograma não tem a árvore EAP — calcule com Cronograma.estimar(orc, {dataInicio: início da obra}, {eap: true}) antes de congelar." };
      var V = lerValores(opts.valores);
      if (V.erro) return { erro: V.erro };
      var di = iso10(opts.dataInicio);
      if (!di) return { erro: "informe a data de início da obra — a linha de base congela as datas a partir dela." };
      if (!r.dataInicio || typeof r.dataInicio.getTime !== "function" || isNaN(r.dataInicio.getTime())) return { erro: "o cronograma não tem data de início calculada." };
      var diR = ch(r.dataInicio), aj = r.feriados && r.feriados.ajusteInicio;
      // o motor empurra um início em fim de semana/feriado para o 1º dia útil — isso é a mesma data pedida
      if (diR !== di && !(aj && aj.de === di && aj.para === diR)) {
        return { erro: "o cronograma foi calculado com início em " + br(diR) + ", e a obra começa em " + br(di) +
          " — recalcule com a data da obra antes de congelar (senão a linha de base guardaria as datas da proposta)." };
      }
      var obraId = meta.obraId == null ? "" : String(meta.obraId);
      if (!obraId) return { erro: "linha de base sem obra — ela pertence a uma obra (obraId)." };
      var versao = meta.versao;
      if (!(typeof versao === "number" && versao >= 1 && versao % 1 === 0)) return { erro: "versão da linha de base inválida (" + versao + ") — use 1, 2, 3…" };
      var motivo = String(meta.motivo == null ? "" : meta.motivo).trim().slice(0, 200);
      if (versao > 1 && !motivo) return { erro: "informe o motivo da reprogramação — a versão " + versao + " substitui a " + (versao - 1) + " na comparação da obra." };

      var P = V.porId, incl = {}, opcIncl = [], opcFora = [], foraSet = {};
      arr(opts.opcionaisIncluidos).forEach(function (id) { incl[id] = true; });
      r.atividades.forEach(function (n) {
        if (n.tipo !== "etapa" || !n.opcional) return;
        if (own(incl, n.id)) opcIncl.push(n.id); else { opcFora.push(n.id); foraSet[n.id] = true; }
      });
      var nos = [], Vc = {}, valorTot = 0, semValor = 0;
      r.atividades.forEach(function (n) {
        if (n.tipo !== "etapa" && n.tipo !== "subetapa" && n.tipo !== "soltos") return;   // serviço não entra (ver acima)
        if (own(foraSet, n.etapaId)) return;
        if (!own(P, n.id)) { semValor++; return; }
        var v = r2(n0(P[n.id]));
        var nm = String(n.nome == null ? "" : n.nome).replace(/\s+/g, " ").trim();
        if (nm.length > 60) nm = nm.slice(0, 59) + "…";
        nos.push({ id: n.id, t: n.tipo === "etapa" ? "e" : "f", e: n.etapaId, n: String(n.numero), nm: nm, i: n.inicio, f: n.fim, v: v });
        Vc[n.id] = v;
        if (n.tipo === "etapa") valorTot += v;
      });
      /* ⚠ valores de OUTRO orçamento (ou de antes de uma edição) não casam os
         ids: congelar assim gravaria nó sem valor e um IDP torto para sempre */
      if (semValor) return { erro: semValor + " nó(s) da EAP sem valor de venda — os valores não são deste orçamento. Recalcule Orcamento.valoresEAP(orc) e congele de novo." };

      // curva no formato de `periodos().lista` — é o que `Cronograma.confronto` lê
      var per = C.periodos(r, { camada: "folha", valores: { ok: true, porId: Vc } });
      if (per.erro) return { erro: per.erro };
      var curva = per.lista.map(function (p) {
        return { ano: p.ano, mes: p.mes, rotulo: p.rotulo, chave: p.ano + "-" + pad2(p.mes + 1), valor: r2(p.valor), acumPct: r2(p.acumPct) };
      });

      /* feriados do período (e 6 meses depois, para o desvio de término de
         obra atrasada ainda contar feriado), só os que caem em dia de obra */
      var dpw = (r.params && r.params.diasUteisSemana) || 5, fimFer = new Date(r.dataFim.getTime());
      fimFer.setDate(fimFer.getDate() + 183);
      var limFer = ch(fimFer), mapa = (r.feriados && r.feriados.mapa) || {};
      var feriados = Object.keys(mapa).filter(function (k) {
        var d = dataLocal(k);
        return d && k >= diR && k <= limFer && C.diaUtil(d, dpw, null);
      }).sort();

      var cal = { dataInicio: diR, diasUteisSemana: dpw, feriados: feriados };
      if (di !== diR) cal.pedido = di;
      var agora = opts.agora == null ? new Date() : (typeof opts.agora === "number" ? new Date(opts.agora) : (typeof opts.agora === "string" ? new Date(opts.agora) : opts.agora));
      var base = {
        id: meta.id ? String(meta.id) : "base_" + obraId + "_v" + versao,
        tipo: "base", obraId: obraId,
        orcamentoId: meta.orcamentoId == null ? "" : String(meta.orcamentoId),
        orcNumero: meta.orcNumero == null ? "" : String(meta.orcNumero).slice(0, 40),
        versao: versao, motivo: motivo,
        criadaEm: (agora && !isNaN(agora.getTime())) ? agora.toISOString() : "",
        por: meta.por == null ? "" : String(meta.por).slice(0, 60),
        cal: cal, totalDias: r.totalDias, dataFim: ch(r.dataFim), valor: r2(valorTot),
        opcionaisIncluidos: opcIncl, opcionaisFora: opcFora,
        nos: nos, curva: curva
      };
      var b = bytesUtf8(JSON.stringify(base));
      if (b > TETO_BASE) {
        return { erro: "linha de base grande demais (" + kb(b) + " KB; o limite é " + kb(TETO_BASE) + " KB por versão, porque todas as linhas de base da empresa sincronizam juntas num documento de 1 MiB). Agrupe subetapas pequenas ou encurte os nomes das etapas e subetapas e congele de novo.", bytes: b };
      }
      return base;
    },

    /* Resumo de uma versão ANTIGA da base — a PORTA da trava de espaço
       (`cabeNaEntidade`). Fica: cabeçalho, calendário, prazo, valor e as
       ETAPAS com janela e valor (sem nome: o nome atual vem do orçamento pelo
       id). Sai: as folhas, os nomes e a curva mensal. Medido no pior caso de
       uma empresa (20 obras × 5 versões × 30 etapas × 90 subetapas, nomes de
       60 caracteres): 100 bases cheias dão ~2,4 MB — nenhum formato cabe em
       1 MiB; com a ativa cheia e as antigas assim resumidas, ~0,77 MB.
       ⚠ Base resumida NÃO serve para o IDP (sem folhas, o total cairia na
       camada etapa calado): `confrontoPorNo` a recusa. O detalhe só é lido
       na base ATIVA, que nunca se resume. */
    resumirBase: function (base) {
      if (!base || typeof base !== "object") return base;
      var c = JSON.parse(JSON.stringify(base)), nF = 0;
      c.nos = arr(c.nos).filter(function (n) { if (n.t === "f") { nF++; return false; } return true; })
        .map(function (n) { return { id: n.id, t: n.t, e: n.e, n: n.n, i: n.i, f: n.f, v: n.v }; });
      c.resumida = true; c.folhasResumidas = nF; c.mesesResumidos = arr(c.curva).length;
      delete c.curva;
      return c;
    },

    /* A entidade de planejamento vai INTEIRA num documento da nuvem. Antes de
       acrescentar um registro: cabe abaixo de 900 KB? Não cabendo, a recusa
       diz os números e a porta — nunca grava e deixa a nuvem parar calada. */
    cabeNaEntidade: function (lista, novo) {
      var antes = bytesUtf8(JSON.stringify(arr(lista))), depois = bytesUtf8(JSON.stringify(arr(lista).concat(novo ? [novo] : [])));
      var cabe = depois <= TETO_ENTIDADE;
      return { cabe: cabe, bytesAntes: antes, bytesDepois: depois, teto: TETO_ENTIDADE,
        msg: cabe ? null : "o planejamento das obras desta empresa passaria de " + kb(depois) + " KB (limite " + kb(TETO_ENTIDADE) + " KB, antes do teto de 1 MiB da nuvem). Resuma as versões antigas das linhas de base (Histórico de bases) ou encerre o planejamento de obras concluídas e tente de novo." };
    },

    /* =================================================================
       1.8 REALIZADO POR NÓ — "executado sobre o orçamento".

       `linhas` = `Fisico.porServico(rdosPublicaveis, obraId, {ate: corte})`
       — a MESMA seleção de diários do PDF e do Portal (`RDO.podeIrAoPortal`).
       ⚠ Diário cru não passa: não daria para saber se ele foi ao cliente.
       `opts` = {valores (OBRIGATÓRIO), dataCorte "AAAA-MM-DD",
       opcionaisIncluidos:[etapaIds], calc (Orcamento.calcular, só para a
       numeração)}.

       Serviço: pct = min(100, executado ÷ quantidade do ORÇAMENTO). O
       previsto do diário é a quantidade no dia em que o serviço entrou nele
       (e o Fisico guarda o maior já visto): quando divergem, `qtdDivergente`
       e o recado com os dois números. Quantidade 0 / pendente → fora
       (`semQuantidade` se foi lançado). Nunca lançado → 0%.
       Nó (folha, etapa, obra): `Fisico.ponderar` EXECUTADO sobre TODOS os
       serviços mensuráveis do nó — a mesma régua do Portal (financeira com
       ≥ 60% dos serviços com valor, senão simples; null sem serviço
       mensurável), só que com o orçamento inteiro no denominador. Chamar a
       função do Fisico, e não copiá-la, é o que impede as duas de divergirem.
       ================================================================= */
    realizadoPorNo: function (orc, linhas, opts) {
      opts = opts || {};
      function falha(msg) {
        return { ok: false, erro: msg, obra: { pct: null, base: "indisponivel", itens: 0, itensSemPeso: 0, inicioReal: null, fimReal: null },
          porNo: {}, ordem: [], naoApropriadas: [], semQuantidade: [], serieMes: [], serieSemana: [], opcionaisFora: [], dataCorte: null, ultimoLancamento: null };
      }
      var C = Cr(), A = Av(), F = Fi();
      if (!C || !A || !F || !F.ponderar || !A.chaveServico) return falha("módulos do avanço não carregados (cronograma.js, avancoservico.js, fisico.js).");
      if (!orc || !arr(orc.etapas).length) return falha("orçamento sem etapas — não há o que medir.");
      var V = lerValores(opts.valores);
      if (V.erro) return falha(V.erro);
      if (linhas != null && !Array.isArray(linhas)) return falha("as linhas do realizado precisam ser a lista de Fisico.porServico.");
      linhas = linhas || [];
      for (var li = 0; li < linhas.length; li++) {
        var L0 = linhas[li];
        if (!(L0 && typeof L0 === "object" && L0.chave && Array.isArray(L0.lancamentos))) {
          return falha("passe as linhas consolidadas de Fisico.porServico(diários publicáveis, obraId, {ate: corte}) — diário cru não entra aqui, porque não dá para saber se ele foi ao Portal.");
        }
      }
      var corte = "";
      if (opts.dataCorte != null && opts.dataCorte !== "") {
        corte = iso10(opts.dataCorte);
        if (!corte) return falha("data de corte inválida (" + opts.dataCorte + ") — use AAAA-MM-DD.");
      }
      var P = V.porId, nos = C.eap(orc, opts.calc || null);
      var porNo = {}, ordem = [], porChave = {}, porItem = {};
      function chaveDe(s) { return A.chaveServico({ origem: "orcamento", refId: String(s.itemId), unidade: s.unidade }); }
      nos.forEach(function (n) {
        var o = { id: n.id, tipo: n.tipo, papel: n.papel, paiId: n.paiId, etapaId: n.etapaId, numero: n.numero, nome: n.nome,
          valor: own(P, n.id) ? n0(P[n.id]) : 0, pct: null, base: "indisponivel", itens: 0, itensSemPeso: 0, inicioReal: null, fimReal: null };
        if (n.tipo === "etapa") o.opcional = !!n.opcional;
        if (n.tipo === "servico") {
          // subEtapaGravada: o rastro para o confronto achar os serviços de uma subetapa da base apagada depois
          o.itemId = n.itemId; o.quantidade = n.quantidade; o.unidade = n.unidade; o.semBase = !!n.semBase; o.subEtapaGravada = n.subEtapaGravada || "";
          o.executado = 0; o.lancamentos = []; o.ligado = false;
          if (n.itemId != null && n.itemId !== "") { porItem[String(n.itemId)] = o; porChave[chaveDe(o)] = o; }
        }
        porNo[n.id] = o; ordem.push(n.id);
      });

      var nao = [], ult = "", semData = 0;
      linhas.forEach(function (l) {
        var lancs = l.lancamentos.filter(function (x) {
          var d = String((x && x.data) || "").slice(0, 10);
          return !corte || !d || d <= corte;   // ⚠ o corte vale aqui também: linha montada sem `ate` não pode trazer o futuro
        });
        var exec = 0;
        lancs.forEach(function (x) {
          exec += n0(x.qtd);
          var d = String(x.data || "").slice(0, 10);
          if (d && d > ult) ult = d;
        });
        exec = r2(exec);
        var s = own(porChave, l.chave) ? porChave[l.chave] : null;
        if (!s) {
          var ref = String(l.refId == null ? "" : l.refId).trim(), it = ref && own(porItem, ref) ? porItem[ref] : null, motivo, msg;
          if (!ref) { motivo = "sem-vinculo"; msg = "serviço lançado sem vínculo com item do orçamento (lista livre ou cronograma) — não entra no executado sobre o orçamento."; }
          else if (!it) { motivo = "fora-do-orcamento"; msg = "item fora do orçamento vinculado (removido numa revisão, ou de outro orçamento)."; }
          else if (A.chaveServico({ origem: l.origem, refId: ref, unidade: it.unidade }) === chaveDe(it)) {
            motivo = "unidade"; msg = "unidade do diário (" + (l.unidade || "sem unidade") + ") diferente da do item no orçamento (" + (it.unidade || "sem unidade") + ") — quantidades de unidades diferentes não se somam.";
          } else { motivo = "origem"; msg = "origem \"" + (l.origem || "(vazia)") + "\" não é o orçamento — o vínculo por item só vale para serviço puxado do orçamento."; }
          nao.push({ chave: l.chave, refId: ref, origem: l.origem || "", numero: l.numero || "", descricao: l.descricao || "",
            unidade: l.unidade || "", executado: exec, motivo: motivo, msg: msg });
          return;
        }
        s.ligado = true;
        s.executado = r2(s.executado + exec);
        s.previstoDiario = Math.max(n0(s.previstoDiario), n0(l.previsto));
        lancs.forEach(function (x) { s.lancamentos.push({ data: String(x.data || "").slice(0, 10), qtd: n0(x.qtd) }); });
      });

      var semQtd = [];
      ordem.forEach(function (id) {
        var s = porNo[id];
        if (s.tipo !== "servico") return;
        s.lancamentos.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
        s.lancamentos.forEach(function (x) { if (!x.data) semData++; });
        if (s.semBase) {
          if (s.executado > 0) semQtd.push({ id: s.id, numero: s.numero, nome: s.nome, unidade: s.unidade, executado: s.executado,
            msg: "serviço lançado nos diários, mas sem quantidade no orçamento — fica fora do avanço até ter quantidade." });
          return;
        }
        var q = s.quantidade;
        s.pct = pct1(Math.min(100, (s.executado / q) * 100));
        s.base = "servico"; s.itens = 1;
        s.excedeu = s.executado > q;
        var acum = 0;
        s.lancamentos.forEach(function (x) {
          if (!x.data || !(x.qtd > 0)) return;
          if (!s.inicioReal) s.inicioReal = x.data;
          acum += x.qtd;
          if (!s.fimReal && acum >= q - 1e-9) s.fimReal = x.data;
        });
        if (s.ligado && Math.abs(n0(s.previstoDiario) - q) > 0.005) {
          s.qtdDivergente = true;
          s.msgQtd = "o Portal do cliente usa " + brNum(n0(s.previstoDiario)) + " (quantidade do diário); o orçamento diz " + brNum(q) + ".";
        }
      });

      // serviços de cada nó: folha = filhos diretos; etapa = todos os da etapa
      var servDe = {};
      ordem.forEach(function (id) {
        var s = porNo[id];
        if (s.tipo !== "servico") return;
        (servDe[s.paiId] = servDe[s.paiId] || []).push(s);
        if (s.paiId !== s.etapaId) (servDe[s.etapaId] = servDe[s.etapaId] || []).push(s);
      });
      function agrega(servs) { return agregar(F, servs); }
      ordem.forEach(function (id) {
        var n = porNo[id];
        if (n.tipo === "servico") return;
        var a = agrega(servDe[id]);
        n.pct = a.pct; n.base = a.base; n.itens = a.itens; n.itensSemPeso = a.itensSemPeso; n.inicioReal = a.inicioReal; n.fimReal = a.fimReal;
      });

      /* OBRA: sem as etapas opcionais não incluídas (a proposta imprime
         opcional fora do total). Elas continuam com o próprio % por nó,
         marcadas `foraDoTotal`. */
      var incl = {}, opcFora = [], opcIncl = [];
      arr(opts.opcionaisIncluidos).forEach(function (id) { incl[id] = true; });
      var obraServs = [];
      ordem.forEach(function (id) {
        var n = porNo[id];
        if (n.tipo === "etapa" && n.opcional) {
          if (own(incl, id)) opcIncl.push(id); else { opcFora.push(id); n.foraDoTotal = true; }
        }
      });
      ordem.forEach(function (id) {
        var s = porNo[id];
        if (s.tipo === "servico" && !s.semBase && !(porNo[s.etapaId].foraDoTotal)) obraServs.push(s);
      });
      var obra = agrega(obraServs);

      /* SÉRIE MENSAL na régua sobre o orçamento: cada lançamento acrescenta o
         quanto AINDA cabia no serviço (aparado em 100% ao longo do tempo,
         como `Fisico.serie`), dividido pelo peso do orçamento inteiro. Mês sem
         lançamento entre o 1º e o último herda o acumulado (nunca null no
         meio); depois do último mês com dado a série ACABA — não se projeta
         realizado no futuro. */
      var fin = obra.base === "financeira", pesoTot = 0, eventos = [];
      obraServs.forEach(function (s) {
        var w = fin ? (s.valor > 0 ? s.valor : 0) : 1;
        pesoTot += w;
        s.lancamentos.forEach(function (x) { if (x.data) eventos.push({ s: s, w: w, data: x.data, qtd: x.qtd }); });
      });
      eventos.sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : 0); });
      var acumS = {}, balde = {}, baldeS = {}, ordemS = [], meses = [];
      eventos.forEach(function (ev) {
        if (!(ev.w > 0)) return;
        var q = ev.s.quantidade, antes = acumS[ev.s.id] || 0, depois = antes + ev.qtd;
        acumS[ev.s.id] = depois;
        var ganho = ev.w * (Math.min(1, depois / q) - Math.min(1, antes / q));
        var m = ev.data.slice(0, 7);
        balde[m] = (balde[m] || 0) + ganho;
        /* ⚠ a SEMANA usa a chave do `Fisico` (a data da segunda-feira), que é
           a mesma do Last Planner e da série do Portal. Duas numerações de
           semana no mesmo app fariam o ritmo da projeção discordar do PPC da
           equipe sobre a mesma semana. */
        var sk = typeof F.balde === "function" ? F.balde(ev.data, "semana") : "";
        if (sk) { if (!own(baldeS, sk)) ordemS.push(sk); baldeS[sk] = (baldeS[sk] || 0) + ganho; }
      });
      var chavesM = Object.keys(balde).sort(), serieMes = [];
      if (chavesM.length && pesoTot > 0) {
        var y = +chavesM[0].slice(0, 4), mm = +chavesM[0].slice(5, 7) - 1, fimM = chavesM[chavesM.length - 1], acumP = 0, guarda = 0;
        while (guarda++ < 1200) {
          var k = y + "-" + pad2(mm + 1);
          var pp = balde[k] || 0;
          acumP += pp;
          serieMes.push({ chave: k, rotulo: F.rotuloBalde ? F.rotuloBalde(k, "mes") : k,
            pctPeriodo: pct1((pp / pesoTot) * 100), pctAcumulado: pct1((acumP / pesoTot) * 100) });
          if (k >= fimM) break;
          mm++; if (mm > 11) { mm = 0; y++; }
        }
        meses = serieMes;
      }

      /* SÉRIE SEMANAL — o insumo do ritmo medido (`Fisico.previsao`, a curva
         projetada). ⚠ SÓ AS SEMANAS COM LANÇAMENTO, sem preencher buraco:
         é a forma que o `Fisico.serie` produz e para a qual a `previsao` foi
         escrita. Ela conta quantas semanas COM lançamento existem para decidir
         se há histórico (mínimo 3) e mede o ritmo pelo CALENDÁRIO entre a
         primeira e a última (as paradas ficam no denominador, que é o que
         impede a projeção bonita e falsa). Herdar o acumulado nos meses, como
         a série mensal faz, é certo para desenhar a curva e ERRADO aqui: uma
         obra com 2 lançamentos e 8 semanas de parada pareceria ter 10 semanas
         de histórico e passaria no mínimo de 3. */
      var serieSem = [];
      if (ordemS.length && pesoTot > 0) {
        ordemS.sort();
        var acumW = 0;
        ordemS.forEach(function (kw) {
          var pw = baldeS[kw] || 0;
          acumW += pw;
          serieSem.push({ chave: kw, rotulo: typeof F.rotuloBalde === "function" ? F.rotuloBalde(kw, "semana") : kw,
            pctPeriodo: pct1((pw / pesoTot) * 100), pctAcumulado: pct1((acumW / pesoTot) * 100) });
        });
      }

      return {
        ok: true, regua: "orcamento",
        rotulo: "Executado sobre o orçamento (diários publicáveis)",
        dataCorte: corte || null, ultimoLancamento: ult || null,
        obra: obra, porNo: porNo, ordem: ordem,
        naoApropriadas: nao, semQuantidade: semQtd, serieMes: meses, serieSemana: serieSem,
        opcionaisFora: opcFora, opcionaisIncluidos: opcIncl, lancamentosSemData: semData
      };
    },

    /* =================================================================
       1.9 CONFRONTO POR NÓ + IDP.

       `base` = registro de `congelarBase` (ou null → compara com o PLANO
       ATUAL, `semBase: true`); `r` = o plano atual (`estimar` com {eap:
       true}, ancorado no início da obra); `real` = `realizadoPorNo` com a
       MESMA data de corte; `opts` = {dataCorte, ultimoDiario, hoje,
       toleranciaPP, opcionaisIncluidos (sem base; padrão = as do realizado —
       pedir outras é erro)}.

       Data de corte: a informada; senão a do realizado; senão o último
       diário publicável; senão o último lançamento; senão `hoje`. Sempre
       devolvida (também no erro).
       ⚠ Sem base e sem data de início no plano: ERRO, nunca uma situação —
       o motor ancoraria o plano em "hoje", o previsto na data do último
       diário sairia 0% e toda obra andando viraria "adiantada".
       ⚠ Realizado apurado com outro corte: ERRO. Previsto numa data e
       executado noutra é a "adiantada" falsa da crítica.

       Previsto do nó = linear em dias úteis do calendário da BASE (feriados
       congelados nela) dentro da janela da BASE. Totais só na camada FOLHA
       (etapa sem subetapa entra como a própria folha) — somar etapa, folha e
       serviço contaria o mesmo dinheiro duas ou três vezes, e cada camada dá
       um IDP diferente. VP = Σ vBase × previsto; VA = Σ vBase × real (valor
       agregado clássico: o valor da BASE nos dois); IDP = VA ÷ VP.
       ================================================================= */
    confrontoPorNo: function (base, r, real, opts) {
      opts = opts || {};
      var C = Cr();
      var hoje = opts.hoje != null ? iso10(opts.hoje) : ch(new Date());
      var corte = iso10(opts.dataCorte), fonte = "informada";
      if (!corte && real && real.dataCorte) { corte = real.dataCorte; fonte = "realizado"; }
      if (!corte && iso10(opts.ultimoDiario)) { corte = iso10(opts.ultimoDiario); fonte = "ultimoDiario"; }
      if (!corte && real && real.ultimoLancamento) { corte = real.ultimoLancamento; fonte = "ultimoLancamento"; }
      if (!corte) { corte = hoje; fonte = "hoje"; }
      var semBase = !base;
      function falha(msg) { return { erro: msg, dataCorte: corte, fonteCorte: fonte, semBase: semBase, nos: [], totais: null, foraDaBase: [], sumiramDoAtual: [], reagrupadas: [], avisos: [] }; }
      if (!C) return falha("motor do cronograma não carregado (js/cronograma.js).");
      if (!real) return falha("sem o realizado — apure com CronoPlan.realizadoPorNo(orc, linhas, {valores, dataCorte}).");
      if (real.erro) return falha(real.erro);
      if (real.dataCorte && real.dataCorte !== corte) {
        return falha("o realizado foi apurado até " + br(real.dataCorte) + " e o corte pedido é " + br(corte) + " — apure o realizado com a mesma data de corte (senão o previsto sai numa data e o executado noutra).");
      }
      if (!real.dataCorte && real.ultimoLancamento && real.ultimoLancamento > corte) {
        return falha("o realizado tem lançamento em " + br(real.ultimoLancamento) + ", depois do corte " + br(corte) + " — apure o realizado com a data de corte " + br(corte) + ".");
      }
      var temR = !!(r && Array.isArray(r.atividades));
      var rComData = temR && !!(r.params && r.params.dataInicio) && !!r.dataInicio;
      var ref, cal, teto, avisos = [], opcSB = {}, foraSB = [];
      if (semBase) {
        if (!r || !arr(r.etapas).length) return falha("orçamento sem etapas — não há plano para comparar.");
        if (r.exec && r.exec.erro) return falha(r.exec.erro);
        if (!temR) return falha("o cronograma não tem a árvore EAP — calcule com Cronograma.estimar(orc, {dataInicio: início da obra}, {eap: true}).");
        if (!rComData) return falha("sem data de início — não dá para dizer se está atrasada. Informe o início da obra.");
        cal = C.calendario(r); teto = r.totalDias;
        /* ⚠ ETAPA OPCIONAL NÃO CONTRATADA fica FORA do avanço também sem
           linha de base — a MESMA escolha do realizado (e da proposta, que
           imprime opcional fora do total). Sem isto, na mesma obra o realizado
           dizia 54,2% e o confronto 44,4% (IDP 0,444 × 0,542): R$ 1.000 que o
           cliente não contratou entravam como "atrasada (não iniciada)" e a
           obra nunca passava de (100 − peso da opcional)%. */
        var pedO = opts.opcionaisIncluidos != null ? arr(opts.opcionaisIncluidos) : null;
        var doReal = Array.isArray(real.opcionaisIncluidos) ? real.opcionaisIncluidos : null;
        if (pedO && doReal && pedO.slice().sort().join("|") !== doReal.slice().sort().join("|")) {
          return falha("o realizado foi apurado com as etapas opcionais [" + doReal.join(", ") + "] e o confronto pediu [" + pedO.join(", ") +
            "] — apure o realizado com as mesmas opcionais (senão o executado e o previsto somam escopos diferentes).");
        }
        var inclO = {};
        (pedO || doReal || []).forEach(function (id) { inclO[id] = true; });
        r.atividades.forEach(function (n) { if (n.tipo === "etapa" && n.opcional && !own(inclO, n.id)) opcSB[n.id] = true; });
        ref = [];
        r.atividades.forEach(function (n) {
          if (n.tipo !== "etapa" && n.tipo !== "subetapa" && n.tipo !== "soltos") return;
          var rn = own(real.porNo, n.id) ? real.porNo[n.id] : null;
          if (own(opcSB, n.etapaId)) { if (n.tipo === "etapa") foraSB.push({ n: n, rn: rn }); return; }
          ref.push({ id: n.id, t: n.tipo === "etapa" ? "e" : "f", e: n.etapaId, n: String(n.numero), nm: n.nome, i: n.inicio, f: n.fim, v: rn ? n0(rn.valor) : 0 });
        });
      } else {
        if (!base.cal || !Array.isArray(base.nos)) return falha("linha de base ilegível (sem calendário ou sem nós) — congele de novo.");
        // ⚠ sem as folhas, o IDP cairia na camada etapa sem ninguém ver (ver resumirBase)
        if (base.resumida) return falha("a versão " + base.versao + " da linha de base está resumida (sem subetapas) — o previsto × realizado usa a base ativa.");
        cal = calDaBase(base); teto = base.totalDias;
        if (!cal) return falha("linha de base com data de início inválida (" + (base.cal && base.cal.dataInicio) + ").");
        ref = base.nos;
        if (temR && !rComData) avisos.push({ tipo: "atual-sem-data", msg: "o plano atual não tem data de início — as datas \"atual\" ficam em branco. Informe o início da obra." });
      }
      var k = indiceDe(cal, corte, teto);
      var tol = opts.toleranciaPP != null ? n0(opts.toleranciaPP) : ((r && r.exec && r.exec.toleranciaPP > 0) ? r.exec.toleranciaPP : 1);
      var porAtiv = {};
      if (temR) r.atividades.forEach(function (n) { porAtiv[n.id] = n; });
      function dataDe(i) { return i == null ? null : ch(cal.dia(i)); }
      function idx(iso) { return iso ? indiceDe(cal, iso, teto) : null; }

      // folhas da referência: t "f" + etapa sem folha sob ela
      var temFolha = {}, idsRef = {}, folhaRef = {};
      ref.forEach(function (n) { idsRef[n.id] = n; if (n.t === "f") temFolha[n.e] = true; });
      ref.forEach(function (n) { if (n.t === "f" || !own(temFolha, n.id)) folhaRef[n.id] = true; });

      /* ⚠ SERVIÇO DE HOJE → FOLHA DA BASE. A base guarda etapa e folha, não
         serviço; o % de cada folha da base sai dos serviços de HOJE que eram
         dela — e não do nó de hoje com o mesmo id. Sem isto, apagar as
         subetapas depois de congelar (itens intactos e executados, que o
         `calcular` passa a tratar como soltos) derrubava o IDP de 0,542 para
         0,231 e o recado dizia que a subetapa "não existe mais no orçamento".
         Regra, por etapa que existe na base:
          - na base a etapa ERA a folha → todo serviço dela conta nela;
          - o item grava a subetapa de origem (`subEtapaGravada`), mesmo apagada
            → a folha da base com esse id;
          - senão, o pai de hoje, se for folha da base;
          - senão, solto de hoje e a base tinha o grupo "N.g" → o grupo.
         Nada casa por nome, descrição ou valor. Serviço que não cai em folha
         nenhuma é escopo fora da linha de base (listado com o valor). Limite
         declarado: item MUDADO de uma subetapa da base para outra conta onde
         está hoje. */
      var Fm = Fi(), servBase = null, nMap = {}, vNM = {}, servNovos = [], servDeHoje = {};
      if (!semBase && Fm && Fm.ponderar) {
        servBase = {};
        // serviços de cada nó de HOJE (folha: os filhos; etapa: todos os da etapa) — a mesma partição do realizado
        arr(real.ordem).forEach(function (id) {
          var s = real.porNo[id];
          if (!s || s.tipo !== "servico") return;
          (servDeHoje[s.paiId] = servDeHoje[s.paiId] || []).push(id);
          if (s.paiId !== s.etapaId) (servDeHoje[s.etapaId] = servDeHoje[s.etapaId] || []).push(id);
        });
        var folhasBaseDe = {};
        ref.forEach(function (n) { if (n.t === "f") (folhasBaseDe[n.e] = folhasBaseDe[n.e] || {})[n.id] = true; });
        arr(real.ordem).forEach(function (id) {
          var s = real.porNo[id];
          if (!s || s.tipo !== "servico" || !own(idsRef, s.etapaId)) return;   // etapa que a base não tem: o nó dela vai para "fora"
          var E = s.etapaId, fb = own(folhasBaseDe, E) ? folhasBaseDe[E] : null, alvo = null;
          if (!fb) alvo = own(folhaRef, E) ? E : null;
          else if (s.subEtapaGravada && own(fb, s.subEtapaGravada)) alvo = s.subEtapaGravada;
          else if (own(fb, s.paiId)) alvo = s.paiId;
          else if ((s.paiId === E || s.paiId === E + "~g") && own(fb, E + "~g")) alvo = E + "~g";
          if (alvo) { (servBase[alvo] = servBase[alvo] || []).push(s); nMap[s.paiId] = (nMap[s.paiId] || 0) + 1; }
          else { vNM[s.paiId] = (vNM[s.paiId] || 0) + n0(s.valor); if (own(idsRef, s.paiId)) servNovos.push(s); }
        });
      }

      var lista = [], sumiram = [], reagrupadas = [], semValor = [], VP = 0, VA = 0, vTot = 0, nF = 0;
      ref.forEach(function (n) {
        var rn = own(real.porNo, n.id) ? real.porNo[n.id] : null, an = own(porAtiv, n.id) ? porAtiv[n.id] : null;
        var servs = (servBase && own(folhaRef, n.id)) ? (servBase[n.id] || []) : null;
        /* estrutura igual à de hoje (os mesmos serviços no nó de mesmo id): o
           número é o do realizado, sem recalcular — só a folha que MUDOU de
           serviços é remontada pela regra acima */
        var mesmo = !!(rn && servs && servs.map(function (s) { return s.id; }).sort().join("|") === (servDeHoje[n.id] || []).slice().sort().join("|"));
        var rr = (servs && servs.length && !mesmo) ? agregar(Fm, servs) : rn, reag = !!(servs && servs.length && !rn);
        var prev = previsto(n.i, n.f, k), rp, sit, marco = !(n.f > n.i);
        if (!(n.v > 0)) { rp = null; sit = "sem valor orçado"; }
        else if (!rr) { rp = 0; sit = situacao(prev, 0, tol); }
        else if (rr.pct == null) { rp = null; sit = "sem serviço mensurável"; }
        else { rp = rr.pct; sit = situacao(prev, rp, tol); }
        var o = {
          id: n.id, tipo: n.t === "e" ? "etapa" : "folha", etapaId: n.e, numero: n.n, nome: n.nm, folha: own(folhaRef, n.id),
          valor: n.v, previstoPct: pct1(prev), realPct: rp, desvioPP: rp == null ? null : pct1(rp - prev),
          base: semBase ? null : { ini: dataDe(n.i), fim: dataDe(n.f) },
          atual: an && rComData && an.dataInicio ? { ini: ch(an.dataInicio), fim: ch(an.dataFim) } : null,
          real: { ini: rr ? rr.inicioReal : null, fim: rr ? rr.fimReal : null },
          desvioTerminoDias: null, situacao: sit
        };
        /* desvio de término em DIAS ÚTEIS do calendário de referência
           (positivo = atraso): concluído → dia do diário que fechou o nó
           contra o último dia útil planejado; em andamento → fim do plano
           atual contra o fim da base. */
        if (o.real.fim) o.desvioTerminoDias = idx(o.real.fim) - (marco ? n.f : n.f - 1);
        else if (!semBase && o.atual) o.desvioTerminoDias = idx(o.atual.fim) - n.f;
        if (reag) {
          o.reagrupada = true;
          reagrupadas.push({ id: n.id, numero: n.n, nome: n.nm, valor: n.v, servicos: servs.length,
            msg: "foi reagrupada depois da linha de base — o avanço dela entra pelos " + servs.length + " serviço(s) que eram dela (o item guarda a subetapa de origem)." });
        } else if (!rn && !semBase) { o.sumiuDoAtual = true; sumiram.push({ id: n.id, numero: n.n, nome: n.nm, valor: n.v, msg: "está na linha de base e não existe mais no orçamento — o previsto conta, o executado vale 0." }); }
        if (rp == null) semValor.push(n.id);
        if (own(folhaRef, n.id) && rp != null) {
          VP += n.v * prev / 100; VA += n.v * rp / 100; vTot += n.v; nF++;
        }
        lista.push(o);
      });

      /* escopo que está no orçamento de hoje e não na base: fora do IDP,
         listado com o valor. Folha nova cuja etapa era, na base, uma folha
         inteira não entra na lista — o valor dela já está na etapa da base. */
      var fora = [], vFora = 0, opcF = {};
      if (semBase) {
        foraSB.forEach(function (x) {
          var nn = x.n, an = own(porAtiv, nn.id) ? porAtiv[nn.id] : null, v = x.rn ? n0(x.rn.valor) : 0;
          lista.push({ id: nn.id, tipo: "etapa", etapaId: nn.etapaId, numero: String(nn.numero), nome: nn.nome, folha: nn.papel === "folha",
            valor: v, previstoPct: null, realPct: x.rn ? x.rn.pct : null, desvioPP: null, base: null,
            atual: an && rComData && an.dataInicio ? { ini: ch(an.dataInicio), fim: ch(an.dataFim) } : null,
            real: { ini: x.rn ? x.rn.inicioReal : null, fim: x.rn ? x.rn.fimReal : null }, desvioTerminoDias: null,
            situacao: "opcional fora do avanço", foraDaBase: true, opcionalFora: true });
          fora.push({ id: nn.id, numero: String(nn.numero), nome: nn.nome, valor: r2(v), motivo: "opcional não incluída — não conta no avanço" });
          vFora += v;
        });
      } else {
        arr(base.opcionaisFora).forEach(function (id) { opcF[id] = true; });
        arr(real.ordem).forEach(function (id) {
          var x = real.porNo[id];
          if (!x || x.tipo === "servico" || own(idsRef, id)) return;
          var an = own(porAtiv, id) ? porAtiv[id] : null;
          // nó novo cujos serviços TODOS eram de folhas da base (ver a remontagem acima): não é escopo novo
          var soReagrupado = (nMap[id] || 0) > 0 && !own(vNM, id);
          lista.push({ id: id, tipo: x.tipo === "etapa" ? "etapa" : "folha", etapaId: x.etapaId, numero: x.numero, nome: x.nome,
            folha: x.tipo !== "etapa" || x.papel === "folha", valor: x.valor, previstoPct: null, realPct: x.pct, desvioPP: null,
            base: null, atual: an && rComData && an.dataInicio ? { ini: ch(an.dataInicio), fim: ch(an.dataFim) } : null,
            real: { ini: x.inicioReal, fim: x.fimReal }, desvioTerminoDias: null,
            situacao: soReagrupado ? "serviços da linha de base reagrupados" : "fora da linha de base", foraDaBase: !soReagrupado });
          var ehFolha = x.tipo === "subetapa" || x.tipo === "soltos" || (x.tipo === "etapa" && x.papel === "folha");
          if (!ehFolha || own(folhaRef, x.etapaId) || soReagrupado) return;
          var mot = own(opcF, x.etapaId) ? "opcional não incluída na linha de base" : "escopo fora da linha de base";
          // só o valor dos serviços que NÃO eram da base (os outros já contam na folha de origem)
          var vx = own(vNM, id) ? vNM[id] : n0(x.valor);
          fora.push({ id: id, numero: x.numero, nome: x.nome, valor: r2(vx), motivo: mot });
          vFora += vx;
        });
        // serviço novo pendurado num nó que JÁ era da base (ex.: solto novo numa etapa reorganizada)
        servNovos.forEach(function (s) {
          fora.push({ id: s.id, numero: s.numero, nome: s.nome, valor: r2(n0(s.valor)), motivo: "serviço fora da linha de base" });
          vFora += n0(s.valor);
        });
      }
      var IDP = VP > 0 ? Math.round((VA / VP) * 1000) / 1000 : null;
      var tot = {
        camada: "folha", folhas: nF, valorBase: r2(vTot), VP: r2(VP), VA: r2(VA), IDP: IDP,
        idpRotulo: semBase ? "contra o plano atual (sem linha de base)" : "contra a linha de base v" + base.versao,
        previstoPct: vTot > 0 ? pct1((VP / vTot) * 100) : null, realPct: vTot > 0 ? pct1((VA / vTot) * 100) : null
      };
      tot.desvioPP = tot.realPct == null ? null : pct1(tot.realPct - tot.previstoPct);
      if (real.naoApropriadas && real.naoApropriadas.length) avisos.push({ tipo: "nao-apropriadas", msg: real.naoApropriadas.length + " linha(s) de diário fora do avanço sobre o orçamento (sem vínculo, fora do orçamento ou unidade diferente)." });
      if (real.lancamentosSemData) avisos.push({ tipo: "sem-data", msg: real.lancamentosSemData + " lançamento(s) sem data: contam no percentual, mas não entram na curva mensal." });
      if (reagrupadas.length) avisos.push({ tipo: "reagrupadas", msg: reagrupadas.length + " subetapa(s) da linha de base foram reagrupadas depois dela (" +
        reagrupadas.slice(0, 3).map(function (x) { return x.numero; }).join(", ") + ") — o avanço delas entra pelos serviços que eram delas." });
      return {
        dataCorte: corte, fonteCorte: fonte, semBase: semBase,
        baseId: semBase ? null : base.id, baseVersao: semBase ? null : base.versao,
        indiceCorte: k, toleranciaPP: tol,
        nos: lista, totais: tot,
        foraDaBase: fora, valorForaDaBase: r2(vFora),
        msgForaDaBase: !fora.length ? null : (semBase
          ? "etapa(s) opcional(is) não incluída(s) (R$ " + brMoeda(r2(vFora)) + ") — fora do avanço e do IDP; para contar, apure o realizado e o confronto com opcionaisIncluidos."
          : "escopo fora da linha de base (R$ " + brMoeda(r2(vFora)) + ") — não entra no IDP."),
        sumiramDoAtual: sumiram, reagrupadas: reagrupadas, semValor: semValor, avisos: avisos
      };
    },

    /* =================================================================
       3.2 PAINEL DA OBRA — previsto × realizado, pronto para desenhar.

       Quem desenha (a aba "cronograma" da ficha da obra, a sub-aba Previsto ×
       Realizado do orçamento e o módulo "Cronograma da obra") só chama isto
       e desenha o que volta: nenhuma conta mora na tela.

       `entrada` = {
         orc          o orçamento ligado à obra (obrigatório);
         obra         {id, nome, inicio "AAAA-MM-DD", pctExecutado?, orcamentoId?};
         plano        registro crono_obra tipo "plano" da obra, ou null;
         bases        registros tipo "base" da obra (qualquer ordem: vale a
                      de MAIOR versão);
         rdos         diários (a seleção publicável é feita AQUI, pelo
                      `RDO.podeIrAoPortal` — passe todos);
         medicoes     boletins (filtrados aqui por obraId);
         atividadesDaObra  `Gestao._atividadesDaObra(obra.id)` — só entra no
                      número do Portal, que também pesa por ela;
         custoEtapa   saída de `CustoEtapa.consolidar({obraId, orcamento,
                      financeiro, compras})` — o CUSTO REAL da obra. Sem ela
                      o painel sai inteiro, só sem CR/IDC/ENT (com o motivo).
                      ⚠ Este arquivo é motor puro: o custo chega INJETADO,
                      nunca lido do Store aqui;
         custoEtapaAte  "AAAA-MM-DD" até quando o custo acima foi apurado.
                      Ausente = "até hoje", e o painel DIZ isso — o
                      `CustoEtapa` não corta na data, e previsto numa data com
                      custo noutra é a comparação torta de sempre;
         hoje         relógio injetável (Date | "AAAA-MM-DD"); padrão: agora;
         dataCorte    "AAAA-MM-DD"; padrão: o último diário publicável, senão hoje;
         opcionaisIncluidos  [etapaIds] — só sem base (com base vale a dela);
         Cronograma, Fisico, RDO, Orcamento, Util, CronoBase — injetáveis
                      (teste); ausentes = os globais.
       }

       Devolve SEMPRE a forma inteira (a tela nunca quebra lendo) com
       `estado` ∈ ok | sem-diarios | sem-inicio (esses três com números) ou,
       com `erro` em PT-BR, modulos | sem-obra | sem-orcamento | sem-etapas |
       sem-valores | plano-invalido | corte-invalido | sem-realizado | falha.

       ⚠ AS TRÊS RÉGUAS VÃO JUNTAS, cada uma com o rótulo: "Executado sobre
       o orçamento" (a nova, denominador = orçamento inteiro), "no Portal do
       cliente" (a mesma conta do snapshot — e o rótulo diz se lá está o
       percentual manual ou o das medições) e "Medido (boletins aprovados)"
       (a do cartão da obra). O engenheiro precisa responder ao cliente que
       liga com o número da tela DELE (memória "seis réguas para o avanço").
       ⚠ Realizado, Portal e previsto saem da MESMA data de corte.
       ⚠ IDP só com linha de base; previsto sem base sai rotulado "plano atual".
       ⚠ `curva.projetado` é a TERCEIRA CURVA (o ritmo medido nos diários) e
       vem `null` — com o motivo em `avisos` — sempre que não houver ritmo:
       nunca uma reta desenhada por cima do plano.
       ⚠ `kpis.evm` traz o valor agregado completo, com as DUAS RÉGUAS
       separadas e rotuladas: VP/VA/IDP/VPR em preço de venda, CR/VC/IDC/ENT
       em custo direto. Ver o ⚠ do `evmDaObra`.
       ================================================================= */
    montarPainel: function (entrada) {
      var e = (entrada && typeof entrada === "object") ? entrada : {}, antes = INJ;
      INJ = { Cronograma: e.Cronograma || null, Fisico: e.Fisico || null };
      try { return painel(e); }
      catch (err) {
        /* a ficha da obra desenha o painel no meio de outras abas: exceção
           aqui não pode levar a ficha junto — mas também não some calada */
        var f = formaDoPainel();
        f.estado = "falha";
        f.erro = "não consegui montar o previsto × realizado da obra (" + String((err && err.message) || err) + ").";
        return f;
      }
      finally { INJ = antes; }
    }
  };

  global.CronoPlan = CronoPlan;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoPlan;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

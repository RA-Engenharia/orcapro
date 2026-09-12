/* =====================================================================
 * histograma.js — HISTOGRAMA DE MÃO DE OBRA E DE EQUIPAMENTO
 *
 * Responde a pergunta que o cronograma físico-financeiro NÃO responde:
 * "quantas pessoas de cada profissão eu preciso ter na obra em cada semana
 * (ou mês), e em que período isso vira um pico impossível?". É o gráfico com
 * que se dimensiona alojamento, refeição, EPI, ônibus e contratação — e o
 * único que mostra o pico ANTES de ele acontecer.
 *
 * ⚠ POR QUE ISTO NÃO É O "FRENTES (MÉDIA MENSAL)" QUE JÁ EXISTE.
 * `Cronograma.periodos` sabe DIAS-EQUIPE, não sabe de quantas pessoas a
 * equipe é feita (o ⚠ em js/cronograma.js:220 cravou essa régua). Converter
 * R$/dia-equipe em gente seria inventar o número que a medição contestada
 * derruba. Aqui a pessoa só nasce de HORA-HOMEM de composição real: o
 * `hhDoItem` do js/execucao.js, que lê os coeficientes do analítico SINAPI
 * (recursivo nas sub-composições). Serviço sem Hh NÃO vira pessoa: ele sai do
 * gráfico, entra na lista `semBase` e o resultado DIZ quantos ficaram de fora.
 * Nunca misturar as duas fontes sem dizer qual é qual.
 *
 * ⚠ O TOTAL DE HORAS É SINAPI; A DISTRIBUIÇÃO DELAS NO TEMPO, NÃO. O numerador
 * (Hh) sai da composição. O denominador é a BARRA do serviço, e ela vem do
 * `Cronograma._itemEd` — cuja própria `fonte` é "categoria" (heurística de
 * descrição), "custoMO" (R$ ÷ R$/dia-equipe) ou "custoEstimado". MEDIDO
 * (11/09/2026), MESMO serviço, MESMOS 80 Hh de composição: com custoMO de
 * R$ 20/m² a barra sai com 3 dias e o pico com 3,33 pessoas; com R$ 5/m², 1 dia
 * e 10 pessoas; pela descrição ("Alvenaria de bloco"), 8 dias e 1,25 pessoa.
 * Oito vezes de diferença no número que dimensiona alojamento, refeição e
 * ônibus — e nenhuma delas veio de produtividade. Nos 51 orçamentos reais dos
 * backups, 752 de 752 serviços que viram pessoa têm a barra dimensionada por
 * heurística, e 933 de 1.073 ainda DIVIDEM a janela do pai com outro serviço
 * (a fatia de cada um sai das equipe-dias, que são heurísticas). Por isso
 * `cobertura.prazo` conta a fonte do PRAZO serviço a serviço, `cobertura`
 * publica DUAS fontes separadas (`fonteHh` e `fontePrazo`) e o resultado AVISA
 * quando o pico depende de prazo estimado. ⚠ Nunca voltar a declarar uma fonte
 * só: o Hh é medido, o pico é medido ÷ estimado.
 *
 * ⚠ MOTOR PURO. Sem DOM, sem Store, sem custo. Recebe o resultado de
 * `Cronograma.estimar(orc, null, {eap:true})` e um provedor de Hh injetado;
 * devolve números e rótulos. Não há CUSTO DIRETO em lugar nenhum da saída:
 * este desenho vai a documento que o cliente lê, e custo direto não entra em
 * documento do cliente (⚠ mesma regra do cabeçalho de js/cronopdf.js). O único
 * R$ que trafega é o valor de VENDA que o motor do cronograma já pôs no nó
 * (`ctx.valores`), e ele existe só para dizer quanto do orçamento ficou FORA do
 * gráfico — `cobertura.valor` e `semBase[].valor`. ⚠ O teste varre a SAÍDA
 * inteira atrás de chave de custo: varrer o texto-fonte atrás de nomes que este
 * arquivo nunca teve seria um assert que passa nos dois mundos.
 *
 * ⚠ EQUIPAMENTO: O CRITÉRIO É A UNIDADE, NUNCA A CATEGORIA. Medido na base
 * MG real (10.454 composições, 11/09/2026): a MESMA linha de máquina aparece
 * com `categoria` "EQ", "MAT" ou "MO" conforme o gerador — a retroescavadeira
 * CHP vem como "MO" em 395 linhas e o guindauto como "MAT" em 395. O que não
 * mente é a UNIDADE: CHP (custo horário produtivo) e CHI (improdutivo) só
 * existem para equipamento, e NENHUMA das 8.611 linhas com essas unidades é
 * mão de obra ("COM ENCARGOS") — medido: 0. Por isso equipamento aqui é
 * "unidade CHP ou CHI e não é linha de MO", e as horas de máquina somam
 * CHP + CHI (o tempo em que a máquina fica presa ao serviço).
 * ⚠ E O OPERADOR CONTINUA SENDO PESSOA. O Hh dele já vem por recursão no
 * `Execucao.hhDoItem` (medido: a composição 94880, 100 m, devolve OPERADOR DE
 * ESCAVADEIRA 14,87 Hh) — ele fica no histograma de gente, que é onde se
 * conta prato de comida e vaga de alojamento. Aqui ficam as HORAS DE MÁQUINA.
 * Sem provedor de equipamento (`opc.analitico`/`opc.eqDoItem`), o resultado
 * diz que NÃO deu para separar, em vez de deixar a tela supor que não há
 * máquina na obra.
 *
 * ⚠ "NÃO TEM" É DIFERENTE DE "NÃO DEU PARA CONFERIR" — e a frase que sai daqui
 * decide se alguém aluga escavadeira ou contrata pedreiro. Três coisas produzem
 * ZERO no gráfico e pedem ações opostas: (1) a base analítica da UF não está
 * carregada; (2) o provedor de Hh/equipamento LANÇOU exceção (contada em
 * `cobertura.falhasProvedor`, nunca engolida calada); (3) a composição está na
 * base e realmente não tem aquela linha. Este motor separa as três e só usa
 * frase AFIRMATIVA sobre o orçamento no caso (3). Roteiro do defeito: com a
 * base vazia o motor dizia "Nenhum serviço deste orçamento tem hora-homem de
 * composição" para um item com o código SINAPI 87495 — que tem mão de obra.
 * É o "erro educado esconde defeito", e contraria o §7 do CLAUDE.md: se o
 * sistema não consegue verificar algo, ele DIZ que não consegue.
 *
 * ⚠ NÃO HÁ parseNum NESTE ARQUIVO, DE PROPÓSITO. A memória "réplica de parser
 * apodrece" (33 módulos copiando Util.parseNum, dois deles errando em direções
 * opostas) vale aqui: nada nesta entrada é texto de dinheiro. A quantidade vai
 * crua para o provedor de Hh (que já tem o parser certo) e tudo o que este
 * motor soma já sai numérico do motor do cronograma.
 * ===================================================================== */
(function (global) {
  "use strict";

  function fin(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }
  function r2(v) { return Math.round(fin(v) * 100) / 100; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* chave local "AAAA-MM-DD". ⚠ nunca `toISOString`: em UTC-3 ele volta um dia
     (mesma razão do `Cronograma._ch`). */
  function chDia(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function dm(d) { return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2); }

  /* unidade em chave tolerante a grafia ("H", "h", "CHP", "chp."). Mesma ideia
     do `unKeyEx` do js/execucao.js; aqui sem acento nenhum a tratar, porque as
     unidades que interessam (H, CHP, CHI) são ASCII na base inteira. */
  function unKey(u) {
    return String(u == null ? "" : u).toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  // ⚠ MESMO critério do js/analitico.js e do js/execucao.js: linha de hora com
  // encargos é mão de obra pura. Se as três regras divergirem, a mesma linha
  // vira pessoa num módulo e máquina no outro.
  var RE_MO = / COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/;
  function ehMoPura(txt) { return RE_MO.test(String(txt == null ? "" : txt).toUpperCase()); }

  /* Nome do equipamento sem o sufixo de regime: "... - CHP DIURNO. AF_06/2015"
     e "... - CHI DIURNO. AF_06/2015" são a MESMA máquina em dois regimes
     (medido na MG: 169 dos 175 equipamentos aparecem nos dois). Sem juntar,
     a legenda do gráfico teria a mesma escavadeira duas vezes com metade das
     horas em cada. */
  function nomeEquip(desc) {
    var s = String(desc == null ? "" : desc).toUpperCase().replace(/\s+/g, " ").trim();
    s = s.replace(/\s*-\s*CH[PI]\s*(DIURNO|NOTURNO)?\s*\.?\s*(AF_\d+\/\d+)?\s*$/, "");
    s = s.replace(/\s*\.?\s*AF_\d+\/\d+\s*$/, "");
    return s.replace(/[\s.\-]+$/, "").trim() || "EQUIPAMENTO";
  }

  /* jornada: aceita número ou texto ("8", "8,8"). ⚠ Fora da faixa (0, 24] o
     motor NÃO adivinha: devolve 0, e quem chamou marca "padrão" na saída — uma
     jornada de 0 dividiria o Hh por zero e imprimiria Infinity pessoas. */
  function jornadaDe(v) {
    var n = (typeof v === "number") ? v : parseFloat(String(v == null ? "" : v).replace(",", "."));
    return (isFinite(n) && n > 0 && n <= 24) ? n : 0;
  }

  function segundaDe(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // getDay(): 0=domingo..6=sábado. Domingo pertence à semana que começou na
    // segunda ANTERIOR (convenção ISO) — senão um domingo trabalhado (obra de
    // 7 dias) abriria um balde de 1 dia só para ele.
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var MES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  /* teto de pessoas: aceita número ou texto BR, como a jornada. ⚠ A guarda era
     `typeof === "number"` e o `<input>` da tela entrega TEXTO: com
     tetoPessoas:"3" o motor devolvia teto null, acimaDoTeto vazio e NENHUM
     aviso. Numa tela que pergunta "o pico cabe no meu canteiro?", silêncio
     lê-se como "cabe". Devolve 0 quando não é número de pessoas válido, e quem
     chamou avisa. */
  function tetoDe(v) {
    var n = (typeof v === "number") ? v : parseFloat(String(v == null ? "" : v).replace(",", "."));
    return (isFinite(n) && n > 0) ? n : 0;
  }

  /* base analítica utilizável? É o que separa "a composição não tem gente" de
     "a base da UF nem foi carregada" — ver o ⚠ do cabeçalho. */
  function baseUtil(A) { return !!(A && typeof A.tem === "function" && typeof A.obter === "function"); }

  var MOTIVO_SEM_QTD = "sem quantidade no orçamento";
  var MOTIVO_QTD_PENDENTE = "quantidade ainda pendente de levantamento";
  var MOTIVO_SEM_BARRA = "sem barra no cronograma";
  /* ⚠ QUATRO MOTIVOS, NÃO UM. Saíam todos com o texto "sem hora-homem na
     composição" — inclusive o código que nem estava na base carregada. São
     ações diferentes para quem lê a lista: baixar a base da UF, cadastrar o
     código, ou aceitar que aquele serviço não tem mão de obra própria. */
  var MOTIVO_SEM_HH = "a composição está na base e não tem linha de mão de obra";
  var MOTIVO_FORA_DA_BASE = "o código não está na base analítica carregada";
  var MOTIVO_SEM_CODIGO = "o serviço não tem código de composição";
  var MOTIVO_NAO_CONFERIDO = "sem hora-homem, e não deu para conferir a composição (nenhuma base analítica chegou a este motor)";
  var MOTIVO_FALHA_PROVEDOR = "a leitura da composição falhou";
  var MOTIVO_SEM_EQ = "sem hora de equipamento na composição";
  var SEM_PROVEDOR_EQ = "não deu para separar equipamento: nenhum provedor de insumos foi informado (opc.analitico ou opc.eqDoItem). O histograma de pessoas acima continua valendo, e o operador de máquina aparece nele como profissão.";

  /* fontes do PRAZO (ver o ⚠ do cabeçalho). "digitada" = a duração da
     etapa/subetapa foi escrita por alguém; "agente" = veio do assistente ou da
     aba Execução e ficou gravada; "estimada" = a heurística de equipe-dias. */
  var JANELA_DIGITADA = { usuario: 1 };
  var JANELA_AGENTE = { ia: 1, exec: 1 };
  var FONTE_PRAZO = "duração da etapa/subetapa do cronograma (Cronograma._itemEd), que é estimativa — NÃO é produtividade medida";

  var Histograma = {
    PERIODOS: ["semana", "mes"],
    JORNADA_PADRAO: 8,
    CRITERIO_EQ: "horas CHP (produtiva) + CHI (improdutiva) do analítico",
    FONTE_HH: "hora-homem do analítico SINAPI (js/execucao.js)",
    FONTE_PRAZO: FONTE_PRAZO,
    MOTIVO_SEM_QTD: MOTIVO_SEM_QTD, MOTIVO_QTD_PENDENTE: MOTIVO_QTD_PENDENTE,
    MOTIVO_SEM_BARRA: MOTIVO_SEM_BARRA,
    MOTIVO_SEM_HH: MOTIVO_SEM_HH, MOTIVO_FORA_DA_BASE: MOTIVO_FORA_DA_BASE,
    MOTIVO_SEM_CODIGO: MOTIVO_SEM_CODIGO, MOTIVO_NAO_CONFERIDO: MOTIVO_NAO_CONFERIDO,
    MOTIVO_FALHA_PROVEDOR: MOTIVO_FALHA_PROVEDOR, MOTIVO_SEM_EQ: MOTIVO_SEM_EQ,
    _deps: { Cronograma: null }, // injetável em teste
    _C: function () { return this._deps.Cronograma || global.Cronograma || null; },
    _unKey: unKey, _ehMoPura: ehMoPura, _nomeEquip: nomeEquip, _segundaDe: segundaDe,
    _jornadaDe: jornadaDe, _tetoDe: tetoDe, _baseUtil: baseUtil,

    /* HORAS DE MÁQUINA de UM item, pela mesma recursão do `Execucao.hhDoItem`
       (sub-composição que não é MO entra, multiplicando coeficientes).
       ⚠ NÃO recursa dentro da própria linha CHP/CHI: as horas da máquina são
       AQUELAS. MEDIDO na MG (11/09/2026): as 434 composições CHP/CHI têm 1.643
       linhas em "H" dentro delas (depreciação, juros, manutenção, operador) e
       NENHUMA (0 de 434) tem outra linha CHP/CHI — ou seja, hoje descer não
       duplicaria máquina nenhuma. A guarda existe assim mesmo porque é a que
       segura o dia em que uma composição de conjunto (trator + prancha, comum
       no SICRO) trouxer a CHP de outra máquina dentro da sua: aí a hora do
       serviço viraria a soma das máquinas de dentro dela.
       ⚠ Este extrator mora aqui, e não no js/execucao.js, porque a Execução
       extrai MÃO DE OBRA. Se um dia ela ganhar o dele, este sai — dois
       extratores do mesmo dado é a receita da "réplica que apodrece".
       Devolve {eq:{nome:{h, chp, chi}}, exato:bool}. */
    eqDoItem: function (item, A) {
      var acc = {}, exato = false;
      var qtd = (item && typeof item.quantidade === "number") ? item.quantidade : parseFloat(String((item && item.quantidade) || 0).replace(",", "."));
      if (!isFinite(qtd)) qtd = 0;
      if (!A || !A.tem || !A.obter || !item || item.codigo == null || !A.tem(item.codigo)) return { eq: acc, exato: false };
      (function rec(cod, mult, trilha) {
        var comp = A.obter(String(cod));
        if (!comp || !comp.insumos) return;
        comp.insumos.forEach(function (ins) {
          var coef = fin(typeof ins.coeficiente === "number" ? ins.coeficiente : parseFloat(String(ins.coeficiente || 0).replace(",", ".")));
          var uk = unKey(ins.unidade);
          if ((uk === "chp" || uk === "chi") && !ehMoPura(ins.descricao)) {
            var nm = nomeEquip(ins.descricao), s = acc[nm] || (acc[nm] = { h: 0, chp: 0, chi: 0 });
            s.h += coef * mult; s[uk] += coef * mult;
            exato = true;
          } else if (ins.tipo === "COMPOSICAO" && !ehMoPura(ins.descricao) && A.tem(ins.codigo) && !trilha[ins.codigo]) {
            trilha[ins.codigo] = 1; rec(ins.codigo, mult * coef, trilha); delete trilha[ins.codigo];
          }
        });
      })(item.codigo, qtd, {});
      return { eq: acc, exato: exato };
    },

    /* Os baldes de tempo (semana ou mês) e o mapa dia útil → balde.
       ⚠ O DENOMINADOR É O DIA ÚTIL DENTRO DA OBRA, não o dia útil do
       calendário: a semana em que a obra começa numa quarta tem 3 dias de
       trabalho, e dividir 24 Hh por 5 diria 0,6 pedreiro onde há 1 pedreiro. */
    baldes: function (r, periodo, cal) {
      var tot = Math.max(0, Math.ceil(fin(r && r.totalDias)));
      var lista = [], porChave = {}, doDia = [], k, forade = 0;
      for (k = 0; k < tot; k++) {
        var d = cal.dia(k);
        if (!d || typeof d.getTime !== "function" || isNaN(d.getTime())) { doDia.push(-1); forade++; continue; }
        var ch, rot, rotL, iniB, fimB;
        if (periodo === "mes") {
          ch = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
          rot = MES[d.getMonth()] + "/" + String(d.getFullYear()).slice(2);
          rotL = MES_LONGO[d.getMonth()] + "/" + d.getFullYear();
        } else {
          var sg = segundaDe(d), dom = new Date(sg.getFullYear(), sg.getMonth(), sg.getDate() + 6);
          ch = chDia(sg); rot = dm(sg); rotL = "semana de " + dm(sg) + " a " + dm(dom);
        }
        var b = porChave[ch];
        if (!b) {
          b = porChave[ch] = { chave: ch, rotulo: rot, rotuloLongo: rotL, i: lista.length,
            ini: new Date(d.getTime()), fim: new Date(d.getTime()), diasUteis: 0,
            _hh: 0, _prof: {}, _h: 0, _eq: {} };
          lista.push(b);
        }
        b.diasUteis++; b.fim = new Date(d.getTime());
        doDia.push(b.i);
      }
      return { lista: lista, doDia: doDia, semData: forade, totalDias: tot };
    },

    /* HISTOGRAMA. `r` = Cronograma.estimar(orc, null, {eap:true}).
       opc = {
         hhDoItem: função(item, analitico) → {prof:{PROF:{hh}}, exato}  (OBRIGATÓRIA)
         analitico: o Analitico (passado ao provedor e usado pelo extrator de equipamento)
         eqDoItem:  função(item, analitico) → {eq:{nome:{h}}, exato}    (opcional; padrão: o daqui)
         periodo: "semana" | "mes"   (padrão "semana")
         jornadaH: horas por dia     (padrão 8, e a saída DIZ que foi o padrão)
         tetoPessoas: nº de pessoas que a obra comporta (opcional)
         calendario: tabela de calendário já pronta (opcional; padrão Cronograma.calendario(r))
       }
       ⚠ Sem `hhDoItem` NÃO existe histograma: devolve {ok:false, erro}. Este
       motor não tem um "modo estimativa" escondido — a régua é a do
       js/cronograma.js:220. */
    montar: function (r, opc) {
      opc = opc || {};
      var self = this, C = this._C();
      var out = { ok: false, erro: null, avisos: [] };

      if (!r || !r.atividades || !r.atividades.length) {
        out.erro = "O histograma precisa do cronograma executivo: chame Cronograma.estimar(orc, null, {eap:true}).";
        return out;
      }
      if (typeof opc.hhDoItem !== "function") {
        out.erro = "Sem a fonte de hora-homem (opc.hhDoItem) não dá para dizer quantas pessoas — e este motor não inventa gente a partir de R$.";
        return out;
      }
      var cal = opc.calendario || (C && C.calendario ? C.calendario(r) : null);
      if (!cal || typeof cal.dia !== "function") {
        out.erro = "Sem calendário do cronograma (data de início) não dá para distribuir as horas no tempo.";
        return out;
      }
      var periodo = (this.PERIODOS.indexOf(opc.periodo) > -1) ? opc.periodo : "semana";
      if (opc.periodo != null && this.PERIODOS.indexOf(opc.periodo) < 0) {
        out.avisos.push("Período \"" + String(opc.periodo) + "\" não existe — usei semana. Os períodos são: " + this.PERIODOS.join(", ") + ".");
      }
      var jorn = jornadaDe(opc.jornadaH), fonteJorn = "informada (" + jorn + " h/dia)";
      if (!jorn) {
        jorn = this.JORNADA_PADRAO;
        fonteJorn = "padrão de " + jorn + " h/dia (a jornada é da aba Execução — informe opc.jornadaH para mudar)";
        if (opc.jornadaH != null) out.avisos.push("Jornada \"" + String(opc.jornadaH) + "\" fora da faixa (0 a 24 h) — usei o padrão de " + jorn + " h/dia.");
      }
      var eqFn = (typeof opc.eqDoItem === "function") ? opc.eqDoItem
        : (opc.analitico ? function (it, A) { return self.eqDoItem(it, A); } : null);

      var B = this.baldes(r, periodo, cal), lista = B.lista;
      var semBase = [], hhProf = {}, eqTot = {}, totalHh = 0, totalH = 0;
      var nServ = 0, nComHh = 0, nComBarra = 0, nComEq = 0, nSemEq = 0, edCom = 0, edSem = 0;
      var vlCom = 0, vlSem = 0, temValor = false, hhFora = 0, hFora = 0;
      /* ⚠ DIAGNÓSTICO SEPARADO (ver o ⚠ do cabeçalho): zero no gráfico pode ser
         base não carregada, provedor que falhou ou composição sem a linha. Os
         contadores existem para a frase final não AFIRMAR o que não foi
         conferido. `falhasHh`/`falhasEq` são o que antes morria num `catch`
         mudo — exceção engolida sem contador é o defeito. */
      var A = opc.analitico || null, temA = baseUtil(A);
      var nComCodigo = 0, nNaBase = 0, nForaBase = 0, nSemCodigo = 0, nSemHhReal = 0, nNaoConferido = 0;
      var falhasHh = 0, erroHh = "", falhasEq = 0, erroEq = "", nEqLido = 0;
      /* fonte do PRAZO: a janela vem do PAI (etapa/subetapa) e a fatia dentro
         dela vem das equipe-dias do próprio serviço. Só é "não heurística" o
         serviço que está SOZINHO numa janela digitada — senão o pico se move
         sem uma hora do orçamento mudar. */
      var fontePai = {}, filhosComBarra = {};
      r.atividades.forEach(function (n) {
        if (!n) return;
        if (n.tipo !== "servico") { fontePai[n.id] = n.fonte || ""; return; }
        if (n.inicio != null && n.fim != null) filhosComBarra[n.paiId] = fin(filhosComBarra[n.paiId]) + 1;
      });
      var przDigitada = 0, przAgente = 0, przEstimada = 0, przSozinho = 0, przDividindo = 0, przHeur = 0;
      var repCat = {};
      /* ETAPA OPCIONAL: entra por padrão, porque o Gantt que a pessoa está
         vendo desenha a barra dela — duas telas do mesmo app com números
         diferentes para a mesma obra é pior que as duas errarem igual. Mas o
         resultado DIZ quanto do pico é opcional, e `opc.semOpcionais` tira.
         ⚠ PENDÊNCIA declarada: qual dos dois vira o padrão da tela é decisão do
         Rogério (a linha de base congela opcional FORA por padrão — espec 1.7). */
      var opcEtapa = {}, semOpc = opc.semOpcionais === true;
      var nOpcServ = 0, nOpcFora = 0, hhOpc = 0, nOpcEtapas = 0;
      r.atividades.forEach(function (n) {
        if (n && n.tipo === "etapa" && n.opcional) { opcEtapa[n.id] = true; nOpcEtapas++; }
      });

      r.atividades.forEach(function (no) {
        if (!no || no.tipo !== "servico") return;
        var ehOpc = !!opcEtapa[no.etapaId];
        if (ehOpc && semOpc) { nOpcFora++; return; } // tirado a pedido de quem chamou
        nServ++;
        var ed = fin(no.equipeDias), vl = (no.valor == null) ? null : fin(no.valor);
        if (vl != null) temValor = true;
        function fora(motivo) {
          edSem += ed; if (vl != null) vlSem += vl;
          semBase.push({ id: no.id, itemId: no.itemId, etapaId: no.etapaId, numero: no.numero,
            nome: String(no.nome == null ? "" : no.nome).slice(0, 80), codigo: no.codigo,
            unidade: no.unidade, quantidade: no.quantidade, equipeDias: ed, valor: vl,
            opcional: ehOpc, motivo: motivo });
        }
        /* ⚠ `no.semBase` do Cronograma é `!(q > 0) || !!it.qtdPendente` — DUAS
           causas com ações opostas ("digite a quantidade" × "feche o
           levantamento pendente"). Saíam as duas com o mesmo texto, e o item
           pendente vinha com `quantidade: 250` ao lado do recado de que não há
           quantidade: o objeto se contradizia sozinho. */
        if (no.semBase === true) { fora(fin(no.quantidade) > 0 ? MOTIVO_QTD_PENDENTE : MOTIVO_SEM_QTD); return; }
        if (no.inicio == null || no.fim == null) { fora(MOTIVO_SEM_BARRA); return; }
        nComBarra++;

        var item = { id: no.itemId, codigo: no.codigo, descricao: no.nome, unidade: no.unidade, quantidade: no.quantidade };
        // o código está na base carregada? null = não deu para conferir
        var temCod = no.codigo != null && String(no.codigo) !== "";
        var naBase = null;
        if (temA && temCod) { try { naBase = !!A.tem(no.codigo); } catch (eB) { naBase = null; } }
        if (temCod) { nComCodigo++; if (naBase === true) nNaBase++; }

        /* fonte do PRAZO deste serviço: a janela vem do PAI, a fatia dentro
           dela vem das equipe-dias. ⚠ Só é contado para quem ENTRA no gráfico
           (abaixo, no ramo com Hh) — serviço que não vira pessoa não move o
           pico, e contá-lo diluiria a fração heurística. */
        var fp = fontePai[no.paiId] || "", juntos = fin(filhosComBarra[no.paiId]);
        var digit = own(JANELA_DIGITADA, fp), agente = own(JANELA_AGENTE, fp);

        /* ⚠ EQUIPAMENTO ANTES E INDEPENDENTE DA MÃO DE OBRA. Estava depois do
           `return` do "sem Hh", e assim um serviço com máquina e SEM
           hora-homem sumiria dos dois gráficos. MEDIDO na SINAPI MG: hoje isso
           não acontece (0 de 10.454 composições têm hora de máquina sem
           hora-homem; 4.124 têm as duas) — mas base própria e base estadual
           montam composição como quiserem, e o gráfico de máquina não pode
           depender de a composição ter gente dentro. */
        var eqs = null, falhouEq = false;
        if (eqFn) {
          var re = null;
          /* ⚠ O CONTADOR É O CONSERTO. Esta exceção era engolida sem deixar
             rastro, e um `eqDoItem` que falhasse em TODO item produzia
             `equipamento.ok:true, totalH:0` com a frase "Nenhum serviço deste
             orçamento tem hora de equipamento" — uma AFIRMAÇÃO sobre a obra
             construída a partir de uma falha de leitura. É ela que decide se
             alguém aluga escavadeira. */
          try { re = eqFn(item, A); } catch (e2) { re = null; falhouEq = true; falhasEq++; if (!erroEq) erroEq = String((e2 && e2.message) || e2); }
          if (!falhouEq) nEqLido++;
          eqs = (re && re.eq) || {};
          var temEq = false, q;
          for (q in eqs) if (own(eqs, q) && fin(eqs[q].h) > 0) temEq = true;
          if (temEq) nComEq++; else { nSemEq++; eqs = null; }
        }

        var rh = null, falhouHh = false;
        // mesma razão do contador acima: `catch` mudo transformava falha de
        // leitura em diagnóstico afirmativo contra o orçamento
        try { rh = opc.hhDoItem(item, A); } catch (e1) { rh = null; falhouHh = true; falhasHh++; if (!erroHh) erroHh = String((e1 && e1.message) || e1); }
        var prof = (rh && rh.prof) || {}, somaHh = 0, p;
        for (p in prof) if (own(prof, p)) somaHh += fin(prof[p] && prof[p].hh);
        if (somaHh > 0) {
          nComHh++; edCom += ed; if (vl != null) vlCom += vl;
          if (ehOpc) { nOpcServ++; hhOpc += somaHh; }
          if (digit) przDigitada++; else if (agente) przAgente++; else przEstimada++;
          if (juntos > 1) przDividindo++; else przSozinho++;
          if (!digit || juntos > 1) przHeur++;
          repCat[no.fonte || "?"] = fin(repCat[no.fonte || "?"]) + 1;
        } else {
          // o motivo CERTO, entre os quatro — ver o ⚠ das constantes
          if (falhouHh) { nNaoConferido++; fora(MOTIVO_FALHA_PROVEDOR + " (" + erroHh + ")"); }
          else if (!temA) { nNaoConferido++; fora(MOTIVO_NAO_CONFERIDO); }
          else if (!temCod) { nSemCodigo++; fora(MOTIVO_SEM_CODIGO); }
          else if (naBase === false) { nForaBase++; fora(MOTIVO_FORA_DA_BASE); }
          else { nSemHhReal++; fora(MOTIVO_SEM_HH); }
          prof = {};
          if (!eqs) return; // não tem gente nem máquina: nada a espalhar
        }

        /* Espalha pelos dias úteis da barra do serviço. A janela vem inteira do
           motor (floor/ceil no `_escalar`), mas a conta é por SOBREPOSIÇÃO: com
           janela inteira ela dá exatamente 1/N por dia, e uma janela fracionária
           que apareça um dia não some com o resto da hora. */
        var ini = fin(no.inicio), fim = fin(no.fim);
        var k0 = Math.floor(ini), k1 = Math.ceil(fim), tam = fim - ini;
        if (k1 <= k0) k1 = k0 + 1;
        for (var k = k0; k < k1; k++) {
          var fr = (tam > 0) ? (Math.min(k + 1, fim) - Math.max(k, ini)) / tam : (k === k0 ? 1 : 0);
          if (!(fr > 0)) continue;
          var bi = (k >= 0 && k < B.doDia.length) ? B.doDia[k] : -1;
          if (bi < 0) { // dia fora do calendário da obra: some do gráfico — e o resultado diz
            hhFora += somaHh * fr;
            if (eqs) for (var q2 in eqs) if (own(eqs, q2)) hFora += fin(eqs[q2].h) * fr;
            continue;
          }
          var b = lista[bi];
          for (p in prof) if (own(prof, p)) {
            var v = fin(prof[p] && prof[p].hh) * fr;
            if (!(v > 0)) continue;
            b._prof[p] = fin(b._prof[p]) + v; b._hh += v;
            hhProf[p] = fin(hhProf[p]) + v; totalHh += v;
          }
          if (eqs) for (var q3 in eqs) if (own(eqs, q3)) {
            var vh = fin(eqs[q3].h) * fr;
            if (!(vh > 0)) continue;
            b._eq[q3] = fin(b._eq[q3]) + vh; b._h += vh;
            eqTot[q3] = fin(eqTot[q3]) + vh; totalH += vh;
          }
        }
      });

      // ---- fechamento: pessoas por período, pico, média ----
      var diasUteis = 0;
      lista.forEach(function (b) { diasUteis += b.diasUteis; });
      /* ⚠ O TETO ACEITA TEXTO, COMO A JORNADA, e quando descarta DIZ que
         descartou. A guarda era `typeof === "number"` e o `<input>` da tela
         entrega "3": o teto sumia calado, e quem ligar a fiação copiaria o
         padrão do `jornadaH` (que aceita texto BR) sem desconfiar. */
      var teto = tetoDe(opc.tetoPessoas) || null;
      if (opc.tetoPessoas != null && opc.tetoPessoas !== "" && teto == null) {
        out.avisos.push("Teto \"" + String(opc.tetoPessoas) + "\" não é um número de pessoas — ignorei, e nenhum período foi conferido contra teto nenhum.");
      }
      var baldes = [], curva = [], acima = [], pico = null;
      var picoProf = {};
      lista.forEach(function (b) {
        /* pessoas/dia equivalentes = Hh do período ÷ jornada ÷ dias úteis do
           período. ⚠ O TOTAL sai do Hh total do balde, NUNCA da soma das
           profissões já arredondadas — senão a barra empilhada e o número ao
           lado dela discordariam no segundo decimal. */
        /* ⚠ `hh` e `pessoas` do balde saem ARREDONDADOS em 2 casas (é número de
           tela); `totalHh` é a soma EXATA. Num cronograma de 200 semanas a
           diferença acumulada chega a alguns centésimos de hora (medido: 0,31 h
           em 11.875 h, 212 baldes) — é arredondamento, não hora perdida. Hora
           perdida de verdade aparece em `avisos` (o contador `hhFora`). */
        var pessoas = b.diasUteis ? r2(b._hh / jorn / b.diasUteis) : 0;
        var pp = {}, p;
        for (p in b._prof) if (own(b._prof, p)) {
          var np = b.diasUteis ? r2(b._prof[p] / jorn / b.diasUteis) : 0;
          pp[p] = { hh: r2(b._prof[p]), pessoas: np };
          if (!picoProf[p] || np > picoProf[p].pessoas) picoProf[p] = { chave: b.chave, rotulo: b.rotulo, pessoas: np };
        }
        var estoura = (teto != null && pessoas > teto);
        var o = { chave: b.chave, rotulo: b.rotulo, rotuloLongo: b.rotuloLongo,
          ini: new Date(b.ini.getTime()), fim: new Date(b.fim.getTime()), diasUteis: b.diasUteis,
          hh: r2(b._hh), pessoas: pessoas, porProfissao: pp, acimaDoTeto: estoura };
        baldes.push(o); curva.push(pessoas);
        if (!pico || pessoas > pico.pessoas) pico = { chave: o.chave, rotulo: o.rotulo, rotuloLongo: o.rotuloLongo, pessoas: pessoas, hh: o.hh, diasUteis: o.diasUteis, i: baldes.length - 1 };
        if (estoura) acima.push({ chave: o.chave, rotulo: o.rotulo, rotuloLongo: o.rotuloLongo, pessoas: pessoas, teto: teto, excesso: r2(pessoas - teto) });
      });
      var profissoes = [];
      for (var pn in hhProf) if (own(hhProf, pn)) {
        profissoes.push({ nome: pn, hh: r2(hhProf[pn]),
          pessoasMedia: diasUteis ? r2(hhProf[pn] / jorn / diasUteis) : 0,
          pico: picoProf[pn] || null });
      }
      profissoes.sort(function (a, b) { return b.hh - a.hh || (a.nome < b.nome ? -1 : 1); });

      /* ---- equipamento ----
         ⚠ TRÊS PORTAS PARA "ok:false", e todas dizem o motivo. Antes só havia
         a primeira (provedor ausente): com um provedor PRESENTE que falhava em
         todo item, ou com a base da UF não carregada, a saída afirmava
         "Nenhum serviço deste orçamento tem hora de equipamento" — exatamente
         o que o ⚠ do cabeçalho promete não fazer. */
      var equip, baseSemCodigo = (temA && nComCodigo > 0 && nNaBase === 0);
      if (!eqFn) {
        equip = { ok: false, motivo: SEM_PROVEDOR_EQ, criterio: this.CRITERIO_EQ, baldes: [], curva: [], equipamentos: [], totalH: 0, pico: null };
      } else if (falhasEq > 0 && nEqLido === 0) {
        equip = { ok: false, criterio: this.CRITERIO_EQ, baldes: [], curva: [], equipamentos: [], totalH: 0, pico: null,
          motivo: "não deu para conferir equipamento: a leitura da composição falhou nos " + falhasEq + " serviço(s) conferido(s) (primeiro erro: " + erroEq + "). Isto NÃO quer dizer que a obra não tem máquina." };
      } else if (baseSemCodigo && nComEq === 0) {
        equip = { ok: false, criterio: this.CRITERIO_EQ, baldes: [], curva: [], equipamentos: [], totalH: 0, pico: null,
          motivo: "não deu para conferir equipamento: nenhum dos " + nComCodigo + " código(s) deste orçamento está na base analítica carregada — provavelmente a base da UF não foi baixada. Isto NÃO quer dizer que a obra não tem máquina." };
      } else {
        var ebal = [], ecurva = [], epico = null;
        lista.forEach(function (b, i) {
          var pe = {}, q;
          for (q in b._eq) if (own(b._eq, q)) pe[q] = { h: r2(b._eq[q]), maquinas: b.diasUteis ? r2(b._eq[q] / jorn / b.diasUteis) : 0 };
          var maq = b.diasUteis ? r2(b._h / jorn / b.diasUteis) : 0;
          ebal.push({ chave: b.chave, rotulo: b.rotulo, rotuloLongo: b.rotuloLongo, diasUteis: b.diasUteis, h: r2(b._h), maquinas: maq, porEquipamento: pe });
          ecurva.push(maq);
          if (!epico || maq > epico.maquinas) epico = { chave: b.chave, rotulo: b.rotulo, maquinas: maq, h: r2(b._h), i: i };
        });
        var eqLista = [];
        for (var en in eqTot) if (own(eqTot, en)) eqLista.push({ nome: en, h: r2(eqTot[en]), maquinasMedia: diasUteis ? r2(eqTot[en] / jorn / diasUteis) : 0 });
        eqLista.sort(function (a, b) { return b.h - a.h || (a.nome < b.nome ? -1 : 1); });
        equip = { ok: true, criterio: this.CRITERIO_EQ, baldes: ebal, curva: ecurva, equipamentos: eqLista,
          totalH: r2(totalH), pico: epico,
          /* ⚠ o denominador é o serviço COM BARRA no cronograma (nComBarra), não
             o total de serviços: item sem quantidade não tem barra e não podia
             ser cobrado de ter máquina. comEquipamento + semEquipamento fecha
             com nComBarra — o teste cobra. */
          cobertura: { servicos: nComBarra, comEquipamento: nComEq, semEquipamento: nSemEq,
            /* ⚠ o denominador HONESTO: quantas composições foram LIDAS de
               verdade, não quantas foram tentadas. Falha de leitura contada
               como "conferido" é o que produzia a afirmação falsa. */
            lidos: nEqLido, falhas: falhasEq },
          observacao: "Horas de MÁQUINA (CHP + CHI). O OPERADOR não está aqui: ele é pessoa e entra no histograma de mão de obra, com o Hh que o SINAPI dá por recursão." };
        if (nComEq === 0) {
          equip.motivo = "Nenhum dos " + nEqLido + " serviço(s) cuja composição foi LIDA tem hora de equipamento"
            + (falhasEq > 0 ? " — e em " + falhasEq + " outro(s) a leitura falhou (" + erroEq + "), então esses não foram conferidos" : "") + ".";
        }
      }
      // ⚠ FORA DO `else`: a exceção precisa virar aviso também quando ela é a
      // razão de `equipamento.ok` ser false — era ali que ela morria calada.
      if (falhasEq > 0) {
        out.avisos.push("⚠ A leitura da composição falhou em " + falhasEq + " serviço(s) ao procurar equipamento (primeiro erro: " + erroEq
          + ") — o gráfico de máquina está incompleto, e o que falta NÃO é ausência de máquina.");
      }

      // ---- cobertura e recados ----
      var nSem = nServ - nComHh;
      var pctServ = nServ ? Math.round((nComHh / nServ) * 1000) / 10 : 0;
      var edTot = edCom + edSem, pctEd = edTot > 0 ? Math.round((edCom / edTot) * 1000) / 10 : 0;
      var vlTot = vlCom + vlSem;
      var pctHeur = nComHh ? Math.round((przHeur / nComHh) * 1000) / 10 : 0;
      var cobertura = {
        servicos: nServ, comHh: nComHh, semHh: nSem, pctServicos: pctServ,
        equipeDias: { com: r2(edCom), sem: r2(edSem), pct: pctEd },
        valor: temValor ? { com: r2(vlCom), sem: r2(vlSem), pct: vlTot > 0 ? Math.round((vlCom / vlTot) * 1000) / 10 : 0 } : null,
        /* ⚠ `hhHeuristicos` mede o que sempre mediu: hora-homem que entrou sem
           vir de composição. É zero por construção — e por isso NÃO pode se
           chamar "heuristicos", que a tela leria como "nada neste gráfico é
           estimativa". O que é estimativa está em `prazo`, logo abaixo. */
        hhHeuristicos: 0,
        /* ⚠ DUAS FONTES, SEPARADAS. Uma só escondia que o pico = Hh medido ÷
           prazo estimado. `prazo.pctHeuristica` é a fração dos serviços do
           gráfico cuja BARRA depende de estimativa: janela do pai que não foi
           digitada, OU janela dividida com outro serviço (a fatia de cada um
           sai das equipe-dias, que são heurísticas). Medido nos 51 orçamentos
           reais: 100% da repartição é heurística e 933 de 1.073 serviços
           dividem a janela. */
        prazo: {
          servicos: nComHh,
          janelaDigitada: przDigitada, janelaAgente: przAgente, janelaEstimada: przEstimada,
          sozinhoNaJanela: przSozinho, dividindoJanela: przDividindo,
          reparticao: repCat, heuristicos: przHeur, pctHeuristica: pctHeur,
          criterio: "heurístico = a janela da etapa/subetapa não foi digitada, ou o serviço divide a janela com outro (a fatia sai das equipe-dias)",
          fonte: FONTE_PRAZO
        },
        falhasProvedor: falhasHh, erroProvedor: erroHh,
        naBase: { comCodigo: nComCodigo, naBaseCarregada: nNaBase, foraDaBase: nForaBase, semCodigo: nSemCodigo, baseInformada: temA },
        motivos: { semHhReal: nSemHhReal, foraDaBase: nForaBase, semCodigo: nSemCodigo, naoConferido: nNaoConferido },
        fonteHh: this.FONTE_HH,
        fontePrazo: FONTE_PRAZO,
        fonte: "horas: " + this.FONTE_HH + " | prazo: " + FONTE_PRAZO,
        msg: nServ === 0 ? "O cronograma não tem serviço nenhum."
          : (nComHh + " de " + nServ + " serviços (" + pctServ + "%) têm hora-homem no analítico e formam o histograma"
            + (nSem > 0 ? "; " + nSem + " ficaram FORA (" + (edTot > 0 ? (Math.round((edSem / edTot) * 1000) / 10) + "% das equipe-dias do cronograma" : "sem equipe-dias") + ")" : "")
            + (nForaBase > 0 ? ", dos quais " + nForaBase + " por o código não estar na base analítica carregada" : "")
            + (nNaoConferido > 0 ? ", e " + nNaoConferido + " que NÃO deu para conferir" : "") + ".")
      };
      if (nSem > 0) {
        out.avisos.push(nSem + " serviço(s) ficaram fora do histograma — eles existem no cronograma"
          + (edTot > 0 ? " e valem " + r2(edSem) + " equipe-dias (" + (Math.round((edSem / edTot) * 1000) / 10) + "% do total)" : "")
          + (nSemHhReal > 0 ? ". " + nSemHhReal + " sem hora-homem na composição (a composição foi lida)" : "")
          + (nForaBase > 0 ? ". " + nForaBase + " com código FORA da base analítica carregada — baixe a base da UF do orçamento" : "")
          + (nSemCodigo > 0 ? ". " + nSemCodigo + " sem código de composição" : "")
          + (nNaoConferido > 0 ? ". ⚠ " + nNaoConferido + " NÃO foram conferidos" : "")
          + ". Um serviço sem produtividade rastreável não vira pessoa aqui.");
      }
      if (falhasHh > 0) {
        out.avisos.push("⚠ A leitura da composição falhou em " + falhasHh + " serviço(s) (primeiro erro: " + erroHh
          + "). Esses serviços não foram conferidos — a ausência deles no gráfico NÃO quer dizer que não têm mão de obra.");
      }
      /* ⚠ O AVISO QUE FALTAVA. O total de horas é SINAPI; o pico é esse total
         dividido por um PRAZO estimado. Medido: os mesmos 80 Hh viram 3,33,
         10,00 ou 1,25 pessoa conforme a duração da barra. Sem esta frase, a
         tela mostra um pico de contratação com cara de número medido. */
      if (nComHh > 0 && przHeur > 0) {
        out.avisos.push("⚠ O TOTAL de horas vem do analítico SINAPI, mas a DISTRIBUIÇÃO delas no tempo — e portanto o pico — depende do PRAZO estimado: "
          + przHeur + " de " + nComHh + " serviços (" + pctHeur + "%) do gráfico têm a barra dimensionada por estimativa ("
          + przEstimada + " com a janela da etapa/subetapa estimada, " + przDividindo + " dividindo a janela com outro serviço). "
          + "Mudar a duração da etapa muda o pico sem mudar uma hora do orçamento — se o prazo é o que está em discussão, ajuste-o antes de dimensionar alojamento por este gráfico.");
      }
      if (hhFora > 0) {
        out.avisos.push("⚠ " + r2(hhFora) + " hora(s)-homem caíram em dias fora do calendário do cronograma e não aparecem no gráfico — isso não deveria acontecer; confira a data de início e a duração da obra.");
      }
      if (hFora > 0) out.avisos.push("⚠ " + r2(hFora) + " hora(s) de equipamento caíram fora do calendário do cronograma.");
      if (B.semData > 0) out.avisos.push("⚠ " + B.semData + " dia(s) úteis do cronograma ficaram sem data no calendário e não entraram na conta.");
      if (nOpcEtapas > 0) {
        out.avisos.push(semOpc
          ? nOpcEtapas + " etapa(s) opcional(is) e " + nOpcFora + " serviço(s) delas ficaram FORA deste histograma a seu pedido."
          : "⚠ " + nOpcEtapas + " etapa(s) opcional(is) ENTRAM neste histograma (" + nOpcServ + " serviço(s), " + r2(hhOpc) + " Hh). Se o cliente não contratar, o pico cai.");
      }
      if (teto != null && acima.length) {
        out.avisos.push(acima.length + " período(s) passam do teto de " + teto + " pessoas — o maior pede " + pico.pessoas + " pessoas (" + pico.rotuloLongo + "). Sem nivelar, esse pico não acontece na obra.");
      }

      out.ok = true;
      out.vazio = nComHh === 0;
      /* ⚠ O RECADO DO GRÁFICO VAZIO SÓ AFIRMA O QUE FOI CONFERIDO. Ele dizia
         "Nenhum serviço deste orçamento tem hora-homem de composição" também
         quando a base da UF não estava carregada — e o serviço acusado era um
         87495 da SINAPI, que TEM mão de obra. As quatro frases pedem quatro
         ações diferentes; a última é a única que fala do orçamento. */
      if (out.vazio) {
        var fim = " — e inventar pessoas a partir de R$ seria número que a medição derruba.";
        if (falhasHh > 0 && falhasHh >= nComBarra) {
          out.motivoVazio = "provedor-falhou";
          out.avisos.push("⚠ NÃO DEU PARA CONFERIR: a leitura da composição falhou nos " + falhasHh + " serviço(s) conferido(s) (primeiro erro: " + erroHh
            + "). Não dá para dizer que este orçamento não tem hora-homem — recarregue o app e tente de novo" + fim);
        } else if (!temA) {
          out.motivoVazio = "sem-base";
          out.avisos.push("⚠ NÃO DEU PARA CONFERIR: nenhuma base analítica chegou a este motor, então a composição dos " + nComBarra
            + " serviço(s) não foi lida. Carregue a base da UF do orçamento (aba SINAPI) e abra o histograma de novo" + fim);
        } else if (nComCodigo > 0 && nNaBase === 0) {
          out.motivoVazio = "base-nao-carregada";
          out.avisos.push("⚠ NÃO DEU PARA CONFERIR: nenhum dos " + nComCodigo + " código(s) deste orçamento está na base analítica carregada — provavelmente a base da UF não foi baixada. "
            + "Não dá para afirmar que os serviços não têm hora-homem" + fim);
        } else {
          out.motivoVazio = "sem-hora-homem";
          out.avisos.push("Nenhum dos " + nComBarra + " serviço(s) cuja composição foi LIDA tem hora-homem (base própria ou estadual, ou itens sem composição): não há histograma de mão de obra para mostrar" + fim);
        }
      }
      out.periodo = periodo;
      out.jornadaH = jorn; out.fonteJornada = fonteJorn;
      out.dataInicio = r.dataInicio ? new Date(r.dataInicio.getTime()) : null;
      out.dataFim = r.dataFim ? new Date(r.dataFim.getTime()) : null;
      out.diasUteis = diasUteis;
      out.baldes = baldes; out.curva = curva;
      out.pico = pico; out.media = diasUteis ? r2(totalHh / jorn / diasUteis) : 0;
      out.totalHh = r2(totalHh);
      out.profissoes = profissoes;
      out.teto = teto; out.acimaDoTeto = acima;
      out.cobertura = cobertura; out.semBase = semBase;
      out.equipamento = equip;
      return out;
    }
  };

  global.Histograma = Histograma;
  if (typeof module !== "undefined" && module.exports) module.exports = Histograma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

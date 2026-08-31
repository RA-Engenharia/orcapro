/* =====================================================================
 * bimtarefa.js — O 4D COM O CRONOGRAMA DO ENGENHEIRO (motor PURO).
 *
 * O `js/bim4d.js` continua sendo o DERIVADOR AUTOMÁTICO: ele olha o tipo IFC
 * e monta uma linha do tempo plausível sem ninguém pedir. Isso é excelente
 * como ponto de partida — nenhum concorrente entrega uma simulação 4D sem
 * trabalho de cadastro. Mas é um chute educado, e o engenheiro não conseguia
 * CORRIGIR: a laje do 2º pavimento sobia na semana que o motor achou, não na
 * que está no cronograma dele.
 *
 * Aqui entram as TAREFAS: nome, alvo, as quatro datas (previsto e real), e o
 * tipo (construir, demolir, temporário). O automático vira o padrão; a tarefa
 * vira a correção.
 *
 * ⚠ O QUE MUDA DE SEMANA PARA DATA. O 4D antigo conta SEMANAS a partir do
 * início da obra. Isso funciona para uma barra de progresso e não funciona
 * para comparar com a realidade: medição, diário e Last Planner falam em DATA.
 * A tarefa guarda data ISO, e a régua converte.
 *
 * ⚠ E O ATRASO NÃO PISCA. A versão anterior do 4D usava uma cor só para tudo
 * que estava em andamento. "Atrasado" virava um vermelho piscante que não
 * serve para relatório — a foto sai ora vermelha, ora não, e o engenheiro não
 * consegue mandar a imagem para o cliente. Aqui o atraso é um CONTORNO fixo,
 * e todas as aparências são editáveis, porque a cor certa depende do que a
 * empresa já usa nos relatórios dela.
 * ===================================================================== */
(function (global) {
  "use strict";

  var TIPOS = {
    construir:  { rotulo: "Construir",  dica: "Aparece ao começar e fica ao terminar." },
    demolir:    { rotulo: "Demolir",    dica: "Já está lá; SOME ao terminar — o inverso de construir." },
    temporario: { rotulo: "Temporário", dica: "Escoramento, andaime, contenção: aparece ao começar e some ao terminar." }
  };

  var TIPOS_ALVO = { conjunto: 1, etapaOrcamento: 1, elementos: 1, auto: 1 };

  /* ---------------------------------------------------------------------
   * ESTADOS e APARÊNCIAS
   *
   * `oculto: true` some da cena. `cor: null` = material original da peça —
   * e essa é a escolha certa para "concluído": o que está pronto tem de
   * parecer o que é, senão a imagem final da obra sai colorida de amarelo.
   * ------------------------------------------------------------------- */
  var ESTADOS = ["futuro", "em-execucao", "atrasado", "concluido", "removido"];

  var APARENCIA_PADRAO = {
    /* antes de começar: não existe ainda (ou já existe, se for demolição) */
    futuro:        { oculto: true,  cor: null,      opacidade: 1,   contorno: null,     rotulo: "Não iniciado" },
    /* em execução — o tipo decide a cor, ver `aparenciaDe` */
    "em-execucao": { oculto: false, cor: "#f59e0b", opacidade: 0.6, contorno: null,     rotulo: "Em execução" },
    atrasado:      { oculto: false, cor: "#f59e0b", opacidade: 0.6, contorno: "#ea580c", rotulo: "Atrasado" },
    concluido:     { oculto: false, cor: null,      opacidade: 1,   contorno: null,     rotulo: "Concluído" },
    /* demolido/desmontado: sumiu da obra */
    removido:      { oculto: true,  cor: null,      opacidade: 1,   contorno: null,     rotulo: "Removido" }
  };
  /* a execução muda de cor conforme o tipo: derrubar não é o mesmo que erguer */
  var COR_EXECUCAO = { construir: "#f59e0b", demolir: "#dc2626", temporario: "#06b6d4" };
  var OPACIDADE_EXECUCAO = { construir: 0.6, demolir: 0.6, temporario: 0.4 };

  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d || 0); }

  /* ---------------------------------------------------------------------
   * DATA: só o dia importa, e a comparação é de STRING.
   *
   * ⚠ NADA DE `new Date()` AQUI DENTRO. Comparar datas com objeto Date
   * arrasta fuso horário: "2026-03-10" vira 09/03 às 21h no Brasil, e uma
   * tarefa que termina no dia 10 aparece concluída no dia 9. A base já
   * apanhou disso — a data ISO no formato AAAA-MM-DD compara certo como
   * texto, e é assim que o resto do app grava.
   * ------------------------------------------------------------------- */
  /* ⚠ FORA DE FAIXA É DATA VAZIA, NÃO É DATA ESQUISITA. Um CSV em mm/dd/aaaa
     entrava por aqui: "03/15/2026" virava o mês 15, `validar` não reclamava
     (texto compara "certo"), e `serial` devolvia NaN — que fazia o laço de
     `deSerial` girar para sempre e MATAR a aba. Devolvendo "", o caminho que
     já existe assume: `validar` acusa a data faltando e o importador põe a
     linha em `recusadas`, com o número, na tela. */
  function faixaOk(a, m, d) { return a >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= 31; }
  function dia(v) {
    var s = txt(v).trim();
    if (!s) return "";
    /* aceita "2026-03-10", "2026-03-10T08:00:00Z" e "10/03/2026" */
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return faixaOk(+m[1], +m[2], +m[3]) ? (m[1] + "-" + m[2] + "-" + m[3]) : "";
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (m) return faixaOk(+m[3], +m[2], +m[1]) ? (m[3] + "-" + m[2] + "-" + m[1]) : "";
    return "";
  }

  /* ---------------------------------------------------------------------
   * A TAREFA
   * ------------------------------------------------------------------- */
  function alvo(spec) {
    spec = spec || {};
    var tipo = txt(spec.tipo).trim();
    if (!TIPOS_ALVO[tipo]) tipo = "auto";
    var out = { tipo: tipo, ref: txt(spec.ref) };
    if (tipo === "elementos") out.chaves = (spec.chaves || []).map(txt).filter(Boolean);
    return out;
  }

  function tarefa(t) {
    t = t || {};
    var tp = txt(t.tipoTarefa).trim();
    if (!TIPOS[tp]) tp = "construir";
    return {
      id: txt(t.id) || "",
      obraId: txt(t.obraId),
      nome: txt(t.nome) || "Tarefa sem nome",
      wbs: txt(t.wbs),
      alvo: alvo(t.alvo),
      tipoTarefa: tp,
      previstoInicio: dia(t.previstoInicio),
      previstoFim: dia(t.previstoFim),
      realInicio: dia(t.realInicio),
      realFim: dia(t.realFim),
      /* o percentual é o que a medição informa; sem ele, o plano manda */
      percentual: Math.max(0, Math.min(100, num(t.percentual, 0))),
      dependeDe: (t.dependeDe || []).map(txt).filter(Boolean),
      etapaOrc: txt(t.etapaOrc),
      itemOrcId: txt(t.itemOrcId),
      origem: txt(t.origem) || "manual"    /* manual | csv | mspdi | cronograma */
    };
  }

  function validar(t) {
    var e = [];
    t = t || {};
    if (!txt(t.nome).trim()) e.push("Dê um nome à tarefa — é como ela aparece na régua e no relatório.");
    if (!txt(t.obraId)) e.push("A tarefa precisa estar ligada a uma obra.");
    var tp = txt(t.tipoTarefa).trim();
    if (tp && !TIPOS[tp]) e.push('Tipo de tarefa desconhecido: "' + txt(t.tipoTarefa) + '".');
    var pi = dia(t.previstoInicio), pf = dia(t.previstoFim);
    var ri = dia(t.realInicio), rf = dia(t.realFim);
    if (!pi || !pf) e.push("Informe as datas previstas de início e fim — sem elas a tarefa não entra na régua.");
    /* ⚠ DATA INVERTIDA É RECUSADA, e não corrigida em silêncio. Trocar as duas
       "para ajudar" esconde o erro de digitação: a tarefa passa a simular uma
       janela que ninguém planejou, e o engenheiro só descobre olhando a obra
       subir na ordem errada. */
    if (pi && pf && pf < pi) e.push("O fim previsto (" + pf + ") é ANTES do início previsto (" + pi + ").");
    if (ri && rf && rf < ri) e.push("O fim real (" + rf + ") é ANTES do início real (" + ri + ").");
    if (rf && !ri) e.push("Tem fim real sem início real — informe quando começou.");
    var al = txt((t.alvo || {}).tipo);
    if (al && !TIPOS_ALVO[al]) e.push('Alvo de tipo "' + al + '" não existe.');
    if ((al === "conjunto" || al === "etapaOrcamento") && !txt((t.alvo || {}).ref)) {
      e.push("Escolha qual " + (al === "conjunto" ? "conjunto" : "etapa do orçamento") + " a tarefa representa.");
    }
    return { ok: e.length === 0, erros: e };
  }

  /* ---------------------------------------------------------------------
   * O ESTADO DA TAREFA NUMA DATA
   *
   * ⚠ A RÉGUA TEM DUAS METADES, E ELAS NÃO SIGNIFICAM A MESMA COISA.
   *   Antes de hoje é REALIDADE: o que não foi apontado como terminado e já
   *   passou do prazo está atrasado. Depois de hoje é PLANO: ali não existe
   *   atraso, porque o futuro ainda não aconteceu — arrastar a régua para
   *   dezembro e ver a obra inteira laranja seria ruído, não informação.
   *   Sem essa separação, um cronograma importado sem apontamento nenhum
   *   pinta tudo de atrasado e o recurso vira inútil no primeiro uso.
   *
   *   `hoje` é INJETADO. O motor é puro e não lê relógio: assim o teste
   *   controla o dia, e a simulação não muda de resultado à meia-noite.
   * ------------------------------------------------------------------- */
  function estadoEm(t, data, hoje) {
    t = tarefa(t);
    var d = dia(data);
    if (!d) return "futuro";
    hoje = dia(hoje) || d;

    var ini = t.realInicio || t.previstoInicio;
    var fim = t.realFim || t.previstoFim;

    /* ainda não começou nesta data */
    if (ini && d < ini) return "futuro";

    /* terminou de verdade */
    if (t.realFim && d >= t.realFim) return t.tipoTarefa === "construir" ? "concluido" : "removido";

    /* passou do prazo, ainda NÃO tinha terminado NAQUELE DIA, e estamos na
       metade REAL da régua.
       ⚠ A condição é sobre a DATA D, não sobre existir um fim real hoje. A
       primeira versão exigia `!t.realFim` e com isso uma tarefa que estourou
       o prazo e só terminou dez dias depois aparecia como "em execução" em
       todo o período do estouro — o atraso sumia da régua justamente porque
       a obra o resolveu. A checagem de conclusão logo acima já garante que,
       chegando ao dia do fim real, ela vira concluída. */
    if (t.previstoFim && d > t.previstoFim && d <= hoje) return "atrasado";

    /* dentro da janela */
    if (fim && d < fim) return "em-execucao";
    if (fim && d >= fim) return t.tipoTarefa === "construir" ? "concluido" : "removido";

    return "em-execucao";
  }

  /* aparência efetiva de um estado para um tipo de tarefa, já misturando o
     que a empresa editou por cima do padrão */
  function aparenciaDe(estado, tipoTarefa, editadas) {
    var base = APARENCIA_PADRAO[estado] || APARENCIA_PADRAO.futuro;
    var out = {
      oculto: base.oculto, cor: base.cor, opacidade: base.opacidade,
      contorno: base.contorno, rotulo: base.rotulo
    };
    if (estado === "em-execucao" || estado === "atrasado") {
      out.cor = COR_EXECUCAO[tipoTarefa] || out.cor;
      out.opacidade = OPACIDADE_EXECUCAO[tipoTarefa] || out.opacidade;
      if (estado === "atrasado") out.contorno = APARENCIA_PADRAO.atrasado.contorno;
    }
    /* ⚠ o DEMOLIR e o TEMPORÁRIO existem ANTES de começar: um está para ser
       derrubado, o outro ainda não foi montado. Só o temporário some antes. */
    if (estado === "futuro" && tipoTarefa === "demolir") out.oculto = false;

    var e = (editadas || {})[estado + ":" + tipoTarefa] || (editadas || {})[estado];
    if (e) {
      if (e.oculto != null) out.oculto = !!e.oculto;
      if (e.cor !== undefined) out.cor = e.cor || null;
      if (e.opacidade != null) out.opacidade = Math.max(0, Math.min(1, num(e.opacidade, out.opacidade)));
      if (e.contorno !== undefined) out.contorno = e.contorno || null;
    }
    return out;
  }

  /* ---------------------------------------------------------------------
   * Resolver o ALVO em chaves do B0.
   *
   * ⚠ NA HORA DA SIMULAÇÃO, NÃO NO CADASTRO. Um alvo por conjunto tem de
   * reavaliar a regra a cada rodada: o projetista publica o IFC novo com mais
   * três paredes no Térreo e elas TÊM de entrar na tarefa "Alvenaria do
   * Térreo" sem ninguém reeditar nada. Congelar a lista no cadastro faria a
   * simulação envelhecer junto com o modelo do dia em que ela foi criada.
   * ------------------------------------------------------------------- */
  function chaveDe(el) {
    if (!el) return "";
    if (el.chave) return txt(el.chave);
    if (global.BimId && global.BimId.doElemento) { try { return txt(global.BimId.doElemento(el)); } catch (e) {} }
    return "";
  }

  function resolverAlvo(t, elementos, ctx) {
    ctx = ctx || {};
    t = tarefa(t);
    var a = t.alvo, fora = {}, n = 0, avisos = [];

    if (a.tipo === "elementos") {
      a.chaves.forEach(function (k) { if (!fora[k]) { fora[k] = 1; n++; } });
    } else if (a.tipo === "conjunto") {
      var chaves = null;
      if (typeof ctx.resolverConjunto === "function") chaves = ctx.resolverConjunto(a.ref);
      else if (global.BimSet && global.BimSet.resolver && ctx.conjuntos) {
        var cj = null;
        (ctx.conjuntos || []).forEach(function (c) { if (txt(c.id) === a.ref) cj = c; });
        if (cj) { try { var r = global.BimSet.resolver(cj, elementos || []); chaves = r && r.chaves; } catch (e) {} }
      }
      if (!chaves) avisos.push('A tarefa "' + t.nome + '" aponta para um conjunto que não existe mais (' + a.ref + ').');
      else if (!chaves.length) avisos.push('A tarefa "' + t.nome + '" aponta para o conjunto "' + a.ref + '", que não casou nenhuma peça do modelo aberto.');
      (chaves || []).forEach(function (k) { if (!fora[k]) { fora[k] = 1; n++; } });
    } else if (a.tipo === "etapaOrcamento") {
      (elementos || []).forEach(function (el) {
        if (txt(el.etapa) !== a.ref && txt(el.codOrc) !== a.ref) return;
        var k = chaveDe(el); if (k && !fora[k]) { fora[k] = 1; n++; }
      });
      if (!n) avisos.push('A tarefa "' + t.nome + '" aponta para a etapa "' + a.ref + '", e nenhuma peça do modelo carrega esse carimbo.');
    } else {
      /* auto: quem manda é o derivador do bim4d.js; a tarefa não pinta nada */
      avisos.push('A tarefa "' + t.nome + '" está no modo automático — ela não tem alvo próprio.');
    }
    return { chaves: fora, total: n, avisos: avisos };
  }

  /* ---------------------------------------------------------------------
   * A SIMULAÇÃO numa data
   *
   * Devolve o que a cena precisa e NADA mais: quem some, quem é pintado de
   * quê, e quem ficou sem alvo. A cena não sabe o que é uma tarefa.
   * ------------------------------------------------------------------- */
  function simular(tarefas, elementos, data, opts) {
    opts = opts || {};
    var d = dia(data), hoje = dia(opts.hoje) || d;
    var editadas = opts.aparencias || {};
    var ocultos = {}, pinturas = {}, contornos = {}, avisos = [], semAlvo = [];
    var porEstado = {};
    ESTADOS.forEach(function (s) { porEstado[s] = 0; });

    (tarefas || []).forEach(function (bruta) {
      var t = tarefa(bruta);
      var r = resolverAlvo(t, elementos, opts);
      r.avisos.forEach(function (a) { avisos.push(a); });
      if (!r.total) { semAlvo.push({ id: t.id, nome: t.nome, alvo: t.alvo }); return; }

      var estado = estadoEm(t, d, hoje);
      var ap = aparenciaDe(estado, t.tipoTarefa, editadas);
      porEstado[estado] = (porEstado[estado] || 0) + r.total;

      Object.keys(r.chaves).forEach(function (k) {
        /* ⚠ ÚLTIMA TAREFA VENCE, e isso é decisão: uma peça pode estar em duas
           tarefas (a laje entra em "estrutura" e em "acabamento"), e a ordem da
           lista é a ordem do cronograma. A de baixo é a mais recente. */
        if (ap.oculto) { ocultos[k] = 1; delete pinturas[k]; delete contornos[k]; return; }
        delete ocultos[k];
        if (ap.cor) pinturas[k] = { cor: ap.cor, opacidade: ap.opacidade };
        else delete pinturas[k];
        if (ap.contorno) contornos[k] = ap.contorno; else delete contornos[k];
      });
    });

    return {
      data: d, ocultos: Object.keys(ocultos), pinturas: pinturas, contornos: contornos,
      semAlvo: semAlvo, avisos: avisos, porEstado: porEstado
    };
  }

  /* janela total do conjunto de tarefas — é o que a régua percorre */
  function janela(tarefas) {
    var ini = "", fim = "";
    (tarefas || []).forEach(function (bruta) {
      var t = tarefa(bruta);
      [t.previstoInicio, t.realInicio].forEach(function (x) { if (x && (!ini || x < ini)) ini = x; });
      [t.previstoFim, t.realFim].forEach(function (x) { if (x && (!fim || x > fim)) fim = x; });
    });
    return { inicio: ini, fim: fim, dias: (ini && fim) ? diasEntre(ini, fim) : 0 };
  }

  /* dias entre duas datas ISO, sem objeto Date (fuso não entra na conta) */
  var DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function bissexto(a) { return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0; }
  function serial(d) {
    var p = dia(d).split("-");
    if (p.length !== 3) return 0;
    var a = +p[0], m = +p[1], x = +p[2], n = 0, i;
    /* ⚠ CINTO DE SEGURANÇA, ainda que `dia()` já barre a faixa: nada que saia
       daqui pode ser NaN, porque quem consome é um laço. */
    if (!(a >= 1970) || !faixaOk(a, m, x)) return 0;
    for (i = 1970; i < a; i++) n += bissexto(i) ? 366 : 365;
    for (i = 1; i < m; i++) n += DIAS_MES[i - 1] + (i === 2 && bissexto(a) ? 1 : 0);
    return n + x - 1;
  }
  function deSerial(n) {
    /* ⚠ E AQUI O LAÇO TEM FIM ESCRITO. Com n = NaN as comparações são todas
       falsas e o `while (true)` gira até a aba morrer — sem erro no console,
       porque não há exceção nenhuma, só a thread da tela parada. Uma data
       vazia é um defeito visível; uma aba congelada não é nem diagnosticável. */
    if (!isFinite(n) || n < 0) return "";
    var a = 1970, m = 1, dd, g;
    for (g = 0; g < 4000; g++) { var t = bissexto(a) ? 366 : 365; if (n < t) break; n -= t; a++; }
    for (g = 0; g < 24; g++) { var t2 = DIAS_MES[m - 1] + (m === 2 && bissexto(a) ? 1 : 0); if (n < t2) break; n -= t2; m++; }
    if (m > 12) return "";
    dd = n + 1;
    return a + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
  }
  function diasEntre(a, b) { return serial(b) - serial(a); }
  function somaDias(d, n) { return deSerial(serial(d) + n); }

  /* ---------------------------------------------------------------------
   * IMPORTAÇÃO
   * ------------------------------------------------------------------- */

  /* CSV: nome;wbs;inicio;fim;tipo;alvo  — separador ; ou , detectado */
  function importarCsv(texto, opts) {
    opts = opts || {};
    var linhas = txt(texto).split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!linhas.length) return { ok: false, erro: "arquivo vazio", tarefas: [] };
    var sep = (linhas[0].split(";").length > linhas[0].split(",").length) ? ";" : ",";
    var cab = linhas[0].split(sep).map(function (c) { return txt(c).trim().toLowerCase().replace(/^"|"$/g, ""); });
    function col() {
      for (var i = 0; i < arguments.length; i++) {
        var k = cab.indexOf(arguments[i]);
        if (k > -1) return k;
      }
      return -1;
    }
    var cNome = col("nome", "tarefa", "name", "atividade");
    var cIni = col("inicio", "início", "previstoinicio", "start", "data inicio");
    var cFim = col("fim", "termino", "término", "previstofim", "finish", "data fim");
    if (cNome < 0 || cIni < 0 || cFim < 0) {
      return { ok: false, tarefas: [], erro: "não achei as colunas obrigatórias. O arquivo precisa de uma linha de cabeçalho com, no mínimo: nome, inicio, fim." };
    }
    var cWbs = col("wbs", "edt", "codigo", "código");
    var cTipo = col("tipo", "tipotarefa");
    var cAlvo = col("alvo", "conjunto", "etapa");
    var cRi = col("realinicio", "inicio real", "início real");
    var cRf = col("realfim", "fim real", "termino real");
    var cPc = col("percentual", "%", "avanco", "avanço");

    /* ⚠ O ARQUIVO DECIDE O FORMATO, NÃO A LINHA. "03/05/2026" é 3 de maio para
       o Brasil e 5 de março para os Estados Unidos, e as duas leituras são
       datas válidas — nenhuma validação pega. Linha a linha, um cronograma em
       mm/dd/aaaa entrava metade trocado e calado, afirmando na régua um
       planejamento que ninguém fez. Varremos a coluna inteira antes: um campo
       acima de 12 diz de que lado ele está. Se os dois lados aparecerem, o
       arquivo é lixo e é recusado inteiro — misturar é pior que recusar.
       O sinal é por eliminação: campo acima de 12 NÃO pode ser mês, então ele é
       o dia — primeiro campo alto quer dizer dd/mm, segundo campo alto quer
       dizer mm/dd. */
    var colsData = [cIni, cFim, cRi, cRf].filter(function (k) { return k > -1; });
    var viPrimeiroAlto = false, viSegundoAlto = false, viBarra = false;
    for (var q = 1; q < linhas.length; q++) {
      var cq = linhas[q].split(sep);
      for (var w = 0; w < colsData.length; w++) {
        var mq = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt(cq[colsData[w]]).trim().replace(/^"|"$/g, ""));
        if (!mq) continue;
        viBarra = true;
        if (+mq[1] > 12) viPrimeiroAlto = true;
        if (+mq[2] > 12) viSegundoAlto = true;
      }
    }
    if (viPrimeiroAlto && viSegundoAlto) {
      return { ok: false, tarefas: [], erro: "as datas do arquivo estão em dois formatos ao mesmo tempo (dd/mm e mm/dd). Padronize a coluna de datas no Excel e importe de novo — adivinhar aqui seria inventar o seu cronograma." };
    }
    var ehMesPrimeiro = viSegundoAlto;             /* mm/dd/aaaa */
    /* ambíguo é só quando HÁ data com barra e ela não se denuncia; arquivo em
       ISO não tem ambiguidade nenhuma e não merece o aviso. */
    var formatoAmbiguo = viBarra && !viPrimeiroAlto && !viSegundoAlto;
    function normData(v) {
      var s = txt(v).trim().replace(/^"|"$/g, "");
      if (!ehMesPrimeiro) return s;
      var m2 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      return m2 ? (m2[2] + "/" + m2[1] + "/" + m2[3]) : s;
    }

    var out = [], erros = [];
    for (var i = 1; i < linhas.length; i++) {
      var c = linhas[i].split(sep).map(function (x) { return txt(x).trim().replace(/^"|"$/g, ""); });
      var t = tarefa({
        obraId: opts.obraId, nome: c[cNome], wbs: cWbs > -1 ? c[cWbs] : "",
        previstoInicio: normData(c[cIni]), previstoFim: normData(c[cFim]),
        realInicio: cRi > -1 ? normData(c[cRi]) : "", realFim: cRf > -1 ? normData(c[cRf]) : "",
        percentual: cPc > -1 ? String(c[cPc]).replace("%", "").replace(",", ".") : 0,
        tipoTarefa: cTipo > -1 ? txt(c[cTipo]).toLowerCase() : "construir",
        alvo: (cAlvo > -1 && c[cAlvo]) ? { tipo: "conjunto", ref: c[cAlvo] } : { tipo: "auto" },
        origem: "csv"
      });
      var v = validar(t);
      /* ⚠ A LINHA RUIM NÃO DERRUBA O ARQUIVO, e também não entra calada. Um
         cronograma de 300 linhas com duas datas invertidas tem 298 boas; parar
         tudo faria o engenheiro procurar no Excel sem saber onde. As recusadas
         voltam com o número da linha. */
      if (v.ok) out.push(t);
      else erros.push({ linha: i + 1, nome: txt(c[cNome]), motivos: v.erros });
    }
    return { ok: out.length > 0, tarefas: out, recusadas: erros, total: linhas.length - 1,
      formato: ehMesPrimeiro ? "mm/dd/aaaa" : "dd/mm/aaaa", formatoAmbiguo: formatoAmbiguo };
  }

  /* MSPDI (XML do MS Project). Leitura mínima e honesta: nome, WBS, datas e
     percentual. Não lê calendário, recurso nem dependência — e diz isso. */
  function importarMspdi(xml, opts) {
    opts = opts || {};
    var s = txt(xml);
    if (!/<Project[\s>]/i.test(s)) return { ok: false, tarefas: [], erro: "não parece um arquivo MSPDI (XML do MS Project)." };
    var out = [], erros = [], n = 0;
    var re = /<Task>([\s\S]*?)<\/Task>/gi, m;
    function campo(bloco, nome) {
      var r = new RegExp("<" + nome + ">([\\s\\S]*?)</" + nome + ">", "i").exec(bloco);
      return r ? txt(r[1]).trim() : "";
    }
    while ((m = re.exec(s))) {
      var b = m[1];
      n++;
      /* a tarefa-resumo (Summary=1) é agrupador: as filhas já cobrem o período,
         e importá-la pintaria a obra inteira em cada nível da EDT */
      if (/^1$/.test(campo(b, "Summary"))) continue;
      var nome = campo(b, "Name");
      if (!nome) continue;
      var t = tarefa({
        obraId: opts.obraId, nome: nome, wbs: campo(b, "WBS"),
        previstoInicio: campo(b, "Start"), previstoFim: campo(b, "Finish"),
        realInicio: campo(b, "ActualStart"), realFim: campo(b, "ActualFinish"),
        percentual: campo(b, "PercentComplete"),
        tipoTarefa: "construir", alvo: { tipo: "auto" }, origem: "mspdi"
      });
      var v = validar(t);
      if (v.ok) out.push(t); else erros.push({ linha: n, nome: nome, motivos: v.erros });
    }
    return {
      ok: out.length > 0, tarefas: out, recusadas: erros, total: n,
      naoLido: ["calendário de trabalho", "recursos", "dependências entre tarefas"]
    };
  }

  /* ---------------------------------------------------------------------
   * Resumo previsto × real, que é o número que vai para o relatório
   * ------------------------------------------------------------------- */
  function resumo(tarefas, hoje) {
    var h = dia(hoje);
    var r = { total: 0, concluidas: 0, emExecucao: 0, atrasadas: 0, naoIniciadas: 0, semAlvo: 0, diasDeAtraso: 0 };
    (tarefas || []).forEach(function (bruta) {
      var t = tarefa(bruta);
      r.total++;
      if (txt(t.alvo.tipo) === "auto") r.semAlvo++;
      var e = h ? estadoEm(t, h, h) : "futuro";
      if (e === "concluido" || e === "removido") r.concluidas++;
      else if (e === "atrasado") {
        r.atrasadas++;
        if (t.previstoFim && h > t.previstoFim) r.diasDeAtraso = Math.max(r.diasDeAtraso, diasEntre(t.previstoFim, h));
      } else if (e === "em-execucao") r.emExecucao++;
      else r.naoIniciadas++;
    });
    return r;
  }

  var BimTarefa = {
    TIPOS: TIPOS,
    TIPOS_ALVO: TIPOS_ALVO,
    ESTADOS: ESTADOS,
    APARENCIA_PADRAO: APARENCIA_PADRAO,
    COR_EXECUCAO: COR_EXECUCAO,
    dia: dia,
    serial: serial,
    diasEntre: diasEntre,
    somaDias: somaDias,
    alvo: alvo,
    tarefa: tarefa,
    validar: validar,
    estadoEm: estadoEm,
    aparenciaDe: aparenciaDe,
    resolverAlvo: resolverAlvo,
    simular: simular,
    janela: janela,
    importarCsv: importarCsv,
    importarMspdi: importarMspdi,
    resumo: resumo
  };

  global.BimTarefa = BimTarefa;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTarefa;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

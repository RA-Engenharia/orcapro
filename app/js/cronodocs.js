/* =====================================================================
 * cronodocs.js — MOTOR dos DOCUMENTOS do cronograma (puro, sem DOM).
 *
 * O QUE É: as quatro peças que o canteiro, a fiscalização, o contratante e a
 * diretoria pedem em PAPEL e que hoje o engenheiro monta à mão no Word:
 *   fisicoFinanceiro(orc, r, opc)  → a matriz ETAPA × MÊS (Lei 14.133/2021 e
 *       Decreto 7.983/2013 vinculam medição e pagamento a ela)
 *   relatorioMensal(dados)         → o relatório mensal de acompanhamento
 *   lookahead(dados, semanas)      → o quadro de 3 semanas do canteiro (LPS)
 *   resumoExecutivo(dados)         → a folha da diretoria
 *
 * ⚠ MOTOR PURO: aqui NÃO se monta HTML e NÃO se lê `Store`. Toda função
 *   devolve DADOS; quem desenha (js/cronopdf.js e a fiação da tela) escapa o
 *   texto e escolhe o papel.
 *
 * ⚠⚠ PENDÊNCIA DE FIAÇÃO — SEM ESTA LINHA O MÓDULO NÃO EXISTE NO NAVEGADOR.
 *   ARQUIVO:  index.html (hoje só tem <script src="js/cronopdf.js"> na
 *             linha 119; NÃO há tag para este arquivo).
 *   CONTRATO: acrescentar, no bloco dos módulos do cronograma,
 *                 <script src="js/cronodocs.js"></script>
 *             A POSIÇÃO É LIVRE: este módulo resolve Cronograma, Orcamento,
 *             LastPlanner, RDO e Util por `dep()` NA HORA DA CHAMADA (ver
 *             `dep`, logo abaixo), nunca no carregamento.
 *   SEM ELA:  `CronoDocs` é `undefined` no app; as quatro portas do papel
 *             (CronoPDF.gerarFisicoFinanceiro / gerarRelatorioMensal /
 *             gerarLookahead / gerarResumoExecutivo) nunca recebem payload e
 *             `CronoPDF.gerarDocumento()` cai no `_docErro`. Motor sem fiação
 *             é recurso inerte — já aconteceu nesta base um recurso inteiro
 *             passar no gate com 52 asserts e não existir na tela (CLAUDE.md
 *             §1, memória "Motor puro não cobre a fiação").
 *   GUARDA:   tools/test-cronodocs.js, bloco "fiação", lê o index.html e
 *             exige a tag — enquanto ela faltar, a suíte fica VERMELHA de
 *             propósito. Silêncio aqui é o defeito.
 *
 * ⚠ AS QUATRO REGRAS QUE NÃO CEDEM
 *  1) DINHEIRO É PREÇO DE VENDA, E SÓ. Nenhuma conta daqui aceita
 *     `etapa.custo`. Sem `Orcamento.sintetico`/`valoresEAP`, a função
 *     RECUSA com o motivo — nunca cai no custo direto "para não ficar
 *     vazio". Imprimir custo ao lado do preço entrega a margem para quem
 *     está do outro lado da mesa (a mesma doutrina de cronopdf.js:12-16 e
 *     cronoplan.js:21-25).
 *  2) A GUARDA DO PÚBLICO MORA NUM LUGAR SÓ (`publico` + `_guardar`).
 *     Espalhar `if (interno)` pelos quatro geradores é como a regra se
 *     perde: basta o quinto documento esquecer um `if`. Campo que o nível
 *     não pode ver é RETIRADO do payload e o motivo vai em `foraDaConta`.
 *  3) NENHUM NÚMERO SEM FONTE. Todo indicador sai como {valor, fonte,…}.
 *     O que não pôde ser medido não vira zero: vira `null` + uma linha em
 *     `foraDaConta` dizendo por quê. "Recado que mente é pior que recado
 *     nenhum" — e null desenhado como zero já virou queda a pique na tela
 *     do contratante (memória "Portal lê null como zero").
 *  4) NOME DE TRABALHADOR NUNCA SAI, em nível nenhum — nem no documento
 *     interno, porque o documento interno vaza para o mesmo e-mail. O
 *     diário entra por ALLOWLIST de campos (`_doDiario`), como o
 *     `RDO.paraPortal` já faz; campo não listado não sobe.
 *
 * Dependências (Cronograma, Orcamento, LastPlanner, Util) são lidas NA HORA
 * DA CHAMADA e podem ser INJETADAS por `opc`/`dados` — em Node a suíte passa
 * o módulo em mãos, e no index.html a ordem de carga não é garantida.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }
  function arr(x) { return Array.isArray(x) ? x : (x == null || x === "" ? [] : [x]); }
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }

  /* ⚠ NÃO SE COPIA O PARSER DE NÚMERO. Réplica de `Util.parseNum` apodrece
     calada: esta base já teve 33 módulos com a própria cópia e dois erros
     opostos, os dois movendo dinheiro. Com o `Util` à mão, é ele; sem ele, só
     número de verdade passa — string em formato BR vira 0 e o chamador
     descobre na hora, em vez de o documento inventar um valor. */
  function n0(v) {
    var U = dep("Util", "./util.js");
    if (U && typeof U.num === "function") return U.num(v);
    return (typeof v === "number" && isFinite(v)) ? v : 0;
  }
  function ehNum(v) { return typeof v === "number" && isFinite(v); }
  /* ⚠ NÚMERO DENTRO DE FRASE TAMBÉM É PT-BR. A concatenação crua imprimia
     "0.13 p.p./mês" e "R$ 4814351.16" no meio de um texto que, três linhas
     acima, dizia "0,13" — lido na folha da diretoria em 12/09/2026. Ponto
     decimal em documento brasileiro é lido como separador de milhar. */
  function nbr(v, casas) {
    if (!ehNum(v)) return "—";
    var c = (casas === 0 || casas > 0) ? casas : 2;
    return v.toFixed(c).replace(".", ",");
  }
  function mbr(v) {
    var U = dep("Util", "./util.js");
    if (U && typeof U.fmtMoeda === "function") { try { return U.fmtMoeda(v); } catch (e) { /* cai no fallback */ } }
    return "R$ " + nbr(v, 2);
  }
  function r2(v) { return Math.round(n0(v) * 100) / 100; }
  function r1(v) { return Math.round(n0(v) * 10) / 10; }
  function txt(v) { return v == null ? "" : String(v); }

  var MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function iso10(d) {
    if (d && typeof d.getTime === "function" && !isNaN(d.getTime())) {
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    }
    var s = txt(d).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }
  function chaveMes(v) {
    if (v && typeof v.getTime === "function" && !isNaN(v.getTime())) return v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2);
    var s = txt(v).slice(0, 7);
    return /^\d{4}-\d{2}$/.test(s) ? s : "";
  }
  function rotuloMes(chave) {
    if (!/^\d{4}-\d{2}$/.test(txt(chave))) return "";
    var m = parseInt(chave.slice(5, 7), 10);
    if (!(m >= 1 && m <= 12)) return "";
    return MES3[m - 1] + "/" + chave.slice(2, 4);
  }
  // último dia do mês "AAAA-MM" (data local, nunca toISOString: em UTC-3 ele volta um dia)
  function fimDoMes(chave) {
    var a = parseInt(chave.slice(0, 4), 10), m = parseInt(chave.slice(5, 7), 10);
    var d = new Date(a, m, 0);
    return iso10(d);
  }
  function diasNoMes(chave) {
    var a = parseInt(chave.slice(0, 4), 10), m = parseInt(chave.slice(5, 7), 10);
    return new Date(a, m, 0).getDate();
  }
  function dataLocal(iso) {
    var s = iso10(iso);
    if (!s) return null;
    var d = new Date(+s.slice(0, 4), (+s.slice(5, 7)) - 1, +s.slice(8, 10));
    return isNaN(d.getTime()) ? null : d;
  }

  /* =====================================================================
     NÍVEL DE PÚBLICO — a allowlist do que pode sair no papel (D12).
     O precedente da casa é `RDO.paraPortal`: campo não listado não sobe.

     ⚠ FOLGA E CAMINHO CRÍTICO FICAM FORA DO DOCUMENTO DO CLIENTE NESTE
       MOTOR, por decisão da frente (11/09/2026). O `js/cronopdf.js` imprime
       os dois para o cliente de propósito, e a seção 5 dele os explica —
       NÃO foi tocado (a paridade byte a byte com o master b8907ef o
       vigia). As duas réguas convivem porque são documentos diferentes; a
       unificação é decisão do Rogério e está registrada como pendência.
       Quem "simplificar" isto sem ler os dois lados reabre a divergência.

     ⚠ NOME DE TRABALHADOR: `false` em TODOS os níveis, inclusive interno —
       não há nível que o ligue, de propósito (js/producao.js, regra 1).
     ===================================================================== */
  var NIVEIS = ["interno", "canteiro", "fiscalizacao", "cliente"];
  var PERMS = {
    interno:      { custoDireto: true,  margem: true,  folga: true,  caminhoCritico: true,  restricoes: true,  causasPPC: true,  avisosInternos: true },
    canteiro:     { custoDireto: false, margem: false, folga: true,  caminhoCritico: true,  restricoes: true,  causasPPC: true,  avisosInternos: false },
    fiscalizacao: { custoDireto: false, margem: false, folga: false, caminhoCritico: false, restricoes: false, causasPPC: false, avisosInternos: false },
    cliente:      { custoDireto: false, margem: false, folga: false, caminhoCritico: false, restricoes: false, causasPPC: false, avisosInternos: false }
  };
  var ROTULO_NIVEL = {
    interno: "USO INTERNO",
    canteiro: "QUADRO DO CANTEIRO",
    fiscalizacao: "FISCALIZAÇÃO",
    cliente: "CLIENTE / CONTRATANTE"
  };

  /* ⚠ TOKEN DO MOTOR NÃO VAI AO PAPEL. `painel.fonteCorte` só pode ser
     "informada", "ultimoDiario" ou "hoje" (js/cronoplan.js:899-902) — é
     identificador de código, não frase. Saía impresso cru, entre parênteses,
     na folha da diretoria e na da fiscalização: «Data de corte: 13/01/2027
     (ultimoDiario)». Token que não estiver aqui não vira parêntese nenhum —
     inventar uma tradução seria pior que não traduzir. */
  var ROTULO_CORTE = {
    informada: "data escolhida pelo responsável",
    ultimoDiario: "último diário publicado",
    hoje: "data de hoje"
  };

  /* Campos que a guarda retira quando o nível não permite. O nome do campo é
     o contrato: quem criar um campo novo com dinheiro de custo ou com folga
     tem de usar UM DESTES nomes, senão a guarda não o vê (é a limitação
     conhecida, e por isso a suíte varre o payload inteiro atrás dos valores,
     não só das chaves).

     ⚠ CADA ENTRADA TEM DUAS FACES, E ISSO NÃO É REDUNDÂNCIA.
       `motivo`  = a DOUTRINA, escrita para quem mantém o código: por que a
                   casa decidiu barrar o campo. Vai para o log e para o nível
                   interno. NUNCA é impressa em documento de fora.
       `rotulo`  = o nome do campo em português, para o leitor.
       `publico` = a frase que PODE ser impressa em qualquer nível.
     O roteiro do defeito (achado em 12/09/2026, com a folha na mão): o
     `_guardar` montava a declaração do que retirou com o `motivo` dentro, e o
     papel da fiscalização saía dizendo «restrição aberta diz onde a NOSSA
     gestão falhou — no documento do contratante vira prova contra», três
     vezes na mesma folha. O conserto anterior (11/09) barrou a DESCRIÇÃO da
     restrição e deixou passar a doutrina: a guarda protegia o dado e
     entregava o motivo da guarda. Declarar o que se retirou é obrigação;
     reimprimir o porquê interno é o vazamento. */
  var RESTRITOS = [
    { campo: "custoDireto", perm: "custoDireto", rotulo: "custo direto",
      motivo: "custo direto não sai em documento fora da empresa — ao lado do preço de venda ele entrega a margem",
      publico: "valor de custo não faz parte deste documento; a coluna de dinheiro é o preço de venda" },
    { campo: "custo", perm: "custoDireto", rotulo: "custo",
      motivo: "custo direto não sai em documento fora da empresa — ao lado do preço de venda ele entrega a margem",
      publico: "valor de custo não faz parte deste documento; a coluna de dinheiro é o preço de venda" },
    { campo: "margem", perm: "margem", rotulo: "margem",
      motivo: "a margem do escritório não sai em documento fora da empresa",
      publico: "informação comercial interna, fora do escopo deste documento" },
    { campo: "folga", perm: "folga", rotulo: "folga",
      motivo: "folga não entra neste nível de documento (decisão da frente 11/09/2026)",
      publico: "campo de planejamento interno, fora do escopo deste documento" },
    { campo: "folgaDias", perm: "folga", rotulo: "folga (dias)",
      motivo: "folga não entra neste nível de documento (decisão da frente 11/09/2026)",
      publico: "campo de planejamento interno, fora do escopo deste documento" },
    { campo: "folgaMinimaDias", perm: "folga", rotulo: "menor folga",
      motivo: "folga não entra neste nível de documento (decisão da frente 11/09/2026)",
      publico: "campo de planejamento interno, fora do escopo deste documento" },
    { campo: "critico", perm: "caminhoCritico", rotulo: "etapa crítica",
      motivo: "caminho crítico não entra neste nível de documento (decisão da frente 11/09/2026)",
      publico: "campo de planejamento interno, fora do escopo deste documento" },
    { campo: "caminhoCritico", perm: "caminhoCritico", rotulo: "caminho crítico",
      motivo: "caminho crítico não entra neste nível de documento (decisão da frente 11/09/2026)",
      publico: "campo de planejamento interno, fora do escopo deste documento" },
    { campo: "restricoes", perm: "restricoes", rotulo: "restrições",
      motivo: "restrição aberta diz onde a NOSSA gestão falhou — no documento do contratante vira prova contra",
      publico: "controle interno de execução, fora do escopo deste documento" },
    { campo: "restricoesPendentes", perm: "restricoes", rotulo: "restrições pendentes",
      motivo: "restrição aberta diz onde a NOSSA gestão falhou — no documento do contratante vira prova contra",
      publico: "controle interno de execução, fora do escopo deste documento" },
    { campo: "aLiberar", perm: "restricoes", rotulo: "restrições a liberar",
      motivo: "restrição aberta diz onde a NOSSA gestão falhou — no documento do contratante vira prova contra",
      publico: "controle interno de execução, fora do escopo deste documento" },
    { campo: "causa", perm: "causasPPC", rotulo: "causa de não cumprimento",
      motivo: "causa de não cumprimento é melhoria contínua interna, não peça de documento externo",
      publico: "controle interno de execução, fora do escopo deste documento" },
    { campo: "causas", perm: "causasPPC", rotulo: "causas de não cumprimento",
      motivo: "causa de não cumprimento é melhoria contínua interna, não peça de documento externo",
      publico: "controle interno de execução, fora do escopo deste documento" },
    { campo: "avisosInternos", perm: "avisosInternos", rotulo: "avisos internos",
      motivo: "recado interno do motor não vai ao papel de fora (mesma regra de CronoPDF._avisosPapel)",
      publico: "recado de operação do sistema, fora do escopo deste documento" }
  ];
  // chaves que a guarda não atravessa: são o registro dela mesma
  var NAO_VARRER = { avisos: 1, foraDaConta: 1, publico: 1 };

  function _guardar(raiz, P, foraDaConta) {
    var tirados = {}, algum = false;
    function varrer(o, prof) {
      if (!o || typeof o !== "object" || prof > 14) return;
      if (Array.isArray(o)) {
        for (var i = 0; i < o.length; i++) varrer(o[i], prof + 1);
        return;
      }
      var k;
      for (k = 0; k < RESTRITOS.length; k++) {
        var c = RESTRITOS[k];
        if (own(o, c.campo) && P[c.perm] !== true) { delete o[c.campo]; tirados[c.campo] = c; algum = true; }
      }
      var ks = Object.keys(o);
      for (k = 0; k < ks.length; k++) { if (!NAO_VARRER[ks[k]]) varrer(o[ks[k]], prof + 1); }
    }
    varrer(raiz, 0);
    if (algum) {
      Object.keys(tirados).forEach(function (c) {
        var R = tirados[c];
        foraDaConta.push({ tipo: "publico", campo: c, perm: R.perm, rotulo: R.rotulo,
          /* ⚠ `msg` é a face PÚBLICA: ela pode ser impressa em qualquer nível.
             A doutrina fica em `motivoTecnico`, que só o nível interno lê. */
          msg: "“" + R.rotulo + "” ficou fora do documento de nível " + P.rotulo + ": " + R.publico + ".",
          motivoTecnico: R.motivo });
      });
    }
    return raiz;
  }

  /* =====================================================================
     PEÇAS COMUNS
     ===================================================================== */

  // {valor, fonte} — o formato de TODO número que sai daqui (regra 3)
  function kpi(id, rotulo, valor, unidade, fonte, extra) {
    var k = { id: id, rotulo: rotulo, valor: (valor == null ? null : valor), unidade: unidade || "", fonte: fonte || "" };
    if (extra) { Object.keys(extra).forEach(function (x) { k[x] = extra[x]; }); }
    return k;
  }

  /* ALLOWLIST do diário (regra 4). Só estes campos atravessam para o
     documento — `efetivo` (que tem NOME de pessoa) e `producao` (que tem
     nome e o que a pessoa recebe) não estão na lista, e é de propósito.
     O que sai do efetivo é a CONTAGEM por função, como o Portal já faz. */
  function _doDiario(r, RDOm) {
    if (!r) return null;
    var tEf = null;
    if (RDOm && typeof RDOm.totaisEfetivo === "function") {
      try { tEf = RDOm.totaisEfetivo(r.efetivo); } catch (e) { tEf = null; }
    }
    var cl = r.clima || null;
    return {
      id: txt(r.id), numero: txt(r.numero), data: iso10(r.data),
      condicao: txt(r.condicao),
      ocorrencias: txt(r.ocorrencias),
      ocorrenciasItens: arr(r.ocorrenciasItens).map(function (x) {
        return { tipo: txt(x && x.tipo), descricao: txt(x && x.descricao), horasParadas: n0(x && x.horasParadas) };
      }),
      paralisacao: (r.paralisacao && r.paralisacao.houve)
        ? { inicio: iso10(r.paralisacao.inicio), fim: iso10(r.paralisacao.fim), motivo: txt(r.paralisacao.motivo) } : null,
      clima: cl ? { descricao: txt(cl.descricao), chuvaMm: n0(cl.chuvaMm), chuvaHoras: n0(cl.chuvaHoras),
        fonte: txt(cl.fonte), verificavel: !!txt(cl.fonte) } : null,
      /* contagem por função, nunca a lista de pessoas */
      efetivo: tEf ? { pessoas: n0(tEf.pessoas), horas: n0(tEf.horas), porFuncao: tEf.porFuncao || {},
        fonte: "contagem por função do diário — sem nome de pessoa" } : null
    };
  }

  /* Dias com chuva no mês, separando o que tem FONTE EXTERNA verificável do
     que foi digitado à mão. É a regra que sustenta o pleito se a fiscalização
     contestar — e por isso o número que NÃO tem fonte sai declarado, nunca
     somado calado ao que tem. */
  function _clima(diarios) {
    var comFonte = 0, semFonte = 0, chuvaMm = 0, impraticaveis = 0, dias = [];
    diarios.forEach(function (d) {
      if (!d) return;
      var temChuva = !!(d.clima && d.clima.chuvaMm > 0);
      var impr = d.condicao === "impraticavel";
      if (impr) impraticaveis++;
      if (!temChuva && !impr) return;
      if (d.clima && d.clima.verificavel) { comFonte++; chuvaMm += d.clima.chuvaMm; }
      else semFonte++;
      dias.push({ data: d.data, condicao: d.condicao, chuvaMm: d.clima ? d.clima.chuvaMm : 0,
        fonte: d.clima ? d.clima.fonte : "", verificavel: !!(d.clima && d.clima.verificavel) });
    });
    return { diasComChuvaOuParada: dias.length, comFonteExterna: comFonte, semFonteExterna: semFonte,
      impraticaveis: impraticaveis, chuvaMmComFonte: r1(chuvaMm), dias: dias,
      fonte: "diários do mês (clima do RDO; campo “fonte” preenchido = medição externa verificável)" };
  }

  var CronoDocs = {

    NIVEIS: NIVEIS,

    /* O objeto de permissões do nível. Nível desconhecido ou ausente cai no
       MAIS RESTRITIVO ("cliente") de propósito: quem esquecer o argumento
       recebe o documento que não vaza, não o que vaza. */
    publico: function (nivel) {
      var n = txt(nivel).toLowerCase();
      if (!PERMS[n]) n = "cliente";
      var p = PERMS[n], o = { nivel: n, rotulo: ROTULO_NIVEL[n], nomeTrabalhador: false };
      Object.keys(p).forEach(function (k) { o[k] = p[k]; });
      return o;
    },

    /* =================================================================
       D1 — CRONOGRAMA FÍSICO-FINANCEIRO em matriz ETAPA × MÊS.

       É o documento que licitação, banco e fiscalização pedem, e o dado já
       existia calculado e ÓRFÃO: `Cronograma.periodos(r,{valores}).porEtapa`
       (js/cronograma.js:288) não era lido por ninguém fora do
       `Orcamento.cronograma`, que só vai ao Excel e à proposta.

       ⚠ UMA PASSADA SÓ. `periodos` é chamado UMA vez e a matriz sai de
         `porEtapa`. Chamar `periodos` por etapa custava N+2 estimativas de
         CPM — a aba do orçamento travava por segundos a cada render (o
         motivo está escrito em js/orcamento.js:1620).

       opc:
         valores  {etapaId: R$} ou {ok, porId} do `Orcamento.valoresEAP`
         meses    prazo pedido (colunas); o que passar dele se acumula na
                  última coluna visível e vira AVISO de estouro
         opcionaisIncluidos  ids das etapas opcionais que ENTRAM no total
                  (padrão: nenhuma — é o que a proposta imprime)
         publico  nível do documento
         Cronograma / Orcamento  módulos injetados (Node, teste)
       ================================================================= */
    fisicoFinanceiro: function (orc, r, opc) {
      opc = opc || {};
      var P = this.publico(opc.publico);
      var out = { ok: false, publico: P, base: null, fonte: "", fonteValor: null,
        meses: 0, rotulos: [], linhas: [], totaisMes: [], pctMes: [], acumValor: [], acumPct: [],
        total: 0, estouro: 0, conferencia: null, avisos: [], foraDaConta: [] };
      /* ⚠ `interno` marca o recado que é INSTRUÇÃO AO NOSSO ENGENHEIRO. Ele
         existe, vai ao log e ao documento interno — e NÃO vai ao papel de fora
         (mesma régua do CronoPDF._avisosPapel, que é allowlist desde sempre).
         Sem essa marca, o quadro da fiscalização saía com «resolva a restrição
         ou tire a tarefa do plano da semana» impresso para o contratante. */
      function aviso(tipo, msg, interno) { out.avisos.push({ tipo: tipo, msg: msg, interno: !!interno }); }
      function fora(tipo, msg, extra) {
        var x = { tipo: tipo, msg: msg };
        if (extra) Object.keys(extra).forEach(function (k) { x[k] = extra[k]; });
        out.foraDaConta.push(x);
      }
      function falha(msg) { out.erro = msg; return out; }

      var C = opc.Cronograma || dep("Cronograma", "./cronograma.js");
      if (!C || typeof C.periodos !== "function") return falha("motor do cronograma não carregado (js/cronograma.js) — sem ele não há distribuição por mês.");
      if (!orc || typeof orc !== "object") return falha("sem orçamento — a matriz físico-financeira é de um orçamento.");
      if (!r && typeof C.estimar === "function") { try { r = C.estimar(orc); } catch (e1) { r = null; } }
      if (!r || !arr(r.etapas).length) return falha("o orçamento não tem etapas datadas — lance as etapas e as durações antes de emitir a matriz físico-financeira.");
      if (!r.dataInicio || typeof r.dataInicio.getTime !== "function" || isNaN(r.dataInicio.getTime())) return falha("o cronograma não tem data de início calculada.");
      /* ⚠ O CRONOGRAMA TEM DE SER DESTE ORÇAMENTO. `r.etapas` é 1:1 com
         `orc.etapas` por contrato do motor (cinco consumidores casam por
         ÍNDICE), e é por índice que a coluna "opcional" e o código da etapa
         são lidos aqui. Com listas de tamanhos diferentes, a matriz sairia
         com a etapa de um orçamento carregando o "opcional" de outro — e
         nenhum assert de soma enxergaria a troca. */
      if (arr(orc.etapas).length !== r.etapas.length) {
        return falha("o cronograma calculado tem " + r.etapas.length + " etapa(s) e o orçamento tem " + arr(orc.etapas).length +
          " — ele não é deste orçamento. Recalcule Cronograma.estimar(orc) antes de emitir a matriz.");
      }

      /* ---- VALOR = PREÇO DE VENDA (regra 1). Sem ele a matriz NÃO SAI.
         ⚠ Aqui não existe o "cai no custo quando falta a venda" que o
         documento por etapa faz com o PESO: uma coluna de R$ por mês pelo
         custo direto é a planilha de custo da obra indo ao contratante. ---- */
      var vmap = {}, i;
      if (opc.valores && typeof opc.valores === "object") {
        if (opc.valores.ok === false) return falha(txt(opc.valores.motivo) || "valores de venda indisponíveis para este orçamento — a matriz físico-financeira não sai pelo custo direto.");
        var Vp = opc.valores.porId || opc.valores, faltam = [];
        r.etapas.forEach(function (e) { if (!own(Vp, e.id) || !ehNum(Vp[e.id])) faltam.push(txt(e.nome) || txt(e.id)); });
        if (faltam.length) return falha("os valores de venda recebidos não cobrem " + faltam.length + " etapa(s) deste orçamento (" + faltam.slice(0, 3).join(", ") + ") — a matriz não sai pelo custo direto.");
        r.etapas.forEach(function (e) { vmap[e.id] = Vp[e.id]; });
        out.fonteValor = "preço de venda por etapa do orçamento";
        out.fonteValorTecnica = "valores recebidos do chamador (Orcamento.valoresEAP)";
      } else {
        var O = opc.Orcamento || dep("Orcamento", "./orcamento.js");
        if (!O || typeof O.sintetico !== "function") return falha("módulo do orçamento não carregado (js/orcamento.js) — sem ele não há preço de venda por etapa, e a matriz nunca sai pelo custo direto.");
        var sint = null;
        try { sint = O.sintetico(orc); } catch (e2) { sint = null; }
        if (!sint || sint.length !== r.etapas.length) {
          return falha("o resumo por etapa do orçamento não casa com o cronograma (" + ((sint && sint.length) || 0) + " × " + r.etapas.length + " etapas) — a matriz não sai pelo custo direto.");
        }
        /* o sintético é mapeado de `orc.etapas` na MESMA ordem do motor de
           cronograma (os dois fazem map sobre a mesma lista), então o índice
           casa — é a regra que o cronopdf.js já usa e a paridade cobra */
        r.etapas.forEach(function (e, k) { vmap[e.id] = n0(sint[k].precoVenda); });
        out.fonteValor = "preço de venda por etapa do orçamento, com BDI";
        out.fonteValorTecnica = "Orcamento.sintetico";
      }

      var per = null;
      try { per = C.periodos(r, { valores: vmap }); } catch (e3) { per = null; }
      if (!per || !arr(per.lista).length) return falha("não consegui distribuir o valor das etapas nos meses do cronograma.");
      out.base = "gantt";
      out.fonte = "distribuição pelo cronograma da obra — cada etapa repartida pela DURAÇÃO real dela, com feriados descontados";
      out.fonteTecnica = "Cronograma.periodos(r, {valores})";
      if (r.temCiclo) {
        aviso("ciclo", "há dependência circular entre etapas: o elo que fecha o laço foi ignorado no cálculo das datas, e a distribuição por mês herda isso. Revise as precedências antes de usar esta matriz para medição.");
      }

      /* ---- opcionais: FORA do total por padrão, que é o que a proposta
         imprime. Elas continuam na matriz, marcadas — sumir com a etapa faria
         o leitor procurar uma linha que o orçamento tem. ---- */
      var incl = null;
      if (opc.opcionaisIncluidos != null) { incl = {}; arr(opc.opcionaisIncluidos).forEach(function (id) { incl[txt(id)] = 1; }); }
      var etOrc = arr(orc.etapas);

      // ---- colunas: prazo pedido manda; o excedente se acumula na última ----
      var nG = per.lista.length;
      var pedido = (opc.meses != null && opc.meses !== "") ? Math.max(1, Math.floor(n0(opc.meses))) : nG;
      var M = pedido;
      out.estouro = Math.max(0, nG - M);
      out.meses = M;
      var p0 = per.lista[0];
      for (i = 0; i < M; i++) {
        var pr = per.lista[i], rot;
        if (pr) rot = pr.rotulo;
        else { var dRef = new Date(p0.ano, p0.mes + i, 1); rot = MES3[dRef.getMonth()] + "/" + String(dRef.getFullYear()).slice(2); }
        out.rotulos.push((i === M - 1 && out.estouro) ? rot + "+" : rot);
      }
      if (out.estouro) {
        aviso("estouro-prazo", "o prazo pedido é de " + M + " mês(es) e o cronograma ocupa " + nG + ": os últimos " + out.estouro +
          " mês(es) foram somados na coluna " + out.rotulos[M - 1] + ". A matriz mostra o desembolso inteiro, mas não na data real dele.");
      }

      var totaisMes = [];
      for (i = 0; i < M; i++) totaisMes.push(0);
      var totalObra = 0, naoFecham = [];

      r.etapas.forEach(function (e, k) {
        var eo = etOrc[k] || {};
        var opcional = !!eo.opcional;
        var dentro = !opcional || !!(incl && incl[txt(e.id)] === 1);
        var col = arr(per.porEtapa && per.porEtapa[e.id]).slice();
        while (col.length < M) col.push(0);
        if (col.length > M) {
          var resto = 0;
          for (var q = M; q < col.length; q++) resto += col[q];
          col = col.slice(0, M);
          col[M - 1] += resto;
        }
        var totEt = r2(vmap[e.id]);
        var linha = { numero: k + 1, id: e.id, codigo: txt(eo.codigo || e.codigo), nome: txt(e.nome),
          opcional: opcional, foraDoTotal: !dentro, total: totEt, pctObra: null,
          meses: [], somaPctEtapa: null, fecha: null,
          categoria: txt(e.categoria), categoriaNome: txt(e.categoriaNome),
          inicio: iso10(e.dataInicio), fim: iso10(e.dataFim),
          marco: !!e.marco, folgaDias: n0(e.folga), critico: !!e.critico };
        var somaPct = 0, temPct = totEt > 0;
        for (i = 0; i < M; i++) {
          var v = r2(col[i]);
          var pe = temPct ? r2((col[i] / totEt) * 100) : null;
          if (temPct) somaPct += pe;
          linha.meses.push({ i: i, rotulo: out.rotulos[i], valor: v, pctEtapa: pe, pctObra: null });
          if (dentro) totaisMes[i] += col[i];
        }
        if (temPct) {
          linha.somaPctEtapa = r2(somaPct);
          /* a guarda do modelo consagrado: CADA LINHA tem de somar 100% da
             etapa. A tolerância é a mesma do Check do Excel (0,1%) — e quando
             não fecha, o documento DIZ que não fechou, nunca arredonda calado. */
          linha.fecha = Math.abs(somaPct - 100) <= 0.1;
          if (!linha.fecha) naoFecham.push(linha.numero + " " + linha.nome + " (" + r1(somaPct) + "%)");
        } else {
          fora("etapa-sem-valor", "a etapa " + (k + 1) + " “" + txt(e.nome) + "” está com preço de venda zero — a linha sai sem percentual (0 ÷ 0 não é 0%).", { id: e.id, numero: k + 1 });
        }
        if (dentro) totalObra += totEt; else fora("etapa-opcional", "a etapa " + (k + 1) + " “" + txt(e.nome) + "” é OPCIONAL e ficou fora do total e do acumulado — é o que a proposta imprime. Para incluí-la, marque-a como inclusa ao emitir o documento.", { id: e.id, numero: k + 1, valor: totEt });
        out.linhas.push(linha);
      });

      if (!(totalObra > 0)) return falha("a soma do preço de venda das etapas incluídas é zero — não há matriz físico-financeira para emitir.");

      var acum = 0;
      for (i = 0; i < M; i++) {
        var tm = r2(totaisMes[i]);
        acum += totaisMes[i];
        out.totaisMes.push(tm);
        out.pctMes.push(r2((totaisMes[i] / totalObra) * 100));
        out.acumValor.push(r2(acum));
        out.acumPct.push(r2((acum / totalObra) * 100));
      }
      out.total = r2(totalObra);
      out.linhas.forEach(function (L) {
        if (L.foraDoTotal) return;   // % da obra de quem está fora do total inflaria a coluna
        L.pctObra = r2((L.total / totalObra) * 100);
        L.meses.forEach(function (c) { c.pctObra = r2((c.valor / totalObra) * 100); });
      });

      if (naoFecham.length) {
        aviso("linha-nao-fecha", naoFecham.length + " linha(s) não somam 100% da própria etapa: " + naoFecham.slice(0, 3).join(" · ") +
          (naoFecham.length > 3 ? " e mais " + (naoFecham.length - 3) : "") + ". Confira antes de vincular medição a esta matriz.");
      }

      /* CONFERÊNCIA HONESTA, e com a conta escrita: a soma da matriz tem de
         ser o total que o `periodos` distribuiu MENOS o que saiu do total
         (as opcionais não incluídas). Não é decoração — é o assert que pega a
         matriz montada sobre outro mapa de valores, e é ele que impede o
         documento de fechar "100%" sobre uma base que não é a dele. */
      var foraTotal = 0;
      out.linhas.forEach(function (L) { if (L.foraDoTotal) foraTotal += L.total; });
      var esperado = r2(r2(per.total) - foraTotal);
      var difPer = r2(out.total - esperado);
      out.conferencia = { totalMatriz: out.total, totalPeriodos: r2(per.total), valorForaDoTotal: r2(foraTotal),
        esperado: esperado, diferenca: difPer, confere: Math.abs(difPer) <= 0.01,
        fonte: "soma das linhas incluídas × (total distribuído pelo cronograma − etapas opcionais fora do total)" };
      if (!out.conferencia.confere) {
        aviso("conferencia", "a soma da matriz (" + mbr(out.total) + ") não bate com o que o cronograma distribuiu (" + mbr(esperado) +
          ", já descontadas as opcionais fora do total) — diferença de " + mbr(difPer) + ". Não use esta matriz para medição antes de achar a diferença.");
      }

      /* ⚠ O RÓTULO TEM DE FECHAR COM A CONTA. Este número é `equipeDias ÷
         diasUteis` do mês (js/cronograma.js:281): a EXIGÊNCIA MÉDIA DE EQUIPES
         por dia de trabalho. Ele saía chamado de "frentes simultâneas
         (média)", e numa obra em que no máximo 2 etapas acontecem ao mesmo
         tempo o papel afirmava "29,9 frentes simultâneas" — 15 vezes o máximo
         físico (medido em 12/09/2026, varrendo dia útil a dia útil). O ⚠ que
         acompanhava a frase avisava do risco errado ("frente não é pessoa") e
         não do que estava errado de fato. Ao lado vai o número de ETAPAS
         ABERTAS no mesmo mês, que é o que o leitor confere contra o Gantt. */
      var etNoPico = (per.mesPico && arr(per.mesPico.etapas).length) || 0;
      var maxEt = 0;
      per.lista.forEach(function (p2) { var q2 = arr(p2.etapas).length; if (q2 > maxEt) maxEt = q2; });
      out.picoFrentes = { valor: n0(per.picoFrentes), unidade: "equipes/dia (média do mês)",
        mes: per.mesPico ? per.mesPico.rotulo : null,
        etapasNoMes: etNoPico, maxEtapasAbertasNoMes: maxEt,
        conta: "dias-equipe do mês ÷ dias de trabalho do mês",
        fonte: "exigência MÉDIA de equipes por dia de trabalho no mês de maior carga. ⚠ não é contagem de frentes abertas, e não é pessoa: o motor sabe quantos dias-equipe a etapa consome, não de quantas pessoas a equipe é feita" };

      out.ok = true;
      return _guardar(out, P, out.foraDaConta);
    },

    /* =================================================================
       D4 — RELATÓRIO MENSAL DE ACOMPANHAMENTO (espinha do modelo oficial
       DEINFRA/SC, caps. 1-13, reduzida ao que serve a obra de edificação).

       ⚠ TUDO INJETADO. Este motor não abre `Store`: quem chama passa obra,
         orçamento, painel (`CronoPlan.montarPainel`), diários, medições,
         fotos e o plano do Last Planner. Sem isso a suíte não conseguiria
         fixar o relógio nem provar de onde veio cada número.

       dados = {
         obra, orc, r, painel, contrato, equipe, empresa,
         mes: "AAAA-MM", numero: nº do relatório, hoje,
         rdos: [...], medicoes: [...], fotos: [...], fotoIds: [...],
         lastplanner: {tarefas:[...]}, consideracoes: {...},
         fisicoFinanceiro: <resultado de fisicoFinanceiro> (ou calcula),
         publico, RDO, LastPlanner, Cronograma, Orcamento
       }
       ================================================================= */
    relatorioMensal: function (dados) {
      dados = dados || {};
      var self = this;
      var P = this.publico(dados.publico || "fiscalizacao");
      var out = { ok: false, publico: P, mes: "", rotuloMes: "", periodo: null, numero: null,
        secoes: [], verificacao: [], avisos: [], foraDaConta: [] };
      /* ⚠ `interno` marca o recado que é INSTRUÇÃO AO NOSSO ENGENHEIRO. Ele
         existe, vai ao log e ao documento interno — e NÃO vai ao papel de fora
         (mesma régua do CronoPDF._avisosPapel, que é allowlist desde sempre).
         Sem essa marca, o quadro da fiscalização saía com «resolva a restrição
         ou tire a tarefa do plano da semana» impresso para o contratante. */
      function aviso(tipo, msg, interno) { out.avisos.push({ tipo: tipo, msg: msg, interno: !!interno }); }
      function fora(tipo, msg, extra) {
        var x = { tipo: tipo, msg: msg };
        if (extra) Object.keys(extra).forEach(function (k) { x[k] = extra[k]; });
        out.foraDaConta.push(x);
      }
      function falha(msg) { out.erro = msg; return out; }
      function checar(item, ok, apurado, motivo) { out.verificacao.push({ item: item, ok: !!ok, apurado: apurado == null ? "" : String(apurado), motivo: motivo || "" }); }

      var mes = chaveMes(dados.mes);
      if (!mes) return falha("informe a competência do relatório no formato AAAA-MM — o relatório mensal é de um mês, e os dados dele têm de ser os da medição do mesmo mês.");
      var obra = dados.obra;
      if (!obra || typeof obra !== "object" || obra.id == null || obra.id === "") return falha("sem obra — o relatório mensal de acompanhamento é de uma obra.");
      out.mes = mes;
      out.rotuloMes = rotuloMes(mes);
      out.periodo = { de: mes + "-01", ate: fimDoMes(mes), dias: diasNoMes(mes) };
      out.numero = dados.numero == null || dados.numero === "" ? null : txt(dados.numero);
      if (out.numero == null) fora("numero-relatorio", "o relatório saiu SEM número de ordem — o modelo oficial numera os relatórios desde o início da obra; informe “numero” para o histórico fechar.");

      var painel = dados.painel || null;
      if (painel && painel.estado && painel.estado !== "ok") {
        aviso("painel", "o painel da obra não fechou (" + txt(painel.estado) + "): " + (txt(painel.erro) || "sem motivo informado") + " — os capítulos de avanço saem sem número, não com zero.", true);
        painel = null;
      }
      /* ⚠ O PAINEL TEM DE SER DESTA OBRA. Ele chega pronto de fora; um painel
         de outra obra encheria este relatório de números plausíveis e
         errados — e o relatório vai à fiscalização com carimbo de medição. */
      if (painel && painel.obra && txt(painel.obra.id) !== txt(obra.id)) {
        return falha("o painel recebido é da obra " + txt(painel.obra.id) + " e este relatório é da obra " + txt(obra.id) + " — nada foi montado.");
      }
      var RDOm = dados.RDO || dep("RDO", "./rdo.js");

      // ---------- 1) CAPA ----------
      var emp = dados.empresa || {};
      var contrato = dados.contrato || null;
      out.secoes.push({ id: "capa", titulo: "Capa", tipo: "capa",
        obra: { id: obra.id, nome: txt(obra.nome), endereco: txt(obra.endereco), cidade: txt(obra.cidade) },
        competencia: mes, rotuloCompetencia: out.rotuloMes, periodo: out.periodo,
        numeroRelatorio: out.numero,
        contrato: contrato ? { numero: txt(contrato.numero), objeto: txt(contrato.objeto) } : null,
        empresa: { nome: txt(emp.nome), responsavel: txt(emp.responsavel), crea: txt(emp.crea) },
        emitidoEm: iso10(dados.hoje) || null,
        marcaNivel: P.rotulo });
      if (!contrato) fora("contrato", "não veio o contrato da obra — a capa e o capítulo de informações contratuais saem sem número de contrato e sem valor contratado.");

      // ---------- 2) INFORMAÇÕES CONTRATUAIS E EQUIPE TÉCNICA ----------
      var eq = dados.equipe || {};
      var sc = { id: "contratuais", titulo: "Informações contratuais e equipe técnica", tipo: "ficha",
        obra: { nome: txt(obra.nome), inicio: iso10(obra.inicio), termino: iso10(obra.termino) },
        orcamento: painel && painel.orcamento ? { numero: txt(painel.orcamento.numero), revisao: painel.orcamento.revisao } : null,
        contrato: null, aditivos: [], equipe: {
          construtora: txt(eq.construtora) || txt(emp.nome),
          supervisora: txt(eq.supervisora), fiscalizacao: txt(eq.fiscalizacao),
          responsavelTecnico: txt(eq.responsavelTecnico) || txt(emp.responsavel), crea: txt(eq.crea) || txt(emp.crea)
        },
        linhaDeBase: painel && painel.base ? { versao: painel.base.versao, criadaEm: iso10(painel.base.criadaEm),
          motivo: txt(painel.base.motivo), dataInicio: iso10(painel.base.dataInicio), dataFim: iso10(painel.base.dataFim),
          fonte: "linha de base congelada da obra" } : null,
        fonte: "cadastro da obra e dados informados pelo chamador" };
      if (contrato) {
        var vAdit = 0;
        sc.aditivos = arr(contrato.aditivos).map(function (a) {
          vAdit += n0(a && a.valor);
          return { numero: txt(a && a.numero), data: iso10(a && a.data), valor: r2(a && a.valor), prazoDias: n0(a && a.prazoDias), objeto: txt(a && a.objeto) };
        });
        sc.contrato = { numero: txt(contrato.numero), objeto: txt(contrato.objeto),
          valor: ehNum(contrato.valor) ? r2(contrato.valor) : null,
          valorComAditivos: ehNum(contrato.valor) ? r2(n0(contrato.valor) + vAdit) : null,
          assinatura: iso10(contrato.assinatura), prazoDias: n0(contrato.prazoDias),
          fonte: "contrato informado pelo chamador" };
        if (!ehNum(contrato.valor)) fora("contrato-valor", "o contrato veio sem valor — o cronograma financeiro global sai sem a linha do contrato (preta), que é a referência do modelo oficial.");
      }
      if (!sc.linhaDeBase) fora("linha-de-base", "a obra não tem linha de base congelada — sem ela não há “previsto” contra o qual comparar, e o relatório não pode afirmar atraso nem adiantamento.");
      out.secoes.push(sc);
      checar("Informações contratuais preenchidas", !!(sc.contrato && sc.contrato.numero), sc.contrato ? txt(sc.contrato.numero) : "sem contrato", sc.contrato ? "" : "contrato não informado");

      // ---------- 3) RESUMO EXECUTIVO (considerações do responsável) ----------
      var cons = dados.consideracoes || {};
      var textoResumo = txt(cons.resumoExecutivo).replace(/^\s+|\s+$/g, "");
      out.secoes.push({ id: "resumoExecutivo", titulo: "Resumo executivo e considerações do responsável", tipo: "texto",
        texto: textoResumo, preenchido: !!textoResumo,
        exigido: true,
        fonte: "campo de texto do responsável técnico (o modelo oficial exige considerações em todo capítulo com dado físico ou financeiro)" });
      checar("Considerações do responsável preenchidas", !!textoResumo, textoResumo ? textoResumo.length + " caracteres" : "0 caractere", textoResumo ? "" : "campo vazio — o modelo oficial exige comentário do responsável");

      // ---------- 4) AVANÇO FÍSICO: previsto × real, COM A RÉGUA DITA ----------
      /* ⚠ A RÉGUA VAI JUNTO DO NÚMERO. O app responde "quanto andou" de três
         jeitos legítimos (js/cronoplan.js:30-36); um relatório executivo com
         54% e um mensal com 47% na mesma semana destrói a confiança nos dois.
         Aqui os três saem lado a lado, cada um com o rótulo dele. */
      var sa = { id: "avancoFisico", titulo: "Avanço físico — previsto × realizado", tipo: "kpis",
        dataCorte: null, fonteCorte: null, reguas: [], previstoNaData: null, situacao: null, idp: null,
        texto: txt(cons.avancoFisico), fonte: null };
      if (!painel) {
        fora("avanco", "o painel da obra não veio (ou não fechou) — o capítulo de avanço físico sai SEM número. Nenhum percentual é estimado aqui.");
      } else {
        var K = painel.kpis || {};
        sa.dataCorte = iso10(painel.dataCorte);
        sa.fonteCorte = txt(painel.fonteCorte);
        sa.fonteCorteRotulo = ROTULO_CORTE[sa.fonteCorte] || null;
        sa.fonte = "painel de acompanhamento da obra (diários publicáveis, boletins aprovados e a linha de base)";
        sa.fonteTecnica = "CronoPlan.montarPainel";
        sa.reguas = [
          kpi("executadoOrcamento", txt(K.executadoOrcamento && K.executadoOrcamento.rotulo) || "Executado sobre o orçamento",
            K.executadoOrcamento ? K.executadoOrcamento.pct : null, "%",
            "cada serviço pelo valor de venda de hoje, sobre o orçamento INTEIRO",
            { regua: "executado sobre o orçamento", baseDoCalculo: K.executadoOrcamento ? txt(K.executadoOrcamento.base) : null }),
          kpi("portal", txt(K.portal && K.portal.rotulo) || "No Portal do cliente",
            K.portal ? K.portal.pct : null, "%",
            "o MESMO número que o Portal do cliente mostra",
            { regua: "Portal do cliente", origem: K.portal ? txt(K.portal.fonte) : null }),
          kpi("medido", txt(K.medido && K.medido.rotulo) || "Medido em boletins aprovados",
            K.medido ? K.medido.pct : null, "%",
            "acumulado dos boletins de medição aprovados da obra",
            { regua: "medido por boletins", boletins: K.medido ? K.medido.boletins : null })
        ];
        sa.reguas.forEach(function (x) {
          if (x.valor == null) fora("regua-sem-numero", "“" + x.rotulo + "” ficou sem número neste corte — sai em branco, nunca como 0%.", { id: x.id });
        });
        if (K.previstoNaData) {
          sa.previstoNaData = kpi("previstoNaData", txt(K.previstoNaData.rotulo), K.previstoNaData.pct, "%",
            "previsto na data de corte, pela " + (txt(K.previstoNaData.fonte) === "base" ? "linha de base" : "régua do plano atual"),
            { realNaMesmaRegua: K.previstoNaData.realPct,
              desvioPP: (ehNum(K.previstoNaData.pct) && ehNum(K.previstoNaData.realPct)) ? r1(K.previstoNaData.realPct - K.previstoNaData.pct) : null });
        } else fora("previsto", "não há previsto na data (a obra não tem linha de base válida, ou o confronto não fechou) — o relatório não afirma atraso nem adiantamento.");
        if (K.situacao) sa.situacao = { texto: txt(K.situacao), contra: txt(K.situacaoContra), fonte: "executado × previsto, os dois pesados pelo valor de cada subetapa na mesma régua" };
        /* ⚠ ÍNDICE ADIMENSIONAL PEDE DUAS CASAS. Com uma casa, IDP 0,95 (5%
           de valor agregado a MENOS que o previsto) e IDP 1,00 saíam os dois
           como “1,0” — obra atrasada com a mesma cara de obra no ritmo, na
           folha da diretoria. O `casas` viaja com o número, e a `leitura`
           vai junto: número sozinho perto de 1,00 não diz nada. */
        if (K.idp) sa.idp = kpi("idp", txt(K.idp.rotulo) || "IDP (índice de desempenho de prazo)", r2(K.idp.valor), "",
          "EVM: VA ÷ VP, os dois da linha de base",
          { vp: r2(K.idp.vp), va: r2(K.idp.va), casas: 2,
            leitura: K.idp.valor >= 1 ? "no ritmo ou à frente do previsto" : "abaixo do ritmo previsto" });
        else fora("idp", "sem IDP: ele só existe com linha de base congelada (sem base, o índice compara o plano com ele mesmo e fica perto de 1 sozinho).");
        if (ehNum(K.desvioTerminoDias)) sa.desvioTerminoDias = kpi("desvioTerminoDias", "Desvio de término", K.desvioTerminoDias, "dias úteis", "fim do plano atual × fim da linha de base, no calendário da base");
      }
      checar("Avanço físico apurado com a régua declarada", !!(painel && sa.reguas.length), painel ? sa.reguas.length + " régua(s)" : "0", painel ? "" : "painel da obra indisponível");
      out.secoes.push(sa);

      // ---------- 5) CURVA S ----------
      /* ⚠ REALIZADO NÃO SE PROJETA NO FUTURO. A série `executado` do painel
         PARA no último mês medido — ela é MAIS CURTA que os rótulos, e é
         assim que tem de chegar ao papel. Preenchê-la com zero até o fim
         desenharia obra parada numa obra andando (memória "Portal lê null
         como zero"), e é o gráfico que o contratante leva para a reunião. */
      var scv = { id: "curvaS", titulo: "Curva S — linha de base, plano atual e executado", tipo: "grafico",
        rotulos: [], base: [], atual: [], executado: [], mesesMedidos: 0, mesDeCorte: null,
        fonteBase: null, fonteAtual: null, cores: { previsto: "azul", executado: "vermelho", contrato: "preto" },
        regraDoNulo: "mês sem medição é ausência de medição, nunca zero: a série do executado termina no último mês medido.",
        fonte: null };
      if (painel && painel.curva && arr(painel.curva.rotulos).length) {
        scv.rotulos = arr(painel.curva.rotulos).slice();
        scv.base = arr(painel.curva.base).slice();
        scv.atual = arr(painel.curva.atual).slice();
        scv.executado = arr(painel.curva.executado).slice();
        scv.mesesMedidos = scv.executado.length;
        scv.fonteBase = txt(painel.curva.fonteBase) || null;
        scv.fonteAtual = txt(painel.curva.fonteAtual) || null;
        scv.fonte = "curva da obra no eixo do mês-calendário (painel de acompanhamento)";
        var iMes = -1;
        for (var z = 0; z < arr(painel.curva.eixo).length; z++) { if (painel.curva.eixo[z] === mes) { iMes = z; break; } }
        scv.mesDeCorte = iMes >= 0 ? { i: iMes, rotulo: scv.rotulos[iMes] } : null;
        if (iMes < 0) fora("curva-mes", "a competência " + out.rotuloMes + " não está no eixo da curva da obra — a coluna do mês não pode ser destacada.");
        if (!scv.base.length) fora("curva-base", "a curva não tem linha de base (a obra não congelou nenhuma) — o gráfico sai com o plano atual e o executado, e o papel diz isso.");
        if (scv.executado.length < scv.rotulos.length) {
          aviso("curva-executado", "o executado vai até " + (scv.executado.length ? scv.rotulos[scv.executado.length - 1] : "nenhum mês") + " (" + scv.executado.length + " de " + scv.rotulos.length +
            " meses do eixo): depois disso não houve medição, e a linha PARA ali — não cai a zero.");
        }
      } else fora("curva", "não há curva da obra para desenhar (o painel não veio ou não tem eixo de meses).");
      out.secoes.push(scv);
      checar("Curva S com linha de base", !!(scv.base && scv.base.length), (scv.base && scv.base.length ? scv.base.length + " pontos" : "sem base"), (scv.base && scv.base.length) ? "" : "obra sem linha de base congelada");

      // ---------- 6) CRONOGRAMA FÍSICO-FINANCEIRO ----------
      var ff = dados.fisicoFinanceiro || null;
      if (!ff && dados.orc) {
        ff = self.fisicoFinanceiro(dados.orc, dados.r, { publico: P.nivel, valores: dados.valores,
          meses: dados.mesesCronograma, opcionaisIncluidos: dados.opcionaisIncluidos,
          Cronograma: dados.Cronograma, Orcamento: dados.Orcamento });
      }
      var sff = { id: "fisicoFinanceiro", titulo: "Cronograma físico-financeiro", tipo: "matriz",
        matriz: null, colunaDoMes: null, fonte: null };
      if (ff && ff.ok) {
        sff.matriz = ff;
        sff.fonte = ff.fonte;
        var iC = -1;
        for (var w = 0; w < ff.rotulos.length; w++) { if (ff.rotulos[w] === out.rotuloMes || ff.rotulos[w] === out.rotuloMes + "+") { iC = w; break; } }
        sff.colunaDoMes = iC >= 0 ? iC : null;
        if (iC < 0) fora("matriz-mes", "a competência " + out.rotuloMes + " não é uma das colunas da matriz físico-financeira — a coluna do mês não pode ser destacada.");
        /* ⚠ REEMPACOTAR PERDE A ETIQUETA, E A ETIQUETA É A GUARDA. A versão
           anterior copiava só `{tipo, msg}` e prefixava "matriz:" — com isso
           (a) `perm`/`rotulo` sumiam e a declaração da matriz voltava a sair
           uma linha por campo, repetindo o mesmo motivo (lido na folha 20 do
           relatório em 12/09/2026), e (b) o filtro FORA_VEDADO do papel, que
           casa por TIPO, deixava de reconhecer "matriz:restricao". Agora o
           item viaja inteiro e só ganha o prefixo de origem. */
        ff.avisos.forEach(function (a) { out.avisos.push({ tipo: "matriz:" + a.tipo, msg: a.msg, interno: !!a.interno }); });
        ff.foraDaConta.forEach(function (f) {
          var c = { origem: "matriz" };
          Object.keys(f).forEach(function (k2) { c[k2] = f[k2]; });
          out.foraDaConta.push(c);
        });
      } else {
        fora("matriz", "a matriz físico-financeira não pôde ser montada" + (ff && ff.erro ? ": " + ff.erro : " (orçamento não informado)") + ".");
      }
      out.secoes.push(sff);
      checar("Cronograma físico-financeiro no relatório", !!sff.matriz, sff.matriz ? sff.matriz.meses + " mês(es) × " + sff.matriz.linhas.length + " etapa(s)" : "não montado", sff.matriz ? "" : (ff && ff.erro ? ff.erro : "orçamento não informado"));

      // ---------- 7) MARCOS ----------
      var smk = { id: "marcos", titulo: "Marcos contratuais", tipo: "tabela", linhas: [], fonte: null };
      if (dados.r && arr(dados.r.etapas).length) {
        var porId = {};
        if (painel) arr(painel.nos).forEach(function (n) { if (n && n.id != null) porId[txt(n.id)] = n; });
        smk.fonte = "etapas marcadas como marco no cronograma (◆), com o realizado do painel da obra quando existe";
        arr(dados.r.etapas).forEach(function (e, k) {
          if (!e || !e.marco) return;
          var n = porId[txt(e.id)] || null;
          smk.linhas.push({ numero: k + 1, id: e.id, nome: txt(e.nome), previsto: iso10(e.dataFim),
            realizado: n && n.real ? iso10(n.real.fim) : null,
            situacao: n ? (txt(n.situacao) || null) : null,
            fonte: n ? "painel da obra" : "cronograma (sem apropriação no painel)" });
          if (!n) fora("marco-sem-real", "o marco “" + txt(e.nome) + "” não tem realizado apurado — sai só com a data prevista.", { id: e.id });
        });
      } else fora("marcos", "o cronograma calculado (r) não veio — o capítulo de marcos sai vazio.");
      out.secoes.push(smk);

      // ---------- 8) OCORRÊNCIAS E CONTROLE DAS CONDIÇÕES DO TEMPO ----------
      /* ⚠ O DIÁRIO ENTRA POR CARIMBO (obraId + mês), nunca por proximidade.
         A versão anterior desta linha deixava passar o diário SEM obraId "para
         não perder registro antigo" — e diário sem carimbo é exatamente o que
         não se pode atribuir a uma obra: ele entraria no relatório de TODAS
         elas. Sem carimbo, fica de fora e sai declarado. */
      var doMes = arr(dados.rdos).filter(function (x) { return x && chaveMes(x.data) === mes; });
      var semCarimbo = doMes.filter(function (x) { return x.obraId == null || x.obraId === ""; }).length;
      if (semCarimbo) {
        fora("diario-sem-obra", semCarimbo + " diário(s) com data no mês estão SEM obra carimbada — ficaram fora do relatório (diário sem carimbo não se atribui a uma obra por semelhança).");
      }
      var noMes = doMes.filter(function (x) { return txt(x.obraId) === txt(obra.id); });
      var publicaveis = noMes;
      if (RDOm && typeof RDOm.podeIrAoPortal === "function") {
        publicaveis = noMes.filter(function (x) { try { return RDOm.podeIrAoPortal(x); } catch (e4) { return false; } });
      } else {
        aviso("rdo-modulo", "o módulo do diário não está carregado: não dá para saber quais diários foram publicados, e o capítulo de ocorrências usou TODOS os diários do mês.", true);
      }
      var diarios = publicaveis.map(function (x) { return _doDiario(x, RDOm); });
      var clima = _clima(diarios);
      var diasDoMes = out.periodo.dias;
      var soc = { id: "ocorrencias", titulo: "Ocorrências do diário e condições do tempo", tipo: "diario",
        diasDoMes: diasDoMes, diasComDiario: diarios.length,
        /* ⚠ A ALLOWLIST É UMA SÓ: `_doDiario`. Uma segunda lista aqui
           PARECERIA defesa em dobro e é o contrário — réplica apodrece
           calada: no dia em que alguém acrescentar um campo no `_doDiario`,
           ele some do papel aqui sem ninguém saber por quê, e no dia em que
           alguém "simplificar" esta linha com um spread, o nome do
           trabalhador vai junto. Campo novo entra no `_doDiario` e em mais
           lugar nenhum. */
        diarios: diarios,
        clima: clima, texto: txt(cons.clima),
        fonte: "diários publicáveis da obra no mês (allowlist de campos — nenhum nome de pessoa atravessa)" };
      out.secoes.push(soc);
      if (diarios.length < diasDoMes) {
        fora("diarios-faltando", (diasDoMes - diarios.length) + " dia(s) do mês sem diário publicável (" + diarios.length + " de " + diasDoMes + ") — o controle do tempo do mês está incompleto, e isso pesa numa solicitação de prorrogação.");
      }
      if (clima.semFonteExterna) {
        aviso("clima-sem-fonte", clima.semFonteExterna + " dia(s) de chuva ou parada foram registrados SEM fonte externa verificável — eles contam separado dos " +
          clima.comFonteExterna + " com medição de fonte externa. Se a fiscalização contestar, só o segundo grupo se sustenta.");
      }
      /* ⚠ CONTAR NÃO É CONFERIR: o que vai na ficha é o NÚMERO APURADO
         ("2 de 31 dias com diário"), nunca um "ok". Quem lê decide se o
         buraco importa; um ✓ verde decidiria por ele. */
      checar("Diário de obra em todos os dias do mês (dias corridos)", diarios.length >= diasDoMes,
        diarios.length + " de " + diasDoMes + " dias com diário publicável",
        diarios.length >= diasDoMes ? "" : (diasDoMes - diarios.length) + " dia(s) sem diário publicável");

      // ---------- 9) REGISTRO FOTOGRÁFICO ----------
      /* ⚠ FOTO SEM AUTORIZAÇÃO NÃO ENTRA. Referência que não está em
         `fotoIds` devolve 403 no servidor e o cliente vê um buraco CALADO no
         relatório. A conferência é aqui, ANTES de montar a página, e o que
         ficou de fora sai listado. */
      var permitidas = null;
      if (dados.fotoIds != null) { permitidas = {}; arr(dados.fotoIds).forEach(function (id) { permitidas[txt(id)] = 1; }); }
      var fotosOk = [], fotosFora = 0;
      arr(dados.fotos).forEach(function (f) {
        if (!f) return;
        var id = txt(f.id);
        var autorizada = permitidas ? permitidas[id] === 1 : f.autorizada === true;
        if (!autorizada) {
          fotosFora++;
          fora("foto-sem-autorizacao", "a foto " + (id || "(sem id)") + (f.legenda ? " “" + txt(f.legenda) + "”" : "") + " não está autorizada a sair — ficou fora do relatório (referência sem autorização devolve 403 e o leitor veria um buraco calado).", { id: id });
          return;
        }
        fotosOk.push({ id: id, legenda: txt(f.legenda), data: iso10(f.data), tenant: txt(f.tenant), remoto: txt(f.remoto) });
      });
      out.secoes.push({ id: "fotos", titulo: "Registro fotográfico", tipo: "fotos",
        fotos: fotosOk, foraPorAutorizacao: fotosFora,
        fonte: "fotos autorizadas dos diários do mês (só as que entram em “fotoIds”)" });
      checar("Fotos autorizadas no relatório", fotosOk.length > 0, fotosOk.length + " autorizada(s), " + fotosFora + " fora", fotosOk.length ? "" : "nenhuma foto autorizada para este relatório");

      // ---------- 10) MEDIÇÃO DO MÊS ----------
      /* ⚠ DINHEIRO SE LIGA POR CARIMBO. O boletim entra por `obraId` e pela
         DATA dele — nunca por semelhança de valor, descrição ou proximidade
         de data. Boletim sem status entra na lista marcado, e não some. */
      var meds = arr(dados.medicoes).filter(function (m) { return m && txt(m.obraId) === txt(obra.id) && chaveMes(m.data) === mes; });
      var somaPct = 0, somaVal = 0, semPct = 0, aprovadas = 0;
      var linhasMed = meds.map(function (m) {
        var ap = m.status === "aprovada" || m.status === "paga";
        if (ap) {
          aprovadas++;
          if (m.percentual != null && m.percentual !== "") somaPct += n0(m.percentual); else semPct++;
          somaVal += n0(m.valor);
        }
        return { id: txt(m.id), numero: txt(m.numero), data: iso10(m.data), status: txt(m.status),
          percentual: (m.percentual == null || m.percentual === "") ? null : r2(m.percentual),
          valor: ehNum(m.valor) ? r2(m.valor) : n0(m.valor), contaNoMes: ap };
      });
      out.secoes.push({ id: "medicao", titulo: "Medição do mês", tipo: "tabela",
        linhas: linhasMed, aprovadasNoMes: aprovadas,
        percentualNoMes: semPct === aprovadas && aprovadas > 0 ? null : r2(somaPct),
        valorNoMes: r2(somaVal), texto: txt(cons.medicao),
        fonte: "boletins de medição da obra com data no mês (ligados por obraId + data, nunca por semelhança)" });
      if (semPct) fora("medicao-sem-pct", semPct + " boletim(ns) aprovado(s) do mês foi(ram) medido(s) só em R$, sem percentual — não dá para dizer quanto da obra isso é.");
      checar("Medição do mês emitida", aprovadas > 0, aprovadas + " boletim(ns) aprovado(s) em " + out.rotuloMes, aprovadas ? "" : "nenhum boletim aprovado com data no mês — o modelo exige que o relatório corresponda à medição do mesmo mês");

      // ---------- 11) PENDÊNCIAS, ENTRAVES E PROVIDÊNCIAS ----------
      var spd = { id: "pendencias", titulo: "Pendências, entraves e providências", tipo: "listas",
        atrasadas: [], restricoes: [], texto: txt(cons.pendencias), fonte: null };
      if (painel) {
        spd.atrasadas = arr(painel.atencao).map(function (a) {
          return { numero: txt(a.numero), nome: txt(a.nome), previstoPct: a.previstoPct, realPct: a.realPct,
            desvioPP: a.desvioPP, situacao: txt(a.situacao), valor: r2(a.valor) };
        });
        spd.fonte = "frentes atrasadas do painel da obra, ordenadas por desvio";
        arr(painel.foraDaConta && painel.foraDaConta.opcionaisFora).forEach(function (o2) {
          fora("painel-opcional", txt(o2.msg), { id: o2.id });
        });
      }
      var LP = dados.LastPlanner || dep("LastPlanner", "./lastplanner.js");
      if (LP && typeof LP.restricoesPendentes === "function" && dados.lastplanner) {
        spd.restricoes = LP.restricoesPendentes(arr(dados.lastplanner.tarefas)).map(function (x) {
          return { tarefa: txt(x.tarefa), tipo: txt(x.tipo), descricao: txt(x.descricao),
            responsavel: txt(x.responsavel), prazo: iso10(x.prazo), semana: txt(x.semana) };
        });
      }
      out.secoes.push(spd);

      // ---------- 12) CONCLUSÃO ----------
      var textoConcl = txt(cons.conclusao).replace(/^\s+|\s+$/g, "");
      out.secoes.push({ id: "conclusao", titulo: "Conclusão e assinaturas", tipo: "texto",
        texto: textoConcl, preenchido: !!textoConcl,
        assinaturas: [
          { papel: "Responsável Técnico", nome: txt(eq.responsavelTecnico) || txt(emp.responsavel), registro: txt(eq.crea) || txt(emp.crea) },
          { papel: "Fiscalização", nome: txt(eq.fiscalizacao), registro: "" }
        ],
        fonte: "campo de texto do responsável técnico" });
      checar("Conclusão preenchida", !!textoConcl, textoConcl ? textoConcl.length + " caracteres" : "0 caractere", textoConcl ? "" : "campo vazio");

      out.ok = true;
      return _guardar(out, P, out.foraDaConta);
    },

    /* =================================================================
       D7 — LOOKAHEAD (médio prazo) e o quadro do canteiro.

       O motor Last Planner existe inteiro (js/lastplanner.js) e tem tela —
       o que falta é PAPEL: o encarregado não abre o ERP no meio da laje.

       ⚠ A REGRA QUE O PAPEL NÃO PODE ATROPELAR: só tarefa SEM restrição
         aberta pode sair marcada como COMPROMETIDA. Se o documento imprimir
         comprometida uma tarefa com restrição pendente, o papel autoriza o
         que o método proíbe — e o encarregado toca o serviço. Quando o
         estado gravado é esse (por edição antiga ou por restrição criada
         depois), o papel sai com `comprometida:false`, `conflito:true` e o
         aviso; o REGISTRO no Store não é tocado (motor puro).

       dados = { obra, plano:{tarefas}, hoje, publico, LastPlanner }
       ================================================================= */
    lookahead: function (dados, semanas) {
      dados = dados || {};
      var P = this.publico(dados.publico || "canteiro");
      var out = { ok: false, publico: P, obra: null, hoje: null, semanas: [],
        restricoesPendentes: [], aLiberar: [], ppc: null, causas: null, totais: null,
        avisos: [], foraDaConta: [] };
      /* ⚠ `interno` marca o recado que é INSTRUÇÃO AO NOSSO ENGENHEIRO. Ele
         existe, vai ao log e ao documento interno — e NÃO vai ao papel de fora
         (mesma régua do CronoPDF._avisosPapel, que é allowlist desde sempre).
         Sem essa marca, o quadro da fiscalização saía com «resolva a restrição
         ou tire a tarefa do plano da semana» impresso para o contratante. */
      function aviso(tipo, msg, interno) { out.avisos.push({ tipo: tipo, msg: msg, interno: !!interno }); }
      function fora(tipo, msg, extra) {
        var x = { tipo: tipo, msg: msg };
        if (extra) Object.keys(extra).forEach(function (k) { x[k] = extra[k]; });
        out.foraDaConta.push(x);
      }
      function falha(msg) { out.erro = msg; return out; }

      var LP = dados.LastPlanner || dep("LastPlanner", "./lastplanner.js");
      if (!LP || typeof LP.semanas !== "function" || typeof LP.restricoesPendentes !== "function") {
        return falha("motor do Last Planner não carregado (js/lastplanner.js) — sem ele não há semanas nem restrições.");
      }
      var obra = dados.obra;
      if (!obra || typeof obra !== "object" || obra.id == null || obra.id === "") return falha("sem obra — o lookahead é o plano de médio prazo de uma obra.");
      out.obra = { id: obra.id, nome: txt(obra.nome) };
      /* ⚠ O PLANO TEM DE SER DESTA OBRA (mesma regra do painel em
         js/cronoplan.js): o quadro do canteiro é colado na parede, e um
         quadro com as tarefas da obra vizinha manda a equipe trabalhar no
         serviço errado. */
      var pl = dados.plano || null;
      if (pl && pl.obraId != null && pl.obraId !== "" && txt(pl.obraId) !== txt(obra.id)) {
        return falha("o plano do Last Planner recebido é da obra " + txt(pl.obraId) + " e este lookahead é da obra " + txt(obra.id) + " — nada foi montado.");
      }

      var n = (semanas == null || semanas === "") ? 3 : Math.floor(n0(semanas));
      if (!(n >= 1)) n = 3;
      if (n > 6) { aviso("horizonte", "o horizonte pedido (" + n + " semanas) passa das 6 usuais do lookahead; foi limitado a 6."); n = 6; }
      var hojeD = dataLocal(dados.hoje) || (dados.hoje && typeof dados.hoje.getTime === "function" && !isNaN(dados.hoje.getTime()) ? dados.hoje : null);
      if (!hojeD) return falha("informe a data de referência (“hoje”) — sem relógio o lookahead não sabe qual é “esta semana”.");
      var hojeISO = iso10(hojeD);
      out.hoje = hojeISO;

      var tarefas = arr(dados.plano && dados.plano.tarefas);
      var lista = LP.semanas(hojeD, n);
      var chaveAtual = lista.length ? lista[0].chave : "";

      var conflitos = 0, totComp = 0, totLivres = 0, totTravadas = 0;
      out.semanas = lista.map(function (s) {
        var doSem = tarefas.filter(function (t) { return t && txt(t.semana) === s.chave; });
        var linhas = doSem.map(function (t) {
          var abertas = arr(t.restricoes).filter(function (x) { return x && !x.removida; });
          var livre = abertas.length === 0;
          /* ⚠ ver o cabeçalho: o papel NUNCA promete o que o método proíbe */
          var conflito = !!t.comprometida && !livre;
          if (conflito) conflitos++;
          if (livre) totLivres++; else totTravadas++;
          var linha = {
            id: txt(t.id), titulo: txt(t.titulo), frente: txt(t.frente),
            responsavel: txt(t.responsavel), etapa: txt(t.etapaNome),
            semana: s.chave,
            comprometida: !!t.comprometida && livre,
            comprometidaNoRegistro: !!t.comprometida,
            conflito: conflito,
            podeComprometer: livre,
            status: txt(t.status) || "afazer",
            causa: txt(t.causa),
            nRestricoesAbertas: abertas.length,
            restricoes: abertas.map(function (x) {
              var prazo = iso10(x.prazo);
              return { id: txt(x.id), tipo: txt(x.tipo), descricao: txt(x.descricao),
                responsavel: txt(x.responsavel), prazo: prazo || null,
                vencida: !!prazo && prazo < hojeISO,
                semPrazo: !prazo };
            })
          };
          if (linha.comprometida) totComp++;
          return linha;
        });
        return { idx: s.idx, chave: s.chave, rotulo: s.rotulo, periodo: s.periodo,
          inicio: iso10(s.ini), fim: iso10(s.fim),
          tarefas: linhas,
          nTarefas: linhas.length,
          nComprometidas: linhas.filter(function (L) { return L.comprometida; }).length,
          nTravadas: linhas.filter(function (L) { return !L.podeComprometer; }).length };
      });
      if (conflitos) {
        aviso("comprometida-com-restricao", conflitos + " tarefa(s) estão gravadas como comprometidas E têm restrição aberta. No papel elas saem NÃO comprometidas, com a restrição à vista: comprometer tarefa travada é exatamente o que o Last Planner proíbe. O registro no sistema não foi alterado — resolva a restrição ou tire a tarefa do plano da semana.", true);
      }

      /* restrições de TODO o plano, ordenadas por prazo (as sem prazo ao fim)
         — é a lista da reunião de médio prazo, e é a mesma função da tela */
      out.restricoesPendentes = LP.restricoesPendentes(tarefas).map(function (x) {
        var prazo = iso10(x.prazo);
        return { tarefaId: txt(x.tarefaId), tarefa: txt(x.tarefa), semana: txt(x.semana),
          tipo: txt(x.tipo), descricao: txt(x.descricao), responsavel: txt(x.responsavel),
          prazo: prazo || null, vencida: !!prazo && prazo < hojeISO, semPrazo: !prazo };
      });

      /* "o que precisa ser liberado ANTES": restrição aberta de tarefa que
         está dentro do horizonte impresso, ordenada pelo início da semana
         dela — é o "limpar o terreno" do método, virado em lista de ação. */
      var chaves = {};
      out.semanas.forEach(function (s) { chaves[s.chave] = s; });
      out.aLiberar = [];
      out.restricoesPendentes.forEach(function (x) {
        var s = chaves[x.semana];
        if (!s) return;
        out.aLiberar.push({ semana: x.semana, rotuloSemana: s.rotulo, inicioDaSemana: s.inicio,
          tarefa: x.tarefa, tipo: x.tipo, descricao: x.descricao, responsavel: x.responsavel,
          prazo: x.prazo, vencida: x.vencida, semPrazo: x.semPrazo,
          liberarAte: s.inicio,
          atrasadaParaASemana: !!x.prazo && x.prazo > s.inicio });
        if (!x.responsavel) fora("restricao-sem-dono", "a restrição “" + (x.descricao || x.tipo) + "” da tarefa “" + x.tarefa + "” está SEM responsável — restrição sem dono não se remove sozinha.", { tarefa: x.tarefa });
        if (x.semPrazo) fora("restricao-sem-prazo", "a restrição “" + (x.descricao || x.tipo) + "” da tarefa “" + x.tarefa + "” está SEM prazo — não dá para dizer se ela chega a tempo da semana.", { tarefa: x.tarefa });
      });
      out.aLiberar.sort(function (a, b) {
        return String(a.inicioDaSemana).localeCompare(String(b.inicioDaSemana)) ||
          String(a.prazo || "9999-99-99").localeCompare(String(b.prazo || "9999-99-99"));
      });

      /* PPC da semana ANTERIOR: é o número que abre a reunião. A semana atual
         ainda não fechou — medir o PPC dela seria contar o jogo no intervalo. */
      var antes = new Date(hojeD.getTime()); antes.setDate(antes.getDate() - 7);
      var chaveAnterior = LP.chaveSemana(antes);
      var pp = typeof LP.ppcSemana === "function" ? LP.ppcSemana(tarefas, chaveAnterior) : null;
      if (pp) {
        out.ppc = { semana: chaveAnterior, comprometidas: pp.comprometidas, feitas: pp.feitas,
          naofeitas: pp.naofeitas, pendentes: pp.pendentes,
          valor: pp.ppc == null ? null : r1(pp.ppc * 100), unidade: "%",
          fonte: "PPC da semana anterior (" + chaveAnterior + ") — só tarefas comprometidas entram na conta" };
        if (pp.ppc == null) fora("ppc", "a semana anterior (" + chaveAnterior + ") não teve tarefa comprometida — o PPC fica em branco, não em 0%.");
      }
      if (typeof LP.causasAgregadas === "function" && P.causasPPC) {
        var ca = LP.causasAgregadas(tarefas, [chaveAnterior]);
        out.causas = { linhas: ca.linhas.map(function (L) { return { causa: txt(L.causa), n: L.n, pct: r1(L.pct * 100) }; }),
          total: ca.total, fonte: "causas de não cumprimento registradas na semana " + chaveAnterior + " (Pareto)" };
      }

      out.totais = { tarefasNoHorizonte: totLivres + totTravadas, comprometidas: totComp,
        livres: totLivres, travadas: totTravadas, conflitos: conflitos,
        restricoesAbertas: out.restricoesPendentes.length,
        semanaAtual: chaveAtual,
        fonte: "contagem sobre as tarefas do plano do Last Planner dentro do horizonte impresso" };

      if (!tarefas.length) fora("plano-vazio", "o plano do Last Planner desta obra não tem tarefa nenhuma — o lookahead sai em branco. Puxe as tarefas do cronograma antes de imprimir.");
      out.ok = true;
      return _guardar(out, P, out.foraDaConta);
    },

    /* =================================================================
       D9 — RESUMO EXECUTIVO (uma folha, diretoria).

       ⚠ NASCE INTERNO. É o único documento desta frente que pode trazer
         número de gestão sem tradução; por isso o padrão é "interno" e o
         nível sai carimbado no papel. Pedido em outro nível, a guarda tira o
         que não pode (e diz que tirou).

       ⚠ AO LADO DO AVANÇO VAI A RÉGUA. São três perguntas diferentes
         (js/cronoplan.js:30-36); uma folha que mostra uma sem as outras faz o
         engenheiro discutir com o cliente usando números diferentes.

       dados = { obra, painel, r, lastplanner, hoje, publico, LastPlanner }
       ================================================================= */
    resumoExecutivo: function (dados) {
      dados = dados || {};
      var P = this.publico(dados.publico || "interno");
      var out = { ok: false, publico: P, obra: null, dataCorte: null, fonteCorte: null,
        kpis: [], prazo: null, situacao: null, idp: null, tendencia: null,
        marcos: [], atencao: [], avisos: [], foraDaConta: [] };
      /* ⚠ `interno` marca o recado que é INSTRUÇÃO AO NOSSO ENGENHEIRO. Ele
         existe, vai ao log e ao documento interno — e NÃO vai ao papel de fora
         (mesma régua do CronoPDF._avisosPapel, que é allowlist desde sempre).
         Sem essa marca, o quadro da fiscalização saía com «resolva a restrição
         ou tire a tarefa do plano da semana» impresso para o contratante. */
      function aviso(tipo, msg, interno) { out.avisos.push({ tipo: tipo, msg: msg, interno: !!interno }); }
      function fora(tipo, msg, extra) {
        var x = { tipo: tipo, msg: msg };
        if (extra) Object.keys(extra).forEach(function (k) { x[k] = extra[k]; });
        out.foraDaConta.push(x);
      }
      function falha(msg) { out.erro = msg; return out; }

      var obra = dados.obra;
      if (!obra || typeof obra !== "object" || obra.id == null || obra.id === "") return falha("sem obra — o resumo executivo é de uma obra.");
      out.obra = { id: obra.id, nome: txt(obra.nome), inicio: iso10(obra.inicio), termino: iso10(obra.termino) };
      var painel = dados.painel || null;
      if (painel && painel.estado && painel.estado !== "ok") {
        return falha("o painel da obra não fechou (" + txt(painel.estado) + "): " + (txt(painel.erro) || "sem motivo informado") + " — sem ele esta folha não tem número nenhum, e não se inventa um.");
      }
      if (!painel) return falha("passe o painel de acompanhamento da obra — esta folha é a leitura dele, não um cálculo novo.");
      /* ⚠ mesma regra do relatório mensal: painel de outra obra encheria a
         folha da diretoria de números plausíveis e errados */
      if (painel.obra && txt(painel.obra.id) !== txt(obra.id)) {
        return falha("o painel recebido é da obra " + txt(painel.obra.id) + " e esta folha é da obra " + txt(obra.id) + " — nada foi montado.");
      }

      var K = painel.kpis || {};
      out.dataCorte = iso10(painel.dataCorte);
      out.fonteCorte = txt(painel.fonteCorte);
      out.fonteCorteRotulo = ROTULO_CORTE[out.fonteCorte] || null;

      /* ---- os 6 KPIs, cada um com a RÉGUA escrita ---- */
      out.kpis.push(kpi("executadoOrcamento", txt(K.executadoOrcamento && K.executadoOrcamento.rotulo) || "Executado sobre o orçamento",
        K.executadoOrcamento ? K.executadoOrcamento.pct : null, "%",
        "cada serviço pelo valor de venda de hoje, sobre o orçamento INTEIRO",
        { regua: "executado sobre o orçamento" }));
      out.kpis.push(kpi("portal", txt(K.portal && K.portal.rotulo) || "No Portal do cliente",
        K.portal ? K.portal.pct : null, "%",
        "o MESMO número que o cliente vê no Portal", { regua: "Portal do cliente" }));
      out.kpis.push(kpi("medido", txt(K.medido && K.medido.rotulo) || "Medido em boletins aprovados",
        K.medido ? K.medido.pct : null, "%",
        "acumulado dos boletins aprovados", { regua: "medido por boletins", boletins: K.medido ? K.medido.boletins : null }));
      out.kpis.push(kpi("previstoNaData", K.previstoNaData ? txt(K.previstoNaData.rotulo) : "Previsto na data",
        K.previstoNaData ? K.previstoNaData.pct : null, "%",
        K.previstoNaData ? ("previsto na data de corte pela " + (txt(K.previstoNaData.fonte) === "base" ? "linha de base" : "régua do plano atual")) : "sem linha de base válida",
        { regua: K.previstoNaData ? txt(K.previstoNaData.fonte) : null }));
      var dPP = (K.previstoNaData && ehNum(K.previstoNaData.pct) && ehNum(K.previstoNaData.realPct))
        ? r1(K.previstoNaData.realPct - K.previstoNaData.pct) : null;
      out.kpis.push(kpi("desvioPP", "Desvio", dPP, "p.p.",
        "executado × previsto, os dois pesados pelo valor de cada subetapa na MESMA régua"));
      /* ⚠ duas casas e a leitura ao lado — ver o mesmo ⚠ no relatório mensal */
      out.kpis.push(kpi("idp", K.idp ? txt(K.idp.rotulo) : "IDP (VA ÷ VP)", K.idp ? r2(K.idp.valor) : null, "",
        K.idp ? "EVM sobre a linha de base" : "sem linha de base congelada não há IDP",
        K.idp ? { vp: r2(K.idp.vp), va: r2(K.idp.va), casas: 2,
          leitura: K.idp.valor >= 1 ? "no ritmo ou à frente do previsto" : "abaixo do ritmo previsto" } : null));
      out.kpis.forEach(function (x) {
        if (x.valor == null) fora("kpi-sem-numero", "“" + x.rotulo + "” ficou sem número neste corte — a folha imprime em branco, nunca 0.", { id: x.id });
      });

      /* ---- prazo ---- */
      var rPl = dados.r || null;
      out.prazo = {
        inicio: out.obra.inicio || (painel.ancora ? iso10(painel.ancora.data) : null),
        fonteInicio: painel.ancora ? txt(painel.ancora.fonte) : null,
        terminoPrevisto: rPl && rPl.dataFim ? iso10(rPl.dataFim) : (painel.termino ? iso10(painel.termino.ref) : null),
        terminoBase: painel.base ? iso10(painel.base.dataFim) : null,
        terminoCadastro: out.obra.termino || null,
        desvioDias: ehNum(K.desvioTerminoDias) ? K.desvioTerminoDias : null,
        unidadeDesvio: "dias úteis",
        fonte: "linha de base × plano atual, no calendário da base"
      };
      if (out.prazo.desvioDias == null) fora("desvio-termino", "não há desvio de término: ele só se calcula contra uma linha de base congelada.");
      if (rPl && arr(rPl.etapas).length) {
        out.prazo.totalDias = rPl.totalDias;
        var nCrit = arr(rPl.caminhoCritico).length;
        out.prazo.caminhoCritico = { etapas: nCrit, de: rPl.etapas.length, fonte: "CPM do cronograma (etapas sem folga)" };
        var fmin = null;
        rPl.etapas.forEach(function (e) { if (!e.critico && ehNum(e.folga) && (fmin == null || e.folga < fmin)) fmin = e.folga; });
        out.prazo.folgaMinimaDias = fmin;
      }

      /* ---- situação ---- */
      if (K.situacao) {
        out.situacao = { texto: txt(K.situacao), contra: txt(K.situacaoContra),
          fonte: "executado × previsto na mesma régua" };
      } else fora("situacao", "a obra não tem situação apurada (falta linha de base ou realizado) — a folha não diz “no prazo” nem “atrasada”.");
      if (K.idp) out.idp = { valor: r2(K.idp.valor), vp: r2(K.idp.vp), va: r2(K.idp.va), rotulo: txt(K.idp.rotulo),
        leitura: K.idp.valor >= 1 ? "no ritmo ou à frente do previsto" : "abaixo do ritmo previsto",
        fonte: "EVM: IDP = VA ÷ VP, os dois na régua da linha de base" };

      /* ---- TENDÊNCIA: projeção EXPLÍCITA, nunca somada ao acumulado real.
         A série `executado` do painel termina no último mês medido; o ritmo
         sai dos últimos meses DELA. Menos de dois pontos = sem ritmo, e a
         folha diz isso em vez de desenhar uma reta inventada. ---- */
      var ex = arr(painel.curva && painel.curva.executado);
      var rots = arr(painel.curva && painel.curva.rotulos);
      if (ex.length < 2) {
        fora("tendencia", "há " + ex.length + " mês(es) medido(s) — com menos de dois pontos não existe ritmo, e esta folha não projeta término.");
      } else {
        var jan = Math.min(3, ex.length - 1);
        var vFim = ex[ex.length - 1], vIni = ex[ex.length - 1 - jan];
        if (!ehNum(vFim) || !ehNum(vIni)) {
          fora("tendencia", "a série do executado tem buraco nos últimos " + jan + " mês(es) — sem os dois extremos não há ritmo para projetar.");
        } else {
          var ritmo = r2((vFim - vIni) / jan);
          var falta = r2(100 - vFim);
          /* ⚠ TETO DE SANIDADE NA PROJEÇÃO. Sem ele, qualquer ritmo positivo
             vira número impresso: com 0,1 p.p./mês a folha da diretoria dizia
             «Nesse ritmo faltariam 996 mês(es)» (83 anos) — e com 0,01,
             9.987 meses. Pior: a MESMA folha carregava, três linhas abaixo, o
             aviso do painel de que não há data de término previsível. Dois
             números para a mesma pergunta, e o absurdo estava no que o
             sistema afirmava. O teto é o horizonte que o PLANO ainda tem
             (3× os meses que faltam no eixo da curva), com um piso de 60
             meses para plano curto; acima dele a projeção é recusada e o
             motivo sai escrito, que é a mesma doutrina do null do resto do
             arquivo. O papel já sabe imprimir o caso null. */
          var restantes = Math.max(0, rots.length - ex.length);
          var teto = Math.max(60, restantes * 3);
          var proj = (ritmo > 0 && falta > 0) ? Math.ceil(falta / ritmo) : null;
          var recusadaPorTeto = (proj != null && proj > teto);
          out.tendencia = {
            ritmoPPmes: ritmo, mesesDaBase: jan, ultimoMedido: r2(vFim),
            ultimoMesMedido: rots[ex.length - 1] || null, faltaPP: falta,
            mesesParaConcluir: recusadaPorTeto ? null : proj,
            tetoMeses: teto, mesesRestantesDoPlano: restantes,
            foraDoHorizonte: recusadaPorTeto,
            projetada: true,
            rotulo: "tendência (ritmo dos últimos " + jan + " mês(es) medido(s)) — projeção, não medição",
            fonte: "curva do painel da obra, série do executado"
          };
          if (recusadaPorTeto) {
            fora("tendencia-horizonte", "o ritmo medido dos últimos " + jan + " mês(es) (" + nbr(ritmo) +
              " p.p./mês) não projeta término dentro de um horizonte útil: nesse passo faltariam " + proj +
              " meses, contra o teto de " + teto + " deste plano. A folha não imprime o número — projeção de décadas é ruído, não informação.");
          } else if (out.tendencia.mesesParaConcluir == null) {
            fora("tendencia-ritmo", "o ritmo dos últimos " + jan + " mês(es) é " + nbr(ritmo) + " p.p./mês" +
              (falta <= 0 ? " e a obra já está em 100% na régua medida" : " — com ritmo zero ou negativo não se projeta término") + ".");
          }
        }
      }

      /* ---- marcos ---- */
      if (rPl && arr(rPl.etapas).length) {
        arr(rPl.etapas).forEach(function (e, k) {
          if (!e || !e.marco) return;
          out.marcos.push({ numero: k + 1, nome: txt(e.nome), previsto: iso10(e.dataFim),
            fonte: "cronograma do plano atual" });
        });
      }
      if (!out.marcos.length) fora("marcos", "o cronograma não tem marco marcado (◆) — a folha sai sem a linha de marcos.");

      /* ---- 3 a 5 pontos de atenção: os que EXISTEM, nunca preenchidos ---- */
      arr(painel.atencao).forEach(function (a) {
        if (out.atencao.length >= 5) return;
        out.atencao.push({ origem: "frente atrasada", numero: txt(a.numero), titulo: txt(a.nome),
          detalhe: "previsto " + (a.previstoPct == null ? "—" : r1(a.previstoPct) + "%") +
            " × realizado " + (a.realPct == null ? "—" : r1(a.realPct) + "%") +
            (a.desvioPP == null ? "" : " (" + (a.desvioPP > 0 ? "+" : "") + r1(a.desvioPP) + " p.p.)"),
          valor: r2(a.valor), fonte: "painel de acompanhamento da obra — frentes atrasadas" });
      });
      var LP2 = dados.LastPlanner || dep("LastPlanner", "./lastplanner.js");
      if (out.atencao.length < 5 && LP2 && typeof LP2.restricoesPendentes === "function" && dados.lastplanner) {
        LP2.restricoesPendentes(arr(dados.lastplanner.tarefas)).forEach(function (x) {
          if (out.atencao.length >= 5) return;
          out.atencao.push({ origem: "restrição aberta", numero: "", titulo: txt(x.tarefa),
            detalhe: txt(x.tipo) + (x.descricao ? " — " + txt(x.descricao) : "") + (x.prazo ? " (prazo " + iso10(x.prazo) + ")" : " (sem prazo)"),
            responsavel: txt(x.responsavel),
            fonte: "Last Planner — restrições em aberto, por prazo" });
        });
      }
      if (out.atencao.length < 3) {
        fora("atencao", "o painel e o Last Planner só apontaram " + out.atencao.length + " ponto(s) de atenção — a folha imprime os que existem; pontos não se inventam para fechar três.");
      }

      arr(painel.avisos).forEach(function (a) {
        if (!a) return;
        if (P.avisosInternos) out.avisos.push({ tipo: "painel:" + txt(a.tipo), msg: txt(a.msg) });
      });
      if (!P.avisosInternos && arr(painel.avisos).length) {
        fora("avisos-internos", arr(painel.avisos).length + " recado(s) do painel são instrução ao engenheiro e ficaram fora deste nível de documento.");
      }

      out.ok = true;
      return _guardar(out, P, out.foraDaConta);
    },

    // expostos para a fiação e para a suíte (nada aqui desenha)
    _guardar: _guardar,
    _doDiario: _doDiario,
    _clima: _clima,
    _chaveMes: chaveMes,
    _rotuloMes: rotuloMes,
    RESTRITOS: RESTRITOS
  };

  global.CronoDocs = CronoDocs;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoDocs;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

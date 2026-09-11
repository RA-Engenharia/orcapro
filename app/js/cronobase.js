/* =====================================================================
 * cronobase.js — A ENTIDADE `crono_obra`: as linhas de base e o plano de
 * execução da obra (espec v2 do cronograma executivo, 3.1)
 *
 * Motor PURO: não lê nem grava o Store, não toca em DOM. Recebe a lista da
 * entidade (o que `Store.listar(eid, "crono_obra")` devolve) e devolve o que
 * gravar — quem chama grava com `Store.salvarVarios(eid, CronoBase.ENTIDADE,
 * r.gravar, true)`.
 *
 * Dois tipos de registro, `obraId` em todos:
 *   tipo "base"  — a linha de base congelada (`CronoPlan.congelarBase`).
 *                  IMUTÁVEL: nunca se regrava; a ATIVA é a de maior `versao`
 *                  da obra (sem ponteiro mutável — ponteiro é campo que dois
 *                  aparelhos editam e o merge por id decide no chute).
 *                  Reprogramar = gravar a versão seguinte, com motivo.
 *   tipo "plano" — o PLANO DE EXECUÇÃO da obra, id "plano_" + obraId. Nasce
 *                  copiando `orc.cronograma`; é o que se edita quando o
 *                  orçamento está APROVADO (o aprovado não grava): a proposta
 *                  fica intacta e a obra ganha o plano vivo.
 *
 * ⚠ AS TRÊS REGRAS QUE NÃO CEDEM
 *  1) A ENTIDADE É LISTA, MESMO PARA REGISTRO ÚNICO. O pipeline da nuvem
 *     trata tudo que não é prefs/conta como lista: `Util.arr(objeto)` é `[]`,
 *     o merge devolve `[]` e o sync grava o vazio POR CIMA do dado — sem
 *     erro, com a tela dizendo "Sincronizado". Já custou as cotações de um
 *     cliente e a marcação de usuários independentes (memória "a forma no
 *     disco decide se sincroniza"). Nada aqui aceita objeto no lugar da lista.
 *  2) A ENTIDADE INTEIRA VAI NUM DOCUMENTO DA NUVEM, com teto de 1 MiB, e
 *     passou disso ela PARA de sincronizar calada (nuvem.js, `push`). Toda
 *     gravação daqui mede o resultado em BYTES UTF-8 antes (a régua é a do
 *     `CronoPlan.bytes`, uma só) e, sem espaço, abre espaço pela PORTA —
 *     resume as versões antigas — ou recusa dizendo os números. Nunca grava
 *     "e deixa a nuvem parar".
 *  3) A CASCATA DA OBRA LEVA TUDO DAQUI. `crono_obra` está em
 *     `Gestao._ENT_DA_OBRA` e NUNCA em `Store._IMUNES_CASCATA` — as duas
 *     regras ao mesmo tempo foi o defeito da v1.1.236 (a tela apagava, o
 *     merge devolvia órfão no sync seguinte).
 * ===================================================================== */
(function (global) {
  "use strict";

  var ENTIDADE = "crono_obra";
  /* ⚠ 60 KB por plano, em bytes UTF-8. Medido: um plano de 30 etapas × 90
     subetapas com TODOS os mapas cheios (durações, dependências, lags,
     equipes, marcas e motivo da IA de 120 caracteres em cada nó) dá ~46 KB;
     copiado de um orçamento comum, ~4 KB. O teto existe para um plano sozinho
     não comer o documento das outras obras — o limite que manda de verdade é
     o da entidade (ver `abrirEspaco`). */
  var TETO_PLANO = 60 * 1024;

  /* A régua de bytes, o teto de uma base, o teto da entidade e o resumo de
     versão antiga vêm do `CronoPlan` — lidos NA CHAMADA (no index.html este
     arquivo vem logo depois do cronoplan.js; em Node, o require relativo).
     ⚠ Não replicar aqui: duas réguas de bytes divergem no primeiro ajuste
     (memória "réplica de parser apodrece"), e aí uma aceita o que a outra
     recusaria. */
  function dep(nome, arq) {
    var m = global[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m || null;
  }
  function Pl() { return dep("CronoPlan", "./cronoplan.js"); }

  /* ⚠ `instanceof Array` não atravessa realm (vm dos testes, iframe):
     um array de outro contexto responde false. */
  function ehLista(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
  function ehObj(v) { return !!v && typeof v === "object" && !ehLista(v); }
  function own(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function str(v) { return v == null ? "" : String(v); }
  function kb(b) { return String(Math.round(b / 102.4) / 10).replace(".", ","); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function cmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  /* relógio injetável: Date, ms ou texto ISO; ausente = agora */
  function iso(agora) {
    var d = agora == null ? new Date() : (typeof agora === "number" || typeof agora === "string" ? new Date(agora) : agora);
    return (d && typeof d.getTime === "function" && !isNaN(d.getTime())) ? d.toISOString() : new Date().toISOString();
  }
  function falha(msg, extra) {
    var r = { ok: false, erro: msg }, k;
    for (k in (extra || {})) if (own(extra, k)) r[k] = extra[k];
    return r;
  }
  var SEM_MOTOR = "motor do planejamento (js/cronoplan.js) não carregado — nada foi gravado.";
  var NAO_LISTA = "a lista do planejamento da obra (" + ENTIDADE + ") não chegou em forma de lista — nada foi gravado, porque gravar por cima apagaria o que ela tem. Faça um backup e avise o suporte da RA.";

  function idPlano(obraId) { return "plano_" + str(obraId); }
  /* uma base com versão de verdade (inteiro ≥ 1). Versão em texto ("2") não
     entra: toda gravação passa por `novaBase`, que só aceita número — um
     registro assim veio de fora do caminho e não pode decidir a ativa. */
  function ehBase(x) { return ehObj(x) && x.tipo === "base" && typeof x.versao === "number" && isFinite(x.versao) && x.versao >= 1; }
  function ehPlano(x) { return ehObj(x) && x.tipo === "plano"; }

  function bases(lista, obraId) {
    var o = str(obraId), out = [], i;
    if (!ehLista(lista) || !o) return out;
    for (i = 0; i < lista.length; i++) if (ehBase(lista[i]) && str(lista[i].obraId) === o) out.push(lista[i]);
    /* maior versão por último; empate (dois aparelhos congelando a mesma
       versão com ids diferentes — só com `meta.id` próprio) decide pela data
       e depois pelo id, para todo aparelho escolher A MESMA */
    out.sort(function (a, b) { return (a.versao - b.versao) || cmp(str(a.criadaEm), str(b.criadaEm)) || cmp(str(a.id), str(b.id)); });
    return out;
  }
  function ativa(lista, obraId) { var b = bases(lista, obraId); return b.length ? b[b.length - 1] : null; }

  /* =================================================================
     O ESPAÇO NA NUVEM — a porta da trava de 900 KB.

     Antes de acrescentar (ou regravar) um registro, a lista inteira tem de
     caber abaixo de `CronoPlan.TETO_ENTIDADE` (900 KB, o mesmo aviso do
     `push` da nuvem, antes do 1 MiB do Firestore). Sem caber, libera espaço
     nas versões ANTIGAS de linha de base, uma por vez, nesta ordem:
       1. resumir (CronoPlan.resumirBase: ficam as etapas com janela e valor;
          saem subetapas, nomes e curva) as antigas que não são a v1;
       2. arquivar (fica só o cabeçalho: versão, motivo, prazo e valor) essas
          mesmas;
       3. resumir a v1; 4. arquivar a v1.
     A v1 por último porque é a linha de base CONTRATUAL — a primeira
     promessa de prazo; as reprogramações intermediárias valem menos.
     ⚠ NUNCA toca na base ATIVA de obra nenhuma (é a que o IDP lê — base
     resumida o confronto recusa) nem em plano de execução (é trabalho vivo).
     A base que a nova vai substituir já conta como antiga.
     Esgotadas as quatro, RECUSA com os números: não grava nada, e a lista
     de quem chamou fica intacta (tudo aqui trabalha em cópia).

     Medido no pior caso de uma empresa (tools/test-crono-obra-sync.js):
     20 obras × 5 versões × 30 etapas × 90 subetapas + 20 planos copiados do
     orçamento cabem sem nenhuma recusa.
     ================================================================= */
  var FASES = [{ nivel: 1, v1: false }, { nivel: 2, v1: false }, { nivel: 1, v1: true }, { nivel: 2, v1: true }];

  function arquivar(base) {
    if (!ehObj(base)) return base;
    var nE = 0, nF = 0;
    if (ehLista(base.nos)) base.nos.forEach(function (n) { if (n && n.t === "f") nF++; else if (n) nE++; });
    var c = {
      id: base.id, tipo: "base", obraId: base.obraId, orcamentoId: base.orcamentoId, orcNumero: base.orcNumero,
      versao: base.versao, motivo: base.motivo, criadaEm: base.criadaEm, por: base.por,
      cal: ehObj(base.cal) ? { dataInicio: base.cal.dataInicio, diasUteisSemana: base.cal.diasUteisSemana } : null,
      totalDias: base.totalDias, dataFim: base.dataFim, valor: base.valor,
      opcionaisIncluidos: ehLista(base.opcionaisIncluidos) ? base.opcionaisIncluidos.slice() : [],
      opcionaisFora: ehLista(base.opcionaisFora) ? base.opcionaisFora.slice() : [],
      resumida: true, arquivada: true,
      folhasResumidas: (base.resumida ? (Number(base.folhasResumidas) || 0) : 0) + nF,
      mesesResumidos: base.resumida ? (Number(base.mesesResumidos) || 0) : (ehLista(base.curva) ? base.curva.length : 0),
      etapasArquivadas: nE,
      criadoEm: base.criadoEm, atualizadoEm: base.atualizadoEm
    };
    return c;
  }

  function abrirEspaco(lista, novo, agoraISO) {
    var P = Pl();
    var trab = lista.slice(), pos = -1, i;
    for (i = 0; i < trab.length; i++) if (trab[i] && trab[i].id === novo.id) { pos = i; break; }
    function tamRec(x) { return x === undefined ? 4 : P.bytes(x); }
    var tam = [], soma = 0;
    for (i = 0; i < trab.length; i++) { tam[i] = i === pos ? 0 : tamRec(trab[i]); soma += tam[i]; }
    var bNovo = P.bytes(novo), nReg = trab.length - (pos >= 0 ? 1 : 0) + 1;
    // JSON de um array = "[" + itens separados por "," + "]"
    function total() { return 2 + soma + bNovo + (nReg - 1); }
    // a entidade como está hoje (com a versão velha do registro, se ele já existe)
    var bytesAntes = trab.length ? 2 + soma + (pos >= 0 ? tamRec(trab[pos]) : 0) + (trab.length - 1) : 2;
    var ativaDe = {};
    for (i = 0; i < trab.length; i++) {
      if (i === pos || !ehBase(trab[i])) continue;
      var ob = str(trab[i].obraId);
      if (!own(ativaDe, ob) || trab[i].versao > ativaDe[ob].versao ||
        (trab[i].versao === ativaDe[ob].versao && (cmp(str(trab[i].criadaEm), str(ativaDe[ob].criadaEm)) || cmp(str(trab[i].id), str(ativaDe[ob].id))) > 0)) ativaDe[ob] = trab[i];
    }
    if (ehBase(novo)) delete ativaDe[str(novo.obraId)];   // a que a nova substitui já é antiga
    var resumidas = [], arquivadas = [], mudou = {}, conflitos = 0;
    /* FASE 0 — ⚠ A CÓPIA DO PERDEDOR DE CONFLITO SAI DE QUALQUER REGISTRO,
       antes de mexer em versão de linha de base (revisão 3, lente sync). O
       merge da nuvem pendurava em `_conflitoDe` a cópia inteira do perdedor
       (até 50 KB) DEPOIS desta porta medir a lista, e esta porta nunca tocava
       plano nem base ativa: três conflitos de planos cheios levaram a
       entidade a 1.033.669 B (acima do 1 MiB do Firestore com seis) e, a
       partir daí, toda gravação era recusada com "avise o suporte". Hoje o
       merge do `crono_obra` guarda só o resumo (nuvem.js); esta fase é a
       defesa para a cópia que já estiver no disco. O carimbo novo propaga a
       limpeza pelo merge por id. A ativa continua ativa (o conteúdo não muda). */
    if (total() > P.TETO_ENTIDADE) {
      for (i = 0; i < trab.length; i++) {
        var xc = trab[i];
        if (i === pos || !ehObj(xc) || !own(xc, "_conflitoDe")) continue;
        var sc = {}, kc;
        for (kc in xc) if (own(xc, kc) && kc !== "_conflitoDe") sc[kc] = xc[kc];
        sc.atualizadoEm = agoraISO;
        var tamV = tam[i]; tam[i] = tamRec(sc); soma += tam[i] - tamV;
        // ⚠ a ativa é reconhecida pelo OBJETO: sem trocar a referência, a fase seguinte a resumiria
        for (var oc in ativaDe) if (own(ativaDe, oc) && ativaDe[oc] === xc) ativaDe[oc] = sc;
        trab[i] = sc; mudou[i] = true; conflitos++;
      }
    }
    var f = 0;
    while (total() > P.TETO_ENTIDADE && f < FASES.length) {
      var fase = FASES[f], cand = [];
      for (i = 0; i < trab.length; i++) {
        var x = trab[i];
        if (i === pos || !ehBase(x) || x.id === novo.id) continue;
        if (ativaDe[str(x.obraId)] === x) continue;                         // ⚠ a ativa nunca
        if ((x.versao === 1) !== fase.v1) continue;
        if (fase.nivel === 1 ? x.resumida : (!x.resumida || x.arquivada)) continue;
        cand.push(i);
      }
      if (!cand.length) { f++; continue; }
      cand.sort(function (a, b) {
        return cmp(str(trab[a].criadaEm), str(trab[b].criadaEm)) || cmp(str(trab[a].obraId), str(trab[b].obraId)) || (trab[a].versao - trab[b].versao);
      });
      var k = cand[0], velho = trab[k];
      var nv = fase.nivel === 1 ? P.resumirBase(velho) : arquivar(velho);
      /* a cópia do perdedor de um conflito antigo (até 50 KB) sai junto: é a
         versão perdedora de uma base que acabou de ser resumida de propósito */
      delete nv._conflitoDe;
      nv.atualizadoEm = agoraISO;   // ⚠ carimbo novo: sem ele o merge por id não propaga o resumo
      soma += (tam[k] = tamRec(nv)) - tamRec(velho);
      trab[k] = nv; mudou[k] = true;
      (fase.nivel === 1 ? resumidas : arquivadas).push(nv.id);
    }
    if (total() > P.TETO_ENTIDADE) {
      /* só na recusa (serializa a lista inteira); sem a versão velha do
         registro que está sendo regravado, senão o plano contaria duas vezes */
      var semVelho = [];
      for (i = 0; i < trab.length; i++) if (i !== pos) semVelho.push(trab[i]);
      var ocup = ocupacao(semVelho.concat([novo]));
      return falha("o planejamento das obras desta empresa passaria de " + kb(total()) + " KB (limite " + kb(P.TETO_ENTIDADE) +
        " KB, antes do teto de 1 MiB da nuvem, onde ele pararia de sincronizar sem aviso) — mesmo com as versões antigas de linha de base já resumidas. " +
        "Nada foi gravado. Ocupam o espaço: " + ocup.planos + " plano(s) de execução (" + kb(ocup.bytesPlanos) + " KB), " +
        ocup.basesAtivas + " linha(s) de base ativa(s) (" + kb(ocup.bytesAtivas) + " KB) e " +
        (ocup.bases - ocup.basesAtivas) + " versão(ões) antiga(s) já resumida(s) (" + kb(ocup.bytesAntigas) + " KB)" +
        (ocup.outros ? ", mais " + ocup.outros + " registro(s) que esta versão do app não conhece (" + kb(ocup.bytesOutros) + " KB)" : "") + ". " +
        "Não há mais o que resumir sozinho: avise o suporte da RA com estes números.",
        { codigo: "sem-espaco", bytes: total(), teto: P.TETO_ENTIDADE, ocupacao: ocup });
    }
    var gravar = [], semNovo = [];
    for (i = 0; i < trab.length; i++) {
      if (mudou[i]) gravar.push(trab[i]);
      if (i !== pos) semNovo.push(trab[i]);
    }
    /* conferência pela régua oficial (uma serialização da lista inteira): a
       conta incremental acima é só para não serializar a lista a cada resumo */
    var c = P.cabeNaEntidade(semNovo, novo);
    if (!c.cabe) return falha(c.msg, { codigo: "sem-espaco", bytes: c.bytesDepois, teto: P.TETO_ENTIDADE, ocupacao: ocupacao(semNovo.concat([novo])) });
    if (pos >= 0) trab[pos] = novo; else trab.push(novo);
    gravar.push(novo);
    var msg = null;
    if (resumidas.length || arquivadas.length || conflitos) {
      msg = "Para caber no limite de " + kb(P.TETO_ENTIDADE) + " KB da nuvem, " +
        (conflitos ? conflitos + " cópia(s) de edição simultânea antiga (guardadas por conflito entre aparelhos) foram descartadas" + (resumidas.length || arquivadas.length ? "; " : "") : "") +
        (resumidas.length ? resumidas.length + " versão(ões) antiga(s) de linha de base foram resumidas (ficam o prazo, o valor e as etapas; saem as subetapas e a curva)" : "") +
        (resumidas.length && arquivadas.length ? " e " : "") +
        (arquivadas.length ? arquivadas.length + " foram arquivadas (fica só o cabeçalho: versão, motivo, prazo e valor)" : "") +
        ". A linha de base ativa de cada obra continua completa.";
    }
    return { ok: true, lista: trab, gravar: gravar, resumidas: resumidas, arquivadas: arquivadas, conflitosDescartados: conflitos,
      bytesAntes: bytesAntes, bytes: c.bytesDepois, teto: P.TETO_ENTIDADE, msg: msg };
  }

  function ocupacao(lista) {
    var P = Pl(), l = ehLista(lista) ? lista : [];
    var o = { bytes: P ? P.bytes(l) : null, teto: P ? P.TETO_ENTIDADE : null, registros: l.length,
      bases: 0, basesAtivas: 0, resumidas: 0, arquivadas: 0, planos: 0, outros: 0,
      bytesPlanos: 0, bytesAtivas: 0, bytesAntigas: 0, bytesOutros: 0 };
    var ativaDe = {}, i, x;
    for (i = 0; i < l.length; i++) {
      x = l[i];
      if (ehBase(x)) {
        var ob = str(x.obraId), a = ativaDe[ob];
        if (!a || x.versao > a.versao || (x.versao === a.versao && (cmp(str(x.criadaEm), str(a.criadaEm)) || cmp(str(x.id), str(a.id))) > 0)) ativaDe[ob] = x;
      }
    }
    for (i = 0; i < l.length; i++) {
      x = l[i];
      var b = P ? P.bytes(x === undefined ? null : x) : 0;
      if (ehBase(x)) {
        o.bases++;
        if (x.arquivada) o.arquivadas++; else if (x.resumida) o.resumidas++;
        if (ativaDe[str(x.obraId)] === x) { o.basesAtivas++; o.bytesAtivas += b; } else o.bytesAntigas += b;
      } else if (ehPlano(x)) { o.planos++; o.bytesPlanos += b; }
      else { o.outros++; o.bytesOutros += b; }
    }
    o.livre = o.bytes == null ? null : Math.max(0, o.teto - o.bytes);
    return o;
  }

  /* o que mais pesa num plano, em palavras de gente — o recado do teto diz
     ONDE está o peso, não só que passou */
  var ROT_CRON = { duracoes: "durações das etapas", marcos: "marcos das etapas", predecessoras: "dependências das etapas",
    lags: "esperas entre etapas", duracoesAgente: "marcas de origem das durações", iaMotivos: "motivos da IA das etapas",
    params: "parâmetros", exec: "modo executivo (inclui as durações guardadas ao ligar)" };
  var ROT_SUB = { duracoes: "durações das subetapas", marcos: "marcos das subetapas", predecessoras: "dependências das subetapas",
    lags: "esperas entre subetapas", tipos: "tipos de dependência das subetapas", equipes: "equipes das subetapas",
    agente: "marcas de origem das subetapas", iaMotivos: "motivos da IA das subetapas" };
  function maiorPedaco(cr) {
    var P = Pl(), best = null, k;
    function ve(rot, v) { var b = P.bytes(v === undefined ? null : v); if (!best || b > best.bytes) best = { rotulo: rot, bytes: b }; }
    if (!ehObj(cr)) return null;
    for (k in cr) if (own(cr, k) && k !== "sub") ve(ROT_CRON[k] || k, cr[k]);
    if (ehObj(cr.sub)) for (k in cr.sub) if (own(cr.sub, k)) ve(ROT_SUB[k] || ("subetapas: " + k), cr.sub[k]);
    return best;
  }
  /* o teto do plano mede o PLANO — sem a cópia do perdedor que o merge da
     nuvem pendura em `_conflitoDe` (até 50 KB). Contá-la travaria o plano
     depois de um conflito, sem porta: a pessoa não tem como apagá-la. A
     entidade, essa sim, conta tudo (é o documento que a nuvem recebe). */
  function bytesPlano(rec) {
    var P = Pl(), c = {}, k;
    for (k in rec) if (own(rec, k) && k !== "_conflitoDe") c[k] = rec[k];
    return P.bytes(c);
  }
  function msgTetoPlano(rec, b) {
    var m = maiorPedaco(rec.cronograma);
    return "o plano de execução desta obra ficaria com " + kb(b) + " KB (limite " + kb(TETO_PLANO) +
      " KB por obra, porque o planejamento de todas as obras da empresa sincroniza num documento só de 1 MiB)" +
      (m ? ". O que mais ocupa: " + m.rotulo + " (" + kb(m.bytes) + " KB)" : "") +
      ". Nada foi gravado. Avise o suporte da RA com estes números.";
  }

  /* mapas que o motor lê como objeto. Um mapa que voltou como LISTA ([])
     não segura chave com nome — o JSON a descarta —, então a edição feita no
     plano sumiria no salvar. [] vira {} (mesmo conteúdo: nenhum). */
  var MAPAS_CRON = ["params", "duracoes", "marcos", "predecessoras", "lags", "duracoesAgente", "iaMotivos", "exec"];
  var MAPAS_SUB = ["duracoes", "marcos", "predecessoras", "lags", "tipos", "equipes", "agente", "iaMotivos"];
  function normalizarCron(cr) {
    MAPAS_CRON.forEach(function (k) { if (own(cr, k) && !ehObj(cr[k])) cr[k] = {}; });
    if (own(cr, "sub") && !ehObj(cr.sub)) cr.sub = {};
    if (ehObj(cr.sub)) MAPAS_SUB.forEach(function (k) { if (own(cr.sub, k) && !ehObj(cr.sub[k])) cr.sub[k] = {}; });
    return cr;
  }

  var CronoBase = {
    ENTIDADE: ENTIDADE,
    TETO_PLANO: TETO_PLANO,
    ehLista: ehLista,
    idPlano: idPlano,

    /* versões da linha de base da obra, da v1 à ativa */
    bases: bases,
    /* a linha de base que vale: a de MAIOR versão (null = obra sem base) */
    ativa: ativa,
    proximaVersao: function (lista, obraId) { var a = ativa(lista, obraId); return a ? a.versao + 1 : 1; },
    /* o plano de execução da obra (null = ainda não iniciado) */
    plano: function (lista, obraId) {
      var o = str(obraId), i;
      if (!ehLista(lista) || !o) return null;
      for (i = 0; i < lista.length; i++) {
        var x = lista[i];
        if (ehPlano(x) && str(x.obraId) === o && x.id === idPlano(o)) return x;
      }
      return null;
    },
    /* bytes UTF-8 da entidade inteira, na régua da nuvem (null sem o
       CronoPlan — nunca 0, que leria como "vazia") */
    tamanho: function (lista) { var P = Pl(); return P ? P.bytes(ehLista(lista) ? lista : []) : null; },
    ocupacao: ocupacao,
    arquivarBase: arquivar,

    /* =================================================================
       novaBase — acrescenta uma versão de linha de base à entidade.

       `base` = o registro de `CronoPlan.congelarBase` (ou o {erro} dele, que
       volta como está). `meta` = {agora}.
       Confere: é base, é desta obra, não é resumida, tem nós e curva; a
       versão é EXATAMENTE a próxima (a ativa + 1) — nem regravar uma que
       existe (base é imutável), nem pular; motivo a partir da v2; teto de
       40 KB por versão em UTF-8 (o congelarBase já mede, mas o registro
       ganha carimbos e pode ter sido mexido no caminho: mede de novo); e o
       espaço da entidade, pela porta de `abrirEspaco`.
       Devolve {ok, base, lista (a entidade inteira depois), gravar
       (registros a gravar: a nova + as antigas resumidas), resumidas,
       arquivadas, bytes, msg} ou {ok:false, erro, codigo?, bytes?}.
       ================================================================= */
    novaBase: function (lista, obraId, base, meta) {
      meta = meta || {};
      var P = Pl();
      if (!P) return falha(SEM_MOTOR);
      if (lista == null) lista = [];
      if (!ehLista(lista)) return falha(NAO_LISTA, { codigo: "nao-lista" });
      var o = str(obraId);
      if (!o) return falha("linha de base sem obra — ela pertence a uma obra. Nada foi gravado.");
      if (!ehObj(base)) return falha("nada para gravar: a linha de base não veio.");
      if (base.erro) return falha(String(base.erro), base.bytes != null ? { bytes: base.bytes } : null);
      if (base.tipo !== "base") return falha("o registro não é uma linha de base (tipo " + str(base.tipo) + "). Nada foi gravado.");
      if (str(base.obraId) !== o) return falha("esta linha de base foi congelada para outra obra — congele de novo a partir desta. Nada foi gravado.");
      if (base.resumida || base.arquivada) return falha("uma versão resumida não pode virar a linha de base ativa (sem as subetapas o previsto × realizado não fecha). Congele de novo. Nada foi gravado.");
      if (!ehLista(base.nos) || !base.nos.length || !ehLista(base.curva)) return falha("linha de base sem etapas ou sem curva — congele de novo a partir do cronograma. Nada foi gravado.");
      var v = base.versao;
      if (!(typeof v === "number" && v >= 1 && v % 1 === 0)) return falha("versão da linha de base inválida (" + v + ") — use 1, 2, 3… Nada foi gravado.");
      var at = ativa(lista, o), prox = at ? at.versao + 1 : 1;
      if (v !== prox) {
        return falha(v < prox
          ? "a versão " + v + " da linha de base já existe nesta obra (a ativa é a v" + at.versao + ") — linha de base não se regrava; reprogramar cria a versão " + prox + ". Nada foi gravado."
          : "a próxima versão da linha de base desta obra é a " + prox + ", não a " + v + " — congele de novo como versão " + prox + ". Nada foi gravado.",
          { codigo: "versao", proxima: prox });
      }
      if (v > 1 && !str(base.motivo).trim()) return falha("informe o motivo da reprogramação — a versão " + v + " substitui a " + (v - 1) + " na comparação da obra. Nada foi gravado.");
      var ag = iso(meta.agora);
      var rec = clone(base);
      /* ⚠ ID ÚNICO POR GRAVAÇÃO (revisão 3, lente sync). O id era o do
         congelarBase, base_<obra>_v<n>: dois aparelhos congelando a mesma v2
         geravam o MESMO id, o merge por id escolhia uma, e a v2 do escritório
         era trocada por baixo pela do campo — com o recado "não se perdeu
         nada" e o IDP passando a medir contra uma base que quem congelou nunca
         viu (e com a cópia perdedora de 25 KB pendurada nela para sempre).
         Com o sufixo, as duas sobrevivem ao merge; a ATIVA é a mesma nos dois
         aparelhos (desempate por criadaEm e id, em `bases`), e o painel e o
         histórico dizem que há duas. `meta.sufixo` fixa o sufixo nos testes. */
      var suf = meta.sufixo != null ? str(meta.sufixo) : (ag.replace(/\D/g, "").slice(2, 17) + Math.random().toString(36).slice(2, 6));
      rec.id = str(base.id) + "_" + suf;
      for (var i = 0; i < lista.length; i++) {
        if (lista[i] && (lista[i].id === base.id || lista[i].id === rec.id)) return falha("já existe um registro com o id da linha de base (" + str(lista[i].id) + ") — linha de base é imutável e não se regrava. Nada foi gravado.", { codigo: "versao", proxima: prox });
      }
      /* a cópia de conflito não entra no planejamento (ver salvarPlano) */
      delete rec._conflitoDe;
      rec.atualizadoEm = ag;
      if (!rec.criadoEm) rec.criadoEm = ag;
      var b = P.bytes(rec);
      if (b > P.TETO_BASE) {
        return falha("linha de base grande demais (" + kb(b) + " KB; o limite é " + kb(P.TETO_BASE) + " KB por versão, porque todas as linhas de base da empresa sincronizam juntas num documento de 1 MiB). Agrupe subetapas pequenas ou encurte os nomes das etapas e subetapas e congele de novo. Nada foi gravado.", { codigo: "teto-base", bytes: b });
      }
      var r = abrirEspaco(lista, rec, ag);
      if (!r.ok) return r;
      r.base = rec;
      return r;
    },

    /* =================================================================
       iniciarPlano — "Iniciar plano de execução da obra": copia o
       cronograma do orçamento para o registro da obra.

       ⚠ Só do orçamento LIGADO à obra (`obra.orcamentoId === orc.id`). A obra
       numa revisão anterior se resolve ANTES (espec 3.2: a cadeia
       `revisaoDe` e "passar a obra para esta revisão"); aqui, plano de um
       orçamento que a obra não usa mediria a obra contra o escopo errado.
       A cópia é PROFUNDA (editar o plano não pode mexer na proposta
       aprovada) e fiel: todas as chaves de `orc.cronograma`, inclusive as
       que esta versão não conhece. Não troca a data de início pela da obra —
       quem calcula a obra usa o override {dataInicio: obra.inicio}, como o
       `congelarBase` exige. `agora` injetável; `por` opcional.
       Devolve o registro (sem gravar) ou {erro, codigo?, bytes?}.
       ================================================================= */
    iniciarPlano: function (orc, obra, agora, por) {
      var P = Pl();
      if (!P) return { erro: SEM_MOTOR };
      if (!ehObj(orc) || !str(orc.id)) return { erro: "sem orçamento — o plano de execução nasce do orçamento ligado à obra. Nada foi criado." };
      if (!ehObj(obra) || !str(obra.id)) return { erro: "sem obra — o plano de execução pertence a uma obra. Nada foi criado." };
      if (str(obra.orcamentoId) !== str(orc.id)) {
        return str(obra.orcamentoId)
          ? { erro: "a obra está ligada a outro orçamento — o plano de execução nasce do orçamento ligado a ela. Para planejar por este, troque o orçamento no cadastro da obra (Editar → Orçamento). Nada foi criado.", codigo: "outro-orcamento" }
          : { erro: "a obra ainda não está ligada a este orçamento — escolha-o no cadastro da obra (Editar → Orçamento) e inicie o plano de novo. Nada foi criado.", codigo: "sem-orcamento" };
      }
      var cr = ehObj(orc.cronograma) ? normalizarCron(clone(orc.cronograma)) : {};
      var ag = iso(agora);
      var rec = {
        id: idPlano(obra.id), tipo: "plano", obraId: str(obra.id),
        orcamentoId: str(orc.id), orcNumero: str(orc.numero).slice(0, 40),
        cronograma: cr, iniciadoEm: ag, criadoEm: ag, atualizadoEm: ag,
        por: str(por).slice(0, 60)
      };
      var b = bytesPlano(rec);
      if (b > TETO_PLANO) return { erro: msgTetoPlano(rec, b), codigo: "teto-plano", bytes: b };
      return rec;
    },

    /* =================================================================
       salvarPlano — grava (cria ou atualiza) o plano de execução.
       `opts` = {agora, por, novo (é o "Iniciar": recusa se já houver
       plano), substituir (com `novo`: reiniciar de propósito)}.
       Mede o teto do plano (sem `_conflitoDe`) e o da entidade (com tudo,
       pela porta de `abrirEspaco`). O `cronograma` vai por REFERÊNCIA (é o
       objeto que a tela edita pelo `_cronoAlvo`); o registro é uma cópia
       rasa com carimbo novo.
       Devolve {ok, plano, lista, gravar, resumidas, arquivadas, bytes, msg}
       ou {ok:false, erro, codigo?}.
       ================================================================= */
    salvarPlano: function (lista, plano, opts) {
      opts = opts || {};
      var P = Pl();
      if (!P) return falha(SEM_MOTOR);
      if (lista == null) lista = [];
      if (!ehLista(lista)) return falha(NAO_LISTA, { codigo: "nao-lista" });
      if (!ehPlano(plano)) return falha("o registro não é um plano de execução. Nada foi gravado.");
      var o = str(plano.obraId);
      if (!o || plano.id !== idPlano(o)) return falha("plano de execução com identificação inválida (esperado " + idPlano(o) + ") — nada foi gravado.");
      if (!ehObj(plano.cronograma)) return falha("o plano de execução não tem cronograma — nada foi gravado.");
      var atual = this.plano(lista, o);
      if (opts.novo && atual && !opts.substituir) {
        return falha("esta obra já tem plano de execução" + (atual.orcNumero ? " (do orçamento " + atual.orcNumero + ")" : "") +
          " — iniciar de novo apagaria as edições feitas nele. Nada foi gravado.", { codigo: "ja-existe" });
      }
      var rec = {}, k;
      /* ⚠ SEM `_conflitoDe` (revisão 3, lente sync): copiar todas as chaves
         levava junto, a cada gravação, a cópia do perdedor de um conflito
         antigo (até 50 KB por plano) — e a porta do espaço nunca toca plano.
         Nada daqui a lê (nenhuma tela mostra conflito); o merge do
         `crono_obra` já não guarda a cópia (nuvem.js). */
      for (k in plano) if (own(plano, k) && k !== "_conflitoDe") rec[k] = plano[k];
      rec.atualizadoEm = iso(opts.agora);
      if (!rec.criadoEm) rec.criadoEm = rec.atualizadoEm;
      if (opts.por != null) rec.por = str(opts.por).slice(0, 60);
      var b = bytesPlano(rec);
      if (b > TETO_PLANO) return falha(msgTetoPlano(rec, b), { codigo: "teto-plano", bytes: b });
      var r = abrirEspaco(lista, rec, rec.atualizadoEm);
      if (!r.ok) return r;
      r.plano = rec;
      return r;
    },

    /* =================================================================
       orcComPlano — o orçamento como a OBRA o executa: clone RASO com
       `cronograma` = o do plano. É assim que `Cronograma.estimar` calcula o
       plano da obra sem `ctx` (I4: nenhuma data depende de ctx).
       ⚠ O `cronograma` é o DO PLANO, por referência: `materializar` e as
         edições da tela feitas sobre o clone caem no plano — que é o que se
         grava (`salvarPlano`). O orçamento em si não é tocado.
       ⚠ NUNCA gravar este clone como orçamento: poria o plano da obra na
         proposta aprovada. Ele leva `_planoDaObra` (enumerável, de propósito:
         se um dia for gravado, o rastro fica no registro) para quem grava
         poder recusar.
       Plano ausente ou inválido → null (nunca o próprio orçamento: quem pediu
       o plano e recebesse a proposta editaria o aprovado achando que é o
       plano).
       ================================================================= */
    orcComPlano: function (orc, plano) {
      if (!ehObj(orc) || !ehPlano(plano) || !ehObj(plano.cronograma)) return null;
      var c = {}, k;
      for (k in orc) if (own(orc, k)) c[k] = orc[k];
      c.cronograma = plano.cronograma;
      c._planoDaObra = str(plano.obraId);
      return c;
    }
  };

  global.CronoBase = CronoBase;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoBase;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

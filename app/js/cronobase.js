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
  /* ⚠ 60 KB por plano, em bytes UTF-8. Medido (tools/test-crono-obra-sync.js):
     um plano de 30 etapas × 90 subetapas com TODOS os mapas cheios (durações,
     dependências, lags, equipes, marcas e motivo da IA em cada um dos 120
     nós) dava 44.928 B; com o corte dos motivos (`CronoPlan.cortarMotivos`,
     ver `salvarPlano`) dá ~30 KB. Copiado de um orçamento comum, ~3,5 KB.
     O teto existe para um plano sozinho não comer o documento das outras
     obras — o limite que manda de verdade é o da entidade (`abrirEspaco`). */
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
  function Av() { return dep("CronoAvanco", "./cronoavanco.js"); }

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
  function idAvanco(obraId) { return "avanco_" + str(obraId); }
  /* uma base com versão de verdade (inteiro ≥ 1). Versão em texto ("2") não
     entra: toda gravação passa por `novaBase`, que só aceita número — um
     registro assim veio de fora do caminho e não pode decidir a ativa. */
  function ehBase(x) { return ehObj(x) && x.tipo === "base" && typeof x.versao === "number" && isFinite(x.versao) && x.versao >= 1; }
  function ehPlano(x) { return ehObj(x) && x.tipo === "plano"; }
  /* o AVANÇO LANÇADO da obra (planejador, Onda 0, T2): registro próprio,
     id `avanco_<obraId>`, `tipo: "avanco"`. Quem grava e lê o conteúdo é a
     1A (`salvarAvanco`, `avanco`); aqui só o que a Onda 0 precisa para a
     porta do espaço contá-lo à parte e nunca resumi-lo. */
  function ehAvanco(x) { return ehObj(x) && x.tipo === "avanco"; }

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
          saem subetapas, nomes, curva e tarefas sem preço);
       2. arquivar (fica só o cabeçalho: versão, motivo, prazo e valor).
     ⚠ A CONTRATUAL NUNCA (planejador, fatia 1B; espec §3.3, D15, D16). A
       1.2.81 tinha mais duas fases — resumir e arquivar a v1 "por último" —
       e o Histórico prometia que a contratual seria resumida um dia. É ela
       que o comparativo de pleito mede: resumida, a promessa do contrato
       perdia as subetapas. Protegida é a base marcada contratual (no
       cabeçalho, ou — com `selos` — pela `CronoSelo.contratual`, gêmeas
       inclusive) e, POR SEGURANÇA, a v1 de obra sem nenhuma marca. A porta
       para ela é "Encerrar planejamento de obra concluída" (D16): com o
       pacote exportado, a obra encerrada perde a proteção.
     ⚠ NUNCA BASE SEM SELO COM FOLHAS (com `selos`): o detalhe não existe em
       outro lugar. Resumir exige o selo legível com as subetapas; arquivar,
       o selo legível com as etapas. SEM `selos` (o chamador não leu a
       entidade — hoje o `salvarPlano`, que é da 1A), vale a regra de antes
       para as antigas não contratuais: é o que a 1.2.81 já faz, e recusar
       ali travaria o plano sem porta.
     ⚠ NUNCA toca na base ATIVA de obra nenhuma (é a que o IDP lê — base
     resumida o confronto recusa) nem em plano de execução (é trabalho vivo).
     A base que a nova vai substituir já conta como antiga.
     Esgotadas as fases, RECUSA com os números: não grava nada, e a lista
     de quem chamou fica intacta (tudo aqui trabalha em cópia).

     Medido no pior caso de uma empresa (tools/test-crono-obra-sync.js):
     20 obras × 5 versões × 30 etapas × 90 subetapas + 20 planos copiados do
     orçamento cabem sem nenhuma recusa.
     ================================================================= */
  var FASES = [{ nivel: 1 }, { nivel: 2 }];
  function Se() { return dep("CronoSelo", "./cronoselo.js"); }

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

  function abrirEspaco(lista, novo, agoraISO, selos) {
    var P = Pl();
    var trab = lista.slice(), pos = -1, i;
    /* `selos` = a lista CRUA de `crono_selo` (ou ausente — ver FASES). */
    var comSelos = ehLista(selos), CS = comSelos ? Se() : null;
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
    var f = 0, prot = null;
    /* as contratuais protegidas, calculadas UMA vez e só quando falta espaço */
    function protegidas() {
      if (prot) return prot;
      prot = { base: {}, obraMarcada: {}, encerrada: {} };
      var k, xb;
      for (k = 0; k < trab.length; k++) {
        xb = trab[k];
        if (ehBase(xb) && xb.contratual === true) { prot.base[str(xb.id)] = true; prot.obraMarcada[str(xb.obraId)] = true; }
      }
      if (CS && typeof CS.contratuaisDe === "function") {
        var cs = CS.contratuaisDe(trab, selos), cid;
        for (cid in cs) if (own(cs, cid)) prot.base[cid] = true;
        for (k = 0; k < trab.length; k++) { xb = trab[k]; if (ehBase(xb) && own(cs, str(xb.id))) prot.obraMarcada[str(xb.obraId)] = true; }
        prot.encerrada = CS.encerradasDe(selos);
      }
      return prot;
    }
    function ehProtegida(x) {
      var pr = protegidas(), ob = str(x.obraId);
      if (own(pr.encerrada, ob)) return false;                      // D16: o pacote foi exportado
      if (own(pr.base, str(x.id))) return true;
      return x.versao === 1 && !own(pr.obraMarcada, ob);           // ⚠ a v1 de obra sem marca, por segurança
    }
    while (total() > P.TETO_ENTIDADE && f < FASES.length) {
      var fase = FASES[f], cand = [];
      for (i = 0; i < trab.length; i++) {
        var x = trab[i];
        /* ⚠ O AVANÇO LANÇADO NUNCA É RESUMIDO (planejador, Onda 0, T2; espec
           §1.4). É o realizado da obra — resumir perderia a data real de cada
           tarefa, e o realizado não se reconstrói. Hoje o `ehBase` logo abaixo
           já o exclui; esta linha vem ANTES dele para continuar valendo no dia
           em que a lista de candidatos crescer (a 1B mexe nas FASES). Defesa em
           profundidade: quem sustenta sozinho é o `ehBase`, e o controle da
           suíte (tools/test-cronobase.js) sabota os dois juntos. */
        if (ehAvanco(x)) continue;
        if (i === pos || !ehBase(x) || x.id === novo.id) continue;
        if (ativaDe[str(x.obraId)] === x) continue;                         // ⚠ a ativa nunca
        if (fase.nivel === 1 ? x.resumida : (!x.resumida || x.arquivada)) continue;
        if (ehProtegida(x)) continue;                                       // ⚠ a contratual nunca
        /* ⚠ com os selos lidos, só o que o selo guarda pode sair daqui */
        if (comSelos && !(CS && (fase.nivel === 1 ? CS.guardaFolhas(selos, x.id) : CS.guardaEtapas(selos, x.id)))) continue;
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
      /* o detalhe ficou no selo: a versão nova o completa na leitura (CronoSelo.completar) */
      if (comSelos) nv.detalheNoSelo = 1;
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
      var ocup = ocupacao(semVelho.concat([novo]), selos);
      /* ⚠ O TEXTO DA RECUSA (fatia 1B, D16): a 1.2.81 dizia "resuma as
         versões antigas", que não resolve para a contratual — ela nunca é
         resumida. A porta que existe é encerrar o planejamento de uma obra
         concluída (a proteção dela sai e as versões antigas dela podem ser
         resumidas). QUAIS obras mais ocupam vai em `ocupacao.maiores` (ids):
         o motor não conhece o nome da obra, e quem mostra o recado o
         acrescenta (App._cronoRecusaEspaco) — id no texto seria recado que
         a pessoa não consegue ler. */
      var maiores = "";
      return falha("o planejamento das obras desta empresa passaria de " + kb(total()) + " KB (limite " + kb(P.TETO_ENTIDADE) +
        " KB, antes do teto de 1 MiB da nuvem, onde ele pararia de sincronizar sem aviso) — mesmo com as versões antigas de linha de base já resumidas. " +
        "Nada foi gravado. Ocupam o espaço: " + ocup.planos + " plano(s) de execução (" + kb(ocup.bytesPlanos) + " KB), " +
        ocup.basesAtivas + " linha(s) de base ativa(s) (" + kb(ocup.bytesAtivas) + " KB) e " +
        (ocup.bases - ocup.basesAtivas) + " versão(ões) antiga(s) já resumida(s) ou protegida(s) (" + kb(ocup.bytesAntigas) + " KB)" +
        (ocup.avancos ? ", mais " + ocup.avancos + " registro(s) de avanço lançado (" + kb(ocup.bytesAvancos) + " KB — o realizado da obra nunca é resumido)" : "") +
        (ocup.outros ? ", mais " + ocup.outros + " registro(s) que esta versão do app não conhece (" + kb(ocup.bytesOutros) + " KB)" : "") + "." + maiores + " " +
        "A linha de base contratual e a ativa de cada obra nunca são resumidas. Para liberar, encerre o planejamento de uma obra concluída (sub-aba Linhas de base → Encerrar planejamento) ou avise o suporte da RA com estes números.",
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
    /* ⚠ o recado é o DESTA porta (fatia 1B): o do `cabeNaEntidade` manda
       "resumir as versões antigas" — que não resolve para a contratual */
    if (!c.cabe) return falha("o planejamento das obras desta empresa passaria de " + kb(c.bytesDepois) + " KB (limite " + kb(P.TETO_ENTIDADE) + " KB, antes do teto de 1 MiB da nuvem). Nada foi gravado. " +
      "A linha de base contratual e a ativa de cada obra nunca são resumidas. Para liberar, encerre o planejamento de uma obra concluída (sub-aba Linhas de base → Encerrar planejamento) ou avise o suporte da RA com estes números.",
      { codigo: "sem-espaco", bytes: c.bytesDepois, teto: P.TETO_ENTIDADE, ocupacao: ocupacao(semNovo.concat([novo]), selos) });
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

  function ocupacao(lista, selos) {
    var P = Pl(), l = ehLista(lista) ? lista : [];
    /* `avancos`/`bytesAvancos` (planejador, Onda 0, T2): o avanço lançado é
       contado À PARTE. Em "outros" ele sairia no recado da recusa como
       "registro que esta versão do app não conhece" — que é mentira na versão
       que o grava, e esconde da pessoa o que ocupa o espaço. */
    /* `seladas` (fatia 1B): bases com selo — pela marca do cabeçalho ou, com
       `selos`, pelo selo que existe (o tardio não marca o cabeçalho).
       `porObra`/`maiores`: onde está o peso, por obra (a recusa e o
       Histórico dizem QUAIS obras ocupam). */
    var o = { bytes: P ? P.bytes(l) : null, teto: P ? P.TETO_ENTIDADE : null, registros: l.length,
      bases: 0, basesAtivas: 0, resumidas: 0, arquivadas: 0, planos: 0, avancos: 0, outros: 0, seladas: 0,
      bytesPlanos: 0, bytesAtivas: 0, bytesAntigas: 0, bytesAvancos: 0, bytesOutros: 0, porObra: {}, maiores: [] };
    var comSelo = {};
    if (ehLista(selos)) selos.forEach(function (s) { if (ehObj(s) && s.tipo === "selo") comSelo[str(s.baseId)] = true; });
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
      var obO = ehObj(x) && x.obraId != null ? str(x.obraId) : "";
      if (obO) {
        if (!own(o.porObra, obO)) o.porObra[obO] = { bytes: 0, bases: 0, planos: 0, avancos: 0 };
        o.porObra[obO].bytes += b;
      }
      if (ehBase(x)) {
        o.bases++;
        if (obO) o.porObra[obO].bases++;
        if (x.selado || own(comSelo, str(x.id))) o.seladas++;
        if (x.arquivada) o.arquivadas++; else if (x.resumida) o.resumidas++;
        if (ativaDe[str(x.obraId)] === x) { o.basesAtivas++; o.bytesAtivas += b; } else o.bytesAntigas += b;
      } else if (ehPlano(x)) { o.planos++; o.bytesPlanos += b; if (obO) o.porObra[obO].planos++; }
      else if (ehAvanco(x)) { o.avancos++; o.bytesAvancos += b; if (obO) o.porObra[obO].avancos++; }
      else { o.outros++; o.bytesOutros += b; }
    }
    o.maiores = Object.keys(o.porObra).map(function (k) { return { obraId: k, bytes: o.porObra[k].bytes }; })
      .sort(function (a, c) { return (c.bytes - a.bytes) || cmp(a.obraId, c.obraId); }).slice(0, 3);
    o.livre = o.bytes == null ? null : Math.max(0, o.teto - o.bytes);
    return o;
  }

  /* o que mais pesa num plano, em palavras de gente — o recado do teto diz
     ONDE está o peso, não só que passou */
  var ROT_CRON = { duracoes: "durações das etapas", marcos: "marcos das etapas", predecessoras: "dependências das etapas",
    lags: "esperas entre etapas", duracoesAgente: "marcas de origem das durações", iaMotivos: "motivos da IA das etapas",
    params: "parâmetros", exec: "modo executivo (inclui as durações guardadas ao ligar)",
    // ⚠ mapa novo (12/09/2026): as datas que o arrasto no Gantt fixa (não iniciar antes de)
    restricoes: "datas fixadas das etapas",
    /* as chaves do planejador (espec §1.9): o recado do teto diz ONDE está o
       peso com as palavras da tela, não com o nome da chave */
    rede: "tipos de ligação e restrições (TT/IT/datas)", extras: "tarefas sem preço",
    cal: "calendários das frentes", mat: "compatibilidade com versões anteriores (valores guardados)",
    iaProv: "origem da IA nas dependências das etapas" };
  var ROT_SUB = { duracoes: "durações das subetapas", marcos: "marcos das subetapas", predecessoras: "dependências das subetapas",
    lags: "esperas entre subetapas", tipos: "tipos de dependência das subetapas", equipes: "equipes das subetapas",
    agente: "marcas de origem das subetapas", iaMotivos: "motivos da IA das subetapas",
    iaProv: "origem da IA nas dependências e equipes das subetapas" };
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
  /* ⚠ `restricoes` entrou aqui junto com o arrasto no Gantt (12/09/2026): é
     mapa etapaId → {tipo, data} e, voltando da nuvem como [], perderia a data
     que alguém fixou arrastando a barra — sem erro nenhum na tela. */
  var MAPAS_CRON_1281 = ["params", "duracoes", "marcos", "predecessoras", "lags", "duracoesAgente", "iaMotivos", "exec", "restricoes"];
  /* ⚠ as chaves do planejador (espec §1.9, 1A): `rede`, `cal` e `mat` são
     objetos de mapas — voltando da nuvem como [], a rede digitada, os
     calendários ou o valor planejado guardado sumiriam no salvar. `extras` e
     `cal.lista` NÃO entram: são LISTAS (a forma delas no disco é lista). */
  var MAPAS_CRON = MAPAS_CRON_1281.concat(["rede", "cal", "mat"]);
  var MAPAS_SUB = ["duracoes", "marcos", "predecessoras", "lags", "tipos", "equipes", "agente", "iaMotivos"];
  var SUBMAPAS_NOVOS = { rede: ["etapas", "folhas", "datas"], cal: ["de", "dur", "agente"], mat: ["etapas", "folhas", "restricoes", "pend"] };
  /* `regua1281` = a normalização EXATA da 1.2.81 (só os mapas que ela
     conhece): é a do `iniciarPlano` com a régua "1281", o plano que o
     aparelho antigo montaria (espec O30). */
  function normalizarCron(cr, regua1281) {
    (regua1281 ? MAPAS_CRON_1281 : MAPAS_CRON).forEach(function (k) { if (own(cr, k) && !ehObj(cr[k])) cr[k] = {}; });
    if (own(cr, "sub") && !ehObj(cr.sub)) cr.sub = {};
    if (ehObj(cr.sub)) MAPAS_SUB.forEach(function (k) { if (own(cr.sub, k) && !ehObj(cr.sub[k])) cr.sub[k] = {}; });
    if (!regua1281) Object.keys(SUBMAPAS_NOVOS).forEach(function (k) {
      if (!ehObj(cr[k])) return;
      SUBMAPAS_NOVOS[k].forEach(function (s) { if (own(cr[k], s) && !ehObj(cr[k][s])) cr[k][s] = {}; });
    });
    return cr;
  }

  /* `plano.iaResumo` (revisão 4, O31, §1.9): o que as portas do teto
     escolheram deixar SÓ no orçamento. `texto: 1` = porta (1) (marca da IA);
     `origem: 1` = porta (2) (sem `iaProv`); `em` = o dia da escolha. Não-objeto,
     chave desconhecida ou valor diferente de 1 → fora (ausente = nenhuma
     escolha: o plano guarda texto e origem como a 1.2.81). */
  function normalizarIaResumo(x) {
    if (!ehObj(x)) return null;
    var o = {};
    if (x.texto === 1) o.texto = 1;
    if (x.origem === 1) o.origem = 1;
    if (!o.texto && !o.origem) return null;
    if (typeof x.em === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.em)) o.em = x.em;
    return o;
  }
  /* as opções do corte da versão nova para um plano (CronoPlan.cortarMotivos) */
  function opcoesCorte(ia, cronOrc) {
    var o = {};
    if (ehObj(cronOrc)) o.cronOrc = cronOrc;
    if (ia && ia.texto) o.soMarca = true;
    if (ia && ia.origem) o.semOrigem = true;
    return o;
  }
  /* ⚠ A OBRA-SONDA DO `medirIniciar` (R4-9): o registro que o `iniciarPlano`
     monta leva o id da obra (duas vezes: no id do plano e em `obraId`) e o
     `por` até 60 caracteres. Medir um orçamento sem obra ligada com uma obra
     qualquer daria uma medida MENOR que a real — e o teto passaria no aparelho
     novo para ser recusado no antigo. Id de 21 caracteres (o maior dos ids
     reais) e `por` de 60 (o maior que a 1.2.81 grava): o lado seguro. */
  var OBRA_SONDA_ID = "obr_sonda000000000000";
  var POR_SONDA = "Responsavel pela obra - planejamento - medicao - supervisao.";
  var AGORA_SONDA = "2026-01-01T00:00:00.000Z";

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
    /* a régua do teto do plano (sem a cópia de conflito) — exportada na 1A
       (revisão 4, §1.10-5): o `materializarCrono` mede por ela */
    bytesPlano: bytesPlano,

    /* =================================================================
       O AVANÇO LANÇADO (planejador 1A, commit AVANÇO; espec §1.4, O17)
       ⚠ REGISTRO PRÓPRIO, NUNCA DENTRO DO PLANO. O merge do `crono_obra` é
         por registro inteiro e o perdedor vira resumo: com o avanço dentro do
         plano, a rede que o escritório digitou e o avanço que a obra lançou
         se apagariam um ao outro. Por isso `_cronoGravarAvanco` grava SÓ este
         registro, e o plano fica como estava (as datas que os aparelhos
         1.2.81 mostram são as do último salvar — `D-AVANCO-PENDENTE`).
       ================================================================= */
    idAvanco: idAvanco,
    ehAvanco: ehAvanco,
    /* o registro de avanço da obra (null = nunca foi lançado) */
    avanco: function (lista, obraId) {
      var o = str(obraId), i;
      if (!ehLista(lista) || !o) return null;
      for (i = 0; i < lista.length; i++) {
        var x = lista[i];
        if (ehAvanco(x) && str(x.obraId) === o && x.id === idAvanco(o)) return x;
      }
      return null;
    },
    /* grava SÓ o registro de avanço. Devolve {ok, lista, registro, msg} ou
       {ok:false, erro}. `opts`:
         agora    — o relógio (as suítes o fixam);
         por      — quem lançou;
         carimbo  — o CARIMBO FRACO (E-MC4): quando vem, é ele que vai no
                    `atualizadoEm`, e o retorno pede `manterCarimbo` ao
                    `Store.salvarVarios`. Serve à gravação AUTOMÁTICA (o canal
                    da medição na aprovação do boletim), que precisa PERDER
                    para qualquer edição humana feita depois da marca de sync;
         numeroB  — {idDoBoletim: "01a"}, só para o recado.
       ⚠ devolve `lista` para o encadeamento da §1.10-6 (a porta [Atualizar as
         datas…] grava avanço e plano em sequência, com uma escrita só). */
    salvarAvanco: function (lista, rec, opts) {
      opts = opts || {};
      var P = Pl();
      if (!P) return falha(SEM_MOTOR);
      if (lista == null) lista = [];
      if (!ehLista(lista)) return falha(NAO_LISTA, { codigo: "nao-lista" });
      if (!ehAvanco(rec)) return falha("o registro não é um lançamento de avanço. Nada foi gravado.");
      var o = str(rec.obraId);
      if (!o || rec.id !== idAvanco(o)) return falha("lançamento de avanço com identificação inválida (esperado " + idAvanco(o) + ") — nada foi gravado.");
      if (!ehLista(rec.nos)) return falha("o lançamento de avanço não tem a lista de tarefas — nada foi gravado.", { codigo: "forma" });
      var A = Av();
      if (!A) return falha("o módulo do avanço não carregou — nada foi gravado.");
      /* ⚠ A FORMA DO LASTRO (E-MC4) É CONFERIDA ANTES DE GRAVAR. O `b` é o id
         do boletim que sustenta a entrada: um `b` torto (número, objeto,
         texto de 300 caracteres) gravado aqui viajaria para todos os
         aparelhos e só apareceria como problema meses depois, na hora de
         mostrar "medição 01a" ao lado do número. A recusa DIZ o nó. */
      var ruim = null;
      rec.nos.forEach(function (e, k) {
        if (ruim || !ehObj(e)) return;
        if (!own(e, "b") || e.b == null) return;
        if (typeof e.b !== "string" || !e.b.length || e.b.length > A.B_MAX)
          ruim = "o lastro da tarefa " + (e.id || "(sem id)") + " está fora da forma (texto de 1 a " + A.B_MAX + " caracteres) — nada foi gravado.";
      });
      if (ruim) return falha(ruim, { codigo: "lastro" });
      /* ⚠ A ORIGEM "medicao" EXIGE O LASTRO, E A RECUSA É AQUI, NO PORTÃO.
         Roteiro do defeito (achado alto da revisão da Onda 6, 22/09/2026):
         o modal [Atualizar avanço] gravava `o:"medicao"` sem `b`, porque a
         fonte da medição não levava o lastro no payload cru. O leitor
         (`CronoAvanco.validarEntrada`, E-MC1) DESCARTA a origem quando falta
         o lastro — a entrada vira "digitada" com o aviso
         `avanco-medicao-sem-lastro`, o `MedAvanco.lastro` não a enxerga, e a
         faixa "sem lastro" e a porta [Rever] nunca aparecem: a tarefa fica
         100% concluída sustentada por um boletim REABERTO, calada (a rede de
         proteção D10 desligada). A faixa [Puxar das medições] sempre gravou
         certo — as duas portas do mesmo lançamento discordavam.
         A guarda mora AQUI, e não só na porta consertada, porque a próxima
         porta que alguém acrescentar repetiria o mesmo. Escrever a origem que
         o leitor derruba é erro de programação: quem grava ou leva o lastro,
         ou não escreve a origem (é o que `MedAvanco.aplicar` faz).
         ⚠ `rs: 1` fica de fora: a entrada de RESUMO nunca tem origem (E-MC8),
           e o leitor já a ignora com aviso — barrar a porta [Resumir o avanço
           das etapas concluídas] por causa disso seria trava sem saída. */
      var semLastro = null;
      rec.nos.forEach(function (e) {
        if (semLastro || !ehObj(e) || e.rs === 1) return;
        if (str(e.o) !== "medicao") return;
        if (own(e, "b") && typeof e.b === "string" && e.b.length) return;
        semLastro = "a tarefa " + (e.id || "(sem id)") + " foi gravada com a procedência “medição” e sem o boletim que a sustenta — " +
          "sem o lastro não há [Rever], e o aparelho leria o número como digitado. Nada foi gravado. " +
          "Recarregue o app e lance de novo; se repetir, avise o suporte da RA (nenhum avanço já gravado foi apagado).";
      });
      if (semLastro) return falha(semLastro, { codigo: "origem-sem-lastro", programacao: true });
      var novo = {}, k;
      for (k in rec) if (own(rec, k) && k !== "_conflitoDe") novo[k] = rec[k];
      novo.fmt = 1;
      var carimbo = opts.carimbo != null ? str(opts.carimbo) : null;
      novo.atualizadoEm = carimbo || iso(opts.agora);
      if (!novo.criadoEm) novo.criadoEm = novo.atualizadoEm;
      if (opts.por != null) novo.por = str(opts.por).slice(0, 60);
      /* ⚠ O TETO DO AVANÇO É SÓ DELE (50 KB, E-MC6): o avanço NUNCA é barrado
         pelo teto do plano (O17), e o realizado nunca é apagado por falta de
         espaço. Acima do teto a gravação é recusada com os números e com a
         porta [Resumir o avanço das etapas concluídas]. */
      var b = A.bytes(novo);
      if (b > A.TETO) {
        return falha("o avanço lançado desta obra ficaria com " + Math.round(b / 102.4) / 10 + " KB (limite " +
          Math.round(A.TETO / 1024) + " KB por obra). Nada foi gravado. Resuma o avanço das etapas já concluídas: as datas por subetapa delas passam a ser as planejadas dentro da janela real.",
          { codigo: "teto-avanco", bytes: b, teto: A.TETO });
      }
      var r = abrirEspaco(lista, novo, novo.atualizadoEm);
      if (!r.ok) return r;
      r.registro = novo;
      /* o `manterCarimbo` do `Store.salvarVarios`: com ele o registro sobe com
         o `atualizadoEm` calculado aqui, e não com "agora" */
      if (carimbo) r.manterCarimbo = true;
      return r;
    },
    /* apaga o registro de avanço da obra (a exclusão "só a obra" e o
       "Encerrar planejamento"). Devolve a lista sem ele. */
    limparAvanco: function (lista, obraId) {
      var o = str(obraId);
      if (!ehLista(lista) || !o) return ehLista(lista) ? lista.slice() : [];
      return lista.filter(function (x) { return !(ehAvanco(x) && str(x.obraId) === o); });
    },
    normalizarCron: normalizarCron,
    normalizarIaResumo: normalizarIaResumo,
    opcoesCorte: opcoesCorte,
    maiorPedaco: maiorPedaco,
    ROT_CRON: ROT_CRON,
    ROT_SUB: ROT_SUB,

    /* =================================================================
       novaBase — acrescenta uma versão de linha de base à entidade.

       `base` = o registro de `CronoPlan.congelarBase` (ou o {erro} dele, que
       volta como está). `meta` = {agora, sufixo, selos (a lista crua de
       `crono_selo`, para a porta do espaço), selado, contratual, aprovacao
       (as marcas do selo, fatia 1B), seloGravado (aceita o cabeçalho
       resumido de obra grande, com `detalheNoSelo`)}.
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
      /* ⚠ OBRA GRANDE (fatia 1B): o cabeçalho RESUMIDO com `detalheNoSelo`
         só entra quando quem chama já gravou o selo com as subetapas
         (`meta.seloGravado`) — é de lá que a versão nova lê o detalhe
         (CronoSelo.completar). Sem o selo, a regra de sempre: resumida não
         vira ativa (a 1.2.81 recusa o confronto e mostra "resumida"). */
      var grande = !!(meta.seloGravado === true && base.resumida && base.detalheNoSelo && !base.arquivada);
      if ((base.resumida || base.arquivada) && !grande) return falha("uma versão resumida não pode virar a linha de base ativa (sem as subetapas o previsto × realizado não fecha). Congele de novo. Nada foi gravado.");
      if (!ehLista(base.nos) || !base.nos.length || (!grande && !ehLista(base.curva))) return falha("linha de base sem etapas ou sem curva — congele de novo a partir do cronograma. Nada foi gravado.");
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
      /* `grande` é recado do congelarBase para quem chama, não dado */
      delete rec.grande;
      /* ⚠ AS MARCAS DO SELO (fatia 1B). `selado: 1` vai no MESMO registro
         (o mesmo documento da nuvem): um aparelho novo nunca vê o cabeçalho
         sem a marca, então nunca sela "tardio" uma base que tem selo a
         caminho. `contratual` e `aprovacao` são CÓPIA de conveniência — a
         verdade mora no selo (o `arquivar` da 1.2.81 as descarta). */
      if (meta.selado === true) rec.selado = 1;
      if (meta.contratual === true) rec.contratual = true;
      if (ehObj(meta.aprovacao)) rec.aprovacao = clone(meta.aprovacao);
      /* a cópia de conflito não entra no planejamento (ver salvarPlano) */
      delete rec._conflitoDe;
      rec.atualizadoEm = ag;
      if (!rec.criadoEm) rec.criadoEm = ag;
      var b = P.bytes(rec);
      if (b > P.TETO_BASE) {
        return falha("linha de base grande demais (" + kb(b) + " KB; o limite é " + kb(P.TETO_BASE) + " KB por versão, porque todas as linhas de base da empresa sincronizam juntas num documento de 1 MiB). Agrupe subetapas pequenas ou encurte os nomes das etapas e subetapas e congele de novo. Nada foi gravado.", { codigo: "teto-base", bytes: b });
      }
      var r = abrirEspaco(lista, rec, ag, meta.selos);
      if (!r.ok) return r;
      r.base = rec;
      return r;
    },
    /* as fases da porta do espaço (as suítes conferem que não há fase de v1) */
    FASES: FASES,

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
    /* ⚠ REVISÃO 4 (O30): `opts` = {regua, iaResumo}.
         - `regua: "1281"`: EXATAMENTE o `iniciarPlano` da 1.2.81 (a normalização
           dela, o corte dela, nenhum campo novo). É a régua do teto do
           ORÇAMENTO: a 1.2.81 recusa iniciar plano acima de 60 KB com "Avise o
           suporte", e um orçamento que passasse disso não viraria plano nos
           aparelhos antigos. `medirIniciar` chama por aqui — nunca uma réplica
           (memória "réplica de parser apodrece").
         - sem `regua` (a versão nova): a prova do teto usa o corte NOVO (sem o
           `m` do `iaProv`) e, com `opts.iaResumo`, as portas (1) e (2): o
           registro nasce com `iaResumo` e o `salvarPlano` corta igual. */
    iniciarPlano: function (orc, obra, agora, por, opts) {
      opts = opts || {};
      var r1281 = opts.regua === "1281";
      var P = Pl();
      if (!P) return { erro: SEM_MOTOR };
      if (!ehObj(orc) || !str(orc.id)) return { erro: "sem orçamento — o plano de execução nasce do orçamento ligado à obra. Nada foi criado." };
      if (!ehObj(obra) || !str(obra.id)) return { erro: "sem obra — o plano de execução pertence a uma obra. Nada foi criado." };
      if (str(obra.orcamentoId) !== str(orc.id)) {
        return str(obra.orcamentoId)
          ? { erro: "a obra está ligada a outro orçamento — o plano de execução nasce do orçamento ligado a ela. Para planejar por este, troque o orçamento no cadastro da obra (Editar → Orçamento). Nada foi criado.", codigo: "outro-orcamento" }
          : { erro: "a obra ainda não está ligada a este orçamento — escolha-o no cadastro da obra (Editar → Orçamento) e inicie o plano de novo. Nada foi criado.", codigo: "sem-orcamento" };
      }
      var cr = ehObj(orc.cronograma) ? normalizarCron(clone(orc.cronograma), r1281) : {};
      var ag = iso(agora);
      var rec = {
        id: idPlano(obra.id), tipo: "plano", obraId: str(obra.id),
        orcamentoId: str(orc.id), orcNumero: str(orc.numero).slice(0, 40),
        cronograma: cr, iniciadoEm: ag, criadoEm: ag, atualizadoEm: ag,
        por: str(por).slice(0, 60)
      };
      var ia = r1281 ? null : normalizarIaResumo(opts.iaResumo);
      if (ia) { if (!ia.em) ia.em = ag.slice(0, 10); rec.iaResumo = ia; }
      var b = bytesPlano(rec);
      if (b > TETO_PLANO) {
        /* ⚠ o teto se mede no que VAI FICAR GRAVADO: o `salvarPlano` corta os
           textos de motivo da IA, e recusar antes disso barraria um plano que
           cabe. Só na beira do teto (a cópia é cara) e SEM mexer no registro:
           o corte de verdade, com o recado, é o do salvar. */
        var prova = clone(rec);
        P.cortarMotivos(prova.cronograma, r1281 ? { regua: "1281" } : opcoesCorte(ia, orc.cronograma));
        var b2 = bytesPlano(prova);
        if (b2 > TETO_PLANO) return { erro: msgTetoPlano(prova, b2), codigo: "teto-plano", bytes: b2 };
      }
      return rec;
    },

    /* =================================================================
       medirIniciar — os BYTES do plano que o `iniciarPlano` montaria (e o
       `salvarPlano` gravaria, depois do corte), PELO PRÓPRIO `iniciarPlano`
       (revisão 4, O30, §2.8). `opts` = {regua ("1281" | "nova"), iaResumo,
       agora, por}. Não grava e não mexe no orçamento.
       Devolve {bytes, cabe, teto, regua} ou {erro} (orçamento/obra torta).
       `obra` ausente → a obra-sonda do lado seguro (ver OBRA_SONDA_ID).
       ⚠ A conta é a do aparelho: aceito quando o registro cortado cabe (o
       `iniciarPlano` só corta na beira do teto, mas o `salvarPlano` corta
       sempre, e o corte só diminui — então "cabe" é o mesmo veredito dos
       dois, e os bytes são os que ficariam no disco).
       ================================================================= */
    medirIniciar: function (orc, obra, opts) {
      opts = opts || {};
      var P = Pl();
      if (!P) return { erro: SEM_MOTOR };
      if (!ehObj(orc) || !str(orc.id)) return { erro: "sem orçamento para medir." };
      var r1281 = opts.regua === "1281", ob = {}, k;
      if (ehObj(obra) && str(obra.id)) { for (k in obra) if (own(obra, k)) ob[k] = obra[k]; }
      else ob.id = OBRA_SONDA_ID;
      ob.orcamentoId = str(orc.id);   // a medida é do plano DESTE orçamento, seja qual for o vínculo de hoje
      var rec = this.iniciarPlano(orc, ob, opts.agora || AGORA_SONDA, opts.por != null ? opts.por : POR_SONDA,
        r1281 ? { regua: "1281" } : { iaResumo: opts.iaResumo });
      var regua = r1281 ? "1281" : "nova";
      if (rec && rec.erro) {
        if (rec.codigo === "teto-plano") return { bytes: rec.bytes, cabe: false, teto: TETO_PLANO, regua: regua };
        return { erro: rec.erro, codigo: rec.codigo || null, regua: regua };
      }
      var prova = clone(rec);
      P.cortarMotivos(prova.cronograma, r1281 ? { regua: "1281" } : opcoesCorte(normalizarIaResumo(rec.iaResumo), orc.cronograma));
      var b = bytesPlano(prova);
      return { bytes: b, cabe: b <= TETO_PLANO, teto: TETO_PLANO, regua: regua };
    },

    /* =================================================================
       salvarPlano — grava (cria ou atualiza) o plano de execução.
       `opts` = {agora, por, novo (é o "Iniciar": recusa se já houver
       plano), substituir (com `novo`: reiniciar de propósito)}.
       Corta os TEXTOS de motivo da IA (`CronoPlan.cortarMotivos`, ver
       abaixo), mede o teto do plano (sem `_conflitoDe`) e o da entidade (com
       tudo, pela porta de `abrirEspaco`). O `cronograma` vai por REFERÊNCIA
       (é o objeto que a tela edita pelo `_cronoAlvo`) — e é nele que o corte
       acontece, de propósito: assim a tela mostra o que o disco guardou.
       Devolve {ok, plano, lista, gravar, resumidas, arquivadas, bytes,
       motivos (o relatório do corte), msg} ou {ok:false, erro, codigo?}.
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
      /* ⚠ O CORTE DOS MOTIVOS DA IA — A ÚNICA PORTA POR ONDE ELE PASSA.
         Medido na fase 3: 20 planos com motivo da IA em cada nó enchiam
         sozinhos os 900 KB da entidade e nenhuma linha de base cabia mais
         (100 recusas). A régua e o porquê estão no `CronoPlan.cortarMotivos`;
         aqui fica o lugar: TODO plano gravado passa por este ponto, e por
         isso o corte mora aqui e não em cada chamador. Corta o TEXTO, nunca a
         rede nem a marca de origem. O recado vai no `msg` junto com o do
         espaço (o app já mostra os dois: app.js, `_cronoGravarPlano` e
         `cronoIniciarPlano`). */
      /* ⚠ REVISÃO 4 (O31): o corte da versão NOVA (sai o `m` do `iaProv`) e as
         portas que a pessoa escolheu (`plano.iaResumo`). `opts.cronOrc` é o
         cronograma do orçamento DE ORIGEM (quem chama só o passa quando
         `orc.id === plano.orcamentoId`): é com ele que a porta (1) sabe qual
         texto está lá, e que o recado não promete "o texto segue no
         orçamento" para o que só existia aqui. */
      var ia = normalizarIaResumo(rec.iaResumo);
      if (ia) rec.iaResumo = ia; else delete rec.iaResumo;
      /* ⚠ planejador 1A: o mapa que voltou como LISTA (`rede.etapas: []`, um
         aparelho torto, a nuvem de uma versão antiga) é gravado como MAPA —
         chave com nome posta num array some no JSON do salvar seguinte (a
         memória "a forma no disco decide se sincroniza"). No próprio objeto:
         é o que a tela edita (tools/test-crono-obra-sync.js [12]). */
      normalizarCron(rec.cronograma);
      var cm = P.cortarMotivos(rec.cronograma, opcoesCorte(ia, opts.cronOrc));
      var b = bytesPlano(rec);
      if (b > TETO_PLANO) return falha(msgTetoPlano(rec, b), { codigo: "teto-plano", bytes: b });
      var r = abrirEspaco(lista, rec, rec.atualizadoEm);
      if (!r.ok) return r;
      r.plano = rec;
      r.motivos = cm;
      if (cm.msg) r.msg = r.msg ? (r.msg + " " + cm.msg) : cm.msg;
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
       ⚠ `_avancoDaObra` (planejador, Onda 0, T2; espec O25): o 3º argumento
         é o registro do AVANÇO LANÇADO da obra. A propriedade SEMPRE existe
         no clone (enumerável, como `_planoDaObra`): o registro quando ele é
         válido, `null` quando não há registro ou ele é inválido. É assim que
         o motor distingue "carregado, sem avanço" (a propriedade com null) de
         "ninguém carregou" (sem a propriedade) — e, no segundo caso, lê a
         sombra que o último salvar deixou, com aviso, em vez de mostrar o
         mesmo plano com duas datas diferentes conforme o chamador.
         Até a 1A o avanço chega sempre null (ninguém o grava ainda).
       ================================================================= */
    orcComPlano: function (orc, plano, avanco) {
      if (!ehObj(orc) || !ehPlano(plano) || !ehObj(plano.cronograma)) return null;
      var c = {}, k;
      for (k in orc) if (own(orc, k)) c[k] = orc[k];
      c.cronograma = plano.cronograma;
      c._planoDaObra = str(plano.obraId);
      /* ⚠ avanço de OUTRA obra nunca entra: o id da obra é a única amarra entre
         os dois registros, e um avanço trocado reprogramaria a obra errada */
      c._avancoDaObra = (ehAvanco(avanco) && str(avanco.obraId) === str(plano.obraId)) ? avanco : null;
      /* ⚠ REVISÃO 4 (O31): o cronograma do orçamento DE ORIGEM (só leitura,
         para o `CronoPlan.textoIA` mostrar o texto que a porta (1) deixou lá)
         e a escolha das portas. NÃO ENUMERÁVEIS de propósito: `_iaOrc` é o
         orçamento inteiro por referência, e todo `JSON.stringify` do clone (a
         cópia que a tela faz para desenhar, o canon da pilha) o carregaria
         junto. Só o do orçamento de origem — outro orçamento explicaria outra
         obra. */
      try {
        Object.defineProperty(c, "_iaOrc", { value: (str(orc.id) === str(plano.orcamentoId) && ehObj(orc.cronograma)) ? orc.cronograma : null,
          enumerable: false, configurable: true, writable: true });
        Object.defineProperty(c, "_iaResumo", { value: normalizarIaResumo(plano.iaResumo), enumerable: false, configurable: true, writable: true });
      } catch (eD) { /* sem defineProperty: sem o texto do orçamento, a tela diz "motivo não guardado" */ }
      return c;
    },

    /* =================================================================
       orcDaObra — o orçamento como a OBRA o executa, a partir do que está
       gravado: acha o PLANO e o AVANÇO da obra e chama o `orcComPlano`.
       ⚠ É A PORTA ÚNICA dos chamadores (espec §2.8): a aba (`_cronoAlvo`), o
         prazo de antes do salvar do plano, o painel previsto × realizado, a
         linha de base, o CronoPlan e o Last Planner passam por aqui. Um
         chamador que montasse o clone sozinho esqueceria o avanço, e o mesmo
         plano sairia com duas datas conforme a tela (O25).
       `fonte`:
         - a LISTA da entidade (o caso comum): o plano é `plano(lista, obraId)`;
         - `{plano, avanco}` quando quem chama JÁ tem os registros (o painel do
           CronoPlan recebe o plano pronto e não tem a lista). O plano passado
           vale como está — as conferências dele são de quem o escolheu.
       Até a 1A o avanço da LISTA é sempre null (o `avanco(lista, obraId)` é
       da 1A). Sem plano → null, como o `orcComPlano`.
       ================================================================= */
    orcDaObra: function (orc, fonte, obraId) {
      var pl = null, av = null;
      /* ⚠ O RAMO DA LISTA ACHA O AVANÇO TAMBÉM. Ele não achava (revisão
         adversarial da Onda 2, 21/09/2026), e o buraco não aparecia em
         nenhuma suíte porque o `orcComPlano` SEMPRE cria a propriedade — com
         `null`, que o motor lê como "carregado, SEM avanço". Ou seja: a rede
         de proteção da O25 ("ninguém carregou" → lê a sombra, com aviso)
         nunca disparava, e o avanço sumia calado.
         O roteiro, medido na obra do galpão (18 tarefas com avanço):
           forma LISTA  → estimar = 75 dias úteis, fim 13/11/2026
           forma OBJETO → estimar = 82 dias úteis, fim 25/11/2026
         Sete dias de diferença conforme QUEM chamou. Quem passava lista:
         o painel previsto × realizado da ficha da obra, a linha de base
         congelada (que nascia sem o avanço), o início da obra, o diálogo de
         limpar o avanço, a porta [Atualizar as datas…] e o Last Planner —
         três telas mostrando términos diferentes para a mesma obra. */
      if (ehLista(fonte)) { pl = this.plano(fonte, obraId); av = this.avanco(fonte, obraId); }
      else if (ehObj(fonte)) { pl = fonte.plano || null; av = fonte.avanco || null; }
      return this.orcComPlano(orc, pl, av);
    }
  };

  global.CronoBase = CronoBase;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoBase;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * store.js — Camada de persistência com adapter trocável
 * Hoje: localStorage namespaced + migração versionada + autosave idempotente.
 * Amanhã (SaaS): basta implementar o mesmo contrato em FirebaseAdapter.
 * Namespace: orcapro:<empresaId>:<entidade>
 * ===================================================================== */
(function (global) {
  "use strict";

  var NS = "orcapro";

  function chave(empresaId, entidade) {
    return NS + ":" + (empresaId || "default") + ":" + entidade;
  }

  /* =====================================================================
   * ⚠ LEITURA QUE FALHA NÃO É LISTA VAZIA — QUARENTENA E RECUSA
   *
   * O DEFEITO (auditoria do Cronograma 1.2.80, item D7, 16/09/2026): `ler`
   * devolvia o `fallback` quando o JSON do disco não abria, e
   * `listarOrcamentos` usa `[]` de fallback. Como TODA gravação desta camada
   * reescreve a lista inteira, o `salvarOrcamento` seguinte — de qualquer
   * orçamento — gravava uma lista com UM orçamento, e os outros sumiam do
   * disco para sempre. Roteiro medido na bancada
   * (tools/test-store-corrompido.js, bloco [0]): 3 orçamentos no disco, a
   * string perde o último caractere, a tela mostra "Nenhum orçamento ainda",
   * a pessoa cria um → disco com 1. O mesmo buraco existia nas entidades da
   * Gestão (`salvar`, `excluir`, `salvarVarios`), nas lápides e no merge da
   * nuvem, que grava por `adapter.gravar`.
   *
   * A REGRA: conteúdo que não abriu não é apagado por ninguém.
   *  1) na leitura, a string original é COPIADA para
   *     `orcapro:<empresa>:<entidade>:corrompido:<quando>` (uma cópia por
   *     conteúdo, ver `_quarentenar`) e a entidade fica marcada;
   *  2) enquanto a marca existir, `gravar` RECUSA a entidade (devolve false):
   *     quem leu `[]` não pode gravar por cima do que não conseguiu ler;
   *  3) a tela continua funcionando (a leitura devolve o fallback, como
   *     sempre — travar a interface seria pior) e avisa. A saída é `liberar`,
   *     chamada pela restauração do backup e pelo aviso da lista, e ela só
   *     remove o original DEPOIS de conferir a cópia caractere a caractere.
   *
   * ⚠ A MARCA MORA EM MEMÓRIA E É REFEITA A CADA LEITURA. Toda reescrita desta
   *   camada lê e grava na mesma pilha, sem nada assíncrono no meio, então a
   *   marca que o `gravar` consulta é a da leitura que montou a lista. Uma
   *   leitura que volta a abrir (outra janela restaurou o backup) apaga a marca.
   *
   * ⚠ OBJETO ÚNICO (prefs, conta, _syncmarcas) NÃO TRAVA DEPOIS DA CÓPIA.
   *   Ali não existem "os outros registros" a proteger: o objeto inteiro já
   *   não abria. Travar `conta` impediria recriar o administrador e deixaria
   *   a pessoa sem entrar no sistema, uma trava sem porta. Com a cópia
   *   conferida, a gravação passa (e a nuvem pode devolver a versão boa). Sem
   *   cópia (armazenamento cheio), trava como as listas: o original é a
   *   única cópia que existe.
   * ===================================================================== */
  var SUFIXO_QUAR = ":corrompido:";
  var OBJETO_UNICO = { prefs: 1, conta: 1, _syncmarcas: 1 };
  var _ilegivel = {};        // chave -> marca (com a string original, só em memória)
  var _avisoIlegivelEm = {}; // chave -> ms do último recado na tela
  var _lidas = {};           // chave -> 1: já passou por `ler` nesta sessão
  var _avisoGravar = {};     // "empresa:entidade:tipo" -> 1: o recado de gravação recusada já saiu nesta sessão

  /* vazio de verdade: nada a proteger. "undefined" é o que o localStorage
     guarda de `setItem(k, JSON.stringify(undefined))` — não é dado de
     ninguém, e tratá-lo como corrompido travaria a entidade à toa.
     ⚠ SÓ EM TEXTO CURTO: esta regex retrocede em tempo quadrático num texto
     longo de espaços (medido: 3 MB de espaços prendeu o Node por minutos), e
     `ler` roda em toda leitura. Conteúdo vazio de verdade é sempre curto. */
  function _vazio(raw) { return raw == null || (raw.length <= 64 && /^\s*(undefined)?\s*$/.test(raw)); }

  /* `forma === "lista"`: JSON válido que NÃO é lista (nem null) também é
     conteúdo que a tela não sabe ler — `Util.arr` o transformaria em `[]` e a
     gravação seguinte o apagaria do mesmo jeito. */
  function _abre(raw, forma) {
    var v = JSON.parse(raw);   // lança se o texto não abre
    if (forma === "lista" && v !== null && !Array.isArray(v)) throw new Error("o conteúdo não é uma lista (" + typeof v + ")");
    return v;
  }

  /* cópia já existente com o MESMO conteúdo: a mesma string lida mil vezes
     (cada render lê a lista) não pode virar mil cópias */
  function _copiaExistente(k, raw) {
    var pre = k + SUFIXO_QUAR;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var q = localStorage.key(i);
        if (!q || q.indexOf(pre) !== 0) continue;
        var v = localStorage.getItem(q);
        if (v != null && v.length === raw.length && v === raw) return q;
      }
    } catch (e) {}
    return null;
  }

  function _quarentenar(k, raw) {
    var ja = _copiaExistente(k, raw);
    if (ja) return { chave: ja, ok: true };
    var base = k + SUFIXO_QUAR + new Date().toISOString().replace(/[:.]/g, "-"), nome = base, s = 2;
    try {
      while (localStorage.getItem(nome) != null && s < 50) nome = base + "-" + (s++);
      localStorage.setItem(nome, raw);
      /* ⚠ confere o que ficou: cópia que não confere não é cópia, e é a
         conferência que autoriza o `liberar` a remover o original */
      if (localStorage.getItem(nome) === raw) return { chave: nome, ok: true };
      try { localStorage.removeItem(nome); } catch (eR) {}
      return { chave: null, ok: false, erro: "a cópia gravada não confere com o original" };
    } catch (e) {
      return { chave: null, ok: false, erro: String((e && (e.name || e.message)) || e) };
    }
  }

  /* quando a leitura falhou PELA PRIMEIRA VEZ: vem do nome da cópia, que
     sobrevive a fechar o app (a memória não). É a data que o recado usa para
     dizer QUAL backup restaurar — "o mais recente" pode ser um arquivo feito
     depois de a pessoa recomeçar a lista. Todo backup automático anterior a
     ela foi feito com a lista legível (depois, ele fica suspenso). */
  function _desdeDaCopia(q) {
    var p = q ? String(q).lastIndexOf(SUFIXO_QUAR) : -1;
    if (p < 0) return "";
    var mm = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(String(q).slice(p + SUFIXO_QUAR.length));
    return mm ? mm[1] + "T" + mm[2] + ":" + mm[3] + ":" + mm[4] + "." + mm[5] + "Z" : "";
  }

  function _marcarIlegivel(empresaId, entidade, k, raw, erro) {
    var m = _ilegivel[k], agora = Date.now();
    /* mesmo conteúdo já tratado: não refaz a cópia a cada leitura. Sem cópia
       (cota cheia), tenta de novo a cada 30 s, e não a cada render. */
    if (m && m.raw === raw && (m.copiaOk || agora - m.tentouEm < 30000)) return m;
    var q = _quarentenar(k, raw);
    m = {
      empresaId: String(empresaId || "default"), entidade: String(entidade), chave: k, raw: raw, bytes: raw.length,
      quarentena: q.chave || "", copiaOk: !!q.ok, erroCopia: q.erro || "",
      em: (m && m.raw === raw && m.em) || new Date().toISOString(), tentouEm: agora,
      erro: String((erro && erro.message) || erro || "")
    };
    m.desde = _desdeDaCopia(m.quarentena) || m.em;
    m.bloqueia = !(OBJETO_UNICO[entidade] && m.copiaOk);
    _ilegivel[k] = m;
    /* o registro técnico: uma linha por conteúdo, não por leitura */
    try {
      console.error("[store] \"" + entidade + "\" ILEGÍVEL no disco (" + raw.length + " caracteres): " + m.erro +
        " — cópia " + (m.copiaOk ? "em " + m.quarentena : "NÃO gravada (" + m.erroCopia + ")") +
        "; gravações " + (m.bloqueia ? "RECUSADAS" : "liberadas (objeto único)") + " até a leitura voltar a abrir.");
    } catch (eL) {}
    return m;
  }

  function _publico(m) {
    return { entidade: m.entidade, empresaId: m.empresaId, bytes: m.bytes, quarentena: m.quarentena,
             copiaOk: m.copiaOk, bloqueia: m.bloqueia, em: m.em, desde: m.desde, erro: m.erro };
  }

  /* recado de uma gravação recusada, no máximo um a cada 20 s por entidade:
     o merge da nuvem e as lápides batem aqui em rajada */
  function _avisarIlegivel(m) {
    var agora = Date.now();
    if (_avisoIlegivelEm[m.chave] && agora - _avisoIlegivelEm[m.chave] < 20000) return;
    _avisoIlegivelEm[m.chave] = agora;
    try {
      if (global.UI && global.UI.toast) {
        var adm = true;
        try { adm = !(global.Auth && global.Auth.ehAdmin && !global.Auth.ehAdmin()); } catch (eA) { adm = true; }
        var txt = global.Store.recadoIlegivel(_publico(m), { recusou: true, admin: adm });
        global.UI.toast(txt, "erro", Math.max(8000, Math.min(20000, txt.length * 65)));
      }
    } catch (e) {}
  }

  /* a forma de leitura de cada entidade (ver `_abre`).
     ⚠ MORA AQUI, NO ADAPTER, E VALE PARA QUEM NÃO PASSA FORMA. Roteiro do
     defeito (revisão adversarial da 1.2.81, sonda no navegador): com
     `orcamentos = {"a":…}`, o `listarOrcamentos` (forma "lista") marcava a
     entidade; o `Store.lerParaSync` (sem forma) lia o MESMO objeto como
     válido, APAGAVA a marca e devolvia `[]`; em seguida `adapter.gravar`
     passava e o disco era sobrescrito. O `ilegivelLocal` da nuvem, que
     consulta a marca depois dessa leitura, dizia "legível" — a guarda do
     sync ficava inerte. Todos os leitores têm de concordar sobre o que é
     ilegível.
     ⚠ O PLANEJAMENTO DA OBRA ENTRA NA MESMA REGRA (Onda 0 do planejador, T17;
     crítica 1, achado 14). `crono_obra` guarda plano, linhas de base e o
     avanço lançado; `crono_selo` e `crono_alt` são as entidades novas da
     leva. As três são LISTA no disco (memória "a forma no disco decide se
     sincroniza"). Sem a linha, um `{...}` válido no disco era lido como
     válido por quem não passa forma, o `Util.arr` o transformava em `[]` e
     o sync gravava e SUBIA o vazio por cima do planejamento das obras — o
     mesmo roteiro dos orçamentos acima. Com a linha, o objeto vai para a
     quarentena e a entidade fica parada até alguém restaurar.
     Prova: tools/test-nuvem-push-falha.js (bloco FORMA; CN: sem a linha, o
     `[]` sobe). */
  /* ⚠ ENTIDADE QUE ENTRA NO SYNC ENTRA AQUI NO MESMO COMMIT — quarentena
     primeiro, sync depois. Roteiro do defeito (revisão adversarial da mc-6A,
     medido no js/store.js real sobre um localStorage de mentira): `cc_aprop`
     com um OBJETO no disco devolvia `[]` em `lerParaSync`, NÃO marcava a
     quarentena, e o `Store.salvar` seguinte PASSAVA e sobrescrevia o disco —
     as decisões da pessoa sumiam sem cópia e sem aviso. Com a entidade já em
     `Nuvem.ENTIDADES`, esse `[]` ainda subia para a nuvem e o merge o
     empurrava para todos os aparelhos. É textualmente o defeito do
     `precosinsumos` que o comentário de `lerParaSync` registra mais abaixo.
     ⚠ `centrocusto` já sincronizava sem forma declarada desde a v1.1.231 — o
     mesmo buraco, aberto há mais tempo. Entra junto: ela sempre foi gravada
     como lista, então declarar a forma não muda nada para quem está são e
     põe de quarentena quem está corrompido, em vez de apagar.
     ⚠ FUSÃO DA ONDA 5 (21/09/2026): as duas listas são UMA SÓ. Ficar com a
     de um lado apagaria a quarentena do outro — e entidade fora daqui é o
     buraco que os dois comentários acima descrevem. */
  var FORMA_PADRAO = { orcamentos: "lista", crono_obra: "lista", crono_selo: "lista", crono_alt: "lista", centrocusto: "lista", cc_regras: "lista", cc_aprop: "lista",
    /* Documentos da obra: entram no sync no mesmo commit (regra acima) */
    obra_docs: "lista", doc_assinantes: "lista" };

  /* =====================================================================
   * ⚠ OS DADOS MORAM NO INDEXEDDB; O localStorage FICA SÓ COM O PEQUENO
   *   (10/10/2026)
   *
   * O DEFEITO (relato do dono, celular, PWA): "a memória de armazenamento
   *   está esgotada", em vermelho, toda hora. O localStorage tem teto de
   *   ~5,24 M caracteres POR ORIGEM, e os dados da empresa dele somavam
   *   ~5,96 M (pontos de vista do BIM, orçamentos, composições próprias,
   *   modelos de proposta, diário…). O celular baixa tudo da nuvem e CADA
   *   gravação estourava a cota: a alteração não era salva e o toast
   *   vermelho de armazenamento cheio voltava a cada tentativa.
   *
   * A CORREÇÃO: as entidades de DADO (as que crescem com o uso — a lista
   *   ENT_IDB abaixo) moram no IndexedDB, que não tem esse teto. Os callers
   *   continuam síncronos porque esta camada mantém um ESPELHO EM MEMÓRIA.
   *
   * ⚠ O ESPELHO GUARDA O TEXTO CRU (a mesma string que ia para o
   *   localStorage), NUNCA o objeto. Cada leitura faz JSON.parse, como
   *   sempre fez. Guardar o objeto devolveria a MESMA referência a todos os
   *   leitores: o orçamento aberto na tela seria o próprio objeto do
   *   espelho, a trava de carimbo (`salvarOrcamento`) compararia o objeto
   *   com ele mesmo e passaria sempre, e uma edição não salva apareceria
   *   "gravada" na gravação seguinte de outro orçamento. Com o texto, a
   *   quarentena (`_vazio`, `_abre`), a compactação das vistas e a saúde
   *   funcionam sem mudar uma linha.
   *
   * AS QUATRO REGRAS QUE NÃO SE NEGOCIAM (dado de cliente):
   *  1) LER ANTES DE GRAVAR. Entidade que JÁ mora no banco e ainda não foi
   *     carregada nesta aba está TRANCADA: a leitura devolve vazio (a tela
   *     não trava) e a gravação é RECUSADA e logada. Ler vazio e gravar por
   *     cima apagaria o dado — e a nuvem levaria o vazio para os outros
   *     aparelhos. O App só começa depois de `Store.pronto()`.
   *  2) MIGRAÇÃO COM PROVA: lê do localStorage → grava no banco → LÊ DE
   *     VOLTA e compara caractere a caractere → confere que o localStorage
   *     não mudou no meio → só então marca e remove. Falhou em qualquer
   *     passo: fica onde estava. Conteúdo ilegível NÃO migra (a quarentena
   *     de sempre cuida dele no localStorage).
   *  3) SEM IndexedDB (aba anônima, navegador bloqueando): tudo continua no
   *     localStorage, como antes. Entidade que JÁ mudou para o banco e o
   *     banco não abre fica trancada (regra 1) — nunca vira lista vazia.
   *  4) ENTRE ABAS: cada gravação leva uma VERSÃO (relógio + sequência +
   *     aba) e é avisada às outras abas (BroadcastChannel). O banco só
   *     aceita versão mais nova; o espelho também. A aba que recebe dispara
   *     o evento `storage` de sempre, que é o que o App já escuta para
   *     reler (js/app.js `_relerOuvir`).
   *
   * ⚠ A MARCA DE CASA: `orcapro:<empresa>:_idb` (no localStorage, pequena)
   *   diz quais entidades daquela empresa moram no banco. Ela nasce na
   *   migração ou na PRIMEIRA gravação depois do `pronto()` — e não antes:
   *   entidade que nunca foi gravada continua lendo o localStorage, então
   *   quem semeia o localStorage antes do boot (suítes, socorro) ainda é
   *   migrado. Sem a marca não há como saber, SÍNCRONO, que a leitura vazia
   *   é "ainda não carregou" e não "não existe".
   *
   * ⚠ A SOBRA: valor que aparece no localStorage para uma entidade que já
   *   mora no banco. Quem escreve ali é uma aba de VERSÃO ANTIGA ainda
   *   aberta (ela lê o localStorage vazio e grava por cima) ou uma
   *   ferramenta. Ela NUNCA substitui o banco (substituir apagaria tudo o
   *   que a aba antiga não via): a cópia vai inteira para o banco como
   *   `<chave>:sobra:<quando>`, conferida, e só depois sai do localStorage; e
   *   se for lista legível, ENTRA pelo mesmo merge da nuvem (união por id, o
   *   mais novo vence, lápides respeitadas) — que é exatamente o que
   *   aconteceria se ela tivesse chegado de outro aparelho.
   *
   * Rollback: `CONFIG.dadosIdb = false` (frota) ou
   *   `localStorage["orcapro:dados:so-local"] = "1"` (instalação) param de
   *   MIGRAR e de mandar entidade nova para o banco. O que já está no banco
   *   continua sendo lido de lá — não há volta automática, porque o motivo
   *   da mudança é justamente que não cabe no localStorage.
   * Prova: tools/test-store-idb.js (unidade) e tools/e2e-armazenamento-idb.js.
   * ===================================================================== */
  /* As entidades que crescem com o uso. Ficam no localStorage: `prefs`,
     `conta`, `equipe` e `usuarios` — pequenas, e lidas pelo login (o
     js/auth.js varre `orcapro:*:conta` direto no localStorage). Lista
     PRÓPRIA (e não `Nuvem.ENTIDADES`): a rota não pode depender da ordem
     de carga dos scripts. tools/test-store-idb.js reprova se uma entidade
     nova da nuvem ficar de fora daqui. */
  var ENT_IDB = (function () {
    var o = {};
    ["orcamentos", "obras", "clientes", "contratos", "medicoes", "aditivos", "financeiro", "compras", "estoque", "rdo",
     "colaboradores", "frota", "requisicoes", "epi", "faltas", "templates", "documentos", "pesos_bloco", "epi_catalogo",
     "fiscal", "patrimonio", "estoque_mov", "prop_modelos", "producao_med", "producao_preco", "composicoes_proprias",
     "bim_niveis", "tour360", "bim_modelos", "bim_conjuntos", "bim_vistas", "bim_familias", "bim_estrut", "bim_sondagens",
     "bim_pranchas", "obra_docs", "doc_assinantes", "bim_pesos_esp", "bim_icamento", "bim_materiais", "bim_clash_testes",
     "bim_clash_resultados", "bim_orc_vinculos", "bim_tarefas", "bim_4d_aparencias", "atividades", "horas_extras", "batidas",
     "fornecedores", "familias", "centrocusto", "cc_regras", "cc_aprop", "cotacoes", "lp_tarefas", "tarefas", "bim_edicoes",
     "crono_obra", "crono_selo", "folha", "fs_lancamentos", "fs_pagamentos", "ponto", "frota_mov", "carp_param",
     "carp_madeiras", "carp_mo", "carp_propostas", "carp_parceiros", "marm_precos", "marm_propostas", "remun_param", "remun_apur", "portal_padrao",
     "precosinsumos", "perfil_impl", "crono_alt", "_lapides", "_syncmarcas"].forEach(function (e) { o[e] = 1; });
    return o;
  })();
  var DB_DADOS = "orcapro-dados", DB_DADOS_VER = 1, ST_ENT = "ent", ST_VER = "ver";
  var CASA = "_idb";
  var SUFIXO_SOBRA = ":sobra:";
  var CHAVE_SO_LOCAL = "orcapro:dados:so-local";
  var CHAVE_PING = "orcapro:dados:ping";
  /* o boot não espera mais que isto: com o banco travado (outra aba segurando
     uma versão antiga), o app abre com as entidades do banco TRANCADAS — e
     destranca sozinho quando o banco responder */
  var TETO_PRONTO_MS = 15000;
  /* ⚠ empresa SEM ":" — os ids reais são `emp_…`, `demo`, `local`, `default`
     (o de prévia, `prev:…`, fica fora do banco de propósito). Com `(.+)` a
     varredura leria `orcapro:nuvem:grande:orcamentos` (a marca do aviso de
     tamanho) como a entidade "orcamentos" da empresa "nuvem:grande". */
  var RE_CHAVE_ENT = /^orcapro:([^:]+):([a-z0-9_]+)$/;

  function _temProp(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function _pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  var _d = {
    db: null,          // conexão aberta
    ok: null,          // null = ainda não sabe; true = banco aberto e lido; false = sem banco nesta sessão
    completo: false,   // o `pronto()` terminou (com ou sem banco)
    promessa: null,
    esp: {},           // chave -> { raw: string|null, ver: string } — o espelho
    carregada: {},     // chave -> 1: o espelho desta chave está em dia
    casa: {},          // empresa -> { entidade: quando } (o disco UNIDO ao que esta aba soube)
    casaLida: {},      // empresa -> 1
    fila: {},          // chave -> { voo, pend }: uma gravação por vez por chave
    pendentes: {},     // chave -> entidade: está só no espelho (o banco recusou ou não abriu)
    trancadas: {},     // chave -> { entidade, empresaId, em }
    avisoTrancada: 0, falhaAvisada: {}, retentar: {},
    sobraEmCurso: {}, sobras: [], migradas: [], falhas: [],
    tab: (Math.random().toString(36) + "00000000").slice(2, 10),
    bc: null, despachando: false, mesclando: false, ouvindo: false, fechadoPorVersao: false
  };

  function _migracaoLigada() {
    try { if (global.CONFIG && global.CONFIG.dadosIdb === false) return false; } catch (e) {}
    try { if (localStorage.getItem(CHAVE_SO_LOCAL) === "1") return false; } catch (e2) {}
    return true;
  }
  function _naIdb(empresaId, entidade) {
    /* a prévia de cliente (js/previewcli.js) vive num namespace `prev:` que
       ela mesma varre e apaga no localStorage: fica fora do banco */
    return _temProp(ENT_IDB, entidade) && String(empresaId || "default").indexOf("prev:") !== 0;
  }
  function _casa(empresaId, fresco) {
    var e = String(empresaId || "default"), c = _d.casa[e] || (_d.casa[e] = {});
    if (fresco || !_d.casaLida[e]) {
      _d.casaLida[e] = 1;
      try {
        var raw = localStorage.getItem(chave(e, CASA)), o = raw ? JSON.parse(raw) : null;
        /* UNIÃO, nunca troca: a marca só nasce, e a desta aba pode ter vindo
           pelo aviso de outra aba antes de o localStorage dela chegar aqui */
        if (o && typeof o === "object") for (var k in o) if (_temProp(o, k) && o[k] && !c[k]) c[k] = String(o[k]);
      } catch (eC) {}
    }
    return c;
  }
  function _casaMarcar(empresaId, entidade) {
    var e = String(empresaId || "default"), c = _casa(e, true);
    if (!c[entidade]) c[entidade] = new Date().toISOString();
    try { localStorage.setItem(chave(e, CASA), JSON.stringify(c)); return true; }
    catch (eM) { return false; }   // cota cheia: a memória vale; o próximo boot adota pelo banco (`_adotarOrfaos`)
  }
  /* "ls" | "idb" | "nova" (primeira gravação: vai para o banco) | "trancada" */
  function _rota(empresaId, entidade, k, gravar) {
    if (!_naIdb(empresaId, entidade)) return "ls";
    var c = _casa(empresaId, !!gravar);
    if (c[entidade]) {
      if (_d.ok === false) return "trancada";
      return (_d.carregada[k] || (_d.completo && _d.ok === true)) ? "idb" : "trancada";
    }
    if (gravar && _d.completo && _d.ok === true && _d.db && _migracaoLigada()) {
      var temLs = true;
      try { temLs = localStorage.getItem(k) != null; } catch (eL) { temLs = true; }
      if (!temLs) return "nova";
    }
    return "ls";
  }
  function _rawDe(empresaId, entidade, k) {
    var r = _rota(empresaId, entidade, k, false);
    if (r === "trancada") throw new Error("os dados deste aparelho ainda não carregaram");
    if (r === "idb") { var e = _d.esp[k]; return e ? e.raw : null; }
    return localStorage.getItem(k);
  }

  function _novaVer(k) {
    var ms = Date.now(), seq = 0, cur = _d.esp[k];
    if (cur && cur.ver) {
      var p = String(cur.ver).split("."), cms = parseInt(p[0], 10) || 0;
      if (cms >= ms) { ms = cms; seq = (parseInt(p[1], 10) || 0) + 1; }
    }
    return _pad(ms, 15) + "." + _pad(seq, 6) + "." + _d.tab;
  }

  function _avisarTrancada(empresaId, entidade, k, gravacao) {
    var ja = _d.trancadas[k];
    _d.trancadas[k] = { entidade: entidade, empresaId: String(empresaId || "default"), em: (ja && ja.em) || new Date().toISOString() };
    if (!ja || gravacao) {
      try { console.error("[store] \"" + entidade + "\" " + (gravacao ? "GRAVAÇÃO RECUSADA" : "lida vazia") + ": ela mora no banco do aparelho (IndexedDB) e " + (_d.ok === false ? "o banco não abriu nesta sessão" : "ainda não foi carregada") + " — gravar agora apagaria o que está lá."); } catch (eL) {}
    }
    if (gravacao && Date.now() - _d.avisoTrancada > 20000) {
      _d.avisoTrancada = Date.now();
      try {
        if (global.UI && global.UI.toast) global.UI.toast(_d.ok === false
          ? "⚠ O navegador não abriu o banco de dados deste aparelho, onde estão os seus dados — a última alteração NÃO foi gravada. Feche TODAS as janelas do OrçaPRO e abra de novo. Nada foi apagado."
          : "⚠ Os dados deste aparelho ainda estão carregando — a última alteração NÃO foi gravada. Espere alguns segundos e repita. Nada foi apagado.", "erro", 12000);
      } catch (eT) {}
    }
  }
  function _falhaPersistir(k, entidade, err) {
    _d.pendentes[k] = entidade;
    try { console.error("[store] \"" + entidade + "\" NÃO chegou ao banco do aparelho:", (err && (err.name || err.message)) || err); } catch (eL) {}
    if (!_d.falhaAvisada[entidade]) {
      _d.falhaAvisada[entidade] = 1;
      try {
        var nome = (global.Store && global.Store.nomeEntidade) ? global.Store.nomeEntidade(entidade) : entidade;
        if (global.UI && global.UI.toast) global.UI.toast(_d.fechadoPorVersao
          ? "⚠ Esta janela do OrçaPRO ficou desatualizada (outra abriu uma versão nova): a alteração em \"" + nome + "\" vale só até fechá-la. Feche esta janela e continue na outra."
          : "⚠ Não consegui gravar \"" + nome + "\" no banco deste aparelho — a alteração vale só até fechar o app. Faça 💾 Backup agora.", "erro", 14000);
      } catch (eT) {}
    }
    if (!_d.retentar[k] && typeof setTimeout === "function") {
      _d.retentar[k] = 1;
      setTimeout(function () { _d.retentar[k] = 0; if (_d.pendentes[k] && _d.db) _persistir(k, entidade); }, 5000);
    }
  }

  /* ---- o banco (IndexedDB cru: get+put na MESMA transação, que o js/idb.js não faz) ---- */
  function _abrir() {
    return new Promise(function (res, rej) {
      var rq;
      try { rq = global.indexedDB.open(DB_DADOS, DB_DADOS_VER); } catch (e) { rej(e); return; }
      rq.onupgradeneeded = function () {
        var db = rq.result;
        if (!db.objectStoreNames.contains(ST_ENT)) db.createObjectStore(ST_ENT);
        if (!db.objectStoreNames.contains(ST_VER)) db.createObjectStore(ST_VER);
      };
      rq.onsuccess = function () {
        var db = rq.result;
        /* uma versão nova do banco noutra aba: solta a conexão para não
           travá-la. Esta aba continua LENDO o espelho; o que gravar daqui em
           diante fica pendente e avisa (ver `_falhaPersistir`). */
        try { db.onversionchange = function () { try { db.close(); } catch (eC) {} _d.db = null; _d.fechadoPorVersao = true; }; } catch (eV) {}
        res(db);
      };
      rq.onerror = function () { rej(rq.error || new Error("o banco do aparelho não abriu")); };
      rq.onblocked = function () { /* espera; o teto do pronto() protege o boot */ };
    });
  }
  function _tx(lojas, modo) { return _d.db.transaction(lojas, modo); }
  /* grava (raw null = apaga) se a versão do banco não for MAIS NOVA — a não
     ser que `forcar` (a migração: o localStorage é quem manda ali) */
  function _txGravar(k, raw, ver, forcar) {
    return new Promise(function (res, rej) {
      var tx, pulou = false;
      try { tx = _tx([ST_ENT, ST_VER], "readwrite"); } catch (e) { rej(e); return; }
      tx.oncomplete = function () { res({ pulou: pulou }); };
      tx.onerror = function () { rej(tx.error || new Error("a transação falhou")); };
      tx.onabort = function () { rej(tx.error || new Error("a transação foi abortada")); };
      try {
        var sE = tx.objectStore(ST_ENT), sV = tx.objectStore(ST_VER), rq = sV.get(k);
        rq.onsuccess = function () {
          var cur = rq.result;
          if (!forcar && typeof cur === "string" && cur > ver) { pulou = true; return; }
          if (raw == null) sE["delete"](k); else sE.put({ raw: raw, ver: ver }, k);
          sV.put(ver, k);
        };
      } catch (e2) { try { tx.abort(); } catch (eA) {} rej(e2); }
    });
  }
  function _txLer(k) {
    return new Promise(function (res, rej) {
      var tx;
      try { tx = _tx([ST_ENT], "readonly"); } catch (e) { rej(e); return; }
      try {
        var rq = tx.objectStore(ST_ENT).get(k);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error || new Error("a leitura falhou")); };
      } catch (e2) { rej(e2); }
    });
  }
  /* apaga a cópia da migração que não se provou — só se ainda for a NOSSA */
  function _txApagarSe(k, ver) {
    return new Promise(function (res, rej) {
      var tx;
      try { tx = _tx([ST_ENT, ST_VER], "readwrite"); } catch (e) { rej(e); return; }
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
      tx.onabort = function () { rej(tx.error); };
      try {
        var sE = tx.objectStore(ST_ENT), sV = tx.objectStore(ST_VER), rq = sV.get(k);
        rq.onsuccess = function () { if (rq.result === ver) { sE["delete"](k); sV["delete"](k); } };
      } catch (e2) { rej(e2); }
    });
  }
  /* percorre uma loja inteira (cursor: vale em todo navegador) */
  function _txVarrer(loja, cada) {
    return new Promise(function (res, rej) {
      var tx;
      try { tx = _tx([loja], "readonly"); } catch (e) { rej(e); return; }
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error || new Error("a leitura do banco falhou")); };
      tx.onabort = function () { rej(tx.error || new Error("a leitura do banco foi abortada")); };
      try {
        var rq = tx.objectStore(loja).openCursor();
        rq.onsuccess = function () { var c = rq.result; if (!c) return; cada(String(c.key), c.value); c["continue"](); };
      } catch (e2) { rej(e2); }
    });
  }
  function _aplicar(k, raw, ver) {
    var cur = _d.esp[k];
    if (cur && cur.ver && !(String(ver) > String(cur.ver))) return false;
    _d.esp[k] = { raw: raw == null ? null : String(raw), ver: String(ver) };
    _d.carregada[k] = 1;
    delete _d.trancadas[k];
    return true;
  }

  /* uma gravação por vez por chave; a que chega durante o voo vira "pend" */
  function _persistir(k, entidade) {
    var f = _d.fila[k] || (_d.fila[k] = { voo: false, pend: false });
    if (f.voo) { f.pend = true; return; }
    var alvo = _d.esp[k];
    if (!alvo) return;
    if (!_d.db) { _falhaPersistir(k, entidade, new Error(_d.fechadoPorVersao ? "conexão fechada por versão nova" : "banco fechado")); return; }
    f.voo = true; f.pend = false;
    _txGravar(k, alvo.raw, alvo.ver, false).then(function () {
      f.voo = false;
      if (f.pend) _persistir(k, entidade);   // gravou de novo durante o voo: manda a mais nova
      else delete _d.pendentes[k];
    }, function (err) {
      f.voo = false; f.pend = false;
      _falhaPersistir(k, entidade, err);     // fica pendente; tenta de novo em 5 s com o que estiver no espelho
    });
  }
  function _discoGravar(k, raw, empresaId, entidade) {
    var ver = _novaVer(k);
    _d.esp[k] = { raw: raw == null ? null : String(raw), ver: ver };
    _d.carregada[k] = 1;
    delete _d.trancadas[k];
    _d.pendentes[k] = entidade;
    _bcPostar({ t: raw == null ? "x" : "g", k: k, e: String(empresaId || "default"), n: entidade, raw: raw == null ? null : String(raw), ver: ver });
    _persistir(k, entidade);
  }

  /* ---- entre abas ---- */
  function _bcAbrir() {
    if (_d.bc !== null) return;
    _d.bc = false;
    try {
      if (typeof global.BroadcastChannel === "function") {
        _d.bc = new global.BroadcastChannel("orcapro-dados");
        _d.bc.onmessage = function (ev) { try { _bcReceber(ev && ev.data); } catch (e) {} };
      }
    } catch (e) { _d.bc = false; }
  }
  function _bcPostar(m) {
    if (_d.bc) { try { _d.bc.postMessage(m); return; } catch (e) {} }
    /* navegador sem BroadcastChannel: um aviso pequeno pelo localStorage; a
       outra aba busca o conteúdo no banco */
    try { localStorage.setItem(CHAVE_PING, JSON.stringify({ k: m.k, e: m.e, n: m.n, ver: m.ver, t: m.t })); } catch (e2) {}
  }
  function _bcReceber(m) {
    if (!m || typeof m.k !== "string" || typeof m.ver !== "string") return;
    if (m.e && m.n) { var c = _casa(m.e, false); if (!c[m.n]) c[m.n] = new Date().toISOString(); }
    /* versão mais nova de outra aba: ela é quem a leva ao banco (e o que
       esta aba tinha pendente para a mesma chave ficou para trás) */
    if (_aplicar(m.k, m.t === "x" ? null : m.raw, m.ver)) { delete _d.pendentes[m.k]; _avisarJanela(m.k); }
  }
  /* o evento `storage` de sempre, para o App reler (js/app.js `_relerOuvir`) */
  function _avisarJanela(k) {
    try {
      if (typeof global.dispatchEvent !== "function") return;
      var ev = null;
      try { ev = new global.StorageEvent("storage", { key: k }); }
      catch (e1) { try { ev = global.document.createEvent("Event"); ev.initEvent("storage", false, false); ev.key = k; } catch (e2) { ev = null; } }
      if (!ev) return;
      _d.despachando = true;
      try { global.dispatchEvent(ev); } finally { _d.despachando = false; }
    } catch (e) {}
  }
  function _buscarNoBanco(k, verMin, tentativas) {
    if (!_d.db) return;
    _txLer(k).then(function (rec) {
      if (rec && typeof rec.raw === "string" && String(rec.ver) >= String(verMin)) { if (_aplicar(k, rec.raw, rec.ver)) _avisarJanela(k); return; }
      if (!rec && verMin) { /* apagado lá */ if (_aplicar(k, null, verMin)) _avisarJanela(k); return; }
      if (tentativas > 0) setTimeout(function () { _buscarNoBanco(k, verMin, tentativas - 1); }, 250);
    }, function () {});
  }
  /* janela que volta do segundo plano confere as versões (o aviso pode ter
     se perdido com a aba congelada) — só a loja de versões, que é pequena */
  function _conferirVersoes() {
    if (!_d.db || _d.ok !== true) return;
    var mudou = [];
    _txVarrer(ST_VER, function (k, ver) {
      var cur = _d.esp[k];
      if (typeof ver === "string" && (!cur || String(ver) > String(cur.ver))) mudou.push({ k: k, ver: ver });
    }).then(function () { mudou.forEach(function (x) { _buscarNoBanco(x.k, x.ver, 0); }); }, function () {});
  }
  function _ouvirJanelas() {
    if (_d.ouvindo || typeof global.addEventListener !== "function") return;
    _d.ouvindo = true;
    global.addEventListener("storage", function (ev) {
      if (_d.despachando || !ev || typeof ev.key !== "string") return;
      var k = ev.key;
      if (k === CHAVE_PING) {
        try { var p = JSON.parse(ev.newValue || "null"); if (p && p.k) { if (p.e && p.n) { var cp = _casa(p.e, false); if (!cp[p.n]) cp[p.n] = new Date().toISOString(); } _buscarNoBanco(p.k, p.ver, 8); } } catch (eP) {}
        return;
      }
      var m = RE_CHAVE_ENT.exec(k);
      if (!m) return;
      if (m[2] === CASA) { _d.casaLida[m[1]] = 0; return; }
      /* aba de versão ANTIGA gravou no localStorage o que mora no banco */
      if (ev.newValue != null && _naIdb(m[1], m[2]) && _casa(m[1], false)[m[2]] && _d.ok === true) {
        setTimeout(function () { try { _sobraConferir(m[1], m[2], k); } catch (eS) {} }, 0);
      }
    });
    try {
      if (global.document && global.document.addEventListener) global.document.addEventListener("visibilitychange", function () {
        try { if (global.document.visibilityState === "visible") _conferirVersoes(); } catch (eV) {}
      });
    } catch (eD) {}
  }

  /* ---- a sobra (ver a nota lá em cima) ---- */
  function _guardarSobraBanco(k, raw, origem) {
    var sk = k + SUFIXO_SOBRA + new Date().toISOString().replace(/[:.]/g, "-") + "-" + origem + "-" + _d.tab;
    var ver = _novaVer(sk);
    return _txGravar(sk, raw, ver, true).then(function () { return _txLer(sk); }).then(function (rec) {
      if (!rec || rec.raw !== raw) throw new Error("a cópia da sobra não confere");
      _d.esp[sk] = { raw: raw, ver: ver };
      _d.sobras.push({ chave: sk, origem: origem, chars: raw.length, em: new Date().toISOString() });
      return sk;
    });
  }
  function _sobraMesclar(empresaId, entidade, k, raw) {
    var cur = _d.esp[k], atual = cur ? cur.raw : null, forma = FORMA_PADRAO[entidade];
    var vSobra;
    try { if (_vazio(raw)) return; vSobra = _abre(raw, forma); }
    catch (eS) { try { console.warn("[store] sobra ilegível de \"" + entidade + "\" no localStorage: guardada à parte no banco, o que está no banco continua valendo"); } catch (eW) {} return; }
    if (atual == null || _vazio(atual)) { _discoGravar(k, raw, empresaId, entidade); return; }   // nada no banco: a sobra É o dado
    var vAtual;
    try { vAtual = _abre(atual, forma); } catch (eA) { return; }
    var N = global.Nuvem;
    if (OBJETO_UNICO[entidade] || entidade === "_syncmarcas" || !Array.isArray(vSobra) || !Array.isArray(vAtual) || !N || typeof N._merge !== "function") {
      try { console.warn("[store] sobra de \"" + entidade + "\" no localStorage: guardada à parte no banco; vale o que está no banco"); } catch (eW2) {}
      return;
    }
    var F = FORMAS[entidade];
    var merged = N._merge(F ? F(vAtual) : vAtual, F ? F(vSobra) : vSobra, entidade, String(empresaId || "default"));
    var txt = JSON.stringify(_temProp(GUARDAR, entidade) ? GUARDAR[entidade](merged) : merged);
    if (txt !== atual) _discoGravar(k, txt, empresaId, entidade);
    try { console.warn("[store] sobra de \"" + entidade + "\" no localStorage (aba de versão antiga?) unida ao banco pelo merge da nuvem; a cópia original ficou guardada à parte"); } catch (eW3) {}
  }
  function _sobraConferir(empresaId, entidade, k) {
    if (_d.mesclando || _d.ok !== true || !_d.db) return null;
    var raw;
    try { raw = localStorage.getItem(k); } catch (e) { return null; }
    if (raw == null || _d.sobraEmCurso[k] === raw) return null;
    _d.sobraEmCurso[k] = raw;
    var cur = _d.esp[k];
    if (!(cur && cur.raw === raw)) {
      _d.mesclando = true;
      try { _sobraMesclar(empresaId, entidade, k, raw); }
      catch (eM) { try { console.error("[store] a sobra de \"" + entidade + "\" não entrou (fica guardada à parte):", eM); } catch (eL) {} }
      finally { _d.mesclando = false; }
    }
    /* a cópia vai para o banco, CONFERIDA, e só então sai do localStorage */
    var p = (cur && cur.raw === raw) ? Promise.resolve(null) : _guardarSobraBanco(k, raw, "localStorage");
    return p.then(function () {
      try { if (localStorage.getItem(k) === raw) localStorage.removeItem(k); } catch (eR) {}
      if (_d.sobraEmCurso[k] === raw) delete _d.sobraEmCurso[k];
    }, function (eG) {
      try { console.error("[store] a cópia da sobra de \"" + entidade + "\" não se provou — ela continua no localStorage:", eG && eG.message); } catch (eL2) {}
      /* tenta de novo daqui a 30 s, e não a cada leitura */
      if (typeof setTimeout === "function") setTimeout(function () { if (_d.sobraEmCurso[k] === raw) delete _d.sobraEmCurso[k]; }, 30000);
    });
  }

  /* ---- a migração (ver as regras lá em cima) ---- */
  function _migrarUma(empresaId, entidade, k) {
    var raw;
    try { raw = localStorage.getItem(k); } catch (e) { return Promise.resolve(); }
    if (raw == null) return Promise.resolve();
    if (_casa(empresaId, true)[entidade]) return _sobraConferir(empresaId, entidade, k) || Promise.resolve();
    if (!_vazio(raw)) {
      try { _abre(raw, FORMA_PADRAO[entidade]); }
      catch (eA) {
        _d.falhas.push({ entidade: entidade, empresaId: empresaId, motivo: "ilegível — fica no localStorage, na quarentena de sempre" });
        return Promise.resolve();
      }
    }
    var ver = null, antes = _d.esp[k];
    /* cópia no banco SEM marca (migração anterior interrompida): o
       localStorage é quem manda; a cópia antiga não se perde */
    var guarda = (antes && antes.raw != null && antes.raw !== raw) ? _guardarSobraBanco(k, antes.raw, "banco-sem-marca") : Promise.resolve();
    return guarda.then(function () {
      ver = _novaVer(k);
      return _txGravar(k, raw, ver, true);
    }).then(function () { return _txLer(k); }).then(function (rec) {
      if (!rec || rec.raw !== raw || rec.ver !== ver) throw new Error("a leitura de volta não confere com o localStorage");
      /* ⚠ DAQUI ATÉ O FIM É UM BLOCO SÍNCRONO: ninguém desta aba grava no meio */
      var agora = null;
      try { agora = localStorage.getItem(k); } catch (eG) { agora = null; }
      if (agora !== raw) throw new Error("o localStorage mudou durante a migração");
      _d.esp[k] = { raw: raw, ver: ver }; _d.carregada[k] = 1; delete _d.trancadas[k];
      var marcou = _casaMarcar(empresaId, entidade);
      try { localStorage.removeItem(k); } catch (eR) {}
      if (!marcou) marcou = _casaMarcar(empresaId, entidade);   // com a cota cheia, a marca cabe depois de liberar
      _d.migradas.push({ entidade: entidade, empresaId: String(empresaId), chars: raw.length, marca: marcou });
      logMigracao("localStorage", "IndexedDB", entidade + " (" + raw.length + " caracteres)");
      _bcPostar({ t: "g", k: k, e: String(empresaId), n: entidade, raw: raw, ver: ver });
    })["catch"](function (e) {
      _d.falhas.push({ entidade: entidade, empresaId: String(empresaId), motivo: String((e && e.message) || e) });
      try { console.error("[store] \"" + entidade + "\" NÃO migrou (continua no localStorage, nada foi removido):", e && e.message); } catch (eL) {}
      if (ver) return _txApagarSe(k, ver)["catch"](function () {});
    });
  }
  function _migrarTudo() {
    if (!_migracaoLigada()) return Promise.resolve();
    var cand = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i), m = k ? RE_CHAVE_ENT.exec(k) : null;
        if (m && _naIdb(m[1], m[2])) cand.push({ k: k, e: m[1], n: m[2] });
      }
    } catch (e) {}
    return cand.reduce(function (p, c) { return p.then(function () { return _migrarUma(c.e, c.n, c.k); }); }, Promise.resolve());
  }
  /* registro no banco sem marca e sem nada no localStorage: nasceu numa
     gravação cuja marca não coube (cota) ou a migração caiu entre remover e
     marcar — o banco é a única cópia, e passa a valer */
  function _adotarOrfaos() {
    Object.keys(_d.esp).forEach(function (k) {
      var e = _d.esp[k], m = RE_CHAVE_ENT.exec(k);
      if (!e || e.raw == null || !m || !_naIdb(m[1], m[2]) || _casa(m[1], false)[m[2]]) return;
      var temLs = true;
      try { temLs = localStorage.getItem(k) != null; } catch (eL) { temLs = true; }
      if (!temLs) _casaMarcar(m[1], m[2]);
    });
  }
  function _prime() {
    _ouvirJanelas();
    _bcAbrir();
    if (!global.indexedDB) { _d.ok = false; _d.completo = true; return Promise.resolve(); }
    return _abrir().then(function (db) {
      _d.db = db;
      return _txVarrer(ST_ENT, function (k, v) {
        if (v && typeof v.raw === "string" && typeof v.ver === "string") _aplicar(k, v.raw, v.ver);
      });
    }).then(function () {
      _d.ok = true;
      return _migrarTudo();
    }).then(function () {
      _adotarOrfaos();
      _d.completo = true;
      Object.keys(_d.pendentes).forEach(function (k) { _persistir(k, _d.pendentes[k]); });
      _pedirPersistencia();
    }, function (e) {
      try { console.error("[store] o banco do aparelho (IndexedDB) não abriu — os dados continuam no localStorage:", e && (e.name || e.message)); } catch (eL) {}
      _d.ok = false; _d.completo = true;
    });
  }
  /* ⚠ PEDE AO NAVEGADOR PARA NÃO APAGAR O BANCO SOB PRESSÃO DE ESPAÇO.
     Armazenamento de site é "melhor esforço": com o disco do celular cheio o
     navegador pode limpar a origem inteira (banco e localStorage juntos — o
     risco já existia antes da mudança). `persist()` é silencioso no Chrome
     (PWA instalado ganha) e no Safari; no Firefox vira uma PERGUNTA na tela,
     e lá não se pede. Só melhora: negado é o comportamento de antes. */
  function _pedirPersistencia() {
    try {
      var st = global.navigator && global.navigator.storage;
      if (!st || typeof st.persist !== "function" || typeof st.persisted !== "function") return;
      if (/Firefox\//.test(String(global.navigator.userAgent || ""))) return;
      st.persisted().then(function (ja) {
        _d.persistente = !!ja;
        if (!ja) return st.persist().then(function (ok) { _d.persistente = !!ok; });
      })["catch"](function () {});
    } catch (e) {}
  }
  function _resumo() {
    return { ok: _d.ok === true, idb: _d.ok === true, completo: _d.completo,
      migradas: _d.migradas.slice(), falhas: _d.falhas.slice(), sobras: _d.sobras.slice() };
  }

  /* ---------- Adapter local (localStorage) ---------- */
  var LocalAdapter = {
    /* `forma` (opcional): "lista" = JSON válido que não é lista também conta
       como ilegível (ver `_abre`). Sem ela, vale a de FORMA_PADRAO. */
    ler: function (empresaId, entidade, fallback, forma) {
      if (!forma && Object.prototype.hasOwnProperty.call(FORMA_PADRAO, entidade)) forma = FORMA_PADRAO[entidade];
      var k = chave(empresaId, entidade), raw;
      /* ⚠ MORA NO BANCO (ver a nota do IndexedDB): lê o espelho; ainda não
         carregado → vazio na tela e gravação RECUSADA (regra 1) */
      var rota = _rota(empresaId, entidade, k, false);
      if (rota === "trancada") { _avisarTrancada(empresaId, entidade, k, false); return fallback; }
      if (rota === "idb") {
        _sobraConferir(empresaId, entidade, k);
        var ee = _d.esp[k];
        raw = ee ? ee.raw : null;
      } else {
        try { raw = localStorage.getItem(k); }
        catch (e) {
          /* armazenamento inacessível (navegador bloqueando): não é conteúdo
             corrompido — a gravação também vai falhar, e avisa sozinha */
          console.warn("[store] leitura impossível em", entidade, e);
          return fallback;
        }
      }
      _lidas[k] = 1;
      if (_vazio(raw)) { delete _ilegivel[k]; return fallback; }
      try {
        var v = _abre(raw, forma);
        delete _ilegivel[k];
        return v;
      } catch (e) {
        /* ⚠ NÃO É LISTA VAZIA: ver a nota da quarentena lá em cima */
        _marcarIlegivel(empresaId, entidade, k, raw, e);
        return fallback;
      }
    },
    gravar: function (empresaId, entidade, valor) {
      /* ⚠ A RECUSA. Quem montou `valor` leu o fallback no lugar do conteúdo
         que não abriu; gravar aqui apagaria esse conteúdo. Ver a nota da
         quarentena. Não sai sem entender: foi assim que a lista de
         orçamentos virava um orçamento só. */
      var kG = chave(empresaId, entidade), mG = _ilegivel[kG];
      if (mG && mG.bloqueia) {
        try { console.error("[store] gravação de \"" + entidade + "\" RECUSADA: o conteúdo do disco está ilegível e seria apagado (" + (mG.copiaOk ? "cópia em " + mG.quarentena : "sem cópia à parte") + ")."); } catch (eC) {}
        _avisarIlegivel(mG);
        return false;
      }
      /* ⚠ A TRAVA DO PRIME (regra 1 da nota do IndexedDB): a entidade mora
         no banco e esta aba ainda não a leu de lá — quem montou `valor` leu
         vazio. Mesma família da recusa da quarentena logo acima. */
      var rotaG = _rota(empresaId, entidade, kG, true);
      if (rotaG === "trancada") { _avisarTrancada(empresaId, entidade, kG, true); return false; }
      try {
        /* a forma GUARDADA da entidade (ver GUARDAR: bim_vistas sem o
           prefixo repetido); `valor` em si não muda */
        var gd = Object.prototype.hasOwnProperty.call(GUARDAR, entidade) ? GUARDAR[entidade](valor) : valor;
        var txt = JSON.stringify(gd);
        if (rotaG === "nova") { _casaMarcar(empresaId, entidade); rotaG = "idb"; }
        if (rotaG === "idb") { _discoGravar(kG, String(txt), empresaId, entidade); return true; }
        localStorage.setItem(kG, txt);
        return true;
      } catch (e) {
        console.error("[store] falha ao gravar", entidade, e);
        // LOTE 1: falha de gravação NUNCA é silenciosa — o usuário precisa saber
        // que a última alteração não persistiu (antes só ia p/ o console).
        var cota = e && (e.name === "QuotaExceededError" || e.code === 22);
        /* ⚠ UMA VEZ POR SESSÃO POR ENTIDADE (10/10/2026). O celular do dono
           mostrava este recado a CADA gravação ("toda hora"): cada autosave e
           cada snapshot da nuvem batiam aqui. Quem precisa saber da recusa
           ainda sabe — `salvarOrcamento`/`salvar` devolvem null e a tela diz
           que não gravou; o que não se repete é o aviso genérico. */
        var kAv = String(empresaId || "default") + ":" + entidade + ":" + (cota ? "cota" : "erro");
        if (_avisoGravar[kAv]) return false;
        _avisoGravar[kAv] = 1;
        try {
          if (global.UI && global.UI.toast) global.UI.toast(cota
            /* ⚠ NÃO MANDE LIMPAR AS BASES: elas moram no IndexedDB e não ocupam
               um byte do que está cheio. Ver a nota em `saude()`. O que enche é
               orçamento e histórico da obra. */
            ? "⚠ Armazenamento CHEIO — a alteração em \"" + ((global.Store && global.Store.nomeEntidade) ? global.Store.nomeEntidade(entidade) : entidade) + "\" NÃO foi salva. Faça 💾 Backup AGORA e veja o que ocupa espaço em 🗂 Tabelas › Saúde do armazenamento (as bases SINAPI não contam neste limite)."
            : "⚠ Falha ao salvar \"" + entidade + "\" — a última alteração não persistiu.", "erro", 12000);
        } catch (e2) {}
        return false;
      }
    },
    apagar: function (empresaId, entidade) {
      var k = chave(empresaId, entidade), r = _rota(empresaId, entidade, k, true);
      if (r === "trancada") { _avisarTrancada(empresaId, entidade, k, true); return false; }
      /* no banco: apaga lá (com versão, para outra aba não ressuscitar). No
         localStorage: se sobrou uma cópia de migração sem marca no banco,
         ela sai junto — senão o próximo boot a ADOTARIA (`_adotarOrfaos`). */
      if (r === "idb" || (r === "ls" && _d.ok === true && _d.esp[k] && _d.esp[k].raw != null)) _discoGravar(k, null, empresaId, entidade);
      try { localStorage.removeItem(k); return true; }
      catch (e) { return false; }
    },

    /* ---- o estado da quarentena (ver a nota lá em cima) ---- */
    ilegivel: function (empresaId, entidade) {
      var m = _ilegivel[chave(empresaId, entidade)];
      return m ? _publico(m) : null;
    },
    ilegiveis: function (empresaId) {
      var pre = chave(empresaId, ""), out = [];
      for (var k in _ilegivel) {
        if (Object.prototype.hasOwnProperty.call(_ilegivel, k) && k.indexOf(pre) === 0) out.push(_publico(_ilegivel[k]));
      }
      return out;
    },
    jaLida: function (empresaId, entidade) { return !!_lidas[chave(empresaId, entidade)]; },
    /* as cópias guardadas, do disco (e não da memória): sobrevivem a fechar o app */
    quarentenas: function (empresaId) {
      var pre = chave(empresaId, ""), out = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var q = localStorage.key(i);
          if (!q || q.indexOf(pre) !== 0) continue;
          var p = q.indexOf(SUFIXO_QUAR, pre.length);
          if (p < 0) continue;
          out.push({ chave: q, entidade: q.slice(pre.length, p), bytes: (localStorage.getItem(q) || "").length });
        }
      } catch (e) {}
      return out;
    },
    /* =================================================================
     * ⚠ A PORTA DA TRAVA. Sem ela, a lista ilegível recusaria toda gravação
     *   para sempre, e a pessoa sem backup não conseguiria nem criar um
     *   orçamento novo — o tipo de trava que empurra para a gambiarra.
     *
     * Remove o original ilegível SÓ DEPOIS de conferir que a cópia à parte
     * tem exatamente o mesmo conteúdo. Sem cópia conferida (cota cheia),
     * recusa: nesse caso o original é a única cópia que existe.
     * Conteúdo que voltou a abrir (outra janela restaurou) não é tocado.
     * ================================================================= */
    liberar: function (empresaId, entidade, forma) {
      if (!forma && Object.prototype.hasOwnProperty.call(FORMA_PADRAO, entidade)) forma = FORMA_PADRAO[entidade];
      var k = chave(empresaId, entidade), raw;
      /* o original pode morar no banco (ver a nota do IndexedDB); a CÓPIA da
         quarentena continua no localStorage, como sempre */
      try { raw = _rawDe(empresaId, entidade, k); }
      catch (e) { return { ok: false, motivo: "leitura", erro: String((e && e.message) || e) }; }
      if (_vazio(raw)) { delete _ilegivel[k]; return { ok: true, nada: true }; }
      var abriu = true;
      try { _abre(raw, forma); } catch (eA) { abriu = false; }
      if (abriu) { delete _ilegivel[k]; return { ok: true, legivel: true }; }
      var m = _marcarIlegivel(empresaId, entidade, k, raw, new Error("liberar"));
      if (!m.copiaOk) {                       // a porta tenta a cópia de novo, sem esperar os 30 s
        var q = _quarentenar(k, raw);
        m.copiaOk = !!q.ok; m.quarentena = q.chave || ""; m.erroCopia = q.erro || "";
        m.desde = _desdeDaCopia(m.quarentena) || m.desde;
      }
      var confere = false;
      try { confere = m.copiaOk && localStorage.getItem(m.quarentena) === raw; } catch (eQ) { confere = false; }
      if (!confere) return { ok: false, motivo: "copia", bytes: raw.length, erro: m.erroCopia || "" };
      if (_rota(empresaId, entidade, k, true) === "idb") _discoGravar(k, null, empresaId, entidade);
      try { localStorage.removeItem(k); }
      catch (eR) { return { ok: false, motivo: "remover", erro: String((eR && eR.message) || eR) }; }
      delete _ilegivel[k];
      try { console.warn("[store] \"" + entidade + "\" liberada: original ilegível removido; cópia conferida em " + m.quarentena); } catch (eL) {}
      return { ok: true, quarentena: m.quarentena, bytes: raw.length };
    }
  };
  /* o gravador SEM o embrulho da nuvem (js/nuvem.js `_patch` troca a função
     no próprio objeto): só `compactarGuardado` usa — ver a nota lá */
  var _gravarLocal = LocalAdapter.gravar;

  /* ---------- Blobs GRANDES (IndexedDB) ----------
   * A base SINAPI enriquecida (~3 MB) e as bases extras estouram a cota de
   * ~5 MB do localStorage (QuotaExceededError). Ficam no IndexedDB (sem esse
   * limite), com espelho EM MEMÓRIA p/ os callers continuarem síncronos.
   * Migra automaticamente qualquer valor legado que esteja no localStorage.
   */
  var BIG = ["sinapi_base", "bases_extras"];
  var _big = {};        // chave -> valor (espelho em memória)
  var _bigInit = {};    // empresaId -> Promise (idempotente)
  function idbHas() { return typeof Idb !== "undefined" && Idb.disponivel(); }
  function primeUma(empresaId, entidade) {
    var k = chave(empresaId, entidade), legado = null;
    try { var raw = localStorage.getItem(k); if (raw) legado = JSON.parse(raw); } catch (e) {}
    if (legado != null) { // migra legado do localStorage p/ IDB e libera a cota
      _big[k] = legado;
      if (idbHas()) Idb.set(k, legado).then(function () { try { localStorage.removeItem(k); } catch (e) {} }).catch(function () {});
      return Promise.resolve();
    }
    if (!idbHas()) return Promise.resolve();
    return Idb.get(k).then(function (v) { if (v != null) _big[k] = v; }).catch(function () {});
  }

  /* ---------- Migrações versionadas ----------
   * Nunca apaga dados: transforma de uma versão de schema para a próxima.
   */
  // LOTE 1: toda migração fica registrada (suporte consegue reconstituir o histórico)
  function logMigracao(de, para, orcId) {
    try {
      var k = NS + ":migracoes";
      var arr = JSON.parse(localStorage.getItem(k) || "[]");
      arr.push({ de: de, para: para, orc: orcId || "", em: new Date().toISOString() });
      if (arr.length > 200) arr = arr.slice(-200); // teto p/ não crescer sem fim
      localStorage.setItem(k, JSON.stringify(arr));
    } catch (e) {}
  }

  function migrarOrcamento(o) {
    if (!o) return o;
    var v = o.schemaVersao || 1;
    // v1 -> v2: garante campos de BDI estruturado e desonerado
    if (v < 2) {
      o.desonerado = !!o.desonerado;
      if (!o.bdi || typeof o.bdi !== "object") o.bdi = { modeloId: "padrao", params: null, percentual: 0 };
      o.schemaVersao = 2;
    }
    // v2 -> v3: garante objetos cliente/obra/etapas (backups antigos podem não ter)
    if (v < 3) {
      if (!o.cliente || typeof o.cliente !== "object") o.cliente = { nome: "", doc: "", contato: "" };
      if (!o.obra || typeof o.obra !== "object") o.obra = { nome: "", local: "", regime: "Empreitada" };
      if (o.etapas == null) o.etapas = [];
      o.schemaVersao = 3;
    }
    if (o.schemaVersao !== v) logMigracao(v, o.schemaVersao, o.id);
    return o;
  }

  /* =====================================================================
   * MIGRAÇÃO DAS ENTIDADES DA GESTÃO
   *
   * ⚠ ISTO NÃO EXISTIA. `migrarOrcamento` roda dentro de `listarOrcamentos`
   *   e só cobre orçamentos; o `listar` genérico — o que serve obras,
   *   medições, financeiro, fiscal e mais vinte entidades — devolvia o array
   *   cru. Ou seja: campo novo em entidade da Gestão sempre foi "torcer para
   *   que todo leitor tolere `undefined`".
   *
   * ⚠ MIGRA NA LEITURA, EM MEMÓRIA, E NÃO GRAVA.
   *   A tentação é varrer tudo no boot e salvar. Não: `Store.salvar` carimba
   *   `atualizadoEm` novo, e aí a migração VENCE o merge da nuvem e se
   *   propaga por cima do que o outro aparelho tinha de mais recente. Foi
   *   exatamente esse mecanismo que apagou diário editado na migração de
   *   fotos (corrigido na v1.1.236). Aqui o registro é normalizado ao ser
   *   lido; a forma nova só encosta no disco quando algo o salvar por outro
   *   motivo — e aí o carimbo é legítimo.
   *
   * ⚠ TEM DE SER BARATO. `listar` é chamado dentro de laços em várias telas
   *   (a lista Fiscal chamava `lista("financeiro")` uma vez por nota). Por
   *   isso: entidade sem migrador sai por uma consulta a objeto, e registro
   *   já migrado sai por uma leitura de propriedade. Nada de map por padrão.
   * ===================================================================== */

  /* Converte para centavos usando o módulo de dinheiro. Se ele ainda não
     estiver carregado, devolve null e o migrador DESISTE da versão — melhor
     tentar de novo na próxima leitura do que carimbar v2 num registro pela
     metade. (No app o dinheiro.js vem antes deste arquivo; em teste Node,
     quem carrega decide.) */
  function _cent(v) {
    var D = global.Dinheiro;
    if (!D || !D.paraCentavos) return null;
    return D.paraCentavos(v);
  }

  /* --- financeiro v1 -> v2 ---------------------------------------------
   * Converte o valor para centavos exatos. `valor` (float) continua gravado
   * como espelho: dez leitores somam `f.valor` hoje, e trocar todos de uma
   * vez seria a refatoração de vinte arquivos que o manual da casa proíbe.
   *
   * ⚠ `vencimento` E `dataPgto` FICARAM DE FORA — E A TENTATIVA DE INCLUÍ-LOS
   *   AQUI VIROU DEFEITO, então a nota fica registrada.
   *
   *   O registro tem UM campo de data com três significados conforme quem
   *   gravou (lançamento no formulário, vencimento quando veio de NF-e,
   *   pagamento quando veio de medição). Desdobrar isso é necessário — mas
   *   não desta forma. Eu derivei `vencimento = data` na migração e passei a
   *   consumi-lo no alerta de contas a vencer. Só que o formulário grava
   *   apenas `data` (js/gestao.js:3574), sobre um clone do registro já
   *   migrado: corrigir a data de uma conta deixava `vencimento` congelado no
   *   valor antigo, e como a migração recusa `schemaVersao >= 2`, não havia
   *   segunda chance. A conta vencia sem aviso — ou aparecia como vencida
   *   para sempre — num campo que o usuário não vê nem consegue editar.
   *
   *   A lição não é "faltou re-derivar no save". É que eu criei um CONSUMIDOR
   *   de um campo antes de existir quem o mantivesse honesto.
   *
   *   O desenho certo apareceu quando o campo ganhou dono — o formulário do
   *   financeiro (js/gestao.js:3583) passou a gravar `vencimento` e
   *   `dataPgto` como campos de verdade, que a pessoa vê e edita. Com dono,
   *   o campo não precisa ser derivado em lugar NENHUM: ele é OPCIONAL, e
   *   ausente significa "igual à data de lançamento". Quem lê usa
   *   `f.vencimento || f.data` (o alerta do Painel e o Portal do Cliente).
   *   Assim não existe estado a manter em sincronia e, portanto, não existe
   *   como ficar obsoleto — que é a única garantia que vale.
   * ------------------------------------------------------------------- */
  function migrarFinanceiro(o) {
    if (!o || (o.schemaVersao || 1) >= 2) return false;
    var c = _cent(o.valor);
    if (c === null) return false;             // Dinheiro ausente: tenta na próxima
    o.valorCent = c;
    o.schemaVersao = 2;
    return true;
  }

  /* Registro por entidade. Quem não está aqui passa direto, sem custo. */
  var MIGRADORES = { financeiro: migrarFinanceiro };

  /* =====================================================================
   * MIGRAÇÃO DE *FORMA* — de OBJETO para LISTA, também NA LEITURA
   *
   * Os MIGRADORES acima consertam CAMPO de registro. Aqui é outra coisa:
   * a entidade inteira estava guardada com a FORMA errada para sincronizar.
   *
   * ⚠ O DEFEITO (achado 25 da v1.2): `precosinsumos` — a cotação que o
   *   usuário faz com o fornecedor dele quando o SINAPI não coletou o preço
   *   do insumo na UF — era um MAPA `código → {preco, em}`. Mapa não
   *   sincroniza: o merge da nuvem trata tudo que não é prefs/conta como
   *   LISTA, e `Util.arr({})` é `[]`. Por isso a entidade nunca esteve em
   *   `Nuvem.ENTIDADES` e, como o backup deriva a lista dele, também nunca
   *   entrou no backup. Trocar de máquina apagava o catálogo de cotações da
   *   empresa: os avisos "N insumo(s) sem preço" voltavam um por composição
   *   e tudo tinha de ser recotado à mão. Mesma história das
   *   `composicoes_proprias` — "um cliente perdeu as dele".
   *
   * ⚠ E POR QUE NÃO BASTAVA ACRESCENTAR O NOME NA LISTA DA NUVEM: provado
   *   rodando o `Nuvem.sincronizar` real sobre o disco de um cliente com as
   *   3 cotações no formato antigo — 3 cotações ANTES, 0 DEPOIS, disco `[]`
   *   e `[]` empurrado para a nuvem, ou seja, apagaria também nos outros
   *   aparelhos. A forma tem de ser convertida ANTES de o merge encostar
   *   nela, e é isso que esta tabela faz.
   *
   * ⚠ CONVERTE NA LEITURA, EM MEMÓRIA, E NÃO GRAVA — a mesma doutrina da
   *   nota grande lá em cima. Regravar em massa carimbaria `atualizadoEm`
   *   novo em cotação antiga, e aí a migração venceria o merge e se
   *   propagaria por cima do que o outro aparelho tinha de mais recente
   *   (foi assim que a migração de fotos apagou diário editado, v1.1.236).
   *   Por isso o registro convertido HERDA o `em` original como
   *   `atualizadoEm`: ele entra no merge com a idade que sempre teve.
   *   A forma nova só encosta no disco quando algo grava por outro motivo
   *   — o merge da nuvem, uma cotação nova, uma exclusão.
   * ===================================================================== */
  /* Piso de data para cotação SEM `em` no disco (dado corrompido: o
     `salvarPrecoInsumo` sempre carimbou). Vazio não serve — `atualizadoEm`
     vazio empata com vazio no merge e faz a restauração do backup comparar
     `"" >= ""` e pular o registro. Um piso perde para qualquer data real,
     que é exatamente o que se quer de uma cotação sem idade conhecida. */
  var PISO_SEM_DATA = "1970-01-01T00:00:00.000Z";
  function precosInsumoParaLista(bruto) {
    if (Array.isArray(bruto)) return bruto;              // já está na forma nova
    if (!bruto || typeof bruto !== "object") return [];
    var l = [];
    for (var cod in bruto) {
      if (!Object.prototype.hasOwnProperty.call(bruto, cod)) continue;
      var r = bruto[cod];
      if (!r || typeof r !== "object") continue;
      var em = String(r.em || "") || PISO_SEM_DATA;
      l.push({ id: String(cod), codigo: String(cod), preco: Number(r.preco) || 0,
               em: em, criadoEm: em, atualizadoEm: em });
    }
    return l;
  }

  /* =====================================================================
   * ⚠ PONTOS DE VISTA DO BIM: A CHAVE DA PEÇA SEM O PREFIXO REPETIDO
   *
   * O DEFEITO (01/10/2026, aparelho do dono): "Armazenamento local em 82% —
   *   o maior é bim_vistas com 1437 KB". Medido no backup: 74 vistas (73
   *   vindas de um pacote da obra), 12.567 chaves de peça em
   *   `visibilidade.isolados`/`raioXAlvo` e 1.829 em `aparencias`. A chave do
   *   B0 é `obraId/modeloId::GlobalId` (js/bimid.js) e TODAS as chaves eram
   *   do mesmo modelo: 65 dos 87 caracteres de cada uma eram o mesmo prefixo.
   *   Dois estragos juntos:
   *    - o localStorage (~5 M caracteres por origem) chegando ao teto — e
   *      cheio, a gravação seguinte falha;
   *    - a nuvem guarda a entidade INTEIRA num documento só, com teto de
   *      1 MiB: a lista de vistas era recusada a cada sincronização e os
   *      outros aparelhos nunca as recebiam.
   *
   * A CORREÇÃO: cada lista de chaves é GUARDADA (disco e nuvem) com o prefixo
   *   dito uma vez. Em memória nada muda — quem lê pelo Store recebe a chave
   *   inteira, como sempre (bim.js, BCF, Projeto estrutural, placa da obra).
   *   Lista guardada: [MARCA, "<prefixo>::", "GlobalId", "GlobalId", …]
   *    - MARCA ("@prefixo") no índice 0 diz que a lista está compactada.
   *      Lista sem ela é aberta EXATAMENTE como está: o disco e a nuvem de
   *      hoje, e os aparelhos que ainda não atualizaram, continuam valendo.
   *    - item que termina em "::" troca o prefixo corrente ("::" sozinho =
   *      sem prefixo);
   *    - item sem "::" = prefixo corrente + item;
   *    - item com "::" no meio = chave inteira, como sempre.
   *   Medido no mesmo backup: 1.437 KB → ~530 KB.
   *
   * ⚠ POR QUE MARCA DENTRO DA LISTA, E NÃO UM CAMPO NOVO NO REGISTRO. O
   *   aparelho que ainda não atualizou recebe a lista compactada pela nuvem.
   *   O normalizador dele (`BimVista.vista`) DESCARTA campo que não conhece —
   *   um `prefixo` num campo à parte sumiria na primeira edição feita lá, e
   *   as chaves viveriam órfãs para sempre. Dentro da lista, a marca e os
   *   prefixos sobrevivem a ele: `chaves()` só apara e tira repetido.
   *   Por isso também a regra de NUNCA repetir um item na lista guardada (o
   *   tira-repetido do aparelho antigo comeria o segundo): prefixo que
   *   precisaria voltar e GlobalId igual em dois modelos saem como chave
   *   inteira. No aparelho antigo a vista compactada abre sem achar as peças
   *   ("não localizada") até ele atualizar — nada é apagado nem regravado.
   *
   * ⚠ A COMPACTAÇÃO SE CONFERE ANTES DE VALER. `compactarVistas` abre o que
   *   acabou de compactar e compara com o original, caractere a caractere;
   *   se não for idêntico, guarda o original. Pior caso: ocupa o que ocupava.
   *   Nunca: guardar outra coisa.
   *
   * Prova: tools/test-vistas-compactas.js.
   * ===================================================================== */
  var MARCA_COMPACTA = "@prefixo";
  var SEP_CHAVE = "::";
  function _ehPrefixo(s) { return typeof s === "string" && s.length >= 2 && s.slice(-2) === SEP_CHAVE; }

  /* `itens` = a lista guardada; `ler(item)` dá a chave do item (ou null se o
     item não tem chave), `com(item, chave)` devolve o item com outra chave. */
  function _abrirChaves(itens, ler, com) {
    if (!Array.isArray(itens) || !itens.length || ler(itens[0]) !== MARCA_COMPACTA) return itens;
    var out = [], pre = "";
    for (var i = 1; i < itens.length; i++) {
      var it = itens[i], s = ler(it);
      if (typeof s !== "string") { out.push(it); continue; }
      if (_ehPrefixo(s)) { pre = (s === SEP_CHAVE) ? "" : s; continue; }
      out.push(s.indexOf(SEP_CHAVE) >= 0 ? it : com(it, pre + s));
    }
    return out;
  }
  function _compactarChaves(itens, ler, com, marca) {
    if (!Array.isArray(itens) || itens.length < 2) return itens;
    var n0 = ler(itens[0]);
    if (n0 === MARCA_COMPACTA) return itens;                 // já está guardada
    /* as chaves de cada prefixo, para saber se vale abrir um prefixo (≥ 2) */
    var conta = {};
    for (var c = 0; c < itens.length; c++) {
      var sc = ler(itens[c]), pc = (typeof sc === "string") ? sc.indexOf(SEP_CHAVE) : -1;
      if (pc > 0 && pc + 2 < sc.length) { var bc = sc.slice(0, pc + 2); conta[bc] = (conta[bc] || 0) + 1; }
    }
    var out = [marca(MARCA_COMPACTA)], pre = "", abertos = {}, ditos = {}, ganhou = false;
    ditos[MARCA_COMPACTA] = 1;
    function poe(it, s) { out.push(it); ditos[s] = 1; }
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i], s = ler(it);
      if (typeof s !== "string") { out.push(it); continue; }
      var p = s.indexOf(SEP_CHAVE);
      if (p < 0) {
        /* chave sem prefixo: só pode sair "crua" com o prefixo zerado */
        if (pre !== "") {
          if (abertos[SEP_CHAVE]) return itens;              // precisaria repetir o "::" — não compacta
          abertos[SEP_CHAVE] = 1; pre = ""; out.push(marca(SEP_CHAVE));
        }
        if (ditos[s]) return itens;                          // repetida: o tira-repetido antigo comeria
        poe(it, s); continue;
      }
      /* "::" no começo ou no fim: chave que o BimId nunca gera, e que a
         leitura confundiria com prefixo — a lista fica como está */
      if (p === 0 || p + 2 >= s.length) return itens;
      var b = s.slice(0, p + 2), suf = s.slice(p + 2);
      var sufOk = suf.indexOf(SEP_CHAVE) < 0 && !ditos[suf];
      if (b === pre && sufOk) { poe(com(it, suf), suf); ganhou = true; continue; }
      if (b !== pre && sufOk && !abertos[b] && conta[b] >= 2) {
        abertos[b] = 1; pre = b; out.push(marca(b)); ditos[b] = 1;
        poe(com(it, suf), suf); ganhou = true; continue;
      }
      if (ditos[s]) return itens;
      poe(it, s);                                            // chave inteira: vale com qualquer prefixo
    }
    return ganhou ? out : itens;
  }

  function _lerTexto(s) { return typeof s === "string" ? s : null; }
  function _comTexto(s, nova) { return nova; }
  function _marcaTexto(s) { return s; }
  /* aparência: { chave, cor, alpha } — a cópia mantém a ORDEM dos campos (a
     conferência compara o texto) e só troca a chave */
  function _lerAparencia(a) { return (a && typeof a === "object" && typeof a.chave === "string") ? a.chave : null; }
  function _comAparencia(a, nova) {
    var r = {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) r[k] = (k === "chave") ? nova : a[k];
    return r;
  }
  function _marcaAparencia(s) { return { chave: s }; }

  /* o registro de vista, com as listas de chave trocadas. `abrir` = true lê,
     false guarda. Nunca mexe no objeto recebido: quem grava continua com
     ele na mão (o merge da nuvem usa a mesma lista para a marca do sync). */
  function _vistaComChaves(v, abrir) {
    if (!v || typeof v !== "object") return v;
    var fT = abrir ? function (l) { return _abrirChaves(l, _lerTexto, _comTexto); }
                   : function (l) { return _compactarChaves(l, _lerTexto, _comTexto, _marcaTexto); };
    var fA = abrir ? function (l) { return _abrirChaves(l, _lerAparencia, _comAparencia); }
                   : function (l) { return _compactarChaves(l, _lerAparencia, _comAparencia, _marcaAparencia); };
    var r = null;
    function troca(dono, campo, f) {
      var src = dono && dono[campo];
      if (!Array.isArray(src)) return dono;
      var nv = f(src);
      if (nv === src) return dono;
      var d2 = {};
      for (var k in dono) if (Object.prototype.hasOwnProperty.call(dono, k)) d2[k] = (k === campo) ? nv : dono[k];
      return d2;
    }
    function poe(campo, novo) {
      if (novo === v[campo]) return;
      if (!r) { r = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) r[k] = v[k]; }
      r[campo] = novo;
    }
    var vis = v.visibilidade;
    if (vis && typeof vis === "object") {
      var vis2 = troca(troca(troca(vis, "isolados", fT), "ocultos", fT), "raioXAlvo", fT);
      poe("visibilidade", vis2);
    }
    if (Array.isArray(v.aparencias)) poe("aparencias", fA(v.aparencias));
    if (v.cotaRede && typeof v.cotaRede === "object") poe("cotaRede", troca(v.cotaRede, "fixados", fT));
    /* a cópia do perdedor de um conflito da nuvem é uma vista inteira (até
       50 KB, js/nuvem.js `_merge`): também guarda compactada */
    var cf = v._conflitoDe;
    if (cf && typeof cf === "object" && cf.copia && typeof cf.copia === "object") {
      var cp2 = _vistaComChaves(cf.copia, abrir);
      if (cp2 !== cf.copia) {
        var cf2 = {};
        for (var kc in cf) if (Object.prototype.hasOwnProperty.call(cf, kc)) cf2[kc] = (kc === "copia") ? cp2 : cf[kc];
        poe("_conflitoDe", cf2);
      }
    }
    return r || v;
  }
  function abrirVistas(lista) {
    if (!Array.isArray(lista)) return lista;
    return lista.map(function (v) { return _vistaComChaves(v, true); });
  }
  function compactarVistas(lista) {
    if (!Array.isArray(lista)) return lista;
    var c = lista.map(function (v) { return _vistaComChaves(v, false); });
    /* ⚠ a conferência (ver a nota): o compactado, aberto, tem de ser o
       original aberto. "Aberto" dos dois lados porque a lista pode chegar
       mista — vista que desceu compactada de um aparelho antigo ao lado de
       vista inteira — e o que não pode mudar é o que se LÊ. */
    try {
      if (JSON.stringify(abrirVistas(c)) !== JSON.stringify(abrirVistas(lista))) {
        try { console.warn("[store] bim_vistas: a compactação não voltou idêntica — guardado sem compactar"); } catch (eW) {}
        return lista;
      }
    } catch (eC) { return lista; }
    return c;
  }
  /* entidade → como ela é GUARDADA (disco e nuvem). A leitura desfaz em
     `_lerLista` (FORMAS, logo abaixo) e na nuvem (`Store.expandir`). */
  var GUARDAR = { bim_vistas: compactarVistas };

  /* ⚠ O FIRESTORE RECUSA LISTA DENTRO DE LISTA ("Nested arrays are not supported") — e recusa o DOCUMENTO inteiro: a entidade para
     de sincronizar e a tela só diz "formato recusado". O plano de içamento guarda polígonos como [[x, y], …] (onde não se pode apoiar,
     limite do terreno/acesso, entorno da planta) e, desde a 1.2.115, um plano com qualquer polígono não subia (achado em 02/10/2026,
     no aviso de outra sessão sobre bim_vistas/bim_estrut). Conserto na FRONTEIRA da nuvem e só nela: o disco e o código continuam com
     as listas; ao subir, cada lista que está DENTRO de outra lista vira { "__lista": [...] }; ao descer, volta. Recursivo, reversível,
     e quem já desceu aberto continua aberto.
     ⚠ SÓ para as entidades da tabela abaixo. Estender a outra (bim_vistas, bim_estrut…) muda o que um aparelho de versão ANTIGA recebe
       da nuvem — e ele leria { "__lista" } onde espera lista. O plano de içamento só existe em prévia, por isso pôde entrar sem trava. */
  var NUVEM_SEM_LISTA_EM_LISTA = { bim_icamento: true };
  var MARCA_LISTA = "__lista";
  function desaninhar(v, dentroDeLista) {
    if (Array.isArray(v)) { var a = v.map(function (x) { return desaninhar(x, true); }); if (!dentroDeLista) return a; var o0 = {}; o0[MARCA_LISTA] = a; return o0; }
    if (v && typeof v === "object") { var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = desaninhar(v[k], false); return o; }
    return v;
  }
  function reaninhar(v) {
    if (Array.isArray(v)) return v.map(reaninhar);
    if (v && typeof v === "object") {
      var ks = Object.keys(v);
      if (ks.length === 1 && ks[0] === MARCA_LISTA && Array.isArray(v[MARCA_LISTA])) return v[MARCA_LISTA].map(reaninhar);
      var o = {}; ks.forEach(function (k) { o[k] = reaninhar(v[k]); }); return o;
    }
    return v;
  }

  var FORMAS = {
    precosinsumos: precosInsumoParaLista,
    bim_vistas: function (bruto) { return abrirVistas(Util.arr(bruto)); },
    /* ⚠ o aparelho de versão ANTIGA guarda no disco o plano como desceu da nuvem (com { "__lista" }); quando ele atualiza, a leitura
       abre aqui — sem isto, os polígonos chegariam ao motor como objetos. Em dado já aberto não muda nada (ver reaninhar). */
    bim_icamento: function (bruto) { return reaninhar(Util.arr(bruto)); }
  };

  /* =====================================================================
   * NORMALIZAR NA GRAVAÇÃO — o que mantém o espelho honesto.
   *
   * ⚠ SEM ISTO A MIGRAÇÃO PLANTA UMA MINA. `valorCent` é DERIVADO de
   *   `valor`, e o formulário do financeiro grava só `valor`
   *   (js/gestao.js:3576, `obj.valor = nv("g-valor")`) sobre um clone do
   *   registro já migrado — que carrega o `valorCent` antigo. Editar R$ 100
   *   para R$ 250 deixaria `valor: 250` com `valorCent: 10000`. Como ainda
   *   ninguém consome `valorCent`, o estrago só apareceria quando a cobrança
   *   passasse a usá-lo: aí o boleto sairia com o valor velho e ninguém
   *   saberia por quê.
   *
   *   A guarda mora AQUI, e não no formulário, porque há doze caminhos que
   *   gravam lançamento financeiro (NF, medição, compra, folha, ponto,
   *   frota, folha semanal, IA de documento…) e cada um deles é uma chance
   *   de esquecer. `salvar` é por onde todos passam.
   *
   *   Campo derivado que não pode ser derivado não sobrevive: se o módulo
   *   Dinheiro não estiver carregado, `valorCent` é REMOVIDO em vez de ficar
   *   valendo um número velho.
   * ===================================================================== */
  function normalizarFinanceiro(o) {
    if (!o) return o;
    var c = _cent(o.valor);
    if (c === null) { if (o.valorCent != null) delete o.valorCent; return o; }
    o.valorCent = c;
    return o;
  }

  var NORMALIZADORES = { financeiro: normalizarFinanceiro };

  /* ⚠ O LOG É UMA VEZ POR SESSÃO, NÃO POR REGISTRO.
     `logMigracao` faz getItem + JSON.parse + setItem no localStorage: chamá-lo
     por linha seria um round-trip por registro, num caminho que já roda dentro
     de laço em algumas telas. E como o adapter reparseia o localStorage a cada
     leitura (a migração é em memória e não é gravada), o mesmo registro é
     migrado de novo a cada `listar` — o log encheria o teto de 200 entradas em
     segundos e empurraria para fora as migrações de orçamento, que importam.
     Uma linha por entidade por sessão diz o que o log precisa dizer: que a
     forma antiga ainda existe no disco deste aparelho. */
  var _logado = {};

  /* ---------- API pública ---------- */
  var Store = {
    adapter: LocalAdapter,

    /* =================================================================
     * O PORTÃO DO BOOT (ver a nota do IndexedDB). Abre o banco, carrega o
     * espelho, migra o que ainda está no localStorage e só então resolve.
     * NUNCA rejeita e NUNCA espera mais que TETO_PRONTO_MS: com o banco
     * travado o app abre com as entidades do banco TRANCADAS (leitura vazia,
     * gravação recusada) e destranca sozinho quando o banco responder —
     * nesse caso a tela é redesenhada.
     * `empresaId` é aceito por compatibilidade: o prime vale para TODAS as
     * empresas deste aparelho (o login ainda não aconteceu quando ele roda).
     * ================================================================= */
    pronto: function () {
      if (_d.promessa) return _d.promessa;
      _d.promessa = new Promise(function (res) {
        var feito = false;
        var t = (typeof setTimeout === "function") ? setTimeout(function () {
          if (feito) return;
          feito = true;
          try { console.warn("[store] o banco do aparelho não respondeu em " + (TETO_PRONTO_MS / 1000) + " s — o app abre com os dados do banco trancados até ele responder"); } catch (eW) {}
          var r = _resumo(); r.atrasou = true; res(r);
        }, TETO_PRONTO_MS) : null;
        _prime().then(function () {
          if (!feito) { feito = true; if (t && typeof clearTimeout === "function") clearTimeout(t); res(_resumo()); return; }
          /* chegou depois do teto: a tela que abriu trancada se redesenha.
             ⚠ SÓ REDESENHA — nada de evento `storage` por chave: na janela
             principal cada um viraria `Nuvem.push` da entidade inteira, sem
             merge, por cima do que outro aparelho tenha mandado. A
             sincronização seguinte (que mescla) cuida da nuvem. */
          try { if (global.App && typeof global.App.render === "function") global.App.render(); } catch (eR) {}
          try { if (global.UI && global.UI.toast && _d.ok === true) global.UI.toast("Os dados deste aparelho terminaram de carregar.", "ok"); } catch (eT) {}
        });
      });
      return _d.promessa;
    },
    /* a entidade mora no banco e esta aba ainda não a tem: quem sincroniza
       (js/nuvem.js) consulta antes de mesclar ou subir */
    naoCarregada: function (empresaId, entidade) {
      return _rota(empresaId, entidade, chave(empresaId, entidade), false) === "trancada";
    },
    ENT_IDB: ENT_IDB,
    /* O TEXTO GUARDADO de uma entidade, onde quer que ele more (banco ou
       localStorage) — para o suporte e para as e2e que conferem o "disco
       cru": `localStorage.getItem` deixou de ser o lugar único.
       `discoEscreverTexto` grava o texto cru pelo MESMO caminho do adapter
       (sem carimbo, sem nuvem, com o aviso às outras abas): é o "outra
       janela gravou por baixo". Trancada → null / false. */
    discoTexto: function (empresaId, entidade) {
      try { return _rawDe(empresaId, entidade, chave(empresaId, entidade)); } catch (e) { return null; }
    },
    discoEscreverTexto: function (empresaId, entidade, raw) {
      var k = chave(empresaId, entidade), r = _rota(empresaId, entidade, k, true);
      if (r === "trancada") return false;
      if (r === "nova") { _casaMarcar(empresaId, entidade); r = "idb"; }
      if (r === "idb") { _discoGravar(k, raw == null ? null : String(raw), empresaId, entidade); return true; }
      try { if (raw == null) localStorage.removeItem(k); else localStorage.setItem(k, String(raw)); return true; } catch (e) { return false; }
    },
    /* onde cada coisa está, para a Saúde do armazenamento e o suporte */
    discoEstado: function (empresaId) {
      var pre = chave(empresaId, ""), ent = [], kb = 0, sob = [];
      Object.keys(_d.esp).forEach(function (k) {
        var e = _d.esp[k];
        if (!e || e.raw == null || k.indexOf(pre) !== 0) return;
        if (k.indexOf(SUFIXO_SOBRA) > 0) { sob.push({ chave: k, kb: Math.round(e.raw.length / 1024) }); return; }
        var m = RE_CHAVE_ENT.exec(k);
        if (!m || !_casa(m[1], false)[m[2]]) return;
        kb += e.raw.length;
        ent.push({ chave: m[2], kb: Math.round(e.raw.length / 1024) });
      });
      ent.sort(function (a, b) { return b.kb - a.kb; });
      var pend = Object.keys(_d.pendentes).filter(function (k) { return k.indexOf(pre) === 0; }).map(function (k) { return _d.pendentes[k]; });
      var tr = Object.keys(_d.trancadas).filter(function (k) { return k.indexOf(pre) === 0; }).map(function (k) { return _d.trancadas[k].entidade; });
      return { ativo: _d.ok === true, completo: _d.completo, migracaoLigada: _migracaoLigada(),
        persistente: _d.persistente === true ? true : (_d.persistente === false ? false : null),
        tamanhoKB: Math.round(kb / 1024), entidades: ent.length, maiores: ent.slice(0, 5),
        pendentes: pend, trancadas: tr, sobras: sob,
        migradas: _d.migradas.filter(function (x) { return x.empresaId === String(empresaId || "default"); }),
        falhas: _d.falhas.filter(function (x) { return x.empresaId === String(empresaId || "default"); }) };
    },
    /* quanto o navegador deu e quanto já foi usado (estimativa da ORIGEM
       inteira: banco, bases SINAPI, fotos e cache do BIM no mesmo balde).
       `null` = o navegador não sabe responder. */
    espaco: function () {
      try {
        var st = global.navigator && global.navigator.storage;
        if (!st || !st.estimate) return Promise.resolve(null);
        return st.estimate().then(function (e) {
          if (!e || typeof e.quota !== "number" || !(e.quota > 0)) return null;
          return { cota: e.quota, usado: e.usage || 0, pct: Math.round((e.usage || 0) / e.quota * 100) };
        }, function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    },

    // Prime o cache em memória dos blobs grandes (chamar no boot antes de ler a base).
    initBigStore: function (empresaId) {
      if (_bigInit[empresaId]) return _bigInit[empresaId];
      _bigInit[empresaId] = Promise.all(BIG.map(function (ent) { return primeUma(empresaId, ent); })).then(function () { return true; });
      return _bigInit[empresaId];
    },
    _bigGet: function (empresaId, entidade) { return _big[chave(empresaId, entidade)]; },
    _bigSet: function (empresaId, entidade, valor) {
      var k = chave(empresaId, entidade);
      _big[k] = valor; // espelho síncrono (vale nesta sessão mesmo se o IDB falhar)
      // LOTE 1: devolve Promise<bool> amarrada ao COMMIT real do IndexedDB
      // (Idb.set agora resolve no tx.oncomplete) e avisa o usuário na falha —
      // antes retornava true incondicional e a falha morria no console.
      var p = idbHas() ? Idb.set(k, valor) : Promise.reject(new Error("IndexedDB indisponível"));
      p = p.then(function () { return true; }).catch(function (e) {
        console.error("[store] FALHA ao persistir " + entidade + ":", e && e.message);
        try {
          if (global.UI && global.UI.toast) global.UI.toast("⚠ Não consegui salvar \"" + entidade + "\" no disco — os dados valem só até fechar o app. Faça 💾 Backup agora!", "erro");
        } catch (e2) {}
        return false;
      });
      try { localStorage.removeItem(k); } catch (e) {} // nunca deixa cópia grande no localStorage
      return p;
    },
    _bigDel: function (empresaId, entidade) {
      var k = chave(empresaId, entidade); delete _big[k];
      if (idbHas()) Idb.del(k).catch(function () {});
      try { localStorage.removeItem(k); } catch (e) {}
    },

    usarFirebase: function (firebaseAdapter) {
      // Ponto de extensão para o SaaS. Implementar ler/gravar/apagar async-compat.
      this.adapter = firebaseAdapter;
    },

    // ----- Orçamentos -----
    listarOrcamentos: function (empresaId) {
      /* "lista": um objeto no lugar da lista também é ilegível (ver `_abre`) */
      var lista = this.adapter.ler(empresaId, "orcamentos", [], "lista");
      lista = Util.arr(lista).map(migrarOrcamento);
      return lista;
    },

    /* ---- Conteúdo ilegível no disco (ver a nota da quarentena, no topo) ----
       Adapter sem quarentena (um FirebaseAdapter futuro) responde "nada". */
    ilegivel: function (empresaId, entidade) {
      return (this.adapter && this.adapter.ilegivel) ? this.adapter.ilegivel(empresaId, entidade) : null;
    },
    ilegiveis: function (empresaId) {
      return (this.adapter && this.adapter.ilegiveis) ? this.adapter.ilegiveis(empresaId) : [];
    },
    quarentenas: function (empresaId) {
      return (this.adapter && this.adapter.quarentenas) ? this.adapter.quarentenas(empresaId) : [];
    },
    /* a forma de leitura de cada entidade, a mesma da leitura normal: a porta
       tem de concordar com quem marcou */
    _FORMA_LEITURA: FORMA_PADRAO,
    liberarIlegivel: function (empresaId, entidade) {
      if (!(this.adapter && this.adapter.liberar)) return { ok: true, nada: true };
      return this.adapter.liberar(empresaId, entidade, this._FORMA_LEITURA[entidade]);
    },
    /* Confere de uma vez as entidades que ninguém leu ainda nesta sessão (o
       boot só lê o que a primeira tela usa). Quem já foi lido tem a marca em
       dia e não é relido — é JSON.parse de lista inteira. */
    verificarIlegiveis: function (empresaId, entidades) {
      var self = this, a = this.adapter;
      if (!(a && a.ilegiveis)) return [];
      Util.arr(entidades).forEach(function (ent) {
        if (!ent || (a.jaLida && a.jaLida(empresaId, ent))) return;
        try { a.ler(empresaId, ent, null, self._FORMA_LEITURA[ent]); } catch (e) {}
      });
      return this.ilegiveis(empresaId);
    },
    /* =====================================================================
     * O RECADO DO CONTEÚDO ILEGÍVEL — texto puro (UI.toast usa textContent).
     * Diz o que aconteceu, que nada foi apagado, onde está a cópia e o que
     * fazer. `opts.recusou`: uma gravação acabou de ser recusada; `opts.rotulo`:
     * o que era; `opts.aberto`: há um orçamento aberto na tela (ele só existe
     * ali, e o Excel o devolve inteiro); `opts.admin === false`: quem restaura
     * backup é o administrador.
     * ===================================================================== */
    /* o nome que a PESSOA lê para cada entidade. O recado mostrava a chave
       técnica ("Pronto: orcamentos recomeçou", "Os dados de \"medicoes\"") —
       revisão adversarial da 1.2.81. Entidade fora do mapa sai com a chave,
       que ainda é melhor que nada. */
    _NOME_ENT: { orcamentos: "Orçamentos", financeiro: "Financeiro", medicoes: "Medições", obras: "Obras",
      compras: "Compras", contratos: "Contratos", clientes: "Clientes", fornecedores: "Fornecedores",
      requisicoes: "Requisições", rdo: "Diário de Obra", colaboradores: "Equipe", estoque: "Almoxarifado",
      crono_obra: "Cronograma da obra", aditivos: "Termos aditivos", _lapides: "registro de exclusões",
      /* as duas entidades novas do planejador (Onda 0, T10): o recado da
         quarentena diz o nome que a pessoa reconhece, não a chave técnica */
      crono_selo: "Linhas de base seladas", crono_alt: "Histórico de alterações do cronograma",
      /* as maiores listas, para a Saúde do armazenamento (10/10/2026) */
      bim_vistas: "Pontos de vista do BIM", composicoes_proprias: "Composições próprias", prop_modelos: "Modelos de proposta",
      bim_pranchas: "Pranchas do projeto", cotacoes: "Cotações", centrocusto: "Centros de custo", fiscal: "Notas fiscais",
      obra_docs: "Documentos da obra", familias: "Famílias", bim_icamento: "Plano de içamento", fs_lancamentos: "Folha semanal",
      batidas: "Ponto (batidas)", estoque_mov: "Movimento do almoxarifado", templates: "Modelos", _syncmarcas: "marcas da sincronização" },
    nomeEntidade: function (entidade) {
      var e = String(entidade == null ? "" : entidade);
      if (e === "orcamentos") return "lista de orçamentos";
      return Object.prototype.hasOwnProperty.call(this._NOME_ENT, e) ? this._NOME_ENT[e] : e;
    },
    recadoIlegivel: function (info, opts) {
      info = info || {}; opts = opts || {};
      var orc = info.entidade === "orcamentos";
      var kb = Math.max(1, Math.round((Number(info.bytes) || 0) / 1024));
      var txt = (orc ? "A lista de orçamentos gravada neste aparelho está ilegível"
                     : "Os dados de \"" + Store.nomeEntidade(info.entidade || "?") + "\" gravados neste aparelho estão ilegíveis") +
        " (arquivo corrompido)";
      if (opts.recusou) {
        txt += ", e por isso " + (opts.rotulo ? "a sua última alteração (" + String(opts.rotulo).replace(/[.\s]+$/, "") + ")" : "a sua última alteração") +
          " NÃO foi gravada: gravar agora apagaria " + (orc ? "os outros orçamentos" : "os outros registros") +
          ", que ainda estão " + (orc ? "dentro dela" : "dentro deles") + ".";
      } else {
        txt += ". Nada foi apagado, e nada " + (orc ? "de orçamento " : "") + "é gravado aqui enquanto isso: gravar por cima apagaria o que ainda está " + (orc ? "dentro dela" : "dentro deles") + ".";
      }
      txt += info.copiaOk
        ? " Uma cópia do conteúdo ilegível (" + kb + " KB) foi guardada à parte neste aparelho."
        : " NÃO houve espaço para guardar uma cópia à parte (" + kb + " KB): não limpe os dados do navegador.";
      var antes = "";
      try {
        var d = info.desde ? new Date(info.desde) : null;
        var p2 = function (x) { return (x < 10 ? "0" : "") + x; };
        if (d && !isNaN(d.getTime())) antes = " de antes de " + p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
      } catch (eD) { antes = ""; }
      txt += opts.admin === false
        ? " O que fazer: avise o administrador da conta — só ele pode restaurar o backup."
        : " O que fazer: abra 💾 Backup e restaure o backup mais recente" + antes + " (a restauração guarda o conteúdo ilegível e refaz " + (orc ? "a lista" : "os dados") + " a partir do arquivo).";
      if (opts.aberto) txt += " Antes de fechar este orçamento, exporte o Excel dele (aba Planilha): \"Recuperar de uma planilha\" o devolve inteiro.";
      return txt;
    },

    /* =====================================================================
     * ⚠ TRAVA DE CARIMBO (compare-and-set) — DUAS JANELAS NÃO SE APAGAM MAIS
     *
     * O DEFEITO, reproduzido com teclado real em duas abas do mesmo navegador
     * (14/09/2026, 1.2.77): as duas abrem o mesmo orçamento; a aba B grava a
     * duração da etapa 1 = 23; a aba A, aberta antes, grava a etapa 2 = 17 — e
     * o disco fica com {e2:17}: o 23 de B SUMIU, calado. Vale Gantt × Gantt,
     * Planilha × Gantt e Gantt × Planilha. E pior: B exclui o orçamento, A
     * edita qualquer coisa e o orçamento EXCLUÍDO VOLTA ({existe:false} →
     * {existe:true}), em todos os aparelhos, porque o carimbo novo vence a
     * lápide no merge da nuvem. A nuvem não salva nada: a versão perdida
     * nunca chega ao Firestore (o push lê o disco na hora de mandar).
     * A causa: `abrirOrcamento` carrega o objeto UMA vez e esta função trocava
     * o registro inteiro pelo da memória, sem conferir nada. O mesmo furo
     * existe entre dois aparelhos (a nuvem grava o merge e não troca o aberto).
     *
     * A REGRA: só grava quem partiu da versão que está no disco. O chamador
     * leu o registro com um carimbo (`atualizadoEm`); se o disco não tem mais
     * esse carimbo, alguém gravou por cima desde então, e esta gravação
     * apagaria o trabalho do outro. Recusa, devolve null e diz por quê em
     * `Store.ultimaRecusa` — quem chamou mostra o recado e relê a tela.
     *
     * ⚠ COMPARA ANTES DE CARIMBAR. A linha que carimbava "agora" era a
     *   primeira da função. Se ela continuar antes da comparação, o objeto
     *   velho ganha carimbo novo NA MEMÓRIA mesmo recusado, a gravação
     *   seguinte passa, e a trava vira decoração. Por isso a recusa não toca
     *   em `orc.atualizadoEm` (assert próprio em tools/test-store-cas.js).
     *
     * ⚠ IGUALDADE (!==), E NÃO "O DISCO É MAIS NOVO" (>). A prova do desenho
     *   usou `>`, e ele deixa passar dois casos reais: (a) restaurar backup
     *   grava com `manterCarimbo` um carimbo MAIS ANTIGO — a janela que ficou
     *   com o editor aberto sobrescreveria o backup recém-restaurado; (b) o
     *   relógio de outro aparelho atrasado, trazido pelo merge da nuvem.
     *
     * ⚠ A BRECHA QUE SOBRA: o `localStorage` não tem trava entre processos do
     *   navegador. Duas abas que gravam no mesmo instante (dentro do atraso de
     *   sincronização entre elas, ou no mesmo milissegundo de carimbo) podem
     *   as duas ler o disco antigo e passar. Em edição de gente, na velocidade
     *   de gente, isso não acontece; ficou anotado para não ser vendido como
     *   garantia absoluta.
     *
     * `manterCarimbo` (backup, pacote) é isento: é dado recebido, gravado de
     * propósito com o carimbo dele. O merge da nuvem grava por
     * `adapter.gravar` direto (js/nuvem.js), fora daqui — a trava não bloqueia
     * o que desce da nuvem, e é isso que se quer.
     *
     * `opts.baseEm`: o carimbo que o CHAMADOR leu do disco nesta mesma pilha,
     * para quem grava de propósito uma versão antiga (desfazer da IA,
     * restaurar retrato): quando vem, é ele que se compara.
     *
     * Rollback: `Store.CAS_ATIVO = false` (a forma no disco não mudou; nada a
     * migrar). ⚠ A janela destacada (F8) exige `CAS_ATIVO === true`.
     * ===================================================================== */
    CAS_ATIVO: true,
    /* {tipo:"conflito"|"apagado"|"incerto"|"corrompido", id, numero, base, discoEm, lapideEm}
       ("corrompido" vem da quarentena, não da trava: vale mesmo com
       `CAS_ATIVO` desligado e com `manterCarimbo`; traz `quarentena`,
       `copiaOk` e `bytes`)
       — null depois de toda gravação que não foi recusada pela trava. `null`
       devolvido com `ultimaRecusa === null` continua sendo falha do
       armazenamento (cota cheia), como sempre foi. */
    ultimaRecusa: null,

    /* ⚠ `manterCarimbo` existe para DUAS razões (a segunda é do planejador
       1A; a primeira era a única até aqui, e o comentário dizia "UM caso"
       enquanto o `js/gestao.js:11112` já usava a segunda por outro motivo):

       1) RESTAURAR BACKUP. O registro que vem
       do arquivo tem que entrar com o atualizadoEm DELE — carimbar "agora" num
       conteúdo de semana passada faz o merge da nuvem tratar o retrocesso como
       a versão mais recente e propagá-lo para os outros aparelhos.

       2) O CARIMBO FRACO DE UMA GRAVAÇÃO AUTOMÁTICA (planejador 1A, E-MC4).
       O canal das medições grava avanço sozinho, na aprovação do boletim, sem
       ninguém na tela. Essa gravação precisa PERDER para qualquer edição que
       uma pessoa tenha feito depois da última marca de sync: o número que
       alguém digitou olhando a obra vale mais que o que o sistema deduziu de
       um boletim. Por isso o `CronoBase.salvarAvanco` calcula um
       `atualizadoEm` de 1 ms depois da marca — e não "agora" — e pede
       `manterCarimbo` para que ele chegue ao disco. Com o carimbo de agora, a
       automática venceria a humana no merge, e o lançamento da pessoa sumiria
       sem aviso (o roteiro está em tools/test-crono-obra-sync.js [13]).
       ⚠ Quem grava com carimbo fraco NUNCA pode recarimbar depois: veja
         `App._cronoGravarLista`.

       Fora essas duas, o carimbo é sempre agora — o comportamento padrão. */
    salvarOrcamento: function (empresaId, orc, manterCarimbo, opts) {
      this.ultimaRecusa = null;
      var lista = this.listarOrcamentos(empresaId);
      /* ⚠ LISTA ILEGÍVEL NO DISCO → RECUSA (ver a nota da quarentena, no
         topo). `lista` aqui é o `[]` de quem não conseguiu ler: gravar — até
         com `manterCarimbo`, que é o backup — apagaria todos os outros
         orçamentos. Vem ANTES da trava de carimbo e ANTES de carimbar, pelo
         mesmo motivo de lá ("COMPARA ANTES DE CARIMBAR"). A porta é
         `liberarIlegivel`, que a restauração do backup chama. */
      var ileg = this.ilegivel(empresaId, "orcamentos");
      if (ileg && ileg.bloqueia) {
        this.ultimaRecusa = { tipo: "corrompido", entidade: "orcamentos", id: orc && orc.id, numero: (orc && orc.numero) || "",
          base: String(orc && orc.atualizadoEm != null ? orc.atualizadoEm : ""),
          quarentena: ileg.quarentena, copiaOk: ileg.copiaOk, bytes: ileg.bytes, em: ileg.em, desde: ileg.desde };
        try { console.warn("[store] gravação do orçamento " + (orc && orc.id) + " RECUSADA (corrompido): a lista do disco está ilegível e seria apagada."); } catch (eW) {}
        return null;
      }
      var idx = -1;
      for (var i = 0; i < lista.length; i++) { if (orc && lista[i] && lista[i].id === orc.id) { idx = i; break; } }
      if (this.CAS_ATIVO === true && !manterCarimbo && orc) {
        var recusa = null, base = null;
        /* ⚠ NA DÚVIDA, RECUSA: a trava não pode derrubar a gravação com uma
           exceção, e também não pode deixar passar o que não conseguiu
           conferir — passar calado é exatamente o defeito que ela fecha. */
        try {
          base = (opts && opts.baseEm !== undefined) ? opts.baseEm : orc.atualizadoEm;
          if (idx >= 0) {
            if (String(lista[idx].atualizadoEm || "") !== String(base || "")) {
              recusa = { tipo: "conflito", discoEm: String(lista[idx].atualizadoEm || "") };
            }
          } else if (base) {
            /* não está no disco, mas o objeto já foi lido de lá um dia (tem
               carimbo) e há lápide: foi excluído depois que esta tela o abriu.
               Orçamento NOVO não tem lápide (id novo) e passa. */
            var lp = this.lapidesDe(empresaId, "orcamentos");
            if (lp[orc.id] !== undefined) recusa = { tipo: "apagado", lapideEm: String(lp[orc.id] || "") };
          }
        } catch (eCas) {
          recusa = { tipo: "incerto", erro: String((eCas && eCas.message) || eCas) };
        }
        if (recusa) {
          recusa.id = orc.id; recusa.numero = orc.numero || ""; recusa.base = String(base == null ? "" : base);
          this.ultimaRecusa = recusa;
          try { console.warn("[store] gravação do orçamento " + orc.id + " RECUSADA (" + recusa.tipo + "): esta tela partiu de " + recusa.base + " e o disco tem " + (recusa.discoEm || (recusa.lapideEm ? "lápide de " + recusa.lapideEm : "?"))); } catch (eW) {}
          return null;   // ⚠ sem carimbar: ver "COMPARA ANTES DE CARIMBAR"
        }
      }
      /* ⚠ GRAVAÇÃO QUE FALHA DEVOLVE O CARIMBO. O carimbo "agora" vai para o
         objeto ANTES de o adapter gravar (é ele que vai para o disco). Se a
         gravação falha — cota cheia, `QuotaExceededError` —, o disco fica com
         o carimbo antigo e a memória com o novo; e a trava, na gravação
         seguinte, compara os dois e recusa como "outra janela".
         Roteiro medido na revisão da F1 (14/09/2026), UMA janela só, teclado
         real: e1=23 + Tab com a cota cheia (abre o Backup), a pessoa libera
         espaço, e2=17 + Tab → recusa "alterado em outra janela (ou em outro
         aparelho)", a releitura troca a tela pelo disco e as DUAS edições
         somem (disco {e1:10, e2:11}). Na 1.2.77 o mesmo roteiro gravava
         {e1:23, e2:17}. Assert em tools/test-store-cas.js [7b] e na
         e2e-duas-janelas [8]. */
      var carimboAntes = orc.atualizadoEm, tinhaCarimbo = Object.prototype.hasOwnProperty.call(orc, "atualizadoEm");
      if (!(manterCarimbo && orc && orc.atualizadoEm)) orc.atualizadoEm = Util.agoraISO();
      if (idx >= 0) lista[idx] = orc; else lista.push(orc);
      /* o LocalAdapter pega a exceção do setItem e devolve false; o embrulho do
         Nuvem._patch devolve o mesmo `ok`. Por isso a falha chega aqui como
         valor, e não como exceção — e não se põe `try` que devolveria o
         carimbo de uma gravação que CHEGOU ao disco. */
      var ok = this.adapter.gravar(empresaId, "orcamentos", lista);
      if (!ok) {
        if (tinhaCarimbo) orc.atualizadoEm = carimboAntes; else delete orc.atualizadoEm;
      }
      return ok ? orc : null; // null = falhou ao gravar (cota cheia) — caller deve avisar
    },

    obterOrcamento: function (empresaId, id) {
      var lista = this.listarOrcamentos(empresaId);
      for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
      return null;
    },

    /* ---- Preços de insumo informados PELO USUÁRIO ----
     * O SINAPI publica em branco o que não coletou na região. Quando isso
     * acontece, o usuário cota e informa o preço dele — que fica guardado por
     * EMPRESA (código do insumo → preço) e vale para toda composição que usa o
     * insumo. É cotação própria: os entregáveis marcam "informado por você".
     *
     * ⚠ v1.2 — ISTO NÃO SINCRONIZAVA E NÃO ENTRAVA NO BACKUP. Guardado como
     *   MAPA, ficava preso no aparelho onde nasceu (ver a nota de FORMAS lá
     *   em cima). Agora o disco guarda uma LISTA — `id` = código do insumo,
     *   determinístico, para o merge por id casar o mesmo insumo nos dois
     *   aparelhos — e a entidade entrou em `Nuvem.ENTIDADES`, o que também a
     *   põe no backup (o `App._dumpGestao` deriva a lista de lá).
     *
     * ⚠ A SAÍDA CONTINUA SENDO MAPA, DE PROPÓSITO. Três leitores consomem
     *   `meus[codigo].preco` (js/app.js `_cpResolve`, js/ui.js
     *   `_insumosSemPrecoDe` e o detalhamento do analítico). Trocar a forma
     *   de armazenamento é o conserto; arrastar três telas junto seria a
     *   refatoração ampla que o manual da casa proíbe num defeito de dado. */
    precosInsumos: function (empresaId) {
      var l = this.listar(empresaId, "precosinsumos"), m = {};
      for (var i = 0; i < l.length; i++) {
        var r = l[i];
        if (!r || r.id == null) continue;
        if (!(Number(r.preco) > 0)) continue;   // registro zerado não é cotação
        m[String(r.id)] = { preco: Number(r.preco), em: String(r.em || r.atualizadoEm || "") };
      }
      return m;
    },
    salvarPrecoInsumo: function (empresaId, codigo, preco) {
      var cod = String(codigo);
      /* ⚠ APAGAR TEM DE LAPIDAR. Antes era `delete m[cod]` no mapa. Virando
         entidade sincronizada, exclusão sem lápide é o defeito da v1.1.126 de
         volta: o merge une as listas por id e o outro aparelho devolveria a
         cotação apagada — para sempre, porque ele a reempurra a cada sync.
         `excluir` grava a lápide que o merge consulta. */
      if (preco == null || !(Number(preco) > 0)) {
        this.excluir(empresaId, "precosinsumos", cod);
        return null;
      }
      var reg = this.obter(empresaId, "precosinsumos", cod) || { id: cod };
      reg.codigo = cod;
      reg.preco = Math.round(Number(preco) * 100) / 100;
      reg.em = Util.agoraISO();               // quando o usuário cotou (o que a tela mostra)
      /* `salvar` é quem carimba `atualizadoEm`/`criadoEm` — os campos que o
         merge da nuvem e a restauração do backup comparam. `em` sozinho não
         serve: a restauração compararia `"" >= ""` e não gravaria nada. */
      return this.salvar(empresaId, "precosinsumos", reg) ? { preco: reg.preco, em: reg.em } : null;
    },

    /* LÁPIDES (v1.1.126) — o merge da nuvem une as listas por id, então um registro
     * apagado num aparelho VOLTAVA quando o outro aparelho sincronizava a lista antiga.
     * Toda exclusão passa a deixar uma lápide (entidade + id + quando), que a nuvem
     * sincroniza e usa para descartar o ressuscitado. Guarda as 3.000 mais recentes. */
    _LAPIDES_MAX: 3000,
    /* Entidades IMUNES à cascata de obra: são cadastros da EMPRESA que a exclusão apenas
     * DESVINCULA (perdem o obraId e continuam na lista). Sem esta lista o merge da nuvem
     * lia "obraId aponta pra obra morta" e apagava o colaborador/veículo/bem no outro
     * aparelho — exatamente o que o modal promete preservar. Achado do gate de 25/07. */
    /* "fiscal" entrou junto: a nota fiscal passou a ser vinculada a obra na
       triagem, e o merge da nuvem apagaria o DOCUMENTO ao ver o obraId de uma
       obra excluida — documento que a empresa e obrigada a guardar 5 anos. */
    /* v1.1.231 — folha, ponto e movimento de frota entram aqui junto com a
       correção da sincronização. Enquanto não sincronizavam, a cascata não os
       alcançava e o problema não existia; passando a sincronizar, o merge
       leria "obraId aponta pra obra morta" e apagaria PAGAMENTO FEITO e CARTÃO
       DE PONTO no outro aparelho. É o mesmo motivo que já mantém `faltas`
       fora da cascata: jornada e dinheiro são de PESSOA, não da obra — a obra
       some, o que se deve a alguém não some junto.
       ⚠ ESTA FRASE CITAVA `horas_extras` COMO SE ELA JÁ ESTIVESSE PROTEGIDA, E
       NÃO ESTAVA. `faltas` está a salvo por acidente — ela não grava `obraId`
       (js/gestao.js grava só colaboradorId/data/motivo), então o `vivo()` do
       merge nunca a olha. `horas_extras` GRAVA obraId, sincroniza, e não estava
       em lista nenhuma: era apagada em todos os aparelhos quando a obra era
       excluída, calada, sem nem aparecer no modal de vínculos. Entrou na lista
       abaixo na v1.2. A analogia protegia a entidade errada. */
    /* ⚠ `remun_apur` e `carp_propostas` ENTRARAM AQUI PORQUE SINCRONIZAM E
       CARREGAM `obraId` — e essa combinação, sem imunidade, apaga sozinha.
       A exclusão local nem tocava nelas (não estavam na cascata da tela), mas
       o merge da nuvem via "obraId aponta pra obra morta" e as apagava em
       TODOS os aparelhos, no sync seguinte, calado.
       O que sumiria: a apuração da parte variável JÁ PAGA — que é a única
       fonte que `_jaPagoProducao` consulta para o mesmo m² não ser pago duas
       vezes — e a proposta FECHADA, que é o preço que o cliente assinou.
       Mesma doutrina de `folha` e `ponto`: dinheiro é de PESSOA e documento
       assinado é da EMPRESA; a obra some, eles perdem o vínculo, não a
       existência. ⚠ Quem está aqui tem de estar em `_ENT_SO_DESVINCULA` e
       NUNCA em `_ENT_DA_OBRA` — as duas listas ao mesmo tempo foi o defeito
       que a v1.1.236 consertou. */
    /* ⚠ a ÚLTIMA linha da lista é âncora do controle negativo do
       test-crono-obra-sync (ele acrescenta `crono_obra` nela): entrada nova
       entra numa linha de CIMA. `obra_docs` = documento do arquivo da obra
       (contrato, ART, memorial assinado). */
    _IMUNES_CASCATA: { colaboradores: 1, patrimonio: 1, frota: 1, fiscal: 1, obra_docs: 1,
                       folha: 1, fs_lancamentos: 1, fs_pagamentos: 1, ponto: 1, frota_mov: 1,
                       remun_apur: 1, carp_propostas: 1, horas_extras: 1 },
    imuneACascata: function (entidade) { return !!this._IMUNES_CASCATA[entidade]; },
    /* A lápide só serve para o merge da nuvem: entidade que NÃO sincroniza nunca ressuscita,
     * e gravar lápide dela só gastava o teto — empurrando para fora as que importam. */
    _sincroniza: function (entidade) {
      var L = (typeof Nuvem !== "undefined" && Nuvem.ENTIDADES) ? Nuvem.ENTIDADES : null;
      return L ? L.indexOf(entidade) >= 0 : true; // sem a lista carregada, erra pelo lado seguro
    },
    lapidar: function (empresaId, entidade, id) {
      if (!empresaId || !entidade || !id) return;
      if (!this._sincroniza(entidade)) return;
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        this._porLapide(l, { id: entidade + ":" + id, ent: entidade, ref: String(id), em: Util.agoraISO() });
        this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l));
      } catch (e) {}
    },
    /* =====================================================================
     * DESFAZER A LÁPIDE — restaurar backup tem de desfazer a exclusão
     *
     * ⚠ SEM ISTO, RESTAURAR BACKUP PARA DESFAZER UMA EXCLUSÃO NÃO FUNCIONA —
     *   e desfazer exclusão é A razão pela qual alguém restaura backup.
     *   O registro volta ao disco, a tela diz "1 restaurado(s)", e no PRIMEIRO
     *   SYNC ele some de novo: a lápide local sobrevive à restauração
     *   (`_lapides` está fora do backup, de propósito), e o `vivo()` do merge
     *   compara o carimbo do registro com o da lápide. Como a restauração
     *   passou a manter o carimbo DO ARQUIVO — que é mais antigo que a
     *   exclusão —, o merge conclui "isto foi apagado depois" e remove. Pior:
     *   grava o resultado e empurra o sumiço para todos os aparelhos.
     *   "Restaurei o backup e sumiu de novo" é o pior formato possível.
     *
     * Antes da v1.2 isso funcionava por ACIDENTE: a restauração carimbava
     * "agora", o registro ficava mais novo que a lápide e vencia. O carimbo
     * do arquivo é o comportamento certo (senão o backup velho vence o
     * trabalho recente dos outros aparelhos) — então a exclusão precisa ser
     * desfeita explicitamente, que é o que esta função faz.
     * ===================================================================== */
    desenterrar: function (empresaId, entidade, ids) {
      if (!empresaId || !entidade || !ids || !ids.length) return 0;
      try {
        var alvo = {};
        Util.arr(ids).forEach(function (id) { if (id) alvo[entidade + ":" + String(id)] = 1; });
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        var restou = l.filter(function (t) { return !(t && alvo[t.id]); });
        if (restou.length === l.length) return 0;
        /* gravação recusada (lápides ilegíveis, cota): não desenterrou nada */
        if (this.adapter.gravar(empresaId, "_lapides", restou) === false) return 0;
        return l.length - restou.length;
      } catch (e) { return 0; }
    },
    /* Uma obra apagada em cascata deixa UMA lápide, não uma por registro: a cascata de uma
     * obra de 1 ano passa de 2.000 registros e o teto expulsava justamente as lápides das
     * entidades que sincronizam (elas vinham primeiro) — os diários e medições voltavam da
     * nuvem órfãos, com a obra já apagada. Achado do gate de 25/07. */
    lapidarObraEmCascata: function (empresaId, obraId) {
      if (!empresaId || !obraId) return;
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        this._porLapide(l, { id: "cascata:obra:" + obraId, cascata: "obra", ref: String(obraId), em: Util.agoraISO() });
        this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l));
      } catch (e) {}
    },
    /* ⚠ MESMO PROBLEMA DA OBRA, NOUTRA ESCALA. Um teste de compatibilização
     * guarda MILHARES de conflitos (1.372 numa rodada real de um modelo só).
     * Excluí-lo gravava uma lápide por conflito, estourava o `_LAPIDES_MAX` e
     * expulsava as lápides das OUTRAS entidades — que voltavam da nuvem,
     * ressuscitando exclusões que nada tinham a ver com compatibilização.
     * Uma lápide de cascata cobre o lote e é imune à poda (`_podarLapides`
     * nunca descarta o que tem `.cascata`). */
    lapidarClashTesteEmCascata: function (empresaId, testeId) {
      if (!empresaId || !testeId) return;
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        this._porLapide(l, { id: "cascata:clashteste:" + testeId, cascata: "clashteste", ref: String(testeId), em: Util.agoraISO() });
        this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l));
      } catch (e) {}
    },
    /* ⚠ A PODA APAGA UM SUBCONJUNTO, e por isso não pode usar a lápide do
     * teste — ela cobriria TODOS os conflitos dele, inclusive os que ficaram.
     * E não pode gravar uma lápide por registro: podar 1.372 comeria metade
     * do `_LAPIDES_MAX` e expulsaria as lápides das outras entidades, que é
     * exatamente o defeito que a cascata do teste veio consertar.
     *
     * Então: UMA lápide para o lote, com a lista de ids dentro. Ela é imune à
     * poda (tem `.cascata`), e o merge da nuvem consulta o conjunto de ids —
     * sem isso o registro podado voltaria do outro aparelho no próximo sync e
     * a limpeza se desfaria sozinha, que é pior que não ter limpado. */
    lapidarClashPodaEmCascata: function (empresaId, testeId, ids) {
      if (!empresaId || !Util.arr(ids).length) return;
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        var agora = Util.agoraISO();
        /* uma lápide por PODA, não por teste: podar duas vezes o mesmo teste
           tem de somar, não substituir.
           ⚠ O CARIMBO NÃO BASTAVA COMO IDENTIDADE. O id era
           "cascata:clashpoda:<teste>:<agoraISO>", e `agoraISO` tem resolução
           de milissegundo: duas podas no mesmo milissegundo geram o MESMO id,
           `_porLapide` sobrescreve, e os conflitos da primeira poda voltam da
           nuvem no sync seguinte. Não é hipótese — foi assim que a suíte da
           cascata ficou vermelha, com duas chamadas seguidas caindo no mesmo
           milissegundo nesta máquina. */
        var idL = Util.uid("cascata:clashpoda:" + String(testeId));
        this._porLapide(l, {
          id: idL, cascata: "clashpoda", ref: String(testeId),
          ids: Util.arr(ids).map(String), em: agora
        });
        this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l));
      } catch (e) {}
    },
    /* =====================================================================
     * ⚠ LÁPIDE DE LOTE — UMA LÁPIDE PARA N REGISTROS DE QUALQUER ENTIDADE
     *   (ESPEC-medicao-cc §1.12-4, T-MC10)
     *
     * O problema é o mesmo da cascata do teste de compatibilização, agora
     * sem um "pai" para pendurar a lápide: apagar 1.500 decisões de
     * apropriação, compactar decisões repetidas em regra, limpar as órfãs de
     * documentos excluídos ou mover um lote para outro centro grava, pelo
     * caminho normal, UMA LÁPIDE POR REGISTRO. O bloco `_lapides` tem teto
     * (`_LAPIDES_MAX = 3000`) e a poda expulsa as MAIS ANTIGAS de QUALQUER
     * entidade: a limpeza de um módulo ressuscita a exclusão de outro, e o
     * lançamento financeiro que alguém apagou semana passada volta da nuvem
     * sem nada na tela ligando uma coisa à outra.
     *
     * ⚠ E NÃO DÁ PARA SIMPLESMENTE NÃO GRAVAR LÁPIDE: sem ela o registro
     *   volta do outro aparelho no primeiro sync e a limpeza se desfaz
     *   sozinha — pior que não ter limpado, porque quem limpou conta com o
     *   espaço liberado.
     *
     * Então: uma lápide com a lista de ids dentro, `cascata:"lote"` (imune à
     * poda, ver `_podarLapides`) e o nome da entidade, que o `vivo()` do
     * merge consulta para QUALQUER entidade. Mesmo molde do
     * `lapidarClashPodaEmCascata`, inclusive o id por `Util.uid`: um id
     * derivado do carimbo colide quando dois lotes caem no mesmo
     * milissegundo, o `_porLapide` sobrescreve e os ids do primeiro lote
     * voltam da nuvem — foi assim que a suíte da cascata ficou vermelha.
     *
     * Devolve quantos ids entraram na lápide (0 se não gravou).
     * ===================================================================== */
    lapidarLote: function (empresaId, entidade, ids, motivo) {
      var lst = Util.arr(ids).filter(function (i) { return i != null && i !== ""; }).map(String);
      if (!empresaId || !entidade || !lst.length) return 0;
      /* entidade que não sincroniza nunca ressuscita: a lápide dela só
         gastaria o teto (mesma regra do `lapidar`) */
      if (!this._sincroniza(entidade)) return 0;
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        this._porLapide(l, {
          id: Util.uid("cascata:lote:" + String(entidade)), cascata: "lote",
          ent: String(entidade), ids: lst, em: Util.agoraISO(),
          /* o motivo é diagnóstico, não regra — cortado para não crescer o
             documento que todas as entidades dividem na nuvem */
          mot: String(motivo == null ? "" : motivo).slice(0, 40)
        });
        if (this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l)) === false) return 0;
        return lst.length;
      } catch (e) { return 0; }
    },
    /* registros apagados em lote: { idDoRegistro: quando }, por entidade */
    cascatasDeLote: function (empresaId, entidade) {
      var m = Object.create(null), alvo = String(entidade || "");
      try {
        Util.arr(this.adapter.ler(empresaId, "_lapides", [])).forEach(function (t) {
          if (!t || t.cascata !== "lote" || String(t.ent || "") !== alvo) return;
          /* dois lotes da mesma entidade SOMAM: o mais recente vence no id
             repetido, senão apagar em dois lotes perderia metade */
          Util.arr(t.ids).forEach(function (id) {
            if (!id) return;
            var q = t.em || "";
            if (!m[id] || String(q) > String(m[id])) m[id] = q;
          });
        });
      } catch (e) {}
      return m;
    },
    /* conflitos podados: { idDoRegistro: quando } */
    cascatasDeClashPoda: function (empresaId) {
      var m = Object.create(null);
      try {
        Util.arr(this.adapter.ler(empresaId, "_lapides", [])).forEach(function (t) {
          if (!t || t.cascata !== "clashpoda") return;
          Util.arr(t.ids).forEach(function (id) { if (id) m[id] = t.em || ""; });
        });
      } catch (e) {}
      return m;
    },
    /* testes de compatibilização apagados: { testeId: quando } — o merge da
       nuvem descarta os resultados pelo `testeId`, como faz com o `obraId`. */
    cascatasDeClashTeste: function (empresaId) {
      var m = Object.create(null);
      try {
        Util.arr(this.adapter.ler(empresaId, "_lapides", [])).forEach(function (t) {
          if (t && t.cascata === "clashteste" && t.ref) m[t.ref] = t.em || "";
        });
      } catch (e) {}
      return m;
    },
    /* v1.1.232 — lápide ganha `atualizadoEm = em`. O merge da nuvem decide por
       atualizadoEm; a lápide só tinha `em`, então duas lápides do mesmo id
       empatavam ("" === "") e o LOCAL vencia sempre — a re-exclusão nunca
       propagava. Provado em Node: no ciclo excluir→recriar→excluir de entidade
       com id determinístico (peso de bloco, composição própria), o registro
       excluído ressuscitava no outro aparelho para sempre. Dar à lápide o
       campo que o merge já compara conserta sem tocar no merge. */
    _porLapide: function (l, nova) {
      nova.atualizadoEm = nova.em;
      for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === nova.id) { l[i].em = nova.em; l[i].atualizadoEm = nova.em; return; }
      l.push(nova);
    },
    /* poda pela DATA (não pela posição no array: depois do merge da nuvem a ordem não é
     * cronológica) e nunca descarta lápide de cascata, que vale por milhares */
    _podarLapides: function (l) {
      if (l.length <= this._LAPIDES_MAX) return l;
      var cascatas = [], simples = [];
      l.forEach(function (t) { if (t && t.cascata) cascatas.push(t); else if (t) simples.push(t); });
      simples.sort(function (a, b) { return String(a.em || "") < String(b.em || "") ? -1 : 1; });
      var sobra = Math.max(0, this._LAPIDES_MAX - cascatas.length);
      return cascatas.concat(simples.slice(simples.length - sobra));
    },
    /* obras apagadas em cascata: { obraId: quando } — o merge da nuvem descarta por obraId.
     * Object.create(null): um registro com id "constructor"/"toString" era dado como
     * excluído por herança do protótipo. */
    cascatasDeObra: function (empresaId) {
      var m = Object.create(null);
      try {
        Util.arr(this.adapter.ler(empresaId, "_lapides", [])).forEach(function (t) {
          if (t && t.cascata === "obra" && t.ref) m[t.ref] = t.em || "";
        });
      } catch (e) {}
      return m;
    },
    /* apaga vários de uma vez: 1 leitura + 1 gravação por entidade (a versão um-a-um
     * travava a aba por segundos numa obra grande). Devolve quantos SAÍRAM de fato — e 0
     * se a gravação falhar (cota cheia), senão o resumo final mentiria pro usuário. */
    excluirVarios: function (empresaId, entidade, ids, semLapide) {
      if (!ids || !ids.length) return 0;
      var alvo = Object.create(null);
      ids.forEach(function (i) { alvo[String(i)] = 1; });
      var antes = this.listar(empresaId, entidade);
      var l = antes.filter(function (x) { return !(x && alvo[String(x.id)]); });
      var saiu = antes.length - l.length;
      if (!this.adapter.gravar(empresaId, entidade, l)) return 0;
      if (!semLapide && saiu && this._sincroniza(entidade)) {
        // uma leitura/gravação só do bloco de lápides (o laço chamando lapidar era O(n²))
        try {
          var tl = Util.arr(this.adapter.ler(empresaId, "_lapides", [])), self = this, agora = Util.agoraISO();
          ids.forEach(function (i) { self._porLapide(tl, { id: entidade + ":" + i, ent: entidade, ref: String(i), em: agora }); });
          this.adapter.gravar(empresaId, "_lapides", this._podarLapides(tl));
        } catch (e) {}
      }
      return saiu;
    },
    /* mapa { id: quando } das exclusões de uma entidade — usado pelo merge da nuvem */
    lapidesDe: function (empresaId, entidade) {
      var m = Object.create(null);
      try {
        Util.arr(this.adapter.ler(empresaId, "_lapides", [])).forEach(function (t) {
          if (t && t.ent === entidade && t.ref) m[t.ref] = t.em || "";
        });
      } catch (e) {}
      return m;
    },
    /* poda usada pelo merge da nuvem: sem isto o teto valia só nas exclusões locais e a
     * lista crescia sem fim quando dois aparelhos trocavam lápides. */
    podarLapidesDe: function (empresaId) {
      try {
        var l = Util.arr(this.adapter.ler(empresaId, "_lapides", []));
        if (l.length > this._LAPIDES_MAX) this.adapter.gravar(empresaId, "_lapides", this._podarLapides(l));
      } catch (e) {}
    },

    /* devolve false quando NÃO excluiu por causa da lista ilegível (e aí nem
       lápide: uma lápide de exclusão que não aconteceu apagaria o orçamento
       depois, no primeiro sync, quando a lista fosse restaurada). */
    excluirOrcamento: function (empresaId, id) {
      this.ultimaRecusa = null;
      var lista = this.listarOrcamentos(empresaId).filter(function (o) { return o.id !== id; });
      var ileg = this.ilegivel(empresaId, "orcamentos");
      if (ileg && ileg.bloqueia) {
        this.ultimaRecusa = { tipo: "corrompido", entidade: "orcamentos", id: id, numero: "", base: "",
          quarentena: ileg.quarentena, copiaOk: ileg.copiaOk, bytes: ileg.bytes, em: ileg.em, desde: ileg.desde };
        return false;
      }
      var ok = this.adapter.gravar(empresaId, "orcamentos", lista);
      this.lapidar(empresaId, "orcamentos", id);
      return ok !== false;
    },

    // ----- CRUD genérico de entidades da Gestão (obras, clientes, contratos, medicoes, financeiro) -----
    /* A ÚNICA porta de leitura em forma de lista — `listar` e a nuvem passam
       por aqui. Entidade sem conversão de forma sai por um `Util.arr`, que é
       o que sempre foi; a que tem sai convertida em memória (ver FORMAS). */
    _lerLista: function (empresaId, entidade) {
      var bruto = this.adapter.ler(empresaId, entidade, []);
      var f = FORMAS[entidade];
      return f ? f(bruto) : Util.arr(bruto);
    },
    /* ⚠ A LEITURA QUE A NUVEM TEM DE USAR, E NÃO `adapter.ler` DIRETO.
       O `sincronizar`, o `escutar` e o `push` liam o disco cru. Com o mapa
       antigo de `precosinsumos` ainda lá, o merge recebia um objeto, o
       `Util.arr` o transformava em `[]` e a gravação do merge APAGAVA as
       cotações do cliente — e empurrava o vazio para os outros aparelhos.
       Aqui a forma já chega certa. prefs/conta continuam sendo objeto único,
       que é o que o merge deles espera. */
    lerParaSync: function (empresaId, entidade) {
      if (entidade === "prefs" || entidade === "conta") return this.adapter.ler(empresaId, entidade, {});
      return this._lerLista(empresaId, entidade);
    },
    /* ⚠ AS DUAS PORTAS DA NUVEM PARA A FORMA GUARDADA (ver GUARDAR). O
       documento do Firestore tem teto de 1 MiB por entidade: o que sobe vai
       compactado (`compactar`), e o que desce é aberto (`expandir`) ANTES do
       merge — o merge compara registro com registro, e a mesma vista numa
       forma de cada lado pareceria "mudou" a cada snapshot. Entidade fora da
       tabela passa intacta, e o que já está aberto continua aberto. */
    compactar: function (entidade, valor) {
      var g = Object.prototype.hasOwnProperty.call(GUARDAR, entidade) ? GUARDAR[entidade](valor) : valor;
      return NUVEM_SEM_LISTA_EM_LISTA[entidade] ? desaninhar(g, false) : g;
    },
    /* ⚠ AS DUAS CONVERSÕES SOLTAS, para o DOCUMENTO NOVO da nuvem (js/nuvem.js, DOC_V2 — 20/10/2026). Quem decide QUANDO
       desaninhar é o nuvem.js, e não a tabela acima: o documento antigo de bim_edicoes/bim_vistas/… continua sendo lido pelos
       aparelhos de versão antiga e NUNCA pode receber { "__lista" }. Se a decisão morasse aqui, um store.js novo com um nuvem.js
       antigo (cache do navegador no meio da atualização) gravaria a forma nova no documento antigo. */
    desaninhar: function (valor) { return desaninhar(valor, false); },
    reaninhar: function (valor) { return reaninhar(valor); },
    expandir: function (entidade, valor) {
      if (NUVEM_SEM_LISTA_EM_LISTA[entidade]) valor = reaninhar(valor);
      if (entidade === "bim_vistas") return abrirVistas(valor);
      return valor;
    },
    /* =====================================================================
     * compactarGuardado — a lista de vistas que ainda está no disco na
     *   forma antiga é regravada compactada, UMA vez, no boot.
     *
     * Sem isto o espaço só voltaria na primeira gravação de uma vista (ou no
     * primeiro sync), e o aviso "Armazenamento local em 82%" continuaria
     * aparecendo a cada abertura até lá.
     *
     * ⚠ PELO GRAVADOR ORIGINAL (`_gravarLocal`), não pelo `adapter.gravar`:
     *   a nuvem embrulha aquele para subir a cada gravação, e o `push` sobe a
     *   lista LOCAL por cima da nuvem — antes do merge do boot, isso passaria
     *   por cima do que outro aparelho mandou. Aqui o conteúdo é o mesmo (a
     *   conferência de `compactarVistas` garante), só a forma muda: não há o
     *   que subir, nem `atualizadoEm` a carimbar.
     * Devolve o que foi regravado: [{ entidade, antes, depois }], em
     * caracteres (lista vazia = nada a fazer).
     * ===================================================================== */
    compactarGuardado: function (empresaId) {
      var out = [];
      for (var ent in GUARDAR) {
        if (!Object.prototype.hasOwnProperty.call(GUARDAR, ent)) continue;
        try {
          var k = chave(empresaId, ent), raw = _rawDe(empresaId, ent, k);   // no banco ou no localStorage
          if (_vazio(raw) || raw.length < 4096) continue;     // pequeno: nada a ganhar
          var lista = this._lerLista(empresaId, ent);
          if (this.ilegivel(empresaId, ent)) continue;        // quarentena: não se toca
          var novo = JSON.stringify(GUARDAR[ent](lista));
          if (novo.length >= raw.length) continue;           // já compactada (ou não ganha)
          if (_gravarLocal.call(LocalAdapter, empresaId, ent, lista)) {
            out.push({ entidade: ent, antes: raw.length, depois: novo.length });
            try { console.info("[store] " + ent + " compactada: " + Math.round(raw.length / 1024) + " → " + Math.round(novo.length / 1024) + " KB"); } catch (eI) {}
          }
        } catch (e) {}
      }
      return out;
    },
    listar: function (empresaId, entidade) {
      var l = this._lerLista(empresaId, entidade);
      var m = MIGRADORES[entidade];
      if (m) {                                   // em memória; ver a nota da migração
        var n = 0;
        for (var i = 0; i < l.length; i++) if (m(l[i])) n++;
        if (n && !_logado[entidade]) { _logado[entidade] = 1; logMigracao(1, 2, entidade + " ×" + n); }
      }
      return l;
    },
    obter: function (empresaId, entidade, id) {
      var l = this.listar(empresaId, entidade);
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
      return null;
    },
    /* ⚠ `manterCarimbo` (4º argumento) É O MESMO DE `salvarOrcamento` — ver a
       nota lá em cima. Ele faltava aqui, e por isso a metade da GESTÃO do
       "restaurar backup" carimbava `agora` num conteúdo de semana passada: o
       merge da nuvem lia o retrocesso como "a versão mais recente", vencia a
       versão boa que estava na nuvem e a empurrava para os outros aparelhos.
       Não precisava nem de perder o localStorage — bastava o registro local
       estar AUSENTE ou mais antigo que o do arquivo.
       As ~137 chamadas de 3 argumentos continuam carimbando "agora", que é o
       comportamento certo em todo o resto do app. */
    salvar: function (empresaId, entidade, obj, manterCarimbo) {
      if (!obj.id) obj.id = Util.uid(entidade.slice(0, 3));
      if (!(manterCarimbo && obj.atualizadoEm)) obj.atualizadoEm = Util.agoraISO();
      if (!obj.criadoEm) obj.criadoEm = obj.atualizadoEm;
      var nz = NORMALIZADORES[entidade];
      if (nz) nz(obj);                       // campos derivados: ver a nota acima
      var l = this.listar(empresaId, entidade), i = -1;
      for (var k = 0; k < l.length; k++) if (l[k].id === obj.id) { i = k; break; }
      if (i >= 0) l[i] = obj; else l.push(obj);
      var gravou = this.adapter.gravar(empresaId, entidade, l);
      /* ⚠ DADO DE GESTÃO TAMBÉM PEDE BACKUP. O backup automático só disparava
         ao salvar orçamento ou composição própria: quem usava só obras e
         diários nunca ganhava cópia em arquivo. backupAuto agrupa (15 s) e
         espaça (5 min), então chamá-lo a cada gravação não gera arquivo a mais. */
      if (gravou && entidade !== "_lapides") { try { if (typeof App !== "undefined" && App && App.backupAuto) App.backupAuto({ gestao: true }); } catch (eBk) {} }
      return gravou ? obj : null;
    },
    /* =====================================================================
     * salvarVarios — O ESPELHO QUE FALTAVA DO `excluirVarios`.
     *
     * ⚠ A PROTEÇÃO ESTAVA FEITA PELA METADE. `excluirVarios` (aqui em cima)
     *   existe desde que "a versão um-a-um travava a aba por segundos numa
     *   obra grande" — o lado do EXCLUIR foi consertado, o da GRAVAÇÃO não.
     *   `salvar` não é gravação incremental: ele relê a entidade inteira,
     *   varre pelo id e regrava tudo. Dentro de laço o custo é
     *   M × (parse + stringify de N), com N crescendo a cada volta.
     *
     *   O que isso custava ao cliente: restaurar um backup de 3 anos
     *   (12.000 registros) fazia 24.000 JSON.parse, 12.000 JSON.stringify e
     *   ~1,28 GB gravados no localStorage — ~9,5 s de aba congelada, sem
     *   barra de progresso, no momento em que ele acabou de trocar de
     *   máquina ou de perder o aparelho. Muita gente conclui, com razão,
     *   que o backup não funcionou. Aqui é 1 leitura + 1 gravação por
     *   entidade.
     *
     * ⚠ E PASSA PELO MESMO FUNIL DO `salvar`, DE PROPÓSITO. A tentação é
     *   chamar `adapter.gravar` com a lista crua — seria ainda mais rápido e
     *   quebraria três coisas de uma vez: o registro entraria sem id, sem
     *   carimbo, e sem os NORMALIZADORES. Este último é o que dói caro: o
     *   `financeiro` ficaria com o espelho em centavos MENTINDO (`valorCent`
     *   antigo com `valor` novo) e o dia em que a cobrança passar a usá-lo o
     *   boleto sai com o valor velho, sem ninguém saber por quê.
     *
     * `manterCarimbo` é o mesmo 4º argumento do `salvar` — ver a nota lá.
     * Devolve QUANTOS ENTRARAM (e 0 se a gravação falhar), como o
     * `excluirVarios`: há chamador que conta sucesso/falha pelo retorno, e
     * um resumo dizendo "N restaurado(s)" depois de a cota estourar é
     * exatamente a mentira que o `excluirVarios` documenta e evita. A falha
     * de cota também vira UM aviso por entidade, não um por registro.
     * ===================================================================== */
    salvarVarios: function (empresaId, entidade, lista, manterCarimbo) {
      var itens = Util.arr(lista);
      if (!itens.length) return 0;
      var l = this.listar(empresaId, entidade);
      /* índice { id: posição } — sem ele seria uma varredura linear por registro,
         que é o mesmo O(N²) por outro caminho.
         Object.create(null): registro com id "constructor"/"toString" era dado
         como já existente por herança do protótipo (mesma armadilha das lápides). */
      var pos = Object.create(null);
      for (var k = 0; k < l.length; k++) if (l[k] && l[k].id != null) pos[String(l[k].id)] = k;
      var nz = NORMALIZADORES[entidade], entrou = 0;
      for (var i = 0; i < itens.length; i++) {
        var obj = itens[i];
        if (!obj || typeof obj !== "object") continue;
        if (!obj.id) obj.id = Util.uid(entidade.slice(0, 3));
        if (!(manterCarimbo && obj.atualizadoEm)) obj.atualizadoEm = Util.agoraISO();
        if (!obj.criadoEm) obj.criadoEm = obj.atualizadoEm;
        if (nz) nz(obj);                     // campos derivados: ver a nota do `salvar`
        var ch = String(obj.id), p = pos[ch];
        /* id repetido dentro do próprio lote: o último vence, que é o que o
           laço de `salvar` fazia ao reler o disco a cada volta */
        if (p != null) l[p] = obj; else { pos[ch] = l.length; l.push(obj); }
        entrou++;
      }
      if (!entrou) return 0;
      var gravouV = this.adapter.gravar(empresaId, entidade, l);
      if (gravouV && entidade !== "_lapides") { try { if (typeof App !== "undefined" && App && App.backupAuto) App.backupAuto({ gestao: true }); } catch (eBk) {} }   // ver o `salvar`
      return gravouV ? entrou : 0;
    },
    excluir: function (empresaId, entidade, id) {
      var l = this.listar(empresaId, entidade).filter(function (x) { return x.id !== id; });
      var ok = this.adapter.gravar(empresaId, entidade, l);
      /* ⚠ recusada pela quarentena: sem lápide (ver `excluirOrcamento`) */
      var ileg = ok ? null : this.ilegivel(empresaId, entidade);
      if (ileg && ileg.bloqueia) return false;
      this.lapidar(empresaId, entidade, id);
      return ok !== false;
    },

    // ----- Preferências/empresa -----
    lerPrefs: function (empresaId) { return this.adapter.ler(empresaId, "prefs", {}); },
    salvarPrefs: function (empresaId, prefs) { this.adapter.gravar(empresaId, "prefs", prefs); },

    // ----- Base SINAPI personalizada da empresa (importada/atualizada) — IndexedDB -----
    lerBaseSinapi: function (empresaId) { return this._bigGet(empresaId, "sinapi_base") || null; },
    temBaseSinapi: function (empresaId) {
      var b = this.lerBaseSinapi(empresaId);
      return !!(b && b.dados && b.dados.length);
    },
    salvarBaseSinapi: function (empresaId, pacote) {
      // Agora no IndexedDB (sem a cota de ~5MB do localStorage) — não estoura mais.
      this._bigSet(empresaId, "sinapi_base", pacote);
      return { ok: true };
    },
    apagarBaseSinapi: function (empresaId) { this._bigDel(empresaId, "sinapi_base"); },
    // ----- Bases extras (multi-base: SICRO/SETOP/… + própria) — também grandes, IndexedDB -----
    lerBasesExtras: function (empresaId) { return this._bigGet(empresaId, "bases_extras") || []; },
    salvarBasesExtras: function (empresaId, payload) { this._bigSet(empresaId, "bases_extras", payload); return true; },

    // ----- Saúde / observabilidade -----
    /* ⚠ O AVISO DE ARMAZENAMENTO CHEIO MANDAVA LIMPAR O LUGAR ERRADO.
     * Ele dizia "remova bases não usadas em Tabelas" — e as bases NÃO ocupam
     * um byte do que está cheio: `_bigSet` as move para o IndexedDB e faz
     * `localStorage.removeItem` justamente para "nunca deixar cópia grande no
     * localStorage". Ou seja, o cliente seguia o conselho, não liberava nada,
     * e concluía que o sistema estava quebrado — no exato momento em que o app
     * fica somente-leitura para dado novo.
     * Agora `saude()` diz QUEM está ocupando: a carteira de orçamentos costuma
     * ser o maior inquilino isolado (um orçamento de 150 itens mede ~54 KB e
     * todos moram numa chave só), não o histórico da obra. */
    saude: function (empresaId) {
      var orcs = this.listarOrcamentos(empresaId);
      var bytes = 0, porChave = [];
      try {
        for (var k in localStorage) {
          if (localStorage.hasOwnProperty(k) && k.indexOf(NS + ":") === 0) {
            var b = (localStorage.getItem(k) || "").length;
            bytes += b;
            /* a cópia da quarentena tem a data no fim do nome: sem isto o
               aviso de armazenamento diria que o maior é "2026-09-16T…" */
            var pq = k.indexOf(SUFIXO_QUAR);
            var rot = pq > 0 ? k.slice(0, pq).split(":").pop() + " (cópia ilegível guardada)" : k.split(":").pop();
            porChave.push({ chave: rot, kb: Math.round(b / 1024) });
          }
        }
      } catch (e) {}
      porChave.sort(function (a, b) { return b.kb - a.kb; });
      // usoPct: estimativa sobre a cota típica de ~5M chars do localStorage —
      // base p/ o aviso de boot (>80%) que evita o QuotaExceeded silencioso.
      var usoPct = Math.min(100, Math.round(bytes / (5 * 1024 * 1024) * 100));
      var migr = [];
      try { migr = JSON.parse(localStorage.getItem(NS + ":migracoes") || "[]"); } catch (e) {}
      /* ⚠ `usoPct`, `tamanhoKB` e `maiores` contam SÓ o localStorage, que é
         o que tem o teto de ~5 M caracteres (o aviso de boot olha isto). O
         que mora no banco do aparelho vem em `idb` — ver `discoEstado`. */
      return { orcamentos: orcs.length, tamanhoKB: Math.round(bytes / 1024), usoPct: usoPct,
        migracoes: migr.length, schemaVersao: CONFIG.schemaVersao, idb: this.discoEstado(empresaId),
        /* `orcamentos: 0` com a lista ilegível NÃO é carteira vazia: quem lê
           a saúde confere aqui antes (e as cópias guardadas ficam à vista) */
        ilegiveis: this.ilegiveis(empresaId), quarentenas: this.quarentenas(empresaId),
        /* o que de fato ocupa o espaço, do maior para o menor — é isso que a
           pessoa precisa saber para decidir o que fazer */
        maiores: porChave.slice(0, 5) };
    }
  };

  global.Store = Store;
})(window);

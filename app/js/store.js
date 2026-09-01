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

  /* ---------- Adapter local (localStorage) ---------- */
  var LocalAdapter = {
    ler: function (empresaId, entidade, fallback) {
      try {
        var raw = localStorage.getItem(chave(empresaId, entidade));
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        console.warn("[store] leitura corrompida em", entidade, e);
        return fallback;
      }
    },
    gravar: function (empresaId, entidade, valor) {
      try {
        localStorage.setItem(chave(empresaId, entidade), JSON.stringify(valor));
        return true;
      } catch (e) {
        console.error("[store] falha ao gravar", entidade, e);
        // LOTE 1: falha de gravação NUNCA é silenciosa — o usuário precisa saber
        // que a última alteração não persistiu (antes só ia p/ o console).
        var cota = e && (e.name === "QuotaExceededError" || e.code === 22);
        try {
          if (global.UI && global.UI.toast) global.UI.toast(cota
            /* ⚠ NÃO MANDE LIMPAR AS BASES: elas moram no IndexedDB e não ocupam
               um byte do que está cheio. Ver a nota em `saude()`. O que enche é
               orçamento e histórico da obra. */
            ? "⚠ Armazenamento CHEIO — a última alteração NÃO foi salva. Faça 💾 Backup AGORA. Depois abra 🗂 Tabelas › Saúde do armazenamento para ver o que está ocupando o espaço (as bases SINAPI não contam: elas ficam fora deste limite)."
            : "⚠ Falha ao salvar \"" + entidade + "\" — a última alteração não persistiu.", "erro");
        } catch (e2) {}
        return false;
      }
    },
    apagar: function (empresaId, entidade) {
      try { localStorage.removeItem(chave(empresaId, entidade)); return true; }
      catch (e) { return false; }
    }
  };

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
  var FORMAS = { precosinsumos: precosInsumoParaLista };

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
      var lista = this.adapter.ler(empresaId, "orcamentos", []);
      lista = Util.arr(lista).map(migrarOrcamento);
      return lista;
    },

    /* `manterCarimbo` existe para UM caso: restaurar backup. O registro que vem
       do arquivo tem que entrar com o atualizadoEm DELE — carimbar "agora" num
       conteúdo de semana passada faz o merge da nuvem tratar o retrocesso como
       a versão mais recente e propagá-lo para os outros aparelhos. Em todo o
       resto do app o carimbo é sempre agora, que é o comportamento padrão. */
    salvarOrcamento: function (empresaId, orc, manterCarimbo) {
      if (!(manterCarimbo && orc && orc.atualizadoEm)) orc.atualizadoEm = Util.agoraISO();
      var lista = this.listarOrcamentos(empresaId);
      var idx = -1;
      for (var i = 0; i < lista.length; i++) { if (lista[i].id === orc.id) { idx = i; break; } }
      if (idx >= 0) lista[idx] = orc; else lista.push(orc);
      var ok = this.adapter.gravar(empresaId, "orcamentos", lista);
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
    _IMUNES_CASCATA: { colaboradores: 1, patrimonio: 1, frota: 1, fiscal: 1,
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
        this.adapter.gravar(empresaId, "_lapides", restou);
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

    excluirOrcamento: function (empresaId, id) {
      var lista = this.listarOrcamentos(empresaId).filter(function (o) { return o.id !== id; });
      this.adapter.gravar(empresaId, "orcamentos", lista);
      this.lapidar(empresaId, "orcamentos", id);
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
      return this.adapter.gravar(empresaId, entidade, l) ? obj : null;
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
      return this.adapter.gravar(empresaId, entidade, l) ? entrou : 0;
    },
    excluir: function (empresaId, entidade, id) {
      var l = this.listar(empresaId, entidade).filter(function (x) { return x.id !== id; });
      this.adapter.gravar(empresaId, entidade, l);
      this.lapidar(empresaId, entidade, id);
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
            porChave.push({ chave: k.split(":").pop(), kb: Math.round(b / 1024) });
          }
        }
      } catch (e) {}
      porChave.sort(function (a, b) { return b.kb - a.kb; });
      // usoPct: estimativa sobre a cota típica de ~5M chars do localStorage —
      // base p/ o aviso de boot (>80%) que evita o QuotaExceeded silencioso.
      var usoPct = Math.min(100, Math.round(bytes / (5 * 1024 * 1024) * 100));
      var migr = [];
      try { migr = JSON.parse(localStorage.getItem(NS + ":migracoes") || "[]"); } catch (e) {}
      return { orcamentos: orcs.length, tamanhoKB: Math.round(bytes / 1024), usoPct: usoPct,
        migracoes: migr.length, schemaVersao: CONFIG.schemaVersao,
        /* o que de fato ocupa o espaço, do maior para o menor — é isso que a
           pessoa precisa saber para decidir o que fazer */
        maiores: porChave.slice(0, 5) };
    }
  };

  global.Store = Store;
})(window);

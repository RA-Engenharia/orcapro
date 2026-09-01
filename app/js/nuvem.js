/* =====================================================================
 * nuvem.js — Sincronização na nuvem (Firebase Auth e-mail/senha + Firestore).
 * Mantém o localStorage como cache rápido/offline e ESPELHA os dados do
 * usuário na nuvem. Mescla por id (o mais novo vence) — nunca apaga dado.
 * NÃO sincroniza as bases SINAPI/blobs grandes (ficam locais no IndexedDB).
 * Fica desligado enquanto CONFIG.backend.sync !== true.
 * ===================================================================== */
(function (global) {
  "use strict";

  // Entidades pequenas de DADOS DO USUÁRIO que sincronizam:
  var ENTIDADES = [
    "orcamentos", "prefs", "obras", "clientes", "contratos", "medicoes",
    /* o termo aditivo e documento contratual: precisa estar no celular do
       engenheiro e no computador do escritorio como o contrato esta */
    "aditivos",
    "financeiro", "compras", "estoque", "rdo", "colaboradores", "frota",
    "requisicoes", "epi", "faltas", "templates", "documentos", "usuarios",
    // modo nuvem multi-aparelho: a EQUIPE (sub-usuários) e a CONTA (admin mestre)
    // sincronizam pela conta-tenant da licença → cada usuário loga no próprio aparelho.
    "equipe", "conta",
    // peso de bloco do fornecedor do usuário: 1 registro por peça, sem obraId
    // (é catálogo da empresa, não da obra — logo não entra em cascata nenhuma)
    "pesos_bloco",
    // EPI que a empresa cadastrou (não está no catálogo de fábrica): também é
    // catálogo da EMPRESA, sem obraId — e sem estar aqui a exclusão não deixaria
    // lápide, então o item apagado num aparelho ressuscitaria no outro.
    "epi_catalogo",
    // NOTA FISCAL e o que nasce dela. Ficaram de fora desde sempre: a nota
    // importada no computador não aparecia no celular, e o bem comprado
    // tampouco. Com itens e parcelas dentro do registro fiscal, isso deixou
    // de ser detalhe — é o documento que prova a compra.
    "fiscal", "patrimonio", "estoque_mov",
    /* ⚠ O MODELO DE PROPOSTA É DA EMPRESA, e por isso sincroniza: quem
       desenha a proposta é o escritório e quem a gera costuma ser outra
       pessoa, noutro aparelho. Sem estar aqui, o vendedor abriria a lista de
       modelos vazia e cairia no documento genérico sem entender por quê.
       ⚠ E cabe no documento: o registro guarda a REFERÊNCIA da foto (~80
       bytes), nunca os bytes — ver js/proptplui.js. */
    "prop_modelos",
    // medição de produção: nasce do diário no celular do encarregado e é paga
    // no computador do escritório — sem sincronizar, o pagamento não chega lá.
    "producao_med",
    // R$/unidade da produção. Estava dentro de `prefs`, e o merge de prefs é
    // "o local vence campo a campo" — o preço aprovado no escritório nunca
    // chegava ao celular do encarregado, que pagava outro valor sem erro
    // nenhum. Dinheiro tem que passar pelo merge por id, com atualizadoEm.
    "producao_preco",
    /* composições próprias: o ÚNICO dado AUTORAL do cliente que vivia só no
     * aparelho — fora do backup e fora daqui. Um cliente perdeu as dele.
     * Entra como ESPELHO (1 registro por código, id = código normalizado),
     * não como o blob da base: mandar o blob repetiria o mesmo defeito entre
     * aparelhos — o último a gravar apagaria o que o outro criou. Ver
     * js/propriasync.js. */
    "composicoes_proprias",
    // níveis do projeto: TÊM obraId, e por isso entram na cascata da obra
    "bim_niveis",
    /* ⚠ a federação da obra: de que arquivos ela é feita, com a disciplina, a
     * transparência e a visibilidade que o usuário escolheu para cada um. É
     * trabalho dele, não dado derivado — sem estar aqui não entraria no backup
     * (js/app.js deriva a lista DESTE array) nem deixaria lápide ao excluir, e
     * trocar de máquina apagaria a montagem da obra inteira. É a mesma
     * história das composições próprias, algumas linhas acima.
     * ⚠ O que NÃO sincroniza é a geometria convertida: ela mora no IndexedDB,
     * é derivada do arquivo e pesa centenas de MB. No aparelho novo o registro
     * chega, o cache não, e o produto PEDE o arquivo pelo nome. */
    "bim_modelos",
    /* conjuntos de seleção e busca: é trabalho do coordenador, não dado
     * derivado — "Tubos de água fria do Térreo" leva minutos para montar e é o
     * que o teste de conflito e a tarefa do cronograma passam a apontar. TEM
     * obraId, então entra na cascata da obra. */
    "bim_conjuntos",
    /* pontos de vista: e o que sobrevive de uma reuniao de compatibilizacao.
     * A MINIATURA nao vem junto — ela e blob e mora no IndexedDB; aqui viaja
     * so o endereco dela, e no outro aparelho a vista abre sem a foto em vez
     * de nao abrir. */
    "bim_vistas",
    /* compatibilizacao: o TESTE salvo e o RESULTADO com o ciclo de vida.
     * O resultado carrega responsavel, prazo, comentario e historico — e
     * e justamente isso que precisa atravessar aparelhos: o engenheiro
     * marca no computador e o coordenador ve no dele. Sem sincronizar,
     * cada um teria a sua versao de quais conflitos ja foram tratados. */
    "bim_clash_testes",
    "bim_clash_resultados",
    /* o elo entre o item do orcamento e a categoria medida no modelo. E
       cadastro feito a mao — o engenheiro confirma item a item — e sem ele a
       conferencia "o orcado bate com o desenhado?" nasce vazia no aparelho
       novo, com a tela dizendo, tranquila, que nao ha nada ligado. */
    "bim_orc_vinculos",
    /* 4D: as tarefas do cronograma DO ENGENHEIRO (o bim4d.js continua
     * derivando o automatico). Sincroniza porque o apontamento de real vem
     * da obra — medicao, diario — e quem planeja esta no escritorio: sao
     * duas pessoas escrevendo na mesma tarefa, em aparelhos diferentes. */
    "bim_tarefas",
    /* as cores do 4D. Sao da EMPRESA, nao da obra: o relatorio de todas as
     * obras tem de sair com a mesma legenda. */
    "bim_4d_aparencias",
    /* tabela de preços unitários da obra (descrição, unidade, R$/unidade). É o
     * que permite medir obra SEM valor global fechado — obra por administração,
     * série de preços. TEM obraId, então entra na cascata da obra. */
    "atividades",
    /* hora extra de um DIA. Fica de fora da cascata da obra de propósito, pelo
     * mesmo motivo das faltas: é jornada de PESSOA. Apagar uma obra não pode
     * apagar o cartão de ponto de ninguém. */
    "horas_extras",
    /* batida de ponto de um DIA: o horário que a pessoa marcou, transcrito do
     * controle de jornada em papel. Fora da cascata da obra pelo mesmo motivo
     * das faltas e da hora extra — é jornada de PESSOA, e apagar uma obra não
     * pode apagar cartão de ponto de ninguém. Por isso NÃO grava obraId.
     * ⚠ Esta linha não é formalidade. É ela que faz a batida sair do aparelho
     *   onde nasceu: sem ela o dado não sincroniza, NÃO ENTRA NO BACKUP
     *   (App._dumpGestao itera exatamente esta lista) e a exclusão não deixa
     *   lápide — o registro apagado ressuscita no primeiro merge. É o defeito
     *   da v1.1.231 logo abaixo, e aqui o dado é prova trabalhista. */
    "batidas",
    /* ===== v1.1.231 — DOZE ENTIDADES QUE NUNCA SINCRONIZARAM =====
     * Um cliente reportou que fornecedor e cotação cadastrados no computador
     * não apareciam no celular. Ao cruzar TODAS as entidades que o Store grava
     * contra esta lista, não eram duas: eram doze. Elas simplesmente nunca
     * estiveram aqui, então o dado ficava preso no aparelho onde nasceu — sem
     * erro nenhum, que é o que fez isso durar tanto.
     *
     * `erro` (log de falhas) ficou de fora de propósito: é diagnóstico local,
     * não dado do usuário, e sincronizar log só gastaria cota.
     *
     * ⚠ Sobre a cascata da obra, ver `_IMUNES_CASCATA` em js/store.js: folha,
     *   ponto e movimento de frota entraram lá junto com esta mudança. Apagar
     *   uma obra não pode apagar pagamento feito nem cartão de ponto de
     *   ninguém — é o mesmo motivo que já mantinha `faltas` fora da cascata.
     *   ⚠ Esta nota também citava `horas_extras` como protegida, e ela não
     *   estava: `faltas` não grava obraId e por isso o merge nunca a olha;
     *   `horas_extras` grava, e era apagada. Corrigido na v1.2. */
    // cadastros da EMPRESA (sem obraId)
    "fornecedores", "familias", "centrocusto",
    // compras e planejamento (têm obraId → entram na cascata da obra)
    "cotacoes", "lp_tarefas", "tarefas", "bim_edicoes",
    // folha de diaristas e ponto: DINHEIRO e JORNADA DE PESSOA (imunes à cascata)
    "folha", "fs_lancamentos", "fs_pagamentos", "ponto",
    // movimento de frota: a frota já era imune; o movimento dela também é
    "frota_mov",
    /* ===== MÓDULOS SOB DEMANDA (js/perfis.js) =====
     * Só aparecem para o perfil que os nomeia, mas a entidade sincroniza do
     * mesmo jeito: quem tem o módulo tem dois aparelhos como todo mundo, e
     * entidade fora desta lista fica presa onde nasceu — sem erro nenhum.
     *
     * ⚠ `carp_param` e `remun_param` são um registro só, com os NÚMEROS que
     *   fazem o preço e a folha (corte de metragem, percentual do detalhe,
     *   R$ por m²). Eles poderiam ter ido para `prefs`, e é exatamente o que
     *   não podem: o merge de prefs é `Object.assign({}, nuvem, local)`, o
     *   local vence campo a campo, e foi assim que o preço de produção já
     *   voltou sozinho ao valor velho depois do sync. Dinheiro passa pelo
     *   merge por id, com `atualizadoEm` — como `producao_preco` acima. */
    "carp_param", "carp_madeiras", "carp_mo", "carp_propostas", "carp_parceiros",
    "remun_param", "remun_apur",
    /* padrao de privacidade do Portal do Cliente (o que a obra herda quando
       ainda nao decidiu). Nao e sob demanda — vale para qualquer empresa —
       e tambem nao pode morar em prefs: e decisao de PRIVACIDADE, e o
       merge de prefs deixa o aparelho local vencer campo a campo. */
    "portal_padrao",
    /* COTAÇÃO PRÓPRIA DE INSUMO (v1.2). O SINAPI publica em branco o que não
     * coletou na UF; o usuário cota com o fornecedor dele e informa o preço.
     * Esse número precifica composição própria, alimenta a contagem de
     * "insumo sem preço" da planilha e aparece no detalhamento — é dinheiro
     * de orçamento, e vivia só no aparelho onde nasceu, fora daqui e fora do
     * backup. Mesma história das `composicoes_proprias` logo acima.
     * ⚠ ELA ERA UM MAPA `código → {preco, em}`, E POR ISSO NÃO BASTAVA PÔR O
     *   NOME AQUI: o `_merge` trata tudo que não é prefs/conta como LISTA, e
     *   `Util.arr({})` é `[]` — provado rodando, o primeiro sync deixava o
     *   cliente com 0 cotações e empurrava `[]` para os outros aparelhos.
     *   O disco passou a guardar LISTA (id = código do insumo) e o formato
     *   antigo é convertido NA LEITURA por `Store.lerParaSync` — ver a nota
     *   de FORMAS em js/store.js. */
    "precosinsumos",
    /* o PERFIL DE IMPLANTACAO da empresa. Morava so em prefs, e o merge de
       prefs deixa o local vencer: o celular do dono desfazia no sync o
       enxugamento feito no computador. Ver js/perfis.js. */
    "perfil_impl",
    // v1.1.126 — lápides das exclusões: sem isso o merge (união por id) ressuscitava
    // no aparelho A o registro que o aparelho B tinha acabado de apagar.
    "_lapides"
  ];
  var SDK = [
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"
  ];

  function carregarScript(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = url; s.async = true; s.onload = res; s.onerror = function () { rej(new Error("falha ao carregar " + url)); };
      document.head.appendChild(s);
    });
  }
  function vazioDe(ent) { return (ent === "prefs" || ent === "conta") ? {} : []; }

  /* ⚠ NÃO LER O DISCO CRU AQUI DENTRO. As três portas que mesclam
   * (sincronizar, escutar e push) faziam `Store.adapter.ler(...)` direto, e
   * isso pressupõe que o que está no disco JÁ tem a forma que o `_merge`
   * espera. `precosinsumos` provou que não: guardada como MAPA, o merge a
   * lia, `Util.arr` a transformava em `[]` e a gravação do merge APAGAVA as
   * cotações do cliente — e mandava o vazio para os outros aparelhos.
   * `Store.lerParaSync` devolve a forma certa, convertendo o formato antigo
   * em memória (ver FORMAS em js/store.js). O `||` cobre um Store antigo
   * carregado sem a função: aí é o comportamento de sempre. */
  function lerEnt(empresaId, ent) {
    return Store.lerParaSync ? Store.lerParaSync(empresaId, ent)
                             : Store.adapter.ler(empresaId, ent, vazioDe(ent));
  }

  /* ===================================================================
   * A NUVEM NÃO TOCA EM NAMESPACE DE PRÉVIA
   *
   * ⚠ A prévia de versão de cliente (js/previewcli.js) roda trocando o
   *   `empresaId` em memória para um id com prefixo `prev:`. Quem resolve o
   *   tenant é o app.js, e ele captura `Auth.empresaId()` — ou seja, com a
   *   licença ativa da RA, o sync levaria dado de exemplo para a nuvem.
   *
   * ⚠ E o pior nem seria o lixo: `Store.excluir` grava uma LÁPIDE cujo id é
   *   `entidade:<id do registro>`, SEM empresaId dentro, e `_lapides` é uma
   *   das entidades sincronizadas. Uma exclusão feita na prévia empurraria a
   *   lápide para o documento do tenant REAL — e o merge apagaria lá o
   *   registro de mesmo id. Dado de mentira apagando dado de verdade.
   *
   * Por isso a guarda mora AQUI, nas três portas, e não em quem chama: quem
   * chama esquece, e já são três call sites de sincronização em app.js.
   * ⚠ NÃO usar a marca persistente `orcapro:nuvem:desligada` para isto: ela é
   *   a escolha de LGPD do usuário e deixaria a conta real sem sincronizar
   *   depois que a prévia acabasse, sem nada na tela explicando.
   * =================================================================== */
  function _ehPrevia(empresaId) {
    return typeof empresaId === "string" && empresaId.indexOf("prev:") === 0;
  }

  var Nuvem = {
    // exposta p/ o Store saber o que vale a pena lapidar (só o que sincroniza pode ressuscitar)
    ENTIDADES: ENTIDADES,
    ligado: false, uid: null, db: null, auth: null,
    _un: [], _push: {}, _patched: false, _initP: null,
    _escutando: null,   // empresaId que já tem escuta ativa (ver escutar())

    disponivel: function () {
      return !!(typeof CONFIG !== "undefined" && CONFIG.backend && CONFIG.backend.sync && CONFIG.backend.firebaseConfig);
    },

    _carregarSDK: function () {
      if (global.firebase) return Promise.resolve();
      return SDK.reduce(function (p, url) { return p.then(function () { return carregarScript(url); }); }, Promise.resolve());
    },

    init: function () {
      var self = this;
      if (this._initP) return this._initP;
      if (!this.disponivel()) return Promise.reject(new Error("sync desligado"));
      this._initP = this._carregarSDK().then(function () {
        if (!global.firebase.apps.length) global.firebase.initializeApp(CONFIG.backend.firebaseConfig);
        self.auth = global.firebase.auth();
        self.db = global.firebase.firestore();
        // cache offline (funciona sem internet; sincroniza ao voltar)
        try { self.db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
        return true;
      });
      return this._initP;
    },

    // Loga na nuvem com o MESMO e-mail/senha do app (cria a conta na 1ª vez).
    entrar: function (email, senha) {
      var self = this;
      email = String(email || "").trim().toLowerCase();
      if (!email || !senha) return Promise.reject(new Error("credenciais vazias"));
      return this.init().then(function () {
        return self.auth.signInWithEmailAndPassword(email, senha).catch(function (e) {
          var code = e && e.code;
          // conta ainda não existe na nuvem → cria. O Firebase novo (proteção de enumeração)
          // devolve "invalid-login-credentials"/"invalid-credential" tanto p/ e-mail inexistente
          // quanto p/ senha errada; então tentamos criar e, se o e-mail já existe, era senha errada.
          if (code === "auth/user-not-found" || code === "auth/invalid-login-credentials" || code === "auth/invalid-credential") {
            return self.auth.createUserWithEmailAndPassword(email, senha).catch(function (e2) {
              if (e2 && e2.code === "auth/email-already-in-use") { var er = new Error("Senha da nuvem diferente da do app."); er.code = "auth/wrong-password"; throw er; }
              throw e2;
            });
          }
          throw e;
        });
      }).then(function (cred) {
        self.uid = cred.user.uid; self.ligado = true;
        self._patch();
        return self.uid;
      });
    },

    // Modo nuvem MULTI-APARELHO: deriva uma conta Firebase ESTÁVEL da própria licença.
    // Todo aparelho com a mesma chave entra na MESMA conta-tenant → dados e usuários
    // compartilhados. A licença é a chave de acesso; o gate por pessoa é o login do usuário.
    _credLicenca: function (chave) {
      var c = String(chave || "").trim();
      var H = (typeof Util !== "undefined" && Util.sha256hex) ? Util.sha256hex : function (x) { return String(x); };
      return { email: "lic_" + H(c).slice(0, 32) + "@orcapro.app", senha: "L1" + H("orcapro-tenant::" + c).slice(0, 40) };
    },
    /* ⚠ A SESSÃO ABERTA É DESTA CHAVE?
     *
     * Depois de um bloqueio, o aparelho fica com `ligado=true` e um
     * `currentUser` apontando para o tenant ERRADO. O boot e o botão
     * "Sincronizar agora" tratavam "já conectado" como "nada a fazer" e
     * pulavam a reautenticação — então o cliente seguia a instrução do
     * próprio aviso ("use uma licença própria neste aparelho"), ativava a
     * licença certa, e continuava bloqueado pelo resto da sessão, sem nada
     * na tela dizendo que faltava fechar e reabrir.
     *
     * A conta é derivada da chave, então basta comparar o e-mail derivado
     * com o do usuário logado: se não bate, a sessão é de outra licença. */
    sessaoConfereComChave: function (chave) {
      try {
        if (!this.auth || !this.auth.currentUser) return false;
        if (!chave) return false;
        return String(this.auth.currentUser.email || "").toLowerCase() === String(this._credLicenca(chave).email || "").toLowerCase();
      } catch (e) { return false; }
    },
    /* Larga a sessão da nuvem SEM marcar desligamento pelo usuário, para a
       próxima tentativa reautenticar pela chave nova. Usado quando a licença
       do aparelho muda. */
    trocouDeLicenca: function () {
      this.bloqueioDeDono = null;
      this._ultimoEnviado = {};
      try { this.sair(false); } catch (e) {}
    },
    entrarPorLicenca: function (chave) {
      if (!chave) return Promise.reject(new Error("sem licença"));
      var cr = this._credLicenca(chave);
      return this.entrar(cr.email, cr.senha);
    },

    _doc: function (ent) { return this.db.collection("empresas").doc(this.uid).collection("dados").doc(ent); },

    // Une lista local + nuvem por id; o registro com atualizadoEm mais novo vence.
    // LOTE 3: edição concorrente (2 aparelhos) NÃO é mais sobrescrita calada —
    // o vencedor guarda a cópia perdedora em _conflitoDe (até ~50KB; acima
    // disso, só metadados) e o contador alimenta o aviso pós-sync.
    _conflitosUltimoMerge: 0,

    /* ===== v1.1.232 — MARCAS DA ÚLTIMA SINCRONIZAÇÃO =====
       O merge antigo tratava QUALQUER diferença de atualizadoEm como "editado
       em 2 aparelhos": bastava A trabalhar um dia e B abrir o app para B ver o
       aviso de conflito — em edição normal, vinda de UM aparelho só. Pior: o
       vencedor ganhava uma cópia integral do perdedor (_conflitoDe) que subia
       para a nuvem e, a cada ida-e-volta, aninhava a anterior.
       A marca resolve: guarda, por registro, o atualizadoEm da última versão
       que ESTE aparelho sincronizou. Se um dos lados ainda está na marca, ele
       simplesmente não foi editado desde o último sync — é propagação, não
       conflito. Conflito de verdade é quando OS DOIS saíram da marca.
       "_syncmarcas" fica fora de ENTIDADES de propósito: é estado do aparelho,
       não dado do usuário — não sobe nem entra em backup. */
    _marcasDe: function (empresaId, ent) {
      try { var m = Store.adapter.ler(empresaId, "_syncmarcas", {}); return (m && m[ent]) || {}; } catch (e) { return {}; }
    },
    _marcarSync: function (empresaId, ent, lista) {
      if (ent === "prefs" || ent === "conta") return;
      try {
        var m = Store.adapter.ler(empresaId, "_syncmarcas", {}) || {};
        var mm = {};
        Util.arr(lista).forEach(function (o) { if (o && o.id) mm[o.id] = String(o.atualizadoEm || ""); });
        m[ent] = mm;
        var antes = this._aplicandoDaNuvem;
        this._aplicandoDaNuvem = true; // marca não é dado: nunca dispara push
        try { Store.adapter.gravar(empresaId, "_syncmarcas", m); }
        finally { this._aplicandoDaNuvem = antes; }
      } catch (e) {}
    },

    _merge: function (local, cloud, ent, empresaId) {
      if (ent === "prefs" || ent === "conta") {
        // objeto único (prefs, conta mestre): mescla campo a campo; o mais novo (atualizadoEm) vence
        var l = local || {}, c = cloud || {};
        if (ent === "conta" && c.atualizadoEm && (!l.atualizadoEm || String(c.atualizadoEm) > String(l.atualizadoEm))) return Object.assign({}, l, c);
        var r = Object.assign({}, c, l);
        /* ⚠ O NOME DA PESSOA NAO PODE OBEDECER AO "LOCAL VENCE".
         * `prefs` inteiro se resolve com o local ganhando, e para preferencia
         * de tela isso esta certo. Para o `nomeDono` nao: e o nome que assina
         * as aprovacoes, e cada aparelho ficaria com uma resposta diferente
         * para a MESMA pessoa — o computador assinando um nome e o celular
         * outro, sem nunca convergirem, porque cada um reempurra o proprio
         * valor. E apagar seria impossivel: o aparelho que ainda tem o nome
         * traria de volta no sync seguinte.
         * Por isso ele viaja com `nomeDonoEm` e vence o mais NOVO — mesma
         * regra que a `conta` ja usava, aplicada a um campo so. Ausencia de
         * carimbo dos dois lados mantem o comportamento antigo.
         * ⚠ E `delete` tem de ser respeitado: o lado mais novo pode ser o que
         * NAO tem a chave (o dono apagou o proprio nome). Por isso o teste e
         * na DATA, e a chave e removida quando o vencedor nao a tem. */
        var lEm = String(l.nomeDonoEm || ""), cEm = String(c.nomeDonoEm || "");
        if (cEm && cEm > lEm) {
          if (Object.prototype.hasOwnProperty.call(c, "nomeDono")) r.nomeDono = c.nomeDono;
          else delete r.nomeDono;
          r.nomeDonoEm = c.nomeDonoEm;
        }
        return r;
      }
      var self = this;
      var byId = {};
      /* quem foi excluído (em qualquer aparelho) não volta: a lápide vence o registro
       * mais antigo que ela. A própria lista de lápides não se filtra. */
      var semLapide = (ent === "_lapides" || !empresaId);
      var marcas = empresaId ? this._marcasDe(empresaId, ent) : {};
      var mortos = semLapide ? Object.create(null) : Store.lapidesDe(empresaId, ent);
      /* obra apagada em cascata: o que APONTA para ela morreu junto (1 lápide cobre o lote).
       * Exceto os cadastros da empresa (equipe, patrimônio, frota): a exclusão só os
       * DESVINCULA, e aplicar a cascata neles apagaria no outro aparelho justamente o que
       * o modal promete preservar. Achado do gate de 25/07. */
      var imune = !semLapide && Store.imuneACascata(ent);
      var obrasMortas = semLapide ? Object.create(null) : Store.cascatasDeObra(empresaId);
      /* ⚠ E a cascata do TESTE de compatibilização, pelo mesmo motivo: o teste
         é dono de milhares de resultados, e uma lápide por resultado estourava
         o teto. Só vale para `bim_clash_resultados` — é a única entidade que
         carrega `testeId`. */
      var testesMortos = (semLapide || ent !== "bim_clash_resultados" || !Store.cascatasDeClashTeste)
        ? Object.create(null) : Store.cascatasDeClashTeste(empresaId);
      /* ⚠ A PODA APAGA UM SUBCONJUNTO do teste, e o teste continua vivo —
         então ela precisa da própria consulta. Sem esta linha, o conflito
         podado num aparelho voltava do outro no primeiro sync e a limpeza se
         desfazia sozinha: o coordenador limpava 800 registros, via o número
         cair, e no dia seguinte estava tudo lá de novo — sem erro em lugar
         nenhum. Pior que não ter limpado, porque ele conta com a limpeza
         para sair do teto. */
      var podados = (semLapide || ent !== "bim_clash_resultados" || !Store.cascatasDeClashPoda)
        ? Object.create(null) : Store.cascatasDeClashPoda(empresaId);
      /* ⚠ O ADITIVO É FILHO DO CONTRATO, NÃO DA OBRA — e por isso a cascata da
       * obra não pode julgá-lo pelo `obraId` que ele carrega.
       *
       * Esse `obraId` é uma CÓPIA feita quando o aditivo nasceu, e o campo Obra
       * do contrato é editável. Contrato que nasce na obra A, recebe o 01º TA
       * aprovado e depois é movido para a obra B deixa o aditivo com
       * `obraId: "A"`. Apagar a obra A grava a lápide de cascata dela, e aqui o
       * merge descartava — em TODOS os aparelhos e de forma definitiva — um
       * termo aditivo APROVADO de um contrato VIVO da obra B. O teto de
       * faturamento de B caía, e os boletins já aprovados que só cabiam por
       * causa dele passavam a exceder o contratado.
       *
       * A pergunta certa é sobre o PAI: se o contrato ainda existe, o aditivo
       * vive. Se o contrato morreu junto com a obra, o aditivo morre com ele —
       * e a exclusão legítima continua propagando pela lápide própria que a
       * cascata passou a gravar (js/gestao.js, `_excluirObra`). */
      var contratosVivos = (!semLapide && ent === "aditivos")
        ? (function () {
            var m = Object.create(null);
            try {
              Util.arr(Store.listar(empresaId, "contratos")).forEach(function (c) { if (c && c.id) m[c.id] = 1; });
            } catch (e) {}
            return m;
          })()
        : Object.create(null);
      var vivo = function (o) {
        var t = mortos[o.id];
        /* ⚠ `>=`, NÃO `>` — E A DIFERENÇA PASSOU A IMPORTAR NA v1.2.
         * `Util.agoraISO()` tem resolução de MILISSEGUNDO. Quando um registro é
         * apagado e regravado na mesma volta do laço — que é o que
         * `_prodSalvarPrecos` faz ao recolher duplicados para o id
         * determinístico —, a lápide e o carimbo do registro saem com a MESMA
         * string, e o `>` estrito conta empate como MORTO. Medido em bancada:
         * 198 de 200 merges apagavam o preço recém-gravado, e 197 de 200
         * apagavam a cotação recém-informada.
         * Antes isso era impossível: um registro recriado ganhava um uid novo e
         * nunca colidia com a própria lápide. Com id derivado da chave natural,
         * colide.
         * O empate agora favorece o REGISTRO, e é a escolha certa: uma exclusão
         * que não pega é visível (a pessoa apaga de novo); um registro que some
         * calado, não. */
        if (t) return String(o.atualizadoEm || "") >= String(t); // recriado depois de excluir → mantém
        if (o.obraId && obrasMortas[o.obraId]) {
          /* cadastro da empresa (equipe, patrimônio, frota): a obra morreu, ele não. Faz aqui o
           * mesmo que a exclusão faz localmente — solta o vínculo — em vez de deixá-lo apontando
           * para uma obra que não existe. Antes ele era APAGADO, contra o que o modal promete. */
          if (imune) { o.obraId = ""; o.obraNome = ""; return true; }
          /* ⚠ o aditivo é julgado pelo CONTRATO pai, não pelo `obraId` que ele
             copiou ao nascer (ver o índice `contratosVivos` acima). Contrato
             vivo → o aditivo vive, mesmo que a obra do carimbo tenha morrido. */
          if (ent === "aditivos" && o.contratoId && contratosVivos[o.contratoId]) return true;
          /* filho de verdade: NÃO há ressalva. Se houvesse, uma edição feita no outro aparelho
           * depois da exclusão devolveria o registro para sempre — órfão, apontando para uma
           * obra que não existe mais e sem tela que o mostre. */
          return false;
        }
        if (ent === "obras" && obrasMortas[o.id]) return String(o.atualizadoEm || "") > String(obrasMortas[o.id]);
        /* o resultado morre com o teste que o gerou, a menos que ele seja MAIS
           NOVO que a lápide — o mesmo desempate do `obraId` logo acima, que
           deixa passar o registro editado depois da exclusão noutro aparelho. */
        if (o.testeId && testesMortos[o.testeId]) return String(o.atualizadoEm || "") > String(testesMortos[o.testeId]);
        /* mesmo desempate: o registro EDITADO depois da poda noutro aparelho
           volta — quem escreveu responsavel num conflito que aqui era só um
           `resolvido_auto` sem dono tem razão, e a poda aqui não sabia disso. */
        if (podados[o.id]) return String(o.atualizadoEm || "") > String(podados[o.id]);
        return true;
      };
      Util.arr(cloud).forEach(function (o) { if (o && o.id && vivo(o)) byId[o.id] = o; });
      Util.arr(local).forEach(function (o) {
        if (!o || !o.id || !vivo(o)) return;
        var c = byId[o.id];
        if (!c) { byId[o.id] = o; return; }
        var tl = String(o.atualizadoEm || ""), tc = String(c.atualizadoEm || "");
        if (tl === tc) { byId[o.id] = o; return; } // mesma versão: sem conflito
        var venc = tl > tc ? o : c, perd = tl > tc ? c : o;
        /* Um dos lados ainda está na marca do último sync? Então SÓ o outro
           editou — propagação normal, o mais novo vence e ponto. O ramo de
           conflito fica reservado para o caso real: os dois saíram da marca. */
        var marca = String(marcas[o.id] || "");
        if (marca && (tl === marca || tc === marca)) { byId[o.id] = venc; return; }
        try {
          /* cópia SEM o _conflitoDe do perdedor: aninhar a cadeia inteira fazia
             o registro crescer a cada ida-e-volta (provado em Node: 2ª rodada
             já carregava 3 versões dentro de si) */
          var raso = perd;
          if (perd && perd._conflitoDe) { raso = Object.assign({}, perd); delete raso._conflitoDe; }
          var json = JSON.stringify(raso);
          venc._conflitoDe = (json.length <= 51200)
            ? { em: perd.atualizadoEm || "", quando: new Date().toISOString(), copia: raso }
            : { em: perd.atualizadoEm || "", quando: new Date().toISOString(), resumo: String(perd.nome || perd.numero || perd.id) };
          self._conflitosUltimoMerge++;
        } catch (e) {}
        byId[o.id] = venc;
      });
      return Object.keys(byId).map(function (k) { return byId[k]; });
    },

    // 1ª carga: baixa a nuvem, mescla com o local e grava nos dois (não perde nada).
    /* ============================================================
     * ⚠⚠ O DONO DO TENANT — a trava que faltava, e custou um incidente
     *
     * A conta da nuvem é derivada SÓ da chave de licença (`_credLicenca`), e o
     * `empresaId` local NÃO entra no caminho do Firestore. Consequência: duas
     * empresas com a mesma chave caíam no MESMO documento e o merge misturava
     * tudo — obras, equipe, conta do dono, foto — nos dois sentidos, sem uma
     * linha de aviso. Foi o que aconteceu em 27/08/2026 entre duas empresas
     * reais, depois que um aparelho já licenciado abriu um link `?lic=` de
     * outra licença e trocou de chave em silêncio.
     *
     * A partir daqui o tenant tem DONO gravado. Quem chega primeiro registra a
     * empresa; quem chega depois com outra identidade NÃO sincroniza — para,
     * avisa e deixa os dois lados intactos. Recusar a sincronização é sempre
     * recuperável; misturar as bases de duas empresas não é.
     *
     * ⚠ Não apaga nem move nada: é um portão de leitura antes do merge.
     * ============================================================ */
    DOC_DONO: "_dono",
    /* ⚠⚠ ONDE O NOME DA EMPRESA MORA DE VERDADE.
     *
     * A primeira versão disto lia `prefs.empresa` / `prefs.nomeEmpresa` — e
     * NINGUÉM no app inteiro grava esses dois campos. Esta linha era a única
     * referência a eles no repositório. Consequência: `empresa` saía SEMPRE
     * vazio, os dois ramos de contradição por nome viravam código morto, e a
     * trava toda encolhia para "e-mail de conta mestre contra e-mail" — que a
     * maioria dos clientes solo nem tem. Ou seja: o portão publicado para
     * separar duas empresas não separava quase ninguém.
     *
     * ⚠ E O TESTE NÃO VIA porque a fixture dele inventava `{empresa:'ACME'}`,
     *   um formato que o disco de nenhum cliente tem. Fixture que não imita a
     *   produção mede outra coisa — é a segunda vez no mesmo dia.
     *
     * O nome e o CNPJ vivem em `prefs.responsavelTecnico` (js/empresa.js). O
     * CNPJ é a melhor prova que existe aqui: é único por empresa, o cliente
     * digita uma vez e não muda. Vem primeiro. */
    _idDono: function (empresaId) {
      var nome = "", cnpj = "", email = "";
      try {
        var p = Store.lerPrefs(empresaId) || {};
        var rt = p.responsavelTecnico || {};
        nome = String(rt.nome || "").trim();
        cnpj = String(rt.cnpj || "").replace(/\D/g, "");
      } catch (e) {}
      try {
        if (typeof Auth !== "undefined" && Auth.contaMestre) { var c = Auth.contaMestre(empresaId) || {}; email = String(c.email || "").trim().toLowerCase(); }
      } catch (e2) {}
      return { empresaId: String(empresaId || ""), empresa: nome, cnpj: cnpj, email: email };
    },
    /* Devolve Promise<{ok:true}> ou Promise<{ok:false, dono:…}> — nunca rejeita:
       falha de rede aqui não pode barrar a sincronização de quem está certo. */
    _conferirDono: function (empresaId) {
      var self = this, meu = this._idDono(empresaId);
      /* ⚠ sem `db`/`uid` não há balde para conferir — e o portão NÃO pode ser o
         que derruba a sincronização. Guarda que explode é pior que guarda que
         falta: aqui ela reprovaria quem está certo, com um TypeError. */
      if (!this.db || !this.uid) return Promise.resolve({ ok: true });
      return this.db.collection("empresas").doc(this.uid).collection("dados").doc(this.DOC_DONO).get()
        .then(function (snap) {
          var dono = snap.exists ? (snap.data() || {}).v : null;
          if (!dono || !dono.empresaId) {
            /* tenant novo (ou de antes desta trava): este aparelho o assume */
            return self.db.collection("empresas").doc(self.uid).collection("dados").doc(self.DOC_DONO)
              .set({ v: meu, em: Date.now() }).then(function () { return { ok: true, assumiu: true }; })
              .catch(function () { return { ok: true }; });
          }
          /* ⚠⚠ BLOQUEIA POR PROVA, NUNCA POR FALTA DE PROVA.
           *
           * A primeira versão desta função reprovava quando não achava
           * semelhança — e isso teria derrubado a sincronização de CLIENTE
           * LEGÍTIMO. O `empresaId` nasce local e difere entre aparelhos da
           * mesma empresa; a conta mestre pode nem existir (uso solo); o nome
           * da empresa pode estar em branco. Nesses casos não há contradição
           * nenhuma, só ignorância — e ignorância não pode trancar ninguém
           * fora dos próprios dados. Seriam 38 empresas sem sincronizar por
           * causa de uma trava criada para proteger duas.
           *
           * Então: qualquer indício de que é a MESMA empresa libera; só uma
           * contradição EXPLÍCITA (dois e-mails de dono diferentes, ou dois
           * nomes de empresa diferentes) fecha o portão. É o caso do incidente
           * — lá os dois lados tinham e-mail, e eram outros. */
          function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
          /* ⚠ A ADOÇÃO SÓ VALE PARA O MESMO APARELHO/LINHAGEM.
           *
           * A versão anterior deixava QUALQUER aparelho com identidade gravar
           * por cima de um dono anônimo. Isso invertia o portão: o intruso que
           * cai na chave alheia e tem conta mestre vira DONO registrado, e o
           * cliente legítimo — que ainda não tinha configurado admin — passa a
           * ser BLOQUEADO do próprio balde, lendo na tela que a licença dele
           * "já é usada por" o e-mail do intruso. A vítima levava a punição.
           *
           * Aqui a régua é: o registro só ganha identidade pelo aparelho que
           * JÁ CONSTA como dono (mesmo `empresaId`). Ele não está tomando
           * posse — está completando a própria ficha. */
          if (dono.empresaId && meu.empresaId && dono.empresaId === meu.empresaId) {
            var faltaFicha = (!dono.email && meu.email) || (!dono.empresa && meu.empresa) || (!dono.cnpj && meu.cnpj);
            if (faltaFicha) {
              return self.db.collection("empresas").doc(self.uid).collection("dados").doc(self.DOC_DONO)
                .set({ v: meu, em: Date.now() }).then(function () { return { ok: true, adotou: true }; })
                .catch(function (e) { try { self._registrarFalha(self.DOC_DONO, e); } catch (_) {} return { ok: true }; });
            }
            return { ok: true };
          }
          /* CNPJ primeiro: é único por empresa e o cliente digita uma vez só */
          if (meu.cnpj && dono.cnpj) return norm(meu.cnpj) === norm(dono.cnpj) ? { ok: true } : { ok: false, dono: dono, meu: meu };
          if (meu.email && dono.email) return norm(meu.email) === norm(dono.email) ? { ok: true } : { ok: false, dono: dono, meu: meu };
          if (meu.empresa && dono.empresa) return norm(meu.empresa) === norm(dono.empresa) ? { ok: true } : { ok: false, dono: dono, meu: meu };
          return { ok: true, semProva: true };   // nem a favor nem contra: passa
        })
        .catch(function () { return { ok: true }; });   // sem rede: não bloqueia quem está certo
    },
    /* motivo do último bloqueio, para a tela explicar sem adivinhar */
    bloqueioDeDono: null,

    sincronizar: function (empresaId) {
      if (_ehPrevia(empresaId)) return Promise.resolve(false);   // prévia nunca sobe
      var self = this;
      if (!this.ligado) return Promise.resolve(false);
      return this._conferirDono(empresaId).then(function (v) {
        if (v && v.ok === false) {
          self.bloqueioDeDono = v;
          /* ⚠ FECHA O QUE JÁ ESTÁ ABERTO. Barrar `escutar` só impede abrir
             ouvinte NOVO; os que o boot abriu continuam vivos e seguem
             despejando a base da outra empresa neste aparelho a cada alteração
             lá. Meia porta é porta aberta — e era o próprio defeito que este
             portão veio fechar. */
          try { self._un.forEach(function (u) { try { u(); } catch (_) {} }); self._un = []; self._escutando = null; } catch (eU) {}
          try {
            /* ⚠ NÃO expor dado de terceiro. Antes o aviso mostrava o e-mail do
               administrador da OUTRA empresa na tela deste cliente — e como o
               nome vinha sempre vazio, era SEMPRE o e-mail. Para agir, basta ele
               saber que a chave é de outra empresa. */
            var quem = v.dono.empresa ? ("“" + v.dono.empresa + "”") : "outra empresa";
            if (typeof UI !== "undefined" && UI.toast) {
              UI.toast("Sincronização BLOQUEADA: esta licença já é usada por " + quem
                + ". Nada foi misturado. Use uma licença própria neste aparelho.", "erro");
            }
          } catch (eT) {}
          return false;
        }
        self.bloqueioDeDono = null;
        return self._sincronizarAgora(empresaId);
      });
    },
    _sincronizarAgora: function (empresaId) {
      var self = this;
      self._conflitosUltimoMerge = 0;
      var falhou = 0, tentadas = 0;
      var uma = function (ent) {
        tentadas++;
        return self._doc(ent).get().then(function (snap) {
          var cloud = snap.exists ? snap.data().v : null;
          var local = lerEnt(empresaId, ent);
          var merged = self._merge(local, cloud, ent, empresaId);
          /* cercado: o gravar está monkey-patched e, sem a cerca, dispararia um
             push por entidade — 27 escritas extras a cada sincronização */
          self._aplicandoDaNuvem = true;
          try { Store.adapter.gravar(empresaId, ent, merged); }
          finally { self._aplicandoDaNuvem = false; }
          /* ⚠ v1.1.235 — A MARCA TAMBÉM NASCE AQUI. Ela só era gravada no
             push deste aparelho; quem apenas RECEBIA (o celular que abre o app
             depois de o escritório trabalhar) nunca tinha marca, a guarda do
             _merge não valia e o falso "editado em 2 aparelhos" continuava
             aparecendo — exatamente o que a v1.1.232 anunciou ter fechado.
             A base comum é o que ficou igual nos DOIS lados, não só o que
             este aparelho subiu. */
          self._marcarSync(empresaId, ent, merged);
          var carga = "";
          try { carga = JSON.stringify(merged); } catch (e) { carga = ""; }
          /* nada mudou dos dois lados? não sobe. Antes subia sempre, e o
             `em: Date.now()` fazia o outro aparelho reagir a uma escrita que
             não trazia dado nenhum — o começo do laço. */
          var ck = empresaId + "|" + ent;
          if (carga && self._ultimoEnviado[ck] === carga) return true;
          self._ultimoEnviado[ck] = carga;
          return self._doc(ent).set({ v: merged, em: Date.now() }).then(function () { return true; });
        }).catch(function (e) {
          /* NÃO engolir: 32 de 32 entidades reprovadas viravam "sincronizado". */
          falhou++;
          delete self._ultimoEnviado[empresaId + "|" + ent];
          self._registrarFalha(ent, e);
          return false;
        });
      };
      // as LÁPIDES vêm primeiro: as demais entidades consultam essa lista para não
      // ressuscitar o que já foi excluído em outro aparelho
      return uma("_lapides").then(function () {
        Store.podarLapidesDe(empresaId); // o teto só valia nas exclusões locais
        return Promise.all(ENTIDADES.filter(function (e) { return e !== "_lapides"; }).map(uma));
      }).then(function () {
        if (self._conflitosUltimoMerge > 0) {
          try {
            if (global.UI && global.UI.toast) global.UI.toast("⚠ " + self._conflitosUltimoMerge + " registro(s) editados em 2 aparelhos ao mesmo tempo — a versão mais recente venceu e a anterior ficou guardada dentro do registro (não se perdeu nada).", "erro");
          } catch (e) {}
        }
        /* Devolve FALSO quando tudo falhou. Antes devolvia `true` mesmo com as
           32 entidades reprovadas, e quem chamou anunciava "☁ Sincronizado!"
           sem um único byte ter subido. */
        if (falhou >= tentadas && tentadas > 0) return false;
        if (falhou > 0) {
          try {
            if (global.UI && global.UI.toast) global.UI.toast("☁ Sincronização parcial: " + falhou + " de " + tentadas + " partes não subiram. O trabalho está salvo neste aparelho e vai de novo sozinho.", "erro");
          } catch (e) {}
        }
        return true;
      });
    },

    // Escuta mudanças vindas de OUTRO aparelho e atualiza o local + re-render.
    escutar: function (empresaId, onChange) {
      if (_ehPrevia(empresaId)) return;                          // nem escuta
      var self = this;
      if (!this.ligado) return;
      /* ⚠ tenant de OUTRA empresa: não escuta. Bloquear só o `sincronizar`
         fecharia meia porta — o ouvinte ao vivo continuaria despejando a base
         alheia aqui a cada alteração lá. */
      if (this.bloqueioDeDono) return;

      /* IDEMPOTENTE — sem isto, cada chamada empilhava um jogo INTEIRO de
       * listeners nos MESMOS documentos, e nada era cancelado. São três os
       * caminhos que chamam: o boot (_conectarNuvemLicenca), o login (entrar) e
       * o botão "Sincronizar agora" (abrirNuvem) — este último sem guarda
       * nenhuma, ou seja, cada clique somava outro jogo.
       *
       * Reproduzido no navegador com 27 entidades: boot 27 → login 54 →
       * 1º clique 81 → 2º clique 108 listeners, ZERO cancelamentos. E o custo
       * não é só memória: cada callback duplicado dispara um _lapides.get() de
       * REDE (linha ~222), então uma sincronização com 4 jogos vira uma rajada
       * de ~104 leituras. É assim que o SDK acaba anunciando
       * "Using maximum backoff delay to prevent overloading the backend" —
       * a partir daí ele só tenta de minuto em minuto, e a sincronização do
       * cliente fica lenta ou para.
       *
       * Reescutar o MESMO tenant é no-op; trocar de tenant cancela o anterior
       * (senão o aparelho continuaria recebendo dados da empresa antiga). */
      if (this._escutando === empresaId && this._un.length) return;
      if (this._un.length) {
        this._un.forEach(function (u) { try { u(); } catch (e) {} });
        this._un = [];
      }
      this._escutando = empresaId;
      /* As lápides precisam estar em dia ANTES de mesclar qualquer entidade — senão o
       * aparelho ainda não sabe o que foi apagado, aceita o registro velho e o reempurra
       * pra nuvem (ressurreição em pingue-pongue). Por isso a escuta de cada entidade
       * baixa as lápides primeiro; e o push manda "_lapides" na frente, sem debounce. */
      /* `_aplicandoDaNuvem` cerca TODA gravação de dado que veio de fora, para
       * o patch do Store não empurrar de volta. Sem esta cerca aqui — e a
       * daquele get de lápides logo abaixo era a pior delas, porque rodava a
       * cada snapshot de cada uma das outras entidades — dois aparelhos ligados
       * entram num laço de escrita que não converge. */
      var deFora = function (ent2, valor) {
        self._aplicandoDaNuvem = true;
        try { Store.adapter.gravar(empresaId, ent2, valor); }
        finally { self._aplicandoDaNuvem = false; }
        // v1.1.235 — aplicado da nuvem = nova base comum (ver nota no sincronizar)
        self._marcarSync(empresaId, ent2, valor);
      };
      var comLapides = function (fn) {
        return self._doc("_lapides").get().then(function (s) {
          if (s.exists) deFora("_lapides", self._merge(Store.adapter.ler(empresaId, "_lapides", []), s.data().v, "_lapides", empresaId));
        }).catch(function () {}).then(fn);
      };
      ENTIDADES.forEach(function (ent) {
        var un = self._doc(ent).onSnapshot(function (snap) {
          if (!snap.exists) return;
          if (snap.metadata && snap.metadata.hasPendingWrites) return; // ignora o eco do próprio write
          var cloud = snap.data().v;
          var aplicar = function () {
            var local = lerEnt(empresaId, ent);
            var merged = self._merge(local, cloud, ent, empresaId);
            /* nada mudou depois do merge? então não grava e não avisa a tela —
               gravar aqui acionaria o patch e reabriria o caminho do laço */
            var a = "", b = "";
            try { a = JSON.stringify(local); b = JSON.stringify(merged); } catch (e) { a = "x"; b = "y"; }
            if (a === b) return;
            deFora(ent, merged);
            if (typeof onChange === "function") onChange(ent);
          };
          if (ent === "_lapides") aplicar(); else comLapides(aplicar);
        }, function (err) {
          /* handler de erro VAZIO era o que escondia a parada: o SDK encerra o
             listener de vez em permission-denied e em resource-exhausted, e o
             app seguia mostrando "conectado" para sempre. */
          self._registrarFalha(ent, err);
        });
        self._un.push(un);
      });
    },

    /* ---------- ESTADO HONESTO DA SINCRONIZAÇÃO ----------
     * Sem isto o app dizia "☁ Sincronizado!" sem ter feito uma única leitura
     * ou escrita. Agora toda falha fica registrada e a tela tem o que mostrar. */
    _falhas: [],
    _registrarFalha: function (ent, err) {
      var cod = (err && (err.code || err.message)) || "erro";
      /* guarda também a mensagem: o Firestore diz "invalid-argument" no
         `code` para várias coisas, e só o texto separa documento grande demais
         de campo mal formado — e são duas conversas diferentes com o usuário */
      this._falhas.push({ entidade: ent, codigo: String(cod), msg: String((err && err.message) || "") });
      if (this._falhas.length > 40) this._falhas.shift();
      try { console.warn("[nuvem] " + ent + ": " + cod); } catch (e) {}
    },
    /* Resumo para a tela: quantas falhas e de que tipo. `cota` é o caso que
     * derruba a sincronização do cliente inteiro e precisa de nome próprio. */
    estado: function () {
      var f = this._falhas || [];
      var cota = f.some(function (x) { return /resource-exhausted|RESOURCE_EXHAUSTED|quota/i.test(x.codigo); });
      var permissao = f.some(function (x) { return /permission-denied/i.test(x.codigo); });
      /* ⚠ DOCUMENTO GRANDE DEMAIS TAMBÉM É SINCRONIZAÇÃO PARADA. O Firestore
         recusa documento acima de 1 MiB com `invalid-argument`, e só aquela
         entidade para — mas para de vez, porque o `_ultimoEnviado` é limpo e
         toda tentativa seguinte refalha. Sem estar aqui, `ok` continuava true e
         a tela dizia "Sincronizado" com a lista de conflitos parada no
         aparelho. Mesmo modo de falha do bloqueio, por um caminho novo. */
      var grande = f.some(function (x) { return /invalid-argument|too large|exceeds the maximum|maximum size/i.test(x.codigo + " " + (x.msg || "")); });
      /* ⚠ O BLOQUEIO TEM DE APARECER AQUI. Ele não passa por `_registrarFalha`,
         então `falhas` continuava 0 e `ok` continuava true — e a tela dizia
         "Conectado, sincronizam sozinhos" com o aparelho sem sincronizar nada.
         É o mesmo modo de falha que "anunciar sucesso só com sucesso" já tinha
         fechado, reaberto por um caminho novo. */
      var bloq = this.bloqueioDeDono || null;
      return {
        ligado: !!this.ligado,
        autenticado: !!(this.auth && this.auth.currentUser),
        escutando: !!(this._un && this._un.length),
        falhas: f.length,
        cotaEstourada: cota,
        semPermissao: permissao,
        listaGrandeDemais: grande,
        bloqueadoOutraEmpresa: !!bloq,
        donoDoBalde: bloq ? (bloq.dono && (bloq.dono.empresa || "")) : "",
        ok: !!this.ligado && !bloq && !!(this._un && this._un.length) && !cota && !permissao && !grande
      };
    },

    /* Monkey-patch: toda gravação do Store também empurra pra nuvem.
     *
     * ⚠ `_aplicandoDaNuvem` é o que impede o PINGUE-PONGUE INFINITO. O que
     * acontecia com dois aparelhos do mesmo cliente ligados — computador e
     * celular, exatamente o cenário que o app passou a incentivar:
     *
     *   A grava algo → sobe → B recebe o snapshot → B chama gravar(merged) →
     *   este patch empurra de volta → A recebe → A grava → empurra → …
     *
     * e não parava nunca, porque o documento carrega `em: Date.now()` e por
     * isso MUDA a cada volta, mesmo sem nenhum dado novo. No `_lapides`, que
     * subia sem espera nenhuma, isso virava várias escritas por segundo no
     * MESMO documento — muito acima do que o Firestore aceita (≈1/s por
     * documento). O servidor responde RESOURCE_EXHAUSTED, e é literalmente o
     * único caso em que o SDK escreve no console
     * "Using maximum backoff delay to prevent overloading the backend".
     * Daí em diante o cliente para de sincronizar — e a tela continuava
     * dizendo "✅ Conectado".
     *
     * Dado que veio da nuvem não volta para a nuvem. Ponto. */
    _aplicandoDaNuvem: false,

    _patch: function () {
      if (this._patched) return; this._patched = true;
      var self = this, orig = Store.adapter.gravar.bind(Store.adapter);
      Store.adapter.gravar = function (empresaId, entidade, valor) {
        var ok = orig(empresaId, entidade, valor);
        if (ok && self.ligado && !self._aplicandoDaNuvem && ENTIDADES.indexOf(entidade) >= 0) self.push(empresaId, entidade);
        return ok;
      };
    },

    /* Empurra uma entidade pra nuvem (debounce por entidade).
     *
     * SEGUNDA TRAVA, independente da primeira: só escreve se o conteúdo mudou
     * de verdade. Guardamos a última carga enviada por entidade e comparamos —
     * escrita que não muda nada é escrita que só serve para gastar cota e
     * acordar o outro aparelho. Com isto, mesmo que algum caminho novo escape
     * do `_aplicandoDaNuvem`, o laço morre na primeira volta.
     *
     * As LÁPIDES continuam na frente das demais (a exclusão precisa chegar
     * antes da lista sem os registros, senão o outro aparelho devolve tudo
     * achando que só sumiu), mas não mais SEM espera: 150 ms bastam para vir
     * à frente e já respeitam o limite por documento. */
    _ultimoEnviado: {},
    /* uma vez por entidade por sessão: aviso que aparece a cada push vira ruído
       e a pessoa para de ler justamente o que precisa ler */
    _avisouTamanho: {},

    push: function (empresaId, ent) {
      /* ⚠ e não SOBE para tenant de outra empresa: a metade de ida do mesmo
         portao. Sem isto, o bloqueio pararia de trazer e continuaria mandando. */
      if (this.bloqueioDeDono) return;
      if (_ehPrevia(empresaId)) return Promise.resolve(false);   // nem lápide
      var self = this;
      var mandar = function () {
        try {
          var v = lerEnt(empresaId, ent);
          var carga = "";
          try { carga = JSON.stringify(v); } catch (e) { carga = ""; }
          var chave = empresaId + "|" + ent;
          if (carga && self._ultimoEnviado[chave] === carga) return;   // nada mudou: não escreve
          /* ⚠ O DOCUMENTO DO FIRESTORE TEM TETO DE 1 MiB, E A ENTIDADE INTEIRA
           * VAI NUM DOCUMENTO SÓ. Não havia guarda nenhuma de tamanho aqui: ao
           * passar do teto a escrita simplesmente falha, e a partir daí o
           * aparelho para de sincronizar AQUELA entidade — em silêncio, com a
           * tela continuando a mostrar tudo certo localmente.
           * A conta é alcançável antes de o localStorage encher: a ~940 bytes
           * por diário, a lista de RDO passa de 1 MiB por volta de 1.100
           * diários. Avisar a 900 KB dá margem para o cliente pedir socorro
           * ANTES de o dado deixar de subir.
           * Aviso, e não bloqueio: barrar o push aqui seria parar a
           * sincronização por conta própria — exatamente o que se quer evitar. */
          /* ⚠ UMA VEZ POR VERSÃO, NÃO POR SESSÃO. A memória de sessão zera
             todo dia, e o cliente com uma lista grande não tem como resolver
             isso sozinho ("fale com o suporte") — ele veria o mesmo aviso
             vermelho toda manhã, para sempre, até parar de ler os avisos. A
             marca persistente carrega a versão: quando sair uma versão que
             mexa nisso, ele volta a ser avisado uma vez. */
          var marcaTam = "orcapro:nuvem:grande:" + ent;
          /* ⚠ `global.CONFIG` nos TRÊS níveis. A primeira versão desta linha
             misturava `global.CONFIG &&` com `CONFIG.app` nu: onde a global
             não existisse, o guard passava e a linha seguinte estourava
             ReferenceError — derrubando o push inteiro em vez de cair no "?".
             No navegador funcionaria por acaso, porque lá `CONFIG` é global. */
          var verAtual = (global.CONFIG && global.CONFIG.app && global.CONFIG.app.versao) || "?";
          var jaAvisado = self._avisouTamanho[ent];
          if (!jaAvisado) {
            try { jaAvisado = global.localStorage.getItem(marcaTam) === verAtual; } catch (eL) {}
          }
          if (carga.length > 900 * 1024 && !jaAvisado) {
            self._avisouTamanho[ent] = 1;
            try { global.localStorage.setItem(marcaTam, verAtual); } catch (eL2) {}
            try {
              if (global.UI && global.UI.toast) global.UI.toast(
                "⚠ A lista \"" + ent + "\" já tem " + Math.round(carga.length / 1024)
                + " KB e está perto do limite de 1 MB por lista da nuvem. Perto disso ela PARA de sincronizar, sem aviso."
                + " Faça backup e fale com o suporte antes que isso aconteça.", "erro");
            } catch (eT) {}
            try { console.warn("[nuvem] entidade grande:", ent, Math.round(carga.length / 1024) + " KB"); } catch (eC) {}
          }
          self._ultimoEnviado[chave] = carga;
          self._doc(ent).set({ v: v, em: Date.now() }).then(function () {
            self._marcarSync(empresaId, ent, v); // o que subiu vira a base comum
          }).catch(function (e) {
            /* a escrita falhou: esquece a marca, senão a próxima tentativa
               acharia que já subiu e o dado ficaria só no aparelho */
            delete self._ultimoEnviado[chave];
            self._registrarFalha(ent, e);
          });
        } catch (e) {}
      };
      /* ⚠ RECONFERE NA HORA DE MANDAR. A guarda de cima roda no AGENDAMENTO;
         o envio acontece 900 ms depois (150 ms para as lápides). Um bloqueio que
         chega no meio não cancelava o timer, e o que subia era a entidade
         INTEIRA para o documento da outra empresa. Pior com `_lapides`: os ids
         determinísticos (código do insumo, código da composição) COLIDEM entre
         empresas, e uma lápide dessas apaga o registro legítimo do outro lado. */
      var mandarSeLiberado = function () { if (self.bloqueioDeDono) return; mandar(); };
      if (ent === "_lapides") { clearTimeout(this._push[ent]); this._push[ent] = setTimeout(mandarSeLiberado, 150); return; }
      clearTimeout(this._push[ent]);
      this._push[ent] = setTimeout(mandarSeLiberado, 900);
    },

    /* DESLIGAMENTO PELO USUÁRIO — é a revogação de consentimento da LGPD.
     *
     * `sair()` sozinho só valia até fechar o app: no boot seguinte o
     * _conectarNuvemLicenca reconectava pela chave de licença e a sincronização
     * voltava sem o usuário pedir. A marca abaixo é persistente e o boot a
     * respeita; religar é um clique no mesmo lugar. Não apaga NADA — nem o que
     * está no aparelho, nem o que já subiu (para isso existe o canal do titular). */
    CHAVE_DESLIGADA: "orcapro:nuvem:desligada",
    desligadaPeloUsuario: function () {
      try { return localStorage.getItem(this.CHAVE_DESLIGADA) === "1"; } catch (e) { return false; }
    },
    marcarDesligada: function (v) {
      try {
        if (v) localStorage.setItem(this.CHAVE_DESLIGADA, "1");
        else localStorage.removeItem(this.CHAVE_DESLIGADA);
      } catch (e) {}
    },

    sair: function (permanente) {
      this._un.forEach(function (u) { try { u(); } catch (e) {} });
      this._un = []; this._escutando = null; this.ligado = false; this.uid = null;
      if (permanente) this.marcarDesligada(true);
      if (this.auth) this.auth.signOut().catch(function () {});
    }
  };

  global.Nuvem = Nuvem;
})(window);

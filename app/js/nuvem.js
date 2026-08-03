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
    // medição de produção: nasce do diário no celular do encarregado e é paga
    // no computador do escritório — sem sincronizar, o pagamento não chega lá.
    "producao_med",
    // R$/unidade da produção. Estava dentro de `prefs`, e o merge de prefs é
    // "o local vence campo a campo" — o preço aprovado no escritório nunca
    // chegava ao celular do encarregado, que pagava outro valor sem erro
    // nenhum. Dinheiro tem que passar pelo merge por id, com atualizadoEm.
    "producao_preco",
    // níveis do projeto: TÊM obraId, e por isso entram na cascata da obra
    "bim_niveis",
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
    _merge: function (local, cloud, ent, empresaId) {
      if (ent === "prefs" || ent === "conta") {
        // objeto único (prefs, conta mestre): mescla campo a campo; o mais novo (atualizadoEm) vence
        var l = local || {}, c = cloud || {};
        if (ent === "conta" && c.atualizadoEm && (!l.atualizadoEm || String(c.atualizadoEm) > String(l.atualizadoEm))) return Object.assign({}, l, c);
        return Object.assign({}, c, l);
      }
      var self = this;
      var byId = {};
      /* quem foi excluído (em qualquer aparelho) não volta: a lápide vence o registro
       * mais antigo que ela. A própria lista de lápides não se filtra. */
      var semLapide = (ent === "_lapides" || !empresaId);
      var mortos = semLapide ? Object.create(null) : Store.lapidesDe(empresaId, ent);
      /* obra apagada em cascata: o que APONTA para ela morreu junto (1 lápide cobre o lote).
       * Exceto os cadastros da empresa (equipe, patrimônio, frota): a exclusão só os
       * DESVINCULA, e aplicar a cascata neles apagaria no outro aparelho justamente o que
       * o modal promete preservar. Achado do gate de 25/07. */
      var imune = !semLapide && Store.imuneACascata(ent);
      var obrasMortas = semLapide ? Object.create(null) : Store.cascatasDeObra(empresaId);
      var vivo = function (o) {
        var t = mortos[o.id];
        if (t) return String(o.atualizadoEm || "") > String(t); // recriado depois de excluir → mantém
        if (o.obraId && obrasMortas[o.obraId]) {
          /* cadastro da empresa (equipe, patrimônio, frota): a obra morreu, ele não. Faz aqui o
           * mesmo que a exclusão faz localmente — solta o vínculo — em vez de deixá-lo apontando
           * para uma obra que não existe. Antes ele era APAGADO, contra o que o modal promete. */
          if (imune) { o.obraId = ""; o.obraNome = ""; return true; }
          /* filho de verdade: NÃO há ressalva. Se houvesse, uma edição feita no outro aparelho
           * depois da exclusão devolveria o registro para sempre — órfão, apontando para uma
           * obra que não existe mais e sem tela que o mostre. */
          return false;
        }
        if (ent === "obras" && obrasMortas[o.id]) return String(o.atualizadoEm || "") > String(obrasMortas[o.id]);
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
        try {
          var json = JSON.stringify(perd);
          venc._conflitoDe = (json.length <= 51200)
            ? { em: perd.atualizadoEm || "", quando: new Date().toISOString(), copia: perd }
            : { em: perd.atualizadoEm || "", quando: new Date().toISOString(), resumo: String(perd.nome || perd.numero || perd.id) };
          self._conflitosUltimoMerge++;
        } catch (e) {}
        byId[o.id] = venc;
      });
      return Object.keys(byId).map(function (k) { return byId[k]; });
    },

    // 1ª carga: baixa a nuvem, mescla com o local e grava nos dois (não perde nada).
    sincronizar: function (empresaId) {
      var self = this;
      if (!this.ligado) return Promise.resolve(false);
      self._conflitosUltimoMerge = 0;
      var falhou = 0, tentadas = 0;
      var uma = function (ent) {
        tentadas++;
        return self._doc(ent).get().then(function (snap) {
          var cloud = snap.exists ? snap.data().v : null;
          var local = Store.adapter.ler(empresaId, ent, vazioDe(ent));
          var merged = self._merge(local, cloud, ent, empresaId);
          /* cercado: o gravar está monkey-patched e, sem a cerca, dispararia um
             push por entidade — 27 escritas extras a cada sincronização */
          self._aplicandoDaNuvem = true;
          try { Store.adapter.gravar(empresaId, ent, merged); }
          finally { self._aplicandoDaNuvem = false; }
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
      var self = this;
      if (!this.ligado) return;

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
            var local = Store.adapter.ler(empresaId, ent, vazioDe(ent));
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
      this._falhas.push({ entidade: ent, codigo: String(cod) });
      if (this._falhas.length > 40) this._falhas.shift();
      try { console.warn("[nuvem] " + ent + ": " + cod); } catch (e) {}
    },
    /* Resumo para a tela: quantas falhas e de que tipo. `cota` é o caso que
     * derruba a sincronização do cliente inteiro e precisa de nome próprio. */
    estado: function () {
      var f = this._falhas || [];
      var cota = f.some(function (x) { return /resource-exhausted|RESOURCE_EXHAUSTED|quota/i.test(x.codigo); });
      var permissao = f.some(function (x) { return /permission-denied/i.test(x.codigo); });
      return {
        ligado: !!this.ligado,
        autenticado: !!(this.auth && this.auth.currentUser),
        escutando: !!(this._un && this._un.length),
        falhas: f.length,
        cotaEstourada: cota,
        semPermissao: permissao,
        ok: !!this.ligado && !!(this._un && this._un.length) && !cota && !permissao
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

    push: function (empresaId, ent) {
      var self = this;
      var mandar = function () {
        try {
          var v = Store.adapter.ler(empresaId, ent, vazioDe(ent));
          var carga = "";
          try { carga = JSON.stringify(v); } catch (e) { carga = ""; }
          var chave = empresaId + "|" + ent;
          if (carga && self._ultimoEnviado[chave] === carga) return;   // nada mudou: não escreve
          self._ultimoEnviado[chave] = carga;
          self._doc(ent).set({ v: v, em: Date.now() }).catch(function (e) {
            /* a escrita falhou: esquece a marca, senão a próxima tentativa
               acharia que já subiu e o dado ficaria só no aparelho */
            delete self._ultimoEnviado[chave];
            self._registrarFalha(ent, e);
          });
        } catch (e) {}
      };
      if (ent === "_lapides") { clearTimeout(this._push[ent]); this._push[ent] = setTimeout(mandar, 150); return; }
      clearTimeout(this._push[ent]);
      this._push[ent] = setTimeout(mandar, 900);
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

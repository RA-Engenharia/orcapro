/* =====================================================================
 * previewcli.js — ABRIR A VERSÃO DE UM CLIENTE, COM DADOS DE EXEMPLO
 *
 * Para quem implanta: ver como o sistema ficou para um cliente sem entrar na
 * conta dele, sem mexer na sua, e sem inventar dado que não existe.
 *
 * ⚠ ESTE MÓDULO SÓ FAZ ALGUMA COISA SE O CATÁLOGO PRIVADO ESTIVER PRESENTE
 *   (`venda/perfis-clientes.js`, que não vai em pacote nenhum). Sem ele
 *   `disponiveis()` devolve lista vazia, o botão não nasce e `entrar()`
 *   recusa. É esse o gate: o segredo mora no arquivo ausente, não numa flag
 *   que o cliente possa ligar.
 *
 * ---------------------------------------------------------------------
 * COMO O ISOLAMENTO FUNCIONA — e por que cada peça é assim
 *
 * 1. NAMESPACE PRÓPRIO. O Store guarda em `orcapro:<empresaId>:<entidade>`.
 *    A prévia troca o `empresaId` para `prev:<perfil>`, então tudo que ela
 *    grava cai ao lado — nunca dentro — do dado real.
 *
 * 2. A TROCA É EM MEMÓRIA. `Auth._usuario` é atribuído direto, NUNCA por
 *    `Auth._iniciarSessao` — este último escreve `orcapro:sessao` no disco, e
 *    aí a sessão real seria substituída de verdade. É a mesma escolha que a
 *    vitrine (`?demo=1`) faz, pelo mesmo motivo.
 *
 * 3. SAIR É RECARREGAR. Não se desliga a prévia em memória: um seed ainda em
 *    voo gravaria no tenant errado depois do "sair", e a flag sobreviveria a
 *    um login real na mesma página. Recarregar limpo devolve tudo — o
 *    `Auth.init()` relê a sessão do disco, que nunca foi tocada.
 *
 * 4. ⚠ A NUVEM É BARRADA NA PORTA DELA, não aqui. `Nuvem.sincronizar`,
 *    `escutar` e `push` recusam empresaId com este prefixo. O motivo não é só
 *    lixo na nuvem: `Store.excluir` grava uma LÁPIDE cujo id é
 *    `entidade:<id>` — SEM empresaId dentro — e `_lapides` sincroniza. Uma
 *    exclusão na prévia empurraria a lápide para o tenant real e o merge
 *    apagaria lá o registro de mesmo id. Dado de mentira apagando dado de
 *    verdade.
 *
 * 5. Backup em disco e telemetria também têm guarda de prévia, em quem
 *    escreve (js/app.js e js/telemetria.js): as duas chaves são globais do
 *    navegador, então esconder o botão não bastaria.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREFIXO = "prev:";

  /* ⚠ NO NAVEGADOR o `var Perfis` de js/perfis.js já é `window.Perfis`; no Node
     (onde o gate roda) ele só existe em `module.exports`. Sem os dois caminhos
     `disponiveis()` devolveria lista vazia no teste — e o teste passaria pelo
     motivo ERRADO, dando por isolado o que nem tinha carregado. */
  function _P() {
    if (global.Perfis) return global.Perfis;
    if (typeof require === "function") { try { return require("./perfis.js"); } catch (e) {} }
    return null;
  }
  function _S() { return global.Store; }

  var PreviewCli = {
    PREFIXO: PREFIXO,

    ehPrevia: function (empresaId) {
      return typeof empresaId === "string" && empresaId.indexOf(PREFIXO) === 0;
    },

    ativo: function () {
      try { return this.ehPrevia(global.Auth && global.Auth.empresaId()); }
      catch (e) { return false; }
    },

    /* O perfil que está sendo espiado, ou "". */
    perfilAtivo: function () {
      try {
        var eid = global.Auth.empresaId();
        return this.ehPrevia(eid) ? eid.slice(PREFIXO.length) : "";
      } catch (e) { return ""; }
    },

    /* Os perfis que dá para espiar. Sem o catálogo privado: lista vazia. */
    disponiveis: function () {
      var P = _P();
      if (!P || !P.listarPrivados) return [];
      try { return P.listarPrivados(); } catch (e) { return []; }
    },

    /* ===================================================================
     * ENTRAR
     * =================================================================== */
    entrar: function (perfilId) {
      var P = _P(), S = _S();
      if (!P || !S || !global.Auth) return { ok: false, erro: "sistema não carregado" };
      var disp = this.disponiveis();
      var alvo = null;
      for (var i = 0; i < disp.length; i++) if (disp[i].id === perfilId) alvo = disp[i];
      if (!alvo) return { ok: false, erro: "Perfil não disponível nesta máquina." };

      var eid = PREFIXO + perfilId;
      /* ⚠ ATRIBUIÇÃO DIRETA, e o objeto vai COMPLETO. A vitrine monta um
         usuário com 4 campos e funciona por acidente: sem `papel`,
         `ehAdmin()` responde true porque testa `papel !== "usuario"`.
         Depender disso aqui herdaria o mesmo acidente. */
      global.Auth._usuario = {
        empresaId: eid,
        empresa: alvo.nome || "Prévia",
        email: "previa@orcapro.local",
        plano: "PRO",
        papel: "admin",
        modulos: null,
        obras: null,
        aprovador: true
      };

      try {
        P.aplicar(perfilId);
        P.semear(perfilId);
        this._semearExemplo(eid, perfilId);
      } catch (e) {
        return { ok: false, erro: e.message || String(e) };
      }
      return { ok: true, perfil: alvo };
    },

    /* ===================================================================
     * SAIR — recarrega limpo (ver a nota 3 do cabeçalho)
     * =================================================================== */
    sair: function () {
      try { global.location.href = global.location.pathname; }
      catch (e) { try { global.location.reload(); } catch (e2) {} }
    },

    /* ===================================================================
     * A TARJA
     *
     * ⚠ Ela existe para ninguém confundir prévia com o sistema de verdade —
     *   e para dizer, na própria tarja, que o dado é de exemplo. Sem isso o
     *   risco não é técnico, é humano: alguém tirar print da prévia e mandar
     *   para o cliente como se fosse a base dele.
     * =================================================================== */
    faixaHtml: function () {
      if (!this.ativo()) return "";
      var esc = (global.Util && global.Util.esc) ? global.Util.esc : function (x) { return String(x == null ? "" : x); };
      var nome = "";
      try { nome = _P().atual().nome || ""; } catch (e) {}
      return '<div class="previa-faixa" style="background:#7c2d12;color:#fff;padding:8px 16px;'
        + 'display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13.5px">'
        + "<b>Você está vendo a versão de " + esc(nome) + "</b>"
        + '<span style="opacity:.85">Dados de exemplo. Nada aqui é do cliente, e nada toca a sua conta.</span>'
        + '<button class="btn sm" data-acao="previa-sair" style="margin-left:auto">Sair da prévia</button>'
        + "</div>";
    },

    /* ===================================================================
     * DADOS DE EXEMPLO
     *
     * ⚠ SÓ O QUE FAZ AS TELAS PARAREM DE PÉ, e nada com cara de real: nome de
     *   cliente, obra e pessoa são declaradamente "Exemplo". Já houve print
     *   de tela de demonstração circulando como se fosse dado de cliente.
     *
     * ⚠ IDEMPOTENTE. Entrar na prévia duas vezes não duplica nada: cada
     *   registro tem id fixo e `Store.salvar` regrava por id.
     * =================================================================== */
    _semearExemplo: function (eid, perfilId) {
      var S = _S(), P = _P();
      function grava(ent, obj) { try { S.salvar(eid, ent, obj); } catch (e) {} }
      function pode(m) { try { return P.permite(m); } catch (e) { return false; } }

      grava("clientes", { id: "px-cli", nome: "Cliente Exemplo Ltda", cpfCnpj: "00.000.000/0001-00" });
      grava("obras", { id: "px-obra", nome: "Obra Exemplo", clienteId: "px-cli", status: "andamento" });

      if (pode("colaboradores")) {
        grava("colaboradores", { id: "px-c1", nome: "Colaborador Exemplo 1", funcao: "Montador", obraId: "px-obra", status: "ativo", pagaProducao: true });
        grava("colaboradores", { id: "px-c2", nome: "Colaborador Exemplo 2", funcao: "Ajudante", obraId: "px-obra", status: "ativo", pagaProducao: true });
      }
      if (pode("fornecedores")) {
        grava("fornecedores", { id: "px-forn", nome: "Fornecedor Exemplo" });
      }

      /* o cadastro que faz o orçamento próprio ter o que mostrar */
      if (pode("carpintaria")) {
        grava("carp_madeiras", {
          id: "px-mad1", especie: "Espécie A", aplicacao: "Deck", dimensao: "2x10", unidade: "m²",
          precos: [{ fornecedorId: "px-forn", valor: 240, data: this._hoje() }]
        });
        grava("carp_madeiras", {
          id: "px-mad2", especie: "Espécie B", aplicacao: "Forro", dimensao: "1x10", unidade: "m²",
          precos: [{ fornecedorId: "px-forn", valor: 180, data: this._hoje() }]
        });
        grava("carp_mo", { id: "px-s1", servico: "Deck", unidade: "m²", valor: 120 });
        grava("carp_mo", { id: "px-s2", servico: "Forro", unidade: "m²", valor: 90 });
        grava("carp_propostas", {
          id: "px-prop", numero: "EXEMPLO-001", titulo: "Proposta de exemplo",
          clienteId: "px-cli", obraId: "px-obra", data: this._hoje(), margemPct: 40,
          itensMadeira: [{ madeiraId: "px-mad1", qtd: 40, fornecedorId: "px-forn" }],
          itensMO: [{ servicoId: "px-s1", qtd: 40 }]
        });
      }

      /* metragem no diário: é o que acende o cartão de m² do Painel e dá o que
         apurar na remuneração variável */
      if (pode("rdo")) {
        grava("rdo", {
          id: "px-rdo", numero: "001", obraId: "px-obra", data: this._hoje(),
          estado: "aprovado", clima: "bom",
          atividadesItens: [{
            descricao: "Deck", unidade: "m²", qtdPrevista: 60, qtdExecutada: 40,
            producao: pode("producao") ? [
              { colaboradorId: "px-c1", qtd: 25 },
              { colaboradorId: "px-c2", qtd: 10 }
            ] : []
          }]
        });
      }
    },

    _hoje: function () {
      var d = new Date();
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    },

    /* Apaga o que a prévia criou. Usado ao trocar de perfil espiado — senão o
       cadastro de um sobra na tela do outro. */
    limpar: function (perfilId) {
      /* ⚠ varre o localStorage direto, e não pelo Store: o que se quer aqui é
         apagar TUDO do namespace da prévia, inclusive entidade que o Store nem
         conhece. A primeira versão exigia `Store.adapter` e devolvia sem fazer
         nada — função inerte que a tela dava por executada. */
      var eid = PREFIXO + perfilId;
      var chaves = [];
      try {
        for (var i = 0; i < global.localStorage.length; i++) {
          var k = global.localStorage.key(i);
          if (k && k.indexOf("orcapro:" + eid + ":") === 0) chaves.push(k);
        }
        chaves.forEach(function (k) { global.localStorage.removeItem(k); });
      } catch (e) {}
      return chaves.length;
    }
  };

  global.PreviewCli = PreviewCli;
  if (typeof module !== "undefined" && module.exports) module.exports = PreviewCli;
})(typeof window !== "undefined" ? window : this);

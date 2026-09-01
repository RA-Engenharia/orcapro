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
      /* ⚠ FORA DO GRID, PRESA NO RODAPÉ.
         A tarja era inserida como irmã da topbar dentro do `.app`, que é um
         grid de áreas ("side top" / "side main"). Sem área declarada, ela caía
         numa TERCEIRA LINHA implícita, na coluna do menu: 212 px de largura,
         179 px de altura, empurrada para baixo de tudo. Era o bloco laranja
         espremido no canto que aparecia na tela de quem conferia a versão do
         cliente.
         `position:fixed` tira o problema pela raiz: não disputa coluna com
         nada, não some ao rolar, e não cobre a topbar nem o menu. O rodapé —
         e não o topo — porque o topo é onde ficam o logo e a busca, que a
         pessoa precisa usar enquanto confere. */
      return '<div class="previa-faixa" style="position:fixed;left:0;right:0;bottom:0;z-index:9000;'
        + 'background:#7c2d12;color:#fff;padding:8px 16px;box-shadow:0 -6px 18px rgba(0,0,0,.25);'
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

      var dias = this._diasAtras;

      /* ⚠ DUAS OBRAS, DE PROPÓSITO. Com uma só, a tela de apuração da
         remuneração variável parece não ter escolha nenhuma, e o rateio de
         equipe — que divide entre "todos os colaboradores DAQUELA obra" —
         não mostra o que faz. Com duas, o seletor de obra do Painel e o
         "quem divide o pote" passam a significar alguma coisa. */
      grava("clientes", { id: "px-cli", nome: "Cliente Exemplo Ltda", cpfCnpj: "00.000.000/0001-00", email: "contato@exemplo.com", telefone: "(00) 0000-0000" });
      grava("clientes", { id: "px-cli2", nome: "Segundo Cliente Exemplo", cpfCnpj: "00.000.000/0002-00" });
      grava("obras", { id: "px-obra", nome: "Obra Exemplo — Residência", clienteId: "px-cli", status: "andamento", endereco: "Rua Exemplo, 100", dataInicio: dias(45) });
      grava("obras", { id: "px-obra2", nome: "Obra Exemplo — Área de lazer", clienteId: "px-cli2", status: "andamento", endereco: "Av. Exemplo, 200", dataInicio: dias(20) });

      if (pode("colaboradores")) {
        /* ⚠ `pagaProducao` MARCADO em todos: sem isso o botão "+ pessoa" nem
           desenha no diário e não há metragem para apurar — é a trava número
           um da implantação, e a prévia tem de mostrar o caminho FUNCIONANDO,
           não o caminho travado. */
        [
          ["px-c1", "Colaborador Exemplo 1", "Encarregado", "px-obra"],
          ["px-c2", "Colaborador Exemplo 2", "Montador", "px-obra"],
          ["px-c3", "Colaborador Exemplo 3", "Montador", "px-obra"],
          ["px-c4", "Colaborador Exemplo 4", "Ajudante", "px-obra"],
          ["px-c5", "Colaborador Exemplo 5", "Montador", "px-obra2"],
          ["px-c6", "Colaborador Exemplo 6", "Ajudante", "px-obra2"]
        ].forEach(function (c) {
          grava("colaboradores", {
            id: c[0], nome: c[1], funcao: c[2], obraId: c[3],
            status: "ativo", pagaProducao: true, regime: "clt",
            admissao: dias(200), salario: 0, chavePix: ""
          });
        });
      }
      if (pode("fornecedores")) {
        /* dois: com um só, escolher fornecedor na proposta não parece escolha */
        grava("fornecedores", { id: "px-forn", nome: "Madeireira Exemplo", telefone: "(00) 0000-0000" });
        grava("fornecedores", { id: "px-forn2", nome: "Depósito Exemplo", telefone: "(00) 0000-0001" });
      }

      /* o cadastro que faz o orçamento próprio ter o que mostrar */
      if (pode("carpintaria")) {
        /* ⚠ CADA MADEIRA COM DOIS PREÇOS, de fornecedores diferentes e em
           datas diferentes. É o que faz a tela mostrar o que ela existe para
           mostrar: a escolha do fornecedor por item e o histórico de preço.
           Com um preço só, a coluna "Fornecedores e preços" vira decoração. */
        [
          ["px-mad1", "Espécie A", "Deck", "2x10", 240, 232, 12],
          ["px-mad2", "Espécie B", "Forro", "1x10", 180, 174, 20],
          ["px-mad3", "Espécie C", "Ripado", "1x5", 96, 92, 8],
          ["px-mad4", "Espécie D", "Caibro", "5x6", 148, 155, 30]
        ].forEach(function (m) {
          grava("carp_madeiras", {
            id: m[0], especie: m[1], aplicacao: m[2], dimensao: m[3], unidade: "m²",
            precos: [
              { fornecedorId: "px-forn", valor: m[4], data: dias(m[6]) },
              { fornecedorId: "px-forn2", valor: m[5], data: dias(m[6] + 15) }
            ]
          });
        });

        /* os quatro serviços da tabela de mão de obra — é o cadastro que trava
           o fechamento da proposta quando falta (serviço sem preço vira
           pendência), então a prévia mostra os quatro preenchidos */
        grava("carp_mo", { id: "px-s1", servico: "Deck", unidade: "m²", valor: 120 });
        grava("carp_mo", { id: "px-s2", servico: "Forro", unidade: "m²", valor: 90 });
        grava("carp_mo", { id: "px-s3", servico: "Ripado", unidade: "m²", valor: 75 });
        grava("carp_mo", { id: "px-s4", servico: "Caibro", unidade: "m", valor: 38 });

        /* ⚠ DUAS PROPOSTAS, E ELAS CONTAM COISAS DIFERENTES.
           A primeira está ABERTA e com 40 m² — abaixo do corte de faixa, para
           o acréscimo de obra pequena aparecer na conta aberta da tela.
           A segunda está FECHADA e com metragem acima do corte: é ela que
           mostra o congelamento (preço, fornecedor, data e os dois fatores
           gravados dentro da proposta) e o prazo de validade correndo. */
        grava("carp_propostas", {
          id: "px-prop", numero: "EXEMPLO-001", titulo: "Deck da área externa",
          clienteId: "px-cli", obraId: "px-obra", data: dias(3), margemPct: 40,
          itensMadeira: [
            { madeiraId: "px-mad1", qtd: 40, fornecedorId: "px-forn" },
            { madeiraId: "px-mad3", qtd: 18, fornecedorId: "px-forn2" }
          ],
          itensMO: [{ servicoId: "px-s1", qtd: 40 }, { servicoId: "px-s3", qtd: 18 }],
          detalhes: ["degrau"]
        });
        grava("carp_propostas", {
          id: "px-prop2", numero: "EXEMPLO-002", titulo: "Forro e ripado — sala",
          clienteId: "px-cli2", obraId: "px-obra2", data: dias(26), margemPct: 38,
          itensMadeira: [{ madeiraId: "px-mad2", qtd: 82, fornecedorId: "px-forn" }],
          itensMO: [{ servicoId: "px-s2", qtd: 82 }],
          fechadaEm: dias(26)
        });

        /* o parceiro: sem um cadastrado, a aba Parceiros abre vazia e ninguém
           entende que existe um portal do outro lado */
        grava("carp_parceiros", {
          id: "px-parc", nome: "Parceiro Exemplo", login: "parceiro.exemplo",
          margemMadeiraPct: 35, ajusteMOPct: -10, fornecedorId: "px-forn", ativo: true
        });
      }

      /* metragem no diário: é o que acende o cartão de m² do Painel e dá o que
         apurar na remuneração variável */
      if (pode("rdo")) {
        /* ⚠ VÁRIOS DIÁRIOS, E UM DELES AINDA NÃO APROVADO. O cartão de m² do
           Painel mostra DOIS números — executado e "com dono, aprovado" — e a
           diferença entre eles é justamente o diário pendente e a metragem
           lançada sem dono. Com um único diário aprovado os dois números
           ficam iguais e o cartão parece redundante; é exatamente a dúvida
           que ele existe para responder. */
        var diarios = [
          { id: "px-rdo1", n: "001", obra: "px-obra",  d: 12, est: "publicado",     serv: "Deck",   prev: 60, exec: 22, prod: [["px-c1", 12], ["px-c2", 10]], fotos: ["Início do assoalho", "Estrutura nivelada"] },
          { id: "px-rdo2", n: "002", obra: "px-obra",  d: 9,  est: "aprovado",      serv: "Deck",   prev: 60, exec: 18, prod: [["px-c2", 10], ["px-c3", 8]] },
          { id: "px-rdo3", n: "003", obra: "px-obra",  d: 5,  est: "aprovado",      serv: "Ripado", prev: 18, exec: 18, prod: [["px-c3", 11], ["px-c4", 7]], fotos: ["Ripado da lateral"] },
          /* sem `producao`: metragem executada SEM dono — a que aparece na
             diferença do cartão e não vira pagamento de ninguém */
          { id: "px-rdo4", n: "004", obra: "px-obra",  d: 2,  est: "em_aprovacao",  serv: "Deck",   prev: 60, exec: 9,  prod: [] },
          { id: "px-rdo5", n: "005", obra: "px-obra2", d: 4,  est: "aprovado",      serv: "Forro",  prev: 82, exec: 26, prod: [["px-c5", 16], ["px-c6", 10]] }
        ];
        var self = this;
        diarios.forEach(function (r) {
          grava("rdo", {
            id: r.id, numero: r.n, obraId: r.obra, data: dias(r.d),
            estado: r.est, clima: "bom",
            observacoes: r.est === "em_aprovacao" ? "Diário do dia aguardando o encarregado." : "",
            /* ⚠ A GALERIA SÓ EXISTE SE O DIÁRIO TIVER FOTO — ela não tem
               cadastro próprio, as fotos entram pelo RDO. Sem isto o módulo
               que o cliente fez questão de manter abria dizendo "esta obra
               ainda não tem fotos", e quem está conhecendo a versão conclui
               que ele não funciona. São desenhos de poucos bytes, não imagem
               de obra nenhuma. */
            fotos: r.fotos ? r.fotos.map(function (f, i) { return { d: self._fotoExemplo(i), leg: f }; }) : [],
            atividadesItens: [{
              descricao: r.serv, unidade: "m²", qtdPrevista: r.prev, qtdExecutada: r.exec,
              producao: pode("producao") ? r.prod.map(function (p) { return { colaboradorId: p[0], qtd: p[1] }; }) : []
            }]
          });
        });
      }

      /* ---- USUÁRIOS: os dois níveis de aprovação precisam de duas pessoas ----
         D1 pede "todos lançam → encarregado aprova → gestão aprova". Com a
         lista de usuários vazia, a tela de aprovação não tem a quem oferecer
         o segundo nível, e o desenho inteiro fica invisível. */
      if (pode("usuarios")) {
        grava("equipe", {
          id: "px-u1", nome: "Encarregado Exemplo", login: "encarregado",
          departamento: "engenharia", ativo: true,
          modulos: ["dashboard", "rdo", "producao", "obras", "galeria"]
        });
        grava("equipe", {
          id: "px-u2", nome: "Escritório Exemplo", login: "escritorio",
          departamento: "administrativo", ativo: true,
          modulos: ["dashboard", "carpintaria", "clientes", "obras", "financeiro", "folha", "folhasemanal", "remunvar"]
        });
      }

      /* ---- ALMOXARIFADO: item com saldo e a SAÍDA que pergunta quem retirou ---- */
      if (pode("estoque")) {
        grava("estoque", {
          id: "px-est1", nome: "Parafuso inox 4,5x60", categoria: "outros", unidade: "cx",
          saldo: 7, estoqueMin: 4, custoUnit: 89.9, obraId: "", localizacao: "Prateleira A"
        });
        grava("estoque", {
          id: "px-est2", nome: "Óleo protetor para deck", categoria: "outros", unidade: "gl",
          saldo: 2, estoqueMin: 3, custoUnit: 210, obraId: "", localizacao: "Prateleira B"
        });
        /* ⚠ a saída guarda QUEM RETIROU junto do id — é o pedido F2, e o nome
           tem de continuar legível no extrato mesmo depois de a pessoa sair */
        grava("estoque_mov", {
          id: "px-mov1", itemId: "px-est1", itemNome: "Parafuso inox 4,5x60",
          tipo: "entrada", qtd: 10, custoUnit: 89.9, data: dias(18), obraId: "",
          docTipo: "NF", docNumero: "000.111", obs: "Compra de reposição"
        });
        grava("estoque_mov", {
          id: "px-mov2", itemId: "px-est1", itemNome: "Parafuso inox 4,5x60",
          tipo: "saida", qtd: 3, custoUnit: 89.9, data: dias(6), obraId: "px-obra",
          retiradoPorId: "px-c2", retiradoPorNome: "Colaborador Exemplo 2",
          obs: "Montagem do deck"
        });
      }

      /* ---- PATRIMÔNIO: a ferramenta que dura (F1) ---- */
      if (pode("patrimonio")) {
        grava("patrimonio", {
          id: "px-pat1", descricao: "Serra circular Exemplo", categoria: "equipamento",
          numeroPatrimonio: "FER-001", valorAquisicao: 1290, dataAquisicao: dias(160),
          depreciacaoAnual: 10, estado: "usado", obraId: "px-obra",
          localizacao: "Com a equipe", responsavelId: "px-c1", responsavelNome: "Colaborador Exemplo 1"
        });
        grava("patrimonio", {
          id: "px-pat2", descricao: "Parafusadeira Exemplo", categoria: "equipamento",
          numeroPatrimonio: "FER-002", valorAquisicao: 640, dataAquisicao: dias(90),
          depreciacaoAnual: 10, estado: "novo", obraId: "", localizacao: "Almoxarifado"
        });
      }

      /* ---- FINANCEIRO: entrada, saída e o "gasto rápido" ---- */
      if (pode("financeiro")) {
        grava("financeiro", {
          id: "px-fin1", data: dias(20), desc: "Entrada da proposta EXEMPLO-002",
          tipo: "receita", categoria: "obra", valor: 9800, status: "recebido", obraId: "px-obra2"
        });
        grava("financeiro", {
          id: "px-fin2", data: dias(18), desc: "Madeira — pedido da semana",
          tipo: "despesa", categoria: "material", valor: 6420, status: "pago", obraId: "px-obra"
        });
        /* como o ⚡ Gasto rápido grava: despesa PAGA, obra obrigatória */
        grava("financeiro", {
          id: "px-fin3", data: dias(6), desc: "Combustível", tipo: "despesa",
          categoria: "outros", valor: 180, status: "pago", obraId: "px-obra"
        });
      }

      /* ---- AS DUAS FOLHAS ----
         A mensal é a parte FIXA (CLT, piso da categoria, encargos, recibo);
         a semanal é onde a parte VARIÁVEL vira pagamento. Semear uma de cada
         é o que faz a diferença entre elas ficar visível na prévia — foi a
         confusão número um da implantação. */
      if (pode("folha")) {
        grava("folha", {
          id: "px-folha1", colaboradorId: "px-c1", competencia: this._competencia(1),
          salarioBase: 2400, encargosPct: 36, horasExtras: 0, descontos: 0,
          obraId: "px-obra", status: "aberta"
        });
        grava("folha", {
          id: "px-folha2", colaboradorId: "px-c2", competencia: this._competencia(1),
          salarioBase: 2100, encargosPct: 36, horasExtras: 120, descontos: 0,
          obraId: "px-obra", status: "aberta"
        });
      }
      if (pode("folhasemanal")) {
        grava("fs_lancamentos", {
          id: "px-fs1", semana: dias(7), obraId: "px-obra", colaboradorId: "px-c2",
          nome: "Colaborador Exemplo 2", funcao: "Montador", favorecido: "", chavePix: "",
          tipo: "producao", dias: {}, faltas: [], he: 0,
          obs: "Remuneração variável — apuração de exemplo"
        });
      }
    },

    /* ⚠ FOTO DE EXEMPLO DESENHADA, NÃO FOTOGRAFADA. Um SVG de poucos bytes
       embutido como data URI: dá à Galeria e ao Relatório Fotográfico o que
       mostrar sem levar imagem de obra de ninguém dentro do pacote — e sem
       inflar o js/ com base64 de foto de verdade. */
    _fotoExemplo: function (i) {
      var tons = [["#b7793f", "#8c5a2b"], ["#7d9a6d", "#5d7a50"], ["#7c8ca0", "#5c6b7d"]];
      var t = tons[(i || 0) % tons.length];
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">'
        + '<rect width="320" height="240" fill="' + t[0] + '"/>'
        + '<g fill="' + t[1] + '">'
        + '<rect y="40" width="320" height="26"/><rect y="92" width="320" height="26"/>'
        + '<rect y="144" width="320" height="26"/><rect y="196" width="320" height="26"/></g>'
        + '<text x="160" y="26" font-family="Arial" font-size="15" fill="#fff" text-anchor="middle" opacity=".9">foto de exemplo</text>'
        + "</svg>";
      /* encodeURIComponent e não base64: o SVG continua legível no disco e não
         parece binário embutido para quem for auditar o pacote */
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    },

    /* uma data N dias atrás, no fuso local — nada de toISOString aqui (ele
       devolve UTC e depois das 21h no Brasil já é o dia seguinte) */
    _diasAtras: function (n) {
      var d = new Date();
      d.setDate(d.getDate() - (n || 0));
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    },

    /* competência AAAA-MM de N meses atrás (0 = mês corrente) */
    _competencia: function (atras) {
      var d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (atras || 0));
      return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
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

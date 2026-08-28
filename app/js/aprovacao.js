/* =====================================================================
 * aprovacao.js — O CONTROLE DO GESTOR, generalizado
 *
 * O fluxo "quem faz manda para quem responde, e só depois vale" nasceu no
 * Diário de Obra. Mas ele não é do diário: é da empresa. Medição que vai ao
 * cliente, requisição que vira compra e cotação que escolhe fornecedor têm a
 * MESMA linha de raciocínio — alguém no canteiro propõe, alguém no escritório
 * responde pelo dinheiro.
 *
 * Este arquivo tira a máquina de estados de dentro do RDO e a deixa servir
 * qualquer módulo. `js/rdo.js` continua sendo a autoridade sobre o diário
 * (estados legados, Portal, clima); aqui fica só o que é comum.
 *
 * REGRAS QUE VIERAM DO SANGUE, e por que cada uma existe:
 *
 * 1. QUEM PROPÕE NÃO APROVA — POR PADRÃO. Sem identidade estável na sessão essa
 *    regra não vale — e "não valer" é pior que não existir, porque a tela
 *    mostra o controle e o controle não controla nada. A sessão do OrçaPRO
 *    identifica por `usuarioId` (sub-usuário) ou `email` (dono da conta). NÃO
 *    existe `id`.
 *    EXCEÇÃO por configuração (pedido do cliente, 08/2026): o ADMIN e o usuário
 *    marcado com `autoAprovar` aprovam a própria criação — e a empresa pode
 *    forçar quatro olhos de volta com `exigirOutroAprovador`. Ver
 *    Aprovacao.podeAutoAprovar.
 * 2. RECUSAR SEM MOTIVO É DEVOLVER TRABALHO SEM INFORMAÇÃO. O motivo é
 *    obrigatório e viaja inteiro até quem redigiu.
 * 3. CONTA DE UM HOMEM SÓ NÃO PODE TRAVAR. Se não há um segundo aprovador
 *    possível, o dono aprova o próprio — e isso fica ESCRITO na trilha. A
 *    diferença entre uma exceção declarada e um controle que nunca existiu é
 *    exatamente esse registro.
 * 4. AUTORIA DESCONHECIDA NÃO SE FINGE DE VERIFICADA. Documento gravado antes
 *    do controle não tem autor; aprovar calado seria simular a checagem.
 *
 * Puro: sem DOM, sem Store, sem fetch. Testável em Node.
 * ===================================================================== */
(function (raiz) {
  "use strict";

  var Aprovacao = {};

  /* Os mesmos rótulos do RDO, para o usuário não aprender duas linguagens. */
  Aprovacao.ESTADOS = {
    rascunho:     { rotulo: "Rascunho",             cor: "cinza",    final: false },
    em_aprovacao: { rotulo: "Aguardando aprovação", cor: "ambar",    final: false },
    em_revisao:   { rotulo: "Revisão solicitada",   cor: "vermelho", final: false },
    aprovado:     { rotulo: "Aprovado",             cor: "verde",    final: true },
    rejeitado:    { rotulo: "Rejeitado",            cor: "vermelho", final: true }
  };

  var TRANSICOES = {
    rascunho:     { enviar: "em_aprovacao" },
    em_aprovacao: { aprovar: "aprovado", revisar: "em_revisao", rejeitar: "rejeitado" },
    em_revisao:   { enviar: "em_aprovacao" },
    /* reabrir existe porque erro aprovado também acontece — e o caminho para
       consertar precisa ser rastreável, não uma edição por baixo do pano */
    aprovado:     { reabrir: "em_revisao" },
    rejeitado:    { reabrir: "em_revisao" }
  };

  /* Que módulos usam este fluxo, e o que cada um chama de "documento".
   * `valorEmJogo` diz se o documento move dinheiro — o que muda o texto que o
   * gestor lê antes de aprovar. */
  /* ⚠ AS CHAVES SÃO OS NOMES DE ENTIDADE DO Store, não rótulos bonitos.
   * A tela passa `data-ent="medicoes"` e o despachante busca aqui; com a
   * chave errada o módulo cai no rótulo genérico e o texto de confirmação
   * some — o aviso que explica POR QUE aquilo precisa de aprovação. */
  Aprovacao.MODULOS = {
    medicoes:       { rotulo: "Medição",     valorEmJogo: true,
                      porque: "A medição vira fatura: aprovada errada, o cliente é cobrado errado." },
    requisicoes:    { rotulo: "Requisição",  valorEmJogo: true,
                      porque: "Requisição aprovada vira compra — e compra vira dinheiro saindo." },
    /* ⚠ `compras` FALTAVA AQUI e isso deixava a regra inerte justamente onde o
       dinheiro sai. O carimbo de autoria só acontece para entidade que esteja
       nesta lista, então nenhum pedido de compra recebia `autorId` — nem hoje,
       nem daqui a um ano — e quem lançava o pedido podia aprovar o próprio. */
    compras:        { rotulo: "Pedido de compra", valorEmJogo: true,
                      porque: "Pedido aprovado autoriza a despesa: o dinheiro sai da obra." },
    cotacoes:       { rotulo: "Cotação",     valorEmJogo: true,
                      porque: "Escolher fornecedor é decisão de compra, não coleta de preço." },
    fs_lancamentos: { rotulo: "Folha",       valorEmJogo: true,
                      porque: "Folha aprovada vira pagamento a pessoa física." },
    producao_med:   { rotulo: "Medição de produção", valorEmJogo: true,
                      porque: "É pagamento por serviço executado: aprovada errada, paga-se serviço que não foi feito." },
    /* FASE 4 (v1.1.215): o orçamento é o documento que ORIGINA todos os
       outros — dele saem o contrato, a medição e a compra. Ficava de fora do
       ciclo que ele mesmo alimenta: qualquer um podia mandar para o cliente
       um preço que ninguém conferiu, e não havia como responder "quem
       liberou isso?". Entra na máquina que já existe, sem estado paralelo. */
    orcamentos:     { rotulo: "Orçamento",   valorEmJogo: true,
                      porque: "É o preço que vai ao cliente e vira contrato: aprovado errado, a obra inteira nasce torta." }
  };

  /* --- IDENTIDADE ----------------------------------------------------
   * A regra 1 inteira depende disto. Se devolver "", o fluxo não sabe quem é
   * quem e TODA aprovação vira carimbo. */
  Aprovacao.idDoUsuario = function (u) {
    var x = u || {};
    return String(x.usuarioId || x.email || "").trim().toLowerCase();
  };

  Aprovacao.autoriaIncerta = function (doc) {
    return !String((doc || {}).autorId || "").trim();
  };

  Aprovacao.carimbarAutor = function (doc, usuario) {
    var d = doc || {};
    /* ⚠ NÃO gravar autoria vazia. Na instalação sem conta cadastrada a sessão
       local nasce com email "" e usuarioId null, então `idDoUsuario` devolve
       "" — e gravar `autorId: ""` cria um campo que MENTE: parece carimbado e
       continua sem autor. Melhor deixar ausente, que é a verdade, e o fluxo
       trata como autoria não verificada. */
    var id = Aprovacao.idDoUsuario(usuario);
    if (id && Aprovacao.autoriaIncerta(d)) d.autorId = id;
    return d;
  };

  Aprovacao.estadoDe = function (doc) {
    var d = doc || {};
    var e = String(d.estadoAprovacao || "").trim();
    return Aprovacao.ESTADOS[e] ? e : "rascunho";
  };

  /* --- QUEM PODE O QUÊ ------------------------------------------------
   * `equipe` entra para responder "existe outro aprovador nesta conta?".
   * Sem ela, a conta de um homem só morre em "Aguardando aprovação" — e o
   * sistema fica inutilizável justamente para o cliente pequeno. */
  Aprovacao.aprovadores = function (equipe) {
    return (equipe || []).filter(function (u) {
      return !!(u && (u.aprovador === true || u.papel === "admin" || u.papel === "gestor"));
    });
  };

  Aprovacao.semOutroAprovador = function (usuario, equipe) {
    var eu = Aprovacao.idDoUsuario(usuario);
    var outros = Aprovacao.aprovadores(equipe).filter(function (u) {
      return Aprovacao.idDoUsuario(u) !== eu;
    });
    return outros.length === 0;
  };

  /* Quem pode aprovar o PRÓPRIO documento. Fora daqui para não repetir a
     regra em três lugares (aprovar, rejeitar, revisar). Ver Aprovacao.podeAcao. */
  Aprovacao.podeAutoAprovar = function (u, c) {
    u = u || {}; c = c || {};
    /* regra 3 vence tudo: a conta de um aprovador só NÃO pode travar, senão o
       documento morre em "aguardando" para sempre — nem a trava a barra. */
    if (c.semOutroAprovador === true) return true;
    /* a empresa pode FORÇAR quatro olhos de volta para todo mundo, inclusive
       admin — a mesma trava opcional do RDO (`exigirOutroAprovador`). */
    if (c.exigirOutroAprovador === true) return false;
    return (u.papel === "admin")     // autoridade da conta
        || (u.autoAprovar === true); // usuário MARCADO para isso
  };

  Aprovacao.podeAcao = function (acao, usuario, doc, ctx) {
    var u = usuario || {}, d = doc || {}, c = ctx || {};
    var eu = Aprovacao.idDoUsuario(u);
    var gestor = (u.papel === "admin" || u.papel === "gestor" || u.aprovador === true);
    var autor = !!(d.autorId && eu && String(d.autorId).toLowerCase() === eu);

    if (acao === "enviar")  return autor || gestor;
    if (acao === "reabrir") return gestor;
    if (acao === "aprovar" || acao === "rejeitar" || acao === "revisar") {
      if (!gestor) return false;
      /* AUTOAPROVAÇÃO (pedido do cliente, 08/2026). Quatro olhos continua o
         PADRÃO do sub-usuário comum: quem preenche não aprova o próprio. A
         exceção, que antes valia só para a conta de um aprovador só, agora
         alcança o ADMIN e o usuário MARCADO com `autoAprovar` — e some se a
         empresa exigir um segundo aprovador. A trilha grava
         `aprovadoPeloProprioAutor`: exceção declarada, não furo. */
      if (autor) return Aprovacao.podeAutoAprovar(u, c);
      return true;
    }
    /* editar: enquanto não estiver aprovado. Documento aprovado que muda por
       baixo transforma a aprovação em teatro. */
    if (acao === "editar") {
      var est = Aprovacao.estadoDe(d);
      if (est === "aprovado") return false;
      if (est === "em_aprovacao") return gestor;   // o autor não puxa de volta calado
      return autor || gestor;
    }
    return false;
  };

  /* --- A TRANSIÇÃO -----------------------------------------------------
   * Puro de propósito: DEVOLVE o destino, não grava. Quem grava é a tela, que
   * é também quem escreve a trilha. (No RDO essa separação já existe e foi
   * confundida uma vez — vale o aviso aqui.) */
  Aprovacao.transicionar = function (doc, acao, usuario, dados) {
    var d = doc || {}, dd = dados || {};
    var atual = Aprovacao.estadoDe(d);
    var destino = (TRANSICOES[atual] || {})[acao];
    var rot = (Aprovacao.ESTADOS[atual] || {}).rotulo || atual;

    if (!destino) return { ok: false, erro: "Não dá para " + acao + " um documento em \"" + rot + "\"." };

    if (!Aprovacao.podeAcao(acao, usuario, d, dd)) {
      var eu = Aprovacao.idDoUsuario(usuario);
      var ehAutor = !!(d.autorId && eu && String(d.autorId).toLowerCase() === eu);
      if ((acao === "aprovar" || acao === "rejeitar") && ehAutor) {
        return { ok: false, erro: "Quem preencheu não pode aprovar o próprio documento. Peça a outro aprovador da empresa." };
      }
      return { ok: false, erro: "Seu perfil não tem permissão para " + acao + "." };
    }

    /* regra 2: recusar em silêncio devolve trabalho sem informação */
    if ((acao === "revisar" || acao === "rejeitar") && !String(dd.motivo || "").trim()) {
      return { ok: false, erro: "Escreva o motivo — é essa mensagem que chega a quem preencheu." };
    }
    return { ok: true, estado: destino };
  };

  /* --- A TRILHA --------------------------------------------------------
   * "Quem liberou isso?" é a primeira pergunta quando algo errado chega ao
   * cliente. Sem trilha ela não tem resposta. */
  /* ⚠ UM SO LUGAR RESPONDE "QUEM E ESSA PESSOA".
   * Havia TRES gravadores de aprovador: `Gestao._quemAprova`, este
   * `registrar` e o do RDO. A v1.2.14 consertou so o primeiro, e o resultado
   * foi pior que o defeito original: em `Gestao._aprovar` os dois rodam em
   * sequencia, entao o MESMO ato de aprovacao gravava dois nomes no MESMO
   * documento — o selo (`aprovadoPor`) dizia a pessoa e a trilha
   * (`historicoAprovacao[].por`) dizia a razao social. Quem fosse auditar
   * "quem liberou isso?" acharia as duas respostas e nao saberia qual vale.
   * Isto le a sessao CRUA (`u.nome`), que para a conta mestre e a empresa;
   * `Auth.nome()` ja resolve pessoa antes de empresa. Todos os chamadores
   * passam `Auth.usuario()`, entao a raiz e a mesma para os tres. */
  Aprovacao.nomeDe = function (usuario) {
    var u = usuario || {};
    try {
      var atual = (typeof Auth !== "undefined" && Auth.usuario) ? Auth.usuario() : null;
      if (atual && atual === u && Auth.nome) return Auth.nome() || u.email || "—";
    } catch (e) {}
    return u.nomePessoal || u.nome || u.email || "—";
  };

  Aprovacao.registrar = function (doc, acao, usuario, dados, agoraISO) {
    var d = doc || {}, dd = dados || {};
    var quem = Aprovacao.nomeDe(usuario);
    var eu = Aprovacao.idDoUsuario(usuario);
    var proprioAutor = !!(d.autorId && eu && String(d.autorId).toLowerCase() === eu);

    d.historicoAprovacao = (d.historicoAprovacao || []).concat([{
      acao: acao, por: quem, em: agoraISO, motivo: dd.motivo || "",
      autoriaNaoVerificada: Aprovacao.autoriaIncerta(d) || undefined,
      aprovadoPeloProprioAutor: (acao === "aprovar" && proprioAutor) || undefined
    }]);

    if (acao === "aprovar") {
      d.aprovadoPor = quem; d.aprovadoEm = agoraISO; d.revisaoMotivo = "";
      if (proprioAutor) d.aprovadoPeloProprioAutor = true;
    }
    if (acao === "revisar" || acao === "rejeitar") {
      d.revisaoMotivo = dd.motivo; d.revisaoPor = quem; d.revisaoEm = agoraISO;
    }
    if (acao === "reabrir") { d.aprovadoPor = ""; d.aprovadoEm = ""; }
    return d;
  };

  /* --- O QUE A TELA PRECISA SABER ------------------------------------- */

  /* Os botões que fazem sentido AGORA, para ESTA pessoa. A tela não decide
     regra: ela desenha o que este motor autoriza. */
  Aprovacao.acoesDisponiveis = function (doc, usuario, ctx) {
    var atual = Aprovacao.estadoDe(doc);
    var mapa = TRANSICOES[atual] || {};
    var out = [];
    for (var acao in mapa) {
      if (!Object.prototype.hasOwnProperty.call(mapa, acao)) continue;
      if (Aprovacao.podeAcao(acao, usuario, doc, ctx)) out.push(acao);
    }
    return out;
  };

  Aprovacao.ROTULO_ACAO = {
    enviar: "Enviar para aprovação", aprovar: "Aprovar", revisar: "Pedir revisão",
    rejeitar: "Rejeitar", reabrir: "Reabrir"
  };

  /* Um documento não aprovado NÃO vale como decisão. Quem pergunta é o
     financeiro, a fatura e o Portal — e todos precisam da mesma resposta. */
  Aprovacao.valeComoDecisao = function (doc) {
    return Aprovacao.estadoDe(doc) === "aprovado";
  };

  /* A fila do gestor: o que está esperando por MIM, mais velho primeiro.
     `pendentes` é o número que vira o badge no menu. */
  Aprovacao.filaDoAprovador = function (docs, usuario, ctx) {
    return (docs || []).filter(function (d) {
      return Aprovacao.estadoDe(d) === "em_aprovacao" &&
             Aprovacao.podeAcao("aprovar", usuario, d, ctx);
    }).sort(function (a, b) {
      return String(a.enviadoEm || a.data || "").localeCompare(String(b.enviadoEm || b.data || ""));
    });
  };

  /* O que voltou PARA MIM com pedido de correção. O autor precisa ver isso
     sem procurar — foi o defeito que quase passou no diário. */
  Aprovacao.minhasDevolucoes = function (docs, usuario) {
    var eu = Aprovacao.idDoUsuario(usuario);
    return (docs || []).filter(function (d) {
      return Aprovacao.estadoDe(d) === "em_revisao" &&
             !!d.autorId && String(d.autorId).toLowerCase() === eu;
    });
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Aprovacao;
  else raiz.Aprovacao = Aprovacao;
})(typeof window !== "undefined" ? window : this);

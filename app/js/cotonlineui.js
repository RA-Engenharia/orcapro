/* =====================================================================
 * cotonlineui.js — A FIAÇÃO DA COTAÇÃO ONLINE NO APP
 *
 * O engenheiro publica a cotação na loja, cada fornecedor recebe um link
 * próprio, preenche os preços numa página pública, e o engenheiro "puxa" as
 * respostas para dentro do Mapa de Cotação. O motor (js/cotacoes.js:
 * validarPublicacao / snapshotPublicacao / aplicarRespostas / respostasNovas)
 * decide o que entra e o que não entra; aqui só tem rede, modal e Store.
 *
 * ⚠ TOKEN NUNCA É GRAVADO. O link de cada fornecedor é `/cotar?t=<token>`
 *   e o token vive só no servidor. `cot.online.convites` guarda cid/nome/
 *   respondidoEm — nada mais. Motivo: a cotação sincroniza pela nuvem e vai
 *   nos backups; um token gravado ali viraria acesso público à proposta do
 *   fornecedor a partir de qualquer cópia da base. Quando o engenheiro quer
 *   os links de novo, pede ao servidor (`links`).
 *
 * ⚠ O FORMULÁRIO É LIDO ANTES DE ABRIR QUALQUER MODAL. `UI.modal` fecha o
 *   modal anterior (o do Mapa) — depois disso os inputs não existem mais.
 *   Por isso todo fluxo começa com `Gestao._cotDoForm(c)` e termina reabrindo
 *   `Gestao.formCotacao(cot)` com o objeto atualizado.
 *
 * ⚠ ORDEM DE CARGA: depois de gestao.js (usa Gestao._cotDoForm, _urlLoja,
 *   _bloqueado, _upsell) — a tag em index.html vem após proptplui.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CotOnlineUI = {};

  /* ------------------------------------------------------------------
   * helpers
   * ------------------------------------------------------------------ */
  function _G() { return (typeof Gestao !== "undefined") ? Gestao : null; }
  function _base() { var G = _G(); return (G && G._urlLoja) ? String(G._urlLoja() || "").replace(/\/$/, "") : ""; }
  function _chave() { return (typeof Licenca !== "undefined" && Licenca.chave) ? (Licenca.chave() || "") : ""; }
  function _eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function _esc(s) { return (typeof Util !== "undefined" && Util.esc) ? Util.esc(s == null ? "" : String(s)) : String(s == null ? "" : s); }
  function _toast(msg, tipo) { if (typeof UI !== "undefined" && UI.toast) UI.toast(msg, tipo || "erro"); }
  function _ico(nome) { return (typeof Icones !== "undefined" && Icones.get) ? Icones.get(nome, 15) : ""; }
  function _agora() { return new Date().toISOString(); }
  function _uid(p) { return (typeof Util !== "undefined" && Util.uid) ? Util.uid(p) : (p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); }
  function _fmt(iso, comAno) {
    /* dd/mm hh:mm (ou dd/mm/aaaa hh:mm). Sem Util.fmtData: ela é "—" para
       vazio e mostra ano sempre — na linha de status o ano só ocupa espaço */
    var t = Date.parse(iso); if (!isFinite(t)) return "—";
    var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + (comAno ? "/" + d.getFullYear() : "") + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function _fmtDia(iso) {
    var t = Date.parse(iso); if (!isFinite(t)) return "—";
    var d = new Date(t), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }
  function _motor() { return (typeof Cotacoes !== "undefined" && Cotacoes && Cotacoes.onlineAtiva) ? Cotacoes : null; }
  function _ativa(cot) { var M = _motor(); return !!(M && cot && M.onlineAtiva(cot)); }
  /* ⚠ VENCIDA ≠ ACABADA. O servidor guarda a publicação por mais 30 dias
     depois do vencimento e continua respondendo `estado` e `encerrar`. A
     proposta que o fornecedor mandou na última tarde da validade só existe
     lá; a tela antiga, no ramo "não ativa", oferecia apenas "Cotar online" e
     essa resposta ficava invisível para sempre. `onlineVencida` (motor) é a
     régua; o fallback local existe porque uma instalação pode subir o app
     novo com um js/cotacoes.js antigo em cache — e aí a régua sumir
     esconderia dinheiro de novo. */
  function _vencida(cot) {
    var M = _motor();
    if (M && typeof M.onlineVencida === "function") { try { return !!M.onlineVencida(cot); } catch (e) {} }
    var on = cot && cot.online;
    if (!on || !on.id || on.encerradaEm) return false;
    return !_ativa(cot);
  }
  /* ⚠ ENCERRADA NÃO É INALCANÇÁVEL: o servidor guarda a publicação por mais 30
     dias depois do encerramento (server/cotacao-srv.js: PODA_MS) e continua
     respondendo `/estado`. Sem esta janela, a proposta que o motor recusou no
     encerrar ficava sem porta nenhuma — o `encerradaEm` apaga o card e leva o
     botão Puxar junto. Fora dos 30 dias a porta some porque atrás dela não há
     mais nada: botão que promete o que o servidor já apagou é pior que
     ausência de botão. */
  var RESGATE_MS = 30 * 86400000;
  function _resgatavel(cot) {
    var on = cot && cot.online;
    if (!on || !on.id || !on.encerradaEm) return false;
    /* ⚠ DEPOIS DE UM 404 NÃO HÁ MAIS O QUE RESGATAR — E O BOTÃO TEM DE SUMIR.
       O `encerrar` que recebe 404 (publicação podada, base restaurada, ou "não
       é sua": o servidor responde igual de propósito) grava `encerradaEm` do
       mesmo jeito, para a trava dos itens sair. Só pela data, o card seguia
       oferecendo "Puxar respostas da rodada encerrada" — e clicar devolvia o
       MESMO 404. Duas histórias na mesma tela, e é a regra que o comentário
       acima escreve com todas as letras: botão que promete o que o servidor já
       apagou é pior que ausência de botão. */
    if (on.sumiuNoServidor) return false;
    var t = Date.parse(on.encerradaEm);
    return isFinite(t) && (Date.now() - t) < RESGATE_MS;
  }
  /* e-mail da licença desta máquina (dono da publicação, quando o servidor
     não devolve `dono`) — em minúsculas, como o servidor compara */
  function _emailLicenca() {
    try {
      if (typeof Licenca !== "undefined" && Licenca.status) {
        var s = Licenca.status() || {};
        return String(s.email || "").trim().toLowerCase();
      }
    } catch (e) {}
    return "";
  }

  /* permissão em FUNÇÃO (não só no botão): as ações daqui não passam pelo
     dispatcher `Gestao.acao`, então a guarda RBAC do módulo tem de estar aqui */
  function _pode() {
    if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("cotacoes")) {
      _toast("Seu usuário não tem permissão no módulo Cotações.", "erro"); return false;
    }
    var G = _G();
    if (G && G._bloqueado && G._bloqueado()) return false;
    return true;
  }
  /* plano: tier vazio = compra antiga = liberado; base = não; trial não tem
     chave e cai antes (sem chave o servidor nem responde) */
  function _plus() {
    if (typeof Licenca === "undefined" || !Licenca.status) return false;
    var s = Licenca.status() || {};
    return !!s.ativo && !s.trial && s.tier !== "base";
  }
  function _quem() {
    try { var u = (typeof Auth !== "undefined" && Auth.usuario) ? Auth.usuario() : null; return (u && (u.nome || u.login || u.empresa)) || ""; } catch (e) { return ""; }
  }
  function _empresaNome() {
    try { if (typeof Empresa !== "undefined" && Empresa.nomeDoc) { var n = Empresa.nomeDoc(); if (n) return n; } } catch (e) {}
    try { var u = (typeof Auth !== "undefined" && Auth.usuario) ? Auth.usuario() : null; return (u && u.empresa) || ""; } catch (e2) { return ""; }
  }
  function _obraNome(cot) {
    try { if (cot && cot.obraId && typeof Store !== "undefined") { var o = Store.obter(_eid(), "obras", cot.obraId); return (o && o.nome) || ""; } } catch (e) {}
    return "";
  }
  function _salvar(cot) {
    if (typeof Store === "undefined" || !Store.salvar) return null;
    return Store.salvar(_eid(), "cotacoes", cot);
  }
  /* ⚠ O REGISTRO VIVO, NÃO A FOTO DO MODAL.
   * `Gestao._cotDoForm(c)` monta o objeto a partir do `c` que estava no
   * closure quando o Mapa abriu. Entre abrir e clicar em Puxar/Encerrar, a
   * nuvem pode ter trazido a MESMA cotação já concluída em outro aparelho
   * (pedidos de compra emitidos). Gravando por cima, o status voltava a
   * "enviada", o merge levava isso adiante, e concluir de novo gerava pedido
   * em dobro — dinheiro lançado duas vezes. Ler o registro antes de gravar é
   * a porta que fecha isso. */
  function _vivo(id) {
    if (!id || typeof Store === "undefined" || !Store.obter) return null;
    try { return Store.obter(_eid(), "cotacoes", id) || null; } catch (e) { return null; }
  }
  /* ⚠ O RECADO NÃO AFIRMA O QUE NINGUÉM CONFERIU.
   * As seis portas daqui diziam "os pedidos já foram gerados" só porque o
   * registro vivo dizia `concluida`. Registro que chegou concluído pelo merge
   * da nuvem (ou de uma instalação em versão antiga) pode não ter NENHUMA
   * compra carimbada NESTA máquina: a pessoa ia a Compras procurar um pedido
   * que não existe ali, e desistia achando que o sistema mentiu.
   * Quem sabe é o módulo Compras, e o Gestao já pergunta a ele
   * (`_cotMsgConcluida` → `_cotPedidosGerados`, js/gestao.js): quando acha,
   * nomeia os pedidos; quando não acha, diz que NÃO ENCONTROU — nunca que não
   * existem (pedido de aparelho que ainda não sincronizou existe e não está
   * aqui). O fallback é para a ordem de carga: este arquivo pode encontrar um
   * gestao.js antigo em cache, e aí o texto se limita ao que foi verificado (o
   * status) sem inventar pedido nenhum. */
  function _msgConcluida(id) {
    var G = _G();
    if (G && G._cotMsgConcluida) {
      try { var m = G._cotMsgConcluida(id); if (m) return String(m); } catch (e) {}
    }
    return "Esta cotação foi concluída (talvez em outro aparelho). Daqui não dá para saber se os pedidos de compra já foram gerados — confira em Compras. Feche e abra de novo.";
  }
  /* devolve false quando o registro vivo diz "concluída" (e já avisou o
     usuário); senão traz do vivo a única coisa que a tela não tem como saber:
     qual publicação está valendo agora.
   *
   * ⚠ STATUS E HISTÓRICO NÃO SE COPIAM AQUI — E ISSO NÃO É ESQUECIMENTO.
   * `Gestao._cotDoForm` já traz os dois do registro vivo, mas com DUAS guardas
   * que uma cópia crua desfaz:
   *   · histórico é log append-only, e a versão antiga do app não o escreve.
   *     Lá a régua é `vivo.historico && vivo.historico.length`; aqui,
   *     `vivo.historico || atual.historico` deixava passar a lista VAZIA (`[]`
   *     é truthy) — puxar/encerrar/links gravavam histórico zerado por cima do
   *     que o outro aparelho tinha, e isso sai daqui pela nuvem.
   *   · status: quando a publicação veio do `base` (o registro vivo nem sabe
   *     dela), o `_cotDoForm` PROMOVE rascunho → enviada. Copiando o status
   *     cru, gravava-se "rascunho" com `online.id` ativo — registro
   *     contraditório: itens destravados na lista de cá, publicação viva no
   *     servidor, e o merge levando o "rascunho" para os outros aparelhos.
   * `online` continua vindo do vivo porque é a MESMA semântica do
   * `_cotDoForm` (`(vivo && vivo.online) || base.online`): herança, nunca
   * troca — registro vivo sem `online` não apaga a publicação. */
  /* ⚠ LOG SE UNE, NUNCA SE SUBSTITUI — E O ARRAY DE VOLTA É NOVO.
   * A releitura antiga (`atual.historico = vivo.historico`) protegia a entrada
   * do OUTRO aparelho e jogava fora a que ESTA máquina acabou de gravar. O
   * roteiro alcançável é o publicar-sobre-vencida: `_encerrarVencidaAntes`
   * escreve "online-encerrada" e SALVA antes do POST /publicar; se o merge da
   * nuvem trocar o registro durante a viagem, a releitura apagava o rastro de
   * que a rodada vencida foi encerrada e de que a proposta do fornecedor
   * entrou no Mapa por ali — e o `_salvar` seguinte empurrava a perda para a
   * nuvem. Append-only nos DOIS sentidos = união por (em + acao + detalhe),
   * ordenada por `em`.
   * ⚠ O ARRAY DEVOLVIDO É OUTRO, DE PROPÓSITO. `Store.obter` devolve um
   * registro recém-parseado em produção, mas qualquer cache de leitura (e o
   * Store do mundo falso) devolve o objeto VIVO: apontando para ele, o `push`
   * do `_hist` escreveria DENTRO do registro guardado, e um "o save falhou,
   * então nada foi gravado" passaria a ser mentira sem ninguém ver. */
  function _unirHistorico(daqui, dela) {
    var a = Array.isArray(daqui) ? daqui : [], b = Array.isArray(dela) ? dela : [];
    var saida = [], vistos = {};
    function juntar(lista) {
      lista.forEach(function (h) {
        if (!h) return;
        /* prefixo "k": chave crua bateria com "constructor" e amigos do
           Object.prototype, e a entrada sumiria do log sem aviso */
        var k = "k" + String(h.em || "") + "|" + String(h.acao || "") + "|" + String(h.detalhe || "");
        if (Object.prototype.hasOwnProperty.call(vistos, k)) return;
        vistos[k] = 1;
        saida.push(h);
      });
    }
    juntar(b); juntar(a);
    /* ISO 8601 ordena como texto. Entrada sem data legível vai para o fim, na
       ordem em que apareceu: perder o rastro por causa de uma data ilegível
       seria trocar um defeito por outro. */
    saida.sort(function (x, y) {
      var ex = String((x && x.em) || ""), ey = String((y && y.em) || "");
      if (!ex && !ey) return 0;
      if (!ex) return 1;
      if (!ey) return -1;
      return ex < ey ? -1 : (ex > ey ? 1 : 0);
    });
    return saida;
  }
  function _sincronizarVivo(atual, recado) {
    if (!atual) return false;
    var vivo = _vivo(atual.id);
    if ((vivo && vivo.status === "concluida") || atual.status === "concluida") {
      _toast(recado || _msgConcluida(atual.id), "erro");
      return false;
    }
    if (vivo) atual.online = vivo.online || atual.online;
    /* ⚠ A ÚNICA RELEITURA DO LOG DEPOIS DA VIAGEM DE REDE.
     * `_sincronizarVivo` é chamado DUAS vezes de propósito em cada fluxo
     * (antes do POST e depois): a segunda existe porque a viagem leva
     * segundos, e nesse intervalo a nuvem pode ter fundido, por baixo do modal
     * aberto, uma entrada de histórico que o OUTRO aparelho gravou. Sem reler
     * aqui, o `_salvar` do fim do fluxo passava por cima dela e o log deixava
     * de ser append-only exatamente no ponto em que o comentário acima afirma
     * que ele é — e a perda saía daqui pela nuvem para os outros aparelhos.
     * ⚠ A RÉGUA É `.length`, NUNCA `||` PURO. `[]` é truthy, e a versão antiga
     * do app grava a cotação sem histórico: `atual.historico = vivo.historico
     * || atual.historico` copiava a lista VAZIA por cima e apagava o log. É a
     * mesma régua do `_cotDoForm` real (js/gestao.js:18932). Com a UNIÃO a
     * lista vazia já não apagaria nada, mas a régua fica: ela também é o que
     * evita reordenar o log à toa quando não há nada novo para unir. Status
     * continua fora daqui — ver o parágrafo acima. */
    if (vivo && vivo.historico && vivo.historico.length) atual.historico = _unirHistorico(atual.historico, vivo.historico);
    return true;
  }
  /* ------------------------------------------------------------------
   * A PORTA DO DINHEIRO: "ESTA COTAÇÃO JÁ VIROU PEDIDO DE COMPRA?"
   *
   * ⚠ REGRA 5 DA SKILL `dinheiro`: A PERGUNTA CERTA NÃO É "ESTE DOCUMENTO JÁ
   * FOI CONCLUÍDO?".
   * `_sincronizarVivo` (logo acima) pergunta `vivo.status === "concluida"` —
   * exatamente o campo EDITÁVEL que o merge da nuvem desfaz, e que uma
   * conclusão recusada pelo disco deixa de volta em "rascunho". Quem sabe se já
   * saiu dinheiro é o módulo Compras, pelo carimbo `cotacaoId` do pedido, que
   * ninguém apaga daqui.
   * Roteiro reproduzido: pedido de compra emitido e carimbado, registro em
   * "rascunho", e clicar em **Links** — botão que a pessoa usa só para
   * REENVIAR o link ao fornecedor — regravava itens, preços, frete, prazo,
   * condição, status e histórico por cima do documento que originou aquele
   * pedido, com ZERO toasts. `puxar` e `encerrar` faziam o mesmo. O que está em
   * Compras passava a divergir do mapa que o gerou, calado, e o merge levava a
   * divergência para a frota.
   * As portas irmãs de js/gestao.js (o Salvar e o Concluir do Mapa) já
   * perguntam a `_cotPedidosGerados`; estas seis daqui eram as que faltavam —
   * e meia correção em dinheiro é pior que nenhuma (regra 3).
   *
   * ⚠ SÓ O CARIMBO AUTORIZA BARRAR — BARRAR DEMAIS TAMBÉM É DEFEITO.
   * O que volta de Compras é conferido item a item por `cotacaoId === id`
   * (regras 1 e 2: nunca casar por descrição, valor ou fornecedor). PC de OUTRA
   * cotação e PC legado sem carimbo não podem travar esta tela — proteger o
   * dado velho errado é pior que não protegê-lo.
   *
   * Devolve: [] = nenhum pedido DESTA cotação · lista = os pedidos dela ·
   * `null` = NÃO SEI (gestao.js antigo em cache, sem a função). "Não sei" nunca
   * vira "não existe": quem chama diz que não conseguiu conferir.
   * ------------------------------------------------------------------ */
  function _pedidosDaCotacao(id) {
    var G = _G();
    if (!id || !G || typeof G._cotPedidosGerados !== "function") return null;
    var lista;
    /* chamado como MÉTODO: o `_cotPedidosGerados` real usa o `eid()` do módulo
       e as portas irmãs o chamam assim */
    try { lista = G._cotPedidosGerados(id); } catch (e) { return null; }
    if (!Array.isArray(lista)) return null;
    var meus = [];
    lista.forEach(function (p) { if (p && p.cotacaoId === id) meus.push(p); });
    return meus;
  }
  function _numerosDePedidos(peds) {
    return (peds || []).map(function (p) { return (p && (p.numero || p.id)) || "sem número"; }).join(", ");
  }
  /* ⚠ TRAVA COM PORTA (regra 6): o recado diz QUAIS pedidos existem — número é
   * o que a pessoa confere; aviso genérico ela lê como formalidade —, diz que
   * nada foi gravado, e aponta as DUAS saídas que existem de verdade. São as
   * mesmas do `_cotMsgSalvarComPedidos` (js/gestao.js) e aqui não se inventa uma
   * terceira: "Concluir e gerar pedidos" TERMINA a conclusão que ficou pela
   * metade sem emitir nada de novo (e encerra a publicação online junto, por
   * `_cotTerminarConclusao` → `encerrarSilencioso`); excluir os pedidos em
   * Compras zera o carimbo que esta guarda lê e devolve o mapa à edição.
   * ⚠ E O TEXTO NÃO É O DAQUELA FUNÇÃO PALAVRA POR PALAVRA por um motivo só: lá
   * o botão está NO MESMO modal ("aqui mesmo"), e daqui a pessoa pode estar no
   * modal de publicar — o `UI.modal` fechou o Mapa. Mandar clicar num botão que
   * a tela não tem é o defeito que este arquivo inteiro persegue, então o
   * recado nomeia o Mapa. */
  function _msgPedidosGerados(peds, oQueNaoAconteceu) {
    return "Esta cotação já gerou " + peds.length + " pedido(s) de compra (" + _numerosDePedidos(peds) +
      ") — não posso regravar o mapa por cima do documento que originou esses pedidos, senão o que está em Compras passa a divergir da cotação que o gerou. " +
      (oQueNaoAconteceu ? oQueNaoAconteceu + " " : "") +
      "Duas saídas: no Mapa, clique em \"Concluir e gerar pedidos\" para terminar a conclusão que ficou pela metade (nada é emitido de novo, e os links são encerrados junto); ou, se esses pedidos não valem, exclua-os em Compras — aí o mapa volta a aceitar edição.";
  }
  /* ⚠ "NÃO SEI" NÃO GRAVA CALADO — MAS TAMBÉM NÃO VIRA TRAVA.
   * Sem `_cotPedidosGerados` (este arquivo pode encontrar um gestao.js antigo
   * em cache, como já acontece com `_cotMsgConcluida` e `onlineVencida`),
   * recusar aqui seria trava sem porta numa instalação em que as portas irmãs
   * do Salvar/Concluir também não existem — ela ficaria sem Puxar e sem
   * Encerrar, com os links vivos no servidor, e sem ganhar proteção nenhuma em
   * troca. Então segue, e diz que não conseguiu conferir: recado que mente é
   * pior que recado nenhum, e afirmar "está tudo certo" sem ter perguntado é
   * mentir. */
  function _avisarSemConferirCompras() {
    _toast("Não consegui perguntar ao módulo Compras se esta cotação já virou pedido (o app está com um arquivo antigo em cache — recarregue a página). Segui em frente: se já houver pedido de compra desta cotação, confira em Compras se ele bate com o mapa.", "aviso");
  }
  /* devolve false quando a gravação do Mapa NÃO pode acontecer (e já avisou) */
  function _podeRegravarMapa(cot, oQueNaoAconteceu) {
    var peds = _pedidosDaCotacao(cot && cot.id);
    if (peds === null) { _avisarSemConferirCompras(); return true; }
    if (!peds.length) return true;
    _toast(_msgPedidosGerados(peds, oQueNaoAconteceu), "erro");
    return false;
  }
  /* ⚠ O ID QUE FOI AO SERVIDOR E O QUE ESTÁ NO REGISTRO TÊM DE SER O MESMO.
   * `_sincronizarVivo` traz o `online` do registro vivo, mas o modal continua
   * segurando a foto de quando abriu. Quando o outro aparelho encerrou e
   * publicou de novo, os dois divergem: o app perguntava/encerrava a
   * publicação VELHA no servidor e carimbava `encerradaEm` na publicação NOVA,
   * que seguia viva lá recebendo proposta — com o app dizendo "Cotação online
   * encerrada." e sem botão nenhum para encerrar de verdade. Melhor não fazer
   * nada e dizer a verdade do que gravar no lugar errado. */
  function _mesmaPublicacao(atual, pubId) {
    if (atual && atual.online && atual.online.id === pubId) return true;
    _toast("A publicação desta cotação mudou (outro aparelho publicou de novo). Nada foi alterado aqui — feche e abra o Mapa para ver a publicação atual.", "aviso");
    return false;
  }
  /* a lista atrás do modal lê o Store: sem isto ela mostra o total velho
     depois de puxar/encerrar/gravar, e o engenheiro decide pelo número errado */
  function _render() {
    if (typeof App !== "undefined" && App.render) { try { App.render(); } catch (e) {} }
  }
  /* o motor é PURO: `aplicarRespostas` devolve um cot NOVO. A referência do
     formulário está presa em closures (botões do modal), então os campos
     voltam para dentro dela em vez de trocar o ponteiro. */
  function _absorver(cot, novo) {
    if (!cot || !novo) return cot;
    for (var k in novo) { if (Object.prototype.hasOwnProperty.call(novo, k)) cot[k] = novo[k]; }
    return cot;
  }
  /* ⚠ O QUE A TELA MOSTRA TEM DE SER O QUE ESTÁ GRAVADO.
   * Quando o `_salvar` falha (localStorage cheio — a causa real em produção), o
   * objeto do formulário já recebeu tudo que não foi para o disco, e é ele que
   * o "Voltar"/✕ reabre: o Mapa voltava mostrando preço, status e botão que o
   * registro salvo não tem, e a pessoa decidia olhando uma tela que não existe.
   * Reler o registro e devolvê-lo ao objeto do closure faz a tela dizer a
   * verdade. Devolve false quando nem reler foi possível — aí quem chama tem de
   * dizer que NÃO SABE, nunca fingir que está tudo bem.
   * ⚠ `_absorver` sobrescreve chave por chave e não apaga as que o registro
   * gravado não tem; para os campos que estes fluxos mexem (online, status,
   * fornecedores, historico) o registro sempre as tem, e apagar campo de quem
   * está no closure seria pior. */
  function _reverterDoDisco(cot) {
    var vivo = _vivo(cot && cot.id);
    if (!vivo) return false;
    try { _absorver(cot, JSON.parse(JSON.stringify(vivo))); return true; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------
   * FILA DE ENCERRAMENTO PENDENTE (localStorage)
   *
   * ⚠ Concluir ou excluir a cotação sem internet disparava UM POST de
   * encerramento e esquecia. O POST falhava calado e o link do fornecedor
   * continuava vivo por até 30 dias: ele abria, mandava proposta, e não havia
   * mais ninguém do lado de cá para puxar nem cotação para receber. A fila
   * guarda o id (com a chave de licença que publicou — I1: a publicação é do
   * DONO, e outra licença recebe 404) até o servidor confirmar.
   * ------------------------------------------------------------------ */
  var FILA_CHAVE = "raerp:cotonline:encerrar-pendente";
  /* ⚠ A FILA PRECISA DE FUNDO. `desde` era gravado e nunca lido: uma entrada
     que o servidor recusa para sempre (licença desativada, vencida ou trocada
     na renovação responde 401) ficava ali eternamente, e cada abertura do Mapa
     disparava um POST por entrada — 40 encerramentos sem rede viravam 40 POSTs
     por abertura. Passados FILA_DIAS a publicação já morreu sozinha no
     servidor (30 dias após vencer), então insistir só gasta rede: a entrada
     sai. O teto protege o localStorage de crescer sem limite. */
  var FILA_TETO = 50;
  var FILA_DIAS = 40;
  var _avisouFila = false;      // o recado de licença recusada é UM por carga, não um por abertura do Mapa
  var _avisouOutraLic = false;  // idem para "a publicação é de outra licença" (motivo diferente, contador próprio)
  function _filaPodar(a) {
    var corte = Date.now() - FILA_DIAS * 86400000, b = [];
    (a || []).forEach(function (x) {
      if (!x || !x.id) return;
      var t = Date.parse(x.desde);
      if (isFinite(t) && t < corte) return;
      b.push(x);
    });
    return b.length > FILA_TETO ? b.slice(b.length - FILA_TETO) : b;
  }
  function _filaLer() {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return [];
      var t = localStorage.getItem(FILA_CHAVE);
      var a = t ? JSON.parse(t) : [];
      if (!Array.isArray(a)) return [];
      var b = _filaPodar(a);
      if (b.length !== a.length) _filaGravar(b);
      return b;
    } catch (e) { return []; }
  }
  /* ⚠ DIZ SE O NAVEGADOR ACEITOU. Em janela anônima e com a cota cheia o
     `setItem` LANÇA, e o catch engolia calado: o recado seguia prometendo que
     os links "serão encerrados quando a conexão voltar" para uma fila que não
     existia — e o fornecedor ficava com o link vivo até 30 dias sem ninguém
     saber. Quem promete precisa saber se guardou. */
  function _filaGravar(a) {
    try {
      if (typeof localStorage === "undefined" || !localStorage) return false;
      localStorage.setItem(FILA_CHAVE, JSON.stringify(a || []));
      return true;
    } catch (e) { return false; }
  }
  /* ⚠ QUANDO O NAVEGADOR RECUSA A FILA, A MEMÓRIA É A ÚNICA PORTA QUE SOBRA.
   * Em janela anônima e com a cota cheia o `setItem` LANÇA — e o
   * `encerrarSilencioso` já carimbou `cot.online.encerradaEm` antes de
   * descobrir isso, então a tela perde o botão Encerrar e a cotação (concluída
   * ou excluída logo em seguida) nunca mais tenta. O resultado medido: os
   * links do fornecedor vivos por até 30 dias e um recado mandando "encerre
   * esta cotação de novo" — uma ação que o produto não permite mais. Recado
   * com porta fechada é o defeito, não o texto.
   * Esta fila vive SÓ enquanto o app estiver aberto, e é exatamente isso que o
   * recado promete a partir de agora — nem uma palavra a mais. Ela não
   * substitui a do localStorage (aquela atravessa o fechar do app); é o que
   * resta quando aquela recusa. */
  var _filaMem = [];
  function _memEntrar(id, chave, dono) {
    if (!id) return false;
    var achou = false;
    _filaMem.forEach(function (x) { if (x && x.id === id) { achou = true; if (dono) x.dono = dono; } });
    if (!achou) {
      /* mesmo teto da fila persistente: uma sessão longa com o storage
         recusando não pode virar uma lista sem fim de POSTs por abertura */
      if (_filaMem.length >= FILA_TETO) _filaMem.shift();
      _filaMem.push({ id: id, chave: chave || "", dono: dono || "", desde: _agora(), memoria: true });
    }
    return true;
  }
  function _memTem(id) {
    var achou = false;
    _filaMem.forEach(function (x) { if (x && x.id === id) achou = true; });
    return achou;
  }
  function _filaEntrar(id, chave, dono) {
    if (!id) return false;
    var a = _filaLer(), achou = false;
    a.forEach(function (x) { if (x && x.id === id) achou = true; });
    if (achou) return true;
    a.push({ id: id, chave: chave || "", dono: dono || "", desde: _agora() });
    if (_filaGravar(a)) return true;
    /* o navegador recusou: guarda na memória para as retomadas desta sessão */
    return _memEntrar(id, chave, dono);
  }
  /* ⚠ O DONO VIAJA COM A ENTRADA. O servidor responde 404 tanto para "essa
     publicação não existe" quanto para "essa publicação não é sua" — de
     propósito, para não virar oráculo de ids alheios (é a mesma armadilha que
     o `encerrar` já trata em `deOutraLicenca`). Sem o dono guardado, a
     retomada tirava a entrada da fila e calava, e os links do fornecedor
     seguiam vivos até vencer com o app dizendo que estava tudo encerrado. */
  function _filaAnotarDono(id, dono) {
    if (!id || !dono) return false;
    /* a entrada pode ter caído na fila de memória (localStorage recusado): sem
       o dono ali, a retomada desta sessão volta a calar no 404 anti-oráculo */
    _filaMem.forEach(function (x) { if (x && x.id === id) x.dono = dono; });
    var a = _filaLer(), mexeu = false;
    a.forEach(function (x) { if (x && x.id === id && x.dono !== dono) { x.dono = dono; mexeu = true; } });
    return mexeu ? _filaGravar(a) : false;
  }
  function _filaTem(id) {
    var achou = false;
    _filaLer().forEach(function (x) { if (x && x.id === id) achou = true; });
    return achou;
  }
  function _filaSair(id) {
    if (!id) return;
    var b = [];
    _filaLer().forEach(function (x) { if (x && x.id !== id) b.push(x); });
    _filaGravar(b);
    var m = [];
    _filaMem.forEach(function (x) { if (x && x.id !== id) m.push(x); });
    _filaMem = m;
  }
  /* ⚠ 404 COM DONO CONHECIDO NÃO É "JÁ MORREU". O recado não afirma que os
     links estão vivos (daqui não dá para saber: a publicação pode ter sido
     podada) — afirma o que foi verificado: o servidor não aceitou este
     encerramento e a publicação é de outra licença. */
  /* ⚠ O RÓTULO VIAJA COMO ARGUMENTO — NUNCA NUMA VARIÁVEL DE MÓDULO.
     Ele morava em `_rotuloDoAviso`, gravado por `_avisoEhDeUmaAcao` em TODO
     404 do `encerrarSilencioso` — inclusive naqueles em que nenhum toast sai
     (dono vazio, ou dono igual ao e-mail desta licença). O rótulo ficava
     pendurado, e a varredura de fundo seguinte (`retomarPendentes` →
     `_tratarPendente`) o consumia: o único recado que existe sobre links de
     fornecedor vivos no servidor saía com o NÚMERO DE OUTRA cotação —
     justamente a que estava em ordem. A pessoa abria aquela, via tudo certo, e
     a publicação de verdade seguia de pé até vencer. Recado com número errado
     é pior que recado sem número: o número é o que ela confere. */
  function _avisarOutraLicenca(dono, rotulo) {
    if (_avisouOutraLic) return;
    _avisouOutraLic = true;
    _toast("Os links " + (rotulo ? "da cotação " + rotulo : "de uma cotação") + " não foram encerrados no servidor: a publicação é da licença " + dono + ", e o servidor não deixa outra licença encerrá-la. Eles podem seguir válidos até a publicação vencer — encerre com aquela licença.", "aviso");
  }
  /* ⚠ A TRAVA "UM RECADO POR CARGA" É DA VARREDURA DE FUNDO, NÃO DA AÇÃO DA
   * PESSOA. Em `retomarPendentes` (N entradas de uma vez, a cada abertura do
   * Mapa) ela evita transformar o aviso em ruído. Em `encerrarSilencioso` —
   * uma cotação por vez, porque alguém acabou de concluir ou excluir AQUELA —
   * a mesma trava apagava o único recado que existia: a 2ª cotação ficava em
   * silêncio TOTAL (nem toast, nem console) com `encerradaEm` já carimbado e os
   * links do fornecedor de pé no servidor. Quem age agora recebe o recado
   * agora, e com o NÚMERO da cotação: "os links de uma cotação" sem dizer qual
   * a pessoa lê como formalidade — número ela confere. */
  function _rotuloDaCotacao(cot) {
    return cot ? String(cot.numero || cot.descricao || "").slice(0, 40) : "";
  }
  /* destrava a trava "um recado por carga" para a ação que a pessoa acabou de
     fazer. O rótulo NÃO fica guardado aqui (ver o ⚠ de `_avisarOutraLicenca`):
     quem avisa passa o número na hora, e só quem avisa. */
  function _avisoEhDeUmaAcao(cot) {
    _avisouOutraLic = false;
    return _rotuloDaCotacao(cot);
  }
  function _hist(cot, acao, detalhe) {
    if (!Array.isArray(cot.historico)) cot.historico = [];
    cot.historico.push({ em: _agora(), acao: acao, quem: _quem(), detalhe: detalhe || "" });
  }
  /* mesma normalização de Gestao.acessoMovel: só dígitos, DDI 55 quando o
     número veio sem ele (≤ 11 dígitos = DDD + número) */
  function _foneIntl(fone) {
    var d = String(fone || "").replace(/\D/g, "");
    if (!d) return "";
    return d.length <= 11 ? "55" + d : d;
  }
  function _fornecedorCadastro(cot, cid) {
    var fr = null;
    (cot && cot.fornecedores || []).forEach(function (x) { if (!fr && x && x.cid === cid) fr = x; });
    if (!fr || !fr.fornecedorId || typeof Store === "undefined") return null;
    try { return Store.obter(_eid(), "fornecedores", fr.fornecedorId) || null; } catch (e) { return null; }
  }

  /* POST JSON na loja com a chave de licença. Resolve { s, j } (j = {} se o
     corpo não for JSON). Rejeita só em erro de REDE — e aí já avisou, a menos
     que `silencioso` (consulta de fundo ao abrir o formulário: um toast a
     cada abertura sem internet seria ruído, não informação). */
  function _post(rota, corpo, silencioso, chave) {
    var base = _base();
    if (!base) {
      if (!silencioso) _toast("Endereço do servidor da RA não configurado.", "erro");
      return Promise.reject(new Error("sem base"));
    }
    return fetch(base + rota, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-licenca": (chave || _chave()) },
      body: JSON.stringify(corpo || {})
    }).then(function (r) {
      return r.json().then(function (j) { return { s: r.status, j: j || {} }; }, function () { return { s: r.status, j: {} }; });
    }, function (e) {
      if (!silencioso) _toast("Sem conexão com o servidor da RA. Tente de novo com internet.", "erro");
      throw e;
    });
  }
  function _erroDe(x, padrao) { return (x && x.j && x.j.erro) ? String(x.j.erro) : (padrao || ("Falha no servidor (HTTP " + (x && x.s) + ")")); }

  /* mesmo alvo que o UI.modal considera "fechar" (js/ui.js:95-120): o ✕ ou
     qualquer ancestral com data-fechar — o alvo do toque sobre o ícone é o
     <svg>/<path>, nunca o <button> — e o clique que COMEÇOU no véu. A condição
     do véu copia a do UI.modal de propósito: o navegador sintetiza o click no
     ancestral comum quando o mousedown começou DENTRO de um input (arrastar
     para selecionar texto e soltar fora), e sem `_downNoBg` esse acidente
     reabriria o Mapa por cima do modal aberto. */
  function _gestoDeFechar(bg, e) {
    var alvo = e && e.target;
    if (!alvo) return false;
    if (alvo === bg) return !!bg._downNoBg;
    var n = alvo;
    while (n && n !== bg) {
      if (n.hasAttribute && n.hasAttribute("data-fechar")) return true;
      n = n.parentNode;
    }
    return false;
  }

  /* ⚠ O ✕ E O VÉU NÃO PASSAM PELOS BOTÕES DO RODAPÉ.
   * `UI.modal` fecha o modal anterior — e o Mapa de Cotação, com tudo que o
   * engenheiro acabou de digitar, morre nesse instante. O `aoFechar` que
   * reabre o Mapa estava só no botão "Fechar": quem clicava no ✕ (ou no fundo)
   * voltava para a lista e perdia o formulário.
   *
   * ⚠ UM ÚNICO OUVINTE, NO `bg`, NUNCA NO BOTÃO — E DEPOIS DA GUARDA DO UI.
   * A primeira versão deste conserto pendurou o `aoFechar` no próprio
   * [data-fechar]. Como o botão é descendente do véu, ele dispara ANTES do
   * ouvinte que o UI.modal registrou no `bg`: o Mapa reabria e, um passo
   * depois, o UI chamava `UI.fecharModal()` — que resolve `#modal-bg` por id e
   * naquele instante já era o MAPA RECÉM-ABERTO. Medido no Chrome: clicar no ✕
   * deixava a tela SEM MODAL NENHUM, e o engenheiro caía na lista. Registrando
   * aqui, no mesmo `bg` e depois do UI, a ordem se inverte e o gesto termina
   * com o Mapa de pé.
   *
   * ⚠ `bg.parentNode` É A PERGUNTA "O UI CHEGOU A FECHAR?". Sem ela, responder
   * "não" à pergunta "Há informações não salvas… fechar e perder?" fechava o
   * modal do mesmo jeito: o UI respeitava o Cancelar e nós reabríamos por
   * cima. Botão que faz o oposto do que diz treina o usuário a ignorar a
   * pergunta que protege de verdade. */
  function _reabrirAoFechar(bg, aoFechar) {
    if (!bg || !aoFechar || typeof bg.addEventListener !== "function") return;
    var feito = false;
    var uma = function () { if (feito) return; feito = true; try { aoFechar(); } catch (e) {} };
    bg.addEventListener("click", function (e) {
      if (!_gestoDeFechar(bg, e)) return;
      if (bg.parentNode) return;
      uma();
    });
  }

  /* ------------------------------------------------------------------
   * O QUE O MOTOR RECUSOU, E O QUE ELE SUBSTITUIU
   *
   * ⚠ `Cotacoes.aplicarRespostas` devolve `ignoradas` e `substituidos`, e
   * nenhuma tela lia. Duas portas de dano ficavam em silêncio:
   *   · RECUSA (o fornecedor saiu da grade, a proposta veio sem preços
   *     legíveis): `aplicadas` ficava 0 e o puxar dava o toast VERDE "Nenhuma
   *     resposta nova." com o card ao lado dizendo "1/1 responderam" — a
   *     pessoa lia "ele não respondeu" e comprava sem a proposta dele.
   *   · SUBSTITUIÇÃO: a coluna do fornecedor passa a ser a resposta INTEIRA,
   *     então o preço anotado por telefone SOME quando a rodada nova não cotou
   *     aquele item; o fornecedor deixa de estar completo e a compra troca de
   *     dono sem ninguém perceber.
   * ------------------------------------------------------------------ */
  /* "já aplicada" NÃO é recusa: é o caso normal de puxar duas vezes. Virar
     aviso ensinaria a pessoa a ignorar justamente o aviso que importa. */
  function _recusas(ignoradas) {
    var a = [];
    (ignoradas || []).forEach(function (g) {
      if (!g || String(g.motivo || "") === "já aplicada") return;
      a.push(g);
    });
    return a;
  }
  /* motivos distintos, na ordem em que apareceram: repetir "fornecedor não
     está na cotação" três vezes não informa mais do que uma */
  function _motivos(lista) {
    var ms = [];
    (lista || []).forEach(function (g) {
      var m = String((g && g.motivo) || "recusada");
      if (ms.indexOf(m) < 0) ms.push(m);
    });
    return ms.join("; ");
  }
  /* ⚠ SEM CHAMADOR NO PRODUTO, DE PROPÓSITO — NÃO APAGUE.
     Os três caminhos que aplicam resposta usam o `_fraseRecusaComPorta` (mesmo
     fato, mesma frase). Esta é a versão SEM porta: o número sozinho, sem dizer
     de quem nem o que fazer. Ela fica porque é o que o controle negativo da
     suíte injeta no lugar da frase boa para provar que a porta está lá
     (tools/test-cotacao-fiacao.js, bloco R5) — apagá-la faz aquela cópia
     sabotada morrer com ReferenceError em vez de reprovar o assert. */
  function _fraseRecusa(lista) {
    if (!lista || !lista.length) return "";
    return lista.length + " proposta(s) não puderam ser aplicadas: " + _motivos(lista) + ".";
  }
  /* ⚠ CADA MOTIVO TEM (OU NÃO TEM) UMA SAÍDA DIFERENTE.
   * A frase única "corrija a grade (o fornecedor precisa estar nela) e use
   * Puxar respostas da rodada encerrada" era impressa também para "proposta sem
   * preços" e "resposta inválida" (js/cotacoes.js), motivos em que a grade não
   * tem nada a ver: ali o problema é a proposta em si. E, quando os links já
   * foram encerrados, nem o reenvio existe. Recado que manda fazer o que não
   * resolve treina a pessoa a ignorar o próximo — e o próximo é o que importa. */
  /* ⚠ A MESMA FRASE SAI POR DOIS TIPOS DE CAMINHO — E SÓ É VERDADE EM UM DELES.
   * `puxar` e `encerrar` imprimem "Elas ficam no servidor por 30 dias: use
   * 'Puxar respostas da rodada encerrada'" DEPOIS de gravar a rodada encerrada:
   * ali a porta existe de verdade (é a que o `wireForm` desenha, ver
   * `_resgatavel`) e o prazo acabou de começar a correr. Os dois confirms de
   * publicar-por-cima imprimiam o MESMO texto ANTES de trocar `cot.online` pela
   * publicação nova — e quem responde PUBLICAR perde o vínculo local com a
   * rodada encerrada: o botão some, o id dela não fica gravado em lugar nenhum,
   * e a proposta que o servidor ainda guarda vira inalcançável pelo app. Some a
   * isso que o prazo não começa no clique: os 30 dias contam do ENCERRAMENTO
   * (server/cotacao-srv.js: PODA_MS), que nesses caminhos pode ter sido há 29
   * dias — "ficam por 30 dias" oferecia um mês que já tinha passado.
   * Nesses dois caminhos, então, o texto diz a DATA real e amarra a promessa ao
   * caminho que a entrega. Prometer o que só o outro botão entrega é o mesmo
   * defeito de sempre, com outra roupa. */
  function _ondeFicamSeCancelar(cot) {
    var t = Date.parse((cot && cot.online && cot.online.encerradaEm) || "");
    var ate = isFinite(t) ? _fmtDia(new Date(t + RESGATE_MS).toISOString()) : "";
    return "O servidor as guarda " + (ate ? "até " + ate : "por 30 dias depois do encerramento") +
      ", e elas só chegam aqui enquanto esta cotação apontar para a rodada encerrada: ";
  }
  /* `noCancelar` = a frase está descrevendo o que a pessoa TEM SE CANCELAR (os
     dois confirms de publicar por cima), não o estado em que a cotação já está */
  function _saidaDaRecusa(lista, cot, noCancelar) {
    var comConvite = 0, semConvite = 0, outras = 0;
    var convites = (cot && cot.online && cot.online.convites) || [];
    (lista || []).forEach(function (g) {
      if (String((g && g.motivo) || "") !== MOTIVO_SEM_COLUNA) { outras++; return; }
      /* a porta só existe onde o convite existe: é dele que sai o `cid` que o
         motor exige (ver `_religarColunas`) */
      var cid = String((g && g.cid) || ""), tem = false;
      convites.forEach(function (cv) { if (!tem && cv && cv.cid === cid) tem = true; });
      if (tem) comConvite++; else semConvite++;
    });
    var encerrada = !!(cot && cot.online && cot.online.encerradaEm);
    var botao = encerrada ? "\"Puxar respostas da rodada encerrada\"" : "\"Puxar respostas\"";
    var ondeFica = encerrada
      ? (noCancelar ? _ondeFicamSeCancelar(cot) : "Elas ficam no servidor por 30 dias: ")
      : "Elas continuam no servidor: ";
    var s = "";
    if (comConvite) {
      var cheia = ((cot && cot.fornecedores) || []).length >= MAX_COLUNAS;
      s += ondeFica + (cheia
        ? ("a grade já está com " + MAX_COLUNAS + " fornecedores (o máximo) — tire um e use " + botao + ", que aí o app oferece recriar a coluna do fornecedor.")
        : ("use " + botao + " e aceite recriar a coluna do fornecedor quando o app perguntar."));
    }
    if (semConvite) {
      s += (s ? " " : "") + "Esta cotação não guarda mais o convite " + (semConvite > 1 ? "dessas propostas" : "dessa proposta") +
        ", então não dá para religar a coluna daqui: para receber de novo é preciso publicar uma rodada nova para " +
        (semConvite > 1 ? "esses fornecedores" : "esse fornecedor") + ".";
    }
    if (outras) {
      s += (s ? " " : "") + "A proposta em si não pôde ser lida, e mexer na grade não resolve: " +
        (encerrada
          ? "os links desta rodada já foram encerrados, então para receber de novo é preciso publicar uma rodada nova."
          : "só o fornecedor resolve, reenviando pelo link dele (que continua válido).");
    }
    return s;
  }
  /* ⚠ TODA TRAVA PRECISA DE PORTA — e depois do encerrar não sobrava nenhuma.
   * Com `online.encerradaEm` gravado, `_ativa` e `_vencida` ficam os dois
   * falsos e o card perde os botões: a proposta que o motor RECUSOU (o
   * fornecedor saiu da grade, os preços vieram ilegíveis) não voltava por
   * caminho nenhum, e a pessoa acabava de ler um toast verde. O servidor
   * guarda a publicação encerrada por mais 30 dias (server/cotacao-srv.js:
   * PODA_MS) e continua respondendo `/estado` — então a porta existe de fato:
   * o `wireForm` desenha "Puxar respostas da rodada encerrada" (ver
   * `_resgatavel`), e o recado diz o nome de quem ficou de fora e o caminho. */
  function _fraseRecusaComPorta(lista, cot, convitesSrv) {
    if (!lista || !lista.length) return "";
    var quem = _nomesDosCids(lista, cot, convitesSrv);
    var saida = _saidaDaRecusa(lista, cot);
    return lista.length + " proposta(s)" + (quem ? " de " + quem : "") + " não puderam ser aplicadas: " + _motivos(lista) +
      "." + (saida ? " " + saida : "");
  }
  /* ⚠ A PORTA QUE O RECADO PROMETE TEM DE EXISTIR DE VERDADE.
   * O motor casa proposta com coluna SÓ pelo `cid` (js/cotacoes.js:
   * `txt(fr.cid) === cid`), e o `cid` de uma coluna removida do Mapa não volta
   * por tela nenhuma: o "×" apaga a linha e o "+ fornecedor" sorteia um uid
   * NOVO (js/gestao.js: `fr.cid || Util.uid("ctf")`). O recado antigo mandava
   * "corrija a grade e use Puxar respostas da rodada encerrada" — a pessoa
   * fazia exatamente isso, recriava a coluna à mão e levava a MESMA recusa,
   * quantas vezes tentasse, com a proposta parada no servidor. O convite guarda
   * `cid` e `nome` do fornecedor apagado, então a porta existe: o app oferece
   * recriar a coluna COM O CID DO CONVITE, e aí o motor casa.
   * ⚠ POR CID, NUNCA POR NOME OU POSIÇÃO. Casar por semelhança é a família de
   * defeito que esta base já pagou caro; o cid é a única ponte entre a coluna e
   * o convite.
   * ⚠ E SÓ COM O CONVITE LOCAL. `cot.online.convites` é o que ESTA cotação
   * registrou ao publicar: sem ele, não dá para afirmar de quem é a coluna que
   * se iria criar — e criar coluna errada é pior que não criar nenhuma. */
  var MAX_COLUNAS = 4;                                     // js/gestao.js: maxF do Mapa de Cotação
  var MOTIVO_SEM_COLUNA = "fornecedor não está na cotação"; // js/cotacoes.js: aplicarResposta
  function _religarColunas(cot, recusadas) {
    var falta = [], vistos = {};
    (recusadas || []).forEach(function (g) {
      if (!g || String(g.motivo || "") !== MOTIVO_SEM_COLUNA) return;
      var cid = String(g.cid || "");
      if (!cid || Object.prototype.hasOwnProperty.call(vistos, "c" + cid)) return;
      var nome = "";
      (((cot && cot.online && cot.online.convites) || [])).forEach(function (cv) { if (!nome && cv && cv.cid === cid) nome = cv.nome || ""; });
      if (!nome) return;
      vistos["c" + cid] = 1;
      falta.push({ cid: cid, nome: nome });
    });
    if (!falta.length) return { criadas: 0, perguntou: false };
    if (!Array.isArray(cot.fornecedores)) cot.fornecedores = [];
    /* ⚠ GRADE CHEIA: NÃO OFERECER, E DEIXAR A VERDADE COM QUEM JÁ A CONTA.
       A grade tem teto de 4 colunas; oferecer a criação aqui seria a mesma
       promessa impossível de antes, só que com outra roupa. Quem diz o que
       fazer é o `_saidaDaRecusa`, que os três caminhos imprimem — dois recados
       sobre o mesmo fato é como a pessoa aprende a ignorar os dois. O que não
       couber volta como recusa na segunda passada e cai lá. */
    var vagas = MAX_COLUNAS - cot.fornecedores.length;
    if (vagas <= 0) return { criadas: 0, perguntou: false };
    var cabem = falta.slice(0, vagas);
    var nomesCabem = cabem.map(function (f) { return f.nome; }).join(", ");
    if (!window.confirm("A proposta de " + nomesCabem + " não tem coluna no Mapa (a coluna foi removida depois da publicação).\n\n" +
      "Quer criar a coluna de volta — com o mesmo fornecedor do convite — para receber a proposta?")) return { criadas: 0, perguntou: true };
    cabem.forEach(function (f) {
      cot.fornecedores.push({ cid: f.cid, nome: f.nome, fornecedorId: null, frete: 0, precos: {} });
    });
    return { criadas: cabem.length, perguntou: true };
  }
  /* aplica de novo DEPOIS de recriar a coluna, sem outra viagem de rede (o
     estado do servidor já está na mão). Os números se SOMAM: quem lê o recado —
     e o histórico — precisa do total do clique, não da última passada. O motor
     recusa "já aplicada" o que entrou na primeira, e `_recusas` filtra isso. */
  function _religarEAplicarDeNovo(res, online, msgSeBarrado) {
    var recusadas = _recusas(res.ignoradas);
    if (!recusadas.length) return res;
    var rel = _religarColunas(res.cot, recusadas);
    /* ⚠ O `confirm` REABRE A JANELA QUE AS DEZ PORTAS FECHARAM.
       A pergunta ao Compras de logo acima é a foto de ANTES do `window.confirm`
       — e a caixa fica aberta o tempo que a pessoa levar para ler. O JS desta
       aba para, mas o localStorage não: uma segunda aba da mesma origem (ou o
       "Gerar pedidos" do outro aparelho, que a nuvem entrega assim que a caixa
       fecha) emite o pedido de compra nesse intervalo, e o `_salvar` logo
       adiante gravaria a coluna nova por cima do documento que originou aquele
       dinheiro. Por isso, sempre que a caixa apareceu — aceita OU recusada —,
       pergunta-se de novo, e quem recusa é a mesma régua (`_podeRegravarMapa`,
       carimbo `cotacaoId` em Compras, nunca o `status`). O chamador recebe
       `barrado` e sai sem gravar, com o recado que ele mesmo usa na pergunta
       de depois da viagem de rede. */
    if (rel.perguntou && !_podeRegravarMapa(res.cot, msgSeBarrado || "Nada foi gravado aqui.")) {
      return { barrado: true, cot: res.cot, aplicadas: res.aplicadas, ignoradas: res.ignoradas, substituidos: res.substituidos, perdas: res.perdas || [] };
    }
    if (!rel.criadas) return res;
    var r2 = _aplicarEstado(res.cot, online);
    return {
      cot: r2.cot,
      aplicadas: res.aplicadas + r2.aplicadas,
      ignoradas: r2.ignoradas,
      substituidos: res.substituidos + r2.substituidos,
      perdas: (res.perdas || []).concat(r2.perdas || [])
    };
  }
  /* ⚠ ESTE NÚMERO NÃO É "TROCADO POR OUTRO" — É "FICOU SEM PREÇO".
   * O motor conta só o preço PERDIDO: js/cotacoes.js diz, com todas as letras,
   * "Conta só o preço PERDIDO (existia e a resposta não trouxe), nunca o preço
   * trocado por outro". O texto antigo — "N valor(es) digitado(s) à mão foram
   * substituídos pela proposta online" — dizia o OPOSTO do que o número é:
   * quem lê "substituído" entende "o preço dele entrou no lugar do meu" e não
   * confere nada. O que aconteceu foi a célula ficar VAZIA — o fornecedor
   * deixa de estar completo, cai fora do `vencedorUnico` e a compra troca de
   * dono sem ninguém perceber. Recado que descreve o dano errado é pior que
   * recado nenhum: ele encerra a dúvida em vez de abri-la.
   * ⚠ E O NÚMERO SOZINHO NÃO TEM O QUE FAZER numa grade de 8 colunas × 40
   * linhas: a frase diz também de QUEM e em QUE item (ver `_perdasDaColuna`). */
  /* ⚠ E A CAUSA NÃO SE INVENTA. O texto dizia "(a proposta online não cotou
   * esse(s) item(ns))" — uma explicação que ninguém verificou. O motor sabe que
   * pode ser o contrário e não conta para a tela: `aplicarResposta` devolve
   * `ignorados` (preços que a proposta TROUXE e a grade não reconheceu) e
   * `aplicarRespostas` não agrega esse número — nenhuma tela consegue lê-lo.
   * Roteiro medido: o item foi apagado e redigitado no Mapa (id novo), a
   * publicação ainda fala do id antigo, o fornecedor cotou os DOIS itens e o
   * app aplica um só — e avisava que ele "não cotou" o outro. O engenheiro
   * fecha a compra com outro fornecedor por causa da explicação errada. O que
   * foi verificado é só isto: o preço que estava na grade não está mais lá. */
  function _fraseSubstituidos(n, perdas) {
    if (!(n > 0)) return "";
    var onde = _ondePerdeu(perdas);
    return n + " preço(s) que estavam na grade ficaram SEM valor" +
      (onde ? ": " + onde : "") + " — a proposta que entrou não trouxe valor para esse(s) item(ns) (o fornecedor pode não ter cotado, ou o item pode ter mudado no Mapa depois da publicação); confira a coluna antes de decidir a compra.";
  }
  /* "Fornecedor Alfa: Cimento CP-II" — a língua da obra. Teto de 3 colunas e 3
     itens por coluna: recado que vira parágrafo a pessoa não lê, e o resto
     está no Mapa, que é onde a decisão acontece de verdade. */
  function _ondePerdeu(perdas) {
    var partes = [], sobra = 0;
    (perdas || []).forEach(function (p) {
      if (!p || !p.itens || !p.itens.length) return;
      if (partes.length >= 3) { sobra++; return; }
      var mostra = p.itens.slice(0, 3);
      partes.push(p.nome + " (" + mostra.join(", ") + (p.itens.length > mostra.length ? " e mais " + (p.itens.length - mostra.length) : "") + ")");
    });
    if (!partes.length) return "";
    return partes.join("; ") + (sobra ? " e mais " + sobra + " fornecedor(es)" : "");
  }
  /* ⚠ OS TRÊS CAMINHOS QUE APLICAM RESPOSTA CONTAM A MESMA HISTÓRIA.
   * `puxar`, `encerrar` e o "publicar de novo" chamam o MESMO `_aplicarEstado`
   * e recebem os MESMOS três números — mas só o puxar os lia. O encerrar (cujo
   * próprio confirm promete "as respostas já enviadas são puxadas agora") dava
   * toast VERDE e gravava "0 resposta(s) puxada(s)" enquanto o preço da grade
   * sumia e a proposta recusada morria junto com os links. Duas telas do mesmo
   * módulo contando histórias diferentes sobre o mesmo dinheiro é o defeito;
   * um detalhe só, montado aqui, é a trava. */
  function _detalheAplicacao(aplicadas, substituidos, perdas, recusadas) {
    var det = aplicadas + " resposta(s) puxada(s)";
    if (substituidos > 0) {
      var onde = _ondePerdeu(perdas);
      det += " · " + substituidos + " preço(s) da grade ficaram sem valor" + (onde ? " (" + onde + ")" : "");
    }
    if (recusadas && recusadas.length) det += " · " + recusadas.length + " proposta(s) não coube(ram) na grade: " + _motivos(recusadas);
    return det;
  }
  /* o recado fala a língua da obra ("Fornecedor Alfa"), não a do banco
     ("ctf_1"): o nome sai da grade e, se ele já não estiver lá — que é
     justamente o motivo mais comum da recusa —, dos convites do servidor */
  function _nomesDosCids(lista, cot, convitesSrv) {
    var nomes = [];
    (lista || []).forEach(function (g) {
      var cid = (g && g.cid) || "", nome = "";
      ((cot && cot.fornecedores) || []).forEach(function (fr) { if (!nome && fr && fr.cid === cid) nome = fr.nome || ""; });
      (convitesSrv || []).forEach(function (cv) { if (!nome && cv && cv.cid === cid) nome = cv.nome || ""; });
      if (!nome) nome = "sem nome";
      if (nomes.indexOf(nome) < 0) nomes.push(nome);
    });
    return nomes.join(", ");
  }

  /* ------------------------------------------------------------------
   * aplicar o estado do servidor na cotação local (puxar / encerrar)
   * ------------------------------------------------------------------ */
  /* leitura de preço tolerante: a grade guarda número, mas base restaurada de
     versão antiga (e importação) traz "2,40" como texto — e um preço que este
     helper não enxergasse viraria "não havia nada ali", justamente o oposto do
     que o aviso precisa dizer */
  function _numPreco(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? "" : v).replace(/\./g, "").replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  /* ⚠ QUEM PERDEU PREÇO, E EM QUE ITEM — o motor só devolve a CONTAGEM.
   * `Cotacoes.aplicarRespostas` conta quantos preços a resposta apagou, e é só
   * isso que ele pode fazer sem deixar de ser puro. Mas "1 valor" numa cotação
   * de 8 colunas × 40 linhas não diz onde olhar, e o aviso vira formalidade.
   * A comparação entre a coluna de ANTES e a de DEPOIS é o único lugar onde as
   * duas existem juntas, e é aqui. Índice de item não desloca no caminho: o
   * motor reconstrói a coluna por id → índice ATUAL, sobre a MESMA lista de
   * itens que estamos lendo. */
  function _perdasDaColuna(antes, depois) {
    var perdas = [];
    var itens = (depois && Array.isArray(depois.itens)) ? depois.itens : [];
    ((depois && depois.fornecedores) || []).forEach(function (fr) {
      if (!fr || !fr.cid) return;
      var ant = antes[fr.cid];
      if (!ant) return;
      var perdidos = [];
      for (var k in ant.precos) {
        if (!Object.prototype.hasOwnProperty.call(ant.precos, k)) continue;
        if (!(_numPreco(ant.precos[k]) > 0)) continue;                       // não era preço: nada se perdeu
        var agora = (fr.precos && Object.prototype.hasOwnProperty.call(fr.precos, k)) ? _numPreco(fr.precos[k]) : 0;
        if (agora > 0) continue;                                             // continua cotado (trocado, não perdido)
        var it = itens[Number(k)];
        perdidos.push((it && it.descricao) ? String(it.descricao) : ("item " + (Number(k) + 1)));
      }
      if (perdidos.length) perdas.push({ cid: fr.cid, nome: fr.nome || "sem nome", itens: perdidos });
    });
    return perdas;
  }
  function _aplicarEstado(atual, online) {
    var M = _motor();
    var convites = (online && Array.isArray(online.convites)) ? online.convites : [];
    var antesDaColuna = {};
    ((atual && atual.fornecedores) || []).forEach(function (fr) {
      if (!fr || !fr.cid) return;
      antesDaColuna[fr.cid] = { nome: fr.nome || "", precos: (fr.precos && typeof fr.precos === "object") ? JSON.parse(JSON.stringify(fr.precos)) : {} };
    });
    var respostas = [];
    convites.forEach(function (cv) {
      if (cv && cv.resposta && typeof cv.resposta === "object") {
        var r = JSON.parse(JSON.stringify(cv.resposta)); r.cid = cv.cid; respostas.push(r);
      }
    });
    var res = (M && M.aplicarRespostas) ? M.aplicarRespostas(atual, respostas) : { cot: atual, aplicadas: 0, ignoradas: [], substituidos: 0 };
    var cot = res.cot;
    /* espelha "respondeu em" nos convites locais (o motor já faz isso para
       as aplicadas; aqui cobre também as que o servidor tem e o motor recusou
       por já estarem aplicadas — idempotente) */
    if (cot.online && Array.isArray(cot.online.convites)) {
      cot.online.convites.forEach(function (cvL) {
        convites.forEach(function (cvS) {
          if (cvS && cvL && cvS.cid === cvL.cid && cvS.resposta && cvS.resposta.respondidoEm) {
            var a = Date.parse(cvL.respondidoEm), b = Date.parse(cvS.resposta.respondidoEm);
            if (!isFinite(a) || (isFinite(b) && b > a)) cvL.respondidoEm = cvS.resposta.respondidoEm;
          }
        });
      });
    }
    /* `|| 0` porque uma instalação pode subir este arquivo com um
       js/cotacoes.js antigo em cache, que não devolve `substituidos` — e aí
       "undefined valor(es)" seria pior que não avisar */
    return { cot: cot, aplicadas: res.aplicadas, ignoradas: res.ignoradas, substituidos: res.substituidos || 0, perdas: _perdasDaColuna(antesDaColuna, cot) };
  }

  /* ------------------------------------------------------------------
   * wireForm — o bloco #ct-online dentro do Mapa de Cotação
   * ------------------------------------------------------------------ */
  CotOnlineUI.wireForm = function (c, raiz) {
    raiz = raiz || document;
    var el = raiz.querySelector ? raiz.querySelector("#ct-online") : null;
    if (!el) el = document.getElementById("ct-online");
    if (!el || !c) return;
    /* abrir o Mapa é uma das três chances de terminar um encerramento que
       ficou preso na fila por falta de rede (as outras: o evento "online" e o
       disparo tardio no fim deste arquivo) */
    try { CotOnlineUI.retomarPendentes(); } catch (eR) {}
    var on = c.online || null;
    var M = _motor();

    if (!_chave()) {
      el.innerHTML = '<div class="muted" style="font-size:12.5px">' + _ico("cadeado") + ' Cotação online: ative a licença para enviar links aos fornecedores.</div>';
      return;
    }
    if (!M) {
      el.innerHTML = '<div class="muted" style="font-size:12.5px">Motor de cotações não carregado — recarregue a página.</div>';
      return;
    }

    var ativa = _ativa(c), vencida = !ativa && _vencida(c);

    /* ⚠ A LINHA DE STATUS VEM ANTES DA GUARDA DE PLANO — E É DE PROPÓSITO.
     * O servidor só exige plano Plus para PUBLICAR (I2): `estado` e `encerrar`
     * passam com qualquer tier. Quando a checagem de plano vinha antes, quem
     * publicou no Plus e caiu para o plano base ficava sem Puxar e sem
     * Encerrar: a publicação seguia viva no servidor, os itens travados, e a
     * única saída era esperar 30 dias. Trava sem porta. Publicar continua
     * exigindo Plus, dentro de `publicar`. */
    if (ativa || vencida) {
      var convites = (on && Array.isArray(on.convites)) ? on.convites : [];
      var M0 = convites.length, N0 = 0;
      convites.forEach(function (cv) { if (cv && cv.respondidoEm) N0++; });
      var borda = vencida ? "#cbd5e1" : "#fcd34d", fundo = vencida ? "#f8fafc" : "#fffbeb", cor = vencida ? "#475569" : "#92400e";
      /* ⚠ O CARD TEM FUNDO FIXO, ENTÃO A COR DO TEXTO TAMBÉM PRECISA SER FIXA.
         As linhas de apoio usavam class="muted", que no tema escuro vira
         #9db0c2 — 2,13:1 sobre o #f8fafc deste card, ilegível. E a linha
         apagada era justamente a que ensina que ainda dá para puxar as
         respostas. Medido: #475569 sobre #f8fafc = 7,24:1 e #92400e sobre
         #fffbeb = 6,84:1, os dois acima de 4,5:1 nos dois temas. */
      var estiloFraco = 'style="font-size:12px;margin-top:4px;color:' + cor + '"';
      /* o ano importa aqui: uma publicação vencida há 90 dias aparecia como
         "venceu em 05/06", sem dizer de que ano; e data ilegível virava
         "venceu em —", que não informa nada */
      var quandoVenceu = _fmt(on.expiraEm, true);
      var titulo = vencida
        ? (_ico("relogio") + (quandoVenceu === "—" ? " Publicação vencida (data não registrada)" : " Publicação venceu em " + quandoVenceu))
        : (_ico("relogio") + " Aguardando fornecedores · válido até " + _fmt(on.expiraEm));
      el.innerHTML = '<div class="card" style="padding:10px 12px;border-color:' + borda + ";background:" + fundo + '">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<span style="font-size:12.5px;font-weight:700;color:' + cor + '">' + titulo + ' · <span id="cto-nm">' + N0 + "/" + M0 + "</span> responderam</span>" +
        '<span style="flex:1"></span>' +
        /* vencido não tem link para mandar: o fornecedor recebe 410 */
        (vencida ? "" : '<button type="button" class="btn sm" id="cto-links">' + _ico("link") + " Links</button> ") +
        '<button type="button" class="btn sm" id="cto-puxar">' + _ico("ciclo") + ' Puxar respostas</button> ' +
        '<button type="button" class="btn sm ghost" id="cto-encerrar" style="color:#dc2626">Encerrar</button>' +
        (vencida ? ' <button type="button" class="btn sm primary" id="cto-publicar">' + _ico("link") + " Publicar de novo</button>" : "") +
        "</div>" +
        (vencida ? '<div id="cto-30d" ' + estiloFraco + ">Respostas enviadas até o vencimento ainda podem ser puxadas por 30 dias.</div>" : "") +
        '<div id="cto-nota" ' + estiloFraco + "></div></div>";
      var bL = el.querySelector("#cto-links"), bP = el.querySelector("#cto-puxar"), bE = el.querySelector("#cto-encerrar"), bR = el.querySelector("#cto-publicar");
      if (bL) bL.onclick = function () { CotOnlineUI.links(c); };
      if (bP) bP.onclick = function () { CotOnlineUI.puxar(c); };
      if (bE) bE.onclick = function () { CotOnlineUI.encerrar(c); };
      if (bR) bR.onclick = function () { CotOnlineUI.publicar(c); };
      if (!on || !on.id) return;
      return CotOnlineUI._consultarEstado(el, c, M, vencida);
    }

    /* ⚠ A PORTA DE VOLTA DA RODADA ENCERRADA (ver `_resgatavel`).
       Ela é desenhada nos DOIS ramos de baixo — inclusive no do plano base —
       porque puxar não exige Plus (I2: só publicar exige), e um resgate que
       só o Plus alcança seria trava sem porta para quem caiu de plano com uma
       proposta ainda no servidor. */
    var htmlResgate = _resgatavel(c)
      ? '<div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<button type="button" class="btn sm ghost" id="cto-puxar">' + _ico("ciclo") + ' Puxar respostas da rodada encerrada</button>' +
        '<span style="font-size:11.5px;color:#475569">O servidor guarda as respostas por 30 dias depois do encerramento.</span></div>'
      : "";
    var ligarResgate = function () {
      var bx = el.querySelector("#cto-puxar");
      if (bx) bx.onclick = function () { CotOnlineUI.puxar(c); };
    };

    if (!_plus()) {
      el.innerHTML = '<div class="muted" style="font-size:12.5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + _ico("estrela") + ' Cotação online é do plano Plus. <button type="button" class="btn sm" id="cto-upsell">Conhecer o Plus</button></div>' + htmlResgate;
      var bu = el.querySelector("#cto-upsell");
      if (bu) bu.onclick = function () { var G = _G(); if (G && G._upsell) G._upsell(); };
      ligarResgate();
      return;
    }

    var nota = "";
    if (on && on.encerradaEm) nota = '<div class="muted" style="font-size:12px;margin-top:4px">Publicação anterior encerrada em ' + _fmt(on.encerradaEm, true) + ".</div>";
    else if (on && on.expiraEm) nota = '<div class="muted" style="font-size:12px;margin-top:4px">Publicação anterior venceu em ' + _fmt(on.expiraEm, true) + ".</div>";
    el.innerHTML = '<div class="card" style="padding:10px 12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<button type="button" class="btn" id="cto-publicar">' + _ico("link") + ' Cotar online — enviar link aos fornecedores</button>' +
      '<span class="muted" style="font-size:12px">Cada fornecedor recebe um link só dele, preenche os preços no celular e você puxa as respostas para cá.</span>' +
      "</div>" + nota + htmlResgate + "</div>";
    var bp = el.querySelector("#cto-publicar");
    if (bp) bp.onclick = function () { CotOnlineUI.publicar(c); };
    ligarResgate();
  };

  /* consulta de fundo: quantas respostas o servidor já tem, e quantas são
     mais novas que as daqui. Falha de rede vira uma linha muted, nunca toast */
  CotOnlineUI._consultarEstado = function (el, c, M, vencida) {
    var on = c.online || {};
    _post("/api/cotacao/estado", { id: on.id }, true).then(function (x) {
      var nota = el.querySelector("#cto-nota"), nm = el.querySelector("#cto-nm"), bP2 = el.querySelector("#cto-puxar");
      if (!nota) return; // formulário já foi fechado
      if (x.s !== 200 || !x.j || !x.j.online) {
        nota.textContent = _erroDe(x, "não consegui consultar o servidor agora");
        /* ⚠ o card não pode prometer 30 dias de respostas logo acima de uma
           nota do servidor dizendo que a publicação não existe mais. Falha de
           REDE (rejeição, sem status) não apaga nada: ali a promessa continua
           valendo e some só quando o servidor responde 404. */
        if (x.s === 404) { var p30 = el.querySelector("#cto-30d"); if (p30) p30.textContent = ""; }
        return;
      }
      var cvs = Array.isArray(x.j.online.convites) ? x.j.online.convites : [];
      var N = 0; cvs.forEach(function (cv) { if (cv && cv.resposta) N++; });
      if (nm) nm.textContent = N + "/" + cvs.length;
      var novas = M.respostasNovas ? M.respostasNovas(c, x.j) : 0;
      if (novas > 0 && bP2) {
        bP2.className = "btn sm primary";
        bP2.innerHTML = _ico("ciclo") + " Puxar respostas (" + novas + (novas === 1 ? " nova)" : " novas)");
      }
      if (x.j.online.encerradaEm) nota.textContent = "O servidor diz que esta publicação foi encerrada em " + _fmt(x.j.online.encerradaEm, true) + " — clique em Encerrar para atualizar aqui.";
      /* no ramo vencido a tela JÁ diz isso no título: repetir aqui vira ruído */
      else if (x.j.online.ativa === false && !vencida) nota.textContent = "O servidor diz que esta publicação já venceu.";
    }, function () {
      var nota = el.querySelector("#cto-nota");
      if (nota) nota.textContent = "não consegui consultar o servidor agora";
    });
  };

  /* ------------------------------------------------------------------
   * publicar
   * ------------------------------------------------------------------ */
  CotOnlineUI.publicar = function (c) {
    if (!_pode()) return;
    var G = _G(), M = _motor();
    if (!G || !G._cotDoForm || !M) { _toast("Motor de cotações não carregado.", "erro"); return; }
    if (!_chave()) { _toast("Ative a licença para enviar links aos fornecedores.", "erro"); return; }
    if (!_plus()) { _toast("Cotação online é do plano Plus.", "erro"); if (G._upsell) G._upsell(); return; }
    var cot = G._cotDoForm(c);
    /* ⚠ A PORTA DO DINHEIRO VEM ANTES DE TUDO (skill `dinheiro`, regra 4: a
       guarda decide antes; o save executa). Publicar grava o Mapa inteiro logo
       abaixo — e com pedido de compra já emitido isso é regravar o documento
       que originou aquele dinheiro. Ver `_podeRegravarMapa`. */
    if (!_podeRegravarMapa(cot, "Nada foi publicado e o Mapa não foi gravado.")) return;
    /* ⚠ O MAPA É GRAVADO ANTES DE QUALQUER MODAL ABRIR.
     * `UI.modal` fecha o modal anterior: no instante em que a caixa "Publicar
     * cotação online" aparece, os inputs do Mapa deixaram de existir. Quem
     * fechava essa caixa pelo ✕ (em vez do "Voltar") perdia tudo que tinha
     * acabado de digitar — preço anotado por telefone, fornecedor novo, item
     * corrigido. Validar e gravar aqui deixa o formulário a salvo antes de a
     * tela mudar; o ✕ e o clique no véu reabrem o Mapa (ver _reabrirAoFechar). */
    var errosMapa = M.validar ? M.validar(cot) : [];
    if (errosMapa.length) { _toast("Corrija o Mapa antes de publicar: " + errosMapa[0], "erro"); return; }
    var errosPub = M.validarPublicacao ? M.validarPublicacao(cot) : [];
    if (errosPub.length) { _toast(errosPub[0], "erro"); return; }
    if (!_salvar(cot)) { _toast("Não consegui salvar o Mapa. Nada foi publicado.", "erro"); return; }
    _render();

    var lista = cot.fornecedores.map(function (fr) {
      var cad = _fornecedorCadastro(cot, fr.cid);
      var tem = cad && (cad.whatsapp || cad.telefone);
      return "<li>" + _esc(fr.nome) + (tem ? ' <span class="muted" style="font-size:11.5px">(WhatsApp no cadastro)</span>' : ' <span class="muted" style="font-size:11.5px">(avulso — você copia o link)</span>') + "</li>";
    }).join("");
    var corpo =
      '<p style="margin:0 0 8px">Cada fornecedor abaixo recebe <b>um link só dele</b>: vê os itens da cotação e digita os próprios preços, frete, prazo e condição.</p>' +
      '<ul style="margin:0 0 10px 18px;font-size:13px">' + lista + "</ul>" +
      '<div class="field"><label>Válido por (dias)</label><input id="cto-dias" type="number" min="1" max="30" step="1" value="' + ((cot.online && cot.online.validadeDias) || 7) + '" style="width:90px"></div>' +
      '<p class="muted" style="font-size:12.5px;margin-top:8px">' + _ico("cadeado") + ' Os itens ficam travados enquanto a publicação estiver aberta. Para mudar itens, encerre e publique de novo. O fornecedor não vê preço de referência nem os outros fornecedores.</p>';
    var enviando = false;
    var voltar = function () { UI.fecharModal(); G.formCotacao(cot); };
    var bg = UI.modal("Publicar cotação online", corpo, [
      { texto: "Voltar", classe: "ghost", onClick: voltar },
      { texto: _ico("link") + " Publicar", classe: "primary", onClick: function () {
        if (enviando) return;
        var dEl = document.getElementById("cto-dias");
        var dias = parseInt(dEl ? dEl.value : "7", 10);
        if (!isFinite(dias) || dias < 1 || dias > 30) { _toast("Validade: de 1 a 30 dias.", "erro"); return; }
        /* ⚠ O CLIQUE ACONTECE MINUTOS DEPOIS DE O MAPA TER SIDO LIDO.
           Entre abrir esta caixa e clicar em Publicar, a nuvem pode ter trazido
           a MESMA cotação já concluída em outro aparelho (pedidos de compra
           emitidos). Sem esta releitura, o clique gravava status "enviada" e
           preço novo por cima do documento fechado que justifica os pedidos —
           e concluir de novo geraria pedido em dobro. */
        if (!_sincronizarVivo(cot)) return;
        enviando = true;
        /* ⚠ A RODADA VENCIDA SAI DO SERVIDOR ANTES DA NOVA NASCER — e as
           respostas dela entram no Mapa no caminho. Publicar por cima de uma
           publicação vencida deixava no servidor uma pub que ainda tinha
           proposta puxável por 30 dias, e ninguém mais voltaria lá: a proposta
           enviada na última tarde da validade morria caladinha. */
        _encerrarVencidaAntes(cot).then(function (segue) {
          if (!segue) { enviando = false; return; }
          var snapshot = M.snapshotPublicacao(cot, { obraNome: _obraNome(cot), empresa: _empresaNome() });
          return _post("/api/cotacao/publicar", { cotacaoId: cot.id, validadeDias: dias, snapshot: snapshot }).then(function (x) {
            enviando = false;
            if (x.s === 403 && x.j && x.j.upgrade) { _toast(_erroDe(x), "erro"); if (G._upsell) G._upsell(); return; }
            /* ⚠ 409 = O SERVIDOR TEM PUBLICAÇÃO ATIVA E ESTE APARELHO NÃO SABE.
               Não é caso raro: o merge da nuvem troca o registro inteiro pelo
               mais novo, uma versão antiga do app salva a cotação sem `online`,
               um backup anterior à publicação é restaurado. O toast sozinho
               deixava a vaga ocupada e as respostas inalcançáveis até vencer.
               Aqui a gente vai buscar a publicação de volta. */
            if (x.s === 409 && x.j && x.j.online && x.j.online.id) { CotOnlineUI._readotar(cot, x.j.online.id, G); return; }
            if (x.s !== 200 || !x.j || !x.j.ok || !x.j.online) { _toast(_erroDe(x, "Não consegui publicar."), "erro"); return; }
            var on = x.j.online, convites = Array.isArray(on.convites) ? on.convites : [];
            /* concluída em outro aparelho DURANTE a viagem de rede: a
               publicação acabou de nascer no servidor e não pode ser gravada
               aqui (ressuscitaria a cotação fechada) nem ficar viva lá sem
               ninguém para puxar — morre no servidor, como no rollback abaixo */
            if (!_sincronizarVivo(cot, _msgConcluida(cot.id) + " Mandei encerrar no servidor a publicação que acabou de nascer; nada foi gravado aqui.")) {
              _desfazerPublicacao(on.id);
              return;
            }
            /* ⚠ E A PORTA DO DINHEIRO PERGUNTA DE NOVO AQUI, pelo mesmo motivo
               da releitura acima: a viagem de rede leva segundos, e o outro
               aparelho pode ter emitido o pedido de compra nesse intervalo com
               o `status` daqui ainda em "rascunho" (que é o que o merge
               produz). A publicação nova morre no servidor, como no rollback
               do `_salvar` recusado logo abaixo. */
            if (!_podeRegravarMapa(cot, "Mandei encerrar no servidor a publicação que acabou de nascer; nada foi gravado aqui.")) {
              _desfazerPublicacao(on.id);
              return;
            }
            /* ⚠ SEM TOKEN — ver o cabeçalho do arquivo */
            cot.online = {
              id: on.id, publicadoEm: on.publicadoEm || _agora(), expiraEm: on.expiraEm,
              validadeDias: on.validadeDias || dias, encerradaEm: null, puxadoEm: null,
              /* dono (I1): a publicação pertence a UMA licença. Sem isso, o 404
                 de outra licença virava "não existia mais" — mentira que
                 destravava os itens e deixava os links vivos. */
              dono: on.dono || _emailLicenca(),
              convites: convites.map(function (cv) { return { cid: cv.cid, nome: cv.nome, respondidoEm: null }; })
            };
            cot.status = "enviada";
            _hist(cot, "online-publicada", convites.length + " link(s), " + dias + " dias");
            if (!_salvar(cot)) {
              /* o servidor já publicou; sem gravação local a publicação ficaria
                 órfã (travando nada, mas aceitando propostas que ninguém puxa).
                 ⚠ `cot.online = null` não é enfeite: este `cot` está preso nos
                 closures do modal, e o ✕ reabre o Mapa com ele. Sem zerar, o
                 Mapa voltava travado, apontando para uma publicação que o app
                 acabou de mandar encerrar. */
              cot.online = null;
              _desfazerPublicacao(on.id);
              /* ⚠ O RECADO NÃO AFIRMA UM ENCERRAMENTO QUE NINGUÉM VERIFICOU.
                 "a publicação foi encerrada" era dito antes de o POST voltar —
                 e, na causa real desta falha (localStorage cheio), sem sequer
                 uma fila para tentar de novo. O que se sabe aqui é: o pedido de
                 encerramento saiu, e se ele ficou agendado. É isso que o texto
                 diz, com o que a pessoa tem a fazer em cada caso.
                 ⚠ a pergunta vai à FILA e não ao retorno de `_desfazerPublicacao`
                 de propósito: as duas linhas acima, coladas, são âncora de
                 controle negativo da suíte (tools/test-cotacao-fiacao.js) — pôr
                 uma atribuição entre elas desligaria a sabotagem sem que nenhum
                 assert reprovasse. O POST é assíncrono, então a entrada ainda
                 está na fila neste instante. */
              var agendado = _filaTem(on.id) || _memTem(on.id);
              /* ⚠ E A RODADA ANTERIOR VOLTA PARA A TELA — MESMA RÉGUA DO IRMÃO
               * (o `_salvar` recusado do `_encerrarVencidaAntes`, logo acima).
               * Zerar `cot.online` protege de um Mapa travado apontando para a
               * publicação que o app acabou de mandar encerrar, mas apagava
               * JUNTO a rodada anterior — que é exatamente a que o recado
               * mandava resgatar. O ✕ reabria o Mapa sem publicação nenhuma:
               * "use 'Puxar respostas da rodada encerrada' na rodada antiga"
               * apontava para um botão que a tela não tinha, embora o registro
               * GRAVADO ainda o ofereça. Recado que manda clicar no que não
               * existe é o que ensina a pessoa a ignorar o próximo.
               * ⚠ E SÓ QUANDO HÁ RODADA ANTERIOR DE VERDADE, lida do DISCO. Se
               * o registro gravado não tem publicação (o caso comum: primeira
               * publicação da cotação), o `cot.online = null` acima continua
               * sendo a única proteção e nada é relido — trazer de volta um
               * `online` que o disco não tem seria inventar tela. */
              var anterior = _vivo(cot.id);
              var temAnterior = !!(anterior && anterior.online && anterior.online.id && anterior.online.id !== on.id);
              var voltou = temAnterior && _reverterDoDisco(cot);
              /* a porta só é nomeada quando ela existe na tela que acabou de
                 voltar (ver `_resgatavel`: fora dos 30 dias, ou com a rodada já
                 sumida do servidor, não há botão nenhum) */
              var portaAntiga = (voltou && _resgatavel(cot))
                ? " Se o fornecedor mandar proposta pelo link antigo, use \"Puxar respostas da rodada encerrada\" para trazê-la."
                : "";
              _toast("Publicado no servidor, mas não consegui gravar aqui (armazenamento do navegador cheio?). " + (agendado
                ? "Mandei encerrar a publicação lá; se o servidor não confirmar agora, tento de novo enquanto este app estiver aberto. Libere espaço e publique de novo."
                : "E não consegui nem agendar esse encerramento neste navegador: a publicação pode seguir viva no servidor até vencer. Libere espaço e publique de novo.") +
                (temAnterior
                  ? (voltou
                    ? (" O que está gravado aqui continua sendo a rodada anterior — o Mapa voltou a ela." + portaAntiga)
                    : " ⚠ E não consegui reler o que está gravado (o Mapa na tela pode não ser o que está salvo): feche e abra o Mapa antes de decidir qualquer coisa.")
                  : ""), "erro");
              return;
            }
            /* a requisição vinculada só entra em "cotando" quando a publicação
               EXISTE dos dois lados: mover antes deixava a requisição órfã em
               "cotando" toda vez que a publicação era abortada */
            if (cot.requisicaoId && typeof Store !== "undefined") {
              try { var rq = Store.obter(_eid(), "requisicoes", cot.requisicaoId); if (rq && rq.status === "aprovada") { rq.status = "cotando"; Store.salvar(_eid(), "requisicoes", rq); } } catch (eR) {}
            }
            UI.fecharModal();
            _render();
            CotOnlineUI._modalLinks(cot, convites, function () { G.formCotacao(cot); });
            _toast("Cotação publicada — envie os links aos fornecedores.", "ok");
          }, function () { enviando = false; });
        }, function () { enviando = false; });
      } }
    ]);
    _reabrirAoFechar(bg, voltar);
  };

  /* mata no servidor uma publicação que o app não conseguiu adotar (falha de
     gravação local, cotação concluída no meio do caminho). Entra na fila ANTES
     do POST: se este também falhar, o link do fornecedor ficaria vivo por 30
     dias sem ninguém do lado de cá para puxar */
  /* ⚠ DEVOLVE SE O ENCERRAMENTO FICOU AGENDADO — QUEM CHAMA PRECISA DISSO PARA
   * NÃO MENTIR. A causa real desta função em produção é o localStorage cheio
   * (js/store.js devolve false só nesse catch): no MESMO estado a fila
   * persistente também recusa. Antes, o rollback disparava um POST, descartava
   * a rejeição e o não-200 num `function () {}`, e a pessoa lia "a publicação
   * foi encerrada" — afirmação que ninguém tinha verificado. Consequência de
   * obra: o fornecedor abre o link vivo, manda proposta, ninguém puxa, e a vaga
   * segue ocupada em MAX_ATIVAS_POR_DONO. Agora a fila de memória segura a
   * segunda tentativa (enquanto o app estiver aberto), o resultado do POST vai
   * para o console do suporte, e o recado de quem chama fala no condicional. */
  function _desfazerPublicacao(pubId) {
    if (!pubId) return false;
    _filaEntrar(pubId, _chave());
    /* o dono é esta licença: a publicação acabou de nascer daqui */
    _filaAnotarDono(pubId, _emailLicenca());
    var agendado = _filaTem(pubId) || _memTem(pubId);
    /* quem chama já mostrou um toast de erro à pessoa; aqui o console é para o
       suporte entender por que o link ficou vivo (localStorage recusado) */
    if (!agendado) console.warn("[cotonline] não consegui agendar o encerramento de " + pubId + " neste navegador");
    try {
      _post("/api/cotacao/encerrar", { id: pubId }, true).then(function (y) {
        if (y.s === 200 || y.s === 404) { _filaSair(pubId); return; }
        console.warn("[cotonline] encerrar a publicação órfã " + pubId + " devolveu HTTP " + y.s + (agendado ? " — fica na fila" : " — e não há fila: os links podem seguir vivos"));
      }, function (e) {
        console.warn("[cotonline] encerrar a publicação órfã " + pubId + " falhou por rede" + (agendado ? " — fica na fila" : " — e não há fila: os links podem seguir vivos"), e && e.message);
      });
    } catch (e) {}
    return agendado;
  }

  /* ⚠ AS PROPOSTAS QUE A RODADA GRAVADA GUARDA E O MAPA NÃO TEM.
   * Sem nenhuma viagem de rede: `cot.online.convites[].respondidoEm` é o
   * espelho do que o SERVIDOR tinha (o motor grava no convite ao aplicar —
   * js/cotacoes.js: aplicarResposta; `_aplicarEstado` espelha também as que o
   * motor RECUSOU; e o `_readotar` copia as datas do /estado sem aplicar nada).
   * A COLUNA, essa, só ganha `respondidoEm` quando a proposta ENTRA. Então
   * "convite respondido cuja coluna não tem essa data" é exatamente a lista do
   * que ficou de fora — e é o que se perde de vista ao trocar `cot.online`.
   * ⚠ A RÉGUA DA DATA É A DO MOTOR ("já aplicada": nova <= antiga,
   * js/cotacoes.js:470), de propósito: qualquer outra faria esta tela discordar
   * de quem de fato aplica, e aí a pergunta apareceria (ou sumiria) na hora
   * errada. */
  function _propostasForaDoMapa(cot) {
    var fora = [];
    var convites = (cot && cot.online && cot.online.convites) || [];
    var forns = (cot && cot.fornecedores) || [];
    convites.forEach(function (cv) {
      if (!cv || !cv.cid) return;
      var em = Date.parse(cv.respondidoEm);
      if (!isFinite(em)) return;                        // ninguém respondeu por esse convite
      var col = null;
      forns.forEach(function (fr) { if (!col && fr && fr.cid === cv.cid) col = fr; });
      var na = col ? Date.parse(col.respondidoEm) : NaN;
      if (isFinite(na) && na >= em) return;             // entrou no Mapa (mesma régua do motor)
      fora.push({ cid: cv.cid, nome: cv.nome || "", semColuna: !col });
    });
    return fora;
  }
  /* ⚠ A PERGUNTA DO "PUBLICAR DE NOVO" NÃO PODE SER DISPARO ÚNICO — A PORTA QUE
   * ELA PROMETE ERA FECHADA PELO CLIQUE SEGUINTE, EM SILÊNCIO.
   * Roteiro medido: rodada vencida com proposta recusada → o confirm de baixo
   * oferece CANCELAR, e o texto do CANCELAR promete, por escrito, "a cotação
   * fica na rodada encerrada … use 'Puxar respostas da rodada encerrada' e
   * aceite recriar a coluna do fornecedor quando o app perguntar". Cancelando,
   * o app grava `online.encerradaEm` e o `wireForm` desenha essa porta COLADA ao
   * botão "Cotar online — enviar link aos fornecedores". Só que nesse mesmo
   * instante `_vencida(cot)` virou FALSO: a guarda logo abaixo devolvia
   * `Promise.resolve(true)` e a publicação seguinte pulava o confirm inteiro —
   * um clique trocava `cot.online` pela publicação nova, o id da rodada
   * encerrada não ficava gravado em lugar nenhum (o app não tem como pedi-la ao
   * `/estado`), e o único recado era o VERDE "Cotação publicada". A proposta
   * segue no servidor por 30 dias, fora do alcance do app — que para o
   * engenheiro é a mesma coisa que não existir.
   * ⚠ E SÓ PERGUNTA QUANDO HÁ O QUE PERDER. Rodada encerrada sem proposta de
   * fora, fora dos 30 dias, ou com `sumiuNoServidor` (nada atrás da porta, ver
   * `_resgatavel`) não rende pergunta nenhuma: confirmação que aparece por nada
   * é a que a pessoa aprende a responder sem ler — e aí a que importa some
   * junto. */
  function _confirmarTrocaDaEncerrada(cot) {
    if (!_resgatavel(cot)) return true;
    var fora = _propostasForaDoMapa(cot);
    if (!fora.length) return true;
    var semColuna = [];
    fora.forEach(function (f) { if (f.semColuna) semColuna.push({ cid: f.cid, motivo: MOTIVO_SEM_COLUNA }); });
    /* ⚠ MOTIVO SÓ ONDE ELE FOI VERIFICADO. Coluna que não existe é fato lido
       aqui (e é a recusa que o motor daria). Para quem TEM coluna, o registro
       não guarda por que a proposta não entrou — pode ter sido "proposta sem
       preços", "resposta inválida", ou o `_readotar`, que nem chegou a tentar.
       Passar essas ao `_saidaDaRecusa` as contaria como "outras" e a tela
       afirmaria "a proposta em si não pôde ser lida": explicação que ninguém
       conferiu, do mesmo tipo que este módulo já pagou caro. O que se sabe é o
       caminho, e é só isso que o texto promete. */
    var outras = fora.length - semColuna.length;
    /* ⚠ `true` = ESTA FRASE DESCREVE O QUE O *CANCELAR* ENTREGA (ver
       `_ondeFicamSeCancelar`): daqui, responder OK apaga a porta que ela cita */
    var saida = _saidaDaRecusa(semColuna, cot, true);
    if (outras) saida += saida
      ? (" Daqui não dá para saber por que " + (outras > 1 ? "as outras não entraram" : "a outra não entrou") + " no Mapa; o caminho é o mesmo botão.")
      : (_ondeFicamSeCancelar(cot) + "use \"Puxar respostas da rodada encerrada\". Daqui não dá para saber por que " +
        (outras > 1 ? "elas não entraram" : "ela não entrou") + " no Mapa — é por ali que dá para tentar de novo.");
    var quem = _nomesDosCids(fora, cot, (cot.online && cot.online.convites) || []);
    /* `_resgatavel` já exigiu data legível: aqui `_fmt` nunca é "—" */
    var quando = _fmt(cot.online.encerradaEm, true);
    /* ⚠ O TEXTO DAS DUAS ESCOLHAS É O MESMO DO CONFIRM DO `_encerrarVencidaAntes`,
     * PALAVRA POR PALAVRA — É O MESMO FATO (o OK fecha a porta dos 30 dias), e
     * duas redações do mesmo fato é como a pessoa aprende a não ler nenhuma das
     * duas. Quem mexer numa das duas mexe na outra.
     * ⚠ E A MONTAGEM É EM `msg +=`, NÃO NA CONCATENAÇÃO DE UMA CHAMADA SÓ, DE
     * PROPÓSITO: o controle negativo do bloco E1 (tools/test-cotacao-fiacao.js)
     * sabota aquele confirm por um `ui.replace` ANCORADO NO LAYOUT do fonte
     * (`"CANCELAR: … " + saida + "\n\n" +` seguido da linha do PUBLICAR). Com
     * este trecho escrito igual, o `replace` — que é sem /g — pegava ESTE, que
     * vem antes no arquivo: a sabotagem caía no lugar errado, o confirm de lá
     * ficava intacto e o assert do E1 reprovava sem que o produto tivesse
     * defeito nenhum. Layout diferente, texto idêntico. */
    var msg = fora.length + " proposta(s) de " + quem + " chegaram na rodada encerrada em " + quando + " e NÃO estão no Mapa.\n\n";
    msg += "CANCELAR: a cotação fica na rodada encerrada. " + saida + "\n\n";
    msg += "PUBLICAR: a rodada nova toma o lugar dela aqui, e essas " + fora.length + " proposta(s) ficam FORA DO ALCANCE do app — o servidor ainda as guarda por 30 dias, mas esta cotação passa a apontar só para a publicação nova e não sobra botão nenhum para pedi-las.\n\n";
    msg += "Publicar a rodada nova agora mesmo assim?";
    if (window.confirm(msg)) {
      /* ⚠ O ÚNICO ABANDONO DELIBERADO DO MÓDULO — E ERA O ÚNICO SEM RASTRO.
       * Daqui o `publicar` troca `cot.online` pela publicação nova: o id da
       * rodada encerrada não fica gravado em lugar nenhum, e as propostas que
       * ficaram lá saem do alcance do app (o servidor ainda as guarda; o app
       * não sabe mais pedi-las). Todos os outros caminhos que perdem proposta
       * gravam `_detalheAplicacao` no histórico — este gravava NADA: a única
       * prova de que houve proposta e de que alguém escolheu deixá-la para trás
       * era um confirm que ninguém guarda. Semanas depois, olhando o Mapa, nem
       * o engenheiro nem o suporte tinham como saber que a rodada anterior
       * tinha resposta de fornecedor.
       * ⚠ A ENTRADA VAI NO `historico` DO MESMO OBJETO que o `publicar` grava em
       * seguida, de propósito: se a publicação nova não nascer (POST recusado,
       * disco cheio), nada foi abandonado e nada precisa ser gravado. */
      _hist(cot, "online-abandonada", fora.length + " proposta(s) de " + quem +
        " ficaram na rodada encerrada em " + quando + " (publicação nova por cima)");
      return true;
    }
    _toast("Nada foi publicado. As " + fora.length + " proposta(s) de " + quem + " continuam na rodada encerrada em " + quando + ". " + saida, "aviso");
    return false;
  }

  /* encerra a publicação VENCIDA antes de publicar de novo, trazendo as
     respostas que ainda estavam lá. Promise<boolean>: false = não publique. */
  function _encerrarVencidaAntes(cot) {
    /* ⚠ ESTE CAMINHO APLICA PROPOSTA E GRAVA O MAPA — então ele também pergunta
       ao módulo Compras, e ANTES de qualquer POST: recusar aqui não deixa nada
       pela metade no servidor. Ver `_podeRegravarMapa`. */
    if (!_podeRegravarMapa(cot, "Nada foi publicado e o Mapa não foi gravado.")) return Promise.resolve(false);
    /* ⚠ NÃO É "return true" — VER `_confirmarTrocaDaEncerrada`. Cair aqui não
       quer dizer "não há nada em jogo": a rodada ENCERRADA (que é o estado em
       que o CANCELAR do confirm de baixo deixa a cotação) também mora em
       `cot.online`, e publicar a substitui. */
    if (!_vencida(cot) || !cot.online || !cot.online.id) return Promise.resolve(_confirmarTrocaDaEncerrada(cot));
    /* ⚠ mesma régua do puxar/encerrar: este caminho APLICA resposta de
       fornecedor e GRAVA. Sem a releitura do registro vivo, publicar de novo
       sobre uma cotação concluída em outro aparelho escrevia preço novo por
       cima do documento que originou os pedidos de compra. */
    if (!_sincronizarVivo(cot)) return Promise.resolve(false);
    /* mesma régua da guarda de cima, e pelo mesmo motivo: o registro vivo pode
       ter trazido, do outro aparelho, uma rodada ENCERRADA no lugar da vencida
       — e ela tem tanto a perder quanto a de cá */
    if (!_vencida(cot) || !cot.online || !cot.online.id) return Promise.resolve(_confirmarTrocaDaEncerrada(cot));
    var idAntigo = cot.online.id;
    return _post("/api/cotacao/encerrar", { id: idAntigo }).then(function (x) {
      /* a viagem de rede leva segundos: o registro pode ter virado outra coisa */
      if (!_sincronizarVivo(cot)) return false;
      if (!_mesmaPublicacao(cot, idAntigo)) return false;
      /* ⚠ E A PORTA DO DINHEIRO PERGUNTA DE NOVO AQUI — MESMA RÉGUA DOS TRÊS
       * IRMÃOS (`publicar`, `puxar` e `encerrar`), E ERA O ÚNICO CAMINHO DE
       * GRAVAÇÃO DO MÓDULO QUE SÓ PERGUNTAVA ANTES DO POST.
       * A pergunta lá de cima é a foto de segundos atrás: a viagem de rede leva
       * segundos e o outro aparelho pode ter emitido o pedido de compra nesse
       * intervalo, com o `status` daqui ainda em "rascunho" (que é o que o merge
       * da nuvem produz). Sem esta segunda pergunta, os DOIS ramos abaixo
       * chamavam `_salvar(cot)` por cima do documento que originou os pedidos —
       * e o ramo do 200 grava ainda a coluna do fornecedor aplicada, ou seja,
       * PREÇO NOVO no mapa que Compras já usou. É a regra 5 da skill `dinheiro`:
       * quem responde "o dinheiro já está lançado?" é o módulo Compras, pelo
       * carimbo `cotacaoId`, não o `status`.
       * ⚠ E O RECADO NÃO DIZ QUE "NADA ACONTECEU": aqui o POST /encerrar JÁ foi
       * feito e, no 200, os links da rodada vencida ACABARAM de morrer no
       * servidor. Mesma régua do irmão `encerrar`: diz o que aconteceu lá e o
       * que não foi gravado aqui. A trava continua com porta — as duas saídas
       * são as do `_msgPedidosGerados`. */
      if (!_podeRegravarMapa(cot, (x.s === 200 && x.j && x.j.online)
        ? "A rodada vencida FOI encerrada no servidor; aqui nada foi gravado e nada foi publicado."
        : "Nada foi publicado e o Mapa não foi gravado.")) return false;
      /* ⚠ 404 TAMBÉM É "A PUBLICAÇÃO NÃO É SUA" — MESMA RÉGUA DOS IRMÃOS.
       * O servidor responde a MESMA coisa para "não tenho essa publicação" e
       * para "ela é de outra licença", de propósito, para não virar oráculo de
       * ids alheios. `encerrar`, `_avisarOutraLicenca` e `_tratarPendente` já
       * dizem as duas possibilidades; este quarto ponto ficou para trás com o
       * texto antigo ("o servidor não tem mais essa publicação"). Com a rodada
       * vencida viva na licença de outra máquina, o app publicava por cima
       * calado: o fornecedor ficava com DOIS links de pé, o novo e o velho que
       * ninguém mais vai puxar, e não havia uma linha na tela nem no log.
       * ⚠ E O QUE SE ESCREVE NO OBJETO DA TELA TEM DE IR PARA O DISCO.
       * Este ramo carimbava `encerradaEm` e `sumiuNoServidor` no `cot` preso nos
       * closures do modal e seguia sem gravar nem desfazer. Quando o /publicar
       * seguinte falhava (500, sem rede) ou a pessoa cancelava, o registro
       * gravado continuava dizendo "publicação vencida, ainda alcançável" e a
       * tela dizia "rodada encerrada e sem porta" — duas verdades para a mesma
       * cotação, e quem viaja pela nuvem é a do disco. Grava-se aqui, como no
       * ramo do 200; se nem gravar dá, não se publica. */
      if (x.s === 404) {
        var donoAntigo = (cot.online && cot.online.dono) || "";
        var deOutraLic = !!donoAntigo && donoAntigo !== _emailLicenca();
        cot.online.encerradaEm = _agora();
        /* nada atrás da porta: o card não pode oferecer o resgate depois disto
           (ver o ⚠ de `_resgatavel`) */
        cot.online.sumiuNoServidor = true;
        _hist(cot, "online-encerrada", deOutraLic
          ? ("vencida · encerrada só aqui · o servidor recusou (404) e a publicação é da licença " + donoAntigo)
          : "vencida · publicação não existia mais no servidor");
        /* mesma régua do ramo do 200: encerrada sem publicação nova não pode
           ficar "enviada" (crachá âmbar "Aguardando fornecedores" para uma
           rodada que acabou). Se a nova nascer, o `publicar` regrava "enviada". */
        if (cot.status !== "concluida") cot.status = "rascunho";
        if (!_salvar(cot)) {
          var voltou404 = _reverterDoDisco(cot);
          _toast("Não consegui gravar aqui o encerramento da rodada vencida. Nada foi publicado." + (voltou404
            ? " (O Mapa voltou ao que está gravado; libere espaço no navegador antes de tentar.)"
            : " ⚠ E não consegui reler o que está gravado: feche e abra o Mapa antes de decidir qualquer coisa — o que está na tela pode não ser o que está salvo."), "erro");
          return false;
        }
        _render();
        /* ⚠ NÃO AFIRMA O QUE NINGUÉM CONFERIU: daqui não dá para saber se os
           links da rodada anterior seguem de pé. O que foi verificado é que o
           servidor recusou ESTE encerramento e que a publicação é de outra
           licença — é isso que o texto diz, com o que a pessoa tem a fazer. */
        if (deOutraLic) _toast("A rodada vencida não foi encerrada no servidor: ela pertence à licença " + donoAntigo + " (o servidor responde a mesma coisa para \"não existe\" e \"não é sua\", então daqui não dá para saber qual dos dois é). Encerrei só aqui. Se ela ainda estiver de pé lá, o fornecedor pode ficar com dois links válidos — encerre com aquela licença.", "aviso");
        return true;
      }
      if (x.s !== 200 || !x.j || !x.j.online) {
        _toast(_erroDe(x, "Não consegui encerrar a publicação vencida. Nada foi publicado."), "erro");
        return false;
      }
      var convitesSrv = (x.j.online && Array.isArray(x.j.online.convites)) ? x.j.online.convites : [];
      var res = _aplicarEstado(cot, x.j.online);
      /* a mesma porta dos outros dois caminhos (ver `_religarColunas`) */
      res = _religarEAplicarDeNovo(res, x.j.online, "A rodada vencida FOI encerrada no servidor; aqui nada foi gravado e nada foi publicado.");
      if (res.barrado) return false;
      var recusadas = _recusas(res.ignoradas);
      _absorver(cot, res.cot);
      if (!cot.online) cot.online = {};
      cot.online.encerradaEm = x.j.online.encerradaEm || _agora();
      if (res.aplicadas) cot.online.puxadoEm = _agora();
      /* ⚠ O HISTÓRICO REGISTRA AS RECUSADAS NOS DOIS CAMINHOS (seguir e
         desistir). Antes ele gravava "vencida · 0 resposta(s) puxada(s)" e a
         proposta que o motor recusou sumia sem deixar rastro: nem no Mapa, nem
         no log, nem na tela. */
      _hist(cot, "online-encerrada", "vencida · " + _detalheAplicacao(res.aplicadas, res.substituidos, res.perdas, recusadas));
      /* ⚠ ENCERRADA SEM PUBLICAÇÃO NOVA NÃO PODE FICAR "ENVIADA".
         Daqui para baixo há dois caminhos em que a publicação nova NÃO nasce
         (a pessoa cancela o confirm; o POST /publicar falha). Sem mexer no
         status, o registro ficava gravado como "enviada" com a publicação
         encerrada e sem link nenhum — na lista de cotações isso vira o crachá
         âmbar "Aguardando fornecedores" (js/gestao.js: P.cotStatus) para uma
         rodada que acabou, o engenheiro decide pelo estado errado e o registro
         sai assim pela nuvem. Quando a nova nasce, o `publicar` grava
         "enviada" de novo logo em seguida. Mesma régua do `encerrar`: só
         "concluida" é intocável (pedidos já emitidos). */
      if (cot.status !== "concluida") cot.status = "rascunho";
      /* grava JÁ: se a publicação nova falhar, as respostas resgatadas não
         podem ir embora junto */
      if (!_salvar(cot)) {
        /* ⚠ E A TELA QUE VOLTA TEM DE SER O QUE ESTÁ GRAVADO.
           Este `cot` está preso nos closures do modal e é ELE que o "Voltar"/✕
           reabre. Ele já recebeu `encerradaEm`, `status = "rascunho"` e a coluna
           aplicada — nada disso foi para o disco. O Mapa voltava mostrando
           preço que não está gravado e, pior, caía no ramo do resgate: o botão
           desenhado era "Puxar respostas da rodada encerrada", justamente o que
           o recado abaixo NÃO manda clicar. Desfazendo do disco, a tela volta a
           ser a da publicação vencida — onde o botão se chama "Puxar respostas",
           que é o que o recado diz. */
        var voltou = _reverterDoDisco(cot);
        /* ⚠ "Nada foi publicado" sozinho era meia verdade: os links da rodada
           vencida ACABARAM de morrer no servidor, e a pessoa lia "nada mudou".
           O recado diz o fato e o que fazer com ele. */
        _toast("A publicação vencida foi encerrada no servidor, mas não consegui gravar as respostas aqui. Nada foi publicado — clique em Puxar respostas para trazer o que chegou." + (voltou
          ? " (O Mapa voltou ao que está gravado; libere espaço no navegador antes de tentar.)"
          : " ⚠ E não consegui reler o que está gravado: feche e abra o Mapa antes de decidir qualquer coisa — o que está na tela pode não ser o que está salvo."), "erro");
        return false;
      }
      _render();
      /* ⚠ O PREÇO APAGADO TEM DE CHEGAR À TELA TAMBÉM POR AQUI.
         Este caminho aplica resposta igual ao puxar, e o número só ia parar no
         histórico — que ninguém abre ao publicar. A coluna do fornecedor
         deixava de estar completa, ele caía fora do `vencedorUnico`, e o único
         recado da tela era o verde "Cotação publicada". */
      if (res.substituidos > 0) _toast("Rodada vencida encerrada e respostas trazidas. " + _fraseSubstituidos(res.substituidos, res.perdas), "aviso");
      /* ⚠ E QUANDO A RESPOSTA SÓ TROCA UM PREÇO, A TELA TAMBÉM TEM DE FALAR.
         O motor não conta como "substituído" o preço trocado por outro (só o
         PERDIDO), então uma proposta que entra e muda o valor que o engenheiro
         anotou por telefone deixava `substituidos = 0` — e o único recado da
         tela era o VERDE "Cotação publicada". Dinheiro mudou no Mapa em
         silêncio, enquanto os outros dois caminhos dizem "N resposta(s)
         puxada(s)" com os mesmos dados. */
      else if (res.aplicadas) _toast("Rodada vencida encerrada — " + res.aplicadas + " resposta(s) puxada(s) para o Mapa; confira as colunas antes de decidir a compra.", "aviso");
      /* ⚠ A PERGUNTA NÃO PODE OFERECER O QUE NÃO EXISTE.
         Quando ela aparece, o POST /encerrar JÁ foi feito e o registro já tem
         `encerradaEm`: responder "não" não salva proposta nenhuma. O texto
         antigo ("serão perdidas ao publicar de novo. Continuar?") fazia a
         pessoa acreditar que cancelar resgatava a proposta — e o toast do
         cancelamento nem dizia o que tinha acontecido com ela.
         O que a escolha decide DE VERDADE é só isto: nasce agora uma rodada
         nova (com convites novos, que o fornecedor recusado não recebe) ou a
         cotação fica na rodada encerrada, onde as propostas ainda podem ser
         resgatadas por 30 dias pelo botão "Puxar respostas da rodada
         encerrada" (ver `_resgatavel`). É isso que a pergunta diz agora. */
      if (recusadas.length) {
        var quem = _nomesDosCids(recusadas, cot, x.j.online.convites);
        /* ⚠ E A SAÍDA QUE ELA OFERECE É A QUE EXISTE PARA AQUELE MOTIVO.
           O texto mandava "corrigir a grade (o fornecedor precisa estar nela)"
           para TODOS os motivos — inclusive "proposta sem preços" e "resposta
           inválida", em que a grade não tem nada a ver — e, para o motivo que
           ele nomeava, a porta estava fechada: recriar a coluna à mão gera um
           `cid` novo e o motor recusa de novo. `_saidaDaRecusa` diz, por
           motivo, o que de fato resolve (e quando nada resolve, diz isso). */
        /* ⚠ `true`: aqui também é o CANCELAR que entrega o que a frase promete
           — o OK troca `cot.online` pela publicação nova (ver
           `_ondeFicamSeCancelar`) */
        var saida = _saidaDaRecusa(recusadas, cot, true);
        /* ⚠ A SAÍDA QUE O TEXTO DESCREVE É A DO *CANCELAR* — E ISSO PRECISA
         * ESTAR ESCRITO NA PERGUNTA, NÃO SÓ AQUI.
         * A pergunta imprimia o `_saidaDaRecusa` ("Elas ficam no servidor por 30
         * dias: use 'Puxar respostas da rodada encerrada' e aceite recriar a
         * coluna…") e logo abaixo perguntava "Publicar a rodada nova agora mesmo
         * assim?". Respondendo SIM — que é o que a pessoa abriu o app para fazer
         * — o `publicar` troca `cot.online` pela publicação NOVA: `encerradaEm`
         * volta a ser null, `_resgatavel` fica falso, o botão "Puxar respostas da
         * rodada encerrada" some, e o id da rodada encerrada não fica gravado em
         * lugar nenhum (o app não tem como pedi-la ao `/estado`). A porta que a
         * própria pergunta acabava de prometer era fechada pelo OK dela. O
         * servidor ainda guarda a proposta por 30 dias — só que fora do alcance
         * do app, o que para o engenheiro é a mesma coisa que não existir.
         * ⚠ A ORDEM É O CONSERTO, O TEXTO É A METADE QUE FALTAVA: a religação da
         * coluna (`_religarEAplicarDeNovo`, logo acima) é oferecida ANTES desta
         * pergunta, sem viagem de rede nova — quem chega aqui é quem recusou a
         * religação, quem está com a grade cheia (4 colunas) ou quem levou uma
         * recusa que coluna nenhuma resolve. Mover a religação para depois deste
         * confirm faria a promessa voltar a ser impossível. */
        if (!window.confirm(recusadas.length + " proposta(s) de " + quem + " não couberam na grade e NÃO entraram no Mapa (" + _motivos(recusadas) + ").\n\n" +
          "A rodada vencida já foi encerrada no servidor — cancelar aqui não a traz de volta.\n\n" +
          "CANCELAR: a cotação fica na rodada encerrada. " + saida + "\n\n" +
          "PUBLICAR: a rodada nova toma o lugar dela aqui, e essas " + recusadas.length + " proposta(s) ficam FORA DO ALCANCE do app — o servidor ainda as guarda por 30 dias, mas esta cotação passa a apontar só para a publicação nova e não sobra botão nenhum para pedi-las.\n\n" +
          "Publicar a rodada nova agora mesmo assim?")) {
          _toast("Nada foi publicado. A rodada vencida já estava encerrada no servidor e o que pôde ser aplicado está no Mapa. As " + recusadas.length + " proposta(s) de " + quem + " não entraram: " + _motivos(recusadas) + ". " + saida, "aviso");
          return false;
        }
        /* ⚠ O SEGUNDO ABANDONO DELIBERADO DO MÓDULO — E ELE NÃO TINHA RASTRO
         * PRÓPRIO. Respondendo PUBLICAR, o `publicar` troca `cot.online` pela
         * publicação nova: estas propostas saem do alcance do app (o servidor
         * ainda as guarda por 30 dias, mas o app não sabe mais pedi-las). O
         * histórico gravado logo acima — "vencida · N resposta(s) puxada(s) ·
         * N proposta(s) não coube(ram) na grade" — é IDÊNTICO ao que fica
         * quando a pessoa CANCELA, e cancelar mantém tudo alcançável pelo botão
         * "Puxar respostas da rodada encerrada". Duas decisões opostas com o
         * mesmo log é o mesmo que log nenhum: semanas depois, nem o engenheiro
         * nem o suporte teriam como saber que alguém escolheu deixar proposta de
         * fornecedor para trás. É o mesmo rastro, e pelo mesmo motivo, que o
         * `_confirmarTrocaDaEncerrada` grava no caminho irmão.
         * ⚠ A ENTRADA VAI NO `historico` DO MESMO OBJETO que o `publicar` grava
         * em seguida, de propósito: se a publicação nova não nascer (POST
         * recusado, disco cheio), nada foi abandonado e nada precisa ser
         * gravado. */
        _hist(cot, "online-abandonada", recusadas.length + " proposta(s) de " + quem +
          " ficaram na rodada vencida, encerrada agora (publicação nova por cima): " + _motivos(recusadas));
      }
      return true;
    });
  }

  /* ⚠ A VOLTA PARA UMA PUBLICAÇÃO QUE O APP PERDEU (409 do publicar).
   * Reconstrói `cot.online` a partir do `/estado` do servidor — sem token, o
   * mesmo formato do publicar. É o único caminho de volta quando o vínculo
   * local se perde; sem ele a cotação fica sem Puxar, sem Encerrar e sem
   * publicar de novo até a publicação vencer sozinha. */
  CotOnlineUI._readotar = function (cot, pubId, G) {
    _post("/api/cotacao/estado", { id: pubId }).then(function (y) {
      if (y.s !== 200 || !y.j || !y.j.online) {
        _toast("Já existe uma publicação desta cotação no servidor e não consegui reconectar. Tente de novo com internet.", "erro");
        return;
      }
      /* ⚠ readotar também GRAVA o registro inteiro (o `cot` veio do formulário):
         com pedido de compra já emitido, isso é regravar o documento que o
         originou. A publicação continua no servidor exatamente como estava —
         nada fica pela metade por recusar aqui.
         ⚠ VEM ANTES do `_sincronizarVivo` de propósito, e não é ordem à toa: a
         pergunta ao módulo Compras é a que a regra 5 da skill `dinheiro` chama
         de certa (o `status` é campo editável que o merge desfaz), e as duas
         linhas seguintes são ÂNCORA de controle negativo da suíte
         (tools/test-cotacao-fiacao.js, bloco A1) — pôr qualquer coisa entre
         elas desliga a sabotagem sem que nenhum assert reprove. */
      if (!_podeRegravarMapa(cot, "Nada foi gravado aqui; a publicação continua no servidor.")) return;
      if (!_sincronizarVivo(cot)) return;
      var on = y.j.online, convites = Array.isArray(on.convites) ? on.convites : [];
      cot.online = {
        id: on.id || pubId, publicadoEm: on.publicadoEm || _agora(), expiraEm: on.expiraEm,
        validadeDias: on.validadeDias || 7, encerradaEm: on.encerradaEm || null, puxadoEm: null,
        dono: on.dono || _emailLicenca(),
        convites: convites.map(function (cv) {
          return { cid: cv.cid, nome: cv.nome, respondidoEm: cv.respondidoEm || (cv.resposta && cv.resposta.respondidoEm) || null };
        })
      };
      /* ⚠ O QUARTO PONTO QUE GRAVA `encerradaEm` — E ELE TAMBÉM SEGUE A REGRA.
         A régua "publicação encerrada não pode ficar com status enviada" valia
         no `_encerrarVencidaAntes`, no `puxar` e no `encerrar`; aqui o
         `encerradaEm` vinha do servidor e logo abaixo se gravava "enviada"
         incondicionalmente — exatamente o estado proibido: crachá âmbar
         "Aguardando fornecedores" (js/gestao.js: P.cotStatus) para uma rodada
         que acabou, indo para a nuvem sob um toast VERDE. A janela é estreita e
         é a própria situação que o `_readotar` existe para tratar: o 409 só
         nasce quando há OUTRO aparelho mexendo, e é ele que pode encerrar entre
         o 409 do /publicar e o /estado seguinte. */
      var jaEncerrada = !!cot.online.encerradaEm;
      if (jaEncerrada) { if (cot.status !== "concluida") cot.status = "rascunho"; }
      else cot.status = "enviada";
      _hist(cot, "online-readotada", jaEncerrada
        ? ("publicação encontrada no servidor — já encerrada em " + _fmt(cot.online.encerradaEm, true))
        : "publicação encontrada no servidor");
      if (!_salvar(cot)) { _toast("Encontrei a publicação no servidor, mas não consegui gravar aqui.", "erro"); return; }
      UI.fecharModal();
      if (typeof App !== "undefined" && App.render) { try { App.render(); } catch (eA) {} }
      /* ⚠ NÃO SE ABRE O MODAL DE LINKS DE UMA PUBLICAÇÃO ENCERRADA: os links
         respondem 410 e mandar o engenheiro reenviá-los seria a promessa vazia
         de sempre. O que resta é o Mapa — que, com `encerradaEm` gravado,
         oferece "Puxar respostas da rodada encerrada" (ver `_resgatavel`). */
      if (jaEncerrada) {
        if (G && G.formCotacao) G.formCotacao(cot);
        _toast("Encontrei a publicação desta cotação no servidor, mas ela já foi encerrada (em " + _fmt(cot.online.encerradaEm, true) + ") — os links não valem mais. As respostas que chegaram ainda podem ser puxadas por 30 dias.", "aviso");
        return;
      }
      CotOnlineUI._modalLinks(cot, convites, function () { if (G && G.formCotacao) G.formCotacao(cot); });
      _toast("Esta cotação já estava publicada — reconectei à publicação do servidor.", "ok");
    }, function () {
      _toast("Já existe uma publicação desta cotação no servidor e não consegui reconectar. Tente de novo com internet.", "erro");
    });
  };

  /* ------------------------------------------------------------------
   * modal com os links (QR / copiar / WhatsApp), um por fornecedor
   * ------------------------------------------------------------------ */
  CotOnlineUI._modalLinks = function (cot, convites, aoFechar) {
    var base = _base(), empresa = _empresaNome();
    var ate = _fmtDia(cot.online && cot.online.expiraEm);
    var assunto = cot.descricao || cot.numero || "";
    var links = [];
    var html = '<p class="muted" style="font-size:12.5px;margin:0 0 10px">' + _ico("cadeado") + ' Cada link é de um fornecedor: ele vê só os itens e a própria proposta. Válido até <b>' + ate + "</b>.</p>";
    (convites || []).forEach(function (cv, i) {
      if (!cv || !cv.token) return;
      var link = base + "/cotar?t=" + encodeURIComponent(cv.token);
      links.push(link);
      var cad = _fornecedorCadastro(cot, cv.cid);
      var fone = cad ? _foneIntl(cad.whatsapp || cad.telefone) : "";
      var msg = "Olá " + (cv.nome || "") + "! A " + (empresa || "empresa") + " pede sua cotação para " + assunto + ". Preencha seus preços neste link (válido até " + ate + "): " + link;
      var wa = fone ? ("https://wa.me/" + fone + "?text=" + encodeURIComponent(msg)) : "";
      var qr = (typeof QR !== "undefined" && QR.svg) ? QR.svg(link, { tamanhoPx: 140 }) : "";
      html += '<div class="card" style="padding:10px 12px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">' +
        (qr ? '<div style="background:#fff;border:1px solid var(--linha,#e2e8f0);border-radius:8px;padding:6px">' + qr + "</div>" : "") +
        '<div style="flex:1;min-width:200px"><div style="font-weight:800;font-size:13px;margin-bottom:4px">' + _esc(cv.nome || ("Fornecedor " + (i + 1))) + (cv.respondidoEm ? ' <span class="muted" style="font-weight:400;font-size:11.5px">· respondeu ' + _fmt(cv.respondidoEm) + "</span>" : "") + "</div>" +
        '<div style="border:1.5px dashed var(--linha,#e2e8f0);border-radius:8px;background:#f8fafc;padding:6px 8px;font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all">' + _esc(link) + "</div>" +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
        '<button type="button" class="btn sm" data-cto-copiar="' + i + '">' + _ico("copiar") + " Copiar</button>" +
        (wa ? '<a class="btn sm primary" href="' + wa + '" target="_blank" rel="noopener">' + _ico("celular") + " WhatsApp</a>" : '<span class="muted" style="font-size:11.5px;align-self:center">avulso: sem WhatsApp no cadastro</span>') +
        "</div></div></div>";
    });
    if (!links.length) html += '<p class="muted">Nenhum link disponível.</p>';
    var bg = UI.modal(_ico("link") + " Links da cotação " + _esc(cot.numero || ""), html, [
      { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); if (aoFechar) aoFechar(); } }
    ]);
    if (typeof UI.modalConsulta === "function") UI.modalConsulta(); // nada a perder ao fechar
    _reabrirAoFechar(bg, aoFechar);
    var raiz = bg || document;
    Array.prototype.forEach.call(raiz.querySelectorAll("[data-cto-copiar]"), function (b) {
      b.onclick = function () {
        var link = links[+b.getAttribute("data-cto-copiar")] || "";
        try { navigator.clipboard.writeText(link).then(function () { _toast("Link copiado.", "ok"); }, function () { _toast("Copie manualmente do quadro.", "erro"); }); }
        catch (e) { _toast("Copie manualmente do quadro.", "erro"); }
      };
    });
  };

  CotOnlineUI.links = function (c) {
    /* ⚠ desde que o A7 pôs uma GRAVAÇÃO aqui, "Links" deixou de ser leitura:
       precisa das mesmas guardas das outras ações (permissão em função e
       registro vivo), senão é a única porta do módulo que grava sem elas */
    if (!_pode()) return;
    var G = _G(), M = _motor();
    if (!c || !c.online || !c.online.id) { _toast("Esta cotação não está publicada.", "erro"); return; }
    var cot = (G && G._cotDoForm) ? G._cotDoForm(c) : c;
    /* ⚠ mesmo motivo do publicar: o modal de links FECHA o Mapa. Sem gravar
       aqui, quem clicava em "Links" para reenviar um link ao fornecedor perdia
       os preços que tinha acabado de anotar. */
    var erros = (M && M.validar) ? M.validar(cot) : [];
    /* ⚠ NÃO SE MANDA CORRIGIR UM CAMPO CINZA — TRAVA SEM PORTA.
       Com publicação ativa (ou vencida) os itens ficam travados na grade
       (gestao.js: `ehTravada` põe `disabled` em todo [data-cti]). Pôr o
       `Cotacoes.validar` como porteiro do "Links" barrava por "Item 1 com
       quantidade inválida" — um campo que a pessoa NÃO PODE editar — e o
       Salvar do Mapa recusa pelo mesmo erro. A única saída que restava era
       "Encerrar", que mata justamente os links que ela abriu o modal para
       reenviar. Então erro em campo travado deixa de barrar: os links abrem, o
       Mapa só não é gravado (ele volta inteiro pelo `aoFechar`, com o que foi
       digitado nos campos livres — preço, frete, prazo, condição), e o recado
       diz onde se corrige de verdade. Erro em campo LIVRE continua barrando:
       ali a pessoa tem o que fazer sem encerrar nada. */
    var travados = _ativa(cot) || _vencida(cot);
    var errosTravados = [], errosLivres = [];
    erros.forEach(function (e) {
      if (travados && (/^Item \d+ /.test(e) || /^Inclua ao menos 1 item/.test(e))) errosTravados.push(e);
      else errosLivres.push(e);
    });
    if (errosLivres.length) { _toast("Salve o Mapa antes de ver os links: " + errosLivres[0], "erro"); return; }
    if (!_sincronizarVivo(cot)) return;
    var pubId = (cot.online && cot.online.id) || c.online.id;
    /* ⚠ AQUI A TRAVA É SÓ DA GRAVAÇÃO — OS LINKS ABREM DO MESMO JEITO.
     * "Links" é o botão de REENVIAR o link ao fornecedor: barrá-lo porque a
     * cotação já virou pedido seria trava sem porta (regra 6) num caminho que
     * não move dinheiro nenhum — ele só lê o servidor e mostra QR/WhatsApp. O
     * que não pode acontecer é o efeito colateral: o `_salvar` logo abaixo
     * regravava itens, preços, status e histórico por cima do documento que
     * originou o pedido, sem uma linha na tela. Então o Mapa não é gravado, e o
     * recado diz que não foi e por quê (o que a pessoa digitou volta inteiro
     * pelo `aoFechar`, como no ramo dos campos travados). */
    var pedsL = _pedidosDaCotacao(cot.id);
    if (pedsL === null) _avisarSemConferirCompras();
    else if (pedsL.length) {
      _toast("Abrindo os links sem gravar o Mapa: esta cotação já gerou " + pedsL.length + " pedido(s) de compra (" +
        _numerosDePedidos(pedsL) + "), e regravar o mapa por cima do documento que originou esses pedidos faria o que está em Compras divergir dele. Os links abrem normalmente; o que você digitou agora não foi gravado.", "aviso");
      CotOnlineUI._abrirLinks(cot, pubId, G);
      return;
    }
    if (errosTravados.length) {
      _toast("Abrindo os links sem gravar o Mapa: " + errosTravados[0] + " Esse campo está travado pela publicação — encerre a publicação para corrigir este item.", "aviso");
      CotOnlineUI._abrirLinks(cot, pubId, G);
      return;
    }
    if (!_salvar(cot)) { _toast("Não consegui salvar o Mapa. Os links não foram abertos.", "erro"); return; }
    _render();
    CotOnlineUI._abrirLinks(cot, pubId, G);
  };

  /* busca os links no servidor e abre o modal. Separado do `links` porque há
     DOIS caminhos até aqui — com gravação (o normal) e sem gravação (erro em
     item travado pela publicação, ver acima) — e o que muda entre eles é só o
     que acontece ANTES. */
  CotOnlineUI._abrirLinks = function (cot, pubId, G) {
    _post("/api/cotacao/estado", { id: pubId }).then(function (x) {
      if (x.s !== 200 || !x.j || !x.j.online) { _toast(_erroDe(x, "Não consegui buscar os links."), "erro"); return; }
      CotOnlineUI._modalLinks(cot, x.j.online.convites || [], function () { if (G && G.formCotacao) G.formCotacao(cot); });
    }, function () {});
  };

  /* ------------------------------------------------------------------
   * puxar respostas
   * ------------------------------------------------------------------ */
  CotOnlineUI.puxar = function (c) {
    if (!_pode()) return;
    var G = _G(), M = _motor();
    if (!G || !G._cotDoForm || !M) { _toast("Motor de cotações não carregado.", "erro"); return; }
    if (!c || !c.online || !c.online.id) { _toast("Esta cotação não está publicada.", "erro"); return; }
    var atual = G._cotDoForm(c);
    /* ⚠ concluída = pedidos já emitidos; nada entra mais, nem por engano.
       A régua é o registro VIVO, não o `c` do closure (ver _vivo). */
    if (!_sincronizarVivo(atual)) return;
    /* ⚠ e a régua do dinheiro é o módulo Compras, não o `status` (regra 5 da
       skill `dinheiro`): puxar grava o Mapa inteiro — preço, frete, prazo,
       condição — por cima do documento que originou o pedido de compra. Ver
       `_podeRegravarMapa`. */
    if (!_podeRegravarMapa(atual, "Nenhuma resposta foi puxada e nada foi gravado.")) return;
    /* ⚠ e o ID DA PUBLICAÇÃO também sai do registro vivo (ver _mesmaPublicacao) */
    var pubId = (atual.online && atual.online.id) || null;
    if (!pubId) { _toast("Esta cotação não está publicada.", "erro"); return; }
    _post("/api/cotacao/estado", { id: pubId }).then(function (x) {
      /* ⚠ O QUE SUMIU NO SERVIDOR NÃO PODE CONTINUAR SENDO OFERECIDO.
       * Roteiro medido: rodada encerrada dentro dos 30 dias → o card desenha
       * "Puxar respostas da rodada encerrada" (`_resgatavel`) e três recados
       * mandam clicar nele → o servidor responde 404 (publicação podada, base
       * restaurada, ou "não é sua": ele responde igual de propósito, para não
       * virar oráculo de ids alheios) → o toast de erro sumia em 2,6 s e o MESMO
       * botão continuava lá, devolvendo o MESMO 404 a cada clique. A pessoa
       * clicava de novo achando que era a internet dela. O `encerrar` já carimba
       * `sumiuNoServidor` no 404 exatamente por isso; a porta do resgate é a
       * outra ponta do mesmo estado e tinha ficado de fora.
       * ⚠ SÓ NO RESGATE (rodada já encerrada aqui). Com a publicação ATIVA, um
       * 404 pode ser transitório — e apagar a porta de uma publicação que ainda
       * recebe proposta seria trocar um defeito por outro pior: ali o botão
       * fica, e quem desmente a promessa dos 30 dias na tela é o
       * `_consultarEstado`. */
      if (x.s === 404) {
        if (!_sincronizarVivo(atual)) return;
        if (!_mesmaPublicacao(atual, pubId)) return;
        /* mesma porta da entrada: este ramo também chama `_salvar(atual)`, e o
           que ele grava é o registro inteiro vindo do formulário */
        if (!_podeRegravarMapa(atual, "Nada foi gravado aqui.")) return;
        if (atual.online && atual.online.encerradaEm && !atual.online.sumiuNoServidor) {
          atual.online.sumiuNoServidor = true;
          _hist(atual, "online-encerrada", "resgate recusado: publicação não existia mais no servidor (ou é de outra licença)");
          /* ⚠ SEM GRAVAÇÃO, A PORTA CONTINUA NA TELA — E O RECADO DIZ ISSO.
             O carimbo que apaga o botão é o que acabou de NÃO ir para o disco:
             afirmar "tirei o botão" aqui seria descrever uma tela que o próximo
             `wireForm` desmente. */
          if (!_salvar(atual)) {
            _toast("O servidor não tem mais as respostas desta rodada encerrada — ou ela pertence a outra licença (ele responde a mesma coisa nos dois casos). Não consegui gravar isso aqui: o botão de puxar continua na tela e vai devolver o mesmo erro. Libere espaço no navegador e tente de novo.", "erro");
            return;
          }
          UI.fecharModal();
          _render();
          G.formCotacao(atual);
          _toast("O servidor não tem mais as respostas desta rodada encerrada — ou ela pertence a outra licença (ele responde a mesma coisa nos dois casos). Tirei o botão de puxar: por ele não vem mais nada. Para receber proposta de novo é preciso publicar uma rodada nova.", "aviso");
          return;
        }
      }
      if (x.s !== 200 || !x.j || !x.j.online) { _toast(_erroDe(x, "Não consegui consultar as respostas."), "erro"); return; }
      /* a viagem de rede leva segundos: outro aparelho pode ter concluído
         nesse meio-tempo, e aí gravar aqui ressuscitaria a cotação */
      if (!_sincronizarVivo(atual)) return;
      if (!_mesmaPublicacao(atual, pubId)) return;
      /* ⚠ e a porta do dinheiro pergunta de novo depois da viagem, pelo mesmo
         motivo da releitura acima: o pedido de compra pode ter sido emitido no
         outro aparelho nesses segundos, com o `status` daqui ainda "rascunho" */
      if (!_podeRegravarMapa(atual, "Nenhuma resposta foi puxada e nada foi gravado.")) return;
      var convitesSrv = (x.j.online && Array.isArray(x.j.online.convites)) ? x.j.online.convites : [];
      var res = _aplicarEstado(atual, x.j.online);
      /* ⚠ A PORTA É OFERECIDA AQUI, ONDE O CONSERTO AINDA É BARATO: a
         publicação continua ativa, e a resposta já está na mão (nenhuma outra
         viagem de rede). Ver `_religarColunas`. */
      res = _religarEAplicarDeNovo(res, x.j.online, "Nenhuma resposta foi puxada e nada foi gravado.");
      if (res.barrado) return;
      var cot = res.cot;
      var recusadas = _recusas(res.ignoradas);
      /* ⚠ O ENCERRAMENTO FEITO EM OUTRO APARELHO TAMBÉM CHEGA POR AQUI.
         Ignorá-lo gravava um registro "ativo" mais novo que o encerrado, e o
         merge da nuvem desfazia o encerramento nos DOIS aparelhos: links
         voltavam a valer e os itens continuavam travados. */
      var encerrouLa = !!x.j.online.encerradaEm;
      /* ⚠ "EM OUTRO APARELHO" SÓ QUANDO FOI EM OUTRO APARELHO.
         Este mesmo `puxar` agora é a porta de resgate da rodada que ESTA
         máquina encerrou (botão "Puxar respostas da rodada encerrada"): ali o
         encerramento já estava gravado aqui, e repetir "encerrada em outro
         aparelho" — mais uma entrada de histórico dizendo isso a cada resgate —
         seria o app contando um fato que não aconteceu. */
      var jaEstavaEncerrada = !!(atual.online && atual.online.encerradaEm);
      if (!res.aplicadas && !encerrouLa) {
        /* ⚠ NUNCA VERDE QUANDO O SERVIDOR TEM PROPOSTA E ELA NÃO ENTROU.
           "Nenhuma resposta nova." (estilo ok) com o card do lado dizendo
           "1/1 responderam" fazia a pessoa concluir que o fornecedor não tinha
           respondido — e fechar a compra sem a proposta dele. Aqui o motor
           RECUSOU: o recado diz quantas e por quê. */
        if (recusadas.length) { _toast(_fraseRecusaComPorta(recusadas, cot, convitesSrv) + " Nada foi gravado.", "aviso"); return; }
        _toast("Nenhuma resposta nova.", "ok"); return;
      }
      if (res.aplicadas && cot.online) cot.online.puxadoEm = _agora();
      /* ⚠ O RASTRO DA RECUSA TAMBÉM É RASTRO. Com `if (res.aplicadas)` sozinho,
         o resgate que voltou a recusar (a grade continua sem o fornecedor)
         gravava o registro e NÃO deixava entrada nenhuma no log: a única prova
         de que a pessoa clicou e a proposta continuou fora era um toast que
         some em 2,6 s. O `encerrar` e o `_encerrarVencidaAntes` sempre gravaram
         o `_detalheAplicacao`, inclusive com 0 aplicadas — os três caminhos
         contam a mesma história (ver o ⚠ de `_detalheAplicacao`). */
      if (res.aplicadas || recusadas.length) {
        _hist(cot, "online-puxada", _detalheAplicacao(res.aplicadas, res.substituidos, res.perdas, recusadas));
      }
      if (encerrouLa) {
        if (!cot.online) cot.online = {};
        cot.online.encerradaEm = x.j.online.encerradaEm;
        if (cot.status !== "concluida") cot.status = "rascunho";
        if (!jaEstavaEncerrada) _hist(cot, "online-encerrada", "encerrada no servidor (outro aparelho)");
      }
      if (!_salvar(cot)) { _toast("Não consegui gravar as respostas.", "erro"); return; }
      UI.fecharModal();
      _render();
      G.formCotacao(cot);
      /* o que o puxar APAGOU e o que ele RECUSOU viajam no mesmo recado: são a
         mesma pergunta ("posso decidir a compra com o que estou vendo?") */
      /* ⚠ A MESMA RÉGUA DOS IRMÃOS: o `encerrar` nomeava o fornecedor e dizia o
         que fazer (`_fraseRecusaComPorta`) e o `puxar` — o caminho MAIS COMUM,
         e o único em que o conserto ainda é barato — dizia só um número. Numa
         grade de 8 colunas, "1 proposta(s) não puderam ser aplicadas" não diz
         quem corrigir. Mesmo fato, mesma frase, nos três caminhos. */
      var aviso = "";
      if (res.substituidos > 0) aviso += " " + _fraseSubstituidos(res.substituidos, res.perdas);
      if (recusadas.length) aviso += " " + _fraseRecusaComPorta(recusadas, cot, convitesSrv);
      if (encerrouLa && jaEstavaEncerrada) _toast("Respostas da rodada encerrada puxadas." + (aviso || " Nada mais mudou aqui."), aviso ? "aviso" : "ok");
      else if (encerrouLa) _toast("Esta publicação já foi encerrada (em outro aparelho). Respostas puxadas e itens liberados." + aviso, "aviso");
      else if (res.substituidos > 0) _toast(res.aplicadas + " resposta(s) puxada(s) — " + _fraseSubstituidos(res.substituidos, res.perdas) + (recusadas.length ? " " + _fraseRecusaComPorta(recusadas, cot, convitesSrv) : ""), "aviso");
      else if (recusadas.length) _toast(res.aplicadas + " resposta(s) puxada(s). " + _fraseRecusaComPorta(recusadas, cot, convitesSrv), "aviso");
      else _toast(res.aplicadas + " resposta(s) puxada(s).", "ok");
    }, function () {});
  };

  /* ------------------------------------------------------------------
   * encerrar (com confirmação) — puxa o que já veio, destrava os itens
   * ------------------------------------------------------------------ */
  CotOnlineUI.encerrar = function (c) {
    if (!_pode()) return;
    var G = _G(), M = _motor();
    if (!G || !G._cotDoForm || !M) { _toast("Motor de cotações não carregado.", "erro"); return; }
    if (!c || !c.online || !c.online.id) { _toast("Esta cotação não está publicada.", "erro"); return; }
    if (!window.confirm("Encerrar a cotação online? Os links param de funcionar. As respostas já enviadas são puxadas agora.")) return;
    var atual = G._cotDoForm(c);
    if (!_sincronizarVivo(atual)) return;
    /* ⚠ ANTES DO POST, DE PROPÓSITO. Encerrar aplica proposta e grava o Mapa
       inteiro; recusando aqui, o servidor não fica com uma rodada encerrada
       sem o carimbo local (nada pela metade). E a trava tem porta: a saída que
       o recado aponta — "Concluir e gerar pedidos" no Mapa — encerra os links
       de verdade, por `_cotTerminarConclusao` → `encerrarSilencioso`
       (js/gestao.js). Ver `_podeRegravarMapa`. */
    if (!_podeRegravarMapa(atual, "Nada foi encerrado e nada foi gravado.")) return;
    var pubId = (atual.online && atual.online.id) || null;
    if (!pubId) { _toast("Esta cotação não está publicada.", "erro"); return; }
    var donoPub = (atual.online && atual.online.dono) || (c.online && c.online.dono) || "";
    var expiraPub = (atual.online && atual.online.expiraEm) || (c.online && c.online.expiraEm) || "";
    _post("/api/cotacao/encerrar", { id: pubId }).then(function (x) {
      /* ⚠ daqui para baixo o servidor JÁ encerrou (200) ou já não tinha a
         publicação (404): o que se decide agora é só o que gravar aqui. Se
         outro aparelho concluiu durante a viagem, o recado tem de contar as
         DUAS coisas — senão a pessoa fica achando que os links continuam
         valendo e volta para "encerrar de novo" num botão que não existe mais. */
      /* 404 = o servidor não tem mais essa publicação (podada, ou base
         restaurada de backup): não há o que encerrar lá — encerra aqui,
         senão a trava dos itens nunca sai */
      var sumiu = x.s === 404;
      var encerrouNoSrv = x.s === 200 && !!(x.j && x.j.online);
      /* ⚠ O RECADO SE MONTA DEPOIS DE OLHAR O HTTP. Ele era montado aqui dentro
         mas ANTES da conferência do `x.s` (que só acontecia lá embaixo): com o
         servidor devolvendo 500, o app não encerrava nada e mesmo assim dizia
         "Os links foram encerrados no servidor". É o mesmo tipo de afirmação
         não verificada que este caminho existe para não fazer. E no 404 não dá
         para saber (ele é anti-oráculo: "não existe" e "não é sua" são a mesma
         resposta), então o texto diz que não dá. */
      var recadoConcluida = _msgConcluida(atual.id) + (encerrouNoSrv
        ? " Os links foram encerrados no servidor; feche e abra o Mapa de novo."
        : (sumiu
          ? " O servidor não tem mais essa publicação (ou ela é de outra licença): daqui não dá para saber se os links ainda valem. Feche e abra o Mapa de novo."
          : " NÃO consegui encerrar os links no servidor (HTTP " + x.s + "): eles podem seguir válidos. Feche e abra o Mapa de novo."));
      if (!_sincronizarVivo(atual, recadoConcluida)) return;
      if (!_mesmaPublicacao(atual, pubId)) return;
      /* ⚠ 404 TAMBÉM É A RESPOSTA PARA "A PUBLICAÇÃO NÃO É SUA".
         O servidor devolve a MESMA frase de inexistente quando a licença que
         pergunta não é a dona (anti-oráculo). Dizer "não existia mais" nesse
         caso é mentira com consequência: os links continuam funcionando e o
         fornecedor manda proposta para uma publicação que ninguém vai puxar.
         A trava local sai do mesmo jeito (senão não há saída), mas o recado e
         o histórico contam o que de fato aconteceu. */
      var deOutraLicenca = sumiu && !!donoPub && donoPub !== _emailLicenca();
      if (!sumiu && (x.s !== 200 || !x.j || !x.j.online)) { _toast(_erroDe(x, "Não consegui encerrar no servidor. A cotação continua aberta."), "erro"); return; }
      /* ⚠ a porta do dinheiro pergunta de novo depois da viagem (o pedido pode
         ter sido emitido no outro aparelho nesses segundos). Aqui o servidor JÁ
         encerrou, então o recado não pode dizer que "nada aconteceu": diz o que
         aconteceu lá e o que não foi gravado aqui. A trava continua com porta —
         o "Concluir e gerar pedidos" do Mapa carimba o `encerradaEm` local sem
         tocar na grade. */
      if (!_podeRegravarMapa(atual, encerrouNoSrv
        ? "Os links FORAM encerrados no servidor; aqui nada foi gravado."
        : "Nada foi gravado aqui.")) return;
      var cot = atual, aplicadas = 0, substituidos = 0, perdas = [], recusadas = [], convitesSrv = [];
      /* ⚠ a régua do "concluída" é o `_sincronizarVivo` lá em cima (registro
         vivo), não este `atual.status`: o status do objeto do formulário é a
         foto de quando o Mapa abriu e o merge da nuvem já o desmentiu antes.
         Este teste fica como cinto de segurança — quem simplificar, simplifique
         ESTE, nunca a releitura. */
      /* ⚠ ENCERRAR TAMBÉM PUXA — E POR ISSO LÊ OS TRÊS NÚMEROS, COMO O PUXAR.
         O confirm acima promete "as respostas já enviadas são puxadas agora":
         este é o terceiro caminho que aplica proposta de fornecedor, e era o
         único que ficava só com `aplicadas`. `substituidos` e `ignoradas`
         caíam no chão aqui: o preço anotado por telefone sumia da coluna e a
         proposta que o motor recusou morria junto com os links, os dois sob um
         toast VERDE dizendo "Cotação online encerrada.". Pior que no puxar,
         porque `encerradaEm` apaga o card e com ele o botão Puxar — por isso o
         `wireForm` passou a oferecer o resgate por 30 dias (ver `_resgatavel`)
         e o recado abaixo aponta para ele. */
      if (!sumiu && atual.status !== "concluida") {
        convitesSrv = (x.j.online && Array.isArray(x.j.online.convites)) ? x.j.online.convites : [];
        var res = _aplicarEstado(atual, x.j.online);
        /* mesma porta do puxar (ver `_religarColunas`): aqui ela vale ainda
           mais, porque depois do encerrar o card some e só resta o resgate */
        res = _religarEAplicarDeNovo(res, x.j.online, encerrouNoSrv
          ? "Os links FORAM encerrados no servidor; aqui nada foi gravado."
          : "Nada foi gravado aqui.");
        if (res.barrado) return;
        cot = res.cot; aplicadas = res.aplicadas; substituidos = res.substituidos; perdas = res.perdas;
        recusadas = _recusas(res.ignoradas);
      }
      if (!cot.online) cot.online = {};
      cot.online.encerradaEm = (!sumiu && x.j.online.encerradaEm) || _agora();
      /* ⚠ 404 = NÃO HÁ MAIS NADA ATRÁS DA PORTA. O carimbo abaixo é o que faz o
         `_resgatavel` parar de desenhar "Puxar respostas da rodada encerrada":
         clicar nele só devolveria o mesmo 404 (ver o ⚠ de `_resgatavel`). */
      if (sumiu) cot.online.sumiuNoServidor = true;
      if (aplicadas) cot.online.puxadoEm = _agora();
      if (cot.status !== "concluida") cot.status = "rascunho";
      var detalhe = deOutraLicenca
        ? ("encerrada só aqui · a publicação é da licença " + donoPub)
        : (_detalheAplicacao(aplicadas, substituidos, perdas, recusadas) + (sumiu ? " · publicação não existia mais no servidor" : ""));
      _hist(cot, "online-encerrada", detalhe);
      if (!_salvar(cot)) { _toast("Encerrada no servidor, mas não consegui gravar aqui.", "erro"); return; }
      UI.fecharModal();
      _render();
      G.formCotacao(cot);
      /* o que o encerrar APAGOU e o que ele RECUSOU viajam no mesmo recado, e
         no MESMO estilo do puxar: é a mesma pergunta ("posso decidir a compra
         com o que estou vendo?"), e a resposta não pode mudar conforme o botão */
      var aviso = "";
      if (substituidos > 0) aviso += " " + _fraseSubstituidos(substituidos, perdas);
      if (recusadas.length) aviso += " " + _fraseRecusaComPorta(recusadas, cot, convitesSrv);
      /* ⚠ UMA RÉGUA SÓ PARA O 404 ANTI-ORÁCULO — E ELA É "NÃO AFIRMAR".
         Este recado dizia "os links continuam válidos até <data>", enquanto o
         caminho gêmeo da fila (`_avisarOutraLicenca`) tem escrito com todas as
         letras que daqui NÃO dá para saber: o 404 significa "não é sua" OU "não
         existe mais" (podada, base restaurada, já encerrada pelo dono). Duas
         réguas opostas para o mesmo fato na mesma base. Agravante medido: o
         card da publicação VENCIDA também desenha o Encerrar, e a frase saía
         afirmando validade até uma data JÁ PASSADA; sem `expiraEm` legível
         virava "válidos até —". Agora o texto diz o que foi verificado (o
         servidor recusou este encerramento, a publicação é de outra licença) e
         o que não foi. */
      if (deOutraLicenca) {
        var tEx = Date.parse(expiraPub), diaEx = _fmtDia(expiraPub);
        var ateQuandoPub = (diaEx === "—")
          ? " até a publicação vencer"
          : ((isFinite(tEx) && tEx < Date.now())
            ? " — a validade registrada aqui (" + diaEx + ") já passou, mas o servidor guarda a publicação por mais 30 dias"
            : " até " + diaEx);
        _toast("A publicação pertence à licença " + donoPub + ", e o servidor não deixa outra licença encerrá-la. Encerrei só aqui; daqui não dá para saber se os links ainda estão de pé — eles podem seguir válidos" + ateQuandoPub + ". Encerre com aquela licença.", "aviso");
      }
      else if (aviso) _toast("Cotação online encerrada — " + aplicadas + " resposta(s) puxada(s)." + aviso, "aviso");
      else _toast("Cotação online encerrada" + (aplicadas ? " — " + aplicadas + " resposta(s) puxada(s)." : "."), "ok");
    }, function () { /* toast já dado por _post; nada muda localmente */ });
  };

  /* encerra sem perguntar (concluir / excluir a cotação): grava a data local
     e avisa o servidor sem esperar. Muta `cot`; quem chama salva em seguida. */
  CotOnlineUI.encerrarSilencioso = function (cot) {
    if (!cot || !cot.online || cot.online.encerradaEm) return;
    /* ⚠ a data local sai ANTES da checagem do id de propósito: sem id não há
       nada a encerrar no servidor, e deixar a trava de pé aqui prenderia os
       itens para sempre (trava sem porta). Um `online` sem `id` é o registro
       machucado do A1 — se a publicação existir mesmo, ela vence sozinha e o
       409 do publicar é o caminho de volta. */
    cot.online.encerradaEm = _agora();
    /* ⚠ O ÚNICO CAMINHO DO MÓDULO QUE CARIMBAVA `encerradaEm` SEM UMA LINHA NO
     * LOG. Todos os outros gravam `_hist` — e este é justamente o que abandona
     * mais: ele é chamado ao CONCLUIR ou EXCLUIR a cotação (js/gestao.js:
     * concluirCotacao, excluirCotacao, _cotTerminarConclusao), fecha a
     * publicação sem perguntar nada ao servidor e, com ela, qualquer proposta
     * que tenha chegado e não esteja no Mapa. Sem esta linha, a única prova de
     * que houve proposta de fornecedor deixada para trás era a memória de quem
     * clicou.
     * ⚠ O TEXTO NÃO AFIRMA O QUE NINGUÉM CONFERIU: `_propostasForaDoMapa` lê os
     * convites GRAVADOS (o espelho do que o servidor tinha da última vez), e
     * este caminho não consulta o servidor — proposta que chegou lá depois do
     * último Puxar não é contada aqui, e por isso o log diz "registradas aqui"
     * em vez de fingir um total.
     * Quem chama grava o registro em seguida (o `encerradaEm` e esta entrada
     * viajam juntos); no excluir, o registro sai inteiro e a entrada vai com
     * ele — o rastro de lá é o próprio pedido de compra em Compras. */
    var foraDoMapa = _propostasForaDoMapa(cot);
    _hist(cot, "online-encerrada", "encerrada sem consultar o servidor (cotação concluída ou excluída) · " + (foraDoMapa.length
      ? foraDoMapa.length + " proposta(s) de " + _nomesDosCids(foraDoMapa, cot, (cot.online && cot.online.convites) || []) + " ficaram fora do Mapa"
      : "nenhuma proposta registrada aqui ficou fora do Mapa"));
    var id = cot.online.id;
    if (!id) { console.warn("[cotonline] cotação marcada como publicada sem id — nada a encerrar no servidor"); return; }
    /* ⚠ ENTRA NA FILA ANTES DO POST. O caminho que interessa é justamente
       aquele em que o POST não acontece (avião, obra sem sinal): sem a fila,
       a tentativa morria ali e o link do fornecedor ficava vivo até 30 dias. */
    var dono = cot.online.dono || "";
    _filaEntrar(id, _chave());
    _filaAnotarDono(id, dono);
    /* ⚠ PERGUNTA, NÃO PRESUME — e pergunta DEPOIS das duas gravações.
       O recado abaixo promete que o encerramento acontece "quando a conexão
       voltar", promessa que só vale se a entrada de fato ficou guardada. Em
       janela anônima ou com a cota cheia o localStorage recusa, o try/catch
       engole, e a promessa vira mentira: os links seguem vivos e a pessoa não
       faz nada porque acha que está agendado. Uma leitura resolve. */
    var naFila = _filaTem(id);
    /* ⚠ SÓ NA MEMÓRIA = PROMESSA MENOR, NÃO PROMESSA IGUAL. A entrada que o
       localStorage recusou vive só enquanto este app estiver aberto (ver
       `_filaMem`), então o recado abaixo promete exatamente isso — e diz o que
       fazer com o resto. O texto antigo mandava "encerre esta cotação de novo",
       ação que não existe mais: `encerradaEm` já foi carimbado acima, a tela
       perde o botão Encerrar, e o `encerrarSilencioso` seguinte sai na
       primeira linha. Trava sem porta com recado impossível. */
    var naMemoria = !naFila && _memTem(id);
    var ateQuando = _fmtDia(cot.online.expiraEm);
    var seFechar = " Enquanto este app ficar aberto eu tento de novo; se você fechar antes de a internet voltar, os links deste fornecedor podem seguir válidos" + (ateQuando === "—" ? " até a publicação vencer" : " até " + ateQuando) + ". Libere espaço no navegador (ou saia da janela anônima) e mantenha o app aberto até a conexão voltar.";
    /* ⚠ QUANDO A FALHA É DO SERVIDOR, A CULPA NÃO É DA REDE — E NINGUÉM VAI
       TENTAR DE NOVO SOZINHO. O texto acima (escrito para o caso SEM rede)
       também saía no HTTP != 200/404 com a internet funcionando: mandava
       "esperar a conexão voltar" (ela não caiu) e prometia retentativa
       automática que este ramo não tem. Os três gatilhos de `retomarPendentes`
       são abrir o Mapa, o evento "online" (que não dispara com a rede de pé) e
       um setTimeout ÚNICO, já gasto na carga. Medido: 1 POST e mais nenhum
       enquanto o app segue aberto. Então o recado diz quem dispara a próxima
       tentativa — a pessoa. */
    var seServidor = " Tento de novo quando você abrir o Mapa de qualquer cotação (não há retentativa sozinha, e a internet não é o problema aqui). Se fechar o app antes disso, os links deste fornecedor podem seguir válidos" + (ateQuando === "—" ? " até a publicação vencer" : " até " + ateQuando) + " — avise o suporte da RA com o número desta cotação.";
    if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
      /* recado honesto: NÃO afirma que encerrou no servidor, porque não
         encerrou — diz o que aconteceu e o que vai acontecer */
      if (naFila) _toast("Sem rede agora: os links desta cotação serão encerrados no servidor quando a conexão voltar.", "aviso");
      else if (naMemoria) _toast("Sem rede agora, e não consegui deixar isso agendado neste navegador (armazenamento cheio ou janela anônima)." + seFechar, "erro");
      else _toast("Sem rede agora, e não consegui deixar isso agendado neste navegador nem tentar de novo sozinho. Os links deste fornecedor podem seguir válidos" + (ateQuando === "—" ? " até a publicação vencer" : " até " + ateQuando) + " — avise o suporte da RA com o número desta cotação.", "erro");
      return;
    }
    try {
      _post("/api/cotacao/encerrar", { id: id }, true).then(function (x) {
        if (x.s === 200) { _filaSair(id); return; }
        if (x.s === 404) {
          /* ⚠ o mesmo 404 de "não é sua" (ver _filaAnotarDono): sai da fila
             porque insistir com esta licença nunca vai funcionar, mas cala só
             quando a publicação era mesmo desta máquina */
          /* ⚠ concluir/excluir é AÇÃO DA PESSOA, e aqui é uma cotação por vez:
             o recado sai sempre e com o número dela (ver `_avisoEhDeUmaAcao`) */
          _avisoEhDeUmaAcao(cot);
          _filaSair(id);
          if (dono && dono !== _emailLicenca()) _avisarOutraLicenca(dono, _rotuloDaCotacao(cot));
          return;
        }
        if (!naFila && !naMemoria) { _toast("Não consegui encerrar os links desta cotação no servidor (HTTP " + x.s + ") e não consegui deixar isso agendado neste navegador. Os links deste fornecedor podem seguir válidos" + (ateQuando === "—" ? " até a publicação vencer" : " até " + ateQuando) + " — avise o suporte da RA com o número desta cotação.", "erro"); return; }
        if (naMemoria) { _toast("Não consegui encerrar os links desta cotação no servidor (HTTP " + x.s + ") e não consegui deixar isso agendado neste navegador (armazenamento cheio ou janela anônima)." + seServidor, "erro"); return; }
        console.warn("[cotonline] encerrar HTTP " + x.s + " — fica na fila");
      }, function (e) {
        /* sem rede E sem fila: ninguém vai tentar de novo, então o silêncio
           aqui é o link do fornecedor vivo por 30 dias sem dono */
        if (!naFila && !naMemoria) { _toast("Não consegui encerrar os links desta cotação no servidor e não consegui deixar isso agendado neste navegador. Os links deste fornecedor podem seguir válidos" + (ateQuando === "—" ? " até a publicação vencer" : " até " + ateQuando) + " — avise o suporte da RA com o número desta cotação.", "erro"); return; }
        if (naMemoria) { _toast("Não consegui encerrar os links desta cotação no servidor agora, e não consegui deixar isso agendado neste navegador (armazenamento cheio ou janela anônima)." + seFechar, "erro"); return; }
        console.warn("[cotonline] encerrar sem rede (fica na fila):", e && e.message);
      });
    } catch (e) { console.warn("[cotonline] encerrar:", e && e.message); }
  };

  /* o que fazer com a resposta de um encerramento pendente.
   * `podeRetentar` só é true na PRIMEIRA tentativa (a que usou a chave
   * guardada na fila) — senão um 401 em cadeia viraria laço de POSTs. */
  function _tratarPendente(p, x, podeRetentar) {
    if (x.s === 200) { _filaSair(p.id); return; }
    if (x.s === 404) {
      /* ⚠ 404 TAMBÉM É "A PUBLICAÇÃO NÃO É SUA" (o servidor responde igual de
         propósito). Sair da fila é certo — esta licença nunca vai conseguir —,
         mas tratar como "pronto, o link já morreu" era mentira: com dono
         diferente, os links podem seguir de pé e a pessoa precisa saber. */
      _filaSair(p.id);
      if (p.dono && p.dono !== _emailLicenca()) _avisarOutraLicenca(p.dono);
      return;
    }
    if (x.s === 401 || x.s === 403) {
      /* ⚠ ANTES DE ACUSAR A LICENÇA, TENTE A CHAVE QUE ESTÁ INSTALADA AGORA.
         A renovação REEMITE a chave com o MESMO e-mail, e o servidor compara
         por e-mail: a chave que a fila guardou (a de quando publicou) é
         recusada, a instalada passa. Sem esta tentativa, quem renovou a
         licença via um recado dizendo que ela "não está mais ativa" — o
         contrário do que tinha acabado de fazer — e o encerramento nunca
         acontecia. */
      var k = _chave();
      if (podeRetentar && k && k !== p.chave) {
        try { _post("/api/cotacao/encerrar", { id: p.id }, true, k).then(function (y) { _tratarPendente(p, y, false); }, function () {}); } catch (e) {}
        return;
      }
      if (!_avisouFila) {
        _avisouFila = true;
        /* ⚠ O RECADO NÃO AFIRMA O QUE O SISTEMA NÃO VERIFICOU. Verificado: o
           servidor recusou a licença desta máquina (e a chave instalada agora
           também, quando ela era outra). O MOTIVO o servidor não conta — pode
           ser licença inativa ou publicação de outra licença —, então o texto
           apresenta os dois em vez de escolher um e mentir com confiança. */
        _toast("Não consegui encerrar no servidor os links de cotação que ficaram pendentes: o servidor recusou a licença desta máquina. Daqui não dá para saber qual dos dois motivos é — a licença que publicou não está mais ativa, ou a publicação pertence a outra licença. Reative aquela licença (ou encerre com ela) ou espere a publicação vencer (até 30 dias).", "aviso");
      }
      return;
    }
    console.warn("[cotonline] encerrar pendente HTTP " + x.s);
  }

  /* tenta de novo os encerramentos que ficaram pendentes. Chamado ao abrir o
     Mapa, quando o navegador avisa que a conexão voltou, e uma vez alguns
     segundos depois da carga. Silencioso: quem está usando o app não pediu
     isso agora, e um toast a cada abertura viraria ruído. */
  CotOnlineUI.retomarPendentes = function () {
    var fila = _filaLer();
    /* ⚠ a fila de MEMÓRIA entra aqui: é a única chance de quem teve o
       localStorage recusado (janela anônima, cota cheia). Sem esta junção, o
       fallback seria só uma variável bonita — ninguém retomaria nada, e o
       recado que promete "tento de novo enquanto o app estiver aberto" viraria
       mais uma promessa que o produto não cumpre. */
    _filaMem.forEach(function (m) {
      if (!m || !m.id) return;
      var ja = false;
      fila.forEach(function (x) { if (x && x.id === m.id) ja = true; });
      if (!ja) fila.push(m);
    });
    if (!fila.length) return 0;
    if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) return fila.length;
    fila.forEach(function (p) {
      if (!p || !p.id) return;
      try {
        /* a chave que PUBLICOU: a publicação é do dono (I1) e outra licença
           receberia 404 — o que tiraria da fila um link que continua vivo */
        _post("/api/cotacao/encerrar", { id: p.id }, true, p.chave).then(function (x) { _tratarPendente(p, x, true); }, function () { /* segue na fila para a próxima chance */ });
      } catch (e) {}
    });
    return fila.length;
  };

  /* expostos para teste/diagnóstico */
  CotOnlineUI._aplicarEstado = _aplicarEstado;
  CotOnlineUI._foneIntl = _foneIntl;
  CotOnlineUI._vencida = _vencida;
  CotOnlineUI._pendentes = _filaLer;

  global.CotOnlineUI = CotOnlineUI;
  if (typeof module !== "undefined" && module.exports) module.exports = CotOnlineUI;

  /* as outras duas chances da fila (a terceira é o wireForm) */
  if (typeof window !== "undefined" && window && window.addEventListener) {
    window.addEventListener("online", function () { try { CotOnlineUI.retomarPendentes(); } catch (e) {} });
  }
  if (typeof window !== "undefined" && typeof setTimeout === "function") {
    /* 4 s depois da carga: tarde o bastante para não brigar com o boot do app,
       cedo o bastante para o link morrer no mesmo dia em que a rede voltou */
    var _tmr = setTimeout(function () { try { CotOnlineUI.retomarPendentes(); } catch (e) {} }, 4000);
    if (_tmr && typeof _tmr.unref === "function") _tmr.unref(); // Node (teste): não segura o processo
  }
})(typeof window !== "undefined" ? window : this);

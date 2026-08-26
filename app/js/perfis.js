/* =====================================================================
 * PERFIS DE IMPLANTAÇÃO — o mesmo sistema, enxugado por cliente
 *
 * O OrçaPRO tem 34 módulos. Nem toda empresa usa 34. Uma carpintaria que
 * faz deck e forro não precisa de BIM 7D, Last Planner nem Frota — e cada
 * módulo a mais na barra é uma decisão a mais para a equipe dela tomar
 * todo dia.
 *
 * Um PERFIL é uma lista nomeada de módulos liberados, gravada nas prefs da
 * EMPRESA. Trocar de perfil não apaga nada: os dados dos módulos ocultos
 * continuam lá, e voltar para "completo" devolve tudo.
 *
 * ⚠ POR QUE NÃO É FEATURE FLAG POR VARIÁVEL DE AMBIENTE. A ideia original
 *   era um `CLIENT_TENANT=new_form` decidindo em tempo de build. Isso daria
 *   um binário por cliente: o pacote daquele cliente deixaria de receber as
 *   correções do produto, e cada release viraria N empacotamentos. Aqui o
 *   perfil é DADO — viaja nas prefs, junto do logo e do white-label, e o
 *   mesmo executável serve todo mundo.
 *
 * ⚠ POR QUE NÃO É `if (cliente === "fulano")` ESPALHADO. Condicional por
 *   nome de cliente no meio da regra de negócio é o começo do fork
 *   disfarçado: em seis meses ninguém sabe quais telas têm desvio. O perfil
 *   só decide O QUE APARECE. Regra de negócio específica, quando vier, entra
 *   como módulo próprio ligado por configuração — igual às irmãs do
 *   servidor (composicoes, fotos-srv, titular-srv).
 *
 * ⚠ ELE VALE PARA O DONO TAMBÉM. `Auth.podeModulo` liberava tudo para quem
 *   é admin antes de olhar qualquer lista. Se o perfil entrasse depois desse
 *   atalho, ele não valeria justamente para a pessoa que mais usa o sistema
 *   no cliente. O gancho fica ANTES — ver o comentário em auth.js.
 *
 * ⚠ ESTE ARQUIVO É O ÚNICO QUE PODE SABER O NOME DE UM CLIENTE. É a
 *   contrapartida da regra acima: como nenhuma regra de negócio pode
 *   perguntar "é o cliente X?", alguém precisa carregar essa informação — e
 *   é melhor que seja um lugar só, declarativo, do que trinta espalhados.
 *   Aqui moram: a lista de módulos e a SEMENTE (os números do cliente).
 * =================================================================== */
var Perfis = (function () {
  "use strict";

  /* ⚠ NÚCLEO NUNCA SOME, e isso é trava de segurança, não comodidade.
     Sem `usuarios` o dono não consegue cadastrar a própria equipe; sem
     `ajuda`/`relatos` ele não consegue pedir socorro quando algo trava; sem
     `dashboard` a tela inicial fica vazia. Um perfil mal preenchido não pode
     trancar o cliente para fora da própria conta. */
  var NUCLEO = ["dashboard", "ajuda", "relatos", "usuarios"];

  /* ⚠ MÓDULO SOB DEMANDA — É ISTO QUE FAZ UMA VERSÃO SER EXCLUSIVA SEM VIRAR
   *   FORK, e é a parte que se erra por descuido.
   *
   * `completo` significa "todos os módulos DO PRODUTO" — `modulos: null`, sem
   * restrição. Um módulo escrito para a operação de UM cliente não é do
   * produto: se ele valesse no `completo`, toda empresa que compra o OrçaPRO
   * passaria a ver "Carpintaria" na barra no dia seguinte à publicação.
   *
   * A saída óbvia — transformar `completo` numa lista explícita dos 34 ids —
   * troca um defeito por outro pior: a lista quebra silenciosamente toda vez
   * que alguém acrescenta um módulo ao produto e esquece de citá-la.
   *
   * Aqui o sentido é invertido: quem está NESTA lista só aparece para o
   * perfil que o NOMEIA. Módulo do produto continua valendo por omissão;
   * módulo de cliente precisa de convite. */
  var SOB_DEMANDA = ["carpintaria", "remunvar"];

  /* ⚠ AQUI SÓ MORA O PERFIL DO PRODUTO. Perfil de CLIENTE — nome comercial,
   *   resumo da operação e os números que fazem o preço dele — é material do
   *   cliente e vive em `venda/perfis-clientes.js`, que NÃO é empacotado nem
   *   sincronizado para o PWA.
   *
   *   Enquanto isso morava aqui, viajava em três lugares ao mesmo tempo: no
   *   pacote de todo cliente, no PWA público da landing (o `js/perfis.js` de
   *   lá respondia HTTP 200 com 21 KB de nome e números, sem login nenhum) e
   *   no console, via `Perfis.CATALOGO`. Marcar `privado: true` e filtrar o
   *   `listar()` — o que a v1.1.278 fez — fecha a porta da frente e deixa o
   *   arquivo aberto na rua. */
  var CATALOGO = {
    completo: {
      nome: "Completo",
      desc: "Todos os módulos do OrçaPRO. É o padrão de quem compra o sistema.",
      modulos: null                       // null = sem restrição (menos o sob demanda)
    },

  };

  /* Quem tem o arquivo privado registra os perfis de cliente por aqui. Sem ele,
     o app roda com o catálogo do produto — que é exatamente o que o cliente
     precisa, porque o perfil DELE já está resolvido dentro de `perfil_impl`. */
  function registrarCatalogo(mapa) {
    if (!mapa || typeof mapa !== "object") return 0;
    var n = 0;
    Object.keys(mapa).forEach(function (id) {
      if (id === "completo" || CATALOGO[id]) return;      // nunca sobrescreve o do produto
      CATALOGO[id] = mapa[id];
      n++;
    });
    return n;
  }

  var ENT_PERFIL = "perfil_impl";

  function _eid() {
    return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : null;
  }

  /* ⚠ O PERFIL É ENTIDADE, NÃO prefs — e a diferença é o merge da nuvem.
   *   Prefs mesclam com `Object.assign({}, nuvem, local)`: o aparelho LOCAL
   *   vence campo a campo. O dono enxuga o sistema no computador, o celular
   *   dele (que ainda tem as prefs antigas) sincroniza e DESFAZ a escolha —
   *   sem erro nenhum, e sem ninguém entender por que a barra voltou a ter 34
   *   módulos. É o mesmo defeito que tirou o preço de produção de dentro das
   *   prefs. Entidade passa pelo merge por id, com `atualizadoEm`.
   *
   * ⚠ COMPATIBILIDADE: conta provisionada antes desta versão tem o id gravado
   *   nas prefs. Lemos de lá quando a entidade ainda não existe, e não
   *   apagamos nada — a próxima gravação migra sozinha. */
  function _registro() {
    try {
      if (typeof Store === "undefined" || typeof Auth === "undefined") return {};
      var eid = _eid();
      if (!eid) return {};
      var l = Store.listar(eid, ENT_PERFIL) || [];
      if (l.length && l[0]) return l[0];
      var pr = Store.lerPrefs(eid) || {};
      return pr.perfil ? { perfil: pr.perfil, _dasPrefs: true } : {};
    } catch (e) { return {}; }
  }

  function _sobDemanda(id) { return SOB_DEMANDA.indexOf(String(id)) > -1; }

  /* ⚠ O REGISTRO DA CONTA VALE MESMO SEM CATÁLOGO. Na instalação do cliente o
     `venda/perfis-clientes.js` não existe — de propósito —, então
     `CATALOGO[id]` é `undefined` para o perfil dele. Se estas funções
     dependessem só do catálogo, o perfil cairia em "completo" no primeiro
     boot depois da atualização e a barra dele voltaria aos 34 módulos, sem
     erro em lugar nenhum. Por isso `aplicar` grava a lista junto, e a leitura
     prefere o catálogo (que é a fonte, quando existe) e cai no registro. */
  function _perfilDe(id) {
    if (CATALOGO[id]) return CATALOGO[id];
    var reg = _registro();
    if (reg.perfil === id && (reg.modulos || reg.nome)) {
      return { nome: reg.nome || "Perfil da conta", desc: "", modulos: reg.modulos || null };
    }
    return null;
  }

  /* id do perfil gravado, ou "completo". */
  function idAtual() {
    var id = _registro().perfil;
    return (typeof id === "string" && _perfilDe(id)) ? id : "completo";
  }

  function atual() {
    var p = _perfilDe(idAtual()) || CATALOGO.completo;
    return { id: idAtual(), nome: p.nome, desc: p.desc, modulos: p.modulos };
  }

  /* Lista efetiva de módulos liberados — núcleo incluído. `null` = todos
     os do produto (o sob demanda continua de fora). */
  function modulosLiberados() {
    var p = _perfilDe(idAtual());
    if (!p || !p.modulos) return null;
    var fora = p.modulos.filter(function (id) { return NUCLEO.indexOf(id) < 0; });
    return NUCLEO.concat(fora);
  }

  /* A pergunta que o Auth faz. Em qualquer dúvida, LIBERA:
     esconder módulo por engano é pior que mostrar um a mais — quem apanha
     é o cliente, na frente da equipe dele, sem saber o que aconteceu.
     ⚠ "Liberar na dúvida" vale para módulo DO PRODUTO. Para o sob demanda a
       dúvida resolve ao contrário: mostrar o módulo de outro cliente não
       ajuda ninguém e entrega tela que não faz sentido na operação de quem
       está olhando. */
  function permite(id) {
    var s = String(id);
    try {
      var libs = modulosLiberados();
      if (!libs) return !_sobDemanda(s);        // perfil completo
      return libs.indexOf(s) > -1;
    } catch (e) { return !_sobDemanda(s); }
  }

  /* Troca o perfil da empresa. Não mexe em dado de módulo nenhum.
     ⚠ NÃO REDESENHA A TELA. Quem chama precisa disparar o render — o dono
       trocar o perfil, ver o toast e a barra continuar igual é o relato de
       defeito que chega depois. */
  function aplicar(perfilId) {
    if (!CATALOGO[perfilId]) return { ok: false, erro: "Perfil desconhecido: " + perfilId };
    /* ⚠ PERFIL PRIVADO NÃO SE APLICA PELO CONSOLE. `_visivel` protegia só o
       `listar()`; `aplicar` aceitava qualquer id do catálogo. Um cliente com
       o F12 aberto digitava `Perfis.aplicar("<id>")` e virava o outro cliente
       — e o `semear` logo depois gravava os NÚMEROS do outro na base dele.
       O caminho não passava por botão nenhum, então gate de tela não o fechava. */
    if (!_visivel(perfilId)) return { ok: false, erro: "Perfil não disponível nesta conta." };
    try {
      var eid = _eid();
      if (!eid) return { ok: false, erro: "sem empresa" };
      /* ⚠ A LISTA DE MÓDULOS VAI GRAVADA JUNTO, e é isso que deixa o catálogo
         ficar fora do pacote do cliente. O registro passa a dizer "os meus
         módulos são estes" — um fato sobre a própria conta — em vez de exigir
         uma tabela com o nome e a operação de todo mundo dentro de `js/`.
         `perfil_impl` sincroniza, então os outros aparelhos da conta recebem
         a lista sem precisar do arquivo também. */
      var cat = CATALOGO[perfilId];
      Store.salvar(eid, ENT_PERFIL, {
        id: "perfil-impl", perfil: perfilId,
        nome: cat.nome || "", modulos: cat.modulos ? cat.modulos.slice() : null
      });
      /* espelha nas prefs por enquanto: um aparelho que ainda não recebeu esta
         versão continua lendo de lá, e enxergaria o sistema completo sem isto */
      try {
        var pr = Store.lerPrefs(eid) || {};
        pr.perfil = perfilId;
        Store.salvarPrefs(eid, pr);
      } catch (eP) {}
      return { ok: true, perfil: atual() };
    } catch (e) {
      return { ok: false, erro: e.message || String(e) };
    }
  }

  /* A semente declarada pelo perfil, ou null. Cópia — para ninguém editar o
     catálogo por referência e a segunda implantação nascer torta. */
  function semente(perfilId) {
    var p = CATALOGO[perfilId || idAtual()];
    if (!p || !p.semente) return null;
    return JSON.parse(JSON.stringify(p.semente));
  }

  /* ===================================================================
   * SEMEAR — os números do cliente entrando no sistema
   *
   * ⚠ IDEMPOTENTE E NÃO-DESTRUTIVO, e a ordem importa: só grava a entidade
   *   que está VAZIA. Se o cliente já ajustou o percentual do degrau, a
   *   implantação rodando de novo não pode devolver o valor de fábrica —
   *   semear duas vezes é o normal (segundo aparelho, reinstalação), e uma
   *   semeadura que sobrescreve apaga o trabalho de quem usa.
   *
   * `deps` existe para o teste rodar sem app: { store, empresaId }.
   * =================================================================== */
  function semear(perfilId, deps) {
    var sem = semente(perfilId);
    if (!sem) return { ok: true, semeadas: [], puladas: [], motivo: "perfil sem semente" };
    var store = (deps && deps.store) || (typeof Store !== "undefined" ? Store : null);
    var eid = (deps && deps.empresaId) || (typeof Auth !== "undefined" && Auth.empresaId ? Auth.empresaId() : null);
    if (!store || !eid) return { ok: false, erro: "sem Store ou empresa para semear" };

    var semeadas = [], puladas = [];
    Object.keys(sem).forEach(function (entidade) {
      try {
        var atuais = store.listar(eid, entidade) || [];
        if (atuais.length) { puladas.push(entidade); return; }
        store.salvar(eid, entidade, sem[entidade]);
        semeadas.push(entidade);
      } catch (e) { puladas.push(entidade); }
    });
    return { ok: true, semeadas: semeadas, puladas: puladas };
  }

  /* Um perfil privado só aparece na tela em dois casos: quando JÁ É o perfil
     da conta (senão o cliente não teria como ver em qual está, nem como voltar
     para "Completo"), ou quando a implantação o revela de propósito abrindo o
     app com `?perfil=<id>` — que MOSTRA a opção, sem aplicar nada. É esse o
     caminho de quem implanta: uma vez, na máquina do cliente. */
  function _reveladoNaURL(id) {
    try {
      var q = (typeof location !== "undefined" && location.search) || "";
      var m = /[?&]perfil=([a-z0-9_-]+)/i.exec(q);
      return !!m && m[1].toLowerCase() === String(id).toLowerCase();
    } catch (e) { return false; }
  }
  function _visivel(id) {
    if (!CATALOGO[id] || !CATALOGO[id].privado) return true;
    return id === idAtual() || _reveladoNaURL(id);
  }

  /* Para telas de escolha: [{id, nome, desc, qtd}] */
  function listar() {
    /* ⚠ O CLIENTE PRECISA VER O PRÓPRIO PERFIL, mesmo sem o catálogo. Sem esta
       linha, na máquina dele a lista teria só "Completo", o bloco de escolha
       sumiria (ele desiste com menos de 2 opções) e ele ficaria sem a volta
       para o sistema completo — uma porta que existia e fecharia calada.
       O nome que aparece é o DELE, gravado no próprio registro; nome de outro
       cliente continua sem caminho nenhum até aqui. */
    var ids = Object.keys(CATALOGO).filter(_visivel);
    var meu = _registro().perfil;
    if (meu && meu !== "completo" && ids.indexOf(meu) < 0 && _perfilDe(meu)) ids.push(meu);
    return ids.map(function (id) {
      var p = _perfilDe(id) || CATALOGO.completo;
      return {
        id: id, nome: p.nome, desc: p.desc,
        qtd: p.modulos ? NUCLEO.concat(p.modulos.filter(function (m) { return NUCLEO.indexOf(m) < 0; })).length : null,
        semente: !!p.semente,
        atual: id === idAtual()
      };
    });
  }

  /* ===================================================================
   * CONFERIR O CATÁLOGO CONTRA OS MÓDULOS QUE EXISTEM
   *
   * ⚠ Um id errado no catálogo não dá erro: `permite` responde false em
   *   silêncio e o módulo simplesmente não aparece. "fornecedor" no lugar de
   *   "fornecedores" tira o cadastro do cliente da barra e ninguém descobre
   *   até ele reclamar. Esta função existe para o TESTE ter como reprovar —
   *   ela recebe a lista de ids válidos de fora (Gestao.modulos) porque este
   *   arquivo não conhece a Gestão.
   * =================================================================== */
  function conferir(idsValidos) {
    var validos = {}, i;
    for (i = 0; i < (idsValidos || []).length; i++) validos[String(idsValidos[i])] = 1;
    var problemas = [];
    NUCLEO.forEach(function (id) {
      if (!validos[id]) problemas.push('NUCLEO cita "' + id + '", que não é módulo do sistema.');
    });
    SOB_DEMANDA.forEach(function (id) {
      if (!validos[id]) problemas.push('SOB_DEMANDA cita "' + id + '", que não é módulo do sistema.');
    });
    Object.keys(CATALOGO).forEach(function (pid) {
      var mods = CATALOGO[pid].modulos;
      if (!mods) return;
      var vistos = {};
      mods.forEach(function (id) {
        if (!validos[id]) problemas.push('O perfil "' + pid + '" cita "' + id + '", que não é módulo do sistema.');
        if (vistos[id]) problemas.push('O perfil "' + pid + '" cita "' + id + '" duas vezes.');
        vistos[id] = 1;
      });
    });
    return problemas;
  }

  /* ⚠ `CATALOGO` E `semente` NÃO SÃO MAIS EXPORTADOS CRUS. Eram: bastava
     `Perfis.CATALOGO` no console para ler nome, descrição e os números de
     todo cliente do catálogo, e `Perfis.semente("<id>")` devolvia a semente
     inteira sem gate nenhum — ao lado da marca `privado: true` que devia
     protegê-los. O que sai daqui é o que a tela precisa; quem implanta usa
     `aplicar` e `semear`, que agora recusam perfil não disponível na conta. */
  return {
    NUCLEO: NUCLEO,
    SOB_DEMANDA: SOB_DEMANDA,
    registrarCatalogo: registrarCatalogo,
    idAtual: idAtual,
    atual: atual,
    modulosLiberados: modulosLiberados,
    permite: permite,
    aplicar: aplicar,
    semear: semear,
    listar: listar,
    visivel: _visivel,
    conferir: conferir
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Perfis;

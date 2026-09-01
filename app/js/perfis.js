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
  /* =====================================================================
   * OS PERFIS QUE ESTA CONTA JÁ TEVE — a volta que era destruída ao ir
   *
   * ⚠ ISTO NÃO É REFINAMENTO: era uma PORTA DE MÃO ÚNICA, e um cliente caiu
   *   nela. Medido em 31/08/2026, reproduzindo a máquina do cliente (sem
   *   `venda/perfis-clientes.js`, que é o normal — o catálogo não vai no
   *   pacote de propósito):
   *
   *     antes do clique : 2 opções — "Completo" | o perfil do cliente
   *     ele clica em "Completo" e Salvar
   *     depois do clique: 1 opção — o bloco INTEIRO some da tela
   *
   *   Porque `aplicar` gravava por cima do MESMO registro (`perfil-impl`), e
   *   esse registro era o único lugar da máquina que sabia o nome e a lista
   *   de módulos do cliente. Ao ir para "Completo", a conta esquecia quem
   *   era. `listar()` voltava a ter um item só, `_renderEmpresaPerfil`
   *   desiste com menos de dois, e `Perfis.aplicar("<id>")` — até pelo
   *   console — respondia "Perfil desconhecido".
   *
   *   E a tela PROMETE o contrário, com estas palavras: "Nada é apagado: o
   *   módulo oculto continua com os dados dele, e voltar para 'Completo'
   *   devolve tudo." Devolvia os módulos e levava embora a volta.
   *
   * ⚠ NÃO AFROUXA A TRAVA DO F12. `conhecidos` guarda só o que ESTA conta já
   *   teve — não é o catálogo de ninguém. Um cliente com o console aberto
   *   continua sem caminho para virar outro cliente, e `semear` continua
   *   dependendo do catálogo (que ele não tem), então nenhum NÚMERO de outra
   *   empresa fica alcançável por aqui.
   * =================================================================== */
  function _conhecidos(reg) {
    var c = (reg || _registro()).conhecidos;
    return (c && typeof c === "object") ? c : {};
  }

  function _perfilDe(id) {
    if (CATALOGO[id]) return CATALOGO[id];
    var reg = _registro();
    if (reg.perfil === id && (reg.modulos || reg.nome)) {
      return { nome: reg.nome || "Perfil da conta", desc: "", modulos: reg.modulos || null };
    }
    /* o perfil que a conta JÁ TEVE continua sendo dela: é por aqui que a
       volta existe depois de uma passagem por "Completo" */
    var k = _conhecidos(reg)[id];
    if (k && (k.modulos || k.nome)) {
      return { nome: k.nome || "Perfil da conta", desc: k.desc || "", modulos: k.modulos || null };
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
  /* =====================================================================
   * MÓDULO QUE OUTRO PRECISA NÃO PODE FICAR DE FORA
   *
   * ⚠ A LISTA DO PERFIL CONGELA NA IMPLANTAÇÃO, e é isso que dá o problema.
   *   `aplicar` grava os módulos DENTRO do registro da conta — de propósito,
   *   porque na máquina do cliente o catálogo não existe. Mas então, quando o
   *   catálogo do cliente ganha um módulo depois, o registro dele não fica
   *   sabendo, e a atualização entrega o CÓDIGO sem entregar o ACESSO.
   *
   *   Aconteceu em 31/08/2026: "Modelos de Proposta" entrou no catálogo de um
   *   cliente no dia 30; o registro dele era de antes, com um módulo a menos.
   *   O sistema atualizou, o arquivo do módulo foi junto, e a tela dele
   *   continuou sem o item — sem erro em lugar nenhum.
   *
   * ⚠ E AQUI A DEPENDÊNCIA É REAL, não conveniência: `js/carpintariaui.js`
   *   oferece a escolha do desenho da proposta lendo `prop_modelos`, e o
   *   único lugar onde um `prop_modelos` nasce é o módulo `propmodelos`. Sem
   *   ele, aquele `if (modelos.length)` é código morto para sempre: o cliente
   *   gera proposta e nunca vê a opção de usar o desenho da empresa dele —
   *   que foi exatamente o motivo de o recurso existir.
   *
   * ⚠ REBOQUE NUNCA PUXA MÓDULO SOB DEMANDA. Se um dia uma dependência
   *   apontasse para o módulo escrito para OUTRO cliente, o reboque o
   *   entregaria calado — e "o perfil enxuga" viraria "o perfil vaza".
   * =================================================================== */
  var REQUER = {
    carpintaria: ["propmodelos"]
  };

  function _comRequeridos(mods) {
    if (!mods) return null;
    var out = [], visto = {};
    mods.forEach(function (m) { if (!visto[m]) { visto[m] = 1; out.push(m); } });
    mods.forEach(function (m) {
      (REQUER[m] || []).forEach(function (dep) {
        if (visto[dep] || _sobDemanda(dep)) return;
        visto[dep] = 1; out.push(dep);
      });
    });
    return out;
  }

  /* ⚠ UMA CONTA SÓ, PARA OS DOIS QUE PERGUNTAM. A tela de perfil e o modal de
     recuperação mostravam "N módulos" cada um com a sua conta: um aplicava o
     reboque e o outro não, e o cliente lia 10 num lugar e 9 no outro sobre o
     MESMO perfil. Número que discorda de si mesmo apaga a confiança nos dois. */
  function contar(mods) {
    if (!mods || !mods.length) return 0;
    return NUCLEO.concat(_comRequeridos(mods).filter(function (m) { return NUCLEO.indexOf(m) < 0; })).length;
  }

  function modulosLiberados() {
    var p = _perfilDe(idAtual());
    if (!p || !p.modulos) return null;
    var lista = _comRequeridos(p.modulos);
    var fora = lista.filter(function (id) { return NUCLEO.indexOf(id) < 0; });
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
    /* ⚠ o id que ESTA conta já teve vale mesmo sem catálogo — é o caminho de
       volta depois de uma passagem por "Completo" numa máquina de cliente,
       onde `venda/perfis-clientes.js` não existe (e não deve existir) */
    var _reg = _registro();
    var _meu = _conhecidos(_reg)[perfilId];
    if (!CATALOGO[perfilId] && !_meu) return { ok: false, erro: "Perfil desconhecido: " + perfilId };
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
      var cat = CATALOGO[perfilId] || { nome: _meu.nome || "", desc: _meu.desc || "", modulos: _meu.modulos || null };
      /* ⚠ A VOLTA VAI JUNTO. Antes esta gravação apagava o único lugar da
         máquina que sabia qual era o perfil do cliente — e "Completo" virava
         mão única. Aqui o perfil que SAI (e o que entra, quando é de cliente)
         fica guardado em `conhecidos`, que nunca é limpo. */
      var conhecidos = {};
      var antes = _conhecidos(_reg);
      Object.keys(antes).forEach(function (k) { conhecidos[k] = antes[k]; });
      /* ⚠ A CONTA ANTIGA GUARDAVA SÓ O ID, NAS PREFS. `_registro` cai nas prefs
         quando a entidade ainda não existe, e prefs carregam `perfil` e mais
         nada — sem a lista de módulos não há o que lembrar, e `conhecidos`
         nasceria com um item que `_perfilDe` recusa: a volta apareceria como
         existente e não funcionaria. Quando o catálogo está presente (máquina
         de quem implanta) ele completa; quando não está, o caminho honesto é
         o backup, e é por isso que a recuperação por arquivo existe. */
      var saindo = _reg.perfil;
      if (saindo && saindo !== "completo") {
        var fonte = (_reg.modulos || _reg.nome) ? _reg : (CATALOGO[saindo] || null);
        if (fonte) {
          conhecidos[saindo] = {
            nome: fonte.nome || "", desc: fonte.desc || (antes[saindo] || {}).desc || "",
            modulos: fonte.modulos ? fonte.modulos.slice() : null
          };
        }
      }
      if (perfilId !== "completo") {
        conhecidos[perfilId] = {
          nome: cat.nome || "", desc: cat.desc || "",
          modulos: cat.modulos ? cat.modulos.slice() : null
        };
      }
      Store.salvar(eid, ENT_PERFIL, {
        id: "perfil-impl", perfil: perfilId,
        nome: cat.nome || "", modulos: cat.modulos ? cat.modulos.slice() : null,
        conhecidos: conhecidos
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

  /* =====================================================================
   * restaurar — devolver o perfil a uma conta que já o perdeu
   *
   * ⚠ PARA QUEM A CORREÇÃO ACIMA CHEGA TARDE. `conhecidos` fecha a porta de
   *   agora em diante; quem já passou por ela tem o registro destruído, e
   *   nenhuma linha nova consegue adivinhar o que estava escrito lá.
   *
   *   O que ainda sabe é o BACKUP AUTOMÁTICO da máquina do cliente: o
   *   `_dumpBackup` grava todas as entidades de `Nuvem.ENTIDADES`, e
   *   `perfil_impl` é uma delas. O arquivo de antes do clique tem o nome e a
   *   lista de módulos dele.
   *
   * ⚠ E O `importarBackup` NÃO RESOLVE, o que é a parte traiçoeira: ele
   *   mescla com "o mais novo vence", e o registro atual (o "completo" que
   *   acabou de ser gravado) é mais novo que o do arquivo. O cliente importa
   *   o próprio backup, o perfil é descartado em silêncio, e ele conclui que
   *   o backup não presta. Por isso a recuperação é EXPLÍCITA e ignora o
   *   carimbo de propósito.
   *
   * ⚠ ISTO NÃO ABRE PORTA PARA A CONTA DOS OUTROS. O que entra aqui é uma
   *   lista de módulos e um nome vindos do backup da PRÓPRIA conta; não há
   *   semente, então nenhum NÚMERO de outra empresa é alcançável. E restringir
   *   os próprios módulos não é privilégio: é o contrário dele.
   * =================================================================== */
  function restaurar(desc) {
    var d = desc || {};
    var id = typeof d.perfil === "string" ? d.perfil.trim() : "";
    if (!id) return { ok: false, erro: "O arquivo não tem perfil de implantação gravado." };
    if (id === "completo") return { ok: false, erro: "Esse backup já estava com o sistema completo — não há perfil a recuperar." };
    var mods = Array.isArray(d.modulos) ? d.modulos.filter(function (m) { return typeof m === "string" && m; }) : null;
    if ((!mods || !mods.length) && !CATALOGO[id]) {
      return { ok: false, erro: "O arquivo diz que o perfil era “" + id + "”, mas não traz a lista de módulos dele." };
    }
    /* ⚠ GUARDA NA FUNÇÃO, não só na tela: o perfil decide o que a empresa
       INTEIRA enxerga, e a ação é alcançável sem passar por botão nenhum. */
    try {
      if (typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin()) {
        return { ok: false, erro: "Só o administrador da conta pode recuperar o perfil." };
      }
    } catch (eA) {}
    try {
      var eid = _eid();
      if (!eid) return { ok: false, erro: "sem empresa" };
      var reg = _registro();
      var conhecidos = {}, antes = _conhecidos(reg);
      Object.keys(antes).forEach(function (k) { conhecidos[k] = antes[k]; });
      var cat = CATALOGO[id];
      var nome = txtNome(d.nome) || (cat && cat.nome) || "Perfil da conta";
      var lista = mods && mods.length ? mods.slice() : (cat && cat.modulos ? cat.modulos.slice() : null);
      conhecidos[id] = { nome: nome, desc: (cat && cat.desc) || "", modulos: lista ? lista.slice() : null };
      /* o "completo" de onde ele está saindo também vira conhecido: a volta
         vale nos dois sentidos a partir daqui */
      Store.salvar(eid, ENT_PERFIL, {
        id: "perfil-impl", perfil: id, nome: nome,
        modulos: lista ? lista.slice() : null, conhecidos: conhecidos
      });
      try {
        var pr = Store.lerPrefs(eid) || {};
        pr.perfil = id;
        Store.salvarPrefs(eid, pr);
      } catch (eP) {}
      return { ok: true, perfil: atual() };
    } catch (e) {
      return { ok: false, erro: e.message || String(e) };
    }
  }
  function txtNome(s) { return typeof s === "string" ? s.trim() : ""; }

  /* Lê de um dump de backup o perfil que a conta tinha quando ele foi gerado.
     Puro: não toca em Store nem em Auth — dá para conferir antes de aplicar. */
  function doBackup(dump) {
    var d = dump || {};
    var lista = (d.gestao && Array.isArray(d.gestao[ENT_PERFIL])) ? d.gestao[ENT_PERFIL] : [];
    var reg = null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && String(lista[i].id || "") === "perfil-impl") { reg = lista[i]; break; }
    }
    if (!reg && lista.length) reg = lista[0];
    if (reg && typeof reg.perfil === "string" && reg.perfil) {
      return {
        perfil: reg.perfil, nome: txtNome(reg.nome),
        modulos: Array.isArray(reg.modulos) ? reg.modulos.slice() : null,
        em: txtNome(d.exportadoEm)
      };
    }
    /* ⚠ AS PREFS SOZINHAS NÃO SERVEM, e dizer isso é melhor que aplicar meio.
       O espelho nas prefs guarda só o id — sem a lista de módulos, restaurar
       por ele deixaria a conta apontando para um perfil que a máquina não sabe
       expandir, e a barra continuaria com tudo. */
    var pid = d.prefs && typeof d.prefs.perfil === "string" ? d.prefs.perfil : "";
    if (pid && pid !== "completo") {
      return { perfil: pid, nome: "", modulos: null, em: txtNome(d.exportadoEm), soPrefs: true };
    }
    return null;
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
    /* ⚠ O COMENTÁRIO DOS EXPORTS JÁ PROMETIA ISTO e o código não cumpria:
       "aplicar e semear recusam perfil não disponível na conta" — mas `semear`
       ia direto ao catálogo, sem gate nenhum. Na instalação do cliente o
       catálogo não existe e a promessa se cumpria por acidente; numa máquina
       que o tem, `semear("<outro-id>")` gravava os NÚMEROS do outro cliente.
       O único chamador passa `Perfis.idAtual()`, que é sempre visível. */
    if (perfilId && !_visivel(perfilId)) {
      return { ok: false, erro: "Perfil não disponível nesta conta.", semeadas: [], puladas: [] };
    }
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
    /* ⚠ dentro de um namespace de PRÉVIA o perfil privado é visível, e isso não
       afrouxa nada: só se entra num namespace desses por `PreviewCli.entrar`,
       que por sua vez exige o catálogo privado presente na máquina. */
    try {
      if (typeof PreviewCli !== "undefined" && PreviewCli.ehPrevia(_eid())) return true;
    } catch (e) {}
    /* ⚠ e o perfil que ESTA conta já teve continua visível para ela mesma —
       senão a volta some da tela no instante em que ela é usada */
    if (_conhecidos()[id]) return true;
    return id === idAtual() || _reveladoNaURL(id);
  }

  /* Os perfis de CLIENTE que esta máquina conhece. Sem o catálogo privado a
     lista é vazia — e é esse o gate do botão de prévia: o segredo mora no
     arquivo ausente, não numa flag que dê para ligar. */
  function listarPrivados() {
    return Object.keys(CATALOGO).filter(function (id) {
      return CATALOGO[id] && CATALOGO[id].privado;
    }).map(function (id) {
      return { id: id, nome: CATALOGO[id].nome, desc: CATALOGO[id].desc };
    });
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
    var reg = _registro();
    var meu = reg.perfil;
    if (meu && meu !== "completo" && ids.indexOf(meu) < 0 && _perfilDe(meu)) ids.push(meu);
    /* ⚠ E OS QUE ELA JÁ TEVE. Sem esta linha, ir para "Completo" tirava da
       tela a única opção de voltar — o defeito que deixou um cliente com os
       34 módulos e sem caminho de retorno em 30/08/2026. */
    Object.keys(_conhecidos(reg)).forEach(function (id) {
      if (id !== "completo" && ids.indexOf(id) < 0 && _perfilDe(id)) ids.push(id);
    });
    return ids.map(function (id) {
      var p = _perfilDe(id) || CATALOGO.completo;
      return {
        id: id, nome: p.nome, desc: p.desc,
        /* o número na tela conta o mesmo que a barra mostra — inclusive o
           que veio a reboque, senão o rótulo diz 19 e o cliente vê 20 */
        qtd: p.modulos ? contar(p.modulos) : null,
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
    /* a tabela de dependencia, para o gate conferir que ela e verdade */
    REQUER: REQUER,
    /* a conta de "N modulos", uma so para tela e modal */
    contar: contar,
    registrarCatalogo: registrarCatalogo,
    idAtual: idAtual,
    atual: atual,
    modulosLiberados: modulosLiberados,
    permite: permite,
    aplicar: aplicar,
    /* recuperação de conta que perdeu o perfil antes de `conhecidos` existir */
    restaurar: restaurar,
    doBackup: doBackup,
    semear: semear,
    listar: listar,
    listarPrivados: listarPrivados,
    visivel: _visivel,
    conferir: conferir
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Perfis;

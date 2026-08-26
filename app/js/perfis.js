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
 *   um binário por cliente: o pacote da New Form deixaria de receber as
 *   correções do produto, e cada release viraria N empacotamentos. Aqui o
 *   perfil é DADO — viaja nas prefs, junto do logo e do white-label, e o
 *   mesmo executável serve todo mundo.
 *
 * ⚠ POR QUE NÃO É `if (cliente === "newform")` ESPALHADO. Condicional por
 *   nome de cliente no meio da regra de negócio é o começo do fork
 *   disfarçado: em seis meses ninguém sabe quais telas têm desvio. O perfil
 *   só decide O QUE APARECE. Regra de negócio específica, quando vier, entra
 *   como módulo próprio ligado por configuração — igual às irmãs do
 *   servidor (composicoes, fotos-srv, titular-srv).
 *
 * ⚠ ELE VALE PARA O DONO TAMBÉM. `Auth.podeModulo` liberava tudo para quem
 *   é admin antes de olhar qualquer lista. Se o perfil entrasse depois desse
 *   atalho, ele não valeria justamente para a pessoa que mais usa o sistema
 *   na New Form. O gancho fica ANTES — ver o comentário em auth.js.
 *
 * ⚠ ESTE ARQUIVO É O ÚNICO QUE PODE SABER O NOME DE UM CLIENTE. É a
 *   contrapartida da regra acima: como nenhuma regra de negócio pode
 *   perguntar "é a New Form?", alguém precisa carregar essa informação — e
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

  var CATALOGO = {
    completo: {
      nome: "Completo",
      desc: "Todos os módulos do OrçaPRO. É o padrão de quem compra o sistema.",
      modulos: null                       // null = sem restrição (menos o sob demanda)
    },

    /* NEW FORM CARPINTARIA — escopo do PDF "Escopo de Adaptação do Sistema"
       (18/08/2026) mais as duas rodadas de respostas do cliente. Cada id
       abaixo responde a um item do escopo; o que não está na lista fica
       oculto, não apagado.

       ⚠ `orcamentos` FORA DA LISTA É DECISÃO, NÃO ESQUECIMENTO. Uma
       carpintaria sem módulo de orçamento parece erro de configuração, e a
       tentação de "consertar" religando é grande. Não religue.
       A New Form ORÇA — só que do jeito dela: espécie de madeira × aplicação
       × dimensão (item 1) mais mão de obra por m² por tipo de serviço
       (item 2). O módulo `orcamentos` do OrçaPRO é a planilha SINAPI de obra
       pesada, com BDI do TCU, curva ABC e composição analítica; para quem
       vende deck e forro isso é atrito puro, e foi exatamente o que eles
       pediram para tirar ("reduzir funcionalidades genéricas do
       sistema-base", confirmado pelo Rogério em 18/08).
       O orçamento deles é o módulo `carpintaria`, aqui embaixo — não uma
       variação do módulo SINAPI.
       ⚠ Há teste que reprova se `orcamentos` voltar: tools/test-perfis.js. */
    newform: {
      /* ⚠ PRIVADO — O NOME DE UM CLIENTE NÃO APARECE NA CONTA DOS OUTROS.
         `listar()` alimenta um bloco de rádio em ⚙ Empresa que TODO dono de
         conta enxerga, e a vitrine pública monta um usuário sem `papel` — ou
         seja, `ehAdmin()` responde true e o bloco desenha numa página aberta na
         internet. Sem esta marca, "New Form — Carpintaria" e o resumo da
         operação deles iam para dentro da instalação de todos os clientes e
         para qualquer visitante. E um clique curioso ainda semearia os
         NÚMEROS deles (corte de 65 m², +50%, R$ 5,31/m²) na base de quem
         clicou. Perfil de cliente é material do cliente. */
      privado: true,
      nome: "New Form — Carpintaria",
      desc: "Deck, forro, ripado e caibro: orçamento próprio, diário, remuneração por m², almoxarifado e financeiro.",
      modulos: [
        "clientes",       // pré-requisito dos itens 6 e 7 (obra tem dono)
        "obras",          // item 7 — o Portal do Cliente é publicado a partir da obra
        "carpintaria",    // itens 1 e 2 — madeiras por fornecedor + mão de obra por m²
        "rdo",            // item 6 — diário (já grava impedimentos)
        "producao",       // item 4 — m² por serviço e por pessoa, base da parte variável
        "remunvar",       // item 4 — a conta da parte variável (R$/m², 50% obra / 50% individual)
        "colaboradores",  // item 4 — cadastro de quem recebe
        "folhasemanal",   // ⚠ NÃO ESTAVA NO ESCOPO — ver a nota abaixo
        "folha",          // item 4 — a parte FIXA: piso da categoria, encargos e recibo
        "insumos",        // item 1 — cadastro de materiais que não são madeira
        "fornecedores",   // item 3 — cadastro do parceiro (o portal dele vem na Fase 3)
        "financeiro",     // item 5 — mantém a estrutura existente
        /* ⚠ ALMOXARIFADO NÃO ESTAVA NO PDF. Apareceu na resposta de 18/08:
           "quando for compra de ferramentas seria bom ter um almoxarifado".
           Não é módulo novo — o `estoque` já faz isso; foi só religar. */
        "estoque",
        /* F1 (25/08): "ferramenta que dura fica registrada como PATRIMÔNIO".
           Estava faltando — o perfil tinha só o `estoque`. */
        "patrimonio",
        /* ⚠ GALERIA FICA, E ISSO É RESPOSTA DO CLIENTE. Em G2 oferecemos
           ocultar três módulos; ele marcou dois (orçamento tradicional e
           Medições) e deixou a Galeria sem marca. Caixa oferecida e não
           marcada é "não". O perfil escondia a Galeria por engano desde a
           Fase 0 — corrigido aqui. */
        "galeria"
      ],

      /* ⚠ SÃO DUAS FOLHAS, E ELAS FAZEM COISAS DIFERENTES — deixar uma de fora
         foi erro meu, corrigido aqui:
           `folhasemanal`  onde a parte VARIÁVEL vira pagamento. O `remunvar`
                           grava `fs_lancamentos`, e é ali que sai a lista de
                           PIX e o fechamento por obra. Sem ela o módulo
                           calcularia o valor e não teria para onde mandar.
           `folha`         a parte FIXA, mensal, com competência, encargos e
                           RECIBO. Os 6 da New Form são CLT com piso da
                           categoria (item 4); `folhasemanal` é de diarista e
                           não atende a isso.
         ⚠ Nenhuma das duas saiu de resposta escrita do cliente — as duas estão
           anotadas em clientes/newform-implantacao.md para confirmação.
         ⚠ O VALE DE R$ 480 NÃO TEM CAMPO em nenhuma das duas: o formulário da
           folha tem salário base, encargos, horas extras e descontos. Como o
           cliente disse que ele é "valor fixo mensal, fora do cálculo" (C4),
           hoje ele fica guardado só no parâmetro do `remunvar`, sem virar
           linha de pagamento. É a lacuna conhecida deste item. */

      /* =================================================================
       * SEMENTE — os números que a New Form respondeu
       *
       * ⚠ ELES MORAM AQUI E EM MAIS NENHUM LUGAR. Os motores (carpintaria.js,
       *   remunvar.js) nascem VAZIOS de propósito: 65 m² e +50% são a regra
       *   DESTA carpintaria, e a próxima terá outra. Um default plausível
       *   dentro do motor viraria proposta errada no cliente seguinte, calada.
       *
       * ⚠ A SEMENTE NÃO VAI PARA AS PREFS. Prefs sincronizam com
       *   `Object.assign({}, nuvem, local)` — o aparelho LOCAL vence campo a
       *   campo —, e já houve o defeito de preço de produção morando lá e
       *   voltando ao valor velho depois do sync. Número que vira dinheiro é
       *   ENTIDADE, com `atualizadoEm`, que é o que o merge compara.
       *
       * Fonte de cada valor: clientes/newform-decisoes.md (2ª rodada, 25/08).
       * ================================================================= */
      semente: {
        carp_param: {
          id: "carp-param",
          corteM2: 65,                     // 1ª rodada
          acrescimoAbaixoPct: 50,          // 1ª rodada
          incideAcrescimo: "mo",           // B1 — "só a mão de obra"
          incideDetalhe: "mo",             // B3 — "só a mão de obra"
          composicaoAcrescimos: "somado",  // ⚠ não respondido — ver carpintaria.js, regra 6
          validadeDias: 30,                // 1ª rodada
          unidadeMO: "m2",
          detalhes: [                      // B2
            { id: "degrau", nome: "Degrau", pct: 8.3 },
            { id: "curva", nome: "Curva", pct: 50 },
            { id: "iluminacao", nome: "Iluminação embutida", pct: 6.1 }
          ]
        },
        remun_param: {
          id: "remun-param",
          porM2: 5.31,                     // C1
          rateioEquipePct: 50,             // 1ª rodada — o resto é individual
          equipe: "obra",                  // C2 — "todos os colaboradores daquela obra"
          periodicidade: "mensal",         // C6
          exigeDoisNiveis: true,           // D1 — encarregado e depois a gestão
          valeAlimentacao: 480,            // C4 — fixo mensal, FORA do cálculo
          /* ⚠ piso da categoria: C3 escolheu "eu atualizo quando o sindicato
             muda" e deixou o VALOR em branco. Não se inventa piso. */
          pisoCategoria: null
        },
        /* O cliente decidiu DUAS vezes que o cliente final dele não vê a
           metragem produzida (1ª rodada) nem nome de colaborador (G1). Isto é
           o padrão da empresa: a obra que ainda não decidiu herda daqui, e a
           republicação automática — que não passa por tela nenhuma — respeita.
           Sem isso, obra criada depois da implantação sairia expondo os dois. */
        portal_padrao: {
          id: "portal-padrao",
          portalSemMetragem: true,
          portalSemNomes: true
        }
      }
    }
  };

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

  /* id do perfil gravado, ou "completo". */
  function idAtual() {
    var id = _registro().perfil;
    return (typeof id === "string" && CATALOGO[id]) ? id : "completo";
  }

  function atual() {
    var p = CATALOGO[idAtual()];
    return { id: idAtual(), nome: p.nome, desc: p.desc, modulos: p.modulos };
  }

  /* Lista efetiva de módulos liberados — núcleo incluído. `null` = todos
     os do produto (o sob demanda continua de fora). */
  function modulosLiberados() {
    var p = CATALOGO[idAtual()];
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
    try {
      var eid = _eid();
      if (!eid) return { ok: false, erro: "sem empresa" };
      Store.salvar(eid, ENT_PERFIL, { id: "perfil-impl", perfil: perfilId });
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
    return Object.keys(CATALOGO).filter(_visivel).map(function (id) {
      var p = CATALOGO[id];
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

  return {
    NUCLEO: NUCLEO,
    SOB_DEMANDA: SOB_DEMANDA,
    CATALOGO: CATALOGO,
    idAtual: idAtual,
    atual: atual,
    modulosLiberados: modulosLiberados,
    permite: permite,
    aplicar: aplicar,
    semente: semente,
    semear: semear,
    listar: listar,
    visivel: _visivel,
    conferir: conferir
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Perfis;

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
 * =================================================================== */
var Perfis = (function () {
  "use strict";

  /* ⚠ NÚCLEO NUNCA SOME, e isso é trava de segurança, não comodidade.
     Sem `usuarios` o dono não consegue cadastrar a própria equipe; sem
     `ajuda`/`relatos` ele não consegue pedir socorro quando algo trava; sem
     `dashboard` a tela inicial fica vazia. Um perfil mal preenchido não pode
     trancar o cliente para fora da própria conta. */
  var NUCLEO = ["dashboard", "ajuda", "relatos", "usuarios"];

  var CATALOGO = {
    completo: {
      nome: "Completo",
      desc: "Todos os módulos do OrçaPRO. É o padrão de quem compra o sistema.",
      modulos: null                       // null = sem restrição
    },

    /* NEW FORM CARPINTARIA — escopo do PDF "Escopo de Adaptação do Sistema",
       recebido em 18/08/2026. Cada id abaixo responde a um item do escopo; o
       que não está na lista fica oculto, não apagado.

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
       O orçamento deles nasce das Fases 1 e 2 como tela própria, alimentada
       pelas tabelas acima — não como variação do módulo SINAPI. */
    newform: {
      nome: "New Form — Carpintaria",
      desc: "Deck, forro, ripado e caibro: materiais, mão de obra, diário e financeiro.",
      modulos: [
        "clientes",       // pré-requisito dos itens 6 e 7 (obra tem dono)
        "obras",          // item 7 — o Portal do Cliente é publicado a partir da obra
        "rdo",            // item 6 — diário do encarregado (já grava impedimentos)
        "producao",       // item 4 — m² por serviço, é o que alimenta a parte variável
        "insumos",        // item 1 — cadastro de madeiras
        "fornecedores",   // item 3 — cadastro do parceiro (o portal dele vem na Fase 3)
        "colaboradores",  // item 4 — remuneração híbrida
        "financeiro",     // item 5 — mantém a estrutura existente
        /* ⚠ ALMOXARIFADO NÃO ESTAVA NO PDF. Apareceu na resposta de 18/08:
           "quando for compra de ferramentas seria bom ter um almoxarifado".
           Não é módulo novo — o `estoque` já faz isso; foi só religar.
           Ver clientes/newform-decisoes.md, item 5. */
        "estoque"
      ]
    }
  };

  function _prefs() {
    try {
      if (typeof Store === "undefined" || typeof Auth === "undefined") return {};
      return Store.lerPrefs(Auth.empresaId()) || {};
    } catch (e) { return {}; }
  }

  /* id do perfil gravado, ou "completo". */
  function idAtual() {
    var id = _prefs().perfil;
    return (typeof id === "string" && CATALOGO[id]) ? id : "completo";
  }

  function atual() {
    var p = CATALOGO[idAtual()];
    return { id: idAtual(), nome: p.nome, desc: p.desc, modulos: p.modulos };
  }

  /* Lista efetiva de módulos liberados — núcleo incluído. `null` = todos. */
  function modulosLiberados() {
    var p = CATALOGO[idAtual()];
    if (!p || !p.modulos) return null;
    var fora = p.modulos.filter(function (id) { return NUCLEO.indexOf(id) < 0; });
    return NUCLEO.concat(fora);
  }

  /* A pergunta que o Auth faz. Em qualquer dúvida, LIBERA:
     esconder módulo por engano é pior que mostrar um a mais — quem apanha
     é o cliente, na frente da equipe dele, sem saber o que aconteceu. */
  function permite(id) {
    try {
      var libs = modulosLiberados();
      if (!libs) return true;                    // perfil completo
      return libs.indexOf(String(id)) > -1;
    } catch (e) { return true; }
  }

  /* Troca o perfil da empresa. Não mexe em dado de módulo nenhum. */
  function aplicar(perfilId) {
    if (!CATALOGO[perfilId]) return { ok: false, erro: "Perfil desconhecido: " + perfilId };
    try {
      var p = _prefs();
      p.perfil = perfilId;
      Store.salvarPrefs(Auth.empresaId(), p);
      return { ok: true, perfil: atual() };
    } catch (e) {
      return { ok: false, erro: e.message || String(e) };
    }
  }

  /* Para telas de escolha: [{id, nome, desc, qtd}] */
  function listar() {
    return Object.keys(CATALOGO).map(function (id) {
      var p = CATALOGO[id];
      return {
        id: id, nome: p.nome, desc: p.desc,
        qtd: p.modulos ? NUCLEO.concat(p.modulos.filter(function (m) { return NUCLEO.indexOf(m) < 0; })).length : null,
        atual: id === idAtual()
      };
    });
  }

  return {
    NUCLEO: NUCLEO,
    CATALOGO: CATALOGO,
    idAtual: idAtual,
    atual: atual,
    modulosLiberados: modulosLiberados,
    permite: permite,
    aplicar: aplicar,
    listar: listar
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Perfis;

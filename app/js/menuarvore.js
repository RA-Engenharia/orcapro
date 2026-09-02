/* =====================================================================
 * menuarvore.js — O MENU EM DOIS NÍVEIS
 *
 * POR QUE ESTE ARQUIVO EXISTE (01/09/2026)
 * A barra tinha 37 itens em lista plana e media 2.169 px de altura numa tela
 * de 1.000: rolava duas telas e meia. Em módulo de pouco conteúdo, o menu era
 * o objeto mais pesado da página. Medido, não achado.
 *
 * E não era falta de mecanismo: já existiam menu enxuto (fixar favoritos),
 * recentes, modo foco e busca. O que faltava era HIERARQUIA — seis módulos
 * que são um fluxo só (Insumos → Requisição → Cotação → Compra → Fornecedor
 * → Estoque) ocupavam seis linhas do mesmo nível que "Painel".
 *
 * ⚠ RECOLHER NÃO É ESCONDER. A regra do menu enxuto continua valendo: nada
 * sai do sistema sem o cliente mandar. Grupo fechado é um clique de distância
 * e continua na busca (Ctrl+K); grupo do módulo aberto nasce expandido, para
 * a pessoa nunca perder a referência de onde está.
 *
 * Motor puro de propósito: recebe a lista de módulos e devolve a árvore, sem
 * tocar em DOM. A tela (js/gestao.js `renderSidebar`) só desenha o que sai
 * daqui — nesta base já passou no gate um recurso inteiro cujo motor estava
 * certo e cuja fiação não existia.
 * ===================================================================== */
(function (global) {
  "use strict";

  function texto(s) { return String(s == null ? "" : s); }

  /* O rótulo dentro do grupo pode ser mais curto que o nome do módulo: com o
     grupo "Equipe" na frente, "Ponto / Folha" vira "Ponto" e para de quebrar
     em duas linhas. ⚠ O `nome` NÃO muda — é ele que a busca (Ctrl+K) mostra,
     e lá não há grupo nenhum dando contexto. */
  function rotulo(m) { return texto((m && (m.curto || m.nome)) || ""); }

  /* --------------------------------------------------------------------
   * montar(modulos, grupos, opc) -> lista de nós, na ordem da barra
   *
   *   nó item : { tipo:"item",  mod }
   *   nó grupo: { tipo:"grupo", id, nome, aberto, temAtivo, filhos:[mod] }
   *
   * opc: { ativo, abertos:{id:true} }
   *
   * ⚠ NAO trata "menu enxuto" (fixados). Quem organizou o menu a mao segue
   * no caminho antigo -- lista plana + "Mais modulos" --, que tem suite
   * propria (e2e-menu-enxuto) protegendo seis comportamentos. Dois jeitos de
   * recolher a mesma barra brigariam, e a arvore existe para quem NAO
   * organizou nada: era esse menu que tinha 37 itens.
   * ------------------------------------------------------------------ */
  function montar(modulos, grupos, opc) {
    modulos = modulos || []; grupos = grupos || {}; opc = opc || {};
    var ativo = texto(opc.ativo);
    var abertos = opc.abertos || {};
    var nos = [], porGrupo = {}, ordemGrupo = [];

    modulos.forEach(function (m) {
      if (!m) return;
      var g = texto(m.g);
      if (!g || !grupos[g]) { nos.push({ tipo: "item", mod: m }); return; }
      if (!porGrupo[g]) { porGrupo[g] = []; ordemGrupo.push(g); nos.push({ tipo: "grupo", id: g }); }
      porGrupo[g].push(m);
    });

    /* segunda passada: agora que os filhos existem, o grupo se resolve */
    var saida = [];
    nos.forEach(function (n) {
      if (n.tipo === "item") { saida.push(n); return; }
      var filhos = porGrupo[n.id] || [];
      /* ⚠ GRUPO DE UM FILHO SÓ NÃO É GRUPO. Ele custaria uma linha de
         cabeçalho e um clique para revelar um item — mais navegação, não
         menos. Vira item direto. */
      if (filhos.length === 1) { saida.push({ tipo: "item", mod: filhos[0] }); return; }
      var temAtivo = false;
      filhos.forEach(function (f) { if (f.id === ativo) temAtivo = true; });
      saida.push({
        tipo: "grupo", id: n.id, nome: texto(grupos[n.id]),
        filhos: filhos, temAtivo: temAtivo,
        /* o grupo do módulo aberto SEMPRE expande, mesmo que o cliente o
           tenha fechado: sem isso a barra não mostra onde a pessoa está */
        aberto: temAtivo || abertos[n.id] === true
      });
    });

    return saida;
  }

  /* Quantas LINHAS a barra desenha. É a medida que interessa — foi o número
     que mostrou o problema (37 linhas, 2.169 px) e é o que prova a correção. */
  function linhas(arvore) {
    var n = 0;
    (arvore || []).forEach(function (no) {
      if (no.tipo === "sep") return;
      if (no.tipo === "item") { n++; return; }
      n += 1 + (no.aberto ? no.filhos.length : 0);
    });
    return n;
  }

  /* Alterna um grupo. Devolve o mapa novo — quem grava é a tela, porque a
     preferência é de aparelho (a mesma regra do menu enxuto: cada um
     organiza o seu sem reescrever o do colega pela nuvem). */
  function alternar(abertos, id) {
    var novo = {};
    for (var k in (abertos || {})) { if (Object.prototype.hasOwnProperty.call(abertos, k)) novo[k] = abertos[k]; }
    novo[id] = !novo[id];
    return novo;
  }

  /* Em que grupo mora um módulo (para abrir o grupo certo ao navegar por
     busca ou deep link, sem depender de clique na barra). */
  function grupoDe(modulos, id) {
    var achado = "";
    (modulos || []).forEach(function (m) { if (m && m.id === id) achado = texto(m.g); });
    return achado;
  }

  var MenuArvore = {
    montar: montar, linhas: linhas, alternar: alternar,
    grupoDe: grupoDe, rotulo: rotulo
  };
  global.MenuArvore = MenuArvore;
  if (typeof module !== "undefined" && module.exports) module.exports = MenuArvore;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

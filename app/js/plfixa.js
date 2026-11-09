/* =====================================================================
 * plfixa.js — Planilha com cabeçalho e TOTAL GERAL sempre à vista
 *
 * Pedido do Rogério (08/11/2026): ao rolar a planilha com o mouse "sobe tudo";
 * para ver o total tinha de ir lá embaixo, e no meio de 461 itens ninguém sabia
 * o que era cada coluna. Abas, botões, títulos das colunas e o TOTAL GERAL têm
 * de ficar parados; só as linhas andam.
 *
 * ⚠ POR QUE A ROLAGEM MORA NO .pl-tabela, e não no #main com sticky. A tabela
 * precisa rolar de lado (com as colunas extras ela passa da tela), e um elemento
 * com overflow-x vira a caixa de rolagem dos dois eixos: o `sticky` do <th> gruda
 * nele, nunca no #main. Era por isso que o `position: sticky` que o <th> sempre
 * teve nunca funcionou nesta tela. Rolar tudo no #main obrigaria a prender abas
 * e botões também na horizontal e a medir a altura de cada faixa. Assim, a altura
 * sobra para a caixa da tabela (flex, css/app.css) e o navegador faz o resto.
 *
 * O que sobra de trabalho, e mora aqui:
 *  1. o resumo do topo (título, KPIs) recolhe ao rolar e volta ao chegar no topo,
 *     senão ele comeria metade da altura o tempo todo;
 *  2. a roda do mouse sobre as abas e os botões também rola a tabela (o #main
 *     não tem mais o que rolar, e a roda "morta" pareceria defeito);
 *  3. o `main.innerHTML` do App.render troca o .pl-tabela, e com ele iria embora
 *     a posição. Antes o #main sobrevivia e guardava a rolagem sozinho.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* folga para um toque de leve na roda não sumir com o resumo */
  var TOPO_RECOLHE = 8;
  /* sem sobra depois de recolher, não recolhe: ver decidir() */
  var SOBRA_MINIMA = 40;

  var PlFixa = {
    /* Motor puro: o resumo do topo deve estar recolhido?
       m = { recolhido, top, max, altCab }  (px; max = scrollHeight - clientHeight)
       ⚠ A CONDIÇÃO DO `max` IMPEDE A TELA DE PISCAR. Recolher o resumo aumenta a
       caixa da tabela em `altCab` e diminui o `max` na mesma medida. Numa tabela
       que passa pouco da altura, o navegador cortaria o `top` para 0 logo depois de
       recolher e o resumo voltaria: abre e fecha a cada giro da roda, e a tabela
       nunca anda. Por isso só recolhe se ainda sobrar rolagem depois de recolher.
       ⚠ E SÓ REABRE NO TOPO: com o resumo recolhido, top <= 1 é a porta de volta.
       Toda trava precisa de porta (CLAUDE.md §3); a tela não pode ficar sem os
       botões do cabeçalho numa tabela que já não rola. */
    decidir: function (m) {
      if (m.recolhido) return m.top > 1;
      return m.top > TOPO_RECOLHE && m.max > m.altCab + SOBRA_MINIMA;
    },

    /* Motor puro: esta tabela fica melhor rolando na tela inteira?
       ⚠ ORÇAMENTO CURTO EM TELA BAIXA (revisão de 08/11/2026). Com pouca sobra o
       decidir() não deixa o resumo recolher, para não piscar, e a caixa da tabela
       ficaria para sempre do tamanho que sobra debaixo dele: no notebook, duas linhas
       à vista de uma tabela que quase caberia na tela. Tabela assim não precisa de
       nada fixo, chega-se ao total com um giro: volta a rolar no #main, como sempre.
       `max` 0 é tabela que cabe: nada rola, e o modo fixo não atrapalha. */
    caixaCurta: function (m) { return m.max > 0 && m.max <= m.altCab + SOBRA_MINIMA; },

    /* Motor puro: a roda em px. Mouse de "linhas" (deltaMode 1) e de "páginas"
       (deltaMode 2) mandam 3 e 1, não 100: sem converter, a roda quase não anda. */
    deltaPx: function (delta, modo, alturaPagina) {
      var d = Number(delta) || 0;
      if (modo === 1) return d * 40;
      if (modo === 2) return d * (Number(alturaPagina) || 600);
      return d;
    },

    /* ---------- fiação fina ---------- */
    _estado: null,  /* { orcId, top, left, rec } da última Planilha desenhada */
    _orcId: null,
    _esquecerPos: false,

    /* O próximo desenho começa do topo. ⚠ É uma marca, e não `_estado = null`: o
       topo do render ainda vai ler a caixa atual e guardaria a posição de novo.
       Quem chama: abrir um orçamento (voltar a ele não pode abrir no item 400, sem
       os botões do cabeçalho) e filtrar uma etapa (mostraria o fim dela). */
    esquecerPosicao: function () { this._esquecerPos = true; },

    _caixa: function (main) { return main && main.querySelector ? main.querySelector("#aba-conteudo .pl-tabela") : null; },

    /* Topo do App.render, ANTES de o #main ser trocado: guarda a posição e tira as
       classes. Tirar aqui cobre login, Gestão, lista e qualquer ramo que nasça
       depois (o mesmo raciocínio da classe foco-crono). */
    antes: function (main) {
      if (!main || !main.classList) return;
      var pl = this._caixa(main);
      if (this._esquecerPos) { this._esquecerPos = false; this._estado = null; }
      else if (pl && main.classList.contains("pl-fixa")) {
        this._estado = { orcId: this._orcId, top: pl.scrollTop, left: pl.scrollLeft, rec: main.classList.contains("pl-cab-rec") };
      }
      main.classList.remove("pl-fixa");
      main.classList.remove("pl-cab-rec");
    },

    /* Depois do main.innerHTML do editor. Liga só se há tabela: planilha vazia e
       as outras abas continuam rolando no #main, como sempre. */
    depois: function (main, orcId) {
      var pl = this._caixa(main);
      if (!pl) return;
      this._ligar(main);
      main.classList.add("pl-fixa");
      this._orcId = orcId;
      this._restaurar(main, pl, orcId);
      this._ajustar(main, pl);
    },

    /* Refaz as medidas sem redesenhar: janela mudou de tamanho, etapa recolhida. */
    reavaliar: function (main) {
      var pl = this._caixa(main);
      if (pl) this._ajustar(main, pl);
    },

    _restaurar: function (main, pl, orcId) {
      var e = this._estado;
      if (!e || e.orcId !== orcId) { this._estado = null; return; }
      /* ⚠ A CLASSE VEM ANTES DA POSIÇÃO: com o resumo aberto a caixa é menor e o
         topo restaurado cairia em outro lugar. */
      if (e.rec) main.classList.add("pl-cab-rec");
      pl.scrollLeft = e.left;
      pl.scrollTop = e.top;
      /* ⚠ LER DE VOLTA, e não confiar no que se pediu. Filtrar uma etapa encurta a
         tabela: o scrollTop pedido cai para 0 num elemento que já estava em 0, sem
         evento de rolagem nenhum, e a tela ficaria sem o resumo e sem como trazê-lo. */
      if (pl.scrollTop <= 1) main.classList.remove("pl-cab-rec");
    },

    _ajustar: function (main, pl) {
      /* com o resumo recolhido a altura dele é 0 e a conta não valeria: a volta ao
         topo reabre o resumo e passa por aqui de novo (ver o ouvinte de rolagem) */
      if (!main.classList.contains("pl-cab-rec")) {
        main.classList.add("pl-fixa");
        if (this.caixaCurta({ max: pl.scrollHeight - pl.clientHeight, altCab: this._altCab(main) })) main.classList.remove("pl-fixa");
      }
      this._medirBarra(main);
      this._medirFolgas(pl);
    },

    /* ⚠ O FOCO NÃO PODE PARAR DEBAIXO DO QUE ESTÁ FIXO. Tab entre células rola a
       caixa até a célula, e o navegador só desconta o que o scroll-padding manda.
       Medido porque varia: com o BDI sobre o preço final o total tem 3 linhas, e os
       títulos podem quebrar em 2 com as colunas extras. Valor fixo deixava a pessoa
       digitando às cegas embaixo do total. */
    _medirFolgas: function (pl) {
      var th = pl.querySelector("thead"), tf = pl.querySelector("tfoot");
      if (!th || !tf) return;
      pl.style.scrollPaddingTop = (th.offsetHeight + 6) + "px";
      pl.style.scrollPaddingBottom = (tf.offsetHeight + 6) + "px";
    },

    /* ⚠ MEDIR, e não presumir uma largura. Em janela estreita a barra de cima quebra
       em duas linhas e passa para dentro do #main (91 px de conteúdo numa faixa de
       58). Com o resumo recolhido as abas ficam paradas bem ali, e a etiqueta da conta
       cobria a aba Planilha o tempo todo. O ponto da quebra depende do que está na
       barra (nome da conta, "Instalar app"): um limite fixo de 1100 px errou já em
       1101 (seção 6b da e2e-planilha-fixa). */
    _medirBarra: function (main) {
      var tp = global.document && global.document.getElementById("topbar");
      /* ⚠ Pelos filhos, e não por `scrollHeight`: ele conta o menu da conta aberto
         (absoluto, centenas de px), e redimensionar a janela com o menu aberto jogava
         as abas para o meio da tela até o redesenho seguinte. */
      var invade = 0;
      if (tp) {
        var fundo = tp.getBoundingClientRect().bottom;
        for (var i = 0; i < tp.children.length; i++) {
          invade = Math.max(invade, Math.round(tp.children[i].getBoundingClientRect().bottom - fundo));
        }
      }
      main.style.setProperty("--pl-invade", invade + "px");
    },

    /* Só a altura que sairia da tela ao recolher: mod-cab + orc-cab + faixa-ajustes */
    _altCab: function (main) {
      var soma = 0, kids = main.querySelectorAll(":scope > .mod-cab, :scope > .orc-cab, #aba-conteudo > .faixa-ajustes");
      for (var i = 0; i < kids.length; i++) {
        var cs = global.getComputedStyle(kids[i]);
        soma += kids[i].offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      }
      return soma;
    },

    /* ⚠ Uma vez só por #main (ele sobrevive aos renders; o que está dentro, não).
       Ouvir o #main e não o .pl-tabela é o que dispensa religar a cada render: a
       rolagem não borbulha, mas passa pela captura. */
    _ligar: function (main) {
      if (main._plFixaLigado) return;
      main._plFixaLigado = true;
      var self = this;
      /* um quadro por vez: arrastar a borda da janela dispara dezenas de eventos, e
         cada medida força o layout da tabela inteira */
      var agendado = false;
      global.addEventListener("resize", function () {
        if (agendado) return;
        agendado = true;
        global.requestAnimationFrame(function () { agendado = false; self.reavaliar(main); });
      });
      main.addEventListener("scroll", function (ev) {
        var pl = ev.target;
        if (!pl || !pl.classList || !pl.classList.contains("pl-tabela") || !main.classList.contains("pl-fixa")) return;
        var rec = main.classList.contains("pl-cab-rec");
        /* a altura do cabeçalho só importa para decidir recolher: não força layout
           a cada evento com o resumo já recolhido */
        var quer = self.decidir({ recolhido: rec, top: pl.scrollTop, max: pl.scrollHeight - pl.clientHeight, altCab: rec ? 0 : self._altCab(main) });
        if (quer !== rec) {
          main.classList.toggle("pl-cab-rec", quer);
          /* reabriu: pode ser que a tabela tenha encurtado enquanto estava recolhido */
          if (!quer) self._ajustar(main, pl);
        }
      }, true);
      main.addEventListener("wheel", function (ev) {
        if (!main.classList.contains("pl-fixa") || ev.ctrlKey) return;
        var pl = self._caixa(main);
        if (!pl || pl.contains(ev.target)) return;
        /* tela baixa, onde o #main ainda rola (min-height em css/app.css): deixa com ele */
        if (main.scrollHeight > main.clientHeight + 1) return;
        /* quem tem rolagem própria debaixo do mouse (índice de etapas, menu) fica com a roda */
        for (var n = ev.target; n && n !== main; n = n.parentNode) {
          if (n.nodeType === 1 && n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(global.getComputedStyle(n).overflowY)) return;
        }
        pl.scrollTop += self.deltaPx(ev.deltaY, ev.deltaMode, pl.clientHeight);
        pl.scrollLeft += self.deltaPx(ev.deltaX, ev.deltaMode, pl.clientWidth);
      }, { passive: true });
    }
  };

  global.PlFixa = PlFixa;
  if (typeof module !== "undefined" && module.exports) module.exports = PlFixa;
})(typeof window !== "undefined" ? window : this);

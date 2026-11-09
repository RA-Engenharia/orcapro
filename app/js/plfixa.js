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
 * teve nunca funcionou nesta tela. A altura sobra para a caixa da tabela (flex,
 * css/app.css) e o navegador faz o resto.
 *
 * ⚠ O RESUMO ANDA JUNTO COM A RODA, NÃO ABRE E FECHA (Rogério, 09/11/2026, na
 * 1.2.268). Havia dois estados, aberto e recolhido. Dois defeitos saíam disso:
 *  - ao subir, "do nada ele volta aquela tela todinha" no instante em que a tabela
 *    chegava ao topo, empurrando as primeiras linhas para baixo;
 *  - fora das linhas a roda morria: em janela baixa o #main tinha alguns px de
 *    sobra, a roda ficava com ele e a tabela não andava.
 * Agora é um movimento só, de `n` px (quanto do topo já saiu da tela):
 *  - DESCENDO: primeiro o resumo sobe, depois as linhas andam;
 *  - SUBINDO: primeiro as linhas voltam até a primeira, e PARA ALI. O resumo só
 *    volta se a pessoa parar e girar de novo, e volta na medida do giro.
 * Mexer só em `n` tira também o motivo de piscar: `n` nunca passa da sobra da
 * tabela, então recolher não corta a rolagem e nada oscila.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* folga para um toque de leve (barra arrastada, teclado) não mexer no resumo */
  var TOPO_RECOLHE = 8;
  /* girando sem parar, a roda não passa da primeira linha: só depois desta pausa */
  var PAUSA_TOPO = 350;
  /* a roda acabou de mexer: quem rolou foi ela, e não barra nem teclado */
  var RODA_RECENTE = 300;
  /* fração do que falta andar a cada quadro: a roda desliza em vez de saltar */
  var SUAVE = 0.35;

  var PlFixa = {
    /* Motor puro: até onde o topo pode sair. ⚠ `folga` (a sobra da tabela com o
       resumo inteiro aberto) é o teto: passar dela deixaria a tabela sem rolagem e
       o resumo fora da tela sem motivo, com um buraco de nada para rolar. */
    nMax: function (m) { return Math.max(0, Math.min(m.altCab, m.folga)); },

    /* Motor puro: reparte um giro entre o resumo (n) e as linhas (top).
       m = { delta, n, nMax, top, folga }  (px; folga = sobra com n = 0)
       ⚠ SUBINDO, UM PASSO NUNCA MEXE NOS DOIS. O que sobrar depois de chegar à
       primeira linha é descartado: era esse excesso, somado ao giro, que trazia o
       resumo inteiro de uma vez. */
    distribuir: function (m) {
      var d = Number(m.delta) || 0, n = m.n, top = m.top;
      if (d > 0) {
        var usa = Math.min(d, Math.max(0, m.nMax - n));
        n += usa;
        top = Math.min(top + (d - usa), Math.max(0, m.folga - n));
      } else if (d < 0) {
        if (top > 0) top = Math.max(0, top + d);
        else n = Math.max(0, n + d);
      }
      return { n: n, top: top };
    },

    /* Motor puro: a roda que veio subindo a tabela segura na primeira linha até a
       pessoa parar de girar. m = { delta, top, n, vinhaDaTabela, agora, ultima } */
    segurarNoTopo: function (m) {
      return m.delta < 0 && m.top <= 1 && m.n > 0 && !!m.vinhaDaTabela && (m.agora - m.ultima) < PAUSA_TOPO;
    },

    /* Motor puro: a roda em px. Mouse de "linhas" (deltaMode 1) e de "páginas"
       (deltaMode 2) mandam 3 e 1, não 100: sem converter, a roda quase não anda. */
    deltaPx: function (delta, modo, alturaPagina) {
      var d = Number(delta) || 0;
      if (modo === 1) return d * 40;
      if (modo === 2) return d * (Number(alturaPagina) || 600);
      return d;
    },

    /* ---------- fiação fina ---------- */
    _estado: null,  /* { orcId, top, left, n } da última Planilha desenhada */
    _orcId: null,
    _esquecerPos: false,
    _n: 0,          /* quanto do topo saiu da tela, em px */
    _med: null,     /* medidas do topo: ver _medir() */
    _resto: 0,      /* giro ainda por andar */
    _raf: 0,
    _ultima: 0,     /* quando foi o último evento da roda */
    _vinha: false,  /* a roda vinha subindo a tabela: ver segurarNoTopo() */

    /* O próximo desenho começa do topo. ⚠ É uma marca, e não `_estado = null`: o
       topo do render ainda vai ler a caixa atual e guardaria a posição de novo.
       Quem chama: abrir um orçamento (voltar a ele não pode abrir no item 400, sem
       os botões do cabeçalho) e filtrar uma etapa (mostraria o fim dela). */
    esquecerPosicao: function () { this._esquecerPos = true; },

    _caixa: function (main) { return main && main.querySelector ? main.querySelector("#aba-conteudo .pl-tabela") : null; },

    /* ⚠ Pelo layout de verdade, e não pela classe: `pl-fixa` continua no #main do
       celular, do impresso e da janela muito baixa, onde o CSS não aplica nada e a
       roda tem de continuar com o navegador. */
    _ativo: function (main) {
      return main.classList.contains("pl-fixa") && global.getComputedStyle(main).display === "flex";
    },

    /* Topo do App.render, ANTES de o #main ser trocado: guarda a posição e tira as
       classes. Tirar aqui cobre login, Gestão, lista e qualquer ramo que nasça
       depois (o mesmo raciocínio da classe foco-crono). */
    antes: function (main) {
      if (!main || !main.classList) return;
      var pl = this._caixa(main);
      if (this._esquecerPos) { this._esquecerPos = false; this._estado = null; }
      else if (pl && main.classList.contains("pl-fixa")) {
        this._estado = { orcId: this._orcId, top: pl.scrollTop, left: pl.scrollLeft, n: this._n };
      }
      this._n = 0; this._resto = 0; this._vinha = false; this._med = null; this._med1Aplicado = 0;
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
      this._porBotao(main);
      this._restaurar(main, pl, orcId);
    },

    /* Refaz as medidas sem redesenhar: janela mudou de tamanho, etapa recolhida. */
    reavaliar: function (main) {
      var pl = this._caixa(main);
      if (pl) this._ajustar(main, pl, this._n);
    },

    _restaurar: function (main, pl, orcId) {
      var e = this._estado;
      if (!e || e.orcId !== orcId) e = null;
      this._estado = null;
      /* ⚠ O `n` VEM ANTES DA POSIÇÃO: com o resumo aberto a caixa é menor e o topo
         restaurado cairia em outro lugar. */
      this._ajustar(main, pl, e ? e.n : 0);
      if (e) {
        /* ⚠ Devolver a posição dispara o ouvinte de rolagem, que tomaria isso por barra
           arrastada: quem clicou em "Mostrar resumo" e editou uma célula perderia o
           resumo a cada redesenho. */
        this._ultima = Date.now();
        pl.scrollLeft = e.left;
        pl.scrollTop = e.top;
      }
    },

    /* Mede e aplica. `n` nunca passa do que a tabela de agora permite: etapa
       recolhida ou janela maior encurtam a sobra, e o resumo volta na medida. */
    _ajustar: function (main, pl, n) {
      if (!this._ativo(main)) { this._aplicarN(main, 0); return; }
      this._medirBarra(main);
      this._medir(main);
      this._aplicarN(main, Math.min(n, this.nMax({ altCab: this._altCab(), folga: this._folga(pl) })));
      this._medirFolgas(pl);
    },

    _altCab: function () { var m = this._med; return m ? m.n1Max + m.n2Max : 0; },
    /* A sobra da tabela com o resumo inteiro aberto: não muda quando `n` muda.
       ⚠ PELA ALTURA DA TABELA quando ela cabe: `scrollHeight` nunca é menor que a
       caixa, e a sobra daria exatamente `n`. Com a janela maior ou as etapas
       recolhidas, o resumo ficaria preso fora da tela numa tabela que já não rola. */
    _folga: function (pl) {
      var t = pl.querySelector("table");
      var alto = pl.scrollHeight > pl.clientHeight || !t ? pl.scrollHeight : t.offsetHeight;
      return alto - pl.clientHeight + this._n;
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
       58). Com o resumo fora da tela as abas ficam paradas bem ali, e a etiqueta da
       conta cobria a aba Planilha o tempo todo. O ponto da quebra depende do que está
       na barra (nome da conta, "Instalar app"): um limite fixo de 1100 px errou já em
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
      this._invade = invade;
      main.style.setProperty("--pl-invade", invade + "px");
    },

    /* O que sai da tela, em dois trechos: tudo o que está acima das abas (n1) e a
       faixa de ajustes, que mora entre as abas e os botões (n2). As abas e os botões
       nunca saem. Medido com a tela como estiver: o `n` aplicado é somado de volta. */
    _medir: function (main) {
      this._med = null;
      var abas = main.querySelector(":scope > .tabs");
      if (!abas) return;
      var grupo = [], k = main.firstElementChild;
      for (; k && k !== abas; k = k.nextElementSibling) { if (k.offsetHeight > 0) grupo.push(k); }
      var pad = parseFloat(global.getComputedStyle(main).paddingTop) || 0;
      var topoConteudo = main.getBoundingClientRect().top + main.clientTop + pad;
      var n1Atual = this._med1Aplicado || 0;
      var dist = abas.getBoundingClientRect().top - topoConteudo + n1Atual;
      /* as abas sobem até 10 px da barra de cima (ou do que invadir), e não param no respiro de 28 */
      var respiro = Math.max(0, pad - 10 - (this._invade || 0));
      var faixa = main.querySelector("#aba-conteudo > .faixa-ajustes");
      var prox = faixa && faixa.nextElementSibling;
      this._med = {
        grupo: grupo,
        n1Max: grupo.length ? Math.max(0, dist + respiro) : 0,
        faixa: faixa,
        n2Max: faixa && prox ? Math.max(0, prox.getBoundingClientRect().top - faixa.getBoundingClientRect().top) : 0
      };
    },

    _empurra: function (el, d) {
      if (!el) return;
      if (d > 0) {
        /* a margem própria é lida uma vez, antes de o CSS trocá-la (.pl-mv) */
        if (el._plBase === undefined) el._plBase = parseFloat(global.getComputedStyle(el).marginTop) || 0;
        el.style.setProperty("--pl-m", (el._plBase - d) + "px");
        el.classList.add("pl-mv");
      } else {
        el.classList.remove("pl-mv");
      }
    },

    /* ⚠ MARGEM POR VARIÁVEL NO PRÓPRIO ELEMENTO, e não `style.marginTop` nem variável
       no #main. Em linha valeria também no impresso e no celular, onde o CSS desta
       tela não se aplica; e variável no #main recalcularia o estilo das 461 linhas a
       cada quadro da roda. */
    _aplicarN: function (main, n) {
      var m = this._med;
      this._n = n > 0 ? n : 0;
      main.classList.toggle("pl-cab-rec", this._n > 0);
      if (!m) { this._med1Aplicado = 0; return; }
      var n1 = Math.min(this._n, m.n1Max), n2 = Math.max(0, this._n - n1);
      this._med1Aplicado = n1;
      this._empurra(m.grupo[0], n1);
      this._empurra(m.faixa, n2);
      /* fora da tela de todo: o Tab não para em botão que ninguém vê */
      var sumiu1 = m.n1Max > 0 && n1 >= m.n1Max;
      for (var i = 0; i < m.grupo.length; i++) m.grupo[i].classList.toggle("pl-some", sumiu1);
      if (m.faixa) m.faixa.classList.toggle("pl-some", m.n2Max > 0 && n2 >= m.n2Max);
    },

    /* Toda trava precisa de porta (CLAUDE.md §3): teclado e tela de toque não têm
       roda para trazer o resumo, e "Gerar Proposta" mora nele. */
    /* ⚠ NA LINHA DOS BOTÕES, à esquerda, onde sobra lugar. Nas abas ele não cabia: saía
       cortado e criava uma barra de rolagem que fazia as abas crescerem 10 px. */
    _porBotao: function (main) {
      var menu = main.querySelector("#aba-conteudo .col-menu");
      var casa = menu && menu.parentNode;
      if (!casa || casa.querySelector(".pl-resumo-btn")) return;
      var self = this;
      var b = global.document.createElement("button");
      b.type = "button";
      b.className = "btn sm ghost pl-resumo-btn";
      b.textContent = "Mostrar resumo";
      b.title = "Mostra de novo o título, os indicadores e os botões do orçamento";
      b.addEventListener("click", function () { self._resto = 0; self._aplicarN(main, 0); });
      casa.insertBefore(b, casa.firstChild);
    },

    /* Anda o que falta do giro, um quadro por vez */
    _tique: function (main) {
      var self = this;
      if (self._raf) return;
      var quadro = function () {
        self._raf = 0;
        var pl = self._caixa(main);
        if (!pl || !self._resto || !self._ativo(main)) { self._resto = 0; return; }
        var r = self._resto, passo = Math.abs(r) < 4 ? r : r * SUAVE;
        self._resto = r - passo;
        var top0 = pl.scrollTop, folga = self._folga(pl);
        var d = self.distribuir({ delta: passo, n: self._n, nMax: self.nMax({ altCab: self._altCab(), folga: folga }), top: top0, folga: folga });
        if (d.n !== self._n) self._aplicarN(main, d.n);
        if (d.top !== top0) pl.scrollTop = d.top;
        /* subindo: chegou à primeira linha, e o resto do giro morre aqui */
        if (passo < 0 && top0 > 0 && d.top <= 0) { self._resto = 0; self._vinha = true; self._ultima = Date.now(); }
        if (self._resto) self._raf = global.requestAnimationFrame(quadro);
      };
      self._raf = global.requestAnimationFrame(quadro);
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
      /* Barra arrastada, teclado, Tab entre células e toque: o navegador rolou a
         tabela sem passar pela roda. Abre lugar para as linhas, uma vez. */
      main.addEventListener("scroll", function (ev) {
        var pl = ev.target;
        if (!pl || !pl.classList || !pl.classList.contains("pl-tabela") || !self._ativo(main)) return;
        if (self._raf || pl.scrollTop <= TOPO_RECOLHE || Date.now() - self._ultima < RODA_RECENTE) return;
        var falta = self.nMax({ altCab: self._altCab(), folga: self._folga(pl) }) - self._n;
        if (falta > 0) { self._resto = falta; self._tique(main); }
      }, true);
      /* Tab num botão do resumo meio escondido: mostra o resumo em vez de deixar o
         foco fora da tela */
      main.addEventListener("focusin", function (ev) {
        var m = self._med;
        if (!m || !self._n) return;
        var ali = m.faixa && m.faixa.contains(ev.target);
        for (var i = 0; !ali && i < m.grupo.length; i++) ali = m.grupo[i].contains(ev.target);
        if (ali) { self._resto = 0; self._aplicarN(main, 0); }
      });
      /* ⚠ `passive: false`: quando o giro é do resumo, a tabela não pode andar junto */
      main.addEventListener("wheel", function (ev) {
        if (ev.ctrlKey || !self._ativo(main)) return;
        var pl = self._caixa(main);
        if (!pl) return;
        var dentro = pl.contains(ev.target);
        /* quem tem rolagem própria debaixo do mouse (índice de etapas, menu) fica com a roda */
        if (!dentro) {
          for (var q = ev.target; q && q !== main; q = q.parentNode) {
            if (q.nodeType === 1 && q.scrollHeight > q.clientHeight + 1 && /auto|scroll/.test(global.getComputedStyle(q).overflowY)) return;
          }
        }
        var dy = self.deltaPx(ev.deltaY, ev.deltaMode, pl.clientHeight);
        var dx = self.deltaPx(ev.deltaX, ev.deltaMode, pl.clientWidth);
        var agora = Date.now(), ultima = self._ultima;
        self._ultima = agora;
        if (dentro && Math.abs(dx) > Math.abs(dy)) return;
        if (!dentro && dx) { pl.scrollLeft += dx; ev.preventDefault(); }
        if (!dy) return;
        var top = pl.scrollTop, n = self._n, subindo = dy < 0;
        var teto = self.nMax({ altCab: self._altCab(), folga: self._folga(pl) });
        if (subindo ? top > 1 : true) self._vinha = subindo;
        var eDoResumo = subindo ? (top <= 1 && n > 0) : (n < teto);
        /* sobre as linhas, sem nada do resumo a mexer: o navegador rola mais macio
           que qualquer conta daqui */
        if (dentro && !eDoResumo && !self._resto) return;
        ev.preventDefault();
        if (subindo && eDoResumo) {
          if (self.segurarNoTopo({ delta: dy, top: top, n: n, vinhaDaTabela: self._vinha, agora: agora, ultima: ultima })) return;
          self._vinha = false;
        }
        /* mudou de sentido: não termina o giro antigo */
        if (self._resto && (self._resto < 0) !== subindo) self._resto = 0;
        self._resto += dy;
        self._tique(main);
      }, { passive: false });
    }
  };

  global.PlFixa = PlFixa;
  if (typeof module !== "undefined" && module.exports) module.exports = PlFixa;
})(typeof window !== "undefined" ? window : this);

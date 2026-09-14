/* =====================================================================
 * paineisui.js — AS ALÇAS DE REDIMENSIONAR COM O MOUSE (espec
 * crono-janelas, fatia F7). A fiação do gesto; o tamanho, a faixa, o
 * encaixe e a preferência são do motor puro js/paineis.js (F3).
 *
 * POR QUE ESTE ARQUIVO EXISTE (14/09/2026)
 * Pedido literal do dono: "essas janelas o usuário deve ter a opção de
 * REDIMENSIONAR COM O MOUSE". A F3 deixou o desenho pronto (as alças só saem
 * com este global definido) e a porta de remedição (`App._gxRemedir`). Sem
 * este arquivo a alça seria uma pega que não faz nada — porta que não abre —
 * e por isso o desenho não a emite enquanto `PaineisUI` não existe.
 *
 * O QUE SE REDIMENSIONA (e só isto: seção 6.3 da espec)
 *   gxAltura   altura do corpo do Gantt, em LINHAS inteiras (k×24 + 14)
 *   gxNomes    largura da coluna de nomes do Gantt (e o dia 0 do histograma)
 *   hxAltura   altura do desenho do histograma de mão de obra
 *   fxAltura   altura do quadro do macrofluxo
 *   idxLargura largura do índice de etapas da Planilha
 *
 * ⚠ OS TRÊS DEFEITOS QUE A MEDIÇÃO ACHOU E QUE ESTA FIAÇÃO NÃO PODE REABRIR
 *   (REDIMENSIONAR.md, experimentos A, C e E′, medidos no Chrome):
 *   A) corpo esticado sem avisar a fiação → FAIXA BRANCA de ~180 px no fim do
 *      Gantt (a virtualização seguia desenhando as linhas 0–24). Por isso a
 *      alça de altura passa SEMPRE pela porta `App._gxRemedir("alca")`.
 *   C) o primeiro `App.render()` (digitar uma duração) devolvia o corpo a
 *      520 px. Por isso o valor vive em `App._paineis` DURANTE o arrasto (o
 *      desenho puro o lê no render) e vai ao disco ao SOLTAR.
 *   E′) coluna de nomes mudada só pelo CSS → nome cortado em 300 px, faixa
 *      branca ao lado e o histograma 160 px fora do Gantt. Por isso a alça de
 *      nomes muda a PREFERÊNCIA e remede; nunca escreve `--gx-lw`.
 *
 * ⚠ NUNCA `App.render()` DAQUI. O render religa a aba inteira e tira o foco
 *   de quem está digitando; a alça só mexe no tamanho e repinta o que mudou.
 * ⚠ NADA VAI AO ORÇAMENTO, ÀS `prefs` OU AO Store. A preferência é estado de
 *   TELA (chave própria do localStorage, por pessoa — ver paineis.js). Gravar
 *   no orçamento mudaria o `atualizadoEm` a cada arrasto, sincronizaria à toa,
 *   esbarraria na trava do aprovado e iria para o cliente.
 * ⚠ SEM Pointer Events nesta entrega: um caminho só (mouse + toque), o mesmo
 *   do arrasto do Gantt, já provado na WebView antiga dos instaladores.
 * ⚠ SEM `resize:` do CSS: a pega de 15 px no canto não se acha, não existe no
 *   toque, não avisa ninguém (é o experimento A) e não encaixa em linha.
 *
 * DECISÃO: O MÍNIMO DO GANTT É 5 LINHAS (134 px), NÃO 4 (espec 6.1).
 *   Quatro linhas inteiras dão 14 + 4×24 = 110 px. Só que o desenho puro da
 *   1.2.77 já prende a altura do corpo em 120 px no mínimo
 *   (`CronoExecUI.ganttProEstado`: `Math.max(120, …)`), e 110 viraria 120 —
 *   4,4 linhas, a quinta cortada ao meio, que é o defeito "nunca meia linha"
 *   reaparecendo justamente no mínimo. Descer esse piso para 110 mudaria a
 *   altura das obras pequenas de TODO mundo, sem ninguém arrastar nada — e o
 *   padrão tem de continuar o de hoje. A menor altura em linha inteira que
 *   respeita o piso de hoje é 134. A dica diz "Altura: 5 linhas" ali.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ SÓ TOKENS, nunca cor crua (espec 2.5): no escuro a pega e a dica
     acompanham o tema. O papel do Gantt é branco cravado, e `--linha-forte`
     dos dois temas se lê sobre ele.
     ⚠ A alça horizontal é uma faixa DE VERDADE (8 px no fluxo), não uma
     sobreposição: por cima do corpo ela roubaria a calha da barra de rolagem
     horizontal do painel do tempo, que é por onde se anda na obra. */
  var CSS_PAINEIS =
    ".pn-alca{box-sizing:border-box;outline:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}" +
    ".pn-alca-h{position:relative;display:block;height:8px;cursor:row-resize;touch-action:none}" +
    ".pn-alca-h::after{content:\"\";position:absolute;left:50%;top:2px;width:32px;height:4px;margin-left:-16px;border-radius:2px;background:var(--linha-forte)}" +
    ".pn-alca-h:hover::after,.pn-alca-h:focus-visible::after,.pn-alca-h.pn-ativa::after{background:var(--aco)}" +
    /* o anel de foco é o mesmo do painel do tempo (.gx-plot:focus-visible) */
    ".pn-alca:focus-visible{box-shadow:inset 0 0 0 2px var(--aco);border-radius:4px}" +
    ".pn-alca-v{position:absolute;top:0;bottom:0;width:6px;margin-left:-3px;cursor:col-resize;touch-action:none;z-index:4}" +
    ".pn-alca-v::after{content:\"\";position:absolute;top:0;bottom:0;left:2px;width:2px;background:transparent}" +
    ".pn-alca-v:hover::after,.pn-alca-v:focus-visible::after,.pn-alca-v.pn-ativa::after{left:1px;width:4px;background:var(--aco)}" +
    /* a alça de nomes não desce sobre a faixa da alça de altura */
    ".gx>[data-pn-alca=\"gxAltura\"]~[data-pn-alca=\"gxNomes\"]{bottom:8px}" +
    /* ÍNDICE DA PLANILHA: a borda direita do índice, no vão entre ele e a
       tabela. ⚠ Absoluta (fora do fluxo do grid): como filho comum do
       `.pl-com-indice` ela ocuparia a 2ª coluna e empurraria a tabela para
       baixo do índice. A linha visível é sticky, para acompanhar o índice (que
       é sticky) enquanto a planilha rola. */
    ".pl-com-indice>[data-pn-alca=\"idxLargura\"]{left:calc(var(--idx-w) + 4px)}" +
    ".pl-com-indice>[data-pn-alca=\"idxLargura\"]::after{position:sticky;display:block;top:8px;left:auto;margin:0 auto;height:calc(100vh - 120px);width:1px;background:var(--linha)}" +
    ".pl-com-indice>[data-pn-alca=\"idxLargura\"]:hover::after,.pl-com-indice>[data-pn-alca=\"idxLargura\"]:focus-visible::after,.pl-com-indice>[data-pn-alca=\"idxLargura\"].pn-ativa::after{width:3px;left:auto;background:var(--aco)}" +
    /* durante o arrasto o cursor é o mesmo na página inteira, com o mesmo
       !important do arrasto do Gantt: sem ele o cursor da barra de baixo do
       ponteiro vencia e a pessoa não sabia se ainda estava arrastando */
    "body.pn-redim,body.pn-redim *{cursor:row-resize!important;-webkit-user-select:none;user-select:none}" +
    "body.pn-redim.pn-redim-x,body.pn-redim.pn-redim-x *{cursor:col-resize!important}" +
    /* a dica (régua da F5: 12 px, peso 500) */
    ".gx-dica.pn-dica-gx{font-size:12px;font-weight:500;white-space:nowrap}" +
    ".pn-dica{position:fixed;z-index:9999;pointer-events:none;background:var(--texto);color:var(--surface);font-size:12px;font-weight:500;line-height:1.4;padding:4px 8px;border-radius:6px;white-space:nowrap}" +
    ".pn-dica[hidden]{display:none}" +
    /* ⚠ ÁREA DE TOQUE DE 24 PX na alça de altura (celular e caneta grossa):
       8 px de faixa são pouco para o dedo. O `::before` estende o alvo sem
       mudar o desenho nem empurrar o Gantt.
       ⚠ SÓ `(pointer:coarse)`, NUNCA pela largura da janela (achado da revisão
       adversarial da F7). A 1ª entrega ligava isto também em `max-width:820px`,
       e o alvo sobe 8 px por cima do corpo — exatamente onde mora a calha da
       barra de rolagem horizontal do painel do tempo. Roteiro medido no Chrome
       com barras de rolagem de verdade, 800×768, zoom Dia (2044 px de obra em
       554 de painel): de baixo para cima na barra de 10 px, `elementFromPoint`
       deu "-10 barra · -9 barra · -8…-1 ALÇA"; apertar 3 px acima do fundo
       para andar na obra e puxar REDIMENSIONOU o Gantt (520 → 590 px). O mesmo
       gesto a 1366 não mexia em nada. Meia tela de notebook de 1366 (683 px)
       cai nessa faixa, com mouse. No dedo não há esse conflito: a barra de
       rolagem do celular é sobreposta e não se pega — ali o alvo simétrico
       (±12 px em volta da pega) é o que acerta. */
    "@media (pointer:coarse){.pn-alca-h::before{content:\"\";position:absolute;left:0;right:0;top:-8px;bottom:-8px}}" +
    /* ⚠ SEM ALÇA DE NOMES ABAIXO DE 820 PX: ali a coluna é decidida pela
       proporção (ganttProLabelW) e a preferência é ignorada — a alça seria uma
       porta que não abre. O desenho já não a emite abaixo de 820 no render;
       isto cobre quem estreita a janela sem render. */
    "@media (max-width:820px){[data-pn-alca=\"gxNomes\"]{display:none}}" +
    // abaixo de 1100 px o índice vira fita horizontal (app.css): não há largura para puxar
    "@media (max-width:1100px){[data-pn-alca=\"idxLargura\"]{display:none}}";

  function P() { return (typeof Paineis !== "undefined" && Paineis && typeof Paineis.limitar === "function") ? Paineis : null; }
  function CX() { return (typeof CronoExecUI !== "undefined" && CronoExecUI) ? CronoExecUI : null; }
  // o App da janela da alça (cada janela destacada roda o seu App — F8)
  function appDe(doc) {
    var w = doc && doc.defaultView;
    if (w && w.App) return w.App;
    return (typeof App !== "undefined") ? App : null;
  }
  function alcaDe(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (n.getAttribute && n.getAttribute("data-pn-alca")) return n;
    }
    return null;
  }
  function presa(doc, el) { return !!(el && doc && doc.documentElement && doc.documentElement.contains(el)); }
  function prefsDe(app) {
    try { return (app && typeof app._gxPaineis === "function") ? app._gxPaineis() : null; } catch (e) { return null; }
  }
  function tem(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  /* O ALVO de uma alça: o que ela mede, a faixa de agora, como aplica e como
     volta ao padrão. `null` = esta alça não tem o que mexer agora (sem o
     motor, sem o Gantt ligado, painel sumido). */
  function alvo(app, alca) {
    var Pn = P(), Cx = CX();
    if (!Pn || !alca) return null;
    var nome = alca.getAttribute("data-pn-alca"), doc = alca.ownerDocument, win = (doc && doc.defaultView) || global;
    var prefs = prefsDe(app);
    if (!prefs) return null;
    var g = app ? app._gx : null;
    if (nome === "gxAltura" || nome === "gxNomes" || nome === "hxAltura") {
      /* ⚠ só o Gantt LIGADO a esta aba: um controlador de render anterior
         apontaria para um corpo que já saiu da página */
      if (!g || !g.wrap || !Cx || !presa(doc, g.wrap)) return null;
    }
    if (nome === "gxAltura") {
      if (!g.corpo) return null;
      return {
        nome: nome, eixo: "y",
        atual: function () { return g.corpo.offsetHeight || g.caixa || 0; },
        ctx: function () {
          return { linhas: (g.pro && g.pro.L) ? g.pro.L.length : 0, rowH: Cx.GX_ROWH, barra: Cx.GX_BARRA,
            janelaAltura: win.innerHeight, cabecalho: Cx.GX_CABECALHO };
        },
        aplicar: function (v) {
          prefs.gxAltura = v;
          if (g.corpo.style.height !== v + "px") {
            g.corpo.style.height = v + "px";
            /* ⚠ A PORTA ÚNICA (experimento A): `g.caixa` relido, nomes e régua
               sincronizados e o Gantt repintado com a janela de linhas nova.
               Só o `style.height` deixava a faixa branca no fim do corpo. */
            app._gxRemedir("alca");
          }
        },
        padrao: function () {
          delete prefs.gxAltura;
          /* o padrão sai do DONO dele (o desenho puro, sem preferência), e não
             de uma cópia da fórmula aqui — réplica de conta apodrece */
          var e = Cx.ganttProEstado(g.ctx.r, { detalhe: g.ctx.det, abertas: g.ctx.abertas, travado: g.ctx.travado, hoje: g.ctx.hoje, L: g.pro ? g.pro.L : undefined });
          var h = e && e.alturaCaixa > 0 ? e.alturaCaixa : Cx.GX_ALTURA;
          g.corpo.style.height = h + "px";
          app._gxRemedir("alca");
        },
        rotulo: function (v) { return "Altura: " + Math.round((v - Cx.GX_BARRA) / Cx.GX_ROWH) + " linhas"; },
        gantt: g
      };
    }
    if (nome === "gxNomes") {
      return {
        nome: nome, eixo: "x",
        atual: function () { return (g.pro && g.pro.labelW > 0) ? g.pro.labelW : (g.nomeW || 0); },
        ctx: function () { return { larguraWidget: g.wrap.clientWidth, gradeW: (g.pro && g.pro.gradeW > 0) ? g.pro.gradeW : 0 }; },
        aplicar: function (v) {
          if (prefs.gxNomes === v && g.pro && g.pro.labelW === v) return;
          /* ⚠ A PREFERÊNCIA, NÃO O CSS (experimento E′): é o `ganttProLabelW`
             que decide `--gx-lw`, o SVG dos nomes, o corte do texto e o eixo
             do histograma — os quatro juntos, no mesmo quadro. */
          prefs.gxNomes = v;
          app._gxRemedir("alca");
        },
        padrao: function () { delete prefs.gxNomes; app._gxRemedir("alca"); },
        rotulo: function (v) { return "Coluna de nomes: " + v + " px"; },
        gantt: g
      };
    }
    if (nome === "hxAltura") {
      return {
        nome: nome, eixo: "y",
        atual: function () { return (g.pro && g.pro.hxAltura > 0) ? g.pro.hxAltura : Cx.HX_ALTURA; },
        ctx: function () { return {}; },
        aplicar: function (v) {
          if (g.pro && g.pro.hxAltura === v) return;
          prefs.hxAltura = v;
          /* ⚠ `_gxPintar(false)` e não remedir: a altura do histograma entra na
             chave do estado (App._gxPro) e na do desenho de baixo
             (_cronoHxPintar), que redesenha o SVG pelo modelo JÁ MONTADO
             (hxUltimo) — sem refazer o Histograma.montar, que lê a composição
             de todos os serviços. O Gantt de cima não muda de janela e não é
             repintado. */
          app._gxPintar(false);
        },
        padrao: function () { delete prefs.hxAltura; app._gxPintar(false); },
        rotulo: function (v) { return "Altura: " + v + " px"; }
      };
    }
    if (nome === "fxAltura") {
      var plot = alca.previousElementSibling;
      if (!plot || !plot.classList || !plot.classList.contains("fx-plot")) return null;
      var natural = function () {
        var fin = plot.querySelector(".fx-in");
        return (fin ? fin.offsetHeight : plot.scrollHeight) + (Cx ? Cx.GX_BARRA : 14);
      };
      return {
        nome: nome, eixo: "y",
        atual: function () { return plot.offsetHeight; },
        ctx: function () { return { natural: natural() }; },
        aplicar: function (v) { prefs.fxAltura = v; plot.style.height = v + "px"; },
        padrao: function () {
          delete prefs.fxAltura;
          /* o padrão (natural até 60% da janela) é do `fxQuadro`: pergunta a
             ele com a altura do desenho, em vez de repetir a regra aqui */
          var h = null;
          try {
            var html = Cx.fxQuadro({ largura: 1, altura: natural() - Cx.GX_BARRA }, { alcas: true, janelaAltura: win.innerHeight });
            var m = /class="fx-plot" style="height:(\d+)px"/.exec(html);
            h = m ? Number(m[1]) : null;
          } catch (e) { h = null; }
          plot.style.height = h ? h + "px" : "";
        },
        rotulo: function (v) { return "Altura: " + v + " px"; }
      };
    }
    if (nome === "idxLargura") {
      var cont = alca.parentNode, aside = cont && cont.querySelector ? cont.querySelector(".idx-etapas") : null;
      if (!aside) return null;
      return {
        nome: nome, eixo: "x",
        atual: function () { return aside.offsetWidth; },
        ctx: function () { return {}; },
        /* ⚠ pela variável `--idx-w` do próprio `.pl-com-indice`, e não por
           `grid-template-columns` em linha: o estilo em linha venceria a media
           query de 1100 px e o índice deixaria de virar fita no tablet */
        aplicar: function (v) { prefs.idxLargura = v; cont.style.setProperty("--idx-w", v + "px"); },
        padrao: function () { delete prefs.idxLargura; cont.style.removeProperty("--idx-w"); },
        rotulo: function (v) { return "Índice de etapas: " + v + " px"; }
      };
    }
    return null;
  }

  var PaineisUI = {
    CSS: CSS_PAINEIS,
    _ar: null,       // o arrasto em andamento (um por vez)
    _dicaT: 0,

    /* Instala a delegação UMA vez por documento. ⚠ Delegação no `document`, e
       não ouvinte na alça: a alça é recriada a cada render (e a do índice
       mora na Planilha, que não passa pelo Gantt) — assim nenhuma precisa de
       gancho no app.js para funcionar. */
    instalar: function (doc) {
      doc = doc || global.document;
      if (!doc || !doc.addEventListener || doc.__pnInstalado) return false;
      doc.__pnInstalado = true;
      var self = this;
      try {
        if (doc.head && !doc.getElementById("css-paineis")) {
          var s = doc.createElement("style"); s.id = "css-paineis"; s.textContent = CSS_PAINEIS; doc.head.appendChild(s);
        }
      } catch (eC) {}
      /* ⚠ CAPTURA e `preventDefault` SÓ na alça: em qualquer outro ponto o
         mousedown segue o caminho de sempre (seleção de texto, foco de campo,
         arrasto das barras). O preventDefault na alça também impede que o
         campo que a pessoa está editando perca o foco — o `change` do blur
         redesenharia a aba no meio do gesto. */
      doc.addEventListener("mousedown", function (ev) {
        var a = alcaDe(ev.target);
        if (!a || ev.button !== 0) return;
        if (self._comecar(a, ev.clientX, ev.clientY, false)) ev.preventDefault();
      }, true);
      doc.addEventListener("mousemove", function (ev) {
        var ar = self._ar; if (!ar || ar.toque) return;
        /* botão solto FORA da janela (o mouseup não chegou): termina aqui, em
           vez de a alça seguir o ponteiro sem botão apertado */
        if (ev.buttons === 0) { self._soltar(); return; }
        self._mover(ev.clientX, ev.clientY);
      }, true);
      doc.addEventListener("mouseup", function () { if (self._ar && !self._ar.toque) self._soltar(); }, true);
      /* TOQUE. ⚠ Sem preventDefault: ouvinte de toque no documento é passivo
         no Chrome, e quem impede a rolagem na alça é o `touch-action:none`
         dela. Fora da alça nada é interceptado — a rolagem com o dedo (que é
         como se lê um cronograma no celular) continua a de sempre. */
      doc.addEventListener("touchstart", function (ev) {
        var a = alcaDe(ev.target);
        if (!a || !ev.touches || ev.touches.length !== 1) return;
        self._comecar(a, ev.touches[0].clientX, ev.touches[0].clientY, true);
      }, true);
      doc.addEventListener("touchmove", function (ev) {
        var ar = self._ar; if (!ar || !ar.toque || !ev.touches || !ev.touches.length) return;
        self._mover(ev.touches[0].clientX, ev.touches[0].clientY);
      }, true);
      doc.addEventListener("touchend", function () { if (self._ar && self._ar.toque) self._soltar(); }, true);
      doc.addEventListener("touchcancel", function () { if (self._ar && self._ar.toque) self._soltar(); }, true);
      // ⚠ duplo clique VOLTA AO PADRÃO: toda trava tem porta, e o tamanho escolhido também
      doc.addEventListener("dblclick", function (ev) {
        var a = alcaDe(ev.target);
        if (!a) return;
        ev.preventDefault();
        self.padrao(a);
      }, true);
      doc.addEventListener("keydown", function (ev) {
        var a = alcaDe(ev.target);
        if (a) self._tecla(ev, a);
      }, true);
      return true;
    },

    _comecar: function (alca, x, y, toque) {
      if (this._ar) return false;
      var doc = alca.ownerDocument, body = doc && doc.body;
      /* ⚠ O ARRASTO DE UMA BARRA DO GANTT NÃO BRIGA COM A ALÇA: com uma barra
         em voo (`gx-arrastando`) a alça não abre gesto — dois arrastos
         vivos disputariam o mesmo mouseup, e a barra poderia gravar uma data
         enquanto a pessoa achava que estava só mudando o tamanho. */
      if (body && body.classList && body.classList.contains("gx-arrastando")) return false;
      var app = appDe(doc), a = alvo(app, alca);
      if (!a) return false;
      var v0 = a.atual();
      if (!(v0 > 0)) return false;
      var prefs = prefsDe(app);
      this._ar = { a: a, app: app, alca: alca, doc: doc, nome: a.nome, toque: !!toque,
        x0: x, y0: y, px: x, py: y, v0: v0, v: v0, raf: 0,
        // o que havia na memória antes: um gesto que volta ao ponto de partida não deixa rastro
        tinha: tem(prefs, a.nome), antes: prefs ? prefs[a.nome] : undefined };
      this._marcar(true);
      this._dica(this._ar, v0);
      return true;
    },
    _marcar: function (liga) {
      var ar = this._ar; if (!ar) return;
      var body = ar.doc && ar.doc.body;
      if (body && body.classList) {
        if (liga) { body.classList.add("pn-redim"); if (ar.a.eixo === "x") body.classList.add("pn-redim-x"); }
        else { body.classList.remove("pn-redim"); body.classList.remove("pn-redim-x"); }
      }
      if (ar.alca && ar.alca.classList) { if (liga) ar.alca.classList.add("pn-ativa"); else ar.alca.classList.remove("pn-ativa"); }
    },
    _mover: function (x, y) {
      var ar = this._ar; if (!ar) return;
      ar.px = x; ar.py = y;
      if (ar.raf) return;
      var self = this, win = (ar.doc && ar.doc.defaultView) || global;
      // um quadro por rAF, com a MESMA reserva por setTimeout do _gxAgendar (WebView sem rAF)
      var pede = (typeof win.requestAnimationFrame === "function") ? function (f) { return win.requestAnimationFrame(f); } : function (f) { return setTimeout(f, 16); };
      ar.raf = pede(function () { if (self._ar === ar) { ar.raf = 0; self._quadro(); } });
    },
    /* UM QUADRO: o valor pelo motor (preso, encaixado) e o painel remedido.
       ⚠ Render no meio do gesto (a nuvem voltando, um salvar assíncrono): a
       alça antiga saiu da página e o `_cronoGanttLigar` tirou o `pn-redim`.
       O gesto continua na alça NOVA, com o ponto de partida de antes — sem
       isto o resto do arrasto mexeria num corpo que não está mais na tela. */
    _quadro: function () {
      var ar = this._ar, Pn = P(); if (!ar || !Pn) return;
      if (!presa(ar.doc, ar.alca) || (ar.a.gantt && ar.app && ar.app._gx !== ar.a.gantt)) {
        var nova = ar.doc.querySelector('[data-pn-alca="' + ar.nome + '"]'), a2 = nova ? alvo(ar.app, nova) : null;
        if (!a2) { this._soltar(); return; }
        ar.alca = nova; ar.a = a2;
        this._marcar(true);
      }
      var delta = ar.a.eixo === "y" ? (ar.py - ar.y0) : (ar.px - ar.x0);
      /* ⚠ LIMIAR DE 3 PX ANTES DE O GESTO VALER (F7, achado da revisão
         adversarial). Clique com tremor de 1 px passava pelo `limitar`, que
         encaixa na linha inteira (520 → 518), e o soltar via "mudou" e GRAVAVA
         a preferência — o Gantt ficava preso em 518 por um clique. Enquanto o
         movimento no eixo não passa de 3 px nada se aplica; depois de passar,
         o gesto é arrasto de verdade até soltar. */
      if (!ar.passou) { if (Math.abs(delta) < 3) return; ar.passou = true; }
      var v = Pn.limitar(ar.nome, ar.v0 + delta, ar.a.ctx());
      if (v == null) return;
      if (v !== ar.v || ar.a.atual() !== v) { ar.v = v; ar.a.aplicar(v); }
      if (ar.alca.setAttribute) ar.alca.setAttribute("aria-valuenow", String(Math.round(v)));
      this._dica(ar, v);
    },
    _soltar: function () {
      var ar = this._ar; if (!ar) return;
      if (ar.raf) {
        var win = (ar.doc && ar.doc.defaultView) || global;
        try { if (typeof win.cancelAnimationFrame === "function") win.cancelAnimationFrame(ar.raf); } catch (eR) {}
        try { clearTimeout(ar.raf); } catch (eT) {}
        ar.raf = 0;
        // ⚠ o último movimento ainda não pintado vale: soltar rápido não pode perder os últimos pixels
        this._quadro();
        // o quadro pode ter encerrado o gesto sozinho (o painel saiu da tela): já está gravado
        if (this._ar !== ar) return;
      }
      this._marcar(false);
      this._ar = null;
      this._esconderDica(ar);
      var prefs = prefsDe(ar.app);
      if (!ar.passou || ar.v === ar.v0) {
        // clique sem arrastar (ou ida e volta): nada vai ao disco, e a memória fica como estava
        if (prefs) { if (ar.tinha) prefs[ar.nome] = ar.antes; else delete prefs[ar.nome]; }
        return;
      }
      /* ⚠ GRAVA UMA VEZ, AO SOLTAR. Gravar a cada quadro seria dezenas de
         escritas no localStorage por segundo — e é o mesmo armazenamento que
         guarda os orçamentos. */
      this._gravar(ar.app, ar.alca, ar.nome, ar.v);
    },
    _gravar: function (app, alca, nome, v) {
      var Pn = P(); if (!Pn || !app) return false;
      prefsDe(app);   // garante o hash da pessoa de agora
      var st = null, doc = alca && alca.ownerDocument, win = (doc && doc.defaultView) || global;
      try { st = win.localStorage; } catch (eS) { st = null; }
      var ok = false;
      try { ok = Pn.gravar(st, app._paineisHash, nome, v); } catch (eG) { ok = false; }
      if (!ok && v !== null) {
        /* recado honesto: o tamanho vale na tela, mas não ficou guardado */
        try { if (typeof UI !== "undefined" && UI.toast) UI.toast("Não consegui guardar este tamanho neste computador (o armazenamento do navegador está cheio ou bloqueado). Ele vale até você recarregar a página.", "erro"); } catch (eT) {}
      }
      return ok;
    },

    /* VOLTA AO PADRÃO (duplo clique ou Enter): apaga a preferência no disco e
       devolve o painel ao tamanho da 1.2.77. */
    padrao: function (alca) {
      if (this._ar) { this._marcar(false); this._esconderDica(this._ar); this._ar = null; }
      var app = appDe(alca.ownerDocument), a = alvo(app, alca);
      if (!a) return false;
      a.padrao();
      this._gravar(app, alca, a.nome, null);
      var nova = presa(alca.ownerDocument, alca) ? alca : alca.ownerDocument.querySelector('[data-pn-alca="' + a.nome + '"]');
      if (nova && nova.setAttribute) nova.setAttribute("aria-valuenow", String(Math.round(a.atual())));
      return true;
    },

    /* TECLADO: Tab chega na alça; setas andam uma linha (Gantt) ou 4 px;
       Home/End vão ao mínimo e ao máximo; Enter volta ao padrão. Cada tecla
       grava na hora (é um passo discreto, não um arrasto). */
    _tecla: function (ev, alca) {
      var k = ev.key;
      if (k !== "ArrowUp" && k !== "ArrowDown" && k !== "ArrowLeft" && k !== "ArrowRight" && k !== "Home" && k !== "End" && k !== "Enter") return;
      if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) return;
      /* ⚠ a tecla é da alça: a seta rolaria a página e o Enter chegaria aos
         atalhos globais do app */
      ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      if (k === "Enter") { this.padrao(alca); return; }
      var Pn = P(), app = appDe(alca.ownerDocument), a = alvo(app, alca);
      if (!Pn || !a) return;
      var atual = a.atual(), v = Pn.passoTeclado(a.nome, k, atual, a.ctx());
      if (v == null || !(v > 0) || v === atual) { this._dicaTecla(alca, a, atual); return; }
      a.aplicar(v);
      this._gravar(app, alca, a.nome, v);
      alca.setAttribute("aria-valuenow", String(Math.round(v)));
      this._dicaTecla(alca, a, v);
    },

    /* A DICA durante o gesto. ⚠ TEXTO PURO (textContent): número que a pessoa
       confere, nunca HTML. No Gantt é a `.gx-dica` dele; nos outros painéis,
       uma dica própria fixa na janela. */
    _dica: function (ar, v) {
      var txt = ar.a.rotulo(v), doc = ar.doc, g = ar.a.gantt;
      if (g && g.dica && g.wrap) {
        var d = g.dica, q = g.wrap.getBoundingClientRect(), dh, dw;
        if (d.classList) d.classList.add("pn-dica-gx");
        d.style.background = "";
        d.textContent = txt;
        d.hidden = false;
        dw = d.offsetWidth || 160; dh = d.offsetHeight || 24;
        var x, y;
        if (ar.nome === "gxNomes") {
          x = (g.pro && g.pro.labelW ? g.pro.labelW : 0) + 10;
          y = Math.max(4, (ar.py || q.top) - q.top - dh / 2);
        } else {
          var cr = g.corpo ? g.corpo.getBoundingClientRect() : q;
          x = Math.max(4, Math.min(q.width - dw - 4, (ar.px != null ? ar.px : q.left + q.width / 2) - q.left - dw / 2));
          /* ⚠ ABAIXO da faixa, sobre a legenda — e não acima dela: acima, a
             dica cobria a última linha do Gantt, que é justamente a linha que a
             pessoa está olhando para decidir onde soltar (visto na foto a
             1366: "Altura: 26 linhas" por cima da barra de 8 dias) */
          y = cr.bottom - q.top + 8 + 6;
        }
        d.style.left = Math.round(x) + "px";
        d.style.top = Math.round(y) + "px";
        return;
      }
      var el = this._dicaEl(doc);
      if (!el) return;
      el.textContent = txt;
      el.hidden = false;
      var r = ar.alca.getBoundingClientRect();
      var px = ar.px != null ? ar.px : r.left + r.width / 2, py = ar.py != null ? ar.py : r.top;
      el.style.left = Math.round(px + 14) + "px";
      el.style.top = Math.round(Math.max(4, py - 30)) + "px";
    },
    _dicaEl: function (doc) {
      if (!doc || !doc.body) return null;
      var el = doc.getElementById("pn-dica");
      if (!el) {
        el = doc.createElement("div"); el.id = "pn-dica"; el.className = "pn-dica"; el.hidden = true;
        el.setAttribute("role", "status");
        doc.body.appendChild(el);
      }
      return el;
    },
    _esconderDica: function (ar) {
      var g = ar && ar.a && ar.a.gantt;
      if (g && g.dica) { g.dica.hidden = true; if (g.dica.classList) g.dica.classList.remove("pn-dica-gx"); }
      var el = ar && ar.doc ? ar.doc.getElementById("pn-dica") : null;
      if (el) el.hidden = true;
    },
    _dicaTecla: function (alca, a, v) {
      var self = this, doc = alca.ownerDocument, r = alca.getBoundingClientRect();
      var ar = { a: a, alca: alca, doc: doc, nome: a.nome, px: r.left + r.width / 2, py: r.top + r.height / 2 };
      this._dica(ar, v);
      if (this._dicaT) clearTimeout(this._dicaT);
      this._dicaT = setTimeout(function () { self._dicaT = 0; if (!self._ar) self._esconderDica(ar); }, 1500);
    },

    /* GANCHO da F3 no fim de `_cronoGanttLigar` (a cada render do Gantt): as
       alças novas recebem a medida de AGORA (o desenho puro não sabe a largura
       da tela nem a janela real) e um gesto que atravessou o render volta a
       marcar a página. */
    ligarGantt: function (app, g) {
      var Pn = P(), Cx = CX(); if (!Pn || !Cx || !g || !g.wrap || !g.wrap.querySelector) return;
      var win = (g.wrap.ownerDocument && g.wrap.ownerDocument.defaultView) || global;
      var aA = g.wrap.querySelector('[data-pn-alca="gxAltura"]');
      if (aA) {
        var fA = Pn.faixa("gxAltura", { linhas: (g.pro && g.pro.L) ? g.pro.L.length : 0, rowH: Cx.GX_ROWH, barra: Cx.GX_BARRA, janelaAltura: win.innerHeight, cabecalho: Cx.GX_CABECALHO });
        if (fA) { aA.setAttribute("aria-valuemin", String(fA.min)); aA.setAttribute("aria-valuemax", String(fA.max)); }
        if (g.caixa > 0) aA.setAttribute("aria-valuenow", String(Math.round(g.caixa)));
      }
      var aN = g.wrap.querySelector('[data-pn-alca="gxNomes"]');
      if (aN) {
        var fN = Pn.faixa("gxNomes", { larguraWidget: g.wrap.clientWidth, gradeW: (g.pro && g.pro.gradeW) || 0 });
        if (fN) { aN.setAttribute("aria-valuemin", String(fN.min)); aN.setAttribute("aria-valuemax", String(fN.max)); }
        if (g.pro && g.pro.labelW > 0) aN.setAttribute("aria-valuenow", String(Math.round(g.pro.labelW)));
      }
      var ar = this._ar;
      if (ar && ar.a && ar.a.gantt && ar.a.gantt !== g) {
        var nova = g.wrap.querySelector('[data-pn-alca="' + ar.nome + '"]'), a2 = nova ? alvo(app, nova) : null;
        if (a2) { ar.alca = nova; ar.a = a2; this._marcar(true); }
      }
    }
  };

  global.PaineisUI = PaineisUI;
  if (typeof module !== "undefined" && module.exports) module.exports = PaineisUI;
  // ⚠ instala-se sozinho: sem gancho no app.js, a alça da Planilha também funciona
  if (global.document && global.document.addEventListener) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", function () { PaineisUI.instalar(global.document); });
    else PaineisUI.instalar(global.document);
  }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

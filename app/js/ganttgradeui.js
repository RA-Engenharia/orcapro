/* =====================================================================
 * ganttgradeui.js — A GRADE Dur./Depende de DO GANTT (espec crono-janelas,
 * fatia F6): o campo sobreposto às células, o duplo clique na barra, o
 * teclado do MS Project e o cartão quando as colunas estão escondidas.
 *
 * O PEDIDO (Rogério, 14/09/2026): "além de conseguir puxar as barras para
 * onde quiser, ele também pode ter a opção de DIGITAR, igual à tabela, a
 * DURAÇÃO e os PREDECESSORES (depende de), na barra onde for ficar melhor".
 * Medido na 1.2.77 (EDICAO.md): a barra da 7.2 em y=1290 e o campo dela na
 * tabela em y=2597 — 1,7 tela de distância; o número e a barra nunca
 * apareciam juntos.
 *
 * QUEM FAZ O QUÊ
 *  - O DESENHO das células é puro (CronoExecUI.ganttProNomes/ganttProCelula):
 *    valor, sintaxe e trava saem de lá, e daqui só se lê.
 *  - A DECISÃO do que se grava é do motor (GanttUI.opsDaDigitacao, o mesmo
 *    contrato da tabela) e a gravação é o caminho único do app.js
 *    (App._cronoGravarDigitado → _cronoGravarOps). Nada aqui toca no
 *    cronograma: um segundo lugar gravando seria a quinta cabeça decidindo o
 *    que a quarta já decide.
 *  - Aqui: UM `<input>`, a posição dele, as teclas, o foco e o cartão.
 *
 * ⚠ AS REGRAS QUE NÃO PODEM CAIR
 *  1) UM ÚNICO `<input class="gx-ed">`, filho da `.gx` (g.wrap) e FORA do
 *     `.gx-nomes-in`. O painel dos nomes é recriado a cada 24 px de rolagem
 *     (medido: um nó novo em 24, 48, 72, 120 e 240) e a cada render depois de
 *     gravar: um campo lá dentro morria no meio da digitação.
 *  2) A célula aberta mora no estado de TELA `App._cronoZoom[orc.id].ed`
 *     ({id, campo}), nunca no orçamento. É por ela que o render depois de
 *     gravar reabre o campo na célula seguinte com `focus()` SÍNCRONO: as
 *     teclas digitadas durante os ~100 ms do render caem no campo novo, e não
 *     no `<body>` (Tab corrido por 5 linhas sem perder tecla).
 *  3) `stopPropagation` em toda tecla do campo: `+` e `-` são zoom no painel
 *     do tempo e são sintaxe do "Depende de" (1+7, 1-3).
 *  4) Grava só no COMMIT (Enter, Tab, ↑↓, clicar fora). Nada no `input`/
 *     `keyup`: cada tecla viraria uma gravação, um recado e um render.
 *  5) Tintas CRAVADAS de papel (#0f172a, #0d6ebd, #fff): o Gantt é papel
 *     branco nos dois temas (regra 4 do cabeçalho do cronoexecui.js). Com os
 *     tokens, o campo sairia com a tinta clara do tema escuro sobre o papel.
 *  6) Sem Pointer Events, sem `closest` obrigatório, sem `dblclick` na barra
 *     que se arrasta (ver App._gxUp): o produto roda em WebView antiga.
 *
 * Carregado pelo index.html; o App procura `GanttGradeUI` NA HORA DA CHAMADA
 * (_cronoGanttLigar, _gxPintar, _gxUp, _gxTecla, onClick). Sem este arquivo o
 * Gantt é o da 1.2.77, byte a byte (tools/test-crono-geometria.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  var CSS_GRADE =
    /* o canto: controles na largura do NOME e os títulos exatamente sobre as
       células (ver CronoExecUI._gxCantoGrade para a conta das margens) */
    ".gx-canto-ctl{flex:0 0 auto;display:flex;gap:4px;align-items:center;min-width:0;overflow:hidden}" +
    ".gx-cab-cols{flex:0 0 auto;display:flex;align-self:stretch;box-sizing:border-box;margin:-4px -7px -4px 0;border-left:1px solid #e2e8f0}" +
    ".gx-cab-t{display:flex;align-items:center;justify-content:flex-end;box-sizing:border-box;padding-right:7px;font-size:12px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden}" +
    ".gx-col-bt svg{pointer-events:none}" +
    ".gx-col-bt[aria-pressed=true]{border-color:#0d6ebd;color:#0d6ebd}" +
    /* o campo sobreposto */
    ".gx-ed{position:absolute;z-index:4;box-sizing:border-box;margin:0;padding:0 6px;height:22px;font:inherit;font-size:12px;line-height:18px;text-align:right;color:#0f172a;background:#fff;border:1.5px solid #0d6ebd;border-radius:4px;outline:none;box-shadow:0 0 0 3px rgba(13,110,189,.18)}" +
    ".gx-ed.gx-ed-erro{border-color:#b91c1c;box-shadow:0 0 0 3px rgba(185,28,28,.20);color:#7f1d1d}" +
    /* ⚠ fora da vista: transparente e sem ponteiro, mas NUNCA `display:none`
       nem `visibility:hidden` — elemento que deixa de ser focável perde o
       foco, e a pessoa que rolou o painel com o campo aberto perderia o que
       estava digitando (passo 7 da e2e-gantt-digitar) */
    ".gx-ed.gx-ed-fora{opacity:0;pointer-events:none}" +
    /* o cartão (colunas escondidas) */
    ".gx-card{position:absolute;z-index:6;box-sizing:border-box;width:268px;max-width:calc(100% - 8px);background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 6px 20px rgba(15,23,42,.18);padding:10px 12px;font-size:13.5px;line-height:18px}" +
    ".gx-card-tit{font-size:12px;font-weight:600;color:#0f172a;margin:0 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".gx-card-lin{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0 0;font-size:12px;font-weight:500;color:#334155}" +
    ".gx-card-in{box-sizing:border-box;width:120px;height:32px;padding:6px 8px;font:inherit;font-size:13.5px;line-height:18px;text-align:right;color:#0f172a;background:#fff;border:1px solid #7e95aa;border-radius:8px;outline:none}" +
    ".gx-card-in:focus{border-color:#0d6ebd;box-shadow:0 0 0 3px rgba(13,110,189,.18)}" +
    ".gx-card-in[readonly]{background:#eef2f7;border-color:transparent;color:#64748b}" +
    // o implícito ("a anterior") em cinza claro, como na célula: preto ali se lê como valor digitado
    ".gx-card-in::placeholder{color:#94a3b8;opacity:1}" +
    ".gx-card-in.gx-ed-erro{border-color:#b91c1c;box-shadow:0 0 0 3px rgba(185,28,28,.20)}" +
    ".gx-card-mot{font-size:12px;line-height:16px;color:#64748b;margin:3px 0 0}" +
    ".gx-card-acoes{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}" +
    ".gx-card-bt{box-sizing:border-box;height:32px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;font:inherit;font-size:13.5px;font-weight:500;cursor:pointer}" +
    ".gx-card-bt.gx-pri{background:#0d6ebd;border-color:#0d6ebd;color:#fff;font-weight:600}";

  var DUPLO_MS = 500, DICA_MS = 4500;

  function CX() { return (typeof CronoExecUI !== "undefined") ? CronoExecUI : global.CronoExecUI; }
  function GU() { return (typeof GanttUI !== "undefined") ? GanttUI : global.GanttUI; }
  function agora() { return Date.now(); }
  function norm(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }
  // o elemento com `attr` a partir do alvo do evento (SVG incluso; sem `closest`, que a WebView antiga não tem)
  function subir(el, attr, parar) {
    for (var n = el; n && n !== parar && n.nodeType === 1; n = n.parentNode) {
      if (n.getAttribute && n.getAttribute(attr) != null) return n;
    }
    return null;
  }
  function injetarCss(doc) {
    try {
      if (!doc || doc.getElementById("css-ganttgrade")) return;
      var s = doc.createElement("style");
      s.id = "css-ganttgrade";
      s.textContent = CSS_GRADE;
      (doc.head || doc.documentElement).appendChild(s);
    } catch (e) {}
  }

  var GanttGradeUI = {
    CSS: CSS_GRADE,
    // o limiar do duplo clique, o MESMO nos dois caminhos (dblclick nativo e App._gxUp)
    DUPLO_MS: DUPLO_MS,

    /* ------------------------------------------------------------------
       LIGAR — chamado pelo gancho da F3 no fim de App._cronoGanttLigar, a
       CADA render (a moldura é nova; os ouvintes do render anterior morreram
       com ela). ⚠ Se havia célula aberta, reabre AGORA, com foco síncrono.
       ------------------------------------------------------------------ */
    ligar: function (app, g) {
      if (!app || !g || !g.wrap) return;
      var doc = g.wrap.ownerDocument || document, self = this;
      injetarCss(doc);
      var inp = doc.createElement("input");
      inp.type = "text";
      inp.className = "gx-ed";
      inp.setAttribute("autocomplete", "off");
      inp.setAttribute("spellcheck", "false");
      inp.setAttribute("data-gx-ed", "1");
      inp.hidden = true;
      g.wrap.appendChild(inp);
      g.gradeEd = inp;
      inp.addEventListener("keydown", function (ev) { self._tecla(app, ev, inp); });
      inp.addEventListener("input", function () {
        var z = app._gx && app._gx.z;
        if (z && z.ed && app._gx.gradeEd === inp) { z.ed.texto = inp.value; z.ed.rtok = app._rtok; }
        inp.classList.remove("gx-ed-erro");
      });
      inp.addEventListener("blur", function () { self._saiu(app, inp); });
      /* clique numa CÉLULA dos nomes. ⚠ `preventDefault` no mousedown: o foco
         não sai do campo aberto (sem blur, sem gravação dupla); quem decide
         gravar o que estava aberto e abrir o clicado é o `abrir`. */
      if (g.nomes) g.nomes.addEventListener("mousedown", function (ev) {
        if (ev.button !== 0) return;
        var cel = subir(ev.target, "data-gx-cel", g.nomes);
        if (!cel) return;
        ev.preventDefault();
        var gg = app._gx; if (!gg || gg.nomes !== g.nomes) return;
        var lin = parseInt(cel.getAttribute("data-gx-linha"), 10);
        var l = gg.pro && gg.pro.L ? gg.pro.L[lin] : null, no = l ? (l.no || l.et) : null;
        if (!no || String(no.id) !== String(cel.getAttribute("data-gx-id"))) return;
        self.abrir(app, gg, no.id, cel.getAttribute("data-gx-cel") === "pred" ? "pred" : "dur", { origem: "clique" });
      });
      /* duplo clique numa barra que NÃO se arrasta (caminho do pan, que não
         repinta — ali o `dblclick` chega). A que se arrasta é detectada em
         App._gxUp. */
      if (g.plot) g.plot.addEventListener("dblclick", function (ev) {
        var gg = app._gx; if (!gg || gg.plot !== g.plot || !gg.pro || !gg.pro.e) return;
        if (agora() - (gg.gradeDuploEm || 0) < DUPLO_MS) return;
        var Gu = GU(); if (!Gu) return;
        var q = gg.plot.getBoundingClientRect();
        var lin = Gu.linhaEmY(gg.pro.e, Gu.yConteudo(gg.pro.e, ev.clientY - q.top));
        var l = lin >= 0 ? gg.pro.L[lin] : null, no = l ? (l.no || l.et) : null;
        if (!no) return;
        ev.preventDefault();
        self.abrir(app, gg, no.id, "dur", { origem: "duplo" });
      });
      this._conferirCanto(app, g);
      var z = g.z, ed = z && z.ed;
      if (ed) {
        /* ⚠ SÓ REABRE O QUE ESTAVA VIVO NO RENDER ANTERIOR. Sem a conferência
           do token, quem saía para outra aba com o campo aberto (o render da
           outra aba não chama o `ligar`) voltava dias depois com uma célula
           abrindo sozinha. */
        if (ed.rtok != null && (app._rtok || 0) - ed.rtok > 1) { z.ed = null; return; }
        // ⚠ sem colunas não há onde reabrir: um campo ali seria o <input> solto sobre o tempo (ver `reposicionar`)
        if (!(Number(g.pro && g.pro.gradeW) > 0)) {
          z.ed = null;
          if (ed.texto != null && ed.orig != null && norm(ed.texto) !== norm(ed.orig)) this._avisoSemColunas(ed.texto);
          return;
        }
        this._abrirEm(app, g, ed.id, ed.campo, { texto: ed.texto, orig: ed.orig, erro: ed.erro, reabrir: true });
      }
    },

    /* ------------------------------------------------------------------
       REPOSICIONAR — gancho da F3 no fim de App._gxPintar (também no quadro
       que não repinta): o campo acompanha a linha dele a cada quadro.
       ------------------------------------------------------------------ */
    reposicionar: function (app, g) {
      if (!app || !g) return;
      this._conferirCanto(app, g);
      var inp = g.gradeEd, ed = g.z && g.z.ed;
      if (!inp || inp.hidden || !ed) { if (g.gradeCard && ed) this._posCard(app, g, ed.id); return; }
      if (!(Number(g.pro && g.pro.gradeW) > 0)) {
        /* ⚠ AS COLUNAS SUMIRAM COM O CAMPO ABERTO (a janela estreitou): FECHA
           SEM GRAVAR e diz. Roteiro do defeito (revisão da F6): o campo ia para
           o cartão, que perdia o texto do Depende de ("2.1+3" virava vazio), e
           o `z.ed` ficava esquecido — Esc no cartão e qualquer render depois
           (nuvem, outra edição) reabriam um <input> SOLTO por cima das barras,
           sem coluna embaixo, roubando o foco; "0" + Enter ali gravou
           "Depende de: 0" na 2.3. Gravar sozinho o que a pessoa não confirmou
           seria pior; o recado diz o que ficou para trás. */
        var mudou = norm(inp.value) !== norm(ed.orig), t = inp.value;
        this.fechar(app, g, true);
        if (mudou) this._avisoSemColunas(t);
        return;
      }
      this._pos(app, g, inp, ed.id, ed.campo);
    },

    _avisoSemColunas: function (t) {
      if (typeof UI !== "undefined" && UI.toast)
        UI.toast("As colunas Dur./Depende de saíram da tela (a janela ficou estreita) e o campo fechou: “" + t + "” NÃO foi gravado. Alargue a janela, ou dê duplo clique na barra para digitar.", "");
    },

    /* O CANTO acompanha a grade. O `_gxPintar` (F3) só reescreve o canto
       quando a FORMA muda (seletor × botão, desfazer); a grade liga e desliga
       com a largura do Gantt (1000 px) sem mudar essa forma — sem isto, ao
       estreitar a janela os títulos "Dur."/"Depende de" ficavam no canto de
       colunas que já não existiam. */
    _conferirCanto: function (app, g) {
      var C = CX(); if (!C || !g.pro || !g.pro.e || !g.wrap || !g.wrap.querySelector) return;
      var p = g.pro, sig = [p.gradeW, p.labelW, p.desfazer, (Number(p.e.largura) + C.ganttProColW(p)) >= C.GX_GRADE_LARGURA ? 1 : 0, p.labelW < 200 ? 1 : 0].join("|");
      /* a frase da grade na legenda segue a MESMA largura medida (ver
         CronoExecUI.ganttProLegGrade): recado que manda digitar em colunas
         que não estão na tela é recado que mente. Fora da assinatura do canto:
         o repintar pode trocar a legenda sem mudar a forma do canto. */
      var raiz = g.wrap.parentNode, leg = raiz && raiz.querySelector ? raiz.querySelector("[data-gx-leg-grade]") : null;
      if (leg && C.ganttProLegGrade) { var fr = C.ganttProLegGrade(p.gradeW); if (leg.textContent !== fr) leg.textContent = fr; }
      if (g.gradeCantoSig === sig) return;
      g.gradeCantoSig = sig;
      var canto = g.wrap.querySelector(".gx-canto"); if (!canto) return;
      var h = C.ganttProTopo(p);
      var dom = (canto.querySelector(".gx-cab-cols") ? "c" : "") + (canto.querySelector(".gx-col-bt") ? "b" : "");
      var quer = (h.indexOf("gx-cab-cols") > -1 ? "c" : "") + (h.indexOf("gx-col-bt") > -1 ? "b" : "");
      var ctl = canto.querySelector(".gx-canto-ctl");
      var largOk = !ctl || Math.abs(parseFloat(ctl.style.width) - Math.max(0, p.labelW - 10)) < 0.5;
      if (dom !== quer || !largOk) canto.innerHTML = h;
    },

    /* ------------------------------------------------------------------
       ABRIR a célula {id, campo}. opts: {origem: "clique"|"duplo"|"tecla",
       texto (1º dígito digitado no Gantt)}.
       ------------------------------------------------------------------ */
    abrir: function (app, g, id, campo, opts) {
      opts = opts || {};
      g = (app && app._gx) || g;
      if (!app || !g || !g.pro || !g.pro.L) return false;
      if (opts.origem === "duplo") g.gradeDuploEm = agora();
      var ed = g.z && g.z.ed, inp = g.gradeEd;
      /* já há uma célula aberta com texto mudado: grava ANTES de abrir a outra
         (clicar em outra célula é "clicar fora"). Recusou → fica onde está,
         com a borda de erro, e a outra não abre. */
      if (ed && inp && !inp.hidden && (String(ed.id) !== String(id) || ed.campo !== campo) && norm(inp.value) !== norm(ed.orig)) {
        return this.commit(app, { para: { id: id, campo: campo } });
      }
      if (!(Number(g.pro.gradeW) > 0)) return this._abrirCard(app, g, id, campo, opts);
      return this._abrirEm(app, g, id, campo, opts);
    },

    _linha: function (g, id) {
      var L = (g && g.pro && g.pro.L) || [], i;
      for (i = 0; i < L.length; i++) { var n = L[i] && (L[i].no || L[i].et); if (n && n.id === id) return i; }
      for (i = 0; i < L.length; i++) { var m = L[i] && (L[i].no || L[i].et); if (m && String(m.id) === String(id)) return i; }
      return -1;
    },
    _celula: function (g, i, campo) {
      var C = CX(); if (!C || !g.pro || !g.pro.L[i]) return null;
      return C.ganttProCelula(g.ctx.r, g.pro.L[i], campo, g.pro);
    },

    _abrirEm: function (app, g, id, campo, opts) {
      opts = opts || {};
      var inp = g.gradeEd, z = g.z, i = this._linha(g, id);
      if (!inp || !z) return false;
      if (i < 0) { z.ed = null; inp.hidden = true; return false; }
      var c = this._celula(g, i, campo);
      if (!c) return false;
      if (c.ro) {
        z.ed = null; inp.hidden = true;
        if (!opts.reabrir) this._recusaAbrir(app, g, i, c, opts);
        return false;
      }
      // a linha escolhida acompanha a célula: Esc devolve ao Gantt com ela marcada
      if (z.sel !== i) { z.sel = i; if (app._gxPintar) app._gxPintar(true); }
      this._trazerParaVista(app, g, i);
      var orig = (opts.orig != null && opts.reabrir && String(opts.orig) === String(c.valor)) ? opts.orig : c.valor;
      /* reabrindo depois de um render de FORA (nuvem, outra janela) com texto
         no meio: devolve o texto só se a célula ainda vale o que valia quando
         a pessoa começou — senão o número por baixo mudou e o texto velho
         seria gravado por cima do novo */
      var texto = (opts.texto != null && (!opts.reabrir || String(opts.orig) === String(c.valor))) ? String(opts.texto) : c.valor;
      z.ed = { id: c.id, campo: campo, orig: orig, texto: texto, rtok: app._rtok };
      inp.value = texto;
      inp.setAttribute("aria-label", (campo === "dur" ? "Duração (dias úteis) de " : "Depende de de ") + this._nomeLinha(g, i));
      inp.title = c.dica || "";
      if (opts.erro) inp.classList.add("gx-ed-erro"); else inp.classList.remove("gx-ed-erro");
      inp.hidden = false;
      if (g.gradeCard) this.fecharCard(app, g);
      this._pos(app, g, inp, c.id, campo);
      /* ⚠ FOCO SÍNCRONO, aqui e agora (nunca num setTimeout/rAF): reabrindo
         depois do render da gravação, é ele que faz a próxima tecla cair no
         campo novo. Medido no controle negativo da e2e-gantt-digitar: sem o
         foco ao reabrir, o Tab corrido gravou [3,4,2,1,8] no lugar de
         [3,6,5,2,9]. ⚠ E o `select()` logo abaixo TAMBÉM dá o foco no Chrome:
         tirar só o `focus()` não reprova nada — a guarda são os dois. */
      try { inp.focus(); } catch (eF) {}
      /* digitou um dígito no Gantt: o campo abre com ele e o cursor no fim
         (a próxima tecla continua o número). Abriu por clique/Enter/F2: tudo
         selecionado (a primeira tecla SUBSTITUI, como no MS Project). */
      try {
        if (opts.texto != null && !opts.reabrir) inp.setSelectionRange(inp.value.length, inp.value.length);
        else if (opts.reabrir && opts.texto != null && opts.texto !== c.valor) inp.setSelectionRange(inp.value.length, inp.value.length);
        else inp.select();
      } catch (eS) {}
      return true;
    },

    _nomeLinha: function (g, i) {
      var l = g.pro.L[i], n = l ? (l.no || l.et) : null;
      if (!n) return "";
      return String(l.no ? ((l.no.numero ? l.no.numero + " " : "") + (n.nome || "")) : ((n.codigo ? n.codigo + " " : "") + (n.nome || "")));
    },

    // a linha fora do corpo (Tab para baixo, Enter na última visível): o painel rola até ela
    _trazerParaVista: function (app, g, i) {
      var rowH = (g.pro && g.pro.e && g.pro.e.rowH) || 24, pl = g.plot;
      if (!pl) return;
      var alt = pl.clientHeight || g.caixa || 0, y = i * rowH, st = pl.scrollTop;
      if (!(alt > 0)) return;
      var novo = st;
      if (y < st) novo = y;
      else if (y + rowH > st + alt) novo = y + rowH - alt;
      if (novo !== st) {
        pl.scrollTop = novo;
        if (g.nomes) g.nomes.scrollTop = pl.scrollTop;
        if (g.z) g.z.scrollTop = pl.scrollTop;
        if (app._gxPintar) app._gxPintar(false);
      }
    },

    /* a posição do campo: sobre a célula, pela LINHA (não pelo nó do SVG, que
       some a cada 24 px), pelo `scrollTop` do painel do tempo e pelo labelW */
    _pos: function (app, g, inp, id, campo) {
      var C = CX(), i = this._linha(g, id);
      if (i < 0 || !C || !g.corpo) { inp.classList.add("gx-ed-fora"); return; }
      var rowH = g.pro.e.rowH || 24, pl = g.plot;
      var topo = g.corpo.offsetTop + i * rowH - (pl ? pl.scrollTop : 0);
      var x = Number(g.pro.labelW) + (campo === "pred" ? C.GX_GRADE_DUR : 0);
      var w = campo === "pred" ? C.GX_GRADE_PRED : C.GX_GRADE_DUR;
      inp.style.left = (x + 1) + "px";
      inp.style.top = (topo + 1) + "px";
      inp.style.width = (w - 2) + "px";
      var rel = i * rowH - (pl ? pl.scrollTop : 0), vis = pl ? (pl.clientHeight || g.caixa || 0) : (g.caixa || 0);
      if (rel < -1 || rel + rowH > vis + 1) inp.classList.add("gx-ed-fora"); else inp.classList.remove("gx-ed-fora");
    },

    /* a célula não se edita: o motivo aparece NA HORA de tentar (o `title`
       não existe no toque nem antes do primeiro gesto). ⚠ Texto puro. No
       aprovado, o duplo clique e o teclado levam à PORTA de verdade (o modal
       de revisão / plano da obra que a tabela usa): trava sem saída faz a
       pessoa procurar a saída errada. */
    _recusaAbrir: function (app, g, i, c, opts) {
      if (c.porta === "revisao" && opts.origem !== "clique" && app._cronoTravado && app._cronoAlvo) {
        var alvo = null;
        try { alvo = app._cronoAlvo(); } catch (eA) { alvo = null; }
        if (alvo && alvo.travado) { app._cronoTravado(alvo); return; }
      }
      this._dica(app, g, i, c.motivo || "Esta célula não se edita.");
      if (opts.origem !== "clique" && typeof UI !== "undefined" && UI.toast) UI.toast(c.motivo || "Esta célula não se edita.", "");
    },
    _dica: function (app, g, i, txt) {
      var d = g.dica; if (!d || !g.corpo) return;
      var rowH = (g.pro && g.pro.e && g.pro.e.rowH) || 24, pl = g.plot;
      d.hidden = false;
      d.textContent = String(txt);   // ⚠ TEXTO PURO: nome de etapa é dado do cliente
      d.style.background = "#0f172a";
      d.style.left = Math.max(2, Number(g.pro.labelW) - 120) + "px";
      d.style.top = (g.corpo.offsetTop + (i + 1) * rowH - (pl ? pl.scrollTop : 0) + 4) + "px";
      var marca = g.gradeDicaT = agora();
      setTimeout(function () { if (g.gradeDicaT === marca && d.textContent === String(txt) && !g.arrasto) d.hidden = true; }, DICA_MS);
    },

    /* ------------------------------------------------------------------
       AS TECLAS do campo (regra 3: sempre `stopPropagation`)
       ------------------------------------------------------------------ */
    _tecla: function (app, ev, inp) {
      ev.stopPropagation();
      var g = app._gx; if (!g || g.gradeEd !== inp) return;
      var ed = g.z && g.z.ed; if (!ed) return;
      if (ev.isComposing) return;
      var k = ev.key, mod = ev.ctrlKey || ev.metaKey || ev.altKey;
      if (k === "Enter" && !mod) { ev.preventDefault(); this.commit(app, { mover: ev.shiftKey ? "cima" : "baixo" }); return; }
      if (k === "Tab" && !mod) { ev.preventDefault(); this.commit(app, { mover: ev.shiftKey ? "voltar" : "tab" }); return; }
      if ((k === "ArrowDown" || k === "ArrowUp") && !mod && !ev.shiftKey) { ev.preventDefault(); this.commit(app, { mover: k === "ArrowDown" ? "baixo" : "cima" }); return; }
      if (k === "Escape" || k === "Esc") { ev.preventDefault(); this.cancelar(app); return; }
      /* Ctrl+Z com o campo SEM mudança desfaz a última alteração do cronograma
         (digitada ou arrastada). Com texto mudado é o desfazer do próprio
         texto — do navegador, que a pessoa já conhece. */
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && String(k).toLowerCase() === "z" && norm(inp.value) === norm(ed.orig)) {
        ev.preventDefault();
        ed.rtok = app._rtok;
        if (app.cronoArrastoDesfazer) app.cronoArrastoDesfazer();
      }
    },

    /* ------------------------------------------------------------------
       COMMIT. opts: {mover: "baixo"|"cima"|"tab"|"voltar"|"fora"|null,
       para: {id, campo} (a célula clicada)}.
       ⚠ O destino é marcado ANTES de gravar: a gravação redesenha a aba
       (render) e é o `ligar` desse render que reabre o campo — com foco
       síncrono, as teclas que a pessoa já está digitando caem no campo novo.
       ------------------------------------------------------------------ */
    commit: function (app, opts) {
      opts = opts || {};
      var g = app._gx; if (!g) return false;
      var inp = g.gradeEd, ed = g.z && g.z.ed;
      if (!inp || !ed) return false;
      var txt = inp.value, fora = opts.mover === "fora";
      var destino = opts.para || (opts.mover && !fora ? this._proxima(g, ed, opts.mover) : null);
      if (norm(txt) === norm(ed.orig)) {
        if (destino) return this._abrirEm(app, g, destino.id, destino.campo, {});
        this.fechar(app, g, !fora);
        return true;
      }
      var z = g.z;
      z.ed = destino ? { id: destino.id, campo: destino.campo, rtok: app._rtok } : null;
      g.gradeGravando = true;
      /* ⚠ UM TOAST SÓ POR VEZ PARA A GRADE (revisão da F6, plano da obra do
         galpão): o Tab corrido de 4.1 a 5.1 empilhou os toasts verdes de duas
         linhas — no modo executivo o dobro — por cima das linhas que estavam
         sendo digitadas. Digitar como no MS Project são N alterações seguidas;
         quem digita não pode perder a vista da própria grade. O recado desta
         gravação (inclusive a RECUSA, que sai antes do caminho único) vira UM
         e tira o da gravação anterior: a mesma chave "crono" do caminho único
         (UI.toastJuntar — um dono só, e não uma segunda pilha aqui). */
      var res = null, marcaT = (typeof UI !== "undefined" && UI.toastMarca) ? UI.toastMarca() : null;
      try { res = app._cronoGravarDigitado({ id: ed.id, campo: ed.campo, texto: txt, origem: "grade" }); }
      finally { g.gradeGravando = false; if (marcaT && UI.toastJuntar) UI.toastJuntar(marcaT, "crono", 420); }
      var g2 = app._gx;
      if (res && res.ok) {
        if (res.mudou === false) {
          // o texto é o mesmo valor escrito de outro jeito ("1 + 7" = "1+7"): nada gravado, só anda
          if (destino && g2) return this._abrirEm(app, g2, destino.id, destino.campo, {});
          this.fechar(app, g2 || g, !fora);
          return true;
        }
        // gravou: o render já reabriu no destino (ou fechou, sem destino)
        if (!destino && g2 && !fora && g2.plot && g2.plot.focus) { try { g2.plot.focus(); } catch (eP) {} }
        return true;
      }
      /* RECUSOU (o recado já saiu). Com Enter/Tab/↑↓: o campo fica ABERTO na
         mesma célula, com a borda de erro e o texto que a pessoa digitou, para
         ela corrigir. Clicando fora: fecha e devolve o valor. */
      if (!g2 || !g2.z) return false;
      if (fora || (res && res.travadoAprovacao)) { g2.z.ed = null; if (g2.gradeEd) g2.gradeEd.hidden = true; return false; }
      g2.z.ed = null;
      this._abrirEm(app, g2, ed.id, ed.campo, { texto: txt, orig: ed.orig, erro: true, reabrir: true });
      if (g2.z.ed) { g2.z.ed.orig = ed.orig; g2.z.ed.erro = true; }
      return false;
    },

    cancelar: function (app) {
      var g = app._gx; if (!g) return;
      var inp = g.gradeEd, ed = g.z && g.z.ed;
      if (inp && ed) inp.value = ed.orig;
      this.fechar(app, g, true);
    },

    fechar: function (app, g, focarGantt) {
      if (!g) return;
      if (g.z) g.z.ed = null;
      var inp = g.gradeEd;
      if (inp) {
        g.gradeFechando = true;
        inp.classList.remove("gx-ed-erro");
        if (focarGantt && g.plot && g.plot.focus) { try { g.plot.focus(); } catch (eF) {} }
        inp.hidden = true;
        g.gradeFechando = false;
      }
    },

    /* o foco saiu do campo. Adiado um tique para o `activeElement` já ser o
       destino (clique na célula do cartão, janela que perdeu o foco).
       ⚠ E NUNCA GRAVA NO MEIO DE UM ARRASTO OU PAN. Roteiro do defeito
       (revisão da F6, mouse real, galpão R1 a 1366): "5" digitado na Dur. da
       2.1 sem Enter e a pessoa pega a barra da 2.3. O mousedown chama
       `plot.focus()` (blur aqui), e o setTimeout(0) roda ENTRE o mousedown e o
       1º mousemove — são tarefas separadas. Gravar ali redesenhava a aba,
       trocava o App._gx por baixo do gesto: o arrasto sumia calado (s2c
       continuou 1) e o foco caía no <body>. Com gesto em curso o commit fica
       PENDENTE e é o App._gxUp que o roda, antes da soltura (ver
       `pendenteNoUp`): o que se digitou primeiro grava primeiro.
       ⚠ Janela que perdeu o foco inteiro (a pessoa foi para outro programa)
       NÃO grava: ela volta e continua digitando. */
    _saiu: function (app, inp) {
      var self = this;
      var g0 = app._gx;
      if (!g0 || g0.gradeEd !== inp || g0.gradeGravando || g0.gradeFechando) return;
      setTimeout(function () {
        var g = app._gx;
        if (!g || g.gradeEd !== inp || inp.hidden || !g.z || !g.z.ed) return;
        var doc = inp.ownerDocument || document;
        if (doc.activeElement === inp) return;
        if (doc.hasFocus && !doc.hasFocus()) return;
        if (g.gradeCard && g.gradeCard.contains && g.gradeCard.contains(doc.activeElement)) return;
        if (g.arrasto || g.pan) { g.gradePendente = inp; return; }
        self.commit(app, { mover: "fora" });
      }, 0);
    },

    /* chamado pelo App._gxUp ANTES de soltar o arrasto/pan: grava o campo que
       o blur deixou pendente (ver `_saiu`). Devolve true se gravou/fechou algo
       (o App._gx pode ter sido trocado pelo render). */
    pendenteNoUp: function (app, g) {
      if (!app || !g || !g.gradePendente) return false;
      var inp = g.gradePendente;
      g.gradePendente = null;
      if (g.gradeEd !== inp || inp.hidden || !g.z || !g.z.ed) return false;
      this.commit(app, { mover: "fora" });
      /* o gesto era no Gantt: o foco volta ao painel do tempo (o render da
         gravação deixou o foco no <body>, e o Ctrl+Z/setas seguintes iam para
         lugar nenhum) */
      var g2 = app._gx;
      if (g2 && g2.plot && g2.plot.focus) { try { g2.plot.focus(); } catch (eP) {} }
      return true;
    },

    /* a próxima célula EDITÁVEL: ↑↓ na mesma coluna; Tab Dur. → Depende de →
       Dur. da linha de baixo; Shift+Tab volta. Linha só leitura é pulada
       (serviço nunca se edita: pulado sem perguntar ao motor). */
    _proxima: function (g, ed, mover) {
      var L = g.pro && g.pro.L; if (!L) return null;
      var i0 = this._linha(g, ed.id); if (i0 < 0) return null;
      var campos = ["dur", "pred"], k0 = campos.indexOf(ed.campo), j, kk, c;
      if (mover === "baixo" || mover === "cima") {
        var passo = mover === "baixo" ? 1 : -1;
        for (j = i0 + passo; j >= 0 && j < L.length; j += passo) {
          if (!L[j] || L[j].tipo === "servico") continue;
          c = this._celula(g, j, ed.campo);
          if (c && !c.ro) return { id: c.id, campo: ed.campo };
        }
        return null;
      }
      if (mover === "tab") {
        for (j = i0; j < L.length; j++) {
          if (!L[j] || L[j].tipo === "servico") continue;
          for (kk = (j === i0 ? k0 + 1 : 0); kk < 2; kk++) { c = this._celula(g, j, campos[kk]); if (c && !c.ro) return { id: c.id, campo: campos[kk] }; }
        }
        return null;
      }
      if (mover === "voltar") {
        for (j = i0; j >= 0; j--) {
          if (!L[j] || L[j].tipo === "servico") continue;
          for (kk = (j === i0 ? k0 - 1 : 1); kk >= 0; kk--) { c = this._celula(g, j, campos[kk]); if (c && !c.ro) return { id: c.id, campo: campos[kk] }; }
        }
        return null;
      }
      return null;
    },

    /* ------------------------------------------------------------------
       O CARTÃO (colunas escondidas ou Gantt estreito): os dois campos da
       linha, [Gravar] [Cancelar], ao lado da linha e SEM cobrir a barra dela
       — a barra é o que a pessoa está conferindo enquanto digita (a maquete
       da EDICAO.md, foto 08, cobria 7 linhas e as setas das vizinhas).
       ------------------------------------------------------------------ */
    _abrirCard: function (app, g, id, campo, opts) {
      opts = opts || {};
      var C = CX(), i = this._linha(g, id);
      if (!C || i < 0 || !g.wrap) return false;
      var cD = this._celula(g, i, "dur"), cP = this._celula(g, i, "pred");
      if (!cD || !cP) return false;
      if (cD.ro && cP.ro) { this._recusaAbrir(app, g, i, cD, opts); return false; }
      if (g.gradeCard) this.fecharCard(app, g);
      var doc = g.wrap.ownerDocument || document, self = this;
      injetarCss(doc);
      var card = doc.createElement("div");
      card.className = "gx-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("data-gx-card", "1");
      var tit = doc.createElement("div");
      tit.className = "gx-card-tit";
      tit.textContent = this._nomeLinha(g, i);   // ⚠ texto puro
      tit.title = tit.textContent;
      card.setAttribute("aria-label", "Duração e Depende de — " + tit.textContent);
      card.appendChild(tit);
      var campos = {};
      function linha(rotulo, c, nome) {
        var lin = doc.createElement("label"); lin.className = "gx-card-lin";
        var sp = doc.createElement("span"); sp.textContent = rotulo; lin.appendChild(sp);
        var inp = doc.createElement("input"); inp.type = "text"; inp.className = "gx-card-in";
        inp.setAttribute("data-gx-card-campo", nome);
        if (nome === "dur") inp.setAttribute("inputmode", "numeric");
        inp.setAttribute("autocomplete", "off"); inp.setAttribute("spellcheck", "false");
        inp.value = c.valor; inp.placeholder = c.vazio || "";
        inp.title = c.ro ? c.motivo : c.dica;
        if (c.ro) { inp.readOnly = true; inp.setAttribute("aria-readonly", "true"); }
        lin.appendChild(inp); card.appendChild(lin);
        if (c.ro) { var mot = doc.createElement("div"); mot.className = "gx-card-mot"; mot.textContent = c.motivo; card.appendChild(mot); }
        inp.addEventListener("keydown", function (ev) {
          ev.stopPropagation();
          if (ev.isComposing) return;
          if (ev.key === "Enter") { ev.preventDefault(); self._gravarCard(app); }
          else if (ev.key === "Escape" || ev.key === "Esc") { ev.preventDefault(); self.fecharCard(app, app._gx, true); }
          else if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey && String(ev.key).toLowerCase() === "z" &&
            norm(campos.dur.value) === norm(campos.dur._orig) && norm(campos.pred.value) === norm(campos.pred._orig)) {
            ev.preventDefault(); self.fecharCard(app, app._gx, false); if (app.cronoArrastoDesfazer) app.cronoArrastoDesfazer();
          }
        });
        inp.addEventListener("input", function () { inp.classList.remove("gx-ed-erro"); });
        inp._orig = c.valor; inp._ro = !!c.ro;
        campos[nome] = inp;
      }
      linha("Dur. (dias úteis)", cD, "dur");
      linha("Depende de", cP, "pred");
      var acoes = doc.createElement("div"); acoes.className = "gx-card-acoes";
      var bC = doc.createElement("button"); bC.type = "button"; bC.className = "gx-card-bt"; bC.textContent = "Cancelar";
      var bG = doc.createElement("button"); bG.type = "button"; bG.className = "gx-card-bt gx-pri"; bG.textContent = "Gravar";
      bC.addEventListener("click", function (ev) { ev.stopPropagation(); self.fecharCard(app, app._gx, true); });
      bG.addEventListener("click", function (ev) { ev.stopPropagation(); self._gravarCard(app); });
      acoes.appendChild(bC); acoes.appendChild(bG); card.appendChild(acoes);
      // o cartão não deixa o clique vazar para o Gantt (pan/arrasto) nem o mousedown tirar o foco do campo à toa
      card.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
      g.wrap.appendChild(card);
      g.gradeCard = card;
      g.gradeCardCampos = campos;
      g.gradeCardId = cD.id;
      if (g.z && g.z.sel !== i) { g.z.sel = i; if (app._gxPintar) app._gxPintar(true); }
      this._posCard(app, g, cD.id);
      var foco = (campo === "pred" && !cP.ro) || cD.ro ? campos.pred : campos.dur;
      // o texto vai para o campo PEDIDO (antes só a Dur. recebia: o "Depende de" abria vazio)
      if (opts.texto != null && !foco._ro) foco.value = String(opts.texto);
      try { foco.focus(); if (opts.texto != null) foco.setSelectionRange(foco.value.length, foco.value.length); else foco.select(); } catch (eF) {}
      return true;
    },

    _posCard: function (app, g, id) {
      var card = g.gradeCard, Gu = GU(); if (!card || !g.pro || !g.pro.e || !Gu) return;
      var i = this._linha(g, id), p = g.pro, e = p.e, pl = g.plot;
      if (i < 0) { this.fecharCard(app, g); return; }
      var l = p.L[i], no = l.no || l.et, rowH = e.rowH || 24;
      var colW = CX().ganttProColW(p), sl = pl ? pl.scrollLeft : 0, W = g.wrap.clientWidth || 0;
      var cw = card.offsetWidth || 268, chh = card.offsetHeight || 160;
      var x0 = no && no.inicio != null ? colW + Gu.xDoDia(e, no.inicio) - sl : colW;
      var x1 = no && no.fim != null ? colW + Gu.xDoDia(e, no.fim) - sl : colW;
      var dir = W - x1 - 12, esq = x0 - colW - 12, left;
      // o lado com MAIS espaço; sem espaço nenhum dos dois lados, por cima da coluna de nomes (que não é a barra)
      if (dir >= cw) left = x1 + 12;
      else if (esq >= cw) left = x0 - 12 - cw;
      else left = 4;
      left = Math.max(4, Math.min(left, Math.max(4, W - cw - 4)));
      var topo = g.corpo.offsetTop + i * rowH - (pl ? pl.scrollTop : 0) - 4;
      var maxT = g.corpo.offsetTop + (g.caixa || 0) - chh;
      topo = Math.max(2, Math.min(topo, Math.max(2, maxT)));
      card.style.left = Math.round(left) + "px";
      card.style.top = Math.round(topo) + "px";
    },

    _gravarCard: function (app) {
      var g = app._gx; if (!g || !g.gradeCard || !g.gradeCardCampos) return false;
      var cs = g.gradeCardCampos, pedidos = [];
      if (!cs.dur._ro && norm(cs.dur.value) !== norm(cs.dur._orig)) pedidos.push({ campo: "dur", texto: cs.dur.value });
      if (!cs.pred._ro && norm(cs.pred.value) !== norm(cs.pred._orig)) pedidos.push({ campo: "pred", texto: cs.pred.value });
      if (!pedidos.length) { this.fecharCard(app, g, true); return true; }
      var id = g.gradeCardId, card = g.gradeCard;
      var res = app._cronoGravarDigitado({ id: id, campos: pedidos, origem: "cartao" });
      if (res && res.ok) {
        if (app._gx === g) this.fecharCard(app, g, true);
        else if (app._gx && app._gx.plot && app._gx.plot.focus) { try { app._gx.plot.focus(); } catch (eP) {} }
        return true;
      }
      // recusou: o cartão fica, com a borda de erro no campo recusado (o recado já saiu)
      if (app._gx === g && g.gradeCard === card) {
        var alvoC = (res && res.campo === "pred") ? cs.pred : cs.dur;
        alvoC.classList.add("gx-ed-erro");
        try { alvoC.focus(); } catch (eF) {}
      }
      return false;
    },

    fecharCard: function (app, g, focarGantt) {
      if (!g || !g.gradeCard) return;
      var card = g.gradeCard;
      g.gradeCard = null; g.gradeCardCampos = null; g.gradeCardId = null;
      try { if (card.parentNode) card.parentNode.removeChild(card); } catch (e) {}
      if (focarGantt && g.plot && g.plot.focus) { try { g.plot.focus(); } catch (eF) {} }
    },

    /* ------------------------------------------------------------------
       [Colunas] (canto do Gantt): mostra/esconde Dur. e Depende de. É
       preferência de TELA desta pessoa neste computador (js/paineis.js, a
       chave `gxColunas`), nunca do orçamento — as `prefs` viajam para a
       nuvem e para o cliente.
       ------------------------------------------------------------------ */
    colunas: function (app, ligar) {
      if (!app) return;
      var P = (typeof Paineis !== "undefined") ? Paineis : null;
      var prefs = (app._gxPaineis) ? app._gxPaineis() : null;
      var guardou = false;
      if (P && app._paineisHash) {
        var st = null;
        try { st = global.localStorage; } catch (eS) { st = null; }
        /* ligada é o PADRÃO (decisão D4): gravar `true` seria guardar o que já
           é padrão — apaga a chave, e a tela segue o padrão se ele mudar */
        guardou = P.gravar(st, app._paineisHash, "gxColunas", ligar ? null : false);
      }
      if (prefs && typeof prefs === "object") { if (ligar) delete prefs.gxColunas; else prefs.gxColunas = false; }
      if (app.render) app.render();
      try {
        var bt = document.querySelector('#aba-conteudo [data-acao="gx-colunas"]');
        if (bt && bt.focus) bt.focus();
      } catch (eB) {}
      /* ⚠ recado honesto: sem armazenamento (janela anônima, site bloqueado)
         a escolha vale só até fechar a aba — dizer que "ficou guardada"
         seria mentir para quem vai reabrir amanhã e ver outra coisa */
      if (!guardou && typeof UI !== "undefined" && UI.toast)
        UI.toast("Colunas " + (ligar ? "mostradas" : "escondidas") + " nesta tela — não consegui guardar a escolha neste navegador: ao reabrir, elas voltam ao padrão.", "");
    }
  };

  global.GanttGradeUI = GanttGradeUI;
  if (typeof module !== "undefined" && module.exports) module.exports = GanttGradeUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimshell.js — A CASCA do módulo BIM, na organização do Revit.
 *
 * Monta em volta do viewer 3D: barra de título, acesso rápido, abas,
 * fita de comandos, Propriedades, Navegador de Projeto, abas de documento,
 * barra de controle da vista e barra de status.
 *
 * Onde isto mora na arquitetura:
 *   js/bimribbon.js  → QUE comandos existem e o estado deles  (puro)
 *   js/bimcmd.js     → o que cada comando FAZ                 (puro)
 *   js/bimshell.js   → como isso APARECE                      (este)
 *   js/bim.js        → o viewer three.js                      (motor)
 *
 * A casca fica FORA do host do viewer. O bim.js continua dono só do
 * canvas e dos painéis flutuantes que vivem sobre ele — assim o re-home
 * do viewer (que reaproveita o WebGL entre renders) não é afetado por
 * nada daqui, e trocar a casca não arrisca vazar contexto gráfico.
 *
 * ES5, sem framework. Desenho burro: recebe de BimRibbon.render() tudo já
 * resolvido (ativo, habilitado, motivo) e só pinta.
 * ===================================================================== */
(function (global) {
  "use strict";

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function ico(nome, tam) {
    if (typeof Icones !== "undefined" && Icones.get) {
      var s = Icones.get(nome, tam || 24);
      if (s) return s;
    }
    /* sem ícone registrado: um quadrado discreto, nunca um buraco */
    var t = tam || 24;
    return '<svg viewBox="0 0 24 24" width="' + t + '" height="' + t + '" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
  }
  function R() { return global.BimRibbon || null; }
  function CMD() { return global.BimCmd || null; }

  var Shell = {
    _raiz: null,
    _palco: null,
    _opts: null,
    _focoTravado: "",      /* ver travarFoco */
    _estado: { docs: [{ id: "3d", nome: "{3D}", ativo: true }], selecao: null, arvore: null, props: null },

    /* ---------------------------------------------------------------
     * montar(container, opts)
     * opts = {
     *   arquivo: "Obra Murumbir",          // vai no alto, como no Revit
     *   tema: "claro" | "escuro",
     *   onPalco: function(divDoPalco) {},  // aqui o bim.js monta o viewer
     *   onComando: function(id, res) {},   // depois de cada comando
     *   onVista: function(id, ligado) {},  // barra de controle da vista
     *   onNo: function(no) {}              // clique no Navegador
     * }
     * --------------------------------------------------------------- */
    montar: function (container, opts) {
      if (!container) return null;
      /* Só existe UMA casca. Montar outra sem enterrar a anterior deixava a
         primeira viva no DOM, respondendo a clique e recebendo eventos de
         teclado, enquanto pintarProps/pintarFita já mexiam só na nova. */
      if (this._raiz && this._raiz !== container) {
        var velha = this._raiz;
        this.desmontar();
        /* mas não arranca a velha se o container novo mora DENTRO dela — isso
           levaria junto o canvas do 3D, que vive no palco. */
        var dentro = velha.contains && velha.contains(container);
        if (!dentro && velha.parentNode) velha.parentNode.removeChild(velha);
      }
      this._opts = opts = opts || {};
      var self = this;

      var raiz = el("div", "bim-revit");
      raiz.setAttribute("data-rv-tema", opts.tema === "escuro" ? "escuro" : "claro");
      this._raiz = raiz;

      raiz.appendChild(this._titulo(opts));
      raiz.appendChild(this._abas());
      raiz.appendChild(el("div", "rv-fita"));

      var corpo = el("div", "rv-corpo");
      corpo.appendChild(this._lateral());
      /* a lateral recolhida vira só uma ABA com a seta, na borda esquerda —
         clicar nela traz Propriedades e Navegador de volta (como no Revit) */
      var abaLat = el("button", "rv-lat-aba");
      abaLat.type = "button"; abaLat.title = "Mostrar Propriedades e Navegador de projeto";
      abaLat.innerHTML = '<span class="rv-lat-aba-seta">▶</span><span class="rv-lat-aba-rot">Propriedades</span>';
      abaLat.onclick = function () { self.alternarLateralFixa(false); };
      corpo.appendChild(abaLat);
      var alcaLat = el("div", "rv-alca rv-alca-lat");
      alcaLat.title = "Arraste para alargar ou estreitar a coluna";
      corpo.appendChild(alcaLat);

      var area = el("div", "rv-area");
      area.appendChild(this._docs());
      var palco = el("div", "rv-palco");
      this._palco = palco;
      area.appendChild(palco);
      area.appendChild(this._vistabar());
      corpo.appendChild(area);

      /* A JANELA DA DIREITA: as ferramentas abertas pela fita (Sondagem,
         Projeto estrutural, Pontos de vista…) entram aqui, AO LADO do 3D —
         não por cima dele — com o nome no alto e a borda arrastável. */
      var alcaDir = el("div", "rv-alca rv-alca-dir");
      alcaDir.title = "Arraste para alargar ou estreitar o painel";
      corpo.appendChild(alcaDir);
      var dir = el("div", "rv-direita");
      corpo.appendChild(dir);
      this._direita = dir;
      raiz.appendChild(corpo);

      raiz.appendChild(this._status());

      /* preferência de quem já escondeu a lateral antes — ver `alternarLateralFixa` */
      try { if (localStorage.getItem("orcapro:bim:lateral-off") === "1") raiz.setAttribute("data-rv-lateral-off", "1"); } catch (e) {}
      /* larguras lembradas (lateral, divisória Propriedades/Navegador) e o tamanho da interface */
      try {
        var lw = +localStorage.getItem("orcapro:bim:lateral-w"); if (lw >= 200 && lw <= 700) raiz.style.setProperty("--rv-lat-w", lw + "px");
        var ph = +localStorage.getItem("orcapro:bim:props-h"); if (ph >= 15 && ph <= 85) raiz.style.setProperty("--rv-props-h", ph + "%");
        var ui = +localStorage.getItem("orcapro:bim:escala-ui"); if (ui >= 0.7 && ui <= 1.3) raiz.style.setProperty("--rv-ui", String(ui));
      } catch (eL) {}
      this._ligarAlcas(raiz, alcaLat, alcaDir);

      container.innerHTML = "";
      container.appendChild(raiz);

      this.pintarFita();
      this.pintarProps(null);
      this.pintarArvore(opts.arvore || null);

      /* teclado: Esc cancela, Enter repete — como no Revit */
      this._onKey = function (ev) {
        if (!self._raiz || !document.body.contains(self._raiz)) return;
        var alvo = ev.target || {};
        var digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName || "") || alvo.isContentEditable;
        if (digitando) return;
        /* ⚠ o foco sai ANTES de cancelar o comando: quem está no modo foco e
           aperta Esc quer voltar a ver a tela inteira. Cancelar a ferramenta
           junto tiraria as duas coisas de uma vez, e a pessoa não saberia
           qual das duas ela pediu. Um Esc, uma ação. */
        /* ⚠ `stopPropagation`, não só `return`. O `return` sai DESTE handler; o do
           viewer está pendurado no `window` (js/bim.js) e o `document` borbulha ANTES
           dele — os dois rodavam no mesmo Esc. Quem estava no modo foco com a trena
           no 1º ponto saia do foco E perdia a medição de uma vez. Parar a propagação
           aqui é o que faz valer o "um Esc, uma ação" que a nota acima promete. */
        /* foco TRAVADO (janela do 3D, ver `travarFoco`): o Esc não sai do
           foco — segue para cancelar a ferramenta, como fora do foco */
        if (ev.key === "Escape" && !self._focoTravado && self.focoAtivo()) { self.alternarFoco(false); ev.preventDefault(); ev.stopPropagation(); return; }
        if (ev.key === "Escape") { var n = CMD() && CMD().cancelar(); if (n) { self.pintarFita(); ev.preventDefault(); } }
        else if (ev.key === "Enter") { var c = CMD(); if (c && c.ultimo()) { c.repetir(); self.pintarFita(); ev.preventDefault(); } }
      };
      document.addEventListener("keydown", this._onKey);

      if (typeof opts.onPalco === "function") opts.onPalco(palco);
      return { raiz: raiz, palco: palco };
    },

    /* O que dizer quando o usuário clica num comando que ainda não existe.
       Cada um aponta o que já dá para fazer no lugar — a alternativa é o que
       importa, não o pedido de desculpas. */
    _ALTERNATIVA: {
      "exportar-ifc": "Por enquanto: \"Enviar ao Revit\" leva o orçamento e o avanço para o plugin dentro do Revit.",
      "porta": "Por enquanto: em \"Paginar alvenaria\" você lança o vão de porta e ele desconta o bloco fiada a fiada, com a verga.",
      "janela": "Por enquanto: em \"Paginar alvenaria\" o vão de janela sai com verga, contraverga e o desconto de área.",
      "cobertura": "Por enquanto: a cobertura entra pelo IFC importado.",
      "combinar": "Por enquanto: use \"Tipos de parede\" e escolha o mesmo tipo nos dois.",
      "plano-trabalho": "Por enquanto: a altura de referência vem do nível ativo, em Níveis.",
      "graute": "Por enquanto: \"Paginar alvenaria\" já posiciona a cinta, a verga e a contraverga em canaleta — falta só o m³ de graute e o kg de aço.",
      "aplicar-ambiente": "Por enquanto: escolha o tipo em \"Padrões prontos\" e ele vale para as paredes novas."
    },

    _emBreve: function (c) {
      var rot = String(c.rotulo || "").split(String.fromCharCode(10)).join(" ");
      var alt = this._ALTERNATIVA[c.id] || "";
      var txt = "\"" + rot + "\" ainda não está pronto — está no roteiro." + (alt ? " " + alt : "");
      this.status(txt);
      if (typeof UI !== "undefined" && UI.toast) UI.toast(txt, "aviso");
    },

    desmontar: function () {
      if (this._onKey) { document.removeEventListener("keydown", this._onKey); this._onKey = null; }
      /* ⚠ `_btnSairFoco` TEM de morrer junto. `Shell` é singleton e o app remonta
         a casca a cada visita à aba BIM. Se a referência sobrevive, a guarda
         `if (novo && !this._btnSairFoco)` fica falsa para sempre e o botão de sair
         do foco aponta para uma raiz já descartada: da 2ª visita em diante o
         usuário entra em tela cheia e NÃO TEM COMO SAIR pelo botão. */
      this._raiz = null; this._palco = null; this._btnSairFoco = null;
    },
    palco: function () { return this._palco; },
    raiz: function () { return this._raiz; },

    /* ---------------------------------------------------------- TÍTULO */
    _titulo: function (opts) {
      var self = this;
      var t = el("div", "rv-titulo");
      /* o BIM abre como um programa à parte (tela inteira): esta é a porta de
         volta para o resto do OrçaPRO */
      if (typeof opts.onSair === "function") {
        var bSair = el("button", "rv-sair");
        bSair.type = "button"; bSair.title = "Voltar ao OrçaPRO (os módulos de orçamento, obras, financeiro…)";
        bSair.innerHTML = ico("voltar", 14) + "<span>OrçaPRO</span>";
        bSair.onclick = function () { opts.onSair(); };
        t.appendChild(bSair);
      }
      var qat = el("div", "rv-qat");
      [
        { id: "salvar-modelo", ico: "salvar", dica: "Salvar no projeto" },
        { id: "abrir-ifc", ico: "abrir", dica: "Abrir modelo IFC" },
        { id: "desfazer", ico: "voltar", dica: "Desfazer (Ctrl+Z)" },
        { id: "refazer", ico: "avancar", dica: "Refazer (Ctrl+Y)" },
        { id: "foto", ico: "camera", dica: "Foto da vista" }
      ].forEach(function (b) {
        var bt = el("button");
        bt.type = "button"; bt.title = b.dica; bt.setAttribute("aria-label", b.dica);
        bt.innerHTML = ico(b.ico, 15);
        bt.onclick = function () { self.executar(b.id); };
        qat.appendChild(bt);
      });
      t.appendChild(qat);

      var nome = el("div", "rv-titulo-nome");
      /* a obra é escolhida AQUI (o cabeçalho da página some no modo programa):
         o <select> fala pela delegação do app (data-gacao + change) */
      if (opts.obras && opts.obras.length) {
        var sel = el("select", "rv-obra");
        sel.setAttribute("data-gacao", "bim-troca-obra");
        sel.title = "Obra (o cronograma 4D e o que fica guardado no BIM são dela)";
        var o0 = el("option", null, "— sem obra (sequência padrão) —"); o0.value = ""; sel.appendChild(o0);
        opts.obras.forEach(function (o) { var op = el("option", null, o.nome); op.value = o.id; if (o.id === opts.obraSel) op.selected = true; sel.appendChild(op); });
        nome.appendChild(sel);
        nome.appendChild(el("span", "rv-titulo-app", "— OrçaPRO BIM"));
      } else {
        nome.textContent = (opts.arquivo ? opts.arquivo + " — " : "") + "OrçaPRO BIM";
      }
      t.appendChild(nome);

      var dir = el("div", "rv-qat");
      /* AS AÇÕES DA PÁGINA MORAM AQUI (Reunião, Maximizar, 3D em outra janela,
         Revit, orçamento, quantitativo, QR). Eram duas linhas de botões ACIMA da
         janela do BIM, que roubavam altura do 3D. Vêm prontas de quem monta
         (opts.acoes) com o `data-gacao` de sempre: o clique segue pela delegação
         do app (App.onClick), os ids ficam (as e2e e o contador da Reunião os
         procuram) — só muda o lugar. */
      if (opts.acoes && opts.acoes.length) {
        var ac = el("div", "rv-titulo-acoes");
        opts.acoes.forEach(function (a) {
          var b = el("button", "rv-tacao" + (a.primario ? " rv-tacao-pri" : ""));
          b.type = "button";
          if (a.id) b.id = a.id;
          if (a.gacao) b.setAttribute("data-gacao", a.gacao);
          b.title = a.dica || a.rotulo || "";
          b.setAttribute("aria-label", a.rotulo || a.dica || "");
          b.innerHTML = ico(a.ico || "quadrado", 14) + '<span class="rv-tacao-rot">' + esc(a.rotulo || "") + "</span>";
          ac.appendChild(b);
        });
        dir.appendChild(ac);
      }
      var bTema = el("button");
      bTema.type = "button"; bTema.title = "Alternar tema claro/escuro";
      bTema.innerHTML = ico("tema", 15);
      bTema.onclick = function () { self.trocarTema(); };
      dir.appendChild(bTema);
      var bCheia = el("button");
      bCheia.type = "button"; bCheia.title = "Tela cheia";
      bCheia.innerHTML = ico("expandir", 15);
      bCheia.onclick = function () { self.telaCheia(); };
      dir.appendChild(bCheia);
      t.appendChild(dir);
      return t;
    },

    /* ------------------------------------------------------------ ABAS */
    _abas: function () {
      var self = this, r = R();
      var d = el("div", "rv-abas");
      d.setAttribute("role", "tablist");
      if (!r) return d;
      r.abas().forEach(function (a) {
        var b = el("button", "rv-aba" + (a.id === "arquivo" ? " rv-aba-arquivo" : ""), a.rotulo);
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("data-rv-aba", a.id);
        b.setAttribute("aria-selected", a.id === r.abaAtiva() ? "true" : "false");
        b.onclick = function () {
          r.irPara(a.id);
          self._raiz.querySelectorAll("[data-rv-aba]").forEach(function (x) {
            x.setAttribute("aria-selected", x.getAttribute("data-rv-aba") === a.id ? "true" : "false");
          });
          self.pintarFita();
        };
        d.appendChild(b);
      });
      d.appendChild(this._rapidos());
      return d;
    },

    /* ------------------------------------------------- BOTÕES RÁPIDOS
     * À direita das abas, o que se usa o tempo todo e morava FLUTUANDO em cima
     * do 3D (+ IFC, órbita/voo, enquadrar, ultra) — agora com o arquivo da obra.
     * São comandos da fita: passam por `executar` e herdam disponibilidade e
     * estado (aceso/apagado) do BimRibbon, repintados junto com a fita. */
    _RAPIDOS: [
      { id: "abrir-ifc", rot: "+ IFC", ico: "abrir", pri: true },
      { id: "arquivo-obra", rot: "Arquivo da obra", ico: "pasta" },
      { sep: true },
      { id: "orbita", rot: "Órbita", ico: "ciclo" },
      { id: "voo", rot: "Voo", ico: "voo" },
      { id: "home", rot: "Enquadrar", ico: "casa" },
      /* no tablet a fita é o que menos se vê: a mesa fica à mão */
      { id: "mesa", rot: "Mesa", ico: "cadeado" },
      { id: "ultra", rot: "Ultra", ico: "estrela" }
    ],
    _rapidos: function () {
      var self = this, d = el("div", "rv-abas-dir");
      this._RAPIDOS.forEach(function (q) {
        if (q.sep) { d.appendChild(el("span", "rv-rap-sep")); return; }
        var b = el("button", "rv-rap" + (q.pri ? " rv-rap-pri" : ""));
        b.type = "button";
        b.setAttribute("data-rv-rap", q.id);
        b.innerHTML = ico(q.ico, 14) + '<span class="rv-rap-rot">' + esc(q.rot) + "</span>";
        b.onclick = function () { self.executar(q.id); };
        d.appendChild(b);
      });
      return d;
    },
    _pintarRapidos: function () {
      var r = R();
      if (!this._raiz || !r) return;
      var noVoo = r.ativo("voo");
      this._raiz.querySelectorAll("[data-rv-rap]").forEach(function (b) {
        var id = b.getAttribute("data-rv-rap"), c = r.comando(id), d = r.disponibilidade(id);
        var rot = c ? String(c.rotulo || "").split("\n").join(" ") : id;
        b.disabled = !d.ok;
        b.title = d.ok ? ((c && c.dica) || rot) : (d.motivo || rot);
        /* órbita é o "não voo": aceso quando há modelo e o voo está desligado */
        var aceso = id === "orbita" ? (d.ok && !noVoo) : r.ativo(id);
        if (id === "orbita" || (c && c.tipo === "alterna")) b.setAttribute("aria-pressed", aceso ? "true" : "false");
      });
    },

    /* ------------------------------------------------------------ FITA */
    pintarFita: function () {
      var self = this, r = R();
      if (!this._raiz || !r) return;
      var fita = this._raiz.querySelector(".rv-fita");
      if (!fita) return;
      this._pintarRapidos();
      var v = r.render();
      fita.innerHTML = "";
      if (!v) return;

      v.paineis.forEach(function (p) {
        var pn = el("div", "rv-painel");
        var corpo = el("div", "rv-painel-corpo");
        var col = null;
        p.comandos.forEach(function (c) {
          var b = el("button", "rv-cmd" + (c.grande ? "" : " rv-cmd-sm"));
          b.type = "button";
          b.setAttribute("data-rv-cmd", c.id);
          /* "em breve" NÃO fica disabled: o botão continua clicável e o clique
             conta o que já dá para fazer no lugar. Botão desabilitado com uma
             dica que manda clicar é convite a um clique impossível — e no
             celular a dica (title) nem aparece. Ele fica com CARA de
             indisponível, mas responde. */
          b.disabled = !c.habilitado && !c.emBreve;
          if (c.emBreve) b.setAttribute("data-rv-embreve", "1");
          b.title = c.habilitado ? c.dica : (c.motivo || c.dica);
          if (c.tipo === "alterna") b.setAttribute("aria-pressed", c.ativo ? "true" : "false");

          var i = el("span", "rv-cmd-ico");
          i.innerHTML = ico(c.icone, c.grande ? 24 : 15);
          b.appendChild(i);

          var rot = el("span", "rv-cmd-rot");
          c.linhas.forEach(function (l) { rot.appendChild(el("span", null, l)); });
          b.appendChild(rot);

          if (c.tipo === "menu") b.appendChild(el("span", "rv-cmd-seta", "▾"));
          if (c.pro) b.appendChild(el("span", "rv-cmd-pro", "PRO"));

          b.onclick = function () {
            if (c.emBreve) { self._emBreve(c); return; }
            self.executar(c.id);
          };

          if (c.grande) {
            corpo.appendChild(b); col = null;
          } else {
            /* pequenos empilham de três em três, como no Revit */
            if (!col || col.childNodes.length >= 3) { col = el("div", "rv-col"); corpo.appendChild(col); }
            col.appendChild(b);
          }
        });
        pn.appendChild(corpo);
        pn.appendChild(el("div", "rv-painel-nome", p.nome));
        fita.appendChild(pn);
      });
    },

    /* despacha e repinta — é por aqui que TODO clique passa */
    executar: function (id) {
      var c = CMD();
      if (!c) return;
      var res = c.executar(id);
      this.pintarFita();
      if (!res.ok && res.motivo) {
        try { if (global.UI && UI.toast) UI.toast(res.motivo, res.bloqueado || res.semAcao ? "erro" : "erro"); } catch (e) {}
      }
      if (typeof this._opts.onComando === "function") this._opts.onComando(id, res);
      return res;
    },

    /* -------------------------------------------- PROPRIEDADES E ÁRVORE */
    _lateral: function () {
      var lat = el("div", "rv-lateral");

      var props = el("div", "rv-doca rv-props");
      var cabP = el("div", "rv-doca-cab");
      cabP.appendChild(el("span", null, "Propriedades"));
      /* recolher a coluna inteira: sobra a aba com a seta na borda esquerda */
      var bRec = el("button", "rv-x rv-recolher", "◀");
      bRec.type = "button"; bRec.title = "Recolher Propriedades e Navegador (fica a aba com a seta para trazer de volta)";
      bRec.onclick = (function (self) { return function () { self.alternarLateralFixa(true); }; })(this);
      cabP.appendChild(bRec);
      props.appendChild(cabP);
      props.appendChild(el("div", "rv-doca-corpo"));
      var pe = el("div", "rv-props-pe");
      var bAp = el("button", "rv-btn-tipo rv-aplicar", "Aplicar");
      bAp.type = "button";
      bAp.onclick = (function (self) { return function () { self._aplicarProps(); }; })(this);
      pe.appendChild(bAp);
      props.appendChild(pe);
      lat.appendChild(props);
      var split = el("div", "rv-split-h");
      split.title = "Arraste para dividir o espaço entre Propriedades e Navegador";
      lat.appendChild(split);
      this._split = split;

      var nav = el("div", "rv-doca rv-nav");
      var cabN = el("div", "rv-doca-cab");
      cabN.appendChild(el("span", null, "Navegador de projeto"));
      nav.appendChild(cabN);
      var busca = el("div", "rv-busca");
      busca.innerHTML = ico("buscar", 13);
      var inp = el("input");
      inp.type = "search"; inp.placeholder = "Pesquisar";
      inp.oninput = (function (self) { return function () { self._filtrarArvore(this.value); }; })(this);
      busca.appendChild(inp);
      nav.appendChild(busca);
      nav.appendChild(el("div", "rv-doca-corpo"));
      lat.appendChild(nav);
      return lat;
    },

    /* Propriedades dirigidas por ESQUEMA: o mesmo componente serve para
     * vista, parede, porta, piso — muda só o esquema que chega.
     * esquema = { titulo, tipo, tipos:[{id,rotulo}], secoes:[
     *   { nome, params:[{ id, rotulo, valor, tipo:'texto'|'numero'|'lista'|'sim-nao'|'botao',
     *                     opcoes, unidade, leitura, motivo }] } ] } */
    pintarProps: function (esquema) {
      if (!this._raiz) return;
      var corpo = this._raiz.querySelector(".rv-props .rv-doca-corpo");
      if (!corpo) return;
      /* nada selecionado: como no Revit, Propriedades mostra a VISTA ativa
         (nome, ortogonal, caixa de corte em "Extensões", início) */
      if (!esquema && typeof this._opts.propsVista === "function") { try { esquema = this._opts.propsVista() || null; } catch (eV) { esquema = null; } }
      this._estado.props = esquema;
      corpo.innerHTML = "";

      if (!esquema) {
        var vazio = el("div", null, "Nada selecionado. Dê dois cliques num elemento do modelo.");
        vazio.style.cssText = "padding:14px 10px;color:var(--rv-tx-fraco);font-size:11.5px;line-height:1.5";
        corpo.appendChild(vazio);
        return;
      }

      var topo = el("div", "rv-tipo");
      var mini = el("div", "rv-tipo-mini");
      mini.innerHTML = ico(esquema.icone || "quadrado", 26);
      topo.appendChild(mini);
      var sel = el("div", "rv-tipo-sel");
      if (esquema.tipos && esquema.tipos.length) {
        var s = el("select");
        esquema.tipos.forEach(function (t) {
          var o = el("option", null, t.rotulo);
          o.value = t.id;
          if (t.id === esquema.tipo) o.selected = true;
          s.appendChild(o);
        });
        s.onchange = (function (self) { return function () { self._trocarTipo(this.value); }; })(this);
        sel.appendChild(s);
      } else {
        sel.appendChild(el("div", null, esquema.titulo || ""));
      }
      topo.appendChild(sel);
      corpo.appendChild(topo);

      var lin = el("div", "rv-tipo-linha");
      lin.appendChild(el("b", null, esquema.titulo || ""));
      if (!esquema.semEditarTipo) {
        var bt = el("button", "rv-btn-tipo", "Editar tipo");
        bt.type = "button";
        bt.onclick = (function (self) { return function () { self.executar("editar-tipo"); }; })(this);
        lin.appendChild(bt);
      }
      corpo.appendChild(lin);

      var tb = el("table", "rv-params");
      var tbody = el("tbody");
      var self = this;
      (esquema.secoes || []).forEach(function (sec) {
        var trh = el("tr");
        var th = el("th");
        th.colSpan = 2;
        th.innerHTML = '<span class="rv-seta">▼</span>' + esc(sec.nome);
        th.onclick = function () { self._colapsar(th); };
        trh.appendChild(th);
        tbody.appendChild(trh);

        (sec.params || []).forEach(function (p) {
          var tr = el("tr");
          if (p.leitura) tr.className = "rv-p-off";
          var td1 = el("td", "rv-p-nome", p.rotulo + (p.unidade ? " (" + p.unidade + ")" : ""));
          tr.appendChild(td1);
          var td2 = el("td", "rv-p-val");
          td2.appendChild(self._campo(p));
          tr.appendChild(td2);
          tbody.appendChild(tr);
        });
      });
      tb.appendChild(tbody);
      corpo.appendChild(tb);

      /* aviso = a parede está fora da norma; pendência = falta um dado para
         fechar a conta. São coisas diferentes e não podem ter a mesma cara. */
      if (esquema.motivoLeitura) corpo.appendChild(el("div", "rv-p-aviso", esquema.motivoLeitura));
      if (esquema.pendencia) corpo.appendChild(el("div", "rv-p-pend", esquema.pendencia));
    },

    _campo: function (p) {
      var self = this;
      if (p.leitura) {
        /* booleano só de leitura: "Sim"/"Não" — String(false) mostrava
           "false" em Propriedades, que para quem lê é defeito */
        var txt = p.valor == null || p.valor === "" ? "—" : (typeof p.valor === "boolean" ? (p.valor ? "Sim" : "Não") : String(p.valor));
        var ro = el("span", "rv-p-ro", txt);
        if (p.motivo) ro.title = p.motivo;
        return ro;
      }
      if (p.tipo === "botao") {
        var b = el("button", "rv-btn-tipo", p.rotuloBotao || "Editar…");
        b.type = "button";
        /* `fn` (função da tela) vem antes de `acao` (comando da fita): um
           botão de Propriedades nem sempre é um comando — e comando que a
           fita não conhece responde "Comando desconhecido." */
        b.onclick = function () { if (typeof p.fn === "function") p.fn(); else if (p.acao) self.executar(p.acao); };
        return b;
      }
      if (p.tipo === "sim-nao") {
        var c = el("input"); c.type = "checkbox"; c.checked = !!p.valor;
        c.setAttribute("data-rv-p", p.id);
        c.onchange = function () { self._mudouProp(p, this.checked); };
        return c;
      }
      if (p.tipo === "lista") {
        var s = el("select");
        s.setAttribute("data-rv-p", p.id);
        (p.opcoes || []).forEach(function (o) {
          var op = el("option", null, o.rotulo != null ? o.rotulo : o);
          op.value = o.id != null ? o.id : o;
          if (op.value === String(p.valor)) op.selected = true;
          s.appendChild(op);
        });
        s.onchange = function () { self._mudouProp(p, this.value); };
        return s;
      }
      var i = el("input");
      i.type = p.tipo === "numero" ? "number" : "text";
      if (p.tipo === "numero" && p.passo) i.step = p.passo;
      i.value = p.valor == null ? "" : p.valor;
      i.setAttribute("data-rv-p", p.id);
      /* devolve a cada alteração — é o que faz o modelo ser paramétrico em
         tempo real. `change` (não `input`) para não recalcular a cada tecla. */
      i.onchange = function () {
        self._mudouProp(p, p.tipo === "numero" ? parseFloat(String(this.value).replace(",", ".")) : this.value);
      };
      i.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); this.blur(); } };
      return i;
    },

    /* Uma propriedade mudou. Avisa quem montou o esquema; se ele devolver um
       esquema novo, repinta — assim o painel reflete o que a mudança causou
       (mexer na espessura de uma camada muda a espessura total da parede). */
    _mudouProp: function (p, valor) {
      var esq = this._estado.props;
      if (!esq) return;
      var fn = esq.onMudar || this._opts.onMudarProp;
      if (typeof fn !== "function") return;
      var novo = fn(p.id, valor, esq, p);
      if (novo && novo !== esq) this.pintarProps(novo);
      else if (novo === true) this.pintarProps(esq);
    },

    _colapsar: function (th) {
      var tr = th.parentNode, seta = th.querySelector(".rv-seta");
      var aberto = seta.textContent === "▼";
      seta.textContent = aberto ? "►" : "▼";
      var n = tr.nextSibling;
      while (n && !(n.firstChild && n.firstChild.tagName === "TH")) {
        n.style.display = aberto ? "none" : "";
        n = n.nextSibling;
      }
    },

    _aplicarProps: function () {
      if (!this._raiz || !this._estado.props) return;
      var vals = {};
      this._raiz.querySelectorAll("[data-rv-p]").forEach(function (c) {
        var id = c.getAttribute("data-rv-p");
        vals[id] = c.type === "checkbox" ? c.checked : c.value;
      });
      var fn = this._opts.onAplicarProps;
      if (typeof fn === "function") fn(vals, this._estado.props);
    },
    _trocarTipo: function (tipoId) {
      var fn = this._opts.onTrocarTipo;
      if (typeof fn === "function") fn(tipoId, this._estado.props);
    },

    /* árvore = [{ id, rotulo, icone, n, filhos:[...] }] */
    pintarArvore: function (arvore) {
      if (!this._raiz) return;
      var corpo = this._raiz.querySelector(".rv-nav .rv-doca-corpo");
      if (!corpo) return;
      this._estado.arvore = arvore;
      corpo.innerHTML = "";
      if (!arvore || !arvore.length) {
        var v = el("div", null, "Nenhuma vista ainda. Abra um modelo ou gere a volumetria de um desenho.");
        v.style.cssText = "padding:12px 10px;color:var(--rv-tx-fraco);font-size:11.5px;line-height:1.5";
        corpo.appendChild(v);
        return;
      }
      corpo.appendChild(this._ramo(arvore, 0));
    },
    _ramo: function (nos, nivel) {
      var self = this;
      var ul = el("ul", nivel === 0 ? "rv-arv" : null);
      nos.forEach(function (no) {
        var li = el("li");
        var d = el("div", "rv-no");
        d.setAttribute("data-rv-no", no.id);
        if (no.selecionado) d.setAttribute("aria-selected", "true");
        var temFilhos = no.filhos && no.filhos.length;
        var exp = el("span", "rv-no-exp", temFilhos ? (no.aberto === false ? "►" : "▼") : "");
        d.appendChild(exp);
        var ic = el("span", "rv-no-ico");
        ic.innerHTML = ico(no.icone || (temFilhos ? "pasta" : "planta"), 13);
        d.appendChild(ic);
        var tx = el("span", "rv-no-tx", no.rotulo);
        d.appendChild(tx);
        if (no.n != null) d.appendChild(el("span", "rv-no-n", "(" + no.n + ")"));
        li.appendChild(d);

        if (temFilhos) {
          var sub = self._ramo(no.filhos, nivel + 1);
          if (no.aberto === false) sub.style.display = "none";
          li.appendChild(sub);
          exp.onclick = function (ev) {
            ev.stopPropagation();
            var fechado = sub.style.display === "none";
            sub.style.display = fechado ? "" : "none";
            exp.textContent = fechado ? "▼" : "►";
          };
        }
        d.onclick = function () {
          self._raiz.querySelectorAll("[data-rv-no]").forEach(function (x) { x.removeAttribute("aria-selected"); });
          d.setAttribute("aria-selected", "true");
          if (typeof self._opts.onNo === "function") self._opts.onNo(no);
        };
        ul.appendChild(li);
      });
      return ul;
    },
    _filtrarArvore: function (termo) {
      if (!this._raiz) return;
      var t = String(termo || "").toLowerCase().trim();
      this._raiz.querySelectorAll(".rv-nav .rv-no").forEach(function (n) {
        var tx = (n.textContent || "").toLowerCase();
        var bate = !t || tx.indexOf(t) >= 0;
        n.style.display = bate ? "" : "none";
      });
    },

    /* ------------------------------------------------- ABAS DE DOCUMENTO */
    _docs: function () {
      var d = el("div", "rv-docs");
      this._pintarDocs(d);
      return d;
    },
    _pintarDocs: function (cont) {
      var self = this;
      var c = cont || (this._raiz && this._raiz.querySelector(".rv-docs"));
      if (!c) return;
      c.innerHTML = "";
      var acao = function (a, id) { if (typeof self._opts.onDocAcao === "function") self._opts.onDocAcao(a, id); };
      this._estado.docs.forEach(function (doc) {
        var b = el("div", "rv-doc");
        b.setAttribute("data-rv-doc", doc.id);
        b.setAttribute("aria-selected", doc.ativo ? "true" : "false");
        if (doc.fora) b.setAttribute("data-rv-fora", "1");
        b.appendChild(el("span", null, doc.nome + (doc.fora ? " ↗" : "")));
        b.title = doc.fora ? "Esta vista está em outra janela — clique para trazê-la para a frente" : "Botão direito: outra janela, duplicar, fechar";
        /* o {3D} principal não fecha; as vistas abertas fecham no ✕, como no Revit */
        if (doc.fechavel !== false && doc.id !== "3d") {
          var x = el("span", "rv-x", "✕");
          x.title = "Fechar esta vista";
          x.onclick = function (ev) { ev.stopPropagation(); acao("fechar", doc.id); };
          b.appendChild(x);
        }
        b.onclick = function () { if (doc.fora) acao("focar", doc.id); else self.abrirDoc(doc.id); };
        b.oncontextmenu = function (ev) { ev.preventDefault(); self._menuDoc(ev.clientX, ev.clientY, doc, acao); };
        c.appendChild(b);
      });
      /* à direita das abas: abrir vista nova e alternar abas/lado a lado */
      var dirD = el("div", "rv-docs-dir");
      var bNova = el("button", "rv-docs-bt");
      bNova.type = "button"; bNova.innerHTML = ico("mais", 13) + "<span>Nova vista</span>"; bNova.title = "Duplicar a vista 3D ativa numa aba nova (câmera, caixa de corte e ViewCube próprios)";
      bNova.onclick = function () { acao("nova", null); };
      var bLado = el("button", "rv-docs-bt");
      bLado.type = "button"; bLado.setAttribute("data-rv-lado", "1");
      bLado.setAttribute("aria-pressed", this._estado.lado ? "true" : "false");
      bLado.innerHTML = ico("grade", 13) + "<span>" + (this._estado.lado ? "Abas" : "Lado a lado") + "</span>";
      bLado.title = this._estado.lado ? "Voltar a uma vista por vez (abas)" : "Mostrar as vistas abertas lado a lado";
      bLado.onclick = function () { acao("lado", null); };
      dirD.appendChild(bNova); dirD.appendChild(bLado);
      c.appendChild(dirD);
    },
    _menuDoc: function (x, y, doc, acao) {
      var velho = document.querySelector(".rv-menu-doc"); if (velho) velho.parentNode.removeChild(velho);
      var m = el("div", "rv-menu-doc");
      var itens = [["janela", doc.fora ? "Trazer de volta para esta janela" : "Abrir em outra janela (outro monitor)"], ["duplicar", "Duplicar esta vista"], ["lado", this._estado.lado ? "Voltar para abas" : "Vistas lado a lado"]];
      if (doc.id !== "3d") itens.push(["fechar", "Fechar"]);
      itens.forEach(function (it) {
        var d = el("div", null, it[1]);
        d.onclick = function () { if (m.parentNode) m.parentNode.removeChild(m); acao(it[0], doc.id); };
        m.appendChild(d);
      });
      document.body.appendChild(m);
      var r = m.getBoundingClientRect();
      m.style.left = Math.max(4, Math.min(x, (window.innerWidth || 800) - r.width - 6)) + "px";
      m.style.top = Math.max(4, Math.min(y, (window.innerHeight || 600) - r.height - 6)) + "px";
      setTimeout(function () {
        document.addEventListener("pointerdown", function fora(ev) { if (!m.contains(ev.target)) { if (m.parentNode) m.parentNode.removeChild(m); document.removeEventListener("pointerdown", fora, true); } }, true);
      }, 0);
    },
    /* estado das abas vindo de quem manda nas vistas (Gestao): lista, ativa, lado a lado, fora */
    definirDocs: function (docs, lado) {
      this._estado.docs = (docs || []).map(function (d) { return { id: d.id, nome: d.nome, ativo: !!d.ativo, fechavel: d.fechavel, fora: !!d.fora }; });
      this._estado.lado = !!lado;
      this._pintarDocs();
    },
    abrirDoc: function (id) {
      this._estado.docs.forEach(function (d) { d.ativo = d.id === id; });
      this._pintarDocs();
      if (typeof this._opts.onDoc === "function") this._opts.onDoc(id);
    },
    novoDoc: function (id, nome) {
      if (!this._estado.docs.some(function (d) { return d.id === id; })) {
        this._estado.docs.push({ id: id, nome: nome, ativo: false });
      }
      this.abrirDoc(id);
    },
    fecharDoc: function (id) {
      this._estado.docs = this._estado.docs.filter(function (d) { return d.id !== id; });
      if (this._estado.docs.length && !this._estado.docs.some(function (d) { return d.ativo; })) {
        this._estado.docs[0].ativo = true;
      }
      this._pintarDocs();
    },

    /* -------------------------------------- BARRA DE CONTROLE DA VISTA */
    _vistabar: function () {
      var self = this;
      var d = el("div", "rv-vistabar");
      d.appendChild(el("span", "rv-vb-rot", "Perspectiva"));
      [
        { id: "estilo", ico: "pincel", dica: "Estilo de exibição" },
        { id: "sombras", ico: "sol", dica: "Sombras", alterna: true },
        { id: "planta", ico: "planta", dica: "Plano de corte da planta", alterna: true },
        { id: "corte", ico: "corte", dica: "Corte", alterna: true },
        { id: "visibilidade", ico: "olho", dica: "Visibilidade e raio-X" },
        { id: "snap", ico: "ima", dica: "Snap" },
        { id: "home", ico: "casa", dica: "Enquadrar tudo" },
        { id: "foto", ico: "camera", dica: "Foto da vista" }
      ].forEach(function (b) {
        var bt = el("button", "rv-vb");
        bt.type = "button"; bt.title = b.dica; bt.setAttribute("aria-label", b.dica);
        bt.setAttribute("data-rv-vb", b.id);
        bt.innerHTML = ico(b.ico, 14);
        bt.onclick = function () {
          var res = self.executar(b.id);
          if (b.alterna && res && res.ok) bt.setAttribute("aria-pressed", res.ligado ? "true" : "false");
        };
        d.appendChild(bt);
      });

      /* ⚠ ESTES DOIS NÃO PASSAM PELO `executar`: eles não são comando do
       * modelo, são estado da TELA. Mandá-los pelo despachante os deixaria
       * sujeitos ao gate de comando (documento carregado, permissão) — e
       * "quero ver o modelo maior" não depende de nada disso.
       *
       * Por que existem: a coluna de Propriedades + Navegador ocupa 268px
       * fixos no computador, e a fita ocupa a faixa de cima. Num notebook
       * sobra pouco para o 3D, e a tela fica cheia demais para trabalhar. */
      var bLat = el("button", "rv-vb");
      bLat.type = "button";
      bLat.title = "Esconder/mostrar Propriedades e Navegador de projeto";
      bLat.setAttribute("aria-label", bLat.title);
      bLat.setAttribute("data-rv-vb", "lateral-off");
      bLat.innerHTML = ico("prancha", 14);
      bLat.onclick = function () {
        var off = self.alternarLateralFixa();
        bLat.setAttribute("aria-pressed", off ? "true" : "false");
      };
      d.appendChild(bLat);

      var bFoco = el("button", "rv-vb");
      bFoco.type = "button";
      bFoco.title = "Modo foco: só o modelo e a ferramenta (Esc sai)";
      bFoco.setAttribute("aria-label", bFoco.title);
      bFoco.setAttribute("data-rv-vb", "foco");
      bFoco.innerHTML = ico("expandir", 14);
      bFoco.onclick = function () {
        var on = self.alternarFoco();
        bFoco.setAttribute("aria-pressed", on ? "true" : "false");
      };
      d.appendChild(bFoco);

      return d;
    },

    /* ------------------------------------------------ BARRA DE STATUS */
    _status: function () {
      var d = el("div", "rv-status");
      d.appendChild(el("div", "rv-status-sel", "Pronto"));
      var dir = el("div", "rv-status-dir");
      dir.innerHTML = '<span>Elementos: <b data-rv-st="n">0</b></span><span>Selecionado: <b data-rv-st="sel">—</b></span>';
      d.appendChild(dir);
      return d;
    },
    /* texto da esquerda: o que está sob o cursor, no formato do Revit
       ("Pisos : Piso : PI_15cm_Concreto : R0") */
    status: function (texto) {
      if (!this._raiz) return;
      var s = this._raiz.querySelector(".rv-status-sel");
      if (s) s.textContent = texto || "Pronto";
    },
    contadores: function (n, sel) {
      if (!this._raiz) return;
      var a = this._raiz.querySelector('[data-rv-st="n"]');
      var b = this._raiz.querySelector('[data-rv-st="sel"]');
      if (a) a.textContent = n == null ? "0" : String(n);
      if (b) b.textContent = sel == null ? "—" : String(sel);
    },

    /* ----------------------------------------------------------- TEMA */
    trocarTema: function (tema) {
      if (!this._raiz) return;
      var atual = this._raiz.getAttribute("data-rv-tema");
      var novo = tema || (atual === "escuro" ? "claro" : "escuro");
      this._raiz.setAttribute("data-rv-tema", novo);
      try { localStorage.setItem("orcapro:bim:tema-revit", novo); } catch (e) {}
      if (typeof this._opts.onTema === "function") this._opts.onTema(novo);
      return novo;
    },
    temaSalvo: function () {
      try { return localStorage.getItem("orcapro:bim:tema-revit") || "claro"; } catch (e) { return "claro"; }
    },
    telaCheia: function (on) {
      if (!this._raiz) return;
      var atual = this._raiz.getAttribute("data-rv-cheia") === "1";
      var novo = on == null ? !atual : !!on;
      this._raiz.setAttribute("data-rv-cheia", novo ? "1" : "0");
      if (typeof this._opts.onTelaCheia === "function") this._opts.onTelaCheia(novo);
      return novo;
    },
    /* mobile: abre/fecha a fita e a coluna lateral */
    alternarFita: function () {
      if (!this._raiz) return;
      var on = this._raiz.getAttribute("data-rv-fita") === "1";
      this._raiz.setAttribute("data-rv-fita", on ? "0" : "1");
      return !on;
    },
    alternarLateral: function () {
      if (!this._raiz) return;
      var on = this._raiz.getAttribute("data-rv-lateral") === "1";
      this._raiz.setAttribute("data-rv-lateral", on ? "0" : "1");
      return !on;
    },

    /* ================================================================
     * ESCONDER A COLUNA LATERAL — em QUALQUER tamanho de tela
     *
     * `alternarLateral` acima é a GAVETA do celular: ela só faz efeito
     * abaixo de 900px, onde a lateral é sobreposta. No computador a coluna
     * é fixa e come 268px — Propriedades e Navegador ocupando um quinto da
     * largura útil mesmo de quem só quer olhar o modelo.
     * A preferência é lembrada: quem escondeu não quer escolher de novo a
     * cada abertura.
     * ================================================================ */
    alternarLateralFixa: function (on) {
      if (!this._raiz) return false;
      var atual = this._raiz.getAttribute("data-rv-lateral-off") === "1";
      var novo = on == null ? !atual : !!on;
      this._raiz.setAttribute("data-rv-lateral-off", novo ? "1" : "0");
      try { localStorage.setItem("orcapro:bim:lateral-off", novo ? "1" : "0"); } catch (e) {}
      if (typeof this._opts.onLayout === "function") this._opts.onLayout();
      return novo;
    },

    /* ================================================================
     * A JANELA DA DIREITA (doca) E AS ALÇAS DE ARRASTAR
     * A largura da doca é lembrada POR FERRAMENTA: a Sondagem pede largura
     * (perfil ao lado do boletim), Pontos de vista cabe estreito — uma
     * largura só não serviria às duas.
     * ================================================================ */
    docaDireita: function () { return this._direita || null; },
    /* repinta as propriedades da vista (se é isso que está em Propriedades) */
    repintarVista: function () {
      if (!this._raiz) return;
      var p = this._estado.props;
      if (!p || p.daVista) this.pintarProps(null);
    },
    direita: function (on, chave, preferida) {
      if (!this._raiz) return;
      var r = this._raiz, abrir = !!on;
      if (abrir) {
        this._dirChave = chave || this._dirChave || "";
        var salvo = 0;
        try { salvo = +localStorage.getItem("orcapro:bim:direita-w:" + this._dirChave) || 0; } catch (e) {}
        var w = salvo || preferida || 440;
        r.style.setProperty("--rv-dir-w", this._limitarDir(w) + "px");
      }
      var antes = r.getAttribute("data-rv-direita") === "1";
      r.setAttribute("data-rv-direita", abrir ? "1" : "0");
      if (antes !== abrir && typeof this._opts.onLayout === "function") this._opts.onLayout();
    },
    _limitarDir: function (w) {
      var tot = (this._raiz && this._raiz.clientWidth) || (window.innerWidth || 1400);
      return Math.round(Math.max(280, Math.min(w, tot * 0.75)));
    },
    _ligarAlcas: function (raiz, alcaLat, alcaDir) {
      var self = this;
      function arrastar(alca, aoMover, aoSoltar) {
        alca.addEventListener("pointerdown", function (e) {
          if (e.button !== 0) return;
          e.preventDefault();
          var x0 = e.clientX, y0 = e.clientY;
          try { alca.setPointerCapture(e.pointerId); } catch (_) {}
          raiz.setAttribute("data-rv-arrastando", "1");
          function mv(ev) { aoMover(ev.clientX - x0, ev.clientY - y0, ev); }
          function up(ev) {
            alca.removeEventListener("pointermove", mv); alca.removeEventListener("pointerup", up); alca.removeEventListener("pointercancel", up);
            raiz.removeAttribute("data-rv-arrastando");
            if (aoSoltar) aoSoltar();
            if (typeof self._opts.onLayout === "function") self._opts.onLayout();
          }
          alca.addEventListener("pointermove", mv); alca.addEventListener("pointerup", up); alca.addEventListener("pointercancel", up);
          alca._w0 = null;
        });
      }
      var lat = raiz.querySelector(".rv-lateral"), lw0 = 0, dw0 = 0, ph0 = 0;
      arrastar(alcaLat, function (dx) {
        if (!lw0) lw0 = lat.getBoundingClientRect().width;
        var w = Math.max(200, Math.min(700, lw0 + dx));
        raiz.style.setProperty("--rv-lat-w", Math.round(w) + "px");
        if (self._opts.onLayoutVivo) self._opts.onLayoutVivo();
      }, function () { lw0 = 0; try { localStorage.setItem("orcapro:bim:lateral-w", String(parseInt(raiz.style.getPropertyValue("--rv-lat-w"), 10) || "")); } catch (e) {} });
      arrastar(alcaDir, function (dx) {
        if (!dw0) dw0 = self._direita.getBoundingClientRect().width;
        raiz.style.setProperty("--rv-dir-w", self._limitarDir(dw0 - dx) + "px");
        if (self._opts.onLayoutVivo) self._opts.onLayoutVivo();
      }, function () { dw0 = 0; try { localStorage.setItem("orcapro:bim:direita-w:" + (self._dirChave || ""), String(parseInt(raiz.style.getPropertyValue("--rv-dir-w"), 10) || "")); } catch (e) {} });
      if (this._split) arrastar(this._split, function (dx, dy) {
        var lr = lat.getBoundingClientRect();
        if (!ph0) { var pr = lat.querySelector(".rv-props").getBoundingClientRect(); ph0 = pr.height; }
        var pct = Math.max(15, Math.min(85, (ph0 + dy) / Math.max(1, lr.height) * 100));
        raiz.style.setProperty("--rv-props-h", pct.toFixed(1) + "%");
      }, function () { ph0 = 0; try { localStorage.setItem("orcapro:bim:props-h", String(parseFloat(raiz.style.getPropertyValue("--rv-props-h")) || "")); } catch (e) {} });
    },
    /* o tamanho da interface (letras e botões), sem mexer no 3D */
    escalaUi: function (f) {
      if (!this._raiz) return 1;
      if (f == null) { var a = parseFloat(this._raiz.style.getPropertyValue("--rv-ui")); return a > 0 ? a : 1; }
      f = Math.max(0.7, Math.min(1.3, +f || 1));
      this._raiz.style.setProperty("--rv-ui", String(f));
      try { localStorage.setItem("orcapro:bim:escala-ui", String(f)); } catch (e) {}
      if (typeof this._opts.onLayout === "function") this._opts.onLayout();
      return f;
    },

    /* ================================================================
     * MODO FOCO — só o modelo e a ferramenta
     *
     * "Tela cheia" (`data-rv-cheia`) só estica o quadro: a fita, a coluna
     * lateral, as abas e a barra de status continuam ocupando a tela. O
     * foco tira tudo isso e deixa o 3D com a barra da vista e o dock de
     * ferramentas do próprio visualizador — que é onde mora a ferramenta
     * selecionada.
     *
     * ⚠ SEMPRE COM SAÍDA À VISTA. Modo que se entra sem saber como sair é
     *   armadilha: entra junto um botão fixo no canto, e o Esc também sai.
     * ================================================================ */
    alternarFoco: function (on) {
      if (!this._raiz) return false;
      var atual = this._raiz.getAttribute("data-rv-foco") === "1";
      var novo = on == null ? !atual : !!on;
      /* ⚠ FOCO TRAVADO: sair do foco devolveria a fita inteira (Parede, Piso,
         "Gerar orçamento"…) numa janela que não pode gravar. A trava tem
         porta: o recado diz onde editar (a janela principal). */
      if (atual && !novo && this._focoTravado) {
        if (typeof UI !== "undefined" && UI.toast) UI.toast(this._focoTravado, "aviso");
        return true;
      }
      this._raiz.setAttribute("data-rv-foco", novo ? "1" : "0");
      if (novo && !this._btnSairFoco) {
        var self = this;
        var b = el("button", "rv-foco-sair");
        b.type = "button";
        b.onclick = function () { self.alternarFoco(false); };
        this._raiz.appendChild(b);
        this._btnSairFoco = b;
        this._pintarSairFoco();
      }
      if (this._opts && typeof this._opts.onLayout === "function") this._opts.onLayout();
      return novo;
    },
    focoAtivo: function () { return !!(this._raiz && this._raiz.getAttribute("data-rv-foco") === "1"); },
    /* TRAVA O MODO FOCO (a janela do 3D da Simulação 4D, achado 40.4 da
       revisão da 1.2.98: ela é só visualização). `texto` é o recado que o
       botão do canto passa a mostrar e que sai quando alguém tenta sair do
       foco; "" destrava. */
    travarFoco: function (texto) {
      this._focoTravado = texto ? String(texto) : "";
      this._pintarSairFoco();
      return !!this._focoTravado;
    },
    _pintarSairFoco: function () {
      var b = this._btnSairFoco; if (!b) return;
      if (this._focoTravado) { b.innerHTML = "<span>" + esc(this._focoTravado) + "</span>"; b.title = this._focoTravado; }
      else { b.innerHTML = ico("fechar", 13) + "<span>Sair do foco (Esc)</span>"; b.title = ""; }
    }
  };

  global.BimShell = Shell;
  if (typeof module !== "undefined" && module.exports) module.exports = Shell;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

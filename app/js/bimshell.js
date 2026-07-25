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

      var area = el("div", "rv-area");
      area.appendChild(this._docs());
      var palco = el("div", "rv-palco");
      this._palco = palco;
      area.appendChild(palco);
      area.appendChild(this._vistabar());
      corpo.appendChild(area);
      raiz.appendChild(corpo);

      raiz.appendChild(this._status());

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
      "novo-projeto": "Por enquanto: abra um IFC, ou use \"Gerar de desenho\" para levantar a volumetria de um PDF ou DXF.",
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
      this._raiz = null; this._palco = null;
    },
    palco: function () { return this._palco; },
    raiz: function () { return this._raiz; },

    /* ---------------------------------------------------------- TÍTULO */
    _titulo: function (opts) {
      var self = this;
      var t = el("div", "rv-titulo");
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
      nome.textContent = (opts.arquivo ? opts.arquivo + " — " : "") + "OrçaPRO BIM";
      t.appendChild(nome);

      var dir = el("div", "rv-qat");
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
      return d;
    },

    /* ------------------------------------------------------------ FITA */
    pintarFita: function () {
      var self = this, r = R();
      if (!this._raiz || !r) return;
      var fita = this._raiz.querySelector(".rv-fita");
      if (!fita) return;
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
      props.appendChild(cabP);
      props.appendChild(el("div", "rv-doca-corpo"));
      var pe = el("div", "rv-props-pe");
      var bAp = el("button", "rv-btn-tipo rv-aplicar", "Aplicar");
      bAp.type = "button";
      bAp.onclick = (function (self) { return function () { self._aplicarProps(); }; })(this);
      pe.appendChild(bAp);
      props.appendChild(pe);
      lat.appendChild(props);

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
      var bt = el("button", "rv-btn-tipo", "Editar tipo");
      bt.type = "button";
      bt.onclick = (function (self) { return function () { self.executar("editar-tipo"); }; })(this);
      lin.appendChild(bt);
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
        var ro = el("span", "rv-p-ro", p.valor == null ? "—" : String(p.valor));
        if (p.motivo) ro.title = p.motivo;
        return ro;
      }
      if (p.tipo === "botao") {
        var b = el("button", "rv-btn-tipo", p.rotuloBotao || "Editar…");
        b.type = "button";
        b.onclick = function () { if (p.acao) self.executar(p.acao); };
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
      this._estado.docs.forEach(function (doc) {
        var b = el("div", "rv-doc");
        b.setAttribute("aria-selected", doc.ativo ? "true" : "false");
        b.appendChild(el("span", null, doc.nome));
        if (doc.fechavel !== false && self._estado.docs.length > 1) {
          var x = el("span", "rv-x", "✕");
          x.onclick = function (ev) { ev.stopPropagation(); self.fecharDoc(doc.id); };
          b.appendChild(x);
        }
        b.onclick = function () { self.abrirDoc(doc.id); };
        c.appendChild(b);
      });
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
    }
  };

  global.BimShell = Shell;
  if (typeof module !== "undefined" && module.exports) module.exports = Shell;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimtabelaui.js — TABELA/QUANTIDADES NA TELA (prévia
 * `?previa=modelador`). Fase P5, Frente B do plano do BIM.
 * O motor é o js/bimtabela.js (Frente A): aqui só se MOSTRA e se GRAVA op.
 *
 * O QUE APARECE
 *   · Vista › Criar: "Tabela/Quantidades" e "Levantamento de material"
 *     (categoria + nome → o editor abre já com os campos do modelo).
 *   · Navegador › Tabelas/Quantidades: as tabelas da obra; clicar abre.
 *   · A tabela abre numa ABA DE VISTA, no padrão do
 *     ROTEIRO-MODULO: cabeçalho (nome, contexto, Editar…, Exportar .xlsx,
 *     Mais ▾), a tabela padrão (table.tbl) com cabeçalho/rodapé de grupo e
 *     total geral, ou o vazio com UMA ação.
 *   · Clicar numa linha SELECIONA a peça no 3D (Propriedades mostram ela);
 *     duplo clique leva ao 3D e enquadra.
 *   · Editar… = o "Propriedades da tabela": Campos, Filtro,
 *     Classificar/Agrupar, Formatação e Aparência (fase). OK grava UMA op
 *     `tabela`; Ctrl+Z desfaz.
 *   · Propriedades (com a aba da tabela ativa): Nome da vista, Fase, Filtro
 *     da fase e os botões Campos/Filtro/Classificar/Formatação, nos grupos
 *     de parâmetros (inventário: elementos.tabela_paredes).
 *   · Exportar .xlsx formatado (regra da RA: tabela para terceiro em .xlsx,
 *     nunca CSV) — o molde do js/bimtuboxls.js, pelo ExcelJS do app.
 *
 * PURO × TELA: o HTML da tabela, o ramo do Navegador e as ops são funções
 * puras (tools/test-bimtabela.js); a tela só desenha e repassa.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function T() { return dep("BimTabela", "./bimtabela.js"); }
  function BP() { return dep("BimParam", "./bimparam.js"); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }
  var PREFIXO = "d2t-";

  var BimTabelaUI = {
    PREFIXO: PREFIXO,

    /* ================================================================ PURO */

    /* o HTML da tabela (table.tbl do ROTEIRO-MODULO): cabeçalho de coluna
       com a unidade, linhas de item com os ids das peças (data-p5t-ids),
       cabeçalho/rodapé de grupo e total geral. `sel` = ids selecionados. */
    htmlTabela: function (saida, sel) {
      var cols = arr(saida && saida.colunas).filter(function (c) { return !c.oculto; });
      if (!cols.length) return "";
      var selS = {}; arr(sel).forEach(function (i) { selS[String(i)] = 1; });
      var h = '<table class="tbl p5t-tbl" data-p5t-tabela="' + esc(saida.tabela && saida.tabela.id) + '"><thead><tr>';
      cols.forEach(function (c) { h += '<th class="p5t-' + c.alinhar + '" data-p5t-col="' + esc(c.id) + '" scope="col">' + esc(c.titulo) + (c.un ? ' <span class="p5t-un">(' + esc(c.un) + ")</span>" : "") + "</th>"; });
      h += "</tr></thead><tbody>";
      function linhaTotal(l, cls) {
        var r = '<tr class="' + cls + '" data-p5t-nivel="' + (l.nivel || 0) + '">';
        cols.forEach(function (c, i) {
          var v = l.textos ? l.textos[c.id] : "";
          if (i === 0 && !v) r += '<td class="p5t-esquerda p5t-tit">' + esc(l.titulo) + "</td>";
          else r += '<td class="p5t-' + c.alinhar + '">' + (i === 0 ? '<span class="p5t-tit">' + esc(l.titulo) + "</span> " : "") + esc(v || "") + "</td>";
        });
        return r + "</tr>";
      }
      arr(saida.linhas).forEach(function (l) {
        if (l.tipo === "cabecalho") { h += '<tr class="p5t-cab" data-p5t-nivel="' + l.nivel + '"><td colspan="' + cols.length + '">' + esc(l.titulo) + "</td></tr>"; return; }
        if (l.tipo === "rodape") { h += linhaTotal(l, "p5t-rod"); return; }
        var ehSel = l.ids.length && l.ids.every(function (i) { return selS[i]; });
        h += '<tr class="p5t-item' + (ehSel ? " p5t-sel" : "") + '" tabindex="0" data-p5t-ids="' + esc(l.ids.join(",")) + '"' + (l.n > 1 ? ' data-p5t-n="' + l.n + '"' : "") + (ehSel ? ' aria-selected="true"' : "") + ">";
        cols.forEach(function (c) { h += '<td class="p5t-' + c.alinhar + '">' + esc(l.textos[c.id] || "") + "</td>"; });
        h += "</tr>";
      });
      if (saida.totalGeral) h += linhaTotal(saida.totalGeral, "p5t-total");
      return h + "</tbody></table>";
    },
    /* o que vai no Navegador › Tabelas/Quantidades: uma folha por tabela + "Nova" */
    ramo: function (tabelas, abertas) {
      var ab = {}; arr(abertas).forEach(function (i) { ab[String(i)] = 1; });
      return arr(tabelas).map(function (t) {
        return { id: "p5t:" + t.id, rotulo: t.nome, icone: t.tipo === "material" ? "insumo" : "tabela", tabId: t.id, selecionado: !!ab[t.id] };
      }).concat([{ id: "p5t:nova", rotulo: "+ Nova tabela/quantidades", icone: "tabela", nova: true }]);
    },
    /* a op de RENOMEAR (Propriedades › Nome da vista) */
    opRenomear: function (estado, tab, nome) {
      var t = clone(tab); t.nome = txt(nome).trim();
      return T().opTabela(estado, t, tab.id);
    },
    /* a op de mudar UM campo simples da definição (fase, filtro da fase…) */
    opCampo: function (estado, tab, chave, valor) {
      var t = clone(tab); t[chave] = valor;
      return T().opTabela(estado, t, tab.id);
    },
    /* duplicar: o nome ganha " (2)", " (3)"… até ficar livre */
    opDuplicar: function (estado, tab) {
      var nomes = {}; arr(estado && estado.tabelas).forEach(function (t) { nomes[txt(t.nome).toLowerCase()] = 1; });
      var n = 2, nome = tab.nome + " (" + n + ")";
      while (nomes[nome.toLowerCase()]) nome = tab.nome + " (" + (++n) + ")";
      var t = clone(tab); delete t.id; t.nome = nome;
      return T().opTabela(estado, t, null);
    },

    /* ================================================================ TELA */
    _G: null, _cache: {}, _sel: {}, _tAg: 0, _assArv: "",
    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && T() && BP() && global.BIM && global.BIM.editarEstado); } catch (e) { return false; } },
    estado: function () { var b = global.BIM, e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    tabelas: function () { return arr((this.estado() || {}).tabelas); },
    tabela: function (id) { var s = String(id); return this.tabelas().filter(function (t) { return t.id === s; })[0] || null; },
    /* o registro resolvido com as dependências da tela (as mesmas da paleta de Propriedades) */
    contexto: function () {
      var st = this.estado(); if (!st) return null;
      try { var U = global.BimPropsUI, c = U && U.contextoTela ? U.contextoTela() : null; if (c && c.res) return { res: c.res, estado: st, deps: c.deps }; } catch (e) {}
      var B = BP(); return { res: B ? B.resolver(st, {}) : { pecas: [] }, estado: st, deps: {} };
    },
    gerar: function (tabId) {
      var t = this.tabela(tabId), c = this.contexto();
      return t && c ? T().gerar(t, c) : null;
    },
    _op: function (o) { var b = global.BIM; if (!b || !b.b2Op) return false; return b.b2Op(o) !== false; },

    /* ------------------------------------------------ fita e Navegador */
    registrar: function (reg, G) {
      this._G = G || this._G;
      if (!this.ativo() || !global.BimRibbon) return false;
      var self = this;
      global.BimRibbon.acrescentar("vista", "Vista", "Criar", [
        { id: "tabela-quantidades", rotulo: "Tabela/\nQuantidades", icone: "tabela", grande: true, dica: "Tabela/Quantidades: escolha a categoria (paredes, portas, ambientes…), os campos (Tipo, Comprimento, Área, Volume…), filtro, classificar/agrupar e totais. Os números são os das Propriedades. Abre numa aba e exporta .xlsx formatado." },
        { id: "levantamento-material", rotulo: "Levantamento\nde material", icone: "insumo", grande: true, dica: "Levantamento de material: uma linha por camada (parede pelas camadas do tipo; laje, forro, pilar e viga pelo material), com Material: Nome, Área e Volume." }
      ]);
      reg["tabela-quantidades"] = function () { self.novaTabela("quantidades"); return true; };
      reg["levantamento-material"] = function () { self.novaTabela("material"); return true; };
      return true;
    },
    ramoNavegador: function () {
      if (!this.ativo()) return [];
      var self = this, abertas = Object.keys(this._cache).map(function (k) { return k.slice(PREFIXO.length); });
      return this.ramo(this.tabelas(), abertas).map(function (n) {
        n.fn = n.nova ? function () { self.novaTabela("quantidades"); } : function () { self.abrir(n.tabId); };
        return n;
      });
    },
    _arvore: function () {
      var ass = JSON.stringify(this.tabelas().map(function (t) { return [t.id, t.nome, t.tipo]; }));
      if (ass === this._assArv) return;
      this._assArv = ass;
      try { if (this._G && this._G._nivArvore) this._G._nivArvore(); } catch (e) {}
    },

    /* ------------------------------------------------ nova tabela */
    novaTabela: function (tipo) {
      var self = this, B = BP(), TB = T(); if (!B || !TB || !global.UI || !global.UI.modal) return false;
      var cats = Object.keys(B.REGISTRO).filter(function (c) { return tipo === "material" ? !!TB.CATS_MATERIAL[c] : true; });
      var h = '<div class="p5t-form" data-p5t="nova">' +
        '<label>Categoria <select data-p5t-nova="categoria">' + cats.map(function (c) { return '<option value="' + c + '"' + (c === "parede" ? " selected" : "") + ">" + esc(B.REGISTRO[c].nome) + "</option>"; }).join("") + "</select></label>" +
        '<label>Nome <input type="text" maxlength="80" data-p5t-nova="nome" value="' + esc(TB.modelo("parede", tipo).nome) + '"></label>' +
        '<p class="muted">' + (tipo === "material" ? "Uma linha por camada de material de cada peça." : "Uma linha por peça; os campos vêm prontos e se ajustam em Editar.") + "</p></div>";
      global.UI.modal(tipo === "material" ? "Novo levantamento de material" : "Nova tabela/quantidades", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Criar", classe: "primary", onClick: function () {
          var cat = document.querySelector('[data-p5t-nova="categoria"]').value, nome = document.querySelector('[data-p5t-nova="nome"]').value;
          var m = TB.modelo(cat, tipo); m.nome = txt(nome).trim() || m.nome;
          var r = TB.opTabela(self.estado(), m, null);
          if (!r.ok) { toast(r.motivo, "erro"); return; }
          global.UI.fecharModal();
          if (!self._op(r.op)) { toast("Não consegui criar a tabela (o modelador está aberto?).", "erro"); return; }
          self._arvore();
          self.abrir(r.op.id);
          self.editor(r.op.id, "campos");
        } }
      ]);
      var sel = document.querySelector('[data-p5t-nova="categoria"]'), nm = document.querySelector('[data-p5t-nova="nome"]'), tocado = false;
      if (nm) nm.addEventListener("input", function () { tocado = true; });
      if (sel) sel.addEventListener("change", function () { if (!tocado && nm) nm.value = TB.modelo(sel.value, tipo).nome; });
      return true;
    },

    /* ------------------------------------------------ a aba */
    abrir: function (tabId) {
      var t = this.tabela(tabId), G = this._G; if (!t || !G || !G._d2Abrir) return null;
      return G._d2Abrir(PREFIXO + t.id, t.nome);
    },
    montar: function (tela, vid) {
      if (!tela) return false;
      var c = this._cache[vid] || (this._cache[vid] = {});
      c.tela = tela;
      var v = tela.querySelector(".p5t-tela");
      if (!v) { v = document.createElement("div"); v.className = "p5t-tela"; tela.appendChild(v); }
      c.el = v;
      this._ligar(v, vid);
      this.render(vid);
      return true;
    },
    desmontar: function (vid) { delete this._cache[vid]; },
    render: function (vid) {
      var c = this._cache[vid]; if (!c || !c.el) return false;
      var M = global.Modulo, tabId = String(vid).slice(PREFIXO.length), t = this.tabela(tabId);
      if (!t) {
        c.el.innerHTML = M ? M.vazio({ icone: "tabela", titulo: "Esta tabela não existe mais", texto: "Ela foi excluída (Ctrl+Z traz de volta)." }) : "<p>Esta tabela não existe mais.</p>";
        return false;
      }
      var s = this.gerar(tabId), TB = T();
      c.saida = s;
      var sub = (TB.TIPOS[t.tipo] || "Tabela") + " · " + TB.nomeCategoria(t.categoria) + " · " + s.contagem + (s.contagem === 1 ? " elemento" : " elementos");
      var bt = function (a, rot, cls, dica) { return '<button type="button" class="btn' + (cls ? " " + cls : "") + '" data-p5t-acao="' + a + '"' + (dica ? ' title="' + esc(dica) + '"' : "") + ">" + esc(rot) + "</button>"; };
      var acoes = [bt("editar", "Editar…", "", "Campos, filtro, classificar/agrupar, formatação e fase (as Propriedades da tabela)"),
                   bt("xlsx", "Exportar .xlsx", "", "Planilha formatada, com os mesmos números da tela"),
                   bt("modelo", "Mostrar no modelo", "", "Seleciona as peças da linha marcada no 3D e enquadra"),
                   bt("duplicar", "Duplicar"), bt("excluir", "Excluir tabela")];
      var h = M ? M.cab({ icone: "tabela", titulo: t.nome, sub: sub, acoes: acoes }) : "<h1>" + esc(t.nome) + "</h1>";
      if (s.avisos.length) h += M ? M.aviso({ tom: "alerta", titulo: "Atenção", texto: s.avisos.join(" · ") }) : "";
      if (!s.contagem) h += M ? M.vazio({ icone: "tabela", titulo: "Nenhuma peça nesta tabela", texto: s.tabela && s.tabela.filtros.length ? "O filtro tirou todas as peças." : "Ainda não há " + TB.nomeCategoria(t.categoria).toLowerCase() + " no modelo.", acaoHtml: bt("editar", "Editar tabela", "primary") }) : "";
      else h += M ? M.secao({ classe: "p5t-sec", corpoHtml: '<div class="p5t-rolagem">' + this.htmlTabela(s, this._sel[vid]) + "</div>" }) : this.htmlTabela(s, this._sel[vid]);
      var rol = c.el.querySelector(".p5t-rolagem"), top = rol ? rol.scrollTop : 0;
      c.el.innerHTML = '<div class="p5t" data-p5t="' + esc(t.id) + '">' + h + "</div>";
      var rol2 = c.el.querySelector(".p5t-rolagem"); if (rol2) rol2.scrollTop = top;
      return true;
    },
    _ligar: function (v, vid) {
      if (v._p5tLigado) return; v._p5tLigado = true;
      var self = this;
      v.addEventListener("click", function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("[data-p5t-acao]") : null;
        if (a) { self.acao(vid, a.getAttribute("data-p5t-acao")); return; }
        var tr = ev.target && ev.target.closest ? ev.target.closest("tr[data-p5t-ids]") : null;
        if (tr) self.selecionarLinha(vid, tr.getAttribute("data-p5t-ids").split(","));
      });
      v.addEventListener("dblclick", function (ev) {
        var tr = ev.target && ev.target.closest ? ev.target.closest("tr[data-p5t-ids]") : null;
        if (tr) self.mostrarNoModelo(tr.getAttribute("data-p5t-ids").split(","));
      });
      v.addEventListener("keydown", function (ev) {
        var tr = ev.target && ev.target.closest ? ev.target.closest("tr[data-p5t-ids]") : null;
        if (!tr) return;
        if (ev.key === "Enter") { ev.preventDefault(); self.selecionarLinha(vid, tr.getAttribute("data-p5t-ids").split(",")); }
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          var l = Array.prototype.slice.call(v.querySelectorAll("tr[data-p5t-ids]")), i = l.indexOf(tr) + (ev.key === "ArrowDown" ? 1 : -1);
          if (l[i]) l[i].focus();
        }
      });
    },
    acao: function (vid, a) {
      var tabId = String(vid).slice(PREFIXO.length), t = this.tabela(tabId), self = this; if (!t) return false;
      if (a === "editar") return this.editor(tabId, "campos");
      if (a === "xlsx") return this.exportar(tabId);
      if (a === "modelo") { var s = this._sel[vid]; if (!s || !s.length) { status("Clique numa linha da tabela primeiro."); return false; } return this.mostrarNoModelo(s); }
      if (a === "duplicar") { var r = this.opDuplicar(this.estado(), t); if (!r.ok) { toast(r.motivo, "erro"); return false; } if (this._op(r.op)) { this._arvore(); this.abrir(r.op.id); } return true; }
      if (a === "excluir") {
        if (this._op({ op: "tabelaApagar", id: t.id })) {
          try { if (this._G && this._G._bimVxFechar) this._G._bimVxFechar(vid); } catch (e) {}
          this._arvore();
          status("Tabela \"" + t.nome + "\" excluída. Ctrl+Z traz de volta.");
        }
        return true;
      }
      return false;
    },
    /* clicar numa linha seleciona a peça no 3D (Propriedades mostram ela) */
    selecionarLinha: function (vid, ids) {
      ids = arr(ids).filter(Boolean); if (!ids.length) return false;
      this._sel[vid] = ids;
      var c = this._cache[vid];
      if (c && c.el) Array.prototype.forEach.call(c.el.querySelectorAll("tr[data-p5t-ids]"), function (tr) {
        var on = tr.getAttribute("data-p5t-ids") === ids.join(",");
        tr.classList.toggle("p5t-sel", on); if (on) tr.setAttribute("aria-selected", "true"); else tr.removeAttribute("aria-selected");
      });
      var b = global.BIM, ok = false;
      try { ok = !!(b && b._selecionarUid && b._selecionarUid("edit:" + ids[0])); } catch (e) { ok = false; }
      status(ok ? (ids.length > 1 ? ids.length + " peças nesta linha; a primeira está selecionada. Duplo clique mostra todas no 3D." : "Peça selecionada no modelo. As propriedades estão em Propriedades; duplo clique mostra no 3D.")
                : "Esta peça não está no 3D aberto.");
      return ok;
    },
    mostrarNoModelo: function (ids) {
      var G = this._G, b = global.BIM;
      try { if (G && G._bimVxAtivar) G._bimVxAtivar("3d"); } catch (e) {}
      try { if (b && b._selecionarUid) b._selecionarUid("edit:" + ids[0]); } catch (e2) {}
      try { if (b && b.enquadrarUids) b.enquadrarUids(ids.map(function (i) { return "edit:" + i; })); } catch (e3) {}
      return true;
    },
    /* o modelo mudou (op, desfazer, refazer, níveis): as tabelas abertas se refazem — juntando rajadas */
    aoMudarModelo: function () {
      var self = this;
      if (this._tAg) clearTimeout(this._tAg);
      this._tAg = setTimeout(function () {
        self._tAg = 0;
        Object.keys(self._cache).forEach(function (vid) { try { self.render(vid); } catch (e) {} });
        try { self._arvore(); } catch (e2) {}
        try { var G = self._G, at = G && G._bimVxEst ? G._bimVxEst().ativa : null; if (at && at.indexOf(PREFIXO) === 0 && global.BimShell) global.BimShell.repintarVista(); } catch (e3) {}
      }, 120);
    },

    /* ------------------------------------------------ Propriedades da tabela (paleta) */
    propsVista: function (vid) {
      var self = this, tabId = String(vid).slice(PREFIXO.length), t = this.tabela(tabId), TB = T(), B = BP();
      if (!t || !TB) return null;
      function bt(id, rot, aba) { return { id: id, rotulo: rot, tipo: "botao", rotuloBotao: "Editar…", fn: function () { self.editor(tabId, aba); } }; }
      return {
        daVista: true, semEditarTipo: true, titulo: "Tabela: " + t.nome, icone: "tabela",
        secoes: [
          { nome: "Dados de identidade", params: [
            { id: "nome", rotulo: "Nome da vista", tipo: "texto", valor: t.nome },
            { id: "categoria", rotulo: "Categoria", leitura: true, valor: TB.nomeCategoria(t.categoria) } ] },
          { nome: "Fases", params: [
            { id: "fase", rotulo: "Fase", tipo: "lista", valor: t.fase, opcoes: (B ? B.FASES : []).map(function (f) { return { id: f, rotulo: f }; }) },
            { id: "filtroFase", rotulo: "Filtro da fase", tipo: "lista", valor: t.filtroFase, opcoes: Object.keys(TB.FILTROS_FASE).map(function (k) { return { id: k, rotulo: TB.FILTROS_FASE[k] }; }) } ] },
          { nome: "Outros", params: [
            bt("campos", "Campos", "campos"), bt("filtro", "Filtro", "filtro"), bt("ordenar", "Classificar/Agrupar", "ordenar"),
            bt("formato", "Formatação", "formato"), bt("aparencia", "Aparência", "aparencia"),
            { id: "xlsx", rotulo: "Exportar", tipo: "botao", rotuloBotao: "Planilha .xlsx", fn: function () { self.exportar(tabId); } } ] }
        ],
        onMudar: function (pid, valor) {
          var st = self.estado(), r = null;
          if (pid === "nome") r = self.opRenomear(st, t, valor);
          else if (pid === "fase" || pid === "filtroFase") r = self.opCampo(st, t, pid, valor);
          if (r && !r.ok) toast(r.motivo, "erro");
          else if (r && self._op(r.op)) { self._arvore(); if (pid === "nome") self._renomearAba(vid, txt(valor).trim()); }
          return self.propsVista(vid);
        }
      };
    },
    _renomearAba: function (vid, nome) {
      try {
        var G = this._G, v = G && G._bimVxAchar ? G._bimVxAchar(vid) : null;
        if (v) { v.nome = nome; var r = G._bimVxTela(vid); if (r) { var rot = r.querySelector(".bim-tela-rot"); if (rot) rot.textContent = nome; } G._bimVxDocs(); }
      } catch (e) {}
    },

    /* ------------------------------------------------ exportar .xlsx */
    exportar: function (tabId) {
      var s = this.gerar(tabId), TB = T(), EX = global.ExcelOrc || global.Excel;
      if (!s || !s.tabela) { toast("Tabela não encontrada.", "erro"); return false; }
      if (!EX || !EX.ensureExcelJS) { toast("O gerador de Excel não carregou.", "erro"); return false; }
      EX.ensureExcelJS(function () {
        try {
          var wb = TB.construirXlsx(global.ExcelJS, s, {});
          wb.xlsx.writeBuffer().then(function (buf) {
            var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            var url = URL.createObjectURL(blob), a = document.createElement("a");
            a.href = url; a.download = TB.nomeArquivo(s.tabela.nome) + ".xlsx"; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            status("\"" + s.tabela.nome + ".xlsx\" baixada: " + s.contagem + " elementos, os mesmos números da tela.");
          }).catch(function (e) { toast("Não consegui gerar a planilha: " + (e && e.message), "erro"); });
        } catch (e2) { toast("Não consegui gerar a planilha: " + (e2 && e2.message), "erro"); }
      });
      return true;
    },

    /* ------------------------------------------------ o editor ("Propriedades da tabela") */
    ABAS: [["campos", "Campos"], ["filtro", "Filtro"], ["ordenar", "Classificar/Agrupar"], ["formato", "Formatação"], ["aparencia", "Aparência"]],
    editor: function (tabId, aba) {
      var self = this, t = this.tabela(tabId), TB = T(); if (!t || !global.UI || !global.UI.modal) return false;
      var w = clone(t), ctx = this.contexto(), disp = TB.camposDisponiveis(w.categoria, ctx && ctx.res, w.tipo);
      var ativa = aba || "campos";
      function defDe(id) { if (w.calculados && w.calculados[id]) return { id: id, nome: w.calculados[id].nome, dado: w.calculados[id].dado }; return disp.porId[id] || { id: id, nome: id, dado: "texto" }; }
      function opcoesCampo(selId, comVazio, lista) {
        var ids = lista || disp.lista.map(function (d) { return d.id; }).concat(Object.keys(w.calculados || {}));
        return (comVazio ? '<option value="">(nenhum)</option>' : "") + ids.map(function (id) { return '<option value="' + esc(id) + '"' + (id === selId ? " selected" : "") + ">" + esc(defDe(id).nome) + "</option>"; }).join("");
      }
      function painel() {
        var h = "";
        if (ativa === "campos") {
          var usados = {}; w.campos.forEach(function (c) { usados[c] = 1; });
          h += '<div class="p5t-campos"><div><b>Campos disponíveis</b><input type="search" placeholder="Buscar" data-p5t-busca><select multiple size="12" data-p5t-disp>' +
            disp.lista.filter(function (d) { return !usados[d.id]; }).map(function (d) { return '<option value="' + esc(d.id) + '" title="' + esc(d.grupo || "") + '">' + esc(d.nome) + "</option>"; }).join("") +
            Object.keys(w.calculados || {}).filter(function (k) { return !usados[k]; }).map(function (k) { return '<option value="' + esc(k) + '">' + esc(w.calculados[k].nome) + " (calculado)</option>"; }).join("") +
            '</select></div><div class="p5t-campos-bt"><button type="button" class="btn" data-p5t-ed="add">Adicionar →</button><button type="button" class="btn" data-p5t-ed="rem">← Remover</button>' +
            '<button type="button" class="btn" data-p5t-ed="sobe">Subir</button><button type="button" class="btn" data-p5t-ed="desce">Descer</button></div>' +
            '<div><b>Campos da tabela (em ordem)</b><select multiple size="12" data-p5t-usados>' + w.campos.map(function (c) { return '<option value="' + esc(c) + '">' + esc(defDe(c).nome) + "</option>"; }).join("") + "</select></div></div>" +
            '<details class="p5t-calc"><summary>Novo campo calculado</summary><div class="p5t-linha"><input type="text" placeholder="Nome (ex.: Área de reboco)" data-p5t-calc="nome" maxlength="80">' +
            '<input type="text" placeholder="Fórmula (ex.: Área * 2)" data-p5t-calc="formula" maxlength="300"><select data-p5t-calc="dado">' +
            [["numero", "Número"], ["comprimento", "Comprimento (m)"], ["area", "Área (m²)"], ["volume", "Volume (m³)"], ["massa", "Massa (kg)"]].map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") +
            '</select><button type="button" class="btn" data-p5t-ed="calc">Criar</button></div><p class="muted">Use o nome dos campos com _ no lugar do espaço: Altura_não_conectada * Comprimento.</p></details>';
        } else if (ativa === "filtro") {
          for (var i = 0; i < 4 || i < w.filtros.length; i++) {
            var f = w.filtros[i] || { param: "", op: "igual", valor: "" };
            h += '<div class="p5t-linha" data-p5t-filtro="' + i + '"><label>' + (i ? "E" : "Filtrar por") + ' <select data-p5t-f="param">' + opcoesCampo(f.param, true) + '</select></label><select data-p5t-f="op">' +
              Object.keys(TB.OPS_FILTRO).map(function (k) { return '<option value="' + k + '"' + (k === f.op ? " selected" : "") + ">" + TB.OPS_FILTRO[k] + "</option>"; }).join("") +
              '</select><input type="text" data-p5t-f="valor" value="' + esc(f.valor == null ? "" : f.valor) + '"></div>';
          }
        } else if (ativa === "ordenar") {
          for (var j = 0; j < 4; j++) {
            var s = w.ordenar[j] || { param: "", desc: false, cabecalho: false, rodape: false, totais: true, contagem: true };
            h += '<fieldset class="p5t-ord" data-p5t-ord="' + j + '"><legend>' + (j ? "Depois por" : "Classificar por") + "</legend>" +
              '<select data-p5t-o="param">' + opcoesCampo(s.param, true) + "</select>" +
              '<label><input type="radio" name="p5t-o-' + j + '" data-p5t-o="cres"' + (!s.desc ? " checked" : "") + "> Crescente</label>" +
              '<label><input type="radio" name="p5t-o-' + j + '" data-p5t-o="desc"' + (s.desc ? " checked" : "") + "> Decrescente</label>" +
              '<label><input type="checkbox" data-p5t-o="cabecalho"' + (s.cabecalho ? " checked" : "") + "> Cabeçalho</label>" +
              '<label><input type="checkbox" data-p5t-o="rodape"' + (s.rodape ? " checked" : "") + "> Rodapé</label>" +
              '<label><input type="checkbox" data-p5t-o="contagem"' + (s.contagem !== false ? " checked" : "") + "> com contagem</label>" +
              '<label><input type="checkbox" data-p5t-o="totais"' + (s.totais !== false ? " checked" : "") + "> com totais</label></fieldset>";
          }
          h += '<div class="p5t-linha"><label><input type="checkbox" data-p5t-g="totalGeral"' + (w.totalGeral ? " checked" : "") + "> Totais gerais</label>" +
            '<label><input type="checkbox" data-p5t-g="itemizar"' + (w.itemizar !== false ? " checked" : "") + "> Itemizar cada ocorrência</label></div>";
        } else if (ativa === "formato") {
          h += '<table class="tbl p5t-fmt"><thead><tr><th>Campo</th><th>Cabeçalho</th><th>Casas</th><th>Unidade</th><th>Calcular totais</th><th>Ocultar</th></tr></thead><tbody>';
          w.campos.forEach(function (c) {
            var d = defDe(c), f = (w.formato || {})[c] || {}, U = TB.UNS[d.dado], num = !!TB.CASAS.hasOwnProperty(d.dado);
            var totPad = f.total != null ? f.total : TB.somaPadrao(d);
            h += '<tr data-p5t-fmt="' + esc(c) + '"><td>' + esc(d.nome) + '</td><td><input type="text" data-p5t-x="titulo" value="' + esc(f.titulo || "") + '" placeholder="' + esc(d.nome) + '"></td>' +
              "<td>" + (num ? '<input type="number" min="0" max="6" step="1" data-p5t-x="casas" value="' + (f.casas != null ? f.casas : TB.CASAS[d.dado]) + '">' : "") + "</td>" +
              "<td>" + (U ? '<select data-p5t-x="un">' + Object.keys(U).map(function (u) { return '<option value="' + esc(u) + '"' + ((f.un || Object.keys(U)[0]) === u ? " selected" : "") + ">" + esc(u) + "</option>"; }).join("") + "</select>" : "") + "</td>" +
              "<td>" + (num ? '<input type="checkbox" data-p5t-x="total"' + (totPad ? " checked" : "") + ">" : "") + "</td>" +
              '<td><input type="checkbox" data-p5t-x="oculto"' + (f.oculto ? " checked" : "") + "></td></tr>";
          });
          h += "</tbody></table>";
        } else if (ativa === "aparencia") {
          var B = BP();
          h += '<div class="p5t-form"><label>Nome da vista <input type="text" maxlength="80" data-p5t-g="nome" value="' + esc(w.nome) + '"></label>' +
            '<label>Fase <select data-p5t-g="fase">' + (B ? B.FASES : []).map(function (f2) { return '<option value="' + esc(f2) + '"' + (f2 === w.fase ? " selected" : "") + ">" + esc(f2) + "</option>"; }).join("") + "</select></label>" +
            '<label>Filtro da fase <select data-p5t-g="filtroFase">' + Object.keys(TB.FILTROS_FASE).map(function (k) { return '<option value="' + k + '"' + (k === w.filtroFase ? " selected" : "") + ">" + TB.FILTROS_FASE[k] + "</option>"; }).join("") + "</select></label></div>";
        }
        return h;
      }
      function abas() {
        return '<div class="tabs mod-abas" role="tablist">' + self.ABAS.map(function (a) {
          return '<div class="tab' + (a[0] === ativa ? " ativa" : "") + '" role="tab" tabindex="0" aria-selected="' + (a[0] === ativa) + '" data-p5t-aba="' + a[0] + '">' + a[1] + "</div>";
        }).join("") + "</div>";
      }
      /* lê o painel aberto para a cópia de trabalho `w` (antes de trocar de aba e no OK) */
      function ler() {
        var raiz = document.querySelector("[data-p5t-editor]"); if (!raiz) return;
        if (ativa === "filtro") {
          w.filtros = [];
          Array.prototype.forEach.call(raiz.querySelectorAll("[data-p5t-filtro]"), function (l) {
            var p = l.querySelector('[data-p5t-f="param"]').value; if (!p) return;
            var v = l.querySelector('[data-p5t-f="valor"]').value, n = Number(String(v).replace(/\./g, "").replace(",", "."));
            w.filtros.push({ param: p, op: l.querySelector('[data-p5t-f="op"]').value, valor: v.trim() !== "" && isFinite(n) && /^[-\d.,\s]+$/.test(v) ? n : v });
          });
        } else if (ativa === "ordenar") {
          w.ordenar = [];
          Array.prototype.forEach.call(raiz.querySelectorAll("[data-p5t-ord]"), function (l) {
            var p = l.querySelector('[data-p5t-o="param"]').value; if (!p) return;
            function ck(k) { var e = l.querySelector('[data-p5t-o="' + k + '"]'); return !!(e && e.checked); }
            var cab = ck("cabecalho"), rod = ck("rodape");
            w.ordenar.push({ param: p, desc: ck("desc"), agrupar: cab || rod, cabecalho: cab, rodape: rod, totais: ck("totais"), contagem: ck("contagem") });
          });
          var tg = raiz.querySelector('[data-p5t-g="totalGeral"]'), it = raiz.querySelector('[data-p5t-g="itemizar"]');
          if (tg) w.totalGeral = tg.checked; if (it) w.itemizar = it.checked;
        } else if (ativa === "formato") {
          w.formato = w.formato || {};
          Array.prototype.forEach.call(raiz.querySelectorAll("[data-p5t-fmt]"), function (l) {
            var c = l.getAttribute("data-p5t-fmt"), f = {}, x;
            x = l.querySelector('[data-p5t-x="titulo"]'); if (x && x.value.trim()) f.titulo = x.value.trim();
            x = l.querySelector('[data-p5t-x="casas"]'); if (x && x.value !== "") f.casas = Number(x.value);
            x = l.querySelector('[data-p5t-x="un"]'); if (x) f.un = x.value;
            x = l.querySelector('[data-p5t-x="total"]'); if (x) f.total = x.checked;
            x = l.querySelector('[data-p5t-x="oculto"]'); if (x && x.checked) f.oculto = true;
            w.formato[c] = f;
          });
        } else if (ativa === "aparencia") {
          ["nome", "fase", "filtroFase"].forEach(function (k) { var e = raiz.querySelector('[data-p5t-g="' + k + '"]'); if (e) w[k] = k === "nome" ? e.value.trim() : e.value; });
        }
      }
      function pintar() {
        var corpo = document.querySelector("[data-p5t-editor]"); if (!corpo) return;
        corpo.innerHTML = abas() + '<div class="p5t-painel" data-p5t-painel="' + ativa + '">' + painel() + "</div>";
      }
      global.UI.modal("Propriedades da tabela — " + t.nome, '<div class="p5t-editor" data-p5t-editor data-modal-largo></div>', [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "OK", classe: "primary", onClick: function () {
          ler();
          var r = T().opTabela(self.estado(), w, t.id);
          if (!r.ok) { toast(r.motivo, "erro"); return; }
          global.UI.fecharModal();
          if (self._op(r.op)) { self._arvore(); self._renomearAba(PREFIXO + t.id, r.op.tabela.nome); status("Tabela \"" + r.op.tabela.nome + "\" atualizada. Ctrl+Z desfaz."); }
        } }
      ]);
      var raiz = document.querySelector("[data-p5t-editor]"); if (!raiz) return false;
      pintar();
      raiz.addEventListener("click", function (ev) {
        var ab = ev.target.closest ? ev.target.closest("[data-p5t-aba]") : null;
        if (ab) { ler(); ativa = ab.getAttribute("data-p5t-aba"); pintar(); return; }
        var b = ev.target.closest ? ev.target.closest("[data-p5t-ed]") : null; if (!b) return;
        var k = b.getAttribute("data-p5t-ed"), sd = raiz.querySelector("[data-p5t-disp]"), su = raiz.querySelector("[data-p5t-usados]");
        function marcados(s) { return s ? Array.prototype.filter.call(s.options, function (o) { return o.selected; }).map(function (o) { return o.value; }) : []; }
        if (k === "add") marcados(sd).forEach(function (id) { if (w.campos.indexOf(id) < 0) w.campos.push(id); });
        if (k === "rem") { var tira = marcados(su); w.campos = w.campos.filter(function (c) { return tira.indexOf(c) < 0; }); }
        if (k === "sobe" || k === "desce") {
          var m = marcados(su)[0], i = w.campos.indexOf(m), j = k === "sobe" ? i - 1 : i + 1;
          if (i >= 0 && j >= 0 && j < w.campos.length) { w.campos[i] = w.campos[j]; w.campos[j] = m; }
          pintar(); var su2 = document.querySelector("[data-p5t-usados]"); if (su2) Array.prototype.forEach.call(su2.options, function (o) { o.selected = o.value === m; });
          return;
        }
        if (k === "calc") {
          var nome = raiz.querySelector('[data-p5t-calc="nome"]').value.trim(), fo = raiz.querySelector('[data-p5t-calc="formula"]').value.trim(), dado = raiz.querySelector('[data-p5t-calc="dado"]').value;
          if (!nome || !fo) { toast("O campo calculado precisa de nome e fórmula.", "aviso"); return; }
          var chave = "CALC:" + (nome.toLowerCase().normalize ? nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : nome.toLowerCase()).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
          w.calculados = w.calculados || {}; w.calculados[chave] = { nome: nome, formula: fo, dado: dado };
          if (w.campos.indexOf(chave) < 0) w.campos.push(chave);
        }
        pintar();
      });
      raiz.addEventListener("input", function (ev) {
        if (!ev.target.hasAttribute || !ev.target.hasAttribute("data-p5t-busca")) return;
        var q = ev.target.value.toLowerCase(), sd = raiz.querySelector("[data-p5t-disp]");
        if (sd) Array.prototype.forEach.call(sd.options, function (o) { o.hidden = q && o.textContent.toLowerCase().indexOf(q) < 0; });
      });
      raiz.addEventListener("dblclick", function (ev) {
        var o = ev.target && ev.target.tagName === "OPTION" ? ev.target : null; if (!o) return;
        var s = o.parentNode;
        if (s.hasAttribute("data-p5t-disp")) { if (w.campos.indexOf(o.value) < 0) w.campos.push(o.value); pintar(); }
        else if (s.hasAttribute("data-p5t-usados")) { w.campos = w.campos.filter(function (c) { return c !== o.value; }); pintar(); }
      });
      return true;
    }
  };

  global.BimTabelaUI = BimTabelaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTabelaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

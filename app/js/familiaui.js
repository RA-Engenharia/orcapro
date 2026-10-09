/* =====================================================================
 * familiaui.js — BIBLIOTECA e EDITOR DE FAMÍLIA do BIM (07/10/2026)
 *
 * A tela das famílias paramétricas (motor: js/familia.js; arquivo: .opfam
 * de js/opformato.js). Mora na janela da direita do BIM ("Famílias").
 *   • Biblioteca: famílias RA (só leitura — duplicar para mudar), as minhas
 *     e as importadas; escolher o tipo e COLOCAR no modelo; exportar .opfam.
 *   • Editor: identidade, parâmetros (tipo/instância, valor ou fórmula),
 *     tipos, geometria (caixa, cilindro, extrusão), vão (porta/janela),
 *     quantitativo — validação e pré-visualização 3D AO VIVO.
 * Quem guarda é a casca (ctx.listar/salvar/excluir → Store "bim_familias",
 * a família vai em TEXTO num campo só: a nuvem recusa lista dentro de lista).
 * ===================================================================== */
(function (global) {
  "use strict";

  function F() { return global.Familia; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(t, k) { try { if (global.UI && UI.toast) UI.toast(t, k || "info"); } catch (e) {} }
  function opt(obj, sel) { return Object.keys(obj).map(function (k) { return '<option value="' + esc(k) + '"' + (k === sel ? " selected" : "") + ">" + esc(obj[k]) + "</option>"; }).join(""); }
  function baixar(nome, texto, mime) {
    try {
      var blob = new Blob([texto], { type: mime || "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) { toast("Não consegui gerar o arquivo: " + e.message, "erro"); return false; }
  }

  var FamiliaUI = {
    _ctx: null, _el: null, _modo: "biblioteca", _edit: null, _busca: "", _tiposSel: {},

    configurar: function (ctx) { this._ctx = ctx || {}; },
    /* biblioteca inteira: RA + guardadas (as guardadas com o mesmo id ganham) */
    biblioteca: function () {
      var mapa = {}, out = [];
      (global.FamiliasRA ? FamiliasRA.lista() : []).forEach(function (f) { f._origem = "ra"; mapa[f.id] = f; });
      /* F1: as famílias ORÇÁVEIS (cada tipo = uma composição SINAPI real, js/familiasorc.js) — da RA, só leitura */
      (global.FamiliasOrc ? FamiliasOrc.lista() : []).forEach(function (f) { f._origem = "ra"; mapa[f.id] = f; });
      var minhas = []; try { minhas = (this._ctx && this._ctx.listar) ? this._ctx.listar() : []; } catch (e) { minhas = []; }
      minhas.forEach(function (f) { if (f && f.id) mapa[f.id] = f; });
      Object.keys(mapa).forEach(function (k) { out.push(mapa[k]); });
      out.sort(function (a, b) { return String(a.categoria).localeCompare(String(b.categoria)) || String(a.nome).localeCompare(String(b.nome)); });
      return out;
    },
    obter: function (id) { var l = this.biblioteca(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; },
    _sincronizarVisor: function () { try { if (global.BIM && BIM.familiasDefinir) BIM.familiasDefinir(this.biblioteca()); } catch (e) {} },

    montar: function (el) { this._el = el; this.render(); },
    render: function () {
      if (!this._el) return;
      if (this._modo === "editor" && this._edit) this._renderEditor(); else this._renderBiblioteca();
    },

    /* --------------------------------------------------- BIBLIOTECA */
    _renderBiblioteca: function () {
      var self = this, L = this.biblioteca(), b = this._busca.toLowerCase(), cats = (F() && F().CATEGORIAS) || {};
      var h = '<div class="fe-topo"><button class="btn sm primary" data-fe="nova">+ Nova família</button>' +
        /* FAMIMPORT: com a prévia do modelador, importa também o .rfa (e o .txt do catálogo de tipos) e o .zip com a pasta, vários de uma vez */
        (global.FamiliaImportUI && FamiliaImportUI.ativo() ? '<label class="btn sm" style="position:relative;overflow:hidden" title="Família do OrçaPRO (.opfam), convertida pelo plugin OrçaPRO for Revit (.opfam), do Revit direto (.rfa) ou uma pasta em .zip">Importar família<input type="file" multiple accept=".opfam,.rfa,.txt,.zip,application/json" data-fe="importar" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>'
          : '<label class="btn sm" style="position:relative;overflow:hidden">Importar .opfam<input type="file" accept=".opfam,application/json" data-fe="importar" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>') +
        '<input class="fe-busca" data-fe="busca" placeholder="Buscar família" value="' + esc(this._busca) + '"></div>' +
        '<p class="fe-ajuda">Escolha o tipo e clique <b>Colocar</b>; depois clique no modelo. Porta e janela vão numa parede criada aqui e abrem o vão.</p>';
      var grupos = {};
      L.forEach(function (f) { if (b && (f.nome + " " + (cats[f.categoria] || "")).toLowerCase().indexOf(b) < 0) return; (grupos[f.categoria] = grupos[f.categoria] || []).push(f); });
      var ks = Object.keys(grupos);
      if (!ks.length) h += '<p class="fe-vazio">Nenhuma família encontrada.</p>';
      ks.forEach(function (c) {
        h += '<div class="fe-grupo"><div class="fe-grupo-t">' + esc(cats[c] || c) + "</div>";
        grupos[c].forEach(function (f) {
          var tSel = self._tiposSel[f.id] || ((f.tipos || [])[0] || {}).id || "";
          var orig = f._origem === "ra" ? "RA" : (f._origem === "importada" ? "Importada" : "Minha");
          /* FAMIMPORT: a família do mercado (js/familiamalha.js) — miniatura, categoria da família e o aviso de geometria pendente */
          var imp = f.geometria === "malha" && f.importada ? f.importada : null, pend = !!(imp && imp.geometriaPendente);
          h += '<div class="fe-card' + (imp ? " fe-card-imp" : "") + '" data-fam="' + esc(f.id) + '">' + (imp ? '<div class="fe-mini">' + (f.miniatura ? '<img alt="" data-fe="mini" src="' + esc(f.miniatura) + '">' : '<span aria-hidden="true">' + esc((imp.categoriaNome || "").slice(0, 1)) + "</span>") + "</div>" : "") +
            '<div class="fe-card-l1"><b>' + esc(f.nome) + '</b><span class="fe-badge fe-b-' + esc(f._origem || "minha") + '">' + orig + "</span>" + (pend ? '<span class="fe-badge fe-b-pendente" title="Veio do .rfa: tipos e parâmetros, sem a forma 3D">Geometria pendente</span>' : "") + "</div>" +
            (imp ? '<div class="fe-card-d">' + esc(imp.categoriaNome || "") + " · " + (f.tipos || []).length + " tipo(s) · " + (f.parametros || []).length + " parâmetro(s)" + (imp.triangulos ? " · " + imp.triangulos + " triângulos" : "") + "</div>" : "") +
            (f.descricao ? '<div class="fe-card-d">' + esc(f.descricao) + "</div>" : "") +
            '<div class="fe-card-l2"><select data-fe="tipo" aria-label="Tipo">' + (f.tipos || []).map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === tSel ? " selected" : "") + ">" + esc(t.nome) + "</option>"; }).join("") + "</select>" +
            '<button class="btn sm primary" data-fe="colocar">Colocar</button><button class="btn sm" data-fe="editar">' + (f._origem === "ra" ? "Ver / duplicar" : "Editar") + "</button>" +
            '<button class="btn sm" data-fe="exportar" title="Exportar como Família OrçaPRO (.opfam)">.opfam</button>' +
            /* B6 (prévia do modelador): a MESMA família na fonte JSON do pipeline RA do Revit (js/familiarevit.js) */
            (global.FamiliaRevit && global.BimPrevia && BimPrevia.modelador() && !imp ? '<button class="btn sm" data-fe="revit" title="Exportar a fonte JSON da família para o pipeline RA do Revit (.rfa)">Revit</button>' : "") +
            (pend ? '<button class="btn sm" data-fe="converter" title="Como trazer a forma 3D pelo plugin OrçaPRO for Revit">Converter geometria</button>' : "") +
            (imp && global.FamiliaImportUI ? '<button class="btn sm ghost" data-fe="minha" title="Guardar também na sua biblioteca (aparece em todas as suas obras)">Minha biblioteca</button>' : "") +
            (f._origem !== "ra" ? '<button class="btn sm ghost" data-fe="excluir" title="Excluir da biblioteca">Excluir</button>' : "") + "</div></div>";
        });
        h += "</div>";
      });
      this._el.innerHTML = '<div class="fe">' + h + "</div>";
      this._ligarBiblioteca();
    },
    _ligarBiblioteca: function () {
      var self = this, el = this._el;
      el.onclick = function (e) {
        var b = e.target.closest ? e.target.closest("[data-fe]") : null; if (!b) return;
        var k = b.getAttribute("data-fe"), card = b.closest(".fe-card"), id = card ? card.getAttribute("data-fam") : null, f = id ? self.obter(id) : null;
        if (k === "nova") { self.editar(F().nova("Família nova", "generico"), true); }
        else if (k === "colocar" && f) { self.colocar(f, self._tiposSel[f.id] || ((f.tipos || [])[0] || {}).id); }
        else if (k === "editar" && f) { self.editar(f, f._origem !== "ra"); }
        else if (k === "exportar" && f) { self.exportar(f); }
        else if (k === "revit" && f) { self.exportarRevit(f); }
        else if (k === "converter" && f && global.FamiliaImportUI) { FamiliaImportUI.explicarConversao(f); }   /* FAMIMPORT */
        else if (k === "minha" && f && global.FamiliaImportUI) { FamiliaImportUI.paraMinha(f); }
        else if (k === "excluir" && f) { self._pedirExclusao(f); }
      };
      el.onchange = function (e) {
        var t = e.target, k = t.getAttribute && t.getAttribute("data-fe");
        if (k === "tipo") { var card = t.closest(".fe-card"); if (card) self._tiposSel[card.getAttribute("data-fam")] = t.value; }
        if (k === "importar" && t.files && t.files[0]) {
          /* FAMIMPORT: vários arquivos, .rfa, .zip — pelo importador de famílias do mercado */
          if (global.FamiliaImportUI && FamiliaImportUI.ativo()) { var fs = Array.prototype.slice.call(t.files); t.value = ""; FamiliaImportUI.interceptar(fs, function (r) { toast("\"" + r[0].name + "\" não tem família (.opfam ou .rfa) dentro.", "aviso"); }).forEach(function (r) { toast("\"" + r.name + "\" não é família (.opfam, .rfa ou .zip).", "aviso"); }); }
          else self.importarArquivo(t.files[0]);
        }
      };
      el.oninput = function (e) { if (e.target.getAttribute && e.target.getAttribute("data-fe") === "busca") { self._busca = e.target.value; var pos = e.target.selectionStart; self.render(); var i = el.querySelector('[data-fe="busca"]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) {} } } };
    },
    colocar: function (f, tipoId) {
      this._sincronizarVisor();
      if (this._ctx && this._ctx.colocar) this._ctx.colocar(f, tipoId);
      else if (global.BIM && BIM.editarArmar) BIM.editarArmar("familia", { famId: f.id, tipoId: tipoId });
    },
    exportar: function (f) {
      var limpa = JSON.parse(JSON.stringify(global.FamiliaMalha ? FamiliaMalha.embutir(f) : f)); delete limpa._origem; delete limpa._escopo;   /* FAMIMPORT: a malha importada viaja junto */
      var txt = OpFormato.familiaParaArquivo(limpa, { app: this._ctx && this._ctx.app ? this._ctx.app : "OrçaPRO", autor: this._ctx && this._ctx.autor ? this._ctx.autor : "" });
      if (baixar(OpFormato.nomeSeguro(f.nome) + OpFormato.EXT.familia, txt)) toast("\"" + f.nome + "\" exportada como " + OpFormato.EXT.familia + ". Quem receber importa em Famílias › Importar .opfam.", "ok");
    },
    /* a fonte JSON do Revit: materiais + primitivas em mm (contrato do bombup230.json) + parâmetros e tipos; sem preço */
    exportarRevit: function (f) {
      var r = global.FamiliaRevit ? FamiliaRevit.paraFonteRevit(f, { Familia: F(), sha256: OpFormato.sha256, app: this._ctx && this._ctx.app ? this._ctx.app : "OrçaPRO" }) : { ok: false, erros: ["o conversor não carregou"] };
      if (!r.ok) { toast("Não exportei para o Revit: " + r.erros[0], "erro"); return false; }
      if (baixar(OpFormato.nomeSeguro(f.nome) + ".revit.json", JSON.stringify(r.fonte, null, 1)))
        toast("\"" + f.nome + "\" exportada na fonte do Revit (" + r.fonte.primitivas.length + " sólido(s), " + r.fonte.tipos.length + " tipo(s))" + (r.avisos.length ? ". " + r.avisos[0] : "") + ". O construtor RA gera o .rfa a partir dela.", "ok");
      return true;
    },
    importarTexto: function (texto) {
      var r = OpFormato.lerFamilia(texto, F().validar);
      if (!r.ok) { toast("Não importei: " + r.erros.join("; "), "erro"); return null; }
      var fam = global.FamiliaMalha ? FamiliaMalha.desembutir(r.familia) : r.familia, existe = this.obter(fam.id);   /* FAMIMPORT: a malha embutida volta ao registro */
      if (existe && existe._origem === "ra") { fam.id = "fam-" + Date.now().toString(36); }
      fam._origem = "importada";
      if (!this._salvar(fam)) return null;
      toast("Família \"" + fam.nome + "\" importada" + (r.meta && r.meta.autor ? " (de " + r.meta.autor + ")" : "") + "." + (r.avisos.length ? " " + r.avisos.join("; ") : ""), "ok");
      this.render();
      return fam;
    },
    importarArquivo: function (file) {
      var self = this, rd = new FileReader();
      rd.onload = function () { self.importarTexto(String(rd.result || "")); };
      rd.onerror = function () { toast("Não consegui ler o arquivo.", "erro"); };
      rd.readAsText(file);
    },
    _salvar: function (fam) {
      if (!this._ctx || !this._ctx.salvar) { toast("Sem onde guardar a família.", "erro"); return false; }
      var ok = false; try { ok = !!this._ctx.salvar(fam); } catch (e) { ok = false; }
      if (!ok) { toast("Não consegui guardar a família (armazenamento cheio?).", "erro"); return false; }
      this._sincronizarVisor();
      return true;
    },
    _pedirExclusao: function (f) {
      var self = this;
      if (!(global.UI && UI.modal)) return;
      UI.modal("Excluir \"" + f.nome + "\"?", "<p>A família sai da biblioteca deste aparelho (e da nuvem). O que já foi colocado no modelo fica com um marcador até você trocar ou apagar.</p>", [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Excluir família", classe: "danger", onClick: function () { UI.fecharModal(); try { self._ctx.excluir(f.id); } catch (e) {} self._sincronizarVisor(); self.render(); toast("Família excluída.", "ok"); } }
      ]);
    },

    /* ------------------------------------------------------- EDITOR */
    editar: function (f, editavel) {
      var c = JSON.parse(JSON.stringify(f));
      if (!editavel) { c.id = "fam-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); c.nome = f.nome + " (cópia)"; c._origem = "minha"; }
      if (!c._origem) c._origem = "minha";
      this._edit = { fam: c, tipoPrev: ((c.tipos || [])[0] || {}).id || "", novo: !editavel || !this.obter(c.id) };
      this._modo = "editor";
      this.render();
      if (!editavel) toast("A família RA é a referência e não muda. Você está editando uma CÓPIA — salve para ela entrar na biblioteca.", "info");
    },
    _renderEditor: function () {
      var self = this, ed = this._edit, f = ed.fam, Fm = F();
      var h = '<div class="fe fe-ed"><div class="fe-topo"><button class="btn sm" data-fe="voltar">← Biblioteca</button>' +
        '<button class="btn sm primary" data-fe="salvar">Salvar na biblioteca</button><button class="btn sm" data-fe="exportar-ed">Exportar .opfam</button>' +
        '<button class="btn sm" data-fe="colocar-ed">Colocar no modelo</button></div>';
      h += '<div class="fe-prev"><canvas class="fe-canvas" data-fe="canvas"></canvas><div class="fe-prev-l"><label>Tipo na prévia <select data-fe="tipoPrev">' +
        (f.tipos || []).map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === ed.tipoPrev ? " selected" : "") + ">" + esc(t.nome) + "</option>"; }).join("") + '</select></label><span class="fe-dica">arraste para girar · roda dá zoom</span></div><div class="fe-msgs" data-fe="msgs"></div></div>';
      /* identidade */
      h += '<details open class="fe-sec"><summary>Identidade</summary><div class="fe-grade2">' +
        '<label>Nome<input data-fv="nome" value="' + esc(f.nome) + '"></label>' +
        '<label>Categoria<select data-fv="categoria">' + opt(Fm.CATEGORIAS, f.categoria) + "</select></label>" +
        '<label>Hospedagem<select data-fv="hospedagem"><option value="livre"' + (f.hospedagem !== "parede" ? " selected" : "") + '>Livre (colocar no piso)</option><option value="parede"' + (f.hospedagem === "parede" ? " selected" : "") + ">Em parede (abre vão)</option></select></label>" +
        '<label class="fe-larga">Descrição<input data-fv="descricao" value="' + esc(f.descricao || "") + '"></label></div></details>';
      /* parâmetros */
      h += '<details open class="fe-sec"><summary>Parâmetros <small>' + (f.parametros || []).length + '</small></summary><div class="fe-tab-env"><table class="fe-tab"><thead><tr><th>Nome</th><th>Tipo de dado</th><th>Escopo</th><th>Valor</th><th>Fórmula</th><th>Grupo</th><th></th></tr></thead><tbody>';
      (f.parametros || []).forEach(function (p, i) {
        h += '<tr data-pi="' + i + '"><td><input data-fp="nome" value="' + esc(p.nome) + '"></td><td><select data-fp="tipoDado">' + opt(Fm.TIPOS_DADO, p.tipoDado || "comprimento") + "</select></td>" +
          '<td><select data-fp="escopo"><option value="tipo"' + (p.escopo !== "instancia" ? " selected" : "") + '>Tipo</option><option value="instancia"' + (p.escopo === "instancia" ? " selected" : "") + ">Instância</option></select></td>" +
          '<td><input data-fp="valor" value="' + esc(p.valor == null ? "" : p.valor) + '"' + (p.formula ? ' disabled title="Tem fórmula: o valor vem dela"' : "") + "></td>" +
          '<td><input data-fp="formula" class="fe-form" placeholder="ex.: Largura*2" value="' + esc(p.formula || "") + '"></td><td><input data-fp="grupo" value="' + esc(p.grupo || "") + '"></td>' +
          '<td><button class="btn sm ghost" data-fe="rm-param" title="Tirar o parâmetro">✕</button></td></tr>';
      });
      h += '</tbody></table></div><button class="btn sm" data-fe="add-param">+ Parâmetro</button><p class="fe-ajuda">Fórmula: + − * / ^ ( ), comparações, <b>se(cond; a; b)</b>, min, max, arred(x; casas), raiz, abs, sen/cos/tan (graus), pi(). Separe os argumentos com <b>;</b>. Use vírgula ou ponto nos números.</p></details>';
      /* tipos */
      var pts = (f.parametros || []).filter(function (p) { return p.escopo !== "instancia" && !p.formula && !p.somenteLeitura; });   /* FAMIMPORT: o que tem fórmula é de leitura */
      h += '<details open class="fe-sec"><summary>Tipos <small>' + (f.tipos || []).length + '</small></summary><div class="fe-tab-env"><table class="fe-tab"><thead><tr><th>Tipo</th><th title="Código de composição do TIPO — vence o da família">Código</th>' + pts.map(function (p) { return "<th>" + esc(p.rotulo || p.nome) + "</th>"; }).join("") + "<th></th></tr></thead><tbody>";
      (f.tipos || []).forEach(function (t, i) {
        h += '<tr data-ti="' + i + '"><td><input data-ft="nome" value="' + esc(t.nome) + '"></td><td><input data-ft="codigo" placeholder="' + esc((f.quantitativo || {}).codigo || "") + '" value="' + esc(t.codigo || "") + '" style="width:76px"></td>' + pts.map(function (p) {
          var v = t.valores && t.valores[p.nome] != null ? t.valores[p.nome] : "";
          return '<td><input data-ft="v" data-pn="' + esc(p.nome) + '" placeholder="' + esc(p.valor == null ? "" : p.valor) + '" value="' + esc(v) + '"></td>';
        }).join("") + '<td><button class="btn sm ghost" data-fe="rm-tipo">✕</button></td></tr>';
      });
      h += '</tbody></table></div><button class="btn sm" data-fe="add-tipo">+ Tipo</button><p class="fe-ajuda">Célula vazia = vale o valor padrão do parâmetro. Código do tipo vazio = vale o código da família (Quantitativo).</p></details>';
      /* geometria */
      if (f.geometria === "malha" && f.importada) {
        /* FAMIMPORT: a forma da família importada é a MALHA de cada tipo — não se edita aqui; o vão também vem por tipo */
        var im = f.importada;
        h += '<details open class="fe-sec"><summary>Geometria importada</summary><p class="fe-ajuda">' + (im.geometriaPendente ? "Geometria pendente: a família veio do .rfa sem a forma 3D (uma caixa marca o lugar). Converta pelo plugin OrçaPRO for Revit e arraste o .opfam: ele entra no lugar desta."
          : "Malha de cada tipo (" + (im.triangulos || 0) + " triângulos), de " + esc(im.categoriaNome || "") + ". Mudar um parâmetro de medida muda o valor e a quantidade; a forma 3D continua a do tipo importado.") + "</p></details>";
      } else {
      h += '<details open class="fe-sec"><summary>Geometria <small>' + (f.solidos || []).length + ' sólido(s)</small></summary>';
      (f.solidos || []).forEach(function (s, i) {
        var campos = [["x", "X"], ["y", "Y (base)"], ["z", "Z"]];
        if (s.forma === "caixa") campos = campos.concat([["dx", "Largura (X)"], ["dy", "Altura (Y)"], ["dz", "Profund. (Z)"], ["rot", "Giro (°)"]]);
        else if (s.forma === "cilindro") campos = campos.concat([["raio", "Raio"], ["altura", "Comprimento"]]);
        else campos = campos.concat([["altura", "Espessura / altura"], ["rot", "Giro (°)"]]);
        h += '<div class="fe-sol" data-si="' + i + '"><div class="fe-sol-cab"><input data-fs="nome" value="' + esc(s.nome || "") + '" placeholder="nome"><select data-fs="forma">' + opt(Fm.FORMAS, s.forma) + "</select>" +
          (s.forma === "cilindro" ? '<select data-fs="eixo"><option value="y"' + (s.eixo !== "x" && s.eixo !== "z" ? " selected" : "") + '>em pé (Y)</option><option value="x"' + (s.eixo === "x" ? " selected" : "") + '>deitado em X</option><option value="z"' + (s.eixo === "z" ? " selected" : "") + ">deitado em Z</option></select>" : "") +
          (s.forma === "extrusao" ? '<select data-fs="plano"><option value="planta"' + (s.plano !== "frente" ? " selected" : "") + '>contorno em planta</option><option value="frente"' + (s.plano === "frente" ? " selected" : "") + ">contorno de frente</option></select>" : "") +
          '<button class="btn sm ghost" data-fe="rm-sol">✕</button></div><div class="fe-grade4">' +
          campos.map(function (c) { return '<label>' + c[1] + '<input class="fe-form" data-fs="' + c[0] + '" value="' + esc(s[c[0]] == null ? "" : s[c[0]]) + '"></label>'; }).join("") +
          '<label>Material<input data-fs="material" value="' + esc(s.material || "") + '" placeholder="nome ou parâmetro"></label><label>Visível se<input class="fe-form" data-fs="visivel" value="' + esc(s.visivel || "") + '" placeholder="sempre"></label></div>' +
          (s.forma === "extrusao" ? '<label class="fe-larga">Contorno (um ponto por linha: x ; z — aceita fórmula)<textarea data-fs="contorno" rows="4">' + esc((s.contorno || []).map(function (q) { return q[0] + " ; " + q[1]; }).join("\n")) + "</textarea></label>" : "") + "</div>";
      });
      h += '<div class="fe-topo"><button class="btn sm" data-fe="add-caixa">+ Caixa</button><button class="btn sm" data-fe="add-cil">+ Cilindro</button><button class="btn sm" data-fe="add-ext">+ Extrusão</button></div>' +
        '<p class="fe-ajuda">Sistema da família: origem no piso; X ao longo da parede, Y para cima, Z para fora. Caixa: X, Y, Z = centro da base. Todo campo aceita número ou fórmula com os parâmetros.</p></details>';
      }
      if (f.hospedagem === "parede" && f.geometria !== "malha") {
        var ab = f.abertura || {};
        h += '<details open class="fe-sec"><summary>Vão na parede</summary><div class="fe-grade4"><label>Largura<input class="fe-form" data-fa="largura" value="' + esc(ab.largura || "") + '"></label><label>Altura<input class="fe-form" data-fa="altura" value="' + esc(ab.altura || "") + '"></label><label>Peitoril<input class="fe-form" data-fa="peitoril" value="' + esc(ab.peitoril || "0") + '"></label></div><p class="fe-ajuda">O vão é aberto na parede onde a família é colocada e descontado do quantitativo da parede.</p></details>';
      }
      var q = f.quantitativo || {};
      h += '<details open class="fe-sec"><summary>Quantitativo e orçamento</summary><div class="fe-grade4"><label>Unidade<select data-fq="unidade">' + opt(Fm.UNIDADES_QTO, q.unidade || "un") + '</select></label>' +
        '<label>Quantidade<input class="fe-form" data-fq="quantidade" value="' + esc(q.quantidade || "1") + '"></label><label>Código (SINAPI/próprio)<input data-fq="codigo" value="' + esc(q.codigo || "") + '"></label><label>Fonte<input data-fq="fonte" value="' + esc(q.fonte || "") + '"></label>' +
        '<label class="fe-larga">Descrição no orçamento<input data-fq="descricao" value="' + esc(q.descricao || "") + '"></label></div>' +
        /* F1: serviços A MAIS da família (a fôrma do pilar além do concreto) — código opcional; a peça escolhe em Propriedades › Orçamento */
        '<div class="fe-tab-env"><table class="fe-tab"><thead><tr><th>Serviço (id)</th><th>Descrição</th><th>Unidade</th><th>Quantidade</th><th>Código</th><th></th></tr></thead><tbody>' +
        (f.servicos || []).map(function (s, i) {
          return '<tr data-svi="' + i + '"><td><input data-fsv="id" value="' + esc(s.id) + '" style="width:80px"></td><td><input data-fsv="descricao" value="' + esc(s.descricao || "") + '"></td><td><select data-fsv="unidade">' + opt(Fm.UNIDADES_QTO, s.unidade || "m2") + '</select></td>' +
            '<td><input class="fe-form" data-fsv="quantidade" value="' + esc(s.quantidade || "") + '"></td><td><input data-fsv="codigo" value="' + esc(s.codigo || "") + '" style="width:76px"></td><td><button class="btn sm ghost" data-fe="rm-serv">✕</button></td></tr>';
        }).join("") + '</tbody></table></div><button class="btn sm" data-fe="add-serv">+ Serviço</button>' +
        '<p class="fe-ajuda">A família leva o código, nunca o preço: o preço vem da base do orçamento. Serviço sem código não entra; a peça colocada pode escolher a composição dele em Propriedades › Orçamento.</p></details></div>';
      this._el.innerHTML = h;
      this._ligarEditor();
      this._validarPrevia();
    },
    _ligarEditor: function () {
      var self = this, el = this._el, f = this._edit.fam;
      el.onclick = function (e) {
        var b = e.target.closest ? e.target.closest("[data-fe]") : null; if (!b) return;
        var k = b.getAttribute("data-fe");
        if (k === "voltar") { self._modo = "biblioteca"; self._edit = null; self.render(); return; }
        if (k === "salvar") return self._salvarEditor();
        if (k === "exportar-ed") { var v = F().validar(f); if (!v.ok) { toast("Corrija antes de exportar: " + v.erros[0], "erro"); return; } self.exportar(f); return; }
        if (k === "colocar-ed") { if (self._salvarEditor(true)) self.colocar(f, self._edit.tipoPrev); return; }
        if (k === "add-param") { var n = 1; while ((f.parametros || []).some(function (p) { return p.nome === "Param" + n; })) n++; (f.parametros = f.parametros || []).push({ nome: "Param" + n, tipoDado: "comprimento", escopo: "tipo", valor: 0.1, grupo: "Dimensões" }); }
        else if (k === "rm-param") { f.parametros.splice(+b.closest("tr").getAttribute("data-pi"), 1); }
        else if (k === "add-tipo") { (f.tipos = f.tipos || []).push({ id: "t" + Date.now().toString(36), nome: "Tipo " + ((f.tipos || []).length + 1), valores: {} }); }
        else if (k === "rm-tipo") { if ((f.tipos || []).length <= 1) { toast("A família precisa de pelo menos um tipo.", "aviso"); return; } f.tipos.splice(+b.closest("tr").getAttribute("data-ti"), 1); }
        else if (k === "add-caixa") (f.solidos = f.solidos || []).push({ id: "s" + Date.now().toString(36), nome: "Caixa", forma: "caixa", x: "0", y: "0", z: "0", dx: "0.5", dy: "0.5", dz: "0.5", material: "Concreto" });
        else if (k === "add-cil") (f.solidos = f.solidos || []).push({ id: "s" + Date.now().toString(36), nome: "Cilindro", forma: "cilindro", eixo: "y", x: "0", y: "0", z: "0", raio: "0.1", altura: "1", material: "Metal" });
        else if (k === "add-ext") (f.solidos = f.solidos || []).push({ id: "s" + Date.now().toString(36), nome: "Extrusão", forma: "extrusao", plano: "planta", x: "0", y: "0", z: "0", altura: "0.1", contorno: [["0", "0"], ["1", "0"], ["1", "1"], ["0", "1"]], material: "Concreto" });
        else if (k === "rm-sol") { f.solidos.splice(+b.closest(".fe-sol").getAttribute("data-si"), 1); }
        else if (k === "add-serv") { var ns = 1; while ((f.servicos || []).some(function (s) { return s.id === "servico" + ns; })) ns++; (f.servicos = f.servicos || []).push({ id: "servico" + ns, descricao: "Serviço " + ns, unidade: (f.quantitativo || {}).unidade || "un", quantidade: (f.quantitativo || {}).quantidade || "1", codigo: "" }); }
        else if (k === "rm-serv") { f.servicos.splice(+b.closest("tr").getAttribute("data-svi"), 1); if (!f.servicos.length) delete f.servicos; }
        else return;
        self._renderEditor();
      };
      function mudou(t, reRender) {
        var tr;
        if (t.hasAttribute("data-fv")) { f[t.getAttribute("data-fv")] = t.value; if (t.getAttribute("data-fv") === "hospedagem") { if (t.value === "parede" && !f.abertura) f.abertura = { largura: "Largura", altura: "Altura", peitoril: "0" }; reRender = true; } }
        else if (t.hasAttribute("data-fp")) {
          tr = t.closest("tr"); var p = f.parametros[+tr.getAttribute("data-pi")], k2 = t.getAttribute("data-fp");
          if (k2 === "nome") { var antigo = p.nome; p.nome = t.value.trim(); (f.tipos || []).forEach(function (ti) { if (ti.valores && antigo in ti.valores) { ti.valores[p.nome] = ti.valores[antigo]; delete ti.valores[antigo]; } }); reRender = true; }
          else if (k2 === "formula") { if (t.value.trim()) p.formula = t.value.trim(); else delete p.formula; reRender = true; }
          else if (k2 === "valor") p.valor = t.value;
          else { p[k2] = t.value; reRender = reRender || k2 === "escopo"; }
        } else if (t.hasAttribute("data-ft")) {
          tr = t.closest("tr"); var ti = f.tipos[+tr.getAttribute("data-ti")];
          if (t.getAttribute("data-ft") === "nome") ti.nome = t.value;
          else if (t.getAttribute("data-ft") === "codigo") { if (t.value.trim()) ti.codigo = t.value.trim(); else delete ti.codigo; }
          else { ti.valores = ti.valores || {}; var pn = t.getAttribute("data-pn"); if (t.value === "") delete ti.valores[pn]; else ti.valores[pn] = t.value; }
          if (t.getAttribute("data-ft") === "nome") reRender = true;
        } else if (t.hasAttribute("data-fs")) {
          var s = f.solidos[+t.closest(".fe-sol").getAttribute("data-si")], k3 = t.getAttribute("data-fs");
          if (k3 === "contorno") s.contorno = t.value.split(/\n+/).map(function (l) { return l.split(";").map(function (x) { return x.trim(); }); }).filter(function (q) { return q.length >= 2 && q[0] !== ""; }).map(function (q) { return [q[0], q[1]]; });
          else if (t.value === "" && (k3 === "visivel" || k3 === "rot")) delete s[k3];
          else s[k3] = t.value;
          if (k3 === "forma" || k3 === "plano" || k3 === "eixo") reRender = true;
        } else if (t.hasAttribute("data-fa")) { f.abertura = f.abertura || {}; f.abertura[t.getAttribute("data-fa")] = t.value; }
        else if (t.hasAttribute("data-fq")) { f.quantitativo = f.quantitativo || {}; f.quantitativo[t.getAttribute("data-fq")] = t.value; }
        else if (t.hasAttribute("data-fsv")) { var sv = f.servicos[+t.closest("tr").getAttribute("data-svi")]; sv[t.getAttribute("data-fsv")] = t.getAttribute("data-fsv") === "codigo" ? t.value.trim() : t.value; }
        else if (t.getAttribute("data-fe") === "tipoPrev") self._edit.tipoPrev = t.value;
        if (reRender) self._renderEditor(); else self._validarPrevia();
      }
      el.onchange = function (e) { if (e.target && e.target.getAttribute) mudou(e.target, false); };
      el.oninput = function (e) {
        var t = e.target; if (!t || !t.classList || !(t.classList.contains("fe-form"))) return;
        clearTimeout(self._tIn); self._tIn = setTimeout(function () { mudou(t, false); }, 350);
      };
    },
    _validarPrevia: function () {
      var f = this._edit.fam, v = F().validar(f), r = v.ok ? F().avaliar(f, this._edit.tipoPrev, {}) : null;
      var m = this._el.querySelector('[data-fe="msgs"]');
      if (m) {
        var erros = v.erros.concat(r && !r.ok ? r.erros : []);
        m.innerHTML = erros.length ? '<div class="fe-erro">' + erros.map(esc).join("<br>") + "</div>"
          : '<div class="fe-ok">Família válida' + (r ? " · " + r.solidos.length + " sólido(s)" + (r.abertura ? " · vão " + r.abertura.largura.toFixed(2).replace(".", ",") + " × " + r.abertura.altura.toFixed(2).replace(".", ",") : "") + " · quantidade " + String(Math.round(r.quantitativo.quantidade * 1000) / 1000).replace(".", ",") + " " + esc(r.quantitativo.unidade) : "") + "</div>" +
            (v.avisos.length ? '<div class="fe-aviso">' + v.avisos.map(esc).join("<br>") + "</div>" : "");
      }
      var cv = this._el.querySelector('[data-fe="canvas"]');
      if (cv && r && global.BIM && BIM.familiaPreview) { try { BIM.familiaPreview(cv, r); } catch (e) {} }
      return v.ok;
    },
    _salvarEditor: function (calado) {
      var f = this._edit.fam, v = F().validar(f);
      if (!v.ok) { toast("A família tem problemas: " + v.erros[0], "erro"); return false; }
      if (!this._salvar(f)) return false;
      this._edit.novo = false;
      if (!calado) toast("\"" + f.nome + "\" salva na biblioteca.", "ok");
      return true;
    }
  };

  global.FamiliaUI = FamiliaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimp10ui.js — a TELA da P10 (fases, grupos, opções de projeto e
 * utilidades de Gerenciar), prévia `?previa=modelador`.
 *
 * Os motores são puros: js/bimfases.js, js/bimgrupos.js, js/bimopcoes.js,
 * js/bimgerenciar.js. Aqui só: a FITA (Arquitetura › Grupos e reforma;
 * Gerenciar › Fases e opções e Consultar), os DIÁLOGOS, os GRÁFICOS DE FASE
 * no 3D (existente em meio-tom, demolido tracejado e translúcido; o que o
 * filtro esconde some — a planta 2D, cortada da cena, segue), a opção de
 * projeto visível e a "Fase"/"Filtro da fase" nas Propriedades da vista.
 * Quem chama: js/gestao.js (registrar, propsVista — ganchos "P10") e
 * js/bim.js (montar3d/aposRebuild — gancho "P10"). Toda mudança no modelo
 * vira OP do editor (BIM.b2Op / BIM.editarLote): o Ctrl+Z de sempre volta.
 *
 * Sem a prévia NADA daqui roda: `registrar` e `montar3d` saem na hora.
 * ===================================================================== */
(function (global) {
  "use strict";
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function B() { return global.BIM || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  function moeda(v) { var n = Number(v) || 0; return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function n2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  var CHAVE_VISTA = "orcapro:bim:p10:vista";

  /* a vista (fase, filtro de fase, opção visível de cada conjunto) — preferência do aparelho */
  function lerVista() {
    var v = null; try { v = JSON.parse(global.localStorage.getItem(CHAVE_VISTA) || "null"); } catch (e) { v = null; }
    v = v && typeof v === "object" ? v : {};
    return { fase: v.fase || null, filtro: v.filtro || "tudo", escolha: v.escolha && typeof v.escolha === "object" ? v.escolha : {} };
  }
  function gravarVista(v) { try { global.localStorage.setItem(CHAVE_VISTA, JSON.stringify(v)); } catch (e) {} }

  var BimP10UI = {
    ativo: previa,
    _G: null, _3d: null, _vista: null, _novoN: 0,
    vista: function () { if (!this._vista) this._vista = lerVista(); return this._vista; },
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    deps: function () {
      var b = B();
      return { avaliarFam: b && b.familiaAvaliar ? function (f, t, i) { return b.familiaAvaliar(f, t, i); } : null,
               categoriaFam: b && b.familiaCategoria ? function (id) { return b.familiaCategoria(id); } : null,
               novoId: function () { BimP10UI._novoN++; return "p10-" + Date.now().toString(36) + "-" + BimP10UI._novoN; },
               niveis: global.BimArqUI && global.BimArqUI.niveis ? global.BimArqUI.niveis() : [] };
    },
    /* a fase da vista: a escolhida (se ainda existe) ou a última do projeto */
    fase: function (st) {
      var BF = global.BimFases; if (!BF) return null;
      var l = BF.lista(st || this.estado()), f = this.vista().fase;
      return l.indexOf(f) >= 0 ? f : l[l.length - 1];
    },
    /* as peças do editor selecionadas (o desenho de precisão; senão a seleção da casca) */
    selecao: function () {
      var ids = [], b = B();
      try { var p = b && b.precisao ? b.precisao() : null; if (p) ids = p.selecao().map(String); } catch (e) {}
      if (!ids.length) { var G = this._G || global.Gestao, u = G && G._bimSelecao && G._bimSelecao.uid; if (u && /^edit:/.test(u)) ids = [String(u).slice(5)]; }
      return ids;
    },
    /* uma op (ou um lote) para o editor */
    enviar: function (op) {
      var b = B(); if (!b || !op) return false;
      if (op.op === "lote") return !!(b.editarLote && b.editarLote(op));
      return !!(b.b2Op && b.b2Op(op));
    },

    /* ================================================= FITA */
    registrar: function (reg, G) {
      this._G = G || this._G;
      if (!previa() || !global.BimRibbon || !global.BimFases) return false;
      var self = this, R = global.BimRibbon;
      R.acrescentar("arquitetura", "Arquitetura", "Grupos e reforma", [
        { id: "demolir", rotulo: "Demolir", icone: "lixeira", grande: true, dica: "Demolir: a peça selecionada ganha a \"Fase demolida\" = a fase da vista. Sai do orçamento de construção e vira serviço de DEMOLIÇÃO (composição SINAPI do mapa, ou pendente). A porta e a janela da parede vão junto." },
        { id: "criar-grupo", rotulo: "Criar\ngrupo", icone: "camadas", grande: true, dica: "Grupo de modelo (banheiro tipo, apartamento tipo): as peças selecionadas viram um grupo. Mudar uma peça do grupo muda todas as cópias." },
        { id: "colar-niveis", rotulo: "Colar nos\nníveis", icone: "copiar", grande: true, dica: "Colar alinhado aos níveis selecionados: o grupo da peça selecionada é colado em cada nível marcado, na mesma posição — a cópia sobe para a altura do nível." },
        { id: "editar-grupo", rotulo: "Editar\ngrupo", icone: "editar", grande: true, dica: "Renomear o grupo, pôr a seleção nele ou tirar peças. Editar uma peça do grupo (ou a cópia dela) já vale para todas as instâncias." },
        { id: "desagrupar", rotulo: "Desagrupar", icone: "expandir", grande: true, dica: "Desagrupar: a cópia selecionada vira peças soltas (deixa de seguir o grupo); na peça do grupo original, o grupo inteiro deixa de existir." }
      ]);
      R.acrescentar("gerenciar", "Gerenciar", "Fases e opções", [
        { id: "fases", rotulo: "Fases", icone: "calendario", grande: true, dica: "As fases do projeto (Existente, Construção nova…), na ordem do tempo: renomear, inserir, combinar; a fase e o filtro de fase da vista; a composição de demolição de cada categoria." },
        { id: "filtro-fase", rotulo: "Filtro\nde fase", icone: "olho", grande: true, dica: "Mostrar tudo, Mostrar somente fase atual, Mostrar demolição, Mostrar completo…: o que aparece no 3D e na planta, com o existente em meio-tom e o demolido tracejado." },
        { id: "opcoes-projeto", rotulo: "Opções de\nprojeto", icone: "ciclo", grande: true, dica: "Alternativas no mesmo modelo (cozinha A ou B, porcelanato ou vinílico): conjunto de opções, opção principal, a seleção para a opção — e o ORÇAMENTO de cada opção, lado a lado." }
      ]);
      R.acrescentar("gerenciar", "Gerenciar", "Consultar", [
        { id: "selecionar-id", rotulo: "Selecionar\npor ID", icone: "buscar", grande: true, dica: "Selecionar por ID: o id da peça, a Marca (P01, PA03) ou o IfcGUID; vários separados por vírgula." },
        { id: "localizar-substituir", rotulo: "Localizar e\nsubstituir", icone: "lista", grande: true, dica: "Procura um texto nos parâmetros (Comentários, Marca, Descrição do tipo, parâmetros do projeto, nome do ambiente) e troca de uma vez — um Ctrl+Z desfaz a troca inteira." },
        { id: "advertencias", rotulo: "Revisar\nadvertências", icone: "checklist", grande: true, dica: "A lista geral das advertências do modelo: canto sem união, ambiente redundante, forro sem contorno, vão sobreposto, marca repetida, nível que sumiu, fase inválida — com o botão de selecionar as peças." },
        { id: "limpar-nao-usados", rotulo: "Limpar não\nutilizados", icone: "estoque", grande: true, dica: "Tira os tipos do projeto sem instância e os grupos sem peça." },
        { id: "vista-inicial", rotulo: "Vista\ninicial", icone: "casa", grande: true, dica: "A vista que abre primeiro nesta obra, neste aparelho." }
      ]);
      reg.demolir = function () { self.demolir(); return true; };
      reg["criar-grupo"] = function () { self.criarGrupo(); return true; };
      reg["colar-niveis"] = function () { self.colarNiveis(); return true; };
      reg["editar-grupo"] = function () { self.editarGrupo(); return true; };
      reg.desagrupar = function () { self.desagrupar(); return true; };
      reg.fases = function () { self.dialogoFases(); return true; };
      reg["filtro-fase"] = function () { self.dialogoFiltro(); return true; };
      reg["opcoes-projeto"] = function () { self.dialogoOpcoes(); return true; };
      reg["selecionar-id"] = function () { self.dialogoSelecionarId(); return true; };
      reg["localizar-substituir"] = function () { self.dialogoLocalizar(); return true; };
      reg.advertencias = function () { self.dialogoAdvertencias(); return true; };
      reg["limpar-nao-usados"] = function () { self.dialogoLimpar(); return true; };
      reg["vista-inicial"] = function () { self.dialogoVistaInicial(); return true; };
      try { if (global.BimPrecisao && global.BimPrecisao.ATALHOS && !global.BimPrecisao.ATALHOS.GP) global.BimPrecisao.ATALHOS.GP = "criar-grupo"; } catch (eA) {}
      setTimeout(function () { try { self.aplicarVistaInicial(); } catch (eV) {} }, 1500);
      return true;
    },

    /* ================================================= MODIFICAR */
    demolir: function () {
      var st = this.estado(), ids = this.selecao(), BF = global.BimFases;
      if (!st || !BF) return false;
      var r = BF.opDemolir(st, ids, this.fase(st), this.deps());
      if (!r.ok) { status(r.motivo); toast(r.motivo, "aviso"); return false; }
      if (!this.enviar(r.op)) { toast("O editor recusou a demolição.", "erro"); return false; }
      status("Demolido na fase \"" + r.fase + "\": " + r.ids.join(", ") + " — sai do orçamento de construção e entra como demolição (Ctrl+Z desfaz)." + (r.pulos.length ? " Ficou de fora: " + r.pulos.map(function (p) { return p.id + " (" + p.motivo + ")"; }).join(", ") + "." : ""));
      return r;
    },
    criarGrupo: function (nome) {
      var st = this.estado(), ids = this.selecao(), self = this, BG = global.BimGrupos;
      if (!st || !BG) return false;
      if (!ids.length) { status("Selecione as peças do grupo (Ctrl+clique soma) e clique Criar grupo."); return false; }
      function criar(n) {
        var r = BG.opCriar(st, ids, n);
        if (!r.ok) { toast(r.motivo, "aviso"); return false; }
        if (!self.enviar(r.op)) { toast("O editor recusou o grupo.", "erro"); return false; }
        status("Grupo \"" + r.op.nome + "\" criado com " + r.ids.length + " peça(s). Colar nos níveis põe cópias nos pavimentos.");
        return r;
      }
      if (nome != null) return criar(nome);
      var n0 = "Grupo " + (arr(st.grupos).length + 1);
      if (!global.UI || !global.UI.modal) return criar(n0);
      global.UI.modal("Criar grupo", '<p style="font-size:12.5px">' + ids.length + ' peça(s) selecionada(s). A porta e a janela das paredes vão junto.</p>' +
        '<label style="display:block;font-size:12.5px">Nome do grupo <input data-p10="grupo-nome" value="' + esc(n0) + '" style="width:100%"></label>', [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Criar", classe: "primary", onClick: function () { var v = (document.querySelector('[data-p10="grupo-nome"]') || {}).value; global.UI.fecharModal(); criar(v || n0); } }
      ]);
      return true;
    },
    /* o grupo da seleção: o da peça (ou da cópia) selecionada; ou o único do projeto */
    grupoDaSelecao: function (st) {
      var BG = global.BimGrupos, ids = this.selecao();
      for (var i = 0; i < ids.length; i++) { var q = BG.deQuem(st, ids[i]); if (q) return q.grupo; }
      return arr(st && st.grupos).length === 1 ? st.grupos[0].id : null;
    },
    colarNiveis: function (niveisIds) {
      var st = this.estado(), BG = global.BimGrupos, self = this; if (!st || !BG) return false;
      var gid = this.grupoDaSelecao(st);
      if (!gid) { status("Selecione uma peça do grupo a colar."); return false; }
      var g = arr(st.grupos).filter(function (x) { return x.id === gid; })[0];
      function colar(lista) {
        var r = BG.opColarNiveis(st, gid, lista, self.deps().novoId);
        if (!r.ok) { toast(r.motivo, "aviso"); return false; }
        if (!self.enviar(r.op)) { toast("O editor recusou a colagem.", "erro"); return false; }
        status("Grupo \"" + g.nome + "\" colado em " + r.instancias.length + " nível(is): " + r.instancias.join(", ") + ". Mudar uma peça do grupo muda todas as cópias (Ctrl+Z desfaz a colagem).");
        return r;
      }
      if (niveisIds) return colar(niveisIds);
      var nv = this.deps().niveis;
      if (!nv.length) { toast("A obra não tem níveis: crie os níveis (Arquitetura › Níveis) para colar nos pavimentos.", "aviso"); return false; }
      var h = '<p style="font-size:12.5px">Grupo <b>' + esc(g.nome) + '</b> (no nível ' + esc((nv.filter(function (n) { return String(n.id) === String(g.nivelId); })[0] || {}).nome || "—") + '). Marque os níveis onde colar:</p>' +
        nv.map(function (n) { var mesmo = String(n.id) === String(g.nivelId); return '<label style="display:block;font-size:12.5px"><input type="checkbox" data-p10-nivel="' + esc(n.id) + '"' + (mesmo ? " disabled" : "") + '> ' + esc(n.nome) + " (" + n2(n.elevacao) + " m)" + (mesmo ? " — o do grupo" : "") + "</label>"; }).join("");
      global.UI.modal("Colar alinhado aos níveis selecionados", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Colar", classe: "primary", onClick: function () {
          var l = Array.prototype.map.call(document.querySelectorAll("[data-p10-nivel]:checked"), function (c) { return c.getAttribute("data-p10-nivel"); });
          global.UI.fecharModal(); colar(l);
        } }
      ]);
      return true;
    },
    editarGrupo: function () {
      var st = this.estado(), BG = global.BimGrupos, self = this; if (!st || !BG) return false;
      var gid = this.grupoDaSelecao(st);
      if (!gid) { status("Selecione uma peça do grupo."); return false; }
      var g = arr(st.grupos).filter(function (x) { return x.id === gid; })[0], membros = g.membros.slice();
      function pintar() {
        var b = document.querySelector('[data-p10="grupo-membros"]'); if (!b) return;
        b.innerHTML = membros.map(function (m) { return '<li>' + esc(m) + ' <button class="btn sm ghost" data-p10-tirar="' + esc(m) + '">Tirar</button></li>'; }).join("");
      }
      var h = '<label style="display:block;font-size:12.5px">Nome <input data-p10="grupo-renomear" value="' + esc(g.nome) + '" style="width:100%"></label>' +
        '<p class="muted" style="font-size:12px">Editar uma peça do grupo — ou a cópia dela em outro nível — muda TODAS as instâncias (' + (g.instancias.length + 1) + ').</p>' +
        '<b style="font-size:12.5px">Peças</b><ul data-p10="grupo-membros" style="font-size:12.5px;margin:4px 0"></ul>' +
        '<button class="btn sm" data-p10="grupo-por-selecao">Pôr a seleção no grupo</button>';
      var bg = global.UI.modal("Editar grupo", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Aplicar", classe: "primary", onClick: function () {
          var nome = (document.querySelector('[data-p10="grupo-renomear"]') || {}).value || g.nome;
          global.UI.fecharModal();
          if (!membros.length) { toast("O grupo ficaria sem peças: use Desagrupar.", "aviso"); return; }
          var op = { op: "grupo", acao: "editar", id: g.id };
          if (nome !== g.nome) op.nome = nome;
          if (membros.join("|") !== g.membros.join("|")) op.membros = membros;
          if (op.nome == null && op.membros == null) return;
          if (self.enviar(op)) status("Grupo \"" + (op.nome || g.nome) + "\" editado — todas as instâncias acompanham.");
        } }
      ]);
      pintar();
      if (bg) bg.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-p10-tirar],[data-p10=grupo-por-selecao]") : null; if (!t) return;
        if (t.getAttribute("data-p10-tirar")) { var k = t.getAttribute("data-p10-tirar"); membros = membros.filter(function (m) { return m !== k; }); }
        else self.selecao().forEach(function (id) { var q = BG.deQuem(st, id); if (!q && membros.indexOf(id) < 0) membros.push(id); });
        pintar();
      });
      return true;
    },
    desagrupar: function () {
      var st = this.estado(), BG = global.BimGrupos, ids = this.selecao(); if (!st || !BG) return false;
      if (!ids.length) { status("Selecione a peça do grupo (ou a cópia) a desagrupar."); return false; }
      var r = BG.opDesagrupar(st, ids[0]);
      if (!r.ok) { toast(r.motivo, "aviso"); return false; }
      if (!this.enviar(r.op)) { toast("O editor recusou.", "erro"); return false; }
      status(r.op.inst ? "A instância " + r.op.inst + " virou peças soltas (não segue mais o grupo)." : "O grupo deixou de existir: as peças e as cópias ficaram soltas.");
      return r;
    },

    /* ================================================= FASES */
    dialogoFases: function () {
      var st = this.estado(), BF = global.BimFases, self = this; if (!BF || !global.UI) return false;
      var l = BF.lista(st), linhas = l.map(function (n) { return { nome: n, orig: n }; }), renomear = {}, dem = clone((st && st.fases && st.fases.demolicao) || {});
      var v = this.vista(), CATS = ["parede", "laje", "pilar", "viga", "escada", "guarda", "cobertura", "forro", "porta", "janela"];
      var NOME = { parede: "Parede", laje: "Laje", pilar: "Pilar", viga: "Viga", escada: "Escada", guarda: "Guarda-corpo", cobertura: "Cobertura", forro: "Forro", porta: "Porta", janela: "Janela" };
      function padrao(cat) { var m = BF.MAPA_DEMOLICAO[cat] || (cat === "forro" ? BF.MAPA_DEMOLICAO["forro:gesso"] : null); return m ? m.codigo : ""; }
      function corpo() {
        return '<table class="tbl" data-p10="tab-fases"><thead><tr><th>#</th><th>Fase (na ordem do tempo)</th><th></th></tr></thead><tbody>' +
          linhas.map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td><input data-p10-fase="' + i + '" value="' + esc(x.nome) + '"></td><td>' + (i > 0 ? '<button class="btn sm ghost" data-p10-combinar="' + i + '">Combinar com a anterior</button>' : "") + "</td></tr>"; }).join("") +
          '</tbody></table><button class="btn sm" data-p10="fase-nova">Nova fase (no fim)</button>' +
          '<p style="font-size:12.5px;margin-top:10px"><b>Vista</b> — fase <select data-p10="fase-vista">' + linhas.map(function (x) { return '<option' + (x.orig === self.fase(st) ? " selected" : "") + ">" + esc(x.nome) + "</option>"; }).join("") + "</select> · filtro <select data-p10=\"filtro-vista\">" +
          BF.FILTROS.map(function (f) { return '<option value="' + f.id + '"' + (f.id === v.filtro ? " selected" : "") + ">" + esc(f.nome) + "</option>"; }).join("") + "</select></p>" +
          '<p style="font-size:12.5px;margin:10px 0 4px"><b>Demolição</b> — a composição SINAPI de cada categoria (vazio = a do mapa; sem composição, a linha sai PENDENTE):</p>' +
          '<table class="tbl"><tbody>' + CATS.map(function (k) { return "<tr><td>" + NOME[k] + '</td><td><input data-p10-dem="' + k + '" value="' + esc(dem[k] || "") + '" placeholder="' + esc(padrao(k) || "sem composição no mapa") + '" style="width:120px"></td></tr>'; }).join("") + "</tbody></table>";
      }
      function ler() { Array.prototype.forEach.call(document.querySelectorAll("[data-p10-fase]"), function (inp) { var i = +inp.getAttribute("data-p10-fase"); if (linhas[i]) linhas[i].nome = inp.value.trim(); }); }
      var bg = global.UI.modal("Fases", '<div data-p10="fases-corpo">' + corpo() + "</div>", [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Aplicar", classe: "primary", onClick: function () {
          ler();
          linhas.forEach(function (x) { if (x.orig && x.orig !== x.nome) renomear[x.orig] = x.nome; });
          var d2 = {};
          Array.prototype.forEach.call(document.querySelectorAll("[data-p10-dem]"), function (inp) { var k = inp.getAttribute("data-p10-dem"), val = inp.value.trim(); if (val) d2[k] = val; else if (dem[k]) d2[k] = null; });
          var fv = (document.querySelector('[data-p10="fase-vista"]') || {}).value, fl = (document.querySelector('[data-p10="filtro-vista"]') || {}).value;
          var r = BF.opFases(linhas.map(function (x) { return x.nome; }), { renomear: renomear, demolicao: d2 });
          if (!r.ok) { toast(r.motivo, "erro"); return; }
          global.UI.fecharModal();
          var mudou = JSON.stringify(r.op.lista) !== JSON.stringify(l) || r.op.renomear || r.op.demolicao;
          if (mudou && !self.enviar(r.op)) { toast("O editor recusou as fases.", "erro"); return; }
          self.definirVista({ fase: fv || null, filtro: fl || v.filtro });
          status("Fases: " + r.op.lista.join(" → ") + ". Vista na fase \"" + self.fase() + "\", " + BF.filtro(self.vista().filtro).nome + ".");
        } }
      ]);
      if (bg) bg.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-p10-combinar],[data-p10=fase-nova]") : null; if (!t) return;
        ler();
        if (t.getAttribute("data-p10") === "fase-nova") { var k = linhas.length + 1, nm = "Fase " + k; while (linhas.some(function (x) { return x.nome === nm; })) nm = "Fase " + (++k); linhas.push({ nome: nm, orig: null }); }
        else { var i = +t.getAttribute("data-p10-combinar"), x = linhas[i], ant = linhas[i - 1]; if (x.orig) renomear[x.orig] = ant.orig || ant.nome; linhas.splice(i, 1); }
        var c = document.querySelector('[data-p10="fases-corpo"]'); if (c) c.innerHTML = corpo();
      });
      return true;
    },
    dialogoFiltro: function () {
      var BF = global.BimFases, self = this, st = this.estado(); if (!BF || !global.UI) return false;
      var v = this.vista();
      var h = '<p style="font-size:12.5px">Fase da vista <select data-p10="fase-vista">' + BF.lista(st).map(function (f) { return "<option" + (f === self.fase(st) ? " selected" : "") + ">" + esc(f) + "</option>"; }).join("") + "</select></p>" +
        BF.FILTROS.map(function (f) { return '<label style="display:block;font-size:12.5px"><input type="radio" name="p10-filtro" data-p10-filtro="' + f.id + '"' + (f.id === v.filtro ? " checked" : "") + "> " + esc(f.nome) + "</label>"; }).join("") +
        '<p class="muted" style="font-size:12px">Existente em meio-tom, demolido tracejado e translúcido (Gerenciar › Fases). A planta 2D segue a cena.</p>';
      var bg = global.UI.modal("Filtro de fase", h, [{ texto: "Fechar", classe: "primary", onClick: function () { global.UI.fecharModal(); } }]);
      if (global.UI.modalConsulta) global.UI.modalConsulta();
      if (bg) bg.addEventListener("change", function () {
        var f = document.querySelector("[data-p10-filtro]:checked"), fv = (document.querySelector('[data-p10="fase-vista"]') || {}).value;
        self.definirVista({ filtro: f ? f.getAttribute("data-p10-filtro") : v.filtro, fase: fv || null });
        status("Filtro de fase: " + BF.filtro(self.vista().filtro).nome + " na fase \"" + self.fase() + "\".");
      });
      return true;
    },
    definirVista: function (o) {
      var v = this.vista();
      if (o && o.fase !== undefined) v.fase = o.fase;
      if (o && o.filtro) v.filtro = global.BimFases ? global.BimFases.filtro(o.filtro).id : o.filtro;
      if (o && o.escolha) Object.keys(o.escolha).forEach(function (k) { v.escolha[k] = o.escolha[k]; });
      gravarVista(v);
      if (this._3d) this._3d.refazer();
      try { if (global.BimShell && global.BimShell.repintarVista) global.BimShell.repintarVista(); } catch (e) {}
      return v;
    },
    /* "Fase" e "Filtro da fase" nas Propriedades da vista 3D (js/gestao.js _bimPropsVista, gancho P10) */
    propsVista: function (ret) {
      var BF = global.BimFases; if (!previa() || !BF || !ret || !Array.isArray(ret.secoes)) return ret;
      var self = this, st = this.estado(), v = this.vista();
      ret.secoes.push({ nome: "Fases", params: [
        { id: "p10-fase", rotulo: "Fase", tipo: "lista", valor: this.fase(st), opcoes: BF.lista(st).map(function (f) { return { id: f, rotulo: f }; }) },
        { id: "p10-filtro", rotulo: "Filtro da fase", tipo: "lista", valor: v.filtro, opcoes: BF.FILTROS.map(function (f) { return { id: f.id, rotulo: f.nome }; }) }
      ] });
      var antes = ret.onMudar;
      ret.onMudar = function (pid, valor) {
        if (pid === "p10-fase") { self.definirVista({ fase: valor }); return global.Gestao && global.Gestao._bimPropsVista ? global.Gestao._bimPropsVista() : ret; }
        if (pid === "p10-filtro") { self.definirVista({ filtro: valor }); return global.Gestao && global.Gestao._bimPropsVista ? global.Gestao._bimPropsVista() : ret; }
        return antes ? antes(pid, valor) : ret;
      };
      return ret;
    },

    /* ================================================= OPÇÕES DE PROJETO */
    dialogoOpcoes: function () {
      var BO = global.BimOpcoes, self = this; if (!BO || !global.UI) return false;
      function corpo() {
        var st = self.estado(), cs = arr(st && st.opcoes && st.opcoes.conjuntos), v = self.vista(), todas = [];
        var h = '<p style="font-size:12.5px"><input data-p10="conj-nome" placeholder="Nome do conjunto (ex.: Cozinha)"> <button class="btn sm" data-p10="conj-novo">Novo conjunto</button></p>';
        if (!cs.length) h += '<p class="muted" style="font-size:12.5px">Nenhum conjunto de opções. O que está fora de opção é o modelo principal.</p>';
        cs.forEach(function (c) {
          var vis = v.escolha[c.id] || c.principal;
          h += '<div style="border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:6px 8px;margin:6px 0" data-p10-conj="' + esc(c.id) + '"><b>' + esc(c.nome) + '</b> <button class="btn sm ghost" data-p10-acao="opcao-nova" data-p10-id="' + esc(c.id) + '">Nova opção</button> <button class="btn sm ghost" data-p10-acao="aceitar" data-p10-id="' + esc(c.id) + '">Aceitar principal</button> <button class="btn sm ghost" data-p10-acao="apagar" data-p10-id="' + esc(c.id) + '">Apagar conjunto</button>' +
            '<table class="tbl"><tbody>' + c.opcoes.map(function (o) {
              todas.push({ id: o.id, nome: c.nome + " : " + o.nome });
              return '<tr data-p10-op="' + esc(o.id) + '"><td>' + esc(o.nome) + (o.principal ? " <b>(principal)</b>" : "") + '</td><td>' + o.ids.length + ' peça(s)</td><td>' +
                '<label><input type="radio" name="p10-vis-' + esc(c.id) + '" data-p10-vis="' + esc(o.id) + '" data-p10-conjv="' + esc(c.id) + '"' + (vis === o.id ? " checked" : "") + '> mostrar</label> ' +
                (o.principal ? "" : '<button class="btn sm ghost" data-p10-acao="principal" data-p10-id="' + esc(o.id) + '">Tornar principal</button> ') +
                '<button class="btn sm ghost" data-p10-acao="incluir" data-p10-id="' + esc(o.id) + '">Pôr a seleção</button> <button class="btn sm ghost" data-p10-acao="apagar" data-p10-id="' + esc(o.id) + '">Apagar</button></td></tr>';
            }).join("") + "</tbody></table></div>";
        });
        h += '<p style="font-size:12.5px"><button class="btn sm ghost" data-p10-acao="retirar">Tirar a seleção das opções</button></p>';
        if (todas.length >= 2) {
          var sel = function (k, i) { return '<select data-p10="cmp-' + k + '">' + todas.map(function (o, j) { return '<option value="' + esc(o.id) + '"' + (j === i ? " selected" : "") + ">" + esc(o.nome) + "</option>"; }).join("") + "</select>"; };
          h += '<p style="font-size:12.5px;margin-top:8px"><b>Orçamento por opção</b> — ' + sel("a", 0) + " × " + sel("b", 1) + ' <button class="btn sm primary" data-p10="comparar">Comparar</button></p><div data-p10="comparacao"></div>';
        }
        return h;
      }
      var bg = global.UI.modal("Opções de projeto", '<div data-p10="opcoes-corpo" data-modal-largo="1">' + corpo() + "</div>", [{ texto: "Fechar", classe: "primary", onClick: function () { global.UI.fecharModal(); } }]);
      if (global.UI.modalConsulta) global.UI.modalConsulta();
      function repintar() { var c = document.querySelector('[data-p10="opcoes-corpo"]'); if (c) c.innerHTML = corpo(); }
      if (bg) {
        bg.addEventListener("click", function (e) {
          var t = e.target.closest ? e.target.closest("[data-p10-acao],[data-p10=conj-novo],[data-p10=comparar]") : null; if (!t) return;
          var st = self.estado(), a = t.getAttribute("data-p10-acao"), id = t.getAttribute("data-p10-id"), r = null;
          if (t.getAttribute("data-p10") === "conj-novo") r = BO.opConjunto(st, (document.querySelector('[data-p10="conj-nome"]') || {}).value || "Conjunto");
          else if (t.getAttribute("data-p10") === "comparar") { self.comparar((document.querySelector('[data-p10="cmp-a"]') || {}).value, (document.querySelector('[data-p10="cmp-b"]') || {}).value); return; }
          else if (a === "opcao-nova") r = BO.opOpcao(st, id, "");
          else if (a === "incluir") r = BO.opIncluir(st, id, self.selecao());
          else if (a === "retirar") { var s = self.selecao(); r = s.length ? { ok: true, op: { op: "opcoes", acao: "retirar", ids: s } } : { ok: false, motivo: "Selecione as peças." }; }
          else if (a) r = { ok: true, op: { op: "opcoes", acao: a, id: id } };
          if (!r) return;
          if (!r.ok) { toast(r.motivo, "aviso"); return; }
          if (!self.enviar(r.op)) { toast("O editor recusou.", "erro"); return; }
          repintar(); if (self._3d) self._3d.refazer();
        });
        bg.addEventListener("change", function (e) {
          var t = e.target; if (!t.getAttribute || !t.getAttribute("data-p10-vis")) return;
          var o = {}; o[t.getAttribute("data-p10-conjv")] = t.getAttribute("data-p10-vis");
          self.definirVista({ escolha: o });
          status("Opção visível: " + t.getAttribute("data-p10-vis") + ".");
        });
      }
      return true;
    },
    /* o orçamento de duas opções lado a lado (a base SINAPI do Orçamento do modelo) */
    comparar: function (a, b) {
      var BO = global.BimOpcoes, OU = global.OrcModeloUI, st = this.estado(), alvo = document.querySelector('[data-p10="comparacao"]');
      var base = OU && OU.base ? OU.base() : null;
      if (!base) { if (alvo) alvo.innerHTML = '<p style="font-size:12.5px;color:var(--amarelo,#b45309)">Carregue a base SINAPI em Quantitativos › Orçamento do modelo para comparar o custo das opções.</p>'; return null; }
      var opc = OU.opcoes ? OU.opcoes() : {}, r = BO.comparar(st, a, b, this.deps().avaliarFam, base, opc);
      if (!alvo) return r;
      if (!r.ok) { alvo.innerHTML = '<p style="font-size:12.5px">' + esc(r.motivo) + "</p>"; return r; }
      alvo.innerHTML = '<table class="tbl" data-p10="tab-comparar"><thead><tr><th></th><th>' + esc(r.a.nome) + "</th><th>" + esc(r.b.nome) + "</th></tr></thead><tbody>" +
        '<tr><td>Custo direto</td><td data-p10="total-a">' + moeda(r.a.total) + '</td><td data-p10="total-b">' + moeda(r.b.total) + "</td></tr>" +
        "<tr><td>MO / MAT / EQ</td><td>" + moeda(r.a.mo) + " / " + moeda(r.a.mat) + " / " + moeda(r.a.eq) + "</td><td>" + moeda(r.b.mo) + " / " + moeda(r.b.mat) + " / " + moeda(r.b.eq) + "</td></tr>" +
        '<tr><td>Diferença (B − A)</td><td colspan="2" data-p10="diferenca">' + moeda(r.diferenca) + "</td></tr></tbody></table>" +
        (r.linhas.length ? '<table class="tbl"><thead><tr><th>Código</th><th>Descrição</th><th>Qtd A</th><th>Qtd B</th><th>Dif.</th></tr></thead><tbody>' + r.linhas.map(function (l) { return "<tr><td>" + esc(l.codigo) + "</td><td>" + esc(String(l.descricao).slice(0, 60)) + "</td><td>" + n2(l.qa) + "</td><td>" + n2(l.qb) + "</td><td>" + moeda(l.dif) + "</td></tr>"; }).join("") + "</tbody></table>" : "");
      return r;
    },

    /* ================================================= CONSULTAR */
    selecionarIds: function (ids) {
      var b = B(); if (!b || !ids.length) return false;
      try { var p = b.precisao ? b.precisao() : null; if (p) p.selecionar(ids); } catch (e) {}
      try { if (b._selecionarUid) b._selecionarUid("edit:" + ids[0]); } catch (e2) {}
      return true;
    },
    dialogoSelecionarId: function (texto) {
      var GR = global.BimGerenciar, self = this; if (!GR) return false;
      function ir(t) {
        var r = GR.selecionarPorId(self.estado(), t, self.deps());
        if (!r.ok) { toast(r.motivo, "aviso"); status(r.motivo); return r; }
        self.selecionarIds(r.ids);
        status("Selecionado: " + r.ids.join(", ") + (r.naoAchados.length ? " — não achei: " + r.naoAchados.join(", ") : "") + ".");
        return r;
      }
      if (texto != null) return ir(texto);
      global.UI.modal("Selecionar por ID", '<label style="display:block;font-size:12.5px">ID, Marca ou IfcGUID (vários: separe por vírgula) <input data-p10="id-texto" style="width:100%"></label>', [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Selecionar", classe: "primary", onClick: function () { var t = (document.querySelector('[data-p10="id-texto"]') || {}).value; global.UI.fecharModal(); ir(t); } }
      ]);
      return true;
    },
    dialogoLocalizar: function () {
      var GR = global.BimGerenciar, self = this; if (!GR) return false;
      var ultimo = null;
      function ler() {
        var q = function (k) { return document.querySelector('[data-p10="' + k + '"]'); };
        return { procurar: (q("loc-procurar") || {}).value || "", substituir: (q("loc-substituir") || {}).value, maiusculas: !!(q("loc-mai") || {}).checked, inteira: !!(q("loc-int") || {}).checked,
                 ids: (q("loc-sel") || {}).checked ? self.selecao() : null };
      }
      var h = '<label style="display:block;font-size:12.5px">Localizar <input data-p10="loc-procurar" style="width:100%"></label>' +
        '<label style="display:block;font-size:12.5px">Substituir por <input data-p10="loc-substituir" style="width:100%"></label>' +
        '<label style="font-size:12.5px"><input type="checkbox" data-p10="loc-mai"> diferenciar maiúsculas</label> <label style="font-size:12.5px"><input type="checkbox" data-p10="loc-int"> palavra inteira</label> <label style="font-size:12.5px"><input type="checkbox" data-p10="loc-sel"> só na seleção</label>' +
        '<p><button class="btn sm" data-p10="loc-buscar">Localizar</button></p><div data-p10="loc-achados"></div>';
      var bg = global.UI.modal("Localizar e substituir", h, [
        { texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Substituir tudo", classe: "primary", onClick: function () {
          var r = GR.localizarSubstituir(self.estado(), self.deps(), ler());
          if (!r.op) { toast(r.motivo || "Nada a trocar.", "aviso"); return; }
          global.UI.fecharModal();
          if (self.enviar(r.op)) status("Trocado em " + r.n + " parâmetro(s)" + (r.pulados.length ? " (" + r.pulados.length + " ficou(aram): " + r.pulados[0].motivo + ")" : "") + " — Ctrl+Z desfaz a troca inteira.");
        } }
      ]);
      if (bg) bg.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-p10=loc-buscar]") : null; if (!t) return;
        var o = ler(); delete o.substituir;
        ultimo = GR.localizarSubstituir(self.estado(), self.deps(), o);
        var a = document.querySelector('[data-p10="loc-achados"]'); if (!a) return;
        a.innerHTML = !ultimo.ok ? '<p style="font-size:12.5px">' + esc(ultimo.motivo) + "</p>" :
          '<table class="tbl" data-p10="tab-achados"><thead><tr><th>Peça</th><th>Parâmetro</th><th>Valor</th></tr></thead><tbody>' + ultimo.achados.map(function (x) { return "<tr><td>" + esc(x.id) + "</td><td>" + esc(x.nome) + (x.leitura ? " (calculado)" : "") + "</td><td>" + esc(x.antes) + "</td></tr>"; }).join("") + "</tbody></table>";
      });
      return true;
    },
    dialogoAdvertencias: function () {
      var GR = global.BimGerenciar, self = this; if (!GR) return null;
      var L = GR.advertencias(this.estado(), this.deps());
      var h = !L.length ? '<p style="font-size:12.5px" data-p10="sem-advertencias">Nenhuma advertência no modelo.</p>' :
        '<p style="font-size:12.5px">' + L.length + ' advertência(s).</p><table class="tbl" data-p10="tab-advertencias"><thead><tr><th>Origem</th><th>Advertência</th><th></th></tr></thead><tbody>' +
        L.map(function (a, i) { return '<tr data-p10-adv="' + i + '"><td>' + esc(a.origem) + "</td><td>" + esc(a.texto) + "</td><td>" + (a.ids.length ? '<button class="btn sm ghost" data-p10-selecionar="' + i + '">Selecionar</button>' : "") + "</td></tr>"; }).join("") + "</tbody></table>";
      var bg = global.UI.modal("Revisar advertências", h, [{ texto: "Fechar", classe: "primary", onClick: function () { global.UI.fecharModal(); } }]);
      if (global.UI.modalConsulta) global.UI.modalConsulta();
      if (bg) bg.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-p10-selecionar]") : null; if (!t) return;
        var a = L[+t.getAttribute("data-p10-selecionar")]; if (!a) return;
        global.UI.fecharModal(); self.selecionarIds(a.ids); status("Selecionado: " + a.ids.join(", ") + " — " + a.texto);
      });
      return L;
    },
    dialogoLimpar: function () {
      var GR = global.BimGerenciar, self = this; if (!GR) return null;
      var r = GR.limparNaoUtilizados(this.estado(), this.deps());
      if (!r.itens.length) { status("Nada a limpar: todo tipo do projeto tem instância e todo grupo tem peça."); toast("Nada a limpar.", "info"); return r; }
      var h = '<p style="font-size:12.5px">Sem uso no modelo:</p><ul data-p10="limpar-itens" style="font-size:12.5px">' + r.itens.map(function (i) { return "<li>" + (i.tipo === "grupo" ? "Grupo" : "Tipo (" + esc(i.categoria) + ")") + ": " + esc(i.nome || i.id) + "</li>"; }).join("") + "</ul>";
      global.UI.modal("Limpar não utilizados", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Limpar", classe: "primary", onClick: function () { global.UI.fecharModal(); if (self.enviar(r.op)) status(r.itens.length + " item(ns) sem uso tirado(s) (Ctrl+Z volta)."); } }
      ]);
      return r;
    },
    /* ---------- vista inicial: a aba que abre primeiro nesta obra, neste aparelho */
    _chaveVI: function () { var G = this._G || global.Gestao, GR = global.BimGerenciar; return GR ? GR.chaveVistaInicial(G && G._bimSel) : null; },
    dialogoVistaInicial: function () {
      var G = this._G || global.Gestao, self = this; if (!G || !G._bimVxEst) return false;
      var lista = [{ id: "3d", nome: "{3D}" }].concat(arr(G._bimVxEst().lista).map(function (v) { return { id: v.id, nome: v.nome }; }));
      var atual = null; try { atual = global.localStorage.getItem(this._chaveVI()); } catch (e) {}
      global.UI.modal("Vista inicial", '<label style="font-size:12.5px">Abrir primeiro <select data-p10="vista-inicial">' + lista.map(function (v) { return '<option value="' + esc(v.id) + '"' + (v.id === atual ? " selected" : "") + ">" + esc(v.nome) + "</option>"; }).join("") + "</select></label>", [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Salvar", classe: "primary", onClick: function () {
          var v = (document.querySelector('[data-p10="vista-inicial"]') || {}).value || "3d";
          global.UI.fecharModal();
          try { global.localStorage.setItem(self._chaveVI(), v); } catch (e) {}
          status("Vista inicial desta obra: " + (lista.filter(function (x) { return x.id === v; })[0] || {}).nome + ".");
        } }
      ]);
      return true;
    },
    aplicarVistaInicial: function () {
      var G = this._G || global.Gestao, v = null; if (!G || !G._bimVxAtivar) return false;
      try { v = global.localStorage.getItem(this._chaveVI()); } catch (e) {}
      if (!v || v === "3d" || !G._bimVxAchar || !G._bimVxAchar(v)) return false;
      G._bimVxAtivar(v); return true;
    },

    /* ================================================= GRÁFICOS NO 3D
     * api = { THREE, scene }. aposRebuild(st, mo): por peça do editor, o que o
     * filtro de fase e a opção visível dizem — esconde, meio-tom, translúcido +
     * contorno tracejado. Material trocado por CÓPIA (a malha mesclada
     * espelha a cor e a opacidade sozinha); o original fica em _p10orig. */
    montar3d: function (api) {
      if (!previa() || !api || !api.THREE) return null;
      var THREE = api.THREE, self = this, grp = new THREE.Group(), cache = {}, ult = { st: null, mo: null };
      grp.name = "p10-fases"; api.scene.add(grp);
      function limpar() { grp.children.slice().forEach(function (o) { grp.remove(o); if (o.geometry) o.geometry.dispose(); }); }
      function mat(orig, g) {
        var k = orig.uuid + "|" + (g.meioTom ? "m" : "") + "|" + g.opacidade;
        if (cache[k]) return cache[k];
        var c = orig.clone();
        if (g.meioTom && c.color) c.color.lerp(new THREE.Color(1, 1, 1), 0.55);
        if (g.opacidade < 1) { c.transparent = true; c.opacity = g.opacidade; c.depthWrite = false; }
        return (cache[k] = c);
      }
      var linhaMat = {
        tracejada: new THREE.LineDashedMaterial({ color: 0x404040, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.95 }),
        "traco-ponto": new THREE.LineDashedMaterial({ color: 0x404040, dashSize: 0.3, gapSize: 0.08, transparent: true, opacity: 0.9 })
      };
      function aplicar(st, mo) {
        ult.st = st; ult.mo = mo; limpar();
        if (!mo || !mo.grupo) return { n: 0 };
        var BF = global.BimFases, BO = global.BimOpcoes, v = self.vista();
        var temFase = !!(BF && st && BF.faseado(st)), temOpc = !!(BO && st && st.opcoes && arr(st.opcoes.conjuntos).length);
        var gm = temFase ? BF.graficosModelo(st, self.fase(st), v.filtro, self.deps()) : null;
        var porId = {};
        if (temOpc) ["caixas", "coberturas", "familias", "volumes", "forros"].forEach(function (k) { arr(st[k]).forEach(function (x) { if (x && x.id != null) porId[String(x.id)] = x; }); });
        var n = { ocultas: 0, meioTom: 0, tracejadas: 0 };
        try { if (mo.grupo.parent) mo.grupo.parent.updateMatrixWorld(true); } catch (eU) {}
        mo.grupo.children.forEach(function (m) {
          if (!m.isMesh) return;
          if (m.userData._p10orig) { m.material = m.userData._p10orig; delete m.userData._p10orig; }
          if (m.userData._p10oculta) { m.visible = true; delete m.userData._p10oculta; }   /* só a que ESTE módulo escondeu volta */
          delete m.userData._fase;
          var id = String(m.userData.expressID), g = gm ? gm.porId[id] : null;
          var visOpc = !temOpc || !porId[id] || BO.visivel(porId[id], st, v.escolha);
          if (!visOpc || (g && !g.visivel)) { if (m.visible !== false) { m.visible = false; m.userData._p10oculta = true; } n.ocultas++; return; }
          if (!g || (!g.meioTom && g.opacidade >= 1 && g.linha === "continua")) return;
          m.userData._p10orig = m.material;
          m.material = mat(m.material, g);
          m.userData._fase = g.status;
          if (g.meioTom) n.meioTom++;
          if (linhaMat[g.linha] && m.geometry) {
            var ls = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), linhaMat[g.linha]);
            ls.applyMatrix4(m.matrixWorld); ls.computeLineDistances(); ls.userData.p10 = id; ls.renderOrder = 3;
            grp.add(ls); n.tracejadas++;
          }
        });
        self._ult3d = n;
        return n;
      }
      var ctl = {
        aposRebuild: function (st, mo) { try { return aplicar(st, mo); } catch (e) { return null; } },
        refazer: function () { return ult.mo ? ctl.aposRebuild(ult.st, ult.mo) : null; },
        info: function () { return self._ult3d || null; },
        grupo: grp
      };
      this._3d = ctl;
      return ctl;
    }
  };
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  global.BimP10UI = BimP10UI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimP10UI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

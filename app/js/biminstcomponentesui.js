/* =====================================================================
 * biminstcomponentesui.js (HidComponentesUI) — o painel lateral COMPONENTES (27/10/2026, frente 3).
 *
 * Fiação fina sobre o motor js/biminstcomponentes.js (HidComponentes): busca no topo, filtros (sistema, grupo, material, fabricante,
 * "só com cota de catálogo"), lista agrupada com a miniatura que já existir (img/hid-pecas/…), Favoritos e Recentes (por pessoa,
 * localStorage com try/catch), e a FICHA do item: nome, selos, fabricante e fonte (página), DNs, tabela de PORTAS
 * (entrada/saída, DN, junta, direção) e o botão Inserir, que chama a função que JÁ existe (BimInstUI.armar, colocarFamilia,
 * armarConexaoManual…). Item sem dado suficiente aparece com selo ("sem cota de catálogo", "a conferir") — nunca escondido.
 *
 * O painel mora na gaveta do BIM (#bim-componentes, js/gestao.js _BIM_PAINEIS). Vale a regra de BimPrevia.hidro() (modelador ligado).
 * Abre pela fita (Instalações > Hidrossanitário > Componentes) ou pelo atalho CM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function H() { return global.HidComponentes || null; }
  function UI() { return global.BimInstUI || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }

  var CHAVE_FAV = "orcapro:hid:componentes:fav", CHAVE_REC = "orcapro:hid:componentes:rec", CHAVE_TIPO = "orcapro:hid:componentes:tipo", MAX_REC = 12, MAX_POR_GRUPO = 60;
  function lerObj(chave) { try { var s = global.localStorage ? global.localStorage.getItem(chave) : null; var v = s ? JSON.parse(s) : null; return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
  /* os menus da fita (14/11/2026): o botão → a categoria da lista (HidComponentes.categoriasFita) */
  var MENU_FITA = { tubo: "tubo", conexao: "conexao", aparelho: "aparelho", "acessorio-tubo": "acessorio" };
  var TITULO_MENU = { tubo: "Tubo", conexao: "Conexão", aparelho: "Aparelho sanitário", acessorio: "Acessório de tubo" };
  function ler(chave) { try { var s = global.localStorage ? global.localStorage.getItem(chave) : null; var v = s ? JSON.parse(s) : null; return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function gravar(chave, v) { try { if (global.localStorage) global.localStorage.setItem(chave, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var PAPEL = { montante: "entrada (montante)", jusante: "saída (jusante)", derivacao: "derivação", passagem: "passagem", ponto: "ponto (rosca)", tampa: "tampa", entrada: "entrada", saida: "saída" };
  function papelTxt(p) { return PAPEL[p] || txt(p) || "—"; }
  function direcaoTxt(d) {
    if (!d || d.length !== 3) return "—";
    var eixos = ["X", "Y", "Z"], i, fortes = [];
    for (i = 0; i < 3; i++) if (Math.abs(d[i]) > 0.99) return (d[i] > 0 ? "+" : "−") + eixos[i] + (i === 1 ? (d[i] > 0 ? " (para cima)" : " (para baixo)") : "");
    for (i = 0; i < 3; i++) if (Math.abs(d[i]) > 0.01) fortes.push((d[i] > 0 ? "+" : "−") + eixos[i]);
    return "diagonal " + fortes.join("") + " (" + d.map(function (v) { return String(Math.round(v * 100) / 100).replace(".", ","); }).join("; ") + ")";
  }
  var JUNTA = { soldavel: "soldável", rosca: "rosca", termofusao: "termofusão", junta_elastica: "junta elástica", flange: "flange", indefinida: "a conferir" };

  var Painel = {
    estado: { q: "", filtros: {}, aba: "todos", sel: null, abertos: {}, menu: null },
    _G: null,

    /* ------------------------------------------------ favoritos e recentes (por pessoa; o navegador é da pessoa) */
    favoritos: function () { return ler(CHAVE_FAV); },
    ehFavorito: function (id) { return this.favoritos().indexOf(id) >= 0; },
    alternarFavorito: function (id) {
      var f = this.favoritos(), i = f.indexOf(id);
      if (i >= 0) f.splice(i, 1); else f.push(id);
      gravar(CHAVE_FAV, f); return i < 0;
    },
    recentes: function () { return ler(CHAVE_REC); },
    usar: function (id) { var r = this.recentes().filter(function (x) { return x !== id; }); r.unshift(id); gravar(CHAVE_REC, r.slice(0, MAX_REC)); },

    /* ------------------------------------------------ o TIPO escolhido por família (14/11/2026, print do Rogério: "Inserir sempre põe a Amanco")
       a última escolha fica por família (localStorage, por pessoa); sem escolha = o padrão da tela (HidComponentes: Tigre "-ficha" nas caixas
       de gordura e de inspeção). Tipo que sumiu ou virou legado = volta ao padrão. */
    tipoEscolhido: function (it) {
      if (!it || !it.tipos || !it.tipos.length) return it ? it.tipoId || "" : "";
      var m = lerObj(CHAVE_TIPO)[it.id];
      return m && it.tipos.some(function (t) { return t.id === m; }) ? m : (it.tipoPadrao || it.tipoId);
    },
    escolherTipo: function (id, tipoId) { var m = lerObj(CHAVE_TIPO); m[id] = tipoId; return gravar(CHAVE_TIPO, m); },
    /* o item como a tela mostra: com o tipo escolhido (ficha, portas, fonte, selos e o Inserir) */
    vista: function (id) {
      /* aceita o item já em mãos: item(id) varre o catálogo (e confere a assinatura das fontes) — na lista de 250 linhas isso custava segundos */
      var h = H(), it = id && typeof id === "object" ? id : (h ? h.item(id) : null); if (!it || !it.tipos || !h || !h.itemComTipo) return it;
      var t = this.tipoEscolhido(it);
      return t === it.tipoId ? it : (h.itemComTipo(it.id, t, it) || it);
    },

    /* ------------------------------------------------ abrir / fechar */
    alternar: function (e, G) {
      /* a janela flutuante fecha sozinha (Esc, clique fora, Inserir): o botão alterna pelo estado REAL, não pelo aceso da fita */
      if (this.aberto() && !this.estado.menu) return this.fechar();
      return this.abrir(G);
    },
    abrir: function (G, filtroInicial, ancora) {
      var U = UI();
      this._G = G || (U && U._G) || this._G;
      if (U && U.ativo && !U.ativo()) { toast("Componentes estão na prévia do modelador: abra com ?previa=modelador.", "aviso"); return false; }
      if (filtroInicial) { this.estado.filtros = {}; Object.keys(filtroInicial).forEach(function (k) { Painel.estado.filtros[k] = filtroInicial[k]; }); this.estado.aba = "todos"; }
      if (this.estado.menu) { this.estado.menu = null; this.estado.q = ""; }
      /* 14/11/2026 (o Rogério: "Componentes abre numa outra área do lado — não tinha que abrir do lado"): abre FLUTUANTE, logo abaixo do botão */
      if (!this._flutuar(ancora || this._botao("componentes"))) { if (this._G && this._G._bimAbrirPainel) this._G._bimAbrirPainel("componentes"); }
      this.render();
      /* as famílias do hidro vêm no grupo "hidro" (baixa sob demanda, como o painel Instalações): refaz quando chega */
      var self = this;
      if (!global.HidFamilias && global.Carregar && Carregar.temGrupo && Carregar.temGrupo("hidro")) {
        Carregar.grupo("hidro").then(function () { if (H()) H().esquecer(); self.render(); }, function () {});
      }
      return true;
    },
    fechar: function () {
      var el = typeof document !== "undefined" ? document.getElementById("bim-componentes") : null;
      if (el) el.style.display = "none";
      this._soltarFora();
      return true;
    },
    aberto: function () { var el = typeof document !== "undefined" ? document.getElementById("bim-componentes") : null; return !!el && el.style.display !== "none" && el.offsetWidth > 0; },
    /* o botão da fita (o que está à vista) */
    _botao: function (id) {
      if (typeof document === "undefined") return null;
      var l = document.querySelectorAll('[data-rv-cmd="' + id + '"]'), i;
      for (i = 0; i < l.length; i++) if (l[i].offsetWidth > 0) return l[i];
      return l[0] || null;
    },
    /* a janela FLUTUANTE: o próprio #bim-componentes vai para o body, preso logo abaixo do botão (sobre a vista, não na lateral).
       Fecha com Esc, clique fora e ao inserir. */
    _flutuar: function (ancora) {
      if (typeof document === "undefined") return false;
      var el = document.getElementById("bim-componentes"); if (!el) return false;
      if (el.parentNode !== document.body) document.body.appendChild(el);
      el.setAttribute("data-comp-flutuante", "1"); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", this.estado.menu ? TITULO_MENU[this.estado.menu] : "Componentes");
      var vw = global.innerWidth || 1200, vh = global.innerHeight || 800, larg = Math.min(380, vw - 16);
      var r = ancora && ancora.getBoundingClientRect ? ancora.getBoundingClientRect() : { left: 80, bottom: 120 };
      el.style.cssText = "display:block;position:fixed;z-index:100002;left:" + Math.max(8, Math.min(r.left, vw - larg - 8)) + "px;top:" + Math.round(r.bottom + 2) + "px;width:" + larg + "px;max-height:" + Math.max(240, Math.round(vh - r.bottom - 16)) + "px;overflow:auto;box-sizing:border-box;padding:8px;" +
        "background:var(--rv-painel-bg,var(--card,#fff));color:var(--rv-painel-tx,var(--texto,#1a1a1a));border:1px solid var(--rv-linha-forte,var(--linha,#b4b4b4));border-radius:8px;box-shadow:0 10px 28px var(--rv-sombra,rgba(0,0,0,.22))";
      this._ancora = ancora || null;
      this._prenderFora(el);
      return true;
    },
    _prenderFora: function (el) {
      var self = this; this._soltarFora();
      this._fora = function (ev) {
        if (ev.type === "keydown" || ev.type === "keyup") { if (ev.key === "Escape" || ev.keyCode === 27) self.fechar(); return; }
        if (el.contains(ev.target) || (self._ancora && self._ancora.contains && self._ancora.contains(ev.target))) return;
        /* o botão é repintado pela fita: qualquer botão com o MESMO comando conta como "o botão" (o 2º clique nele fecha pelo instalarFita) */
        var cmdA = self._ancora && self._ancora.getAttribute ? self._ancora.getAttribute("data-rv-cmd") : null;
        if (cmdA && ev.target && ev.target.closest && ev.target.closest('[data-rv-cmd="' + cmdA + '"]')) return;
        self.fechar();
      };
      document.addEventListener("pointerdown", this._fora, true);
      /* o Esc vai na JANELA (fase de captura) e também no keyup: a ferramenta armada (Acessório de tubo…) consome o keydown do Esc antes */
      (global.addEventListener ? global : document).addEventListener("keydown", this._fora, true); (global.addEventListener ? global : document).addEventListener("keyup", this._fora, true);
    },
    _soltarFora: function () {
      if (this._fora && typeof document !== "undefined") { document.removeEventListener("pointerdown", this._fora, true); (global.removeEventListener ? global : document).removeEventListener("keydown", this._fora, true); (global.removeEventListener ? global : document).removeEventListener("keyup", this._fora, true); }
      this._fora = null;
    },
    /* o MENU de um botão da fita (Tubo, Conexão, Aparelho sanitário, Acessório de tubo): a lista daquela categoria com miniatura, o tipo
       escolhível e a busca; o clique na linha já arma a colocação e o menu fecha */
    abrirMenu: function (cat, ancora, G) {
      var U = UI(); this._G = G || (U && U._G) || this._G;
      if (!TITULO_MENU[cat]) return false;
      if (this.estado.menu !== cat) this.estado.q = "";
      this.estado.menu = cat;
      if (!this._flutuar(ancora || this._botao(cat === "acessorio" ? "acessorio-tubo" : cat))) return false;
      this.render();
      var b = document.querySelector('#bim-componentes [data-comp="busca"]'); try { if (b) b.focus(); } catch (e) {}
      var self = this;   /* as famílias do hidro chegam sob demanda: refaz quando chegam */
      if (!global.HidFamilias && global.Carregar && Carregar.temGrupo && Carregar.temGrupo("hidro")) Carregar.grupo("hidro").then(function () { if (H()) H().esquecer(); if (self.estado.menu === cat) self.render(); }, function () {});
      return true;
    },
    /* liga os 4 botões da fita: o comando de sempre roda (Tubo arma o tubo…) e o menu abre logo abaixo do botão; 2º clique fecha */
    instalarFita: function (doc) {
      var self = this; doc = doc || (typeof document !== "undefined" ? document : null);
      if (!doc || this._fitaLigada) return false;
      this._fitaLigada = true;
      doc.addEventListener("click", function (ev) {
        var bt = ev.target && ev.target.closest ? ev.target.closest("[data-rv-cmd]") : null; if (!bt) return;
        var cat = MENU_FITA[bt.getAttribute("data-rv-cmd")]; if (!cat || bt.disabled) return;
        var U = UI(); if (!U || (U.ativo && !U.ativo())) return;
        var jaAberto = self.estado.menu === cat && self.aberto();
        var cmdId = bt.getAttribute("data-rv-cmd");
        /* o comando repinta a fita (o botão clicado é trocado por outro): a âncora é o botão que está à vista DEPOIS */
        setTimeout(function () { if (jaAberto) self.fechar(); else self.abrirMenu(cat, self._botao(cmdId) || bt); }, 0);
      }, true);
      return true;
    },

    /* ------------------------------------------------ o que o botão Inserir faz: chama a função que já existe */
    executar: function (it, manterAberta) {
      var a = it && it.acao, U = UI();
      if (!a) return false;
      if (a.tipo === "abrirTemplate") return this.abrirTemplate(a.id);
      if (!U) { toast("O visualizador 3D ainda não abriu.", "aviso"); return false; }
      var ok = false;
      if (a.tipo === "armarTubo") {
        if (a.disponivel === false) { toast("Este tubo ainda não é material do OrçaPRO: " + (it.selos[0] || ""), "aviso"); return false; }
        ok = U.armar("tubo", { sistema: a.sistema });
        if (ok && U.cfg) { if (U.cfg.material !== a.material) U.mudarCfg("i:material", a.material); if (a.pn) U.mudarCfg("i:pn", a.pn); }
      } else if (a.tipo === "armarPeca") ok = U.armar("peca", { sistema: a.sistema, peca: a.peca });
      else if (a.tipo === "armarAcessorio") { ok = U.armar("acessorio", { famId: a.famId, tipoId: a.tipoId }); if (ok && U._p12) { U._p12.acFam = a.famId; U._p12.acTipo = a.tipoId; } }
      else if (a.tipo === "colocarFamilia") ok = U.colocarFamilia(a.famId, a.tipoId);
      else if (a.tipo === "conexaoManual") ok = U.armarConexaoManual(a.conexao, a.material);
      if (ok !== false) { this.usar(it.id); this._armadoId = it.id; if (manterAberta) return true; var elF = typeof document !== "undefined" ? document.getElementById("bim-componentes") : null; if (elF && elF.getAttribute("data-comp-flutuante")) this.fechar(); }
      return ok !== false;
    },
    /* o duplo clique insere UMA vez (revisão 08/11/2026): o 2º clique (ev.detail ≥ 2) e o dblclick do navegador chegam os dois — o segundo, para o
       mesmo item dentro da janela do duplo clique, é ignorado (nem insere de novo, nem grava duas vezes nos recentes). _semTrava = controle negativo */
    _inserirDuplo: function (id, manterAberta) {
      var agora = Date.now(), u = this._ultIns;
      if (!this._semTrava && u && u.id === id && agora - u.t < 600) return false;   // ui: janela do duplo clique (ms)
      this._ultIns = { id: id, t: agora };
      var it = this.vista(id), ok = !!(it && it.acao && it.acao.disponivel !== false && this.executar(it, manterAberta));
      this._ultIns.t = Date.now();   /* a janela conta do FIM da inserção (armar a colocação pode passar da janela com a máquina ocupada) */
      return ok;
    },
    /* revisão 14/11: o botão da fita já armou a ferramenta dele (Tubo, Aparelho…); a linha do menu SOLTA essa antes de armar a escolhida —
       nunca duas armadas, nem botão aceso da ferramenta que saiu */
    _desarmar: function () {
      var U = UI(), b = global.BIM, R = global.BimRibbon;
      try { if (b && b.editarArmar) b.editarArmar(null); } catch (e) {}
      if (U) U.cfg = null;
      try { if (R && R.setAtivo) ["tubo", "aparelho", "eletroduto", "eletrocalha", "acessorio-tubo"].forEach(function (k) { if (R.comando && R.comando(k)) R.setAtivo(k, false); }); if (global.BimShell && BimShell.pintarFita) BimShell.pintarFita(); } catch (e2) {}
    },
    abrirTemplate: function (id) {
      var U = UI(), G = (U && U._G) || this._G;
      if (G && G._optplRA) { G._optplRA(); return true; }
      toast("Os templates RA abrem pela fita (Arquivo > Templates).", "aviso");
      return false;
    },

    /* ------------------------------------------------ tela */
    _lista: function () {
      var h = H(); if (!h) return [];
      var e = this.estado;
      if (e.menu && h.daCategoria) return h.daCategoria(e.menu, e.q);
      var l = h.buscar(e.q, e.filtros);
      if (e.aba === "favoritos") { var f = this.favoritos(); l = l.filter(function (it) { return f.indexOf(it.id) >= 0; }); }
      else if (e.aba === "recentes") { var r = this.recentes(); l = l.filter(function (it) { return r.indexOf(it.id) >= 0; }).sort(function (a, b) { return r.indexOf(a.id) - r.indexOf(b.id); }); }
      return l;
    },
    _selo: function (t) {
      var aviso = /^(sem|a conferir|indispon)/.test(t);
      return '<span style="display:inline-block;font-size:10.5px;padding:1px 6px;border-radius:9px;margin:0 3px 3px 0;border:1px solid ' + (aviso ? "var(--amarelo,#b45309)" : "var(--linha,#c9d6e4)") + ";background:" + (aviso ? "var(--tinta-aviso,rgba(170,98,0,.13))" : "var(--surface-2,#eef2f7)") + ';color:var(--texto,#111d2b)">' + esc(t) + "</span>";
    },
    /* o seletor de TIPO (família com mais de um tipo não legado); o rótulo é o nome do tipo (fabricante + código + "medidas da ficha") */
    _htmlTipo: function (it, onde) {
      if (!it || !it.tipos || it.tipos.length < 2) return "";
      var at = it.tipoId;
      /* UM CLIQUE (14/11/2026, marca um-clique-peca-1415): na linha do menu o seletor era um bloco de largura total sob o nome — metade da linha
         abria a lista de tipos em vez de pegar a peça. Agora é compacto, à direita (a linha inteira pega a peça); escolher o tipo também pega */
      var css = onde === "linha" ? "flex:none;width:auto;max-width:42%;min-width:0;font-size:11px;margin:0" : "display:block;width:100%;min-width:0;box-sizing:border-box;font-size:12px;margin:6px 0 0";
      return '<select data-comp="tipo" data-cid="' + esc(it.id) + '" aria-label="Tipo de ' + esc(it.nome) + '" title="Tipo que a peça coloca" style="' + css + '">' +
        it.tipos.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === at ? " selected" : "") + ">" + esc(t.nome) + "</option>"; }).join("") + "</select>";
    },
    _htmlFicha: function (it) {
      var self = this, h = '<div data-comp="ficha" style="border:1px solid var(--linha,#c9d6e4);border-radius:10px;padding:10px;margin:8px 0;background:var(--surface,#fff)">';
      h += '<div style="display:flex;gap:8px;align-items:flex-start">';
      if (it.icone) h += '<img src="' + esc(it.icone) + '" alt="" width="56" height="56" style="object-fit:contain;border-radius:6px;background:var(--surface-2,#eef2f7)" onerror="this.style.display=\'none\'">';
      h += '<div style="flex:1;min-width:0"><b style="font-size:13.5px">' + esc(it.nome) + '</b><div class="muted" style="font-size:11.5px">' + esc(it.grupo) + (it.origem && it.origem !== "RA" ? " · " + esc(it.origem) : "") + "</div></div>" +
           '<button class="btn sm icone" data-comp="fav" data-cid="' + esc(it.id) + '" title="' + (this.ehFavorito(it.id) ? "Tirar dos favoritos" : "Guardar nos favoritos") + '" aria-label="Favorito">' + (this.ehFavorito(it.id) ? "★" : "☆") + "</button></div>";
      h += this._htmlTipo(it, "ficha");
      if (it.selos.length) h += '<div style="margin-top:6px">' + it.selos.map(function (t) { return self._selo(t); }).join("") + "</div>";
      var lin = [];
      if (it.sistemas.length) { var B = global.BimInst; lin.push(["Sistema", it.sistemas.map(function (s) { return B && B.SISTEMAS[s] ? B.SISTEMAS[s].nome : s; }).join(", ")]); }
      if (it.materialNome) lin.push(["Material", it.materialNome]);
      if (it.fabricante) lin.push(["Fabricante", it.fabricante]);
      lin.push(["Fonte", it.fonte || "— (sem fonte registrada)"]);
      if (it.dns.length) lin.push(["DNs", it.dns.join(", ")]);
      if (it.descricao) lin.push(["Obs.", it.descricao]);
      h += '<table style="font-size:12px;margin:6px 0;border-collapse:collapse;width:100%">' + lin.map(function (l) { return '<tr><td class="muted" style="padding:1px 8px 1px 0;white-space:nowrap;vertical-align:top">' + esc(l[0]) + '</td><td style="padding:1px 0;word-break:break-word">' + esc(l[1]) + "</td></tr>"; }).join("") + "</table>";
      if (it.portas.length) {
        h += '<b style="font-size:12px">Portas</b><table class="tbl" data-comp="portas" style="font-size:11.5px;margin:3px 0 6px"><thead><tr><th>Porta</th><th>Papel</th><th>DN</th><th>Junta</th><th>Direção</th></tr></thead><tbody>' +
          it.portas.map(function (p) {
            var dn = p.dn != null && p.dn !== "" ? String(p.dn) : (p.rosca ? p.rosca + '"' : "—");
            return "<tr><td>" + esc(p.id) + (p.opcional ? " (opcional)" : "") + "</td><td>" + esc(papelTxt(p.papel)) + "</td><td>" + esc(dn) + "</td><td>" + esc(JUNTA[p.junta] || p.junta || "—") + "</td><td>" + esc(direcaoTxt(p.dir)) + "</td></tr>";
          }).join("") + "</tbody></table>";
      } else h += '<p class="muted" style="font-size:11.5px;margin:4px 0">Sem portas declaradas para este item.</p>';
      var rot = it.acao && it.acao.tipo === "abrirTemplate" ? "Abrir" : (it.acao && it.acao.tipo === "conexaoManual" ? "Inserir (clicar num nó)" : "Inserir");
      var bloqueado = it.acao && it.acao.disponivel === false;
      h += '<div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn sm primary" data-comp="inserir" data-cid="' + esc(it.id) + '"' + (bloqueado ? ' disabled title="' + esc(it.selos[0] || "") + '"' : "") + ">" + rot + "</button></div></div>";
      return h;
    },
    _htmlLinha: function (it, sel) {
      /* só o selo de AVISO aparece na linha (o neutro, como "DN: o dimensionamento define", fica na ficha) */
      var avisos = it.selos.filter(function (t) { return /^(sem|a conferir|indispon)/.test(t); });
      return '<div class="comp-item" data-comp="item" data-cid="' + esc(it.id) + '" role="button" tabindex="0" style="display:flex;gap:7px;align-items:center;padding:4px 6px;border-radius:7px;cursor:pointer;border:1px solid ' + (sel ? "var(--aco,#0d6ebd)" : "transparent") + ";background:" + (sel ? "var(--tinta-aco,rgba(13,110,189,.10))" : "transparent") + '">' +
        (it.icone ? '<img src="' + esc(it.icone) + '" alt="" width="26" height="26" loading="lazy" style="object-fit:contain;flex:none" onerror="this.style.visibility=\'hidden\'">' : '<span style="width:26px;flex:none"></span>') +
        '<span style="flex:1;min-width:0;font-size:12.5px;line-height:1.25">' + esc(it.nome) + "</span>" + (this.estado.menu ? this._htmlTipo(it, "linha") : "") +
        (avisos.length ? '<span title="' + esc(avisos.join(" · ")) + '" style="flex:none;color:var(--amarelo,#b45309);font-size:11px">' + (avisos[0].indexOf("indispon") === 0 ? "indisp." : (/sem cota/.test(avisos.join()) ? "sem cota" : "a conferir")) + "</span>" : "") +
        (this.ehFavorito(it.id) ? '<span style="flex:none;color:var(--aco,#0d6ebd)" aria-label="favorito">★</span>' : "") + "</div>";
    },
    render: function () {
      var corpo = typeof document !== "undefined" ? document.getElementById("bim-componentes-corpo") : null; if (!corpo) return false;
      var h = H(), self = this, e = this.estado;
      if (!h) { corpo.innerHTML = '<p class="muted">O catálogo de componentes ainda não carregou.</p>'; return false; }
      var fd = h.filtrosDisponiveis(), lista = this._lista().map(function (it) { return it.tipos ? self.vista(it) || it : it; }), sel = e.sel && !e.menu ? this.vista(e.sel) : null, html = "";
      function opt(l, v, rot) { return '<option value="' + esc(l.id != null ? l.id : l) + '"' + ((l.id != null ? l.id : l) === v ? " selected" : "") + ">" + esc(l.nome != null ? l.nome : l) + "</option>"; }
      if (e.menu) {
        html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><b style="flex:1;font-size:13px">' + esc(TITULO_MENU[e.menu]) + '</b><button class="btn sm icone" data-comp="fechar" aria-label="Fechar" title="Fechar (Esc)">✕</button></div>' +
          '<input type="search" data-comp="busca" placeholder="Buscar em ' + esc(TITULO_MENU[e.menu].toLowerCase()) + '…" value="' + esc(e.q) + '" aria-label="Buscar ' + esc(TITULO_MENU[e.menu]) + '" style="width:100%;box-sizing:border-box;margin-bottom:6px">';
        if (!lista.length) html += '<p class="muted" style="font-size:12.5px">Nada encontrado.</p>';
        var gM = null;
        lista.forEach(function (it) {
          if (it.grupo !== gM) { gM = it.grupo; html += '<div style="font-weight:700;font-size:12px;margin:8px 0 2px;color:var(--texto-fraco,#516375)">' + esc(gM) + "</div>"; }
          html += self._htmlLinha(it, false);
        });
        html += '<p class="muted" style="font-size:11px;margin-top:8px">Clique = colocar no modelo. Catálogo completo: Componentes.</p>';
        var tinhaM = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-comp") === "busca", posM = tinhaM ? document.activeElement.selectionStart : 0;
        corpo.innerHTML = html;
        if (tinhaM) { var bM = corpo.querySelector('[data-comp="busca"]'); if (bM) { bM.focus(); try { bM.setSelectionRange(posM, posM); } catch (eM) {} } }
        this._ligar(corpo);
        return true;
      }
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><b style="flex:1;font-size:13px">Componentes</b><button class="btn sm icone" data-comp="fechar" aria-label="Fechar" title="Fechar (Esc)">✕</button></div>';
      html += '<input type="search" data-comp="busca" placeholder="Buscar: joelho azul, caixa sifonada, registro de pressão, boia…" value="' + esc(e.q) + '" aria-label="Buscar componentes" style="width:100%;box-sizing:border-box;margin-bottom:6px">';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px">' +
        '<select data-comp="f-grupo" style="width:100%;min-width:0" aria-label="Grupo"><option value="">Todos os grupos</option>' + h.GRUPOS.map(function (g) { return opt(g, e.filtros.grupo); }).join("") + "</select>" +
        '<select data-comp="f-sistema" style="width:100%;min-width:0" aria-label="Sistema"><option value="">Todos os sistemas</option>' + fd.sistemas.map(function (s) { return opt(s, e.filtros.sistema); }).join("") + "</select>" +
        '<select data-comp="f-material" style="width:100%;min-width:0" aria-label="Material"><option value="">Todos os materiais</option>' + fd.materiais.map(function (m) { return opt(m, e.filtros.material); }).join("") + "</select>" +
        '<select data-comp="f-fabricante" style="width:100%;min-width:0" aria-label="Fabricante"><option value="">Todos os fabricantes</option>' + fd.fabricantes.map(function (f) { return opt(f, e.filtros.fabricante); }).join("") + "</select></div>";
      html += '<label style="font-size:12px;display:flex;gap:5px;align-items:center;margin-bottom:6px"><input type="checkbox" data-comp="f-cota"' + (e.filtros.soComCota ? " checked" : "") + '> Só com cota de catálogo</label>';
      html += '<div role="tablist" style="display:flex;gap:4px;margin-bottom:6px">' + [["todos", "Todos"], ["favoritos", "Favoritos"], ["recentes", "Recentes"]].map(function (t) {
        return '<button class="btn sm' + (e.aba === t[0] ? " primary" : "") + '" role="tab" aria-selected="' + (e.aba === t[0]) + '" data-comp="aba" data-caba="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
      /* 07/11/2026 (print do Rogério na 1.2.262: "NÃO ESTOU CONSEGUINDO USAR OS MODELOS DOS COMPONENTES"): a ficha com o Inserir ia para o TOPO da
         lista; quem rolava até "Louças e metais" e clicava na bacia não via nada acontecer. Agora a ficha abre logo ABAIXO da linha clicada (e rola para
         a vista); só vai para o topo quando a linha não está desenhada (grupo recolhido). _fichaNoTopo = o desenho de antes (controle negativo da e2e). */
      var fichaJunto = !!sel && !this._fichaNoTopo, fichaPosta = false;
      if (sel && !fichaJunto) { html += this._htmlFicha(sel); fichaPosta = true; }
      if (!lista.length) html += '<p class="muted" style="font-size:12.5px">' + (e.aba === "favoritos" ? "Nenhum favorito ainda: abra uma ficha e toque na estrela." : (e.aba === "recentes" ? "Nada inserido ainda." : "Nada encontrado para essa busca e esses filtros.")) + "</p>";
      else {
        var g0 = null, cont = 0, n = 0;
        lista.forEach(function (it) {
          if (it.grupo !== g0) { g0 = it.grupo; cont = 0; n = lista.filter(function (x) { return x.grupo === g0; }).length; html += '<div style="font-weight:700;font-size:12px;margin:8px 0 2px;color:var(--texto-fraco,#516375)">' + esc(g0) + " (" + n + ")</div>"; }
          cont++;
          if (cont <= MAX_POR_GRUPO || e.abertos[g0]) { html += self._htmlLinha(it, it.id === e.sel); if (fichaJunto && it.id === e.sel) { html += self._htmlFicha(sel); fichaPosta = true; } }
          else if (cont === MAX_POR_GRUPO + 1) html += '<button class="btn sm" data-comp="mais" data-cgrupo="' + esc(g0) + '">Mostrar os ' + (n - MAX_POR_GRUPO) + " restantes de " + esc(g0) + "</button>";
        });
      }
      if (sel && !fichaPosta) { var fh = this._htmlFicha(sel); html = html.replace('<div role="tablist"', function (m) { return fh + m; }); }
      html += '<p class="muted" style="font-size:11px;margin-top:10px">' + h.todos().length + " componentes. Conexão: escolha aqui, clique no nó da rede e ela fica gravada ali (Propriedades do nó: Voltar ao automático).</p>";
      /* mantém o foco e o cursor da busca ao redesenhar */
      var tinha = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-comp") === "busca", pos = tinha ? document.activeElement.selectionStart : 0;
      corpo.innerHTML = html;
      if (tinha) { var b = corpo.querySelector('[data-comp="busca"]'); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch (eS) {} } }
      this._ligar(corpo);
      if (sel && this._rolarFicha) this._rolarAgora();
      return true;
    },
    _rolarAgora: function () {
      this._rolarFicha = false; if (this._fichaNoTopo) return;
      var corpo = typeof document !== "undefined" ? document.getElementById("bim-componentes-corpo") : null, fc = corpo ? corpo.querySelector('[data-comp="ficha"]') : null;
      if (fc && fc.scrollIntoView) try { fc.scrollIntoView({ block: "nearest" }); var bI = fc.querySelector('[data-comp="inserir"]'); if (bI) bI.scrollIntoView({ block: "nearest" }); } catch (eR) {}
    },
    _ligar: function (corpo) {
      var self = this, e = this.estado, t = null;
      corpo.oninput = function (ev) {
        var el = ev.target, c = el.getAttribute && el.getAttribute("data-comp");
        if (c === "busca") { e.q = el.value; clearTimeout(t); t = setTimeout(function () { self.render(); }, 160); }
      };
      corpo.onchange = function (ev) {
        var el = ev.target, c = el.getAttribute && el.getAttribute("data-comp");
        if (c === "f-grupo") e.filtros.grupo = el.value || undefined;
        else if (c === "f-sistema") e.filtros.sistema = el.value || undefined;
        else if (c === "f-material") e.filtros.material = el.value || undefined;
        else if (c === "f-fabricante") e.filtros.fabricante = el.value || undefined;
        else if (c === "f-cota") e.filtros.soComCota = !!el.checked;
        else if (c === "tipo") {
          var cidT = el.getAttribute("data-cid"); self.escolherTipo(cidT, el.value);
          var itT = (e.menu || self._armadoId === cidT) ? self.vista(cidT) : null;
          if (itT && itT.acao && itT.acao.disponivel !== false) { if (e.menu) { self._desarmar(); self.executar(itT); return; } self.executar(itT, true); }
        }
        else return;
        self.render();
      };
      corpo.onclick = function (ev) {
        var bt = ev.target.closest ? ev.target.closest("[data-comp]") : null; if (!bt) return;
        var c = bt.getAttribute("data-comp"), id = bt.getAttribute("data-cid");
        if (c === "tipo") return;   /* o seletor de tipo (na linha do menu) não insere */
        if (c === "fechar") { self.fechar(); return; }
        if (c === "item" && e.menu) { var itM = self.vista(id); if (itM && itM.acao && itM.acao.disponivel !== false) { self._desarmar(); self.executar(itM); } else if (itM) toast(itM.selos[0] || "Indisponível.", "aviso"); return; }
        if (c === "item") {
          /* o 2º clique do duplo clique cai na linha JÁ redesenhada (o 1º abriu a ficha): o dblclick do navegador se perde — ev.detail ≥ 2 = Inserir direto */
          var agora = Date.now(), duplo = (ev.detail >= 2 || (self._ultClique && self._ultClique.id === id && agora - self._ultClique.t < 450)) && e.sel === id;   // ui: janela do duplo clique (ms)
          self._ultClique = { id: id, t: agora };
          if (duplo) { self._ultClique = null; if (self._inserirDuplo(id)) self.render(); return; }
          /* a ficha abre na hora; a rolagem até ela espera a janela do duplo clique (senão o 2º clique cai em outra linha) */
          e.sel = id;
          /* UM CLIQUE: a peça já vai para o cursor (antes o 1º clique só abria a ficha e era preciso Inserir ou o duplo clique). A janela fica
             aberta com a ficha (trocar o tipo nela arma o tipo novo); a trava do duplo clique impede inserir duas vezes */
          var itU = self.vista(id); if (itU && itU.acao && itU.acao.disponivel !== false && itU.acao.tipo !== "abrirTemplate") self._inserirDuplo(id, true);
          self.render();
          setTimeout(function () { if (e.sel === id) { self._rolarFicha = true; self._rolarAgora(); } }, 460);
        }
        else if (c === "aba") { e.aba = bt.getAttribute("data-caba"); self.render(); }
        else if (c === "fav") { self.alternarFavorito(id); self.render(); }
        else if (c === "mais") { e.abertos[bt.getAttribute("data-cgrupo")] = true; self.render(); }
        else if (c === "inserir") { var it = self.vista(id); if (it && self.executar(it) && self.aberto()) self.render(); }
      };
      /* duplo clique na linha = Inserir direto (o mesmo botão da ficha) */
      corpo.ondblclick = function (ev) {
        var bt = ev.target.closest ? ev.target.closest('[data-comp="item"]') : null; if (!bt || e.menu || (ev.target.closest && ev.target.closest('[data-comp="tipo"]'))) return;
        if (self._inserirDuplo(bt.getAttribute("data-cid"))) self.render();
      };
      corpo.onkeydown = function (ev) {
        if (e.menu && ev.key === "Enter" && ev.target.getAttribute && ev.target.getAttribute("data-comp") === "item") { ev.preventDefault(); var itK = self.vista(ev.target.getAttribute("data-cid")); if (itK && itK.acao) { self._desarmar(); self.executar(itK); } return; }
        if ((ev.key === "Enter" || ev.key === " ") && ev.target.getAttribute && ev.target.getAttribute("data-comp") === "item") { ev.preventDefault(); e.sel = ev.target.getAttribute("data-cid"); self._rolarFicha = true; self.render(); }
      };
    }
  };

  global.HidComponentesUI = Painel;
  try { if (typeof document !== "undefined" && document.addEventListener) Painel.instalarFita(document); } catch (eF) {}
  if (typeof module !== "undefined" && module.exports) module.exports = Painel;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

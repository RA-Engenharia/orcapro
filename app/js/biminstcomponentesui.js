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

  var CHAVE_FAV = "orcapro:hid:componentes:fav", CHAVE_REC = "orcapro:hid:componentes:rec", MAX_REC = 12, MAX_POR_GRUPO = 60;
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
    estado: { q: "", filtros: {}, aba: "todos", sel: null, abertos: {} },
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

    /* ------------------------------------------------ abrir / fechar */
    alternar: function (e, G) {
      if (e && e.ligado === false) return this.fechar();
      return this.abrir(G);
    },
    abrir: function (G, filtroInicial) {
      var U = UI();
      this._G = G || (U && U._G) || this._G;
      if (U && U.ativo && !U.ativo()) { toast("Componentes estão na prévia do modelador: abra com ?previa=modelador.", "aviso"); return false; }
      if (filtroInicial) { this.estado.filtros = {}; Object.keys(filtroInicial).forEach(function (k) { Painel.estado.filtros[k] = filtroInicial[k]; }); this.estado.aba = "todos"; }
      if (this._G && this._G._bimAbrirPainel) this._G._bimAbrirPainel("componentes");
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
      return true;
    },

    /* ------------------------------------------------ o que o botão Inserir faz: chama a função que já existe */
    executar: function (it) {
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
      if (ok !== false) this.usar(it.id);
      return ok !== false;
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
      var e = this.estado, l = h.buscar(e.q, e.filtros);
      if (e.aba === "favoritos") { var f = this.favoritos(); l = l.filter(function (it) { return f.indexOf(it.id) >= 0; }); }
      else if (e.aba === "recentes") { var r = this.recentes(); l = l.filter(function (it) { return r.indexOf(it.id) >= 0; }).sort(function (a, b) { return r.indexOf(a.id) - r.indexOf(b.id); }); }
      return l;
    },
    _selo: function (t) {
      var aviso = /^(sem|a conferir|indispon)/.test(t);
      return '<span style="display:inline-block;font-size:10.5px;padding:1px 6px;border-radius:9px;margin:0 3px 3px 0;border:1px solid ' + (aviso ? "var(--amarelo,#b45309)" : "var(--linha,#c9d6e4)") + ";background:" + (aviso ? "var(--tinta-aviso,rgba(170,98,0,.13))" : "var(--surface-2,#eef2f7)") + ';color:var(--texto,#111d2b)">' + esc(t) + "</span>";
    },
    _htmlFicha: function (it) {
      var self = this, h = '<div data-comp="ficha" style="border:1px solid var(--linha,#c9d6e4);border-radius:10px;padding:10px;margin:8px 0;background:var(--surface,#fff)">';
      h += '<div style="display:flex;gap:8px;align-items:flex-start">';
      if (it.icone) h += '<img src="' + esc(it.icone) + '" alt="" width="56" height="56" style="object-fit:contain;border-radius:6px;background:var(--surface-2,#eef2f7)" onerror="this.style.display=\'none\'">';
      h += '<div style="flex:1;min-width:0"><b style="font-size:13.5px">' + esc(it.nome) + '</b><div class="muted" style="font-size:11.5px">' + esc(it.grupo) + (it.origem && it.origem !== "RA" ? " · " + esc(it.origem) : "") + "</div></div>" +
           '<button class="btn sm icone" data-comp="fav" data-cid="' + esc(it.id) + '" title="' + (this.ehFavorito(it.id) ? "Tirar dos favoritos" : "Guardar nos favoritos") + '" aria-label="Favorito">' + (this.ehFavorito(it.id) ? "★" : "☆") + "</button></div>";
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
      return '<div class="comp-item" data-comp="item" data-cid="' + esc(it.id) + '" role="button" tabindex="0" style="display:flex;gap:7px;align-items:center;padding:4px 6px;border-radius:7px;cursor:pointer;border:1px solid ' + (sel ? "var(--aco,#0d6ebd)" : "transparent") + ";background:" + (sel ? "var(--tinta-aco,rgba(13,110,189,.10))" : "transparent") + '">' +
        (it.icone ? '<img src="' + esc(it.icone) + '" alt="" width="26" height="26" loading="lazy" style="object-fit:contain;flex:none" onerror="this.style.visibility=\'hidden\'">' : '<span style="width:26px;flex:none"></span>') +
        '<span style="flex:1;min-width:0;font-size:12.5px;line-height:1.25">' + esc(it.nome) + "</span>" +
        (it.selos.length ? '<span title="' + esc(it.selos.join(" · ")) + '" style="flex:none;color:var(--amarelo,#b45309);font-size:11px">' + (it.selos[0].indexOf("indispon") === 0 ? "indisp." : (/sem cota/.test(it.selos.join()) ? "sem cota" : "a conferir")) + "</span>" : "") +
        (this.ehFavorito(it.id) ? '<span style="flex:none;color:var(--aco,#0d6ebd)" aria-label="favorito">★</span>' : "") + "</div>";
    },
    render: function () {
      var corpo = typeof document !== "undefined" ? document.getElementById("bim-componentes-corpo") : null; if (!corpo) return false;
      var h = H(), self = this, e = this.estado;
      if (!h) { corpo.innerHTML = '<p class="muted">O catálogo de componentes ainda não carregou.</p>'; return false; }
      var fd = h.filtrosDisponiveis(), lista = this._lista(), sel = e.sel ? h.item(e.sel) : null, html = "";
      function opt(l, v, rot) { return '<option value="' + esc(l.id != null ? l.id : l) + '"' + ((l.id != null ? l.id : l) === v ? " selected" : "") + ">" + esc(l.nome != null ? l.nome : l) + "</option>"; }
      html += '<input type="search" data-comp="busca" placeholder="Buscar: joelho azul, caixa sifonada, registro de pressão, boia…" value="' + esc(e.q) + '" aria-label="Buscar componentes" style="width:100%;box-sizing:border-box;margin-bottom:6px">';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px">' +
        '<select data-comp="f-grupo" style="width:100%;min-width:0" aria-label="Grupo"><option value="">Todos os grupos</option>' + h.GRUPOS.map(function (g) { return opt(g, e.filtros.grupo); }).join("") + "</select>" +
        '<select data-comp="f-sistema" style="width:100%;min-width:0" aria-label="Sistema"><option value="">Todos os sistemas</option>' + fd.sistemas.map(function (s) { return opt(s, e.filtros.sistema); }).join("") + "</select>" +
        '<select data-comp="f-material" style="width:100%;min-width:0" aria-label="Material"><option value="">Todos os materiais</option>' + fd.materiais.map(function (m) { return opt(m, e.filtros.material); }).join("") + "</select>" +
        '<select data-comp="f-fabricante" style="width:100%;min-width:0" aria-label="Fabricante"><option value="">Todos os fabricantes</option>' + fd.fabricantes.map(function (f) { return opt(f, e.filtros.fabricante); }).join("") + "</select></div>";
      html += '<label style="font-size:12px;display:flex;gap:5px;align-items:center;margin-bottom:6px"><input type="checkbox" data-comp="f-cota"' + (e.filtros.soComCota ? " checked" : "") + '> Só com cota de catálogo</label>';
      html += '<div role="tablist" style="display:flex;gap:4px;margin-bottom:6px">' + [["todos", "Todos"], ["favoritos", "Favoritos"], ["recentes", "Recentes"]].map(function (t) {
        return '<button class="btn sm' + (e.aba === t[0] ? " primary" : "") + '" role="tab" aria-selected="' + (e.aba === t[0]) + '" data-comp="aba" data-caba="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
      if (sel) html += this._htmlFicha(sel);
      if (!lista.length) html += '<p class="muted" style="font-size:12.5px">' + (e.aba === "favoritos" ? "Nenhum favorito ainda: abra uma ficha e toque na estrela." : (e.aba === "recentes" ? "Nada inserido ainda." : "Nada encontrado para essa busca e esses filtros.")) + "</p>";
      else {
        var g0 = null, cont = 0, n = 0;
        lista.forEach(function (it) {
          if (it.grupo !== g0) { g0 = it.grupo; cont = 0; n = lista.filter(function (x) { return x.grupo === g0; }).length; html += '<div style="font-weight:700;font-size:12px;margin:8px 0 2px;color:var(--texto-fraco,#516375)">' + esc(g0) + " (" + n + ")</div>"; }
          cont++;
          if (cont <= MAX_POR_GRUPO || e.abertos[g0]) html += self._htmlLinha(it, it.id === e.sel);
          else if (cont === MAX_POR_GRUPO + 1) html += '<button class="btn sm" data-comp="mais" data-cgrupo="' + esc(g0) + '">Mostrar os ' + (n - MAX_POR_GRUPO) + " restantes de " + esc(g0) + "</button>";
        });
      }
      html += '<p class="muted" style="font-size:11px;margin-top:10px">' + h.todos().length + " componentes. Conexão: escolha aqui, clique no nó da rede e ela fica gravada ali (Propriedades do nó: Voltar ao automático).</p>";
      /* mantém o foco e o cursor da busca ao redesenhar */
      var tinha = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-comp") === "busca", pos = tinha ? document.activeElement.selectionStart : 0;
      corpo.innerHTML = html;
      if (tinha) { var b = corpo.querySelector('[data-comp="busca"]'); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch (eS) {} } }
      this._ligar(corpo);
      return true;
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
        else return;
        self.render();
      };
      corpo.onclick = function (ev) {
        var bt = ev.target.closest ? ev.target.closest("[data-comp]") : null; if (!bt) return;
        var c = bt.getAttribute("data-comp"), id = bt.getAttribute("data-cid");
        if (c === "item") { e.sel = id; self.render(); }
        else if (c === "aba") { e.aba = bt.getAttribute("data-caba"); self.render(); }
        else if (c === "fav") { self.alternarFavorito(id); self.render(); }
        else if (c === "mais") { e.abertos[bt.getAttribute("data-cgrupo")] = true; self.render(); }
        else if (c === "inserir") { var it = H().item(id); if (it && self.executar(it)) self.render(); }
      };
      corpo.onkeydown = function (ev) {
        if ((ev.key === "Enter" || ev.key === " ") && ev.target.getAttribute && ev.target.getAttribute("data-comp") === "item") { ev.preventDefault(); e.sel = ev.target.getAttribute("data-cid"); self.render(); }
      };
    }
  };

  global.HidComponentesUI = Painel;
  if (typeof module !== "undefined" && module.exports) module.exports = Painel;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

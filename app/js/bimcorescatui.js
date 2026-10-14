/* =====================================================================
 * bimcorescatui.js — CORES POR CATEGORIA: a TELA (14/10/2026).
 * O motor puro é o js/bimcorescat.js; o 3D é pintado pelo js/bim.js
 * (matBase) e o 2D, pelo js/bim2dui.js + js/desenho2d.js. Aqui ficam:
 *   · o interruptor da barra de baixo (a "barra de controle da vista") e o
 *     comando de Vista › Gráficos — os dois ligam/desligam a vista ATIVA;
 *   · a LEGENDA flutuante (categorias presentes, cor, contagem): o clique
 *     oculta/mostra a categoria, Shift+clique isola, o quadradinho abre a cor;
 *   · o painel "Cores por categoria" (editar cada cor, voltar ao padrão,
 *     imprimir com as cores) e a seção em Propriedades da vista;
 *   · a ponte com o desenho 2D (aplicar2D, para a tela) e com a folha
 *     (paraImpressao, só quando a pessoa pede "imprimir com as cores").
 *
 * É POR VISTA: cada planta, corte, elevação e a {3D} têm o seu liga/desliga
 * e as suas categorias escondidas (gravados por obra, js/bimcorescat.js). A
 * PALETA é por usuário/aparelho: uma só para todas as vistas.
 * As vistas 3D EXTRAS (aba nova, lado a lado) também têm o seu: a cor e as categorias
 * escondidas são só da vista (o js/bim.js dá a ela um estado próprio, como o ponto de
 * vista numa aba); o estado delas fica só na sessão (o id "v1" não é estável).
 * ⚠ IMPRESSÃO: por padrão a folha, o PDF e o DXF saem SEM as cores (é modo de
 * modelagem). "Imprimir com as cores" é uma opção da vista.
 * ===================================================================== */
(function (global) {
  "use strict";

  function CC() { return global.BimCoresCat || null; }
  function B() { return global.BIM || null; }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function obraKey() { try { return String((global.Gestao && global.Gestao._bimSel) || "geral"); } catch (e) { return "geral"; } }
  /* toda entrada passa por aqui: a obra certa no motor antes de ler/gravar qualquer coisa */
  function motor() { var c = CC(); if (c) c.configurar({ obra: obraKey() }); return c; }
  function lerPref(k, pad) { try { var v = global.localStorage.getItem(k); return v == null ? pad : v; } catch (e) { return pad; } }
  function gravarPref(k, v) { try { global.localStorage.setItem(k, v); } catch (e) {} }

  var PREF_RECOLHIDA = "orcapro:bim:cores-cat:legenda-recolhida";

  var UI = {
    _G: null,
    _cont2d: {},        /* vista 2D → { categoria: n } da última pintura */
    _sem2d: {},         /* vista 2D → motivo de não ter pintado (os dados RA ainda não chegaram) */
    _agendado: null,

    /* ----------------------------------------------------------- vistas */
    ativa: function () {
      try { var st = this._G && this._G._bimVxEst ? this._G._bimVxEst() : null; return (st && st.ativa) || "3d"; } catch (e) { return "3d"; }
    },
    /* "2d" | "3d" | "outra" (folha, tabela: não têm cor por categoria) */
    tipoDe: function (id) {
      if (!id || id === "3d") return "3d";
      var P = global.Bim2D;
      if (P && P.ehVista2d && P.ehVista2d(id)) return "2d";
      var v = null; try { v = this._G && this._G._bimVxAchar ? this._G._bimVxAchar(id) : null; } catch (e) { v = null; }
      if (v && (v.tipo === "folha" || v.tipo === "2d")) return "outra";
      return "3d";
    },
    /* a chave da vista no motor: a {3D}, cada vista 3D extra ("v1"…) e cada vista 2D têm a sua */
    chave: function (id) {
      id = id || this.ativa();
      var t = this.tipoDe(id);
      return t === "2d" || t === "3d" ? id : null;
    },
    ligada: function (id) { var c = motor(), k = this.chave(id); return !!(c && k && c.ligadoEm(k)); },

    /* ----------------------------------------------------------- liga/desliga */
    alternar: function (id) {
      var c = motor(); if (!c) { toast("O motor das cores por categoria não carregou.", "erro"); return false; }
      id = id || this.ativa();
      var k = this.chave(id), t = this.tipoDe(id);
      if (!k) { toast("Cores por categoria valem na {3D}, nas plantas, cortes e elevações — esta vista não tem.", "aviso"); return false; }
      if (!this.temModelo()) { toast("Abra um modelo primeiro: as cores são por categoria das peças do modelo.", "aviso"); return false; }
      var on = !c.ligadoEm(k);
      c.ligar(k, on);
      this.aplicar(k);
      this.sincronizar();
      try { if (global.BimShell && global.BimShell.repintarVista) global.BimShell.repintarVista(); } catch (eRp) {}   /* Propriedades da vista mostram o liga/desliga novo */
      if (on && t === "2d" && this._sem2d[k]) toast(this._sem2d[k], "aviso");
      status(on ? "Cores por categoria ligadas nesta vista — a legenda mostra o que há; desligar volta ao visual de antes." : "Cores por categoria desligadas nesta vista: o visual de antes voltou.");
      return on;
    },
    temModelo: function () {
      var b = B(); try { return !!(b && b.elementos && b.elementos.length); } catch (e) { return false; }
    },
    /* leva o estado do motor para a imagem */
    aplicar: function (k) {
      var c = motor(), b = B(); if (!c || !k) return;
      if (k === "3d") {
        if (b && b.coresCategoria) { b.coresCategoria(c.ligadoEm("3d")); if (b.coresCategoriaOcultas) b.coresCategoriaOcultas(c.ocultasEm("3d")); }
      } else if (this.tipoDe(k) === "3d") {   /* vista 3D extra: a cor e o que está escondido são só dela */
        if (b && b.coresCategoriaVista) b.coresCategoriaVista(k, c.ligadoEm(k), c.ocultasEm(k));
      } else if (global.Bim2D && global.Bim2D._cache && global.Bim2D._cache[k]) {
        global.Bim2D.redesenhar(k, false);
      }
    },
    /* o modelo entrou/mudou: a {3D} volta ao que o motor guardou (uma obra aberta de novo já abre colorida) */
    reaplicar3d: function () {
      var c = motor(), b = B(); if (!c || !b || !b.coresCategoria) return;
      var quer = c.ligadoEm("3d"), esta = !!(b.coresCategoriaOn && b.coresCategoriaOn());
      /* já está como deve: a cena só refez os modelos (e o bim.js reaplica a cor e o que está escondido sozinho) */
      if (quer === esta) { if (quer) this.agendar(); return; }
      if (!this.temModelo()) return;
      b.coresCategoria(quer);
      if (quer && b.coresCategoriaOcultas) b.coresCategoriaOcultas(c.ocultasEm("3d"));
      this.agendar();
    },

    /* ----------------------------------------------------------- 2D */
    /* chamado pelo Bim2D.redesenhar: devolve os dados pintados (cópias) e põe os estilos novos em `ex.p6` */
    aplicar2D: function (id, dados, ex) {
      var c = motor(); delete this._sem2d[id];
      if (!c || !c.ligadoEm(id) || (dados && dados.tipo === "desenho")) { delete this._cont2d[id]; return null; }   /* a vista de desenho é papel em branco: não tem peça do modelo */
      if (!ex || !ex.p6 || !dados || !dados.p6Estilos) {
        this._sem2d[id] = "As cores por categoria nas plantas e cortes usam os estilos de objeto; eles ainda não carregaram (ou o modelador está desligado). Tente de novo em instantes.";
        delete this._cont2d[id];
        return null;
      }
      var b = B(), memo = {};
      var r = c.pintar2D(dados, dados.p6Estilos, {
        catDe: function (u, t) {
          var k = (u || "") + "|" + (t || "");
          if (memo[k]) return memo[k];
          var cat = b && b.categoriaDaPeca ? b.categoriaDaPeca(u, t) : null;
          return (memo[k] = cat || c.categoria({ ifc: t }));
        },
        ocultas: c.ocultasEm(id), paleta: c.paleta()
      });
      ex.p6.estilos = r.estilos;
      this._cont2d[id] = r.contagem;
      this.agendar();
      return r.dados;
    },
    /* a FOLHA/PDF: só quando a pessoa marcou "imprimir com as cores" e a vista está colorida */
    paraImpressao: function (id, bruto, ex) {
      var c = motor(); if (!c || !c.ligadoEm(id) || !c.imprimirComCores(id)) return null;
      var M6 = global.BimModeloVista; if (!M6 || !M6.ativo || !M6.ativo() || !bruto || !bruto.p6Estilos) return null;
      M6.extraSvg(id, bruto, ex);
      if (!ex.p6) return null;
      var b = B();
      var r = c.pintar2D(bruto, bruto.p6Estilos, {
        catDe: function (u, t) { var cat = b && b.categoriaDaPeca ? b.categoriaDaPeca(u, t) : null; return cat || c.categoria({ ifc: t }); },
        ocultas: c.ocultasEm(id), paleta: c.paleta()
      });
      ex.p6.estilos = r.estilos;
      return r.dados;
    },

    /* ----------------------------------------------------------- legenda */
    agendar: function () {
      var self = this; if (this._agendado) return;
      this._agendado = setTimeout(function () { self._agendado = null; try { self.sincronizar(); } catch (e) {} }, 40);
    },
    _contagemDe: function (k) {
      if (this.tipoDe(k) === "3d") { var b = B(); try { return (b && b.coresCategoriaInfo ? b.coresCategoriaInfo().contagem : {}) || {}; } catch (e) { return {}; } }
      return this._cont2d[k] || {};
    },
    sincronizar: function () {
      var c = motor(); if (!c) return;
      var self = this, ativa = this.ativa(), kA = this.chave(ativa), on = !!(kA && c.ligadoEm(kA));
      [].forEach.call(document.querySelectorAll('[data-rv-vb="cores-cat"]'), function (bt) {
        bt.setAttribute("aria-pressed", on ? "true" : "false");
        bt.disabled = !kA;
        bt.title = on ? "Cores por categoria LIGADAS nesta vista (clique desliga). Pilares, vigas, componentes, pisos… cada um com a sua cor."
          : "Cores por categoria: cada tipo de peça com uma cor (pilares, vigas, componentes paramétricos, pisos…). Só gráfico — não muda o modelo.";
      });
      try { if (global.BimRibbon && global.BimRibbon.setAtivo) { global.BimRibbon.setAtivo("cores-categoria", on); if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } } catch (e) {}
      var grade = document.getElementById("bim-grade"); if (!grade) return;
      var contas = {};
      [].forEach.call(grade.querySelectorAll(".bim-tela"), function (tela) {
        var id = tela.getAttribute("data-vista"), k = self.chave(id);
        /* uma legenda por vista que está colorida (a {3D}, cada vista 3D extra, cada vista 2D) */
        var queLegenda = k && c.ligadoEm(k);
        var leg = null; [].forEach.call(tela.children, function (f) { if (f.className && String(f.className).indexOf("cc-leg") >= 0) leg = f; });
        if (!queLegenda) { if (leg && leg.parentNode) leg.parentNode.removeChild(leg); return; }
        var cont = contas[k] || (contas[k] = self._contagemDe(k));
        self._pintarLegenda(tela, leg, id, k, c.legenda(cont, k));
      });
    },
    _pintarLegenda: function (tela, leg, id, k, itens) {
      var self = this, c = CC(), recolhida = lerPref(PREF_RECOLHIDA, "0") === "1";
      if (!leg) {
        leg = document.createElement("div"); leg.className = "cc-leg"; leg.setAttribute("role", "group");
        leg.setAttribute("aria-label", "Legenda das cores por categoria");
        tela.appendChild(leg);
        leg.addEventListener("click", function (ev) { self._clique(ev, leg); });
        leg.addEventListener("input", function (ev) { self._cor(ev); });
        leg.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });   /* clicar na legenda não seleciona/arrasta o desenho por baixo */
        leg.addEventListener("wheel", function (ev) { ev.stopPropagation(); });
      }
      leg.setAttribute("data-cc-vista", k); leg.setAttribute("data-cc-tela", id);
      leg.setAttribute("data-cc-recolhida", recolhida ? "1" : "0");
      var oc = c.ocultasEm(k), nOc = Object.keys(oc).length, tot = 0;
      itens.forEach(function (i) { tot += i.n; });
      var h = '<div class="cc-cab"><b class="cc-tit">Cores por categoria</b>' +
        '<button type="button" class="cc-bt" data-cc-acao="painel" title="Editar as cores, voltar ao padrão, imprimir com as cores" aria-label="Editar as cores">' + this._ico("pincel") + "</button>" +
        '<button type="button" class="cc-bt" data-cc-acao="recolher" title="' + (recolhida ? "Abrir a legenda" : "Recolher a legenda") + '" aria-label="' + (recolhida ? "Abrir a legenda" : "Recolher a legenda") + '" aria-expanded="' + (recolhida ? "false" : "true") + '">' + (recolhida ? "▸" : "▾") + "</button></div>";
      if (!recolhida) {
        if (!itens.length) h += '<div class="cc-vazio">' + (this._sem2d[k] ? esc(this._sem2d[k]) : "Nenhuma peça nesta vista.") + "</div>";
        else {
          h += '<div class="cc-lista">';
          itens.forEach(function (i) {
            h += '<div class="cc-it" data-cc-cat="' + i.id + '" data-cc-oculta="' + (i.oculta ? "1" : "0") + '">' +
              '<label class="cc-cor" style="background:' + esc(i.cor) + '" title="Mudar a cor de ' + esc(i.nome) + '"><input type="color" class="cc-pick" data-cc-cor="' + i.id + '" value="' + esc(i.cor) + '" aria-label="Cor de ' + esc(i.nome) + '"></label>' +
              '<button type="button" class="cc-nm" data-cc-nm="' + i.id + '" aria-pressed="' + (i.oculta ? "false" : "true") + '" title="' + esc(i.nome) + ' — clique oculta/mostra; Shift+clique isola">' +
              '<span class="cc-nome">' + esc(i.nome) + '</span><span class="cc-n">' + i.n + "</span></button></div>";
          });
          h += "</div>";
          h += '<div class="cc-pe">' + (nOc ? '<button type="button" class="cc-todas" data-cc-acao="todas">Mostrar todas (' + nOc + " oculta" + (nOc > 1 ? "s" : "") + ")</button>" : '<span class="cc-dica">Clique oculta · Shift+clique isola</span>') + "</div>";
        }
      }
      if (leg._ccHtml !== h) { leg._ccHtml = h; leg.innerHTML = h; }   /* só refaz o DOM quando a legenda mudou (o clique de ocultar não perde o foco à toa) */
    },
    _ico: function (n) { try { return global.Icones ? global.Icones.get(n, 13) : ""; } catch (e) { return ""; } },
    _vistaDe: function (leg) { return leg ? leg.getAttribute("data-cc-vista") : null; },
    _clique: function (ev, leg) {
      var c = motor(), k = this._vistaDe(leg), alvo = ev.target, nm = alvo.closest ? alvo.closest("[data-cc-nm]") : null, ac = alvo.closest ? alvo.closest("[data-cc-acao]") : null;
      if (!c || !k) return;
      if (nm) {
        var cat = nm.getAttribute("data-cc-nm"), pres = [].map.call(leg.querySelectorAll("[data-cc-cat]"), function (e) { return e.getAttribute("data-cc-cat"); });
        if (ev.shiftKey || ev.altKey) c.isolar(k, cat, pres); else c.alternarOculta(k, cat);
        this.aplicar(k); this.sincronizar();
        return;
      }
      if (!ac) return;
      var a = ac.getAttribute("data-cc-acao");
      if (a === "todas") { c.mostrarTodas(k); this.aplicar(k); this.sincronizar(); }
      else if (a === "recolher") { gravarPref(PREF_RECOLHIDA, lerPref(PREF_RECOLHIDA, "0") === "1" ? "0" : "1"); this.sincronizar(); }
      else if (a === "painel") this.abrirPainel();
    },
    /* o quadradinho da legenda e o painel: uma cor mudou */
    _cor: function (ev) {
      var t = ev.target; if (!t || !t.getAttribute || t.getAttribute("data-cc-cor") == null) return;
      this.mudarCor(t.getAttribute("data-cc-cor"), t.value);
    },
    mudarCor: function (cat, cor) {
      var c = motor(); if (!c) return false;
      var r = c.definirCor(cat, cor); if (!r.ok) { toast(r.motivo, "erro"); return false; }
      this.repintarTudo();
      return true;
    },
    /* a paleta mudou: refaz o 3D e toda vista 2D que está colorida */
    repintarTudo: function () {
      var c = motor(), b = B(), self = this;
      try { if (b && b.coresCategoriaRepintar) b.coresCategoriaRepintar(); } catch (e) {}
      if (global.Bim2D && global.Bim2D._cache) Object.keys(global.Bim2D._cache).forEach(function (k) { if (c && c.ligadoEm(k)) { try { global.Bim2D.redesenhar(k, false); } catch (e2) {} } });
      this.agendar();
    },

    /* ----------------------------------------------------------- o painel */
    abrirPainel: function () {
      var self = this, c = motor(); if (!c || !global.UI || !global.UI.modal) return false;
      var k = this.chave(), pal = c.paleta();
      var linhas = c.CATEGORIAS.map(function (cat) {
        var mudou = pal[cat.id].toLowerCase() !== cat.cor.toLowerCase();
        return '<tr data-cc-linha="' + cat.id + '"><td style="width:46px"><input type="color" data-cc-cor="' + cat.id + '" value="' + esc(pal[cat.id]) + '" aria-label="Cor de ' + esc(cat.nome) + '"></td>' +
          "<td><b>" + esc(cat.nome) + '</b><br><span class="muted" style="font-size:11px">' + esc(cat.dica) + "</span></td>" +
          '<td style="font-size:11px;white-space:nowrap" class="muted">' + (mudou ? "personalizada" : "padrão RA") + "</td></tr>";
      }).join("");
      var imp = k && k !== "3d"
        ? '<label style="display:flex;gap:8px;align-items:center;margin:10px 0 0"><input type="checkbox" data-cc-imp' + (c.imprimirComCores(k) ? " checked" : "") + '> <span>Imprimir esta vista (folha, PDF) <b>com</b> as cores — por padrão sai sem elas</span></label>'
        : '<p class="muted" style="font-size:11px;margin:10px 0 0">Folhas, PDF e DXF saem sem as cores por padrão; nas plantas e cortes há a opção de imprimir com elas (Propriedades da vista ou aqui).</p>';
      var h = '<p class="muted" style="margin:0 0 8px">Cada categoria de peça numa cor. É só gráfico: o modelo não muda, e desligar devolve o visual de antes. As cores valem para todas as vistas (ficam neste aparelho, por usuário); ligar e desligar é por vista.</p>' +
        '<p class="muted" style="margin:0 0 8px;font-size:12px"><b>Quando os filtros também estão ligados:</b> a cor por categoria substitui a cor da peça; os filtros de visibilidade (V/G, conjuntos, isolar, 4D) continuam escondendo o que escondem; a pintura de conjunto, o 4D e a seleção ficam por cima; a cor por sistema hidrossanitário é exclusiva (ligar uma desliga a outra).</p>' +
        '<div style="max-height:54vh;overflow:auto"><table class="tbl" style="width:100%;font-size:12px"><tbody>' + linhas + "</tbody></table></div>" + imp;
      global.UI.modal("Cores por categoria", h, [
        { texto: "Voltar ao padrão", classe: "ghost", onClick: function () { c.voltarPadrao(); self.repintarTudo(); self.abrirPainel(); status("Cores por categoria: paleta padrão RA restaurada."); } },
        { texto: "Fechar", classe: "primary", onClick: function () { global.UI.fecharModal(); } }
      ]);
      var bg = document.getElementById("modal-bg") || document;
      [].forEach.call(bg.querySelectorAll("input[data-cc-cor]"), function (inp) {
        inp.addEventListener("input", function () { self.mudarCor(inp.getAttribute("data-cc-cor"), inp.value); var t = inp.closest("tr"); if (t) { var td = t.querySelectorAll("td")[2]; if (td) td.textContent = "personalizada"; } });
      });
      var ip = bg.querySelector("input[data-cc-imp]");
      if (ip) ip.addEventListener("change", function () { c.definirImprimir(k, ip.checked); status(ip.checked ? "Esta vista vai para a folha e o PDF COM as cores." : "Esta vista vai para a folha e o PDF sem as cores (padrão)."); try { self._invalidarFolhas(); } catch (e) {} });
      return true;
    },
    _invalidarFolhas: function () { var F = global.BimFolhaUI; if (F && F._desenhos) F._desenhos = {}; },

    /* ----------------------------------------------------------- Propriedades da vista */
    secaoVista: function (id) {
      var c = motor(), k = this.chave(id); if (!c || !k) return null;
      var on = c.ligadoEm(k), ps = [{ id: "cc:on", rotulo: "Cores por categoria", tipo: "sim-nao", valor: on }];
      if (k !== "3d") ps.push({ id: "cc:imprimir", rotulo: "Imprimir com as cores", tipo: "sim-nao", valor: c.imprimirComCores(k) });
      ps.push({ id: "cc:painel", rotulo: "Paleta", tipo: "botao", rotuloBotao: "Editar as cores…", fn: function () { UI.abrirPainel(); } });
      return { nome: "Cores por categoria", params: ps };
    },
    mudarVista: function (id, pid, valor) {
      var c = motor(), k = this.chave(id); if (!c || !k) return false;
      var sim = !!valor && valor !== "false";
      if (pid === "cc:on") { if (sim !== c.ligadoEm(k)) this.alternar(id); return true; }
      if (pid === "cc:imprimir") { c.definirImprimir(k, sim); this._invalidarFolhas(); return true; }
      return false;
    },

    /* ----------------------------------------------------------- barra de baixo e fita */
    botaoBarra: function (el, ico) {
      var self = this, bt = el("button", "rv-vb");
      bt.type = "button"; bt.setAttribute("data-rv-vb", "cores-cat"); bt.setAttribute("aria-pressed", "false");
      bt.setAttribute("aria-label", "Cores por categoria"); bt.title = "Cores por categoria: cada tipo de peça com uma cor";
      bt.innerHTML = ico("paleta", 14) + "<span>Cores</span>";
      bt.onclick = function () { self.alternar(); };
      return bt;
    },
    registrar: function (reg, G) {
      this._G = G || this._G;
      var self = this, R = global.BimRibbon; if (!R || !reg) return false;
      R.acrescentar("vista", "Vista", "Gráficos", [
        { id: "cores-categoria", rotulo: "Cores por\ncategoria", icone: "paleta", grande: true, tipo: "alterna", dica: "Cada categoria de peça numa cor — pilares, vigas, contraventamento, terças, lajes, piso industrial, componentes paramétricos, fundações, paredes, esquadrias, ligações. Por vista (3D, planta, corte, elevação), só gráfico: não muda o modelo. Também no botão \"Cores\" da barra de baixo." },
        { id: "cores-categoria-paleta", rotulo: "Paleta de\ncategorias", icone: "pincel", dica: "Editar a cor de cada categoria, voltar ao padrão RA e escolher imprimir a vista com as cores." }
      ]);
      reg["cores-categoria"] = function () { self.alternar(); return true; };
      reg["cores-categoria-paleta"] = function () { self.abrirPainel(); return true; };
      this._ligarEventos();
      return true;
    },
    _eventos: false,
    _ligarEventos: function () {
      var self = this; if (this._eventos) return; this._eventos = true;
      try {
        global.addEventListener("bim:modelos", function () { self.reaplicar3d(); });
        /* ⚠ A CENA PODE MUDAR SOZINHA: ligar a cor por sistema desliga a por categoria lá dentro do bim.js. O motor (que guarda o liga/desliga da vista) acompanha,
           senão o botão e a legenda diriam "ligado" com a cena sem cor — e o próximo modelo que entrasse religaria a categoria por cima da escolha nova */
        global.addEventListener("bim:cores-cat", function (ev) {
          var c = motor(), on = !!(ev && ev.detail && ev.detail.on);
          if (c && c.ligadoEm("3d") !== on) c.ligar("3d", on);
          self.agendar();
        });
      } catch (e) {}
    },
    /* a vista ativa mudou (aba, lado a lado, fechar): o botão e as legendas acompanham */
    aoMudarVista: function () { this.agendar(); },
    /* uma vista foi fechada/apagada: não deixa lixo guardado */
    vistaSaiu: function (id) { var c = motor(); if (c && id) { c.esquecerVista(id); delete this._cont2d[id]; delete this._sem2d[id]; } }
  };

  global.BimCoresCatUI = UI;
  if (typeof module !== "undefined" && module.exports) module.exports = UI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

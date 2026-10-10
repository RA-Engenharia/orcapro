/* =====================================================================
 * bimfolhaui.js — FOLHAS NO BIM (P8, frentes A, B e C)
 * (plano do BIM §3.6 e fase P8; prévia `?previa=modelador`)
 *
 * Quem faz o quê:
 *   js/prancha.js .... motor: viewport, parâmetros da folha, revisões,
 *                      lista de folhas/vistas, nome automático (puro);
 *   js/pranchaui.js .. o HTML da folha (vista em escala em VETOR, título de
 *                      vista, carimbo parametrizado);
 *   js/bimdxf.js ..... o DXF da vista e da folha (camada por categoria,
 *                      espessura pela pena);
 *   este arquivo ..... a TELA: a folha abre numa ABA de vista (igual planta e
 *                      corte), recebe a vista ARRASTADA do Navegador, mostra
 *                      os parâmetros em Propriedades e exporta.
 *
 * Onde mora o quê:
 *   folhas ........... no registro de pranchas da obra (Store `bim_pranchas`,
 *                      o mesmo das "Pranchas do projeto");
 *   revisões ......... do PROJETO, por obra: localStorage
 *                      `orcapro:bim:projeto:<obra>` = { revisoes: [{ id,
 *                      numero, data, descricao, emitidoPor, emitidoPara,
 *                      emitida }] } (o formato da P7: a nuvem de revisão liga
 *                      pelo id). Só neste aparelho por enquanto (prévia).
 *   desenho da vista . NUNCA gravado: refeito do modelo (Bim2D) na hora.
 *
 * Sem a prévia, `ativo()` é falso e nada daqui aparece.
 * ===================================================================== */
(function (global) {
  "use strict";

  function PR() { return global.Prancha; }
  function UI2() { return global.PranchaUI; }
  function D2() { return global.Desenho2D; }
  function B2() { return global.Bim2D; }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  var MM_PX = 96 / 25.4;
  var TIPO_ARRASTE = "text/x-orcapro-vista";

  var BimFolhaUI = {
    _G: null, _desenhos: {}, _sel: null, _telas: {}, _ultimoArquivo: null,

    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && PR() && UI2() && PR().colocarViewport); } catch (e) { return false; } },
    G: function () { return this._G || global.Gestao || null; },
    obraKey: function () { var g = this.G(); return String((g && g._bimSel) || "geral"); },
    empresa: function () { try { return global.Auth && global.Auth.empresaId ? global.Auth.empresaId() : null; } catch (e) { return null; } },

    /* ---------------------------------------------------------- dados */
    registros: function () { var g = this.G(); try { return (g && g._prRegs) ? g._prRegs() : []; } catch (e) { return []; } },
    salvarRegistro: function (reg) {
      if (!global.Store) return null;
      var r = global.Store.salvar(this.empresa(), "bim_pranchas", reg);
      if (!r) toast("Não consegui salvar a folha (armazenamento cheio?).", "erro");
      return r;
    },
    _chaveProjeto: function () { return "orcapro:bim:projeto:" + this.obraKey(); },
    projeto: function () {
      var p = null; try { p = JSON.parse(global.localStorage.getItem(this._chaveProjeto()) || "null"); } catch (e) { p = null; }
      if (!p || typeof p !== "object") p = {};
      p.revisoes = PR() ? PR().revisoesProjeto(p) : arr(p.revisoes);
      return p;
    },
    gravarProjeto: function (p) { try { global.localStorage.setItem(this._chaveProjeto(), JSON.stringify(p)); return true; } catch (e) { toast("Não consegui guardar as revisões neste aparelho.", "erro"); return false; } },

    idFolha: function (regId, folhaId) { return "fl-" + regId + "--" + folhaId; },
    ehFolha: function (id) { return /^fl-.+--.+/.test(String(id || "")); },
    achar: function (id) {
      var m = /^fl-(.+)--(.+)$/.exec(String(id || "")); if (!m) return null;
      var reg = this.registros().filter(function (r) { return String(r.id) === m[1]; })[0]; if (!reg) return null;
      var pr = PR().normalizar(reg), ix = -1;
      pr.folhas.forEach(function (f, i) { if (f.id === m[2]) ix = i; });
      if (ix < 0) return null;
      return { reg: reg, pr: pr, folha: pr.folhas[ix], ix: ix, geo: PR().geometriaDe(pr) };
    },
    /* grava a folha `f` (normalizada) de volta no registro */
    gravarFolha: function (a, f) {
      var reg = a.reg, pr = PR().normalizar(reg);
      pr.folhas[a.ix] = f;
      pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      return this.salvarRegistro(pr);
    },
    nomeFolha: function (pr, f) { return PR().numeroFolha(pr, f) + " - " + (f.conteudo || "Sem nome"); },

    /* o cadastro da conta (⚙ Empresa): nome, CNPJ, título, responsável, CREA, endereço, contato */
    empresaDados: function () { try { return global.Empresa && global.Empresa.dados ? global.Empresa.dados() : {}; } catch (e) { return {}; } },
    /* o prancha do template aplicado na obra (.optpl: formato, notas, modelo de carimbo) */
    templatePrancha: function () { try { var b = B2(); return (b && b.estado && (b.estado().templateAtivo || {}).prancha) || null; } catch (e) { return null; } },
    /* o conjunto "Folhas do projeto" da obra — criado na 1ª vez com o CARIMBO RA. Os dados da empresa
       NÃO são copiados para a prancha: o carimbo lê o cadastro da conta na hora (mudou lá, muda aqui).
       Registro de antes do modelo de carimbo (sem `modelo`) passa a RA: é o padrão das folhas do modelador. */
    conjunto: function (formato) {
      var regs = this.registros(), reg = regs.filter(function (r) { return r.origem === "folhas"; })[0];
      if (reg) {
        if (!reg.carimbo || !reg.carimbo.modelo) { reg = clone(reg); reg.carimbo = reg.carimbo || {}; reg.carimbo.modelo = "RA"; }
        return reg;
      }
      var tpl = this.templatePrancha() || {}, obra = null;
      try { obra = global.Store.obter(this.empresa(), "obras", this.G()._bimSel); } catch (e2) { obra = null; }
      obra = obra || {};
      var tc = tpl.carimbo || {};
      reg = PR().normalizar({ nome: "Folhas do projeto", formato: formato || tpl.formato || "A1", orientacao: tpl.orientacao, origem: "folhas", folhas: [], coluna: tpl.coluna || [],
        carimbo: { modelo: tc.modelo === "simples" ? "simples" : "RA", obra: obra.nome || "", proprietario: obra.clienteNome || "",
                   local: obra.local || obra.endereco || "", data: new Date().toLocaleDateString("pt-BR") } });
      reg.obraId = String(this.G()._bimSel || ""); reg.criadoEm = new Date().toISOString(); delete reg.id;
      return reg;
    },

    /* uma folha nova no conjunto "Folhas do projeto" da obra (criado na 1ª vez) */
    novaFolha: function (formato) {
      var reg = this.conjunto(formato);
      var pr = PR().normalizar(reg), n = pr.folhas.length + 1;
      pr.folhas.push(PR().normalizar({ folhas: [{ id: "f" + Date.now().toString(36) + n, n: n, conteudo: "Folha " + ("0" + n).slice(-2), escala: "indicada" }] }).folhas[0]);
      pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      if (!pr.id) delete pr.id;
      var salvo = this.salvarRegistro(pr); if (!salvo) return null;
      var id = this.idFolha(salvo.id, pr.folhas[pr.folhas.length - 1].id);
      this.abrir(id);
      return id;
    },

    /* ----------------------------------------------- aba da folha */
    abrir: function (id) {
      var g = this.G(), a = this.achar(id); if (!g || !a) return null;
      var st = g._bimVxEst(), v = g._bimVxAchar(id), nome = "Folha: " + this.nomeFolha(a.pr, a.folha);
      if (!v) {
        var tela = g._bimVxCriarTela(id, nome); if (!tela) return null;
        tela.classList.add("bim-tela-folha");
        this.montar(tela, id);
        st.lista.push({ id: id, nome: nome, janela: null, tipo: "folha" });
      }
      g._bimVxAtivar(id);
      try { g._nivArvore(); } catch (e) {}
      return id;
    },
    montar: function (tela, id) {
      if (!tela) return false;
      var self = this, c = tela.querySelector(".pv-tela");
      if (!c) { c = document.createElement("div"); c.className = "pv-tela"; tela.appendChild(c); }
      c.setAttribute("data-pv-folha", id);
      this._telas[id] = { tela: tela, el: c };
      if (!c._pvLigado) { c._pvLigado = true; this._ligar(c, id); }
      if (global.ResizeObserver && !c._pvRO) { c._pvRO = new global.ResizeObserver(function () { self._ajustar(id); }); c._pvRO.observe(c); }
      return this.pintar(id);
    },
    desmontar: function (id) { var t = this._telas[id]; if (t && t.el && t.el._pvRO) { try { t.el._pvRO.disconnect(); } catch (e) {} } delete this._telas[id]; if (this._sel && this._sel.id === id) this._sel = null; },

    /* o desenho de uma vista 2D, pronto para o viewport (cache da sessão; "Atualizar" refaz) */
    desenho: function (vistaId, refazer) {
      if (!refazer && this._desenhos[vistaId]) return this._desenhos[vistaId];
      var b2 = B2(), D = D2(); if (!b2 || !D) return null;
      try { var g = this.G(); if (g && g._d2Config) g._d2Config(); } catch (e0) {}
      var d = b2.def(vistaId); if (!d) return null;
      var c = b2._cache[vistaId], bruto = (c && c.dados && !refazer) ? c.dados : b2._extrair(d);
      if (!bruto || !bruto.ok) return null;
      var an = b2._anotar(d, bruto); an.linhasIfc = bruto.linhasIfc || [];
      var est = clone(b2.estilo(vistaId)); est.titulo = false;   /* o título é o do viewport */
      var res = D.svg(an, est, { titulo: "" });
      var o = { vistaId: vistaId, nome: d.nome, tipo: d.tipo, dados: an, estilo: est, svg: res.svg, vb: res.vb, pena: est.pena, penasPx: D.PENAS[est.pena], escala: est.escala };
      this._desenhos[vistaId] = o;
      return o;
    },
    /* o quadro acompanha a escala e o tamanho da vista (o viewport É a vista) */
    _sincronizar: function (a) {
      var self = this, mudou = false, f = clone(a.folha);
      f.blocos.forEach(function (b) {
        if (b.tipo !== "viewport") return;
        var dz = self.desenho(b.vistaId); if (!dz) return;
        var t = PR().tamanhoViewport({ w: dz.vb.w, h: dz.vb.h }, dz.escala, b.recorte);
        if (b.escala !== dz.escala || Math.abs(b.w - t.w) > 0.05 || Math.abs(b.h - t.h) > 0.05) { b.escala = dz.escala; b.w = t.w; b.h = t.h; mudou = true; }
      });
      if (mudou) { this.gravarFolha(a, f); return this.achar(this.idFolha(a.reg.id, a.folha.id)); }
      return a;
    },
    recursos: function (a, editor) {
      var self = this, rec = { imagens: {}, vistas: {}, viewports: {}, projeto: this.projeto(), editor: !!editor };
      a.folha.blocos.forEach(function (b) { if (b.tipo === "viewport") { var dz = self.desenho(b.vistaId); if (dz) rec.viewports[b.vistaId] = dz; } });
      try { rec.logo = global.Empresa && global.Empresa.logo ? global.Empresa.logo() : null; } catch (e) {}
      rec.empresa = this.empresaDados();   /* o carimbo lê nome, CNPJ, RT e registro do cadastro da conta */
      return rec;
    },
    pintar: function (id) {
      var t = this._telas[id], a = this.achar(id); if (!t || !t.el) return false;
      if (!a) { t.el.innerHTML = '<div class="d2-vazio">Esta folha não existe mais nesta obra.</div>'; return false; }
      a = this._sincronizar(a);
      var P = a.geo.papel, html = UI2().folha(a.pr, a.folha, this.recursos(a, true), a.geo);
      var dica = a.folha.blocos.length ? "" : '<div class="pv-dica">Arraste uma planta ou um corte do Navegador para a folha (ou Vista › Posicionar vista).</div>';
      t.el.innerHTML = dica + '<div class="pv-papel-wrap"><div class="pv-papel" style="width:' + P.w + 'mm;height:' + P.h + 'mm">' + html + "</div></div>";
      t.papel = t.el.querySelector(".pv-papel"); t.P = P;
      var sel = this._sel && this._sel.id === id ? this._sel.ix : -1;
      if (sel >= 0) { var bs = t.el.querySelector('[data-pv-bloco="' + sel + '"]'); if (bs) bs.setAttribute("data-pv-sel", "1"); }
      this._ajustar(id);
      return true;
    },
    _ajustar: function (id) {
      var t = this._telas[id]; if (!t || !t.papel || !t.P) return;
      var W = t.el.clientWidth || 800, H = t.el.clientHeight || 560, pw = t.P.w * MM_PX, ph = t.P.h * MM_PX;
      var f = t.zoom || Math.max(0.05, Math.min((W - 32) / pw, (H - 32) / ph));
      t.escalaTela = f;
      t.papel.style.transform = "scale(" + f + ")";
      var w = t.el.querySelector(".pv-papel-wrap"); if (w) { w.style.width = Math.ceil(pw * f) + "px"; w.style.height = Math.ceil(ph * f) + "px"; }
    },
    /* ponto da tela → mm de papel */
    _mm: function (id, ev) {
      var t = this._telas[id]; if (!t || !t.papel || !t.P) return null;
      var r = t.papel.getBoundingClientRect(); if (!r.width) return null;
      return { x: (ev.clientX - r.left) / r.width * t.P.w, y: (ev.clientY - r.top) / r.height * t.P.h };
    },
    _ligar: function (c, id) {
      var self = this, arr0 = null;
      c.addEventListener("dragover", function (ev) {
        var tipos = ev.dataTransfer ? [].slice.call(ev.dataTransfer.types || []) : [];
        if (tipos.indexOf(TIPO_ARRASTE) >= 0 || tipos.indexOf("text/plain") >= 0) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = "copy"; } catch (e) {} }
      });
      c.addEventListener("drop", function (ev) {
        ev.preventDefault();
        var v = ""; try { v = ev.dataTransfer.getData(TIPO_ARRASTE) || ev.dataTransfer.getData("text/plain"); } catch (e) { v = ""; }
        var p = self._mm(id, ev);
        if (v && p) self.posicionar(id, v, p.x, p.y);
      });
      c.addEventListener("pointerdown", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest("[data-pv-bloco]") : null;
        if (!b) { self.selecionar(id, -1); return; }
        var ix = +b.getAttribute("data-pv-bloco"), p = self._mm(id, ev);
        self.selecionar(id, ix);
        var a = self.achar(id), bl = a && a.folha.blocos[ix];
        if (bl && bl.tipo === "viewport" && p) { arr0 = { ix: ix, x0: p.x, y0: p.y, bx: bl.x, by: bl.y, el: b, dx: 0, dy: 0 }; try { c.setPointerCapture(ev.pointerId); } catch (e2) {} }
      });
      c.addEventListener("pointermove", function (ev) {
        if (!arr0) return; var p = self._mm(id, ev); if (!p) return;
        arr0.dx = p.x - arr0.x0; arr0.dy = p.y - arr0.y0;
        arr0.el.style.left = (arr0.bx + arr0.dx) + "mm"; arr0.el.style.top = (arr0.by + arr0.dy) + "mm";
      });
      c.addEventListener("pointerup", function () {
        if (!arr0) return; var m = arr0; arr0 = null;
        if (Math.abs(m.dx) < 0.5 && Math.abs(m.dy) < 0.5) return;
        self.moverViewport(id, m.ix, m.bx + m.dx, m.by + m.dy);
      });
      /* dois cliques no viewport = ATIVAR a vista (abre a planta/corte para editar) */
      c.addEventListener("dblclick", function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest("[data-pv-vp]") : null;
        if (b) self.ativarVista(b.getAttribute("data-pv-vp"));
      });
      c.addEventListener("keydown", function (ev) { if ((ev.key === "Delete" || ev.key === "Backspace") && self._sel && self._sel.id === id) { ev.preventDefault(); self.removerSelecionado(); } });
      c.tabIndex = 0;
    },

    /* --------------------------------------------- viewport: pôr, mover, tirar */
    posicionar: function (id, vistaId, cx, cy) {
      var a = this.achar(id); if (!a) return { ok: false, erro: "Folha não encontrada." };
      var b2 = B2(); if (!b2 || !b2.ehVista2d(vistaId)) { toast("Arraste uma planta ou um corte do Navegador (Vistas › Plantas de piso / Cortes).", "aviso"); return { ok: false, erro: "não é vista 2D" }; }
      var dz = this.desenho(vistaId, true);
      if (!dz) { toast("Não consegui desenhar a vista: abra o modelo da obra primeiro.", "erro"); return { ok: false, erro: "sem desenho" }; }
      var todas = this.registros().map(function (r) { return PR().normalizar(r); });
      var r = PR().colocarViewport(a.pr, a.folha, { vistaId: vistaId, nome: dz.nome, escala: dz.escala, caixa: { w: dz.vb.w, h: dz.vb.h }, cx: cx, cy: cy }, todas);
      if (!r.ok) { toast(r.erro, "aviso"); return r; }
      this.gravarFolha(a, r.folha);
      this._sel = { id: id, ix: r.folha.blocos.length - 1 };
      this.pintar(id); this._pintarProps();
      status("Vista posicionada: " + dz.nome + " · 1:" + dz.escala + " · detalhe " + r.bloco.numeroDetalhe + ".");
      if (r.aviso) toast(r.aviso, "aviso");
      return r;
    },
    moverViewport: function (id, ix, x, y) {
      var a = this.achar(id); if (!a || !a.folha.blocos[ix]) return false;
      var f = clone(a.folha), b = f.blocos[ix], eg = f.eixoGuia, ar = a.geo.area;
      if (eg) { x = PR().ajustarEixo(x, eg.espaco, ar.x); y = PR().ajustarEixo(y, eg.espaco, ar.y); }
      b.x = Math.round(x * 10) / 10; b.y = Math.round(y * 10) / 10;
      this.gravarFolha(a, f); this.pintar(id);
      var cf = PR().conferir({ formato: a.pr.formato, orientacao: a.pr.orientacao, folhas: [f] });
      if (!cf.ok) toast("Parte da vista ficou fora da área de desenho (sai cortada na impressão).", "aviso");
      return true;
    },
    removerSelecionado: function () {
      var s = this._sel; if (!s) return false;
      var a = this.achar(s.id); if (!a || !a.folha.blocos[s.ix]) return false;
      var f = clone(a.folha), b = f.blocos.splice(s.ix, 1)[0];
      this.gravarFolha(a, f); this._sel = null; this.pintar(s.id); this._pintarProps();
      status((b.tituloVista || "Bloco") + " retirado da folha (a vista continua no projeto).");
      return true;
    },
    selecionar: function (id, ix) {
      this._sel = ix >= 0 ? { id: id, ix: ix } : null;
      var t = this._telas[id];
      if (t && t.el) [].forEach.call(t.el.querySelectorAll("[data-pv-bloco]"), function (e) { if (+e.getAttribute("data-pv-bloco") === ix) e.setAttribute("data-pv-sel", "1"); else e.removeAttribute("data-pv-sel"); });
      this._pintarProps();
    },
    _pintarProps: function () { try { if (global.BimShell) global.BimShell.pintarProps(this._sel ? this.propsViewport(this._sel.id, this._sel.ix) : null); } catch (e) {} },
    /* "Ativar vista": aqui a vista abre na aba dela para editar; a folha continua na aba ao lado */
    ativarVista: function (vistaId) {
      var g = this.G(), d = B2() && B2().def(vistaId); if (!g || !d) return false;
      g._d2Abrir(vistaId, d.nome);
      status("Vista ativada: " + d.nome + ". Edite e volte à aba da folha (Desativar vista).");
      this._ativada = vistaId;
      return true;
    },
    desativarVista: function () {
      var g = this.G(), st = g && g._bimVxEst(), alvo = null;
      if (!st) return false;
      st.lista.forEach(function (v) { if (v.tipo === "folha") alvo = alvo || v.id; });
      var self = this; Object.keys(this._desenhos).forEach(function (k) { if (k === self._ativada) delete self._desenhos[k]; });
      this._ativada = null;
      if (alvo) { g._bimVxAtivar(alvo); this.pintar(alvo); }
      return !!alvo;
    },

    /* --------------------------------------------- Propriedades */
    props: function (id) {
      var self = this, a = this.achar(id); if (!a) return null;
      var params = PR().parametrosFolha(a.pr, a.folha, this.projeto()), ident = [], graf = [], outros = [];
      params.forEach(function (p) {
        var q = { id: "p:" + p.bip, rotulo: p.nome, valor: p.valor, leitura: !!p.leitura };
        if (p.bip === "SHEET_SCHEDULED") { q.tipo = "sim-nao"; }
        else if (p.bip === "SHEET_REVISIONS_ON_SHEET") { q = { id: "p:rev", rotulo: p.nome, tipo: "botao", rotuloBotao: (p.valor || "Nenhuma") + " — editar…", fn: function () { self.escolherRevisoes(id); } }; }
        else if (p.bip === "SHEET_GUIDE_GRID") { q.tipo = "lista"; q.valor = a.folha.eixoGuia ? String(a.folha.eixoGuia.espaco) : "0"; q.opcoes = [{ id: "0", rotulo: "<Nenhum>" }, { id: "10", rotulo: "10 mm" }, { id: "25", rotulo: "25 mm" }, { id: "50", rotulo: "50 mm" }]; }
        else if (!p.leitura) q.tipo = "texto";
        if (p.bip === "SHEET_SCALE" || p.bip === "SHEET_WIDTH" || p.bip === "SHEET_HEIGHT") graf.push(q);
        else if (p.bip === "SHEET_GUIDE_GRID") outros.push(q);
        else ident.push(q);
      });
      graf.forEach(function (q) { if (q.id === "p:SHEET_WIDTH" || q.id === "p:SHEET_HEIGHT") q.unidade = "mm"; });
      outros.push({ id: "pdf", rotulo: "PDF desta folha", tipo: "botao", rotuloBotao: "Imprimir / PDF", fn: function () { self.pdf([id]); } });
      outros.push({ id: "dxf", rotulo: "DXF desta folha", tipo: "botao", rotuloBotao: "Exportar DXF", fn: function () { self.exportarDxf(id); } });
      outros.push({ id: "atualizar", rotulo: "Modelo mudou?", tipo: "botao", rotuloBotao: "Atualizar vistas", fn: function () { self._desenhos = {}; self.pintar(id); } });
      return {
        daVista: true, semEditarTipo: true, titulo: "Folha: " + this.nomeFolha(a.pr, a.folha), icone: "prancha",
        secoes: [{ nome: "Gráficos", params: graf }, { nome: "Dados de identidade", params: ident }, { nome: "Carimbo (todas as folhas do conjunto)", params: this.paramsCarimbo(a) }, { nome: "Outros", params: outros }],
        onMudar: function (pid, valor) { self._mudarFolha(id, pid, valor); return self.props(id); }
      };
    },
    /* o carimbo é do CONJUNTO (as folhas do registro): modelo, código-base e os dados do projeto. Empresa,
       CNPJ, RT e registro vêm do cadastro da conta (⚙ Empresa) — não se digitam aqui */
    paramsCarimbo: function (a) {
      var c = a.pr.carimbo || {};
      return [
        { id: "c:modelo", rotulo: "Modelo de carimbo", tipo: "lista", valor: c.modelo, opcoes: PR().MODELOS_CARIMBO.map(function (m) { return { id: m.id, rotulo: m.nome }; }) },
        { id: "c:codigo", rotulo: "Código-base (código-nn)", tipo: "texto", valor: c.codigo },
        { id: "c:obra", rotulo: "Obra", tipo: "texto", valor: c.obra },
        { id: "c:proprietario", rotulo: "Proprietário", tipo: "texto", valor: c.proprietario },
        { id: "c:contratante", rotulo: "Contratante", tipo: "texto", valor: c.contratante },
        { id: "c:local", rotulo: "Local", tipo: "texto", valor: c.local },
        { id: "c:data", rotulo: "Data do carimbo", tipo: "texto", valor: c.data }
      ];
    },
    mudarCarimbo: function (id, campo, valor) {
      var a = this.achar(id); if (!a) return false;
      var CAMPOS = { modelo: 1, codigo: 1, obra: 1, proprietario: 1, contratante: 1, local: 1, data: 1 };
      if (!CAMPOS[campo]) return false;
      var pr = PR().normalizar(a.reg);
      pr.carimbo[campo] = campo === "modelo" ? (valor === "simples" ? "simples" : "RA") : String(valor == null ? "" : valor);
      pr.id = a.reg.id; pr.obraId = a.reg.obraId; pr.criadoEm = a.reg.criadoEm;
      if (!this.salvarRegistro(pr)) return false;
      this._repintarTodas(); this._renomearAbas();
      var cf = PR().conferir(pr);
      if (campo === "modelo" && !cf.ok) toast(cf.fora.length + " vista(s) ficaram fora da área de desenho com o carimbo novo: arraste para dentro ou use Gerar pranchas.", "aviso");
      return true;
    },
    /* o nome das abas e do Navegador acompanha número/nome das folhas */
    _renomearAbas: function () {
      var self = this, g = this.G(), st = g && g._bimVxEst && g._bimVxEst(); if (!st) return;
      st.lista.forEach(function (v) { if (v.tipo !== "folha") return; var b = self.achar(v.id); if (b) v.nome = "Folha: " + self.nomeFolha(b.pr, b.folha); });
      try { g._bimVxDocs(); } catch (e) {}
      try { g._nivArvore(); } catch (e2) {}
    },
    _mudarFolha: function (id, pid, valor) {
      if (/^c:/.test(String(pid))) { this.mudarCarimbo(id, String(pid).slice(2), valor); return; }
      var a = this.achar(id); if (!a) return;
      var f = clone(a.folha), mapa = { "p:SHEET_NAME": "conteudo", "p:SHEET_NUMBER": "numero", "p:SHEET_ISSUE_DATE": "dataEmissao", "p:SHEET_DESIGNED_BY": "projetadoPor",
        "p:SHEET_DRAWN_BY": "desenhadoPor", "p:SHEET_CHECKED_BY": "verificadoPor", "p:SHEET_APPROVED_BY": "aprovadoPor", "p:SHEET_SCHEDULED": "apareceNaLista" };
      if (mapa[pid]) f[mapa[pid]] = pid === "p:SHEET_SCHEDULED" ? !!valor : String(valor == null ? "" : valor);
      else if (pid === "p:SHEET_GUIDE_GRID") f.eixoGuia = +valor >= 5 ? { espaco: +valor } : null;
      else return;
      this.gravarFolha(a, f); this.pintar(id);
      /* o nome da aba e do Navegador seguem o número/nome da folha */
      var g = this.G(), v = g && g._bimVxAchar(id), b = this.achar(id);
      if (v && b) { v.nome = "Folha: " + this.nomeFolha(b.pr, b.folha); try { g._bimVxDocs(); g._nivArvore(); } catch (e) {} }
    },
    propsViewport: function (id, ix) {
      var self = this, a = this.achar(id), b = a && a.folha.blocos[ix]; if (!b) return null;
      if (b.tipo !== "viewport") return { daVista: true, semEditarTipo: true, titulo: b.titulo || b.tipo, icone: "prancha", secoes: [{ nome: "Bloco", params: [{ id: "tirar", rotulo: "Bloco", tipo: "botao", rotuloBotao: "Retirar da folha", fn: function () { self.removerSelecionado(); } }] }] };
      return {
        daVista: true, semEditarTipo: true, titulo: "Viewport: " + b.tituloVista, icone: "planta",
        secoes: [
          { nome: "Gráficos", params: [
            { id: "escala", rotulo: "Escala da vista", leitura: true, valor: "1:" + b.escala, motivo: "A escala é da VISTA (Propriedades da planta/corte): mudou lá, muda aqui." },
            { id: "numeroDetalhe", rotulo: "Número de detalhe", tipo: "texto", valor: b.numeroDetalhe },
            { id: "tituloVista", rotulo: "Título na folha", tipo: "texto", valor: b.tituloVista },
            { id: "mostrarTitulo", rotulo: "Mostrar título", tipo: "sim-nao", valor: b.mostrarTitulo !== false } ] },
          { nome: "Extensões", params: [
            { id: "recorte", rotulo: "Região de recorte", leitura: true, valor: b.recorte ? "ativa" : "a vista inteira" },
            { id: "tam", rotulo: "Quadro no papel", leitura: true, valor: Math.round(b.w) + " × " + Math.round(b.h) + " mm" } ] },
          { nome: "Vista", params: [
            { id: "ativar", rotulo: "Editar a vista", tipo: "botao", rotuloBotao: "Ativar vista", fn: function () { self.ativarVista(b.vistaId); } },
            { id: "tirar", rotulo: "Folha", tipo: "botao", rotuloBotao: "Retirar da folha", fn: function () { self.removerSelecionado(); } } ] }
        ],
        onMudar: function (pid, valor) {
          var a2 = self.achar(id); if (!a2 || !a2.folha.blocos[ix]) return null;
          var f = clone(a2.folha), bb = f.blocos[ix];
          if (pid === "numeroDetalhe") {
            var v = String(valor || "").trim(), rep = f.blocos.some(function (o, k) { return k !== ix && o.tipo === "viewport" && o.numeroDetalhe === v; });
            if (rep) { toast("O número de detalhe " + v + " já existe nesta folha.", "aviso"); return self.propsViewport(id, ix); }
            bb.numeroDetalhe = v;
          } else if (pid === "tituloVista") bb.tituloVista = String(valor || "");
          else if (pid === "mostrarTitulo") bb.mostrarTitulo = !!valor;
          self.gravarFolha(a2, f); self.pintar(id);
          return self.propsViewport(id, ix);
        }
      };
    },

    /* --------------------------------------------- revisões do projeto */
    editarRevisoes: function () {
      var self = this, p = this.projeto();
      function linha(r, i) {
        return '<tr data-rv-i="' + i + '"><td><input data-f="numero" value="' + esc(r.numero) + '" style="width:54px"></td><td><input data-f="data" value="' + esc(r.data) + '" style="width:90px"></td>' +
          '<td><input data-f="descricao" value="' + esc(r.descricao) + '" style="width:220px"></td><td><input data-f="emitidoPor" value="' + esc(r.emitidoPor) + '" style="width:110px"></td>' +
          '<td><input data-f="emitidoPara" value="' + esc(r.emitidoPara) + '" style="width:110px"></td><td style="text-align:center"><input type="checkbox" data-f="emitida"' + (r.emitida ? " checked" : "") + "></td></tr>";
      }
      function corpo() {
        return '<p class="muted" style="font-size:12px;margin:0 0 8px">As revisões são do PROJETO (valem para todas as folhas da obra). Em cada folha, Propriedades › Revisões na folha diz quais aparecem no carimbo; a última é a Revisão atual.</p>' +
          '<table class="tbl" style="font-size:12px"><thead><tr><th>Número</th><th>Data</th><th>Descrição</th><th>Emitido por</th><th>Emitido para</th><th>Emitida</th></tr></thead><tbody id="pv-revs">' +
          p.revisoes.map(linha).join("") + '</tbody></table><button class="btn sm" id="pv-rev-nova" style="margin-top:8px">+ Revisão</button>';
      }
      function ler() {
        [].forEach.call(document.querySelectorAll("#pv-revs tr[data-rv-i]"), function (tr) {
          var r = p.revisoes[+tr.getAttribute("data-rv-i")]; if (!r) return;
          [].forEach.call(tr.querySelectorAll("[data-f]"), function (i) { var k = i.getAttribute("data-f"); r[k] = k === "emitida" ? i.checked : i.value; });
        });
      }
      global.UI.modal("Revisões e emissões do projeto", corpo(), [
        { texto: "Salvar", classe: "primary", onClick: function () { ler(); self.gravarProjeto(p); global.UI.fecharModal(); self._repintarTodas(); toast(p.revisoes.length + " revisão(ões) no projeto.", "ok"); } },
        { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
      var bt = document.getElementById("pv-rev-nova");
      if (bt) bt.onclick = function () {
        ler();
        var n = p.revisoes.length;
        p.revisoes.push(PR().revisao({ id: "rev" + Date.now().toString(36), numero: "R" + ("0" + n).slice(-2), data: new Date().toLocaleDateString("pt-BR") }, n));
        var tb = document.getElementById("pv-revs"); if (tb) tb.innerHTML = p.revisoes.map(linha).join("");
      };
    },
    escolherRevisoes: function (id) {
      var self = this, a = this.achar(id), p = this.projeto(); if (!a) return;
      if (!p.revisoes.length) { toast("O projeto ainda não tem revisões: Vista › Revisões.", "aviso"); this.editarRevisoes(); return; }
      var h = p.revisoes.map(function (r) { return '<label style="display:block;font-size:12.5px;padding:3px 0"><input type="checkbox" data-pv-rev="' + esc(r.id) + '"' + (a.folha.revisoes.indexOf(r.id) >= 0 ? " checked" : "") + "> <b>" + esc(r.numero) + "</b> · " + esc(r.data) + " · " + esc(r.descricao) + "</label>"; }).join("");
      global.UI.modal("Revisões na folha " + PR().numeroFolha(a.pr, a.folha), h, [
        { texto: "Aplicar", classe: "primary", onClick: function () {
          var ids = [].slice.call(document.querySelectorAll("[data-pv-rev]")).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-pv-rev"); });
          self.definirRevisoes(id, ids); global.UI.fecharModal();
        } }, { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
    },
    definirRevisoes: function (id, ids) {
      var a = this.achar(id); if (!a) return false;
      var f = clone(a.folha); f.revisoes = arr(ids).map(String);
      this.gravarFolha(a, f); this.pintar(id); this._pintarProps();
      return true;
    },
    _repintarTodas: function () { var self = this; Object.keys(this._telas).forEach(function (k) { self.pintar(k); }); this._pintarProps(); },

    /* --------------------------------------------- listas (folhas, vistas) */
    vistas2d: function () {
      var b2 = B2(); if (!b2) return [];
      try { var g = this.G(); if (g && g._d2Config) g._d2Config(); } catch (e) {}
      var L = [];
      b2.niveis().forEach(function (n) { var id = b2.idPlanta(n.id); L.push({ id: id, nome: "Planta baixa — " + n.nome, tipo: "Planta de piso", escala: b2.estilo(id).escala }); });
      b2.cortes().forEach(function (c) { var id = b2.idCorte(c.id); L.push({ id: id, nome: "Corte " + c.letra, tipo: "Corte", escala: b2.estilo(id).escala }); });
      return L;
    },
    tabela: function (qual) {
      var regs = this.registros();
      if (qual === "folhas") return PR().listaFolhas(regs, this.projeto());
      if (qual === "vistas") return PR().listaVistas(this.vistas2d(), regs);
      return PR().tabelaRevisoes(this.projeto(), regs);
    },
    mostrarLista: function (qual) {
      var self = this, t = this.tabela(qual), g = this.G(), st = g && g._bimVxEst(), fa = st && this.ehFolha(st.ativa) ? st.ativa : null;
      var h = '<table class="tbl" style="font-size:12px"><thead><tr>' + t.cabecalho.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        (t.linhas.length ? t.linhas.map(function (l) { return "<tr>" + l.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") : '<tr><td colspan="' + t.cabecalho.length + '" class="muted">Nada ainda.</td></tr>') + "</tbody></table>";
      var bts = [];
      if (fa) bts.push({ texto: "Pôr na folha aberta", classe: "primary", onClick: function () { self.inserirTabela(fa, t); global.UI.fecharModal(); } });
      bts.push({ texto: "Fechar", onClick: function () { global.UI.fecharModal(); } });
      global.UI.modal(t.titulo.charAt(0) + t.titulo.slice(1).toLowerCase(), h, bts);
      return t;
    },
    inserirTabela: function (id, t) {
      var a = this.achar(id); if (!a) return false;
      var ar = a.geo.area, f = clone(a.folha), w = Math.min(ar.w, 40 * t.cabecalho.length);
      f.blocos.push(PR().blocoDeLista(t, ar.x + ar.w - w, ar.y + 6, w));
      this.gravarFolha(a, f); this.pintar(id);
      status(t.titulo + " posta na folha (canto superior direito da área de desenho).");
      return true;
    },

    /* --------------------------------------------- saída: DXF, DWG, PDF */
    _baixar: function (nome, texto, tipo) {
      this._ultimoArquivo = { nome: nome, texto: texto, tamanho: texto.length };
      try {
        var url = URL.createObjectURL(new Blob([texto], { type: tipo || "application/dxf" })), a = document.createElement("a");
        a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      } catch (e) {}
    },
    /* DXF da aba ativa: folha → a folha em mm; planta/corte → a vista 1:1 em metros */
    exportarDxf: function (id) {
      var X = global.BimDxf; if (!X) { toast("O módulo de DXF não carregou.", "erro"); return null; }
      var g = this.G(), st = g && g._bimVxEst(); id = id || (st && st.ativa);
      try {
        if (this.ehFolha(id)) {
          var a = this.achar(id); if (!a) return null;
          var vps = {}, self = this;
          a.folha.blocos.forEach(function (b) { if (b.tipo === "viewport") { var dz = self.desenho(b.vistaId); if (dz) vps[b.vistaId] = { dados: dz.dados, estilo: dz.estilo, vb: dz.vb, svgSemTitulo: dz.svg }; } });
          var logoConta = null; try { logoConta = global.Empresa && global.Empresa.logo ? global.Empresa.logo() : null; } catch (eL) {}
          var doc = X.daFolha(a.pr, a.folha, a.geo, vps, { projeto: this.projeto(), empresa: this.empresaDados(), logo: !!logoConta });
          var nome = PR().nomeArquivo(a.pr, a.folha, this.projeto(), "dxf");
          this._baixar(nome, X.escrever(doc));
          toast("DXF da folha: " + nome + " (" + doc.ordem.length + " camadas, papel " + a.geo.papel.w + " × " + a.geo.papel.h + " mm)." + (doc.avisos.length ? " " + doc.avisos.join("; ") + "." : ""), doc.avisos.length ? "aviso" : "ok");
          return { nome: nome, camadas: doc.ordem.slice() };
        }
        if (B2() && B2().ehVista2d(id)) {
          var dz2 = this.desenho(id, true); if (!dz2) { toast("Não consegui desenhar a vista.", "erro"); return null; }
          var doc2 = X.daVista(dz2.dados, dz2.estilo, { titulo: dz2.nome });
          var nome2 = String(dz2.nome).replace(/[\\\/:*?"<>|]+/g, "-") + " - 1-" + dz2.escala + ".dxf";
          this._baixar(nome2, X.escrever(doc2));
          toast("DXF da vista: " + nome2 + " (1:1 em metros, " + doc2.ordem.length + " camadas por categoria, cotas medem de novo no AutoCAD).", "ok");
          return { nome: nome2, camadas: doc2.ordem.slice() };
        }
      } catch (e) { toast("Não consegui gerar o DXF: " + (e && e.message || e), "erro"); return null; }
      toast("Abra uma folha, uma planta ou um corte para exportar em DXF.", "aviso");
      return null;
    },
    exportarDwg: function () {
      var X = global.BimDxf, m = X && X.DWG ? X.DWG.motivo : "Use o DXF.";
      global.UI.modal("DWG", '<p style="font-size:13px;line-height:1.5">' + esc(m) + '</p><p class="muted" style="font-size:12px">No AutoCAD: abra o DXF e use Salvar como → DWG. As camadas, as espessuras e as cotas vão junto.</p>',
        [{ texto: "Exportar DXF", classe: "primary", onClick: function () { global.UI.fecharModal(); BimFolhaUI.exportarDxf(); } }, { texto: "Fechar", onClick: function () { global.UI.fecharModal(); } }]);
      return false;
    },
    /* PDF em lote: as folhas escolhidas num documento só, cada uma no papel dela
       (@page com nome por tamanho), com o nome automático no título — o "Salvar
       como PDF" do navegador propõe esse nome */
    pdf: function (ids) {
      var self = this, itens = [], projeto = this.projeto();
      arr(ids).forEach(function (id) { var a = self.achar(id); if (a) itens.push(a); });
      if (!itens.length) { toast("Nenhuma folha para imprimir.", "aviso"); return null; }
      var paginas = {}, css = "", corpo = "";
      itens.forEach(function (a) {
        var P = a.geo.papel, nm = "p" + P.w + "x" + P.h;
        if (!paginas[nm]) { paginas[nm] = 1; css += "@page " + nm + "{size:" + P.w + "mm " + P.h + "mm;margin:0}"; }
        var rec = self.recursos(a, false); rec.projeto = projeto;
        corpo += '<div style="page:' + nm + '">' + UI2().folha(a.pr, a.folha, rec, a.geo) + "</div>";
      });
      var titulo = itens.length === 1 ? PR().nomeArquivo(itens[0].pr, itens[0].folha, projeto, "pdf") : PR().nomeArquivoLote(itens[0].pr, itens.map(function (a) { return a.folha; }), "pdf");
      titulo = titulo.replace(/\.pdf$/, "");
      var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo) + "</title><style>" + css +
        "html,body{margin:0;padding:0;background:#fff}.folha{page-break-after:always;break-after:page}div:last-child>.folha{page-break-after:auto;break-after:auto}" +
        "@media screen{body{background:#666}.folha{margin:10px auto;box-shadow:0 2px 12px rgba(0,0,0,.4)}}</style></head><body>" + corpo + "</body></html>";
      this._ultimoArquivo = { nome: titulo + ".pdf", texto: html, tamanho: html.length };
      /* a janela abre depois de montar (tudo aqui é síncrono: continua no mesmo clique) */
      var jan = global.open("", "_blank");
      if (!jan) { toast("O navegador bloqueou a janela do PDF. Permita pop-ups para o OrçaPRO.", "erro"); return null; }
      jan.document.open(); jan.document.write(html); jan.document.close();
      setTimeout(function () { try { jan.focus(); jan.print(); } catch (e) {} }, 700);
      return { titulo: titulo, folhas: itens.length };
    },
    pdfLote: function () {
      var self = this, regs = this.registros().filter(function (r) { return r.origem === "folhas" || arr(r.folhas).some(function (f) { return arr(f.blocos).some(function (b) { return b.tipo === "viewport"; }); }); });
      var itens = [];
      regs.forEach(function (r) { var pr = PR().normalizar(r); pr.folhas.forEach(function (f) { itens.push({ id: self.idFolha(r.id, f.id), rot: self.nomeFolha(pr, f), arq: PR().nomeArquivo(pr, f, self.projeto(), "pdf") }); }); });
      if (!itens.length) { toast("Nenhuma folha ainda: Vista › Folha.", "aviso"); return null; }
      global.UI.modal("PDF em lote", '<p class="muted" style="font-size:12px;margin:0 0 6px">As folhas marcadas saem num documento só, cada uma no tamanho do papel dela. Nome automático: número - nome - revisão.</p>' +
        itens.map(function (it) { return '<label style="display:block;font-size:12.5px;padding:2px 0"><input type="checkbox" checked data-pv-lote="' + esc(it.id) + '"> ' + esc(it.rot) + ' <span class="muted">(' + esc(it.arq) + ")</span></label>"; }).join(""),
        [{ texto: "Imprimir / PDF", classe: "primary", onClick: function () {
          var ids = [].slice.call(document.querySelectorAll("[data-pv-lote]")).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-pv-lote"); });
          global.UI.fecharModal(); self.pdf(ids);
        } }, { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
      return itens;
    },
    /* posicionar sem arrastar (toque, teclado): escolhe a vista numa lista */
    escolherVista: function () {
      var self = this, g = this.G(), st = g && g._bimVxEst(), id = st && st.ativa;
      if (!this.ehFolha(id)) { toast("Abra uma folha primeiro (Navegador › Folhas ou Vista › Folha).", "aviso"); return; }
      var vs = this.vistas2d(); if (!vs.length) { toast("Nenhuma planta ou corte ainda.", "aviso"); return; }
      global.UI.modal("Posicionar vista", vs.map(function (v) { return '<label style="display:block;font-size:12.5px;padding:3px 0"><input type="radio" name="pv-vs" value="' + esc(v.id) + '"> ' + esc(v.nome) + " · 1:" + esc(v.escala) + "</label>"; }).join(""),
        [{ texto: "Posicionar", classe: "primary", onClick: function () { var r = document.querySelector('input[name="pv-vs"]:checked'); global.UI.fecharModal(); if (r) self.posicionar(id, r.value); } },
         { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
    },

    /* --------------------------------------------- GERAR PRANCHAS (o jogo num clique)
     * Quem decide é o motor (js/prancha.js gerarJogo: agrupamento, escala,
     * posição, número, idempotência); aqui só a fiação: as vistas do modelo
     * aberto, a escala do Padrão de detalhamento da empresa, aplicar a escala
     * escolhida NA VISTA (a escala é da vista: o viewport acompanha) e gravar.
     * Duas passadas: a 1ª escolhe a escala com folga (o desenho cresce um
     * pouco ao mudar de escala — textos e cotas são em mm de papel); a 2ª mede
     * o desenho já na escala escolhida e posiciona exato. */
    vistasParaGerar: function () {
      var b2 = B2(), M = global.BimModeloVista, itens = []; if (!b2) return [];
      try { var g = this.G(); if (g && g._d2Config) g._d2Config(); } catch (e0) {}
      try { if (M && M.ativo && M.ativo() && M.itensVistas) itens = M.itensVistas(); } catch (e) { itens = []; }
      if (!itens.length) itens = this.vistas2d().map(function (v) { return { id: v.id, tipo: v.tipo === "Corte" ? "corte" : "planta", nome: v.nome, disciplina: "arquitetura" }; });
      var niv = {}; try { b2.niveis().forEach(function (n, i) { niv[n.nome] = i; }); } catch (e2) {}
      var TIPO = { planta: "planta", forro: "planta", estrutural: "planta", corte: "corte", elevacao: "elevacao" };
      return itens.filter(function (it) { return TIPO[it.tipo]; }).map(function (it) {
        return { id: it.id, nome: it.nome, tipo: TIPO[it.tipo], tipoVista: it.tipo, disciplina: it.disciplina || "arquitetura", nivel: it.nivel || "", ordem: niv[it.nivel] != null ? niv[it.nivel] : 0 };
      });
    },
    /* a escala do Padrão de detalhamento da empresa: planta de fôrma / corte de fôrma (1:50) */
    escalaPadrao: function (tipo) {
      var P = global.PadraoDet, e = null;
      try { e = P ? P.ler(this.empresa()).escalas : null; } catch (x) { e = null; }
      var n = parseInt(String((e && (tipo === "planta" ? e.planta_forma : e.corte_forma)) || "1:50").split(":")[1], 10);
      return n > 0 ? n : 50;
    },
    /* a escala é travada quando um modelo de vista manda nela (não se muda por fora) */
    escalaTravada: function (id) {
      var M = global.BimModeloVista; if (!M || !M.ativo || !M.ativo()) return false;
      try { var v = M.estado().vistas[id]; if (!v) return false; var ef = M.efetivo(v, M.estado()); return !!(ef.travados && ef.travados.escala); } catch (e) { return false; }
    },
    definirEscala: function (id, esc) {
      var b2 = B2(), M = global.BimModeloVista; if (!b2 || this.escalaTravada(id)) return false;
      try {
        b2.estilo(id);
        b2.estado().estilos[id].escala = esc;
        if (M && M.ativo && M.ativo()) { var v = M.vistaObj(id, b2.def(id)); if (v) v.escala = esc; }
        b2._gravar();
      } catch (x) { return false; }
      delete this._desenhos[id];
      try { if (b2._cache[id]) b2.redesenhar(id, false); } catch (e2) {}
      return true;
    },
    gerar: function (opts) {
      opts = opts || {};
      if (!this.ativo()) return null;
      var self = this, PRm = PR(), b2 = B2(), g = this.G();
      var todas = this.vistasParaGerar(), ids = opts.vistas ? opts.vistas.map(String) : null;
      var escolhidas = todas.filter(function (v) { return !ids || ids.indexOf(v.id) >= 0; });
      if (!escolhidas.length) { toast("Nenhuma vista para pôr em folha: crie as plantas, os cortes ou as elevações (Navegador › Vistas).", "aviso"); return null; }
      var reg = this.conjunto(opts.formato), formato = PRm.FORMATOS[opts.formato] ? opts.formato : (reg.formato || "A1");
      var outras = this.registros().filter(function (r) { return !reg.id || String(r.id) !== String(reg.id); });
      function vistas(fixas) {
        return escolhidas.filter(function (v) { return !fixas || fixas[v.id]; }).map(function (v) {
          var trav = self.escalaTravada(v.id), dz = self.desenho(v.id, true), esc = fixas ? fixas[v.id] : self.escalaPadrao(v.tipo);
          if (trav) { try { esc = b2.estilo(v.id).escala; } catch (e) {} }
          return { id: v.id, nome: dz ? dz.nome : v.nome, tipo: v.tipo, disciplina: v.disciplina, ordem: v.ordem, escala: esc, fixa: !!fixas || trav,
                   caixa: dz ? { w: dz.vb.w, h: dz.vb.h } : null };
        });
      }
      var r1 = PRm.gerarJogo({ formato: formato, base: reg, vistas: vistas(null), outras: outras, folga: 0.9 });
      Object.keys(r1.escalas).forEach(function (id) { var e0 = null; try { e0 = b2.estilo(id).escala; } catch (e) {} if (e0 !== r1.escalas[id]) self.definirEscala(id, r1.escalas[id]); });
      var r = PRm.gerarJogo({ formato: formato, base: reg, vistas: vistas(r1.escalas), outras: outras, folga: 1 });
      r.puladas = r1.puladas.concat(r.puladas);
      var pr = r.prancha; pr.id = reg.id; pr.obraId = reg.obraId; pr.criadoEm = reg.criadoEm;
      if (!pr.id) delete pr.id;
      var salvo = this.salvarRegistro(pr); if (!salvo) return null;
      this._repintarTodas(); this._renomearAbas();
      var primeira = pr.folhas.filter(function (f) { return !!f.auto; })[0];
      if (primeira && opts.abrir !== false) this.abrir(this.idFolha(salvo.id, primeira.id));
      var msg = "Pranchas geradas em " + formato + ": " + r.criadas + " folha(s) nova(s), " + r.atualizadas + " atualizada(s)" + (r.puladas.length ? "; fora: " + r.puladas.map(function (p) { return p.nome + " (" + p.motivo + ")"; }).join("; ") : "") + ".";
      toast(msg, r.puladas.length ? "aviso" : "ok"); status(msg);
      return { ok: true, id: salvo.id, criadas: r.criadas, atualizadas: r.atualizadas, puladas: r.puladas, escalas: r1.escalas, folhas: pr.folhas.length, conferir: PRm.conferir(pr) };
    },
    /* a pergunta mínima: o formato e quais vistas (todas marcadas) */
    abrirGerar: function () {
      if (!this.ativo()) return false;
      var self = this, vs = this.vistasParaGerar(), reg = this.registros().filter(function (r) { return r.origem === "folhas"; })[0], f0 = (reg && reg.formato) || "A1";
      if (!vs.length) { toast("Nenhuma planta, corte ou elevação ainda: abra o modelo da obra e crie as vistas (Navegador › Vistas).", "aviso"); return false; }
      var DISC = { arquitetura: "Arquitetura", estrutural: "Estrutural", hidraulica: "Hidráulica", eletrica: "Elétrica", mecanica: "Mecânica", coordenacao: "Coordenação" };
      var TIPO = { planta: "planta", corte: "corte", elevacao: "elevação" };
      var h = '<p class="muted" style="font-size:12px;margin:0 0 8px">Uma folha por planta; os cortes e as elevações juntos. Escala do Padrão de detalhamento (1:50) ou a maior que couber; carimbo do escritório; numeração código-nn. Gerar de novo <b>atualiza</b> as mesmas folhas (não duplica) e não mexe nas folhas feitas à mão.</p>' +
        '<label style="font-size:12.5px">Formato <select id="pv-ger-formato">' + ["A0", "A1", "A2", "A3", "A4"].map(function (f) { return '<option value="' + f + '"' + (f === f0 ? " selected" : "") + ">" + f + "</option>"; }).join("") + "</select></label>" +
        '<div style="margin-top:8px;max-height:46vh;overflow:auto">' + vs.map(function (v) {
          return '<label style="display:block;font-size:12.5px;padding:2px 0"><input type="checkbox" checked data-pv-ger="' + esc(v.id) + '"> ' + esc(v.nome) + ' <span class="muted">(' + esc(DISC[v.disciplina] || v.disciplina) + " · " + esc(TIPO[v.tipo] || v.tipo) + ")</span></label>";
        }).join("") + "</div>";
      global.UI.modal("Gerar pranchas", h, [
        { texto: "Gerar", classe: "primary", onClick: function () {
          var fm = (document.getElementById("pv-ger-formato") || {}).value || f0;
          var ids = [].slice.call(document.querySelectorAll("[data-pv-ger]")).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-pv-ger"); });
          global.UI.fecharModal();
          if (!ids.length) { toast("Marque ao menos uma vista.", "aviso"); return; }
          self.gerar({ formato: fm, vistas: ids });
        } },
        { texto: "Cancelar", onClick: function () { global.UI.fecharModal(); } }]);
      return true;
    },
    /* "Pranchas" (barra de título): onde ficam as folhas e o que fazer com elas */
    painel: function () {
      if (!this.ativo()) return false;
      var self = this, itens = [];
      this.registros().forEach(function (r) { var pr = PR().normalizar(r); pr.folhas.forEach(function (f) { itens.push({ id: self.idFolha(r.id, f.id), rot: self.nomeFolha(pr, f), formato: pr.formato, modelo: pr.carimbo.modelo }); }); });
      var h = '<p class="muted" style="font-size:12px;margin:0 0 8px">As pranchas do projeto também ficam no <b>Navegador de projeto › Folhas (todas)</b> e na fita <b>Vista › Composição da folha</b>.</p>' +
        (itens.length ? itens.map(function (it) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px"><span style="flex:1">' + esc(it.rot) + ' <span class="muted">' + esc(it.formato) + (it.modelo === "RA" ? " · carimbo RA" : "") + '</span></span><button class="btn sm" data-pv-abrir="' + esc(it.id) + '">Abrir</button></div>';
        }).join("") : '<p style="font-size:13px">Nenhuma folha ainda. <b>Gerar pranchas</b> monta o jogo do modelo aberto — plantas, cortes e elevações — com o carimbo do escritório.</p>');
      global.UI.modal("Pranchas do projeto", h, [
        { texto: "Gerar pranchas", classe: "primary", onClick: function () { global.UI.fecharModal(); self.abrirGerar(); } },
        { texto: "Nova folha", onClick: function () { global.UI.fecharModal(); self.novaFolha(); } },
        { texto: "PDF em lote", onClick: function () { global.UI.fecharModal(); self.pdfLote(); } },
        { texto: "Fechar", onClick: function () { global.UI.fecharModal(); } }]);
      [].forEach.call(document.querySelectorAll("[data-pv-abrir]"), function (b) { b.onclick = function () { global.UI.fecharModal(); self.abrir(b.getAttribute("data-pv-abrir")); }; });
      return true;
    },

    /* --------------------------------------------- Navegador e fita */
    ramoNavegador: function () {
      if (!this.ativo()) return null;
      var self = this, regs = this.registros(), filhos = [], n = 0;
      regs.forEach(function (r) {
        var pr = PR().normalizar(r);
        pr.folhas.forEach(function (f) {
          n++;
          var id = self.idFolha(r.id, f.id);
          filhos.push({ id: "fl:" + id, rotulo: self.nomeFolha(pr, f) + (regs.length > 1 ? " (" + pr.nome + ")" : ""), icone: "prancha", fn: function () { self.abrir(id); } });
        });
      });
      /* as ações ficam À VISTA no nó (o dono não achava onde ficam as pranchas) */
      filhos.unshift({ id: "fl:gerar", rotulo: "Gerar pranchas…", icone: "prancha", fn: function () { self.abrirGerar(); } });
      filhos.push({ id: "fl:nova", rotulo: "+ Nova folha", icone: "prancha", fn: function () { self.novaFolha(); } });
      return { id: "folhas", rotulo: "Folhas (todas)", icone: "prancha", n: n, aberto: true, filhos: filhos };
    },
    registrar: function (reg, G) {
      this._G = G || this._G;
      if (!this.ativo() || !global.BimRibbon) return false;
      var self = this, R = global.BimRibbon;
      R.acrescentar("vista", "Vista", "Composição da folha", [
        { id: "gerar-pranchas", rotulo: "Gerar\npranchas", icone: "prancha", grande: true, dica: "Monta o jogo de folhas do modelo aberto num clique: uma folha por planta, os cortes e as elevações juntos, na escala do Padrão de detalhamento (1:50 ou a que couber), centralizados, com o carimbo do escritório e numeração código-nn. Gerar de novo atualiza as mesmas folhas." },
        { id: "nova-folha", rotulo: "Folha", icone: "prancha", grande: true, dica: "Folha nova (A1, carimbo RA) no conjunto \"Folhas do projeto\" da obra. Arraste uma planta ou um corte do Navegador para dentro dela: a vista entra em ESCALA, em vetor, com o título de vista." },
        { id: "posicionar-vista", rotulo: "Posicionar\nvista", icone: "planta", grande: true, dica: "Escolhe uma planta ou um corte e põe na folha aberta (o mesmo que arrastar do Navegador)." },
        { id: "revisoes-folha", rotulo: "Revisões", icone: "lista", dica: "Revisões e emissões do PROJETO (número, data, descrição, emitido por/para). Cada folha escolhe as dela; a última vira a Revisão atual do carimbo." },
        { id: "lista-folhas", rotulo: "Lista de\nfolhas", icone: "tabela", dica: "A tabela da categoria Folhas: número, nome, revisão atual, data de emissão, desenhado por. Pode ir para a folha aberta." },
        { id: "lista-vistas", rotulo: "Lista de\nvistas", icone: "tabela", dica: "Todas as plantas e cortes, com a escala e a folha/número de detalhe onde estão." }
      ]);
      R.acrescentar("vista", "Vista", "Exportar", [
        { id: "exportar-dxf", rotulo: "DXF", icone: "exportar", grande: true, dica: "DXF da folha aberta (em mm de papel, carimbo completo) ou da planta/corte aberto (1:1 em metros). Camada por categoria (ARQ-PAREDE-CORTE, EST-PILAR-CORTE…), espessura pela pena, cota que o AutoCAD mede de novo." },
        { id: "exportar-dwg", rotulo: "DWG", icone: "exportar", dica: "DWG pelo servidor depende de licença comercial do conversor — por enquanto, use o DXF (o AutoCAD salva em DWG)." },
        { id: "pdf-lote", rotulo: "PDF em\nlote", icone: "imprimir", grande: true, dica: "Várias folhas num PDF só, cada uma no tamanho do papel, com o nome automático (número - nome - revisão)." }
      ]);
      reg["gerar-pranchas"] = function () { return self.abrirGerar(); };
      reg["nova-folha"] = function () { return !!self.novaFolha(); };
      reg["posicionar-vista"] = function () { self.escolherVista(); return true; };
      reg["revisoes-folha"] = function () { self.editarRevisoes(); return true; };
      reg["lista-folhas"] = function () { self.mostrarLista("folhas"); return true; };
      reg["lista-vistas"] = function () { self.mostrarLista("vistas"); return true; };
      reg["exportar-dxf"] = function () { return !!self.exportarDxf(); };
      reg["exportar-dwg"] = function () { self.exportarDwg(); return true; };
      reg["pdf-lote"] = function () { return !!self.pdfLote(); };
      return true;
    },
    /* o Navegador começa o arraste de uma vista (js/bimshell.js, nó com `arrastar`) */
    arrastarInicio: function (ev, vistaId) {
      try { ev.dataTransfer.setData(TIPO_ARRASTE, vistaId); ev.dataTransfer.setData("text/plain", vistaId); ev.dataTransfer.effectAllowed = "copy"; } catch (e) {}
    },
    TIPO_ARRASTE: TIPO_ARRASTE
  };

  global.BimFolhaUI = BimFolhaUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFolhaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimmateriaisui.js — MATERIAIS DO PROJETO: a tela e os ganchos (09/10/2026)
 *
 * Gerenciar › Biblioteca › Materiais do projeto (prévia do modelador,
 * `?previa=modelador`). A tela segue o ROTEIRO-MODULO (js/modulo.js):
 * cabeçalho (Importar da biblioteca RA, Exportar .json, Mais, + Novo material),
 * filtros, indicadores, e o conteúdo em duas colunas — a LISTA (os materiais
 * do projeto e, abaixo, a biblioteca RA só leitura) e o EDITOR do material
 * escolhido com as abas Identidade · Gráficos · Aparência · Físico. Na aba
 * Aparência fica a PRÉVIA numa esfera (ou cubo) com o three r150 do
 * visualizador — rasterização com o ambiente, sem path tracing: troca na hora.
 *
 * Quem decide é o motor puro js/bimmateriais.js; aqui só tela, gravação por
 * obra e os ganchos que os outros módulos chamam:
 *   opcoesProps()      — o campo "Material" de Propriedades (js/bimpropsui.js);
 *   porId(id)          — o nome do material no registro (js/bimparam.js);
 *   renderDe(nome)     — a Aparência no render (js/bimrender.js);
 *   ifcOpts()          — nome, cor e transparência no IFC (js/bim.js → js/ifcsaida.js);
 *   materialDeUid(uid) — o padrão de corte na planta (js/bimmodelovista.js);
 *   densidades()       — a massa no peso das peças (js/gestao.js → js/bimpeso.js);
 *   montar3d(api)      — a cor e a transparência da peça no 3D (js/bim.js).
 *
 * GRAVAÇÃO: Store `bim_materiais`, UM registro plano por material, com obraId
 * (sem lista dentro de lista — a nuvem recusa). A peça guarda só o id
 * (`materialProj`, op `marcar`): aplicar, substituir e Ctrl+Z são do editor.
 * Sem a prévia do modelador, nada daqui aparece: a fita mostra "em breve".
 * ===================================================================== */
(function (global) {
  "use strict";

  var COL = "bim_materiais";
  function M() { return global.BimMateriais || null; }
  function RM() { return global.RenderMat || null; }
  function B() { return global.BIM || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ic(n, t) { try { return global.Icones && global.Icones.get ? global.Icones.get(n, t || 15) : ""; } catch (e) { return ""; } }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function br(v, c) { var n = Number(v); if (!isFinite(n)) return ""; return n.toFixed(c == null ? 2 : c).replace(".", ","); }
  function lerNum(s) { var t = txt(s).trim().replace(/\s/g, ""); if (!t) return null; if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", "."); var n = Number(t); return isFinite(n) ? n : NaN; }

  var ABAS = [{ id: "identidade", rotulo: "Identidade" }, { id: "graficos", rotulo: "Gráficos" }, { id: "aparencia", rotulo: "Aparência" }, { id: "fisico", rotulo: "Físico" }];
  var NOMES_PADRAO = { "": "<Por categoria>", vazio: "Sem preenchimento", solido: "Sólido", cinza: "Cinza claro (poché)", concreto: "Concreto", alvenaria: "Alvenaria",
                       bloco: "Alvenaria de bloco de concreto", terra: "Terra / solo", areia: "Areia", brita: "Brita / lastro", madeira: "Madeira", aco: "Aço",
                       isolamento: "Isolamento", gesso: "Gesso / argamassa", telha: "Telha", vidro: "Vidro" };
  var AP_CAMPOS = [
    ["apRugosidade", "Rugosidade", "0 espelho · 1 fosco", 0.01], ["apMetalicidade", "Metalicidade", "0 não metal · 1 metal", 1], ["apTransmissao", "Transmissão", "luz que atravessa (vidro, água)", 0.01],
    ["apIor", "Índice de refração (IOR)", "vidro 1,52 · água 1,33", 0.01], ["apClearcoat", "Verniz (clearcoat)", "camada de verniz por cima", 0.01], ["apClearcoatRug", "Rugosidade do verniz", "", 0.01],
    ["apRelevo", "Relevo", "intensidade do relevo da textura", 0.01], ["apEscala", "Escala da textura", "1 = a peça da biblioteca", 0.05]
  ];

  var BimMateriaisUI = {
    _G: null, _mem: {}, _cache: null, _sel: null, _aba: "identidade", _busca: "", _filtro: "todos", _forma: "esfera", _THREE: null, _prev: null, _3d: null,

    ativo: function () { return previa() && !!M(); },

    /* ---------------------------------------------------- a fita */
    registrar: function (reg, G) {
      this._G = G || this._G;
      var self = this;
      if (!this.ativo() || !reg) return false;
      reg["materiais-proj"] = function () { self.abrir(); return true; };
      /* 2D: o padrão de corte do material da peça (js/bimmodelovista.js classificar) */
      try { if (global.BimModeloVista) global.BimModeloVista.materialDe = function (uid) { return self.materialDeUid(uid); }; } catch (e) {}
      return true;
    },

    /* ---------------------------------------------------- dados (por obra) */
    obraKey: function () { try { return String((global.Gestao && global.Gestao._bimSel) || (B() && B().obraAtual && B().obraAtual()) || "geral"); } catch (e) { return "geral"; } },
    _eid: function () { try { return global.Auth && global.Auth.empresaId ? global.Auth.empresaId() : null; } catch (e) { return null; } },
    _store: function () { return global.Store && this._eid() ? global.Store : null; },
    lista: function () {
      var ob = this.obraKey();
      if (this._cache && this._cache.k === ob) return this._cache.l;
      var S = this._store(), l = null, Mm = M();
      if (S) { try { l = (S.listar(this._eid(), COL) || []).filter(function (r) { return r && String(r.obraId || "") === ob; }); } catch (e) { l = null; } }
      if (!l) l = (this._mem[ob] || []).slice();
      l = l.map(function (r) { var o = Mm.normalizar(r); o.id = r.id; return o; }).filter(function (r) { return r.id && r.nome; });
      l.sort(function (a, b) { return Mm.chaveNome(a.nome) < Mm.chaveNome(b.nome) ? -1 : 1; });
      this._cache = { k: ob, l: l };
      return l;
    },
    _gravar: function (mat) {
      var ob = this.obraKey(), S = this._store(), ok = false;
      mat.obraId = ob;
      if (!M().plano(mat)) { toast("Material com campo inválido — não gravado.", "erro"); return false; }
      if (S) { try { ok = !!S.salvar(this._eid(), COL, mat); } catch (e) { ok = false; } if (!ok) { toast("Não consegui gravar o material (armazenamento cheio?).", "erro"); return false; } }
      else { var l = this._mem[ob] || (this._mem[ob] = []), i = -1; l.forEach(function (x, k) { if (x.id === mat.id) i = k; }); if (i >= 0) l[i] = mat; else l.push(mat); }
      this._mudou();
      return true;
    },
    _excluir: function (id) {
      var ob = this.obraKey(), S = this._store();
      if (S) { try { S.excluir(this._eid(), COL, id); } catch (e) {} }
      else this._mem[ob] = (this._mem[ob] || []).filter(function (x) { return x.id !== id; });
      this._mudou();
    },
    /* o que depende da lista: o peso, o 3D, a paleta de Propriedades, a cena do render */
    _mudou: function () {
      this._cache = null;
      try { if (global.Gestao) global.Gestao._pesoDensCache = null; } catch (e) {}
      try { if (this._3d) this._3d.refazer(); } catch (e3) {}
      try { if (global.BimPropsUI && global.BimPropsUI.aoMudarModelo) global.BimPropsUI.aoMudarModelo(); } catch (eP) {}
      try { if (global.BimRender) global.BimRender._ext = null; } catch (eR) {}
    },
    porId: function (id) { return id ? M().porId(this.lista(), id) : null; },
    porNome: function (nome) { return M().porNome(this.lista(), nome); },
    estado: function () { try { var e = B() && B().editarEstado ? B().editarEstado() : null; return e ? e.estado : null; } catch (x) { return null; } },

    /* ---------------------------------------------------- ganchos */
    opcoesProps: function () { return M().opcoesProps(this.lista()); },
    renderDe: function (nome) { var m = nome ? this.porNome(nome) : null; return m && RM() ? M().parametrosRender(m, RM(), { nome: m.nome }) : null; },
    ifcOpts: function () { var l = this.lista(); return l.length ? M().ifcOpts(l) : null; },
    materialDeUid: function (uid) {
      var u = txt(uid); if (u.indexOf("edit:") !== 0) return null;
      var st = this.estado(); if (!st) return null;
      var mp = M().materialDasPecas(st)[u.slice(5)];
      return mp ? M().estiloCorte(this.porId(mp)) : null;
    },
    /* a massa pelo NOME do material (a mesma chave do js/bimpeso.js) */
    densidades: function () {
      var o = {}, P = global.BimPeso; if (!P || !P.chaveMaterial) return o;
      this.lista().forEach(function (m) { var d = M().densidade(m); if (d) o[P.chaveMaterial(m.nome)] = d; });
      return o;
    },
    /* nome do material do projeto de cada peça do editor (o render casa por nome) */
    nomesDasPecas: function (st) {
      var o = {}, self = this, mp = M().materialDasPecas(st || this.estado() || {});
      Object.keys(mp).forEach(function (id) { var m = self.porId(mp[id]); if (m) o[id] = m.nome; });
      return o;
    },

    /* ---------------------------------------------------- 3D (js/bim.js, gancho MATERIAIS)
     * api = { THREE, S, edit }. aposRebuild(st, mo): a peça com material do
     * projeto ganha a cor e a transparência dele — material trocado por CÓPIA
     * (a malha mesclada espelha a cor e a opacidade, como nos gráficos de fase). */
    montar3d: function (api) {
      if (!api || !api.THREE) return null;
      var self = this, T = api.THREE, cache = {}, ult = { st: null, mo: null };
      this._THREE = T;
      function aplicar(st, mo) {
        ult.st = st; ult.mo = mo;
        if (!previa() || !mo || !mo.grupo || !M()) return { n: 0 };
        var mp = M().materialDasPecas(st || {}), n = 0;
        mo.grupo.children.forEach(function (m) {
          if (!m.isMesh || !m.material) return;
          if (m.userData._matProjOrig) { m.material = m.userData._matProjOrig; delete m.userData._matProjOrig; delete m.userData.matProj; }
          var id = mp[String(m.userData.expressID)], mat = id ? self.porId(id) : null; if (!mat) return;
          var s = M().sombreamento(mat), orig = m.material, k = orig.uuid + "|" + s.cor + "|" + s.opacidade;
          var c = cache[k];
          if (!c) {
            c = orig.clone();
            if (c.color) c.color.set(s.cor);
            if (c.map) c.map = null;
            if (s.opacidade < 1) { c.transparent = true; c.opacity = s.opacidade; c.depthWrite = false; } else { c.transparent = false; c.opacity = 1; c.depthWrite = true; }
            c.needsUpdate = true; cache[k] = c;
          }
          m.userData._matProjOrig = orig; m.userData.matProj = mat.id; m.material = c; n++;
        });
        self._ult3d = { n: n };
        self._aoMudarModelo();
        return { n: n };
      }
      var ctl = {
        aposRebuild: function (st, mo) { try { return aplicar(st, mo); } catch (e) { return null; } },
        refazer: function () { return ult.mo ? ctl.aposRebuild(ult.st, ult.mo) : null; }
      };
      this._3d = ctl;
      return ctl;
    },

    /* ---------------------------------------------------- ações (gravam e repintam) */
    _resultado: function (r, msg) {
      if (!r || !r.ok) { toast((r && r.erro) || "Não deu.", "aviso"); return null; }
      if (!this._gravar(r.mat)) return null;
      this._sel = r.mat.id;
      if (msg) status(msg);
      this.pintar();
      return r.mat;
    },
    criar: function () { return this._resultado(M().novo(this.lista(), {}, { obraId: this.obraKey() }), "Material novo no projeto."); },
    duplicar: function (id) { var m = this.porId(id); return this._resultado(M().duplicar(this.lista(), m, { obraId: this.obraKey() }), m ? "\"" + m.nome + "\" duplicado." : ""); },
    duplicarRA: function (idRA) { return this._resultado(M().doRA(this.lista(), idRA, RM(), { obraId: this.obraKey(), copia: true }), "Cópia da biblioteca RA no projeto."); },
    importarRA: function (idRA) {
      var mr = RM() && RM().material(idRA), ja = mr ? this.porNome(mr.nome) : null;
      if (ja) { this._sel = ja.id; this.pintar(); status("\"" + ja.nome + "\" já está no projeto."); return ja; }
      return this._resultado(M().doRA(this.lista(), idRA, RM(), { obraId: this.obraKey() }), "Importado da biblioteca RA.");
    },
    alterar: function (id, campos) {
      var r = M().alterar(this.lista(), id, campos, {});
      if (!r.ok) { toast(r.erro, "aviso"); this.pintar(); return r; }
      this._gravar(r.mat); this.pintar();
      return r;
    },
    renomear: function (id, nome) { return this.alterar(id, { nome: nome }); },
    usarBase: function (id, idRA) {
      var r = M().usarBase(this.porId(id), idRA, RM());
      if (!r.ok) { toast(r.erro, "aviso"); return r; }
      this._gravar(r.mat); this.pintar(); status("Aparência a partir de \"" + (RM().material(idRA) || {}).nome + "\".");
      return r;
    },
    apagar: function (id) {
      var m = this.porId(id); if (!m) return { ok: false, erro: "Material não encontrado." };
      var st = this.estado(), p = M().podeApagar(st || {}, id);
      if (!p.ok) { toast(p.erro, "aviso"); return p; }
      this._excluir(id); if (this._sel === id) this._sel = null;
      status("\"" + m.nome + "\" apagado do projeto."); this.pintar();
      return { ok: true };
    },
    /* aplica o material às peças (uma op ou um lote — um Ctrl+Z) */
    _enviar: function (ops, rotulo) {
      var b = B(); if (!b || !ops.length) return false;
      if (ops.length === 1) return b.b2Op ? b.b2Op(ops[0]) : false;
      return b.editarLote ? b.editarLote({ op: "lote", id: "mat-" + Date.now().toString(36), origem: "materiais", pedido: txt(rotulo).slice(0, 300), ops: ops }) : false;
    },
    aplicar: function (ids, id) { return this._enviar(M().opsAplicar(ids, id), "Material do projeto"); },
    substituir: function (de, para) {
      var st = this.estado(), r = M().opsSubstituir(st || {}, de, para, this.lista());
      if (!r.ok) { toast(r.erro, "aviso"); return r; }
      var a = this.porId(de), b = this.porId(para);
      if (!this._enviar(r.ops, "Substituir " + (a ? a.nome : de) + " por " + (b ? b.nome : "<Por categoria>"))) { toast("O editor recusou a troca.", "erro"); return { ok: false, erro: "O editor recusou a troca." }; }
      status(r.n + " peça(s): \"" + (a ? a.nome : de) + "\" virou \"" + (b ? b.nome : "<Por categoria>") + "\" (um Ctrl+Z desfaz tudo).");
      this.pintar();
      return { ok: true, n: r.n };
    },
    exportarTexto: function () { return M().exportar(this.lista(), { obra: this.obraKey() }); },
    exportar: function () {
      var t = this.exportarTexto();
      try {
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "application/json" }));
        a.download = "materiais-do-projeto.json"; document.body.appendChild(a); a.click();
        setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1500);
      } catch (e) { toast("Não consegui gerar o arquivo.", "erro"); }
      status(this.lista().length + " material(is) exportado(s) em .json.");
      return t;
    },
    importarTexto: function (texto) {
      var self = this, r = M().importar(texto, this.lista(), { obraId: this.obraKey() });
      if (!r.ok) { toast(r.erro, "aviso"); return r; }
      r.criar.concat(r.atualizar).forEach(function (m) { self._gravar(m); });
      status(r.criar.length + " novo(s), " + r.atualizar.length + " atualizado(s)" + (r.erros.length ? " · " + r.erros.length + " aviso(s): " + r.erros.slice(0, 2).join("; ") : "") + ".");
      this.pintar();
      return r;
    },

    /* ---------------------------------------------------- a tela */
    _corpo: function () { return typeof document !== "undefined" ? document.getElementById("bim-materiais-corpo") : null; },
    abrir: function () {
      var self = this, G = this._G || global.Gestao;
      if (G && G._bimAbrirPainel) G._bimAbrirPainel("materiais");
      this._cache = null;   /* relê o Store: a nuvem pode ter trazido materiais de outro aparelho */
      this.pintar();
      var R = RM();
      if (R && R.carregar) R.carregar().then(function () { self.pintar(); }, function () { self.pintar(); });
      return true;
    },
    pintar: function () {
      var corpo = this._corpo(); if (!corpo || !M()) return false;
      var self = this, Mm = M(), L = this.lista(), st = this.estado() || {}, cont = Mm.contagem(st), MD = global.Modulo;
      if (this._sel && !Mm.porId(L, this._sel)) this._sel = null;
      if (!this._sel && L.length) this._sel = L[0].id;
      var sel = this._sel ? Mm.porId(L, this._sel) : null;
      var usados = L.filter(function (m) { return cont[m.id] > 0; }).length, semCod = L.filter(function (m) { return !m.codigo; }).length, semMassa = L.filter(function (m) { return !(m.massa > 0); }).length;
      var h = '<div data-mat="tela" class="mat-tela">';
      var bt = function (acao, rot, icone, extra) { return '<button type="button" class="btn sm" data-mat-acao="' + acao + '"' + (extra || "") + ">" + (icone ? ic(icone, 14) + " " : "") + esc(rot) + "</button>"; };
      var cab = { icone: "paleta", titulo: "Materiais do projeto", sub: L.length + " material(is) nesta obra · " + usados + " em uso no modelo",
        acoes: [bt("importar-ra-sel", "Da biblioteca RA", "importar"), bt("exportar", "Exportar .json", "exportar"), bt("importar-json", "Importar .json", "importar"), bt("substituir", "Substituir em todo o modelo", "ciclo")],
        primariaHtml: '<button type="button" class="btn sm primary" data-mat-acao="novo">+ Novo material</button>' };
      h += MD ? MD.cab(cab) : "<h3>Materiais do projeto</h3>";
      var filtros = ['<input type="search" data-mat-busca placeholder="Buscar material" aria-label="Buscar material" value="' + esc(this._busca) + '" style="min-width:150px">',
        '<select data-mat-filtro aria-label="Mostrar">' + [["todos", "Todos"], ["usados", "Usados no modelo"], ["sem-uso", "Sem uso"], ["pendentes", "Código pendente"]].map(function (o) { return '<option value="' + o[0] + '"' + (self._filtro === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"];
      h += MD ? MD.filtros(filtros) : filtros.join(" ");
      h += MD ? MD.kpis([{ rotulo: "Materiais", valor: String(L.length) }, { rotulo: "Em uso", valor: String(usados), sub: "no modelo" }, { rotulo: "Código pendente", valor: String(semCod), tom: semCod ? "alerta" : "" }, { rotulo: "Sem massa", valor: String(semMassa), tom: semMassa ? "alerta" : "" }]) : "";
      h += '<div class="mat-grade" style="display:grid;grid-template-columns:minmax(190px,230px) minmax(0,1fr);gap:16px;align-items:start">';
      h += '<div class="mat-col-lista" style="min-width:0">' + this._listaHtml(L, cont) + "</div>";
      h += '<div class="mat-col-editor" style="min-width:0">' + (sel ? this._editorHtml(sel, cont[sel.id] || 0) : (MD ? MD.vazio({ icone: "paleta", titulo: "Nenhum material no projeto", texto: "Crie um material ou traga um da biblioteca RA.", acaoHtml: '<button type="button" class="btn sm primary" data-mat-acao="novo">+ Novo material</button>' }) : "")) + "</div>";
      h += '</div><input type="file" data-mat-arquivo accept=".json,application/json" hidden></div>';
      corpo.innerHTML = h;
      /* a prévia reaproveita o MESMO canvas (o contexto WebGL dele): repintar a tela não abre outro */
      var novo = corpo.querySelector("[data-mat-prev]");
      if (novo && this._prev && this._prev.canvas !== novo) { novo.parentNode.replaceChild(this._prev.canvas, novo); }
      this._ligar(corpo);
      if (sel && this._aba === "aparencia") this._prevPintar(sel);
      return true;
    },
    _listaHtml: function (L, cont) {
      var self = this, Mm = M(), b = Mm.chaveNome(this._busca), MD = global.Modulo;
      var vis = L.filter(function (m) {
        if (b && Mm.chaveNome(m.nome + " " + m.descricao + " " + m.fabricante).indexOf(b) < 0) return false;
        if (self._filtro === "usados") return cont[m.id] > 0;
        if (self._filtro === "sem-uso") return !(cont[m.id] > 0);
        if (self._filtro === "pendentes") return !m.codigo;
        return true;
      });
      var h = '<table class="tbl" data-mat="lista" style="width:100%"><thead><tr><th>Material</th><th class="num">Peças</th></tr></thead><tbody>';
      vis.forEach(function (m) {
        var at = m.id === self._sel;
        h += '<tr class="lin' + (at ? " ativa" : "") + '" data-mat-sel="' + esc(m.id) + '" tabindex="0" style="cursor:pointer' + (at ? ";background:var(--surface-2)" : "") + '">' +
          '<td><span aria-hidden="true" style="display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid var(--linha);vertical-align:-1px;margin-right:6px;background:' + esc(m.cor) + '"></span>' + esc(m.nome) +
          (m.codigo ? "" : " " + (MD ? MD.pilula("pendente", "alerta") : "")) + '</td><td class="num">' + (cont[m.id] || 0) + "</td></tr>";
      });
      if (!vis.length) h += '<tr><td colspan="2" class="muted">' + (L.length ? "Nada com esse filtro." : "Nenhum material ainda.") + "</td></tr>";
      h += "</tbody></table>";
      /* a biblioteca RA (só leitura): importar ou duplicar */
      var R = RM(), lib = R && R.lista ? R.lista() : [];
      var hl = '<table class="tbl" data-mat="biblioteca-ra" style="width:100%"><tbody>';
      lib.filter(function (x) { return !b || Mm.chaveNome(x.nome).indexOf(b) >= 0; }).forEach(function (x) {
        hl += '<tr data-mat-ra="' + esc(x.id) + '"><td><div>' + esc(x.nome) + '</div><div style="display:flex;gap:4px;margin-top:4px">' +
          '<button type="button" class="btn sm ghost" data-mat-acao="importar-ra" data-ra="' + esc(x.id) + '" title="Trazer para o projeto">Usar</button>' +
          '<button type="button" class="btn sm ghost" data-mat-acao="duplicar-ra" data-ra="' + esc(x.id) + '" title="Criar uma cópia editável no projeto">Duplicar</button></div></td></tr>';
      });
      hl += "</tbody></table>";
      var corpoLib = lib.length ? '<div style="max-height:320px;overflow:auto">' + hl + "</div>" : '<p class="muted" style="margin:0">' + (R ? "Carregando a biblioteca RA…" : "A biblioteca RA não carregou.") + "</p>";
      return (MD ? MD.secao({ titulo: "Do projeto", corpoHtml: h }) + MD.secao({ titulo: "Biblioteca RA", sub: "Só leitura: use ou duplique", corpoHtml: corpoLib, id: "mat-sec-ra" }) : h + corpoLib);
    },
    _campo: function (rot, html, ajuda) {
      return '<label class="mat-campo" style="display:flex;flex-direction:column;gap:2px;font-size:var(--t-peq,12.5px)"><span>' + esc(rot) + "</span>" + html + (ajuda ? '<small class="muted">' + esc(ajuda) + "</small>" : "") + "</label>";
    },
    _inp: function (k, v, extra) { return '<input type="text" data-mat-campo="' + k + '" value="' + esc(v) + '"' + (extra || "") + ">"; },
    _sel2: function (k, v, opcoes) { return '<select data-mat-campo="' + k + '">' + opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"; },
    _editorHtml: function (m, nUso) {
      var self = this, Mm = M(), MD = global.Modulo, h = "";
      var acoes = '<button type="button" class="btn sm" data-mat-acao="duplicar">Duplicar</button>' +
        '<button type="button" class="btn sm" data-mat-acao="renomear">Renomear</button>' +
        '<button type="button" class="btn sm" data-mat-acao="aplicar-sel" title="Põe este material nas peças selecionadas no modelo">Aplicar à seleção</button>' +
        '<button type="button" class="btn sm" data-mat-acao="apagar"' + (nUso ? ' disabled title="Em uso em ' + nUso + ' peça(s): substitua antes de apagar"' : "") + ">Apagar</button>";
      var abas = MD ? MD.abas(ABAS.map(function (a) { return { rotulo: a.rotulo, ativa: a.id === self._aba, attrs: 'data-mat-aba="' + a.id + '"' }; })) : "";
      var c = "";
      if (this._aba === "identidade") {
        var v = Mm.validarCodigo(m.codigo);
        c += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          this._campo("Nome", this._inp("nome", m.nome, ' maxlength="80" data-mat-nome')) +
          this._campo("Classe", this._sel2("classe", m.classe, Mm.CLASSES.map(function (x) { return [x.id, x.nome]; }))) +
          this._campo("Descrição", this._inp("descricao", m.descricao)) + this._campo("Marca", this._inp("marca", m.marca, ' maxlength="24"')) +
          this._campo("Fabricante", this._inp("fabricante", m.fabricante)) + this._campo("Modelo", this._inp("modelo", m.modelo)) +
          this._campo("Código de orçamento (SINAPI)", this._inp("codigo", m.codigo, ' inputmode="numeric" placeholder="vazio = pendente"'), m.codigo ? (v.ok && v.classe && global.SinapiMapa && global.SinapiMapa.classes[v.classe] ? "Classe: " + global.SinapiMapa.classes[v.classe].nome : "") : "Pendente: sem código, o orçamento não casa este material.") +
          this._campo("Comentários", this._inp("comentarios", m.comentarios)) + "</div>";
      } else if (this._aba === "graficos") {
        var pad = [""].concat(Mm.PADROES).map(function (p) { return [p, NOMES_PADRAO[p] || p]; });
        c += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          this._campo("Cor de sombreamento", '<input type="color" data-mat-campo="cor" value="' + esc(m.cor) + '">', m.cor === m.apCor ? "a cor da peça no 3D (segue a cor da Aparência)" : "a cor da peça no 3D") +
          this._campo("Transparência (%)", '<input type="number" min="0" max="100" step="5" data-mat-campo="transparencia" value="' + m.transparencia + '">', "0 opaco · 100 invisível") +
          this._campo("Padrão de superfície", this._sel2("padraoSup", m.padraoSup, pad)) + this._campo("Cor do padrão de superfície", '<input type="color" data-mat-campo="corSup" value="' + esc(m.corSup) + '">') +
          this._campo("Padrão de corte", this._sel2("padraoCorte", m.padraoCorte, pad), "o preenchimento da peça cortada na planta e no corte") +
          this._campo("Cor do padrão de corte", '<input type="color" data-mat-campo="corCorte" value="' + esc(m.corCorte) + '">') + "</div>";
      } else if (this._aba === "aparencia") {
        var R = RM(), lib = R && R.lista ? R.lista() : [], base = m.apBase && R && R.material(m.apBase);
        /* em cima a PRÉVIA e a base; embaixo os números (duas colunas) */
        c += '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-bottom:12px">' +
          '<canvas data-mat-prev width="240" height="180" role="img" aria-label="Prévia do material" style="width:240px;height:180px;border-radius:var(--raio,8px);border:1px solid var(--linha);display:block;background:var(--surface-2);flex:none"></canvas>' +
          '<div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:8px">' +
          '<div style="display:flex;gap:6px">' + [["esfera", "Esfera"], ["cubo", "Cubo"]].map(function (f) { return '<button type="button" class="btn sm' + (self._forma === f[0] ? " primary" : "") + '" data-mat-acao="forma" data-forma="' + f[0] + '">' + f[1] + "</button>"; }).join("") + "</div>" +
          this._campo("Usar como base (biblioteca RA)", '<select data-mat-acao-base>' + '<option value="">' + esc(base ? base.nome : "— escolha —") + "</option>" + lib.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nome) + "</option>"; }).join("") + "</select>", base ? "Base atual: " + base.nome + " (textura e óptica)" : "Sem base: os números são só os daqui") +
          this._campo("Cor base", '<input type="color" data-mat-campo="apCor" value="' + esc(m.apCor) + '">') +
          '<p class="muted" style="font-size:var(--t-micro,11px);margin:0" data-mat-prev-txt>' + (this._THREE ? "Prévia rápida (sem simulação da luz); o render final usa estes números." : "Abra o 3D para ver a prévia.") + "</p>" +
          '</div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">';
        AP_CAMPOS.forEach(function (f) {
          var fx = Mm.FAIXA[f[0]];
          c += self._campo(f[1], '<span style="display:flex;gap:6px;align-items:center"><input type="range" data-mat-campo="' + f[0] + '" min="' + fx[0] + '" max="' + fx[1] + '" step="' + f[3] + '" value="' + m[f[0]] + '" style="flex:1;min-width:0"><output data-mat-out="' + f[0] + '" style="min-width:36px;text-align:right;font-variant-numeric:tabular-nums">' + br(m[f[0]], 2) + "</output></span>", f[2]);
        });
        c += "</div>";
      } else {
        c += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          this._campo("Massa específica (kg/m³)", '<input type="text" inputmode="decimal" data-mat-campo="massa" value="' + (m.massa > 0 ? br(m.massa, 1) : "") + '" placeholder="vazio = sem massa">', m.massa > 0 ? "Fonte: " + (m.massaRef || "informado pelo usuário") : "Sem massa a peça não entra no peso (içamento) por este material.") +
          this._campo("Peso específico", '<input type="text" readonly value="' + (m.massa > 0 ? br(m.massa * 9.80665 / 1000, 2) + " kN/m³" : "—") + '">', "massa × g (9,80665 m/s²)") +
          '<div style="grid-column:1/-1"><button type="button" class="btn sm" data-mat-acao="massa-tabela">Buscar na tabela da NBR 6120</button></div></div>';
      }
      var corpoEd = abas + '<div data-mat-aba-corpo="' + this._aba + '" style="padding-top:12px">' + c + "</div>";
      h += MD ? MD.secao({ titulo: m.nome, sub: (nUso ? nUso + " peça(s) com este material" : "Sem uso no modelo") + (m.origem && /^ra:/.test(m.origem) ? " · da biblioteca RA" : ""), acoesHtml: acoes, corpoHtml: corpoEd, id: "mat-editor" }) : corpoEd;
      return '<div data-mat="editor" data-mat-id="' + esc(m.id) + '">' + h + "</div>";
    },
    _ligar: function (corpo) {
      var self = this;
      if (corpo._matLigado) return;
      corpo._matLigado = true;
      corpo.addEventListener("click", function (e) {
        var t = e.target, sel = t.closest ? t.closest("[data-mat-sel]") : null;
        if (sel) { self._sel = sel.getAttribute("data-mat-sel"); self.pintar(); return; }
        var ab = t.closest ? t.closest("[data-mat-aba]") : null;
        if (ab) { self._aba = ab.getAttribute("data-mat-aba"); self.pintar(); return; }
        var a = t.closest ? t.closest("[data-mat-acao]") : null; if (!a || a.disabled) return;
        self._acao(a.getAttribute("data-mat-acao"), a);
      });
      corpo.addEventListener("keydown", function (e) {
        var sel = e.target && e.target.getAttribute ? e.target.getAttribute("data-mat-sel") : null;
        if (sel && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); self._sel = sel; self.pintar(); }
      });
      /* range: a prévia acompanha enquanto arrasta; grava ao soltar (change) */
      corpo.addEventListener("input", function (e) {
        var t = e.target, k = t.getAttribute && t.getAttribute("data-mat-campo");
        if (t.hasAttribute && t.hasAttribute("data-mat-busca")) { self._busca = t.value; self._repintarLista(); return; }
        if (!k || !(t.type === "range" || t.type === "color")) return;
        var m = self.porId(self._sel); if (!m) return;
        var tmp = JSON.parse(JSON.stringify(m)); tmp[k] = t.type === "range" ? Number(t.value) : t.value;
        var o = corpo.querySelector('[data-mat-out="' + k + '"]'); if (o) o.textContent = br(t.value, 2);
        if (self._aba === "aparencia") self._prevPintar(tmp);
      });
      corpo.addEventListener("change", function (e) {
        var t = e.target;
        if (t.hasAttribute && t.hasAttribute("data-mat-filtro")) { self._filtro = t.value; self.pintar(); return; }
        if (t.hasAttribute && t.hasAttribute("data-mat-arquivo")) { self._lerArquivo(t); return; }
        if (t.hasAttribute && t.hasAttribute("data-mat-acao-base")) { if (t.value) self.usarBase(self._sel, t.value); return; }
        var k = t.getAttribute && t.getAttribute("data-mat-campo"); if (!k || !self._sel) return;
        var v = t.value;
        if (t.type === "range" || k === "transparencia") v = Number(t.value);
        if (k === "massa") { var n = lerNum(t.value); if (n !== null && (isNaN(n) || n <= 0 || n > M().MASSA_MAX)) { toast("Massa específica inválida (kg/m³, até " + M().MASSA_MAX + ").", "aviso"); self.pintar(); return; } v = n; }
        var c = {}; c[k] = v;
        if (k === "massa") c.massaRef = v ? "informado pelo usuário" : "";
        self.alterar(self._sel, c);
      });
    },
    /* o modelo mudou (op, Ctrl+Z): a tela aberta acompanha (contagem de peças, apagar) — uma vez por rodada */
    _aoMudarModelo: function () {
      var self = this;
      if (this._agendado || typeof setTimeout !== "function") return;
      this._agendado = true;
      setTimeout(function () {
        self._agendado = false;
        var g = typeof document !== "undefined" ? document.getElementById("bim-materiais") : null;
        if (g && g.style.display !== "none" && self._corpo() && self._corpo().querySelector('[data-mat="tela"]')) self.pintar();
      }, 0);
    },
    _repintarLista: function () {
      var corpo = this._corpo(); if (!corpo) return;
      var col = corpo.querySelector(".mat-col-lista"); if (!col) return;
      col.innerHTML = this._listaHtml(this.lista(), M().contagem(this.estado() || {}));
    },
    _acao: function (acao, el) {
      var self = this, m = this.porId(this._sel);
      if (acao === "novo") return this.criar();
      if (acao === "duplicar" && m) return this.duplicar(m.id);
      if (acao === "duplicar-ra") return this.duplicarRA(el.getAttribute("data-ra"));
      if (acao === "importar-ra") return this.importarRA(el.getAttribute("data-ra"));
      if (acao === "importar-ra-sel") { var s = document.getElementById("mat-sec-ra"); if (s && s.scrollIntoView) s.scrollIntoView({ block: "start" }); status("Escolha na Biblioteca RA: Usar traz o material; Duplicar cria uma cópia editável."); return null; }
      if (acao === "renomear" && m) { this._aba = "identidade"; this.pintar(); var n = this._corpo().querySelector("[data-mat-nome]"); if (n) { n.focus(); n.select(); } return null; }
      if (acao === "apagar" && m) return this.apagar(m.id);
      if (acao === "exportar") return this.exportar();
      if (acao === "importar-json") { var f = this._corpo().querySelector("[data-mat-arquivo]"); if (f) f.click(); return null; }
      if (acao === "forma") { this._forma = el.getAttribute("data-forma") === "cubo" ? "cubo" : "esfera"; this.pintar(); return null; }
      if (acao === "aplicar-sel" && m) {
        var ids = [];
        try { var pr = B() && B().precisao ? B().precisao() : null; ids = pr && pr.selecao ? pr.selecao().map(String) : []; } catch (e) { ids = []; }
        if (!ids.length) { try { var u = global.Gestao && global.Gestao._bimSelecao && global.Gestao._bimSelecao.uid; if (u && /^edit:/.test(u)) ids = [String(u).slice(5)]; } catch (e2) {} }
        if (!ids.length) { toast("Selecione peças criadas no OrçaPRO (o IFC importado tem o material dele).", "aviso"); return null; }
        if (this.aplicar(ids, m.id)) status("\"" + m.nome + "\" em " + ids.length + " peça(s) (Ctrl+Z desfaz)."); else toast("O editor recusou.", "erro");
        this.pintar(); return null;
      }
      if (acao === "massa-tabela" && m) {
        var t = M().massaPelaTabela(m.nome);
        if (!t) { toast("O nome \"" + m.nome + "\" não casa com a tabela da NBR 6120: informe a massa do fabricante.", "aviso"); return null; }
        return this.alterar(m.id, { massa: t.massa, massaRef: t.ref });
      }
      if (acao === "substituir") return this.dialogoSubstituir();
      return null;
    },
    _lerArquivo: function (inp) {
      var self = this, f = inp.files && inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { self.importarTexto(String(rd.result || "")); inp.value = ""; };
      rd.readAsText(f);
    },
    dialogoSubstituir: function () {
      var self = this, L = this.lista(), cont = M().contagem(this.estado() || {}), usados = L.filter(function (m) { return cont[m.id] > 0; });
      if (!usados.length) { toast("Nenhuma peça do modelo usa material do projeto ainda.", "aviso"); return null; }
      var de = this._sel && cont[this._sel] > 0 ? this._sel : usados[0].id;
      var op = function (l, v) { return l.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === v ? " selected" : "") + ">" + esc(m.nome) + (cont[m.id] ? " (" + cont[m.id] + ")" : "") + "</option>"; }).join(""); };
      var h = '<div data-mat="substituir" style="display:grid;gap:10px;font-size:var(--t-base,13px)">' +
        '<label>Trocar <select data-mat-sub="de">' + op(usados, de) + "</select></label>" +
        '<label>por <select data-mat-sub="para"><option value="">&lt;Por categoria&gt;</option>' + op(L.filter(function (m) { return m.id !== de; }), (L.filter(function (m) { return m.id !== de; })[0] || {}).id) + "</select></label>" +
        '<p class="muted" style="margin:0">Todas as peças com o primeiro passam a ter o segundo. Um Ctrl+Z desfaz tudo.</p></div>';
      if (!global.UI || !global.UI.modal) return null;
      global.UI.modal("Substituir em todo o modelo", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Substituir", classe: "primary", onClick: function () {
          var d = document.querySelector('[data-mat-sub="de"]'), p = document.querySelector('[data-mat-sub="para"]');
          var a = d ? d.value : "", b = p ? p.value : "";
          global.UI.fecharModal(); self.substituir(a, b);
        } }
      ]);
      return true;
    },

    /* ---------------------------------------------------- a prévia (three r150 do visualizador) */
    _prevMontar: function (canvas) {
      var T = this._THREE; if (!T || !canvas) return null;
      if (this._prev && this._prev.canvas === canvas) return this._prev;
      var r;
      if (this._prev) { r = this._prev.r; try { r.dispose(); } catch (e) {} this._prev = null; }
      try { r = new T.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true, alpha: false }); } catch (e1) { return null; }
      r.setPixelRatio(1); r.setSize(240, 180, false);
      if (T.sRGBEncoding !== undefined && "outputEncoding" in r) r.outputEncoding = T.sRGBEncoding;
      r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
      var cena = new T.Scene(), env = new T.Scene();
      /* o ambiente: céu claro em cima, chão escuro embaixo e duas "janelas" que dão o brilho no verniz e no metal */
      var ge = new T.SphereGeometry(20, 32, 16), cores = [], pos = ge.attributes.position;
      for (var i = 0; i < pos.count; i++) { var y = pos.getY(i) / 20, k = y > 0 ? 0.55 + 0.45 * y : 0.18 + 0.2 * (1 + y); cores.push(k, k, k * (y > 0 ? 1.05 : 0.95)); }
      ge.setAttribute("color", new T.Float32BufferAttribute(cores, 3));
      env.add(new T.Mesh(ge, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
      [[6, 8, 6, 5, 3], [-8, 4, 2, 3, 6]].forEach(function (q) { var p = new T.Mesh(new T.PlaneGeometry(q[3], q[4]), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide })); p.material.color.multiplyScalar(6); p.position.set(q[0], q[1], q[2]); p.lookAt(0, 0, 0); env.add(p); });
      var pm = new T.PMREMGenerator(r), rt = pm.fromScene(env, 0.02);
      cena.environment = rt.texture;
      /* fundo xadrez: o que é transparente mostra o que está atrás */
      var cv = document.createElement("canvas"); cv.width = cv.height = 64;
      var g = cv.getContext("2d"); for (var a = 0; a < 8; a++) for (var b = 0; b < 8; b++) { g.fillStyle = (a + b) % 2 ? "#c9ced6" : "#eef0f3"; g.fillRect(a * 8, b * 8, 8, 8); }
      var tx = new T.CanvasTexture(cv); if (T.sRGBEncoding !== undefined) tx.encoding = T.sRGBEncoding;
      var fundo = new T.Mesh(new T.PlaneGeometry(9, 7), new T.MeshBasicMaterial({ map: tx })); fundo.position.set(0, 0, -2.4); cena.add(fundo);
      var luz = new T.DirectionalLight(0xffffff, 1.4); luz.position.set(3, 4, 3); cena.add(luz);
      var mat = new T.MeshPhysicalMaterial({ color: 0xbfbfbf });
      var esf = new T.Mesh(new T.SphereGeometry(1, 64, 32), mat), cubo = new T.Mesh(new T.BoxGeometry(1.35, 1.35, 1.35), mat);
      cubo.rotation.set(0.45, 0.7, 0); cena.add(esf); cena.add(cubo);
      var cam = new T.PerspectiveCamera(35, 240 / 180, 0.1, 60); cam.position.set(0, 0.5, 4.3); cam.lookAt(0, 0, 0);
      this._prev = { canvas: canvas, r: r, cena: cena, cam: cam, mat: mat, esf: esf, cubo: cubo, n: 0 };
      return this._prev;
    },
    _prevPintar: function (m) {
      var corpo = this._corpo(), cv = corpo ? corpo.querySelector("[data-mat-prev]") : null;
      var P = this._prevMontar(cv); if (!P) return false;
      var T = this._THREE, q = M().paraThree(m), mt = P.mat;
      mt.color.set(q.color);
      if (T.ColorManagement && T.ColorManagement.legacyMode !== false && mt.color.convertSRGBToLinear) mt.color.convertSRGBToLinear();
      mt.roughness = q.roughness; mt.metalness = q.metalness; mt.transmission = q.transmission; mt.ior = q.ior;
      mt.clearcoat = q.clearcoat; mt.clearcoatRoughness = q.clearcoatRoughness; mt.thickness = q.thickness;
      mt.needsUpdate = true;
      P.esf.visible = this._forma !== "cubo"; P.cubo.visible = this._forma === "cubo";
      try { P.r.render(P.cena, P.cam); P.n++; } catch (e) { return false; }
      cv.setAttribute("data-mat-prev-n", String(P.n));
      cv.setAttribute("data-mat-prev-sig", [q.color, q.roughness, q.metalness, q.transmission, q.clearcoat, this._forma].join("|"));
      return true;
    }
  };

  global.BimMateriaisUI = BimMateriaisUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMateriaisUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

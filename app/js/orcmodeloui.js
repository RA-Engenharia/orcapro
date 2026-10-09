/* =====================================================================
 * orcmodeloui.js — ORÇAMENTO PELO MODELO, na tela do BIM (F1, 07/10/2026)
 *
 * Só na prévia (?previa=visual), como o resto do BIM novo. O motor é o
 * js/orcmodelo.js (puro); aqui é só a tela:
 *   • Propriedades da peça › "Orçamento": código, descrição, quantidade,
 *     MO/MAT/EQ, horas por função, duração e peso — e a escolha das
 *     composições (o tipo da família, os serviços dela, as camadas da peça,
 *     os serviços da parede/laje/pilar/viga/cobertura criadas no editor);
 *   • painel "Orçamento do modelo" (gaveta da direita): soma AO VIVO por
 *     composição, horas por função, prazo, peso, pendências — e o botão que
 *     cria o orçamento da obra com os itens.
 *
 * ⚠ ENVIAR AO ORÇAMENTO CRIA UM ORÇAMENTO NOVO — nunca escreve num que já
 *   existe. O orçamento da obra pode estar aprovado, travado, com proposta
 *   emitida; mexer nele por baixo é o tipo de coisa que esta base proíbe. O
 *   caminho é o mesmo do "Levantamento BIM" (App.criarOrcamentoDoBIM) e da
 *   importação de planilha: Orcamento.novo → addEtapa → addItem com o item
 *   da base SINAPI (preço vigente) e MO/MAT/EQ pela proporção do analítico
 *   (Analitico.quebra) → Store.salvarOrcamento. As composições que não
 *   fecharam (sem código, pendente, unidade) são MOSTRADAS antes de lançar e
 *   não entram — nada some calado.
 * ⚠ A família nunca leva preço: a conta é feita com a base carregada agora.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE = "orcapro:bim:orcmodelo:v1";   /* só conveniência deste aparelho: equipe e horas/dia */

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function U() { return global.Util; }
  function fmt(n, c) { var u = U(); return u && u.fmtNum ? u.fmtNum(n, c == null ? 2 : c) : String(Math.round(Number(n || 0) * 100) / 100).replace(".", ","); }
  function moeda(n) { var u = U(); return u && u.fmtMoeda ? u.fmtMoeda(n) : "R$ " + fmt(n, 2); }
  function toast(t, k, ms) { try { if (global.UI && UI.toast) UI.toast(t, k || "info", ms); } catch (e) {} }
  function curto(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function unTela(u) { var k = String(u || "").toLowerCase(); return k === "m2" ? "m²" : k === "m3" ? "m³" : k; }
  function ro(id, rot, v, motivo) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v, motivo: motivo }; }
  /* hora pequena com 2 casas: o pilar de 0,18 m³ dá 0,02 h de pedreiro, e "0,0 h" leria como zero */
  function horasTxt(hs) { return (hs || []).map(function (h) { return h.funcao + " " + fmt(h.h, h.h < 10 ? 2 : 1) + " h"; }).join(" · ") || "—"; }

  var OrcModeloUI = {
    _prefs: null, _carregando: false, _t: null,

    ativo: function () { try { return document.documentElement.getAttribute("data-visual") === "nova"; } catch (e) { return false; } },
    prefs: function () {
      if (!this._prefs) {
        var o = {}; try { o = JSON.parse(localStorage.getItem(CHAVE) || "{}") || {}; } catch (e) { o = {}; }
        this._prefs = { equipe: (o.equipe && typeof o.equipe === "object") ? o.equipe : {}, horasDia: o.horasDia > 0 && o.horasDia <= 24 ? +o.horasDia : 8 };
      }
      return this._prefs;
    },
    gravarPrefs: function () { try { localStorage.setItem(CHAVE, JSON.stringify(this.prefs())); } catch (e) {} },
    opcoes: function () {
      var p = this.prefs(), o = { equipe: p.equipe, horasDia: p.horasDia, classeDe: global.SinapiMapa ? SinapiMapa.classeDe : null };
      /* P10 (js/bimfases.js): a categoria da família (porta/janela demolida) e a fase da vista */
      if (global.BIM && BIM.familiaCategoria) o.categoriaFamFases = function (id) { return BIM.familiaCategoria(id); };
      try { if (global.BimP10UI && BimP10UI.ativo() && BimP10UI.fase) o.fase = BimP10UI.fase(); } catch (eF) {}
      return o;
    },

    /* ------------------------------------------------------------ BASE */
    baseCarregada: function () { return !!(global.Analitico && Analitico.carregado); },
    base: function () {
      if (!this.baseCarregada() || !global.OrcModelo) return null;
      return OrcModelo.baseComPreco(Analitico, global.Sinapi && Sinapi.obter ? Sinapi : null);
    },
    rotuloBase: function () {
      if (!this.baseCarregada()) return "base SINAPI analítica não carregada";
      return "SINAPI analítico " + (Analitico.uf || "") + " " + (Analitico.competencia || "") + (Analitico.desonerado ? " (desonerado)" : "");
    },
    /* o MESMO caminho da aba Insumos do orçamento: App._prepararAnalitico dá
       a lista de arquivos do estado e do regime; Analitico carrega uma vez */
    carregarBase: function (depois) {
      var self = this;
      if (this.baseCarregada()) { if (depois) depois(); return; }
      if (this._carregando) return;
      if (!global.App || !App._prepararAnalitico || !global.Analitico || !Analitico.carregarArquivo) { toast("O detalhamento SINAPI não está disponível nesta instalação.", "erro"); return; }
      var urls = App._prepararAnalitico();
      if (!urls || !urls.alts || !urls.alts.length) { toast("Sem estado para a base SINAPI: escolha a UF em Tabelas de Preço e volte aqui.", "erro"); return; }
      this._carregando = true; this.renderPainel(); this._repintarProps();
      try { if (global.BimShell) BimShell.status("Carregando a base SINAPI analítica…"); } catch (eS) {}
      Analitico.carregarArquivo(urls.alts).then(function () {
        self._carregando = false; self.renderPainel(); self._repintarProps();
        try { if (global.BimShell) BimShell.status("Base carregada: " + self.rotuloBase() + "."); } catch (eS2) {}
        if (depois) depois();
      })["catch"](function (e) {
        self._carregando = false; self.renderPainel(); self._repintarProps();
        if (e && e.message === "cancelado") return;
        toast("Não consegui carregar a base SINAPI analítica. Confira a internet ou baixe a base do estado em Tabelas de Preço.", "erro");
      });
    },
    descricao: function (cod) {
      var a = global.Analitico && Analitico.obter ? Analitico.obter(cod) : null; if (a) return a.descricao || "";
      var s = global.Sinapi && Sinapi.obter ? Sinapi.obter(cod) : null; return s ? s.descricao || "" : "";
    },
    rotuloCod: function (cod) { var d = this.descricao(cod); return cod + (d ? " — " + curto(d, 96) : ""); },
    /* composições da classe que existem na base carregada e estão na unidade pedida */
    candidatos: function (classe, un) {
      var M = global.SinapiMapa, l = M && M.porClasse && M.porClasse[classe] ? M.porClasse[classe] : [];
      if (!this.baseCarregada()) return l.slice();
      var OM = global.OrcModelo;
      return l.filter(function (c) { var a = Analitico.obter(c); return !!a && (!un || !OM || OM.mesmaUnidade(a.unidade, un)); });
    },
    _opcoesCod: function (classe, un, atual) {
      var self = this, l = classe ? this.candidatos(classe, un) : [];
      if (atual && l.indexOf(String(atual)) < 0) l = [String(atual)].concat(l);
      return [{ id: "", rotulo: "— sem composição —" }].concat(l.map(function (c) { return { id: c, rotulo: self.rotuloCod(c) }; }));
    },
    _repintarProps: function () {
      try {
        var G = global.Gestao;
        if (G && G._bimSelecao && /^edit:/.test(String(G._bimSelecao.uid || "")) && global.BimShell) BimShell.pintarProps(G._bimPropsPeca(G._bimSelecao));
      } catch (e) {}
    },

    /* ----------------------------------------------- LINHAS COMUNS (Propriedades) */
    _linhaResultado: function (pid, l) {
      if (!l) return [];
      var out = [];
      if (l.status !== "ok") { out.push(ro(pid + ":st", "Situação", l.status === "pendente" ? "Pendente — código fora da base" : l.status === "unidade" ? "Unidade não bate" : l.status === "sem-base" ? "Base não carregada" : "Sem código", (l.avisos || []).join(" · "))); return out; }
      out.push(ro(pid + ":q", "Quantidade", fmt(l.quantidade, 3) + " " + unTela(l.unidadeQto) + " × " + moeda(l.unitario.total)));
      out.push(ro(pid + ":c", "Custo (MO / MAT / EQ)", moeda(l.custo.total) + " (" + moeda(l.custo.mo) + " / " + moeda(l.custo.mat) + " / " + moeda(l.custo.eq) + ")"));
      out.push(ro(pid + ":h", "Horas", horasTxt(l.horas)));
      return out;
    },
    _linhasResumo: function (r) {
      if (!r || !r.resumo) return [];
      var s = r.resumo, out = [ro("orc:tot", "Total da peça", moeda(s.custo.total)), ro("orc:tot-h", "Horas da peça", fmt(s.horasTotal, 1) + " h — " + horasTxt(s.horas))];
      out.push(ro("orc:dur", "Duração (equipe)", s.funcaoCritica ? fmt(s.prazoSequencialDias, 2) + " dia(s) — crítica: " + s.funcaoCritica + ", " + fmt(s.horasDia, 1) + " h/dia" : "—", "Pessoas por função e horas por dia: no painel Orçamento do modelo"));
      out.push(ro("orc:peso", "Peso", r.peso && r.peso.ok ? fmt(r.peso.kg, 1) + " kg" : "sem peso", r.peso && !r.peso.ok ? r.peso.motivo : (r.peso && r.peso.porMaterial ? r.peso.porMaterial.map(function (p) { return p.material + " " + fmt(p.kNm3, 1) + " kN/m³ (" + p.ref + ")"; }).join("; ") : "")));
      var av = []; (r.linhas || []).forEach(function (l) { (l.avisos || []).forEach(function (a) { if (av.indexOf(a) < 0) av.push(a); }); });
      av.slice(0, 4).forEach(function (a, i) { out.push(ro("orc:av" + i, "Aviso", curto(a, 90), a)); });
      return out;
    },
    _botaoBase: function () {
      var self = this;
      return { id: "orc:carregar", rotulo: "Base SINAPI", tipo: "botao", rotuloBotao: this._carregando ? "Carregando…" : "Carregar a base", fn: function () { self.carregarBase(); } };
    },

    /* ------------------------------------------------- FAMÍLIA COLOCADA */
    secoesFamilia: function (id) {
      if (!this.ativo() || !global.BIM || !BIM.instanciaInfo || !global.OrcModelo) return [];
      var info = BIM.instanciaInfo(id); if (!info || !info.avaliado || !info.avaliado.quantitativo) return [];
      var self = this, av = info.avaliado, inst = info.instancia, q = av.quantitativo, base = this.base();
      var fam = global.FamiliaUI && FamiliaUI.obter ? FamiliaUI.obter(inst.famId) : null;
      var r = base ? OrcModelo.daFamilia(av, base, this.opcoes(), inst.servicos) : null;
      var ps = [];
      if (!base) ps.push(this._botaoBase());
      ps.push(ro("orc:cod", "Código", q.codigo ? q.codigo + (q.codigoOrigem === "tipo" ? " (do tipo)" : " (da família)") : "— sem código: troque o tipo ou edite a família"));
      if (q.codigo) ps.push(ro("orc:desc", "Descrição", curto(this.descricao(q.codigo) || q.descricao, 90), this.descricao(q.codigo)));
      if (r) ps = ps.concat(this._linhaResultado("orc:p", r.linhas[0]));
      else ps.push(ro("orc:q0", "Quantidade", fmt(q.quantidade, 3) + " " + unTela(q.unidade)));
      /* serviços da família (fôrma, armação…): a peça escolhe a composição */
      var sobre = {}; (inst.servicos || []).forEach(function (s) { var m = /^servico:(.+)$/.exec(s.medida); if (m) sobre[m[1]] = s; });
      var defs = {}; ((fam && fam.servicos) || []).forEach(function (s) { defs[s.id] = s; });
      (av.servicos || []).forEach(function (s) {
        var d = defs[s.id] || {}, atual = sobre[s.id] ? sobre[s.id].codigo : s.codigo;
        ps.push({ id: "orc:fs:" + s.id, rotulo: s.descricao + " (" + fmt(s.quantidade, 2) + " " + unTela(s.unidade) + ")", tipo: "lista", valor: atual || "", opcoes: self._opcoesCod(d.classe, s.unidade, atual) });
        if (r && atual) { var l = r.linhas.filter(function (x) { return x.servico === s.id; })[0]; if (l) ps = ps.concat(self._linhaResultado("orc:fs:" + s.id, l)); }
      });
      /* camadas da peça sobre a quantidade da família (ex.: reboco nas 2 faces) */
      var extras = (inst.servicos || []).map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return x.s.medida === "quantidade"; });
      var M = global.SinapiMapa, hosp = "familia:" + ((fam && fam.categoria) || "generico");
      extras.forEach(function (x, k) {
        var cl = M ? M.classeDe(x.s.codigo) : null;
        ps.push({ id: "orc:cx:" + x.i, rotulo: "Camada " + (k + 1) + (cl && M.classes[cl] ? " — " + M.classes[cl].nome : ""), tipo: "lista", valor: x.s.codigo, opcoes: self._opcoesCod(cl, q.unidade, x.s.codigo) });
        ps.push({ id: "orc:cf:" + x.i, rotulo: "Camada " + (k + 1) + " — fator (faces)", tipo: "numero", passo: 1, valor: x.s.fator || 1 });
        if (r) { var l2 = r.linhas.filter(function (y) { return y.servico === "inst" + k; })[0]; if (l2) ps = ps.concat(self._linhaResultado("orc:cx:" + x.i, l2)); }
        ps.push({ id: "orc:cr:" + x.i, rotulo: "Camada " + (k + 1), tipo: "botao", rotuloBotao: "Tirar", fn: function () { self.mudarFamilia(id, "orc:cr:" + x.i); self._repintarProps(); } });
      });
      var cls = this._classesPorUnidade(M ? M.classesPara(q.unidade === "m2" && /parede/.test(hosp) ? "parede" : hosp) : [], q.unidade);
      if (cls.length) ps.push({ id: "orc:cadd", rotulo: "Adicionar camada", tipo: "lista", valor: "", opcoes: [{ id: "", rotulo: "— escolher —" }].concat(cls.map(function (k) { return { id: k, rotulo: M.classes[k].nome }; })) });
      ps.push({ id: "orc:cdig", rotulo: "Camada por código", tipo: "texto", valor: "" });
      if (r) ps = ps.concat(this._linhasResumo(r));
      return [{ nome: "Orçamento", params: ps }];
    },
    _classesPorUnidade: function (classes, un) {
      var M = global.SinapiMapa, OM = global.OrcModelo;
      return (classes || []).filter(function (k) { var c = M && M.classes[k]; return c && c.medida !== null && (!un || !OM || OM.mesmaUnidade(c.un, un)); });
    },
    /* mudança vinda de Propriedades na família colocada → op "orcar" (desfaz como as outras) */
    mudarFamilia: function (id, pid, valor) {
      if (!global.BIM || !BIM.instanciaInfo || !BIM.elementoOrcar) return false;
      var info = BIM.instanciaInfo(id); if (!info) return false;
      var lista = JSON.parse(JSON.stringify(info.instancia.servicos || [])), M = global.SinapiMapa, m;
      if ((m = /^orc:fs:(.+)$/.exec(pid))) {
        lista = lista.filter(function (s) { return s.medida !== "servico:" + m[1]; });
        if (String(valor || "").trim()) lista.push({ codigo: String(valor).trim(), medida: "servico:" + m[1], fator: 1 });
      } else if ((m = /^orc:cx:(\d+)$/.exec(pid))) { if (lista[+m[1]]) lista[+m[1]].codigo = String(valor || "").trim(); if (!lista[+m[1]].codigo) lista.splice(+m[1], 1); }
      else if ((m = /^orc:cf:(\d+)$/.exec(pid))) { var f = parseFloat(String(valor).replace(",", ".")); if (lista[+m[1]] && f > 0) lista[+m[1]].fator = f; }
      else if ((m = /^orc:cr:(\d+)$/.exec(pid))) { lista.splice(+m[1], 1); }
      else if (pid === "orc:cadd") {
        var cl = M && M.classes[valor]; if (!cl) return false;
        var un = info.avaliado && info.avaliado.quantitativo ? info.avaliado.quantitativo.unidade : "", c0 = this.candidatos(valor, un)[0];
        if (!c0) { toast("Não há composição de \"" + cl.nome + "\" em " + unTela(un) + " na base carregada.", "aviso"); return false; }
        lista.push({ codigo: c0, medida: "quantidade", fator: cl.fator || 1 });
      } else if (pid === "orc:cdig") {
        var cd = String(valor || "").trim(); if (!cd) return false;
        lista.push({ codigo: cd, medida: "quantidade", fator: 1 });
      } else return false;
      return BIM.elementoOrcar(id, lista);
    },

    /* ------------------------------------- ELEMENTO DO EDITOR (parede, laje…) */
    _elemento: function (id) {
      var est = global.BIM && BIM.editarEstado ? BIM.editarEstado() : null; if (!est) return null;
      var st = est.estado, el = (st.caixas || []).filter(function (c) { return c.id === id; })[0] || (st.coberturas || []).filter(function (c) { return c.id === id; })[0];
      /* volume livre (B4): a classe de serviço segue a CATEGORIA escolhida
         (volume "parede" oferece alvenaria; "genérico", as medidas de volume) */
      var vol = !el && (st.volumes || []).filter(function (c) { return c.id === id; })[0];
      if (vol) return { el: vol, tipo: vol.categoria && vol.categoria !== "generico" ? vol.categoria : "volume", areaVaos: 0, volume: true };
      /* P3: telhado, borda do telhado e fundação (js/bimtelhado.js, js/bimfundacao.js) — o tipo é a categoria do registro */
      if (!el) el = ["telhados", "bordas", "fundacoes"].map(function (k) { return (st[k] || []).filter(function (c) { return c && c.id === id; })[0]; }).filter(Boolean)[0] || null;
      if (!el) return null;
      var vaos = global.BimEdit && BimEdit.vaosDasParedes ? BimEdit.vaosDasParedes(st, BIM.familiaAvaliar) : {};
      return { el: el, tipo: el.tipo || "cobertura", areaVaos: vaos[id] ? vaos[id].areaVaos : 0 };
    },
    /* P1-D: as medidas que o orçamento oferece por categoria vêm do REGISTRO
       (js/bimparam.js, as definições com `orc`) — OrcModelo.medidasDaCategoria.
       Só o volume livre (B4), que não é categoria do registro, fica aqui:
       área = superfície da malha; comprimento = caminho da varredura ou altura
       da extrusão. A lista na tela só oferece a medida que a peça TEM. */
    MEDIDAS_VOLUME: ["volume", "area", "areaProjecao", "comprimento", "un", "kgPorM3"],
    medidasPorTipo: function (tipo, volume) {
      if (volume) return this.MEDIDAS_VOLUME;
      return (global.OrcModelo && OrcModelo.medidasDaCategoria ? OrcModelo.medidasDaCategoria(tipo) : null) || ["area", "volume", "comprimento", "un"];
    },
    secoesElemento: function (id) {
      if (!this.ativo() || !global.OrcModelo || !global.BimEdit) return [];
      var x = this._elemento(id); if (!x) return [];
      var self = this, el = x.el, base = this.base(), M = global.SinapiMapa, MU = BimEdit.MEDIDAS_ORC, ROT = BimEdit.MEDIDAS_ROTULO;
      var r = OrcModelo.daElemento(el, x.areaVaos, base, this.opcoes()), med = r.medidas || {};
      var ps = [];
      if (!base) ps.push(this._botaoBase());
      ps.push(ro("orc:med", "Medidas", ["area", "volume", "comprimento", "areaForma"].filter(function (k) { return med[k] != null; }).map(function (k) { return ROT[k] + " " + fmt(med[k], 2) + " " + unTela(MU[k]); }).join(" · ")));
      var meds = this.medidasPorTipo(x.tipo, x.volume).filter(function (k) { return k === "kgPorM3" ? med.volume != null : med[k] != null; });
      (el.servicos || []).forEach(function (s, i) {
        var cl = M ? M.classeDe(s.codigo) : null, n = i === 0 ? "Principal" : "Serviço " + (i + 1);
        var un = s.medida === "kgPorM3" ? "kg" : MU[s.medida];
        ps.push({ id: "orc:ex:" + i, rotulo: n + (cl && M.classes[cl] ? " — " + M.classes[cl].nome : ""), tipo: "lista", valor: s.codigo, opcoes: self._opcoesCod(cl, un, s.codigo) });
        ps.push({ id: "orc:em:" + i, rotulo: n + " — medida", tipo: "lista", valor: s.medida, opcoes: meds.map(function (k) { return { id: k, rotulo: ROT[k] + " (" + unTela(MU[k]) + ")" }; }) });
        ps.push({ id: "orc:ef:" + i, rotulo: n + (s.medida === "kgPorM3" ? " — taxa (kg/m³)" : " — fator"), tipo: "numero", passo: s.medida === "kgPorM3" ? 5 : 1, valor: s.fator || 1 });
        ps = ps.concat(self._linhaResultado("orc:ex:" + i, r.linhas[i]));
        ps.push({ id: "orc:ed:" + i, rotulo: n, tipo: "botao", rotuloBotao: "Tirar", fn: function () { self.mudarElemento(id, "orc:ed:" + i); self._repintarProps(); } });
      });
      var cls = M ? M.classesPara(x.tipo).filter(function (k) { return M.classes[k].medida; }) : [];
      if (cls.length) ps.push({ id: "orc:eadd", rotulo: (el.servicos || []).length ? "Adicionar serviço" : "Composição (tipo)", tipo: "lista", valor: "", opcoes: [{ id: "", rotulo: "— escolher a classe —" }].concat(cls.map(function (k) { return { id: k, rotulo: M.classes[k].nome }; })) });
      ps.push({ id: "orc:edig", rotulo: "Serviço por código", tipo: "texto", valor: "" });
      ps = ps.concat(this._linhasResumo(r));
      return [{ nome: "Orçamento", params: ps }];
    },
    mudarElemento: function (id, pid, valor) {
      if (!global.BIM || !BIM.elementoOrcar) return false;
      var x = this._elemento(id); if (!x) return false;
      var lista = JSON.parse(JSON.stringify(x.el.servicos || [])), M = global.SinapiMapa, MU = BimEdit.MEDIDAS_ORC, m;
      if ((m = /^orc:ex:(\d+)$/.exec(pid))) { if (!lista[+m[1]]) return false; lista[+m[1]].codigo = String(valor || "").trim(); if (!lista[+m[1]].codigo) lista.splice(+m[1], 1); }
      else if ((m = /^orc:em:(\d+)$/.exec(pid))) { if (!lista[+m[1]] || !BimEdit.medidaValida(valor)) return false; lista[+m[1]].medida = valor; }
      else if ((m = /^orc:ef:(\d+)$/.exec(pid))) { var f = parseFloat(String(valor).replace(",", ".")); if (!lista[+m[1]] || !(f > 0)) return false; lista[+m[1]].fator = f; }
      else if ((m = /^orc:ed:(\d+)$/.exec(pid))) { lista.splice(+m[1], 1); }
      else if (pid === "orc:eadd") {
        var cl = M && M.classes[valor]; if (!cl || !cl.medida) return false;
        var un = cl.medida === "kgPorM3" ? "kg" : MU[cl.medida], c0 = this.candidatos(valor, un)[0];
        if (!c0) { toast("Não há composição de \"" + cl.nome + "\" na base carregada.", "aviso"); return false; }
        lista.push({ codigo: c0, medida: cl.medida, fator: cl.medida === "kgPorM3" ? 1 : (cl.fator || 1) });
        if (cl.medida === "kgPorM3") toast("Armação: informe a TAXA de aço (kg/m³) do projeto estrutural no campo ao lado — o modelo não sabe a armadura.", "aviso", 8000);
      } else if (pid === "orc:edig") {
        var cd = String(valor || "").trim(); if (!cd) return false;
        var pad = { parede: "area", laje: "area", cobertura: "area", pilar: "volume", viga: "volume", telhado: "area", fundacao: "volume", borda: "comprimento" };   /* P3: telhado, fundação, borda */
        lista.push({ codigo: cd, medida: x.volume ? "volume" : (pad[x.tipo] || "area"), fator: 1 });
      } else return false;
      return BIM.elementoOrcar(id, lista);
    },
    /* a Gestao chama aqui para os pids "orc:"; devolve true = repintar */
    mudar: function (uid, pid, valor) {
      var id = String(uid || "").replace(/^edit:/, "");
      if (/^orc:carregar$/.test(pid)) { this.carregarBase(); return true; }
      if (/^acab:/.test(pid)) return this.mudarAmbiente(id, pid, valor);   /* P2-C: rascunho do acabamento (só grava no Aplicar) */
      var ehFam = /^f\d+$/.test(id);
      var ok = ehFam ? this.mudarFamilia(id, pid, valor) : this.mudarElemento(id, pid, valor);
      if (ok) this.aoMudarModelo();
      return ok;
    },

    /* ------------------------------------- P2-C: ACABAMENTO POR AMBIENTE
     * Propriedades do ambiente › "Acabamentos": os 4 acabamentos
     * (piso, base, parede, forro) + a composição de cada serviço (piso,
     * contrapiso, rodapé, parede, teto). A escolha fica num RASCUNHO na tela
     * até "Aplicar por ambiente", que grava UMA op ajustarAmbiente (serviços
     * + textos) — Ctrl+Z desfaz tudo. As quantidades vêm do
     * js/bimacabamento.js; as linhas, do OrcModelo.daAmbiente (as mesmas do
     * painel Orçamento do modelo). */
    _acab: {},
    _ambiente: function (id) {
      var est = global.BIM && BIM.editarEstado ? BIM.editarEstado() : null; if (!est) return null;
      var a = (est.estado.ambientes || []).filter(function (x) { return x && String(x.id) === String(id); })[0];
      return a ? { a: a, estado: est.estado } : null;
    },
    ehAmbiente: function (id) { return !!this._ambiente(String(id || "").replace(/^edit:/, "")); },
    _rascunho: function (id, a) {
      var r = this._acab[id], BA = global.BimAcabamento;
      if (!r || !r.sujo) {
        var tx = {}; ((BA && BA.ACABS) || []).forEach(function (x) { tx[x.campo] = a[x.campo] || ""; });
        r = this._acab[id] = { servicos: JSON.parse(JSON.stringify(a.servicos || [])), textos: tx, sujo: false, codMedida: (r && r.codMedida) || "areaPiso" };
      }
      return r;
    },
    _quant: function (x) {
      var BA = global.BimAcabamento; if (!BA) return null;
      var vaos = global.BimEdit && BimEdit.vaosDasParedes ? BimEdit.vaosDasParedes(x.estado, BIM.familiaAvaliar) : {};
      return BA.quantidades(x.estado, { avaliarFam: BIM.familiaAvaliar, vaos: vaos }).porId[String(x.a.id)] || null;
    },
    /* as composições de um item (piso, rodapé…): as classes do mapa, na unidade da medida, agrupadas pela classe */
    _opcoesItem: function (it, atual) {
      var self = this, M = global.SinapiMapa, un = global.BimEdit && BimEdit.MEDIDAS_AMBIENTE ? BimEdit.MEDIDAS_AMBIENTE[it.medida] : "", vistos = {}, out = [{ id: "", rotulo: "— sem composição —" }];
      if (atual) { vistos[atual] = 1; out.push({ id: String(atual), rotulo: self.rotuloCod(atual) }); }
      it.classes.forEach(function (cl) {
        var nome = M && M.classes[cl] ? M.classes[cl].nome : cl;
        self.candidatos(cl, un).forEach(function (c) { if (vistos[c]) return; vistos[c] = 1; out.push({ id: c, rotulo: self.rotuloCod(c), grupo: nome }); });
      });
      return out;
    },
    secoesAmbiente: function (id) {
      if (!this.ativo() || !global.OrcModelo || !global.BimAcabamento || !global.BimEdit) return [];
      var x = this._ambiente(id); if (!x) return [];
      var self = this, BA = BimAcabamento, a = x.a, r = this._rascunho(String(id), a), base = this.base(), Q = this._quant(x), ps = [];
      if (!base) ps.push(this._botaoBase());
      ps.push(ro("acab:q", "Quantidades", BA.resumoTexto(Q, function (v) { return fmt(v, 2); }), Q && Q.portas && Q.portas.length ? "Rodapé sem " + Q.portas.length + " porta(s): " + Q.portas.map(function (p) { return fmt(p.largura, 2) + " m"; }).join(", ") : ""));
      BA.ACABS.forEach(function (ac) { ps.push({ id: "acab:tx:" + ac.campo, rotulo: ac.nome, tipo: "texto", valor: r.textos[ac.campo] || "" }); });
      /* as linhas do rascunho (o mesmo motor do painel): quantidade, custo, situação */
      var linhas = OrcModelo.daAmbiente({ nome: a.nome, servicos: r.servicos }, Q, base, this.opcoes()).linhas;
      BA.ITENS.forEach(function (it) {
        var meus = [];
        r.servicos.forEach(function (s, i) { if (BA.itemDoServico(s) === it) meus.push(i); });
        meus.forEach(function (i, j) {
          var s = r.servicos[i], rot = it.rotulo + (meus.length > 1 ? " " + (j + 1) : "") + (s.rotulo && s.rotulo !== it.rotulo ? " (" + String(s.rotulo).replace(/^[^—]*—\s*/, "") + ")" : "");
          ps.push({ id: "acab:sv:" + i, rotulo: rot + " — composição", tipo: "lista", valor: s.codigo, opcoes: self._opcoesItem(it, s.codigo) });
          var l = linhas.filter(function (q) { return q.servico === "a" + i; })[0];
          if (l) ps = ps.concat(self._linhaResultado("acab:sv:" + i, l));
          ps.push({ id: "acab:rm:" + i, rotulo: rot, tipo: "botao", rotuloBotao: "Tirar", fn: function () { self.mudarAmbiente(id, "acab:rm:" + i); self._repintarProps(); } });
        });
        if (!meus.length || it.id === "parede") ps.push({ id: "acab:add:" + it.id, rotulo: it.rotulo + (meus.length ? " — mais uma camada" : " — composição"), tipo: "lista", valor: "", opcoes: self._opcoesItem(it, null) });
      });
      if (global.ParedeCebola && ParedeCebola.receitas) ps.push({ id: "acab:receita", rotulo: "Camadas da parede (Parede-Cebola)", tipo: "lista", valor: "", opcoes: [{ id: "", rotulo: "— escolher a receita —" }].concat(ParedeCebola.receitas().map(function (k) { return { id: k.id, rotulo: k.rotulo }; })) });
      ps.push({ id: "acab:cmed", rotulo: "Serviço por código — medida", tipo: "lista", valor: r.codMedida, opcoes: Object.keys(BA.MEDIDAS).map(function (k) { return { id: k, rotulo: BA.MEDIDAS[k].rotulo }; }) });
      ps.push({ id: "acab:cod", rotulo: "Serviço por código", tipo: "texto", valor: "" });
      var tot = 0, nOk = 0; linhas.forEach(function (l) { if (l.status === "ok") { tot += l.custo.total; nOk++; } });
      ps.push(ro("acab:tot", "Total do ambiente", nOk ? moeda(tot) : "—"));
      ps.push(ro("acab:st", "Situação", r.sujo ? "Rascunho — clique Aplicar por ambiente" : (r.servicos.length ? "Aplicado (" + r.servicos.length + " serviço(s))" : "Sem acabamento aplicado")));
      ps.push({ id: "acab:aplicar", rotulo: "Acabamentos", tipo: "botao", rotuloBotao: "Aplicar por ambiente", fn: function () { self.aplicarAmbiente(id); } });
      return [{ nome: "Acabamentos", params: ps }];
    },
    mudarAmbiente: function (id, pid, valor) {
      var x = this._ambiente(id), BA = global.BimAcabamento; if (!x || !BA) return false;
      var r = this._rascunho(String(id), x.a), L = r.servicos, m, v = String(valor == null ? "" : valor).trim();
      function item(med) { for (var i = 0; i < BA.ITENS.length; i++) if (BA.ITENS[i].medida === med) return BA.ITENS[i]; return null; }
      if ((m = /^acab:sv:(\d+)$/.exec(pid))) { if (!L[+m[1]]) return false; if (v) L[+m[1]].codigo = v; else L.splice(+m[1], 1); }
      else if ((m = /^acab:rm:(\d+)$/.exec(pid))) { if (!L[+m[1]]) return false; L.splice(+m[1], 1); }
      else if ((m = /^acab:add:(\w+)$/.exec(pid))) { var it = BA.itemPorId(m[1]); if (!it || !v) return false; L.push({ codigo: v, medida: it.medida, fator: 1, acab: it.acab, rotulo: it.rotulo }); }
      else if ((m = /^acab:tx:(\w+)$/.exec(pid))) { r.textos[m[1]] = v; }
      else if (pid === "acab:cmed") { if (!BA.MEDIDAS[v]) return false; r.codMedida = v; return true; }
      else if (pid === "acab:cod") { if (!v) return false; var ic = item(r.codMedida) || BA.ITENS[0]; L.push({ codigo: v, medida: ic.medida, fator: 1, acab: ic.acab, rotulo: ic.rotulo }); }
      else if (pid === "acab:receita") {
        if (!v || !global.ParedeCebola) return false;
        var pc = ParedeCebola.camadasAmbiente(v, global.App && App._fontesExcluidas ? { excluirFontes: App._fontesExcluidas() } : undefined);
        r.servicos = L = L.filter(function (s) { return s.medida !== "areaParede"; }).concat(pc.servicos);
        if (pc.pendentes.length) toast("Parede-Cebola: " + pc.pendentes.length + " camada(s) sem composição — " + pc.pendentes.map(function (p) { return p.camada + " (" + p.motivo + ")"; }).join("; ") + ". Escolha à mão ou deixe de fora.", "aviso", 9000);
      } else return false;
      if (L.length > 16) { L.splice(16); toast("No máximo 16 serviços por ambiente.", "aviso"); }
      r.sujo = true;
      return true;
    },
    /* grava o rascunho no ambiente (UMA op) — o texto do acabamento vazio ganha a descrição da composição */
    aplicarAmbiente: function (id) {
      var x = this._ambiente(id), BA = global.BimAcabamento; if (!x || !BA || !global.BIM || !BIM.b2Op) return false;
      var self = this, r = this._rascunho(String(id), x.a), tx = {};
      BA.ACABS.forEach(function (ac) {
        var t = String(r.textos[ac.campo] || "").trim();
        if (!t) { var s = r.servicos.filter(function (q) { return q.acab === ac.id || (!q.acab && q.medida === ac.medida); })[0]; if (s) t = curto(self.descricao(s.codigo) || "", 120); }
        tx[ac.campo] = t;
      });
      var op = BA.opAplicar(x.a.id, r.servicos, tx);
      if (!op.ok) { toast(op.motivo, "erro"); return false; }
      if (!BIM.b2Op(op.op)) { toast("O editor recusou a mudança do ambiente.", "erro"); return false; }
      r.sujo = false; delete this._acab[String(id)];
      try { if (global.BimShell) BimShell.status("Acabamentos aplicados ao ambiente " + ((x.a.nome || "Ambiente") + " " + (global.BimAmbiente && BimAmbiente.numero ? BimAmbiente.numero(x.a) || "" : "")).trim() + ": " + op.op.campos.servicos.length + " serviço(s) — as linhas estão no Orçamento do modelo (Ctrl+Z desfaz)."); } catch (e) {}
      this.aoMudarModelo(); this._repintarProps();
      return true;
    },

    /* ------------------------------------------------ PAINEL DO MODELO */
    calcular: function () {
      var base = this.base(), est = global.BIM && BIM.editarEstado ? BIM.editarEstado() : null;
      if (!base || !est || !global.OrcModelo) return null;
      return OrcModelo.doModelo(est.estado, BIM.familiaAvaliar, base, this.opcoes());
    },
    aoMudarModelo: function () {
      var self = this; clearTimeout(this._t);
      this._t = setTimeout(function () { var el = document.getElementById("bim-orcmod"); if (el && el.style.display !== "none") self.renderPainel(); }, 150);
    },
    /* o estilo do painel mora aqui (e não no css do BIM) para a mudança ficar num arquivo só */
    _css: function () {
      if (document.getElementById("om-css")) return;
      var s = document.createElement("style"); s.id = "om-css";
      s.textContent = "#bim-orcmod-corpo{font-size:12.5px}.om-cab{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px}" +
        ".om-base{opacity:.8}.om-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:6px 0}" +
        ".om-card{border:1px solid rgba(127,127,127,.35);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}.om-card b{font-size:16px}.om-card span{opacity:.75;font-size:11.5px}" +
        ".om-mmq{opacity:.85;margin:2px 0 8px}.om-tab-env{max-height:300px;overflow:auto}.om-tab td,.om-tab th{padding:3px 5px;font-size:12px;vertical-align:top;white-space:nowrap}" +
        ".om-tab td.om-d{white-space:normal;min-width:150px}.om-tab td.om-d span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11px;line-height:1.3;text-transform:none}" +
        ".om-eq td{padding:2px 5px;white-space:nowrap}" +
        ".om-sec{margin-top:10px}.om-eq input{width:52px}.om-hd input{width:52px}.om-nota{font-size:11.5px;margin:4px 0}.om-pend ul{margin:4px 0;padding-left:18px}" +
        ".om-acoes{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}";
      document.head.appendChild(s);
    },
    renderPainel: function () {
      var corpo = document.getElementById("bim-orcmod-corpo"); if (!corpo) return;
      this._css();
      var self = this, h = "";
      h += '<div class="om-cab"><span class="om-base" data-om="base">' + esc(this.rotuloBase()) + "</span>" +
        (this.baseCarregada() ? "" : '<button class="btn sm primary" data-om="carregar"' + (this._carregando ? " disabled" : "") + ">" + (this._carregando ? "Carregando…" : "Carregar a base SINAPI") + "</button>") + "</div>";
      var mod = this.calcular();
      if (!mod) {
        h += '<p class="muted" style="font-size:12.5px">' + (this.baseCarregada() ? "Abra o BIM e modele: paredes, lajes, pilares, vigas, coberturas e famílias criadas aqui entram no orçamento." : "O orçamento do modelo usa a base SINAPI ANALÍTICA do estado (insumos, horas de cada função). Carregue-a para ver custo, horas e prazo.") + "</p>";
        corpo.innerHTML = h; this._ligar(corpo); return;
      }
      var s = mod.resumo, p = this.prefs();
      h += '<div class="om-cards">' +
        '<div class="om-card"><b data-om="total">' + moeda(s.custo.total) + '</b><span>custo direto (sem BDI)</span></div>' +
        '<div class="om-card"><b data-om="horas">' + fmt(s.horasTotal, 1) + ' h</b><span>de mão de obra</span></div>' +
        '<div class="om-card"><b data-om="prazo">' + fmt(s.prazoParaleloDias, 1) + "–" + fmt(s.prazoSequencialDias, 1) + ' dias</b><span>em paralelo – em sequência</span></div>' +
        '<div class="om-card"><b data-om="peso">' + fmt(mod.peso.kg / 1000, 2) + ' t</b><span>' + mod.peso.comPeso + " peça(s) com peso" + (mod.peso.semPeso ? ", " + mod.peso.semPeso + " sem" : "") + "</span></div></div>";
      h += '<div class="om-mmq">MO ' + moeda(s.custo.mo) + " · MAT " + moeda(s.custo.mat) + " · EQ " + moeda(s.custo.eq) + "</div>";
      var ok = mod.porComposicao.filter(function (g) { return g.status === "ok"; });
      h += '<div class="om-tab-env"><table class="tbl om-tab"><thead><tr><th>Código</th><th>Descrição</th><th>Qtd</th><th>Total</th><th>Horas</th><th>Dias</th><th>Peças</th></tr></thead><tbody>';
      ok.forEach(function (g) {
        h += '<tr data-om-linha="' + esc(g.codigo) + '"' + (g.bloco ? ' data-om-bloco="' + esc(g.bloco) + '"' : "") + '><td>' + esc(g.codigo) + '</td><td class="om-d" title="' + esc(g.descricao) + '"><span>' + (g.bloco === "demolicao" ? "<b>Demolição</b> · " : "") + esc(g.descricao) + "</span></td><td>" + fmt(g.quantidade, 2) + " " + esc(unTela(g.unidade)) + "</td><td>" + moeda(g.custo.total) +
          '</td><td title="' + esc(horasTxt(g.horas)) + '">' + fmt(g.horasTotal, 1) + "</td><td>" + fmt(g.duracaoDias, 2) + "</td><td>" + g.elementos.length + "</td></tr>";
      });
      if (!ok.length) h += '<tr><td colspan="7" class="muted">Nenhuma peça com composição ainda — escolha a composição em Propriedades › Orçamento.</td></tr>';
      h += "</tbody></table></div>";
      /* equipe: uma linha por função que o modelo pede */
      if (s.horas.length) {
        h += '<div class="om-sec"><b>Equipe</b> <label class="om-hd">horas/dia <input type="number" min="1" max="24" step="0.5" data-om="hd" value="' + p.horasDia + '"></label><table class="tbl om-eq"><tbody>';
        s.horas.forEach(function (x) {
          h += '<tr><td>' + esc(x.funcao) + "</td><td>" + fmt(x.h, 1) + ' h</td><td><input type="number" min="1" step="1" data-om-eq="' + esc(x.chave) + '" value="' + x.pessoas + '" aria-label="pessoas — ' + esc(x.funcao) + '"> pessoa(s)</td><td>' + fmt(x.dias, 2) + " dia(s)" + (x.funcao === s.funcaoCritica ? " · crítica" : "") + "</td></tr>";
        });
        h += '</tbody></table><p class="muted om-nota">Em paralelo: cada função sem esperar a outra (o piso). Em sequência: um serviço depois do outro (o teto). A sequência real é a do cronograma.</p></div>';
      }
      /* P10 (js/bimfases.js): a REFORMA em três blocos — construção, demolição e o existente (fora) */
      if (mod.fases) {
        var fz = mod.fases;
        h += '<div class="om-sec" data-om="fases"><b>Reforma — fase "' + esc(fz.fase) + '"</b><div class="om-nota">Construção: <b data-om="fase-construcao">' + moeda(fz.construcao) + '</b> · Demolição: <b data-om="fase-demolicao">' + moeda(fz.demolicao) + "</b> (" + fz.demolidos.length + " peça(s))</div>" +
          (fz.existentes.length ? '<div class="om-nota" data-om="fase-existentes">Existente, fora do orçamento (' + fz.existentes.length + "): " + esc(fz.existentes.map(function (x) { return x.rotulo; }).join(", ")) + "</div>" : "") + "</div>";
      }
      if (mod.pendencias.length) {
        h += '<div class="om-sec om-pend" data-om="pendencias"><b>Fora do orçamento (' + mod.pendencias.length + ")</b><ul>";
        /* P11: a pendência com quantidade (o volume de corte/aterro sem composição) mostra a quantidade */
        mod.pendencias.forEach(function (g) { h += "<li" + (g.quantidade > 0 ? ' data-om-pend-qtd="' + esc(String(g.quantidade)) + '"' : "") + "><b>" + esc(g.codigo || "sem código") + "</b> " + esc(curto(g.descricao, 70)) + (g.quantidade > 0 ? " — " + fmt(g.quantidade, 2) + " " + esc(unTela(g.unidade)) : "") + " — " + g.elementos.length + " peça(s): " + esc((g.avisos || [])[0] || g.status) + "</li>"; });
        h += "</ul></div>";
      }
      h += '<div class="om-acoes"><button class="btn sm" data-om="atualizar">Atualizar</button><button class="btn sm primary" data-om="enviar"' + (ok.length ? "" : " disabled") + ">Enviar ao orçamento da obra</button></div>";
      corpo.innerHTML = h;
      this._ultimo = mod;
      this._ligar(corpo);
    },
    _ligar: function (corpo) {
      var self = this;
      corpo.onclick = function (e) {
        var b = e.target.closest ? e.target.closest("[data-om]") : null; if (!b || b.tagName === "INPUT") return;
        var k = b.getAttribute("data-om");
        if (k === "carregar") self.carregarBase();
        else if (k === "atualizar") self.renderPainel();
        else if (k === "enviar") self.enviar();
      };
      corpo.onchange = function (e) {
        var t = e.target, p = self.prefs(), v = parseFloat(String(t.value).replace(",", "."));
        if (t.getAttribute("data-om") === "hd") { if (v > 0 && v <= 24) p.horasDia = v; }
        else if (t.getAttribute("data-om-eq")) { if (v >= 1) p.equipe[t.getAttribute("data-om-eq")] = Math.round(v); }
        else return;
        self.gravarPrefs(); self.renderPainel(); self._repintarProps();
      };
    },

    /* ------------------------------------------------ ENVIAR AO ORÇAMENTO */
    enviar: function () {
      var self = this, mod = this.calcular();
      if (!mod) { toast("Carregue a base SINAPI primeiro.", "aviso"); return; }
      var seed = OrcModelo.paraOrcamento(mod, { nomeEtapa: "Modelo BIM — orçamento pelo modelo" });
      if (!seed.itens.length) { toast("Nada para lançar: nenhuma peça tem composição orçada.", "aviso"); return; }
      var G = global.Gestao, obra = null;
      try { obra = G && G._bimSel ? Store.obter(Auth.empresaId(), "obras", G._bimSel) : null; } catch (e) {}
      var antes = []; try { antes = (Store.listarOrcamentos(Auth.empresaId()) || []).filter(function (o) { return o && o.origemBim && o.origemBim.obraId === (G && G._bimSel || null); }); } catch (e2) {}
      var tot = 0; seed.itens.forEach(function (it) { var g = mod.porComposicao.filter(function (x) { return x.codigo === it.codigo && x.status === "ok"; })[0]; if (g) tot += g.custo.total; });
      var html = '<p style="font-size:13px">Vai ser criado um <b>orçamento novo</b>' + (obra ? " para a obra <b>" + esc(obra.nome) + "</b>" : "") + " com <b>" + seed.itens.length + " composição(ões)</b> do modelo — " + moeda(tot) + " de custo direto na base " + esc(this.rotuloBase()) + ". O BDI e as condições entram no orçamento, como sempre.</p>" +
        '<div style="max-height:260px;overflow:auto"><table class="tbl" data-om="previa"><thead><tr><th>Código</th><th>Descrição</th><th>Qtd</th></tr></thead><tbody>' +
        seed.itens.map(function (it) { return "<tr><td>" + esc(it.codigo) + "</td><td>" + esc(curto(it.descricao, 70)) + "</td><td>" + fmt(it.quantidade, 2) + " " + esc(unTela(it.unidade)) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        (seed.fora.length ? '<p style="font-size:12.5px;color:var(--amarelo,#b45309)"><b>Não entram (' + seed.fora.length + "):</b> " + seed.fora.map(function (f) { return esc((f.codigo || "sem código") + " — " + f.motivo); }).join("; ") + "</p>" : "") +
        (antes.length ? '<p class="muted" style="font-size:12.5px">Já existe ' + antes.length + " orçamento(s) feito(s) do modelo desta obra. Ele(s) fica(m) como está(ão): este é OUTRO.</p>" : "") +
        '<p class="muted" style="font-size:12px">O orçamento atual da obra não é tocado. Para trocá-lo por este, vincule em Obras › Vincular a um orçamento.</p>';
      if (!global.UI || !UI.modal) return;
      UI.modal("Enviar ao orçamento da obra", html, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar o orçamento", classe: "primary", onClick: function () { UI.fecharModal(); self.criarOrcamento(seed, obra); } }
      ]);
    },
    criarOrcamento: function (seed, obra) {
      var A = global.App, G = global.Gestao;
      if (A && A._trialBloqueado && A._trialBloqueado()) { if (A._avisoTrial) A._avisoTrial(); return null; }
      if (A && A._orcNovoRecusado && A._orcNovoRecusado()) return null;
      if (!global.Orcamento || !global.Store || !global.Auth) { toast("O módulo de orçamento não carregou.", "erro"); return null; }
      var lim = Auth.limite ? Auth.limite("limiteItensPorOrcamento") : Infinity;
      if (seed.itens.length > lim) { toast("O modelo tem " + seed.itens.length + " composições e o seu plano aceita " + lim + " itens por orçamento.", "erro", 9000); return null; }
      var orc = Orcamento.novo({ nome: "Orçamento do modelo — " + (obra ? obra.nome : "BIM"), obra: obra ? obra.nome : "" });
      Orcamento.addEtapa(orc, seed.nome);
      var etapa = orc.etapas[orc.etapas.length - 1], semPreco = 0, etapaConstr = etapa, etapaDem = null;
      seed.itens.forEach(function (it) {
        /* P10: a demolição da reforma vai numa etapa própria */
        if (it.bloco === "demolicao") { if (!etapaDem) { Orcamento.addEtapa(orc, "Demolição (reforma) — do modelo"); etapaDem = orc.etapas[orc.etapas.length - 1]; } etapa = etapaDem; } else etapa = etapaConstr;
        var b = null;
        try { b = global.Bases && Bases.obter ? Bases.obter("SINAPI", it.codigo) : null; } catch (e) { b = null; }
        if (!b && global.Sinapi && Sinapi.obter) b = Sinapi.obter(it.codigo);
        var item;
        if (b) {
          item = JSON.parse(JSON.stringify(b)); item.baseFonte = "SINAPI";
          var qb = Analitico.quebra(it.codigo, b.custoUnitario); item.custoMO = qb.custoMO; item.custoMAT = qb.custoMAT; item.custoEQ = qb.custoEQ;
        } else {
          /* a base sintética não tem o código (outra competência?): o preço é o do analítico carregado */
          var a = Analitico.obter(it.codigo);
          item = { codigo: a.codigo, descricao: a.descricao, unidade: a.unidade, custoUnitario: a.custoUnitario, custoMO: a.custoMO, custoMAT: a.custoMAT, custoEQ: a.custoEQ, baseFonte: "SINAPI" };
        }
        if (!(Number(item.custoUnitario) > 0)) semPreco++;
        Orcamento.addItem(orc, etapa.id, item, it.quantidade);
        var nv = etapa.itens[etapa.itens.length - 1];
        if (nv) nv.bimElementos = (it.elementos || []).slice(0, 200);   /* de que peças do modelo a quantidade veio */
      });
      /* o carimbo da origem é a auditoria: quando, de que obra, de que base */
      orc.origemBim = { obraId: (G && G._bimSel) || null, em: (U() && U().agoraISO) ? U().agoraISO() : new Date().toISOString(),
                        base: this.rotuloBase(), composicoes: seed.itens.length, fora: seed.fora.length };
      var g = Store.salvarOrcamento(Auth.empresaId(), orc);
      if (!g) { toast("Não gravei o orçamento (armazenamento cheio ou lista ilegível). Nada foi criado.", "erro", 9000); return null; }
      try { console.info("[orcmodelo] orçamento criado " + orc.id + " (" + seed.itens.length + " itens, obra " + orc.origemBim.obraId + ")"); } catch (eC) {}
      toast("Orçamento \"" + orc.nome + "\" criado: " + seed.itens.length + " composição(ões)" + (semPreco ? ", " + semPreco + " sem preço na base — revise" : "") + ". Abra em Orçamentos.", "ok", 9000);
      return orc;
    }
  };

  global.OrcModeloUI = OrcModeloUI;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcModeloUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimcotasui.js — a TELA do "cotar fácil" (13/10/2026). O motor é o
 * js/bimcotas.js (puro); a cota da vista 2D é a da P7 (js/bimanot.js +
 * js/bimanot2dui.js), que este arquivo estende.
 *
 * Pedido do Rogério: "para fazer cota tá muito difícil". O que muda:
 *   · UMA ferramenta de cota (Anotar › Cotas › Cota) que vale no 3D, na
 *     planta e no corte: o ponto encaixa em ponta, meio, centro de furo,
 *     cruzamento de eixos, eixo e face; o VALOR aparece antes do clique
 *     (prévia elástica); Tab alterna automático → eixo → face; o valor sai
 *     arredondado pelo padrão (mm na metálica, cm no resto — configurável);
 *   · Cotar seleção: as peças escolhidas viram cadeia + total na direção
 *     dominante (e a perpendicular) — no 3D ou na vista 2D ativa;
 *   · Cotar a vista: eixos e vãos na planta; níveis e alturas no corte;
 *     eixos e níveis no 3D;
 *   · Coordenada, Cota de nível (TOS/TOL), Inclinação (% e °) e Furação
 *     de chapa (a cadeia dos furos a partir da borda);
 *   · a cota é ASSOCIATIVA (guarda a peça, não o ponto) e, se a peça some,
 *     fica ÓRFÃ em vermelho; editar depois: arrastar a linha, mover o
 *     texto, texto substituto, precisão, tamanho — tudo op do editor (Ctrl+Z).
 *
 * QUEM FAZ O QUÊ
 *   js/bimcotas.js ...... a conta (referências, cadeias, ops cota3d);
 *   este arquivo ........ fita, ferramenta no 3D (sub "cota3d" do editor),
 *                         desenho das cotas 3D, seleção, arrasto,
 *                         Propriedades, e os ganchos da cota 2D (encaixe,
 *                         valor na prévia, arredondamento, TOS/TOL);
 *   js/bim.js ........... só ganchos (S._cot): pointermove, clique, Esc,
 *                         troca de ferramenta e o fim do refazer da cena.
 * Cores pelos tokens do css/app.css (tema claro e escuro); css/bimcotas.css.
 * Só com o modelador (BimPrevia.modelador()).
 * ===================================================================== */
(function (global) {
  "use strict";

  var SUB = "cota3d";
  var CHAVE = "orcapro:bim:cotas:cfg:v1";
  /* o comando da fita → o que a ferramenta faz no 3D */
  var CMD_MODO = { "p7-cota-alinhada": "alinhada", "p7-cota-elevacao": "nivel", "p7-cota-inclinacao": "inclinacao", "cota-coordenada": "coordenada" };
  var ROT_MODO = { alinhada: "Cota", nivel: "Cota de nível", inclinacao: "Inclinação", coordenada: "Cota por coordenada", selecionar: "Cotar seleção" };
  var PREFS = ["auto", "eixo", "face"];
  var ROT_PREF = { auto: "automático (ponto, eixo ou face)", eixo: "eixo e centro", face: "face e ponta" };
  var ROT_K = { linear: "Linear (cadeia)", alinhada: "Alinhada", coordenada: "Coordenada", nivel: "Nível", inclinacao: "Inclinação" };

  function BC() { return global.BimCotas || null; }
  function A7() { return global.BimAnotP7 || null; }
  function U2() { return global.BimAnot2DUI || null; }
  function B() { return global.BIM || null; }
  function P2() { return global.Bim2D || null; }
  function R() { return global.BimRibbon || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function token(nome, reserva) {
    try { var v = global.getComputedStyle(global.document.documentElement).getPropertyValue(nome).trim(); if (v) return v; } catch (e) {}
    return reserva;
  }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  var _n = 0;
  function novoId(pre) { _n++; return (pre || "c3") + Date.now().toString(36) + _n.toString(36); }

  /* ------------------------------------------------ preferências (do aparelho) */
  var CFG = null;
  function cfg() {
    if (CFG) return CFG;
    var o = null; try { o = JSON.parse(global.localStorage.getItem(CHAVE) || "null"); } catch (e) { o = null; }
    CFG = { padrao: "auto", pref: "auto", dir: "auto", encaixe: true, tam: 1 };
    if (o && typeof o === "object") Object.keys(CFG).forEach(function (k) { if (o[k] != null) CFG[k] = o[k]; });
    return CFG;
  }
  function gravar() { try { global.localStorage.setItem(CHAVE, JSON.stringify(cfg())); } catch (e) {} }
  function padraoCfg() { var p = cfg().padrao; return p === "mm" || p === "cm" ? p : null; }

  /* ------------------------------------------------ a vista ativa */
  function vistaAtiva() { try { return global.Gestao && global.Gestao._bimVxEst ? global.Gestao._bimVxEst().ativa : "3d"; } catch (e) { return "3d"; } }
  function vista2d() {
    var a = vistaAtiva(), P = P2();
    return P && a && P.ehVista2d && P.ehVista2d(a) && P._cache && P._cache[a] && P._cache[a].el ? a : null;
  }
  function projVista(id) {
    var P = P2(), d = P && P.def ? P.def(id) : null; if (!d) return null;
    var c = d.corte; if (c && fin(+c.ax) && fin(+c.bx)) return { tipo: "corte", ax: +c.ax, az: +c.az, bx: +c.bx, bz: +c.bz, inv: !!c.inv };
    if (d.tipo === "planta" || d.nivel || /^d2p-/.test(id)) return { tipo: "planta" };
    return null;
  }
  function estado() { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; } catch (x) { return null; } }
  function selecionados() {
    var b = B(), out = [];
    try { ((b && b.selecao ? b.selecao() : null) || { uids: [] }).uids.forEach(function (u) { if (/^edit:/.test(u)) out.push(u.slice(5)); }); } catch (e) {}
    return out;
  }
  /* várias ops viram UM lote (um Ctrl+Z desfaz o "Cotar seleção" inteiro) */
  function aplicar(ops, pedido) {
    var b = B(); if (!b || !ops || !ops.length) return false;
    if (ops.length === 1 && b.b2Op) return b.b2Op(ops[0]);
    return !!(b.editarLote && b.editarLote({ op: "lote", id: novoId("lc"), origem: "cotas", pedido: String(pedido || "Cotas").slice(0, 300), ops: ops }));
  }

  var BimCotasUI = {
    SUB: SUB, CMD_MODO: CMD_MODO,
    cfg: cfg,
    _3d: null,

    /* ------------------------------------------------ preferências na tela */
    mudarCfg: function (pid, valor) {
      var k = String(pid).replace(/^bct-/, ""), c = cfg();
      if (k === "encaixe") c.encaixe = valor === true || valor === "sim" || valor === "1" || valor === 1;
      else if (k === "tam") c.tam = Math.max(0.5, Math.min(3, num(valor, 1)));
      else if (k in c) c[k] = String(valor);
      gravar();
      if (this._3d) { this._3d.redesenhar(); this._3d.limparCache(); }
      try { if (U2()) U2()._candCache = null; } catch (e) {}
      this._redesenhar2d();
      return true;
    },
    alternarPref: function () {
      var c = cfg(), i = PREFS.indexOf(c.pref); c.pref = PREFS[(i + 1) % PREFS.length]; gravar();
      if (this._3d) this._3d.limparCache();
      return ROT_PREF[c.pref];
    },
    /* os parâmetros que entram em Propriedades da ferramenta (3D e 2D) */
    paramsFerramenta: function () {
      var c = cfg();
      return [
        { id: "bct-pref", rotulo: "Encaixe (Tab)", tipo: "lista", valor: c.pref, opcoes: PREFS.map(function (p) { return { id: p, rotulo: ROT_PREF[p] }; }) },
        { id: "bct-padrao", rotulo: "Arredondamento", tipo: "lista", valor: c.padrao, opcoes: [{ id: "auto", rotulo: "Automático (mm na metálica, cm no resto)" }, { id: "mm", rotulo: "Sempre mm" }, { id: "cm", rotulo: "Sempre cm (m com 2 casas)" }] },
        { id: "bct-dir", rotulo: "Direção (3D)", tipo: "lista", valor: c.dir, opcoes: [{ id: "auto", rotulo: "Alinhada (a reta dos pontos)" }, { id: "x", rotulo: "Horizontal X" }, { id: "z", rotulo: "Horizontal Z" }, { id: "y", rotulo: "Vertical" }] },
        { id: "bct-encaixe", rotulo: "Encaixe ligado", tipo: "sim-nao", valor: c.encaixe !== false }
      ];
    },
    _redesenhar2d: function () {
      var P = P2(); if (!P || !P._cache) return;
      Object.keys(P._cache).forEach(function (k) { try { if (P._cache[k] && P._cache[k].el) P.redesenhar(k, false); } catch (e) {} });
    },

    /* ------------------------------------------------ ganchos da cota 2D (js/bimanot2dui.js) */
    /* antes de gravar a cota 2D: o tipo em mm quando pega metálica, a inclinação em graus e o TOS/TOL */
    ajustarCota2d: function (base, st, vista) {
      var C = BC(), M = A7(); if (!C || !M || !base) return base;
      var refs3 = (base.refs || []).filter(function (r) { return r && r.el != null; }).map(function (r) { return { el: r.el }; });
      var pad = padraoCfg() || C.padraoDe(st, refs3, cfg());
      if ((base.cota === "linear" || base.cota === "alinhada" || base.cota === "coordenada") && !base.tipoCota && pad === "mm") base.tipoCota = "linear-mm";
      if (base.cota === "inclinacao") base.graus = true;
      if (base.cota === "elevacao" && !base.prefixo && base.refs && base.refs[0] && base.refs[0].el != null) {
        var r0 = base.refs[0], pre = C.prefixoNivel(st, { el: r0.el });
        if (pre && (r0.k === "topo" || r0.r === "topo")) base.prefixo = pre + " ";
      }
      return base;
    },
    /* o valor que a prévia da cota 2D mostra antes do clique */
    textoPrevia2d: function (st, vista, f, refCur) {
      var M = A7(), C = BC(); if (!M || !f || !f.def) return "";
      var k = f.def.cota, refs = (f.refs || []).concat(refCur ? [refCur] : []);
      try {
        if (k === "linear" || k === "alinhada" || k === "coordenada") {
          if (refs.length < 2) return "";
          var o = U2() ? U2().opcoes() : {}, orient = k !== "alinhada" ? (o.orient === "h" || o.orient === "v" ? o.orient : (U2() ? U2()._orientAuto(st, refs, null, /^d2c-/.test(vista)) : "h")) : undefined;
          var it = { tipo: "cota", cota: k, refs: refs, orient: orient, vista: vista };
          this.ajustarCota2d(it, st, vista);
          var m = M.medirCota(st, it, { corte: /^d2c-/.test(vista), vista: vista }); if (!m.ok) return "";
          var t = M.tipoCotaDe(st, it);
          var ult = k === "coordenada" ? m.segs[m.segs.length - 1].valor : m.segs[m.segs.length - 1].valor;
          var txt = M.textoCota(it, t, ult, false);
          if (k !== "coordenada" && m.segs.length > 1) txt += "  ·  total " + M.textoCota(it, t, m.total, false);
          return txt;
        }
        if (k === "elevacao") {
          var it2 = { tipo: "cota", cota: "elevacao", refs: [refCur || {}], vista: vista };
          this.ajustarCota2d(it2, st, vista);
          var I = M.indice(st), x = refCur ? M.resolverRef(I, refCur, { corte: /^d2c-/.test(vista), vista: vista }) : null;
          if (!x || !x.ok) return "";
          var y = fin(x.y) ? x.y : (/^d2c-/.test(vista) ? -x.p[1] : null); if (!fin(y)) return "";
          return M.textoCota(it2, M.tipoCotaDe(st, it2), y, false);
        }
        if (k === "inclinacao") {
          if (refs.length < 2) return "";
          var it3 = { tipo: "cota", cota: "inclinacao", refs: refs.slice(-2), vista: vista, graus: true };
          var m3 = M.medirCota(st, it3, { corte: /^d2c-/.test(vista), vista: vista }); if (!m3.ok) return "";
          return M.textoCota(it3, M.tipoCotaDe(st, it3), m3.valor, false);
        }
      } catch (e) { return ""; }
      return "";
    },

    /* ------------------------------------------------ comandos */
    cotarSelecao: function (ids) {
      var C = BC(), e = estado(); if (!C || !e) { toast("Abra o editor do modelo primeiro.", "aviso"); return false; }
      ids = ids && ids.length ? ids : selecionados().concat(this._3d ? this._3d.coleta() : []);
      var v = vista2d(), r;
      if (v) {
        var pj = projVista(v); if (!pj) { toast("Esta vista ainda não aceita cota automática: use a planta ou um corte.", "aviso"); return false; }
        r = C.cotarSelecaoVista(e, ids, v, pj, { padrao: padraoCfg(), cfg: cfg() });
      } else r = C.cotarSelecao(e, ids, { padrao: padraoCfg() });
      if (!r.ok) {
        /* no 3D, sem seleção: o modo de escolher clicando (eixos e tubos também) */
        if (!v && ids.length < 2 && this._3d) { this.armar3d("selecionar", "cotar-selecao"); return true; }
        toast(r.motivo, "aviso"); return false;
      }
      var ok = aplicar(r.ops, "Cotar seleção");
      /* o resumo no MESMO arredondamento das cotas (mm na metálica) */
      var fm = C.PADROES[padraoCfg() || C.padraoDe(e, ids.map(function (x) { return { el: x }; }), cfg())] || C.PADROES.cm;
      var res = (r.cadeias || []).map(function (c) { return c.valores.map(function (x) { return C.fmtComp(x, fm); }).join(" + ") + " = " + C.fmtComp(c.total, fm); }).join("; ");
      if (ok) { status("Cotado" + (v ? " na vista" : " no 3D") + ": " + res + (fm.unidade === "mm" ? " mm" : " m") + ". Ctrl+Z desfaz."); if (this._3d) this._3d.coletaLimpar(); }
      return ok;
    },
    cotarVista: function () {
      var C = BC(), e = estado(); if (!C || !e) { toast("Abra o editor do modelo primeiro.", "aviso"); return false; }
      var v = vista2d(), r, E = global.BimEdit, temNiv = !!(E && E.niveisAtuais && (E.niveisAtuais() || []).length);
      if (v) {
        var pj = projVista(v), P = P2(), d = P.def(v), c = P._cache[v], D = global.Desenho2D, cx = null;
        if (!pj) { toast("Esta vista ainda não aceita cota automática: use a planta ou um corte.", "aviso"); return false; }
        try { cx = c && c.dados && D && D.caixa ? D.caixa(c.dados) : null; } catch (eC) { cx = null; }
        var niv = temNiv ? null : (P.niveis() || []).map(function (n) { return { id: n.id, nome: n.nome, elevacao: n.y }; });
        r = C.cotarVista(e, v, pj, { niveis: niv, caixa: cx, nivelY: d && d.nivel ? d.nivel.y : null });
      } else {
        var y = 0; try { var nv = global.BimArqUI && global.BimArqUI.nivelAtivo ? global.BimArqUI.nivelAtivo() : null; if (nv) y = nv.elevacao; } catch (eN) {}
        r = C.cotarVista3d(e, { y: y, padrao: padraoCfg() });
      }
      if (!r.ok) { toast(r.motivo, "aviso"); return false; }
      var ok = aplicar(r.ops, "Cotar a vista");
      /* a vista se enquadra para mostrar as cotas novas (as dos níveis ficam fora do desenho, à esquerda) */
      if (ok && v) setTimeout(function () { try { var P = P2(); P.redesenhar(v, false); P.ajustar(v); } catch (eA) {} }, 150);
      if (ok) status("Vista cotada" + (r.resumo && r.resumo.length ? ": " + r.resumo.join("; ") : "") + ". Cotar de novo refaz (não empilha); Ctrl+Z desfaz.");
      return ok;
    },
    furacao: function (id) {
      var C = BC(), e = estado(); if (!C || !e) return false;
      var ids = id ? [id] : selecionados().concat(this._3d ? this._3d.coleta() : []);
      var ch = ids.filter(function (x) { var g = C.geom(C.acharPeca(e, x)); return g && g.chapa; })[0];
      if (!ch) { toast("Selecione uma CHAPA com furos: a furação é cotada a partir da borda.", "aviso"); return false; }
      var v = vista2d(), r;
      if (v && projVista(v) && projVista(v).tipo === "planta") r = C.furacaoVista(e, ch, v, projVista(v));
      else r = C.furacao(e, ch);
      if (!r.ok) { toast(r.motivo, "aviso"); return false; }
      var ok = aplicar(r.ops, "Furação de chapa");
      if (ok) status("Furação cotada a partir da borda (mm), nas duas direções da chapa. Ctrl+Z desfaz.");
      return ok;
    },
    dialogoPadrao: function () {
      var self = this, c = cfg();
      if (!global.UI || !global.UI.modal) return false;
      var op = function (v, rot, d) { return '<label class="bct-op"><input type="radio" name="bct-pad" value="' + v + '"' + (c.padrao === v ? " checked" : "") + "> <b>" + esc(rot) + "</b><br><span class=\"fraco\">" + esc(d) + "</span></label>"; };
      var h = '<div class="bct-dlg">' +
        op("auto", "Automático", "mm quando a cota pega peça metálica (6000), cm no resto (6,00 = metros com 2 casas, arredondado ao centímetro).") +
        op("mm", "Sempre milímetro", "Toda cota nova em mm inteiro (fabricação).") +
        op("cm", "Sempre centímetro", "Toda cota nova em metros com 2 casas (arquitetura).") +
        '<p class="fraco">Cada cota pode ter a sua unidade e casas em Propriedades. Vale para este aparelho.</p></div>';
      global.UI.modal("Arredondamento das cotas", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Gravar", classe: "primary", onClick: function () {
          var s = document.querySelector('input[name="bct-pad"]:checked'); global.UI.fecharModal();
          if (s) { self.mudarCfg("padrao", s.value); status("Arredondamento: " + (s.value === "auto" ? "automático (mm na metálica, cm no resto)" : s.value) + "."); }
        } }
      ]);
      return true;
    },
    irParaCotas: function () {
      var r = R(); if (!r || !r.irPara("anotar")) return false;
      try { if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } catch (e) {}
      status("Anotar › Cotas: Cota, Cotar seleção, Cotar a vista, Coordenada, Cota de nível (TOS), Inclinação e Furação de chapa.");
      return true;
    },

    /* ------------------------------------------------ a ferramenta no 3D */
    armar3d: function (modo, cmd) {
      var b = B(); if (!b || !b.editarArmar || !this._3d) return false;
      this._3d.preparar(modo, cmd);
      var ok = b.editarArmar(SUB);
      return ok !== false;
    },
    desarmar3d: function (manterFita) {
      var b = B(); if (!this._3d) return;
      this._3d.soltarFita = !!manterFita;
      try { if (this._3d.armado() && b && b.editarArmar) b.editarArmar(null); } catch (e) {}
      this._3d.soltarFita = false;
    },

    /* ------------------------------------------------ fita */
    registrar: function (reg, G) {
      if (!previa() || !R() || !BC()) return false;
      var self = this, Rb = R();
      Rb.acrescentar("anotar", "Anotar", "Cotas", [
        { id: "cotar-selecao", rotulo: "Cotar\nseleção", icone: "regua", grande: true, dica: "Selecione pilares, eixos, paredes, perfis, vigas ou tubos (Ctrl + clique soma) e clique: sai a cadeia de cotas + o total na direção dominante, e a perpendicular quando há duas filas. No 3D ou na vista 2D ativa. Sem seleção no 3D, clique as peças (eixos e tubos também) e Enter." },
        { id: "cotar-vista", rotulo: "Cotar a\nvista", icone: "planta", grande: true, dica: "Cota a vista inteira de uma vez: na planta, os eixos e os vãos (ou os pilares); no corte, os níveis, as alturas entre eles e os eixos que o corte cruza; no 3D, os eixos e os níveis. Cotar de novo refaz sem empilhar." },
        { id: "cota-furacao", rotulo: "Furação\nde chapa", icone: "alvo", dica: "Selecione uma chapa com furos: a cadeia dos furos a partir da BORDA, nas duas direções da chapa, em mm (como a fábrica fura)." },
        { id: "cotas-padrao", rotulo: "Arredondamento", icone: "ajustes", dica: "O padrão do valor das cotas: automático (mm na metálica, cm no resto), sempre mm ou sempre cm. Cada cota pode mudar em Propriedades." }
      ]);
      /* a ordem do grupo: o que mais se usa primeiro */
      try {
        var ab = Rb.aba("anotar"), pn = ab ? ab.paineis.filter(function (p) { return p.nome === "Cotas"; })[0] : null;
        if (pn) {
          var ORD = ["p7-cota-alinhada", "cotar-selecao", "cotar-vista", "cota-coordenada", "p7-cota-linear", "p7-cota-elevacao", "p7-cota-inclinacao", "cota-furacao",
                     "p7-cota-angular", "p7-cota-radial", "p7-cota-diametro", "p7-cota-arco", "cotas-padrao", "p7-tipos"];
          pn.comandos.sort(function (a, b) { var ia = ORD.indexOf(a.id), ib = ORD.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
        }
      } catch (eO) {}
      /* o atalho na Metálica: o mesmo grupo, sem repetir comando */
      if (Rb.aba("metalica")) {
        Rb.acrescentar("metalica", "Metálica & Mecânica", "Cotas", [
          { id: "met-cotas", rotulo: "Cotas", icone: "regua", grande: true, dica: "Atalho: abre Anotar › Cotas — Cota (encaixa em ponta, meio, centro de furo e eixo, em mm), Cotar seleção, Cota de nível (TOS), Inclinação e Furação de chapa." }
        ]);
        try { if (global.BimDisciplinas && global.BimDisciplinas.declarar) global.BimDisciplinas.declarar(["met-cotas"], "metalica"); } catch (eD) {}
      }
      reg["cotar-selecao"] = function () { self.cotarSelecao(); return true; };
      reg["cotar-vista"] = function () { self.cotarVista(); return true; };
      reg["cota-furacao"] = function () { self.furacao(); return true; };
      reg["cotas-padrao"] = function () { self.dialogoPadrao(); return true; };
      reg["met-cotas"] = function () { self.irParaCotas(); return true; };
      /* Cota, Cota de nível, Inclinação e Coordenada: na vista 2D é a ferramenta da P7 (com o encaixe
         e o valor daqui); com o 3D na frente, a ferramenta do 3D — o mesmo botão */
      Object.keys(CMD_MODO).forEach(function (id) {
        var orig = reg[id];
        reg[id] = function (e) {
          if (e && e.ligado === false) { self.desarmar3d(); return orig ? orig(e) : true; }
          if (!vista2d() && self._3d) {
            try { if (U2() && U2()._f) { U2()._f = null; U2()._limparPrevia(); U2()._marcarVistas(false); } } catch (eU) {}
            return self.armar3d(CMD_MODO[id], id);
          }
          self.desarmar3d(true);
          return orig ? orig(e) : false;
        };
        try { if (Rb._EXCLUSIVOS && Rb._EXCLUSIVOS.indexOf(id) < 0) Rb._EXCLUSIVOS.push(id); } catch (eX) {}
      });
      /* a projeção do corte para a cota 2D (referência 3D dentro da cota do corte) */
      try { if (A7() && A7().fonteVistas) A7().fonteVistas(projVista); } catch (eF) {}
      this._ganchos2d();
      this._dicas();
      if (global.BimBarraOpcoes && global.BimBarraOpcoes.declarar) global.BimBarraOpcoes.declarar(SUB, { rotulo: "Cota" });
      return true;
    },
    /* a cota 2D armada e a pessoa clica no 3D (ou o contrário): a mesma ferramenta segue na outra vista */
    _ganchos2d: function () {
      var U = U2(), self = this; if (!U || U._cotGancho) return;
      U._cotGancho = true;
      var c2 = U.clique2d;
      U.clique2d = function (id, ev, p) {
        var t3 = self._3d;
        if (!this._f && t3 && t3.armado() && t3.cmd() && R() && R().ativo(t3.cmd()) && CMD_MODO[t3.cmd()]) {
          var cmd = t3.cmd(); self.desarmar3d(true);
          R().setAtivo(cmd, true); this.armar(cmd);
        }
        return c2.call(this, id, ev, p);
      };
    },
    /* a dica ilustrada (DicaRica) de cada ferramenta */
    _dicas: function () {
      var D = global.DicaRica; if (!D || !D.item) return;
      var S = function (corpo) { return '<svg viewBox="0 0 200 92" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.4" style="color:var(--texto,#1d2733)">' + corpo + "</svg>"; };
      var cot = function (x0, x1, y, t) { return '<path d="M' + x0 + " " + (y - 8) + "V" + (y + 4) + "M" + x1 + " " + (y - 8) + "V" + (y + 4) + "M" + (x0 - 4) + " " + y + "H" + (x1 + 4) + '" style="stroke:var(--aco,#0d6ebd)"/><path d="M' + (x0 - 3) + " " + (y + 3) + "l6 -6M" + (x1 - 3) + " " + (y + 3) + 'l6 -6" style="stroke:var(--aco,#0d6ebd)"/><text x="' + ((x0 + x1) / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10" stroke="none" style="fill:var(--aco,#0d6ebd)">' + t + "</text>"; };
      var pil = function (x) { return '<rect x="' + (x - 5) + '" y="44" width="10" height="10" style="fill:var(--texto-fraco,#8494a6)" stroke="none"/>'; };
      D.item("p7-cota-alinhada", { titulo: "Cota", oQueE: "A cota de dois (ou mais) pontos de peça: ponta, meio, face, eixo ou centro de furo. O valor aparece antes do clique; Tab alterna face/eixo.",
        ondeUsa: "No 3D, na planta e no corte. Presa às peças: a peça anda, troca de perfil ou de nível e a cota mede de novo; se a peça sumir, a cota fica vermelha (órfã).",
        dica: "Mais referências fazem cadeia; o clique no vazio posiciona a linha. Arraste a linha ou o texto depois, com a cota selecionada.",
        svg: S(pil(40) + pil(100) + pil(160) + cot(40, 100, 30, "6000") + cot(100, 160, 30, "6000")) });
      D.item("cotar-selecao", { titulo: "Cotar seleção", oQueE: "Um clique cota todas as peças selecionadas: a cadeia + o total na direção dominante e a perpendicular quando há duas filas.",
        ondeUsa: "Pilares, eixos, paredes, perfis metálicos, vigas e tubos — no 3D ou na planta/corte aberto.", dica: "Metálica sai em mm (6000), o resto em cm (6,00). Um Ctrl+Z desfaz o grupo inteiro.",
        svg: S(pil(40) + pil(100) + pil(160) + cot(40, 100, 26, "6,00") + cot(100, 160, 26, "6,00") + cot(40, 160, 12, "12,00")) });
      D.item("cotar-vista", { titulo: "Cotar a vista", oQueE: "A vista inteira cotada de uma vez.", ondeUsa: "Planta: eixos e vãos. Corte: níveis, alturas entre níveis e eixos que o corte cruza. 3D: eixos e níveis.",
        dica: "Cotar de novo refaz as automáticas (não empilha).",
        svg: S('<path d="M40 70V20M100 70V20M160 70V20" stroke-dasharray="6 3 1 3" style="stroke:var(--texto-fraco,#8494a6)"/>' + cot(40, 100, 84, "6,00") + cot(100, 160, 84, "6,00")) });
      D.item("cota-coordenada", { titulo: "Cota por coordenada", oQueE: "Cada ponto com a distância até uma ORIGEM (cota ordenada).", ondeUsa: "Furação, locação de pilares e inserts — sem acumular erro de cadeia.",
        dica: "Clique a origem, depois os pontos; Enter termina.",
        svg: S('<path d="M30 70H180" style="stroke:var(--aco,#0d6ebd)"/><path d="M30 70V30M90 70V30M150 70V30" style="stroke:var(--aco,#0d6ebd)"/><text x="30" y="24" font-size="10" text-anchor="middle" stroke="none" style="fill:var(--aco,#0d6ebd)">0</text><text x="90" y="24" font-size="10" text-anchor="middle" stroke="none" style="fill:var(--aco,#0d6ebd)">600</text><text x="150" y="24" font-size="10" text-anchor="middle" stroke="none" style="fill:var(--aco,#0d6ebd)">1200</text>') });
      D.item("p7-cota-elevacao", { titulo: "Cota de nível (TOS/TOL)", oQueE: "A cota de nível do ponto: o topo do aço (TOS), da laje ou do piso (TOL) ou o nível da vista.", ondeUsa: "No 3D, na planta e no corte. A peça muda de nível e a cota acompanha.",
        dica: "O prefixo TOS/TOL sai sozinho pelo tipo da peça; troque em Propriedades.",
        svg: S('<rect x="40" y="46" width="120" height="12" style="fill:var(--texto-fraco,#8494a6)" stroke="none"/><path d="M100 46l-6 -9h12z" style="stroke:var(--aco,#0d6ebd)"/><path d="M100 37V22H160" style="stroke:var(--aco,#0d6ebd)"/><text x="104" y="18" font-size="10" stroke="none" style="fill:var(--aco,#0d6ebd)">TOS +6,000</text>') });
      D.item("p7-cota-inclinacao", { titulo: "Inclinação", oQueE: "A inclinação entre dois pontos, em % e em graus (12,5% (7,1°)).", ondeUsa: "Terça, diagonal, rampa, tubo de esgoto; na planta, a água da cobertura.",
        dica: "No 3D e no corte, clique os dois pontos; o desnível vem das peças.",
        svg: S('<path d="M30 70L170 30" style="stroke:var(--texto,#1d2733)"/><path d="M60 50L140 28" style="stroke:var(--aco,#0d6ebd)"/><text x="100" y="22" font-size="10" text-anchor="middle" stroke="none" style="fill:var(--aco,#0d6ebd)">28,6% (16,0°)</text>') });
      D.item("cota-furacao", { titulo: "Furação de chapa", oQueE: "A cadeia dos furos a partir da BORDA da chapa, nas duas direções, em mm.", ondeUsa: "Chapa de ligação, placa de base, gusset — a medida que a fábrica marca.",
        dica: "Selecione a chapa e clique. A cota acompanha a chapa quando ela anda.",
        svg: S('<rect x="40" y="30" width="120" height="44" style="stroke:var(--texto,#1d2733)"/><circle cx="60" cy="52" r="5"/><circle cx="100" cy="52" r="5"/><circle cx="140" cy="52" r="5"/>' + cot(40, 60, 18, "50") + cot(60, 100, 18, "100") + cot(100, 140, 18, "100") + cot(140, 160, 18, "50")) });
      D.item("cotas-padrao", { titulo: "Arredondamento", oQueE: "Como o valor das cotas novas sai: mm na metálica e cm no resto, ou sempre um deles.", ondeUsa: "Cotas do 3D e das vistas 2D.", dica: "A cota já feita muda em Propriedades (unidade e casas)." });
      D.item("met-cotas", { titulo: "Cotas (atalho)", oQueE: "Leva ao grupo Anotar › Cotas, com o arredondamento em mm para a metálica.", ondeUsa: "Pilares, vigas, terças, chapas e furação.", dica: "Cotar seleção nos pilares dá a locação 6000 + 6000 num clique." });
    },

    /* ================================================ 3D (gancho S._cot no js/bim.js) */
    montar3d: function (api) {
      if (!api || !api.THREE || !api.scene) return null;
      var self = this, THREE = api.THREE, edit = api.edit;
      var st = { modo: null, cmd: null, refs: [], cur: null, t: 0, geo: null, geoSt: null, geoModo: null, sel: null, desenho: {}, arr: null, coleta: [] };
      var grp = new THREE.Group(); grp.name = "cotas3d"; api.scene.add(grp);
      var grpPrev = new THREE.Group(); grpPrev.name = "cotas3d-previa"; api.scene.add(grpPrev);
      var sprites = [];
      if (api.S && api.S._tickExtra) api.S._tickExtra.push(function () { for (var i = 0; i < sprites.length; i++) if (sprites[i].parent) api.reescalar(sprites[i]); });
      function armado() { return previa() && edit.on && edit.sub === SUB && api.S.alive !== false; }
      function cor(nome, reserva) { var c = new THREE.Color(); try { c.set(token(nome, reserva)); } catch (e) { c.set(reserva); } return c; }
      function limpar(g) { g.children.slice().forEach(function (o) { g.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } var i = sprites.indexOf(o); if (i >= 0) sprites.splice(i, 1); }); }
      function linhas(pos, cr, op, larg) {
        if (!pos.length) return null;
        var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        var l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: cr, depthTest: false, transparent: true, opacity: op == null ? 1 : op, linewidth: larg || 1 }));
        l.renderOrder = 997; l.frustumCulled = false; l.raycast = function () {};
        return l;
      }
      function rotulo(txt, borda, tam) {
        var cv = document.createElement("canvas"), fs = 40, pad = 12, g = cv.getContext("2d");
        g.font = "600 " + fs + "px sans-serif"; cv.width = Math.ceil(g.measureText(txt).width) + pad * 2; cv.height = fs + pad * 2;
        g = cv.getContext("2d"); g.font = "600 " + fs + "px sans-serif";
        g.fillStyle = token("--surface", "#ffffff"); g.globalAlpha = 0.94; g.fillRect(0, 0, cv.width, cv.height); g.globalAlpha = 1;
        g.strokeStyle = token(borda || "--aco", "#0d6ebd"); g.lineWidth = 5; g.strokeRect(2.5, 2.5, cv.width - 5, cv.height - 5);
        g.fillStyle = borda === "--vermelho" ? token("--vermelho", "#d61f26") : token("--texto", "#14273b"); g.textBaseline = "middle"; g.fillText(txt, pad, cv.height / 2 + 2);
        var tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        sp.userData._ratio = cv.width / cv.height; sp.userData._sc = 0.021 * (tam || 1); sp.renderOrder = 999; sp.raycast = function () {};
        sp.userData.texto = txt;
        sprites.push(sp);
        return sp;
      }
      function e3() { return edit.estado || estado(); }
      function baseY() { try { var nv = global.BimArqUI && global.BimArqUI.nivelAtivo ? global.BimArqUI.nivelAtivo() : null; if (nv && fin(+nv.elevacao)) return +nv.elevacao; } catch (e) {} return fin(edit.base) ? edit.base : 0; }
      function proj(p) { var s = api.telaDe(p[0], p[1], p[2]); return s ? { x: s.x, y: s.y, atras: s.atras } : null; }
      function geo() {
        var e = e3(), md = cfg().pref === "face" ? "face" : "auto", y = baseY();
        if (!st.geo || st.geoSt !== e || st.geoModo !== md || st.geoY !== y) { st.geo = BC().candidatos(e, { y: y, modo: md }); st.geoSt = e; st.geoModo = md; st.geoY = y; }
        return st.geo;
      }
      /* o ponto sob o cursor: ponto notável da peça (associativo) > face da peça (associativa, normalizada)
         > ponto do modelo (IFC) > o plano de trabalho (vazio = posicionar a linha) */
      function resolver(e) {
        var C = BC(), est = e3(), cur = { x: e.clientX, y: e.clientY }, tol = e.pointerType === "touch" ? 30 : 14, c = cfg(), sn = null;
        if (c.encaixe !== false) sn = C.snap(cur, geo(), proj, { tol: tol });
        if (sn && sn.ref && sn.ref.face) sn.ref = C.refDaFace(est, sn.ref.el, sn.p);
        if (c.encaixe !== false && c.pref !== "eixo" && (!sn || sn.tipo === "proximo")) {
          var hit = api.raycast ? api.raycast(e.clientX, e.clientY) : null;
          if (hit && hit.point) {
            var ud = (hit.object && hit.object.userData) || {}, P = [hit.point.x, hit.point.y, hit.point.z];
            var sm = null; try { sm = api.snapMalha ? api.snapMalha(e, hit) : null; } catch (eS) { sm = null; }
            if (sm && sm.p) P = [sm.p.x, sm.p.y, sm.p.z];
            var naPeca = ud.mid === "edit" && ud.expressID != null && C.acharPeca(est, ud.expressID);
            var ref = naPeca ? C.refDaFace(est, ud.expressID, P) : { r: "p", x: r6(P[0]), y: r6(P[1]), z: r6(P[2]) };
            sn = { p: P, tipo: "face", ref: ref, rotulo: naPeca ? "face da peça" : "ponto do modelo", id: naPeca ? ud.expressID : null };
          }
        }
        if (sn) {
          var rf = clone(sn.ref) || { r: "p" };
          if (rf.x == null || rf.z == null) { rf.x = r6(sn.p[0]); if (rf.y == null) rf.y = r6(sn.p[1]); rf.z = r6(sn.p[2]); }
          return { p: sn.p, ref: rf, tipo: sn.tipo, rotulo: sn.rotulo || C.ROT_REF[rf.r] || "ponto", id: rf.el != null ? rf.el : null };
        }
        var pp = api.planoPonto ? api.planoPonto(e.clientX, e.clientY) : null; if (!pp) return null;
        return { p: [pp.x, pp.y, pp.z], ref: { r: "p", x: r6(pp.x), y: r6(pp.y), z: r6(pp.z) }, tipo: null, vazio: true, rotulo: "livre" };
      }
      function pontoDe(ref) { var x = BC().resolver(e3(), ref); return x.ok ? x.p : (x.p || null); }

      /* ---------------- caixa do valor ao lado do cursor (a prévia mostra o número antes do clique) */
      var caixa = document.createElement("div"); caixa.className = "bct-vivo"; caixa.setAttribute("data-bct", "vivo"); caixa.style.display = "none";
      function pendurar() { var h = api.host ? api.host() : null; if (h && caixa.parentNode !== h) h.appendChild(caixa); }
      function caixaMostrar(e, txt) {
        pendurar(); if (!txt) { caixa.style.display = "none"; return; }
        var h = api.host(), hr = h.getBoundingClientRect();
        caixa.textContent = txt; caixa.style.display = "block";
        caixa.style.left = (e.clientX - hr.left + 18) + "px"; caixa.style.top = (e.clientY - hr.top + 14) + "px";
      }
      function itemProvisorio(refs) {
        var C = BC(), c = cfg(), k = st.modo, it = { k: k === "alinhada" ? "linear" : k, refs: refs, off: 0.6 };
        if (k === "alinhada") {
          var dir = c.dir === "x" ? [1, 0, 0] : c.dir === "z" ? [0, 0, 1] : c.dir === "y" ? [0, 1, 0] : null;
          if (dir) it.dir = { x: dir[0], y: dir[1], z: dir[2] };
          else if (refs.length === 2) it.k = "alinhada";
          else { var a = pontoDe(refs[0]), b = pontoDe(refs[refs.length - 1]); if (a && b) { var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1; it.dir = { x: d[0] / L, y: d[1] / L, z: d[2] / L }; } }
        }
        if (k === "coordenada") {
          var dc = c.dir === "x" ? [1, 0, 0] : c.dir === "z" ? [0, 0, 1] : c.dir === "y" ? [0, 1, 0] : null;
          if (!dc && refs.length >= 2) { var o0 = pontoDe(refs[0]), o1 = pontoDe(refs[1]); if (o0 && o1) { var dd = [Math.abs(o1[0] - o0[0]), Math.abs(o1[1] - o0[1]), Math.abs(o1[2] - o0[2])]; dc = dd[0] >= dd[1] && dd[0] >= dd[2] ? [1, 0, 0] : dd[2] >= dd[1] ? [0, 0, 1] : [0, 1, 0]; } }
          if (dc) it.dir = { x: dc[0], y: dc[1], z: dc[2] };
        }
        var pad = padraoCfg(); if (pad) it.padrao = pad;
        if (k === "inclinacao") it.graus = true;
        void C;
        return it;
      }
      function textoPrevia(r) {
        var C = BC(), est = e3(), k = st.modo; if (!r) return "";
        if (k === "selecionar") return st.coleta.length + " peça(s) — clique outra; Enter cota" + (r.id != null ? " · " + (r.rotulo || "") : "");
        if (k === "nivel") { var itn = { k: "nivel", refs: [refNivel(r)] }, mn = C.medir(est, itn, { cfg: cfg() }); return mn.ok ? mn.rotulos[0].texto : ""; }
        var refs = st.refs.concat([r.ref]);
        if (k === "inclinacao") { if (refs.length < 2) return r.rotulo || ""; var mi = C.medir(est, itemProvisorio(refs.slice(-2)), { cfg: cfg() }); return mi.ok ? mi.rotulos[0].texto : ""; }
        if (refs.length < 2) return r.rotulo || "";
        var m = C.medir(est, itemProvisorio(refs), { cfg: cfg() }); if (!m.ok) return "";
        var ult = m.rotulos[m.rotulos.length - 1] ? m.rotulos[m.rotulos.length - 1].texto : "";
        if (k === "coordenada") return ult;
        return ult + (m.segs.length > 1 ? "  ·  total " + C.fmtComp(m.total, m.fmt) : "");
      }
      /* a cota de nível pega o TOPO da peça clicada (TOS no aço, TOL na laje); fora de peça, o ponto */
      function refNivel(r) { return r.id != null && BC().acharPeca(e3(), r.id) ? { el: r.id, r: "topo", x: r.ref.x, y: r.ref.y, z: r.ref.z } : r.ref; }
      function desenharPrevia(r) {
        limpar(grpPrev);
        if (!r) return;
        var pos = [], verde = cor("--verde", "#15803d");
        st.refs.forEach(function (ref) { var p = pontoDe(ref); if (p) pos.push(p[0], p[1], p[2], r.p[0], r.p[1], r.p[2]); });
        if (st.modo === "selecionar") st.coleta.forEach(function (id) { var g = BC().geom(BC().acharPeca(e3(), id)); if (g) pos.push(g.a[0], g.a[1], g.a[2], g.b[0], g.b[1], g.b[2]); });
        var l = linhas(pos, verde, 0.95); if (l) grpPrev.add(l);
        if (r.tipo && { fim: 1, meio: 1, centro: 1, intersecao: 1, proximo: 1 }[r.tipo]) {
          try { api.marca({ p: new THREE.Vector3(r.p[0], r.p[1], r.p[2]), tipo: r.tipo, editor: true, cor: { fim: "var(--verde)", intersecao: "var(--vermelho)", meio: "var(--amarelo)", centro: "var(--aco)", proximo: "var(--texto-fraco)" }[r.tipo] }); } catch (eM) {}
        } else { try { api.marcaEsconder(); } catch (eE) {} }
      }
      function marcarP1() { if (st.refs.length || st.coleta.length) { var p = st.refs.length ? pontoDe(st.refs[0]) : [0, 0, 0]; if (p) edit.p1 = new THREE.Vector3(p[0], p[1], p[2]); } else edit.p1 = null; }
      function dica() {
        var k = st.modo, n = st.refs.length;
        if (k === "alinhada") return n < 2 ? "Cota: clique a " + (n ? "próxima" : "1ª") + " referência — ponta, meio, face, eixo ou furo (Tab: " + ROT_PREF[cfg().pref] + "). O valor aparece antes do clique." : "Cota: mais uma referência faz cadeia; clique no VAZIO para posicionar a linha (Enter: ao lado). Esc sai.";
        if (k === "nivel") return "Cota de nível: clique no topo da peça (TOS no aço, TOL na laje) ou num ponto. Esc sai.";
        if (k === "inclinacao") return n ? "Inclinação: clique o 2º ponto." : "Inclinação: clique o 1º ponto (a ponta da terça, da diagonal, do tubo).";
        if (k === "coordenada") return n ? "Coordenada: clique o próximo ponto; Enter termina (" + n + " ponto(s))." : "Coordenada: clique a ORIGEM.";
        if (k === "selecionar") return "Cotar seleção: clique as peças (pilares, eixos, paredes, perfis, vigas, tubos); Enter cota. Esc sai.";
        return "";
      }
      function criar(it, pedido) {
        var C = BC(); it.id = novoId("c3");
        var r = C.opCota3d(it); if (!r.ok) { api.hint(r.motivo); return false; }
        var b = B(), ok = !!(b && b.b2Op && b.b2Op(r.op));
        if (!ok) { api.hint("O editor recusou a cota."); return false; }
        var m = C.medir(e3(), r.op, { cfg: cfg() }), tx = m.ok ? m.rotulos.map(function (q) { return q.texto; }).join(" · ") : "";
        api.hint((pedido || ROT_MODO[st.modo]) + " criada" + (tx ? ": " + tx : "") + ". Clique a próxima, ou Esc. Ctrl+Z desfaz."); status((pedido || ROT_MODO[st.modo]) + " criada" + (tx ? ": " + tx : "") + ".");
        st.refs = []; marcarP1(); limpar(grpPrev); caixa.style.display = "none";
        if (api.fechou) api.fechou();
        return true;
      }
      /* a posição da linha: o clique no vazio (ou o lado padrão) → lado + deslocamento */
      function posicionar(it, P) {
        var C = BC(), m = C.medir(e3(), it, {}); if (!m.ok || !m.geo) return it;
        var d = m.geo.d, P0 = m.pts[0];
        if (P) {
          var v = [P[0] - P0[0], P[1] - P0[1], P[2] - P0[2]], t = v[0] * d[0] + v[1] * d[1] + v[2] * d[2], w = [v[0] - d[0] * t, v[1] - d[1] * t, v[2] - d[2] * t];
          if (Math.abs(d[1]) < 0.9) w[1] = 0;   /* cota deitada: o lado na horizontal */
          var L = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
          if (L > 0.02) { it.lado = { x: w[0] / L, y: w[1] / L, z: w[2] / L }; it.off = Math.round(L * 1e4) / 1e4; }
        }
        return it;
      }
      function aceitar(r, e) {
        var k = st.modo, C = BC();
        if (k === "selecionar") {
          var id = r.id != null ? r.id : eixoPerto(e);
          if (id == null) { api.hint("Clique numa peça (ou num eixo da grade)."); return; }
          var i = st.coleta.indexOf(id); if (i >= 0) st.coleta.splice(i, 1); else st.coleta.push(id);
          marcarP1(); desenharPrevia(r); api.hint(dica() + " (" + st.coleta.length + ")"); return;
        }
        if (k === "nivel") { criar(posNivel({ k: "nivel", refs: [refNivel(r)], off: 0.6, padrao: padraoCfg() || undefined })); return; }
        if (k === "inclinacao") {
          if (r.vazio && !st.refs.length) { api.hint("Inclinação: clique num ponto de peça."); }
          st.refs.push(r.ref); marcarP1();
          if (st.refs.length >= 2) criar(itemProvisorio(st.refs.slice(0, 2)));
          else api.hint(dica());
          return;
        }
        if (k === "coordenada") {
          if (st.refs.length >= 2 && (r.vazio || r.tipo === "proximo" || r.tipo === "face")) { criar(posicionar(itemProvisorio(st.refs), r.p)); return; }
          st.refs.push(r.ref); marcarP1(); api.hint(dica()); return;
        }
        /* Cota: referências; com 2 ou mais, o clique no vazio — ou "na linha"/na face, que não é ponto
           notável — posiciona a linha (só ponta, meio, centro e cruzamento continuam a cadeia) */
        if (st.refs.length >= 2 && (r.vazio || r.tipo === "proximo" || r.tipo === "face")) { criar(posicionar(itemProvisorio(st.refs), r.p)); return; }
        st.refs.push(r.ref); marcarP1();
        api.hint(dica() + (r.rotulo ? " (" + r.rotulo + ")" : "")); status(dica());
        void C;
      }
      function posNivel(it) { return it; }
      function concluir() {
        var k = st.modo;
        if (k === "selecionar") { var ids = st.coleta.slice(); if (ids.length < 2) { api.hint("Escolha pelo menos duas peças."); return true; } st.coleta = []; limpar(grpPrev); edit.p1 = null; self.cotarSelecao(ids); return true; }
        if ((k === "alinhada" || k === "coordenada") && st.refs.length >= 2) { criar(itemProvisorio(st.refs)); return true; }
        return false;
      }
      /* o eixo da grade perto do cursor (no plano do nível): para o modo de escolher peças */
      function eixoPerto(e) {
        var y = baseY(), best = null;
        (e3().eixos || []).forEach(function (x) {
          var a = proj([x.x0, y, x.z0]), b = proj([x.x1, y, x.z1]); if (!a || !b || a.atras || b.atras) return;
          var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; if (L2 < 1) return;
          var t = Math.max(0, Math.min(1, ((e.clientX - a.x) * dx + (e.clientY - a.y) * dy) / L2)), qx = a.x + dx * t, qy = a.y + dy * t, d = Math.sqrt(Math.pow(e.clientX - qx, 2) + Math.pow(e.clientY - qy, 2));
          if (d < 10 && (!best || d < best.d)) best = { id: x.id, d: d };
        });
        return best ? best.id : null;
      }

      /* ---------------- as cotas 3D gravadas: desenho, seleção, arrasto, Propriedades */
      function desenhar() {
        limpar(grp); st.desenho = {};
        var e = e3(), C = BC(); if (!e || !C || !previa()) return;
        C.itens(e).forEach(function (it) {
          var m = C.medir(e, it, { cfg: cfg() }); if (!m.ok) return;
          var orfa = !!m.orfa, sel = st.sel === it.id, crN = orfa ? "--vermelho" : sel ? "--aco-claro" : "--aco";
          var pos = []; m.linhas.concat(m.marcas).forEach(function (s) { pos.push(s[0][0], s[0][1], s[0][2], s[1][0], s[1][1], s[1][2]); });
          var l = linhas(pos, cor(crN, orfa ? "#d61f26" : "#0d6ebd"), 1); if (l) { l.userData.cotaId = it.id; grp.add(l); }
          var rots = m.rotulos.map(function (q) {
            var sp = rotulo(q.texto + (orfa ? " (órfã)" : ""), crN, num(it.tam, 1) * num(cfg().tam, 1)); sp.position.set(q.p[0], q.p[1], q.p[2]); sp.userData.cotaId = it.id; sp.userData.seg = q.i;
            grp.add(sp); api.reescalar(sp); return { p: q.p, i: q.i, texto: q.texto, sp: sp };
          });
          st.desenho[it.id] = { m: m, rot: rots, linhas: m.linhas, orfa: orfa, it: it };
        });
      }
      function distSeg2(c, a, b) { var dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; if (L2 < 1e-9) return Math.sqrt(Math.pow(c.x - a.x, 2) + Math.pow(c.y - a.y, 2)); var t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / L2)); return Math.sqrt(Math.pow(c.x - a.x - dx * t, 2) + Math.pow(c.y - a.y - dy * t, 2)); }
      function acharCota(cx, cy) {
        var best = null, c = { x: cx, y: cy };
        Object.keys(st.desenho).forEach(function (id) {
          var d = st.desenho[id];
          d.rot.forEach(function (q) { var s = proj(q.p); if (!s || s.atras) return; var dd = Math.sqrt(Math.pow(s.x - cx, 2) + Math.pow(s.y - cy, 2)); if (dd < 20 && (!best || dd < best.d)) best = { id: id, d: dd, modo: "texto", seg: q.i }; });
          d.linhas.forEach(function (sg) { var a = proj(sg[0]), b = proj(sg[1]); if (!a || !b || a.atras || b.atras) return; var dd = distSeg2(c, a, b) + 4; if (dd < 9 && (!best || dd < best.d)) best = { id: id, d: dd, modo: "linha" }; });
        });
        return best;
      }
      function selecionar(id) {
        st.sel = id == null ? null : String(id);
        desenhar();
        try { if (global.BimShell) global.BimShell.pintarProps(st.sel ? props(st.sel) : null); } catch (e) {}
        if (st.sel) api.hint("Cota selecionada: arraste a LINHA para afastar, o TEXTO para mover; Propriedades muda texto, unidade e casas; Delete apaga.");
      }
      function op(o) { var b = B(); return !!(b && b.b2Op && b.b2Op(o)); }
      function props(id) {
        var C = BC(), it = C.item(e3(), id); if (!it) return null;
        var m = C.medir(e3(), it, { cfg: cfg() }), d = st.desenho[id];
        var aj = function (campos) { return op({ op: "cota3dAjustar", id: id, campos: campos }); };
        var g = [
          { id: "k", rotulo: "Tipo", leitura: true, valor: ROT_K[it.k] || it.k },
          { id: "valor", rotulo: "Valor", leitura: true, valor: m.ok ? (m.rotulos.length === 1 ? m.rotulos[0].texto : m.rotulos.map(function (q) { return q.texto; }).join(" · ")) : "—" },
          { id: "total", rotulo: "Total", leitura: true, valor: m.ok && fin(m.total) ? C.fmtComp(m.total, m.fmt) : "—" },
          { id: "refs", rotulo: "Referências", leitura: true, valor: (it.refs || []).map(function (r) { return (C.ROT_REF[r.r] || r.r || "ponto") + (r.el != null ? " de " + r.el : ""); }).join(", ") }
        ];
        if (d && d.orfa) g.unshift({ id: "orfa", rotulo: "Órfã", leitura: true, valor: "a peça a que a cota estava presa foi apagada — Ctrl+Z traz a peça; ou apague a cota" });
        g.push({ id: "txt", rotulo: "Texto substituto", tipo: "texto", valor: it.txt || "" });
        g.push({ id: "pre", rotulo: "Prefixo", tipo: "texto", valor: it.pre != null ? it.pre : (it.k === "nivel" && m.prefixo ? m.prefixo : "") });
        g.push({ id: "suf", rotulo: "Sufixo", tipo: "texto", valor: it.suf || "" });
        g.push({ id: "unidade", rotulo: "Unidade", tipo: "lista", valor: it.unidade || "", opcoes: [{ id: "", rotulo: "Do padrão (" + (m.fmt ? m.fmt.unidade : "m") + ")" }, { id: "m", rotulo: "m" }, { id: "cm", rotulo: "cm" }, { id: "mm", rotulo: "mm" }] });
        g.push({ id: "casas", rotulo: "Casas decimais", tipo: "lista", valor: it.casas == null ? "" : String(it.casas), opcoes: [{ id: "", rotulo: "Do padrão" }, { id: "0", rotulo: "0" }, { id: "1", rotulo: "1" }, { id: "2", rotulo: "2" }, { id: "3", rotulo: "3" }] });
        if (it.k !== "nivel" && it.k !== "inclinacao") g.push({ id: "off", rotulo: "Deslocamento da linha", unidade: "m", tipo: "numero", passo: 0.05, valor: it.off });
        if (it.k === "inclinacao") g.push({ id: "graus", rotulo: "Também em graus", tipo: "sim-nao", valor: it.graus !== false });
        g.push({ id: "tam", rotulo: "Tamanho do texto", tipo: "lista", valor: String(it.tam || 1), opcoes: [{ id: "0.75", rotulo: "Pequeno" }, { id: "1", rotulo: "Normal" }, { id: "1.5", rotulo: "Grande" }, { id: "2", rotulo: "Muito grande" }] });
        g.push({ id: "bct-excluir", rotulo: "Cota", tipo: "botao", rotuloBotao: "Excluir", fn: function () { var x = id; selecionar(null); op({ op: "apagar", id: x }); } });
        return { daVista: false, semEditarTipo: true, titulo: "Cota 3D — " + (ROT_K[it.k] || it.k), icone: "regua", secoes: [{ nome: "Cota", params: g }],
          onMudar: function (pid, valor) {
            var c = {};
            if (pid === "off") c.off = num(valor, it.off);
            else if (pid === "casas") c.casas = valor === "" ? null : num(valor, 2);
            else if (pid === "unidade") c.unidade = valor === "" ? null : String(valor);
            else if (pid === "tam") c.tam = num(valor, 1);
            else if (pid === "graus") c.graus = !!valor;
            else if (pid === "txt" || pid === "pre" || pid === "suf") c[pid] = String(valor);
            else return null;
            aj(c); return null;
          } };
      }
      /* arrastar: a LINHA (deslocamento, no plano da cota) ou o TEXTO (no plano perpendicular à câmera) */
      function planoRaio(cx, cy, n, d0) {
        var r = api.raio ? api.raio(cx, cy) : null; if (!r) return null;
        var o = r.origem, dv = r.direcao, den = dv[0] * n[0] + dv[1] * n[1] + dv[2] * n[2]; if (Math.abs(den) < 1e-6) return null;
        var t = (d0 - (o[0] * n[0] + o[1] * n[1] + o[2] * n[2])) / den; if (t < 0) return null;
        return [o[0] + dv[0] * t, o[1] + dv[1] * t, o[2] + dv[2] * t];
      }
      function arrastoInicio(achado, e) {
        var d = st.desenho[achado.id]; if (!d || !d.m) return false;
        var it = BC().item(e3(), achado.id); if (!it) return false;
        var m = d.m, n, d0, ref;
        if (achado.modo === "linha") { if (!m.geo) return false; n = m.geo.W; ref = m.geo.Q[0]; }
        else { var cam = api.camera ? api.camera() : null; if (!cam) return false; var vd = new THREE.Vector3(); cam.getWorldDirection(vd); n = [vd.x, vd.y, vd.z]; var q = d.rot.filter(function (x) { return x.i === achado.seg; })[0] || d.rot[0]; ref = q.p; }
        d0 = n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2];
        var X0 = planoRaio(e.clientX, e.clientY, n, d0); if (!X0) return false;
        st.arr = { id: achado.id, modo: achado.modo, seg: String(achado.seg != null ? achado.seg : 0), n: n, d0: d0, X0: X0, off: it.off, tmov: it.tmov ? clone(it.tmov) : null, x0: e.clientX, y0: e.clientY, mexeu: false, novo: null,
                   l0: m.geo ? m.geo.L : null, P0: m.pts ? m.pts[0] : null };
        return true;
      }
      function arrastoMover(e) {
        var a = st.arr; if (!a) return;
        if (!a.mexeu && Math.abs(e.clientX - a.x0) + Math.abs(e.clientY - a.y0) < 4) return;
        a.mexeu = true;
        var X = planoRaio(e.clientX, e.clientY, a.n, a.d0); if (!X) return;
        var it = BC().item(e3(), a.id); if (!it) return;
        if (a.modo === "linha" && a.l0 && a.P0) {
          var L = a.l0, off = (X[0] - a.P0[0]) * L[0] + (X[1] - a.P0[1]) * L[1] + (X[2] - a.P0[2]) * L[2];
          it.off = Math.round(off * 1e4) / 1e4; a.novo = { off: it.off };
        } else {
          var tm = a.tmov ? clone(a.tmov) : {}, b = tm[a.seg] || { x: 0, y: 0, z: 0 };
          tm[a.seg] = { x: r6(num(b.x, 0) + X[0] - a.X0[0]), y: r6(num(b.y, 0) + X[1] - a.X0[1]), z: r6(num(b.z, 0) + X[2] - a.X0[2]) };
          it.tmov = tm; a.novo = { tmov: tm };
        }
        desenhar();
      }
      function arrastoFim(cancelar) {
        var a = st.arr; if (!a) return; st.arr = null;
        var it = BC().item(e3(), a.id);
        if (cancelar || !a.mexeu || !a.novo) { if (it) { it.off = a.off; if (a.tmov) it.tmov = a.tmov; else delete it.tmov; } desenhar(); return; }
        if (op({ op: "cota3dAjustar", id: a.id, campos: a.novo })) { status(a.modo === "linha" ? "Linha da cota no lugar novo (Ctrl+Z volta)." : "Texto da cota movido (Ctrl+Z volta)."); }
      }
      /* o clique SEM ferramenta: perto de uma cota 3D seleciona (e arrasta); antes da seleção das peças */
      var canvas = api.canvas;
      if (canvas) canvas.addEventListener("pointerdown", function (e) {
        if (!previa() || e.button !== 0 || !BC()) return;
        /* a cota 2D armada e a pessoa clicou no 3D: a mesma ferramenta passa para o 3D */
        var U = U2();
        if (U && U._f && CMD_MODO[U._f.cmd] && R() && R().ativo(U._f.cmd) && !(edit.on && edit.sub === SUB)) {
          var cmd = U._f.cmd; U._f = null; try { U._limparPrevia(); U._marcarVistas(false); } catch (eU) {}
          self.armar3d(CMD_MODO[cmd], cmd); return;
        }
        if (edit.on && edit.sub) return;   /* outra ferramenta (ou a de cota) armada: o clique é dela */
        var ach = acharCota(e.clientX, e.clientY);
        if (!ach) { if (st.sel) selecionar(null); return; }
        e.stopPropagation(); e.preventDefault();
        if (st.sel !== ach.id) { selecionar(ach.id); }
        if (arrastoInicio(ach, e)) {
          var mv = function (ev) { arrastoMover(ev); }, up = function () { document.removeEventListener("pointermove", mv, true); document.removeEventListener("pointerup", up, true); arrastoFim(false); };
          document.addEventListener("pointermove", mv, true); document.addEventListener("pointerup", up, true);
        }
      }, true);
      document.addEventListener("keydown", function (e) {
        if (!previa()) return;
        var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
        if (armado()) {
          if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); var np = self.alternarPref(); api.hint("Encaixe: " + np + ". " + dica()); status("Encaixe: " + np + "."); return; }
          if (e.key === "Enter") { if (concluir()) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
          return;
        }
        if (st.arr && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); arrastoFim(true); return; }
        if (st.sel && (e.key === "Delete" || e.key === "Del") && !(edit.on && edit.sub)) {
          var id = st.sel; e.preventDefault(); e.stopImmediatePropagation(); selecionar(null);
          if (op({ op: "apagar", id: id })) status("Cota apagada (Ctrl+Z volta).");
          return;
        }
        if (st.sel && e.key === "Escape") selecionar(null);
      }, true);

      var api3 = {
        armado: armado,
        cmd: function () { return st.cmd; },
        preparar: function (modo, cmd) { st.modo = modo; st.cmd = cmd || null; st.refs = []; if (modo !== "selecionar") st.coleta = []; },
        soltarFita: false,
        coleta: function () { return st.coleta.slice(); },
        coletaLimpar: function () { st.coleta = []; },
        limparCache: function () { st.geo = null; },
        dica: function (sub) { return sub === SUB ? dica() : ""; },
        mover: function (e) {
          if (!armado()) return false;
          var tt = performance.now(); if (tt - st.t < 30) return true; st.t = tt;
          var r = resolver(e); st.cur = r;
          desenharPrevia(r); caixaMostrar(e, textoPrevia(r));
          return true;
        },
        clique: function (e, hit, pForcado) {
          if (!armado()) return false;
          if (pForcado) return true;   /* a planta tem a cota da P7 */
          var r = resolver(e); if (!r) { api.hint("Não achei o ponto: gire a vista ou chegue mais perto."); return true; }
          aceitar(r, e);
          return true;
        },
        cancelar: function () { st.refs = []; if (st.modo !== "selecionar") st.coleta = []; limpar(grpPrev); caixa.style.display = "none"; },
        aoSub: function (sub) {
          if (sub === SUB) { st.refs = []; st.geo = null; api.hint(dica()); try { if (global.BimShell) global.BimShell.pintarProps({ daVista: false, semEditarTipo: true, titulo: ROT_MODO[st.modo] || "Cota", icone: "regua", secoes: [{ nome: "Ferramenta", params: self.paramsFerramenta() }], onMudar: function (pid, v) { self.mudarCfg(pid, v); return null; } }); } catch (eP) {} return; }
          limpar(grpPrev); caixa.style.display = "none"; st.refs = [];
          if (st.modo) {
            var c = st.cmd; st.modo = null; st.cmd = null; st.coleta = [];
            if (c && R() && R().ativo(c) && !api3.soltarFita) { R().setAtivo(c, false); try { if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } catch (eF) {} }
          }
        },
        aposRebuild: function () { st.geo = null; if (st.sel && !BC().item(e3(), st.sel)) st.sel = null; desenhar(); if (st.sel) { try { global.BimShell.pintarProps(props(st.sel)); } catch (e) {} } },
        redesenhar: desenhar,
        selecionar: selecionar,
        /* para o e2e e o suporte */
        estado: function () {
          var C = BC(), e = e3();
          return { modo: st.modo, cmd: st.cmd, armado: armado(), refs: st.refs.length, cur: st.cur ? { tipo: st.cur.tipo, rotulo: st.cur.rotulo, p: st.cur.p, ref: st.cur.ref } : null, vivo: caixa.style.display !== "none" ? caixa.textContent : "",
                   previa: grpPrev.children.length, sel: st.sel, coleta: st.coleta.slice(), pref: cfg().pref,
                   cotas: Object.keys(st.desenho).map(function (id) { var d = st.desenho[id]; return { id: id, orfa: d.orfa, textos: d.rot.map(function (q) { return q.sp.userData.texto; }) }; }),
                   n: C && e ? C.itens(e).length : 0 };
        },
        telaDoRotulo: function (id, i) { var d = st.desenho[id]; if (!d) return null; var q = d.rot.filter(function (x) { return x.i === (i || 0); })[0] || d.rot[0]; return q ? proj(q.p) : null; },
        telaDaLinha: function (id) { var d = st.desenho[id]; if (!d || !d.m.geo) return null; var Q = d.m.geo.Q, a = Q[0], b = Q[Q.length - 1]; var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; return proj([m[0] * 0.75 + a[0] * 0.25, m[1] * 0.75 + a[1] * 0.25, m[2] * 0.75 + a[2] * 0.25]); }
      };
      this._3d = api3;
      setTimeout(desenhar, 0);
      return api3;
    }
  };

  global.BimCotasUI = BimCotasUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCotasUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

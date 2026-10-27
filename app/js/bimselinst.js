/* =====================================================================
 * bimselinst.js — SELECIONAR TODAS AS INSTÂNCIAS pelo clique DIREITO na
 * peça (3D, planta, corte, elevação). 14/10/2026.
 *
 * Pedido do Rogério: "Quando eu clicar com o botão direito em cima de algum
 * elemento, ele traz as opções onde eu posso selecionar TODOS os elementos
 * daquele tipo — pela descrição, pelo tipo. Ex.: cliquei numa barra de um
 * corrimão: ele identifica todas as instâncias daquele corrimão que estão no
 * projeto, e eu tenho a opção de deletar, de ocultar, de tudo."
 *
 * O MENU (clique direito SEM arrastar; arrastar com o direito continua
 * movendo a vista no 3D):
 *   Selecionar todas as instâncias ▸
 *       do mesmo TIPO ........ tipo/família/perfil (ex.: os montantes HSS73X5.2;
 *                              as paredes do tipo "Parede 15 cm")
 *       com a mesma DESCRIÇÃO  a função da peça metálica ("Montante do
 *                              guarda-corpo"), o nome da peça do IFC
 *       da mesma PEÇA PRONTA . todas as barras daquele guarda-corpo/escada
 *                              (e do galpão gerado)
 *       da mesma CATEGORIA ... todas as vigas, todos os pilares, as barras…
 *     cada critério com DOIS botões e a contagem antes do clique:
 *       "Nesta vista (n)" — só o que está visível na vista do clique;
 *       "No projeto (N)"  — o modelo inteiro.
 *     Ctrl + clique no botão SOMA à seleção que já existe.
 *   Ações (na seleção): Apagar (um lote, um Ctrl+Z), Ocultar na vista, Isolar
 *   na vista, Ocultar categoria, Mostrar todos, Mover, Copiar, Propriedades,
 *   Trocar tipo/perfil, Lista da seleção. Depois, "Criar nível aqui…" (S8).
 *
 * PROTEÇÕES: peça FIXADA não sai sem aviso (o aviso diz quantas ficam e
 * apaga só as livres); apagar parte de uma PEÇA PRONTA pergunta: só as
 * selecionadas ou a peça pronta inteira (vale também para a tecla Delete).
 *
 * PEÇA DO IFC IMPORTADO: a seleção do 3D guarda UMA peça do IFC por vez. O
 * critério escolhido numa peça do IFC vira um GRUPO (a barra de status mostra
 * "N selecionados (critério)") que Ocultar/Isolar/Ocultar categoria usam;
 * apagar peça do IFC (menu, Delete) faz o mesmo do Modificar › Apagar: oculta e
 * marca como removida, o arquivo não muda (#85, 26/10/2026).
 *
 * OCULTAR/ISOLAR: temporário, a mesma visibilidade do painel Visibilidade
 * (malha escondida; "Mostrar todos" ou "Restaurar tudo" traz de volta). As
 * peças do editor são refeitas a cada op — `aposRebuild` esconde de novo o
 * que estava oculto. As vistas 2D abertas são redesenhadas.
 *
 * PURO × TELA: os critérios, as contagens, o agrupamento (escopo vista ×
 * projeto) e o plano de apagar são puros (tools/test-bimselinst.js). A tela
 * monta a lista de peças a partir do BIM e desenha o menu.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function esc(s) { return txt(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var CRIT = ["tipo", "desc", "pronta", "cat"];
  var ROT = { tipo: "Do mesmo tipo", desc: "Com a mesma descrição", pronta: "Da mesma peça pronta", cat: "Da mesma categoria" };
  var ROT_CURTO = { tipo: "mesmo tipo", desc: "mesma descrição", pronta: "mesma peça pronta", cat: "mesma categoria" };
  /* a categoria pela classe IFC da peça (a mesma régua para a peça do editor, a metálica e a do IFC) */
  var CATS = {
    IFCWALL: "Paredes", IFCWALLSTANDARDCASE: "Paredes", IFCCURTAINWALL: "Fachadas-cortina", IFCSLAB: "Lajes e pisos", IFCCOLUMN: "Pilares",
    IFCBEAM: "Vigas", IFCMEMBER: "Barras", IFCPLATE: "Chapas", IFCRAILING: "Guarda-corpos e corrimãos", IFCMECHANICALFASTENER: "Parafusos e chumbadores",
    IFCFASTENER: "Fixadores", IFCDOOR: "Portas", IFCWINDOW: "Janelas", IFCSTAIR: "Escadas", IFCSTAIRFLIGHT: "Lances de escada", IFCRAMP: "Rampas",
    IFCRAMPFLIGHT: "Lances de rampa", IFCROOF: "Coberturas", IFCCOVERING: "Revestimentos e forros", IFCFOOTING: "Fundações", IFCPILE: "Estacas",
    IFCPIPESEGMENT: "Tubos", IFCPIPEFITTING: "Conexões", IFCFLOWTERMINAL: "Aparelhos", IFCSANITARYTERMINAL: "Louças e metais",
    IFCDUCTSEGMENT: "Dutos", IFCDUCTFITTING: "Conexões de duto", IFCCABLECARRIERSEGMENT: "Eletrocalhas e eletrodutos", IFCCABLECARRIERFITTING: "Conexões elétricas",
    IFCLIGHTFIXTURE: "Luminárias", IFCELECTRICAPPLIANCE: "Equipamentos elétricos", IFCOUTLET: "Tomadas", IFCSWITCHINGDEVICE: "Interruptores",
    IFCBUILDINGELEMENTPROXY: "Elementos genéricos", IFCFURNISHINGELEMENT: "Mobiliário", IFCFURNITURE: "Mobiliário", IFCSPACE: "Ambientes",
    IFCREINFORCINGBAR: "Armaduras", IFCREINFORCINGMESH: "Telas de armadura", IFCGEOGRAPHICELEMENT: "Terreno", IFCSITE: "Terreno", IFCTANK: "Tanques"
  };
  function nomeCat(ifc) {
    var k = txt(ifc).toUpperCase();
    if (CATS[k]) return CATS[k];
    return k ? k.replace(/^IFC/, "").toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }) : "Sem categoria";
  }

  /* =================================================================
   * PURO
   * item = { uid, cat, catNome, tipo, tipoNome, desc, pronta, prontaNome,
   *          vis (visível na vista do clique), fixo, editavel, nome }
   * ================================================================= */
  function valor(it, k) { var v = it ? it[k] : null; return v == null || v === "" ? null : String(v); }
  function rotuloValor(it, k) {
    if (k === "tipo") return txt(it.tipoNome || it.tipo);
    if (k === "desc") return txt(it.desc);
    if (k === "pronta") return txt(it.prontaNome || "peça pronta");
    if (k === "cat") return txt(it.catNome || it.cat);
    return "";
  }
  /* as peças do critério k iguais à do alvo; escopo "vista" = só as visíveis na vista */
  function agrupar(alvo, itens, k, escopo) {
    var v = valor(alvo, k); if (!v) return [];
    var out = [], vistos = {};
    arr(itens).forEach(function (it) {
      if (!it || !it.uid || vistos[it.uid]) return;
      if (escopo === "vista" && !it.vis) return;
      if (valor(it, k) !== v) return;
      vistos[it.uid] = 1; out.push(it.uid);
    });
    return out;
  }
  /* os critérios que fazem sentido para o alvo, com as contagens (vista e projeto) */
  function criterios(alvo, itens) {
    if (!alvo) return [];
    var out = [];
    CRIT.forEach(function (k) {
      if (!valor(alvo, k)) return;
      out.push({ k: k, rotulo: ROT[k], valor: rotuloValor(alvo, k), nVista: agrupar(alvo, itens, k, "vista").length, nProjeto: agrupar(alvo, itens, k, "projeto").length });
    });
    return out;
  }
  function textoCriterio(k, alvo, escopo) {
    return ROT_CURTO[k] + (alvo ? " · " + rotuloValor(alvo, k) : "") + " · " + (escopo === "vista" ? "nesta vista" : "no projeto");
  }
  function textoStatus(n, crit) { return n + (n === 1 ? " selecionado" : " selecionados") + (crit ? " (" + crit + ")" : ""); }
  /* o plano de APAGAR: as livres, as fixadas (não saem sem aviso), as do IFC (não saem pelo Delete) e as
     peças prontas com só uma parte selecionada (pergunta: só as selecionadas ou a peça pronta inteira) */
  function planoApagar(uids, itens) {
    var por = {}, total = {}, nomes = {};
    arr(itens).forEach(function (it) {
      if (!it || !it.uid) return; por[it.uid] = it;
      var p = valor(it, "pronta"); if (p && /^pronta:/.test(p)) { (total[p] = total[p] || []).push(it.uid); nomes[p] = it.prontaNome || "peça pronta"; }
    });
    var r = { livres: [], fixas: [], ifc: [], parciais: [] }, selP = {}, sel = {};
    arr(uids).forEach(function (u) {
      if (sel[u]) return; sel[u] = 1;
      var it = por[u];
      if (!it || !it.editavel) { r.ifc.push(u); return; }
      if (it.fixo) r.fixas.push(u); else r.livres.push(u);
      var p = valor(it, "pronta"); if (p && total[p]) (selP[p] = selP[p] || []).push(u);
    });
    Object.keys(selP).forEach(function (p) {
      if (selP[p].length >= total[p].length) return;
      r.parciais.push({ pronta: p, nome: nomes[p], nSel: selP[p].length, nTotal: total[p].length, resto: total[p].filter(function (u) { return !sel[u]; }) });
    });
    return r;
  }
  /* uids → ops de apagar (o id do editor sem o "edit:") num lote só */
  function opsApagar(uids, seq) {
    var ops = arr(uids).filter(function (u) { return /^edit:/.test(u); }).map(function (u) { return { op: "apagar", id: u.slice(5) }; });
    if (!ops.length) return null;
    return { op: "lote", id: "si-" + (seq != null ? seq : Date.now().toString(36)), origem: "selecionar-instancias", pedido: "Apagar " + ops.length + (ops.length === 1 ? " elemento" : " elementos"), ops: ops };
  }

  /* =================================================================
   * A TELA
   * ================================================================= */
  function B() { return global.BIM || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }
  function modelador() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function semNum(s) { return txt(s).replace(/\s*\((sintétic[ao]|sintético)[^)]*\)\s*$/i, "").trim(); }

  var st = { ocultos: {}, isolado: false, grupo: null, ultimo: null, menu: null, seq: 0 };

  var BimSelInst = {
    /* puro (testes) */
    CRIT: CRIT, nomeCat: nomeCat, agrupar: agrupar, criterios: criterios, planoApagar: planoApagar, opsApagar: opsApagar,
    textoStatus: textoStatus, textoCriterio: textoCriterio, rotuloValor: rotuloValor,

    ativo: function () { var b = B(); return !!(b && b.editarEstado && b.selecionar); },

    /* ------------------------------------------------ as peças do modelo (com o visível da vista) */
    /* vista: "3d" ou o id da vista 2D */
    visiveis: function (vista) {
      var b = B(), vis = {};
      if (vista == null) return vis;   /* null = não precisa do visível (apagar, ocultar categoria): o campo da câmera custa */
      try {
        if (vista === "3d") { (b && b.uidsNaVista3d ? b.uidsNaVista3d() : []).forEach(function (u) { vis[u] = 1; }); return vis; }
        var P2 = global.Bim2D, c = P2 && P2._cache ? P2._cache[vista] : null, d = c && c.dados;
        if (!d) return vis;
        /* o que a vista DESENHA e que está dentro do enquadramento (o zoom da vista): a peça que a moldura toca */
        var SL = global.BimSelecao, vb = c.vb;
        if (SL && SL.pecasDoDesenho && SL.pegaJanela && vb && vb.w > 0 && vb.h > 0) {
          SL.pegaJanela({ x0: vb.x, y0: vb.y, x1: vb.x + vb.w, y1: vb.y + vb.h, modo: "cruzando" }, SL.pecasDoDesenho(d)).forEach(function (u) { vis[u] = 1; });
          return vis;
        }
        arr(d.cortes).forEach(function (x) { if (x && x.u) vis[x.u] = 1; arr(x && x.partes).forEach(function (q) { if (q && q.u) vis[q.u] = 1; }); });   /* o contorno da união de paredes guarda as peças de origem em `partes` (js/bimuniao.js) */
        arr(d.linhasUd).forEach(function (x) { if (x && x.u) vis[x.u] = 1; });
        arr(d.acima).forEach(function (x) { if (x && x.u) vis[x.u] = 1; });
      } catch (e) {}
      return vis;
    },
    itens: function (vista) {
      var b = B(); if (!b) return [];
      var els = []; try { els = arr(b.elementos); } catch (e0) { els = []; }
      var est = null; try { est = b.editarEstado().estado; } catch (e1) { est = null; }
      var cx = {}; arr(est && est.caixas).forEach(function (c) { if (c) cx[String(c.id)] = c; });
      var res = null; try { var BP = global.BimPropsUI, ctx = BP && BP.ativo && BP.ativo() && BP.contextoTela ? BP.contextoTela() : null; res = ctx ? ctx.res : null; } catch (e2) { res = null; }
      var MP = global.MetalProntas, prN = {};
      try { if (MP && MP.prontas) MP.prontas(est ? est.caixas : []).forEach(function (p) { var T = p.tipo && MP.TIPOS ? MP.TIPOS[p.tipo] : null; prN[p.id] = T ? T.rotulo : "Peça pronta"; }); } catch (e3) {}
      var Pr = global.BimPrecisao, vis = this.visiveis(vista), out = [], vistos = {};
      els.forEach(function (e) {
        if (!e || !e.uid || vistos[e.uid]) return; vistos[e.uid] = 1;
        var u = String(e.uid), it = { uid: u, cat: txt(e.tipo).toUpperCase() || null, catNome: nomeCat(e.tipo), tipo: null, tipoNome: null, desc: null, pronta: null, prontaNome: null,
                                      vis: !!vis[u], fixo: false, editavel: /^edit:/.test(u), nome: semNum(e.nome) };
        if (it.editavel) {
          var id = u.slice(5), c = cx[id], p = res && res.porId ? res.porId[id] : null;
          try { it.fixo = !!(Pr && Pr.fixado && est && Pr.fixado(est, id)); } catch (eF) { it.fixo = !!(c && c.fixo); }
          if (c && c.tipo === "metal" && c.metal) {
            var m = c.metal, perf = m.perfil && (m.perfil.cat || m.perfil.forma);
            if (m.kind === "perfil") { it.tipo = "metal|perfil|" + txt(perf || m.perfilRotulo); it.tipoNome = txt(m.perfilRotulo || perf); }
            else if (m.kind === "chapa") { var t = Math.round((+m.t || 0) * 10000) / 10; it.tipo = "metal|chapa|" + t; it.tipoNome = "Chapa #" + String(t).replace(".", ",") + " mm"; }
            else if (m.kind) { it.tipo = "metal|" + m.kind + "|" + txt(m.id || m.D); it.tipoNome = semNum(global.BimMetal && global.BimMetal.nome ? global.BimMetal.nome(c) : m.papel); }
            it.desc = txt(m.papel) || null;
            it.nome = global.BimMetal && global.BimMetal.nome ? global.BimMetal.nome(c) : it.nome;
          } else if (p) {
            if (p.tipoId != null && p.tipoId !== "") { it.tipo = p.categoria + "|" + p.tipoId; it.tipoNome = txt(p.tipoNome || p.tipoId); }
            if (p.nomeCategoria) it.catNome = it.catNome === "Sem categoria" ? p.nomeCategoria : it.catNome;
            it.desc = c ? (txt(c.descricao || c.nome) || null) : null;
          } else if (c) {
            /* sem a paleta do registro (prévia desligada): o tipo pelo que define a peça */
            var tp = c.tipoParede && (c.tipoParede.id || c.tipoParede.nome), pf = c.perfil && (c.perfil.cat || c.perfil.forma);
            var chave = tp || pf || (isFinite(+c.espessura) ? "e" + Math.round(+c.espessura * 1000) : "");
            if (chave) { it.tipo = c.tipo + "|" + chave; it.tipoNome = tp ? txt(c.tipoParede.nome || tp) : (pf ? txt(pf) : nomeCat(e.tipo) + " " + Math.round(+c.espessura * 100) + " cm"); }
            it.desc = txt(c.descricao || c.nome) || null;
          }
          if (c && c.pronta) { it.pronta = "pronta:" + c.pronta; it.prontaNome = prN[String(c.pronta)] || "Peça pronta"; }
          else if (c && c.galpao) { it.pronta = "galpao:" + c.galpao; it.prontaNome = "Galpão"; }
        } else {
          if (e.familia) { it.tipo = "ifc|" + it.cat + "|" + e.familia; it.tipoNome = txt(e.familia); }
          it.desc = txt(e.nomeIfc || e.descricao) || null;
        }
        out.push(it);
      });
      return out;
    },
    _porUid: function (itens) { var m = {}; arr(itens).forEach(function (it) { m[it.uid] = it; }); return m; },

    /* ------------------------------------------------ a seleção (a fonte é o BIM) */
    selecao: function () { var b = B(); try { return (b && b.selecao ? b.selecao().uids : []) || []; } catch (e) { return []; } },
    /* o que as ações usam: o grupo do IFC (quando o alvo é dele) ou a seleção */
    alvos: function () {
      var s = this.selecao();
      if (st.grupo && st.grupo.uids.length && (!s.length || s.every(function (u) { return st.grupo.uids.indexOf(u) >= 0; }))) return st.grupo.uids.slice();
      return s;
    },
    /* seleciona pelo critério k (tipo|desc|pronta|cat) e escopo (vista|projeto) a partir do alvo */
    selecionarPor: function (uidAlvo, k, escopo, vista, somar) {
      var itens = this.itens(vista), alvo = this._porUid(itens)[uidAlvo]; if (!alvo) return [];
      var uids = agrupar(alvo, itens, k, escopo), crit = textoCriterio(k, alvo, escopo), b = B();
      var ed = uids.filter(function (u) { return /^edit:/.test(u); }), ifc = uids.filter(function (u) { return !/^edit:/.test(u); });
      var feitos = [];
      if (!alvo.editavel) {
        /* peça do IFC: a seleção do 3D guarda uma por vez — o critério vira o GRUPO das ações */
        st.grupo = { uids: ifc, crit: crit };
        try { b.selecionar([uidAlvo], "trocar"); } catch (eI) {}
        feitos = ifc;
        status(textoStatus(ifc.length, crit) + " — peças do IFC importado: Ocultar, Isolar e Ocultar categoria e Apagar (oculta e marca como removida) valem para elas.");
      } else {
        st.grupo = null;
        try { feitos = b.selecionar(ed, somar ? "somar" : "trocar") || []; } catch (eS) { feitos = []; }
        status(textoStatus(feitos.length, crit) + ". Esc limpa; Delete apaga (Ctrl+Z desfaz).");
      }
      st.ultimo = { k: k, escopo: escopo, crit: crit, n: feitos.length, uids: feitos.slice(), alvo: uidAlvo };
      return feitos;
    },

    /* ------------------------------------------------ AÇÕES */
    _vistas2d: function () { var P2 = global.Bim2D; if (!P2 || !P2._cache) return; Object.keys(P2._cache).forEach(function (id) { if (/^d2t-/.test(id)) return; try { P2.atualizar(id); } catch (e) {} }); },
    _aplicarOcultos: function () { var b = B(), self = this; if (!b || !b.ocultarUids) return 0; var u = Object.keys(st.ocultos); var n = u.length ? b.ocultarUids(u) : 0; self._vistas2d(); return n; },
    ocultar: function (uids) {
      uids = arr(uids); if (!uids.length) { status("Nada selecionado para ocultar."); return 0; }
      uids.forEach(function (u) { st.ocultos[u] = 1; });
      this._tirarDaSelecao(uids);
      this._aplicarOcultos();
      status(uids.length + (uids.length === 1 ? " peça oculta" : " peças ocultas") + " (temporário). Mostrar todos traz de volta.");
      return uids.length;
    },
    isolar: function (uids) {
      uids = arr(uids); if (!uids.length) { status("Nada selecionado para isolar."); return 0; }
      var fica = {}; uids.forEach(function (u) { fica[u] = 1; });
      this.itens(null).forEach(function (it) { if (!fica[it.uid]) st.ocultos[it.uid] = 1; });
      uids.forEach(function (u) { delete st.ocultos[u]; });
      st.isolado = true;
      this._aplicarOcultos();
      status("Isoladas " + uids.length + (uids.length === 1 ? " peça" : " peças") + " (temporário). Mostrar todos traz o resto de volta.");
      return uids.length;
    },
    ocultarCategoria: function (cat) {
      if (!cat) return 0;
      var u = this.itens(null).filter(function (it) { return it.cat === cat; }).map(function (it) { return it.uid; });
      if (!u.length) return 0;
      u.forEach(function (x) { st.ocultos[x] = 1; });
      this._tirarDaSelecao(u);
      this._aplicarOcultos();
      status("Categoria " + nomeCat(cat) + " oculta: " + u.length + (u.length === 1 ? " peça" : " peças") + " (temporário). Mostrar todos traz de volta.");
      return u.length;
    },
    mostrarTodos: function () {
      var n = Object.keys(st.ocultos).length;
      st.ocultos = {}; st.isolado = false;
      var b = B(); try { if (b && b.restaurarVisibilidade) b.restaurarVisibilidade(); } catch (e) {}
      this._vistas2d();
      status("Tudo visível de novo" + (n ? " (" + n + (n === 1 ? " peça voltou)." : " peças voltaram).") : "."));
      return n;
    },
    ocultos: function () { return Object.keys(st.ocultos); },
    /* "Restaurar tudo" do painel Visibilidade e o mostrarTudo do 4D (js/bim.js) também acabam com o ocultar daqui */
    _limparOcultos: function () { st.ocultos = {}; st.isolado = false; },
    /* o editor refez a cena (op, desfazer): esconde de novo o que estava oculto */
    aposRebuild: function () { if (!Object.keys(st.ocultos).length) return; var b = B(); try { if (b && b.ocultarUids) b.ocultarUids(Object.keys(st.ocultos)); } catch (e) {} },
    _tirarDaSelecao: function (uids) {
      var fora = {}; arr(uids).forEach(function (u) { fora[u] = 1; });
      var s = this.selecao(), fica = s.filter(function (u) { return !fora[u]; });
      if (fica.length !== s.length) { var b = B(); try { b.selecionar(fica, "trocar"); } catch (e) {} }
      if (st.grupo) st.grupo.uids = st.grupo.uids.filter(function (u) { return !fora[u]; });
    },

    /* APAGAR: um lote, um Ctrl+Z. Fixada não sai sem aviso; parte de peça pronta pergunta. */
    apagar: function (uids, escolha) {
      uids = arr(uids); var self = this;
      if (!uids.length) { status("Nada selecionado para apagar."); return { ok: false }; }
      var itens = this.itens(null), pl = planoApagar(uids, itens);
      /* #85 (26/10/2026): a peça do IFC importado também sai: a MESMA ação do Modificar › Apagar (oculta e marcada como removida; o arquivo não muda) */
      if (!pl.livres.length && !pl.fixas.length && !pl.ifc.length) { status("Nada selecionado para apagar."); return { ok: false, ifc: 0 }; }
      if (pl.parciais.length && !escolha) { this._dlgPronta(uids, pl); return { ok: false, pergunta: "pronta" }; }
      if (pl.fixas.length && escolha !== "livres" && escolha !== "inteira-livres") { this._dlgFixas(uids, pl, escolha); return { ok: false, pergunta: "fixas" }; }
      var ids = pl.livres.slice();
      if (escolha === "inteira" || escolha === "inteira-livres") {
        var por = this._porUid(itens);
        pl.parciais.forEach(function (p) { p.resto.forEach(function (u) { if (por[u] && !por[u].fixo && ids.indexOf(u) < 0) ids.push(u); }); });
      }
      return this._executarApagar(ids, pl.fixas.length, pl.ifc);
    },
    _executarApagar: function (ids, nFixas, ifcUids) {
      var b = B(), lote = opsApagar(ids, (++st.seq) + "-" + Date.now().toString(36)), opsI = [];
      try { opsI = ifcUids && ifcUids.length && b && b.opsApagarIfc ? arr(b.opsApagarIfc(ifcUids)) : []; } catch (eI) { opsI = []; }
      if (opsI.length) { lote = lote || { op: "lote", id: "si-" + (++st.seq) + "-" + Date.now().toString(36), origem: "selecionar-instancias", pedido: "Apagar", ops: [] }; lote.ops = lote.ops.concat(opsI); lote.pedido = "Apagar " + lote.ops.length + (lote.ops.length === 1 ? " elemento" : " elementos"); ids = ids.concat(ifcUids); }
      if (!lote || !b || !b.editarLote) return { ok: false };
      try { b.selecionar([], "trocar"); } catch (e) {}
      var ok = !!b.editarLote(lote);
      st.grupo = null;
      status(ok ? ids.length + (ids.length === 1 ? " elemento apagado" : " elementos apagados") + " (Ctrl+Z desfaz" + (ids.length > 1 ? " de uma vez" : "") + ")." + (nFixas ? " " + nFixas + (nFixas === 1 ? " fixado ficou" : " fixados ficaram") + ": use Desafixar antes." : "") : "O editor recusou o apagar.");
      return { ok: ok, n: ids.length, fixas: nFixas || 0 };
    },
    /* a tecla Delete (js/bimprecisaoui.js): parte de uma peça pronta → pergunta antes. true = tratou */
    interceptarApagar: function (ids) {
      /* ⚠ RÁPIDO: é o caminho da tecla Delete (apagar 300 peças de um galpão de 920 tem que ficar abaixo de
         meio segundo — tools/e2e-metal-criar.js [h]). Só monta a lista inteira se alguma peça selecionada
         for de peça pronta; o galpão (c.galpao) não pergunta. */
      var b = B(), est = null; try { est = b && b.editarEstado ? b.editarEstado().estado : null; } catch (e0) { est = null; }
      var cs = arr(est && est.caixas), sel = {}, temPronta = false;
      arr(ids).forEach(function (x) { sel[String(x).replace(/^edit:/, "")] = 1; });
      for (var i = 0; i < cs.length && !temPronta; i++) if (cs[i] && cs[i].pronta && sel[String(cs[i].id)]) temPronta = true;
      if (!temPronta) return false;
      var uids = arr(ids).map(function (x) { x = String(x); return /^edit:/.test(x) ? x : "edit:" + x; });
      var pl = planoApagar(uids, this.itens(null));
      if (!pl.parciais.length) return false;
      this._dlgPronta(uids, pl);
      return true;
    },
    _dlgPronta: function (uids, pl) {
      var self = this, U = global.UI; if (!U || !U.modal) { this.apagar(uids, "selecionadas"); return; }
      var h = '<div data-bsi="dlg-pronta"><p style="margin:0 0 8px">' + pl.parciais.map(function (p) {
        return "A seleção tem <b>" + p.nSel + "</b> de <b>" + p.nTotal + "</b> peças de <b>" + esc(p.nome) + "</b> (peça pronta).";
      }).join("<br>") + "</p><p class=\"muted\" style=\"margin:0\">Apagar só o que está selecionado deixa o resto da peça pronta no modelo; apagar a peça inteira tira todas as barras, chapas e parafusos dela. Um Ctrl+Z desfaz.</p>" +
        (pl.fixas.length ? '<p style="margin:8px 0 0">' + pl.fixas.length + " peça(s) fixada(s) ficam (use Desafixar antes).</p>" : "") + "</div>";
      U.modal("Apagar parte de uma peça pronta", h, [
        { texto: "Apagar só as selecionadas", classe: "primary", onClick: function () { U.fecharModal(); self.apagar(uids, pl.fixas.length ? "livres" : "selecionadas"); } },
        { texto: "Apagar a peça pronta inteira", onClick: function () { U.fecharModal(); self.apagar(uids, pl.fixas.length ? "inteira-livres" : "inteira"); } },
        { texto: "Cancelar", classe: "ghost", onClick: function () { U.fecharModal(); status("Nada foi apagado."); } }
      ]);
    },
    _dlgFixas: function (uids, pl) {
      var self = this, U = global.UI; if (!U || !U.modal) { this.apagar(uids, "livres"); return; }
      var h = '<div data-bsi="dlg-fixas"><p style="margin:0 0 8px"><b>' + pl.fixas.length + "</b> " + (pl.fixas.length === 1 ? "peça está fixada" : "peças estão fixadas") + " e não " + (pl.fixas.length === 1 ? "sai" : "saem") + " (use Desafixar antes).</p>" +
        (pl.livres.length ? "<p style=\"margin:0\">Apagar as outras <b>" + pl.livres.length + "</b>?</p>" : "<p style=\"margin:0\">Não sobra nada livre para apagar.</p>") + "</div>";
      var bts = [];
      if (pl.livres.length) bts.push({ texto: "Apagar as " + pl.livres.length + " livres", classe: "primary", onClick: function () { U.fecharModal(); self.apagar(uids, "livres"); } });
      bts.push({ texto: "Cancelar", classe: "ghost", onClick: function () { U.fecharModal(); status("Nada foi apagado."); } });
      U.modal("Peças fixadas na seleção", h, bts);
    },

    /* a lista da seleção (clicar numa linha seleciona só ela) */
    lista: function (uids) {
      var self = this, U = global.UI, por = this._porUid(this.itens(null)); uids = arr(uids);
      if (!U || !U.modal) return false;
      var linhas = uids.map(function (u, i) { var it = por[u] || { nome: u }; return '<tr data-bsi-lin="' + esc(u) + '" style="cursor:pointer"><td>' + (i + 1) + "</td><td>" + esc(it.nome || u) + "</td><td>" + esc(it.tipoNome || "—") + "</td><td>" + esc(it.catNome || "—") + "</td></tr>"; }).join("");
      U.modal("Seleção — " + uids.length + (uids.length === 1 ? " peça" : " peças"), '<div data-bsi="lista" style="max-height:60vh;overflow:auto"><table class="tabela" style="width:100%"><thead><tr><th>#</th><th>Peça</th><th>Tipo</th><th>Categoria</th></tr></thead><tbody>' + linhas + "</tbody></table></div><p class=\"muted\" style=\"margin:8px 0 0\">Clique numa linha para selecionar só ela.</p>",
        [{ texto: "Fechar", classe: "ghost", onClick: function () { U.fecharModal(); } }]);
      var box = global.document.querySelector('[data-bsi="lista"]');
      if (box) box.onclick = function (ev) { var tr = ev.target.closest ? ev.target.closest("[data-bsi-lin]") : null; if (!tr) return; U.fecharModal(); var b = B(); try { b.selecionar([tr.getAttribute("data-bsi-lin")], "trocar"); } catch (e) {} };
      return true;
    },
    propriedades: function () {
      try {
        var d = global.document, p = d.querySelector(".rv-props");
        if (global.BimShell && global.BimShell.mostrarLateral) global.BimShell.mostrarLateral();
        if (p && p.scrollIntoView) p.scrollIntoView({ block: "nearest" });
        var s = this.selecao(); status(s.length > 1 ? "Propriedades: " + s.length + " selecionados — o valor diferente aparece como ‹vários›; mudar aplica a todas (um Ctrl+Z)." : "Propriedades da peça selecionada.");
        return true;
      } catch (e) { return false; }
    },
    trocarTipo: function () {
      var d = global.document; this.propriedades();
      var bt = d.querySelector('.rv-props [data-bp1="tipo"]');
      if (bt && !bt.disabled) { bt.click(); return "tipo"; }
      var sp = d.querySelector('.rv-props [data-rv-p="mcrp:cat"]');
      if (sp) { try { sp.focus(); } catch (e) {} status("Escolha o perfil novo na lista Perfil de Propriedades: vale para todas as peças selecionadas (um Ctrl+Z)."); return "perfil"; }
      status("Esta seleção não tem tipo para trocar."); return null;
    },
    comando: function (id) { try { if (global.BimShell && global.BimShell.executar) { global.BimShell.executar(id); return true; } } catch (e) {} return false; },

    /* ------------------------------------------------ o MENU do clique direito */
    menuAberto: function () { return !!st.menu; },
    /* ⚠ o Esc do menu escuta na JANELA (captura), como o Esc da seleção (js/bim.js S._selTeclas): no documento ele
       chegaria depois — o Esc limpava a seleção e o menu ficava aberto. O S._selTeclas cede quando o menu está aberto. */
    fecharMenu: function () { var m = st.menu; st.menu = null; if (m && m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el); if (m && m.fora) { global.document.removeEventListener("pointerdown", m.fora, true); global.removeEventListener("keydown", m.tecla, true); } },
    /* x, y: tela; uid: a peça sob o cursor (ou null); o: { vista: "3d"|id da vista 2D, ctrl, extras: [{id, rotulo, fn}] } */
    abrirMenu: function (x, y, uid, o) {
      o = o || {}; var self = this, d = global.document, b = B();
      if (!d || !b) return false;
      this.fecharMenu();
      var vista = o.vista || "3d", itens = this.itens(vista), por = this._porUid(itens), alvo = uid ? por[uid] : null;
      var sel = this.selecao();
      /* a peça clicada fora da seleção vira a seleção (com Ctrl, soma) */
      if (alvo && sel.indexOf(uid) < 0 && !(st.grupo && st.grupo.uids.indexOf(uid) >= 0)) { st.grupo = null; try { b.selecionar([uid], o.ctrl ? "somar" : "trocar"); } catch (eS) {} sel = this.selecao(); }
      if (!alvo && sel.length) alvo = por[sel[sel.length - 1]] || null;
      var extras = arr(o.extras);
      if (!alvo && !extras.length) return false;
      var m = d.createElement("div"); m.className = "rv-menu-doc bsi-menu"; m.setAttribute("data-bsi", "menu"); m.setAttribute("role", "menu");
      var h = "";
      if (alvo) {
        var crs = criterios(alvo, itens), alvosN = this.alvos().length || 1;
        h += '<div class="bsi-cab" data-bsi="cab">' + esc(alvo.nome || alvo.catNome) + (alvo.tipoNome ? ' <span class="bsi-fraco">· ' + esc(alvo.tipoNome) + "</span>" : "") + "</div>";
        h += '<div class="bsi-item bsi-temsub" data-bsi="sub" role="menuitem" aria-haspopup="true" tabindex="-1">Selecionar todas as instâncias <span class="bsi-seta">▸</span><div class="bsi-sub" data-bsi="submenu" role="menu">';
        crs.forEach(function (c) {
          h += '<div class="bsi-crit" data-bsi-crit="' + c.k + '"><div class="bsi-crit-nome">' + esc(c.rotulo) + ' <span class="bsi-fraco">· ' + esc(c.valor) + "</span></div>" +
               '<div class="bsi-crit-bts"><button type="button" class="bsi-bt" data-bsi-sel="' + c.k + ':vista"' + (c.nVista ? "" : " disabled") + ' title="Só o que está visível nesta vista">Nesta vista <b>' + c.nVista + '</b></button>' +
               '<button type="button" class="bsi-bt" data-bsi-sel="' + c.k + ':projeto" title="O projeto inteiro">No projeto <b>' + c.nProjeto + "</b></button></div></div>";
        });
        h += '<div class="bsi-dica">Ctrl + clique soma à seleção.</div></div></div>';
        var ed = alvo.editavel, mod = modelador(), nIfc = !ed, invs = {};
        try { if (alvosN === 1 && /^edit:/.test(String(alvo.uid)) && global.BimVaoArr && global.BimVaoArr.acoes) global.BimVaoArr.acoes(String(alvo.uid).slice(5)).forEach(function (q) { invs[q.id] = 1; }); } catch (eIv) {}
        var acoes = [
          { a: "apagar", r: "Apagar", n: alvosN, tecla: "Delete" },
          { a: "ocultar", r: "Ocultar na vista", n: alvosN },
          { a: "isolar", r: "Isolar na vista", n: alvosN },
          { a: "ocultar-cat", r: "Ocultar categoria · " + alvo.catNome },
          { a: "mostrar", r: "Mostrar todos", off: !Object.keys(st.ocultos).length && !this._algoOculto() },
          { sep: 1 },
          { a: "mover", r: "Mover", tecla: "MV", off: !(ed && mod) },
          { a: "copiar", r: "Copiar", tecla: "CO", off: !(ed && mod) },
          { a: "elevar", r: "Elevar…", tecla: "EL", n: alvosN, off: !(ed && mod && global.BimElevarUI) },   /* ELEVAR (js/bimelevarui.js) */
          { a: "apoiar", r: "Apoiar em…", tecla: "AE", n: alvosN, off: !(ed && mod && global.BimApoiarUI) },   /* APOIAR EM… (js/bimapoiarui.js) */
          { a: "props", r: "Propriedades" + (alvosN > 1 ? " em lote" : "") },
          { a: "trocar-tipo", r: "Trocar tipo/perfil…", off: !ed },
          { a: "inv-fora", r: "Inverter dentro/fora", tecla: "Espaço", off: !(invs.fora) },   /* PORTAS E JANELAS (js/vaoinverter.js) */
          { a: "inv-mao", r: "Espelhar (mão)", tecla: "⇧ Espaço", off: !(invs.mao) },
          { a: "lista", r: "Lista da seleção" }
        ];
        h += '<div class="bsi-sep"></div>';
        acoes.forEach(function (c) {
          if (c.sep) { h += '<div class="bsi-sep"></div>'; return; }
          h += '<div class="bsi-item' + (c.off ? " bsi-off" : "") + '" role="menuitem" tabindex="-1" data-bsi-acao="' + c.a + '"' + (c.off ? ' aria-disabled="true"' : "") + ">" + esc(c.r) + (c.n > 1 ? " <b>(" + c.n + ")</b>" : "") + (c.tecla ? '<span class="bsi-tecla">' + c.tecla + "</span>" : "") + "</div>";
        });
      }
      if (extras.length) h += (alvo ? '<div class="bsi-sep"></div>' : "") + extras.map(function (it, i) { return '<div class="bsi-item" role="menuitem" tabindex="-1" data-bsi-extra="' + i + '"' + (it.id ? ' data-rv-menu-item="' + esc(it.id) + '"' : "") + ">" + esc(it.rotulo) + "</div>"; }).join("");
      m.innerHTML = h;
      d.body.appendChild(m);
      var r = m.getBoundingClientRect(), W = global.innerWidth || 1200, H = global.innerHeight || 800;
      var L = Math.max(4, Math.min(x, W - r.width - 6)), T = Math.max(4, Math.min(y, H - r.height - 6));
      m.style.left = L + "px"; m.style.top = T + "px";
      if (L + r.width + 330 > W) m.classList.add("bsi-sub-esq");
      var mm = { el: m, alvo: alvo ? alvo.uid : null, vista: vista };
      mm.fora = function (ev) { if (!m.contains(ev.target)) self.fecharMenu(); };
      mm.tecla = function (ev) { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); self.fecharMenu(); } };
      st.menu = mm;
      setTimeout(function () { if (st.menu !== mm) return; d.addEventListener("pointerdown", mm.fora, true); global.addEventListener("keydown", mm.tecla, true); }, 0);
      m.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
      m.onclick = function (ev) {
        var t = ev.target, bt = t.closest ? t.closest("[data-bsi-sel]") : null;
        if (bt) {
          if (bt.disabled) return;
          var ks = bt.getAttribute("data-bsi-sel").split(":");
          self.fecharMenu(); self.selecionarPor(mm.alvo, ks[0], ks[1], vista, !!(ev.ctrlKey || ev.metaKey)); return;
        }
        var sub = t.closest ? t.closest('[data-bsi="sub"]') : null;
        if (sub && !(t.closest && t.closest('[data-bsi="submenu"]'))) { sub.classList.toggle("bsi-aberto"); return; }
        var ac = t.closest ? t.closest("[data-bsi-acao]") : null;
        if (ac) { if (ac.classList.contains("bsi-off")) return; self.fecharMenu(); self.acao(ac.getAttribute("data-bsi-acao"), mm.alvo); return; }
        var ex = t.closest ? t.closest("[data-bsi-extra]") : null;
        if (ex) { var it = extras[+ex.getAttribute("data-bsi-extra")]; self.fecharMenu(); if (it && typeof it.fn === "function") it.fn(); }
      };
      var subEl = m.querySelector('[data-bsi="sub"]');
      if (subEl) subEl.addEventListener("mouseenter", function () { subEl.classList.add("bsi-aberto"); });
      return true;
    },
    _algoOculto: function () { var b = B(); try { return !!(b && b.algoOculto && b.algoOculto()); } catch (e) { return false; } },
    acao: function (a, uidAlvo) {
      var alvos = this.alvos(), it = uidAlvo ? this._porUid(this.itens(null))[uidAlvo] : null;
      if (a === "apagar") return this.apagar(alvos);
      if (a === "ocultar") return this.ocultar(alvos);
      if (a === "isolar") return this.isolar(alvos);
      if (a === "ocultar-cat") return this.ocultarCategoria(it ? it.cat : null);
      if (a === "mostrar") return this.mostrarTodos();
      if (a === "mover") return this.comando("mover-preciso");
      if (a === "copiar") return this.comando("copiar");
      if (a === "elevar") return this.comando("elevar");
      if (a === "apoiar") return this.comando("apoiar");
      if (a === "props") return this.propriedades();
      if (a === "trocar-tipo") return this.trocarTipo();
      if ((a === "inv-fora" || a === "inv-mao") && uidAlvo && global.BimVaoArr && global.BimVaoArr.inverter) return global.BimVaoArr.inverter(a === "inv-fora" ? "fora" : "mao", String(uidAlvo).replace(/^edit:/, ""));
      if (a === "lista") return this.lista(alvos);
      return null;
    },
    /* o clique direito da vista 2D (js/bim2dui.js não precisa saber: o ouvinte é o do documento, js/gestao.js) */
    estado: function () { return { ocultos: Object.keys(st.ocultos).length, isolado: st.isolado, grupo: st.grupo ? { n: st.grupo.uids.length, crit: st.grupo.crit } : null, ultimo: st.ultimo, menu: st.menu ? { alvo: st.menu.alvo, vista: st.menu.vista } : null }; }
  };

  global.BimSelInst = BimSelInst;
  if (typeof module !== "undefined" && module.exports) module.exports = BimSelInst;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

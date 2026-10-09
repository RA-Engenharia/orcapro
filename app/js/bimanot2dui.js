/* =====================================================================
 * bimanot2dui.js — ANOTAÇÃO NAS VISTAS 2D (prévia
 * `?previa=modelador`). Fase P7 do plano do BIM, frentes A,
 * B e C. O motor é o js/bimanot.js (bloco P7, `BimAnotP7`): referências,
 * medida, ops e SVG; aqui só se ARMA a ferramenta, se CLICA na vista, se
 * GRAVA a op e se mostra Propriedades.
 *
 * O QUE APARECE (fita › Anotar, só com a prévia)
 *   · Cota: Alinhada, Linear (horizontal/vertical), Angular, Radial,
 *     Diâmetro, Comprimento do arco, Cota de elevação, Inclinação — e
 *     "Tipos de cota e texto" (os tipos nomeados, Duplicar/Editar tipo).
 *     A cota agarra FACE, EIXO ou PONTA da peça (clique perto dela) e
 *     acompanha quando a peça anda; mais de duas referências = cadeia; um
 *     clique no vazio posiciona a linha (o 3º clique posiciona a linha).
 *   · Texto: Texto (com ou sem chamada), Símbolo, Nota-chave.
 *   · Detalhe: Linha de detalhe (estilo de linha), Região preenchida,
 *     Região de mascaramento, Componente de detalhe (biblioteca RA), Legenda.
 *   · Revisão: Nuvem de revisão (ligada a uma revisão do projeto) e
 *     Revisões do projeto (número, data, descrição, emitido por).
 *   · Seleção: clique na anotação (sem ferramenta) → Propriedades: tipo,
 *     prefixo/sufixo, EQ, Travar, texto, estilo, padrão…; Delete apaga.
 *   · Cota TRAVADA violada (a peça andou): o aviso "Restrição não
 *     satisfeita", com Mover junto / Destravar / Desfazer.
 * Sem a prévia, `ativo()` é falso e nada disto liga.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function A7() { return global.BimAnotP7 || null; }
  function B() { return global.BIM || null; }
  function P2() { return global.Bim2D || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function novoId() { return "n7" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36); }
  function hoje() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear(); }

  /* comando da fita → o que ele faz */
  var CMDS = {
    "p7-cota-alinhada": { k: "cota", cota: "alinhada", rotulo: "Cota alinhada" },
    "p7-cota-linear": { k: "cota", cota: "linear", rotulo: "Cota linear" },
    "p7-cota-angular": { k: "cota", cota: "angular", rotulo: "Cota angular" },
    "p7-cota-radial": { k: "cota", cota: "radial", rotulo: "Cota radial" },
    "p7-cota-diametro": { k: "cota", cota: "diametro", rotulo: "Cota de diâmetro" },
    "p7-cota-arco": { k: "cota", cota: "arco", rotulo: "Cota de comprimento de arco" },
    "p7-cota-elevacao": { k: "cota", cota: "elevacao", rotulo: "Cota de elevação" },
    "p7-cota-inclinacao": { k: "cota", cota: "inclinacao", rotulo: "Inclinação de ponto" },
    "p7-texto": { k: "texto", rotulo: "Texto" },
    "p7-simbolo": { k: "simbolo", rotulo: "Símbolo" },
    "p7-nota-chave": { k: "notaChave", rotulo: "Nota-chave" },
    "p7-linha-detalhe": { k: "linha", rotulo: "Linha de detalhe" },
    "p7-regiao": { k: "regiao", rotulo: "Região preenchida" },
    "p7-mascara": { k: "regiao", mascara: true, rotulo: "Região de mascaramento" },
    "p7-componente": { k: "componente", rotulo: "Componente de detalhe" },
    "p7-legenda": { k: "legenda", rotulo: "Legenda" },
    "p7-nuvem": { k: "nuvem", rotulo: "Nuvem de revisão" }
  };
  var ROTULO_TIPO = { cota: "Cota", texto: "Nota de texto", simbolo: "Símbolo", notaChave: "Nota-chave", nuvem: "Nuvem de revisão",
                      linha: "Linha de detalhe", regiao: "Região preenchida", componente: "Componente de detalhe", legenda: "Legenda" };

  var BimAnot2DUI = {
    _f: null,          /* ferramenta armada: { cmd, def, refs:[], pts:[], fase } */
    _sel: null,        /* id da anotação selecionada */
    _opc: null,        /* opções das ferramentas (a barra de opções da ferramenta) */
    _viol: {},         /* violações já avisadas */
    _ultimaVista: null,

    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && A7()); } catch (e) { return false; } },
    estado: function () { var b = B(); var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    opcoes: function () {
      if (this._opc) return this._opc;
      var o = null; try { o = JSON.parse(global.localStorage.getItem("orcapro:bim:anot2d:opc") || "null"); } catch (e) { o = null; }
      var p = { tipoCota: "", orient: "auto", tipoTexto: "t25", comLider: false, simbolo: "norte", estilo: "<Linhas finas>", forma: "linhas",
                padrao: "Diagonal ascendente", comp: "bloco-ceramico", revisao: "" };
      if (o && typeof o === "object") Object.keys(p).forEach(function (k) { if (o[k] != null) p[k] = o[k]; });
      this._opc = p; return p;
    },
    _gravarOpc: function () { try { global.localStorage.setItem("orcapro:bim:anot2d:opc", JSON.stringify(this._opc)); } catch (e) {} },

    /* ----------------------------------------------- fita e comandos */
    registrar: function (reg) {
      if (!this.ativo() || !global.BimRibbon) return false;
      var self = this, R = global.BimRibbon;
      var C = function (id, rot, ico, dica, grande, tipo) { var c = { id: id, rotulo: rot, icone: ico, dica: dica, tipo: tipo || "alterna" }; if (grande) c.grande = true; return c; };
      R.acrescentar("anotar", "Anotar", "Cota", [
        C("p7-cota-alinhada", "Cota\nalinhada", "regua", "Cota alinhada: clique perto da FACE, do EIXO ou da PONTA de uma peça (ou de uma linha de detalhe), depois da outra — mais referências fazem cadeia — e clique no vazio para posicionar a linha. A cota fica presa às peças e acompanha quando elas andam. Na vista 2D aberta.", true),
        C("p7-cota-linear", "Cota\nlinear", "regua", "Cota linear horizontal ou vertical (Propriedades da ferramenta): mede só na direção X ou Y da vista, entre referências."),
        C("p7-cota-angular", "Angular", "angulo", "Cota angular: clique duas linhas (faces de parede, eixos, linhas de detalhe) e onde passa o arco."),
        C("p7-cota-radial", "Radial", "alvo", "Cota radial: clique no contorno de um pilar circular ou de um círculo/arco de detalhe e onde vai o texto."),
        C("p7-cota-diametro", "Diâmetro", "alvo", "Cota de diâmetro: clique no contorno de um pilar circular ou de um círculo de detalhe."),
        C("p7-cota-arco", "Comprimento\ndo arco", "ciclo", "Comprimento do arco: clique num arco de detalhe e onde passa a linha de cota."),
        C("p7-cota-elevacao", "Cota de\nelevação", "niveis", "Cota de elevação: clique no ponto (topo da laje, da viga… ou o nível da vista; no corte, a altura do ponto) e onde vai o texto."),
        C("p7-cota-inclinacao", "Inclinação", "telhado", "Inclinação de ponto: na planta, clique numa água da cobertura; no corte, clique dois pontos. Mostra a inclinação em % com a seta do caimento."),
        C("p7-tipos", "Tipos de cota\ne texto", "ajustes", "Os tipos nomeados de cota e de texto (os da RA e os do projeto): duplicar e editar o tipo — vale para todas as cotas e textos daquele tipo.", false, "botao")
      ]);
      R.acrescentar("anotar", "Anotar", "Texto", [
        C("p7-texto", "Texto", "editar", "Nota de texto na vista, com ou sem chamada (seta): o tipo de texto dá a altura (padrão RA: 2,5 · 3,5 · 5 · 7 mm), o fundo e a seta.", true),
        C("p7-simbolo", "Símbolo", "estrela", "Símbolo 2D: norte, seta, ponto de referência, escala gráfica."),
        C("p7-nota-chave", "Nota-chave", "chave", "Nota-chave: a chave num quadro na vista e o texto na Legenda.")
      ]);
      R.acrescentar("anotar", "Anotar", "Detalhe", [
        C("p7-linha-detalhe", "Linha de\ndetalhe", "pincel", "Linha de detalhe só desta vista, com estilo de linha (finas, médias, grossas, ocultas, centro, projeção, demolido): clique os pontos, Enter termina. Também círculo e arco (Propriedades da ferramenta).", true),
        C("p7-regiao", "Região\npreenchida", "area", "Região preenchida: clique o contorno (Enter ou clique no 1º ponto fecha) com o padrão de preenchimento (concreto, alvenaria, terra, areia, madeira…)."),
        C("p7-mascara", "Região de\nmascaramento", "quadrado", "Região de mascaramento: esconde o modelo por baixo (papel branco), sem borda."),
        C("p7-componente", "Componente\nde detalhe", "bloco", "Componente de detalhe da biblioteca RA (bloco cerâmico, bloco de concreto, madeira, perfil U, junta): clique onde vai."),
        C("p7-legenda", "Legenda", "lista", "Legenda da vista: lista os estilos de linha, os padrões, os componentes e as notas-chave usados nela.")
      ]);
      R.acrescentar("anotar", "Anotar", "Revisão", [
        C("p7-nuvem", "Nuvem de\nrevisão", "nuvem", "Nuvem de revisão ligada a uma revisão do projeto: clique o contorno, Enter fecha. O número da revisão aparece no identificador e a revisão vai para o carimbo.", true),
        C("p7-revisoes", "Revisões do\nprojeto", "calendario", "Revisões do projeto (número, data, descrição, emitido por) — a tabela que o carimbo das pranchas mostra.", false, "botao")
      ]);
      Object.keys(CMDS).forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
      Object.keys(CMDS).forEach(function (k) {
        reg[k] = function (e) {
          if (e && e.ligado === false) { self.desarmar(); status("Ferramenta desligada."); return true; }
          return self.armar(k) !== false;
        };
      });
      reg["p7-tipos"] = function () { self.dialogoTipos(); return true; };
      reg["p7-revisoes"] = function () { self.dialogoRevisoes(); return true; };
      this._ligarTeclado();
      return true;
    },

    /* ----------------------------------------------- vista ativa */
    vistaAtiva: function () {
      var P = P2(); if (!P) return null;
      var a = null; try { a = global.Gestao && global.Gestao._bimVxEst ? global.Gestao._bimVxEst().ativa : null; } catch (e) { a = null; }
      if (a && P.ehVista2d(a) && P._cache[a]) return a;
      if (this._ultimaVista && P._cache[this._ultimaVista]) return this._ultimaVista;
      var ks = Object.keys(P._cache || {}).filter(function (k) { return P._cache[k] && P._cache[k].el; });
      return ks[0] || null;
    },
    armar: function (cmd) {
      var def = CMDS[cmd]; if (!def) return false;
      var P = P2();
      if (!this.vistaAtiva() && P) {
        /* a anotação é da vista 2D: sem nenhuma aberta, abre a planta do 1º nível */
        try { var nv = P.niveis()[0]; if (nv) P.abrir(P.idPlanta(nv.id)); } catch (e) {}
      }
      if (!this.vistaAtiva()) { toast("A anotação vai numa vista 2D: abra uma planta ou um corte (Analisar › Planta baixa).", "aviso"); return false; }
      this._limparPrevia();
      this._f = { cmd: cmd, def: def, refs: [], pts: [], fase: 0 };
      this._sel = null;
      this._marcarVistas(true);
      try { if (global.BimShell) global.BimShell.pintarProps(this.esquemaFerramenta()); } catch (e2) {}
      status(this.dica());
      return true;
    },
    desarmar: function () {
      var f = this._f; this._f = null; this._limparPrevia(); this._marcarVistas(false);
      try { if (f && global.BimRibbon) global.BimRibbon.setAtivo(f.cmd, false); if (global.BimShell && global.BimShell.repintarFita) global.BimShell.repintarFita(); } catch (e) {}
      try { if (global.BimShell) global.BimShell.pintarProps(null); } catch (e2) {}
    },
    _marcarVistas: function (on) {
      var P = P2(); if (!P) return;
      Object.keys(P._cache || {}).forEach(function (k) { var c = P._cache[k]; if (c && c.el) { if (on) c.el.setAttribute("data-a7-ferr", "1"); else c.el.removeAttribute("data-a7-ferr"); } });
    },
    dica: function () {
      var f = this._f; if (!f) return "";
      var d = f.def;
      if (d.k === "cota") {
        if (d.cota === "linear" || d.cota === "alinhada") return f.refs.length < 2 ? d.rotulo + ": clique a " + (f.refs.length ? "próxima" : "1ª") + " referência (face, eixo ou ponta da peça). Esc sai." : d.rotulo + ": mais uma referência faz cadeia; clique no vazio para posicionar a linha (Enter usa a posição padrão).";
        if (d.cota === "angular") return f.refs.length < 2 ? "Cota angular: clique a " + (f.refs.length ? "2ª" : "1ª") + " linha." : "Cota angular: clique onde passa o arco.";
        if (d.cota === "elevacao") return f.refs.length ? "Cota de elevação: clique onde vai o texto." : "Cota de elevação: clique o ponto.";
        if (d.cota === "inclinacao") return "Inclinação: clique numa água da cobertura (planta) ou dois pontos (corte).";
        return f.refs.length ? d.rotulo + ": clique onde vai o texto." : d.rotulo + ": clique no contorno do círculo ou do arco.";
      }
      if (d.k === "linha") return "Linha de detalhe: clique os pontos; Enter termina; Esc cancela.";
      if (d.k === "regiao" || d.k === "nuvem") return d.rotulo + ": clique o contorno; Enter (ou clique no 1º ponto) fecha.";
      if (d.k === "texto") return this.opcoes().comLider && !f.pts.length ? "Texto com chamada: clique a ponta da seta, depois onde vai o texto." : "Texto: clique onde vai o texto.";
      return d.rotulo + ": clique onde vai.";
    },

    /* Propriedades da FERRAMENTA (a barra de opções da ferramenta) */
    esquemaFerramenta: function () {
      var self = this, f = this._f, M = A7(); if (!f || !M) return null;
      var o = this.opcoes(), st = this.estado(), d = f.def, params = [];
      function lista(id, rot, valor, ops) { return { id: id, rotulo: rot, tipo: "lista", valor: valor, opcoes: ops }; }
      if (d.k === "cota") {
        var est = M.ESTILO_DA_COTA[d.cota], tipos = M.tiposCota(st).filter(function (t) { return t.estilo === est; });
        params.push(lista("tipoCota", "Tipo de cota", o.tipoCota && tipos.some(function (t) { return t.id === o.tipoCota; }) ? o.tipoCota : (tipos[0] || {}).id, tipos.map(function (t) { return { id: t.id, rotulo: t.nome }; })));
        if (d.cota === "linear") params.push(lista("orient", "Direção", o.orient, [{ id: "auto", rotulo: "Automática" }, { id: "h", rotulo: "Horizontal" }, { id: "v", rotulo: "Vertical" }]));
      }
      if (d.k === "texto") {
        params.push(lista("tipoTexto", "Tipo de texto", o.tipoTexto, M.tiposTexto(st).map(function (t) { return { id: t.id, rotulo: t.nome }; })));
        params.push({ id: "comLider", rotulo: "Com chamada (seta)", tipo: "sim-nao", valor: !!o.comLider });
      }
      if (d.k === "simbolo") params.push(lista("simbolo", "Símbolo", o.simbolo, Object.keys(M.SIMBOLOS).map(function (k) { return { id: k, rotulo: M.SIMBOLOS[k].nome }; })));
      if (d.k === "linha") {
        params.push(lista("estilo", "Estilo de linha", o.estilo, Object.keys(M.ESTILOS_LINHA).filter(function (k) { return !M.ESTILOS_LINHA[k].invisivel; }).map(function (k) { return { id: k, rotulo: k }; })));
        params.push(lista("forma", "Forma", o.forma, [{ id: "linhas", rotulo: "Linhas (pontos)" }, { id: "circulo", rotulo: "Círculo (centro e raio)" }, { id: "arco", rotulo: "Arco (centro, início e fim)" }]));
      }
      if (d.k === "regiao" && !d.mascara) {
        params.push(lista("padrao", "Padrão de preenchimento", o.padrao, Object.keys(M.PADROES).map(function (k) { return { id: k, rotulo: k }; })));
        params.push(lista("estilo", "Estilo da borda", o.estilo, Object.keys(M.ESTILOS_LINHA).map(function (k) { return { id: k, rotulo: k }; })));
      }
      if (d.k === "componente") params.push(lista("comp", "Componente", o.comp, Object.keys(M.COMPONENTES).map(function (k) { return { id: k, rotulo: M.COMPONENTES[k].nome }; })));
      if (d.k === "nuvem") {
        var revs = M.revisoes(st);
        params.push(lista("revisao", "Revisão", o.revisao && revs.some(function (r) { return r.id === o.revisao; }) ? o.revisao : (revs.length ? revs[revs.length - 1].id : "__nova"),
          revs.map(function (r) { return { id: r.id, rotulo: r.numero + (r.descricao ? " — " + r.descricao : "") }; }).concat([{ id: "__nova", rotulo: "Nova revisão (" + M.proximoNumero(st) + ")" }])));
        params.push({ id: "revisoes", rotulo: "Revisões", tipo: "botao", rotuloBotao: "Revisões do projeto…", fn: function () { self.dialogoRevisoes(); } });
      }
      return { daVista: false, semEditarTipo: true, titulo: d.rotulo, icone: "regua", secoes: [{ nome: "Ferramenta", params: params }],
               onMudar: function (pid, valor) { self.opcoes()[pid] = valor; self._gravarOpc(); return self.esquemaFerramenta(); } };
    },

    /* ----------------------------------------------- cliques na vista 2D */
    _tol: function (id, px) {
      var P = P2(), c = P && P._cache[id]; if (!c || !c.svg || !c.svg.getScreenCTM) return 0.08;
      var m = c.svg.getScreenCTM(); return m && m.a ? (px || 9) / m.a : 0.08;
    },
    _nivelY: function (id) { var P = P2(), d = P && P.def ? P.def(id) : null; return d && d.nivel ? num(d.nivel.y, 0) : null; },
    _op: function (o) {
      var b = B(); if (!b || !b.b2Op) { toast("O editor do modelo não está aberto.", "erro"); return false; }
      var ok = b.b2Op(o);
      if (!ok) toast("Não consegui gravar a anotação (dado inválido).", "aviso");
      return ok;
    },
    clique2d: function (id, ev, p) {
      if (!this.ativo()) return false;
      this._ultimaVista = id;
      var f = this._f;
      if (f && global.BimRibbon && !global.BimRibbon.ativo(f.cmd)) { this.desarmar(); f = null; }
      if (!f) {
        var alvo = ev && ev.target && ev.target.closest ? ev.target.closest("[data-a7]") : null;
        if (alvo) { this.selecionar(alvo.getAttribute("data-a7"), id); return true; }
        if (this._sel) { this.selecionar(null, id); }
        return false;
      }
      if (!p) return true;
      var M = A7(), st = this.estado(), d = f.def, o = this.opcoes(), corte = /^d2c-/.test(id), tol = this._tol(id), q = { x: p[0], y: p[1] };
      if (f.vista && f.vista !== id) { f.refs = []; f.pts = []; }
      f.vista = id;
      if (d.k === "cota") return this._cliqueCota(id, p, st, f, d, o, corte, tol);
      if (d.k === "texto") {
        if (o.comLider && !f.pts.length) { f.pts.push(q); status(this.dica()); return true; }
        var alvoL = f.pts[0] || null; f.pts = [];
        this._pedirTexto("Texto", "", function (tx) {
          var r = M.opTexto({ id: novoId(), vista: id, x: p[0], y: p[1], texto: tx, tipoTexto: o.tipoTexto, comLider: !!alvoL, lx: alvoL && alvoL.x, ly: alvoL && alvoL.y });
          if (!r.ok) { toast(r.motivo, "aviso"); return; }
          BimAnot2DUI._op(r.op); status("Texto colocado. Clique outro lugar ou Esc.");
        });
        return true;
      }
      if (d.k === "simbolo") { var rs = M.opSimbolo({ id: novoId(), vista: id, x: p[0], y: p[1], simbolo: o.simbolo }); if (rs.ok) this._op(rs.op); return true; }
      if (d.k === "componente") { var rc = M.opComponente({ id: novoId(), vista: id, x: p[0], y: p[1], comp: o.comp }); if (rc.ok) this._op(rc.op); return true; }
      if (d.k === "legenda") { var rl = M.opLegenda({ id: novoId(), vista: id, x: p[0], y: p[1] }); if (rl.ok) { this._op(rl.op); this.desarmar(); } return true; }
      if (d.k === "notaChave") {
        this._pedirNota(function (ch, tx) { var rn = M.opNotaChave({ id: novoId(), vista: id, x: p[0], y: p[1], chave: ch, texto: tx }); if (!rn.ok) { toast(rn.motivo, "aviso"); return; } BimAnot2DUI._op(rn.op); });
        return true;
      }
      if (d.k === "linha" && o.forma !== "linhas") {
        f.pts.push(q);
        if (o.forma === "circulo" && f.pts.length === 2) {
          var c0 = f.pts[0], rr = Math.sqrt(Math.pow(q.x - c0.x, 2) + Math.pow(q.y - c0.y, 2)); f.pts = [];
          var rcirc = M.opLinha({ id: novoId(), vista: id, estilo: o.estilo, arco: { cx: c0.x, cy: c0.y, r: rr } }); if (rcirc.ok) this._op(rcirc.op);
        } else if (o.forma === "arco" && f.pts.length === 3) {
          var ca = f.pts[0], pa = f.pts[1], pb = f.pts[2], ra = Math.sqrt(Math.pow(pa.x - ca.x, 2) + Math.pow(pa.y - ca.y, 2)); f.pts = [];
          var rarc = M.opLinha({ id: novoId(), vista: id, estilo: o.estilo, arco: { cx: ca.x, cy: ca.y, r: ra, a0: Math.atan2(pa.y - ca.y, pa.x - ca.x), a1: Math.atan2(pb.y - ca.y, pb.x - ca.x) } }); if (rarc.ok) this._op(rarc.op);
        }
        this._previa(id, p); return true;
      }
      if (d.k === "linha" || d.k === "regiao" || d.k === "nuvem") {
        /* clique no 1º ponto fecha o contorno */
        if (f.pts.length >= 3 && d.k !== "linha" && Math.sqrt(Math.pow(q.x - f.pts[0].x, 2) + Math.pow(q.y - f.pts[0].y, 2)) < tol) { this.concluir(); return true; }
        f.pts.push(q); this._previa(id, p); status(this.dica()); return true;
      }
      return true;
    },
    _cliqueCota: function (id, p, st, f, d, o, corte, tol) {
      var M = A7(), q = { x: p[0], y: p[1] }, k = d.cota, self = this;
      function criar(extra) {
        var base = { id: novoId(), vista: id, cota: k, refs: f.refs, tipoCota: o.tipoCota || undefined };
        Object.keys(extra || {}).forEach(function (x) { base[x] = extra[x]; });
        var r = M.opCota(base); if (!r.ok) { toast(r.motivo, "aviso"); return false; }
        /* o tipo escolhido precisa ser do estilo certo; se não for, fica o padrão */
        if (r.op.tipoCota && !M.tiposCota(st).some(function (t) { return t.id === r.op.tipoCota && t.estilo === M.ESTILO_DA_COTA[k]; })) delete r.op.tipoCota;
        f.refs = []; self._limparPrevia();
        var ok = self._op(r.op);
        if (ok) status(d.rotulo + " criada. Clique a próxima ou Esc.");
        return ok;
      }
      if (k === "linear" || k === "alinhada") {
        var h = corte ? null : M.acharRef(st, p, tol, null, id);
        if (h && !f.refs.some(function (r) { return r.el === h.ref.el && r.r === h.ref.r; })) { f.refs.push(h.ref); status(this.dica() + " (" + h.rotulo + ")"); this._previa(id, p); return true; }
        if (f.refs.length < 2) { f.refs.push({ x: q.x, y: q.y }); this._previa(id, p); status(this.dica()); return true; }
        var orient = k === "linear" ? (o.orient === "h" || o.orient === "v" ? o.orient : this._orientAuto(st, f.refs, p, corte)) : undefined;
        var prov = { tipo: "cota", cota: k, refs: f.refs, orient: orient, off: 0, vista: id };
        return criar({ orient: orient, off: M.offsetPara(st, prov, p, { corte: corte }) }) || true;
      }
      if (k === "angular") {
        if (f.refs.length < 2) {
          var ha = M.acharRef(st, p, tol, "linha", id);
          if (!ha || ha.ref.r === "centro") { toast("Clique perto de uma linha (face de parede, eixo, linha de detalhe).", "aviso"); return true; }
          f.refs.push(ha.ref); status(this.dica()); return true;
        }
        var pa = { tipo: "cota", cota: k, refs: f.refs, off: 1 };
        return criar({ off: M.offsetPara(st, pa, p, {}) }) || true;
      }
      if (k === "radial" || k === "diametro" || k === "arco") {
        if (!f.refs.length) {
          var hc = M.acharRef(st, p, tol, "circulo", id);
          if (!hc) { toast("Clique no contorno de um pilar circular ou de um círculo/arco de detalhe.", "aviso"); return true; }
          f.refs.push(hc.ref); status(this.dica()); return true;
        }
        var m0 = M.medirCota(st, { tipo: "cota", cota: k, refs: f.refs }, {});
        var ang = m0.ok ? Math.atan2(p[1] - m0.geo.c[1], p[0] - m0.geo.c[0]) : 0;
        var off = m0.ok ? Math.sqrt(Math.pow(p[0] - m0.geo.c[0], 2) + Math.pow(p[1] - m0.geo.c[1], 2)) - m0.geo.r : 0.3;
        return criar({ ang: ang, off: off }) || true;
      }
      if (k === "elevacao") {
        if (!f.refs.length) {
          var he = corte ? { ref: { x: q.x, y: q.y } } : M.acharRef(st, p, tol, "topo", id);
          if (he.ref.r === "nivel") he.ref.yRef = this._nivelY(id) || 0;
          f.refs.push(he.ref); status(this.dica()); return true;
        }
        return criar({ lx: p[0], ly: p[1] }) || true;
      }
      if (k === "inclinacao") {
        if (!corte) {
          var hp = M.acharRef(st, p, tol, "plano", id);
          if (!hp) { toast("Clique dentro de uma água da cobertura.", "aviso"); return true; }
          f.refs = [hp.ref]; return criar({}) || true;
        }
        f.refs.push({ x: q.x, y: q.y });
        if (f.refs.length >= 2) return criar({}) || true;
        return true;
      }
      return true;
    },
    _orientAuto: function (st, refs, p, corte) {
      var M = A7(), I = M.indice(st), a = M.resolverRef(I, refs[0], { corte: corte }), b = M.resolverRef(I, refs[refs.length - 1], { corte: corte });
      if (!a.ok || !b.ok) return "h";
      return Math.abs(b.p[0] - a.p[0]) >= Math.abs(b.p[1] - a.p[1]) ? "h" : "v";
    },
    /* Enter: fecha o contorno, termina a linha ou posiciona a cota no lugar padrão */
    concluir: function () {
      var f = this._f, M = A7(); if (!f || !M || !f.vista) return false;
      var d = f.def, o = this.opcoes(), id = f.vista, r = null;
      if (d.k === "cota" && (d.cota === "linear" || d.cota === "alinhada") && f.refs.length >= 2) {
        var orient = d.cota === "linear" ? (o.orient === "h" || o.orient === "v" ? o.orient : this._orientAuto(this.estado(), f.refs, null, /^d2c-/.test(id))) : undefined;
        r = M.opCota({ id: novoId(), vista: id, cota: d.cota, refs: f.refs, off: 0.6, orient: orient, tipoCota: o.tipoCota || undefined });
        f.refs = [];
      } else if (d.k === "linha" && f.pts.length >= 2) { r = M.opLinha({ id: novoId(), vista: id, pts: f.pts, estilo: o.estilo }); f.pts = []; }
      else if (d.k === "regiao" && f.pts.length >= 3) { r = M.opRegiao({ id: novoId(), vista: id, pts: f.pts, padrao: o.padrao, estilo: d.mascara ? null : o.estilo, mascara: !!d.mascara }); f.pts = []; }
      else if (d.k === "nuvem" && f.pts.length >= 3) {
        var st = this.estado(), revs = M.revisoes(st), rid = o.revisao && revs.some(function (x) { return x.id === o.revisao; }) ? o.revisao : (revs.length ? revs[revs.length - 1].id : null);
        if (!rid || o.revisao === "__nova") {
          /* sem revisão: nasce a próxima (R01, R02…) — a nuvem exige uma revisão a que se ligar */
          var rv = M.opRevisao({ id: "rv" + Date.now().toString(36), numero: M.proximoNumero(st), data: hoje(), descricao: "Revisão " + M.proximoNumero(st).replace(/^R/, ""), emitidoPor: this._usuario() });
          if (!rv.ok || !this._op(rv.op)) return false;
          rid = rv.op.id; this.opcoes().revisao = rid; this._gravarOpc();
          try { if (global.BimShell) global.BimShell.pintarProps(this.esquemaFerramenta()); } catch (eP) {}
          toast("Revisão " + rv.op.numero + " criada (" + rv.op.data + "). Edite em Anotar › Revisões do projeto.", "ok");
        }
        r = M.opNuvem({ id: novoId(), vista: id, pts: f.pts, revisao: rid }); f.pts = [];
      }
      this._limparPrevia();
      if (!r) return false;
      if (!r.ok) { toast(r.motivo, "aviso"); return false; }
      var ok = this._op(r.op); if (ok) status(d.rotulo + " criada. Continue, ou Esc.");
      return ok;
    },
    _usuario: function () { try { var u = global.Auth && global.Auth._usuario; return (u && (u.nome || u.email)) ? String(u.nome || u.email).slice(0, 60) : ""; } catch (e) { return ""; } },

    /* ----------------------------------------------- prévia (elástico) */
    _previa: function (id, p) {
      var f = this._f, P = P2(), c = P && P._cache[id]; if (!f || !c || !c.svg) return;
      var NS = "http://www.w3.org/2000/svg", g = c.svg.querySelector(".a7-previa");
      if (!g) { g = document.createElementNS(NS, "path"); g.setAttribute("class", "a7-previa"); g.setAttribute("vector-effect", "non-scaling-stroke"); g.setAttribute("fill", "none"); c.svg.appendChild(g); }
      var pts = [], M = A7();
      if (f.def.k === "cota") {
        var I = M.indice(this.estado());
        f.refs.forEach(function (r) { var x = M.resolverRef(I, r, { corte: /^d2c-/.test(id) }); if (x.ok) pts.push([x.p[0], x.p[1]]); });
      } else f.pts.forEach(function (q) { pts.push([q.x, q.y]); });
      if (p) pts.push(p);
      var d = ""; pts.forEach(function (q, i) { d += (i ? "L" : "M") + q[0] + " " + q[1]; });
      g.setAttribute("d", d);
    },
    _limparPrevia: function () {
      var P = P2(); if (!P) return;
      Object.keys(P._cache || {}).forEach(function (k) { var c = P._cache[k], g = c && c.svg ? c.svg.querySelector(".a7-previa") : null; if (g) g.parentNode.removeChild(g); });
    },
    mover2d: function (id, ev, p) {
      if (!this._f || !p) return;
      if (this._f.refs.length || this._f.pts.length) this._previa(id, p);
    },
    _ligarTeclado: function () {
      if (this._tecla || typeof document === "undefined") return;
      var self = this;
      this._tecla = function (ev) {
        var alvo = ev.target, campo = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
        if (campo || !self.ativo()) return;
        if (ev.key === "Escape" && self._f) {
          /* 1º Esc encerra o que está em andamento; o 2º sai da ferramenta */
          if (self._f.refs.length || self._f.pts.length) { self._f.refs = []; self._f.pts = []; self._limparPrevia(); status(self.dica()); ev.stopPropagation(); ev.preventDefault(); return; }
          self.desarmar(); return;
        }
        if (ev.key === "Enter" && self._f) { if (self.concluir()) { ev.stopPropagation(); ev.preventDefault(); } return; }
        if ((ev.key === "Delete" || ev.key === "Backspace") && !self._f && self._sel) {
          var id = self._sel; self.selecionar(null);
          if (self._op({ op: "apagar", id: id })) status("Anotação apagada (Ctrl+Z volta).");
          ev.stopPropagation(); ev.preventDefault();
        }
      };
      document.addEventListener("keydown", this._tecla, true);
    },

    /* ----------------------------------------------- desenho (gancho no js/bim2dui.js) */
    anotarVista: function (d) {
      if (!this.ativo() || !d) return null;
      var M = A7(), st = this.estado(); if (!st || !st.anot2d) return null;
      return M.anotarVista(st, d.id, { nivelY: d.nivel ? num(d.nivel.y, 0) : null, sel: this._sel });
    },
    _redesenhar: function () {
      var P = P2(); if (!P) return;
      Object.keys(P._cache || {}).forEach(function (k) { try { if (P._cache[k] && P._cache[k].el) P.redesenhar(k, false); } catch (e) {} });
    },
    /* depois de cada replay do editor (gancho P7 no js/bim.js) */
    aposRebuild: function (st) {
      if (!this.ativo()) return;
      var self = this;
      if (this._sel && !A7().item(st, this._sel)) this._sel = null;
      clearTimeout(this._tR);
      this._tR = setTimeout(function () {
        self._redesenhar();
        if (self._sel) self._pintarSel();
        self._conferirTravas(st);
      }, 30);
      this._snap = this._fotoPosicoes(st);
    },
    _fotoPosicoes: function (st) {
      var o = {}; arr(st && st.caixas).forEach(function (c) { o[c.id] = c.cx + "," + c.cz + "," + c.rotY; });
      arr(st && st.familias).forEach(function (f) { o[f.id] = f.x + "," + f.z; }); arr(st && st.eixos).forEach(function (e) { o[e.id] = e.x0 + "," + e.z0 + "," + e.x1 + "," + e.z1; });
      return o;
    },
    /* cota travada que deixou de valer: o aviso */
    _conferirTravas: function (st) {
      var M = A7(), vs = M.violacoes(st).filter(function (v) { return v.motivo === "travada"; }), self = this, novos = vs.filter(function (v) { return !self._viol[v.id + "|" + v.valor]; });
      var ag = {}; vs.forEach(function (v) { ag[v.id + "|" + v.valor] = 1; }); this._viol = ag;
      if (!novos.length || !global.UI || !global.UI.modal) return;
      var v = novos[0], ant = this._snapAnt || {}, agora = this._snap || {}, it = M.item(st, v.id), movida = null;
      arr(it && it.refs).forEach(function (r) { if (r.el != null && ant[r.el] != null && ant[r.el] !== agora[r.el]) movida = r.el; });
      var fmt = function (x) { return M.fmtComp(x, { unidade: "m", casas: 3 }); };
      global.UI.modal("Restrição não satisfeita", "<p>A cota travada mede agora <b>" + esc(fmt(v.valor)) + " m</b>, mas está travada em <b>" + esc(fmt(v.travado)) + " m</b>.</p><p>Mover junto leva a peça do outro lado para manter a medida travada. Escolha:</p>", [
        { texto: "Desfazer", classe: "ghost", onClick: function () { global.UI.fecharModal(); try { B().desfazer(); } catch (e) {} } },
        { texto: "Destravar a cota", classe: "ghost", onClick: function () { global.UI.fecharModal(); self._op({ op: "anot2dAjustar", id: v.id, campos: { travada: false } }); } },
        { texto: "Mover junto", classe: "primary", onClick: function () {
          global.UI.fecharModal();
          var r = M.opsManterTrava(self.estado(), v.id, movida);
          if (!r.ok) { toast(r.motivo, "aviso"); return; }
          r.ops.forEach(function (op) { self._op(op); });
        } }
      ]);
    },

    /* ----------------------------------------------- seleção e Propriedades */
    selecionar: function (id, vista) {
      this._sel = id == null ? null : String(id);
      if (vista) this._ultimaVista = vista;
      this._redesenhar();
      if (this._sel) this._pintarSel(); else { try { global.BimShell.pintarProps(null); } catch (e) {} }
    },
    selecionado: function () { return this._sel; },
    _pintarSel: function () { try { var e = this.props(this._sel); if (e && global.BimShell) global.BimShell.pintarProps(e); } catch (e2) {} },
    props: function (id) {
      var self = this, M = A7(), st = this.estado(), it = M.item(st, id); if (!it) return null;
      var secoes = [], aj = function (campos) { return self._op({ op: "anot2dAjustar", id: id, campos: campos }); };
      var excluir = { id: "a7-excluir", rotulo: "Anotação", tipo: "botao", rotuloBotao: "Excluir", fn: function () { self.selecionar(null); self._op({ op: "apagar", id: id }); } };
      var mapa = {};
      if (it.tipo === "cota") {
        var est = M.ESTILO_DA_COTA[it.cota], t = M.tipoCotaDe(st, it), c = it.calc || {};
        secoes.push({ nome: "Tipo", params: [
          { id: "tipoCota", rotulo: "Tipo", tipo: "lista", valor: t.id, opcoes: M.tiposCota(st).filter(function (x) { return x.estilo === est; }).map(function (x) { return { id: x.id, rotulo: x.nome }; }) },
          { id: "a7-editar-tipo", rotulo: "Tipo de cota", tipo: "botao", rotuloBotao: "Editar tipo…", fn: function () { self.editarTipo("cota", t.id, id); } }] });
        var g = [
          { id: "valor", rotulo: "Valor", leitura: true, valor: c.valor != null ? M.textoCota({ cota: it.cota }, t, c.valor, false) : "—" },
          { id: "total", rotulo: "Comprimento total", leitura: true, valor: c.total != null && (it.cota === "linear" || it.cota === "alinhada") ? M.fmtComp(c.total, t) : "—" },
          { id: "contagem", rotulo: "Contagem", leitura: true, valor: arr(it.refs).length },
          { id: "prefixo", rotulo: "Prefixo", tipo: "texto", valor: it.prefixo || "" },
          { id: "sufixo", rotulo: "Sufixo", tipo: "texto", valor: it.sufixo || "" }];
        if (it.cota === "linear" || it.cota === "alinhada") {
          g.push({ id: "travada", rotulo: "Travar", tipo: "sim-nao", valor: !!it.travada });
          if (arr(it.refs).length >= 3) {
            g.push({ id: "eq", rotulo: "Igualdade (EQ)", tipo: "sim-nao", valor: !!it.eq });
            g.push({ id: "a7-igualar", rotulo: "Espaçar igual", tipo: "botao", rotuloBotao: "Igualar as referências", fn: function () { self.igualar(id); } });
          }
          g.push({ id: "off", rotulo: "Deslocamento da linha", unidade: "m", tipo: "numero", passo: 0.05, valor: it.off });
          if (it.cota === "linear") g.push({ id: "orient", rotulo: "Direção", tipo: "lista", valor: it.orient || "h", opcoes: [{ id: "h", rotulo: "Horizontal" }, { id: "v", rotulo: "Vertical" }] });
        }
        g.push(excluir);
        secoes.push({ nome: "Cota", params: g });
        mapa = { prefixo: "texto", sufixo: "texto", travada: "trava", eq: "bool", off: "num", orient: "texto", tipoCota: "texto" };
      } else if (it.tipo === "texto") {
        var tt = M.tipoTextoDe(st, it);
        secoes.push({ nome: "Tipo", params: [
          { id: "tipoTexto", rotulo: "Tipo", tipo: "lista", valor: tt.id, opcoes: M.tiposTexto(st).map(function (x) { return { id: x.id, rotulo: x.nome }; }) },
          { id: "a7-editar-tipo", rotulo: "Tipo de texto", tipo: "botao", rotuloBotao: "Editar tipo…", fn: function () { self.editarTipo("texto", tt.id, id); } }] });
        secoes.push({ nome: "Texto", params: [
          { id: "texto", rotulo: "Texto", tipo: "texto", valor: String(it.texto || "").replace(/\n/g, " / ") },
          { id: "a7-editar-texto", rotulo: "Várias linhas", tipo: "botao", rotuloBotao: "Editar texto…", fn: function () { self._pedirTexto("Editar texto", it.texto, function (tx) { aj({ texto: tx }); }); } },
          { id: "alinhH", rotulo: "Alinhar na horizontal", tipo: "lista", valor: it.alinhH || "Esquerda", opcoes: ["Esquerda", "Centro", "Direita"].map(function (x) { return { id: x, rotulo: x }; }) },
          { id: "rot", rotulo: "Rotação", unidade: "°", tipo: "numero", passo: 15, valor: it.rot || 0 },
          { id: "comLider", rotulo: "Chamada (seta)", leitura: true, valor: !!it.comLider }, excluir] });
        mapa = { tipoTexto: "texto", texto: "textoMulti", alinhH: "texto", rot: "num" };
      } else if (it.tipo === "simbolo") {
        secoes.push({ nome: "Símbolo", params: [
          { id: "simbolo", rotulo: "Símbolo", tipo: "lista", valor: it.simbolo, opcoes: Object.keys(M.SIMBOLOS).map(function (k) { return { id: k, rotulo: M.SIMBOLOS[k].nome }; }) },
          { id: "rot", rotulo: "Rotação", unidade: "°", tipo: "numero", passo: 15, valor: it.rot || 0 }, excluir] });
        mapa = { simbolo: "texto", rot: "num" };
      } else if (it.tipo === "notaChave") {
        secoes.push({ nome: "Nota-chave", params: [{ id: "chave", rotulo: "Chave", tipo: "texto", valor: it.chave }, { id: "texto", rotulo: "Texto", tipo: "texto", valor: it.texto || "" }, excluir] });
        mapa = { chave: "texto", texto: "texto" };
      } else if (it.tipo === "nuvem") {
        var revs = M.revisoes(st), rv = revs.filter(function (r) { return r.id === it.revisao; })[0] || {};
        secoes.push({ nome: "Revisão", params: [
          { id: "revisao", rotulo: "Revisão", tipo: "lista", valor: it.revisao, opcoes: revs.map(function (r) { return { id: r.id, rotulo: r.numero + (r.descricao ? " — " + r.descricao : "") }; }) },
          { id: "rv-data", rotulo: "Data", leitura: true, valor: rv.data || "—" },
          { id: "rv-desc", rotulo: "Descrição", leitura: true, valor: rv.descricao || "—" },
          { id: "rv-por", rotulo: "Emitido por", leitura: true, valor: rv.emitidoPor || "—" },
          { id: "a7-revisoes", rotulo: "Revisões", tipo: "botao", rotuloBotao: "Revisões do projeto…", fn: function () { self.dialogoRevisoes(); } }, excluir] });
        mapa = { revisao: "texto" };
      } else if (it.tipo === "linha") {
        secoes.push({ nome: "Linha de detalhe", params: [{ id: "estilo", rotulo: "Estilo de linha", tipo: "lista", valor: it.estilo, opcoes: Object.keys(M.ESTILOS_LINHA).filter(function (k) { return !M.ESTILOS_LINHA[k].invisivel; }).map(function (k) { return { id: k, rotulo: k }; }) }, excluir] });
        mapa = { estilo: "texto" };
      } else if (it.tipo === "regiao") {
        var pr = [];
        if (!it.mascara) pr.push({ id: "padrao", rotulo: "Padrão de preenchimento", tipo: "lista", valor: it.padrao, opcoes: Object.keys(M.PADROES).map(function (k) { return { id: k, rotulo: k }; }) });
        else pr.push({ id: "masc", rotulo: "Mascaramento", leitura: true, valor: "esconde o modelo por baixo" });
        pr.push({ id: "estilo", rotulo: "Estilo da borda", tipo: "lista", valor: it.estilo, opcoes: Object.keys(M.ESTILOS_LINHA).map(function (k) { return { id: k, rotulo: k }; }) });
        pr.push(excluir);
        secoes.push({ nome: it.mascara ? "Região de mascaramento" : "Região preenchida", params: pr });
        mapa = { padrao: "texto", estilo: "texto" };
      } else if (it.tipo === "componente") {
        secoes.push({ nome: "Componente de detalhe", params: [
          { id: "comp", rotulo: "Componente", tipo: "lista", valor: it.comp, opcoes: Object.keys(M.COMPONENTES).map(function (k) { return { id: k, rotulo: M.COMPONENTES[k].nome }; }) },
          { id: "larg", rotulo: "Largura", unidade: "m", tipo: "numero", passo: 0.01, valor: it.larg },
          { id: "alt", rotulo: "Altura", unidade: "m", tipo: "numero", passo: 0.01, valor: it.alt },
          { id: "rot", rotulo: "Rotação", unidade: "°", tipo: "numero", passo: 15, valor: it.rot || 0 }, excluir] });
        mapa = { comp: "texto", larg: "num", alt: "num", rot: "num" };
      } else if (it.tipo === "legenda") {
        secoes.push({ nome: "Legenda", params: [{ id: "titulo", rotulo: "Título", tipo: "texto", valor: it.titulo || "LEGENDA" }, excluir] });
        mapa = { titulo: "texto" };
      }
      return { daVista: false, semEditarTipo: true, titulo: ROTULO_TIPO[it.tipo] || "Anotação", icone: it.tipo === "cota" ? "regua" : it.tipo === "nuvem" ? "nuvem" : "editar", secoes: secoes,
        onMudar: function (pid, valor) {
          var k = mapa[pid]; if (!k) return null;
          if (k === "trava") { var r = M.opTravar(self.estado(), id, !!valor); if (!r.ok) toast(r.motivo, "aviso"); else self._op(r.op); return null; }
          var campos = {};
          campos[pid] = k === "num" ? num(valor, 0) : k === "bool" ? !!valor : k === "textoMulti" ? String(valor).replace(/\s+\/\s+/g, "\n") : String(valor);
          aj(campos);
          return null;
        } };
    },
    igualar: function (id) {
      var r = A7().opsIgualar(this.estado(), id), self = this;
      if (!r.ok) { toast(r.motivo, "aviso"); return false; }
      if (!r.ops.length) { status("As referências já estão igualmente espaçadas."); return true; }
      r.ops.forEach(function (op) { self._op(op); });
      this._op({ op: "anot2dAjustar", id: id, campos: { eq: true } });
      status("EQ: " + r.ops.length + " peça(s) movida(s) para espaçamento igual (Ctrl+Z volta).");
      return true;
    },

    /* ----------------------------------------------- diálogos */
    _pedirTexto: function (titulo, inicial, fn) {
      if (!global.UI || !global.UI.modal) { var t = global.prompt ? global.prompt(titulo, inicial || "") : null; if (t) fn(t); return; }
      global.UI.modal(titulo, '<textarea id="a7-texto" rows="4" style="width:100%" placeholder="Uma linha por linha do texto">' + esc(inicial || "") + "</textarea>", [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Colocar", classe: "primary", onClick: function () { var v = (document.getElementById("a7-texto") || {}).value || ""; global.UI.fecharModal(); if (v.trim()) fn(v.replace(/\s+$/, "")); } }
      ]);
      setTimeout(function () { var i = document.getElementById("a7-texto"); if (i) i.focus(); }, 30);
    },
    _pedirNota: function (fn) {
      global.UI.modal("Nota-chave", '<label>Chave<br><input id="a7-chave" type="text" placeholder="ex.: 02.01" style="width:100%"></label><br><label>Texto<br><input id="a7-chave-tx" type="text" placeholder="ex.: Bloco cerâmico 14×19" style="width:100%"></label>', [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Colocar", classe: "primary", onClick: function () { var c = (document.getElementById("a7-chave") || {}).value || "", t = (document.getElementById("a7-chave-tx") || {}).value || ""; global.UI.fecharModal(); if (c.trim()) fn(c.trim(), t.trim()); } }
      ]);
    },
    /* Editar tipo: tipo da RA → nasce um tipo do PROJETO (cópia); tipo do projeto → muda para todas as instâncias */
    editarTipo: function (cat, tipoId, itemId) {
      var self = this, M = A7(), st = this.estado(), lista = cat === "cota" ? M.tiposCota(st) : M.tiposTexto(st), t = lista.filter(function (x) { return x.id === tipoId; })[0];
      if (!t || !global.UI) return false;
      var defs = cat === "cota" ? M.PARAMS_TIPO_COTA : M.PARAMS_TIPO_TEXTO, novo = !!t.ra;
      var h = '<p class="fraco">' + (novo ? "O tipo da RA não muda: gravar cria um tipo do projeto com estes valores." : "Muda todas as " + (cat === "cota" ? "cotas" : "notas") + " deste tipo.") + '</p><table class="tbl"><tbody>' +
        '<tr><td>Nome do tipo</td><td><input data-a7t="nome" type="text" value="' + esc(novo ? t.nome + " (projeto)" : t.nome) + '"></td></tr>' +
        defs.map(function (p) {
          var v = t[p.campo], campo;
          if (p.dado === "simnao") campo = '<input data-a7t="' + p.campo + '" type="checkbox"' + (v ? " checked" : "") + ">";
          else if (p.opcoes) campo = '<select data-a7t="' + p.campo + '">' + p.opcoes.map(function (o) { return '<option value="' + esc(o) + '"' + (String(v) === o ? " selected" : "") + ">" + esc((M.MARCAS[o] || M.SETAS[o] || o)) + "</option>"; }).join("") + "</select>";
          else campo = '<input data-a7t="' + p.campo + '" type="' + (p.dado === "numero" || p.dado === "pena" ? "number" : "text") + '" step="any" value="' + esc(v == null ? "" : v) + '">';
          return "<tr><td>" + esc(p.nome) + (p.un ? " (" + p.un + ")" : "") + "</td><td>" + campo + "</td></tr>";
        }).join("") + "</tbody></table>";
      global.UI.modal("Editar tipo — " + t.nome, h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Gravar tipo", classe: "primary", onClick: function () {
          var vals = {}, nome = t.nome;
          Array.prototype.forEach.call(document.querySelectorAll("[data-a7t]"), function (el) {
            var k = el.getAttribute("data-a7t"); if (k === "nome") { nome = el.value; return; }
            var p = defs.filter(function (x) { return x.campo === k; })[0] || {};
            vals[k] = el.type === "checkbox" ? el.checked : (p.dado === "numero" || p.dado === "pena") ? num(el.value, t[k]) : el.value;
          });
          global.UI.fecharModal();
          var nid = novo ? "tp" + Date.now().toString(36) : t.id;
          if (self._op({ op: "anot2dTipo", id: nid, cat: cat, nome: nome || t.nome, base: t.id, valores: vals }) && novo && itemId) {
            var c = {}; c[cat === "cota" ? "tipoCota" : "tipoTexto"] = nid; self._op({ op: "anot2dAjustar", id: itemId, campos: c });
          }
        } }
      ]);
      return true;
    },
    dialogoTipos: function () {
      var self = this, M = A7(), st = this.estado(); if (!M || !global.UI) return false;
      var linhas = M.tiposCota(st).map(function (t) { return { cat: "cota", t: t }; }).concat(M.tiposTexto(st).map(function (t) { return { cat: "texto", t: t }; }));
      var h = '<table class="tbl"><thead><tr><th>Categoria</th><th>Tipo</th><th>Texto</th><th>Origem</th><th></th></tr></thead><tbody>' + linhas.map(function (l, i) {
        return "<tr><td>" + (l.cat === "cota" ? "Cota (" + esc(l.t.estilo) + ")" : "Texto") + "</td><td>" + esc(l.t.nome) + "</td><td>" + esc(String(l.t.texto).replace(".", ",")) + " mm</td><td>" + (l.t.ra ? "RA" : "Projeto") +
          '</td><td><button class="btn sm" data-a7-tipo="' + i + '">Editar…</button></td></tr>';
      }).join("") + "</tbody></table>";
      global.UI.modal("Tipos de cota e de texto", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }]);
      Array.prototype.forEach.call(document.querySelectorAll("[data-a7-tipo]"), function (b) {
        b.onclick = function () { var l = linhas[+b.getAttribute("data-a7-tipo")]; global.UI.fecharModal(); self.editarTipo(l.cat, l.t.id, null); };
      });
      return true;
    },
    dialogoRevisoes: function () {
      var self = this, M = A7(), st = this.estado(); if (!M || !global.UI) return false;
      var revs = M.revisoes(st);
      function linha(r, nova) {
        return '<tr data-a7-rv="' + esc(r.id) + '"' + (nova ? ' data-nova="1"' : "") + '><td><input type="text" data-c="numero" value="' + esc(r.numero) + '" style="width:5em"></td><td><input type="text" data-c="data" value="' + esc(r.data) + '" style="width:7em"></td>' +
          '<td><input type="text" data-c="descricao" value="' + esc(r.descricao) + '"></td><td><input type="text" data-c="emitidoPor" value="' + esc(r.emitidoPor) + '"></td><td>' + (r.nuvens || 0) + "</td>" +
          '<td>' + (nova || r.nuvens ? "" : '<button class="btn sm ghost" data-a7-rv-apagar="' + esc(r.id) + '">Apagar</button>') + "</td></tr>";
      }
      var h = '<p class="fraco">A revisão vai para o carimbo das pranchas; a nuvem de revisão marca o que mudou. Revisão com nuvem não se apaga (o histórico da prancha não pode perder o que mudou).</p>' +
        '<table class="tbl"><thead><tr><th>Número</th><th>Data</th><th>Descrição</th><th>Emitido por</th><th>Nuvens</th><th></th></tr></thead><tbody id="a7-rv-corpo">' + revs.map(function (r) { return linha(r, false); }).join("") + "</tbody></table>";
      global.UI.modal("Revisões do projeto", h, [
        { texto: "Nova revisão", classe: "ghost", onClick: function () {
          var corpo = document.getElementById("a7-rv-corpo"); if (!corpo) return;
          var n = corpo.querySelectorAll("tr").length, numA = M.proximoNumero(st);
          if (n > revs.length) { var mx = parseInt(numA.replace(/\D+/g, ""), 10) + (n - revs.length); numA = "R" + (mx < 10 ? "0" : "") + mx; }
          corpo.insertAdjacentHTML("beforeend", linha({ id: "rv" + Date.now().toString(36) + n, numero: numA, data: hoje(), descricao: "", emitidoPor: self._usuario(), nuvens: 0 }, true));
        } },
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Gravar", classe: "primary", onClick: function () {
          var ops = [];
          Array.prototype.forEach.call(document.querySelectorAll("[data-a7-rv]"), function (tr) {
            var o = { id: tr.getAttribute("data-a7-rv") }, ant = revs.filter(function (r) { return r.id === o.id; })[0];
            Array.prototype.forEach.call(tr.querySelectorAll("[data-c]"), function (i) { o[i.getAttribute("data-c")] = i.value.trim(); });
            if (ant && ["numero", "data", "descricao", "emitidoPor"].every(function (k) { return String(ant[k] || "") === String(o[k] || ""); })) return;
            var r = M.opRevisao(o); if (r.ok) ops.push(r.op);
          });
          global.UI.fecharModal();
          ops.forEach(function (op) { self._op(op); });
          if (ops.length) status(ops.length + " revisão(ões) gravada(s).");
        } }
      ]);
      Array.prototype.forEach.call(document.querySelectorAll("[data-a7-rv-apagar]"), function (b) {
        b.onclick = function () { var id = b.getAttribute("data-a7-rv-apagar"); if (self._op({ op: "apagar", id: id })) { var tr = b.closest("tr"); if (tr) tr.parentNode.removeChild(tr); } };
      });
      return true;
    }
  };
  /* a foto de ANTES de cada replay (para saber que peça andou quando a trava estoura) */
  var _apos = BimAnot2DUI.aposRebuild;
  BimAnot2DUI.aposRebuild = function (st) { this._snapAnt = this._snap; return _apos.call(this, st); };

  global.BimAnot2DUI = BimAnot2DUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAnot2DUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

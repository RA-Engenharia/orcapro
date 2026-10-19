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
    /* COTAS (js/bimcotasui.js, 13/10/2026): a cota por coordenada (ordenada a partir de uma origem) */
    "cota-coordenada": { k: "cota", cota: "coordenada", rotulo: "Cota por coordenada" },
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
      /* COTAS (13/10/2026): o grupo chama "Cotas" e a Cota, a Cota de nível e a Inclinação valem também no
         3D (js/bimcotasui.js troca para o 3D quando a vista ativa é o 3D); Cotar seleção, Cotar a vista,
         Furação e Arredondamento entram neste mesmo painel pelo js/bimcotasui.js */
      R.acrescentar("anotar", "Anotar", "Cotas", [
        C("p7-cota-alinhada", "Cota", "regua", "Cota: clique perto da FACE, do EIXO, da PONTA, do MEIO ou do centro de FURO de uma peça, depois da outra — mais referências fazem cadeia — e clique no vazio para posicionar a linha. O valor aparece antes do clique; Tab alterna face/eixo. A cota fica presa às peças: anda, troca de perfil e muda de nível junto. No 3D, na planta e no corte.", true),
        C("p7-cota-linear", "Cota\nlinear", "regua", "Cota linear horizontal ou vertical (Propriedades da ferramenta): mede só na direção X ou Y da vista, entre referências."),
        C("cota-coordenada", "Coordenada", "grade", "Cota por coordenada: clique a ORIGEM e depois cada ponto; Enter termina. Cada ponto mostra a distância até a origem (furação, locação de pilares, inserts). No 3D, na planta e no corte."),
        C("p7-cota-angular", "Angular", "angulo", "Cota angular: clique duas linhas (faces de parede, eixos, linhas de detalhe) e onde passa o arco."),
        C("p7-cota-radial", "Radial", "alvo", "Cota radial: clique no contorno de um pilar circular ou de um círculo/arco de detalhe e onde vai o texto."),
        C("p7-cota-diametro", "Diâmetro", "alvo", "Cota de diâmetro: clique no contorno de um pilar circular ou de um círculo de detalhe."),
        C("p7-cota-arco", "Comprimento\ndo arco", "ciclo", "Comprimento do arco: clique num arco de detalhe e onde passa a linha de cota."),
        C("p7-cota-elevacao", "Cota de\nnível", "niveis", "Cota de nível: clique no topo da peça — TOS no aço, TOL na laje e no piso (o prefixo sai sozinho) — ou no nível da vista; no corte, a altura do ponto. Acompanha a peça quando ela muda de nível. No 3D, na planta e no corte."),
        C("p7-cota-inclinacao", "Inclinação", "telhado", "Inclinação em % e em graus: na planta, clique numa água da cobertura; no corte e no 3D, clique dois pontos (as pontas da terça, da diagonal, do tubo)."),
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
      /* COTAS (14/10/2026): a camada da seleção se refaz (as alças da peça selecionada saem de cima das referências) */
      try { if (global.BimSelecao && global.BimSelecao.mudou) global.BimSelecao.mudou(); } catch (eS) {}
    },
    dica: function () {
      var f = this._f; if (!f) return "";
      var d = f.def;
      if (d.k === "cota") {
        if (d.cota === "linear" || d.cota === "alinhada") return f.refs.length < 2 ? d.rotulo + ": clique a " + (f.refs.length ? "próxima" : "1ª") + " referência (face, eixo, ponta, meio ou furo da peça; Tab alterna face/eixo). Esc sai." : d.rotulo + ": mais uma referência faz cadeia; clique no VAZIO (longe de peça e de eixo) para posicionar a linha — Enter põe a linha por fora do desenho.";
        if (d.cota === "coordenada") return f.refs.length ? "Cota por coordenada: clique o próximo ponto; Enter (ou clique no vazio) termina. Tab alterna face/eixo. Esc sai." : "Cota por coordenada: clique a ORIGEM. Esc sai.";
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
        if (d.cota === "linear" || d.cota === "coordenada") params.push(lista("orient", "Direção", o.orient, [{ id: "auto", rotulo: "Automática" }, { id: "h", rotulo: "Horizontal" }, { id: "v", rotulo: "Vertical" }]));
        /* COTAS: encaixe (Tab) e arredondamento — os mesmos do 3D (js/bimcotasui.js) */
        var U = global.BimCotasUI;
        if (U && U.paramsFerramenta) params = params.concat(U.paramsFerramenta());
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
               onMudar: function (pid, valor) {
                 if (/^bct-/.test(pid) && global.BimCotasUI) { global.BimCotasUI.mudarCfg(pid, valor); return self.esquemaFerramenta(); }
                 self.opcoes()[pid] = valor; self._gravarOpc(); return self.esquemaFerramenta();
               } };
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
        /* COTAS: na cota JÁ selecionada, arrastar o texto move o texto e arrastar a linha muda o deslocamento */
        if (alvo && this._sel != null && alvo.getAttribute("data-a7") === String(this._sel) && p && this._arrastoInicio(id, ev, p)) return true;
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
        /* COTAS: o arredondamento do padrão (mm na metálica), a inclinação também em graus e o TOS/TOL */
        var U = global.BimCotasUI; if (U && U.ajustarCota2d) U.ajustarCota2d(base, st, id);
        var r = M.opCota(base); if (!r.ok) { toast(r.motivo, "aviso"); return false; }
        /* o tipo escolhido precisa ser do estilo certo; se não for, fica o padrão */
        if (r.op.tipoCota && !M.tiposCota(st).some(function (t) { return t.id === r.op.tipoCota && t.estilo === M.ESTILO_DA_COTA[k]; })) delete r.op.tipoCota;
        f.refs = []; self._limparPrevia();
        var ok = self._op(r.op);
        if (ok) status(d.rotulo + " criada. Clique a próxima ou Esc.");
        return ok;
      }
      var oVista = { corte: corte, vista: id };
      if (k === "linear" || k === "alinhada" || k === "coordenada") {
        var h = this._acharCota(st, p, tol, id, corte, null);
        if (h && !f.refs.some(function (r) { return BimAnot2DUI._mesmaRef(r, h.ref); })) { f.refs.push(h.ref); status(this.dica() + " (" + h.rotulo + ")"); this._previa(id, p); return true; }
        if (f.refs.length < 2) { f.refs.push({ x: q.x, y: q.y }); this._previa(id, p); status(this.dica()); return true; }
        var orient = k !== "alinhada" ? (o.orient === "h" || o.orient === "v" ? o.orient : this._orientAuto(st, f.refs, p, corte)) : undefined;
        var prov = { tipo: "cota", cota: k, refs: f.refs, orient: orient, off: 0, vista: id };
        return criar({ orient: orient, off: M.offsetPara(st, prov, p, oVista) }) || true;
      }
      if (k === "angular") {
        if (f.refs.length < 2) {
          /* COTAS (14/10/2026): no corte (e na planta, longe de face/eixo) a linha é a ARESTA desenhada —
             a crista da rampa, o piso, o banzo da tesoura; presa à peça quando é do editor */
          var ha = M.acharRef(st, p, tol, "linha", id);
          if (!ha || ha.ref.r === "centro") ha = this._acharLinhaDesenho(st, p, tol, id);
          if (!ha) { toast("Clique perto de uma linha (face ou aresta de peça, eixo, linha de detalhe).", "aviso"); return true; }
          f.refs.push(ha.ref); status(this.dica() + " (" + (ha.rotulo || "linha") + ")"); return true;
        }
        var pa = { tipo: "cota", cota: k, refs: f.refs, off: 1 };
        return criar({ off: M.offsetPara(st, pa, p, {}) }) || true;
      }
      if (k === "radial" || k === "diametro" || k === "arco") {
        if (!f.refs.length) {
          var hc = M.acharRef(st, p, tol, "circulo", id);
          if (!hc) { toast(corte ? "No corte o círculo é o de detalhe: desenhe um círculo/arco (Linha de detalhe) ou cote o pilar circular na planta." : "Clique no contorno de um pilar circular, de uma parede curva ou de um círculo/arco de detalhe.", "aviso"); return true; }
          f.refs.push(hc.ref); status(this.dica()); return true;
        }
        var m0 = M.medirCota(st, { tipo: "cota", cota: k, refs: f.refs }, oVista);
        var ang = m0.ok ? Math.atan2(p[1] - m0.geo.c[1], p[0] - m0.geo.c[0]) : 0;
        var off = m0.ok ? Math.sqrt(Math.pow(p[0] - m0.geo.c[0], 2) + Math.pow(p[1] - m0.geo.c[1], 2)) - m0.geo.r : 0.3;
        return criar({ ang: ang, off: off }) || true;
      }
      if (k === "elevacao") {
        if (!f.refs.length) {
          /* COTAS: o topo do aço (TOS) e as pontas das peças entram pelo encaixe novo; senão, o de antes */
          /* no corte a altura é a do próprio ponto: vale qualquer encaixe (topo da laje, peitoril, degrau) */
          var hx = this._acharCota(st, p, tol, id, corte, corte ? null : "topo");
          var he = hx && hx.ref.r === "p3" ? hx : (corte ? (hx || { ref: { x: q.x, y: q.y } }) : M.acharRef(st, p, tol, "topo", id, null, { yMax: this._optDesenho(id).yCorte }));
          if (he.ref.r === "nivel") he.ref.yRef = this._nivelY(id) || 0;
          f.refs.push(he.ref); status(this.dica()); return true;
        }
        return criar({ lx: p[0], ly: p[1] }) || true;
      }
      if (k === "inclinacao") {
        if (!corte) {
          var hp = M.acharRef(st, p, tol, "plano", id);
          if (!hp) {
            /* COTAS: fora de uma água da cobertura, a inclinação entre DOIS pontos de peça (terça, tubo) */
            var h2 = this._acharCota(st, p, tol, id, false, null);
            if (h2 && h2.ref.r === "p3") { f.refs.push(h2.ref); if (f.refs.length >= 2) return criar({}) || true; status("Inclinação: clique o 2º ponto."); return true; }
            toast("Clique dentro de uma água da cobertura (ou em dois pontos de uma peça).", "aviso"); return true;
          }
          f.refs = [hp.ref]; return criar({}) || true;
        }
        var hc2 = this._acharCota(st, p, tol, id, true, null);
        f.refs.push(hc2 ? hc2.ref : { x: q.x, y: q.y });
        if (f.refs.length >= 2) return criar({}) || true;
        return true;
      }
      return true;
    },
    /* a MESMA referência (clicar duas vezes no mesmo lugar não faz cadeia): a mesma peça e a mesma parte; o
       ponto da face (loc, do desenho) só é o mesmo se for o mesmo ponto — antes dois cantos da mesma laje
       contavam como um, e o 3º clique virava "posicionar a linha" (14/10/2026) */
    _mesmaRef: function (a, b) {
      if (!a || !b || a.el == null || a.el !== b.el || a.r !== b.r || a.k !== b.k || a.i !== b.i || a.el2 !== b.el2) return false;
      function q(v) { return Math.round(num(v, 0) * 1e5); }
      if (a.k === "loc") return q(a.u) === q(b.u) && q(a.v) === q(b.v) && q(a.w) === q(b.w);
      if (a.k === "aresta") return JSON.stringify([a.a, a.b]) === JSON.stringify([b.a, b.b]);
      return true;
    },
    _orientAuto: function (st, refs, p, corte) {
      var M = A7(), I = M.indice(st), vo = { corte: corte, vista: this._f && this._f.vista }, a = M.resolverRef(I, refs[0], vo), b = M.resolverRef(I, refs[refs.length - 1], vo);
      if (!a.ok || !b.ok) return "h";
      return Math.abs(b.p[0] - a.p[0]) >= Math.abs(b.p[1] - a.p[1]) ? "h" : "v";
    },
    /* COTAS (js/bimcotas.js): o encaixe da cota na vista — as faces, eixos e pontas da P7 e os pontos
       NOTÁVEIS das peças (ponta, meio, centro de furo, cruzamento de eixos, topo do aço) projetados na
       planta ou no corte; ponto ganha de linha numa janela de 30 % da tolerância. Tab alterna face/eixo. */
    _acharCota: function (st, p, tol, id, corte, filtro) {
      /* TAB (18/10/2026): com o cursor parado, o Tab percorre os candidatos sob ele — vale o escolhido */
      var tb = this._tabC; if (tb && tb.id === id && p && Math.abs(p[0] - tb.p[0]) + Math.abs(p[1] - tb.p[1]) <= tb.raio) return tb.lista[tb.i];
      return this._acharCota0(st, p, tol, id, corte, filtro);
    },
    /* todos os candidatos sob o cursor (o 1º é o que o clique pegaria), sem repetir a mesma referência */
    _listaCota: function (st, p, tol, id, corte, filtro) {
      var M = A7(), BCm = global.BimCotas, out = [], vistos = {};
      function add(o) { if (!o || !o.ref) return; var k = JSON.stringify(o.ref); if (vistos[k]) return; vistos[k] = 1; out.push(o); }
      add(this._acharCota0(st, p, tol, id, corte, filtro));
      var U = global.BimCotasUI, pref = U && U.cfg ? U.cfg().pref : "auto";
      var h = corte || filtro === "topo" ? null : M.acharRef(st, p, tol, filtro, id, pref);
      var ch = this._candCache, extra = [];
      if (BCm && ch && ch.pts) ch.pts.forEach(function (q) { var m = BCm.maisPerto([q], p, tol); if (m) extra.push(m); });
      var dz = filtro === "topo" || !BCm ? null : this._encaixeDesenho(st, p, tol, id, M.projDe ? M.projDe(id) : { tipo: "planta" }, false);
      if (dz) extra.push(dz); if (h) extra.push(h);
      extra.sort(function (a, b) { return ((a.cl != null ? a.cl : 3) - (b.cl != null ? b.cl : 3)) || (a.dist - b.dist); });
      extra.forEach(add);
      return out;
    },
    _acharCota0: function (st, p, tol, id, corte, filtro) {
      var M = A7(), BCm = global.BimCotas, U = global.BimCotasUI, pref = U && U.cfg ? U.cfg().pref : "auto";
      var h = corte || filtro === "topo" ? null : M.acharRef(st, p, tol, filtro, id, pref);
      if (!BCm) return h;
      var proj = M.projDe ? M.projDe(id) : (corte ? null : { tipo: "planta" }); if (!proj) return h;
      var ch = this._candCache, modo = pref === "face" ? "face" : "auto";
      if (!ch || ch.st !== st || ch.id !== id || ch.modo !== modo) ch = this._candCache = { st: st, id: id, modo: modo, pts: BCm.candidatosVista(st, proj, { modo: modo, yEixo: 0, yCorte: corte ? null : this._optDesenho(id).yCorte }) };
      var pts = ch.pts;
      if (filtro === "topo") pts = pts.filter(function (q) { return q.ref && q.ref.k === "topo"; });
      var c = BCm.maisPerto(pts, p, tol);
      /* COTAS (14/10/2026): o DESENHO da vista também é referência — o canto e a aresta do que está
         cortado ou visto (topo da parede e da laje, degrau, crista da rampa, aba do perfil). Na planta,
         a cota de nível fica com o topo das peças (o canto do desenho não diz a altura). */
      var dz = filtro === "topo" || pref === "eixo" ? null : this._encaixeDesenho(st, p, tol, id, proj, false);
      /* PONTO (canto, ombreira, topo) ganha de LINHA (aresta desenhada, eixo no corte); na mesma classe, o mais
         perto. Na planta a aresta do desenho não entra quando a face da P7 já pegou (ela tem direção). */
      var CL = BCm.CLASSE || {}, cs = [];
      if (c) cs.push({ o: c, cl: c.cl != null ? c.cl : (CL[c.tipo] != null ? CL[c.tipo] : 5) });
      if (dz && (dz.tipo === "fim" || !h)) cs.push({ o: dz, cl: dz.tipo === "fim" ? 0 : 3 });
      cs.sort(function (a, b) { return (a.cl - b.cl) || (a.o.dist - b.o.dist); });
      var b0 = cs.length ? cs[0].o : null;
      if (!b0) return h;
      if (h && !(b0.dist <= h.dist + 0.3 * tol)) return h;
      return { ref: b0.ref, dist: b0.dist, rotulo: b0.rotulo, p: b0.p, tipo: b0.tipo };
    },
    /* os candidatos do desenho da vista (cache por desenho: refeito a cada extração) */
    _candDesenho: function (id) {
      var P = P2(), c = P && P._cache ? P._cache[id] : null, BCm = global.BimCotas; if (!c || !c.dados || !BCm || !BCm.candidatosDesenho) return null;
      if (!this._desCache || this._desCache.dados !== c.dados) this._desCache = { dados: c.dados, cand: BCm.candidatosDesenho(c.dados) };
      return this._desCache.cand;
    },
    _optDesenho: function (id) { var P = P2(), d = P && P.def ? P.def(id) : null; return { yCorte: d && d.nivel ? num(d.nivel.y, 0) + num(d.altura, 1.2) : 0 }; },
    _encaixeDesenho: function (st, p, tol, id, proj, soCantos) {
      var BCm = global.BimCotas, cand = this._candDesenho(id); if (!cand || !BCm.encaixeDesenho) return null;
      var o = this._optDesenho(id); o.soCantos = !!soCantos;
      return BCm.encaixeDesenho(st, cand, p, tol, proj, o);
    },
    /* a LINHA do desenho (cota angular no corte, e na planta quando não há face da P7 perto) */
    _acharLinhaDesenho: function (st, p, tol, id) {
      var M = A7(), BCm = global.BimCotas, cand = this._candDesenho(id); if (!cand || !BCm || !BCm.linhaDesenho) return null;
      var proj = M.projDe ? M.projDe(id) : null; if (!proj) return null;
      return BCm.linhaDesenho(st, cand, p, tol, proj, this._optDesenho(id));
    },
    /* Enter: fecha o contorno, termina a linha ou posiciona a cota no lugar padrão */
    concluir: function () {
      var f = this._f, M = A7(); if (!f || !M || !f.vista) return false;
      var d = f.def, o = this.opcoes(), id = f.vista, r = null;
      if (d.k === "cota" && (d.cota === "linear" || d.cota === "alinhada" || d.cota === "coordenada") && f.refs.length >= 2) {
        var orient = d.cota !== "alinhada" ? (o.orient === "h" || o.orient === "v" ? o.orient : this._orientAuto(this.estado(), f.refs, null, /^d2c-/.test(id))) : undefined;
        var b0 = { id: novoId(), vista: id, cota: d.cota, refs: f.refs, off: this._offFora(f.refs, d.cota, orient, id), orient: orient, tipoCota: o.tipoCota || undefined };
        var Uc = global.BimCotasUI; if (Uc && Uc.ajustarCota2d) Uc.ajustarCota2d(b0, this.estado(), id);
        r = M.opCota(b0);
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
    /* Enter = a posição PADRÃO da linha: por FORA do desenho (do lado contrário ao centro da vista) e além de
       todas as referências — antes ia 0,60 para um lado fixo e a acumulada da fachada atravessava a sala
       (14/10/2026) */
    _offFora: function (refs, cota, orient, id) {
      var M = A7(), st = this.estado(), P = P2(), c = P && P._cache ? P._cache[id] : null, vb = c && (c.vbTotal || c.vb);
      try {
        var m = M.medirCota(st, { tipo: "cota", cota: cota, refs: refs, orient: orient, off: 0, vista: id }, { corte: /^d2c-/.test(id), vista: id });
        if (!m.ok || !m.geo || !m.geo.t || !vb) return 0.6;
        var tt = m.geo.t, l0 = m.geo.lineT, vs = m.geo.pts.map(function (q) { return q[0] * tt[0] + q[1] * tt[1]; });
        var cen = (vb.x + vb.w / 2) * tt[0] + (vb.y + vb.h / 2) * tt[1];
        var lado = cen > l0 ? -1 : 1, ext = lado > 0 ? Math.max.apply(null, vs) : Math.min.apply(null, vs);
        return Math.round((ext - l0 + lado * 0.6) * 1e4) / 1e4;
      } catch (e) { return 0.6; }
    },
    _usuario: function () { try { var u = global.Auth && global.Auth._usuario; return (u && (u.nome || u.email)) ? String(u.nome || u.email).slice(0, 60) : ""; } catch (e) { return ""; } },

    /* ----------------------------------------------- prévia (elástico) */
    _previa: function (id, p) {
      var f = this._f, P = P2(), c = P && P._cache[id]; if (!f || !c || !c.svg) return;
      var NS = "http://www.w3.org/2000/svg", g = c.svg.querySelector(".a7-previa");
      if (!g) { g = document.createElementNS(NS, "path"); g.setAttribute("class", "a7-previa"); g.setAttribute("vector-effect", "non-scaling-stroke"); g.setAttribute("fill", "none"); c.svg.appendChild(g); }
      var pts = [], M = A7(), st = this.estado(), corte = /^d2c-/.test(id), hS = null, pS = p;
      if (f.def.k === "cota") {
        var I = M.indice(st), vo = { corte: corte, vista: id };
        f.refs.forEach(function (r) { var x = M.resolverRef(I, r, vo); if (x.ok) pts.push([x.p[0], x.p[1]]); });
        /* COTAS: a prévia ELÁSTICA vai até o ponto ENCAIXADO (não o cursor cru) e mostra o valor antes do clique */
        if (p && (f.def.cota === "linear" || f.def.cota === "alinhada" || f.def.cota === "coordenada" || f.def.cota === "elevacao" || f.def.cota === "inclinacao")) {
          hS = this._acharCota(st, p, this._tol(id), id, corte, f.def.cota === "elevacao" && !corte ? "topo" : null);
          if (hS) { var xs = M.resolverRef(I, hS.ref, vo); if (xs.ok) pS = [xs.p[0], xs.p[1]]; }
        }
      } else f.pts.forEach(function (q) { pts.push([q.x, q.y]); });
      if (pS) pts.push(pS);
      var d = ""; pts.forEach(function (q, i) { d += (i ? "L" : "M") + q[0] + " " + q[1]; });
      g.setAttribute("d", d);
      var tx = c.svg.querySelector(".a7-previa-tx"), mk = c.svg.querySelector(".a7-previa-snap");
      if (f.def.k !== "cota" || !pS) { if (tx) tx.parentNode.removeChild(tx); if (mk) mk.parentNode.removeChild(mk); return; }
      var U = global.BimCotasUI, val = U && U.textoPrevia2d ? U.textoPrevia2d(st, id, f, hS ? hS.ref : { x: pS[0], y: pS[1] }) : "";
      var px = this._tol(id, 1);
      /* PRECISÃO (18/10/2026, pedido do Rogério: "tem uma coisa na frente e não dá para cotar"): o encaixe é um
         SÍMBOLO pequeno (9 px, só contorno) NO ponto — quadrado = extremidade/canto, triângulo = meio, X = interseção,
         ⊥ = perpendicular, círculo = centro, losango = mais próximo/face/eixo. O texto em unidade de desenho (que saía
         grande e com as letras espaçadas por cima do ponto) saiu: o nome e o valor vão numa dica pequena fora do ponto. */
      if (tx) tx.parentNode.removeChild(tx);
      var tipoM = hS ? BimAnot2DUI.formaEncaixe(hS) : null;
      if (!tipoM) { if (mk) mk.parentNode.removeChild(mk); }
      else {
        if (!mk || mk.tagName.toLowerCase() !== "path") { if (mk) mk.parentNode.removeChild(mk); mk = document.createElementNS(NS, "path"); mk.setAttribute("class", "a7-previa-snap"); mk.setAttribute("vector-effect", "non-scaling-stroke"); c.svg.appendChild(mk); }
        mk.setAttribute("d", BimAnot2DUI.caminhoEncaixe(tipoM, pS[0], pS[1], 4.5 * px)); mk.setAttribute("data-tipo", tipoM); mk.setAttribute("data-rotulo", hS.rotulo || "");
      }
      this._dica(val, hS ? (hS.rotulo || "") : "");
    },
    /* a forma do marcador pelo tipo de encaixe (e pela referência, quando o tipo não vem) */
    formaEncaixe: function (h) {
      var t = h && h.tipo, r = h && h.ref ? h.ref.r : null;
      if (t === "intersecao" || r === "cruz") return "x";
      if (t === "perpendicular") return "perp";
      if (t === "meio" || r === "meio") return "meio";
      if (t === "centro" || r === "centro" || r === "furo") return "centro";
      if (t === "fim" || /^(fim0|fim1|canto|vao0|vao1|topo|base|peitoril|verga)$/.test(String(r))) return "fim";
      return "proximo";
    },
    caminhoEncaixe: function (k, x, y, s) {
      function f(v) { return Math.round(v * 1e6) / 1e6; }
      if (k === "fim") return "M" + f(x - s) + " " + f(y - s) + "H" + f(x + s) + "V" + f(y + s) + "H" + f(x - s) + "Z";
      if (k === "meio") return "M" + f(x - s) + " " + f(y + s * 0.8) + "H" + f(x + s) + "L" + f(x) + " " + f(y - s) + "Z";
      if (k === "x") return "M" + f(x - s) + " " + f(y - s) + "L" + f(x + s) + " " + f(y + s) + "M" + f(x - s) + " " + f(y + s) + "L" + f(x + s) + " " + f(y - s);
      if (k === "perp") return "M" + f(x - s) + " " + f(y + s) + "H" + f(x + s) + "M" + f(x) + " " + f(y + s) + "V" + f(y - s);
      if (k === "centro") return "M" + f(x - s) + " " + f(y) + "A" + f(s) + " " + f(s) + " 0 1 0 " + f(x + s) + " " + f(y) + "A" + f(s) + " " + f(s) + " 0 1 0 " + f(x - s) + " " + f(y);
      return "M" + f(x) + " " + f(y - s) + "L" + f(x + s) + " " + f(y) + "L" + f(x) + " " + f(y + s) + "L" + f(x - s) + " " + f(y) + "Z";
    },
    /* a DICA do encaixe: pequena, fonte normal, 16 px abaixo e à direita do cursor. O valor da cota vai junto
       (ao vivo); o NOME some ao mover e volta depois de ~400 ms parado. Snaps › "Mostrar nome do encaixe" desliga. */
    _dica: function (val, nome) {
      if (typeof document === "undefined") return;
      var d = this._dicaEl, ev = this._ultEv, self = this;
      if (!d) { d = this._dicaEl = document.createElement("div"); d.className = "a7-dica-encaixe"; d.setAttribute("role", "status"); d.style.display = "none"; document.body.appendChild(d); }
      if (this._dicaT) { clearTimeout(this._dicaT); this._dicaT = null; }
      var nomeOn = !(global.BimBarraSnaps && global.BimBarraSnaps.mostrarNome && !global.BimBarraSnaps.mostrarNome());
      function mostrar(txt) { if (!txt || !ev) { d.style.display = "none"; return; } d.textContent = txt; d.style.left = (ev.x + 16) + "px"; d.style.top = (ev.y + 16) + "px"; d.style.display = "block"; }
      mostrar(val || ""); d.setAttribute("data-valor", val || "");
      d.setAttribute("data-nome", "");
      if (nomeOn && nome) this._dicaT = setTimeout(function () { self._dicaT = null; d.setAttribute("data-nome", nome); mostrar((val ? val + " · " : "") + nome); }, 400);
    },
    _tirarDica: function () { if (this._dicaT) { clearTimeout(this._dicaT); this._dicaT = null; } if (this._dicaEl) this._dicaEl.style.display = "none"; },
    _limparPrevia: function () {
      var P = P2(); if (!P) return;
      Object.keys(P._cache || {}).forEach(function (k) { var c = P._cache[k]; if (!c || !c.svg) return; Array.prototype.forEach.call(c.svg.querySelectorAll(".a7-previa, .a7-previa-tx, .a7-previa-snap"), function (g) { g.parentNode.removeChild(g); }); });
      this._tirarDica(); this._tabC = null;
    },
    mover2d: function (id, ev, p) {
      if (!this._f || !p) return;
      if (ev) this._ultEv = { x: ev.clientX, y: ev.clientY };
      this._ultP = { id: id, p: [p[0], p[1]] };
      if (this._tabC && (this._tabC.id !== id || Math.abs(p[0] - this._tabC.p[0]) + Math.abs(p[1] - this._tabC.p[1]) > this._tabC.raio)) this._tabC = null;
      /* COTAS: a cota mostra o encaixe e o valor desde o 1º movimento (antes do 1º clique também) */
      if (this._f.refs.length || this._f.pts.length || this._f.def.k === "cota") this._previa(id, p);
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
        /* COTAS: Tab alterna o encaixe (automático → eixo → face) */
        if (ev.key === "Tab" && self._f && self._f.def.k === "cota" && self._ultP && !ev.shiftKey) {
          /* TAB: o próximo candidato de encaixe sob o cursor (como no traçado); com um só, alterna face/eixo como antes */
          var up = self._ultP, stT = self.estado(), corteT = /^d2c-/.test(up.id), tolT = self._tol(up.id), tb = self._tabC;
          if (!tb) { var lt = self._listaCota(stT, up.p, tolT, up.id, corteT, self._f.def.cota === "elevacao" && !corteT ? "topo" : null); if (lt.length > 1) tb = self._tabC = { id: up.id, p: up.p.slice(), raio: self._tol(up.id, 3), lista: lt, i: 0 }; }
          if (tb) {
            tb.i = (tb.i + 1) % tb.lista.length; self._previa(up.id, up.p);
            status("Encaixe " + (tb.i + 1) + " de " + tb.lista.length + ": " + (tb.lista[tb.i].rotulo || "ponto") + " (Tab: o próximo). " + self.dica());
            ev.stopPropagation(); ev.preventDefault(); return;
          }
        }
        if (ev.key === "Tab" && self._f && self._f.def.k === "cota" && global.BimCotasUI && global.BimCotasUI.alternarPref) {
          var np = global.BimCotasUI.alternarPref(); self._candCache = null;
          status("Encaixe: " + np + ". " + self.dica()); ev.stopPropagation(); ev.preventDefault(); return;
        }
        if (ev.key === "Escape" && self._arr) { self._arrastoFim(true); ev.stopPropagation(); ev.preventDefault(); return; }
        if ((ev.key === "Delete" || ev.key === "Backspace") && !self._f && self._sel) {
          var id = self._sel; self.selecionar(null);
          if (self._op({ op: "apagar", id: id })) status("Anotação apagada (Ctrl+Z volta).");
          ev.stopPropagation(); ev.preventDefault();
        }
      };
      document.addEventListener("keydown", this._tecla, true);
    },

    /* ----------------------------------------------- COTAS: arrastar a linha e o texto (13/10/2026)
     * Na cota selecionada: o texto arrastado anda (tmov do trecho), a linha arrastada muda o
     * deslocamento (off). Durante o arrasto o desenho acompanha; ao soltar vira UMA op
     * anot2dAjustar (Ctrl+Z volta). Esc cancela e devolve o que era. */
    _arrastoInicio: function (vista, ev, p) {
      var M = A7(), st = this.estado(), it = M.item(st, this._sel); if (!it || it.tipo !== "cota") return false;
      var tx = ev.target && ev.target.closest ? ev.target.closest("[data-a7-seg]") : null;
      var modo = tx ? "texto" : (it.cota === "elevacao" || it.cota === "inclinacao" ? null : "linha"); if (!modo) return false;
      var self = this, P = P2();
      this._arr = { vista: vista, id: it.id, modo: modo, seg: tx ? String(tx.getAttribute("data-a7-seg")) : "0", p0: p, x0: ev.clientX, y0: ev.clientY, mexeu: false,
                    off: it.off, tmov: it.tmov ? JSON.parse(JSON.stringify(it.tmov)) : null };
      this._arrMove = function (e) {
        var a = self._arr; if (!a) return;
        var q = P._ptSvg(a.vista, e); if (!q) return;
        if (!a.mexeu && Math.abs(e.clientX - a.x0) + Math.abs(e.clientY - a.y0) < 4) return;
        a.mexeu = true;
        var cur = M.item(self.estado(), a.id); if (!cur) return;
        if (a.modo === "linha") { cur.off = M.offsetPara(self.estado(), cur, q, { corte: /^d2c-/.test(a.vista), vista: a.vista }); a.novo = { off: cur.off }; }
        else {
          var tm = a.tmov ? JSON.parse(JSON.stringify(a.tmov)) : {}, b = tm[a.seg] || { x: 0, y: 0 };
          tm[a.seg] = { x: Math.round((num(b.x, 0) + q[0] - a.p0[0]) * 1e4) / 1e4, y: Math.round((num(b.y, 0) + q[1] - a.p0[1]) * 1e4) / 1e4 };
          cur.tmov = tm; a.novo = { tmov: tm };
        }
        try { P.redesenhar(a.vista, false); } catch (e2) {}
      };
      this._arrUp = function () { self._arrastoFim(false); };
      document.addEventListener("pointermove", this._arrMove, true);
      document.addEventListener("pointerup", this._arrUp, true);
      status(modo === "texto" ? "Arraste o texto da cota; solte para gravar (Esc cancela)." : "Arraste a linha da cota; solte para gravar (Esc cancela).");
      return true;
    },
    _arrastoFim: function (cancelar) {
      var a = this._arr; if (!a) return false;
      this._arr = null;
      document.removeEventListener("pointermove", this._arrMove, true);
      document.removeEventListener("pointerup", this._arrUp, true);
      var cur = A7().item(this.estado(), a.id);
      if (cancelar || !a.mexeu || !a.novo) {
        if (cur) { cur.off = a.off; if (a.tmov) cur.tmov = a.tmov; else delete cur.tmov; }
        try { P2().redesenhar(a.vista, false); } catch (e) {}
        if (cancelar) status("Arrasto cancelado.");
        return false;
      }
      if (this._op({ op: "anot2dAjustar", id: a.id, campos: a.novo })) status(a.modo === "texto" ? "Texto da cota movido (Ctrl+Z volta)." : "Linha da cota no lugar novo (Ctrl+Z volta).");
      return true;
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
          { id: "sufixo", rotulo: "Sufixo", tipo: "texto", valor: it.sufixo || "" },
          /* COTAS (13/10/2026): texto substituto e precisão da instância; a órfã avisa */
          { id: "txt", rotulo: "Texto substituto", tipo: "texto", valor: it.txt || "", dica: "Vazio = o valor medido. <> dentro do texto é o valor (ex.: <> EQ)." },
          { id: "unidade", rotulo: "Unidade", tipo: "lista", valor: it.unidade || "", opcoes: [{ id: "", rotulo: "Do tipo (" + (t.unidade || "m") + ")" }, { id: "m", rotulo: "m" }, { id: "cm", rotulo: "cm" }, { id: "mm", rotulo: "mm" }] },
          { id: "casas", rotulo: "Casas decimais", tipo: "lista", valor: it.casas == null ? "" : String(it.casas), opcoes: [{ id: "", rotulo: "Do tipo (" + (t.casas != null ? t.casas : 2) + ")" }, { id: "0", rotulo: "0" }, { id: "1", rotulo: "1" }, { id: "2", rotulo: "2" }, { id: "3", rotulo: "3" }] }];
        var orfaV = A7().violacoes ? (st.anot2d && (st.anot2d.orfas || []).indexOf(it.id) >= 0) : false;
        if (orfaV) g.unshift({ id: "a7-orfa", rotulo: "Órfã", leitura: true, valor: "a peça a que a cota estava presa foi apagada — Ctrl+Z traz a peça; ou apague a cota" });
        if (it.cota === "linear" || it.cota === "alinhada" || it.cota === "coordenada") {
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
        mapa = { prefixo: "texto", sufixo: "texto", travada: "trava", eq: "bool", off: "num", orient: "texto", tipoCota: "texto", txt: "texto", unidade: "opcional", casas: "opcionalNum" };
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
          campos[pid] = k === "num" ? num(valor, 0) : k === "bool" ? !!valor : k === "textoMulti" ? String(valor).replace(/\s+\/\s+/g, "\n") :
            k === "opcionalNum" ? (valor === "" || valor == null ? null : num(valor, 0)) : k === "opcional" ? (valor === "" || valor == null ? null : String(valor)) : String(valor);
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

  /* ====================== PRECISÃO ÚNICA (14/10/2026, barra de baixo — js/bimbarrasnaps.js)
   * Em BLOCO À PARTE, embrulhando os métodos (e não por dentro deles): o corpo das cotas 2D é da
   * frente das cotas, que mexe nele em paralelo — assim as duas mudanças não brigam.
   *  · Linha de detalhe, região e nuvem: o próximo ponto anda no Orto da barra de baixo
   *    (horizontal/vertical e incrementos; Shift inverte). Círculo e arco não: o 2º ponto deles é
   *    raio/ângulo, não um lado.
   *  · Cota LINEAR e por COORDENADA: o 2º ponto LIVRE (fora de peça) anda no Orto; o ponto de peça é
   *    associativo e não se mexe; a ALINHADA continua livre (é a cota "na reta dos pontos").
   *  · Snap apagado na barra de baixo: a cota 2D não encaixa (só pontos livres), como a do 3D. */
  function travar2d(a, q, ev) {
    var Bo = global.BimBarraOpcoes; if (!a || !q || !Bo || !Bo.travar) return q;
    var r = Bo.travar({ x: a.x, z: a.y }, { x: q.x, z: q.y }, { shift: !!(ev && ev.shiftKey) });   /* (x, y) da vista entra como (x, z) */
    return r && r.travado ? { x: r.p.x, y: r.p.z } : q;
  }
  /* SNAPS COMPLETOS (14/10/2026): a linha, a região e a nuvem da vista 2D encaixam nas linhas, círculos e
     arcos de detalhe DESTA vista — extremidade, meio, centro, quadrante, centro geométrico, interseção,
     perpendicular, TANGENTE (do 1º ponto ao círculo), paralelo e prolongamento — com os tipos e a
     tolerância (em pixels) do Snap da barra de baixo. Devolve o snap ({ p:{x,z}, tipo }) ou null. */
  var _geo2d = { st: null, id: null, geo: null };
  function snap2d(self, id, p, base) {
    var R = global.BimPrecisao, Bo = global.BimBarraOpcoes;
    if (!R || !R.geoDeLinhas || !Bo || !Bo.snapLigado || !Bo.snapLigado(null)) return null;
    var st = self.estado();
    if (_geo2d.st !== st || _geo2d.id !== id) {
      var itens = ((st && st.anot2d && st.anot2d.itens) || []).filter(function (it) { return it && it.vista === id && (it.tipo === "linha" || it.tipo === "regiao"); });
      _geo2d = { st: st, id: id, geo: R.geoDeLinhas(itens.map(function (it) {
        return it.arco ? { id: it.id, circ: { c: { x: +it.arco.cx, z: +it.arco.cy }, r: +it.arco.r, a0: it.arco.a0, a1: it.arco.a1 } }
                       : { id: it.id, pts: (it.pts || []).map(function (q) { return { x: +q.x, z: +q.y }; }), fechado: it.tipo === "regiao" };
      })) };
    }
    var T = {}; R.TIPOS.forEach(function (t) { T[t] = Bo.snapLigado(t); });
    var inc = [90]; try { inc = Bo.precisao().inc; } catch (eI) {}
    return R.snap({ x: p[0], z: p[1] }, _geo2d.geo, { tol: self._tol(id, 12), tipos: T, ref: base ? { x: base.x, z: base.y } : null, grade: 0, incs: inc });
  }
  function ortoDe(self, id, ev, p) {
    var f = self._f; if (!f || !f.def || !p || (f.vista && f.vista !== id)) return p;
    var d = f.def, o = self.opcoes ? self.opcoes() : {};
    if (d.k === "linha" || d.k === "regiao" || d.k === "nuvem") {
      var ult = f.pts && f.pts.length && f.vista === id ? f.pts[f.pts.length - 1] : null, sn = null;
      try { sn = snap2d(self, id, p, ult); } catch (eS) { sn = null; }
      self._snap2d = sn ? { p: { x: sn.p.x, y: sn.p.z }, tipo: sn.tipo } : null;
      var q0 = sn ? { x: sn.p.x, y: sn.p.z } : { x: p[0], y: p[1] }, R = global.BimPrecisao;
      var forte = !!(sn && R && (R.CLASSE[sn.sub || sn.tipo] <= 1 || sn.tipo === "paralelo" || sn.tipo === "rastreamento"));
      if (ult && !forte && !(d.k === "linha" && /^(circulo|arco)$/.test(o.forma || ""))) q0 = travar2d(ult, q0, ev);
      return [q0.x, q0.y];
    }
    if (d.k === "cota" && (d.cota === "linear" || d.cota === "coordenada") && f.refs && f.refs.length === 1) {
      var M = A7(), st = self.estado(), corte = /^d2c-/.test(id);
      if (!M || self._acharCota(st, p, self._tol(id), id, corte, null)) return p;
      var r0 = M.resolverRef(M.indice(st), f.refs[0], { corte: corte, vista: id }); if (!r0 || !r0.ok) return p;
      var q2 = travar2d({ x: r0.p[0], y: r0.p[1] }, { x: p[0], y: p[1] }, ev); return [q2.x, q2.y];
    }
    return p;
  }
  var _clique2dPrec = BimAnot2DUI.clique2d;
  BimAnot2DUI.clique2d = function (id, ev, p) { try { if (this.ativo()) p = ortoDe(this, id, ev, p); } catch (eO) {} return _clique2dPrec.call(this, id, ev, p); };
  var _mover2dPrec = BimAnot2DUI.mover2d;
  BimAnot2DUI.mover2d = function (id, ev, p) {
    try { p = ortoDe(this, id, ev, p); } catch (eO) {}
    var r = _mover2dPrec.call(this, id, ev, p);
    try { marca2d(this, id); } catch (eM) {}
    return r;
  };
  /* a marca sai junto com a prévia (Enter, Esc, trocar de ferramenta) */
  var _limparPreviaPrec = BimAnot2DUI._limparPrevia;
  BimAnot2DUI._limparPrevia = function () {
    var r = _limparPreviaPrec.apply(this, arguments);
    try { Array.prototype.forEach.call(document.querySelectorAll(".a7-snap2d"), function (n) { n.parentNode.removeChild(n); }); } catch (eL) {}
    this._snap2d = null;
    return r;
  };
  /* a MARCA do snap na vista 2D (linha, região, nuvem): o mesmo símbolo do 3D (js/bimprecisao.js glifoSvg) junto ao
     ponto, com o nome do tipo — a cota já tem a dela (js/bimcotasui.js) */
  function marca2d(self, id) {
    var P = global.Bim2D, c = P && P._cache ? P._cache[id] : null, f = self._f; if (!c || !c.svg) return;
    var NS = "http://www.w3.org/2000/svg", g = c.svg.querySelector(".a7-snap2d"), sn = self._snap2d, R = global.BimPrecisao;
    if (!f || !f.def || f.def.k === "cota" || !sn || !sn.tipo || sn.tipo === "grade") { if (g) g.parentNode.removeChild(g); return; }
    if (!g) { g = document.createElementNS(NS, "g"); g.setAttribute("class", "a7-snap2d"); g.setAttribute("pointer-events", "none"); c.svg.appendChild(g); }
    var px = self._tol(id, 1), tam = 14 * px;
    g.setAttribute("data-tipo", sn.tipo);
    g.setAttribute("transform", "translate(" + (sn.p.x - tam / 2) + " " + (sn.p.y - tam / 2) + ") scale(" + (tam / 16) + ")");
    var gl = R && R.GLIFO && R.GLIFO[sn.tipo] ? R.GLIFO[sn.tipo] : '<circle cx="8" cy="8" r="5.5"/>';
    g.innerHTML = '<g fill="none" stroke="var(--d2-sel, #1f6fb2)" stroke-width="2">' + gl + "</g>" +
      '<text x="19" y="5" font-size="11" fill="var(--d2-sel, #1f6fb2)" stroke="none">' + String((R && R.ROTULO && R.ROTULO[sn.tipo]) || sn.tipo).replace(/[<&]/g, "") + "</text>";
  }
  var _acharCotaPrec = BimAnot2DUI._acharCota;
  BimAnot2DUI._acharCota = function () { var Bo = global.BimBarraOpcoes; if (Bo && Bo.snapLigado && !Bo.snapLigado(null)) return null; return _acharCotaPrec.apply(this, arguments); };

  global.BimAnot2DUI = BimAnot2DUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAnot2DUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

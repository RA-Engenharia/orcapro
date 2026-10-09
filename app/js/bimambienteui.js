/* =====================================================================
 * bimambienteui.js — AMBIENTES NA TELA (prévia
 * `?previa=modelador`). Fase P2, Frente D do plano do BIM
 * (fase P2 e seção 6). O motor é o js/bimambiente.js (P2-A): o contorno, a
 * área, o perímetro e o volume saem no replay; aqui só se MOSTRA e se
 * GRAVA op.
 *
 * O QUE APARECE
 *   · Arquitetura › "Ambiente e área": Ambiente (clique dentro da região
 *     fechada; antes do clique a região fica realçada), Separador de ambiente (dois cliques), Identificador
 *     de ambiente (liga/desliga nas plantas) e Esquema de cores (por Nome ou
 *     por Departamento, com legenda). Atalho RM (convenção de mercado).
 *   · Planta 2D (js/desenho2d.js + js/bim2dui.js): o identificador de ambiente
 *     no ponto do ambiente — nome em cima, "número · área" embaixo
 *     ("Sala" / "1 · 18,67 m²"); ambiente não delimitado ou redundante leva
 *     o aviso no lugar da área. Clique no identificador seleciona.
 *   · 3D: o volume do ambiente translúcido (o volume interno) só do
 *     ambiente selecionado, ou de todos com Vista › "Ambientes no 3D". Fora
 *     do modelo (não entra no raio da seleção nem na malha mesclada).
 *   · Navegador de projeto: ramo "Ambientes" (Nível › Número – Nome – Área);
 *     clicar seleciona e enquadra.
 *   · Seleção → a paleta de Propriedades da P1-C (js/bimpropsui.js) monta
 *     pelo registro (categoria `ambiente`); editar grava `ajustarAmbiente`
 *     e o Ctrl+Z desfaz.
 *
 * PURO × TELA: o texto do identificador, o esquema de cores (determinístico:
 * a mesma lista de valores dá sempre as mesmas cores, sem repetir enquanto
 * houver cor), o que vai para a planta, a árvore do Navegador e as ops são
 * funções puras exportadas (tools/test-bimambienteui.js). A tela só desenha.
 * Sem a prévia, `ativo()` é falso, `montar3d` devolve null e nada muda.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function AM() { return dep("BimAmbiente", "./bimambiente.js"); }
  function D2() { return dep("Desenho2D", "./desenho2d.js"); }
  function B() { return global.BIM || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, tipo) { try { if (global.UI && global.UI.toast) global.UI.toast(t, tipo || "info"); } catch (e) {} }

  /* número no padrão BR (1.234,56) — o mesmo do desenho técnico */
  function fmtNum(v, casas) {
    var D = D2(); if (D && D.fmtNum) return D.fmtNum(v, casas);
    var s = (Math.round(v * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
    var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : "");
  }
  function fmtArea(a) { return fmtNum(a, 2) + " m²"; }

  var NOME_PADRAO = "Ambiente";
  var AVISOS = { naoDelimitado: "Não delimitado", redundante: "Redundante" };
  /* "Esquema de cores": tons claros que deixam a linha e o texto legíveis no
     papel branco; o token (--d2-amb-N, css/bim-revit.css) troca pelo tom
     escuro no papel do tema escuro. 12 cores e o cinza do "sem valor". */
  var PALETA = [
    { token: "--d2-amb-1", cor: "#f6c9a8" }, { token: "--d2-amb-2", cor: "#b9dcf2" }, { token: "--d2-amb-3", cor: "#c8e6b5" },
    { token: "--d2-amb-4", cor: "#f3e3a2" }, { token: "--d2-amb-5", cor: "#dcc8ef" }, { token: "--d2-amb-6", cor: "#f5bfcf" },
    { token: "--d2-amb-7", cor: "#b5e3dc" }, { token: "--d2-amb-8", cor: "#e8d3b9" }, { token: "--d2-amb-9", cor: "#c9d3f5" },
    { token: "--d2-amb-10", cor: "#e2efa8" }, { token: "--d2-amb-11", cor: "#f2c2b0" }, { token: "--d2-amb-12", cor: "#c4e0ee" }
  ];
  var SEM_VALOR = { token: "--d2-amb-0", cor: "#e3e5e8" };
  var ESQUEMAS = { nenhum: "Nenhum", nome: "Por nome", departamento: "Por departamento" };
  var ROT_ESQ = { nome: "Nome", departamento: "Departamento" };

  /* hash estável (djb2) — a cor de um valor não depende da ordem de criação */
  function hash(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h < 0 ? -h : h; }
  function cmpTexto(a, b) { try { return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true }); } catch (e) { return a < b ? -1 : a > b ? 1 : 0; } }
  /* número do ambiente para ordenar: 2 antes de 10; texto depois */
  function cmpNumero(a, b) {
    var x = parseFloat(a), y = parseFloat(b);
    if (isFinite(x) && isFinite(y) && x !== y) return x - y;
    return cmpTexto(a, b);
  }

  var BimAmbienteUI = {
    PALETA: PALETA, SEM_VALOR: SEM_VALOR, ESQUEMAS: ESQUEMAS, AVISOS: AVISOS, NOME_PADRAO: NOME_PADRAO,
    fmtArea: fmtArea,

    /* ================================================================ PURO */

    /* o número que o ambiente mostra (o dado à mão ou o automático) */
    numero: function (a) {
      var M = AM(); if (M && M.numero) return M.numero(a) || "";
      return a ? txt(a.numero || (a.calc && a.calc.numeroAuto) || "") : "";
    },
    /* o IDENTIFICADOR do ambiente: { nome, numero, area, aviso, linha1, linha2, texto }
       linha1 = nome; linha2 = "1 · 18,67 m²" (ou "1 · Não delimitado");
       texto = "Sala · 1 · 18,67 m²" (Navegador, dica, status) */
    textoIdentificador: function (a) {
      var c = (a && a.calc) || {}, nome = txt(a && a.nome).trim() || NOME_PADRAO, numero = this.numero(a);
      var deli = c.estado === "delimitado" && fin(c.area);
      var aviso = deli ? null : (AVISOS[c.estado] || AVISOS.naoDelimitado);
      var resto = deli ? fmtArea(c.area) : aviso, linha2 = (numero ? numero + " · " : "") + resto;
      return { nome: nome, numero: numero, area: deli ? c.area : null, aviso: aviso, linha1: nome, linha2: linha2, texto: nome + " · " + linha2 };
    },
    /* o rótulo do Navegador: "1 – Sala – 18,67 m²" */
    rotuloNavegador: function (a) {
      var t = this.textoIdentificador(a);
      return (t.numero ? t.numero + " – " : "") + t.nome + " – " + (t.area != null ? fmtArea(t.area) : t.aviso);
    },

    /* o valor que o esquema colore: o Nome (vazio = "Ambiente", o nome
       padrão) ou o Departamento (vazio = sem valor) */
    valorEsquema: function (a, por) {
      if (por === "departamento") { var d = txt(a && a.departamento).trim(); return d || null; }
      return txt(a && a.nome).trim() || NOME_PADRAO;
    },
    /* ESQUEMA DE CORES, DETERMINÍSTICO:
       cada valor pega a cor pelo hash do texto e, se ela já foi dada a outro
       valor desta lista, a próxima livre (em ordem alfabética dos valores).
       Mesma lista → mesmas cores, em qualquer aparelho; até 12 valores sem
       repetir cor. Devolve { por, titulo, itens:[{valor, rotulo, cor, token,
       n, area}], porId:{id: item} } ou null (Nenhum). */
    esquemaCores: function (ambs, por) {
      if (por !== "nome" && por !== "departamento") return null;
      var self = this, grupos = {}, chaves = [], semValor = null;
      arr(ambs).forEach(function (a) {
        if (!a || a.id == null) return;
        var v = self.valorEsquema(a, por), c = a.calc || {};
        var g;
        if (v == null) g = semValor || (semValor = { valor: null, rotulo: "(sem " + ROT_ESQ[por].toLowerCase() + ")", n: 0, area: 0, ids: [] });
        else { if (!grupos[v]) { grupos[v] = { valor: v, rotulo: v, n: 0, area: 0, ids: [] }; chaves.push(v); } g = grupos[v]; }
        g.n++; g.ids.push(String(a.id));
        if (c.estado === "delimitado" && fin(c.area)) g.area = Math.round((g.area + c.area) * 1e4) / 1e4;
      });
      chaves.sort(cmpTexto);
      var usadas = {}, N = PALETA.length, itens = [];
      chaves.forEach(function (k) {
        var i = hash(k.toLowerCase()) % N, t = 0;
        while (usadas[i] && t < N) { i = (i + 1) % N; t++; }
        usadas[i] = 1;
        var g = grupos[k]; g.cor = PALETA[i].cor; g.token = PALETA[i].token; itens.push(g);
      });
      if (semValor) { semValor.cor = SEM_VALOR.cor; semValor.token = SEM_VALOR.token; itens.push(semValor); }
      var porId = {};
      itens.forEach(function (it) { it.ids.forEach(function (id) { porId[id] = it; }); });
      return { por: por, titulo: "Esquema de cores — " + ROT_ESQ[por], itens: itens, porId: porId };
    },

    /* os níveis em ordem de elevação: [{ id, nome, y }] (aceita y ou elevacao) */
    _niveis: function (niveis) {
      return arr(niveis).filter(function (n) { return n && n.id != null; })
        .map(function (n) { return { id: String(n.id), nome: txt(n.nome) || String(n.id), y: num(n.y != null ? n.y : n.elevacao, 0) }; })
        .sort(function (a, b) { return a.y - b.y; });
    },
    /* o nível em que o ambiente MORA: o dele, se existe; senão o mais alto
       abaixo da base do ambiente (planta de obra sem níveis, ambiente antigo) */
    nivelDe: function (a, niveis) {
      var L = this._niveis(niveis); if (!L.length) return null;
      if (a && a.nivelId != null && L.some(function (n) { return n.id === String(a.nivelId); })) return String(a.nivelId);
      var base = a && a.calc && fin(a.calc.base) ? a.calc.base : num(a && a.deslocBase, 0), r = L[0];
      L.forEach(function (n) { if (n.y <= base + 0.01) r = n; });
      return r.id;
    },
    ambientesDoNivel: function (ambs, niveis, nivelId) {
      var self = this, L = this._niveis(niveis);
      if (!L.length) return arr(ambs).filter(function (a) { return a && a.id != null; });
      return arr(ambs).filter(function (a) { return a && a.id != null && self.nivelDe(a, L) === String(nivelId); });
    },

    /* o que a planta 2D leva (js/desenho2d.js, d.ambientes) — coordenadas da
       planta: X = x, Y = z do mundo */
    /* os separadores do nível (a "Linha de separação de ambiente" aparece na planta, fina) */
    separadoresDoNivel: function (seps, niveis, nivelId) {
      var L = this._niveis(niveis), ids = {}; L.forEach(function (n) { ids[n.id] = 1; });
      return arr(seps).filter(function (sp) {
        if (!sp) return false;
        if (!L.length) return true;
        var k = sp.nivelId != null && ids[String(sp.nivelId)] ? String(sp.nivelId) : L[0].id;
        return k === String(nivelId);
      });
    },
    planta: function (estado, nivel, niveis, estilo, sel) {
      var self = this, e = estilo || {}, ambs = this.ambientesDoNivel(arr(estado && estado.ambientes), niveis, nivel && nivel.id);
      var seps = this.separadoresDoNivel(estado && estado.separadores, niveis, nivel && nivel.id).map(function (sp) { return [sp.x0, sp.z0, sp.x1, sp.z1]; });
      if (!ambs.length && !seps.length) return null;
      var esq = this.esquemaCores(ambs, e.esquemaCores);
      var itens = ambs.map(function (a) {
        var c = a.calc || {}, t = self.textoIdentificador(a), deli = c.estado === "delimitado";
        var it = { id: String(a.id), pts: deli ? arr(c.contorno).map(function (q) { return [q.x, q.z]; }) : [],
                   furos: deli ? arr(c.furos).map(function (f) { return arr(f).map(function (q) { return [q.x, q.z]; }); }) : [],
                   linha1: t.linha1, linha2: t.linha2, aviso: t.aviso, x: a.ponto ? num(a.ponto.x, NaN) : NaN, y: a.ponto ? num(a.ponto.z, NaN) : NaN,
                   sel: sel != null && String(sel) === String(a.id) };
        if (esq && deli) { var ci = esq.porId[String(a.id)]; if (ci) { it.cor = ci.cor; it.token = ci.token; } }
        return it;
      });
      return { itens: itens, separadores: seps, legenda: esq ? { titulo: esq.titulo, itens: esq.itens.map(function (i) { return { rotulo: i.rotulo, cor: i.cor, token: i.token }; }) } : null };
    },

    /* o ramo "Ambientes" do Navegador: Nível › "Número – Nome – Área".
       Folha: { id:"amb:<id>", rotulo, icone, ambId, selecionado } */
    arvore: function (ambs, niveis, sel) {
      var self = this, L = this._niveis(niveis), lista = arr(ambs).filter(function (a) { return a && a.id != null; });
      var grupos = {}, ordem = [];
      lista.forEach(function (a) {
        var nid = self.nivelDe(a, L), k = nid == null ? "" : nid;
        if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
        grupos[k].push(a);
      });
      var posN = {}; L.forEach(function (n, i) { posN[n.id] = i; });
      ordem.sort(function (a, b) { return (posN[a] != null ? posN[a] : -1) - (posN[b] != null ? posN[b] : -1); });
      var nomeN = {}; L.forEach(function (n) { nomeN[n.id] = n.nome; });
      var filhos = ordem.map(function (k) {
        var g = grupos[k].slice().sort(function (a, b) { return cmpNumero(self.numero(a), self.numero(b)); });
        return { id: "ambn:" + (k || "sem"), rotulo: k ? (nomeN[k] || k) : "Sem nível", icone: "niveis", n: g.length, aberto: true,
                 filhos: g.map(function (a) { return { id: "amb:" + a.id, rotulo: self.rotuloNavegador(a), icone: "ambiente", ambId: String(a.id), selecionado: sel != null && String(sel) === String(a.id) }; }) };
      });
      return { id: "ambientes", rotulo: "Ambientes", icone: "ambiente", n: lista.length, aberto: lista.length > 0,
               filhos: filhos.length ? filhos : [{ id: "amb:vazio", rotulo: "Nenhum — Arquitetura › Ambiente", icone: "ambiente", vazio: true }] };
    },

    /* a op do Separador de ambiente (dois pontos da planta, x/z do mundo) */
    opSeparador: function (estado, a, b, nivelId) {
      if (!a || !b || !fin(num(a.x, NaN)) || !fin(num(a.z, NaN)) || !fin(num(b.x, NaN)) || !fin(num(b.z, NaN))) return { ok: false, motivo: "Clique os dois pontos da linha de separação." };
      var L = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.z - a.z, 2));
      if (!(L >= 0.05)) return { ok: false, motivo: "Linha de separação curta demais (mínimo 5 cm)." };
      var M = AM(), id = M ? M.novoId(estado, "sep") : "sep" + Date.now().toString(36);
      var o = { op: "separador", id: id, x0: r6(+a.x), z0: r6(+a.z), x1: r6(+b.x), z1: r6(+b.z) };
      if (nivelId != null && nivelId !== "") o.nivelId = String(nivelId);
      return { ok: true, op: o, comprimento: L };
    },
    /* a op do Ambiente no ponto; sem nível, a base vai pelo deslocamento
       (o plano de cálculo tem de cortar as paredes do plano de trabalho) */
    opAmbiente: function (estado, ponto, nivelId, base, nome) {
      var M = AM(); if (!M) return { ok: false, motivo: "O motor do ambiente não carregou." };
      var campos = {};
      if (txt(nome).trim() && txt(nome).trim() !== NOME_PADRAO) campos.nome = txt(nome).trim();
      if ((nivelId == null || nivelId === "") && fin(base) && Math.abs(base) > 1e-9 && Math.abs(base) <= 100) campos.deslocBase = r6(base);
      return M.opAmbiente(estado, ponto, nivelId, campos);
    },
    /* a REGIÃO que o clique pegaria (o realce antes do clique): o estado com
       os ambientes do mesmo nível + um provisório no ponto, calculado pelo
       motor — { estado, contorno:[[x,z]], furos, area } */
    previa: function (estado, ponto, nivelId, niveis, base) {
      var M = AM(); if (!M || !estado || !ponto) return null;
      var nk = nivelId == null ? "" : String(nivelId);
      var ambs = arr(estado.ambientes).filter(function (a) { return a && (a.nivelId == null ? "" : String(a.nivelId)) === nk; })
        .map(function (a) { var o = { id: a.id, ponto: a.ponto }; if (a.nivelId != null) o.nivelId = a.nivelId; if (fin(a.deslocBase)) o.deslocBase = a.deslocBase; return o; });
      var tmp = { id: "__previa", ponto: { x: +ponto.x, z: +ponto.z } };
      if (nk) tmp.nivelId = nk; else if (fin(base) && Math.abs(base) > 1e-9) tmp.deslocBase = base;
      var st = { caixas: estado.caixas, separadores: estado.separadores, ambienteRegra: estado.ambienteRegra, ambientes: ambs.concat([tmp]) };
      var c = M.calcular(st, { niveis: niveis }).porId.__previa;
      if (!c) return null;
      /* redundante: o motor não devolve o contorno — a região sai da conta sem os outros (o realce fica laranja) */
      if (c.estado === "redundante") {
        st.ambientes = [tmp];
        var c2 = M.calcular(st, { niveis: niveis }).porId.__previa;
        if (c2 && c2.estado === "delimitado") { c2.estado = "redundante"; c2.area = null; c = c2; }
      }
      return { estado: c.estado, area: c.area, regraNome: c.regraNome,
               contorno: arr(c.contorno).map(function (q) { return [q.x, q.z]; }), furos: arr(c.furos).map(function (f) { return f.map(function (q) { return [q.x, q.z]; }); }) };
    },
    /* a "Situação" que o status mostra ao colocar */
    resumoColocado: function (a) {
      var t = this.textoIdentificador(a), c = (a && a.calc) || {};
      if (t.area != null) return "Ambiente " + t.numero + " colocado: " + fmtArea(t.area) + " (" + (c.regraNome || "Na face da parede") + "), perímetro " + fmtNum(c.perimetro || 0, 2) + " m.";
      if (c.estado === "redundante") return "Ambiente " + t.numero + " redundante: esta região já tem um ambiente (aviso). Ctrl+Z desfaz.";
      return "Ambiente " + t.numero + " não delimitado: o ponto não está numa região fechada por paredes, pilares ou separadores. Ctrl+Z desfaz.";
    },

    /* ================================================================ TELA */
    _G: null, _api: null, _m3d: null, _sel: null, _sep: null, _cfg: { nome: "" },
    _ver3d: null, _assArv: "", _tPlanta: 0, _ultMov: 0,

    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && AM()); } catch (e) { return false; } },
    estado: function () { var b = B(); var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    niveisObra: function () {
      try { return global.BimArqUI && global.BimArqUI.niveis ? global.BimArqUI.niveis().map(function (n) { return { id: n.id, nome: n.nome, elevacao: +n.elevacao || 0 }; }) : []; } catch (e) { return []; }
    },
    ambiente: function (id) { var s = String(id); return arr((this.estado() || {}).ambientes).filter(function (a) { return String(a.id) === s; })[0] || null; },
    ver3d: function () {
      if (this._ver3d == null) { var v = false; try { v = global.localStorage.getItem("orcapro:bim:ambientes3d") === "1"; } catch (e) { v = false; } this._ver3d = v; }
      return this._ver3d;
    },

    /* ----------------------------------------------- fita e comandos */
    registrar: function (reg, G) {
      this._G = G || this._G;
      if (!this.ativo() || !global.BimRibbon) return false;
      var self = this, R = global.BimRibbon;
      R.acrescentar("arquitetura", "Arquitetura", "Ambiente e área", [
        { id: "ambiente", rotulo: "Ambiente", icone: "ambiente", grande: true, tipo: "alterna", dica: "Ambiente (RM): passe o mouse e a região fechada pelas paredes, pilares e separadores fica realçada; clique dentro para colocar. Área, perímetro e volume saem das paredes e acompanham quando elas mudam. Funciona no 3D e na planta baixa." },
        { id: "separador-ambiente", rotulo: "Separador\nde ambiente", icone: "regua", grande: true, tipo: "alterna", dica: "Linha de separação de ambiente: dois cliques. Divide uma região sem parede (sala e cozinha integradas) em dois ambientes." },
        { id: "identificador-ambiente", rotulo: "Identificador\nde ambiente", icone: "alvo", grande: true, dica: "Liga e desliga o identificador dos ambientes nas plantas (nome; número · área)." },
        { id: "esquema-cores", rotulo: "Esquema\nde cores", icone: "paleta", grande: true, dica: "Pinta a planta por ambiente — por Nome ou por Departamento — com a legenda ao lado." }
      ]);
      R.acrescentar("vista", "Vista", "Exibir", [
        { id: "ambientes-3d", rotulo: "Ambientes\nno 3D", icone: "camadas", dica: "Mostra o volume de todos os ambientes no 3D, translúcido (o volume interno). Sem isto, só o ambiente selecionado aparece." }
      ]);
      ["ambiente", "separador-ambiente"].forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
      function ferr(sub) {
        return function (e) {
          var b = B(); if (!b || !b.editarArmar) return false;
          if (e && e.ligado === false) { b.editarArmar(null); status("Ferramenta desligada."); return true; }
          try { if (global.BimArqUI && global.BimArqUI.enviar) global.BimArqUI.enviar(); } catch (eE) {}
          var ok = b.editarArmar(sub);
          try { if (global.BimShell) global.BimShell.pintarProps(self.esquemaFerramenta(sub)); } catch (eP) {}
          status(sub === "ambiente" ? "Ambiente: passe o mouse sobre a região e clique dentro dela (no 3D ou na planta). Esc encerra." : "Separador de ambiente: clique as duas pontas da linha. Esc encerra.");
          return ok !== false;
        };
      }
      reg.ambiente = ferr("ambiente");
      reg["separador-ambiente"] = ferr("separador");
      reg["identificador-ambiente"] = function () {
        var lig = !self.identLigado();
        self.definirPlantas({ identAmbiente: lig });
        status(lig ? "Identificadores de ambiente ligados nas plantas." : "Identificadores de ambiente desligados nas plantas.");
        return true;
      };
      reg["esquema-cores"] = function () { self.escolherEsquema(); return true; };
      reg["ambientes-3d"] = function () {
        self._ver3d = !self.ver3d();
        try { global.localStorage.setItem("orcapro:bim:ambientes3d", self._ver3d ? "1" : "0"); } catch (e) {}
        if (self._m3d) self._m3d.desenhar();
        status(self._ver3d ? "Ambientes no 3D: todos os volumes, translúcidos." : "Ambientes no 3D: só o ambiente selecionado.");
        return true;
      };
      /* o atalho (duas letras, js/bimprecisaoui.js) */
      try { if (global.BimPrecisao && global.BimPrecisao.ATALHOS && !global.BimPrecisao.ATALHOS.RM) global.BimPrecisao.ATALHOS.RM = "ambiente"; } catch (eA) {}
      return true;
    },
    /* Propriedades da ferramenta (a barra de opções da ferramenta) */
    esquemaFerramenta: function (sub) {
      var self = this, M = AM(), st = this.estado(), regra = (st && st.ambienteRegra) || (M ? M.REGRA_PADRAO : "face");
      var nv = null; try { nv = global.BimArqUI && global.BimArqUI.nivelAtivo ? global.BimArqUI.nivelAtivo() : null; } catch (e) { nv = null; }
      var ps = [];
      if (sub === "ambiente") ps.push({ id: "p2d:nome", rotulo: "Nome do próximo ambiente", tipo: "texto", valor: this._cfg.nome || NOME_PADRAO });
      ps.push({ id: "p2d:regra", rotulo: "Cálculos de área e volume", tipo: "lista", valor: regra,
                opcoes: M ? Object.keys(M.REGRAS).map(function (k) { return { id: k, rotulo: M.REGRAS[k] }; }) : [] });
      return { titulo: "Ferramenta: " + (sub === "ambiente" ? "Ambiente" : "Separador de ambiente"), icone: "ambiente", semEditarTipo: true,
               secoes: [{ nome: "Nível", params: [{ id: "p2d:nivel", rotulo: "Nível", leitura: true, valor: nv ? nv.nome : "sem níveis (plano de trabalho)" }] },
                        { nome: sub === "ambiente" ? "Ambiente" : "Separador", params: ps }],
               onMudar: function (pid, valor) {
                 if (pid === "p2d:nome") self._cfg.nome = txt(valor).trim();
                 if (pid === "p2d:regra" && B() && B().b2Op) B().b2Op({ op: "ambienteRegra", regra: String(valor) });
                 return self.esquemaFerramenta(sub);
               } };
    },

    /* ----------------------------------------------- plantas (Bim2D) */
    _plantaIds: function () {
      var P = global.Bim2D; if (!P) return [];
      try { return P.niveis().map(function (n) { return P.idPlanta(n.id); }); } catch (e) { return []; }
    },
    identLigado: function () {
      var P = global.Bim2D, ids = this._plantaIds(); if (!P || !ids.length) return true;
      try { return P.estilo(ids[0]).identAmbiente !== false; } catch (e) { return true; }
    },
    /* muda o estilo de TODAS as plantas da obra (identificador, esquema) e redesenha as abertas */
    definirPlantas: function (mud) {
      var P = global.Bim2D, D = D2(); if (!P || !D) return false;
      try { if (this._G && this._G._d2Config) this._G._d2Config(); } catch (e) {}
      var est = P.estado();
      this._plantaIds().forEach(function (id) {
        var e = est.estilos[id] || P.estilo(id);
        Object.keys(mud).forEach(function (k) { e[k] = mud[k]; });
        est.estilos[id] = D.normEstilo(e);
      });
      P._gravar();
      this._redesenharPlantas(false);
      return true;
    },
    aplicarEsquema: function (por) {
      if (!ESQUEMAS[por]) por = "nenhum";
      this.definirPlantas({ esquemaCores: por });
      /* a legenda fica ao lado do desenho: as plantas abertas se enquadram para ela aparecer */
      try { var P0 = global.Bim2D; if (por !== "nenhum" && P0) P0.plantasAbertas().forEach(function (k) { P0.ajustar(k); }); } catch (eAj) {}
      /* sem planta aberta, abre a de trabalho para mostrar */
      try {
        var G = this._G, P = global.Bim2D;
        if (por !== "nenhum" && G && G._d2PlantaPadrao && P && !P.plantasAbertas().length) {
          var pid = G._d2PlantaPadrao(); if (pid) G._d2Abrir(pid, (P.def(pid) || {}).nome || "Planta baixa");
        }
      } catch (e) {}
      status(por === "nenhum" ? "Esquema de cores desligado nas plantas." : "Esquema de cores " + ESQUEMAS[por].toLowerCase() + " nas plantas, com a legenda ao lado.");
      return true;
    },
    escolherEsquema: function () {
      var self = this, P = global.Bim2D, at = "nenhum";
      try { var ids = this._plantaIds(); if (P && ids.length) at = P.estilo(ids[0]).esquemaCores || "nenhum"; } catch (e) {}
      if (!global.UI || !global.UI.modal) { this.aplicarEsquema(at === "nome" ? "departamento" : (at === "nenhum" ? "nome" : "nenhum")); return; }
      var h = '<p class="muted" style="margin:0 0 10px">Esquema de cores: cada ambiente da planta é pintado pela cor do valor escolhido, com a legenda ao lado. A cor de um valor é sempre a mesma.</p>' +
        Object.keys(ESQUEMAS).map(function (k) {
          return '<label style="display:flex;gap:8px;align-items:center;padding:6px 0"><input type="radio" name="p2d-esq" value="' + k + '"' + (k === at ? " checked" : "") + "> " + ESQUEMAS[k] + "</label>";
        }).join("");
      global.UI.modal("Esquema de cores", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } },
        { texto: "Aplicar nas plantas", classe: "primary", onClick: function () {
          var r = document.querySelector('input[name="p2d-esq"]:checked'); var v = r ? r.value : "nenhum";
          global.UI.fecharModal(); self.aplicarEsquema(v);
        } }
      ]);
    },
    /* Propriedades da planta: a seção "Ambientes" (js/bim2dui.js props) */
    secaoVista: function (e) {
      if (!this.ativo()) return null;
      return { nome: "Ambientes", params: [
        { id: "esquemaCores", rotulo: "Esquema de cores", tipo: "lista", valor: e.esquemaCores || "nenhum", opcoes: Object.keys(ESQUEMAS).map(function (k) { return { id: k, rotulo: ESQUEMAS[k] }; }) },
        { id: "identAmbiente", rotulo: "Identificadores de ambiente", tipo: "sim-nao", valor: e.identAmbiente !== false }
      ] };
    },
    /* o que entra na planta (gancho no Bim2D._anotar) */
    anotarPlanta: function (d, estilo, niveis) {
      if (!this.ativo() || !d || !d.nivel) return null;
      var st = this.estado(); if (!st || (!arr(st.ambientes).length && !arr(st.separadores).length)) return null;
      return this.planta(st, d.nivel, niveis, estilo, this._sel);
    },
    _redesenharPlantas: function (recalcular) {
      var P = global.Bim2D; if (!P || !P.plantasAbertas) return;
      P.plantasAbertas().forEach(function (k) { try { if (recalcular) P.atualizar(k); else P.redesenhar(k, false); } catch (e) {} });
    },
    /* o modelo mudou: as plantas abertas se refazem (mantendo o zoom) — juntando rajadas */
    _agendarPlantas: function () {
      var self = this;
      if (this._tPlanta) clearTimeout(this._tPlanta);
      this._tPlanta = setTimeout(function () { self._tPlanta = 0; self._redesenharPlantas(true); }, 120);
    },

    /* ----------------------------------------------- seleção */
    _info: function (a) {
      var t = this.textoIdentificador(a);
      return { uid: "edit:" + a.id, id: String(a.id), mid: "edit", expressID: String(a.id), tipo: "IFCSPACE", nome: t.nome + " " + t.numero, ambiente: true };
    },
    selecionar: function (id, opts) {
      var a = this.ambiente(id); if (!a) return false;
      if (this._api && this._api.pick) this._api.pick(this._info(a)); else this.aoSelecionar(this._info(a));
      if (this._sel !== String(a.id)) this.aoSelecionar(this._info(a));
      if (opts && opts.enquadrar) this.enquadrar(a.id);
      status("Selecionado: " + this.textoIdentificador(a).texto + ". As propriedades estão em Propriedades.");
      return true;
    },
    selecionado: function () { return this._sel; },
    /* a casca avisa toda seleção (Gestao onPick): ambiente ou não */
    aoSelecionar: function (info) {
      var uid = info && info.uid ? String(info.uid) : "", id = /^edit:/.test(uid) ? uid.slice(5) : null;
      var novo = id && this.ambiente(id) ? id : null;
      if (novo === this._sel) return;
      this._sel = novo;
      if (this._m3d) this._m3d.desenhar();
      this._redesenharPlantas(false);
      this._arvoreSeMudou();
    },
    enquadrar: function (id) {
      var a = this.ambiente(id); if (!a) return false;
      var c = a.calc || {}, P = arr(c.contorno).map(function (q) { return [q.x, q.z]; });
      if (!P.length && a.ponto) P = [[a.ponto.x - 1.5, a.ponto.z - 1.5], [a.ponto.x + 1.5, a.ponto.z + 1.5]];
      if (!P.length) return false;
      var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      P.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); });
      var G = this._G, ativa = null;
      try { ativa = G && G._bimVxEst ? G._bimVxEst().ativa : null; } catch (e) { ativa = null; }
      var Pd = global.Bim2D;
      if (ativa && /^d2p-/.test(ativa) && Pd && Pd._cache[ativa] && Pd._cache[ativa].svg) {
        var m = Math.max(1.5, (x1 - x0) * 0.4, (z1 - z0) * 0.4);
        Pd._aplicarVb(ativa, { x: x0 - m, y: z0 - m, w: x1 - x0 + 2 * m, h: z1 - z0 + 2 * m });
        return true;
      }
      if (this._api && this._api.enquadrar && this._api.THREE) {
        var T = this._api.THREE, y0 = fin(c.base) ? c.base : 0, y1 = fin(c.topo) ? c.topo : y0 + 2.8;
        this._api.enquadrar(new T.Box3(new T.Vector3(x0, y0, z0), new T.Vector3(x1, y1, z1)));
        return true;
      }
      return false;
    },

    /* ----------------------------------------------- Navegador */
    ramoNavegador: function () {
      if (!this.ativo()) return null;
      var self = this, st = this.estado(), r = this.arvore(arr(st && st.ambientes), this.niveisObra(), this._sel);
      (function ligar(nos) { nos.forEach(function (n) { if (n.ambId) n.fn = function () { self.selecionar(n.ambId, { enquadrar: true }); }; else if (n.vazio) n.fn = function () { try { global.BimShell.executar("ambiente"); } catch (e) {} }; if (n.filhos) ligar(n.filhos); }); })([r]);
      return r;
    },
    /* o Navegador só se refaz quando o ramo dos ambientes muda (rótulo, nível, seleção) */
    _arvoreSeMudou: function () {
      var st = this.estado(), ass = "";
      try { ass = JSON.stringify(this.arvore(arr(st && st.ambientes), this.niveisObra(), this._sel)); } catch (e) { ass = ""; }
      if (ass === this._assArv) return;
      this._assArv = ass;
      try { if (this._G && this._G._nivArvore) this._G._nivArvore(); } catch (e2) {}
    },

    /* ----------------------------------------------- colocar (3D e planta) */
    /* nivel = { id, elevacao } (null = o nível ativo do editor) */
    _colocar: function (sub, ponto, nivel) {
      var api = this._api, st = this.estado(); if (!api || !st) return false;
      var ed = api.edit, nv = nivel || (ed.b2 && ed.b2.nivel ? { id: ed.b2.nivel.id, elevacao: +ed.b2.nivel.elevacao } : null);
      var nid = nv && nv.id != null && nv.id !== "" ? nv.id : null, base = nv && fin(nv.elevacao) ? nv.elevacao : ed.base;
      if (sub === "ambiente") {
        var r = this.opAmbiente(st, ponto, nid, base, this._cfg.nome);
        if (!r.ok) { api.hint(r.motivo); return false; }
        api.op(r.op); if (api.fechou) api.fechou();
        var a = this.ambiente(r.op.id);
        var msg = a ? this.resumoColocado(a) : "Ambiente colocado.";
        api.hint(msg + " Clique em outra região, ou Esc."); status(msg);
        return true;
      }
      if (sub === "separador") {
        if (!this._sep) { this._sep = { x: ponto.x, z: ponto.z, nivel: nv }; api.hint("Separador de ambiente: agora a outra ponta da linha."); return true; }
        var a0 = this._sep; this._sep = null;
        var o = this.opSeparador(st, a0, ponto, a0.nivel && a0.nivel.id != null ? a0.nivel.id : nid);
        this._limparPrevias();
        if (!o.ok) { api.hint(o.motivo); return true; }
        api.op(o.op); if (api.fechou) api.fechou();
        api.hint("Separador de ambiente criado (" + fmtNum(o.comprimento, 2) + " m). Clique o início do próximo, ou Esc.");
        status("Separador de ambiente criado: as regiões dos dois lados viram ambientes diferentes.");
        return true;
      }
      return false;
    },
    ferramenta: function () { return this._m3d ? this._m3d.ferramenta() : null; },
    _nivelPlanta: function (id) {
      var P = global.Bim2D, d = P && P.def ? P.def(id) : null; if (!d || !d.nivel) return null;
      var obra = this.niveisObra(), real = obra.some(function (n) { return String(n.id) === String(d.nivel.id); });
      return { id: real ? d.nivel.id : null, elevacao: num(d.nivel.y, 0) };
    },
    /* planta 2D: com a ferramenta, o clique é o ponto; sem, o identificador seleciona */
    clique2d: function (id, ev, p) {
      if (!this.ativo() || !/^d2p-/.test(String(id))) return false;
      var f = this.ferramenta();
      if (f) {
        if (!p) return true;
        var nv = this._nivelPlanta(id);
        this._colocar(f, { x: p[0], z: p[1] }, nv);
        return true;
      }
      var alvo = ev && ev.target && ev.target.closest ? ev.target.closest("[data-d2-amb]") : null;
      if (alvo) { this.selecionar(alvo.getAttribute("data-d2-amb")); return true; }
      return false;
    },
    mover2d: function (id, ev, p) {
      var P = global.Bim2D, c = P && P._cache ? P._cache[id] : null; if (!c || !c.svg) return;
      var f = this.ativo() ? this.ferramenta() : null;
      if (!f || !/^d2p-/.test(String(id))) { if (c.el && c.el.hasAttribute("data-d2-amb-ferr")) { c.el.removeAttribute("data-d2-amb-ferr"); this._limparPrevia2d(c); } return; }
      c.el.setAttribute("data-d2-amb-ferr", f);
      if (!p) return;
      var agora = Date.now(); if (agora - this._ultMov < 50) return; this._ultMov = agora;
      var NS = "http://www.w3.org/2000/svg", g = c.svg.querySelector(".d2-amb-previa");
      if (f === "separador") {
        if (!this._sep) { if (g) g.parentNode.removeChild(g); return; }
        if (!g || g.tagName.toLowerCase() !== "line") { if (g) g.parentNode.removeChild(g); g = document.createElementNS(NS, "line"); g.setAttribute("class", "d2-amb-previa"); g.setAttribute("vector-effect", "non-scaling-stroke"); c.svg.appendChild(g); }
        g.setAttribute("x1", this._sep.x); g.setAttribute("y1", this._sep.z); g.setAttribute("x2", p[0]); g.setAttribute("y2", p[1]);
        return;
      }
      var nv = this._nivelPlanta(id), pr = null;
      try { pr = this.previa(this.estado(), { x: p[0], z: p[1] }, nv ? nv.id : null, this.niveisObra(), nv ? nv.elevacao : 0); } catch (e) { pr = null; }
      if (!pr || pr.estado === "naoDelimitado" || !pr.contorno.length) { if (g) g.parentNode.removeChild(g); return; }
      if (!g || g.tagName.toLowerCase() !== "path") { if (g) g.parentNode.removeChild(g); g = document.createElementNS(NS, "path"); g.setAttribute("class", "d2-amb-previa"); g.setAttribute("vector-effect", "non-scaling-stroke"); g.setAttribute("fill-rule", "evenodd"); c.svg.appendChild(g); }
      var dd = ""; [pr.contorno].concat(pr.furos).forEach(function (q) { q.forEach(function (pt, i) { dd += (i ? "L" : "M") + pt[0] + " " + pt[1]; }); dd += "Z"; });
      g.setAttribute("d", dd); g.setAttribute("data-estado", pr.estado);
    },
    _limparPrevia2d: function (c) { var g = c && c.svg ? c.svg.querySelector(".d2-amb-previa") : null; if (g) g.parentNode.removeChild(g); },
    _limparPrevias: function () {
      var P = global.Bim2D, self = this; if (!P || !P._cache) return;
      Object.keys(P._cache).forEach(function (k) { var c = P._cache[k]; self._limparPrevia2d(c); if (c && c.el) c.el.removeAttribute("data-d2-amb-ferr"); });
      if (this._m3d) this._m3d.limparPrevia();
    },

    /* ----------------------------------------------- 3D (gancho P2-D no js/bim.js) */
    montar3d: function (api) {
      if (!this.ativo() || !api || !api.THREE || !api.scene) return null;
      var self = this, T = api.THREE, edit = api.edit;
      this._api = api;
      var grpV = new T.Group(); grpV.name = "p2d-ambientes"; api.scene.add(grpV);
      var grpP = new T.Group(); grpP.name = "p2d-previa"; api.scene.add(grpP);
      var mats = {};
      function mat(k) {
        if (mats[k]) return mats[k];
        var M = {
          vol: function () { return new T.MeshBasicMaterial({ color: 0x4a90d9, transparent: true, opacity: 0.10, depthWrite: false, side: T.DoubleSide }); },
          volSel: function () { return new T.MeshBasicMaterial({ color: 0x1a6cb5, transparent: true, opacity: 0.24, depthWrite: false, side: T.DoubleSide }); },
          aresta: function () { return new T.LineBasicMaterial({ color: 0x1a6cb5, transparent: true, opacity: 0.85, depthTest: false }); },
          previa: function () { return new T.MeshBasicMaterial({ color: 0x1a6cb5, transparent: true, opacity: 0.22, depthWrite: false, depthTest: false, side: T.DoubleSide }); },
          previaRed: function () { return new T.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.26, depthWrite: false, depthTest: false, side: T.DoubleSide }); },
          linha: function () { return new T.LineBasicMaterial({ color: 0x1a6cb5, depthTest: false }); },
          separador: function () { return new T.LineBasicMaterial({ color: 0x5b6b7c }); }
        };
        mats[k] = M[k](); return mats[k];
      }
      function limpar(g) { g.children.slice().forEach(function (o) { g.remove(o); if (o.geometry) o.geometry.dispose(); }); }
      function semRaio(o) { o.raycast = function () {}; return o; }
      /* prisma do contorno (com furos) de y0 a y1; y1 == null = só a face (o realce) */
      function prisma(C, F, y0, y1) {
        var V2 = function (q) { return new T.Vector2(q[0], q[1]); }, todos = C.concat.apply(C.slice(), F), nC = C.length, pos = [];
        var tris = []; try { tris = T.ShapeUtils.triangulateShape(C.map(V2), F.map(function (f) { return f.map(V2); })); } catch (e) { tris = []; }
        function v(i, y) { pos.push(todos[i][0], y, todos[i][1]); }
        tris.forEach(function (t) { v(t[0], y0); v(t[1], y0); v(t[2], y0); if (y1 != null) { v(t[0], y1); v(t[2], y1); v(t[1], y1); } });
        if (y1 != null) {
          var aneis = [[0, nC]], ini = nC; F.forEach(function (f) { aneis.push([ini, f.length]); ini += f.length; });
          aneis.forEach(function (an) { for (var k = 0; k < an[1]; k++) { var i = an[0] + k, j = an[0] + (k + 1) % an[1]; v(i, y0); v(j, y0); v(j, y1); v(i, y0); v(j, y1); v(i, y1); } });
        }
        var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); return g;
      }
      function arestas(C, F, y0, y1) {
        var pos = [];
        [C].concat(F).forEach(function (L) {
          for (var i = 0; i < L.length; i++) {
            var a = L[i], b = L[(i + 1) % L.length];
            pos.push(a[0], y0, a[1], b[0], y0, b[1]);
            if (y1 != null) { pos.push(a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], a[0], y1, a[1]); }
          }
        });
        var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); return g;
      }
      var chaveP = null;
      var m3d = {
        ferramenta: function () { return edit && edit.on && (edit.sub === "ambiente" || edit.sub === "separador") ? edit.sub : null; },
        dica: function (sub) {
          if (sub === "ambiente") return "Ambiente: passe o mouse — a região fechada fica realçada — e clique dentro dela. Esc encerra.";
          if (sub === "separador") return "Separador de ambiente: clique as duas pontas da linha de separação. Esc encerra.";
          return "";
        },
        /* o volume (o volume interno) do selecionado, ou de todos com Ambientes no 3D */
        desenhar: function (st) {
          limpar(grpV);
          st = st || edit.estado;
          var todos = self.ver3d();
          arr(st && st.ambientes).forEach(function (a) {
            var c = a.calc || {}, sel = self._sel != null && String(a.id) === String(self._sel);
            if (c.estado !== "delimitado" || !(todos || sel)) return;
            var C = arr(c.contorno).map(function (q) { return [q.x, q.z]; }), F = arr(c.furos).map(function (f) { return f.map(function (q) { return [q.x, q.z]; }); });
            if (C.length < 3) return;
            var y0 = fin(c.base) ? c.base : 0, y1 = fin(c.topo) && c.topo > y0 ? c.topo : y0 + 0.1;
            /* o forro delimitador corta o volume (js/bimambiente.js, FORRO × VOLUME): o sólido vai até a altura equivalente */
            if (fin(c.alturaVolume) && c.alturaVolume > 0.01) y1 = Math.min(y1, y0 + c.alturaVolume);
            var m = semRaio(new T.Mesh(prisma(C, F, y0 + 0.002, y1), mat(sel ? "volSel" : "vol"))); m.renderOrder = 990; m.userData.ambienteId = String(a.id);
            grpV.add(m);
            if (sel) { var l = semRaio(new T.LineSegments(arestas(C, F, y0 + 0.002, y1), mat("aresta"))); l.renderOrder = 991; grpV.add(l); }
          });
          /* as linhas de separação de ambiente no piso do nível delas (sem elas, o separador some no 3D) */
          var NV = {}; self.niveisObra().forEach(function (n) { NV[String(n.id)] = n.elevacao; });
          var ps = [];
          arr(st && st.separadores).forEach(function (sp) {
            var y = (sp.nivelId != null && fin(NV[String(sp.nivelId)]) ? NV[String(sp.nivelId)] : (edit.base || 0)) + 0.012;
            ps.push(sp.x0, y, sp.z0, sp.x1, y, sp.z1);
          });
          if (ps.length) {
            var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(ps, 3));
            var ls = semRaio(new T.LineSegments(g, mat("separador"))); ls.renderOrder = 992; ls.name = "p2d-separadores"; grpV.add(ls);
          }
        },
        limparPrevia: function () { limpar(grpP); chaveP = null; },
        clique: function (sub, e, hit, p) {
          if (sub !== "ambiente" && sub !== "separador") return false;
          if (!p) { api.hint("Não achei o ponto no plano de trabalho: clique no chão do nível."); return true; }
          m3d.limparPrevia();
          self._colocar(sub, { x: p.x, z: p.z }, null);
          return true;
        },
        mover: function (e) {
          var f = m3d.ferramenta(); if (!f) return false;
          var agora = Date.now(); if (agora - self._ultMov < 50) return true; self._ultMov = agora;
          var p = api.planoPonto(e.clientX, e.clientY); if (!p) return true;
          var y = (edit.base || 0) + 0.02;
          if (f === "separador") {
            limpar(grpP); chaveP = null;
            if (self._sep) { var ln = semRaio(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(self._sep.x, y, self._sep.z), new T.Vector3(p.x, y, p.z)]), mat("linha"))); ln.renderOrder = 998; grpP.add(ln); }
            return true;
          }
          var nv = edit.b2 && edit.b2.nivel ? edit.b2.nivel : null, pr = null;
          try { pr = self.previa(edit.estado, { x: p.x, z: p.z }, nv ? nv.id : null, self.niveisObra(), edit.base); } catch (eP) { pr = null; }
          var ch = pr && pr.contorno.length ? pr.estado + "|" + pr.area + "|" + pr.contorno.length : null;
          if (ch === chaveP) return true;
          limpar(grpP); chaveP = ch;
          if (!ch) { api.hint("Ambiente: aqui não há região fechada (o ambiente ficaria não delimitado). Passe o mouse dentro de uma sala."); return true; }
          var mf = semRaio(new T.Mesh(prisma(pr.contorno, pr.furos, y, null), mat(pr.estado === "redundante" ? "previaRed" : "previa"))); mf.renderOrder = 997; grpP.add(mf);
          var la = semRaio(new T.LineSegments(arestas(pr.contorno, pr.furos, y, null), mat("linha"))); la.renderOrder = 998; grpP.add(la);
          api.hint(pr.estado === "redundante" ? "Esta região já tem ambiente: o novo seria redundante (aviso de ambiente redundante)." : "Ambiente: " + fmtArea(pr.area) + " (" + (pr.regraNome || "Na face da parede") + "). Clique para colocar.");
          return true;
        },
        aposRebuild: function (st) {
          if (self._sel && !arr(st && st.ambientes).some(function (a) { return String(a.id) === String(self._sel); })) self._sel = null;
          m3d.limparPrevia();
          m3d.desenhar(st);
          if (arr(st && st.ambientes).length || self._assArv) self._arvoreSeMudou();
          self._agendarPlantas();
        },
        aoSub: function (sub) {
          self._sep = null;
          self._limparPrevias();
          if (sub !== "ambiente" && sub !== "separador") {
            try { if (global.BimRibbon) { global.BimRibbon.setAtivo("ambiente", false); global.BimRibbon.setAtivo("separador-ambiente", false); } } catch (e) {}
          }
        }
      };
      this._m3d = m3d;
      return m3d;
    }
  };

  global.BimAmbienteUI = BimAmbienteUI;
  /* P6: o ramo "Ambientes" entra pelo registro de ramos do Navegador (js/bimnavegador.js), logo depois de Tabelas */
  try {
    if (global.BimNavegador) global.BimNavegador.registrar({ id: "ambientes", depois: "tabelas", montar: function () { return BimAmbienteUI.ativo() ? BimAmbienteUI.ramoNavegador() : null; } });
  } catch (eNav) {}
  if (typeof module !== "undefined" && module.exports) module.exports = BimAmbienteUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

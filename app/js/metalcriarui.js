/* =====================================================================
 * metalcriarui.js — a TELA de criar peças metálicas CLICANDO (prévia do
 * modelador, `?previa=modelador`). 12/10/2026.
 *
 * Pedido do Rogério: "seleciono o perfil que quero utilizar, clico no plano
 * onde quero que ele fique, tanto no 3D (depois posso reposicionar) quanto
 * na planta baixa. Na planta baixa posso ter linhas de referência para puxar
 * de onde eu quero, e a opção de jogar as coordenadas, mas quero liberdade
 * de criação […] E não vi a parte que fica mostrando os planos."
 *
 * QUEM FAZ O QUÊ
 *   js/metalcriar.js .... a CONTA (peça pelos pontos, encaixe, editar, eixos);
 *   este arquivo ........ as ferramentas do editor (subs met-pilar, met-viga,
 *                         met-diagonal, met-terca, met-chapa-cliques): mouse,
 *                         teclado, prévia da peça, o plano de trabalho VISÍVEL
 *                         (grade e nome), os níveis no 3D, as cotas entre
 *                         eixos, a barra de opções, as Propriedades da
 *                         ferramenta e da peça, Coordenadas… e Grade de eixos;
 *   js/bim.js ........... só ganchos (S._metc): pointermove, clique, Esc,
 *                         troca de ferramenta e o fim do refazer da cena;
 *   js/bimplantamodelar.js o clique na PLANTA chega pela mesma editClique
 *                         (o ponto já com encaixe — e com os eixos, que este
 *                         arquivo pede para as ferramentas metálicas).
 * Tudo o que muda o modelo vira op do editor (criar, metalAjustar, eixo):
 * Ctrl+Z desfaz, vai para o .opbim, para o quantitativo e para o peso.
 * As cores vêm dos tokens do css/app.css (tema claro e escuro); o desenho
 * da barra e das caixas está no css/metalcriar.css.
 * ===================================================================== */
(function (global) {
  "use strict";

  var SUBS = { "met-pilar": "pilar", "met-viga": "viga", "met-diagonal": "diagonal", "met-terca": "terca", "met-chapa-cliques": "chapa" };
  var SUB_DE = { pilar: "met-pilar", viga: "met-viga", diagonal: "met-diagonal", terca: "met-terca", chapa: "met-chapa-cliques" };
  var CHAVE = "orcapro:metal:criar:v1";
  var ACOS_PERFIL = ["ASTM A572 Gr.50", "ASTM A36", "ASTM A992", "ASTM A500 Gr.B", "SAE 1020", "ZAR 345", "ZAR 230"];
  var ACOS_CHAPA = ["ASTM A36", "ASTM A572 Gr.50", "SAE 1020", "SAE 1045", "Inox AISI 304"];

  function MC() { return global.MetalCriar || null; }
  function BM() { return global.BimMetal || null; }
  function B() { return global.BIM || null; }
  function Pl() { return global.BimPlano || null; }
  function AU() { return global.BimArqUI || null; }
  function BB() { return global.BimBarraOpcoes || null; }
  function PR() { return global.BimPrecisao || null; }
  function PM() { return global.BimPlantaModelar || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function sinal(v) { return (v >= 0 ? "+" : "−") + br(Math.abs(v)); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function lerNum(t) { var R = PR(); return R && R.lerNumero ? R.lerNumero(t) : num(t, null); }
  /* a cor de um TOKEN do css/app.css (o tema escuro troca o valor) */
  function token(nome, reserva) {
    try { var v = global.getComputedStyle(global.document.documentElement).getPropertyValue(nome).trim(); if (v) return v; } catch (e) {}
    return reserva;
  }

  /* ------------------------------------------------------- configuração
   * PREFERÊNCIA do aparelho (localStorage com try/catch): a última escolha de
   * cada ferramenta. Sem armazenamento, o padrão — nunca trava a ferramenta. */
  function padrao() {
    var F = MC() ? MC().FERRAMENTAS : {};
    function f(k) { return F[k] || {}; }
    return {
      pilar: { cat: f("pilar").perfil || "W250X32.7", giro: 0, just: "centro", lado: "centro", espelhar: false, aco: "ASTM A572 Gr.50", nivelBase: "", deslBase: 0, topo: "acima", deslTopo: 0, altura: 0 },
      viga: { cat: f("viga").perfil || "W250X25.3", giro: 0, just: "topo", lado: "centro", espelhar: false, aco: "ASTM A572 Gr.50", ref: "acima", desl: 0, encadear: false,
              /* VIGAS ENTRE PILARES (15/10/2026, js/metalvigaspilares.js): a linha que atravessa pilares */
              vpModo: "auto", vpTopo: "ferramenta", vpMax: 12, vpEmenda: "pilar" },
      diagonal: { cat: f("diagonal").perfil || "L51X51X4.8", giro: 0, just: "centro", lado: "centro", espelhar: false, aco: "ASTM A36", ref: "atual", desl: 0, encadear: false },
      terca: { cat: f("terca").perfil || "Ue 150 x 60 x 20 x 3,00", giro: 0, just: "base", lado: "centro", espelhar: false, aco: "ASTM A36", ref: "acima", desl: 0, encadear: false },
      chapa: { t: 0.0125, lado: "acima", aco: "ASTM A36", ref: "atual", desl: 0, naFace: true },
      encaixe: true, cotasEixos: true, niveis3d: false
    };
  }
  function mesclar(p, o) {
    if (!o || typeof o !== "object") return p;
    Object.keys(p).forEach(function (k) {
      if (p[k] && typeof p[k] === "object") { if (o[k] && typeof o[k] === "object") Object.keys(p[k]).forEach(function (kk) { if (o[k][kk] != null && typeof o[k][kk] === typeof p[k][kk]) p[k][kk] = o[k][kk]; }); }
      else if (o[k] != null && typeof o[k] === typeof p[k]) p[k] = o[k];
    });
    return p;
  }
  var cfg = null;
  function C() {
    if (!cfg) { var o = null; try { o = JSON.parse(global.localStorage.getItem(CHAVE) || "null"); } catch (e) { o = null; } cfg = mesclar(padrao(), o); }
    return cfg;
  }
  function guardar() { try { global.localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch (e) { /* sem armazenamento: fica na memória */ } }
  /* o perfil da ferramenta (o guardado pode ter saído do catálogo: volta ao padrão) */
  function catDe(ferr) { var c = C()[ferr], M = MC(); var n = c && c.cat && M ? M.perfilCat(c.cat) : null; return n || (M ? M.perfilCat(padrao()[ferr].cat) : null); }

  /* ------------------------------------------------------- níveis */
  function niveis() {
    try { var U = AU(); return U && U.niveis ? U.niveis().map(function (n) { return { id: String(n.id), nome: n.nome, elevacao: +n.elevacao || 0, peDireito: n.peDireito != null ? +n.peDireito : null }; }) : []; } catch (e) { return []; }
  }
  function nivelAtivo() {
    try { var U = AU(), n = U && U.nivelAtivo ? U.nivelAtivo() : null; return n ? { id: String(n.id), nome: n.nome, elevacao: +n.elevacao || 0, peDireito: n.peDireito != null ? +n.peDireito : null } : null; } catch (e) { return null; }
  }
  function nivelPorId(id) { return niveis().filter(function (n) { return n.id === String(id); })[0] || null; }
  function acimaDe(n) { if (!n) return null; return niveis().filter(function (x) { return x.elevacao > n.elevacao + 1e-6; }).sort(function (a, b) { return a.elevacao - b.elevacao; })[0] || null; }
  function baseModelo() { var b = B(); try { return b && b.editarBase ? b.editarBase() : 0; } catch (e) { return 0; } }
  function peDireito(n) { return n && n.peDireito > 0 ? n.peDireito : 3; }
  /* a cota da linha de uma barra/chapa: 'atual' | 'acima' | id do nível, + deslocamento */
  /* S8: a viga numa planta ESTRUTURAL nasce com o topo no nível da vista (a regra mora no
     js/bimarqui.js, a mesma da viga de concreto: Restrições › Topo da viga, por tipo de vista) */
  function refEf(ferr) {
    var c = C()[ferr];
    if (ferr === "viga") { try { var U = AU(); if (U && U.vigaTopo && U.vigaTopo() === "nivel") return "atual"; } catch (e) {} }
    return c.ref;
  }
  function cotaRef(ferr) {
    var c = C()[ferr], at = nivelAtivo(), d = num(c.desl, 0), ref = refEf(ferr);
    if (!at) return baseModelo() + (ref === "acima" ? 3 : 0) + d;
    if (ref === "acima") { var ac = acimaDe(at); return (ac ? ac.elevacao : at.elevacao + peDireito(at)) + d; }
    if (ref && ref !== "atual") { var n = nivelPorId(ref); if (n) return n.elevacao + d; }
    return at.elevacao + d;
  }
  function infoNivelRef(ferr) { var c = C()[ferr], at = nivelAtivo(); return { ref: refEf(ferr), nivel: at ? at.id : null, desl: num(c.desl, 0) }; }
  function cotasPilar() {
    var c = C().pilar, at = nivelAtivo(), nb = c.nivelBase ? (nivelPorId(c.nivelBase) || at) : at;
    var base = (nb ? nb.elevacao : baseModelo()) + num(c.deslBase, 0), topo, h = c.altura > 0 ? c.altura : peDireito(nb);
    if (!nb || c.topo === "altura") topo = base + h;
    else if (c.topo === "acima") { var ac = acimaDe(nb); topo = ac ? ac.elevacao + num(c.deslTopo, 0) : base + h; }
    else { var nt = nivelPorId(c.topo); topo = nt ? nt.elevacao + num(c.deslTopo, 0) : base + h; }
    return { base: base, topo: topo, nivel: { base: nb ? nb.id : null, deslBase: num(c.deslBase, 0), topo: c.topo, deslTopo: num(c.deslTopo, 0) } };
  }
  function nomeCota(y) {
    var n = niveis().filter(function (x) { return Math.abs(x.elevacao - y) < 1e-4; })[0];
    if (n) return n.nome + " (" + sinal(y) + " m)";
    var at = nivelAtivo(); if (at) return at.nome + " " + sinal(y - at.elevacao) + " m (cota " + sinal(y) + ")";
    return "cota " + sinal(y) + " m";
  }

  /* ------------------------------------------------------- plano de trabalho
   * O plano DEFINIDO (js/bimplano.js: face, vertical por dois pontos, nível)
   * manda; sem ele, o plano é HORIZONTAL na cota da ferramenta: a base do
   * pilar, a linha da viga (o nível de referência + deslocamento). */
  function horizontal(y) { return { o: [0, y, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0], horizontal: true, y: y }; }
  function planoFerr(ferr) {
    var P = Pl(), p = P && P.ativo ? P.ativo() : null;
    if (p) { var r = { o: p.o, u: p.u, v: p.v, n: p.n, horizontal: !!p.horizontal, y: p.horizontal ? p.o[1] : null, definido: true, rotulo: p.rotulo }; return r; }
    var y = ferr === "pilar" ? cotasPilar().base : cotaRef(ferr || "viga"), h = horizontal(y);
    h.rotulo = nomeCota(y);
    return h;
  }

  /* ------------------------------------------------------- a peça pelos pontos */
  function construir(ferr, pts, cur, plano) {
    var M = MC(), c = C()[ferr]; if (!M) return { erro: "O motor de criar (js/metalcriar.js) não carregou." };
    if (ferr === "pilar") {
      var cp = cotasPilar();
      return M.pilar(cur, { cat: catDe("pilar"), giro: c.giro, just: c.just, lado: c.lado, espelhar: c.espelhar, aco: c.aco, base: cp.base, topo: cp.topo, nivel: cp.nivel });
    }
    if (!pts.length) return null;
    if (ferr === "chapa") return M.chapa(pts[0], cur, plano, { t: c.t, lado: c.lado, aco: c.aco, nivel: infoNivelRef("chapa") });
    return M.barra(pts[0], cur, { ferr: ferr, cat: catDe(ferr), giro: c.giro, just: c.just, lado: c.lado, espelhar: c.espelhar, aco: c.aco, nivel: infoNivelRef(ferr) });
  }
  /* VIGAS ENTRE PILARES: a linha da Viga que atravessa 2+ pilares (com pilar no miolo) → o plano (null = a viga de sempre) */
  function planoVP(a, b) {
    var MV = global.MetalVigasPilares, c = C().viga; if (!MV || !a || !b || !previa()) return null;
    try { return MV.planoLinha(estado().caixas, a, b, { cat: catDe("viga"), modo: c.vpModo, topo: c.vpTopo, max: c.vpMax, emenda: c.vpEmenda }); } catch (e) { return null; }
  }
  var MODO_VP = { auto: "Dividir nos pilares", continua: "Contínua sobre os pilares", nao: "Não dividir" };
  function novoId() { var U = global.BimMetalUI; return U && U.novoId ? U.novoId() : "met-" + Date.now().toString(36) + "-" + Math.round(Math.random() * 1e6).toString(36); }
  function enviarLote(ops, pedido) {
    var b = B(); if (!b || !b.editarLote || !ops.length) return false;
    return !!b.editarLote({ op: "lote", id: "mcr-" + Date.now().toString(36) + Math.round(Math.random() * 1e4).toString(36), origem: "metal-criar", pedido: String(pedido || "").slice(0, 300), ops: ops });
  }
  function estado() { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : { caixas: [], eixos: [] }; } catch (e2) { return { caixas: [], eixos: [] }; } }
  function caixaDe(id) { return (estado().caixas || []).filter(function (c) { return String(c.id) === String(id); })[0] || null; }
  function descricao(c) {
    var m = c.metal || {};
    if (m.kind === "chapa") return "Chapa " + Math.round((m.dim ? m.dim.L : 0) * 1000) + " × " + Math.round((m.dim ? m.dim.B : 0) * 1000) + " × " + br(m.t * 1000, 1) + " mm";
    return m.papel + " " + (m.perfilRotulo || (m.perfil && m.perfil.cat) || "") + " · " + br(m.L) + " m";
  }

  var ROT = { pilar: "Pilar", viga: "Viga", diagonal: "Diagonal", terca: "Terça", chapa: "Chapa" };
  var DICA = {
    pilar: "clique onde o pilar nasce (encaixa nos eixos, nas pontas e nos meios). Coordenadas… digita o ponto.",
    viga: "clique o início e o fim (encaixe nos pilares, eixos e pontas); digite o comprimento e Tab o ângulo.",
    diagonal: "clique as duas pontas (encaixa nas pontas das barras, inclusive em cotas diferentes).",
    terca: "clique o início e o fim; a base da terça fica na linha (apoia em cima da viga).",
    chapa: "clique dois cantos opostos — no plano de trabalho ou numa face de uma peça."
  };

  var MetalCriarUI = {
    SUBS: SUBS, SUB_DE: SUB_DE, ACOS_PERFIL: ACOS_PERFIL, ACOS_CHAPA: ACOS_CHAPA,
    cfg: function () { return C(); },
    guardar: guardar,
    ferramentaDe: function (sub) { return SUBS[sub] || null; },
    /* o js/bimplantamodelar.js pergunta: a ferramenta armada quer os EIXOS da grade no encaixe da planta? */
    querEixos: function (sub) { return !!SUBS[sub]; },
    planoFerr: planoFerr, cotasPilar: cotasPilar, cotaRef: cotaRef, construir: construir, nomeCota: nomeCota,

    /* ------------------------------------------------- fita */
    registrar: function (reg) {
      if (!previa()) return false;
      var self = this, BBo = BB();
      if (BBo && BBo.declarar) Object.keys(SUBS).forEach(function (s) { var f = SUBS[s]; BBo.declarar(s, { rotulo: ROT[f], traco: f !== "pilar" && f !== "chapa" }); });
      Object.keys(SUBS).forEach(function (s) {
        reg[s] = function (e) {
          var b = B(); if (!b || !b.editarArmar) return false;
          if (e && e.ligado === false) { b.editarArmar(null); status("Ferramenta desligada."); return true; }
          return self.armar(SUBS[s]);
        };
      });
      reg["met-plano"] = function () { self.dialogoPlano(); return true; };
      reg["met-eixo"] = function () { var b = B(); if (b && b.editarArmar) b.editarArmar("eixo"); status("Eixo: clique as duas pontas (número na vertical, letra na horizontal). Grade de eixos cria tudo de uma vez."); return true; };
      reg["met-grade-eixos"] = function () { self.dialogoGrade(); return true; };
      reg["met-niveis-3d"] = function (e) { C().niveis3d = e && e.ligado != null ? !!e.ligado : !C().niveis3d; guardar(); self._redesenhar(); status(C().niveis3d ? "Níveis no 3D: cada nível é um plano com o nome e a cota." : "Níveis no 3D desligados."); return true; };
      reg["met-cotas-eixos"] = function (e) { C().cotasEixos = e && e.ligado != null ? !!e.ligado : !C().cotasEixos; guardar(); self._redesenhar(); self._atualizarPlantas(); status(C().cotasEixos ? "Cotas entre os eixos ligadas (3D e planta)." : "Cotas entre os eixos desligadas."); return true; };
      try { var R = global.BimRibbon; if (R) { Object.keys(SUBS).forEach(function (s) { if (R._EXCLUSIVOS.indexOf(s) < 0) R._EXCLUSIVOS.push(s); }); if (C().niveis3d) R.setAtivo("met-niveis-3d", true); if (C().cotasEixos) R.setAtivo("met-cotas-eixos", true); } } catch (eR) {}
      return true;
    },
    armar: function (ferr) {
      var b = B(); if (!b || !b.editarArmar) return false;
      var ok = b.editarArmar(SUB_DE[ferr]);
      return ok !== false;
    },

    /* ------------------------------------------------- planta: cotas dos eixos (js/bim2dui.js) */
    cotasEixosPlanta: function () {
      if (!previa() || !C().cotasEixos || !MC()) return [];
      return MC().cotasEixos(estado().eixos || []).map(function (c) { return { a: c.a, b: c.b, off: 0, valor: c.valor }; });
    },
    _atualizarPlantas: function () {
      try { var D = global.Bim2D; if (D && D.plantasAbertas) D.plantasAbertas().forEach(function (id) { D.atualizar(id); }); } catch (e) {}
    },

    /* ------------------------------------------------- PROPRIEDADES da ferramenta */
    _busca: { ferr: null, texto: "" },
    _opcoesPerfil: function (ferr, texto, atual) {
      var M = MC(); if (!M) return [];
      var L = texto ? M.buscarPerfis(texto, { limite: 60 }) : [], vistos = {}, out = [];
      if (atual) { out.push({ id: atual, rotulo: atual + " (atual)" }); vistos[atual] = 1; }
      if (!texto) {
        /* sem busca: os perfis mais usados de cada tipo, para não abrir uma lista de 5 mil */
        ["W150X13", "W200X15", "W200X26.6", "W250X25.3", "W250X32.7", "W310X38.7", "W360X44", "C150X12.2", "C200X17.1", "L51X51X4.8", "L64X64X6.4", "L76X76X6.4",
         "Ue 150 x 60 x 20 x 3,00", "Ue 200 x 75 x 25 x 3,00", "HSS101.6X101.6X6.4", "HSS152.4X152.4X6.4", "HSS101.6X6.4"].forEach(function (n) { var c = M.perfilCat(n); if (c) L.push({ nome: c, rotuloSerie: "Mais usados" }); });
      }
      L.forEach(function (it) { if (vistos[it.nome]) return; vistos[it.nome] = 1; out.push({ id: it.nome, rotulo: it.nome + (it.massa ? " — " + br(it.massa, 1) + " kg/m" : ""), grupo: it.rotuloSerie }); });
      return out;
    },
    _secPerfil: function (ferr, pre, atual, busca) {
      var M = MC(), A = global.PerfisAco, info = atual && A ? A.obter(atual) : null, ps = [];
      ps.push({ id: pre + "busca", rotulo: "Buscar perfil", tipo: "texto", valor: busca || "", motivo: "Nome, série ou fabricante: w250, ue 150, gerdau, tubo 100, cantoneira" });
      ps.push({ id: pre + "cat", rotulo: "Perfil", tipo: "lista", valor: atual || "", opcoes: this._opcoesPerfil(ferr, busca, atual) });
      var s = M && atual ? M.dimSecao(global.PerfisAco.paraPerfil(atual)) : null;
      ps.push({ id: pre + "info", rotulo: "Seção", leitura: true, valor: s ? Math.round(s.alt * 1000) + " × " + Math.round(s.larg * 1000) + " mm" + (info && fin(info.massa) ? " · " + br(info.massa, 1) + " kg/m" : "") : "—" });
      if (info && info.fabricante) ps.push({ id: pre + "fab", rotulo: "Fonte", leitura: true, valor: info.fabricante });
      return { nome: "Perfil", params: ps };
    },
    _opcoesNivel: function (comAcima, comAltura) {
      var L = niveis(), op = [{ id: "atual", rotulo: "Nível atual" }];
      if (comAcima) op.push({ id: "acima", rotulo: "Nível acima" });
      if (comAltura) op.push({ id: "altura", rotulo: "Altura não conectada" });
      return op.concat(L.map(function (n) { return { id: n.id, rotulo: n.nome + " (" + sinal(n.elevacao) + " m)" }; }));
    },
    esquemaFerramenta: function (ferr) {
      var self = this, c = C()[ferr], secoes = [], pre = "mcrf:";
      if (ferr !== "chapa") {
        secoes.push(this._secPerfil(ferr, pre, catDe(ferr), this._busca.ferr === ferr ? this._busca.texto : ""));
        secoes.push({ nome: "Posição da seção", params: [
          { id: pre + "giro", rotulo: "Giro", unidade: "°", tipo: "numero", passo: "15", valor: c.giro },
          { id: pre + "just", rotulo: ferr === "pilar" ? "Ponto na altura da seção (d)" : "Justificação vertical", tipo: "lista", valor: c.just, opcoes: [{ id: "topo", rotulo: ferr === "pilar" ? "Face +d" : "Topo" }, { id: "centro", rotulo: "Centro" }, { id: "base", rotulo: ferr === "pilar" ? "Face −d" : "Base" }] },
          { id: pre + "lado", rotulo: ferr === "pilar" ? "Ponto na largura (bf)" : "Justificação lateral", tipo: "lista", valor: c.lado, opcoes: [{ id: "esquerda", rotulo: ferr === "pilar" ? "Face −b" : "Esquerda" }, { id: "centro", rotulo: "Centro" }, { id: "direita", rotulo: ferr === "pilar" ? "Face +b" : "Direita" }] },
          { id: pre + "espelhar", rotulo: "Espelhar a seção", tipo: "sim-nao", valor: !!c.espelhar }
        ] });
      } else {
        secoes.push({ nome: "Chapa", params: [
          { id: pre + "t", rotulo: "Espessura", unidade: "mm", tipo: "numero", passo: "0.5", valor: Math.round(c.t * 10000) / 10 },
          { id: pre + "ladoC", rotulo: "Espessura para", tipo: "lista", valor: c.lado, opcoes: [{ id: "acima", rotulo: "Fora do plano (normal)" }, { id: "abaixo", rotulo: "Dentro do plano" }, { id: "centro", rotulo: "Centrada no plano" }] },
          { id: pre + "naFace", rotulo: "1º clique numa face: a chapa vai na face", tipo: "sim-nao", valor: c.naFace !== false }
        ] });
      }
      var L = niveis(), rs = [];
      if (ferr === "pilar") {
        var cp = cotasPilar();
        if (L.length) rs.push({ id: pre + "nivelBase", rotulo: "Nível base", tipo: "lista", valor: c.nivelBase || "atual", opcoes: this._opcoesNivel(false, false) });
        rs.push({ id: pre + "deslBase", rotulo: "Deslocamento da base", unidade: "m", tipo: "numero", passo: "0.05", valor: c.deslBase });
        if (L.length) rs.push({ id: pre + "topo", rotulo: "Topo", tipo: "lista", valor: c.topo, opcoes: this._opcoesNivel(true, true).filter(function (o) { return o.id !== "atual"; }) });
        if (!L.length || c.topo === "altura") rs.push({ id: pre + "altura", rotulo: "Altura", unidade: "m", tipo: "numero", passo: "0.05", valor: c.altura > 0 ? c.altura : br(cp.topo - cp.base) });
        else rs.push({ id: pre + "deslTopo", rotulo: "Deslocamento do topo", unidade: "m", tipo: "numero", passo: "0.05", valor: c.deslTopo });
        rs.push({ id: pre + "cotas", rotulo: "Base → topo", leitura: true, valor: sinal(cp.base) + " → " + sinal(cp.topo) + " m (" + br(cp.topo - cp.base) + " m)" });
      } else {
        /* S8: a viga mostra a regra do topo desta vista (planta estrutural: no nível da vista) */
        var U8 = AU(), vt8 = ferr === "viga" && U8 && U8.vigaTopo ? U8.vigaTopo() : null;
        if (vt8) rs.push({ id: pre + "vigaTopo", rotulo: "Topo da viga (" + (U8.contextoVista() === "estrutural" ? "planta estrutural" : "planta de piso e 3D") + ")", tipo: "lista", valor: vt8, opcoes: Object.keys(U8.VIGA_TOPO).map(function (k) { return { id: k, rotulo: U8.VIGA_TOPO[k] }; }) });
        if (L.length && vt8 === "nivel") rs.push({ id: pre + "refNivel", rotulo: "Nível de referência", leitura: true, valor: (nivelAtivo() || {}).nome + " (o nível da vista)" });
        else if (L.length) rs.push({ id: pre + "ref", rotulo: ferr === "chapa" || ferr === "diagonal" ? "Nível" : "Nível de referência", tipo: "lista", valor: c.ref, opcoes: this._opcoesNivel(true, false) });
        rs.push({ id: pre + "desl", rotulo: ferr === "viga" ? "Deslocamento do topo" : "Deslocamento", unidade: "m", tipo: "numero", passo: "0.05", valor: c.desl });
        rs.push({ id: pre + "cotaLinha", rotulo: ferr === "viga" ? "Topo da viga na cota" : "Linha na cota", leitura: true, valor: sinal(cotaRef(ferr)) + " m" });
      }
      secoes.push({ nome: "Restrições", params: rs });
      if (ferr === "viga") secoes.push({ nome: "Entre pilares", params: [
        { id: pre + "vpModo", rotulo: "Linha que atravessa pilares", tipo: "lista", valor: c.vpModo, opcoes: Object.keys(MODO_VP).map(function (k) { return { id: k, rotulo: MODO_VP[k] }; }) },
        { id: pre + "vpTopo", rotulo: "Topo da viga", tipo: "lista", valor: c.vpTopo, opcoes: [{ id: "ferramenta", rotulo: "Na cota da ferramenta" }, { id: "pilar", rotulo: "No topo do pilar" }] },
        { id: pre + "vpMax", rotulo: "Comprimento máximo da barra", unidade: "m", tipo: "numero", passo: "0.5", valor: c.vpMax, motivo: "12 m = barra comercial do laminado; 6 m também é comum" },
        { id: pre + "vpEmenda", rotulo: "Emenda (passou do máximo)", tipo: "lista", valor: c.vpEmenda, opcoes: [{ id: "pilar", rotulo: "Sobre o pilar (a viga deixa de ser contínua)" }, { id: "continuidade", rotulo: "De continuidade (0,2·L do apoio, talas)" }] }
      ] });
      /* LIGAÇÃO AO LANÇAR (15/10/2026, js/metalligautoui.js): por OBRA */
      var LAc = global.MetalLigAutoUI && global.MetalLigAutoUI.cfg ? global.MetalLigAutoUI.cfg() : null;
      if (ferr === "viga" && LAc) secoes.push({ nome: "Ligações", params: [
        { id: pre + "ligAuto", rotulo: "Ligações ao lançar", tipo: "lista", valor: LAc.aoLancar, opcoes: [{ id: "parafusada", rotulo: "Parafusada" }, { id: "soldada", rotulo: "Soldada" }, { id: "nao", rotulo: "Não colocar" }], motivo: "a viga que encosta num pilar ou noutra viga já sai com a ligação (mesa × alma), pré-dimensionada pelo peso próprio e A CONFIRMAR NO CÁLCULO — vale para esta obra" }
      ] });
      var pl = planoFerr(ferr);
      secoes.push({ nome: "Plano de trabalho", params: [
        { id: pre + "plano", rotulo: "Plano", leitura: true, valor: (pl.definido ? pl.rotulo : "horizontal · " + pl.rotulo) },
        { id: pre + "planoTrocar", rotulo: "Trocar o plano", tipo: "botao", rotuloBotao: "Trocar…", fn: function () { self.dialogoPlano(); } }
      ] });
      secoes.push({ nome: "Material", params: [{ id: pre + "aco", rotulo: "Aço", tipo: "lista", valor: c.aco, opcoes: (ferr === "chapa" ? ACOS_CHAPA : ACOS_PERFIL).map(function (a) { return { id: a, rotulo: a }; }) }] });
      secoes.push({ nome: "Inserir", params: [{ id: pre + "coord", rotulo: "Ponto por coordenadas", tipo: "botao", rotuloBotao: "Coordenadas…", fn: function () { self.dialogoCoordenadas(); } }] });
      return { titulo: ROT[ferr] + " — " + (ferr === "chapa" ? "chapa por dois cantos" : "perfil do catálogo"), icone: ferr === "pilar" ? "pilar" : "estrutura", semEditarTipo: true, secoes: secoes,
               onMudar: function (pid, v) { self.mudarFerramenta(ferr, pid, v); return self.esquemaFerramenta(ferr); } };
    },
    mudarFerramenta: function (ferr, pid, v) {
      var c = C()[ferr], k = String(pid).replace(/^mcrf:/, "");
      if (k === "busca") { this._busca = { ferr: ferr, texto: String(v || "").slice(0, 60) }; return; }
      if (k === "cat") { var n = MC() ? MC().perfilCat(v) : null; if (n) { c.cat = n; this._busca = { ferr: null, texto: "" }; status(ROT[ferr] + ": perfil " + n + "."); } }
      else if (k === "giro") { var g = num(v, NaN); if (fin(g)) c.giro = Math.round((((g % 360) + 540) % 360 - 180) * 1e4) / 1e4; }   /* −180 a 180 */
      else if (k === "just" || k === "lado") c[k] = String(v);
      else if (k === "ladoC") c.lado = String(v);
      else if (k === "espelhar" || k === "naFace") c[k] = !!v;
      else if (k === "t") { var t = num(v, NaN); if (t >= 0.5 && t <= 300) c.t = t / 1000; }
      else if (k === "nivelBase") c.nivelBase = v === "atual" ? "" : String(v);
      else if (k === "topo") c.topo = String(v);
      else if (k === "ref") c.ref = String(v);
      else if (k === "vigaTopo") { var U9 = AU(); if (U9 && U9.definirVigaTopo) U9.definirVigaTopo(String(v)); }   /* S8 */
      else if (k === "deslBase" || k === "deslTopo" || k === "desl") { var d = num(v, NaN); if (fin(d) && Math.abs(d) <= 200) c[k] = d; }
      else if (k === "altura") { var h = num(v, NaN); if (h > 0.05 && h <= 60) c.altura = h; }
      else if (k === "aco") c.aco = String(v);
      else if (k === "vpModo") { if (MODO_VP[String(v)]) c.vpModo = String(v); }
      else if (k === "vpTopo") c.vpTopo = v === "pilar" ? "pilar" : "ferramenta";
      else if (k === "vpMax") { var mx = num(v, NaN); if (mx >= 1 && mx <= 60) c.vpMax = Math.round(mx * 100) / 100; }
      else if (k === "vpEmenda") c.vpEmenda = v === "continuidade" ? "continuidade" : "pilar";
      else if (k === "ligAuto") { if (global.MetalLigAutoUI) global.MetalLigAutoUI.definir("aoLancar", String(v)); }
      guardar();
      if (this._3d) this._3d.aoMudarCfg();
      this.pintarBarra();
    },

    /* ------------------------------------------------- PROPRIEDADES da peça metálica (gancho em Gestao._bimPropsPeca) */
    ehPecaMetal: function (uid) {
      if (!previa() || !/^edit:/.test(String(uid || ""))) return false;
      var c = caixaDe(String(uid).slice(5)); return !!(c && c.tipo === "metal" && c.metal && (c.metal.kind === "perfil" || c.metal.kind === "chapa"));
    },
    /* SELECIONAR INSTÂNCIAS (14/10/2026, js/bimselinst.js): as peças metálicas selecionadas junto com esta */
    _selMetal: function (id) {
      var b = B(), sel = [];
      try { sel = b && b.precisao && b.precisao() ? b.precisao().selecao().map(String) : []; } catch (e) { sel = []; }
      if (sel.indexOf(String(id)) < 0) return [];
      return sel.filter(function (x) { var c = caixaDe(x); return !!(c && c.tipo === "metal" && c.metal && (c.metal.kind === "perfil" || c.metal.kind === "chapa")); });
    },
    /* PROPRIEDADES EM LOTE: "N selecionados"; o que é igual em todas aparece, o diferente fica ‹vários›;
       mudar aplica a todas num lote só (um Ctrl+Z) — perfil (troca de perfil em lote), giro e aço */
    propsLote: function (info, G, ids) {
      var self = this, M = MC(), cs = ids.map(caixaDe).filter(Boolean), pre = "mcrl:", VAR = "‹vários›";
      var ro = function (k, r, v) { return { id: pre + k, rotulo: r, leitura: true, valor: v == null || v === "" ? "—" : v }; };
      function comum(f) { var v0 = f(cs[0]); return cs.every(function (c) { return f(c) === v0; }) ? v0 : null; }
      var kind = comum(function (c) { return c.metal.kind; }), papeis = {}, massa = 0;
      cs.forEach(function (c) { papeis[c.metal.papel] = (papeis[c.metal.papel] || 0) + 1; massa += num(c.massa, 0); });
      var sec = [{ nome: "Seleção", params: [ro("n", "Selecionados", cs.length + " peças metálicas"), ro("papeis", "Peças", Object.keys(papeis).map(function (k) { return papeis[k] + " × " + k; }).join(" · ")), ro("massa", "Peso total", br(massa, 2) + " kg")] }];
      if (kind === "perfil") {
        var cat = comum(function (c) { return (c.metal.perfil && c.metal.perfil.cat) || ""; });
        var sp = this._secPerfil(null, pre, cat || "", this._buscaLote || "");
        if (!cat) {
          sp.params.forEach(function (p) { if (p.id === pre + "cat") { p.opcoes = [{ id: "", rotulo: VAR }].concat(p.opcoes || []); p.valor = ""; } });
          sp.params = sp.params.filter(function (p) { return p.id !== pre + "info" && p.id !== pre + "fab"; });
        }
        sec.push(sp);
        var giro = comum(function (c) { return Math.round(M.linhaAtual(c).giro * 100) / 100; });
        sec.push({ nome: "Posição da seção", params: [{ id: pre + "giro", rotulo: "Giro", unidade: "°", tipo: "numero", passo: "15", valor: giro == null ? "" : giro, motivo: giro == null ? VAR : "" }] });
      }
      var aco = comum(function (c) { return c.metal.aco; }), base = kind === "chapa" ? ACOS_CHAPA : ACOS_PERFIL, lis = base.slice();
      cs.forEach(function (c) { if (c.metal.aco && lis.indexOf(c.metal.aco) < 0) lis.push(c.metal.aco); });
      sec.push({ nome: "Material", params: [{ id: pre + "aco", rotulo: "Aço", tipo: "lista", valor: aco || "", opcoes: (aco ? [] : [{ id: "", rotulo: VAR }]).concat(lis.map(function (a) { return { id: a, rotulo: a }; })) }] });
      /* ELEVAR (js/bimelevarui.js): a mesma seção, com ‹vários› e o mesmo delta para todas (um Ctrl+Z) */
      try { var sElL = global.BimElevarUI && global.BimElevarUI.secao ? global.BimElevarUI.secao(ids) : null; if (sElL) sec.push(sElL); } catch (eEl) {}
      return { daPeca: true, uid: info.uid, semEditarTipo: true, lote: cs.length, titulo: cs.length + " selecionados", icone: "estrutura", secoes: sec,
        onMudar: function (pid, v) { self.mudarLote(ids, pid, v); return G && G._bimPropsPeca ? G._bimPropsPeca(info) : self.propsPeca(info, G); } };
    },
    _buscaLote: null,
    mudarLote: function (ids, pid, v) {
      if (/^elev:/.test(String(pid)) && global.BimElevarUI) return global.BimElevarUI.mudarCampo(ids, pid, v).ok;   /* ELEVAR */
      var M = MC(), k = String(pid).replace(/^mcrl:/, ""), mud = {};
      if (!M) return false;
      if (k === "busca") { this._buscaLote = String(v || "").slice(0, 60); return true; }
      if (k === "cat") { if (!v) return false; mud.cat = String(v); }
      else if (k === "aco") { if (!v) return false; mud.aco = String(v); }
      else if (k === "giro") { var n = num(v, NaN); if (!fin(n)) { status("Valor inválido."); return false; } mud.giro = n; }
      else return false;
      var ops = [], erros = 0;
      ids.forEach(function (id) {
        var c = caixaDe(id); if (!c || !c.metal) return;
        if ((mud.cat != null || mud.giro != null) && c.metal.kind !== "perfil") return;
        var r = M.editar(c, mud); if (!r || r.erro) { erros++; return; }
        ops.push(M.opAjustar(id, r.caixa));
      });
      if (!ops.length) { status("Nada mudou" + (erros ? " (" + erros + " peça(s) recusaram a mudança)" : "") + "."); return false; }
      if (!enviarLote(ops, "Propriedades em lote — " + ops.length + " peças metálicas")) { status("O editor recusou a mudança."); return false; }
      if (k === "cat") this._buscaLote = null;
      status(ops.length + " peças metálicas atualizadas (Ctrl+Z desfaz de uma vez)" + (erros ? "; " + erros + " recusaram" : "") + ".");
      return true;
    },
    propsPeca: function (info, G) {
      var self = this, id = String(info.uid).slice(5), c = caixaDe(id), M = MC(), BMe = BM();
      if (!c || !M || !BMe) return null;
      var selM = this._selMetal(id);
      if (selM.length > 1) return this.propsLote(info, G, selM);
      var m = c.metal, pre = "mcrp:", sec = [], ro = function (k, r, v) { return { id: pre + k, rotulo: r, leitura: true, valor: v == null || v === "" ? "—" : v }; };
      var lig = (m.lig ? 1 : 0) + ((c.metalFuros || []).length ? 1 : 0) + (estado().caixas || []).filter(function (x) { return x.metal && String(x.metal.soldadaEm) === String(id); }).length;
      sec.push({ nome: "Identidade", params: [ro("papel", "Peça", m.papel), ro("marca", "Marca", c.marca || "(sem marca — Fabricação › Numerar)"), ro("id", "Identificador", id)]
        .concat(lig ? [ro("lig", "Ligações", "esta peça tem ligação: ao trocar perfil ou medida, as chapas e os furos da ligação NÃO acompanham — use Desfazer ligação e aplique de novo")] : [])
        .concat(MetalCriarUI._linhasVP(m, ro)) });
      if (m.kind === "perfil") {
        var li = M.linhaAtual(c), vert = Math.abs(li.b[1] - li.a[1]) > 0.999 * Math.sqrt(Math.pow(li.b[0] - li.a[0], 2) + Math.pow(li.b[1] - li.a[1], 2) + Math.pow(li.b[2] - li.a[2], 2));
        var busca = this._buscaPeca && this._buscaPeca.id === id ? this._buscaPeca.texto : "";
        var sp = this._secPerfil(null, pre, m.perfil && m.perfil.cat ? m.perfil.cat : "", busca);
        if (!(m.perfil && m.perfil.cat)) sp.params = [ro("perfilRot", "Perfil", m.perfilRotulo || m.perfil.forma)].concat(sp.params.slice(0, 2));
        sec.push(sp);
        sec.push({ nome: "Posição da seção", params: [
          { id: pre + "giro", rotulo: "Giro", unidade: "°", tipo: "numero", passo: "15", valor: Math.round(li.giro * 100) / 100 },
          { id: pre + "just", rotulo: "Justificação vertical", tipo: "lista", valor: li.just, opcoes: [{ id: "topo", rotulo: "Topo" }, { id: "centro", rotulo: "Centro" }, { id: "base", rotulo: "Base" }] },
          { id: pre + "lado", rotulo: "Justificação lateral", tipo: "lista", valor: li.lado, opcoes: [{ id: "esquerda", rotulo: "Esquerda" }, { id: "centro", rotulo: "Centro" }, { id: "direita", rotulo: "Direita" }] },
          { id: pre + "espelhar", rotulo: "Espelhar a seção", tipo: "sim-nao", valor: !!li.espelhar }
        ] });
        var cotas = [], EUp = global.BimElevarUI, sEl = EUp && EUp.secao ? EUp.secao([id]) : null;
        /* ELEVAR (js/bimelevarui.js, 15/10/2026): Elevação da base (a peça INTEIRA anda), Elevação do topo (no pilar
           muda o comprimento; na horizontal leva a peça), Nível de referência e Deslocamento — com os vínculos.
           Antes a "Cota da base" do pilar esticava o pilar e a viga só tinha a "Cota da linha". */
        if (sEl) { if (!vert) cotas.push({ id: pre + "comprimento", rotulo: "Comprimento", unidade: "m", tipo: "numero", passo: "0.01", valor: Math.round(m.L * 1e4) / 1e4 }); cotas = cotas.concat(sEl.params); }
        else if (vert) {
          var lo = li.a[1] <= li.b[1] ? li.a : li.b, hi = li.a[1] <= li.b[1] ? li.b : li.a;
          cotas.push({ id: pre + "base", rotulo: "Cota da base", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(lo[1] * 1e4) / 1e4 });
          cotas.push({ id: pre + "topo", rotulo: "Cota do topo", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(hi[1] * 1e4) / 1e4 });
          var L0 = niveis(); if (L0.length) cotas.push({ id: pre + "nivelBase", rotulo: "Base no nível", tipo: "lista", valor: "", opcoes: [{ id: "", rotulo: "— escolher —" }].concat(L0.map(function (n) { return { id: n.id, rotulo: n.nome + " (" + sinal(n.elevacao) + " m)" }; })) });
        } else {
          cotas.push({ id: pre + "comprimento", rotulo: "Comprimento", unidade: "m", tipo: "numero", passo: "0.01", valor: Math.round(m.L * 1e4) / 1e4 });
          cotas.push({ id: pre + "elevacao", rotulo: "Cota da linha (ponta mais alta)", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(Math.max(li.a[1], li.b[1]) * 1e4) / 1e4 });
        }
        var nvI = m.cria && m.cria.nivel, nomeN = function (id) { var n = nivelPorId(id); return n ? n.nome : "?"; };
        cotas.push(ro("nivelInfo", "Acompanha o nível", !nvI ? "não — cota fixa" : (vert ? (nvI.base != null ? nomeN(nvI.base) : "?") + " → " + (nvI.topo === "acima" ? "nível acima" : (nvI.topo === "altura" || !nvI.topo ? "altura fixa" : nomeN(nvI.topo)))
          : (nvI.ref === "acima" ? "nível acima de " + nomeN(nvI.nivel) : (nvI.ref === "atual" || !nvI.ref ? nomeN(nvI.nivel) : nomeN(nvI.ref))) + (nvI.desl ? " " + sinal(nvI.desl) + " m" : ""))));
        sec.push({ nome: "Cotas", params: cotas });
        sec.push({ nome: "Posição (início da linha)", params: [
          { id: pre + "x", rotulo: "X", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(li.a[0] * 1e4) / 1e4 },
          { id: pre + "y", rotulo: "Cota (Y)", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(li.a[1] * 1e4) / 1e4 },
          { id: pre + "z", rotulo: "Z", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(li.a[2] * 1e4) / 1e4 }
        ] });
        /* VIGA EM BALANÇO (15/10/2026, js/metalligauto.js): a ponta marcada "Livre (balanço)" → as 3 soluções */
        if (!vert && global.MetalLigAutoUI) {
          var lv = li.livre || {}, opsL = [{ id: "apoiada", rotulo: "Apoiada" }, { id: "livre", rotulo: "Livre (balanço)" }];
          var pb = [{ id: pre + "livre:a", rotulo: "Ponta inicial", tipo: "lista", valor: lv.a ? "livre" : "apoiada", opcoes: opsL }, { id: pre + "livre:b", rotulo: "Ponta final", tipo: "lista", valor: lv.b ? "livre" : "apoiada", opcoes: opsL }];
          if (lv.a || lv.b || (m.cria && m.cria.balanco)) pb.push({ id: pre + "balanco", rotulo: "Viga em balanço", tipo: "botao", rotuloBotao: "Soluções do balanço…", fn: function () { global.MetalLigAutoUI.balanco(id); } });
          sec.push({ nome: "Pontas (balanço)", params: pb });
        }
        /* VÍNCULOS (js/bimvinculos.js): "Desligar união" por ponta — a ponta solta não segue a peça em que está presa */
        sec.push({ nome: "Vínculos", params: [
          { id: pre + "vinc:a", rotulo: "Ponta inicial acompanha ao mover", tipo: "sim-nao", valor: !(c.vinculoSolto && c.vinculoSolto.a) },
          { id: pre + "vinc:b", rotulo: "Ponta final acompanha ao mover", tipo: "sim-nao", valor: !(c.vinculoSolto && c.vinculoSolto.b) }
        ] });
        sec.push({ nome: "Material", params: [{ id: pre + "aco", rotulo: "Aço", tipo: "lista", valor: m.aco, opcoes: ACOS_PERFIL.concat(ACOS_PERFIL.indexOf(m.aco) < 0 ? [m.aco] : []).map(function (a) { return { id: a, rotulo: a }; }) }] });
      } else {
        var q = BMe.quadro(c);
        sec.push({ nome: "Chapa", params: [
          { id: pre + "L", rotulo: "Comprimento", unidade: "mm", tipo: "numero", passo: "1", valor: Math.round((m.dim ? m.dim.L : 0) * 1000) },
          { id: pre + "B", rotulo: "Largura", unidade: "mm", tipo: "numero", passo: "1", valor: Math.round((m.dim ? m.dim.B : 0) * 1000) },
          { id: pre + "t", rotulo: "Espessura", unidade: "mm", tipo: "numero", passo: "0.5", valor: Math.round(m.t * 10000) / 10 },
          ro("furos", "Furos", String((m.furos || []).length))
        ] });
        sec.push({ nome: "Posição (canto de origem)", params: [
          { id: pre + "x", rotulo: "X", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(q.O[0] * 1e4) / 1e4 },
          { id: pre + "y", rotulo: "Cota (Y)", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(q.O[1] * 1e4) / 1e4 },
          { id: pre + "z", rotulo: "Z", unidade: "m", tipo: "numero", passo: "0.05", valor: Math.round(q.O[2] * 1e4) / 1e4 }
        ] });
        sec.push({ nome: "Material", params: [{ id: pre + "aco", rotulo: "Aço", tipo: "lista", valor: m.aco, opcoes: ACOS_CHAPA.concat(ACOS_CHAPA.indexOf(m.aco) < 0 ? [m.aco] : []).map(function (a) { return { id: a, rotulo: a }; }) }] });
      }
      var md = c.medidas || {};
      sec.push({ nome: "Quantidades", params: [ro("massa", "Peso", br(c.massa, 2) + " kg"), ro("area", "Área de pintura", br(md.area, 3) + " m²"), ro("vol", "Volume", br(md.volume, 5) + " m³")] });
      var extra = [];
      try { if (G && G._orcSecaoProps) extra = G._orcSecaoProps(info) || []; } catch (eO) { extra = []; }
      return { daPeca: true, uid: info.uid, semEditarTipo: true, titulo: descricao(c), icone: m.kind === "chapa" ? "quadrado" : "estrutura", secoes: sec.concat(extra),
        onMudar: function (pid, v) {
          if (String(pid).indexOf("orc:") === 0) { try { if (global.OrcModeloUI) global.OrcModeloUI.mudar(info.uid, pid, v); } catch (e) {} }
          else self.mudarPeca(id, pid, v);
          return G && G._bimPropsPeca ? G._bimPropsPeca(info) : self.propsPeca(info, G);
        } };
    },
    _buscaPeca: null,
    /* VIGAS ENTRE PILARES: de onde a viga saiu, a face de cada ponta, o recuo, a emenda e o que ficou A DIMENSIONAR */
    _linhasVP: function (m, ro) {
      var cr = m && m.cria, vp = cr && cr.vp; if (!vp) return [];
      var out = [], rc = cr.recuo || {}, nomeP = { pilar: "na face do pilar", apoio: "apoiada no topo do pilar", "emenda-pilar": "emenda sobre o pilar", "emenda-continuidade": "emenda de continuidade" };
      ["a", "b"].forEach(function (k) {
        var tp = vp.pontas && vp.pontas[k], pil = vp.pilares && vp.pilares[k];
        out.push(ro("vp" + k, k === "a" ? "Ponta inicial" : "Ponta final", (nomeP[tp] || tp || "—") + (pil ? " " + pil : "") + (vp.faces && vp.faces[k] ? " (" + vp.faces[k] + ")" : "") + (rc[k] ? " · recuo " + br(rc[k] * 1000, 1) + " mm do eixo" : "") + (vp.pend && vp.pend[k] ? " · " + vp.pend[k] : "")));
      });
      if (vp.calc && (vp.calc.ini === "rotulada" || vp.calc.fim === "rotulada")) out.push(ro("vpRot", "Cálculo", "nesta emenda a viga deixa de ser contínua: a ponta é rótula (biapoiada no pilar)"));
      out.push(ro("vpNo", "Nó do cálculo", "no eixo do pilar (a linha vai de eixo a eixo; o sólido para na face)"));
      return out;
    },
    /* uma mudança nas Propriedades da peça → a peça refeita → op metalAjustar (um Ctrl+Z) */
    mudarPeca: function (id, pid, v) {
      var c = caixaDe(id), M = MC(); if (!c || !M) return false;
      if (/^elev:/.test(String(pid)) && global.BimElevarUI) return global.BimElevarUI.mudarCampo([id], pid, v).ok;   /* ELEVAR */
      var k = String(pid).replace(/^mcrp:/, ""), mud = {};
      if (k === "busca") { this._buscaPeca = { id: id, texto: String(v || "").slice(0, 60) }; return true; }
      if (k === "vinc:a" || k === "vinc:b") {   /* VÍNCULOS: a op do motor, um Ctrl+Z */
        var BV = global.BimVinculos, rv = BV ? BV.opPonta(estado(), id, k.slice(5), !v) : { erro: "O motor dos vínculos (js/bimvinculos.js) não carregou." };
        if (rv.erro) { status(rv.erro); return false; }
        if (!enviarLote([rv.op], "Vínculo da ponta")) { status("O editor recusou a mudança."); return false; }
        status((k === "vinc:a" ? "Ponta inicial" : "Ponta final") + (v ? " ligada: acompanha a peça em que está presa." : " desligada: não acompanha mais (Ctrl+Z desfaz)."));
        return true;
      }
      if (k === "livre:a" || k === "livre:b") {   /* VIGA EM BALANÇO: a marca na receita; marcada livre → as soluções */
        var lv0 = clone((M.linhaAtual(c) || {}).livre || {}) || {}, kk = k.slice(6), quer = String(v) === "livre";
        if (quer) lv0[kk] = true; else delete lv0[kk];
        var rl = M.editar(c, { livre: lv0.a || lv0.b ? lv0 : null });
        if (rl.erro) { status(rl.erro); return false; }
        if (!enviarLote([M.opAjustar(id, rl.caixa)], "Ponta " + (kk === "a" ? "inicial" : "final") + (quer ? " livre (balanço)" : " apoiada"))) { status("O editor recusou a mudança."); return false; }
        status((kk === "a" ? "Ponta inicial" : "Ponta final") + (quer ? " marcada LIVRE (balanço)." : " apoiada.") + " Ctrl+Z desfaz.");
        if (quer && global.MetalLigAutoUI) { try { global.MetalLigAutoUI.balanco(id, { ponta: kk }); } catch (eB) {} }
        return true;
      }
      if (k === "cat") mud.cat = v;
      else if (k === "giro" || k === "comprimento" || k === "base" || k === "topo" || k === "elevacao" || k === "L" || k === "B") { var n = num(v, NaN); if (!fin(n)) { status("Valor inválido."); return false; } mud[k] = (k === "L" || k === "B") ? n / 1000 : n; }
      else if (k === "t") { var t = num(v, NaN); if (!(t >= 0.5 && t <= 300)) { status("Espessura entre 0,5 e 300 mm."); return false; } mud.t = t / 1000; }
      else if (k === "just" || k === "lado" || k === "aco") mud[k] = String(v);
      else if (k === "espelhar") mud.espelhar = !!v;
      else if (k === "nivelBase") {
        var nv = nivelPorId(v); if (!nv) return false; mud.base = nv.elevacao;
        var cr0 = c.metal.cria || {}, nv0 = cr0.nivel || {};
        mud.nivel = { base: nv.id, deslBase: 0, topo: nv0.topo || "altura", deslTopo: num(nv0.deslTopo, 0) };
        if (mud.nivel.topo === "acima") { var ac0 = acimaDe(nv); if (ac0) mud.topo = ac0.elevacao + mud.nivel.deslTopo; }
      }
      else if (k === "x" || k === "y" || k === "z") {
        var nn = num(v, NaN); if (!fin(nn)) { status("Coordenada inválida."); return false; }
        var ref = c.metal.kind === "perfil" ? M.linhaAtual(c).a : BM().quadro(c).O, ix = { x: 0, y: 1, z: 2 }[k];
        mud["d" + k] = nn - ref[ix];
      } else return false;
      /* cota digitada (base, topo, cota da linha, Y): a peça passa a ficar nessa cota — deixa de acompanhar o nível */
      var soltou = (mud.base != null || mud.topo != null || mud.elevacao != null || (mud.dy && Math.abs(mud.dy) > 1e-9)) && mud.nivel === undefined && c.metal.cria && c.metal.cria.nivel;
      if (soltou) mud.nivel = null;
      var r = M.editar(c, mud);
      if (r.erro) { status(r.erro); toast(r.erro, "aviso"); return false; }
      if (!enviarLote([M.opAjustar(id, r.caixa)], "Propriedades da peça metálica")) { status("O editor recusou a mudança."); return false; }
      if (k === "cat") this._buscaPeca = null;
      status(descricao(r.caixa) + " — atualizada" + (soltou ? "; com a cota digitada ela não acompanha mais o nível" : "") + " (Ctrl+Z desfaz).");
      return true;
    },

    /* ------------------------------------------------- barra de opções (sob a fita) */
    _barra: null,
    pintarBarra: function () {
      var b = this._barra, sub = this._sub, BBo = BB();
      if (!b) return;
      if (!sub || !SUBS[sub]) { b.style.display = "none"; return; }
      var ferr = SUBS[sub], c = C()[ferr], slot = BBo && BBo.slot ? BBo.slot() : null;
      if (slot && b.parentNode !== slot) slot.appendChild(b);
      var pl = planoFerr(ferr), h = "";
      if (ferr !== "chapa") h += '<label class="mcr-campo mcr-perfil" title="Perfil do catálogo: digite parte do nome, a série ou o fabricante (w250, ue 150, gerdau, tubo 100)">Perfil <input data-mcr="perfil" autocomplete="off" spellcheck="false" value="' + esc(catDe(ferr) || "") + '"></label>' +
        '<label class="mcr-campo" title="Giro da seção em volta do eixo da peça">Giro <input data-mcr="giro" inputmode="decimal" value="' + esc(br(c.giro, 0)) + '" style="width:3.2em"> °</label>';
      else h += '<label class="mcr-campo" title="Espessura da chapa">Espessura <input data-mcr="t" inputmode="decimal" value="' + esc(br(c.t * 1000, 1)) + '" style="width:3.6em"> mm</label>';
      h += '<label class="mcr-campo" title="Onde a peça é desenhada: o plano de trabalho">Plano <select data-mcr="plano">' +
        '<option value="nivel"' + (pl.definido ? "" : " selected") + '>' + esc(pl.definido ? "Horizontal no nível" : "Horizontal · " + pl.rotulo) + "</option>" +
        (pl.definido ? '<option value="definido" selected>' + esc(pl.rotulo) + "</option>" : "") +
        '<option value="face">Face de uma peça…</option><option value="linha">Vertical por dois pontos…</option></select></label>';
      if (ferr === "viga") {
        /* VIGAS ENTRE PILARES (15/10/2026): puxada de fora a fora, a linha que atravessa 2+ pilares vira uma viga por vão */
        var sel = function (k, ops, v) { return '<select data-mcr="' + k + '">' + ops.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"; };
        h += '<label class="mcr-campo" title="A linha que atravessa 2 ou mais pilares (com pilar no meio dela): uma viga por vão, de eixo a eixo, parada na face de cada pilar com a ligação parafusada — ou contínua por cima deles">Pilares ' + sel("vpModo", Object.keys(MODO_VP).map(function (k) { return [k, MODO_VP[k]]; }), c.vpModo) + "</label>" +
          '<label class="mcr-campo" title="Topo da viga entre pilares: na cota da ferramenta (nível + deslocamento) ou no topo do pilar">Topo ' + sel("vpTopo", [["ferramenta", "da ferramenta"], ["pilar", "do pilar"]], c.vpTopo) + "</label>" +
          '<label class="mcr-campo" title="Comprimento máximo de uma barra (12 m é a barra comercial do laminado; 6 m também é comum). Passou: a viga é emendada">Máx. <input data-mcr="vpMax" list="mcr-vpmax" inputmode="decimal" autocomplete="off" value="' + esc(br(c.vpMax, 1)) + '" style="width:3.4em"> m<datalist id="mcr-vpmax"><option value="6,0"><option value="12,0"></datalist></label>' +
          '<label class="mcr-campo" title="Onde vai a emenda quando a barra passa do máximo: sobre o pilar (a viga deixa de ser contínua ali) ou de continuidade a 0,2·L do apoio, com talas">Emenda ' + sel("vpEmenda", [["pilar", "sobre o pilar"], ["continuidade", "de continuidade"]], c.vpEmenda) + "</label>";
      }
      if (ferr === "viga" && global.MetalLigAutoUI && global.MetalLigAutoUI.cfg) {
        var la0 = global.MetalLigAutoUI.cfg().aoLancar;
        h += '<label class="mcr-campo" title="Ligações ao lançar (desta obra): a viga que encosta num pilar ou noutra viga já sai com a ligação, pré-dimensionada pelo peso próprio e A CONFIRMAR NO CÁLCULO">Ligações <select data-mcr="ligAuto">' + [["parafusada", "parafusada"], ["soldada", "soldada"], ["nao", "não colocar"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === la0 ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
      }
      if (ferr !== "pilar" && ferr !== "chapa") h += '<button type="button" class="bbo-liga" data-mcr="encadear" aria-pressed="' + (c.encadear ? "true" : "false") + '" title="Cada peça começa no fim da anterior (Esc encerra)"><span>Encadear</span></button>';
      h += '<button type="button" class="btn sm ghost mcr-bt" data-mcr="coord" title="Digitar X, cota e Z do próximo ponto">Coordenadas…</button>';
      b.innerHTML = h; b.style.display = "flex";
    },
    _montarBarra: function () {
      if (this._barra || typeof document === "undefined") return this._barra;
      var self = this, b = document.createElement("span");
      b.className = "mcr-barra"; b.setAttribute("data-mcr", "barra"); b.style.display = "none";
      var pop = null;
      function fecharPop() { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); pop = null; }
      function abrirPop(inp) {
        var ferr = SUBS[self._sub]; if (!ferr || !MC()) return;
        var L = MC().buscarPerfis(inp.value, { limite: 30 });
        fecharPop();
        pop = document.createElement("div"); pop.className = "mcr-pop"; pop.setAttribute("role", "listbox"); pop.setAttribute("data-mcr", "pop");
        if (!L.length) pop.innerHTML = '<div class="mcr-pop-vazio">Nenhum perfil com "' + esc(inp.value) + '". Tente a série (W, U, L, Ue, tubo) ou o fabricante.</div>';
        else { var g = null; pop.innerHTML = L.map(function (it) { var cab = it.rotuloSerie !== g ? '<div class="mcr-pop-grupo">' + esc(it.rotuloSerie) + "</div>" : ""; g = it.rotuloSerie; return cab + '<button type="button" class="mcr-pop-item" role="option" data-mcr-cat="' + esc(it.nome) + '">' + esc(it.nome) + (it.massa ? '<span class="mcr-pop-kg">' + br(it.massa, 1) + " kg/m</span>" : "") + "</button>"; }).join(""); }
        var r = inp.getBoundingClientRect(), rb = b.getBoundingClientRect();
        pop.style.left = Math.max(0, r.left - rb.left) + "px";
        b.appendChild(pop);
      }
      function escolher(nome) {
        var ferr = SUBS[self._sub]; if (!ferr) return;
        self.mudarFerramenta(ferr, "mcrf:cat", nome); fecharPop();
        try { if (global.BimShell) global.BimShell.pintarProps(self.esquemaFerramenta(ferr)); } catch (e) {}
      }
      b.addEventListener("input", function (e) { if (e.target && e.target.getAttribute("data-mcr") === "perfil") abrirPop(e.target); });
      b.addEventListener("focusin", function (e) { if (e.target && e.target.getAttribute("data-mcr") === "perfil") { e.target.select(); abrirPop(e.target); } });
      b.addEventListener("keydown", function (e) {
        e.stopPropagation();
        var t = e.target; if (!t || t.getAttribute("data-mcr") !== "perfil") return;
        if (e.key === "Escape") { fecharPop(); t.value = catDe(SUBS[self._sub]) || ""; t.blur(); }
        if (e.key === "Enter") { var pr = pop && pop.querySelector("[data-mcr-cat]"); if (pr) { e.preventDefault(); escolher(pr.getAttribute("data-mcr-cat")); } }
        if (e.key === "ArrowDown" && pop) { var it = pop.querySelector("[data-mcr-cat]"); if (it) { e.preventDefault(); it.focus(); } }
      });
      b.addEventListener("click", function (e) {
        var a = e.target && e.target.closest ? e.target.closest("[data-mcr-cat],[data-mcr]") : null; if (!a) return;
        if (a.hasAttribute("data-mcr-cat")) { escolher(a.getAttribute("data-mcr-cat")); return; }
        var k = a.getAttribute("data-mcr"), ferr = SUBS[self._sub]; if (!ferr) return;
        if (k === "encadear") { C()[ferr].encadear = !C()[ferr].encadear; guardar(); self.pintarBarra(); status(C()[ferr].encadear ? "Encadear: cada peça começa no fim da anterior (Esc encerra)." : "Encadear desligado."); }
        if (k === "coord") self.dialogoCoordenadas();
      });
      b.addEventListener("change", function (e) {
        var t = e.target, k = t && t.getAttribute("data-mcr"), ferr = SUBS[self._sub]; if (!k || !ferr) return;
        if (k === "giro") { self.mudarFerramenta(ferr, "mcrf:giro", t.value); }
        if (k === "t") { self.mudarFerramenta(ferr, "mcrf:t", t.value); }
        if (k === "plano") { self.trocarPlano(t.value); }
        if (k === "vpModo" || k === "vpTopo" || k === "vpMax" || k === "vpEmenda" || k === "ligAuto") { self.mudarFerramenta(ferr, "mcrf:" + k, t.value); }
        try { if (global.BimShell) global.BimShell.pintarProps(self.esquemaFerramenta(ferr)); } catch (eP) {}
      });
      document.addEventListener("pointerdown", function (e) { if (pop && !b.contains(e.target)) fecharPop(); }, true);
      this._barra = b;
      return b;
    },

    /* ------------------------------------------------- plano: trocar */
    trocarPlano: function (modo) {
      var P = Pl(); if (!P) return false;
      if (modo === "nivel") { P.limpar(); status("Plano de trabalho: horizontal no nível da ferramenta."); }
      else if (modo === "face") { if (this._3d) this._3d.modoPlano("face"); status("Plano de trabalho: clique numa FACE plana de uma peça (topo da laje, face do pilar, alma da viga)."); }
      else if (modo === "linha") { if (this._3d) this._3d.modoPlano("linha"); status("Plano de trabalho vertical: clique os dois pontos da linha (encaixa nos eixos e nas pontas)."); }
      if (this._3d) this._3d.aoMudarCfg();
      this.pintarBarra();
      return true;
    },
    dialogoPlano: function () {
      var self = this, P = Pl(); if (!P || !global.UI) return false;
      var ferr = SUBS[this._sub] || "viga", pl = planoFerr(ferr), L = niveis();
      var h = '<div data-mcr="dlg-plano"><p class="muted" style="margin:0 0 10px">O plano de trabalho é onde o próximo clique cai: a grade dele aparece no 3D com o nome. Agora: <b>' + esc(pl.definido ? pl.rotulo : "horizontal · " + pl.rotulo) + "</b>.</p>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn sm" data-mcr-pl="nivel">Horizontal no nível da ferramenta</button>' +
        '<button type="button" class="btn sm" data-mcr-pl="face">Face de uma peça (clique no 3D)</button>' +
        '<button type="button" class="btn sm" data-mcr-pl="linha">Vertical por dois pontos</button></div>' +
        (L.length ? '<p class="muted" style="margin:10px 0 0">Níveis da obra: ' + L.map(function (n) { return esc(n.nome) + " " + sinal(n.elevacao) + " m"; }).join(" · ") + ". O nível atual é escolhido na barra de opções ou em Propriedades.</p>" : '<p class="muted" style="margin:10px 0 0">A obra não tem níveis: o plano horizontal fica na cota do modelo + deslocamento (Propriedades).</p>') +
        "</div>";
      UI.modal("Plano de trabalho", h, [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      var raiz = document.querySelector('[data-mcr="dlg-plano"]');
      if (raiz) raiz.addEventListener("click", function (e) {
        var a = e.target && e.target.closest ? e.target.closest("[data-mcr-pl]") : null; if (!a) return;
        UI.fecharModal();
        if (!SUBS[self._sub]) self.armar("viga");
        self.trocarPlano(a.getAttribute("data-mcr-pl"));
      });
      return true;
    },

    /* ------------------------------------------------- Coordenadas… */
    dialogoCoordenadas: function () {
      var self = this, f = SUBS[this._sub]; if (!f || !global.UI) { toast("Escolha uma ferramenta (Pilar, Viga…) antes.", "aviso"); return false; }
      var t3 = this._3d, n = t3 ? t3.pontos().length : 0, ult = t3 ? t3.ultimo() : null, pl = planoFerr(f);
      var y0 = f === "pilar" ? cotasPilar().base : (pl.horizontal ? pl.y : (ult ? ult[1] : 0));
      var x0 = ult ? ult[0] : 0, z0 = ult ? ult[2] : 0;
      var qual = f === "pilar" ? "do pilar (a base)" : (n ? "do FIM" : "do INÍCIO");
      var h = '<div data-mcr="dlg-coord"><p class="muted" style="margin:0 0 10px">Ponto ' + qual + " em metros. X e Z na planta; a cota é a altura" + (f === "pilar" ? " (a base vem das Restrições)" : "") + ".</p>" +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<label>X <input class="inp" data-mcr-c="x" inputmode="decimal" style="width:6em" value="' + esc(br(x0, 3)) + '"></label>' +
        '<label>Cota (Y) <input class="inp" data-mcr-c="y" inputmode="decimal" style="width:6em" value="' + esc(br(y0, 3)) + '"' + (f === "pilar" ? " disabled" : "") + "></label>" +
        '<label>Z <input class="inp" data-mcr-c="z" inputmode="decimal" style="width:6em" value="' + esc(br(z0, 3)) + '"></label></div>' +
        '<p class="muted" data-mcr="coord-erro" style="color:var(--vermelho);min-height:1.2em;margin:8px 0 0"></p></div>';
      UI.modal("Coordenadas — " + ROT[f], h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Usar o ponto", classe: "primary", onClick: function () {
          function v(k) { var e = document.querySelector('[data-mcr-c="' + k + '"]'); return e ? lerNum(e.value) : null; }
          var x = v("x"), y = v("y"), z = v("z"), er = document.querySelector('[data-mcr="coord-erro"]');
          if (x == null || z == null || (f !== "pilar" && y == null)) { if (er) er.textContent = "Digite números em metros (2,50 ou 250 cm)."; return; }
          UI.fecharModal();
          if (self._3d) self._3d.pontoDigitado([x, f === "pilar" ? y0 : y, z]);
        } }
      ]);
      return true;
    },

    /* ------------------------------------------------- Grade de eixos */
    dialogoGrade: function () {
      var self = this, M = MC(), b = B(); if (!M || !global.UI || !b) return false;
      var ex = estado().eixos || [], usados = {}; ex.forEach(function (e) { usados[String(e.nome).toUpperCase()] = 1; });
      var n1 = 1; while (usados[String(n1)]) n1++;
      var l1 = 0; while (usados[M.letra(l1)]) l1++;
      var h = '<div data-mcr="dlg-grade"><p class="muted" style="margin:0 0 10px">Os eixos numerados correm na vertical da planta (Z) e os de letra na horizontal (X). Espaçamentos em metros: <b>6; 6; 6</b> ou <b>3x6</b> (três vãos de 6). Depois, Mover arrasta um eixo e o pilar sobre ele vai junto.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px 12px">' +
        '<label style="display:flex;flex-direction:column;gap:3px">Vãos entre os eixos numerados (m)<input class="inp" data-mcr-g="espX" value="3x6"></label>' +
        '<label style="display:flex;flex-direction:column;gap:3px">Vãos entre os eixos com letra (m)<input class="inp" data-mcr-g="espZ" value="12"></label>' +
        '<label style="display:flex;flex-direction:column;gap:3px">Origem X (m)<input class="inp" data-mcr-g="x0" inputmode="decimal" value="0"></label>' +
        '<label style="display:flex;flex-direction:column;gap:3px">Origem Z (m)<input class="inp" data-mcr-g="z0" inputmode="decimal" value="0"></label>' +
        '<label style="display:flex;flex-direction:column;gap:3px">Eixo além da grade (m)<input class="inp" data-mcr-g="ext" inputmode="decimal" value="1,5"></label>' +
        '<label style="display:flex;flex-direction:column;gap:3px">Começa no número / letra<span style="display:flex;gap:6px"><input class="inp" data-mcr-g="n1" style="width:4em" value="' + n1 + '"><input class="inp" data-mcr-g="l1" style="width:4em" value="' + M.letra(l1) + '"></span></label></div>' +
        '<p class="muted" data-mcr="grade-erro" style="color:var(--vermelho);min-height:1.2em;margin:8px 0 0"></p></div>';
      UI.modal("Grade de eixos", h, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar a grade", classe: "primary", onClick: function () {
          function v(k) { var e = document.querySelector('[data-mcr-g="' + k + '"]'); return e ? e.value : ""; }
          var er = document.querySelector('[data-mcr="grade-erro"]'), espX = M.lerEspacamentos(v("espX")), espZ = M.lerEspacamentos(v("espZ"));
          var x0 = lerNum(v("x0")), z0 = lerNum(v("z0")), ext = lerNum(v("ext")), nn = parseInt(v("n1"), 10), lt = String(v("l1") || "A").trim().toUpperCase();
          if (!espX || !espZ || (!espX.length && !espZ.length)) { if (er) er.textContent = "Espaçamentos inválidos: use números separados por ponto e vírgula (6; 6) ou 3x6."; return; }
          if (x0 == null || z0 == null || ext == null || !(nn >= 1)) { if (er) er.textContent = "Origem, extensão e número inicial precisam ser números."; return; }
          var li = 0; while (li < 700 && M.letra(li) !== lt) li++;
          var g = M.gradeEixos({ x0: x0, z0: z0, espX: espX, espZ: espZ, ext: ext, numero1: nn, letra1: li < 700 ? li : 0 });
          var rep = g.filter(function (e) { return usados[String(e.nome).toUpperCase()]; });
          if (rep.length) { if (er) er.textContent = "Já existem eixos com estes nomes: " + rep.map(function (e) { return e.nome; }).join(", ") + ". Mude o número ou a letra inicial."; return; }
          UI.fecharModal();
          var base = Date.now().toString(36), ops = g.map(function (e, i) { return { op: "eixo", id: "mcr-eixo-" + base + "-" + i, eixo: e }; });
          if (!enviarLote(ops, "Grade de eixos")) { toast("O editor recusou a grade.", "erro"); return; }
          self._atualizarPlantas();
          status("Grade de eixos: " + g.length + " eixos (" + g.map(function (e) { return e.nome; }).join(", ") + "). As cotas entre eixos aparecem no 3D e na planta. Ctrl+Z desfaz.");
        } }
      ]);
      return true;
    },

    /* ------------------------------------------------- ganchos do editor (js/bim.js) */
    _sub: null, _3d: null,
    aoSub: function (sub) {
      var era = this._sub; this._sub = sub || null;
      this._montarBarra(); this.pintarBarra();
      var ferr = SUBS[sub];
      if (ferr) {
        try { if (global.BimShell) global.BimShell.pintarProps(this.esquemaFerramenta(ferr)); } catch (e) {}
        var pl = planoFerr(ferr);
        status(ROT[ferr] + " " + (catDe(ferr) || "") + ": " + DICA[ferr] + " Plano: " + (pl.definido ? pl.rotulo : pl.rotulo) + ".");
      } else if (SUBS[era]) {
        try { var R = global.BimRibbon; if (R) { R.setAtivo(era, false); if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } } catch (eR) {}
      }
    },
    _redesenhar: function () { if (this._3d) this._3d.redesenhar(); },
    /* VIGAS ENTRE PILARES (15/10/2026): o plano (MetalVigasPilares.planoLinha) → as vigas e as ligações num lote (um Ctrl+Z) */
    planoVP: planoVP,
    lancarPlano: function (pv) {
      var MV = global.MetalVigasPilares, c = C().viga; if (!MV || !pv) return { ok: false, motivo: "O motor das vigas entre pilares (js/metalvigaspilares.js) não carregou." };
      var nivel = pv.modo === "dividir" && c.vpTopo !== "pilar" ? infoNivelRef("viga") : null, ex;
      try { ex = MV.executar(estado().caixas, pv, { cat: catDe("viga"), nivel: nivel, aco: c.aco, novoId: novoId }); } catch (e) { return { ok: false, motivo: "Vigas entre pilares: " + (e && e.message ? e.message : e) }; }
      this._ultimoVP = ex;
      if (!ex.ops.length) return { ok: false, motivo: ex.resumo, ex: ex };
      if (!enviarLote(ex.ops, (pv.modo === "continua" ? "Viga contínua sobre os pilares — " : "Vigas entre pilares — ") + ex.resumo)) return { ok: false, motivo: "O editor recusou as vigas.", ex: ex };
      return { ok: true, ex: ex };
    },
    ultimoVP: function () { return this._ultimoVP || null; },

    /* ================================================== 3D
     * api: { THREE, S, edit, scene, canvas, camera(), host(), raio(cx, cy) → {origem, direcao},
     *        raycast(cx, cy) → hit, hits(), marca(sn), marcaEsconder(), hint(t), fechou(),
     *        telaDe(x, y, z), reescalar(o), avaliar(famId, tipoId, inst) } */
    montar3d: function (api) {
      if (!api || !api.THREE || !api.scene) return null;
      var self = this, THREE = api.THREE, edit = api.edit;
      var st = { pts: [], cur: null, sn: null, modo: null, linhaA: null, facePlano: null, ultEv: null, t: 0, geo3: null, geoPr: null, geoY: null };
      var grpPrev = new THREE.Group(); grpPrev.name = "metal-criar-previa"; api.scene.add(grpPrev);
      var grpPlano = new THREE.Group(); grpPlano.name = "metal-criar-plano"; api.scene.add(grpPlano);
      var grpNiveis = new THREE.Group(); grpNiveis.name = "metal-criar-niveis"; api.scene.add(grpNiveis);
      var grpCotas = new THREE.Group(); grpCotas.name = "metal-criar-cotas-eixos"; api.scene.add(grpCotas);
      var grpVP = new THREE.Group(); grpVP.name = "metal-vigas-pilares-previa"; api.scene.add(grpVP);   /* VIGAS ENTRE PILARES: a prévia do diálogo */
      var sprites = [];
      if (api.S && api.S._tickExtra) api.S._tickExtra.push(function () { for (var i = 0; i < sprites.length; i++) if (sprites[i].parent) api.reescalar(sprites[i]); });
      function ferr() { return SUBS[edit.sub] || null; }
      function ativo() { return previa() && edit.on && !!ferr() && api.S.alive !== false; }
      function cor(nome, reserva) { var c = new THREE.Color(); try { c.set(token(nome, reserva)); } catch (e) { c.set(reserva); } return c; }
      function limpar(g) { g.children.slice().forEach(function (o) { g.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } var i = sprites.indexOf(o); if (i >= 0) sprites.splice(i, 1); }); }
      function linhas(pos, cr, op, tracejado) {
        if (!pos.length) return null;
        var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        var m = tracejado ? new THREE.LineDashedMaterial({ color: cr, dashSize: tracejado, gapSize: tracejado * 0.6, depthTest: false, transparent: true, opacity: op == null ? 1 : op })
                          : new THREE.LineBasicMaterial({ color: cr, depthTest: false, transparent: true, opacity: op == null ? 1 : op });
        var l = new THREE.LineSegments(g, m); if (tracejado) l.computeLineDistances();
        l.renderOrder = 996; l.frustumCulled = false; l.raycast = function () {};
        return l;
      }
      /* rótulo no 3D com as cores do tema (fundo = superfície, texto, borda = aço) */
      function rotulo(txt, borda) {
        var cv = document.createElement("canvas"), fs = 40, pad = 14, g = cv.getContext("2d");
        g.font = "600 " + fs + "px sans-serif"; cv.width = Math.ceil(g.measureText(txt).width) + pad * 2; cv.height = fs + pad * 2;
        g = cv.getContext("2d"); g.font = "600 " + fs + "px sans-serif";
        g.fillStyle = token("--surface", "#ffffff"); g.globalAlpha = 0.92; g.fillRect(0, 0, cv.width, cv.height); g.globalAlpha = 1;
        g.strokeStyle = token(borda || "--aco", "#2e6f9e"); g.lineWidth = 5; g.strokeRect(2.5, 2.5, cv.width - 5, cv.height - 5);
        g.fillStyle = token("--texto", "#14273b"); g.textBaseline = "middle"; g.fillText(txt, pad, cv.height / 2 + 2);
        var tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        sp.userData._ratio = cv.width / cv.height; sp.userData._sc = 0.024; sp.renderOrder = 999; sp.raycast = function () {};
        sprites.push(sp);
        return sp;
      }

      /* ---------------- as linhas da peça (prévia em arame) */
      function arame(c) {
        var BMe = BM(), pos = [];
        if (!BMe || !c || c.erro) return pos;
        BMe.solidos(c).forEach(function (s) {
          var n = s.poli.length;
          for (var i = 0; i < n; i++) {
            var q = s.poli[i], r = s.poli[(i + 1) % n], a0 = s.ponto(q[0], q[1], s.z0), b0 = s.ponto(r[0], r[1], s.z0), a1 = s.ponto(q[0], q[1], s.z1), b1 = s.ponto(r[0], r[1], s.z1);
            pos.push(a0[0], a0[1], a0[2], b0[0], b0[1], b0[2], a1[0], a1[1], a1[2], b1[0], b1[1], b1[2]);
            if (n <= 16 || i % 3 === 0) pos.push(a0[0], a0[1], a0[2], a1[0], a1[1], a1[2]);
          }
        });
        return pos;
      }

      /* ---------------- caixa ao lado do cursor: medida viva + digitar */
      var caixa = document.createElement("div"); caixa.className = "mcr-digita"; caixa.setAttribute("data-mcr", "digita"); caixa.style.display = "none";
      caixa.innerHTML = '<span class="mcr-vivo" data-mcr="vivo"></span><label data-mcr="l-comp">Comprimento <input data-mcr="comp" inputmode="decimal" autocomplete="off" aria-label="Comprimento em metros"></label>' +
        '<label data-mcr="l-ang">Ângulo <input data-mcr="ang" inputmode="decimal" autocomplete="off" aria-label="Ângulo em graus"></label>';
      var inComp = caixa.querySelector('[data-mcr="comp"]'), inAng = caixa.querySelector('[data-mcr="ang"]');
      function pendurar() { var h = api.host(); if (h && caixa.parentNode !== h) h.appendChild(caixa); }
      function caixaPos(x, y) { var hr = api.host().getBoundingClientRect(); caixa.style.left = (x - hr.left + 18) + "px"; caixa.style.top = (y - hr.top + 14) + "px"; }
      function caixaEsconder() { caixa.style.display = "none"; inComp.value = ""; inAng.value = ""; if (caixa.contains(document.activeElement)) document.activeElement.blur(); }
      function digitando() { return caixa.style.display !== "none" && caixa.contains(document.activeElement); }
      caixa.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Tab") { e.preventDefault(); (document.activeElement === inComp ? inAng : inComp).focus(); return; }
        if (e.key === "Escape") { e.preventDefault(); caixaEsconder(); return; }
        if (e.key !== "Enter") return;
        e.preventDefault();
        var f = ferr(); if (!f || !st.pts.length) return;
        var M = MC(), d = inComp.value.trim() ? lerNum(inComp.value) : null, g = inAng.value.trim() ? (PR() ? PR().lerAngulo(inAng.value) : num(inAng.value, null)) : null;
        if (inAng.value.trim() && g == null) { api.hint("Ângulo inválido: use graus (30 ou −45)."); return; }
        var pl = st.facePlano || planoFerr(f), base = st.pts[0];
        if (d == null) { if (!st.cur) return; d = M.medidaTraco(base, st.cur, pl).dist; }
        if (!(d > 0.005)) { api.hint("Comprimento inválido: use metros (2,50) ou 250 cm."); return; }
        var q = M.pontoDigitado(base, st.cur, d, g, pl);
        caixaEsconder();
        if (q) aceitar(q, null);
      });

      /* ---------------- o ponto: plano de trabalho + encaixe */
      function plano() { var f = ferr(); return st.facePlano || planoFerr(f); }
      function proj(p) { var s = api.telaDe(p[0], p[1], p[2]); return s ? { x: s.x, y: s.y, atras: s.atras } : null; }
      function geo3(y) {
        var e = estado();
        if (!st.geo3 || st.geoY !== y || st.geoSt !== e) { st.geo3 = MC().pontosNotaveis(e, { y: y }); st.geoY = y; st.geoSt = e; st.geoPr = null; }
        return st.geo3;
      }
      function geoPr() {
        /* ⚠ as peças METÁLICAS ficam fora daqui: o encaixe delas é o do 3D (pontas do EIXO da barra, em
           qualquer cota). Com elas aqui, o canto da pegada do pilar (meia mesa ao lado) ganhava do topo
           do pilar por 2 px e a viga nascia 13 cm fora do eixo */
        if (!st.geoPr && PR()) { var e0 = estado(); st.geoPr = PR().geometria(e0, { eixos: true, avaliar: api.avaliar, excluir: (e0.caixas || []).filter(function (c) { return c.tipo === "metal"; }).map(function (c) { return c.id; }) }); }
        return st.geoPr;
      }
      function resolver(e) {
        var pl = plano(), r = api.raio(e.clientX, e.clientY), P = Pl(); if (!r || !P) return null;
        var q = P.pontoNoPlano(r, pl); if (!q) return null;
        var cur = { x: e.clientX, y: e.clientY }, tolPx = e.pointerType === "touch" ? 30 : 14, best = null, M = MC();
        /* os snaps da BARRA DE OPÇÕES (liga/desliga, quais tipos, grade — F3 também): os mesmos da parede */
        var BBo = BB(), bc = BBo ? BBo.cfg(edit.sub) : null, T = {};
        ((PR() && PR().TIPOS) || ["fim", "intersecao", "meio", "centro", "perpendicular", "extensao", "proximo", "grade"]).forEach(function (t) { T[t] = !bc || !bc.tipos || bc.tipos[t] !== false; });
        /* ⚠ a CHAPA não leva o 1º ponto como referência: a extensão em X/Z que passa pelo 1º canto
           puxava o canto oposto para a mesma linha — a chapa saía sem área ("—" na caixa) */
        var refSnap = ferr() === "chapa" ? null : (st.pts[0] || null);
        if (bc ? bc.snap !== false : C().encaixe) {
          var yR = pl.horizontal ? pl.y : q[1];
          var s3 = M.snap3d(cur, geo3(yR), proj, { tol: tolPx, ref: refSnap, raio: r, tipos: T });
          var sp = null;
          if (pl.horizontal && PR()) {
            /* o encaixe do desenho de precisão NO PLANO: eixos da grade (cruzamentos), faces e
               pontas das peças, extensão e grade — em metros, com a tolerância dos 14 px */
            var p2 = P.pontoNoPlano(api.raio(e.clientX + tolPx, e.clientY), pl), tolM = p2 ? Math.max(0.005, Math.min(2, Math.sqrt(Math.pow(p2[0] - q[0], 2) + Math.pow(p2[2] - q[2], 2)))) : 0.2;
            var sn = PR().snap({ x: q[0], z: q[2] }, geoPr(), { tol: tolM, tipos: T, ref: refSnap ? { x: refSnap[0], z: refSnap[2] } : null, grade: bc && bc.grade ? bc.passo : 0, prefereCentro: ferr() === "pilar" });   /* pilar: cruzamento de eixos e centro primeiro (js/bimprecisao.js escolherCentro) */
            if (sn) { var p3 = [sn.p.x, pl.y, sn.p.z], s = proj(p3); sp = { p: p3, tipo: sn.tipo, classe: PR().CLASSE[sn.sub || sn.tipo], d: s ? Math.sqrt(Math.pow(s.x - cur.x, 2) + Math.pow(s.y - cur.y, 2)) : 99, guias: sn.guias }; }
          }
          best = M.combinar(s3, sp);
        }
        var p = best ? best.p.slice() : q.slice();
        /* barras horizontais: a ponta que não encaixou num ponto do modelo fica na cota do plano */
        var f = ferr();
        if (st.pts.length && (f === "viga" || f === "terca") && pl.horizontal && !(best && (M.CLASSE[best.tipo] === 0) && !best.eixo && best.classe == null)) p[1] = pl.y;
        /* ortogonal e incrementos de ângulo (a barra de opções), no plano horizontal, sem ponto notável */
        if (st.pts.length && pl.horizontal && f !== "chapa" && BB() && !(best && (best.classe != null ? best.classe : M.CLASSE[best.tipo]) === 0)) {
          var aj = BB().ajustarPonto(edit.sub, { x: st.pts[0][0], z: st.pts[0][2] }, { x: p[0], z: p[2] }, !!e.shiftKey, { grade: !best || best.tipo === "grade" });
          if (aj && aj.travado) { p[0] = aj.p.x; p[2] = aj.p.z; if (best && best.tipo !== "grade") best = null; }
        }
        return { p: p, sn: best, plano: pl };
      }
      function mostrarMarca(r) {
        if (r && r.sn && r.sn.tipo) api.marca({ p: new THREE.Vector3(r.p[0], r.p[1], r.p[2]), tipo: r.sn.tipo, editor: true, cor: { fim: "var(--verde)", intersecao: "var(--vermelho)", meio: "var(--amarelo)", centro: "var(--aco)", perpendicular: "var(--aco)", extensao: "var(--amarelo)", proximo: "var(--texto-fraco)", grade: "var(--texto-fraco)" }[r.sn.tipo] || "var(--aco)" });
        else api.marcaEsconder();
      }
      function desenharPrevia(r) {
        limpar(grpPrev);
        var f = ferr(); if (!f || !r) return;
        /* VIGAS ENTRE PILARES: a linha que atravessa 2+ pilares mostra as vigas por vão (ou a contínua com as emendas) */
        var pv = f === "viga" && st.pts.length ? planoVP(st.pts[0], r.p) : null;
        st.vp = pv ? { n: pv.pecas.length, modo: pv.modo, pend: pv.pendentes.length, emendas: pv.emendas.length, existentes: pv.existentes, texto: pv.pendentes.length ? pv.pendentes[0].texto : null } : null;
        if (pv) {
          var MV = global.MetalVigasPilares, cr0 = cor("--aco-claro", "#5b9bd5"), pos0 = [];
          MV.previa(pv, { cat: catDe("viga") }).forEach(function (cv) { pos0 = pos0.concat(arame(cv)); });
          var l0 = linhas(pos0, cr0, 0.95); if (l0) grpPrev.add(l0);
          var a0 = st.pts[0], lb0 = linhas([a0[0], a0[1], a0[2], r.p[0], r.p[1], r.p[2]], cor("--verde", "#15803d"), 1, 0.2); if (lb0) grpPrev.add(lb0);
          var pe = []; pv.emendas.forEach(function (e) { var q = e.P, k = 0.25; pe.push(q[0] - k, q[1] + k, q[2] - k, q[0] + k, q[1] - k, q[2] + k, q[0] - k, q[1] - k, q[2] + k, q[0] + k, q[1] + k, q[2] - k); });
          var le = linhas(pe, cor("--vermelho", "#c62828"), 1); if (le) grpPrev.add(le);
          st.prevErro = st.vp.texto;
          return;
        }
        var c = construir(f, st.pts, r.p, plano());
        var cr = cor("--aco-claro", "#5b9bd5");
        if (c && !c.erro) { var l = linhas(arame(c), cr, 0.95); if (l) grpPrev.add(l); }
        if (st.pts.length) { var a = st.pts[0], lb = linhas([a[0], a[1], a[2], r.p[0], r.p[1], r.p[2]], cor("--verde", "#15803d"), 1); if (lb) grpPrev.add(lb); }
        if (r.sn && r.sn.guias && r.sn.guias.length) {
          var gp = []; r.sn.guias.forEach(function (gu) { gp.push(gu.a.x, r.plano.y, gu.a.z, gu.b.x, r.plano.y, gu.b.z); });
          var lg = linhas(gp, cor("--amarelo", "#d99a1e"), 0.9, 0.15); if (lg) grpPrev.add(lg);
        }
        st.prevErro = c && c.erro ? c.erro : null;
      }
      function mostrarCaixa(e, r) {
        var f = ferr(); pendurar();
        if (!st.pts.length || !r || f === "pilar") { if (!digitando()) caixa.style.display = "none"; return; }
        var M = MC(), md = M.medidaTraco(st.pts[0], r.p, r.plano), viv = caixa.querySelector('[data-mcr="vivo"]');
        if (f === "chapa") { var c = construir(f, st.pts, r.p, plano()); viv.textContent = c && !c.erro && c.metal.dim ? Math.round(c.metal.dim.L * 1000) + " × " + Math.round(c.metal.dim.B * 1000) + " mm" : "sem área: afaste o canto"; }
        else viv.textContent = br(md.dist) + " m · " + br(md.graus, 1) + "°" + (Math.abs(r.p[1] - st.pts[0][1]) > 0.005 ? " · Δcota " + sinal(r.p[1] - st.pts[0][1]) : "") +
          (st.vp ? " · " + st.vp.n + (st.vp.modo === "continua" ? " viga(s) contínua(s)" : " viga(s) entre pilares") + (st.vp.emendas ? ", " + st.vp.emendas + " emenda(s)" : "") + (st.vp.pend ? " · " + st.vp.pend + " pendência(s)" : "") : "");
        caixa.querySelector('[data-mcr="l-comp"]').style.display = f === "chapa" ? "none" : "";
        caixa.querySelector('[data-mcr="l-ang"]').style.display = f === "chapa" ? "none" : "";
        caixa.style.display = "flex";
        if (!digitando() && e) caixaPos(e.clientX, e.clientY);
      }

      /* ---------------- aceitar um ponto (clique, digitado, coordenadas, planta) */
      function marcarP1() {
        if (!st.pts.length) { edit.p1 = null; return; }
        var a = st.pts[0]; edit.p1 = new THREE.Vector3(a[0], a[1], a[2]);
      }
      function aceitar(p, hit) {
        var f = ferr(); if (!f) return;
        var M = MC();
        /* CHAPA: o 1º clique numa FACE de uma peça leva a chapa para a face */
        if (f === "chapa" && !st.pts.length && C().chapa.naFace !== false && hit && hit.face && hit.object && Pl() && !(Pl().ativo && Pl().ativo())) {
          var nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld), df = Pl().deFace([hit.point.x, hit.point.y, hit.point.z], [nrm.x, nrm.y, nrm.z]);
          /* face de BAIXO (a normal aponta para baixo): a chapa cresce para baixo, para fora da peça */
          if (df.pl) {
            st.facePlano = { o: df.pl.o, u: df.pl.u, v: df.pl.v, n: df.pl.n, horizontal: !!df.horiz, y: df.horiz ? df.pl.o[1] : null, rotulo: "face clicada" };
            /* o ponto (com encaixe) levado para a face: o canto da chapa fica NA face */
            var nn = df.pl.n, dd = (p[0] - df.pl.o[0]) * nn[0] + (p[1] - df.pl.o[1]) * nn[1] + (p[2] - df.pl.o[2]) * nn[2];
            p = [p[0] - nn[0] * dd, p[1] - nn[1] * dd, p[2] - nn[2] * dd]; st.faceBaixo = !!(df.horiz && nrm.y < 0);
          }
        }
        if (f === "viga" && st.pts.length === 1) {
          var pv = planoVP(st.pts[0], p);
          if (pv) {
            var rx = self.lancarPlano(pv);
            if (!rx.ok) { var tt = rx.motivo || "nenhuma viga lançada"; api.hint(tt); status(tt); toast(tt, "aviso", 9000); return; }
            var fimV = p.slice(); st.pts = []; st.facePlano = null; if (C().viga.encadear) st.pts = [fimV];
            marcarP1(); limpar(grpPrev); caixaEsconder(); st.vp = null;
            var tx = rx.ex.resumo + (rx.ex.pendentes.length ? " " + rx.ex.pendentes[0].texto : "") + " Ctrl+Z desfaz.";
            api.hint(tx); status(tx); if (rx.ex.aDimensionar || rx.ex.pendentes.length) toast(tx, "aviso", 9000);
            if (api.fechou) api.fechou();
            return;
          }
        }
        if (f === "pilar" || st.pts.length + 1 >= M.FERRAMENTAS[f].cliques) {
          var c = construir(f, st.pts, p, plano());
          if (f === "chapa" && st.faceBaixo && c && !c.erro) { var cc = C().chapa; c = M.chapa(st.pts[0], p, plano(), { t: cc.t, lado: cc.lado === "acima" ? "abaixo" : cc.lado, aco: cc.aco, nivel: infoNivelRef("chapa") }); }
          st.faceBaixo = false;
          if (!c || c.erro) { api.hint((c && c.erro) || "Não deu para criar a peça."); status((c && c.erro) || ""); return; }
          /* LIGAÇÃO AO LANÇAR (15/10/2026, js/metalligauto.js): a viga que encosta num pilar ou noutra viga já sai com a ligação
             padrão (pré-dimensionada pelo peso próprio, A CONFIRMAR NO CÁLCULO) — no MESMO lote: um Ctrl+Z desfaz tudo */
          var idN = novoId(), opsN = [{ op: "criar", id: idN, caixa: c }], la = null, LAU = global.MetalLigAutoUI;
          if (f === "viga" && LAU && LAU.aoLancar) { try { c.id = idN; la = LAU.aoLancar(estado().caixas, c); if (la && la.ops && la.ops.length) opsN = la.ops; } catch (eLa) { la = null; status("Ligação ao lançar: " + (eLa && eLa.message ? eLa.message : eLa)); } }
          if (!enviarLote(opsN, ROT[f] + " " + descricao(c) + (la && la.ligacoes.length ? " + " + la.ligacoes.length + " ligação(ões) a confirmar" : ""))) { api.hint("O editor recusou a peça."); return; }
          var fim = st.pts.length ? p : null;
          st.pts = []; st.facePlano = null;
          if (fim && C()[f] && C()[f].encadear) st.pts = [fim.slice()];
          marcarP1(); limpar(grpPrev); caixaEsconder();
          var txt = ROT[f] + " criad" + (f === "chapa" || f === "viga" || f === "diagonal" || f === "terca" ? "a" : "o") + ": " + descricao(c) + ". " + (st.pts.length ? "Continua do fim — clique o próximo ponto, ou Esc." : (f === "pilar" ? "Clique para outro, ou Esc." : "Clique o início da próxima, ou Esc.")) + " Ctrl+Z desfaz.";
          if (la && (la.ligacoes.length || la.pendentes.length || la.balanco)) txt = txt.replace(/ Ctrl\+Z desfaz\.$/, "") + " " + la.resumo + " Ctrl+Z desfaz.";
          api.hint(txt); status(txt);
          if (la && LAU && LAU.depoisDeLancar) { try { LAU.depoisDeLancar(la); } catch (eDl) {} }
          if (api.fechou) api.fechou();
          return;
        }
        st.pts.push(p.slice()); marcarP1();
        var t2 = ROT[f] + ": agora " + (f === "chapa" ? "o canto OPOSTO" : "o FIM") + " — ou digite o comprimento (Tab: ângulo) e Enter.";
        api.hint(t2); status(t2);
      }
      function cliquePlano(r, hit) {
        var P = Pl(), f = ferr();
        if (st.modo === "face") {
          if (!hit || !hit.face) { api.hint("Clique em cima de uma face plana de uma peça."); return; }
          var n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld), ud = hit.object.userData || {};
          var d = P.definir({ tipo: "face", ponto: [hit.point.x, hit.point.y, hit.point.z], normal: [n.x, n.y, n.z], elementoId: ud.mid === "edit" ? ud.expressID : null, rotulo: (Math.abs(n.y) > 0.98 ? "face horizontal" : "face vertical") + (ud.mid === "edit" ? " da peça " + ud.expressID : "") });
          if (!d.ok) { api.hint(d.erro); return; }
          st.modo = null; self.pintarBarra(); redesenharPlano();
          api.hint(P.rotulo() + ". " + (f ? ROT[f] + ": " + DICA[f] : "")); status(P.rotulo() + ".");
          return;
        }
        if (st.modo === "linha") {
          if (!r) return;
          if (!st.linhaA) { st.linhaA = r.p.slice(); api.hint("Plano vertical: agora o segundo ponto da linha."); return; }
          var d2 = P.definir({ tipo: "linha", a: [st.linhaA[0], st.linhaA[2]], b: [r.p[0], r.p[2]], y: Math.min(st.linhaA[1], r.p[1]), rotulo: "vertical por dois pontos" });
          st.linhaA = null;
          if (!d2.ok) { api.hint(d2.erro); return; }
          st.modo = null; self.pintarBarra(); redesenharPlano();
          api.hint(P.rotulo() + ". " + (f ? ROT[f] + ": " + DICA[f] : "")); status(P.rotulo() + ".");
        }
      }

      /* ---------------- desenho do PLANO DE TRABALHO, dos níveis e das cotas dos eixos */
      function extensao() {
        var e = estado(), mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
        function add(x, z) { if (!fin(x) || !fin(z)) return; mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], z); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], z); }
        (e.caixas || []).forEach(function (c) { var r = Math.max(num(c.comprimento, 0), num(c.espessura, 0)) / 2; add(num(c.cx, 0) - r, num(c.cz, 0) - r); add(num(c.cx, 0) + r, num(c.cz, 0) + r); });
        (e.eixos || []).forEach(function (x) { add(x.x0, x.z0); add(x.x1, x.z1); });
        if (!fin(mn[0])) { var a = api.alvo ? api.alvo() : null; var cx = a ? a.x : 0, cz = a ? a.z : 0; return { x0: cx - 10, z0: cz - 10, x1: cx + 10, z1: cz + 10 }; }
        var mg = 3; return { x0: Math.floor(mn[0] - mg), z0: Math.floor(mn[1] - mg), x1: Math.ceil(mx[0] + mg), z1: Math.ceil(mx[1] + mg) };
      }
      function redesenharPlano() {
        limpar(grpPlano);
        var f = ferr(); if (!f || !previa() || !edit.on) return;
        var pl = plano(), P = Pl(), soContorno = !!(pl.definido && P && P.grade && P.grade());
        var crF = cor("--linha-forte", "#9db4c8"), crA = cor("--aco", "#2e6f9e"), pos = [], posF = [];
        if (pl.horizontal) {
          var ex = extensao(), y = pl.y + 0.002, x, z;
          if (!soContorno) {
            for (x = Math.ceil(ex.x0); x <= ex.x1 + 1e-9; x++) (x % 5 === 0 ? posF : pos).push(x, y, ex.z0, x, y, ex.z1);
            for (z = Math.ceil(ex.z0); z <= ex.z1 + 1e-9; z++) (z % 5 === 0 ? posF : pos).push(ex.x0, y, z, ex.x1, y, z);
          }
          var bd = [ex.x0, y, ex.z0, ex.x1, y, ex.z0, ex.x1, y, ex.z0, ex.x1, y, ex.z1, ex.x1, y, ex.z1, ex.x0, y, ex.z1, ex.x0, y, ex.z1, ex.x0, y, ex.z0];
          var l1 = linhas(pos, crF, 0.35), l2 = linhas(posF, crA, 0.45), l3 = linhas(bd, crA, 0.9);
          [l1, l2, l3].forEach(function (l) { if (l) { l.renderOrder = 1; grpPlano.add(l); } });
          var sp = rotulo("Plano de trabalho: " + (pl.definido ? pl.rotulo : pl.rotulo)); sp.position.set(ex.x0, y, ex.z1); grpPlano.add(sp); api.reescalar(sp);
        } else {
          /* plano vertical (ou face): um quadro de 12 × 6 m em volta da origem dele, com a grade de 1 m */
          var o = pl.o, u = pl.u, v = pl.v, i;
          function P3(a, b) { return [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b]; }
          for (i = -6; i <= 6; i++) { var A = P3(i, -1), Bq = P3(i, 8); (i % 5 === 0 ? posF : pos).push(A[0], A[1], A[2], Bq[0], Bq[1], Bq[2]); }
          for (i = -1; i <= 8; i++) { var A2 = P3(-6, i), B2 = P3(6, i); (i % 5 === 0 ? posF : pos).push(A2[0], A2[1], A2[2], B2[0], B2[1], B2[2]); }
          if (soContorno) { pos = []; posF = []; }
          var c0 = P3(-6, -1), c1 = P3(6, -1), c2 = P3(6, 8), c3 = P3(-6, 8);
          [linhas(pos, crF, 0.35), linhas(posF, crA, 0.45), linhas([].concat(c0, c1, c1, c2, c2, c3, c3, c0), crA, 0.9)].forEach(function (l) { if (l) grpPlano.add(l); });
          var sp2 = rotulo("Plano de trabalho: " + pl.rotulo); sp2.position.set(c3[0], c3[1], c3[2]); grpPlano.add(sp2); api.reescalar(sp2);
        }
      }
      function redesenharNiveis() {
        limpar(grpNiveis);
        if (!previa() || !C().niveis3d) return;
        var L = niveis(), at = nivelAtivo(); if (!L.length) return;
        var ex = extensao(), crA = cor("--aco", "#2e6f9e"), crF = cor("--texto-fraco", "#516375");
        L.forEach(function (n) {
          var y = n.elevacao, ativoN = at && at.id === n.id;
          var bd = [ex.x0, y, ex.z0, ex.x1, y, ex.z0, ex.x1, y, ex.z0, ex.x1, y, ex.z1, ex.x1, y, ex.z1, ex.x0, y, ex.z1, ex.x0, y, ex.z1, ex.x0, y, ex.z0];
          var l = linhas(bd, ativoN ? crA : crF, ativoN ? 0.9 : 0.6, ativoN ? 0 : 0.4); if (l) grpNiveis.add(l);
          var sp = rotulo(n.nome + " " + sinal(y) + " m", ativoN ? "--aco" : "--linha-forte"); sp.position.set(ex.x1, y, ex.z0); grpNiveis.add(sp); api.reescalar(sp);
        });
      }
      function redesenharCotas() {
        limpar(grpCotas);
        if (!previa() || !C().cotasEixos || !MC()) return;
        var e = estado(), ct = MC().cotasEixos(e.eixos || []); if (!ct.length) return;
        var at = nivelAtivo(), y = (at ? at.elevacao : baseModelo()) + 0.01, cr = cor("--aco", "#2e6f9e"), pos = [];
        ct.forEach(function (c) {
          var dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1], L = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / L, uz = dz / L, tk = 0.12;
          pos.push(c.a[0], y, c.a[1], c.b[0], y, c.b[1]);
          [c.a, c.b].forEach(function (q) { pos.push(q[0] - (ux - uz) * tk, y, q[1] - (uz + ux) * tk, q[0] + (ux - uz) * tk, y, q[1] + (uz + ux) * tk); });
          var sp = rotulo(br(c.valor) + (c.total ? " (total)" : ""), "--aco"); sp.position.set((c.a[0] + c.b[0]) / 2, y, (c.a[1] + c.b[1]) / 2); sp.userData._sc = 0.021; grpCotas.add(sp); api.reescalar(sp);
        });
        var l = linhas(pos, cr, 0.95); if (l) grpCotas.add(l);
      }
      function redesenhar() { try { redesenharPlano(); } catch (e1) {} try { redesenharNiveis(); } catch (e2) {} try { redesenharCotas(); } catch (e3) {} }
      if (Pl() && Pl().ouvir) Pl().ouvir(function () { st.geo3 = null; setTimeout(function () { redesenharPlano(); self.pintarBarra(); }, 0); });

      /* ---------------- teclado: número abre a caixa (no 3D; na planta é a caixa dela) */
      function plantaNaFrente() { var P = PM(); try { return !!(P && P._def && P._def(P._vistaAtiva())); } catch (e) { return false; } }
      document.addEventListener("keydown", function (e) {
        if (!ativo() || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
        if (st.pts.length && /^[0-9.,-]$/.test(e.key) && !plantaNaFrente() && ferr() !== "chapa") {
          e.preventDefault(); e.stopImmediatePropagation();
          pendurar(); caixa.style.display = "flex"; if (st.ultEv) caixaPos(st.ultEv.x, st.ultEv.y);
          inComp.focus(); inComp.value = e.key;
        }
      }, true);

      var api3 = {
        ativo: ativo,
        /* pointermove do canvas: true = tratado aqui */
        mover: function (e) {
          if (!ativo()) return false;
          var tt = performance.now(); if (tt - st.t < 30) return true; st.t = tt;
          st.ultEv = { x: e.clientX, y: e.clientY };
          var r = resolver(e); if (!r) { api.marcaEsconder(); return true; }
          st.cur = r.p; st.sn = r.sn; mostrarMarca(r);
          if (st.modo) { limpar(grpPrev); return true; }
          desenharPrevia(r); mostrarCaixa(e, r);
          return true;
        },
        /* clique do editor (3D, ou a planta com o ponto já resolvido em pForcado): true = consumido */
        clique: function (e, hit, pForcado) {
          if (!ativo()) return false;
          var f = ferr();
          if (pForcado) {
            /* PLANTA: o ponto vem com encaixe (eixos inclusive); a cota é a do plano da ferramenta */
            var pl = plano(), y = pl.horizontal ? pl.y : pForcado.y;
            var p = [pForcado.x, y, pForcado.z];
            if (st.modo) { cliquePlano({ p: p, plano: pl }, null); return true; }
            aceitar(p, null); return true;
          }
          var hits = api.hits ? api.hits() : [], h0 = hits && hits[0];
          var r = resolver(e);
          if (st.modo) { cliquePlano(r, h0); return true; }
          if (!r) { api.hint("Não achei o ponto no plano de trabalho — gire a vista ou troque o plano."); return true; }
          /* CHAPA: o 1º clique em cima de uma peça leva a face dela (o ponto encaixado vai para a face) */
          aceitar(r.p, f === "chapa" && !st.pts.length && h0 && h0.face ? h0 : null);
          return true;
        },
        cancelar: function () { st.pts = []; st.linhaA = null; st.facePlano = null; st.faceBaixo = false; limpar(grpPrev); caixaEsconder(); },
        aoSub: function (sub) {
          self.aoSub(sub);
          st.pts = []; st.modo = null; st.linhaA = null; st.facePlano = null; st.faceBaixo = false; st.geo3 = null; st.geoPr = null;
          limpar(grpPrev); caixaEsconder();
          redesenharPlano();
          if (!SUBS[sub]) api.marcaEsconder();
        },
        aposRebuild: function () { st.geo3 = null; st.geoPr = null; redesenhar(); },
        aoMudarCfg: function () { st.geo3 = null; redesenharPlano(); },
        modoPlano: function (m) { st.modo = m === "face" || m === "linha" ? m : null; st.linhaA = null; limpar(grpPrev); },
        redesenhar: redesenhar,
        pontos: function () { return st.pts.map(function (p) { return p.slice(); }); },
        ultimo: function () { return st.pts.length ? st.pts[st.pts.length - 1].slice() : (st.cur ? st.cur.slice() : null); },
        pontoDigitado: function (p) { if (!ativo()) return false; aceitar(p, null); return true; },
        /* VIGAS ENTRE PILARES: a prévia do diálogo (peças em arame + as emendas); null limpa */
        previaVP: function (caixas, emendas) {
          limpar(grpVP); if (!caixas || !caixas.length) return 0;
          var pos = []; caixas.forEach(function (cv) { pos = pos.concat(arame(cv)); });
          var l = linhas(pos, cor("--verde", "#15803d"), 0.95); if (l) grpVP.add(l);
          var pe = []; (emendas || []).forEach(function (e) { var q = e.P, k = 0.25; pe.push(q[0] - k, q[1] + k, q[2] - k, q[0] + k, q[1] - k, q[2] + k, q[0] - k, q[1] - k, q[2] + k, q[0] + k, q[1] + k, q[2] - k); });
          var le = linhas(pe, cor("--vermelho", "#c62828"), 1); if (le) grpVP.add(le);
          return grpVP.children.length;
        },
        /* para o e2e e o suporte */
        estado: function () {
          return { ferramenta: ferr(), pts: st.pts.length, cur: st.cur, modo: st.modo, snap: st.sn ? st.sn.tipo : null, plano: plano().rotulo, horizontal: !!plano().horizontal, y: plano().y,
                   previa: grpPrev.children.length, gradePlano: grpPlano.children.length, niveis: grpNiveis.children.length, cotasEixos: grpCotas.children.filter(function (o) { return o.isSprite; }).length,
                   caixa: caixa.style.display !== "none", erro: st.prevErro || null, vp: st.vp || null, previaVP: grpVP.children.length };
        },
        _resolver: function (cx, cy) { var r = resolver({ clientX: cx, clientY: cy }); return r ? { p: r.p, tipo: r.sn ? r.sn.tipo : null } : null; }
      };
      this._3d = api3;
      setTimeout(redesenhar, 0);
      return api3;
    }
  };

  global.MetalCriarUI = MetalCriarUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalCriarUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

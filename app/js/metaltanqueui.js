/* =====================================================================
 * metaltanqueui.js — a TELA dos TANQUES da Metálica (aba Metálica &
 * Mecânica › grupo "Tanques"; só com a prévia do modelador). 14/10/2026.
 *
 * Quem calcula é o js/acotanque.js; quem desenha é o js/metaltanque.js; o
 * memorial é o js/acotanquememorial.js. Aqui:
 *   · os comandos da fita (Novo tanque, Modelos de tanque, Editar tanque,
 *     Calcular e memorial) e as DICAS ILUSTRADAS deles;
 *   · o ASSISTENTE: tipo, produto, volume → "Dimensionar pelo volume" (o
 *     motor escolhe D e H de menor peso e diz por quê), teto, aço, local e
 *     vento, acessórios; a prévia ao vivo (elevação com os anéis e a
 *     espessura de cada um, planta, peso, situação, decisões, avisos);
 *   · POSICIONAR por clique no 3D ou na planta (sub "met-tanque-colocar":
 *     o contorno do tanque em arame segue o cursor, encaixa nos eixos e nas
 *     pontas, Espaço gira 90°, Esc cancela) ou criar nas coordenadas;
 *   · EDITAR NO LUGAR (apagar + criar num lote — um Ctrl+Z volta);
 *   · MODELOS PRONTOS (13, dimensionados pelo motor) e os MEUS MODELOS
 *     (localStorage `orcapro:metal:tanques:modelos:v1`, o padrão das chaves
 *     da Metálica `orcapro:metal:*`);
 *   · CALCULAR E MEMORIAL: as verificações passo a passo, as decisões, as
 *     cargas na fundação, o quantitativo e o memorial para imprimir.
 * Ganchos no js/bim.js (S._mtq): pointermove, clique (3D e planta), Esc e
 * troca de ferramenta. Cores: tokens do css/app.css (claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  var SUB = "met-tanque-colocar", CHAVE = "orcapro:metal:tanques:modelos:v1";
  function AT() { return global.AcoTanque || null; }
  function MT() { return global.MetalTanque || null; }
  function MM() { return global.AcoTanqueMemorial || null; }
  function B() { return global.BIM || null; }
  function PR() { return global.BimPrecisao || null; }
  function Pl() { return global.BimPlano || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; var x = Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c), s = Math.abs(x).toFixed(c).split("."); return (x < 0 ? "−" : "") + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (c ? "," + s[1] : ""); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function token(nome, reserva) { try { var v = global.getComputedStyle(global.document.documentElement).getPropertyValue(nome).trim(); if (v) return v; } catch (e) {} return reserva; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function ico(n, s) { try { return global.Icones ? global.Icones.get(n, s || 14) : ""; } catch (e) { return ""; } }

  var COMANDOS = [
    { id: "met-tq-novo", rotulo: "Novo\ntanque", icone: "bloco", grande: true, dica: "Tanque metálico calculado: vertical de fundo plano, horizontal sobre selas ou reservatório elevado. Digite o volume: o sistema escolhe diâmetro e altura, os anéis do costado, o teto, os anéis de vento, a ancoragem e os acessórios (API 650, NBR 6123, NR-12). Clique onde fica." },
    { id: "met-tq-modelos", rotulo: "Modelos de\ntanque", icone: "camadas", grande: true, dica: "Tanques prontos já dimensionados (água potável de 5 a 1.000 m³, diesel horizontal 15 e 30 m³, óleo 1.000 e 5.000 m³, elevado de 50 m³ a 15 m) e os seus modelos salvos." },
    { id: "met-tq-editar", rotulo: "Editar\ntanque", icone: "editar", grande: true, dica: "Selecione uma peça do tanque: o assistente abre com os dados dele e refaz no lugar (um Ctrl+Z volta)." },
    { id: "met-tq-calcular", rotulo: "Calcular e\nmemorial", icone: "relatorio", grande: true, dica: "As verificações passo a passo, as decisões do sistema, as cargas na fundação e o quantitativo do tanque selecionado — e o memorial de cálculo para imprimir." }
  ];
  var DICA_DE = { "met-tq-novo": "novo", "met-tq-modelos": "modelos", "met-tq-editar": "editar", "met-tq-calcular": "calcular" };

  /* ------------------------------------------------------------ estilo (tokens) */
  function css() {
    if (typeof document === "undefined" || document.getElementById("mtq-css")) return;
    var s = document.createElement("style"); s.id = "mtq-css";
    s.textContent = ".mtq-dlg{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}" +
      ".mtq-form{max-height:64vh;overflow:auto;padding-right:6px;display:flex;flex-direction:column;gap:10px}" +
      ".mtq-grupo{border:1px solid var(--linha);border-radius:10px;padding:10px 12px 12px;background:var(--surface)}" +
      ".mtq-grupo>h4{margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--texto-fraco)}" +
      ".mtq-campos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 10px}" +
      ".mtq-campos label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--texto)}.mtq-campos label.mtq-ck{flex-direction:row;align-items:center;gap:6px}" +
      ".mtq-campos input:not([type=checkbox]),.mtq-campos select{min-height:30px}" +
      ".mtq-vol{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.mtq-vol label{flex:1;min-width:140px;display:flex;flex-direction:column;gap:3px;font-size:12px}" +
      ".mtq-lado{display:flex;flex-direction:column;gap:8px;position:sticky;top:0}.mtq-prev{border:1px solid var(--linha);border-radius:10px;background:var(--surface);padding:6px}" +
      ".mtq-esq{width:100%;height:auto;display:block}.mtq-esq-anel{fill:var(--aco-claro,#5b9bd5);stroke:var(--aco,#4f6275);stroke-width:.8}" +
      ".mtq-esq-teto{fill:none;stroke:var(--aco,#4f6275);stroke-width:1.4}.mtq-esq-vento{stroke:var(--amarelo,#d99a1e);stroke-width:2}.mtq-esq-nivel{stroke:var(--azul,#2d6a9c);stroke-width:1.2;stroke-dasharray:4 2}" +
      ".mtq-esq-chao{stroke:var(--texto);stroke-width:1.2}.mtq-esq-torre{stroke:var(--aco,#4f6275);stroke-width:1.2}.mtq-esq-sela{fill:var(--amarelo,#d99a1e)}.mtq-esq-chumb{fill:var(--vermelho,#b42318)}" +
      ".mtq-esq-rot{fill:var(--texto);font-size:9px;font-family:inherit}.mtq-esq-t{fill:var(--texto);font-size:8px;font-family:inherit}" +
      ".mtq-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid var(--linha)}.mtq-chip.ok{color:var(--verde);border-color:var(--verde)}.mtq-chip.aviso{color:var(--vermelho);border-color:var(--vermelho)}" +
      ".mtq-num{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.mtq-num div{border:1px solid var(--linha);border-radius:8px;padding:6px;text-align:center;background:var(--surface)}.mtq-num b{display:block;font-size:14px}.mtq-num span{font-size:10px;color:var(--texto-fraco)}" +
      ".mtq-res{font-size:12px;color:var(--texto);margin:0}.mtq-lst{font-size:11px;color:var(--texto-fraco);margin:0;padding-left:16px;max-height:130px;overflow:auto}" +
      ".mtq-erro{font-size:12px;color:var(--vermelho);margin:0;min-height:1.2em}.mtq-just{font-size:11px;color:var(--texto-fraco);margin:0}" +
      ".mtq-mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;max-height:64vh;overflow:auto}" +
      ".mtq-mod{border:1px solid var(--linha);border-radius:10px;padding:8px;background:var(--surface);display:flex;flex-direction:column;gap:4px;cursor:pointer;text-align:left;font:inherit;color:var(--texto)}" +
      ".mtq-mod:hover,.mtq-mod:focus-visible{border-color:var(--primaria,#2d6a9c);outline:none}.mtq-mod b{font-size:12.5px}.mtq-mod span{font-size:11px;color:var(--texto-fraco)}.mtq-mod svg{width:100%;height:auto}" +
      ".mtq-tab{width:100%;border-collapse:collapse;font-size:12px}.mtq-tab th,.mtq-tab td{border-bottom:1px solid var(--linha);padding:4px 6px;text-align:left;vertical-align:top}.mtq-tab td.n{text-align:right;white-space:nowrap}" +
      ".mtq-ok{color:var(--verde);font-weight:600}.mtq-falha{color:var(--vermelho);font-weight:600}.mtq-inf{color:var(--texto-fraco)}" +
      "@media (max-width:820px){.mtq-dlg{grid-template-columns:1fr}.mtq-form{max-height:none}.mtq-lado{position:static}}";
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------ campos (grupos) */
  function opcoes(o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); }
  function grupos(tipo) {
    var A = AT(), prods = A ? Object.keys(A.PRODUTOS).map(function (k) { return [k, A.PRODUTOS[k].nome]; }) : [], acos = A ? Object.keys(A.ACOS).map(function (k) { return [k, k]; }) : [];
    var g = [];
    g.push({ t: "Tanque e produto", c: [["tipo", "Tipo", "sel", [["vertical", "Vertical de fundo plano"], ["horizontal", "Horizontal sobre selas"], ["elevado", "Elevado (torre)"]]], ["produto", "Produto", "sel", prods], ["G", "Densidade relativa G", "num"], ["nome", "Nome do tanque", "txt"]] });
    if (tipo === "horizontal") g.push({ t: "Geometria", c: [["D", "Diâmetro (m)", "num"], ["L", "Comprimento do costado (m)", "num"], ["anguloSela", "Ângulo da sela", "sel", [["120", "120°"], ["150", "150°"]]], ["bSela", "Largura da sela (m)", "num"], ["alturaSela", "Altura livre sob o tanque (m)", "num"]] });
    else {
      var c = [["D", "Diâmetro (m)", "num"], ["H", "Altura do costado (m)", "num"], ["bordaLivre", "Borda livre (m)", "num"], ["hMorto", "Fundo morto até a saída (m)", "num"]];
      if (tipo === "elevado") c.push(["alturaTorre", "Altura da torre até o fundo (m)", "num"], ["pilares", "Pilares da torre (o fundo da cuba é dimensionado para 4)", "sel", [["4", "4"]]], ["fckFundacao", "fck do concreto dos blocos da torre (MPa; sem ele a ancoragem dos chumbadores fica A CONFIRMAR)", "num"]);
      g.push({ t: "Geometria", c: c });
      g.push({ t: "Teto", c: [["teto", "Teto", "sel", A ? opcoes(A.TETOS) : []], ["inclTeto", "Inclinação do teto (°)", "num"], ["raioDomo", "Raio do domo (× D)", "num"]] });
    }
    g.push({ t: "Material e corrosão", c: [["aco", "Aço do costado", "sel", acos], ["CA", "Corrosão no costado (mm)", "num"]].concat(tipo === "horizontal" ? [["E", "Eficiência da junta", "num"]] : [["CAfundo", "Corrosão no fundo (mm)", "num"]]).concat([["larguraChapa", "Largura da chapa (m)", "num"]]) });
    g.push({ t: "Local e vento (NBR 6123)", c: [["vento.lat", "Latitude (°)", "num"], ["vento.lon", "Longitude (°)", "num"], ["vento.v0", "V0 sem endereço (m/s)", "num"],
      ["vento.categoria", "Terreno (categoria)", "sel", [["I", "I — mar, lago, campo aberto"], ["II", "II — campo com poucos obstáculos"], ["III", "III — sítios, subúrbio afastado"], ["IV", "IV — subúrbio, indústria"], ["V", "V — centro de cidade"]]],
      ["vento.grupoS3", "Uso (S3)", "sel", [["1", "1 — essencial (1,10)"], ["2", "2 — alta ocupação (1,00)"], ["3", "3 — industrial (0,95)"], ["5", "5 — temporário (0,83)"]]],
      ["vento.superficie", "Superfície", "sel", [["rugoso", "Com escada e anéis (Ca maior)"], ["liso", "Lisa"]]],
      ["sismo.zona", "Zona sísmica (NBR 15421)", "sel", [["0", "0 — quase todo o Brasil"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]]].concat(tipo === "vertical" ? [["ancoragem", "Chumbadores", "sel", [["auto", "Quando precisar (o sistema decide)"], ["sempre", "Sempre"], ["nunca", "Nunca"]]], ["fckFundacao", "fck do concreto da fundação (MPa; com chumbadores, sem ele a ancoragem fica A CONFIRMAR)", "num"]] : []) });
    var ac = [["acessorios.escada", "Acesso", "sel", tipo === "horizontal" || tipo === "elevado" ? [["marinheiro", "Escada de marinheiro"], ["nenhuma", "Nenhum"]] : [["auto", "O sistema escolhe"], ["helicoidal", "Escada helicoidal"], ["marinheiro", "Escada de marinheiro"], ["nenhuma", "Nenhum"]]],
      ["acessorios.plataforma", "Plataforma de topo com guarda-corpo", "check"], ["acessorios.bocaVisitaTeto", "Boca de visita no teto", "check"], ["acessorios.indicadorNivel", "Indicador de nível", "check"]];
    if (tipo !== "horizontal") ac.push(["acessorios.guardaCorpoTeto", "Guarda-corpo no teto", "check"], ["acessorios.passarelaAnel", "Passarela em volta no topo (manutenção)", "check"]);
    if (tipo === "vertical") ac.push(["acessorios.bocaVisitaCostado", "Boca de visita no costado", "check"]);
    g.push({ t: "Acessórios (NR-12)", c: ac });
    g.push({ t: "Posição", c: [["x0", "X (m)", "num"], ["y0", "Cota (m)", "num"], ["z0", "Z (m)", "num"], ["giro", "Giro (°)", "num"]] });
    return g;
  }
  function pegar(o, k) { var ps = k.split("."), x = o; for (var i = 0; i < ps.length; i++) { if (x == null) return null; x = x[ps[i]]; } return x; }
  function por(o, k, v) { var ps = k.split("."), x = o; for (var i = 0; i < ps.length - 1; i++) { if (!x[ps[i]] || typeof x[ps[i]] !== "object") x[ps[i]] = {}; x = x[ps[i]]; } x[ps[ps.length - 1]] = v; }
  var NUM_TXT = { G: 2, D: 2, H: 2, L: 2, bordaLivre: 2, hMorto: 2, alturaTorre: 2, fckFundacao: 0, inclTeto: 1, raioDomo: 2, CA: 1, CAfundo: 1, E: 2, larguraChapa: 2, bSela: 2, alturaSela: 2, "vento.lat": 5, "vento.lon": 5, "vento.v0": 0, x0: 3, y0: 3, z0: 3, giro: 0 };

  /* ------------------------------------------------------------ local da obra (o mesmo do cálculo do galpão) */
  function localObra() {
    try {
      var g = global.Gestao, id = String((g && g._bimSel) || "geral"), s = JSON.parse(global.localStorage.getItem("orcapro:metal:calc:" + id) || "null");
      var l = s && (s.local || (s.est && s.est.local)); if (l && isFinite(num(l.lat, NaN)) && isFinite(num(l.lon, NaN))) return { lat: num(l.lat), lon: num(l.lon), fonte: "local da obra (Cálculo da metálica)" };
    } catch (e) {}
    try { var o = global.Store && global.Auth && global.Gestao && global.Gestao._bimSel ? global.Store.obter(global.Auth.empresaId(), "obras", global.Gestao._bimSel) : null; if (o && isFinite(num(o.lat, NaN)) && isFinite(num(o.lon, NaN))) return { lat: num(o.lat), lon: num(o.lon), fonte: "endereço da obra" }; } catch (e2) {}
    return null;
  }

  /* BACKLOG #59/#53 — os problemas do cálculo do tanque como CARTÕES (js/problemacard.js): o que é, "Corrigir: Informar o fck" (abre o
     assistente do tanque e foca o campo) e "Mostrar no 3D" (as peças do tanque). As demais soluções são mudanças de projeto que o
     assistente não aplica sozinho: ficam como texto ("Sem correção automática — …"), nunca botão que não faz nada. */
  function PCt() { return global.ProblemaCard || null; }
  function problemasTanque(probs, t) {
    return (probs || []).map(function (x) {
      return { tipo: x.tipo || "tanque", gravidade: x.critico ? "erro" : "aviso", titulo: x.texto, texto: "", pecas: t && t.pecas ? t.pecas.slice() : [],
        solucoes: (x.solucoes || []).map(function (s) { return { id: s.id, texto: s.texto }; }) };
    });
  }
  function acoesTanque(t, par) { return function (sol) { return sol && sol.id === "fck" && !!(par || t) ? "Informar o fck do concreto da fundação" : false; }; }
  function cartoesProblemas(probs, t) {
    var P = PCt(); if (!probs || !probs.length) return "";
    if (!P) return '<ul class="mtq-lst">' + probs.map(function (x) { return '<li class="mtq-falha">' + esc(x.texto) + " → " + (x.solucoes || []).map(function (s) { return esc(s.texto); }).join("; ") + "</li>"; }).join("") + "</ul>";
    return P.lista(problemasTanque(probs, t), { acoes: acoesTanque(t, true), attrs: 'data-mtq="problemas"' });
  }
  function ligarProblemas(bg, probs, t, par, self) {
    var P = PCt(); if (!P || !bg || !probs || !probs.length) return;
    P.ligar(bg, {
      corrigir: function (id, k) {
        if (id !== "fck") return;
        UI.fecharModal();
        self.dialogo(par, t ? { alvo: t } : {});
        P.irPara('[data-mtq-c="fckFundacao"]');
      },
      mostrar: function (ids) { UI.fecharModal(); var mo = P.mostrarNo3D(ids); toast(mo.selecionou ? "Tanque selecionado no 3D." : "O 3D não está disponível aqui.", mo.selecionou ? "ok" : "aviso", 5000); }
    });
  }
  var MetalTanqueUI = {
    SUB: SUB, COMANDOS: COMANDOS, CHAVE: CHAVE, _n: 0, ultimo: null, ultimoMemorial: null, ultimoResultado: null,
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    querEixos: function (sub) { return sub === SUB; },
    novoId: function () { var U = global.BimMetalUI; if (U && U.novoId) return U.novoId(); this._n++; return "mtq-" + Date.now().toString(36) + "-" + this._n; },
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    caixas: function () { var st = this.estado(); return (st && st.caixas) || []; },
    selecao: function () { var U = global.BimMetalUI; return U && U.selecao ? U.selecao() : []; },
    tanques: function () { return MT() ? MT().tanques(this.caixas()) : []; },
    tanqueSelecionado: function () {
      var ids = this.selecao().map(String), por = {}; this.caixas().forEach(function (c) { por[String(c.id)] = c; });
      var c = ids.map(function (i) { return por[i]; }).filter(function (x) { return x && x.tanque; })[0]; if (!c) return null;
      return this.tanques().filter(function (t) { return t.id === String(c.tanque); })[0] || null;
    },

    /* ------------------------------------------------------------ fita */
    registrar: function (reg) {
      if (!previa() || !AT() || !MT()) return false;
      var self = this;
      reg["met-tq-novo"] = function () { try { self.novo(); } catch (e) { toast("Tanques: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      reg["met-tq-modelos"] = function () { try { self.modelos(); } catch (e) { toast("Tanques: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      reg["met-tq-editar"] = function () { try { self.editar(); } catch (e) { toast("Tanques: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      reg["met-tq-calcular"] = function () { try { self.calcular(); } catch (e) { toast("Tanques: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      try { var BBo = global.BimBarraOpcoes; if (BBo && BBo.declarar) BBo.declarar(SUB, { rotulo: "Tanque", traco: false }); } catch (eB) {}
      try { var D = global.DicaRica; if (D && D.item && D.registrar) Object.keys(DICA_DE).forEach(function (id) { D.item("tanque-" + DICA_DE[id], MT().dica(DICA_DE[id])); D.registrar(id, "tanque-" + DICA_DE[id]); }); } catch (eD) {}
      return true;
    },
    novo: function () {
      var p = this._ultimoPar ? clone(this._ultimoPar) : AT().padrao("vertical"), lo = localObra();
      if (lo) { p.vento = p.vento || {}; p.vento.lat = lo.lat; p.vento.lon = lo.lon; }
      p.y0 = this.cota(); p.nome = "";
      return this.dialogo(p, {});
    },
    editar: function () {
      var t = this.tanqueSelecionado();
      if (!t || !t.info || !t.info.par) { var m = "Editar tanque: selecione uma peça de um tanque criado pelo grupo Tanques (anel, teto, escada…)."; status(m); toast(m, "aviso", 8000); return false; }
      return this.dialogo(MT().parParaRefazer(t), { alvo: t });
    },

    /* ------------------------------------------------------------ assistente */
    _dlg: null,
    dialogo: function (par, o) {
      var A = AT(); if (!A || !global.UI) return false;
      css(); o = o || {};
      var self = this, alvo = o.alvo || null, p = A.normalizar(par), gs = grupos(p.tipo);
      var h = '<div class="mtq-dlg" data-modal-largo data-mtq="dlg"><div class="mtq-form">';
      h += '<div class="mtq-grupo"><h4>Volume</h4><div class="mtq-vol"><label><span>Volume útil desejado (m³)</span><input data-mtq-c="_volume" inputmode="decimal" value="' + esc(o.volume ? br(o.volume, 1) : "") + '" placeholder="ex.: 100"></label>' +
        '<button type="button" class="btn" data-mtq="dimensionar">' + ico("calculadora") + "Dimensionar pelo volume</button></div><p class=\"mtq-just\" data-mtq=\"just\">" + esc(o.justificativa || "O sistema testa as alturas possíveis (anéis de chapa) e fica com o diâmetro e a altura de menor peso de aço que atendem.") + "</p></div>";
      gs.forEach(function (g) {
        h += '<div class="mtq-grupo"><h4>' + esc(g.t) + '</h4><div class="mtq-campos">';
        g.c.forEach(function (c) {
          var id = c[0], v = pegar(p, id), ck = c[2] === "check";
          h += "<label" + (ck ? ' class="mtq-ck"' : "") + ">" + (ck ? "" : "<span>" + esc(c[1]) + "</span>");
          if (c[2] === "sel") h += '<select data-mtq-c="' + id + '">' + c[3].map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? " selected" : "") + ">" + esc(op[1]) + "</option>"; }).join("") + "</select>";
          else if (ck) h += '<input type="checkbox" data-mtq-c="' + id + '"' + (v !== false && v !== 0 && v != null ? " checked" : "") + "><span>" + esc(c[1]) + "</span>";
          else if (c[2] === "txt") h += '<input data-mtq-c="' + id + '" value="' + esc(v == null ? "" : v) + '">';
          else h += '<input data-mtq-c="' + id + '" inputmode="decimal" value="' + esc(v == null || v === "" ? "" : br(v, NUM_TXT[id] != null ? NUM_TXT[id] : 2)) + '">';
          h += "</label>";
        });
        h += "</div></div>";
      });
      h += '</div><div class="mtq-lado"><div class="mtq-prev" data-mtq="previa"></div><div data-mtq="chip"></div><div class="mtq-num" data-mtq="nums"></div><p class="mtq-res" data-mtq="resumo"></p><p class="mtq-erro" data-mtq="erro" role="alert"></p><ul class="mtq-lst" data-mtq="decisoes"></ul><ul class="mtq-lst" data-mtq="avisos"></ul>' +
        '<p class="muted mtq-just">Cálculo pela API 650 (costado, fundo, teto, estabilidade), NBR 6123 (vento) e NR-12 (acessos). O que não é verificado aparece no memorial como "não verificado".</p></div></div>';
      var bts = [];
      if (alvo) bts.push({ texto: "Atualizar no lugar", classe: "primary", onClick: function () { self._confirmar("atualizar"); } });
      else { bts.push({ texto: "Posicionar no modelo", classe: "primary", onClick: function () { self._confirmar("posicionar"); } }); bts.push({ texto: "Criar nas coordenadas", onClick: function () { self._confirmar("coordenadas"); } }); }
      bts.push({ texto: "Salvar como meu modelo", onClick: function () { self.salvarDoDialogo(); } });
      bts.push({ texto: "Memorial", onClick: function () { var q = self.lerDialogo(), r = q ? AT().calcular(q) : null; if (r && r.ok) self.memorial(r); else self._erro(r ? r.motivo : "Dados incompletos."); } });
      bts.push({ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); self._dlg = null; } });
      UI.modal(alvo ? "Editar tanque (" + alvo.n + " peças)" : "Novo tanque", h, bts);
      var raiz = document.querySelector('[data-mtq="dlg"]');
      this._dlg = { alvo: alvo, par: p, raiz: raiz, tipo: p.tipo };
      var tm = null;
      if (raiz) {
        raiz.addEventListener("input", function (e) { if (e.target && e.target.getAttribute("data-mtq-c") === "_volume") return; clearTimeout(tm); tm = setTimeout(function () { self.previaDialogo(); }, 200); });
        raiz.addEventListener("change", function (e) {
          var k = e.target && e.target.getAttribute("data-mtq-c");
          if (k === "tipo") { var q = self.lerDialogo(), np = AT().padrao(e.target.value); np.produto = e.target.value === "vertical" ? q.produto : AT().padrao(e.target.value).produto; np.vento = q.vento; ["x0", "y0", "z0", "giro"].forEach(function (kk) { np[kk] = q[kk]; }); UI.fecharModal(); self._dlg = null; self.dialogo(np, { alvo: alvo }); return; }
          if (k === "produto") { var G = AT().PRODUTOS[e.target.value]; var gi = raiz.querySelector('[data-mtq-c="G"]'); if (G && gi) gi.value = br(G.G, 2); }
          if (k === "_volume") return;
          self.previaDialogo();
        });
        var bd = raiz.querySelector('[data-mtq="dimensionar"]'); if (bd) bd.addEventListener("click", function () { self.dimensionarDialogo(); });
      }
      this.previaDialogo();
      return true;
    },
    lerDialogo: function () {
      var d = this._dlg; if (!d || !d.raiz) return null;
      var p = clone(d.par), raiz = d.raiz;
      [].slice.call(raiz.querySelectorAll("[data-mtq-c]")).forEach(function (el) {
        var k = el.getAttribute("data-mtq-c"); if (k.charAt(0) === "_") return;
        if (el.type === "checkbox") { por(p, k, !!el.checked); return; }
        if (el.tagName === "SELECT") { var v = el.value; por(p, k, /^(pilares|anguloSela|vento\.grupoS3|sismo\.zona)$/.test(k) ? num(v, 0) : v); return; }
        if (k === "nome") { por(p, k, String(el.value || "").trim()); return; }
        var n = num(el.value, NaN); por(p, k, isFinite(n) ? n : null);
      });
      if (p.vento && (p.vento.lat == null || p.vento.lon == null)) { p.vento.lat = null; p.vento.lon = null; }
      return p;
    },
    _erro: function (t) { var d = this._dlg, el = d && d.raiz ? d.raiz.querySelector('[data-mtq="erro"]') : null; if (el) el.textContent = t || ""; },
    previaDialogo: function () {
      var d = this._dlg, A = AT(), M = MT(); if (!d || !A || !d.raiz || !d.raiz.isConnected) return null;
      var p = this.lerDialogo(), r = A.calcular(p), el = function (s) { return d.raiz.querySelector('[data-mtq="' + s + '"]'); };
      d.r = r;
      if (!r.ok) { el("erro").textContent = r.motivo; el("previa").innerHTML = ""; el("nums").innerHTML = ""; el("resumo").textContent = ""; el("chip").innerHTML = ""; el("decisoes").innerHTML = ""; el("avisos").innerHTML = ""; return r; }
      el("erro").textContent = "";
      el("previa").innerHTML = M.esquema(r);
      var q = r.quantitativo, nPend = r.falhas + r.problemas.length;
      el("chip").innerHTML = r.aprovado ? '<span class="mtq-chip ok" data-mtq="situacao">' + ico("check", 12) + "Verificações atendem</span>" : '<span class="mtq-chip aviso" data-mtq="situacao">Não aprovado — ' + nPend + " pendência(s) de cálculo</span>";
      var an = r.costado && r.costado.aneis ? r.costado.aneis : [];
      el("nums").innerHTML = "<div><b>" + br(q.volumeUtil, 1) + "</b><span>m³ úteis</span></div><div><b>" + br(q.pesos.total, 0) + "</b><span>kg de aço</span></div><div><b>" + (an.length ? br(an[0].t, 1) + (an.length > 1 ? "–" + br(an[an.length - 1].t, 1) : "") : "—") + "</b><span>mm no costado</span></div>";
      el("resumo").textContent = r.resumo;
      el("decisoes").innerHTML = r.decisoes.slice(0, 5).map(function (x) { return "<li><b>" + esc(x.tema) + ":</b> " + esc(x.decisao) + "</li>"; }).join("");
      el("avisos").innerHTML = r.problemas.map(function (x) { return '<li class="mtq-falha">' + esc(x.texto) + "</li>"; }).concat(r.avisos.slice(0, 4).map(function (a) { return "<li>" + esc(a) + "</li>"; })).join("");
      return r;
    },
    dimensionarDialogo: function () {
      var d = this._dlg, A = AT(); if (!d || !A) return null;
      var vEl = d.raiz.querySelector('[data-mtq-c="_volume"]'), V = num(vEl && vEl.value, NaN), p = this.lerDialogo();
      if (!(V > 0)) { this._erro("Digite o volume útil desejado (m³) para dimensionar."); return null; }
      if (p.tipo === "horizontal") {
        /* horizontal: L/D ≈ 2,4 (transporte e selas), D pelo volume */
        var D = Math.max(1.0, Math.min(4.2, Math.round(Math.pow(4 * V / 0.95 / (Math.PI * 2.4), 1 / 3) * 20) / 20)), L = Math.round(V / 0.95 / (Math.PI * D * D / 4) * 20 + 0.999) / 20;
        p.D = D; p.L = L; d.par = p; UI.fecharModal(); this._dlg = null;
        return this.dialogo(p, { alvo: d.alvo, volume: V, justificativa: "Horizontal: Ø " + br(D, 2) + " × " + br(L, 2) + " m (L/D ≈ 2,4 — cabe no transporte e as selas ficam a A ≤ R/2)." });
      }
      var r = A.dimensionar(V, p);
      if (!r.ok) { this._erro(r.motivo); return r; }
      var np = r.par; ["x0", "y0", "z0", "giro", "nome"].forEach(function (k) { np[k] = p[k]; });
      UI.fecharModal(); this._dlg = null;
      this.dialogo(np, { alvo: d.alvo, volume: V, justificativa: r.justificativa });
      return r;
    },
    _confirmar: function (modo) {
      var d = this._dlg, A = AT(); if (!d || !A) return false;
      var p = this.lerDialogo(), e = A.validar(p);
      if (e) { this._erro(e); return false; }
      this._ultimoPar = clone(p);
      UI.fecharModal();
      var alvo = d.alvo; this._dlg = null;
      if (modo === "atualizar") return this.colocar(p, alvo);
      if (modo === "coordenadas") return this.colocar(p, null);
      return this.posicionar(p);
    },

    /* ------------------------------------------------------------ meus modelos */
    meusModelos: function () { try { var l = JSON.parse(global.localStorage.getItem(CHAVE) || "[]"); return Array.isArray(l) ? l.filter(function (x) { return x && x.id && x.par; }) : []; } catch (e) { return []; } },
    salvarModelo: function (nome, par) {
      var l = this.meusModelos(), id = "meu-" + Date.now().toString(36), q = clone(par); ["x0", "y0", "z0", "giro"].forEach(function (k) { delete q[k]; }); q.nome = nome;
      l.push({ id: id, nome: String(nome).slice(0, 80), par: q, em: new Date().toISOString() });
      try { global.localStorage.setItem(CHAVE, JSON.stringify(l.slice(-60))); } catch (e) { toast("Não deu para salvar o modelo neste navegador (armazenamento cheio ou bloqueado).", "erro", 8000); return null; }
      return id;
    },
    apagarModelo: function (id) { var l = this.meusModelos().filter(function (x) { return x.id !== id; }); try { global.localStorage.setItem(CHAVE, JSON.stringify(l)); } catch (e) {} return l.length; },
    salvarDoDialogo: function () {
      var p = this.lerDialogo(), A = AT(); if (!p) return null;
      var e = A.validar(p); if (e) { this._erro(e); return null; }
      var nome = p.nome || (A.TIPOS[p.tipo].rotulo + " Ø " + br(p.D, 2) + (p.tipo === "horizontal" ? " × " + br(p.L, 2) : " × " + br(p.H, 2)) + " m");
      var id = this.salvarModelo(nome, p); if (id) { toast("Modelo salvo: " + nome + ". Ele aparece em Modelos de tanque.", "ok", 6000); status("Modelo de tanque salvo: " + nome); }
      return id;
    },
    modelos: function () {
      var A = AT(), M = MT(), self = this; if (!A || !M || !global.UI) return false;
      css();
      var prontos = A.modelos(), meus = this.meusModelos();
      function cartao(m, meu) {
        var r = A.calcular(m.par), sv = r.ok ? M.esquema(r) : "";
        return '<button type="button" class="mtq-mod" data-mtq-mod="' + esc(m.id) + '"' + (meu ? ' data-mtq-meu="1"' : "") + ">" + sv + "<b>" + esc(m.nome) + "</b><span>" + esc(r.ok ? r.resumo : r.motivo) + "</span>" + (meu ? '<span data-mtq-apagar="' + esc(m.id) + '" role="button" tabindex="0" style="color:var(--vermelho)">' + ico("lixeira", 12) + "apagar</span>" : "") + "</button>";
      }
      var h = '<div data-mtq="modelos"><p class="mtq-just">Os prontos são dimensionados pelo próprio sistema (relação H/D de menor peso). Clique para abrir no assistente, ajustar e posicionar.</p>' +
        (meus.length ? "<h4>Meus modelos</h4><div class=\"mtq-mods\">" + meus.map(function (m) { return cartao(m, true); }).join("") + "</div><h4>Modelos prontos</h4>" : "") +
        '<div class="mtq-mods">' + prontos.map(function (m) { return cartao(m, false); }).join("") + "</div></div>";
      UI.modal("Modelos de tanque", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var raiz = document.querySelector('[data-mtq="modelos"]');
      if (raiz) raiz.addEventListener("click", function (e) {
        var ap = e.target.closest ? e.target.closest("[data-mtq-apagar]") : null;
        if (ap) { e.stopPropagation(); self.apagarModelo(ap.getAttribute("data-mtq-apagar")); UI.fecharModal(); self.modelos(); return; }
        var b = e.target.closest ? e.target.closest("[data-mtq-mod]") : null; if (!b) return;
        var id = b.getAttribute("data-mtq-mod"), m = b.getAttribute("data-mtq-meu") ? self.meusModelos().filter(function (x) { return x.id === id; })[0] : A.modelo(id);
        if (!m) return;
        var p = clone(m.par), lo = localObra(); if (lo) { p.vento = p.vento || {}; p.vento.lat = lo.lat; p.vento.lon = lo.lon; }
        p.y0 = self.cota(); UI.fecharModal();
        self.dialogo(p, { volume: m.volume, justificativa: m.justificativa || "" });
      });
      return true;
    },

    /* ------------------------------------------------------------ calcular e memorial */
    calcular: function () {
      var A = AT(); if (!A || !global.UI) return false;
      css();
      var t = this.tanqueSelecionado(), par = t && t.info ? MT().parParaRefazer(t) : (this.ultimo && this.ultimo.par ? this.ultimo.par : null);
      if (!par) { var m = "Calcular e memorial: selecione uma peça de um tanque (ou crie um em Novo tanque)."; status(m); toast(m, "aviso", 8000); return false; }
      var r = A.calcular(par), self = this; this.ultimoResultado = r;
      if (!r.ok) { toast("Tanque: " + r.motivo, "erro", 8000); return false; }
      var linhas = r.verificacoes.map(function (v) { return "<tr><td>" + esc(v.nome) + '<div class="mtq-inf">' + esc(v.item) + '</div></td><td class="n">' + (v.info ? "—" : br(v.razao, 3)) + "</td><td>" + (v.info ? '<span class="mtq-inf">informativo</span>' : (v.ok ? '<span class="mtq-ok">atende</span>' : '<span class="mtq-falha">não atende</span>')) + "</td></tr>"; }).join("");
      var q = r.quantitativo, fu = r.fundacao || {};
      var h = '<div data-mtq="resultado" style="max-height:66vh;overflow:auto">' + MT().esquema(r) + "<p>" + esc(r.resumo) + "</p>" +
        cartoesProblemas(r.problemas, t) +
        '<h4>Verificações</h4><table class="mtq-tab"><thead><tr><th>Verificação</th><th>Razão</th><th>Situação</th></tr></thead><tbody>' + linhas + "</tbody></table>" +
        "<h4>Decisões do sistema</h4><ul class=\"mtq-lst\" style=\"max-height:none\">" + r.decisoes.map(function (x) { return "<li><b>" + esc(x.tema) + ":</b> " + esc(x.decisao) + " — " + esc(x.motivo) + "</li>"; }).join("") + "</ul>" +
        "<h4>Cargas na fundação (características)</h4><p class=\"mtq-res\">" + (fu.G && fu.G.linha != null ? "Peso próprio " + br(fu.G.linha, 2) + " kN/m no anel; " : "") + (fu.L && fu.L.pressao != null ? "líquido " + br(fu.L.pressao, 1) + " kPa; teste " + br(fu.T.pressao, 1) + " kPa; " : "") + (fu.W ? "vento M = " + br(fu.W.M, 1) + " kN·m, V = " + br(fu.W.V, 1) + " kN" : "") + (fu.porPilar ? "; por pilar: " + br(fu.porPilar.compressao, 1) + " kN de compressão, " + br(fu.porPilar.tracao, 1) + " kN de tração" : "") + (fu.porSela ? "; por sela: " + br(fu.porSela.vertical, 1) + " kN" : "") + ".</p>" +
        "<h4>Quantitativo</h4><p class=\"mtq-res\">" + br(q.volumeUtil, 1) + " m³ úteis · " + br(q.pesos.total, 0) + " kg de aço · solda " + br(q.soldaTotal, 0) + " m · pintura interna " + br(q.pinturaInterna, 0) + " m² e externa " + br(q.pinturaExterna, 0) + " m²</p>" +
        "<h4>Não verificado</h4><ul class=\"mtq-lst\" style=\"max-height:none\">" + r.naoVerificado.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
      var bgR = UI.modal("Cálculo do tanque", h, [{ texto: "Abrir memorial", classe: "primary", onClick: function () { self.memorial(r); } }, { texto: "Folha do tanque (PDF)", onClick: function () { self.folhaPdf(r); } }, { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      ligarProblemas(bgR, r.problemas, t, par, self);
      return r;
    },
    /* a FOLHA do tanque no Padrão RA (js/metaltanque.js folha → js/metalfabdes.js) em PDF */
    folhaPdf: function (r) {
      var M = MT(); if (!r || !r.ok || !M || !M.folha) { toast("A folha sai de um cálculo de tanque que fechou.", "aviso"); return null; }
      var emp = {}, logo = null; try { if (global.Empresa && Empresa.dados) emp = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {}
      var o = {}; try { o = (global.Store && global.Auth && global.Gestao && global.Gestao._bimSel ? global.Store.obter(global.Auth.empresaId(), "obras", global.Gestao._bimSel) : null) || {}; } catch (e2) {}
      var f = M.folha(r, { obra: o.nome || "", empresa: emp.nome || emp.razaoSocial || "", responsavel: emp.responsavel || "", registro: emp.crea || "", logo: logo });
      if (!f || !f.ok) { toast("Folha do tanque: " + ((f && f.motivo) || "falhou"), "erro", 8000); return f; }
      var pdf = M.pdfFolha(f, "Tanque"); this.ultimaFolha = { folhas: f.folhas.length, numero: f.folhas[0].numero, bytes: pdf ? pdf.length : 0, svg: f.folhas[0].svg.length, avisos: f.avisos.length };
      var U = global.BimMetalUI; if (pdf && U && U.baixar) U.baixar((o.nome ? String(o.nome).replace(/[^\w.-]+/g, "-") + "-" : "") + "folha-tanque.pdf", pdf, "application/pdf");
      toast("Folha do tanque no Padrão RA (" + f.folhas[0].numero + ") baixada em PDF." + (f.avisos.length ? " Avisos: " + f.avisos.join("; ") : ""), f.avisos.length ? "aviso" : "ok", 7000);
      return f;
    },
    memorial: function (r) {
      var Mm = MM(); if (!r || !r.ok || !Mm) { toast("O memorial sai de um cálculo de tanque que fechou.", "aviso"); return null; }
      var emp = {}, logo = null; try { if (global.Empresa && Empresa.dados) emp = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {}
      var o = {}; try { o = (global.Store && global.Auth && global.Gestao && global.Gestao._bimSel ? global.Store.obter(global.Auth.empresaId(), "obras", global.Gestao._bimSel) : null) || {}; } catch (e2) {}
      var x = Mm.gerar(r, { obra: { nome: o.nome, endereco: o.endereco, cidade: o.cidade, cliente: o.cliente }, empresa: { nome: emp.nome || emp.razaoSocial, cnpj: emp.cnpj, logoDataUrl: logo }, responsavel: { nome: emp.responsavel, titulo: emp.titulo, crea: emp.crea } });
      if (x && x.ok && global.UnidadesMemorial) x.html = UnidadesMemorial.preparar(x.html);   /* aba SI | Técnica (kgf / tf) */
      this.ultimoMemorial = x && x.ok ? { titulo: x.titulo, secoes: x.secoes.length, bytes: x.html.length, avisos: x.avisos.length } : null;
      if (!x || !x.ok) { toast("Memorial: " + ((x && x.motivo) || "falhou"), "erro"); return x; }
      /* teste de 1 hora (js/testemodulo.js, revisão R7): o documento da janela nova leva a marca; vencido não abre */
      if (global.TesteModulo && TesteModulo.marcarHtml) { var hT = TesteModulo.marcarHtml(x.html, "modela:metalica"); if (hT == null) return x; x.html = hT; }
      var w = null; try { w = global.open("", "_blank"); } catch (e3) { w = null; }
      if (w && w.document) { w.document.open(); w.document.write(x.html); w.document.close(); toast("Memorial aberto em outra aba: imprima ou salve em PDF (Ctrl+P).", "ok", 7000); }
      else { var U = global.BimMetalUI; if (U && U.baixar) U.baixar("memorial-tanque.html", x.html, "text/html"); toast("Memorial baixado (.html).", "ok", 6000); }
      return x;
    },

    /* ------------------------------------------------------------ cota e posicionar */
    cota: function () {
      try { var P = Pl(), pa = P && P.ativo ? P.ativo() : null; if (pa && pa.horizontal) return pa.o[1]; } catch (e) {}
      try { var U = global.BimArqUI, n = U && U.nivelAtivo ? U.nivelAtivo() : null; if (n && isFinite(+n.elevacao)) return +n.elevacao; } catch (e2) {}
      var b = B(); try { return b && b.editarBase ? b.editarBase() : 0; } catch (e3) { return 0; }
    },
    _pos: null,
    posicionar: function (par) {
      var b = B(); if (!b || !b.editarArmar) { toast("Abra o modelo 3D para posicionar.", "aviso"); return false; }
      this._pos = { par: clone(par) };
      var ok = b.editarArmar(SUB);
      if (ok === false) { this._pos = null; return false; }
      this._dica(); return true;
    },
    _dica: function () { var s = this._pos; if (!s) return ""; var t = "Tanque: clique onde fica o CENTRO da base (encaixa nos eixos e nas pontas). Espaço gira 90° (" + br(s.par.giro, 0) + "°), Esc cancela — no 3D ou na planta."; status(t); if (this._3d && this._3d.hint) this._3d.hint(t); return t; },
    ponto: function (p) {
      var s = this._pos; if (!s) return false;
      s.par.x0 = Math.round(p[0] * 1e4) / 1e4; s.par.y0 = Math.round(p[1] * 1e4) / 1e4; s.par.z0 = Math.round(p[2] * 1e4) / 1e4;
      this._pos = null;
      var b = B(); try { if (b && b.editarArmar) b.editarArmar(null); } catch (e) {}
      return this.colocar(s.par, null);
    },
    girar: function () { var s = this._pos; if (!s) return false; s.par.giro = ((Math.round(num(s.par.giro, 0) / 90) * 90 + 90) % 360); this._dica(); if (this._3d) this._3d.redesenhar(); return true; },
    cancelar: function () { if (this._pos) { this._pos = null; status("Tanque: posicionamento cancelado."); } },
    colocar: function (par, alvo) {
      var M = MT(), self = this; if (!M) return null;
      if (alvo && alvo.info && alvo.info.par) ["x0", "y0", "z0"].forEach(function (k) { if (par[k] == null) par[k] = alvo.info.par[k]; });
      var g = M.gerar(par, function () { return self.novoId(); });
      if (!g.ok) { toast("Tanque: " + g.motivo, "aviso", 9000); status(g.motivo); return g; }
      var gid = alvo ? alvo.id : "tanque-" + this.novoId();
      M.identidade(g, gid, { par: g.par, em: new Date().toISOString() }, alvo);
      var b = B();
      if (!b || !b.editarLote || !b.editarLote(g.op)) { toast("O editor recusou o tanque.", "erro"); g.ok = false; return g; }
      this.ultimo = { tanqueId: gid, resumo: g.resumo, n: g.pecas.length, massa: g.massa, par: clone(g.par), atualizou: !!alvo, aprovado: g.resultado.aprovado };
      var t = (alvo ? "Atualizado no lugar — " : "") + g.resumo + " Ctrl+Z desfaz.";
      status(t); toast(t, g.resultado.aprovado ? "ok" : "aviso", 9000);
      this.enquadrar(g);
      return g;
    },
    enquadrar: function (g) {
      var b = B(); if (!b || !b.olharPara || !g) return false;
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      g.pecas.forEach(function (c) { [c.cx, c.cy, c.cz].forEach(function (v, i) { v = Number(v); if (isFinite(v)) { mn[i] = Math.min(mn[i], v); mx[i] = Math.max(mx[i], v); } }); });
      if (!isFinite(mn[0])) return false;
      var cam = b.cameraAtual ? b.cameraAtual() : null, fov = cam && cam.fov > 0 ? cam.fov : 50, dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2], raio = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) / 2, 1);
      try { b.olharPara([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], raio / Math.sin(fov * Math.PI / 360) * 1.2); return true; } catch (e) { return false; }
    },

    /* ================================================== 3D (gancho S._mtq do js/bim.js) */
    montar3d: function (api) {
      if (!api || !api.THREE || !api.scene) return null;
      var self = this, THREE = api.THREE, edit = api.edit, st = { t: 0, cur: null, geoPr: null, geoSt: null };
      var grp = new THREE.Group(); grp.name = "metal-tanque-previa"; api.scene.add(grp);
      function ativo() { return previa() && edit.on && edit.sub === SUB && !!self._pos && api.S.alive !== false; }
      function limpar() { grp.children.slice().forEach(function (o) { grp.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
      function cor(nome, reserva) { var c = new THREE.Color(); try { c.set(token(nome, reserva)); } catch (e) { c.set(reserva); } return c; }
      function geoPr() {
        var e0 = self.estado() || { caixas: [] };
        if (!st.geoPr || st.geoSt !== e0) { st.geoSt = e0; st.geoPr = PR() ? PR().geometria(e0, { eixos: true, excluir: (e0.caixas || []).filter(function (c) { return c.tipo === "metal"; }).map(function (c) { return c.id; }) }) : null; }
        return st.geoPr;
      }
      function resolver(e) {
        var P = Pl(), r = api.raio(e.clientX, e.clientY); if (!r || !P) return null;
        var y = self.cota(), pl = { o: [0, y, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0], horizontal: true, y: y };
        var q = P.pontoNoPlano(r, pl); if (!q) return null;
        var sn = null, Bo = global.BimBarraOpcoes, liga = function (t) { return !Bo || !Bo.snapLigado || Bo.snapLigado(t); };
        /* PRECISÃO ÚNICA (14/10/2026, barra de baixo): o Snap geral e cada tipo desligado lá valem no posicionar do tanque */
        if (PR() && liga(null)) {
          var p2 = P.pontoNoPlano(api.raio(e.clientX + 14, e.clientY), pl), tol = p2 ? Math.max(0.005, Math.min(2, Math.sqrt(Math.pow(p2[0] - q[0], 2) + Math.pow(p2[2] - q[2], 2)))) : 0.2;
          sn = PR().snap({ x: q[0], z: q[2] }, geoPr(), { tol: tol, tipos: { fim: liga("fim"), intersecao: liga("intersecao"), meio: liga("meio"), centro: liga("centro"), perpendicular: false, extensao: false, proximo: false, grade: false } });
          if (sn) q = [sn.p.x, y, sn.p.z];
        }
        return { p: q, sn: sn };
      }
      function desenhar(p) {
        limpar(); if (!p || !self._pos) return;
        var q = clone(self._pos.par); q.x0 = p[0]; q.y0 = p[1]; q.z0 = p[2];
        var L = MT().contorno(q), pos = [];
        L.forEach(function (l) { pos.push(l.a[0], l.a[1], l.a[2], l.b[0], l.b[1], l.b[2]); });
        if (!pos.length) return;
        var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        var ln = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: cor("--aco-claro", "#5b9bd5"), depthTest: false, transparent: true, opacity: 0.95 }));
        ln.renderOrder = 996; ln.frustumCulled = false; ln.raycast = function () {}; grp.add(ln);
        st.n = pos.length / 6;
      }
      document.addEventListener("keydown", function (e) {
        if (!ativo() || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
        if (e.key === " " || e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); self.girar(); }
      }, true);
      var api3 = {
        ativo: ativo,
        mover: function (e) {
          if (!ativo()) return false;
          var tt = (global.performance && performance.now) ? performance.now() : Date.now(); if (tt - st.t < 60) return true; st.t = tt;
          var r = resolver(e); if (!r) { api.marcaEsconder(); limpar(); return true; }
          st.cur = r.p;
          if (r.sn) api.marca({ p: new THREE.Vector3(r.p[0], r.p[1], r.p[2]), tipo: r.sn.tipo, editor: true, cor: r.sn.tipo === "intersecao" ? "var(--vermelho)" : "var(--verde)" }); else api.marcaEsconder();
          desenhar(r.p);
          return true;
        },
        clique: function (e, hit, pForcado) {
          if (!ativo()) return false;
          var p;
          if (pForcado) p = [pForcado.x, self.cota(), pForcado.z];
          else { var r = resolver(e); if (!r) { api.hint("Não achei o ponto no plano — gire a vista."); return true; } p = r.p; }
          limpar(); api.marcaEsconder();
          self.ponto(p);
          return true;
        },
        cancelar: function () { limpar(); },
        aoSub: function (sub) { limpar(); st.geoPr = null; if (sub === SUB) { self._dica(); return; } if (self._pos) self.cancelar(); },
        redesenhar: function () { if (st.cur) desenhar(st.cur); },
        hint: function (t) { api.hint(t); },
        estado: function () { return { ativo: ativo(), previa: grp.children.length, linhas: st.n || 0, cur: st.cur, giro: self._pos ? self._pos.par.giro : null }; },
        _resolver: function (cx, cy) { var r = resolver({ clientX: cx, clientY: cy }); return r ? { p: r.p, tipo: r.sn ? r.sn.tipo : null } : null; }
      };
      this._3d = api3;
      return api3;
    }
  };

  global.MetalTanqueUI = MetalTanqueUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalTanqueUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

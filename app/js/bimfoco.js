/* =====================================================================
 * bimfoco.js — DISCIPLINA ATIVA e VISIBILIDADE POR CATEGORIA do BIM
 * (motor PURO, ES5, testável em Node: tools/test-bimfoco.js).
 *
 * Pedido do Rogério (13/11/2026): "na disciplina ativa as outras ficam esmaecidas
 * e não selecionáveis; na Coordenação tudo normal e editável" e "visibilidade por
 * categoria: ligar/desligar e transparência por categoria".
 *
 *   FOCO DE DISCIPLINA   Arquitetura | Hidrossanitário | Elétrica | Estrutura | Coordenação.
 *                        Numa delas, o que é das OUTRAS vira fundo translúcido e NÃO pega clique;
 *                        a Coordenação deixa tudo normal. É o que o seletor de disciplina da fita
 *                        (js/bimdisciplinas.js) passa a mandar: a disciplina ativa é uma só.
 *   VISIBILIDADE         por CATEGORIA (Paredes, Tubos, Conexões, Pilares…): liga/desliga e
 *                        transparência (100, 75, 50, 25 %). Vale por cima do foco.
 *
 * ⚠ ISTO É SÓ GRÁFICO DE VISTA, NUNCA DE DADO. Nada daqui muda o modelo, o orçamento ou a
 *   quantidade: esmaecer e esconder só mexem no que se VÊ e no que se CLICA.
 * ⚠ A DISCIPLINA DA PEÇA SAI PRIMEIRO DA CLASSE (um tubo é do hidrossanitário e um eletroduto
 *   é da elétrica, esteja o arquivo rotulado como estiver — o IFC federado costuma rotular o
 *   arquivo inteiro). A disciplina gravada na peça só vale quando a classe não decide
 *   (IfcBuildingElementProxy: deck, linha de divisa…). Sem nada, é Arquitetura.
 *
 * Quem pinta é o js/bim.js (matBase, visibilidade e o raio do clique); quem desenha a tela é
 * o js/bimfocoui.js. Este arquivo guarda o ESTADO (um só, global) e responde "o que acontece
 * com esta peça agora?".
 * ===================================================================== */
(function (global) {
  "use strict";

  var DISCIPLINAS = [
    { id: "arquitetura", rotulo: "Arquitetura" },
    { id: "hidrossanitario", rotulo: "Hidrossanitário" },
    { id: "eletrica", rotulo: "Elétrica" },
    { id: "estrutura", rotulo: "Estrutura" },
    { id: "coordenacao", rotulo: "Coordenação" }
  ];
  var ID_DISC = {}; DISCIPLINAS.forEach(function (d) { ID_DISC[d.id] = d; });

  /* categorias, na ordem da tela; `re` casa com a CLASSE IFC em caixa-alta (sem o prefixo, os nomes do editor entram por ALIAS) */
  var CATEGORIAS = [
    { id: "paredes", rotulo: "Paredes", disc: "arquitetura", re: /^IFC(WALL|CURTAINWALL)/ },
    { id: "lajes", rotulo: "Lajes e pisos", disc: "arquitetura", re: /^IFCSLAB/ },
    { id: "coberturas", rotulo: "Coberturas", disc: "arquitetura", re: /^IFCROOF/ },
    { id: "forros", rotulo: "Forros e acabamentos", disc: "arquitetura", re: /^IFCCOVERING/ },
    { id: "portas", rotulo: "Portas", disc: "arquitetura", re: /^IFCDOOR/ },
    { id: "janelas", rotulo: "Janelas", disc: "arquitetura", re: /^IFCWINDOW/ },
    { id: "escadas", rotulo: "Escadas e guarda-corpos", disc: "arquitetura", re: /^IFC(STAIR|RAMP|RAILING)/ },
    { id: "mobiliario", rotulo: "Mobiliário", disc: "arquitetura", re: /^IFCFURNISHING|^IFCFURNITURE/ },
    { id: "terreno", rotulo: "Terreno e entorno", disc: "arquitetura", re: /^IFC(GEOGRAPHICELEMENT|SITE|TRANSPORTELEMENT)/ },
    { id: "pilares", rotulo: "Pilares", disc: "estrutura", re: /^IFCCOLUMN/ },
    { id: "vigas", rotulo: "Vigas", disc: "estrutura", re: /^IFCBEAM/ },
    { id: "fundacoes", rotulo: "Fundações", disc: "estrutura", re: /^IFC(FOOTING|PILE)/ },
    { id: "perfis", rotulo: "Perfis e chapas", disc: "estrutura", re: /^IFC(MEMBER|PLATE|FASTENER|MECHANICALFASTENER)/ },
    { id: "armacao", rotulo: "Armação", disc: "estrutura", re: /^IFCREINFORCING/ },
    { id: "tubos", rotulo: "Tubos", disc: "hidrossanitario", re: /^IFCPIPESEGMENT/ },
    { id: "conexoes", rotulo: "Conexões", disc: "hidrossanitario", re: /^IFCPIPEFITTING/ },
    { id: "registros", rotulo: "Registros e válvulas", disc: "hidrossanitario", re: /^IFC(VALVE|FLOWCONTROLLER)/ },
    { id: "aparelhos", rotulo: "Aparelhos e louças", disc: "hidrossanitario", re: /^IFC(SANITARYTERMINAL|WASTETERMINAL|FLOWTERMINAL)/ },
    { id: "reservatorios", rotulo: "Reservatórios e caixas", disc: "hidrossanitario", re: /^IFC(FLOWSTORAGEDEVICE|DISTRIBUTIONCHAMBERELEMENT|TANK|FLOWTREATMENTDEVICE)/ },
    { id: "eletrodutos", rotulo: "Eletrodutos e cabos", disc: "eletrica", re: /^IFC(CABLECARRIER|CABLESEGMENT|CABLEFITTING|CONDUIT)/ },
    { id: "pontos", rotulo: "Pontos elétricos", disc: "eletrica", re: /^IFC(OUTLET|LIGHTFIXTURE|SWITCHINGDEVICE|ELECTRICAPPLIANCE|LAMP|SENSOR)/ },
    { id: "quadros", rotulo: "Quadros e caixas", disc: "eletrica", re: /^IFC(ELECTRICDISTRIBUTIONBOARD|JUNCTIONBOX|ELECTRICFLOWSTORAGEDEVICE|ELECTRICDISTRIBUTION)/ }
  ];
  var OUTROS = { id: "outros", rotulo: "Outros elementos", disc: null, re: null };
  var POR_ID = {}; CATEGORIAS.concat([OUTROS]).forEach(function (c) { POR_ID[c.id] = c; });

  /* nomes do editor (peças criadas pelos comandos) → a classe IFC equivalente */
  var ALIAS = { PAREDE: "IFCWALL", LAJE: "IFCSLAB", PILAR: "IFCCOLUMN", VIGA: "IFCBEAM", COBERTURA: "IFCROOF", PORTA: "IFCDOOR", JANELA: "IFCWINDOW",
                TUBO: "IFCPIPESEGMENT", CONEXAO: "IFCPIPEFITTING", REGISTRO: "IFCVALVE", ELETRODUTO: "IFCCABLECARRIERSEGMENT" };

  /* a disciplina da FITA (js/bimdisciplinas.js) → o foco do 3D */
  var DA_FITA = { completo: "coordenacao", civil: "arquitetura", estrutura: "estrutura", hidraulica: "hidrossanitario", eletrica: "eletrica",
                  metalica: "estrutura", marcenaria: "arquitetura", marmoraria: "arquitetura" };

  function txt(v) { return v == null ? "" : String(v); }
  function classe(tipo) {
    var t = txt(tipo).toUpperCase().replace(/^\s+|\s+$/g, "");
    if (!t) return "";
    return ALIAS[t] || t;
  }
  function categoriaDe(tipo) {
    var t = classe(tipo);
    if (!t) return OUTROS;
    for (var i = 0; i < CATEGORIAS.length; i++) if (CATEGORIAS[i].re.test(t)) return CATEGORIAS[i];
    return OUTROS;
  }
  /* classe primeiro; a disciplina gravada só desempata o que a classe não decide */
  function disciplinaDe(tipo, discPeca) {
    var c = categoriaDe(tipo);
    if (c.disc) return c.disc;
    var d = txt(discPeca).toLowerCase();
    if (d === "hidraulica" || d === "hidrossanitario" || d === "hidrossanitaria") return "hidrossanitario";
    if (d === "eletrica") return "eletrica";
    if (d === "estrutura" || d === "metalica") return "estrutura";
    return "arquitetura";
  }

  /* ------------------------------------------------------------------ estado (um só) */
  /* categorias que levam a cor de destaque na disciplina em foco (a peça que o projetista modela e liga) */
  var DESTACA = { tubos: "hidrossanitario", conexoes: "hidrossanitario", registros: "hidrossanitario", eletrodutos: "eletrica", quadros: "eletrica" };
  var FUNDO_OP = 0.12;   /* abaixo de 0,15: as arestas de contorno do js/bim.js também somem na peça de fundo */
  var ESTADO = { disc: "coordenacao", esmaecer: true, fundoOp: FUNDO_OP, cats: {}, versao: 0 };
  var OPACIDADES = [1, 0.75, 0.5, 0.25];

  function copiaCats(c) { var o = {}; Object.keys(c).forEach(function (k) { o[k] = { vis: c[k].vis !== false, op: c[k].op }; }); return o; }
  function get() { return { disc: ESTADO.disc, esmaecer: ESTADO.esmaecer, fundoOp: ESTADO.fundoOp, cats: copiaCats(ESTADO.cats), versao: ESTADO.versao }; }
  function limpaOp(v) { v = Number(v); if (!(v > 0)) return 1; if (v >= 1) return 1; return Math.max(0.05, Math.round(v * 100) / 100); }
  /* muda parte do estado (disc, esmaecer, cats: { id: { vis, op } }); devolve se algo mudou */
  function set(o) {
    var mudou = false;
    o = o || {};
    if (o.disc != null && ID_DISC[o.disc] && o.disc !== ESTADO.disc) { ESTADO.disc = o.disc; mudou = true; }
    if (o.esmaecer != null && !!o.esmaecer !== ESTADO.esmaecer) { ESTADO.esmaecer = !!o.esmaecer; mudou = true; }
    if (o.cats && typeof o.cats === "object") {
      Object.keys(o.cats).forEach(function (id) {
        if (!POR_ID[id]) return;
        var c = o.cats[id] || {}, at = ESTADO.cats[id] || { vis: true, op: 1 }, vis = c.vis == null ? at.vis !== false : c.vis !== false, op = c.op == null ? limpaOp(at.op) : limpaOp(c.op);
        if (vis !== (at.vis !== false) || op !== limpaOp(at.op)) mudou = true;
        if (vis && op >= 1) delete ESTADO.cats[id]; else ESTADO.cats[id] = { vis: vis, op: op };
      });
    }
    if (mudou) ESTADO.versao++;
    return mudou;
  }
  function restaurarCategorias() { var tinha = Object.keys(ESTADO.cats).length > 0; ESTADO.cats = {}; if (tinha) ESTADO.versao++; return tinha; }
  function reiniciar() { ESTADO.disc = "coordenacao"; ESTADO.esmaecer = true; ESTADO.cats = {}; ESTADO.versao++; }
  /* o foco está fazendo alguma coisa? (liga/desliga o custo todo no js/bim.js) */
  function ativo(est) { est = est || ESTADO; return (est.disc !== "coordenacao" && est.esmaecer) || Object.keys(est.cats).length > 0; }

  /* o que acontece com UMA peça (classe, disciplina gravada) no estado `est` (padrão: o global) */
  function avaliar(tipo, discPeca, est) {
    est = est || ESTADO;
    var cat = categoriaDe(tipo), disc = disciplinaDe(tipo, discPeca);
    var c = est.cats[cat.id], oculto = !!(c && c.vis === false), op = c ? limpaOp(c.op) : 1;
    var fundo = est.disc !== "coordenacao" && est.esmaecer && disc !== est.disc;
    if (fundo) op = Math.min(op, est.fundoOp);
    /* DESTAQUE (13/11/2026): na disciplina em foco o que é dela SALTA da vista — tubos, conexões e registros na cor do SISTEMA
       (água fria azul, quente vermelha, esgoto marrom, pluvial verde, ventilação roxa…), eletrodutos e caixas em âmbar. Sem fundo
       esmaecido (esmaecer desligado) nada é destacado: a cor original das peças é a que vale. */
    var destaque = null;
    if (!oculto && !fundo && est.esmaecer && est.disc === disc && DESTACA[cat.id] === disc) destaque = disc === "hidrossanitario" ? "sistema" : disc === "eletrica" ? "eletrica" : null;
    return { cat: cat.id, disc: disc, oculto: oculto, fundo: fundo, destaque: destaque, op: oculto ? 0 : op, selecionavel: !oculto && !fundo };
  }

  /* a legenda do painel: quantas peças há em cada categoria, na ordem da tela, agrupadas por disciplina.
     `pecas` = lista de { tipo, disc } (o js/bim.js entrega); categoria sem peça não entra. */
  function resumo(pecas) {
    var cont = {};
    (pecas || []).forEach(function (p) { var c = categoriaDe(p && p.tipo).id; cont[c] = (cont[c] || 0) + 1; });
    var grupos = [];
    DISCIPLINAS.forEach(function (d) {
      if (d.id === "coordenacao") return;
      var itens = CATEGORIAS.filter(function (c) { return c.disc === d.id && cont[c.id]; }).map(function (c) { return { id: c.id, rotulo: c.rotulo, n: cont[c.id] }; });
      if (itens.length) grupos.push({ disc: d.id, rotulo: d.rotulo, itens: itens });
    });
    if (cont.outros) grupos.push({ disc: "outros", rotulo: "Outros", itens: [{ id: "outros", rotulo: OUTROS.rotulo, n: cont.outros }] });
    return grupos;
  }

  function daFita(id) { return DA_FITA[id] || "coordenacao"; }

  var BimFoco = {
    DISCIPLINAS: DISCIPLINAS, CATEGORIAS: CATEGORIAS, OUTROS: OUTROS, OPACIDADES: OPACIDADES, FUNDO_OP: FUNDO_OP, DA_FITA: DA_FITA,
    categoriaDe: categoriaDe, disciplinaDe: disciplinaDe, avaliar: avaliar, resumo: resumo, daFita: daFita,
    get: get, set: set, reiniciar: reiniciar, restaurarCategorias: restaurarCategorias, ativo: ativo,
    versao: function () { return ESTADO.versao; }
  };
  global.BimFoco = BimFoco;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFoco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

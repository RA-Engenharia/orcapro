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
  /* as disciplinas do PAINEL de visibilidade (esconder num clique): as do foco + Climatização, que não é disciplina da fita */
  var DISC_VIS = DISCIPLINAS.filter(function (d) { return d.id !== "coordenacao"; }).concat([{ id: "climatizacao", rotulo: "Climatização" }]);
  var ID_DISC_VIS = {}; DISC_VIS.forEach(function (d) { ID_DISC_VIS[d.id] = d; });

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
    /* HIDROSSANITÁRIO (16/11/2026, pedido do Rogério: "esconder só tubos e conexões e ver as louças"): seis categorias */
    { id: "tubos", rotulo: "Tubos", disc: "hidrossanitario", re: /^IFCPIPESEGMENT/ },
    { id: "conexoes", rotulo: "Conexões (joelhos, tês, luvas)", disc: "hidrossanitario", re: /^IFCPIPEFITTING/ },
    { id: "registros", rotulo: "Acessórios e válvulas", disc: "hidrossanitario", re: /^IFC(VALVE|FLOWCONTROLLER)/ },
    { id: "aparelhos", rotulo: "Louças e metais", disc: "hidrossanitario", re: /^IFC(SANITARYTERMINAL|FLOWTERMINAL)/ },
    { id: "caixas", rotulo: "Caixas e ralos", disc: "hidrossanitario", re: /^IFC(DISTRIBUTIONCHAMBERELEMENT|WASTETERMINAL)/ },
    { id: "reservatorios", rotulo: "Equipamentos e reservatórios", disc: "hidrossanitario", re: /^IFC(FLOWSTORAGEDEVICE|TANK|FLOWTREATMENTDEVICE|PUMP|FIRESUPPRESSIONTERMINAL)/ },
    /* ELÉTRICA: eletrodutos, fiação, caixas, luminárias, tomadas/interruptores, quadros */
    { id: "eletrodutos", rotulo: "Eletrodutos e eletrocalhas", disc: "eletrica", re: /^IFC(CABLECARRIER|CONDUIT)/ },
    { id: "fiacao", rotulo: "Fiação", disc: "eletrica", re: /^IFC(CABLESEGMENT|CABLEFITTING)/ },
    { id: "caixaseletricas", rotulo: "Caixas de passagem e de ligação", disc: "eletrica", re: /^IFCJUNCTIONBOX/ },
    { id: "luminarias", rotulo: "Luminárias", disc: "eletrica", re: /^IFC(LIGHTFIXTURE|LAMP)/ },
    { id: "pontos", rotulo: "Tomadas, interruptores e sensores", disc: "eletrica", re: /^IFC(OUTLET|SWITCHINGDEVICE|ELECTRICAPPLIANCE|SENSOR)/ },
    { id: "quadros", rotulo: "Quadros", disc: "eletrica", re: /^IFC(ELECTRICDISTRIBUTIONBOARD|ELECTRICFLOWSTORAGEDEVICE|ELECTRICDISTRIBUTION|PROTECTIVEDEVICE)/ },
    /* CLIMATIZAÇÃO */
    { id: "dutos", rotulo: "Dutos", disc: "climatizacao", re: /^IFCDUCT(SEGMENT)?$/ },
    { id: "conexoesduto", rotulo: "Conexões de duto", disc: "climatizacao", re: /^IFCDUCTFITTING/ },
    { id: "difusores", rotulo: "Difusores e grelhas", disc: "climatizacao", re: /^IFCAIRTERMINAL/ },
    { id: "equipclima", rotulo: "Equipamentos de climatização", disc: "climatizacao", re: /^IFC(UNITARYEQUIPMENT|AIRTOAIRHEATRECOVERY|FAN|COIL|CHILLER|BOILER|COMPRESSOR|HEATEXCHANGER|EVAPORATIVECOOLER|DAMPER)/ }
  ];
  var OUTROS = { id: "outros", rotulo: "Outros elementos", disc: null, re: null };
  var POR_ID = {}; CATEGORIAS.concat([OUTROS]).forEach(function (c) { POR_ID[c.id] = c; });

  /* nomes do editor (peças criadas pelos comandos) → a classe IFC equivalente */
  var ALIAS = { PAREDE: "IFCWALL", LAJE: "IFCSLAB", PILAR: "IFCCOLUMN", VIGA: "IFCBEAM", COBERTURA: "IFCROOF", PORTA: "IFCDOOR", JANELA: "IFCWINDOW",
                TUBO: "IFCPIPESEGMENT", CONEXAO: "IFCPIPEFITTING", REGISTRO: "IFCVALVE", ELETRODUTO: "IFCCABLECARRIERSEGMENT", DUTO: "IFCDUCTSEGMENT" };

  /* a disciplina da FITA (js/bimdisciplinas.js) → o foco do 3D */
  var DA_FITA = { completo: "coordenacao", civil: "arquitetura", estrutura: "estrutura", hidraulica: "hidrossanitario", eletrica: "eletrica",
                  metalica: "estrutura", marcenaria: "arquitetura", marmoraria: "arquitetura" };

  function txt(v) { return v == null ? "" : String(v); }
  function classe(tipo) {
    var t = txt(tipo).toUpperCase().replace(/^\s+|\s+$/g, "");
    if (!t) return "";
    return ALIAS[t] || t;
  }
  /* IFCFLOWSEGMENT / IFCFLOWFITTING são genéricos (o exportador não disse se é tubo, duto ou eletroduto): a disciplina GRAVADA na peça
     decide; sem ela, hidrossanitário (o caso comum). Só estes dois — o resto é decidido pela classe. */
  function genericoPor(t, discPeca) {
    var seg = /^IFCFLOWSEGMENT/.test(t), fit = /^IFCFLOWFITTING/.test(t); if (!seg && !fit) return null;
    var d = txt(discPeca).toLowerCase();
    if (d === "eletrica") return POR_ID.eletrodutos;
    if (d === "climatizacao" || d === "mecanica") return POR_ID[seg ? "dutos" : "conexoesduto"];
    return POR_ID[seg ? "tubos" : "conexoes"];
  }
  function categoriaDe(tipo, discPeca) {
    var t = classe(tipo);
    if (!t) return OUTROS;
    var g = genericoPor(t, discPeca); if (g) return g;
    for (var i = 0; i < CATEGORIAS.length; i++) if (CATEGORIAS[i].re.test(t)) return CATEGORIAS[i];
    return OUTROS;
  }
  /* classe primeiro; a disciplina gravada só desempata o que a classe não decide */
  function disciplinaDe(tipo, discPeca) {
    var c = categoriaDe(tipo, discPeca);
    if (c.disc) return c.disc;
    var d = txt(discPeca).toLowerCase();
    if (d === "climatizacao" || d === "mecanica") return "climatizacao";
    if (d === "hidraulica" || d === "hidrossanitario" || d === "hidrossanitaria") return "hidrossanitario";
    if (d === "eletrica") return "eletrica";
    if (d === "estrutura" || d === "metalica") return "estrutura";
    return "arquitetura";
  }

  /* ------------------------------------------------------------------ estado (um só) */
  /* categorias que levam a cor de destaque na disciplina em foco (a peça que o projetista modela e liga) */
  var DESTACA = { tubos: "hidrossanitario", conexoes: "hidrossanitario", registros: "hidrossanitario", eletrodutos: "eletrica", quadros: "eletrica", caixaseletricas: "eletrica" };
  var FUNDO_OP = 0.12;   /* abaixo de 0,15: as arestas de contorno do js/bim.js também somem na peça de fundo */
  /* discOc = DISCIPLINAS inteiras escondidas num clique (16/11/2026); cotasOc = esconde as cotas e rótulos do 3D.
     ⚠ As plantas, cortes e folhas LEEM a visibilidade da cena (cadeiaVisivel, js/bim.js): o que se esconde aqui some do desenho 2D
     também — por isso não há chave separada; o painel avisa e redesenha as vistas abertas. */
  var ESTADO = { disc: "coordenacao", esmaecer: true, fundoOp: FUNDO_OP, cats: {}, discOc: {}, cotasOc: false, versao: 0 };
  var OPACIDADES = [1, 0.75, 0.5, 0.25];

  function copiaCats(c) { var o = {}; Object.keys(c).forEach(function (k) { o[k] = { vis: c[k].vis !== false, op: c[k].op }; }); return o; }
  function copiaDisc(d) { var o = {}; Object.keys(d || {}).forEach(function (k) { if (d[k]) o[k] = 1; }); return o; }
  function get() { return { disc: ESTADO.disc, esmaecer: ESTADO.esmaecer, fundoOp: ESTADO.fundoOp, cats: copiaCats(ESTADO.cats), discOc: copiaDisc(ESTADO.discOc), cotasOc: ESTADO.cotasOc, versao: ESTADO.versao }; }
  function limpaOp(v) { v = Number(v); if (!(v > 0)) return 1; if (v >= 1) return 1; return Math.max(0.05, Math.round(v * 100) / 100); }
  /* muda parte do estado (disc, esmaecer, cats: { id: { vis, op } }); devolve se algo mudou */
  function set(o) {
    var mudou = false;
    o = o || {};
    /* o.vista === true: a escolha vem do campo Disciplina da VISTA, que também tem Mecânica = Climatização (a fita não tem) */
    if (o.disc != null && (ID_DISC[o.disc] || (o.vista === true && ID_DISC_VIS[o.disc])) && o.disc !== ESTADO.disc) { ESTADO.disc = o.disc; mudou = true; }
    if (o.esmaecer != null && !!o.esmaecer !== ESTADO.esmaecer) { ESTADO.esmaecer = !!o.esmaecer; mudou = true; }
    if (o.cats && typeof o.cats === "object") {
      Object.keys(o.cats).forEach(function (id) {
        if (!POR_ID[id]) return;
        var c = o.cats[id] || {}, at = ESTADO.cats[id] || { vis: true, op: 1 }, vis = c.vis == null ? at.vis !== false : c.vis !== false, op = c.op == null ? limpaOp(at.op) : limpaOp(c.op);
        if (vis !== (at.vis !== false) || op !== limpaOp(at.op)) mudou = true;
        if (vis && op >= 1) delete ESTADO.cats[id]; else ESTADO.cats[id] = { vis: vis, op: op };
      });
    }
    /* disciplina inteira escondida: { arquitetura: true, hidrossanitario: false, … } */
    if (o.discOc && typeof o.discOc === "object") {
      Object.keys(o.discOc).forEach(function (id) {
        if (!ID_DISC_VIS[id]) return;
        var quer = !!o.discOc[id], tem = !!ESTADO.discOc[id];
        if (quer === tem) return;
        if (quer) ESTADO.discOc[id] = 1; else delete ESTADO.discOc[id];
        mudou = true;
      });
    }
    if (o.cotasOc != null && !!o.cotasOc !== ESTADO.cotasOc) { ESTADO.cotasOc = !!o.cotasOc; mudou = true; }
    if (mudou) ESTADO.versao++;
    return mudou;
  }
  /* "Mostrar tudo": categorias, disciplinas escondidas e transparências voltam (as cotas e o "valer nas folhas" são escolhas à parte) */
  function restaurarCategorias() { var tinha = Object.keys(ESTADO.cats).length > 0 || Object.keys(ESTADO.discOc).length > 0; ESTADO.cats = {}; ESTADO.discOc = {}; if (tinha) ESTADO.versao++; return tinha; }
  function reiniciar() { ESTADO.disc = "coordenacao"; ESTADO.esmaecer = true; ESTADO.cats = {}; ESTADO.discOc = {}; ESTADO.cotasOc = false; ESTADO.versao++; }
  /* o foco está fazendo alguma coisa? (liga/desliga o custo todo no js/bim.js) */
  function ativo(est) { est = est || ESTADO; return (est.disc !== "coordenacao" && est.esmaecer) || Object.keys(est.cats).length > 0 || Object.keys(est.discOc || {}).length > 0; }

  /* o que acontece com UMA peça (classe, disciplina gravada) no estado `est` (padrão: o global) */
  function avaliar(tipo, discPeca, est) {
    est = est || ESTADO;
    var cat = categoriaDe(tipo, discPeca), disc = disciplinaDe(tipo, discPeca);
    var c = est.cats[cat.id], oculto = !!(c && c.vis === false) || !!(est.discOc && est.discOc[disc]), op = c ? limpaOp(c.op) : 1;
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
    (pecas || []).forEach(function (p) { var c = categoriaDe(p && p.tipo, p && p.disc).id; cont[c] = (cont[c] || 0) + 1; });
    var grupos = [];
    DISC_VIS.forEach(function (d) {
      var itens = CATEGORIAS.filter(function (c) { return c.disc === d.id && cont[c.id]; }).map(function (c) { return { id: c.id, rotulo: c.rotulo, n: cont[c.id] }; });
      if (itens.length) grupos.push({ disc: d.id, rotulo: d.rotulo, itens: itens, n: itens.reduce(function (a, i) { return a + i.n; }, 0) });
    });
    if (cont.outros) grupos.push({ disc: "outros", rotulo: "Outros", itens: [{ id: "outros", rotulo: OUTROS.rotulo, n: cont.outros }] });
    return grupos;
  }

  function daFita(id) { return DA_FITA[id] || "coordenacao"; }

  /* ------------------------------------------------------------------ DISCIPLINA DA VISTA (16/11/2026)
   * Pedido do Rogério: o campo "Disciplina" das Propriedades de uma vista (planta, corte, elevação, 3D) passa a MANDAR no que sai pleno e
   * selecionável (a da vista) e no que sai em meio-tom e sem clique (as outras). O vocabulário do campo é o do js/bimmodelovista.js
   * (arquitetura, estrutural, hidraulica, eletrica, mecanica, coordenacao); o do foco é o daqui. Coordenação = tudo pleno e selecionável. */
  var DA_VISTA = { arquitetura: "arquitetura", estrutural: "estrutura", hidraulica: "hidrossanitario", eletrica: "eletrica", mecanica: "climatizacao", coordenacao: "coordenacao" };
  var PARA_VISTA = { arquitetura: "arquitetura", estrutura: "estrutural", hidrossanitario: "hidraulica", eletrica: "eletrica", climatizacao: "mecanica", coordenacao: "coordenacao" };
  function daVista(id) { return DA_VISTA[txt(id).toLowerCase()] || "coordenacao"; }
  function paraVista(foco) { return PARA_VISTA[foco] || "coordenacao"; }
  /* a peça (classe IFC + disciplina gravada) fica em MEIO-TOM e sem clique numa vista de disciplina `vistaDisc` (id do campo da vista)? */
  function fundoNaVista(vistaDisc, tipo, discPeca) {
    var f = daVista(vistaDisc);
    if (f === "coordenacao") return false;
    return disciplinaDe(tipo, discPeca) !== f;
  }

  /* ------------------------------------------------------------------ ROTULOS SEM SOBREPOSIÇÃO (16/11/2026)
   * Pedido do Rogério: "não deixar rótulos sobrepostos (2,92 duplicado em cima de outro)". Recebe as caixas dos rótulos NA TELA, em px
   * ({ id, x, y, w, h, txt, prio }, x/y = centro) e devolve { oculto: {id:1}, desl: {id:[dx,dy]} }:
   *   · o rótulo de MESMO texto que cai em cima de outro já posto é DUPLICADO (a mesma medida desenhada duas vezes) → some;
   *   · rótulo de OUTRO texto que cai em cima é empurrado (para cima/baixo, depois para os lados) até achar lugar livre; sem lugar,
   *     fica onde o conflito é menor — um valor diferente nunca é escondido (a pessoa perderia a medida).
   * Quem ganha o lugar é o de maior `prio`, depois a ordem da lista. Puro: o js/bim.js entrega as caixas e aplica o resultado.
   * ------------------------------------------------------------------ */
  function sobra(a, b) {   /* área de interseção de duas caixas centradas */
    var dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
    var dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
    return dx > 0 && dy > 0 ? dx * dy : 0;
  }
  function separarRotulos(itens) {
    var lista = (itens || []).filter(function (r) { return r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; })
      .map(function (r, i) { return { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, txt: txt(r.txt), prio: r.prio || 0, i: i }; });
    lista.sort(function (a, b) { return (b.prio - a.prio) || (a.i - b.i); });
    var postos = [], oculto = {}, desl = {};
    lista.forEach(function (r) {
      var dup = false;
      for (var j = 0; j < postos.length && !dup; j++) {
        var q = postos[j];
        if (q.txt === r.txt && r.txt !== "" && sobra(q, r) > 0.25 * Math.min(q.w * q.h, r.w * r.h)) dup = true;
      }
      if (dup) { oculto[r.id] = 1; return; }
      var tent = [[0, 0]], k;
      for (k = 1; k <= 3; k++) tent.push([0, -k * r.h * 1.05], [0, k * r.h * 1.05]);
      tent.push([r.w * 1.05, 0], [-r.w * 1.05, 0], [r.w * 1.05, -r.h * 1.05], [-r.w * 1.05, -r.h * 1.05], [r.w * 1.05, r.h * 1.05], [-r.w * 1.05, r.h * 1.05]);
      var melhor = null, menor = Infinity;
      for (k = 0; k < tent.length; k++) {
        var c = { x: r.x + tent[k][0], y: r.y + tent[k][1], w: r.w, h: r.h }, tot = 0;
        for (var m = 0; m < postos.length; m++) tot += sobra(postos[m], c);
        if (tot < menor - 1e-9) { menor = tot; melhor = tent[k]; }
        if (tot === 0) break;
      }
      if (melhor && (melhor[0] || melhor[1])) desl[r.id] = [melhor[0], melhor[1]];
      postos.push({ x: r.x + (melhor ? melhor[0] : 0), y: r.y + (melhor ? melhor[1] : 0), w: r.w, h: r.h, txt: r.txt });
    });
    return { oculto: oculto, desl: desl };
  }

  /* ------------------------------------------------------------------ PERSISTÊNCIA POR VISTA (16/11/2026)
   * O que a pessoa escondeu numa vista volta quando ela reabre a vista: { "3d": { cats, discOc, cotasOc } }, no aparelho
   * (localStorage, tudo em try/catch — modo privado ou bloqueado não derruba nada). A disciplina em foco NÃO é gravada aqui: ela
   * segue o seletor da fita. `configurar({ ler, gravar })` troca o armazenamento (o teste usa memória). */
  var CHAVE_VIS = "orcapro:bim:visib:v1", memoria = null, arm = null;
  function lerTudo() {
    try {
      if (arm) return JSON.parse(arm.ler() || "{}") || {};
      if (typeof localStorage !== "undefined") return JSON.parse(localStorage.getItem(CHAVE_VIS) || "{}") || {};
    } catch (e) {}
    return memoria || {};
  }
  function gravarTudo(o) {
    memoria = o;
    try {
      var j = JSON.stringify(o);
      if (arm) arm.gravar(j); else if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_VIS, j);
    } catch (e) {}
  }
  function configurar(a) { arm = a && typeof a.ler === "function" && typeof a.gravar === "function" ? a : null; memoria = null; }
  function instantaneo() {
    var o = { cats: {}, discOc: copiaDisc(ESTADO.discOc), cotasOc: !!ESTADO.cotasOc };
    Object.keys(ESTADO.cats).forEach(function (k) { o.cats[k] = { vis: ESTADO.cats[k].vis !== false, op: limpaOp(ESTADO.cats[k].op) }; });
    return o;
  }
  function salvarVista(vista) {
    var v = txt(vista); if (!v) return false;
    var t = lerTudo(), o = instantaneo();
    if (!Object.keys(o.cats).length && !Object.keys(o.discOc).length && !o.cotasOc) delete t[v]; else t[v] = o;
    gravarTudo(t); return true;
  }
  /* devolve ao estado o que foi gravado para a vista (sem gravar de novo); true se achou */
  function carregarVista(vista) {
    var t = lerTudo(), o = t[txt(vista)], antes = JSON.stringify(instantaneo());
    ESTADO.cats = {}; ESTADO.discOc = {}; ESTADO.cotasOc = false;
    if (o && typeof o === "object") {
      Object.keys(o.cats || {}).forEach(function (k) {
        if (!POR_ID[k]) return;
        var c = o.cats[k] || {}, vis = c.vis !== false, op = limpaOp(c.op);
        if (!(vis && op >= 1)) ESTADO.cats[k] = { vis: vis, op: op };
      });
      Object.keys(o.discOc || {}).forEach(function (k) { if (ID_DISC_VIS[k] && o.discOc[k]) ESTADO.discOc[k] = 1; });
      ESTADO.cotasOc = !!o.cotasOc;
    }
    /* ⚠ a versão só sobe se o estado MUDOU: cada subida manda o js/bim.js refazer o material de todos os modelos (focoAplicar), e isso reinicia o detalhe progressivo das peças — abrir uma vista sem nada gravado não pode custar isso */
    if (JSON.stringify(instantaneo()) !== antes) ESTADO.versao++;
    return !!o;
  }
  function esquecerVista(vista) { var t = lerTudo(); delete t[txt(vista)]; gravarTudo(t); }

  var BimFoco = {
    DISCIPLINAS: DISCIPLINAS, DISC_VIS: DISC_VIS, CATEGORIAS: CATEGORIAS, OUTROS: OUTROS, OPACIDADES: OPACIDADES, FUNDO_OP: FUNDO_OP, DA_FITA: DA_FITA,
    categoriaDe: categoriaDe, disciplinaDe: disciplinaDe, avaliar: avaliar, resumo: resumo, daFita: daFita,
    daVista: daVista, paraVista: paraVista, fundoNaVista: fundoNaVista, DA_VISTA: DA_VISTA, PARA_VISTA: PARA_VISTA,
    separarRotulos: separarRotulos, salvarVista: salvarVista, carregarVista: carregarVista, esquecerVista: esquecerVista, configurar: configurar,
    get: get, set: set, reiniciar: reiniciar, restaurarCategorias: restaurarCategorias, ativo: ativo,
    cotasOc: function () { return !!ESTADO.cotasOc; },
    versao: function () { return ESTADO.versao; }
  };
  global.BimFoco = BimFoco;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFoco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

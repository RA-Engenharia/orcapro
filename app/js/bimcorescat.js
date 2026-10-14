/* =====================================================================
 * bimcorescat.js — CORES POR CATEGORIA no BIM (motor PURO, ES5).
 *
 * Pedido do Rogério (14/10/2026): "uma opção em que cada elemento
 * estrutural tem uma cor, se eu quiser esse filtro: todos os PILARES uma cor,
 * todas as VIGAS outra, todos os elementos PARAMÉTRICOS (escada, guarda-corpo,
 * piso, plataforma, peças prontas) outra, PISO outra, e assim por sequência —
 * para ficar fácil identificar pelas cores. Depois eu posso também deixar
 * aqueles filtros que já tem hoje. Mas quando a gente está modelando esse tipo
 * de estrutura, geralmente usa esses parâmetros."
 *
 * É um modo de MODELAGEM, só de gráfico: não mexe em nada do modelo. Este
 * arquivo é o motor (testável em Node): as categorias e a paleta padrão RA
 * (definida AQUI, num lugar só), o classificador de peça, a escolha de cor por
 * usuário, o liga/desliga por vista, a legenda (contagem) e a transformação do
 * desenho 2D. Quem desenha é o js/bimcorescatui.js; quem pinta o 3D é o
 * js/bim.js (matBase) e o 2D, o js/bim2dui.js + js/desenho2d.js.
 *
 * QUEM MANDA, QUANDO OS DOIS ESTÃO LIGADOS (dito na legenda e na tela):
 *   · as cores por categoria SUBSTITUEM a cor (a do material no 3D; o
 *     preenchimento e o traço da categoria no 2D);
 *   · os filtros de visibilidade (V/G, conjuntos, isolar, 4D, fases)
 *     CONTINUAM ocultando — a cor não traz de volta o que eles escondem;
 *   · a pintura de conjunto, o 4D e a seleção ficam POR CIMA da cor (são
 *     realces explícitos);
 *   · a cor por sistema hidrossanitário é exclusiva: ligar uma desliga a outra.
 *
 * ⚠ A CATEGORIA É PELA FUNÇÃO DA PEÇA, NÃO PELO GERADOR QUE A CRIOU (decisão do
 *   Rogério, 14/10/2026: "mesmo sendo uma peça parametrizada, ela tem que ser
 *   separada por cores: o que for PILAR é a mesma cor de pilar, tudo que é PISO
 *   outra cor, tudo que é GUARDA-CORPO outra cor"). A primeira versão pintava o
 *   mezanino, a escada e o tanque inteiros de uma cor só ("Componentes
 *   paramétricos") e escondia justamente o que ele queria ver: o pilar do
 *   mezanino igual ao pilar do galpão. A ordem das regras é o contrato — o teste
 *   roda os geradores reais e cobra cada papel:
 *     1. Ligações — chapa de ligação, gusset, placa de base, parafuso, chumbador,
 *        solda (um parafuso é parafuso, onde estiver);
 *     2. Guarda-corpos — montante, travessa, corrimão, rodapé, gaiola da escada
 *        de marinheiro, cancela;
 *     3. Tanques — costado, fundo, teto, bocal, sela (o equipamento em si; o pilar,
 *        a viga e o contravento da torre do tanque seguem pela função);
 *     4. Pilares — pilar, coluna, pilarete (até o da rampa);
 *     5. Piso industrial — grade, chapa xadrez, chapa de piso (o DEGRAU não: é da escada);
 *     6. Escadas e rampas — degrau, patamar, rampa, escada de marinheiro e a
 *        longarina da escada (a "Longarina" avulsa só é da escada se a peça pronta é
 *        uma escada: a do skid e a do rack são vigas);
 *     7. Contraventamento — diagonal, contravento, tirante, mão-francesa;
 *     8. Vigas — viga, banzo, trilho, longarina, console, cabeceira, travessa de
 *        peça pronta; 9. Terças — terça, caibro, travessa de fechamento;
 *     10. o que sobrou de um gerador sem função reconhecida fica em "Componentes
 *        paramétricos" (nos geradores de hoje não sobra nada: o teste confere).
 *   Peça que não vem de gerador (IFC importado, desenho do editor) cai pela
 *   classe IFC e pelo nome, como antes.
 *
 * Teste: node tools/test-bimcorescat.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  /* sem acento, minúsculas, espaços únicos: o casamento por palavra é do texto digitado pelo projetista */
  function norm(s) {
    return txt(s).toLowerCase().replace(/[áàâãä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i")
      .replace(/[óòôõö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }
  function ehHex(c) { return /^#[0-9a-fA-F]{6}$/.test(txt(c)); }

  /* ------------------------------------------------------------------
   * AS CATEGORIAS E A PALETA PADRÃO RA — o ÚNICO lugar onde as cores moram.
   * Cada cor tem contraste ≥ 3:1 (gráfico, WCAG 1.4.11) com o papel branco do
   * desenho 2D E com o papel escuro dele (#232323) — conferido no teste — e as
   * 17 ficam separadas entre si (distância Lab ≥ 25, buscada por maximin: com
   * a faixa de luminosidade que serve nos dois fundos sobra pouco espaço, e foi
   * por isso que "Lajes" é verde-azulado, "Paredes" é oliva e "Escadas" é magenta).
   * `ordem` é a da legenda: da estrutura principal para o resto.
   * ------------------------------------------------------------------ */
  var CATEGORIAS = [
    { id: "pilares", nome: "Pilares", cor: "#D93A2B", dica: "Pilares de concreto, aço ou madeira, colunas e pilaretes — também os de mezanino, plataforma, rack, rampa e torre de tanque." },
    { id: "vigas", nome: "Vigas", cor: "#2478D0", dica: "Vigas de concreto, aço ou madeira, vigas de rolamento e de cobertura, banzos, longarinas e consoles de piso e de plataforma." },
    { id: "contravent", nome: "Contraventamento e diagonais", cor: "#8E4FC8", dica: "Contraventos, diagonais, tirantes e mãos-francesas." },
    { id: "tercas", nome: "Terças e travessas", cor: "#E2711A", dica: "Terças, travessas de fechamento, caibros e barras sem outra função declarada." },
    { id: "lajes", nome: "Lajes e pisos de concreto", cor: "#198D76", dica: "Lajes, radier, contrapiso e pisos." },
    { id: "pisoind", nome: "Piso industrial", cor: "#B38B00", dica: "Piso em grade, chapa xadrez, chapa expandida e steel deck — de mezanino, plataforma, passarela e rampa." },
    { id: "guardacorpos", nome: "Guarda-corpos", cor: "#E0489A", dica: "Montantes, travessas, corrimãos, rodapés, cancelas e a gaiola da escada de marinheiro." },
    { id: "escadas", nome: "Escadas e rampas", cor: "#E813EC", dica: "Degraus, patamares, longarinas de escada, escada de marinheiro e rampas." },
    { id: "tanques", nome: "Tanques", cor: "#4B719B", dica: "Costado, fundo, teto, bocais e selas de tanque (o equipamento)." },
    { id: "fundacoes", nome: "Fundações", cor: "#9D633C", dica: "Sapatas, blocos, estacas, baldrames e radier." },
    { id: "paredes", nome: "Paredes", cor: "#6D743E", dica: "Paredes, alvenaria, painéis e fachadas." },
    { id: "esquadrias", nome: "Esquadrias", cor: "#3FA34D", dica: "Portas e janelas." },
    { id: "ligacoes", nome: "Ligações", cor: "#1AA0C2", dica: "Chapas de ligação, gussets, placas de base, parafusos, chumbadores e soldas." },
    { id: "instalacoes", nome: "Instalações", cor: "#6FA010", dica: "Tubos, conexões, louças, eletrodutos, quadros e luminárias." },
    { id: "coberturas", nome: "Coberturas", cor: "#947EC1", dica: "Telhados, telhas e coberturas." },
    { id: "parametricos", nome: "Componentes paramétricos", cor: "#C6798E", dica: "Só o que um gerador criou e a função não foi reconhecida (hoje, nenhum gerador cai aqui)." },
    { id: "outros", nome: "Outros", cor: "#8E959C", dica: "O que não se encaixa nas demais." }
  ];
  var POR_ID = {}; CATEGORIAS.forEach(function (c, i) { c.ordem = i; POR_ID[c.id] = c; });
  var COR_PADRAO = "#8E959C";

  function get(id) { return POR_ID[id] || null; }
  function ids() { return CATEGORIAS.map(function (c) { return c.id; }); }
  function paletaPadrao() { var o = {}; CATEGORIAS.forEach(function (c) { o[c.id] = c.cor; }); return o; }

  /* ------------------------------------------------------------------
   * O CLASSIFICADOR. Recebe um DESCRITOR da peça (campos opcionais — o que
   * a peça não traz, fica de fora), devolve o id da categoria. Puro.
   *   ifc        classe IFC ("IFCBEAM")
   *   nome       nome/descrição da peça; familia  nome da família
   *   edTipo     tipo da caixa do editor ("parede", "laje", "pilar", "viga",
   *              "escada", "guarda", "metal"…)
   *   famCat     categoria da família do editor ("porta", "pilar", "loucas"…)
   *   papel/kind da peça metálica (metal.papel; kind = perfil|chapa|parafuso|mecanica)
   *   pronta/tanque/acessorio  a identidade de peça pronta, tanque e acessório
   *   instalacao true quando a peça é de instalação (tubo, eletroduto…)
   * ------------------------------------------------------------------ */
  var RX = {
    ligacao: /gusset|chapa de (base|topo|extremidade|ligacao|apoio|reforco|assento|fixacao|emenda|cisalhamento|ancoragem|extensao)|chapa (simples|de topo curta)|placa de base|cantoneira de (ligacao|topo|assento)|enrijecedor|\bclip\b|chumbador|parafuso|porca|arruela|solda|cadeira de ancoragem|suporte \((base|aba)\)|base da coluna|capitel da coluna|^chapa$/,
    guarda: /guarda|corrimao|rodape|gaiola|cancela/,
    tanquePeca: /costado|fundo|^teto|tampo|bocal|pescoco|boca de visita|mastro|indicador|sela\b|anel anular|^flange/,
    pilar: /^pilar|^coluna|pilarete|^pe de apoio/,
    pisoInd: /(^| )piso( |$)|painel de piso|\(grade\)|\bgrade\b|steel ?deck|xadrez|expandida|perfurada|gradil|chapa de piso/,
    /* "^viga": a "Viga de borda do piso" e a "Viga intermediária do piso" (piso por contorno, 1.2.143)
       são VIGAS — a palavra "piso" no fim do papel não faz delas piso industrial */
    naoPiso: /^viga|degrau|corrimao|guarda|gaiola|montante|rodape|marinheiro|longarina|console|consolo|travessa|mao.francesa|suporte do|contravent|diagonal|tirante|escada/,
    escada: /degrau|escada|rampa|patamar|helicoidal|marinheiro|espelho|antiderrapante/,
    apoioEscada: /longarina|travessa|viga|montante|mastro/,
    contravent: /contravent|diagonal|tirante|mao.francesa|cruz de santo/,
    viga: /^viga|trilho|banzo|longarina|consolo|console|cabeceira/,
    terca: /terca|caibro|ripa|correia|travessa/,
    fundacao: /sapata|bloco de fundacao|bloco de coroamento|estaca|tubulao|baldrame|radier|fundacao|brocas?\b|viga de equilibrio/,
    pisoNome: /grade|gradil|xadrez|steel ?deck|expandida|perfurada|piso (metalico|industrial|em chapa|em grade)/,
    concreto: /concreto|radier|laje/,
    parede: /parede|alvenaria|painel|fachada|vedacao|muro/,
    cobertura: /telha|cobertura|telhado|teto em|caibro/
  };

  function ehInstalacaoIfc(t) {
    return /^(PIPE|DUCT|CABLE|FLOW|DISTRIBUTION|ELECTRIC|LIGHTFIXTURE|OUTLET|SWITCHINGDEVICE|LAMP|PROTECTIVEDEVICE|SANITARYTERMINAL|WASTETERMINAL|VALVE|PUMP|FIRESUPPRESSION|ALARM|SENSOR|AIRTERMINAL|BOILER|CHILLER|FAN|FILTER|HEATEXCHANGER|INTERCEPTOR|JUNCTIONBOX|COMMUNICATIONSAPPLIANCE|AUDIOVISUALAPPLIANCE|SPACEHEATER|TRANSFORMER|MOTORCONNECTION|UNITARYEQUIPMENT)/.test(t);
  }

  /* a FUNÇÃO de uma peça de gerador, lida do papel (o texto que o gerador grava em metal.papel).
     `ctx` = o tipo da peça pronta a que ela pertence (escada, rack, skid, treliça…): o mesmo
     "Longarina" é da escada numa escada e é viga num rack ou num skid. Devolve null se não reconhece. */
  function funcaoDoPapel(papel, ctx, d) {
    var daEscada = /^(escada|rampa|helicoidal|marinheiro)$/.test(ctx), gerada = !!(d.pronta || d.tanque);
    if (RX.guarda.test(papel)) return "guardacorpos";
    if (d.tanque && RX.tanquePeca.test(papel)) return "tanques";
    if (RX.pilar.test(papel)) return "pilares";
    if (RX.pisoInd.test(papel) && !RX.naoPiso.test(papel)) return "pisoind";
    /* o contraventamento vem antes da escada: o "Contraventamento do patamar" é contraventamento, não escada */
    if (RX.contravent.test(papel)) return "contravent";
    if (RX.escada.test(papel) || (daEscada && RX.apoioEscada.test(papel))) return "escadas";
    if (ctx === "trelica") {   /* a treliça lida como estrutura: o banzo é viga, a diagonal é contraventamento, o montante é barra */
      if (/^montante/.test(papel)) return "tercas";
    }
    if (/^montante/.test(papel)) return "pilares";
    if (RX.viga.test(papel)) return "vigas";
    if (/fechamento/.test(papel)) return "tercas";
    if (/^travessa|travessa (do|da|de) /.test(papel) && gerada) return "vigas";   /* a travessa de rack, skid, mezanino e torre é a viga transversal */
    if (RX.terca.test(papel)) return "tercas";
    return null;
  }

  function categoria(d) {
    d = obj(d);
    var ifc = txt(d.ifc).toUpperCase().replace(/^IFC/, ""), papel = norm(d.papel), kind = txt(d.kind), tipoEd = txt(d.edTipo);
    var nome = norm(txt(d.nome) + " " + txt(d.familia)), tudo = (papel + " " + nome).replace(/^ +| +$/g, "");
    var gerada = !!(d.pronta || d.tanque || d.acessorio || d.acesso);

    /* 1) LIGAÇÕES — a peça é parafuso, solda ou chapa de ligação (e o flange que não é de bocal de tanque) */
    if (kind === "parafuso" || /^(MECHANICALFASTENER|FASTENER|DISCRETEACCESSORY)/.test(ifc)) return "ligacoes";
    if (papel && RX.ligacao.test(papel) && !(RX.pisoInd.test(papel) && !RX.naoPiso.test(papel))) return "ligacoes";
    if (papel === "flange" && !d.tanque) return "ligacoes";
    if (!tipoEd && ifc === "PLATE" && !RX.parede.test(nome) && !/vidro|painel|fachada|cortina|esquadria/.test(nome) && !RX.pisoNome.test(nome)) return "ligacoes";

    /* 2) A FUNÇÃO lida do papel (peça de gerador: galpão, peça pronta, acesso, tanque) */
    if (papel) {
      var f = funcaoDoPapel(papel, txt(d.prontaTipo), d);
      if (f) return f;
    }
    if (tipoEd === "metal" && kind === "chapa") return "ligacoes";   /* chapa avulsa sem função declarada: de ligação */
    if (d.tanque) return "tanques";
    if (gerada) return "parametricos";

    /* 3) piso industrial importado/desenhado sem papel (o nome diz grade, xadrez…) */
    if (!papel && RX.pisoNome.test(nome) && !RX.concreto.test(nome) && /^(SLAB|PLATE|COVERING|MEMBER|BUILDINGELEMENTPROXY)$/.test(ifc || "SLAB")) return "pisoind";

    /* 4) escada, guarda-corpo e tanque do editor e do IFC */
    if (tipoEd === "escada" || /^(STAIR|STAIRFLIGHT|RAMP|RAMPFLIGHT)$/.test(ifc)) return "escadas";
    if (tipoEd === "guarda" || ifc === "RAILING") return "guardacorpos";
    if (ifc === "TANK") return "tanques";

    /* 5) a classe e o nome */
    if (tipoEd === "fundacao" || /^(FOOTING|PILE|CAISSON)$/.test(ifc) || d.famCat === "fundacao") return "fundacoes";
    if (/^(BEAM|MEMBER|SLAB|COLUMN)$/.test(ifc) && RX.fundacao.test(tudo)) return "fundacoes";
    if (tipoEd === "pilar" || d.famCat === "pilar" || ifc === "COLUMN" || RX.pilar.test(papel)) return "pilares";
    if (tipoEd === "viga" || d.famCat === "viga" || ifc === "BEAM") return "vigas";
    if (ifc === "MEMBER" || d.famCat === "estrutural" || tipoEd === "metal") {
      if (RX.contravent.test(tudo)) return "contravent";
      return "tercas";
    }
    if (tipoEd === "laje" || ifc === "SLAB" || d.famCat === "laje" || d.famCat === "piso") return "lajes";
    if (ifc === "COVERING") {
      if (/forro|gesso|drywall|ceiling/.test(nome)) return "outros";
      if (RX.cobertura.test(nome)) return "coberturas";
      return "lajes";   /* IfcCovering sem forro no nome: revestimento de piso */
    }
    if (tipoEd === "cobertura" || ifc === "ROOF" || d.famCat === "cobertura") return "coberturas";
    if (tipoEd === "parede" || /^(WALL|WALLSTANDARDCASE|CURTAINWALL)$/.test(ifc) || d.famCat === "parede") return "paredes";
    if (ifc === "DOOR" || ifc === "WINDOW" || d.famCat === "porta" || d.famCat === "janela") return "esquadrias";
    /* exportador que manda tudo como 'elemento genérico': o nome da peça decide (só quando a classe não disse nada) */
    if (!ifc || ifc === "BUILDINGELEMENTPROXY") {
      if (/^(pilar|coluna)\b/.test(nome)) return "pilares";
      if (/^viga\b/.test(nome)) return "vigas";
      if (/^laje\b/.test(nome)) return "lajes";
      if (/^parede\b/.test(nome)) return "paredes";
      if (/^(sapata|estaca|bloco de fundacao|bloco de coroamento)\b/.test(nome)) return "fundacoes";
      if (/^(porta|janela)\b/.test(nome)) return "esquadrias";
    }
    if (d.instalacao || ehInstalacaoIfc(ifc) || /^(loucas|equipamento|acessorio_tubo|conexao_tubo|conexao_duto|dispositivo_eletrico|luminaria|equipamento_eletrico|conexao_eletroduto)$/.test(txt(d.famCat))) return "instalacoes";
    return "outros";
  }

  /* O DESCRITOR a partir do que o produto TEM — o viewer e o teste usam estas duas,
     então a regra provada é a que roda na tela.
       caixa  = a caixa do editor (js/bimedit.js): tipo, ifc, metal{kind,papel,acessorio}, pronta, tanque…
       elem   = o elemento do modelo (js/bim.js): tipo (classe IFC), nome, familia
       extra  = { famCat } (categoria da família do editor) */
  function descritorDeCaixa(c, extra) {
    c = obj(c); var m = obj(c.metal), d = { ifc: c.ifc, edTipo: c.tipo, nome: m.nome || c.nome || "", papel: m.papel, kind: m.kind };
    if (c.pronta) d.pronta = c.pronta;
    if (c.tanque) d.tanque = c.tanque;
    if (m.acessorio) d.acessorio = m.acessorio;
    if (c.galpao) d.galpao = c.galpao;
    if (extra && extra.famCat) d.famCat = extra.famCat;
    /* o tipo da peça pronta (escada, rack, skid…) mora só na 1ª peça (prontaInfo): o chamador passa o mapa */
    if (c.pronta && extra && extra.prontaTipos && extra.prontaTipos[c.pronta]) d.prontaTipo = extra.prontaTipos[c.pronta];
    else if (c.prontaInfo && c.prontaInfo.tipo) d.prontaTipo = c.prontaInfo.tipo;
    return d;
  }
  /* pronta id → tipo, lido das caixas (a 1ª peça de cada lote leva prontaInfo.tipo) */
  function tiposDePronta(caixas) {
    var o = {}; arr(caixas).forEach(function (c) { if (c && c.pronta && c.prontaInfo && c.prontaInfo.tipo) o[String(c.pronta)] = String(c.prontaInfo.tipo); });
    return o;
  }
  function descritorDeElemento(e, extra) {
    e = obj(e); var d = { ifc: e.tipo, nome: e.nome, familia: txt(typeof e.familia === "string" ? e.familia : "") };
    if (extra && extra.famCat) d.famCat = extra.famCat;
    if (extra && extra.instalacao) d.instalacao = true;
    return d;
  }

  /* ------------------------------------------------------------------
   * COR — validação, mistura e contraste (a UI e os testes usam)
   * ------------------------------------------------------------------ */
  function rgb(h) { h = txt(h).replace("#", ""); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function hex(r, g, b) {
    function p(x) { x = Math.max(0, Math.min(255, Math.round(x))); return (x < 16 ? "0" : "") + x.toString(16); }
    return "#" + p(r) + p(g) + p(b);
  }
  /* escurece a cor misturando com preto (f 0..1): o traço da categoria no 2D */
  function escurecer(h, f) { var c = rgb(h); return hex(c[0] * (1 - f), c[1] * (1 - f), c[2] * (1 - f)); }
  function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(h) { var c = rgb(h); return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function contraste(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function lab(h) {
    var c = rgb(h), r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
    var X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, Y = r * 0.2126 + g * 0.7152 + b * 0.0722, Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116; }
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  function distancia(a, b) { var p = lab(a), q = lab(b); return Math.sqrt(Math.pow(p[0] - q[0], 2) + Math.pow(p[1] - q[1], 2) + Math.pow(p[2] - q[2], 2)); }

  /* ------------------------------------------------------------------
   * A ESCOLHA DA PESSOA — por usuário e aparelho (localStorage; sem ele, memória)
   *   paleta:  orcapro:bim:cores-cat:paleta        { categoria: "#rrggbb" } só o que mudou
   *   vistas:  orcapro:bim:cores-cat:vistas:<obra> { ligadas:{vista:1}, ocultas:{vista:{cat:1}}, imprimir:{vista:1} }
   * ------------------------------------------------------------------ */
  var CHAVE_PALETA = "orcapro:bim:cores-cat:paleta";
  var CHAVE_VISTAS = "orcapro:bim:cores-cat:vistas:";
  var memoria = {};
  var obraAtual = "geral";
  function ler(chave) {
    var bruto = null;
    try { bruto = global.localStorage ? global.localStorage.getItem(chave) : null; } catch (e) { bruto = null; }
    if (bruto == null) bruto = memoria.hasOwnProperty(chave) ? memoria[chave] : null;
    if (bruto == null) return null;
    try { return JSON.parse(bruto); } catch (e2) { return null; }   /* corrompido: ignora e segue com o padrão, nunca trava a tela */
  }
  function gravar(chave, valor) {
    var s = JSON.stringify(valor);
    memoria[chave] = s;
    try { if (global.localStorage) global.localStorage.setItem(chave, s); return true; } catch (e) { return false; }
  }
  var cachePaleta = null;
  function lerPaleta() {
    if (cachePaleta) return cachePaleta;
    var salvo = obj(ler(CHAVE_PALETA)), o = {};
    Object.keys(salvo).forEach(function (k) { if (POR_ID[k] && ehHex(salvo[k])) o[k] = salvo[k].toLowerCase(); });
    cachePaleta = o;
    return o;
  }
  function paleta() {
    var p = paletaPadrao(), pers = lerPaleta();
    Object.keys(pers).forEach(function (k) { p[k] = pers[k]; });
    return p;
  }
  function corDe(id) { var p = paleta(); return p[id] || COR_PADRAO; }
  function definirCor(id, cor) {
    if (!POR_ID[id]) return { ok: false, motivo: "Categoria desconhecida." };
    if (!ehHex(cor)) return { ok: false, motivo: "Cor inválida: use #rrggbb." };
    var pers = JSON.parse(JSON.stringify(lerPaleta())); cor = cor.toLowerCase();
    if (cor === POR_ID[id].cor.toLowerCase()) delete pers[id]; else pers[id] = cor;   /* igual ao padrão não ocupa espaço */
    cachePaleta = pers;
    gravar(CHAVE_PALETA, pers);
    return { ok: true, cor: cor };
  }
  function voltarPadrao() { cachePaleta = {}; gravar(CHAVE_PALETA, {}); return paleta(); }
  function personalizada() { return Object.keys(lerPaleta()).length > 0; }

  var cacheVistas = null, cacheVistasObra = null;
  function estadoVistas() {
    if (cacheVistas && cacheVistasObra === obraAtual) return cacheVistas;
    var e = obj(ler(CHAVE_VISTAS + obraAtual));
    e.ligadas = obj(e.ligadas); e.ocultas = obj(e.ocultas); e.imprimir = obj(e.imprimir);
    cacheVistas = e; cacheVistasObra = obraAtual;
    return e;
  }
  /* ⚠ só a {3D} e as vistas 2D (planta, corte, elevação) têm id ESTÁVEL entre sessões. Uma vista 3D extra ("v1", "v2"…) nasce de novo a cada
     abertura: guardar o liga/desliga dela faria a próxima "v1" herdar a cor da anterior. Fica na memória da sessão, e só. */
  function persistente(v) { return v === "3d" || /^d2[a-z]-/.test(v); }
  function gravarVistas() {
    var e = estadoVistas(), o = { ligadas: {}, ocultas: {}, imprimir: {} };
    ["ligadas", "ocultas", "imprimir"].forEach(function (g) { Object.keys(e[g]).forEach(function (v) { if (persistente(v)) o[g][v] = e[g][v]; }); });
    gravar(CHAVE_VISTAS + obraAtual, o);
  }
  function configurar(cfg) {
    cfg = cfg || {};
    if (cfg.obra != null && txt(cfg.obra) !== obraAtual) { obraAtual = txt(cfg.obra) || "geral"; cacheVistas = null; }
    if (cfg.recarregar) { cachePaleta = null; cacheVistas = null; }
    return obraAtual;
  }
  function esquecer() { memoria = {}; cachePaleta = null; cacheVistas = null; }   /* os testes */

  function ligadoEm(vista) { return !!estadoVistas().ligadas[txt(vista)]; }
  function ligar(vista, on) {
    var e = estadoVistas(), v = txt(vista);
    if (!v) return false;
    if (on) e.ligadas[v] = 1; else { delete e.ligadas[v]; }
    gravarVistas();
    return !!e.ligadas[v];
  }
  function alternar(vista) { return ligar(vista, !ligadoEm(vista)); }
  function vistasLigadas() { return Object.keys(estadoVistas().ligadas); }

  function ocultasEm(vista) { var o = obj(estadoVistas().ocultas[txt(vista)]), r = {}; Object.keys(o).forEach(function (k) { if (POR_ID[k]) r[k] = 1; }); return r; }
  function categoriaOculta(vista, cat) { return !!ocultasEm(vista)[cat]; }
  function definirOcultas(vista, mapa) {
    var e = estadoVistas(), v = txt(vista), o = {};
    Object.keys(obj(mapa)).forEach(function (k) { if (POR_ID[k] && mapa[k]) o[k] = 1; });
    if (Object.keys(o).length) e.ocultas[v] = o; else delete e.ocultas[v];
    gravarVistas();
    return o;
  }
  /* clique na legenda: oculta/mostra aquela categoria */
  function alternarOculta(vista, cat) {
    if (!POR_ID[cat]) return ocultasEm(vista);
    var o = ocultasEm(vista); if (o[cat]) delete o[cat]; else o[cat] = 1;
    return definirOcultas(vista, o);
  }
  /* Shift+clique: isola — oculta TODAS as outras presentes; de novo (já isolada), mostra tudo */
  function isolar(vista, cat, presentes) {
    if (!POR_ID[cat]) return ocultasEm(vista);
    var pres = arr(presentes).filter(function (c) { return POR_ID[c]; });
    var o = ocultasEm(vista), jaIsolada = !o[cat] && pres.length > 1 && pres.every(function (c) { return c === cat ? !o[c] : !!o[c]; });
    if (jaIsolada) return definirOcultas(vista, {});
    var novo = {}; pres.forEach(function (c) { if (c !== cat) novo[c] = 1; });
    return definirOcultas(vista, novo);
  }
  function mostrarTodas(vista) { return definirOcultas(vista, {}); }

  function imprimirComCores(vista) { return !!estadoVistas().imprimir[txt(vista)]; }
  function definirImprimir(vista, on) {
    var e = estadoVistas(), v = txt(vista); if (!v) return false;
    if (on) e.imprimir[v] = 1; else delete e.imprimir[v];
    gravarVistas();
    return !!e.imprimir[v];
  }
  /* a vista saiu (apagada/fechada): não deixa lixo no armazenamento */
  function esquecerVista(vista) {
    var e = estadoVistas(), v = txt(vista);
    delete e.ligadas[v]; delete e.ocultas[v]; delete e.imprimir[v];
    gravarVistas();
  }

  /* ------------------------------------------------------------------
   * A LEGENDA — as categorias PRESENTES, na ordem da paleta, com cor e contagem.
   *   contagem: { catId: n }   (de uids distintos)
   * ------------------------------------------------------------------ */
  function legenda(contagem, vista) {
    var cont = obj(contagem), pal = paleta(), oc = vista != null ? ocultasEm(vista) : {};
    return CATEGORIAS.filter(function (c) { return cont[c.id] > 0; }).map(function (c) {
      return { id: c.id, nome: c.nome, cor: pal[c.id] || COR_PADRAO, n: cont[c.id], oculta: !!oc[c.id] };
    });
  }

  /* ------------------------------------------------------------------
   * O DESENHO 2D. Pura: recebe os dados extraídos da vista (cortes, linhas,
   * portas, acima) e os estilos por chave (p6Estilos), devolve CÓPIAS rasas com
   * a chave nova de cada contorno/aresta e os estilos novos — o original (que a
   * prancha e o DXF também leem) fica intacto. Cada chave nova é
   * "cc:<categoria>|<chave antiga>": a pena, o padrão de linha e a visibilidade
   * (V/G, filtros) continuam os da chave antiga; só a COR muda — traço escuro da
   * categoria e preenchimento sólido da categoria.
   *   catDe(uid, tipoIfc) → id da categoria
   * ------------------------------------------------------------------ */
  function pintar2D(dados, estilos, op) {
    op = op || {};
    var catDe = typeof op.catDe === "function" ? op.catDe : function () { return "outros"; };
    var pal = op.paleta || paleta(), ocultas = op.ocultas || {};
    var est = {}, antigos = obj(estilos), conta = {}, uidsPorCat = {};
    Object.keys(antigos).forEach(function (k) { est[k] = antigos[k]; });
    function chaveDe(u, t, kAntiga) {
      var cat = u || t ? catDe(u, t) : "outros";
      if (!POR_ID[cat]) cat = "outros";
      var nova = "cc:" + cat + "|" + (kAntiga || "_");
      if (!est[nova]) {
        var base = obj(antigos[kAntiga] || antigos._), cor = ehHex(pal[cat]) ? pal[cat] : COR_PADRAO, s = {};
        Object.keys(base).forEach(function (k) { s[k] = base[k]; });
        s.cor = escurecer(cor, 0.35); s.meioTom = false; s.preench = "solido"; s.corPreench = cor; s.corCat = cor;
        s.visivel = base.visivel !== false && !ocultas[cat];
        est[nova] = s;
      }
      if (u) { (uidsPorCat[cat] = uidsPorCat[cat] || {})[u] = 1; }
      return { k: nova, cat: cat };
    }
    var d = dados || {}, out = {};
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
    out.cortes = arr(d.cortes).map(function (c) {
      var r = chaveDe(c.u, c.t, c.k), n = {}; Object.keys(c).forEach(function (q) { n[q] = c[q]; }); n.k = r.k; n._cat = r.cat; return n;
    });
    var ud = arr(d.linhasUd);
    out.linhasK = arr(d.linhas).map(function (l, i) { var u = ud[i] || {}; return chaveDe(u.u, u.t, arr(d.linhasK)[i]).k; });
    /* a porta de uma categoria escondida (Esquadrias) sai junto: o símbolo não fica solto no desenho */
    out.portas = arr(d.portas).map(function (p) {
      if (!p) return p;
      var r = chaveDe(p.u, p.t || "IFCDOOR", p.k), n = {}; Object.keys(p).forEach(function (q) { n[q] = p[q]; }); n.k = r.k; n._cat = r.cat; return n;
    }).filter(function (p) { return !p || !ocultas[p._cat]; });
    out.acima = arr(d.acima).map(function (it) {
      if (!it) return it;
      var cat = it.u || it.t ? catDe(it.u, it.t) : "outros"; if (!POR_ID[cat]) cat = "outros";
      if (it.u) (uidsPorCat[cat] = uidsPorCat[cat] || {})[it.u] = 1;
      var n = {}; Object.keys(it).forEach(function (q) { n[q] = it[q]; }); n.cor = pal[cat] || COR_PADRAO; n._cat = cat; n._oculta = !!ocultas[cat];
      return n;
    }).filter(function (it) { return !it || !it._oculta; });
    Object.keys(uidsPorCat).forEach(function (c) { conta[c] = Object.keys(uidsPorCat[c]).length; });
    return { dados: out, estilos: est, contagem: conta };
  }

  var BimCoresCat = {
    CATEGORIAS: CATEGORIAS, CHAVE_PALETA: CHAVE_PALETA, CHAVE_VISTAS: CHAVE_VISTAS, COR_PADRAO: COR_PADRAO, RX: RX,
    ids: ids, get: get, paletaPadrao: paletaPadrao, paleta: paleta, corDe: corDe, definirCor: definirCor, voltarPadrao: voltarPadrao, personalizada: personalizada,
    categoria: categoria, tiposDePronta: tiposDePronta, descritorDeCaixa: descritorDeCaixa, descritorDeElemento: descritorDeElemento,
    configurar: configurar, esquecer: esquecer,
    ligadoEm: ligadoEm, ligar: ligar, alternar: alternar, vistasLigadas: vistasLigadas, esquecerVista: esquecerVista,
    ocultasEm: ocultasEm, categoriaOculta: categoriaOculta, definirOcultas: definirOcultas, alternarOculta: alternarOculta, isolar: isolar, mostrarTodas: mostrarTodas,
    imprimirComCores: imprimirComCores, definirImprimir: definirImprimir,
    legenda: legenda, pintar2D: pintar2D,
    cor: { ehHex: ehHex, escurecer: escurecer, luminancia: lum, contraste: contraste, distancia: distancia, rgb: rgb, hex: hex },
    norm: norm
  };
  global.BimCoresCat = BimCoresCat;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCoresCat;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

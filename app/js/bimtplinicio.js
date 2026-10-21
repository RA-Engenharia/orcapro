/* =====================================================================
 * bimtplinicio.js — COMEÇAR UM PROJETO PELO TEMPLATE (20/10/2026)
 *
 * Pedido do Rogério: "Quando abro o BIM para começar uma obra do zero, ele
 * já começa no 3D, e às vezes não tenho arquivo para puxar. Não tenho a
 * opção de abrir a planta baixa; só depois que puxo uma parede é que a
 * planta baixa libera. Tem de abrir na PLANTA BAIXA e estar liberada para
 * começar o projeto. O TEMPLATE já tem de estar pré-configurado, e a pessoa
 * escolhe em qual disciplina quer abrir."
 *
 * Este arquivo é o MOTOR PURO (Node-testável: tools/test-bim-tpl-inicio.js):
 *   • o CATÁLOGO dos templates de início — Universal, Arquitetura, Estrutura
 *     (concreto, metálica, madeira), Hidrossanitário (completo e cada
 *     disciplina do js/hidtemplates.js), Elétrica e Climatização;
 *   • o PLANO de cada um: níveis (Térreo + pavimentos + Cobertura; Fundação
 *     na estrutura), as vistas (planta baixa de cada nível, Corte A e B,
 *     as quatro elevações e o 3D), a disciplina da fita, a ferramenta
 *     inicial e o .optpl de base (penas, estilos, prancha com carimbo RA);
 *   • o "lembrar como padrão" (por aparelho).
 * Quem aplica na tela é o Gestao._tplIniAplicar (js/gestao.js); quem mostra
 * a escolha é o diálogo Novo projeto e a Área de teste (js/bimprojetosui.js).
 *
 * ⚠ NÃO FINGIR CONTEÚDO. Template de disciplina que ainda não tem conteúdo
 *   próprio (Elétrica, Estrutura de concreto, Estrutura metálica) nasce do
 *   Universal — níveis, vistas, penas e prancha RA — com a disciplina e a
 *   ferramenta certas, e o `aviso` diz isso na tela. Só os que têm .optpl de
 *   verdade (js/templatesra.js, js/hidtemplates.js) levam `proprio: true`.
 * ⚠ Nenhum número de norma aqui: pé-direito e pavimentos vêm do diálogo
 *   (ponto de partida editável); o resto vem dos módulos citados.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE = "orcapro:bim:tpl-inicio:padrao";
  var BASE_UNIVERSAL = "ra-tpl-residencial-terreo";
  var AVISO_UNIVERSAL = function (nome) {
    return nome + " ainda não tem template próprio: nasce do Universal (níveis, vistas, penas e prancha com carimbo RA), com a fita e a ferramenta de " + nome + ".";
  };

  /* os grupos da tela, na ordem dos cartões. `variantes` = a lista de baixo
     do cartão (Estrutura: concreto/metálica/madeira; Hidro: cada disciplina) */
  var GRUPOS = [
    { id: "universal", nome: "Universal", sub: "Todas as disciplinas", icone: "camadas",
      descricao: "Arquitetura, estrutura e instalações na mesma fita. Plantas de cada nível, cortes A e B, elevações e 3D; penas e prancha RA.",
      variantes: [{ id: "universal", nome: "Universal", disciplina: "completo", base: BASE_UNIVERSAL, proprio: true, ferramenta: "parede" }] },
    { id: "arquitetura", nome: "Arquitetura", sub: "Arquitetura & Civil", icone: "parede",
      descricao: "Paredes de fachada, internas e de área molhada, lajes, portas, janelas e louças da biblioteca RA; plantas e cortes em 1:50.",
      variantes: [{ id: "arquitetura", nome: "Arquitetura", disciplina: "civil", base: BASE_UNIVERSAL, proprio: true, ferramenta: "parede" }] },
    { id: "estrutura", nome: "Estrutura", sub: "Concreto, metálica ou madeira", icone: "estrutura",
      descricao: "Nível de fundação, eixos e a fita da estrutura escolhida.",
      variantes: [
        { id: "estrutura-concreto", nome: "Concreto armado", disciplina: "estrutura", base: BASE_UNIVERSAL, proprio: false, ferramenta: "eixo", fundacao: true },
        { id: "estrutura-metalica", nome: "Metálica", disciplina: "metalica", base: BASE_UNIVERSAL, proprio: false, ferramenta: "eixo", fundacao: true },
        { id: "estrutura-madeira", nome: "Madeira", disciplina: "marcenaria", base: "ra-tpl-estrutura-madeira", proprio: true, ferramenta: "eixo", fundacao: true }
      ] },
    { id: "hidro", nome: "Hidrossanitário", sub: "Completo ou por disciplina", icone: "link",
      descricao: "Tipos de tubo e conexões, filtros por sistema, modelos de vista e o conjunto de pranchas HID do padrão RA.",
      variantes: [
        { id: "hid-completo", nome: "Hidrossanitário completo", hid: "disc-completo" },
        { id: "hid-agua-fria", nome: "Água fria", hid: "disc-agua-fria" },
        { id: "hid-agua-quente", nome: "Água quente", hid: "disc-agua-quente" },
        { id: "hid-esgoto", nome: "Esgoto e ventilação", hid: "disc-esgoto" },
        { id: "hid-pluvial", nome: "Águas pluviais", hid: "disc-pluvial" },
        { id: "hid-incendio", nome: "Incêndio", hid: "disc-incendio" },
        { id: "hid-gas", nome: "Gás combustível (GN/GLP)", hid: "disc-gas" },
        { id: "hid-industrial", nome: "Fluidos industriais", hid: "disc-industrial" },
        { id: "hid-tratamento", nome: "Tratamento (fossa, filtro, ETE, ETA)", hid: "disc-tratamento" }
      ].map(function (v) { v.disciplina = "hidraulica"; v.base = v.hid; v.proprio = true; v.ferramenta = "tubo"; return v; }) },
    { id: "eletrica", nome: "Elétrica", sub: "Elétrica & Dados", icone: "raio",
      descricao: "A fita da Elétrica (eletroduto, tomadas, quadros, luminárias) sobre as vistas do Universal.",
      variantes: [{ id: "eletrica", nome: "Elétrica", disciplina: "eletrica", base: BASE_UNIVERSAL, proprio: false, ferramenta: "eletroduto" }] },
    { id: "climatizacao", nome: "Climatização", sub: "Ar-condicionado e dreno", icone: "vento",
      descricao: "Evaporadoras, condensadoras, linhas frigorígenas e dreno; pranchas CLI do padrão RA (na fita Hidráulica & Sanitária).",
      variantes: [{ id: "climatizacao", nome: "Climatização", disciplina: "hidraulica", base: "disc-climatizacao", hid: "disc-climatizacao", proprio: true, ferramenta: "aparelho" }] }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, pad) { var n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : pad; }
  function r2(v) { return Math.round(v * 100) / 100; }

  function acharVar(id) {
    var r = null;
    GRUPOS.forEach(function (g) { g.variantes.forEach(function (v) { if (v.id === id) r = { grupo: g, v: v }; }); });
    return r;
  }

  var BimTplInicio = {
    PADRAO: "universal",
    CHAVE: CHAVE,
    /* os cartões da tela: [{ id, nome, sub, descricao, icone, variantes:[{id,nome,proprio,aviso}] }] */
    grupos: function () {
      return GRUPOS.map(function (g) {
        return { id: g.id, nome: g.nome, sub: g.sub, descricao: g.descricao, icone: g.icone,
          variantes: g.variantes.map(function (v) { return { id: v.id, nome: v.nome, proprio: !!v.proprio, aviso: v.proprio ? "" : AVISO_UNIVERSAL(v.nome) }; }) };
      });
    },
    ids: function () { var l = []; GRUPOS.forEach(function (g) { g.variantes.forEach(function (v) { l.push(v.id); }); }); return l; },
    /* o template inteiro (cópia): { id, nome, grupo, disciplina, base, proprio, ferramenta, fundacao, hid, aviso } */
    obter: function (id) {
      var a = acharVar(id);
      if (!a) return null;
      var t = clone(a.v);
      t.grupo = a.grupo.id;
      t.nomeCompleto = a.grupo.variantes.length > 1 ? a.grupo.nome + " · " + a.v.nome : a.v.nome;
      t.aviso = t.proprio ? "" : AVISO_UNIVERSAL(a.v.nome);
      return t;
    },
    grupoDe: function (id) { var a = acharVar(id); return a ? a.grupo.id : null; },
    /* a 1ª variante do grupo (o cartão clicado sem escolher variante) */
    primeiraDo: function (grupoId) { var g = null; GRUPOS.forEach(function (x) { if (x.id === grupoId) g = x; }); return g ? g.variantes[0].id : null; },

    /* ------------------------------------------------------------- O PLANO
     * cfg = { pavimentos, peDireito, largura, comprimento } (os do diálogo).
     * Devolve { ok, template, niveis:[{id,nome,elevacao,corte,peDireitoDeclarado?}],
     *   caixa:{min:[x,y,z],max:[x,y,z]} (a área de trabalho do desenho, em metro),
     *   cortes:[{letra, ax,az,bx,bz}], elevacoes:["norte","sul","leste","oeste"],
     *   vistas:[nomes], vistaInicial:"planta", nivelInicial, disciplina, ferramenta }.
     * Os ids dos níveis são os de sempre do Novo projeto ("nivel-1"…, "nivel-cob"),
     * mais "nivel-fund" na estrutura. */
    plano: function (id, cfg) {
      var t = this.obter(id);
      if (!t) return { ok: false, erro: "Template desconhecido: " + id };
      cfg = cfg || {};
      var np = Math.max(1, Math.min(30, Math.round(num(cfg.pavimentos, 1)))), pd = num(cfg.peDireito, 2.8);
      if (!(pd > 0)) return { ok: false, erro: "Pé-direito precisa ser maior que zero." };
      var L = num(cfg.largura, 0), C = num(cfg.comprimento, 0);
      if (!(L > 0)) L = 12; if (!(C > 0)) C = 10;
      var niveis = [], i;
      if (t.fundacao) niveis.push({ id: "nivel-fund", nome: "Fundação", elevacao: -1, corte: 1.2 });
      for (i = 0; i < np; i++) niveis.push({ id: "nivel-" + (i + 1), nome: i === 0 ? "Térreo" : (i + "º pavimento"), elevacao: r2(i * pd), corte: 1.2 });
      niveis.push({ id: "nivel-cob", nome: "Cobertura", elevacao: r2(np * pd), corte: 1.2, peDireitoDeclarado: pd });
      var topo = r2(np * pd), m = 1;
      var caixa = { min: [0, 0, 0], max: [L, topo, C] };
      /* Corte A ao longo do lado maior, Corte B atravessado, pelo meio (a mesma
         regra do "Longitudinal/Transversal pelo meio" do Navegador) */
      var cx = L / 2, cz = C / 2, longoX = L >= C;
      var cortes = [
        longoX ? { letra: "A", ax: -m, az: cz, bx: L + m, bz: cz } : { letra: "A", ax: cx, az: C + m, bx: cx, bz: -m },
        longoX ? { letra: "B", ax: cx, az: C + m, bx: cx, bz: -m } : { letra: "B", ax: -m, az: cz, bx: L + m, bz: cz }
      ];
      var elevacoes = ["norte", "sul", "leste", "oeste"];
      var vistas = niveis.map(function (n) { return "Planta baixa — " + n.nome; })
        .concat(["Corte A", "Corte B", "Elevação Norte", "Elevação Sul", "Elevação Leste", "Elevação Oeste", "{3D}"]);
      return { ok: true, template: t, niveis: niveis, caixa: caixa, cortes: cortes, elevacoes: elevacoes, vistas: vistas,
        vistaInicial: "planta", nivelInicial: "nivel-1", disciplina: t.disciplina, ferramenta: t.ferramenta };
    },

    /* --------------------------------------------- "lembrar como padrão" */
    padrao: function (ls) {
      var L = ls || global.localStorage, v = null;
      try { v = L ? L.getItem(CHAVE) : null; } catch (e) { v = null; }
      return v && acharVar(v) ? v : null;
    },
    lembrar: function (id, ls) {
      var L = ls || global.localStorage;
      if (id && !acharVar(id)) return false;
      try { if (!L) return false; if (id) L.setItem(CHAVE, id); else L.removeItem(CHAVE); return true; } catch (e) { return false; }
    },
    /* o que vem marcado no diálogo: o lembrado ou o Universal */
    inicial: function (ls) { return this.padrao(ls) || this.PADRAO; }
  };

  global.BimTplInicio = BimTplInicio;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTplInicio;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

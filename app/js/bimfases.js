/* =====================================================================
 * bimfases.js — FASES DO PROJETO (motor puro, ES5, Node-testável).
 *
 * Fase P10, Frente A do plano do BIM. O defeito que fecha
 * (1.3, item 6): "Não há fases (existente / demolir / novo). A reforma,
 * metade do mercado de obra pequena, não tem como ser modelada nem orçada
 * pelo modelo." REGRA RA: a reforma sai PELO MODELO — o que é existente
 * fica FORA do orçamento de construção e o que é demolido vira SERVIÇO DE
 * DEMOLIÇÃO.
 *
 * COMO AS FASES FUNCIONAM (convenção de mercado: o comportamento e os nomes):
 *   · o projeto tem uma lista ORDENADA de fases (template PTB: "Existente",
 *     "Construção nova"); cada peça tem "Fase criada" e "Fase demolida"
 *     ("Nenhum" = não demolida) — os parâmetros PHASE_CREATED e
 *     PHASE_DEMOLISHED do registro (js/bimparam.js, grupo comum, P1-A);
 *   · numa fase F, cada peça tem um STATUS (ElementOnPhaseStatus): Novo
 *     (criada em F), Existente (criada antes, não demolida até F), Demolido
 *     (criada antes, demolida em F), Temporário (criada e demolida em F),
 *     Futuro (criada depois) e Passado (demolida antes);
 *   · o FILTRO DE FASE da vista diz, por status: por categoria, sobreposto
 *     (o gráfico da fase: existente em meio-tom, demolido tracejado) ou não
 *     exibido. Os filtros do template (Mostrar tudo, Mostrar somente fase atual, …);
 *   · "Demolir" (Modificar) põe a "Fase demolida" = a fase da vista — e leva
 *     junto as portas e janelas da parede.
 *
 * A OP (validada no BimEdit.sanear — "P10" em js/bimedit.js):
 *   {op:"fases", lista:["Existente","Construção nova",…], renomear?:{de: para},
 *    demolicao?:{categoria: "código SINAPI" | null}}
 *   substitui a lista (a ordem é a do tempo); `renomear` troca o nome nas
 *   peças (fundir duas fases = tirar uma da lista e renomeá-la na outra);
 *   `demolicao` troca o código do mapa de demolição de uma categoria.
 *   A fase de cada peça vai na op `marcar` da P1-A (faseCriada/faseDemolida).
 *
 * O ORÇAMENTO (js/orcmodelo.js, gancho "P10"): paraOrcamento(estado) separa
 * o modelo em três blocos — construção (novo e temporário), demolição
 * (demolido e temporário) e fora (existente, futuro, passado). O serviço de
 * demolição vem do MAPA abaixo, com código SINAPI CONFERIDO na base local
 * (data/sinapi-MG-2026-06.json, competência 06/2026 — tools/test-bimfases.js
 * confere código, unidade e descrição). Categoria sem composição no mapa (ou
 * material que o mapa não cobre) sai PENDENTE com o motivo: NUNCA se inventa
 * código, nem se procura "o parecido" (regra 1 do js/orcmodelo.js).
 *
 * Teste: node tools/test-bimfases.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  var NENHUM = "Nenhum";
  /* as fases do template PT-BR de mercado */
  var FASES_PADRAO = ["Existente", "Construção nova"];
  var STATUS_NOME = { novo: "Novo", existente: "Existente", demolido: "Demolido", temporario: "Temporário", futuro: "Futuro", passado: "Passado" };
  /* o nome do ElementOnPhaseStatus da API (a ponte com o script de paridade) */
  var STATUS_REVIT = { novo: "New", existente: "Existing", demolido: "Demolished", temporario: "Temporary", futuro: "Future", passado: "Past" };
  /* FILTROS DE FASE: c = por categoria · s = sobreposto (gráfico da fase) · o = não exibido.
     "Mostrar tudo" é o padrão da vista no template (inventário de parâmetros, VIEW_PHASE_FILTER).
     Os 5 primeiros são os do template PT-BR de mercado — nome e apresentação
     conferidos na coleta de 09/10/2026 (referência medida, teste [filtro]); os ids
     ficam os de antes (é o id que a vista grava). Os 2 últimos não estão no template PTB
     (vêm do inglês "Show Previous + Demo/New" e "Show Previous Phase") e ficam como filtros
     da RA, marcados. */
  var FILTROS = [
    { id: "tudo", nome: "Mostrar tudo", novo: "c", existente: "s", demolido: "s", temporario: "s" },
    { id: "completo", nome: "Mostrar completo", novo: "c", existente: "c", demolido: "o", temporario: "o" },
    { id: "novo", nome: "Mostrar somente fase atual", novo: "c", existente: "o", demolido: "o", temporario: "o" },
    { id: "anteriorDemolicao", nome: "Mostrar demolição", novo: "o", existente: "s", demolido: "s", temporario: "o" },
    { id: "anteriorNovo", nome: "Mostrar novo + existente", novo: "c", existente: "s", demolido: "o", temporario: "o" },
    { id: "demolicaoNovo", nome: "Mostrar demolição + novo", novo: "c", existente: "o", demolido: "s", temporario: "s", ra: true },
    { id: "anterior", nome: "Mostrar fase anterior", novo: "o", existente: "s", demolido: "o", temporario: "o", ra: true }
  ];
  var FILTRO_PADRAO = "tudo";
  /* GRÁFICOS DA FASE (Gerenciar › Fases › Sobreposições gráficas): existente em
     MEIO-TOM, demolido com a linha TRACEJADA ("Demolido" — o estilo de linha
     <Demolido> do inventário) e a superfície translúcida, temporário em
     traço-ponto. Os valores (opacidade, tom) são da RA. */
  var GRAFICOS = {
    novo: { meioTom: false, linha: "continua", opacidade: 1 },
    existente: { meioTom: true, linha: "continua", opacidade: 1 },
    demolido: { meioTom: false, linha: "tracejada", opacidade: 0.35 },
    temporario: { meioTom: false, linha: "traco-ponto", opacidade: 0.6 }
  };

  /* MAPA DE DEMOLIÇÃO: categoria → composição SINAPI (código, unidade e
     descrição LIDOS da base local data/sinapi-MG-2026-06.json, 06/2026; o teste
     confere os três). medida = a medida do REGISTRO que dá a quantidade (a
     mesma do orçamento: volume em m³, área em m²). `quando` = o material que a
     composição cobre — fora dele, PENDENTE com o motivo. */
  var FONTE_MAPA = "SINAPI 06/2026 (data/sinapi-MG-2026-06.json) — conferido em tools/test-bimfases.js";
  var MAPA_DEMOLICAO = {
    parede: { codigo: "97622", unidade: "M3", medida: "volume", descricao: "DEMOLIÇÃO DE ALVENARIA DE BLOCO FURADO, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023", quando: "alvenaria" },
    laje: { codigo: "97628", unidade: "M3", medida: "volume", descricao: "DEMOLIÇÃO DE LAJES, EM CONCRETO ARMADO, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023", quando: "concreto" },
    pilar: { codigo: "97626", unidade: "M3", medida: "volume", descricao: "DEMOLIÇÃO DE PILARES E VIGAS EM CONCRETO ARMADO, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023", quando: "concreto" },
    viga: { codigo: "97626", unidade: "M3", medida: "volume", descricao: "DEMOLIÇÃO DE PILARES E VIGAS EM CONCRETO ARMADO, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023", quando: "concreto" },
    cobertura: { codigo: "97647", unidade: "M2", medida: "area", descricao: "REMOÇÃO DE TELHAS DE FIBROCIMENTO METÁLICA E CERÂMICA, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023" },
    porta: { codigo: "97644", unidade: "M2", medida: "area", descricao: "REMOÇÃO DE PORTAS, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023" },
    janela: { codigo: "97645", unidade: "M2", medida: "area", descricao: "REMOÇÃO DE JANELAS, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023" },
    "forro:gesso": { codigo: "97641", unidade: "M2", medida: "area", descricao: "REMOÇÃO DE FORRO DE GESSO, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023" },
    "forro:leve": { codigo: "97640", unidade: "M2", medida: "area", descricao: "REMOÇÃO DE FORROS DE DRYWALL, PVC E FIBROMINERAL, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023" }
  };
  /* a medida da quantidade quando o código vem do PROJETO (op fases.demolicao) */
  var MEDIDA_CAT = { parede: "volume", laje: "volume", pilar: "volume", viga: "volume", escada: "volume", guarda: "comprimento", cobertura: "area", forro: "area", porta: "area", janela: "area", volume: "volume", generico: "un" };
  var NOME_CAT = { parede: "Parede", laje: "Laje", pilar: "Pilar", viga: "Viga", escada: "Escada", guarda: "Guarda-corpo", cobertura: "Cobertura", forro: "Forro", porta: "Porta", janela: "Janela", volume: "Volume", generico: "Família" };

  /* ------------------------------------------------------------ fases */
  function lista(estado) {
    var f = estado && estado.fases, l = f && Array.isArray(f.lista) && f.lista.length ? f.lista : FASES_PADRAO;
    return l.slice();
  }
  /* "Construção nova" quando o projeto tem; senão a ÚLTIMA (a fase de agora) */
  function faseNova(l) { return l.indexOf("Construção nova") >= 0 ? "Construção nova" : l[l.length - 1]; }
  function criadaDe(el, l) {
    var s = txt(el && el.faseCriada).trim();
    return s && l.indexOf(s) >= 0 ? s : faseNova(l);
  }
  function demolidaDe(el, l) {
    var s = txt(el && el.faseDemolida).trim();
    return !s || s === NENHUM || l.indexOf(s) < 0 ? NENHUM : s;
  }
  /* o status da peça na fase `fase` (ElementOnPhaseStatus) */
  function statusDe(el, fase, l) {
    l = l || FASES_PADRAO;
    var iF = l.indexOf(fase); if (iF < 0) iF = l.length - 1;
    var iC = l.indexOf(criadaDe(el, l)), dem = demolidaDe(el, l), iD = dem === NENHUM ? Infinity : l.indexOf(dem);
    if (iD < iC) iD = Infinity;   /* demolida antes de criada: combinação inválida — vale como não demolida (aviso no classificar) */
    if (iC > iF) return "futuro";
    if (iD < iF) return "passado";
    if (iC === iF) return iD === iF ? "temporario" : "novo";
    return iD === iF ? "demolido" : "existente";
  }

  /* as peças do estado que têm fase (o que a op marcar alcança) */
  function pecas(estado, deps) {
    var out = [], catFam = deps && typeof deps.categoriaFam === "function" ? deps.categoriaFam : null;
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), origem: "caixa", categoria: c.tipo || "generico", el: c }); });
    arr(estado && estado.coberturas).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), origem: "cobertura", categoria: "cobertura", el: c }); });
    arr(estado && estado.forros).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), origem: "forro", categoria: "forro", el: c }); });
    arr(estado && estado.volumes).forEach(function (c) { if (c && c.id != null) out.push({ id: String(c.id), origem: "volume", categoria: "volume", el: c }); });
    arr(estado && estado.familias).forEach(function (c) {
      if (!c || c.id == null) return;
      var k = catFam ? catFam(c.famId) : null;
      out.push({ id: String(c.id), origem: "familia", categoria: k === "porta" || k === "janela" ? k : "generico", el: c });
    });
    return out;
  }
  /* o modelo usa fases? (op fases, ou alguma peça marcada) — sem isso, nada muda */
  function faseado(estado) {
    if (estado && estado.fases) return true;
    return pecas(estado).some(function (p) { return !!(p.el.faseCriada || p.el.faseDemolida); });
  }

  var BimFases = {
    NENHUM: NENHUM, FASES_PADRAO: FASES_PADRAO, STATUS_NOME: STATUS_NOME, STATUS_REVIT: STATUS_REVIT,
    FILTROS: FILTROS, FILTRO_PADRAO: FILTRO_PADRAO, GRAFICOS: GRAFICOS, MAPA_DEMOLICAO: MAPA_DEMOLICAO, FONTE_MAPA: FONTE_MAPA,
    MEDIDA_CAT: MEDIDA_CAT,
    lista: lista, faseNova: faseNova, criadaDe: criadaDe, demolidaDe: demolidaDe, statusDe: statusDe, pecas: pecas, faseado: faseado,

    /* a lista nova, conferida: nomes não vazios, sem repetir, sem "Nenhum" */
    normalizarLista: function (l) {
      var out = [], vistos = {};
      if (!Array.isArray(l) || !l.length) return { ok: false, motivo: "O projeto precisa de pelo menos uma fase." };
      for (var i = 0; i < l.length; i++) {
        var s = txt(l[i]).trim().slice(0, 40);
        if (!s) return { ok: false, motivo: "Fase " + (i + 1) + " sem nome." };
        if (s === NENHUM) return { ok: false, motivo: "\"Nenhum\" é a fase demolida de quem não é demolido: escolha outro nome." };
        if (vistos[s.toLowerCase()]) return { ok: false, motivo: "Fase \"" + s + "\" repetida." };
        vistos[s.toLowerCase()] = 1; out.push(s);
      }
      if (out.length > 20) return { ok: false, motivo: "No máximo 20 fases." };
      return { ok: true, lista: out };
    },
    /* a op da lista de fases. o = { renomear:{de: para}, demolicao:{cat: código|null} } */
    opFases: function (l, o) {
      var n = BimFases.normalizarLista(l); if (!n.ok) return n;
      var op = { op: "fases", lista: n.lista };
      if (o && o.renomear && Object.keys(o.renomear).length) {
        op.renomear = {};
        Object.keys(o.renomear).forEach(function (k) { var v = txt(o.renomear[k]).trim(); if (k && v && k !== v) op.renomear[k] = v; });
        if (!Object.keys(op.renomear).length) delete op.renomear;
      }
      if (o && o.demolicao && Object.keys(o.demolicao).length) {
        op.demolicao = {};
        Object.keys(o.demolicao).forEach(function (k) { var v = o.demolicao[k]; op.demolicao[k] = v == null || txt(v).trim() === "" ? null : txt(v).trim().slice(0, 24); });
      }
      var E = dep("BimEdit", "./bimedit.js");
      if (E && E.opP10Valida && !E.opP10Valida(op)) return { ok: false, motivo: "Lista de fases inválida." };
      return { ok: true, op: op };
    },

    /* o status de cada peça na fase `fase` (padrão: a última — a de agora) */
    classificar: function (estado, fase, deps) {
      var l = lista(estado), F = l.indexOf(fase) >= 0 ? fase : l[l.length - 1], porId = {}, n = {}, avisos = [], itens = [];
      Object.keys(STATUS_NOME).forEach(function (k) { n[k] = 0; });
      pecas(estado, deps).forEach(function (p) {
        var c = p.el, s = statusDe(c, F, l);
        porId[p.id] = s; n[s]++;
        itens.push({ id: p.id, categoria: p.categoria, origem: p.origem, status: s, criada: criadaDe(c, l), demolida: demolidaDe(c, l) });
        var fc = txt(c.faseCriada).trim(), fd = txt(c.faseDemolida).trim();
        if (fc && l.indexOf(fc) < 0) avisos.push((NOME_CAT[p.categoria] || "Peça") + " " + p.id + ": a fase criada \"" + fc + "\" não existe no projeto — vale \"" + faseNova(l) + "\".");
        if (fd && fd !== NENHUM && l.indexOf(fd) < 0) avisos.push((NOME_CAT[p.categoria] || "Peça") + " " + p.id + ": a fase demolida \"" + fd + "\" não existe no projeto — vale como não demolida.");
        else if (fd && fd !== NENHUM && l.indexOf(fd) < l.indexOf(criadaDe(c, l))) avisos.push((NOME_CAT[p.categoria] || "Peça") + " " + p.id + ": demolida em \"" + fd + "\", antes de ser criada (\"" + criadaDe(c, l) + "\") — vale como não demolida.");
      });
      return { fase: F, lista: l, porId: porId, n: n, itens: itens, avisos: avisos };
    },

    /* ------------------------------------------------ filtro e gráficos */
    filtro: function (id) { for (var i = 0; i < FILTROS.length; i++) if (FILTROS[i].id === id) return FILTROS[i]; return FILTROS[0]; },
    /* "c" | "s" | "o" — futuro e passado nunca aparecem */
    visual: function (status, filtroId) {
      if (status === "futuro" || status === "passado") return "o";
      var f = BimFases.filtro(filtroId || FILTRO_PADRAO);
      return f[status] || "c";
    },
    /* o que a tela desenha: { visivel, status, meioTom, linha, opacidade } */
    graficos: function (status, filtroId) {
      var v = BimFases.visual(status, filtroId), g = GRAFICOS[status] || GRAFICOS.novo;
      if (v === "o") return { visivel: false, status: status };
      if (v === "c") return { visivel: true, status: status, meioTom: false, linha: "continua", opacidade: 1 };
      return { visivel: true, status: status, meioTom: g.meioTom, linha: g.linha, opacidade: g.opacidade };
    },
    /* o mapa id → gráfico do modelo inteiro na fase e no filtro dados */
    graficosModelo: function (estado, fase, filtroId, deps) {
      var cls = BimFases.classificar(estado, fase, deps), out = {};
      Object.keys(cls.porId).forEach(function (id) { out[id] = BimFases.graficos(cls.porId[id], filtroId); });
      return { fase: cls.fase, filtro: BimFases.filtro(filtroId).id, porId: out, n: cls.n };
    },

    /* as opções da paleta de Propriedades (js/bimpropsui.js, gancho "P10") */
    opcoesProps: function (estado, defId) {
      var l = lista(estado);
      return (defId === "PHASE_DEMOLISHED" ? [NENHUM].concat(l) : l).map(function (s) { return { id: s, rotulo: s }; });
    },

    /* ---------------------------------------------------- DEMOLIR
     * A op que demole as peças na fase `fase` (a da vista; padrão a última):
     * {op:"marcar", id, faseDemolida} — várias num lote (um Ctrl+Z). A parede
     * leva junto as portas e janelas dela. Peça de fase
     * posterior não se demole (não existe ainda); a já demolida, pula. */
    opDemolir: function (estado, ids, fase, deps) {
      var l = lista(estado), F = l.indexOf(fase) >= 0 ? fase : l[l.length - 1], porId = {}, alvo = [], pulos = [];
      pecas(estado, deps).forEach(function (p) { porId[p.id] = p; });
      var pedidos = arr(ids).map(String);
      /* as hospedadas das paredes pedidas vão junto */
      arr(estado && estado.familias).forEach(function (f) {
        if (f && f.host && pedidos.indexOf(String(f.host.id)) >= 0 && pedidos.indexOf(String(f.id)) < 0) pedidos.push(String(f.id));
      });
      pedidos.forEach(function (id) {
        var p = porId[id];
        if (!p) { pulos.push({ id: id, motivo: "não é peça criada no OrçaPRO" }); return; }
        var s = statusDe(p.el, F, l);
        if (s === "futuro") { pulos.push({ id: id, motivo: "criada numa fase depois de \"" + F + "\"" }); return; }
        if (s === "demolido" || s === "temporario" || s === "passado") { pulos.push({ id: id, motivo: "já demolida" }); return; }
        alvo.push(id);
      });
      if (!alvo.length) return { ok: false, motivo: pulos.length ? "Nada a demolir: " + pulos.map(function (q) { return q.id + " (" + q.motivo + ")"; }).join(", ") + "." : "Selecione as peças a demolir.", pulos: pulos };
      var ops = alvo.map(function (id) { return { op: "marcar", id: id, faseDemolida: F }; });
      var op = ops.length === 1 ? ops[0] : { op: "lote", id: (deps && typeof deps.novoId === "function" ? String(deps.novoId()) : "demolir-" + alvo.join("-").slice(0, 40)), origem: "demolir", ops: ops };
      return { ok: true, op: op, fase: F, ids: alvo, pulos: pulos };
    },

    /* ---------------------------------------------------- ORÇAMENTO
     * separa o estado: { fase, lista, estado (a CONSTRUÇÃO: novo + temporário),
     * demolir: [peça] (demolido + temporário), existentes, fora (futuro e
     * passado), mapa (o do projeto), avisos }. null quando o modelo não usa
     * fases — o orçamento fica byte a byte o de antes. */
    paraOrcamento: function (estado, opcoes) {
      if (!faseado(estado)) return null;
      opcoes = opcoes || {};
      var deps = { categoriaFam: opcoes.categoriaFamFases || opcoes.categoriaFam };
      var cls = BimFases.classificar(estado, opcoes.fase, deps), S = cls.porId;
      var constr = function (x) { var s = S[String(x.id)]; return !s || s === "novo" || s === "temporario"; };
      var est = {};
      Object.keys(estado).forEach(function (k) { est[k] = estado[k]; });
      ["caixas", "coberturas", "forros", "volumes", "familias"].forEach(function (k) { if (Array.isArray(estado[k])) est[k] = estado[k].filter(function (x) { return !x || x.id == null || constr(x); }); });
      var demolir = [], existentes = [], fora = [];
      pecas(estado, deps).forEach(function (p) {
        var s = S[p.id], it = { id: p.id, categoria: p.categoria, origem: p.origem, status: s, el: p.el, rotulo: (NOME_CAT[p.categoria] || "Peça") + " " + p.id };
        if (s === "demolido" || s === "temporario") demolir.push(it);
        else if (s === "existente") existentes.push(it);
        else if (s === "futuro" || s === "passado") fora.push(it);
      });
      return { fase: cls.fase, lista: cls.lista, estado: est, demolir: demolir, existentes: existentes, fora: fora, n: cls.n,
               mapa: (estado.fases && estado.fases.demolicao) || {}, avisos: cls.avisos };
    },
    /* o serviço de demolição de uma peça: { codigo, medida, unidade, rotulo, fonte }
       ou { codigo: null, medida, motivo } (PENDENTE — nunca um código inventado) */
    servicoDemolicao: function (p, mapaProjeto) {
      var cat = p && p.categoria, el = (p && p.el) || {}, nome = NOME_CAT[cat] || "Peça";
      var proj = mapaProjeto && Object.prototype.hasOwnProperty.call(mapaProjeto, cat) ? mapaProjeto[cat] : undefined;
      if (proj) return { codigo: txt(proj), medida: MEDIDA_CAT[cat] || "un", unidade: null, rotulo: "Demolição — " + nome, fonte: "projeto" };
      var k = cat;
      if (cat === "forro") {
        var t = JSON.stringify(el.tipoForro || el.tipoId || "");
        k = /gesso/i.test(t) ? "forro:gesso" : (/pvc|drywall|fibromineral|mineral/i.test(t) ? "forro:leve" : null);
        if (!k) return { codigo: null, medida: "area", motivo: "forro de material que o mapa de demolição não cobre (gesso; drywall, PVC, fibromineral): escolha a composição em Gerenciar › Fases" };
      }
      var m = MAPA_DEMOLICAO[k];
      if (!m) return { codigo: null, medida: MEDIDA_CAT[cat] || "un", motivo: nome + ": sem composição de demolição no mapa (" + FONTE_MAPA.split(" (")[0] + ") — escolha em Gerenciar › Fases › Demolição — pendente" };
      if (m.quando === "concreto" && (cat === "pilar" || cat === "viga") && el.material && el.material !== "concreto")
        return { codigo: null, medida: m.medida, motivo: nome + " de " + el.material + ": a composição do mapa é de concreto armado — escolha a de " + el.material + " em Gerenciar › Fases — pendente" };
      if (m.quando === "concreto" && cat === "laje" && /madeira|aco|aço|metal/i.test(JSON.stringify(el.tipoLaje || "")))
        return { codigo: null, medida: m.medida, motivo: "laje que não é de concreto armado: escolha a composição em Gerenciar › Fases — pendente" };
      if (m.quando === "alvenaria" && /concreto/i.test(JSON.stringify(el.tipoParede || "")))
        return { codigo: null, medida: m.medida, motivo: "parede de concreto: a composição do mapa é de alvenaria — escolha em Gerenciar › Fases — pendente" };
      return { codigo: m.codigo, medida: m.medida, unidade: m.unidade, rotulo: "Demolição — " + nome, descricao: m.descricao, fonte: "mapa" };
    },

    /* ------------------------------------------------ PARIDADE (P10)
     * as quantidades por status numa fase (o ElementPhaseStatusFilter da
     * API): por status, { n, ids, area, volume } — Área e Volume do
     * REGISTRO (js/bimparam.js: HOST_AREA_COMPUTED, HOST_VOLUME_COMPUTED, as
     * mesmas da tela de Propriedades). Só as categorias com essas medidas. */
    quantidadesPorFase: function (estado, fase, deps) {
      var BP = dep("BimParam", "./bimparam.js"), cls = BimFases.classificar(estado, fase, deps), out = {};
      Object.keys(STATUS_NOME).forEach(function (s) { out[s] = { n: 0, ids: [], area: 0, volume: 0, porId: {} }; });
      var res = BP ? BP.resolver(estado, deps || {}) : null;
      cls.itens.forEach(function (it) {
        var g = out[it.status]; g.n++; g.ids.push(it.id);
        var pc = res && res.porId[it.id], a = pc ? BP.valor(pc, "HOST_AREA_COMPUTED") : null, v = pc ? BP.valor(pc, "HOST_VOLUME_COMPUTED") : null;
        g.porId[it.id] = { categoria: it.categoria, area: fin(a) ? r6(a) : null, volume: fin(v) ? r6(v) : null };
        if (fin(a)) g.area = r6(g.area + a);
        if (fin(v)) g.volume = r6(g.volume + v);
      });
      return { fase: cls.fase, porStatus: out, avisos: cls.avisos };
    },

    /* ------------------------------------------------ replay (BimEdit.estender) */
    _aplicar: function (o, ctx) {
      if (!o || o.op !== "fases") return false;
      var E = dep("BimEdit", "./bimedit.js");
      if (E && E.opP10Valida && !E.opP10Valida(o)) return false;
      var n = BimFases.normalizarLista(o.lista); if (!n.ok) return false;
      var atual = ctx.ext.fases || { lista: FASES_PADRAO.slice(), demolicao: {} };
      if (o.renomear) {
        var R = o.renomear;
        ["caixas", "fams", "cobs", "vols", "forros"].forEach(function (k) {
          var m = ctx[k] || {};
          Object.keys(m).forEach(function (id) {
            var c = m[id]; if (!c) return;
            if (c.faseCriada && Object.prototype.hasOwnProperty.call(R, c.faseCriada)) c.faseCriada = txt(R[c.faseCriada]).trim();
            if (c.faseDemolida && Object.prototype.hasOwnProperty.call(R, c.faseDemolida)) c.faseDemolida = txt(R[c.faseDemolida]).trim();
          });
        });
      }
      var dem = clone(atual.demolicao || {});
      if (o.demolicao) Object.keys(o.demolicao).forEach(function (k) { if (o.demolicao[k] == null) delete dem[k]; else dem[k] = txt(o.demolicao[k]); });
      ctx.ext.fases = { lista: n.lista, demolicao: dem };
      return true;
    }
  };

  /* a op `fases` no replay do js/bimedit.js (extensão: o switch de lá não muda) */
  var E0 = dep("BimEdit", "./bimedit.js");
  if (E0 && E0.estender) E0.estender({
    nome: "P10-fases",
    aplicar: function (o, ctx) { return BimFases._aplicar(o, ctx); },
    fim: function (ctx, out) { if (ctx && ctx.ext && ctx.ext.fases) out.fases = clone(ctx.ext.fases); },
    valida: function (o) { if (!o || o.op !== "fases") return undefined; var E = dep("BimEdit", "./bimedit.js"); return E && E.opP10Valida ? E.opP10Valida(o) : true; }
  });

  global.BimFases = BimFases;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFases;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

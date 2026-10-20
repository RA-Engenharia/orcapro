/* =====================================================================
 * bimapresentacao.js — APRESENTAÇÃO DA REFORMA (motor puro, ES5, Node-testável).
 *
 * Pedido do engenheiro (20/10/2026): "um parâmetro dentro do sistema para ser fácil eu visualizar o
 * ambiente como era antes e como agora; e uma parte onde eu vou apresentar para o cliente uma animação
 * do fluxo: o que foi demolido, o que foi construído — pega a planta baixa, sobe as paredes, mostra as
 * paredes que saíram e as que entraram, igual aos programas de reforma que os americanos apresentam".
 *
 * Este arquivo só DECIDE (nada de cena, nada de tela):
 *   1. ANTES / OBRA / DEPOIS — que fase e que filtro de fase cada modo usa. Os filtros são os do
 *      js/bimfases.js (BimFases.FILTROS): não há um segundo jeito de filtrar. `lados()` diz, por peça,
 *      se ela existe no ANTES e no DEPOIS (a cortina do "Comparar" e o "Antes × Depois" do final).
 *   2. A LINHA DO TEMPO da apresentação, montada do estado + fases:
 *        planta → existente → demolição → construção → acabamentos → final
 *      cada etapa com a sua janela em segundos e os EVENTOS das peças (quem entra, quem sai, quando,
 *      por quanto tempo e com que ação: subir, descer, encaixar, crescer, piscina, demolir…).
 *      As durações saem do número de peças (a obra grande demora mais) e o total fica entre 60 e 90 s.
 *   3. O estado a cada instante t: a legenda, os contadores (m², peças) e a câmera abstrata (órbita).
 *
 * REGRAS QUE O TESTE (tools/test-c487-apresentacao.js) TRAVA:
 *   · peça DEMOLIDA entra na subida do existente e sai na DEMOLIÇÃO — nunca aparece na CONSTRUÇÃO;
 *   · peça NOVA entra uma vez, na CONSTRUÇÃO (estrutura, esquadria, cobertura, forro) ou nos
 *     ACABAMENTOS (móvel, paisagismo, piscina) — nunca na subida do existente nem na demolição;
 *   · peça EXISTENTE que fica aparece só na subida do existente;
 *   · os m² dos contadores são os do BimFases.quantidadesPorFase (a mesma conta do orçamento);
 *   · modelo sem fases: apresentação RECUSADA, com a mensagem de como habilitar.
 *
 * A TELA (js/bimapresentacaoui.js) aplica os eventos na cena do BIM.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function BF() { return dep("BimFases", "./bimfases.js"); }
  function BO() { return dep("BimOpcoes", "./bimopcoes.js"); }
  /* ⚠ OPÇÕES DE PROJETO: a apresentação conta e anima só o modelo principal + a opção ESCOLHIDA de cada conjunto.
     Sem isso a peça da opção não escolhida (ex.: churrasqueira B da Casa 487, 20/10/2026) entrava na linha do tempo e
     nos contadores, mas a cena a mantinha oculta — a e2e via 338 malhas contra 339 esperadas no DEPOIS. */
  function soEscolhida(estado, escolha) {
    var o = BO();
    return o && o.filtrar && estado && estado.opcoes ? o.filtrar(estado, escolha) : estado;
  }

  /* ------------------------------------------------------------ ANTES / OBRA / DEPOIS
   * antes  = a fase mais antiga do projeto, filtro "Mostrar completo": o que existe hoje, com o que vai
   *          ser demolido aparecendo NORMAL (nesta fase ele é "novo" — ainda não foi demolido);
   * obra   = a fase de agora, "Mostrar tudo" + realce: o existente em meio-tom, o que SAI em vermelho
   *          translúcido e tracejado, o que ENTRA destacado;
   * depois = a fase de agora, "Mostrar completo": existente + novo, sem o demolido;
   * comparar = os dois lados ao mesmo tempo (a cortina): cada peça leva as marcas { a, d } de lados(). */
  var MODOS = [
    { id: "antes", rotulo: "Antes", dica: "Como é hoje: só o existente, com o que vai ser demolido aparecendo normal. (Alt+1)" },
    { id: "obra", rotulo: "Obra", dica: "O que sai em vermelho translúcido, o que entra destacado, o existente em meio-tom. (Alt+2)" },
    { id: "depois", rotulo: "Depois", dica: "Como fica: existente + novo, sem o demolido. (Alt+3)" },
    { id: "comparar", rotulo: "Comparar", dica: "Cortina: metade da tela o ANTES, metade o DEPOIS; arraste a divisória. (Alt+4)" }
  ];
  function modoPorId(id) { for (var i = 0; i < MODOS.length; i++) if (MODOS[i].id === id) return MODOS[i]; return null; }

  function listaFases(estado) { var b = BF(); return b ? b.lista(estado) : ["Existente", "Construção nova"]; }

  /* o modelo tem o que comparar? (fases declaradas ou peças marcadas, e pelo menos duas fases) */
  function temFases(estado) {
    var b = BF(); if (!b || !estado) return false;
    return !!b.faseado(estado) && listaFases(estado).length >= 2;
  }
  /* o que o modo pede da vista: { fase, filtro, realce } — fase/filtro são os do BimFases */
  function modoVista(estado, modo) {
    var l = listaFases(estado), ultima = l[l.length - 1];
    if (modo === "antes") return { fase: l[0], filtro: "completo", realce: false, modo: "antes" };
    if (modo === "obra") return { fase: ultima, filtro: "tudo", realce: true, modo: "obra" };
    if (modo === "depois") return { fase: ultima, filtro: "completo", realce: false, modo: "depois" };
    if (modo === "comparar") return { fase: ultima, filtro: "completo", realce: false, modo: "comparar" };
    return null;
  }
  /* de volta: qual modo é a vista atual (fase + filtro)? null = vista personalizada */
  function modoDaVista(estado, fase, filtro, realce) {
    var l = listaFases(estado), ultima = l[l.length - 1];
    if (fase === l[0] && filtro === "completo" && !realce && l.length >= 2) return "antes";
    if (fase === ultima && filtro === "tudo" && realce) return "obra";
    if (fase === ultima && filtro === "completo" && !realce) return "depois";
    return null;
  }
  /* PEÇAS QUE O BIMFASES NÃO LISTA mas que pertencem a uma que ele lista: a calha embutida é do telhado, o condutor é da calha
     (js/bimcobertura.js). Sem a fase delas, a calha do telhado NOVO ficava de pé no ANTES. id → id da peça-mãe (a que o BimFases classifica). */
  var FILHAS = [["calhasEmbutidas", "telhado"], ["condutores", "calha"]];
  function herdeiros(estado) {
    var out = {};
    FILHAS.forEach(function (par) {
      arr(estado && estado[par[0]]).forEach(function (c) { if (c && c.id != null && c[par[1]] != null) out[String(c.id)] = String(c[par[1]]); });
    });
    return out;
  }
  /* a classificação de uma peça, subindo pela mãe quando ela mesma não é classificada (calha → telhado; condutor → calha → telhado) */
  function daMae(porId, her, id) {
    var k = String(id), n = 0;
    while (k != null && n++ < 6) { if (porId[k] != null) return porId[k]; k = her[k]; }
    return undefined;
  }
  /* por peça: existe no ANTES? existe no DEPOIS? (a mesma regra do BimFases.visual com o filtro "completo") */
  function lados(estado, deps) {
    var b = BF(), l = listaFases(estado), out = { antes: l[0], depois: l[l.length - 1], porId: {}, n: { so_antes: 0, so_depois: 0, ambos: 0 } };
    if (!b) return out;
    var cA = b.classificar(estado, out.antes, deps), cD = b.classificar(estado, out.depois, deps), her = herdeiros(estado);
    Object.keys(cD.porId).forEach(function (id) {
      var a = b.visual(cA.porId[id], "completo") !== "o", d = b.visual(cD.porId[id], "completo") !== "o";
      out.porId[id] = { a: a, d: d };
      if (a && d) out.n.ambos++; else if (a) out.n.so_antes++; else if (d) out.n.so_depois++;
    });
    /* as filhas (calha, condutor) valem como a mãe, mas não entram na contagem */
    Object.keys(her).forEach(function (id) {
      if (out.porId[id]) return;
      var sa = daMae(cA.porId, her, id), sd = daMae(cD.porId, her, id);
      if (sa == null && sd == null) return;
      out.porId[id] = { a: b.visual(sa, "completo") !== "o", d: b.visual(sd, "completo") !== "o", filha: true };
    });
    return out;
  }
  /* o resumo da obra (dica do botão "Obra"): quantas peças e quantos m² saem e entram */
  function resumo(estado, deps, escolha) {
    var b = BF(); if (!b || !temFases(estado)) return null;
    estado = soEscolhida(estado, escolha);   /* mesma regra da linha do tempo: só a opção escolhida conta */
    var l = listaFases(estado), F = l[l.length - 1], q = b.quantidadesPorFase(estado, F, deps).porStatus;
    function g(s) { return { n: q[s].n, area: r3(q[s].area), volume: r3(q[s].volume) }; }
    return { fase: F, existentes: g("existente"), demolir: g("demolido"), novas: g("novo") };
  }

  /* ------------------------------------------------------------ GRUPOS DE ANIMAÇÃO
   * cada peça cai num grupo; o grupo diz a AÇÃO de entrada (como a peça aparece), a duração e a onda. */
  var ENTRADA = {
    fundacao: { acao: "subir", dur: 1.6 }, vertical: { acao: "subir", dur: 1.7 }, horizontal: { acao: "descer", dur: 1.5 },
    cobertura: { acao: "descer", dur: 1.9 }, forro: { acao: "aparecer", dur: 1.2 }, esquadria: { acao: "encaixar", dur: 1.0 },
    volume: { acao: "subir", dur: 1.4 }, movel: { acao: "crescer", dur: 0.9 }, paisagismo: { acao: "crescer", dur: 1.7 },
    piscina: { acao: "piscina", dur: 3.4 }
  };
  var SAIDA = { cobertura: 2.2, forro: 1.5, horizontal: 2.0, esquadria: 1.3, vertical: 2.0, fundacao: 1.6, volume: 1.4, movel: 1.1, paisagismo: 1.3, piscina: 2.2 };
  /* a ordem das ondas em cada etapa */
  var ONDAS = {
    existente: ["fundacao", "vertical", "esquadria", "horizontal", "cobertura", "forro", "volume", "movel", "paisagismo", "piscina"],
    demolicao: ["cobertura", "forro", "horizontal", "esquadria", "vertical", "fundacao", "volume", "movel", "paisagismo", "piscina"],
    construcao: ["fundacao", "vertical", "esquadria", "horizontal", "cobertura", "forro", "volume"],
    acabamentos: ["piscina", "movel", "paisagismo"]
  };
  /* o que é "acabamento" entre as peças NOVAS: o resto é construção */
  var DE_ACABAMENTO = { movel: 1, paisagismo: 1, piscina: 1 };

  function grupoDe(p, deps) {
    var el = p.el || {}, ifc = String(el.ifc || ""), cat = p.categoria;
    if (p.origem === "fundacao") return "fundacao";
    if (p.origem === "cobertura" || p.origem === "telhado" || p.origem === "borda") return "cobertura";
    if (p.origem === "forro") return "forro";
    if (p.origem === "volume") return "volume";
    if (p.origem === "familia") {
      if (cat === "porta" || cat === "janela") return "esquadria";
      var fid = String(el.famId || ""), k = deps && typeof deps.categoriaFam === "function" ? deps.categoriaFam(el.famId) : null;
      if (k === "paisagismo" || /(^|-)pais-/i.test(fid)) return "paisagismo";
      if (/piscina/i.test(fid) && !/maquina/i.test(fid)) return "piscina";
      return "movel";
    }
    /* caixas */
    if (cat === "laje" || cat === "viga" || ifc === "IFCSLAB" || ifc === "IFCBEAM") return "horizontal";
    if (cat === "metal") return (ifc === "IFCCOLUMN") ? "vertical" : "horizontal";
    return "vertical";
  }
  /* onde a peça está (x, z) para a varredura: da rua para o fundo do lote; null quando não dá para saber */
  function posicaoDe(p) {
    var el = p.el || {}, v;
    if (fin(el.cx) && fin(el.cz)) return [el.cx, el.cz];
    if (fin(el.x) && fin(el.z)) return [el.x, el.z];
    var cx = el.medidas && el.medidas.caixa;
    if (cx && cx.min && cx.max) return [(cx.min[0] + cx.max[0]) / 2, (cx.min[2] + cx.max[2]) / 2];
    if (el.planos && el.planos[0] && fin(el.planos[0].cx)) return [el.planos[0].cx, el.planos[0].cz];
    if (el.segs && el.segs[0] && el.segs[0].a) return [el.segs[0].a.x, el.segs[0].a.z];
    v = el.ponto; if (v && fin(v.x) && fin(v.z)) return [v.x, v.z];
    return null;
  }
  /* o que desenha a planta baixa: parede e pilar */
  function ehPlanta(p) {
    var el = p.el || {}, ifc = String(el.ifc || "");
    return p.origem === "caixa" && (p.categoria === "parede" || p.categoria === "pilar" || p.categoria === "vedacao" || ifc === "IFCWALL" || ifc === "IFCCOLUMN");
  }

  /* ------------------------------------------------------------ A LINHA DO TEMPO */
  var ETAPAS = {
    planta: { titulo: "Planta baixa existente", legenda: "O levantamento do que existe hoje no lote." },
    existente: { titulo: "Edificação existente", legenda: "Paredes, lajes e telhado como estão hoje." },
    demolicao: { titulo: "Demolição", legenda: "O que sai da obra." },
    construcao: { titulo: "Construção", legenda: "Paredes, esquadrias, cobertura e forro novos." },
    acabamentos: { titulo: "Acabamentos e entorno", legenda: "Pisos, revestimentos, piscina, mobiliário e paisagismo." },
    final: { titulo: "Casa pronta", legenda: "O resultado da reforma." }
  };
  var ORDEM_ETAPAS = ["planta", "existente", "demolicao", "construcao", "acabamentos", "final"];

  var MENSAGEM_SEM_FASES = "Este modelo não tem fases (Existente / Construção nova): marque as peças existentes, as que serão demolidas e as novas (Gerenciar › Fases e Arquitetura › Demolir) para montar a apresentação da reforma.";

  function mapaQtd(estado, fase, deps) {
    var b = BF(), q = b ? b.quantidadesPorFase(estado, fase, deps) : null, out = {};
    if (!q) return out;
    Object.keys(q.porStatus).forEach(function (s) { Object.keys(q.porStatus[s].porId).forEach(function (id) { out[id] = q.porStatus[s].porId[id]; }); });
    return out;
  }
  function chaveVarredura(p, posicoes) {
    var pos = posicoes && posicoes[p.id] ? posicoes[p.id] : posicaoDe(p);
    /* da rua (z maior) para o fundo; depois da esquerda para a direita */
    return pos ? [-pos[1], pos[0]] : [1e9, 0];
  }
  function cmpPecas(a, b) {
    if (a.k[0] !== b.k[0]) return a.k[0] - b.k[0];
    if (a.k[1] !== b.k[1]) return a.k[1] - b.k[1];
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  }

  /* a duração nominal de cada etapa, em segundos, pelo número de peças que ela anima */
  function duracaoNominal(id, n) {
    var s = Math.sqrt(Math.max(0, n));
    if (id === "planta") return 7 + 0.3 * s;
    if (id === "existente") return 6 + 1.0 * s;
    if (id === "demolicao") return 5 + 1.2 * s;
    if (id === "construcao") return 8 + 0.9 * s;
    if (id === "acabamentos") return 6 + 0.9 * s;
    return 12.5;   /* final: órbita + antes × depois */
  }

  /* opts: { deps, titulo, posicoes:{id:[x,z]}, duracaoMin, duracaoMax, duracao (força o total) } */
  function linhaDoTempo(estado, opts) {
    opts = opts || {};
    var b = BF(), deps = opts.deps || {};
    if (!b || !estado || !temFases(estado)) return { ok: false, motivo: MENSAGEM_SEM_FASES };
    estado = soEscolhida(estado, opts.escolha);
    var l = listaFases(estado), F = l[l.length - 1], cls = b.classificar(estado, F, deps);
    var q = mapaQtd(estado, F, deps), pecas = b.pecas(estado, deps), posicoes = opts.posicoes || null;

    /* 1) as peças por papel na reforma */
    var existentes = [], demolidas = [], novas = [], temporarias = [], plantaP = [];
    pecas.forEach(function (p) {
      var s = cls.porId[p.id], g = grupoDe(p, deps), it = { id: p.id, origem: p.origem, categoria: p.categoria, grupo: g, status: s, k: chaveVarredura(p, posicoes), area: q[p.id] && fin(q[p.id].area) ? q[p.id].area : 0, el: p.el, planta: ehPlanta(p) };
      if (s === "existente") existentes.push(it);
      else if (s === "demolido") demolidas.push(it);
      else if (s === "novo") novas.push(it);
      else if (s === "temporario") temporarias.push(it);
    });
    if (!existentes.length && !demolidas.length && !novas.length && !temporarias.length) {
      return { ok: false, motivo: "O modelo tem fases, mas nenhuma peça marcada nelas: marque o que existe, o que sai e o que entra." };
    }
    var avisos = [];
    /* peças que o BimFases não lista (calha e condutor da cobertura, carro…): entram como NOVAS, no grupo que a tela disser —
       sem isso ficariam no ar desde o primeiro segundo. Não entram nos contadores (o m² é o do BimFases). */
    var herd = herdeiros(estado);
    arr(opts.extras).forEach(function (x) {
      if (!x || x.id == null || cls.porId[String(x.id)]) return;
      var g = ENTRADA[x.grupo] ? x.grupo : "movel", id = String(x.id), sm = daMae(cls.porId, herd, id) || "novo";
      var it = { id: id, origem: "extra", categoria: g, grupo: g, status: sm, k: chaveVarredura({ id: id, el: {} }, posicoes), area: 0, el: {}, planta: false, extra: true };
      /* a filha segue a mãe: do telhado que fica a calha também fica; do que sai, sai junto; do novo, entra junto */
      if (sm === "existente") existentes.push(it); else if (sm === "demolido") demolidas.push(it); else if (sm === "temporario") temporarias.push(it); else if (sm === "novo") novas.push(it);
    });
    var antes = existentes.concat(demolidas);      /* o que existe hoje: sobe no início */
    var novasConstr = novas.concat(temporarias).filter(function (x) { return !DE_ACABAMENTO[x.grupo]; });
    var novasAcab = novas.concat(temporarias).filter(function (x) { return !!DE_ACABAMENTO[x.grupo]; });
    var plantaLista = antes.filter(function (x) { return x.planta; });

    /* 2) quais etapas existem, e a janela de cada uma */
    var contagem = { planta: plantaLista.length, existente: antes.length, demolicao: demolidas.length, construcao: novasConstr.length, acabamentos: novasAcab.length, final: 1 };
    var etapasIds = ORDEM_ETAPAS.filter(function (id) {
      if (id === "final") return true;
      return contagem[id] > 0;
    });
    var nom = {}, soma = 0, somaFora = 0, F0 = duracaoNominal("final", 1);
    etapasIds.forEach(function (id) { nom[id] = duracaoNominal(id, contagem[id]); soma += nom[id]; if (id !== "final") somaFora += nom[id]; });
    var alvo = opts.duracao ? +opts.duracao : clamp(soma, opts.duracaoMin || 60, opts.duracaoMax || 90);
    var fator = somaFora > 0 ? Math.max(0.3, (alvo - F0) / somaFora) : 1, dur = {}, total = 0;
    etapasIds.forEach(function (id) { dur[id] = id === "final" ? F0 : Math.max(4, nom[id] * fator); });
    var t = 0, etapas = [];
    etapasIds.forEach(function (id, i) {
      var d = r3(dur[id]);
      etapas.push({ id: id, n: i + 1, titulo: ETAPAS[id].titulo, legenda: ETAPAS[id].legenda, t0: r3(t), dur: d, t1: r3(t + d), pecas: contagem[id] });
      t += d;
    });
    total = r3(t);
    var porId = {}; etapas.forEach(function (e) { porId[e.id] = e; });

    /* 3) os eventos */
    var eventos = [], porPeca = {};
    function addEv(ev) { eventos.push(ev); var o = porPeca[ev.id] || (porPeca[ev.id] = { entrada: null, saida: null }); if (ev.tipo === "entrada") o.entrada = ev; else if (ev.tipo === "saida") o.saida = ev; }
    /* distribui as peças de uma etapa em ondas (grupo a grupo), varrendo da rua para o fundo */
    function espalhar(etapa, lista, tipo, ordemOndas, acaoDe, durDe) {
      if (!lista.length) return;
      var W = Math.max(1, etapa.dur - 0.8), por = {};
      lista.forEach(function (it) { (por[it.grupo] = por[it.grupo] || []).push(it); });
      var gs = ordemOndas.filter(function (g) { return por[g] && por[g].length; });
      Object.keys(por).forEach(function (g) { if (gs.indexOf(g) < 0) gs.push(g); });
      var pesos = gs.map(function (g) { return 1 + Math.sqrt(por[g].length); }), tot = 0;
      pesos.forEach(function (w) { tot += w; });
      var cur = 0, sobre = 0.18;   /* uma onda começa quando a anterior ainda está acabando */
      gs.forEach(function (g, gi) {
        var w = pesos[gi] / tot * W, ini = Math.max(0, cur - sobre * w), fim = Math.min(W, cur + w);
        var arrg = por[g].slice().sort(cmpPecas), n = arrg.length, dg = durDe(g);
        dg = Math.min(dg, Math.max(0.6, W * 0.45));
        arrg.forEach(function (it, i) {
          var f = n > 1 ? i / (n - 1) : 0, t0 = etapa.t0 + 0.2 + ini + f * Math.max(0, fim - ini - dg);
          addEv({ id: it.id, tipo: tipo, acao: acaoDe(g), grupo: g, etapa: etapa.id, t0: r3(t0), dur: r3(dg), area: it.area, status: it.status, origem: it.origem, categoria: it.categoria, extra: !!it.extra });
        });
        cur += w;
      });
    }
    if (porId.planta) {
      var ep = porId.planta, W0 = Math.max(1, ep.dur - 1.0), ord = plantaLista.slice().sort(cmpPecas), n0 = ord.length;
      ord.forEach(function (it, i) {
        var f = n0 > 1 ? i / (n0 - 1) : 0, d = Math.min(1.6, Math.max(0.7, ep.dur * 0.2));
        addEv({ id: it.id, tipo: "planta", acao: "tracar", grupo: it.grupo, etapa: "planta", t0: r3(ep.t0 + 0.4 + f * Math.max(0, W0 - d)), dur: r3(d), area: 0, status: it.status, origem: it.origem, categoria: it.categoria });
      });
    }
    if (porId.existente) espalhar(porId.existente, antes, "entrada", ONDAS.existente, function (g) { return ENTRADA[g].acao; }, function (g) { return ENTRADA[g].dur; });
    if (porId.demolicao) espalhar(porId.demolicao, demolidas, "saida", ONDAS.demolicao, function () { return "demolir"; }, function (g) { return SAIDA[g] || 1.5; });
    if (porId.construcao) espalhar(porId.construcao, novasConstr, "entrada", ONDAS.construcao, function (g) { return ENTRADA[g].acao; }, function (g) { return ENTRADA[g].dur; });
    if (porId.acabamentos) {
      var ea = porId.acabamentos;
      /* os acabamentos começam depois da janela da pintura (os pisos e os revestimentos "pintam" primeiro) */
      var jan = Math.min(5, ea.dur * 0.35), cortada = { id: ea.id, t0: ea.t0 + jan, dur: Math.max(2, ea.dur - jan) };
      espalhar(cortada, novasAcab, "entrada", ONDAS.acabamentos, function (g) { return ENTRADA[g].acao; }, function (g) { return ENTRADA[g].dur; });
    }
    /* temporárias: entram na construção (acima) e saem no início dos acabamentos */
    temporarias.forEach(function (it) {
      var ref = porId.acabamentos || porId.final, t0 = ref ? ref.t0 + 0.2 : total - 1;
      addEv({ id: it.id, tipo: "saida", acao: "demolir", grupo: it.grupo, etapa: ref ? ref.id : "final", t0: r3(t0), dur: r3(SAIDA[it.grupo] || 1.2), area: it.area, status: it.status, origem: it.origem, categoria: it.categoria, temporaria: true });
    });
    eventos.sort(function (a, c) { return a.t0 - c.t0 || (a.id < c.id ? -1 : 1); });

    /* 4) a pintura (os pisos e películas de acabamento) e o final */
    var pintura = null;
    if (porId.acabamentos) pintura = { t0: r3(porId.acabamentos.t0 + 0.2), dur: r3(Math.min(5, porId.acabamentos.dur * 0.35) - 0.2) };
    else if (porId.construcao) pintura = { t0: r3(porId.construcao.t1 - 3), dur: 2.6 };
    var ef = porId.final, comparar = 3.5, orbita = Math.max(6, ef.dur - comparar - 0.5);
    var final = { orbita: { t0: ef.t0, dur: r3(orbita) }, comparar: { t0: r3(ef.t0 + orbita), dur: comparar }, fim: ef.t1 };

    /* 5) os contadores finais (BimFases.quantidadesPorFase da fase de agora) */
    var qf = b.quantidadesPorFase(estado, F, deps).porStatus;
    var contadores = {
      demolidoM2: r3(qf.demolido.area + qf.temporario.area), demolidoPecas: qf.demolido.n + qf.temporario.n,
      construidoM2: r3(qf.novo.area + qf.temporario.area), construidoPecas: qf.novo.n + qf.temporario.n,
      existentePecas: qf.existente.n, fase: F
    };
    if (temporarias.length) avisos.push(temporarias.length + " peça(s) temporária(s) (criada e demolida na mesma fase): entram na construção e saem nos acabamentos.");
    if (!demolidas.length) avisos.push("Nenhuma peça marcada como demolida: a etapa de demolição foi omitida.");
    if (!antes.length) avisos.push("Nenhuma peça existente: a apresentação começa direto na construção.");
    (cls.avisos || []).forEach(function (a) { avisos.push(a); });

    return { ok: true, titulo: opts.titulo || "Reforma", fase: F, lista: l, total: total, etapas: etapas, porEtapa: porId, eventos: eventos, porPeca: porPeca,
             pintura: pintura, final: final, contadores: contadores, plantaIds: plantaLista.map(function (x) { return x.id; }), avisos: avisos,
             grupos: { existente: antes.length, demolida: demolidas.length, nova: novas.length, temporaria: temporarias.length } };
  }

  /* ------------------------------------------------------------ O ESTADO NO INSTANTE t */
  function etapaEm(linha, t) {
    var e = linha.etapas;
    for (var i = 0; i < e.length; i++) if (t < e[i].t1) return e[i];
    return e[e.length - 1];
  }
  /* a peça no instante t: { vis, p, acao, saindo, tipo } — p em 0..1 durante a animação, null parada */
  function estadoPeca(linha, id, t) {
    var o = linha.porPeca[id];
    if (!o) return { vis: true, p: null, acao: null };
    var e = o.entrada, s = o.saida;
    if (s && t >= s.t0 + s.dur) return { vis: false, p: null, acao: null, fim: true };
    if (s && t >= s.t0) return { vis: true, p: clamp((t - s.t0) / s.dur, 0, 1), acao: s.acao, saindo: true, grupo: s.grupo };
    if (e) {
      if (t < e.t0) return { vis: false, p: null, acao: null };
      if (t < e.t0 + e.dur) return { vis: true, p: clamp((t - e.t0) / e.dur, 0, 1), acao: e.acao, saindo: false, grupo: e.grupo };
    }
    return { vis: true, p: null, acao: null };
  }
  /* os contadores até o instante t (m² e peças já demolidos / construídos; a peça conta pela parte animada) */
  function contadoresEm(linha, t) {
    var c = { demolidoM2: 0, demolidoPecas: 0, construidoM2: 0, construidoPecas: 0 };
    linha.eventos.forEach(function (ev) {
      if (ev.extra) return;
      if (ev.tipo === "saida") {
        var p = clamp((t - ev.t0) / ev.dur, 0, 1);
        c.demolidoM2 += ev.area * p; if (p >= 1) c.demolidoPecas++;
      } else if (ev.tipo === "entrada" && ev.etapa !== "existente") {
        var p2 = clamp((t - ev.t0) / ev.dur, 0, 1);
        c.construidoM2 += ev.area * p2; if (p2 >= 1) c.construidoPecas++;
      }
    });
    c.demolidoM2 = r3(c.demolidoM2); c.construidoM2 = r3(c.construidoM2);
    return c;
  }
  /* a legenda e os contadores do instante t */
  function legendaEm(linha, t) {
    var e = etapaEm(linha, clamp(t, 0, linha.total)), c = contadoresEm(linha, t), tot = linha.contadores;
    var info = { etapa: e.id, n: e.n, de: linha.etapas.length, titulo: e.titulo, legenda: e.legenda, progresso: clamp((t - e.t0) / e.dur, 0, 1), contadores: c, totais: tot, comparar: false };
    if (e.id === "final" && t >= linha.final.comparar.t0) { info.comparar = true; info.titulo = "Antes × Depois"; info.legenda = "À esquerda, como era; à direita, como ficou."; }
    return info;
  }

  /* ------------------------------------------------------------ A CÂMERA ABSTRATA
   * { az (rad), el (graus), d (múltiplo do raio de enquadramento), y (0..1: quanto o alvo sobe) }.
   * A tela converte em posição (centro e raio do modelo). Catmull-Rom pelos pontos de cada etapa. */
  var CAM = {
    //            elevação no fim da etapa, distância no fim da etapa, deriva do azimute (rad/s)
    inicio: { el: 82, d: 1.5 },
    planta: { el: 62, d: 1.28, w: 0.040 }, existente: { el: 42, d: 1.12, w: 0.045 }, demolicao: { el: 34, d: 1.04, w: 0.050 },
    construcao: { el: 31, d: 1.02, w: 0.045 }, acabamentos: { el: 27, d: 0.98, w: 0.055 }, final: { el: 24, d: 1.0, w: 0 }
  };
  var AZ_FINAL = 0.50;   /* o 3/4 frontal em que a órbita termina e a cortina do antes × depois começa */
  function crom(p0, p1, p2, p3, u) {
    var u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  function camPontos(linha) {
    if (linha._camPts) return linha._camPts;
    var T = [0], EL = [CAM.inicio.el], D = [CAM.inicio.d], deriva = 0;
    linha.etapas.forEach(function (e) {
      var c = CAM[e.id];
      T.push(e.t1); EL.push(c.el); D.push(c.d);
      if (e.id !== "final") deriva += c.w * e.dur;
    });
    /* a órbita do final começa em AZ_FINAL − 2π: a deriva das etapas de antes é calculada para chegar ali sem salto */
    var azFim = AZ_FINAL - 2 * Math.PI, azIni = azFim - deriva;
    var AZ = [azIni], az = azIni;
    linha.etapas.forEach(function (e) {
      if (e.id === "final") az = azFim + 0.05 * e.dur;   /* só guia a curva do último trecho antes da órbita (a órbita tem fórmula própria) */
      else az += CAM[e.id].w * e.dur;
      AZ.push(az);
    });
    linha._camPts = { T: T, EL: EL, D: D, AZ: AZ };
    return linha._camPts;
  }
  function suave(x) { return x * x * (3 - 2 * x); }
  function camera(linha, t) {
    var P = camPontos(linha), tt = clamp(t, 0, linha.total), T = P.T, i = 0, fim = linha.final;
    if (tt >= fim.orbita.t0) {
      /* a órbita completa do final: de AZ_FINAL − 2π a AZ_FINAL, devagar no começo e no fim; depois fica no 3/4 frontal (o antes × depois) */
      var uo = clamp((tt - fim.orbita.t0) / fim.orbita.dur, 0, 1);
      return { az: (AZ_FINAL - 2 * Math.PI) + suave(uo) * 2 * Math.PI, el: CAM.acabamentos.el + (CAM.final.el - CAM.acabamentos.el) * suave(Math.min(1, uo * 2)) + 2 * Math.sin(uo * Math.PI), d: CAM.acabamentos.d + (CAM.final.d - CAM.acabamentos.d) * suave(uo) };
    }
    while (i < T.length - 2 && tt >= T[i + 1]) i++;
    var u = T[i + 1] > T[i] ? clamp((tt - T[i]) / (T[i + 1] - T[i]), 0, 1) : 0;
    function curva(V) { return crom(V[Math.max(0, i - 1)], V[i], V[i + 1], V[Math.min(V.length - 1, i + 2)], u); }
    return { az: curva(P.AZ), el: curva(P.EL), d: curva(P.D) };
  }

  var BimApresentacao = {
    MODOS: MODOS, modoPorId: modoPorId, temFases: temFases, modoVista: modoVista, modoDaVista: modoDaVista, lados: lados, resumo: resumo, herdeiros: herdeiros, daMae: daMae,
    ETAPAS: ETAPAS, ORDEM_ETAPAS: ORDEM_ETAPAS, ENTRADA: ENTRADA, SAIDA: SAIDA, MENSAGEM_SEM_FASES: MENSAGEM_SEM_FASES, AZ_FINAL: AZ_FINAL,
    grupoDe: grupoDe, posicaoDe: posicaoDe, ehPlanta: ehPlanta,
    linhaDoTempo: linhaDoTempo, etapaEm: etapaEm, estadoPeca: estadoPeca, contadoresEm: contadoresEm, legendaEm: legendaEm, camera: camera
  };
  global.BimApresentacao = BimApresentacao;
  if (typeof module !== "undefined" && module.exports) module.exports = BimApresentacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

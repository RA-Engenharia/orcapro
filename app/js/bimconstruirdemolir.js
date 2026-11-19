/* =====================================================================
 * bimconstruirdemolir.js — PRANCHA "CONSTRUIR E DEMOLIR" (motor PURO, ES5, Node-testável).
 *
 * Pedido do Rogério (19/11/2026): um botão no BIM que gera a prancha de reforma pronta — hachura por fase, legenda, notas
 * padrão e tabela de demolição —, para qualquer projeto. A FASE de cada peça NÃO é um parâmetro novo: o BIM já tem fase
 * (js/bimfases.js — "Fase criada" / "Fase demolida", editáveis nas Propriedades). Aqui ela é lida em três nomes de obra:
 *
 *   Existente   criada antes da fase de agora e não demolida
 *   Nova        criada na fase de agora
 *   A demolir   existente, com "Fase demolida" = a fase de agora
 *
 * PROJETO DE REFORMA = a op `fases` com `reforma:true` (js/bimfases.js): peça SEM fase marcada vale Existente (nos demais
 * projetos vale Nova, como sempre). Na reforma o piso de cada ambiente vira "remover piso existente + piso novo" (o piso
 * novo é o acabamento do ambiente, que o orçamento já mede); `pisoManter` lista os ambientes que NÃO removem o piso.
 *
 *   BimConstruirDemolir.faseDe(estado, peca)                 "Existente" | "Nova" | "A demolir" | null (futuro/passado)
 *   BimConstruirDemolir.opFase(estado, ids, fase)            a op `marcar` que põe a peça nessa fase (lote = um Ctrl+Z)
 *   BimConstruirDemolir.estiloDe(item)                       a chave de estilo (hachura/cor) por categoria e fase
 *   BimConstruirDemolir.legenda(estado, opc)                 SÓ as categorias presentes no modelo
 *   BimConstruirDemolir.tabelaDemolicao / tabelaConstrucao / tabelaEsquadrias (estado, opc)   → { titulo, cabecalho, linhas, dados }
 *   BimConstruirDemolir.servicosOrc(estado, opc)             remoção de piso por ambiente (código SINAPI CONFERIDO ou PENDENTE)
 *   BimConstruirDemolir.blocosDaFolha(estado, area, opc)     legenda + notas + tabela de demolição prontas para a folha
 *
 * ⚠ NUNCA se inventa código SINAPI: a remoção de piso só ganha composição quando o acabamento do ambiente diz o material
 *   (cerâmica/porcelanato → 97633; madeira → 97643); o resto sai PENDENTE com o motivo. O teste confere código, unidade e
 *   descrição na base local (data/sinapi-MG-2026-06.json).
 * Teste: node tools/test-construir-demolir.js
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
  function r2(v) { return Math.round(v * 100) / 100; }
  function br(v) { return r2(v).toFixed(2).replace(".", ","); }

  var FASES = ["Existente", "Nova", "A demolir"];
  var FONTE = "SINAPI 06/2026 (data/sinapi-MG-2026-06.json) — conferido em tools/test-construir-demolir.js";

  /* o ESTILO por categoria: cor em hex, preenchimento, tracejado (mm de papel) e hachura ("diagonal" | "azul" | "drywall").
     `desenha` = a planta 2D (js/desenho2d.js) já desenha esta chave (a hachura de drywall precisa do material da peça no corte, que a vista ainda não leva). */
  var ESTILOS = {
    existente:            { rotulo: "Existente a manter", cor: "#6b6b6b", fill: "#bdbdbd", hachura: null, tracejado: null, desenha: true },
    demolir_parede:       { rotulo: "Parede a demolir", cor: "#1f8a3b", fill: "none", hachura: null, tracejado: [1.5, 1], desenha: true },
    nova_alvenaria:       { rotulo: "Alvenaria nova", cor: "#d00000", fill: "#d00000", hachura: null, tracejado: null, desenha: true },
    nova_drywall:         { rotulo: "Drywall novo", cor: "#d00000", fill: "none", hachura: "drywall", tracejado: null, desenha: false },
    piso_remover:         { rotulo: "Piso a remover", cor: "#333333", fill: "none", hachura: "diagonal", tracejado: null, desenha: true },
    revestimento_remover: { rotulo: "Revestimento / louça a remover", cor: "#0b5fff", fill: "none", hachura: "azul", tracejado: null, desenha: false }
  };
  var ORDEM_LEGENDA = ["existente", "demolir_parede", "nova_alvenaria", "nova_drywall", "piso_remover", "revestimento_remover"];

  var NOTAS_PADRAO = [
    "Impermeabilizar todas as áreas molhadas.",
    "Conferir todas as medidas no local antes da execução.",
    "Os elementos a demolir só serão retirados após a verificação de que não são estruturais.",
    "O entulho da demolição será removido e destinado conforme a legislação local."
  ];

  /* o serviço de REMOÇÃO DE PISO por material do acabamento (código, unidade e descrição LIDOS da base local; o teste confere) */
  var MAPA_PISO = [
    { re: /cer[aâ]mic|porcelanat|azulej/i, codigo: "97633", unidade: "M2", descricao: "DEMOLIÇÃO DE REVESTIMENTO CERÂMICO, DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023" },
    { re: /madeira|assoalho|tabua|taco/i, codigo: "97643", unidade: "M2", descricao: "REMOÇÃO DE PISO DE MADEIRA (ASSOALHO E BARROTE), DE FORMA MANUAL, SEM REAPROVEITAMENTO. AF_09/2023" }
  ];

  /* ------------------------------------------------------------ a fase em três nomes */
  function nomeFase(status) {
    if (status === "existente") return "Existente";
    if (status === "demolido") return "A demolir";
    if (status === "novo" || status === "temporario") return "Nova";
    return null;   /* futuro e passado não aparecem */
  }
  /* as peças do estado com a fase em três nomes: [{ id, origem, categoria, el, status, fase }] */
  function pecasDaFase(estado, deps) {
    var BF = dep("BimFases", "./bimfases.js"); if (!BF) return [];
    deps = comCategoria(deps);
    var cls = BF.classificar(estado || {}, undefined, deps);
    return BF.pecas(estado || {}, deps).map(function (p) {
      var st = cls.porId[p.id];
      return { id: p.id, origem: p.origem, categoria: categoriaDe(p), el: p.el, status: st, fase: nomeFase(st) };
    });
  }
  /* sem o gancho da tela, a categoria da família sai do catálogo RA (porta, janela…) */
  function comCategoria(deps) {
    if (deps && typeof deps.categoriaFam === "function") return deps;
    var RA = dep("FamiliasRA", "./familiasra.js"), o = {};
    Object.keys(deps || {}).forEach(function (k) { o[k] = deps[k]; });
    o.categoriaFam = function (id) { var f = RA && RA.obter ? RA.obter(id, true) : null; return f ? f.categoria : null; };
    return o;
  }
  var RE_LOUCA = /bacia|vaso|lavat[oó]rio|\bpia\b|cuba|tanque|bidet|mict[oó]rio|chuveiro|loucas?\b/i;
  var RE_DRYWALL = /drywall|dry-wall|gesso acartonado|placa de gesso|steel ?frame/i;
  /* categoria desta lib: parede | porta | janela | louca | outro */
  function categoriaDe(p) {
    var el = p.el || {};
    if (p.origem === "caixa" && (p.categoria === "parede" || el.tipo === "parede")) return "parede";
    if (p.origem === "familia") {
      if (p.categoria === "porta" || p.categoria === "janela") return p.categoria;
      if (RE_LOUCA.test(txt(el.famId) + " " + txt(el.tipoId))) return "louca";
    }
    return "outro";
  }
  function ehDrywall(el) { return RE_DRYWALL.test(JSON.stringify((el && el.tipoParede) || "") + " " + txt(el && el.material)); }

  /* a chave de estilo de uma peça (null = sem convenção na prancha: categoria que a prancha não pinta) */
  function estiloDe(item) {
    var c = item && item.categoria, f = item && item.fase;
    if (!f) return null;
    if (c === "parede" || c === "porta" || c === "janela") {
      if (f === "Existente") return "existente";
      if (f === "A demolir") return "demolir_parede";
      return c === "parede" && ehDrywall(item.el) ? "nova_drywall" : "nova_alvenaria";
    }
    if (c === "louca") return f === "A demolir" ? "revestimento_remover" : null;
    return null;
  }

  /* ------------------------------------------------------------ projeto de reforma e piso */
  function reforma(estado) { return !!(estado && estado.fases && estado.fases.reforma === true); }
  function pisoRemove(estado, ambId) {
    if (!reforma(estado)) return false;
    return arr(estado.fases.pisoManter).map(String).indexOf(String(ambId)) < 0;
  }
  function ambientesPiso(estado) {
    return arr(estado && estado.ambientes).filter(function (a) { return a && a.id != null; })
      .map(function (a) { return { id: String(a.id), nome: txt(a.nome) || "Ambiente", remover: pisoRemove(estado, a.id), piso: txt(a.acabPiso) }; });
  }
  /* a op que liga/desliga a reforma e os ambientes que mantêm o piso (BimFases.opFases) */
  function opReforma(estado, ligada, manter) {
    var BF = dep("BimFases", "./bimfases.js"); if (!BF) return { ok: false, motivo: "Motor de fases não carregado." };
    var o = { reforma: !!ligada };
    if (Array.isArray(manter)) o.pisoManter = manter;
    return BF.opFases(BF.lista(estado), o);
  }

  /* a op que põe as peças numa das três fases (Existente | Nova | A demolir) */
  function opFase(estado, ids, fase, deps) {
    var BF = dep("BimFases", "./bimfases.js"); if (!BF) return { ok: false, motivo: "Motor de fases não carregado." };
    var l = BF.lista(estado);
    if (FASES.indexOf(fase) < 0) return { ok: false, motivo: "Fase inválida: " + fase + "." };
    if (l.length < 2) return { ok: false, motivo: "O projeto tem uma fase só: crie a fase \"Construção nova\" em Gerenciar › Fases." };
    var nova = BF.faseNova(l), exist = l[0], porId = {};
    BF.pecas(estado, deps).forEach(function (p) { porId[p.id] = p; });
    var alvo = arr(ids).map(String).filter(function (id) { return porId[id]; });
    if (!alvo.length) return { ok: false, motivo: "Selecione peças que tenham fase (parede, porta, janela, louça…)." };
    var campos = fase === "Existente" ? { faseCriada: exist, faseDemolida: BF.NENHUM } : (fase === "Nova" ? { faseCriada: nova, faseDemolida: BF.NENHUM } : { faseCriada: exist, faseDemolida: nova });
    var ops = alvo.map(function (id) { return { op: "marcar", id: id, faseCriada: campos.faseCriada, faseDemolida: campos.faseDemolida }; });
    return { ok: true, op: ops.length === 1 ? ops[0] : { op: "lote", id: "fase-" + alvo.join("-").slice(0, 40), origem: "fase", ops: ops }, ids: alvo };
  }

  /* ------------------------------------------------------------ legenda: só o que existe no modelo */
  function legenda(estado, opc) {
    opc = opc || {};
    var pecas = pecasDaFase(estado, opc.deps), tem = {};
    pecas.forEach(function (p) { var k = estiloDe(p); if (k) tem[k] = (tem[k] || 0) + 1; });
    arr(estado && estado.ambientes).forEach(function (a) { if (a && a.id != null && pisoRemove(estado, a.id)) tem.piso_remover = (tem.piso_remover || 0) + 1; });
    var itens = ORDEM_LEGENDA.filter(function (k) { return tem[k] && (opc.incluirDrywall !== false || k !== "nova_drywall"); }).map(function (k) {
      var e = ESTILOS[k]; return { chave: k, rotulo: e.rotulo, cor: e.cor, fill: e.fill, hachura: e.hachura, tracejado: !!e.tracejado, n: tem[k] };
    });
    return { itens: itens, presentes: itens.map(function (i) { return i.chave; }) };
  }

  /* ------------------------------------------------------------ tabelas (as áreas vêm da geometria: BimAcabamento / BimParam) */
  function quantidadesAmb(estado, opc) {
    var BA = dep("BimAcabamento", "./bimacabamento.js"); if (!BA) return { porId: {} };
    opc = opc || {};
    return BA.quantidades(estado, { avaliarFam: opc.avaliarFam, vaos: opc.vaos, forroDe: opc.forroDe, niveis: opc.niveis });
  }
  /* m² de parede por face voltada para o ambiente, por fase da parede: a face de cada lado já desconta os vãos */
  function porAmbiente(estado, opc) {
    var Q = quantidadesAmb(estado, opc), st = {}, el = {}, drywall = {};
    pecasDaFase(estado, opc && opc.deps).forEach(function (p) { if (p.categoria === "parede") { st[p.id] = p.fase; el[p.id] = p.el; drywall[p.id] = ehDrywall(p.el); } });
    var out = [], avisos = [];
    arr(estado && estado.ambientes).forEach(function (a) {
      if (!a || a.id == null) return;
      var q = Q.porId[String(a.id)];
      var o = { id: String(a.id), nome: txt(a.nome) || "Ambiente", delimitado: !!(q && q.estado === "delimitado"), demolirParede: 0, novaAlvenaria: 0, novaDrywall: 0, pisoRemover: 0, areaPiso: 0 };
      if (!o.delimitado) { avisos.push("Ambiente \"" + o.nome + "\" não delimitado: sem quantidade (feche a região com paredes)."); out.push(o); return; }
      arr(q.lados).forEach(function (ld) {
        if (ld.tipo !== "parede" || !fin(ld.area) || ld.duplicado) return;
        var f = st[String(ld.id)];
        if (f === "A demolir") o.demolirParede += ld.area;
        else if (f === "Nova") { if (drywall[String(ld.id)]) o.novaDrywall += ld.area; else o.novaAlvenaria += ld.area; }
      });
      o.areaPiso = fin(q.areaPiso) ? q.areaPiso : 0;
      if (pisoRemove(estado, a.id)) o.pisoRemover = o.areaPiso;
      out.push(o);
    });
    return { ambientes: out, avisos: avisos };
  }
  function soma(l, k) { return l.reduce(function (s, x) { return s + (x[k] || 0); }, 0); }

  /* DEMOLIÇÃO: m² de parede a demolir (face voltada ao ambiente) e de piso a remover, por ambiente */
  function tabelaDemolicao(estado, opc) {
    var r = porAmbiente(estado, opc), l = r.ambientes.filter(function (a) { return a.delimitado && (a.demolirParede > 0 || a.pisoRemover > 0); });
    var linhas = l.map(function (a) { return [a.nome, br(a.demolirParede), br(a.pisoRemover)]; });
    var tp = soma(l, "demolirParede"), ts = soma(l, "pisoRemover");
    if (!linhas.length) linhas.push(["Nada a demolir", "0,00", "0,00"]); else linhas.push(["TOTAL", br(tp), br(ts)]);
    return { titulo: "QUADRO DE DEMOLIÇÃO", cabecalho: ["Ambiente", "Parede a demolir (m²)", "Piso a remover (m²)"], linhas: linhas,
             dados: { ambientes: l, totalParede: r2(tp), totalPiso: r2(ts) }, avisos: r.avisos };
  }
  /* CONSTRUÇÃO: m² de parede nova por ambiente (alvenaria e drywall separados) */
  function tabelaConstrucao(estado, opc) {
    var r = porAmbiente(estado, opc), l = r.ambientes.filter(function (a) { return a.delimitado && (a.novaAlvenaria > 0 || a.novaDrywall > 0); });
    var linhas = l.map(function (a) { return [a.nome, br(a.novaAlvenaria), br(a.novaDrywall)]; });
    var ta = soma(l, "novaAlvenaria"), td = soma(l, "novaDrywall");
    if (!linhas.length) linhas.push(["Nada a construir", "0,00", "0,00"]); else linhas.push(["TOTAL", br(ta), br(td)]);
    return { titulo: "QUADRO DE CONSTRUÇÃO", cabecalho: ["Ambiente", "Alvenaria nova (m²)", "Drywall novo (m²)"], linhas: linhas,
             dados: { ambientes: l, totalAlvenaria: r2(ta), totalDrywall: r2(td) }, avisos: r.avisos };
  }
  /* MARCA DAS ESQUADRIAS (19/11/2026): P1, P2… e J1, J2… — um número por TIPO de vão (família + tipo + largura + altura + peitoril), na ordem em que o vão aparece no modelo
     (ordem estável). É a numeração da planta 2D (marca + medidas em cm) e do quadro "Portas e janelas": a mesma fonte, a mesma marca.
     [{ id, tipo, marca, famId, tipoId, nome, material, larg, alt, peit (m, null = sem medida avaliada), fase, x, z, nx, nz, esp, texto }]
     (x, z) = o vão no plano; (nx, nz) = a normal da parede voltada PARA FORA da obra (lado oposto ao centro das paredes); texto = "80×210" ou "120×120/110" (cm). */
  function cmTxt(v) { return String(Math.round(v * 100)); }
  function textoMedidas(tipo, larg, alt, peit) {
    if (!fin(larg) || !fin(alt)) return "s/ medida";
    return cmTxt(larg) + "×" + cmTxt(alt) + (tipo === "janela" ? "/" + cmTxt(fin(peit) ? peit : 0) : "");
  }
  function esquadriasMarcadas(estado, opc) {
    opc = opc || {};
    var av = opc.avaliarFam || (opc.deps && opc.deps.avaliarFam) || null;
    var pecas = pecasDaFase(estado, opc.deps), paredes = {}, nPar = 0, mx = 0, mz = 0;
    pecas.forEach(function (p) { if (p.categoria === "parede" && fin(p.el.cx) && fin(p.el.cz)) { paredes[p.id] = p.el; nPar++; mx += p.el.cx; mz += p.el.cz; } });
    if (nPar) { mx /= nPar; mz /= nPar; }
    var chaves = { porta: [], janela: [] }, out = [];
    pecas.forEach(function (p) {
      if ((p.categoria !== "porta" && p.categoria !== "janela") || !p.fase) return;
      var el = p.el || {}, tipo = p.categoria, ab = null, par = el.host ? paredes[String(el.host.id)] : null;
      if (opc.yMin != null && opc.yMax != null && par && fin(par.cy) && fin(par.altura) && (par.cy - par.altura / 2 < opc.yMin || par.cy - par.altura / 2 > opc.yMax)) return;   /* só os vãos do pavimento da vista: a base da parede cai na faixa [yMin, yMax] */
      try { var r = typeof av === "function" ? av(el.famId, el.tipoId, el.inst) : null; ab = r && r.abertura && r.abertura.largura > 0 ? r.abertura : null; } catch (e) { ab = null; }
      var larg = ab ? ab.largura : null, alt = ab ? ab.altura : null, peit = ab ? (fin(ab.peitoril) ? ab.peitoril : 0) : null;
      var chave = [txt(el.famId), txt(el.tipoId), larg, alt, peit].join("|"), L = chaves[tipo];
      if (L.indexOf(chave) < 0) L.push(chave);
      var nrm = { x: 0, z: 0 }, esp = par && fin(par.espessura) ? par.espessura : 0.15;
      if (par && fin(par.rotY)) {
        nrm = { x: Math.sin(par.rotY), z: Math.cos(par.rotY) };   /* normal da parede (a parede vai de (cos, −sin)) */
        if ((el.x - mx) * nrm.x + (el.z - mz) * nrm.z < 0) { nrm.x = -nrm.x; nrm.z = -nrm.z; }   /* para o lado oposto ao centro da obra */
      }
      var RA = dep("FamiliasRA", "./familiasra.js"), reg = null; try { reg = RA && RA.obter ? RA.obter(el.famId, true) : null; } catch (e2) { reg = null; }
      var ins = el.inst || {};
      out.push({ id: p.id, tipo: tipo, marca: (tipo === "porta" ? "P" : "J") + (L.indexOf(chave) + 1), famId: txt(el.famId), tipoId: txt(el.tipoId), nome: txt(reg && reg.nome) || txt(el.famId),
                 material: txt(ins.Material_folha || ins.Material_marco || ""), larg: larg, alt: alt, peit: tipo === "janela" ? peit : null, fase: p.fase,
                 x: fin(el.x) ? el.x : null, z: fin(el.z) ? el.z : null, nx: nrm.x, nz: nrm.z, esp: esp, texto: textoMedidas(tipo, larg, alt, peit) });
    });
    return out;
  }
  /* o que a planta 2D desenha: [{ marca, texto, centro: {x, z} em m do desenho, tipo }] — uma marca por vão, fora da parede; some o vão a demolir? não: A demolir também leva a marca */
  function marcasPlanta(estado, opc) {
    return esquadriasMarcadas(estado, opc).filter(function (q) { return q.x != null && q.z != null; }).map(function (q) {
      return { id: q.id, marca: q.marca, texto: q.texto, tipo: q.tipo, centro: { x: q.x, z: q.z }, normal: { x: q.nx, z: q.nz }, esp: q.esp };
    });
  }
  /* PORTAS E JANELAS (quadro de esquadrias): uma linha por marca — Marca, Tipo/descrição, Largura, Altura, Peitoril (janela), Quantidade e Material (cm) */
  function tabelaEsquadrias(estado, opc) {
    var l = esquadriasMarcadas(estado, opc), por = {}, ordem = [];
    l.forEach(function (q) {
      if (!por[q.marca]) { por[q.marca] = { marca: q.marca, tipo: q.tipo, nome: q.nome, larg: q.larg, alt: q.alt, peit: q.peit, material: q.material, qtd: 0, ids: [] }; ordem.push(q.marca); }
      por[q.marca].qtd++; por[q.marca].ids.push(q.id);
    });
    ordem.sort(function (a, b) { return a.charAt(0) === b.charAt(0) ? +a.slice(1) - +b.slice(1) : (a.charAt(0) < b.charAt(0) ? 1 : -1); });   /* portas antes das janelas */
    var grupos = ordem.map(function (m) { return por[m]; });
    var linhas = grupos.map(function (g) {
      return [g.marca, (g.tipo === "porta" ? "Porta " : "Janela ") + g.nome, fin(g.larg) ? cmTxt(g.larg) : "s/ medida", fin(g.alt) ? cmTxt(g.alt) : "s/ medida", g.tipo === "janela" && fin(g.peit) ? cmTxt(g.peit) : "-", String(g.qtd), g.material || "informe"];
    });
    if (!linhas.length) linhas.push(["Nenhuma esquadria", "", "", "", "", "", ""]);
    var n = { Existente: 0, Nova: 0, "A demolir": 0 }; l.forEach(function (p) { n[p.fase]++; });
    return { titulo: "PORTAS E JANELAS", cabecalho: ["Marca", "Tipo / descrição", "Largura (cm)", "Altura (cm)", "Peitoril (cm)", "Quantidade", "Material"], linhas: linhas,
             dados: { n: n, total: l.length, grupos: grupos, esquadrias: l }, avisos: [] };
  }
  var TABELAS = { demolicao: tabelaDemolicao, construcao: tabelaConstrucao, esquadrias: tabelaEsquadrias };

  /* ------------------------------------------------------------ orçamento: remoção do piso da reforma */
  function servicoPiso(piso) {
    var s = txt(piso).trim();
    if (!s) return { codigo: null, motivo: "o ambiente não tem o acabamento do piso preenchido: sem o material não há composição de remoção — pendente" };
    for (var i = 0; i < MAPA_PISO.length; i++) if (MAPA_PISO[i].re.test(s)) return { codigo: MAPA_PISO[i].codigo, unidade: MAPA_PISO[i].unidade, descricao: MAPA_PISO[i].descricao, fonte: "mapa" };
    return { codigo: null, motivo: "piso \"" + s + "\": o mapa de remoção cobre cerâmica/porcelanato e madeira — escolha a composição à mão — pendente" };
  }
  /* o que o orçamento ganha na reforma: [{ id, rotulo, ambId, quantidade, unidade, codigo|null, descricao, motivo? }] */
  function servicosOrc(estado, opc) {
    if (!reforma(estado)) return [];
    var Q = quantidadesAmb(estado, opc), out = [];
    arr(estado.ambientes).forEach(function (a) {
      if (!a || a.id == null || !pisoRemove(estado, a.id)) return;
      var q = Q.porId[String(a.id)], nome = txt(a.nome) || "Ambiente", sv = servicoPiso(a.acabPiso);
      var s = { id: "remover-piso:" + a.id, ambId: String(a.id), rotulo: "Remoção de piso existente — " + nome, quantidade: q && fin(q.areaPiso) ? q.areaPiso : 0, unidade: sv.unidade || "M2" };
      if (!(q && q.estado === "delimitado" && fin(q.areaPiso))) { s.codigo = null; s.motivo = "ambiente não delimitado: sem área de piso — pendente"; }
      else if (!sv.codigo) { s.codigo = null; s.motivo = sv.motivo; }
      else { s.codigo = sv.codigo; s.descricao = sv.descricao; }
      out.push(s);
    });
    return out;
  }

  /* ------------------------------------------------------------ a folha */
  /* legenda + notas + tabela de demolição, na coluna da direita da área de desenho (mm do canto da folha). Devolve blocos para o Prancha.normalizar. */
  function blocosDaFolha(estado, area, opc) {
    opc = opc || {};
    var lg = legenda(estado, { incluirDrywall: opc.incluirDrywall, deps: opc.deps }), W = Math.max(40, Math.min(75, area.w * 0.22)), x = area.x + area.w - W, y = area.y + 4, blocos = [];
    if (lg.itens.length) {
      blocos.push({ tipo: "tabela", x: x, y: y, w: W, h: (lg.itens.length + 1) * 5, titulo: "LEGENDA", cabecalho: ["Convenção"],
                    linhas: lg.itens.map(function (i) { return [i.rotulo]; }),
                    amostras: lg.itens.map(function (i) { return { cor: i.cor, fill: i.fill, hachura: i.hachura, tracejado: i.tracejado }; }) });
      y += (lg.itens.length + 1) * 5 + 10;
    }
    var notas = arr(opc.notas).length ? arr(opc.notas) : NOTAS_PADRAO, linhasN = ["NOTAS"];
    notas.forEach(function (n, i) { linhasN.push((i + 1) + ". " + n); });
    var alt = 2.2, hN = linhasN.length * 3.6 + 4;
    blocos.push({ tipo: "texto", x: x, y: y, w: W, h: hN, alt: alt, linhas: linhasN });
    y += hN + 6;
    var td = tabelaDemolicao(estado, opc);
    blocos.push({ tipo: "tabela", x: x, y: y, w: W, h: Math.max(10, (td.linhas.length + 1) * 5), titulo: td.titulo, cabecalho: td.cabecalho, linhas: td.linhas });
    return { blocos: blocos, legenda: lg, demolicao: td };
  }

  var BimConstruirDemolir = {
    FASES: FASES, ESTILOS: ESTILOS, ORDEM_LEGENDA: ORDEM_LEGENDA, NOTAS_PADRAO: NOTAS_PADRAO, MAPA_PISO: MAPA_PISO, FONTE: FONTE, TABELAS: TABELAS,
    nomeFase: nomeFase, categoriaDe: categoriaDe, ehDrywall: ehDrywall, reforma: reforma, pisoRemove: pisoRemove, ambientesPiso: ambientesPiso,
    pecasDaFase: pecasDaFase, estiloDe: estiloDe, opFase: opFase, opReforma: opReforma,
    faseDe: function (estado, id, deps) { var p = pecasDaFase(estado, deps).filter(function (x) { return x.id === String(id); })[0]; return p ? p.fase : null; },
    legenda: legenda, porAmbiente: porAmbiente, tabelaDemolicao: tabelaDemolicao, tabelaConstrucao: tabelaConstrucao, tabelaEsquadrias: tabelaEsquadrias, esquadriasMarcadas: esquadriasMarcadas, marcasPlanta: marcasPlanta, textoMedidas: textoMedidas,
    servicoPiso: servicoPiso, servicosOrc: servicosOrc, blocosDaFolha: blocosDaFolha
  };

  global.BimConstruirDemolir = BimConstruirDemolir;
  if (typeof module !== "undefined" && module.exports) module.exports = BimConstruirDemolir;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

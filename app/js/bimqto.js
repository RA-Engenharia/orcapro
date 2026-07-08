/* =====================================================================
 * bimqto.js — Motor de QUANTITATIVOS do BIM (PURO, sem DOM/Three).
 * Levantamento automático: dado o conjunto de elementos do IFC, agrega
 * por DISCIPLINA/categoria a quantidade na unidade natural (contagem un,
 * comprimento m, área m², volume m³) e devolve um levantamento pronto pra
 * SEMEAR o orçamento (o modelo vira orçamento — fecha o BIM→5D).
 *
 * Contrato viewer-agnóstico: recebe elementos [{ id, tipo, nome?, aabb?, qto? }]
 *   tipo = string do tipo IFC (ex.: "IFCWALLSTANDARDCASE")
 *   aabb = { min:[x,y,z], max:[x,y,z] } em METROS no mundo (fallback geométrico)
 *   qto  = { comprimento, area, volume, contagem } em METROS/SI, quando o viewer
 *          lê o IfcElementQuantity/BaseQuantities (fonte EXATA; preferida ao aabb)
 * Fonte por linha: 'ifc' (medido do modelo) · 'estimado' (caixa envolvente) ·
 * 'contagem' · 'misto'. Node-testável. Não inventa preço (custoUnitario=0).
 * ===================================================================== */
(function (global) {
  "use strict";

  // Mapa disciplina: tipo IFC (prefixo) → categoria + unidade + o que MEDIR.
  var MAPA = {
    IFCWALL: { cat: "Paredes / Alvenaria", un: "m²", medida: "area" },
    IFCCURTAINWALL: { cat: "Fachada cortina", un: "m²", medida: "area" },
    IFCSLAB: { cat: "Lajes / Pisos", un: "m²", medida: "area" },
    IFCROOF: { cat: "Cobertura", un: "m²", medida: "area" },
    IFCCOVERING: { cat: "Revestimentos / Forros", un: "m²", medida: "area" },
    IFCPLATE: { cat: "Chapas / Placas", un: "m²", medida: "area" },
    IFCBEAM: { cat: "Vigas", un: "m", medida: "comprimento" },
    IFCCOLUMN: { cat: "Pilares", un: "m", medida: "comprimento" },
    IFCMEMBER: { cat: "Perfis metálicos", un: "m", medida: "comprimento" },
    IFCRAILING: { cat: "Guarda-corpos / Corrimãos", un: "m", medida: "comprimento" },
    IFCPILE: { cat: "Estacas", un: "m", medida: "comprimento" },
    IFCREINFORCINGBAR: { cat: "Armadura (barras)", un: "m", medida: "comprimento" },
    IFCPIPESEGMENT: { cat: "Tubulação", un: "m", medida: "comprimento" },
    IFCDUCTSEGMENT: { cat: "Dutos", un: "m", medida: "comprimento" },
    IFCCABLECARRIERSEGMENT: { cat: "Eletrocalhas / Leitos", un: "m", medida: "comprimento" },
    IFCCABLESEGMENT: { cat: "Cabos", un: "m", medida: "comprimento" },
    IFCFLOWSEGMENT: { cat: "Instalações (trechos)", un: "m", medida: "comprimento" },
    IFCFOOTING: { cat: "Fundações", un: "m³", medida: "volume" },
    IFCDOOR: { cat: "Portas", un: "un", medida: "contagem" },
    IFCWINDOW: { cat: "Janelas", un: "un", medida: "contagem" },
    IFCSTAIR: { cat: "Escadas", un: "un", medida: "contagem" },
    IFCRAMP: { cat: "Rampas", un: "un", medida: "contagem" },
    IFCSANITARYTERMINAL: { cat: "Louças / Metais sanitários", un: "un", medida: "contagem" },
    IFCLIGHTFIXTURE: { cat: "Luminárias", un: "un", medida: "contagem" },
    IFCFURNISHING: { cat: "Mobiliário", un: "un", medida: "contagem" },
    IFCFURNITURE: { cat: "Mobiliário", un: "un", medida: "contagem" },
    IFCBUILDINGELEMENTPROXY: { cat: "Elementos genéricos", un: "un", medida: "contagem" }
  };
  // chaves ordenadas do mais específico (longo) pro mais curto — casa por prefixo
  var ORDEM = Object.keys(MAPA).sort(function (a, b) { return b.length - a.length; });

  function classificarTipo(tipo) {
    var t = String(tipo || "").toUpperCase().replace(/[^A-Z]/g, "");
    for (var i = 0; i < ORDEM.length; i++) { if (t.indexOf(ORDEM[i]) === 0) return MAPA[ORDEM[i]]; }
    return null;
  }

  // Tipos NÃO-orçáveis: não se orça vazio (opening), ambiente (space), terreno (site),
  // eixo/anotação/estrutura espacial. Filtrados ANTES da agregação — senão outliers poluem
  // o total (ex.: um IfcOpeningElement com 117 mil m² de "área" no arquivo real do Rogério).
  // Prefixo só p/ famílias 100% não-orçáveis (opening/virtual); o resto é EXATO pra não pegar
  // equipamento real por engano (ex.: IFCSPACEHEATER começa com "IFCSPACE" mas é orçável).
  var EXCLUIR_EXATO = { IFCSPACE: 1, IFCSITE: 1, IFCBUILDING: 1, IFCBUILDINGSTOREY: 1, IFCPROJECT: 1, IFCGRID: 1, IFCANNOTATION: 1, IFCSPATIALZONE: 1, IFCZONE: 1 };
  function ehExcluivel(tipo) {
    var t = String(tipo || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (t.indexOf("IFCOPENING") === 0 || t.indexOf("IFCVIRTUAL") === 0) return true;
    return EXCLUIR_EXATO[t] === 1;
  }

  function absDims(aabb) {
    if (!aabb || !aabb.min || !aabb.max) return null;
    return [Math.abs(aabb.max[0] - aabb.min[0]), Math.abs(aabb.max[1] - aabb.min[1]), Math.abs(aabb.max[2] - aabb.min[2])];
  }
  // Estimativa geométrica pela caixa envolvente (fallback quando não há BaseQuantities):
  //  comprimento = maior aresta; área = produto das DUAS maiores (serve p/ parede=comp×altura
  //  e laje=lado×lado, pois a menor dimensão é sempre a espessura); volume = caixa toda.
  function bboxMedida(medida, aabb) {
    var d = absDims(aabb); if (!d) return 0;
    d.sort(function (a, b) { return b - a; });
    if (medida === "comprimento") return d[0];
    if (medida === "area") return d[0] * d[1];
    if (medida === "volume") return d[0] * d[1] * d[2];
    return 0;
  }

  // Mede UM elemento na 'medida' pedida. Preferência: IFC (exato) → caixa (estimado) → sem-medida.
  function medir(el, medida) {
    if (medida === "contagem") return { valor: 1, fonte: "contagem" };
    var q = el && el.qto && el.qto[medida];
    if (q > 0) return { valor: q, fonte: "ifc" };
    var bb = bboxMedida(medida, el && el.aabb);
    if (bb > 0) return { valor: bb, fonte: "estimado" };
    return { valor: 0, fonte: "sem-medida" };
  }

  function nomeCatDesconhecida(el) {
    var n = (el && el.nome) ? String(el.nome).trim() : "";
    if (n) return n;
    var t = String(el && el.tipo || "").replace(/^IFC/i, "").trim();
    return t || "Outros elementos";
  }

  // Levantamento agregado. opts.min (default 0): ignora categoria com quantidade < min.
  function levantar(elementos, opts) {
    opts = opts || {};
    var brutos = (elementos || []).filter(function (e) { return e && (e.tipo || e.nome); });
    var nExcluidos = 0;
    var lista = brutos.filter(function (e) { if (ehExcluivel(e.tipo)) { nExcluidos++; return false; } return true; });
    var grupos = {}; // chave categoria → acumulador
    var nEstim = 0, nMedidos = 0, nSemMedida = 0;

    lista.forEach(function (el) {
      var map = classificarTipo(el.tipo) || { cat: nomeCatDesconhecida(el), un: "un", medida: "contagem" };
      var g = grupos[map.cat];
      if (!g) { g = grupos[map.cat] = { categoria: map.cat, unidade: map.un, medida: map.medida, quantidade: 0, nElementos: 0, fontes: {}, tipos: {} }; }
      var m = medir(el, map.medida);
      g.quantidade += m.valor;
      g.nElementos += 1;
      g.fontes[m.fonte] = (g.fontes[m.fonte] || 0) + 1;
      if (el.tipo) g.tipos[String(el.tipo).toUpperCase()] = 1;
      if (m.fonte === "ifc") nMedidos++; else if (m.fonte === "estimado") nEstim++; else if (m.fonte === "sem-medida") nSemMedida++;
    });

    var linhas = Object.keys(grupos).map(function (k) {
      var g = grupos[k];
      var fk = Object.keys(g.fontes).filter(function (f) { return f === "ifc" || f === "estimado"; });
      var fonte = g.medida === "contagem" ? "contagem" : (fk.length === 0 ? "sem-medida" : (fk.length > 1 ? "misto" : fk[0]));
      var casas = g.medida === "contagem" ? 0 : 2;
      return {
        categoria: g.categoria, unidade: g.unidade, medida: g.medida,
        quantidade: g.medida === "contagem" ? g.nElementos : Math.round(g.quantidade * Math.pow(10, casas)) / Math.pow(10, casas),
        nElementos: g.nElementos, fonte: fonte, tiposIFC: Object.keys(g.tipos)
      };
    }).filter(function (l) { return l.quantidade >= (opts.min || 0); });

    linhas.sort(function (a, b) { return b.nElementos - a.nElementos; });

    var avisos = [];
    if (nEstim > 0) avisos.push("Algumas quantidades foram ESTIMADAS pela caixa envolvente do elemento (o modelo não trazia quantitativos) — revise antes de fechar o preço.");
    if (nSemMedida > 0) avisos.push(nSemMedida + " elemento(s) sem geometria/quantitativo entraram apenas como contagem.");
    if (nExcluidos > 0) avisos.push(nExcluidos + " elemento(s) não-orçável(is) (vazios, ambientes, terreno, eixos) foram ignorados.");
    if (!linhas.length) avisos.push("Nenhum elemento reconhecido para levantamento.");

    return {
      linhas: linhas,
      resumo: { nElementos: lista.length, nExcluidos: nExcluidos, nCategorias: linhas.length, nMedidosIFC: nMedidos, nEstimados: nEstim, nSemMedida: nSemMedida },
      avisos: avisos
    };
  }

  // Converte o levantamento numa ETAPA de orçamento pronta pra lançar (sem inventar preço).
  function paraOrcamento(levantamento, opts) {
    opts = opts || {};
    var linhas = (levantamento && levantamento.linhas) || [];
    return {
      nome: opts.nomeEtapa || "Levantamento BIM (modelo IFC)",
      codigo: "",
      itens: linhas.map(function (l) {
        return { codigo: "", descricao: l.categoria, unidade: l.unidade, quantidade: l.quantidade, custoUnitario: 0, _bimFonte: l.fonte };
      })
    };
  }

  var BIMQto = {
    levantar: levantar, paraOrcamento: paraOrcamento,
    _classificarTipo: classificarTipo, _ehExcluivel: ehExcluivel, _medir: medir, _bboxMedida: bboxMedida, MAPA: MAPA
  };
  global.BIMQto = BIMQto;
  if (typeof module !== "undefined" && module.exports) module.exports = BIMQto;
})(typeof window !== "undefined" ? window : this);

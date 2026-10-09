/* =====================================================================
 * bimtabela.js — TABELA/QUANTIDADES do BIM (motor puro,
 * ES5, Node-testável). Fase P5, Frente A do plano do BIM
 * (seções 3.5 e fase P5). Prévia `?previa=modelador`.
 *
 * O defeito que ela fecha (1.3, item 7): o "Quantitativos do modelo" era
 * FIXO por categoria. Tabela/Quantidades é campos + filtro +
 * classificar/agrupar + totais — e é dela que o engenheiro tira o
 * levantamento ("paredes por nível e tipo").
 *
 * REGRA DA CASA (a que mais importa aqui): a tabela LÊ DO REGISTRO
 * (js/bimparam.js, BimParam.resolver) e NUNCA recalcula. A "Área" da linha é
 * o mesmo `valor` que a paleta de Propriedades mostra, o IFC leva e o
 * orçamento multiplica. Se a tabela tivesse a sua conta, voltaríamos aos
 * "quatro lugares dizendo o que é a área de uma parede" — o defeito que a
 * P1 fechou. ⚠ Não troque `porId[campo].valor` por conta própria.
 *
 *   tabela = { id, nome, categoria, tipo: "quantidades" | "material",
 *              campos: [paramId…],
 *              filtros: [{ param, op, valor }],                (até 8, todos "E")
 *              ordenar: [{ param, desc, agrupar, cabecalho, rodape, totais, contagem }],  (até 4)
 *              formato: { paramId: { casas, un, total, oculto, titulo, alinhar } },
 *              calculados: { "CALC:<chave>": { nome, formula, dado } },
 *              fase, filtroFase, itemizar, totalGeral }
 *
 * CAMPOS: os do registro da categoria (def.tabela !== false), os do projeto
 * e da família que as peças resolvidas trazem (PROJ:…, FAM:…), "Contagem"
 * e — no LEVANTAMENTO DE MATERIAL — "Material: Nome/Área/Volume/Camada"
 * por camada (parede pelas camadas do tipo, laje, forro, pilar, viga…).
 * CAMPO CALCULADO: fórmula pelo avaliador do js/familia.js (sem eval),
 * usando os outros campos da tabela pelo nome, com "_" no lugar do espaço
 * ("Área * 0,15", "Volume / Comprimento").
 *
 * GUARDADA POR OBRA COMO OP (desfazer/refazer e nuvem como qualquer edição):
 *   {op:"tabela", id, tabela:{…}}   cria ou substitui a definição
 *   {op:"tabelaApagar", id}
 * Só a DEFINIÇÃO vai na op — as linhas são refeitas do modelo (o teto de 1
 * MiB por lista na nuvem; plano 7). ⚠ Nada de lista dentro de lista: o
 * Firestore recusa ("Nested arrays") e derruba a entidade inteira — campos
 * é lista de textos, filtros/ordenar são listas de objetos com valores
 * simples, formato/calculados são mapas. `opValida` recusa o resto.
 *
 * Saída: gerar(tabela, ctx) → { colunas, linhas, totalGeral, contagem,
 * avisos } — o que a tela (js/bimtabelaui.js), o .xlsx (construirXlsx, o
 * molde do js/bimtuboxls.js) e o bloco de prancha desenham.
 *
 * Teste: node tools/test-bimtabela.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function BP() { return dep("BimParam", "./bimparam.js"); }
  function FAM() { return dep("Familia", "./familia.js"); }
  function ARQ() { return dep("BimArq", "./bimarq.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function temChave(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function escalar(v) { return v === null || typeof v === "string" || typeof v === "boolean" || fin(v); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  /* ------------------------------------------------------------ limites */
  var LIM = { campos: 40, filtros: 8, ordenar: 4, nome: 80, calculados: 12, formula: 300, tabelas: 200 };
  var TIPOS = { quantidades: "Tabela/Quantidades", material: "Levantamento de material" };
  /* operadores do filtro (o "Filtro" da tabela; todos em "E") */
  var OPS_FILTRO = {
    igual: "igual a", diferente: "diferente de", maior: "maior que", maiorIgual: "maior ou igual a",
    menor: "menor que", menorIgual: "menor ou igual a", contem: "contém", naoContem: "não contém",
    comeca: "começa com", naoComeca: "não começa com", termina: "termina com", naoTermina: "não termina com",
    temValor: "tem um valor", semValor: "não tem valor"
  };
  /* "Filtro da fase": o inventário de parâmetros confirma só "Mostrar tudo"
     (elementos.tabela_paredes, VIEW_PHASE_FILTER). Os outros dois são da RA
     com texto descritivo, até a P10 (fases) coletar os nomes de referência. */
  var FILTROS_FASE = { tudo: "Mostrar tudo", novo: "Somente o novo desta fase", existente: "Somente o existente" };
  /* unidade de exibição por tipo de dado (o valor interno é SI: m, m², m³) */
  var UNS = {
    comprimento: { m: 1, cm: 100, mm: 1000 },
    area: { "m²": 1, "cm²": 1e4 },
    volume: { "m³": 1, L: 1000 },
    massa: { kg: 1, t: 0.001 }
  };
  var CASAS = { comprimento: 2, area: 2, volume: 3, angulo: 2, inclinacao: 1, massa: 2, secao: 2, inteiro: 0, numero: 3 };
  var NUMERICO = { comprimento: 1, area: 1, volume: 1, angulo: 1, inclinacao: 1, massa: 1, secao: 1, inteiro: 1, numero: 1 };
  /* o que se SOMA por padrão no rodapé: as grandezas EXTENSIVAS (somar
     inclinação ou espessura não tem sentido; o formato.total liga/desliga).
     Comprimento só o que é MEDIDA da peça (grupo Cotas: Comprimento,
     Perímetro, Comprimento do corte…), nunca espessura, largura, altura,
     elevação ou deslocamento — são comprimentos, mas não se somam. */
  var EXTENSIVO = { area: 1, volume: 1, massa: 1, inteiro: 1 };
  var NAO_SOMA = /espessura|largura|altura|elevação|deslocamento|profundidade|peitoril|centróide/i;
  function somaPadrao(d) {
    if (!d) return false;
    if (d.dado === "comprimento") return (d.grupo === "Cotas" || d.calculado) && !NAO_SOMA.test(txt(d.nome));
    return !!EXTENSIVO[d.dado] && !(d.dado === "inteiro" && d.grupo !== "Cotas" && d.id !== "RA_CONTAGEM");
  }

  /* ----------------------------------------------- campos que não são do registro */
  var CONTAGEM = { id: "RA_CONTAGEM", nome: "Contagem", grupo: "Outros", dado: "inteiro", un: "", lado: "instancia" };
  var MAT = {
    "MAT:NOME": { id: "MAT:NOME", nome: "Material: Nome", grupo: "Materiais", dado: "texto", un: "", lado: "instancia" },
    "MAT:CAMADA": { id: "MAT:CAMADA", nome: "Material: Camada", grupo: "Materiais", dado: "texto", un: "", lado: "instancia" },
    "MAT:AREA": { id: "MAT:AREA", nome: "Material: Área", grupo: "Materiais", dado: "area", un: "m²", lado: "instancia" },
    "MAT:VOLUME": { id: "MAT:VOLUME", nome: "Material: Volume", grupo: "Materiais", dado: "volume", un: "m³", lado: "instancia" }
  };
  /* categorias com levantamento de material (o que tem camada ou material) */
  var CATS_MATERIAL = { parede: 1, laje: 1, forro: 1, pilar: 1, viga: 1, cobertura: 1, escada: 1 };

  /* ------------------------------------------------------------ texto BR */
  function br(v, casas) {
    var s = (Math.round(v * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    var p = s.split("."), inteiro = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    if (neg && /^[0.]+$/.test(inteiro) && !/[1-9]/.test(p[1] || "")) neg = false;   /* -0,00 vira 0,00 */
    return (neg ? "-" : "") + inteiro + (p[1] ? "," + p[1] : "");
  }
  function cmpTexto(a, b) {
    try { return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true }); } catch (e) { return a < b ? -1 : a > b ? 1 : 0; }
  }
  /* comparação do "Classificar": vazio primeiro, número por
     número, texto em ordem natural (P2 antes de P10) */
  function cmpValor(a, b) {
    var va = a == null || a === "", vb = b == null || b === "";
    if (va || vb) return va && vb ? 0 : (va ? -1 : 1);
    /* ⚠ número igual a menos do ruído do ponto flutuante EMPATA: 10,99 m² de
       duas paredes saem de contas diferentes (10,990000000000002 × 10,99) e,
       sem a folga, a ordem das linhas "empatadas" dependia do último bit —
       a 2ª classificação (Comentários, Marca) é que tem de decidir */
    if (fin(a) && fin(b)) { var tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); return a < b - tol ? -1 : a > b + tol ? 1 : 0; }
    if (typeof a === "boolean" || typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
    return cmpTexto(a, b);
  }
  /* o MESMO valor (agrupar, juntar linhas): número com a folga do cmpValor; texto letra a letra ("Sala" e "sala" são grupos diferentes) */
  function mesmoValor(a, b) { if (fin(a) && fin(b)) return cmpValor(a, b) === 0; return cmpValor(a, b) === 0 && txt(a) === txt(b); }
  /* o nome do campo na fórmula: o rótulo com "_" no lugar do espaço */
  function nomeFormula(nome) { return txt(nome).trim().replace(/[\s:/\-]+/g, "_").replace(/[^A-Za-zÀ-ÿ0-9_]/g, "").replace(/^([0-9])/, "_$1"); }

  /* ================================================================ CAMPOS */
  /* as definições disponíveis numa categoria: do registro (tabela !== false),
     as do projeto/família que as peças resolvidas trazem, Contagem e, no
     levantamento de material, as de material. → { lista, porId } */
  function camposDisponiveis(cat, res, tipo) {
    var B = BP(), lista = [], porId = {};
    function add(d) { if (!d || porId[d.id]) return; porId[d.id] = d; lista.push(d); }
    if (B && B.REGISTRO[cat]) B.definicoes(cat).forEach(function (d) { if (d.tabela !== false) add(d); });
    arr(res && res.pecas).forEach(function (p) {
      if (p.categoria !== cat) return;
      arr(p.params).forEach(function (it) { if (it.def && /^(PROJ|FAM):/.test(it.def.id) && it.def.tabela !== false) add(it.def); });
    });
    add(CONTAGEM);
    if (tipo === "material" && CATS_MATERIAL[cat]) Object.keys(MAT).forEach(function (k) { add(MAT[k]); });
    return { lista: lista, porId: porId };
  }

  /* ============================================================ NORMALIZAR */
  function semListaEmLista(v) {
    if (Array.isArray(v)) return v.every(function (x) { return !Array.isArray(x) && semListaEmLista(x); });
    if (v && typeof v === "object") return Object.keys(v).every(function (k) { return semListaEmLista(v[k]); });
    return true;
  }
  function idValido(s) { return typeof s === "string" && s.length > 0 && s.length <= 60 && /^[A-Za-z0-9_:\-.]+$/.test(s); }
  /* a FORMA da definição (sem olhar o modelo): é o que o sanear e o replay
     usam. Devolve { ok, tabela, erros } — os itens ruins saem com o motivo. */
  function normalizarForma(t) {
    var erros = [];
    if (!t || typeof t !== "object" || Array.isArray(t)) return { ok: false, tabela: null, erros: ["definição de tabela vazia"] };
    var B = BP();
    var o = {
      nome: txt(t.nome).trim().slice(0, LIM.nome),
      categoria: txt(t.categoria),
      tipo: TIPOS[t.tipo] ? t.tipo : "quantidades",
      campos: [], filtros: [], ordenar: [], formato: {}, calculados: {},
      fase: B && B.FASES.indexOf(t.fase) >= 0 ? t.fase : "Construção nova",
      filtroFase: FILTROS_FASE[t.filtroFase] ? t.filtroFase : "tudo",
      itemizar: t.itemizar !== false,
      totalGeral: !!t.totalGeral
    };
    if (!o.nome) erros.push("a tabela precisa de nome");
    if (B && !B.REGISTRO[o.categoria]) erros.push("categoria \"" + o.categoria + "\" desconhecida");
    if (o.tipo === "material" && !CATS_MATERIAL[o.categoria]) erros.push("levantamento de material não existe para \"" + o.categoria + "\"");
    var vistos = {};
    arr(t.campos).forEach(function (c) {
      if (!idValido(c)) { erros.push("campo inválido: " + JSON.stringify(c)); return; }
      if (vistos[c]) return;
      if (o.campos.length >= LIM.campos) { erros.push("mais de " + LIM.campos + " campos: \"" + c + "\" ficou de fora"); return; }
      vistos[c] = 1; o.campos.push(c);
    });
    arr(t.filtros).forEach(function (f, i) {
      if (o.filtros.length >= LIM.filtros) { erros.push("mais de " + LIM.filtros + " filtros"); return; }
      if (!f || !idValido(f.param) || !OPS_FILTRO[f.op] || !escalar(f.valor === undefined ? null : f.valor)) { erros.push("filtro " + (i + 1) + " inválido"); return; }
      o.filtros.push({ param: f.param, op: f.op, valor: f.valor === undefined ? null : f.valor });
    });
    arr(t.ordenar).forEach(function (s, i) {
      if (o.ordenar.length >= LIM.ordenar) { erros.push("mais de " + LIM.ordenar + " níveis de classificação"); return; }
      if (!s || !idValido(s.param)) { erros.push("classificação " + (i + 1) + " inválida"); return; }
      var ag = !!(s.agrupar || s.cabecalho || s.rodape);
      o.ordenar.push({ param: s.param, desc: !!s.desc, agrupar: ag, cabecalho: ag && s.cabecalho !== false && (s.cabecalho != null ? !!s.cabecalho : true),
                       rodape: ag && !!s.rodape, totais: ag && !!s.rodape && s.totais !== false, contagem: ag && !!s.rodape && s.contagem !== false });
    });
    if (t.formato && typeof t.formato === "object" && !Array.isArray(t.formato)) Object.keys(t.formato).forEach(function (k) {
      var f = t.formato[k]; if (!idValido(k) || !f || typeof f !== "object" || Array.isArray(f)) return;
      var g = {};
      if (f.casas != null && fin(Number(f.casas))) g.casas = Math.max(0, Math.min(6, Math.round(Number(f.casas))));
      if (typeof f.un === "string" && f.un.length <= 6) g.un = f.un;
      if (typeof f.total === "boolean") g.total = f.total;
      if (f.oculto === true) g.oculto = true;
      if (typeof f.titulo === "string" && f.titulo.trim()) g.titulo = f.titulo.trim().slice(0, LIM.nome);
      if (f.alinhar === "esquerda" || f.alinhar === "centro" || f.alinhar === "direita") g.alinhar = f.alinhar;
      if (Object.keys(g).length) o.formato[k] = g;
    });
    if (t.calculados && typeof t.calculados === "object" && !Array.isArray(t.calculados)) Object.keys(t.calculados).forEach(function (k) {
      var c = t.calculados[k];
      if (Object.keys(o.calculados).length >= LIM.calculados) { erros.push("mais de " + LIM.calculados + " campos calculados"); return; }
      if (!/^CALC:[A-Za-z0-9_\-]{1,40}$/.test(k) || !c || typeof c !== "object" || !txt(c.nome).trim() || !txt(c.formula).trim()) { erros.push("campo calculado \"" + k + "\" inválido"); return; }
      o.calculados[k] = { nome: txt(c.nome).trim().slice(0, LIM.nome), formula: txt(c.formula).slice(0, LIM.formula),
                          dado: NUMERICO[c.dado] ? c.dado : "numero" };
    });
    if (!semListaEmLista(o)) erros.push("lista dentro de lista");
    return { ok: !erros.length, tabela: o, erros: erros };
  }
  /* a definição conferida CONTRA O MODELO: campos/filtros/ordem que a
     categoria não tem saem (com aviso) — o resto continua valendo */
  function normalizar(t, res) {
    var n = normalizarForma(t); if (!n.tabela) return n;
    var o = n.tabela, disp = camposDisponiveis(o.categoria, res, o.tipo), avisos = n.erros.slice();
    function existe(id) { return !!disp.porId[id] || !!o.calculados[id]; }
    o.campos = o.campos.filter(function (c) { if (existe(c)) return true; avisos.push("o campo \"" + c + "\" não existe em " + nomeCategoria(o.categoria) + " (saiu da tabela)"); return false; });
    o.filtros = o.filtros.filter(function (f) { if (existe(f.param)) return true; avisos.push("o filtro por \"" + f.param + "\" saiu: o campo não existe"); return false; });
    o.ordenar = o.ordenar.filter(function (s) { if (existe(s.param)) return true; avisos.push("a classificação por \"" + s.param + "\" saiu: o campo não existe"); return false; });
    return { ok: n.ok && avisos.length === n.erros.length, tabela: o, erros: avisos, disponiveis: disp };
  }
  function nomeCategoria(cat) { var B = BP(); return B && B.REGISTRO[cat] ? B.REGISTRO[cat].nome : cat; }

  /* ================================================================ LINHAS */
  /* as camadas de material de uma peça (levantamento de material): a parede
     pelas camadas do tipo (áreas do BimArq.camadasDe — o mesmo motor do
     "Camadas (área por camada)" do registro), o resto pelo material do
     registro com a Área e o Volume do registro. Nada é recalculado aqui. */
  function camadasMaterial(p, el) {
    var A = ARQ(), V = function (id) { var it = p.porId[id]; return it ? it.valor : null; };
    var porCat = "<Por categoria>";
    if (p.categoria === "parede") {
      var tp = el && el.tipoParede;
      if (tp && arr(tp.camadas).length && A && A.camadasDe) {
        var areas = A.camadasDe(el, V("RA_PAREDE_AREA_VAOS") || 0);
        return arr(tp.camadas).map(function (k, i) {
          var a = areas[i] || {};
          return { nome: txt(k.material) || porCat, camada: txt(k.rotulo) + (k.face ? " (" + ({ fora: "face externa", dentro: "face interna", nucleo: "núcleo" }[k.face] || k.face) + ")" : ""), area: fin(a.area) ? a.area : null, volume: fin(a.volume) ? a.volume : null };
        });
      }
      return [{ nome: txt(V("STRUCTURAL_MATERIAL_PARAM")) || porCat, camada: "Núcleo", area: V("HOST_AREA_COMPUTED"), volume: V("HOST_VOLUME_COMPUTED") }];
    }
    if (p.categoria === "forro") {
      var tf = el && el.tipoForro, Af = V("HOST_AREA_COMPUTED");
      if (tf && arr(tf.camadas).length) return arr(tf.camadas).map(function (k) {
        return { nome: txt(k.material) || porCat, camada: txt(k.rotulo), area: Af, volume: fin(Af) && fin(Number(k.e)) ? Af * Number(k.e) : null };
      });
      return [{ nome: txt(V("MATERIAL_ID_PARAM")) || porCat, camada: "Forro", area: Af, volume: V("HOST_VOLUME_COMPUTED") }];
    }
    if (p.categoria === "laje") return [{ nome: txt(V("STRUCTURAL_MATERIAL_PARAM")) || porCat, camada: "Núcleo", area: V("HOST_AREA_COMPUTED"), volume: V("HOST_VOLUME_COMPUTED") }];
    if (p.categoria === "pilar" || p.categoria === "viga") {
      var sup = V("RA_PECA_AREA_FORMA"); if (sup == null) sup = V("STEEL_ELEM_PAINT_AREA"); if (sup == null) sup = V("RA_PECA_AREA_SUPERFICIE");
      return [{ nome: txt(V("STRUCTURAL_MATERIAL_PARAM")) || porCat, camada: "Seção", area: sup, volume: V("HOST_VOLUME_COMPUTED") }];
    }
    if (p.categoria === "cobertura") return [{ nome: porCat, camada: "Cobertura", area: V("HOST_AREA_COMPUTED"), volume: V("HOST_VOLUME_COMPUTED") }];
    if (p.categoria === "escada") return [{ nome: "Concreto armado", camada: "Lance e patamar", area: V("RA_ESCADA_AREA_PISO"), volume: V("RA_ESCADA_VOLUME") }];
    return [];
  }
  /* a fase da peça vale na fase da tabela? (Fase criada / Fase demolida do registro) */
  function naFase(p, fase, filtro) {
    var B = BP(), F = B ? B.FASES : ["Existente", "Construção nova"], iF = F.indexOf(fase);
    var cr = p.porId.PHASE_CREATED ? txt(p.porId.PHASE_CREATED.valor) : "Construção nova";
    var dm = p.porId.PHASE_DEMOLISHED ? txt(p.porId.PHASE_DEMOLISHED.valor) : "Nenhum";
    var iC = F.indexOf(cr); if (iC < 0) iC = F.length - 1;
    var iD = dm && dm !== "Nenhum" ? F.indexOf(dm) : -1;
    if (iC > iF) return false;                      /* nasce depois desta fase */
    if (iD >= 0 && iD < iF) return false;           /* já foi demolida antes */
    if (filtro === "novo") return iC === iF;
    if (filtro === "existente") return iC < iF && iD < 0;
    return true;
  }
  function passaFiltro(v, f) {
    var vazio = v == null || v === "";
    if (f.op === "temValor") return !vazio;
    if (f.op === "semValor") return vazio;
    var alvo = f.valor;
    if (fin(v) && (fin(alvo) || (typeof alvo === "string" && alvo.trim() !== "" && isFinite(Number(String(alvo).replace(",", ".")))))) {
      var a = fin(alvo) ? alvo : Number(String(alvo).replace(",", "."));
      var e = 1e-9;
      switch (f.op) {
        case "igual": return Math.abs(v - a) <= e; case "diferente": return Math.abs(v - a) > e;
        case "maior": return v > a + e; case "maiorIgual": return v >= a - e;
        case "menor": return v < a - e; case "menorIgual": return v <= a + e;
      }
    }
    var s = txt(typeof v === "boolean" ? (v ? "Sim" : "Não") : v).toLowerCase(), t = txt(alvo).toLowerCase();
    switch (f.op) {
      case "igual": return s === t; case "diferente": return s !== t;
      case "contem": return s.indexOf(t) >= 0; case "naoContem": return s.indexOf(t) < 0;
      case "comeca": return s.indexOf(t) === 0; case "naoComeca": return s.indexOf(t) !== 0;
      case "termina": return t.length <= s.length && s.slice(s.length - t.length) === t;
      case "naoTermina": return !(t.length <= s.length && s.slice(s.length - t.length) === t);
      case "maior": return cmpValor(v, alvo) > 0; case "maiorIgual": return cmpValor(v, alvo) >= 0;
      case "menor": return cmpValor(v, alvo) < 0; case "menorIgual": return cmpValor(v, alvo) <= 0;
    }
    return false;
  }

  /* ================================================================ GERAR
   * ctx = { res (BimParam.resolver), estado (o do editor — só o
   *         levantamento de material e o enquadrar precisam), deps }
   * → { tabela, colunas:[{id, nome, titulo, dado, un, fator, casas, total, oculto, alinhar}],
   *     linhas:[{tipo:"cabecalho"|"item"|"rodape", nivel, titulo, valores:{colId}, textos:{colId}, ids:[], n}],
   *     totalGeral:{titulo, valores, textos, n}|null, contagem, avisos } */
  function gerar(tab, ctx) {
    ctx = ctx || {};
    var res = ctx.res || { pecas: [] }, nm = normalizar(tab, res), t = nm.tabela, avisos = nm.erros.slice();
    if (!t) return { tabela: null, colunas: [], linhas: [], totalGeral: null, contagem: 0, avisos: avisos };
    var disp = nm.disponiveis;
    function defDe(id) { if (t.calculados[id]) { var c = t.calculados[id]; return { id: id, nome: c.nome, dado: c.dado, un: unPadrao(c.dado), calculado: true }; } return disp.porId[id]; }
    function unPadrao(d) { var U = UNS[d]; return U ? Object.keys(U)[0] : ""; }
    /* as colunas: rótulo do registro, unidade e casas do formato */
    var colunas = t.campos.map(function (id) {
      var d = defDe(id), f = t.formato[id] || {}, U = UNS[d.dado], un = U && f.un && U[f.un] ? f.un : (U ? (U[d.un] ? d.un : unPadrao(d.dado)) : (d.un || ""));
      var num = !!NUMERICO[d.dado];
      return { id: id, nome: d.nome, titulo: f.titulo || d.nome, dado: d.dado, un: un, fator: U && U[un] ? U[un] : 1,
               casas: f.casas != null ? f.casas : (CASAS[d.dado] != null ? CASAS[d.dado] : 2), numerico: num,
               total: num && (f.total != null ? !!f.total : somaPadrao(d)), oculto: !!f.oculto, alinhar: f.alinhar || (num ? "direita" : "esquerda") };
    });
    var colPorId = {}; colunas.forEach(function (c) { colPorId[c.id] = c; });
    /* os ids de que a linha precisa: os campos, os filtros, a classificação */
    var precisa = {}; t.campos.concat(t.filtros.map(function (f) { return f.param; })).concat(t.ordenar.map(function (s) { return s.param; })).forEach(function (k) { precisa[k] = 1; });
    var calcIds = Object.keys(t.calculados).filter(function (k) { return precisa[k]; });
    var F = FAM(), avisoCalc = {};
    var elPorId = {};
    if (t.tipo === "material" && ctx.estado) ["caixas", "coberturas", "forros"].forEach(function (k) { arr(ctx.estado[k]).forEach(function (e) { if (e) elPorId[String(e.id)] = e; }); });

    /* 1) as linhas cruas (uma por peça; no material, uma por camada) */
    var cru = [], ordemOrig = 0;
    arr(res.pecas).forEach(function (p) {
      if (p.categoria !== t.categoria) return;
      if (!naFase(p, t.fase, t.filtroFase)) return;
      var base = {};
      Object.keys(precisa).forEach(function (k) {
        if (k === CONTAGEM.id) base[k] = 1;
        else if (MAT[k] || t.calculados[k]) return;
        else base[k] = p.porId[k] ? p.porId[k].valor : null;
      });
      var cams = t.tipo === "material" ? camadasMaterial(p, elPorId[p.id]) : [null];
      cams.forEach(function (cm) {
        var v = {}; Object.keys(base).forEach(function (k) { v[k] = base[k]; });
        if (cm) { v["MAT:NOME"] = cm.nome; v["MAT:CAMADA"] = cm.camada; v["MAT:AREA"] = cm.area; v["MAT:VOLUME"] = cm.volume; }
        /* campos calculados: a fórmula com os outros campos da tabela pelo nome */
        calcIds.forEach(function (k) {
          var c = t.calculados[k], env = {};
          Object.keys(v).forEach(function (q) { var d = defDe(q); if (d && fin(v[q])) env[nomeFormula(d.nome)] = v[q]; });
          try { v[k] = F ? F.formula(c.formula, env) : null; if (!fin(v[k])) v[k] = null; }
          catch (e) { v[k] = null; if (!avisoCalc[k]) { avisoCalc[k] = 1; avisos.push("campo calculado \"" + c.nome + "\": " + (e && e.message) + " (os nomes na fórmula são os dos campos, com _ no lugar do espaço)"); } }
        });
        cru.push({ ids: [p.id], v: v, ordem: ordemOrig++ });
      });
    });
    /* 2) filtro (todos em "E") */
    var linhasF = cru.filter(function (l) { return t.filtros.every(function (f) { return passaFiltro(l.v[f.param], f); }); });
    /* 3) classificar (estável: empate fica na ordem do modelo) */
    linhasF.sort(function (a, b) {
      for (var i = 0; i < t.ordenar.length; i++) {
        var s = t.ordenar[i], c = cmpValor(a.v[s.param], b.v[s.param]);
        if (c) return s.desc ? -c : c;
      }
      return a.ordem - b.ordem;
    });
    /* 4) sem "Itemizar cada ocorrência": linhas com os MESMOS valores em
       todos os campos de classificação viram uma (valor diferente fica em
       branco; coluna com total soma; a contagem soma) */
    function mesmaChave(a, b) { return t.ordenar.every(function (s) { return mesmoValor(a.v[s.param], b.v[s.param]); }); }
    var itens = [];
    if (t.itemizar || !t.ordenar.length) itens = linhasF.map(function (l) { return { ids: l.ids.slice(), v: l.v, n: 1 }; });
    else linhasF.forEach(function (l) {
      var u = itens[itens.length - 1];
      if (u && mesmaChave(u.src, l)) {
        u.n++; u.ids = u.ids.concat(l.ids);
        Object.keys(l.v).forEach(function (k) {
          var col = colPorId[k];
          if (col && col.total && fin(u.v[k]) && fin(l.v[k])) u.v[k] = u.v[k] + l.v[k];
          else if (k === CONTAGEM.id) u.v[k] = (u.v[k] || 0) + 1;
          else if (!mesmoValor(u.v[k], l.v[k])) u.v[k] = null;
        });
      } else itens.push({ ids: l.ids.slice(), v: clone(l.v), n: 1, src: l });
    });
    /* 5) texto de cada célula */
    function texto(v, col) {
      if (v == null || v === "") return "";
      if (col.dado === "simnao") return v ? "Sim" : "Não";
      if (!col.numerico) return txt(v);
      return br(Number(v) * col.fator, col.casas);
    }
    function textos(vals) { var o = {}; colunas.forEach(function (c) { o[c.id] = texto(vals[c.id], c); }); return o; }
    function somar(lista) {
      var s = {};
      colunas.forEach(function (c) {
        if (!c.total) return;
        var tot = 0, tem = false;
        lista.forEach(function (it) { var x = it.v[c.id]; if (fin(x)) { tot += x; tem = true; } });
        s[c.id] = tem ? r6(tot) : null;
      });
      return s;
    }
    function valoresItem(it) { var o = {}; colunas.forEach(function (c) { o[c.id] = it.v[c.id] == null ? null : it.v[c.id]; }); return o; }
    function rotuloGrupo(v, param) {
      if (v == null || v === "") return "(vazio)";
      var d = defDe(param), col = colPorId[param] || (d ? { dado: d.dado, numerico: !!NUMERICO[d.dado], fator: 1, casas: CASAS[d.dado] != null ? CASAS[d.dado] : 2 } : null);
      return col ? texto(v, col) : txt(v);
    }
    /* 6) cabeçalhos e rodapés dos grupos (cada nível de classificação com
       "agrupar" abre um grupo quando o valor muda) */
    var grupos = t.ordenar.map(function (s, i) { return { s: s, i: i }; }).filter(function (g) { return g.s.agrupar; });
    var saida = [], abertos = [];   /* abertos[k] = { valor, itens, ini } por nível de grupo */
    function fecharAte(k) {
      for (var j = abertos.length - 1; j >= k; j--) {
        var g = abertos[j], gs = grupos[j].s;
        if (gs.rodape) {
          var tot = gs.totais ? somar(g.itens) : {};
          saida.push({ tipo: "rodape", nivel: j, titulo: rotuloGrupo(g.valor, gs.param) + (gs.contagem ? ": " + g.n : ""), valores: tot, textos: textos(tot), ids: g.ids, n: g.n });
        }
      }
      abertos.length = k;
    }
    itens.forEach(function (it) {
      var muda = -1;
      for (var j = 0; j < grupos.length; j++) {
        var p = grupos[j].s.param, a = abertos[j];
        if (!a || !mesmoValor(a.valor, it.v[p])) { muda = j; break; }
      }
      if (muda >= 0) {
        fecharAte(muda);
        for (var q = muda; q < grupos.length; q++) {
          var gp = grupos[q].s, val = it.v[gp.param];
          abertos.push({ valor: val, itens: [], ids: [], n: 0 });
          if (gp.cabecalho) saida.push({ tipo: "cabecalho", nivel: q, titulo: rotuloGrupo(val, gp.param), valores: {}, textos: {}, ids: [], n: 0 });
        }
      }
      abertos.forEach(function (a) { a.itens.push(it); a.ids = a.ids.concat(it.ids); a.n += it.n; });
      var vals = valoresItem(it);
      saida.push({ tipo: "item", nivel: grupos.length, titulo: "", valores: vals, textos: textos(vals), ids: it.ids, n: it.n });
    });
    fecharAte(0);
    /* cabeçalho do grupo leva a contagem final (para a tela: "Nível 1 (10)") */
    var nTotal = itens.reduce(function (s, it) { return s + it.n; }, 0);
    var tg = null;
    if (t.totalGeral) { var tt = somar(itens); tg = { titulo: "Total geral: " + nTotal, valores: tt, textos: textos(tt), n: nTotal }; }
    return { tabela: t, colunas: colunas, linhas: saida, totalGeral: tg, contagem: nTotal, avisos: avisos };
  }

  /* ======================================================== OPS (replay) */
  function opValida(o) {
    if (!o) return undefined;
    if (o.op === "tabela") {
      if (!idValido(txt(o.id)) || !o.tabela || typeof o.tabela !== "object" || Array.isArray(o.tabela)) return false;
      if (!semListaEmLista(o.tabela)) return false;
      if (JSON.stringify(o.tabela).length > 20000) return false;
      /* ⚠ op com QUALQUER defeito de forma é recusada inteira (não só
         "consertada" na leitura): o lixo continuaria gravado na lista e
         subiria para a nuvem a cada sincronização */
      var n = normalizarForma(o.tabela);
      return n.ok && !!n.tabela && !!n.tabela.nome && (!BP() || !!BP().REGISTRO[n.tabela.categoria]);
    }
    if (o.op === "tabelaApagar") return idValido(txt(o.id));
    return undefined;
  }
  function aplicarOp(o, ctx) {
    if (!o || (o.op !== "tabela" && o.op !== "tabelaApagar")) return false;
    if (!ctx.ext.tabelas) { ctx.ext.tabelas = {}; ctx.ext.ordemTabelas = []; }
    var id = String(o.id);
    if (o.op === "tabelaApagar") {
      if (!ctx.ext.tabelas[id]) return false;
      delete ctx.ext.tabelas[id]; ctx.ext.ordemTabelas.splice(ctx.ext.ordemTabelas.indexOf(id), 1);
      return true;
    }
    if (opValida(o) !== true) return false;
    var n = normalizarForma(o.tabela).tabela; n.id = id;
    ctx.ext.tabelas[id] = n;
    if (ctx.ext.ordemTabelas.indexOf(id) < 0) ctx.ext.ordemTabelas.push(id);
    return true;
  }
  /* só quando houve op de tabela: o estado das ops antigas fica igual */
  function fimOp(ctx, out) {
    if (!ctx.ext.tabelas) return;
    out.tabelas = ctx.ext.ordemTabelas.map(function (id) { return ctx.ext.tabelas[id]; });
  }
  function registrar(BimEdit) {
    if (!BimEdit || typeof BimEdit.estender !== "function") return false;
    BimEdit.estender({ nome: "tabela", aplicar: aplicarOp, fim: fimOp, valida: opValida });
    return true;
  }
  /* id novo, sem colidir com as tabelas do estado */
  function novoId(estado, nome) {
    var base = "tab-" + (txt(nome).toLowerCase().normalize ? txt(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(nome).toLowerCase()).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    var usados = {}; arr(estado && estado.tabelas).forEach(function (t) { usados[t.id] = 1; });
    var id = base === "tab-" ? "tab-1" : base, n = 2;
    while (usados[id]) id = base + "-" + (n++);
    return id;
  }
  /* a op que cria/edita: { ok, op } ou { ok:false, motivo } */
  function opTabela(estado, tab, id) {
    var n = normalizarForma(tab);
    if (!n.tabela || !n.tabela.nome) return { ok: false, motivo: n.erros[0] || "Tabela inválida." };
    if (BP() && !BP().REGISTRO[n.tabela.categoria]) return { ok: false, motivo: "Categoria desconhecida: " + n.tabela.categoria + "." };
    if (!n.tabela.campos.length) return { ok: false, motivo: "Escolha ao menos um campo." };
    var nomes = {}; arr(estado && estado.tabelas).forEach(function (t) { if (t.id !== id) nomes[txt(t.nome).toLowerCase()] = 1; });
    if (nomes[n.tabela.nome.toLowerCase()]) return { ok: false, motivo: "Já existe uma tabela chamada \"" + n.tabela.nome + "\"." };
    var o = { op: "tabela", id: id || novoId(estado, n.tabela.nome), tabela: n.tabela };
    return { ok: true, op: o, avisos: n.erros };
  }

  /* MODELOS prontos (o "Nova tabela" já abre com os campos usuais) */
  function modelo(cat, tipo) {
    var M = {
      parede: ["ELEM_TYPE_PARAM", "CURVE_ELEM_LENGTH", "HOST_AREA_COMPUTED", "HOST_VOLUME_COMPUTED"],
      laje: ["ELEM_TYPE_PARAM", "LEVEL_PARAM", "HOST_AREA_COMPUTED", "HOST_VOLUME_COMPUTED"],
      pilar: ["ALL_MODEL_MARK", "ELEM_TYPE_PARAM", "INSTANCE_LENGTH_PARAM", "HOST_VOLUME_COMPUTED"],
      viga: ["ALL_MODEL_MARK", "ELEM_TYPE_PARAM", "STRUCTURAL_FRAME_CUT_LENGTH", "HOST_VOLUME_COMPUTED"],
      porta: ["ALL_MODEL_MARK", "ELEM_TYPE_PARAM", "GENERIC_WIDTH", "DOOR_HEIGHT", "RA_CONTAGEM"],
      janela: ["ALL_MODEL_MARK", "ELEM_TYPE_PARAM", "GENERIC_WIDTH", "DOOR_HEIGHT", "INSTANCE_SILL_HEIGHT_PARAM", "RA_CONTAGEM"],
      ambiente: ["ROOM_NUMBER", "ROOM_NAME", "ROOM_AREA", "ROOM_PERIMETER", "ROOM_VOLUME"],
      forro: ["ELEM_TYPE_PARAM", "HOST_AREA_COMPUTED", "HOST_PERIMETER_COMPUTED"],
      cobertura: ["ELEM_TYPE_PARAM", "HOST_AREA_COMPUTED", "RA_COB_AREA_PROJECAO"],
      escada: ["ELEM_TYPE_PARAM", "STAIRS_ACTUAL_NUM_RISERS", "RA_ESCADA_VOLUME"],
      guarda: ["ELEM_TYPE_PARAM", "CURVE_ELEM_LENGTH"],
      generico: ["ELEM_TYPE_PARAM", "RA_CONTAGEM"]
    };
    var campos = (M[cat] || ["ELEM_TYPE_PARAM", "RA_CONTAGEM"]).slice();
    if (tipo === "material") campos = ["MAT:NOME", "MAT:AREA", "MAT:VOLUME"];
    var nome = (tipo === "material" ? "Levantamento de material de " : "Tabela de ") + nomeCategoria(cat).toLowerCase();
    return { nome: nome, categoria: cat, tipo: tipo === "material" ? "material" : "quantidades", campos: campos, filtros: [], ordenar: [], formato: {}, itemizar: true, totalGeral: false };
  }

  /* ================================================================ .XLSX
   * O molde do js/bimtuboxls.js (mesma linguagem visual): título, subtítulo,
   * cabeçalho escuro, zebra, cabeçalho/rodapé de grupo, total geral e o
   * rodapé de procedência. ⚠ Número entra como NÚMERO (na unidade da coluna,
   * com as casas da coluna): "2,45" em texto faz a soma da coluna dar zero.
   * ⚠ Texto do modelo é neutralizado: começando com = + - @ o Excel executa
   * como fórmula. */
  var NAVY = "FF0F2740", BRANCO = "FFFFFFFF", ZEBRA = "FFF1F6FB", GRUPO = "FFE2E8F0", CINZA = "FF64748B";
  function seguro(v) { return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }
  function nomeAba(s) { return (String(s == null ? "" : s).replace(/[:\\\/?*\[\]]/g, "-").trim().substring(0, 31)) || "Tabela"; }
  function nomeArquivo(s) { return String(s == null ? "" : s).replace(/[\\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().substring(0, 90) || "Tabela"; }
  function fmtNum(casas) { return casas > 0 ? "#,##0." + new Array(casas + 1).join("0") : "#,##0"; }
  function borda() { var s = { style: "thin", color: { argb: "FFCBD5E1" } }; return { top: s, left: s, bottom: s, right: s }; }
  function construirXlsx(ExcelJS, saida, meta) {
    meta = meta || {};
    var wb = new ExcelJS.Workbook();
    wb.creator = "OrçaPRO"; wb.created = meta.data || new Date();
    var t = saida.tabela || { nome: "Tabela" }, cols = saida.colunas.filter(function (c) { return !c.oculto; });
    var ws = wb.addWorksheet(nomeAba(t.nome), { views: [{ state: "frozen", ySplit: 3 }] });
    var nc = Math.max(1, cols.length);
    ws.mergeCells(1, 1, 1, nc);
    var c1 = ws.getCell(1, 1); c1.value = seguro(t.nome); c1.font = { bold: true, size: 13, color: { argb: NAVY } };
    ws.mergeCells(2, 1, 2, nc);
    var c2 = ws.getCell(2, 1);
    c2.value = (TIPOS[t.tipo] || "Tabela") + " · " + nomeCategoria(t.categoria) + " · " + saida.contagem + (saida.contagem === 1 ? " elemento" : " elementos") +
      (meta.obra ? " · obra: " + meta.obra : "") + " · gerado em " + (meta.dataTexto || new Date().toLocaleString("pt-BR"));
    c2.font = { size: 10, color: { argb: CINZA } };
    var hr = ws.getRow(3);
    cols.forEach(function (c, i) {
      var cell = hr.getCell(i + 1);
      cell.value = c.titulo + (c.un ? " (" + c.un + ")" : "");
      cell.font = { bold: true, color: { argb: BRANCO } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: c.alinhar === "direita" ? "right" : (c.alinhar === "centro" ? "center" : "left") };
      cell.border = borda();
      ws.getColumn(i + 1).width = Math.max(10, Math.min(48, (c.titulo.length + (c.un ? c.un.length + 3 : 0)) + 4));
    });
    hr.height = 28;
    var r = 3, zebra = 0;
    function valorCel(v, c) {
      if (v == null || v === "") return "";
      if (c.dado === "simnao") return v ? "Sim" : "Não";
      if (c.numerico) return Math.round(Number(v) * c.fator * 1e6) / 1e6;
      return seguro(txt(v));
    }
    function linhaGrupo(l, fill) {
      r++;
      var row = ws.getRow(r);
      cols.forEach(function (c, i) {
        var cell = row.getCell(i + 1), v = l.valores[c.id];
        if (i === 0 && (v == null || v === "")) cell.value = seguro(l.titulo);
        else { cell.value = valorCel(v, c); if (c.numerico && fin(cell.value)) cell.numFmt = fmtNum(c.casas); }
        cell.font = { bold: true }; cell.border = borda();
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        if (c.alinhar === "direita") cell.alignment = { horizontal: "right" };
      });
    }
    saida.linhas.forEach(function (l) {
      if (l.tipo === "cabecalho") {
        r++; ws.mergeCells(r, 1, r, nc);
        var ch = ws.getCell(r, 1); ch.value = seguro(l.titulo); ch.font = { bold: true, color: { argb: NAVY } };
        ch.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRUPO } }; ch.border = borda();
        zebra = 0; return;
      }
      if (l.tipo === "rodape") { linhaGrupo(l, GRUPO); return; }
      r++;
      var row = ws.getRow(r);
      cols.forEach(function (c, i) {
        var cell = row.getCell(i + 1), v = valorCel(l.valores[c.id], c);
        cell.value = v;
        if (c.numerico && fin(v)) cell.numFmt = fmtNum(c.casas);
        cell.border = borda();
        if (zebra % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
        if (c.alinhar === "direita") cell.alignment = { horizontal: "right" };
        else if (c.alinhar === "centro") cell.alignment = { horizontal: "center" };
      });
      zebra++;
    });
    if (saida.totalGeral) linhaGrupo(saida.totalGeral, "FFCBD5E1");
    r += 2;
    ws.mergeCells(r, 1, r, nc);
    var cf = ws.getCell(r, 1);
    cf.value = "Números do modelo do OrçaPRO, lidos do registro de parâmetros — os mesmos das Propriedades, do IFC exportado e do Orçamento do modelo. " +
      "Unidade de cada coluna no cabeçalho; os totais somam os valores exatos (não os arredondados).";
    cf.font = { italic: true, size: 9.5, color: { argb: "FFB45309" } };
    cf.alignment = { wrapText: true };
    ws.getRow(r).height = 30;
    return wb;
  }

  var BimTabela = {
    LIM: LIM, TIPOS: TIPOS, OPS_FILTRO: OPS_FILTRO, FILTROS_FASE: FILTROS_FASE, UNS: UNS, CASAS: CASAS,
    CONTAGEM: CONTAGEM, MAT: MAT, CATS_MATERIAL: CATS_MATERIAL,
    camposDisponiveis: camposDisponiveis, normalizarForma: normalizarForma, normalizar: normalizar,
    gerar: gerar, passaFiltro: passaFiltro, cmpValor: cmpValor, mesmoValor: mesmoValor, somaPadrao: somaPadrao, nomeFormula: nomeFormula, naFase: naFase, camadasMaterial: camadasMaterial,
    opValida: opValida, aplicarOp: aplicarOp, registrar: registrar, novoId: novoId, opTabela: opTabela, modelo: modelo,
    semListaEmLista: semListaEmLista, nomeCategoria: nomeCategoria,
    construirXlsx: construirXlsx, nomeArquivo: nomeArquivo, _seguro: seguro, br: br
  };
  if (global.BimEdit) registrar(global.BimEdit);
  else { var BEd = dep("BimEdit", "./bimedit.js"); if (BEd) registrar(BEd); }
  global.BimTabela = BimTabela;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTabela;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * biminsttipos.js (BimInstTipos) — SELETOR DE TIPOS em Propriedades e
 * ATALHOS DE TECLADO de duas letras das instalações (17/10/2026).
 *
 * Pedido do Rogério (print de referência 10.png): no topo de Propriedades, com
 * a ferramenta Tubo ativa ou um tubo selecionado, a MINIATURA do tipo (um
 * pedaço de tubo na cor real do material), a categoria e o nome do tipo; o
 * clique abre a lista com "Pesquisar", cada tipo com a miniatura e o nome, e
 * "Tipos mais recentemente utilizados" no rodapé (guardado por usuário). O
 * mesmo seletor vale para Conexão, Acessório, Aparelho sanitário e
 * Equipamento. E os atalhos de duas letras digitadas em sequência com a
 * vista focada, como é costume em software BIM (tela Atalhos editável).
 *
 * CONVENÇÃO DE NOMES: prefixo do sistema + "_" + nome do tipo (AF_, AQ_, ESG_,
 * PLUV_, VENT_, AÇO_…), sem nome de produto de terceiro. O MATERIAL de cada
 * tipo é um material que o js/biminst.js JÁ tem (DN, SINAPI e geometria); tipo
 * cujo material o OrçaPRO ainda não tem aparece na lista INDISPONÍVEL, com o
 * motivo — nunca vira outro material "parecido".
 *
 * MINIATURA: img/hid-pecas/<ícone>-256.png, renderizada da própria geometria
 * do 3D (tools/gerar-hid-icones.js; os tubos sem ficha de peça com
 * "tubo-<material>", tools/hid-icones.html).
 *
 *   PURO (Node-testável): catalogo(cat), tipo(id), pesquisar(cat, q),
 *     tipoDoTrecho(t), opsTrocarTubo(estado, id, tipo, rede), recentes/usar,
 *     atalhos(), validarAtalhos(mapa), colisoes(), resolverTecla(buffer, tecla)
 *   TELA: decorar(raiz, esquema) (chamado depois do BimShell.pintarProps),
 *     abrirLista(ancora, cat), aplicar(tipo, ctx), instalar(doc), abrirAtalhos()
 * Teste: node tools/test-biminsttipos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function GEO() { return dep("HidGeo", "./biminstgeo.js"); }
  function PEC() { return dep("HidPecas", "./hidpecas.js"); }
  function HF() { return dep("HidFamilias", "./hidfamilias.js"); }
  function CF() { return dep("ClimFamilias", "./climfamilias.js"); }
  function esc(s) { return txt(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : txt(s).toLowerCase(); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info"); } catch (e) {} }

  var PASTA_ICONES = "img/hid-pecas/";
  var CATEGORIAS = {
    tubo: "Tipos de tubos", conexao: "Conexões de tubo", acessorio: "Acessórios de tubo",
    aparelho: "Aparelhos sanitários", equipamento: "Equipamento mecânico"
  };
  var ORDEM_CAT = ["tubo", "conexao", "acessorio", "aparelho", "equipamento"];
  var MAX_RECENTES = 8;
  /* CATEGORIAS DE OUTROS MÓDULOS (27/10/2026): Porta, Janela e Componente (js/bimarqtipos.js) usam o MESMO seletor e a MESMA lista
     (pesquisar, recentes, rodapé). O módulo registra { rotulo, catalogo(), contexto(esquema), aplicar(tipo, ctx), esquecer() }; as
     categorias dele NÃO entram em ORDEM_CAT (atalhos, testes de ícone e filtro de cálculo das instalações seguem iguais). */
  var PROV = {};

  /* ------------------------------------------------------------- TUBOS
   * id estável · nome (convenção) · sistema (o do prefixo) · material do biminst · pn (série do PPR) ·
   * semMaterial = motivo quando o OrçaPRO ainda não tem o material */
  var TUBOS = [
    { id: "af-soldavel", nome: "AF_Tubo Marrom Soldável", sistema: "agua_fria", material: "pvc_soldavel" },
    { id: "af-roscavel", nome: "AF_Tubo Branco Roscável", sistema: "agua_fria", material: "pvc_roscavel",
      semMaterial: "O tubo de PVC roscável ainda não é material do OrçaPRO (falta a tabela de DN da norma e o mapa SINAPI): por ora, use o soldável." },
    { id: "af-ppr-pn12", nome: "AF_Tubo PPR - PN12", sistema: "agua_fria", material: "ppr", pn: "12" },
    { id: "af-cobre", nome: "AF_Tubo de Cobre", sistema: "agua_fria", material: "cobre" },
    { id: "aq-cpvc", nome: "AQ_Tubo CPVC", sistema: "agua_quente", material: "cpvc" },
    { id: "aq-ppr-pn12", nome: "AQ_Tubo PPR - PN12", sistema: "agua_quente", material: "ppr", pn: "12" },
    { id: "aq-ppr-pn20", nome: "AQ_Tubo PPR - PN20", sistema: "agua_quente", material: "ppr", pn: "20" },
    { id: "aq-ppr-pn25", nome: "AQ_Tubo PPR - PN25", sistema: "agua_quente", material: "ppr", pn: "25" },
    { id: "aq-cobre", nome: "AQ_Tubo de Cobre", sistema: "agua_quente", material: "cobre" },
    { id: "aco-galvanizado", nome: "AÇO_Tubo Galvanizado", sistema: "incendio", material: "aco_galvanizado" },
    { id: "aco-preto", nome: "AÇO_Tubo Preto", sistema: "incendio", material: "aco_preto" },
    { id: "esg-normal", nome: "ESG_Tubo Série Normal", sistema: "esgoto", material: "pvc_esgoto" },
    { id: "esg-reforcada", nome: "ESG_Tubo Série Reforçada", sistema: "esgoto", material: "pvc_serie_r" },
    { id: "esg-ocre", nome: "ESG_Tubo Ocre enterrado", sistema: "esgoto", material: "pvc_esgoto_enterrado" },
    { id: "vent-normal", nome: "VENT_Tubo Série Normal", sistema: "ventilacao", material: "pvc_esgoto" },
    { id: "pluv-normal", nome: "PLUV_Tubo Série Normal", sistema: "pluvial", material: "pvc_esgoto" },
    { id: "pluv-reforcada", nome: "PLUV_Tubo Série Reforçada", sistema: "pluvial", material: "pvc_serie_r" },
    { id: "pluv-concreto", nome: "PLUV_Tubo de Concreto", sistema: "pluvial", material: "concreto",
      semMaterial: "O tubo de concreto ainda não é material do OrçaPRO (falta a tabela de DN da norma e o mapa SINAPI)." },
    { id: "dr-soldavel", nome: "DR_Tubo Soldável (dreno)", sistema: "dreno", material: "pvc_soldavel" },
    { id: "fr-cobre", nome: "FR_Tubo de Cobre isolado (frigorígeno)", sistema: "frigorigeno", material: "cobre_frigorigeno" },
    { id: "ind-aco-carbono", nome: "IND_Tubo Aço Carbono", sistema: "industrial", material: "aco_carbono" },
    { id: "ind-inox", nome: "IND_Tubo Aço Inox", sistema: "industrial", material: "inox" },
    { id: "ind-pead", nome: "IND_Tubo PEAD", sistema: "industrial", material: "pead" }
  ];
  /* prefixo e sufixo do nome das CONEXÕES por material */
  var CX_MAT = { pvc_soldavel: ["AF_", "Soldável"], ppr: ["AQ_", "PPR"], cpvc: ["AQ_", "CPVC"], cobre: ["AQ_", "Cobre"],
                 pvc_esgoto: ["ESG_", "Série Normal"], pvc_serie_r: ["ESG_", "Série Reforçada"] };
  var CX_TIPO = { joelho90: "Joelho 90°", joelho45: "Joelho 45°", te: "Tê", te_reducao: "Tê de redução", juncao: "Junção", luva: "Luva", reducao: "Redução" };
  /* prefixo dos aparelhos e equipamentos pelo uso */
  function prefFam(id, cat) { if (/clim/.test(id)) return "CLIM_"; if (/hidrante|extintor|sprinkler/.test(id)) return "INC_"; if (/caixa-sifonada|ralo|gordura|inspecao|areia/.test(id)) return "ESG_"; if (/caixa-dagua|cisterna|reservatorio|bomba|aquecedor/.test(id)) return "AF_"; return cat === "aparelho" ? "LOU_" : "EQ_"; }
  function iconeFam(id) { return "fam-" + String(id).replace(/^hid-/, "").replace(/^ra-/, ""); }

  var _cache = {}, _fonte = null, _fonteT = 0;
  function icone(nome) { return PASTA_ICONES + nome + "-256.png"; }
  function corMaterial(material, sistema) {
    var G = GEO(); try { var a = G && G.aparencia ? G.aparencia(material, sistema, "corpo") : null; return a && a.cor ? a.cor : null; } catch (e) { return null; }
  }

  function catTubos() {
    var I = BI(); if (!I) return [];
    return TUBOS.map(function (t) {
      var M = I.MATERIAIS[t.material], S = I.SISTEMAS[t.sistema];
      var o = marcar({ id: "tubo:" + t.id, cat: "tubo", nome: t.nome, familia: CATEGORIAS.tubo, sistema: t.sistema, material: t.material, pn: t.pn || "" }, { id: "hid-tubo-" + t.id }, "");
      if (!M || !S || S.materiais.indexOf(t.material) < 0) { o.indisponivel = t.semMaterial || ("material " + t.material + " não existe no sistema " + t.sistema); o.cor = null; o.icone = null; return o; }
      if (t.pn && arr(M.pns).indexOf(t.pn) < 0) { o.indisponivel = "série PN" + t.pn + " fora das séries do material"; }
      o.cor = corMaterial(t.material, t.sistema);
      o.icone = icone("tubo-" + t.material.replace(/_/g, "-"));
      return o;
    });
  }
  function catConexoes() {
    var P = PEC(); if (!P) return [];
    try { if (P.reiniciar && !_cache.pecReini) { P.reiniciar(); _cache.pecReini = 1; } } catch (e) {}
    var vistos = {}, out = [];
    arr(P.todas()).forEach(function (f) {
      if (f.classe !== "conexao" || !CX_MAT[f.material] || !CX_TIPO[f.tipo]) return;
      var k = f.tipo + "|" + f.material; if (vistos[k]) return; vistos[k] = 1;
      out.push(marcar({ id: "conexao:" + f.tipo + ":" + f.material, cat: "conexao", nome: CX_MAT[f.material][0] + CX_TIPO[f.tipo] + " " + CX_MAT[f.material][1],
                 familia: CATEGORIAS.conexao, tipoConexao: f.tipo, material: f.material, icone: icone(f.icone), cor: corMaterial(f.material, /esgoto|serie_r/.test(f.material) ? "esgoto" : "agua_fria") }, { id: "hid-conexao-" + f.tipo }, ""));
    });
    return out.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  }
  function HB() { return dep("HidBiblioteca", "./biminstbiblioteca.js"); }
  /* FILTRO (18/10/2026): cada tipo carrega a ORIGEM (orcapro/escritorio/minha) e se ENTRA NO CÁLCULO ({ entra, rotulo, motivo }) */
  function marcar(it, f, tipoId) {
    var b = HB();
    if (b) { var s = b.selos(f, tipoId, { dominio: true }); it.origemFam = s.origem.id; it.calculo = s.calculo; }
    else { it.origemFam = "orcapro"; it.calculo = { entra: true, id: "calculo", rotulo: "Cálculo", motivo: "" }; }
    return it;
  }
  function famTipos(f, cat, origem) {
    return arr(f.tipos).map(function (t) {
      return marcar({ id: cat + ":" + f.id + ":" + t.id, cat: cat, nome: prefFam(f.id, cat) + f.nome + " : " + (t.nome || t.id), familia: f.nome, famId: f.id, tipoId: t.id, origem: origem, icone: icone(iconeFam(f.id)) }, f, t.id);
    });
  }
  /* as famílias do escritório (importadas do Revit) na lista da categoria do seletor. Não entram no cache do catálogo (a pessoa importa a
     qualquer hora), mas a lista de cada categoria é guardada com a ASSINATURA das famílias (id, nº de tipos, mapeamento): a biblioteca real
     tem 400 famílias e milhares de tipos, e o catálogo é consultado a cada tecla da pesquisa e a cada recente. */
  var _escCache = {};
  function assinaturaEsc(fontes) {
    return arr(fontes).map(function (f) { return f && f.importada ? f.id + ":" + arr(f.tipos).length + ":" + (f.importada.mapeamento ? f.importada.mapeamento.motor : "") : ""; }).join("|");
  }
  function tiposEscritorio(cat) {
    var b = HB(), out = [], fontes = BimInstTipos.fontesEscritorio ? BimInstTipos.fontesEscritorio() : [];
    if (!b) return out;
    var chave = assinaturaEsc(fontes); if (_escCache[cat] && _escCache[cat].chave === chave) return _escCache[cat].lista;
    arr(fontes).forEach(function (f) {
      if (!f || !f.importada || b.catSeletor(f) !== cat) return;
      arr(f.tipos).forEach(function (t) {
        out.push(marcar({ id: cat + ":" + f.id + ":" + t.id, cat: cat, nome: f.nome + " : " + (t.nome || t.id), familia: f.nome, famId: f.id, tipoId: t.id, origem: "familia",
                          icone: f.miniatura || null }, f, t.id));
      });
    });
    out.sort(function (a, c) { return a.nome < c.nome ? -1 : (a.nome > c.nome ? 1 : 0); });
    _escCache[cat] = { chave: chave, lista: out };
    return out;
  }
  function catAcessorios() {
    var out = [], RA = dep("FamiliasRA", "./familiasra.js");
    ["ra-registro-gaveta", "ra-registro-esfera", "ra-registro-pressao", "ra-valvula-retencao"].forEach(function (id) {
      var f = null; try { f = RA && RA.obter ? RA.obter(id, true) : null; } catch (e) { f = null; }
      var nome = f ? f.nome : id.replace(/^ra-/, "").replace(/-/g, " ");
      out.push(marcar({ id: "acessorio:" + id, cat: "acessorio", nome: "AF_" + nome.charAt(0).toUpperCase() + nome.slice(1) + " (no eixo do tubo)", familia: CATEGORIAS.acessorio, famId: id, tipoId: "", origem: "eixo",
                 icone: icone("ac-" + id.replace(/^ra-/, "")) }, { id: id }, ""));
    });
    var H = HF(); if (H) H.todas().forEach(function (f) { if (f.categoria === "acessorio_tubo") out = out.concat(famTipos(f, "acessorio", "familia")); });
    return out;
  }
  var PECAS_APARELHO = { ralo_sifonado: "pc-ralo-sifonado", ralo_seco: "pc-ralo-seco", caixa_sifonada: "pc-caixa-sifonada" };
  var FAM_APARELHO = { "hid-caixa-sifonada": 1, "hid-ralo": 1 };
  function catAparelhos() {
    var I = BI(), out = [];
    Object.keys(PECAS_APARELHO).forEach(function (k) {
      var P = I && I.PECAS[k]; if (!P) return;
      out.push(marcar({ id: "aparelho:peca:" + k, cat: "aparelho", nome: "ESG_" + P.nome + " (peça do traçado)", familia: CATEGORIAS.aparelho, peca: k, sistema: "esgoto", origem: "peca", icone: icone(PECAS_APARELHO[k]) }, { id: "hid-peca-" + k }, ""));
    });
    var H = HF(); if (H) H.todas().forEach(function (f) { if (f.categoria === "loucas" || f.categoria === "mobiliario" || FAM_APARELHO[f.id]) out = out.concat(famTipos(f, "aparelho", "familia")); });
    return out;
  }
  function catEquipamentos() {
    var out = [], H = HF(), C = CF();
    if (H) H.todas().forEach(function (f) { if (f.categoria === "equipamento" && !FAM_APARELHO[f.id]) out = out.concat(famTipos(f, "equipamento", "familia")); });
    if (C && C.todas) C.todas().forEach(function (f) { out = out.concat(famTipos(f, "equipamento", "familia")); });
    return out;
  }

  /* ------------------------------------------------------------- ATALHOS
   * Duas letras digitadas em sequência com a vista focada (costume de mercado). Conferidos contra os de duas letras
   * do editor (js/bimprecisao.js ATALHOS e ATALHOS_CMD) e as teclas de uma letra (js/bimmouse.js TECLAS):
   *   CS da proposta = "Criar similar" no editor → Caixa sifonada vira CX;
   *   SL da proposta = "Dividir" no editor → Inclinação vira IC;
   *   RE da proposta = "Escala" no editor → Rótulo vira TG (identificar, o costume de mercado). */
  var ATALHOS_PADRAO = { PI: "tubo", PF: "conexao", PA: "acessorio", PX: "aparelho", ME: "equipamento", CX: "caixa-sifonada",
                         DE: "deslocamento", IC: "inclinacao", VV: "visibilidade", TL: "linha-fina", TG: "rotulo" };
  var ACOES = {
    tubo: "Tubo", conexao: "Conexão (lista e tipo)", acessorio: "Acessório de tubo", aparelho: "Aparelho sanitário",
    equipamento: "Equipamento", "caixa-sifonada": "Caixa sifonada", deslocamento: "Deslocamento (foca o campo da altura)",
    inclinacao: "Inclinação (foca o campo)", visibilidade: "Visibilidade/Gráficos", "linha-fina": "Linha fina (liga/desliga)", rotulo: "Rótulo (identificar por categoria)"
  };
  /* o comando da fita de cada ação (para o tooltip mostrar o atalho) */
  var FITA = { tubo: "tubo", conexao: "conexao", acessorio: "acessorio-tubo", aparelho: "aparelho", visibilidade: "vg-vista", rotulo: "identificar-categoria" };
  var NIVEL = [["Alt+1", "Nível de detalhe Baixo"], ["Alt+2", "Nível de detalhe Médio"], ["Alt+3", "Nível de detalhe Alto"]];

  function usuario() {
    try { var A = global.Auth && global.Auth._usuario; if (A) return txt(A.uid || A.id || A.email || "local"); } catch (e) {}
    return "local";
  }
  function ler(chave) { try { var s = global.localStorage ? global.localStorage.getItem(chave) : null; return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function gravar(chave, v) { try { if (global.localStorage) global.localStorage.setItem(chave, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var BimInstTipos = {
    CATEGORIAS: CATEGORIAS, ORDEM_CAT: ORDEM_CAT, TUBOS: TUBOS, ATALHOS_PADRAO: ATALHOS_PADRAO, ACOES: ACOES, FITA: FITA, NIVEL: NIVEL, MAX_RECENTES: MAX_RECENTES,

    /* ============================================================ CATÁLOGO */
    registrarCategoria: function (cat, def) { if (!cat || !def || typeof def.catalogo !== "function") return false; PROV[cat] = def; CATEGORIAS[cat] = def.rotulo || cat; return true; },
    categoriaExterna: function (cat) { return !!PROV[cat]; },
    catalogo: function (cat) {
      if (PROV[cat]) return PROV[cat].catalogo();
      var L = _cache[cat];
      if (!L) {
        L = cat === "tubo" ? catTubos() : cat === "conexao" ? catConexoes() : cat === "acessorio" ? catAcessorios() : cat === "aparelho" ? catAparelhos() : cat === "equipamento" ? catEquipamentos() : [];
        if (L.length) _cache[cat] = L;
      }
      /* FILTRO: as famílias do escritório entram por cima do catálogo do produto (sem cache: a importação pode ser a qualquer hora) */
      var E = cat === "tubo" ? [] : tiposEscritorio(cat);
      return E.length ? L.concat(E) : L;
    },
    /* de onde vêm as famílias importadas: a biblioteca da tela (FamiliaUI); os testes trocam esta função */
    fontesEscritorio: function () {
      /* FamiliaUI.biblioteca() monta a biblioteca inteira (cópia profunda): guarda por 2 s; abrir a lista pede de novo (_fonteT = 0) */
      var agora = Date.now(); if (_fonte && agora - _fonteT < 2000) return _fonte;
      var l = []; try { l = global.FamiliaUI && global.FamiliaUI.biblioteca ? global.FamiliaUI.biblioteca().filter(function (f) { return f && f.importada; }) : []; } catch (e) { l = []; }
      _fonte = l; _fonteT = agora; return l;
    },
    esquecerFonte: function () { _fonte = null; _fonteT = 0; Object.keys(PROV).forEach(function (k) { try { if (PROV[k].esquecer) PROV[k].esquecer(); } catch (e) {} }); },
    limparCache: function () { _cache = {}; _escCache = {}; _fonte = null; _fonteT = 0; },
    tipo: function (id) {
      var cat = txt(id).split(":")[0];
      return this.catalogo(cat).filter(function (t) { return t.id === id; })[0] || null;
    },
    /* `filtro` { origem, soCalculo } (js/biminstbiblioteca.js): a pesquisa respeita o filtro; sem ele, a lista inteira */
    pesquisar: function (cat, q, filtro) {
      var n = norm(q).trim(), L = this.catalogo(cat), b = HB();
      if (filtro && b) L = b.aplicarFiltro(L, filtro);
      if (!n) return L.slice();
      var pal = n.split(/\s+/);
      return L.filter(function (t) { var s = norm(t.nome + " " + (t.familia || "") + " " + (t.material || "") + " " + (t.grupo || "")); return pal.every(function (p) { return s.indexOf(p) >= 0; }); });
    },
    /* o filtro que a lista abre: o gravado POR USUÁRIO; projeto com memorial de cálculo abre em "Só as que entram no cálculo" */
    filtroAtual: function () { var b = HB(); if (!b) return { origem: "todas", soCalculo: false }; return b.lerFiltro(null, b.memorialDoProjeto()); },
    definirFiltro: function (parcial) { var b = HB(); if (!b) return { origem: "todas", soCalculo: false }; return b.gravarFiltro(null, parcial, b.memorialDoProjeto()); },
    /* o tipo de um trecho (sistema + material + série); sem par exato, o do material no prefixo do sistema; null = nenhum */
    tipoDoTrecho: function (t) {
      if (!t) return null;
      var L = this.catalogo("tubo").filter(function (x) { return !x.indisponivel; });
      var e = L.filter(function (x) { return x.sistema === t.sistema && x.material === t.material && (!x.pn || x.pn === txt(t.pn)); })[0];
      return e || L.filter(function (x) { return x.sistema === t.sistema && x.material === t.material; })[0] || L.filter(function (x) { return x.material === t.material; })[0] || null;
    },
    /* a troca de TIPO de um tubo: material, série (PN) e, se o material não vale no sistema do tubo, o sistema do tipo.
       DN fora da tabela do material → o comercial mais próximo acima (nunca abaixo). As CONEXÕES são deduzidas dos trechos:
       acompanham sozinhas. Devolve { ok, op, avisos } (op = instAlterar). */
    opTrocarTubo: function (trecho, tipo) {
      var I = BI(); if (!I || !trecho || !tipo) return { ok: false, erro: "sem tubo ou sem tipo" };
      if (tipo.indisponivel) return { ok: false, erro: tipo.nome + ": " + tipo.indisponivel };
      var M = I.MATERIAIS[tipo.material], S = I.SISTEMAS[trecho.sistema], avisos = [];
      var o = { op: "instAlterar", id: trecho.id, material: tipo.material };
      if (tipo.pn) o.pn = tipo.pn; else if (M.pn) o.pn = M.pn;
      if (!S || S.materiais.indexOf(tipo.material) < 0) { o.sistema = tipo.sistema; avisos.push("o sistema passa de " + (S ? S.nome : trecho.sistema) + " para " + I.SISTEMAS[tipo.sistema].nome); }
      var dns = arr(M.dns);
      if (dns.length && dns.indexOf(Number(trecho.dn)) < 0) {
        var acima = dns.filter(function (d) { return d >= Number(trecho.dn); }).sort(function (a, b) { return a - b; })[0];
        o.dn = acima != null ? acima : dns[dns.length - 1];
        avisos.push("DN " + trecho.dn + " não existe em " + M.nome + ": vai para DN " + o.dn);
      }
      return { ok: true, op: o, avisos: avisos };
    },

    /* ============================================================ RECENTES (por usuário) */
    chaveRecentes: function () { return "orcapro:bim:tipos-recentes:" + usuario(); },
    recentes: function (cat) {
      var r = obj(ler(this.chaveRecentes())), self = this;
      return arr(r[cat]).map(function (id) { return self.tipo(id); }).filter(Boolean);
    },
    usar: function (tipo) {
      if (!tipo || !tipo.id) return false;
      var r = obj(ler(this.chaveRecentes())), L = arr(r[tipo.cat]).filter(function (x) { return x !== tipo.id; });
      L.unshift(tipo.id); r[tipo.cat] = L.slice(0, MAX_RECENTES);
      return gravar(this.chaveRecentes(), r);
    },

    /* ============================================================ ATALHOS (puro) */
    chaveAtalhos: function () { return "orcapro:bim:atalhos-inst:" + usuario(); },
    /* os OUTROS atalhos de duas letras do BIM (os do editor), que os nossos não podem repetir */
    ocupados: function () {
      var Pr = dep("BimPrecisao", "./bimprecisao.js"), o = {};
      if (Pr) { Object.keys(obj(Pr.ATALHOS)).forEach(function (k) { o[k] = "editor: " + Pr.ATALHOS[k]; }); Object.keys(obj(Pr.ATALHOS_CMD)).forEach(function (k) { o[k] = "editor: " + Pr.ATALHOS_CMD[k]; }); }
      return o;
    },
    /* mapa { DUAS_LETRAS: ação } → { ok, erros: [] } — formato, ação conhecida, sem repetir ação nem letra, sem colidir com o editor */
    validarAtalhos: function (mapa) {
      var erros = [], oc = this.ocupados(), porAcao = {};
      Object.keys(obj(mapa)).forEach(function (k) {
        var a = mapa[k];
        if (!/^[A-Z]{2}$/.test(k)) erros.push(k + ": use duas letras (A a Z)");
        if (!ACOES[a]) erros.push(k + ": ação desconhecida (" + a + ")");
        if (oc[k]) erros.push(k + " já é atalho do " + oc[k]);
        if (porAcao[a]) erros.push(ACOES[a] + " está em " + porAcao[a] + " e em " + k); else porAcao[a] = k;
      });
      Object.keys(ACOES).forEach(function (a) { if (!porAcao[a]) erros.push(ACOES[a] + " ficou sem atalho"); });
      return { ok: !erros.length, erros: erros };
    },
    atalhos: function () {
      var u = ler(this.chaveAtalhos());
      if (u && this.validarAtalhos(u).ok) return u;
      var o = {}; Object.keys(ATALHOS_PADRAO).forEach(function (k) { o[k] = ATALHOS_PADRAO[k]; }); return o;
    },
    salvarAtalhos: function (mapa) { var v = this.validarAtalhos(mapa); if (!v.ok) return v; gravar(this.chaveAtalhos(), mapa); return v; },
    restaurarAtalhos: function () { try { if (global.localStorage) global.localStorage.removeItem(this.chaveAtalhos()); } catch (e) {} return this.atalhos(); },
    atalhoDe: function (acao) { var m = this.atalhos(); return Object.keys(m).filter(function (k) { return m[k] === acao; })[0] || null; },
    /* a 1ª letra de algum atalho de duas letras (nossos ou do editor): a tecla de uma letra do js/bimmouse.js espera a 2ª */
    prefixo: function (tecla) {
      var k = txt(tecla).toUpperCase(); if (!/^[A-Z]$/.test(k)) return false;
      var todos = Object.keys(this.atalhos()).concat(Object.keys(this.ocupados()));
      return todos.some(function (a) { return a.charAt(0) === k; });
    },
    /* quanto a tecla de uma letra que é prefixo espera a segunda (ms) — a de duas letras precisa caber aqui */
    ESPERA_MS: 450,
    /* duas letras são atalho (nosso ou do editor)? */
    ehAtalho: function (duas) { var k = txt(duas).toUpperCase(); return k.length === 2 && !!(this.atalhos()[k] || this.ocupados()[k]); },
    /* buffer (as letras anteriores dentro do tempo) + tecla → { buffer, acao } */
    resolverTecla: function (buffer, tecla) {
      var k = txt(tecla).toUpperCase(); if (!/^[A-Z]$/.test(k)) return { buffer: "", acao: null };
      var b = (txt(buffer) + k).slice(-2), m = this.atalhos();
      if (b.length === 2 && m[b]) return { buffer: "", acao: m[b], atalho: b };
      return { buffer: b, acao: null };
    },
    /* a lista da tela Atalhos (seção de instalações) */
    secaoAtalhos: function () {
      var m = this.atalhos();
      return { id: "inst", titulo: "Instalações (duas letras em sequência, com a vista focada)", cab: ["Atalho", "Comando"],
               linhas: Object.keys(m).sort().map(function (k) { return [k, ACOES[m[k]]]; }).concat(NIVEL.map(function (n) { return [n[0], n[1]]; })),
               nota: "Editáveis em \"Editar atalhos de instalações\" (guardados por usuário). Os do editor (MV, CO, CS…) não se repetem aqui." };
    }
  };

  /* =====================================================================
   * TELA
   * ===================================================================== */
  var CSS = ".rv-tsel{display:flex;gap:8px;align-items:center;padding:6px 8px;border-bottom:1px solid var(--rv-linha,#3a4150);cursor:pointer;user-select:none}" +
    ".rv-tsel:hover,.rv-tsel:focus{background:var(--rv-hover,rgba(127,127,127,.12));outline:none}" +
    ".rv-tsel-mini{width:64px;height:52px;flex:none;background:#fff;border:1px solid var(--rv-linha,#3a4150);border-radius:3px;display:flex;align-items:center;justify-content:center;overflow:hidden}" +
    ".rv-tsel-mini img{width:100%;height:100%;object-fit:contain}" +
    ".rv-tsel-tx{flex:1;min-width:0;font-size:12px;line-height:1.35;color:var(--rv-painel-tx,inherit)}.rv-tsel-tx b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".rv-tsel-seta{flex:none;font-size:10px;opacity:.7}" +
    ".rv-tlist{position:fixed;z-index:9000;background:var(--rv-painel-bg,#2b303b);color:var(--rv-painel-tx,#e6e8ec);border:1px solid var(--rv-linha-forte,#566);box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;font-size:12px}" +
    ".rv-tlist-busca{display:flex;align-items:center;gap:6px;padding:5px 7px;border-bottom:1px solid var(--rv-linha,#3a4150)}.rv-tlist-busca input{flex:1;min-width:0;background:transparent;border:0;color:inherit;font-size:12px;outline:none}" +
    ".rv-tlist-abas{display:flex;flex-wrap:wrap;gap:3px;padding:4px 7px;border-bottom:1px solid var(--rv-linha,#3a4150)}.rv-tlist-abas button{background:transparent;color:inherit;border:1px solid var(--rv-linha,#3a4150);border-radius:10px;padding:1px 8px;font-size:11px;cursor:pointer}.rv-tlist-abas button.ativa{background:var(--rv-ativo-borda,#4a90d9);border-color:var(--rv-ativo-borda,#4a90d9);color:#fff}" +
    ".rv-tlist-fil{padding:2px 7px;border-bottom:1px solid var(--rv-linha,#3a4150)}.rv-tlist-fil .fil-barra{margin:3px 0}" +
    ".rv-tlist-itens{overflow:auto;flex:1;min-height:80px}" +
    ".rv-tlist-it{display:flex;align-items:center;gap:8px;padding:3px 7px;cursor:pointer;border:1px solid transparent}.rv-tlist-it:hover,.rv-tlist-it.foco{background:var(--rv-hover,rgba(127,127,127,.14))}" +
    ".rv-tlist-it.atual{border-color:var(--rv-ativo-borda,#4a90d9);font-weight:600}.rv-tlist-it[aria-disabled=true]{opacity:.45;cursor:not-allowed}" +
    ".rv-tlist-it img,.rv-tlist-it .sem{width:34px;height:28px;object-fit:contain;background:#fff;border-radius:2px;flex:none}" +
    ".rv-tlist-grupo{position:sticky;top:0;padding:3px 7px;font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;opacity:.75;background:var(--rv-painel-bg,#2b303b);border-bottom:1px solid var(--rv-linha,#3a4150)}" +
    ".rv-tlist-rec{border-top:1px solid var(--rv-linha-forte,#566);padding:4px 0;max-height:190px;overflow:auto}.rv-tlist-rec h4{margin:2px 7px 3px;font-size:12px}" +
    ".rv-tlist-rec div{padding:3px 7px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rv-tlist-rec div:hover{background:var(--rv-hover,rgba(127,127,127,.14))}" +
    "body.bim-linha-fina .d2-vista-tela svg [stroke]{stroke-width:.6px!important}";
  function estilo(doc) {
    if (!doc || doc.getElementById("rv-tsel-css")) return;
    var s = doc.createElement("style"); s.id = "rv-tsel-css"; s.textContent = CSS + (HB() ? HB().cssFiltro() : ""); (doc.head || doc.documentElement).appendChild(s);
  }
  function UIi() { return global.BimInstUI || null; }
  function B() { return global.BIM || null; }
  function estadoInst() { try { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e && e.estado ? e.estado : null; } catch (e) { return null; } }

  /* o CONTEXTO de Propriedades: a categoria, o tipo atual e o alvo (o que a troca muda) */
  BimInstTipos.contexto = function (esquema) {
    if (esquema && esquema.arqCat && PROV[esquema.arqCat]) return PROV[esquema.arqCat].contexto ? PROV[esquema.arqCat].contexto(esquema) : null;   /* Porta, Janela, Componente */
    var U = UIi(), I = BI(); if (!U || !I) return null;
    var uid = esquema && esquema.uid, st = estadoInst(), ins = st && st.instalacoes;
    if (uid && /^edit:/.test(String(uid)) && ins) {
      var id = String(uid).replace(/^edit:/, "");
      var t = arr(ins.trechos).filter(function (x) { return x.id === id; })[0];
      if (t) { var M = I.MATERIAIS[t.material]; if (M && M.secao === "retangular") return null; return { cat: "tubo", atual: this.tipoDoTrecho(t), alvo: { trecho: t } }; }
      var k = arr(ins.pecas).filter(function (x) { return x.id === id; })[0];
      if (k && PECAS_APARELHO[k.peca]) return { cat: "aparelho", atual: this.tipo("aparelho:peca:" + k.peca), alvo: { peca: k } };
      var ac = arr(ins.acessorios).filter(function (x) { return x.id === id; })[0];
      if (ac) return { cat: "acessorio", atual: this.tipo("acessorio:" + ac.famId) || null, alvo: { acessorio: ac } };
      var R = U._ultimaRede, c = R ? arr(R.conexoes).filter(function (x) { return x.id === id; })[0] : null;
      if (c) return { cat: "conexao", atual: this.tipo("conexao:" + c.tipo + ":" + (c.material || "")) || null, alvo: { conexao: c } };
      return null;
    }
    var c0 = U.cfg; if (!c0 || (esquema && esquema.uid)) return null;
    if (c0.ferramenta === "tubo") return { cat: "tubo", atual: this.tipoDoTrecho({ sistema: c0.sistema, material: c0.material, pn: c0.pn }), alvo: { ferramenta: c0 } };
    if (c0.ferramenta === "peca" && c0.sistema !== "eletrica") return { cat: "aparelho", atual: this.tipo("aparelho:peca:" + c0.peca), alvo: { ferramenta: c0 } };
    if (c0.ferramenta === "acessorio") return { cat: "acessorio", atual: this.tipo("acessorio:" + c0.famId), alvo: { ferramenta: c0 } };
    return null;
  };

  /* depois do BimShell.pintarProps: põe o SELETOR no lugar da linha de tipo */
  BimInstTipos.decorar = function (raiz, esquema) {
    if (!raiz || !raiz.querySelector) return false;
    var ctx = this.contexto(esquema); if (!ctx) return false;
    var corpo = raiz.querySelector(".rv-props .rv-doca-corpo"); if (!corpo) return false;
    var doc = corpo.ownerDocument; estilo(doc);
    var el = doc.createElement("div"), at = ctx.atual, self = this;
    el.className = "rv-tsel"; el.tabIndex = 0; el.setAttribute("role", "button"); el.setAttribute("data-rv-tsel", ctx.cat);
    el.setAttribute("aria-label", "Seletor de tipo: " + CATEGORIAS[ctx.cat] + (at ? ", " + at.nome : ""));
    el.title = "Trocar o tipo (" + CATEGORIAS[ctx.cat] + ")";
    el.innerHTML = '<div class="rv-tsel-mini">' + (at && at.icone ? '<img alt="" src="' + esc(at.icone) + '">' : "") + "</div>" +
      '<div class="rv-tsel-tx">' + esc(CATEGORIAS[ctx.cat]) + "<b>" + esc(at ? at.nome : "(tipo sem correspondência no catálogo)") + "</b></div><span class=\"rv-tsel-seta\">▲</span>";
    el.onclick = function () { self.abrirLista(el, ctx); };
    el.onkeydown = function (ev) { if (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowDown") { ev.preventDefault(); self.abrirLista(el, ctx); } };
    /* idempotente: decorar duas vezes (pintarProps + render da paleta) troca o seletor, nunca empilha dois */
    var velho = corpo.querySelector(".rv-tsel") || corpo.querySelector(".rv-tipo");
    if (velho && velho.parentNode) velho.parentNode.replaceChild(el, velho); else corpo.insertBefore(el, corpo.firstChild);
    this._ctx = ctx;
    return true;
  };

  BimInstTipos.fecharLista = function () { var m = this._lista; this._lista = null; if (m && m.parentNode) m.parentNode.removeChild(m); if (this._fora) { try { document.removeEventListener("mousedown", this._fora, true); } catch (e) {} this._fora = null; } };
  BimInstTipos.abrirLista = function (ancora, ctx) {
    this.fecharLista(); this.esquecerFonte();   /* a lista que abre vê a importação que acabou de acontecer */
    ctx = ctx || this._ctx || { cat: "tubo" };
    var doc = (ancora && ancora.ownerDocument) || document, self = this; estilo(doc);
    var r = ancora && ancora.getBoundingClientRect ? ancora.getBoundingClientRect() : { left: 60, bottom: 120, width: 320 };
    var m = doc.createElement("div"); m.className = "rv-tlist"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", CATEGORIAS[ctx.cat]);
    var larg = Math.max(300, r.width || 300), alt = Math.min(560, (doc.documentElement.clientHeight || 800) - r.bottom - 12);
    m.style.left = Math.round(r.left) + "px"; m.style.top = Math.round(r.bottom) + "px"; m.style.width = larg + "px"; m.style.height = Math.max(260, alt) + "px";
    /* FILTRO (18/10/2026): Todas | OrçaPRO | Escritório + "Só as que entram no cálculo" (a escolha fica gravada por usuário) */
    /* ABAS por grupo (Pintar, 27/10/2026): a categoria externa que declara `abas` ganha uma fileira de grupos; "Todos" não filtra */
    var abasDef = PROV[ctx.cat] && arr(PROV[ctx.cat].abas).length ? PROV[ctx.cat].abas : null, aba = "todos";
    var hb = ctx.cat === "tubo" || PROV[ctx.cat] ? null : HB(), memorial = hb ? hb.memorialDoProjeto() : false, filtro = hb ? self.filtroAtual() : null;
    m.innerHTML = '<div class="rv-tlist-busca"><span aria-hidden="true">⌕</span><input type="search" placeholder="Pesquisar" aria-label="Pesquisar tipo"></div>' + (hb ? '<div class="rv-tlist-fil"></div>' : "") + (abasDef ? '<div class="rv-tlist-abas" role="tablist"></div>' : "") +
      '<div class="rv-tlist-itens" role="listbox"></div><div class="rv-tlist-rec"></div>';
    var inp = m.querySelector("input"), lista = m.querySelector(".rv-tlist-itens"), rec = m.querySelector(".rv-tlist-rec"), barra = m.querySelector(".rv-tlist-fil"), foco = -1, vis = [];
    var MAX_POR_ORIGEM = 300;   /* a biblioteca real do escritório tem milhares de tipos: a lista mostra os primeiros de CADA origem ou subgrupo (Componente) (as do escritório não somem atrás das nativas) e pede para refinar */
    function pintarBarra() { if (barra && hb) barra.innerHTML = hb.htmlControles(filtro, hb.contagens(self.catalogo(ctx.cat), filtro), memorial); }
    function pintar() {
      vis = self.pesquisar(ctx.cat, inp.value, filtro);
      if (abasDef && aba !== "todos") vis = vis.filter(function (t) { return t.grupoId === aba; });
      var porO = {}, corte = vis.filter(function (t) { var o = t.grupo || t.origemFam || "x"; porO[o] = (porO[o] || 0) + 1; return porO[o] <= MAX_POR_ORIGEM; });
      var grupoAnt = null;
      lista.innerHTML = corte.map(function (t, i) {
        var gh = t.grupo ? t.grupo + (t.sub ? " · " + t.sub : "") : null, cab = ""; if (gh && gh !== grupoAnt) cab = '<div class="rv-tlist-grupo" role="presentation">' + esc(gh) + "</div>"; grupoAnt = gh;
        return cab + '<div class="rv-tlist-it' + (ctx.atual && ctx.atual.id === t.id ? " atual" : "") + (i === foco ? " foco" : "") + '" role="option" data-tid="' + esc(t.id) + '"' +
          (t.indisponivel ? ' aria-disabled="true" title="' + esc(t.indisponivel) + '"' : "") + ">" +
          (t.icone ? '<img alt="" loading="lazy" src="' + esc(t.icone) + '"' + (t.miniatura ? ' data-mini="' + esc(t.id) + '"' : "") + ">" : '<span class="sem"></span>') + "<span>" + esc(t.nome) + "</span>" + (hb ? hb.htmlSelos(t) : "") + "</div>";
      }).join("") + (vis.length > corte.length ? '<div style="padding:8px;opacity:.7">Mostrando ' + corte.length + " de " + vis.length + ": refine a pesquisa ou escolha a origem.</div>" : "") ||
        '<div style="padding:8px;opacity:.7">Nenhum tipo' + (inp.value ? ' com "' + esc(inp.value) + '"' : "") + (filtro && (filtro.soCalculo || filtro.origem !== "todas") ? " neste filtro" : "") + ".</div>";
      vis = corte;
      miniaturas();
    }
    /* miniatura desenhada da própria peça (mobiliário): aos poucos, 4 por vez, só as da lista que está na tela */
    var _mt = null;
    function miniaturas() {
      if (_mt) { clearTimeout(_mt); _mt = null; }
      var pend = vis.filter(function (t) { return t.miniatura && !t._miniFeita; });
      (function passo() {
        if (!self._lista) return;
        pend.splice(0, 4).forEach(function (t) {
          t._miniFeita = true;
          try { var src = t.miniatura(); if (src) { var im = lista.querySelector('img[data-mini="' + t.id.replace(/"/g, "") + '"]'); if (im) im.src = src; } } catch (e) {}
        });
        if (pend.length) _mt = setTimeout(passo, 16);
      })();
    }
    if (barra) {
      barra.addEventListener("click", function (ev) {
        var c = ev.target.closest ? ev.target.closest("[data-fil-origem]") : null; if (!c) return;
        filtro = self.definirFiltro({ origem: c.getAttribute("data-fil-origem") }); foco = -1; pintarBarra(); pintar();
      });
      barra.addEventListener("change", function (ev) {
        if (!ev.target || !ev.target.hasAttribute || !ev.target.hasAttribute("data-fil-calc")) return;
        filtro = self.definirFiltro({ soCalculo: !!ev.target.checked }); foco = -1; pintarBarra(); pintar();
      });
      pintarBarra();
    }
    var barraAbas = m.querySelector(".rv-tlist-abas");
    function pintarAbas() {
      if (!barraAbas) return;
      barraAbas.innerHTML = [{ id: "todos", rotulo: "Todos" }].concat(abasDef).map(function (a) { return '<button type="button" role="tab" data-aba="' + esc(a.id) + '"' + (a.id === aba ? ' class="ativa" aria-selected="true"' : "") + ">" + esc(a.rotulo) + "</button>"; }).join("");
    }
    if (barraAbas) {
      barraAbas.addEventListener("click", function (ev) { var b = ev.target.closest ? ev.target.closest("[data-aba]") : null; if (!b) return; aba = b.getAttribute("data-aba"); foco = -1; pintarAbas(); pintar(); });
      pintarAbas();
    }
    var recs = this.recentes(ctx.cat);
    rec.innerHTML = "<h4>Tipos mais recentemente utilizados</h4>" + (recs.length ? recs.map(function (t) { return '<div data-tid="' + esc(t.id) + '">' + esc(CATEGORIAS[ctx.cat]) + " : " + esc(t.nome) + "</div>"; }).join("") : '<div style="opacity:.6;cursor:default">(nenhum ainda)</div>');
    function escolher(id) { var t = self.tipo(id); if (!t) return; if (t.indisponivel) { status(t.nome + ": " + t.indisponivel); toast(t.indisponivel, "aviso"); return; } self.fecharLista(); self.aplicar(t, ctx); }
    m.addEventListener("click", function (ev) { var it = ev.target.closest ? ev.target.closest("[data-tid]") : null; if (it) escolher(it.getAttribute("data-tid")); });
    inp.addEventListener("input", function () { foco = -1; pintar(); });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { ev.preventDefault(); self.fecharLista(); try { ancora.focus(); } catch (e) {} return; }
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); foco = Math.max(0, Math.min(vis.length - 1, foco + (ev.key === "ArrowDown" ? 1 : -1))); pintar(); var f = lista.querySelector(".foco"); if (f && f.scrollIntoView) f.scrollIntoView({ block: "nearest" }); return; }
      if (ev.key === "Enter") { ev.preventDefault(); var t = vis[foco >= 0 ? foco : 0]; if (t) escolher(t.id); }
    });
    pintar();
    doc.body.appendChild(m); this._lista = m;
    this._fora = function (ev) { if (self._lista && !self._lista.contains(ev.target) && !(ancora && ancora.contains && ancora.contains(ev.target))) self.fecharLista(); };
    doc.addEventListener("mousedown", this._fora, true);
    try { inp.focus(); } catch (e) {}
    var at = lista.querySelector(".atual"); if (at && at.scrollIntoView) at.scrollIntoView({ block: "nearest" });
    return m;
  };

  /* APLICAR o tipo escolhido: no elemento selecionado (troca) ou na ferramenta (o próximo traço); sem nenhum dos dois, arma a ferramenta */
  BimInstTipos.aplicar = function (t, ctx) {
    if (t && PROV[t.cat]) { this.usar(t); return !!PROV[t.cat].aplicar(t, ctx || {}); }   /* Porta, Janela, Componente */
    var U = UIi(), I = BI(), b = B(); if (!t || !U || !I) return false;
    ctx = ctx || {}; var al = ctx.alvo || {};
    this.usar(t);
    if (t.cat === "tubo") {
      if (al.trecho) {
        /* GANCHO: a API de troca da frente de interação, quando existir (BimInst.trocarTipo), vence a op direta */
        if (I.trocarTipo) { try { var rT = I.trocarTipo(estadoInst(), b && b.familiaAvaliar, [al.trecho.id], { material: t.material, pn: t.pn, sistema: t.sistema }); if (rT && rT.ok && b.instOp) { rT.ops.forEach(function (o) { b.instOp(o); }); this._depois(t); return true; } } catch (eT) {} }
        var r = this.opTrocarTubo(al.trecho, t); if (!r.ok) { toast(r.erro, "aviso"); return false; }
        if (b && b.instOp) b.instOp(r.op);
        status("Tipo: " + t.nome + (r.avisos.length ? " — " + r.avisos.join("; ") : "") + ". As conexões seguem o material do tubo.");
        this._depois(t); return true;
      }
      if (!U.cfg || U.cfg.ferramenta !== "tubo") U.armar("tubo", { sistema: t.sistema });
      /* na FERRAMENTA o prefixo do tipo diz o sistema do próximo traço (AQ_ = água quente); no tubo já desenhado, o sistema
         só muda quando o material não vale nele (opTrocarTubo) */
      if (U.cfg.sistema !== t.sistema) U.mudarCfg("i:sistema", t.sistema);
      U.mudarCfg("i:material", t.material); if (t.pn) U.mudarCfg("i:pn", t.pn);
      U.pintarProps(); status("Tubo: " + t.nome + " — clique o início e os pontos seguintes."); return true;
    }
    if (t.cat === "conexao" && t.famId && t.origem === "familia") { U.colocarFamilia(t.famId, t.tipoId); return true; }   /* conexão do escritório (família importada): coloca como peça */
    if (t.cat === "conexao") {
      var cx = al.conexao, tr = cx ? arr(cx.ramos || cx.trechos) : [];
      if (cx && tr.length && b && b.instOp) {
        tr.forEach(function (tid) { var st = estadoInst(), tt = arr(st && st.instalacoes && st.instalacoes.trechos).filter(function (x) { return x.id === tid; })[0]; if (!tt) return; var S2 = I.SISTEMAS[tt.sistema]; if (S2 && S2.materiais.indexOf(t.material) >= 0) b.instOp({ op: "instAlterar", id: tid, material: t.material }); });
        status("Conexão: " + t.nome + " — os tubos dela passam para o mesmo material (a conexão segue o tubo)."); this._depois(t); return true;
      }
      status("As conexões saem sozinhas pela geometria e seguem o MATERIAL do tubo: escolha o tipo do tubo (" + (this.atalhoDe("tubo") || "PI") + ")."); return false;
    }
    if (t.origem === "peca") {
      if (al.peca && b && b.instOp) { b.instOp({ op: "instAlterar", id: al.peca.id, peca: t.peca }); this._depois(t); return true; }
      U.armar("peca", { sistema: t.sistema, peca: t.peca }); return true;
    }
    if (t.origem === "eixo") { U.armar("acessorio", { famId: t.famId, tipoId: "" }); return true; }
    if (t.famId) { U.colocarFamilia(t.famId, t.tipoId); return true; }
    return false;
  };
  BimInstTipos._depois = function (t) { var self = this; try { var U = UIi(); setTimeout(function () { try { if (global.BimShell && U && U.props && self._ctx && self._ctx.alvo) { var id = (self._ctx.alvo.trecho || self._ctx.alvo.peca || {}).id; if (id) global.BimShell.pintarProps(U.props("edit:" + id)); } } catch (e) {} }, 60); } catch (e) {} };

  /* ------------------------------------------------------------- ATALHOS (tela) */
  BimInstTipos.executar = function (acao) {
    var U = UIi(), S = global.BimShell, self = this;
    if (!U || !U.ativo || !U.ativo()) return false;
    if (acao === "tubo") return U.armar("tubo");
    if (acao === "conexao") { U.comando("conexao", null, U._G); return true; }
    if (acao === "acessorio") return U.armar("acessorio", { famId: (U._p12 && U._p12.acFam) || "ra-registro-gaveta", tipoId: "" });
    if (acao === "aparelho") return U.comando("aparelho", null, U._G);
    if (acao === "caixa-sifonada") return U.armar("peca", { sistema: "esgoto", peca: "caixa_sifonada" });
    if (acao === "equipamento") {
      var anc = document.querySelector(".rv-props .rv-doca-corpo") || document.body;
      this.abrirLista(anc, { cat: "equipamento", atual: null, alvo: {} }); return true;
    }
    if (acao === "deslocamento" || acao === "inclinacao") {
      var campo = document.querySelector('.rv-props [data-rv-p="i:' + (acao === "deslocamento" ? "cota" : "inclinacao") + '"]');
      if (campo) { campo.focus(); try { campo.select(); } catch (e) {} return true; }
      status((acao === "deslocamento" ? "Deslocamento" : "Inclinação") + ": arme o Tubo (" + (self.atalhoDe("tubo") || "PI") + ") — o campo fica em Propriedades."); return false;
    }
    if (acao === "visibilidade") { if (S && S.executar) { try { if (document.querySelector(".bim-tela[data-ativa=\"1\"] .d2-vista-tela")) return S.executar("vg-vista") !== false; } catch (e) {} return S.executar("visibilidade") !== false; } return false; }
    if (acao === "linha-fina") { var on = document.body.classList.toggle("bim-linha-fina"); estilo(document); status(on ? "Linha fina: todas as penas na espessura mínima." : "Linha fina desligada: penas da vista."); return true; }
    if (acao === "rotulo") return !!(S && S.executar && S.executar("identificar-categoria") !== false);
    return false;
  };
  BimInstTipos.instalar = function (doc) {
    doc = doc || (typeof document !== "undefined" ? document : null); if (!doc || this._instalado) return false;
    this._instalado = true; var self = this, buf = "", t0 = 0;
    doc.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      var t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
      if (doc.getElementById("modal-bg")) return;
      var U = UIi(); if (!U || !U.ativo || !U.ativo() || !doc.querySelector(".bim-revit")) return;
      var agora = Date.now(); if (agora - t0 > 1200) buf = ""; t0 = agora;
      var r = self.resolverTecla(buf, e.key); buf = r.buffer;
      if (r.acao) { e.preventDefault(); e.stopPropagation(); self.cancelarTeclaUnica(); self.executar(r.acao); }
    }, true);
    return true;
  };
  /* a tecla de uma letra do js/bimmouse.js que é PREFIXO de atalho espera a 2ª (este cancela a espera) */
  BimInstTipos.cancelarTeclaUnica = function () { try { if (global.__bimTeclaUnica) { clearTimeout(global.__bimTeclaUnica); global.__bimTeclaUnica = null; } } catch (e) {} };
  /* o tooltip da fita mostra o atalho */
  BimInstTipos.marcarFita = function (raiz) {
    if (!raiz || !raiz.querySelectorAll) return 0; var n = 0, self = this;
    Object.keys(FITA).forEach(function (a) {
      var k = self.atalhoDe(a); if (!k) return;
      Array.prototype.forEach.call(raiz.querySelectorAll('[data-rv-cmd="' + FITA[a] + '"]'), function (b) { if (b.title.indexOf("(atalho ") < 0) { b.title = (b.title ? b.title + " " : "") + "(atalho " + k + ")"; n++; } });
    });
    return n;
  };
  BimInstTipos.abrirAtalhos = function () {
    var U2 = global.UI; if (!U2 || !U2.modal) return false;
    var m = this.atalhos(), self = this, inv = {}; Object.keys(m).forEach(function (k) { inv[m[k]] = k; });
    var h = '<p class="muted" style="margin:0 0 8px">Duas letras digitadas em sequência com a vista focada. Guardados para este usuário. Os do editor (MV, CO, CS, SL, RE…) não podem se repetir.</p>' +
      '<table class="tbl" style="width:100%"><thead><tr><th>Comando</th><th style="width:90px">Atalho</th></tr></thead><tbody>' +
      Object.keys(ACOES).map(function (a) { return "<tr><td>" + esc(ACOES[a]) + '</td><td><input data-at-acao="' + a + '" maxlength="2" value="' + esc(inv[a] || "") + '" style="width:60px;text-transform:uppercase"></td></tr>'; }).join("") +
      NIVEL.map(function (n) { return "<tr><td>" + esc(n[1]) + "</td><td>" + n[0] + "</td></tr>"; }).join("") +
      '</tbody></table><p data-at-erro style="color:#c62828;margin:8px 0 0"></p>';
    function fechar() { try { U2.fecharModal(); } catch (e) {} }
    U2.modal("Atalhos de instalações", h, [
      { texto: "Salvar", classe: "primary", onClick: function () {
        var novo = {}; Array.prototype.forEach.call(document.querySelectorAll("[data-at-acao]"), function (i) { var k = String(i.value || "").toUpperCase().trim(); if (k) novo[k] = i.getAttribute("data-at-acao"); });
        var v = self.salvarAtalhos(novo); if (!v.ok) { var p = document.querySelector("[data-at-erro]"); if (p) p.textContent = v.erros.join(" · "); return false; }
        toast("Atalhos de instalações salvos.", "ok"); try { if (global.BimShell && global.BimShell.pintarFita) global.BimShell.pintarFita(); } catch (e) {} fechar(); return true; } },
      { texto: "Restaurar padrão", classe: "ghost", onClick: function () { self.restaurarAtalhos(); toast("Atalhos de instalações restaurados.", "ok"); fechar(); } },
      { texto: "Fechar", classe: "ghost", onClick: fechar }
    ]);
    return true;
  };

  /* ligação com a casca (no navegador): depois de pintar Propriedades e a fita */
  BimInstTipos.ligar = function () {
    var S = global.BimShell; if (!S || S.__tiposLigado) return !!(S && S.__tiposLigado);
    var pp = S.pintarProps, pf = S.pintarFita, self = this;
    S.pintarProps = function (esq) { var r = pp.apply(this, arguments); try { self.decorar(this._raiz, this._estado && this._estado.props); } catch (e) {} return r; };
    if (pf) S.pintarFita = function () { var r = pf.apply(this, arguments); try { self.marcarFita(this._raiz); } catch (e) {} return r; };
    /* FLUIDEZ (17/10/2026): a PALETA (js/bimpropsui.js) se repinta sozinha depois de cada op/desfazer (render, sem passar
       pelo pintarProps) — o seletor sumia na primeira mudança e a linha de tipo antiga voltava */
    var BP = global.BimPropsUI;
    if (BP && BP.render && !BP.__tiposLigado) {
      var pr = BP.render; BP.__tiposLigado = true;
      BP.render = function () { var r = pr.apply(this, arguments); try { if (S._estado && S._estado.props && S._estado.props.bp1) self.decorar(S._raiz, S._estado.props); } catch (e) {} return r; };
    }
    S.__tiposLigado = true; this.instalar(); return true;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = BimInstTipos;
  global.BimInstTipos = BimInstTipos;
  if (typeof window !== "undefined") { try { BimInstTipos.ligar(); } catch (e) {} }
})(typeof window !== "undefined" ? window : globalThis);

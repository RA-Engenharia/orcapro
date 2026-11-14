/* =====================================================================
 * mor/ifcorc.js — DO MODELO IFC AO ORÇAMENTO COMPLETO (F13 do MOR, ESPEC §16)
 *
 * Recebe o modelo LIDO (js/mor/ifcler.js: elementos, ambientes, papel de cada um) e aplica as regras de
 * js/mor/catalogo-dados/implicitos.js. Devolve LINHAS no formato do motor (etapa, código, descrição, unidade,
 * quantidade, fórmula, `mor`) com a ORIGEM de cada uma:
 *   medido    quantidade lida do Qto do IFC (verde)
 *   estimado  quantidade estimada pela geometria simples do arquivo (amarelo) — bimorc, regra 3: estimado ≠ medido
 *   implicito o modelo não desenha, a obra consome (amarelo, só entra com OK)
 *   sugerido  padrão do orçamento ou taxa/consumo do catálogo (amarelo, só entra com OK)
 *   pendente  falta medida, composição ou parâmetro (vermelho) — com o MOTIVO escrito
 * Mais: o que JÁ ESTÁ DENTRO da composição escolhida («incluso» — nunca somado), o que o IFC já traz modelado
 * (não se duplica) e o CHECKLIST de completude por disciplina («par obrigatório»).
 *
 * ⚠ As quatro regras do bimorc.js valem aqui: (1) nada se vincula sozinho por parecença — a linha leva o código do
 *   CATÁLOGO, escolhido pela regra, e a pessoa dá OK; (2) unidade diferente não se converte — a unidade da linha é a da
 *   composição e a quantidade sai na unidade dela, ou fica pendente; (3) estimado ≠ medido — a fonte aparece; (4) nada
 *   muda o orçamento sozinho — este arquivo NÃO grava nada; quem insere (js/mor/ifcui.js) só insere o que recebeu OK.
 * ⚠ Preço nunca é inventado: sem `obter`, a linha sai sem preço; com `obter`, o preço é o da base instalada.
 * ⚠ Determinístico: mesmo modelo + mesmo padrão + mesmos parâmetros = mesmas linhas, na mesma ordem.
 * Puro, ES5, Node-testável: tools/test-mor-ifc.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  function mod(g, caminho) { if (global[g]) return global[g]; if (typeof require === "function") { try { return require(caminho); } catch (e) { return null; } } return null; }
  var R = mod("MorRegras", "./regras.js"), C = mod("MorCatalogo", "./catalogo.js");
  function dadosImpl() {
    if (!(global.MorDados && global.MorDados.implicitos) && typeof require === "function") { try { require("./catalogo-dados/implicitos.js"); } catch (e) { /* o teste acusa */ } }
    return global.MorDados && global.MorDados.implicitos;
  }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
  function fmt(v) { return typeof v === "number" ? (Math.floor(v) === v ? String(v) : String(r2(v)).replace(".", ",")) : String(v); }
  function sa(s) { var t = String(s == null ? "" : s); try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* */ } return t.toLowerCase(); }

  var PADRAO = { baixo: "popular", popular: "popular", medio: "normal", "médio": "normal", normal: "normal", alto: "alto" };

  /* ---------------------------------------------------------------- códigos: TUDO (catálogo) ∪ F13 */
  function tabelaCodigos() {
    if (C && C.etapas) C.etapas();
    var D = global.MorDados || {}, cod = D.codigos || {}, out = {}, k;
    [cod.TUDO || {}, cod.F13 || {}].forEach(function (t) { for (k in t) if (tem(t, k) && !tem(out, k)) out[k] = t[k]; });
    return out;
  }

  /* ---------------------------------------------------------------- contexto de cada elemento */
  function numOu(v) { return typeof v === "number" && isFinite(v) ? v : undefined; }
  function maior0(v) { return typeof v === "number" && v > 0 ? v : undefined; }

  function taxaAcoDe(e) {
    var t = 0;
    Object.keys(e.psets || {}).forEach(function (pn) { Object.keys(e.psets[pn]).forEach(function (pk) { var k = sa(pk), v = e.psets[pn][pk]; if (typeof v === "number" && v > 0 && !(t > 0) && /taxa.*(aco|armad)|reinforcementvolumeratio|taxa de armadura|aco.*m3/.test(k)) t = v; }); });
    return t;
  }
  function telhaDe(e) {
    var t = sa([e.nome, e.tipoNome, e.conjuntoNome, (e.materiais || []).join(" ")].join(" "));
    if (/fibrocimento|eternit|onduline|brasilit/.test(t)) return "fibro";
    if (/metalic|zinco|sanduiche|termoacustic|aluzinc|trapezoidal|galvaliume/.test(t)) return "metalica";
    if (/telha.*concreto|concreto.*telha|encaixe/.test(t)) return "concreto";
    if (/ceramic|barro|colonial|romana|portuguesa|paulista|francesa/.test(t)) return "ceramica";
    return "";
  }
  function secmmDe(e) {
    var m = /(\d+(?:[.,]\d+)?)\s*(?:mm2|mm²|mm\^2|mm)/i.exec([e.nome, e.tipoNome].join(" ")), v = m ? parseFloat(m[1].replace(",", ".")) : 0;
    Object.keys(e.psets || {}).forEach(function (pn) { Object.keys(e.psets[pn]).forEach(function (pk) { if (!(v > 0) && /secao|section|bitola|cross.*area/.test(sa(pk)) && typeof e.psets[pn][pk] === "number") { v = e.psets[pn][pk]; if (v < 0.001) v = v * 1e6; } }); });
    return v > 0 ? String(Math.round(v * 10) / 10) : "";
  }
  function nucleoParede(e, Ler) {
    var cam = arr(e.camadas), core = null, i, cl;
    for (i = 0; i < cam.length; i++) { cl = Ler.materialClasse(cam[i].material); if ((cl === "bloco-ceramico" || cl === "alvenaria" || cl === "bloco-concreto" || cl === "celular" || cl === "") && cam[i].espessura > 0 && (!core || cam[i].espessura > core.espessura)) core = cam[i]; }
    if (!core) for (i = 0; i < cam.length; i++) if (cam[i].espessura > 0 && (!core || cam[i].espessura > core.espessura)) core = cam[i];
    return core ? { esp: core.espessura, conhecido: true } : { esp: e.qto.largura || 0, conhecido: false };   /* sem IfcMaterialLayerSet a largura é a espessura TOTAL (com reboco): o núcleo é desconhecido */
  }
  function contaCamada(e, Ler, classes) {
    var n = 0; arr(e.camadas).forEach(function (c) { if (classes.indexOf(Ler.materialClasse(c.material + " " + (c.nome || ""))) >= 0) n++; });
    return n;
  }

  function ctxElemento(e, G) {
    var q = e.qto || {}, c = { papel: e.papel, padrao: G.padrao, empolamento: G.empolamento, mat: G.Ler._matEl(e) }, p = e.papel, i;
    var L = maior0(q.comprimento), B = maior0(q.largura), Hs = maior0(q.altura), A = maior0(q.area) || maior0(q.areaBruta), V = maior0(q.volume) || maior0(q.volumeBruto), P = maior0(q.perimetro);
    c.mat = c.mat || "";
    c.ext = 0; c.peso = q.peso > 0 ? q.peso : 0;
    var taxa = taxaAcoDe(e); c.taxaAco = taxa; c.temTaxa = taxa > 0 ? 1 : 0;
    c.matAssumido = e.sub === "material-assumido" ? 1 : 0;
    if (G.params.folga !== undefined) c.folga = G.params.folga;
    if (G.params.dmt !== undefined) c.dmt = G.params.dmt;
    if (G.params.espSuporte !== undefined) c.espSuporte = G.params.espSuporte;
    if (L !== undefined) c.L = L;
    if (V !== undefined) c.V = V;
    if (P !== undefined) c.P = P;

    if (p === "parede-alvenaria" || p === "parede-drywall" || p === "parede-concreto") {
      var H = maior0(q.altura), Hw = H;
      if (H !== undefined) c.H = H;
      if (B !== undefined) c.B = B;
      var vaos = arr(e.vaos), Avaos = 0, AvaosDesc = 0, Lverga = 0, Lcontra = 0, ve;
      for (i = 0; i < vaos.length; i++) { ve = vaos[i]; Avaos += ve.area || 0; if ((ve.area || 0) > 2) AvaosDesc += ve.area; if (ve.largura > 0) { Lverga += ve.largura + 0.6; if (ve.classe === "IFCWINDOW") Lcontra += ve.largura + 0.6; } }
      var bruta = maior0(q.areaLateralBruta) || (L !== undefined && Hw !== undefined ? L * Hw : 0), liquida = maior0(q.areaLateral), Ab = bruta, nota = "";
      if (!Ab && liquida) { Ab = liquida + Avaos; nota = "área bruta = área líquida do IFC + vãos"; }
      var Aliq = Ab ? Ab - AvaosDesc : (liquida || 0);
      c.Abruta = Ab || 0; c.Avaos = Avaos; c.AvaosDesc = AvaosDesc; c.nVaos = vaos.length; c.Lverga = Lverga; c.Lcontra = Lcontra;
      if (Aliq > 0) c.Aliq = Aliq;
      var cats = arr(e.ambientesCat), nMol = 0, nExt = 0;
      for (i = 0; i < cats.length; i++) { if (cats[i] === "molhado") nMol++; else if (cats[i] === "externo") nExt++; }
      var fExt = (e.externo === true || nExt > 0) ? 1 : 0, resto = 2 - fExt, fMol = Math.min(resto, nMol >= 2 ? 2 : (nMol === 1 ? 1 : 0)), fSeco = resto - fMol;
      var Af = c.Aliq || 0;
      c.Af_ext = fExt * Af; c.Af_mol = fMol * Af; c.Af_seca = fSeco * Af; c.Lf_mol = fMol * (L || 0);
      c.externa = fExt;
      c.camChapisco = contaCamada(e, G.Ler, ["chapisco"]); c.camEmboco = contaCamada(e, G.Ler, ["argamassa"]); c.camCeramica = contaCamada(e, G.Ler, ["ceramica", "porcelanato"]); c.camPintura = contaCamada(e, G.Ler, ["pintura"]);
      var nuc = nucleoParede(e, G.Ler), ecm = Math.round(nuc.esp * 100); c.ecm = ecm;
      var cm = c.mat; c.alvCasa = !nuc.conhecido ? 0 : ((ecm >= 8 && ecm <= 10 && cm !== "celular") || (ecm >= 13 && ecm <= 15 && cm !== "celular") || (ecm >= 18 && ecm <= 20 && cm !== "celular") || (cm === "celular" && ecm >= 14 && ecm <= 16)) ? 1 : 0;
      c._notas = [];
      if (nota) c._notas.push(nota);
      if (!nuc.conhecido) c._notas.push("espessura total do modelo, núcleo desconhecido; confira o bloco");
    } else if (p === "porta" || p === "janela") {
      var W = maior0(q.largura), Hj = maior0(q.altura);
      if (W !== undefined) c.W = W; if (Hj !== undefined) { c.Hj = Hj; } if (W !== undefined && Hj !== undefined) c.Aj = W * Hj;
      c.ext = (e.externo === true || arr(e.ambientesCat).indexOf("externo") >= 0) ? 1 : 0;
    } else if (p === "sapata" || p === "sapata-corrida" || p === "bloco" || p === "baldrame") {
      if (B !== undefined) c.B = B; if (Hs !== undefined) c.Hs = Hs;
      var Af2 = p === "baldrame" ? (L !== undefined && B !== undefined ? L * B : undefined) : (A !== undefined ? A : (L !== undefined && B !== undefined ? L * B : undefined));
      if (Af2 !== undefined) c.A = Af2;
      if (c.P === undefined && L !== undefined && B !== undefined) c.P = 2 * (L + B);
      c._notas = [];
      if (G.params.profEsc !== undefined) {
        c.profEsc = G.params.profEsc;
        if (Hs !== undefined && c.profEsc < Hs + 0.05) c._notas.push("profundidade de escavação informada (" + fmt(r2(c.profEsc)) + " m) menor que a altura da peça + lastro de 5 cm (" + fmt(r2(Hs + 0.05)) + " m): reaterro e escavação não são confiáveis, confira");
      } else if (Hs !== undefined) c.profEsc = Hs + 0.05;
    } else if (p === "pilar-concreto" || p === "viga-concreto") {
      if (B !== undefined) c.B = B; if (Hs !== undefined) c.Hs = Hs;
    } else if (p === "laje" || p === "laje-cobertura" || p === "radier" || p === "piso-acabamento" || p === "piso-laje" || p === "forro" || p === "revestimento-parede" || p === "cobertura-telhado") {
      if (A !== undefined) c.A = A; if (B !== undefined) c.B = B;
      if (p === "piso-acabamento" || p === "piso-laje") c.matAcab = G.Ler.materialClasse((e.materiais || []).join(" ")) || G.Ler.materialClasse(e.nome + " " + e.tipoNome) || "";
      if (p === "cobertura-telhado") c.telha = telhaDe(e);
    } else if (p === "estaca") {
      var dcm = e._geo && e._geo.forma === "circ" ? Math.round(e._geo.x * 100) : Math.round((G.Ler._diametroMm(e) || 0) / 10);
      c.dcm = dcm;
    } else if (p === "tubo") {
      c.sis = e.sub || ""; c.mat = e.matTubo || c.mat || "pvc"; c.dn = e.dn || 0;
    } else if (p === "conexao") {
      c.sis = e.sub || ""; c.dn = e.dn || 0; c.tp = e.tipoConexao || ""; c.ang = e.angulo || 90; c.n = 1; c.mat = c.mat || "pvc";
    } else if (p === "louca") { c.sub = e.sub || ""; }
    else if (p === "tomada") { c.sub = e.sub || "10A"; }
    else if (p === "eletroduto" || p === "eletroduto-conexao") { c.dn = e.dn || 0; }
    else if (p === "cabo") { c.secmm = secmmDe(e); }
    else if (p === "incendio-terminal") { c.sub = e.sub || "outro"; }
    else if (p === "estrutura-telhado") { c.mat = e.matTubo || c.mat || ""; }
    c.nPecasPesadas = 0;
    return c;
  }

  /* ---------------------------------------------------------------- ambiente e obra */
  function ctxAmbiente(sp, G) {
    var c = { padrao: G.padrao, empolamento: G.empolamento }, i, e, soma = 0;
    c.molhado = sp.categoria === "molhado" ? 1 : 0; c.externo = sp.categoria === "externo" ? 1 : 0;
    if (sp.areaPiso > 0) c.Apiso = sp.areaPiso;
    if (sp.perimetroPiso > 0) c.Pp = sp.perimetroPiso;
    if (sp.altura > 0) c.Hp = sp.altura;
    for (i = 0; i < G.elementos.length; i++) {
      e = G.elementos[i]; if (e.papel !== "porta" || arr(e.ambientes).indexOf(sp.id) < 0) continue;
      soma += e.qto.largura || 0;
    }
    c.Lportas = soma;
    /* forro e piso modelados: só vale o associado A ESTE ambiente (IfcSpace); o que não tem ambiente nenhum não dá para atribuir: por cautela suprime todos (nunca duplica) */
    var nf = G.obra.nForroSemAmb || 0, np = G.obra.nPisoSemAmb || 0;
    for (i = 0; i < G.elementos.length; i++) {
      e = G.elementos[i]; if (arr(e.ambientes).indexOf(sp.id) < 0) continue;
      if (e.papel === "forro") nf++; else if (e.papel === "piso-acabamento" || e.papel === "piso-laje") np++;
    }
    c.nForro = nf; c.nPisoModelado = np;
    return c;
  }

  function montarObra(G) {
    var el = G.elementos, o = {}, i, e, n = {};
    el.forEach(function (x) { if (x.papel) { var k = "n_" + x.papel.replace(/-/g, "_"); n[k] = (n[k] || 0) + 1; } });
    n.n_ambiente = G.espacos.length; n.n_ambiente_molhado = G.espacos.filter(function (s) { return s.categoria === "molhado"; }).length;
    n.n_louca = n.n_louca || 0;
    var k2; for (k2 in n) o[k2] = n[k2];
    var I2 = dadosImpl(); (I2 ? I2.pares : []).forEach(function (pp) { (String(pp.quando).match(/n_[a-z_]+/g) || []).forEach(function (t) { if (!(t in o)) o[t] = 0; }); });
    var cont = function (papel) { return el.filter(function (x) { return x.papel === papel; }).length; };
    var soma = function (papel, f) { var s = 0; el.forEach(function (x) { if (x.papel === papel) s += f(x) || 0; }); return s; };
    o.nElementos = el.filter(function (x) { return !!x.papel; }).length;
    o.nForro = cont("forro"); o.nPisoModelado = cont("piso-acabamento") + cont("piso-laje");
    o.nForroSemAmb = el.filter(function (x) { return x.papel === "forro" && !arr(x.ambientes).length; }).length;
    o.nPisoSemAmb = el.filter(function (x) { return (x.papel === "piso-acabamento" || x.papel === "piso-laje") && !arr(x.ambientes).length; }).length;
    /* soleira: UMA vez por porta (externa ou que toque ambiente molhado), no escopo da obra */
    o.Lsoleira = 0;
    el.forEach(function (x) {
      if (x.papel !== "porta" || !arr(x.ambientes).length) return;
      if (x.externo === true || arr(x.ambientesCat).indexOf("externo") >= 0 || arr(x.ambientesCat).indexOf("molhado") >= 0) o.Lsoleira += (x.qto && x.qto.largura) || 0;
    });
    /* andaime de fachada: edificação com mais de 1 pavimento ou mais de 4 m de altura */
    var pavs = {}, cotas = [], hMax = 0;
    el.forEach(function (x) { if (x.pavimento) { pavs[x.pavimento] = true; if (G.pavCota && typeof G.pavCota[x.pavimento] === "number") cotas.push(G.pavCota[x.pavimento]); } if (x.papel === "parede-alvenaria" || x.papel === "parede-concreto" || x.papel === "parede-drywall") hMax = Math.max(hMax, (x.qto && x.qto.altura) || 0); });
    o.nPavimentos = Object.keys(pavs).length;
    o.alturaEdif = hMax + (cotas.length > 1 ? Math.max.apply(null, cotas) - Math.min.apply(null, cotas) : 0);
    o.edifAlta = (o.nPavimentos > 1 || o.alturaEdif > 4) ? 1 : 0;
    o.nEstTelhado = cont("estrutura-telhado"); o.nRalo = cont("ralo"); o.nCabo = cont("cabo");
    o.nEletroduto = soma("eletroduto", function (x) { return x.qto.comprimento; });
    o.nTubos = cont("tubo");
    o.nCalhaModelada = el.filter(function (x) { return x.predef === "GUTTER"; }).length;
    o.nBacia = el.filter(function (x) { return x.papel === "louca" && x.sub === "bacia"; }).length;
    o.nLav = el.filter(function (x) { return x.papel === "louca" && x.sub === "lavatorio"; }).length;
    o.Aj_total = soma("janela", function (x) { var w = x.qto.largura, h = x.qto.altura; return w > 0 && h > 0 ? w * h : 0; });
    o.Autil = G.espacos.reduce(function (s, x) { return s + (x.categoria !== "externo" && x.areaPiso > 0 ? x.areaPiso : 0); }, 0);
    var pesados = el.filter(function (x) { return x.qto && x.qto.peso > 0; });
    o.nPecasPesadas = pesados.length; o.pesoMax = pesados.reduce(function (m, x) { return Math.max(m, x.qto.peso); }, 0);
    o.padrao = G.padrao; o.empolamento = G.empolamento;
    ["folga", "dmt", "espSuporte"].forEach(function (k) { if (G.params[k] !== undefined) o[k] = G.params[k]; });
    return o;
  }

  /* ---------------------------------------------------------------- avaliação de uma regra */
  function interpolar(txt, ctx) {
    return String(txt).replace(/\{([A-Za-z_][A-Za-z0-9_.]*)\}/g, function (m, n) {
      if (!tem(ctx, n) || ctx[n] === undefined || ctx[n] === null) return "não informado";
      var v = ctx[n]; if ((n === "dn" || n === "dcm" || n === "ecm") && v === 0) return "não informado";
      if (v === "") return "não informado";
      return fmt(v);
    });
  }
  function tentar(expr, ctx) { try { return R.tentar(expr, ctx); } catch (e) { return { ok: false, erro: String(e.message || e) }; } }
  function ident(expr) { return (String(expr || "").match(/[A-Za-z_][A-Za-z0-9_]*/g) || []); }

  /* de quais campos do Qto a quantidade depende (para a fonte: ifc × estimado) */
  var QTOCHAVES = { L: ["comprimento"], H: ["altura"], B: ["largura"], Hs: ["altura"], A: ["area", "areaBruta"], V: ["volume", "volumeBruto"], P: ["perimetro"], W: ["largura"], Hj: ["altura"], Aj: ["largura", "altura"], Aliq: ["areaLateral", "areaLateralBruta", "comprimento", "altura"], Af_seca: ["areaLateral", "areaLateralBruta", "comprimento", "altura"], Af_ext: ["areaLateral", "areaLateralBruta", "comprimento", "altura"], Af_mol: ["areaLateral", "areaLateralBruta", "comprimento", "altura"], Lf_mol: ["comprimento"], Lverga: ["largura"], Lcontra: ["largura"] };
  function fonteDe(expr, e) {
    var ids = ident(expr), est = false, ifc = false;
    ids.forEach(function (id) { arr(QTOCHAVES[id]).forEach(function (k) { if (e.qtoFonte && e.qtoFonte[k] === "estimado") est = true; if (e.qtoFonte && e.qtoFonte[k] === "ifc") ifc = true; }); });
    return est ? "estimado" : (ifc ? "ifc" : "");
  }

  function escolherCodigo(r, ctx) {
    /* devolve { chave, via } — via: "ifc" (material do modelo), "padrao", "tabela", "fixo", ou null */
    var m;
    if (r.cod) return { chave: r.cod, via: "fixo" };
    if (r.codPor) {
      if (r.porMaterial && r.matVar && tem(ctx, r.matVar) && tem(r.porMaterial, ctx[r.matVar])) return { chave: r.porMaterial[ctx[r.matVar]], via: "ifc" };
      m = r.codPor[ctx.padrao]; return m ? { chave: m, via: "padrao" } : null;
    }
    if (r.cods) { m = r.cods[ctx[r.chaveCod]]; return m ? { chave: m, via: "tabela" } : null; }
    if (r.tabela) {
      var partes = String(r.chaveTab).split("|"), k = partes.map(function (n) { var v = ctx[n]; return v === undefined || v === null ? "" : String(v); }).join("|");
      m = r.tabela[k]; if (m === undefined && r.chaveTab === "dn") m = r.tabela[String(ctx.dn)];
      return m ? { chave: m, via: "tabela" } : null;
    }
    return null;
  }

  /* ---------------------------------------------------------------- o motor */
  function orcar(modelo, opts) {
    opts = opts || {};
    var I = dadosImpl(), Ler = mod("MorIfcLer", "./ifcler.js");
    if (!I || !R || !C || !Ler) return { ok: false, erro: "Os dados do motor (implicitos.js, regras, catálogo ou leitor) não carregaram.", linhas: [] };
    if (!modelo || !modelo.ok) return { ok: false, erro: (modelo && modelo.erro) || "Modelo IFC não lido.", linhas: [] };
    var tab = tabelaCodigos();
    var G = { Ler: Ler, padrao: PADRAO[sa(opts.padrao || "normal")] || "normal", empolamento: I.empolamento, params: {}, elementos: arr(modelo.elementos).filter(function (x) { return !!x.papel; }), espacos: arr(modelo.espacos), obra: {}, pavCota: {} };
    arr(modelo.modelo && modelo.modelo.pavimentos).forEach(function (pv) { if (pv && pv.nome && typeof pv.cota === "number") G.pavCota[pv.nome] = pv.cota; });
    var pr = opts.params || {}, kk;
    for (kk in pr) if (tem(pr, kk) && typeof pr[kk] === "number" && isFinite(pr[kk])) G.params[kk] = pr[kk];
    if (G.params.empolamento !== undefined) G.empolamento = G.params.empolamento;
    G.obra = montarObra(G);
    G.obra.nForro = G.obra.nForro || 0;

    var ctxEl = {};   /* cache: id → contexto */
    G.elementos.forEach(function (e) { ctxEl[e.id] = ctxElemento(e, G); });
    var porPapel = {}; G.elementos.forEach(function (e) { (porPapel[e.papel] = porPapel[e.papel] || []).push(e); });

    /* Amol: soma das faces molhadas das paredes (limpeza do revestimento) */
    G.obra.Amol = G.elementos.reduce(function (s, e) { return s + (e.papel === "parede-alvenaria" ? (ctxEl[e.id].Af_mol || 0) : 0); }, 0);

    var grupos = {}, ordemGrupos = [], incluidos = [], presentes = {}, semMedida = {}, zerados = [], semCod = {}, pendIncl = {};
    function pegar(chave, r) { if (!grupos[chave]) { grupos[chave] = { chave: chave, regra: r, contrib: [], erros: [], ctx0: null }; ordemGrupos.push(chave); } return grupos[chave]; }
    function registrarIncluso(r, alvos, motivoExtra) { incluidos.push({ regra: r.id, tipo: motivoExtra ? "modelado" : "incluso", rotulo: r.rotulo || "", motivo: motivoExtra || r.motivo, comps: arr(r.comps), origem: r.origem || null, elementos: alvos.map(function (x) { return x.id; }), etapa: r.etapa }); presentes[r.id] = true; }

    I.regras.forEach(function (r) {
      var alvos, tipoAlvo;
      if (r.papeis) { alvos = []; r.papeis.forEach(function (pp) { arr(porPapel[pp]).forEach(function (e) { alvos.push(e); }); }); tipoAlvo = "elemento"; alvos.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); }); }
      else if (r.escopo === "ambiente") { alvos = G.espacos.slice(); tipoAlvo = "ambiente"; }
      else { alvos = [{ id: "obra", nome: "a obra", classe: "obra" }]; tipoAlvo = "obra"; }
      var incTrig = [], modelados = {};
      alvos.forEach(function (t) {
        var ctx;
        if (tipoAlvo === "elemento") { ctx = {}; var b = ctxEl[t.id], k; for (k in b) ctx[k] = b[k]; for (k in G.obra) if (!tem(ctx, k)) ctx[k] = G.obra[k]; ctx.semCodConexao = semCod[t.id] ? 1 : 0; }
        else if (tipoAlvo === "ambiente") { ctx = ctxAmbiente(t, G); var k3; for (k3 in G.obra) if (!tem(ctx, k3)) ctx[k3] = G.obra[k3]; }
        else { ctx = {}; var k4; for (k4 in G.obra) ctx[k4] = G.obra[k4]; }
        arr(r.vars).forEach(function (v) { var tv = tentar(v[1], ctx); if (tv.ok) ctx[v[0]] = tv.valor; });
        /* 1. já modelado no IFC → não duplica */
        var sp = arr(r.suprime), sup = null;
        for (var s = 0; s < sp.length; s++) { var ts = tentar(sp[s].quando, ctx); if (ts.ok && ts.valor) { sup = sp[s]; break; } }
        if (sup) { (modelados[sup.motivo] = modelados[sup.motivo] || []).push(t); return; }
        /* 2. gatilho */
        if (r.quando) {
          var tq = tentar(r.quando, ctx);
          if (!tq.ok) { if (r.tipo !== "incluso") { var sk = r.id + "|" + tq.erro; if (!semMedida[sk]) semMedida[sk] = { regra: r.id, erro: tq.erro, elementos: [] }; semMedida[sk].elementos.push(t.id); } return; }
          if (!tq.valor) return;
        }
        if (r.tipo === "incluso") { incTrig.push(t); return; }
        /* 3. chave de agrupamento */
        var suf = arr(r.agrupar).map(function (n) { return n + "=" + (ctx[n] === undefined ? "" : ctx[n]); }).join(",");
        var g = pegar(r.id + (suf ? "#" + suf : ""), r); g.ctx0 = g.ctx0 || ctx;
        /* 4. código (resolvido antes da quantidade: a conexão sem composição vira «avulsa») */
        var esc = escolherCodigo(r, ctx);
        if (r.id === "med.conexao" && !esc) semCod[t.id] = true;
        /* 5. quantidade */
        var q = null, err = "";
        if (r.qtd === null) err = r.formula;
        else { var tt = tentar(r.qtd, ctx); if (tt.ok) q = tt.valor; else err = tt.erro; }
        var nota = []; arr(r.notas).forEach(function (n) { var tn = tentar(n.quando, ctx); if (tn.ok && tn.valor && nota.indexOf(n.texto) < 0) nota.push(n.texto); });
        arr(ctx._notas).forEach(function (n2) { if (nota.indexOf(n2) < 0) nota.push(n2); });
        var sg = false; if (r.sugestaoSe) { var tg = tentar(r.sugestaoSe, ctx); sg = tg.ok && !!tg.valor; }
        var contr = { el: t, q: q, erro: err, fonte: tipoAlvo === "elemento" && r.qtd !== null ? fonteDe(r.qtd, t) : "", notas: nota, sugerido: sg, esc: esc };
        if (r.menos) contr.menosVar = null;
        g.contrib.push(contr);
        if (g.erros.length === 0 || true) { if (err) g.erros.push({ el: t, erro: err }); }
        if (!g.ctxCod) { g.ctxCod = ctx; g.esc = esc; }
        if (q !== null) g.ultimoQ = q;
      });
      if (r.tipo === "incluso" && incTrig.length) {
        if (arr(r.comps).length) pendIncl[r.id] = incTrig;   /* decidido depois, com os códigos realmente lançados */
        else registrarIncluso(r, incTrig);
      }
      Object.keys(modelados).forEach(function (mot) { registrarIncluso(r, modelados[mot], mot); incluidos[incluidos.length - 1].tipo = "modelado"; });
    });

    /* ---- linhas */
    var linhas = [], descartados = [];
    ordemGrupos.forEach(function (gk) {
      var g = grupos[gk], r = g.regra, ctx = g.ctxCod || g.ctx0 || {}, esc = g.esc || null;
      var tot = 0, nOk = 0, nErro = 0, fontes = {}, notas = [], sugerido = false, elementos = [];
      g.contrib.forEach(function (c) {
        elementos.push(c.el);
        if (c.q !== null && c.q !== undefined) { tot += Math.max(0, c.q); nOk++; if (c.fonte) fontes[c.fonte] = 1; } else nErro++;
        c.notas.forEach(function (n) { if (notas.indexOf(n) < 0) notas.push(n); });
        if (c.sugerido) sugerido = true;
      });
      /* subtrai o que o IFC já modelou (ex.: vergas) */
      var menosTxt = "";
      if (r.menos && nOk > 0) { var m = 0; arr(porPapel[r.menos.papel]).forEach(function (x) { m += (x.qto && x.qto.comprimento) || 0; }); if (!(m > 0) && arr(porPapel[r.menos.papel]).length) menosTxt = "há " + arr(porPapel[r.menos.papel]).length + " peça(s) modelada(s) (" + r.menos.papel + ") SEM comprimento no IFC: nada foi descontado — confira";
        if (m > 0) { tot = Math.max(0, tot - m); menosTxt = r.menos.motivo + " (−" + fmt(r2(m)) + ")"; incluidos.push({ regra: r.id, tipo: "modelado", rotulo: "verga", motivo: r.menos.motivo, comps: [], elementos: arr(porPapel[r.menos.papel]).map(function (x) { return x.id; }), etapa: r.etapa }); } }
      var q = r2(tot);
      var pendenteTotal = nOk === 0;
      if (!pendenteTotal && !(q > 0)) { zerados.push({ regra: r.id, motivo: "a quantidade calculada é zero" + (r.id === "fun.reaterro" ? " (a profundidade escavada não foi informada: a cava só tem o tamanho da peça)" : ""), elementos: elementos.length }); return; }
      var tabC = esc ? tab[esc.chave] : null;
      var dsc = tabC ? tabC[1] : interpolar(r.desc || r.intencao || r.id, ctx);
      var un = tabC ? tabC[2] : (r.un || "un");
      var estado = "ok", motivos = [];
      if (pendenteTotal) { estado = "pendente"; motivos.push(g.erros.length ? g.erros[0].erro : "falta a medida"); }
      else if (nErro > 0) { estado = "pendente"; motivos.push(nErro + " de " + (nOk + nErro) + " elemento(s) sem a medida necessária (" + g.erros[0].erro + "): a quantidade é PARCIAL"); }
      if (!tabC) { estado = "pendente"; motivos.push(esc ? "a chave «" + esc.chave + "» não existe nas tabelas de código" : "sem composição no catálogo para esta combinação (o código fica pendente)"); }
      if (opts.obter && tabC && !opts.obter(String(tabC[0]), "SINAPI")) { estado = "pendente"; motivos.push("o código " + tabC[0] + " não está na base instalada"); }
      var fonteQ = fontes.estimado ? (fontes.ifc ? "misto" : "estimado") : (fontes.ifc ? "ifc" : "");
      var origem;
      if (estado === "pendente") origem = "pendente";
      else if (r.tipo === "medido") origem = sugerido ? "sugerido" : (fonteQ === "estimado" || fonteQ === "misto" ? "estimado" : "medido");
      else if (r.tipo === "sugerido" || r.sug) origem = "sugerido";
      else origem = "implicito";
      if (r.tipo === "medido" && origem === "medido" && esc && esc.via === "padrao") origem = "sugerido";
      var numeros = {}; ident(r.qtd).concat(ident(r.quando)).forEach(function (n) { if (tem(ctx, n) && typeof ctx[n] === "number") numeros[n] = r2(ctx[n]); });
      var nomes = elementos.slice(0, 6).map(function (x) { return (x.nome || x.classe || String(x.id)); });
      var porqueTxt = r.porque ? interpolar(r.porque, ctx) : "";
      var prem = [];
      if (esc && esc.via === "padrao") prem.push("material pelo padrão do orçamento («" + G.padrao + "»): o IFC não diz o material");
      if (esc && esc.via === "ifc") prem.push("material do IFC («" + (ctx[r.matVar] || "") + "») vence o padrão");
      if (fonteQ === "estimado" || fonteQ === "misto") prem.push("quantidade ESTIMADA pela geometria do arquivo (o IFC não trouxe o Qto): conferir");
      notas.forEach(function (n) { prem.push(n); });
      if (menosTxt) prem.push(menosTxt);
      var et = C.etapa(r.etapa) || {}, linha = {
        id: gk, etapa: et.etapa || r.etapa, etapaId: r.etapa, ordemEtapa: et.ordem || 99,
        codigo: tabC ? String(tabC[0]) : "", fonte: tabC ? "SINAPI" : "", descricao: dsc, unidade: un,
        quantidade: pendenteTotal ? 0 : q, formula: r.formula, parametrico: true, estado: estado, erro: motivos.join(" · "),
        origem: origem, qtdFonte: fonteQ, ifc: true,
        elementos: elementos.map(function (x) { return { id: x.id, chave: x.chave || "", nome: x.nome || "", classe: x.classe || "" }; }),
        mor: {
          regra: gk, formula: r.qtd === null ? "" : r.qtd, premissas: prem, origem: "ifc", qtdOrigem: origem === "pendente" ? (r.tipo === "medido" ? "medido" : (r.tipo === "sugerido" || r.sug ? "sugerido" : "implicito")) : origem,
          porque: porqueTxt, confianca: estado === "ok" ? (origem === "medido" ? "alta" : "media") : "pendente", codigos: tabC ? [String(tabC[0])] : [], intencao: r.intencao || "",
          vars: numeros, elementoOrigem: elementos.length + " elemento(s): " + nomes.join("; ") + (elementos.length > 6 ? "…" : ""), conferido: false,
          ifc: { tipoRegra: r.tipo, origemRegra: r.origem || null, fonteQuantidade: fonteQ, via: esc ? esc.via : "", nElementos: elementos.length, motivo: motivos.join(" · ") }
        }
      };
      if (!tabC) { linha.mor.pendencia = { casador: "", sugestoes: [], compositor: "", faltou: motivos.slice() }; }
      linhas.push(linha); presentes[r.id] = true;
    });

    /* ---- «incluso» com comps: só aparece se alguma das composições foi mesmo lançada */
    var codigosLancados = {}; linhas.forEach(function (l) { if (l.codigo) codigosLancados[l.codigo] = true; });
    I.regras.forEach(function (r) {
      if (!pendIncl[r.id]) return;
      var usadas = arr(r.comps).filter(function (c2) { return codigosLancados[c2.comp]; });
      if (usadas.length) { var rr = {}, k; for (k in r) rr[k] = r[k]; rr.comps = usadas; registrarIncluso(rr, pendIncl[r.id]); }
    });

    /* ---- ordem: etapa (ordem do catálogo) e, dentro dela, a ordem das regras */
    var idxGrupo = {}; ordemGrupos.forEach(function (gk, ix) { idxGrupo[gk] = ix; });
    linhas.sort(function (a, b) { return a.ordemEtapa !== b.ordemEtapa ? a.ordemEtapa - b.ordemEtapa : idxGrupo[a.id] - idxGrupo[b.id]; });

    /* ---- checklist de completude */
    var ctxPar = {}; for (kk in G.obra) ctxPar[kk] = G.obra[kk];
    var check = [];
    I.pares.forEach(function (p) {
      var tq = tentar(p.quando, ctxPar);
      if (!tq.ok) { /* contagem inexistente = zero elementos daquele papel */ tq = { ok: true, valor: false }; }
      if (!tq.valor) return;
      var ok = arr(p.exige).some(function (id) { return presentes[id]; });
      check.push({ id: p.id, disciplina: p.disciplina, ok: ok, aviso: ok ? "" : p.aviso, exige: p.exige.slice() });
    });

    /* ---- premissas gerais */
    var prem = ["Padrão do orçamento: «" + G.padrao + "» (baixo = popular, médio = normal, alto = alto do catálogo). Só preenche o que o IFC não diz; material informado no IFC vence."];
    var semAmb = G.elementos.filter(function (e) { return e.papel === "parede-alvenaria" && !arr(e.ambientes).length && e.externo === null; }).length;
    if (semAmb) prem.push(semAmb + " parede(s) sem ambiente (IfcSpace) e sem Pset IsExternal: as duas faces foram tratadas como INTERNAS SECAS (revestimento e pintura saem como sugestão — confira fachada e áreas molhadas).");
    if (!G.espacos.length) prem.push("O IFC não tem ambientes (IfcSpace): piso, rodapé, contrapiso e teto não têm perímetro/área por ambiente — saem pendentes ou não saem; informe os ambientes no modelo.");
    var nEst = G.elementos.filter(function (e) { return Object.keys(e.qtoFonte || {}).some(function (k) { return e.qtoFonte[k] === "estimado"; }); }).length;
    if (nEst) prem.push(nEst + " elemento(s) sem Qto no IFC tiveram a quantidade ESTIMADA pela geometria simples do arquivo (extrusão): aparecem como «estimado», nunca como medido.");
    if (G.elementos.some(function (e) { return e.papel === "viga-concreto"; })) prem.push("Viga: largura = menor lado e altura = maior lado da seção (o IFC não diz a orientação).");
    prem.push("Desconto de vãos: só vãos maiores que 2 m² são descontados da alvenaria e do revestimento (critério SINAPI da especificação); conferir com o critério de medição do contrato.");
    prem.push("Rasgo/chumbamento: supõe todo eletroduto e todo tubo de água ≤ DN 40 embutidos em alvenaria (reduza o que vai em laje, piso ou forro).");
    prem.push("Escavação: sem a cota do terreno no IFC, a profundidade = altura da peça + 5 cm de lastro; informe «profEsc» (m) para reaterro e bota-fora reais. Sobrescavação, distância de bota-fora (dmt) e espaçamento de suportes não têm padrão: ficam pendentes até a pessoa informar.");

    var contagem = { medido: 0, estimado: 0, implicito: 0, sugerido: 0, pendente: 0 };
    linhas.forEach(function (l) { contagem[l.origem] = (contagem[l.origem] || 0) + 1; });
    var etapas = [], idxE = {};
    linhas.forEach(function (l) { if (!(l.etapaId in idxE)) { idxE[l.etapaId] = etapas.length; etapas.push({ id: l.etapaId, nome: l.etapa, ordem: l.ordemEtapa, linhas: [] }); } etapas[idxE[l.etapaId]].linhas.push(l); });

    return {
      ok: true, erro: "", padrao: G.padrao, linhas: linhas, etapas: etapas, incluidos: incluidos, zerados: zerados, semMedida: Object.keys(semMedida).map(function (k) { return semMedida[k]; }), checklist: check,
      faltas: check.filter(function (c3) { return !c3.ok; }), premissas: prem, params: G.params, contagem: contagem,
      cobertura: modelo.cobertura, avisos: arr(modelo.avisos).slice()
    };
  }

  /* ---------------------------------------------------------------- DUPLA CONTAGEM (auditoria genérica) ----------------
     Dadas as linhas e o analítico (código → { insumos:[{codigo}] }), acha toda linha cujo código aparece DENTRO da composição
     de outra linha E que vêm do MESMO elemento do modelo (ou não têm elemento): o serviço já está pago duas vezes.
     Devolve [{ linha, incluidaEm, codigo, composicao }]. */
  function duplaContagem(linhas, analitico) {
    var out = [], porCod = {};
    arr(linhas).forEach(function (l) { if (l.codigo) (porCod[l.codigo] = porCod[l.codigo] || []).push(l); });
    arr(linhas).forEach(function (a) {
      if (!a.codigo) return;
      var comp = analitico && analitico[a.codigo]; if (!comp) return;
      arr(comp.insumos).forEach(function (ins) {
        var cod = String(ins.codigo);
        if (cod === a.codigo) return;

        arr(porCod[cod]).forEach(function (b) {
          if (b === a) return;
          /* só é dupla contagem quando as DUAS linhas vêm do MESMO elemento: o adesivo avulso de um tê não duplica o adesivo que o joelho (outra peça) já traz */
          var ea = arr(a.elementos).map(function (x) { return x.id; }), eb = arr(b.elementos).map(function (x) { return x.id; });
          if (ea.length && eb.length && !ea.some(function (x) { return eb.indexOf(x) >= 0; })) return;
          out.push({ linha: b.id, codigo: cod, incluidaEm: a.id, composicao: a.codigo });
        });
      });
    });
    return out;
  }

  /* resumo por etapa para a tela: contagens por origem */
  function resumoEtapa(et) {
    var c = { medido: 0, estimado: 0, implicito: 0, sugerido: 0, pendente: 0 };
    arr(et.linhas).forEach(function (l) { c[l.origem] = (c[l.origem] || 0) + 1; });
    return c;
  }

  var MorIfcOrc = { orcar: orcar, duplaContagem: duplaContagem, resumoEtapa: resumoEtapa, PADRAO: PADRAO, _tabelaCodigos: tabelaCodigos, _ctxElemento: ctxElemento };
  if (typeof module !== "undefined" && module.exports) module.exports = MorIfcOrc;
  global.MorIfcOrc = MorIfcOrc;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
 * bimparam.js — REGISTRO ÚNICO DE PARÂMETROS do BIM (motor puro, ES5).
 *
 * Fase P1, Frente A do plano do BIM (seção 3.1). Pedido do
 * Rogério (08/10/2026): ter no OrçaPRO as funcionalidades e os
 * parâmetros de um modelador completo. O defeito que este arquivo fecha (1.3, item 1):
 * cada módulo dizia à sua maneira o que é a "área" de uma parede — tela de
 * Propriedades, IFC, quantitativo e orçamento eram QUATRO lugares. Aqui fica
 * UMA tabela por categoria dizendo o que é cada parâmetro e de onde ele
 * sai. Propriedades (Frente C), tabela, IFC e orçamento (Frente D) só leem
 * daqui.
 *
 * FONTE DE VERDADE dos nomes: o inventário de parâmetros em PT-BR
 * (convenção de mercado), conferido no teste. Nome PT-BR e grupo são os do
 * inventário, letra por letra — tools/test-bimparam.js confere cada um.
 * Parâmetro sem equivalente no inventário tem id "RA_..." e revit: null.
 * Copia-se o NOME e a REGRA, nunca valor de família de fabricante.
 *
 * O QUE ESTÁ AQUI
 *   · REGISTRO: as 8 categorias do modelador — parede, laje (piso), pilar,
 *     viga, escada (+ lance e patamar), guarda-corpo, cobertura e família
 *     (porta, janela, genérico) — e o grupo COMUM (Marca, Marca de tipo,
 *     Comentários, Descrição, Fase criada, Fase demolida, Imagem…).
 *     P2-A: + AMBIENTE (o ambiente, js/bimambiente.js): sem tipo e sem
 *     Marca (a identidade é o Número); Área/Perímetro/Volume lidos do
 *     contorno que o replay calcula. Parede e pilar ganham "Delimitação de
 *     ambientes" (op delimitar).
 *     P2-B: + forro (js/bimforro.js — estado.forros).
 *     P3: + telhado e bordas (js/bimtelhado.js — estado.telhados, estado.bordas)
 *     e fundação (js/bimfundacao.js — estado.fundacoes); nomes PT-BR
 *     a conferir na coleta (o inventário não tem telhado nem fundação).
 *   · resolver(estado, deps): por peça, a lista {def, valor, texto}.
 *     secoes(peca): os grupos na ordem usual da paleta de Propriedades (Restrições, Construção, Cotas, Dados de identidade, Fases…). valor(peca, id).
 *   · TIPOS NOMEADOS (projeto.tipos[categoria][] = {id, nome, valores}):
 *     pilar e viga ganham tipo (perfil + material, catálogo js/perfisaco.js);
 *     "Editar tipo" muda todas as instâncias (op ajustarTipo).
 *   · MARCA automática por categoria (P01, J01, PA01…), sem repetir e
 *     renumerável (op marcar).
 *   · PARÂMETROS DO PROJETO criados pelo usuário e GLOBAIS (fórmula pelo
 *     avaliador do js/familia.js — nunca eval).
 *
 * REGRAS DA CASA
 *   · O registro é a PORTA, não um segundo motor: todo derivado (calc) lê o
 *     que o motor JÁ calculou — BimEdit.medidasDe (a mesma medida do
 *     orçamento), BimArq (seção, escada, camadas), Familia.avaliar.
 *   · calc é NOME de função pura desta tabela (CALC), nunca código vindo de
 *     dado. A tabela é congelada (Object.freeze) ao carregar.
 *   · Na lista de operações vai só a fonte, sem lista dentro de lista (a
 *     nuvem recusa): ajustarTipo.valores e marcar.marcas são mapas de
 *     valores simples; ids é lista de ids.
 *
 * AS DUAS OPS (validadas no BimEdit.sanear — "P1-A" em js/bimedit.js):
 *   {op:"ajustarTipo", categoria, tipoId, nome?, valores?:{k: valor|null}, ids?:[id…]}
 *     cria/edita o tipo do projeto (null apaga a chave) e, com ids, põe as
 *     peças nele. Valores que mexem na geometria (pilar/viga: perfil|forma +
 *     medidas, material; laje: espessura; escada: emax, pmin, piso,
 *     larguraMin; guarda-corpo: altura, espac) valem para TODAS as
 *     instâncias do tipo, aplicados no replay antes do BimArq.derivar.
 *   {op:"marcar", id, marca?, comentarios?, imagem?, faseCriada?, faseDemolida?, params?:{}}
 *     identidade da instância ("" volta ao automático);
 *   {op:"marcar", marcas:{<id>: "<marca>"}}   renumerar em lote.
 *
 * ESCRITA das restrições (P1-C, js/bimpropsui.js): "ajustar.restricoes.<campo>"
 *   = op {op:"ajustar", id, campos:{restricoes:{…}}} da P1-B (js/bimarq.js),
 *   com campo nivelBase | deslocBase | restricaoSuperior | deslocSuperior |
 *   alturaNaoConectada. A paleta lê esta string e nada mais para saber
 *   como gravar.
 *
 * Teste: node tools/test-bimparam.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------- dependências */
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  /* P1-acab: a quantidade no REGISTRO vai com precisão total; a régua de 4
     casas (a do orçamento de sempre) só vale quando o resolver calcula o
     `valorOrc` (x.regua). Ver BimEdit.medidasDe(el, vaos, exato). */
  function q4(x, v) { return x && x.regua ? r4(v) : v; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function temChave(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function escalar(v) { return v === null || typeof v === "string" || typeof v === "boolean" || fin(v); }

  /* --------------------------------------------- grupos e tipos de dado */
  /* ORDEM DOS GRUPOS da paleta de Propriedades (de cima
     para baixo). Grupo que não está aqui vai para o fim, na ordem em que
     aparece. "Parâmetros do projeto" é o grupo padrão do que o usuário cria. */
  var GRUPOS = [
    "Restrições", "Regras de cálculo", "Construção", "Gráficos", "Materiais e acabamentos", "Elétrica", "Mecânica", "Mecânica – Vazão", "Estrutural",   /* P12: Elétrica e Mecânica (instalações) */
    "Posição geométrica", "Definição de seção transversal", "Geometria do corte estrutural", "Análise estrutural",
    "Espelhos", "Pisos", "Suportes", "Corrimão superior", "Corrimão 1", "Corrimão 2",
    "Cotas", "Dados de identidade", "Fases", "Parâmetros do projeto", "Parâmetros IFC", "Outros", "Referência"
  ];
  /* dado → unidade e casas do texto PT-BR. Valores internos em SI (m, m², m³,
     kg); as propriedades de SEÇÃO usam a unidade usual de seção (cm⁴,
     cm³, cm⁶, cm², kg/m, m²/m) — o `un` de cada definição diz qual. */
  var DADOS = {
    comprimento: { un: "m", casas: 2, num: true }, area: { un: "m²", casas: 2, num: true }, volume: { un: "m³", casas: 3, num: true },
    angulo: { un: "°", casas: 2, num: true }, inclinacao: { un: "%", casas: 1, num: true }, massa: { un: "kg", casas: 2, num: true },
    secao: { un: "", casas: 2, num: true }, inteiro: { un: "", casas: 0, num: true }, numero: { un: "", casas: 3, num: true },
    simnao: { un: "" }, texto: { un: "" }, material: { un: "" }, nivel: { un: "" }, fase: { un: "" }, lista: { un: "" },
    /* MATERIAIS (09/10/2026): o material DO PROJETO da peça (js/bimmateriais.js) — a lista é a da obra */
    materialProjeto: { un: "" }
  };
  /* as fases padrão: "Existente" e "Construção nova";
     demolida "Nenhum" = não demolida. As fases do projeto (P10) entram aqui. */
  var FASES = ["Existente", "Construção nova"];

  /* ------------------------------------------------- faixas (= editor) */
  /* as MESMAS travas do editor e do validador da B8 (js/bimmodelar.js LIM;
     escada e guarda-corpo: js/bimarq.js escadaCalc/escada/guarda) — o teste
     confere que continuam iguais. */
  var FAIXA = {
    paredeAltura: { min: 0.3, max: 8 }, lajeEspessura: { min: 0.05, max: 0.4 }, pilarAltura: { min: 0.3, max: 20 },
    coberturaInclinacao: { min: 1, max: 300 }, coberturaBeiral: { min: 0, max: 3 }, coberturaEspessura: { min: 0.02, max: 0.5 },
    escadaDesnivel: { min: 0.3, max: 12 }, escadaEmax: { min: 0.12, max: 0.25 }, escadaPmin: { min: 0.15, max: 0.6 }, escadaLargura: { min: 0.6, max: 4 },
    guardaAltura: { min: 0.5, max: 2 }, guardaEspac: { min: 0.2, max: 3 },
    /* P2-B (js/bimforro.js e BimEdit.opForroValida): as mesmas travas da op forro */
    forroDesloc: { min: -200, max: 200 }, forroInclinacao: { min: 0, max: 60 },
    /* P3 (js/bimtelhado.js e js/bimfundacao.js opValida): as mesmas travas das ops */
    telhadoDesloc: { min: -200, max: 200 }, fundDesloc: { min: -50, max: 50 }, fundDim: { min: 0.05, max: 50 }, fundAltura: { min: 0.05, max: 10 }
  };

  /* ================================================================ CALC
   * As funções PURAS dos derivados. Cada uma recebe o contexto x que o
   * resolver monta (x.el = a peça do estado, x.m = BimEdit.medidasDe, x.av =
   * Familia.avaliar, x.sec = BimArq.secao, x.cat = linha do catálogo de aço,
   * x.tipo = tipo do projeto, x.nivel = nível da peça…) e só LÊ dele. */
  function el(x) { return x.el || {}; }
  function m(x) { return x.m || {}; }
  /* EMBREVE: a configuração de graute da parede (js/bimgraute.js; padrão quando a parede não tem) */
  function gOn(x) { return !!(el(x).graute && el(x).graute.ativo); }
  function gcfg(x) {
    var BG = dep("BimGraute", "./bimgraute.js");
    return BG && BG.config ? BG.config(el(x)) : { familia: null, espacamento: null, bitola: 0, barras: null, fgk: null, transpasse: null, areaFuro: null, origem: {} };
  }
  function elev(x) { return x.nivel && fin(Number(x.nivel.elevacao)) ? Number(x.nivel.elevacao) : 0; }
  function nivelNome(x) { return x.nivel ? txt(x.nivel.nome) : null; }
  function aco(x) { return el(x).material === "aco"; }
  function catv(x, k) { return x.catPerfil && fin(x.catPerfil[k]) ? x.catPerfil[k] : null; }
  function perf(x, k) { var p = el(x).perfil; return p && fin(Number(p[k])) ? Number(p[k]) : null; }
  function baseParede(x) { var c = el(x); return num(c.cy, 0) - num(c.altura, 0) / 2; }
  function basePilar(x) { var c = el(x); return c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - num(c.altura, 0) / 2; }
  function topoViga(x) { var c = el(x); return c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2; }
  function topoLaje(x) { var c = el(x); return num(c.cy, 0) + num(c.altura, 0) / 2; }
  /* deslocamento em relação ao nível: a Frente B (restrições, op v:2) grava
     deslocBase; até lá é a cota absoluta menos a elevação do nível */
  function desloc(x, abs) { var c = el(x); return fin(c.deslocBase) ? c.deslocBase : r4(abs - elev(x)); }
  function esc(x) { var c = el(x); return (c.escada && c.escada.calc) || {}; }
  function escPar(x) { var c = el(x); return (c.escada && c.escada.par) || {}; }
  function gPar(x) { var c = el(x); return (c.guarda && c.guarda.par) || {}; }
  function abert(x) { return (x.av && x.av.abertura) || null; }
  function famVal(x, k) { var v = x.av && x.av.valores; return v && temChave(v, k) ? v[k] : null; }
  function mm(v) { return String(Math.round(v * 10000) / 10).replace(".", ","); }

  var CALC = {
    /* MATERIAIS (js/bimmateriais.js): o nome do material do projeto da peça; sem ele, o da categoria */
    materialProjeto: function (x) {
      var id = txt(el(x).materialProj); if (!id) return "<Por categoria>";
      var U = global.BimMateriaisUI, m = null;
      try { m = U && U.porId ? U.porId(id) : null; } catch (e) { m = null; }
      return m ? txt(m.nome) : id;
    },
    /* ---- P12: instalações (js/biminst.js pecasRegistro — o motor já calculou, aqui só se lê) */
    mepComprimento: function (x) { return fin(el(x).comprimento) ? el(x).comprimento : null; },
    mepComprimentoH: function (x) { return fin(el(x).comprimentoH) ? el(x).comprimentoH : null; },
    mepDesnivel: function (x) { return fin(el(x).desnivel) ? el(x).desnivel : null; },
    mepInclinacao: function (x) { return fin(el(x).inclinacao) ? el(x).inclinacao : null; },
    mepElevIni: function (x) { return fin(el(x).elevIni) ? r4(el(x).elevIni) : null; },
    mepElevFim: function (x) { return fin(el(x).elevFim) ? r4(el(x).elevFim) : null; },
    mepDn: function (x) { return fin(el(x).dn) ? el(x).dn : null; },
    mepTamanho: function (x) { return el(x).tamanho != null ? txt(el(x).tamanho) : null; },
    mepLargura: function (x) { return fin(el(x).largura) ? el(x).largura : null; },
    mepAltura: function (x) { return fin(el(x).altura) ? el(x).altura : null; },
    mepAngulo: function (x) { return fin(el(x).angulo) ? el(x).angulo : null; },
    mepFaceAFace: function (x) { return fin(el(x).faceAFace) ? el(x).faceAFace : null; },
    mepSistema: function (x) { return txt(el(x).sistemaNome) || null; },
    mepAbrev: function (x) { return txt(el(x).sistemaAbrev) || null; },
    mepNomeSistema: function (x) { return txt(el(x).nomeSistema) || null; },
    mepCodigoSistema: function (x) { return txt(el(x).codigoSistema) || null; },
    mepMaterial: function (x) { return txt(el(x).material) || null; },
    mepSegmento: function (x) { return txt(el(x).segmento) || null; },
    mepAplicacao: function (x) { return txt(el(x).aplicacao) || null; },
    mepTipoConexao: function (x) { return txt(el(x).tipoConexao) || null; },
    mepVariante: function (x) { return txt(el(x).variante) || null; },
    mepTrechos: function (x) { return txt(el(x).ramos || el(x).trechos) || null; },
    mepCodigo: function (x) { var c = el(x); return c.codigo ? txt(c.codigo) : (c.situacao === "pendente" ? "pendente" : null); },
    mepTipoSistema: function (x) { return txt(el(x).sistemaNome) || null; },
    /* dispositivo (família com mep): o código do MAPA pelo motor das instalações */
    mepCodigoFam: function (x) {
      var BI = dep("BimInst", "./biminst.js"); if (!BI || !BI.familiaMep || !x.av) return null;
      var it = BI.familiaMep(x.av, x.el); if (!it) return null;
      var sp = BI.sinapiDe(it); return sp.status === "ok" ? sp.codigo : "pendente";
    },
    mepItemFam: function (x) {
      var BI = dep("BimInst", "./biminst.js"); if (!BI || !BI.familiaMep || !x.av) return null;
      var it = BI.familiaMep(x.av, x.el); return it ? BI.rotuloItem(it) : null;
    },
    /* ---- comum */
    marca: function (x) { var c = el(x); return c.marca ? txt(c.marca) : (x.marcaAuto || null); },
    marcaTipo: function (x) { var v = x.tipo && x.tipo.valores; return v && v.marcaTipo ? txt(v.marcaTipo) : (x.marcaTipoAuto || null); },
    tipoNome: function (x) { return x.tipoNome || null; },
    tipoId: function (x) { return x.tipoId || null; },
    categoriaNome: function (x) { return x.reg ? x.reg.nome : null; },
    familiaNome: function (x) { return x.familiaNome || null; },
    familiaETipo: function (x) { return (x.familiaNome || "") + ": " + (x.tipoNome || ""); },
    ifcEntidade: function (x) { return x.reg ? x.reg.ifc : null; },
    ifcExporta: function () { return "Por tipo"; },
    ifcGuid: function (x) { return x.ifcGuid || null; },
    hospedeiro: function (x) { var c = el(x); return c.host && c.host.id != null ? String(c.host.id) : null; },
    nivelNome: nivelNome,

    /* ---- parede (BimEdit.medidasDe: a área é UMA face líquida de vãos) */
    paredeComprimento: function (x) { return q4(x, num(el(x).comprimento, 0)); },   /* linha de localização (a secundária do T mede 4,00 m pela linha de localização) */
    paredeComprimentoLiq: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    paredeArea: function (x) { return m(x).area != null ? m(x).area : null; },
    paredeVolume: function (x) { return m(x).volume != null ? m(x).volume : null; },
    /* P4: a face leva também a VIRADA das camadas daquele lado (x.virada, BimArq.areasVirada) quando o tipo vira */
    paredeAreaFora: function (x) { return m(x).areaFora != null ? q4(x, m(x).areaFora + (x.virada ? x.virada.fora : 0)) : null; },
    paredeAreaDentro: function (x) { return m(x).areaDentro != null ? q4(x, m(x).areaDentro + (x.virada ? x.virada.dentro : 0)) : null; },
    /* ---- P4: linha de localização, virar camadas, união de geometria, pintura */
    paredeLinhaLoc: function (x) { var v = el(x).linhaLoc, L = x.linhasLoc || []; for (var i = 0; i < L.length; i++) if (L[i].v === (v || 0)) return L[i].nome; return "Linha central da parede"; },
    paredeVirarExt: function (x) { var t = x.tipo && x.tipo.valores, v = el(x).virar; if (t && t.virarExtremidades) return txt(t.virarExtremidades); return v && v.ext ? (v.ext === "fora" ? "Exterior" : "Interior") : "Nenhum"; },
    paredeVirarIns: function (x) { var t = x.tipo && x.tipo.valores, v = el(x).virar; if (t && t.virarInsercoes) return txt(t.virarInsercoes); return v && v.ins ? ({ fora: "Exterior", dentro: "Interior", ambos: "Ambos" })[v.ins] || "Não virar" : "Não virar"; },
    paredeAreaVirada: function (x) { var v = x.virada; return v && (v.fora + v.dentro) > 0 ? q4(x, v.fora + v.dentro) : null; },
    uniaoGeo: function (x) {
      var l = arr(el(x).uniaoGeo), av = arr(el(x).avisosUniao);
      if (!l.length && !av.length) return null;
      return l.map(function (u) { return (u.corta ? "corta " : "cortada por ") + txt(u.com) + " (" + String(r4(u.volume)).replace(".", ",") + " m³)"; }).concat(av).join("; ");
    },
    areaPintada: function (x) { var l = arr(x.pinturas); if (!l.length) return null; var s = 0; l.forEach(function (p) { s += num(p.area, 0); }); return q4(x, s); },
    pinturaTexto: function (x) {
      var l = arr(x.pinturas); if (!l.length) return null;
      return l.map(function (p) { return txt(p.rotuloFace) + ": " + txt(p.material) + " " + String(r4(p.area)).replace(".", ",") + " m²"; }).join("; ");
    },
    paredeAreaVaos: function (x) { return q4(x, num(x.areaVaos, 0)); },
    /* EMBREVE — GRAUTE E ARMADURA (js/bimgraute.js): a configuração da parede
       (padrão marcado "conferir NBR 16868-1") e o que o motor calculou (x.graute) */
    grauteAtivo: function (x) { return !!(el(x).graute && el(x).graute.ativo); },
    /* a configuração só aparece (e só vai ao IFC) na parede MARCADA — nas outras, vazio */
    grauteFamilia: function (x) { return gOn(x) ? gcfg(x).familia : null; },
    grauteEspacamento: function (x) { return gOn(x) ? gcfg(x).espacamento : null; },
    grauteBitola: function (x) { var b = num(gcfg(x).bitola, 0); return gOn(x) && b > 0 ? b.toFixed(1).replace(".", ",") + " mm" : null; },
    grauteBarras: function (x) { return gOn(x) ? gcfg(x).barras : null; },
    grauteFgk: function (x) { var f = gcfg(x).fgk; return gOn(x) && f != null ? f + " MPa" : null; },
    grauteTranspasse: function (x) { var v = gcfg(x).transpasse; return gOn(x) && v != null ? v : null; },
    grauteAreaFuro: function (x) { var v = gcfg(x).areaFuro; return gOn(x) && v != null ? v : null; },
    grautePontos: function (x) { return x.graute ? x.graute.n : null; },
    grauteVolume: function (x) { return x.graute ? q4(x, x.graute.volumeExato || 0) : null; },
    grauteAcoComprimento: function (x) { return x.graute ? q4(x, x.graute.acoComprimentoExato || 0) : null; },
    grauteAcoPeso: function (x) { return x.graute ? q4(x, x.graute.acoKgExato || 0) : null; },
    grauteConferir: function (x) {
      if (!x.graute) return null;
      var o = gcfg(x).origem || {}, l = [];
      ["espacamento", "transpasse", "areaFuro"].forEach(function (k) { if (o[k] && o[k] !== "projeto") l.push(k === "espacamento" ? "espaçamento (padrão)" : k === "transpasse" ? "transpasse (" + o[k] + ")" : "área do furo (" + o[k] + ")"); });
      return (l.length ? "Conferir na NBR 16868-1 e no projeto: " + l.join("; ") : "Valores informados pelo projeto") + (x.graute.avisos && x.graute.avisos.length ? ". " + x.graute.avisos.join("; ") : "");
    },
    /* P1-D: as medidas do orçamento que o BimEdit.medidasDe já dava e o
       registro ainda não tinha — a área bruta e a fôrma (as duas faces) */
    paredeAreaBruta: function (x) { return m(x).areaBruta != null ? m(x).areaBruta : null; },
    paredeAreaForma: function (x) { return m(x).areaForma != null ? m(x).areaForma : null; },
    paredeDeslocBase: function (x) { return desloc(x, baseParede(x)); },
    paredeRestricaoSuperior: function (x) { return x.nivelSup ? txt(x.nivelSup.nome) : "Não conectada"; },
    paredeDeslocSuperior: function (x) { var c = el(x); return fin(c.deslocSuperior) ? c.deslocSuperior : 0; },
    paredeTopoAnexado: function (x) { return !!el(x).anexarTopo; },
    /* P2-A: "Delimitação de ambientes" — padrão sim (op delimitar) */
    pecaDelimita: function (x) { return el(x).delimitaAmbiente !== false; },
    falso: function () { return false; },
    verdadeiro: function () { return true; },
    paredeLargura: function (x) { return r4(num(el(x).espessura, 0)); },
    paredeEstrutura: function (x) {
      var t = el(x).tipoParede;
      if (!t || !arr(t.camadas).length) return "Núcleo " + mm(num(el(x).espessura, 0)) + " mm";
      return arr(t.camadas).map(function (k) { return txt(k.rotulo) + " " + mm(num(k.e, 0)) + " mm"; }).join(" + ");
    },
    paredeMaterialNucleo: function (x) {
      var t = el(x).tipoParede, n = t && arr(t.camadas).filter(function (k) { return k.face === "nucleo"; })[0];
      return n && n.material ? txt(n.material) : "<Por categoria>";
    },
    paredeCamadas: function (x) {
      return arr(x.camadas).map(function (k) { return txt(k.rotulo) + " (" + k.face + "): " + String(r4(k.area)).replace(".", ",") + " m²"; }).join("; ") || null;
    },

    /* ---- laje (piso) */
    lajeArea: function (x) { return m(x).area != null ? m(x).area : null; },
    lajeVolume: function (x) { return m(x).volume != null ? m(x).volume : null; },
    lajePerimetro: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    lajeEspessura: function (x) { return r4(num(el(x).altura, 0)); },
    lajeTopo: function (x) { return r4(topoLaje(x)); },
    lajeFundo: function (x) { return r4(topoLaje(x) - num(el(x).altura, 0)); },
    lajeDeslocNivel: function (x) { return desloc(x, topoLaje(x)); },
    lajeEstrutura: function (x) { return "Laje maciça " + mm(num(el(x).altura, 0)) + " mm"; },
    lajeAreaFuros: function (x) { var c = el(x), X = !x.regua && c._exato; return c.areaFuros != null ? (X && fin(X.areaFuros) ? X.areaFuros : q4(x, num(c.areaFuros, 0))) : 0; },
    lajeAreaForma: function (x) { return m(x).areaForma != null ? m(x).areaForma : null; },   /* P1-D: fôrma de laje = área do fundo */
    concretoArmado: function () { return "Concreto armado"; },

    /* ---- forro (P2-B, js/bimforro.js: o forro chega derivado do replay;
       as quantidades são as do BimEdit.medidasDe — as mesmas do orçamento) */
    forroArea: function (x) { return m(x).area != null ? m(x).area : null; },
    forroAreaBruta: function (x) { return m(x).areaBruta != null ? m(x).areaBruta : null; },
    forroPerimetro: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    forroVolume: function (x) { return m(x).volume != null ? m(x).volume : null; },
    forroAreaFuros: function (x) { return fin(el(x).areaFuros) ? el(x).areaFuros : null; },
    forroDeslocNivel: function (x) { return fin(el(x).deslocNivelEf) ? el(x).deslocNivelEf : null; },
    forroCota: function (x) { return fin(el(x).cota) ? r4(el(x).cota) : null; },
    forroInclinacao: function (x) { return fin(el(x).inclinacao) ? el(x).inclinacao : 0; },
    forroDirInclinacao: function (x) { return fin(el(x).dirInclinacao) ? el(x).dirInclinacao : 0; },
    forroModo: function (x) { return el(x).modo === "automatico" ? "Automático (pelas paredes)" : "Desenhado (contorno)"; },
    forroEspessura: function (x) { var t = el(x).tipoForro; return t && fin(t.espessura) ? t.espessura : null; },
    forroEstrutura: function (x) {
      var t = el(x).tipoForro;
      return t ? arr(t.camadas).map(function (k) { return txt(k.rotulo) + " " + mm(num(k.e, 0)) + " mm"; }).join(" + ") : null;
    },
    forroMaterial: function (x) { var t = el(x).tipoForro, k = t && arr(t.camadas)[0]; return k && k.material ? txt(k.material) : "<Por categoria>"; },

    /* ---- P3: telhado, bordas e fundação (js/bimtelhado.js, js/bimfundacao.js:
       chegam derivados do replay; as quantidades são as do BimEdit.medidasDe —
       as mesmas do orçamento) */
    teDesloc: function (x) { return fin(el(x).deslocBaseEf) ? el(x).deslocBaseEf : 0; },
    teBeiral: function (x) { return el(x).modo === "extrusao" ? null : (fin(el(x).beiralEf) ? el(x).beiralEf : num(el(x).beiral, 0)); },
    teModo: function (x) { return el(x).modo === "extrusao" ? "Por extrusão" : "Por perímetro"; },
    teCorte: function () { return "Corte em prumo"; },
    teInclinacao: function (x) { return el(x).modo === "extrusao" ? null : num(el(x).inclinacao, 30); },
    teInclinacoes: function (x) {
      var c = el(x); if (c.modo === "extrusao") return null;
      return arr(c.contorno).map(function (q) { return q && q.d === false ? "-" : String(fin(Number(q && q.i)) && q.i !== null ? Number(q.i) : num(c.inclinacao, 30)).replace(".", ","); }).join(";") || null;
    },
    teArea: function (x) { return m(x).area != null ? m(x).area : null; },
    teProjecao: function (x) { return m(x).areaProjecao != null ? m(x).areaProjecao : null; },
    teVolume: function (x) { return m(x).volume != null ? m(x).volume : null; },
    teCumeeira: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    teEspigao: function (x) { return m(x).espigao != null ? m(x).espigao : null; },
    teRincao: function (x) { return m(x).rincao != null ? m(x).rincao : null; },
    teBeiralComp: function (x) { return m(x).beiral != null ? m(x).beiral : null; },
    teEmpena: function (x) { return m(x).empena != null ? m(x).empena : null; },
    teAguas: function (x) { return fin(el(x).nAguas) ? el(x).nAguas : null; },
    teCotaCumeeira: function (x) { return fin(el(x).cotaCumeeira) ? el(x).cotaCumeeira : null; },
    teCotaApoio: function (x) { return fin(el(x).cotaApoio) ? el(x).cotaApoio : null; },
    teUnir: function (x) { return el(x).unir != null ? txt(el(x).unir) : null; },
    teAreaRemovida: function (x) { return fin(el(x).areaRemovidaUniao) ? el(x).areaRemovidaUniao : null; },
    teEspessura: function (x) { var t = el(x).tipoTelhado; return t && fin(t.espessura) ? t.espessura : null; },
    teEstrutura: function (x) { var t = el(x).tipoTelhado; return t ? arr(t.camadas).map(function (k) { return txt(k.rotulo) + " " + mm(num(k.e, 0)) + " mm"; }).join(" + ") : null; },
    teMaterial: function (x) { var t = el(x).tipoTelhado, k = t && arr(t.camadas)[0]; return k && k.material ? txt(k.material) : "<Por categoria>"; },
    boTipo: function (x) { var R = { calha: "Calha", rufo: "Rufo", testeira: "Testeira", intradorso: "Intradorso (forro do beiral)" }; return R[el(x).tipoBorda] || null; },
    boTelhado: function (x) { return el(x).telhado != null ? txt(el(x).telhado) : null; },
    boArestas: function (x) { return arr(el(x).arestas).map(function (k) { return String(Number(k) + 1); }).join(", ") || null; },
    boComprimento: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    boArea: function (x) { return m(x).area != null ? m(x).area : null; },
    boLargura: function (x) { return fin(el(x).larguraEf) ? el(x).larguraEf : null; },
    boAltura: function (x) { return fin(el(x).alturaEf) ? el(x).alturaEf : null; },
    fuTipo: function (x) { return el(x).rotuloTipo || null; },
    fuDesloc: function (x) { return num(el(x).deslocTopo, 0); },
    fuTopo: function (x) { return fin(el(x).cotaTopo) ? el(x).cotaTopo : null; },
    fuFundo: function (x) { return fin(el(x).cotaFundo) ? el(x).cotaFundo : null; },
    fuLargura: function (x) { return fin(Number(el(x).largura)) ? Number(el(x).largura) : null; },
    fuComprimento: function (x) { return fin(Number(el(x).comprimento)) ? Number(el(x).comprimento) : null; },
    fuAltura: function (x) { return fin(Number(el(x).altura)) ? Number(el(x).altura) : null; },
    fuAlturaBase: function (x) { return el(x).chanfrada ? el(x).alturaBaseEf : null; },
    fuLarguraTopo: function (x) { return el(x).chanfrada ? el(x).larguraTopoEf : null; },
    fuComprimentoTopo: function (x) { return el(x).chanfrada ? el(x).comprimentoTopoEf : null; },
    fuNEstacas: function (x) { return fin(el(x).nEstacasEf) ? el(x).nEstacasEf : null; },
    fuDiametro: function (x) { return fin(el(x).diametroEf) ? el(x).diametroEf : null; },
    fuCompEstaca: function (x) { return fin(el(x).comprimentoEstacaEf) ? el(x).comprimentoEstacaEf : null; },
    fuEspacamento: function (x) { return fin(el(x).espacamentoEf) ? el(x).espacamentoEf : null; },
    fuVolume: function (x) { return m(x).volume != null ? m(x).volume : null; },
    fuForma: function (x) { return m(x).areaForma != null ? m(x).areaForma : null; },
    fuAreaBase: function (x) { return m(x).area != null ? m(x).area : null; },
    fuComprimentoPeca: function (x) { return m(x).comprimento != null && m(x).comprimento > 0 ? m(x).comprimento : null; },
    fuEscavacao: function (x) { return m(x).escavacao != null ? m(x).escavacao : null; },
    fuReaterro: function (x) { return m(x).reaterro != null ? m(x).reaterro : null; },
    fuLastro: function (x) { return m(x).lastro != null ? m(x).lastro : null; },
    fuLastroArea: function (x) { return m(x).lastroArea != null ? m(x).lastroArea : null; },
    fuAco: function (x) { return m(x).aco != null ? m(x).aco : null; },
    fuEstacas: function (x) { return m(x).estacas != null ? m(x).estacas : (el(x).tipoFundacao === "estaca" && m(x).comprimento != null ? m(x).comprimento : null); },
    fuVolEstacas: function (x) { return m(x).volumeEstacas != null ? m(x).volumeEstacas : null; },
    fuAcoEstacas: function (x) { return m(x).acoEstacas != null ? m(x).acoEstacas : null; },
    fuProfEsc: function (x) { return fin(el(x).profundidadeEscavacao) ? el(x).profundidadeEscavacao : null; },
    fuTaxa: function (x) { return fin(Number(el(x).taxaAco)) && el(x).taxaAco !== null ? Number(el(x).taxaAco) : null; },
    fuTaxaEstaca: function (x) { return fin(Number(el(x).taxaAcoEstaca)) && el(x).taxaAcoEstaca !== null ? Number(el(x).taxaAcoEstaca) : null; },
    fuLastroEsp: function (x) { return fin(el(x).lastroEf) ? el(x).lastroEf : null; },
    fuFolga: function (x) { return fin(el(x).folgaEf) ? el(x).folgaEf : 0; },
    fuTerreno: function (x) { return num(el(x).terreno, 0); },
    fuMaterial: function () { return "Concreto armado"; },

    /* ---- pilar e viga (BimArq: seção e recorte; catálogo AISC: propriedades do tipo) */
    materialRotulo: function (x) { var M = x.materiais || {}, k = el(x).material || "concreto"; return M[k] ? M[k].rotulo : k; },
    pilarComprimento: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    pecaVolume: function (x) { return m(x).volume != null ? m(x).volume : null; },
    pilarDeslocBase: function (x) { return desloc(x, basePilar(x)); },
    pilarNivelSup: function (x) { return x.nivelSup ? txt(x.nivelSup.nome) : null; },
    pilarDeslocSup: function (x) {
      if (!x.nivelSup) return null;
      var c = el(x); return fin(c.deslocSuperior) ? c.deslocSuperior : r4(basePilar(x) + num(c.altura, 0) - num(x.nivelSup.elevacao, 0));
    },
    /* "Peso" = área de corte do TIPO × comprimento × massa específica; "Peso
       exato" = a geometria modelada (com o raio) × massa específica — as duas
       leituras usuais. Só aço. */
    acoPeso: function (x) {
      if (!aco(x)) return null;
      var A = catv(x, "A") != null ? catv(x, "A") * 1e-6 : num(el(x).secaoArea, 0), rho = x.materiais && x.materiais.aco ? num(x.materiais.aco.rho, 7850) : 7850;
      var L = el(x).tipo === "pilar" ? num(el(x).comprimentoPilar, 0) : num(el(x).comprimentoViga, 0);
      return q4(x, A * L * rho);
    },
    acoPesoExato: function (x) { return aco(x) && m(x).massa != null ? m(x).massa : null; },
    acoAreaPintura: function (x) { return aco(x) && m(x).areaForma != null ? m(x).areaForma : null; },
    concretoAreaForma: function (x) { return !aco(x) && el(x).material !== "madeira" && m(x).areaForma != null ? m(x).areaForma : null; },
    /* P1-D: a peça de MADEIRA não tem fôrma nem pintura de aço, mas o
       orçamento sempre ofereceu a superfície dela (perímetro da seção ×
       comprimento) na medida "areaForma" — tratamento, verniz. Sem esta
       definição, quem já orçava madeira por área perderia a linha. */
    madeiraAreaSuperficie: function (x) { return el(x).material === "madeira" && m(x).areaForma != null ? m(x).areaForma : null; },
    secaoForma: function (x) { var P = x.perfis || {}, f = el(x).perfil && el(x).perfil.forma; return f && P[f] ? P[f].rotulo : null; },
    secaoAltura: function (x) { return x.sec && x.sec.ok ? r6(x.sec.alt) : null; },
    secaoLargura: function (x) { return x.sec && x.sec.ok ? r6(x.sec.larg) : null; },
    secaoAlma: function (x) { return perf(x, "tw"); },
    secaoMesa: function (x) { return perf(x, "tf"); },
    secaoRaio: function (x) { return perf(x, "r"); },
    /* área de corte: a do catálogo (o "A" do tipo) quando o perfil é de catálogo;
       senão a da seção paramétrica — em cm² */
    secaoArea: function (x) { var A = catv(x, "A"); if (A != null) return r4(A / 100); return x.sec && x.sec.ok ? r4(x.sec.area * 1e4) : null; },
    secaoPerimetro: function (x) { var p = catv(x, "per"); if (p != null) return p; return x.sec && x.sec.ok ? r4(x.sec.perimetro) : null; },
    secaoPesoNominal: function (x) { return catv(x, "massa"); },
    secaoIx: function (x) { var v = catv(x, "Ix"); return v != null ? r4(v / 1e4) : null; },
    secaoIy: function (x) { var v = catv(x, "Iy"); return v != null ? r4(v / 1e4) : null; },
    secaoWx: function (x) { var v = catv(x, "Wx"); return v != null ? r4(v / 1e3) : null; },
    secaoWy: function (x) { var v = catv(x, "Wy"); return v != null ? r4(v / 1e3) : null; },
    secaoZx: function (x) { var v = catv(x, "Zx"); return v != null ? r4(v / 1e3) : null; },
    secaoZy: function (x) { var v = catv(x, "Zy"); return v != null ? r4(v / 1e3) : null; },
    secaoJ: function (x) { var v = catv(x, "J"); return v != null ? r4(v / 1e4) : null; },
    secaoCw: function (x) { var v = catv(x, "Cw"); return v != null ? r4(v / 1e6) : null; },
    /* centróide: metade da caixa nas seções SIMÉTRICAS (I, retangular,
       circular, tubos); no U, o xc do catálogo; na cantoneira, vazio */
    secaoCentroH: function (x) {
      var f = el(x).perfil && el(x).perfil.forma; if (!(x.sec && x.sec.ok)) return null;
      if (f === "U") { var xc = catv(x, "xc"); return xc != null ? r6(xc / 1000) : null; }
      return f === "L" ? null : r6(x.sec.larg / 2);
    },
    secaoCentroV: function (x) { var f = el(x).perfil && el(x).perfil.forma; return x.sec && x.sec.ok && f !== "L" ? r6(x.sec.alt / 2) : null; },
    secaoChave: function (x) { var p = el(x).perfil; return p && p.cat ? txt(p.cat) : null; },
    vigaCorte: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    vigaSistema: function (x) { return r4(num(el(x).comprimento, 0)); },
    vigaTopo: function (x) { return r4(topoViga(x)); },
    vigaFundo: function (x) { return r4(topoViga(x) - num(el(x).altura, 0)); },
    vigaDeslocNivel: function (x) { return desloc(x, topoViga(x)); },
    vigaElevNivel: function (x) { return x.nivel ? r4(elev(x)) : null; },
    vigaPlano: function (x) { return x.nivel ? "Nível : " + txt(x.nivel.nome) : null; },
    vigaJustZ: function () { return "Topo"; },

    /* ---- escada (BimArq.escadaCalc pelas regras do tipo) */
    escadaDesnivel: function (x) { return fin(Number(escPar(x).desnivel)) ? Number(escPar(x).desnivel) : null; },
    escadaDeslocBase: function (x) { return desloc(x, num(escPar(x).base, 0)); },
    escadaNivelSup: function (x) { return x.nivelSup ? txt(x.nivelSup.nome) : null; },
    escadaNDesejado: function (x) { var n = escPar(x).n; return fin(Number(n)) && n != null ? Math.round(Number(n)) : (fin(esc(x).n) ? esc(x).n : null); },
    escadaN: function (x) { return fin(esc(x).n) ? esc(x).n : null; },
    escadaE: function (x) { return fin(esc(x).e) ? r6(esc(x).e) : null; },
    escadaP: function (x) { return fin(esc(x).p) ? r6(esc(x).p) : null; },
    escadaEmax: function (x) { return fin(esc(x).emax) ? esc(x).emax : null; },
    escadaPmin: function (x) { return fin(esc(x).pmin) ? esc(x).pmin : null; },
    escadaLarguraMin: function (x) { return fin(esc(x).larguraMin) ? esc(x).larguraMin : null; },
    escadaRegra: function () { return "Espelho e piso pelo tipo (Blondel 63 a 64 cm é aviso)"; },
    escadaTrecho: function () { return "Lance monolítico (laje dentada)"; },
    escadaPatamarTipo: function () { return "Patamar de laje maciça"; },
    escadaVolume: function (x) { return m(x).volume != null ? m(x).volume : null; },
    escadaAreaPiso: function (x) { return m(x).area != null ? m(x).area : null; },
    escadaAreaEspelho: function (x) { return m(x).areaEspelho != null ? m(x).areaEspelho : null; },
    escadaAreaForma: function (x) { return m(x).areaForma != null ? m(x).areaForma : null; },
    escadaPercurso: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    escadaPisos: function (x) { return m(x).pisos != null ? m(x).pisos : null; },
    escadaLargura: function (x) { return fin(Number(escPar(x).largura)) ? Number(escPar(x).largura) : null; },

    /* ---- lance e patamar (peças virtuais da escada; x.sub = o lance/patamar) */
    lanceLargura: function (x) { return x.sub ? num(x.sub.largura, 0) : null; },
    lanceK: function (x) { return x.sub ? x.sub.k : null; },
    lancePisos: function (x) { return x.sub ? Math.max(0, x.sub.k - 1) : null; },
    lanceBaseRel: function (x) { return x.sub ? r6(num(x.sub.y, 0) - num(escPar(x).base, 0)) : null; },
    lanceTopoRel: function (x) { return x.sub ? r6(num(x.sub.y, 0) - num(escPar(x).base, 0) + x.sub.k * num(esc(x).e, 0)) : null; },
    lanceAltura: function (x) { return x.sub ? r6(x.sub.k * num(esc(x).e, 0)) : null; },
    lanceLocalizacao: function () { return "Lance: Centro"; },
    lanceVolume: function (x) { return x.sub ? num(x.sub.area, 0) * num(x.sub.largura, 0) : null; },   /* P1-acab: sem arredondar (Qto NetVolume) */
    patamarEspessura: function (x) { return x.sub ? r6(num(x.sub.y1, 0) - num(x.sub.y0, 0)) : null; },
    patamarAltura: function (x) { return x.sub ? r6(num(x.sub.y1, 0) - num(escPar(x).base, 0)) : null; },
    patamarArea: function (x) { return x.sub && fin(x.subArea) ? q4(x, x.subArea) : null; },
    patamarVolume: function (x) { return x.sub && fin(x.subArea) ? x.subArea * (num(x.sub.y1, 0) - num(x.sub.y0, 0)) : null; },

    /* ---- guarda-corpo */
    guardaComprimento: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    guardaMontantes: function (x) { return m(x).montantes != null ? m(x).montantes : null; },
    guardaCompMontantes: function (x) { return m(x).comprimentoMontantes != null ? m(x).comprimentoMontantes : null; },
    guardaArea: function (x) { return m(x).area != null ? m(x).area : null; },
    guardaAltura: function (x) { return fin(Number(gPar(x).altura)) ? Number(gPar(x).altura) : null; },
    guardaEspac: function (x) { return fin(Number(gPar(x).espac)) ? Number(gPar(x).espac) : null; },
    guardaColocacao: function (x) { return fin(Number(gPar(x).espac)) ? "Vão máximo de " + String(r4(Number(gPar(x).espac))).replace(".", ",") + " m entre montantes" : null; },
    guardaCorrimao: function (x) { return fin(Number(gPar(x).secCorrimao)) ? "Seção " + mm(Number(gPar(x).secCorrimao)) + " mm" : null; },
    guardaDeslocBase: function (x) { var p = arr(el(x).guarda && el(x).guarda.pts)[0]; return p ? r4(num(p.y, 0) - elev(x)) : null; },

    /* ---- cobertura (BimEdit.cobertura) */
    cobArea: function (x) { return m(x).area != null ? m(x).area : null; },
    cobProjecao: function (x) { return m(x).areaProjecao != null ? m(x).areaProjecao : null; },
    cobVolume: function (x) { return m(x).volume != null ? m(x).volume : null; },
    cobCumeeira: function (x) { return m(x).comprimento != null ? m(x).comprimento : null; },
    cobInclinacao: function (x) { return fin(Number(el(x).inclinacao)) ? Number(el(x).inclinacao) : null; },
    cobEspessura: function (x) { return fin(Number(el(x).espessura)) ? Number(el(x).espessura) : null; },
    cobBeiral: function (x) { return fin(Number(el(x).beiral)) ? Number(el(x).beiral) : null; },
    cobAguas: function (x) { return fin(Number(el(x).aguas)) ? Number(el(x).aguas) : null; },
    cobDeslocBase: function (x) { return desloc(x, num(el(x).base, 0)); },

    /* ---- família (Familia.avaliar) */
    famPeitoril: function (x) { var a = abert(x); return a ? r4(num(a.peitoril, 0)) : null; },
    famTopoVao: function (x) { var a = abert(x); return a ? r4(num(a.peitoril, 0) + num(a.altura, 0)) : null; },
    famAreaVao: function (x) { var a = abert(x); return a ? q4(x, num(a.largura, 0) * num(a.altura, 0)) : null; },
    famLarguraBruta: function (x) { var a = abert(x); return a ? q4(x, num(a.largura, 0)) : null; },
    famAlturaBruta: function (x) { var a = abert(x); return a ? q4(x, num(a.altura, 0)) : null; },
    famVolume: function (x) { return x.av ? volumeSolidos(x.av.solidos) : null; },
    famLargura: function (x) { return famVal(x, "Largura"); },
    famAltura: function (x) { return famVal(x, "Altura"); },
    famProfundidade: function (x) { return famVal(x, "Profundidade"); },
    famEspessuraFolha: function (x) { return famVal(x, "Espessura_folha"); },
    famMaterialFolha: function (x) { return famVal(x, "Material_folha"); },
    famMaterialBatente: function (x) { return famVal(x, "Material_batente"); },
    famMaterialMarco: function (x) { return famVal(x, "Material_marco"); },
    famMaterialVidro: function (x) { return famVal(x, "Material_vidro"); },
    famQuantidade: function (x) { return x.av && x.av.quantitativo ? x.av.quantitativo.quantidade : null; },
    famUnidade: function (x) { return x.av && x.av.quantitativo ? txt(x.av.quantitativo.unidade) : null; },
    famCodigo: function (x) { return x.av && x.av.quantitativo ? (txt(x.av.quantitativo.codigo) || null) : null; },

    /* ---- ambiente (P2-A, js/bimambiente.js: o contorno e as medidas saem
       no replay, em el.calc — aqui só se LÊ) */
    ambArea: function (x) { var k = el(x).calc; return k && fin(k.area) ? k.area : null; },
    ambPerimetro: function (x) { var k = el(x).calc; return k && fin(k.perimetro) ? k.perimetro : null; },
    ambVolume: function (x) { var k = el(x).calc; return k && fin(k.volume) ? k.volume : null; },
    ambAltura: function (x) { var k = el(x).calc; return k && fin(k.altura) ? k.altura : null; },
    ambCalcAltura: function () { return 0; },   /* altura de cálculo: o plano é a base do ambiente (0) */
    ambNivel: function (x) { return x.nivel ? txt(x.nivel.nome) : ((el(x).calc && el(x).calc.nivelNome) || null); },
    ambLimiteSup: function (x) {
      var k = el(x).calc; if (x.nivelSup) return txt(x.nivelSup.nome);
      return k && k.limiteSuperiorNome ? k.limiteSuperiorNome : (x.nivel ? txt(x.nivel.nome) : null);
    },
    ambDeslocLimite: function (x) { var k = el(x).calc; return fin(el(x).deslocLimite) ? el(x).deslocLimite : (k && fin(k.deslocLimite) ? k.deslocLimite : null); },
    ambDeslocBase: function (x) { return fin(el(x).deslocBase) ? el(x).deslocBase : 0; },
    ambNumero: function (x) { var c = el(x); return c.numero ? txt(c.numero) : ((c.calc && c.calc.numeroAuto) || null); },
    ambSituacao: function (x) { var k = el(x).calc, E = { delimitado: "Delimitado", naoDelimitado: "Não delimitado", redundante: "Redundante" }; return k ? E[k.estado] || null : null; },
    ambRegra: function (x) { var k = el(x).calc; return k && k.regraNome ? k.regraNome : null; },
    faseNova: function () { return "Construção nova"; },
    /* P10 (js/bimopcoes.js): "Conjunto : Opção" (o replay põe em _opcaoNome); fora de opção, o modelo principal */
    opcaoDesenho: function (x) { var c = el(x); return c._opcaoNome ? txt(c._opcaoNome) : "Modelo principal"; }
  };
  /* CURVA — GANCHO: na parede curva, o Comprimento é o ARCO da linha de localização (a caixa
     guarda a corda) — js/bimcurva.js; a reta continua na conta de sempre */
  (function (C) {
    var reta = C.paredeComprimento;
    C.paredeComprimento = function (x) {
      var cA = el(x), BCa = cA && cA.arco ? dep("BimCurva", "./bimcurva.js") : null, La = BCa ? BCa.comprimentoLocalizacao(cA) : null;
      return La != null ? q4(x, La) : reta(x);
    };
  })(CALC);
  /* P11 — TERRENO (js/bimterreno.js): o terreno chega DERIVADO do replay
     (estado.terreno); estas funções só LEEM a peça. A régua de 4 casas do
     orçamento (q4) vale para as quantidades. */
  (function (C) {
    function v(x, k) { var e = el(x); return fin(e[k]) ? q4(x, e[k]) : null; }
    function br2(n) { return (Math.round(n * 100) / 100).toFixed(2).replace(".", ","); }
    C.topoAreaProj = function (x) { return v(x, "areaProjetada"); };
    C.topoAreaSup = function (x) { return v(x, "areaSuperficie"); };
    C.topoVolume = function (x) { return v(x, "volume"); };
    C.topoCotaMin = function (x) { return v(x, "cotaMin"); };
    C.topoCotaMax = function (x) { return v(x, "cotaMax"); };
    C.topoCotaFundo = function (x) { return v(x, "cotaFundo"); };
    C.topoEspessura = function (x) { return fin(el(x).espessura) ? el(x).espessura : null; };
    C.topoPasso = function (x) { return fin(el(x).passoCurvas) ? el(x).passoCurvas : null; };
    C.topoPontos = function (x) { return fin(el(x).nPontos) ? el(x).nPontos : null; };
    C.topoTriangulos = function (x) { return fin(el(x).nTriangulos) ? el(x).nTriangulos : null; };
    C.topoOrigem = function (x) { var o = el(x).origem; return o === "dxf" ? "Curvas de nível (DXF)" : (o === "csv" ? "Pontos do levantamento (CSV)" : "Pontos"); };
    C.terrenoMaterial = function (x) { return txt(el(x).material) || null; };
    C.terrenoHost = function (x) { return el(x).topoHost != null ? String(el(x).topoHost) : null; };
    C.terrenoNome = function (x) { return txt(el(x).nome) || null; };
    C.platDesloc = function (x) { return fin(el(x).deslocNivelEf) ? el(x).deslocNivelEf : 0; };
    C.platCota = function (x) { return v(x, "cota"); };
    C.platAreaProj = function (x) { return v(x, "areaProjetada"); };
    C.platPerimetro = function (x) { return v(x, "perimetro"); };
    C.platCorte = function (x) { return el(x).ok === false ? null : v(x, "corte"); };
    C.platAterro = function (x) { return el(x).ok === false ? null : v(x, "aterro"); };
    C.platLiquido = function (x) { return el(x).ok === false ? null : v(x, "liquido"); };
    C.platAreaCorte = function (x) { return v(x, "areaCorte"); };
    C.platAreaAterro = function (x) { return v(x, "areaAterro"); };
    C.platAreaFora = function (x) { return fin(el(x).areaFora) ? q4(x, el(x).areaFora) : 0; };
    C.platNivel = function (x) { return el(x).nivelNome || (x.nivel ? txt(x.nivel.nome) : null); };
    C.platSolo = function (x) {
      var s = el(x).solo; if (!s || !s.furo) return null;
      return "Furo " + s.furo.id + ": " + (arr(s.camadas).map(function (c) { return txt(c.nome) + " " + br2(c.volume) + " m³"; }).join("; ") || "corte acima das camadas");
    };
    C.divArea = function (x) { return v(x, "area"); };
    C.divPerimetro = function (x) { return v(x, "perimetro"); };
    C.divSegmentos = function (x) { return arr(el(x).segmentos).map(function (g) { return g.de + "-" + g.para + ": " + g.rumo + " " + br2(g.distancia) + " m"; }).join("; ") || null; };
    C.compTipo = function (x) { return txt(el(x).rotulo) || null; };
    C.compElevacao = function (x) { return v(x, "y"); };
    C.compAltura = function (x) { return fin(el(x).alturaEf) ? el(x).alturaEf : null; };
  })(CALC);
  /* volume dos sólidos avaliados da família — as mesmas fórmulas do
     js/ifcsaida.js (caixa, cilindro, extrusão de contorno) */
  function volumeSolidos(sol) {
    var v = 0, aberta = false;
    arr(sol).forEach(function (s) {
      if (s.forma === "malha") { if (s.volume == null) aberta = true; else v += num(s.volume, 0); }   /* FAMIMPORT: a malha da família importada (volume já medido no js/familiamalha.js; aberta = sem volume) */
      else if (s.forma === "caixa") v += num(s.dx, 0) * num(s.dy, 0) * num(s.dz, 0);
      else if (s.forma === "cilindro") v += Math.PI * num(s.raio, 0) * num(s.raio, 0) * num(s.altura, 0);
      else {
        var p = arr(s.contorno), a2 = 0;
        for (var i = 0; i < p.length; i++) { var u = p[i], w = p[(i + 1) % p.length]; a2 += u[0] * w[1] - w[0] * u[1]; }
        v += Math.abs(a2) / 2 * num(s.altura, 0);
      }
    });
    return aberta ? null : v;   /* FAMIMPORT: malha aberta não tem volume — vazio, não zero */
  }

  /* ============================================================ REGISTRO
   * P(lado, grupo, nome, id, dado, o): uma definição. o.calc = nome em CALC
   * (derivado); o.campo = onde mora na fonte (op/tipo). id = o
   * identificador do parâmetro (revit.bip) ou "RA_..." (sem equivalente). */
  function P(lado, grupo, nome, id, dado, o) {
    o = o || {};
    var d = {
      id: id, nome: nome, grupo: grupo, lado: lado === "t" ? "tipo" : "instancia", dado: dado,
      un: o.un != null ? o.un : (DADOS[dado] ? DADOS[dado].un : ""),
      leitura: o.leitura != null ? !!o.leitura : !!o.calc && !o.escrita,
      fonte: o.fonte || (o.calc ? "derivado" : (lado === "t" ? "tipo" : "op")),
      campo: o.campo || null, calc: o.calc || null,
      faixa: o.faixa || null, padrao: o.padrao != null ? o.padrao : null,
      opcoes: o.opcoes || null, casas: o.casas != null ? o.casas : null,
      ifc: o.ifc || null, orc: o.orc || null,
      tabela: o.tabela !== false, filtro: o.filtro !== false, identificador: !!o.identificador,
      escrita: o.escrita || null,
      revit: o.revit !== undefined ? o.revit : (/^RA_/.test(id) ? null : { bip: id })
    };
    return d;
  }
  var I = "i", T = "t";
  /* P3: parâmetro PT-BR que o inventário ainda não tem (telhado não coletado) */
  var PEND_TE = { bip: null, pendente: "P3 — telhado não coletado no inventário: nome PT-BR a conferir na próxima coleta do inventário" };
  function Q(pset, prop) { return { pset: pset, prop: prop }; }
  function O(medida) { return { quantidade: true, medida: medida }; }

  /* ---------------------------------------------------------- COMUM
     (B.1 do plano: valem para todas as categorias de modelo) */
  var COMUM = [
    P(I, "Dados de identidade", "Comentários", "ALL_MODEL_INSTANCE_COMMENTS", "texto", { campo: "comentarios", escrita: "marcar.comentarios", identificador: true, ifc: Q("OrcaPRO_Identidade", "Comentarios") }),
    P(I, "Dados de identidade", "Imagem", "ALL_MODEL_IMAGE", "texto", { campo: "imagem", escrita: "marcar.imagem", filtro: false }),
    P(I, "Dados de identidade", "Marca", "ALL_MODEL_MARK", "texto", { calc: "marca", escrita: "marcar.marca", leitura: false, identificador: true, ifc: { atributo: "Tag" } }),
    /* P10 (js/bimfases.js): as fases do PROJETO (op fases) — a paleta pede a lista a ele. No IFC,
       na estrutura IFC4 usual: Pset "Fases" (o nome do grupo), "Fase criada" sempre e "Fase demolida"
       só quando a peça é demolida */
    P(I, "Fases", "Fase criada", "PHASE_CREATED", "fase", { campo: "faseCriada", padrao: "Construção nova", opcoes: FASES, escrita: "marcar.faseCriada", ifc: Q("Fases", "Fase criada") }),
    P(I, "Fases", "Fase demolida", "PHASE_DEMOLISHED", "fase", { campo: "faseDemolida", padrao: "Nenhum", opcoes: ["Nenhum"].concat(FASES), escrita: "marcar.faseDemolida", ifc: { pset: "Fases", prop: "Fase demolida", omitir: "Nenhum" } }),
    /* P10 (js/bimopcoes.js): a opção de projeto da peça ("Conjunto : Opção"), de leitura */
    P(I, "Dados de identidade", "Opção de desenho", "DESIGN_OPTION_ID", "texto", { calc: "opcaoDesenho" }),
    P(I, "Outros", "Categoria", "ELEM_CATEGORY_PARAM", "texto", { calc: "categoriaNome" }),
    P(I, "Outros", "Família", "ELEM_FAMILY_PARAM", "texto", { calc: "familiaNome" }),
    P(I, "Outros", "Família e tipo", "ELEM_FAMILY_AND_TYPE_PARAM", "texto", { calc: "familiaETipo", escrita: "ajustarTipo.ids", leitura: false }),
    P(I, "Outros", "Tipo", "ELEM_TYPE_PARAM", "texto", { calc: "tipoNome", escrita: "ajustarTipo.ids", leitura: false, identificador: true }),
    P(I, "Outros", "ID de tipo", "SYMBOL_ID_PARAM", "texto", { calc: "tipoId", tabela: false }),
    P(I, "Parâmetros IFC", "Exportar para IFC", "IFC_EXPORT_ELEMENT", "texto", { calc: "ifcExporta", tabela: false }),
    P(I, "Parâmetros IFC", "Exportar para IFC como", "IFC_EXPORT_ELEMENT_AS", "texto", { calc: "ifcEntidade" }),
    P(I, "Parâmetros IFC", "IfcGUID", "IFC_GUID", "texto", { calc: "ifcGuid", filtro: false }),
    P(T, "Dados de identidade", "Nome do tipo", "SYMBOL_NAME_PARAM", "texto", { calc: "tipoNome", escrita: "ajustarTipo.nome", leitura: false, identificador: true }),
    P(T, "Dados de identidade", "Marca de tipo", "ALL_MODEL_TYPE_MARK", "texto", { calc: "marcaTipo", campo: "marcaTipo", escrita: "ajustarTipo.valores.marcaTipo", leitura: false, identificador: true, ifc: Q("OrcaPRO_Identidade", "MarcaTipo") }),
    P(T, "Dados de identidade", "Comentários de tipos", "ALL_MODEL_TYPE_COMMENTS", "texto", { campo: "comentariosTipo", escrita: "ajustarTipo.valores.comentariosTipo" }),
    P(T, "Dados de identidade", "Descrição", "ALL_MODEL_DESCRIPTION", "texto", { campo: "descricao", escrita: "ajustarTipo.valores.descricao", identificador: true }),
    P(T, "Dados de identidade", "Fabricante", "ALL_MODEL_MANUFACTURER", "texto", { campo: "fabricante", escrita: "ajustarTipo.valores.fabricante" }),
    P(T, "Dados de identidade", "Modelo", "ALL_MODEL_MODEL", "texto", { campo: "modelo", escrita: "ajustarTipo.valores.modelo" }),
    P(T, "Dados de identidade", "URL", "ALL_MODEL_URL", "texto", { campo: "url", escrita: "ajustarTipo.valores.url", filtro: false }),
    P(T, "Dados de identidade", "Nota-chave", "KEYNOTE_PARAM", "texto", { campo: "notaChave", escrita: "ajustarTipo.valores.notaChave" }),
    P(T, "Dados de identidade", "Tipo de imagem", "ALL_MODEL_TYPE_IMAGE", "texto", { campo: "imagemTipo", escrita: "ajustarTipo.valores.imagemTipo", filtro: false }),
    /* o código de orçamento do tipo (o preço NUNCA: vem da base vigente, regra 3) */
    P(T, "Dados de identidade", "Código de montagem", "ASSEMBLY_CODE", "texto", { campo: "codigoMontagem", escrita: "ajustarTipo.valores.codigoMontagem" }),
    P(T, "Outros", "Nome da família", "SYMBOL_FAMILY_NAME_PARAM", "texto", { calc: "familiaNome" }),
    /* MATERIAIS (09/10/2026, js/bimmateriais.js): o material DO PROJETO da peça — a cor no 3D, a
       aparência no render, o IfcMaterial e o padrão de corte na planta saem dele. Grava pela op
       `marcar` (um Ctrl+Z); vazio = o material da categoria, como antes. */
    P(I, "Materiais e acabamentos", "Material", "RA_MATERIAL_PROJETO", "materialProjeto", { calc: "materialProjeto", campo: "materialProj", escrita: "marcar.materialProj", leitura: false, filtro: false })
  ];
  /* o que fica DE FORA de propósito (o teste conta e mostra o motivo) */
  var FORA = {
    ALL_MODEL_COST: "Custo: o preço vem da base vigente no orçamento, nunca do tipo (orcmodelo.js, regra 3)",
    ASSEMBLY_DESCRIPTION: "Descrição de montagem: vem da base de composições, não do modelo"
  };

  /* --------------------------------------------------------- CATEGORIAS */
  var LIM_PAREDE = FAIXA.paredeAltura;
  var REG = {
    parede: {
      nome: "Paredes", ifc: "IFCWALL", inventario: "parede", familia: "Parede básica", prefixo: "PA", comum: true,
      defs: [
        /* P4: os 6 valores (BimArq.LINHAS_LOC); mudar NÃO move a parede — muda a referência */
        P(I, "Restrições", "Linha de localização", "WALL_KEY_REF_PARAM", "lista", { calc: "paredeLinhaLoc", escrita: "ajustar.linhaLoc", leitura: false,
          opcoes: ["Linha central da parede", "Linha central do núcleo", "Face de acabamento: Externa", "Face de acabamento: Interna", "Face do núcleo: externa", "Face do núcleo: interna"] }),
        P(I, "Restrições", "Restrição da base", "WALL_BASE_CONSTRAINT", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "ajustar.restricoes.nivelBase", leitura: false }),
        P(I, "Restrições", "Deslocamento da base", "WALL_BASE_OFFSET", "comprimento", { calc: "paredeDeslocBase", escrita: "ajustar.restricoes.deslocBase", leitura: false, orc: null }),
        P(I, "Restrições", "A base está anexada", "WALL_BOTTOM_IS_ATTACHED", "simnao", { calc: "falso" }),
        P(I, "Restrições", "Restrição superior", "WALL_HEIGHT_TYPE", "nivel", { calc: "paredeRestricaoSuperior", escrita: "ajustar.restricoes.restricaoSuperior", leitura: false }),
        P(I, "Restrições", "Altura não conectada", "WALL_USER_HEIGHT_PARAM", "comprimento", { campo: "altura", faixa: LIM_PAREDE, padrao: 2.8, ifc: Q("Qto_WallBaseQuantities", "Height"), escrita: "ajustar.restricoes.alturaNaoConectada" }),
        P(I, "Restrições", "Deslocamento superior", "WALL_TOP_OFFSET", "comprimento", { calc: "paredeDeslocSuperior", escrita: "ajustar.restricoes.deslocSuperior", leitura: false }),
        P(I, "Restrições", "O topo está anexado", "WALL_TOP_IS_ATTACHED", "simnao", { calc: "paredeTopoAnexado", escrita: "ajustar.anexarTopo", leitura: true }),
        /* P2-A: a parede fecha ambiente (js/bimambiente.js) — op delimitar */
        P(I, "Restrições", "Delimitação de ambientes", "WALL_ATTR_ROOM_BOUNDING", "simnao", { calc: "pecaDelimita", escrita: "delimitar.delimita", leitura: false }),
        P(I, "Cotas", "Comprimento", "CURVE_ELEM_LENGTH", "comprimento", { calc: "paredeComprimento", ifc: Q("Qto_WallBaseQuantities", "Length") }),
        P(I, "Cotas", "Área", "HOST_AREA_COMPUTED", "area", { calc: "paredeArea", ifc: Q("Qto_WallBaseQuantities", "NetSideArea"), orc: O("area") }),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", { calc: "paredeVolume", ifc: Q("Qto_WallBaseQuantities", "NetVolume"), orc: O("volume") }),
        /* RA: o que o inventário não tem num parâmetro e o orçamento usa. P1-D: toda
           medida do orçamento tem lugar no IFC — o mesmo número nos dois */
        P(I, "Cotas", "Área bruta", "RA_PAREDE_AREA_BRUTA", "area", { calc: "paredeAreaBruta", ifc: Q("Qto_WallBaseQuantities", "GrossSideArea"), orc: O("areaBruta") }),
        P(I, "Cotas", "Comprimento líquido", "RA_PAREDE_COMPRIMENTO_LIQ", "comprimento", { calc: "paredeComprimentoLiq", ifc: Q("OrcaPRO_Parede", "ComprimentoLiquido"), orc: O("comprimento") }),
        P(I, "Cotas", "Área da face externa", "RA_PAREDE_AREA_FORA", "area", { calc: "paredeAreaFora", ifc: Q("OrcaPRO_Parede", "AreaFaceFora"), orc: O("areaFora") }),
        P(I, "Cotas", "Área da face interna", "RA_PAREDE_AREA_DENTRO", "area", { calc: "paredeAreaDentro", ifc: Q("OrcaPRO_Parede", "AreaFaceDentro"), orc: O("areaDentro") }),
        P(I, "Cotas", "Área de fôrma", "RA_PAREDE_AREA_FORMA", "area", { calc: "paredeAreaForma", ifc: Q("OrcaPRO_Parede", "AreaForma"), orc: O("areaForma") }),
        P(I, "Cotas", "Área dos vãos", "RA_PAREDE_AREA_VAOS", "area", { calc: "paredeAreaVaos", ifc: Q("OrcaPRO_Parede", "AreaVaos") }),
        P(I, "Cotas", "Camadas (área por camada)", "RA_PAREDE_CAMADAS", "texto", { calc: "paredeCamadas", filtro: false }),
        /* P4: a área que as camadas ganham ao VIRAR (extremidades livres + requadro dos vãos), já somada nas faces */
        P(I, "Cotas", "Área virada das camadas", "RA_PAREDE_AREA_VIRADA", "area", { calc: "paredeAreaVirada", ifc: Q("OrcaPRO_Parede", "AreaVirada") }),
        /* P4: material por face (Pintar) — a área de cada região vai ao orçamento (js/bimpintar.js) */
        P(I, "Materiais e acabamentos", "Área pintada", "RA_PAREDE_AREA_PINTADA", "area", { calc: "areaPintada", ifc: Q("OrcaPRO_Pintura", "AreaPintada") }),
        P(I, "Materiais e acabamentos", "Pintura (faces)", "RA_PAREDE_PINTURA", "texto", { calc: "pinturaTexto", filtro: false, ifc: Q("OrcaPRO_Pintura", "Faces") }),
        /* P4: unir geometria (quem corta quem) */
        P(I, "Outros", "Unida a (geometria)", "RA_UNIAO_GEOMETRIA", "texto", { calc: "uniaoGeo", filtro: false }),
        /* EMBREVE — GRAUTE E ARMADURA (js/bimgraute.js, op graute): alvenaria estrutural.
           Espaçamento, transpasse e área do furo são PARÂMETROS do projeto (padrão marcado
           "conferir NBR 16868-1"); o volume e o aço são o que o motor calculou. IFC: Pset
           OrcaPRO_Graute na própria parede (o leitor de IFC mostra sem precisar de geometria). */
        P(I, "Estrutural", "Alvenaria estrutural (graute e armadura)", "RA_GRAUTE_ATIVO", "simnao", { calc: "grauteAtivo", escrita: "graute.ativo", leitura: false, ifc: { pset: "OrcaPRO_Graute", prop: "AlvenariaEstrutural", omitir: false } }),
        P(I, "Estrutural", "Família do bloco (furos)", "RA_GRAUTE_FAMILIA", "lista", { calc: "grauteFamilia", escrita: "graute.familia", leitura: false, opcoes: ["29", "39-14", "39-19"], ifc: Q("OrcaPRO_Graute", "FamiliaBloco") }),
        P(I, "Estrutural", "Espaçamento máximo do graute", "RA_GRAUTE_ESPACAMENTO", "comprimento", { calc: "grauteEspacamento", escrita: "graute.espacamento", leitura: false, faixa: { min: 0.15, max: 6 }, ifc: Q("OrcaPRO_Graute", "EspacamentoMaximo") }),
        P(I, "Estrutural", "Bitola da armadura vertical", "RA_GRAUTE_BITOLA", "lista", { calc: "grauteBitola", escrita: "graute.bitola", leitura: false, opcoes: ["6,3 mm", "8,0 mm", "10,0 mm", "12,5 mm", "16,0 mm", "20,0 mm"], ifc: Q("OrcaPRO_Graute", "Bitola") }),
        P(I, "Estrutural", "Barras por ponto", "RA_GRAUTE_BARRAS", "inteiro", { calc: "grauteBarras", escrita: "graute.barras", leitura: false, faixa: { min: 0, max: 4 }, ifc: Q("OrcaPRO_Graute", "BarrasPorPonto") }),
        P(I, "Estrutural", "fgk do graute", "RA_GRAUTE_FGK", "lista", { calc: "grauteFgk", escrita: "graute.fgk", leitura: false, opcoes: ["15 MPa", "20 MPa", "25 MPa", "30 MPa", "35 MPa"], ifc: Q("OrcaPRO_Graute", "Fgk") }),
        P(I, "Estrutural", "Transpasse da armadura (× φ)", "RA_GRAUTE_TRANSPASSE", "numero", { calc: "grauteTranspasse", escrita: "graute.transpasse", leitura: false, faixa: { min: 0, max: 100 }, casas: 1, ifc: Q("OrcaPRO_Graute", "TranspasseVezesDiametro") }),
        P(I, "Estrutural", "Área do furo", "RA_GRAUTE_AREA_FURO", "area", { calc: "grauteAreaFuro", escrita: "graute.areaFuro", leitura: false, faixa: { min: 0.001, max: 0.1 }, casas: 4, ifc: Q("OrcaPRO_Graute", "AreaFuro") }),
        P(I, "Estrutural", "Pontos grauteados", "RA_GRAUTE_PONTOS", "inteiro", { calc: "grautePontos", ifc: Q("OrcaPRO_Graute", "PontosGrauteados") }),
        P(I, "Estrutural", "Volume de graute", "RA_GRAUTE_VOLUME", "volume", { calc: "grauteVolume", casas: 4, ifc: Q("OrcaPRO_Graute", "VolumeGraute") }),
        P(I, "Estrutural", "Comprimento da armadura vertical", "RA_GRAUTE_ACO_COMPRIMENTO", "comprimento", { calc: "grauteAcoComprimento", ifc: Q("OrcaPRO_Graute", "ComprimentoArmadura") }),
        P(I, "Estrutural", "Peso da armadura vertical", "RA_GRAUTE_ACO_PESO", "massa", { calc: "grauteAcoPeso", ifc: Q("OrcaPRO_Graute", "PesoArmadura") }),
        P(I, "Estrutural", "Graute: valores a conferir", "RA_GRAUTE_CONFERIR", "texto", { calc: "grauteConferir", filtro: false }),
        P(T, "Construção", "Estrutura", "WALL_STRUCTURE_ID_PARAM", "texto", { calc: "paredeEstrutura", escrita: "ajustar.tipoParede", leitura: false }),
        P(T, "Construção", "Largura", "WALL_ATTR_WIDTH_PARAM", "comprimento", { calc: "paredeLargura", ifc: Q("Qto_WallBaseQuantities", "Width") }),
        /* P4: virar camadas — do TIPO ("Editar tipo" muda todas as instâncias) */
        P(T, "Construção", "Virar nas extremidades", "WRAPPING_AT_ENDS_PARAM", "lista", { calc: "paredeVirarExt", campo: "virarExtremidades", escrita: "ajustarTipo.valores.virarExtremidades", leitura: false, opcoes: ["Nenhum", "Exterior", "Interior"] }),
        P(T, "Construção", "Virar nas inserções", "WRAPPING_AT_INSERTS_PARAM", "lista", { calc: "paredeVirarIns", campo: "virarInsercoes", escrita: "ajustarTipo.valores.virarInsercoes", leitura: false, opcoes: ["Não virar", "Exterior", "Interior", "Ambos"] }),
        P(T, "Construção", "Função", "FUNCTION_PARAM", "lista", { campo: "funcao", padrao: "Exterior", opcoes: ["Interior", "Exterior"], escrita: "ajustarTipo.valores.funcao", ifc: Q("Pset_WallCommon", "IsExternal") }),
        P(T, "Materiais e acabamentos", "Material estrutural", "STRUCTURAL_MATERIAL_PARAM", "material", { calc: "paredeMaterialNucleo" })
      ]
    },
    laje: {
      nome: "Pisos", ifc: "IFCSLAB", inventario: "piso_laje", familia: "Piso", prefixo: "L", comum: true,
      defs: [
        P(I, "Restrições", "Nível", "LEVEL_PARAM", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "ajustar.restricoes.nivelBase", leitura: false }),
        P(I, "Restrições", "Altura do deslocamento do nível", "FLOOR_HEIGHTABOVELEVEL_PARAM", "comprimento", { calc: "lajeDeslocNivel", escrita: "ajustar.restricoes.deslocBase", leitura: false }),
        P(I, "Cotas", "Elevação no topo", "STRUCTURAL_ELEVATION_AT_TOP", "comprimento", { calc: "lajeTopo" }),
        P(I, "Cotas", "Elevação no núcleo superior", "STRUCTURAL_ELEVATION_AT_TOP_CORE", "comprimento", { calc: "lajeTopo" }),
        P(I, "Cotas", "Elevação no núcleo inferior", "STRUCTURAL_ELEVATION_AT_BOTTOM_CORE", "comprimento", { calc: "lajeFundo" }),
        P(I, "Cotas", "Elevação na parte inferior", "STRUCTURAL_ELEVATION_AT_BOTTOM", "comprimento", { calc: "lajeFundo" }),
        P(I, "Cotas", "Espessura", "FLOOR_ATTR_THICKNESS_PARAM", "comprimento", { calc: "lajeEspessura", ifc: Q("Qto_SlabBaseQuantities", "Width") }),
        P(I, "Cotas", "Perímetro", "HOST_PERIMETER_COMPUTED", "comprimento", { calc: "lajePerimetro", ifc: Q("Qto_SlabBaseQuantities", "Perimeter"), orc: O("comprimento") }),
        P(I, "Cotas", "Área", "HOST_AREA_COMPUTED", "area", { calc: "lajeArea", ifc: Q("Qto_SlabBaseQuantities", "NetArea"), orc: O("area") }),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", { calc: "lajeVolume", ifc: Q("Qto_SlabBaseQuantities", "NetVolume"), orc: O("volume") }),
        P(I, "Cotas", "Área dos furos", "RA_LAJE_AREA_FUROS", "area", { calc: "lajeAreaFuros", ifc: Q("OrcaPRO_Laje", "AreaFuros") }),
        P(I, "Cotas", "Área de fôrma", "RA_LAJE_AREA_FORMA", "area", { calc: "lajeAreaForma", ifc: Q("OrcaPRO_Laje", "AreaForma"), orc: O("areaForma") }),
        /* P4: pintura por face (topo/fundo) e união de geometria */
        P(I, "Materiais e acabamentos", "Área pintada", "RA_LAJE_AREA_PINTADA", "area", { calc: "areaPintada", ifc: Q("OrcaPRO_Pintura", "AreaPintada") }),
        P(I, "Materiais e acabamentos", "Pintura (faces)", "RA_LAJE_PINTURA", "texto", { calc: "pinturaTexto", filtro: false, ifc: Q("OrcaPRO_Pintura", "Faces") }),
        P(I, "Outros", "Unida a (geometria)", "RA_UNIAO_GEOMETRIA", "texto", { calc: "uniaoGeo", filtro: false }),
        P(T, "Construção", "Estrutura", "FLOOR_STRUCTURE_ID_PARAM", "texto", { calc: "lajeEstrutura" }),
        P(T, "Construção", "Espessura-padrão", "FLOOR_ATTR_DEFAULT_THICKNESS_PARAM", "comprimento", { calc: "lajeEspessura", campo: "espessura", escrita: "ajustarTipo.valores.espessura", leitura: false, faixa: FAIXA.lajeEspessura }),
        P(T, "Construção", "Função", "FUNCTION_PARAM", "lista", { campo: "funcao", padrao: "Interior", opcoes: ["Interior", "Exterior"], escrita: "ajustarTipo.valores.funcao" }),
        P(T, "Materiais e acabamentos", "Material estrutural", "STRUCTURAL_MATERIAL_PARAM", "material", { calc: "concretoArmado" })
      ]
    },
    pilar: {
      nome: "Pilares estruturais", ifc: "IFCCOLUMN", inventario: "pilar_estrutural", familia: "Pilar por perfil", prefixo: "P", comum: true,
      defs: [
        P(I, "Restrições", "Nível base", "FAMILY_BASE_LEVEL_PARAM", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "ajustar.restricoes.nivelBase", leitura: false }),
        P(I, "Restrições", "Deslocamento da base", "FAMILY_BASE_LEVEL_OFFSET_PARAM", "comprimento", { calc: "pilarDeslocBase", escrita: "ajustar.restricoes.deslocBase", leitura: false }),
        P(I, "Restrições", "Nível superior", "FAMILY_TOP_LEVEL_PARAM", "nivel", { calc: "pilarNivelSup", escrita: "ajustar.restricoes.restricaoSuperior", leitura: false }),
        P(I, "Restrições", "Deslocamento superior", "FAMILY_TOP_LEVEL_OFFSET_PARAM", "comprimento", { calc: "pilarDeslocSup", escrita: "ajustar.restricoes.deslocSuperior", leitura: false }),
        P(I, "Restrições", "Altura do pilar", "RA_PILAR_ALTURA", "comprimento", { campo: "altura", faixa: FAIXA.pilarAltura, escrita: "ajustar.restricoes.alturaNaoConectada" }),
        /* P2-A: o pilar ESTRUTURAL não tem este parâmetro (não
           está no inventário); no OrçaPRO ele delimita ambiente (padrão sim):
           o piso não passa por dentro do pilar — divergência declarada */
        P(I, "Restrições", "Delimitação de ambientes", "RA_PILAR_DELIMITA", "simnao", { calc: "pecaDelimita", escrita: "delimitar.delimita", leitura: false }),
        P(I, "Materiais e acabamentos", "Material estrutural", "STRUCTURAL_MATERIAL_PARAM", "material", { calc: "materialRotulo", escrita: "ajustarTipo.valores.material", leitura: false }),
        /* P1-D: o NetWeight do IFC é o PESO EXATO (a geometria modelada × massa
           específica) — o mesmo número que o orçamento usa na medida "massa"; o
           Peso pela área do catálogo vai em OrcaPRO_Perfil.Peso */
        P(I, "Estrutural", "Peso", "STEEL_ELEM_WEIGHT", "massa", { calc: "acoPeso", ifc: Q("OrcaPRO_Perfil", "Peso") }),
        P(I, "Estrutural", "Peso exato", "STEEL_ELEM_EXACT_WEIGHT", "massa", { calc: "acoPesoExato", ifc: Q("Qto_ColumnBaseQuantities", "NetWeight"), orc: O("massa") }),
        P(I, "Estrutural", "Área de pintura", "STEEL_ELEM_PAINT_AREA", "area", { calc: "acoAreaPintura", ifc: Q("Qto_ColumnBaseQuantities", "OuterSurfaceArea"), orc: O("areaForma") }),
        P(I, "Cotas", "Comprimento do sistema", "INSTANCE_LENGTH_PARAM", "comprimento", { calc: "pilarComprimento", ifc: Q("Qto_ColumnBaseQuantities", "Length"), orc: O("comprimento") }),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", { calc: "pecaVolume", ifc: Q("Qto_ColumnBaseQuantities", "NetVolume"), orc: O("volume") }),
        P(I, "Cotas", "Área de fôrma", "RA_PECA_AREA_FORMA", "area", { calc: "concretoAreaForma", ifc: Q("OrcaPRO_Perfil", "AreaForma"), orc: O("areaForma") }),
        P(I, "Cotas", "Área de superfície", "RA_PECA_AREA_SUPERFICIE", "area", { calc: "madeiraAreaSuperficie", ifc: Q("OrcaPRO_Perfil", "AreaForma"), orc: O("areaForma") }),
        P(I, "Outros", "Unida a (geometria)", "RA_UNIAO_GEOMETRIA", "texto", { calc: "uniaoGeo", filtro: false })   /* P4 */
      ].concat(defsSecao("Qto_ColumnBaseQuantities"))
    },
    viga: {
      nome: "Quadro estrutural", ifc: "IFCBEAM", inventario: "viga", familia: "Viga por perfil", prefixo: "V", comum: true,
      defs: [
        P(I, "Restrições", "Nível de referência", "INSTANCE_REFERENCE_LEVEL_PARAM", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "ajustar.restricoes.nivelBase", leitura: false }),
        P(I, "Restrições", "Elevação do nível de referência", "STRUCTURAL_REFERENCE_LEVEL_ELEVATION", "comprimento", { calc: "vigaElevNivel" }),
        P(I, "Restrições", "Plano de trabalho", "SKETCH_PLANE_PARAM", "texto", { calc: "vigaPlano" }),
        P(I, "Restrições", "Deslocamento do nível inicial", "STRUCTURAL_BEAM_END0_ELEVATION", "comprimento", { calc: "vigaDeslocNivel", escrita: "ajustar.restricoes.deslocBase", leitura: false }),
        P(I, "Restrições", "Deslocamento do nível final", "STRUCTURAL_BEAM_END1_ELEVATION", "comprimento", { calc: "vigaDeslocNivel", escrita: "ajustar.restricoes.deslocBase", leitura: false }),
        P(I, "Posição geométrica", "Justificação z", "Z_JUSTIFICATION", "texto", { calc: "vigaJustZ" }),
        P(I, "Materiais e acabamentos", "Material estrutural", "STRUCTURAL_MATERIAL_PARAM", "material", { calc: "materialRotulo", escrita: "ajustarTipo.valores.material", leitura: false }),
        P(I, "Estrutural", "Peso", "STEEL_ELEM_WEIGHT", "massa", { calc: "acoPeso", ifc: Q("OrcaPRO_Perfil", "Peso") }),
        P(I, "Estrutural", "Peso exato", "STEEL_ELEM_EXACT_WEIGHT", "massa", { calc: "acoPesoExato", ifc: Q("Qto_BeamBaseQuantities", "NetWeight"), orc: O("massa") }),
        P(I, "Estrutural", "Área de pintura", "STEEL_ELEM_PAINT_AREA", "area", { calc: "acoAreaPintura", ifc: Q("Qto_BeamBaseQuantities", "OuterSurfaceArea"), orc: O("areaForma") }),
        P(I, "Cotas", "Comprimento do corte", "STRUCTURAL_FRAME_CUT_LENGTH", "comprimento", { calc: "vigaCorte", ifc: Q("Qto_BeamBaseQuantities", "Length"), orc: O("comprimento") }),
        P(I, "Cotas", "Comprimento do sistema", "INSTANCE_LENGTH_PARAM", "comprimento", { calc: "vigaSistema" }),
        P(I, "Cotas", "Elevação no topo", "STRUCTURAL_ELEVATION_AT_TOP", "comprimento", { calc: "vigaTopo" }),
        P(I, "Cotas", "Elevação na parte inferior", "STRUCTURAL_ELEVATION_AT_BOTTOM", "comprimento", { calc: "vigaFundo" }),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", { calc: "pecaVolume", ifc: Q("Qto_BeamBaseQuantities", "NetVolume"), orc: O("volume") }),
        P(I, "Cotas", "Área de fôrma", "RA_PECA_AREA_FORMA", "area", { calc: "concretoAreaForma", ifc: Q("OrcaPRO_Perfil", "AreaForma"), orc: O("areaForma") }),
        P(I, "Cotas", "Área de superfície", "RA_PECA_AREA_SUPERFICIE", "area", { calc: "madeiraAreaSuperficie", ifc: Q("OrcaPRO_Perfil", "AreaForma"), orc: O("areaForma") }),
        P(I, "Outros", "Unida a (geometria)", "RA_UNIAO_GEOMETRIA", "texto", { calc: "uniaoGeo", filtro: false })   /* P4 */
      ].concat(defsSecao("Qto_BeamBaseQuantities"))
    },
    escada: {
      nome: "Escadas", ifc: "IFCSTAIR", inventario: "escada", familia: "Escada moldada", prefixo: "E", comum: true,
      defs: [
        P(I, "Restrições", "Nível base", "STAIRS_BASE_LEVEL_PARAM", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "ajustar.restricoes.nivelBase", leitura: false }),
        P(I, "Restrições", "Deslocamento da base", "STAIRS_BASE_OFFSET", "comprimento", { calc: "escadaDeslocBase", escrita: "ajustar.escada.base", leitura: false }),
        P(I, "Restrições", "Nível superior", "STAIRS_TOP_LEVEL_PARAM", "nivel", { calc: "escadaNivelSup", escrita: "ajustar.restricoes.restricaoSuperior", leitura: false }),
        P(I, "Restrições", "Altura desejada da escada", "STAIRS_STAIRS_HEIGHT", "comprimento", { calc: "escadaDesnivel", escrita: "ajustar.escada.desnivel", leitura: false, faixa: FAIXA.escadaDesnivel }),
        P(I, "Cotas", "Número desejado de espelhos", "STAIRS_DESIRED_NUMBER_OF_RISERS", "inteiro", { calc: "escadaNDesejado", escrita: "ajustar.escada.n", leitura: false }),
        /* P1-D: "un" no orçamento é a CONTAGEM da peça (1 por escada, como o
           BimEdit.medidasDe sempre deu), não o número de espelhos — o
           orçamento conta a peça sem parâmetro (js/orcmodelo.js, CONTAGEM) */
        P(I, "Cotas", "Número real de espelhos", "STAIRS_ACTUAL_NUM_RISERS", "inteiro", { calc: "escadaN", ifc: Q("Pset_StairCommon", "NumberOfRiser") }),
        P(I, "Cotas", "Altura real do espelho", "STAIRS_ACTUAL_RISER_HEIGHT", "comprimento", { calc: "escadaE", ifc: Q("Pset_StairCommon", "RiserHeight") }),
        P(I, "Cotas", "Profundidade real do piso", "STAIRS_ACTUAL_TREAD_DEPTH", "comprimento", { calc: "escadaP", escrita: "ajustar.escada.piso", leitura: false, ifc: Q("Pset_StairCommon", "TreadLength") }),
        P(I, "Cotas", "Largura do lance", "RA_ESCADA_LARGURA", "comprimento", { calc: "escadaLargura", escrita: "ajustar.escada.largura", leitura: false, faixa: FAIXA.escadaLargura }),
        P(I, "Cotas", "Número de pisos", "RA_ESCADA_PISOS", "inteiro", { calc: "escadaPisos", ifc: Q("Pset_StairCommon", "NumberOfTreads") }),
        P(I, "Cotas", "Volume", "RA_ESCADA_VOLUME", "volume", { calc: "escadaVolume", ifc: Q("OrcaPRO_Escada", "Volume"), orc: O("volume") }),
        P(I, "Cotas", "Área de piso", "RA_ESCADA_AREA_PISO", "area", { calc: "escadaAreaPiso", ifc: Q("OrcaPRO_Escada", "AreaPiso"), orc: O("area") }),
        P(I, "Cotas", "Área de espelho", "RA_ESCADA_AREA_ESPELHO", "area", { calc: "escadaAreaEspelho", ifc: Q("OrcaPRO_Escada", "AreaEspelho") }),
        P(I, "Cotas", "Área de fôrma", "RA_ESCADA_AREA_FORMA", "area", { calc: "escadaAreaForma", ifc: Q("OrcaPRO_Escada", "AreaForma"), orc: O("areaForma") }),
        P(I, "Cotas", "Comprimento do percurso", "RA_ESCADA_PERCURSO", "comprimento", { calc: "escadaPercurso", ifc: Q("OrcaPRO_Escada", "Comprimento"), orc: O("comprimento") }),
        P(T, "Regras de cálculo", "Altura máxima do espelho", "STAIRS_ATTR_MAX_RISER_HEIGHT", "comprimento", { calc: "escadaEmax", campo: "emax", escrita: "ajustarTipo.valores.emax", leitura: false, faixa: FAIXA.escadaEmax }),
        P(T, "Regras de cálculo", "Profundidade mínima do piso", "STAIRS_ATTR_MINIMUM_TREAD_DEPTH", "comprimento", { calc: "escadaPmin", campo: "pmin", escrita: "ajustarTipo.valores.pmin", leitura: false, faixa: FAIXA.escadaPmin }),
        P(T, "Regras de cálculo", "Largura mínima do lance", "STAIRSTYPE_MINIMUM_RUN_WIDTH", "comprimento", { calc: "escadaLarguraMin", campo: "larguraMin", escrita: "ajustarTipo.valores.larguraMin", leitura: false }),
        P(T, "Regras de cálculo", "Regras de cálculo", "STAIRSTYPE_CALCULATION_RULES", "texto", { calc: "escadaRegra" }),
        P(T, "Construção", "Tipo de trecho", "STAIRSTYPE_RUN_TYPE", "texto", { calc: "escadaTrecho" }),
        P(T, "Construção", "Tipo de segmento de conexão", "STAIRSTYPE_LANDING_TYPE", "texto", { calc: "escadaPatamarTipo" }),
        P(T, "Construção", "Função", "FUNCTION_PARAM", "lista", { campo: "funcao", padrao: "Interior", opcoes: ["Interior", "Exterior"], escrita: "ajustarTipo.valores.funcao" })
      ]
    },
    /* lance e patamar: peças VIRTUAIS da escada (listadas à parte;
       aqui saem do mesmo BimArq.escada) — só leitura, sem marca própria */
    lance: {
      nome: "Escadas: Lances", ifc: "IFCSTAIRFLIGHT", inventario: "lance_escada", familia: "Lance monolítico", prefixo: null, comum: "leitura", virtual: true,
      defs: [
        P(I, "Construção", "Começar com espelho", "STAIRS_RUN_BEGIN_WITH_RISER", "simnao", { calc: "verdadeiro" }),
        P(I, "Construção", "Finalizar com espelho", "STAIRS_RUN_END_WITH_RISER", "simnao", { calc: "verdadeiro" }),
        P(I, "Restrições", "Linha de localização", "STAIRS_RUN_LOCATIONPATH_JUSTFICATION", "texto", { calc: "lanceLocalizacao" }),
        P(I, "Restrições", "Altura da base relativa", "STAIRS_RUN_BOTTOM_ELEVATION", "comprimento", { calc: "lanceBaseRel" }),
        P(I, "Restrições", "Altura da parte superior relativa", "STAIRS_RUN_TOP_ELEVATION", "comprimento", { calc: "lanceTopoRel" }),
        P(I, "Restrições", "Altura do trecho", "STAIRS_RUN_HEIGHT", "comprimento", { calc: "lanceAltura" }),
        P(I, "Cotas", "Largura real do lance", "STAIRS_RUN_ACTUAL_RUN_WIDTH", "comprimento", { calc: "lanceLargura" }),
        P(I, "Cotas", "Número real de espelhos", "STAIRS_RUN_ACTUAL_NUMBER_OF_RISERS", "inteiro", { calc: "lanceK", ifc: Q("Pset_StairFlightCommon", "NumberOfRiser") }),
        P(I, "Cotas", "Número real de pisos", "STAIRS_RUN_ACTUAL_NUMBER_OF_TREADS", "inteiro", { calc: "lancePisos", ifc: Q("Pset_StairFlightCommon", "NumberOfTreads") }),
        P(I, "Cotas", "Altura real do espelho", "STAIRS_RUN_ACTUAL_RISER_HEIGHT", "comprimento", { calc: "escadaE", ifc: Q("Pset_StairFlightCommon", "RiserHeight") }),
        P(I, "Cotas", "Profundidade real do piso", "STAIRS_RUN_ACTUAL_TREAD_DEPTH", "comprimento", { calc: "escadaP", ifc: Q("Pset_StairFlightCommon", "TreadLength") }),
        P(I, "Cotas", "Volume", "RA_LANCE_VOLUME", "volume", { calc: "lanceVolume", ifc: Q("Qto_StairFlightBaseQuantities", "NetVolume") })
      ]
    },
    patamar: {
      nome: "Escadas: Patamares", ifc: "IFCSLAB", inventario: "patamar", familia: "Patamar de laje maciça", prefixo: null, comum: "leitura", virtual: true,
      defs: [
        P(I, "Restrições", "Altura relativa", "STAIRS_LANDING_BASE_ELEVATION", "comprimento", { calc: "patamarAltura" }),
        P(I, "Cotas", "Espessura total", "STAIRS_LANDING_THICKNESS", "comprimento", { calc: "patamarEspessura", ifc: Q("Qto_SlabBaseQuantities", "Width") }),
        P(I, "Cotas", "Área", "RA_PATAMAR_AREA", "area", { calc: "patamarArea", ifc: Q("Qto_SlabBaseQuantities", "NetArea") }),
        P(I, "Cotas", "Volume", "RA_PATAMAR_VOLUME", "volume", { calc: "patamarVolume", ifc: Q("Qto_SlabBaseQuantities", "NetVolume") })
      ]
    },
    guarda: {
      nome: "Guarda-corpos", ifc: "IFCRAILING", inventario: "guarda_corpo", familia: "Guarda-corpo", prefixo: "GC", comum: true,
      defs: [
        P(I, "Restrições", "Nível base", "STAIRS_RAILING_BASE_LEVEL_PARAM", "nivel", { calc: "nivelNome" }),
        P(I, "Restrições", "Deslocamento da base", "STAIRS_RAILING_HEIGHT_OFFSET", "comprimento", { calc: "guardaDeslocBase" }),
        P(I, "Cotas", "Comprimento", "CURVE_ELEM_LENGTH", "comprimento", { calc: "guardaComprimento", ifc: Q("Qto_RailingBaseQuantities", "Length"), orc: O("comprimento") }),
        P(I, "Cotas", "Montantes", "RA_GUARDA_MONTANTES", "inteiro", { calc: "guardaMontantes", ifc: Q("OrcaPRO_GuardaCorpo", "Montantes") }),
        P(I, "Cotas", "Comprimento dos montantes", "RA_GUARDA_COMP_MONTANTES", "comprimento", { calc: "guardaCompMontantes", ifc: Q("OrcaPRO_GuardaCorpo", "ComprimentoMontantes") }),
        P(I, "Cotas", "Área", "RA_GUARDA_AREA", "area", { calc: "guardaArea", ifc: Q("OrcaPRO_GuardaCorpo", "Area"), orc: O("area") }),
        P(T, "Construção", "Altura do guarda-corpo", "STAIRS_RAILING_HEIGHT", "comprimento", { calc: "guardaAltura", ifc: Q("Pset_RailingCommon", "Height") }),
        P(T, "Construção", "Colocação do balaústre", "STAIRS_RAILING_BALUSTER_PLACEMENT", "texto", { calc: "guardaColocacao" }),
        P(T, "Construção", "Vão máximo entre montantes", "RA_GUARDA_ESPAC", "comprimento", { calc: "guardaEspac", campo: "espac", escrita: "ajustarTipo.valores.espac", leitura: false, faixa: FAIXA.guardaEspac }),
        P(T, "Corrimão superior", "Usar guarda-corpo superior", "RAILING_SYSTEM_HAS_TOP_RAIL", "simnao", { calc: "verdadeiro" }),
        P(T, "Corrimão superior", "Altura", "RAILING_SYSTEM_TOP_RAIL_HEIGHT_PARAM", "comprimento", { calc: "guardaAltura", campo: "altura", escrita: "ajustarTipo.valores.altura", leitura: false, faixa: FAIXA.guardaAltura }),
        P(T, "Corrimão superior", "Tipo", "RAILING_SYSTEM_TOP_RAIL_TYPES_PARAM", "texto", { calc: "guardaCorrimao" })
      ]
    },
    /* TELHADO: não foi possível coletar (B.3). Só leva bip o que o inventário confirma em outra categoria
       com o mesmo nome e grupo (Área, Volume, Inclinação); o resto é RA_ e
       revit.pendente até a coleta. */
    cobertura: {
      nome: "Telhados", ifc: "IFCROOF", inventario: null, familia: "Cobertura por águas", prefixo: "C", comum: true,
      defs: [
        P(I, "Restrições", "Nível base", "RA_COB_NIVEL_BASE", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "ajustar.restricoes.nivelBase", leitura: false, revit: { bip: null, pendente: "B.3 — telhado a coletar" } }),
        P(I, "Restrições", "Deslocamento da base do nível", "RA_COB_DESLOC_BASE", "comprimento", { calc: "cobDeslocBase", escrita: "ajustar.restricoes.deslocBase", leitura: false, revit: { bip: null, pendente: "B.3 — telhado a coletar" } }),
        P(I, "Cotas", "Inclinação", "ROOF_SLOPE", "inclinacao", { calc: "cobInclinacao", faixa: FAIXA.coberturaInclinacao }),
        P(I, "Cotas", "Espessura", "RA_COB_ESPESSURA", "comprimento", { calc: "cobEspessura", faixa: FAIXA.coberturaEspessura, revit: { bip: null, pendente: "B.3 — telhado a coletar" } }),
        P(I, "Cotas", "Beiral", "RA_COB_BEIRAL", "comprimento", { calc: "cobBeiral", faixa: FAIXA.coberturaBeiral }),
        P(I, "Cotas", "Número de águas", "RA_COB_AGUAS", "inteiro", { calc: "cobAguas" }),
        P(I, "Cotas", "Área", "HOST_AREA_COMPUTED", "area", { calc: "cobArea", ifc: Q("Qto_RoofBaseQuantities", "NetArea"), orc: O("area") }),
        P(I, "Cotas", "Área de projeção", "RA_COB_AREA_PROJECAO", "area", { calc: "cobProjecao", ifc: Q("Qto_RoofBaseQuantities", "ProjectedArea"), orc: O("areaProjecao") }),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", { calc: "cobVolume", ifc: Q("OrcaPRO_Cobertura", "Volume"), orc: O("volume") }),
        P(I, "Cotas", "Comprimento da cumeeira", "RA_COB_CUMEEIRA", "comprimento", { calc: "cobCumeeira", ifc: Q("OrcaPRO_Cobertura", "ComprimentoCumeeira"), orc: O("comprimento") })
      ]
    },
    /* P2-B — FORRO (inventário "forro", forro básico
       "Genérico"). O inventário coletou o forro BÁSICO (sem espessura): o
       Volume e a Espessura/Estrutura do forro COMPOSTO não estão nele e
       ficam pendentes até a próxima coleta do inventário
       (que também lista os parâmetros do composto). */
    forro: {
      nome: "Forros", ifc: "IFCCOVERING", inventario: "forro", familia: "Forro composto", prefixo: "FO", comum: true,
      defs: [
        P(I, "Restrições", "Nível", "LEVEL_PARAM", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "forro.nivelId", leitura: false }),
        P(I, "Restrições", "Altura do deslocamento do nível", "CEILING_HEIGHTABOVELEVEL_PARAM", "comprimento", { calc: "forroDeslocNivel", escrita: "forro.deslocNivel", leitura: false, padrao: 2.6, faixa: FAIXA.forroDesloc }),
        /* o nome, o grupo e o BIP do inventário (elementos.forro.instancia: "Delimitação de ambientes",
           Restrições, WALL_ATTR_ROOM_BOUNDING, padrão Sim). Ligado, o forro CORTA O VOLUME do ambiente
           (medido na referência de 09/10/2026: 18,6725 × 2,60 = 48,5485 m³ no lugar de × 2,80) */
        P(I, "Restrições", "Delimitação de ambientes", "WALL_ATTR_ROOM_BOUNDING", "simnao", { calc: "pecaDelimita", escrita: "forro.delimitaAmbiente", leitura: false, padrao: true }),
        P(I, "Restrições", "Contorno", "RA_FORRO_MODO", "texto", { calc: "forroModo" }),
        P(I, "Cotas", "Inclinação", "ROOF_SLOPE", "angulo", { calc: "forroInclinacao", escrita: "forro.inclinacao", leitura: false, faixa: FAIXA.forroInclinacao }),
        P(I, "Cotas", "Direção da inclinação", "RA_FORRO_DIR_INCLINACAO", "angulo", { calc: "forroDirInclinacao", escrita: "forro.dirInclinacao", leitura: false }),
        P(I, "Cotas", "Perímetro", "HOST_PERIMETER_COMPUTED", "comprimento", { calc: "forroPerimetro", ifc: Q("OrcaPRO_Forro", "Perimetro"), orc: O("comprimento") }),
        P(I, "Cotas", "Área", "HOST_AREA_COMPUTED", "area", { calc: "forroArea", ifc: Q("Qto_CoveringBaseQuantities", "NetArea"), orc: O("area") }),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", { calc: "forroVolume", ifc: Q("OrcaPRO_Forro", "Volume"), orc: O("volume"), revit: { bip: null, pendente: "P2-B — forro composto: o inventário traz o básico (sem volume)" } }),
        P(I, "Cotas", "Área bruta", "RA_FORRO_AREA_BRUTA", "area", { calc: "forroAreaBruta", ifc: Q("Qto_CoveringBaseQuantities", "GrossArea"), orc: O("areaBruta") }),
        P(I, "Cotas", "Área dos furos", "RA_FORRO_AREA_FUROS", "area", { calc: "forroAreaFuros", ifc: Q("OrcaPRO_Forro", "AreaFuros") }),
        P(I, "Cotas", "Elevação da face inferior", "RA_FORRO_COTA", "comprimento", { calc: "forroCota" }),
        P(T, "Construção", "Estrutura", "RA_FORRO_ESTRUTURA", "texto", { calc: "forroEstrutura" }),
        P(T, "Construção", "Espessura", "RA_FORRO_ESPESSURA", "comprimento", { calc: "forroEspessura", casas: 4, ifc: Q("Qto_CoveringBaseQuantities", "Width") }),
        P(T, "Materiais e acabamentos", "Material", "MATERIAL_ID_PARAM", "material", { calc: "forroMaterial" })
      ]
    },
    /* P3 — TELHADO, BORDAS do telhado e FUNDAÇÃO (Fundações
       estruturais). O telhado e a fundação NÃO foram coletados no inventário:
       os nomes são os PT-BR
       conhecidos e ficam "a conferir na coleta" (revit: {bip: null,
       pendente}) — a próxima coleta do inventário lista os parâmetros reais de instância e de
       tipo. Os que o inventário de OUTRAS categorias já tem com o mesmo nome
       (Área, Volume, Inclinação, Nível, Elevação no topo…) levam o bip. */
    telhado: {
      nome: "Telhados", ifc: "IFCROOF", inventario: null, familia: "Telhado básico", prefixo: "TL", comum: true, semTipo: true,
      defs: [
        P(I, "Restrições", "Nível base", "ROOF_BASE_LEVEL_PARAM", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "telhado.nivelId", leitura: false, revit: PEND_TE }),
        P(I, "Restrições", "Deslocamento da base do nível", "ROOF_LEVEL_OFFSET_PARAM", "comprimento", { calc: "teDesloc", escrita: "telhado.deslocBase", leitura: false, faixa: FAIXA.telhadoDesloc, revit: PEND_TE }),
        P(I, "Construção", "Corte de caibro", "ROOF_EAVE_CUT_PARAM", "texto", { calc: "teCorte", revit: PEND_TE }),
        P(I, "Construção", "Beiral (projeção na parede)", "RA_TELHADO_BEIRAL", "comprimento", { calc: "teBeiral", escrita: "telhado.beiral", leitura: false, faixa: FAIXA.coberturaBeiral, ifc: Q("OrcaPRO_Telhado", "Beiral") }),
        P(I, "Construção", "Modo", "RA_TELHADO_MODO", "texto", { calc: "teModo" }),
        P(I, "Construção", "Unido ao telhado", "RA_TELHADO_UNIR", "texto", { calc: "teUnir", escrita: "telhado.unir", leitura: false, ifc: Q("OrcaPRO_Telhado", "UnidoA") }),
        P(I, "Cotas", "Inclinação", "ROOF_SLOPE", "inclinacao", { calc: "teInclinacao", escrita: "telhado.inclinacao", leitura: false, faixa: FAIXA.coberturaInclinacao, ifc: Q("OrcaPRO_Telhado", "Inclinacao") }),
        P(I, "Cotas", "Inclinação por aresta (%)", "RA_TELHADO_INCLINACOES", "texto", { calc: "teInclinacoes", escrita: "telhado.inclinacoes", leitura: false, filtro: false, ifc: Q("OrcaPRO_Telhado", "InclinacaoPorAresta") }),
        P(I, "Cotas", "Área", "HOST_AREA_COMPUTED", "area", { calc: "teArea", ifc: Q("Qto_RoofBaseQuantities", "NetArea"), orc: O("area") }),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", { calc: "teVolume", ifc: Q("OrcaPRO_Telhado", "Volume"), orc: O("volume") }),
        P(I, "Cotas", "Área de projeção", "RA_TELHADO_PROJECAO", "area", { calc: "teProjecao", ifc: Q("Qto_RoofBaseQuantities", "ProjectedArea"), orc: O("areaProjecao") }),
        P(I, "Cotas", "Número de águas", "RA_TELHADO_AGUAS", "inteiro", { calc: "teAguas", ifc: Q("OrcaPRO_Telhado", "Aguas") }),
        P(I, "Cotas", "Comprimento da cumeeira", "RA_TELHADO_CUMEEIRA", "comprimento", { calc: "teCumeeira", ifc: Q("OrcaPRO_Telhado", "Cumeeira"), orc: O("comprimento") }),
        P(I, "Cotas", "Comprimento dos espigões", "RA_TELHADO_ESPIGAO", "comprimento", { calc: "teEspigao", ifc: Q("OrcaPRO_Telhado", "Espigoes"), orc: O("espigao") }),
        P(I, "Cotas", "Comprimento dos rincões", "RA_TELHADO_RINCAO", "comprimento", { calc: "teRincao", ifc: Q("OrcaPRO_Telhado", "Rincoes"), orc: O("rincao") }),
        P(I, "Cotas", "Comprimento do beiral", "RA_TELHADO_BEIRAL_COMP", "comprimento", { calc: "teBeiralComp", ifc: Q("OrcaPRO_Telhado", "ComprimentoBeiral"), orc: O("beiral") }),
        P(I, "Cotas", "Comprimento das empenas", "RA_TELHADO_EMPENA", "comprimento", { calc: "teEmpena", ifc: Q("OrcaPRO_Telhado", "ComprimentoEmpenas"), orc: O("empena") }),
        P(I, "Cotas", "Cota do apoio", "RA_TELHADO_COTA_APOIO", "comprimento", { calc: "teCotaApoio" }),
        P(I, "Cotas", "Altura máxima do cume", "ACTUAL_MAX_RIDGE_HEIGHT_PARAM", "comprimento", { calc: "teCotaCumeeira", revit: PEND_TE }),
        P(I, "Cotas", "Área recortada pela união", "RA_TELHADO_AREA_UNIAO", "area", { calc: "teAreaRemovida" }),
        P(T, "Construção", "Estrutura", "ROOF_STRUCTURE_ID_PARAM", "texto", { calc: "teEstrutura", revit: PEND_TE }),
        P(T, "Construção", "Espessura padrão", "ROOF_ATTR_DEFAULT_THICKNESS_PARAM", "comprimento", { calc: "teEspessura", casas: 4, revit: PEND_TE }),
        P(T, "Materiais e acabamentos", "Material", "RA_TELHADO_MATERIAL", "material", { calc: "teMaterial" })
      ]
    },
    borda: {
      nome: "Bordas do telhado", ifc: "IFCCOVERING", inventario: null, familia: null, prefixo: "BT", comum: true, semTipo: true,
      defs: [
        P(I, "Restrições", "Tipo de borda", "RA_BORDA_TIPO", "texto", { calc: "boTipo" }),
        P(I, "Restrições", "Arestas do telhado", "RA_BORDA_ARESTAS", "texto", { calc: "boArestas" }),
        P(I, "Outros", "ID de hospedeiro", "HOST_ID_PARAM", "texto", { calc: "boTelhado" }),
        P(I, "Cotas", "Comprimento", "CURVE_ELEM_LENGTH", "comprimento", { calc: "boComprimento", ifc: Q("OrcaPRO_Borda", "Comprimento"), orc: O("comprimento") }),
        P(I, "Cotas", "Área", "HOST_AREA_COMPUTED", "area", { calc: "boArea", ifc: Q("OrcaPRO_Borda", "Area"), orc: O("area") }),
        P(I, "Cotas", "Largura do perfil", "RA_BORDA_LARGURA", "comprimento", { calc: "boLargura", escrita: "borda.largura", leitura: false, ifc: Q("OrcaPRO_Borda", "LarguraPerfil") }),
        P(I, "Cotas", "Altura do perfil", "RA_BORDA_ALTURA", "comprimento", { calc: "boAltura", escrita: "borda.altura", leitura: false, ifc: Q("OrcaPRO_Borda", "AlturaPerfil") })
      ]
    },
    fundacao: {
      nome: "Fundações estruturais", ifc: "IFCFOOTING", inventario: null, familia: null, prefixo: "F", comum: true, semTipo: true,
      defs: [
        P(I, "Restrições", "Nível", "FAMILY_LEVEL_PARAM", "nivel", { calc: "nivelNome", campo: "nivelId", escrita: "fundacao.nivelId", leitura: false }),
        P(I, "Restrições", "Deslocamento do topo", "RA_FUND_DESLOC_TOPO", "comprimento", { calc: "fuDesloc", escrita: "fundacao.deslocTopo", leitura: false, faixa: FAIXA.fundDesloc }),
        P(I, "Construção", "Tipo de fundação", "RA_FUND_TIPO", "texto", { calc: "fuTipo", ifc: Q("OrcaPRO_Fundacao", "Tipo") }),
        P(I, "Cotas", "Largura", "RA_FUND_LARGURA", "comprimento", { calc: "fuLargura", escrita: "fundacao.largura", leitura: false, faixa: FAIXA.fundDim, ifc: Q("OrcaPRO_Fundacao", "Largura") }),
        P(I, "Cotas", "Comprimento", "RA_FUND_COMPRIMENTO", "comprimento", { calc: "fuComprimento", escrita: "fundacao.comprimento", leitura: false, faixa: FAIXA.fundDim, ifc: Q("OrcaPRO_Fundacao", "Comprimento") }),
        P(I, "Cotas", "Altura (espessura da fundação)", "RA_FUND_ALTURA", "comprimento", { calc: "fuAltura", escrita: "fundacao.altura", leitura: false, faixa: FAIXA.fundAltura, ifc: Q("OrcaPRO_Fundacao", "Altura") }),
        P(I, "Cotas", "Altura do rodapé (chanfrada)", "RA_FUND_ALTURA_BASE", "comprimento", { calc: "fuAlturaBase", escrita: "fundacao.alturaBase", leitura: false }),
        P(I, "Cotas", "Largura do topo (chanfrada)", "RA_FUND_LARGURA_TOPO", "comprimento", { calc: "fuLarguraTopo", escrita: "fundacao.larguraTopo", leitura: false }),
        P(I, "Cotas", "Comprimento do topo (chanfrada)", "RA_FUND_COMPRIMENTO_TOPO", "comprimento", { calc: "fuComprimentoTopo", escrita: "fundacao.comprimentoTopo", leitura: false }),
        P(I, "Cotas", "Número de estacas", "RA_FUND_N_ESTACAS", "inteiro", { calc: "fuNEstacas", escrita: "fundacao.nEstacas", leitura: false, ifc: Q("OrcaPRO_Fundacao", "NumeroEstacas") }),
        P(I, "Cotas", "Diâmetro da estaca", "RA_FUND_DIAMETRO", "comprimento", { calc: "fuDiametro", escrita: "fundacao.diametro", leitura: false, ifc: Q("OrcaPRO_Fundacao", "DiametroEstaca") }),
        P(I, "Cotas", "Comprimento da estaca", "RA_FUND_COMP_ESTACA", "comprimento", { calc: "fuCompEstaca", escrita: "fundacao.comprimentoEstaca", leitura: false, ifc: Q("OrcaPRO_Fundacao", "ComprimentoEstaca") }),
        P(I, "Cotas", "Espaçamento das estacas", "RA_FUND_ESPACAMENTO", "comprimento", { calc: "fuEspacamento", escrita: "fundacao.espacamento", leitura: false }),
        P(I, "Cotas", "Elevação no topo", "STRUCTURAL_ELEVATION_AT_TOP", "comprimento", { calc: "fuTopo" }),
        P(I, "Cotas", "Elevação na parte inferior", "STRUCTURAL_ELEVATION_AT_BOTTOM", "comprimento", { calc: "fuFundo" }),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", { calc: "fuVolume", ifc: Q("OrcaPRO_Fundacao", "Volume"), orc: O("volume") }),
        P(I, "Cotas", "Área da base", "RA_FUND_AREA_BASE", "area", { calc: "fuAreaBase", ifc: Q("OrcaPRO_Fundacao", "AreaBase"), orc: O("area") }),
        P(I, "Cotas", "Área de fôrma", "RA_FUND_AREA_FORMA", "area", { calc: "fuForma", ifc: Q("OrcaPRO_Fundacao", "AreaForma"), orc: O("areaForma") }),
        P(I, "Cotas", "Comprimento (baldrame, estaca; perímetro do radier)", "RA_FUND_COMPRIMENTO_PECA", "comprimento", { calc: "fuComprimentoPeca", ifc: Q("OrcaPRO_Fundacao", "ComprimentoPeca"), orc: O("comprimento") }),
        P(I, "Cotas", "Estacas (comprimento total)", "RA_FUND_ESTACAS", "comprimento", { calc: "fuEstacas", ifc: Q("OrcaPRO_Fundacao", "EstacasComprimento"), orc: O("estacas") }),
        P(I, "Cotas", "Estacas (volume)", "RA_FUND_VOL_ESTACAS", "volume", { calc: "fuVolEstacas", ifc: Q("OrcaPRO_Fundacao", "EstacasVolume"), orc: O("volumeEstacas") }),
        P(I, "Cotas", "Escavação", "RA_FUND_ESCAVACAO", "volume", { calc: "fuEscavacao", ifc: Q("OrcaPRO_Fundacao", "Escavacao"), orc: O("escavacao") }),
        P(I, "Cotas", "Profundidade da escavação", "RA_FUND_PROF_ESC", "comprimento", { calc: "fuProfEsc" }),
        P(I, "Cotas", "Reaterro", "RA_FUND_REATERRO", "volume", { calc: "fuReaterro", ifc: Q("OrcaPRO_Fundacao", "Reaterro"), orc: O("reaterro") }),
        P(I, "Cotas", "Lastro (volume)", "RA_FUND_LASTRO", "volume", { calc: "fuLastro", ifc: Q("OrcaPRO_Fundacao", "LastroVolume"), orc: O("lastro") }),
        P(I, "Cotas", "Lastro (área)", "RA_FUND_LASTRO_AREA", "area", { calc: "fuLastroArea", ifc: Q("OrcaPRO_Fundacao", "LastroArea"), orc: O("lastroArea") }),
        P(I, "Construção", "Espessura do lastro", "RA_FUND_LASTRO_ESP", "comprimento", { calc: "fuLastroEsp", escrita: "fundacao.lastro", leitura: false }),
        P(I, "Construção", "Folga da escavação (cada lado)", "RA_FUND_FOLGA", "comprimento", { calc: "fuFolga", escrita: "fundacao.folga", leitura: false }),
        P(I, "Construção", "Cota do terreno (em relação ao nível)", "RA_FUND_TERRENO", "comprimento", { calc: "fuTerreno", escrita: "fundacao.terreno", leitura: false }),
        P(I, "Estrutural", "Taxa de aço", "RA_FUND_TAXA_ACO", "numero", { calc: "fuTaxa", escrita: "fundacao.taxaAco", leitura: false, un: "kg/m³", casas: 1, ifc: Q("OrcaPRO_Fundacao", "TaxaAco") }),
        P(I, "Estrutural", "Aço (pela taxa)", "RA_FUND_ACO", "massa", { calc: "fuAco", ifc: Q("OrcaPRO_Fundacao", "Aco"), orc: O("aco") }),
        P(I, "Estrutural", "Taxa de aço das estacas", "RA_FUND_TAXA_ACO_ESTACA", "numero", { calc: "fuTaxaEstaca", escrita: "fundacao.taxaAcoEstaca", leitura: false, un: "kg/m³", casas: 1 }),
        P(I, "Estrutural", "Aço das estacas (pela taxa)", "RA_FUND_ACO_ESTACAS", "massa", { calc: "fuAcoEstacas", ifc: Q("OrcaPRO_Fundacao", "AcoEstacas"), orc: O("acoEstacas") }),
        P(I, "Materiais e acabamentos", "Material estrutural", "STRUCTURAL_MATERIAL_PARAM", "material", { calc: "fuMaterial" })
      ]
    },
    porta: {
      nome: "Portas", ifc: "IFCDOOR", inventario: "porta", familia: null, prefixo: "P", comum: true, grupoFamilia: true,
      defs: defsFamilia("porta")
    },
    janela: {
      nome: "Janelas", ifc: "IFCWINDOW", inventario: "janela", familia: null, prefixo: "J", comum: true, grupoFamilia: true,
      defs: defsFamilia("janela")
    },
    generico: {
      nome: "Modelos genéricos", ifc: "IFCBUILDINGELEMENTPROXY", inventario: null, familia: null, prefixo: "G", comum: true, grupoFamilia: true,
      defs: defsFamilia("generico")
    },
    /* ================= P12 — INSTALAÇÕES (js/biminst.js pecasRegistro) =================
       Nome e grupo em PT-BR: Tubulação e Conexões de tubo do inventário
       (elementos.tubo e elementos.conexao_tubo); as outras categorias não estão no
       inventário — o BuiltInParameter genérico (comprimento, tamanho, elevação,
       sistema) é o mesmo da tubulação e o resto é RA_ (sem equivalente medido).
       As categorias têm o nome do mapeamento de camadas IFC (exportlayers-ifc-IAI.txt):
       "Conduites" é o eletroduto, "Bandejas de cabos" a eletrocalha.
       Sem `orc`: o orçamento das instalações é o do js/biminst.js (código do MAPA por item). */
    tubo: {
      nome: "Tubulação", ifc: "IFCPIPESEGMENT", inventario: "tubo", familia: null, prefixo: null, comum: false, mep: true,
      defs: [
        P(I, "Restrições", "Elevação central do início", "RBS_START_OFFSET_PARAM", "comprimento", { calc: "mepElevIni", casas: 3 }),
        P(I, "Restrições", "Elevação central de término", "RBS_END_OFFSET_PARAM", "comprimento", { calc: "mepElevFim", casas: 3 }),
        P(I, "Restrições", "Inclinação", "RBS_PIPE_SLOPE", "inclinacao", { calc: "mepInclinacao", casas: 2 }),
        P(I, "Mecânica", "Classificação do sistema", "RBS_SYSTEM_CLASSIFICATION_PARAM", "texto", { calc: "mepSistema" }),
        P(I, "Mecânica", "Tipo de sistema", "RBS_PIPING_SYSTEM_TYPE_PARAM", "texto", { calc: "mepTipoSistema" }),
        P(I, "Mecânica", "Nome do sistema", "RBS_SYSTEM_NAME_PARAM", "texto", { calc: "mepNomeSistema", escrita: "instSistema.nome", leitura: false }),
        P(I, "Mecânica", "Abreviatura do sistema", "RBS_DUCT_PIPE_SYSTEM_ABBREVIATION_PARAM", "texto", { calc: "mepAbrev" }),
        P(I, "Mecânica", "Material", "RBS_PIPE_MATERIAL_PARAM", "texto", { calc: "mepMaterial" }),
        P(I, "Mecânica", "Segmento de tubulação", "RBS_PIPE_SEGMENT_PARAM", "texto", { calc: "mepSegmento" }),
        P(I, "Cotas", "Diâmetro", "RBS_PIPE_DIAMETER_PARAM", "inteiro", { calc: "mepDn", un: "mm", escrita: "instAlterar.dn", leitura: false }),
        P(I, "Cotas", "Tamanho", "RBS_CALCULATED_SIZE", "texto", { calc: "mepTamanho" }),
        P(I, "Cotas", "Comprimento", "CURVE_ELEM_LENGTH", "comprimento", { calc: "mepComprimento", casas: 3, ifc: Q("Qto_PipeSegmentBaseQuantities", "Length") }),
        P(I, "Cotas", "Comprimento em planta", "RA_MEP_COMPRIMENTO_PLANTA", "comprimento", { calc: "mepComprimentoH", casas: 3 }),
        P(I, "Cotas", "Desnível", "RA_MEP_DESNIVEL", "comprimento", { calc: "mepDesnivel", casas: 3 }),
        P(I, "Dados de identidade", "Aplicação (SINAPI)", "RA_MEP_APLICACAO", "texto", { calc: "mepAplicacao" }),
        P(I, "Dados de identidade", "Código SINAPI (mapa)", "RA_MEP_CODIGO", "texto", { calc: "mepCodigo" })
      ]
    },
    conexao_tubo: {
      nome: "Conexões de tubo", ifc: "IFCPIPEFITTING", inventario: "conexao_tubo", familia: null, prefixo: null, comum: false, mep: true,
      defs: [
        P(I, "Mecânica", "Classificação do sistema", "RBS_SYSTEM_CLASSIFICATION_PARAM", "texto", { calc: "mepSistema" }),
        P(I, "Mecânica", "Tipo de sistema", "RBS_PIPING_SYSTEM_TYPE_PARAM", "texto", { calc: "mepTipoSistema" }),
        P(I, "Mecânica", "Nome do sistema", "RBS_SYSTEM_NAME_PARAM", "texto", { calc: "mepNomeSistema" }),
        P(I, "Mecânica", "Abreviatura do sistema", "RBS_DUCT_PIPE_SYSTEM_ABBREVIATION_PARAM", "texto", { calc: "mepAbrev" }),
        P(I, "Cotas", "Angle", "RA_MEP_ANGULO", "angulo", { calc: "mepAngulo", revit: { bip: null, nome: "Angle" } }),
        P(I, "Cotas", "Nominal Diameter", "RA_MEP_DN_NOMINAL", "inteiro", { calc: "mepDn", un: "mm", revit: { bip: null, nome: "Nominal Diameter" } }),
        P(I, "Cotas", "Tamanho", "RBS_CALCULATED_SIZE", "texto", { calc: "mepTamanho" }),
        P(I, "Dados de identidade", "Conexão", "RA_MEP_CONEXAO", "texto", { calc: "mepTipoConexao" }),
        P(I, "Dados de identidade", "Trechos", "RA_MEP_TRECHOS", "texto", { calc: "mepTrechos" }),
        P(I, "Dados de identidade", "Código SINAPI (mapa)", "RA_MEP_CODIGO", "texto", { calc: "mepCodigo" })
      ]
    },
    acessorio_tubo: {
      nome: "Acessórios do tubo", ifc: "IFCVALVE", inventario: null, familia: null, prefixo: null, comum: false, mep: true,
      defs: [
        P(I, "Mecânica", "Classificação do sistema", "RBS_SYSTEM_CLASSIFICATION_PARAM", "texto", { calc: "mepSistema" }),
        P(I, "Mecânica", "Tipo de sistema", "RBS_PIPING_SYSTEM_TYPE_PARAM", "texto", { calc: "mepTipoSistema" }),
        P(I, "Mecânica", "Nome do sistema", "RBS_SYSTEM_NAME_PARAM", "texto", { calc: "mepNomeSistema" }),
        P(I, "Mecânica", "Abreviatura do sistema", "RBS_DUCT_PIPE_SYSTEM_ABBREVIATION_PARAM", "texto", { calc: "mepAbrev" }),
        P(I, "Cotas", "Tamanho", "RBS_CALCULATED_SIZE", "texto", { calc: "mepTamanho" }),
        P(I, "Cotas", "Face a face", "RA_MEP_FACE_A_FACE", "comprimento", { calc: "mepFaceAFace", casas: 3 }),
        P(I, "Dados de identidade", "Variante", "RA_MEP_VARIANTE", "texto", { calc: "mepVariante" }),
        P(I, "Dados de identidade", "Trechos", "RA_MEP_TRECHOS", "texto", { calc: "mepTrechos" }),
        P(I, "Dados de identidade", "Código SINAPI (mapa)", "RA_MEP_CODIGO", "texto", { calc: "mepCodigo" })
      ]
    },
    eletroduto: {
      nome: "Conduites", ifc: "IFCCABLECARRIERSEGMENT", inventario: null, familia: null, prefixo: null, comum: false, mep: true,
      defs: [
        P(I, "Restrições", "Elevação central do início", "RBS_START_OFFSET_PARAM", "comprimento", { calc: "mepElevIni", casas: 3 }),
        P(I, "Restrições", "Elevação central de término", "RBS_END_OFFSET_PARAM", "comprimento", { calc: "mepElevFim", casas: 3 }),
        P(I, "Elétrica", "Material", "RA_MEP_MATERIAL", "texto", { calc: "mepMaterial" }),
        P(I, "Elétrica", "Nome do sistema", "RA_MEP_NOME_SISTEMA", "texto", { calc: "mepNomeSistema", escrita: "instSistema.nome", leitura: false }),
        P(I, "Cotas", "Diâmetro (tamanho comercial)", "RA_MEP_DN", "inteiro", { calc: "mepDn", un: "mm", escrita: "instAlterar.dn", leitura: false }),
        P(I, "Cotas", "Tamanho", "RBS_CALCULATED_SIZE", "texto", { calc: "mepTamanho" }),
        P(I, "Cotas", "Comprimento", "CURVE_ELEM_LENGTH", "comprimento", { calc: "mepComprimento", casas: 3 }),
        P(I, "Dados de identidade", "Aplicação (SINAPI)", "RA_MEP_APLICACAO", "texto", { calc: "mepAplicacao" }),
        P(I, "Dados de identidade", "Código SINAPI (mapa)", "RA_MEP_CODIGO", "texto", { calc: "mepCodigo" })
      ]
    },
    conexao_eletroduto: {
      nome: "Conexões do conduite", ifc: "IFCCABLECARRIERFITTING", inventario: null, familia: null, prefixo: null, comum: false, mep: true,
      defs: [
        P(I, "Elétrica", "Nome do sistema", "RA_MEP_NOME_SISTEMA", "texto", { calc: "mepNomeSistema" }),
        P(I, "Cotas", "Tamanho", "RBS_CALCULATED_SIZE", "texto", { calc: "mepTamanho" }),
        P(I, "Dados de identidade", "Conexão", "RA_MEP_CONEXAO", "texto", { calc: "mepTipoConexao" }),
        P(I, "Dados de identidade", "Trechos", "RA_MEP_TRECHOS", "texto", { calc: "mepTrechos" }),
        P(I, "Dados de identidade", "Código SINAPI (mapa)", "RA_MEP_CODIGO", "texto", { calc: "mepCodigo" })
      ]
    },
    bandeja: {
      nome: "Bandejas de cabos", ifc: "IFCCABLECARRIERSEGMENT", inventario: null, familia: null, prefixo: null, comum: false, mep: true,
      defs: [
        P(I, "Restrições", "Elevação central do início", "RBS_START_OFFSET_PARAM", "comprimento", { calc: "mepElevIni", casas: 3 }),
        P(I, "Restrições", "Elevação central de término", "RBS_END_OFFSET_PARAM", "comprimento", { calc: "mepElevFim", casas: 3 }),
        P(I, "Elétrica", "Nome do sistema", "RA_MEP_NOME_SISTEMA", "texto", { calc: "mepNomeSistema", escrita: "instSistema.nome", leitura: false }),
        P(I, "Cotas", "Largura", "RA_MEP_LARGURA", "comprimento", { calc: "mepLargura", casas: 3 }),
        P(I, "Cotas", "Altura", "RA_MEP_ALTURA", "comprimento", { calc: "mepAltura", casas: 3 }),
        P(I, "Cotas", "Tamanho", "RBS_CALCULATED_SIZE", "texto", { calc: "mepTamanho" }),
        P(I, "Cotas", "Comprimento", "CURVE_ELEM_LENGTH", "comprimento", { calc: "mepComprimento", casas: 3 }),
        P(I, "Dados de identidade", "Código SINAPI (mapa)", "RA_MEP_CODIGO", "texto", { calc: "mepCodigo" })
      ]
    },
    conexao_bandeja: {
      nome: "Conexões da bandeja de cabos", ifc: "IFCCABLECARRIERFITTING", inventario: null, familia: null, prefixo: null, comum: false, mep: true,
      defs: [
        P(I, "Elétrica", "Nome do sistema", "RA_MEP_NOME_SISTEMA", "texto", { calc: "mepNomeSistema" }),
        P(I, "Cotas", "Tamanho", "RBS_CALCULATED_SIZE", "texto", { calc: "mepTamanho" }),
        P(I, "Dados de identidade", "Conexão", "RA_MEP_CONEXAO", "texto", { calc: "mepTipoConexao" }),
        P(I, "Dados de identidade", "Código SINAPI (mapa)", "RA_MEP_CODIGO", "texto", { calc: "mepCodigo" })
      ]
    },
    /* os DISPOSITIVOS são famílias (js/familiasra.js com `mep`): os parâmetros da família + o código do mapa */
    dispositivo_eletrico: { nome: "Dispositivos elétricos", ifc: "IFCOUTLET", inventario: null, familia: null, prefixo: "DE", comum: true, grupoFamilia: true, defs: defsFamilia("dispositivo_eletrico").concat(defsMepFamilia()) },
    luminaria: { nome: "Luminárias", ifc: "IFCLIGHTFIXTURE", inventario: null, familia: null, prefixo: "LU", comum: true, grupoFamilia: true, defs: defsFamilia("luminaria").concat(defsMepFamilia()) },
    equipamento_eletrico: { nome: "Equipamento elétrico", ifc: "IFCELECTRICDISTRIBUTIONBOARD", inventario: null, familia: null, prefixo: "QD", comum: true, grupoFamilia: true, defs: defsFamilia("equipamento_eletrico").concat(defsMepFamilia()) },
    /* P2-A — AMBIENTE (js/bimambiente.js). Não tem tipo nem
       Marca: a identidade é o Número (automático, sem repetir). Área,
       Perímetro e Volume saem do contorno calculado no replay pela regra do
       projeto ("Cálculos de área e volume"). A análise de energia/HVAC fica
       FORA (Anexo B). Quantidades do orçamento: Área (piso, contrapiso,
       forro, pintura de teto), Perímetro (rodapé, soleira, tabica), Volume. */
    ambiente: {
      nome: "Ambientes", ifc: "IFCSPACE", inventario: "ambiente", familia: null, prefixo: null, comum: false, semTipo: true,
      defs: [
        P(I, "Restrições", "Nível", "ROOM_LEVEL_ID", "nivel", { calc: "ambNivel" }),
        P(I, "Restrições", "Limite superior", "ROOM_UPPER_LEVEL", "nivel", { calc: "ambLimiteSup", escrita: "ajustarAmbiente.limiteSuperior", leitura: false }),
        P(I, "Restrições", "Deslocamento do limite", "ROOM_UPPER_OFFSET", "comprimento", { calc: "ambDeslocLimite", escrita: "ajustarAmbiente.deslocLimite", leitura: false }),
        P(I, "Restrições", "Deslocamento da base", "ROOM_LOWER_OFFSET", "comprimento", { calc: "ambDeslocBase", escrita: "ajustarAmbiente.deslocBase", leitura: false }),
        P(I, "Cotas", "Área", "ROOM_AREA", "area", { calc: "ambArea", ifc: Q("Qto_SpaceBaseQuantities", "NetFloorArea"), orc: O("area") }),
        P(I, "Cotas", "Perímetro", "ROOM_PERIMETER", "comprimento", { calc: "ambPerimetro", ifc: Q("Qto_SpaceBaseQuantities", "NetPerimeter"), orc: O("comprimento") }),
        P(I, "Cotas", "Volume", "ROOM_VOLUME", "volume", { calc: "ambVolume", ifc: Q("Qto_SpaceBaseQuantities", "NetVolume"), orc: O("volume") }),
        P(I, "Cotas", "Altura não delimitada", "ROOM_HEIGHT", "comprimento", { calc: "ambAltura", ifc: Q("Qto_SpaceBaseQuantities", "Height") }),
        P(I, "Cotas", "Cálculo da altura", "ROOM_COMPUTATION_HEIGHT", "comprimento", { calc: "ambCalcAltura" }),
        /* RA: o que se escreve no lugar da Área ("Não delimitado",
           "Ambiente redundante") e a regra que valeu na conta */
        P(I, "Cotas", "Situação", "RA_AMBIENTE_SITUACAO", "texto", { calc: "ambSituacao" }),
        P(I, "Cotas", "Limite de cálculo de área", "RA_AMBIENTE_REGRA", "texto", { calc: "ambRegra", filtro: false }),
        P(I, "Dados de identidade", "Número", "ROOM_NUMBER", "texto", { calc: "ambNumero", escrita: "ajustarAmbiente.numero", leitura: false, identificador: true, ifc: { atributo: "Name" } }),
        P(I, "Dados de identidade", "Nome", "ROOM_NAME", "texto", { campo: "nome", padrao: "Ambiente", escrita: "ajustarAmbiente.nome", identificador: true, ifc: { atributo: "LongName" } }),
        P(I, "Dados de identidade", "Acabamento do piso", "ROOM_FINISH_FLOOR", "texto", { campo: "acabPiso", escrita: "ajustarAmbiente.acabPiso", identificador: true, ifc: Q("Pset_SpaceCoveringRequirements", "FloorCovering") }),
        P(I, "Dados de identidade", "Acabamento base", "ROOM_FINISH_BASE", "texto", { campo: "acabBase", escrita: "ajustarAmbiente.acabBase", identificador: true, ifc: Q("Pset_SpaceCoveringRequirements", "SkirtingBoard") }),
        P(I, "Dados de identidade", "Acabamento da parede", "ROOM_FINISH_WALL", "texto", { campo: "acabParede", escrita: "ajustarAmbiente.acabParede", identificador: true, ifc: Q("Pset_SpaceCoveringRequirements", "WallCovering") }),
        P(I, "Dados de identidade", "Acabamento do forro", "ROOM_FINISH_CEILING", "texto", { campo: "acabForro", escrita: "ajustarAmbiente.acabForro", identificador: true, ifc: Q("Pset_SpaceCoveringRequirements", "CeilingCovering") }),
        P(I, "Dados de identidade", "Ocupação", "ROOM_OCCUPANCY", "texto", { campo: "ocupacao", escrita: "ajustarAmbiente.ocupacao", ifc: Q("Pset_SpaceOccupancyRequirements", "OccupancyType") }),
        P(I, "Dados de identidade", "Ocupante", "RA_AMBIENTE_OCUPANTE", "texto", { campo: "ocupante", escrita: "ajustarAmbiente.ocupante", revit: { bip: null, nome: "Ocupante" } }),
        P(I, "Dados de identidade", "Departamento", "ROOM_DEPARTMENT", "texto", { campo: "departamento", escrita: "ajustarAmbiente.departamento", ifc: Q("OrcaPRO_Ambiente", "Departamento") }),
        P(I, "Dados de identidade", "Comentários", "ALL_MODEL_INSTANCE_COMMENTS", "texto", { campo: "comentarios", escrita: "ajustarAmbiente.comentarios", identificador: true, ifc: Q("OrcaPRO_Identidade", "Comentarios") }),
        P(I, "Dados de identidade", "Imagem", "ALL_MODEL_IMAGE", "texto", { campo: "imagem", escrita: "ajustarAmbiente.imagem", filtro: false }),
        P(I, "Fases", "Fase", "ROOM_PHASE", "fase", { calc: "faseNova" }),
        P(I, "Outros", "Categoria", "ELEM_CATEGORY_PARAM", "texto", { calc: "categoriaNome" }),
        P(I, "Parâmetros IFC", "Exportar para IFC", "IFC_EXPORT_ELEMENT", "texto", { calc: "ifcExporta", tabela: false }),
        P(I, "Parâmetros IFC", "Exportar para IFC como", "IFC_EXPORT_ELEMENT_AS", "texto", { calc: "ifcEntidade" }),
        P(I, "Parâmetros IFC", "IfcGUID", "IFC_GUID", "texto", { calc: "ifcGuid", filtro: false })
      ]
    }
  };
  /* P11 — TERRENO E IMPLANTAÇÃO (js/bimterreno.js). Os nomes PT-BR são os do
     inventário de parâmetros ("Área projetada", "Corte",
     "Preenchimento", "Corte/Preenchimento líquido", "Ângulo para norte
     verdadeiro"…). O inventário NÃO coletou o
     sólido topográfico: o par nome × BIP confere na coleta P11
     (que lista os parâmetros do terreno, da plataforma e da linha de
     divisa) — até lá revit.pendente. "Preenchimento" é o ATERRO
     (tradução de Fill); a tela e o orçamento dizem "aterro". */
  (function () {
    var PEND = "P11 — nome PT-BR a conferir na próxima coleta do inventário; o par nome × BIP confere na coleta";
    function R11(o) { o.revit = { bip: null, pendente: PEND }; return o; }
    function E11(op, campo, o) { o = o || {}; o.escrita = "p11." + op + "." + campo; o.leitura = false; return o; }
    var OT = "OrcaPRO_Terreno", OP = "OrcaPRO_Terraplenagem";
    REG.topossolido = {
      nome: "Sólido topográfico", ifc: "IFCGEOGRAPHICELEMENT", inventario: null, familia: "Sólido topográfico", prefixo: "TS", comum: true, semTipo: true,
      defs: [
        P(I, "Cotas", "Área projetada", "PROJECTED_SURFACE_AREA", "area", R11({ calc: "topoAreaProj", ifc: Q(OT, "AreaProjetada"), orc: O("areaProjecao") })),
        P(I, "Cotas", "Área da superfície", "SURFACE_AREA", "area", R11({ calc: "topoAreaSup", ifc: Q(OT, "AreaSuperficie"), orc: O("area") })),
        P(I, "Cotas", "Volume", "HOST_VOLUME_COMPUTED", "volume", R11({ calc: "topoVolume", ifc: Q(OT, "Volume"), orc: O("volume") })),
        P(I, "Cotas", "Cota mínima", "RA_TOPO_COTA_MIN", "comprimento", { calc: "topoCotaMin", ifc: Q(OT, "CotaMinima") }),
        P(I, "Cotas", "Cota máxima", "RA_TOPO_COTA_MAX", "comprimento", { calc: "topoCotaMax", ifc: Q(OT, "CotaMaxima") }),
        P(I, "Cotas", "Cota do fundo", "RA_TOPO_COTA_FUNDO", "comprimento", { calc: "topoCotaFundo" }),
        P(I, "Construção", "Espessura", "RA_TOPO_ESPESSURA", "comprimento", E11("topossolido", "espessura", { calc: "topoEspessura", faixa: { min: 0.05, max: 100 }, padrao: 1 })),
        P(I, "Construção", "Intervalo das curvas de nível", "RA_TOPO_PASSO", "comprimento", E11("topossolido", "passoCurvas", { calc: "topoPasso", faixa: { min: 0.05, max: 50 }, padrao: 1 })),
        P(I, "Construção", "Rotular curvas mestras", "RA_TOPO_ROTULAR", "simnao", E11("topossolido", "rotularMestras", { campo: "rotularMestras", padrao: false })),
        P(I, "Materiais e acabamentos", "Material", "RA_TOPO_MATERIAL", "texto", E11("topossolido", "material", { calc: "terrenoMaterial" })),
        P(I, "Dados de identidade", "Nome", "RA_TOPO_NOME", "texto", E11("topossolido", "nome", { calc: "terrenoNome", identificador: true })),
        P(I, "Outros", "Origem", "RA_TOPO_ORIGEM", "texto", { calc: "topoOrigem" }),
        P(I, "Outros", "Pontos", "RA_TOPO_PONTOS", "inteiro", { calc: "topoPontos" }),
        P(I, "Outros", "Triângulos", "RA_TOPO_TRIANGULOS", "inteiro", { calc: "topoTriangulos" })
      ]
    };
    REG.subregiao = {
      nome: "Subdivisões", ifc: "IFCGEOGRAPHICELEMENT", inventario: null, familia: "Subdivisão do sólido topográfico", prefixo: "SR", comum: true, semTipo: true,
      defs: [
        P(I, "Cotas", "Área projetada", "PROJECTED_SURFACE_AREA", "area", R11({ calc: "topoAreaProj", ifc: Q(OT, "AreaProjetada"), orc: O("areaProjecao") })),
        P(I, "Cotas", "Área da superfície", "SURFACE_AREA", "area", R11({ calc: "topoAreaSup", ifc: Q(OT, "AreaSuperficie"), orc: O("area") })),
        P(I, "Materiais e acabamentos", "Material", "RA_SUB_MATERIAL", "texto", E11("subregiao", "material", { calc: "terrenoMaterial" })),
        P(I, "Dados de identidade", "Nome", "RA_SUB_NOME", "texto", E11("subregiao", "nome", { calc: "terrenoNome", identificador: true })),
        P(I, "Outros", "Sólido topográfico", "RA_TERRENO_HOST", "texto", { calc: "terrenoHost" })
      ]
    };
    REG.plataforma = {
      nome: "Plataformas", ifc: "IFCGEOGRAPHICELEMENT", inventario: null, familia: "Plataforma", prefixo: "PL", comum: true, semTipo: true,
      defs: [
        P(I, "Restrições", "Nível", "LEVEL_PARAM", "nivel", R11(E11("plataforma", "nivelId", { calc: "platNivel" }))),
        P(I, "Restrições", "Altura do deslocamento do nível", "BUILDINGPAD_HEIGHTABOVELEVEL_PARAM", "comprimento", R11(E11("plataforma", "deslocNivel", { calc: "platDesloc", faixa: { min: -1000, max: 1000 }, padrao: 0 }))),
        P(I, "Restrições", "Cota da plataforma", "RA_PLAT_COTA", "comprimento", { calc: "platCota", ifc: Q(OP, "Cota") }),
        P(I, "Cotas", "Área projetada", "PROJECTED_SURFACE_AREA", "area", R11({ calc: "platAreaProj", ifc: Q(OP, "AreaProjetada"), orc: O("areaProjecao") })),
        P(I, "Cotas", "Perímetro", "HOST_PERIMETER_COMPUTED", "comprimento", R11({ calc: "platPerimetro", ifc: Q(OP, "Perimetro"), orc: O("comprimento") })),
        P(I, "Cotas", "Corte", "VOLUME_CUT", "volume", R11({ calc: "platCorte", ifc: Q(OP, "Corte"), orc: O("corte") })),
        P(I, "Cotas", "Preenchimento", "VOLUME_FILL", "volume", R11({ calc: "platAterro", ifc: Q(OP, "Aterro"), orc: O("aterro") })),
        P(I, "Cotas", "Corte/Preenchimento líquido", "VOLUME_NET", "volume", R11({ calc: "platLiquido", ifc: Q(OP, "CorteAterroLiquido") })),
        P(I, "Cotas", "Área em corte", "RA_PLAT_AREA_CORTE", "area", { calc: "platAreaCorte" }),
        P(I, "Cotas", "Área em aterro", "RA_PLAT_AREA_ATERRO", "area", { calc: "platAreaAterro" }),
        P(I, "Cotas", "Área fora do terreno", "RA_PLAT_AREA_FORA", "area", { calc: "platAreaFora" }),
        P(I, "Cotas", "Solo no corte (sondagem)", "RA_PLAT_SOLO", "texto", { calc: "platSolo", filtro: false }),
        P(I, "Dados de identidade", "Nome", "RA_PLAT_NOME", "texto", E11("plataforma", "nome", { calc: "terrenoNome", identificador: true })),
        P(I, "Outros", "Sólido topográfico", "RA_TERRENO_HOST", "texto", { calc: "terrenoHost" })
      ]
    };
    REG.divisa = {
      nome: "Linhas de divisa", ifc: "IFCSITE", inventario: null, familia: "Linha de propriedade", prefixo: "LD", comum: true, semTipo: true,
      defs: [
        P(I, "Cotas", "Área", "PROPERTY_AREA", "area", R11({ calc: "divArea", ifc: Q("Qto_SiteBaseQuantities", "GrossArea"), orc: O("area") })),
        P(I, "Cotas", "Perímetro", "RA_DIVISA_PERIMETRO", "comprimento", { calc: "divPerimetro", ifc: Q("Qto_SiteBaseQuantities", "GrossPerimeter"), orc: O("comprimento") }),
        P(I, "Cotas", "Rumos e distâncias", "RA_DIVISA_RUMOS", "texto", { calc: "divSegmentos", filtro: false }),
        P(I, "Dados de identidade", "Nome", "RA_DIVISA_NOME", "texto", E11("divisa", "nome", { calc: "terrenoNome", identificador: true }))
      ]
    };
    REG.componente_terreno = {
      nome: "Componentes de terreno", ifc: "IFCBUILDINGELEMENTPROXY", inventario: null, familia: "Componente de terreno", prefixo: "CT", comum: true, semTipo: true,
      defs: [
        P(I, "Restrições", "Elevação", "RA_COMP_ELEVACAO", "comprimento", { calc: "compElevacao" }),
        P(I, "Cotas", "Altura", "RA_COMP_ALTURA", "comprimento", E11("compTerreno", "altura", { calc: "compAltura", faixa: { min: 0.05, max: 100 } })),
        P(I, "Dados de identidade", "Componente", "RA_COMP_TIPO", "texto", { calc: "compTipo", identificador: true })
      ]
    };
  })();
  /* as propriedades do TIPO de pilar e viga (perfil): geometria da seção e
     o que o catálogo AISC (js/perfisaco.js) traz — nas unidades usuais de seção */
  function defsSecao(qto) {
    var tipoPerfil = { escrita: "ajustarTipo.valores.perfil", leitura: false };
    return [
      P(T, "Estrutural", "Forma da seção", "STRUCTURAL_SECTION_SHAPE", "texto", { calc: "secaoForma" }),
      P(T, "Dados de identidade", "Chave do nome do corte", "STRUCTURAL_SECTION_NAME_KEY", "texto", { calc: "secaoChave" }),
      P(T, "Geometria do corte estrutural", "Altura", "STRUCTURAL_SECTION_COMMON_HEIGHT", "comprimento", { calc: "secaoAltura", escrita: tipoPerfil.escrita, leitura: false, casas: 3 }),
      P(T, "Geometria do corte estrutural", "Largura", "STRUCTURAL_SECTION_COMMON_WIDTH", "comprimento", { calc: "secaoLargura", escrita: tipoPerfil.escrita, leitura: false, casas: 3 }),
      P(T, "Geometria do corte estrutural", "Espessura da teia", "STRUCTURAL_SECTION_ISHAPE_WEBTHICKNESS", "comprimento", { calc: "secaoAlma", escrita: tipoPerfil.escrita, leitura: false, casas: 4 }),
      P(T, "Geometria do corte estrutural", "Espessura do flange", "STRUCTURAL_SECTION_ISHAPE_FLANGETHICKNESS", "comprimento", { calc: "secaoMesa", escrita: tipoPerfil.escrita, leitura: false, casas: 4 }),
      P(T, "Geometria do corte estrutural", "Concordância da teia", "STRUCTURAL_SECTION_ISHAPE_WEBFILLET", "comprimento", { calc: "secaoRaio", casas: 4 }),
      P(T, "Geometria do corte estrutural", "Centróide horizontal", "STRUCTURAL_SECTION_COMMON_CENTROID_HORIZ", "comprimento", { calc: "secaoCentroH", casas: 4 }),
      P(T, "Geometria do corte estrutural", "Centróide vertical", "STRUCTURAL_SECTION_COMMON_CENTROID_VERTICAL", "comprimento", { calc: "secaoCentroV", casas: 4 }),
      P(T, "Análise estrutural", "Área de corte", "STRUCTURAL_SECTION_AREA", "secao", { calc: "secaoArea", un: "cm²", ifc: Q(qto, "CrossSectionArea") }),
      P(T, "Análise estrutural", "Perímetro", "STRUCTURAL_SECTION_COMMON_PERIMETER", "secao", { calc: "secaoPerimetro", un: "m²/m" }),
      P(T, "Análise estrutural", "Peso nominal", "STRUCTURAL_SECTION_COMMON_NOMINAL_WEIGHT", "secao", { calc: "secaoPesoNominal", un: "kg/m" }),
      P(T, "Análise estrutural", "Eixo forte do momento de inércia", "STRUCTURAL_SECTION_COMMON_MOMENT_OF_INERTIA_STRONG_AXIS", "secao", { calc: "secaoIx", un: "cm⁴" }),
      P(T, "Análise estrutural", "Eixo fraco do momento de inércia", "STRUCTURAL_SECTION_COMMON_MOMENT_OF_INERTIA_WEAK_AXIS", "secao", { calc: "secaoIy", un: "cm⁴" }),
      P(T, "Análise estrutural", "Eixo forte do módulo de elasticidade", "STRUCTURAL_SECTION_COMMON_ELASTIC_MODULUS_STRONG_AXIS", "secao", { calc: "secaoWx", un: "cm³" }),
      P(T, "Análise estrutural", "Eixo fraco do módulo de elasticidade", "STRUCTURAL_SECTION_COMMON_ELASTIC_MODULUS_WEAK_AXIS", "secao", { calc: "secaoWy", un: "cm³" }),
      P(T, "Análise estrutural", "Eixo forte do módulo plástico", "STRUCTURAL_SECTION_COMMON_PLASTIC_MODULUS_STRONG_AXIS", "secao", { calc: "secaoZx", un: "cm³" }),
      P(T, "Análise estrutural", "Eixo fraco do módulo plástico", "STRUCTURAL_SECTION_COMMON_PLASTIC_MODULUS_WEAK_AXIS", "secao", { calc: "secaoZy", un: "cm³" }),
      P(T, "Análise estrutural", "Momento de inércia de torção", "STRUCTURAL_SECTION_COMMON_TORSIONAL_MOMENT_OF_INERTIA", "secao", { calc: "secaoJ", un: "cm⁴" }),
      P(T, "Análise estrutural", "Constante da empena", "STRUCTURAL_SECTION_COMMON_WARPING_CONSTANT", "secao", { calc: "secaoCw", un: "cm⁶", casas: 1 })
    ];
  }
  /* família colocada (porta, janela, genérico): o que vem do Familia.avaliar.
     Os parâmetros PRÓPRIOS da família (os que ela declara) entram no
     resolver como definições "FAM:<nome>", no grupo que a família diz. */
  function defsFamilia(cat) {
    var hosp = cat === "porta" || cat === "janela", qf = cat === "porta" ? "Qto_DoorBaseQuantities" : "Qto_WindowBaseQuantities";
    var d = [
      P(I, "Restrições", "Nível", "FAMILY_LEVEL_PARAM", "nivel", { calc: "nivelNome" })
    ];
    if (hosp) d.push(
      /* a porta tem peitoril 0 fixo; a janela muda pelo parâmetro de instância Peitoril */
      P(I, "Restrições", "Altura do peitoril", "INSTANCE_SILL_HEIGHT_PARAM", "comprimento", { calc: "famPeitoril", escrita: cat === "janela" ? "instancia.inst.Peitoril" : null, leitura: cat !== "janela" }),
      P(I, "Restrições", "Altura da extremidade", "INSTANCE_HEAD_HEIGHT_PARAM", "comprimento", { calc: "famTopoVao" }),
      P(I, "Cotas", "Área", "HOST_AREA_COMPUTED", "area", { calc: "famAreaVao", ifc: Q(qf, "Area"), orc: O("area") }),
      P(I, "Outros", "ID de hospedeiro", "HOST_ID_PARAM", "texto", { calc: "hospedeiro" })
    );
    d.push(P(I, "Cotas", "Volume", hosp ? "HOST_VOLUME_COMPUTED" : "RA_FAM_VOLUME", "volume", { calc: "famVolume" }));
    d.push(P(I, "Cotas", "Quantidade da família", "RA_FAM_QUANTIDADE", "numero", { calc: "famQuantidade", ifc: Q("OrcaPRO_Quantitativo", "Quantidade"), orc: O("quantidade") }));
    d.push(P(I, "Cotas", "Unidade da quantidade", "RA_FAM_UNIDADE", "texto", { calc: "famUnidade", ifc: Q("OrcaPRO_Quantitativo", "Unidade") }));
    d.push(P(T, "Dados de identidade", "Código de orçamento", "RA_FAM_CODIGO", "texto", { calc: "famCodigo", ifc: Q("OrcaPRO_Quantitativo", "CodigoOrcamento") }));
    /* Largura e Altura da família: os parâmetros "Largura"/"Altura" que ela
       declara (no genérico, Altura e Profundidade não têm bip) */
    d.push(P(T, "Cotas", "Largura", "GENERIC_WIDTH", "comprimento", { calc: "famLargura", escrita: "família (tipo)", leitura: false }));
    d.push(P(T, "Cotas", "Altura", hosp ? "DOOR_HEIGHT" : "RA_FAM_ALTURA", "comprimento", { calc: "famAltura", escrita: "família (tipo)", leitura: false }));
    if (cat === "generico") d.push(P(T, "Cotas", "Profundidade", "RA_FAM_PROFUNDIDADE", "comprimento", { calc: "famProfundidade", escrita: "família (tipo)", leitura: false }));
    /* P1-D: Width/Height do Qto_Door/WindowBaseQuantities são as do VÃO (a
       largura e a altura BRUTAS: porta de 0,80 com batentes abre 0,90) — o
       mesmo vão da Área (Width × Height = Area) e o que o IFC sempre levou;
       a Largura nominal da folha fica nas Propriedades */
    if (hosp) d.push(
      P(T, "Cotas", "Largura bruta", "FAMILY_ROUGH_WIDTH_PARAM", "comprimento", { calc: "famLarguraBruta", ifc: Q(qf, "Width") }),
      P(T, "Cotas", "Altura bruta", "FAMILY_ROUGH_HEIGHT_PARAM", "comprimento", { calc: "famAlturaBruta", ifc: Q(qf, "Height") })
    );
    if (cat === "porta") d.push(
      P(T, "Cotas", "Espessura", "DOOR_THICKNESS", "comprimento", { calc: "famEspessuraFolha", escrita: "família (tipo)", leitura: false }),
      P(T, "Construção", "Função", "FUNCTION_PARAM", "lista", { campo: "funcao", padrao: "Interior", opcoes: ["Interior", "Exterior"], escrita: "ajustarTipo.valores.funcao" }),
      P(T, "Materiais e acabamentos", "Material da porta", "RA_PORTA_MATERIAL", "material", { calc: "famMaterialFolha", revit: { bip: null, nome: "Material da porta" } }),
      P(T, "Materiais e acabamentos", "Material da moldura", "RA_PORTA_MATERIAL_MOLDURA", "material", { calc: "famMaterialBatente", revit: { bip: null, nome: "Material da moldura" } })
    );
    if (cat === "janela") d.push(
      P(T, "Materiais e acabamentos", "Caixilho", "RA_JANELA_CAIXILHO", "material", { calc: "famMaterialMarco", revit: { bip: null, nome: "Caixilho" } }),
      P(T, "Materiais e acabamentos", "Material do painel de vidro", "RA_JANELA_VIDRO", "material", { calc: "famMaterialVidro", revit: { bip: null, nome: "Material do painel de vidro" } })
    );
    return d;
  }
  /* P12: o item SINAPI do dispositivo MEP (família com `mep`), pelo motor das instalações */
  function defsMepFamilia() {
    return [
      P(I, "Dados de identidade", "Item SINAPI (mapa)", "RA_MEP_ITEM", "texto", { calc: "mepItemFam" }),
      P(I, "Dados de identidade", "Código SINAPI (mapa)", "RA_MEP_CODIGO", "texto", { calc: "mepCodigoFam" })
    ];
  }
  /* os nomes de parâmetro da família que já têm definição do registro (não
     se repetem como "FAM:") */
  var FAM_MAPEADOS = { largura: 1, altura: 1, profundidade: 1, espessura_folha: 1, material_folha: 1, material_batente: 1, material_marco: 1, material_vidro: 1, peitoril: 1 };

  /* congela a tabela: ninguém muda definição em tempo de execução */
  function congelar(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(function (k) { congelar(o[k]); }); }
    return o;
  }
  /* ============================================================ P9 — GANCHOS
   * Fase P9 do plano do BIM (estrutura com catálogo, escada e
   * rampa). Um bloco só, ANTES do congelar: acrescenta/troca definições pelo
   * id (os nomes, grupos e BuiltInParameter são os do inventário
   * em PT-BR — tools/test-bimparam.js confere) e as funções de cálculo, que
   * só LEEM o que o js/bimarq.js e o js/bimestrut.js calcularam no replay. */
  (function p9() {
    function E9() { return dep("BimEstrut", "./bimestrut.js"); }
    function A9() { return dep("BimArq", "./bimarq.js"); }
    function ps9(x) { var c = el(x), E = E9(); return E && c.perfil ? E.propsSecao(c.perfil, c.material) : null; }
    function nn(v) { return v == null || v === "" || !fin(Number(v)) ? null : Number(v); }
    var PEND_RAMPA = { bip: null, pendente: "P9 — rampa: parâmetros do tipo de rampa a conferir na próxima coleta do inventário" };
    /* ---- A: propriedades de seção — catálogo quando há; senão a conta da RA */
    ["Ix", "Iy", "Wx", "Wy", "Zx", "Zy", "J"].forEach(function (k) {
      var orig = CALC["secao" + k];
      CALC["secao" + k] = function (x) { var v = orig(x); if (v != null) return v; var ps = ps9(x); return ps && ps[k] != null ? ps[k] : null; };
    });
    var pesoOrig = CALC.secaoPesoNominal;
    CALC.secaoPesoNominal = function (x) { var v = pesoOrig(x); if (v != null) return v; var ps = ps9(x); return ps && ps.peso != null ? ps.peso : null; };
    CALC.p9PerfilFonte = function (x) { var ps = ps9(x); return ps ? ps.fonte : null; };
    CALC.p9PerfilCodigo = function (x) { var ps = ps9(x); return ps && ps.fabricante ? (ps.fabricante === "AISC" ? "AISC 15.0" : ps.fabricante) : null; };
    CALC.p9Fabricante = function (x) { var ps = (el(x).tipo === "pilar" || el(x).tipo === "viga") ? ps9(x) : null; return ps && ps.fabricante ? ps.fabricante : null; };
    /* ---- B: viga e pilar */
    function rot(lista, v, padrao) { var E = E9(); return E ? E.rotuloDe(lista(E), E.idDe(lista(E), v, padrao)) : null; }
    CALC.vigaJustY = function (x) { return rot(function (E) { return E.JUST_Y; }, el(x).justY, "origem"); };
    CALC.vigaJustZ = function (x) { return rot(function (E) { return E.JUST_Z; }, el(x).justZ, "topo"); };
    CALC.vigaJustYZ = function () { return "Uniforme"; };
    CALC.vigaDespY = function (x) { return num(el(x).despY, 0); };
    CALC.vigaDespZ = function (x) { return num(el(x).despZ, 0); };
    CALC.vigaDeslocIni = function (x) { return r6(desloc(x, topoViga(x)) + num(el(x).dIni, 0)); };
    CALC.vigaDeslocFim = function (x) { return r6(desloc(x, topoViga(x)) + num(el(x).dFim, 0)); };
    CALC.vigaExtIni = function (x) { return num(el(x).extIni, 0); };
    CALC.vigaExtFim = function (x) { return num(el(x).extFim, 0); };
    CALC.vigaRecorteUniao = function (x) { var A = A9(); return aco(x) && A ? A.RECUO_JUNTA_ACO : 0; };
    CALC.pilarEstilo = function (x) { var E = E9(); return E ? E.rotuloDe(E.ESTILOS_PILAR, E.inclinado(el(x)) ? "inclinado" : "vertical") : "Vertical"; };
    CALC.pilarMarcaLocal = function (x) { return el(x).marcaLocal ? txt(el(x).marcaLocal) : null; };
    CALC.pilarMoveEixos = function (x) { return el(x).moveComEixos !== false; };
    CALC.pilarTopoDx = function (x) { return num(el(x).topoDx, 0); };
    CALC.pilarTopoDz = function (x) { return num(el(x).topoDz, 0); };
    /* ---- C: escada, lance, guarda-corpo */
    CALC.escadaRegraNome = function (x) { var A = A9(); return A && A.REGRAS_ESCADA ? A.REGRAS_ESCADA[A.regraEscada(escPar(x).regra)] : null; };
    CALC.escadaFormaNome = function (x) { var f = escPar(x).forma; return f === "L" || f === "U" ? f : "reta"; };   /* o id (reta, L, U): é o que a lista grava */
    CALC.escadaVao = function (x) { return escPar(x).forma === "U" ? num(escPar(x).vao, 0) : null; };
    CALC.escadaComeca = function (x) { return escPar(x).comecaEspelho !== false; };
    CALC.escadaTermina = function (x) { return escPar(x).terminaEspelho !== false; };
    CALC.escadaRevPiso = function (x) { return nn(escPar(x).revPiso); };
    CALC.escadaRevEspelho = function (x) { return nn(escPar(x).revEspelho); };
    CALC.escadaMatPiso = function (x) { return escPar(x).matPiso ? txt(escPar(x).matPiso) : "<Por categoria>"; };
    CALC.escadaMatEspelho = function (x) { return escPar(x).matEspelho ? txt(escPar(x).matEspelho) : "<Por categoria>"; };
    CALC.escadaVolRevPiso = function (x) { return m(x).volRevPiso != null ? m(x).volRevPiso : null; };
    CALC.escadaVolRevEspelho = function (x) { return m(x).volRevEspelho != null ? m(x).volRevEspelho : null; };
    CALC.lanceComeca = function (x) { return x.sub ? !x.sub.semIni : null; };
    CALC.lanceTermina = function (x) { return x.sub ? !x.sub.semFim : null; };
    CALC.guardaC1Altura = function (x) { return nn(gPar(x).c1Altura); };
    CALC.guardaC1Desloc = function (x) { return gPar(x).c1Altura != null ? num(gPar(x).c1Desloc, 0) : null; };
    CALC.guardaC2Altura = function (x) { return nn(gPar(x).c2Altura); };
    CALC.guardaC2Desloc = function (x) { return gPar(x).c2Altura != null ? num(gPar(x).c2Desloc, 0) : null; };
    CALC.guardaDeslocCaminho = function (x) { return num(gPar(x).deslocCaminho, 0); };
    CALC.guardaCompCorrimaos = function (x) { return m(x).comprimentoCorrimao != null ? m(x).comprimentoCorrimao : null; };
    /* ---- C: rampa (js/bimestrut.js) */
    function rpar(x) { var c = el(x); return (c.rampa && c.rampa.par) || {}; }
    function rcalc(x) { var c = el(x); return (c.rampa && c.rampa.calc) || {}; }
    CALC.rampaBase = function (x) { return desloc(x, num(rpar(x).base, 0)); };
    CALC.rampaDesnivel = function (x) { return nn(rpar(x).desnivel); };
    CALC.rampaLargura = function (x) { return nn(rpar(x).largura); };
    CALC.rampaInclinacao = function (x) { return nn(rpar(x).inclinacao); };
    CALC.rampaEspessura = function (x) { return nn(rpar(x).espessura); };
    CALC.rampaPatamar = function (x) { return nn(rpar(x).patamar); };
    CALC.rampaForma = function (x) { return rpar(x).forma === "U" ? "Em U" : "Reta"; };
    CALC.rampaSegmentos = function (x) { return fin(rcalc(x).segmentos) ? rcalc(x).segmentos : null; };
    CALC.rampaHSeg = function (x) { return fin(rcalc(x).h) ? rcalc(x).h : null; };
    CALC.rampaLSeg = function (x) { return fin(rcalc(x).comprimentoSegmento) ? rcalc(x).comprimentoSegmento : null; };
    CALC.rampaFaixa = function (x) { return rcalc(x).faixa ? "Inclinação " + rcalc(x).faixa + ": até " + String(rcalc(x).hMax).replace(".", ",") + " m por segmento (NBR 9050 — conferir)" : null; };
    CALC.rampaAvisos = function (x) { var k = rcalc(x); return arr(k.avisos).concat(arr(k.conferir)).join(" ") || null; };
    CALC.rampaVolume = function (x) { return m(x).volume != null ? m(x).volume : null; };
    CALC.rampaArea = function (x) { return m(x).area != null ? m(x).area : null; };
    CALC.rampaProjecao = function (x) { return m(x).areaProjecao != null ? m(x).areaProjecao : null; };
    CALC.rampaForma2 = function (x) { return m(x).areaForma != null ? m(x).areaForma : null; };
    CALC.rampaPercurso = function (x) { return m(x).comprimento != null ? m(x).comprimento : null; };

    function troca(cat, id, d) { var L = REG[cat].defs; for (var i = 0; i < L.length; i++) if (L[i].id === id) { L[i] = d; return; } L.push(d); }
    var lJY = ["Origem", "Esquerda", "Centro", "Direita"], lJZ = ["Topo", "Centro", "Origem", "Inferior"];
    /* COMUM: o Fabricante do perfil de catálogo (AISC / Gerdau) quando o tipo não diz outro */
    for (var ic = 0; ic < COMUM.length; ic++) if (COMUM[ic].id === "ALL_MODEL_MANUFACTURER") COMUM[ic] = P(T, "Dados de identidade", "Fabricante", "ALL_MODEL_MANUFACTURER", "texto", { fonte: "tipo", campo: "fabricante", calc: "p9Fabricante", escrita: "ajustarTipo.valores.fabricante", leitura: false });
    ["pilar", "viga"].forEach(function (cat) {
      REG[cat].defs.push(
        P(T, "Dados de identidade", "Nome do código", "STRUCTURAL_FAMILY_CODE_NAME", "texto", { calc: "p9PerfilCodigo" }),
        P(T, "Dados de identidade", "Fonte da tabela do perfil", "RA_PERFIL_FONTE", "texto", { calc: "p9PerfilFonte", filtro: false })
      );
    });
    /* viga: Posição geométrica (justificação, deslocamentos, extensões) e a inclinação */
    troca("viga", "STRUCTURAL_BEAM_END0_ELEVATION", P(I, "Restrições", "Deslocamento do nível inicial", "STRUCTURAL_BEAM_END0_ELEVATION", "comprimento", { calc: "vigaDeslocIni", escrita: "ajustar.estrut.deslocNivelIni", leitura: false }));
    troca("viga", "STRUCTURAL_BEAM_END1_ELEVATION", P(I, "Restrições", "Deslocamento do nível final", "STRUCTURAL_BEAM_END1_ELEVATION", "comprimento", { calc: "vigaDeslocFim", escrita: "ajustar.estrut.deslocNivelFim", leitura: false }));
    troca("viga", "Z_JUSTIFICATION", P(I, "Posição geométrica", "Justificação z", "Z_JUSTIFICATION", "lista", { calc: "vigaJustZ", opcoes: lJZ, escrita: "ajustar.estrut.justZ", leitura: false }));
    REG.viga.defs.push(
      P(I, "Posição geométrica", "Justificação y", "Y_JUSTIFICATION", "lista", { calc: "vigaJustY", opcoes: lJY, escrita: "ajustar.estrut.justY", leitura: false }),
      P(I, "Posição geométrica", "Justificação yz", "YZ_JUSTIFICATION", "texto", { calc: "vigaJustYZ" }),
      P(I, "Posição geométrica", "Valor do deslocamento y", "Y_OFFSET_VALUE", "comprimento", { calc: "vigaDespY", escrita: "ajustar.estrut.despY", leitura: false }),
      P(I, "Posição geométrica", "Valor do deslocamento z", "Z_OFFSET_VALUE", "comprimento", { calc: "vigaDespZ", escrita: "ajustar.estrut.despZ", leitura: false }),
      P(I, "Posição geométrica", "Extensão inicial", "START_EXTENSION", "comprimento", { calc: "vigaExtIni", escrita: "ajustar.estrut.extIni", leitura: false }),
      P(I, "Posição geométrica", "Extensão final", "END_EXTENSION", "comprimento", { calc: "vigaExtFim", escrita: "ajustar.estrut.extFim", leitura: false }),
      P(I, "Posição geométrica", "Recorte do início da união", "START_JOIN_CUTBACK", "comprimento", { calc: "vigaRecorteUniao", casas: 4 })
    );
    /* pilar: inclinado, marca da localização, move com eixos */
    REG.pilar.defs.push(
      P(I, "Restrições", "Estilo de coluna", "SLANTED_COLUMN_TYPE_PARAM", "lista", { calc: "pilarEstilo", opcoes: ["Vertical", "Inclinado - Conduzido por ponto final"], escrita: "ajustar.estrut.estilo", leitura: false }),
      P(I, "Restrições", "Deslocamento do topo em X", "RA_PILAR_TOPO_DX", "comprimento", { calc: "pilarTopoDx", escrita: "ajustar.estrut.topoDx", leitura: false }),
      P(I, "Restrições", "Deslocamento do topo em Y", "RA_PILAR_TOPO_DZ", "comprimento", { calc: "pilarTopoDz", escrita: "ajustar.estrut.topoDz", leitura: false }),
      P(I, "Restrições", "Marca da localização da coluna", "COLUMN_LOCATION_MARK", "texto", { calc: "pilarMarcaLocal", identificador: true, ifc: Q("OrcaPRO_Perfil", "MarcaLocalizacao") }),
      P(I, "Restrições", "Move com eixos", "INSTANCE_MOVES_WITH_GRID_PARAM", "simnao", { calc: "pilarMoveEixos", escrita: "ajustar.estrut.moveComEixos", leitura: false })
    );
    /* escada: regra selecionável, forma, começar/terminar com espelho, revestimento */
    troca("escada", "STAIRSTYPE_CALCULATION_RULES", P(T, "Regras de cálculo", "Regras de cálculo", "STAIRSTYPE_CALCULATION_RULES", "lista", { calc: "escadaRegraNome", opcoes: ["Regras do tipo: piso mínimo do tipo", "Blondel RA: 2e + p entre 63 e 64 cm"], escrita: "ajustarTipo.valores.regra", leitura: false }));
    troca("escada", "RA_ESCADA_AREA_ESPELHO", P(I, "Cotas", "Área de espelho", "RA_ESCADA_AREA_ESPELHO", "area", { calc: "escadaAreaEspelho", ifc: Q("OrcaPRO_Escada", "AreaEspelho"), orc: O("areaEspelho") }));
    REG.escada.defs.push(
      P(I, "Construção", "Forma", "RA_ESCADA_FORMA", "lista", { calc: "escadaFormaNome", opcoes: ["reta", "L", "U"], escrita: "ajustar.escada.forma", leitura: false }),
      P(I, "Construção", "Vão entre os lances (U)", "RA_ESCADA_VAO", "comprimento", { calc: "escadaVao", escrita: "ajustar.escada.vao", leitura: false }),
      P(I, "Construção", "Começar com espelho", "RA_ESCADA_COMECA_ESPELHO", "simnao", { calc: "escadaComeca", escrita: "ajustar.escada.comecaEspelho", leitura: false }),
      P(I, "Construção", "Finalizar com espelho", "RA_ESCADA_TERMINA_ESPELHO", "simnao", { calc: "escadaTermina", escrita: "ajustar.escada.terminaEspelho", leitura: false }),
      P(I, "Materiais e acabamentos", "Revestimento do piso (espessura)", "RA_ESCADA_REV_PISO", "comprimento", { calc: "escadaRevPiso", escrita: "ajustar.escada.revPiso", leitura: false, casas: 3 }),
      P(I, "Materiais e acabamentos", "Revestimento do espelho (espessura)", "RA_ESCADA_REV_ESPELHO", "comprimento", { calc: "escadaRevEspelho", escrita: "ajustar.escada.revEspelho", leitura: false, casas: 3 }),
      P(I, "Materiais e acabamentos", "Material do piso", "RA_ESCADA_MAT_PISO", "texto", { calc: "escadaMatPiso", escrita: "ajustar.escada.matPiso", leitura: false }),
      P(I, "Materiais e acabamentos", "Material do espelho", "RA_ESCADA_MAT_ESPELHO", "texto", { calc: "escadaMatEspelho", escrita: "ajustar.escada.matEspelho", leitura: false }),
      P(I, "Cotas", "Volume do revestimento do piso", "RA_ESCADA_VOL_REV_PISO", "volume", { calc: "escadaVolRevPiso", ifc: Q("OrcaPRO_Escada", "VolumeRevestimentoPiso") }),
      P(I, "Cotas", "Volume do revestimento do espelho", "RA_ESCADA_VOL_REV_ESPELHO", "volume", { calc: "escadaVolRevEspelho", ifc: Q("OrcaPRO_Escada", "VolumeRevestimentoEspelho") })
    );
    troca("lance", "STAIRS_RUN_BEGIN_WITH_RISER", P(I, "Construção", "Começar com espelho", "STAIRS_RUN_BEGIN_WITH_RISER", "simnao", { calc: "lanceComeca" }));
    troca("lance", "STAIRS_RUN_END_WITH_RISER", P(I, "Construção", "Finalizar com espelho", "STAIRS_RUN_END_WITH_RISER", "simnao", { calc: "lanceTermina" }));
    REG.lance.defs.push(
      P(T, "Pisos", "Espessura do piso", "STAIRS_TRISERTYPE_TREAD_THICKNESS", "comprimento", { calc: "escadaRevPiso", casas: 3 }),
      P(T, "Espelhos", "Espessura do espelho", "STAIRS_TRISERTYPE_RISER_THICKNESS", "comprimento", { calc: "escadaRevEspelho", casas: 3 }),
      P(T, "Materiais e acabamentos", "Material do piso", "STAIRS_TRISERTYPE_TREAD_MATERIAL", "material", { calc: "escadaMatPiso" }),
      P(T, "Materiais e acabamentos", "Material do espelho", "STAIRS_TRISERTYPE_RISER_MATERIAL", "material", { calc: "escadaMatEspelho" })
    );
    REG.guarda.defs.push(
      P(I, "Restrições", "Deslocamento a partir do caminho", "STAIRS_RAILING_PLACEMENT_OFFSET", "comprimento", { calc: "guardaDeslocCaminho", escrita: "ajustar.guarda.deslocCaminho", leitura: false }),
      P(T, "Corrimão 1", "Altura", "RAILING_SYSTEM_HANDRAILS_HEIGHT_PARAM", "comprimento", { calc: "guardaC1Altura", campo: "c1Altura", escrita: "ajustarTipo.valores.c1Altura", leitura: false }),
      P(T, "Corrimão 1", "Deslocamento lateral", "RAILING_SYSTEM_HANDRAILS_LATTERAL_OFFSET", "comprimento", { calc: "guardaC1Desloc", campo: "c1Desloc", escrita: "ajustarTipo.valores.c1Desloc", leitura: false }),
      P(T, "Corrimão 2", "Altura", "RAILING_SYSTEM_SECONDARY_HANDRAILS_HEIGHT_PARAM", "comprimento", { calc: "guardaC2Altura", campo: "c2Altura", escrita: "ajustarTipo.valores.c2Altura", leitura: false }),
      P(T, "Corrimão 2", "Deslocamento lateral", "RAILING_SYSTEM_SECONDARY_HANDRAILS_LATTERAL_OFFSET", "comprimento", { calc: "guardaC2Desloc", campo: "c2Desloc", escrita: "ajustarTipo.valores.c2Desloc", leitura: false }),
      P(I, "Cotas", "Comprimento dos corrimãos", "RA_GUARDA_COMP_CORRIMAOS", "comprimento", { calc: "guardaCompCorrimaos", ifc: Q("OrcaPRO_GuardaCorpo", "ComprimentoCorrimaos"), orc: O("comprimentoCorrimao") })
    );
    /* RAMPA (sem inventário coletado: tudo RA_
       com a pendência escrita; a regra é a da NBR 9050, js/bimestrut.js) */
    function PR(lado, grupo, nome, id, dado, o) { o = o || {}; o.revit = PEND_RAMPA; return P(lado, grupo, nome, id, dado, o); }
    REG.rampa = {
      nome: "Rampas", ifc: "IFCRAMP", inventario: null, familia: "Rampa", prefixo: "R", comum: true,
      defs: [
        PR(I, "Restrições", "Nível base", "RA_RAMPA_NIVEL", "nivel", { calc: "nivelNome" }),
        PR(I, "Restrições", "Deslocamento da base", "RA_RAMPA_BASE", "comprimento", { calc: "rampaBase" }),
        PR(I, "Restrições", "Desnível da rampa", "RA_RAMPA_DESNIVEL", "comprimento", { calc: "rampaDesnivel", escrita: "ajustar.rampa.desnivel", leitura: false, faixa: { min: 0.05, max: 6 } }),
        PR(I, "Construção", "Forma", "RA_RAMPA_FORMA", "lista", { calc: "rampaForma", opcoes: ["Reta", "Em U"], escrita: "ajustar.rampa.forma", leitura: false }),
        PR(I, "Cotas", "Largura", "RA_RAMPA_LARGURA", "comprimento", { calc: "rampaLargura", escrita: "ajustar.rampa.largura", leitura: false, faixa: { min: 0.8, max: 6 } }),
        PR(I, "Cotas", "Inclinação", "RA_RAMPA_INCLINACAO", "inclinacao", { calc: "rampaInclinacao", escrita: "ajustar.rampa.inclinacao", leitura: false, faixa: { min: 0.5, max: 8.33 } }),
        PR(I, "Cotas", "Comprimento do patamar", "RA_RAMPA_PATAMAR", "comprimento", { calc: "rampaPatamar", escrita: "ajustar.rampa.patamar", leitura: false, faixa: { min: 0.8, max: 6 } }),
        PR(I, "Cotas", "Espessura", "RA_RAMPA_ESPESSURA", "comprimento", { calc: "rampaEspessura", escrita: "ajustar.rampa.espessura", leitura: false, faixa: { min: 0.06, max: 0.4 } }),
        PR(I, "Cotas", "Segmentos", "RA_RAMPA_SEGMENTOS", "inteiro", { calc: "rampaSegmentos", ifc: Q("OrcaPRO_Rampa", "Segmentos") }),
        PR(I, "Cotas", "Desnível de cada segmento", "RA_RAMPA_H_SEG", "comprimento", { calc: "rampaHSeg" }),
        PR(I, "Cotas", "Comprimento de cada segmento", "RA_RAMPA_L_SEG", "comprimento", { calc: "rampaLSeg" }),
        PR(I, "Cotas", "Volume", "RA_RAMPA_VOLUME", "volume", { calc: "rampaVolume", ifc: Q("OrcaPRO_Rampa", "Volume"), orc: O("volume") }),
        PR(I, "Cotas", "Área de piso", "RA_RAMPA_AREA", "area", { calc: "rampaArea", ifc: Q("OrcaPRO_Rampa", "AreaPiso"), orc: O("area") }),
        PR(I, "Cotas", "Área de projeção", "RA_RAMPA_PROJECAO", "area", { calc: "rampaProjecao", ifc: Q("OrcaPRO_Rampa", "AreaProjecao"), orc: O("areaProjecao") }),
        PR(I, "Cotas", "Área de fôrma", "RA_RAMPA_AREA_FORMA", "area", { calc: "rampaForma2", ifc: Q("OrcaPRO_Rampa", "AreaForma"), orc: O("areaForma") }),
        PR(I, "Cotas", "Comprimento do percurso", "RA_RAMPA_PERCURSO", "comprimento", { calc: "rampaPercurso", ifc: Q("OrcaPRO_Rampa", "Comprimento"), orc: O("comprimento") }),
        PR(I, "Regras de cálculo", "NBR 9050 — faixa de inclinação", "RA_RAMPA_FAIXA", "texto", { calc: "rampaFaixa", filtro: false }),
        PR(I, "Regras de cálculo", "Avisos e conferências", "RA_RAMPA_AVISOS", "texto", { calc: "rampaAvisos", filtro: false, tabela: false })
      ]
    };
  })();

  congelar(COMUM); congelar(REG); congelar(GRUPOS); congelar(DADOS); congelar(FAIXA); congelar(FASES); congelar(FORA);

  /* ================================================== peças do estado */
  var CAT_CAIXA = { parede: "parede", laje: "laje", pilar: "pilar", viga: "viga", escada: "escada", guarda: "guarda", rampa: "rampa" };   /* P9: rampa */
  function catFamilia(f, deps) {
    var c = null;
    if (deps && typeof deps.categoriaFam === "function") c = deps.categoriaFam(f.famId);
    else if (deps && typeof deps.familia === "function") { var fd = deps.familia(f.famId); c = fd && fd.categoria; }
    if (c === "dispositivo_eletrico" || c === "luminaria" || c === "equipamento_eletrico") return c;   /* P12: famílias MEP */
    return c === "porta" || c === "janela" ? c : "generico";
  }
  /* a lista de peças com categoria, na ordem do estado (caixas, coberturas,
     famílias; lances e patamar logo depois da escada deles) */
  function pecasDe(estado, deps) {
    var out = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c) return;
      var cat = CAT_CAIXA[c.tipo]; if (!cat) return;
      out.push({ id: String(c.id), categoria: cat, origem: "caixa", el: c });
      if (cat === "escada" && c.escada) {
        arr(c.escada.lances).forEach(function (l, i) { out.push({ id: c.id + ":lance:" + i, categoria: "lance", origem: "escada", el: c, sub: l, hospedeiro: String(c.id) }); });
        if (c.escada.patamar) out.push({ id: c.id + ":patamar", categoria: "patamar", origem: "escada", el: c, sub: c.escada.patamar, hospedeiro: String(c.id) });
      }
    });
    arr(estado && estado.coberturas).forEach(function (c) { if (c) out.push({ id: String(c.id), categoria: "cobertura", origem: "cobertura", el: c }); });
    /* P2-B: os forros (js/bimforro.js), já derivados no replay */
    arr(estado && estado.forros).forEach(function (f) { if (f) out.push({ id: String(f.id), categoria: "forro", origem: "forro", el: f }); });
    /* P3: telhados, bordas e fundações (js/bimtelhado.js, js/bimfundacao.js), já derivados no replay */
    arr(estado && estado.telhados).forEach(function (t) { if (t) out.push({ id: String(t.id), categoria: "telhado", origem: "telhado", el: t }); });
    arr(estado && estado.bordas).forEach(function (b) { if (b) out.push({ id: String(b.id), categoria: "borda", origem: "borda", el: b }); });
    arr(estado && estado.fundacoes).forEach(function (f) { if (f) out.push({ id: String(f.id), categoria: "fundacao", origem: "fundacao", el: f }); });
    arr(estado && estado.familias).forEach(function (f) { if (f) out.push({ id: String(f.id), categoria: catFamilia(f, deps), origem: "familia", el: f }); });
    /* P2-A: os ambientes (js/bimambiente.js) — só existem quando há op de ambiente */
    arr(estado && estado.ambientes).forEach(function (a) { if (a && a.id != null) out.push({ id: String(a.id), categoria: "ambiente", origem: "ambiente", el: a }); });
    /* P12: as instalações (trechos, conexões, acessórios) — só quando pedidas (deps.mep: a paleta de
       Propriedades); o IFC e o orçamento das instalações seguem pelo js/biminst.js */
    if (deps && deps.mep) {
      var BIr = dep("BimInst", "./biminst.js");
      if (BIr && BIr.pecasRegistro) BIr.pecasRegistro(estado, deps.avaliarFam).forEach(function (q) { out.push({ id: q.id, categoria: q.categoria, origem: "mep", el: q.el }); });
    }
    /* P11: o terreno (js/bimterreno.js) — só existe quando há op do terreno */
    var T11 = estado && estado.terreno, C11 = { topossolido: "topossolido", subregiao: "subregiao", plataforma: "plataforma", divisa: "divisa", compTerreno: "componente_terreno" };
    if (T11) [].concat(arr(T11.topos), arr(T11.subregioes), arr(T11.plataformas), arr(T11.divisas), arr(T11.componentes)).forEach(function (e) { if (e && e.id != null && C11[e.tipo]) out.push({ id: String(e.id), categoria: C11[e.tipo], origem: "terreno", el: e }); });
    return out;
  }

  /* ================================================== tipos (projeto) */
  function cm(v) { return String(Math.round(v * 1000) / 10).replace(".", ","); }
  /* a chave do tipo da peça: o tipo NOMEADO (ajustarTipo.ids) ou o que a
     peça já carrega (tipo de parede, de laje, de escada); sem nada, um tipo
     implícito "auto:" pelo que define a peça (espessura, perfil, material) */
  function tipoIdDe(c, cat, av) {
    if (!c) return null;
    if (c._mep) return txt(c._mep.tipoId);   /* P12 */
    if (cat === "porta" || cat === "janela" || cat === "generico" || cat === "dispositivo_eletrico" || cat === "luminaria" || cat === "equipamento_eletrico") return String(c.famId) + "|" + (av && av.tipo ? av.tipo.id : txt(c.tipoId));   /* P12: + famílias MEP */
    if (c.tipoNomeado != null) return String(c.tipoNomeado);
    if (cat === "parede") return c.tipoParede && c.tipoParede.id ? String(c.tipoParede.id) : "auto:e" + cm(num(c.espessura, 0));
    if (cat === "laje") return c.tipoLaje && c.tipoLaje.id ? String(c.tipoLaje.id) : "auto:e" + cm(num(c.altura, 0));
    if (cat === "pilar" || cat === "viga") return "auto:" + (c.material || "concreto") + "|" + (c.perfilRotulo || (c.perfil && c.perfil.cat) || (c.perfil ? c.perfil.forma : cm(num(c.comprimento, 0)) + "x" + cm(num(c.espessura, 0))));
    if (cat === "escada") { var p = c.escada && c.escada.par; return p && p.tipoId ? String(p.tipoId) : "auto:escada"; }
    if (cat === "guarda") return "auto:guarda";
    if (cat === "cobertura") return "auto:cobertura";
    if (cat === "forro") return c.tipoForro && c.tipoForro.id ? String(c.tipoForro.id) : (c.tipoId ? String(c.tipoId) : "auto:forro");   /* P2-B */
    /* P3: o telhado pelo tipo (camadas); a borda pelo tipo de borda; a fundação pelo tipo e as medidas (um IfcFootingType por medida) */
    if (cat === "telhado") return c.tipoTelhado && c.tipoTelhado.id ? String(c.tipoTelhado.id) : (c.tipoId ? String(c.tipoId) : "auto:telhado");
    if (cat === "borda") return "auto:borda:" + txt(c.tipoBorda);
    if (cat === "fundacao") return "auto:" + txt(c.tipoFundacao) + "|" + nomeFundacao(c);
    return "auto:" + cat;
  }
  function tipoNomeAuto(c, cat, av, deps) {
    var A = dep("BimArq", "./bimarq.js");
    if (c && c._mep) return txt(c._mep.tipoNome);   /* P12 */
    if (cat === "dispositivo_eletrico" || cat === "luminaria" || cat === "equipamento_eletrico") return av && av.tipo ? txt(av.tipo.nome) : txt(c.tipoId);   /* P12 */
    if (cat === "porta" || cat === "janela" || cat === "generico") return av && av.tipo ? txt(av.tipo.nome) : txt(c.tipoId);
    if (cat === "parede") return c.tipoParede && c.tipoParede.rotulo ? txt(c.tipoParede.rotulo) : "Parede " + cm(num(c.espessura, 0)) + " cm";
    if (cat === "laje") return c.tipoLaje && c.tipoLaje.rotulo ? txt(c.tipoLaje.rotulo) : "Laje " + cm(num(c.altura, 0)) + " cm";
    if (cat === "pilar" || cat === "viga") {
      if (c.perfilRotulo) return txt(c.perfilRotulo);
      return cm(num(c.comprimento, 0)) + " × " + cm(num(cat === "pilar" ? c.espessura : c.altura, 0)) + " cm";
    }
    if (cat === "escada") { var p = c.escada && c.escada.par; return A && A.tipoEscada ? A.tipoEscada(p && p.tipoId).rotulo : "Escada"; }
    if (cat === "guarda") { var g = c.guarda && c.guarda.par; return "Guarda-corpo " + cm(num(g && g.altura, 1.1)) + " cm"; }
    if (cat === "cobertura") return "Cobertura " + cm(num(c.espessura, 0)) + " cm";
    if (cat === "forro") return c.tipoForro && c.tipoForro.rotulo ? txt(c.tipoForro.rotulo) : "Forro";   /* P2-B */
    if (cat === "rampa") { var rp = c.rampa && c.rampa.par; return "Rampa " + String(num(rp && rp.inclinacao, 8.33)).replace(".", ",") + " %"; }   /* P9 */
    if (cat === "telhado") return c.tipoTelhado && c.tipoTelhado.rotulo ? txt(c.tipoTelhado.rotulo) : "Telhado";   /* P3 */
    if (cat === "borda") return ({ calha: "Calha", rufo: "Rufo", testeira: "Testeira", intradorso: "Intradorso" })[c.tipoBorda] || "Borda";
    if (cat === "fundacao") return (c.rotuloTipo || "Fundação") + " " + nomeFundacao(c);
    return cat;
  }
  /* P3: as medidas que dão nome ao tipo da fundação ("120 × 120 × 40 cm", "Ø 30 cm × 6,00 m") */
  function nomeFundacao(c) {
    var t = c.tipoFundacao;
    if (t === "estaca") return "Ø " + cm(num(c.diametro, 0)) + " cm × " + String(r4(num(c.comprimentoEstaca, 0))).replace(".", ",") + " m";
    if (t === "radier") return "e = " + cm(num(c.altura, 0)) + " cm";
    if (t === "baldrame") return cm(num(c.largura, 0)) + " × " + cm(num(c.altura, 0)) + " cm";
    var s = cm(num(c.largura, 0)) + " × " + cm(num(c.comprimento, 0)) + " × " + cm(num(c.altura, 0)) + " cm";
    if (t === "bloco") s += ", " + Math.round(num(c.nEstacas, 1)) + " estaca(s) Ø " + cm(num(c.diametro, 0));
    return s;
  }
  /* o perfil do BimArq a partir dos valores do tipo: o nome do catálogo
     (perfil: "W250X73") ou a forma paramétrica com as medidas (m) */
  function perfilDoTipo(v) {
    if (!v) return null;
    if (v.perfil) { var PA = dep("PerfisAco", "./perfisaco.js"); return PA ? PA.paraPerfil(v.perfil) : null; }
    var A = dep("BimArq", "./bimarq.js");
    if (v.forma && A && A.PERFIS[v.forma]) {
      var p = { forma: v.forma };
      A.PERFIS[v.forma].campos.forEach(function (k) { if (fin(Number(v[k[0]]))) p[k[0]] = Number(v[k[0]]); });
      return A.secao(p).ok ? p : null;
    }
    return null;
  }
  /* aplica os valores do TIPO numa peça (no replay, antes do derivar): o que
     o tipo diz vale para todas as instâncias — "Editar tipo" */
  function aplicarTipo(c, cat, t) {
    var A = dep("BimArq", "./bimarq.js"), v = (t && t.valores) || {};
    if (!A || !c || !c.b2) return false;
    if (cat === "pilar" || cat === "viga") {
      var campos = {}, p = perfilDoTipo(v);
      if (p) campos.perfil = p;
      if (v.material && A.MATERIAIS[v.material]) campos.material = v.material;
      return Object.keys(campos).length ? A.ajustar(c, campos) : false;
    }
    if (cat === "laje" && fin(Number(v.espessura)) && Number(v.espessura) >= 0.03) return A.ajustar(c, { tipoLaje: { id: t.id, rotulo: t.nome || "", espessura: Number(v.espessura) } });
    /* P4: virar camadas é do TIPO de parede: vale para todas as instâncias */
    if (cat === "parede" && (v.virarExtremidades != null || v.virarInsercoes != null)) {
      var vr = {}; if (v.virarExtremidades != null) vr.ext = v.virarExtremidades; if (v.virarInsercoes != null) vr.ins = v.virarInsercoes;
      return A.ajustar(c, { virar: vr });
    }
    if (cat === "escada") {
      var e = {};
      ["emax", "pmin", "piso", "larguraMin"].forEach(function (k) { if (fin(Number(v[k])) && v[k] !== null && v[k] !== "") e[k] = Number(v[k]); });
      if (v.regra != null && v.regra !== "") e.regra = String(v.regra);   /* P9: Regras de cálculo (padrão do tipo / Blondel RA) */
      return Object.keys(e).length ? A.ajustar(c, { escada: e }) : false;
    }
    if (cat === "guarda") {
      var g = {};
      ["altura", "espac"].forEach(function (k) { if (fin(Number(v[k])) && v[k] !== null && v[k] !== "") g[k] = Number(v[k]); });
      ["c1Altura", "c1Desloc", "c2Altura", "c2Desloc"].forEach(function (k) { if (fin(Number(v[k])) && v[k] !== null && v[k] !== "") g[k] = Number(v[k]); });   /* P9: corrimãos 1 e 2 */
      return Object.keys(g).length ? A.ajustar(c, { guarda: g }) : false;
    }
    return false;
  }

  /* ===================================================== as ops (replay) */
  function alvo(ctx, id) { return (ctx.caixas && ctx.caixas[id]) || (ctx.fams && ctx.fams[id]) || (ctx.cobs && ctx.cobs[id]) || (ctx.vols && ctx.vols[id]) || (ctx.forros && ctx.forros[id]) || (ctx.p11 && ctx.p11.el[id]) ||
    (ctx.telhados && ctx.telhados[id]) || (ctx.bordas && ctx.bordas[id]) || (ctx.fundacoes && ctx.fundacoes[id]) || null; }   /* P2-B: forros; P11: terreno */
  function catDoAlvo(c) { if (!c) return null; if (c.planos) return "cobertura"; if (c.tipo === "forro" || c.tipo === "telhado" || c.tipo === "borda" || c.tipo === "fundacao") return c.tipo; return CAT_CAIXA[c.tipo] || null; }
  var CAMPOS_MARCAR = ["marca", "comentarios", "imagem", "faseCriada", "faseDemolida", "materialProj"];   /* MATERIAIS: materialProj (o id do material do projeto) */
  var LIM_TXT = { marca: 24, comentarios: 300, imagem: 300, faseCriada: 40, faseDemolida: 40, materialProj: 60 };

  /* ======================================================= marcas */
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  /* marcas automáticas: por categoria, na ordem do estado, as peças sem
     marca gravada ganham <prefixo>NN pulando as já usadas — nunca repete */
  function marcasAuto(pecas) {
    var porCat = {}, out = {}, avisos = [];
    pecas.forEach(function (p) { var R = REG[p.categoria]; if (!R || !R.prefixo || R.virtual) return; (porCat[p.categoria] = porCat[p.categoria] || []).push(p); });
    Object.keys(porCat).forEach(function (cat) {
      var usadas = {}, pref = REG[cat].prefixo, n = 1;
      porCat[cat].forEach(function (p) {
        var mk = p.el && p.el.marca ? txt(p.el.marca) : "";
        if (!mk) return;
        if (usadas[mk]) avisos.push("Marca \"" + mk + "\" repetida em " + REG[cat].nome + " (" + usadas[mk] + " e " + p.id + ").");
        else usadas[mk] = p.id;
      });
      porCat[cat].forEach(function (p) {
        if (p.el && p.el.marca) return;
        while (usadas[pref + pad2(n)]) n++;
        out[p.id] = pref + pad2(n); usadas[pref + pad2(n)] = p.id; n++;
      });
    });
    return { marcas: out, avisos: avisos };
  }

  /* ===================================================== globais e projeto */
  function nomeValido(n) { return /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*$/.test(txt(n)); }
  /* GLOBAIS: {nome, valor} ou {nome, formula} — fórmula pelo avaliador do
     js/familia.js (sem eval), podendo usar outras globais; ciclo é recusado */
  function avaliarGlobais(globais) {
    var F = dep("Familia", "./familia.js"), lista = arr(globais), defs = {}, erros = [], valores = {};
    lista.forEach(function (g) {
      if (!g || !nomeValido(g.nome)) { erros.push("global com nome inválido: \"" + txt(g && g.nome) + "\""); return; }
      var k = String(g.nome).toLowerCase();
      if (defs[k]) { erros.push("global \"" + g.nome + "\" repetida"); return; }
      defs[k] = g;
    });
    var estado = {};
    function calc(k, pilha) {
      if (estado[k] === 2) return;
      if (estado[k] === 1) { erros.push("as globais dependem umas das outras em círculo: " + pilha.concat([k]).join(" → ")); valores[k] = NaN; return; }
      estado[k] = 1;
      var g = defs[k], v;
      if (g.formula != null && String(g.formula).trim() !== "") {
        if (!F) { erros.push("o avaliador de fórmula (js/familia.js) não carregou"); v = NaN; }
        else {
          try {
            F.referencias(String(g.formula)).forEach(function (r) { var rk = r.toLowerCase(); if (defs[rk]) calc(rk, pilha.concat([k])); });
            var env = {}; Object.keys(valores).forEach(function (q) { if (fin(valores[q])) env[q] = valores[q]; });
            v = F.formula(String(g.formula), env);
          } catch (e) { erros.push("global \"" + g.nome + "\": " + (e && e.message)); v = NaN; }
        }
      } else v = num(g.valor, NaN);
      valores[k] = v; estado[k] = 2;
    }
    Object.keys(defs).forEach(function (k) { calc(k, []); });
    var saida = {};
    Object.keys(defs).forEach(function (k) { saida[defs[k].nome] = valores[k]; });
    return { ok: !erros.length, valores: saida, erros: erros };
  }
  /* PARÂMETROS DO PROJETO: {id, nome, dado, lado, categorias[], grupo?,
     padrao?, formula?}. Os inválidos saem com o motivo. */
  function sanearProjeto(p) {
    p = p || {};
    var parametros = [], erros = [], ids = {}, nomes = {};
    arr(p.parametros).forEach(function (d, i) {
      var r = "parâmetro " + (i + 1);
      if (!d || !txt(d.nome).trim()) { erros.push(r + ": sem nome"); return; }
      var id = txt(d.id || d.nome).trim().replace(/\s+/g, "_").slice(0, 40);
      if (!DADOS[d.dado]) { erros.push(r + " (\"" + d.nome + "\"): tipo de dado \"" + txt(d.dado) + "\" desconhecido"); return; }
      if (d.lado !== "tipo" && d.lado !== "instancia") { erros.push(r + " (\"" + d.nome + "\"): lado deve ser tipo ou instancia"); return; }
      var cats = arr(d.categorias).filter(function (c) { return REG[c] && !REG[c].virtual; });
      if (!cats.length) { erros.push(r + " (\"" + d.nome + "\"): nenhuma categoria válida"); return; }
      if (ids[id] || nomes[txt(d.nome).trim().toLowerCase()]) { erros.push(r + " (\"" + d.nome + "\"): repetido"); return; }
      ids[id] = 1; nomes[txt(d.nome).trim().toLowerCase()] = 1;
      parametros.push({ id: id, nome: txt(d.nome).trim().slice(0, 80), dado: d.dado, lado: d.lado, categorias: cats,
                        grupo: GRUPOS.indexOf(d.grupo) >= 0 ? d.grupo : "Parâmetros do projeto",
                        padrao: escalar(d.padrao) ? d.padrao : null, formula: d.formula != null && String(d.formula).trim() ? String(d.formula).slice(0, 300) : null });
    });
    var globais = arr(p.globais).filter(function (g) { return g && nomeValido(g.nome); }).map(function (g) {
      var o = { nome: String(g.nome) };
      if (g.formula != null && String(g.formula).trim()) o.formula = String(g.formula).slice(0, 300); else o.valor = num(g.valor, 0);
      return o;
    });
    return { parametros: parametros, globais: globais, erros: erros };
  }
  function defProjeto(d) {
    return congelar({
      id: "PROJ:" + d.id, nome: d.nome, grupo: d.grupo, lado: d.lado, dado: d.dado, un: DADOS[d.dado].un,
      leitura: !!d.formula, fonte: "projeto", campo: d.id, calc: null, faixa: null, padrao: d.padrao, opcoes: null, casas: null,
      ifc: { pset: "Pset_OrcaPRO_Projeto", prop: d.nome }, orc: null, tabela: true, filtro: true, identificador: false,
      escrita: d.formula ? null : (d.lado === "tipo" ? "ajustarTipo.valores.param:" + d.id : "marcar.params." + d.id), revit: null, formula: d.formula
    });
  }
  /* os parâmetros PRÓPRIOS da família (o que ela declara), no grupo dela */
  function defsDaFamilia(fam) {
    return arr(fam && fam.parametros).filter(function (p) { return p && nomeValido(p.nome) && !FAM_MAPEADOS[String(p.nome).toLowerCase()]; }).map(function (p) {
      var dado = DADOS[p.tipoDado] ? p.tipoDado : "numero";
      /* FAMIMPORT (js/familiamalha.js): o nome ORIGINAL da família importada (`rotulo`), o parâmetro com fórmula na
         família é de leitura (`somenteLeitura`), a lista de opções e a unidade de grandeza fora do SI (W, lm, K) */
      var imp = !!p.importado, lista = imp && Array.isArray(p.opcoes) && p.opcoes.length, leit = !!p.formula || (imp && !!p.somenteLeitura);
      if (lista) dado = "lista";
      return congelar({
        id: "FAM:" + p.nome, nome: imp && p.rotulo ? String(p.rotulo) : String(p.nome).replace(/_/g, " "), grupo: txt(p.grupo) || "Outros", lado: p.escopo === "tipo" ? "tipo" : "instancia",
        dado: dado, un: imp && dado === "numero" && p.unidade ? String(p.unidade) : DADOS[dado].un, leitura: leit, fonte: "familia", campo: p.nome, calc: null, faixa: null, padrao: null, opcoes: lista ? p.opcoes.slice() : null, casas: null,
        ifc: null, orc: null, tabela: true, filtro: true, identificador: false,
        escrita: leit ? null : (p.escopo === "tipo" ? "família (tipo)" : "instancia.inst." + p.nome), revit: null
      });
    });
  }

  /* ======================================================= formatação */
  function br(v, casas) {
    var s = (Math.round(v * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    var p = s.split("."), inteiro = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + inteiro + (p[1] ? "," + p[1] : "");
  }
  function formatar(valor, def) {
    if (valor == null || valor === "") return "";
    var d = DADOS[def && def.dado] || DADOS.texto;
    if (def && def.dado === "simnao") return valor ? "Sim" : "Não";
    if (!d.num) return String(valor);
    var n = Number(valor); if (!isFinite(n)) return "";
    var casas = def.casas != null ? def.casas : d.casas;
    /* comprimento: 2 casas, 3 quando o milímetro conta (espelho de 0,175 m) */
    if (def.dado === "comprimento" && def.casas == null && Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) casas = 3;
    var un = def.un != null ? def.un : d.un;
    return br(n, casas) + (un ? (un === "°" ? "" : " ") + un : "");
  }

  /* ===================================================== resolver */
  function nivelPorId(niveis, id) {
    if (id == null) return null;
    var l = arr(niveis); for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(id)) return l[i];
    return null;
  }
  function tiposDoEstado(estado) { return (estado && estado.projeto && estado.projeto.tipos) || {}; }
  function acharTipo(estado, cat, id) {
    var l = arr(tiposDoEstado(estado)[cat]); for (var i = 0; i < l.length; i++) if (String(l[i].id) === String(id)) return l[i];
    return null;
  }
  function defsDe(cat, extra) {
    var R = REG[cat]; if (!R) return [];
    var com = R.comum === true ? COMUM : (R.comum === "leitura" ? COMUM.filter(function (d) { return d.fonte === "derivado" && d.leitura; }) : []);
    return R.defs.concat(com).concat(extra || []);
  }
  function valorDe(def, x) {
    var v;
    if (def.fonte === "derivado") v = CALC[def.calc] ? CALC[def.calc](x) : null;
    else if (def.fonte === "op") { var c = x.el || {}; v = def.campo && temChave(c, def.campo) ? c[def.campo] : null; if ((v == null || v === "") && def.padrao != null) v = def.padrao; }
    else if (def.fonte === "tipo") {
      var tv = x.tipo && x.tipo.valores;
      if (def.campo && tv && temChave(tv, def.campo) && tv[def.campo] !== null && tv[def.campo] !== "") v = tv[def.campo];
      else if (def.calc && CALC[def.calc]) v = CALC[def.calc](x);
      else v = def.padrao;
    } else if (def.fonte === "projeto") {
      if (def.formula) {
        var F = dep("Familia", "./familia.js");
        try { v = F ? F.formula(def.formula, x.globais || {}) : null; } catch (e) { v = null; }
      } else if (def.lado === "tipo") { var tv2 = x.tipo && x.tipo.valores; v = tv2 && temChave(tv2, "param:" + def.campo) ? tv2["param:" + def.campo] : def.padrao; }
      else { var pr = x.el && x.el.params; v = pr && temChave(pr, def.campo) ? pr[def.campo] : def.padrao; }
    } else if (def.fonte === "familia") v = x.av && x.av.valores && temChave(x.av.valores, def.campo) ? x.av.valores[def.campo] : null;
    return v === undefined ? null : v;
  }
  /* P1-D: o valor veio do que o USUÁRIO gravou (na op, no tipo, no projeto,
     na família) — e não de conta nem do padrão da definição. É o que vai no
     Pset_OrcaPRO do IFC quando a definição não tem lugar próprio (ifc). */
  function cheio(v) { return v != null && v !== ""; }
  function deUsuario(def, x) {
    if (def.fonte === "op") return !!def.campo && temChave(x.el || {}, def.campo) && cheio(x.el[def.campo]);
    if (def.fonte === "tipo") { var tv = x.tipo && x.tipo.valores; return !!def.campo && !!tv && temChave(tv, def.campo) && cheio(tv[def.campo]); }
    if (def.fonte === "projeto") return !def.formula;
    if (def.fonte === "familia") return !!x.av && !!x.av.valores && temChave(x.av.valores, def.campo);
    return false;
  }
  /* as medidas do orçamento na ordem em que a tela as oferece */
  var ORDEM_MEDIDAS = ["area", "areaBruta", "volume", "comprimento", "areaForma", "areaProjecao", "areaFora", "areaDentro", "massa", "quantidade"];

  var BimParam = {
    GRUPOS: GRUPOS, DADOS: DADOS, FASES: FASES, FAIXA: FAIXA, COMUM: COMUM, REGISTRO: REG, CALC: CALC, FORA: FORA,

    /* ------------------------------------------------- consulta da tabela */
    categorias: function () { return Object.keys(REG); },
    /* as definições de uma categoria (próprias + comuns), na ordem da tabela */
    definicoes: function (cat) { return defsDe(cat); },
    definicao: function (cat, id) { var l = defsDe(cat); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; },
    /* a definição do registro que dá a quantidade de uma medida do orçamento
       (BimEdit.MEDIDAS_ORC) — a ponte da Frente D */
    porMedida: function (cat, medida) { return defsDe(cat).filter(function (d) { return d.orc && d.orc.medida === medida; })[0] || null; },
    /* P1-D — a mesma medida pode vir de mais de uma definição, uma por
       material (areaForma: Área de pintura no aço, Área de fôrma no concreto,
       Área de superfície na madeira; só uma tem valor na peça) */
    defsMedida: function (cat, medida) { return defsDe(cat).filter(function (d) { return d.orc && d.orc.medida === medida; }); },
    /* as medidas que o orçamento oferece numa categoria, pelo registro */
    medidasOrc: function (cat) {
      var tem = {}; defsDe(cat).forEach(function (d) { if (d.orc && d.orc.medida) tem[d.orc.medida] = 1; });
      return ORDEM_MEDIDAS.filter(function (k) { return tem[k]; }).concat(Object.keys(tem).filter(function (k) { return ORDEM_MEDIDAS.indexOf(k) < 0; }));
    },
    /* a QUANTIDADE de uma medida numa peça resolvida: { def, valor, valorOrc }
       da definição que tem valor (ou null — a peça não tem essa medida).
       P1-acab: `valor` = a do registro, com precisão total (a do IFC);
       `valorOrc` = a RÉGUA DO ORÇAMENTO de sempre (4 casas, arredondada passo
       a passo como antes) — é a que o js/orcmodelo.js multiplica pelo preço,
       para o total de orçamento existente não mudar. */
    quantidade: function (peca, medida) {
      var l = arr(peca && peca.params);
      for (var i = 0; i < l.length; i++) { var it = l[i]; if (it.def.orc && it.def.orc.medida === medida && fin(it.valor)) return { def: it.def, valor: it.valor, valorOrc: fin(it.valorOrc) ? it.valorOrc : it.valor }; }
      return null;
    },
    formatar: formatar,
    tipoIdDe: tipoIdDe,
    perfilDoTipo: perfilDoTipo,
    aplicarTipo: aplicarTipo,
    pecas: pecasDe,

    /* ------------------------------------------------- resolver
     * deps (todos opcionais):
     *   avaliarFam(famId, tipoId, inst) → Familia.avaliar (o do BimEdit.qto)
     *   categoriaFam(famId) → 'porta' | 'janela' | … ; familia(famId) → a família
     *   nomeFam(famId) → nome da família
     *   niveis: [{id, nome, elevacao}]
     *   projeto: {parametros, globais} (sanearProjeto)
     *   ifcGuid(peca) → o GlobalId que o js/ifcsaida.js dá à peça
     *   areaVaos: {paredeId: m²} — P1-D: a área dos vãos já medida (o
     *     orçamento de UMA peça, OrcModelo.daElemento, recebe só ela)
     * Devolve { pecas: [peca…], porId: {id: peca}, avisos: [], globais: {} }
     * peca = { id, categoria, nomeCategoria, origem, hospedeiro, tipoId,
     *          tipoNome, marca, params: [{def, valor, texto, usuario}], porId: {defId: item} }
     * (usuario: o valor veio do que o usuário gravou — P1-D, Pset_OrcaPRO) */
    resolver: function (estado, deps) {
      deps = deps || {};
      var E = dep("BimEdit", "./bimedit.js"), A = dep("BimArq", "./bimarq.js"), PA = dep("PerfisAco", "./perfisaco.js"), BPt = dep("BimPintar", "./bimpintar.js");   /* P4: pintura */
      var avaliarFam = typeof deps.avaliarFam === "function" ? deps.avaliarFam : null;
      var vaos = E && avaliarFam ? E.vaosDasParedes(estado, avaliarFam) : {};
      if (deps.areaVaos) Object.keys(deps.areaVaos).forEach(function (k) { if (fin(deps.areaVaos[k])) vaos[k] = { areaVaos: deps.areaVaos[k] }; });
      /* EMBREVE: graute e armadura das paredes de alvenaria estrutural (js/bimgraute.js) — uma conta para o modelo inteiro (os cantos são de uma parede só) */
      var BGr = dep("BimGraute", "./bimgraute.js"), GR = null;
      try { if (BGr && BGr.calcular && arr(estado && estado.caixas).some(function (q) { return q && q.graute && q.graute.ativo; })) GR = BGr.calcular(estado, vaos); } catch (eGr) { GR = null; }
      var pecas = pecasDe(estado, deps), MA = marcasAuto(pecas), avisos = MA.avisos.slice();
      var proj = sanearProjeto(deps.projeto || {}), glob = avaliarGlobais(proj.globais);
      proj.erros.forEach(function (e) { avisos.push(e); }); glob.erros.forEach(function (e) { avisos.push(e); });
      var globEnv = {}; Object.keys(glob.valores).forEach(function (k) { if (fin(glob.valores[k])) globEnv[k] = glob.valores[k]; });
      var defsProj = {}; proj.parametros.forEach(function (d) { d.categorias.forEach(function (c) { (defsProj[c] = defsProj[c] || []).push(defProjeto(d)); }); });
      /* marca de TIPO automática: por categoria, na ordem em que os tipos aparecem */
      var tiposVistos = {}, marcaTipo = {};
      function marcaDoTipo(cat, tid, tipo) {
        var R = REG[cat]; if (!R || !R.prefixo) return null;
        var k = cat + "|" + tid; if (marcaTipo[k]) return marcaTipo[k];
        var vis = tiposVistos[cat] || (tiposVistos[cat] = { n: 0, usadas: {} });
        arr(tiposDoEstado(estado)[cat]).forEach(function (t) { if (t.valores && t.valores.marcaTipo) vis.usadas[txt(t.valores.marcaTipo)] = 1; });
        if (tipo && tipo.valores && tipo.valores.marcaTipo) return (marcaTipo[k] = txt(tipo.valores.marcaTipo));
        do { vis.n++; } while (vis.usadas[R.prefixo + "-" + vis.n]);
        vis.usadas[R.prefixo + "-" + vis.n] = 1;
        return (marcaTipo[k] = R.prefixo + "-" + vis.n);
      }
      var cacheAv = {}, saida = [], porId = {};
      pecas.forEach(function (p) {
        var c = p.el, R = REG[p.categoria], av = null;
        if (p.origem === "familia" && avaliarFam) {
          var ka = JSON.stringify([c.famId, c.tipoId, c.inst]);
          av = temChave(cacheAv, ka) ? cacheAv[ka] : (cacheAv[ka] = avaliarFam(c.famId, c.tipoId, c.inst));
        }
        var tid = tipoIdDe(c, p.categoria === "lance" || p.categoria === "patamar" ? "escada" : p.categoria, av);
        var tipo = acharTipo(estado, p.categoria, tid);
        var nivelId = p.origem === "familia" && c.host && estado ? (function () { var h = arr(estado.caixas).filter(function (q) { return q && String(q.id) === String(c.host.id); })[0]; return h ? h.nivelId : null; })() : c.nivelId;
        var x = {
          el: c, sub: p.sub || null, cat: p.categoria, reg: R, av: av,
          /* P1-acab: a medida EXATA (registro e IFC); a régua do orçamento vai em xOrc, abaixo. P2-A: ambiente não é caixa */
          m: p.origem === "familia" || p.origem === "ambiente" || p.origem === "mep" || !E ? null : E.medidasDe(c, vaos[c.id] ? vaos[c.id].areaVaos : 0, true),   /* P12: mep já vem medido */
          areaVaos: vaos[c.id] ? vaos[c.id].areaVaos : 0,
          camadas: p.categoria === "parede" && A && c.tipoParede ? A.camadasDe(c, vaos[c.id] ? vaos[c.id].areaVaos : 0, vaos[c.id] ? vaos[c.id].aceitos : null) : null,
          /* P4: a virada das camadas (extremidades livres + requadro dos vãos) e os nomes da linha de localização */
          virada: p.categoria === "parede" && A && A.areasVirada && c.virar ? A.areasVirada(c, vaos[c.id] ? vaos[c.id].aceitos : null) : null,
          linhasLoc: A && A.LINHAS_LOC ? A.LINHAS_LOC : null,
          /* P4-D: as regiões pintadas com a área de cada uma (js/bimpintar.js; líquidas dos vãos) */
          pinturas: c && c.pinturas && BPt ? BPt.regioes(c, vaos[c.id] ? vaos[c.id].aceitos : null) : null,
          graute: p.categoria === "parede" && GR && c ? GR.paredes[c.id] || null : null,   /* EMBREVE */
          sec: (p.categoria === "pilar" || p.categoria === "viga") && c.perfil && A ? A.secao(c.perfil) : null,
          catPerfil: (p.categoria === "pilar" || p.categoria === "viga") && c.perfil && c.perfil.cat && PA ? PA.obter(c.perfil.cat) : null,
          perfis: A ? A.PERFIS : {}, materiais: A ? A.MATERIAIS : {},
          nivel: nivelPorId(deps.niveis, nivelId), nivelSup: nivelPorId(deps.niveis, p.origem === "ambiente" ? (c.calc && c.calc.limiteSuperior) : c.restricaoSuperior),
          tipo: tipo, tipoId: tid,
          tipoNome: tipo && tipo.nome ? tipo.nome : tipoNomeAuto(c, p.categoria === "lance" || p.categoria === "patamar" ? "escada" : p.categoria, av, deps),
          familiaNome: R && R.familia ? R.familia : (p.origem === "familia" ? (typeof deps.nomeFam === "function" ? deps.nomeFam(c.famId) : null) || txt(c.famId) : (c && c._mep ? txt(c._mep.familia) : null)),   /* P12: mep */
          marcaAuto: MA.marcas[p.id] || null,
          marcaTipoAuto: marcaDoTipo(p.categoria, tid, tipo),
          ifcGuid: typeof deps.ifcGuid === "function" ? deps.ifcGuid(p) : null,
          globais: globEnv
        };
        if (p.categoria === "patamar" && p.sub && A) x.subArea = Math.abs(A.areaSinal(arr(p.sub.pts).map(function (q) { return [q.x, q.z]; })));
        var extra = (defsProj[p.categoria] || []).slice();
        if (p.origem === "familia" && typeof deps.familia === "function") extra = extra.concat(defsDaFamilia(deps.familia(c.famId)));
        /* P1-acab: a mesma conta com a RÉGUA DO ORÇAMENTO (BimEdit.medidasDe de 4 casas e
           o arredondamento de sempre nos derivados) — só nas definições com `orc` */
        var xOrc = null;
        function contextoOrc() {
          if (xOrc) return xOrc;
          xOrc = {}; Object.keys(x).forEach(function (k) { xOrc[k] = x[k]; });
          xOrc.m = p.origem === "familia" || !E ? null : E.medidasDe(c, vaos[c.id] ? vaos[c.id].areaVaos : 0);
          xOrc.regua = true;
          return xOrc;
        }
        var itens = defsDe(p.categoria, extra).map(function (d) {
          var v = valorDe(d, x), it = { def: d, valor: v, texto: formatar(v, d), usuario: deUsuario(d, x) };
          if (d.orc && fin(v)) it.valorOrc = valorDe(d, contextoOrc());
          return it;
        });
        /* FAMIMPORT: a família importada declara "Largura bruta", "Espessura"… com o MESMO nome de uma definição do
           registro — um só por nome e lado: o do registro quando ele tem valor (leva o IFC e o mapeamento), senão o da família */
        if (av && av.importada) {
          var porNomeLado = {};
          itens.forEach(function (it) { var kk = String(it.def.nome).toLowerCase() + "|" + it.def.lado; (porNomeLado[kk] = porNomeLado[kk] || []).push(it); });
          var fora = [];
          Object.keys(porNomeLado).forEach(function (kk) {
            var g = porNomeLado[kk]; if (g.length < 2) return;
            var cheioIt = function (it) { return it.valor != null && it.valor !== ""; };
            /* o do registro fica quando é conta do modelo ou valor gravado pelo usuário; o padrão da definição perde para o valor do arquivo */
            var fica = g.filter(function (it) { return it.def.fonte !== "familia" && cheioIt(it) && (it.usuario || it.def.fonte === "derivado"); })[0] ||
                       g.filter(function (it) { return it.def.fonte === "familia"; })[0] || g[0];
            g.forEach(function (it) { if (it !== fica) fora.push(it); });
          });
          if (fora.length) itens = itens.filter(function (it) { return fora.indexOf(it) < 0; });
        }
        var mapa = {}; itens.forEach(function (it) { mapa[it.def.id] = it; });
        /* FAMIMPORT: o recado honesto da família importada (geometria pendente; medida que só muda o valor) — com o id da peça, a paleta filtra por ele */
        if (av && av.importada && arr(av.avisos).length) arr(av.avisos).forEach(function (a) { avisos.push("Família importada (peça " + p.id + "): " + a + "."); });
        var pc = { id: p.id, categoria: p.categoria, nomeCategoria: R ? R.nome : p.categoria, origem: p.origem, hospedeiro: p.hospedeiro || null,
                   tipoId: tid, tipoNome: x.tipoNome, marca: mapa.ALL_MODEL_MARK ? mapa.ALL_MODEL_MARK.valor : null, params: itens, porId: mapa };
        saida.push(pc); porId[p.id] = pc;
      });
      return { pecas: saida, porId: porId, avisos: avisos, globais: glob.valores };
    },
    /* os grupos da peça na ordem de GRUPOS: [{grupo, itens:[{def, valor, texto}]}].
       opts.lado: "instancia" (padrão — a paleta de Propriedades), "tipo"
       (Editar tipo) ou "todos" */
    secoes: function (peca, opts) {
      var lado = (opts && opts.lado) || "instancia", g = {}, ordem = [];
      arr(peca && peca.params).forEach(function (it) {
        if (lado !== "todos" && it.def.lado !== lado) return;
        if (!g[it.def.grupo]) { g[it.def.grupo] = []; ordem.push(it.def.grupo); }
        g[it.def.grupo].push(it);
      });
      ordem.sort(function (a, b) {
        var ia = GRUPOS.indexOf(a), ib = GRUPOS.indexOf(b);
        if (ia < 0) ia = GRUPOS.length; if (ib < 0) ib = GRUPOS.length;
        return ia - ib;
      });
      return ordem.map(function (k) { return { grupo: k, itens: g[k] }; });
    },
    valor: function (peca, id) { var it = peca && peca.porId && peca.porId[id]; return it ? it.valor : undefined; },
    texto: function (peca, id) { var it = peca && peca.porId && peca.porId[id]; return it ? it.texto : undefined; },

    /* ------------------------------------------------- tipos nomeados */
    /* os tipos de uma categoria: os do projeto (ajustarTipo) + os implícitos
       em uso, cada um com as instâncias. Puro. */
    tipos: function (estado, cat, deps) {
      var out = [], idx = {};
      arr(tiposDoEstado(estado)[cat]).forEach(function (t) { idx[t.id] = out.length; out.push({ id: t.id, nome: t.nome, valores: clone(t.valores || {}), projeto: true, instancias: [] }); });
      pecasDe(estado, deps).forEach(function (p) {
        if (p.categoria !== cat) return;
        var av = p.origem === "familia" && deps && deps.avaliarFam ? deps.avaliarFam(p.el.famId, p.el.tipoId, p.el.inst) : null;
        var tid = tipoIdDe(p.el, cat, av);
        if (!temChave(idx, tid)) { idx[tid] = out.length; out.push({ id: tid, nome: tipoNomeAuto(p.el, cat, av, deps), valores: {}, projeto: false, instancias: [] }); }
        out[idx[tid]].instancias.push(p.id);
      });
      return out;
    },
    /* "EDITAR TIPO": a op que muda o tipo e, com ele, TODAS as instâncias.
       Tipo implícito ("auto:…") vira tipo nomeado novo, com as instâncias
       dentro (senão a peça mudaria de chave ao mudar de perfil). Puro: não
       mexe no estado; devolve { ok, op, instancias } ou { ok:false, motivo }. */
    editarTipo: function (estado, cat, tipoId, valores, nome, deps) {
      if (!REG[cat] || REG[cat].virtual || REG[cat].semTipo) return { ok: false, motivo: "Categoria sem tipo editável: " + cat + "." };
      var v = valores || {}, ruins = Object.keys(v).filter(function (k) { return !escalar(v[k]); });
      if (ruins.length) return { ok: false, motivo: "Valor de tipo tem de ser simples (número, texto, sim/não): " + ruins.join(", ") + "." };
      if ((cat === "pilar" || cat === "viga") && (v.perfil || v.forma) && !perfilDoTipo(v)) return { ok: false, motivo: "Perfil não encontrado ou medidas inválidas." };
      var lista = BimParam.tipos(estado, cat, deps), t = lista.filter(function (q) { return String(q.id) === String(tipoId); })[0];
      if (!t) return { ok: false, motivo: "Tipo não encontrado: " + tipoId + "." };
      var op = { op: "ajustarTipo", categoria: cat, tipoId: String(tipoId) };
      if (!t.projeto) {
        op.tipoId = BimParam.novoTipoId(estado, cat, nome || t.nome);
        op.nome = String(nome || t.nome).slice(0, 80);
        op.ids = t.instancias.slice();
      } else if (nome) op.nome = String(nome).slice(0, 80);
      if (Object.keys(v).length) op.valores = clone(v);
      return { ok: true, op: op, instancias: t.instancias.slice() };
    },
    /* tipo novo (vazio ou com valores) e, opcionalmente, peças dentro dele */
    criarTipo: function (estado, cat, nome, valores, ids) {
      if (!REG[cat] || REG[cat].virtual || REG[cat].semTipo) return { ok: false, motivo: "Categoria sem tipo editável: " + cat + "." };
      if (!txt(nome).trim()) return { ok: false, motivo: "O tipo precisa de nome." };
      var op = { op: "ajustarTipo", categoria: cat, tipoId: BimParam.novoTipoId(estado, cat, nome), nome: String(nome).trim().slice(0, 80) };
      if (valores && Object.keys(valores).length) op.valores = clone(valores);
      if (arr(ids).length) op.ids = arr(ids).map(String);
      return { ok: true, op: op };
    },
    /* id determinístico pelo nome, sem colidir com os do projeto */
    novoTipoId: function (estado, cat, nome) {
      var base = cat + "-" + (txt(nome).toLowerCase().normalize ? txt(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(nome).toLowerCase()).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
      var usados = {}; arr(tiposDoEstado(estado)[cat]).forEach(function (t) { usados[t.id] = 1; });
      var id = base || cat + "-tipo", n = 2;
      while (usados[id]) id = base + "-" + (n++);
      return id;
    },

    /* ------------------------------------------------- marca */
    /* a op que grava a marca de uma peça; marca repetida na mesma categoria é
       recusada (a automática nunca repete) */
    opMarcar: function (res, id, marca) {
      var p = res && res.porId && res.porId[id];
      if (!p) return { ok: false, motivo: "Peça não encontrada: " + id + "." };
      if (REG[p.categoria] && REG[p.categoria].virtual) return { ok: false, motivo: "Lance e patamar levam a marca da escada." };
      var mk = txt(marca).trim().slice(0, 24);
      if (mk) {
        var dono = arr(res.pecas).filter(function (q) { return q.id !== id && q.categoria === p.categoria && q.marca === mk; })[0];
        if (dono) return { ok: false, motivo: "A marca \"" + mk + "\" já é de outra peça (" + dono.id + ") em " + p.nomeCategoria + "." };
      }
      return { ok: true, op: { op: "marcar", id: p.id, marca: mk } };
    },
    /* RENUMERAR: a categoria inteira em sequência (<prefixo>01, 02…) na ordem
       do modelo. Devolve a op de lote { op:"marcar", marcas:{id: marca} }. */
    opRenumerar: function (res, cat) {
      var R = REG[cat]; if (!R || !R.prefixo) return { ok: false, motivo: "Categoria sem marca: " + cat + "." };
      var marcas = {}, n = 0;
      arr(res && res.pecas).forEach(function (p) { if (p.categoria === cat) marcas[p.id] = R.prefixo + pad2(++n); });
      if (!n) return { ok: false, motivo: "Nenhuma peça em " + R.nome + "." };
      return { ok: true, op: { op: "marcar", marcas: marcas } };
    },
    marcasAuto: function (estado, deps) { return marcasAuto(pecasDe(estado, deps)); },

    /* ------------------------------------------------- projeto */
    sanearProjeto: sanearProjeto,
    avaliarGlobais: avaliarGlobais,

    /* ------------------------------------------------- ganchos do replay
     * Chamados pelo js/bimedit.js (blocos "P1-A"). aplicarOp → true se a op
     * valeu; antesDerivar aplica os tipos e publica estado.projeto.tipos. */
    aplicarOp: function (o, ctx) {
      if (!o || !ctx) return false;
      var E = dep("BimEdit", "./bimedit.js");
      if (E && E.opParamValida && !E.opParamValida(o)) return false;
      var Pm = ctx.param || (ctx.param = { tipos: {}, ordem: {} });
      if (o.op === "ajustarTipo") {
        var cat = String(o.categoria), tid = String(o.tipoId);
        if (!REG[cat] || REG[cat].virtual || REG[cat].semTipo) return false;
        var mapa = Pm.tipos[cat] || (Pm.tipos[cat] = {}), ord = Pm.ordem[cat] || (Pm.ordem[cat] = []);
        /* P10 — Limpar não utilizados: o tipo do projeto sai (só o que não tem instância; com instância, recusa) */
        if (o.apagar === true) {
          if (!mapa[tid]) return false;
          var emUso = ["caixas", "fams", "cobs", "vols", "forros"].some(function (k) { var m0 = ctx[k] || {}; return Object.keys(m0).some(function (q) { return m0[q] && m0[q].tipoNomeado === tid && catDoAlvo(m0[q]) === cat; }); });
          if (emUso) return false;
          delete mapa[tid]; Pm.ordem[cat] = ord.filter(function (q) { return q !== tid; });
          return true;
        }
        var t = mapa[tid];
        if (!t) { t = mapa[tid] = { id: tid, nome: tid, valores: {} }; ord.push(tid); }
        if (o.nome != null && txt(o.nome).trim()) t.nome = txt(o.nome).trim().slice(0, 80);
        if (o.valores) Object.keys(o.valores).forEach(function (k) {
          var v = o.valores[k];
          if (v === null) delete t.valores[k]; else t.valores[k] = typeof v === "string" ? v.slice(0, 300) : v;
        });
        arr(o.ids).forEach(function (id) { var c = alvo(ctx, id); if (c && catDoAlvo(c) === cat) c.tipoNomeado = tid; });
        return true;
      }
      if (o.op === "marcar") {
        if (o.marcas) {
          Object.keys(o.marcas).forEach(function (id) { var c = alvo(ctx, id); if (!c) return; var mk = txt(o.marcas[id]).trim().slice(0, 24); if (mk) c.marca = mk; else delete c.marca; });
          return true;
        }
        var c2 = alvo(ctx, o.id); if (!c2) return false;
        CAMPOS_MARCAR.forEach(function (k) {
          if (o[k] == null) return;
          var s = txt(o[k]).trim().slice(0, LIM_TXT[k]);
          if (s) c2[k] = s; else delete c2[k];
        });
        if (o.params) {
          var pr = c2.params || (c2.params = {});
          Object.keys(o.params).forEach(function (k) { if (o.params[k] === null) delete pr[k]; else pr[k] = typeof o.params[k] === "string" ? o.params[k].slice(0, 300) : o.params[k]; });
        }
        return true;
      }
      return false;
    },
    antesDerivar: function (ctx, saida) {
      if (!ctx || !ctx.param || !saida) return;
      var Pm = ctx.param, tipos = {};
      Object.keys(Pm.tipos).forEach(function (cat) { tipos[cat] = Pm.ordem[cat].map(function (id) { return clone(Pm.tipos[cat][id]); }); });
      /* o que o tipo diz vale para TODAS as instâncias (antes do derivar,
         que refaz seção, escada e guarda-corpo a partir da fonte) */
      arr(saida.caixas).forEach(function (c) {
        var cat = catDoAlvo(c); if (!cat || !Pm.tipos[cat]) return;
        var t = Pm.tipos[cat][tipoIdDe(c, cat, null)];
        if (t) aplicarTipo(c, cat, t);
      });
      saida.projeto = { tipos: tipos };
    }
  };

  global.BimParam = BimParam;
  if (typeof module !== "undefined" && module.exports) module.exports = BimParam;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

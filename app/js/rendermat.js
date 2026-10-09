/* =====================================================================
 * rendermat.js — MOTOR PURO DO RENDER FÍSICO (09/10/2026)
 *
 * O render do OrçaPRO é um path tracer (js/bimrendermotor.js): a luz é
 * simulada raio a raio, então o resultado depende de NÚMEROS FÍSICOS — a
 * rugosidade do porcelanato, o índice de refração do vidro, quantos lúmens
 * a luminária solta, onde o sol está às 16 h de 21 de dezembro na obra.
 * Este arquivo é onde esses números são decididos, e por isso é puro
 * (sem DOM, sem three.js) e testado em Node: node tools/test-rendermat.js.
 *
 *  1. BIBLIOTECA (data/materiais-render-ra.json): cada material com os
 *     parâmetros e a FONTE de cada grupo (`validar` recusa material sem
 *     fonte ou com número fora da faixa física).
 *  2. MAPEAMENTO modelo → material de render (`mapear`), nesta ordem:
 *       (0) a TROCA que a pessoa fez na tela de conferência (por obra);
 *       (1) o NOME do material da peça (dicionário PT-BR, o termo MAIS
 *           LONGO que casar vence — "madeira angelim pedra" é madeira, não
 *           pedra; "pastilha de vidro" é revestimento, não vidro);
 *       (2) a CLASSE IFC da peça (IfcWindow transparente → vidro, opaca →
 *           alumínio; IfcSlab → concreto…);
 *       (3) peça transparente sem nome → vidro;
 *       (4) nada casou → pintura fosca na cor do modelo, MARCADA "não casou"
 *           na conferência (nunca escondida).
 *  3. LUZES: luminária (família RA ou IfcLightFixture) → fonte de luz com
 *     fluxo (lm), temperatura de cor (K) e tipo (painel, spot, pendente) —
 *     convertidos para a grandeza que o path tracer usa (luminância do
 *     painel em cd/m², intensidade do spot em cd).
 *  4. SOL E CÉU: posição do sol (NOAA/Meeus, o mesmo js/icargeo.js do
 *     içamento) pela latitude, longitude, data e hora da obra, girada pelo
 *     norte verdadeiro da implantação; iluminância direta pelo modelo do
 *     IESNA; céu de Preetham (1999) misturado ao céu encoberto da CIE
 *     conforme as nuvens — tudo em cd/m², a mesma unidade das luminárias.
 *  5. CÂMERA: exposição pelo medidor de luz refletida (ISO 2720, K = 12,5)
 *     e balanço de branco (Kim et al. 2002 + adaptação de Bradford).
 *  6. O DESCRITIVO do render (texto estruturado: materiais, luzes, hora,
 *     câmera) — o gancho da outra frente (passe de IA e preço).
 *
 * ⚠ UNIDADES FOTOMÉTRICAS DE PONTA A PONTA. Sol em lux, céu e painel em
 *   cd/m², spot em candela. Misturar "intensidade 1" de um lado com lux do
 *   outro é o que faz render de interior sair preto ao lado de um exterior
 *   estourado. A câmera (EV100) é quem traz tudo para a tela.
 * ES5; global RenderMat + module.exports.
 * ===================================================================== */
(function (global) {
  "use strict";

  var RAD = Math.PI / 180;
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }

  /* =================================================================
   * TEXTO: normalizar (sem acento, minúsculo, pontuação vira espaço)
   * ================================================================= */
  var ACENTOS = { "á": "a", "à": "a", "â": "a", "ã": "a", "ä": "a", "é": "e", "ê": "e", "è": "e", "ë": "e", "í": "i", "ì": "i", "î": "i", "ï": "i",
                  "ó": "o", "ò": "o", "ô": "o", "õ": "o", "ö": "o", "ú": "u", "ù": "u", "û": "u", "ü": "u", "ç": "c", "ñ": "n" };
  function normalizar(s) {
    return txt(s).toLowerCase().replace(/[áàâãäéêèëíìîïóòôõöúùûüçñ]/g, function (c) { return ACENTOS[c] || c; })
      .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /* =================================================================
   * COR: sRGB ↔ linear, hex
   * ================================================================= */
  function linear(c) { c = clamp(num(c, 0), 0, 1); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function srgb(c) { c = Math.max(0, num(c, 0)); return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function hexParaSrgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(txt(h).trim()); if (!m) return null;
    var n = parseInt(m[1], 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function hexParaLinear(h) { var s = hexParaSrgb(h); return s ? [linear(s[0]), linear(s[1]), linear(s[2])] : null; }
  function srgbParaHex(c) { return "#" + c.map(function (v) { var x = Math.round(clamp(v, 0, 1) * 255).toString(16); return x.length < 2 ? "0" + x : x; }).join(""); }
  function luminancia(rgbLin) { return 0.2126 * rgbLin[0] + 0.7152 * rgbLin[1] + 0.0722 * rgbLin[2]; }
  function saturacao(c) { var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx > 0.001 ? (mx - mn) / mx : 0; }
  /* o "cinza genérico" de quem exportou sem material (IFC sem cor): sem
     saturação e no meio da escala — aí a cor do material da biblioteca manda */
  function cinzaGenerico(srgbC) {
    if (!srgbC) return true;
    var mx = Math.max(srgbC[0], srgbC[1], srgbC[2]), mn = Math.min(srgbC[0], srgbC[1], srgbC[2]);
    return saturacao(srgbC) < 0.08 && mx < 0.93 && mn > 0.25;
  }
  /* palavras de cor no nome ("alumínio preto", "pintura branca") — vale mais
     que a cor do modelo para metal e esquadria, onde o exportador costuma
     mandar um cinza qualquer */
  var CORES_NOME = [
    [/\b(preto|preta|black|grafite|chumbo)\b/, "#222324"], [/\b(branco|branca|white|neve|gelo)\b/, "#f2f2ef"],
    [/\b(bronze)\b/, "#5a4632"], [/\b(champanhe|champagne)\b/, "#b7a283"], [/\b(cinza claro|prata|silver)\b/, "#c8cacc"],
    [/\b(cinza|grey|gray)\b/, "#8d8f91"], [/\b(bege|areia|marfim|off white)\b/, "#ddd2bd"], [/\b(azul)\b/, "#3f6c9a"],
    [/\b(verde)\b/, "#4f7a4a"], [/\b(vermelho|vermelha|red)\b/, "#9c2f2a"], [/\b(amarelo|amarela)\b/, "#e0b43b"]
  ];
  function corPorNome(nome) {
    var t = normalizar(nome);
    for (var i = 0; i < CORES_NOME.length; i++) if (CORES_NOME[i][0].test(t)) return hexParaSrgb(CORES_NOME[i][1]);
    return null;
  }
  /* "porcelanato 60x60", "60 x 120 cm", "azulejo 30×60", "120x120" → [0,6, 0,6] m */
  function dimensaoPeca(nome) {
    var s = txt(nome).toLowerCase().replace(/,/g, ".");
    var m = /(\d{1,3}(?:\.\d)?)\s*(?:x|×|\*)\s*(\d{1,3}(?:\.\d)?)\s*(mm|cm|m)?\b/.exec(s);
    if (!m) return null;
    var a = +m[1], b = +m[2], u = m[3] || "cm", f = u === "mm" ? 0.001 : (u === "m" ? 1 : 0.01);
    var w = a * f, h = b * f;
    if (!(w >= 0.02 && w <= 3 && h >= 0.02 && h <= 3)) return null;
    return [Math.round(w * 1000) / 1000, Math.round(h * 1000) / 1000];
  }
  /* "vidro temperado 8 mm", "vidro 10mm" → 0,008 m (só para vidro) */
  function espessuraNome(nome) {
    var m = /(\d{1,2}(?:[.,]\d)?)\s*mm\b/.exec(txt(nome).toLowerCase());
    if (!m) return null;
    var e = +m[1].replace(",", ".") / 1000;
    return e >= 0.002 && e <= 0.05 ? e : null;
  }

  /* =================================================================
   * 1. BIBLIOTECA
   * ================================================================= */
  var CAMPOS_FAIXA = {
    rugosidade: [0, 1], metalicidade: [0, 1], transmissao: [0, 1], ior: [1, 2.5], clearcoat: [0, 1], clearcoat_rugosidade: [0, 1],
    sheen: [0, 1], sheen_rugosidade: [0, 1], relevo: [0, 1], espessura_m: [0, 5]
  };
  var MODOS_COR = ["sempre", "se_definida", "nunca"];
  /* confere a biblioteca inteira; {ok, erros:[texto]} — o teste e a carga usam */
  function validar(bib) {
    var erros = [];
    if (!bib || typeof bib !== "object") return { ok: false, erros: ["biblioteca vazia"] };
    var F = bib.fontes || {}, ids = {};
    arr(bib.materiais).forEach(function (m, i) {
      var q = "material " + (m && m.id || ("#" + i));
      if (!m || !m.id || !/^[a-z0-9_]+$/.test(m.id)) { erros.push(q + ": id inválido"); return; }
      if (ids[m.id]) erros.push(q + ": id repetido"); ids[m.id] = 1;
      if (!txt(m.nome)) erros.push(q + ": sem nome");
      if (!arr(m.termos).length) erros.push(q + ": sem termos");
      arr(m.termos).concat(arr(m.genericos)).forEach(function (t) { if (normalizar(t) !== t) erros.push(q + ": termo \"" + t + "\" não está normalizado (minúsculo, sem acento)"); });
      if (!hexParaSrgb(m.cor)) erros.push(q + ": cor inválida");
      if (MODOS_COR.indexOf(m.corDoModelo) < 0) erros.push(q + ": corDoModelo inválido");
      ["rugosidade", "metalicidade", "ior", "transmissao"].forEach(function (k) { if (!fin(m[k])) erros.push(q + ": falta " + k); });
      Object.keys(CAMPOS_FAIXA).forEach(function (k) {
        if (m[k] == null) return;
        var f = CAMPOS_FAIXA[k];
        if (!fin(m[k]) || m[k] < f[0] || m[k] > f[1]) erros.push(q + ": " + k + " = " + m[k] + " fora da faixa física [" + f[0] + ", " + f[1] + "]");
      });
      if (m.metalicidade !== 0 && m.metalicidade !== 1) erros.push(q + ": metalicidade é 0 ou 1 (material real é metal ou não é)");
      if (m.transmissao > 0 && !(m.metalicidade === 0)) erros.push(q + ": metal não transmite luz");
      if (m.transmissao > 0 && !(m.espessura_m > 0)) erros.push(q + ": material transparente sem espessura de transmissão");
      if (m.sheen > 0 && !hexParaSrgb(m.sheen_cor)) erros.push(q + ": sheen sem cor");
      if (m.atenuacao && (!hexParaSrgb(m.atenuacao.cor) || !(m.atenuacao.distancia_m > 0))) erros.push(q + ": atenuação inválida");
      var fo = m.fontes || {};
      ["otica", "superficie", "cor"].forEach(function (k) { if (!fo[k]) erros.push(q + ": sem fonte de " + k); else if (!F[fo[k]]) erros.push(q + ": fonte \"" + fo[k] + "\" não existe"); });
      var tx = m.textura;
      if (tx) {
        if (!fo.textura || !F[fo.textura]) erros.push(q + ": textura sem fonte");
        if (tx.tipo === "cc0") { if (!/^[a-z0-9_]+$/.test(txt(tx.slug))) erros.push(q + ": textura CC0 sem slug"); }
        else if (tx.tipo === "rejunte") {
          var p = arr(tx.peca_m);
          if (p.length !== 2 || !(p[0] > 0.02 && p[1] > 0.02 && p[0] <= 3 && p[1] <= 3)) erros.push(q + ": peça do rejunte inválida");
          if (!(tx.junta_mm >= 0.5 && tx.junta_mm <= 20)) erros.push(q + ": junta inválida");
          if (!hexParaSrgb(tx.cor_junta)) erros.push(q + ": cor da junta inválida");
        } else erros.push(q + ": tipo de textura desconhecido");
      }
    });
    var ref = function (id, onde) { if (id && !ids[id]) erros.push(onde + ": aponta para material inexistente \"" + id + "\""); };
    Object.keys(bib.porClasse || {}).forEach(function (k) { var c = bib.porClasse[k]; ref(c.transparente, "porClasse." + k); ref(c.opaco, "porClasse." + k); });
    ref(bib.transparenteSemNome, "transparenteSemNome"); ref(bib.padrao, "padrao");
    if (!bib.padrao) erros.push("sem material padrão");
    /* termo repetido em dois materiais = casamento ambíguo (quem ganha seria a ordem do arquivo) */
    var dono = {};
    arr(bib.materiais).forEach(function (m) { arr(m && m.termos).concat(arr(m && m.genericos)).forEach(function (t) { if (dono[t] && dono[t] !== m.id) erros.push("termo \"" + t + "\" em dois materiais (" + dono[t] + ", " + m.id + ")"); dono[t] = m.id; }); });
    return { ok: !erros.length, erros: erros };
  }

  var BIB = null, IDX = null;
  function usar(bib) {
    var v = validar(bib);
    if (!v.ok) return v;
    BIB = bib; IDX = { porId: {}, termos: [], genericos: [] };
    arr(bib.materiais).forEach(function (m) {
      IDX.porId[m.id] = m;
      arr(m.termos).forEach(function (t) { IDX.termos.push({ t: t, id: m.id }); });
      arr(m.genericos).forEach(function (t) { IDX.genericos.push({ t: t, id: m.id }); });
    });
    /* o mais longo primeiro: o primeiro que casar é o mais específico */
    var ord = function (a, b) { return b.t.length - a.t.length || (a.t < b.t ? -1 : 1); };
    IDX.termos.sort(ord); IDX.genericos.sort(ord);
    return v;
  }
  function biblioteca() { return BIB; }
  function material(id) { return IDX && IDX.porId[id] || null; }
  function lista() { return BIB ? arr(BIB.materiais).map(function (m) { return { id: m.id, nome: m.nome, categoria: m.categoria }; }) : []; }
  /* navegador: busca o JSON; Node: require */
  var URL_BIB = "data/materiais-render-ra.json";
  function carregar() {
    if (BIB) return Promise.resolve(BIB);
    if (typeof window === "undefined" && typeof require === "function") {
      try { var r = usar(require("../data/materiais-render-ra.json")); return r.ok ? Promise.resolve(BIB) : Promise.reject(new Error(r.erros.join("; "))); }
      catch (e) { return Promise.reject(e); }
    }
    if (typeof fetch !== "function") return Promise.reject(new Error("sem fetch"));
    return fetch(URL_BIB, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(URL_BIB + " " + r.status); return r.json(); })
      .then(function (j) { var v = usar(j); if (!v.ok) throw new Error("biblioteca de materiais inválida: " + v.erros.slice(0, 3).join("; ")); return BIB; });
  }

  /* =================================================================
   * 2. MAPEAMENTO
   * ================================================================= */
  /* sufixos de flexão aceitos depois do termo ("pintadA", "telhaDO", "vidroS");
     lista FECHADA de propósito: "terraço" não pode virar "terra" */
  var SUFIXOS = { "s": 1, "es": 1, "a": 1, "as": 1, "o": 1, "os": 1, "do": 1, "da": 1, "dos": 1, "das": 1, "ado": 1, "ada": 1, "ados": 1, "adas": 1 };
  function contemTermo(texto, termo) {
    var from = 0;
    while (true) {
      var i = texto.indexOf(termo, from); if (i < 0) return false;
      var antes = i === 0 || texto.charAt(i - 1) === " ";
      if (antes) {
        var j = i + termo.length, k = j;
        while (k < texto.length && texto.charAt(k) !== " ") k++;
        var resto = texto.slice(j, k);
        if (!resto || (termo.length >= 4 && SUFIXOS[resto])) return true;
      }
      from = i + 1;
    }
  }
  /* o casamento de UM nome: o termo mais longo que aparece (rastreável).
     Os GENÉRICOS ("revestimento cerâmico", "cerâmica") só valem se nenhum
     termo de material casar: a descrição SINAPI "revestimento cerâmico para
     piso com placas tipo porcelanato 60x60" é porcelanato, embora a parte
     genérica seja a mais longa. */
  function casar(nome) {
    if (!IDX) return null;
    var t = normalizar(nome); if (!t) return null;
    var listas = [IDX.termos, IDX.genericos];
    for (var l = 0; l < 2; l++) for (var i = 0; i < listas[l].length; i++) {
      var x = listas[l][i];
      if (contemTermo(t, x.t)) return { id: x.id, termo: x.t, generico: l === 1 };
    }
    return null;
  }
  function chaveTroca(nome) { return normalizar(nome); }
  /* a CHAVE da linha de conferência: o material do modelo (normalizado) ou,
     sem nome, a classe IFC e se é transparente */
  function chavePeca(p) {
    var n = principal(p);
    if (n) return "m:" + chaveTroca(n);
    return "c:" + txt(p && p.ifc).toUpperCase() + ":" + (transparente(p) ? "t" : "o");
  }
  /* nome que NÃO é material ("<Unnamed>", "Default", "Por categoria" que os exportadores escrevem): é como se não tivesse nome */
  function semNome(n) {
    var t = normalizar(n); if (!t) return true;
    var l = arr(BIB && BIB.semNome); for (var i = 0; i < l.length; i++) if (t === l[i]) return true;
    return false;
  }
  function nomes(p) { return arr(p && p.materiais).map(function (x) { return txt(x).trim(); }).filter(function (n) { return n && !semNome(n); }); }
  function principal(p) { return nomes(p)[0] || ""; }
  function transparente(p) { return p && fin(p.alfa) && p.alfa < 0.6; }
  /* peça: { materiais:[nomes], ifc:'IFCWINDOW', alfa:0..1, cor:[sRGB] }
     trocas: { chave: idMaterial } (gravadas por obra) */
  function mapear(p, trocas) {
    p = p || {};
    var vazio = { id: BIB ? BIB.padrao : "", fonte: "padrao", termo: "", material: "", casou: false };
    if (!IDX) return vazio;
    var k = chavePeca(p), tr = trocas && trocas[k];
    if (tr && IDX.porId[tr]) return { id: tr, fonte: "troca", termo: "", material: principal(p), casou: true, chave: k };
    var ns = nomes(p), i;
    for (i = 0; i < ns.length; i++) {
      var c = casar(ns[i]);
      if (c) {
        /* peça transparente cujo nome não é de material transparente: o
           exportador misturou ("Esquadria de alumínio" no vidro da janela) */
        var m = IDX.porId[c.id];
        if (transparente(p) && !(m.transmissao > 0) && BIB.transparenteSemNome) return { id: BIB.transparenteSemNome, fonte: "transparencia", termo: c.termo, material: ns[i], casou: true, chave: k };
        return { id: c.id, fonte: "nome", termo: c.termo, material: ns[i], casou: true, chave: k };
      }
    }
    var cl = BIB.porClasse && BIB.porClasse[txt(p.ifc).toUpperCase()];
    if (cl) {
      var idc = transparente(p) ? (cl.transparente || BIB.transparenteSemNome) : cl.opaco;
      if (idc) return { id: idc, fonte: "classe", termo: txt(p.ifc).toUpperCase(), material: principal(p), casou: true, chave: k };
    }
    if (transparente(p) && BIB.transparenteSemNome) return { id: BIB.transparenteSemNome, fonte: "transparencia", termo: "", material: principal(p), casou: true, chave: k };
    vazio.chave = k; vazio.material = principal(p);
    return vazio;
  }
  /* a lista da tela de conferência: uma linha por material do modelo */
  var NOMES_IFC = { IFCWINDOW: "Janela", IFCDOOR: "Porta", IFCSLAB: "Laje", IFCWALL: "Parede", IFCWALLSTANDARDCASE: "Parede", IFCROOF: "Cobertura", IFCCOLUMN: "Pilar",
                    IFCBEAM: "Viga", IFCCOVERING: "Revestimento", IFCRAILING: "Guarda-corpo", IFCPLATE: "Chapa", IFCSTAIR: "Escada", IFCFURNISHINGELEMENT: "Mobiliário",
                    IFCSANITARYTERMINAL: "Louça", IFCLIGHTFIXTURE: "Luminária", IFCMEMBER: "Peça estrutural", IFCPIPESEGMENT: "Tubo", IFCBUILDINGELEMENTPROXY: "Elemento" };
  function rotuloChave(k, p) {
    if (k.indexOf("m:") === 0) return principal(p);
    var pr = k.split(":"), n = NOMES_IFC[pr[1]] || (pr[1] ? pr[1].replace(/^IFC/, "").toLowerCase() : "peça");
    return n.charAt(0).toUpperCase() + n.slice(1) + " sem material" + (pr[2] === "t" ? " (transparente)" : "");
  }
  function conferencia(pecas, trocas) {
    var linhas = {}, ordem = [];
    arr(pecas).forEach(function (p) {
      var r = mapear(p, trocas), k = r.chave || chavePeca(p);
      if (!linhas[k]) { linhas[k] = { chave: k, modelo: rotuloChave(k, p), id: r.id, nome: (material(r.id) || {}).nome || r.id, fonte: r.fonte, termo: r.termo, casou: r.casou, pecas: 0 }; ordem.push(k); }
      linhas[k].pecas += p && p.n > 0 ? p.n : 1;
    });
    /* o que não casou primeiro (é o que a pessoa precisa olhar), depois por quantidade */
    return ordem.map(function (k) { return linhas[k]; }).sort(function (a, b) { return (a.casou - b.casou) || (b.pecas - a.pecas) || (a.modelo < b.modelo ? -1 : 1); });
  }

  /* os parâmetros FINAIS do material de render para uma peça (o motor só obedece):
     ctx = { cor: sRGB do modelo, nome: material do modelo } */
  function parametros(id, ctx) {
    var m = material(id) || material(BIB && BIB.padrao); if (!m) return null;
    ctx = ctx || {};
    var corLib = hexParaSrgb(m.cor), corMod = ctx.cor && ctx.cor.length >= 3 ? [num(ctx.cor[0], 0), num(ctx.cor[1], 0), num(ctx.cor[2], 0)] : null;
    var porNome = corPorNome(ctx.nome), base = corLib, origemCor = "biblioteca";
    if (m.corDoModelo === "sempre") { if (porNome) { base = porNome; origemCor = "nome"; } else if (corMod && !cinzaGenerico(corMod)) { base = corMod; origemCor = "modelo"; } else if (corMod && Math.min(corMod[0], corMod[1], corMod[2]) > 0.93) { base = corMod; origemCor = "modelo"; } }
    else if (m.corDoModelo === "se_definida") { if (porNome) { base = porNome; origemCor = "nome"; } else if (corMod && !cinzaGenerico(corMod)) { base = corMod; origemCor = "modelo"; } }
    else if (m.metalicidade === 1 && porNome && m.categoria === "metal") { base = porNome; origemCor = "nome"; }
    var o = {
      id: m.id, nome: m.nome, cor: [linear(base[0]), linear(base[1]), linear(base[2])], corSrgb: base.slice(), origemCor: origemCor,
      rugosidade: m.rugosidade, metalicidade: m.metalicidade, ior: m.ior, transmissao: m.transmissao, espessura: num(m.espessura_m, 0),
      clearcoat: num(m.clearcoat, 0), clearcoatRugosidade: num(m.clearcoat_rugosidade, 0),
      sheen: num(m.sheen, 0), sheenCor: m.sheen_cor ? hexParaLinear(m.sheen_cor) : [1, 1, 1], sheenRugosidade: num(m.sheen_rugosidade, 0.5),
      relevo: num(m.relevo, 0), atenuacao: m.atenuacao ? { cor: hexParaLinear(m.atenuacao.cor), distancia: m.atenuacao.distancia_m } : null,
      textura: null, fontes: m.fontes
    };
    /* metal pintado de outra cor pelo nome ("alumínio preto"): deixa de ser metal nu */
    if (m.metalicidade === 1 && origemCor === "nome" && luminancia(o.cor) < 0.2) { o.metalicidade = 0; o.rugosidade = Math.max(o.rugosidade, 0.4); o.clearcoat = 0.3; o.clearcoatRugosidade = 0.2; }
    if (o.transmissao > 0) { var e = espessuraNome(ctx.nome); if (e) o.espessura = e; }
    var tx = m.textura;
    /* madeira com COR no nome ("Madeira porta branca", "MDF preto") é madeira PINTADA/laqueada: sem o veio, na cor dita */
    if (m.categoria === "madeira" && porNome && m.corDoModelo === "nunca") {
      o.cor = [linear(porNome[0]), linear(porNome[1]), linear(porNome[2])]; o.corSrgb = porNome.slice(); o.origemCor = "nome";
      o.rugosidade = 0.45; o.clearcoat = 0.3; o.clearcoatRugosidade = 0.2; o.relevo = 0; o.pintada = true; tx = null;
    }
    if (tx && tx.tipo === "rejunte") {
      var d = dimensaoPeca(ctx.nome) || tx.peca_m;
      o.textura = { tipo: "rejunte", peca: [d[0], d[1]], junta: tx.junta_mm / 1000, corJunta: hexParaSrgb(tx.cor_junta), variacao: num(tx.variacao, 0.02), rugJunta: 0.9 };
    } else if (tx && tx.tipo === "cc0") o.textura = { tipo: "cc0", slug: tx.slug };
    return o;
  }

  /* =================================================================
   * TEXTURA PROCEDURAL: o REJUNTE (peça, junta e tom de cada peça)
   * Devolve três mapas RGBA 8 bits do mesmo tamanho, cobrindo 2 × 2 peças:
   *   cor     — multiplicador da cor base (peça ≈ 1 com variação; junta escura)
   *   mascara — R = fator do verniz (0 na junta), G = rugosidade (a da peça; a junta, áspera)
   *   normal  — relevo (a junta afunda), normal em espaço tangente (OpenGL)
   * ================================================================= */
  function aleat(i, j) { var s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
  function rejunte(o) {
    o = o || {};
    var peca = arr(o.peca).length === 2 ? o.peca : [0.6, 0.6], junta = num(o.junta, 0.002), N = Math.max(64, Math.min(2048, num(o.tamanho, 1024) | 0));
    var aspecto = peca[1] / peca[0], W = N, H = Math.max(16, Math.round(N * aspecto));
    if (H > 2048) { W = Math.round(W * 2048 / H); H = 2048; }
    var pw = W / 2, ph = H / 2, jw = Math.max(1, (junta / peca[0]) * pw / 2), jh = Math.max(1, (junta / peca[1]) * ph / 2);
    var cj = o.corJunta || [0.7, 0.68, 0.64], cp = o.corPeca || [1, 1, 1], fj = [0, 1, 2].map(function (k) { return clamp(cj[k] / Math.max(cp[k], 0.05), 0, 1); });
    var rug = clamp(num(o.rugosidade, 0.4), 0, 1), rugJ = clamp(num(o.rugJunta, 0.9), 0, 1), varia = num(o.variacao, 0.02);
    var cor = new Uint8Array(W * H * 4), masc = new Uint8Array(W * H * 4), nor = new Uint8Array(W * H * 4), alt = new Float32Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var ix = Math.floor(x / pw), iy = Math.floor(y / ph), lx = x - ix * pw, ly = y - iy * ph;
      var dx = Math.min(lx, pw - 1 - lx), dy = Math.min(ly, ph - 1 - ly), naJunta = dx < jw || dy < jh;
      var k = (y * W + x) * 4, v = 1 - varia + 2 * varia * aleat(ix + 1, iy + 7);
      if (naJunta) { cor[k] = Math.round(255 * fj[0]); cor[k + 1] = Math.round(255 * fj[1]); cor[k + 2] = Math.round(255 * fj[2]); }
      else { cor[k] = cor[k + 1] = cor[k + 2] = Math.round(255 * clamp(v, 0, 1)); }
      cor[k + 3] = 255;
      masc[k] = naJunta ? 0 : 255; masc[k + 1] = Math.round(255 * (naJunta ? rugJ : rug)); masc[k + 2] = 0; masc[k + 3] = 255;
      /* a borda da peça arredonda em ~1 px: a junta é um vale, não um degrau */
      var dd = Math.min(dx - jw, dy - jh);
      alt[y * W + x] = naJunta ? 0 : clamp((dd + 1) / 2, 0, 1);
    }
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
      var hL = alt[y2 * W + (x2 + W - 1) % W], hR = alt[y2 * W + (x2 + 1) % W], hD = alt[((y2 + H - 1) % H) * W + x2], hU = alt[((y2 + 1) % H) * W + x2];
      var nx = (hL - hR) * 0.5, ny = (hD - hU) * 0.5, nz = 1, l = Math.sqrt(nx * nx + ny * ny + nz * nz), q = (y2 * W + x2) * 4;
      nor[q] = Math.round(255 * (nx / l * 0.5 + 0.5)); nor[q + 1] = Math.round(255 * (ny / l * 0.5 + 0.5)); nor[q + 2] = Math.round(255 * (nz / l * 0.5 + 0.5)); nor[q + 3] = 255;
    }
    /* a textura cobre 2 × 2 peças: uma repetição = 2 peças em cada direção */
    return { largura: W, altura: H, repeticao: [peca[0] * 2, peca[1] * 2], cor: cor, mascara: masc, normal: nor, juntaPx: [jw * 2, jh * 2] };
  }

  /* =================================================================
   * COR DA LUZ: temperatura de cor (K) → cromaticidade → RGB linear
   * Kim et al. (2002): aproximação cúbica do lugar de Planck, 1667–25000 K.
   * ================================================================= */
  function kelvinXY(K) {
    var T = clamp(num(K, 6500), 1667, 25000), x, y;
    if (T <= 4000) x = -0.2661239e9 / (T * T * T) - 0.2343589e6 / (T * T) + 0.8776956e3 / T + 0.179910;
    else x = -3.0258469e9 / (T * T * T) + 2.1070379e6 / (T * T) + 0.2226347e3 / T + 0.240390;
    if (T <= 2222) y = -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683;
    else if (T <= 4000) y = -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
    else y = 3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483;
    return [x, y];
  }
  function xyYParaXYZ(x, y, Y) { if (y <= 0) return [0, 0, 0]; return [x * Y / y, Y, (1 - x - y) * Y / y]; }
  /* XYZ → sRGB linear (primárias do sRGB, branco D65 — IEC 61966-2-1) */
  function xyzParaLinear(X, Y, Z) {
    return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
  }
  function linearParaXYZ(c) {
    return [0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2], 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]];
  }
  /* cor da luz com LUMINÂNCIA 1 (a intensidade vem à parte, em lm/cd/lux) */
  function kelvinRGB(K) {
    var xy = kelvinXY(K), c = xyzParaLinear.apply(null, xyYParaXYZ(xy[0], xy[1], 1));
    c = c.map(function (v) { return Math.max(0, v); });
    var L = luminancia(c) || 1;
    return c.map(function (v) { return v / L; });
  }
  /* BALANÇO DE BRANCO: adaptação de Bradford do branco da fonte (K) para o D65
     da tela. Devolve a matriz 3×3 (linha a linha) que se aplica ao RGB linear. */
  var BRAD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
  var BRAD_INV = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
  var M_RGB_XYZ = [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]];
  var M_XYZ_RGB = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]];
  function mul(A, B) { var R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) R[i][j] += A[i][k] * B[k][j]; return R; }
  function mulV(A, v) { return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]]; }
  function balancoBranco(K) {
    if (!fin(num(K, NaN)) || Math.abs(num(K, 6504) - 6504) < 1) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    var xy = kelvinXY(K), Ws = xyYParaXYZ(xy[0], xy[1], 1), Wd = [0.95047, 1, 1.08883];
    var ls = mulV(BRAD, Ws), ld = mulV(BRAD, Wd), D = [[ld[0] / ls[0], 0, 0], [0, ld[1] / ls[1], 0], [0, 0, ld[2] / ls[2]]];
    return mul(M_XYZ_RGB, mul(BRAD_INV, mul(D, mul(BRAD, M_RGB_XYZ))));
  }

  /* =================================================================
   * 3. LUZES DO PROJETO
   * ================================================================= */
  var EFICACIA_LED = 80;   /* lm/W — padrão quando a família não diz o fluxo (conferir a ficha do produto) */
  var TIPO_POR_MODELO = { plafon_quadrada: "painel", plafon_circular: "painel", painel_60x60: "painel", spot_par20: "spot", pendente: "pendente", arandela: "pendente" };
  /* valores: os parâmetros AVALIADOS da família (Familia.avaliar → valores)
     inst: { x, y, z, rotY }  ·  devolve a luz pronta para o motor */
  function luzDaLuminaria(valores, inst, extra) {
    var v = valores || {}, I = inst || {}, e = extra || {};
    var modelo = txt(v.Modelo || v.modelo).toLowerCase(), tipo = txt(v.Tipo_luz || v.tipo_luz).toLowerCase();
    if (["painel", "spot", "pendente"].indexOf(tipo) < 0) tipo = TIPO_POR_MODELO[modelo] || "painel";
    var pot = num(String(v.Potencia_W == null ? "" : v.Potencia_W).split("/")[0], NaN);
    var lm = num(v.Fluxo_lm, NaN), origemFluxo = "família";
    if (!(lm > 0)) { if (pot > 0) { lm = pot * EFICACIA_LED; origemFluxo = "potência × " + EFICACIA_LED + " lm/W"; } else { lm = tipo === "spot" ? 500 : 1000; origemFluxo = "padrão"; } }
    var K = num(v.Temperatura_K, NaN), origemK = "família";
    if (!(K >= 1667 && K <= 25000)) { K = tipo === "spot" ? 3000 : 4000; origemK = "padrão"; }
    var lado = clamp(num(v.Lado, 0.2), 0.03, 1.5), hm = num(v.Altura_montagem, 2.6), ang = clamp(num(v.Angulo_facho, 36), 5, 160);
    var circular = /circular|redond/.test(modelo);
    var o = {
      id: txt(e.id), nome: txt(e.nome) || "Luminária", tipo: tipo, fluxo: Math.round(lm), K: Math.round(K), origemFluxo: origemFluxo, origemK: origemK,
      cor: kelvinRGB(K), circuito: txt(v.Circuito || e.circuito), ligada: e.ligada !== false,
      posicao: [num(I.x, 0), num(I.y, 0) + hm - 0.004, num(I.z, 0)], rotY: num(I.rotY, 0),
      largura: lado, profundidade: lado, circular: circular, angulo: ang
    };
    if (tipo === "painel") {
      /* emissor lambertiano de uma face: Φ = π · L · A  →  L = Φ / (π A) */
      var A = circular ? Math.PI * lado * lado / 4 : lado * lado;
      o.luminancia = lm / (Math.PI * A); o.intensidade = o.luminancia; o.unidade = "cd/m²";
    } else if (tipo === "spot") {
      /* fluxo dentro do cone de abertura θ (ângulo de facho): Ω = 2π(1 − cos θ/2) */
      var om = 2 * Math.PI * (1 - Math.cos(ang / 2 * RAD));
      o.intensidade = lm / om; o.unidade = "cd";
    } else {
      o.intensidade = lm / (4 * Math.PI); o.unidade = "cd";   /* pendente: fonte isotrópica */
    }
    return o;
  }
  /* luminária de IFC (IfcLightFixture, de outro programa): a caixa da peça dá
     o lugar e o tamanho; o fluxo e a temperatura vêm das propriedades se
     houver ("Fluxo luminoso", "Luminous flux", "Temperatura de cor"…) */
  function luzDePropriedades(props) {
    var o = {};
    arr(props).forEach(function (p) {
      var n = normalizar(p && (p.nome || p.n || p.name)), v = num(p && (p.valor != null ? p.valor : p.v), NaN);
      if (!(v > 0)) return;
      if (/\b(fluxo luminoso|luminous flux|fluxo|lumens?)\b/.test(n) && !o.Fluxo_lm) o.Fluxo_lm = v;
      else if (/\b(temperatura de cor|colou?r temperature|cct|kelvin)\b/.test(n) && !o.Temperatura_K) o.Temperatura_K = v;
      else if (/\b(potencia|power|wattage)\b/.test(n) && !o.Potencia_W) o.Potencia_W = v;
    });
    return o;
  }
  function luzDeCaixa(aabb, props, extra) {
    var mn = aabb.min, mx = aabb.max, w = clamp(mx[0] - mn[0], 0.05, 1.2), d = clamp(mx[2] - mn[2], 0.05, 1.2);
    var v = luzDePropriedades(props); v.Lado = Math.sqrt(w * d); v.Altura_montagem = 0;
    var l = luzDaLuminaria(v, { x: (mn[0] + mx[0]) / 2, y: mn[1], z: (mn[2] + mx[2]) / 2 }, extra);
    l.largura = w; l.profundidade = d;
    if (l.tipo === "painel") { l.luminancia = l.fluxo / (Math.PI * w * d); l.intensidade = l.luminancia; }
    l.daCaixa = true;
    return l;
  }

  /* =================================================================
   * 4. SOL E CÉU
   * ================================================================= */
  /* instante UTC (ms) da data/hora LOCAL da obra ("2026-12-21", "15:30", fuso −3) */
  function instante(data, hora, fuso) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(data)), h = /^(\d{1,2}):(\d{2})/.exec(txt(hora) || "12:00");
    if (!d) return NaN;
    var hh = h ? +h[1] : 12, mm = h ? +h[2] : 0;
    return Date.UTC(+d[1], +d[2] - 1, +d[3], hh, mm) - num(fuso, -3) * 3600000;
  }
  /* o sol na obra: elevação e azimute (do norte verdadeiro, horário) pelo
     js/icargeo.js, e a DIREÇÃO na cena girada pelo norte da implantação
     (norte do projeto = −z; anguloNorte = o norte verdadeiro girado a partir
     dele, anti-horário — a convenção do js/bimterreno.js) */
  function sol(o) {
    o = o || {};
    var IG = dep("IcarGeo", "./icargeo.js");
    var lat = num(o.lat, NaN), lon = num(o.lon, NaN), ms = fin(o.ms) ? o.ms : instante(o.data, o.hora, o.fuso);
    if (!IG || !fin(lat) || !fin(lon) || !fin(ms)) return null;
    var s = IG.sol(lat, lon, ms), el = s.elevacao, az = s.azimute;
    var b = (az - num(o.norte, 0)) * RAD, ce = Math.cos(el * RAD);
    return { elevacao: el, azimute: az, ms: ms, direcao: [ce * Math.sin(b), Math.sin(el * RAD), -ce * Math.cos(b)] };
  }
  /* massa de ar: Kasten & Young (1989) */
  function massaDeAr(elev) { var h = Math.max(elev, 0); return 1 / (Math.sin(h * RAD) + 0.50572 * Math.pow(h + 6.07995, -1.6364)); }
  /* iluminância DIRETA normal do sol (lux): IESNA Lighting Handbook — Exn = 127,5 klx,
     Edn = Exn·e^(−c·m); c = 0,21 céu claro → 0,80 parcialmente nublado; encoberto, sem sol direto */
  function iluminanciaSolar(elev, nuvens) {
    if (!(elev > 0)) return 0;
    var n = clamp(num(nuvens, 0), 0, 1), c = 0.21 + (0.80 - 0.21) * clamp(n / 0.6, 0, 1);
    var direto = 127500 * Math.exp(-c * massaDeAr(elev));
    var corte = n <= 0.6 ? 1 : (n >= 0.9 ? 0 : 1 - (n - 0.6) / 0.3);   /* encoberto: o sol some atrás das nuvens */
    return direto * corte;
  }
  /* a cor do sol avermelha perto do horizonte — calibração RA (5800 K no alto → 2300 K rasante) */
  function corSolar(elev) { var K = 2300 + 3500 * (1 - Math.exp(-Math.max(elev, 0) / 11)); return { K: Math.round(K), cor: kelvinRGB(K) }; }
  /* PREETHAM, SHIRLEY, SMITS (1999): distribuição de Perez com os coeficientes do artigo */
  function perez(th, ga, A, B, C, D, E) { var ct = Math.max(Math.cos(th), 0.01), cg = Math.cos(ga); return (1 + A * Math.exp(B / ct)) * (1 + C * Math.exp(D * ga) + E * cg * cg); }
  function preetham(T, thS) {
    var t2 = T * T, t3 = thS * thS * thS, tt = thS * thS;
    var chi = (4 / 9 - T / 120) * (Math.PI - 2 * thS);
    var Yz = Math.max(0.01, (4.0453 * T - 4.9710) * Math.tan(chi) - 0.2155 * T + 2.4192) * 1000;   /* kcd/m² → cd/m² */
    var xz = t2 * (0.00166 * t3 - 0.00375 * tt + 0.00209 * thS) + T * (-0.02903 * t3 + 0.06377 * tt - 0.03202 * thS + 0.00394) + (0.11693 * t3 - 0.21196 * tt + 0.06052 * thS + 0.25886);
    var yz = t2 * (0.00275 * t3 - 0.00610 * tt + 0.00317 * thS) + T * (-0.04214 * t3 + 0.08970 * tt - 0.04153 * thS + 0.00516) + (0.15346 * t3 - 0.26756 * tt + 0.06670 * thS + 0.26688);
    return {
      Yz: Yz, xz: xz, yz: yz,
      cY: [0.1787 * T - 1.4630, -0.3554 * T + 0.4275, -0.0227 * T + 5.3251, 0.1206 * T - 2.5771, -0.0670 * T + 0.3703],
      cx: [-0.0193 * T - 0.2592, -0.0665 * T + 0.0008, -0.0004 * T + 0.2125, -0.0641 * T - 0.8989, -0.0033 * T + 0.0452],
      cy: [-0.0167 * T - 0.2608, -0.0950 * T + 0.0092, -0.0079 * T + 0.2102, -0.0441 * T - 1.6537, -0.0109 * T + 0.0529]
    };
  }
  function pz(c, th, ga, thS) { return perez(th, ga, c[0], c[1], c[2], c[3], c[4]) / perez(0, thS, c[0], c[1], c[2], c[3], c[4]); }
  /* radiância do céu (RGB linear, cd/m²) numa direção unitária d, com o sol em s */
  function ceuEm(d, cfg) {
    var s = cfg.solDir, elS = cfg.elevacao, n = cfg.nuvens;
    if (d[1] < 0) return cfg.chao;
    var dia = cfg.dia;
    if (!dia) return cfg.noite;
    var th = Math.acos(clamp(d[1], -1, 1)), ga = Math.acos(clamp(d[0] * s[0] + d[1] * s[1] + d[2] * s[2], -1, 1));
    var P = dia.P, thS = dia.thS, Y = P.Yz * pz(P.cY, th, ga, thS), x = P.xz * pz(P.cx, th, ga, thS), y = P.yz * pz(P.cy, th, ga, thS);
    var cla = xyzParaLinear.apply(null, xyYParaXYZ(x, y, Y)).map(function (v) { return Math.max(0, v); });
    /* céu encoberto da CIE: L(θ) = Lz (1 + 2 cos θ)/3, cinza levemente frio */
    var Lo = dia.Lzo * (1 + 2 * d[1]) / 3, enc = [Lo * 0.97, Lo, Lo * 1.04];
    var mix = dia.mix;
    var out = [cla[0] * (1 - mix) + enc[0] * mix, cla[1] * (1 - mix) + enc[1] * mix, cla[2] * (1 - mix) + enc[2] * mix];
    return [out[0] * dia.f, out[1] * dia.f, out[2] * dia.f];
  }
  var NOITE = [0.006, 0.008, 0.014];   /* céu noturno de cidade, cd/m² — calibração RA */
  /* prepara o céu de um instante: { solDir, elevacao, nuvens } → cfg do ceuEm */
  function prepararCeu(o) {
    var el = num(o.elevacao, 45), n = clamp(num(o.nuvens, 0), 0, 1), s = o.solDir || [0, 1, 0];
    var cfg = { solDir: s, elevacao: el, nuvens: n, noite: NOITE, dia: null };
    if (el > -6) {
      /* o modelo vale com o sol acima do horizonte: no crepúsculo (até −6°, civil)
         a forma é a do sol rasante e a luz cai até a da noite */
      var elC = Math.max(el, 0.5), thS = (90 - elC) * RAD, T = 2.2 + 3.8 * n, P = preetham(T, thS);
      var f = el >= 0 ? 1 : Math.exp(Math.log(0.004) * (-el / 6));
      var Eh = 18000 * Math.max(Math.sin(elC * RAD), 0.03);   /* iluminância horizontal do céu encoberto — calibração RA */
      cfg.dia = { P: P, thS: thS, f: f, Lzo: 9 / (7 * Math.PI) * Eh, mix: clamp((n - 0.35) / 0.55, 0, 1) };
    }
    /* o chão distante (abaixo do horizonte): albedo 0,2 sob o céu + sol */
    var Esol = iluminanciaSolar(el, n) * Math.max(Math.sin(el * RAD), 0);
    var Eceu = cfg.dia ? Math.PI * ceuEm([0, 1, 0], cfg)[1] * 0.75 : NOITE[1] * Math.PI;
    var Lc = 0.2 * (Esol + Eceu) / Math.PI;
    cfg.chao = [Lc * 1.0, Lc * 0.93, Lc * 0.82];
    return cfg;
  }
  /* o céu em EQUIRETANGULAR (o formato do three: u = atan2(z,x)/2π + 0,5;
     v = asin(y)/π + 0,5; linha 0 = embaixo). RGBA float, cd/m². */
  function ceu(o) {
    var W = Math.max(8, num(o.largura, 256) | 0), H = Math.max(4, num(o.altura, 128) | 0), cfg = prepararCeu(o), dados = new Float32Array(W * H * 4);
    for (var j = 0; j < H; j++) {
      var el = ((j + 0.5) / H - 0.5) * Math.PI, ce = Math.cos(el), se = Math.sin(el);
      for (var i = 0; i < W; i++) {
        var ph = ((i + 0.5) / W - 0.5) * 2 * Math.PI, d = [ce * Math.cos(ph), se, ce * Math.sin(ph)], c = ceuEm(d, cfg), k = (j * W + i) * 4;
        dados[k] = c[0]; dados[k + 1] = c[1]; dados[k + 2] = c[2]; dados[k + 3] = 1;
      }
    }
    return { largura: W, altura: H, dados: dados, cfg: cfg };
  }

  /* =================================================================
   * 5. CÂMERA: exposição e qualidade
   * ================================================================= */
  /* medidor de luz refletida (ISO 2720): EV100 = log2(L·S/K), K = 12,5, S = 100 */
  function ev100(L) { return Math.log(Math.max(num(L, 0), 1e-6) * 100 / 12.5) / Math.LN2; }
  /* fator que leva a luminância à faixa da tela (Lagarde & de Rousiers 2014): 1 / (1,2 · 2^EV100) */
  function exposicao(ev) { return 1 / (1.2 * Math.pow(2, num(ev, 12))); }
  /* a média logarítmica de luminância (o que o fotômetro "vê") de um buffer RGBA float */
  function luminanciaMedia(px, passo) {
    var s = 0, n = 0, p = Math.max(1, passo | 0) * 4;
    for (var i = 0; i < px.length; i += p) {
      var a = px[i + 3]; if (!(a > 0)) continue;
      var L = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / a;
      if (!(L >= 0) || !isFinite(L)) continue;
      s += Math.log(1e-4 + L); n++;
    }
    return n ? Math.exp(s / n) : 0;
  }
  var ESTILOS = {
    dia: { nome: "Dia", hora: "10:30", nuvens: 0.15, ev: null, balanco: 6500 },
    entardecer: { nome: "Entardecer", hora: null, nuvens: 0.25, ev: null, balanco: 5200 },
    noite: { nome: "Noite", hora: "20:30", nuvens: 0.1, ev: null, balanco: 4300 }
  };
  /* o "entardecer" é 40 min antes do pôr do sol daquele dia, naquele lugar */
  function horaDoEstilo(estilo, o) {
    var e = ESTILOS[estilo] || ESTILOS.dia;
    if (e.hora) return e.hora;
    var IG = dep("IcarGeo", "./icargeo.js");
    if (!IG || !fin(num(o && o.lat, NaN))) return "17:20";
    var np = IG.nascerPor(num(o.lat, 0), num(o.lon, 0), txt(o.data));
    if (!np || !np.por) return "17:20";
    var t = new Date(np.por - 40 * 60000 + num(o.fuso, -3) * 3600000);
    var hh = t.getUTCHours(), mm = t.getUTCMinutes();
    return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }
  var QUALIDADES = {
    rascunho: { nome: "Rascunho", amostras: 64, quiques: 4 },
    padrao: { nome: "Padrão", amostras: 512, quiques: 6 },
    alta: { nome: "Alta", amostras: 2048, quiques: 8 },
    final: { nome: "Final (impressão)", amostras: 4096, quiques: 10 }
  };
  var RESOLUCOES = { tela: { nome: "Tamanho da tela", w: 0, h: 0 }, hd: { nome: "HD 1280 × 720", w: 1280, h: 720 }, fullhd: { nome: "Full HD 1920 × 1080", w: 1920, h: 1080 }, k4: { nome: "4K 3840 × 2160", w: 3840, h: 2160 } };
  /* o plano de um render: amostras, quiques e resolução, com o limite do aparelho */
  function planoQualidade(q, res, ap) {
    var Q = QUALIDADES[q] || QUALIDADES.padrao, R = RESOLUCOES[res] || RESOLUCOES.tela, a = ap || {};
    var o = { qualidade: QUALIDADES[q] ? q : "padrao", resolucao: RESOLUCOES[res] ? res : "tela", amostras: Q.amostras, quiques: Q.quiques, w: R.w || num(a.telaW, 1280), h: R.h || num(a.telaH, 720), aviso: "" };
    var fraco = !!a.fraco || (a.toque && num(a.telaMax, 9999) < 1000) || (num(a.memoria, 8) && num(a.memoria, 8) < 4);
    if (fraco) {
      o.amostras = Math.min(o.amostras, QUALIDADES.rascunho.amostras); o.quiques = Math.min(o.quiques, 4);
      var f = Math.min(1, 960 / Math.max(o.w, o.h)); o.w = Math.round(o.w * f); o.h = Math.round(o.h * f);
      o.aviso = "Neste aparelho o render sai em rascunho e em tamanho reduzido. Para a qualidade alta ou o 4K, abra a obra no computador.";
      o.reduzido = true;
    }
    o.w = Math.max(64, Math.round(o.w)); o.h = Math.max(64, Math.round(o.h));
    return o;
  }
  /* a redução de ruído (filtro que preserva borda) acompanha as amostras: com poucas, alisa mais; com muitas, quase nada
     (limiar ∝ 1/√amostras — o ruído do path tracing cai com a raiz das amostras) */
  function limiarRuido(amostras) { return clamp(0.5 * Math.sqrt(32 / Math.max(1, num(amostras, 1))), 0.04, 0.3); }
  function duracaoTexto(s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + " s";
    var m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return m + " min" + (r ? " " + r + " s" : "");
    var h = Math.floor(m / 60); return h + " h " + (m % 60) + " min";
  }
  /* quanto falta, medido (não chutado): ms por amostra das últimas amostras */
  function estimativa(msPorAmostra, feitas, alvo) {
    var f = Math.max(0, num(feitas, 0)), a = Math.max(f, num(alvo, 0)), ms = num(msPorAmostra, NaN);
    if (!(ms > 0) || f < 2) return { segundos: null, texto: "medindo a velocidade deste computador…" };
    var s = (a - f) * ms / 1000;
    return { segundos: s, texto: f >= a ? "pronto" : "faltam ~" + duracaoTexto(s) + " (" + Math.round(100 * f / a) + "%)" };
  }

  /* =================================================================
   * 6. O DESCRITIVO (gancho da outra frente: passe de IA e preço)
   * ================================================================= */
  function descritivo(c) {
    c = c || {};
    var mats = arr(c.materiais).map(function (l) { return { modelo: l.modelo, render: l.id, nome: l.nome, pecas: l.pecas, fonte: l.fonte, casou: !!l.casou }; });
    var luzes = arr(c.luzes).map(function (l) { return { id: l.id, nome: l.nome, tipo: l.tipo, fluxo_lm: l.fluxo, temperatura_K: l.K, ligada: l.ligada !== false, circuito: l.circuito || "" }; });
    var Q = c.plano || {};
    var dados = {
      versao: 1, motor: "path tracing (three-gpu-pathtracer)", obra: txt(c.obra), estilo: txt(c.estilo), data: txt(c.data), hora: txt(c.hora), fuso: num(c.fuso, -3),
      local: c.local ? { lat: c.local.lat, lon: c.local.lon, fonte: txt(c.local.fonte), norte: num(c.local.norte, 0) } : null,
      sol: c.sol ? { elevacao: r1(c.sol.elevacao), azimute: r1(c.sol.azimute), iluminancia_lux: Math.round(num(c.sol.lux, 0)) } : null,
      nuvens: r3(num(c.nuvens, 0)), exposicao_ev100: fin(c.ev) ? r1(c.ev) : null, balanco_K: num(c.balanco, 6500), tom: txt(c.tom || "agx"),
      camera: c.camera || null, qualidade: { nome: txt(Q.qualidade), amostras: num(c.amostras, Q.amostras || 0), quiques: num(Q.quiques, 0), largura: num(Q.w, 0), altura: num(Q.h, 0) },
      materiais: mats, luzes: luzes, naoCasaram: mats.filter(function (m) { return !m.casou; }).length
    };
    var L = [];
    L.push("Render físico (path tracing) — " + (dados.obra || "obra") + ".");
    L.push("Estilo: " + (ESTILOS[dados.estilo] ? ESTILOS[dados.estilo].nome : dados.estilo || "dia") + "; " + (dados.data || "") + " " + (dados.hora || "") + (dados.local ? " em " + dados.local.lat.toFixed(4) + ", " + dados.local.lon.toFixed(4) : "") + ".");
    if (dados.sol) L.push("Sol a " + dados.sol.elevacao + "° de elevação, azimute " + dados.sol.azimute + "° (" + dados.sol.iluminancia_lux + " lx direto); nuvens " + Math.round(dados.nuvens * 100) + "%.");
    L.push("Câmera: " + (dados.camera ? (dados.camera.tipo || "perspectiva") + (dados.camera.fov ? ", abertura " + r1(dados.camera.fov) + "°" : "") : "vista atual") + "; exposição EV100 " + (dados.exposicao_ev100 == null ? "automática" : dados.exposicao_ev100) + "; balanço de branco " + dados.balanco_K + " K.");
    L.push("Qualidade: " + dados.qualidade.amostras + " amostras, " + dados.qualidade.quiques + " quiques, " + dados.qualidade.largura + " × " + dados.qualidade.altura + " px.");
    L.push("Materiais (" + mats.length + "): " + mats.map(function (m) { return m.modelo + " → " + m.nome + (m.casou ? "" : " [não casou]"); }).join("; ") + ".");
    L.push("Luzes (" + luzes.length + "): " + (luzes.length ? luzes.map(function (l) { return l.nome + " " + l.fluxo_lm + " lm " + l.temperatura_K + " K " + (l.ligada ? "ligada" : "desligada"); }).join("; ") : "nenhuma luminária no modelo") + ".");
    return { dados: dados, texto: L.join("\n") };
  }

  var RenderMat = {
    VERSAO: 1, URL_BIB: URL_BIB, EFICACIA_LED: EFICACIA_LED,
    normalizar: normalizar, linear: linear, srgb: srgb, hexParaSrgb: hexParaSrgb, hexParaLinear: hexParaLinear, srgbParaHex: srgbParaHex,
    luminancia: luminancia, cinzaGenerico: cinzaGenerico, corPorNome: corPorNome, dimensaoPeca: dimensaoPeca, espessuraNome: espessuraNome,
    validar: validar, usar: usar, carregar: carregar, biblioteca: biblioteca, material: material, lista: lista,
    casar: casar, chaveTroca: chaveTroca, chavePeca: chavePeca, mapear: mapear, conferencia: conferencia, parametros: parametros,
    rejunte: rejunte,
    kelvinXY: kelvinXY, kelvinRGB: kelvinRGB, xyzParaLinear: xyzParaLinear, linearParaXYZ: linearParaXYZ, balancoBranco: balancoBranco,
    luzDaLuminaria: luzDaLuminaria, luzDePropriedades: luzDePropriedades, luzDeCaixa: luzDeCaixa,
    instante: instante, sol: sol, massaDeAr: massaDeAr, iluminanciaSolar: iluminanciaSolar, corSolar: corSolar, preetham: preetham, prepararCeu: prepararCeu, ceuEm: ceuEm, ceu: ceu,
    ev100: ev100, exposicao: exposicao, luminanciaMedia: luminanciaMedia,
    ESTILOS: ESTILOS, horaDoEstilo: horaDoEstilo, QUALIDADES: QUALIDADES, RESOLUCOES: RESOLUCOES, planoQualidade: planoQualidade, limiarRuido: limiarRuido, estimativa: estimativa, duracaoTexto: duracaoTexto,
    descritivo: descritivo
  };
  global.RenderMat = RenderMat;
  if (typeof module !== "undefined" && module.exports) module.exports = RenderMat;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

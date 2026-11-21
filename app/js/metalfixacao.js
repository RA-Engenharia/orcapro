/* =====================================================================
 * metalfixacao.js — METÁLICA: CATÁLOGO DE FIXAÇÃO CONSOLIDADO
 * (motor PURO, ES5, sem DOM, Node-testável). Frente "metal-catalogo", 20/11/2026.
 *
 * O QUE É: uma vista ÚNICA, por diâmetro, de tudo o que a lista de fábrica
 * precisa para comprar fixação — parafuso (classe, fyb/fub, área bruta e
 * efetiva, comprimentos comerciais), PORCA, ARRUELA (dimensões, massa), furo
 * padrão (NBR 8800) e os CHUMBADORES (aços ASTM F1554 Gr.36/55/105, tipos
 * gancho J/L, reto com porca/placa, com cabeça). NADA é duplicado: o dado
 * vem de js/acocatalogobr.js (que carrega a FONTE de cada número) e de
 * js/metalnorma.js. Este arquivo só junta, calcula massa e conta.
 *
 * NÃO mexe em cálculo: nenhuma resistência é calculada aqui.
 *
 * MASSA (kg) — duas origens, sempre rotuladas em `origem`:
 *   "fabricante": valor impresso no catálogo (MASSAS_FABRICANTE, com URL e data);
 *   "geometria":  massaPorca / massaArruela / massaParafuso (ρ = 7850 kg/m³):
 *       porca    = (hexágono s − furo da rosca D1 = d − 1,0825·P, ISO 68-1) × m
 *       arruela  = π/4·(d2² − d1²)·h
 *       parafuso = haste π/4·d²·L + cabeça (hexágono s × k)
 *     É ESTIMATIVA: não desconta chanfro nem raio de canto, e as alturas do
 *     catálogo são máximas — fica ~10 a 20 % ACIMA do valor do fabricante
 *     (conferido em tools/test-metal-catalogo.js contra Fabory). Por isso o valor
 *     do fabricante, quando existe, ganha.
 *
 * REGRA DA CASA: sem fonte → não entra; vai para `pendencias()`.
 *
 * API
 *   fixacoes()                 [{ id, sistema, d, passo, Ab, As, classes[], porca, arruela, comprimentos_mm[], furoPadrao_mm, fonte }]
 *   fixacao(id)                um deles ou null
 *   porcaDe(id) / arruelaDe(id)
 *   massaPorca(d, passo, s, m) · massaArruela(d1, d2, h) · massaParafuso(d, s, k, L)  (kg)
 *   comprimentoComercial(id, Lmm)   { comercial, usar_mm, lista }
 *   chumbadoresF1554()         aços Gr.36/55/105 (fy, fu, faixa de diâmetro, fonte)
 *   chumbadoresMoldados()      tipos J, L, reta+porca+placa, cabeça (com acessórios de fonte)
 *   acessoriosChumbador(tipo)  { porcas, arruelasLisas, arruelasPressao, fonte } ou null (= A DIMENSIONAR)
 *   itensDoGrupo(grupo)        linhas de fábrica (parafuso, porca, arruela [, chumbador]) de um grupo de js/metalfab.js
 *   inventario()               contagens por família de fixação
 *   pendencias()               o que ficou sem fonte
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Cat() { return global.AcoCatalogoBR || dep("AcoCatalogoBr", "./acocatalogobr.js"); }   /* 21/11/2026: no navegador o global é AcoCatalogoBR (com R maiúsculo) — sem isto a fixação saía sem catálogo (sem massa nem norma) na tela */
  function Nor() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r(v, c) { var p = Math.pow(10, c == null ? 3 : c); return Math.round(v * p) / p; }
  var RHO = 7850;                       /* kg/m³ */
  var A_DIMENSIONAR = "A DIMENSIONAR";

  /* ---------------------------------------------------------- massa pela geometria */
  function hexArea(s) { return Math.sqrt(3) / 2 * s * s; }                       /* mm² (s = entre faces) */
  function kgDe(mm3) { return mm3 * 1e-9 * RHO; }
  function massaPorca(d, passo, s, m) {
    if (!(d > 0 && s > 0 && m > 0)) return null;
    var D1 = d - 1.0825 * (passo > 0 ? passo : 0);
    return r(kgDe((hexArea(s) - Math.PI / 4 * D1 * D1) * m), 5);
  }
  function massaArruela(d1, d2, h) {
    if (!(d1 > 0 && d2 > d1 && h > 0)) return null;
    return r(kgDe(Math.PI / 4 * (d2 * d2 - d1 * d1) * h), 5);
  }
  function massaParafuso(d, s, k, L) {
    if (!(d > 0 && s > 0 && k > 0 && L > 0)) return null;
    return r(kgDe(Math.PI / 4 * d * d * L + hexArea(s) * k), 5);
  }

  /* ---------------------------------------------------------- massa do FABRICANTE (impressa)
   * Fabory, página do produto, "Weight per piece (g)", lida em 2026-11-20. */
  var FAB = "Fabory (fabricante) — página do produto, 'Weight per piece (g)'";
  var MASSAS_FABRICANTE = [
    { tipo: "porca", id: "M12", norma: "ISO 4032 cl. 8", g: 15, s: 18, m: 10.8, url: "https://www.fabory.com/en-GB/p/01104120001", artigo: "01104.120.001" },
    { tipo: "porca", id: "M16", norma: "ISO 4032 cl. 8", g: 34, s: 24, m: 14.8, url: "https://www.fabory.com/en-GB/p/01104160001", artigo: "01104.160.001" },
    { tipo: "porca", id: "M20", norma: "ISO 4032 cl. 8", g: 62, s: 30, m: 18, url: "https://www.fabory.com/en-GB/p/01104200001", artigo: "01104.200.001" },
    { tipo: "arruela", id: "M12", norma: "ISO 7089", g: 5.44, d1: 13, d2: 24, h: 2.5, url: "https://www.fabory.com/en-GB/p/38137120001", artigo: "38137.120.001" },
    { tipo: "arruela", id: "M16", norma: "ISO 7089", g: 9.67, d1: 17, d2: 30, h: 3, url: "https://www.fabory.com/en-GB/p/38137160001", artigo: "38137.160.001" }
  ];
  function massaFab(tipo, id) {
    for (var i = 0; i < MASSAS_FABRICANTE.length; i++) if (MASSAS_FABRICANTE[i].tipo === tipo && MASSAS_FABRICANTE[i].id === id) return MASSAS_FABRICANTE[i];
    return null;
  }
  function fonteFab(x) { return { titulo: FAB + " — " + x.norma + " " + x.id + " (art. " + x.artigo + ")", url: x.url, acesso: "2026-11-20" }; }

  /* ---------------------------------------------------------- tabelas
   * A norma da porca e da arruela vem da própria linha do catálogo (fonteGeometria):
   * POL → ASTM A563 DH (porca) / ASTM F436 (arruela); ISO → ISO 4032 cl. 8 / ISO 7089. */
  function normaPorca(sistema) { return sistema === "POL" ? "ASTM A563 DH (heavy hex; equivale à A194 2H)" : "ISO 4032 classe 8"; }
  function normaArruela(sistema) { return sistema === "POL" ? "ASTM F436" : "ISO 7089"; }

  function classesDe(p, todas) {
    var out = [];
    arr(p.classes).forEach(function (id) {
      for (var i = 0; i < todas.length; i++) if (todas[i].id === id) {
        var c = todas[i];
        out.push({ id: c.id, fyb: fin(c.fyb) ? c.fyb : null, fub: fin(c.fub) ? c.fub : null, alta: !!c.alta, nota: c.nota || "", fonte: c.fonte });
        return;
      }
    });
    return out;
  }
  function comprimentosDe(p) {
    var vistos = {}, out = [];
    arr(p.comprimentos).forEach(function (c) { arr(c.L_mm).forEach(function (L) { var k = r(L, 2); if (!vistos[k]) { vistos[k] = 1; out.push(k); } }); });
    return out.sort(function (a, b) { return a - b; });
  }

  var cache = null;
  function fixacoes() {
    if (cache) return cache;
    var C = Cat(), N = Nor(); if (!C) return [];
    var cls = C.classesParafuso();
    cache = C.parafusos().map(function (p) {
      var ar = p.arruela || {}, mf = massaFab("porca", p.id), af = massaFab("arruela", p.id);
      var mpGeo = massaPorca(p.d, p.passo, p.s, p.m), maGeo = massaArruela(ar.d1, ar.d2, ar.h);
      var fg = p.fonteGeometria || {};
      var fu = N && N.furo ? N.furo(p.d, "padrao") : null;
      var comps = comprimentosDe(p);
      return {
        id: p.id, sistema: p.sistema, d: p.d, passo: p.passo, Ab: p.Ab, As: p.As, s: p.s, k: p.k,
        classes: classesDe(p, cls),
        porca: { norma: normaPorca(p.sistema), s: p.s, m: p.m,
                 massa_kg: mf ? r(mf.g / 1000, 5) : mpGeo, origem: mf ? "fabricante" : "geometria",
                 fonte: mf ? fonteFab(mf) : { titulo: fg.texto || fg.titulo || "", url: fg.url || "", acesso: fg.acesso || "" } },
        arruela: { norma: normaArruela(p.sistema), d1: ar.d1, d2: ar.d2, h: ar.h,
                   massa_kg: af ? r(af.g / 1000, 5) : maGeo, origem: af ? "fabricante" : "geometria",
                   fonte: af ? fonteFab(af) : { titulo: fg.texto || fg.titulo || "", url: fg.url || "", acesso: fg.acesso || "" } },
        comprimentos_mm: comps,
        comprimentosFonte: comps.length ? "Ciser, Catálogo Geral 2026 (v3) — tabelas de comprimento; polegadas convertidas para mm" : "",
        furoPadrao_mm: fu ? fu.d : null,
        furoFonte: fu ? fu.fonte : "",
        fonte: { geometria: fg.texto || fg.titulo || "", As: p.fonteAs && (p.fonteAs.titulo || "") }
      };
    });
    return cache;
  }
  function fixacao(id) { var l = fixacoes(), q = String(id); for (var i = 0; i < l.length; i++) if (l[i].id === q) return l[i]; return null; }
  function porcaDe(id) { var f = fixacao(id); return f ? f.porca : null; }
  function arruelaDe(id) { var f = fixacao(id); return f ? f.arruela : null; }

  function comprimentoComercial(id, Lmm) {
    var f = fixacao(id), lista = f ? f.comprimentos_mm : [];
    if (!lista.length || !(Lmm > 0)) return { comercial: null, usar_mm: null, lista: lista };
    var usar = null, ok = false;
    for (var i = 0; i < lista.length; i++) { if (Math.abs(lista[i] - Lmm) < 0.5) { ok = true; usar = lista[i]; break; } if (usar == null && lista[i] >= Lmm) usar = lista[i]; }
    return { comercial: ok, usar_mm: usar, lista: lista };
  }

  /* ---------------------------------------------------------- chumbadores */
  function chumbadoresF1554() {
    var C = Cat(); if (!C) return [];
    return C.acosChumbador().filter(function (a) { return /^ASTM F1554/.test(a.id); }).map(function (a) {
      var m = /Gr\.(\d+)/.exec(a.id);
      return { id: a.id, grau: m ? +m[1] : null, fy_MPa: a.fyFonte, fu_MPa_min: a.fuFonte, fu_MPa_max: a.fuMax, uso: a.uso, fonte: a.fonte };
    });
  }
  /* Acessórios só onde o fabricante os declara. L (a página declara porca A563 Gr.A mas não a quantidade), "reta-porca-placa" e "cabeca": sem fonte da quantidade → A DIMENSIONAR. */
  var ACESSORIOS = {
    "gancho-J": { porcas: 2, arruelasLisas: 1, arruelasPressao: 1, fonte: "Eletro Luminar, Chumbador J (desenho FTMETA-0369): 'fornecido com 2 porcas A563 Gr.A, arruela lisa e arruela de pressão'", url: "https://eletroluminar.com.br/chumbador-j/" }
  };
  function acessoriosChumbador(tipo) { var a = ACESSORIOS[tipo]; return a ? JSON.parse(JSON.stringify(a)) : null; }
  function chumbadoresMoldados() {
    var C = Cat(); if (!C) return [];
    return C.tiposChumbador().filter(function (t) { return !t.posInstalado; }).map(function (t) {
      var prods = C.chumbadores({ tipo: t.id }), n = 0;
      prods.forEach(function (p) { n += arr(p.diametros).length; });
      return { id: t.id, nome: t.nome, produtos: prods.length, diametrosCatalogados: n, acessorios: acessoriosChumbador(t.id), fonte: t.fonte };
    });
  }

  /* ---------------------------------------------------------- lista de fábrica
   * grupo = { tipo, diametro, comprimento, classe, quantidade, porcas, arruelas } (js/metalfab.js listas().parafusos).
   * Devolve linhas { chave, tipo, descricao, qtd, massa_kg, estado: "ok" | "A DIMENSIONAR", obs }.
   * Nada de quantidade inventada: o que o modelo não traz sai com estado "A DIMENSIONAR". */
  function rotD(id) { return String(id); }
  function itensDoGrupo(g) {
    var out = [], f = fixacao(g.diametro), eCh = /^Chumbador/i.test(String(g.tipo || ""));
    var d = rotD(g.diametro), cl = g.classe ? " (" + g.classe + ")" : "";
    var L = g.comprimento > 0 ? g.comprimento : null;
    var cc = f && L ? comprimentoComercial(g.diametro, L) : null;
    var obsL = cc && cc.comercial === false && cc.usar_mm ? "comprimento fora da tabela comercial: o mais próximo acima é " + cc.usar_mm + " mm" : (f && L && !f.comprimentos_mm.length ? "sem tabela de comprimento comercial publicada" : "");
    var mP = f ? f.porca.massa_kg : null, mA = f ? f.arruela.massa_kg : null;
    var q = g.quantidade || 0;
    if (q > 0) {
      var mB = f && L ? massaParafuso(f.d, f.s, f.k, L) : null;
      out.push({ chave: (eCh ? "chumbador" : "parafuso") + "|" + d + "|" + (L || "") + "|" + (g.classe || ""), tipo: eCh ? "chumbador" : "parafuso",
                 descricao: (eCh ? "CHUMBADOR " : "PARAFUSO SEXTAVADO ") + d + (L ? " X " + L + " MM" : " X " + A_DIMENSIONAR + " (comprimento)") + cl,
                 qtd: q, massa_kg: mB, estado: L && f ? "ok" : A_DIMENSIONAR, obs: obsL || (f ? "" : "diâmetro fora do catálogo de fixação") });
    }
    if (g.porcas > 0) out.push({ chave: "porca|" + d + "|" + (g.classe || ""), tipo: "porca", descricao: "PORCA SEXTAVADA " + d + (f ? " — " + f.porca.norma : ""), qtd: g.porcas, massa_kg: mP, estado: f ? "ok" : A_DIMENSIONAR, obs: f ? "" : "diâmetro fora do catálogo de fixação" });
    if (g.arruelas > 0) out.push({ chave: "arruela|" + d, tipo: "arruela", descricao: "ARRUELA LISA " + d + (f ? " — " + f.arruela.norma : ""), qtd: g.arruelas, massa_kg: mA, estado: f ? "ok" : A_DIMENSIONAR, obs: f ? "" : "diâmetro fora do catálogo de fixação" });
    if (eCh && q > 0) out.push({ chave: "chumbador-acess|" + d, tipo: "chumbador-acessorio", descricao: "CHUMBADOR " + d + ": contraporca e placa/arruela de apoio", qtd: null, massa_kg: null, estado: A_DIMENSIONAR, obs: "o modelo não dimensiona contraporca nem placa de apoio do chumbador; a fonte nacional só declara quantidade de acessórios para o chumbador J" });
    return out;
  }

  /* ---------------------------------------------------------- inventário e pendências */
  function inventario() {
    var f = fixacoes(), n = { parafusoDiametros: f.length, iso: 0, pol: 0, classes: 0, comprimentos: 0, porcas: 0, arruelas: 0, massaFabricante: 0, massaGeometria: 0 };
    f.forEach(function (x) {
      if (x.sistema === "ISO") n.iso++; else n.pol++;
      n.classes += x.classes.length; n.comprimentos += x.comprimentos_mm.length; n.porcas++; n.arruelas++;
      [x.porca, x.arruela].forEach(function (o) { if (o.origem === "fabricante") n.massaFabricante++; else n.massaGeometria++; });
    });
    n.chumbadorF1554 = chumbadoresF1554().length; n.chumbadorTipos = chumbadoresMoldados().length;
    return n;
  }
  function pendencias() {
    var p = [];
    fixacoes().forEach(function (x) {
      if (!x.comprimentos_mm.length) p.push("Comprimentos comerciais de " + x.id + ": nenhum catálogo nacional lido traz (Ciser 2026 só vai até M24 em 8.8 e não lista A325 1.1/8\").");
      x.classes.forEach(function (c) { if (c.fyb == null) p.push("fyb de " + c.id + " (" + x.id + "): sem fonte pública lida."); });
    });
    p.push("Furo alargado, pouco e muito alongado (NBR 8800 Tabela 12): valores de partida no js/metalnorma.js, texto da norma não está na biblioteca — NÃO catalogados.");
    p.push("Furo com 'pescoço' (parafuso de pescoço/colarinho): sem tabela de norma nem de fabricante lida — não catalogado.");
    p.push("Massa de porca/arruela por geometria (sem chanfro) fica 10-20 % acima do fabricante; só M12/M16/M20 (porca) e M12/M16 (arruela) têm valor impresso.");
    p.push("Chumbador reto com porca e placa / com cabeça: nenhum fabricante nacional publica tabela (Imperial Fixadores, Paulifix, Sos Fix só 'sob desenho'); acessórios = A DIMENSIONAR.");
    p.push("ASTM F1554: fy/fu vêm de Baco/Torqbolt (reproduzem a norma sem citar edição); texto da ASTM é pago e a Portland Bolt devolveu 403.");
    p.push("Cantoneira de abas desiguais: nenhum fabricante nacional publica tabela (Gerdau e ArcelorMittal só abas iguais).");
    return p;
  }

  var Fix = {
    A_DIMENSIONAR: A_DIMENSIONAR, MASSAS_FABRICANTE: MASSAS_FABRICANTE,
    fixacoes: fixacoes, fixacao: fixacao, porcaDe: porcaDe, arruelaDe: arruelaDe,
    massaPorca: massaPorca, massaArruela: massaArruela, massaParafuso: massaParafuso, comprimentoComercial: comprimentoComercial,
    chumbadoresF1554: chumbadoresF1554, chumbadoresMoldados: chumbadoresMoldados, acessoriosChumbador: acessoriosChumbador,
    itensDoGrupo: itensDoGrupo, inventario: inventario, pendencias: pendencias
  };
  global.BimMetalFixacao = Fix;
  if (typeof module !== "undefined" && module.exports) module.exports = Fix;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

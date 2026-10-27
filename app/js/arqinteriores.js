/* =====================================================================
 * arqinteriores.js — CADERNO DE INTERIORES POR AMBIENTE (fase 2a): planta de móveis + vistas
 * (motor PURO, ES5, sem DOM, Node-testável; no molde do js/arqpranchas.js). O estilo (penas, fonte, cota, marcador de vista,
 * nota de material, título) vem de js/arqestilo.js = chave `arquitetura_interiores` do Padrão RA; o carimbo é o RA e não passa por aqui.
 *
 *   ArqInteriores.listarAmbientes(dados, depois?)      → [{ id, nome, pav, nMoveis, nMarcenaria, padrao }]   o que a tela oferece (padrão = tem mobiliário/marcenaria)
 *   ArqInteriores.montar(c, cfgInt, geo, E)            → { itens: [{ def, D, escala, res }], avisos[] }      desenha as folhas (c = o contexto de js/arqpranchas.js)
 *   ArqInteriores.analisar(c, amb)                     → { amb, moveis, vistas[] }                           a leitura (paredes com móvel encostado, peças em elevação)
 *   ArqInteriores.linhasNota(m)                        → [{ t, cor? }]                                        o texto da nota de material de um móvel
 *
 * A SÉRIE POR AMBIENTE (folhas A3, 1:25 se couber, senão 1:50; numeração global INT-nn, carimbo "NN/MM" por ambiente):
 *   01 MÓVEIS - PLANTA BAIXA: recorte do ambiente (paredes cortadas, vãos, móveis e marcenaria em pegada), cotas internas, cotas de posição
 *      da marcenaria e UM MARCADOR DE VISTA (letra + "PR nn") por parede que tem móvel ou marcenaria encostada;
 *   02.. MÓVEIS - VISTAS a 1:25, até 2 por folha: a ELEVAÇÃO INTERNA da parede (plano paralelo à parede, de dentro do ambiente, do piso ao teto):
 *      parede cortada dos lados, piso e teto (0,30), vãos, rodapé (se o ambiente traz a altura), peças em vista (0,09), cadeias de cota horizontal
 *      (posições) e vertical (alturas), e NOTAS DE MATERIAL em colunas à esquerda e à direita, uma por móvel.
 * DE ONDE SAEM AS NOTAS: dos parâmetros de MATERIAL da família do móvel (Corpo, Frente, Tampo, Rack, Painel, Puxador… — tipoDado "material" em
 *   js/familiasmob.js, js/familiasmobcoz.js e js/familiasplanejado.js) já avaliados no tipo/instância; Fabricante/Marca/Ferragem/Cor só se a família ou
 *   a instância os trouxer (hoje nenhuma traz). O que falta sai "informe" em VERMELHO (regra do sistema: nunca inventar).
 * RODAPÉ só se o ambiente informa a altura no texto do acabamento de rodapé ("10 cm"); parede de topo/lateral só com a espessura da parede achada.
 * FASE 2b (js/arqintextras.js, ligadas e desligadas por tipo em cfg.interiores.folhas): MÓVEIS - CORTES 1:20 (marcador tipo B na planta), ELÉTRICO (planta e vistas com a altura dos pontos),
 *   LUMINOTÉCNICO (planta + detalhe 1:10 da sanca, se o forro tem), PEDRAS (folha geral, 1ª do caderno) e 00 IMAGENS ILUSTRATIVAS (só se marcada). O PR do marcador é o NN do carimbo da folha da vista/corte.
 * Teste: tools/test-arqinteriores.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function ES() { return dep("ArqEstilo", "./arqestilo.js"); }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function dois(k) { return ("0" + k).slice(-2); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  var VERMELHO = "#c00000";
  var VIVO = { existente: 1, novo: 1 };
  /* o que dispara uma vista e o que entra nela quando está encostado */
  var CATS_GATILHO = { mobiliario: 1, cozinha: 1, banho: 1, planejado: 1 };
  var CATS_VISTA = { mobiliario: 1, cozinha: 1, banho: 1, planejado: 1, loucas: 1 };
  var COL_MAX_MM = 46;             /* largura máxima de uma nota de material (mm de papel) */
  var ENCOSTA_M = 0.10;            /* a pegada do móvel está a até 10 cm do plano da parede */
  var LADO_VAZIO_M = 0.4;          /* parede menor que isso não leva vista */
  var JANELA_M = 0.45;             /* o recorte da planta: o ambiente + a espessura da parede em volta */
  var GANCHOS = { cortes_1_20: "js/arqintextras.js", eletrico: "js/arqintextras.js", luminotecnico: "js/arqintextras.js", pedras: "js/arqintextras.js", imagens: "js/arqintextras.js" };   /* fase 2b */

  /* ------------------------------------------------------------ LEITURA: móveis do ambiente */
  function dentro(P, p) { return GEO().pontoEmPol(p, P); }
  function ehMarcenaria(m) {
    return /^(cozinha|banho|planejado)$/.test(txt(m.categoria)) || /^ra-plan-|^ra-coz-|^ra-banho-bancada/.test(txt(m.famId)) || !!m.temEstado;
  }
  function movelNoAmbiente(m, a) {
    if (!m || !VIVO[m.status] || !CATS_VISTA[txt(m.categoria)] || arr(m.pts).length < 3) return false;
    if (m.pav != null && a.pav != null && m.pav !== a.pav) return false;
    return dentro(a.pts, GEO().centroide(m.pts));
  }
  function movelGatilho(m) { return !!CATS_GATILHO[txt(m.categoria)]; }

  function listarAmbientes(dados, depois) {
    var base = arr((depois || dados).ambientes);
    return base.filter(function (a) { return a && VIVO[a.status]; }).map(function (a) {
      var ms = arr(dados.moveis).filter(function (m) { return movelNoAmbiente(m, a) && movelGatilho(m); });
      return { id: a.id, nome: a.nome, pav: a.pav, nMoveis: ms.length, nMarcenaria: ms.filter(ehMarcenaria).length, padrao: ms.length > 0 };
    });
  }

  /* ------------------------------------------------------------ CONTORNO DO AMBIENTE → PAREDES (arestas) */
  function limpar(P0) {
    var P = arr(P0).map(function (p) { return [p[0], p[1]]; });
    if (P.length > 1 && hip(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-6) P.pop();
    var mudou = true;
    while (mudou && P.length > 3) {
      mudou = false;
      for (var i = 0; i < P.length; i++) {
        var a = P[(i + P.length - 1) % P.length], b = P[i], c = P[(i + 1) % P.length];
        var ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1], lu = hip(ux, uz), lv = hip(vx, vz);
        if (lu < 1e-6 || lv < 1e-6 || (Math.abs(ux * vz - uz * vx) / (lu * lv) < 1e-4 && ux * vx + uz * vz > 0)) { P.splice(i, 1); mudou = true; break; }
      }
    }
    return P;
  }
  function arestas(pts) {
    var P = limpar(pts), n = P.length, out = [], G = GEO();
    for (var i = 0; i < n; i++) {
      var A = P[i], B = P[(i + 1) % n], L = hip(B[0] - A[0], B[1] - A[1]);
      if (L < 1e-6) continue;
      var e = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n1 = [-e[1], e[0]], mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      var nIn = dentro(P, [mid[0] + n1[0] * 0.05, mid[1] + n1[1] * 0.05]) ? n1 : [-n1[0], -n1[1]];
      var d = [-nIn[0], -nIn[1]];             /* de quem olha: para a parede */
      var r = [-d[1], d[0]];                  /* a direita de quem olha */
      var ub = (B[0] - A[0]) * r[0] + (B[1] - A[1]) * r[1];
      out.push({ i: i, A: A, B: B, L: L, e: e, nIn: nIn, d: d, r: r, uMin: Math.min(0, ub), n: n });
    }
    void G;
    return out;
  }
  /* funde arestas consecutivas colineares já foi feito em limpar(); aqui só liga a anterior e a próxima */
  function ligar(E) { E.forEach(function (x, i) { x.ant = E[(i + E.length - 1) % E.length]; x.prox = E[(i + 1) % E.length]; }); return E; }
  /* a coordenada de elevação (u, a partir do canto esquerdo de quem olha) e a profundidade (0 = face da parede; negativa = dentro do ambiente) */
  function Ue(ed, p) { return (p[0] - ed.A[0]) * ed.r[0] + (p[1] - ed.A[1]) * ed.r[1] - ed.uMin; }
  function Dep(ed, p) { return (p[0] - ed.A[0]) * ed.d[0] + (p[1] - ed.A[1]) * ed.d[1]; }

  /* espessura da parede que fecha o canto: a parede (na planta) que contém o ponto logo atrás da aresta vizinha */
  function espessuraLado(c, ed, fim) {
    var canto, adj, sent;
    var r_igual_e = Math.abs(ed.r[0] - ed.e[0]) + Math.abs(ed.r[1] - ed.e[1]) < 1e-6;
    /* fim = 0: o canto da esquerda de quem olha (U = 0); 1: o da direita (U = L) */
    var cantoA = (fim === 0) === r_igual_e;
    canto = cantoA ? ed.A : ed.B; adj = cantoA ? ed.ant : ed.prox; sent = cantoA ? 1 : -1;
    if (!adj) return null;
    var p = [canto[0] + adj.d[0] * 0.02 + adj.e[0] * sent * 0.05, canto[1] + adj.d[1] * 0.02 + adj.e[1] * sent * 0.05], t = null;
    arr(c.dados.paredes).forEach(function (w) { if (t == null && VIVO[w.status] && !w.muro && dentro(w.pts, p)) t = w.espessura; });
    return t;
  }

  /* ------------------------------------------------------------ ELEVAÇÃO: as peças de um móvel no plano da parede */
  function mundo(m, x, z) {
    var cs = Math.cos(num(m.rotY, 0)), sn = Math.sin(num(m.rotY, 0));
    return [m.x + x * cs + z * sn, m.z - x * sn + z * cs];
  }
  var RE_TAMPO = /(quartzo|granito|marmore|mármore|pedra|tampo)/i;
  function pecasEmVista(m, ed, base) {
    var fonte = arr(m.pecas).slice();
    if (!fonte.length && m.caixaLocal) fonte = [{ x0: m.caixaLocal.x0, x1: m.caixaLocal.x1, y0: m.caixaLocal.y0, y1: m.caixaLocal.y1, z0: m.caixaLocal.z0, z1: m.caixaLocal.z1, mat: "" }];
    var out = [];
    fonte.forEach(function (q) {
      var us = [], deps = [];
      [q.x0, q.x1].forEach(function (x) { [q.z0, q.z1].forEach(function (z) { var w = mundo(m, x, z); us.push(Ue(ed, w)); deps.push(Dep(ed, w)); }); });
      var y0 = m.y + q.y0 - base, y1 = m.y + q.y1 - base;
      out.push({ u0: Math.min.apply(null, us), u1: Math.max.apply(null, us), y0: y0, y1: y1, s0: -Math.max.apply(null, deps), s1: -Math.min.apply(null, deps), dep: (Math.min.apply(null, deps) + Math.max.apply(null, deps)) / 2, mat: q.mat, tampo: RE_TAMPO.test(txt(q.mat)) && (y1 - y0) < 0.25 });
    });
    return out;
  }

  /* ------------------------------------------------------------ ANÁLISE DE UM AMBIENTE */
  function pe(c, amb) {
    if (amb.pe > 1.5) return { v: amb.pe, de: "ambiente" };
    var h = 0; arr(c.dados.paredes).forEach(function (w) { if (VIVO[w.status] && !w.muro && w.pav === amb.pav) h = Math.max(h, w.altura); });
    return h > 1.5 ? { v: h, de: "parede" } : { v: 0, de: "" };
  }
  function rodapeAltura(amb) {
    var s = txt(amb.rodape), m = /(\d+(?:[.,]\d+)?)\s*cm/i.exec(s);
    if (m) return num(m[1].replace(",", "."), 0) / 100;
    m = /(\d+[.,]\d+)\s*m\b/i.exec(s);
    return m ? num(m[1].replace(",", "."), 0) : 0;
  }
  function espessuraAtras(c, ed) {
    var mid = [(ed.A[0] + ed.B[0]) / 2 + ed.d[0] * 0.03, (ed.A[1] + ed.B[1]) / 2 + ed.d[1] * 0.03], t = null;
    arr(c.dados.paredes).forEach(function (w) { if (t == null && VIVO[w.status] && !w.muro && dentro(w.pts, mid)) t = w.espessura; });
    return t;
  }
  function pertoDoAmbiente(P, p, tol) {
    if (dentro(P, p)) return true;
    var G = GEO(), m = Infinity;
    for (var i = 0; i < P.length; i++) m = Math.min(m, G.distPontoSeg(p, P[i], P[(i + 1) % P.length]));
    return m <= tol;
  }
  function analisar(c, amb) {
    var d = c.dados, moveis = arr(d.moveis).filter(function (m) { return movelNoAmbiente(m, amb); }), avisos = [];
    var P = pe(c, amb);
    if (!P.v) avisos.push("sem pé-direito conhecido (ambiente sem forro e parede sem altura): vistas não geradas");
    var E = ligar(arestas(amb.pts)).filter(function (x) { return x.L >= LADO_VAZIO_M; });
    var ele = arr(d.eletricos).filter(function (e) { return VIVO[e.status] && e.pav === amb.pav && pertoDoAmbiente(amb.pts, [e.x, e.z], 0.15); });
    var luzes = arr(d.luminarias).filter(function (l) { return VIVO[l.status] && l.pav === amb.pav && dentro(amb.pts, [l.x, l.z]); });
    /* cada ponto elétrico vai para a parede (aresta) a que está encostado: a de menor distância à face de dentro, dentro da faixa da espessura */
    var arestaDe = {};
    ele.forEach(function (e) {
      var melhor = null;
      E.forEach(function (ed, i) {
        var dp = Dep(ed, [e.x, e.z]), u = Ue(ed, [e.x, e.z]);
        if (dp < -0.06 || dp > 0.45 || u < -0.05 || u > ed.L + 0.05) return;
        var dist = Math.abs(Math.max(0, dp));
        if (!melhor || dist < melhor.dist) melhor = { i: i, dist: dist };
      });
      if (melhor) arestaDe[e.id] = melhor.i;
    });
    function montaVista(ed, i, modo) {
      var itens = [];
      moveis.forEach(function (m) {
        var ds = m.pts.map(function (p) { return (p[0] - ed.A[0]) * ed.nIn[0] + (p[1] - ed.A[1]) * ed.nIn[1]; });
        var perto = ds.filter(function (v) { return v <= ENCOSTA_M; }).length;
        if (perto < 2 || Math.min.apply(null, ds) < -0.2) return;
        var us = m.pts.map(function (p) { return Ue(ed, p); }), u0 = Math.max(0, Math.min.apply(null, us)), u1 = Math.min(ed.L, Math.max.apply(null, us));
        if (u1 - u0 < 0.05) return;
        var pecas = pecasEmVista(m, ed, amb.base).map(function (q) { q.u0 = Math.max(0, q.u0); q.u1 = Math.min(ed.L, q.u1); return q; }).filter(function (q) { return q.u1 - q.u0 > 0.004 && q.y1 - q.y0 > 0.004; });
        if (!pecas.length) return;
        var y0 = Math.min.apply(null, pecas.map(function (q) { return q.y0; })), y1 = Math.max.apply(null, pecas.map(function (q) { return q.y1; }));
        itens.push({ m: m, u0: u0, u1: u1, y0: Math.max(0, y0), y1: y1, pecas: pecas, marc: ehMarcenaria(m), gatilho: movelGatilho(m), prof: Math.max.apply(null, ds) });   /* a frente do móvel: até onde ele avança no ambiente */
      });
      var pontos = [];
      ele.forEach(function (e) { if (arestaDe[e.id] === i) pontos.push({ e: e, u: Math.max(0, Math.min(ed.L, Ue(ed, [e.x, e.z]))), alt: e.alt }); });
      pontos.sort(function (a, b) { return a.u - b.u; });
      var vaos = [];
      arr(d.vaos).forEach(function (v) {
        if (!VIVO[v.status] || v.pav !== amb.pav) return;
        var w = null; arr(d.paredes).forEach(function (x) { if (x.id === v.parede) w = x; });
        var t = w ? w.espessura : 0.15, dp = Dep(ed, [v.x, v.z]), u = Ue(ed, [v.x, v.z]);
        if (dp < -0.05 || dp > t + 0.05 || u < -0.01 || u > ed.L + 0.01) return;
        var a0 = Math.max(0, u - v.largura / 2), a1 = Math.min(ed.L, u + v.largura / 2);
        if (a1 - a0 < 0.05) return;
        vaos.push({ u0: a0, u1: a1, y0: v.peitoril, y1: v.peitoril + v.altura, tipo: v.tipo, cod: v.cod });
      });
      return { ed: ed, L: ed.L, itens: itens, pontos: pontos, vaos: vaos, base: amb.base, H: P.v, tEsq: espessuraLado(c, ed, 0), tDir: espessuraLado(c, ed, 1), tFundo: espessuraAtras(c, ed), rodape: rodapeAltura(amb), ang: Math.atan2(ed.d[0], -ed.d[1]), modo: modo };
    }
    function ordenar(lista) {
      lista.forEach(function (v) { var a = v.ang < -1e-9 ? v.ang + 2 * Math.PI : v.ang; v.ordem = a; });
      lista.sort(function (p, q) { return p.ordem - q.ordem; });
      lista.forEach(function (v, i) { v.letra = String.fromCharCode(65 + (i % 26)); });
      return lista;
    }
    var vistas = [], vistasEle = [];
    E.forEach(function (ed, i) {
      var v = montaVista(ed, i, "mov");
      if (v.itens.some(function (it) { return it.gatilho; })) {
        v.itens.forEach(function (it) { if (it.y1 > P.v + 0.01) avisos.push("a peça " + it.m.nome + " (" + r3(it.y1) + " m) passa do pé-direito (" + r3(P.v) + " m) na vista da parede de " + r3(ed.L) + " m: conferir"); });
        vistas.push(v);
      }
      if (arestaDe && ele.some(function (e) { return arestaDe[e.id] === i; })) vistasEle.push(montaVista(ed, i, "ele"));
    });
    ordenar(vistas); ordenar(vistasEle);
    /* os cortes 1:20: um por módulo de marcenaria encostado com profundidade relevante (a partir de 30 cm); as letras seguem as das vistas */
    var cortes = [];
    vistas.forEach(function (v) {
      /* o plano de corte atravessa tudo o que está na mesma posição da parede (a base e o aéreo da cozinha entram no MESMO corte) */
      var grupos = [];
      v.itens.slice().sort(function (a, b) { return a.u0 - b.u0; }).forEach(function (it) {
        if (!(it.marc && it.gatilho && it.prof >= 0.30)) return;
        var g = null; grupos.forEach(function (q) { if (!g && Math.min(q.u1, it.u1) - Math.max(q.u0, it.u0) > 0.10) g = q; });
        if (g) { g.its.push(it); g.u0 = Math.max(g.u0, it.u0); g.u1 = Math.min(g.u1, it.u1); } else grupos.push({ its: [it], u0: it.u0, u1: it.u1 });
      });
      grupos.forEach(function (g) {
        var prim = g.its.slice().sort(function (a, b) { return b.prof - a.prof; })[0];
        cortes.push({ v: v, it: prim, its: g.its, u: (g.u0 + g.u1) / 2, uMin: g.u0, uMax: g.u1 });
      });
    });
    cortes.forEach(function (ct, i) { ct.letra = String.fromCharCode(65 + ((vistas.length + i) % 26)); });
    /* as alturas dos pontos elétricos usadas no ambiente (cada uma tem uma linha na legenda e um símbolo) */
    var alts = [], semAlt = false;
    ele.forEach(function (e) { if (e.alt == null) semAlt = true; else if (alts.indexOf(Math.round(e.alt * 100) / 100) < 0) alts.push(Math.round(e.alt * 100) / 100); });
    alts.sort(function (a, b) { return a - b; });
    return { amb: amb, moveis: moveis, vistas: P.v ? vistas : [], vistasEle: P.v ? vistasEle : [], cortes: P.v ? cortes : [], eletricos: ele, luzes: luzes, alturasEle: alts, semAltura: semAlt, pe: P, avisos: avisos };
  }

  var CAMPOS_OUTROS = { fabricante: /^(fabricante|marca)$/i, ferragem: /^(ferragem|dobradica|dobradiça|corredica|corrediça|puxador)$/i, cor: /^cor$/i };
  function valorDe(m, rx) {
    var ks = Object.keys(m.valores || {}).concat(Object.keys(m.inst || {})), achou = "";
    ks.forEach(function (k) { if (!achou && rx.test(k)) { var v = (m.inst && m.inst[k] != null && txt(m.inst[k]) !== "") ? m.inst[k] : (m.valores || {})[k]; if (txt(v).trim() !== "" && typeof v !== "boolean") achou = txt(v).trim(); } });
    return achou;
  }
  function linhasNota(m) {
    var nome = txt(m.nome).replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim(), ls = [{ t: nome }], tem = false, falta = [];
    arr(m.parMat).forEach(function (k) {
      var v = txt((m.inst && m.inst[k] != null && txt(m.inst[k]) !== "") ? m.inst[k] : (m.valores || {})[k]).trim();
      if (!v) return;
      if (CAMPOS_OUTROS.ferragem.test(k)) return;
      tem = true; ls.push({ t: k.replace(/_/g, " ") + ": " + v });
    });
    if (!tem) ls.push({ t: "material: informe", cor: VERMELHO });
    var fab = valorDe(m, CAMPOS_OUTROS.fabricante), fer = valorDe(m, CAMPOS_OUTROS.ferragem), cor = valorDe(m, CAMPOS_OUTROS.cor);
    if (cor) ls.push({ t: "cor: " + cor });
    if (fab) ls.push({ t: "fabricante: " + fab }); else falta.push("fabricante");
    if (fer) ls.push({ t: "ferragem: " + fer }); else falta.push("ferragem");
    if (falta.length) ls.push({ t: falta.join(" e ") + ": informe", cor: VERMELHO });
    return ls;
  }
  /* quebra cada linha na coluna (a continuação leva a mesma cor) */
  function quebrarNota(ls, h) {
    var S = ES(), out = [];
    ls.forEach(function (l) { S.quebrar(S.maiusc(l.t), h, COL_MAX_MM).forEach(function (s) { out.push({ t: s, cor: l.cor }); }); });
    return out;
  }

  /* ------------------------------------------------------------ MEDIDAS E COLOCAÇÃO DAS NOTAS DA VISTA (em mm acima do piso) */
  function blocoNota(n) { var N = ES().NOTA_MATERIAL; return { cima: N.baseline_acima_da_linha_mm + (n - 1) * N.entrelinha_mm + 0.727 * ES().TEXTOS.nota_de_material + 0.4, baixo: 0.5 }; }
  function colocarNotas(v, k) {
    var S = ES(), h = S.TEXTOS.nota_de_material, itens = v.itens.slice().sort(function (a, b) { return (a.u0 + a.u1) - (b.u0 + b.u1); }), H = v.H * k, mid = v.L * k / 2;
    var cols = { E: [], D: [] }, notas = [], semLugar = [];
    itens.forEach(function (it) {
      var ls = quebrarNota(linhasNota(it.m), h), w = 0, bl = blocoNota(ls.length);
      ls.forEach(function (l) { w = Math.max(w, S.largTexto(l.t, h)); });
      var yLo = it.y0 * k, yHi = Math.min(it.y1, v.H) * k, pref = ((it.u0 + it.u1) / 2) * k <= mid ? ["E", "D"] : ["D", "E"], feito = null;
      for (var si = 0; si < 2 && !feito; si++) {
        var lado = pref[si], ocup = cols[lado], ys = [];
        var centro = (yLo + yHi) / 2;
        for (var d = 0; d <= (yHi - yLo) / 2 + 0.01; d += 0.5) { ys.push(centro + d); if (d > 0) ys.push(centro - d); }
        for (var q = 0; q < ys.length && !feito; q++) {
          var y = ys[q];
          if (y < yLo + 1 || y > yHi - 1 || y - bl.baixo < -1.5 || y + bl.cima > H + 2.5) continue;
          /* a seta precisa cair em cima de uma peça deste móvel (a mais perto da coluna) */
          var cobre = it.pecas.filter(function (p) { return p.y0 * k <= y && p.y1 * k >= y; });
          if (!cobre.length) continue;
          if (ocup.some(function (o) { return !(y + bl.cima + 1.2 < o.y - o.baixo || y - bl.baixo - 1.2 > o.y + o.cima); })) continue;
          var larg = cobre.filter(function (p) { return (p.u1 - p.u0) * k >= 4; }), lista = larg.length ? larg : cobre;
          var alvo = lado === "E" ? lista.reduce(function (a, b) { return a.u0 <= b.u0 ? a : b; }) : lista.reduce(function (a, b) { return a.u1 >= b.u1 ? a : b; });
          var px = lado === "E" ? alvo.u0 * k + Math.min(1.0, (alvo.u1 - alvo.u0) * k / 2) : alvo.u1 * k - Math.min(1.0, (alvo.u1 - alvo.u0) * k / 2);
          feito = { it: it, ls: ls, w: w, lado: lado, y: y, cima: bl.cima, baixo: bl.baixo, px: px };
          ocup.push({ y: y, cima: bl.cima, baixo: bl.baixo });
        }
      }
      if (feito) notas.push(feito); else semLugar.push(it.m.nome);
    });
    var wE = 0, wD = 0; notas.forEach(function (n) { if (n.lado === "E") wE = Math.max(wE, n.w); else wD = Math.max(wD, n.w); });
    return { notas: notas, semLugar: semLugar, wE: wE ? wE + 3 : 0, wD: wD ? wD + 3 : 0 };
  }

  /* ------------------------------------------------------------ TAMANHO DE UMA VISTA NA FOLHA (mm) */
  function medirVista(v, k) {
    var S = ES(), tE = (v.tEsq || 0) * k, tD = (v.tDir || 0) * k, nt = v.modo === "ele" ? { notas: [], semLugar: [], wE: 0, wD: 0 } : colocarNotas(v, k), entre = S.entreCadeias(Math.round(1000 / k));
    var cotaW = tE + S.afastamento1() + entre + 5;
    var w = nt.wE + cotaW + v.L * k + tD + 4 + nt.wD + 2, h = 14 + v.H * k + 2 + S.afastamento1() + entre + 5;
    return { w: w, h: h, k: k, nt: nt, tE: tE, tD: tD, cotaW: cotaW, entre: entre };
  }

  /* ------------------------------------------------------------ DESENHO DA VISTA */
  function niveisVerticais(v, k) {
    var ys = [0, v.H];
    if (v.rodape > 0.01 && v.rodape < v.H) ys.push(v.rodape);
    v.itens.forEach(function (it) { ys.push(it.y0, Math.min(it.y1, v.H)); var ap = it.m.valores && it.m.valores.Altura; if (it.y0 < 0.02 && typeof ap === "number" && ap > 0.2 && ap < it.y1 - 0.01) ys.push(ap); });   /* a altura da bancada/base: o parâmetro Altura da família (do piso ao topo do tampo), não um número nosso */
    ys = ys.filter(function (y) { return y >= -1e-6 && y <= v.H + 1e-6; }).sort(function (a, b) { return a - b; });
    var out = [], minimo = 2.6 / k;
    ys.forEach(function (y) { if (!out.length || y - out[out.length - 1] >= minimo) out.push(y); else if (y === v.H) { out.pop(); out.push(y); } });
    if (out[0] > 1e-6) out.unshift(0);
    return out;
  }
  function niveisHorizontais(v, k) {
    var us = [0, v.L];
    v.itens.forEach(function (it) { if (it.marc || it.gatilho) us.push(it.u0, it.u1); });
    us = us.filter(function (u) { return u >= -1e-6 && u <= v.L + 1e-6; }).sort(function (a, b) { return a - b; });
    var out = [], minimo = 2.6 / k;
    us.forEach(function (u) { if (!out.length || u - out[out.length - 1] >= minimo) out.push(u); else if (u === v.L) { out.pop(); out.push(u); } });
    return out;
  }
  /* ------------------------------------------------------------ SÍMBOLO DO PONTO ELÉTRICO (triângulo; uma variante por altura) */
  function simboloPonto(D, x, y, variante, cam, t) {
    var S = ES(); t = t || 1.6;
    var P = [[x - t, y + t * 0.75], [x + t, y + t * 0.75], [x, y - t]];
    if (variante === 1) D.cheio(P, cam === "ARQ-LUMINARIA" ? S.CORES.luminotecnico : S.CORES.preto);
    else D.poli(P, cam || "ARQ-SIMBOLO", true);
    if (variante === 2) D.circ(x, y + t * 0.1, 0.35, cam || "ARQ-SIMBOLO");
    if (variante === 3) D.linha(x - t * 0.55, y + t * 0.1, x + t * 0.55, y + t * 0.1, cam || "ARQ-SIMBOLO");
  }
  function varianteAltura(an, alt) { if (alt == null) return 0; var i = an.alturasEle.indexOf(Math.round(alt * 100) / 100); return i < 0 ? 0 : i % 4; }

  /* ------------------------------------------------------------ DESENHO DA VISTA (modo "mov": móveis e notas; modo "ele": pontos elétricos e alturas) */
  function desenharVista(c, v, X0, Y0, med, num2, an) {
    var D = c.D, d = DS(), S = ES(), G = GEO(), k = med.k, den = Math.round(1000 / k), ele = v.modo === "ele";
    d.escalaCota(D, den);
    var Ypiso = Y0 + 14 + v.H * k, Ytop = Ypiso - v.H * k, L = v.L;
    function XP(u) { return X0 + u * k; }
    function YP(y) { return Ypiso - y * k; }
    S.titulo(D, X0 - med.cotaW - med.nt.wE, Y0, num2, (ele ? "ELÉTRICO - VISTA " : "VISTA ") + v.letra, "1:" + den);
    function parede(xa, xb) {
      var P = [[xa, Ytop], [xb, Ytop], [xb, Ypiso], [xa, Ypiso]];
      d.fundoPol(D, P, "#bdbdbd"); G.hachuraLinhas(P, 1.6, 45).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], "ARQ-HACHURA"); });
      D.poli(P, "ARQ-PAREDE", true);
    }
    if (v.tEsq) parede(X0 - med.tE, X0);
    if (v.tDir) parede(XP(L), XP(L) + med.tD);
    var xa = X0 - med.tE, xb = XP(L) + med.tD;
    D.linha(xa, Ypiso, xb, Ypiso, "ARQ-PAREDE"); D.linha(xa, Ytop, xb, Ytop, "ARQ-PAREDE");
    if (!v.tEsq) D.linha(X0, Ytop, X0, Ypiso, "ARQ-PAREDE");
    if (!v.tDir) D.linha(XP(L), Ytop, XP(L), Ypiso, "ARQ-PAREDE");
    v.vaos.forEach(function (o) {
      var P = [[XP(o.u0), YP(Math.min(o.y1, v.H))], [XP(o.u1), YP(Math.min(o.y1, v.H))], [XP(o.u1), YP(Math.max(o.y0, 0))], [XP(o.u0), YP(Math.max(o.y0, 0))]];
      d.fundoPol(D, P, "#fff"); D.poli(P, "ARQ-VAO", true);
      if (o.tipo === "janela") D.linha(P[0][0], (P[0][1] + P[3][1]) / 2, P[1][0], (P[0][1] + P[3][1]) / 2, "ARQ-ARCO");
    });
    if (v.rodape > 0.01 && v.rodape < v.H) {
      var cortes = [0]; v.vaos.filter(function (o) { return o.tipo === "porta" && o.y0 < 0.02; }).sort(function (a, b) { return a.u0 - b.u0; }).forEach(function (o) { cortes.push(o.u0, o.u1); }); cortes.push(L);
      for (var ic = 0; ic + 1 < cortes.length; ic += 2) if (cortes[ic + 1] - cortes[ic] > 0.01) D.linha(XP(cortes[ic]), YP(v.rodape), XP(cortes[ic + 1]), YP(v.rodape), "ARQ-FINA");
    }
    var todas = [];
    v.itens.forEach(function (it) { it.pecas.forEach(function (q) { todas.push(q); }); });
    todas.sort(function (a, b) { return b.dep - a.dep; });
    todas.forEach(function (q) {
      var u0 = Math.max(0, q.u0), u1 = Math.min(L, q.u1), y0 = Math.max(0, q.y0), y1 = Math.min(v.H, q.y1);
      if (u1 <= u0 || y1 <= y0) return;
      if ((u1 - u0) * k < 0.35 && (y1 - y0) * k < 0.35) return;
      var P = [[XP(u0), YP(y1)], [XP(u1), YP(y1)], [XP(u1), YP(y0)], [XP(u0), YP(y0)]];
      d.fundoPol(D, P, "#fff"); D.poli(P, ele ? "ARQ-CONTEXTO" : (q.tampo ? "ARQ-BATENTE" : "ARQ-FINA"), true);
    });
    /* elétrico: o ponto na altura certa (centro da caixa), com o guia até a régua de alturas */
    var semAlt = [];
    if (ele) v.pontos.forEach(function (p) {
      if (p.alt == null) { semAlt.push(p.e.nome); return; }
      D.linha(X0, YP(p.alt), XP(p.u), YP(p.alt), "ARQ-HACHURA");
      simboloPonto(D, XP(p.u), YP(p.alt), varianteAltura(an, p.alt), "ARQ-SIMBOLO", 1.6);
    });
    /* cotas verticais */
    var ny = ele ? niveisEleV(v, k) : niveisVerticais(v, k), a1 = S.afastamento1(), off1 = med.tE + a1;
    if (ny.length >= 2) {
      var Pv = ny.map(function (y) { return [X0, YP(y)]; }), vv = []; for (var i = 0; i + 1 < ny.length; i++) vv.push(d.cotaTxt(ny[i + 1] - ny[i]));
      D.cadeia(Pv, off1, vv, { offs: [off1 + 3, off1 + 6] });
      if (ny.length > 2) D.cadeia([[X0, YP(0)], [X0, YP(v.H)]], off1 + med.entre, [d.cotaTxt(v.H)], { semExt: true, offs: [off1 + med.entre + 3] });
    }
    var nu = ele ? niveisEleH(v, k) : niveisHorizontais(v, k);
    if (nu.length >= 2) {
      var Ph = nu.map(function (u) { return [XP(u), Ypiso]; }), vh = []; for (var j = 0; j + 1 < nu.length; j++) vh.push(d.cotaTxt(nu[j + 1] - nu[j]));
      var ofh = -a1;
      D.cadeia(Ph, ofh, vh, { offs: [ofh - 3, ofh - 6] });
      D.cadeia([[XP(0), Ypiso], [XP(L), Ypiso]], ofh - med.entre, [d.cotaTxt(L)], { semExt: true, offs: [ofh - med.entre - 3] });
    }
    var xtE = X0 - med.cotaW - med.nt.wE, xtD = XP(L) + med.tD + 4 + med.nt.wD;
    med.nt.notas.forEach(function (n) { S.notaMaterial(D, X0 + n.px, Ypiso - n.y, n.lado === "E" ? xtE : xtD, n.ls); });
    return { Ypiso: Ypiso, semLugar: med.nt.semLugar, semAlt: semAlt };
  }
  function niveisEleV(v, k) {
    var ys = [0, v.H]; v.pontos.forEach(function (p) { if (p.alt != null && p.alt > 0 && p.alt < v.H) ys.push(p.alt); });
    ys.sort(function (a, b) { return a - b; });
    var out = [], minimo = 2.6 / k; ys.forEach(function (y) { if (!out.length || y - out[out.length - 1] >= minimo) out.push(y); else if (y === v.H) { out.pop(); out.push(y); } });
    return out;
  }
  function niveisEleH(v, k) {
    var us = [0, v.L]; v.pontos.forEach(function (p) { us.push(p.u); });
    us.sort(function (a, b) { return a - b; });
    var out = [], minimo = 2.6 / k; us.forEach(function (u) { if (!out.length || u - out[out.length - 1] >= minimo) out.push(u); else if (u === v.L) { out.pop(); out.push(u); } });
    return out;
  }

  /* ------------------------------------------------------------ PLANTA: a base (título, paredes cortadas, vãos), marcadores e cadeias de posição */
  function clipSemiplano(P, f) {
    var out = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { var t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  function recortarRet(P, W) {
    var q = P;
    [function (p) { return p[0] - W[0]; }, function (p) { return W[2] - p[0]; }, function (p) { return p[1] - W[1]; }, function (p) { return W[3] - p[1]; }].forEach(function (f) { if (q.length >= 3) q = clipSemiplano(q, f); });
    return q.length >= 3 ? q : null;
  }
  function escolherEscalaPlanta(A, caixa, opt) {
    opt = opt || {};
    var esc = [25, 50, 75, 100], w = caixa[2] - caixa[0], h = caixa[3] - caixa[1];
    for (var i = 0; i < esc.length; i++) { var k = 1000 / esc[i]; if (w * k + 16 + (opt.esq || 0) <= A.w && h * k + 16 + 18 + 22 + (opt.topo || 0) + (opt.baixo || 0) <= A.h) return { escala: esc[i], k: k }; }
    return { escala: 100, k: 10, estourou: true };
  }
  function quadOrient(ctr, u, v, hu, vMenos, vMais) {
    function P(a, b) { return [ctr[0] + u[0] * a + v[0] * b, ctr[1] + u[1] * a + v[1] * b]; }
    return [P(-hu, -vMenos), P(hu, -vMenos), P(hu, vMais), P(-hu, vMais)];
  }
  /* o recorte do ambiente na folha: o título, as paredes e pilares cortados, os vãos. opt = { numero, nome, topo, esq, baixo } (mm reservados em volta) */
  function baseDaPlanta(c, an, opt) {
    var D = c.D, d = DS(), S = ES(), G = GEO(), A = c.A, amb = an.amb, dados = c.dados, avisos = [];
    var bb = amb.bbox || G.bbox(amb.pts), W = [bb[0] - JANELA_M, bb[1] - JANELA_M, bb[2] + JANELA_M, bb[3] + JANELA_M];
    var es = escolherEscalaPlanta(A, W, opt), k = es.k;
    if (es.estourou) avisos.push("o ambiente não cabe em 1:75 na folha A3: usei 1:100");
    var ox = A.x + 8 + (opt.esq || 0) + (A.w - 16 - (opt.esq || 0) - (W[2] - W[0]) * k) / 2, oy = A.y + 18 + (opt.topo || 0), M = d.mapa(W, ox, oy, k);
    d.escalaCota(D, es.escala);
    S.titulo(D, A.x + 4, A.y + 2, opt.numero || "01", opt.nome, "1:" + es.escala);
    var inter = function (pts) { var b = G.bbox(pts); return !(b[2] < W[0] || b[0] > W[2] || b[3] < W[1] || b[1] > W[3]); };
    var paredes = [], pilares = [], porId = {};
    arr(dados.paredes).forEach(function (w) {
      if (!VIVO[w.status] || w.muro || w.pav !== amb.pav || !inter(w.pts)) return;
      porId[w.id] = w; var q = recortarRet(w.pts, W);
      if (q) paredes.push({ id: w.id, pts: q, status: w.status, espessura: w.espessura, rotY: w.rotY });
    });
    arr(dados.pilares).forEach(function (p) { if (!VIVO[p.status] || p.pav !== amb.pav || !inter(p.pts)) return; var q = recortarRet(p.pts, W); if (q) pilares.push({ id: p.id, pts: q, status: p.status }); });
    d.paredesPlanta(D, M, paredes, "layout"); d.pilaresPlanta(D, M, pilares, "layout");
    var vaos = arr(dados.vaos).filter(function (v) { return VIVO[v.status] && porId[v.parede] && v.x >= W[0] && v.x <= W[2] && v.z >= W[1] && v.z <= W[3]; });
    d.vaosPlanta(D, M, vaos, porId, "layout");
    return { M: M, k: k, es: es, W: W, avisos: avisos, porId: porId };
  }
  /* a cadeia de cotas ao longo de uma parede: us = posições (m, de 0 a L) já ordenadas; afMm = distância da parede até a linha de cota (para dentro do ambiente) */
  function cadeiaParede(c, M, k, v, us, afMm) {
    var D = c.D, d = DS(), ed = v.ed, ut = [];
    us.slice().sort(function (a, b) { return a - b; }).forEach(function (u) { if (!ut.length || u - ut[ut.length - 1] >= 2.6 / k) ut.push(u); else if (u === v.L) { ut.pop(); ut.push(u); } });
    if (ut.length < 3) return false;
    var pp = ut.map(function (u) { return M.P(ed.A[0] + ed.r[0] * (u + ed.uMin), ed.A[1] + ed.r[1] * (u + ed.uMin)); }), vals = [];
    for (var i = 0; i + 1 < ut.length; i++) vals.push(d.cotaTxt(ut[i + 1] - ut[i]));
    var ux = pp[pp.length - 1][0] - pp[0][0], uz = pp[pp.length - 1][1] - pp[0][1], Ln = hip(ux, uz) || 1, nx = uz / Ln, nz = -ux / Ln, sg = (nx * -ed.d[0] + nz * -ed.d[1]) > 0 ? 1 : -1;
    /* a linha de cota e as de chamada não podem passar por cima de um texto já escrito (a cota da outra parede, o rótulo): o afastamento anda até achar lugar */
    var cands = [afMm, afMm + 4.5, afMm + 9, afMm + 13.5, afMm + 18, afMm - 3], of = sg * afMm;
    for (var ci = 0; ci < cands.length; ci++) {
      var o2 = sg * cands[ci], livre = true;
      pp.forEach(function (p) { if (livre && D.cortaTexto(p[0], p[1], p[0] + nx * o2, p[1] + nz * o2)) livre = false; });
      if (livre && D.cortaTexto(pp[0][0] + nx * o2, pp[0][1] + nz * o2, pp[pp.length - 1][0] + nx * o2, pp[pp.length - 1][1] + nz * o2)) livre = false;
      if (livre) { of = o2; break; }
    }
    D.cadeia(pp, of, vals, { offs: [of + sg * 4.5, of + sg * 9] });
    return true;
  }
  function marcadorA(c, ctx, v, pr, avisos) {
    var D = c.D, S = ES(), amb = ctx.amb, M = ctx.M, k = ctx.k, ed = v.ed;
    var us = (v.itens.length ? v.itens.map(function (it) { return (it.u0 + it.u1) / 2; }) : v.pontos.map(function (p) { return p.u; })), umid = us.reduce(function (a, b) { return a + b; }, 0) / us.length;
    var ang = (Math.atan2(ed.d[0], -ed.d[1]) * 180) / Math.PI, achou = null, med = { hu: 7.5 / k, ap: 7.9 / k, tr: 7.2 / k };
    var profA = Math.max.apply(null, [0].concat(v.itens.map(function (it) { return it.prof; }))) * k;
    for (var s = Math.max(11, profA + 10); s <= profA + 70 && !achou; s += 2) {
      for (var dl = 0; dl <= (v.L * k) / 2 && !achou; dl += 3) {
        [1, -1].forEach(function (sg2) {
          if (achou) return;
          var sd = s / k, u = umid + sg2 * dl / k;
          if (u < med.hu || u > v.L - med.hu) return;
          var cm = [ed.A[0] + ed.r[0] * (u + ed.uMin) + ed.nIn[0] * sd, ed.A[1] + ed.r[1] * (u + ed.uMin) + ed.nIn[1] * sd];
          var Q = quadOrient(cm, ed.r, ed.nIn, med.hu, med.ap, med.tr);
          if (!Q.every(function (p) { return dentro(amb.pts, p); })) return;
          var QP = Q.map(function (p) { return M.P(p[0], p[1]); });
          if (D.livreQ([QP[0], QP[1], QP[2], QP[3]], 0.5)) achou = cm;
        });
      }
    }
    if (!achou) { avisos.push("sem lugar livre para o marcador da vista " + v.letra); achou = [ed.A[0] + ed.r[0] * (umid + ed.uMin) + ed.nIn[0] * 0.5, ed.A[1] + ed.r[1] * (umid + ed.uMin) + ed.nIn[1] * 0.5]; }
    var pm = M.P(achou[0], achou[1]);
    S.marcadorVista(D, pm[0], pm[1], v.letra, pr, ang, "A");
  }
  /* marcador de CORTE (tipo B): triângulo pequeno fora da peça e a barra longa atravessando a peça, de frente para a parede (a parede fica à direita de quem olha) */
  function marcadorB(c, ctx, ct, pr, avisos) {
    var D = c.D, S = ES(), M = ctx.M, k = ctx.k, v = ct.v, ed = v.ed, it = ct.it, B = S.MARCADOR_VISTA.B;
    var dv = [-ed.r[0], -ed.r[1]], ang = (Math.atan2(dv[0], -dv[1]) * 180) / Math.PI, uax = ed.d;   /* o eixo u do marcador aponta para a parede */
    var profMm = Math.max.apply(null, (ct.its || [it]).map(function (q) { return q.prof; })) * k, hu = 5 / k, achou = null, barra = B.barra[1];
    var cands = []; for (var q = 0; q <= 40; q++) { var du = (q % 2 ? 1 : -1) * Math.ceil(q / 2) * 0.05; cands.push(ct.u + du); }
    var folgas = [6.3, 6.5, 6.7, 6.9, 7.1, 7.3, 7.6, 11, 14, 18, 22];
    for (var i = 0; i < cands.length * folgas.length && !achou; i++) {
      var u = cands[Math.floor(i / folgas.length)], fg = folgas[i % folgas.length]; if (u < (ct.uMin != null ? ct.uMin : it.u0) + 0.04 || u > (ct.uMax != null ? ct.uMax : it.u1) - 0.04) continue;
      var sc = (profMm + fg) / k, pc = [ed.A[0] + ed.r[0] * (u + ed.uMin) + ed.nIn[0] * sc, ed.A[1] + ed.r[1] * (u + ed.uMin) + ed.nIn[1] * sc];
      /* a caixa do triângulo (u de -5 a 5, v de -5,25 a 0,5) e a do "PR nn" (u de 4 a 16, v de 4,5 a 8,5), em mm do marcador */
      function caixa(u0, u1, v0, v1) {
        function P(a, b) { var x = pc[0] + (uax[0] * a + dv[0] * -b) / k, z = pc[1] + (uax[1] * a + dv[1] * -b) / k; return M.P(x, z); }
        return [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
      }
      if (D.livreQ(caixa(-6, 6, -6, 1), 0.15)) {
        var prvs = [8, -9.5, 12, -13.5, 16, -17.5], prv = null;   /* o "PR nn" ao lado do triângulo: v positivo = lado de trás, negativo = depois do ápice */
        prvs.forEach(function (pv) { if (prv == null && D.livreQ(caixa(-5.5, 5.5, pv - 1.5, pv + 1.5), 0.15)) prv = pv; });
        if (prv != null) achou = { pc: pc, u: u, barra: barra, prv: prv };
      }
    }
    if (!achou) { avisos.push("sem lugar livre para o marcador do corte " + ct.letra); var sc2 = (profMm + 6.7) / k; achou = { pc: [ed.A[0] + ed.r[0] * (ct.u + ed.uMin) + ed.nIn[0] * sc2, ed.A[1] + ed.r[1] * (ct.u + ed.uMin) + ed.nIn[1] * sc2], u: ct.u }; }
    var pm = M.P(achou.pc[0], achou.pc[1]);
    S.marcadorVista(D, pm[0], pm[1], ct.letra, null, ang, "B", { barra: barra });
    /* o "PR nn" fica ao lado do triângulo, fora da peça (no meio da barra ele cairia sobre a pegada do móvel) */
    D.texto(pm[0] + ed.r[0] * (achou.prv != null ? achou.prv : 8), pm[1] + ed.r[1] * (achou.prv != null ? achou.prv : 8), "PR " + pr, S.TEXTOS.marcador_prancha, { al: "C", meio: true, rot: ang });
    void B; void hu;
    ct.uMarc = achou.u;
  }
  function desenharPlanta(c, an, numPR, numPRcorte) {
    var D = c.D, d = DS(), S = ES(), amb = an.amb, avisos = [];
    var ctx = baseDaPlanta(c, an, { numero: "01", nome: "MÓVEIS - PLANTA BAIXA" });
    ctx.amb = amb; var M = ctx.M, k = ctx.k; avisos = avisos.concat(ctx.avisos);
    an.moveis.forEach(function (m) {
      var P = d.polyPapel(M, m.pts), aereo = (m.h0 - amb.base) >= 1.2, cam = aereo ? "ARQ-OCULTA" : (ehMarcenaria(m) ? "ARQ-FINA" : (m.categoria === "loucas" ? "ARQ-LOUCA" : "ARQ-MOVEL"));
      D.poli(P, cam, true);
    });
    /* ordem: marcadores de corte (precisam do lugar livre), cotas de posição da marcenaria (mais afastadas onde há corte), marcadores de vista, cotas internas
       (a linha delas não cruza texto) e o rótulo do ambiente */
    var semLugar = [], cruza = [];
    var cortesFolha = arr(an.cortes).filter(function (ct) { return ct._folha != null; });   /* só há marcador de corte se a folha dos cortes existe */
    cortesFolha.forEach(function (ct) { marcadorB(c, ctx, ct, numPRcorte(ct), avisos); });
    an.vistas.forEach(function (v) {
      var itens = v.itens.filter(function (it) { return it.marc; });
      if (!itens.length) return;
      var us = [0, v.L]; itens.forEach(function (it) { us.push(it.u0, it.u1); });
      var smax = Math.max.apply(null, itens.map(function (it) { return it.prof; })), temCorte = cortesFolha.some(function (ct) { return ct.v === v; });
      cadeiaParede(c, M, k, v, us, smax * k + (temCorte ? 17 : S.afastamento1()));
    });
    an.vistas.forEach(function (v) { marcadorA(c, ctx, v, numPR(v), avisos); });
    d.cotasInternas(D, M, [amb], { moveis: an.moveis.filter(function (m) { return (m.h0 - amb.base) < 1.2; }), semLugar: semLugar, cruza: cruza });
    if (semLugar.length) avisos.push("sem lugar livre para a cota interna de " + semLugar.join(", "));
    var sl = d.rotulosAmbientes(D, M, [amb], { completo: false });
    if (sl.length) avisos.push("sem lugar livre para o rótulo de " + sl.join(", "));
    var yb = M.oy + M.alt + 10;
    d.escalaGrafica(D, c.A.x + 6, yb + 4, k, k * 5 >= 12 ? 5 : 10);
    d.norte(D, c.A.x + 82, yb + 2, c.dados.terreno ? c.dados.terreno.norte : 0, 6);
    return { escala: "1:" + ctx.es.escala, avisos: avisos, M: M };
  }

  /* ------------------------------------------------------------ MONTAR A SÉRIE */
  function nomeFolha(amb) { return txt(amb.nome).toUpperCase(); }
  function tituloLetras(letras) { return letras.length === 1 ? "(VISTA " + letras[0] + ")" : "(" + letras.map(function (l) { return "VISTA " + l; }).join(" E ") + ")"; }
  function empacotar(A, vistas, avisos, nomeAmb) {
    var folhas = [], atual = null;
    vistas.forEach(function (v) {
      var med = medirVista(v, 40);
      if (med.w > A.w - 2 || med.h > A.h) {
        var m2 = medirVista(v, 20);
        avisos.push(nomeAmb + ": a vista " + v.letra + " não cabe em 1:25 na folha A3 (parede de " + r3(v.L) + " m): saiu em 1:50, divergente do padrão");
        med = m2;
      }
      v._med = med;
      var cabe = false;
      if (atual && atual.length < 2) {
        var h1 = atual.reduce(function (s, x) { return s + x._med.h; }, 0) + med.h + 4, lado = atual.reduce(function (s, x) { return s + x._med.w; }, 0) + med.w + 6;
        if (h1 <= A.h) { atual.modo = "pilha"; cabe = true; }
        else if (lado <= A.w && Math.max(med.h, atual[0]._med.h) <= A.h) { atual.modo = "lado"; cabe = true; }
      }
      if (cabe) atual.push(v); else { atual = [v]; atual.modo = "pilha"; folhas.push(atual); }
    });
    return folhas;
  }
  /* as opções de folha do caderno (cada tipo liga e desliga na tela); o que não é dito vale o padrão */
  var FOLHAS_PADRAO = { planta: true, vistas: true, cortes: true, eletrico: true, luminotecnico: true, pedras: true, imagens: false };
  function flagsDe(cfgInt) {
    var f = {}, o = (cfgInt && cfgInt.folhas) || {};
    Object.keys(FOLHAS_PADRAO).forEach(function (k) { f[k] = o[k] === undefined ? FOLHAS_PADRAO[k] : !!o[k]; });
    return f;
  }
  function X() { return dep("ArqIntExtras", "./arqintextras.js"); }
  function novoCtx(c, cI, E, def) { var Dn = DS().novo(E, c.depurar === false ? false : true), cc = {}; Object.keys(cI).forEach(function (k) { cc[k] = cI[k]; }); cc.D = Dn; cc.def = def; return cc; }

  function montar(c, cfgInt, geoI, E) {
    var d = DS(), itens = [], avisos = [], sel = cfgInt && arr(cfgInt.ambientes).length ? cfgInt.ambientes.map(String) : null, FL = flagsDe(cfgInt), Xt = X();
    var amis = arr((c.depois || c.dados).ambientes).filter(function (a) { return a && VIVO[a.status]; });
    var escolhidos = amis.filter(function (a) {
      if (sel) return sel.indexOf(String(a.id)) >= 0;
      return arr(c.dados.moveis).some(function (m) { return movelNoAmbiente(m, a) && movelGatilho(m); });
    });
    if (!escolhidos.length) { avisos.push("Caderno de interiores: nenhum ambiente com mobiliário ou marcenaria (ou nenhum escolhido)."); return { itens: itens, avisos: avisos }; }
    var prefixo = txt(cfgInt && cfgInt.prefixo) || "INT", seq = 0, A = geoI.area;
    var cI = {}; Object.keys(c).forEach(function (k) { cI[k] = c[k]; });
    cI.geo = geoI; cI.A = A;
    function novoDef(tipo, id, titulo, amb, carimbo) { seq++; var rot = dois(seq); return { id: id, tipo: tipo, pav: amb ? amb.pav : null, titulo: titulo, rotulo: rot, numero: prefixo + "-" + rot, carimboFolha: carimbo, ambienteId: amb ? amb.id : null }; }
    function poe(def, Dn, escala, res) { itens.push({ def: def, D: Dn, escala: escala || "INDICADA", res: res || {} }); }
    function erro(def, Dn, e) { avisos.push(def.numero + ": " + (e && e.message ? e.message : String(e))); Dn.texto(A.x + 10, A.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }

    /* ---- folha geral das PEDRAS (a primeira da série INT) */
    if (FL.pedras && Xt) {
      var defPd = novoDef("int-pedras", "int-pedras", "PEDRAS - BANCADAS, SOLEIRAS E PEITORIS", null, "01/01");
      var cPd = novoCtx(c, cI, E, defPd), rPd = null;
      try { rPd = Xt.pedras(cPd, defPd); } catch (ePd) { erro(defPd, cPd.D, ePd); }
      if (rPd && rPd.vazia) { seq--; avisos.push("Caderno de interiores: nenhuma bancada ou peça de pedra no modelo: a folha de pedras não foi gerada."); }
      else { arr(rPd && rPd.avisos).forEach(function (a) { avisos.push(defPd.numero + ": " + a); }); poe(defPd, cPd.D, rPd && rPd.escala, rPd); }
    }

    /* ---- 1ª passada por ambiente: a análise e a lista de folhas (os "PR nn" dos marcadores precisam do NN das folhas das vistas e dos cortes) */
    var planos = escolhidos.map(function (amb) {
      var an = analisar(cI, amb), nome = nomeFolha(amb), lista = [], nn = 0;
      an.avisos.forEach(function (a) { avisos.push(nome + ": " + a); });
      var folhasV = FL.vistas ? empacotar(A, an.vistas, avisos, nome) : [];
      var folhasC = FL.cortes && Xt ? Xt.empacotarCortes(A, an.cortes, avisos, nome) : [];
      var folhasEV = FL.eletrico && Xt ? empacotar(A, an.vistasEle, avisos, nome + " (elétrico)") : [];
      var temEle = FL.eletrico && Xt && an.eletricos.length > 0, temLuz = FL.luminotecnico && Xt && an.luzes.length > 0;
      if (FL.planta) lista.push({ t: "planta" });
      folhasV.forEach(function (g) { lista.push({ t: "vistas", g: g }); });
      folhasC.forEach(function (g) { lista.push({ t: "cortes", g: g }); });
      if (temEle) lista.push({ t: "ele-planta" });
      if (temEle) folhasEV.forEach(function (g) { lista.push({ t: "ele-vistas", g: g }); });
      if (temLuz) lista.push({ t: "luz" });
      lista.forEach(function (s) { s.nn = ++nn; });
      var nTot = lista.length + (FL.imagens ? 0 : 0);
      lista.forEach(function (s) {
        if (s.t === "vistas") s.g.forEach(function (v) { v._folha = s.nn; });
        if (s.t === "cortes") s.g.forEach(function (ct) { ct._folha = s.nn; });
        if (s.t === "ele-vistas") s.g.forEach(function (v) { v._folha = s.nn; });
      });
      if (FL.eletrico && Xt && !an.eletricos.length) avisos.push(nome + ": o modelo não tem ponto elétrico (tomada, interruptor ou caixa) neste ambiente: folhas de elétrico não geradas.");
      if (FL.luminotecnico && Xt && !an.luzes.length) avisos.push(nome + ": o modelo não tem luminária neste ambiente: folha de luminotécnico não gerada.");
      if (FL.cortes && Xt && !an.cortes.length && an.vistas.length) avisos.push(nome + ": nenhum módulo de marcenaria com profundidade a partir de 30 cm: sem cortes.");
      return { amb: amb, an: an, lista: lista, nTot: nTot, nome: nome };
    });
    planos.forEach(function (pl) {
      var amb = pl.amb, an = pl.an, nome = pl.nome, nTot = pl.nTot;
      /* ---- 00 IMAGENS ILUSTRATIVAS (só se o usuário marcou) */
      if (FL.imagens && Xt) {
        var defI = novoDef("int-imagens", "int-" + amb.id + "-imagens", nome + " - 00 IMAGENS ILUSTRATIVAS", amb, "00/" + dois(nTot));
        var cI2 = novoCtx(c, cI, E, defI), rI = {};
        try { rI = Xt.imagens(cI2, defI, amb, cfgInt && cfgInt.renders); } catch (eI) { erro(defI, cI2.D, eI); }
        poe(defI, cI2.D, "SEM ESCALA", rI);
      }
      pl.lista.forEach(function (s) {
        var carimbo = dois(s.nn) + "/" + dois(nTot);
        if (s.t === "planta") {
          var defP = novoDef("int-planta", "int-" + amb.id + "-planta", nome + " - MÓVEIS - PLANTA BAIXA", amb, carimbo), cc = novoCtx(c, cI, E, defP), res = {};
          try { res = desenharPlanta(cc, an, function (v) { return dois(v._folha); }, function (ct) { return dois(ct._folha || 0); }); }
          catch (e) { erro(defP, cc.D, e); }
          arr(res.avisos).forEach(function (a) { avisos.push(defP.numero + ": " + a); });
          if (!an.vistas.length && !an.avisos.length) avisos.push(defP.numero + ": " + nome + " não tem móvel nem marcenaria encostada em parede: só a planta de móveis foi gerada.");
          poe(defP, cc.D, res.escala, res);
        } else if (s.t === "vistas" || s.t === "ele-vistas") {
          var ele = s.t === "ele-vistas", letras = s.g.map(function (v) { return v.letra; });
          var defV = novoDef(s.t === "vistas" ? "int-vistas" : "int-ele-vistas", "int-" + amb.id + "-" + s.t + "-" + s.nn, nome + (ele ? " - ELÉTRICO " : " ") + tituloLetras(letras), amb, carimbo);
          var cv = novoCtx(c, cI, E, defV), semLug = [], semAlt = [], escs = [];
          try {
            var x = A.x + 4, y = A.y + 2;
            s.g.forEach(function (v, vi) {
              var med = v._med, X0 = (s.g.modo === "lado" ? x : A.x + 4) + med.nt.wE + med.cotaW;
              var r = desenharVista(cv, v, X0, y, med, dois(vi + 1), an); semLug = semLug.concat(r.semLugar); semAlt = semAlt.concat(r.semAlt); escs.push("1:" + Math.round(1000 / med.k));
              if (s.g.modo === "lado") x += med.w + 6; else y += med.h + 4;
            });
          } catch (e2) { erro(defV, cv.D, e2); }
          if (semLug.length) avisos.push(defV.numero + ": sem lugar livre para a nota de material de " + semLug.join(", "));
          if (semAlt.length) avisos.push(defV.numero + ": ponto elétrico sem altura de montagem no modelo (" + semAlt.join(", ") + "): não cotado na vista");
          poe(defV, cv.D, escs.length && escs.every(function (e) { return e === escs[0]; }) ? escs[0] : escs.join(" / "), { vistas: letras });
        } else if (s.t === "cortes") {
          var letrasC = s.g.map(function (ct) { return ct.letra; });
          var defC = novoDef("int-cortes", "int-" + amb.id + "-cortes-" + s.nn, nome + " - MÓVEIS - CORTES " + letrasC.join(" E "), amb, carimbo), cC = novoCtx(c, cI, E, defC), rC = {};
          try { rC = Xt.desenharCortes(cC, s.g, an, I()); } catch (e3) { erro(defC, cC.D, e3); }
          arr(rC.avisos).forEach(function (a) { avisos.push(defC.numero + ": " + a); });
          poe(defC, cC.D, rC.escala, { cortes: letrasC });
        } else if (s.t === "ele-planta") {
          var defE = novoDef("int-ele-planta", "int-" + amb.id + "-ele-planta", nome + " - ELÉTRICO - PLANTA BAIXA", amb, carimbo), cE = novoCtx(c, cI, E, defE), rE = {};
          try { rE = Xt.eletricoPlanta(cE, an, function (v) { return dois(v._folha); }, I()); } catch (e4) { erro(defE, cE.D, e4); }
          arr(rE.avisos).forEach(function (a) { avisos.push(defE.numero + ": " + a); });
          poe(defE, cE.D, rE.escala, rE);
        } else if (s.t === "luz") {
          var defL = novoDef("int-luz", "int-" + amb.id + "-luz", nome + " - LUMINOTÉCNICO - PLANTA BAIXA", amb, carimbo), cL = novoCtx(c, cI, E, defL), rL = {};
          try { rL = Xt.luminotecnico(cL, an, I()); } catch (e5) { erro(defL, cL.D, e5); }
          arr(rL.avisos).forEach(function (a) { avisos.push(defL.numero + ": " + a); });
          poe(defL, cL.D, rL.escala, rL);
        }
      });
    });
    return { itens: itens, avisos: avisos };
  }

  function I() { return ArqInteriores._int; }
  var ArqInteriores = { VERSAO: 2, listarAmbientes: listarAmbientes, montar: montar, analisar: analisar, linhasNota: linhasNota, ehMarcenaria: ehMarcenaria, GANCHOS: GANCHOS, FOLHAS_PADRAO: FOLHAS_PADRAO, flagsDe: flagsDe,
    _int: { arestas: arestas, limpar: limpar, recortarRet: recortarRet, colocarNotas: colocarNotas, medirVista: medirVista, empacotar: empacotar, quebrarNota: quebrarNota, rodapeAltura: rodapeAltura, niveisVerticais: niveisVerticais, niveisHorizontais: niveisHorizontais,
      desenharVista: desenharVista, desenharPlanta: desenharPlanta, marcadorA: marcadorA, baseDaPlanta: baseDaPlanta, cadeiaParede: cadeiaParede, simboloPonto: simboloPonto, varianteAltura: varianteAltura, quadOrient: quadOrient, RE_TAMPO: RE_TAMPO, ehNotaPedra: null, movelNoAmbiente: movelNoAmbiente,
      Ue: Ue, Dep: Dep, JANELA_M: JANELA_M, VERMELHO: VERMELHO, VIVO: VIVO, dentro: dentro, dois: dois, r3: r3, txt: txt, arr: arr, num: num, hip: hip } };
  global.ArqInteriores = ArqInteriores;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqInteriores;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

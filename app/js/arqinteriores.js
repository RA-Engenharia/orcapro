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
 * FASE 2b (ganchos abaixo, NADA desenhado): cortes 1:20 da marcenaria, elétrico e luminotécnico de interiores, pedras e imagens ilustrativas.
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
  var GANCHOS = { cortes_1_20: null, eletrico: null, luminotecnico: null, pedras: null, imagens: null };   /* fase 2b */

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
      out.push({ u0: Math.min.apply(null, us), u1: Math.max.apply(null, us), y0: y0, y1: y1, dep: (Math.min.apply(null, deps) + Math.max.apply(null, deps)) / 2, mat: q.mat, tampo: RE_TAMPO.test(txt(q.mat)) && (y1 - y0) < 0.25 });
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
  function analisar(c, amb) {
    var d = c.dados, moveis = arr(d.moveis).filter(function (m) { return movelNoAmbiente(m, amb); }), avisos = [];
    var P = pe(c, amb);
    if (!P.v) avisos.push("sem pé-direito conhecido (ambiente sem forro e parede sem altura): vistas não geradas");
    var E = ligar(arestas(amb.pts)).filter(function (x) { return x.L >= LADO_VAZIO_M; });
    var vistas = [];
    E.forEach(function (ed) {
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
        var dep = Math.max.apply(null, m.pts.map(function (p) { return Dep(ed, p); }));
        itens.push({ m: m, u0: u0, u1: u1, y0: Math.max(0, y0), y1: y1, pecas: pecas, marc: ehMarcenaria(m), gatilho: movelGatilho(m), prof: -Math.min.apply(null, ds) });
        void dep;
      });
      if (!itens.some(function (it) { return it.gatilho; })) return;
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
      itens.forEach(function (it) { if (it.y1 > P.v + 0.01) avisos.push("a peça " + it.m.nome + " (" + r3(it.y1) + " m) passa do pé-direito (" + r3(P.v) + " m) na vista da parede de " + r3(ed.L) + " m: conferir"); });
      vistas.push({ ed: ed, L: ed.L, itens: itens, vaos: vaos, base: amb.base, H: P.v, tEsq: espessuraLado(c, ed, 0), tDir: espessuraLado(c, ed, 1), rodape: rodapeAltura(amb), ang: Math.atan2(ed.d[0], -ed.d[1]) });
    });
    /* A, B, C…: no sentido horário, começando pela parede de cima (norte) */
    vistas.forEach(function (v) { var a = v.ang < -1e-9 ? v.ang + 2 * Math.PI : v.ang; v.ordem = a; });
    vistas.sort(function (p, q) { return p.ordem - q.ordem; });
    vistas.forEach(function (v, i) { v.letra = String.fromCharCode(65 + (i % 26)); });
    return { amb: amb, moveis: moveis, vistas: P.v ? vistas : [], pe: P, avisos: avisos };
  }

  /* ------------------------------------------------------------ NOTA DE MATERIAL (de onde sai cada linha) */
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
    var S = ES(), tE = (v.tEsq || 0) * k, tD = (v.tDir || 0) * k, nt = colocarNotas(v, k), entre = S.entreCadeias(Math.round(1000 / k));
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
  function desenharVista(c, v, X0, Y0, med, num2) {
    var D = c.D, d = DS(), S = ES(), G = GEO(), k = med.k, den = Math.round(1000 / k);
    d.escalaCota(D, den);
    var Ypiso = Y0 + 14 + v.H * k, Ytop = Ypiso - v.H * k, L = v.L;
    function XP(u) { return X0 + u * k; }
    function YP(y) { return Ypiso - y * k; }
    ES().titulo(D, X0 - med.cotaW - med.nt.wE, Y0, num2, "VISTA " + v.letra, "1:" + den);
    /* parede cortada dos lados: poché cinza com hachura, contorno 0,30 */
    function parede(xa, xb) {
      var P = [[xa, Ytop], [xb, Ytop], [xb, Ypiso], [xa, Ypiso]];
      d.fundoPol(D, P, "#bdbdbd"); G.hachuraLinhas(P, 1.6, 45).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], "ARQ-HACHURA"); });
      D.poli(P, "ARQ-PAREDE", true);
    }
    if (v.tEsq) parede(X0 - med.tE, X0);
    if (v.tDir) parede(XP(L), XP(L) + med.tD);
    /* piso e teto em vista (0,30) */
    var xa = X0 - med.tE, xb = XP(L) + med.tD;
    D.linha(xa, Ypiso, xb, Ypiso, "ARQ-PAREDE"); D.linha(xa, Ytop, xb, Ytop, "ARQ-PAREDE");
    if (!v.tEsq) D.linha(X0, Ytop, X0, Ypiso, "ARQ-PAREDE");
    if (!v.tDir) D.linha(XP(L), Ytop, XP(L), Ypiso, "ARQ-PAREDE");
    /* vãos */
    v.vaos.forEach(function (o) {
      var P = [[XP(o.u0), YP(Math.min(o.y1, v.H))], [XP(o.u1), YP(Math.min(o.y1, v.H))], [XP(o.u1), YP(Math.max(o.y0, 0))], [XP(o.u0), YP(Math.max(o.y0, 0))]];
      d.fundoPol(D, P, "#fff"); D.poli(P, "ARQ-VAO", true);
      if (o.tipo === "janela") D.linha(P[0][0], (P[0][1] + P[3][1]) / 2, P[1][0], (P[0][1] + P[3][1]) / 2, "ARQ-ARCO");
    });
    /* rodapé (só se o ambiente traz a altura), interrompido pelas portas */
    if (v.rodape > 0.01 && v.rodape < v.H) {
      var cortes = [0]; v.vaos.filter(function (o) { return o.tipo === "porta" && o.y0 < 0.02; }).sort(function (a, b) { return a.u0 - b.u0; }).forEach(function (o) { cortes.push(o.u0, o.u1); }); cortes.push(L);
      for (var ic = 0; ic + 1 < cortes.length; ic += 2) if (cortes[ic + 1] - cortes[ic] > 0.01) D.linha(XP(cortes[ic]), YP(v.rodape), XP(cortes[ic + 1]), YP(v.rodape), "ARQ-FINA");
    }
    /* peças em vista: as de trás primeiro, cada uma com fundo branco e contorno de 0,09 (tampo e bancada: 0,30) */
    var todas = [];
    v.itens.forEach(function (it) { it.pecas.forEach(function (q) { todas.push(q); }); });
    todas.sort(function (a, b) { return b.dep - a.dep; });
    todas.forEach(function (q) {
      var u0 = Math.max(0, q.u0), u1 = Math.min(L, q.u1), y0 = Math.max(0, q.y0), y1 = Math.min(v.H, q.y1);
      if (u1 <= u0 || y1 <= y0) return;
      if ((u1 - u0) * k < 0.35 && (y1 - y0) * k < 0.35) return;
      var P = [[XP(u0), YP(y1)], [XP(u1), YP(y1)], [XP(u1), YP(y0)], [XP(u0), YP(y0)]];
      d.fundoPol(D, P, "#fff"); D.poli(P, q.tampo ? "ARQ-BATENTE" : "ARQ-FINA", true);
    });
    /* cotas verticais (alturas das peças e a altura total) à esquerda, depois da parede cortada */
    var ny = niveisVerticais(v, k), a1 = S.afastamento1(), off1 = med.tE + a1;
    if (ny.length >= 2) {
      var Pv = ny.map(function (y) { return [X0, YP(y)]; }), vv = []; for (var i = 0; i + 1 < ny.length; i++) vv.push(d.cotaTxt(ny[i + 1] - ny[i]));
      D.cadeia(Pv, off1, vv, { offs: [off1 + 3, off1 + 6] });
      if (ny.length > 2) D.cadeia([[X0, YP(0)], [X0, YP(v.H)]], off1 + med.entre, [d.cotaTxt(v.H)], { semExt: true, offs: [off1 + med.entre + 3] });   /* com só piso e teto a cadeia já é a altura total */
    }
    /* cotas horizontais (cadeia das peças + total) embaixo do piso */
    var nu = niveisHorizontais(v, k);
    if (nu.length >= 2) {
      var Ph = nu.map(function (u) { return [XP(u), Ypiso]; }), vh = []; for (var j = 0; j + 1 < nu.length; j++) vh.push(d.cotaTxt(nu[j + 1] - nu[j]));
      var ofh = -a1;
      D.cadeia(Ph, ofh, vh, { offs: [ofh - 3, ofh - 6] });
      D.cadeia([[XP(0), Ypiso], [XP(L), Ypiso]], ofh - med.entre, [d.cotaTxt(L)], { semExt: true, offs: [ofh - med.entre - 3] });
    }
    /* notas de material: colunas à esquerda e à direita, uma por móvel */
    var xtE = X0 - med.cotaW - med.nt.wE + 0, xtD = XP(L) + med.tD + 4 + med.nt.wD;
    med.nt.notas.forEach(function (n) {
      var py = Ypiso - n.y, px = X0 + n.px;
      S.notaMaterial(D, px, py, n.lado === "E" ? xtE : xtD, n.ls);
    });
    return { Ypiso: Ypiso, semLugar: med.nt.semLugar };
  }

  /* ------------------------------------------------------------ PLANTA DE MÓVEIS */
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
  function escolherEscalaPlanta(A, caixa) {
    var esc = [25, 50, 75, 100], w = caixa[2] - caixa[0], h = caixa[3] - caixa[1];
    for (var i = 0; i < esc.length; i++) { var k = 1000 / esc[i]; if (w * k + 16 <= A.w && h * k + 16 + 18 + 22 <= A.h) return { escala: esc[i], k: k }; }
    return { escala: 100, k: 10, estourou: true };
  }
  function quadOrient(ctr, u, v, hu, vMenos, vMais) {
    /* caixa orientada: u = eixo largo (meia-largura hu), v = eixo "para trás" (vMenos para o lado do ápice, vMais para o outro); devolve [q0, q1, q2, q3] com q1-q0 // u e q3-q0 // v */
    function P(a, b) { return [ctr[0] + u[0] * a + v[0] * b, ctr[1] + u[1] * a + v[1] * b]; }
    return [P(-hu, -vMenos), P(hu, -vMenos), P(hu, vMais), P(-hu, vMais)];
  }
  function desenharPlanta(c, an, numPR, geoTitulo) {
    var D = c.D, d = DS(), S = ES(), G = GEO(), A = c.A, amb = an.amb, dados = c.dados, avisos = [];
    var bb = amb.bbox || G.bbox(amb.pts), W = [bb[0] - JANELA_M, bb[1] - JANELA_M, bb[2] + JANELA_M, bb[3] + JANELA_M];
    var es = escolherEscalaPlanta(A, W), k = es.k;
    if (es.estourou) avisos.push("o ambiente não cabe em 1:75 na folha A3: usei 1:100");
    var ox = A.x + 8 + (A.w - 16 - (W[2] - W[0]) * k) / 2, oy = A.y + 18, M = d.mapa(W, ox, oy, k);
    d.escalaCota(D, es.escala);
    var hT = S.titulo(D, A.x + 4, A.y + 2, "01", "MÓVEIS - PLANTA BAIXA", "1:" + es.escala);
    void hT; void geoTitulo;
    /* paredes e pilares cortados, recortados na janela */
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
    /* móveis e marcenaria em pegada: o que está a mais de 1,20 m do piso (armário aéreo) vai tracejado */
    an.moveis.forEach(function (m) {
      var P = d.polyPapel(M, m.pts), aereo = (m.h0 - amb.base) >= 1.2, cam = aereo ? "ARQ-OCULTA" : (ehMarcenaria(m) ? "ARQ-FINA" : (m.categoria === "loucas" ? "ARQ-LOUCA" : "ARQ-MOVEL"));
      D.poli(P, cam, true);
    });
    /* cotas de posição da marcenaria, na frente de cada parede com vista */
    var semCota = [];
    an.vistas.forEach(function (v) {
      var ed = v.ed, itens = v.itens.filter(function (it) { return it.marc; });
      if (!itens.length) return;
      var us = [0, v.L]; itens.forEach(function (it) { us.push(it.u0, it.u1); });
      us = us.sort(function (a, b) { return a - b; });
      var ut = []; us.forEach(function (u) { if (!ut.length || u - ut[ut.length - 1] >= 2.6 / k) ut.push(u); else if (u === v.L) { ut.pop(); ut.push(u); } });
      if (ut.length < 3) return;
      var smax = Math.max.apply(null, itens.map(function (it) { return it.prof; }));
      var pp = ut.map(function (u) { return M.P(ed.A[0] + ed.r[0] * (u + ed.uMin), ed.A[1] + ed.r[1] * (u + ed.uMin)); }), vals = [];
      for (var i = 0; i + 1 < ut.length; i++) vals.push(d.cotaTxt(ut[i + 1] - ut[i]));
      var ux = pp[pp.length - 1][0] - pp[0][0], uz = pp[pp.length - 1][1] - pp[0][1], Ln = hip(ux, uz) || 1, nx = uz / Ln, nz = -ux / Ln, sg = (nx * -ed.d[0] + nz * -ed.d[1]) > 0 ? 1 : -1;
      var of = sg * (smax * k + S.afastamento1());
      D.cadeia(pp, of, vals, { offs: [of + sg * 4.5, of + sg * 9] });
    });
    /* um marcador de vista por parede, no ambiente, com o ápice para a parede */
    an.vistas.forEach(function (v) {
      var ed = v.ed, us = v.itens.map(function (it) { return (it.u0 + it.u1) / 2; }), umid = us.reduce(function (a, b) { return a + b; }, 0) / us.length;
      var ang = (Math.atan2(ed.d[0], -ed.d[1]) * 180) / Math.PI, achou = null;
      var med = { hu: 7.5 / k, ap: 7.9 / k, tr: 7.2 / k };
      for (var s = 11; s <= 70 && !achou; s += 2) {
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
      S.marcadorVista(D, pm[0], pm[1], v.letra, numPR(v), ang, "A");
    });
    /* cotas internas do ambiente (vão livre), nome e área */
    var semLugar = [], cruza = [];
    d.cotasInternas(D, M, [amb], { moveis: an.moveis.filter(function (m) { return (m.h0 - amb.base) < 1.2; }), semLugar: semLugar, cruza: cruza });
    if (semLugar.length) avisos.push("sem lugar livre para a cota interna de " + semLugar.join(", "));
    var sl = d.rotulosAmbientes(D, M, [amb], { completo: false });
    if (sl.length) avisos.push("sem lugar livre para o rótulo de " + sl.join(", "));
    var yb = M.oy + M.alt + 10;
    d.escalaGrafica(D, A.x + 6, yb + 4, k, k * 5 >= 12 ? 5 : 10);
    d.norte(D, A.x + 82, yb + 2, dados.terreno ? dados.terreno.norte : 0, 6);
    return { escala: "1:" + es.escala, avisos: avisos, M: M };
  }

  /* ------------------------------------------------------------ MONTAR A SÉRIE */
  function nomeFolha(amb) { return txt(amb.nome).toUpperCase(); }
  function tituloVistas(letras) { return letras.length === 1 ? "(VISTA " + letras[0] + ")" : "(" + letras.map(function (l) { return "VISTA " + l; }).join(" E ") + ")"; }
  function empacotar(A, vistas, avisos, nomeAmb) {
    /* escolhe a escala de cada vista (1:25 se couber na largura da folha; senão 1:50) e agrupa em folhas: até 2 por folha, empilhadas ou lado a lado */
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
  function montar(c, cfgInt, geoI, E) {
    var d = DS(), itens = [], avisos = [], sel = cfgInt && arr(cfgInt.ambientes).length ? cfgInt.ambientes.map(String) : null;
    var amis = arr((c.depois || c.dados).ambientes).filter(function (a) { return a && VIVO[a.status]; });
    var escolhidos = amis.filter(function (a) {
      if (sel) return sel.indexOf(String(a.id)) >= 0;
      return arr(c.dados.moveis).some(function (m) { return movelNoAmbiente(m, a) && movelGatilho(m); });
    });
    if (!escolhidos.length) { avisos.push("Caderno de interiores: nenhum ambiente com mobiliário ou marcenaria (ou nenhum escolhido)."); return { itens: itens, avisos: avisos }; }
    var prefixo = txt(cfgInt && cfgInt.prefixo) || "INT", seq = 0, A = geoI.area;
    var cI = {}; Object.keys(c).forEach(function (k) { cI[k] = c[k]; });
    cI.geo = geoI; cI.A = A;
    /* 1ª passada: a análise e a lista de folhas de cada ambiente (os números "PR nn" dos marcadores precisam das folhas das vistas) */
    var planos = escolhidos.map(function (amb) {
      var an = analisar(cI, amb), folhasV = empacotar(A, an.vistas, avisos, nomeFolha(amb)), nF = 1 + folhasV.length, ini = seq;
      seq += nF;
      an.vistas.forEach(function (v) { v._folha = null; });
      folhasV.forEach(function (grupo, gi) { grupo.forEach(function (v) { v._folha = 2 + gi; });   /* o "PR nn" é o NN do carimbo da folha da vista, dentro do ambiente (a planta é 01) */ });
      an.avisos.forEach(function (a) { avisos.push(nomeFolha(amb) + ": " + a); });
      return { amb: amb, an: an, folhasV: folhasV, ini: ini, nF: nF };
    });
    planos.forEach(function (pl) {
      var amb = pl.amb, an = pl.an, nome = nomeFolha(amb);
      /* ---- folha da planta */
      var rot = dois(pl.ini + 1), defP = { id: "int-" + amb.id + "-planta", tipo: "int-planta", pav: amb.pav, titulo: nome + " - MÓVEIS - PLANTA BAIXA", rotulo: rot, numero: prefixo + "-" + rot, carimboFolha: "01/" + dois(pl.nF), ambienteId: amb.id };
      var D = d.novo(E, c.depurar === false ? false : true), cc = {}; Object.keys(cI).forEach(function (k) { cc[k] = cI[k]; }); cc.D = D; cc.def = defP;
      var res = {};
      try { res = desenharPlanta(cc, an, function (v) { return dois(v._folha); }, null); }
      catch (e) { avisos.push(defP.numero + ": " + (e && e.message ? e.message : String(e))); D.texto(A.x + 10, A.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      arr(res.avisos).forEach(function (a) { avisos.push(defP.numero + ": " + a); });
      if (!an.vistas.length && !an.avisos.length) avisos.push(defP.numero + ": " + nome + " não tem móvel nem marcenaria encostada em parede: só a planta de móveis foi gerada.");
      itens.push({ def: defP, D: D, escala: res.escala || "INDICADA", res: res });
      /* ---- folhas das vistas */
      pl.folhasV.forEach(function (grupo, gi) {
        var rotV = dois(pl.ini + 2 + gi), letras = grupo.map(function (v) { return v.letra; });
        var defV = { id: "int-" + amb.id + "-vistas-" + (gi + 1), tipo: "int-vistas", pav: amb.pav, titulo: nome + " " + tituloVistas(letras), rotulo: rotV, numero: prefixo + "-" + rotV, carimboFolha: dois(gi + 2) + "/" + dois(pl.nF), ambienteId: amb.id };
        var Dv = d.novo(E, c.depurar === false ? false : true), cv = {}; Object.keys(cI).forEach(function (k) { cv[k] = cI[k]; }); cv.D = Dv; cv.def = defV;
        var semLug = [], escs = [];
        try {
          var x = A.x + 4, y = A.y + 2;
          grupo.forEach(function (v, vi) {
            var med = v._med, X0 = (grupo.modo === "lado" ? x : A.x + 4) + med.nt.wE + med.cotaW;
            var r = desenharVista(cv, v, X0, y, med, dois(vi + 1)); semLug = semLug.concat(r.semLugar); escs.push("1:" + Math.round(1000 / med.k));
            if (grupo.modo === "lado") x += med.w + 6; else y += med.h + 4;
          });
        } catch (e2) { avisos.push(defV.numero + ": " + (e2 && e2.message ? e2.message : String(e2))); Dv.texto(A.x + 10, A.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
        if (semLug.length) avisos.push(defV.numero + ": sem lugar livre para a nota de material de " + semLug.join(", "));
        itens.push({ def: defV, D: Dv, escala: escs.length && escs.every(function (e) { return e === escs[0]; }) ? escs[0] : escs.join(" / "), res: { vistas: grupo.map(function (v) { return v.letra; }) } });
      });
    });
    return { itens: itens, avisos: avisos };
  }

  var ArqInteriores = { VERSAO: 1, listarAmbientes: listarAmbientes, montar: montar, analisar: analisar, linhasNota: linhasNota, ehMarcenaria: ehMarcenaria, GANCHOS: GANCHOS,
    _int: { arestas: arestas, limpar: limpar, recortarRet: recortarRet, colocarNotas: colocarNotas, medirVista: medirVista, empacotar: empacotar, quebrarNota: quebrarNota, rodapeAltura: rodapeAltura, niveisVerticais: niveisVerticais, niveisHorizontais: niveisHorizontais, desenharVista: desenharVista, desenharPlanta: desenharPlanta } };
  global.ArqInteriores = ArqInteriores;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqInteriores;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

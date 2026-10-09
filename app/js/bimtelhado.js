/* =====================================================================
 * bimtelhado.js — TELHADO e as BORDAS do telhado
 * (calha, rufo, testeira, intradorso), motor PURO (ES5, Node).
 *
 * Fase P3, Frentes A e B do plano do BIM (seções 3.1, 3.7,
 * 3.8, 4/P3 e Anexo B.3). Antes desta fase a cobertura era 1 ou 2 águas por
 * dois cantos (BimEdit.cobertura — continua valendo para as ops antigas):
 * telhado em L, 3 ou 4 águas e água-furtada eram impossíveis, e área
 * inclinada, cumeeira, espigão e rincão saíam errados (item A2 do backlog).
 *
 * O QUE ESTÁ AQUI
 *   · TELHADO POR PERÍMETRO ("Telhado por perímetro"): contorno
 *     QUALQUER (L, T, U, com reentrâncias), INCLINAÇÃO POR ARESTA e o
 *     "Define inclinação" de cada aresta (a aresta que não define vira
 *     oitão/empena), BEIRAL. As águas, os espigões, os rincões e a cumeeira
 *     saem do ESQUELETO RETO PONDERADO do contorno (a regra geométrica do
 *     telhado por perímetro: cada aresta que define inclinação
 *     é um plano que sobe para dentro com a inclinação dela; a aresta que não
 *     define fica parada — o plano vertical do oitão).
 *   · TELHADO POR EXTRUSÃO ("Telhado por extrusão"): um perfil (polilinha)
 *     num plano vertical, extrudado entre dois limites.
 *   · UNIR / DESUNIR ("Unir/desunir telhado"): o telhado A unido ao B perde a
 *     parte que fica DENTRO do B (abaixo da superfície do B, na projeção do
 *     B) — o encontro vira rincão e o comprimento dele é medido.
 *   · BORDAS por aresta (Frente B): calha, rufo, testeira e intradorso
 *     (forro do beiral), com o COMPRIMENTO de verdade (inclinado na empena,
 *     a soma das partes quando a água vizinha dobra a quina) no quantitativo.
 *   · SUPERFÍCIES para a parede "anexar topo" (js/bimarq.js superficies —
 *     gancho "P3"): cada água é um plano limitado pelo polígono dela.
 *
 * A REGRA DO PLANO (escrita, porque é ela que dá o número):
 *   "Deslocamento da base do nível" = a altura do APOIO na LINHA DA PAREDE
 *   (o contorno desenhado), como a cobertura antiga (base = topo da
 *   parede). O plano de cada água passa pela linha da parede nessa altura e
 *   sobe para dentro com a inclinação da aresta (% = 100 · tg θ). O beiral
 *   prolonga o plano para FORA: a borda do beiral fica beiral × inclinação
 *   abaixo do apoio (a mesma conta da cobertura antiga, com o
 *   "Caibro" medido na parede). O plano é a FACE DE BAIXO do telhado; a
 *   espessura do tipo sobe na normal (volume = área inclinada × espessura;
 *   as bordas são cortadas em prumo).
 *   Com inclinações DIFERENTES e beiral, cada aresta começa na sua própria
 *   altura de beiral: a água mais íngreme (mais baixa no beiral) dobra a
 *   quina pela linha do beiral da vizinha até o ponto em que os planos se
 *   encontram — por isso o esqueleto começa com as arestas "paradas" e cada
 *   uma passa a andar na altura do beiral dela (ATIVAÇÃO).
 *
 * O ESQUELETO (esqueleto(), abaixo) — simulação da frente de onda em
 * ALTURA: cada aresta é uma reta n·p = c(h); a aresta que define
 * inclinação anda 1/s por metro de altura (s = inclinação), a que não
 * define fica parada. Vértice = interseção das retas das duas arestas dele
 * (sem velocidade guardada: nada se acumula de erro). Eventos:
 *   · ARESTA: os dois vértices de uma aresta se encontram (ela some);
 *   · DIVISÃO: um vértice REFLEXO encosta numa aresta não vizinha (o
 *     contorno se parte em dois — o L, o T, o U);
 *   · ATIVAÇÃO: uma aresta começa a andar (altura do beiral dela).
 *   Depois de cada evento: duas arestas opostas que se encontraram viram
 *   CUMEEIRA ("espinho" fechado na hora); contorno de área zero termina.
 *   Cada face (água) é o rastro da sua aresta: a base, os caminhos dos
 *   vértices e o que fechou por cima.
 *
 * A OP (validada no BimEdit.sanear — gancho "P3" em js/bimedit.js —, que a
 * guarda mesmo numa tela sem este motor):
 *   {op:"telhado", id, modo?:"perimetro"|"extrusao",
 *    contorno?:[{x, z, d?:false, i?:%}…]   (d e i são da aresta que SAI do ponto),
 *    inclinacao?:% (padrão das arestas), beiral?:m, nivelId?, base?, deslocBase?,
 *    tipoId? | tipoTelhado?:{id, rotulo, camadas:[{rotulo, material, e}]},
 *    unir?: id do outro telhado | null,
 *    perfil?:[{u, y}…], origem?:{x, z}, ang?:graus, inicio?, fim?   (extrusão),
 *    aresta?:k + defineInclinacao?:bool + inclinacaoAresta?:% | null,
 *    inclinacoes?: "30;30;-;30"  (uma por aresta; "-" = não define)}
 *   {op:"borda", id, telhado, tipo:"calha"|"rufo"|"testeira"|"intradorso",
 *    arestas:[k…], largura?, altura?}
 *   mover/apagar/orcar com o id de um telhado ou borda também passam aqui.
 *   Sem lista dentro de lista (a nuvem recusa): ponto {x, z}; aresta = índice.
 *
 * O ESTADO: BimEdit.aplicar devolve `telhados` e `bordas` (só quando há op
 * deles — o estado das ops antigas fica byte a byte igual).
 *
 * Teste: node tools/test-bimtelhado.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function temChave(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function obj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

  /* ------------------------------------------------------------ tipos
     Tipos de telhado do OrçaPRO (nomes da RA, não famílias da Autodesk).
     A espessura É a soma das camadas (tipo composto). O
     genérico de 8 cm é a espessura que a cobertura antiga sempre usou. */
  var TIPOS = [
    { id: "generico-8", rotulo: "Telhado genérico 8 cm", camadas: [{ rotulo: "Telhamento", material: "Telha cerâmica", e: 0.08 }] },
    { id: "fibrocimento-6", rotulo: "Telha de fibrocimento 6 mm", camadas: [{ rotulo: "Telha de fibrocimento", material: "Fibrocimento", e: 0.006 }] },
    { id: "termoacustica-30", rotulo: "Telha termoacústica 30 mm", camadas: [{ rotulo: "Telha termoacústica", material: "Aço e EPS", e: 0.03 }] }
  ];
  /* as MESMAS travas da cobertura antiga (BimModelar.LIM e js/bimparam.js FAIXA):
     inclinação 1 a 300 %, beiral 0 a 3 m */
  var LIM = { inclinacao: [1, 300], beiral: [0, 3], desloc: [-200, 200], vertices: 200, camada: 0.5, espessura: 0.5, camadas: 12, perfil: 100 };
  var INCL_PADRAO = 30;
  /* BORDAS (Frente B). `ifc`/`pre`: a classe de cada uma no IFC de saída,
     a do mapeamento de camadas IFC (exportlayers-ifc-IAI.txt, linhas
     "Telhados  Calhas / Bordas / Intradorsos de telhado"). O rufo é o
     perfil de chapa da borda. Perfil padrão
     é só o desenho e o ponto de partida — o engenheiro troca. */
  var BORDAS = {
    calha: { rotulo: "Calha", revit: "Calhas", ifc: "IFCPIPESEGMENT", pre: "GUTTER", largura: 0.15, altura: 0.10, onde: "beiral" },
    rufo: { rotulo: "Rufo", revit: "Bordas", ifc: "IFCCOVERING", pre: "MOLDING", largura: 0.10, altura: 0.05, onde: "qualquer" },
    testeira: { rotulo: "Testeira", revit: "Bordas", ifc: "IFCCOVERING", pre: "MOLDING", largura: 0.025, altura: 0.20, onde: "qualquer" },
    intradorso: { rotulo: "Intradorso (forro do beiral)", revit: "Intradorsos de telhado", ifc: "IFCCOVERING", pre: "CLADDING", largura: 0.01, altura: 0.01, onde: "beiral" }
  };
  var TOL = 1e-9;

  /* ------------------------------------------------- tipos de telhado */
  function normTipo(t) {
    if (!obj(t)) return null;
    var cam = arr(t.camadas).filter(function (k) { return k && fin(Number(k.e)) && Number(k.e) > 0 && Number(k.e) <= LIM.camada; }).slice(0, LIM.camadas)
      .map(function (k) { return { rotulo: txt(k.rotulo).slice(0, 80) || "Camada", material: txt(k.material).slice(0, 80), e: r6(Number(k.e)) }; });
    if (!cam.length) return null;
    var esp = cam.reduce(function (s, k) { return s + k.e; }, 0);
    if (!(esp > 0 && esp <= LIM.espessura)) return null;
    return { id: txt(t.id).slice(0, 60) || "custom", rotulo: txt(t.rotulo).slice(0, 80) || "Telhado", camadas: cam, espessura: r6(esp) };
  }
  function tipoCatalogo(id) {
    for (var i = 0; i < TIPOS.length; i++) if (TIPOS[i].id === String(id)) return normTipo(TIPOS[i]);
    return null;
  }

  /* ---------------------------------------------- geometria plana ([x, z]) */
  function pt(p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : (p ? [Number(p.x), Number(p.z)] : [NaN, NaN]); }
  function areaSinal(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function cruz(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function comp(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function dist(a, b) { return comp(sub(a, b)); }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return dist(p, [a[0] + t * dx, a[1] + t * dz]);
  }
  /* dentro do polígono; na borda conta como dentro */
  function dentro(p, P) {
    var x = p[0], z = p[1], d = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (distSeg(p, a, b) < 1e-7) return true;
      if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) d = !d;
    }
    return d;
  }
  function segmentosCruzam(p1, q1, p2, q2) {
    function lado(p, q, r) { var v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return Math.abs(v) < 1e-12 ? 0 : (v > 0 ? 1 : -1); }
    function noSeg(p, q, r) { return Math.min(p[0], r[0]) - 1e-12 <= q[0] && q[0] <= Math.max(p[0], r[0]) + 1e-12 && Math.min(p[1], r[1]) - 1e-12 <= q[1] && q[1] <= Math.max(p[1], r[1]) + 1e-12; }
    var o1 = lado(p1, q1, p2), o2 = lado(p1, q1, q2), o3 = lado(p2, q2, p1), o4 = lado(p2, q2, q1);
    if (o1 !== o2 && o3 !== o4 && o1 * o2 <= 0 && o3 * o4 <= 0 && (o1 || o2) && (o3 || o4)) return true;
    if (o1 === 0 && noSeg(p1, p2, q1)) return true; if (o2 === 0 && noSeg(p1, q2, q1)) return true;
    if (o3 === 0 && noSeg(p2, p1, q2)) return true; if (o4 === 0 && noSeg(p2, q1, q2)) return true;
    return false;
  }
  function autointersecta(P) {
    var n = P.length;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentosCruzam(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true;
    }
    return false;
  }
  /* tira ponto repetido e o vértice COLINEAR com os vizinhos (seguindo ou
     voltando — a "agulha" que a face ganha quando a água vizinha dobra a quina
     pela linha do beiral). A área com sinal não muda. */
  function limpar(P) {
    var out = [];
    P.forEach(function (q) { var u = out[out.length - 1]; if (!u || dist(u, q) > 1e-7) out.push(q); });
    if (out.length > 1 && dist(out[0], out[out.length - 1]) <= 1e-7) out.pop();
    var mudou = true;
    while (mudou && out.length > 2) {
      mudou = false;
      for (var i = 0; i < out.length; i++) {
        var a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
        var u = sub(b, a), v = sub(c, b), lu = comp(u), lv = comp(v);
        if (lu < 1e-7 || lv < 1e-7 || Math.abs(cruz(u, v)) < 1e-9 * Math.max(1, lu * lv) * 10) { out.splice(i, 1); mudou = true; break; }
      }
    }
    return out.length >= 3 ? out : [];
  }

  /* ================================================== CONTORNO + ARESTAS
   * O contorno da op (pontos {x, z, d, i}) → polígono anti-horário com os
   * atributos POR ARESTA (a aresta k vai do ponto k ao k+1 e leva o d/i do
   * ponto k). `orig` = o índice da aresta na op (a borda e a Propriedade
   * falam dele). Ponto repetido sai; vértice no meio de uma reta sai quando
   * as duas arestas são iguais (senão é recusado: não é possível ter
   * duas inclinações na mesma reta sem um vértice que as separe). */
  function inclinacoesTexto(s) {
    /* "30;30;-;30" → [{d,i}] (vírgula decimal aceita) */
    return txt(s).split(/[;|]/).map(function (t) {
      var x = t.trim();
      if (x === "" || x === "*") return null;
      if (/^(-|—|n|não|nao|x)$/i.test(x)) return { d: false };
      var v = Number(x.replace("%", "").replace(",", "."));
      return isFinite(v) ? { d: true, i: v } : null;
    });
  }
  function prepararContorno(contorno, inclPadrao) {
    var lst = arr(contorno).map(function (q, k) {
      var p = pt(q), d = !(q && q.d === false), i = q && fin(Number(q.i)) && q.i !== null ? Number(q.i) : inclPadrao;
      return { p: p, d: d, i: i, orig: k };
    });
    if (lst.length < 3) return { ok: false, motivo: "O contorno do telhado precisa de pelo menos 3 pontos." };
    if (lst.length > LIM.vertices) return { ok: false, motivo: "Contorno com pontos demais (máximo " + LIM.vertices + ")." };
    if (lst.some(function (q) { return !fin(q.p[0]) || !fin(q.p[1]); })) return { ok: false, motivo: "Ponto inválido no contorno." };
    if (lst.some(function (q) { return q.d && !(q.i >= LIM.inclinacao[0] && q.i <= LIM.inclinacao[1]); })) return { ok: false, motivo: "Inclinação fora da faixa (" + LIM.inclinacao[0] + " a " + LIM.inclinacao[1] + " %)." };
    /* ponto repetido: a aresta que sai dele (a que tem comprimento) fica com os atributos */
    var out = [];
    lst.forEach(function (q) { var u = out[out.length - 1]; if (u && dist(u.p, q.p) < 1e-3) { u.d = q.d; u.i = q.i; u.orig = q.orig; } else out.push(q); });
    /* o último repetindo o primeiro: a aresta de volta tem comprimento zero e sai */
    while (out.length > 1 && dist(out[0].p, out[out.length - 1].p) < 1e-3) out.pop();
    /* vértice colinear */
    var mudou = true;
    while (mudou && out.length > 3) {
      mudou = false;
      for (var j = 0; j < out.length; j++) {
        var a = out[(j + out.length - 1) % out.length], b = out[j], c = out[(j + 1) % out.length];
        var u = sub(b.p, a.p), v = sub(c.p, b.p);
        if (Math.abs(cruz(u, v)) > 1e-9 * comp(u) * comp(v)) continue;
        if (dot(u, v) < 0) return { ok: false, motivo: "O contorno volta sobre si mesmo." };
        if (a.d !== b.d || (a.d && Math.abs(a.i - b.i) > 1e-9)) return { ok: false, motivo: "Duas arestas na mesma reta com inclinações diferentes: separe-as com um canto ou iguale a inclinação." };
        out.splice(j, 1); mudou = true; break;
      }
    }
    if (out.length < 3) return { ok: false, motivo: "O contorno do telhado precisa de pelo menos 3 pontos." };
    var P = out.map(function (q) { return q.p; });
    if (autointersecta(P)) return { ok: false, motivo: "O contorno do telhado se cruza." };
    var A = areaSinal(P);
    if (Math.abs(A) < 0.05) return { ok: false, motivo: "Contorno pequeno demais para um telhado." };
    if (A < 0) {
      /* sentido horário → anti-horário; a aresta k nova é a (n−2−k) antiga, ao contrário */
      var n = out.length, rev = [];
      for (var k = 0; k < n; k++) { var velho = out[(n - 2 - k + 2 * n) % n]; rev.push({ p: out[n - 1 - k].p, d: velho.d, i: velho.i, orig: velho.orig }); }
      out = rev;
    }
    return { ok: true, pts: out.map(function (q) { return q.p; }), arestas: out.map(function (q) { return { d: q.d, i: q.i, orig: q.orig }; }) };
  }
  /* desloca cada aresta para FORA (polígono anti-horário: o lado de dentro é a
     esquerda), com esquadria nos cantos. null se o deslocamento inverte uma
     aresta (beiral maior que a aresta permite). */
  function deslocar(P, ds) {
    var n = P.length, L = [];
    for (var k = 0; k < n; k++) {
      var a = P[k], b = P[(k + 1) % n], d = sub(b, a), l = comp(d); d = [d[0] / l, d[1] / l];
      var nn = [-d[1], d[0]];
      L.push({ n: nn, c: dot(nn, a) - ds[k], d: d });
    }
    var Q = [];
    for (var j = 0; j < n; j++) {
      var A = L[(j + n - 1) % n], B = L[j], det = A.n[0] * B.n[1] - A.n[1] * B.n[0];
      if (Math.abs(det) < 1e-12) return null;
      Q.push([(A.c * B.n[1] - A.n[1] * B.c) / det, (A.n[0] * B.c - A.c * B.n[0]) / det]);
    }
    for (var m = 0; m < n; m++) if (dot(sub(Q[(m + 1) % n], Q[m]), L[m].d) <= 1e-6) return null;
    if (autointersecta(Q)) return null;
    return Q;
  }

  /* ============================================================ ESQUELETO
   * P = polígono do BEIRAL (anti-horário). ar[k] = { d (define), s
   * (inclinação, tg θ), ha (altura em que a aresta começa a andar = a do
   * beiral dela) }. Devolve { ok, faces: [segmentos 3D por aresta], h0,
   * linhas, avisos }. Altura = y. */
  function esqueleto(P, ar) {
    var n = P.length, linhas = [], avisos = [];
    for (var k = 0; k < n; k++) {
      var a = P[k], b = P[(k + 1) % n], d = sub(b, a), l = comp(d); d = [d[0] / l, d[1] / l];
      var nn = [-d[1], d[0]];
      linhas.push({ n: nn, d: d, c0: dot(nn, a), v: ar[k].d ? 1 / ar[k].s : 0, ha: ar[k].d ? ar[k].ha : Infinity });
    }
    var hs = linhas.filter(function (L) { return L.v > 0; }).map(function (L) { return L.ha; });
    if (!hs.length) return { ok: false, plano: true };
    var h0 = Math.min.apply(null, hs);
    /* nenhuma água sobe mais que o maior vão vezes a maior inclinação: evento acima disso é ruído numérico */
    var diam = 0; P.forEach(function (a) { P.forEach(function (b) { diam = Math.max(diam, dist(a, b)); }); });
    var hMax = Math.max.apply(null, hs) + diam * Math.max.apply(null, ar.map(function (x) { return x.d ? x.s : 0; })) + 1;
    var quebras = hs.filter(function (h) { return h > h0 + 1e-12; }).sort(function (x, y) { return x - y; }).filter(function (h, i, l) { return i === 0 || h - l[i - 1] > 1e-12; });
    function cAt(k, h) { var L = linhas[k]; return L.c0 + (L.v > 0 && h > L.ha ? L.v * (h - L.ha) : 0); }
    function posL(Li, Ri, h) {
      var A = linhas[Li].n, B = linhas[Ri].n, det = A[0] * B[1] - A[1] * B[0], cA = cAt(Li, h), cB = cAt(Ri, h);
      if (Math.abs(det) > 1e-10) return [(cA * B[1] - A[1] * cB) / det, (A[0] * cB - cA * B[0]) / det];
      return null;
    }
    function pos(v, h) {
      if (h <= v.h0 + 1e-12) return v.p0;
      var p = posL(v.L, v.R, h); if (p) return p;
      var A = linhas[v.L], B = linhas[v.R];
      if (dot(A.n, B.n) > 0) { var dc = cAt(v.L, h) - cAt(v.L, v.h0); return [v.p0[0] + A.n[0] * dc, v.p0[1] + A.n[1] * dc]; }
      return null;
    }
    var segs = [], nId = 0;
    for (var q0 = 0; q0 < n; q0++) segs.push([]);
    function P3(p, h) { return { x: p[0], y: h, z: p[1] }; }
    function seg(k, a, ha, b, hb) { if (dist(a, b) < 1e-9 && Math.abs(ha - hb) < 1e-9) return; segs[k].push([P3(a, ha), P3(b, hb)]); }
    function emit(v, h, p) { if (!p) return; seg(v.L, v.p0, v.h0, p, h); if (v.R !== v.L) seg(v.R, v.p0, v.h0, p, h); }
    function vert(L, R, p, h) { return { id: ++nId, L: L, R: R, p0: p, h0: h }; }
    for (var k2 = 0; k2 < n; k2++) seg(k2, P[k2], h0, P[(k2 + 1) % n], h0);
    var lav0 = [];
    for (var j = 0; j < n; j++) lav0.push(vert((j + n - 1) % n, j, P[j], h0));
    var lavs = [lav0], h = h0;
    function reflexo(v) { return cruz(linhas[v.L].d, linhas[v.R].d) < -1e-12; }
    function pecas(hIni) {
      var out = [], ini = hIni;
      quebras.forEach(function (b) { if (b > ini + 1e-12) { out.push([ini, b]); ini = b; } });
      out.push([ini, Infinity]);
      return out;
    }
    function tAresta(a, b, E, hn) {
      var dE = linhas[E].d;
      function Lf(t) { var pa = pos(a, t), pb = pos(b, t); return pa && pb ? dot(sub(pb, pa), dE) : null; }
      var ps = pecas(hn);
      for (var i = 0; i < ps.length; i++) {
        var hs0 = ps[i][0], he = ps[i][1], t1 = he === Infinity ? hs0 + 1 : he;
        var l0 = Lf(hs0), l1 = Lf(t1); if (l0 == null || l1 == null) return null;
        var sl = (l1 - l0) / (t1 - hs0);
        if (l0 <= 1e-9) { if (sl <= 1e-12) return hs0; continue; }
        if (sl < -1e-9) { var t = hs0 - l0 / sl; if (t <= he + 1e-12 && t <= hMax) return Math.max(t, hs0); }
      }
      return null;
    }
    function tDivisao(r, u, v, E, hn) {
      var LE = linhas[E];
      function f(t) { var q = pos(r, t); return q ? dot(LE.n, q) - cAt(E, t) : null; }
      var ps = pecas(hn);
      for (var i = 0; i < ps.length; i++) {
        var hs0 = ps[i][0], he = ps[i][1], t1 = he === Infinity ? hs0 + 1 : he;
        var f0 = f(hs0), f1 = f(t1); if (f0 == null || f1 == null) return null;
        if (f0 < -1e-9) return null;
        var t;
        if (f0 <= 1e-9) t = hs0;
        else { var sl = (f1 - f0) / (t1 - hs0); if (sl >= -1e-9) continue; t = hs0 - f0 / sl; if (t > he + 1e-12 || t > hMax) continue; }
        var pu = pos(u, t), pv = pos(v, t), q = pos(r, t); if (!pu || !pv || !q) return null;
        var den = dot(sub(pv, pu), LE.d); if (den < 1e-9) return null;
        var s = dot(sub(q, pu), LE.d) / den;
        return s >= -1e-7 && s <= 1 + 1e-7 ? t : null;
      }
      return null;
    }
    function agora(v, hh) { return pos(v, hh); }
    /* fecha, depois de cada evento: espinho (cumeeira), vértice redundante e
       contorno de área zero. Devolve os contornos que continuam. */
    function normalizar(lav, hh) {
      for (var guarda = 0; guarda < 4 * n + 20; guarda++) {
        if (lav.length <= 2) {
          if (lav.length === 2) {
            var u = lav[0], w = lav[1], pu = agora(u, hh), pw = agora(w, hh);
            if (pu && pw) { seg(u.R, pu, hh, pw, hh); if (w.R !== u.R) seg(w.R, pw, hh, pu, hh); }
            emit(u, hh, pu); emit(w, hh, pw);
          } else if (lav.length === 1) emit(lav[0], hh, agora(lav[0], hh));
          return [];
        }
        var mexeu = false;
        for (var i = 0; i < lav.length && !mexeu; i++) {
          var m = lav[i], dL = linhas[m.L].d, dR = linhas[m.R].d;
          if (m.L === m.R) {
            /* vértice no meio de uma aresta só (sobrou do fechamento): sai */
            emit(m, hh, agora(m, hh)); lav.splice(i, 1); mexeu = true; break;
          }
          if (dot(dL, dR) > 1 - 1e-9) {
            /* duas arestas NA MESMA RETA e no mesmo sentido (a frente de uma água
               alcançou a reta de um oitão, ou de uma água mais lenta): com a
               mesma velocidade são coplanares e seguem (o vértice anda na
               normal); com velocidades diferentes, a mais LENTA fica para trás
               — some inteira, e o trecho dela fecha as duas faces. Sem isto, a
               ala de um L com oitão ficava descoberta (fuzz de 09/10/2026). */
            var vL = linhas[m.L].v > 0 && hh >= linhas[m.L].ha - 1e-12 ? linhas[m.L].v : 0, vR = linhas[m.R].v > 0 && hh >= linhas[m.R].ha - 1e-12 ? linhas[m.R].v : 0;
            if (Math.abs(vL - vR) < 1e-12) continue;
            var nl0 = lav.length, pm0 = agora(m, hh);
            if (vL > vR) {
              var W0 = lav[(i + 1) % nl0], pw0 = agora(W0, hh);
              if (!pm0 || !pw0) { avisos.push("aresta alcançada sem posição"); return []; }
              seg(m.R, pm0, hh, pw0, hh); seg(m.L, pm0, hh, pw0, hh);
              emit(m, hh, pm0); emit(W0, hh, pw0);
              var nW = vert(m.L, W0.R, pw0, hh);
              lav[(i + 1) % nl0] = nW; lav.splice(i, 1);
            } else {
              var U0 = lav[(i + nl0 - 1) % nl0], pu0 = agora(U0, hh);
              if (!pm0 || !pu0) { avisos.push("aresta alcançada sem posição"); return []; }
              seg(m.L, pu0, hh, pm0, hh); seg(m.R, pu0, hh, pm0, hh);
              emit(m, hh, pm0); emit(U0, hh, pu0);
              var nU = vert(U0.L, m.R, pu0, hh);
              lav[(i + nl0 - 1) % nl0] = nU; lav.splice(i, 1);
            }
            mexeu = true; break;
          }
          if (dot(dL, dR) > -1 + 1e-9) continue;
          /* ESPINHO: as duas arestas do vértice são opostas e se encostaram —
             o trecho em comum vira cumeeira das duas águas */
          var nl = lav.length, ui = (i + nl - 1) % nl, wi = (i + 1) % nl, U = lav[ui], W = lav[wi];
          var pm = m.p0, pU = agora(U, hh), pW = agora(W, hh);
          if (!pU || !pW) { avisos.push("cumeeira sem posição (vértice degenerado)"); return []; }
          var du = dist(pm, pU), dw = dist(pm, pW);
          emit(m, hh, pm);
          if (Math.abs(du - dw) < 1e-7) {
            seg(m.L, pm, hh, pU, hh); seg(m.R, pm, hh, pU, hh);
            emit(U, hh, pU); emit(W, hh, pU);
            var z = vert(U.L, W.R, pU, hh);
            if (nl === 3) { emit(z, hh, pU); return []; }
            var rest = [];
            for (var q = 1; q <= nl - 3; q++) rest.push(lav[(wi + q) % nl]);
            lav = [z].concat(rest);
          } else if (du < dw) {
            seg(m.L, pm, hh, pU, hh); seg(m.R, pm, hh, pU, hh);
            emit(U, hh, pU);
            var z2 = vert(U.L, m.R, pU, hh), r2 = [];
            for (var q2 = 1; q2 <= nl - 2; q2++) r2.push(lav[(i + q2) % nl]);
            lav = [z2].concat(r2);
          } else {
            seg(m.L, pm, hh, pW, hh); seg(m.R, pm, hh, pW, hh);
            emit(W, hh, pW);
            var z3 = vert(m.L, W.R, pW, hh), r3 = [];
            for (var q3 = 2; q3 <= nl - 1; q3++) r3.push(lav[(i + q3) % nl]);
            lav = r3.concat([z3]);
          }
          mexeu = true;
        }
        if (mexeu) continue;
        /* área zero: tudo fechou junto (o retângulo de 4 águas, o L de alas iguais) */
        var Q = lav.map(function (v) { return agora(v, hh); });
        if (Q.some(function (q) { return !q; })) { avisos.push("contorno degenerado"); return []; }
        var per = 0; for (var e = 0; e < Q.length; e++) per += dist(Q[e], Q[(e + 1) % Q.length]);
        if (Math.abs(areaSinal(Q)) < 1e-7 * Math.max(1, per)) {
          for (var f = 0; f < lav.length; f++) { emit(lav[f], hh, Q[f]); seg(lav[f].R, Q[f], hh, Q[(f + 1) % Q.length], hh); }
          return [];
        }
        return [lav];
      }
      avisos.push("o fechamento não convergiu");
      return [];
    }
    lavs = normalizar(lav0, h0);
    var iter = 0, LIMITE = 60 * n + 200;
    while (lavs.length && iter++ < LIMITE) {
      var melhor = null;
      lavs.forEach(function (lav, li) {
        var nl = lav.length;
        for (var i = 0; i < nl; i++) {
          var a = lav[i], b = lav[(i + 1) % nl], t = tAresta(a, b, a.R, h);
          if (t != null && (!melhor || t < melhor.t - 1e-10 || (Math.abs(t - melhor.t) <= 1e-10 && melhor.tipo === "div"))) melhor = { tipo: "aresta", li: li, i: i, t: t };
        }
        for (var r = 0; r < nl; r++) {
          var rv = lav[r]; if (!reflexo(rv)) continue;
          for (var j2 = 0; j2 < nl; j2++) {
            var u = lav[j2], v = lav[(j2 + 1) % nl], E = u.R;
            if (u === rv || v === rv || E === rv.L || E === rv.R) continue;
            var t2 = tDivisao(rv, u, v, E, h);
            if (t2 != null && (!melhor || t2 < melhor.t - 1e-10)) melhor = { tipo: "div", li: li, r: r, j: j2, t: t2 };
          }
        }
      });
      var prox = null; for (var qb = 0; qb < quebras.length; qb++) if (quebras[qb] > h + 1e-12) { prox = quebras[qb]; break; }
      if (prox != null && (!melhor || prox < melhor.t - 1e-12)) {
        /* ATIVAÇÃO: as arestas desta altura começam a andar — o caminho dos vértices dobra aqui */
        lavs.forEach(function (lav) { lav.forEach(function (v) {
          if (Math.abs(linhas[v.L].ha - prox) < 1e-12 || Math.abs(linhas[v.R].ha - prox) < 1e-12) { var q = pos(v, prox); if (q) { emit(v, prox, q); v.p0 = q; v.h0 = prox; } }
        }); });
        h = prox; continue;
      }
      if (!melhor) break;
      h = Math.max(h, melhor.t);
      var lavE = lavs[melhor.li], novos = [];
      if (melhor.tipo === "aresta") {
        var nl2 = lavE.length, a2 = lavE[melhor.i], b2 = lavE[(melhor.i + 1) % nl2];
        var pa = pos(a2, h), pb = pos(b2, h), p = pa && pb ? [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2] : (pa || pb);
        emit(a2, h, p); emit(b2, h, p);
        var mm = vert(a2.L, b2.R, p, h), nova = [];
        for (var q4 = 0; q4 < nl2; q4++) { var x = lavE[q4]; if (x === a2) nova.push(mm); else if (x !== b2) nova.push(x); }
        novos = normalizar(nova, h);
      } else {
        var nl3 = lavE.length, rv2 = lavE[melhor.r], u2 = lavE[melhor.j], E2 = u2.R;
        var qd = pos(rv2, h);
        emit(rv2, h, qd);
        var x1 = vert(rv2.L, E2, qd, h), x2 = vert(E2, rv2.R, qd, h), l1 = [x1], l2 = [x2];
        for (var s1 = (melhor.j + 1) % nl3; s1 !== melhor.r; s1 = (s1 + 1) % nl3) l1.push(lavE[s1]);
        for (var s2 = (melhor.r + 1) % nl3; s2 !== (melhor.j + 1) % nl3; s2 = (s2 + 1) % nl3) l2.push(lavE[s2]);
        novos = normalizar(l1, h).concat(normalizar(l2, h));
      }
      lavs.splice.apply(lavs, [melhor.li, 1].concat(novos));
    }
    var ok = !lavs.length;
    if (!ok) avisos.push(iter >= LIMITE ? "o cálculo das águas não terminou (contorno complicado demais)" : "as águas não fecham: confira as arestas que definem inclinação (uma região ficou sem plano)");
    return { ok: ok, segs: segs, h0: h0, linhas: linhas, avisos: avisos };
  }

  /* encadeia os segmentos 3D de UMA face num polígono (começa na base da
     aresta, de P[k] a P[k+1]); null se não fecha */
  function encadear(lista, ini, fim) {
    var pts = [], adj = [];
    function idx(p) {
      for (var i = 0; i < pts.length; i++) { var q = pts[i]; if (Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6 && Math.abs(q.z - p.z) < 1e-6) return i; }
      pts.push(p); adj.push([]); return pts.length - 1;
    }
    var S = [];
    lista.forEach(function (s) { var a = idx(s[0]), b = idx(s[1]); if (a !== b) { S.push([a, b]); adj[a].push(S.length - 1); adj[b].push(S.length - 1); } });
    var ia = idx(ini), ib = idx(fim), usado = {}, caminho = [ia];
    var base = -1; for (var k = 0; k < S.length; k++) if ((S[k][0] === ia && S[k][1] === ib) || (S[k][0] === ib && S[k][1] === ia)) { base = k; break; }
    if (base < 0) return null;
    usado[base] = 1; var atual = ib;
    for (var g = 0; g < S.length + 2; g++) {
      if (atual === ia) break;
      caminho.push(atual);
      var cand = adj[atual].filter(function (si) { return !usado[si]; });
      if (!cand.length) return null;
      var si = cand[0]; usado[si] = 1;
      atual = S[si][0] === atual ? S[si][1] : S[si][0];
    }
    if (atual !== ia) return null;
    return caminho.map(function (i) { return pts[i]; });
  }

  /* ====================================== recorte (unir) — polígonos planos */
  /* Sutherland–Hodgman contra um semiplano a·x + b·z + c ≥ 0 (o polígono
     pode ser côncavo: a área do resultado é exata) */
  function cortarSemiplano(P, a, b, c) {
    var out = [];
    for (var i = 0; i < P.length; i++) {
      var A = P[i], B = P[(i + 1) % P.length], fa = a * A[0] + b * A[1] + c, fb = a * B[0] + b * B[1] + c;
      if (fa >= 0) out.push(A);
      if ((fa >= 0) !== (fb >= 0)) { var t = fa / (fa - fb); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
    }
    return out.length >= 3 ? out : [];
  }
  /* orelhas (polígono simples anti-horário) → triângulos */
  function triangular(P0) {
    var P = P0.slice(); if (areaSinal(P) < 0) P.reverse();
    var tris = [], guarda = 0;
    while (P.length > 3 && guarda++ < 5000) {
      var achou = false;
      for (var i = 0; i < P.length; i++) {
        var a = P[(i + P.length - 1) % P.length], b = P[i], c = P[(i + 1) % P.length];
        if (cruz(sub(b, a), sub(c, b)) <= 1e-12) continue;
        var vazio = true;
        for (var j = 0; j < P.length; j++) {
          var q = P[j]; if (q === a || q === b || q === c) continue;
          if (cruz(sub(b, a), sub(q, a)) > 1e-12 && cruz(sub(c, b), sub(q, b)) > 1e-12 && cruz(sub(a, c), sub(q, c)) > 1e-12) { vazio = false; break; }
        }
        if (!vazio) continue;
        tris.push([a, b, c]); P.splice(i, 1); achou = true; break;
      }
      if (!achou) break;
    }
    if (P.length === 3 && Math.abs(areaSinal(P)) > 1e-12) tris.push(P);
    return tris;
  }
  /* P − K (K convexo anti-horário): as fatias fora de cada aresta de K */
  function menosConvexo(P, K) {
    var out = [], resto = P;
    for (var i = 0; i < K.length && resto.length; i++) {
      var A = K[i], B = K[(i + 1) % K.length], d = sub(B, A), a = -d[1], b = d[0], c = -(a * A[0] + b * A[1]);
      var fora = cortarSemiplano(resto, -a, -b, -c);
      if (fora.length && Math.abs(areaSinal(fora)) > 1e-10) out.push(fora);
      resto = cortarSemiplano(resto, a, b, c);
    }
    return out;
  }

  /* =========================================================== CALCULAR */
  function mapaNiveis(niveis) {
    var m = {};
    arr(niveis).forEach(function (q) { if (q && q.id != null && q.elevacao != null && q.elevacao !== "" && fin(Number(q.elevacao))) m[String(q.id)] = Number(q.elevacao); });
    return m;
  }
  function tipoDe(t) { return normTipo(t.tipoTelhado) || tipoCatalogo(t.tipoId) || normTipo(TIPOS[0]); }
  /* plano y = a + bx·x + bz·z */
  function planoAresta(L, s, ha) { return { a: ha - s * L.c0, bx: s * L.n[0], bz: s * L.n[1], s: s }; }
  function yPlano(pl, x, z) { return pl.a + pl.bx * x + pl.bz * z; }

  function aguaDe(k, pl, pecas, s) {
    var aP = 0; pecas.forEach(function (Q) { aP += Math.abs(areaSinal(Q)); });
    var fat = Math.sqrt(1 + s * s);
    return { aresta: k, plano: pl, inclinacao: r6(s * 100), fator: fat,
             pecas: pecas.map(function (Q) { return { pts: Q.map(function (q) { return { x: r6(q[0]), y: r6(yPlano(pl, q[0], q[1])), z: r6(q[1]) }; }) }; }),
             areaProjecao: aP, area: aP * fat };
  }

  /* as LINHAS do telhado entre águas: cumeeira (horizontal, convexa),
     espigão (inclinada, convexa) e rincão (côncava) — pela geometria das
     faces, peça a peça (Cumeeira/Espigão/Rincão da tabela) */
  function linhasDoTelhado(aguas) {
    var out = { cumeeira: 0, espigao: 0, rincao: 0, itens: [] };
    var F = [];
    aguas.forEach(function (ag, ia) { ag.pecas.forEach(function (pc) { F.push({ ia: ia, pl: ag.plano, P: pc.pts.map(function (q) { return [q.x, q.z]; }) }); }); });
    for (var i = 0; i < F.length; i++) for (var j = i + 1; j < F.length; j++) {
      if (F[i].ia === F[j].ia) continue;
      var A = F[i], B = F[j];
      for (var a = 0; a < A.P.length; a++) {
        var p0 = A.P[a], p1 = A.P[(a + 1) % A.P.length], d = sub(p1, p0), L = comp(d); if (L < 1e-7) continue;
        var u = [d[0] / L, d[1] / L], nrm = [-u[1], u[0]];
        for (var b = 0; b < B.P.length; b++) {
          var q0 = B.P[b], q1 = B.P[(b + 1) % B.P.length];
          if (Math.abs(dot(sub(q0, p0), nrm)) > 1e-6 || Math.abs(dot(sub(q1, p0), nrm)) > 1e-6) continue;
          var t0 = Math.max(0, Math.min(dot(sub(q0, p0), u), dot(sub(q1, p0), u))), t1 = Math.min(L, Math.max(dot(sub(q0, p0), u), dot(sub(q1, p0), u)));
          if (t1 - t0 < 1e-6) continue;
          var e0 = [p0[0] + u[0] * t0, p0[1] + u[1] * t0], e1 = [p0[0] + u[0] * t1, p0[1] + u[1] * t1];
          var y0 = yPlano(A.pl, e0[0], e0[1]), y1 = yPlano(A.pl, e1[0], e1[1]);
          var mid = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2], eps = 1e-4, lado = dentro([mid[0] + nrm[0] * eps, mid[1] + nrm[1] * eps], A.P) ? 1 : -1;
          var qq = [mid[0] + lado * nrm[0] * eps * 10, mid[1] + lado * nrm[1] * eps * 10];
          var dA = yPlano(A.pl, qq[0], qq[1]), dB = yPlano(B.pl, qq[0], qq[1]);
          if (Math.abs(dA - dB) < 1e-10) continue;   /* duas águas no mesmo plano: não é linha */
          var L3 = Math.sqrt((t1 - t0) * (t1 - t0) + (y1 - y0) * (y1 - y0));
          var tipo = dA < dB ? (Math.abs(y1 - y0) < 1e-6 ? "cumeeira" : "espigao") : "rincao";
          out[tipo] += L3;
          out.itens.push({ tipo: tipo, a: { x: r6(e0[0]), y: r6(y0), z: r6(e0[1]) }, b: { x: r6(e1[0]), y: r6(y1), z: r6(e1[1]) }, comprimento: r6(L3), aguas: [A.ia, B.ia] });
        }
      }
    }
    return out;
  }
  /* o que fica SOBRE cada aresta do beiral (o contorno do telhado visto de
     fora): beiral (horizontal) na aresta que define; empena (inclinada) na
     que não define — o comprimento das bordas sai daqui */
  function contornoPorAresta(aguas, Pb) {
    var n = Pb.length, out = [];
    for (var k = 0; k < n; k++) out.push({ segs: [], comprimento: 0, comprimentoPlanta: 0 });
    aguas.forEach(function (ag) {
      ag.pecas.forEach(function (pc) {
        var Q = pc.pts;
        for (var i = 0; i < Q.length; i++) {
          var a = Q[i], b = Q[(i + 1) % Q.length], A = [a.x, a.z], B = [b.x, b.z];
          if (dist(A, B) < 1e-7) continue;
          for (var k = 0; k < n; k++) {
            var C0 = Pb[k], C1 = Pb[(k + 1) % n];
            if (distSeg(A, C0, C1) < 1e-6 && distSeg(B, C0, C1) < 1e-6) {
              var L = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2) + Math.pow(b.z - a.z, 2));
              out[k].segs.push({ a: a, b: b }); out[k].comprimento += L; out[k].comprimentoPlanta += dist(A, B);
              break;
            }
          }
        }
      });
    });
    return out;
  }

  /* o telhado POR PERÍMETRO derivado da fonte */
  function calcularPerimetro(f, H0, avisos) {
    var inclP = fin(Number(f.inclinacao)) && f.inclinacao !== null ? Number(f.inclinacao) : INCL_PADRAO;
    var cont = arr(f.contorno).map(function (q) { return { x: q.x, z: q.z, d: q.d, i: q.i }; });
    var lis = f.inclinacoes != null ? inclinacoesTexto(f.inclinacoes) : [];
    lis.forEach(function (e, k) { if (!e || !cont[k]) return; cont[k].d = e.d !== false; if (e.d !== false) cont[k].i = e.i; else delete cont[k].i; });
    var pc = prepararContorno(cont, inclP);
    if (!pc.ok) { avisos.push(pc.motivo); return null; }
    var b = Math.max(0, Math.min(LIM.beiral[1], num(f.beiral, 0)));
    var P = pc.pts, n = P.length, Pb = b > 0 ? deslocar(P, P.map(function () { return b; })) : P.slice();
    if (!Pb) { avisos.push("Beiral grande demais para este contorno (uma aresta some): diminua o beiral."); return null; }
    var ar = pc.arestas.map(function (a) { var s = a.d ? a.i / 100 : 0; return { d: a.d, s: s, ha: a.d ? H0 - b * s : Infinity, i: a.d ? a.i : null, orig: a.orig }; });
    var aguas = [], arestas = [];
    var sk = esqueleto(Pb, ar);
    if (sk.plano) {
      /* nenhuma aresta define inclinação: telhado PLANO na altura do apoio */
      aguas.push(aguaDe(-1, { a: H0, bx: 0, bz: 0, s: 0 }, [Pb.slice()], 0));
    } else {
      if (!sk.ok) sk.avisos.forEach(function (a) { avisos.push(a); });
      if (!sk.ok) return null;
      for (var k = 0; k < n; k++) {
        if (!ar[k].d) continue;
        var cad = encadear(sk.segs[k], { x: Pb[k][0], y: sk.h0, z: Pb[k][1] }, { x: Pb[(k + 1) % n][0], y: sk.h0, z: Pb[(k + 1) % n][1] });
        if (!cad) { avisos.push("a água da aresta " + (ar[k].orig + 1) + " não fechou o contorno"); continue; }
        var Q = limpar(cad.map(function (p) { return [p.x, p.z]; }));
        if (!Q.length) continue;
        if (areaSinal(Q) < 0) Q.reverse();
        aguas.push(aguaDe(k, planoAresta(sk.linhas[k], ar[k].s, ar[k].ha), [Q], ar[k].s));
      }
    }
    for (var e = 0; e < n; e++) arestas.push({ k: e, orig: ar[e].orig, define: ar[e].d, inclinacao: ar[e].i, alturaBeiral: ar[e].d ? r6(ar[e].ha) : null,
      parede: { a: { x: r6(P[e][0]), z: r6(P[e][1]) }, b: { x: r6(P[(e + 1) % n][0]), z: r6(P[(e + 1) % n][1]) } },
      beiral: { a: { x: r6(Pb[e][0]), z: r6(Pb[e][1]) }, b: { x: r6(Pb[(e + 1) % n][0]), z: r6(Pb[(e + 1) % n][1]) } } });
    return { aguas: aguas, arestas: arestas, P: P, Pb: Pb, beiral: b, nArestas: n };
  }

  /* o telhado POR EXTRUSÃO: perfil {u, y} no plano vertical (u ao longo de
     `ang`, y acima da base), extrudado de `inicio` a `fim` na perpendicular */
  function calcularExtrusao(f, H0, avisos) {
    var pf = arr(f.perfil).map(function (q) { return [Number(q && q.u), Number(q && q.y)]; });
    if (pf.length < 2 || pf.some(function (q) { return !fin(q[0]) || !fin(q[1]); })) { avisos.push("Perfil da extrusão inválido (pelo menos 2 pontos)."); return null; }
    var o = pt(f.origem || { x: 0, z: 0 }), ang = num(f.ang, 0) * Math.PI / 180, U = [Math.cos(ang), Math.sin(ang)], W = [-U[1], U[0]];
    var w0 = num(f.inicio, 0), w1 = num(f.fim, 0);
    if (!(w1 - w0 > 0.05)) { avisos.push("A extrusão precisa de início e fim (fim maior que o início)."); return null; }
    function pl(u, w) { return [o[0] + U[0] * u + W[0] * w, o[1] + U[1] * u + W[1] * w]; }
    var aguas = [];
    for (var i = 0; i + 1 < pf.length; i++) {
      var a = pf[i], b = pf[i + 1], du = b[0] - a[0], dy = b[1] - a[1];
      if (Math.abs(du) < 1e-6) continue;   /* trecho vertical: não é água */
      var s = dy / du, Q = [pl(a[0], w0), pl(b[0], w0), pl(b[0], w1), pl(a[0], w1)];
      if (areaSinal(Q) < 0) Q.reverse();
      /* y = H0 + a.y + (u − a.u)·s, com u = (p − o)·U */
      var plano = { a: H0 + a[1] - s * (dot(o, U) + a[0]), bx: s * U[0], bz: s * U[1], s: Math.abs(s) };
      var ag = aguaDe(i, plano, [Q], Math.abs(s)); ag.inclinacao = r6(Math.abs(s) * 100); aguas.push(ag);
    }
    if (!aguas.length) { avisos.push("O perfil da extrusão não tem trecho inclinado nem plano (só vertical)."); return null; }
    return { aguas: aguas, arestas: [], P: null, Pb: null, beiral: 0, nArestas: 0 };
  }

  /* o telhado DERIVADO (a fonte não muda). Inválido sai com ok:false e o
     motivo em avisos (aparece na tela; nunca some calado). */
  function calcular(fonte, niveis) {
    var f = clone(fonte), avisos = [];
    f.tipo = "telhado"; f.ifc = "IFCROOF";
    var M = mapaNiveis(niveis), elev;
    if (f.nivelId != null && temChave(M, String(f.nivelId))) elev = M[String(f.nivelId)];
    else {
      elev = num(f.base, 0);
      if (f.nivelId != null && arr(niveis).length) avisos.push("O nível do telhado não existe mais na obra: ficou na cota em que nasceu.");
    }
    var desl = fin(Number(f.deslocBase)) && f.deslocBase !== null ? Number(f.deslocBase) : 0;
    var t = tipoDe(fonte);
    f.tipoTelhado = t; f.tipoId = t.id; f.espessura = t.espessura;
    f.elevNivel = r6(elev); f.deslocBaseEf = r6(desl); f.cotaApoio = r6(elev + desl);
    f.modo = f.modo === "extrusao" ? "extrusao" : "perimetro";
    var g = f.modo === "extrusao" ? calcularExtrusao(f, f.cotaApoio, avisos) : calcularPerimetro(f, f.cotaApoio, avisos);
    zerar(f);
    if (!g) { f.ok = false; f.avisos = avisos; return f; }
    f.ok = true;
    f.aguasCalc = g.aguas;
    f.arestasCalc = g.arestas;
    f.beiralEf = g.beiral;
    f.beirais = g.Pb ? g.Pb.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }) : null;
    medir(f, g.Pb);
    if (avisos.length) f.avisos = avisos; else delete f.avisos;
    return f;
  }
  function zerar(f) {
    f.area = 0; f.areaProjecao = 0; f.volume = 0; f.cumeeira = 0; f.espigao = 0; f.rincao = 0; f.comprimentoBeiral = 0; f.comprimentoEmpena = 0;
    f.nAguas = 0; f.cotaCumeeira = null; f.aguasCalc = []; f.arestasCalc = []; f.linhas = [];
  }
  /* as medidas a partir das águas (de novo depois do unir) */
  function medir(f, Pb) {
    var ag = f.aguasCalc, t = num(f.espessura, 0), A = 0, AP = 0, ymax = -Infinity, xs = [], zs = [];
    ag.forEach(function (a) {
      var aP = 0; a.pecas.forEach(function (pc) { var Q = pc.pts.map(function (q) { return [q.x, q.z]; }); aP += Math.abs(areaSinal(Q)); pc.pts.forEach(function (q) { if (q.y > ymax) ymax = q.y; xs.push(q.x); zs.push(q.z); }); });
      a.areaProjecao = aP; a.area = aP * a.fator; A += a.area; AP += aP;
    });
    var LN = linhasDoTelhado(ag);
    f.area = A; f.areaProjecao = AP; f.volume = A * t;
    f.cumeeira = LN.cumeeira; f.espigao = LN.espigao; f.rincao = LN.rincao + num(f.rincaoUniao, 0); f.linhas = LN.itens;
    f.nAguas = ag.length; f.cotaCumeeira = isFinite(ymax) ? r6(ymax) : null;
    if (Pb) {
      var CA = contornoPorAresta(ag, Pb);
      f.arestasCalc.forEach(function (e) { var c = CA[e.k]; e.contorno = c.segs; e.comprimento = r6(c.comprimento); e.comprimentoPlanta = r6(c.comprimentoPlanta); });
      f.comprimentoBeiral = f.arestasCalc.filter(function (e) { return e.define; }).reduce(function (s, e) { return s + e.comprimento; }, 0);
      f.comprimentoEmpena = f.arestasCalc.filter(function (e) { return !e.define; }).reduce(function (s, e) { return s + e.comprimento; }, 0);
    }
    if (xs.length) {
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
      f.cx = r6((x0 + x1) / 2); f.cz = r6((z0 + z1) / 2); f.comprimento = r6(x1 - x0); f.largura = r6(z1 - z0);
    }
    /* "exato" para o registro e o IFC; as de 4 casas são a régua do orçamento */
    f.aguasResumo = ag.map(function (a) { return { aresta: a.aresta, inclinacao: a.inclinacao, area: r6(a.area), areaProjecao: r6(a.areaProjecao) }; });
  }

  /* UNIR: A perde a parte que fica na projeção de B e ABAIXO da superfície
     de B. O encontro (rincão de união) é medido. */
  function linhaNoPoligono(o, u, P) {
    /* intervalos do parâmetro t (o + t·u) dentro do polígono P */
    var ts = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], e = sub(b, a), den = cruz(u, e);
      if (Math.abs(den) < 1e-12) continue;
      var w = sub(a, o), t = cruz(w, e) / den, s = cruz(w, u) / den;
      if (s >= -1e-12 && s < 1 - 1e-12) ts.push(t);
    }
    ts.sort(function (x, y) { return x - y; });
    var out = [];
    for (var k = 0; k + 1 < ts.length; k += 2) out.push([ts[k], ts[k + 1]]);
    return out;
  }
  function interIntervalos(A, B) {
    var out = [];
    A.forEach(function (a) { B.forEach(function (b) { var x = Math.max(a[0], b[0]), y = Math.min(a[1], b[1]); if (y - x > 1e-9) out.push([x, y]); }); });
    return out;
  }
  function unir(fA, fB) {
    if (!fA.ok || !fB.ok) return { removida: 0, rincao: 0 };
    var removida = 0, rinc = 0, novas = [];
    fA.aguasCalc.forEach(function (ag) {
      var pecas = ag.pecas.map(function (pc) { return pc.pts.map(function (q) { return [q.x, q.z]; }); });
      var antes = pecas.reduce(function (s, Q) { return s + Math.abs(areaSinal(Q)); }, 0);
      fB.aguasCalc.forEach(function (bg) {
        var pa = ag.plano, pb = bg.plano;
        /* onde A fica ABAIXO de B: (yB − yA) > 0 → semiplano */
        var a = pb.bx - pa.bx, b = pb.bz - pa.bz, c = pb.a - pa.a;
        bg.pecas.forEach(function (pcB) {
          var QB = pcB.pts.map(function (q) { return [q.x, q.z]; });
          triangular(QB).forEach(function (T) {
            var K = (Math.abs(a) < 1e-14 && Math.abs(b) < 1e-14) ? (c > 0 ? T : []) : cortarSemiplano(T, a, b, c);
            if (K.length < 3 || Math.abs(areaSinal(K)) < 1e-10) return;
            if (areaSinal(K) < 0) K.reverse();
            var nv = [];
            pecas.forEach(function (Q) { menosConvexo(Q, K).forEach(function (x) { nv.push(x); }); });
            pecas = nv;
          });
          /* o rincão de união: a reta yA = yB dentro das duas peças */
          if (Math.abs(a) > 1e-14 || Math.abs(b) > 1e-14) {
            var nrm = Math.sqrt(a * a + b * b), o = [-a * c / (nrm * nrm), -b * c / (nrm * nrm)], u = [-b / nrm, a / nrm];
            ag.pecas.forEach(function (pcA) {
              var I = interIntervalos(linhaNoPoligono(o, u, pcA.pts.map(function (q) { return [q.x, q.z]; })), linhaNoPoligono(o, u, QB));
              I.forEach(function (iv) {
                var L = iv[1] - iv[0], dy = (pa.bx * u[0] + pa.bz * u[1]) * L;
                rinc += Math.sqrt(L * L + dy * dy);
              });
            });
          }
        });
      });
      pecas = pecas.filter(function (Q) { return Q.length >= 3 && Math.abs(areaSinal(Q)) > 1e-8; }).map(function (Q) { var R = limpar(Q); if (R.length && areaSinal(R) < 0) R.reverse(); return R; }).filter(function (Q) { return Q.length >= 3; });
      var depois = pecas.reduce(function (s, Q) { return s + Math.abs(areaSinal(Q)); }, 0);
      removida += (antes - depois) * ag.fator;
      if (pecas.length) { var n2 = aguaDe(ag.aresta, ag.plano, pecas, ag.plano.s); n2.inclinacao = ag.inclinacao; n2.fator = ag.fator; n2.area = n2.areaProjecao * ag.fator; novas.push(n2); }
    });
    fA.aguasCalc = novas;
    return { removida: removida, rincao: rinc };
  }

  /* ================================================================ BORDAS */
  function calcularBorda(fonte, telhadosPorId) {
    var b = clone(fonte), avisos = [], T = BORDAS[b.tipoBorda] ? b.tipoBorda : null;
    b.tipo = "borda";
    var Bd = BORDAS[T] || BORDAS.testeira;
    b.tipoBorda = T || "testeira";
    b.ifc = Bd.ifc; b.ifcPre = Bd.pre;
    b.larguraEf = fin(Number(b.largura)) && b.largura !== null ? Number(b.largura) : Bd.largura;
    b.alturaEf = fin(Number(b.altura)) && b.altura !== null ? Number(b.altura) : Bd.altura;
    b.comprimento = 0; b.area = 0; b.segs = []; b.ok = false;
    var t = telhadosPorId[String(b.telhado)];
    if (!t) { avisos.push("O telhado desta borda não existe mais."); b.avisos = avisos; return b; }
    if (!t.ok) { avisos.push("O telhado desta borda não fechou: sem comprimento."); b.avisos = avisos; return b; }
    if (t.modo !== "perimetro") { avisos.push("Bordas por aresta são do telhado por perímetro."); b.avisos = avisos; return b; }
    var porOrig = {}; arr(t.arestasCalc).forEach(function (e) { porOrig[e.orig] = e; });
    var ks = arr(b.arestas).map(function (k) { return Number(k); }).filter(function (k, i, l) { return fin(k) && l.indexOf(k) === i; });
    var area = 0, compr = 0;
    b.placas = [];
    ks.forEach(function (k) {
      var e = porOrig[k];
      if (!e) { avisos.push("A aresta " + (k + 1) + " não existe no telhado."); return; }
      if (Bd.onde === "beiral" && !e.define) { avisos.push(Bd.rotulo + " na aresta " + (k + 1) + ": a aresta não define inclinação (é empena) — " + Bd.rotulo.toLowerCase() + " vai no beiral."); return; }
      compr += num(e.comprimento, 0);
      arr(e.contorno).forEach(function (s) { b.segs.push({ a: s.a, b: s.b, aresta: k }); });
      if (b.tipoBorda === "intradorso") {
        /* o forro do beiral: o quadrilátero entre a linha da parede e a do beiral */
        var Q = [[e.parede.a.x, e.parede.a.z], [e.parede.b.x, e.parede.b.z], [e.beiral.b.x, e.beiral.b.z], [e.beiral.a.x, e.beiral.a.z]];
        area += Math.abs(areaSinal(Q));
        /* a placa do forro do beiral, horizontal, na altura da borda do beiral (o desenho e o IFC) */
        b.placas.push({ aresta: k, y: num(e.alturaBeiral, 0), pts: Q.map(function (q) { return { x: q[0], z: q[1] }; }) });
      }
    });
    if (b.tipoBorda === "testeira" || b.tipoBorda === "rufo") area = compr * b.alturaEf;
    b.comprimento = compr; b.area = area; b.ok = compr > 0;
    b.telhadoNivelId = t.nivelId != null ? t.nivelId : null;
    if (avisos.length) b.avisos = avisos; else delete b.avisos;
    return b;
  }

  /* ======================================================== validação */
  function idOk(v) { return (typeof v === "string" && v.length > 0 && v.length <= 120) || fin(v); }
  function opTelhadoValida(o) {
    if (!o || o.op !== "telhado" || !idOk(o.id)) return false;
    var algum = false;
    function faixa(k, a, b) { if (o[k] === undefined) return true; algum = true; return o[k] === null || (fin(o[k]) && o[k] >= a && o[k] <= b); }
    if (o.modo !== undefined) { if (o.modo !== null && o.modo !== "perimetro" && o.modo !== "extrusao") return false; algum = true; }
    if (o.contorno !== undefined) {
      if (o.contorno !== null) {
        if (!Array.isArray(o.contorno) || o.contorno.length < 3 || o.contorno.length > LIM.vertices) return false;
        for (var i = 0; i < o.contorno.length; i++) {
          var q = o.contorno[i];
          if (!obj(q) || !fin(q.x) || !fin(q.z)) return false;
          if (q.d != null && typeof q.d !== "boolean") return false;
          if (q.i != null && !(fin(q.i) && q.i >= LIM.inclinacao[0] && q.i <= LIM.inclinacao[1])) return false;
        }
      }
      algum = true;
    }
    if (!faixa("inclinacao", LIM.inclinacao[0], LIM.inclinacao[1]) || !faixa("beiral", LIM.beiral[0], LIM.beiral[1]) || !faixa("deslocBase", LIM.desloc[0], LIM.desloc[1]) ||
        !faixa("base", -10000, 10000) || !faixa("ang", -3600, 3600) || !faixa("inicio", -10000, 10000) || !faixa("fim", -10000, 10000)) return false;
    if (o.nivelId !== undefined) { if (o.nivelId !== null && !idOk(o.nivelId)) return false; algum = true; }
    if (o.unir !== undefined) { if (o.unir !== null && (!idOk(o.unir) || String(o.unir) === String(o.id))) return false; algum = true; }
    if (o.tipoId !== undefined) { if (o.tipoId !== null && !(typeof o.tipoId === "string" && o.tipoId.length > 0 && o.tipoId.length <= 60)) return false; algum = true; }
    if (o.tipoTelhado !== undefined) {
      if (o.tipoTelhado !== null) {
        if (!obj(o.tipoTelhado) || !Array.isArray(o.tipoTelhado.camadas) || !o.tipoTelhado.camadas.length || o.tipoTelhado.camadas.length > LIM.camadas) return false;
        var soma = 0;
        for (var c = 0; c < o.tipoTelhado.camadas.length; c++) { var k = o.tipoTelhado.camadas[c]; if (!obj(k) || !fin(k.e) || !(k.e > 0 && k.e <= LIM.camada)) return false; soma += k.e; }
        if (!(soma <= LIM.espessura)) return false;
      }
      algum = true;
    }
    if (o.origem !== undefined) { if (o.origem !== null && !(obj(o.origem) && fin(o.origem.x) && fin(o.origem.z))) return false; algum = true; }
    if (o.perfil !== undefined) {
      if (o.perfil !== null && !(Array.isArray(o.perfil) && o.perfil.length >= 2 && o.perfil.length <= LIM.perfil && o.perfil.every(function (q) { return obj(q) && fin(q.u) && fin(q.y); }))) return false;
      algum = true;
    }
    if (o.aresta !== undefined) {
      if (!(fin(o.aresta) && o.aresta >= 0 && o.aresta < LIM.vertices && Math.round(o.aresta) === o.aresta)) return false;
      if (o.defineInclinacao !== undefined && typeof o.defineInclinacao !== "boolean") return false;
      if (o.inclinacaoAresta !== undefined && o.inclinacaoAresta !== null && !(fin(o.inclinacaoAresta) && o.inclinacaoAresta >= LIM.inclinacao[0] && o.inclinacaoAresta <= LIM.inclinacao[1])) return false;
      if (o.defineInclinacao === undefined && o.inclinacaoAresta === undefined) return false;
      algum = true;
    } else if (o.defineInclinacao !== undefined || o.inclinacaoAresta !== undefined) return false;
    if (o.inclinacoes !== undefined) { if (o.inclinacoes !== null && !(typeof o.inclinacoes === "string" && o.inclinacoes.length <= 2000)) return false; algum = true; }
    return algum;
  }
  function opBordaValida(o) {
    if (!o || o.op !== "borda" || !idOk(o.id)) return false;
    var algum = false;
    if (o.telhado !== undefined) { if (!idOk(o.telhado)) return false; algum = true; }
    if (o.tipoBorda !== undefined) { if (!BORDAS[o.tipoBorda]) return false; algum = true; }
    if (o.arestas !== undefined) {
      if (!(Array.isArray(o.arestas) && o.arestas.length >= 1 && o.arestas.length <= LIM.vertices && o.arestas.every(function (k) { return fin(k) && k >= 0 && Math.round(k) === k; }))) return false;
      algum = true;
    }
    for (var i = 0, ks = ["largura", "altura"]; i < ks.length; i++) {
      var v = o[ks[i]]; if (v === undefined) continue;
      if (v !== null && !(fin(v) && v > 0 && v <= 2)) return false;
      algum = true;
    }
    return algum;
  }

  var CAMPOS = ["modo", "contorno", "inclinacao", "beiral", "nivelId", "base", "deslocBase", "tipoId", "tipoTelhado", "unir", "perfil", "origem", "ang", "inicio", "fim", "inclinacoes"];
  var CAMPOS_BORDA = ["telhado", "tipoBorda", "arestas", "largura", "altura"];
  function moverPts(l, dx, dz) { return arr(l).map(function (q) { var o = clone(q); o.x = r6(Number(q.x) + dx); o.z = r6(Number(q.z) + dz); return o; }); }

  var BimTelhado = {
    TIPOS: TIPOS, LIM: LIM, BORDAS: BORDAS, INCL_PADRAO: INCL_PADRAO, CAMPOS: CAMPOS,
    tipo: function (id) { return tipoCatalogo(id) || normTipo(TIPOS[0]); },
    normTipo: normTipo,
    prepararContorno: prepararContorno,
    deslocar: deslocar,
    esqueleto: esqueleto,
    calcular: calcular,
    calcularBorda: calcularBorda,
    unir: unir,
    triangular: triangular,
    cortarSemiplano: cortarSemiplano,
    menosConvexo: menosConvexo,
    inclinacoesTexto: inclinacoesTexto,
    areaSinal: areaSinal,
    yPlano: yPlano,
    opTelhadoValida: opTelhadoValida,
    opBordaValida: opBordaValida,
    opValida: function (o) { return o && o.op === "borda" ? opBordaValida(o) : opTelhadoValida(o); },

    /* a op de um telhado NOVO (o que a ferramenta coletou).
       d = { contorno:[{x,z}], aguas?:1|2|4, inclinacao?, beiral?, nivelId?, base?, deslocBase?, tipoId? }
       aguas (retângulo): 4 = todas definem; 2 = as duas arestas MAIS COMPRIDAS
       definem (cumeeira no lado maior, como a cobertura antiga); 1 = só a
       primeira aresta define (o caimento para o lado dela). Sem `aguas`, todas definem. */
    op: function (id, d) {
      d = d || {};
      var o = { op: "telhado", id: id };
      if (d.modo === "extrusao") {
        o.modo = "extrusao";
        o.perfil = arr(d.perfil).map(function (q) { return { u: r6(Number(q.u)), y: r6(Number(q.y)) }; });
        o.origem = { x: r6(num(d.origem && d.origem.x, 0)), z: r6(num(d.origem && d.origem.z, 0)) };
        ["ang", "inicio", "fim"].forEach(function (k) { if (fin(Number(d[k]))) o[k] = r6(Number(d[k])); });
      } else {
        var C = arr(d.contorno).map(function (q) { var p = pt(q); var x = { x: r6(p[0]), z: r6(p[1]) }; if (q && q.d === false) x.d = false; if (q && fin(Number(q.i)) && q.i !== null) x.i = Number(q.i); return x; });
        if (d.aguas === 1 || d.aguas === 2) {
          var Ls = C.map(function (q, k) { var r = C[(k + 1) % C.length]; return Math.sqrt(Math.pow(r.x - q.x, 2) + Math.pow(r.z - q.z, 2)); });
          var mx = Math.max.apply(null, Ls);
          C.forEach(function (q, k) {
            var def = d.aguas === 1 ? k === 0 : (Ls[k] >= mx - 1e-6 || (C.length === 4 && Ls[(k + 2) % 4] >= mx - 1e-6));
            if (!def) q.d = false; else delete q.d;
          });
        }
        o.contorno = C;
      }
      if (fin(Number(d.inclinacao)) && d.inclinacao !== null) o.inclinacao = r6(Number(d.inclinacao));
      if (fin(Number(d.beiral)) && d.beiral !== null) o.beiral = r6(Number(d.beiral));
      if (d.nivelId != null) o.nivelId = String(d.nivelId);
      if (fin(Number(d.base)) && d.base !== null) o.base = r6(Number(d.base));
      if (fin(Number(d.deslocBase)) && d.deslocBase !== null) o.deslocBase = r6(Number(d.deslocBase));
      if (d.tipoId != null) o.tipoId = String(d.tipoId);
      return opTelhadoValida(o) ? o : null;
    },
    opBorda: function (id, d) {
      d = d || {};
      var o = { op: "borda", id: id, telhado: d.telhado != null ? String(d.telhado) : d.telhado, tipoBorda: d.tipoBorda, arestas: arr(d.arestas).map(Number) };
      if (fin(Number(d.largura))) o.largura = Number(d.largura);
      if (fin(Number(d.altura))) o.altura = Number(d.altura);
      return opBordaValida(o) ? o : null;
    },

    /* ---------------------------------------------- ganchos do replay
     * Chamados pelo js/bimedit.js (bloco "P3"): aplicarOp → true se a op é
     * deste motor e valeu; fim(ctx, saida, niveis) publica saida.telhados e
     * saida.bordas ANTES do derivar da B2 (a parede "anexar topo" lê os
     * telhados prontos). ctx.p3[id] = "telhado" | "borda" (o dono do id). */
    aplicarOp: function (o, ctx) {
      if (!o || !ctx) return false;
      var T = ctx.telhados || (ctx.telhados = {}), ordT = ctx.ordemTe || (ctx.ordemTe = []);
      var B = ctx.bordas || (ctx.bordas = {}), ordB = ctx.ordemBo || (ctx.ordemBo = []), dono = ctx.p3 || (ctx.p3 = {});
      if (o.op === "telhado") {
        if (!opTelhadoValida(o)) return false;
        if (dono[o.id] && dono[o.id] !== "telhado") return false;
        var t = T[o.id], novo = !t;
        if (novo && !(o.modo === "extrusao" ? arr(o.perfil).length : arr(o.contorno).length)) return false;
        if (novo) { t = T[o.id] = { id: o.id, tipo: "telhado" }; ordT.push(o.id); dono[o.id] = "telhado"; }
        CAMPOS.forEach(function (k) { if (!temChave(o, k)) return; if (o[k] === null) delete t[k]; else t[k] = clone(o[k]); });
        if (temChave(o, "tipoId") && o.tipoId != null && !temChave(o, "tipoTelhado")) delete t.tipoTelhado;
        if (temChave(o, "contorno") && o.contorno) delete t.inclinacoes;
        if (temChave(o, "aresta")) {
          var q = arr(t.contorno)[o.aresta];
          if (!q) return false;
          if (o.defineInclinacao === false) q.d = false; else if (o.defineInclinacao === true) delete q.d;
          if (temChave(o, "inclinacaoAresta")) { if (o.inclinacaoAresta === null) delete q.i; else q.i = o.inclinacaoAresta; }
          if (t.inclinacoes != null) delete t.inclinacoes;
        }
        return true;
      }
      if (o.op === "borda") {
        if (!opBordaValida(o)) return false;
        if (dono[o.id] && dono[o.id] !== "borda") return false;
        var b = B[o.id];
        if (!b) {
          if (o.telhado == null || !arr(o.arestas).length) return false;
          b = B[o.id] = { id: o.id, tipo: "borda", tipoBorda: o.tipoBorda || "calha" }; ordB.push(o.id); dono[o.id] = "borda";
        }
        CAMPOS_BORDA.forEach(function (k) { if (!temChave(o, k)) return; if (o[k] === null) delete b[k]; else b[k] = clone(o[k]); });
        return true;
      }
      var qual = dono[o.id], alvo = qual === "telhado" ? T[o.id] : (qual === "borda" ? B[o.id] : null);
      if (!alvo) return false;
      if (o.op === "apagar") {
        if (qual === "telhado") { delete T[o.id]; ordT.splice(ordT.indexOf(o.id), 1); } else { delete B[o.id]; ordB.splice(ordB.indexOf(o.id), 1); }
        delete dono[o.id]; return true;
      }
      if (o.op === "orcar") { var E = dep("BimEdit", "./bimedit.js"); alvo.servicos = E && E.limparServicos ? E.limparServicos(o.servicos) : []; return true; }
      if (o.op === "mover" && qual === "telhado") {
        var dx = num(o.dx, NaN), dz = num(o.dz, NaN);
        if (!(fin(dx) || fin(dz))) {
          if (!(fin(Number(o.cx)) && fin(Number(o.cz)))) return false;
          var ref = alvo.modo === "extrusao" ? [num(alvo.origem && alvo.origem.x, 0), num(alvo.origem && alvo.origem.z, 0)] : (function () {
            var xs = arr(alvo.contorno).map(function (q) { return Number(q.x); }), zs = arr(alvo.contorno).map(function (q) { return Number(q.z); });
            return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, zs) + Math.max.apply(null, zs)) / 2];
          })();
          dx = Number(o.cx) - ref[0]; dz = Number(o.cz) - ref[1];
        }
        dx = fin(dx) ? dx : 0; dz = fin(dz) ? dz : 0;
        if (alvo.contorno) alvo.contorno = moverPts(alvo.contorno, dx, dz);
        if (alvo.origem) alvo.origem = { x: r6(num(alvo.origem.x, 0) + dx), z: r6(num(alvo.origem.z, 0) + dz) };
        return true;
      }
      return false;
    },
    fim: function (ctx, saida, niveis) {
      if (!ctx || !saida) return saida;
      var porId = {};
      if (ctx.telhados) {
        saida.telhados = arr(ctx.ordemTe).map(function (id) { var t = calcular(ctx.telhados[id], niveis); porId[String(id)] = t; return t; });
        /* UNIR depois de todos prontos (o B que corta é o B sem recorte: a ordem não muda nada) */
        var orig = {}; saida.telhados.forEach(function (t) { orig[String(t.id)] = { ok: t.ok, aguasCalc: t.aguasCalc }; });
        saida.telhados.forEach(function (t) {
          if (t.unir == null) return;
          var B = orig[String(t.unir)];
          if (!B) { (t.avisos = t.avisos || []).push("O telhado a que este está unido não existe mais."); return; }
          if (!t.ok || !B.ok) return;
          var r = unir(t, B);
          t.unidoA = String(t.unir); t.areaRemovidaUniao = r6(r.removida); t.rincaoUniao = r6(r.rincao);
          medir(t, t.beirais ? t.beirais.map(function (q) { return [q.x, q.z]; }) : null);
        });
      }
      if (ctx.bordas) saida.bordas = arr(ctx.ordemBo).map(function (id) { return calcularBorda(ctx.bordas[id], porId); });
      return saida;
    },

    /* as medidas do orçamento (as do BimEdit.medidasDe). exato: sem a régua de 4 casas */
    medidas: function (el, exato) {
      var R = exato ? function (v) { return v; } : r4, m = {};
      if (!el) return m;
      if (el.tipo === "borda") { m.un = 1; m.comprimento = R(num(el.comprimento, 0)); m.area = R(num(el.area, 0)); m.areaBruta = m.area; return m; }
      m.un = 1; m.area = R(num(el.area, 0)); m.areaBruta = m.area; m.areaProjecao = R(num(el.areaProjecao, 0)); m.volume = R(num(el.volume, 0));
      m.comprimento = R(num(el.cumeeira, 0));
      m.espigao = R(num(el.espigao, 0)); m.rincao = R(num(el.rincao, 0)); m.beiral = R(num(el.comprimentoBeiral, 0)); m.empena = R(num(el.comprimentoEmpena, 0));
      return m;
    },

    /* as SUPERFÍCIES para o topo da parede (js/bimarq.js superficies): cada
       peça de água é um plano limitado pelo polígono dela */
    superficies: function (t) {
      var out = [];
      if (!t || !t.ok) return out;
      arr(t.aguasCalc).forEach(function (ag) {
        ag.pecas.forEach(function (pc) {
          var Q = pc.pts.map(function (q) { return [q.x, q.z]; }), pl = ag.plano;
          if (Q.length < 3) return;
          out.push({ id: t.id, bordas: Q.map(function (q, k) { return [q, Q[(k + 1) % Q.length]]; }), dobras: [],
                     cobre: function (x, z, tol) { var p = [x, z]; tol = tol || 0; return dentro(p, Q) || Q.some(function (q, k) { return distSeg(p, q, Q[(k + 1) % Q.length]) <= tol + 1e-7; }); },
                     y: function (x, z) { return yPlano(pl, x, z); } });
        });
      });
      return out;
    },
    /* a altura da face de baixo do telhado no ponto (null fora dele) */
    alturaEm: function (t, x, z) {
      var y = null;
      arr(t && t.aguasCalc).forEach(function (ag) { ag.pecas.forEach(function (pc) { if (dentro([x, z], pc.pts.map(function (q) { return [q.x, q.z]; }))) { var v = yPlano(ag.plano, x, z); if (y == null || v < y) y = v; } }); });
      return y;
    },
    opTrocarTipo: function (estado, id, tipoId) {
      if (tipoCatalogo(tipoId)) return { op: "telhado", id: id, tipoId: String(tipoId), tipoTelhado: null };
      var com = arr(estado && estado.telhados).filter(function (t) { return t && t.tipoTelhado && t.tipoTelhado.id === String(tipoId); })[0];
      if (com) return { op: "telhado", id: id, tipoTelhado: { id: com.tipoTelhado.id, rotulo: com.tipoTelhado.rotulo, camadas: clone(com.tipoTelhado.camadas) } };
      return null;
    },
    /* "Inclinação por aresta" em texto, como a Propriedade mostra: "30;30;-;30" */
    textoInclinacoes: function (t) {
      return arr(t && t.contorno).map(function (q) { return q && q.d === false ? "-" : String(fin(Number(q && q.i)) && q.i !== null ? Number(q.i) : num(t.inclinacao, INCL_PADRAO)).replace(".", ","); }).join(";");
    }
  };

  global.BimTelhado = BimTelhado;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTelhado;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

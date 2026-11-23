/* =====================================================================
 * acopranchastrelica.js — FOLHAS DO GALPÃO TRELIÇADO (coluna treliçada +
 * tesoura) para as pranchas da estrutura desenhada (js/acopranchaslivre.js).
 * Motor PURO, ES5, sem DOM. 20/11/2026 (frente Metálica, pranchas v2).
 *
 * Por que existe: o jogo genérico tratava cada barra como peça solta — 20
 * folhas A1 com o mesmo pórtico 6 vezes a 1:100, plantas de nível com
 * tabelas de 80 linhas, banzo de tesoura chamado de "viga", escora de
 * "terça", lista de materiais com 980 linhas em ordem alfabética (D1, D10,
 * D100). O engenheiro achou ilegível para o serralheiro. Aqui o jogo é o de
 * escritório (docs/PADRAO-PRANCHA-METALICA.md):
 *   01 LOCAÇÃO DAS COLUNAS E BASES (+ quadro de cargas, norte, índice)
 *   02 PLANTA DE COBERTURA (terças com marca, correntes, X de contravento)
 *   03 PÓRTICO TÍPICO + DETALHE DA COLUNA TRELIÇADA
 *   04 DETALHE DA TESOURA (meia tesoura, nós com coordenadas, marca/barra)
 *   05 ELEVAÇÕES LONGITUDINAIS (só os planos com contraventamento)
 *   06 DETALHES TÍPICOS (base, nó, joelho, clip de terça, contravento,
 *      seções dos perfis) — sem dimensionamento: "A DIMENSIONAR", desenhado
 *   07 LISTA DE MATERIAIS por conjunto e marca + resumo por perfil
 *   08 ISOMÉTRICA DE MONTAGEM
 * O papel de cada peça sai do NOME da peça no modelo ("Coluna treliçada
 * esquerda — banzo de fora — pórtico 1", "Escora 3 — vão 2"…), que a
 * tipologia grava; peças iguais (papel + perfil + comprimento) = MESMA marca.
 * Nada inventado: o que o cálculo não decidiu sai "A DIMENSIONAR" (vermelho).
 *   AcoPranchasTrelica.detectar(d) → true se o modelo é desta tipologia
 *   AcoPranchasTrelica.preparar(d)  → d.tr (classes, marcas, conjuntos)
 *   AcoPranchasTrelica.defs(d, H)   → [{ id, titulo, formato, fn(c) }]
 * Teste: node tools/test-aco-pranchas-livre.js · tools/test-pranchas-sobreposicao.js
 * ===================================================================== */
(function (global) {
  "use strict";
  var VERMELHO = "#c00000";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { if (v == null || v === "") return d; var x = Number(v); return isFinite(x) ? x : d; }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }
  function rmm(v) { return Math.round(v * 1000); }
  function AP() { return global.AcoPranchas || (typeof require === "function" ? require("./acopranchas.js") : null); }
  // Rótulo curto do aço na prancha (tabela/seção): sem "ASTM " e sem o
  // parêntese descritivo do catálogo — "NBR 8261 Gr A (quadrado/retangular)"
  // invadia as colunas vizinhas da lista de materiais (EST-MET-06/07).
  // A especificação (norma + grau) fica igual; o parêntese só diz a forma.
  function acoCurto(a) { return txt(a).replace(/^ASTM\s*/, "").replace(/\s*\([^)]*\)\s*$/, ""); }
  function largT(s, h) { return AP().largTexto(s, h); }

  /* ================================================================ CLASSES DE PEÇA (pelo nome que a tipologia grava) */
  var CLASSES = [
    [/^Coluna treli[çc]ada.*banzo de fora/i, "COL", "BF", "BANZO EXTERNO DA COLUNA"],
    [/^Coluna treli[çc]ada.*banzo de dentro/i, "COL", "BN", "BANZO INTERNO DA COLUNA"],
    [/^Travejamento/i, "COL", "TV", "TRAVEJAMENTO DA COLUNA"],
    [/^Diagonal da coluna/i, "COL", "DC", "DIAGONAL DA COLUNA"],
    [/^Banzo superior/i, "TES", "BS", "BANZO SUPERIOR"],
    [/^Banzo inferior/i, "TES", "BI", "BANZO INFERIOR"],
    [/^Montante/i, "TES", "M", "MONTANTE"],
    [/^Diagonal\s*[—-]/i, "TES", "D", "DIAGONAL"],
    [/^M[ãa]o-francesa/i, "MF", "MF", "MÃO-FRANCESA"],
    [/^Ter[çc]a de borda/i, "TER", "TB", "TERÇA DE BORDA"],
    [/^Ter[çc]a/i, "TER", "TC", "TERÇA"],
    [/^Escora/i, "ESC", "E", "ESCORA"],
    [/^Corrente diagonal/i, "COR", "CA", "CORRENTE DIAGONAL (ANCORAGEM)"],
    [/^Corrente/i, "COR", "CR", "CORRENTE DE TERÇA"],
    [/^Contravento da coluna/i, "CTV", "CV", "CONTRAVENTO DA COLUNA"],
    [/^Contravento da cobertura/i, "CTV", "CH", "CONTRAVENTO DA COBERTURA"],
    [/^Contravento vertical/i, "CTV", "CVT", "CONTRAVENTO VERTICAL ENTRE TESOURAS"],
    [/^Coluna de tapamento/i, "TAP", "CT", "COLUNA DE TAPAMENTO"]
  ];
  var CONJ = { COL: "COLUNAS TRELIÇADAS", TES: "TESOURAS", TER: "TERÇAS", ESC: "ESCORAS", CTV: "CONTRAVENTAMENTO", COR: "CORRENTES DE TERÇA", MF: "MÃOS-FRANCESAS", TAP: "COLUNAS DE TAPAMENTO", OUT: "OUTRAS PEÇAS" };
  var ORDEM_CONJ = ["COL", "TES", "TER", "ESC", "CTV", "COR", "MF", "TAP", "OUT"];
  function classe(m) {
    var nome = txt(m.nome);
    for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i][0].test(nome)) return { conj: CLASSES[i][1], pre: CLASSES[i][2], desc: CLASSES[i][3] };
    return { conj: "OUT", pre: ({ pilar: "P", viga: "V", terca: "TC", diagonal: "CV" })[m.papel] || "X", desc: txt(m.papel).toUpperCase() || "PEÇA" };
  }
  function porticoDe(m) { var q = /p[óo]rtico\s+(\d+)\s*$/i.exec(txt(m.nome)); return q ? +q[1] : 0; }
  function detectar(d) {
    var c = { COL: 0, TES: 0 };
    arr(d && d.membros).forEach(function (m) { var k = classe(m).conj; if (c[k] != null && porticoDe(m)) c[k]++; });
    return c.COL > 0 && c.TES > 0;
  }

  /* dimensões da seção (mm): ao longo do eixo local y (hy) e do z (bz) e a forma */
  function dimSec(m) {
    var s = m.sec || {}, f = txt(s.forma);
    if (f === "circ") return { hy: num(s.d, 12), bz: num(s.d, 12), forma: "circ", s: s };
    if (f === "tubo-ret") return { hy: num(s.h, 50), bz: num(s.b, 50), forma: "tubo", s: s };
    /* cantoneira (L) e dupla cantoneira costas com costas (2L, com a chapa de nó de espessura e entre elas): o catálogo (js/perfisaco.js) dá a, b, t, e — sem d/bf, o
       "else" abaixo devolvia 200 x 100 mm (o padrão do modelo) e o contorno da 2L 76 saía com 200 mm de largura. No plano da tesoura: a aba paralela à chapa (b);
       fora do plano: as duas abas perpendiculares e a folga (2a + e). */
    if (f === "2L") return { hy: num(s.b, 50), bz: 2 * num(s.a, 50) + num(s.e, 8), forma: "2L", s: s };
    if (f === "L") return { hy: num(s.b, 50), bz: num(s.a, 50), forma: "L", s: s };
    if (s.tipo === "U" || s.tipo === "Ue") return { hy: num(s.bw, 100), bz: num(s.bf, 40), forma: s.tipo, s: s };
    return { hy: num(s.d, num(m.d * 1000, 100)), bz: num(s.bf, num(m.bf * 1000, 50)), forma: "I", s: s };
  }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(v) { var L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  /* largura VISTA da barra (mm) num plano de vista de normal n (a do modelo: eixo local y e z da seção) */
  function larguraVista(m, n) {
    var ds = dimSec(m), x = unit([m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]]), ey = unit(m.ey || [0, 1, 0]), ez = unit(cruz(x, ey));
    var p = unit(cruz(n, x));   /* direção no plano, perpendicular à barra */
    return Math.abs(dot(p, ey)) * ds.hy + Math.abs(dot(p, ez)) * ds.bz;
  }

  /* ================================================================ PREPARAR: classes, marcas de peça e de conjunto */
  function preparar(d, H) {
    var ms = d.membros, tr = { pecas: {}, marcas: [], conj: {}, porticos: [] };
    ms.forEach(function (m) { var c = classe(m); m.cls = c; m.portico = porticoDe(m); m.Lmm = rmm(m.L); });
    /* linhas de colunas: x dos banzos de fora (as duas linhas de eixo A, B…) e dos de dentro */
    var xsFora = [], xsDentro = [];
    ms.forEach(function (m) { if (m.cls.pre === "BF" && xsFora.every(function (x) { return Math.abs(x - m.a[0]) > 0.05; })) xsFora.push(m.a[0]); if (m.cls.pre === "BN" && xsDentro.every(function (x) { return Math.abs(x - m.a[0]) > 0.05; })) xsDentro.push(m.a[0]); });
    xsFora.sort(function (a, b) { return a - b; }); xsDentro.sort(function (a, b) { return a - b; });
    tr.xsFora = xsFora; tr.xsDentro = xsDentro;
    var xCol = xsFora.concat(xsDentro);
    /* escora: na linha das colunas = escora da coluna; senão, do banzo inferior */
    ms.forEach(function (m) {
      if (m.cls.conj !== "ESC") return;
      var naColuna = xCol.some(function (x) { return Math.abs(m.a[0] - x) < 0.05 && Math.abs(m.b[0] - x) < 0.05; });
      m.cls = naColuna ? { conj: "ESC", pre: "EC", desc: "ESCORA DA COLUNA" } : { conj: "ESC", pre: "EB", desc: "ESCORA DO BANZO INFERIOR" };
    });
    var pors = {}; ms.forEach(function (m) { if (m.portico) pors[m.portico] = 1; });
    tr.porticos = Object.keys(pors).map(Number).sort(function (a, b) { return a - b; });
    /* pórtico típico: o interno do meio (o de extremidade tem o tapamento) */
    tr.tipico = tr.porticos.length > 2 ? tr.porticos[1] : tr.porticos[0];
    var zPor = {}; ms.forEach(function (m) { if (m.portico && zPor[m.portico] == null && m.cls.conj === "TES") zPor[m.portico] = m.a[2]; });
    tr.zPor = zPor;
    /* MARCA DE PEÇA: prefixo + perfil + comprimento (mm) — iguais = mesma marca. Ordem: tesoura e coluna pela posição no
       pórtico típico (da esquerda para a direita, de baixo para cima), as outras pelo comprimento (maior primeiro) */
    var grupos = {};
    ms.forEach(function (m) {
      var k = m.cls.pre + "|" + m.perfil + "|" + m.Lmm, g = grupos[k];
      if (!g) g = grupos[k] = { chave: k, pre: m.cls.pre, desc: m.cls.desc, conj: m.cls.conj, perfil: m.perfil, aco: m.aco, Lmm: m.Lmm, L: m.L, massa: m.massa, membros: [], pos: 1e9 };
      g.membros.push(m);
      if ((m.cls.conj === "TES" || m.cls.conj === "COL") && m.portico === tr.tipico) { var p = Math.min(m.a[0], m.b[0]) * 1000 + Math.min(m.a[1], m.b[1]); if (p < g.pos) g.pos = p; }
    });
    var porPre = {};
    Object.keys(grupos).forEach(function (k) { var g = grupos[k]; (porPre[g.pre] = porPre[g.pre] || []).push(g); });
    Object.keys(porPre).forEach(function (pre) {
      porPre[pre].sort(function (a, b) { return (a.pos - b.pos) || (b.Lmm - a.Lmm) || (a.perfil < b.perfil ? -1 : 1); });
      porPre[pre].forEach(function (g, i) { g.marca = pre + (i + 1); g.membros.forEach(function (m) { m.marca = g.marca; }); tr.marcas.push(g); });
    });
    /* CONJUNTOS: coluna (por pórtico e lado) e tesoura (por pórtico) com a assinatura = as marcas que os compõem */
    var cjs = {};
    ms.forEach(function (m) {
      if (!m.portico || (m.cls.conj !== "COL" && m.cls.conj !== "TES")) return;
      var lado = m.cls.conj === "COL" ? (Math.min(m.a[0], m.b[0]) < (d.caixa.x0 + d.caixa.x1) / 2 ? "E" : "D") : "";
      var k = m.cls.conj + "|" + m.portico + "|" + lado; (cjs[k] = cjs[k] || { tipo: m.cls.conj, portico: m.portico, lado: lado, membros: [] }).membros.push(m);
    });
    var tiposCj = {}, contaTipo = { COL: 0, TES: 0 };
    Object.keys(cjs).sort().forEach(function (k) {
      var cj = cjs[k], ass = cj.tipo + "|" + cj.membros.map(function (m) { return m.marca; }).sort().join(",");
      var t = tiposCj[ass]; if (!t) { t = tiposCj[ass] = { tipo: cj.tipo, marca: (cj.tipo === "COL" ? "CL" : "TS") + (++contaTipo[cj.tipo]), conjuntos: [], comp: {} }; cj.membros.forEach(function (m) { t.comp[m.marca] = (t.comp[m.marca] || 0) + 1; }); }
      t.conjuntos.push(cj); cj.marca = t.marca; cj.membros.forEach(function (m) { m.conjunto = t.marca; });
    });
    tr.conjTipos = Object.keys(tiposCj).map(function (k) { return tiposCj[k]; }).sort(function (a, b) { return a.marca < b.marca ? -1 : 1; });
    tr.conjuntos = Object.keys(cjs).map(function (k) { return cjs[k]; });
    tr.grupos = grupos;
    d.tr = tr;
    return tr;
  }

  /* ================================================================ AUXILIARES DE DESENHO */
  /* a lista de escalas do desenho: SEMPRE do PADRAO_ACO.escalas (js/acopranchas.js — lugar único) */
  function ESC(nome) { var A = AP(), L = A && A.PADRAO_ACO && A.PADRAO_ACO.escalas && A.PADRAO_ACO.escalas[nome]; if (!L || !L.length) throw new Error("PADRAO_ACO.escalas." + nome + " ausente"); return L; }
  function escala(lista, wr, hr, wp, hp) { for (var i = 0; i < lista.length; i++) { var s = 1000 / lista[i]; if (wr * s <= wp && hr * s <= hp) return lista[i]; } return lista[lista.length - 1]; }
  /* recorte de segmento (Liang–Barsky) na janela [x0,y0,x1,y1] (coordenadas do papel) */
  function recorta(p, q, J) {
    var t0 = 0, t1 = 1, dx = q[0] - p[0], dy = q[1] - p[1], P = [-dx, dx, -dy, dy], Q = [p[0] - J[0], J[2] - p[0], p[1] - J[1], J[3] - p[1]];
    for (var i = 0; i < 4; i++) { if (Math.abs(P[i]) < 1e-12) { if (Q[i] < 0) return null; continue; } var r = Q[i] / P[i]; if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
    return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
  }
  /* barra vista pelo contorno (largura w em papel) ou unifilar (w pequeno) — recortada na janela J */
  function barra(D, p1, p2, w, cam, J) {
    var L = hip(p2[0] - p1[0], p2[1] - p1[1]); if (L < 0.05) return;
    if (w < 0.7) { var s = J ? recorta(p1, p2, J) : [p1, p2]; if (s) D.linha(s[0][0], s[0][1], s[1][0], s[1][1], cam); return; }
    var ux = (p2[0] - p1[0]) / L, uy = (p2[1] - p1[1]) / L, nx = -uy * w / 2, ny = ux * w / 2;
    [[nx, ny], [-nx, -ny]].forEach(function (o) { var s2 = J ? recorta([p1[0] + o[0], p1[1] + o[1]], [p2[0] + o[0], p2[1] + o[1]], J) : [[p1[0] + o[0], p1[1] + o[1]], [p2[0] + o[0], p2[1] + o[1]]]; if (s2) D.linha(s2[0][0], s2[0][1], s2[1][0], s2[1][1], cam); });
  }
  /* rótulo da barra: no lugar livre mais perto do meio (paralelo à barra se couber; senão horizontal ao lado) */
  function rotuloBarra(D, p1, p2, s, h, o) {
    o = o || {};
    var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, w = largT(s, h) + 1.2, r = o.raio || 9;
    var ar = [mx - r - w / 2, my - r, mx + r + w / 2, my + r];
    if (o.J) ar = [Math.max(ar[0], o.J[0]), Math.max(ar[1], o.J[1]), Math.min(ar[2], o.J[2]), Math.min(ar[3], o.J[3])];
    if (ar[2] - ar[0] < w || ar[3] - ar[1] < h) return false;
    var c = D.procura([mx, my], w, h * 1.05, ar, { passo: 0.5, folga: 0.35 });
    if (!c) return false;
    D.texto(c[0], c[1] + 0.37 * h - 0.08 * h, s, h, { al: "C", cor: o.cor });
    return true;
  }
  /* rótulo AO LONGO da barra (girado com ela), dos dois lados, no 1º lugar livre; wb = largura vista da barra (papel) */
  function rotuloLongo(D, p1, p2, s, h, wb, J) {
    var L = hip(p2[0] - p1[0], p2[1] - p1[1]), w = largT(s, h); if (L < w + 2) return false;
    var ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI; if (ang > 90.01) ang -= 180; if (ang < -90.01) ang += 180;
    var a0 = ang * Math.PI / 180, ux = Math.cos(a0), uy = Math.sin(a0), nx = -uy, ny = ux, off = (wb || 0) / 2 + 0.7 + 0.47 * h;
    var ts = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];
    for (var i = 0; i < ts.length; i++) for (var sd = -1; sd <= 1; sd += 2) {
      var cx = p1[0] + (p2[0] - p1[0]) * ts[i] + nx * off * sd, cy = p1[1] + (p2[1] - p1[1]) * ts[i] + ny * off * sd, yb = cy + 0.37 * h;
      /* a mesma caixa do DP.texto (meio: linha de base = y + 0,37h; giro em torno de (x, linha de base)) */
      var q = [[-w / 2, -0.76 * h], [w / 2, -0.76 * h], [w / 2, 0.18 * h], [-w / 2, 0.18 * h]].map(function (p) { return [cx + p[0] * ux - p[1] * uy, yb + p[0] * uy + p[1] * ux]; });
      if (J && !q.every(function (p) { return p[0] >= J[0] && p[0] <= J[2] && p[1] >= J[1] && p[1] <= J[3]; })) continue;
      if (!D.livreQ(q, 0.3)) continue;
      D.texto(cx, cy, s, h, { al: "C", meio: true, rot: ang });
      return true;
    }
    return false;
  }
  /* AMPLIAÇÃO de uma região do pórtico (janela j0 em m) no ESTILO DOS DETALHES 1–11 (21/11/2026): barras pelo contorno na escala real
     (1:5 / 1:10 — escDet), cortadas na janela com a linha de interrupção, pontas recortadas no encontro com a peça mais larga (boca de
     lobo), eixos, chapa de nó do cálculo (r.nosChapa), cotas dos nós e chamadas alinhadas numa coluna à direita. Antes era o desenho
     unifilar da vista do pórtico, com o rótulo de cada barra solto sobre o traço. A conta da chapa e do recuo é a mesma do detNo. */
  function chapaPoli(ms, o, P) {
    var ch = o && o.chapa && o.chapa.tg ? o.chapa : null; if (!ch) return null;
    var dm = {}; ms.forEach(function (m) { dm[m.id] = m; });
    var pc = pecasNo(ms, P), prin = dm[o.principal]; if (!prin || !pc.some(function (q) { return q.m === prin; })) return null;
    var p0 = pc.filter(function (q) { return q.m === prin; })[0], up = p0.u, np = [-up[1], up[0]], wP = larguraVista(prin, [0, 0, 1]);
    var barras = pc.filter(function (q) { return !(q.m.cls.pre === prin.cls.pre && Math.abs(q.u[0] * p0.u[1] - q.u[1] * p0.u[0]) < 0.03); });
    var sd = 0; barras.forEach(function (q) { sd += q.u[0] * np[0] + q.u[1] * np[1]; }); sd = sd >= 0 ? 1 : -1;
    var hyP = dimSec(prin).hy, cIn = -wP / 2, cOut = ch.hg - wP / 2;
    if (hyP <= wP) { cOut = wP / 2 + Math.max(0, ch.hg - hyP); cIn = cOut - ch.hg; }
    return { ch: ch, prin: prin, poli: [[-1, sd * cIn], [1, sd * cIn], [1, sd * cOut], [-1, sd * cOut]].map(function (q) { var a = q[0] * ch.Lg / 2, b = q[1]; return [up[0] * a + np[0] * b, up[1] * a + np[1] * b]; }) };
  }
  function ampliacao(D, d, c, ms, x, y, w, h, numero, titulo, j0, notas, lista) {
    var A = AP(), T = D.E.T, hn = T.nota * 0.85, NI = (d.r && d.r.modelo && d.r.modelo.noInfo) || {};
    var wJ = (j0[2] - j0[0]) * 1000, hJ = (j0[3] - j0[1]) * 1000, JJ = [0, 0, wJ, hJ], cl = { x: x, y: y };
    function L(P) { return [(P[0] - j0[0]) * 1000, (P[1] - j0[1]) * 1000]; }
    var segs = [], cams = {}, wCol = 0;
    ms.forEach(function (m) {
      var a0 = L(m.a), b0 = L(m.b), r = recorta(a0, b0, JJ); if (!r || hip(r[1][0] - r[0][0], r[1][1] - r[0][1]) < 25) return;
      segs.push({ m: m, A: r[0], B: r[1], cA: hip(r[0][0] - a0[0], r[0][1] - a0[1]) > 1, cB: hip(r[1][0] - b0[0], r[1][1] - b0[1]) > 1 });
      if (!cams[m.marca]) { cams[m.marca] = m.marca + " - " + c.perfil(m.perfil); wCol = Math.max(wCol, largT(cams[m.marca], hn) + 6); }
    });
    if (!segs.length) return null;
    /* chapas de nó (r.nosChapa) com o nó dentro da janela */
    var chapas = [];
    arr(d.r && d.r.nosChapa && d.r.nosChapa.nos).forEach(function (o) {
      var q = NI[o.no], P = q && q.P; if (!P || !ms.length || Math.abs(P[2] - ms[0].a[2]) > 0.05) return;
      var lp = L(P); if (lp[0] < -1 || lp[0] > wJ + 1 || lp[1] < -1 || lp[1] > hJ + 1) return;
      var cp = chapaPoli(ms, o, P); if (cp) chapas.push({ o: o, P: P, lp: lp, cp: cp });
    });
    chapas.forEach(function (q) { q.rot = "CHAPA # " + mmBr(q.cp.ch.tg, 1) + " x " + q.cp.ch.Lg + " x " + q.cp.ch.hg; wCol = Math.max(wCol, largT(q.rot, hn) + 6, largT("ASTM A36", hn) + 6); });
    var ext = [-40, -70, wJ + 40, hJ + 40], hNo = notas ? 12 : 0, M = moldaDet(cl, w, h, ext, wCol, hNo);
    h = Math.min(h, (ext[3] - ext[1]) * M.k + 18 + hNo + 6);   /* a célula encolhe ao desenho (o moldaDet centra: não deixar o desenho solto no meio da folha) */
    M = moldaDet(cl, w, h, ext, wCol, hNo); var F = M.F, ip = D.s.length;
    A.tituloVista(D, x, y, titulo, "ESC 1:" + M.esc, numero);
    function FL(P) { return F(P[0], P[1]); }
    chapas.forEach(function (q) { D.poli(q.cp.poli.map(function (v) { return F(q.lp[0] + v[0], q.lp[1] + v[1]); }), "MET-PERFIL-CORTE", true); });
    /* o recuo da ponta de uma barra no encontro com a peça mais larga que passa pelo nó (a mesma conta do detNo) */
    function banzo(m) { return /^(BS|BI|BF|BN)$/.test(m.cls.pre); }
    function recuo(sg, fim) {
      var m = sg.m, E = fim ? m.b : m.a, w0 = larguraVista(m, [0, 0, 1]), pc = pecasNo(ms, E), pr = null, t0 = [0, 0];
      if (!banzo(m)) pc.forEach(function (q) { if (q.m !== m && banzo(q.m) && (!pr || larguraVista(q.m, [0, 0, 1]) > larguraVista(pr.m, [0, 0, 1]))) pr = q; });   /* só as barras da alma recuam, no banzo (a largura de vista das 2L é a mesma: a regra é a classe, como no detNo) */
      else {
        /* banzo que muda de direção no nó (cumeeira: BS com BS): corte em meia-esquadria pela bissetriz — sem fresta nem sobra no encontro */
        var dx0 = (fim ? -1 : 1) * (m.b[0] - m.a[0]), dy0 = (fim ? -1 : 1) * (m.b[1] - m.a[1]), L0 = hip(dx0, dy0) || 1, u0 = [dx0 / L0, dy0 / L0], nv0 = [-u0[1], u0[0]];
        var vb = null; pc.forEach(function (q) { if (q.m !== m && q.m.cls.pre === m.cls.pre && Math.abs(q.u[0] * u0[1] - q.u[1] * u0[0]) > 0.02 && (q.u[0] * u0[0] + q.u[1] * u0[1]) < 0.999) vb = q.u; });
        if (vb) {
          var bx = u0[0] + vb[0], by = u0[1] + vb[1], Lb = hip(bx, by); if (Lb < 1e-6) return t0; bx /= Lb; by /= Lb;
          var cu0 = u0[0] * by - u0[1] * bx, cn0 = nv0[0] * by - nv0[1] * bx;
          if (Math.abs(cu0) > 1e-3) [1, -1].forEach(function (s2, i) { t0[i] = -w0 / 2 * s2 * cn0 / cu0; });
          return t0;
        }
      }
      if (!pr) return t0;
      var wP = larguraVista(pr.m, [0, 0, 1]), np = [-pr.u[1], pr.u[0]], dx = (fim ? -1 : 1) * (m.b[0] - m.a[0]), dy = (fim ? -1 : 1) * (m.b[1] - m.a[1]), Lm = hip(dx, dy) || 1, u = [dx / Lm, dy / Lm], nv = [-u[1], u[0]], cu = u[0] * np[0] + u[1] * np[1];
      if (Math.abs(Math.abs(u[0] * pr.u[0] + u[1] * pr.u[1]) - 1) < 0.03) return t0;   /* a continuação da mesma linha */
      if (Math.abs(cu) > 0.12) [1, -1].forEach(function (s2, i) { var off = (nv[0] * np[0] + nv[1] * np[1]) * w0 / 2 * s2; t0[i] = Math.max(0, ((cu > 0 ? 1 : -1) * wP / 2 - off) / cu); });
      else t0 = [wP / 2, wP / 2];
      return t0;
    }
    segs.forEach(function (sg) {
      var w0 = larguraVista(sg.m, [0, 0, 1]), md = [(sg.A[0] + sg.B[0]) / 2, (sg.A[1] + sg.B[1]) / 2];
      if (sg.cA) barraDet(D, F, md, sg.A, w0, { quebra: true, eixo: false }); else barraDet(D, F, sg.A, md, w0, { t0: recuo(sg, false), eixo: false });
      if (sg.cB) barraDet(D, F, md, sg.B, w0, { quebra: true, eixo: false }); else barraDet(D, F, sg.B, md, w0, { t0: recuo(sg, true), eixo: false });
      (D._eixosDet = D._eixosDet || []).push([FL(sg.A), FL(sg.B)]);
    });
    /* nós: as pontas das barras dentro da janela (cota nó a nó, em mm) */
    var nx = [], ny = [];
    ms.forEach(function (m) {
      [m.a, m.b].forEach(function (P) {
        var q = L(P); if (q[0] < -1 || q[0] > wJ + 1 || q[1] < -1 || q[1] > hJ + 1) return;
        var f = FL(q); D.ponto(f[0], f[1], 0.55);
        if (nx.every(function (v) { return Math.abs(v - q[0]) > 3; })) nx.push(q[0]);
        if (ny.every(function (v) { return Math.abs(v - q[1]) > 3; })) ny.push(q[1]);
      });
    });
    nx.sort(function (q, w2) { return q - w2; }); ny.sort(function (q, w2) { return q - w2; });
    if (nx.length > 1 && nx.length < 8) D.cadeia(nx.map(function (v) { return F(v, -28); }), 0, nx.slice(1).map(function (v, k) { return String(Math.round(v - nx[k])); }), {});
    if (ny.length > 1 && ny.length < 8) D.cadeia(ny.map(function (v) { return F(-20, v); }), 0, ny.slice(1).map(function (v, k) { return String(Math.round(v - ny[k])); }), {});
    /* chamadas à direita: uma por marca (no ponto médio do trecho visível) e uma por chapa */
    var itens = [], ja = {};
    segs.forEach(function (sg) { if (ja[sg.m.marca]) return; ja[sg.m.marca] = 1; itens.push({ p: F((sg.A[0] + sg.B[0]) / 2, (sg.A[1] + sg.B[1]) / 2), l: [cams[sg.m.marca]] }); });
    chapas.forEach(function (q) { itens.push({ p: FL(q.lp), l: [q.rot, "ASTM A36"] }); });
    colunaCham(D, M.xCol, itens, hn, M.yIni); eixosDet(D);
    if (notas) D.textos(x, M.yFim + 4, [{ t: "A DIMENSIONAR: " + notas, cor: VERMELHO }], T.nota * 0.9, { wmax: w - 4 });
    blocoDet(D, ip, "DET-" + numero, M.esc, x, y, w, h);
    return { esc: M.esc };
  }
  function escalaGrafica(D, x, y, s, h) {
    /* 5 m em trechos de 1 m (s = papel/m) */
    var w = s, i;
    for (i = 0; i < 5; i++) { if (i % 2 === 0) D.cheio([[x + i * w, y], [x + (i + 1) * w, y], [x + (i + 1) * w, y + 1.2], [x + i * w, y + 1.2]]); }
    D.ret(x, y, 5 * w, 1.2, "MET-FINA");
    D.texto(x, y + 1.2 + h + 0.8, "0", h, { al: "C" }); D.texto(x + 5 * w, y + 1.2 + h + 0.8, "5 m", h, { al: "C" });
    D.texto(x + 2.5 * w, y - 1.2, "ESCALA GRÁFICA", h, { al: "C" });
  }
  function norte(D, cx, cy, vx, vy, h, temNorte) {
    var L = 9, r = 6;
    D.circ(cx, cy, r, "MET-FINA");
    D.cheio([[cx + vx * L, cy + vy * L], [cx - vy * 2.2, cy + vx * 2.2], [cx, cy]]);
    D.poli([[cx + vx * L, cy + vy * L], [cx + vy * 2.2, cy - vx * 2.2], [cx, cy]], "MET-FINA", true);
    D.texto(cx + vx * (L + 3.2), cy + vy * (L + 3.2), "N", h * 1.2, { al: "C", meio: true });
    if (!temNorte) D.texto(cx, cy + r + h + 4, "NORTE [a preencher]", h * 0.9, { al: "C", cor: VERMELHO });
  }
  function aDimensionar(D, x, y, h) { return D.textos(x, y, [{ t: "A DIMENSIONAR", cor: VERMELHO }], h, {}); }

  /* ================================================================ 01 — LOCAÇÃO DAS COLUNAS E BASES */
  function eixosGalpao(d) {
    var tr = d.tr, linhas = tr.xsFora.slice(), letras = [], nums = [];
    linhas.forEach(function (x, i) { letras.push({ nome: String.fromCharCode(65 + i), c: x }); });
    tr.porticos.forEach(function (p, i) { nums.push({ nome: String(i + 1), c: tr.zPor[p], portico: p }); });
    return { x: letras, z: nums };
  }
  function folhaLocacao(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, E = eixosGalpao(d), tr = d.tr;
    var Lz = d.caixa.z1 - d.caixa.z0, Lx = d.caixa.x1 - d.caixa.x0;
    var titH = 14, mx = 46, my = 40, nB = Object.keys(c.r.reacoes || {}).length, hQuadro = Math.ceil(nB / 2) * 4.6 + 34;
    var esc = escala(ESC("locacao"), Lz, Lx, a.w - 2 * mx - 10, a.h - hQuadro - titH - 2 * my - 8);
    var s = 1000 / esc, x0 = a.x + mx + 8, y0 = a.y + titH + my;
    function X(z) { return x0 + (z - d.caixa.z0) * s; } function Y(x) { return y0 + (x - d.caixa.x0) * s; }
    AP().tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE LOCAÇÃO DAS COLUNAS E DAS BASES", "ESC 1:" + esc);
    var iBlo = D.s.length;
    var top = Y(d.caixa.x0), bot = Y(d.caixa.x1), lef = X(d.caixa.z0), rig = X(d.caixa.z1);
    /* eixos: pórticos (número, vertical no papel) e linhas de colunas (letra) */
    E.z.forEach(function (e) { var px = X(e.c), r = D.raioBalao(e.nome); D.linha(px, top - 26 + r, px, bot + 26 - r, "MET-EIXO"); D.balao(px, top - 26, e.nome); D.balao(px, bot + 26, e.nome); });
    E.x.forEach(function (e) { var py = Y(e.c), r = D.raioBalao(e.nome); D.linha(lef - 30 + r, py, rig + 22 - r, py, "MET-EIXO"); D.balao(lef - 30, py, e.nome); D.balao(rig + 22, py, e.nome); });
    /* colunas: os banzos (seção) — fora no eixo, dentro à largura da coluna; tapamento */
    d.pil.forEach(function (p) {
      var m = p.m, ds = dimSec(m), cx = X(p.z), cy = Y(p.x), w = Math.max(0.9, ds.hy / 1000 * s), hh = Math.max(0.9, ds.bz / 1000 * s);
      var depZ = Math.abs(m.ey[2]) > Math.abs(m.ey[0]);
      var W = depZ ? w : hh, Hh = depZ ? hh : w;
      D.cheio([[cx - W / 2, cy - Hh / 2], [cx + W / 2, cy - Hh / 2], [cx + W / 2, cy + Hh / 2], [cx - W / 2, cy + Hh / 2]]);
    });
    /* cotas: pórticos em cima (parciais + total), vão à esquerda (total entre eixos), largura da coluna em baixo à esquerda */
    var zs = E.z.map(function (e) { return e.c; });
    /* 21/11/2026 — como a locação do galpão (js/acopranchas.js): em cima as parciais entre eixos e o total; embaixo as ACUMULADAS a partir do eixo 1 */
    if (zs.length > 1) { var P = zs.map(function (z) { return [X(z), top - 8]; }), v = []; for (var i = 0; i + 1 < zs.length; i++) v.push(String(rmm(zs[i + 1] - zs[i]))); D.cadeia(P, 0, v, { attrs: v.map(function () { return ' data-cota="parcial-z"'; }) }); D.cadeia([P[0], P[P.length - 1]], 8, [String(rmm(zs[zs.length - 1] - zs[0]))], { attrs: [' data-cota="comprimento"'] });
      var acc = zs.map(function (z) { return String(rmm(z - zs[0])); }); D.acumulada(zs.map(function (z) { return [X(z), bot]; }), -10, acc, { semExt: true, attrs: acc.map(function () { return ' data-cota="acumulada-z"'; }) }); }
    var xs = E.x.map(function (e) { return e.c; });
    if (xs.length > 1) { var Q = xs.slice().reverse().map(function (x) { return [lef - 10, Y(x)]; }); D.cadeia(Q, 0, [String(rmm(xs[xs.length - 1] - xs[0]))], {}); }
    /* largura da coluna treliçada (eixo do banzo de fora → eixo do banzo de dentro), na 1ª coluna, abaixo da planta */
    if (tr.xsDentro.length) {
      var xa = tr.xsFora[0], xb = tr.xsDentro[0], zc = zs[zs.length - 1];
      D.cota(X(zc) + 12, Y(xa), X(zc) + 12, Y(xb), 0, String(rmm(xb - xa)), { foraSeUnico: true });
      D.chamada(X(zc), Y(xb), X(zc) + 18, Y(xb) + 9, ["LARGURA DA COLUNA (EIXO A EIXO DOS BANZOS)"], { alternativas: [[X(zc) + 18, Y(xb) + 15]] });
    }
    /* tapamento: cotado a partir do eixo A, no oitão do eixo 1 */
    var taps = d.pil.filter(function (p) { return p.m.cls.conj === "TAP" && Math.abs(p.z - zs[0]) < 0.3; }).map(function (p) { return p.x; }).sort(function (q, w2) { return q - w2; });
    if (taps.length) { var pts = [xs[0]].concat(taps).concat([xs[xs.length - 1]]), Pt = pts.map(function (x) { return [lef - 22, Y(x)]; }), vt = []; for (var j = 0; j + 1 < pts.length; j++) vt.push(String(rmm(pts[j + 1] - pts[j]))); D.cadeia(Pt.slice().reverse(), 0, vt.slice().reverse(), {}); }
    /* marcas: conjunto da coluna (CL1) junto de cada coluna, CT no tapamento */
    var feitos = {};
    tr.conjuntos.filter(function (cj) { return cj.tipo === "COL"; }).forEach(function (cj) {
      var b = cj.membros.filter(function (m) { return m.cls.pre === "BF"; })[0]; if (!b) return;
      var k = cj.portico + cj.lado; if (feitos[k]) return; feitos[k] = 1;
      var px = X(b.a[2]), py = Y(b.a[0]) + (cj.lado === "E" ? 7 : -5);
      D.textoLivre([px + 6, py], cj.marca, T.marca, [px - 12, py - 9, px + 14, py + 9]);
    });
    d.pil.filter(function (p) { return p.m.cls.conj === "TAP"; }).forEach(function (p) { var px = X(p.z), py = Y(p.x); D.textoLivre([px + 6, py - 4], p.m.marca, T.marca * 0.85, [px - 14, py - 10, px + 14, py + 10]); });
    var yFim = bot + 34;
    blocoGr(D, iBlo, "LOCACAO", esc, lef - 36, top - 30, rig - lef + 64, yFim - top + 30);
    /* norte, escala gráfica */
    var fN = arr(d.env && d.env.faces).filter(function (f) { return f.orientacao === "norte"; })[0], nv = fN ? [fN.normal[1], fN.normal[0]] : [0, -1];
    norte(D, a.x + a.w - 16, a.y + 20, nv[0], nv[1], T.nota, !!fN);
    escalaGrafica(D, a.x + a.w - 40 - 5 * s, a.y + 12, s, T.nota * 0.9);
    /* QUADRO DE CARGAS NA FUNDAÇÃO (envoltória ELU) e QUADRO DE BASES */
    var R = c.r.reacoes || {}, linhas = [];
    var porPeca = {}; d.pil.forEach(function (p) { porPeca[String(p.m.peca)] = p; });
    function eixoDe(p) { var lx = E.x.filter(function (e) { return Math.abs(e.c - p.x) < 0.05; })[0], lz = E.z.filter(function (e) { return Math.abs(e.c - p.z) < 0.3; })[0]; return (lx ? lx.nome : (E.x[0].nome + "+" + rmm(p.x - E.x[0].c))) + "-" + (lz ? lz.nome : "?"); }
    var bases = Object.keys(R).map(function (no) {
      var q = R[no], p = porPeca[String(q.peca)], e2 = q.envELU || {};
      function mx2(k) { var vv = arr(e2[k]); return vv.length ? Math.max(Math.abs(vv[0]), Math.abs(vv[1])) : 0; }
      return { p: p, ordem: p ? p.z * 1000 + p.x : 1e9, l: [p ? p.m.conjunto || p.m.marca : "", p ? p.m.marca : "", p ? eixoDe(p) : "", c.br(arr(e2.Fy)[1], 1), c.br(arr(e2.Fy)[0], 1), c.br(mx2("Fx"), 1), c.br(mx2("Fz"), 1)] };
    }).sort(function (q, w2) { return q.ordem - w2.ordem; });
    bases.forEach(function (b, i) { linhas.push(["B" + (i + 1)].concat(b.l)); });
    var yq = Math.max(yFim, a.y + a.h - hQuadro) + 2, cols = [{ t: "BASE", w: 14 }, { t: "CONJ.", w: 15 }, { t: "PEÇA", w: 14 }, { t: "EIXO", w: 20 }, { t: ["Vd MÁX.", "(kN)"], w: 18 }, { t: ["Vd MÍN.", "(kN)"], w: 18 }, { t: ["|Hx,d|", "(kN)"], w: 16 }, { t: ["|Hz,d|", "(kN)"], w: 16 }];
    var porBloco = Math.ceil(linhas.length / 2);
    if (linhas.length) {
      var hTit = AP().tituloVista(D, a.x + 4, yq, "QUADRO DE CARGAS NA FUNDAÇÃO - ENVOLTÓRIA ELU (kN)", "VALORES DE CÁLCULO") + 1;
      var xt = a.x + 4, wtab = 0, hTab = 0; cols.forEach(function (q) { wtab += q.w; });
      for (var k = 0; k < linhas.length; k += porBloco) { hTab = Math.max(hTab, D.tabela(xt, yq + hTit, cols, linhas.slice(k, k + porBloco), {}).h); xt += wtab + 6; }
      D.textos(a.x + 4, yq + hTit + hTab + 2, ["Vd > 0 = COMPRESSÃO NA FUNDAÇÃO; Vd < 0 = ARRANCAMENTO. EIXO 'A-1' = LINHA A x PÓRTICO 1; 'A+833-1' = A 833 mm DO EIXO A, NO PÓRTICO 1. CARGAS POR CASO: MEMORIAL DE CÁLCULO."], T.nota * 0.9, { wmax: 2 * wtab });
      /* quadro de bases à direita dos blocos */
      var xb2 = Math.max(xt + 4, a.x + 4 + largT("QUADRO DE CARGAS NA FUNDAÇÃO - ENVOLTÓRIA ELU (kN)", T.titulo) + 8);
      if (xb2 + 120 <= a.x + a.w) {
        AP().tituloVista(D, xb2, yq, "QUADRO DE BASES", null);
        var vinc = d.bases.length ? (d.bases[0].b.tipo === "rotulada" ? "ROTULADA" : "ENGASTADA") : "-";
        D.tabela(xb2, yq + 8, [{ t: "PEÇA", w: 16 }, { t: "PERFIL", w: 38, al: "E" }, { t: "VINCULAÇÃO", w: 24 }, { t: "PLACA / CHUMBADORES", w: 42 }],
          uniqPeca(bases).map(function (b) { var pd = placaDaPeca(d, b.p.m.id); return [b.p.m.marca, c.perfil(b.p.m.perfil), vinc, pd ? { t: pd, attr: ' data-dimensionada="placa"' } : { t: d.bases.some(function (q) { return q.dim; }) ? "VER DETALHE 1" : "A DIMENSIONAR", cor: d.bases.some(function (q) { return q.dim; }) ? null : VERMELHO }]; }), {});
      }
    }
    return { escala: "1:" + esc };
  }
  function uniqPeca(bases) { var v = {}, o = []; bases.forEach(function (b) { if (b.p && !v[b.p.m.marca]) { v[b.p.m.marca] = 1; o.push(b); } }); return o; }

  /* ================================================================ 02 — PLANTA DE COBERTURA */
  function folhaCobertura(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, E = eixosGalpao(d), tr = d.tr;
    var Lz = d.caixa.z1 - d.caixa.z0, Lx = d.caixa.x1 - d.caixa.x0, titH = 14;
    var esc = escala(ESC("locacao"), Lz, Lx, a.w - 120, a.h - c.reservaBaixo - titH - 90);
    var s = 1000 / esc, x0 = a.x + 58, y0 = a.y + titH + 44;
    function X(z) { return x0 + (z - d.caixa.z0) * s; } function Y(x) { return y0 + (x - d.caixa.x0) * s; }
    AP().tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE COBERTURA - TERÇAS, CORRENTES E CONTRAVENTAMENTO", "ESC 1:" + esc);
    var iBlo = D.s.length;
    var top = Y(d.caixa.x0), bot = Y(d.caixa.x1), lef = X(d.caixa.z0), rig = X(d.caixa.z1);
    E.z.forEach(function (e) { var px = X(e.c), r = D.raioBalao(e.nome); D.linha(px, top - 24 + r, px, bot + 18 - r, "MET-EIXO"); D.balao(px, top - 24, e.nome); D.balao(px, bot + 18, e.nome); });
    E.x.forEach(function (e) { var py = Y(e.c), r = D.raioBalao(e.nome); D.linha(lef - 40 + r, py, rig + 16 - r, py, "MET-EIXO"); D.balao(lef - 40, py, e.nome); D.balao(rig + 16, py, e.nome); });
    var ms = d.membros, linhasTerca = {};
    /* banzos superiores das tesouras (unifilar forte) */
    ms.forEach(function (m) {
      var k = m.cls.conj, p1 = [X(m.a[2]), Y(m.a[0])], p2 = [X(m.b[2]), Y(m.b[0])];
      if (m.cls.pre === "BS") D.linha(p1[0], p1[1], p2[0], p2[1], "MET-PRINCIPAL");
      else if (k === "TER") { D.linha(p1[0], p1[1], p2[0], p2[1], "MET-SECUNDARIO"); var kx = Math.round(m.a[0] * 100); (linhasTerca[kx] = linhasTerca[kx] || []).push(m); }
      else if (m.cls.pre === "CH") D.linha(p1[0], p1[1], p2[0], p2[1], "MET-CONTRAVENTO");
      else if (k === "COR") D.linha(p1[0], p1[1], p2[0], p2[1], "MET-OCULTA");
    });
    /* rótulos: uma marca por linha de terça (no vão do meio) e o X de contravento (no maior vazio) */
    var vaos = []; for (var i = 0; i + 1 < E.z.length; i++) vaos.push([E.z[i].c, E.z[i + 1].c]);
    var vRot = vaos[Math.floor(vaos.length / 2)] || [d.caixa.z0, d.caixa.z1];
    var xsT = Object.keys(linhasTerca).map(Number).sort(function (q, w) { return q - w; });
    xsT.forEach(function (kx) {
      var L = linhasTerca[kx], mm0 = L.filter(function (m) { var zm = (m.a[2] + m.b[2]) / 2; return zm > vRot[0] && zm < vRot[1]; })[0] || L[0];
      var marcas = {}; L.forEach(function (m) { marcas[m.marca] = 1; });
      var s2 = Object.keys(marcas).sort(natural).join("/");
      rotuloBarra(D, [X(mm0.a[2]), Y(mm0.a[0])], [X(mm0.b[2]), Y(mm0.b[0])], s2, T.perfil, { raio: 3 });
    });
    var ch = ms.filter(function (m) { return m.cls.pre === "CH"; });
    var vistosCH = {};
    ch.forEach(function (m) { var k = Math.round((m.a[2] + m.b[2]) * 5) + "|" + Math.round((m.a[0] + m.b[0]) * 5); if (vistosCH[k]) return; vistosCH[k] = 1; });
    var feitosCH = {};
    ch.forEach(function (m) {
      var zk = Math.round(Math.min(m.a[2], m.b[2]) * 10); if (feitosCH[zk + m.marca]) return; feitosCH[zk + m.marca] = 1;
      rotuloBarra(D, [X(m.a[2]), Y(m.a[0])], [X(m.b[2]), Y(m.b[0])], m.marca, T.perfil, { raio: 6 });
    });
    /* cotas: espaçamento das terças (à esquerda, ao longo do vão) e pórticos (em cima) */
    var xsC = xsT.map(function (k) { return k / 100; });
    if (xsC.length > 1) { var P = xsC.slice().reverse().map(function (x) { return [lef - 12, Y(x)]; }), v = []; for (var j = 0; j + 1 < P.length; j++) v.push(String(Math.round((P[j][1] - P[j + 1][1]) / s * 1000))); D.cadeia(P, 0, v, {}); }
    var zs = E.z.map(function (e) { return e.c; });
    if (zs.length > 1) { var Pz = zs.map(function (z) { return [X(z), top - 10]; }), vz = []; for (var q = 0; q + 1 < zs.length; q++) vz.push(String(rmm(zs[q + 1] - zs[q]))); D.cadeia(Pz, 0, vz, {}); }
    /* legenda */
    var yl = bot + 30, xl = a.x + 4;
    blocoGr(D, iBlo, "COBERTURA", esc, lef - 46, top - 28, rig - lef + 46 + 30, bot - top + 28 + 30);
    AP().tituloVista(D, xl, yl, "LEGENDA", null);
    var leg = [["MET-PRINCIPAL", "BANZO SUPERIOR DA TESOURA (TS)"], ["MET-SECUNDARIO", "TERÇA (TC / TB) - MARCA SOBRE A LINHA"], ["MET-CONTRAVENTO", "CONTRAVENTO DA COBERTURA (CH) EM X"], ["MET-OCULTA", "CORRENTE DE TERÇA (CR / CA)"], ["MET-EIXO", "EIXO"]];
    leg.forEach(function (q, k2) { var yy = yl + 10 + k2 * 5.2, xx = xl + (k2 >= 3 ? 110 : 0), y2 = k2 >= 3 ? yl + 10 + (k2 - 3) * 5.2 : yy; D.linha(xx, y2 - 0.9, xx + 14, y2 - 0.9, q[0]); D.texto(xx + 17, y2, q[1], T.nota, {}); });
    var fN = arr(d.env && d.env.faces).filter(function (f) { return f.orientacao === "norte"; })[0], nv = fN ? [fN.normal[1], fN.normal[0]] : [0, -1];
    norte(D, a.x + a.w - 16, a.y + 20, nv[0], nv[1], T.nota, !!fN);
    escalaGrafica(D, a.x + a.w - 40 - 5 * s, a.y + 12, s, T.nota * 0.9);
    return { escala: "1:" + esc };
  }
  function natural(a, b) { var ra = /^([A-Z]+)(\d+)$/.exec(a), rb = /^([A-Z]+)(\d+)$/.exec(b); if (ra && rb && ra[1] === rb[1]) return +ra[2] - +rb[2]; return a < b ? -1 : (a > b ? 1 : 0); }

  /* ================================================================ VISTA DO PÓRTICO (plano x-y) numa janela */
  function membrosPortico(d, p, conjs) { return d.membros.filter(function (m) { return m.portico === p && conjs.indexOf(m.cls.conj) >= 0; }); }
  function vistaPortico(D, d, ms, X, Y, s, J, o) {
    o = o || {};
    var n = [0, 0, 1];
    ms.forEach(function (m) {
      var w = larguraVista(m, n) / 1000 * s, cam = (m.cls.pre === "BS" || m.cls.pre === "BI" || m.cls.pre === "BF" || m.cls.pre === "BN") ? "MET-PRINCIPAL" : (m.cls.conj === "MF" ? "MET-OCULTA" : "MET-PERFIL");
      barra(D, [X(m.a[0]), Y(m.a[1])], [X(m.b[0]), Y(m.b[1])], o.unifilar ? 0 : w, cam, J);
    });
  }

  /* ================================================================ 03 — PÓRTICO TÍPICO + COLUNA TRELIÇADA */
  function folhaPortico(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, tr = d.tr, p = tr.tipico, A = AP();
    var ms = membrosPortico(d, p, ["COL", "TES"]), xs = [], ys = [];
    ms.forEach(function (m) { xs.push(m.a[0], m.b[0]); ys.push(m.a[1], m.b[1]); });
    var x0r = Math.min.apply(null, xs), x1r = Math.max.apply(null, xs), y0r = Math.min.apply(null, ys), y1r = Math.max.apply(null, ys);
    /* coluna à direita (1:25 cabendo na altura), pórtico ocupando o resto */
    var col = ms.filter(function (m) { return m.cls.conj === "COL" && Math.min(m.a[0], m.b[0]) < (x0r + x1r) / 2; });
    var cx0 = Math.min.apply(null, col.map(function (m) { return Math.min(m.a[0], m.b[0]); })), cx1 = Math.max.apply(null, col.map(function (m) { return Math.max(m.a[0], m.b[0]); }));
    var cy1 = Math.max.apply(null, col.map(function (m) { return Math.max(m.a[1], m.b[1]); }));
    /* pórtico típico em cima (a largura toda); embaixo, a coluna treliçada (esquerda) e o pórtico do oitão (direita) */
    var escP = escala(ESC("portico"), x1r - x0r, y1r - y0r, a.w - 70, a.h * 0.38), s = 1000 / escP;
    var yLow = a.y + 30 + (y1r - y0r) * s + 40;
    var escC = escala(ESC("corteColuna"), cx1 - cx0 + 0.3, cy1 - y0r, 120, a.y + a.h - 26 - yLow - 30), sC = 1000 / escC;
    var wCol = (cx1 - cx0) * sC + 150;
    var px0 = a.x + 36, py0 = a.y + 30 + (y1r - y0r) * s;
    function X(x) { return px0 + (x - x0r) * s; } function Y(y) { return py0 - (y - y0r) * s; }
    A.tituloVista(D, a.x + 4, a.y + 2, "PÓRTICO TÍPICO - EIXO " + (tr.porticos.indexOf(p) + 1) + " (VISTA)", "ESC 1:" + escP);
    var iPt = D.s.length;
    vistaPortico(D, d, ms, X, Y, s, null, {});
    /* mãos-francesas (fora do plano): tracejadas */
    membrosPortico(d, p, ["MF"]).forEach(function (m) { D.linha(X(m.a[0]), Y(m.a[1]), X(m.b[0]), Y(m.b[1]), "MET-OCULTA"); });
    /* eixos A e B, níveis e cotas gerais */
    var Ex = eixosGalpao(d).x;
    Ex.forEach(function (e) { var xx = X(e.c), r = D.raioBalao(e.nome); D.linha(xx, Y(y0r) + 4, xx, Y(y0r) + 22 - r, "MET-EIXO"); D.balao(xx, Y(y0r) + 22, e.nome); });
    D.cota(X(Ex[0].c), Y(y0r) + 12, X(Ex[Ex.length - 1].c), Y(y0r) + 12, 0, String(rmm(Ex[Ex.length - 1].c - Ex[0].c)), {});
    var nivs = [y0r]; ms.forEach(function (m) { if (m.cls.pre === "BF") nivs.push(Math.max(m.a[1], m.b[1])); if (m.cls.pre === "BI") nivs.push(Math.max(m.a[1], m.b[1])); }); nivs.push(y1r);
    var nv = []; nivs.sort(function (q, w) { return q - w; }).forEach(function (y) { if (nv.every(function (q) { return Math.abs(q - y) > 0.05; })) nv.push(y); });
    nv.forEach(function (y) { D.nivel(X(x0r) - 16, Y(y), c.nivel(y), -1); });
    D.cadeia(nv.map(function (y) { return [X(x1r) + 14, Y(y)]; }), 0, nv.slice(1).map(function (y, k) { return String(rmm(y - nv[k])); }), {});
    /* marcas de conjunto e balões de detalhe */
    var tsM = ms.filter(function (m) { return m.cls.conj === "TES"; })[0], clE = col[0], clD = ms.filter(function (m) { return m.cls.conj === "COL" && m.portico === p && m.conjunto && Math.min(m.a[0], m.b[0]) > (x0r + x1r) / 2; })[0];
    var xm = X((x0r + x1r) / 2), ytop = Y(y1r);
    if (tsM) D.textoLivre([xm, ytop - 9], "TESOURA " + tsM.conjunto + " (VER FOLHA DO DETALHE DA TESOURA)", T.marca, [xm - 120, ytop - 22, xm + 120, ytop - 4]);
    if (clE) { var yc = Y((y0r + cy1) / 2); D.textoLivre([X(x0r) - 24, yc - 14], clE.conjunto, T.marca, [X(x0r) - 36, yc - 30, X(x0r) - 4, yc]); }
    if (clD) { var yc2 = Y((y0r + cy1) / 2); D.textoLivre([X(x1r) + 26, yc2 - 14], clD.conjunto, T.marca, [X(x1r) + 4, yc2 - 30, X(x1r) + 40, yc2]); }
    var fF = c.numFolha("detalhes");
    var bfE = ms.filter(function (m) { return m.cls.pre === "BF"; }).sort(function (q, w) { return q.a[0] - w.a[0]; })[0];
    if (bfE) {
      var xb0 = X(bfE.a[0]), yTopo = Math.max(bfE.a[1], bfE.b[1]);
      D.marcaLig(xb0 - 14, Y(y0r) - 26, "1", fF, xb0, Y(y0r), [[xb0 - 14, Y(y0r) - 36], [xb0 - 22, Y(y0r) - 46], [xb0 + 40, Y(y0r) - 20]]);
      D.marcaLig(xb0 - 14, Y(yTopo) + 22, "3", fF, xb0, Y(yTopo), [[xb0 - 14, Y(yTopo) + 32], [xb0 - 20, Y(yTopo) + 42]]);
    }
    var bi = ms.filter(function (m) { return m.cls.pre === "BI"; })[0];
    if (bi) { var nx = (bi.a[0] + bi.b[0]) / 2, ny = (bi.a[1] + bi.b[1]) / 2; D.marcaLig(X(nx) + 4, Y(ny) + 14, "2", fF, X(nx), Y(ny), [[X(nx) - 10, Y(ny) + 14]]); }
    blocoGr(D, iPt, "PORTICO-TIPICO", escP, a.x, a.y + 8, a.w, yLow - a.y - 8);
    /* DETALHE DA COLUNA TRELIÇADA (à direita) */
    var dx0 = a.x + 4, dyB = a.y + a.h - 26;
    function XC(x) { return dx0 + 44 + (x - cx0) * sC; } function YC(y) { return dyB - (y - y0r) * sC; }
    var yTit = YC(cy1) - 24;
    A.tituloVista(D, dx0, yTit, "DETALHE DA COLUNA TRELIÇADA " + (clE ? clE.conjunto : ""), "ESC 1:" + escC + " (" + (col.length ? tr.conjTipos.filter(function (t) { return t.marca === clE.conjunto; })[0].conjuntos.length : 0) + " PEÇAS)");
    var iCo = D.s.length;
    vistaPortico(D, d, col, XC, YC, sC, null, {});
    col.forEach(function (m) {
      var p1 = [XC(m.a[0]), YC(m.a[1])], p2 = [XC(m.b[0]), YC(m.b[1])];
      if (m.cls.pre === "TV" || m.cls.pre === "DC") rotuloBarra(D, p1, p2, m.marca, T.perfil * 0.9, { raio: 9 });
    });
    col.filter(function (m) { return m.cls.pre === "BF" || m.cls.pre === "BN"; }).forEach(function (m) {
      var xx = XC(m.a[0]), yA = YC(Math.min(m.a[1], m.b[1])), yB = YC(Math.max(m.a[1], m.b[1]));
      D.rotuloLinha([[m.cls.pre === "BF" ? xx - 12 : xx + 2, yA - 20, yB + 20]], [m.marca + " " + c.perfil(m.perfil), m.marca], T.perfil * 0.9);
    });
    var bnTop = col.filter(function (m) { return m.cls.pre === "BN"; }).map(function (m) { return Math.max(m.a[1], m.b[1]); })[0];
    if (bnTop != null && bnTop < cy1 - 0.2) D.chamada(XC(cx1), YC((bnTop + cy1) / 2), XC(cx1) + 14, YC((bnTop + cy1) / 2) - 6, ["TRECHO SUPERIOR: ENCONTRO", "COM A TESOURA - DETALHE 3", "(FOLHA " + c.numFolha("detalhes") + ")"], { dir: 1 });
    /* cotas da coluna: largura (em baixo), alturas dos travejamentos (cadeia à esquerda) */
    D.cota(XC(cx0), YC(y0r) + 8, XC(cx1), YC(y0r) + 8, 0, String(rmm(cx1 - cx0)), { foraSeUnico: true });
    var ysT = [y0r]; col.forEach(function (m) { if (m.cls.pre === "TV") ysT.push((m.a[1] + m.b[1]) / 2); }); ysT.push(cy1);
    var yU = []; ysT.sort(function (q, w) { return q - w; }).forEach(function (y) { if (yU.every(function (q) { return Math.abs(q - y) > 0.01; })) yU.push(y); });
    D.cadeia(yU.map(function (y) { return [XC(cx0) - 20, YC(y)]; }), 0, yU.slice(1).map(function (y, k) { return String(rmm(y - yU[k])); }), {});
    blocoGr(D, iCo, "COLUNA-TRELICADA", escC, dx0, yTit, wCol, dyB + 26 - yTit);
    /* PÓRTICO DE EXTREMIDADE (OITÃO): o 1º pórtico com as colunas de tapamento */
    var p1o = tr.porticos[0], z1o = tr.zPor[p1o], oit = membrosPortico(d, p1o, ["COL", "TES"]).concat(d.membros.filter(function (m) { return m.cls.conj === "TAP" && Math.abs(m.a[2] - z1o) < 0.3 && Math.abs(m.b[2] - z1o) < 0.3; }));
    var xo = a.x + 4 + wCol + 10, wo = a.x + a.w - xo - 30;
    if (oit.some(function (m) { return m.cls.conj === "TAP"; }) && wo > 150) {
      var escO = escala(ESC("oitao"), x1r - x0r, y1r - y0r, wo - 30, a.y + a.h - yLow - 70), so = 1000 / escO;
      var xo0 = xo + 20, yoB = yLow + 26 + (y1r - y0r) * so;
      function XO(x) { return xo0 + (x - x0r) * so; } function YO(y) { return yoB - (y - y0r) * so; }
      A.tituloVista(D, xo, yLow, "PÓRTICO DE EXTREMIDADE (OITÃO) - EIXO 1 (VISTA)", "ESC 1:" + escO);
      var iOi = D.s.length;
      vistaPortico(D, d, oit, XO, YO, so, null, {});
      var taps = oit.filter(function (m) { return m.cls.conj === "TAP"; }).sort(function (q, w) { return q.a[0] - w.a[0]; });
      taps.forEach(function (m) { var xx = XO(m.a[0]), yA = YO(Math.min(m.a[1], m.b[1])), yB = YO(Math.max(m.a[1], m.b[1])); D.rotuloLinha([[xx + 1, yA - 8, yB + 8]], [m.marca + " " + c.perfil(m.perfil), m.marca], T.perfil * 0.9); });
      var xsO = [Ex[0].c].concat(taps.map(function (m) { return m.a[0]; })).concat([Ex[Ex.length - 1].c]);
      D.cadeia(xsO.map(function (x) { return [XO(x), YO(y0r) + 10]; }), 0, xsO.slice(1).map(function (x, k) { return String(rmm(x - xsO[k])); }), {});
      Ex.forEach(function (e) { var xx = XO(e.c), r = D.raioBalao(e.nome); D.linha(xx, YO(y0r) + 3, xx, YO(y0r) + 20 - r, "MET-EIXO"); D.balao(xx, YO(y0r) + 20, e.nome); });
      blocoGr(D, iOi, "OITAO", escO, xo, yLow, wo + 30, YO(y0r) + 30 - yLow);
      D.textos(xo, YO(y0r) + 30, [ligVar(d, "tapamento").length ? { t: "COLUNAS DE TAPAMENTO (CT) ENTRE A BASE E O BANZO INFERIOR DA TESOURA; LIGAÇÃO NO TOPO E BASE: DIMENSIONADAS (DETALHE 10, FOLHA " + c.numFolha("ligacoes") + ").", attr: ' data-dimensionada="tapamento"' }
        : "COLUNAS DE TAPAMENTO (CT) ENTRE A BASE E O BANZO INFERIOR DA TESOURA; LIGAÇÃO NO TOPO: A DIMENSIONAR."], T.nota, { wmax: wo });
      return { escala: "1:" + escP + " / 1:" + escC + " / 1:" + escO };
    }
    return { escala: "1:" + escP + " / 1:" + escC };
  }

  /* ================================================================ 04 — DETALHE DA TESOURA (meia tesoura) */
  function folhaTesoura(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, tr = d.tr, p = tr.tipico, A = AP();
    var ms = membrosPortico(d, p, ["TES"]), xs = [], ys = [];
    ms.forEach(function (m) { xs.push(m.a[0], m.b[0]); ys.push(m.a[1], m.b[1]); });
    var x0r = Math.min.apply(null, xs), x1r = Math.max.apply(null, xs), y0r = Math.min.apply(null, ys), y1r = Math.max.apply(null, ys), xm = (x0r + x1r) / 2;
    /* simétrica? (cada barra tem o espelho) → meia tesoura */
    function espelho(P, Q) { return Math.abs(2 * xm - P[0] - Q[0]) < 0.02 && Math.abs(P[1] - Q[1]) < 0.02; }
    var sim = ms.every(function (m) { return ms.some(function (q) { return q.marca === m.marca && ((espelho(m.a, q.a) && espelho(m.b, q.b)) || (espelho(m.a, q.b) && espelho(m.b, q.a))); }); });
    var xFim = sim ? xm + 0.25 : x1r, vis = ms.filter(function (m) { return Math.min(m.a[0], m.b[0]) <= xFim - 0.24; });
    var hTab = 74, esc = escala(ESC("conjunto"), xFim - x0r + 0.4, y1r - y0r, a.w - 60, a.h - c.reservaBaixo - hTab - 80), s = 1000 / esc;
    var px0 = a.x + 40, py0 = a.y + 40 + (y1r - y0r) * s;
    function X(x) { return px0 + (x - x0r) * s; } function Y(y) { return py0 - (y - y0r) * s; }
    var J = [X(x0r) - 30, Y(y1r) - 30, X(xFim), Y(y0r) + 30];
    A.tituloVista(D, a.x + 4, a.y + 2, "DETALHE DA TESOURA " + (ms[0] ? ms[0].conjunto : "") + (sim ? " - MEIA TESOURA (SIMÉTRICA EM RELAÇÃO À CUMEEIRA)" : ""), "ESC 1:" + esc + " - COTAS EM mm A PARTIR DO NÓ 0 (APOIO, EIXO DO BANZO INFERIOR)");
    var iTe = D.s.length;
    vistaPortico(D, d, vis, X, Y, s, J, {});
    if (sim) { D.linha(X(xm), Y(y1r) - 14, X(xm), Y(y0r) + 14, "MET-EIXO"); D.texto(X(xm) + 1.5, Y(y1r) - 10, "EIXO DE SIMETRIA (CUMEEIRA)", T.nota, {}); }
    /* NÓS: numerados, com coordenadas */
    var nos = []; function no(P) { for (var i = 0; i < nos.length; i++) if (Math.abs(nos[i][0] - P[0]) < 0.003 && Math.abs(nos[i][1] - P[1]) < 0.003) return i; nos.push([P[0], P[1]]); return nos.length - 1; }
    vis.forEach(function (m) { [m.a, m.b].forEach(function (P) { if (P[0] <= xFim - 0.24 || (sim && Math.abs(P[0] - xm) < 0.01)) no(P); }); });
    var ori = nos.slice().sort(function (q, w) { return (q[0] - w[0]) || (q[1] - w[1]); })[0];
    nos.sort(function (q, w) { return (q[0] - w[0]) || (q[1] - w[1]); });
    nos.forEach(function (P, i) { var cx = X(P[0]), cy = Y(P[1]); D.ponto(cx, cy, 0.55); D.textoLivre([cx + 3, cy + 4.5], String(i), T.nota * 0.85, [cx - 7, cy - 8, cx + 7, cy + 8]); });
    /* marcas das barras */
    vis.forEach(function (m) { var sg = recorta([X(m.a[0]), Y(m.a[1])], [X(m.b[0]), Y(m.b[1])], J); if (!sg) return; var wb = larguraVista(m, [0, 0, 1]) / 1000 * s; if (!rotuloLongo(D, sg[0], sg[1], m.marca, T.perfil, wb, J)) rotuloBarra(D, sg[0], sg[1], m.marca, T.perfil * 0.9, { raio: 5, J: J }); });
    /* cotas: painéis do banzo inferior (cadeia embaixo) e alturas no apoio e na cumeeira */
    var biM = vis.filter(function (m) { return m.cls.pre === "BI"; })[0];
    function naBI(P) { if (!biM) return Math.abs(P[1] - ori[1]) < 0.003; var dx = biM.b[0] - biM.a[0], dy = biM.b[1] - biM.a[1], L = hip(dx, dy); return Math.abs((P[0] - biM.a[0]) * dy - (P[1] - biM.a[1]) * dx) / L < 0.005; }
    var yBaixo = Y(y0r) + 12;
    var bi = nos.filter(naBI).map(function (P) { return P[0]; });
    if (bi.length > 1) D.cadeia(bi.map(function (x) { return [X(x), yBaixo]; }), 0, bi.slice(1).map(function (x, k) { return String(rmm(x - bi[k])); }), {});
    var esq = nos.filter(function (P) { return Math.abs(P[0] - ori[0]) < 0.003; }).map(function (P) { return P[1]; }).sort(function (q, w) { return q - w; });
    if (esq.length > 1) D.cota(X(ori[0]) - 14, Y(esq[0]), X(ori[0]) - 14, Y(esq[esq.length - 1]), 0, String(rmm(esq[esq.length - 1] - esq[0])), { foraSeUnico: true });
    if (sim) { var cum = nos.filter(function (P) { return Math.abs(P[0] - xm) < 0.01; }).map(function (P) { return P[1]; }).sort(function (q, w) { return q - w; }); if (cum.length > 1) D.cota(X(xm) + 12, Y(cum[0]), X(xm) + 12, Y(cum[cum.length - 1]), 0, String(rmm(cum[cum.length - 1] - cum[0])), { foraSeUnico: true }); }
    /* inclinação */
    var bs = vis.filter(function (m) { return m.cls.pre === "BS"; })[0];
    if (bs) { var inc = Math.abs((bs.b[1] - bs.a[1]) / (bs.b[0] - bs.a[0] || 1)) * 100; D.textoLivre([X(x0r) + 60, Y(y1r) - 12], "INCLINAÇÃO " + c.br(inc, 1) + " %", T.nota, [X(x0r) + 10, Y(y1r) - 26, X(x0r) + 160, Y(y1r) - 4]); }
    blocoGr(D, iTe, "TESOURA", esc, a.x, a.y + 10, a.w, Y(y0r) + 30 - a.y - 10);
    /* TABELAS (letra de 3 mm, linha de 6 mm: legíveis impressas) e, ao lado, as AMPLIAÇÕES do apoio e da cumeeira a 1:10 */
    var yT = Y(y0r) + 32, xT = a.x + 4, OT = { fs: 3.0, fsc: 3.2, hl: 6.0 };
    var ln = nos.map(function (P, i) { return [String(i), String(rmm(P[0] - ori[0])), String(rmm(P[1] - ori[1]))]; });
    var porBloco = Math.max(5, Math.floor((a.y + a.h - yT - 22) / 6.0)), cn = [{ t: "NÓ", w: 14 }, { t: "X (mm)", w: 24 }, { t: "Y (mm)", w: 24 }];
    A.tituloVista(D, xT, yT - 2, "COORDENADAS DOS NÓS", null);
    var x0T = xT;
    var yTabFim = yT;
    for (var k = 0; k < ln.length; k += porBloco) { var tc = D.tabela(xT, yT + 7, cn, ln.slice(k, k + porBloco), OT); yTabFim = Math.max(yTabFim, yT + 7 + num(tc && tc.h, (Math.min(porBloco, ln.length - k) + 1) * 6)); xT += 62 + 4; }
    xT = Math.max(xT, x0T + largT("COORDENADAS DOS NÓS", T.titulo) + 6) + 6;
    var t = tr.conjTipos.filter(function (q) { return ms[0] && q.marca === ms[0].conjunto; })[0];
    if (t) {
      var lb = Object.keys(t.comp).sort(natural).map(function (mk) { var g = gPorMarca(tr, mk); return [mk, g.desc, c.perfil(g.perfil), String(g.Lmm), String(t.comp[mk])]; });
      A.tituloVista(D, xT, yT - 2, "BARRAS DA TESOURA " + t.marca + " (QUANTIDADE POR TESOURA)", null);
      var cb = [{ t: "MARCA", w: 18 }, { t: "DESCRIÇÃO", w: 44, al: "E" }, { t: "PERFIL", w: 54, al: "E" }, { t: ["COMPR.", "(mm)"], w: 20 }, { t: "QUANT.", w: 18 }];
      var tb = D.tabela(xT, yT + 7, cb, lb, OT);
      yTabFim = Math.max(yTabFim, yT + 7 + tb.h + 5 + D.textos(xT, yT + 7 + tb.h + 5, ["COMPRIMENTO PELO EIXO (NÓ A NÓ). PONTAS DAS BARRAS DA ALMA RECORTADAS NO ENCONTRO COM O BANZO (BOCA DE LOBO).", (d.r && d.r.nosChapa && arr(d.r.nosChapa.nos).length ? { t: "SOLDA DOS NÓS: DIMENSIONADA NÓ A NÓ (" + d.r.nosChapa.n + " NÓS, " + d.r.nosChapa.reprovados + " REPROVADO(S)) - O QUE GOVERNA NO DETALHE 2 (FOLHA " + c.numFolha("detalhes") + "); TODOS NO MEMORIAL.", attr: ' data-dimensionada="noChapa"' } : { t: "SOLDA DOS NÓS: A DIMENSIONAR (VER NOTA 4).", cor: VERMELHO })], T.nota, { wmax: 154 }));
      xT += Math.max(154, largT("BARRAS DA TESOURA " + t.marca + " (QUANTIDADE POR TESOURA)", T.titulo)) + 10;
    }
    var msA = membrosPortico(d, p, ["COL", "TES"]), wA = (a.x + a.w - xT - 6) / 2, hA = a.y + a.h - yT + 2;
    /* 22/11/2026 — a metade de baixo da folha ficava vazia (A e B lado a lado a 1:15 numa faixa estreita): a ampliação do APOIO
       ocupa toda a largura à direita das tabelas (sai em 1:5 quando cabe) e a da CUMEEIRA vai para baixo das tabelas */
    var wB = xT - (a.x + 4) - 8, yB = yTabFim + 10, hB = a.y + a.h - yB;
    if (sim && wB > 120 && hB > 110 && a.x + a.w - xT - 6 > 150) {
      ampliacao(D, d, c, msA, xT, yT - 2, a.x + a.w - xT - 6, hA, "A", "AMPLIAÇÃO DO APOIO (NÓS 0 A 3)", [x0r - 0.25, y0r - 0.1, x0r + 0.95, (esq.length > 1 ? esq[esq.length - 1] : y0r + 1.35) + 0.15], null, [5, 10, 15, 20]);   /* janela até 150 mm acima do nó 1 (cabe em 1:5) */
      ampliacao(D, d, c, msA, a.x + 4, yB, wB, hB, "B", "AMPLIAÇÃO DA CUMEEIRA", [xm - 0.75, y1r - 1.65, xm + 0.75, y1r + 0.15], null, [5, 10, 15, 20]);
    } else if (wA > 90) {
      ampliacao(D, d, c, msA, xT, yT - 2, wA, hA, "A", "AMPLIAÇÃO DO APOIO (NÓS 0 A 3)", [x0r - 0.25, y0r - 0.15, x0r + 0.95, y0r + 1.6], null, [10, 15, 20]);
      if (sim) ampliacao(D, d, c, msA, xT + wA + 6, yT - 2, wA, hA, "B", "AMPLIAÇÃO DA CUMEEIRA", [xm - 0.75, y1r - 1.65, xm + 0.75, y1r + 0.15], null, [10, 15, 20]);
    }
    return { escala: "1:" + esc };
  }
  function gPorMarca(tr, mk) { for (var i = 0; i < tr.marcas.length; i++) if (tr.marcas[i].marca === mk) return tr.marcas[i]; return {}; }

  /* ================================================================ 05 — ELEVAÇÕES LONGITUDINAIS (onde há contraventamento) */
  function planosContravento(d) {
    var cv = d.membros.filter(function (m) { return m.cls.pre === "CV" || m.cls.pre === "CVT"; }), pl = [];
    cv.forEach(function (m) {
      if (Math.abs(m.a[0] - m.b[0]) > 0.05) return;   /* plano x = const */
      var x = m.a[0], g = pl.filter(function (q) { return Math.abs(q.x - x) < 0.05; })[0];
      if (!g) pl.push(g = { x: x, n: 0 }); g.n++;
    });
    pl.sort(function (q, w) { return q.x - w.x; });
    /* assinatura do plano: marca + posição de cada peça — planos iguais viram UMA elevação com a lista das posições */
    var grupos = [];
    pl.forEach(function (q) {
      var ms = d.membros.filter(function (m) { return Math.abs(m.a[0] - q.x) < 0.05 && Math.abs(m.b[0] - q.x) < 0.05; });
      var ass = ms.map(function (m) { return m.marca + "@" + Math.round(Math.min(m.a[2], m.b[2]) * 10) + "/" + Math.round(Math.min(m.a[1], m.b[1]) * 10); }).sort().join(",");
      var g = grupos.filter(function (w) { return w.ass === ass; })[0];
      if (g) g.iguais.push(q.x); else grupos.push({ x: q.x, ass: ass, iguais: [q.x], n: q.n });
    });
    return grupos;
  }
  function folhaElevacoes(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, A = AP(), pl = planosContravento(d), E = eixosGalpao(d);
    var Lz = d.caixa.z1 - d.caixa.z0, n = Math.max(1, pl.length);
    var alt = pl.map(function (q) { var ys = []; d.membros.forEach(function (m) { if (Math.abs(m.a[0] - q.x) < 0.05 && Math.abs(m.b[0] - q.x) < 0.05) ys.push(m.a[1], m.b[1]); }); return { y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) }; });
    var cols2 = 1, esc = 200;
    ESC("elevacaoLong").some(function (o) {
      var s0 = 1000 / o[1], lin = Math.ceil(n / o[0]), hh = 0;
      for (var r0 = 0; r0 < lin; r0++) { var mxh = 0; for (var c0 = 0; c0 < o[0]; c0++) { var q = alt[r0 * o[0] + c0]; if (q) mxh = Math.max(mxh, (q.y1 - q.y0) * s0); } hh += mxh + 56; }
      if (Lz * s0 + 60 <= (a.w - 8) / o[0] && hh <= a.h - 4) { cols2 = o[0]; esc = o[1]; return true; } return false;
    });
    var s = 1000 / esc, cw = (a.w - 8) / cols2, yRow = a.y + 2, hRow = 0;
    pl.forEach(function (q, i) {
      var cI = i % cols2; if (cI === 0 && i) { yRow += hRow; hRow = 0; }
      var H = alt[i].y1 - alt[i].y0; hRow = Math.max(hRow, H * s + 56);
      var yy = yRow, base = yy + 24 + H * s, x0 = a.x + 40 + cI * cw;
      function X(z) { return x0 + (z - d.caixa.z0) * s; }
      function nomePl(x) { var lx = E.x.filter(function (e) { return Math.abs(e.c - x) < 0.05; })[0]; return lx ? "LINHA " + lx.nome : (x - E.x[0].c <= (E.x[E.x.length - 1].c - E.x[0].c) / 2 + 0.01 ? E.x[0].nome + "+" + rmm(x - E.x[0].c) : E.x[E.x.length - 1].nome + "-" + rmm(E.x[E.x.length - 1].c - x)); }
      var nome = q.iguais.map(nomePl).join(", "), yb0 = alt[i].y0;
      function Y(y) { return base - (y - yb0) * s; }
      A.tituloVista(D, x0 - 36, yy, "ELEVAÇÃO LONGITUDINAL - " + (q.iguais.length > 1 ? "PLANOS " : "PLANO ") + nome, "ESC 1:" + esc + (q.iguais.length > 1 ? " - " + q.iguais.length + " PLANOS IGUAIS (POSIÇÃO EM mm A PARTIR DO EIXO)" : ""));
      var iEl = D.s.length;
      var ms = d.membros.filter(function (m) { return Math.abs(m.a[0] - q.x) < 0.05 && Math.abs(m.b[0] - q.x) < 0.05; });
      ms.forEach(function (m) {
        var cam = (m.cls.conj === "CTV") ? "MET-CONTRAVENTO" : (m.cls.conj === "ESC" || m.cls.conj === "TER" ? "MET-SECUNDARIO" : (m.cls.conj === "COR" ? "MET-OCULTA" : "MET-PRINCIPAL"));
        D.linha(X(m.a[2]), Y(m.a[1]), X(m.b[2]), Y(m.b[1]), cam);
      });
      E.z.forEach(function (e) { var xx = X(e.c), r = D.raioBalao(e.nome); D.linha(xx, base + 3, xx, base + 20 - r, "MET-EIXO"); D.balao(xx, base + 20, e.nome); });
      var feitos = {};
      ms.filter(function (m) { return m.cls.conj === "CTV" || m.cls.conj === "ESC"; }).forEach(function (m) {
        var k = m.marca + "|" + Math.round(Math.min(m.a[2], m.b[2])); if (feitos[k]) return; feitos[k] = 1;
        var p1 = [X(m.a[2]), Y(m.a[1])], p2 = [X(m.b[2]), Y(m.b[1])];
        if (!rotuloBarra(D, p1, p2, m.marca, T.perfil * 0.9, { raio: 4 }) && m.cls.conj === "CTV") rotuloBarra(D, [p1[0] + (p2[0] - p1[0]) * 0.2, p1[1] + (p2[1] - p1[1]) * 0.2], [p1[0] + (p2[0] - p1[0]) * 0.3, p1[1] + (p2[1] - p1[1]) * 0.3], m.marca, T.perfil * 0.9, { raio: 8 });
      });
      /* vãos entre pórticos (cadeia) entre a elevação e os balões */
      var zsE = E.z.map(function (e) { return e.c; });
      if (zsE.length > 1) D.cadeia(zsE.map(function (z) { return [X(z), base + 7]; }), 0, zsE.slice(1).map(function (z, k) { return String(rmm(z - zsE[k])); }), {});
      var ys = []; ms.forEach(function (m) { [m.a[1], m.b[1]].forEach(function (y) { if (ys.every(function (w) { return Math.abs(w - y) > 0.05; })) ys.push(y); }); });
      ys.sort(function (q2, w) { return q2 - w; });
      var yN = [ys[0], ys[ys.length - 1]];
      yN.forEach(function (y) { D.nivel(x0 - 14, Y(y), c.nivel(y), -1); });
      blocoGr(D, iEl, "ELEV-LONG-" + (i + 1), esc, x0 - 36, yy + 8, Lz * s + 60, H * s + 48);
    });
    if (!pl.length) D.textos(a.x + 4, a.y + 20, ["NENHUM PLANO VERTICAL COM CONTRAVENTAMENTO NO MODELO"], T.nota, {});
    return { escala: "1:" + esc };
  }

  /* ================================================================ LIGAÇÕES DIMENSIONADAS (js/metalligdim.js, r.ligDim — 1.2.429)
     21/11/2026 (pedido do Rogério: a prancha dos pórticos no mesmo padrão da do galpão): os detalhes desenham o que o cálculo
     DIMENSIONOU — placa, chumbador, clip, parafusos, enrijecedor, escora passante, mão-francesa na terça — e o grupo SVG de cada
     detalhe leva data-dimensionada="<tipo>" (o que não tem resultado continua "A DIMENSIONAR", em vermelho). Nada inventado: só
     a forma em planta da placa da coluna segue a MESMA regra do 3D (js/metalligacao.js placaBaseColuna: balanço 75 mm em volta do
     montante, chumbador fora da seção com a folga da arruela e a borda da Tabela 14). */
  function ligDimDe(d) {
    if (d._ligDim !== undefined) return d._ligDim;
    var LD = d.r && d.r.ligDim, out = null;
    if (LD && arr(LD.ligacoes).length) {
      var pm = {}; arr(d.r.modelo && d.r.modelo.membros).forEach(function (m) { pm[m.id] = m; });
      var dm = {}; d.membros.forEach(function (m) { dm[m.id] = m; });
      out = { LD: LD, porTipo: {}, modelo: pm, desenho: dm };
      arr(LD.ligacoes).forEach(function (l) {
        var mm = pm[l.membro] || {}, gr = (mm.calc && mm.calc.grupoTip) || "", md = dm[l.membro];
        var cat = l.tipo === "placaColuna" ? "placaColuna" : l.tipo === "placaBase" ? "placaBase" : l.tipo === "clip" ? "clip" : l.tipo === "almaU" ? "almaU"
          : l.tipo === "barra" ? (gr === "corrente" ? "corrente" : "contravento") : gr === "maoFrancesa" ? "maoFrancesa" : (gr === "escora" || gr === "escoraColuna") ? (l.passante ? "escoraPassante" : "escoraChapa")
          : gr === "tapamento" ? "tapamento" : l.tipo === "soldaMF" ? "maoFrancesa" : "outra";
        var vs = out.porTipo[cat] = out.porTipo[cat] || [], k = ligCurto(cat, l);
        var g = vs.filter(function (q) { return q.chave === k; })[0];
        if (!g) vs.push(g = { chave: k, l: l, n: 0, marcas: [], ok: true, razao: 0 });
        g.n++; if (!l.ok) g.ok = false;
        if (l.razao > g.razao) { g.razao = l.razao; g.l = l; }
        var mk = md && md.marca; if (mk && g.marcas.indexOf(mk) < 0) g.marcas.push(mk);
      });
      /* a variante que governa primeiro (a de maior razão) */
      Object.keys(out.porTipo).forEach(function (k) { out.porTipo[k].sort(function (q, w) { return w.razao - q.razao; }); });
    }
    d._ligDim = out;
    return out;
  }
  function catTxt(c) { return String(c || "").replace(/X/g, " x ").replace(/^L(\d)/, "L $1").replace(/(\d)\.(\d)/g, "$1,$2"); }
  /* as variantes do cálculo numa linha (até 3; o resto vai para o quadro das ligações) */
  function variantes(vs, fn) {
    if (vs.length < 2) return "";
    return "VARIANTES DO CÁLCULO: " + vs.slice(0, 3).map(function (g) { return fn(g) + " (" + g.n + ")"; }).join("; ") + (vs.length > 3 ? "; E MAIS " + (vs.length - 3) + " NO QUADRO DAS LIGAÇÕES" : "") + ".";
  }
  function ligVar(d, cat) { var L = ligDimDe(d); return L && L.porTipo[cat] ? L.porTipo[cat] : []; }
  /* grupo SVG do detalhe dimensionado: tudo o que foi desenhado desde i0 */
  function grupoDim(D, i0, tipo, vs) {
    var lig = vs.map(function (g) { return g.l.nome; }).slice(0, 6).join(" | ").replace(/[&<>"]/g, function (q) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[q]; });
    D.s.splice(i0, 0, '<g data-dimensionada="' + tipo + '" data-lig="' + lig + '" data-razao="' + (vs.length ? Math.round(vs[0].razao * 1000) / 1000 : "") + '">');
    D.s.push("</g>");
  }
  function mmBr(v, c) { var x = Math.round(num(v, 0) * Math.pow(10, c || 0)) / Math.pow(10, c || 0); return String(x).replace(".", ","); }
  /* a placa da peça na base (modelo de r.ligDim.modelo.placas, chave = a coluna do gerador) — o texto do quadro de bases */
  function placaDaPeca(d, membroId) {
    var L = ligDimDe(d); if (!L) return null;
    var m = L.modelo[membroId]; if (!m || !m.calc) return null;
    var ck = m.calc.coluna || ("b:" + (m.calc.barraId || m.id)), P = L.LD.modelo && L.LD.modelo.placas ? L.LD.modelo.placas[ck] : null;
    if (!P) return null;
    return "t " + mmBr(P.t * 1000, 1) + " + " + P.nChumb + " Ø " + P.parafuso;
  }
  /* o nó de chapa (js/metalchapano.js, r.nosChapa) que governa entre os que têm a peça principal numa das classes */
  function noChapaDe(d, pres, filtroP) {
    var nc = d.r && d.r.nosChapa, dm = {}, best = null, NI = (d.r && d.r.modelo && d.r.modelo.noInfo) || {}; if (!nc) return null;
    d.membros.forEach(function (m) { dm[m.id] = m; });
    arr(nc.nos).forEach(function (o) {
      var p = dm[o.principal]; if (!p || pres.indexOf(p.cls.pre) < 0 || !arr(o.barras).length) return;
      if (filtroP && !(NI[o.no] && filtroP(NI[o.no].P))) return;
      var rz = 0; arr(o.barras).forEach(function (b) { if (b.razao > rz) rz = b.razao; });
      if (o.chapa && o.chapa.razao > rz) rz = o.chapa.razao;
      if (!best || rz > best.rz) best = { o: o, rz: rz, p: p };
    });
    return best;
  }
  function linhasNo(d, nb) {
    var dm = {}; d.membros.forEach(function (m) { dm[m.id] = m; });
    var o = nb.o, L = [o.chapa && o.chapa.tg ? "CHAPA DE NÓ " + mmBr(o.chapa.tg, 1) + " x " + o.chapa.Lg + " mm (ASTM A36) - O NÓ QUE GOVERNA (" + o.no + ")" : "BARRAS SOLDADAS DIRETO NA PEÇA PRINCIPAL (SEM CHAPA DE NÓ) - O NÓ QUE GOVERNA (" + o.no + ")"];
    var vs = {}, sold = [];
    arr(o.barras).forEach(function (b) { var mk = (dm[b.id] && dm[b.id].marca) || b.id, k = mk + ": " + b.dw + " mm x " + b.Lw + " mm"; if (!vs[k] && b.dw) { vs[k] = 1; sold.push(k); } });
    if (sold.length) L.push("SOLDA DE FILETE (PERNA x COMPRIMENTO DE CADA FILETE) - " + sold.join("; ") + ".");
    L.push("RAZÃO MÁXIMA " + mmBr(nb.rz, 2) + " - DIMENSIONADO PELA NBR 8800:2008 (VER O MEMORIAL).");
    return L;
  }
  /* a forma da placa ÚNICA da coluna treliçada (mm, no plano do pórtico): a mesma regra do js/metalligacao.js placaBaseColuna */
  function placaColGeo(bf, bn, l) {
    var Nn = global.BimMetalNorma || (typeof require === "function" ? (function () { try { return require("./metalnorma.js"); } catch (e) { return null; } })() : null);
    var Pn = Nn && Nn.parafuso ? Nn.parafuso(l.chumbador) : null, dCh = num(l.d, Pn ? Pn.d : 19.05);
    var folga = (Pn ? Pn.arr.d2 / 2 : 1.2 * dCh) + 5, e = Nn && Nn.bordaMin ? Math.ceil(Nn.bordaMin(dCh, "laminada").e / 5 - 1e-9) * 5 : 2 * dCh, bal = 75;
    var hxF = larguraVista(bf, [0, 0, 1]) / 2, hxN = larguraVista(bn, [0, 0, 1]) / 2, hz = Math.max(larguraVista(bf, [1, 0, 0]), larguraVista(bn, [1, 0, 0])) / 2;
    var xF = bf.a[0] * 1000, xN = bn.a[0] * 1000, sg = xN >= xF ? 1 : -1;
    var chF = xF - sg * (hxF + folga), chN = xN + sg * (hxN + folga);
    var xs = [xF - hxF - bal, xF + hxF + bal, xN - hxN - bal, xN + hxN + bal, chF - e, chF + e, chN - e, chN + e];
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), B = Math.ceil((x1 - x0) / 10 - 1e-9) * 10, Lz = Math.ceil(2 * Math.max(hz + bal, e) / 10 - 1e-9) * 10;
    x0 = (x0 + x1) / 2 - B / 2;
    return { x0: x0, B: B, L: Lz, xF: xF, xN: xN, hxF: hxF, hxN: hxN, hz: hz, ch: [chF, chN], d: dCh, e: e };
  }

  /* 23/11/2026 (Estância Montalvão, print do Rogério): a prática da metalúrgica — dorso (alma) dos dois U para FORA, abas para DENTRO */
  var NOTA_U = "COLUNA EM 2 U: ALMA (DORSO) DOS DOIS U VOLTADA PARA FORA DA COLUNA E ABAS PARA DENTRO, UMA DE FRENTE PARA A OUTRA; TRAVEJAMENTO, DIAGONAIS E CHAPAS DE NÓ ENTRAM ENTRE AS ABAS E SÃO SOLDADOS POR DENTRO (FACE EXTERNA LIMPA).";
  /* 23/11/2026 (revisão de cálculo): o ponto de trabalho do travejamento é o CG do U — a cota xg da face externa da alma vai na nota
     (contorno de parede fina: alma bw·t em t/2 e as duas abas (bf − t)·t no meio delas) */
  function notaU(m) {
    var q = dimSec(m).s || {}, bw = num(q.bw, 0), bf = num(q.bf, 0), t = num(q.t, 0); if (!(bw > 0 && bf > 0 && t > 0)) return NOTA_U;
    var A1 = bw * t, A2 = 2 * (bf - t) * t, xg = (A1 * t / 2 + A2 * (t + (bf - t) / 2)) / (A1 + A2);
    return NOTA_U + " LINHAS DE TRABALHO DO TRAVEJAMENTO NO CG DE CADA U: " + Math.round(xg) + " mm DA FACE EXTERNA DA ALMA (A LARGURA DA COLUNA NAS COTAS É ENTRE OS CG).";
  }
  /* ================================================================ 06 — DETALHES TÍPICOS */
  function secaoDesenho(D, m, cx, cy, s, o) {
    o = o || {};
    var ds = dimSec(m), q = ds.s, t = num(q.t, 2) * s, h = ds.hy * s, b = ds.bz * s;
    if (ds.forma === "circ") { D.circ(cx, cy, Math.max(0.5, ds.hy / 2 * s), "MET-PERFIL-CORTE"); return [ds.hy * s, ds.hy * s]; }
    if (ds.forma === "tubo") { D.ret(cx - b / 2, cy - h / 2, b, h, "MET-PERFIL-CORTE"); D.ret(cx - b / 2 + t, cy - h / 2 + t, b - 2 * t, h - 2 * t, "MET-PERFIL-CORTE"); return [b, h]; }
    if (ds.forma === "L" || ds.forma === "2L") {
      var aL = num(q.a, 50) * s, bL = num(q.b, 50) * s, eL = (ds.forma === "2L" ? num(q.e, 8) : 0) * s, tL = Math.max(num(q.t, 4) * s, 0.15), Wt = ds.forma === "2L" ? 2 * aL + eL : aL;
      var PL = [[0, 0], [aL, 0], [aL, tL], [tL, tL], [tL, bL], [0, bL]];   /* aba vertical à esquerda, aba horizontal para a direita */
      function polL(xo, esp) { D.poli(PL.map(function (p) { return [cx - Wt / 2 + xo + (esp ? aL - p[0] : p[0]), cy - bL / 2 + p[1]]; }), "MET-PERFIL-CORTE", true); }
      if (ds.forma === "2L") { polL(0, true); polL(aL + eL, false); } else polL(0, false);
      return [Wt, bL];
    }
    /* U / Ue: alma vertical à esquerda, mesas para a direita, enrijecedor para dentro */
    var P = [[0, 0], [b, 0], [b, t], [t, t], [t, h - t], [b, h - t], [b, h], [0, h]];
    if (ds.forma === "Ue") { var D2 = num(q.D, 0) * s; P = [[0, 0], [b, 0], [b, D2], [b - t, D2], [b - t, t], [t, t], [t, h - t], [b - t, h - t], [b - t, h - D2], [b, h - D2], [b, h], [0, h]]; }
    D.poli(P.map(function (p) { return [cx - b / 2 + p[0], cy - h / 2 + p[1]]; }), "MET-PERFIL-CORTE", true);
    return [b, h];
  }
  /* ================================================================ DETALHES EM ESCALA (21/11/2026 — o nível dos detalhes do galpão)
     Pedido do Rogério: os detalhes 1, 2, 3 e 7 a 11 da treliça no padrão de js/acopranchas.js (det1Base, detLigacaoTopo, det4Clip):
     barras cortadas perto do nó com a linha de interrupção, chapa na pena de corte, furos e parafusos com eixo, cotas de borda e de
     passo, símbolo de solda AWS A2.4 com a perna, chamadas com leader alinhadas numa coluna à direita e escala real 1:5 ou 1:10.
     Antes eram ampliações do pórtico (um X de barras sem hierarquia) e esquemas SEM ESCALA. Os números vêm do cálculo
     (r.nosChapa, r.ligDim); o que o cálculo não dá sai de regra escrita na nota do detalhe, nunca inventado. */
  /* data-detalhe/data-escala em cada desenho (o mesmo contrato do js/concpranchas.js abreDetalhe): a tela e o DXF acham o desenho e a escala dele */
  function blocoDet(D, i0, id, esc, x, y, w, h) { function n2(v) { return String(Math.round(v * 100) / 100); } D.s.splice(i0, 0, '<g data-detalhe="' + id + '" data-escala="1:' + esc + '" data-x="' + n2(x) + '" data-y="' + n2(y) + '" data-w="' + n2(w) + '" data-h="' + n2(h) + '">'); D.s.push("</g>"); }
  /* data-bloco/data-escala nos desenhos GRANDES (o mesmo contrato do js/concpranchas.js abreBloco e do js/arqcad.js): o DXF separa cada desenho
     do papel num bloco com a escala dele. Chamar com i0 = D.s.length ANTES de desenhar, depois de desenhar */
  function blocoGr(D, i0, id, esc, x, y, w, h) { function n2(v) { return String(Math.round(v * 100) / 100); } D.s.splice(i0, 0, '<g data-bloco="' + id + '" data-escala="1:' + esc + '" data-x="' + n2(x) + '" data-y="' + n2(y) + '" data-w="' + n2(w) + '" data-h="' + n2(Math.max(1, h)) + '">'); D.s.push("</g>"); }
  function escDet(wmm, hmm, wp, hp) {
    var L = [5, 10].concat(ESC("detalhe").filter(function (e) { return e > 10; }));
    for (var i = 0; i < L.length; i++) if (wmm / L[i] <= wp && hmm / L[i] <= hp) return L[i];
    return L[L.length - 1];
  }
  function pfDe(id) { var Nn = global.BimMetalNorma || (typeof require === "function" ? (function () { try { return require("./metalnorma.js"); } catch (e) { return null; } })() : null); return Nn && Nn.parafuso ? Nn.parafuso(id) : null; }
  /* moldura de um detalhe: o papel da célula, a coluna de chamadas à direita e a escala que cabe; ext = [x0, y0, x1, y1] em mm */
  function moldaDet(cl, cw, chh, ext, wCol, hNotas) {
    var wD = cw - wCol - 12, hD = chh - 18 - hNotas, esc = escDet(ext[2] - ext[0], ext[3] - ext[1], wD, hD), k = 1 / esc;
    var ox = cl.x + 6 + (wD - (ext[2] - ext[0]) * k) / 2 - ext[0] * k, oy = cl.y + 16 + (hD - (ext[3] - ext[1]) * k) / 2 + ext[3] * k;
    return { esc: esc, k: k, F: function (x, y) { return [ox + x * k, oy - y * k]; }, xCol: cl.x + 6 + wD + 6, yFim: oy - ext[1] * k, yIni: oy - ext[3] * k, x1: ox + ext[2] * k };
  }
  /* barra pelo contorno (largura w, mm) de A a B (mm locais), com o eixo; t0 = [recuo do lado +, do lado -] no início
     (boca de lobo); o.quebra = linha de interrupção em B; o.fecha = traço de topo em A */
  function barraDet(D, F, A, B, w, o) {
    o = o || {};
    var L = hip(B[0] - A[0], B[1] - A[1]); if (L < 1) return;
    var u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], nv = [-u[1], u[0]], h = w / 2, t0 = o.t0 || [0, 0], fim = [];
    [1, -1].forEach(function (sd, i) {
      var p = F(A[0] + nv[0] * h * sd + u[0] * t0[i], A[1] + nv[1] * h * sd + u[1] * t0[i]), q = F(B[0] + nv[0] * h * sd, B[1] + nv[1] * h * sd);
      D.linha(p[0], p[1], q[0], q[1], o.cam || "MET-PERFIL"); fim.push(q);
    });
    if (o.fecha) { var f1 = F(A[0] + nv[0] * h, A[1] + nv[1] * h), f2 = F(A[0] - nv[0] * h, A[1] - nv[1] * h); D.linha(f1[0], f1[1], f2[0], f2[1], o.cam || "MET-PERFIL"); }
    if (o.quebra) D.quebra(fim[0][0], fim[0][1], fim[1][0], fim[1][1]);
    if (o.eixo !== false) { var e0 = F(A[0], A[1]), e2 = F(B[0] + u[0] * 20, B[1] + u[1] * 20); (D._eixosDet = D._eixosDet || []).push([e0, e2]); }
  }
  /* os eixos dos detalhes, desenhados por último e interrompidos onde passam textos (cota, chamada) — o eixo nunca corta um número */
  function eixosDet(D) {
    arr(D._eixosDet).forEach(function (sg) {
      var p = sg[0], q = sg[1], L = hip(q[0] - p[0], q[1] - p[1]); if (L < 0.1) return; var corte = [];
      D.tb.forEach(function (t) { var r = recorta(p, q, [t[0] - 0.5, t[1] - 0.5, t[2] + 0.5, t[3] + 0.5]); if (r) corte.push([hip(r[0][0] - p[0], r[0][1] - p[1]) / L, hip(r[1][0] - p[0], r[1][1] - p[1]) / L]); });
      corte.sort(function (a, b) { return a[0] - b[0]; }); var t0 = 0;
      corte.concat([[1, 1]]).forEach(function (c2) { if (c2[0] > t0 + 1e-3) D.linha(p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0, p[0] + (q[0] - p[0]) * c2[0], p[1] + (q[1] - p[1]) * c2[0], "MET-EIXO"); t0 = Math.max(t0, c2[1]); });
    });
    D._eixosDet = [];
  }
  /* chamadas alinhadas numa coluna (x fixo), na ordem da altura do ponto, sem uma cobrir a outra; itens = [{ p: [x, y] papel, l: [...] }] */
  function colunaCham(D, xCol, itens, h, yMin) {
    var lh = h * 1.45, y0 = yMin == null ? -1e9 : yMin;
    function arranjo(ord) {
      var y = y0;
      return ord.map(function (it) { var nL = arr(it.l).filter(function (q) { return q && (typeof q === "object" ? q.t : q); }).length, ty = Math.max(it.p[1], y + nL * lh + 0.9);
        /* a linha de chamada não passa por cima de texto já escrito (cota, solda): desce o patamar até sair dele (até 24 mm) */
        for (var dt = 0; dt < 48 && D.cortaTexto(it.p[0], it.p[1], xCol, ty); dt++) ty += 0.5;
        y = ty + 1.2; return { it: it, ty: ty }; });
    }
    function cruza(a, b) {
      var p = a.it.p, q = [xCol, a.ty], r = b.it.p, s = [xCol, b.ty];
      function o(A, B, C) { return (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); }
      return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
    }
    /* a ordem da altura do ponto; se duas linhas de chamada se cruzam, troca as duas na coluna (no máximo n² trocas) */
    var ord = itens.slice().sort(function (q, w) { return q.p[1] - w.p[1]; }), ar = arranjo(ord), n = ord.length;
    for (var k = 0; k < n * n; k++) {
      var tr0 = null;
      for (var i = 0; i < n && !tr0; i++) for (var j = i + 1; j < n && !tr0; j++) if (cruza(ar[i], ar[j])) tr0 = [i, j];
      if (!tr0) break;
      var o2 = ord.slice(); o2[tr0[0]] = ord[tr0[1]]; o2[tr0[1]] = ord[tr0[0]];
      var a2 = arranjo(o2), nc = function (A) { var c2 = 0; for (var i2 = 0; i2 < n; i2++) for (var j2 = i2 + 1; j2 < n; j2++) if (cruza(A[i2], A[j2])) c2++; return c2; };
      if (nc(a2) >= nc(ar)) break;
      ord = o2; ar = a2;
    }
    var y = y0;
    ar.forEach(function (q) { D.chamada(q.it.p[0], q.it.p[1], xCol, q.ty, q.it.l, { h: h, dir: 1 }); y = q.ty + 1.2; });
    return y;
  }
  /* as peças do pórtico que passam pelo ponto P (m, plano do pórtico): cada sentido que sai do nó, com o comprimento disponível (mm) */
  function pecasNo(ms, P) {
    var out = [];
    ms.forEach(function (m) {
      var ax = m.a[0], ay = m.a[1], bx = m.b[0], by = m.b[1], L = hip(bx - ax, by - ay); if (L < 0.01) return;
      var ux = (bx - ax) / L, uy = (by - ay) / L, t = (P[0] - ax) * ux + (P[1] - ay) * uy, dn = Math.abs((P[0] - ax) * uy - (P[1] - ay) * ux);
      if (dn > 0.006 || t < -0.006 || t > L + 0.006) return;
      if (t > 0.006) out.push({ m: m, u: [-ux, -uy], L: t * 1000 });
      if (t < L - 0.006) out.push({ m: m, u: [ux, uy], L: (L - t) * 1000 });
    });
    return out;
  }
  /* solda de filete (AWS A2.4) com a perna, tentando os lados até achar lugar livre */
  function soldaDet(D, p, ang, perna, comp, o) {
    o = o || {};
    function cfg(a) { return { ang: a, ls: o.ls || 8, lr: 13, esquerda: Math.cos(a * Math.PI / 180) < -0.01 }; }
    var angs = [ang, ang + 180, -45, -135, 45, 135, -70, -110], lista = angs.map(cfg).concat(angs.map(function (a) { var q = cfg(a); q.ls = 15; return q; })).concat(angs.map(function (a) { var q = cfg(a); q.ls = 22; return q; })), c0 = lista[0];
    D.solda(p[0], p[1], c0.ang, { perna: String(perna), lados: o.lados || "ambos", comp: comp ? String(comp) : undefined, contorno: o.contorno, ls: c0.ls, lr: c0.lr, esquerda: c0.esquerda, alternativas: lista.slice(1) });
  }
  /* DETALHE DE NÓ SOLDADO (2 e 3): o nó P (m), a peça principal, as barras que chegam (cortadas a ~R mm do nó), a chapa de nó do
     cálculo (Lg ao longo da principal; hg da face de trás da principal para o lado das barras — js/metalchapano.js), a solda de
     cada barra (perna x comprimento do r.nosChapa) e as cotas da chapa a partir do eixo do nó */
  function detNo(D, c, cl, cw, chh, numero, titulo, P, ms, nb, notas) {
    var T = D.E.T, A = AP(), hn = T.nota * 0.85, o = nb ? nb.o : null, dm = {}, dmT = {}, R = 420;
    c.d.membros.forEach(function (m) { dmT[m.id] = m; });
    ms.forEach(function (m) { dm[m.id] = m; });
    var pc = pecasNo(ms, P); if (!pc.length) return null;
    var prin = o && dm[o.principal] && pc.some(function (q) { return q.m === dm[o.principal]; }) ? dm[o.principal] : pc.slice().sort(function (q, w) { return larguraVista(w.m, [0, 0, 1]) - larguraVista(q.m, [0, 0, 1]); })[0].m;
    var p0 = pc.filter(function (q) { return q.m === prin; })[0];
    var pP = pc.filter(function (q) { return q.m.cls.pre === prin.cls.pre && Math.abs(q.u[0] * p0.u[1] - q.u[1] * p0.u[0]) < 0.03; });
    var up = p0.u, np = [-up[1], up[0]], wP = larguraVista(prin, [0, 0, 1]);
    var barras = pc.filter(function (q) { return pP.indexOf(q) < 0; });
    var sd = 0; barras.forEach(function (q) { sd += q.u[0] * np[0] + q.u[1] * np[1]; }); sd = sd >= 0 ? 1 : -1;
    var ch = o && o.chapa && o.chapa.tg ? o.chapa : null;
    /* faixa da chapa no sentido normal à principal: ch.hg = projeção das soldas + a altura da principal (js/metalchapano.js); na dupla cantoneira a chapa entra entre as abas e sai hg - aba além da face; no U (aba no plano) parte da face de trás */
    var hyP = dimSec(prin).hy, cIn = -wP / 2, cOut = ch ? ch.hg - wP / 2 : 0;
    if (ch && hyP <= wP) { cOut = wP / 2 + Math.max(0, ch.hg - hyP); cIn = cOut - ch.hg; }
    /* 23/11/2026 (Estância Montalvão): no U da coluna a alma fica para FORA e as abas para DENTRO — a chapa entra entre as abas e
       parte da face INTERNA da alma (face de trás + t), não da face externa do pilar */
    var dsP = dimSec(prin), ehUP = ch && (dsP.forma === "U" || dsP.forma === "Ue");
    if (ehUP) { cIn = -wP / 2 + num(dsP.s.t, 2.65); cOut = cIn + ch.hg; }
    function L2(a, b) { return [up[0] * a + np[0] * b, up[1] * a + np[1] * b]; }
    var pts = [];
    pc.forEach(function (q) { var Lc = Math.min(q.L, pP.indexOf(q) >= 0 ? R : Math.max(R * 0.85, ch ? hip(ch.Lg / 2, ch.hg) + 90 : 0)), w = larguraVista(q.m, [0, 0, 1]) / 2; [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s2) { pts.push([q.u[0] * Lc * (s2[0] > 0 ? 1 : 0) + s2[1] * w, q.u[1] * Lc * (s2[0] > 0 ? 1 : 0) + s2[1] * w]); }); });
    if (ch) [[-1, sd * cIn], [1, sd * cIn], [1, sd * cOut], [-1, sd * cOut]].forEach(function (q) { pts.push(L2(q[0] * ch.Lg / 2, q[1])); });
    var ext = [Math.min.apply(null, pts.map(function (q) { return q[0]; })) - 45, Math.min.apply(null, pts.map(function (q) { return q[1]; })) - 45, Math.max.apply(null, pts.map(function (q) { return q[0]; })) + 45, Math.max.apply(null, pts.map(function (q) { return q[1]; })) + 45];
    ext[1] -= 90; ext[0] -= 60;   /* lugar das cotas da chapa */
    var rotP = prin.marca + " - " + c.perfil(prin.perfil), cams = {}, rotCh = ch ? "CHAPA # " + mmBr(ch.tg, 1) + " x " + ch.Lg + " x " + ch.hg : "";
    barras.forEach(function (q) { cams[q.m.marca] = q.m.marca + " - " + c.perfil(q.m.perfil); });
    var wCol = 0; [rotP, rotCh].concat(Object.keys(cams).map(function (k2) { return cams[k2]; })).forEach(function (s) { wCol = Math.max(wCol, largT(s, hn) + 6); });
    var nN = notas && notas.dim ? notas.dim.reduce(function (s, l) { return s + A.quebrar(typeof l === "object" ? l.t : l, T.nota * 0.9, cw - 4).length; }, 0) : 0;
    var M = moldaDet(cl, cw, chh, ext, wCol, nN * T.nota * 0.9 * 1.45 + 4), F = M.F, i0 = D.s.length;
    A.tituloVista(D, cl.x, cl.y, titulo, "ESC 1:" + M.esc, numero);
    if (ch) D.poli([[-1, sd * cIn], [1, sd * cIn], [1, sd * cOut], [-1, sd * cOut]].map(function (q) { var v = L2(q[0] * ch.Lg / 2, q[1]); return F(v[0], v[1]); }), "MET-PERFIL-CORTE", true);
    pP.forEach(function (q) { var Lc = Math.min(q.L, R); barraDet(D, F, [0, 0], [q.u[0] * Lc, q.u[1] * Lc], wP, { quebra: Lc < q.L - 1, fecha: pP.length === 1 }); });
    var soldas = [];   /* as soldas depois de TODAS as barras e das cotas: o lugar livre do símbolo enxerga o desenho inteiro */
    var itens = [], ja = {}, alc = ch ? hip(ch.Lg / 2, ch.hg) + 90 : 0;
    barras.forEach(function (q) {
      var w = larguraVista(q.m, [0, 0, 1]), Lc = Math.min(q.L, Math.max(R * 0.85, alc)), cu = q.u[0] * np[0] + q.u[1] * np[1], nv = [-q.u[1], q.u[0]], t0 = [0, 0];
      if (Math.abs(cu) > 0.12) [1, -1].forEach(function (s2, i) { var off = (nv[0] * np[0] + nv[1] * np[1]) * w / 2 * s2; t0[i] = Math.max(0, ((cu > 0 ? 1 : -1) * wP / 2 - off) / cu); });
      else t0 = [wP / 2, wP / 2];
      barraDet(D, F, [0, 0], [q.u[0] * Lc, q.u[1] * Lc], w, { t0: t0, quebra: Lc < q.L - 1 });
      var b = o ? arr(o.barras).filter(function (z) { return z.id === q.m.id || (dmT[z.id] && dmT[z.id].marca === q.m.marca); })[0] : null, tm = Math.min(Lc * 0.55, Math.max(t0[0], t0[1]) + num(b && b.Lw, 40) / 2);
      if (b && b.dw) { var an = Math.atan2(-q.u[1], q.u[0]) * 180 / Math.PI, ps = F(q.u[0] * tm + nv[0] * w / 2, q.u[1] * tm + nv[1] * w / 2); soldas.push(function () { soldaDet(D, ps, an - 90, b.dw, b.Lw); }); }
      if (!ja[q.m.marca]) { ja[q.m.marca] = 1; itens.push({ p: F(q.u[0] * Lc * 0.8, q.u[1] * Lc * 0.8), l: [cams[q.m.marca]] }); }
    });
    if (ch) {
      /* cotas: borda da chapa até o eixo do nó dos dois lados (passo) e o total; a altura hg */
      /* lado e afastamento da cota da chapa: o primeiro em que nenhuma barra que sai do nó passa pelos números */
      /* afastamentos de reserva (mesmo lado, mais longe; depois o outro lado): o número nunca fica em cima do contorno de uma barra —
         a cadeia (DP.cadeia o.offs) fica no primeiro em que os textos caem em lugar livre, com as linhas de chamada até lá */
      function foraOffs(of, minAbs) { var sg0 = of >= 0 ? 1 : -1, l = []; [10, 14, 19, 25, 32, 40].forEach(function (d) { if (d > Math.abs(of) && d >= (minAbs || 0)) l.push(sg0 * d); }); [6, 10, 14, 19, 25, 32].forEach(function (d) { if (d >= (minAbs || 0)) l.push(-sg0 * d); }); return l; }
      var o1u = 0;
      var hT = D.E.T.cota, cand = [];
      [-sd, sd].forEach(function (lado) { [6, 12, 18, 24].forEach(function (off) { cand.push({ lado: lado, off: off }); }); });
      function livreCota(lado, off, mids, wTxt) { var face = lado === -sd ? sd * cIn : sd * cOut, nn = face + lado * (off + hT) / M.k; return pc.every(function (q) { if (pP.indexOf(q) >= 0) return true; var un = q.u[0] * np[0] + q.u[1] * np[1]; if (un * nn <= 0 || Math.abs(un) < 0.05) return true; var tt = nn / un; if (tt > Math.min(q.L, R)) return true; var xb = tt * (q.u[0] * up[0] + q.u[1] * up[1]), hb = larguraVista(q.m, [0, 0, 1]) / 2 / Math.abs(un) + 15; return mids.every(function (m2) { return Math.abs(xb - m2) > hb + wTxt / 2 / M.k; }); }); }
      var wt = largT("000", hT) + 1, c1x = cand.filter(function (q) { return livreCota(q.lado, q.off, [-ch.Lg / 4, ch.Lg / 4], wt); })[0], c2x = cand.filter(function (q) { return livreCota(q.lado, q.off + (c1x && q.lado === c1x.lado ? 6 : 0), [0], wt); })[0] || cand[1];
      function baseDe(lado) { var fc = lado === -sd ? sd * cIn : sd * cOut; return [L2(-ch.Lg / 2, fc), L2(0, fc), L2(ch.Lg / 2, fc)]; }
      function offPapel(lado, off, p0, p1) { var dx = p1[0] - p0[0], dy = p1[1] - p0[1], L0 = hip(dx, dy) || 1, nx = dy / L0, ny = -dx / L0, ex = np[0] * lado, ey = -np[1] * lado; return (nx * ex + ny * ey) >= 0 ? off : -off; }
      if (c1x) { var B1 = baseDe(c1x.lado).map(function (v) { return F(v[0], v[1]); }); var of1 = offPapel(c1x.lado, c1x.off, B1[0], B1[2]); o1u = Math.abs(D.cadeia(B1, of1, [String(Math.round(ch.Lg / 2)), String(ch.Lg - Math.round(ch.Lg / 2))], { offs: foraOffs(of1) })); }
      var o2 = c2x.lado === (c1x || {}).lado ? Math.max(c2x.off, o1u + 6) : c2x.off, B2 = baseDe(c2x.lado).map(function (v) { return F(v[0], v[1]); });
      var of2 = offPapel(c2x.lado, o2, B2[0], B2[2]); D.cadeia([B2[0], B2[2]], of2, [String(ch.Lg)], { offs: foraOffs(of2, c2x.lado === (c1x || {}).lado ? o1u + 6 : 0) });
      var bk = sd * cIn, c2 = L2(ch.Lg / 2, bk), h1 = L2(ch.Lg / 2, sd * cOut);
      D.cadeia([F(c2[0], c2[1]), F(h1[0], h1[1])], -sd * 6, [String(ch.hg)], { offs: foraOffs(-sd * 6) });

    }
    var LcP = Math.min(p0.L, R) * 0.85, vP = [p0.u[0] * LcP + np[0] * wP / 2 * -sd * 0.5, p0.u[1] * LcP + np[1] * wP / 2 * -sd * 0.5];
    itens.push({ p: F(vP[0], vP[1]), l: [rotP] });
    if (ch) {
      var va = L2(ch.Lg * 0.32, sd * (cOut - 8));
      itens.push({ p: F(va[0], va[1]), l: [rotCh, "ASTM A36"] });
      if (ch.dwPrincipal) { var vs = L2(-ch.Lg / 2, sd * wP / 2 + sd * 2), pvs = F(vs[0], vs[1]); soldas.push(function () { soldaDet(D, pvs, 180, ch.dwPrincipal, ch.Lg); }); }
    }
    var pn = F(0, 0); D.ponto(pn[0], pn[1], 0.55);
    colunaCham(D, M.xCol, itens, hn, M.yIni);
    soldas.forEach(function (f) { f(); });   /* por último: o símbolo procura lugar sem cortar barra, cota nem chamada */
    eixosDet(D);
    if (notas && notas.dim) D.textos(cl.x, M.yFim + 2, notas.dim, T.nota * 0.9, { wmax: cw - 4 });
    if (notas && notas.tipo) grupoDim(D, i0, notas.tipo, notas.vs || []);
    blocoDet(D, i0, "DET-" + numero, M.esc, cl.x, cl.y, cw, chh);
    return M;
  }
  /* DETALHE 1 EM ESCALA — base da coluna treliçada, elevação no plano do pórtico: os dois banzos e as barras da alma que chegam
     perto da base, cortados; a placa ÚNICA (pena de corte, a forma do placaColGeo e a espessura do cálculo); o graute; os
     chumbadores com o eixo, arruela e porca; cotas de borda e de passo dos chumbadores e da placa; a solda do banzo com a perna */
  function detBaseColuna(D, c, cl, cw, chh, ms, bf, bn, G, l, notas, vs) {
    var T = D.E.T, A = AP(), hn = T.nota * 0.85, tP = num(l.t, 25), GR = 25, AN = num(l.ancoragem, 300), ANv = Math.min(AN, 160), YT = 480, pf = pfDe(l.chumbador);
    var x0 = G.x0, x1 = G.x0 + G.B, yB = -(tP + GR + ANv + 30);
    var ext = [x0 - 90, yB - 150, x1 + 60, YT + 20];
    var rots = [bf.marca + " - " + c.perfil(bf.perfil), bn.marca + " - " + c.perfil(bn.perfil), "PLACA # " + mmBr(tP, 1) + " x " + G.B + " x " + G.L, l.nChumb + " CHUMB. Ø " + l.chumbador + " F1554 Gr.36", "COM GANCHO, ANCORAGEM " + AN, "GRAUTE NÃO RETRÁTIL e = " + GR];
    var wCol = 0; rots.forEach(function (s) { wCol = Math.max(wCol, largT(s, hn) + 6); });
    var nN = notas.reduce(function (s, q) { return s + A.quebrar(typeof q === "object" ? q.t : q, T.nota * 0.9, cw - 4).length; }, 0);
    var M = moldaDet(cl, cw, chh, ext, wCol, nN * T.nota * 0.9 * 1.45 + 4), F = M.F, k = M.k, i0 = D.s.length, itens = [];
    A.tituloVista(D, cl.x, cl.y, "BASE DA COLUNA TRELIÇADA - ELEVAÇÃO", "ESC 1:" + M.esc, 1);
    /* fundação: topo, faces cortadas e a interrupção embaixo */
    var gF = F(x0 - 60, -tP - GR), gF2 = F(x1 + 40, -tP - GR);
    D.linha(gF[0], gF[1], gF2[0], gF2[1], "MET-CONTEXTO");
    D.quebra(F(x0 - 60, yB)[0], F(x0 - 60, yB)[1], F(x1 + 40, yB)[0], F(x1 + 40, yB)[1]);
    /* graute (hachura) e a placa (pena de corte) */
    var pg = F(x0, -tP); D.hachura(pg[0], pg[1], G.B * k, GR * k, 0.9, "MET-HACHURA");
    var pp = F(x0, 0); D.ret(pp[0], pp[1], G.B * k, tP * k, "MET-PERFIL-CORTE");
    /* banzos (contorno no plano, cortados em YT) e as barras da alma que saem da base */
    [[bf, G.xF, G.hxF], [bn, G.xN, G.hxN]].forEach(function (q, i) {
      barraDet(D, F, [q[1], 0], [q[1], YT], 2 * q[2], { quebra: true });
      itens.push({ p: F(q[1] + (i ? q[2] * 0.5 : -q[2] * 0.5), YT * 0.82), l: [rots[i]] });
      /* 23/11/2026: a face interna da ALMA do U (a alma fica do lado de FORA da coluna): a linha mostra a orientação na elevação */
      var dq = dimSec(q[0]); if (dq.forma === "U" || dq.forma === "Ue") { var sOut = (q[1] === G.xF ? 1 : -1) * (G.xF <= G.xN ? -1 : 1), xa = q[1] + sOut * (q[2] - num(dq.s.t, 2.65)), a0 = F(xa, 0), a1 = F(xa, YT * 0.97); D.linha(a0[0], a0[1], a1[0], a1[1], "MET-PERFIL"); }
    });
    var ja = {};
    ms.forEach(function (m) {
      if (m === bf || m === bn || m.cls.pre === "BF" || m.cls.pre === "BN") return;
      var a = [m.a[0] * 1000, m.a[1] * 1000], b = [m.b[0] * 1000, m.b[1] * 1000]; if (b[1] < a[1]) { var t = a; a = b; b = t; }
      if (a[1] > YT * 0.8 || a[0] < x0 - 50 || a[0] > x1 + 50) return;
      var L = hip(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], tc = Math.min(L, (YT - a[1]) / Math.max(0.2, u[1]), 360), w = larguraVista(m, [0, 0, 1]);
      /* a ponta começa na face do banzo de onde sai (boca de lobo) */
      var hx = Math.abs(a[0] - G.xF) < Math.abs(a[0] - G.xN) ? G.hxF : G.hxN, s0 = Math.abs(u[0]) > 0.1 ? Math.min(tc * 0.5, hx / Math.abs(u[0])) : 0;
      barraDet(D, F, [a[0] + u[0] * s0, a[1] + u[1] * s0], [a[0] + u[0] * tc, a[1] + u[1] * tc], w, { quebra: tc < L - 1 });
      if (!ja[m.marca]) { ja[m.marca] = 1; itens.push({ p: F(a[0] + u[0] * tc * 0.75, a[1] + u[1] * tc * 0.75), l: [m.marca + " - " + c.perfil(m.perfil)] }); rots.push(m.marca); }
    });
    /* chumbadores: eixo, barra (vista acima da placa, oculta dentro do concreto), arruela e porca */
    var chs = G.ch.slice().sort(function (q, w) { return q - w; }), rr = G.d / 2;
    chs.forEach(function (xc) {
      var e0 = F(xc, 90), e1 = F(xc, yB + 6); (D._eixosDet = D._eixosDet || []).push([e0, e1]);
      var hA = pf ? pf.arr.h : 3, dA = pf ? pf.arr.d2 / 2 : rr * 2, hM = pf ? pf.m : G.d, sM = pf ? pf.s / 2 : rr * 1.5, topo = hA + hM + 3 * (pf ? pf.passo : 2.5);
      var pa = F(xc, 0); D.retRot(pa[0], pa[1], 0, -1, hA * k, dA * k, "MET-SECUNDARIO");
      var pm = F(xc, hA); D.retRot(pm[0], pm[1], 0, -1, hM * k, sM * k, "MET-SECUNDARIO");
      [-1, 1].forEach(function (s) { var a1 = F(xc + s * rr, topo), a2 = F(xc + s * rr, 0), a3 = F(xc + s * rr, yB + 30); D.linha(a1[0], a1[1], a2[0], a2[1], "MET-SECUNDARIO"); D.linha(a2[0], a2[1], a3[0], a3[1], "MET-OCULTA"); });
      var tq = F(xc - rr, topo), tq2 = F(xc + rr, topo); D.linha(tq[0], tq[1], tq2[0], tq2[1], "MET-SECUNDARIO");
    });
    itens.push({ p: F(chs[1] + sMeio(pf, rr), (pf ? pf.arr.h + pf.m / 2 : 10)), l: ["ARRUELA E PORCA"] });
    itens.push({ p: F(chs[1] + rr, -tP - GR - ANv * 0.6), l: [rots[3], rots[4]] });
    itens.push({ p: F(x1 - 8, -tP / 2), l: [rots[2], "ASTM A36"] });
    itens.push({ p: F(x1 - 20, -tP - GR / 2), l: [rots[5]] });
    /* cotas: em cima da placa, borda / passo / borda dos chumbadores e o total; à esquerda, placa e graute */
    var yL = F(0, yB)[1];
    D.cadeia([[F(x0, 0)[0], yL], [F(chs[0], 0)[0], yL], [F(chs[1], 0)[0], yL], [F(x1, 0)[0], yL]], -6, [String(Math.round(chs[0] - x0)), String(Math.round(chs[1] - chs[0])), String(Math.round(x1 - chs[1]))], {});
    D.cadeia([[F(x0, 0)[0], yL], [F(x1, 0)[0], yL]], -12, [String(G.B)], {});
    var xL = F(x0 - 60, 0)[0];
    D.cadeia([[xL, F(0, -tP - GR)[1]], [xL, F(0, -tP)[1]], [xL, F(0, 0)[1]]], -5, [String(GR), mmBr(tP, 1)], {});
    /* solda dos banzos na placa: filete em todo o contorno */
    soldaDet(D, F(G.xF - G.hxF, 0), -135, num(l.soldaDw, 3), null, { contorno: true, ls: 10 });
    colunaCham(D, M.xCol, itens, hn, M.yIni); eixosDet(D);
    D.textos(cl.x, M.yFim + 2, notas, T.nota * 0.9, { wmax: cw - 4 });
    grupoDim(D, i0, "placaColuna", vs);
    blocoDet(D, i0, "DET-1", M.esc, cl.x, cl.y, cw, chh);
    return M;
  }
  function sMeio(pf, rr) { return pf ? pf.s / 2 : rr * 1.5; }
  /* DETALHE 5 EM ESCALA — fixação da barra redonda: a face do apoio (interrompida), a chapa de apoio da porca soldada no apoio e
     perpendicular à barra (no ângulo alfa do cálculo), o furo a "e" do apoio, a barra com o eixo cortada, arruela, porca e
     contraporca do lado do apoio (medidas da porca: js/metalnorma.js), cotas e a solda com a perna */
  function detContravento(D, c, cl, cw, chh, cv, gV, notas) {
    var T = D.E.T, A = AP(), hn = T.nota * 0.85, ch = gV.chapa, al = num(gV.alfa, 45) * Math.PI / 180, b = num(ch.b, 140), t = num(ch.t, 6.3), e = num(ch.e, b / 2), dB = num(gV.d, 12.7);
    var u = [Math.cos(al), -Math.sin(al)], p = [Math.sin(al), Math.cos(al)], H = [p[0] * e, p[1] * e], LB = 260;
    var pf = pfDe(dB >= 15 ? "M16" : "M12"), hA = pf ? pf.arr.h : 3, hM = pf ? pf.m : dB, sM = pf ? pf.s / 2 : dB;
    function P2(q, a, bb) { return [q[0] + u[0] * a + p[0] * bb, q[1] + u[1] * a + p[1] * bb]; }
    var pts = [[0, -60], [0, 60], P2([0, 0], t, b), P2(H, LB, 0), P2(H, -(hA + 2 * hM + 20), 0), P2([0, 0], 0, b)];
    var ext = [Math.min.apply(null, pts.map(function (q) { return q[0]; })) - 60, Math.min.apply(null, pts.map(function (q) { return q[1]; })) - 50, Math.max.apply(null, pts.map(function (q) { return q[0]; })) + 30, Math.max.apply(null, pts.map(function (q) { return q[1]; })) + 50];
    var rots = [cv.marca + " - " + c.perfil(cv.perfil) + " ROSCADA", "CHAPA # " + mmBr(t, 1) + " x " + mmBr(b, 0) + " (A36)", "ARRUELA, PORCA E CONTRAPORCA"];
    var wCol = 0; rots.forEach(function (s) { wCol = Math.max(wCol, largT(s, hn) + 6); });
    var nN = notas.reduce(function (s, q) { return s + A.quebrar(typeof q === "object" ? q.t : q, T.nota * 0.9, cw - 4).length; }, 0);
    var M = moldaDet(cl, cw, chh, ext, wCol, nN * T.nota * 0.9 * 1.45 + 4), F = M.F, k = M.k, i0 = D.s.length;
    A.tituloVista(D, cl.x, cl.y, "FIXAÇÃO TÍPICA DO CONTRAVENTO EM BARRA REDONDA", "ESC 1:" + M.esc, 5);
    var yA = Math.max(Math.abs(ext[1]), Math.abs(ext[3])) - 20, a0 = F(0, ext[3] - 20), a1 = F(0, ext[1] + 20), a2 = F(-30, ext[3] - 20), a3 = F(-30, ext[1] + 20); void yA;
    D.linha(a0[0], a0[1], a1[0], a1[1], "MET-PERFIL"); D.linha(a2[0], a2[1], a3[0], a3[1], "MET-CONTEXTO");
    D.quebra(a2[0], a2[1], a0[0], a0[1]); D.quebra(a3[0], a3[1], a1[0], a1[1]);
    /* chapa (pena de corte) */
    D.poli([[0, 0], P2([0, 0], 0, b), P2([0, 0], t, b), P2([0, 0], t, 0)].map(function (q) { return F(q[0], q[1]); }), "MET-PERFIL-CORTE", true);
    /* barra: da ponta (3 fios além da contraporca) até o corte */
    var ini = -(hA + 2 * hM + 3 * (pf ? pf.passo : 2)), q0 = P2(H, ini, 0), q1 = P2(H, LB, 0);
    barraDet(D, F, q0, q1, dB, { quebra: true, fecha: true, cam: "MET-SECUNDARIO" });
    /* arruela, porca e contraporca do lado do apoio */
    var s0 = F(H[0], H[1]);
    D.retRot(s0[0], s0[1], -u[0], u[1], hA * k, (pf ? pf.arr.d2 / 2 : dB) * k, "MET-SECUNDARIO");
    var s1 = F(H[0] - u[0] * hA, H[1] - u[1] * hA); D.retRot(s1[0], s1[1], -u[0], u[1], hM * k, sM * k, "MET-SECUNDARIO");
    var s2 = F(H[0] - u[0] * (hA + hM), H[1] - u[1] * (hA + hM)); D.retRot(s2[0], s2[1], -u[0], u[1], hM * k, sM * k, "MET-SECUNDARIO");
    /* cotas ao longo da chapa: apoio → furo (e) e o restante; total b */
    var c0 = F(0, 0), cH = F(H[0], H[1]), cB = F(p[0] * b, p[1] * b);
    var tq = P2([0, 0], 0, 0), tH = P2(H, 0, 0), tB = P2([0, 0], 0, b);
    D.cadeia([F(tq[0], tq[1]), F(tH[0], tH[1]), F(tB[0], tB[1])], 9, [String(Math.round(e)), String(Math.round(b - e))], {});
    void c0; void cH; void cB;
    soldaDet(D, F(0, p[1] * b * 0.5 > 0 ? 10 : -10), 180, num(gV.solda, 5), null, { ls: 10 });
    var itens = [{ p: F(P2(H, LB * 0.7, 0)[0], P2(H, LB * 0.7, 0)[1]), l: [rots[0]] }, { p: F(P2([0, 0], t / 2, b * 0.85)[0], P2([0, 0], t / 2, b * 0.85)[1]), l: [rots[1]] }, { p: F(P2(H, -(hA + hM), 0)[0], P2(H, -(hA + hM), 0)[1]), l: [rots[2]] }];
    colunaCham(D, M.xCol, itens, hn, M.yIni); eixosDet(D);
    D.textos(cl.x, M.yFim + 2, notas, T.nota * 0.9, { wmax: cw - 4 });
    blocoDet(D, i0, "DET-5", M.esc, cl.x, cl.y, cw, chh);
  }
  function folhaDetalhes(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, A = AP(), tr = d.tr, p = tr.tipico;
    var cw = (a.w - 12) / 3, chh = (a.h - c.reservaBaixo - 8) * 0.62 / 2, nota = T.nota;
    function celula(i) { return { x: a.x + 4 + (i % 3) * (cw + 2), y: a.y + 2 + Math.floor(i / 3) * (chh + 4) }; }
    var ms = membrosPortico(d, p, ["COL", "TES"]);
    /* vista ampliada de uma região do pórtico típico (janela em m, escala da lista) */
    function regiao(i, numero, titulo, j0, notas) {
      var cl = celula(i), wJ = j0[2] - j0[0], hJ = j0[3] - j0[1], esc = escala(ESC("detalhe"), wJ, hJ, cw - 30, chh - 40), s = 1000 / esc;
      A.tituloVista(D, cl.x, cl.y, titulo, "ESC 1:" + esc, numero);
      var x0 = cl.x + 14, yb = cl.y + 18 + hJ * s;
      function X(x) { return x0 + (x - j0[0]) * s; } function Y(y) { return yb - (y - j0[1]) * s; }
      var J = [X(j0[0]), Y(j0[3]), X(j0[2]), Y(j0[1])];
      vistaPortico(D, d, ms, X, Y, s, J, {});
      D.ret(J[0], J[1], J[2] - J[0], J[3] - J[1], "MET-FINA", ' stroke-dasharray="1.5 1"');
      var ja = {};
      ms.forEach(function (m) {
        var sg = recorta([X(m.a[0]), Y(m.a[1])], [X(m.b[0]), Y(m.b[1])], [J[0] + 3, J[1] + 3, J[2] - 3, J[3] - 3]); if (!sg || ja[m.marca]) return;
        if (hip(sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]) < 6) return;
        if (rotuloBarra(D, sg[0], sg[1], m.marca + " " + c.perfil(m.perfil), nota * 0.85, { raio: 14, J: [J[0] + 1, J[1] + 1, J[2] - 1, J[3] - 1] }) || rotuloBarra(D, sg[0], sg[1], m.marca, nota * 0.85, { raio: 10, J: [J[0] + 1, J[1] + 1, J[2] - 1, J[3] - 1] })) ja[m.marca] = 1;
      });
      if (notas && notas.dim) { var i0 = D.s.length; D.textos(cl.x, J[3] + 4, notas.dim.concat(notas.pend ? [{ t: "A DIMENSIONAR: " + notas.pend, cor: VERMELHO }] : []), nota * 0.9, { wmax: cw - 4 }); grupoDim(D, i0, notas.tipo, notas.vs || []); }
      else if (notas) D.textos(cl.x, J[3] + 4, [{ t: "A DIMENSIONAR: " + notas, cor: VERMELHO }], nota * 0.9, { wmax: cw - 4 });
      return { X: X, Y: Y, J: J, s: s, cl: cl };
    }
    var bf = ms.filter(function (m) { return m.cls.pre === "BF"; }).sort(function (q, w) { return q.a[0] - w.a[0]; })[0];
    var bn = ms.filter(function (m) { return m.cls.pre === "BN"; }).sort(function (q, w) { return q.a[0] - w.a[0]; })[0];
    var bi = ms.filter(function (m) { return m.cls.pre === "BI"; })[0], bs = ms.filter(function (m) { return m.cls.pre === "BS"; })[0];
    var x0c = bf ? bf.a[0] : 0, wc = bn ? bn.a[0] - x0c : 0.6, yTopo = bf ? Math.max(bf.a[1], bf.b[1]) : 6;
    /* 1 — base da coluna */
    var vPC = ligVar(d, "placaColuna"), gPC = vPC[0] && bf && bn ? placaColGeo(bf, bn, vPC[0].l) : null;
    /* 23/11/2026 (Estância Montalvão): a orientação dos U da coluna escrita no detalhe — a metalúrgica monta pelo desenho */
    var ehUcol = bf && (dimSec(bf).forma === "U" || dimSec(bf).forma === "Ue");
    if (gPC) detBaseColuna(D, c, celula(0), cw, chh, ms, bf, bn, gPC, vPC[0].l, ["PLACA ÚNICA SOB OS BANZOS, 1 CHUMBADOR POR BANZO E SOLDA DO BANZO NA PLACA: DIMENSIONADOS (PLANTA NO DETALHE 1A).", "GRAUTE NÃO RETRÁTIL 25 mm (20 A 50 mm) SOB A PLACA, DEPOIS DO NIVELAMENTO."].concat(ehUcol ? [notaU(bf)] : []), vPC);
    else {
    var rb = regiao(0, 1, "BASE DA COLUNA TRELIÇADA",[x0c - 0.25, -0.12, x0c + wc + 0.25, 0.7], gPC
      ? { dim: ["PLACA ÚNICA SOB OS BANZOS, 1 CHUMBADOR POR BANZO E SOLDA DO BANZO NA PLACA: DIMENSIONADOS (VER O DETALHE 1A).", "GRAUTE NÃO RETRÁTIL 25 mm (20 A 50 mm) SOB A PLACA."], tipo: "placaColuna", vs: vPC }
      : "PLACA DE BASE, CHUMBADORES (QUANT., Ø, ANCORAGEM), SOLDA DO BANZO NA PLACA. GRAUTE NÃO RETRÁTIL 25 mm (20 A 50 mm) SOB A PLACA.");
    /* topo da fundação (contexto) e a placa: DIMENSIONADA (a espessura do cálculo, a forma da regra do 3D) ou, sem o cálculo da
       ligação, a de cada banzo tracejada (sem medida: A DIMENSIONAR) */
    var tPC = gPC ? num(vPC[0].l.t, 25) / 1000 : 0, yF = rb.Y(-(tPC + 0.025));
    D.linha(rb.J[0] + 1, yF, rb.J[2] - 1, yF, "MET-CONTEXTO");
    var tF = "TOPO DA FUNDAÇÃO / GRAUTE", wF = largT(tF, nota * 0.8), yTF = yF + Math.max(nota, (rb.J[3] - yF) / 2 + nota * 0.3), xTF = Math.max(rb.J[0] + 3, (rb.J[0] + rb.J[2]) / 2 - wF / 2);   /* 21/11: centrado entre os pés dos banzos — o contorno da diagonal de base (2L) no pé do banzo de fora cortava o texto encostado à esquerda */
    D.hachura(rb.J[0] + 1, yF, rb.J[2] - rb.J[0] - 2, rb.J[3] - yF - 1, 1.6, "MET-HACHURA", [[xTF - 1, yTF - nota * 0.8, xTF + 1 + wF, yTF + 0.8]]);
    if (gPC) {
      var i1 = D.s.length, xa0 = Math.max(rb.J[0] + 1, rb.X(gPC.x0 / 1000)), xa1 = Math.min(rb.J[2] - 1, rb.X((gPC.x0 + gPC.B) / 1000));
      D.ret(xa0, rb.Y(0), xa1 - xa0, rb.Y(-tPC) - rb.Y(0), "MET-PERFIL-CORTE");
      gPC.ch.forEach(function (xc) { var xx = rb.X(xc / 1000); if (xx > rb.J[0] + 1 && xx < rb.J[2] - 1) D.linha(xx, rb.Y(0.03), xx, rb.J[3] - 1, "MET-SECUNDARIO"); });
      grupoDim(D, i1, "placaColuna", vPC);
    } else [bf, bn].forEach(function (m) { if (!m) return; var w = larguraVista(m, [0, 0, 1]) / 1000 * rb.s, xc = rb.X(m.a[0]); D.poli([[xc - w / 2 - 4, rb.Y(0)], [xc + w / 2 + 4, rb.Y(0)], [xc + w / 2 + 4, yF], [xc - w / 2 - 4, yF]], "MET-PEND", true); });
    D.texto(xTF, yTF, tF, nota * 0.8, {});
    }
    var NI = (d.r && d.r.modelo && d.r.modelo.noInfo) || {};
    function noP(nb) { var q = nb && NI[nb.o.no]; return q && q.P ? [q.P[0], q.P[1], q.P[2]] : null; }
    function msNo(P) { var v = d.membros.filter(function (m) { return Math.abs(m.a[2] - P[2]) < 0.05 && Math.abs(m.b[2] - P[2]) < 0.05; }); return v.length ? v : ms; }
    /* 2 — nó típico da tesoura: o nó do banzo inferior mais perto de 1/4 do vão */
    var alvo = null;
    if (bi) {
      var xq = bi.a[0] + (bi.b[0] - bi.a[0]) * 0.4, dxB = bi.b[0] - bi.a[0], dyB = bi.b[1] - bi.a[1], LB = hip(dxB, dyB), cand = [];
      ms.forEach(function (m) { if (m.cls.pre === "M") [m.a, m.b].forEach(function (P) { if (Math.abs((P[0] - bi.a[0]) * dyB - (P[1] - bi.a[1]) * dxB) / LB < 0.01) cand.push(P); }); });
      cand.sort(function (q, w) { return Math.abs(q[0] - xq) - Math.abs(w[0] - xq); }); alvo = cand[0];
    }
    var nbT = noChapaDe(d, ["BI"]);
    var n2 = nbT && noP(nbT) ? { dim: linhasNo(d, nbT).concat(["ELETRODO E70XX; RECORTE DAS PONTAS (BOCA DE LOBO) - NBR 16239."]), tipo: "noChapa", vs: [{ l: { nome: "Nó " + nbT.o.no }, razao: nbT.rz }] } : null;
    if (n2 && detNo(D, c, celula(1), cw, chh, 2, "NÓ TÍPICO DA TESOURA (BANZO INFERIOR)", noP(nbT), msNo(noP(nbT)), nbT, n2)) { /* em escala */ }
    else if (alvo) regiao(1, 2, "NÓ TÍPICO DA TESOURA (BANZO INFERIOR)", [alvo[0] - 0.42, alvo[1] - 0.18, alvo[0] + 0.42, alvo[1] + 0.5], nbT
      ? { dim: linhasNo(d, nbT).concat(["ELETRODO E70XX; RECORTE DAS PONTAS (BOCA DE LOBO) - NBR 16239."]), tipo: "noChapa", vs: [{ l: { nome: "Nó " + nbT.o.no }, razao: nbT.rz }] }
      : "SOLDA DE FILETE EM TODO O CONTORNO DAS BARRAS (PERNA E ELETRODO), RECORTE DAS PONTAS (BOCA DE LOBO) - NBR 16239.");
    /* 3 — nó coluna-tesoura (joelho) */
    var nbJ = noChapaDe(d, ["BF", "BN"], function (P) { return P[1] >= yTopo - 1.6; }), enJ = null;
    if (nbJ) arr(d.r.ligDim && d.r.ligDim.modelo && d.r.ligDim.modelo.enrijecedores).forEach(function (q) { if (q.no === nbJ.o.no) enJ = q; });
    var n3 = nbJ && noP(nbJ) ? { dim: linhasNo(d, nbJ).concat([enJ ? "2 ENRIJECEDORES " + mmBr(enJ.t * 1000, 1) + " x " + mmBr(enJ.h * 1000, 0) + " x " + mmBr(enJ.comprimento * 1000, 0) + " mm (ASTM A36) DENTRO DO " + enJ.U + ", NAS BORDAS DA CHAPA; SOLDA " + enJ.soldaAlma.dw + " mm NA ALMA E " + enJ.soldaAbas.dw + " mm NAS ABAS (DETALHE 11)." : "ALMA DO U SEM ENRIJECEDOR NESTE NÓ (A ALMA RESISTE SOZINHA)."]).concat(ehUcol ? [notaU(bf)] : []), tipo: "noChapa", vs: [{ l: { nome: "Nó " + nbJ.o.no }, razao: nbJ.rz }] } : null;
    if (n3 && detNo(D, c, celula(2), cw, chh, 3, "NÓ COLUNA - TESOURA (JOELHO)", noP(nbJ), msNo(noP(nbJ)), nbJ, n3)) { /* em escala */ }
    else regiao(2, 3, "NÓ COLUNA - TESOURA (JOELHO)", [x0c - 0.25, yTopo - 1.55, x0c + wc + 0.55, yTopo + 0.3], nbJ
      ? { dim: linhasNo(d, nbJ).concat([enJ ? "2 ENRIJECEDORES " + mmBr(enJ.t * 1000, 1) + " x " + mmBr(enJ.h * 1000, 0) + " x " + mmBr(enJ.comprimento * 1000, 0) + " mm (ASTM A36) DENTRO DO " + enJ.U + ", NAS BORDAS DA CHAPA; SOLDA " + enJ.soldaAlma.dw + " mm NA ALMA E " + enJ.soldaAbas.dw + " mm NAS ABAS (DETALHE 11)." : "ALMA DO U SEM ENRIJECEDOR NESTE NÓ (A ALMA RESISTE SOZINHA)."]), tipo: "noChapa", vs: [{ l: { nome: "Nó " + nbJ.o.no }, razao: nbJ.rz }] }
      : "LIGAÇÃO DO BANZO SUPERIOR E DO BANZO INFERIOR NA COLUNA (CHAPA, SOLDA OU PARAFUSOS) - ESFORÇOS NO MEMORIAL.");
    /* 4 — clip de terça: olhando ao longo da terça, a TERÇA em seção (alma em pé) apoiada no BANZO SUPERIOR (em vista) */
    var cl4 = celula(3), ter = d.membros.filter(function (m) { return m.cls.conj === "TER"; }).sort(function (q, w) { return w.massa - q.massa; })[0];
    A.tituloVista(D, cl4.x, cl4.y, "FIXAÇÃO DA TERÇA NO BANZO SUPERIOR (CLIP)", "ESC 1:" + ESC("clip")[0], 4);
    if (ter && bs) {
      var s4 = 1 / ESC("clip")[0], dT = dimSec(ter), hB = larguraVista(bs, [0, 0, 1]) * s4, hT = dT.hy * s4, bT = dT.bz * s4;
      var xC = cl4.x + 30, yTopoB = cl4.y + 22 + hT;
      D.linha(cl4.x + 6, yTopoB, cl4.x + 6 + 80, yTopoB, "MET-PRINCIPAL"); D.linha(cl4.x + 6, yTopoB + hB, cl4.x + 6 + 80, yTopoB + hB, "MET-PRINCIPAL");
      D.quebra(cl4.x + 6, yTopoB - 1.5, cl4.x + 6, yTopoB + hB + 1.5); D.quebra(cl4.x + 86, yTopoB - 1.5, cl4.x + 86, yTopoB + hB + 1.5);
      secaoDesenho(D, ter, xC + bT / 2, yTopoB - hT / 2, s4);
      /* clip em L: aba vertical encostada na alma (lado de fora), aba horizontal sobre o banzo */
      var vCl = ligVar(d, "clip"), gC = vCl[0] && vCl[0].l.dimensoes, mC = gC ? /L\s*([\d.,]+)\s*X\s*([\d.,]+)\s*X\s*([\d.,]+)/i.exec(String(gC.cat)) : null;
      var aC = mC ? +mC[1].replace(",", ".") : 0, bC = mC ? +mC[2].replace(",", ".") : 0, tCl = mC ? +mC[3].replace(",", ".") : 0, i4 = D.s.length;
      var xa = xC - 0.6, hc = mC ? Math.min(aC * s4, hT) : Math.min(hT * 0.6, 22), tc = mC ? Math.max(0.6, tCl * s4) : 0.6, bh = mC ? bC * s4 : 14;
      D.poli([[xa, yTopoB - hc], [xa - tc, yTopoB - hc], [xa - tc, yTopoB - tc], [xa - bh, yTopoB - tc], [xa - bh, yTopoB], [xa, yTopoB]], "MET-PERFIL", true);
      if (mC) { var yPf = yTopoB - Math.min(num(gC.h, aC / 2), aC - 10) * s4; D.linha(xa - tc - 3, yPf, xC + 3, yPf, "MET-SECUNDARIO"); }
      D.cota(xC, yTopoB - hT - 4, xC + bT, yTopoB - hT - 4, 0, String(Math.round(dT.bz)), { foraSeUnico: true });
      D.cota(xC + bT + 5, yTopoB, xC + bT + 5, yTopoB - hT, 0, String(Math.round(dT.hy)), { foraSeUnico: true });
      D.chamada(xa - 7, yTopoB - tc, xC + bT + 20, yTopoB - hT * 0.55, mC ? ["CLIP " + catTxt(gC.cat) + " x " + gC.comprimento + " mm"] : ["CLIP (CANTONEIRA OU CHAPA DOBRADA)", { t: "A DIMENSIONAR", cor: VERMELHO }], { dir: 1 });
      D.chamada(xC + bT * 0.6, yTopoB - hT + 0.3, xC + bT + 20, yTopoB - hT - 6, [ter.marca + " - " + c.perfil(ter.perfil)], { dir: 1 });
      D.chamada(cl4.x + 70, yTopoB + hB, cl4.x + 92, yTopoB + hB + 9, [bs.marca + " - " + c.perfil(bs.perfil) + " (BANZO SUPERIOR)"], { dir: 1 });
      if (mC) {
        D.textos(cl4.x, cl4.y + chh - 20, ["CLIP " + catTxt(gC.cat) + " x " + gC.comprimento + " mm SOLDADO NO BANZO (FILETE " + gC.solda + " mm); " + gC.n + " PARAFUSOS " + gC.parafuso + " " + gC.classe + " NA ALMA DA TERÇA - DIMENSIONADO.",
          variantes(vCl, function (g) { var q = g.l.dimensoes || {}; return catTxt(q.cat) + " x " + q.comprimento + " / " + q.n + " " + q.parafuso; })], nota * 0.9, { wmax: cw - 4 });
        grupoDim(D, i4, "clip", vCl);
      } else D.textos(cl4.x, cl4.y + chh - 14, [{ t: "A DIMENSIONAR: CLIP, PARAFUSOS (QUANT., Ø, CLASSE) E A SOLDA DO CLIP NO BANZO.", cor: VERMELHO }], nota * 0.9, { wmax: cw - 4 });
    }
    /* 5 — contravento em barra redonda (fixação típica) */
    var cl5 = celula(4), cv = d.membros.filter(function (m) { return m.cls.conj === "CTV"; })[0], vCv0 = ligVar(d, "contravento"), gV0 = vCv0[0] && vCv0[0].l.dimensoes;
    if (cv && gV0 && gV0.chapa) { var vCv = vCv0, gV = gV0, i5 = D.s.length; detContravento(D, c, cl5, cw, chh, cv, gV, ["BARRA Ø " + mmBr(gV.d, 1) + " mm ROSCADA; CHAPA DE APOIO DA PORCA " + mmBr(gV.chapa.b, 0) + " x " + mmBr(gV.chapa.t, 1) + " mm (ASTM A36) SOLDADA (FILETE " + gV.solda + " mm) - DIMENSIONADO. TENSIONAR NA MONTAGEM APÓS O PRUMO.",
          variantes(vCv, function (g) { var q = g.l.dimensoes || {}; return "Ø " + mmBr(q.d, 1) + " / " + mmBr((q.chapa || {}).b, 0) + " x " + mmBr((q.chapa || {}).t, 1); })]); grupoDim(D, i5, "contravento", vCv); }
    else {
    A.tituloVista(D, cl5.x, cl5.y, "FIXAÇÃO TÍPICA DO CONTRAVENTO EM BARRA REDONDA", "SEM ESCALA", 5);
    if (cv) {
      var vCv = ligVar(d, "contravento"), gV = vCv[0] && vCv[0].l.dimensoes, i5 = D.s.length;
      var x5 = cl5.x + 20, y5 = cl5.y + 30;
      D.ret(x5, y5, 8, 44, "MET-PRINCIPAL"); D.poli([[x5 + 8, y5 + 10], [x5 + 30, y5 + 10], [x5 + 30, y5 + 28], [x5 + 8, y5 + 28]], "MET-PERFIL", false);
      var ang = 38 * Math.PI / 180, ox = x5 + 22, oy = y5 + 19, L5 = 70;
      D.linha(ox, oy, ox + Math.cos(ang) * L5, oy + Math.sin(ang) * L5, "MET-CONTRAVENTO");
      D.ret(ox + Math.cos(ang) * 3 - 1.5, oy + Math.sin(ang) * 3 - 1.5, 3, 3, "MET-FINA");
      D.chamada(x5 + 28, y5 + 12, x5 + 52, y5 + 2, gV && gV.chapa ? ["CHAPA DE APOIO " + mmBr(gV.chapa.b, 0) + " x " + mmBr(gV.chapa.t, 1) + " mm"] : ["CHAPA DE LIGAÇÃO (GUSSET)", { t: "A DIMENSIONAR", cor: VERMELHO }], {});
      D.chamada(ox + Math.cos(ang) * 40, oy + Math.sin(ang) * 40, ox + 64, oy + 48, [cv.marca + " - " + c.perfil(cv.perfil) + " ROSCADA", "PORCA + CONTRAPORCA + ARRUELA"], {});
      if (gV && gV.chapa) {
        D.textos(cl5.x, cl5.y + chh - 20, ["BARRA Ø " + mmBr(gV.d, 1) + " mm ROSCADA; CHAPA DE APOIO DA PORCA " + mmBr(gV.chapa.b, 0) + " x " + mmBr(gV.chapa.t, 1) + " mm (ASTM A36) SOLDADA (FILETE " + gV.solda + " mm) - DIMENSIONADO. TENSIONAR NA MONTAGEM APÓS O PRUMO.",
          variantes(vCv, function (g) { var q = g.l.dimensoes || {}; return "Ø " + mmBr(q.d, 1) + " / " + mmBr((q.chapa || {}).b, 0) + " x " + mmBr((q.chapa || {}).t, 1); })], nota * 0.9, { wmax: cw - 4 });
        grupoDim(D, i5, "contravento", vCv);
      } else D.textos(cl5.x, cl5.y + chh - 14, [{ t: "A DIMENSIONAR: CHAPA, ROSCA E SOLDA. TENSIONAR NA MONTAGEM (PORCA E CONTRAPORCA) APÓS O PRUMO.", cor: VERMELHO }], nota * 0.9, { wmax: cw - 4 });
    }
    }
    /* 1A — PLACA DE BASE (planta e corte) com DIMENSÕES DE PARTIDA: o cálculo não dimensionou a base desta tipologia; o
       desenho mostra a forma (placa, furos, chumbador com gancho, graute) e cada número sai marcado PARTIDA, em vermelho */
    var cl6 = celula(5), bc = bf || bn;
    if (bc && gPC) {
      var l6 = vPC[0].l, G6 = gPC, tP6 = num(l6.t, 25), an0 = num(l6.ancoragem, 300);
      var es6 = escala(ESC("detalhe"), (2 * G6.B + 300) / 1000, Math.max(G6.L + 40, tP6 + 25 + an0 + 60) / 1000, cw - 40, chh - 50), k6 = 1 / es6;
      A.tituloVista(D, cl6.x, cl6.y, "1A  PLACA DE BASE DA COLUNA TRELIÇADA - PLANTA E CORTE", "ESC 1:" + es6);
      var i6 = D.s.length, W6 = G6.B * k6, H6 = G6.L * k6, px6 = cl6.x + 16, py6 = cl6.y + 24;
      var PX6 = function (x) { return px6 + (x - G6.x0) * k6; }, chs = G6.ch.slice().sort(function (q, w) { return q - w; });
      D.ret(px6, py6, W6, H6, "MET-PERFIL");
      [[G6.xF, G6.hxF], [G6.xN, G6.hxN]].forEach(function (q) { D.ret(PX6(q[0] - q[1]), py6 + H6 / 2 - G6.hz * k6, 2 * q[1] * k6, 2 * G6.hz * k6, "MET-PRINCIPAL"); });
      chs.forEach(function (x) { D.furo(PX6(x), py6 + H6 / 2, (G6.d + 6) / 2 * k6); });
      D.cota(px6, py6 + H6 + 6, px6 + W6, py6 + H6 + 6, 0, String(G6.B), { foraSeUnico: true });
      D.cota(px6 - 6, py6 + H6, px6 - 6, py6, 0, String(G6.L), { foraSeUnico: true });
      D.cota(PX6(chs[0]), py6 + H6 + 12, PX6(chs[1]), py6 + H6 + 12, 0, String(Math.round(chs[1] - chs[0])), { foraSeUnico: true });
      var cx6 = px6 + W6 + 30, cy6 = py6 + 10, tq6 = Math.max(0.8, tP6 * k6), gr6 = 25 * k6, an6 = Math.min(an0 * k6, chh - 60), xm6 = cx6 + W6 / 2;
      var CX6 = function (x) { return cx6 + (x - G6.x0) * k6; };
      D.ret(cx6, cy6, W6, tq6, "MET-PERFIL-CORTE");
      [[G6.xF, G6.hxF], [G6.xN, G6.hxN]].forEach(function (q) { D.ret(CX6(q[0] - q[1]), cy6 - 12, 2 * q[1] * k6, 12, "MET-PRINCIPAL"); });
      D.hachura(cx6, cy6 + tq6, W6, gr6, 1.0, "MET-HACHURA");
      D.linha(cx6 - 8, cy6 + tq6 + gr6, cx6 + W6 + 8, cy6 + tq6 + gr6, "MET-CONTEXTO");
      chs.forEach(function (x) { var xb6 = CX6(x), dg = xb6 < xm6 ? 1 : -1; D.linha(xb6, cy6 - 3, xb6, cy6 + tq6 + gr6 + an6, "MET-SECUNDARIO"); D.linha(xb6, cy6 + tq6 + gr6 + an6, xb6 + dg * 5, cy6 + tq6 + gr6 + an6, "MET-SECUNDARIO"); });
      D.cota(cx6 + W6 + 6, cy6 + tq6 + gr6, cx6 + W6 + 6, cy6 + tq6 + gr6 + an6, 0, String(an0), { foraSeUnico: true });
      D.textos(cl6.x, Math.max(py6 + H6 + 20, cy6 + tq6 + gr6 + an6 + 6), [
        "PLACA " + G6.B + " x " + G6.L + " x " + mmBr(tP6, 1) + " mm - ASTM A36 (ESPESSURA DIMENSIONADA; FORMA: BALANÇO 75 mm E BORDA DO CHUMBADOR)",
        l6.nChumb + " CHUMBADORES Ø " + l6.chumbador + " ASTM F1554 Gr.36 COM GANCHO (1 POR BANZO), ANCORAGEM " + an0 + " mm; FUROS Ø " + Math.round(G6.d + 6) + " mm + ARRUELA DE CHAPA",
        "SOLDA DO BANZO NA PLACA: FILETE " + num(l6.soldaDw, 3) + " mm NO CONTORNO; GRAUTE NÃO RETRÁTIL 25 mm (20 A 50 mm), DEPOIS DO NIVELAMENTO",
        vPC.length > 1 ? "PLACAS DO CÁLCULO (t / CHUMBADOR / ANCORAGEM - QUANT.): " + vPC.map(function (g) { return mmBr(g.l.t, 1) + " / " + g.l.chumbador + " / " + g.l.ancoragem + " - " + g.n; }).join("; ") + ". DESENHADA: A MAIS SOLICITADA; A FORMA DAS OUTRAS PELA MESMA REGRA." : ""], nota * 0.9, { wmax: cw - 4 });
      grupoDim(D, i6, "placaColuna", vPC);
    } else if (bc) {
      var dB = dimSec(bc), dimP = (d.bases.filter(function (q) { return q.dim; })[0] || {}).dim, part = !dimP;
      var PB = part ? { B: Math.round(dB.bz + 2 * 60), L: Math.round(dB.hy + 2 * 60), t: 16, d: 19.05, id: "3/4\"", borda: 40, anc: 300 } : { B: num(dimP.B, 0), L: num(dimP.L, 0), t: num(dimP.t, 0), d: num((dimP.chumbadores || {}).d, 19.05), id: txt((dimP.chumbadores || {}).id), borda: num((dimP.chumbadores || {}).borda, 40), anc: num((dimP.chumbadores || {}).ancoragem, 300) };
      var es6 = escala(ESC("placa"), PB.B * 2 / 1000 + 0.25, (PB.L + 60) / 1000, cw - 40, chh - 50), k6 = 1 / es6, cor6 = part ? VERMELHO : null, pt = part ? " (PARTIDA)" : "";
      A.tituloVista(D, cl6.x, cl6.y, "1A  PLACA DE BASE DO BANZO - PLANTA E CORTE", "ESC 1:" + es6 + (part ? " - DIMENSÕES DE PARTIDA" : ""));
      /* planta: placa, o U do banzo (seção) e os 4 furos */
      var W6 = PB.B * k6, H6 = PB.L * k6, px6 = cl6.x + 16, py6 = cl6.y + 22;
      D.ret(px6, py6, W6, H6, "MET-PERFIL");
      secaoDesenho(D, bc, px6 + W6 / 2, py6 + H6 / 2, k6);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { D.furo(px6 + W6 / 2 + q[0] * (PB.B / 2 - PB.borda) * k6, py6 + H6 / 2 + q[1] * (PB.L / 2 - PB.borda) * k6, (PB.d + 6) / 2 * k6); });
      D.cota(px6, py6 + H6 + 6, px6 + W6, py6 + H6 + 6, 0, String(PB.B) + pt, { foraSeUnico: true });
      D.cota(px6 - 6, py6 + H6, px6 - 6, py6, 0, String(PB.L) + pt, { foraSeUnico: true });
      /* corte: placa, graute, topo da fundação e o chumbador com gancho */
      var cx6 = px6 + W6 + 34, cy6 = py6 + 8, tP = Math.max(0.8, PB.t * k6), gr6 = 25 * k6, an6 = Math.min(PB.anc * k6, chh - 60);
      D.ret(cx6, cy6, W6, tP, "MET-PERFIL-CORTE");
      D.ret(cx6 + W6 / 2 - dB.bz * k6 / 2, cy6 - 14, dB.bz * k6, 14, "MET-PRINCIPAL");
      D.hachura(cx6, cy6 + tP, W6, gr6, 1.0, "MET-HACHURA");
      D.linha(cx6 - 8, cy6 + tP + gr6, cx6 + W6 + 8, cy6 + tP + gr6, "MET-CONTEXTO");
      [-1, 1].forEach(function (sg) { var xb6 = cx6 + W6 / 2 + sg * (PB.B / 2 - PB.borda) * k6; D.linha(xb6, cy6 - 3, xb6, cy6 + tP + gr6 + an6, "MET-SECUNDARIO"); D.linha(xb6, cy6 + tP + gr6 + an6, xb6 - sg * 5, cy6 + tP + gr6 + an6, "MET-SECUNDARIO"); });
      D.cota(cx6 + W6 + 6, cy6 + tP + gr6, cx6 + W6 + 6, cy6 + tP + gr6 + an6, 0, String(PB.anc) + pt, { foraSeUnico: true });
      D.textos(cl6.x, Math.max(py6 + H6 + 16, cy6 + tP + gr6 + an6 + 6), [
        { t: "PLACA " + PB.B + " x " + PB.L + " x " + PB.t + " mm" + pt + " - ASTM A36", cor: cor6 },
        { t: "4 CHUMBADORES Ø " + PB.id + " COM GANCHO, ANCORAGEM " + PB.anc + " mm" + pt + "; FUROS Ø " + Math.round(PB.d + 6) + " mm + ARRUELA DE CHAPA", cor: cor6 },
        "GRAUTE NÃO RETRÁTIL 25 mm (20 A 50 mm), DEPOIS DO NIVELAMENTO",
        { t: part ? "DIMENSÕES DE PARTIDA - A DIMENSIONAR COM AS REAÇÕES DO QUADRO DE CARGAS (FOLHA 01) ANTES DE FABRICAR" : "DIMENSIONADA PELO CÁLCULO (VER O MEMORIAL)", cor: cor6 }], nota * 0.9, { wmax: cw - 4 });
    }
    /* 6 — SEÇÕES DOS PERFIS USADOS (1:5) — na faixa de baixo, a largura toda */
    var yS = a.y + 2 + 2 * (chh + 4) + 6, usados = {}, lista = [];
    d.membros.forEach(function (m) { if (!usados[m.perfil]) { usados[m.perfil] = 1; lista.push(m); } });
    lista.sort(function (q, w) { return dimSec(w).hy - dimSec(q).hy; });
    var esS = ESC("secoes")[0], sS = 1 / esS;
    var hMax = Math.max.apply(null, lista.map(function (m) { return dimSec(m).hy; })) * sS;
    if (hMax > a.y + a.h - c.reservaBaixo - yS - 30) { var e2 = ESC("secoes")[1]; hMax *= esS / e2; esS = e2; sS = 1 / e2; }
    A.tituloVista(D, a.x + 4, yS, "SEÇÕES DOS PERFIS USADOS", "ESC 1:" + esS, 6);
    var xS = a.x + 10, yC = yS + 16 + hMax / 2;
    lista.forEach(function (m) {
      var ds = dimSec(m), w = Math.max(ds.bz * sS, largT(c.perfil(m.perfil), nota * 0.85) * 0.5);
      var wc2 = Math.max(ds.bz * sS + 8, largT(c.perfil(m.perfil), nota * 0.85) + 4, largT(String(Math.round(ds.hy)), nota) + ds.bz * sS + 12);
      if (xS + wc2 > a.x + a.w - 4) return;
      secaoDesenho(D, m, xS + wc2 / 2, yC, sS);
      if (ds.forma !== "circ") D.cota(xS + wc2 / 2 - ds.bz * sS / 2 - 3, yC + ds.hy * sS / 2, xS + wc2 / 2 - ds.bz * sS / 2 - 3, yC - ds.hy * sS / 2, 0, String(Math.round(ds.hy)), { foraSeUnico: true });
      D.texto(xS + wc2 / 2, yC + hMax / 2 + 7, c.perfil(m.perfil), nota * 0.85, { al: "C" });
      D.texto(xS + wc2 / 2, yC + hMax / 2 + 11, acoCurto(m.aco), nota * 0.75, { al: "C" });
      xS += wc2 + 4; void w;
    });
    return { escala: "INDICADA" };
  }


  /* ================================================================ 06B — LIGAÇÕES DIMENSIONADAS (js/metalligdim.js)
     Os detalhes 7 a 11 com o RESULTADO do dimensionamento: escora com chapa, escora passante, mão-francesa na terça, base do
     pilar de tapamento e enrijecedores da alma do U; embaixo, o QUADRO de todas as ligações (cada variante do cálculo).
     Todos em escala real (1:5 ou 1:10) desde 21/11/2026. */
  var ROT_LIG = { placaColuna: "PLACA DA COLUNA TRELIÇADA", placaBase: "PLACA DO PILAR", clip: "CLIP DE TERÇA", contravento: "CONTRAVENTO (BARRA REDONDA)", corrente: "CORRENTE (BARRA REDONDA)",
                  escoraChapa: "ESCORA - PONTA POR CHAPA", escoraPassante: "ESCORA - PONTA PASSANTE", maoFrancesa: "MÃO-FRANCESA", tapamento: "PILAR DE TAPAMENTO - TOPO", almaU: "ALMA DO U SOB CHAPA DE NÓ", outra: "OUTRAS" };
  var DET_LIG = { placaColuna: "1A", clip: "4", contravento: "5", escoraChapa: "7", escoraPassante: "8", maoFrancesa: "9", placaBase: "10", tapamento: "10", almaU: "11" };
  function ligCurto(cat, l) {
    var q = l.dimensoes || {};
    if (cat === "placaColuna") return "PLACA t " + mmBr(l.t, 1) + " mm; " + l.nChumb + " CHUMB. Ø " + l.chumbador + " ANC. " + l.ancoragem + " mm; FILETE " + num(l.soldaDw, 3) + " mm";
    if (cat === "placaBase") return "PLACA " + q.B + " x " + q.L + " x " + mmBr(q.t, 1) + " mm; " + (q.chumbadores || {}).n + " CHUMB. Ø " + (q.chumbadores || {}).id + " ANC. " + (q.chumbadores || {}).ancoragem + " mm";
    if (cat === "clip") return "CLIP " + catTxt(q.cat) + " x " + q.comprimento + " mm; " + q.n + " x " + q.parafuso + " " + q.classe + "; FILETE " + q.solda + " mm";
    if (cat === "contravento" || cat === "corrente") return "Ø " + mmBr(q.d, 1) + " mm; CHAPA " + mmBr((q.chapa || {}).b, 0) + " x " + mmBr((q.chapa || {}).t, 1) + " mm; FILETE " + q.solda + " mm";
    if (cat === "escoraPassante") return l.n + " x " + l.id + " " + l.classe + " PASSANTES (2 PLANOS); CHAPA 8 mm NO RASGO";
    if (cat === "almaU") return l.enrijecedores ? "2 ENRIJ. " + mmBr(l.enrijecedores.t, 1) + " x " + mmBr(l.enrijecedores.h, 0) + " x " + mmBr(l.enrijecedores.comprimento, 0) + " mm" : "SEM ENRIJECEDOR (A ALMA RESISTE)";
    if (l.terca) return l.n + " x " + l.id + " " + l.classe + " NA CANTONEIRA; CHAPA 6,35 -> TERÇA " + l.terca.n + " x " + l.terca.id + " " + l.terca.classe;
    if (l.n) return l.n + " x " + l.id + " " + l.classe + (l.soldaPeca ? "; CHAPA 8 mm, " + l.soldaPeca.filetes + " FILETES " + l.soldaPeca.dw + " x " + l.soldaPeca.Lw + " mm" : "");
    if (l.dw) return "FILETE " + l.dw + " x " + l.Lw + " mm";
    return String(l.resumo || "").toUpperCase();
  }
  function parafusos(D, x, y, n, pas, r) { for (var i = 0; i < n; i++) D.furo(x + i * pas, y, r); }
  /* PONTA PARAFUSADA EM ESCALA (7, 8 e 9) — vista no plano da chapa: a face do apoio (contexto, interrompida), a chapa do apoio
     (pena de corte), a peça cortada com a linha de interrupção, os furos com o eixo, cotas de borda e de passo (r.ligDim: n, passo,
     borda), a solda da chapa na peça com a perna (soldaPeca) e as chamadas numa coluna. A largura da chapa = o lado da peça que
     ela recebe (a chapa entra no rasgo / encosta na aba) — regra escrita na nota do detalhe. */
  function detPonta(D, c, cl, cw, chh, numero, titulo, P) {
    var T = D.E.T, A = AP(), hn = T.nota * 0.85, n = Math.max(1, num(P.n, 2)), p = num(P.passo, 40), e = num(P.borda, 25), d = num(P.d, 12), fol = 15;
    var H = Math.max(P.H, 2 * e), xs = []; for (var i = 0; i < n; i++) xs.push(fol + e + i * p);
    var xch = xs[n - 1] + e, xt = P.passante ? fol : xch + 10, LT = 300, wT = P.wPeca;
    var ext = [-70, -Math.max(H, wT) / 2 - 100, xt + LT + 30, Math.max(H, wT) / 2 + 100];
    var wCol = 0; P.cham.forEach(function (q) { q.l.forEach(function (s) { wCol = Math.max(wCol, largT(typeof s === "object" ? s.t : s, hn) + 6); }); });
    var nN = P.notas.reduce(function (s, q) { return s + A.quebrar(typeof q === "object" ? q.t : q, T.nota * 0.9, cw - 4).length; }, 0);
    var M = moldaDet(cl, cw, chh, ext, wCol, nN * T.nota * 0.9 * 1.45 + 4), F = M.F, k = M.k, i0 = D.s.length;
    A.tituloVista(D, cl.x, cl.y, titulo, "ESC 1:" + M.esc, numero);
    /* face do apoio */
    var yA = Math.max(H, wT) / 2 + 20, a0 = F(0, yA), a1 = F(0, -yA), a2 = F(-30, yA), a3 = F(-30, -yA);
    D.linha(a0[0], a0[1], a1[0], a1[1], "MET-PERFIL"); D.linha(a2[0], a2[1], a3[0], a3[1], "MET-CONTEXTO");
    D.quebra(a2[0], a2[1], a0[0], a0[1]); D.quebra(a3[0], a3[1], a1[0], a1[1]);
    /* chapa do apoio (pena de corte); na passante, a parte dentro do tubo em oculta */
    var c0 = F(0, H / 2); D.ret(c0[0], c0[1], xch * k, H * k, "MET-PERFIL-CORTE");
    /* chapa da peça (soldada na ponta) */
    if (P.chapaPeca) { var q0 = F(fol, H / 2 + 0.01); D.ret(q0[0], q0[1] - 0.6, (xt - fol + P.chapaPeca.Lw) * k, H * k + 1.2, "MET-PERFIL-CORTE"); }
    /* a peça: contorno do lado wT, cortada; o trecho da chapa dentro dela em oculta */
    if (P.cantoneira) barraDet(D, F, [xt, -wT / 2 + P.g], [xt + LT, -wT / 2 + P.g], wT, { quebra: true, fecha: true, eixo: false });
    else barraDet(D, F, [xt, 0], [xt + LT, 0], wT, { quebra: true, fecha: true });
    if (P.passante || P.chapaPeca) { var o1 = F(xt, H / 2 - 1), o2 = F(P.passante ? xch : xt + P.chapaPeca.Lw, H / 2 - 1); if (o2[0] > o1[0]) D.ret(o1[0], o1[1], o2[0] - o1[0], (H - 2) * k, "MET-OCULTA"); }
    /* eixo da linha de furação e os furos */
    var yF = P.cantoneira ? -wT / 2 + P.g : 0, e0 = F(-10, yF), e1 = F(xt + LT + 20, yF); D.linha(e0[0], e0[1], e1[0], e1[1], "MET-EIXO");
    xs.forEach(function (x) { var f = F(x, yF); D.furo(f[0], f[1], (d + 1.5) / 2 * k); });
    if (P.terca) { var nt = Math.max(1, num(P.terca.n, 2)); for (var j = 0; j < nt; j++) { var yt = (j - (nt - 1) / 2) * p, ft = F(-e - 30 + 30, yt); void ft; } }
    /* cotas: borda / passo / borda ao longo da furação (acima), a largura da chapa (à esquerda) */
    var yC = F(0, H / 2)[1], pts = [F(fol, 0)[0]].concat(xs.map(function (x) { return F(x, 0)[0]; })).concat([F(xch, 0)[0]]), vv = [String(e)];
    for (var i2 = 1; i2 < n; i2++) vv.push(String(p)); vv.push(String(e));
    D.cadeia(pts.map(function (x) { return [x, yC]; }), 6, vv, {});
    var xL = F(0, 0)[0];
    if (P.cantoneira) D.cadeia([[xL, F(0, -H / 2)[1]], [xL, F(0, yF)[1]], [xL, F(0, H / 2)[1]]], 6, [String(Math.round(H / 2 + yF)), String(Math.round(H / 2 - yF))], {});
    else D.cadeia([[xL, F(0, -H / 2)[1]], [xL, F(0, H / 2)[1]]], 6, [String(Math.round(H))], {});
    /* solda da chapa da peça (perna x comprimento) */
    if (P.chapaPeca) soldaDet(D, F(xt + P.chapaPeca.Lw / 2, wT / 2), -60, P.chapaPeca.dw, P.chapaPeca.filetes + " x " + P.chapaPeca.Lw);
    var itens = P.cham.map(function (q) { var f = F(q.p[0] === "t" ? xt + LT * 0.6 : q.p[0], q.p[1] === "t" ? wT / 2 : q.p[1]); return { p: f, l: q.l }; });
    colunaCham(D, M.xCol, itens, hn, M.yIni); eixosDet(D);
    D.textos(cl.x, M.yFim + 2, P.notas, T.nota * 0.9, { wmax: cw - 4 });
    blocoDet(D, i0, "DET-" + numero, M.esc, cl.x, cl.y, cw, chh);
    return i0;
  }
  function folhaLigacoes(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, A = AP(), nota = T.nota, L = ligDimDe(d);
    var cw = (a.w - 12) / 3, chh = (a.h - c.reservaBaixo - 8) * 0.5 / 2;
    function celula(i) { return { x: a.x + 4 + (i % 3) * (cw + 2), y: a.y + 2 + Math.floor(i / 3) * (chh + 4) }; }
    function marcaDe(l) { var m = L.desenho[l.membro]; return m ? m.marca : (l.peca || ""); }
    function perfilDe(l) { var m = L.desenho[l.membro]; return m ? c.perfil(m.perfil) : ""; }
    var cel = 0;
    function notas(cl, linhas, vs, cat) { D.textos(cl.x, cl.y + chh - 24, linhas.concat([variantes(vs, function (g) { return ligCurto(cat, g.l); })]), nota * 0.9, { wmax: cw - 4 }); }
    function ladoDe(l, d0) { var m = L.desenho[l.membro]; if (!m) return d0; var q = dimSec(m); return q.forma === "I" ? Math.max(num(q.s.b, 0), num(q.s.a, 0), Math.min(q.hy, q.bz)) || d0 : q.hy; }
    /* 7 — escora: ponta rotulada por chapa (chapa da peça soldada, parafusada na chapa do apoio) */
    var v7 = ligVar(d, "escoraChapa");
    if (v7.length) {
      var l = v7[0].l, cl = celula(cel++), i0 = D.s.length, w7 = ladoDe(l, 100), n7 = Math.max(1, num(l.n, 2));
      detPonta(D, c, cl, cw, chh, 7, "ESCORA - PONTA ROTULADA POR CHAPA", { n: n7, passo: l.passo, borda: l.borda, d: l.d, H: w7, wPeca: w7, chapaPeca: l.soldaPeca ? { dw: l.soldaPeca.dw, Lw: l.soldaPeca.Lw, filetes: l.soldaPeca.filetes } : null,
        cham: [{ p: [6, -w7 / 2 + 4], l: ["CHAPA DO APOIO # 8 (A36)"] }, { p: [30, w7 / 2 - 4], l: ["CHAPA DA PEÇA # 8 (A36)"] }, { p: [15 + num(l.borda, 25), 0], l: [n7 + " PARAF. " + l.id + " " + l.classe, "FURO Ø " + mmBr(num(l.d, 12) + 1.5, 1)] }, { p: ["t", "t"], l: [marcaDe(l) + " - " + perfilDe(l)] }],
        notas: [n7 + " PARAFUSOS " + l.id + " " + l.classe + " (1 PLANO DE CORTE), PASSO " + num(l.passo, 40) + " mm, BORDA " + num(l.borda, 25) + " mm; FOLGA 15 mm ATÉ O APOIO. LARGURA DAS CHAPAS = LADO DA PEÇA.",
          l.soldaPeca ? "CHAPA 8 mm (ASTM A36) NO RASGO DA PEÇA: " + l.soldaPeca.filetes + " FILETES DE " + l.soldaPeca.dw + " mm x " + l.soldaPeca.Lw + " mm - DIMENSIONADO." : "DIMENSIONADO.",
          variantes(v7, function (g) { return ligCurto("escoraChapa", g.l); })] });
      grupoDim(D, i0, "escoraChapa", v7);
    }
    /* 8 — escora passante: a chapa do apoio entra no rasgo do tubo e os parafusos atravessam as duas paredes */
    var v8 = ligVar(d, "escoraPassante");
    if (v8.length) {
      var l8 = v8[0].l, cl8 = celula(cel++), i8 = D.s.length, w8 = ladoDe(l8, 100), n8 = Math.max(1, num(l8.n, 2));
      detPonta(D, c, cl8, cw, chh, 8, "ESCORA - PONTA PASSANTE (PAREDE FINA)", { n: n8, passo: l8.passo, borda: l8.borda, d: l8.d, H: w8 - 10, wPeca: w8, passante: true,
        cham: [{ p: [6, -(w8 - 10) / 2 + 4], l: ["CHAPA DO APOIO # 8 (A36)", "NO RASGO DO TUBO"] }, { p: [15 + num(l8.borda, 25), 0], l: [n8 + " PARAF. PASSANTES " + l8.id + " " + l8.classe, "FURO Ø " + mmBr(num(l8.d, 12) + 1.5, 1)] }, { p: ["t", "t"], l: [marcaDe(l8) + " - " + perfilDe(l8)] }],
        notas: [n8 + " PARAFUSOS PASSANTES " + l8.id + " " + l8.classe + " (2 PLANOS DE CORTE) PELAS DUAS PAREDES DO TUBO E PELA CHAPA, PASSO " + num(l8.passo, 40) + " mm, BORDA " + num(l8.borda, 25) + " mm. CHAPA = LADO INTERNO DO TUBO MENOS A FOLGA.",
          "SEM SOLDA NA PAREDE FINA DO TUBO (MENOR QUE O FILETE MÍNIMO DE 3 mm) - DIMENSIONADO (NBR 8800 + NBR 14762).", variantes(v8, function (g) { return ligCurto("escoraPassante", g.l); })] });
      grupoDim(D, i8, "escoraPassante", v8);
    }
    /* 9 — mão-francesa: cantoneira parafusada na chapa 6,35 mm (furos na linha de gabarito); a chapa na alma da terça */
    var v9 = ligVar(d, "maoFrancesa");
    if (v9.length) {
      var g9 = v9.filter(function (g) { return g.l.terca; })[0] || v9[0], l9 = g9.l, cl9 = celula(cel++), i9 = D.s.length, w9 = ladoDe(l9, 50), n9 = Math.max(1, num(l9.n, 2)), gg = num(l9.gage, w9 / 2);
      detPonta(D, c, cl9, cw, chh, 9, "MÃO-FRANCESA - PONTA PARAFUSADA", { n: n9, passo: l9.passo, borda: l9.borda, d: l9.d, H: Math.max(w9, 2 * num(l9.borda, 25)), wPeca: w9, cantoneira: true, g: w9 - gg,
        cham: [{ p: [6, -w9 / 2 + 3], l: ["CHAPA # 6,35 (A36)", l9.terca ? "PARAFUSADA NA TERÇA" : "SOLDADA NO APOIO"] }, { p: [15 + num(l9.borda, 25), -w9 / 2 + (w9 - gg)], l: [n9 + " PARAF. " + l9.id + " " + l9.classe, "GABARITO " + mmBr(gg, 0)] }, { p: ["t", w9 / 2], l: [marcaDe(l9) + " - " + perfilDe(l9)] }],
        notas: [n9 + " PARAFUSOS " + l9.id + " " + l9.classe + " DA CANTONEIRA NA CHAPA 6,35 mm, NA LINHA DE GABARITO (" + mmBr(gg, 0) + " mm DA QUINA).",
          l9.terca ? "CHAPA PARAFUSADA NA ALMA DA TERÇA: " + l9.terca.n + " PARAFUSOS " + l9.terca.id + " " + l9.terca.classe + " (PAREDE " + mmBr(l9.terca.t, 2) + " mm MENOR QUE O FILETE MÍNIMO - SEM SOLDA NA TERÇA) - DIMENSIONADO." : "CHAPA SOLDADA NO APOIO (2 FILETES) - DIMENSIONADO.",
          variantes(v9, function (g) { return ligCurto("maoFrancesa", g.l); })] });
      grupoDim(D, i9, "maoFrancesa", v9);
    }
    /* 10 — base do pilar de tapamento (placa rotulada) e a ligação do topo */
    var v10 = ligVar(d, "placaBase"), vT = ligVar(d, "tapamento");
    if (v10.length) {
      var ds10 = null, l10 = v10[0].l, q10 = l10.dimensoes || {}, ch10 = q10.chumbadores || {}, cl10 = celula(cel++), i10 = D.s.length, m10 = L.desenho[l10.membro];
      var es10 = escala(ESC("detalhe"), num(q10.B, 300) / 1000 + 0.06, num(q10.L, 300) / 1000 + 0.06, cw - 50, chh - 60), k10 = 1 / es10;
      A.tituloVista(D, cl10.x, cl10.y, "BASE DO PILAR DE TAPAMENTO - PLANTA", "ESC 1:" + es10, 10);
      var W10 = num(q10.B, 300) * k10, H10 = num(q10.L, 300) * k10, px10 = cl10.x + 20, py10 = cl10.y + 24, e10 = num(ch10.borda, 40) * k10, pl = Math.max(2, num(ch10.porLado, 2));
      D.ret(px10, py10, W10, H10, "MET-PERFIL");
      if (m10) { ds10 = dimSec(m10); D.ret(px10 + W10 / 2 - ds10.bz * k10 / 2, py10 + H10 / 2 - ds10.hy * k10 / 2, ds10.bz * k10, ds10.hy * k10, "MET-PRINCIPAL"); }
      for (var ix = 0; ix < pl; ix++) [0, 1].forEach(function (iy) { D.furo(px10 + e10 + ix * (W10 - 2 * e10) / Math.max(1, pl - 1), py10 + e10 + iy * (H10 - 2 * e10), (num(ch10.d, 19.05) + 6) / 2 * k10); });
      var eB = num(ch10.borda, 40), cxs = [px10, px10 + e10, px10 + W10 - e10, px10 + W10], cys = [py10 + H10, py10 + H10 - e10, py10 + e10, py10];
      D.linha(px10 + W10 / 2, py10 - 4, px10 + W10 / 2, py10 + H10 + 4, "MET-EIXO"); D.linha(px10 - 4, py10 + H10 / 2, px10 + W10 + 4, py10 + H10 / 2, "MET-EIXO");
      D.cadeia(cxs.map(function (x) { return [x, py10]; }), 6, [String(eB), String(num(q10.B, 300) - 2 * eB), String(eB)], {});
      D.cota(px10, py10, px10 + W10, py10, 12, String(q10.B));
      D.cadeia(cys.map(function (y) { return [px10, y]; }), 6, [String(eB), String(num(q10.L, 300) - 2 * eB), String(eB)], {});
      D.cota(px10, py10 + H10, px10, py10, 12, String(q10.L));
      if (m10) soldaDet(D, [px10 + W10 / 2 + ds10.bz * k10 / 2, py10 + H10 / 2 - ds10.hy * k10 / 4], -30, num(q10.solda, 5), null, { contorno: true, ls: 10 });
      colunaCham(D, px10 + W10 + 30, [{ p: [px10 + W10 - 1, py10 + H10 - 3], l: ["PLACA # " + mmBr(q10.t, 1) + " x " + q10.B + " x " + q10.L, "ASTM A36"] }, { p: [px10 + e10 + (num(ch10.d, 19.05) + 6) / 2 * k10 * 0.7, py10 + e10 - (num(ch10.d, 19.05) + 6) / 2 * k10 * 0.7], l: [ch10.n + " CHUMB. Ø " + ch10.id + " C/ GANCHO", "FURO Ø " + Math.round(num(ch10.d, 19.05) + 6)] }].concat(m10 ? [{ p: [px10 + W10 / 2, py10 + H10 / 2], l: [m10.marca + " - " + c.perfil(m10.perfil)] }] : []), T.nota * 0.85, py10);
      notas(cl10, ["PLACA " + q10.B + " x " + q10.L + " x " + mmBr(q10.t, 1) + " mm - ASTM A36 (ROTULADA); " + ch10.n + " CHUMBADORES Ø " + ch10.id + " " + (ch10.material || "") + " COM GANCHO, ANCORAGEM " + ch10.ancoragem + " mm; SOLDA " + (q10.soldaMesas || ("FILETE " + q10.solda + " mm")) + " EM VOLTA DO PILAR.",
        vT.length ? "TOPO: " + ligCurto("tapamento", vT[0].l) + " - DIMENSIONADO." : ""], v10, "placaBase");
      grupoDim(D, i10, "placaBase", v10.concat(vT));
    }
    /* 11 — enrijecedores da alma do U (seção do banzo da coluna no nó com chapa) */
    var v11 = ligVar(d, "almaU").filter(function (g) { return g.l.enrijecedores; });
    if (v11.length) {
      var l11 = v11[0].l, en = l11.enrijecedores, m11 = L.desenho[l11.membro], cl11 = celula(cel++), i11 = D.s.length;
      if (m11) {
        var ds11 = dimSec(m11), es11 = escala(ESC("detalhe"), ds11.bz / 1000 + 0.08, ds11.hy / 1000 + 0.04, cw - 60, chh - 60), k11 = 1 / es11, t11 = num(ds11.s.t, 3) * k11;
        A.tituloVista(D, cl11.x, cl11.y, "ENRIJECEDORES DA ALMA DO U NO NÓ", "ESC 1:" + es11, 11);
        var xc11 = cl11.x + 30, yc11 = cl11.y + 22 + ds11.hy * k11 / 2;
        secaoDesenho(D, m11, xc11, yc11, k11);
        var bx = xc11 - ds11.bz * k11 / 2 + t11, by = yc11 - ds11.hy * k11 / 2 + t11;
        D.ret(bx, by, num(en.h, 90) * k11, ds11.hy * k11 - 2 * t11, "MET-PERFIL");
        D.cota(xc11 + ds11.bz * k11 / 2 + 6, yc11 + ds11.hy * k11 / 2, xc11 + ds11.bz * k11 / 2 + 6, yc11 - ds11.hy * k11 / 2, 0, String(Math.round(ds11.hy)), { foraSeUnico: true });
        var enM = arr(L.LD.modelo && L.LD.modelo.enrijecedores).filter(function (q) { return q.membro === l11.membro; })[0] || {}, enA = ((en.soldaAlma || enM.soldaAlma) || {}).dw || null, enB = ((en.soldaAbas || enM.soldaAbas) || {}).dw || null;
        if (enA) soldaDet(D, [bx, yc11 + ds11.hy * k11 / 4], 150, enA, null, { ls: 9 });
        if (enB) soldaDet(D, [bx + num(en.h, 90) * k11 * 0.6, by], -60, enB, null, { ls: 9 });
        /* VISTA LATERAL (22/11/2026): o U pelo lado aberto, ao longo da barra — o par de enrijecedores nas bordas da chapa de nó (Lg do
           cálculo, js/metalligdim.js), com a distância entre eles e a altura de cada um; a barra interrompida dos dois lados. A chamada
           do enrijecedor sai da vista lateral (à direita dela); sem lugar para a vista, fica a chamada na seção, como antes */
        var mLg = /chapa [\d,.]+ × (\d+) mm/.exec(String(l11.resumo || "")), LgE = num(enM.Lg, 0) > 0 ? num(enM.Lg, 0) * 1000 : (mLg ? +mLg[1] : 0), rotE = "ENRIJECEDOR " + mmBr(en.t, 1) + " x " + mmBr(en.h, 0) + " x " + mmBr(en.comprimento, 0) + " mm";
        var xL0 = xc11 + ds11.bz * k11 / 2 + 18, LvE = (LgE + 240) * k11, hU = ds11.hy * k11, xChE = xL0 + LvE + 20;
        if (LgE > 0 && xChE + largT(rotE, T.nota) + 4 <= cl11.x + cw) {
          var yT11 = yc11 - hU / 2, yB11 = yc11 + hU / 2, xm11 = xL0 + LvE / 2, cE = num(en.comprimento, ds11.hy) * k11, tE = Math.max(0.35, num(en.t, 8) * k11);
          D.texto(xm11, yT11 - 4, "VISTA LATERAL", T.nota * 0.85, { al: "C" });
          [yT11, yB11, yT11 + t11, yB11 - t11].forEach(function (yy) { D.linha(xL0, yy, xL0 + LvE, yy, "MET-PERFIL"); });
          D.quebra(xL0, yT11, xL0, yB11); D.quebra(xL0 + LvE, yT11, xL0 + LvE, yB11);
          [-1, 1].forEach(function (sg) { var xe = xm11 + sg * LgE / 2 * k11 - (sg > 0 ? tE : 0); D.ret(xe, yc11 - cE / 2, tE, cE, "MET-PERFIL-CORTE"); });
          D.cota(xm11 - LgE / 2 * k11, yB11, xm11 + LgE / 2 * k11, yB11, -7, String(Math.round(LgE)), { foraSeUnico: true });
          D.cota(xL0 + LvE + 6, yc11 + cE / 2, xL0 + LvE + 6, yc11 - cE / 2, 0, String(Math.round(num(en.comprimento, 0))), { foraSeUnico: true });
          D.chamada(xm11 + LgE / 2 * k11 - tE / 2, yc11 - cE / 4, xChE, yc11 - cE / 2 - 4, [rotE, "(PAR - BORDAS DA CHAPA)"], {});
        } else D.chamada(bx + num(en.h, 90) * k11 / 2, yc11, xc11 + ds11.bz * k11 / 2 + 24, yc11 - 10, [rotE], {});
        notas(cl11, ["PAR DE ENRIJECEDORES (ASTM A36) DENTRO DO " + c.perfil(m11.perfil) + ", NAS BORDAS DA CHAPA DE NÓ; SOLDADOS NA ALMA E NAS ABAS - DIMENSIONADO (" + l11.resumo + ")."], v11, "almaU");
        grupoDim(D, i11, "almaU", v11);
      }
    }
    /* QUADRO DAS LIGAÇÕES DIMENSIONADAS — cada variante do cálculo */
    var yQ = a.y + 2 + 2 * (chh + 4) + 4, i12 = D.s.length, linhas = [], todas = [];
    Object.keys(ROT_LIG).forEach(function (cat) {
      (L.porTipo[cat] || []).forEach(function (g) {
        todas.push(g);
        var mk = g.marcas.slice(0, 4).join(", ") + (g.marcas.length > 4 ? " +" + (g.marcas.length - 4) : "");
        linhas.push([DET_LIG[cat] || "-", ROT_LIG[cat], mk || "-", ligCurto(cat, g.l), String(g.n), { t: mmBr(g.razao, 2), cor: g.ok ? null : VERMELHO }]);
      });
    });
    var hTit = A.tituloVista(D, a.x + 4, yQ, "QUADRO DAS LIGAÇÕES DIMENSIONADAS (NBR 8800:2008)", String(L.LD.n) + " LIGAÇÕES, " + L.LD.reprovados + " REPROVADA(S) - VARIANTES DO CÁLCULO") + 1;
    var hl = Math.max(4.4, T.tabela * 1.85), cab = 2 * hl + 2, disp = a.y + a.h - c.reservaBaixo - (yQ + hTit) - cab - 10, porBloco = Math.max(4, Math.floor(disp / hl));
    var wc = [10, 0, 0, 0, 12, 14], hs = ["DET.", "LIGAÇÃO", "PEÇAS", "DIMENSIONADO", "QTD.", "RAZÃO"];
    linhas.forEach(function (r) { [1, 2, 3].forEach(function (k) { wc[k] = Math.max(wc[k], largT(r[k], T.tabela) + 3, largT(hs[k], T.tabelaCab) + 3); }); });
    var Wt = wc.reduce(function (q, w) { return q + w; }, 0), cols = hs.map(function (h, k) { return { t: h, w: wc[k], al: k >= 1 && k <= 3 ? "E" : undefined }; });
    var nBl = Math.max(1, Math.floor((a.w - 8 + 6) / (Wt + 6))), cabe = linhas.slice(0, nBl * porBloco), xT = a.x + 4;
    for (var k = 0; k < cabe.length; k += porBloco) { D.tabela(xT, yQ + hTit, cols, cabe.slice(k, k + porBloco), {}); xT += Wt + 6; }
    if (linhas.length > cabe.length) D.textos(a.x + 4, a.y + a.h - c.reservaBaixo - 8, [{ t: "E MAIS " + (linhas.length - cabe.length) + " VARIANTE(S): NO MEMORIAL DE CÁLCULO (LIGAÇÕES DIMENSIONADAS).", cor: VERMELHO }], nota * 0.9, {});
    grupoDim(D, i12, "quadro", todas);
    return { escala: "INDICADA" };
  }

  /* ================================================================ 07 — LISTA DE MATERIAIS (por conjunto e marca) */
  function linhasLista(d, c) {
    var tr = d.tr, L = [], tot = 0;
    ORDEM_CONJ.forEach(function (cj) {
      var gs = tr.marcas.filter(function (g) { return g.conj === cj; }); if (!gs.length) return;
      var tipos = tr.conjTipos.filter(function (t) { return t.tipo === cj; });
      var sub = 0;
      if (tipos.length) {
        tipos.forEach(function (t) {
          var nC = t.conjuntos.length;
          L.push({ titulo: CONJ[cj] + " - " + t.marca + " (" + nC + " CONJUNTO" + (nC > 1 ? "S" : "") + ")" });
          Object.keys(t.comp).sort(natural).forEach(function (mk) {
            var g = gPorMarca(tr, mk), q = t.comp[mk] * nC, kg = g.L * g.massa;
            sub += q * kg;
            L.push([acoCurto(g.aco), mk, g.desc, c.perfil(g.perfil), String(q), String(g.Lmm), c.br(q * g.L, 2), c.br(q * kg, 1)]);
          });
        });
      } else {
        L.push({ titulo: CONJ[cj] });
        gs.sort(function (q, w) { return natural(q.marca, w.marca); }).forEach(function (g) { var q = g.membros.length, kg = g.L * g.massa; sub += q * kg; L.push([acoCurto(g.aco), g.marca, g.desc, c.perfil(g.perfil), String(q), String(g.Lmm), c.br(q * g.L, 2), c.br(q * kg, 1)]); });
      }
      L.push({ total: ["", "", "SUBTOTAL " + CONJ[cj], "", "", "", "", c.br(sub, 1)] });
      tot += sub;
    });
    return { linhas: L, total: tot };
  }
  function folhaMateriais(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, A = AP(), lt = linhasLista(d, c);
    /* 21/11/2026: o formato da TABELA DE AÇO do concreto (js/concpranchas.js COLS_TAB: AÇO · POS · BIT · QUANT · C unit · C total) — aqui AÇO · MARCA · DESCRIÇÃO · PERFIL · QUANT · C unit (mm) · C total (m) · PESO (kg) */
    var cols = [{ t: "AÇO", w: 30 }, { t: "MARCA", w: 14 }, { t: "DESCRIÇÃO", w: 54, al: "E" }, { t: "PERFIL", w: 50, al: "E" }, { t: "QUANT", w: 13 }, { t: ["COMPRIMENTO", "UNIT (mm)"], w: 22 }, { t: ["COMPRIMENTO", "TOTAL (m)"], w: 22 }, { t: ["PESO", "(kg)"], w: 18 }];
    var wT = 0; cols.forEach(function (q) { wT += q.w; });
    var y0 = a.y + 14, porBloco = Math.max(8, Math.floor((a.y + a.h - c.reservaBaixo - y0 - 12) / 4.6));
    A.tituloVista(D, a.x + 4, a.y + 2, "TABELA DE AÇO - PEÇAS POR CONJUNTO E MARCA", "COMPRIMENTO PELO EIXO (NÓ A NÓ); O DE CORTE SAI DO DESENHO DE FABRICAÇÃO");
    var x = a.x + 4, blocos = 0;
    for (var k = 0; k < lt.linhas.length; k += porBloco) {
      if (x + wT > a.x + a.w) { c.avisos.push("Lista de materiais: não coube na folha (" + (lt.linhas.length - k) + " linhas)."); break; }
      D.tabela(x, y0, cols, lt.linhas.slice(k, k + porBloco), {}); x += wT + 6; blocos++;
    }
    /* RESUMO POR PERFIL */
    var res = {}, kgT = 0;
    d.membros.forEach(function (m) { var k2 = c.perfil(m.perfil); (res[k2] = res[k2] || { n: 0, L: 0, kg: 0, massa: m.massa, aco: m.aco }); res[k2].n++; res[k2].L += m.L; res[k2].kg += m.L * m.massa; });
    var lr = Object.keys(res).sort(function (q, w) { var a1 = acoCurto(res[q].aco), a2 = acoCurto(res[w].aco); return a1 < a2 ? -1 : a1 > a2 ? 1 : (q < w ? -1 : 1); }).map(function (k3) { kgT += res[k3].kg; return [acoCurto(res[k3].aco), k3, c.br(res[k3].L, 1), c.br(res[k3].massa, 2), c.br(res[k3].kg, 1)]; });
    lr.push({ total: ["", "TOTAL DOS PERFIS", "", "", c.br(num(c.r.peso, kgT), 1)] });
    var cr = [{ t: "AÇO", w: 30 }, { t: "PERFIL", w: 50, al: "E" }, { t: ["COMPR", "(m)"], w: 18 }, { t: ["MASSA", "(kg/m)"], w: 15 }, { t: ["PESO", "(kg)"], w: 20 }], wR = 133;
    var xr = x + wR <= a.x + a.w ? x : a.x + 4, yr = x + wR <= a.x + a.w ? y0 - 12 : y0 + Math.min(lt.linhas.length, porBloco) * 4.6 + 20;
    A.tituloVista(D, xr, yr, "RESUMO DO AÇO POR PERFIL", null);
    var tb = D.tabela(xr, yr + 8, cr, lr, {});
    var dif = Math.abs(kgT - num(c.r.peso, kgT));
    D.textos(xr, yr + 8 + tb.h + 5, ["Peso dos perfis = " + c.br(kgT, 1) + " kg (o do cálculo: " + c.br(c.r.peso, 1) + " kg).", ligDimDe(d) ? "Chapas, parafusos, chumbadores e soldas: dimensionados (quadro das ligações, folha " + c.numFolha("ligacoes") + "); fora do total." : "Chapas, parafusos, chumbadores e soldas: A DIMENSIONAR (fora do total).", "Sem acréscimo de perda: a perda é do orçamento, não do desenho."].concat(dif > 1 ? [{ t: "DIFERENÇA ENTRE A LISTA E O CÁLCULO: " + c.br(dif, 1) + " kg - CONFERIR", cor: VERMELHO }] : []), T.nota * 0.9, { wmax: wR });
    return { escala: "SEM ESCALA", total: kgT };
  }

  /* ================================================================ 08 — ISOMÉTRICA DE MONTAGEM */
  function folhaIsometrica(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, A = AP(), tr = d.tr, E = eixosGalpao(d);
    var cs = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6);
    function pj(P) { return [(P[2] - P[0]) * cs, -(P[1]) - (P[2] + P[0]) * sn]; }
    var us = [], vs = []; d.membros.forEach(function (m) { [m.a, m.b].forEach(function (P) { var q = pj(P); us.push(q[0]); vs.push(q[1]); }); });
    var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs);
    var hNotas = 64, k = Math.min((a.w - 40) / (u1 - u0), (a.h - c.reservaBaixo - hNotas - 30) / (v1 - v0));
    function X(P) { return a.x + 20 + (pj(P)[0] - u0) * k; } function Y(P) { return a.y + 18 + (pj(P)[1] - v0) * k; }
    A.tituloVista(D, a.x + 4, a.y + 2, "PERSPECTIVA ISOMÉTRICA DE MONTAGEM", "SEM ESCALA");
    d.membros.forEach(function (m) {
      var cam = m.cls.conj === "COL" || m.cls.conj === "TES" ? "MET-PERFIL" : (m.cls.conj === "COR" || m.cls.conj === "MF" ? "MET-OCULTA" : (m.cls.conj === "CTV" ? "MET-CONTRAVENTO" : "MET-FINA"));
      if (m.cls.pre === "BF" || m.cls.pre === "BN" || m.cls.pre === "BS" || m.cls.pre === "BI") cam = "MET-PRINCIPAL";
      D.linha(X(m.a), Y(m.a), X(m.b), Y(m.b), cam);
    });
    /* balões dos eixos no chão e marcas de conjunto no 1º pórtico */
    /* balão de eixo no chão, na ponta do eixo que tem lugar livre (dentro da área, sem linha cruzando) */
    function balaoEixo(nome, P0, P1) {
      var r = D.raioBalao(nome) + 0.6, ar = [a.x + r + 1, a.y + r + 1, a.x + a.w - r - 1, a.y + a.h - r - 1];
      for (var dd = 2.5; dd <= 9; dd += 1.5) for (var k = 0; k < 2; k++) {
        var A0 = k ? P1 : P0, B0 = k ? P0 : P1, v = [A0[0] - B0[0], 0, A0[2] - B0[2]], L = hip(v[0], v[2]) || 1, Q = [A0[0] + v[0] / L * dd, 0, A0[2] + v[2] / L * dd];
        var qx = X(Q), qy = Y(Q);
        if (qx < ar[0] || qx > ar[2] || qy < ar[1] || qy > ar[3] || !D.livre([qx - r, qy - r, qx + r, qy + r], 0.3)) continue;
        var Pe = [A0[0] + v[0] / L * 0.8, 0, A0[2] + v[2] / L * 0.8], ux = qx - X(Pe), uy = qy - Y(Pe), Lu = hip(ux, uy) || 1;
        D.linha(X(Pe), Y(Pe), qx - ux / Lu * r, qy - uy / Lu * r, "MET-EIXO"); D.balao(qx, qy, nome); return;
      }
    }
    E.z.forEach(function (e) { balaoEixo(e.nome, [d.caixa.x0, 0, e.c], [d.caixa.x1, 0, e.c]); });
    E.x.forEach(function (e) { balaoEixo(e.nome, [e.c, 0, d.caixa.z0], [e.c, 0, d.caixa.z1]); });
    /* sequência de montagem (do modelo: o vão com contravento da cobertura é o 1º a travar) */
    var ch = d.membros.filter(function (m) { return m.cls.pre === "CH"; }), vaos = {};
    ch.forEach(function (m) { var zm = (m.a[2] + m.b[2]) / 2; for (var i = 0; i + 1 < E.z.length; i++) if (zm > E.z[i].c && zm < E.z[i + 1].c) vaos[E.z[i].nome + "-" + E.z[i + 1].nome] = 1; });
    var vv = Object.keys(vaos), y0 = a.y + a.h - c.reservaBaixo - hNotas;
    A.tituloVista(D, a.x + 4, y0, "SEQUÊNCIA DE MONTAGEM", null);
    D.textos(a.x + 4, y0 + 9, [
      "1. CONFERIR A LOCAÇÃO E O NÍVEL DOS CHUMBADORES (FOLHA 01) ANTES DE TRAZER A ESTRUTURA.",
      "2. MONTAR AS COLUNAS E AS TESOURAS DO VÃO CONTRAVENTADO" + (vv.length ? " (EIXOS " + vv.join(", ") + ")" : "") + ", COM AS ESCORAS, OS CONTRAVENTOS E AS TERÇAS DESSE VÃO: É O VÃO QUE TRAVA OS OUTROS.",
      "3. MONTAR OS PÓRTICOS SEGUINTES LIGANDO-OS PELAS TERÇAS E ESCORAS; ESCORAR PROVISORIAMENTE ATÉ FECHAR O VÃO.",
      "4. CONFERIR PRUMO, NÍVEL E ALINHAMENTO; TENSIONAR OS CONTRAVENTOS (PORCA E CONTRAPORCA); SÓ ENTÃO O APERTO FINAL.",
      "5. GRAUTEAR AS BASES (25 mm, NÃO RETRÁTIL); INSTALAR CORRENTES E MÃOS-FRANCESAS; POR ÚLTIMO, AS TELHAS."
    ], T.nota, { wmax: a.w - 8 });
    return { escala: "SEM ESCALA" };
  }

  /* ================================================================ 09 — PERSPECTIVA 3D (VOLUMETRIA) — 23/11/2026
     Pedido do Rogério (Estância Montalvão): "a folha 09 sai só em arame; quero a volumetria 3D de verdade, perfis em volume,
     sombreado, azul-aço, como no BIM". A imagem é a FOTO DA PRÓPRIA CENA do BIM (opcoes.foto3d = BIM.fotoIso: câmera ortográfica,
     fundo branco, sem grade — o mesmo caminho das pranchas do hidro e da arquitetura); nada é desenhado por fora. Uma vista geral
     isométrica e duas ampliadas (o pilar com a base e o joelho coluna-tesoura) da 1ª coluna. Resolução: ≥ 200 dpi no tamanho
     impresso (DPI_3D), até o teto de 4096 px do BIM.fotoIso (acima disso a vista encolhe na folha, nunca a resolução).
     DXF/DWG: a imagem NÃO entra (o js/pranchasdxf.js só leva linha, texto e polígono) — a folha avisa. Sem o 3D aberto (Node,
     teste) a folha não sai e o aviso diz por quê. */
  var DPI_3D = 200, ELEV_ISO = Math.atan(1 / Math.sqrt(2)), PX_MAX = 4096;
  function argsIso3d(b, az, largPx) {
    var A = az * Math.PI / 180, cE = Math.cos(ELEV_ISO), sE = Math.sin(ELEV_ISO), sA = Math.sin(A), cA = Math.cos(A);
    var V = [cE * sA, sE, cE * cA], R = [cA, 0, -sA], U = [-sE * sA, cE, -sE * cA], us = [], vs = [];
    [b.x0, b.x1].forEach(function (x) { [b.y0, b.y1].forEach(function (y) { [b.z0, b.z1].forEach(function (z) { us.push(R[0] * x + R[1] * y + R[2] * z); vs.push(-(U[0] * x + U[1] * y + U[2] * z)); }); }); });
    var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs), mg = Math.max(u1 - u0, v1 - v0) * 0.03;
    u0 -= mg; u1 += mg; v0 -= mg; v1 += mg;
    var T = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
    return { R: R, U: U, V: V, T: T, uT: R[0] * T[0] + R[1] * T[1] + R[2] * T[2], vT: -(U[0] * T[0] + U[1] * T[1] + U[2] * T[2]), u0: u0, u1: u1, v0: v0, v1: v1, largura: largPx,
      min: [b.x0, b.y0, b.z0], max: [b.x1, b.y1, b.z1], instalacoes: false, razao: (u1 - u0) / (v1 - v0),
      /* sem as telhas da cobertura e do fechamento (categorias do BimFoco): a folha mostra a ESTRUTURA em volume — com elas a foto era
         só a caixa cinza do galpão (primeira prova, 23/11) */
      ocultar: { cats: ["coberturas", "paredes", "forros"] } };
  }
  /* a vista na célula (mm de papel): o maior retângulo com a razão da foto; a largura em px dá ≥ DPI_3D (ou encolhe a vista) */
  function vista3d(c, cel, b, az, titulo, numero, avisos) {
    var D = c.D, A = AP(), T = D.E.T, a0 = argsIso3d(b, az, 1000), r = a0.razao, wD = cel.w, hD = cel.h - 14;
    var w = Math.min(wD, hD * r), h = w / r, px = Math.ceil(w / 25.4 * DPI_3D);
    if (px > PX_MAX) { px = PX_MAX; w = Math.min(w, PX_MAX / DPI_3D * 25.4); h = w / r; }
    var f = null; try { f = c.op.foto3d(argsIso3d(b, az, px)); } catch (e) { f = { ok: false, erro: e && e.message }; }
    if (!f || !f.ok || !f.url) { avisos.push("Perspectiva 3D (" + titulo + "): a foto do BIM falhou (" + ((f && f.erro) || "sem imagem") + ")."); return null; }
    A.tituloVista(D, cel.x, cel.y, titulo, "SEM ESCALA", numero);
    var x = cel.x + (cel.w - w) / 2, y = cel.y + 12;
    D.add('<image href="' + f.url + '" x="' + n2(x) + '" y="' + n2(y) + '" width="' + n2(w) + '" height="' + n2(h) + '" preserveAspectRatio="xMidYMid meet" data-foto3d="' + numero + '" data-px="' + px + '" data-dpi="' + Math.round(px / (w / 25.4)) + '"/>');
    D.ret(x, y, w, h, "MET-FINA");
    return { w: w, h: h, px: px, dpi: Math.round(px / (w / 25.4)) };
  }
  function n2(v) { return String(Math.round(v * 1000) / 1000); }
  function folhaPerspectiva3d(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, A = AP(), cx = d.caixa || {}, av = c.avisos;
    var ys = []; d.membros.forEach(function (m) { ys.push(m.a[1], m.b[1]); });
    var yMax = Math.max.apply(null, ys), yMin = Math.min(0, Math.min.apply(null, ys));
    var bG = { x0: cx.x0 - 0.3, x1: cx.x1 + 0.3, y0: yMin - 0.1, y1: yMax + 0.5, z0: cx.z0 - 0.3, z1: cx.z1 + 0.3 };
    /* a 1ª coluna (menor z, menor x): os banzos BF/BN dela — a caixa do pilar com a base e a do joelho */
    var col = d.membros.filter(function (m) { return m.cls.pre === "BF" || m.cls.pre === "BN"; });
    var zc = col.length ? Math.min.apply(null, col.map(function (m) { return m.a[2]; })) : cx.z0, c1 = col.filter(function (m) { return Math.abs(m.a[2] - zc) < 0.05; });
    var xs = c1.map(function (m) { return m.a[0]; }), xmin = xs.length ? Math.min.apply(null, xs) : cx.x0, xmax = xs.length ? Math.max.apply(null, xs) : cx.x0 + 0.6;
    if (xmax - xmin > 3) xmax = xmin + 0.8;
    var yTop = c1.length ? Math.max.apply(null, c1.map(function (m) { return Math.max(m.a[1], m.b[1]); })) : yMax;
    /* o recorte de cima da ampliada da base num NÍVEL DO TRAVEJAMENTO (um horizontal da coluna): cortar no meio de uma diagonal deixava
       um toco solto acima da aba (revisão do print, 23/11) */
    var nivs = d.membros.filter(function (m) { return Math.abs(m.a[1] - m.b[1]) < 0.01 && Math.abs(m.a[2] - zc) < 0.05 && Math.min(m.a[0], m.b[0]) >= xmin - 0.01 && Math.max(m.a[0], m.b[0]) <= xmax + 0.01 && m.a[1] > 1 && m.a[1] < 2.6; }).map(function (m) { return m.a[1]; });
    var yCorte = nivs.length ? Math.max.apply(null, nivs.filter(function (y) { return y <= 2.0; }).concat([Math.min.apply(null, nivs)])) + 0.06 : 1.9;
    var bBase = { x0: xmin - 0.45, x1: xmax + 0.45, y0: -0.15, y1: yCorte, z0: zc - 0.5, z1: zc + 0.5 };
    var bJoelho = { x0: xmin - 0.45, x1: xmax + 1.4, y0: yTop - 1.6, y1: yTop + 0.9, z0: zc - 0.5, z1: zc + 0.5 };
    var hNotas = 16, gap = 8, wG = a.w * 0.62, hU = a.h - c.reservaBaixo - hNotas - 6;
    var rG = vista3d(c, { x: a.x + 4, y: a.y + 2, w: wG - 8, h: hU }, bG, 225, "PERSPECTIVA 3D - VOLUMETRIA DO MODELO", 1, av);
    var xD = a.x + wG + gap, wDt = a.w - wG - gap - 4, hD = (hU - gap) / 2;
    var rB = vista3d(c, { x: xD, y: a.y + 2, w: wDt, h: hD }, bBase, 225, "AMPLIADA - PILAR E PLACA DE BASE", 2, av);
    var rJ = vista3d(c, { x: xD, y: a.y + 2 + hD + gap, w: wDt, h: hD }, bJoelho, 225, "AMPLIADA - JOELHO (COLUNA x TESOURA)", 3, av);
    var dpis = [rG, rB, rJ].filter(Boolean).map(function (q) { return q.dpi; });
    D.textos(a.x + 4, a.y + a.h - c.reservaBaixo - hNotas + 2, [
      "IMAGENS DO MODELO 3D (BIM): PERFIS EM VOLUME COM A COR DO ACABAMENTO; SEM ESCALA, ILUSTRATIVAS - AS MEDIDAS VALEM NAS DEMAIS FOLHAS." + (dpis.length ? " RESOLUÇÃO NA FOLHA: " + Math.min.apply(null, dpis) + " dpi OU MAIS." : ""),
      "NO DXF/DWG ESTA FOLHA SAI SEM AS IMAGENS (SÓ MOLDURA, TÍTULOS E CARIMBO): AS IMAGENS FICAM NO PDF/SVG."], T.nota, { wmax: a.w - 8 });
    return { escala: "SEM ESCALA", fotos: dpis.length };
  }

  /* ================================================================ AS FOLHAS */
  function defs(d) {
    var PF = (AP() && AP().PADRAO_ACO && AP().PADRAO_ACO.folhas) || [];   /* o jogo de folhas do galpão (PADRAO_ACO.folhas): mesmo título onde a folha é a mesma */
    function tit(i, reserva) { return PF[i] || reserva; }
    var tem = function (fn) { return d.membros.some(fn); };
    var L = [
      { id: "locacao", titulo: tit(0, "LOCAÇÃO DAS COLUNAS E DAS BASES"), formato: "A1", fn: folhaLocacao },
      { id: "cobertura", titulo: tit(1, "PLANTA DE COBERTURA"), formato: "A1", fn: folhaCobertura },
      { id: "portico", titulo: "PÓRTICOS (TÍPICO E OITÃO) E COLUNA TRELIÇADA", formato: "A1", fn: folhaPortico },
      { id: "tesoura", titulo: "DETALHE DA TESOURA", formato: "A1", fn: folhaTesoura }
    ];
    if (planosContravento(d).length) L.push({ id: "elevacoes", titulo: "ELEVAÇÕES LONGITUDINAIS (CONTRAVENTAMENTO)", formato: "A1", fn: folhaElevacoes });
    L.push({ id: "detalhes", titulo: tit(4, "DETALHES TÍPICOS DE LIGAÇÃO") + " E SEÇÕES DOS PERFIS", formato: "A1", fn: folhaDetalhes });
    if (ligDimDe(d)) L.push({ id: "ligacoes", titulo: "LIGAÇÕES DIMENSIONADAS - DETALHES E QUADRO", formato: "A1", fn: folhaLigacoes });
    L.push({ id: "materiais", titulo: tit(5, "LISTA DE MATERIAIS"), formato: "A1", fn: folhaMateriais });
    L.push({ id: "isometrica", titulo: "PERSPECTIVA ISOMÉTRICA E SEQUÊNCIA DE MONTAGEM", formato: "A2", fn: folhaIsometrica });
    /* 23/11/2026: a volumetria 3D (foto da cena do BIM) numa folha própria A1 — só com o 3D aberto (opcoes.foto3d) */
    if (d.foto3d) L.push({ id: "perspectiva3d", titulo: "PERSPECTIVA 3D - VOLUMETRIA E AMPLIADAS", formato: "A1", fn: folhaPerspectiva3d });
    void tem;
    return L;
  }

  var AcoPranchasTrelica = { detectar: detectar, preparar: preparar, defs: defs, classe: classe, _int: { linhasLista: linhasLista, larguraVista: larguraVista, natural: natural, planosContravento: planosContravento } };
  global.AcoPranchasTrelica = AcoPranchasTrelica;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoPranchasTrelica;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

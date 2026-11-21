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
  /* AMPLIAÇÃO de uma região do pórtico (janela j0 em m) num retângulo do papel, na maior escala da lista que cabe */
  function ampliacao(D, d, c, ms, x, y, w, h, numero, titulo, j0, notas, lista) {
    var A = AP(), T = D.E.T, wJ = j0[2] - j0[0], hJ = j0[3] - j0[1], esc = escala(lista || [5, 10, 15, 20, 25], wJ, hJ, w - 30, h - 34), s = 1000 / esc;
    A.tituloVista(D, x, y, titulo, "ESC 1:" + esc, numero);
    var x0 = x + 14, yb = y + 18 + hJ * s;
    function X(q) { return x0 + (q - j0[0]) * s; } function Y(q) { return yb - (q - j0[1]) * s; }
    var J = [X(j0[0]), Y(j0[3]), X(j0[2]), Y(j0[1])];
    vistaPortico(D, d, ms, X, Y, s, J, {});
    D.ret(J[0], J[1], J[2] - J[0], J[3] - J[1], "MET-FINA", ' stroke-dasharray="1.5 1"');
    var ja = {}, Ji = [J[0] + 1, J[1] + 1, J[2] - 1, J[3] - 1];
    ms.forEach(function (m) {
      var sg = recorta([X(m.a[0]), Y(m.a[1])], [X(m.b[0]), Y(m.b[1])], Ji); if (!sg || ja[m.marca]) return;
      var wb = larguraVista(m, [0, 0, 1]) / 1000 * s;
      if (rotuloLongo(D, sg[0], sg[1], m.marca + " " + c.perfil(m.perfil), T.nota * 0.85, wb, Ji) || rotuloLongo(D, sg[0], sg[1], m.marca, T.nota * 0.85, wb, Ji)) ja[m.marca] = 1;
    });
    if (notas) D.textos(x, J[3] + 4, [{ t: "A DIMENSIONAR: " + notas, cor: VERMELHO }], T.nota * 0.9, { wmax: w - 4 });
    return { X: X, Y: Y, J: J, s: s, esc: esc };
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
    var esc = escala([50, 75, 100, 125, 150, 200], Lz, Lx, a.w - 2 * mx - 10, a.h - hQuadro - titH - 2 * my - 8);
    var s = 1000 / esc, x0 = a.x + mx + 8, y0 = a.y + titH + my;
    function X(z) { return x0 + (z - d.caixa.z0) * s; } function Y(x) { return y0 + (x - d.caixa.x0) * s; }
    AP().tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE LOCAÇÃO DAS COLUNAS E DAS BASES", "ESC 1:" + esc);
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
    if (zs.length > 1) { var P = zs.map(function (z) { return [X(z), top - 8]; }), v = []; for (var i = 0; i + 1 < zs.length; i++) v.push(String(rmm(zs[i + 1] - zs[i]))); D.cadeia(P, 0, v, {}); D.cadeia([P[0], P[P.length - 1]], 8, [String(rmm(zs[zs.length - 1] - zs[0]))], {}); }
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
          uniqPeca(bases).map(function (b) { return [b.p.m.marca, c.perfil(b.p.m.perfil), vinc, { t: d.bases.some(function (q) { return q.dim; }) ? "VER DETALHE 1" : "A DIMENSIONAR", cor: d.bases.some(function (q) { return q.dim; }) ? null : VERMELHO }]; }), {});
      }
    }
    return { escala: "1:" + esc };
  }
  function uniqPeca(bases) { var v = {}, o = []; bases.forEach(function (b) { if (b.p && !v[b.p.m.marca]) { v[b.p.m.marca] = 1; o.push(b); } }); return o; }

  /* ================================================================ 02 — PLANTA DE COBERTURA */
  function folhaCobertura(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, E = eixosGalpao(d), tr = d.tr;
    var Lz = d.caixa.z1 - d.caixa.z0, Lx = d.caixa.x1 - d.caixa.x0, titH = 14;
    var esc = escala([50, 75, 100, 125, 150, 200], Lz, Lx, a.w - 120, a.h - c.reservaBaixo - titH - 90);
    var s = 1000 / esc, x0 = a.x + 58, y0 = a.y + titH + 44;
    function X(z) { return x0 + (z - d.caixa.z0) * s; } function Y(x) { return y0 + (x - d.caixa.x0) * s; }
    AP().tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE COBERTURA - TERÇAS, CORRENTES E CONTRAVENTAMENTO", "ESC 1:" + esc);
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
    var escP = escala([25, 50, 75, 100, 125], x1r - x0r, y1r - y0r, a.w - 70, a.h * 0.38), s = 1000 / escP;
    var yLow = a.y + 30 + (y1r - y0r) * s + 40;
    var escC = escala([20, 25, 50], cx1 - cx0 + 0.3, cy1 - y0r, 120, a.y + a.h - 26 - yLow - 30), sC = 1000 / escC;
    var wCol = (cx1 - cx0) * sC + 150;
    var px0 = a.x + 36, py0 = a.y + 30 + (y1r - y0r) * s;
    function X(x) { return px0 + (x - x0r) * s; } function Y(y) { return py0 - (y - y0r) * s; }
    A.tituloVista(D, a.x + 4, a.y + 2, "PÓRTICO TÍPICO - EIXO " + (tr.porticos.indexOf(p) + 1) + " (VISTA)", "ESC 1:" + escP);
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
    /* DETALHE DA COLUNA TRELIÇADA (à direita) */
    var dx0 = a.x + 4, dyB = a.y + a.h - 26;
    function XC(x) { return dx0 + 44 + (x - cx0) * sC; } function YC(y) { return dyB - (y - y0r) * sC; }
    var yTit = YC(cy1) - 24;
    A.tituloVista(D, dx0, yTit, "DETALHE DA COLUNA TRELIÇADA " + (clE ? clE.conjunto : ""), "ESC 1:" + escC + " (" + (col.length ? tr.conjTipos.filter(function (t) { return t.marca === clE.conjunto; })[0].conjuntos.length : 0) + " PEÇAS)");
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
    /* PÓRTICO DE EXTREMIDADE (OITÃO): o 1º pórtico com as colunas de tapamento */
    var p1o = tr.porticos[0], z1o = tr.zPor[p1o], oit = membrosPortico(d, p1o, ["COL", "TES"]).concat(d.membros.filter(function (m) { return m.cls.conj === "TAP" && Math.abs(m.a[2] - z1o) < 0.3 && Math.abs(m.b[2] - z1o) < 0.3; }));
    var xo = a.x + 4 + wCol + 10, wo = a.x + a.w - xo - 30;
    if (oit.some(function (m) { return m.cls.conj === "TAP"; }) && wo > 150) {
      var escO = escala([50, 75, 100, 125, 150], x1r - x0r, y1r - y0r, wo - 30, a.y + a.h - yLow - 70), so = 1000 / escO;
      var xo0 = xo + 20, yoB = yLow + 26 + (y1r - y0r) * so;
      function XO(x) { return xo0 + (x - x0r) * so; } function YO(y) { return yoB - (y - y0r) * so; }
      A.tituloVista(D, xo, yLow, "PÓRTICO DE EXTREMIDADE (OITÃO) - EIXO 1 (VISTA)", "ESC 1:" + escO);
      vistaPortico(D, d, oit, XO, YO, so, null, {});
      var taps = oit.filter(function (m) { return m.cls.conj === "TAP"; }).sort(function (q, w) { return q.a[0] - w.a[0]; });
      taps.forEach(function (m) { var xx = XO(m.a[0]), yA = YO(Math.min(m.a[1], m.b[1])), yB = YO(Math.max(m.a[1], m.b[1])); D.rotuloLinha([[xx + 1, yA - 8, yB + 8]], [m.marca + " " + c.perfil(m.perfil), m.marca], T.perfil * 0.9); });
      var xsO = [Ex[0].c].concat(taps.map(function (m) { return m.a[0]; })).concat([Ex[Ex.length - 1].c]);
      D.cadeia(xsO.map(function (x) { return [XO(x), YO(y0r) + 10]; }), 0, xsO.slice(1).map(function (x, k) { return String(rmm(x - xsO[k])); }), {});
      Ex.forEach(function (e) { var xx = XO(e.c), r = D.raioBalao(e.nome); D.linha(xx, YO(y0r) + 3, xx, YO(y0r) + 20 - r, "MET-EIXO"); D.balao(xx, YO(y0r) + 20, e.nome); });
      D.textos(xo, YO(y0r) + 30, ["COLUNAS DE TAPAMENTO (CT) ENTRE A BASE E O BANZO INFERIOR DA TESOURA; LIGAÇÃO NO TOPO: A DIMENSIONAR."], T.nota, { wmax: wo });
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
    var hTab = 74, esc = escala([10, 15, 20, 25, 50], xFim - x0r + 0.4, y1r - y0r, a.w - 60, a.h - c.reservaBaixo - hTab - 80), s = 1000 / esc;
    var px0 = a.x + 40, py0 = a.y + 40 + (y1r - y0r) * s;
    function X(x) { return px0 + (x - x0r) * s; } function Y(y) { return py0 - (y - y0r) * s; }
    var J = [X(x0r) - 30, Y(y1r) - 30, X(xFim), Y(y0r) + 30];
    A.tituloVista(D, a.x + 4, a.y + 2, "DETALHE DA TESOURA " + (ms[0] ? ms[0].conjunto : "") + (sim ? " - MEIA TESOURA (SIMÉTRICA EM RELAÇÃO À CUMEEIRA)" : ""), "ESC 1:" + esc + " - COTAS EM mm A PARTIR DO NÓ 0 (APOIO, EIXO DO BANZO INFERIOR)");
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
    /* TABELAS (letra de 3 mm, linha de 6 mm: legíveis impressas) e, ao lado, as AMPLIAÇÕES do apoio e da cumeeira a 1:10 */
    var yT = Y(y0r) + 32, xT = a.x + 4, OT = { fs: 3.0, fsc: 3.2, hl: 6.0 };
    var ln = nos.map(function (P, i) { return [String(i), String(rmm(P[0] - ori[0])), String(rmm(P[1] - ori[1]))]; });
    var porBloco = Math.max(5, Math.floor((a.y + a.h - yT - 22) / 6.0)), cn = [{ t: "NÓ", w: 14 }, { t: "X (mm)", w: 24 }, { t: "Y (mm)", w: 24 }];
    A.tituloVista(D, xT, yT - 2, "COORDENADAS DOS NÓS", null);
    var x0T = xT;
    for (var k = 0; k < ln.length; k += porBloco) { D.tabela(xT, yT + 7, cn, ln.slice(k, k + porBloco), OT); xT += 62 + 4; }
    xT = Math.max(xT, x0T + largT("COORDENADAS DOS NÓS", T.titulo) + 6) + 6;
    var t = tr.conjTipos.filter(function (q) { return ms[0] && q.marca === ms[0].conjunto; })[0];
    if (t) {
      var lb = Object.keys(t.comp).sort(natural).map(function (mk) { var g = gPorMarca(tr, mk); return [mk, g.desc, c.perfil(g.perfil), String(g.Lmm), String(t.comp[mk])]; });
      A.tituloVista(D, xT, yT - 2, "BARRAS DA TESOURA " + t.marca + " (QUANTIDADE POR TESOURA)", null);
      var cb = [{ t: "MARCA", w: 18 }, { t: "DESCRIÇÃO", w: 44, al: "E" }, { t: "PERFIL", w: 54, al: "E" }, { t: ["COMPR.", "(mm)"], w: 20 }, { t: "QUANT.", w: 18 }];
      var tb = D.tabela(xT, yT + 7, cb, lb, OT);
      D.textos(xT, yT + 7 + tb.h + 5, ["COMPRIMENTO PELO EIXO (NÓ A NÓ). PONTAS DAS BARRAS DA ALMA RECORTADAS NO ENCONTRO COM O BANZO (BOCA DE LOBO).", { t: "SOLDA DOS NÓS: A DIMENSIONAR (VER NOTA 4).", cor: VERMELHO }], T.nota, { wmax: 154 });
      xT += Math.max(154, largT("BARRAS DA TESOURA " + t.marca + " (QUANTIDADE POR TESOURA)", T.titulo)) + 10;
    }
    var msA = membrosPortico(d, p, ["COL", "TES"]), wA = (a.x + a.w - xT - 6) / 2, hA = a.y + a.h - yT + 2;
    if (wA > 90) {
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
    [[1, 50], [1, 75], [1, 100], [2, 75], [2, 100], [1, 125], [2, 125], [1, 150], [2, 150], [1, 200], [2, 200]].some(function (o) {
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
    });
    if (!pl.length) D.textos(a.x + 4, a.y + 20, ["NENHUM PLANO VERTICAL COM CONTRAVENTAMENTO NO MODELO"], T.nota, {});
    return { escala: "1:" + esc };
  }

  /* ================================================================ 06 — DETALHES TÍPICOS */
  function secaoDesenho(D, m, cx, cy, s, o) {
    o = o || {};
    var ds = dimSec(m), q = ds.s, t = num(q.t, 2) * s, h = ds.hy * s, b = ds.bz * s;
    if (ds.forma === "circ") { D.circ(cx, cy, Math.max(0.5, ds.hy / 2 * s), "MET-PERFIL-CORTE"); return [ds.hy * s, ds.hy * s]; }
    if (ds.forma === "tubo") { D.ret(cx - b / 2, cy - h / 2, b, h, "MET-PERFIL-CORTE"); D.ret(cx - b / 2 + t, cy - h / 2 + t, b - 2 * t, h - 2 * t, "MET-PERFIL-CORTE"); return [b, h]; }
    /* U / Ue: alma vertical à esquerda, mesas para a direita, enrijecedor para dentro */
    var P = [[0, 0], [b, 0], [b, t], [t, t], [t, h - t], [b, h - t], [b, h], [0, h]];
    if (ds.forma === "Ue") { var D2 = num(q.D, 0) * s; P = [[0, 0], [b, 0], [b, D2], [b - t, D2], [b - t, t], [t, t], [t, h - t], [b - t, h - t], [b - t, h - D2], [b, h - D2], [b, h], [0, h]]; }
    D.poli(P.map(function (p) { return [cx - b / 2 + p[0], cy - h / 2 + p[1]]; }), "MET-PERFIL-CORTE", true);
    return [b, h];
  }
  function folhaDetalhes(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, A = AP(), tr = d.tr, p = tr.tipico;
    var cw = (a.w - 12) / 3, chh = (a.h - c.reservaBaixo - 8) * 0.62 / 2, nota = T.nota;
    function celula(i) { return { x: a.x + 4 + (i % 3) * (cw + 2), y: a.y + 2 + Math.floor(i / 3) * (chh + 4) }; }
    var ms = membrosPortico(d, p, ["COL", "TES"]);
    /* vista ampliada de uma região do pórtico típico (janela em m, escala da lista) */
    function regiao(i, numero, titulo, j0, notas) {
      var cl = celula(i), wJ = j0[2] - j0[0], hJ = j0[3] - j0[1], esc = escala([5, 10, 15, 20, 25], wJ, hJ, cw - 30, chh - 40), s = 1000 / esc;
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
      D.textos(cl.x, J[3] + 4, [{ t: "A DIMENSIONAR: " + notas, cor: VERMELHO }], nota * 0.9, { wmax: cw - 4 });
      return { X: X, Y: Y, J: J, s: s };
    }
    var bf = ms.filter(function (m) { return m.cls.pre === "BF"; }).sort(function (q, w) { return q.a[0] - w.a[0]; })[0];
    var bn = ms.filter(function (m) { return m.cls.pre === "BN"; }).sort(function (q, w) { return q.a[0] - w.a[0]; })[0];
    var bi = ms.filter(function (m) { return m.cls.pre === "BI"; })[0], bs = ms.filter(function (m) { return m.cls.pre === "BS"; })[0];
    var x0c = bf ? bf.a[0] : 0, wc = bn ? bn.a[0] - x0c : 0.6, yTopo = bf ? Math.max(bf.a[1], bf.b[1]) : 6;
    /* 1 — base da coluna */
    var rb = regiao(0, 1, "BASE DA COLUNA TRELIÇADA", [x0c - 0.25, -0.12, x0c + wc + 0.25, 0.7], "PLACA DE BASE, CHUMBADORES (QUANT., Ø, ANCORAGEM), SOLDA DO BANZO NA PLACA. GRAUTE NÃO RETRÁTIL 25 mm (20 A 50 mm) SOB A PLACA.");
    /* topo da fundação (contexto) e a placa de cada banzo, tracejada (sem medida: A DIMENSIONAR) */
    var yF = rb.Y(-0.025);
    D.linha(rb.J[0] + 1, yF, rb.J[2] - 1, yF, "MET-CONTEXTO");
    var tF = "TOPO DA FUNDAÇÃO / GRAUTE", wF = largT(tF, nota * 0.8), yTF = yF + Math.max(nota, (rb.J[3] - yF) / 2 + nota * 0.3), xTF = Math.max(rb.J[0] + 3, (rb.J[0] + rb.J[2]) / 2 - wF / 2);   /* 21/11: centrado entre os pés dos banzos — o contorno da diagonal de base (2L) no pé do banzo de fora cortava o texto encostado à esquerda */
    D.hachura(rb.J[0] + 1, yF, rb.J[2] - rb.J[0] - 2, rb.J[3] - yF - 1, 1.6, "MET-HACHURA", [[xTF - 1, yTF - nota * 0.8, xTF + 1 + wF, yTF + 0.8]]);
    [bf, bn].forEach(function (m) { if (!m) return; var w = larguraVista(m, [0, 0, 1]) / 1000 * rb.s, xc = rb.X(m.a[0]); D.poli([[xc - w / 2 - 4, rb.Y(0)], [xc + w / 2 + 4, rb.Y(0)], [xc + w / 2 + 4, yF], [xc - w / 2 - 4, yF]], "MET-PEND", true); });
    D.texto(xTF, yTF, tF, nota * 0.8, {});
    /* 2 — nó típico da tesoura: o nó do banzo inferior mais perto de 1/4 do vão */
    var alvo = null;
    if (bi) {
      var xq = bi.a[0] + (bi.b[0] - bi.a[0]) * 0.4, dxB = bi.b[0] - bi.a[0], dyB = bi.b[1] - bi.a[1], LB = hip(dxB, dyB), cand = [];
      ms.forEach(function (m) { if (m.cls.pre === "M") [m.a, m.b].forEach(function (P) { if (Math.abs((P[0] - bi.a[0]) * dyB - (P[1] - bi.a[1]) * dxB) / LB < 0.01) cand.push(P); }); });
      cand.sort(function (q, w) { return Math.abs(q[0] - xq) - Math.abs(w[0] - xq); }); alvo = cand[0];
    }
    if (alvo) regiao(1, 2, "NÓ TÍPICO DA TESOURA (BANZO INFERIOR)", [alvo[0] - 0.42, alvo[1] - 0.18, alvo[0] + 0.42, alvo[1] + 0.5], "SOLDA DE FILETE EM TODO O CONTORNO DAS BARRAS (PERNA E ELETRODO), RECORTE DAS PONTAS (BOCA DE LOBO) - NBR 16239.");
    /* 3 — nó coluna-tesoura (joelho) */
    regiao(2, 3, "NÓ COLUNA - TESOURA (JOELHO)", [x0c - 0.25, yTopo - 1.55, x0c + wc + 0.55, yTopo + 0.3], "LIGAÇÃO DO BANZO SUPERIOR E DO BANZO INFERIOR NA COLUNA (CHAPA, SOLDA OU PARAFUSOS) - ESFORÇOS NO MEMORIAL.");
    /* 4 — clip de terça: olhando ao longo da terça, a TERÇA em seção (alma em pé) apoiada no BANZO SUPERIOR (em vista) */
    var cl4 = celula(3), ter = d.membros.filter(function (m) { return m.cls.conj === "TER"; }).sort(function (q, w) { return w.massa - q.massa; })[0];
    A.tituloVista(D, cl4.x, cl4.y, "FIXAÇÃO DA TERÇA NO BANZO SUPERIOR (CLIP)", "ESC 1:5", 4);
    if (ter && bs) {
      var s4 = 1 / 5, dT = dimSec(ter), hB = larguraVista(bs, [0, 0, 1]) * s4, hT = dT.hy * s4, bT = dT.bz * s4;
      var xC = cl4.x + 30, yTopoB = cl4.y + 22 + hT;
      D.linha(cl4.x + 6, yTopoB, cl4.x + 6 + 80, yTopoB, "MET-PRINCIPAL"); D.linha(cl4.x + 6, yTopoB + hB, cl4.x + 6 + 80, yTopoB + hB, "MET-PRINCIPAL");
      D.quebra(cl4.x + 6, yTopoB - 1.5, cl4.x + 6, yTopoB + hB + 1.5); D.quebra(cl4.x + 86, yTopoB - 1.5, cl4.x + 86, yTopoB + hB + 1.5);
      secaoDesenho(D, ter, xC + bT / 2, yTopoB - hT / 2, s4);
      /* clip em L: aba vertical encostada na alma (lado de fora), aba horizontal sobre o banzo */
      var xa = xC - 0.6, hc = Math.min(hT * 0.6, 22), tc = 0.6;
      D.poli([[xa, yTopoB - hc], [xa - tc, yTopoB - hc], [xa - tc, yTopoB - tc], [xa - 14, yTopoB - tc], [xa - 14, yTopoB], [xa, yTopoB]], "MET-PERFIL", true);
      D.cota(xC, yTopoB - hT - 4, xC + bT, yTopoB - hT - 4, 0, String(Math.round(dT.bz)), { foraSeUnico: true });
      D.cota(xC + bT + 5, yTopoB, xC + bT + 5, yTopoB - hT, 0, String(Math.round(dT.hy)), { foraSeUnico: true });
      D.chamada(xa - 7, yTopoB - tc, xC + bT + 20, yTopoB - hT * 0.55, ["CLIP (CANTONEIRA OU CHAPA DOBRADA)", { t: "A DIMENSIONAR", cor: VERMELHO }], { dir: 1 });
      D.chamada(xC + bT * 0.6, yTopoB - hT + 0.3, xC + bT + 20, yTopoB - hT - 6, [ter.marca + " - " + c.perfil(ter.perfil)], { dir: 1 });
      D.chamada(cl4.x + 70, yTopoB + hB, cl4.x + 92, yTopoB + hB + 9, [bs.marca + " - " + c.perfil(bs.perfil) + " (BANZO SUPERIOR)"], { dir: 1 });
      D.textos(cl4.x, cl4.y + chh - 14, [{ t: "A DIMENSIONAR: CLIP, PARAFUSOS (QUANT., Ø, CLASSE) E A SOLDA DO CLIP NO BANZO.", cor: VERMELHO }], nota * 0.9, { wmax: cw - 4 });
    }
    /* 5 — contravento em barra redonda (fixação típica) */
    var cl5 = celula(4), cv = d.membros.filter(function (m) { return m.cls.conj === "CTV"; })[0];
    A.tituloVista(D, cl5.x, cl5.y, "FIXAÇÃO TÍPICA DO CONTRAVENTO EM BARRA REDONDA", "SEM ESCALA", 5);
    if (cv) {
      var x5 = cl5.x + 20, y5 = cl5.y + 30;
      D.ret(x5, y5, 8, 44, "MET-PRINCIPAL"); D.poli([[x5 + 8, y5 + 10], [x5 + 30, y5 + 10], [x5 + 30, y5 + 28], [x5 + 8, y5 + 28]], "MET-PERFIL", false);
      var ang = 38 * Math.PI / 180, ox = x5 + 22, oy = y5 + 19, L5 = 70;
      D.linha(ox, oy, ox + Math.cos(ang) * L5, oy + Math.sin(ang) * L5, "MET-CONTRAVENTO");
      D.ret(ox + Math.cos(ang) * 3 - 1.5, oy + Math.sin(ang) * 3 - 1.5, 3, 3, "MET-FINA");
      D.chamada(x5 + 28, y5 + 12, x5 + 52, y5 + 2, ["CHAPA DE LIGAÇÃO (GUSSET)", { t: "A DIMENSIONAR", cor: VERMELHO }], {});
      D.chamada(ox + Math.cos(ang) * 40, oy + Math.sin(ang) * 40, ox + 64, oy + 48, [cv.marca + " - " + c.perfil(cv.perfil) + " ROSCADA", "PORCA + CONTRAPORCA + ARRUELA"], {});
      D.textos(cl5.x, cl5.y + chh - 14, [{ t: "A DIMENSIONAR: CHAPA, ROSCA E SOLDA. TENSIONAR NA MONTAGEM (PORCA E CONTRAPORCA) APÓS O PRUMO.", cor: VERMELHO }], nota * 0.9, { wmax: cw - 4 });
    }
    /* 1A — PLACA DE BASE (planta e corte) com DIMENSÕES DE PARTIDA: o cálculo não dimensionou a base desta tipologia; o
       desenho mostra a forma (placa, furos, chumbador com gancho, graute) e cada número sai marcado PARTIDA, em vermelho */
    var cl6 = celula(5), bc = bf || bn;
    if (bc) {
      var dB = dimSec(bc), dimP = (d.bases.filter(function (q) { return q.dim; })[0] || {}).dim, part = !dimP;
      var PB = part ? { B: Math.round(dB.bz + 2 * 60), L: Math.round(dB.hy + 2 * 60), t: 16, d: 19.05, id: "3/4\"", borda: 40, anc: 300 } : { B: num(dimP.B, 0), L: num(dimP.L, 0), t: num(dimP.t, 0), d: num((dimP.chumbadores || {}).d, 19.05), id: txt((dimP.chumbadores || {}).id), borda: num((dimP.chumbadores || {}).borda, 40), anc: num((dimP.chumbadores || {}).ancoragem, 300) };
      var es6 = escala([5, 10], PB.B * 2 / 1000 + 0.25, (PB.L + 60) / 1000, cw - 40, chh - 50), k6 = 1 / es6, cor6 = part ? VERMELHO : null, pt = part ? " (PARTIDA)" : "";
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
    var esS = 5, sS = 1 / esS;
    var hMax = Math.max.apply(null, lista.map(function (m) { return dimSec(m).hy; })) * sS;
    if (hMax > a.y + a.h - c.reservaBaixo - yS - 30) { esS = 10; sS = 0.1; hMax /= 2; }
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
            L.push([mk, g.desc, c.perfil(g.perfil), acoCurto(g.aco), String(t.comp[mk]), String(q), String(g.Lmm), c.br(kg, 1), c.br(q * kg, 1)]);
          });
        });
      } else {
        L.push({ titulo: CONJ[cj] });
        gs.sort(function (q, w) { return natural(q.marca, w.marca); }).forEach(function (g) { var q = g.membros.length, kg = g.L * g.massa; sub += q * kg; L.push([g.marca, g.desc, c.perfil(g.perfil), acoCurto(g.aco), "-", String(q), String(g.Lmm), c.br(kg, 1), c.br(q * kg, 1)]); });
      }
      L.push({ total: ["", "SUBTOTAL " + CONJ[cj], "", "", "", "", "", "", c.br(sub, 1)] });
      tot += sub;
    });
    return { linhas: L, total: tot };
  }
  function folhaMateriais(c) {
    var D = c.D, d = c.d, a = c.area, T = D.E.T, A = AP(), lt = linhasLista(d, c);
    var cols = [{ t: "MARCA", w: 13 }, { t: "DESCRIÇÃO", w: 54, al: "E" }, { t: "PERFIL", w: 44, al: "E" }, { t: "AÇO", w: 30 }, { t: ["QUANT.", "/CONJ."], w: 13 }, { t: ["QUANT.", "TOTAL"], w: 13 }, { t: ["COMPR.", "(mm)"], w: 15 }, { t: ["PESO", "UNIT. (kg)"], w: 16 }, { t: ["PESO", "TOTAL (kg)"], w: 18 }];
    var wT = 0; cols.forEach(function (q) { wT += q.w; });
    var y0 = a.y + 14, porBloco = Math.max(8, Math.floor((a.y + a.h - c.reservaBaixo - y0 - 12) / 4.6));
    A.tituloVista(D, a.x + 4, a.y + 2, "LISTA DE MATERIAIS - PEÇAS POR CONJUNTO E MARCA", "COMPRIMENTO PELO EIXO (NÓ A NÓ); O DE CORTE SAI DO DESENHO DE FABRICAÇÃO");
    var x = a.x + 4, blocos = 0;
    for (var k = 0; k < lt.linhas.length; k += porBloco) {
      if (x + wT > a.x + a.w) { c.avisos.push("Lista de materiais: não coube na folha (" + (lt.linhas.length - k) + " linhas)."); break; }
      D.tabela(x, y0, cols, lt.linhas.slice(k, k + porBloco), {}); x += wT + 6; blocos++;
    }
    /* RESUMO POR PERFIL */
    var res = {}, kgT = 0;
    d.membros.forEach(function (m) { var k2 = c.perfil(m.perfil); (res[k2] = res[k2] || { n: 0, L: 0, kg: 0, massa: m.massa, aco: m.aco }); res[k2].n++; res[k2].L += m.L; res[k2].kg += m.L * m.massa; });
    var lr = Object.keys(res).sort().map(function (k3) { kgT += res[k3].kg; return [k3, acoCurto(res[k3].aco), String(res[k3].n), c.br(res[k3].L, 1), c.br(res[k3].massa, 2), c.br(res[k3].kg, 1)]; });
    lr.push({ total: ["TOTAL DOS PERFIS", "", "", "", "", c.br(kgT, 1)] });
    var cr = [{ t: "PERFIL", w: 44, al: "E" }, { t: "AÇO", w: 30 }, { t: "PEÇAS", w: 13 }, { t: ["COMPR.", "TOTAL (m)"], w: 18 }, { t: ["MASSA", "(kg/m)"], w: 15 }, { t: ["PESO", "(kg)"], w: 18 }], wR = 138;
    var xr = x + wR <= a.x + a.w ? x : a.x + 4, yr = x + wR <= a.x + a.w ? y0 - 12 : y0 + Math.min(lt.linhas.length, porBloco) * 4.6 + 20;
    A.tituloVista(D, xr, yr, "RESUMO POR PERFIL", null);
    var tb = D.tabela(xr, yr + 8, cr, lr, {});
    var dif = Math.abs(kgT - num(c.r.peso, kgT));
    D.textos(xr, yr + 8 + tb.h + 5, ["Peso dos perfis = " + c.br(kgT, 1) + " kg (o do cálculo: " + c.br(c.r.peso, 1) + " kg).", "Chapas, parafusos, chumbadores e soldas: A DIMENSIONAR (fora do total).", "Sem acréscimo de perda: a perda é do orçamento, não do desenho."].concat(dif > 1 ? [{ t: "DIFERENÇA ENTRE A LISTA E O CÁLCULO: " + c.br(dif, 1) + " kg - CONFERIR", cor: VERMELHO }] : []), T.nota * 0.9, { wmax: wR });
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

  /* ================================================================ AS FOLHAS */
  function defs(d) {
    var tem = function (fn) { return d.membros.some(fn); };
    var L = [
      { id: "locacao", titulo: "LOCAÇÃO DAS COLUNAS E DAS BASES", formato: "A1", fn: folhaLocacao },
      { id: "cobertura", titulo: "PLANTA DE COBERTURA", formato: "A1", fn: folhaCobertura },
      { id: "portico", titulo: "PÓRTICOS (TÍPICO E OITÃO) E COLUNA TRELIÇADA", formato: "A1", fn: folhaPortico },
      { id: "tesoura", titulo: "DETALHE DA TESOURA", formato: "A1", fn: folhaTesoura }
    ];
    if (planosContravento(d).length) L.push({ id: "elevacoes", titulo: "ELEVAÇÕES LONGITUDINAIS (CONTRAVENTAMENTO)", formato: "A1", fn: folhaElevacoes });
    L.push({ id: "detalhes", titulo: "DETALHES TÍPICOS E SEÇÕES DOS PERFIS", formato: "A1", fn: folhaDetalhes });
    L.push({ id: "materiais", titulo: "LISTA DE MATERIAIS", formato: "A1", fn: folhaMateriais });
    L.push({ id: "isometrica", titulo: "PERSPECTIVA ISOMÉTRICA E SEQUÊNCIA DE MONTAGEM", formato: "A2", fn: folhaIsometrica });
    void tem;
    return L;
  }

  var AcoPranchasTrelica = { detectar: detectar, preparar: preparar, defs: defs, classe: classe, _int: { linhasLista: linhasLista, larguraVista: larguraVista, natural: natural, planosContravento: planosContravento } };
  global.AcoPranchasTrelica = AcoPranchasTrelica;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoPranchasTrelica;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

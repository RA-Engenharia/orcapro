/* =====================================================================
 * bimarq.js — MODELADOR B2 do BIM (arquitetura e estrutura), motor PURO.
 *
 * Fase B2 do PLANO-BIM-MODELADOR.md (pedido do Rogério, 08/10/2026:
 * "modelador completo para obra pequena e média — não copiar um
 * programa inteiro"). Node-testável, ES5, sem DOM e sem three.js. Quem desenha é o
 * js/bim.js (bloco "B2 — MODELADOR"); quem monta a tela é o js/bimarqui.js.
 * Tudo isto só aparece com a prévia do modelador (js/bimprevia.js).
 *
 * O QUE ESTÁ AQUI
 *   · Eixos (grade A, B, C… / 1, 2, 3…): nome automático e geometria.
 *   · Parede por TIPO (camadas e materiais — js/alvtipos.js), UNIÃO nos
 *     cantos e o TOPO recortado pelo fundo da laje / da cobertura
 *     ("anexar topo" leva a parede até elas, como a empena sob o telhado).
 *     Cantos: conferidos contra a referência medida em 08/10/2026
 *     (tools/test-p4-paredes.js): L em TOPO
 *     (butt) — a parede criada ANTES vai até a face de fora da outra e a de
 *     depois para na face dela —, T aparada na face, X com o vão da
 *     secundária. Meia-esquadria continua como OPÇÃO por parede
 *     (juntaCanto: "esquadria" = junta de parede em meia-esquadria).
 *   · Laje por CONTORNO (polígono qualquer, com furos), espessura por tipo.
 *   · Pilar e viga por PERFIL: concreto (retangular, circular), madeira
 *     (seção serrada) e aço (I/H, U, L, tubo) — famílias GEOMÉTRICAS
 *     parametrizadas; o perfil comercial (W, C, L, HSS) vem do catálogo
 *     AISC (js/perfisaco.js, gerado por tools/gerar-perfisaco.js),
 *     com o raio de concordância. A viga que chega num pilar para na FACE
 *     dele (aço com aço: mais o recuo de junta de 12,7 mm).
 *   · Escada reta e em L pelas regras do TIPO (espelho
 *     máximo, piso mínimo, largura mínima do lance); Blondel (63 a 64 cm)
 *     é AVISO, não muda o piso. Patamar automático na escada em L e
 *     guarda-corpo AUTOMÁTICO (dois lados, um ou nenhum), hospedado: segue
 *     a escada quando ela muda e sai junto quando ela é apagada.
 *   · Guarda-corpo ao longo de um caminho (montantes + corrimão).
 *   · P4 (plano do BIM, fase P4, 09/10/2026): o canto com modo por
 *     par (topo / meia-esquadria / esquadrar) e "Alternar ordem de união";
 *     a LINHA DE LOCALIZAÇÃO (os 6 valores); VIRAR CAMADAS nas
 *     extremidades livres e nos vãos; UNIR GEOMETRIA parede × pilar × viga
 *     × laje com a regra escrita de quem corta quem (PRIORIDADE_UNIAO).
 *     Teste: node tools/test-p4-paredes.js.
 *
 * REGRAS DA CASA
 *   · Quantitativo EXATO da geometria que se desenha: o volume é a soma dos
 *     prismas que o 3D mostra (desenho = orçamento). Nada estimado.
 *   · O que vai para a lista de operações (e para a nuvem) não tem lista
 *     dentro de lista — o Firestore recusa. Pontos viajam como {x, z}.
 *   · O que se DERIVA (uniões, topo, degraus) não é gravado: `derivar` refaz
 *     a cada replay a partir da fonte. Desfazer/refazer não deixa resto.
 *
 * Convenção = a do js/bimedit.js: caixa {cx, cy, cz, comprimento (eixo X
 * local), altura (Y), espessura (Z local), rotY}. Mundo de um ponto local
 * (u ao longo do eixo, w na espessura):
 *     X = cx + u·cos(rotY) + w·sin(rotY)      Z = cz − u·sin(rotY) + w·cos(rotY)
 * A face w < 0 fica à ESQUERDA de quem anda de p1 para p2; desenhando no
 * sentido horário da planta, a esquerda é o lado de FORA — é a face "fora".
 *
 * Teste: node tools/test-bim-b2.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* null e "" valem o padrão (Number(null) é 0: um campo apagado viraria zero) */
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  /* P9 — GANCHO: o motor da estrutura P9 (js/bimestrut.js — viga justificada/
     inclinada, pilar inclinado, marca da localização, rampa). Sem ele (teste
     em vm que não o carrega), a peça é a de sempre. */
  function P9() {
    if (global.BimEstrut) return global.BimEstrut;
    if (typeof require === "function") { try { return require("./bimestrut.js"); } catch (e) {} }
    return null;
  }
  /* CURVA — GANCHO: a parede curva e o contorno com aresta em arco
     (js/bimcurva.js). Sem ele, a parede curva fica a caixa da corda. */
  function Curva() {
    if (global.BimCurva) return global.BimCurva;
    if (typeof require === "function") { try { return require("./bimcurva.js"); } catch (e) {} }
    return null;
  }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  /* P1-acab (09/10/2026): a medida SEM arredondar, ao lado da gravada com 4/6
     casas — é a que o registro (js/bimparam.js) e os Qto do IFC levam
     (BimEdit.medidasDe(el, vaos, true)). NÃO enumerável de propósito: não
     entra em op, em JSON, na nuvem nem nas fotos dos testes; é anotação do
     replay. Quem clona a peça perde e cai na medida gravada. */
  function exato(c, o) { try { Object.defineProperty(c, "_exato", { value: o, enumerable: false, configurable: true, writable: true }); } catch (e) {} return c; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  /* ponto em qualquer forma ([x,z] ou {x,z}) → [x, z] */
  function pt(p) { return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : (p ? [Number(p.x), Number(p.z)] : [NaN, NaN]); }
  function ptObj(p) { return { x: r6(p[0]), z: r6(p[1]) }; }

  /* ------------------------------------------------ geometria plana */
  function areaSinal(pts) {
    var s = 0;
    for (var i = 0, n = pts.length; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
    return s / 2;
  }
  function perimetro(pts) {
    var s = 0;
    for (var i = 0, n = pts.length; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }
    return s;
  }
  function centroide(pts) {
    var A = areaSinal(pts), cx = 0, cz = 0;
    if (Math.abs(A) < 1e-14) { pts.forEach(function (p) { cx += p[0]; cz += p[1]; }); return [cx / pts.length, cz / pts.length]; }
    for (var i = 0, n = pts.length; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n], k = a[0] * b[1] - b[0] * a[1];
      cx += (a[0] + b[0]) * k; cz += (a[1] + b[1]) * k;
    }
    return [cx / (6 * A), cz / (6 * A)];
  }
  /* ponto dentro do polígono (raio horizontal); na borda conta como dentro */
  function dentro(p, pts) {
    var x = p[0], z = p[1], d = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if (distSeg(p, a, b) < 1e-7) return true;
      if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) d = !d;
    }
    return d;
  }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = a[0] + t * dx - p[0], qz = a[1] + t * dz - p[1];
    return Math.sqrt(qx * qx + qz * qz);
  }
  function orient(a, b, c) { var v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return Math.abs(v) < 1e-12 ? 0 : (v > 0 ? 1 : -1); }
  /* os segmentos se CRUZAM (tocar na ponta não conta) */
  function cruzam(a, b, c, d) {
    var o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  }
  /* tira ponto repetido em seguida e o fechamento repetido */
  function limparPontos(lista) {
    var out = [];
    arr(lista).forEach(function (p) {
      var q = pt(p); if (!fin(q[0]) || !fin(q[1])) { out.push([NaN, NaN]); return; }
      var u = out[out.length - 1];
      if (u && Math.abs(u[0] - q[0]) < 0.005 && Math.abs(u[1] - q[1]) < 0.005) return;
      out.push(q);
    });
    if (out.length > 2) { var a = out[0], z = out[out.length - 1]; if (Math.abs(a[0] - z[0]) < 0.005 && Math.abs(a[1] - z[1]) < 0.005) out.pop(); }
    return out;
  }
  function poligonoSimples(pts) {
    var n = pts.length;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;   /* arestas vizinhas */
      if (cruzam(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
    return true;
  }
  function arestasCruzam(A, B) {
    for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++)
      if (cruzam(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    return false;
  }

  /* ------------------------------------------ o referencial da caixa */
  function frameDe(c) {
    var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0));
    return { cx: num(c.cx, 0), cz: num(c.cz, 0), co: co, si: si, L: num(c.comprimento, 0), t: num(c.espessura, 0), H: num(c.altura, 0),
             y0: num(c.cy, 0) - num(c.altura, 0) / 2, y1: num(c.cy, 0) + num(c.altura, 0) / 2 };
  }
  function aMundo(f, u, w) { return [f.cx + u * f.co + w * f.si, f.cz - u * f.si + w * f.co]; }
  function aLocal(f, x, z) { var dx = x - f.cx, dz = z - f.cz; return [dx * f.co - dz * f.si, dx * f.si + dz * f.co]; }
  /* reta pelos pontos P e Q do mundo, no local da caixa: u = c0 + c1·w */
  function retaLocal(f, P, Q) {
    var a = aLocal(f, P[0], P[1]), b = aLocal(f, Q[0], Q[1]), dw = b[1] - a[1];
    if (Math.abs(dw) < 1e-9) return null;
    var c1 = (b[0] - a[0]) / dw;
    return { c0: a[0] - c1 * a[1], c1: c1 };
  }
  function uEm(l, w) { return l.c0 + l.c1 * w; }
  /* P + s·d = Q + r·e */
  function interRetas(P, d, Q, e) {
    var den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) return null;
    var s = ((Q[0] - P[0]) * e[1] - (Q[1] - P[1]) * e[0]) / den;
    return [P[0] + s * d[0], P[1] + s * d[1]];
  }
  /* parâmetro u (na reta C + u·d, d unitário) onde ela corta o segmento AB */
  function cortaSegmento(C, d, A, B) {
    var e = [B[0] - A[0], B[1] - A[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) return null;
    var s = ((A[0] - C[0]) * e[1] - (A[1] - C[1]) * e[0]) / den;
    var r = ((A[0] - C[0]) * d[1] - (A[1] - C[1]) * d[0]) / den;
    return (r >= -1e-9 && r <= 1 + 1e-9) ? s : null;
  }

  /* ------------------------------------- P4 — recorte de polígonos (planta)
   * Para UNIR GEOMETRIA (parede × pilar × viga × laje): o volume que duas
   * peças dividem é a área da INTERSEÇÃO das pegadas na planta vezes a faixa
   * de altura comum. Os prismas são verticais (parede, pilar, laje) ou caixas
   * horizontais de seção retangular (viga) — a interseção na planta é exata.
   * Sutherland–Hodgman com o recortador CONVEXO (o polígono recortado pode ser
   * côncavo: sobram arestas degeneradas de área zero, e a área e o centroide
   * pelo shoelace continuam exatos). Recortador côncavo (laje em L, perfil I)
   * vira triângulos (orelhas) e soma. */
  function convexo(P) {
    var s = 0;
    for (var i = 0, n = P.length; i < n; i++) {
      var o = orient(P[i], P[(i + 1) % n], P[(i + 2) % n]);
      if (o === 0) continue;
      if (s === 0) s = o; else if (o !== s) return false;
    }
    return true;
  }
  function recortarConvexo(sub, clip) {
    var out = sub.slice(), sg = areaSinal(clip) >= 0 ? 1 : -1;
    for (var i = 0; i < clip.length && out.length; i++) {
      var A = clip[i], B = clip[(i + 1) % clip.length], inp = out;
      var lado = function (p) { return sg * ((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0])); };
      out = [];
      for (var j = 0; j < inp.length; j++) {
        var P = inp[j], Q = inp[(j + 1) % inp.length], lp = lado(P), lq = lado(Q);
        if (lp >= 0) out.push(P);
        if ((lp >= 0) !== (lq >= 0)) { var t = lp / (lp - lq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
      }
    }
    return out.length >= 3 ? out : [];
  }
  /* o semiplano n·p ≤ k */
  function recortarSemiplano(sub, n, k) {
    var out = [];
    for (var j = 0; j < sub.length; j++) {
      var P = sub[j], Q = sub[(j + 1) % sub.length], lp = n[0] * P[0] + n[1] * P[1] - k, lq = n[0] * Q[0] + n[1] * Q[1] - k;
      if (lp <= 0) out.push(P);
      if ((lp <= 0) !== (lq <= 0)) { var t = lp / (lp - lq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    return out.length >= 3 ? out : [];
  }
  /* triângulos de um polígono simples (orelhas) */
  function triangular(P0) {
    var P = P0.slice(); if (areaSinal(P) < 0) P.reverse();
    var tris = [], guarda = 0;
    while (P.length > 3 && guarda++ < 5000) {
      var achou = false;
      for (var i = 0; i < P.length; i++) {
        var a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length];
        if (orient(a, b, c) <= 0) continue;
        var vazio = true;
        for (var j = 0; j < P.length && vazio; j++) {
          var q = P[j]; if (q === a || q === b || q === c) continue;
          if (orient(a, b, q) >= 0 && orient(b, c, q) >= 0 && orient(c, a, q) >= 0) vazio = false;
        }
        if (!vazio) continue;
        tris.push([a, b, c]); P.splice(i, 1); achou = true; break;
      }
      if (!achou) break;   /* polígono degenerado: o resto vai como está */
    }
    if (P.length >= 3) tris.push(P);
    return tris;
  }
  /* P ∩ Q → lista de polígonos (a soma das áreas é a da interseção) */
  function intersecao(P, Q) {
    if (P.length < 3 || Q.length < 3) return [];
    if (convexo(Q)) { var r = recortarConvexo(P, Q); return r.length ? [r] : []; }
    if (convexo(P)) { var r2 = recortarConvexo(Q, P); return r2.length ? [r2] : []; }
    var out = [];
    triangular(Q).forEach(function (T) { var r3 = recortarConvexo(P, T); if (r3.length) out.push(r3); });
    return out;
  }
  /* área (≥ 0) e centroide de uma lista de polígonos */
  function momentos(polis) {
    var A = 0, sx = 0, sz = 0;
    polis.forEach(function (p) { var a = Math.abs(areaSinal(p)); if (a < 1e-14) return; var c = centroide(p); A += a; sx += a * c[0]; sz += a * c[1]; });
    return { A: A, cx: A > 0 ? sx / A : 0, cz: A > 0 ? sz / A : 0 };
  }

  /* ================================================== TIPOS E PERFIS */
  var TIPOS_LAJE = [
    { id: "macica-8",  rotulo: "Laje maciça 8 cm",  espessura: 0.08 },
    { id: "macica-10", rotulo: "Laje maciça 10 cm", espessura: 0.10 },
    { id: "macica-12", rotulo: "Laje maciça 12 cm", espessura: 0.12 },
    { id: "macica-15", rotulo: "Laje maciça 15 cm", espessura: 0.15 },
    { id: "macica-20", rotulo: "Laje maciça 20 cm", espessura: 0.20 }
  ];
  /* TIPOS DE ESCADA: as REGRAS do tipo decidem o degrau.
     O padrão é o tipo de mercado, medido na referência de 08/10/2026
     (conferida no teste tools/test-p4-paredes.js):
     "Espelho máximo de 180 mm piso de 275 mm" — MaxRiserHeight 0,18,
     MinTreadDepth 0,275, MinRunWidth 1,00. `piso` (null) = a profundidade do
     piso que o tipo pede; vazio = a mínima. `guarda` = os guarda-corpos que
     a escada cria sozinha (a escada nasce com os dois lados). */
  var TIPOS_ESCADA = [
    { id: "revit-180-275", rotulo: "Espelho máximo de 180 mm, piso de 275 mm (padrão)", emax: 0.18, pmin: 0.275, larguraMin: 1.0, piso: null, guarda: "dois" }
  ];
  var GUARDA_ESCADA = { dois: "Nos dois lados", um: "Só de um lado", nenhum: "Nenhum" };
  /* P9 — as REGRAS DE CÁLCULO da escada (o parâmetro de tipo
     "Regras de cálculo"). O padrão é o piso mínimo do tipo; Blondel RA é a regra de
     conforto que o OrçaPRO usava antes da P0. O rótulo é o que a paleta
     mostra; qualquer texto com "blondel" vale a regra RA. */
  var REGRAS_ESCADA = { revit: "Regras do tipo: piso mínimo do tipo", blondel: "Blondel RA: 2e + p entre 63 e 64 cm" };
  function regraEscada(v) { return /blondel/i.test(String(v == null ? "" : v)) ? "blondel" : "revit"; }
  /* P9 — as formas da escada: reta, em L (patamar de canto) e em U (patamar
     de meia-volta, o segundo lance volta paralelo ao primeiro) */
  var FORMAS_ESCADA = { reta: "Reta", L: "Em L (patamar de canto)", U: "Em U (patamar de meia-volta)" };
  /* famílias GEOMÉTRICAS: os campos e um valor de partida. Medidas em METROS.
     O perfil COMERCIAL de aço (W, C, L, HSS) vem do js/perfisaco.js (catálogo
     AISC) e chega aqui como uma destas formas + `cat` (o nome). */
  var PERFIS = {
    "ret":       { rotulo: "Retangular",            campos: [["b", "Largura b", 0.20], ["h", "Altura h", 0.40]], materiais: ["concreto", "madeira", "aco"] },
    "circ":      { rotulo: "Circular",              campos: [["d", "Diâmetro", 0.30]], materiais: ["concreto", "madeira"] },
    "I":         { rotulo: "I / H",                 campos: [["d", "Altura d", 0.20], ["bf", "Mesa bf", 0.10], ["tw", "Alma tw", 0.006], ["tf", "Mesa tf", 0.008]], materiais: ["aco"] },
    "U":         { rotulo: "U",                     campos: [["d", "Altura d", 0.15], ["bf", "Aba bf", 0.05], ["tw", "Alma tw", 0.005], ["tf", "Aba tf", 0.007]], materiais: ["aco"] },
    "L":         { rotulo: "Cantoneira L",          campos: [["a", "Aba a", 0.075], ["b", "Aba b", 0.075], ["t", "Espessura t", 0.006]], materiais: ["aco"] },
    "tubo-ret":  { rotulo: "Tubo retangular",       campos: [["b", "Largura b", 0.10], ["h", "Altura h", 0.10], ["t", "Parede t", 0.005]], materiais: ["aco"] },
    "tubo-circ": { rotulo: "Tubo circular",         campos: [["D", "Diâmetro D", 0.10], ["t", "Parede t", 0.005]], materiais: ["aco"] }
  };
  var MATERIAIS = {
    concreto: { rotulo: "Concreto armado", forma: true },
    madeira:  { rotulo: "Madeira serrada", forma: false },
    /* NBR 8800:2008, 4.5.2.9 — massa específica do aço estrutural */
    aco:      { rotulo: "Aço", forma: false, rho: 7850, fonte: "NBR 8800:2008 — massa específica do aço 7850 kg/m³" }
  };
  function circulo(r, n) { var o = []; for (var i = 0; i < n; i++) { var a = 2 * Math.PI * i / n; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
  /* CONCORDÂNCIA (raio r) nos cantos de 90° de índices `idx` do contorno: o
     vértice vira um arco de n trechos, tangente às duas arestas. Serve para o
     canto côncavo (alma-mesa do I/U, raiz da cantoneira: ACRESCENTA material)
     e para o convexo (canto do tubo: TIRA). A área exata vai pela fórmula
     (k·r² por canto, k = 1 − π/4) — o polígono é só o desenho, como o círculo. */
  var K_FILETE = 1 - Math.PI / 4;
  function filetar(pts, idx, r, n) {
    if (!(r > 1e-9)) return pts;
    var out = [], N = pts.length;
    pts.forEach(function (V, i) {
      if (idx.indexOf(i) < 0) { out.push(V); return; }
      var P = pts[(i - 1 + N) % N], Q = pts[(i + 1) % N];
      var la = Math.sqrt((V[0] - P[0]) * (V[0] - P[0]) + (V[1] - P[1]) * (V[1] - P[1])), lb = Math.sqrt((Q[0] - V[0]) * (Q[0] - V[0]) + (Q[1] - V[1]) * (Q[1] - V[1]));
      var a = [(V[0] - P[0]) / la, (V[1] - P[1]) / la], b = [(Q[0] - V[0]) / lb, (Q[1] - V[1]) / lb];
      var C = [V[0] - a[0] * r + b[0] * r, V[1] - a[1] * r + b[1] * r];
      for (var k = 0; k <= n; k++) { var th = Math.PI / 2 * k / n, cs = Math.cos(th), sn = Math.sin(th); out.push([C[0] + r * (-b[0] * cs + a[0] * sn), C[1] + r * (-b[1] * cs + a[1] * sn)]); }
    });
    return out;
  }

  /* seção do perfil → contorno (a = largura, b = altura, centro da caixa
     da seção na origem), área e perímetro exatos. Raio de concordância
     opcional (perfil de catálogo, js/perfisaco.js): r (alma-mesa do I e do
     U, raiz da cantoneira), ro/ri (cantos de fora/de dentro do tubo). O
     volume é o da GEOMETRIA com os raios — é o que a referência medida dá para a família
     (W250X73 × 2,80 m: 0,026044 m³; área A do catálogo × 2,80 daria
     0,026012). */
  function secao(perfil) {
    var p = perfil || {}, f = p.forma, g = function (k) { return num(p[k], NaN); };
    function ruim(m) { return { ok: false, motivo: m }; }
    if (!PERFIS[f]) return ruim("Perfil desconhecido: " + f + ".");
    var c = [], furos = [], area, per, larg, alt, NF = 6;
    var rr = num(p.r, 0), ro = num(p.ro, 0), ri = num(p.ri, 0);
    if (!(rr >= 0 && ro >= 0 && ri >= 0)) return ruim("Raio de concordância negativo.");
    if (f === "ret") {
      var b = g("b"), h = g("h"); if (!(b > 0.01 && h > 0.01) || b > 3 || h > 3) return ruim("Seção retangular: b e h entre 1 cm e 3 m.");
      c = [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]]; area = b * h; per = 2 * (b + h); larg = b; alt = h;
    } else if (f === "circ") {
      var d = g("d"); if (!(d > 0.02) || d > 3) return ruim("Diâmetro entre 2 cm e 3 m.");
      c = circulo(d / 2, 32); area = Math.PI * d * d / 4; per = Math.PI * d; larg = alt = d;
    } else if (f === "I" || f === "U") {
      var D = g("d"), bf = g("bf"), tw = g("tw"), tf = g("tf");
      if (!(D > 0 && bf > 0 && tw > 0 && tf > 0)) return ruim("Perfil " + f + ": d, bf, tw e tf maiores que zero.");
      if (!(2 * tf < D)) return ruim("Perfil " + f + ": as duas mesas (2 × tf) não cabem na altura d.");
      if (!(tw < bf)) return ruim("Perfil " + f + ": a alma (tw) tem de ser mais fina que a mesa (bf).");
      var y0 = -D / 2, y1 = D / 2, x0 = -bf / 2, x1 = bf / 2, nr = f === "I" ? 4 : 2;
      if (rr > 0 && !(rr <= Math.min(f === "I" ? (bf - tw) / 2 : bf - tw, D / 2 - tf) + 1e-9)) return ruim("Perfil " + f + ": o raio de concordância não cabe entre a alma e a ponta da mesa.");
      var cb = f === "I" ? [[x0, y0], [x1, y0], [x1, y0 + tf], [tw / 2, y0 + tf], [tw / 2, y1 - tf], [x1, y1 - tf], [x1, y1], [x0, y1], [x0, y1 - tf], [-tw / 2, y1 - tf], [-tw / 2, y0 + tf], [x0, y0 + tf]]
                         : [[x0, y0], [x1, y0], [x1, y0 + tf], [x0 + tw, y0 + tf], [x0 + tw, y1 - tf], [x1, y1 - tf], [x1, y1], [x0, y1]];
      c = filetar(cb, f === "I" ? [3, 4, 9, 10] : [3, 4], rr, NF);
      area = 2 * bf * tf + (D - 2 * tf) * tw + nr * K_FILETE * rr * rr;
      per = perimetro(cb) - nr * (2 - Math.PI / 2) * rr;   /* cada arco troca 2r de reta por πr/2 */
      larg = bf; alt = D;
    } else if (f === "L") {
      var A2 = g("a"), B2 = g("b"), t = g("t");
      if (!(A2 > 0 && B2 > 0 && t > 0)) return ruim("Cantoneira: a, b e t maiores que zero.");
      if (!(t < Math.min(A2, B2))) return ruim("Cantoneira: a espessura t tem de ser menor que as abas.");
      if (rr > 0 && !(rr <= Math.min(A2, B2) - t + 1e-9)) return ruim("Cantoneira: o raio da raiz não cabe nas abas.");
      c = filetar([[0, 0], [B2, 0], [B2, t], [t, t], [t, A2], [0, A2]], [3], rr, NF).map(function (q) { return [q[0] - B2 / 2, q[1] - A2 / 2]; });
      area = t * (A2 + B2 - t) + K_FILETE * rr * rr; per = 2 * (A2 + B2) - (2 - Math.PI / 2) * rr; larg = B2; alt = A2;
    } else if (f === "tubo-ret") {
      var bt = g("b"), ht = g("h"), tt = g("t");
      if (!(bt > 0 && ht > 0 && tt > 0)) return ruim("Tubo: b, h e t maiores que zero.");
      if (!(2 * tt < Math.min(bt, ht))) return ruim("Tubo: a parede (2 × t) não cabe na seção.");
      var bi = bt / 2 - tt, hi = ht / 2 - tt;
      if (!(ro <= Math.min(bt, ht) / 2 + 1e-9) || !(ri <= Math.min(bi, hi) + 1e-9)) return ruim("Tubo: os raios dos cantos não cabem na seção.");
      c = filetar([[-bt / 2, -ht / 2], [bt / 2, -ht / 2], [bt / 2, ht / 2], [-bt / 2, ht / 2]], [0, 1, 2, 3], ro, NF);
      furos = [filetar([[-bi, -hi], [-bi, hi], [bi, hi], [bi, -hi]], [0, 1, 2, 3], ri, NF)];
      area = (bt * ht - 4 * K_FILETE * ro * ro) - ((bt - 2 * tt) * (ht - 2 * tt) - 4 * K_FILETE * ri * ri);
      per = 2 * (bt + ht) - 4 * (2 - Math.PI / 2) * ro; larg = bt; alt = ht;
    } else if (f === "tubo-circ") {
      var Dc = g("D"), tc = g("t");
      if (!(Dc > 0 && tc > 0)) return ruim("Tubo: D e t maiores que zero.");
      if (!(2 * tc < Dc)) return ruim("Tubo: a parede (2 × t) não cabe no diâmetro.");
      c = circulo(Dc / 2, 32); furos = [circulo(Dc / 2 - tc, 32).reverse()];
      area = Math.PI / 4 * (Dc * Dc - (Dc - 2 * tc) * (Dc - 2 * tc)); per = Math.PI * Dc; larg = alt = Dc;
    }
    return { ok: true, forma: f, contorno: c, furos: furos, area: area, perimetro: per, larg: larg, alt: alt, rotulo: rotuloPerfil(p) };
  }
  function cm(v) { return String(Math.round(v * 1000) / 10).replace(".", ","); }
  function mm(v) { return String(Math.round(v * 10000) / 10).replace(".", ","); }
  function rotuloPerfil(p) {
    var f = p.forma;
    if (p.cat) return String(p.cat);   /* perfil de catálogo (js/perfisaco.js): o nome comercial, ex. W250X73 */
    if (f === "ret") return cm(p.b) + " × " + cm(p.h) + " cm";
    if (f === "circ") return "Ø " + cm(p.d) + " cm";
    if (f === "I" || f === "U") return f + " " + mm(p.d) + " × " + mm(p.bf) + " (tw " + mm(p.tw) + ", tf " + mm(p.tf) + ") mm";
    if (f === "L") return "L " + mm(p.a) + " × " + mm(p.b) + " × " + mm(p.t) + " mm";
    if (f === "tubo-ret") return "Tubo " + mm(p.b) + " × " + mm(p.h) + " × " + mm(p.t) + " mm";
    if (f === "tubo-circ") return "Tubo Ø " + mm(p.D) + " × " + mm(p.t) + " mm";
    return String(f || "");
  }

  /* ================================================ P1-B — RESTRIÇÕES POR NÍVEL
   * Restrições por nível (plano do BIM, seção 3.2; nomes e grupos do
   * inventário de parâmetros). A peça guarda o NÍVEL e o
   * DESLOCAMENTO — não a cota absoluta —, e o replay põe a peça na altura que
   * os níveis da obra dão AGORA: mudou a elevação de um nível, tudo o que está
   * preso a ele (na base ou no topo "até o nível") acompanha.
   *
   * Op v:2 (campos dentro da caixa da op `criar`, ou da `cobertura`):
   *   v: 2,
   *   nivelBase          id do nível (Restrição da base / Nível base / Nível /
   *                      Nível de referência / Nível da base)
   *   deslocBase         m (Deslocamento da base / Altura do deslocamento do
   *                      nível / Deslocamento do nível)
   *   restricaoSuperior  id do nível ou null = "Não conectada"   } parede,
   *   deslocSuperior     m (Deslocamento superior)              } pilar e
   *   alturaNaoConectada m (Altura não conectada / Altura        } escada
   *                      desejada da escada) — vale quando não conectada
   * A caixa continua com a geometria ABSOLUTA de quando nasceu (cy, altura,
   * basePilar, topoViga, escada.par.base/desnivel, cobertura.base): quem não
   * conhece os níveis (Node sem obra, IFC antigo) vê a peça onde ela nasceu.
   *   Altura efetiva = elev(restricaoSuperior) + deslocSuperior
   *                    − (elev(nivelBase) + deslocBase)   — ou a não conectada.
   *
   * MIGRAÇÃO NO REPLAY (sem regravar o que está guardado): a op v:1 tem a
   * base absoluta e um nivelId só informativo → nivelBase = nivelId,
   * deslocBase = base − elev(nível), restricaoSuperior = null, altura não
   * conectada = a altura que estava. Dá exatamente a mesma peça. A op só sai
   * em v:2 quando o usuário mexe na peça (op `ajustar` com `restricoes`) ou
   * cria uma nova. Peça sem nível fica no "plano do modelo", como sempre. */
  var RESTR_TIPO = { parede: "vertical", pilar: "vertical", escada: "vertical", laje: "nivel", viga: "nivel", cobertura: "nivel" };
  var CAMPOS_RESTR = ["nivelBase", "deslocBase", "restricaoSuperior", "deslocSuperior", "alturaNaoConectada"];
  /* os rótulos em PT-BR do inventário de parâmetros, por categoria */
  var ROTULOS_RESTR = {
    parede:    { nivelBase: "Restrição da base", deslocBase: "Deslocamento da base", restricaoSuperior: "Restrição superior", deslocSuperior: "Deslocamento superior", alturaNaoConectada: "Altura não conectada" },
    pilar:     { nivelBase: "Nível base", deslocBase: "Deslocamento da base", restricaoSuperior: "Nível superior", deslocSuperior: "Deslocamento superior", alturaNaoConectada: "Altura não conectada" },
    escada:    { nivelBase: "Nível base", deslocBase: "Deslocamento da base", restricaoSuperior: "Nível superior", deslocSuperior: "Deslocamento superior", alturaNaoConectada: "Altura desejada da escada" },
    laje:      { nivelBase: "Nível", deslocBase: "Altura do deslocamento do nível" },
    viga:      { nivelBase: "Nível de referência", deslocBase: "Deslocamento do nível" },
    cobertura: { nivelBase: "Nível da base", deslocBase: "Deslocamento da base" }
  };
  /* níveis (lista [{id, elevacao}] da obra) → { id: elevação } */
  function mapaNiveis(niveis) {
    var m = {};
    arr(niveis).forEach(function (n) { if (n && n.id != null && n.elevacao != null && n.elevacao !== "" && fin(Number(n.elevacao))) m[String(n.id)] = Number(n.elevacao); });
    return m;
  }
  /* a cota absoluta que a peça tem gravada: a BASE (parede, pilar, escada,
     cobertura) ou o TOPO (laje, viga — a laje e a viga penduram do nível) */
  function cotaAbs(c) {
    if (c.tipo === "parede") return num(c.cy, 0) - num(c.altura, 0) / 2;
    if (c.tipo === "pilar") return c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - num(c.altura, 0) / 2;
    if (c.tipo === "escada") return num(c.escada && c.escada.par && c.escada.par.base, 0);
    if (c.tipo === "laje") return num(c.cy, 0) + num(c.altura, 0) / 2;
    if (c.tipo === "viga") return c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
    if (c.tipo === "cobertura") return num(c.base, 0);
    return 0;
  }
  function alturaAbs(c) {
    if (c.tipo === "escada") return num(c.escada && c.escada.par && c.escada.par.desnivel, 0);
    return num(c.altura, 0);
  }
  /* só os campos que a categoria tem, cada um no seu formato. Nível = id
     (texto) ou null; medida = número, ou null = "refazer da geometria". */
  function normRestr(r, tipo) {
    var k = RESTR_TIPO[tipo], out = {};
    if (!k || !r || typeof r !== "object" || Array.isArray(r)) return out;
    CAMPOS_RESTR.forEach(function (f) {
      if (r[f] === undefined) return;
      if (k === "nivel" && (f === "restricaoSuperior" || f === "deslocSuperior" || f === "alturaNaoConectada")) return;
      if (f === "nivelBase" || f === "restricaoSuperior") { out[f] = r[f] == null || r[f] === "" ? null : String(r[f]).slice(0, 120); return; }
      if (r[f] === null || r[f] === "") { out[f] = null; return; }
      var v = Number(r[f]);
      if (!isFinite(v)) return;
      if (f === "alturaNaoConectada" && !(v >= 0.1 && v <= 60)) return;
      if ((f === "deslocBase" || f === "deslocSuperior") && Math.abs(v) > 200) return;
      out[f] = r6(v);
    });
    return out;
  }
  function gravarRestr(c, rn) {
    Object.keys(rn).forEach(function (f) {
      if (rn[f] === null && f !== "restricaoSuperior" && f !== "nivelBase") delete c[f];   /* medida nula: refaz da geometria */
      else c[f] = rn[f];
    });
    if (rn.nivelBase !== undefined) { if (rn.nivelBase == null) { delete c.nivelBase; delete c.nivelId; } else c.nivelId = rn.nivelBase; }
    c.v = 2;
  }

  /* ======================================== P4 — PAREDES
   * Plano do BIM, fase P4, frentes A e B (09/10/2026).
   *
   * LINHA DE LOCALIZAÇÃO (WALL_KEY_REF_PARAM, os 6 valores em PT-BR,
   * na ordem do enum WallLocationLine): a linha que o usuário DESENHA. A caixa
   * continua guardando o corpo da parede (cx, cz = meio da espessura); a
   * parede nasce deslocada para a linha desenhada cair na face/núcleo pedido.
   * Mudar o parâmetro depois NÃO move a parede (muda só a
   * referência); trocar o tipo (espessura) mantém a linha de localização no
   * lugar e a parede cresce para o outro lado.
   * Lado EXTERIOR = a face "fora" (w < 0, à esquerda de quem anda de p1 para
   * p2 na planta do OrçaPRO); "Inverter faces" troca. */
  /* os nomes são os do inventário em PT-BR, letra por letra (coleta de
     09/10/2026, conferida no teste tools/test-p4-paredes.js; a caixa alta de "Externa" × "externa" é a do inventário);
     "antigo" é o rótulo que a RA usava antes e que a entrada continua aceitando */
  var LINHAS_LOC = [
    { v: 0, id: "eixo", nome: "Linha central da parede" },
    { v: 1, id: "nucleo", nome: "Linha central do núcleo" },
    { v: 2, id: "acabExt", nome: "Face de acabamento: Externa", antigo: "Face de acabamento: exterior" },
    { v: 3, id: "acabInt", nome: "Face de acabamento: Interna", antigo: "Face de acabamento: interior" },
    { v: 4, id: "nucleoExt", nome: "Face do núcleo: externa", antigo: "Face do núcleo: exterior" },
    { v: 5, id: "nucleoInt", nome: "Face do núcleo: interna", antigo: "Face do núcleo: interior" }
  ];
  /* 0..5, o id ou o nome (o do inventário ou o antigo) → o número; o resto → null */
  function linhaLocDe(v) {
    if (v == null || v === "" || typeof v === "boolean") return null;
    if (typeof v === "number" || /^\d+$/.test(String(v))) { var n = Number(v); return n >= 0 && n <= 5 && n === Math.floor(n) ? n : null; }
    var s = String(v);
    for (var i = 0; i < LINHAS_LOC.length; i++) if (LINHAS_LOC[i].id === s || LINHAS_LOC[i].nome === s || (LINHAS_LOC[i].antigo && LINHAS_LOC[i].antigo === s)) return LINHAS_LOC[i].v;
    return null;
  }
  /* as espessuras de cada lado (fora, núcleo, dentro) pelas camadas do tipo */
  function ladosParede(c) {
    var t = num(c.espessura, 0), tp = c.tipoParede, fo = 0, de = 0, tem = false;
    arr(tp && tp.camadas).forEach(function (k) { tem = true; if (k.face === "fora") fo += num(k.e, 0); else if (k.face === "dentro") de += num(k.e, 0); });
    if (!tem || fo + de > t) return { fora: 0, nucleo: t, dentro: 0, t: t };
    return { fora: fo, nucleo: t - fo - de, dentro: de, t: t };
  }
  /* w (local, a partir do meio da espessura) da linha de localização v */
  function wLinhaLoc(c, v) {
    var L = ladosParede(c), h = L.t / 2, w = 0;
    if (v === 1) w = -h + L.fora + L.nucleo / 2;
    else if (v === 2) w = -h;
    else if (v === 3) w = h;
    else if (v === 4) w = -h + L.fora;
    else if (v === 5) w = h - L.dentro;
    return c.inverterFaces ? -w : w;
  }
  /* o corpo anda para a linha desenhada (o eixo da caixa) virar a linha v */
  function deslocarPorLinha(c, w) {
    if (c.arco && Curva()) { Curva().deslocarPorLinha(c, w); return; }   /* CURVA: concêntrico */
    var r = num(c.rotY, 0);
    c.cx = r6(num(c.cx, 0) - w * Math.sin(r)); c.cz = r6(num(c.cz, 0) - w * Math.cos(r));
  }

  /* VIRAR CAMADAS (WRAPPING_AT_ENDS_PARAM / WRAPPING_AT_INSERTS_PARAM, do TIPO):
   * as camadas de acabamento do lado escolhido dobram na ponta
   * livre da parede e no requadro dos vãos. Regra RA da área (não há
   * parâmetro de área por camada; a conferência é a área de material
   * medida na referência): cada camada do lado que vira ganha
   *   ponta livre ..... (t − Σ camadas do próprio lado) × altura da ponta;
   *   vão ............. (t − Σ do lado) × perímetro do requadro (2 alturas +
   *                     verga + peitoril quando o vão não começa no piso);
   *                     "Ambos": cada lado vira até o meio (t/2 − Σ do lado).
   * Valores em PT-BR: extremidades "Nenhum" | "Exterior" | "Interior";
   * inserções "Não virar" | "Exterior" | "Interior" | "Ambos". */
  var VIRAR_EXT = { "Nenhum": null, "Exterior": "fora", "Interior": "dentro" };
  var VIRAR_INS = { "Não virar": null, "Exterior": "fora", "Interior": "dentro", "Ambos": "ambos" };
  function normVirar(v, mapa) {
    if (v == null || v === "") return null;
    var s = String(v);
    if (Object.prototype.hasOwnProperty.call(mapa, s)) return mapa[s];
    if (s === "fora" || s === "dentro" || (s === "ambos" && mapa === VIRAR_INS)) return s;
    if (s === "nenhum" || s === "nao") return null;
    return undefined;   /* inválido: não mexe */
  }
  function rotuloVirar(v, mapa) { for (var k in mapa) if (mapa.hasOwnProperty(k) && mapa[k] === (v || null)) return k; return null; }

  /* UNIR GEOMETRIA (Unir geometria / Desunir / Alternar ordem de união).
   * QUEM CORTA QUEM — a regra escrita (e testada em tools/test-p4-paredes.js):
   *   pilar (4) > viga (3) > laje (2) > parede (1)
   * a peça de prioridade MAIOR fica inteira e a menor perde o volume comum
   * (o concreto da estrutura é contínuo e a alvenaria é descontada — é como
   * se mede no orçamento; o nó não conta duas vezes). Empate (pilar × pilar):
   * a criada antes corta. "Alternar ordem de união" troca quem corta naquele
   * par. Parede × laje JÁ vem unida (a parede para no fundo da laje, B2):
   * desunir deixa a parede passar inteira (as duas contam o volume comum,
   * sem união) e alternar faz a parede cortar a laje.
   * A referência dessa regra é a coleta conferida no teste tools/test-p4-paredes.js. */
  var PRIORIDADE_UNIAO = { pilar: 4, viga: 3, laje: 2, parede: 1 };

  /* ========================================= P9 — GUARDA-CORPO (corrimãos)
   * Os grupos "Corrimão 1" e "Corrimão 2" do tipo de guarda-corpo
   * (Altura, Deslocamento lateral) e o "Deslocamento a partir do
   * caminho" da instância. Sinal (a conferir na próxima coleta de referência): deslocamento
   * POSITIVO = para a DIREITA de quem anda no sentido do caminho. O corrimão
   * é uma barra paralela ao caminho, na altura dele acima da linha de base;
   * o comprimento dele vai para o orçamento (m de corrimão). */
  var CAMPOS_CORRIMAO = ["c1Altura", "c1Desloc", "c2Altura", "c2Desloc"];
  /* desloca uma polilinha {x,y,z} de lado (no plano), vértice a vértice pela
     bissetriz — os cantos continuam fechados */
  function deslocarPolilinha(pts, d) {
    var n = pts.length, out = [];
    function nrm(a, b) { var dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz); return L > 1e-9 ? [-dz / L, dx / L] : null; }
    for (var i = 0; i < n; i++) {
      var n0 = i > 0 ? nrm(pts[i - 1], pts[i]) : null, n1 = i < n - 1 ? nrm(pts[i], pts[i + 1]) : null, v;
      if (n0 && n1) {
        var sx = n0[0] + n1[0], sz = n0[1] + n1[1], L = Math.sqrt(sx * sx + sz * sz), cs = L > 1e-9 ? (sx / L) * n0[0] + (sz / L) * n0[1] : 1;
        v = L > 1e-9 && cs > 0.2 ? [sx / L / cs, sz / L / cs] : n0;
      } else v = n0 || n1 || [0, 0];
      /* [−dz, dx] é a ESQUERDA de quem anda (planta x, z): direita = −v */
      out.push({ x: r6(pts[i].x - d * v[0]), y: pts[i].y, z: r6(pts[i].z - d * v[1]) });
    }
    return out;
  }
  function guardaDeslocada(self, lista, o) {
    var o2 = {}; Object.keys(o).forEach(function (k) { o2[k] = o[k]; }); o2._p9cam = true;
    var base = self.guarda(lista, o2); if (!base) return null;
    var r = self.guarda(deslocarPolilinha(base.guarda.pts, num(o.deslocCaminho, 0)), o2); if (!r) return null;
    r.guarda.pts = base.guarda.pts;                       /* o caminho gravado é o de antes */
    r.guarda.par.deslocCaminho = r6(num(o.deslocCaminho, 0));
    return r;
  }
  function corrimaosGuarda(c, o) {
    if (!c || !o) return c;
    var par = c.guarda.par, lista = [], tot = 0, X = c._exato || null;
    CAMPOS_CORRIMAO.forEach(function (k) { var v = Number(o[k]); if (o[k] != null && o[k] !== "" && isFinite(v) && Math.abs(v) <= 3) par[k] = r6(v); });
    [1, 2].forEach(function (j) {
      var h = num(par["c" + j + "Altura"], 0); if (!(h >= 0.3 && h <= 2)) return;
      /* o caminho do corrimão: o da peça (já deslocada pelo guardaDeslocada) mais o deslocamento lateral dele */
      var ln = deslocarPolilinha(c.guarda.pts, num(par["c" + j + "Desloc"], 0));
      for (var i = 0; i + 1 < ln.length; i++) {
        var a = ln[i], b = ln[i + 1], L = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y) + (b.z - a.z) * (b.z - a.z));
        lista.push({ n: j, a: { x: a.x, y: r6(a.y + h), z: a.z }, b: { x: b.x, y: r6(b.y + h), z: b.z } }); tot += L;
      }
    });
    if (!lista.length) return c;
    c.guarda.corrimaos = lista;
    c.medidas.comprimentoCorrimao = r4(tot);
    if (X && X.medidas) X.medidas.comprimentoCorrimao = tot;
    return c;
  }

  var BimArq = {
    TIPOS_LAJE: TIPOS_LAJE, PERFIS: PERFIS, MATERIAIS: MATERIAIS, TIPOS_ESCADA: TIPOS_ESCADA, GUARDA_ESCADA: GUARDA_ESCADA,
    REGRAS_ESCADA: REGRAS_ESCADA, regraEscada: regraEscada, FORMAS_ESCADA: FORMAS_ESCADA,   /* P9 */
    RESTR_TIPO: RESTR_TIPO, CAMPOS_RESTR: CAMPOS_RESTR, ROTULOS_RESTR: ROTULOS_RESTR, mapaNiveis: mapaNiveis,
    /* P4 (frentes A e B) */
    LINHAS_LOC: LINHAS_LOC, VIRAR_EXT: VIRAR_EXT, VIRAR_INS: VIRAR_INS, PRIORIDADE_UNIAO: PRIORIDADE_UNIAO,
    linhaLocDe: linhaLocDe, wLinhaLoc: wLinhaLoc, ladosParede: ladosParede, rotuloVirar: rotuloVirar,
    intersecao: intersecao, momentos: momentos, triangular: triangular,
    /* recuo de junta da viga de aço que chega num pilar de aço: o recuo de junta
       (join cutback) de 1/2" — conferido na referência medida (W310X38.7 de
       6,00 m entre eixos saindo de um pilar W250X73: 0,028906 m³ =
       área × (6 − 0,127 − 0,0127)) */
    RECUO_JUNTA_ACO: 0.0127,
    /* utilidades expostas para o desenho e para o teste */
    areaSinal: areaSinal, perimetro: perimetro, dentro: dentro, centroide: centroide, poligonoSimples: poligonoSimples,
    frameDe: frameDe, aMundo: aMundo, aLocal: aLocal, secao: secao, rotuloPerfil: rotuloPerfil,

    /* ================================================================ EIXOS
     * A grade de eixos: linha com bolinha e nome nas pontas.
     * Eixo que corre mais no sentido Z (vertical na planta) ganha NÚMERO;
     * o que corre no sentido X, LETRA — a convenção de prancha de estrutura. */
    eixo: function (p1, p2, nome) {
      var a = pt(p1), b = pt(p2);
      if (!fin(a[0]) || !fin(a[1]) || !fin(b[0]) || !fin(b[1])) return null;
      var L = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      if (!(L >= 0.3)) return null;
      return { x0: r6(a[0]), z0: r6(a[1]), x1: r6(b[0]), z1: r6(b[1]), nome: String(nome == null ? "" : nome).trim().slice(0, 12) || "?" };
    },
    proximoNomeEixo: function (eixos, p1, p2) {
      var a = pt(p1), b = pt(p2), numero = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
      var usados = {}; arr(eixos).forEach(function (e) { usados[String(e && e.nome).toUpperCase()] = 1; });
      if (numero) { for (var i = 1; i < 1000; i++) if (!usados[String(i)]) return String(i); return "?"; }
      for (var k = 0; k < 702; k++) {
        var s = k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(64 + Math.floor(k / 26)) + String.fromCharCode(65 + (k % 26));
        if (s === "I" || s === "O") continue;   /* I e O se confundem com 1 e 0 na prancha */
        if (!usados[s]) return s;
      }
      return "?";
    },

    /* ======================================================= PAREDE POR TIPO
     * O tipo vem do js/alvtipos.js (núcleo + camadas de cada face). A parede
     * leva uma FOTO do tipo — a lista de camadas na ordem física, de fora
     * para dentro —, para o replay dar sempre a mesma parede mesmo que o
     * catálogo mude depois. */
    tipoParede: function (t) {
      if (!t || !t.ok) return null;
      var cam = [];
      arr(t.fora).slice().reverse().forEach(function (c) { cam.push({ id: c.id, rotulo: c.rotulo, face: "fora", e: r6(num(c.espessura, 0) / 1000), material: c.material || "", servico: c.servico || "" }); });
      cam.push({ id: (t.nucleo && t.nucleo.id) || "nucleo", rotulo: (t.nucleo && t.nucleo.rotulo) || "Núcleo", face: "nucleo", e: r6(num(t.espessuraNucleo, 0) / 1000), material: (t.nucleo && t.nucleo.tipo) || "", servico: "Alvenaria" });
      arr(t.dentro).forEach(function (c) { cam.push({ id: c.id, rotulo: c.rotulo, face: "dentro", e: r6(num(c.espessura, 0) / 1000), material: c.material || "", servico: c.servico || "" }); });
      var soma = cam.reduce(function (s, c) { return s + c.e; }, 0);
      return { id: String(t.id || "custom"), rotulo: String(t.rotulo || "Parede"), espessura: r6(soma), camadas: cam };
    },
    /* marca a parede que acabou de nascer dos cliques (BimEdit.parede) como
       parede do modelador: une nos cantos, recorta no topo, leva o tipo */
    marcarParede: function (c, cfg) {
      if (!c) return c;
      cfg = cfg || {};
      c.b2 = 1; c.unir = cfg.unir !== false; c.anexarTopo = !!cfg.anexarTopo;
      /* o canto em L: topo (padrão) ou meia-esquadria (opção) */
      if (cfg.juntaCanto === "esquadria") c.juntaCanto = "esquadria";
      if (cfg.nivelId != null) c.nivelId = String(cfg.nivelId);
      if (cfg.tipoParede && cfg.tipoParede.espessura > 0) {
        c.tipoParede = clone(cfg.tipoParede);
        c.espessura = r4(cfg.tipoParede.espessura);           /* a espessura É a soma das camadas */
        c.volume = r4(c.comprimento * c.altura * c.espessura);
      }
      /* P4: a linha DESENHADA é a linha de localização escolhida (o corpo anda para o lado) */
      var ll = linhaLocDe(cfg.linhaLoc);
      if (ll) { c.linhaLoc = ll; deslocarPorLinha(c, wLinhaLoc(c, ll)); }
      /* P1-B: a parede presa aos níveis (base e "até o nível") — op v:2 */
      if (cfg.restricoes) this.restringir(c, cfg.restricoes, cfg.niveis);
      if (c.arco && Curva()) { var bq = Curva().brutos(c); if (bq) { c.area = r4(bq.area); c.volume = r4(bq.volume); } }   /* CURVA: o arco, não a corda */
      return c;
    },

    /* =================================================== LAJE POR CONTORNO */
    validarPoligono: function (lista) {
      var pts = limparPontos(lista);
      if (pts.some(function (p) { return !fin(p[0]) || !fin(p[1]); })) return { ok: false, motivo: "Há ponto inválido no contorno." };
      if (pts.length < 3) return { ok: false, motivo: "O contorno precisa de pelo menos 3 pontos." };
      if (!poligonoSimples(pts)) return { ok: false, motivo: "O contorno cruza a si mesmo." };
      if (Math.abs(areaSinal(pts)) < 0.01) return { ok: false, motivo: "O contorno não fecha área (pontos alinhados ou muito próximos)." };
      return { ok: true, pts: pts };
    },
    /* o furo cabe no contorno e não encosta nos outros furos? */
    validarFuro: function (contorno, furo, outros) {
      var v = this.validarPoligono(furo); if (!v.ok) return v;
      var C = limparPontos(contorno), F = v.pts;
      if (!F.every(function (p) { return dentro(p, C) && !C.some(function (q, i) { return distSeg(p, q, C[(i + 1) % C.length]) < 1e-6; }); })) return { ok: false, motivo: "O furo tem de ficar inteiro dentro da laje." };
      if (arestasCruzam(F, C)) return { ok: false, motivo: "O furo cruza a borda da laje." };
      var ruim = arr(outros).some(function (o) {
        var O = limparPontos(o && o.pts ? o.pts : o);
        return arestasCruzam(F, O) || F.some(function (p) { return dentro(p, O); }) || O.some(function (p) { return dentro(p, F); });
      });
      if (ruim) return { ok: false, motivo: "O furo encosta em outro furo da laje." };
      return { ok: true, pts: F };
    },
    /* o.topo = cota do piso (topo da laje = nível ativo); o.espessura; o.furos */
    lajeContorno: function (lista, o) {
      if (Curva() && Curva().temArco(lista)) return Curva().lajeContorno(this, lista, o);   /* CURVA: aresta em arco */
      o = o || {};
      var v = this.validarPoligono(lista); if (!v.ok) return null;
      var esp = num(o.espessura, 0.12), topo = num(o.topo, 0);
      if (!(esp >= 0.03 && esp <= 1)) return null;
      var c = { tipo: "laje", ifc: "IFCSLAB", b2: 1, contorno: v.pts.map(ptObj), furos: [], altura: r4(esp), cy: r4(topo - esp / 2), rotY: 0 };
      if (o.tipoLaje) c.tipoLaje = { id: String(o.tipoLaje.id || ""), rotulo: String(o.tipoLaje.rotulo || "") };
      if (o.nivelId != null) c.nivelId = String(o.nivelId);
      var self = this;
      arr(o.furos).forEach(function (f) { var vf = self.validarFuro(v.pts, f, c.furos); if (vf.ok) c.furos.push({ pts: vf.pts.map(ptObj) }); });
      this.recalcLaje(c);
      if (o.restricoes) this.restringir(c, o.restricoes, o.niveis);   /* P1-B: Nível + Altura do deslocamento do nível */
      return c;
    },
    /* área líquida dos furos, volume, perímetro (borda + bordas dos furos) e a
       caixa envolvente. Furo inválido (de um replay antigo) sai com aviso. */
    recalcLaje: function (c) {
      if (Curva() && Curva().temArco(c.contorno)) return Curva().recalcLaje(this, c);   /* CURVA */
      var C = limparPontos(c.contorno), self = this, bons = [], avisos = [];
      arr(c.furos).forEach(function (f, i) {
        var vf = self.validarFuro(C, f && f.pts, bons);
        if (vf.ok) bons.push({ pts: vf.pts.map(ptObj) }); else avisos.push("furo " + (i + 1) + " ignorado: " + vf.motivo);
      });
      c.furos = bons;
      var aC = Math.abs(areaSinal(C)), aF = 0, per = perimetro(C);
      bons.forEach(function (f) { var F = limparPontos(f.pts); aF += Math.abs(areaSinal(F)); per += perimetro(F); });
      var xs = C.map(function (p) { return p[0]; }), zs = C.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
      c.cx = r6((x0 + x1) / 2); c.cz = r6((z0 + z1) / 2); c.comprimento = r6(Math.max(0.01, x1 - x0)); c.espessura = r6(Math.max(0.01, z1 - z0)); c.rotY = 0;
      c.area = r4(aC - aF); c.areaFuros = r4(aF); c.volume = r4((aC - aF) * c.altura); c.perimetro = r4(per);
      exato(c, { area: aC - aF, areaFuros: aF, volume: (aC - aF) * num(c.altura, 0), perimetro: per });
      if (avisos.length) c.avisos = avisos; else delete c.avisos;
      return c;
    },

    /* ============================================ PILAR E VIGA POR PERFIL */
    pilarPerfil: function (p, o) {
      o = o || {};
      var q = pt(p); if (!fin(q[0]) || !fin(q[1])) return null;
      var s = secao(o.perfil); if (!s.ok) return null;
      var mat = MATERIAIS[o.material] ? o.material : "concreto";
      var base = num(o.base, 0), H = num(o.altura, 2.8);
      if (!(H > 0.1) || H > 30) return null;
      var c = { tipo: "pilar", ifc: "IFCCOLUMN", b2: 1, cx: r6(q[0]), cz: r6(q[1]), cy: r4(base + H / 2), altura: r4(H), rotY: r6(num(o.rotY, 0)),
                perfil: clone(o.perfil), material: mat, basePilar: r4(base) };
      if (o.nivelId != null) c.nivelId = String(o.nivelId);
      this.recalcPeca(c);
      if (o.restricoes) this.restringir(c, o.restricoes, o.niveis);   /* P1-B: Nível base/superior + deslocamentos */
      return c;
    },
    vigaPerfil: function (p1, p2, o) {
      o = o || {};
      if (o.arco && o.arco.m) return Curva() ? Curva().vigaCurva(this, p1, p2, o) : null;   /* CURVA: viga curva (seção retangular) */
      var a = pt(p1), b = pt(p2), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz);
      if (!(L > 0.05)) return null;
      var s = secao(o.perfil); if (!s.ok) return null;
      var mat = MATERIAIS[o.material] ? o.material : "concreto", topo = num(o.topo, 2.8);
      var c = { tipo: "viga", ifc: "IFCBEAM", b2: 1, cx: r6((a[0] + b[0]) / 2), cz: r6((a[1] + b[1]) / 2), comprimento: r4(L), rotY: r6(Math.atan2(-dz, dx)),
                perfil: clone(o.perfil), material: mat, topoViga: r4(topo) };
      if (o.nivelId != null) c.nivelId = String(o.nivelId);
      this.recalcPeca(c);
      if (o.restricoes) this.restringir(c, o.restricoes, o.niveis);   /* P1-B: Nível de referência + deslocamento */
      return c;
    },
    /* a caixa e as medidas saem da SEÇÃO: volume = área × comprimento;
       fôrma (concreto) = perímetro molhado; pintura (aço) = perímetro todo */
    recalcPeca: function (c) {
      var s = secao(c.perfil); if (!s.ok) { c.avisos = [s.motivo]; return c; }
      var mat = MATERIAIS[c.material] || MATERIAIS.concreto;
      c.secaoArea = r6(s.area); c.perimetroSecao = r6(s.perimetro); c.perfilRotulo = s.rotulo;
      if (c.tipo === "pilar") {
        var H = num(c.altura, 2.8), base = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - H / 2;
        c.comprimento = r6(s.larg); c.espessura = r6(s.alt); c.cy = r4(base + H / 2);
        c.area = r6(s.area); c.volume = r6(s.area * H); c.comprimentoPilar = r4(H);
        c.areaForma = r6(s.perimetro * H);
        exato(c, { area: s.area, volume: s.area * H, comprimentoPilar: H, perimetroSecao: s.perimetro, areaForma: s.perimetro * H, massa: mat.rho ? s.area * H * mat.rho : null });
      } else {
        /* comprimento de CORTE: o eixo menos os recuos nas pontas que chegam
           num pilar (derivar → recuosViga); sem pilar, o eixo inteiro */
        if (c.arco && Curva()) return Curva().recalcViga(c, s, mat);   /* CURVA: o anel da viga curva */
        var L = Math.max(0.01, num(c.comprimento, 0) - num(c.recuoIni, 0) - num(c.recuoFim, 0)), topo = c.topoViga != null ? num(c.topoViga, 2.8) : num(c.cy, 0) + num(c.altura, 0) / 2;
        c.altura = r6(s.alt); c.espessura = r6(s.larg); c.cy = r4(topo - s.alt / 2);
        c.volume = r6(s.area * L); c.comprimentoViga = r4(L);
        /* viga de concreto: os dois lados + o fundo (a laje fecha o topo);
           aço e madeira: o perímetro todo (pintura/tratamento) */
        c.area = r6((mat.forma && s.forma === "ret" ? (2 * s.alt + s.larg) : s.perimetro) * L);
        c.areaForma = c.area;
        exato(c, { volume: s.area * L, comprimentoViga: L, area: (mat.forma && s.forma === "ret" ? (2 * s.alt + s.larg) : s.perimetro) * L, perimetroSecao: s.perimetro, massa: mat.rho ? s.area * L * mat.rho : null });
      }
      var p9 = P9(); if (p9) p9.posPeca(c, s, mat);   /* P9 — GANCHO */
      c.massa = mat.rho ? r4(c.volume * mat.rho) : null;
      delete c.avisos;
      return c;
    },
    /* RECUOS DA VIGA nas pontas que caem dentro de um pilar (na planta, com
       as alturas se cruzando): a viga para na FACE do pilar — o nó é do
       pilar (o pilar corta a viga) e como se mede concreto
       sem contar o nó duas vezes. Aço com aço: mais o recuo de junta
       (RECUO_JUNTA_ACO, 12,7 mm). Face = a caixa da seção (I/H, U, L, tubo,
       retangular) ou o círculo. Devolve [recuo no início, recuo no fim] (m). */
    recuosViga: function (c, pilares) {
      var f = frameDe(c), L = f.L, out = [0, 0], sv = secao(c.perfil);
      var yTopo = c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2, yb = yTopo - (sv.ok ? sv.alt : num(c.altura, 0));
      [0, 1].forEach(function (k) {
        var P = aMundo(f, k === 0 ? -L / 2 : L / 2, 0), d = k === 0 ? [f.co, -f.si] : [-f.co, f.si];   /* d: da ponta para dentro da viga */
        arr(pilares).forEach(function (pc) {
          var sp = secao(pc.perfil); if (!sp.ok || pc === c) return;
          var H = num(pc.altura, 0), base = pc.basePilar != null ? num(pc.basePilar, 0) : num(pc.cy, 0) - H / 2;
          if (Math.min(base + H, yTopo) - Math.max(base, yb) < 0.01) return;
          var fp = frameDe(pc), l = aLocal(fp, P[0], P[1]), dl = [d[0] * fp.co - d[1] * fp.si, d[0] * fp.si + d[1] * fp.co];
          var hx = sp.larg / 2, hz = sp.alt / 2, s;
          if (sp.forma === "circ" || sp.forma === "tubo-circ") {
            var cc = l[0] * l[0] + l[1] * l[1] - hx * hx; if (cc > 1e-9) return;
            var bb = l[0] * dl[0] + l[1] * dl[1]; s = -bb + Math.sqrt(Math.max(0, bb * bb - cc));
          } else {
            if (Math.abs(l[0]) > hx + 1e-6 || Math.abs(l[1]) > hz + 1e-6) return;
            s = Infinity;
            if (Math.abs(dl[0]) > 1e-12) s = Math.min(s, ((dl[0] > 0 ? hx : -hx) - l[0]) / dl[0]);
            if (Math.abs(dl[1]) > 1e-12) s = Math.min(s, ((dl[1] > 0 ? hz : -hz) - l[1]) / dl[1]);
          }
          var rec = s + (c.material === "aco" && pc.material === "aco" ? BimArq.RECUO_JUNTA_ACO : 0);
          if (isFinite(rec) && rec > out[k]) out[k] = rec;
        });
      });
      if (out[0] + out[1] > L - 0.05) return [0, 0];   /* a viga inteira dentro do pilar: não recorta */
      return [r6(out[0]), r6(out[1])];
    },

    /* ============================================================= ESCADA
     * Pelas REGRAS DO TIPO (o = { emax, pmin, piso, n,
     * larguraMin, largura } — o que faltar vem do tipo padrão):
     *   n = ⌈H / emax⌉ (espelho mais baixo, nunca mais alto) · e = H / n ·
     *   p = max(pmin, piso do tipo, se houver).
     * Desnível 2,80 m no tipo padrão: 16 espelhos de 175 mm e piso de 275 mm
     * — o número da referência medida. Blondel (63 ≤ 2e + p ≤ 64 cm, conforto) é só
     * AVISO: não mexe no piso (antes a regra escolhia o piso e dava
     * 290 mm onde o tipo pede 275). */
    tipoEscada: function (id) {
      return TIPOS_ESCADA.filter(function (t) { return t.id === id; })[0] || TIPOS_ESCADA[0];
    },
    escadaCalc: function (H, o) {
      o = o || {};
      H = num(H, 0);
      var tp = this.tipoEscada(o.tipoId);
      var emax = num(o.emax, tp.emax), pmin = num(o.pmin, tp.pmin), piso = num(o.piso, tp.piso), emin = 0.16;
      if (!(H >= 0.3) || H > 12) return { ok: false, motivo: "Desnível entre 0,30 e 12 m." };
      if (!(emax >= 0.12 && emax <= 0.25)) return { ok: false, motivo: "Espelho máximo entre 12 e 25 cm." };
      if (!(pmin >= 0.15 && pmin <= 0.6)) return { ok: false, motivo: "Profundidade mínima do piso entre 15 e 60 cm." };
      if (piso != null && !(piso >= 0.15 && piso <= 0.6)) return { ok: false, motivo: "Profundidade do piso entre 15 e 60 cm." };
      var n = num(o.n, 0) >= 2 ? Math.round(num(o.n, 0)) : Math.ceil(H / emax - 1e-9);
      if (n < 2) n = 2;
      var e = H / n;
      /* P9 — REGRA DE CÁLCULO selecionável (o "Regras de cálculo" do tipo):
         "revit" (padrão) = o piso do TIPO, como acima; "blondel" = a
         regra RA de antes da P0 — o MAIOR piso, em meio centímetro, com
         2e + p ≤ 64 cm (subindo até 63 se faltar). Desnível 2,80 m: tipo
         27,5 cm, Blondel RA 29,0 cm (o número que o OrçaPRO dava em 08/10). */
      var regra = regraEscada(o.regra);
      var p = r4(Math.max(pmin, piso != null ? piso : 0));
      if (regra === "blondel") {
        p = Math.floor((0.64 - 2 * e) * 200 + 1e-9) / 200;
        if (2 * e + p < 0.63 - 1e-9) p = Math.ceil((0.63 - 2 * e) * 200 - 1e-9) / 200;
        p = r4(p);
        if (!(p > 0.15)) return { ok: false, motivo: "Regra de Blondel: com " + n + " espelhos o piso ficaria com " + cm(p) + " cm — aumente o número de degraus." };
      }
      var bl = 2 * e + p, avisos = [];
      if (regra === "blondel" && p < pmin - 1e-9) avisos.push("Blondel: piso de " + cm(p) + " cm abaixo da profundidade mínima do tipo (" + cm(pmin) + " cm).");
      if (e > emax + 1e-9) avisos.push("Espelho de " + cm(e) + " cm passa do máximo de " + cm(emax) + " cm do tipo.");
      if (e < emin - 1e-9) avisos.push("Espelho de " + cm(e) + " cm abaixo de " + cm(emin) + " cm (faixa usual 16 a 18 cm).");
      if (p < 0.28 - 1e-9) avisos.push("Piso de " + cm(p) + " cm abaixo de 28 cm.");
      if (regra !== "blondel" && (bl < 0.63 - 1e-9 || bl > 0.64 + 1e-9)) avisos.push("Blondel: 2e + p = " + cm(bl) + " cm, fora de 63 a 64 cm (conforto, NBR 9050/NBR 9077) — o piso fica o do tipo.");
      var lmin = num(o.larguraMin, tp.larguraMin);
      if (o.largura != null && lmin > 0 && num(o.largura, 0) < lmin - 1e-9) avisos.push("Largura do lance " + cm(num(o.largura, 0)) + " cm abaixo da mínima do tipo (" + cm(lmin) + " cm).");
      return { ok: true, n: n, e: r6(e), p: p, blondel: r4(bl), avisos: avisos, regra: regra === "blondel" ? "blondel" : "tipo", tipoId: tp.id, emax: emax, pmin: pmin, piso: piso, larguraMin: lmin };
    },
    /* o perfil (lateral) de um lance com k espelhos: degraus em cima, laje
       inclinada de espessura t (medida na perpendicular) embaixo. (u, y) com
       u ao longo do lance e o primeiro espelho em u = 0. */
    /* O lance TERMINA COM ESPELHO: o k-ésimo espelho é a face
       vertical da ponta, em u = (k−1)·p, e sobe até o piso de cima (que é a
       laje/patamar, não o lance). Antes o contorno subia esse espelho até
       k·e e DESCIA pela mesma reta — uma "agulha" de largura zero que o
       Revit recusa ("IfcPolyLine autointersectante": a escada chegava sem
       geometria). Agora o topo do lance para no último piso, (k−1)·e, e a
       ponta desce reta até a laje inclinada: polígono simples. O volume não
       muda (a agulha tinha área zero) e os k espelhos continuam contados. */
    /* P9 — "Começar com espelho" / "Finalizar com espelho" (parâmetros do
       lance, padrão Sim). semIni: o lance começa por um PISO no
       nível da base (o primeiro espelho fica um piso adiante — o perfil anda
       p, sem sólido nesse piso, que é o próprio piso de baixo); semFim: o
       lance termina por um PISO no nível de cima (mais um degrau de p no
       topo). O número de espelhos não muda (é o desnível que manda); o de
       pisos ganha 1 por opção desligada, como se conta
       (pisos = espelhos − 1 + começar sem + terminar sem). */
    perfilLance: function (k, e, p, t, semIni, semFim) {
      if (semIni || semFim) return this.perfilLanceP9(k, e, p, t, !!semIni, !!semFim);
      var pts = [[0, 0], [0, e]];
      for (var j = 1; j <= k - 1; j++) { pts.push([j * p, j * e]); if (j < k - 1) pts.push([j * p, (j + 1) * e]); }
      var g = t * Math.sqrt(p * p + e * e) / p, uf = (k - 1) * p, yb = (k - 1) * e - g, u0 = g * p / e, fundo;
      if (yb > 1e-6 && u0 < uf - 1e-6) { pts.push([uf, yb]); pts.push([u0, 0]); fundo = Math.sqrt((uf - u0) * (uf - u0) + yb * yb); }
      else { pts.push([uf, 0]); fundo = uf; }   /* lance curto: maciço até o chão */
      return { pts: pts, fundo: fundo };
    },
    /* o mesmo perfil com o começo e/ou o fim em PISO (P9; o padrão acima não muda) */
    perfilLanceP9: function (k, e, p, t, semIni, semFim) {
      var sh = semIni ? p : 0, pts = [[sh, 0], [sh, e]];
      for (var j = 1; j <= k - 1; j++) { pts.push([sh + j * p, j * e]); if (j < k - 1 || semFim) pts.push([sh + j * p, (j + 1) * e]); }
      if (semFim) pts.push([sh + k * p, k * e]);
      var g = t * Math.sqrt(p * p + e * e) / p, kf = k - 1 + (semFim ? 1 : 0), uf = kf * p, yb = kf * e - g, u0 = g * p / e, fundo;
      if (yb > 1e-6 && u0 < uf - 1e-6) { pts.push([sh + uf, yb]); pts.push([sh + u0, 0]); fundo = Math.sqrt((uf - u0) * (uf - u0) + yb * yb); }
      else { pts.push([sh + uf, 0]); fundo = uf; }
      return { pts: pts, fundo: fundo };
    },
    /* par = { x, z (meio do 1º espelho), ang (direção da subida, rad no plano
       XZ), base, desnivel, largura, forma: 'reta'|'L'|'U', giro: 'direita'|'esquerda',
       k1 (espelhos do 1º lance), espessura, emax, n }
       P9: regra ('revit' | 'blondel'), vao (escada em U: o poço entre os
       lances, m), comecaEspelho / terminaEspelho (false = começa/termina com
       piso), revPiso / revEspelho (espessura do revestimento, m) e
       matPiso / matEspelho (texto) — só entram no par quando informados:
       a escada antiga sai byte a byte igual. */
    escada: function (par) {
      par = clone(par || {});
      if (!fin(par.x) || !fin(par.z) || !fin(par.ang)) return null;
      var W = num(par.largura, 1.0), t = num(par.espessura, 0.12), base = num(par.base, 0);
      if (!(W >= 0.6 && W <= 4) || !(t >= 0.06 && t <= 0.4)) return null;
      var calc = this.escadaCalc(par.desnivel, { n: par.n, emax: par.emax, pmin: par.pmin, piso: par.piso, tipoId: par.tipoId, larguraMin: par.larguraMin, largura: W, regra: par.regra });
      if (!calc.ok) return null;
      var n = calc.n, e = calc.e, p = calc.p, forma = FORMAS_ESCADA[par.forma] ? par.forma : "reta";
      var k1 = n, k2 = 0, g = par.giro === "esquerda" ? -1 : 1;
      if (forma !== "reta") {
        if (n < 4) return null;
        k1 = (par.k1 >= 2 && par.k1 <= n - 2) ? Math.round(par.k1) : Math.ceil(n / 2);
        k2 = n - k1;
      }
      /* P9: o poço da escada em U e o começar/terminar com piso (1º e último lance) */
      var vao = forma === "U" ? Math.max(0, Math.min(3, num(par.vao, 0))) : 0;
      var semIni = par.comecaEspelho === false, semFim = par.terminaEspelho === false, ext0 = semIni ? p : 0, extF = semFim ? p : 0;
      var d = [Math.cos(par.ang), Math.sin(par.ang)], r = [-d[1], d[0]];
      var self = this, lances = [], vol = 0, pisos = 0, fundo = 0, lateral = 0, bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity };
      function caixaPt(x, y, z) { if (x < bb.x0) bb.x0 = x; if (x > bb.x1) bb.x1 = x; if (z < bb.z0) bb.z0 = z; if (z > bb.z1) bb.z1 = z; if (y < bb.y0) bb.y0 = y; if (y > bb.y1) bb.y1 = y; }
      function lance(k, x0, z0, dir, y0, si, sf) {
        var pf = self.perfilLance(k, e, p, t, si, sf), A = Math.abs(areaSinal(pf.pts)), rr = [-dir[1], dir[0]];
        var lo = { perfil: pf.pts.map(function (q) { return { u: r6(q[0]), y: r6(q[1]) }; }), largura: W, x: r6(x0), z: r6(z0), ang: r6(Math.atan2(dir[1], dir[0])), y: r6(y0), k: k, area: r6(A) };
        if (si) lo.semIni = true;
        if (sf) lo.semFim = true;
        lances.push(lo);
        vol += A * W; pisos += k - 1 + (si ? 1 : 0) + (sf ? 1 : 0); lateral += 2 * A; fundo += W * pf.fundo;
        pf.pts.forEach(function (q) { [-W / 2, W / 2].forEach(function (w) { caixaPt(x0 + q[0] * dir[0] + w * rr[0], y0 + q[1], z0 + q[0] * dir[1] + w * rr[1]); }); });
      }
      var patamar = null, P0 = [num(par.x, 0), num(par.z, 0)], aPat = 0, uL = ext0 + (k1 - 1) * p, yP = base + k1 * e;
      lance(k1, P0[0], P0[1], d, base, semIni, forma === "reta" && semFim);
      function cantos(Q) { return Q.map(function (q) { return [P0[0] + q[0] * d[0] + q[1] * r[0], P0[1] + q[0] * d[1] + q[1] * r[1]]; }); }
      if (forma === "L") {
        var cant = cantos([[uL, -W / 2], [uL + W, -W / 2], [uL + W, W / 2], [uL, W / 2]]);
        patamar = { pts: cant.map(ptObj), y0: r6(yP - t), y1: r6(yP) };
        cant.forEach(function (q) { caixaPt(q[0], yP - t, q[1]); caixaPt(q[0], yP, q[1]); });
        aPat = W * W; vol += W * W * t; fundo += W * W + 3 * W * t;
        var d2 = [g * r[0], g * r[1]], cM = [P0[0] + (uL + W / 2) * d[0], P0[1] + (uL + W / 2) * d[1]];
        lance(k2, cM[0] + (W / 2) * d2[0], cM[1] + (W / 2) * d2[1], d2, yP, false, semFim);
      } else if (forma === "U") {
        /* P9 — ESCADA EM U: o patamar de meia-volta tem a profundidade da
           largura do lance e a largura dos dois lances mais o poço; o 2º
           lance começa na borda do patamar e desce paralelo ao 1º, ao lado
           do giro (direita = o 2º lance fica à direita de quem sobe o 1º) */
        var wa = -g * W / 2, wb = g * (W + vao + W / 2), wlo = Math.min(wa, wb), whi = Math.max(wa, wb), Wp = 2 * W + vao;
        var cantU = cantos([[uL, wlo], [uL + W, wlo], [uL + W, whi], [uL, whi]]);
        patamar = { pts: cantU.map(ptObj), y0: r6(yP - t), y1: r6(yP) };
        cantU.forEach(function (q) { caixaPt(q[0], yP - t, q[1]); caixaPt(q[0], yP, q[1]); });
        aPat = W * Wp; vol += W * Wp * t; fundo += W * Wp + (Wp + 2 * W + vao) * t;
        var o2 = [P0[0] + uL * d[0] + g * (W + vao) * r[0], P0[1] + uL * d[1] + g * (W + vao) * r[1]];
        lance(k2, o2[0], o2[1], [-d[0], -d[1]], yP, false, semFim);
      }
      var areaPiso = pisos * p * W + aPat, areaEspelho = n * e * W;
      var compPerc = ext0 + (forma === "L" ? (k1 - 1) * p + W + (k2 - 1) * p : (forma === "U" ? (k1 - 1) * p + (2 * W + vao) + (k2 - 1) * p : (n - 1) * p)) + extF;
      /* caminhos para o guarda-corpo: a linha dos bocéis, a 5 cm da borda */
      var m = 0.05, h = W / 2 - m, H = num(par.desnivel, 0), caminhos = {};
      function F1(u, w, y) { return { x: r6(P0[0] + u * d[0] + w * r[0]), y: r6(base + y), z: r6(P0[1] + u * d[1] + w * r[1]) }; }
      if (forma === "reta") {
        caminhos.direita = [F1(ext0, h, e), F1(ext0 + (n - 1) * p, h, H)];
        caminhos.esquerda = [F1(ext0, -h, e), F1(ext0 + (n - 1) * p, -h, H)];
        if (semFim) { caminhos.direita.push(F1(ext0 + n * p, h, H)); caminhos.esquerda.push(F1(ext0 + n * p, -h, H)); }
      } else {
        var lb = lances[1], d2b = [Math.cos(lb.ang), Math.sin(lb.ang)], r2b = [-d2b[1], d2b[0]];
        var F2 = function (u, w, y) { return { x: r6(lb.x + u * d2b[0] + w * r2b[0]), y: r6(base + y), z: r6(lb.z + u * d2b[1] + w * r2b[1]) }; };
        if (forma === "L") {
          caminhos.externo = [F1(ext0, -g * h, e), F1(uL, -g * h, k1 * e), F1(uL + W - m, -g * h, k1 * e), F2(0, -g * h, k1 * e + e), F2((k2 - 1) * p, -g * h, H)];
          caminhos.interno = [F1(ext0, g * h, e), F1(uL, g * h, k1 * e), F2(0, g * h, k1 * e + e), F2((k2 - 1) * p, g * h, H)];
        } else {
          /* U: por fora contorna o patamar; por dentro atravessa o poço */
          caminhos.externo = [F1(ext0, -g * h, e), F1(uL, -g * h, k1 * e), F1(uL + W - m, -g * h, k1 * e), F1(uL + W - m, g * (W + vao) + g * h, k1 * e), F2(0, -g * h, k1 * e), F2(0, -g * h, k1 * e + e), F2((k2 - 1) * p, -g * h, H)];
          caminhos.interno = [F1(ext0, g * h, e), F1(uL, g * h, k1 * e), F2(0, g * h, k1 * e + e), F2((k2 - 1) * p, g * h, H)];
        }
        if (semFim) { caminhos.externo.push(F2(k2 * p, -g * h, H)); caminhos.interno.push(F2(k2 * p, g * h, H)); }
      }
      var c = {
        tipo: "escada", ifc: "IFCSTAIR", b2: 1,
        cx: r6((bb.x0 + bb.x1) / 2), cz: r6((bb.z0 + bb.z1) / 2), cy: r6((bb.y0 + bb.y1) / 2),
        comprimento: r6(Math.max(0.01, bb.x1 - bb.x0)), espessura: r6(Math.max(0.01, bb.z1 - bb.z0)), altura: r6(Math.max(0.01, bb.y1 - bb.y0)), rotY: 0,
        escada: { par: { x: P0[0], z: P0[1], ang: num(par.ang, 0), base: base, desnivel: H, largura: W, forma: forma, giro: g < 0 ? "esquerda" : "direita", k1: forma !== "reta" ? k1 : null, espessura: t, emax: par.emax != null ? num(par.emax, 0.18) : null, n: par.n != null ? par.n : null,
                       tipoId: calc.tipoId, pmin: par.pmin != null ? num(par.pmin, null) : null, piso: par.piso != null ? num(par.piso, null) : null, larguraMin: par.larguraMin != null ? num(par.larguraMin, null) : null,
                       guarda: GUARDA_ESCADA[par.guarda] ? par.guarda : this.tipoEscada(calc.tipoId).guarda },
                  calc: calc, k: forma !== "reta" ? [k1, k2] : [n], lances: lances, patamar: patamar, caminhos: caminhos },
        area: r4(areaPiso), volume: r6(vol),
        medidas: { volume: r6(vol), area: r4(areaPiso), areaEspelho: r4(areaEspelho), areaForma: r4(fundo + lateral + areaEspelho), comprimento: r4(compPerc), un: 1, espelhos: n, pisos: pisos }
      };
      /* P9: o que só existe quando foi informado (a escada antiga não ganha chave nova) */
      var pp = c.escada.par, mx = c.medidas, X = { volume: vol, area: areaPiso, areaEspelho: areaEspelho, areaForma: fundo + lateral + areaEspelho, comprimento: compPerc };
      if (forma === "U") pp.vao = r6(vao);
      if (calc.regra === "blondel") pp.regra = "blondel";
      if (semIni) pp.comecaEspelho = false;
      if (semFim) pp.terminaEspelho = false;
      ["revPiso", "revEspelho"].forEach(function (k) { var v = num(par[k], 0); if (v > 0 && v <= 0.2) pp[k] = r6(v); });
      ["matPiso", "matEspelho"].forEach(function (k) { if (par[k] != null && String(par[k]).trim()) pp[k] = String(par[k]).trim().slice(0, 80); });
      /* revestimento: a área é a do piso (pisos + patamar) e a dos espelhos; o
         VOLUME do revestimento só com a espessura informada */
      if (pp.revPiso) { mx.volRevPiso = r6(areaPiso * pp.revPiso); X.volRevPiso = areaPiso * pp.revPiso; }
      if (pp.revEspelho) { mx.volRevEspelho = r6(areaEspelho * pp.revEspelho); X.volRevEspelho = areaEspelho * pp.revEspelho; }
      exato(c, { area: areaPiso, volume: vol, medidas: X });
      if (par.nivelId != null) c.nivelId = String(par.nivelId);
      /* P1-B: Nível base/superior + deslocamentos (o desnível sai dos níveis) */
      if (par.restricoes) this.restringir(c, par.restricoes, par.niveis);
      return c;
    },

    /* ======================================================= GUARDA-CORPO
     * pts = caminho [{x, y, z}] (y = o piso ou a linha dos bocéis embaixo).
     * Montantes em cada vértice e no meio dos trechos, com vão ≤ espac. */
    guarda: function (lista, o) {
      if (Curva() && arr(lista).some(function (p) { return p && p.m; })) return Curva().guarda(this, lista, o);   /* CURVA: trecho em arco */
      o = o || {};
      /* P9: "Deslocamento a partir do caminho" — a peça inteira anda de lado (o caminho gravado não muda) */
      if (num(o.deslocCaminho, 0) && !o._p9cam) return guardaDeslocada(this, lista, o);
      var alt = num(o.altura, 1.10), esp = num(o.espac, 1.20), sm = num(o.secMontante, 0.04), sc = num(o.secCorrimao, 0.05);
      if (!(alt >= 0.5 && alt <= 2) || !(esp >= 0.2 && esp <= 3)) return null;
      var pts = [];
      arr(lista).forEach(function (p) {
        if (!p || !fin(Number(p.x)) || !fin(Number(p.y)) || !fin(Number(p.z))) return;
        var q = { x: r6(Number(p.x)), y: r6(Number(p.y)), z: r6(Number(p.z)) }, u = pts[pts.length - 1];
        if (u && Math.abs(u.x - q.x) < 0.02 && Math.abs(u.z - q.z) < 0.02 && Math.abs(u.y - q.y) < 0.02) return;
        pts.push(q);
      });
      if (pts.length < 2) return null;
      var mont = [], cor = [], comp = 0, bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity };
      function caixaPt(q, y) { if (q.x < bb.x0) bb.x0 = q.x; if (q.x > bb.x1) bb.x1 = q.x; if (q.z < bb.z0) bb.z0 = q.z; if (q.z > bb.z1) bb.z1 = q.z; if (y < bb.y0) bb.y0 = y; if (y > bb.y1) bb.y1 = y; }
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1], L = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y) + (b.z - a.z) * (b.z - a.z));
        comp += L;
        var nd = Math.max(1, Math.ceil(L / esp - 1e-9));
        for (var k = (i === 0 ? 0 : 1); k <= nd; k++) { var f = k / nd; mont.push({ x: r6(a.x + (b.x - a.x) * f), y: r6(a.y + (b.y - a.y) * f), z: r6(a.z + (b.z - a.z) * f) }); }
        cor.push({ a: { x: a.x, y: r6(a.y + alt), z: a.z }, b: { x: b.x, y: r6(b.y + alt), z: b.z } });
        caixaPt(a, a.y); caixaPt(a, a.y + alt); caixaPt(b, b.y); caixaPt(b, b.y + alt);
      }
      return corrimaosGuarda(exato({
        tipo: "guarda", ifc: "IFCRAILING", b2: 1,
        cx: r6((bb.x0 + bb.x1) / 2), cz: r6((bb.z0 + bb.z1) / 2), cy: r6((bb.y0 + bb.y1) / 2),
        comprimento: r6(Math.max(sm, bb.x1 - bb.x0)), espessura: r6(Math.max(sm, bb.z1 - bb.z0)), altura: r6(Math.max(0.01, bb.y1 - bb.y0)), rotY: 0,
        guarda: { par: { altura: alt, espac: esp, secMontante: sm, secCorrimao: sc }, pts: pts, montantes: mont, corrimao: cor },
        area: r4(comp * alt), volume: 0,
        medidas: { comprimento: r4(comp), un: 1, area: r4(comp * alt), montantes: mont.length, comprimentoMontantes: r4(mont.length * alt) }
      }, { area: comp * alt, medidas: { comprimento: comp, area: comp * alt, comprimentoMontantes: mont.length * alt } }), o);
    },
    recalcGuarda: function (c) {
      var g = c.guarda || {}, host = g.host, n = this.guarda(g.pts, g.par || {});
      if (!n) { c.avisos = ["guarda-corpo sem caminho válido"]; return c; }
      Object.keys(n).forEach(function (k) { if (k !== "tipo") c[k] = n[k]; });
      exato(c, n._exato || null);   /* P1-acab */
      if (host) c.guarda.host = host;
      return c;
    },
    /* GUARDA-CORPO AUTOMÁTICO DA ESCADA (a escada nasce com o
       guarda-corpo — a API recusou criar outro porque "já tem"). Um por
       lateral, conforme o tipo/ferramenta: "dois", "um" (direita na reta,
       externo na L) ou "nenhum". Cada um é HOSPEDADO na escada (guarda.host
       = { id, lado, ordem }): o derivar refaz o caminho pela escada — mudou o
       desnível, o guarda-corpo acompanha; apagou a escada, ele sai junto. */
    guardasDaEscada: function (esc, escId, o) {
      o = o || {};
      var cams = esc && esc.escada && esc.escada.caminhos;
      if (!cams || escId == null) return [];
      var par = esc.escada.par || {}, modo = GUARDA_ESCADA[o.guarda] ? o.guarda : (GUARDA_ESCADA[par.guarda] ? par.guarda : "dois");
      if (modo === "nenhum") return [];
      var todos = Object.keys(cams), lados = modo === "um" ? todos.slice(0, 1) : todos, self = this, out = [];
      lados.forEach(function (lado) {
        var g = self.guarda(cams[lado], { altura: o.altura, espac: o.espac });
        if (!g) return;
        g.guarda.host = { id: String(escId), lado: lado, ordem: todos.indexOf(lado) };
        if (esc.nivelId != null) g.nivelId = esc.nivelId;
        out.push(g);
      });
      return out;
    },
    /* a escada e os guarda-corpos dela num LOTE (B8, js/bimedit.js): uma op
       só na lista — o desfazer tira tudo de uma vez. novoId() dá cada id. */
    opsEscada: function (esc, novoId, o) {
      if (!esc || typeof novoId !== "function") return null;
      var self = this, idE = String(novoId()), ops = [{ op: "criar", id: idE, caixa: this.paraOp(esc) }];
      this.guardasDaEscada(esc, idE, o).forEach(function (g) { ops.push({ op: "criar", id: String(novoId()), caixa: self.paraOp(g) }); });
      return { op: "lote", id: String(novoId()), origem: "escada", ops: ops };
    },
    recalcEscada: function (c) {
      var n = this.escada(c.escada && c.escada.par);
      if (!n) { c.avisos = ["escada com parâmetros inválidos"]; return c; }
      Object.keys(n).forEach(function (k) { c[k] = n[k]; });
      exato(c, n._exato || null);   /* P1-acab: a medida sem arredondar (não enumerável: o forEach não leva) */
      return c;
    },

    /* ======================================= P1-B — RESTRIÇÕES POR NÍVEL
     * (o formato da op e a migração estão no cabeçalho, junto de RESTR_TIPO)
     * Põe a peça na altura que os níveis M ({id: elevação}) dão. Completa o
     * que faltar (op v:1, ajuste parcial) A PARTIR DA GEOMETRIA GRAVADA —
     * por isso a op v:1 sai igual. Devolve null (plano do modelo, ou nível
     * que não existe: a peça fica onde nasceu) ou { migrado, aviso }. */
    aplicarRestricoes: function (c, M) {
      var k = c && RESTR_TIPO[c.tipo];
      if (!k || (c.tipo === "escada" && !(c.escada && c.escada.par)) || (c.tipo === "cobertura" && !Array.isArray(c.planos))) return null;
      delete c.alturaEfetiva; delete c.avisoNivel; delete c.v1Migrado;
      var nb = c.nivelBase != null && c.nivelBase !== "" ? String(c.nivelBase) : (c.nivelId != null && c.nivelId !== "" ? String(c.nivelId) : null);
      M = M || {};
      if (nb == null) return null;
      if (!Object.prototype.hasOwnProperty.call(M, nb)) {
        /* sem os níveis da obra (Node, outro módulo) nada a dizer; com eles, o nível sumiu */
        if (Object.keys(M).length) c.avisoNivel = "O nível desta peça não existe mais na obra: ela fica onde estava.";
        return null;
      }
      var migrado = c.v !== 2, cota = cotaAbs(c), H0 = alturaAbs(c), aviso = null;
      c.nivelBase = nb; c.nivelId = nb;
      if (!fin(c.deslocBase)) c.deslocBase = r6(cota - M[nb]);
      var base = M[nb] + c.deslocBase;
      if (k === "nivel") {
        /* laje e viga: o TOPO no nível (+ deslocamento); cobertura: o apoio */
        if (c.tipo === "laje") c.cy = r6(base - num(c.altura, 0) / 2);
        else if (c.tipo === "viga") {
          if (c.perfil) { c.topoViga = r6(base); this.recalcPeca(c); } else c.cy = r6(base - num(c.altura, 0) / 2);
        } else {
          var dy = base - num(c.base, 0);
          if (Math.abs(dy) > 1e-9) {
            c.base = r6(base); c.cumeeira = r6(num(c.cumeeira, 0) + dy);
            c.planos.forEach(function (p) { p.cy = r6(num(p.cy, 0) + dy); });
          }
        }
      } else {
        if (c.restricaoSuperior === undefined || c.restricaoSuperior === "") c.restricaoSuperior = null;
        if (!fin(c.deslocSuperior)) c.deslocSuperior = 0;
        if (!(fin(c.alturaNaoConectada) && c.alturaNaoConectada >= 0.1)) c.alturaNaoConectada = r6(H0);
        var H = c.alturaNaoConectada;
        if (c.restricaoSuperior != null) {
          var ns = String(c.restricaoSuperior);
          if (Object.prototype.hasOwnProperty.call(M, ns)) H = M[ns] + c.deslocSuperior - base;
          else aviso = "O nível superior desta peça não existe mais na obra: vale a altura não conectada.";
        }
        if (!(H >= 0.1 - 1e-9)) {
          aviso = "A restrição superior fica abaixo da base (ou a menos de 10 cm dela): vale a altura não conectada.";
          H = c.alturaNaoConectada >= 0.1 ? c.alturaNaoConectada : H0;
        }
        c.alturaEfetiva = r6(H);
        if (c.tipo === "parede") {
          c.cy = r6(base + H / 2); c.altura = r6(H);
          c.area = r4(num(c.comprimento, 0) * H); c.volume = r4(num(c.comprimento, 0) * H * num(c.espessura, 0));   /* a B2 refaz pelos pedaços no derivar */
          exato(c, { area: num(c.comprimento, 0) * H, volume: num(c.comprimento, 0) * H * num(c.espessura, 0) });
        } else if (c.tipo === "pilar") {
          c.cy = r6(base + H / 2); c.altura = r6(H);
          if (c.perfil) { c.basePilar = r6(base); this.recalcPeca(c); }
          else { c.volume = r4(num(c.comprimento, 0) * num(c.espessura, 0) * H); c.comprimentoPilar = r4(H); exato(c, { volume: num(c.comprimento, 0) * num(c.espessura, 0) * H, comprimentoPilar: H }); }
        } else {
          c.escada.par.base = r6(base); c.escada.par.desnivel = r6(H);
          this.recalcEscada(c);
        }
      }
      if (migrado) c.v1Migrado = true;
      if (aviso) c.avisoNivel = aviso;
      return { migrado: migrado, aviso: aviso };
    },
    /* a peça recém-criada (ou do teste) presa aos níveis: grava os campos v:2
       e já a põe na altura certa. r = { nivelBase, deslocBase,
       restricaoSuperior, deslocSuperior, alturaNaoConectada } (o que faltar
       sai da geometria). */
    restringir: function (c, r, niveis) {
      if (!c || !RESTR_TIPO[c.tipo]) return c;
      gravarRestr(c, normRestr(r || {}, c.tipo));
      this.aplicarRestricoes(c, mapaNiveis(niveis));
      return c;
    },
    /* depois do replay (BimEdit.aplicar), ANTES das hospedadas e do derivar:
       cada peça presa a nível vai para a altura dos níveis de agora */
    resolverNiveis: function (estado, niveis) {
      var M = mapaNiveis(niveis), self = this, res = { n: 0, migrados: 0, avisos: 0 };
      arr(estado && estado.caixas).concat(arr(estado && estado.coberturas)).forEach(function (c) {
        if (!c) return;
        var r = self.aplicarRestricoes(c, M);
        if (r) { res.n++; if (r.migrado) res.migrados++; }
        if (c.avisoNivel) res.avisos++;
      });
      return res;
    },
    /* o nível logo acima de `id` (o "até o nível acima" das ferramentas) */
    nivelAcima: function (niveis, id) {
      var L = arr(niveis).filter(function (n) { return n && n.id != null && fin(Number(n.elevacao)); }).slice().sort(function (a, b) { return Number(a.elevacao) - Number(b.elevacao); });
      for (var i = 0; i < L.length; i++) if (String(L[i].id) === String(id)) return L[i + 1] || null;
      return null;
    },
    /* id:elevação de todos os níveis — o visor refaz o modelo quando muda */
    assinaturaNiveis: function (niveis) {
      var M = mapaNiveis(niveis);
      return Object.keys(M).sort().map(function (k) { return k + "=" + M[k]; }).join("|");
    },
    normRestr: normRestr,

    /* ======================================================= OPERAÇÕES */
    /* o que vai para a lista de operações: só a FONTE (o resto se deriva).
       Sem lista dentro de lista — a nuvem recusa. */
    paraOp: function (c) {
      var o = clone(c);
      delete o.uniao; delete o.topo; delete o.juntas; delete o.faces; delete o.medidasCamadas; delete o.recuoIni; delete o.recuoFim;
      delete o.alturaEfetiva; delete o.avisoNivel; delete o.v1Migrado;   /* P1-B: derivados do replay */
      /* P4: o que vem de OUTRA op (unir geometria, fixar, pintar) e o que se deriva dela */
      delete o.geoUnioes; delete o.uniaoGeo; delete o.cortesFace; delete o.fixo; delete o.pinturas; delete o.divFaces; delete o.pinturasCalc; delete o.avisosUniao;
      if (o.escada) o.escada = { par: o.escada.par };
      if (o.rampa) o.rampa = { par: o.rampa.par };   /* P9 — GANCHO */
      delete o.marcaLocal;
      if (o.guarda) { var gh = o.guarda.host; o.guarda = { par: o.guarda.par, pts: o.guarda.pts }; if (gh) o.guarda.host = gh; }
      return o;
    },
    /* a op `ajustar` — só campos conhecidos, cada um com a sua regra */
    CAMPOS_AJUSTE: ["anexarTopo", "unir", "inverterFaces", "juntaCanto", "tipoParede", "tipoLaje", "perfil", "material", "escada", "guarda", "restricoes", "linhaLoc", "virar", "uniao", "estrut", "rampa"],   /* P4: linhaLoc, virar, uniao; P9: estrut, rampa */
    ajustar: function (c, campos) {
      if (!c || !campos || typeof campos !== "object") return false;
      var mudou = false;
      /* P1-B: restrições por nível — a peça passa a ser v:2 (o resto se
         completa da geometria no replay, em BimArq.aplicarRestricoes) */
      if (campos.restricoes && RESTR_TIPO[c.tipo]) {
        var rn = normRestr(campos.restricoes, c.tipo);
        if (Object.keys(rn).length) { gravarRestr(c, rn); mudou = true; }
      }
      ["anexarTopo", "unir", "inverterFaces"].forEach(function (k) { if (campos[k] != null && c.tipo === "parede") { c[k] = !!campos[k]; mudou = true; } });
      if (campos.juntaCanto != null && c.tipo === "parede") {
        if (campos.juntaCanto === "esquadria") c.juntaCanto = "esquadria"; else delete c.juntaCanto;
        mudou = true;
      }
      if (campos.tipoParede && c.tipo === "parede" && num(campos.tipoParede.espessura, 0) > 0) {
        /* P4: com a linha de localização fora do eixo, ela fica no lugar e a parede cresce para o outro lado */
        var llT = linhaLocDe(c.linhaLoc), wAntes = llT ? wLinhaLoc(c, llT) : 0;
        c.tipoParede = clone(campos.tipoParede); c.espessura = r4(campos.tipoParede.espessura); mudou = true;
        if (llT) deslocarPorLinha(c, wLinhaLoc(c, llT) - wAntes);
      }
      /* P4 — linha de localização: muda a REFERÊNCIA, a parede não anda */
      if (campos.linhaLoc !== undefined && c.tipo === "parede") {
        var ll2 = campos.linhaLoc === null || campos.linhaLoc === "" ? 0 : linhaLocDe(campos.linhaLoc);
        if (ll2 != null) { if (ll2) c.linhaLoc = ll2; else delete c.linhaLoc; mudou = true; }
      }
      /* P4 — virar camadas nas extremidades e nas inserções */
      if (campos.virar && typeof campos.virar === "object" && c.tipo === "parede") {
        var vr = c.virar ? clone(c.virar) : {}, ve = normVirar(campos.virar.ext, VIRAR_EXT), vi = normVirar(campos.virar.ins, VIRAR_INS);
        if (campos.virar.ext !== undefined && ve !== undefined) { if (ve) vr.ext = ve; else delete vr.ext; mudou = true; }
        if (campos.virar.ins !== undefined && vi !== undefined) { if (vi) vr.ins = vi; else delete vr.ins; mudou = true; }
        if (Object.keys(vr).length) c.virar = vr; else delete c.virar;
      }
      /* P4 — o canto com OUTRA parede: modo (topo / esquadria / quadrado) e
         "Alternar ordem de união" (quem passa). Fica gravado na parede (a
         outra também é lida — BimArq.uniaoPar) */
      if (campos.uniao && typeof campos.uniao === "object" && c.tipo === "parede" && campos.uniao.com != null && String(campos.uniao.com) !== String(c.id)) {
        var un = c.unioes ? clone(c.unioes) : {}, kc = String(campos.uniao.com), e0 = un[kc] || {};
        if (campos.uniao.modo !== undefined) { if (campos.uniao.modo === "topo" || campos.uniao.modo === "esquadria" || campos.uniao.modo === "quadrado") e0.modo = campos.uniao.modo; else if (campos.uniao.modo === null) delete e0.modo; }
        if (campos.uniao.inverter !== undefined) { if (campos.uniao.inverter) e0.inverter = true; else delete e0.inverter; }
        if (Object.keys(e0).length) un[kc] = e0; else delete un[kc];
        if (Object.keys(un).length) c.unioes = un; else delete c.unioes;
        mudou = true;
      }
      if (campos.tipoLaje && c.tipo === "laje" && num(campos.tipoLaje.espessura, 0) >= 0.03) {
        var topo = num(c.cy, 0) + num(c.altura, 0) / 2, e = r4(num(campos.tipoLaje.espessura, 0));
        c.tipoLaje = { id: String(campos.tipoLaje.id || ""), rotulo: String(campos.tipoLaje.rotulo || "") };
        c.altura = e; c.cy = r4(topo - e / 2); mudou = true;
      }
      if (campos.perfil && (c.tipo === "pilar" || c.tipo === "viga") && secao(campos.perfil).ok) { c.perfil = clone(campos.perfil); mudou = true; }
      if (campos.material && (c.tipo === "pilar" || c.tipo === "viga") && MATERIAIS[campos.material]) { c.material = campos.material; mudou = true; }
      if (campos.escada && c.tipo === "escada" && c.escada && c.escada.par) {
        Object.keys(campos.escada).forEach(function (k) { if (k !== "x" && k !== "z") c.escada.par[k] = campos.escada[k]; }); mudou = true;
      }
      if (campos.guarda && c.tipo === "guarda" && c.guarda && c.guarda.par) {
        ["altura", "espac"].forEach(function (k) { if (fin(Number(campos.guarda[k]))) c.guarda.par[k] = Number(campos.guarda[k]); }); mudou = true;
        /* P9 — GANCHO: corrimãos 1 e 2 e o deslocamento a partir do caminho (vazio apaga) */
        CAMPOS_CORRIMAO.concat(["deslocCaminho"]).forEach(function (k) {
          if (campos.guarda[k] === undefined) return;
          if (campos.guarda[k] === null || campos.guarda[k] === "") delete c.guarda.par[k];
          else if (fin(Number(campos.guarda[k]))) c.guarda.par[k] = Number(campos.guarda[k]);
        });
      }
      /* P9 — GANCHO: viga/pilar (justificação, inclinação, extensões, estilo de coluna) e rampa */
      var p9a = P9();
      if (p9a && campos.estrut && (c.tipo === "viga" || c.tipo === "pilar")) mudou = p9a.ajustar(c, campos.estrut) || mudou;
      if (p9a && campos.rampa && c.tipo === "rampa") mudou = p9a.ajustarRampa(c, campos.rampa) || mudou;
      return mudou;
    },
    /* mover: a caixa já andou (cx, cz); os pontos-fonte andam junto */
    transladar: function (c, dx, dz) {
      if (!c || !(fin(dx) && fin(dz))) return c;
      if (c.arco && c.arco.m) { c.arco.m.x = r6(num(c.arco.m.x, 0) + dx); c.arco.m.z = r6(num(c.arco.m.z, 0) + dz); }   /* CURVA: o meio do arco anda junto */
      arr(c.contorno).forEach(function (p) { p.x = r6(p.x + dx); p.z = r6(p.z + dz); });
      arr(c.contorno).forEach(function (p) { if (p.m) { p.m.x = r6(num(p.m.x, 0) + dx); p.m.z = r6(num(p.m.z, 0) + dz); } });   /* CURVA: o meio da aresta em arco */
      arr(c.furos).forEach(function (f) { arr(f && f.pts).forEach(function (p) { p.x = r6(p.x + dx); p.z = r6(p.z + dz); }); });
      if (c.escada && c.escada.par) { c.escada.par.x = r6(num(c.escada.par.x, 0) + dx); c.escada.par.z = r6(num(c.escada.par.z, 0) + dz); }
      if (c.guarda) arr(c.guarda.pts).forEach(function (p) { p.x = r6(p.x + dx); p.z = r6(p.z + dz); });
      if (c.guarda) arr(c.guarda.pts).forEach(function (p) { if (p.m) { p.m.x = r6(num(p.m.x, 0) + dx); p.m.z = r6(num(p.m.z, 0) + dz); } });   /* CURVA: o meio do arco do caminho */
      if (c.rampa && c.rampa.par) { c.rampa.par.x = r6(num(c.rampa.par.x, 0) + dx); c.rampa.par.z = r6(num(c.rampa.par.z, 0) + dz); }   /* P9 */
      return c;
    },

    /* ============================================== UNIÃO DE PAREDES
     * paredes = caixas (só as que unem). Devolve { id: { ini, fim, cruz,
     * abut, juntas } }:
     *   ini/fim — a reta do corte da ponta, no local: u = c0 + c1·w
     *   cruz    — o vão da parede SECUNDÁRIA num X ({a, b} retas)
     *   abut    — o trecho da face coberto pela parede que encosta (T/X):
     *             não leva revestimento
     *   faceIni/faceFim — onde as FACES terminam (o canto de fora e o de
     *             dentro, como na meia-esquadria): no L em topo a face de
     *             fora da que para continua na ponta da que passou — é a
     *             mesma superfície de reboco. Fica igual nos dois modos.
     * L em TOPO (padrão, união pela linha de centro): a
     * parede que vem ANTES na lista (criada antes) passa e vai até a face de
     * fora da outra; a de depois para na face da primeira. Na sala fechada
     * cada canto vai para a que chega primeiro e a última fecha o anel (a
     * 4ª perde nas duas pontas) — referência medida: 2,163 / 1,68 / 2,10 / 1,617 m³.
     * L em MEIA-ESQUADRIA (opção: juntaCanto "esquadria" numa das duas, ou
     * o.juntaCanto): pelos encontros das faces (espessuras diferentes e
     * qualquer ângulo). T: a que chega para na face da outra. X: a primeira
     * criada passa inteira, a segunda ganha o vão. */
    juntas: function (paredes, o) {
      /* CURVA: com parede curva, as retas entre si ficam aqui e os pares com curva no js/bimcurva.js */
      if (!(o && o._semCurva) && Curva() && arr(paredes).some(function (c) { return c && c.arco; })) return Curva().juntas(this, paredes, o);
      var TOL = 0.03, W = [], out = {}, padrao = (o && o.juntaCanto) === "esquadria" ? "esquadria" : "topo";
      arr(paredes).forEach(function (c) {
        var f = frameDe(c);
        if (!(f.L > 0.01 && f.t > 0)) return;
        W.push({ c: c, f: f, d: [f.co, -f.si], E: [aMundo(f, -f.L / 2, 0), aMundo(f, f.L / 2, 0)], usado: [false, false] });
        out[c.id] = { ini: null, fim: null, faceIni: null, faceFim: null, cruz: [], abut: [], juntas: [] };
      });
      function sobrepoe(a, b) { return Math.min(a.f.y1, b.f.y1) - Math.max(a.f.y0, b.f.y0) > 0.05; }
      function rn(v) { return [-v[1], v[0]]; }
      function setPonta(A, ponta, l) { if (ponta === 0) out[A.c.id].ini = l; else out[A.c.id].fim = l; }
      function setFace(A, ponta, l) { if (ponta === 0) out[A.c.id].faceIni = l; else out[A.c.id].faceFim = l; }
      /* a reta paralela ao eixo de J pela face do lado `lado` (vetor no plano).
         P4: a face sai do EIXO DE J (o meio da espessura), não do ponto de
         encontro — com a linha de localização numa face, as pontas desenhadas
         se encontram fora do eixo (no eixo, dá a mesma reta de antes) */
      function retaFace(I, J, P, dJ, lado) {
        var nJ = rn(dJ); if (nJ[0] * lado[0] + nJ[1] * lado[1] < 0) nJ = [-nJ[0], -nJ[1]];
        var C = (I.c.linhaLoc || J.c.linhaLoc) ? aMundo(J.f, 0, 0) : P, Q = [C[0] + nJ[0] * J.f.t / 2, C[1] + nJ[1] * J.f.t / 2];   /* sem linha de localização: a conta de sempre, número a número */
        return retaLocal(I.f, Q, [Q[0] + dJ[0], Q[1] + dJ[1]]);
      }
      /* P4 — a configuração do canto entre A e B (modo e "alternar ordem de
         união"), gravada na parede dona do par (o id menor) ou na outra */
      function cfgPar(A, B) { return BimArq.uniaoPar(A.c, B.c); }
      /* P4 — "Desunir geometria" entre as duas paredes: o canto não se faz */
      function desunidas(A, B) { return BimArq.geoUniao(A.c, B.c).unida === false; }
      /* P4 — as pontas se encontram? Pelo eixo (o de sempre) ou, com a linha
         de localização fora do eixo em alguma das duas, pela SEÇÃO da ponta
         (o segmento de uma face à outra) */
      function secaoPonta(A, k) { var u = k === 0 ? -A.f.L / 2 : A.f.L / 2; return [aMundo(A.f, u, -A.f.t / 2), aMundo(A.f, u, A.f.t / 2)]; }
      function distSegs(p, q, r, s) { if (cruzam(p, q, r, s)) return 0; return Math.min(distSeg(p, r, s), distSeg(q, r, s), distSeg(r, p, q), distSeg(s, p, q)); }
      function encostam(A, a, B, b) {
        var PA = A.E[a], PB = B.E[b];
        if (Math.sqrt((PA[0] - PB[0]) * (PA[0] - PB[0]) + (PA[1] - PB[1]) * (PA[1] - PB[1])) <= TOL) return true;
        if (!A.c.linhaLoc && !B.c.linhaLoc) return false;
        var sa = secaoPonta(A, a), sb = secaoPonta(B, b);
        return distSegs(sa[0], sa[1], sb[0], sb[1]) <= TOL;
      }
      /* P4 — "Esquadrar" (Square off): a ponta da parede que PASSA sai a 90° do
         eixo e vai até cobrir o canto. A que para fica como no topo (cortada
         pela face da que passa) — é o que a referência medida mostra (coleta de 09/10/2026,
         L a 60°: Mq0 2,5746 e Mq1 1,6436 = o volume dela no topo). Esquadrar as
         duas deixava um vão triangular no canto. */
      function esquadro(A, ponta, l, passa) {
        var u1 = uEm(l, -A.f.t / 2), u2 = uEm(l, A.f.t / 2);
        return { c0: (ponta === 1) === !!passa ? Math.max(u1, u2) : Math.min(u1, u2), c1: 0 };
      }
      /* o corte deixa a parede com comprimento nas duas faces? */
      function pontaValida(A, ponta, l) {
        var outra = ponta === 0 ? (out[A.c.id].fim || { c0: A.f.L / 2, c1: 0 }) : (out[A.c.id].ini || { c0: -A.f.L / 2, c1: 0 });
        return [-A.f.t / 2, A.f.t / 2].every(function (w) { return ponta === 0 ? uEm(l, w) < uEm(outra, w) - 0.01 : uEm(l, w) > uEm(outra, w) + 0.01; });
      }
      function junta(A, B, tipo, modo, inv) {
        var ja = { tipo: tipo, com: B.c.id }, jb = { tipo: tipo, com: A.c.id };
        if (modo) { ja.modo = jb.modo = modo; if (modo === "topo" || modo === "quadrado") { ja.passa = !inv; jb.passa = !!inv; } }
        if (inv) ja.alternada = jb.alternada = true;   /* P4: "Alternar ordem de união" */
        out[A.c.id].juntas.push(ja); out[B.c.id].juntas.push(jb);
      }
      /* trecho da face `s` de I coberto por J (as faces laterais de J cortando a face de I) */
      function abut(I, J, s) {
        var F1 = aMundo(I.f, 0, s * I.f.t / 2);
        var g1 = interRetas(aMundo(J.f, 0, -J.f.t / 2), J.d, F1, I.d), g2 = interRetas(aMundo(J.f, 0, J.f.t / 2), J.d, F1, I.d);
        if (!g1 || !g2) return;
        var u1 = aLocal(I.f, g1[0], g1[1])[0], u2 = aLocal(I.f, g2[0], g2[1])[0];
        var a = Math.max(-I.f.L / 2, Math.min(u1, u2)), b = Math.min(I.f.L / 2, Math.max(u1, u2));
        if (b - a > 1e-6) out[I.c.id].abut.push({ lado: s, u0: r6(a), u1: r6(b), com: J.c.id, topo: J.f.y1, base: J.f.y0 });
      }
      var i, j, a, b;
      /* ---- L (pontas que se encontram) ---- */
      for (i = 0; i < W.length; i++) for (j = i + 1; j < W.length; j++) {
        var A = W[i], B = W[j]; if (!sobrepoe(A, B) || desunidas(A, B)) continue;
        for (a = 0; a < 2; a++) for (b = 0; b < 2; b++) {
          if (A.usado[a] || B.usado[b]) continue;
          var PA = A.E[a], PB = B.E[b];
          if (!encostam(A, a, B, b)) continue;
          var di = a === 1 ? A.d : [-A.d[0], -A.d[1]], ej = b === 0 ? B.d : [-B.d[0], -B.d[1]];
          var cr = di[0] * ej[1] - di[1] * ej[0], dt = di[0] * ej[0] + di[1] * ej[1];
          if (Math.abs(cr) < 0.02) { if (dt > 0) { A.usado[a] = B.usado[b] = true; junta(A, B, "I"); } continue; }
          /* as faces vêm de cada parede (P4: com a linha de localização numa face as
             pontas desenhadas não são o eixo; no eixo é a mesma conta de sempre).
             sA/sB: o lado (+w) de cada uma que fica à esquerda de di/ej (rn) */
          var P = [(PA[0] + PB[0]) / 2, (PA[1] + PB[1]) / 2], ni = rn(di), nj = rn(ej), Qr, Ql;
          if (A.c.linhaLoc || B.c.linhaLoc) {
            var sA = a === 1 ? 1 : -1, sB = b === 0 ? 1 : -1;
            Qr = interRetas(aMundo(A.f, 0, sA * A.f.t / 2), di, aMundo(B.f, 0, sB * B.f.t / 2), ej);
            Ql = interRetas(aMundo(A.f, 0, -sA * A.f.t / 2), di, aMundo(B.f, 0, -sB * B.f.t / 2), ej);
          } else {   /* pelo eixo: a conta de sempre (o mesmo número, até a última casa — IFC das obras de antes) */
            Qr = interRetas([P[0] + ni[0] * A.f.t / 2, P[1] + ni[1] * A.f.t / 2], di, [P[0] + nj[0] * B.f.t / 2, P[1] + nj[1] * B.f.t / 2], ej);
            Ql = interRetas([P[0] - ni[0] * A.f.t / 2, P[1] - ni[1] * A.f.t / 2], di, [P[0] - nj[0] * B.f.t / 2, P[1] - nj[1] * B.f.t / 2], ej);
          }
          if (!Qr || !Ql) continue;
          var la = retaLocal(A.f, Ql, Qr), lb = retaLocal(B.f, Ql, Qr);
          /* ângulo muito fechado (< ~10°): a ponta da meia-esquadria iria longe */
          if (!la || !lb || Math.abs(la.c1) > 6 || Math.abs(lb.c1) > 6) continue;
          if (!pontaValida(A, a, la) || !pontaValida(B, b, lb)) continue;
          var modo = (A.c.juntaCanto === "esquadria" || B.c.juntaCanto === "esquadria") ? "esquadria" : padrao;
          /* P4: o modo gravado NO CANTO (Juntas de parede) vale mais que o da parede */
          var cfg = cfgPar(A, B), inv = !!cfg.inverter;
          if (cfg.modo) modo = cfg.modo;
          var ca = la, cb = lb;
          if (modo === "topo" || modo === "quadrado") {
            /* A (a de antes) vai até a face de B do lado para onde A segue (di);
               B para na face de A do lado para onde B segue (ej) */
            ca = retaFace(A, B, P, ej, di); cb = retaFace(B, A, P, di, ej);
            /* P4 — ALTERNAR ORDEM DE UNIÃO: B passa (até a face de A do lado de onde B vem) e A para */
            if (inv) { ca = retaFace(A, B, P, ej, [-di[0], -di[1]]); cb = retaFace(B, A, P, di, [-ej[0], -ej[1]]); }
            if (modo === "quadrado" && ca && cb) { if (inv) cb = esquadro(B, b, cb, true); else ca = esquadro(A, a, ca, true); }
            if (!ca || !cb || Math.abs(ca.c1) > 6 || Math.abs(cb.c1) > 6 || !pontaValida(A, a, ca) || !pontaValida(B, b, cb)) { ca = la; cb = lb; modo = "esquadria"; inv = false; }
          } else inv = false;
          setPonta(A, a, ca); setPonta(B, b, cb); setFace(A, a, la); setFace(B, b, lb); A.usado[a] = B.usado[b] = true;
          junta(A, B, "L", modo, inv);
        }
      }
      /* ---- T (a ponta morre dentro da outra parede) ---- */
      for (j = 0; j < W.length; j++) for (b = 0; b < 2; b++) {
        var J = W[j]; if (J.usado[b]) continue;
        var Ep = J.E[b];
        for (i = 0; i < W.length; i++) {
          if (i === j) continue;
          var I = W[i]; if (!sobrepoe(I, J) || desunidas(I, J)) continue;
          if (Math.abs(I.d[0] * J.d[1] - I.d[1] * J.d[0]) < 0.2) continue;   /* quase paralelas: não é T */
          var lc = aLocal(I.f, Ep[0], Ep[1]);
          if (Math.abs(lc[1]) > I.f.t / 2 + TOL || lc[0] < -I.f.L / 2 - TOL || lc[0] > I.f.L / 2 + TOL) continue;
          var outro = J.E[1 - b], lo = aLocal(I.f, outro[0], outro[1]);
          if (Math.abs(lo[1]) <= I.f.t / 2) continue;                         /* a outra ponta não sai de I */
          var s = lo[1] > 0 ? 1 : -1;
          var lin = retaLocal(J.f, aMundo(I.f, -I.f.L / 2, s * I.f.t / 2), aMundo(I.f, I.f.L / 2, s * I.f.t / 2));
          if (!lin || !pontaValida(J, b, lin)) continue;
          setPonta(J, b, lin); J.usado[b] = true;
          abut(I, J, s);
          junta(I, J, "T");
          break;
        }
      }
      /* ---- X (os eixos se cruzam no miolo das duas) ---- */
      for (i = 0; i < W.length; i++) for (j = i + 1; j < W.length; j++) {
        var P1 = W[i], S2 = W[j]; if (!sobrepoe(P1, S2) || desunidas(P1, S2)) continue;
        if (Math.abs(P1.d[0] * S2.d[1] - P1.d[1] * S2.d[0]) < 0.2) continue;
        var ja = out[P1.c.id].juntas.some(function (x) { return x.com === S2.c.id; });
        if (ja) continue;
        /* P4 — ALTERNAR ORDEM DE UNIÃO no X: a de depois passa inteira e a de antes ganha o vão */
        if (cfgPar(P1, S2).inverter) { var tX = P1; P1 = S2; S2 = tX; }
        var X = interRetas(P1.E[0], P1.d, S2.E[0], S2.d); if (!X) continue;
        var ua = aLocal(P1.f, X[0], X[1])[0], ub = aLocal(S2.f, X[0], X[1])[0];
        if (Math.abs(ua) > P1.f.L / 2 - S2.f.t / 2 - TOL || Math.abs(ub) > S2.f.L / 2 - P1.f.t / 2 - TOL) continue;
        var l1 = retaLocal(S2.f, aMundo(P1.f, -P1.f.L / 2, -P1.f.t / 2), aMundo(P1.f, P1.f.L / 2, -P1.f.t / 2));
        var l2 = retaLocal(S2.f, aMundo(P1.f, -P1.f.L / 2, P1.f.t / 2), aMundo(P1.f, P1.f.L / 2, P1.f.t / 2));
        if (!l1 || !l2) continue;
        if (l1.c0 > l2.c0) { var tmp = l1; l1 = l2; l2 = tmp; }
        out[S2.c.id].cruz.push({ a: l1, b: l2, com: P1.c.id });
        abut(P1, S2, 1); abut(P1, S2, -1);
        junta(P1, S2, "X", null, !!cfgPar(P1, S2).inverter);
      }
      /* P4: as pontas LIVRES (sem L, I nem T) — é nelas que as camadas viram (WRAPPING_AT_ENDS) */
      W.forEach(function (A) { out[A.c.id].livre = [!A.usado[0], !A.usado[1]]; });
      return out;
    },

    /* ============================================== TOPO DA PAREDE
     * A superfície de cima: o fundo da laje ou da cobertura que passa por cima
     * (y > base + 10 cm). Sem "anexar topo": a parede para nela se ela
     * estiver mais baixa que o topo da parede (não fura a laje). Com "anexar
     * topo": a parede vai até ela, para cima ou para baixo (empena sob o
     * telhado). Devolve trechos lineares ao longo do eixo: [{ u0, u1, a, b }]
     * com y = a + b·u. */
    superficies: function (estado, excluirId) {
      var out = [];
      arr(estado && estado.caixas).forEach(function (c) {
        if (!c || c.tipo !== "laje" || c.id === excluirId) return;
        var y = num(c.cy, 0) - num(c.altura, 0) / 2;
        if (c.contorno) {
          /* CURVA: a laje com aresta em arco cobre pelo arco (cordas de 1 mm), não pela corda */
          var C = Curva() && Curva().temArco(c.contorno) ? Curva().pontosContorno(c.contorno, 0.001) : limparPontos(c.contorno), Fs = arr(c.furos).map(function (f) { return limparPontos(f.pts); }), bordas = [];
          [C].concat(Fs).forEach(function (P) { P.forEach(function (q, k) { bordas.push([q, P[(k + 1) % P.length]]); }); });
          /* tol: a parede que corre JUNTO da borda (eixo na borda, ou meia espessura
             para fora) está debaixo da laje — é o caso de toda laje desenhada pelos
             cantos das paredes */
          var perto = function (x, z, P, tol) { return P.some(function (q, k) { return distSeg([x, z], q, P[(k + 1) % P.length]) <= tol + 1e-7; }); };
          out.push({ id: c.id, bordas: bordas, dobras: [], cobre: function (x, z, tol) { tol = tol || 0; return (dentro([x, z], C) || perto(x, z, C, tol)) && !Fs.some(function (F) { return dentro([x, z], F) && !perto(x, z, F, tol); }); }, y: function () { return y; } });
        } else {
          var f = { cx: num(c.cx, 0), cz: num(c.cz, 0), co: Math.cos(num(c.rotY, 0)), si: Math.sin(num(c.rotY, 0)) };
          var hx = num(c.comprimento, 0) / 2, hz = num(c.espessura, 0) / 2;
          var K = [aMundo(f, -hx, -hz), aMundo(f, hx, -hz), aMundo(f, hx, hz), aMundo(f, -hx, hz)];
          out.push({ id: c.id, bordas: K.map(function (q, k) { return [q, K[(k + 1) % 4]]; }), dobras: [],
                     cobre: function (x, z, tol) { var l = aLocal(f, x, z); tol = tol || 0; return Math.abs(l[0]) <= hx + tol + 1e-7 && Math.abs(l[1]) <= hz + tol + 1e-7; }, y: function () { return y; } });
        }
      });
      arr(estado && estado.coberturas).forEach(function (cb) {
        if (!cb) return;
        var b = num(cb.beiral, 0), x0 = num(cb.x0, 0) - b, x1 = num(cb.x1, 0) + b, z0 = num(cb.z0, 0) - b, z1 = num(cb.z1, 0) + b;
        var i = num(cb.inclinacao, 0) / 100, dl = num(cb.espessura, 0) / 2 * Math.sqrt(1 + i * i), base = num(cb.base, 0), cum = num(cb.cumeeira, 0);
        var eixoX = cb.eixo !== "z", xm = (num(cb.x0, 0) + num(cb.x1, 0)) / 2, zm = (num(cb.z0, 0) + num(cb.z1, 0)) / 2;
        var Wd = eixoX ? num(cb.z1, 0) - num(cb.z0, 0) : num(cb.x1, 0) - num(cb.x0, 0);
        var K = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], fn, dobras = [];
        if (cb.aguas === 1) fn = function (x, z) { return base + (Wd / 2) * i - (eixoX ? z - zm : x - xm) * i - dl; };
        else {
          fn = function (x, z) { return cum - i * Math.abs(eixoX ? z - zm : x - xm) - dl; };
          dobras.push(eixoX ? [[x0, zm], [1, 0]] : [[xm, z0], [0, 1]]);
        }
        out.push({ id: cb.id, bordas: K.map(function (q, k) { return [q, K[(k + 1) % 4]]; }), dobras: dobras,
                   cobre: function (x, z, tol) { tol = (tol || 0) + 1e-7; return x >= x0 - tol && x <= x1 + tol && z >= z0 - tol && z <= z1 + tol; }, y: fn });
      });
      /* P3 (js/bimtelhado.js): o TELHADO por perímetro/extrusão — cada água é
         um plano limitado pelo polígono dela (a face de baixo do telhado) */
      var BT3 = global.BimTelhado || null;
      if (BT3 && BT3.superficies) arr(estado && estado.telhados).forEach(function (t) { BT3.superficies(t).forEach(function (s) { out.push(s); }); });
      return out;
    },
    topoParede: function (c, sups) {
      if (c.arco && Curva()) return Curva().topo(c, sups);   /* CURVA: trechos do arco */
      var f = frameDe(c), base = f.y0, proprio = f.y1, anexar = !!c.anexarTopo;
      var U0 = -f.L / 2 - 2 * f.t - 0.5, U1 = f.L / 2 + 2 * f.t + 0.5, C = [f.cx, f.cz], d = [f.co, -f.si];
      function P(u) { return [C[0] + u * d[0], C[1] + u * d[1]]; }
      var bps = [U0, U1];
      arr(sups).forEach(function (s) {
        s.bordas.forEach(function (sg) { var u = cortaSegmento(C, d, sg[0], sg[1]); if (u != null && u > U0 && u < U1) bps.push(u); });
        s.dobras.forEach(function (ln) { var X = interRetas(C, d, ln[0], ln[1]); if (X) { var u = (X[0] - C[0]) * d[0] + (X[1] - C[1]) * d[1]; if (u > U0 && u < U1) bps.push(u); } });
      });
      function unicos(l) { l.sort(function (x, y) { return x - y; }); return l.filter(function (v, k) { return k === 0 || v - l[k - 1] > 1e-7; }); }
      bps = unicos(bps);
      /* as funções lineares candidatas no meio de um trecho (largura w) */
      function funcoes(m, w) {
        var p = P(m), lst = [], h = Math.min(1e-3, w / 4);
        arr(sups).forEach(function (s) {
          if (!s.cobre(p[0], p[1], f.t / 2)) return;
          var y = s.y(p[0], p[1]); if (!(y > base + 0.1)) return;
          var pa = P(m - h), pb = P(m + h), bb = (s.y(pb[0], pb[1]) - s.y(pa[0], pa[1])) / (2 * h);
          lst.push({ a: y - bb * m, b: bb });
        });
        return lst;
      }
      /* onde duas candidatas se cruzam no meio do trecho, o mínimo troca de dona */
      var mais = bps.slice();
      for (var k = 0; k + 1 < bps.length; k++) {
        var p0 = bps[k], p1 = bps[k + 1], F = funcoes((p0 + p1) / 2, p1 - p0);
        if (!anexar) F.push({ a: proprio, b: 0 });
        for (var x = 0; x < F.length; x++) for (var y2 = x + 1; y2 < F.length; y2++) {
          var db = F[x].b - F[y2].b; if (Math.abs(db) < 1e-12) continue;
          var uc = (F[y2].a - F[x].a) / db; if (uc > p0 + 1e-7 && uc < p1 - 1e-7) mais.push(uc);
        }
      }
      bps = unicos(mais);
      var segs = [];
      for (var q = 0; q + 1 < bps.length; q++) {
        var u0 = bps[q], u1 = bps[q + 1], m = (u0 + u1) / 2, G = funcoes(m, u1 - u0), g;
        if (!anexar) G.push({ a: proprio, b: 0 });
        if (!G.length) g = { a: proprio, b: 0 };
        else g = G.reduce(function (best, fz) { return (fz.a + fz.b * m < best.a + best.b * m) ? fz : best; });
        var ult = segs[segs.length - 1];
        if (ult && Math.abs(ult.a - g.a) < 1e-9 && Math.abs(ult.b - g.b) < 1e-9) ult.u1 = u1;
        else segs.push({ u0: u0, u1: u1, a: g.a, b: g.b });
      }
      return segs;
    },

    /* ============================================ PEDAÇOS DA PAREDE
     * Os prismas que o 3D desenha e que o quantitativo soma. Fatias ao longo
     * do eixo entre as retas de corte (pontas, vão do X, bordas dos vãos de
     * porta/janela, quebras do topo); cada fatia é um quadrilátero na planta
     * com o topo LINEAR — volume exato = área × altura no centroide.
     * vaos = os vãos ACEITOS do BimEdit.vaosNaParede (x0..x1 local, y0..y1
     * a partir da base). Devolve { pecas:[{pts:[[x,z]×4], y0, ytopo:[4]}],
     * volume, faces:{fora, dentro}, comprimento (eixo líquido) }. */
    pecasParede: function (c, vaos) {
      if (Curva() && Curva().ehCurva(c)) return Curva().pecas(c, vaos);   /* CURVA: arco ou ponta em arco */
      var f = frameDe(c), t = f.t, L = f.L, un = c.uniao || {};
      var S = un.ini || { c0: -L / 2, c1: 0 }, E = un.fim || { c0: L / 2, c1: 0 };
      var cruz = arr(un.cruz), topo = arr(c.topo).length ? c.topo : [{ u0: -1e9, u1: 1e9, a: f.y1, b: 0 }];
      var vz = arr(vaos).map(function (v) { return { x0: num(v.x0, 0), x1: num(v.x1, 0), y0: num(v.y0, 0), y1: num(v.y1, 0) }; });
      var linhas = [];
      cruz.forEach(function (g) { linhas.push(g.a, g.b); });
      vz.forEach(function (v) { linhas.push({ c0: v.x0, c1: 0 }, { c0: v.x1, c1: 0 }); });
      /* quebra do topo a menos de 5 mm da ponta não vira fatia (lasca de 2 mm com a altura de antes) */
      topo.forEach(function (sg) { if (sg.u0 > -1e8 && sg.u0 > S.c0 + 0.005 && sg.u0 < E.c0 - 0.005) linhas.push({ c0: sg.u0, c1: 0 }); });
      linhas = linhas.filter(function (l) { return l.c0 > S.c0 + 1e-6 && l.c0 < E.c0 - 1e-6; });
      linhas.sort(function (p, q) { return p.c0 - q.c0; });
      linhas = [S].concat(linhas).concat([E]);
      function segEm(m) { for (var k = 0; k < topo.length; k++) if (m >= topo[k].u0 - 1e-9 && m <= topo[k].u1 + 1e-9) return topo[k]; return topo[m < topo[0].u0 ? 0 : topo.length - 1]; }
      var pecas = [], vol = 0, fm = 0, fp = 0, comp = 0, ws = [-t / 2, -t / 2, t / 2, t / 2];
      for (var i = 0; i + 1 < linhas.length; i++) {
        var A = linhas[i], B = linhas[i + 1], m = (A.c0 + B.c0) / 2;
        if (B.c0 - A.c0 < 1e-7) continue;
        if (cruz.some(function (g) { return m > g.a.c0 && m < g.b.c0; })) continue;
        comp += B.c0 - A.c0;
        var sg = segEm(m), v = vz.filter(function (x) { return m > x.x0 && m < x.x1; })[0];
        var us = [uEm(A, -t / 2), uEm(B, -t / 2), uEm(B, t / 2), uEm(A, t / 2)];
        if (us[1] < us[0]) us[1] = us[0];
        if (us[2] < us[3]) us[2] = us[3];
        var q = us.map(function (u, k) { return [u, ws[k]]; }), Aq = Math.abs(areaSinal(q));
        if (Aq < 1e-12) continue;
        var cen = centroide(q), pts = us.map(function (u, k) { return aMundo(f, u, ws[k]); });
        /* as FACES terminam nos cantos de fora e de dentro (faceIni/faceFim):
           no L em topo, o trecho de face na ponta da parede que passou é a
           continuação da face da outra — quem mede é a outra (é a mesma
           superfície de reboco). Sem a linha de face, a do corte. */
        var FA = (A === S && un.faceIni) ? un.faceIni : A, FB = (B === E && un.faceFim) ? un.faceFim : B;
        var uf = [uEm(FA, -t / 2), uEm(FB, -t / 2), uEm(FB, t / 2), uEm(FA, t / 2)];
        if (uf[1] < uf[0]) uf[1] = uf[0];
        if (uf[2] < uf[3]) uf[2] = uf[3];
        var faixas = v ? [[f.y0, f.y0 + v.y0], [f.y0 + v.y1, null]] : [[f.y0, null]];
        faixas.forEach(function (fx) {
          var yb = fx[0];
          var yt = us.map(function (u) { return fx[1] == null ? Math.max(yb, sg.a + sg.b * u) : fx[1]; });
          var ytf = uf.map(function (u) { return fx[1] == null ? Math.max(yb, sg.a + sg.b * u) : fx[1]; });
          if (Math.max.apply(null, yt) - yb < 1e-6) return;
          var hC = (fx[1] == null ? Math.max(yb, sg.a + sg.b * cen[0]) : fx[1]) - yb;
          vol += Aq * hC;
          fm += (uf[1] - uf[0]) * ((ytf[0] - yb) + (ytf[1] - yb)) / 2;
          fp += (uf[2] - uf[3]) * ((ytf[3] - yb) + (ytf[2] - yb)) / 2;
          pecas.push({ pts: pts.map(function (p) { return [r6(p[0]), r6(p[1])]; }), y0: r6(yb), ytopo: yt.map(r6),
                       /* P4 (unir geometria): o topo exato da fatia, y = a + b·u no eixo, ou a cota fixa da verga/peitoril */
                       lin: fx[1] == null ? { a: sg.a, b: sg.b } : { a: fx[1], b: 0 }, q: pts.map(function (p) { return [p[0], p[1]]; }) });
        });
      }
      var inv = !!c.inverterFaces;
      return { pecas: pecas, volume: vol, faces: { fora: inv ? fp : fm, dentro: inv ? fm : fp }, comprimento: comp };
    },
    /* altura do topo da parede no ponto u do eixo */
    topoEm: function (c, u) {
      var tp = arr(c.topo); if (!tp.length) return frameDe(c).y1;
      for (var k = 0; k < tp.length; k++) if (u >= tp[k].u0 && u <= tp[k].u1) return tp[k].a + tp[k].b * u;
      var s = tp[u < tp[0].u0 ? 0 : tp.length - 1]; return s.a + s.b * u;
    },

    /* ============================================================ DERIVAR
     * Depois do replay (BimEdit.aplicar): refaz o que se deriva da fonte —
     * lajes (furos), peças por perfil, escadas, guarda-corpos e, por último,
     * as paredes (uniões e topo dependem das lajes e coberturas já prontas).
     * A parede fica com área e volume BRUTOS dos vãos de porta/janela: quem
     * desconta os vãos é o BimEdit.qto/medidasDe, como sempre. */
    derivar: function (estado) {
      var cx = arr(estado && estado.caixas), self = this;
      cx.forEach(function (c) {
        if (!c || !c.b2) return;
        if (c.tipo === "laje" && c.contorno) self.recalcLaje(c);
        else if (c.tipo === "pilar" && c.perfil) self.recalcPeca(c);
        else if (c.tipo === "escada" && c.escada) self.recalcEscada(c);
        else if (c.tipo === "rampa" && c.rampa && P9()) P9().recalcRampa(c);   /* P9 — GANCHO */
      });
      /* a viga para na face do pilar em que chega (depois dos pilares prontos) */
      var pils = cx.filter(function (c) { return c && c.b2 && c.tipo === "pilar" && c.perfil; });
      cx.forEach(function (c) {
        if (!c || !c.b2 || c.tipo !== "viga" || !c.perfil) return;
        if (c.arco) { self.recalcPeca(c); return; }   /* CURVA: a viga curva não para na face do pilar */
        var rc = self.recuosViga(c, pils); c.recuoIni = rc[0]; c.recuoFim = rc[1];
        if (!(c.recuoIni > 0)) delete c.recuoIni;
        if (!(c.recuoFim > 0)) delete c.recuoFim;
        self.recalcPeca(c);
      });
      /* guarda-corpo HOSPEDADO numa escada: o caminho vem da escada (depois
         das escadas prontas); escada apagada leva o guarda-corpo junto */
      var porId = {}; cx.forEach(function (c) { if (c && c.id != null) porId[c.id] = c; });
      var fora = {};
      cx.forEach(function (c) {
        if (!c || !c.b2 || c.tipo !== "guarda" || !c.guarda) return;
        var h = c.guarda.host;
        if (h && h.id != null) {
          var es = porId[h.id], cams = es && es.tipo === "escada" && es.escada && es.escada.caminhos;
          if (!cams && es && es.tipo === "rampa" && es.rampa) cams = es.rampa.caminhos;   /* P9: guarda-corpo da rampa */
          if (!cams) { fora[c.id] = 1; return; }
          var cam = cams[h.lado] || cams[Object.keys(cams)[num(h.ordem, 0)]];
          if (cam) c.guarda.pts = clone(cam);
        }
        self.recalcGuarda(c);
      });
      if (Object.keys(fora).length && estado) {
        estado.caixas = cx = cx.filter(function (c) { return !(c && fora[c.id]); });
        estado.guardasOrfaos = Object.keys(fora).length;
      }
      if (P9() && estado) P9().fimDerivar(estado);   /* P9 — GANCHO: "Marca da localização da coluna" pelos eixos */
      var paredes = cx.filter(function (c) { return c && c.b2 && c.tipo === "parede"; });
      /* P4-B: união de geometria sem parede nenhuma (pilar × laje, viga × laje) também desconta */
      if (!paredes.length) { this.descontarUnioes(estado); return estado; }
      var J = this.juntas(paredes.filter(function (c) { return c.unir !== false; }));
      var sups = this.superficies(estado);
      paredes.forEach(function (c) {
        c.uniao = J[c.id] || { ini: null, fim: null, cruz: [], abut: [], juntas: [] };
        c.juntas = c.uniao.juntas;
        /* P4-B: a laje DESUNIDA desta parede (ou que ela corta, com a ordem alternada) não para o topo */
        c.topo = self.topoParede(c, c.geoUnioes ? sups.filter(function (s) { return !self.lajeNaoCorta(c, s.id); }) : sups);
        var r = self.pecasParede(c, []), f = frameDe(c);
        /* o encosto de T/X: aquele trecho da face não leva revestimento */
        var ded = { fora: 0, dentro: 0 };
        arr(c.uniao.abut).forEach(function (ab) {
          var um = (ab.u0 + ab.u1) / 2, h = Math.max(0, Math.min(self.topoEm(c, um), num(ab.topo, f.y1)) - Math.max(f.y0, num(ab.base, f.y0)));
          var face = (ab.lado > 0) !== !!c.inverterFaces ? "dentro" : "fora";
          ded[face] += (ab.comp != null ? ab.comp : ab.u1 - ab.u0) * h;   /* CURVA: na face curva, o comprimento NA FACE */
        });
        c.volume = r4(r.volume);
        c.area = r4(f.t > 0 ? r.volume / f.t : 0);
        c.comprimentoLiq = r4(r.comprimento);
        c.faces = { fora: r4(Math.max(0, r.faces.fora - ded.fora)), dentro: r4(Math.max(0, r.faces.dentro - ded.dentro)) };
        exato(c, { volume: r.volume, area: f.t > 0 ? r.volume / f.t : 0, comprimentoLiq: r.comprimento, faces: { fora: Math.max(0, r.faces.fora - ded.fora), dentro: Math.max(0, r.faces.dentro - ded.dentro) } });
      });
      /* P4-B: UNIR GEOMETRIA — depois das paredes prontas (o recorte usa as fatias delas) */
      this.descontarUnioes(estado);
      return estado;
    },

    /* camadas da parede → área e volume de cada uma (líquidos dos vãos).
       O núcleo usa a área do eixo; o acabamento, a área da SUA face.
       P4: + a VIRADA das camadas (extremidades livres e requadro dos vãos —
       `aceitos` = os vãos do BimEdit.vaosNaParede) quando o tipo vira. */
    camadasDe: function (c, areaVaos, aceitos) {
      if (!c || !c.tipoParede) return [];
      var av = num(areaVaos, 0), fc = c.faces || {}, aEixo = num(c.area, 0) - av;
      var vr = c.virar ? this.areasVirada(c, aceitos) : null;
      /* CURVA: na parede curva cada face perde o arco DELA na faixa do vão (js/bimcurva.js) */
      var vc = c.arco && c._vaosCurva && Math.abs(c._vaosCurva.areaVaos - av) < 1e-9 ? c._vaosCurva : null;
      return arr(c.tipoParede.camadas).map(function (k) {
        var A = k.face === "nucleo" ? aEixo : (num(fc[k.face], aEixo + av) - (vc ? vc[k.face] : av));
        A = Math.max(0, A);
        if (vr && (k.face === "fora" || k.face === "dentro")) A += vr[k.face];
        return { id: k.id, rotulo: k.rotulo, face: k.face, servico: k.servico, e: k.e, area: r4(A), volume: r6(A * num(k.e, 0)) };
      });
    },

    /* ================================================== P4-A: VIRAR CAMADAS
     * a área que cada camada de acabamento de um lado GANHA quando o tipo
     * vira (regra no cabeçalho de VIRAR_EXT). Devolve { fora, dentro } (m²,
     * por camada daquele lado). Sem `aceitos` (só a área dos vãos), as
     * inserções ficam de fora — quem tem os vãos (qto, registro) passa. */
    areasVirada: function (c, aceitos) {
      var out = { fora: 0, dentro: 0, extremidades: 0, insercoes: 0 }, v = c && c.virar;
      if (!v || c.tipo !== "parede") return out;
      var L = ladosParede(c), f = frameDe(c), self = this;
      if (c.arco && Curva()) { var ea = Curva().eixoArco(c); if (ea.ok) f.L = ea.L; }   /* CURVA: as pontas do arco */
      /* (com "Inverter faces" a camada "fora" do tipo continua sendo a da face "fora": o nome acompanha) */
      function prof(lado, meio) { return Math.max(0, (meio ? L.t / 2 : L.t) - (lado === "fora" ? L.fora : L.dentro)); }
      if (v.ext === "fora" || v.ext === "dentro") {
        var livre = (c.uniao && c.uniao.livre) || [true, true];
        [0, 1].forEach(function (k) {
          if (!livre[k]) return;
          var h = Math.max(0, self.topoEm(c, k === 0 ? -f.L / 2 : f.L / 2) - f.y0), a = prof(v.ext) * h;
          out[v.ext] += a; out.extremidades += a;
        });
      }
      if (v.ins) arr(aceitos).forEach(function (q) {
        var x0 = num(q.x0, 0), x1 = num(q.x1, 0), y0 = num(q.y0, 0), y1 = num(q.y1, 0), w = q.largura != null ? num(q.largura, x1 - x0) : x1 - x0, hv = y1 - y0;   /* CURVA: o vão reto da parede curva tem a largura da abertura */
        if (!(w > 0 && hv > 0)) return;
        var per = 2 * hv + (y1 < f.H - 1e-6 ? w : 0) + (y0 > 1e-6 ? w : 0);
        if (v.ins === "ambos") { var af = per * prof("fora", true), ad = per * prof("dentro", true); out.fora += af; out.dentro += ad; out.insercoes += af + ad; }
        else { var ai = per * prof(v.ins); out[v.ins] += ai; out.insercoes += ai; }
      });
      return out;
    },

    /* ================================================== P4-B: UNIR GEOMETRIA
     * Ops (validadas no BimEdit.sanear, aplicadas no replay — bloco "P4" do
     * js/bimedit.js): {op:"unirGeometria"|"desunirGeometria"|"alternarUniao", a, b}.
     * Fica gravado nas DUAS peças (geoUnioes[outra] = {unida, inverter}).
     * Parede × parede: o canto (L/T/X) — desunir tira o canto; alternar troca
     * quem passa (a mesma coisa que ajustar.uniao.inverter). */
    OPS_UNIAO: ["unirGeometria", "desunirGeometria", "alternarUniao"],
    /* a peça "dona" do par (onde a UI grava): o id menor */
    donoPar: function (a, b) { return String(a.id) < String(b.id) ? a : b; },
    uniaoPar: function (a, b) {
      var d = this.donoPar(a, b), o = d === a ? b : a;
      var x = (d.unioes && d.unioes[String(o.id)]) || (o.unioes && o.unioes[String(d.id)]) || {};
      return { modo: x.modo || null, inverter: !!x.inverter };
    },
    geoUniao: function (a, b) {
      var d = this.donoPar(a, b), o = d === a ? b : a;
      var x = (d.geoUnioes && d.geoUnioes[String(o.id)]) || (o.geoUnioes && o.geoUnioes[String(d.id)]) || {};
      return { unida: x.unida != null ? !!x.unida : null, inverter: !!x.inverter };
    },
    /* parede × laje já nasce unida (a parede para no fundo da laje) */
    parParedeLaje: function (a, b) { return (a.tipo === "parede" && b.tipo === "laje") || (a.tipo === "laje" && b.tipo === "parede"); },
    /* a laje `lajeId` NÃO para o topo desta parede (desunida, ou a parede corta) */
    lajeNaoCorta: function (c, lajeId) {
      var g = c.geoUnioes && c.geoUnioes[String(lajeId)];
      return !!g && (g.unida === false || !!g.inverter);
    },
    /* QUEM CORTA QUEM (a regra do cabeçalho): "a" ou "b" */
    quemCorta: function (tipoA, tipoB, inverter, aAntes) {
      var pa = PRIORIDADE_UNIAO[tipoA] || 0, pb = PRIORIDADE_UNIAO[tipoB] || 0;
      var r = pa > pb ? "a" : (pb > pa ? "b" : (aAntes === false ? "b" : "a"));
      return inverter ? (r === "a" ? "b" : "a") : r;
    },
    /* a op no replay: true se valeu */
    aplicarOpUniao: function (o, ctx) {
      if (!o || this.OPS_UNIAO.indexOf(o.op) < 0 || !ctx || !ctx.caixas) return false;
      var A = ctx.caixas[o.a], B = ctx.caixas[o.b];
      if (!A || !B || String(o.a) === String(o.b) || !PRIORIDADE_UNIAO[A.tipo] || !PRIORIDADE_UNIAO[B.tipo]) return false;
      if (A.tipo === "parede" && B.tipo === "parede" && o.op === "alternarUniao") {
        var d = this.donoPar(A, B), ou = d === A ? B : A, cur = this.uniaoPar(A, B);
        return this.ajustar(d, { uniao: { com: ou.id, inverter: !cur.inverter } });
      }
      var g = this.geoUniao(A, B), pl = this.parParedeLaje(A, B), unida = g.unida != null ? g.unida : pl, inv = g.inverter;
      if (o.op === "unirGeometria") unida = true;
      else if (o.op === "desunirGeometria") { unida = false; inv = false; }
      else { if (!unida && !(A.tipo === "parede" && B.tipo === "parede")) return false; inv = !inv; }
      var v = { unida: unida }; if (inv) v.inverter = true;
      (A.geoUnioes = A.geoUnioes || {})[String(B.id)] = clone(v);
      (B.geoUnioes = B.geoUnioes || {})[String(A.id)] = clone(v);
      return true;
    },
    opUniaoValida: function (o) {
      function idOk(v) { return (typeof v === "string" && v.length > 0) || (typeof v === "number" && isFinite(v)); }
      return !!o && this.OPS_UNIAO.indexOf(o.op) >= 0 && idOk(o.a) && idOk(o.b) && String(o.a) !== String(o.b);
    },

    /* o SÓLIDO da peça para o recorte: prismas { poly (planta), furos, base,
       topo (cota fixa) | lin {f, a, b} (topo y = a + b·u no eixo da parede) } */
    solidoUniao: function (c) {
      if (!c) return { ok: false, motivo: "peça" };
      var f = frameDe(c), pecas = [];
      function caixaPoly(hx, hz) { return [aMundo(f, -hx, -hz), aMundo(f, hx, -hz), aMundo(f, hx, hz), aMundo(f, -hx, hz)]; }
      if (c.tipo === "parede") {
        if (c.uniao || c.topo) this.pecasParede(c, []).pecas.forEach(function (p) { pecas.push({ poly: p.q, furos: [], base: p.y0, lin: { f: f, a: p.lin.a, b: p.lin.b } }); });
        else pecas.push({ poly: caixaPoly(f.L / 2, f.t / 2), furos: [], base: f.y0, topo: f.y1 });
      } else if (c.tipo === "pilar") {
        var H = num(c.altura, 0), b0 = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - H / 2;
        if (c.perfil) {
          var s = secao(c.perfil); if (!s.ok) return { ok: false, motivo: s.motivo };
          pecas.push({ poly: s.contorno.map(function (q) { return aMundo(f, q[0], q[1]); }), furos: arr(s.furos).map(function (F) { return F.map(function (q) { return aMundo(f, q[0], q[1]); }); }), base: b0, topo: b0 + H });
        } else pecas.push({ poly: caixaPoly(f.L / 2, f.t / 2), furos: [], base: b0, topo: b0 + H });
      } else if (c.tipo === "viga") {
        if (c.arco) return { ok: false, motivo: "viga curva: o recorte com a parede/laje não é descontado" };   /* CURVA */
        if (c.perfil && c.perfil.forma !== "ret") return { ok: false, motivo: "viga de perfil " + (c.perfilRotulo || c.perfil.forma) + ": o recorte com a parede/laje é só para seção retangular (o resto não é descontado)" };
        var topoV = c.topoViga != null ? num(c.topoViga, 0) : f.y1, hV = num(c.altura, 0), u0 = -f.L / 2 + num(c.recuoIni, 0), u1 = f.L / 2 - num(c.recuoFim, 0);
        pecas.push({ poly: [aMundo(f, u0, -f.t / 2), aMundo(f, u1, -f.t / 2), aMundo(f, u1, f.t / 2), aMundo(f, u0, f.t / 2)], furos: [], base: topoV - hV, topo: topoV });
      } else if (c.tipo === "laje") {
        var y0 = f.y0, y1 = f.y1;
        if (c.contorno) pecas.push({ poly: limparPontos(c.contorno), furos: arr(c.furos).map(function (F) { return limparPontos(F.pts); }), base: y0, topo: y1 });
        else pecas.push({ poly: caixaPoly(f.L / 2, f.t / 2), furos: [], base: y0, topo: y1 });
      } else return { ok: false, motivo: "categoria sem união de geometria: " + c.tipo };
      return { ok: true, pecas: pecas };
    },
    /* ∫ max(0, min(topoP, topoK) − max(baseP, baseK)) dA sobre polígonos (um dos dois topos pode ser linear) */
    _integrar: function (polis, lin, cst, lo) {
      var tot = 0;
      if (!lin || Math.abs(lin.b) < 1e-12) { var top = lin ? Math.min(lin.a, cst) : cst; return momentos(polis).A * Math.max(0, top - lo); }
      if (!(cst > lo)) return 0;
      var f = lin.f, n = [f.co, -f.si], k0 = f.co * f.cx - f.si * f.cz;   /* u(p) = n·p − k0 */
      var uC = (cst - lin.a) / lin.b, uL = (lo - lin.a) / lin.b;
      function faixa(pp, umin, umax) {
        var r = pp;
        if (umax != null) r = recortarSemiplano(r, n, umax + k0);
        if (r.length && umin != null) r = recortarSemiplano(r, [-n[0], -n[1]], -(umin + k0));
        return r;
      }
      polis.forEach(function (P) {
        var cons = lin.b > 0 ? faixa(P, uC, null) : faixa(P, null, uC);
        var lini = lin.b > 0 ? faixa(P, uL, uC) : faixa(P, uC, uL);
        if (cons.length) tot += Math.abs(areaSinal(cons)) * (cst - lo);
        if (lini.length) { var M = momentos([lini]), uM = n[0] * M.cx + n[1] * M.cz - k0; tot += M.A * Math.max(0, lin.a + lin.b * uM - lo); }
      });
      return tot;
    },
    /* o volume comum de dois sólidos */
    volumeComum: function (S, K) {
      var self = this, V = 0;
      S.pecas.forEach(function (p) {
        K.pecas.forEach(function (k) {
          var lo = Math.max(p.base, k.base), lin = p.lin || k.lin, cst = Math.min(p.lin ? Infinity : p.topo, k.lin ? Infinity : k.topo);
          if (!isFinite(cst)) cst = 1e9;
          var R = intersecao(p.poly, k.poly); if (!R.length) return;
          V += self._integrar(R, lin, cst, lo);
          /* furos (laje com furo, tubo): tira o que cai dentro deles, devolve o que cai nos dois */
          p.furos.concat(k.furos).forEach(function (F) {
            var RF = []; R.forEach(function (r) { RF = RF.concat(intersecao(r, F)); });
            if (RF.length) V -= self._integrar(RF, lin, cst, lo);
          });
          p.furos.forEach(function (F1) { k.furos.forEach(function (F2) {
            var R2 = []; R.forEach(function (r) { intersecao(r, F1).forEach(function (q) { R2 = R2.concat(intersecao(q, F2)); }); });
            if (R2.length) V += self._integrar(R2, lin, cst, lo);
          }); });
        });
      });
      return Math.max(0, V);
    },
    /* quanto a FACE (lado s = ±1, w = s·t/2) da parede perde para o sólido K:
       { area (m²), trechos: [{u0, u1, base, topo}] } — os trechos ficam na
       parede (cortesFace) para a pintura por faixa (js/bimpintar.js) */
    faceCortada: function (c, s, K) {
      if (c.arco) { if (s < 0) (c.avisosUniao = c.avisosUniao || []).push("parede curva: a área das faces não desconta a união de geometria (o volume desconta)"); return { area: 0, trechos: [] }; }   /* CURVA */
      var f = frameDe(c), w = s * f.t / 2, un = c.uniao || {}, self = this, tot = 0, trechos = [];
      var FA = un.faceIni || un.ini || { c0: -f.L / 2, c1: 0 }, FB = un.faceFim || un.fim || { c0: f.L / 2, c1: 0 };
      var uIni = uEm(FA, w), uFim = uEm(FB, w);
      var gaps = arr(un.cruz).map(function (g) { return [uEm(g.a, w), uEm(g.b, w)]; });
      K.pecas.forEach(function (k) {
        /* os trechos da reta da face dentro da pegada de K (e fora dos furos dela) */
        var A0 = aMundo(f, uIni, w), d = [f.co, -f.si], ts = [uIni, uFim];
        [k.poly].concat(k.furos).forEach(function (P) { P.forEach(function (q, i) { var u = cortaSegmento(A0, d, q, P[(i + 1) % P.length]); if (u != null) ts.push(uIni + u); }); });
        gaps.forEach(function (g) { ts.push(g[0], g[1]); });
        ts = ts.filter(function (u) { return u >= uIni - 1e-9 && u <= uFim + 1e-9; }).sort(function (x, y) { return x - y; });
        for (var i = 0; i + 1 < ts.length; i++) {
          var ua = ts[i], ub = ts[i + 1]; if (ub - ua < 1e-9) continue;
          var um = (ua + ub) / 2, pm = aMundo(f, um, w);
          if (!dentro(pm, k.poly) || k.furos.some(function (F) { return dentro(pm, F); }) || gaps.some(function (g) { return um > g[0] && um < g[1]; })) continue;
          var tk = k.lin ? 1e9 : k.topo, bk = Math.max(f.y0, k.base), a = self._integrarFace(c, ua, ub, tk, bk);
          if (a > 1e-12) { tot += a; trechos.push({ u0: r6(ua), u1: r6(ub), base: r6(bk), topo: r6(tk) }); }
        }
      });
      return { area: tot, trechos: trechos };
    },
    /* ∫ max(0, min(topoParede(u), cst) − lo) du (o topo é linear por trechos) */
    _integrarFace: function (c, ua, ub, cst, lo) {
      var tp = arr(c.topo), f = frameDe(c), qs = [ua, ub];
      tp.forEach(function (sg) {
        [sg.u0, sg.u1].forEach(function (u) { if (u > ua && u < ub) qs.push(u); });
        if (Math.abs(sg.b) > 1e-12) [(cst - sg.a) / sg.b, (lo - sg.a) / sg.b].forEach(function (u) { if (u > ua && u < ub) qs.push(u); });
      });
      qs.sort(function (x, y) { return x - y; });
      var self = this, tot = 0;
      function h(u) { return Math.max(0, Math.min(tp.length ? self.topoEm(c, u) : f.y1, cst) - lo); }
      for (var i = 0; i + 1 < qs.length; i++) tot += (qs[i + 1] - qs[i]) * (h(qs[i]) + h(qs[i + 1])) / 2;
      return tot;
    },
    /* área do TOPO da laje que a peça K tira (K chega no topo da laje) */
    _topoLajeCortado: function (L, SL, K) {
      var yT = frameDe(L).y1, A = 0;
      SL.pecas.forEach(function (p) {
        K.pecas.forEach(function (k) {
          if (!(k.base < yT - 1e-6)) return;
          var R = intersecao(p.poly, k.poly);
          if (k.lin) {
            if (Math.abs(k.lin.b) < 1e-12) { if (k.lin.a < yT - 1e-6) return; }
            else {
              var f = k.lin.f, n = [f.co, -f.si], k0 = f.co * f.cx - f.si * f.cz, uT = (yT - k.lin.a) / k.lin.b;
              R = R.map(function (r) { return k.lin.b > 0 ? recortarSemiplano(r, [-n[0], -n[1]], -(uT + k0)) : recortarSemiplano(r, n, uT + k0); }).filter(function (r) { return r.length; });
            }
          } else if (k.topo < yT - 1e-6) return;
          var a = momentos(R).A;
          p.furos.concat(k.furos).forEach(function (F) { R.forEach(function (r) { a -= momentos(intersecao(r, F)).A; }); });
          A += Math.max(0, a);
        });
      });
      return A;
    },
    /* o recorte: `cortado` perde o volume comum com `corta` */
    descontarUnioes: function (estado) {
      var cx = arr(estado && estado.caixas), porId = {}, ordem = {}, self = this, visto = {}, pares = [];
      cx.forEach(function (c, i) { if (c && c.id != null) { porId[String(c.id)] = c; ordem[String(c.id)] = i; } });
      cx.forEach(function (c) {
        if (!c || !c.geoUnioes) return;
        Object.keys(c.geoUnioes).forEach(function (k) {
          var o = porId[k]; if (!o) return;
          var ch = [String(c.id), k].sort().join("|"); if (visto[ch]) return; visto[ch] = 1;
          pares.push(ordem[String(c.id)] <= ordem[k] ? [c, o] : [o, c]);
        });
      });
      pares.forEach(function (pr) {
        var A = pr[0], B = pr[1];
        if (A.tipo === "parede" && B.tipo === "parede") return;          /* o canto: juntas */
        var g = self.geoUniao(A, B), pl = self.parParedeLaje(A, B), unida = g.unida != null ? g.unida : pl;
        if (!unida || (pl && !g.inverter)) return;                       /* parede × laje padrão: o topo já parou na laje */
        var K = self.quemCorta(A.tipo, B.tipo, g.inverter, true) === "a" ? A : B, C = K === A ? B : A;
        var SC = self.solidoUniao(C), SK = self.solidoUniao(K);
        if (!SC.ok || !SK.ok) { [A, B].forEach(function (z) { (z.avisosUniao = z.avisosUniao || []).push("Unida a " + (z === A ? B.id : A.id) + ": " + (SC.ok ? SK.motivo : SC.motivo)); }); return; }
        var V = self.volumeComum(SC, SK);
        if (!(V > 1e-9)) { (C.uniaoGeo = C.uniaoGeo || []).push({ com: K.id, corta: false, volume: 0 }); (K.uniaoGeo = K.uniaoGeo || []).push({ com: C.id, corta: true, volume: 0 }); return; }
        var X = C._exato || null, vol0 = X && fin(X.volume) ? X.volume : num(C.volume, 0), vol = Math.max(0, vol0 - V);
        if (C.tipo === "parede") {
          var t = num(C.espessura, 0), lf = { fora: 0, dentro: 0 }, trs = [];
          [-1, 1].forEach(function (s) {
            var fc = (s > 0) !== !!C.inverterFaces ? "dentro" : "fora", r = self.faceCortada(C, s, SK);
            lf[fc] += r.area; r.trechos.forEach(function (q) { q.face = fc; trs.push(q); });
          });
          var fx = X && X.faces ? X.faces : (C.faces || { fora: 0, dentro: 0 });
          var fo = Math.max(0, num(fx.fora, 0) - lf.fora), de = Math.max(0, num(fx.dentro, 0) - lf.dentro);
          C.volume = r4(vol); C.area = r4(t > 0 ? vol / t : 0);
          if (C.faces) C.faces = { fora: r4(fo), dentro: r4(de) };
          (C.cortesFace = C.cortesFace || []).push({ com: K.id, fora: r6(lf.fora), dentro: r6(lf.dentro), trechos: trs });
          if (X) { X.volume = vol; X.area = t > 0 ? vol / t : 0; if (X.faces) X.faces = { fora: fo, dentro: de }; } else exato(C, { volume: vol, area: t > 0 ? vol / t : 0, faces: { fora: fo, dentro: de } });
        } else if (C.tipo === "laje") {
          var aT = self._topoLajeCortado(C, SC, SK), area0 = X && fin(X.area) ? X.area : num(C.area, 0), area = Math.max(0, area0 - aT);
          C.volume = r4(vol); C.area = r4(area);
          if (X) { X.volume = vol; X.area = area; } else exato(C, { volume: vol, area: area });
        } else {
          C.volume = r6(vol);
          if (X) X.volume = vol; else exato(C, { volume: vol });
          if (C.massa != null && MATERIAIS[C.material] && MATERIAIS[C.material].rho) { C.massa = r4(vol * MATERIAIS[C.material].rho); if (X) X.massa = vol * MATERIAIS[C.material].rho; }
        }
        (C.uniaoGeo = C.uniaoGeo || []).push({ com: K.id, corta: false, volume: r6(V) });
        (K.uniaoGeo = K.uniaoGeo || []).push({ com: C.id, corta: true, volume: r6(V) });
      });
      return estado;
    }
  };

  global.BimArq = BimArq;
  if (typeof module !== "undefined" && module.exports) module.exports = BimArq;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

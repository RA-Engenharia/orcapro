/* =====================================================================
 * madcobertura.js — A PONTE ENTRE A COBERTURA DO BIM E O MÓDULO DE MADEIRA. Motor PURO (ES5, sem DOM, Node-testável).
 *
 * Pedido do Rogério (17/11/2026): "puxo a delimitação, falo se quero beiral, e ele lança em cima do nível; a madeira tinha que estar lá dentro: lá a
 * gente fazia tudo e aqui (módulo de madeira) ele só calculava. O telhado já sai na volumetria de acordo com a telha, com as ripas para aquele tipo".
 * Complemento: a família é PARAMÉTRICA e AUTOSSUFICIENTE — o usuário não digita espaçamento; ela decide pela telha e pelo APOIO detectado no modelo
 * (laje, paredes ou pilares) e só aceita SOBRESCRITA opcional. Cálculo EM LAÇO: propõe → calcula → ajusta espaçamento/seção → fecha ou sai PRELIMINAR com o motivo.
 *
 * O QUE JÁ EXISTIA (e continua mandando): o telhado do BIM (js/bimtelhado.js), a telha de catálogo (galga, vão, caibro), o MODELO de madeira derivado do telhado
 * (js/bimtelhadoestrut.js — tesoura/terça/caibro/ripa, as telhas na volumetria, quantitativo, IFC) e o motor de madeira engenharada (T2/T3 do js/madengworker.js).
 * O QUE ESTE ARQUIVO FAZ (sem duplicar nada):
 *   1) LÊ o telhado calculado (delimitação, nível, beiral por lado, inclinação, nº de águas, telha) e RECUSA o que o motor não calcula, com a frase clara;
 *   2) DETECTA O APOIO no modelo — LAJE sob a cobertura, PAREDES no contorno ou PILARES — e escolhe sozinho o sistema:
 *        paredes + retângulo de 2 ou 4 águas → TESOURAS (motor T2/T3, Pratt/Howe/Fink), frechal nas paredes;
 *        laje → terças sobre PONTALETES distribuídos na laje (o laço escolhe o vão que gasta menos madeira);
 *        pilares / pontos marcados → 2 águas retangular com os pilares nos 4 cantos (e nas linhas das tesouras) = QUIOSQUE: TESOURA do motor T2 (Pratt/Howe/Fink pelo vão) apoiada no FRECHAL (viga) sobre os pilares do modelo;
 *                                     senão (ou "aparente"/1 e 4 águas) → terças sobre as LINHAS dos pilares (telhado aparente) — o laço acha a seção, ou sai PRELIMINAR com o porquê;
 *   3) monta a ENTRADA do motor (peso da telha do catálogo + ripas e caibros do modelo entram na carga) ou roda o LAÇO DE TERÇAS/CAIBROS
 *      (MadDim.vigaFletida: flexão, cisalhamento, flecha e 1 kN concentrado — NBR 7190-1:2022 / NBR 6120:2019 6.4);
 *   4) devolve o resultado como a op `{op:"telhado", calcMadeira}` — seções POR PAPEL (perna, linha, terça, caibro…), espaçamentos e situação — que o
 *      js/bimtelhadoestrut.js lê ao remodelar: as peças, as ripas, as telhas, o quantitativo, o IFC e as pranchas saem do MODELO (tudo vem do modelo);
 *   5) `situacao()` diz se o cálculo está DESATUALIZADO (mudou delimitação, beiral, inclinação, telha, apoio ou nível): a tela recalcula.
 *
 * PONTO DE LIGAÇÃO COM O madencaixe (outra frente — js/madencaixe.js): `encaixe(pacote, calc)` chama `global.MadEncaixe.aplicarCobertura(pacote, calc)` SE
 * existir (devolve { avisos?, acabamento? }); sem o arquivo, segue sem encaixe e diz isso. Nada de geometria de corte é duplicada aqui.
 *
 * LIMITES (escritos): vento (NBR 6123) e ligações NÃO são verificados no laço de terças (só no motor de tesouras); componente da carga paralela ao plano
 * da água não é verificada; planta em L / poligonal (rincão) e T4 não existem; 1 água usa o laço (o T1 do módulo é o quiosque de pilares).
 * Teste: node tools/test-cobertura-madeira.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function virg(v, c) { c = c == null ? 2 : c; var x = Number(v); return isFinite(x) ? x.toFixed(c).replace(".", ",") : "—"; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function ext(a) { for (var i = 1; i < arguments.length; i++) for (var k in arguments[i]) if (Object.prototype.hasOwnProperty.call(arguments[i], k)) a[k] = arguments[i][k]; return a; }
  function BT() { return dep("BimTelhado", "./bimtelhado.js"); }
  function ES() { return dep("BimTelhadoEstrut", "./bimtelhadoestrut.js"); }
  function EN() { return dep("MadEngEntrada", "./madengentrada.js"); }
  function MD() { return dep("MadDim", "./maddim7190.js"); }
  function MM() { return dep("MadMateriais", "./madmateriais.js"); }
  function CA() { return dep("AcoCargas", "./acocargas.js"); }

  var VERSAO = 2;   /* 2 = o telhado desenhado vira a geometria do motor (docs/madeira/TELHADO-DESENHADO-REFERENCIA.md): o cálculo da versão 1 fica DESATUALIZADO e é migrado/recalculado sem apagar nada */
  var G_MAD = 5.0;                 /* kN/m³ — o mesmo peso do motor (pesoMLC) */
  var CLASSE_PADRAO = "mlc:GL24h"; /* a classe do motor de madeira engenharada */
  var PESO_PARTIDA = { ceramica: 0.55, concreto: 0.55, generico: 0.55, outra: 0.12 };   /* kN/m² do motor (cerâmica "com ripas" / termoacústica) — só quando o catálogo não traz o peso */
  var ESP_APOIO_MAX = 3.2;         /* eixo máximo das tesouras/linhas de apoio do SINAPI (js/bimtelhadoestrut.js ESPAC.apoio) */

  /* ------------------------------------------------------------ grades de seção (as do motor: partida 6×12, passo 2×4 cm) */
  function gradeSecoes(b0, b1, bp, h0, h1, hp) {
    var out = [], b, h;
    for (b = b0; b <= b1 + 1e-9; b += bp) for (h = h0; h <= h1 + 1e-9; h += hp) if (h >= b - 1e-9) out.push({ b: r3(b), h: r3(h) });
    out.sort(function (x, y) { return x.b * x.h - y.b * y.h || x.h - y.h; });
    return out;
  }
  var GRADE_TERCA = gradeSecoes(0.06, 0.16, 0.02, 0.12, 0.36, 0.04);     /* limites do motor: h ≤ 0,36 e b ≤ 0,24 (aqui até 0,16) */
  var GRADE_CAIBRO = gradeSecoes(0.05, 0.08, 0.01, 0.06, 0.14, 0.02);
  var GRADE_VIGA = gradeSecoes(0.08, 0.20, 0.02, 0.16, 0.48, 0.04);

  /* ------------------------------------------------------------ geometria plana */
  function dentro(p, P) { var T = BT(); if (T && T.dentro) return T.dentro(p, P); var c = false, i, j; for (i = 0, j = P.length - 1; i < P.length; j = i++) if (((P[i][1] > p[1]) !== (P[j][1] > p[1])) && (p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) c = !c; return c; }
  function dentroTol(p, P, tol) {
    if (dentro(p, P)) return true;
    var i, n = P.length; for (i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, k = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0;
      if (Math.sqrt(Math.pow(p[0] - (a[0] + k * dx), 2) + Math.pow(p[1] - (a[1] + k * dz), 2)) <= tol) return true;
    }
    return false;
  }
  function distP(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }

  /* ======================================================================
   * 0) NORMALIZAR O CONTORNO — função PURA (testada em tools/test-madeira-contorno.js)
   * Pedido do Rogério (20/11/2026): o telhado em L de 4 águas dele chegou com 10 lados e foi recusado ("a delimitação tem 10 lados"). Um L desenhado à mão ou unido traz vértices
   * duplicados, colineares (ponto no meio de um lado reto) e dentes de poucos centímetros (snap). Antes de classificar a tipologia o CÁLCULO usa o contorno LIMPO; o desenho do telhado
   * no modelo NÃO muda. Regras: (1) duplicado (aresta < 1 cm) sai; (2) colinear (desvio < 1° ou distância ao segmento < 1 cm) sai SE as duas arestas têm a mesma água, inclinação e
   * beiral; (3) dente ortogonal (aresta curta < 0,10 m entre duas arestas perpendiculares a ela: DEGRAU ou DEDO) é absorvido movendo o vértice vizinho, SE a área mudar até 0,5 %.
   * Entrada: pts [[x,z]…] e props (uma por aresta k = pts[k]→pts[k+1], opcional). Saída: { pts, props, removidos:{duplicados,colineares,dentes}, areaAntes, areaDepois, n }.
   * ====================================================================== */
  var NORM_TOL = { dup: 0.01, colDist: 0.01, colAng: 1, dente: 0.10, area: 0.005 };
  function areaPts(P) { var a = 0, i, n = P.length; for (i = 0; i < n; i++) { var p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function distPts(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2)); }
  function propsFundem(x, y) {
    if (x == null || y == null) return true;
    if (!!x.define !== !!y.define) return false;
    if (x.define && Math.abs(num(x.inclinacao, 0) - num(y.inclinacao, 0)) > 0.01) return false;
    return Math.abs(num(x.beiralM, 0) - num(y.beiralM, 0)) <= 0.005;
  }
  function normalizarContorno(pts, props, opc) {
    var tol = ext({}, NORM_TOL, opc || {}), pr = arr(props), V = arr(pts).map(function (q, i) { return { p: [Number(q[0]), Number(q[1])], e: pr.length === pts.length ? pr[i] : null }; });
    var rem = { duplicados: 0, colineares: 0, dentes: 0 }, a0 = Math.abs(areaPts(V.map(function (v) { return v.p; }))), passes = 0, mudou = true;
    function md(i, n) { return ((i % n) + n) % n; }
    function dir(a, b) { var L0 = distPts(a, b); return L0 > 0 ? [(b[0] - a[0]) / L0, (b[1] - a[1]) / L0] : [0, 0]; }
    function perp(u, v) { return Math.abs(u[0] * v[0] + u[1] * v[1]) < 0.05; }
    function pontos(W) { return W.map(function (v) { return v.p; }); }
    function dArea(W) { return Math.abs(Math.abs(areaPts(pontos(W))) - a0); }
    function areaOk(W) { return dArea(W) <= tol.area * a0; }
    function copia(W) { return W.map(function (v) { return { p: v.p.slice(), e: v.e }; }); }
    while (mudou && passes++ < 60 && V.length > 3) {
      mudou = false; var n = V.length, k;
      for (k = 0; k < n && !mudou; k++) {                       /* (1) duplicado: aresta k de comprimento < 1 cm; o vértice k+1 sai e a aresta seguinte passa a ser a do k */
        var j = (k + 1) % n; if (distPts(V[k].p, V[j].p) < tol.dup) { V[k].e = V[j].e; V.splice(j, 1); rem.duplicados++; mudou = true; }
      }
      if (mudou) continue;
      for (k = 0; k < n && !mudou; k++) {                       /* (2) colinear: vértice k entre as arestas k-1 e k */
        var A = V[md(k - 1, n)].p, B = V[k].p, C = V[(k + 1) % n].p, ab = dir(A, B), bc = dir(B, C), cs = ab[0] * bc[0] + ab[1] * bc[1], cr = ab[0] * bc[1] - ab[1] * bc[0];
        var ang = Math.abs(Math.atan2(cr, cs)) * 180 / Math.PI, dAC = distPts(A, C), dseg = dAC > 0 ? Math.abs((C[0] - A[0]) * (A[1] - B[1]) - (A[0] - B[0]) * (C[1] - A[1])) / dAC : 0;
        if (cs > 0 && (ang < tol.colAng || dseg < tol.colDist) && propsFundem(V[md(k - 1, n)].e, V[k].e)) { V.splice(k, 1); rem.colineares++; mudou = true; }
      }
      if (mudou) continue;
      for (k = 0; k < n && !mudou; k++) {                       /* (3) dente ortogonal: aresta curta k = V[k]→V[k+1] */
        var i0 = md(k - 1, n), i1 = k, i2 = (k + 1) % n, i3 = (k + 2) % n, Ap = V[i0].p, Bp = V[i1].p, Cp = V[i2].p, Dp = V[i3].p, w = distPts(Bp, Cp);
        if (!(w >= tol.dup && w < tol.dente)) continue;
        var uAB = dir(Ap, Bp), uBC = dir(Bp, Cp), uCD = dir(Cp, Dp);
        if (!perp(uAB, uBC) || !perp(uCD, uBC)) continue;
        if (uAB[0] * uCD[0] + uAB[1] * uCD[1] > 0) {            /* DEGRAU: leva C e D para a linha de A–B, ou B e A para a linha de C–D (o vizinho anda ao longo do lado perpendicular) */
          var tent = [], W1, W2;
          if (perp(dir(Dp, V[(k + 3) % n].p), uCD)) { W1 = copia(V); W1[i2].p = Bp.slice(); W1[i3].p = [Dp[0] + Bp[0] - Cp[0], Dp[1] + Bp[1] - Cp[1]]; tent.push(W1); }
          if (perp(dir(V[md(k - 2, n)].p, Ap), uAB)) { W2 = copia(V); W2[i1].p = Cp.slice(); W2[i0].p = [Ap[0] + Cp[0] - Bp[0], Ap[1] + Cp[1] - Bp[1]]; tent.push(W2); }
          tent = tent.filter(areaOk).sort(function (x, y) { return dArea(x) - dArea(y); });
          if (tent.length) { V = tent[0]; rem.dentes++; mudou = true; }
        } else if (Math.abs(distPts(Ap, Bp) - distPts(Cp, Dp)) <= tol.dup) {   /* DEDO (ou entalhe) de largura w: tira B e C; A–D fica colinear com os vizinhos e sai no passe (2) */
          var W3 = copia(V).filter(function (v, idx) { return idx !== i1 && idx !== i2; });
          if (W3.length >= 3 && areaOk(W3)) { V = W3; rem.dentes++; mudou = true; }
        }
      }
    }
    var P = pontos(V);
    return { pts: P, props: V.map(function (v) { return v.e; }), removidos: rem, areaAntes: a0, areaDepois: Math.abs(areaPts(P)), n: P.length };
  }
  /* A FORMA do contorno já normalizado, em palavras (para a mensagem de recusa): retângulo, L, T, U, Z/S, cruz, polígono ortogonal de N lados ou irregular. */
  function descreverForma(P) {
    var n = P.length, k, ort = true, tur = [], s = areaPts(P) >= 0 ? 1 : -1, nr = 0, ir = [];
    for (k = 0; k < n; k++) {
      var p0 = P[(k + n - 1) % n], p1 = P[k], p2 = P[(k + 1) % n], u = [p1[0] - p0[0], p1[1] - p0[1]], v = [p2[0] - p1[0], p2[1] - p1[1]], lu = Math.sqrt(u[0] * u[0] + u[1] * u[1]), lv = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      if (!(lu > 0 && lv > 0) || Math.abs(u[0] * v[0] + u[1] * v[1]) / (lu * lv) > 0.03) ort = false;
      var cz = (u[0] * v[1] - u[1] * v[0]) * s; tur.push(cz < 0 ? "R" : "C"); if (cz < 0) { nr++; ir.push(k); }
    }
    if (!ort) return "polígono irregular (há ângulos que não são de 90°)";
    if (n === 4) return "retângulo";
    if (nr === 0) return "polígono ortogonal convexo de " + n + " lados";
    if (n === 6 && nr === 1) return "L ortogonal";
    if (n === 8 && nr === 2) {
      var gap = (ir[1] - ir[0] + n) % n, mn = Math.min(gap, n - gap);
      return mn === 1 ? "U" : mn === 3 ? "T" : mn === 4 ? "Z/S (escada)" : "polígono ortogonal de 8 lados";
    }
    if (n === 12 && nr === 4) return "cruz (+)";
    return "polígono ortogonal de " + n + " lados com " + nr + " cantos côncavos";
  }
  /* o contorno do telhado (arestasCalc) normalizado — devolve { ar, info, mudou }; ar tem as MESMAS propriedades das arestas (parede a→b refeita) */
  function normalizarArestas(ar) {
    var P = ar.map(function (e) { return [e.parede.a.x, e.parede.a.z]; }), r = normalizarContorno(P, ar);
    if (r.removidos.duplicados + r.removidos.colineares + r.removidos.dentes === 0) return { ar: ar, info: r, mudou: false };
    var out = r.pts.map(function (p, i) {
      var q = r.pts[(i + 1) % r.pts.length], base = r.props[i] || ar[0], par = ext({}, base.parede || {});
      par.a = { x: r4(p[0]), z: r4(p[1]) }; par.b = { x: r4(q[0]), z: r4(q[1]) };
      return ext({}, base, { parede: par });
    });
    return { ar: out, info: r, mudou: true };
  }
  function ladosTxt(P) { return P.map(function (p, i) { return virg(distPts(p, P[(i + 1) % P.length])) + " m"; }).join(" · "); }
  function coordsTxt(P) { return P.map(function (p, i) { return (i + 1) + "=(" + virg(p[0]) + "; " + virg(p[1]) + ")"; }).join("  "); }
  /* vértices que impedem o cálculo: os de ângulo diferente de 90° (ou, no ortogonal, os côncavos) — para a tela marcar */
  function vertsProblema(P) {
    var n = P.length, out = [], k, s = areaPts(P) >= 0 ? 1 : -1;
    for (k = 0; k < n; k++) {
      var p0 = P[(k + n - 1) % n], p1 = P[k], p2 = P[(k + 1) % n], u = [p1[0] - p0[0], p1[1] - p0[1]], v = [p2[0] - p1[0], p2[1] - p1[1]], lu = Math.sqrt(u[0] * u[0] + u[1] * u[1]), lv = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      var oblq = !(lu > 0 && lv > 0) || Math.abs(u[0] * v[0] + u[1] * v[1]) / (lu * lv) > 0.03, conc = (u[0] * v[1] - u[1] * v[0]) * s < 0;
      if (oblq || conc) out.push({ i: k + 1, x: r3(p1[0]), z: r3(p1[1]), motivo: oblq ? "ângulo diferente de 90°" : "canto côncavo" });
    }
    return out;
  }

  /* ======================================================================
   * 1) LER O TELHADO — o que o motor aceita e o que recusa (a frase clara)
   * ====================================================================== */
  /* POLÍGONO REGULAR de 6 ou 8 lados (T4, sextavado/oitavado): lados iguais (±2 %), ângulo externo 360/n (±2°), TODAS as águas definem a mesma inclinação, mesmo beiral. Senão null (cai na recusa de "lados"). */
  function lerPoligonal(t, id, ar, n) {
    var P = ar.map(function (e) { return [e.parede.a.x, e.parede.a.z]; }), L = [], k;
    for (k = 0; k < n; k++) { var a = P[k], b = P[(k + 1) % n]; L.push(Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2))); }
    var Lm = L.reduce(function (x, y) { return x + y; }, 0) / n; if (!(Lm > 0.5)) return null;
    if (L.some(function (x) { return Math.abs(x - Lm) > 0.02 * Lm; })) return null;
    var turn = 360 / n, sinal = 0;
    for (k = 0; k < n; k++) {
      var a0 = P[k], b0 = P[(k + 1) % n], c0 = P[(k + 2) % n], ux = b0[0] - a0[0], uz = b0[1] - a0[1], vx = c0[0] - b0[0], vz = c0[1] - b0[1];
      var ang = Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz) * 180 / Math.PI; if (k === 0) sinal = ang > 0 ? 1 : -1;
      if (Math.abs(ang * sinal - turn) > 2) return null;
    }
    var inc = ar.map(function (e) { return e.define ? num(e.inclinacao, 0) : null; });
    if (inc.some(function (x) { return x == null; })) return { ok: false, motivo: "Polígono regular de " + n + " lados: no sextavado/oitavado TODAS as arestas definem a inclinação (as águas têm a mesma inclinação ⊥ ao lado)." };
    if (inc.some(function (x) { return Math.abs(x - inc[0]) > 0.01; })) return { ok: false, motivo: "As águas têm inclinações diferentes: o módulo Madeira calcula inclinação única (T4)." };
    if (!(inc[0] >= 5)) return { ok: false, motivo: "Inclinação de " + virg(inc[0], 1) + " %: o módulo exige no mínimo 5 % (telha)." };
    var be = ar.map(function (e) { return num(e.beiralM, num(t.beiral, 0)); });
    if (be.some(function (x) { return Math.abs(x - be[0]) > 0.005; })) return { ok: false, motivo: "O beiral é diferente entre os lados: o T4 exige o MESMO beiral nos " + n + " lados." };
    var R = Lm / (2 * Math.sin(Math.PI / n)), cx = 0, cz = 0; P.forEach(function (q) { cx += q[0] / n; cz += q[1] / n; });
    if (R < 1.8 || R > 12) return { ok: false, motivo: "Raio de " + virg(R) + " m: o módulo calcula T4 de 1,8 a 12 m de raio." };
    var BTm = BT(), tel = BTm && BTm.telha ? BTm.telha(t.tipoId) : null, baseZ = num(t.elevNivel, 0), pe = num(t.deslocBaseEf, num(t.cotaApoio, 0) - baseZ);
    return { ok: true, id: String(id), t: t, tipo: "T4", n: n, R: r3(R), a: r3(2 * R), b: r3(2 * R * Math.cos(Math.PI / n)), incl: inc[0], beiral: be[0], baseZ: baseZ, peDireito: pe, cotaApoio: num(t.cotaApoio, 0), cotaCumeeira: num(t.cotaCumeeira, num(t.cotaApoio, 0)),
      telha: tel, tipoId: t.tipoId || null, nAguas: num(t.nAguas, 0), eave: [], gable: [], eixoA: "x", kA: 0, eixoD: [0, 0, 0, 0], beiralLat: [be[0], be[0]], lados: L, centro: [r3(cx), r3(cz)], contorno: P, areaProjecao: num(t.areaProjecao, 0) };
  }
  /* PLANTA EM L (T3L): 6 vértices, ortogonal, 5 convexos e 1 côncavo; as 6 arestas definem a MESMA inclinação; mesmo beiral. As asas são ordenadas pelas simetrias do L (troca das duas asas) até satisfazer o canônico do motor
     (asa A larga ao longo de X, bb ≤ b, (a ≥ c NÃO é exigido; o vento é por asa) — js/madt3l.js). Devolve null se o contorno de 6 lados não é um L (cai na recusa de "lados"). O contorno é tomado ENTRE EIXOS das paredes (sem a correção de espessura do retângulo). */
  function lerL(t, id, ar) {
    var P = ar.map(function (e) { return [e.parede.a.x, e.parede.a.z]; }), n = 6, k, a2 = 0, E = ar.slice();
    for (k = 0; k < n; k++) { var A0 = P[k], B0 = P[(k + 1) % n]; a2 += A0[0] * B0[1] - B0[0] * A0[1]; }
    if (!(Math.abs(a2) > 1e-6)) return null;
    if (a2 < 0) { P = P.slice().reverse(); E = E.slice().reverse(); }                    /* anti-horário em (x, z): o vértice côncavo é o de produto vetorial negativo */
    var reflex = -1, nref = 0;
    for (k = 0; k < n; k++) {
      var p0 = P[(k + n - 1) % n], p1 = P[k], p2 = P[(k + 1) % n], d1 = [p1[0] - p0[0], p1[1] - p0[1]], d2 = [p2[0] - p1[0], p2[1] - p1[1]], l1 = Math.sqrt(d1[0] * d1[0] + d1[1] * d1[1]), l2 = Math.sqrt(d2[0] * d2[0] + d2[1] * d2[1]);
      if (!(l1 > 0.2 && l2 > 0.2) || Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2) > 0.02) return null;
      var cr = d1[0] * d2[1] - d1[1] * d2[0]; if (cr < 0) { nref++; reflex = k; } }
    if (nref !== 1) return null;
    var V0 = P[(reflex + 3) % n], V1 = P[(reflex + 4) % n], V2 = P[(reflex + 5) % n], V4 = P[(reflex + 1) % n], V5 = P[(reflex + 2) % n];
    function dst(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2)); }
    function un(a, b) { var L0 = dst(a, b) || 1; return [(b[0] - a[0]) / L0, (b[1] - a[1]) / L0]; }
    var la = dst(V0, V1), wA = dst(V1, V2), wB = dst(V4, V5), lc = dst(V0, V5);
    var inc = E.map(function (e) { return e.define ? num(e.inclinacao, 0) : null; });
    if (inc.some(function (x) { return x == null; })) return { ok: false, motivo: "Planta em L: TODAS as 6 arestas definem a inclinação (as 6 águas têm a mesma inclinação, a 4 águas em L com rincão)." };
    if (inc.some(function (x) { return Math.abs(x - inc[0]) > 0.01; })) return { ok: false, motivo: "Planta em L: as águas têm inclinações diferentes (" + inc.map(function (x) { return virg(x, 1) + " %"; }).join(", ") + "); o módulo Madeira calcula inclinação única." };
    if (!(inc[0] >= 5)) return { ok: false, motivo: "Inclinação de " + virg(inc[0], 1) + " %: o módulo exige no mínimo 5 % (telha)." };
    var be = E.map(function (e) { return num(e.beiralM, num(t.beiral, 0)); });
    if (be.some(function (x) { return Math.abs(x - be[0]) > 0.005; })) return { ok: false, motivo: "Planta em L: o beiral é diferente entre os lados (" + be.map(function (x) { return virg(x); }).join("; ") + " m); o espigão e o rincão a 45° exigem o MESMO beiral nos 6 lados." };
    var TLm = dep("MadT3L", "./madt3l.js"); if (!TLm) return { ok: false, motivo: "O motor da planta em L (js/madt3l.js) não carregou." };
    var opcs = [{ a: la, b: wA, c: lc, bb: wB, X: un(V0, V1), Z: un(V0, V5) }, { a: lc, b: wB, c: la, bb: wA, X: un(V0, V5), Z: un(V0, V1) }], esc = null, erro = "";
    opcs.forEach(function (o) { if (esc) return; try { TLm.parametros({ a: r3(o.a), b: r3(o.b), c: r3(o.c), bb: r3(o.bb), incl: inc[0] / 100, beiral: be[0] }); esc = o; } catch (eP) { if (!erro) erro = String(eP.message || eP).replace(/^madt3l:\s*/, ""); } });
    if (!esc) return { ok: false, motivo: "Planta em L (asas " + virg(la) + " × " + virg(wA) + " m e " + virg(lc) + " × " + virg(wB) + " m): " + erro + "." };
    var BTm = BT(), tel = BTm && BTm.telha ? BTm.telha(t.tipoId) : null, baseZ = num(t.elevNivel, 0), pe = num(t.deslocBaseEf, num(t.cotaApoio, 0) - baseZ), cx = 0, cz = 0; P.forEach(function (q) { cx += q[0] / n; cz += q[1] / n; });
    return { ok: true, id: String(id), t: t, tipo: "T3L", a: r3(esc.a), b: r3(esc.b), c: r3(esc.c), bb: r3(esc.bb), incl: inc[0], beiral: be[0], baseZ: baseZ, peDireito: pe, cotaApoio: num(t.cotaApoio, 0), cotaCumeeira: num(t.cotaCumeeira, num(t.cotaApoio, 0)),
      telha: tel, tipoId: t.tipoId || null, nAguas: num(t.nAguas, 0), eave: [0, 1, 2, 3, 4, 5], gable: [], virtualDe: t.virtualDe || null, eixoA: "x", kA: 0, eixoD: [0, 0, 0, 0], beiralLat: [be[0], be[0]], lados: [la, wA, dst(V2, P[reflex]), dst(P[reflex], V4), wB, lc], contorno: P, centro: [r3(cx), r3(cz)],
      quadroL: { O: [V0[0], V0[1]], u: esc.X, v: esc.Z }, areaProjecao: num(t.areaProjecao, esc.a * esc.b + esc.bb * (esc.c - esc.b)) };
  }
  /* PLANTA EM T OU U (T3TU, 4 águas com 1 rincão por canto côncavo): 8 vértices, ortogonal, descreverForma = "T" ou "U". O contorno é canonizado (js/madt3tumembros.js canonizar: gira/espelha até a barra LARGA
     ficar ao longo de X e as pernas ao longo de Z) e validado pelo MESMO parametros() do motor; a MESMA inclinação nas 8 águas e o MESMO beiral. Devolve null se a forma não é T/U (cai na recusa de "lados").
     L (6 lados) continua no lerL/T3L; pátio, cruz, E e irregular continuam recusados. docs/madeira/T3TU-REFERENCIA.md. */
  /* O contorno que vem do BIM tem ruído de ~1e-5 m (arredondamento do construtor do telhado, vértice a vértice) e pode estar girado no mundo. O motor de T/U compara coordenadas com 1e-6: leva o contorno ao quadro do
     seu maior lado (s, t) e funde as coordenadas que diferem menos que 2 cm (a mesma tolerância dos dentes). Devolve { P: [[s, t]...], O, u, v } (mundo = O + s·u + t·v) ou null se sobrar vértice fora de ortogonal. */
  function ortogonalizar(P) {
    var n = P.length, k, m = 0, u0 = [1, 0];
    for (k = 0; k < n; k++) { var q = P[(k + 1) % n], d = Math.sqrt(Math.pow(q[0] - P[k][0], 2) + Math.pow(q[1] - P[k][1], 2)); if (d > m) { m = d; u0 = [(q[0] - P[k][0]) / d, (q[1] - P[k][1]) / d]; } }
    var v0 = [-u0[1], u0[0]], S = P.map(function (q) { return [(q[0] - P[0][0]) * u0[0] + (q[1] - P[0][1]) * u0[1], (q[0] - P[0][0]) * v0[0] + (q[1] - P[0][1]) * v0[1]]; });
    [0, 1].forEach(function (c) {
      var v = S.map(function (q) { return q[c]; }).sort(function (a, b) { return a - b; }), grupos = [], g = [v[0]], i;
      for (i = 1; i < v.length; i++) { if (v[i] - v[i - 1] <= 0.02) g.push(v[i]); else { grupos.push(g); g = [v[i]]; } } grupos.push(g);
      var medias = grupos.map(function (x) { return { min: x[0], max: x[x.length - 1], m: x.reduce(function (a, b) { return a + b; }, 0) / x.length }; });
      S.forEach(function (q) { medias.forEach(function (x) { if (q[c] >= x.min - 1e-12 && q[c] <= x.max + 1e-12) q[c] = Math.round(x.m * 1000) / 1000; }); });      /* ao milímetro: larguras IGUAIS (T com perna da largura da barra) continuam iguais depois do ruído */
    });
    for (k = 0; k < n; k++) { var a = S[k], b = S[(k + 1) % n]; if (!(Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9)) return null; }
    return { P: S, O: [P[0][0], P[0][1]], u: u0, v: v0 };
  }
  function lerTU(t, id, ar) {
    var n = ar.length, P = ar.map(function (e) { return [e.parede.a.x, e.parede.a.z]; }), E = ar.slice(), k, a2 = 0;
    if (n !== 8) return null;
    for (k = 0; k < n; k++) { var A0 = P[k], B0 = P[(k + 1) % n]; a2 += A0[0] * B0[1] - B0[0] * A0[1]; }
    if (!(Math.abs(a2) > 1e-6)) return null;
    if (a2 < 0) { P = P.slice().reverse(); E = E.slice().reverse(); }                    /* anti-horário em (x, z) */
    var forma = descreverForma(P); if (forma !== "T" && forma !== "U") return null;
    var inc = E.map(function (e) { return e.define ? num(e.inclinacao, 0) : null; });
    if (inc.some(function (x) { return x == null; })) return { ok: false, motivo: "Planta em " + forma + ": TODAS as 8 arestas definem a inclinação (as 8 águas têm a mesma inclinação, a 4 águas em " + forma + " com um rincão por canto côncavo)." };
    if (inc.some(function (x) { return Math.abs(x - inc[0]) > 0.01; })) return { ok: false, motivo: "Planta em " + forma + ": as águas têm inclinações diferentes (" + inc.map(function (x) { return virg(x, 1) + " %"; }).join(", ") + "); o módulo Madeira calcula inclinação única." };
    if (!(inc[0] >= 5)) return { ok: false, motivo: "Inclinação de " + virg(inc[0], 1) + " %: o módulo exige no mínimo 5 % (telha)." };
    var be = E.map(function (e) { return num(e.beiralM, num(t.beiral, 0)); });
    if (be.some(function (x) { return Math.abs(x - be[0]) > 0.005; })) return { ok: false, motivo: "Planta em " + forma + ": o beiral é diferente entre os lados (" + be.map(function (x) { return virg(x); }).join("; ") + " m); o espigão e o rincão a 45° exigem o MESMO beiral nos 8 lados." };
    var TMm = dep("MadT3TUMembros", "./madt3tumembros.js"); if (!TMm) return { ok: false, motivo: "O motor da planta em T/U (js/madt3tumembros.js) não carregou." };
    var og = ortogonalizar(P); if (!og) return { ok: false, motivo: "Planta em " + forma + ": os lados não são paralelos aos eixos da planta (tolerância de 2 cm)." };
    var cn = TMm.canonizar(og.P); if (!cn.ok) return { ok: false, motivo: "Planta em " + forma + ": " + cn.motivo + "." };
    var qc = cn.quadro, quadroTU = { O: [og.O[0] + qc.O[0] * og.u[0] + qc.O[1] * og.v[0], og.O[1] + qc.O[0] * og.u[1] + qc.O[1] * og.v[1]], u: [qc.u[0] * og.u[0] + qc.u[1] * og.v[0], qc.u[0] * og.u[1] + qc.u[1] * og.v[1]], v: [qc.v[0] * og.u[0] + qc.v[1] * og.v[0], qc.v[0] * og.u[1] + qc.v[1] * og.v[1]] };
    var legs = cn.legs.map(function (L) { return { x0: r3(L.x0), w: r3(L.w), c: r3(L.c) }; });
    try { TMm.parametros({ a: r3(cn.a), b: r3(cn.b), legs: legs, incl: inc[0] / 100, beiral: be[0] }); } catch (eP) { return { ok: false, motivo: "Planta em " + forma + " (barra " + virg(cn.a) + " × " + virg(cn.b) + " m): " + String(eP.message || eP).replace(/^madt3tu:\s*/, "") + "." }; }
    var BTm = BT(), tel = BTm && BTm.telha ? BTm.telha(t.tipoId) : null, baseZ = num(t.elevNivel, 0), pe = num(t.deslocBaseEf, num(t.cotaApoio, 0) - baseZ), cx = 0, cz = 0; P.forEach(function (q) { cx += q[0] / n; cz += q[1] / n; });
    function dst(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2)); }
    return { ok: true, id: String(id), t: t, tipo: "T3TU", planta: forma, a: r3(cn.a), b: r3(cn.b), legs: legs, incl: inc[0], beiral: be[0], baseZ: baseZ, peDireito: pe, cotaApoio: num(t.cotaApoio, 0), cotaCumeeira: num(t.cotaCumeeira, num(t.cotaApoio, 0)),
      telha: tel, tipoId: t.tipoId || null, nAguas: num(t.nAguas, 0), eave: [0, 1, 2, 3, 4, 5, 6, 7], gable: [], virtualDe: t.virtualDe || null, eixoA: "x", kA: 0, eixoD: [0, 0, 0, 0], beiralLat: [be[0], be[0]], lados: P.map(function (p, i) { return dst(p, P[(i + 1) % n]); }), contorno: P, centro: [r3(cx), r3(cz)],
      quadroTU: quadroTU, areaProjecao: num(t.areaProjecao, Math.abs(a2) / 2) };
  }
  /* PÁTIO (anel): contorno externo RETANGULAR + 1 furo retangular de lados paralelos (t.furos, js/bimtelhado.js). Tipologia T3TU com planta "P" (js/madt3tumembros.js, canonizarAnel): 4 asas (faixas N, S, L, O) unidas
     nos cantos, águas para fora e para dentro (calha do pátio), rincão nos 4 cantos do furo. SEMPRE PRELIMINAR (anel/pátio não verificado pelo RT; drenagem da calha do pátio a dimensionar).
     RECUSA com motivo: contorno externo que não é retângulo, mais de 1 furo, furo não retangular ou não paralelo, faixa < 2·beiral + 0,5 m, faixas diferentes entre lados opostos, inclinação/beiral diferentes. docs/madeira/T3TU-REFERENCIA.md (seção Pátio). */
  function lerAnel(t, id, ar, furos) {
    var n = ar.length, P = ar.map(function (e) { return [e.parede.a.x, e.parede.a.z]; }), E = ar.slice(), a2 = 0, k;
    if (furos.length > 1) return { ok: false, motivo: "Telhado com " + furos.length + " furos: o módulo Madeira calcula UM pátio retangular (anel)." };
    if (n !== 4) return { ok: false, motivo: "Telhado com pátio e contorno externo de " + n + " lados: o anel só é calculado com o contorno externo RETANGULAR." };
    for (k = 0; k < n; k++) { var A0 = P[k], B0 = P[(k + 1) % n]; a2 += A0[0] * B0[1] - B0[0] * A0[1]; }
    if (!(Math.abs(a2) > 1e-6)) return { ok: false, motivo: "Contorno do telhado com área nula." };
    if (a2 < 0) { P = P.slice().reverse(); E = E.slice().reverse(); }
    var inc = E.map(function (e) { return e.define ? num(e.inclinacao, 0) : null; });
    if (inc.some(function (x) { return x == null; })) return { ok: false, motivo: "Anel (pátio): TODAS as 4 arestas externas definem a inclinação (a água do pátio tem a MESMA inclinação)." };
    if (inc.some(function (x) { return Math.abs(x - inc[0]) > 0.01; })) return { ok: false, motivo: "Anel (pátio): as águas têm inclinações diferentes (" + inc.map(function (x) { return virg(x, 1) + " %"; }).join(", ") + "); o módulo Madeira calcula inclinação única." };
    if (!(inc[0] >= 5)) return { ok: false, motivo: "Inclinação de " + virg(inc[0], 1) + " %: o módulo exige no mínimo 5 % (telha)." };
    var be = E.map(function (e) { return num(e.beiralM, num(t.beiral, 0)); });
    if (be.some(function (x) { return Math.abs(x - be[0]) > 0.005; })) return { ok: false, motivo: "Anel (pátio): o beiral é diferente entre os lados; o espigão e o rincão a 45° exigem o MESMO beiral." };
    var TMm = dep("MadT3TUMembros", "./madt3tumembros.js"); if (!TMm || !TMm.canonizarAnel) return { ok: false, motivo: "O motor da planta em anel (js/madt3tumembros.js) não carregou." };
    var og = ortogonalizar(P); if (!og) return { ok: false, motivo: "Anel (pátio): os lados externos não são paralelos aos eixos (tolerância de 2 cm)." };
    var F = furos[0].map(function (q) { var dx = q[0] - og.O[0], dz = q[1] - og.O[1]; return [Math.round((dx * og.u[0] + dz * og.u[1]) * 1000) / 1000, Math.round((dx * og.v[0] + dz * og.v[1]) * 1000) / 1000]; });
    var cn = TMm.canonizarAnel(og.P, F, 0.02); if (!cn.ok) return { ok: false, motivo: "Anel (pátio): " + cn.motivo + "." };
    var minF = Math.min(cn.b, cn.wV), minR = 2 * be[0] + 0.5;
    if (cn.b < minR - 1e-9 || cn.wV < minR - 1e-9) return { ok: false, motivo: "Anel (pátio): faixa de " + virg(minF) + " m menor que 2 × beiral + 0,5 = " + virg(minR) + " m." };
    var qc = cn.quadro, quadroTU = { O: [og.O[0] + qc.O[0] * og.u[0] + qc.O[1] * og.v[0], og.O[1] + qc.O[0] * og.u[1] + qc.O[1] * og.v[1]], u: [qc.u[0] * og.u[0] + qc.u[1] * og.v[0], qc.u[0] * og.u[1] + qc.u[1] * og.v[1]], v: [qc.v[0] * og.u[0] + qc.v[1] * og.v[0], qc.v[0] * og.u[1] + qc.v[1] * og.v[1]] };
    var legs = [{ x0: 0, w: r3(cn.wV), c: r3(cn.c) }, { x0: r3(cn.a - cn.wV), w: r3(cn.wV), c: r3(cn.c) }];
    try { TMm.parametros({ a: r3(cn.a), b: r3(cn.b), c: r3(cn.c), wV: r3(cn.wV), anel: true, incl: inc[0] / 100, beiral: be[0] }); } catch (eP) { return { ok: false, motivo: "Anel (pátio) " + virg(cn.a) + " × " + virg(cn.c) + " m (faixas " + virg(cn.b) + " e " + virg(cn.wV) + " m): " + String(eP.message || eP).replace(/^madt3tu:\s*/, "") + "." }; }
    var BTm = BT(), tel = BTm && BTm.telha ? BTm.telha(t.tipoId) : null, baseZ = num(t.elevNivel, 0), pe = num(t.deslocBaseEf, num(t.cotaApoio, 0) - baseZ), cx = 0, cz = 0; P.forEach(function (q) { cx += q[0] / n; cz += q[1] / n; });
    function dst(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2)); }
    return { ok: true, id: String(id), t: t, tipo: "T3TU", planta: "P", anel: true, avisoFaixas: cn.avisoFaixas || null, a: r3(cn.a), b: r3(cn.b), c: r3(cn.c), wV: r3(cn.wV), legs: legs, incl: inc[0], beiral: be[0], baseZ: baseZ, peDireito: pe, cotaApoio: num(t.cotaApoio, 0), cotaCumeeira: num(t.cotaCumeeira, num(t.cotaApoio, 0)),
      telha: tel, tipoId: t.tipoId || null, nAguas: num(t.nAguas, 0), eave: [0, 1, 2, 3], gable: [], virtualDe: t.virtualDe || null, eixoA: "x", kA: 0, eixoD: [0, 0, 0, 0], beiralLat: [be[0], be[0]], lados: P.map(function (p, i) { return dst(p, P[(i + 1) % n]); }), contorno: P, furo: furos[0], centro: [r3(cx), r3(cz)],
      quadroTU: quadroTU, areaProjecao: num(t.areaProjecao, Math.abs(a2) / 2) };
  }
  function contornoDe(ar) { return ar.map(function (e) { return [e.parede.a.x, e.parede.a.z]; }); }
  /* O EIXO DAS PAREDES: o contorno do telhado pode estar na face EXTERNA da parede (telhado por paredes, pela edificação) e não no eixo. O motor de madeira trabalha entre
     EIXOS de parede (a grade de pilares/frechal) com o beiral medido do eixo: d[k] = quanto o eixo da parede está PARA DENTRO da aresta k do contorno (0 = o contorno é o eixo). */
  function eixoParedes(P, kA, H0, caixas) {
    var out = [0, 0, 0, 0], cx = 0, cz = 0, k;
    P.forEach(function (q) { cx += q[0] / P.length; cz += q[1] / P.length; });
    var pars = arr(caixas).filter(function (c) { return c && c.tipo === "parede" && num(c.cy, 0) + num(c.altura, 0) / 2 >= H0 - 0.6 && num(c.cy, 0) - num(c.altura, 0) / 2 < H0; });
    if (!pars.length) return out;
    for (k = 0; k < 4; k++) {
      var A = P[k], B = P[(k + 1) % 4], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0)) continue;
      var sx = dx / L, sz = dz / L, nx = -sz, nz = sx; if ((cx - A[0]) * nx + (cz - A[1]) * nz < 0) { nx = -nx; nz = -nz; }
      var offs = [], j, hit = 0;
      for (j = 1; j <= 9; j++) {
        var qx = A[0] + dx * j / 10, qz = A[1] + dz * j / 10, melhor = null;
        pars.forEach(function (c) {
          var th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th);
          if (Math.abs(sx * uz - sz * ux) > 0.05) return;                               /* só parede paralela à aresta */
          if (!naRet({ cx: num(c.cx, 0), cz: num(c.cz, 0), ux: ux, uz: uz, hx: num(c.comprimento, 0) / 2, hz: num(c.espessura, 0.15) / 2 }, qx, qz, 0.12)) return;
          var off = (num(c.cx, 0) - A[0]) * nx + (num(c.cz, 0) - A[1]) * nz;
          if (melhor == null || Math.abs(off) < Math.abs(melhor)) melhor = off;
        });
        if (melhor != null) { offs.push(melhor); hit++; }
      }
      if (hit >= 5) { offs.sort(function (a, b) { return a - b; }); var m = offs[Math.floor(offs.length / 2)]; m = Math.round(m * 1000) / 1000; out[k] = Math.abs(m) < 0.002 || m < -0.05 || m > 0.6 ? 0 : m; }
    }
    void kA; return out;
  }
  /* o telhado como o MOTOR o vê: dimensões e beirais ENTRE EIXOS de parede (identidade quando o contorno já é o eixo) */
  function axisLido(lido) {
    var d = lido.eixoD || [0, 0, 0, 0]; if (!d.some(function (x) { return Math.abs(x) > 1e-6; })) return lido;
    var o = ext({}, lido), kA = lido.kA, d1 = d[(kA + 1) % 4], d3 = d[(kA + 3) % 4], d0 = d[kA], d2 = d[(kA + 2) % 4];
    o.a = r3(lido.a - d1 - d3); o.b = r3(lido.b - d0 - d2);
    if (typeof lido.beiral === "number") { o.beiral = r3(lido.beiral + d[kA]); o.erroEixo = [0, 1, 2, 3].some(function (k) { return Math.abs(lido.beiral + d[k] - o.beiral) > 0.005; }) ? "As paredes do contorno têm espessuras/posições diferentes: o beiral entre eixos não é igual nos 4 lados (as 4 águas exigem o mesmo beiral)." : null; }
    else o.beiral = { eave: lido.beiral.eave.map(function (v, i) { return r3(v + d[lido.eave[i]]); }), gable: lido.beiral.gable.map(function (v, i) { return r3(v + d[lido.gable[i]]); }), todos: lido.beiral.todos.map(function (v, i) { return r3(v + d[i]); }) };
    return o;
  }
  function achar(estado, id) { var l = arr(estado && estado.telhados); for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(id)) return l[i]; return null; }

  function lerTelhado(estado, id) { return lerTelhadoObj(achar(estado, id), id, estado && estado.caixas); }
  /* o MESMO leitor sobre o objeto do telhado (o js/bimtelhadoestrut.js lê o telhado dele sem ter o estado inteiro) */
  function lerTelhadoObj(t, id, caixas) {
    if (!t) return { ok: false, motivo: "O telhado " + id + " não existe no modelo." };
    if (!t.ok) return { ok: false, motivo: "O telhado " + id + " não fechou a geometria (veja os avisos do telhado)." };
    if (t.modo === "extrusao") {
      var BTv = BT(), tv = BTv && BTv.perimetroVirtual ? BTv.perimetroVirtual(t) : null;
      if (!tv) return { ok: false, motivo: "O telhado por extrusão só ganha a madeira calculada quando o perfil é SIMÉTRICO de 2 águas (3 pontos: beiral, cumeeira no meio, beiral na mesma cota) sobre retângulo. Perfil assimétrico, curvo ou com mais pontos: use o telhado por contorno." };
      t = tv;   /* a estrutura é derivada do perímetro virtual; o telhado do usuário continua do tipo perfil */
    }
    var ar = arr(t.arestasCalc), n = ar.length, norm = null;
    var furosT = BT() && BT().furosDe ? BT().furosDe(t) : [];
    if (furosT.length) { if (n > 4) { norm = normalizarArestas(ar); if (norm.mudou) { ar = norm.ar; n = ar.length; } } return lerAnel(t, id, ar, furosT); }
    if (n > 4) { norm = normalizarArestas(ar); if (norm.mudou) { ar = norm.ar; n = ar.length; } }   /* o cálculo usa o contorno LIMPO; o desenho do telhado não muda */
    if (n === 6 || n === 8) { var l4 = lerPoligonal(t, id, ar, n); if (l4) return l4; }
    if (n === 6) { var lL = lerL(t, id, ar); if (lL) return lL; }
    if (n === 8) { var lTU = lerTU(t, id, ar); if (lTU) return lTU; }
    if (n !== 4) {
      var Pn = ar.map(function (e) { return [e.parede.a.x, e.parede.a.z]; }), forma = descreverForma(Pn), lim = norm && norm.mudou ? " (já limpo: eram " + arr(t.arestasCalc).length + " lados; saíram " + norm.info.removidos.duplicados + " repetido(s), " + norm.info.removidos.colineares + " alinhado(s) e " + norm.info.removidos.dentes + " dente(s) < 10 cm)" : "";
      return { ok: false, forma: forma, nLados: n, vertices: vertsProblema(Pn), contornoCalculo: Pn, motivo: "A delimitação tem " + n + " lados" + lim + "; forma detectada: " + forma + ". Lados: " + ladosTxt(Pn) + ". Vértices (x; z em m): " + coordsTxt(Pn) + ". O módulo Madeira calcula cobertura RETANGULAR de 1, 2 ou 4 águas. Só são calculados o retângulo (1, 2 ou 4 águas), a planta em L ORTOGONAL de 6 lados, o T e o U ORTOGONAIS de 8 lados (4 águas, com rincão em cada canto côncavo) e o sextavado/oitavado regulares; outras plantas (pátio, cruz, E, poligonal irregular) precisam de tesouras de canto que ainda não são calculadas — desenhe a cobertura em retângulos separados (Unir telhado) ou use o modelo de madeira sem cálculo." };
    }
    var L = [], k;
    for (k = 0; k < 4; k++) L.push(distP(ar[k].parede.a, ar[k].parede.b));
    var ortog = true;
    for (k = 0; k < 4; k++) {
      var a = ar[k].parede, b = ar[(k + 1) % 4].parede, ux = (a.b.x - a.a.x) / (L[k] || 1), uz = (a.b.z - a.a.z) / (L[k] || 1), vx = (b.b.x - b.a.x) / (L[(k + 1) % 4] || 1), vz = (b.b.z - b.a.z) / (L[(k + 1) % 4] || 1);
      if (Math.abs(ux * vx + uz * vz) > 0.02) ortog = false;
    }
    if (!ortog || Math.abs(L[0] - L[2]) > 0.03 || Math.abs(L[1] - L[3]) > 0.03) return { ok: false, motivo: "A delimitação não é um retângulo (lados " + L.map(function (x) { return virg(x); }).join(" × ") + " m): o módulo Madeira calcula só retângulo. Ajuste o contorno." };
    var def = [], inc = [];
    ar.forEach(function (e, i) { if (e.define) { def.push(i); inc.push(num(e.inclinacao, 0)); } });
    var incl = inc.length ? inc[0] : 0;
    if (inc.some(function (x) { return Math.abs(x - incl) > 0.01; })) return { ok: false, motivo: "As águas têm inclinações diferentes (" + inc.map(function (x) { return virg(x, 1) + " %"; }).join(", ") + "): o módulo Madeira calcula inclinação única. Use a mesma inclinação nas arestas." };
    if (!(incl >= 5)) return { ok: false, motivo: "Inclinação de " + virg(incl, 1) + " %: o módulo exige no mínimo 5 % (telha)." };
    var tipo, a0, b0, eave = [], gable = [], kA = 0;
    if (def.length === 4) { tipo = "T3"; a0 = Math.max(L[0], L[1]); b0 = Math.min(L[0], L[1]); eave = [0, 1, 2, 3]; kA = L[0] >= L[1] ? 0 : 1; }
    else if (def.length === 2 && def[1] - def[0] === 2) {
      tipo = "T2"; eave = def.slice(); gable = [(def[0] + 1) % 4, (def[0] + 3) % 4]; kA = def[0];
      a0 = L[def[0]]; b0 = L[(def[0] + 1) % 4];
      if (a0 < b0 - 1e-6) return { ok: false, motivo: "Duas águas com a cumeeira no lado MENOR (cumeeira " + virg(a0) + " m, vão " + virg(b0) + " m): o módulo exige a cumeeira no lado maior. Gire o caimento (arestas que definem a inclinação nos lados maiores)." };
    } else if (def.length === 1) { tipo = "T1"; eave = def.slice(); a0 = L[def[0]]; b0 = L[(def[0] + 1) % 4]; kA = def[0]; }
    else return { ok: false, motivo: "As águas definidas (" + def.length + " arestas" + (def.length === 2 ? " adjacentes" : "") + ") não formam 1 água, 2 águas (lados opostos) nem 4 águas: o módulo Madeira não calcula esta forma (meia-água de canto, 3 águas)." };
    var be = ar.map(function (e) { return num(e.beiralM, num(t.beiral, 0)); });
    var beiral;
    if (tipo === "T3") {
      if (be.some(function (x) { return Math.abs(x - be[0]) > 0.005; })) return { ok: false, motivo: "O beiral é diferente entre os lados (" + be.map(function (x) { return virg(x); }).join("; ") + " m): o espigão a 45° das 4 águas exige o MESMO beiral nos 4 lados." };
      beiral = be[0];
    } else beiral = { eave: eave.map(function (i) { return be[i]; }), gable: gable.map(function (i) { return be[i]; }), todos: be };
    if (tipo === "T3" && a0 - b0 > 1e-6 && a0 - b0 < 0.5) return { ok: false, motivo: "A diferença entre os lados é " + virg(a0 - b0) + " m (entre 0 e 0,5 m): use planta quadrada (pirâmide) ou afaste os lados em pelo menos 0,5 m." };
    if (b0 < 3 && tipo !== "T1") return { ok: false, motivo: "Vão de " + virg(b0) + " m: o módulo calcula vão mínimo de 3 m." };
    var eA = ar[kA].parede, eixoA = Math.abs(eA.b.x - eA.a.x) >= Math.abs(eA.b.z - eA.a.z) ? "x" : "z";
    var kE = eave.length ? eave[0] : 0, bLat = [be[(kE + 1) % 4], be[(kE + 3) % 4]];
    var BTm = BT(), tel = BTm && BTm.telha ? BTm.telha(t.tipoId) : null;
    var baseZ = num(t.elevNivel, 0), pe = num(t.deslocBaseEf, num(t.cotaApoio, 0) - baseZ);
    return { ok: true, id: String(id), t: t, tipo: tipo, a: r3(a0), b: r3(b0), incl: incl, beiral: beiral, baseZ: baseZ, peDireito: pe, cotaApoio: num(t.cotaApoio, 0), cotaCumeeira: num(t.cotaCumeeira, num(t.cotaApoio, 0)),
      telha: tel, tipoId: t.tipoId || null, nAguas: num(t.nAguas, 0), eave: eave, gable: gable, virtualDe: t.virtualDe || null, eixoA: eixoA, kA: kA, eixoD: caixas ? eixoParedes(contornoDe(ar), kA, num(t.cotaApoio, 0), caixas) : [0, 0, 0, 0], beiralLat: bLat, lados: L, contorno: ar.map(function (e) { return [e.parede.a.x, e.parede.a.z]; }), areaProjecao: num(t.areaProjecao, a0 * b0) };
  }

  /* ======================================================================
   * 2) O APOIO NO MODELO — laje, paredes ou pilares (o usuário só sobrescreve)
   * ====================================================================== */
  function topoDe(c) { return num(c.cy, 0) + num(c.altura, 0) / 2; }
  function baseDe(c) { return num(c.cy, 0) - num(c.altura, 0) / 2; }
  function paredeRet(c) { var th = num(c.rotY, 0); return { cx: num(c.cx, 0), cz: num(c.cz, 0), ux: Math.cos(th), uz: -Math.sin(th), hx: num(c.comprimento, 0) / 2, hz: num(c.espessura, 0.15) / 2 }; }
  function naRet(r, x, z, tol) { var rx = x - r.cx, rz = z - r.cz, lx = rx * r.ux + rz * r.uz, lz = -rx * r.uz + rz * r.ux; return Math.abs(lx) <= r.hx + tol && Math.abs(lz) <= r.hz + tol; }
  function amostrasPlano(P, passo) {
    var xs = P.map(function (q) { return q[0]; }), zs = P.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs), out = [], x, z;
    for (x = x0 + passo / 2; x < x1; x += passo) for (z = z0 + passo / 2; z < z1; z += passo) if (dentro([x, z], P)) out.push([x, z]);
    return out;
  }
  function polyDe(c) {
    if (arr(c.contorno).length >= 3) return c.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; });
    var cx = num(c.cx, 0), cz = num(c.cz, 0), hx = num(c.comprimento, 0) / 2, hz = num(c.largura != null ? c.largura : c.profundidade, num(c.espessura, 0)) / 2, th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th);
    return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(function (q) { return [cx + q[0] * ux - q[1] * uz, cz + q[0] * uz + q[1] * ux]; });
  }

  function detectarApoio(estado, lido, cfg) {
    cfg = cfg || {};
    var P = lido.contorno, H0 = lido.cotaApoio, caixas = arr(estado && estado.caixas), r = { lajes: [], paredes: [], pilares: [], coberturaLaje: 0, coberturaParede: 0 };
    /* laje: topo perto da cota de apoio e cobrindo boa parte da planta */
    var am = amostrasPlano(P, 0.5), lajes = caixas.filter(function (c) { return c && c.tipo === "laje" && Math.abs(topoDe(c) - H0) <= 0.35; });
    if (lajes.length && am.length) {
      var polis = lajes.map(polyDe), cob = 0;
      am.forEach(function (p) { if (polis.some(function (q) { return dentro(p, q); })) cob++; });
      r.coberturaLaje = cob / am.length; if (r.coberturaLaje > 0) lajes.forEach(function (c) { r.lajes.push(String(c.id)); });
    }
    /* paredes: ao longo do contorno (perímetro coberto por parede que sobe até a cota de apoio) */
    var pars = caixas.filter(function (c) { return c && c.tipo === "parede" && topoDe(c) >= H0 - 0.6 && baseDe(c) < H0; }), tot = 0, cobP = 0, k;
    for (k = 0; k < P.length; k++) {
      var A = P[k], B = P[(k + 1) % P.length], L = Math.sqrt(Math.pow(B[0] - A[0], 2) + Math.pow(B[1] - A[1], 2)), ns = Math.max(2, Math.ceil(L / 0.25)), j;
      for (j = 0; j < ns; j++) { var u = (j + 0.5) / ns, x = A[0] + (B[0] - A[0]) * u, z = A[1] + (B[1] - A[1]) * u; tot++; if (pars.some(function (c) { return naRet(paredeRet(c), x, z, 0.12); })) cobP++; }
    }
    r.coberturaParede = tot ? cobP / tot : 0;
    pars.forEach(function (c) { r.paredes.push(String(c.id)); });
    r.rets = pars.map(paredeRet);   /* os retângulos das paredes (só para o motor: onde há parede, o frechal assenta nela e não se cria pilar) */
    /* pilares do modelo dentro do contorno (aparente) */
    caixas.forEach(function (c) {
      if (!c || c.tipo !== "pilar" || !(topoDe(c) >= H0 - 3.0 && topoDe(c) <= H0 + 0.05)) return;
      var q = [num(c.cx, 0), num(c.cz, 0)], tol = Math.max(0.3, num(c.comprimento, 0.2) / 2 + 0.1);   /* pilar na BORDA (sobre a linha do contorno) também é apoio: tolerância de distância ao polígono */
      if (!dentroTol(q, P, tol)) return;
      var mt = String(c.material || c.mat || (c.cob && c.cob.material) || c.materialNome || "").toLowerCase();
      r.pilares.push({ id: String(c.id), x: r4(q[0]), z: r4(q[1]), madeira: /madeira|mlc|wood|pinus|eucalipto|nibra/.test(mt), circ: c.forma === "circular" || c.secaoForma === "circular" || fin(Number(c.diametro)), d: fin(Number(c.diametro)) ? Number(c.diametro) : num(c.comprimento, 0.2), b: num(c.comprimento, 0.2), h: num(c.espessura, num(c.comprimento, 0.2)), mat: mt, topo: r3(topoDe(c)) });
    });
    var pontos = arr(cfg.pontos).filter(function (q) { return q && fin(Number(q.x)) && fin(Number(q.z)); }).map(function (q) { return { x: r4(Number(q.x)), z: r4(Number(q.z)) }; });
    var tipo = cfg.apoio === "laje" || cfg.apoio === "paredes" || cfg.apoio === "pilares" ? cfg.apoio : null, auto = !tipo;
    if (!tipo) {
      if (pontos.length >= 2) tipo = "pilares";
      else if (r.coberturaLaje >= 0.6) tipo = "laje";
      else if (r.coberturaParede >= 0.85) tipo = "paredes";
      else if (r.pilares.length >= 2) tipo = "pilares";
    }
    r.tipo = tipo; r.automatico = auto; r.pontosMarcados = pontos;
    r.pontos = tipo === "pilares" ? (pontos.length ? pontos : r.pilares.map(function (q) { return { x: q.x, z: q.z }; })) : [];
    if (!tipo) r.motivo = "Não achei apoio sob a cobertura: lance paredes no contorno, uma laje na cota de apoio ou pilares (ou marque os pontos de apoio).";
    else if (tipo === "laje" && r.coberturaLaje < 0.6) r.aviso = "Apoio \"laje\" escolhido à mão, mas a laje cobre só " + Math.round(r.coberturaLaje * 100) + " % da planta.";
    else if (tipo === "paredes" && r.coberturaParede < 0.85) r.aviso = "Apoio \"paredes\" escolhido à mão, mas as paredes cobrem só " + Math.round(r.coberturaParede * 100) + " % do contorno.";
    else if (tipo === "pilares" && r.pontos.length < 2) r.aviso = "Apoio \"pilares\" pede ao menos 2 pilares ou pontos marcados.";
    return r;
  }

  /* ======================================================================
   * 3) O MODELO DE MADEIRA E OS PESOS — pela telha, sem digitar nada
   * ====================================================================== */
  function modeloMadeira(sistema, lido) {
    var fam = lido.telha ? lido.telha.familia : "generico", tesoura = sistema === "tesoura", direta = fam === "fibrocimento" || fam === "sanduiche" || fam === "metalica";
    if (sistema === "vigas") return direta ? "mad-viga" : "mad-viga-cr";
    if (tesoura) { if (fam === "fibrocimento" || fam === "sanduiche" || fam === "metalica") return "mad-tesoura-terca"; if (fam === "ecologica") return "mad-onduline"; if (fam === "shingle") return "mad-shingle"; return "mad-tesoura"; }
    return fam === "fibrocimento" || fam === "sanduiche" || fam === "metalica" ? "mad-terca-direta" : "mad-terca";
  }
  /* o que a telha pede (galga → ripa; caibro; terça pelo vão) — a MESMA regra do modelar() do js/bimtelhadoestrut.js */
  function trama(lido, modelo) {
    var E = ES(), M = E && E.MODELOS ? E.MODELOS[modelo] : null, tel = lido.telha, vaoTel = tel && fin(tel.vaoMaxEntreApoios) ? tel.vaoMaxEntreApoios : null, espT;
    if (!M) return null;
    if (!M.caibro) espT = vaoTel != null ? vaoTel : 1.5;
    else if (tel && fin(tel.tercaMaxM)) espT = tel.tercaMaxM; else espT = E.ESPAC.terca.m;
    var espCb = tel && fin(tel.caibroM) ? tel.caibroM : E.ESPAC.caibro.m, galga = tel && tel.galga && fin(tel.galga.m) ? tel.galga.m : null;
    return { M: M, caibro: !!M.caibro, ripa: !!M.ripa, espTerca: espT, espCaibro: espCb, galga: galga, secRipa: tel && tel.ripaSecao ? tel.ripaSecao : E.SEC.ripa, secCaibro: E.SEC.caibro };
  }
  function pesos(lido, tr) {
    var tel = lido.telha, fam = tel ? tel.familia : "generico", partes = [], gt, fontes = [];
    if (tel && fin(tel.pesoKgM2)) { gt = tel.pesoKgM2 * 0.00980665; fontes.push("telha " + virg(tel.pesoKgM2, 2) + " kg/m² do catálogo (" + (tel.pesoFonte || "fabricante") + ")"); }
    else { gt = PESO_PARTIDA[fam] != null ? PESO_PARTIDA[fam] : PESO_PARTIDA.outra; fontes.push("peso da telha NÃO verificado no catálogo: valor de partida do motor " + virg(gt, 2) + " kN/m² (conferir com o fabricante)"); }
    var gtr = 0;
    /* peso de partida do motor para cerâmica já embute as ripas ("telha cerâmica com ripas"): não soma a trama de novo */
    var embute = !(tel && fin(tel.pesoKgM2)) && (fam === "ceramica" || fam === "concreto" || fam === "generico");
    if (tr && !embute) {
      if (tr.ripa && tr.galga) { gtr += tr.secRipa.b * tr.secRipa.h / tr.galga * G_MAD; partes.push("ripas"); }
      if (tr.caibro) { gtr += tr.secCaibro.b * tr.secCaibro.h / tr.espCaibro * G_MAD; partes.push("caibros"); }
      if (partes.length) fontes.push((partes.join(" e ")) + " do modelo (" + virg(G_MAD, 1) + " kN/m³)");
    } else if (embute) fontes.push("ripas e caibros já incluídos no valor de partida da telha cerâmica");
    return { telha: r4(gt), trama: r4(gtr), total: r4(gt + gtr), fontes: fontes };
  }

  /* ======================================================================
   * 4) O LAÇO DE TERÇAS E CAIBROS (laje, pilares, 1 água) — propõe → calcula → ajusta
   * ====================================================================== */
  function perfilVigas(obra) {
    var m = MM(); if (!m) throw new Error("madmateriais.js não carregou");
    var o = obra || {};
    return m.perfil2022({ carregamento: "longa", umidade: num(o.umidade, 3), produto: "serrada", betaC: 0.1, limVao: 300, limBalanco: 150 });
  }
  function perfilCurta(obra) { var o = obra || {}; return MM().perfil2022({ carregamento: "curta", umidade: num(o.umidade, 3), produto: "serrada", betaC: 0.1, limVao: 300, limBalanco: 150 }); }
  var GRADE_PONTALETE = [0.08, 0.10, 0.12, 0.14, 0.16, 0.20], GRADE_PONTALETE_CIRC = [0.08, 0.10, 0.12, 0.14, 0.16, 0.20, 0.25, 0.30];

  /* O VENTO NA COBERTURA (NBR 6123 pelo AcoVento, o mesmo das tipologias): a pior sucção e a pior pressão líquidas (kN/m²) entre todos os casos e zonas.
     Premissa herdada do T3: campo de pressões da Tabela 5 (duas águas) — para 4 águas e 1 água a norma NÃO traz coeficientes: vira motivo de PRELIMINAR. */
  function ventoDe(lido, obra) {
    var VE = dep("AcoVento", "./acovento.js"), EnM = EN(), ob = ext({}, EnM ? EnM.estadoPadrao().obra : {}, clone(obra || {}));
    if (!VE) return { ok: false, motivo: "o motor de vento (js/acovento.js) não carregou" };
    if (ob.lat == null || ob.lon == null) return { ok: false, motivo: "falta a localização da obra (cidade ou coordenadas) para achar o V0 da NBR 6123" };
    var th = Math.atan(lido.incl / 100) * 180 / Math.PI, geo = { a: lido.a, b: lido.b, h: Math.max(lido.peDireito, 1.2), hCumeeira: Math.max(lido.cotaCumeeira - lido.baseZ, lido.peDireito + 0.1), inclinacaoGraus: th, cobertura: lido.tipo === "T1" ? "uma-agua" : "duas-aguas", nervuras: "retangulares" };
    if (lido.tipo === "T1") geo.ladoAlto = "esquerda";
    var ent = { local: { lat: num(ob.lat, null), lon: num(ob.lon, null), descricao: ob.local || "" }, s1: { tipo: ob.s1tipo === "plano" ? "plano" : ob.s1tipo, valor: num(ob.s1, 1) }, categoria: ob.categoria, grupoS3: num(ob.grupoS3, 2), geometria: geo, faces: clone(ob.faces) };
    var r; try { r = VE.calcular(ent, { todasDirecoes: true, obliquos: false, aberturaDominantePropria: true /* AUDITORIA A1: madeira trata a abertura dominante à parte (pendência) */ }); } catch (e) { return { ok: false, motivo: "vento: " + (e && e.message ? e.message : e) }; }
    if (!r || !r.ok) return { ok: false, motivo: "vento: " + JSON.stringify(r && r.erros || "sem resultado").slice(0, 160) };
    var pmin = 0, pmax = 0; arr(r.casos).forEach(function (c) { arr(c.pressao && c.pressao.cobertura).forEach(function (z) { if (fin(z.p)) { if (z.p < pmin) pmin = z.p; if (z.p > pmax) pmax = z.p; } }); });
    return { ok: true, pmin: r4(pmin), pmax: r4(pmax), q: r4(num(r.q, 0)), v0: r.v0, premissa: lido.tipo === "T2" ? null : "vento: a NBR 6123 não traz coeficientes de cobertura para " + ((lido.tipo === "T3" || lido.tipo === "T3L" || lido.tipo === "T3TU") ? "4 águas" : "1 água") + " — campo de pressões de 2 águas (Tabela 5) adotado como premissa; confirmar com o RT",
      texto: "NBR 6123 (AcoVento), campo de pressões da cobertura de duas águas (Tabela 5) — sucção máxima " + virg(-pmin, 3) + " kN/m², pressão máxima " + virg(pmax, 3) + " kN/m², V0 " + virg(r.v0, 0) + " m/s" };
  }

  function maxReacao(r, gam) { var m = 0, k; for (k in r.reacoes) { var v = gam * (r.reacoes[k][0] + r.reacoes[k][1]); if (v > m) m = v; } return m; }
  function minReacao(r, gam) { var m = Infinity, k; for (k in r.reacoes) { var v = gam * (r.reacoes[k][0] + r.reacoes[k][1]); if (v < m) m = v; } return m; }

  /* peça CONTÍNUA sobre `apoios` (m, a partir da ponta; o que passa do último apoio é BALANÇO verificado com limBalanco) sob gravidade + sobrecarga (+ 1 kN concentrado no meio do maior vão e na ponta do balanço)
     + FLEXÃO OBLÍQUA (componente paralela ao plano da água, σx/f + km·σy/f nos dois eixos, sem contar o caibro como travamento) + VENTO de pressão e SUCÇÃO (peso favorável × 1,0).
     o = { b, h, L (comprimento total), apoios[], trib, gArea, extraLinear, q, cosT, sinT, classe, perfilL, perfilC, vento, conc, oblq } → { eta, ok, Rcomp, Rup, parte } */
  function verFlex(o) {
    var D = MD(), L = o.L, ap = o.apoios, c = o.cosT, sn = o.sinT;
    if (!ap || ap.length < 2) return { eta: Infinity, ok: false, Rcomp: 0, Rup: 0, parte: {}, motivo: "apenas " + (ap ? ap.length : 0) + " linha(s) de apoio: com menos de 2 apoios a peça não fica estável nem se verifica" };
    var gv = o.gArea * o.trib + G_MAD * o.b * o.h + (o.extraLinear || 0), qv = o.q * o.trib * c, gN = gv * c, qN = qv * c, gP = gv * sn, qP = qv * sn;
    function vf(gd, qd, qp, perfil, b, h) { return D.vigaFletida({ L: L, apoios: ap, G: { d: [[0, L, gd]] }, Q: { d: qd ? [[0, L, qd]] : [], p: qp || [] }, b: b, h: h, classe: o.classe, perfil: perfil }); }
    var r1 = vf(gN, qN, null, o.perfilL, o.b, o.h), eta = r1.eta, parte = { gravidade: r1.eta, flexao: r1.eta_flexao, cisalhamento: r1.eta_cisalh, flecha: r1.eta_flecha }, Rcomp = maxReacao(r1, o.perfilL.gamaQ || 1.4), Rup = 0;
    if (eta > 1 + 1e-9) return { eta: eta, ok: false, Rcomp: Rcomp, Rup: 0, parte: parte };   /* já reprovou na gravidade: não gasta as outras combinações */
    if (o.conc) {
      var pos = ap.slice().sort(function (x, y) { return x - y; }), gm = 0, xm = L / 2, i;
      for (i = 0; i + 1 < pos.length; i++) if (pos[i + 1] - pos[i] > gm) { gm = pos[i + 1] - pos[i]; xm = (pos[i + 1] + pos[i]) / 2; }
      var rc = vf(gN, 0, [[xm, 1.0 * c]], o.perfilL, o.b, o.h), eta2 = rc.eta, bal = L - pos[pos.length - 1];
      if (bal > 0.05) { var rb = vf(gN, 0, [[L, 1.0 * c]], o.perfilL, o.b, o.h); eta2 = Math.max(eta2, rb.eta); parte.balanco = r3(bal); }
      parte.concentrada = eta2; eta = Math.max(eta, eta2);
    }
    if (o.oblq) {
      var ry = vf(gP, qP, null, o.perfilL, o.h, o.b), ex = r1.eta_flexao, ey = ry.eta_flexao, km = o.perfilL.kM != null ? o.perfilL.kM : 0.7, ob = Math.max(ex + km * ey, km * ex + ey);
      parte.oblíqua = ob; eta = Math.max(eta, ob);
    }
    if (o.vento) {
      if (o.vento.pmax > 0) { var rp = vf(gN, o.vento.pmax * o.trib, null, o.perfilC, o.b, o.h); parte.ventoPressao = rp.eta; eta = Math.max(eta, rp.eta); }
      if (o.vento.pmin < 0) {
        var rs = vf(gN / 1.4, o.vento.pmin * o.trib, null, o.perfilC, o.b, o.h); parte.ventoSuccao = rs.eta; eta = Math.max(eta, rs.eta);
        var mn = minReacao(rs, 1.4); if (mn < 0) Rup = -mn;
      }
    }
    return { eta: eta, ok: eta <= 1 + 1e-9, Rcomp: Rcomp, Rup: Rup, parte: parte };
  }
  /* o pontalete: compressão + flambagem (NBR 7190-1:2022, 6.5.3–6.5.5), L0 = H (rotulado nas duas pontas, travado por mão-francesa nas duas direções — peças no modelo); circular pelo circular2022 */
  function verPontalete(N, H, classe, perfil, circ, secaoDada) {
    var D = MD(), grade = secaoDada ? [secaoDada] : (circ ? GRADE_PONTALETE_CIRC : GRADE_PONTALETE), i;
    for (i = 0; i < grade.length; i++) {
      var s = grade[i], d = secaoDada ? secaoDada : s, r;
      if (circ) r = D.circular2022({ N: -N, d: d, L0: Math.max(H, 0.1), classe: classe, perfil: perfil });
      else r = D.compressao2022({ N: N, Mx: 0, My: 0, b: d, h: d, L0x: Math.max(H, 0.1), L0y: Math.max(H, 0.1), classe: classe, perfil: perfil });
      if (r.ok) return { ok: true, b: d, h: d, eta: r3(r.eta), N: r3(N), H: r3(H), circ: !!circ, lambda: r3(Array.isArray(r.lambda) ? Math.max(r.lambda[0], r.lambda[1]) : r.lambda) };
    }
    return { ok: false, N: r3(N), H: r3(H), circ: !!circ, motivo: secaoDada ? "o pilar/pontalete de " + virg(secaoDada * 100, 0) + " cm NÃO fecha à compressão e flambagem com N = " + virg(N, 1) + " kN e H = " + virg(H, 2) + " m" : "nenhum pontalete até " + virg(grade[grade.length - 1] * 100, 0) + " cm fecha à compressão e flambagem (N = " + virg(N, 1) + " kN, H = " + virg(H, 2) + " m)" };
  }
  /* ligação de arrancamento no apoio: pinos axiais da madeira (js/madligacoes.js, o mesmo das tipologias) para a força R de cálculo */
  function ligarArrancamento(R, b, h, classe, obra, nome) {
    if (!(R > 0)) return { ok: true, F: 0, n: 0, texto: nome + ": sem arrancamento líquido (o peso próprio vence a sucção)" };
    var ML = dep("MadLig", "./madligacoes.js"), MMa = MM(); if (!ML || !ML.pinosAxiais) return { ok: false, F: r3(R), texto: nome + ": o motor de ligações não carregou" };
    var pc = perfilCurta(obra), cl = MMa.classe2022(classe), c = ML.cfg({ kmod: pc.kmod, kmod1: pc.kmod1, kmod2: pc.kmod2, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" });
    var pn; try { pn = ML.pinosAxiais(c, nome, R, 0.001, b, h, 0.008, {}); } catch (e) { pn = null; }
    var ok = !!(pn && pn.ok);
    return { ok: ok, F: r3(R), n: pn && pn.n ? pn.n : 0, d: pn && pn.d ? pn.d : 0, texto: nome + ": Fd = " + virg(R, 2) + " kN → " + (ok ? pn.n + " pinos Ø" + Math.round((pn.d || 0) * 1000) + " mm com chapa de 8 mm (madligacoes)" : "NÃO fecha com os pinos da biblioteca (aumente a seção ou a chapa)") };
  }
  function menorSecao(grade, fn) { for (var i = 0; i < grade.length; i++) { var r = fn(grade[i]); if (r.ok) return { sec: grade[i], r: r }; } return null; }

  /* ctx = { incl%, esp (terça), tr, p, obra, classe, apoio, ex (eixoTd), bl, br, vaos | lines | paredes, pontaleteH, viga?, vento?, cb? (apoios do caibro), pilares? } */
  function lacoVigas(ctx) {
    var MV = dep("MadViga", "./madviga.js"), passo0 = MV ? MV.passo : undefined;
    if (MV) MV.passo = 0.1;   /* malha de 10 cm: a viga contínua de 11 m com dezenas de seções em milissegundos (a de 3 cm leva minutos) */
    try { return lacoVigas0(ctx); } finally { if (MV) MV.passo = passo0; }
  }
  function lacoVigas0(ctx) {
    var C = CA(), theta = Math.atan(ctx.incl / 100), cosT = Math.cos(theta), sinT = Math.sin(theta), sc = C.sobrecargaCobertura(ctx.incl, {});
    if (!sc.ok) return { ok: false, motivo: sc.motivo };
    var perfL = perfilVigas(ctx.obra), perfC = perfilCurta(ctx.obra), classe = ctx.classe || CLASSE_PADRAO, hist = [], melhor = null, vento = ctx.vento && ctx.vento.ok ? ctx.vento : null, ex = ctx.ex;
    var g = ctx.p.total, gCaibro = ctx.p.telha + (ctx.p.trama - (ctx.tr.caibro ? ctx.tr.secCaibro.b * ctx.tr.secCaibro.h / ctx.tr.espCaibro * G_MAD : 0));
    var start = ex.lo - ctx.bl, Ltot = (ex.hi + ctx.br) - start, cand;
    function apoiosDe(vao) {
      if (ctx.apoio === "laje") { var n = Math.max(1, Math.ceil((ex.hi - ex.lo) / vao - 1e-9)), a = [], k; for (k = 0; k <= n; k++) a.push(ex.lo + k * (ex.hi - ex.lo) / n); return a.map(function (t) { return r4(t - start); }); }
      if (ctx.apoio === "pilares") return arr(ctx.lines).map(function (t) { return r4(t - start); });
      return [r4(ex.lo - start), r4(ex.hi - start)];   /* paredes (1 água): os frechais das duas pontas; o beiral é balanço */
    }
    cand = ctx.apoio === "laje" ? ctx.vaos : [0];
    function terca(sec, ap) { return verFlex({ b: sec.b, h: sec.h, L: Ltot, apoios: ap, trib: ctx.esp, gArea: g, q: sc.q, cosT: cosT, sinT: sinT, classe: classe, perfilL: perfL, perfilC: perfC, vento: vento, conc: true, oblq: true }); }
    cand.forEach(function (vao) {
      var ap = apoiosDe(vao), s = menorSecao(GRADE_TERCA, function (sec) { return terca(sec, ap); }), custo = null;
      if (s) { custo = s.sec.b * s.sec.h / ctx.esp; if (ctx.apoio === "laje") custo += 0.08 * 0.08 * Math.max(0.2, ctx.pontaleteH || 0.5) / (vao * ctx.esp); }
      hist.push({ vao: ctx.apoio === "laje" ? vao : null, apoios: ap.length, secao: s ? s.sec : null, eta: s ? r3(s.r.eta) : null, custoM3porM2: custo != null ? r4(custo) : null });
      if (s && (!melhor || custo < melhor.custo - 1e-9)) melhor = { vao: vao, ap: ap, sec: s.sec, r: s.r, custo: custo };
    });
    var gt = GRADE_TERCA[GRADE_TERCA.length - 1], ap1 = apoiosDe(cand[0]);
    if (!melhor) return { ok: false, semSolucao: true, historico: hist, motivo: ap1.length < 2 ? "Só " + ap1.length + " linha de apoio real (pilar, ponto, parede ou laje) sob a cobertura: com menos de 2 apoios a terça não fica estável. Acrescente pilares ou pontos de apoio." : "Nenhuma terça até " + virg(gt.b * 100, 0) + "×" + virg(gt.h * 100, 0) + " cm fecha (gravidade, flexão oblíqua" + (vento ? ", vento" : "") + ") com " + ap1.length + " apoios e balanço de " + virg(ctx.bl, 2) + "/" + virg(ctx.br, 2) + " m. Aumente os apoios ou use tesouras." };
    var balT = Math.max(melhor.ap[0], Ltot - melhor.ap[melhor.ap.length - 1]), P = melhor.r.parte;
    var out = { ok: true, historico: hist, terca: { b: melhor.sec.b, h: melhor.sec.h, vao: melhor.vao, apoios: melhor.ap.length, balanco: r3(Math.max(melhor.ap[0], Ltot - melhor.ap[melhor.ap.length - 1])), eta: r3(melhor.r.eta), etaFlexao: r3(P.flexao), etaCisalh: r3(P.cisalhamento), etaFlecha: r3(P.flecha), etaConcentrada: r3(P.concentrada),
      etaObliqua: P.oblíqua != null ? r3(P.oblíqua) : null, etaVentoSuccao: P.ventoSuccao != null ? r3(P.ventoSuccao) : null, etaVentoPressao: P.ventoPressao != null ? r3(P.ventoPressao) : null },
      sobrecarga: { q: sc.q, texto: sc.texto }, classe: classe, perfil: perfL.nome, avisos: arr(sc.avisos).slice(), ligacoes: [], vento: vento ? { pmin: vento.pmin, pmax: vento.pmax, v0: vento.v0, texto: vento.texto, premissa: vento.premissa } : null, balancoTerca: r3(balT) };
    out.ligacoes.push(ligarArrancamento(melhor.r.Rup, melhor.sec.b, melhor.sec.h, classe, ctx.obra, "terça × apoio (arrancamento)"));
    var Nped = melhor.r.Rcomp;   /* o que o pontalete sob a terça recebe (kN, de cálculo) */
    if (ctx.viga) {   /* telhado aparente: a viga sobre os pilares, no sentido do caimento, recebe as terças (faixa de influência = a das linhas) */
      var vg = menorSecao(GRADE_VIGA, function (sec) { return verFlex({ b: sec.b, h: sec.h, L: ctx.viga.L, apoios: ctx.viga.apoios, trib: ctx.viga.trib, gArea: g, extraLinear: G_MAD * melhor.sec.b * melhor.sec.h * ctx.viga.trib / ctx.esp, q: sc.q, cosT: cosT, sinT: sinT, classe: classe, perfilL: perfL, perfilC: perfC, vento: vento, conc: false, oblq: false }); });
      if (vg) { out.viga = { b: vg.sec.b, h: vg.sec.h, vao: r3(ctx.viga.L), apoios: ctx.viga.apoios.length, trib: r3(ctx.viga.trib), eta: r3(vg.r.eta) }; out.ligacoes.push(ligarArrancamento(vg.r.Rup, vg.sec.b, vg.sec.h, classe, ctx.obra, "viga × pilar (arrancamento)")); Nped = 2 * vg.r.Rcomp; }
      else { var v0 = verFlex({ b: GRADE_VIGA[0].b, h: GRADE_VIGA[0].h, L: ctx.viga.L, apoios: ctx.viga.apoios, trib: ctx.viga.trib, gArea: g, q: sc.q, cosT: cosT, sinT: sinT, classe: classe, perfilL: perfL, perfilC: perfC, vento: vento, conc: false }); out.ok = false; out.semSolucao = true; out.motivo = v0.motivo ? "Viga: " + v0.motivo : "Nenhuma viga até " + virg(GRADE_VIGA[GRADE_VIGA.length - 1].b * 100, 0) + "×" + virg(GRADE_VIGA[GRADE_VIGA.length - 1].h * 100, 0) + " cm fecha com vão de " + virg(ctx.viga.L) + " m entre pilares e terças a " + virg(ctx.viga.trib) + " m. Acrescente pilares (ou marque pontos de apoio)."; }
    }
    if (out.ok && (ctx.apoio === "laje" || ctx.viga)) {   /* PONTALETE: compressão e flambagem com L = a altura; sobre pilar de MADEIRA é a seção do pilar (verificada), senão seção própria */
      var Hp = Math.max(0.3, ctx.pontaleteH || 0.5), pil = ctx.pilares || null, pw = pil && pil.madeira, pdim = pw ? (pil.circ ? pil.d : Math.max(pil.b || 0.2, 0.08)) : null;
      var pv = verPontalete(Nped, Hp, classe, perfL, !!(pw && pil.circ), pw ? pdim : null);
      out.pontalete = pv; if (!pv.ok) { out.ok = false; out.semSolucao = true; out.motivo = pv.motivo; }
    }
    if (ctx.tr.caibro && out.ok) {
      var Lc = ctx.cb.L, apc = ctx.cb.apoios, cb = menorSecao(GRADE_CAIBRO, function (sec) { return verFlex({ b: sec.b, h: sec.h, L: Lc, apoios: apc, trib: ctx.tr.espCaibro, gArea: gCaibro, q: sc.q, cosT: cosT, sinT: sinT, classe: classe, perfilL: perfL, perfilC: perfC, vento: vento, conc: true, oblq: false }); });
      if (cb) { out.caibro = { b: cb.sec.b, h: cb.sec.h, vao: r3(ctx.esp), balanco: r3(Math.max(apc[0], Lc - apc[apc.length - 1])), eta: r3(cb.r.eta) }; out.ligacoes.push(ligarArrancamento(cb.r.Rup, cb.sec.b, cb.sec.h, classe, ctx.obra, "caibro × terça (arrancamento)")); }
      else { out.ok = false; out.semSolucao = true; out.motivo = "Nenhum caibro até " + virg(GRADE_CAIBRO[GRADE_CAIBRO.length - 1].b * 100, 0) + "×" + virg(GRADE_CAIBRO[GRADE_CAIBRO.length - 1].h * 100, 0) + " cm fecha com terças a " + virg(ctx.esp) + " m e balanço de beiral (caibros a " + virg(ctx.tr.espCaibro) + " m)."; }
    }
    out.Rcomp = r3(Nped); return out;
  }

  /* o EIXO das terças da água dominante: d = sentido do caimento, td = ao longo do beiral; [lo, hi] = extensão da planta em td, [dlo, dhi] em d, s = inclinação do plano */
  function eixoTd(lido) {
    var t = lido.t, ags = arr(t.aguasCalc).slice().sort(function (x, y) { return num(y.area, 0) - num(x.area, 0); }), ag = ags[0], p = ag && ag.plano ? ag.plano : null; if (!p) return null;
    var s = Math.sqrt(p.bx * p.bx + p.bz * p.bz); if (!(s > 1e-9)) return null;
    var d = [p.bx / s, p.bz / s], td = [-d[1], d[0]], P = lido.contorno, lo = Infinity, hi = -Infinity, dlo = Infinity, dhi = -Infinity;
    P.forEach(function (q) { var v = td[0] * q[0] + td[1] * q[1], w = d[0] * q[0] + d[1] * q[1]; if (v < lo) lo = v; if (v > hi) hi = v; if (w < dlo) dlo = w; if (w > dhi) dhi = w; });
    return { d: d, td: td, lo: lo, hi: hi, dlo: dlo, dhi: dhi, s: s, f: Math.sqrt(1 + s * s) };
  }
  function agrupar(vals, tol) { var v = vals.slice().sort(function (a, b) { return a - b; }), cl = []; v.forEach(function (x) { if (!cl.length || x - cl[cl.length - 1] > tol) cl.push(x); else cl[cl.length - 1] = (cl[cl.length - 1] + x) / 2; }); return cl; }
  /* as LINHAS de apoio dos pilares/pontos REAIS (nada de linha inventada na borda), a faixa de influência (tributária) e a viga no sentido do caimento */
  function vaosDosPontos(lido, pontos, bl, br) {
    var ex = eixoTd(lido); if (!ex) return null;
    var inT = arr(pontos).map(function (q) { return ex.td[0] * q.x + ex.td[1] * q.z; }).filter(function (v) { return v >= ex.lo - 0.1 && v <= ex.hi + 0.1; }), lines = agrupar(inT, 0.3);
    var gaps = [], i; for (i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1]);
    var trib = 0; lines.forEach(function (t, k) { var l = k === 0 ? (t - (ex.lo - (bl || 0))) : (t - lines[k - 1]) / 2, r = k === lines.length - 1 ? ((ex.hi + (br || 0)) - t) : (lines[k + 1] - t) / 2; if (l + r > trib) trib = l + r; });
    var ds = agrupar(arr(pontos).map(function (q) { return ex.d[0] * q.x + ex.d[1] * q.z; }), 0.3), dmid = (ex.dlo + ex.dhi) / 2;
    var rows = ds.filter(function (w) { return w >= ex.dlo - 0.1 && w <= dmid + 0.1; }), apV = rows.map(function (w) { return r4((w - ex.dlo) * ex.f); });
    return { linhas: lines, vaoMax: r3(gaps.length ? Math.max.apply(null, gaps) : 0), nLinhas: lines.length, trib: r3(trib), eixo: ex, viga: { apoios: apV, L: r3((dmid - ex.dlo) * ex.f), trib: r3(trib) } };
  }

  /* ======================================================================
   * 5) PLANEJAR / CALCULAR — o sistema decide; o laço fecha ou sai PRELIMINAR
   * ====================================================================== */
  function chaveDe(lido, cfg, apoio, versao) {
    if (versao === 1) {   /* a chave do cálculo da VERSÃO 1 (formato de antes): o cálculo antigo continua EM DIA enquanto a geometria não mudar — abrir o projeto não dispara recálculo */
      var s1 = [1, lido.tipo, lido.a, lido.b, r3(lido.incl), typeof lido.beiral === "number" ? r3(lido.beiral) : lido.beiral.todos.map(r3).join("/"), lido.tipoId || "-", r3(lido.cotaApoio), r3(lido.baseZ),
        apoio ? apoio.tipo : "-", (cfg && cfg.tesoura) || "-", cfg && cfg.aparente ? "A" : "-", arr(apoio && apoio.pontos).map(function (q) { return r3(q.x) + "," + r3(q.z); }).join(";"), cfg && cfg.classe || "-"].join("|");
      var h1 = 5381, j; for (j = 0; j < s1.length; j++) h1 = ((h1 << 5) + h1 + s1.charCodeAt(j)) | 0;
      return (h1 >>> 0).toString(16) + ":" + s1.length;
    }
    var s = [VERSAO, lido.tipo, lido.a, lido.b, r3(lido.incl), typeof lido.beiral === "number" ? r3(lido.beiral) : lido.beiral.todos.map(r3).join("/"), lido.tipoId || "-", r3(lido.cotaApoio), r3(lido.baseZ),
      apoio ? apoio.tipo : "-", arr(lido.eixoD).map(r3).join("/"), (cfg && cfg.tesoura) || "-", lido.tipo === "T4" ? ((cfg && cfg.fechamento) || (apoio && apoio.tipo === "pilares" ? "aberto" : "fechado")) : "-", cfg && cfg.aparente ? "A" : "-", arr(apoio && apoio.pontos).map(function (q) { return r3(q.x) + "," + r3(q.z); }).join(";"), cfg && cfg.classe || "-"].concat(cfg && cfg._pil ? [cfg._pil] : []).join("|");
    if (lido.tipo === "T3L") s += "|L:" + lido.c + "|" + lido.bb + "|" + arr(lido.contorno).map(function (q) { return r3(q[0]) + "," + r3(q[1]); }).join(";");
    if (lido.tipo === "T3TU") s += "|" + lido.planta + ":" + arr(lido.legs).map(function (L) { return r3(L.x0) + "/" + r3(L.w) + "/" + r3(L.c); }).join(";") + "|" + arr(lido.contorno).map(function (q) { return r3(q[0]) + "," + r3(q[1]); }).join(";") + (lido.anel ? "|furo:" + arr(lido.furo).map(function (q) { return r3(q[0]) + "," + r3(q[1]); }).join(";") : "");
    var h = 5381, i; for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16) + ":" + s.length;
  }

  /* a tipologia (T1/T2/T3 e a tesoura Pratt/Howe/Fink) que o desenho pede — a mesma conta em preparar() e situacao() (senão a chave nunca fecha) */
  function sistemaVia(lido, ap, cfg) {
    if ((ap.tipo === "paredes" && (lido.tipo === "T2" || lido.tipo === "T3" || lido.tipo === "T3L" || lido.tipo === "T3TU" || lido.tipo === "T4")) || (ap.tipo === "pilares" && lido.tipo === "T4")) return { sistema: "tesoura", via: "motor" };
    if (ap.tipo === "pilares" && lido.tipo === "T2") { var pt = pilaresTesoura(lido, ap, cfg); if (pt && pt.ok) return { sistema: "tesoura", via: "motor", quiosque: pt }; }
    if (ap.tipo === "pilares") return { sistema: "vigas", via: "laco" };
    return { sistema: "terca", via: "laco" };
  }
  /* QUIOSQUE — 2 águas retangular apoiada SÓ em pilares (sem parede nem laje): a escolha cai na TESOURA do motor T2 (Pratt/Howe/Fink pelo vão entre eixos), apoiada no FRECHAL (a viga que liga os pilares).
     Pedido do Rogério (20/11/2026): antes, o apoio por pilares só ia para o laço de vigas + terças (telhado aparente) e o motor de tesouras nunca era chamado.
     O motor T2 põe um pilar por linha de tesoura; aqui os pilares são OS DO MODELO: valem as 2 faces (z = 0 e z = vão), os 4 cantos são obrigatórios, as duas faces têm as MESMAS linhas, e as linhas têm de cair
     numa grade regular de tesouras de até 3,2 m (ou 2,4 m na 2ª tentativa); a tesoura que fica entre dois pilares assenta no frechal. Sem pilar no meio do oitão (aberto). "aparente" ou cfg.sistema = "laco" mantêm o laço.
     → null (não se aplica) | { ok:false, motivo } (é quiosque mas não encaixa: cai no laço, com o motivo no aviso) | { ok:true, pilaresX, usados, nCol, tentativas, vMax, interiores } */
  var TOL_PILAR_LINHA = 0.15;   /* m — a mesma tolerância do T4 sobre pilares: o EIXO do pilar do modelo a até 15 cm da posição do motor */
  function pilaresTesoura(lido, ap, cfg) {
    cfg = cfg || {};
    if (!lido || lido.tipo !== "T2" || !ap || ap.tipo !== "pilares" || cfg.aparente || cfg.sistema === "laco" || (cfg.pontos && cfg.pontos.length)) return null;
    var MDx = dep("MadTelhadoDes", "./madtelhadodesenhado.js"); if (!MDx || !MDx.quadro) return null;
    var pil = arr(ap.pilares); if (pil.length < 2) return null;
    var l = axisLido(lido); if (l.erroEixo) return null;
    var a = l.a, b = l.b, q = MDx.quadro(lido), f0 = [], fb = [], interiores = 0;
    pil.forEach(function (pl) {
      var dx = pl.x - q.O[0], dz = pl.z - q.O[1], X = dx * q.u[0] + dz * q.u[1], Y = dx * q.v[0] + dz * q.v[1];
      if (X < -TOL_PILAR_LINHA || X > a + TOL_PILAR_LINHA) return;
      var o = { pl: pl, X: X, Y: Y };
      if (Math.abs(Y) <= TOL_PILAR_LINHA) { o.face = "frente"; f0.push(o); } else if (Math.abs(Y - b) <= TOL_PILAR_LINHA) { o.face = "fundo"; fb.push(o); } else interiores++;
    });
    function pxs(L) { return L.map(function (o) { return o.X; }).sort(function (x, y) { return x - y; }); }
    function falta(L, alvo) { return !L.some(function (o) { return Math.abs(o.X - alvo) <= TOL_PILAR_LINHA; }); }
    var nome = function (v) { return "x " + virg(v) + " m"; }, mot = null;
    [[f0, "frente (z = 0)"], [fb, "fundo (z = " + virg(b) + " m)"]].forEach(function (c) { [0, a].forEach(function (x) { if (!mot && falta(c[0], x)) mot = "não há pilar do modelo no canto " + nome(x) + " da face " + c[1]; }); });
    if (!mot) f0.forEach(function (o) { if (!mot && falta(fb, o.X)) mot = "o pilar em " + nome(o.X) + " da face da frente não tem par na face do fundo"; });
    if (!mot) fb.forEach(function (o) { if (!mot && falta(f0, o.X)) mot = "o pilar em " + nome(o.X) + " da face do fundo não tem par na face da frente"; });
    if (mot) return { ok: false, motivo: "Quiosque sobre pilares (tesoura do motor T2): " + mot + ". Lance os pilares nos 4 cantos do vão (e nas linhas das tesouras) ou use \"aparente\" (vigas + terças)." };
    var xs0 = pxs(f0), linhas = [], k;
    xs0.forEach(function (x) { if (!linhas.length || x - linhas[linhas.length - 1] > TOL_PILAR_LINHA) linhas.push(x); });
    function cabe(n) { var i, ok = true; linhas.forEach(function (x) { var m = Infinity; for (i = 0; i <= n; i++) m = Math.min(m, Math.abs(a * i / n - x)); if (m > TOL_PILAR_LINHA) ok = false; }); return ok; }
    var n1 = null, n2 = null, nMin = Math.max(1, Math.ceil(a / 3.2 - 1e-9)), nMin2 = Math.max(1, Math.ceil(a / 2.4 - 1e-9));
    for (k = nMin; k <= nMin + 3 && n1 == null; k++) if (cabe(k)) n1 = k;   /* até 3 divisões a mais que o mínimo (tesouras a ≥ ~1,2 m): pilar fora disso não vira "grade" de tesouras */
    if (n1 == null) return { ok: false, motivo: "Quiosque sobre pilares (tesoura do motor T2): os pilares estão em " + linhas.map(nome).join("; ") + " e não caem numa grade regular de tesouras de até 3,2 m (a ≤ 15 cm). Alinhe os pilares em espaçamento regular ou use \"aparente\" (vigas + terças)." };
    for (k = Math.max(nMin2, n1 + 1); k <= nMin2 + 3 && n2 == null; k++) if (cabe(k)) n2 = k;
    var gap = 0; for (k = 1; k < linhas.length; k++) gap = Math.max(gap, linhas[k] - linhas[k - 1]);
    var usados = [];
    [f0, fb].forEach(function (L) { L.forEach(function (o) { usados.push({ id: o.pl.id, pl: o.pl, X: r3(o.X), face: o.face }); }); });
    return { ok: true, pilaresX: linhas.map(function (x, i) { return i === 0 ? 0 : (i === linhas.length - 1 ? a : r3(x)); }), usados: usados, nCol: n1, tentativas: n2 ? [a / n1, a / n2] : [a / n1], vMax: Math.max(4, r3(gap), a / n1 + 1e-6), interiores: interiores };
  }
  function tipologiaDe(lido, ap, cfg) {
    var MDx = dep("MadTelhadoDes", "./madtelhadodesenhado.js"); if (!MDx || !MDx.escolher || !ap || !ap.tipo) return null;
    var sv = sistemaVia(lido, ap, cfg), tr = trama(lido, modeloMadeira(sv.sistema, lido)); if (!tr) return null;
    var lE = axisLido(lido);   /* o vão e o memorial são ENTRE EIXOS de parede (o motor), não o do contorno na face externa */
    return MDx.escolher(lE && !lE.erroEixo ? lE : lido, ap, sv.quiosque ? ext({}, cfg || {}, { _quiosque: true }) : (cfg || {}), tr);
  }
  /* a chave leva a tesoura escolhida e, no QUIOSQUE, a seção e o material de cada pilar do modelo (trocar o pilar muda o cálculo: o resultado vale para o pilar calculado) */
  function chaveCfg(cfg, tip, ap) {
    var o = tip && tip.variante ? ext({}, cfg || {}, { tesoura: tip.variante }) : (cfg || {});
    if (tip && tip.quiosque && ap) o = ext({}, o, { _pil: arr(ap.pilares).slice().sort(function (p, q) { return String(p.id) < String(q.id) ? -1 : 1; }).map(function (p) { return [p.id, r3(p.b), r3(p.h), r3(p.d), p.circ ? "c" : "r", p.madeira ? "M" : "-", p.mat || ""].join(":"); }).join(";") });
    return o;
  }
  /* CÁLCULO JÁ GRAVADO PELO LAÇO (2 águas sobre pilares, de antes do quiosque, sem cfg.sistema) = sistema "laco": NÃO fica desatualizado e NÃO é recalculado em silêncio (muda orçamento de projeto salvo);
     a tesoura aparece só como SUGESTÃO, com o botão "Trocar para tesoura" (ação explícita). */
  function cfgEfetiva(c) { var cf = c && c.cfg || {}; return (!cf.sistema && !c.motor && /laço/i.test(String(c.sistema || ""))) ? ext({}, cf, { sistema: "laco" }) : cf; }

  /* devolve { ok } ou { ok:false, motivo, pendente? } e, quando falta rodar o motor de tesouras, { via:"motor", sol, ... } */
  function preparar(estado, id, cfg, opc) {
    cfg = cfg || {}; opc = opc || {};
    var lido = lerTelhado(estado, id); if (!lido.ok) return lido;
    var ap = detectarApoio(estado, lido, cfg);
    if (!ap.tipo && lido.virtualDe) return { ok: false, motivo: "Telhado por extrusão (perfil simétrico): as paredes precisam estar nas PONTAS do perfil (a até ~12 cm do contorno do perfil) para o frechal assentar nelas; senão a madeira ficaria no ar. Mova as paredes para as pontas do perfil ou use o telhado por contorno com o beiral desejado.", apoio: ap };
    if (!ap.tipo) return { ok: false, motivo: ap.motivo, apoio: ap };
    var sistema, via, ptq = lido.tipo === "T2" && ap.tipo === "pilares" ? pilaresTesoura(lido, ap, cfg) : null;
    if ((ap.tipo === "paredes" && (lido.tipo === "T2" || lido.tipo === "T3" || lido.tipo === "T3L" || lido.tipo === "T3TU" || lido.tipo === "T4")) || (ap.tipo === "pilares" && lido.tipo === "T4") || (ptq && ptq.ok)) { sistema = "tesoura"; via = "motor"; }
    else if (lido.tipo === "T4") return { ok: false, motivo: "Telhado sextavado/oitavado (T4): o módulo calcula sobre PAREDES em todo o contorno (os pilares são os do próprio motor). Lance as paredes no perímetro." };
    else if (ap.tipo === "pilares") { sistema = "vigas"; via = "laco"; }
    else { sistema = "terca"; via = "laco"; }
    var modelo = modeloMadeira(sistema, lido), tr = trama(lido, modelo); if (!tr) return { ok: false, motivo: "Modelo de madeira desconhecido: " + modelo };
    var pe = pesos(lido, tr), classe = cfg.classe || CLASSE_PADRAO;
    /* TIPOLOGIA AUTOMÁTICA pela forma e pelo vão desenhados (o usuário só troca): js/madtelhadodesenhado.js */
    var tip = tipologiaDe(lido, ap, cfg), cfgChave = chaveCfg(cfg, tip, ap);
    var prep = { ok: true, id: String(id), lido: lido, apoio: ap, cfg: clone(cfg), via: via, sistema: sistema, modelo: modelo, trama: tr, pesos: pe, classe: classe, chave: chaveDe(lido, cfgChave, ap), avisos: [], tipologia: tip };
    if (ap.aviso) prep.avisos.push(ap.aviso);
    if (ptq && ptq.ok) prep.quiosque = ptq;
    else if (ptq) prep.avisos.push(ptq.motivo + " Calculei pelo laço de vigas + terças.");
    if (via === "motor") {
      if (lido.tipo === "T4" && ap.tipo === "pilares") {   /* T4 ABERTO SOBRE PILARES: o motor põe um pilar em cada vértice; os pilares do modelo têm de estar nesses vértices */
        var falt = [];
        lido.contorno.forEach(function (q, k) { if (!ap.pilares.some(function (pl) { return Math.sqrt(Math.pow(pl.x - q[0], 2) + Math.pow(pl.z - q[1], 2)) <= 0.15; })) falt.push("vértice " + (k + 1) + " (x " + virg(q[0]) + "; z " + virg(q[1]) + ")"); });
        if (falt.length) return { ok: false, motivo: "Telhado " + (lido.n === 6 ? "sextavado" : "oitavado") + " sobre pilares: o motor T4 assenta o frechal em UM pilar por vértice do perímetro e não há pilar do modelo com o EIXO a até 15 cm do vértice em " + falt.length + " vértice(s): " + falt.join("; ") + ". Lance os pilares nos vértices do polígono ou apoie o telhado em paredes." };
      }
      var laE = axisLido(lido);
      if (laE.erroEixo) return { ok: false, motivo: laE.erroEixo };
      if (laE.b < 3 - 1e-6) return { ok: false, motivo: "Vão de " + virg(laE.b) + " m entre os eixos das paredes: o módulo calcula vão mínimo de 3 m." };
      var EnM = EN(); if (!EnM) return { ok: false, motivo: "O motor da madeira engenharada (js/madengentrada.js) não carregou." };
      var tes = tip && tip.variante ? tip.variante : (cfg.tesoura === "howe" || cfg.tesoura === "fink" ? cfg.tesoura : "pratt");
      if ((lido.tipo === "T3" || lido.tipo === "T3L" || lido.tipo === "T3TU") && tes === "fink") { tes = "pratt"; prep.avisos.push("Tesoura Fink só existe para 2 águas; nas 4 águas usei Pratt."); }
      if (lido.anel && tes === "howe") { tes = "pratt"; prep.avisos.push("Anel (pátio): tesoura Howe ainda não é detalhada nas barras N/S espelhadas; usei Pratt."); }
      if (tip && tip.aviso) prep.avisos.push(tip.aviso);
      var sTes = ESP_APOIO_MAX, tentativas = cfg.tentativas || (prep.quiosque ? prep.quiosque.tentativas.slice() : (lido.tipo === "T4" ? [3.2] : [3.2, 2.4]));
      prep.tesoura = tes; prep.tentativas = tentativas.slice(); prep.tentativa = 0; prep.sTes = tentativas[0];
      var e = EnM.estadoPadrao(), ob = opc.obra || {};
      e.tip = (lido.tipo === "T3L" || lido.tipo === "T3TU") ? "T3" : lido.tipo; e.obra = ext({}, e.obra, clone(ob));
      void sTes;
      prep.estadoMad = montarEstadoMadeira(e, prep);
      var val = EnM.validar(prep.estadoMad);
      if (!val.ok) {
        var faltaLocal = val.falta.some(function (f) { return /cidade|coordenad|V0/i.test(f.texto); });
        return { ok: false, pendente: faltaLocal ? "local" : "entrada", motivo: val.falta.map(function (f) { return f.texto; }).join(" "), prep: prep };
      }
      var W = dep("MadEngWorker", "./madengworker.js"); if (!W) return { ok: false, motivo: "O orquestrador do motor (js/madengworker.js) não carregou." };
      prep.sol = W.solicitacao(prep.estadoMad, "A");
    } else {
      var bl = num(lido.beiralLat && lido.beiralLat[0], 0), br = num(lido.beiralLat && lido.beiralLat[1], 0), ex = eixoTd(lido);
      if (!ex) return { ok: false, motivo: "Não consegui achar o sentido do caimento da cobertura." };
      var ctx = { incl: lido.incl, esp: tr.espTerca, tr: tr, p: pe, obra: opc.obra || {}, classe: classe, apoio: ap.tipo, ex: ex, bl: bl, br: br, pontaleteH: Math.max(0.3, lido.cotaCumeeira - lido.cotaApoio + 0.1) };
      /* o caibro: contínuo sobre as terças, com o balanço do beiral (rampa da água e nº de terças do modelo) */
      var pkA = lido.t.pacote && arr(lido.t.pacote.aguas)[0], rampa = pkA && fin(pkA.rampa) ? pkA.rampa : ((ex.dhi - ex.dlo) / 2 + Math.max(bl, br, 0.3)) * ex.f, nT = pkA && pkA.nTercas ? pkA.nTercas : Math.max(2, Math.ceil((rampa - 0.35) / tr.espTerca) + 1), cbA = [], kc;
      for (kc = 0; kc < nT; kc++) cbA.push(r4(0.25 + kc * (rampa - 0.35) / Math.max(1, nT - 1)));
      ctx.cb = { L: r3(rampa), apoios: cbA };
      if (ap.tipo === "laje") ctx.vaos = [1.5, 1.8, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0];
      else if (ap.tipo === "pilares") {
        var vp = vaosDosPontos(lido, ap.pontos, bl, br);
        if (!vp || vp.nLinhas < 1) return { ok: false, motivo: "Os pilares/pontos não formam linhas de apoio dentro da cobertura." };
        ctx.lines = vp.linhas; prep.linhasPilares = vp; ctx.viga = vp.viga;
        var pw = ap.pilares.length ? ap.pilares : [], todosMad = pw.length > 0 && pw.every(function (q) { return q.madeira; });
        ctx.pilares = { madeira: todosMad, circ: pw.some(function (q) { return q.circ; }), d: Math.max.apply(null, pw.map(function (q) { return q.d; }).concat([0.2])), b: Math.max.apply(null, pw.map(function (q) { return q.b; }).concat([0.2])), topoMin: pw.length ? Math.min.apply(null, pw.map(function (q) { return q.topo; })) : lido.cotaApoio };
        ctx.pontaleteH = Math.max(0.3, lido.cotaCumeeira - ctx.pilares.topoMin + 0.1);
      } else prep.avisos.push("Terças contínuas entre as paredes (frechais) com o beiral em balanço (sem pontaletes intermediários).");
      ctx.vento = ventoDe(lido, opc.obra || {});
      prep.ctx = ctx; prep.estado = estado;
    }
    return prep;
  }

  function montarEstadoMadeira(e, prep) {
    var l = axisLido(prep.lido), o = e.obra, pe = prep.pesos;   /* o motor trabalha ENTRE EIXOS de parede */
    var desc = (l.telha ? (l.telha.produto || l.telha.familia) : "telha do modelo") + " + trama do modelo";
    if (l.tipo === "T4") {
      var fech = prep.cfg && (prep.cfg.fechamento === "aberto" || prep.cfg.fechamento === "fechado") ? prep.cfg.fechamento : (prep.apoio && prep.apoio.tipo === "pilares" ? "aberto" : "fechado");   /* padrão: FECHADO sobre paredes, ABERTO sobre pilares */
      e.t4 = { fechamento: fech, n: String(l.n), R: l.R, peDireito: Math.max(l.peDireito, 1.2), incl: l.incl, cotaPiso: l.baseZ, beiral: l.beiral, vMaxPilar: prep.apoio && prep.apoio.tipo === "pilares" ? Math.max(4.0, l.lados[0] * 1.02) : 4.0, sTercaMax: prep.trama.espTerca, telhaPeso: pe.total, telhaDescricao: desc, pilarCentral: "nao", caibroMeio: "auto" };
    } else if (l.tipo === "T3L") {
      e.t3 = { planta: "L", vao: l.b, comp: l.a, vaoB: l.bb, compB: l.c, peDireito: Math.max(l.peDireito, 1.2), incl: l.incl, cotaPiso: l.baseZ, beiral: l.beiral, sTes: prep.sTes, sTercaMax: prep.trama.espTerca, vMaxPilar: 4.0, telhaPeso: pe.total, telhaDescricao: desc, tesoura: prep.tesoura === "howe" ? "howe" : "pratt" };
    } else if (l.tipo === "T3TU") {
      e.t3 = { planta: "TU", anel: !!l.anel, compC: l.anel ? l.c : undefined, wV: l.anel ? l.wV : undefined, avisoFaixas: l.anel ? (l.avisoFaixas || undefined) : undefined, vao: l.b, comp: l.a, legs: clone(l.legs), peDireito: Math.max(l.peDireito, 1.2), incl: l.incl, cotaPiso: l.baseZ, beiral: l.beiral, sTes: prep.sTes, sTercaMax: prep.trama.espTerca, vMaxPilar: 4.0, telhaPeso: pe.total, telhaDescricao: desc, tesoura: prep.tesoura === "howe" ? "howe" : "pratt" };
    } else if (l.tipo === "T3") {
      e.t3 = { vao: l.b, comp: l.a, peDireito: Math.max(l.peDireito, 1.2), incl: l.incl, cotaPiso: l.baseZ, beiral: l.beiral, sTes: prep.sTes, sTercaMax: prep.trama.espTerca, vMaxPilar: 4.0, telhaPeso: pe.total, telhaDescricao: desc, tesoura: prep.tesoura === "howe" ? "howe" : "pratt" };
    } else {
      var bl = l.beiral;   /* lados: eave 0/1 = frente/fundo (no vão), gable = esq/dir (na cumeeira) */
      e.t2 = { vao: l.b, comp: l.a, peDireito: Math.max(l.peDireito, 1.2), incl: l.incl, cotaPiso: l.baseZ, beiral: { frente: bl.eave[0], fundo: bl.eave[1], esq: bl.gable[0], dir: bl.gable[1] }, sistema: prep.tesoura === "howe" ? "tesoura-howe" : (prep.tesoura === "fink" ? "tesoura-fink" : "tesoura"),
        sTes: prep.sTes, sCaibro: 1.0, vMaxCumeeira: 4.0, sTercaMax: prep.trama.espTerca, telhaPeso: pe.total, telhaDescricao: desc, assento: "deslizante", vergasVidro: false };
      if (prep.quiosque) { e.t2.pilaresX = prep.quiosque.pilaresX.slice(); e.t2.semPilarOitao = true; e.t2.vMaxCumeeira = prep.quiosque.vMax; }   /* quiosque: os pilares são os do modelo, sem pilar de oitão */
    }
    void o;
    return e;
  }

  /* papéis do BIM ← grupos do motor (o MAIOR dos grupos que viram o mesmo papel: a favor da segurança) */
  var MAPA_GRUPOS = { perna: ["BS", "MS"], linha: ["BI", "MI"], pendural: ["PD", "MP"], escora: ["DG", "MG"], terca: ["T"], espigao: ["E"] };
  var SEM_PECA = { LB: "contraventamento", DX: "contraventamento", DP: "contraventamento", DV: "contraventamento" };
  var ROLE_MOTOR = { FR: "frechal", P: "pilar", PO: "pilar", PC: "pilar", CM: "cumeeira", LB: "contravento", DX: "contravento", DP: "contravento", DV: "contravento" };
  function secoesDoMotor(res, prep) {
    var out = {}, S = res && res.secoes || {}, sem = [];
    Object.keys(MAPA_GRUPOS).forEach(function (papel) {
      var best = null; MAPA_GRUPOS[papel].forEach(function (g) { var s = S[g]; if (s && fin(s.b) && fin(s.h) && (!best || s.b * s.h > best.b * best.h)) best = { b: r3(s.b), h: r3(s.h) }; });
      if (best) out[papel] = best;
    });
    /* a ESCORA do BIM é diagonal COMPRIMIDA (Howe): na Pratt e na Fink a diagonal do motor é TRACIONADA — não se dá a seção dela à escora (fica a de partida, marcada) */
    if (!(prep && prep.tesoura === "howe")) { if (out.escora) sem.push("escora do BIM sem grupo calculado equivalente (a diagonal da " + (prep && prep.tesoura === "fink" ? "Fink" : "Pratt") + " é tracionada, a escora é comprimida)"); delete out.escora; }
    return { secoes: out, semPeca: sem };
  }
  /* o que mantém o resultado do motor PRELIMINAR (além do que o próprio motor reprova): peça do BIM sem grupo calculado, vento de 4 águas e a ligação frechal × parede */
  function motivosMotor(prep, res, sm, comMotor) {
    var m = [];
    if (prep.lido.tipo === "T3L") m.push("vento: a NBR 6123 não traz coeficientes de cobertura para 4 águas em planta em L — campo de 2 águas (Tabela 5) calculado por asa (cada asa com a sua cumeeira) adotado como premissa; confirmar com o RT");
    if (prep.lido.tipo === "T3TU") m.push("vento: a NBR 6123 não traz coeficientes de cobertura para 4 águas em planta em " + prep.lido.planta + " — campo de 2 águas (Tabela 5) calculado por asa adotado como premissa; sobrepressão local na reentrância de cada rincão e sombreamento entre as asas pendentes ao RT");
    if (prep.lido.tipo === "T3TU") { var nvTU = arr(res && res.naoVerificado); if (nvTU.length) nvTU.forEach(function (t) { m.push("T/U: NÃO VERIFICADO — " + String(t).replace(/ — confirmar pelo RT\.?$/, "") + "; confirmar pelo RT"); }); else if (!(res && res.ligacoesT3)) m.push("T/U: ligações detalhadas dos nós NÃO verificadas (o cálculo não trouxe a verificação detalhada); o orçamento traz pinos e chapas por estimativa pelo critério do L"); }
    if (prep.lido.tipo === "T3") m.push("vento: a NBR 6123 não traz coeficientes de cobertura para 4 águas — campo de 2 águas (Tabela 5) adotado como premissa; confirmar com o RT");
    if (comMotor) m.push("peças do modelo SEM grupo calculado pelo motor (marcadas calcNao): caibros e ripas — seguem o SINAPI/catálogo da telha; a estrutura de madeira (tesouras, terças, espigões, frechal, cumeeira) é a do motor, com os sólidos cortados");
    else m.push("peças do modelo SEM grupo calculado pelo motor (marcadas calcNao): montante (sarrafos), caibros e ripas" + (sm.semPeca.length ? "; " + sm.semPeca.join("; ") : "") + " — seguem o SINAPI/catálogo; a geometria da tesoura do BIM é a do SINAPI, as seções são as do motor");
    var Fup = 0; try { Object.keys(res.reacoes || {}).forEach(function (k) { var v = res.reacoes[k]; (Array.isArray(v) ? v : [v]).forEach(function (x) { if (fin(x) && x < Fup) Fup = x; }); }); } catch (e) { Fup = 0; }
    if (prep.quiosque) {
      m.push("vento: o motor T2 calcula a edificação FECHADA (Tabela 5 da NBR 6123, pressão nas faces levada aos pilares, abertura dominante); a cobertura isolada de quiosque ABERTO (coeficientes próprios da norma) NÃO foi verificada — confirmar com o RT");
      m.push("pilares do modelo: base (chumbadores/fundação), contraventamento no plano dos pilares e ligação frechal × topo do pilar NÃO verificados" + (Fup < 0 ? " — arrancamento de " + virg(-Fup, 1) + " kN no apoio" : "") + ": projeto do RT");
    } else m.push("ligação frechal × parede (chumbador/cinta) NÃO verificada" + (Fup < 0 ? " — arrancamento de " + virg(-Fup, 1) + " kN no apoio" : "") + ": projeto do RT");
    return m;
  }
  /* o frechal, os pilares, a cumeeira e o contraventamento que o motor calculou viram PEÇAS do modelo: pontos do motor ([X, Z, altura], origem no canto da planta,
     a ao longo do lado maior) levados ao sistema da obra. Só retângulo alinhado aos eixos; senão fica listado como "sem peça". */
  function pecasDoMotor(prep, res) {
    var lido = prep.lido, ms = arr(res && res.t3 && res.t3.membros).concat(arr(res && res.t2 && res.t2.membros)), S = res && res.secoes || {}, P = lido.contorno, out = [], sem = [], aviso = null;
    var xs = P.map(function (q) { return q[0]; }), zs = P.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
    var alinhado = P.every(function (q) { return (Math.abs(q[0] - x0) < 1e-3 || Math.abs(q[0] - x1) < 1e-3) && (Math.abs(q[1] - z0) < 1e-3 || Math.abs(q[1] - z1) < 1e-3); });
    var visto = {}, pSobre = 0;
    ms.forEach(function (m) {
      var r = ROLE_MOTOR[m.g]; if (!r) return;
      var sec = S[m.g === "DV" ? "DX" : m.g]; if (!sec) return;
      var b = fin(sec.b) ? sec.b : sec.d, h = fin(sec.h) ? sec.h : sec.d; if (!(b > 0) || !(h > 0)) return;
      if (!alinhado) { visto[m.g] = 1; return; }
      function mp(q) { var X = q[0], Z = q[1], alt = q[2]; return lido.eixoA === "x" ? [x0 + X, alt, z0 + Z] : [x0 + Z, alt, z0 + X]; }
      var a = mp(m.p0), c = mp(m.p1);
      /* quando o apoio é PAREDE o frechal assenta nela e NÃO se cria pilar: o pilar do motor só entra onde não há parede embaixo */
      if (r === "pilar" && arr(prep.apoio && prep.apoio.rets).some(function (w) { return naRet(w, a[0], a[2], 0.25); })) { pSobre++; return; }
      out.push({ r: r, b: r3(b), h: r3(h), x0: r3(a[0]), y0: r3(a[1]), z0: r3(a[2]), x1: r3(c[0]), y1: r3(c[1]), z1: r3(c[2]) });
    });
    if (!alinhado) { aviso = lido.tipo === "T3TU" ? "planta em " + lido.planta + ": frechal, pilares e contraventamento do motor ficam só na lista de peças do módulo Madeira" : "retângulo fora dos eixos: frechal, pilares e contraventamento do motor ficam só na lista de peças do módulo Madeira"; Object.keys(visto).forEach(function (g) { sem.push(g + " (" + ROLE_MOTOR[g] + ")"); }); }
    if (pSobre) aviso = (aviso ? aviso + "; " : "") + pSobre + " pilar(es) do motor ficam SOBRE parede do modelo: o frechal assenta na parede e não se cria pilar";
    return { lista: out.slice(0, 90), semPeca: sem, aviso: aviso, truncado: out.length > 90, pilaresSobreParede: pSobre };
  }

  /* o resultado do motor de tesouras → calc (ou pede nova tentativa com espaçamento menor) */
  /* T4 ABERTO SOBRE PILARES (revisor 17/11/2026): o motor calcula a seção do pilar (res.secoes.P) mas o frechal assenta nos pilares DO MODELO. Pilar do modelo MENOR que o calculado, ou que não é
     de madeira, deixa o cálculo PRELIMINAR com o motivo escrito (X×Y < A×B) e o pilar calculado no aviso. A posição (15 cm do vértice) já foi conferida no preparar. */
  function pilaresDoModelo(prep, res) {
    var out = { motivos: [], avisos: [] }, ap = prep.apoio, sec = res && res.secoes && res.secoes.P, q2 = prep.quiosque;
    if (q2 && ap && ap.tipo === "pilares" && prep.lido && prep.lido.tipo === "T2") return pilaresDoQuiosque(prep, res, q2, sec);
    if (!(prep.lido && prep.lido.tipo === "T4" && ap && ap.tipo === "pilares" && sec)) return out;
    var A = fin(sec.b) ? sec.b : sec.d, B = fin(sec.h) ? sec.h : sec.d; if (!(A > 0) || !(B > 0)) return out;
    var calc = [A, B].sort(function (x, y) { return x - y; }), cm = function (v) { return virg(v * 100, 0); }, menores = [], naoMad = [], visto = {};
    prep.lido.contorno.forEach(function (q, k) {
      var pl = null, dm = Infinity; arr(ap.pilares).forEach(function (p) { var d = Math.sqrt(Math.pow(p.x - q[0], 2) + Math.pow(p.z - q[1], 2)); if (d <= 0.15 && d < dm) { dm = d; pl = p; } });
      if (!pl || visto[pl.id]) return; visto[pl.id] = 1;
      var pb = pl.circ ? pl.d : pl.b, ph = pl.circ ? pl.d : (pl.h != null ? pl.h : pl.b), mod = [pb, ph].sort(function (x, y) { return x - y; });
      if (mod[0] < calc[0] - 0.004 || mod[1] < calc[1] - 0.004) menores.push("pilar do modelo " + pl.id + " " + cm(pb) + "×" + cm(ph) + " cm < calculado " + cm(A) + "×" + cm(B) + " cm (vértice " + (k + 1) + ")");
      if (!pl.madeira) naoMad.push("pilar do modelo " + pl.id + " (vértice " + (k + 1) + ")" + (pl.mat ? " é \"" + pl.mat + "\"" : " sem material de madeira informado"));
    });
    if (menores.length) out.motivos.push("T4 sobre pilares do modelo: " + menores.join("; ") + " — o cálculo vale para o pilar calculado, não para o do modelo");
    if (naoMad.length) out.motivos.push("T4 sobre pilares do modelo: " + naoMad.join("; ") + " — não é de madeira; o cálculo (NBR 7190) assume pilar de madeira " + cm(A) + "×" + cm(B) + " cm");
    if (out.motivos.length) out.avisos.push("Pilar calculado pelo motor: " + cm(A) + "×" + cm(B) + " cm (madeira). Troque os pilares do modelo por essa seção (ou maior) e recalcule para fechar.");
    return out;
  }
  /* QUIOSQUE (T2 sobre pilares do modelo): a MESMA regra do T4 — pilar do modelo MENOR que o calculado (res.secoes.P) ou que não é de madeira deixa o cálculo PRELIMINAR com o motivo escrito —
     e a conferência do FRECHAL: é a viga que liga os pilares e onde as tesouras assentam. Tem de ter seção calculada e verificada (η) e as tesouras (BI) e os pilares têm de cair em nós dele. */
  function pilaresDoQuiosque(prep, res, q2, sec) {
    var out = { motivos: [], avisos: [] }, cm = function (v) { return virg(v * 100, 0); }, A = sec && (fin(sec.b) ? sec.b : sec.d), B = sec && (fin(sec.h) ? sec.h : sec.d);
    if (!(A > 0) || !(B > 0)) { out.motivos.push("T2 sobre pilares do modelo: o motor não devolveu a seção do pilar — não há como conferir os pilares do modelo"); return out; }
    var calc = [A, B].sort(function (x, y) { return x - y; }), menores = [], naoMad = [], visto = {};
    q2.usados.forEach(function (u) {
      var pl = u.pl, onde = "(" + (u.face === "frente" ? "frente" : "fundo") + ", " + "x " + virg(u.X) + " m)";
      if (visto[pl.id]) return; visto[pl.id] = 1;
      var pb = pl.circ ? pl.d : pl.b, ph = pl.circ ? pl.d : (pl.h != null ? pl.h : pl.b), mod = [pb, ph].sort(function (x, y) { return x - y; });
      if (mod[0] < calc[0] - 0.004 || mod[1] < calc[1] - 0.004) menores.push("pilar do modelo " + pl.id + " " + cm(pb) + "×" + cm(ph) + " cm < calculado " + cm(A) + "×" + cm(B) + " cm " + onde);
      if (!pl.madeira) naoMad.push("pilar do modelo " + pl.id + " " + onde + (pl.mat ? " é \"" + pl.mat + "\"" : " sem material de madeira informado"));
    });
    if (menores.length) out.motivos.push("T2 sobre pilares do modelo: " + menores.join("; ") + " — o cálculo vale para o pilar calculado, não para o do modelo");
    if (naoMad.length) out.motivos.push("T2 sobre pilares do modelo: " + naoMad.join("; ") + " — não é de madeira; o cálculo (NBR 7190) assume pilar de madeira " + cm(A) + "×" + cm(B) + " cm");
    if (out.motivos.length) out.avisos.push("Pilar calculado pelo motor: " + cm(A) + "×" + cm(B) + " cm (madeira). Troque os pilares do modelo por essa seção (ou maior) e recalcule para fechar.");
    if (q2.interiores) out.avisos.push(q2.interiores + " pilar(es) do modelo fora das 2 faces (no interior da planta) NÃO entram no cálculo: a tesoura vence o vão entre as faces.");
    /* o frechal (viga sobre os pilares) e o apoio das tesouras nele */
    var fr = res && res.secoes && res.secoes.FR, frb = fr && (fin(fr.b) ? fr.b : fr.d), frh = fr && (fin(fr.h) ? fr.h : fr.d), eFR = res && res.pior && res.pior.FR;
    if (!(frb > 0) || !(frh > 0)) out.motivos.push("T2 sobre pilares do modelo: o frechal (viga que liga os pilares) saiu SEM seção calculada pelo motor");
    else if (!(fin(Number(eFR)))) out.motivos.push("T2 sobre pilares do modelo: o frechal " + cm(frb) + "×" + cm(frh) + " cm não tem η verificado no resultado do motor");
    else if (Number(eFR) > 1 + 1e-9) out.motivos.push("T2 sobre pilares do modelo: o frechal " + cm(frb) + "×" + cm(frh) + " cm reprova (η = " + virg(Number(eFR), 2) + ")");
    /* ⚠ ESTA CONFERÊNCIA É GEOMÉTRICA (os nós declarados em FR.nos), não a conectividade das barras do solver: a garantia real é que o solver monta as barras do FR POR essa lista de nós e que
       MadTipologias.T2.geometria LANÇA ERRO se um pilar (pilaresX) não cai numa linha de tesoura. Ela serve para acusar uma regressão da geometria; não prova a conectividade sozinha. */
    var MTq = dep("MadTipologias", "./madtipologias.js");
    if (MTq && MTq.T2 && prep.sol && prep.sol.proj && prep.sol.proj.params) {
      try {
        var G = MTq.T2.geometria(clone(prep.sol.proj.params)), frs = G.membros.filter(function (m) { return m.g === "FR"; }), bis = G.membros.filter(function (m) { return m.g === "BI"; }), ps = G.membros.filter(function (m) { return m.g === "P"; });
        var noFR = function (x) { return frs.length > 0 && frs.every(function (f) { return arr(f.nos).some(function (n) { return Math.abs(n[0] - x) < 1e-6; }); }); };
        var soltas = bis.filter(function (m) { return !noFR(m.p0[0]); }).length + ps.filter(function (m) { return !noFR(m.p0[0]); }).length, noMeio = bis.filter(function (m) { return !ps.some(function (p2) { return Math.abs(p2.p0[0] - m.p0[0]) < 1e-6; }); }).length, vao = 0;
        ps.map(function (m) { return m.p0[0]; }).filter(function (x, i, v) { return v.indexOf(x) === i; }).sort(function (x, y) { return x - y; }).forEach(function (x, i, v) { if (i) vao = Math.max(vao, x - v[i - 1]); });
        if (soltas) out.motivos.push("T2 sobre pilares do modelo: " + soltas + " tesoura(s)/pilar(es) do motor não caem em nó do frechal — o apoio da tesoura na viga não se confirma");
        else if (frb > 0 && frh > 0) out.avisos.push("Tesouras apoiadas no frechal (viga sobre os pilares, " + cm(frb) + "×" + cm(frh) + " cm, vão máximo entre pilares " + virg(vao) + " m): " + bis.length + " tesoura(s), " + (bis.length - noMeio) + " sobre pilar e " + noMeio + " no meio do vão, apoiada(s) no frechal.");
      } catch (eG) { out.motivos.push("T2 sobre pilares do modelo: não consegui conferir o apoio das tesouras no frechal (" + String(eG && eG.message || eG).slice(0, 80) + ")"); }
    }
    return out;
  }
  /* T/U: a reação de cada pilar do motor (quadro da estrutura → mundo: O + x·u + z·v) cai na parede do modelo que o contém (a ≤ 0,25 m do eixo); o que não cai em parede fica como "pilar (x; z)".
     kN = reação de CÁLCULO (ELU, compressão máxima, soma dos pilares da parede); kNk = característica (G1 + G2 + Q) */
  function cargasParedesTU(prep, res) {
    var q = prep.lido.quadroTU, ap = prep.apoio || {}, rets = arr(ap.rets), ids = arr(ap.paredes), soma = {}, ordem = [];
    if (!q) return [];
    arr(res.cargasNasParedes).forEach(function (c) {
      var wx = q.O[0] + c.x * q.u[0] + c.z * q.v[0], wz = q.O[1] + c.x * q.u[1] + c.z * q.v[1], k = -1, i;
      for (i = 0; i < rets.length; i++) if (naRet(rets[i], wx, wz, 0.25)) { k = i; break; }
      var id = k >= 0 && ids[k] != null ? String(ids[k]) : "pilar (" + virg(wx) + "; " + virg(wz) + ")";
      if (!soma[id]) { soma[id] = { apoio: id, kN: 0, vigas: 0, kNk: 0 }; ordem.push(id); }
      soma[id].kN += num(c.kN, 0); soma[id].kNk += num(c.kNk, 0); soma[id].vigas++;
    });
    return ordem.map(function (id) { return { apoio: soma[id].apoio, kN: r3(soma[id].kN), vigas: soma[id].vigas, kNk: r3(soma[id].kNk) }; });
  }
  function concluirMotor(prep, res) {
    var SA = dep("MadEngSaidas", "./madengsaidas.js"), pre = SA && SA.preliminar ? SA.preliminar(res) : { preliminar: !res.ok, motivos: [] };
    var sm = secoesDoMotor(res, prep), pm = pecasDoMotor(prep, res), motivos = arr(pre.motivos).slice();
    if (res.semSolucao && !motivos.length) motivos.push("o motor não achou seção no catálogo que feche");
    var etaMax = 0; Object.keys(res.pior || {}).forEach(function (k) { var v = Number(res.pior[k]); if (isFinite(v) && v > etaMax) etaMax = v; });
    var tent = { sTes: prep.sTes, ok: !!res.ok && !res.semSolucao };
    var fecha = !pre.preliminar && !res.semSolucao;
    var MDq = dep("MadTelhadoDes", "./madtelhadodesenhado.js"), comMotor = !!(MDq && MDq.payload && MDq.payload(prep, res)), extra = motivosMotor(prep, res, sm, comMotor);
    var pilMod = pilaresDoModelo(prep, res); extra = pilMod.motivos.concat(extra);
    if (!fecha && prep.tentativa + 1 < prep.tentativas.length) return { ok: true, repetir: true, tentativa: tent, motivo: motivos[0] || "não fechou" };
    var calc = montarCalc(prep, { sistema: "tesouras " + (prep.tesoura === "howe" ? "Howe" : prep.tesoura === "fink" ? "Fink" : "Pratt") + " (" + prep.lido.tipo + ", motor de madeira engenharada)", secoes: sm.secoes, semPeca: comMotor ? [] : sm.semPeca.concat(pm.semPeca), preliminar: !fecha || extra.length > 0, motivos: motivos.concat(extra),
      espApoio: prep.sTes, espTerca: prep.trama.espTerca, eta: { max: r3(etaMax) }, v0: res.v0, avisos: pilMod.avisos.concat(arr(res.avisos).slice(0, 3), pm.aviso ? [pm.aviso] : []), pecasMotor: pm.lista,
      naoVerificado: prep.quiosque ? ["ligação frechal × topo do pilar, base e contraventamento dos pilares; vento de cobertura isolada"] : ["ligação frechal × parede (chumbador/cinta)"], tentativas: tent });
    if (prep.lido.tipo === "T3TU") {      /* T/U: reações nas paredes do modelo (mesmo formato do laço: apoio, kN, vigas), pendências ao RT por canto côncavo e o aviso de pranchas */
      calc.cargasNasParedes = cargasParedesTU(prep, res);
      calc.planta = prep.lido.planta; calc.pendenciasRT = arr(res.pendenciasRT).map(function (p) { return String(p.texto || "").slice(0, 240); }).slice(0, 8);
      calc.pranchas = { ok: true, aviso: "Pranchas detalhadas do T/U, manual de montagem e fichas de corte: no módulo Madeira (entrada desta cobertura) e em Saídas do telhado" }; calc.naoVerificado = arr(calc.naoVerificado).concat(arr(res.naoVerificado).map(function (t) { return String(t).slice(0, 260); }));
      if (res.reacoesParedes && res.reacoesParedes.soma) calc.equilibrioReacoes = { ok: !!res.reacoesParedes.ok, erro: res.reacoesParedes.erro, soma: res.reacoesParedes.soma, cargas: res.reacoesParedes.cargas };
    }
    /* os grupos do motor viraram peças: a seção de cada um também vai no resultado (para a janela) */
    /* O TELHADO DESENHADO = a geometria do MOTOR: o cálculo guarda a entrada do motor e as seções por grupo — o BIM refaz os membros e os sólidos cortados (determinístico) */
    var MDp = dep("MadTelhadoDes", "./madtelhadodesenhado.js"); if (MDp && MDp.payload) { var pl = MDp.payload(prep, res); if (pl) { calc.motor = pl; delete calc.pecasMotor; } }   /* com a geometria do motor as peças vêm dela: a lista antiga (até 13 KB) sai para caber nos 24 KB da op */
    if (prep.tipologia) calc.tipologia = { tipo: prep.tipologia.tipo, variante: prep.tipologia.variante, auto: !!prep.tipologia.auto, criterio: prep.tipologia.criterio, fonte: prep.tipologia.fonte };
    /* M1: as LIGAÇÕES orçadas pelo motor (pinos, chapas, parafusos, chumbadores, peças de aço) — quantidades e unidades — viram itens do quantitativo do telhado (pequeno: só o que não é a madeira) */
    var itOrc = arr(res.orcamento && res.orcamento.itens).filter(function (i) { return /pino|chapa|parafuso|chumbador|aço|aco|cinta|sela|cubo/i.test(String(i.descricao || "")) && !/MLC|frete|montagem|ícamento|içamento|verniz|stain/i.test(String(i.descricao || "")); });
    if (itOrc.length) calc.ligOrc = itOrc.slice(0, 12).map(function (i) { return { d: String(i.descricao).slice(0, 110), un: String(i.un || ""), q: r4(num(i.qtd, 0)) }; });
    calc.secoesMotor = {}; ["FR", "P", "PO", "CM"].forEach(function (g) { var q = res.secoes && res.secoes[g]; if (q && (fin(q.b) || fin(q.d))) calc.secoesMotor[g] = { b: r3(fin(q.b) ? q.b : q.d), h: r3(fin(q.h) ? q.h : q.d) }; });
    return { ok: true, calc: calc, resumo: resumo(calc), resultadoMotor: { ok: res.ok, semSolucao: res.semSolucao, secoes: res.secoes } };
  }

  var TXT_PILARES = "pilares, pórtico e contraventamento não verificados — projeto do RT";
  var TXT_LAJE = "confirmar a laje com o RT: os pontaletes descarregam cargas concentradas na laje (ver cargasNaLaje)";
  var PREMISSAS_LACO = ["terça CONTÍNUA sobre os apoios, com emendas SOBRE os apoios (peça comercial de até 6 m — a mais comprida é cortada na linha de apoio no modelo); o que passa do último apoio é balanço verificado (limBalanco), inclusive o beiral",
    "terça SEM correntes: flexão oblíqua verificada (σx/f + km·σy/f nos dois eixos) com a componente paralela ao plano; o caibro NÃO é contado como travamento",
    "pontalete rotulado nas duas pontas, L0 = H, travado por mão-francesa nas duas direções (peças no modelo); compressão e flambagem pela NBR 7190-1:2022 (circular pelo circular2022)"];
  function concluirLaco(prep, laco) {
    var motivos = [], secoes = {}, nv = ["componente paralela ao plano nas vigas e nos caibros (axial, resolvida pelo contraventamento e pela fixação — conferir)", "detalhe do aparelho de apoio e das emendas (o desenho marca o corte; o detalhe é do projeto)"], ap = prep.apoio, tipo = ap.tipo;
    var sis = "laço de terças (" + tipo + ")";
    if (!laco.ok) {
      /* sem solução: NADA de seção falsa — mantém a de partida (o modelo de antes) e diz que não fechou */
      motivos.push(laco.motivo || "não fechou");
      var c0 = montarCalc(prep, { sistema: sis, secoes: {}, preliminar: true, motivos: motivos.concat(tipo === "pilares" ? [TXT_PILARES] : []), espTerca: prep.trama.espTerca, naoVerificado: nv, avisos: [] });
      c0.semSolucao = true; c0.premissas = PREMISSAS_LACO.slice(0, 1);
      return { ok: true, calc: c0, resumo: "SEM SOLUÇÃO — " + motivos[0] };
    }
    secoes.terca = { b: laco.terca.b, h: laco.terca.h };
    if (laco.caibro) secoes.caibro = { b: laco.caibro.b, h: laco.caibro.h };
    if (laco.viga) secoes.viga = { b: laco.viga.b, h: laco.viga.h };
    var pil = prep.ctx && prep.ctx.pilares;
    if (laco.pontalete && laco.pontalete.ok && !(tipo === "pilares" && pil && pil.madeira)) secoes.pontalete = { b: laco.pontalete.b, h: laco.pontalete.h };
    var vento = laco.vento, ligs = arr(laco.ligacoes);
    if (!vento) { var vm = prep.ctx && prep.ctx.vento && prep.ctx.vento.motivo ? prep.ctx.vento.motivo : "sem V0"; motivos.push("vento NÃO verificado: " + vm + " — informe a cidade/coordenadas e recalcule"); }
    else if (vento.premissa) motivos.push(vento.premissa);
    ligs.forEach(function (l) { if (!l.ok) motivos.push("ligação: " + l.texto); });
    if (tipo === "pilares") motivos.push(TXT_PILARES);
    if (tipo === "laje") motivos.push(TXT_LAJE);
    if (tipo === "paredes") motivos.push("ligação frechal × parede (chumbador/cinta) NÃO verificada" + (ligs.length && ligs[0].F ? " — arrancamento de " + virg(ligs[0].F, 2) + " kN por apoio" : "") + ": projeto do RT");
    var calc = montarCalc(prep, { sistema: sis, secoes: secoes, preliminar: motivos.length > 0, motivos: motivos, espApoio: tipo === "pilares" ? Math.max(laco.terca.vao || 0, prep.linhasPilares ? prep.linhasPilares.vaoMax : 0.5, 0.5) : laco.terca.vao, espTerca: prep.trama.espTerca,
      eta: { terca: laco.terca.eta, caibro: laco.caibro ? laco.caibro.eta : null, viga: laco.viga ? laco.viga.eta : null, flexao: laco.terca.etaFlexao, cisalhamento: laco.terca.etaCisalh, flecha: laco.terca.etaFlecha, concentrada: laco.terca.etaConcentrada, obliqua: laco.terca.etaObliqua, ventoSuccao: laco.terca.etaVentoSuccao, ventoPressao: laco.terca.etaVentoPressao, pontalete: laco.pontalete ? laco.pontalete.eta : null },
      avisos: arr(laco.avisos), naoVerificado: nv, v0: vento ? vento.v0 : null });
    calc.laco = { vao: laco.terca.vao, apoios: laco.terca.apoios, balanco: laco.terca.balanco, classe: laco.classe, sobrecarga: laco.sobrecarga.q, historico: arr(laco.historico).slice(0, 10) };
    calc.continua = true; calc.contravento = !!(laco.pontalete); calc.premissas = PREMISSAS_LACO.slice();
    if (vento) calc.vento = { pmin: vento.pmin, pmax: vento.pmax, v0: vento.v0, texto: vento.texto };
    if (laco.pontalete) calc.pontalete = { ok: laco.pontalete.ok === true, b: laco.pontalete.b, h: laco.pontalete.h, H: laco.pontalete.H, N: laco.pontalete.N, eta: laco.pontalete.eta, circ: laco.pontalete.circ, pilarMadeira: !!(pil && pil.madeira) };
    calc.ligacoes = ligs.map(function (l) { return { ok: l.ok, F: l.F, n: l.n || 0, texto: l.texto }; }).slice(0, 6);
    if (tipo === "laje") {
      /* o critério de "meio da laje" (m): o da cfg, o do telhado (op) ou o padrão da RA (js/bimtelhadoauto.js DIST_MEIO) — declarado no cálculo */
      calc.distMeio = fin(prep.cfg.distMeio) ? prep.cfg.distMeio : (fin(prep.lido.t.distMeio) ? prep.lido.t.distMeio : (dep("BimTelhadoAuto", "./bimtelhadoauto.js") || { DIST_MEIO: 0.5 }).DIST_MEIO);
      calc.cargasNaLaje = cargasNaLaje(prep, calc, laco);
      var vgs = calc.cargasNaLaje.vigas; delete calc.cargasNaLaje.vigas;   /* só para verificar: o que fica no cálculo é vigasDistribuicao (o calcMadeira tem teto de 24 mil caracteres) */
      if (vgs.length) {
        var vd = verVigasDistribuicao(prep, laco, vgs);
        calc.vigasDistribuicao = { ok: vd.ok, secao: vd.secao, vigas: vd.vigas, calco: vd.calco, pontalete: vd.pontalete, limites: vd.limites, alfaN: vd.alfaN, premissa: vd.premissa, cargaPontalete_kN: vd.cargaPontalete_kN, criterio: "pontalete a mais de " + virg(calc.distMeio) + " m do eixo da parede/viga mais perto = meio da laje" };
        calc.cargasNasParedes = vd.cargasNasParedes;
        if (vd.secao) calc.secoes.vigadist = { b: vd.secao.b, h: vd.secao.h };
        if (vd.ok) { calc.secoes.vigadist = { b: vd.secao.b, h: vd.secao.h }; calc.motivos.push("viga de distribuição " + virg(vd.secao.b * 100, 0) + "×" + virg(vd.secao.h * 100, 0) + " cm (" + vgs.length + " viga(s), " + calc.cargasNaLaje.viaVigaDistribuicao + " pontaletes do meio da laje): " + vd.premissa); }
        else { calc.preliminar = true; calc.semSolucao = true; calc.motivos.unshift(vd.motivo); }
        calc.motivos = calc.motivos.slice(0, 8);
      }
    }
    return { ok: true, calc: calc, resumo: resumo(calc) };
  }
  /* as CARGAS que os pontaletes descarregam na laje (kN característico = de cálculo / 1,4) nos pontos reais: pelo próprio modelo de madeira (peças pontalete com apoio "laje") */
  function cargasNaLaje(prep, calc, laco) {
    var E = ES(), out = { aviso: "confirmar a laje com o RT (punção, flexão local e carga total)", porPonto_kN: r3((laco.Rcomp || 0) / 1.4), n: 0, total_kN: 0, pontos: [], viaVigaDistribuicao: 0, vigas: [] };
    if (!E || !E.modelar || !prep.estado) return out;
    try {
      var t2 = clone(prep.lido.t); t2.modelo = calc.modelo; t2.calcMadeira = calc;
      var pk = E.modelar(t2, prep.estado, {}), pts = [];
      arr(pk && pk.pecas).forEach(function (o) {
        if (o.p === "pontalete" && o.apoio === "laje") { if (o.viga) out.viaVigaDistribuicao++; else pts.push({ x: r3(o.a[0]), z: r3(o.a[2]), kN: out.porPonto_kN }); }   /* sobre viga de distribuição a carga vai para as paredes, não para a laje */
        if (o.p === "vigadist") out.vigas.push({ id: o.vd, L: r3(o.L - (o.ext0 || 0) - (o.ext1 || 0)), Lfis: r3(o.L), espApoio: o.espApoio, apoios: arr(o.apoiosVd), cargas: arr(o.cargas).map(function (q) { return { x: q.x, z: q.z, s: q.s }; }) });
      });
      out.n = pts.length; out.total_kN = r3(pts.length * out.porPonto_kN); out.pontos = pts.slice(0, 60);
    } catch (e) { out.erro = String(e && e.message || e).slice(0, 80); }
    return out;
  }
  /* VIGA DE DISTRIBUIÇÃO (js/bimtelhadoauto.js): o pontalete que cairia no meio da laje apoia numa viga de madeira sobre COXINS nas paredes/vigas, de parede a parede.
     Verificada como viga biapoiada (NBR 7190-1:2022, MadDim.vigaFletida: flexão, cisalhamento, flecha) + ESTABILIDADE LATERAL (6.5.6, L1 = o vão: sem travamento) +
     σc90 no apoio (viga até a face oposta da parede: lb = espessura) e sob o pontalete (6.3.3: fc90,d = 0,25·fc0,d·αn, αn = 1,0 adotado). Peso próprio + uma carga pontual por
     pontalete (a reação de cálculo). A laje NÃO ajuda (premissa conservadora). Madeira SERRADA limitada ao catálogo (h e comprimento); sem MLC no catálogo → PRELIMINAR. */
  var ALFA_N = 1.0;   /* αn adotado (6.3.3): o valor tabelado depende do comprimento do apoio e é ≥ 1,0 — 1,0 é o conservador */
  function limitesSerrada() { var T = dep("BimTelhadoAuto", "./bimtelhadoauto.js"); return T && T.limitesSerrada ? T.limitesSerrada() : { hMax: 0.25, Lmax: 5, mlc: false }; }
  function verVigasDistribuicao(prep, laco, vigas) {
    var D = MD(), perfL = perfilVigas(prep.ctx.obra), classe = laco.classe || CLASSE_PADRAO, Nk = (laco.Rcomp || 0) / 1.4, res = null, i, lim = limitesSerrada();
    var pr = D.perfilEResist(classe, perfL), fc90d = 0.25 * pr.f.fc0d * ALFA_N, bPont = laco.pontalete && laco.pontalete.b ? laco.pontalete.b : 0.08, limVao = perfL.limVao || 300;
    var grade = GRADE_VIGA.filter(function (g) { return g.h <= lim.hMax + 1e-9; });
    var Lfis = Math.max.apply(null, vigas.map(function (v) { return v.Lfis || v.L; })), forcaPont = 1.4 * Nk;
    function conferir(sec) {
      var lista = [], todas = true;
      vigas.forEach(function (v) {
        var Lv = v.L, r = D.vigaFletida({ L: Lv, apoios: [0, Lv], G: { d: [[0, Lv, G_MAD * sec.b * sec.h]], p: v.cargas.map(function (c) { return [Math.max(0.05, Math.min(Lv - 0.05, c.s)), Nk]; }) }, Q: { d: [], p: [] }, b: sec.b, h: sec.h, classe: classe, perfil: perfL });
        var ks = Object.keys(r.reacoes).sort(function (a, b) { return Number(a) - Number(b); }), R0 = 1.4 * (r.reacoes[ks[0]][0] + r.reacoes[ks[0]][1]), R1 = 1.4 * (r.reacoes[ks[ks.length - 1]][0] + r.reacoes[ks[ks.length - 1]][1]);
        var sMd = r.Md / (sec.b * sec.h * sec.h / 6) / 1e3, el = D.estabilidadeLateral2022({ b: sec.b, h: sec.h, L1: Lv, sigmaMd: sMd, classe: classe, perfil: perfL });
        var lb0 = v.espApoio ? v.espApoio[0] : 0.15, lb1 = v.espApoio ? v.espApoio[1] : 0.15, s0 = R0 / (sec.b * lb0) / 1e3, s1 = R1 / (sec.b * lb1) / 1e3, sApoio = Math.max(s0, s1);
        var w = r.eta_flecha * Lv / limVao;   /* flecha final (m) = η·L/limite */
        var ok = r.ok && el.ok && sApoio <= fc90d + 1e-9;
        lista.push({ id: v.id, L: r3(Lv), Lfisico: r3(v.Lfis || Lv), apoios: v.apoios, nPontaletes: v.cargas.length, eta: r3(r.eta), etaFlexao: r3(r.eta_flexao), etaCisalh: r3(r.eta_cisalh), etaFlecha: r3(r.eta_flecha), flecha_mm: r3(w * 1000),
          etaLateral: r3(el.eta), lateralDispensada: !!el.dispensa, L1: r3(Lv), sigmaC90_MPa: r3(sApoio), etaC90Apoio: r3(sApoio / fc90d), reacaoApoio_kN: r3(Math.max(R0, R1)), reacoes: [r3(R0), r3(R1)], ok: ok });
        if (!ok) todas = false;
      });
      return { ok: todas, lista: lista };
    }
    var etaPont = forcaPont / (bPont * bPont) / 1e3 / fc90d, pontOk = etaPont <= 1 + 1e-9;
    if (Lfis <= lim.Lmax + 1e-9) for (i = 0; i < grade.length; i++) { var c = conferir(grade[i]); if (c.ok) { res = { ok: true, secao: { b: grade[i].b, h: grade[i].h }, vigas: c.lista }; break; } }
    if (!res) {
      var u = grade[grade.length - 1], cu = conferir(u);
      res = { ok: false, secao: null, vigas: cu.lista, motivo: (Lfis > lim.Lmax + 1e-9 ? "A viga de distribuição teria " + virg(Lfis) + " m (o catálogo de madeira serrada vai até " + virg(lim.Lmax, 0) + " m). " : "Nenhuma viga serrada até " + virg(u.b * 100, 0) + "×" + virg(u.h * 100, 0) + " cm (limite do catálogo: h ≤ " + virg(lim.hMax * 100, 0) + " cm) fecha com " + virg(Nk, 1) + " kN por pontalete (flexão, flecha, estabilidade lateral e σc90). ") +
        (lim.mlc ? "Use MLC do catálogo." : "O catálogo NÃO tem MLC: resultado PRELIMINAR — ponha apoio intermediário de CONCRETO (parede ou viga de concreto) perto dos pontaletes ou aumente o espaçamento das terças.") };
    }
    /* o COXIM sob a viga: folga MAIOR que a flecha final calculada; verificado à compressão normal (mesma área do apoio: b × lb) */
    var wMax = Math.max.apply(null, res.vigas.map(function (v) { return v.flecha_mm; })) / 1000, hC = Math.max(0.05, Math.ceil((wMax + 0.01) * 100 - 1e-9) / 100), bC = res.secao ? res.secao.b : 0.08;
    var sCx = Math.max.apply(null, res.vigas.map(function (v) { return v.sigmaC90_MPa; })), calcoOk = sCx <= fc90d + 1e-9;
    res.calco = { b: bC, h: hC, lb: "= espessura da parede (a viga vai até a face oposta)", folga_mm: r3(hC * 1000 - wMax * 1000), flecha_mm: r3(wMax * 1000), sigmaC90_MPa: r3(sCx), fc90d_MPa: r3(fc90d), eta: r3(sCx / fc90d), ok: calcoOk && res.ok };
    res.pontalete = { sigmaC90_MPa: r3(forcaPont / (bPont * bPont) / 1e3), fc90d_MPa: r3(fc90d), eta: r3(etaPont), ok: pontOk, bPontalete: bPont };
    if (!pontOk) { res.ok = false; res.motivo = (res.motivo ? res.motivo + " " : "") + "σc90 sob o pontalete (" + virg(res.pontalete.sigmaC90_MPa, 2) + " MPa) passa de fc90,d = " + virg(fc90d, 2) + " MPa: aumente a seção do pontalete (a viga não resolve)."; }
    /* as CARGAS NAS PAREDES: a reação de cálculo de cada viga em cada apoio, somada por apoio */
    var soma = {}; res.vigas.forEach(function (v, k) { [0, 1].forEach(function (e) { var ap = vigas[k].apoios[e]; soma[ap] = soma[ap] || { apoio: ap, kN: 0, vigas: 0 }; soma[ap].kN += v.reacoes[e]; soma[ap].vigas++; }); });
    res.cargasNasParedes = Object.keys(soma).map(function (k) { return { apoio: soma[k].apoio, kN: r3(soma[k].kN), vigas: soma[k].vigas }; });
    res.limites = { hMax_m: lim.hMax, Lmax_m: lim.Lmax, mlcNoCatalogo: lim.mlc, fonte: "catálogo de madeira serrada (js/madcatalogo.js); h ≤ 25 cm e L ≤ 5 m salvo se o catálogo tiver mais" };
    res.cargaPontalete_kN = r3(Nk); res.alfaN = ALFA_N;
    res.premissa = "viga biapoiada nas paredes, sem a ajuda da laje, sobre COXINS de madeira com folga acima da flecha; estabilidade lateral com L1 = o vão (sem travamento); σc90 no apoio com lb = espessura da parede e sob o pontalete, fc90,d = 0,25·fc0,d·αn com αn = " + virg(ALFA_N, 1) + " (adotado, conservador); carga = reação de cálculo do pontalete; seção única (a pior). Resistência da alvenaria/concreto sob o coxim e a laje sob as cargas diretas: RT";
    return res;
  }

  function montarCalc(prep, partes) {
    var lido = prep.lido, ap = prep.apoio, c = {
      versao: VERSAO, tipo: lido.tipo, sistema: partes.sistema, apoio: ap.tipo, apoioAuto: !!ap.automatico, aparente: !!prep.cfg.aparente, ligacaoOculta: !!prep.cfg.ligacaoOculta,
      preliminar: !!partes.preliminar, motivos: arr(partes.motivos).slice(0, 8), secoes: partes.secoes, chave: prep.chave, classe: prep.classe,
      pesoTelha: prep.pesos.telha, pesoTrama: prep.pesos.total - prep.pesos.telha, pesoTotal: prep.pesos.total, modelo: prep.modelo,
      cfg: { apoio: prep.cfg.apoio || null, tesoura: prep.cfg.tesoura || null, fechamento: prep.cfg.fechamento || null, aparente: !!prep.cfg.aparente, ligacaoOculta: !!prep.cfg.ligacaoOculta, forro: !!prep.cfg.forro }
    };
    if (prep.cfg.sistema === "laco") c.cfg.sistema = "laco";   /* quem pediu o laço de vigas + terças (em vez da tesoura do quiosque) guarda a escolha: senão a situação() acharia o cálculo desatualizado */
    if (partes.espApoio != null) c.espApoio = r3(partes.espApoio);
    if (partes.espTerca != null) c.espTerca = r3(partes.espTerca);
    if (ap.tipo === "pilares" && ap.pontos.length) c.pontosApoio = ap.pontos.slice(0, 48);
    if (partes.eta) c.eta = partes.eta;
    if (partes.semPeca && partes.semPeca.length) c.semPeca = partes.semPeca.slice(0, 12);
    if (partes.pecasMotor && partes.pecasMotor.length) c.pecasMotor = partes.pecasMotor;
    if (partes.v0 != null) c.v0 = partes.v0;
    c.avisos = arr(partes.avisos).concat(prep.avisos).slice(0, 12);
    c.naoVerificado = arr(partes.naoVerificado).slice(0, 8);
    if (partes.tentativas) c.tentativas = partes.tentativas;
    return c;
  }

  function rodarLaco(prep) { return concluirLaco(prep, lacoVigas(prep.ctx)); }

  /* Node/testes: tudo de uma vez (o motor de tesouras leva minutos: a tela usa o Worker e chama concluirMotor) */
  function calcularSync(estado, id, cfg, opc) {
    opc = opc || {};
    var prep = preparar(estado, id, cfg, opc); if (!prep.ok) return prep;
    if (prep.via === "laco") return ext({ prep: prep }, rodarLaco(prep));
    var W = dep("MadEngWorker", "./madengworker.js"), out, tent = [];
    for (;;) {
      var res = W.rodar(prep.sol, opc.progresso || null);
      out = concluirMotor(prep, res);
      if (!out.repetir) break;
      tent.push(out.tentativa);
      prep = proximaTentativa(prep);
    }
    if (out.calc && tent.length) out.calc.tentativas = { anteriores: tent, final: out.calc.tentativas };
    out.prep = prep; return out;
  }
  function proximaTentativa(prep) {
    var p = ext({}, prep); p.tentativa = prep.tentativa + 1; p.sTes = prep.tentativas[p.tentativa];
    p.estadoMad = montarEstadoMadeira(clone(prep.estadoMad), p);
    var W = dep("MadEngWorker", "./madengworker.js"); p.sol = W.solicitacao(p.estadoMad, "A"); p.avisos = prep.avisos.concat(["Espaçamento das tesouras reduzido para " + virg(p.sTes) + " m (a tentativa anterior não fechou)."]);
    return p;
  }

  /* ------------------------------------------------------------ as OPS que levam o resultado de volta ao modelo */
  function opAplicar(id, calc) {
    var op = { op: "telhado", id: String(id), calcMadeira: calc };
    if (calc && calc.modelo) op.modelo = calc.modelo;
    return op;
  }
  function opLimpar(id) { return { op: "telhado", id: String(id), calcMadeira: null }; }

  /* o estado do cálculo de um telhado: não calculado / em dia / DESATUALIZADO (a delimitação, o beiral, a telha, o apoio ou o nível mudaram) */
  function situacao(estado, id) {
    var t = achar(estado, id); if (!t) return { calculado: false, motivo: "telhado inexistente" };
    var c = t.calcMadeira; if (!c) return { calculado: false };
    var lido = lerTelhado(estado, id);
    if (!lido.ok) return { calculado: true, desatualizado: true, preliminar: !!c.preliminar, motivo: lido.motivo, calc: c };
    var cf = cfgEfetiva(c), ap = detectarApoio(estado, lido, cf), nova, sug = null;
    if ((c.versao || 1) === 1 && !c.motor) nova = chaveDe(lido, c.cfg || {}, ap, 1);   /* cálculo antigo: mesma regra de antes (C1: abrir não recalcula) */
    else nova = chaveDe(lido, chaveCfg(cf, tipologiaDe(lido, ap, cf), ap), ap);
    if (cf !== (c.cfg || {}) && lido.tipo === "T2" && ap.tipo === "pilares") {   /* gravado pelo laço antes do quiosque: a tesoura vira SUGESTÃO, nunca recálculo */
      var pt = pilaresTesoura(lido, ap, ext({}, c.cfg || {}));
      if (pt && pt.ok) sug = { tesoura: true, texto: "Este telhado de 2 águas sobre pilares foi calculado pelo laço de vigas + terças. Os pilares do modelo encaixam na TESOURA T2 apoiada no frechal (PRELIMINAR): o cálculo atual foi mantido; use \"Trocar para tesoura\" para recalcular." };
    }
    return { calculado: true, desatualizado: nova !== c.chave, preliminar: !!c.preliminar, calc: c, chaveNova: nova, sugestaoTesoura: sug };
  }

  /* as peças do pacote que saíram do cálculo (para a tela e o teste): papel → { n, b, h } */
  function pecasCalculadas(t) {
    var out = {}; arr(t && t.pacote && t.pacote.pecas).forEach(function (o) { if (!o.calc) return; var k = o.p; out[k] = out[k] || { n: 0, b: o.w, h: o.h, m: 0 }; out[k].n++; out[k].m += o.L || 0; });
    return out;
  }

  /* PONTO DE LIGAÇÃO COM O madencaixe (outra frente) — opcional */
  function encaixe(pacote, calc) {
    var E = global.MadEncaixe || (typeof require === "function" ? (function () { try { return require("./madencaixe.js"); } catch (e) { return null; } })() : null);
    if (E && E.aplicarCobertura) { try { return { ok: true, usado: true, r: E.aplicarCobertura(pacote, calc) }; } catch (e2) { return { ok: false, usado: true, motivo: String(e2 && e2.message || e2) }; } }
    return { ok: true, usado: false, motivo: "js/madencaixe.js ainda não está no sistema: as peças saem retas, sem corte de encaixe." };
  }

  function resumo(c) {
    if (!c) return "";
    var s = c.secoes || {}, ks = Object.keys(s).map(function (k) { return k + " " + virg(s[k].b * 100, 0) + "×" + virg(s[k].h * 100, 0) + " cm"; });
    return (c.preliminar ? "PRELIMINAR — " : "") + c.sistema + (c.aparente ? ", aparente" : "") + ": " + (ks.length ? ks.join("; ") : "sem seções") + (c.espApoio ? "; apoios a ≤ " + virg(c.espApoio) + " m" : "") + ".";
  }

  var MadCobertura = {
    VERSAO: VERSAO, GRADE_TERCA: GRADE_TERCA, GRADE_CAIBRO: GRADE_CAIBRO, MAPA_GRUPOS: MAPA_GRUPOS, CLASSE_PADRAO: CLASSE_PADRAO,
    lerTelhado: lerTelhado, lerTelhadoObj: lerTelhadoObj, axisLido: axisLido, normalizarContorno: normalizarContorno, normalizarArestas: normalizarArestas, descreverForma: descreverForma, tipologiaDe: tipologiaDe, detectarApoio: detectarApoio, modeloMadeira: modeloMadeira, trama: trama, pesos: pesos, lacoVigas: lacoVigas,
    preparar: preparar, concluirMotor: concluirMotor, concluirLaco: concluirLaco, rodarLaco: rodarLaco, proximaTentativa: proximaTentativa, calcularSync: calcularSync,
    secoesDoMotor: secoesDoMotor, pecasDoMotor: pecasDoMotor, opAplicar: opAplicar, opLimpar: opLimpar, situacao: situacao, pecasCalculadas: pecasCalculadas, encaixe: encaixe, resumo: resumo, chaveDe: chaveDe,
    cfgEfetiva: cfgEfetiva, montarEstadoMadeira: montarEstadoMadeira, vaosDosPontos: vaosDosPontos, pilaresTesoura: pilaresTesoura, pilaresDoModelo: pilaresDoModelo
  };
  global.MadCobertura = MadCobertura;
  if (typeof module !== "undefined" && module.exports) module.exports = MadCobertura;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

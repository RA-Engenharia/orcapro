/* =====================================================================
 * metaldetalhe.js — METÁLICA: ACABAMENTO DE FABRICAÇÃO do guarda-corpo,
 * corrimão, travessa e rodapé (motor PURO, ES5, sem DOM, Node-testável).
 * Frente S10, fase 1 — 14/10/2026.
 *
 * Pedido do Rogério (14/10/2026): "tem que ter o ACABAMENTO certinho: onde
 * finaliza o guarda-corpo, o acabamento BOLEADO; nada de ficar de qualquer
 * jeito, tem que encontrar; o 45 graus certinho na solda, no corte da peça —
 * porque isso tem que ir para as PRANCHAS bem arrumadinho, e na modelagem
 * também."
 *
 * O QUE ESTE MOTOR FAZ (o js/metalprontas.js guardaCorpo chama este aqui por
 * um gancho; sem este arquivo o gerador antigo continua):
 *   MEIA-ESQUADRIA  em todo canto do caminho (planta ou elevação — corrimão
 *                   da escada encontrando o do patamar) as duas barras do
 *                   mesmo perfil são cortadas na BISSETRIZ: o plano do corte
 *                   tem a normal u1 + u2 e passa no nó, as duas pontas caem
 *                   no MESMO plano — sem sobreposição e sem vão. Comprimento
 *                   pelo eixo = nó a nó; externo/interno = eixo ± r·|Δk|
 *                   (k = tangentes do corte nas duas pontas). Solda de TOPO
 *                   em todo o contorno.
 *   MONTANTE × TRAVESSÃO  o travessão superior passa por CIMA do montante:
 *                   montante maior que o tubo do travessão → corte (reto ou
 *                   inclinado, paralelo ao travessão) + CHAPA DE TOPO; menor
 *                   ou igual, ou nó com dois travessões de inclinação
 *                   diferente → BOCA DE LOBO (a ponta do montante na forma do
 *                   tubo, js/metalpeca.js `bocas`).
 *   TRAVESSA × MONTANTE   as travessas e os corrimãos de baixo correm pela
 *                   FACE INTERNA dos montantes (tangentes, soldadas — nada
 *                   atravessando); o CORRIMÃO (alturas da NBR 9050) fica a
 *                   40 mm da face com um SUPORTE (barra Ø 16) em cada
 *                   montante, e é contínuo como a NBR 9050 pede.
 *   RODAPÉ          chapa na face interna dos montantes, encontro a TOPO nos
 *                   cantos em planta (uma passa, a outra encosta) e em
 *                   meia-esquadria pelo contorno nas dobras da elevação;
 *                   ponta livre chanfrada (arremate).
 *   TERMINAIS       nas pontas livres: "retorno" (curva de 180° voltando ao
 *                   montante, ponta em boca de lobo), "curva" (curva de 90°
 *                   para baixo + perna + tampão) ou "tampao" (chapa de 3 mm
 *                   no tubo aberto). Raio de partida R = 2·D pela linha de
 *                   centro — prática de curvamento a frio de tubo, NÃO é
 *                   número de norma: conferir com o curvador. Desenvolvimento
 *                   = R·θ (o comprimento de corte da curva).
 *   FIXAÇÃO         a base do montante sai SOLDADA (filete em todo o contorno)
 *                   no que está embaixo: a viga de aço ou a chapa chumbada que
 *                   o js/metalacessos.js põe no concreto (fixacao "chapa").
 *
 * Referências (sem inventar item): NBR 9050:2020, seção 6.9 (corrimãos) —
 * prolongamento de 0,30 m (6.9.2.2 pela lista federal da IN MPDG 2/2017, que
 * cita a edição de 2015) e extremidades com acabamento recurvado (o item
 * exato a conferir no texto da norma, que não está na biblioteca da RA);
 * NR-12, Anexo III, 7 (alturas do guarda-corpo). Simbologia de solda AWS
 * A2.4 (Padrão RA, estrutura_metalica.simbolos_de_solda).
 *
 * API
 *   MetalDetalhe.meiaEsquadria(u1, u2, b)  → { canto (°, interno), deflexao,
 *        corteEixo (° do corte com o eixo = canto/2), serra (° no esquadro),
 *        desconto (m, b/2·tg(deflexão/2) em cada ponta), normal }
 *   MetalDetalhe.comprimentos(L, r, kIni, kFim) → { eixo, externo, interno }
 *   MetalDetalhe.bocaDeLobo(Rrecebe, r) → { ext (m), recuo (m) } (eixos a 90°)
 *   MetalDetalhe.retorno(D, ang, o) → { R, ang, desenvolvimento }
 *   MetalDetalhe.guardaCorpo(K, pts, o, H) → nº de peças (o gerador)
 *   MetalDetalhe.interferencias(caixas, o) → [{ a, b, n, ponto }] sólido × sólido
 *   MetalDetalhe.dadosDetalhe(caixas) / desenharDetalheTipico(D, geo, E, d)
 *   MetalDetalhe.defDetalheTipico(caixas) → { id, titulo, desenhar } (folha)
 *   MetalDetalhe.ligar(bool) → liga/desliga o acabamento (controle negativo)
 * Teste: node tools/test-metal-detalhe.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  var UP = [0, 1, 0], GRAU = Math.PI / 180;
  var LIGADO = true;

  /* -------------------------------------------------------------- padrões
   * ⚠ VALORES DE PARTIDA (a fábrica confere): raio da curva = 2·D pela linha de centro (prática de curvamento a frio
   * de tubo; não é número de norma); chapa de topo do montante 6,35 mm; tampão 3 mm; folga do corrimão à face 40 mm
   * (a mesma do corrimão de parede, js/acoacessos.js npt011-folga); suporte em barra redonda Ø 16; perna mínima de
   * filete 3 mm para parede até 6,35 mm (NBR 8800, Tabela 10 na edição de 2008) — usamos 4 mm nas travessas e a perna
   * do guarda-corpo (6 mm) na base do montante. */
  var PADRAO = { kR: 2, tTopo: 0.00635, tTampao: 0.003, folgaCorrimao: 0.04, dSuporte: 0.016, retornoReto: 0.05, pernaCurva: 0.10, chanfroRodape: 0.02, pernaTravessa: 4, pernaBase: 6 };

  /* ===================================================== GEOMETRIA DO CORTE */
  /* a base ortonormal da peça (a mesma do js/metalpeca.js base()) */
  function base(ex, ey) {
    var X = unit(ex) || [1, 0, 0], Y = sub(ey, mul(X, dot(ey, X)));
    if (len(Y) < 1e-9) Y = Math.abs(X[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    Y = unit(sub(Y, mul(X, dot(Y, X))));
    return { X: X, Y: Y, Z: cross(X, Y) };
  }
  /* o corte (graus na alma e na aba, convenção do js/metalpeca.js) para o plano de normal n na ponta */
  function corte(X, Y, n) {
    var Z = cross(X, Y), kx = dot(n, X); if (Math.abs(kx) < 1e-9) return { alma: 0, aba: 0, k: [0, 0] };
    var ka = -dot(n, Z) / kx, kb = -dot(n, Y) / kx, cl = function (g) { return Math.max(-75, Math.min(75, g)); };
    return { alma: r4(cl(Math.atan(kb) / GRAU)), aba: r4(cl(Math.atan(ka) / GRAU)), k: [ka, kb] };
  }
  /* MEIA-ESQUADRIA entre o trecho que chega (u1) e o que sai (u2): b = a largura do perfil no plano do canto */
  function meiaEsquadria(u1, u2, b) {
    var a = unit(u1), c = unit(u2); if (!a || !c) return null;
    var cs = Math.max(-1, Math.min(1, dot(a, c))), def = Math.acos(cs) / GRAU, canto = 180 - def, n = unit(add(a, c));
    return { canto: r4(canto), deflexao: r4(def), corteEixo: r4(canto / 2), serra: r4(90 - canto / 2), desconto: r6(num(b, 0) / 2 * Math.tan(def / 2 * GRAU)), normal: n };
  }
  /* comprimentos de corte da barra de eixo L e meia-largura r com as pontas k (tangentes [ka, kb]) */
  function comprimentos(L, r, kIni, kFim, rb) {
    kIni = kIni || [0, 0]; kFim = kFim || [0, 0]; rb = rb == null ? r : rb;
    var da = kFim[0] - kIni[0], db = kFim[1] - kIni[1];
    /* tubo redondo: o extremo de (da·a + db·b) no círculo de raio r = r·|Δk|; retangular: |da|·r + |db|·rb */
    var ext = rb === r ? r * Math.sqrt(da * da + db * db) : Math.abs(da) * r + Math.abs(db) * rb;
    return { eixo: r6(L), externo: r6(L + ext), interno: r6(L - ext) };
  }
  /* BOCA DE LOBO de um tubo de raio r num tubo de raio R com os eixos a 90°: a ponta pelo eixo fica a R do eixo que
     recebe; a geratriz do lado chega a √(R² − r²) — o tubo é ext = R − √(R² − r²) mais comprido nos lados */
  function bocaDeLobo(R, r) { R = num(R, 0); r = Math.min(num(r, 0), R); return { recuo: r6(R), ext: r6(R - Math.sqrt(Math.max(0, R * R - r * r))) }; }
  /* a CURVA de retorno: R = kR·D (partida), desenvolvimento = R·θ */
  function retorno(D, ang, o) {
    o = o || {}; var R = num(o.R, 0) > 0 ? num(o.R, 0) : PADRAO.kR * num(D, 0), th = num(ang, 90);
    return { R: r6(R), ang: th, desenvolvimento: r6(R * th * GRAU), fonte: "R = " + PADRAO.kR + "·D pela linha de centro (prática de curvamento a frio de tubo - conferir com o curvador)" };
  }
  /* o cilindro (eixo em `e` passando por Q, raio R) na base da ponta (Pend, X, Y, Z) — o formato `bocas` do js/metalpeca.js */
  function cilLocal(Pend, b, e, Q, R) {
    var d = sub(Q, Pend);
    return { R: R, e: [dot(e, b.Z), dot(e, b.Y), dot(e, b.X)], c: [dot(d, b.Z), dot(d, b.Y), dot(d, b.X)] };
  }
  /* onde a linha do eixo (a = b = 0) da barra encontra o cilindro (t a partir de Pend; fim: vindo de −X) */
  function tEixo(cl, fim) {
    var e = cl.e, w0 = [-cl.c[0], -cl.c[1], -cl.c[2]], d = [0, 0, 1], wp = sub(w0, mul(e, dot(w0, e))), dp = sub(d, mul(e, dot(d, e)));
    var A = dot(dp, dp), B = 2 * dot(wp, dp), C = dot(wp, wp) - cl.R * cl.R; if (A < 1e-12) return 0;
    var disc = B * B - 4 * A * C; if (disc < 0) return -B / (2 * A);
    return fim ? (-B - Math.sqrt(disc)) / (2 * A) : (-B + Math.sqrt(disc)) / (2 * A);
  }

  /* ===================================================== SEÇÃO */
  function raioDe(p) {
    if (!p) return 0.025;
    if (p.forma === "tubo-circ") return num(p.D, 0.05) / 2;
    if (p.forma === "circ") return num(p.d, 0.02) / 2;
    var s = BM() && BM().secao ? BM().secao(p) : null;
    return s && s.ok ? Math.max(s.larg, s.alt) / 2 : 0.025;
  }
  function ehTubo(p) { return p && (p.forma === "tubo-circ" || p.forma === "circ"); }

  /* ===================================================== O GUARDA-CORPO */
  function ligar(v) { LIGADO = v !== false; return LIGADO; }
  function ativo() { return LIGADO; }

  /* o lado INTERNO (onde correm travessas, corrimão e rodapé): fechado → o de dentro; aberto que dobra → o de dentro
     das dobras; reto → o que aponta para o eixo w = 0 (escada: para dentro da escada); senão a esquerda */
  function ladoInterno(pts, fechado, o) {
    if (o && (o.ladoInterno === 1 || o.ladoInterno === -1)) return o.ladoInterno;
    var area = 0, giro = 0, i;
    for (i = 0; i + 1 < pts.length; i++) area += pts[i][0] * pts[i + 1][2] - pts[i + 1][0] * pts[i][2];
    for (i = 1; i + 1 < pts.length; i++) {
      var a = sub(pts[i], pts[i - 1]), b = sub(pts[i + 1], pts[i]); a[1] = 0; b[1] = 0;
      if (len(a) > 1e-9 && len(b) > 1e-9) giro += Math.atan2(cross(a, b)[1], dot(a, b));
    }
    /* nL = UP × u (a esquerda de quem anda): o sinal certo para o giro / a área */
    var u0 = sub(pts[1], pts[0]); u0[1] = 0; u0 = unit(u0) || [1, 0, 0];
    var nL = unit(cross(UP, u0)) || [0, 0, 1];
    if (fechado && Math.abs(area) > 1e-9) return area < 0 ? 1 : -1;
    if (Math.abs(giro) > 1e-6) return giro > 0 ? 1 : -1;
    var w = 0; pts.forEach(function (q) { w += q[2]; }); w /= pts.length;
    if (Math.abs(w) > 1e-6) return dot(nL, [0, 0, -w]) > 0 ? 1 : -1;
    void nL;
    return 1;
  }
  /* o normal horizontal do trecho (planta) para o lado s */
  function normalLado(u, s) { var h = [u[0], 0, u[2]], n = unit(cross(UP, unit(h) || [1, 0, 0])) || [0, 0, 1]; return mul(n, s); }
  /* a polilinha deslocada de d para o lado s (cantos pelo encontro das paralelas; dobra só na elevação: d direto) */
  function deslocar(P, d, s, fechado) {
    var n = P.length, out = [];
    for (var i = 0; i < n; i++) {
      var ua = i > 0 ? unit(sub(P[i], P[i - 1])) : (fechado ? unit(sub(P[0], P[n - 2])) : null);
      var ub = i < n - 1 ? unit(sub(P[i + 1], P[i])) : (fechado ? unit(sub(P[1], P[0])) : null);
      var na = ua ? normalLado(ua, s) : null, nb = ub ? normalLado(ub, s) : null, m;
      if (na && nb) { var c = dot(na, nb); m = c > -0.95 ? mul(add(na, nb), 1 / (1 + c)) : nb; }
      else m = na || nb;
      out.push(add(P[i], mul(m, d)));
    }
    return out;
  }

  /* a barra de um trecho (A → B) com os cortes das pontas (planos de normal nIni / nFim; null = reto) */
  function barra(K, A, B, pc, nIni, nFim, op) {
    var d = sub(B, A), L = len(d), u = unit(d); if (!u || !(L > 0.01)) return null;
    var ey = Math.abs(u[1]) > 0.99 ? [1, 0, 0] : UP, b = base(u, ey), r = raioDe(pc);
    var ci = nIni ? corte(b.X, b.Y, nIni) : { alma: 0, aba: 0, k: [0, 0] }, cf = nFim ? corte(b.X, b.Y, nFim) : { alma: 0, aba: 0, k: [0, 0] };
    var q = { origem: A, ex: u, ey: ey, perfil: pc, L: L, cortes: { almaIni: ci.alma, abaIni: ci.aba, almaFim: cf.alma, abaFim: cf.aba }, papel: op.papel, ifc: op.ifc || "IFCRAILING", aco: op.aco, lig: op.lig, nome: op.nome };
    if (op.bocas) q.bocas = op.bocas;
    var c = K.perfil(q, op.conta || "guarda"); if (!c) return null;
    var cm = medirPontas(c) || comprimentos(L, r, ci.k, cf.k);
    c.metal.fab = { eixo: r1(L * 1000), externo: r1(cm.externo * 1000), interno: r1(cm.interno * 1000), ini: op.tipoIni || (nIni ? "meia-esquadria" : "reto"), fim: op.tipoFim || (nFim ? "meia-esquadria" : "reto"),
      angIni: nIni ? r1(90 - Math.abs(Math.atan(Math.sqrt(ci.k[0] * ci.k[0] + ci.k[1] * ci.k[1])) / GRAU)) : 90, angFim: nFim ? r1(90 - Math.abs(Math.atan(Math.sqrt(cf.k[0] * cf.k[0] + cf.k[1] * cf.k[1])) / GRAU)) : 90 };
    if (op.solda) c.metal.solda = op.solda;
    return c;
  }
  /* comprimento de cada geratriz da peça pronta (das pontas como o sólido as desenha: corte plano ou boca de lobo) —
     externo = a maior (o comprimento de corte), interno = a menor */
  function medirPontas(c) {
    var M = BM(); if (!M) return null;
    var s = M.solidos(c)[0]; if (!s || !s.poli || !s.poli.length) return null;
    var mx = -Infinity, mn = Infinity;
    s.poli.forEach(function (q) { var zA = dot(sub(s.ponto(q[0], q[1], s.z0), s.O), s.W), zB = dot(sub(s.ponto(q[0], q[1], s.z1), s.O), s.W), l = zB - zA; if (l > mx) mx = l; if (l < mn) mn = l; });
    return { externo: mx, interno: mn };
  }
  /* TAMPÃO: disco de t mm fechando o tubo na ponta P (normal w para fora) */
  function tampao(K, P, w, pc, op) {
    var r = raioDe(pc), ex = unit(cross(Math.abs(w[1]) > 0.9 ? [1, 0, 0] : UP, w)) || [1, 0, 0], ey = cross(w, ex);
    var C = []; for (var i = 0; i < 24; i++) { var a = 2 * Math.PI * i / 24; C.push([r * Math.cos(a), r * Math.sin(a)]); }
    var c = K.chapa({ origem: P, ex: ex, ey: ey, t: PADRAO.tTampao, contorno: C, papel: "Tampão do tubo", aco: op.aco, lig: op.lig, nome: "Tampão — " + op.nome, solda: { tipo: "filete", perna: 3, lados: "contorno", campo: false } }, "acabamento");
    if (c) c.metal.fab = { tampao: true, D: r1(2 * r * 1000), t: PADRAO.tTampao * 1000 };
    return c;
  }
  /* CURVA de θ graus a partir de P na direção w, dobrando para Dv (⊥ w) — devolve { fim, tangente } */
  function curva(K, P, w, Dv, pc, th, op) {
    var rt = retorno(2 * raioDe(pc), th, { R: op.R }), b = base(w, Dv), dir = "y";
    var c = K.perfil({ origem: P, ex: w, ey: Dv, perfil: pc, L: rt.desenvolvimento, curva: { R: rt.R, ang: th, dir: dir }, papel: op.papel || "Curva de retorno", ifc: "IFCRAILING", aco: op.aco, lig: op.lig, nome: (op.papel || "Curva") + " — " + op.nome, solda: { tipo: "topo", perna: 0, lados: "contorno", campo: false } }, "acabamento");
    if (c) c.metal.fab = { curva: true, R: r1(rt.R * 1000), ang: th, desenvolvimento: r1(rt.desenvolvimento * 1000), fonteR: rt.fonte };
    var f = th * GRAU, fim = add(add(P, mul(b.X, rt.R * Math.sin(f))), mul(b.Y, rt.R * (1 - Math.cos(f)))), tg = add(mul(b.X, Math.cos(f)), mul(b.Y, Math.sin(f)));
    return { peca: c, fim: fim, tangente: unit(tg) };
  }

  /* uma POLILINHA de barras do mesmo perfil (eixo Q): meia-esquadria em cada nó de dentro (e no fechamento); pontas
     livres retas. Devolve as pontas { ini: { P, w (para fora), ids }, fim: … } e os ids das barras. */
  function polilinha(K, Q, fechado, pc, op) {
    var n = Q.length, nS = n - 1, ids = [], nos = [];
    function u(j) { return unit(sub(Q[j + 1], Q[j])); }
    for (var j = 0; j < n; j++) {
      var a = j > 0 ? u(j - 1) : (fechado ? u(nS - 1) : null), b = j < nS ? u(j) : (fechado ? u(0) : null);
      nos.push(a && b && len(sub(a, b)) > 1e-6 ? unit(add(a, b)) : null);
    }
    var soldaTopo = { tipo: "topo", perna: 0, lados: "contorno", campo: false };
    for (var s = 0; s < nS; s++) {
      /* o TOCO horizontal da ponta inclinada é peça própria ("Toco da ponta …"): o travessão e o corrimão continuam um por trecho */
      var toco = op.tocos && ((s === 0 && op.tocos.ini) || (s === nS - 1 && op.tocos.fim));
      var c = barra(K, Q[s], Q[s + 1], pc, nos[s], nos[s + 1], { papel: toco ? op.papelToco || "Toco da ponta do guarda-corpo" : op.papel, aco: op.aco, lig: op.lig, nome: (toco ? "Toco — " : "") + op.nome + " — trecho " + (s + 1), conta: toco ? "acabamento" : op.conta,
        solda: op.solda || (nos[s] || nos[s + 1] ? soldaTopo : null) });
      if (c) ids.push(c.id);
    }
    return { ids: ids, ini: { P: Q[0], w: mul(u(0), -1) }, fim: { P: Q[n - 1], w: u(nS - 1) } };
  }
  /* a ponta livre de um eixo: horizontal → estica e; inclinada → um TOCO horizontal de e (o terminal fica num plano
     vertical — sem ele, o retorno de baixo da escada voltaria para dentro do montante) */
  function comToco(Q, e, ini) {
    var Q2 = Q.slice(), k = ini ? 0 : Q.length - 1, kk = ini ? 1 : Q.length - 2, u = unit(sub(Q[k], Q[kk]));
    if (!(e > 1e-6) || !u) return { Q: Q2, toco: null };
    if (Math.abs(u[1]) < 1e-6) { Q2[k] = add(Q[k], mul(u, e)); return { Q: Q2, toco: null }; }
    var h = unit([u[0], 0, u[2]]) || [1, 0, 0], Pn = add(Q[k], mul(h, e));
    if (ini) Q2.unshift(Pn); else Q2.push(Pn);
    return { Q: Q2, toco: h };
  }

  /* o GERADOR (mesmo contrato do js/metalprontas.js guardaCorpo: pts = a linha de BASE local, o = { gid, montante,
     corrimao, altura, alturas, corrimao2, espac, aco, rodape, tRodape, terminal?, perna? }) */
  function guardaCorpo(K, pts, o, H) {
    var lig = "gc-" + o.gid, pm = H.perfilDe(o.montante), pc = H.perfilDe(o.corrimao), Hg = num(o.altura, 1.1), aco = o.aco || "ASTM A36";
    if (!pm || !pc || pts.length < 2) return 0;
    var n0 = K.pecas.length, cont0 = JSON.parse(JSON.stringify(K.cont || {})), fechado = pts.length > 3 && len(sub(pts[0], pts[pts.length - 1])) < 1e-3;
    /* caminho sem trechos nulos */
    var P = [pts[0]]; for (var i0 = 1; i0 < pts.length; i0++) if (len(sub(pts[i0], P[P.length - 1])) > 0.05) P.push(pts[i0]);
    if (P.length < 2) return 0;
    var nP = P.length, nSeg = nP - 1, rM = raioDe(pm), rC = raioDe(pc), lado = ladoInterno(P, fechado, o);
    var tipoTerm = function (k) { var t = o.terminal; t = t && typeof t === "object" ? t[k] : t; return /^(retorno|curva|tampao|nenhum)$/.test(String(t)) ? String(t) : "retorno"; };
    function dirSeg(j) { return unit(sub(P[j + 1], P[j])); }
    var ehCorr = function (h) { return o.corrimao2 && o.corrimao2.indexOf(h) >= 0; }, soldaTopo = { tipo: "topo", perna: 0, lados: "contorno", campo: false };
    var reg = { pontas: { ini: [], fim: [] } };
    /* MONTANTES: as mesmas posições do gerador antigo (pontas de cada trecho e a cada ≤ espac) — o cálculo e os testes contam com elas */
    var posts = [];
    for (var i = 0; i + 1 < nP; i++) {
      var a = P[i], bb = P[i + 1], d = sub(bb, a), L = len(d), nS = Math.max(1, Math.ceil(L / o.espac - 1e-9));
      for (var k = 0; k <= nS; k++) { if (k === 0 && i > 0) continue; if (fechado && i === nP - 2 && k === nS) continue; posts.push({ p: add(a, mul(d, k / nS)), seg: i, no: k === 0 ? i : (k === nS ? i + 1 : -1) }); }
    }
    var avisos = [];
    for (var j0 = 0; j0 < nP; j0++) {
      var uIn = j0 > 0 ? dirSeg(j0 - 1) : (fechado ? dirSeg(nSeg - 1) : null), uOut = j0 < nSeg ? dirSeg(j0) : (fechado ? dirSeg(0) : null);
      var me = uIn && uOut ? meiaEsquadria(uIn, uOut, 2 * rC) : null;
      if (me && me.deflexao > 1e-3 && me.canto < 30) avisos.push("Canto de " + br(me.canto, 1) + "° no guarda-corpo: a meia-esquadria passa do corte máximo da serra (75°) — conferir o detalhe");
    }

    /* ---------- TRAVESSÃO SUPERIOR: no eixo dos montantes, por cima deles; meia-esquadria em cada canto e dobra */
    var termIni = fechado ? "nenhum" : tipoTerm("ini"), termFim = fechado ? "nenhum" : tipoTerm("fim");
    function extensao(t) { return t === "retorno" || t === "curva" ? rM + PADRAO.retornoReto : (t === "tampao" ? rM : 0); }
    var T = P.map(function (q) { return add(q, [0, Hg, 0]); }), tocoIni = null, tocoFim = null;
    if (!fechado) { var c1 = comToco(T, extensao(termIni), true); T = c1.Q; tocoIni = c1.toco; var c2 = comToco(T, extensao(termFim), false); T = c2.Q; tocoFim = c2.toco; }
    if (fechado) T[T.length - 1] = T[0];
    var sup = polilinha(K, T, fechado, pc, { papel: "Travessa superior do guarda-corpo", aco: aco, lig: lig, nome: "Guarda-corpo a " + br(Hg) + " m", tocos: { ini: !!tocoIni, fim: !!tocoFim }, papelToco: "Toco da ponta do guarda-corpo" });
    /* ---------- TERMINAIS das pontas livres do travessão */
    function terminal(t, Pt, w, Ppost, nm, lst) {
      var n1 = K.pecas.length;
      if (t === "tampao") tampao(K, Pt, w, pc, { aco: aco, lig: lig, nome: nm });
      else if (t === "curva" || t === "retorno") {
        var dn = unit(sub(mul(UP, -1), mul(w, dot(mul(UP, -1), w)))) || [0, -1, 0];
        if (t === "curva") {
          var cv = curva(K, Pt, w, dn, pc, 90, { aco: aco, lig: lig, nome: nm, papel: "Curva de retorno do corrimão" }), Pe = add(cv.fim, mul(cv.tangente, PADRAO.pernaCurva));
          barra(K, cv.fim, Pe, pc, null, null, { papel: "Perna da curva do corrimão", aco: aco, lig: lig, nome: "Perna — " + nm, conta: "acabamento", solda: soldaTopo, tipoIni: "topo" });
          tampao(K, Pe, cv.tangente, pc, { aco: aco, lig: lig, nome: nm });
        } else {
          /* RETORNO AO MONTANTE: curva de 180° para baixo e o trecho reto voltando até a face do montante (boca de lobo) */
          var c3 = curva(K, Pt, w, dn, pc, 180, { aco: aco, lig: lig, nome: nm, papel: "Curva de retorno do corrimão" });
          var bw = mul(w, -1), b2 = base(bw, Math.abs(bw[1]) > 0.99 ? [1, 0, 0] : UP);
          var Q0 = add(c3.fim, bw), tt = tEixo(cilLocal(Q0, b2, UP, Ppost, rM), true), Pend = add(Q0, mul(bw, tt));
          if (dot(sub(Pend, c3.fim), bw) > 0.005) barra(K, c3.fim, Pend, pc, null, null, { papel: "Retorno do corrimão ao montante", aco: aco, lig: lig, nome: "Retorno — " + nm, conta: "acabamento", bocas: { fim: [cilLocal(Pend, b2, UP, Ppost, rM)] }, tipoIni: "topo", tipoFim: "boca", solda: { tipo: "filete", perna: 3, lados: "contorno", campo: false, em: "montante" } });
        }
      }
      for (var z = n1; z < K.pecas.length; z++) lst.push(K.pecas[z].id);
    }
    if (!fechado) {
      terminal(termIni, sup.ini.P, sup.ini.w, P[0], "ponta inicial", reg.pontas.ini);
      terminal(termFim, sup.fim.P, sup.fim.w, P[nP - 1], "ponta final", reg.pontas.fim);
    }

    /* ---------- MONTANTES: o pé na base (soldado no apoio), o topo encontra o travessão sem atravessar */
    posts.forEach(function (pt, kk) {
      var Pb = pt.p, bm = base(UP, [1, 0, 0]);
      /* os travessões que passam por cima deste montante (no nó: os dois trechos e o toco; no meio: o trecho) */
      var segs = pt.no >= 0 ? [pt.no - 1, pt.no].filter(function (q) { return q >= 0 && q < nSeg; }) : [pt.seg];
      if (pt.no >= 0 && fechado && (pt.no === 0 || pt.no === nP - 1)) segs = [0, nSeg - 1];
      var us = segs.map(dirSeg);
      if (pt.no === 0 && tocoIni) us.push(mul(tocoIni, -1));
      if (pt.no === nP - 1 && tocoFim) us.push(tocoFim);
      var Qa = add(Pb, [0, Hg, 0]), mesmaInclin = us.every(function (q) { return Math.abs(q[1] - us[0][1]) < 1e-6; });
      var nome = "Montante do guarda-corpo " + (kk + 1), soldaBase = { tipo: "filete", perna: num(o.perna, PADRAO.pernaBase), lados: "contorno", campo: true, em: "apoio (viga de aço ou chapa de base)" };
      if (rM > rC + 1e-6 && mesmaInclin) {
        /* montante MAIOR que o tubo do travessão: corte paralelo ao travessão + CHAPA DE TOPO (o travessão apoia nela) */
        var uR = us[0], Nup = unit(sub(UP, mul(uR, dot(UP, uR)))) || UP, Q0 = sub(Qa, mul(Nup, rC + PADRAO.tTopo));
        var yC = dot(sub(Q0, Pb), Nup) / dot(UP, Nup), ct = corte(bm.X, bm.Y, Nup);
        var cM = K.perfil({ origem: Pb, ex: UP, ey: [1, 0, 0], perfil: pm, L: yC, cortes: { almaFim: ct.alma, abaFim: ct.aba }, papel: "Montante do guarda-corpo", ifc: "IFCMEMBER", aco: aco, lig: lig, nome: nome, solda: soldaBase }, "guarda");
        var mp1 = cM ? medirPontas(cM) || comprimentos(yC, rM, [0, 0], ct.k) : null;
        if (cM) cM.metal.fab = { eixo: r1(yC * 1000), externo: r1(mp1.externo * 1000), interno: r1(mp1.interno * 1000), ini: "reto", fim: Math.abs(ct.alma) + Math.abs(ct.aba) > 0.01 ? "inclinado" : "reto", angIni: 90, angFim: r1(90 - Math.abs(Math.atan(Math.sqrt(ct.k[0] * ct.k[0] + ct.k[1] * ct.k[1])) / GRAU)), topo: "chapa" };
        /* a chapa de topo no plano do corte (largura Dm, comprimento Dm/cos α ao longo do travessão): ex = o travessão,
           ey = Nup × ex — assim ex × ey = Nup e a espessura sobe do corte até a geratriz de baixo do travessão */
        var bT = base(uR, cross(Nup, uR)), Lc = 2 * rM / Math.max(0.3, dot(UP, Nup)), Cc = add(Pb, mul(UP, yC));
        var org = sub(sub(Cc, mul(bT.X, Lc / 2)), mul(bT.Y, rM));
        var cT = K.chapa({ origem: org, ex: bT.X, ey: bT.Y, t: PADRAO.tTopo, ret: { L: Lc, B: 2 * rM }, papel: "Chapa de topo do montante", aco: aco, lig: lig, nome: "Chapa de topo — " + nome, solda: { tipo: "filete", perna: 4, lados: "contorno", campo: false } }, "acabamento");
        if (cT) cT.metal.fab = { topo: true };
      } else {
        /* BOCA DE LOBO: a ponta do montante na forma do(s) tubo(s) do travessão (no nó com inclinações diferentes: todos) */
        var Pn = add(Pb, mul(UP, Hg)), t0 = null;
        us.forEach(function (uR2) { var t = tEixo(cilLocal(Pn, bm, uR2, Qa, rC), true); if (t0 == null || t < t0) t0 = t; });
        var Lm = Hg + (t0 || 0), Pe2 = add(Pb, mul(UP, Lm)), cils = us.map(function (uR2) { return cilLocal(Pe2, bm, uR2, Qa, rC); });
        var cM2 = K.perfil({ origem: Pb, ex: UP, ey: [1, 0, 0], perfil: pm, L: Lm, bocas: { fim: cils }, papel: "Montante do guarda-corpo", ifc: "IFCMEMBER", aco: aco, lig: lig, nome: nome, solda: soldaBase }, "guarda");
        if (cM2) { var mp2 = medirPontas(cM2) || { externo: Lm, interno: Lm }; cM2.metal.fab = { eixo: r1(Lm * 1000), externo: r1(mp2.externo * 1000), interno: r1(mp2.interno * 1000), ini: "reto", fim: "boca", angIni: 90, angFim: 90, bocaR: r1(rC * 1000), topo: "boca" }; }
      }
    });

    /* ---------- TRAVESSAS E CORRIMÃOS de baixo: na FACE INTERNA dos montantes (tangentes) — nada atravessa o montante */
    var baixas = arr(o.alturas).filter(function (h) { return Math.abs(h - Hg) > 1e-6; }).sort(function (x, y) { return y - x; });
    var eixos = baixas.map(function (h) {
      var corr = ehCorr(h), dOff = rM + rC + (corr ? PADRAO.folgaCorrimao : 0), base0 = P.map(function (q) { return add(q, [0, h, 0]); });
      var Q = deslocar(base0, dOff, lado, fechado);
      /* o corrimão termina na horizontal (toco de 5 cm na ponta inclinada) para a curva ficar no plano vertical */
      var e0 = corr && !fechado ? PADRAO.retornoReto : 0, tc = { ini: false, fim: false };
      if (!fechado && corr && Math.abs(dirSeg(0)[1]) > 1e-6) { Q = comToco(Q, e0, true).Q; tc.ini = true; }
      if (!fechado && corr && Math.abs(dirSeg(nSeg - 1)[1]) > 1e-6) { Q = comToco(Q, e0, false).Q; tc.fim = true; }
      if (fechado) Q[Q.length - 1] = Q[0];
      return { h: h, corr: corr, Q: Q, tocos: tc };
    });
    eixos.forEach(function (ex) {
      var nm = "Corrimão a " + br(ex.h) + " m";
      ex.r = polilinha(K, ex.Q, fechado, pc, { papel: ex.corr ? "Corrimão" : "Travessa do guarda-corpo", aco: aco, lig: lig, nome: nm, tocos: ex.tocos, papelToco: "Toco da ponta do corrimão",
        solda: ex.corr ? null : { tipo: "filete", perna: PADRAO.pernaTravessa, lados: "ambos", campo: false, em: "face dos montantes" } });
    });
    /* pontas livres: o PAR de corrimãos (0,92 e 0,70) fecha numa curva de 180° (R = metade da distância entre eles) —
       a extremidade recurvada da NBR 9050 (seção 6.9); corrimão sozinho: curva de 90° para baixo + tampão; travessa: tampão */
    if (!fechado) ["ini", "fim"].forEach(function (pn) {
      var usado = {};
      eixos.forEach(function (ex, ix) {
        if (usado[ix]) return;
        var pt = ex.r[pn], nm = "Corrimão a " + br(ex.h) + " m " + (pn === "ini" ? "ponta inicial" : "ponta final"), n1 = K.pecas.length, par = eixos[ix + 1];
        if (ex.corr && par && par.corr && !usado[ix + 1] && len(sub(sub(pt.P, par.r[pn].P), mul(UP, ex.h - par.h))) < 1e-4 && Math.abs(pt.w[1]) < 1e-6) {
          var Rp = (ex.h - par.h) / 2;
          if (Rp < PADRAO.kR * rC * 2 - 1e-6) avisos.push("Curva que une os corrimãos de " + br(ex.h) + " e " + br(par.h) + " m com R = " + br(Rp * 1000, 0) + " mm, abaixo do de partida (2·D) — conferir com o curvador");
          curva(K, pt.P, pt.w, [0, -1, 0], pc, 180, { aco: aco, lig: lig, nome: nm, papel: "Curva de retorno do corrimão", R: Rp });
          usado[ix + 1] = true;
        } else if (ex.corr) {
          var dn2 = unit(sub(mul(UP, -1), mul(pt.w, dot(mul(UP, -1), pt.w)))) || [0, -1, 0];
          var cv2 = curva(K, pt.P, pt.w, dn2, pc, 90, { aco: aco, lig: lig, nome: nm, papel: "Curva de retorno do corrimão" }), Pe3 = add(cv2.fim, mul(cv2.tangente, PADRAO.pernaCurva));
          barra(K, cv2.fim, Pe3, pc, null, null, { papel: "Perna da curva do corrimão", aco: aco, lig: lig, nome: "Perna — " + nm, conta: "acabamento", solda: soldaTopo, tipoIni: "topo" });
          tampao(K, Pe3, cv2.tangente, pc, { aco: aco, lig: lig, nome: nm });
        } else tampao(K, pt.P, pt.w, pc, { aco: aco, lig: lig, nome: nm });
        for (var z = n1; z < K.pecas.length; z++) reg.pontas[pn].push(K.pecas[z].id);
      });
    });
    /* SUPORTES do corrimão: barra Ø 16 da face do montante até o tubo, em cada montante */
    eixos.forEach(function (ex) {
      if (!ex.corr) return;
      posts.forEach(function (pt, kk) {
        var segI = Math.min(nSeg - 1, Math.max(0, pt.no >= 0 ? Math.min(pt.no, nSeg - 1) : pt.seg)), nS2 = normalLado(dirSeg(segI), lado);
        if (pt.no > 0 && pt.no < nP - 1) { var n2 = normalLado(dirSeg(pt.no - 1), lado); nS2 = unit(add(nS2, n2)) || nS2; }
        var pS = add(add(pt.p, [0, ex.h, 0]), mul(nS2, rM)), Ls = PADRAO.folgaCorrimao;
        var cS = K.perfil({ origem: pS, ex: nS2, ey: UP, perfil: { forma: "circ", d: PADRAO.dSuporte }, L: Ls, papel: "Suporte do corrimão", ifc: "IFCMEMBER", aco: aco, lig: lig, nome: "Suporte do corrimão a " + br(ex.h) + " m — montante " + (kk + 1), solda: { tipo: "filete", perna: 4, lados: "contorno", campo: false, em: "montante e corrimão" } }, "acabamento");
        if (cS) cS.metal.fab = { eixo: Ls * 1000, externo: Ls * 1000, interno: Ls * 1000, ini: "reto", fim: "reto", angIni: 90, angFim: 90 };
      });
    });

    /* ---------- RODAPÉ: chapa na face interna dos montantes; cantos em planta a TOPO, dobras na elevação em meia-esquadria */
    var hR = num(o.rodape, 0), tR = num(o.tRodape, 0.00475);
    if (hR > 0) {
      var R0 = deslocar(P, rM + tR / 2, lado, fechado);
      var nosR = [];
      for (var jr = 0; jr < nP; jr++) {
        var ua2 = jr > 0 ? dirSeg(jr - 1) : (fechado ? dirSeg(nSeg - 1) : null);
        var ub2 = jr < nSeg ? dirSeg(jr) : (fechado ? dirSeg(0) : null);
        nosR.push({ a: ua2, b: ub2 });
      }
      for (var s3 = 0; s3 < nSeg; s3++) {
        var Ra = R0[s3], Rb = R0[s3 + 1], uR3 = unit(sub(Rb, Ra)); if (!uR3) continue;
        var ey3 = unit(sub(UP, mul(uR3, dot(uR3, UP)))) || UP, b3 = base(uR3, ey3), Lr = len(sub(Rb, Ra));
        var ext = [0, 0], cont = null, chf = [];
        [0, 1].forEach(function (lp) {
          var jn = s3 + lp, nr = nosR[jn], uOutro = lp === 0 ? nr.a : nr.b;
          if (!uOutro) { chf.push(lp); return; }
          var hOutro = unit([uOutro[0], 0, uOutro[2]]) || [1, 0, 0], hEste = unit([uR3[0], 0, uR3[2]]) || [1, 0, 0];
          if (Math.abs(cross(hEste, hOutro)[1]) < 1e-4) {
            /* dobra só na elevação (mesmo plano): meia-esquadria pelo contorno */
            var nb = unit(lp === 0 ? add(uOutro, uR3) : add(uR3, uOutro)); cont = cont || { ini: null, fim: null }; cont[lp ? "fim" : "ini"] = nb; return;
          }
          /* canto em planta: a TOPO — a ponta FINAL de cada trecho passa (e1), a inicial do seguinte encosta (b2) */
          var dl = Math.acos(Math.max(-1, Math.min(1, dot(hEste, hOutro)))), sn = Math.sin(dl), b2r = tR / 2 * (1 + Math.abs(Math.cos(dl))) / Math.max(1e-3, sn), e1 = b2r * Math.cos(dl) + tR / 2 * sn;
          ext[lp] = lp === 1 ? e1 : -b2r;
        });
        var a0 = -ext[0], a1 = Lr + ext[1], C;
        if (cont) {
          var kv = function (nb2) { if (!nb2) return 0; var kx = dot(nb2, b3.X); return Math.abs(kx) < 1e-9 ? 0 : -dot(nb2, b3.Y) / kx; };
          C = [[a0, 0], [a1, 0], [a1 + kv(cont.fim) * hR, hR], [a0 + kv(cont.ini) * hR, hR]];
        } else C = [[a0, 0], [a1, 0], [a1, hR], [a0, hR]];
        var chs = []; chf.forEach(function (lp) { chs.push({ i: lp === 0 ? 3 : 2, c: PADRAO.chanfroRodape }); });
        var cR = K.chapa({ origem: sub(Ra, mul(b3.Z, tR / 2)), ex: b3.X, ey: b3.Y, t: tR, contorno: C, chanfros: chs, papel: "Rodapé", aco: aco, lig: lig, nome: "Rodapé — trecho " + (s3 + 1), solda: { tipo: "filete", perna: 3, lados: "ambos", campo: false, em: "face dos montantes" } }, "rodape");
        if (cR) cR.metal.fab = { rodape: true, encontro: cont ? "meia-esquadria" : "topo" };
      }
    }
    for (var q = n0; q < K.pecas.length; q++) K.pecas[q].metal.acessorio = "guarda-corpo";
    avisos.forEach(function (t) { if (K.avisos.indexOf(t) < 0) K.avisos.push(t); });
    /* o REGISTRO para o finalizar(): caminho no MUNDO, opções, as peças e a contagem desta chamada */
    if (!o._refazendo) {
      var dc = {}; Object.keys(K.cont || {}).forEach(function (kc) { var dv = (K.cont[kc] || 0) - (cont0[kc] || 0); if (dv) dc[kc] = dv; });
      (K._gc = K._gc || []).push({ P: P.map(function (q2) { return K.F && K.F.W ? K.F.W(q2) : q2; }), o: JSON.parse(JSON.stringify(o)), fechado: fechado, ids: K.pecas.slice(n0).map(function (c) { return c.id; }), cont: dc, F: K.F, lado: lado,
        nInt: normalLado(K.F && K.F.D ? K.F.D(dirSeg(0)) : dirSeg(0), lado) });
    }
    return K.pecas.length - n0;
  }

  /* ===================================================== ENCONTRO ENTRE CAMINHOS (finalizar)
   * o mezanino e a plataforma chamam o guarda-corpo LADO A LADO, a anelar faz a borda e as pontas em chamadas
   * separadas: as pontas que caem no MESMO ponto (mesma base, mesmas opções) viram um CAMINHO SÓ — refeito com a
   * meia-esquadria no canto, um montante só no encontro e o lado interno do conjunto (sem retorno no meio do canto). */
  /* junta o caminho B no FIM do caminho A: pontas no mesmo ponto, ou QUASE ENCONTRO — as retas do último trecho de A
     e do 1º de B passam a menos de 5 cm uma da outra perto das duas pontas (lance da escada → patamar → lance): o nó
     vira o ponto em que as retas se cruzam (meia-esquadria ali), cortando o que sobra das pontas */
  function juntar(A, B) {
    var a1 = A[A.length - 1], b0 = B[0];
    if (len(sub(a1, b0)) < 0.02) return A.concat(B.slice(1));
    if (A.length < 2 || B.length < 2) return null;
    var p1 = A[A.length - 2], d1 = sub(a1, p1), p2 = b0, d2 = sub(B[1], b0), w0 = sub(p1, p2);
    var aa = dot(d1, d1), bb = dot(d1, d2), cc = dot(d2, d2), dd = dot(d1, w0), ee = dot(d2, w0), den = aa * cc - bb * bb;
    if (aa > 1e-9 && cc > 1e-9 && den > 1e-9 * aa * cc) {   /* paralelas não fazem canto */
      var t1 = (bb * ee - cc * dd) / den, t2 = (aa * ee - bb * dd) / den, X1 = add(p1, mul(d1, t1)), X2 = add(p2, mul(d2, t2)), L1 = Math.sqrt(aa), L2 = Math.sqrt(cc);
      if (len(sub(X1, X2)) <= 0.05 && Math.abs(t1 - 1) * L1 <= 0.6 && Math.abs(t2) * L2 <= 0.6 && t1 * L1 >= 0.2 && (1 - t2) * L2 >= 0.2)
        return A.slice(0, -1).concat([mul(add(X1, X2), 0.5)]).concat(B.slice(1));
    }
    /* PONTAS A MENOS DE 40 cm seguindo o mesmo sentido (canto de dentro da escada em L: o lance chega, o outro sai do
       patamar) → um trecho de ligação entre elas (sem ele os dois terminais se atravessam no canto) */
    var lig = sub(b0, a1), dl = len(lig);
    if (dl < 0.4 && unit(d1) && unit(d2) && dot(unit(lig), unit(d1)) > 0.2 && dot(unit(lig), unit(d2)) > 0.2) return A.concat(B);
    return null;
  }
  function finalizar(K, H) {
    var G = arr(K && K._gc); if (G.length < 2 || !H || !H.quadroLocal) return 0;
    var chave = function (o) { return [o.montante, o.corrimao, o.altura, JSON.stringify(o.alturas), JSON.stringify(o.corrimao2 || null), o.espac, o.rodape, o.tRodape, o.aco].join("|"); };
    var perto = function (a, b) { return len(sub(a, b)) < 0.02; };
    var feito = G.map(function () { return false; }), cadeias = [];
    for (var i = 0; i < G.length; i++) {
      if (feito[i] || G[i].fechado) continue;
      var cad = G[i].P.slice(), mem = [i]; feito[i] = true;
      var achou = true;
      while (achou) {
        achou = false;
        for (var j = 0; j < G.length; j++) {
          if (feito[j] || G[j].fechado || chave(G[j].o) !== chave(G[i].o)) continue;
          var Q = G[j].P, Qr = Q.slice().reverse(), nova = juntar(cad, Q) || juntar(cad, Qr);
          if (!nova) { var cr = cad.slice().reverse(), nr = juntar(cr, Q) || juntar(cr, Qr); if (nr) nova = nr.reverse(); }
          if (!nova) continue;
          cad = nova; feito[j] = true; mem.push(j); achou = true;
        }
      }
      if (mem.length > 1) cadeias.push({ P: cad, mem: mem });
    }
    if (!cadeias.length) return 0;
    var apagar = {};
    cadeias.forEach(function (cd) { cd.mem.forEach(function (m) { G[m].ids.forEach(function (id) { apagar[id] = true; }); Object.keys(G[m].cont).forEach(function (kc) { K.cont[kc] = (K.cont[kc] || 0) - G[m].cont[kc]; }); }); });
    K.pecas = K.pecas.filter(function (c) { return !apagar[c.id]; });
    K.ops = K.ops.filter(function (op) { return !(op.op === "criar" && apagar[op.id]); });
    Object.keys(apagar).forEach(function (id) { delete K.atual[id]; });
    var F0 = K.F; K.F = H.quadroLocal([0, 0, 0], 0);
    cadeias.forEach(function (cd) {
      var P = cd.P, fech = P.length > 3 && perto(P[0], P[P.length - 1]);
      if (fech) P[P.length - 1] = P[0].slice();
      var o = JSON.parse(JSON.stringify(G[cd.mem[0]].o)); o._refazendo = true; o.gid = o.gid + "-j";
      /* cadeia aberta sem giro em planta (escada → patamar → escada): o lado interno é o dos caminhos que a formaram */
      if (!fech) {
        var giro = 0; for (var g2 = 1; g2 + 1 < P.length; g2++) { var ga = sub(P[g2], P[g2 - 1]), gb = sub(P[g2 + 1], P[g2]); ga[1] = 0; gb[1] = 0; if (len(ga) > 1e-9 && len(gb) > 1e-9) giro += Math.atan2(cross(ga, gb)[1], dot(ga, gb)); }
        var m0 = G[cd.mem[0]];
        if (Math.abs(giro) < 1e-6 && m0.nInt) {
          var X0 = m0.P[0], best = null, bd = Infinity;
          for (var sg = 0; sg + 1 < P.length; sg++) { var dm = len(sub(mul(add(P[sg], P[sg + 1]), 0.5), X0)); if (dm < bd) { bd = dm; best = sg; } }
          var uc = unit(sub(P[best + 1], P[best])); if (uc) o.ladoInterno = dot(normalLado(uc, 1), m0.nInt) >= 0 ? 1 : -1;
        }
      }
      guardaCorpo(K, P, o, H);
    });
    K.F = F0;
    cadeias.forEach(function (cd) { cd.mem.forEach(function (m) { G[m].unido = true; }); });
    return cadeias.length;
  }

  /* ===================================================== INTERFERÊNCIAS
   * duas peças se ATRAVESSAM quando um ponto da superfície de uma fica dentro do volume (contorno externo) da outra a
   * mais de `tol` das faces. Encostar (solda, apoio, meia-esquadria) não conta. Parafuso não entra (passa no furo). */
  function pnp(a, b, poli) {
    var dentro = false, n = poli.length, dmin = Infinity;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = poli[i][0], yi = poli[i][1], xj = poli[j][0], yj = poli[j][1];
      if (((yi > b) !== (yj > b)) && (a < (xj - xi) * (b - yi) / (yj - yi) + xi)) dentro = !dentro;
      var dx = xj - xi, dy = yj - yi, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((a - xi) * dx + (b - yi) * dy) / l2)) : 0, ex = xi + t * dx - a, ey = yi + t * dy - b;
      dmin = Math.min(dmin, Math.sqrt(ex * ex + ey * ey));
    }
    return dentro ? dmin : -dmin;
  }
  function dentroSolido(Pw, s, tol) {
    var d = sub(Pw, s.O), a = dot(d, s.U), b = dot(d, s.Vv), z = dot(d, s.W);
    if (pnp(a, b, s.poli) <= tol) return false;
    var zA = dot(sub(s.ponto(a, b, s.z0), s.O), s.W), zB = dot(sub(s.ponto(a, b, s.z1), s.O), s.W);
    return z > Math.min(zA, zB) + tol && z < Math.max(zA, zB) - tol;
  }
  function amostras(s, passo) {
    var out = [], n = s.poli.length, nz = Math.max(2, Math.ceil(Math.abs(s.z1 - s.z0) / passo) + 1);
    for (var i = 0; i < n; i++) {
      var p = s.poli[i], q = s.poli[(i + 1) % n], le = Math.sqrt(Math.pow(q[0] - p[0], 2) + Math.pow(q[1] - p[1], 2)), ne = Math.max(1, Math.ceil(le / passo));
      for (var e = 0; e < ne; e++) {
        var a = p[0] + (q[0] - p[0]) * e / ne, b = p[1] + (q[1] - p[1]) * e / ne;
        var PA = s.ponto(a, b, s.z0), PB = s.ponto(a, b, s.z1);
        for (var k = 0; k < nz; k++) out.push(add(PA, mul(sub(PB, PA), k / (nz - 1))));
      }
    }
    /* e a linha do MEIO da seção: duas peças iguais no mesmo lugar (montante duplicado no canto) não têm ponto de
       superfície "dentro" uma da outra — o meio de uma fica dentro da outra */
    var am = 0, bm = 0; s.poli.forEach(function (q) { am += q[0]; bm += q[1]; }); am /= n; bm /= n;
    var MA = s.ponto(am, bm, s.z0), MB = s.ponto(am, bm, s.z1);
    for (var k2 = 1; k2 < nz - 1; k2++) out.push(add(MA, mul(sub(MB, MA), k2 / (nz - 1))));
    return out;
  }
  function caixaDe(pts) { var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; pts.forEach(function (p) { for (var k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } }); return { mn: mn, mx: mx }; }
  function interferencias(caixas, o) {
    o = o || {}; var tol = num(o.tol, 0.0005), passo = num(o.passo, 0.005), M = BM(), out = [];
    var ps = arr(caixas).filter(function (c) { return c && c.tipo === "metal" && c.metal && (c.metal.kind === "perfil" || c.metal.kind === "chapa") && (!o.filtro || o.filtro(c)); }).map(function (c) {
      var sols = M.solidos(c), pts = []; sols.forEach(function (s) { s.poli.forEach(function (q) { pts.push(s.ponto(q[0], q[1], s.z0)); pts.push(s.ponto(q[0], q[1], s.z1)); }); });
      return { c: c, sols: sols, bx: caixaDe(pts), am: null };
    });
    function sobre(A, B) { for (var k = 0; k < 3; k++) if (A.bx.mx[k] < B.bx.mn[k] - 1e-6 || B.bx.mx[k] < A.bx.mn[k] - 1e-6) return false; return true; }
    for (var i = 0; i < ps.length; i++) for (var j = i + 1; j < ps.length; j++) {
      var A = ps[i], B = ps[j]; if (!sobre(A, B)) continue;
      var n = 0, ex = null;
      [[A, B], [B, A]].forEach(function (par) {
        var X = par[0], Y = par[1]; if (!X.am) { X.am = []; X.sols.forEach(function (s) { X.am = X.am.concat(amostras(s, passo)); }); }
        X.am.forEach(function (p) {
          for (var k = 0; k < 3; k++) if (p[k] < Y.bx.mn[k] - 1e-6 || p[k] > Y.bx.mx[k] + 1e-6) return;
          if (Y.sols.some(function (s) { return dentroSolido(p, s, tol); })) { n++; if (!ex) ex = p; }
        });
      });
      if (n) out.push({ a: A.c.id, b: B.c.id, papelA: A.c.metal.papel, papelB: B.c.metal.papel, n: n, ponto: ex.map(r4) });
    }
    return out;
  }

  /* ===================================================== A FOLHA DE DETALHE TÍPICO
   * os números saem do modelo (perfil do montante e do corrimão, raio da curva, chapa de topo, rodapé) */
  function dadosDetalhe(caixas) {
    var gc = arr(caixas).filter(function (c) { return c && c.metal && c.metal.acessorio === "guarda-corpo"; });
    if (!gc.length) return null;
    var pega = function (re) { return gc.filter(function (c) { return re.test(c.metal.papel || ""); }); };
    var mont = pega(/^Montante do guarda/)[0], sup = pega(/^Travessa superior/), curv = pega(/^Curva de retorno/)[0], topo = pega(/^Chapa de topo/)[0], rod = pega(/^Rodapé$/)[0], trav = pega(/^Travessa do guarda/)[0];
    var mitra = sup.filter(function (c) { return c.metal.fab && (c.metal.fab.ini === "meia-esquadria" || c.metal.fab.fim === "meia-esquadria"); })[0] || null;
    var nome = function (c) { var p = c && c.metal && c.metal.perfil; return p ? (p.cat || (p.forma === "tubo-circ" ? "TUBO Ø " + br(p.D * 1000, 1) + " x " + br(p.t * 1000, 2) : p.forma)) : "[PENDENTE]"; };
    var D = function (c) { var p = c && c.metal && c.metal.perfil; return p && p.forma === "tubo-circ" ? p.D * 1000 : (p ? raioDe(p) * 2000 : 0); };
    var ang = mitra ? (mitra.metal.fab.ini === "meia-esquadria" ? mitra.metal.fab.angIni : mitra.metal.fab.angFim) : 45;
    return { montante: nome(mont), corrimao: nome(sup[0]), Dm: D(mont), Dc: D(sup[0]), angulo: ang, mitra: mitra ? mitra.metal.fab : null, curva: curv ? curv.metal.fab : null, topo: !!topo, tTopo: PADRAO.tTopo * 1000,
      rodape: rod ? { t: rod.metal.t * 1000, h: rod.metal.dim ? rod.metal.dim.B * 1000 : 200 } : null, travessa: !!trav, pernaBase: mont && mont.metal.solda ? mont.metal.solda.perna : PADRAO.pernaBase, n: gc.length,
      solda: { base: mont && mont.metal.solda ? mont.metal.solda : null } };
  }
  var TITULO = "DETALHE TÍPICO DO GUARDA-CORPO - MEIA-ESQUADRIA, TERMINAL BOLEADO E BASE";
  /* A FOLHA: quatro detalhes numa grade 2 × 2 (cada um com o número no círculo e a escala, como a folha 05 da
     metálica) e as NOTAS na coluna da direita, acima do carimbo RA (intocado). Os números saem do modelo. */
  function desenharDetalheTipico(Dw, geo, E, d) {
    var A = AP(), T = E.T, ar = geo.area, V = A.VERMELHO; d = d || {};
    var Dc = num(d.Dc, 48.3), Dm = num(d.Dm, 73), rc = Dc / 2, rm = Dm / 2, tTopo = num(d.tTopo, 6.35);
    var R = d.curva ? num(d.curva.R, 2 * Dc) : 2 * Dc, desenv = d.curva ? num(d.curva.desenvolvimento, Math.PI * R) : Math.PI * R;
    var tR = d.rodape ? num(d.rodape.t, 4.75) : 4.75, hR = d.rodape ? num(d.rodape.h, 200) : 200, ang = num(d.angulo, 45), perna = num(d.pernaBase, 6);
    var W2 = ar.w / 2, H2 = ar.h / 2, mmT = function (v) { return String(Math.round(v)); }, angTxt = br(ang, 1).replace(/,0$/, "") + "°";
    function cel(i) { return { x: ar.x + (i % 2) * W2, y: ar.y + Math.floor(i / 2) * H2, w: W2, h: H2 }; }
    Dw.linha(ar.x + W2, ar.y + 2, ar.x + W2, ar.y + ar.h - 2, "MET-FINA");
    Dw.linha(ar.x + 2, ar.y + H2, ar.x + ar.w - 2, ar.y + H2, "MET-FINA");
    function arco(cx, cy, r, a0, a1, n) { var o = []; for (var k = 0; k <= n; k++) { var f = (a0 + (a1 - a0) * k / n) * GRAU; o.push([cx + r * Math.cos(f), cy + r * Math.sin(f)]); } return o; }
    function textoCel(c, y, linhas) { linhas.forEach(function (t) { var o = typeof t === "object" ? t : { t: t }; A.quebrar(o.t, T.nota, c.w - 16).forEach(function (l, il) { Dw.texto(c.x + 4, y, l, T.nota, { cor: o.cor, attr: il === 0 && o.attr ? o.attr : undefined }); y += T.nota * 1.45; }); y += 0.6; }); return y; }

    /* ---- 1 CANTO EM MEIA-ESQUADRIA (planta, 1:5) */
    var c1 = cel(0), s1 = 1 / 5, r1p = rc * s1, Lv = 60, th1 = A.tituloVista(Dw, c1.x + 3, c1.y + 3, "CANTO EM MEIA-ESQUADRIA", "PLANTA - ESCALA 1:5", 1);
    var cx = c1.x + 30 + Lv, cy = c1.y + th1 + 24;
    Dw.poli([[cx - Lv, cy - r1p], [cx + r1p, cy - r1p], [cx - r1p, cy + r1p], [cx - Lv, cy + r1p]], "MET-PERFIL", true);
    Dw.poli([[cx + r1p, cy - r1p], [cx + r1p, cy + Lv], [cx - r1p, cy + Lv], [cx - r1p, cy + r1p]], "MET-PERFIL", true);
    Dw.linha(cx - Lv - 3, cy, cx + 3, cy, "MET-EIXO"); Dw.linha(cx, cy - 3, cx, cy + Lv + 3, "MET-EIXO");
    Dw.quebra(cx - Lv, cy - r1p - 2.5, cx - Lv, cy + r1p + 2.5); Dw.quebra(cx - r1p - 2.5, cy + Lv, cx + r1p + 2.5, cy + Lv);
    Dw.poli(arco(cx + r1p, cy - r1p, 9, 135, 180, 10), "MET-FINA", false);
    Dw.texto(cx + r1p - 9.5, cy - r1p - 1.4, angTxt, T.cota, { al: "D", attr: ' data-angulo-corte="' + angTxt + '"' });
    /* a ponta longa passa o nó do eixo em D/2·tg(δ/2) — o que separa o externo do interno */
    var desc = rc * Math.tan((180 - 2 * ang) / 2 * GRAU);
    Dw.cota(cx, cy - r1p, cx + r1p, cy - r1p, 6, mmT(desc), {});
    Dw.solda(cx, cy, 30, { lados: "seta", chanfro: true, contorno: true, cauda: "CJP", ls: 16, lr: 20 });
    Dw.chamada(cx - Lv * 0.55, cy + r1p, cx - Lv * 0.55 - 6, cy + 16, [(d.corrimao || "TUBO") + " (Ø " + br(Dc, 1) + ")"], { dir: -1, h: T.nota });
    var y1 = cy + Lv + 8;
    var ex = d.mitra ? { t: "Ex.: travessão do modelo - externo " + mmT(d.mitra.externo) + " / eixo " + mmT(d.mitra.eixo) + " / interno " + mmT(d.mitra.interno) + " mm.", attr: ' data-comprimentos="1"' } : null;
    textoCel(c1, y1, ["As duas barras cortadas na BISSETRIZ do canto (" + angTxt + " com o eixo no canto de 90°; no canto de θ, θ/2). Comprimento de corte = EXTERNO = eixo + " + mmT(desc) + " por ponta; interno = eixo - " + mmT(desc) + ".", ex,
      "Solda de topo em chanfro, penetração total (CJP) em todo o contorno, esmerilhada; sem vão nem sobreposição."].filter(Boolean));

    /* ---- 2 TERMINAL BOLEADO (elevação, 1:5): retorno de 180° ao montante */
    var c2 = cel(1), s2 = 1 / 5, th2 = A.tituloVista(Dw, c2.x + 3, c2.y + 3, "TERMINAL BOLEADO", "RETORNO AO MONTANTE - ELEVAÇÃO - ESCALA 1:5", 2);
    var xP = c2.x + 40, yT = c2.y + th2 + 22, ret = rm + 50, xe = xP + ret * s2, rcp = rc * s2;
    /* montante (com a chapa de topo) cortado embaixo; travessão vindo da esquerda e a curva */
    var yTopoM = yT + (rc + tTopo) * s2, yBaixo = yT + 320 * s2;
    Dw.poli([[xP - rm * s2, yTopoM], [xP + rm * s2, yTopoM], [xP + rm * s2, yBaixo], [xP - rm * s2, yBaixo]], "MET-PERFIL", true);
    Dw.ret(xP - rm * s2, yTopoM - tTopo * s2, 2 * rm * s2, tTopo * s2, "MET-PERFIL");
    Dw.quebra(xP - rm * s2 - 2.5, yBaixo, xP + rm * s2 + 2.5, yBaixo);
    Dw.poli([[xP - 28, yT - rcp], [xe, yT - rcp], [xe, yT + rcp], [xP - 28, yT + rcp]], "MET-PERFIL", true);
    Dw.quebra(xP - 28, yT - rcp - 2.5, xP - 28, yT + rcp + 2.5);
    var yC = yT + R * s2;
    Dw.poli(arco(xe, yC, (R + rc) * s2, -90, 90, 24), "MET-PERFIL", false); Dw.poli(arco(xe, yC, (R - rc) * s2, -90, 90, 24), "MET-PERFIL", false);
    Dw.poli(arco(xe, yC, R * s2, -90, 90, 24), "MET-EIXO", false);
    var yB = yT + 2 * R * s2;
    Dw.poli([[xe, yB - rcp], [xP + rm * s2, yB - rcp], [xP + rm * s2, yB + rcp], [xe, yB + rcp]], "MET-PERFIL", true);
    Dw.linha(xP, yT - 6, xP, yBaixo + 3, "MET-EIXO"); Dw.linha(xP - 30, yT, xe + 2, yT, "MET-EIXO");
    Dw.linha(xe, yC, xe + R * s2 * Math.cos(-35 * GRAU), yC + R * s2 * Math.sin(-35 * GRAU), "MET-FINA"); Dw.circ(xe, yC, 0.45, "MET-FINA");
    var xTx = xe + (R + rc) * s2 + 11;
    Dw.texto(xTx, yC - 1.5, "R = " + mmT(R), T.cota, { attr: ' data-raio="' + mmT(R) + '"' });
    Dw.texto(xTx, yC - 1.5 + T.cota * 1.6, "DESENV. = " + mmT(desenv), T.nota, { attr: ' data-desenvolvimento="' + mmT(desenv) + '"' });
    Dw.cota(xP, yT - rcp, xe, yT - rcp, 6, mmT(ret), {});
    Dw.cota(xe + (R + rc) * s2, yT, xe + (R + rc) * s2, yB, -6, mmT(2 * R), {});
    Dw.chamada(xP + rm * s2, yB, xP + rm * s2 + 8, yB + 14, ["BOCA DE LOBO", "FILETE EM TODO O CONTORNO"], { dir: 1, h: T.nota });
    textoCel(c2, yBaixo + 12, ["Curva de 180° com R = 2·D pela linha de centro - valor de partida (prática de curvamento a frio; conferir com o curvador). Desenvolvimento = π·R = comprimento de corte da curva.",
      "Outras pontas: curva de 90° para baixo com tampão, ou tampão # 3 na ponta reta. O par de corrimãos 0,92/0,70 m fecha numa curva de 180°.",
      "Corrimão acessível: prolongamento de 0,30 m e extremidade recurvada (NBR 9050:2020, seção 6.9 - conferir o item no texto da norma)."]);

    /* ---- 3 MONTANTE: TOPO, TRAVESSA E RODAPÉ (corte perpendicular ao guarda-corpo, 1:10) */
    var c3 = cel(2), s3 = 1 / 15, th3 = A.tituloVista(Dw, c3.x + 3, c3.y + 3, "MONTANTE, TRAVESSA E RODAPÉ", "CORTE - ESCALA 1:15", 3);
    var mx = c3.x + 62, yBase = c3.y + c3.h - 12, Y = function (h) { return yBase - h * s3; }, Hg = 1100;
    Dw.poli([[mx - rm * s3, Y(Hg - rc - tTopo)], [mx + rm * s3, Y(Hg - rc - tTopo)], [mx + rm * s3, Y(0)], [mx - rm * s3, Y(0)]], "MET-PERFIL", true);
    Dw.ret(mx - rm * s3, Y(Hg - rc), 2 * rm * s3, tTopo * s3, "MET-PERFIL");
    Dw.circ(mx, Y(Hg), rc * s3, "MET-PERFIL");
    var xTr = mx + (rm + rc) * s3; Dw.circ(xTr, Y(700), rc * s3, "MET-PERFIL");
    Dw.ret(mx + rm * s3, Y(hR), Math.max(0.5, tR * s3), hR * s3, "MET-PERFIL");
    Dw.linha(mx - 14, Y(0), mx + 20, Y(0), "MET-CONTEXTO");
    Dw.linha(mx, Y(Hg) - 4, mx, Y(0) + 3, "MET-EIXO");
    var xCt = mx - rm * s3 - 9;
    Dw.cota(xCt, Y(0), xCt, Y(Hg), 0, "1100", {}); Dw.cota(xCt - 7, Y(0), xCt - 7, Y(700), 0, "700", {});
    Dw.chamada(mx - rm * s3, Y(Hg - rc - tTopo / 2), mx - 22, Y(Hg) - 9, [d.topo ? "CHAPA DE TOPO # " + br(tTopo, 2).replace(",00", "") : "BOCA DE LOBO NO TRAVESSÃO"], { dir: -1, h: T.nota });
    Dw.chamada(xTr + rc * s3, Y(700), mx + 22, Y(700) - 8, ["TRAVESSA NA FACE INTERNA", "(TANGENTE, FILETE 4)"], { dir: 1, h: T.nota });
    Dw.chamada(mx + rm * s3 + tR * s3, Y(hR * 0.6), mx + 22, Y(hR) - 4, ["RODAPÉ # " + br(tR, 2).replace(",00", "") + " x " + mmT(hR), "A TOPO NOS CANTOS"], { dir: 1, h: T.nota });
    Dw.chamada(mx + rc * s3, Y(Hg), mx + 22, Y(Hg) - 6, ["TRAVESSÃO " + (d.corrimao || "")], { dir: 1, h: T.nota });

    /* ---- 4 BASE DO MONTANTE (elevação, 1:5): sobre viga de aço e sobre concreto */
    var c4 = cel(3), s4 = 1 / 5, th4 = A.tituloVista(Dw, c4.x + 3, c4.y + 3, "BASE DO MONTANTE", "ELEVAÇÃO - ESCALA 1:5", 4);
    var yA = c4.y + th4 + 48, xa = c4.x + 32, xb = c4.x + 92;
    /* a) viga de aço: mesa e alma (contexto), montante soldado na mesa */
    Dw.ret(xa - 22, yA, 44, 2.0, "MET-PERFIL"); Dw.linha(xa, yA + 2, xa, yA + 16, "MET-CONTEXTO");
    Dw.poli([[xa - rm * s4, yA - 34], [xa + rm * s4, yA - 34], [xa + rm * s4, yA], [xa - rm * s4, yA]], "MET-PERFIL", true);
    Dw.quebra(xa - rm * s4 - 2.5, yA - 34, xa + rm * s4 + 2.5, yA - 34);
    Dw.solda(xa - rm * s4, yA - 0.2, 215, { perna: String(perna), lados: "seta", contorno: true, campo: true, ls: 9, lr: 14, esquerda: true });
    Dw.texto(xa, yA + 22, "SOBRE VIGA DE AÇO", T.nota, { al: "C" });
    /* b) concreto: chapa de base chumbada, montante soldado na chapa */
    Dw.ret(xb - 26, yA, 52, 18, "MET-CONTEXTO"); Dw.hachura(xb - 26, yA, 52, 18, 2.0, "MET-HACHURA");
    Dw.ret(xb - 15, yA - 12.5 * s4 * 2, 30, 12.5 * s4 * 2, "MET-PERFIL");
    [-10, 10].forEach(function (dx) { Dw.linha(xb + dx, yA - 3, xb + dx, yA + 14, "MET-PERFIL"); Dw.linha(xb + dx, yA + 14, xb + dx + 2.5, yA + 14, "MET-PERFIL"); });
    Dw.poli([[xb - rm * s4, yA - 34], [xb + rm * s4, yA - 34], [xb + rm * s4, yA - 5], [xb - rm * s4, yA - 5]], "MET-PERFIL", true);
    Dw.quebra(xb - rm * s4 - 2.5, yA - 34, xb + rm * s4 + 2.5, yA - 34);
    Dw.solda(xb + rm * s4, yA - 5.2, -35, { perna: String(perna), lados: "seta", contorno: true, ls: 8, lr: 14 });
    Dw.texto(xb, yA + 22, "SOBRE CONCRETO (CHAPA CHUMBADA)", T.nota, { al: "C" });
    textoCel(c4, yA + 30, ["Viga de aço: montante soldado direto na mesa, filete " + perna + " mm em todo o contorno, solda de campo (a perna e a força da NBR 6120:2019, 6.3, saem do cálculo do guarda-corpo).",
      "Concreto: chapa de base e chumbadores dimensionados no cálculo do guarda-corpo; o montante é soldado na chapa. Montante soldado direto no concreto não existe."]);

    /* ---- NOTAS na coluna da direita (acima do carimbo) */
    if (geo.coluna && geo.carimbo) {
      var xn = geo.coluna.x + 3, wn = geo.coluna.w - 6, yn = geo.coluna.y + 6, yMax = geo.carimbo.y - 3;
      Dw.texto(xn, yn, "NOTAS", T.tabelaCab, { peso: 0.12 }); yn += T.tabelaCab * 1.6;
      ["Cotas em milímetros. Não medir no desenho.", "Tubos: travessão e travessas " + (d.corrimao || "[PENDENTE]") + "; montantes " + (d.montante || "[PENDENTE]") + ". Aço ASTM A36 (partida).",
       "Meia-esquadria em todo canto (planta e elevação): as duas barras na bissetriz, solda de topo CJP em todo o contorno, esmerilhada.",
       "Nada atravessa nada: travessão por cima do montante (chapa de topo ou boca de lobo), travessa e rodapé na face interna, corrimão a 40 mm com suporte Ø 16.",
       "Terminais boleados: R = 2·D (partida - conferir com o curvador).", "Soldas: eletrodo E70XX, simbologia AWS A2.4 (lado da seta embaixo da linha de referência).",
       { t: "Pintura: preparo e sistema conforme a especificação da obra [PENDENTE].", cor: V }, { t: "Dimensões de partida a conferir no cálculo e na fabricação antes de emitir.", cor: V }].forEach(function (it, i) {
        var o = typeof it === "object" ? it : { t: it }, pre = (i + 1) + "- ", wp = A.largTexto(pre, T.nota), ls = A.quebrar(o.t, T.nota, wn - wp);
        if (yn + ls.length * T.nota * 1.42 > yMax) return;
        Dw.texto(xn, yn, pre, T.nota, { cor: o.cor }); ls.forEach(function (l) { Dw.texto(xn + wp, yn, l, T.nota, { cor: o.cor }); yn += T.nota * 1.42; }); yn += 0.6;
      });
    }
    return { escala: "INDICADA" };
  }
  function defDetalheTipico(caixas) {
    var d = dadosDetalhe(caixas); if (!d) return null;
    return { id: "detalhe-guarda-corpo", marca: "", titulo: TITULO, desenhar: function (D, geo, E) { return desenharDetalheTipico(D, geo, E || D.E, d); } };
  }

  var MetalDetalhe = { PADRAO: PADRAO, TITULO_DETALHE: TITULO, ligar: ligar, ativo: ativo, meiaEsquadria: meiaEsquadria, comprimentos: comprimentos, bocaDeLobo: bocaDeLobo, retorno: retorno, corte: corte,
    guardaCorpo: guardaCorpo, finalizar: finalizar, interferencias: interferencias, dadosDetalhe: dadosDetalhe, desenharDetalheTipico: desenharDetalheTipico, defDetalheTipico: defDetalheTipico,
    _int: { ladoInterno: ladoInterno, deslocar: deslocar, tEixo: tEixo, cilLocal: cilLocal, base: base } };
  global.MetalDetalhe = MetalDetalhe;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalDetalhe;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

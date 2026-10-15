/* =====================================================================
 * acoligfundacao.js — A PLACA DE BASE ANCORADA NA FUNDAÇÃO DO MODELO
 * (motor PURO, ES5, sem DOM, Node-testável). 14/10/2026.
 *
 * Pedido do Rogério (simulação do pórtico, 14/10/2026): "o pórtico com a
 * placa de base ancorada numa fundação". Até aqui a placa de base saía com
 * fck = 25 MPa e A2/A1 = 1 de padrão, e o concreto ficava "do projeto de
 * fundação". Agora a Ligação inteligente acha a FUNDAÇÃO desenhada no BIM
 * (js/bimfundacao.js: sapata, bloco, radier) sob o pé do pilar e verifica a
 * ancoragem nela:
 *
 *   fundacaoSob(P, fundacoes, op)   a fundação sob o pé do pilar (planta do
 *                                    topo contém o ponto; topo até 30 cm
 *                                    abaixo do pé) → info (topo, altura, fck)
 *   suporteLocal(info, P, eixoD)    o contorno do topo nas coordenadas da
 *                                    placa (mm; u ao longo de d do pilar)
 *   a2a1(suporte, B, L)              A2/A1 (NBR 8800, 6.6.1: A2 = a maior área
 *                                    do topo semelhante e concêntrica à placa)
 *   verificar(res, info, ctx)        acrescenta à placa (js/acoligcalc.js)
 *                                    as verificações NA FUNDAÇÃO:
 *     · a placa cabe no topo da fundação (com o A2/A1 usado);
 *     · o chumbador (ancoragem + gancho) cabe na altura menos o cobrimento;
 *     · arrancamento do CONE de concreto do grupo tracionado, arrancamento do
 *       GANCHO, ruptura do concreto na BORDA por cisalhamento, "pryout" e a
 *       interação tração × cisalhamento.
 *
 * NORMAS. A ABNT NBR 6118 e a NBR 8800 não trazem o método de ancoragem de
 * chumbadores em concreto; a formulação usada é a do ACI 318-19, capítulo 17
 * (a mesma que o AISC Design Guide 1, 2ª ed., adota), em unidades SI (N, mm,
 * MPa), com fck no lugar de f'c (fck é o quantil de 5 %, a favor). Concreto
 * FISSURADO (ψc = 1,0, a favor) e SEM armadura suplementar (condição B,
 * φ = 0,70). Cada passo leva o item.
 *   Cone:     Nb = kc·λa·√fc·hef^1,5 (kc = 10, chumbador moldado no local —
 *             17.6.2.2.1); Ncbg = ANc/ANco·ψec·ψed·ψc·ψcp·Nb (17.6.2.1);
 *             ANco = 9·hef² (17.6.2.1.4); ψed = 0,7 + 0,3·ca,mín/(1,5·hef)
 *             (17.6.2.4); membro estreito: hef' (17.6.2.1.2).
 *   Gancho:   Np = 0,9·fc·eh·da, 3·da ≤ eh ≤ 4,5·da (17.6.3.2.2 b).
 *   Borda:    Vb = mín[0,6·(le/da)^0,2·√da·λa·√fc·ca1^1,5; 3,7·λa·√fc·ca1^1,5]
 *             (17.7.2.2.1); Vcbg = AVc/AVco·ψed·ψc·ψh·Vb, AVco = 4,5·ca1²
 *             (17.7.2.1); ψh = √(1,5·ca1/ha) ≥ 1 (17.7.2.6).
 *   Pryout:   Vcpg = kcp·Ncpg, kcp = 2 (hef ≥ 65 mm) (17.7.3).
 *   Interação: N/φNn + V/φVn ≤ 1,2 quando as duas passam de 0,2 (17.8).
 *   Cobrimento: 50 mm ADOTADO (NBR 6118:2014, Tabela 7.2 — elementos em
 *   contato com o solo; CONFERIR com a classe de agressividade do projeto). fck sem informação na fundação: 25 MPa (C25, o mínimo da
 *   NBR 6118:2014, Tabela 7.1, para concreto armado na classe II) — aviso.
 * Fora daqui (vai para o memorial como NÃO verificado): a armadura, a punção
 * e a flexão da sapata/bloco, a tensão no solo e as estacas — projeto da
 * fundação, com as reações do cálculo.
 * Teste: node tools/test-aco-simulacao-portico.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function sq(v) { return v * v; }
  function passo(rotulo, formula, valor, extra) { return { rotulo: rotulo, formula: formula || "", valor: valor, extra: extra || "" }; }
  function verif(nome, item, passos, res, sol, unid) { return { nome: nome, item: item, passos: passos, resistencia: res, solicitante: sol, unidade: unid == null ? "kN" : unid, razao: res > 0 ? sol / res : (sol > 0 ? Infinity : 0) }; }

  var ACI = "ACI 318-19, cap. 17 (SI)";
  var FCK_PADRAO = 25, FC_MAX_ACI = 69, COBRIMENTO = 50, PHI_CONC = 0.70, PHI_GANCHO = 0.70;
  var REF_FCK = "NBR 6118:2014, Tabela 7.1 (C25 para concreto armado, classe de agressividade II)";
  /* FRENTE S5 (14/10/2026): espessura do graute sob a placa de base aceita pelo sistema — 20 a 50 mm, nominal 25 mm. A
     faixa usual de 1" a 2" é a do AISC Design Guide 1 (Base Plate and Anchor Rod Design, 2ª ed., 2006); o texto não está
     na biblioteca da RA: CONFERIR (pendência de norma). */
  var GRAUTE_MIN = 20, GRAUTE_MAX = 50, GRAUTE_NOMINAL = 25, GRAUTE_CONFERIR = true;
  var REF_GRAUTE = "graute de 20 a 50 mm, referência usual AISC Design Guide 1, 2ª ed. (2006) — conferir";
  var REF_COB = "cobrimento adotado (NBR 6118:2014, Tabela 7.2 — elementos em contato com o solo; conferir com a classe de agressividade do projeto)";

  /* ------------------------------------------------ geometria plana
   * Os contornos andam como lista de PARES [a, b] aqui dentro; no dado guardado na obra (ligInfo) vão como lista de
   * OBJETOS {u, w} / {x, z} — a nuvem recusa lista dentro de lista. pts() aceita os dois. */
  function pts(P) { return arr(P).map(function (q) { return Array.isArray(q) ? [num(q[0], 0), num(q[1], 0)] : [num(q && (q.u != null ? q.u : q.x), 0), num(q && (q.w != null ? q.w : q.z), 0)]; }); }
  function objsUW(P) { return pts(P).map(function (q) { return { u: Math.round(q[0] * 10) / 10, w: Math.round(q[1] * 10) / 10 }; }); }
  function objsXZ(P) { return pts(P).map(function (q) { return { x: q[0], z: q[1] }; }); }
  function areaPol(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function dentro(P, x, z) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
  function distSeg(p, a, b) { var dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0; return Math.sqrt(sq(p[0] - a[0] - t * dx) + sq(p[1] - a[1] - t * dz)); }
  /* distância de p, na direção unitária d, até sair do polígono convexo (a primeira aresta cruzada) */
  function raio(P, p, d) {
    var best = Infinity;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      var qx = a[0] - p[0], qz = a[1] - p[1], t = (qx * ez - qz * ex) / den, u = (qx * d[1] - qz * d[0]) / den;
      if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
    }
    return best;
  }
  function distBorda(P, p) { var d = Infinity; for (var i = 0; i < P.length; i++) d = Math.min(d, distSeg(p, P[i], P[(i + 1) % P.length])); return d; }
  /* recorte de um polígono pelo retângulo [u0,u1] × [w0,w1] (Sutherland–Hodgman) */
  function recortar(P, u0, u1, w0, w1) {
    var out = P.slice();
    [[0, u0, 1], [0, u1, -1], [1, w0, 1], [1, w1, -1]].forEach(function (pl) {
      var k = pl[0], v = pl[1], s = pl[2], inp = out; out = [];
      function den(q) { return s * (q[k] - v) >= -1e-9; }
      for (var i = 0; i < inp.length; i++) {
        var A = inp[i], B = inp[(i + 1) % inp.length], ia = den(A), ib = den(B);
        if (ia && ib) out.push(B);
        else if (ia && !ib) out.push(cruza(A, B));
        else if (!ia && ib) { out.push(cruza(A, B)); out.push(B); }
      }
      function cruza(A, B) { var t = (v - A[k]) / (B[k] - A[k]); return [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]; }
    });
    return out;
  }
  /* maior escala s do retângulo centrado (u ± L/2, w ± B/2) que cabe no polígono convexo: A2/A1 = s² */
  function escalaQueCabe(P, B, L) {
    function cabe(s) { var u = s * L / 2, w = s * B / 2; return [[u, w], [-u, w], [-u, -w], [u, -w]].every(function (q) { return dentro(P, q[0], q[1]) || distBorda(P, q) < 1e-6; }); }
    if (!cabe(1)) { var lo0 = 0, hi0 = 1; for (var i0 = 0; i0 < 40; i0++) { var m0 = (lo0 + hi0) / 2; if (cabe(m0)) lo0 = m0; else hi0 = m0; } return lo0; }
    var lo = 1, hi = 2; if (cabe(2)) return 2;
    for (var i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (cabe(m)) lo = m; else hi = m; }
    return lo;
  }

  /* ------------------------------------------------ a fundação sob o pé do pilar */
  function topoPoligono(f) {
    if (!f || !f.ok) return null;
    var g = num(f.giro, 0) * Math.PI / 180, cu = Math.cos(g), su = Math.sin(g), cx = num(f.x, 0), cz = num(f.z, 0);
    function W(u, w) { return [cx + u * cu - w * su, cz + u * su + w * cu]; }
    if (f.tipoFundacao === "sapata" && f.chanfrada) { var bt = num(f.larguraTopoEf, f.largura), lt = num(f.comprimentoTopoEf, f.comprimento); return [W(-bt / 2, -lt / 2), W(bt / 2, -lt / 2), W(bt / 2, lt / 2), W(-bt / 2, lt / 2)]; }
    if (arr(f.planta).length >= 3) return f.planta.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; });
    return null;
  }
  var ROT = { sapata: "Sapata isolada", bloco: "Bloco sobre estacas", radier: "Radier", baldrame: "Baldrame", estaca: "Estaca" };
  function fundacaoSob(P, fundacoes, op) {
    op = op || {};
    var y = num(P && P[1], 0), achou = null, perto = null;
    arr(fundacoes).forEach(function (f) {
      if (!f || !f.ok || f.tipoFundacao === "estaca") return;
      var T = topoPoligono(f); if (!T || T.length < 3) return;
      var topo = num(f.cotaTopo, NaN); if (!isFinite(topo)) return;
      var dentroP = dentro(T, P[0], P[2]) || distBorda(T, [P[0], P[2]]) < 1e-6;
      var dy = y - topo;                                             /* > 0: o topo está abaixo do pé do pilar */
      if (!dentroP) return;
      if (dy >= -0.05 && dy <= 0.30) { if (!achou || Math.abs(dy) < Math.abs(achou.dy)) achou = { f: f, T: T, dy: dy }; }
      else if (!perto || Math.abs(dy) < Math.abs(perto.dy)) perto = { f: f, T: T, dy: dy };
    });
    if (!achou) return { ok: false, motivo: perto ? "a fundação " + perto.f.id + " fica sob o pilar mas o topo está a " + br(perto.dy * 1000, 0) + " mm do pé (aceito: de 50 mm acima a 300 mm abaixo)" : "nenhuma fundação desenhada sob o pé do pilar" };
    var f = achou.f, fckInf = num(f.fck, null);
    var altura = f.tipoFundacao === "radier" ? num(f.altura, 0) : num(f.cotaTopo, 0) - num(f.cotaFundo, 0);
    return { ok: true, fundacao: { id: String(f.id), tipo: f.tipoFundacao, rotulo: ROT[f.tipoFundacao] || f.tipoFundacao, cotaTopo: num(f.cotaTopo, 0), altura: altura, poligonoTopo: achou.T,
             fck: fckInf != null && fckInf > 0 ? fckInf : FCK_PADRAO, fckInformado: fckInf != null && fckInf > 0, cobrimento: num(op.cobrimento, COBRIMENTO), folgaPe: achou.dy,
             deslocTopo: num(f.deslocTopo, 0), dimensoes: f.tipoFundacao === "radier" ? null : { B: num(f.largura, 0), L: num(f.comprimento, 0), h: altura } } };
  }
  /* o topo da fundação nas coordenadas da placa (mm): u ao longo de d do pilar (o comprimento L da placa), w ao longo de bf */
  function suporteLocal(info, P, eixoD) {
    var ex = num(eixoD && eixoD[0], 1), ez = num(eixoD && eixoD[1], 0), l = Math.sqrt(ex * ex + ez * ez) || 1; ex /= l; ez /= l;
    var pol = pts(info && info.poligonoTopo).map(function (q) { var dx = q[0] - P[0], dz = q[1] - P[2]; return [(dx * ex + dz * ez) * 1000, (-dx * ez + dz * ex) * 1000]; });
    if (areaPol(pol) < 0) pol.reverse();
    return pol;
  }
  function a2a1(suporte, B, L) {
    var P = pts(suporte); if (P.length < 3) return { A2A1: 1, s: 1, cabe: true, semSuporte: true };
    var s = escalaQueCabe(P, B, L);
    return { A2A1: s >= 1 ? Math.min(4, s * s) : 1, s: s, cabe: s >= 1 - 1e-9 };
  }

  /* ------------------------------------------------ verificações na fundação
   * res = a placa (AcoLigCalc.placaBase / AcoLigCalc2.verificar base-*), info = fundacaoSob(...).fundacao,
   * ctx = { suporte (do suporteLocal), esforcos: [{comb, N, Vx, Vz, M}] } → res com as verificações a mais */
  function chumbadoresLocais(dim) {
    var c = dim.chumbadores || {}, e = num(c.borda, 40), nl = Math.max(2, num(c.porLado, 2)), B = num(dim.B, 0), L = num(dim.L, 0), out = [];
    [-1, 1].forEach(function (lado) {
      for (var k = 0; k < nl; k++) out.push({ u: lado * (L / 2 - e), w: -(B / 2 - e) + k * (B - 2 * e) / (nl - 1), lado: lado });
    });
    return out;
  }
  function cone(fc, hef, grupo, P, hFund) {
    /* grupo: [{u,w}] tracionados; P: o contorno do topo (mm, local) */
    var us = grupo.map(function (a) { return a.u; }), ws = grupo.map(function (a) { return a.w; });
    var umin = Math.min.apply(null, us), umax = Math.max.apply(null, us), wmin = Math.min.apply(null, ws), wmax = Math.max.apply(null, ws);
    var cam = Infinity; grupo.forEach(function (a) { cam = Math.min(cam, distBorda(P, [a.u, a.w])); });
    /* membro estreito (17.6.2.1.2): três ou mais bordas a menos de 1,5·hef → hef' = máx(ca,máx/1,5; s/3) */
    var dBordas = []; for (var i = 0; i < P.length; i++) { var dm = Infinity; grupo.forEach(function (a) { dm = Math.min(dm, distSeg([a.u, a.w], P[i], P[(i + 1) % P.length])); }); dBordas.push(dm); }
    var perto = dBordas.filter(function (d) { return d < 1.5 * hef; }), hefU = hef, estreito = false;
    if (perto.length >= 3) { var smax = Math.max(umax - umin, wmax - wmin); hefU = Math.min(hef, Math.max(Math.max.apply(null, perto) / 1.5, smax / 3)); estreito = hefU < hef - 1e-9; }
    var r = 1.5 * hefU, rec = recortar(P, umin - r, umax + r, wmin - r, wmax + r), ANc = Math.abs(areaPol(rec)), ANco = 9 * hefU * hefU;
    ANc = Math.min(ANc, grupo.length * ANco);
    var psiEd = cam >= 1.5 * hefU ? 1 : 0.7 + 0.3 * cam / (1.5 * hefU), Nb = 10 * Math.sqrt(fc) * Math.pow(hefU, 1.5) / 1000;
    return { hef: hef, hefU: hefU, estreito: estreito, ANc: ANc, ANco: ANco, psiEd: psiEd, camin: cam, Nb: Nb, Ncbg: ANc / ANco * psiEd * Nb, n: grupo.length };
  }
  function verificar(res, info, ctx) {
    ctx = ctx || {};
    if (!res || !res.dimensoes || !info) return res;
    var dim = res.dimensoes, ch = dim.chumbadores || {}, da = num(ch.d, 19.05), anc = num(ch.ancoragem, 300), fc = num(info.fck, FCK_PADRAO), P = pts(ctx.suporte);
    /* REVISÃO S5 N1 (14/10/2026): o CHUMBADOR QUÍMICO também passa pela fundação do modelo — o que cabe sem os dados do
       fabricante: a placa no topo (A2/A1), o cobrimento lateral e o graute/cota (20 a 50 mm; fora disso, ajuste de cota).
       O cone, a aderência, o embutimento e o cisalhamento no concreto dependem do produto → pendência crítica (não verificado).
       Antes ele pulava esta função inteira: graute de 45 ou 100 mm passava sem ajuste e o memorial dizia "atendem". */
    var quim = /quimico/i.test(String(res.tipologia || "") + " " + String(res.tipo || ""));
    /* REVISÃO B1 (14/10/2026): nas fórmulas do cap. 17 o fck vale no máximo 69 MPa (ACI 318-19, 17.3.1: 10 000 psi para
       chumbador concretado no local); a fundação aceita até 100 MPa (C90 da NBR 6118) */
    var fcA = Math.min(fc, FC_MAX_ACI);
    var hF = num(info.altura, 0) * 1000, cob = num(info.cobrimento, COBRIMENTO), vs = [], notas = [], avisos = [];
    var B = num(dim.B, 0), L = num(dim.L, 0);
    /* 1. a placa no topo da fundação (e o A2/A1 que a placa usou) */
    var ar = a2a1(P, B, L);
    vs.push(verif("Placa dentro do topo da fundação (" + info.rotulo + " " + info.id + ")", "NBR 8800:2024, 6.6.1 (A2: área do topo semelhante e concêntrica à placa)",
      [passo("Placa B × L", "", br(B, 0) + " × " + br(L, 0) + " mm"), passo("Maior escala da placa que cabe no topo", "s (busca no contorno do topo)", br(ar.s, 3)),
       passo("A2/A1", "mín(s²; 4)", br(ar.A2A1, 2), "√(A2/A1) = " + br(Math.sqrt(ar.A2A1), 2) + " na pressão de contato")], 1, ar.s > 0 ? 1 / ar.s : Infinity, ""));
    /* REVISÃO A1 (14/10/2026): o topo da fundação tem de estar no fundo do graute (pé do pilar − placa − 25 mm), ±15 mm.
       Mais baixo, o chumbador entra MENOS no concreto (a ancoragem efetiva desconta o vão) e a verificação REPROVA pela cota;
       o aviso diz quanto subir/descer o topo (o sinal estava trocado) e vai para o memorial (reprodução h8: topo a −0,25 m
       passava com hef = 262 mm, mas entravam só 97 mm) */
    /* FRENTE S5 (14/10/2026, decisão técnica da gerente — o "não consegui calcular" do Rogério): a Fundação nasce com o
       topo no nível (deslocamento 0) e a regra de ±15 mm reprovava TODA placa (razão ~2,5), e o "Ligar todos os nós"
       pulava todas as bases. Agora: GRAUTE de 20 a 50 mm aceito (GRAUTE_MIN/MAX — referência usual: AISC Design Guide 1,
       a CONFERIR no texto); fora disso é AJUSTE DE COTA (aviso com o valor + a proposta do topo em −(placa + 25 mm), que a
       tela aplica num lote), não razão estrutural.
       REVISÃO S5 A1 (14/10/2026, regressão minha): o chumbador é DETALHADO para o graute nominal de 25 mm (placa + 25 mm +
       a ancoragem); todo graute ALÉM dos 25 mm é vão que o chumbador atravessa sem ancorar. Ancoragem efetiva =
       ancoragem − max(0, graute real − 25) (antes descontava só o que passava de 50 mm: graute de 45 mm passava com a
       ancoragem cheia, mas entravam 20 mm a menos). Graute acima de 25 mm → "Ancoragem efetiva no concreto" reprova e o
       ajuste de cota leva o topo a −(placa + 25 mm); abaixo de 20 mm → ajuste de cota (o graute não cabe). */
    var tPl = num(dim.t, 0), grReal = info.folgaPe != null ? info.folgaPe * 1000 - tPl : GRAUTE_NOMINAL, vaoExc = !quim && grReal - GRAUTE_NOMINAL > 0.5 ? grReal - GRAUTE_NOMINAL : 0, ancEf = Math.max(0, anc - vaoExc), ajusteCota = null;
    if (grReal < GRAUTE_MIN - 1e-6 || vaoExc > 0 || (quim && grReal > GRAUTE_MAX + 1e-6)) {
      var difM = (info.folgaPe != null ? info.folgaPe : 0) - (tPl + GRAUTE_NOMINAL) / 1000;
      var ajTxt = difM > 0 ? "SUBIR o topo da fundação " + br(difM * 1000, 0) + " mm" : "DESCER o topo da fundação " + br(-difM * 1000, 0) + " mm";
      ajusteCota = { fundacao: info.id, rotulo: info.rotulo, grauteMm: Math.round(grReal * 10) / 10, placaMm: tPl, deslocTopoAtual: num(info.deslocTopo, 0), deslocTopoNovo: Math.round((num(info.deslocTopo, 0) + difM) * 1e4) / 1e4, mudancaMm: Math.round(difM * 1000),
                     texto: "Topo da " + info.rotulo.toLowerCase() + " " + info.id + " a " + br(num(info.folgaPe, 0) * 1000, 0) + " mm do pé do pilar: com a placa de " + br(tPl, 1) + " mm o graute ficaria com " + br(grReal, 0) + " mm (" + (grReal < GRAUTE_MIN ? "mínimo " + GRAUTE_MIN + " mm — " + REF_GRAUTE : quim ? "máximo " + GRAUTE_MAX + " mm — " + REF_GRAUTE : "o chumbador é detalhado para " + GRAUTE_NOMINAL + " mm de graute; os " + br(vaoExc, 0) + " mm a mais não ancoram" + (grReal > GRAUTE_MAX + 1e-6 ? " e passam do graute máximo de " + GRAUTE_MAX + " mm" : "")) + ") — AJUSTE DE COTA: " + ajTxt + " (deslocamento do topo " + br(num(info.deslocTopo, 0), 3) + " → " + br(num(info.deslocTopo, 0) + difM, 3) + " m: topo em −(placa + " + GRAUTE_NOMINAL + " mm) abaixo do pé)" + (vaoExc > 0 ? ". Com o vão, o chumbador entra " + br(ancEf, 0) + " mm no concreto (a verificação usa isso)" : "") };
      avisos.push(ajusteCota.texto); notas.push(ajusteCota.texto);
    }
    if (vaoExc > 0) vs.push(verif("Ancoragem efetiva no concreto (graute de " + br(grReal, 0) + " mm: " + br(vaoExc, 0) + " mm além dos " + GRAUTE_NOMINAL + " mm do detalhe)", "detalhe da base: o chumbador desce placa + " + GRAUTE_NOMINAL + " mm de graute + a ancoragem; o graute a mais não ancora — " + REF_GRAUTE,
      [passo("Graute que a cota deixa", "pé do pilar − topo da fundação − placa", br(grReal, 0) + " mm"), passo("Graute além do detalhe", "graute − " + GRAUTE_NOMINAL, br(vaoExc, 0) + " mm"),
       passo("Ancoragem efetiva", "ancoragem do detalhe − vão = " + br(anc, 0) + " − " + br(vaoExc, 0), br(ancEf, 0) + " mm", "ajuste o topo da fundação (" + (ajusteCota ? ajusteCota.texto.split("AJUSTE DE COTA: ")[1] : "") + ")")], ancEf, anc, "mm"));
    /* 2. o chumbador cabe na altura da fundação */
    /* o químico: o graute sob a placa conferido na própria verificação (máximo de 50 mm; abaixo de 20 mm é o ajuste de cota) */
    if (quim) vs.push(verif("Graute sob a placa do chumbador químico (" + br(grReal, 0) + " mm; aceito de " + GRAUTE_MIN + " a " + GRAUTE_MAX + " mm)", REF_GRAUTE,
      [passo("Graute que a cota deixa", "pé do pilar − topo da fundação − placa", br(grReal, 0) + " mm", grReal < GRAUTE_MIN ? "abaixo do mínimo: ajuste de cota (" + (ajusteCota ? ajusteCota.texto.split("AJUSTE DE COTA: ")[1] : "") + ")" : ""), passo("Máximo", "", GRAUTE_MAX + " mm")], GRAUTE_MAX, grReal, "mm"));
    var prof = ancEf + da;
    if (!quim) vs.push(verif("Chumbador cabe na altura da fundação (ancoragem " + br(ancEf, 0) + " mm no concreto + gancho)", "NBR 6118:2014, 9.4.2 (lb) e o cobrimento: " + REF_COB,
      [passo("Profundidade do chumbador", "ancoragem + da (o gancho)", br(prof, 0) + " mm"), passo("Altura útil", "h − cobrimento = " + br(hF, 0) + " − " + br(cob, 0), br(hF - cob, 0) + " mm")], hF - cob, prof, "mm"));
    /* REVISÃO M3 (14/10/2026): o cobrimento LATERAL do chumbador — a menor distância do eixo à borda do topo menos da/2 não
       pode ficar abaixo do cobrimento adotado (ACI 318-19, 17.9.2: a distância mínima à borda do chumbador concretado sem
       aperto controlado vem do cobrimento da armadura — aqui, o da NBR 6118). Antes: eixo a 40 mm da borda passava (h14) */
    var cobL = Infinity;
    chumbadoresLocais(dim).forEach(function (a) { var dd = distBorda(P, [a.u, a.w]); if (!dentro(P, a.u, a.w)) dd = -dd; cobL = Math.min(cobL, dd - da / 2); });
    if (isFinite(cobL)) vs.push(verif("Cobrimento lateral do chumbador (eixo a " + br(cobL + da / 2, 0) + " mm da borda da fundação)", ACI + ", 17.9.2 (distância mínima à borda pelo cobrimento da armadura) e o cobrimento: " + REF_COB,
      [passo("Menor distância do eixo à borda do topo", "", br(cobL + da / 2, 0) + " mm"), passo("Cobrimento lateral", "distância − da/2", br(cobL, 0) + " mm", "o gancho voltado para DENTRO da fundação"),
       passo("Mínimo", "cobrimento adotado", br(cob, 0) + " mm", "premissa: porca só encostada (sem aperto controlado; com aperto controlado a ACI pede 6·da à borda)")], cobL, cob, "mm"));
    if (isFinite(cobL) && cobL < cob - 1e-6) { var avC = "Chumbador a " + br(cobL + da / 2, 0) + " mm da borda da " + info.rotulo.toLowerCase() + " " + info.id + ": cobrimento lateral " + br(cobL, 0) + " mm < " + br(cob, 0) + " mm — afaste o pilar da borda ou aumente o topo da fundação."; avisos.push(avC); notas.push(avC); }
    /* 3. tração nos chumbadores: o grupo do lado tracionado (e o grupo todo com arrancamento líquido) — o químico não (produto) */
    if (!quim) {
    var vT = arr(res.verificacoes).filter(function (v) { return /Chumbadores à tração/.test(v.nome); })[0], vV = arr(res.verificacoes).filter(function (v) { return /Chumbadores ao cisalhamento/.test(v.nome); })[0];
    var Tch = vT ? num(vT.solicitante, 0) : 0, esf = arr(ctx.esforcos), upl = esf.some(function (s) { return num(s.N, 0) > 0; });
    var Vtot = 0; esf.forEach(function (s) { Vtot = Math.max(Vtot, Math.sqrt(sq(num(s.Vx, num(s.V, 0))) + sq(num(s.Vz, 0)))); });
    var anc0 = chumbadoresLocais(dim), hef = Math.max(50, ancEf - 2 * da);
    /* REVISÃO C1 (14/10/2026): o momento entra em MÓDULO (pode tracionar qualquer lado) — o cone é verificado nos grupos
       dos DOIS lados em u (+u e −u) e nos dois em w (momento no outro eixo), e vale o PIOR (a borda mais perto manda);
       antes só o lado +u: o pilar perto da borda do outro lado aprovava (0,991 com o cone real 1,238 — reprodução h18) */
    var ws0 = anc0.map(function (a) { return a.w; }), wMax = Math.max.apply(null, ws0), wMin = Math.min.apply(null, ws0);
    var GRUPOS = [{ nome: "lado +u", g: anc0.filter(function (a) { return a.lado > 0; }) }, { nome: "lado −u", g: anc0.filter(function (a) { return a.lado < 0; }) },
                  { nome: "lado +w", g: anc0.filter(function (a) { return Math.abs(a.w - wMax) < 1e-6; }) }, { nome: "lado −w", g: anc0.filter(function (a) { return Math.abs(a.w - wMin) < 1e-6; }) }];
    var NcbgTodos = cone(fcA, hef, anc0, P, hF).Ncbg, uN = 0, uV = 0;
    if (Tch > 1e-6) {
      var pior = null;
      (upl ? [{ nome: "grupo todo", g: anc0 }] : []).concat(GRUPOS).forEach(function (G0) {
        if (!G0.g.length) return;
        var c0 = cone(fcA, hef, G0.g, P, hF), N0 = Tch * G0.g.length, r0 = N0 / (PHI_CONC * c0.Ncbg);
        if (!pior || r0 > pior.r) pior = { r: r0, cn: c0, gr: G0.g, Nua: N0, nome: G0.nome };
      });
      var gr = pior.gr, cn = pior.cn, Nua = pior.Nua, phiN = PHI_CONC * cn.Ncbg;
      vs.push(verif("Arrancamento do cone de concreto (" + gr.length + " chumbadores tracionados, " + pior.nome + " — o pior)", ACI + ", 17.6.2 — concreto fissurado, condição B (φ = 0,70); o momento pode tracionar qualquer lado: vale o pior grupo",
        [passo("hef", "ancoragem no concreto − 2·da (até a face de apoio do gancho, a favor)", br(hef, 0) + " mm", cn.estreito ? "membro estreito (17.6.2.1.2): hef' = " + br(cn.hefU, 0) + " mm" : ""),
         passo("Nb", "10·√fck·hef^1,5 (kc = 10, moldado no local; λa = 1)", br(cn.Nb, 1) + " kN", "fck = " + br(fcA, 0) + " MPa" + (info.fckInformado ? " (da fundação" + (fcA < fc ? ", " + br(fc, 0) + " MPa limitado a " + br(FC_MAX_ACI, 0) + " — ACI 318-19, 17.3.1" : "") + ")" : " (adotado — " + REF_FCK + ")")),
         passo("ANc / ANco", "área projetada (1,5·hef em volta do grupo, recortada pelo topo) / 9·hef²", br(cn.ANc / 1e6, 4) + " / " + br(cn.ANco / 1e6, 4) + " m²"),
         passo("ψed,N", "ca,mín ≥ 1,5·hef → 1; senão 0,7 + 0,3·ca,mín/(1,5·hef)", br(cn.psiEd, 3), "ca,mín = " + br(cn.camin, 0) + " mm"),
         passo("φ·Ncbg", "0,70·ANc/ANco·ψed·ψc·Nb (ψc = 1,0 fissurado; ψec = ψcp = 1,0)", br(phiN, 1) + " kN"),
         passo("Nua (grupo)", gr.length + " × " + br(Tch, 1) + " kN", br(Nua, 1) + " kN", (upl ? "há combinação com arrancamento líquido; " : "") + "grupos verificados: +u, −u, +w, −w" + (upl ? " e o grupo todo" : "") + " — governa " + pior.nome)], phiN, Nua));
      uN = Nua / phiN;
      var eh = 4.5 * da, Np = 0.9 * fcA * eh * da / 1000, phiP = PHI_GANCHO * Np;
      vs.push(verif("Arrancamento do gancho (por chumbador)", ACI + ", 17.6.3.2.2 (b) — Np = 0,9·fc·eh·da, 3·da ≤ eh ≤ 4,5·da; ψc,P = 1,0; φ = 0,70",
        [passo("eh (detalhar)", "4,5·da", br(eh, 0) + " mm"), passo("φ·Np", "0,70·0,9·" + br(fcA, 0) + "·" + br(eh, 0) + "·" + br(da, 2), br(phiP, 1) + " kN"), passo("Tração por chumbador", "", br(Tch, 1) + " kN")], phiP, Tch));
      uN = Math.max(uN, Tch / phiP);
      notas.push("Gancho do chumbador com eh = 4,5·da = " + br(eh, 0) + " mm (a verificação do arrancamento usa esse valor — detalhar assim).");
    } else notas.push("Chumbadores sem tração nas combinações últimas: cone e gancho não solicitados (a ancoragem mínima continua).");
    /* 4. cisalhamento: ruptura da borda (fileira da frente leva tudo — furo alargado) e pryout */
    if (Vtot > 1e-6) {
      var pior = null;
      [[0, 1], [0, -1], [1, 1], [1, -1]].forEach(function (d) {
        var k = d[0], s = d[1], frente = anc0.filter(function (a) { var v = k === 0 ? a.u : a.w; return Math.abs(v - s * Math.max.apply(null, anc0.map(function (b) { return s * (k === 0 ? b.u : b.w); }))) < 1e-6; });
        var dirV = k === 0 ? [s, 0] : [0, s], ca1 = Infinity; frente.forEach(function (a) { ca1 = Math.min(ca1, raio(P, [a.u, a.w], dirV)); });
        if (!isFinite(ca1)) return;
        var lat = frente.map(function (a) { return k === 0 ? a.w : a.u; }), lmin = Math.min.apply(null, lat), lmax = Math.max.apply(null, lat);
        function ate(a, sg) { return raio(P, [a.u, a.w], k === 0 ? [0, sg] : [sg, 0]); }
        var ca2a = Infinity, ca2b = Infinity; frente.forEach(function (a) { if ((k === 0 ? a.w : a.u) === lmin) ca2a = Math.min(ca2a, ate(a, -1)); if ((k === 0 ? a.w : a.u) === lmax) ca2b = Math.min(ca2b, ate(a, 1)); });
        var ha = hF, le = Math.min(hef, 8 * da);
        var Vb = Math.min(0.6 * Math.pow(le / da, 0.2) * Math.sqrt(da) * Math.sqrt(fcA) * Math.pow(ca1, 1.5), 3.7 * Math.sqrt(fcA) * Math.pow(ca1, 1.5)) / 1000;
        var AVc = (Math.min(ca2a, 1.5 * ca1) + (lmax - lmin) + Math.min(ca2b, 1.5 * ca1)) * Math.min(1.5 * ca1, ha), AVco = 4.5 * ca1 * ca1;
        AVc = Math.min(AVc, frente.length * AVco);
        var ca2 = Math.min(ca2a, ca2b), psiEd = ca2 >= 1.5 * ca1 ? 1 : 0.7 + 0.3 * ca2 / (1.5 * ca1), psiH = ha < 1.5 * ca1 ? Math.sqrt(1.5 * ca1 / ha) : 1;
        var Vcbg = AVc / AVco * psiEd * 1.0 * psiH * Vb;
        if (!pior || Vcbg < pior.Vcbg) pior = { Vcbg: Vcbg, ca1: ca1, ca2: ca2, AVc: AVc, AVco: AVco, psiEd: psiEd, psiH: psiH, Vb: Vb, n: frente.length, dir: (s > 0 ? "+" : "−") + (k === 0 ? "u (direção de d do pilar)" : "w (direção de bf)") };
      });
      if (pior) {
        var phiV = PHI_CONC * pior.Vcbg;
        vs.push(verif("Ruptura do concreto na borda por cisalhamento (" + pior.n + " chumbadores da frente levam a força toda)", ACI + ", 17.7.2 — fissurado sem armadura (ψc,V = 1,0), φ = 0,70; a pior das 4 direções",
          [passo("Direção governante", "", pior.dir), passo("ca1 / ca2", "distância à borda na direção da força / lateral", br(pior.ca1, 0) + " / " + br(pior.ca2, 0) + " mm"),
           passo("Vb", "mín[0,6·(le/da)^0,2·√da·√fck·ca1^1,5; 3,7·√fck·ca1^1,5]", br(pior.Vb, 1) + " kN"),
           passo("AVc / AVco", "projeção na face lateral / 4,5·ca1²", br(pior.AVc / 1e6, 4) + " / " + br(pior.AVco / 1e6, 4) + " m²"),
           passo("ψed,V · ψh,V", "", br(pior.psiEd, 3) + " · " + br(pior.psiH, 3)), passo("φ·Vcbg", "0,70·AVc/AVco·ψed·ψc·ψh·Vb", br(phiV, 1) + " kN"), passo("V da base", "a maior das combinações últimas", br(Vtot, 1) + " kN")], phiV, Vtot));
        uV = Vtot / phiV;
      }
      var phiCp = PHI_CONC * 2 * NcbgTodos;
      vs.push(verif("Arrancamento por alavanca (pryout) do grupo", ACI + ", 17.7.3 — Vcpg = kcp·Ncpg, kcp = 2 (hef ≥ 65 mm), φ = 0,70",
        [passo("Ncpg (grupo todo)", "cone dos " + anc0.length + " chumbadores", br(NcbgTodos, 1) + " kN"), passo("φ·Vcpg", "0,70·2·Ncpg", br(phiCp, 1) + " kN"), passo("V da base", "", br(Vtot, 1) + " kN")], phiCp, Vtot));
      uV = Math.max(uV, Vtot / phiCp);
      if (vV) uV = Math.max(uV, num(vV.razao, 0));
    }
    if (uN > 0.2 && uV > 0.2) vs.push(verif("Tração × cisalhamento no concreto", ACI + ", 17.8.3 (Nua/φNn + Vua/φVn ≤ 1,2)", [passo("Nua/φNn", "", br(uN, 3)), passo("Vua/φVn", "", br(uV, 3))], 1.2, uN + uV, ""));
    } else notas.push("Chumbador químico na " + info.rotulo.toLowerCase() + " " + info.id + ": verificados a placa no topo, o cobrimento lateral e o graute (" + br(grReal, 0) + " mm); cone, aderência do adesivo, embutimento e ruptura do concreto por cisalhamento dependem dos dados do fabricante — NÃO verificados.");
    if (fcA < fc) notas.push("fck " + br(fc, 0) + " MPa da " + info.rotulo.toLowerCase() + " " + info.id + ": nas verificações de ancoragem (cone, gancho, borda, pryout) foi usado " + br(FC_MAX_ACI, 0) + " MPa — teto da ACI 318-19, 17.3.1, para chumbador concretado no local.");
    if (!info.fckInformado) avisos.push("fck da fundação " + info.id + " não informado: adotado " + br(FCK_PADRAO, 0) + " MPa (" + REF_FCK + ") — informe o fck nas Propriedades da fundação.");
    var todas = arr(res.verificacoes).concat(vs), rz = 0, gov = null;
    todas.forEach(function (v) { if (v.razao > rz) { rz = v.razao; gov = v.nome; } });
    var out = {}; Object.keys(res).forEach(function (k) { out[k] = res[k]; });
    out.verificacoes = todas; out.razao = rz; out.governante = gov; out.ok = rz <= 1 + 1e-9 && res.ok !== false;
    /* 1.2.148: a placa A CONFIRMAR (fck da fundação não informado — js/acoligcalc2.js) continua dizendo POR QUÊ não está aprovada */
    if (res.aConfirmar && rz <= 1 + 1e-9) { out.governante = res.governante; out.aConfirmar = res.aConfirmar; out.okVerificacoes = true; }
    out.fundacao = { id: info.id, tipo: info.tipo, rotulo: info.rotulo, fck: fc, fckInformado: info.fckInformado, A2A1: ar.A2A1, altura: info.altura, cobrimento: cob, dimensoes: info.dimensoes, folgaPe: info.folgaPe, cotaTopo: info.cotaTopo, poligonoTopo: objsXZ(info.poligonoTopo) };
    out.notas = arr(res.notas).filter(function (x) { return !/arrancamento do cone de concreto/i.test(x); }).concat(notas, [(quim ? "Placa e graute verificados na " : "Ancoragem verificada na ") + info.rotulo.toLowerCase() + " " + info.id + " do modelo (fck " + br(fc, 0) + " MPa, h = " + br(hF, 0) + " mm, A2/A1 = " + br(ar.A2A1, 2) + "). A armadura, a punção e a flexão da fundação, a tensão no solo e as estacas são do projeto da fundação, com as reações do cálculo."]);
    out.naoVerificado = arr(res.naoVerificado).filter(function (x) { return !/^Cone de concreto/i.test(x); }).concat(["Fundação (" + info.rotulo.toLowerCase() + " " + info.id + "): armadura, punção, flexão, tensão no solo — projeto da fundação, com as reações deste memorial."]);
    out.avisosFundacao = avisos;
    out.naoVerificadoCritico = arr(res.naoVerificadoCritico).concat(quim ? ["Fundação " + info.id + " com chumbador químico: cone de concreto, aderência do adesivo, embutimento (hef) e ruptura do concreto por cisalhamento — sem os dados do fabricante, NÃO VERIFICADOS"] : []);
    if (!out.naoVerificadoCritico.length) delete out.naoVerificadoCritico;
    if (ajusteCota) out.ajusteCota = ajusteCota;
    return out;
  }

  var AcoLigFundacao = { GRAUTE_MIN: GRAUTE_MIN, GRAUTE_MAX: GRAUTE_MAX, GRAUTE_NOMINAL: GRAUTE_NOMINAL, GRAUTE_CONFERIR: GRAUTE_CONFERIR, REF_GRAUTE: REF_GRAUTE, FCK_PADRAO: FCK_PADRAO, FC_MAX_ACI: FC_MAX_ACI, COBRIMENTO: COBRIMENTO, REF_FCK: REF_FCK, REF_COB: REF_COB,
                         pts: pts, objsUW: objsUW, objsXZ: objsXZ, topoPoligono: topoPoligono, fundacaoSob: fundacaoSob, suporteLocal: suporteLocal, a2a1: a2a1, verificar: verificar,
                         _int: { cone: cone, raio: raio, recortar: recortar, escalaQueCabe: escalaQueCabe, chumbadoresLocais: chumbadoresLocais, areaPol: areaPol } };
  global.AcoLigFundacao = AcoLigFundacao;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigFundacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

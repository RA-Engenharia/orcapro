/* =====================================================================
 * biminstconectar.js — CONECTAR PELA ALTURA DE REFERÊNCIA e o ALINHAMENTO (prolongamento) dos tubos (N23, 23/10/2026) — motor
 * PURO (ES5, Node-testável): devolve as ops; não grava nada.
 *
 * PEDIDO DO ROGÉRIO (23/10/2026): "opção na barra de conectar que pega a altura (cota) de referência do tubo escolhido; conexões
 * certas (tê, joelho 90/45, luva, redução, curva) sem peça sobreposta; snap melhorado para tubos (ponta, meio, eixo, face,
 * prolongamento, altura de referência)".
 *
 * ANTES: o "Conectar a" (js/bimfita.js opsConectar) levava a ponta livre do 1º tubo em LINHA RETA até o 2º — com alturas diferentes
 * o tubo saía na DIAGONAL (no ar, atravessando o que estivesse no caminho), e nada conferia se as conexões cabiam.
 *
 * O QUE FAZ (conectarRef):
 *  · a COTA DE REFERÊNCIA é a do tubo de DESTINO no ponto de ligação (horizontal: a cota dele ali, com a declividade; vertical: a
 *    cota do tubo que chega, dentro do comprimento do vertical);
 *  · o caminho é de PROJETO: a ponta livre sobe/desce na vertical até a cota de referência e corre na horizontal, em trechos
 *    ortogonais (L) — nunca diagonal no ar; trecho colinear com o tubo que chega o PROLONGA (sem luva à toa);
 *  · a ligação no meio do destino divide o tubo no nó (tê; no ESGOTO, junção 45° a favor do escoamento do destino, p1 → p2);
 *    na ponta livre do destino, joelho/luva;
 *  · ESGOTO: os trechos horizontais novos descem até o destino com a declividade mínima do DN (HidNormas es.declividade_minima);
 *  · ENCAIXE: cada trecho novo tem de comportar as faces das duas conexões das pontas (a MESMA medida do 3D: HidGeo.facesNo) —
 *    o que não cabe é RECUSADO com o quanto falta (nunca peça sobreposta calada).
 * snapProlongamento: o ponto na RETA de um tubo horizontal além da ponta dele (alinhar um tubo novo com o existente, na mesma cota).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HG() { return dep("HidGeo", "./biminstgeo.js"); }
  function HN() { return dep("HidNormas", "./hidnormas.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function P3(x, y, z) { return { x: r4(x), y: r4(y), z: r4(z) }; }
  function d3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function un(v) { var L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); return L > 1e-12 ? { x: v.x / L, y: v.y / L, z: v.z / L } : { x: 0, y: 0, z: 0 }; }   // hid:ok tolerância numérica
  function f2(v) { return (Math.round(num(v, 0) * 100) / 100).toFixed(2).replace(".", ","); }   // hid:ok formatação
  var EPS = 1e-6;   // hid:ok tolerância numérica
  var GEO_CON = {
    tolCota: 0.002,       // hid:ok abaixo de 2 mm de diferença de cota não há degrau (a mesma cota)
    lateralMin: 0.002,    // hid:ok desvio lateral abaixo de 2 mm = alinhado (sem L)
    pontaMeio: 0.02,      // hid:ok a ligação a menos de 2 % da ponta do destino vai na ponta (não divide o tubo)
    folgaEncaixe: 0.003,  // hid:ok 3 mm de sobra na conferência do encaixe (a tangência real da peça difere um nada da conta)
    tolEncaixe: 0.001,    // hid:ok 1 mm: o arredondamento das cotas a 0,1 mm não recusa a ligação que encaixa (a sobra de 3 mm já está na conta)
    raioProlonga: 0.15,   // hid:ok distância lateral do cursor à reta do tubo para o alinhamento (o mesmo raio do agarrar)
    alcanceProlonga: 3.0  // hid:ok até 3 m além da ponta
  };

  /* a face de uma conexão (m) pela MESMA conta do 3D; sem o perfil medido: null (o encaixe não é conferido e o resultado diz) */
  function face(tipo, material, sistema, dn, ramos, i) {
    var G = HG(); if (!G || !G.facesNo) return null;
    var f = null; try { f = G.facesNo({ tipo: tipo, material: material, sistema: sistema, dn: dn }, ramos)[i]; } catch (e) { f = null; }
    return f == null ? null : f;
  }
  function vetor(a) { return [a.x, a.y, a.z]; }
  function neg(a) { return { x: -a.x, y: -a.y, z: -a.z }; }
  function ang(a, b) { var c = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)); return Math.acos(c) * 180 / Math.PI; }   // hid:ok graus
  function declMin(sistema, dn) {
    if (sistema !== "esgoto") return 0;
    var N = HN(); if (!N || !N.tabela) return null;
    var v = null;
    try { var t = N.tabela("es.declividade_minima"), L = arr(t && t.linhas).filter(function (l) { return l.dn_max === "*" || Number(dn) <= num(l.dn_max, -1); })[0]; v = L ? num(L.declividade_pct, null) : null; } catch (e) { v = null; }
    return v == null ? null : v / 100;   // hid:ok % → fração
  }

  /* ================================================ CONECTAR PELA ALTURA DE REFERÊNCIA
   * conectarRef(estado, idA, idB) → { ok, erro?, ops[], rota: [pontos], cota, ligacao: "te"|"juncao45"|"ponta", avisos[] } */
  function conectarRef(estado, idA, idB) {
    var B = BI(); if (!B || !B.opDoTrecho || !B.dividirTrecho) return { ok: false, erro: "O motor das instalações não está carregado.", ops: [] };
    var TOL = B.TOL, tr = arr(estado && estado.instalacoes && estado.instalacoes.trechos), por = {}; tr.forEach(function (t) { por[String(t.id)] = t; });
    var A = por[String(idA)], D = por[String(idB)];
    if (!A || !D || A === D) return { ok: false, erro: "Selecione dois tubos: o que vai ligar e, com Ctrl+clique, o de destino (a cota de referência é a dele).", ops: [] };
    if (A.sistema !== D.sistema) return { ok: false, erro: "Os tubos são de sistemas diferentes (" + A.sistema + " × " + D.sistema + "): não se ligam.", ops: [] };
    if (["p1", "p2"].some(function (k) { return d3(A[k], D.p1) <= TOL || d3(A[k], D.p2) <= TOL; })) return { ok: false, erro: "Os dois tubos já estão ligados.", ops: [] };
    var livre = function (k) { return !tr.some(function (o) { return o.id !== A.id && (d3(o.p1, A[k]) <= TOL || d3(o.p2, A[k]) <= TOL); }); };
    var pontas = ["p1", "p2"].filter(livre); if (!pontas.length) return { ok: false, erro: "O 1º tubo não tem ponta livre: as duas já estão ligadas.", ops: [] };
    var dnA = num(A.dn, 0), mat = A.material, sis = A.sistema, avisos = [];
    var vertD = Math.abs(D.p1.x - D.p2.x) < EPS && Math.abs(D.p1.z - D.p2.z) < EPS;
    /* a ponta livre mais perto do destino */
    /* a ponta livre mais perto do destino; empate (1 cm): a que APONTA para ele (o tubo segue em frente, não volta por cima de si) */
    function aponta(kk) { var Ek = A[kk], Ok = A[kk === "p1" ? "p2" : "p1"], u = un(sub(Ek, Ok)), m = { x: (D.p1.x + D.p2.x) / 2 - Ek.x, y: 0, z: (D.p1.z + D.p2.z) / 2 - Ek.z }; return u.x * m.x + u.z * m.z; }
    var k = pontas.sort(function (a, b) { var dd = dPlanSeg(A[a], D) - dPlanSeg(A[b], D); return Math.abs(dd) > 0.01 ? dd : aponta(b) - aponta(a); })[0], E = A[k], O = A[k === "p1" ? "p2" : "p1"], uA = un(sub(E, O));   // hid:ok 1 cm
    var vertA = Math.abs(uA.y) > 1 - EPS, horA = Math.abs(uA.y) < 0.2;   // hid:ok o tubo "deitado" (até ~11°)
    /* --- o PONTO DE LIGAÇÃO no destino e a COTA DE REFERÊNCIA */
    var T, sT = null, lig;
    if (vertD) {
      var y0 = Math.min(D.p1.y, D.p2.y), y1 = Math.max(D.p1.y, D.p2.y), yR = Math.max(y0, Math.min(y1, E.y));
      T = { x: D.p1.x, y: yR, z: D.p1.z };
      sT = (yR - D.p1.y) / (D.p2.y - D.p1.y);
    } else {
      var dx = D.p2.x - D.p1.x, dz = D.p2.z - D.p1.z, L2 = dx * dx + dz * dz, s;
      s = null;
      if (horA) {   /* a reta do tubo que chega (em planta) cruza a do destino À FRENTE dele? E + t·uA = D.p1 + s·(dx, dz) */
        var det = -uA.x * dz + dx * uA.z, rx = D.p1.x - E.x, rz = D.p1.z - E.z;
        if (Math.abs(det) > EPS) { var tA = (rx * -dz + dx * rz) / det, sA = (uA.x * rz - uA.z * rx) / det; if (tA > -EPS && sA >= 0 && sA <= 1) s = sA; }
      }
      if (s == null) s = Math.max(0, Math.min(1, ((E.x - D.p1.x) * dx + (E.z - D.p1.z) * dz) / L2));
      if (s < GEO_CON.pontaMeio) s = 0; else if (s > 1 - GEO_CON.pontaMeio) s = 1;
      sT = s; T = { x: D.p1.x + dx * s, y: D.p1.y + (D.p2.y - D.p1.y) * s, z: D.p1.z + dz * s };
    }
    var meio = sT > EPS && sT < 1 - EPS;
    var cota = r4(T.y);
    /* --- a ROTA (ortogonal): vertical na ponta até a cota (o esgoto já com a queda da declividade), horizontal em L até o destino */
    var i = declMin(sis, dnA); if (i == null) { avisos.push("declividade mínima do esgoto sem tabela (HidNormas es.declividade_minima): os horizontais novos saíram sem queda"); i = 0; }
    /* REVISÃO N23: o ESCOAMENTO do destino vai para a ponta MAIS BAIXA (não p1 → p2: o coletor desenhado ao contrário punha a junção
       contra o fluxo) */
    var sgD = sis === "esgoto" && !vertD && D.p1.y < D.p2.y - GEO_CON.tolCota ? -1 : 1, uD = sgD > 0 ? un(sub(D.p2, D.p1)) : un(sub(D.p1, D.p2)), esgMeio = sis === "esgoto" && meio && !vertD;
    /* ... e a ponta livre de JUSANTE do coletor não recebe ramal (dois escoamentos se encontram num ponto baixo, sem saída) */
    if (sis === "esgoto" && !vertD && !meio && (sgD > 0 ? sT >= 1 - EPS : sT <= EPS)) return { ok: false, erro: "Conectar pela altura: a ligação cairia na ponta de JUSANTE do " + D.id + " (a mais baixa) — no esgoto o ramal entra no meio do coletor (junção 45° a favor do escoamento) ou na ponta de montante dele.", ops: [] };
    /* ESGOTO no TUBO DE QUEDA/coluna: o ramal DESCE até ele com a declividade (a entrada fica abaixo da ponta, nunca acima) */
    if (sis === "esgoto" && vertD) {
      var LhV = Math.abs(T.x - E.x) + Math.abs(T.z - E.z), yV = r4(E.y - LhV * i), yV0 = Math.min(D.p1.y, D.p2.y), yV1 = Math.max(D.p1.y, D.p2.y);
      if (yV < yV0 + EPS || yV > yV1 - EPS) return { ok: false, erro: "Conectar pela altura: descendo com a declividade, o ramal chegaria a " + f2(yV) + " m, fora do " + D.id + " (" + f2(yV0) + " a " + f2(yV1) + " m).", ops: [] };
      T = { x: T.x, y: yV, z: T.z }; sT = (yV - D.p1.y) / (D.p2.y - D.p1.y); meio = sT > EPS && sT < 1 - EPS; cota = yV;
    }
    /* a face da DERIVAÇÃO do tê/junção no destino pela MESMA estrutura do nó do 3D: o destino dividido (um que chega, um que sai) + o
       ramal que chega (dRamal: do nó para fora, na direção do ramal) — com a redução/bucha quando o DN do ramal é menor (o passante
       sozinho não a punha: 153 × 169 mm na junção 100 × 40, medido) */
    function faceDerivacao(tipo, uDest, dRamal) { var dnD = num(D.dn, dnA); return face(tipo, mat, sis, dnD, [{ d: vetor(neg(uDest)), chega: true, dn: dnD }, { d: vetor(uDest), chega: false, dn: dnD }, { d: vetor(dRamal), chega: true, dn: dnA }], 2); }
    var alvo = T, pre = null;
    if (esgMeio) {
      /* JUNÇÃO 45° a favor do escoamento do destino (p1 → p2): o último trecho entra a 45°, vindo do lado da ponta livre e de montante */
      var nrm = { x: -uD.z, y: 0, z: uD.x }; if ((E.x - T.x) * nrm.x + (E.z - T.z) * nrm.z < 0) nrm = neg(nrm);
      var d45 = un({ x: nrm.x - uD.x, y: 0, z: nrm.z - uD.z }), f45 = faceDerivacao("juncao", uD, d45);
      /* o joelho 45° no começo do trecho a 45°: o tubo que CHEGA nele vem pela reta do que chega (perpendicular ao coletor: uA) ou, fora
         disso, pelo canto do L (a direção −d45 girada: a conta conservadora é a do joelho de 45° com o tubo vindo de trás) */
      var uChega = horA && Math.abs(uA.x * uD.x + uA.z * uD.z) < 0.1 ? uA : un({ x: -d45.x - uD.x * 0, y: 0, z: -d45.z });   // hid:ok perpendicular (~84°–96°)
      var fj = face("joelho45", mat, sis, dnA, [{ d: vetor(neg(uChega)), chega: true, dn: dnA }, { d: vetor(neg(d45)), chega: false, dn: dnA }], 1);
      var L45 = (f45 != null ? f45 : 0) + (fj != null ? fj : 0) + GEO_CON.folgaEncaixe;
      /* o tubo que chega PERPENDICULAR ao coletor (a reta dele cruza o coletor em T): o joelho 45° fica NA RETA dele, a a·√½ do coletor,
         e a junção desce o mesmo a·√½ a jusante — sem o zigue-zague de voltar para montante e virar de novo */
      var Ld = Math.hypot(D.p2.x - D.p1.x, D.p2.z - D.p1.z), aJ = L45 * Math.SQRT1_2, perp = horA && Math.abs(uA.x * uD.x + uA.z * uD.z) < 0.1, sJ = sT + sgD * aJ / Ld;   // hid:ok ~84° a 96° = perpendicular
      if (perp && sJ > GEO_CON.pontaMeio && sJ < 1 - GEO_CON.pontaMeio) {
        pre = { x: T.x + nrm.x * aJ, y: T.y + L45 * i, z: T.z + nrm.z * aJ };
        sT = sJ; T = { x: D.p1.x + (D.p2.x - D.p1.x) * sJ, y: D.p1.y + (D.p2.y - D.p1.y) * sJ, z: D.p1.z + (D.p2.z - D.p1.z) * sJ };
        pre.y = T.y + L45 * i;
      } else pre = { x: T.x + d45.x * L45, y: T.y + L45 * i, z: T.z + d45.z * L45 };
      alvo = pre; lig = "juncao45";
    } else lig = meio ? "te" : "ponta";
    var pts = [E], Lh = Math.abs(alvo.x - E.x) + Math.abs(alvo.z - E.z), yAlvo = alvo.y + (sis === "esgoto" ? Lh * i : 0);
    /* REVISÃO N23: o ESGOTO não sobe — a ponta abaixo do que a ligação pede (o destino + a queda do caminho) é recusada */
    if (sis === "esgoto" && yAlvo > E.y + GEO_CON.tolCota) return { ok: false, erro: "Conectar pela altura: no esgoto o tubo não sobe — a ponta do " + A.id + " está a " + f2(E.y) + " m e a ligação no " + D.id + " pede " + f2(yAlvo) + " m (a cota dele + a declividade do caminho). Ligue num ponto mais baixo do coletor ou abaixe o ramal.", ops: [], rota: [E, alvo] };
    /* vertical na ponta (a queda/subida até a cota): no tubo VERTICAL que chega é o prolongamento dele */
    if (Math.abs(E.y - yAlvo) > GEO_CON.tolCota) pts.push({ x: E.x, y: yAlvo, z: E.z });
    var Q = pts[pts.length - 1];
    /* o L em planta: 1º ao longo do tubo que chega (se ele é deitado e o destino fica à frente), depois na outra direção */
    var ex = alvo.x - Q.x, ez = alvo.z - Q.z;
    if (Math.abs(ex) > GEO_CON.lateralMin && Math.abs(ez) > GEO_CON.lateralMin) {
      var primeiroX = horA ? Math.abs(uA.x) >= Math.abs(uA.z) : Math.abs(ex) >= Math.abs(ez);
      var c = primeiroX ? { x: alvo.x, z: Q.z } : { x: Q.x, z: alvo.z }, Lc = Math.abs(c.x - Q.x) + Math.abs(c.z - Q.z);
      pts.push({ x: c.x, y: Q.y - (sis === "esgoto" ? Lc * i : 0), z: c.z });
    }
    pts.push({ x: alvo.x, y: alvo.y, z: alvo.z });
    if (pre) pts.push({ x: T.x, y: T.y, z: T.z });
    pts = pts.map(function (p) { return P3(p.x, p.y, p.z); }).filter(function (p, j, a) { return j === 0 || d3(p, a[j - 1]) > EPS; });
    if (pts.length < 2) return { ok: false, erro: "Os dois tubos já se tocam.", ops: [] };
    /* --- ENCAIXE: cada trecho comporta as faces das conexões das pontas (o 1º prolonga o tubo que chega quando é colinear) */
    var segs = []; for (var j = 0; j + 1 < pts.length; j++) segs.push({ a: pts[j], b: pts[j + 1], u: un(sub(pts[j + 1], pts[j])), L: d3(pts[j], pts[j + 1]) });
    var prolonga = segs.length && ang(uA, segs[0].u) < 1;   // hid:ok colinear (< 1°)
    function faceCanto(uIn, uOut, papel) {   /* o joelho entre dois trechos (uIn chega, uOut sai): a face do lado pedido */
      var g = ang(uIn, uOut); if (g < 1) return 0;   // hid:ok colinear: sem peça
      if (g > 136) return NaN;   // hid:ok REVISÃO N23: o caminho volta por cima de si (ou por dentro do destino): não há peça — recusa abaixo
      var tipo = g <= 46 ? "joelho45" : "joelho90";   // hid:ok o joelho mais perto do ângulo
      return face(tipo, mat, sis, dnA, [{ d: vetor(neg(uIn)), chega: true, dn: dnA }, { d: vetor(uOut), chega: false, dn: dnA }], papel === "chega" ? 0 : 1);
    }
    var falta = 0, onde = null, semPerfil = false, volta = null;
    segs.forEach(function (sg, j2) {
      var uIn = j2 === 0 ? uA : segs[j2 - 1].u, fIni = j2 === 0 && prolonga ? 0 : faceCanto(uIn, sg.u, "sai");
      var fFim;
      if (j2 === segs.length - 1) fFim = meio ? faceDerivacao(lig === "juncao45" ? "juncao" : "te", uD, neg(sg.u)) : faceCanto(sg.u, vertD ? un(sub(D[sT <= EPS ? "p2" : "p1"], T)) : (sT <= EPS ? uD : neg(uD)), "chega");
      else fFim = faceCanto(sg.u, segs[j2 + 1].u, "chega");
      if ((typeof fIni === "number" && isNaN(fIni)) || (typeof fFim === "number" && isNaN(fFim))) { volta = j2; return; }
      if (fIni == null || fFim == null) { semPerfil = true; return; }
      var f = fIni + fFim + GEO_CON.folgaEncaixe - sg.L; if (f > falta) { falta = f; onde = j2; }
    });
    if (volta != null) return { ok: false, erro: "Conectar pela altura: o trecho " + (volta + 1) + " voltaria por cima do anterior (ou por dentro do " + D.id + ") — ligue no meio do " + D.id + " ou afaste a ponta do " + A.id + ".", ops: [], rota: pts };
    if (falta > GEO_CON.tolEncaixe) return { ok: false, erro: "Conectar pela altura: o trecho " + (onde + 1) + " da ligação tem " + f2(segs[onde].L * 100) + " cm e as conexões das pontas pedem " + f2((segs[onde].L + falta - GEO_CON.folgaEncaixe) * 100) + " cm — as peças ficariam sobrepostas. Afaste a ponta do tubo (ou mude a cota dele) e conecte de novo.", ops: [], rota: pts, falta: r4(falta) };
    if (semPerfil) avisos.push("o encaixe das conexões não foi conferido: sem o perfil medido da peça no catálogo (" + mat + ", DN " + dnA + ")");
    /* --- as OPS */
    var ops = [];
    if (meio) {
      var dv = B.dividirTrecho(estado, D.id, P3(T.x, T.y, T.z));
      if (!dv || dv.length !== 2) return { ok: false, erro: "Não deu para dividir o tubo de destino nesse ponto (perto demais da ponta).", ops: [] };
      ops = ops.concat(dv); pts[pts.length - 1] = P3(dv[0].p2.x, dv[0].p2.y, dv[0].p2.z);
    }
    var oA = B.opDoTrecho(A), ini = 0;
    if (prolonga) { oA[k] = pts[1]; ini = 1; }
    if (oA.continua === k) delete oA.continua; else if (oA.continua === "ambos") oA.continua = k === "p1" ? "p2" : "p1";
    ops.push(oA);
    var base = String(A.id) + "-con", n = 0;
    function idLivre() { var id; do { id = base + (++n); } while (por[id]); return id; }
    for (var q = ini; q + 1 < pts.length; q++) ops.push({ op: "trecho", id: idLivre(), sistema: sis, material: mat, dn: dnA, p1: pts[q], p2: pts[q + 1] });
    return { ok: true, ops: ops, rota: pts, cota: cota, ligacao: lig, avisos: avisos, prolonga: prolonga };
  }
  function dPlanSeg(p, t) { var dx = t.p2.x - t.p1.x, dz = t.p2.z - t.p1.z, L2 = dx * dx + dz * dz, s = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - t.p1.x) * dx + (p.z - t.p1.z) * dz) / L2)) : 0, qx = t.p1.x + dx * s - p.x, qz = t.p1.z + dz * s - p.z; return Math.sqrt(qx * qx + qz * qz); }

  /* ================================================ SNAP: PROLONGAMENTO (alinhamento na reta do tubo, na mesma cota)
   * snapProlongamento(trechos, p {x,z}, sistema, raio) → { tipo: "prolongamento", x, y, z, dn, trecho, d } | null */
  function snapProlongamento(trechos, p, sistema, raio) {
    raio = raio || GEO_CON.raioProlonga; var melhor = null;
    arr(trechos).forEach(function (t) {
      if (sistema && t.sistema !== sistema) return;
      var dx = t.p2.x - t.p1.x, dz = t.p2.z - t.p1.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > EPS) || Math.abs(t.p2.y - t.p1.y) > L) return;   /* só o deitado */
      var ux = dx / L, uz = dz / L, s = (p.x - t.p1.x) * ux + (p.z - t.p1.z) * uz, lat = Math.abs(-(p.x - t.p1.x) * uz + (p.z - t.p1.z) * ux);
      var alem = s > L ? s - L : (s < 0 ? -s : 0); if (!(alem > 0) || alem > GEO_CON.alcanceProlonga || lat > raio) return;
      var fr = s / L, q = { tipo: "prolongamento", x: r4(t.p1.x + ux * s), y: r4(t.p1.y + (t.p2.y - t.p1.y) * fr), z: r4(t.p1.z + uz * s), dn: t.dn, trecho: t.id, d: lat };
      if (!melhor || lat < melhor.d) melhor = q;
    });
    return melhor;
  }

  var BimInstConectar = { VERSAO: 1, GEO_CON: GEO_CON, conectarRef: conectarRef, snapProlongamento: snapProlongamento };
  global.BimInstConectar = BimInstConectar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstConectar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * hidencaixe.js — ENCAIXE do traçado nas peças (motor puro, 07/11/2026).
 *
 * POR QUÊ (print do Rogério na 1.2.262, "chega de tanto te pedir isso"): o tubo de esgoto chegava na caixa sifonada / no ralo
 * na DIAGONAL do desvio de 45° e terminava na borda da peça, fora do centro. A boca da peça é RADIAL (aponta para o centro):
 * o 3D desenhava a bolsa de entrada num lugar e o tubo chegava 5 a 8 cm ao lado — "a ponta do tubo não entra no eixo da bolsa".
 * Na obra o tubo entra apontando para o centro da caixa.
 *
 * radial(ops, pecas): para cada trecho de esgoto/pluvial que termina dentro de uma peça redonda (caixa sifonada, ralo) com o eixo
 * fora do centro, desloca o CANTO anterior (o vértice entre o trecho vizinho e o que chega) ao longo do vizinho até o ponto em que o
 * trecho que chega, com a MESMA direção, aponta para o centro da peça. A ponta na peça fica no mesmo raio; o vizinho encurta ou
 * alonga; a declividade do trecho que chega não diminui. Só mexe quando o canto é de dois trechos (nada mais liga ali) e as retas
 * que sobram comportam as peças (margem); senão deixa como está (o auditor de encaixe acusa — nunca esconde).
 *   HidEncaixe.radial(ops, pecas, { margem }) → { ops (as mesmas, alteradas), ajustes: [{ trecho, vizinho, peca, lateral (m) }] }
 * pecas = [{ id, peca, x, y, z, r?, hub? }] (as de entrada do HidRota e as op "peca" do plano).
 * ===================================================================== */
(function (global) {
  "use strict";
  var TOL = 0.001;          // hid:ok 1 mm: abaixo disto o eixo já está no centro
  var MARGEM = 0.08;        // hid:ok reta mínima que sobra no vizinho e no trecho que chega (a mesma margemNo do HidRota)
  var MIN_CHEGADA = 0.04;   // hid:ok reta mínima do trecho que chega até a borda de captura (a peça e o joelho conferidos pelo auditor de encaixe 3D)
  var R_PADRAO = 0.12;      // hid:ok raio de captura da peça sem hub declarado (o do BimInst para a caixa sifonada)
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok raio de captura padrão / tolerâncias de geometria
  function d2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function igual(a, b) { return Math.abs(a.x - b.x) <= TOL && Math.abs(a.y - b.y) <= TOL && Math.abs(a.z - b.z) <= TOL; }
  /* os trechos do plano, o ÚLTIMO de cada id (o plano pode trazer o mesmo id duas vezes — o BimEdit aplica em ordem e vale o último) */
  function ultimos(ops) {
    var vistos = {}, out = [];
    for (var i = (ops || []).length - 1; i >= 0; i--) { var x = ops[i]; if (!x || x.op !== "trecho" || !x.p1 || !x.p2 || vistos[String(x.id)]) continue; vistos[String(x.id)] = 1; out.unshift(x); }
    return out;
  }
  var REDONDA = /^(caixa_sifonada|ralo_)/;
  var GRAVIDADE = { esgoto: 1, pluvial: 1 };

  function radial(ops, pecas, o) {
    o = o || {};
    var margem = num(o.margem, MARGEM), ajustes = [], apagar = [];
    var lista = ultimos(ops);
    var pcs = (pecas || []).concat((ops || []).filter(function (x) { return x && x.op === "peca"; })).filter(function (k) { return k && REDONDA.test(String(k.peca)) && isFinite(num(k.x, NaN)) && isFinite(num(k.z, NaN)); });
    var outros = (ops || []).filter(function (x) { return x && x.op !== "trecho" && isFinite(num(x.x, NaN)) && isFinite(num(x.z, NaN)); });
    /* o que já está no modelo (o.fixos: as ops do modelo — os tubos do kit, as peças) e os pontos dos aparelhos (o.pontos): ninguém mexe num canto ou numa
       ponta que toque neles (senão o tubo do kit ficava solto — a revisão da CASA pegou) */
    var fixosT = (o.fixos || []).filter(function (x) { return x && x.op === "trecho" && x.p1 && x.p2; }), fixosP = [];
    fixosT.forEach(function (x) { fixosP.push(x.p1, x.p2); });
    (o.fixos || []).forEach(function (x) { if (x && x.op !== "trecho" && isFinite(num(x.x, NaN)) && isFinite(num(x.z, NaN)) && isFinite(num(x.y, NaN))) fixosP.push({ x: num(x.x, 0), y: num(x.y, 0), z: num(x.z, 0) }); });
    (o.pontos || []).forEach(function (q) { if (q && isFinite(num(q.x, NaN))) fixosP.push({ x: num(q.x, 0), y: num(q.y, 0), z: num(q.z, 0) }); });
    var BIm = global.BimInst || (typeof require === "function" ? (function () { try { return require("./biminst.js"); } catch (e) { return null; } })() : null);
    function raioCaptura(Q) { var h = Q.hub || (BIm && BIm.normPeca ? (BIm.normPeca(Q) || {}).hub : null); return num(h && h.r, num(Q.r, R_PADRAO)); }
    /* um tubo que DERIVA no meio de T (a junção no meio do trecho, sem nó): mexer em T tiraria o ponto dele da reta — não mexe (a revisão da
       CASA-COMPLETA pegou a junção que virou 90°) */
    var todosT = lista.concat(fixosT);
    /* a derivação que ANDA JUNTO (rodada 7, casoTracar): a ventilação da caixa que sobe do meio do trecho de saída (vertical) e, lá em cima, segue
       deitada na direção do deslocamento — transladada de lado, ela continua ligada (a vertical inteira anda; o deitado de cima só encurta/alonga
       na mesma reta). Devolve as mudanças a fazer, ou null se alguma derivação não pode andar */
    function levaDerivacoes(T, v) {
      var ax = T.p2.x - T.p1.x, ay = T.p2.y - T.p1.y, az = T.p2.z - T.p1.z, L2 = ax * ax + ay * ay + az * az, Lv = Math.hypot(v.x, v.z), mud = [];
      if (!(L2 > 0) || !(Lv > 0)) return null;
      var ok = todosT.every(function (W) {
        if (W === T) return true;
        var noMeio = [W.p1, W.p2].map(function (q) { var t = ((q.x - T.p1.x) * ax + (q.y - T.p1.y) * ay + (q.z - T.p1.z) * az) / L2; return t > 1e-3 && t < 1 - 1e-3 && Math.hypot(T.p1.x + ax * t - q.x, T.p1.y + ay * t - q.y, T.p1.z + az * t - q.z) <= 0.01; });   // hid:ok tolerância de geometria / 1 cm
        if (!noMeio[0] && !noMeio[1]) return true;
        if (fixosT.indexOf(W) >= 0 || d2(W.p1, W.p2) > 1e-3) return false;   /* só a vertical do plano anda */   // hid:ok 1 mm
        var kF = noMeio[0] ? "p2" : "p1", F = W[kF];
        var viz = todosT.filter(function (X) { return X !== W && X !== T && (igual(X.p1, F) || igual(X.p2, F)); });
        if (viz.some(function (X) { if (fixosT.indexOf(X) >= 0) return true; var kx = igual(X.p1, F) ? "p2" : "p1", dx = X[kx].x - F.x, dz = X[kx].z - F.z, Lx = Math.hypot(dx, dz); return !(Lx > 0.1) || Math.abs(dx * v.z - dz * v.x) / (Lx * Lv) > 0.01; })) return false;   // hid:ok o deitado de cima na direção do deslocamento (10 cm mínimos, ~0,6°)
        mud.push({ o: W, k: "p1" }, { o: W, k: "p2" }); viz.forEach(function (X) { mud.push({ o: X, k: igual(X.p1, F) ? "p1" : "p2" }); });
        return true;
      });
      return ok ? mud : null;
    }
    function temDerivacao(T) {
      var ax = T.p2.x - T.p1.x, ay = T.p2.y - T.p1.y, az = T.p2.z - T.p1.z, L2 = ax * ax + ay * ay + az * az; if (!(L2 > 0)) return false;
      return todosT.some(function (W) {
        if (W === T) return false;
        return [W.p1, W.p2].some(function (q) {
          var t = ((q.x - T.p1.x) * ax + (q.y - T.p1.y) * ay + (q.z - T.p1.z) * az) / L2; if (t <= 1e-3 || t >= 1 - 1e-3) return false;   // hid:ok tolerância de geometria
          return Math.hypot(T.p1.x + ax * t - q.x, T.p1.y + ay * t - q.y, T.p1.z + az * t - q.z) <= 0.01;   // hid:ok 1 cm (a TOLE do HidRota)
        });
      });
    }
    function tocaFixo(P) { return fixosP.some(function (q) { return Math.abs(q.x - P.x) <= 0.01 && Math.abs(q.z - P.z) <= 0.01 && Math.abs(q.y - P.y) <= 0.05; }); }   // hid:ok 1 cm (a TOLE do HidRota) e 5 cm na altura (o ponto do aparelho)
    pcs.forEach(function (K) {
      /* o cilindro de CAPTURA da peça (o mesmo do BimInst: é ele que liga o tubo à peça) — a ponta movida continua dentro dele */
      var C = { x: num(K.x, 0), z: num(K.z, 0) }, rH = raioCaptura(K), yK = num(K.y, 0);
      lista.forEach(function (T) {
        if (!GRAVIDADE[T.sistema]) return;
        ["p1", "p2"].forEach(function (lado) {
          if (apagar.indexOf(String(T.id)) >= 0) return;
          var E = T[lado], oL = lado === "p1" ? "p2" : "p1", A = T[oL];
          /* a BOCA com o TOCO até o centro (revisão 08/11/2026, print final-ban-caixa igual ao "antes"): o traçado chega na borda da captura e um toco
             reto de ~12 cm vai da borda ao centro — o joelho ficava NA BOCA, ao lado da caixa. O trecho que chega na borda conta como o que chega na
             peça; o toco gira junto (fica na mesma reta, apontando para o centro) */
          var stub = null, dE = d2(E, C);
          if (dE > rH - 1e-4 && dE <= rH + 0.05) {   // hid:ok a boca fica até 5 cm além da captura (a bolsa da entrada: 12,5 cm na caixa, 12,4 cm no ralo)
            var naE = lista.filter(function (S) { return S !== T && (igual(S.p1, E) || igual(S.p2, E)); });
            if (naE.length === 1 && naE[0].sistema === T.sistema && Math.abs(num(naE[0].dn, 0) - num(T.dn, 0)) <= 0.5) {   // hid:ok meio milímetro de DN
              var S0 = naE[0], kS = igual(S0.p1, E) ? "p1" : "p2", Sc = S0[kS === "p1" ? "p2" : "p1"];
              if (d2(Sc, C) <= TOL && Math.abs(Sc.y - E.y) < d2(Sc, E) && !fixosT.some(function (W) { return igual(W.p1, E) || igual(W.p2, E); })) stub = { S: S0, k: kS, c: Sc };
            }
          }
          /* com o toco: o trecho vai direto ao CENTRO (no ponto do toco, o mesmo que liga na peça) e o toco sai — um tubo só, sem joelho nem luva */
          function tiraToco() { T[lado] = { x: stub.c.x, y: stub.c.y, z: stub.c.z }; if (apagar.indexOf(String(stub.S.id)) < 0) apagar.push(String(stub.S.id)); }
          if ((dE > rH - 1e-4 && !stub) || E.y > yK + 0.05 || E.y < yK - 1.5) return;   // hid:ok faixa de altura do corpo da peça (até 1,5 m abaixo do piso)
          var Lh = d2(A, E); if (Lh < TOL || Math.abs(A.y - E.y) > Lh) return;   /* vertical (pelo fundo / pela grelha): nada a alinhar */
          var u = { x: (E.x - A.x) / Lh, z: (E.z - A.z) / Lh };
          var lat = Math.abs((C.x - E.x) * u.z - (C.z - E.z) * u.x);
          if (lat <= TOL) return;
          var levar = null;
          if (temDerivacao(T)) { var cE = { x: C.x - E.x, z: C.z - E.z }, pr0 = cE.x * u.x + cE.z * u.z; levar = levaDerivacoes(T, { x: cE.x - pr0 * u.x, z: cE.z - pr0 * u.z }); if (!levar || !levar.length) return; levar.v = { x: cE.x - pr0 * u.x, z: cE.z - pr0 * u.z }; }
          /* a ponta na peça pode ser a mesma da saída da peça (o nó da caixa no traçado): a ligação é pela captura da peça, não pelo ponto */
          if (tocaFixo(A)) return;
          /* o canto A: só o trecho vizinho (mesmo sistema) liga ali — nada de peça, acessório, aparelho ou terceiro trecho */
          /* o trecho liga DUAS peças redondas (o ralo seco que deságua na caixa sifonada): as duas pontas vão para a reta entre os centros */
          var K2 = pcs.filter(function (Q) { return Q !== K && d2(A, { x: num(Q.x, 0), z: num(Q.z, 0) }) < raioCaptura(Q) - 1e-4; })[0];   // hid:ok vertical = desnível 10 × a projeção
          if (K2 && levar) return;
          if (K2) {
            var C2 = { x: num(K2.x, 0), z: num(K2.z, 0) }, Lcc = d2(C2, C), rA = d2(A, C2), rE1 = d2(E, C); if (!(Lcc - rA - rE1 >= MIN_CHEGADA)) return;
            var vc = { x: (C.x - C2.x) / Lcc, z: (C.z - C2.z) / Lcc };
            ajustes.push({ trecho: String(T.id), vizinho: null, peca: String(K.id), lateral: r4(lat), entrePecas: String(K2.id) });
            T[oL] = { x: r4(C2.x + vc.x * rA), y: A.y, z: r4(C2.z + vc.z * rA) }; T[lado] = { x: r4(C.x - vc.x * rE1), y: E.y, z: r4(C.z - vc.z * rE1) };
            if (stub) tiraToco();
            return;
          }
          var viz = lista.filter(function (V) { return V !== T && (igual(V.p1, A) || igual(V.p2, A)); });
          /* o que chega no canto A é VERTICAL (a descida do aparelho, no plano ou já no modelo): o joelho de 90° aceita qualquer direção na
             horizontal — o trecho que chega só gira em A até apontar para o centro (o canto não anda) */
          var vizT = viz.concat(fixosT.filter(function (W) { return igual(W.p1, A) || igual(W.p2, A); }));
          var soVertical = vizT.length >= 1 && vizT.every(function (W) { return Math.abs(W.p1.y - W.p2.y) > d2(W.p1, W.p2) * 10; });   // hid:ok "vertical" = desnível 10 × a projeção
          if (soVertical && levar) return;
          if (soVertical && vizT.every(function (W) { return W.sistema === T.sistema; })) {
            var rE0 = d2(E, C), Lc = d2(A, C); if (!(Lc - rE0 >= MIN_CHEGADA)) return;
            var uc = { x: (C.x - A.x) / Lc, z: (C.z - A.z) / Lc }, Er = { x: r4(C.x - uc.x * rE0), y: E.y, z: r4(C.z - uc.z * rE0) };
            ajustes.push({ trecho: String(T.id), vizinho: null, peca: String(K.id), lateral: r4(lat), girou: true });
            T[lado] = Er; if (stub) tiraToco();
            return;
          }
          if (viz.length !== 1 || viz[0].sistema !== T.sistema) return;
          if (outros.some(function (x) { return Math.abs(num(x.x, 1e9) - A.x) <= TOL && Math.abs(num(x.z, 1e9) - A.z) <= TOL; })) return;   // hid:ok sentinela de coordenada ausente
          var V = viz[0], vL = igual(V.p1, A) ? "p1" : "p2", A0 = V[vL === "p1" ? "p2" : "p1"], L1 = d2(A0, A);
          if (fixosT.some(function (W) { return igual(W.p1, A) || igual(W.p2, A); }) || temDerivacao(V)) return;
          if (L1 < TOL || Math.abs(A0.y - A.y) > L1) return;   /* o vizinho vertical (a descida): o canto não anda */
          var u1 = { x: (A.x - A0.x) / L1, z: (A.z - A0.z) / L1 };
          /* A0 + s·u1 = C − t·u  (o canto novo, na reta do vizinho, de onde a mesma direção u leva ao centro) */
          var det = u1.x * u.z - u1.z * u.x; if (Math.abs(det) < 1e-6) return;   // hid:ok paralelismo numérico (det ~ 0)
          var wx = C.x - A0.x, wz = C.z - A0.z, s = (wx * u.z - wz * u.x) / det, t = (u1.x * wz - u1.z * wx) / det;
          var rE = d2(E, C);
          if (!(s >= margem) || !(t - rE >= MIN_CHEGADA)) { if (stub && degrau()) return; return; }
          /* o DEGRAU de 2 × 45° (revisão 08/11/2026, REAL-C): o vizinho corre paralelo à chegada, a menos de um raio do centro — o desvio de 45° direto
             cairia dentro da caixa. O vizinho faz um degrau de 45° (P → Q) até a reta que passa pelo centro e chega reto na boca (o toco vai de Q ao
             centro). Só na ENTRADA (o esgoto escoa para a peça), na mesma declividade do trecho; a cota do centro desce no máximo 3 cm */
          function degrau() {
            var i0d = (A.y - E.y) / Lh; if (!(i0d > 0)) return false;
            var wx2 = C.x - A0.x, wz2 = C.z - A0.z, al = wx2 * u1.x + wz2 * u1.z, px = wx2 - al * u1.x, pz = wz2 - al * u1.z, latD = Math.hypot(px, pz);
            if (!(latD > TOL) || latD >= rH) return false;
            var nx = px / latD, nz = pz / latD, Er = { x: C.x - u1.x * rE, z: C.z - u1.z * rE };
            var Q = { x: Er.x - u1.x * margem, z: Er.z - u1.z * margem }, P = { x: Q.x - u1.x * latD - nx * latD, z: Q.z - u1.z * latD - nz * latD };
            var sP = (P.x - A0.x) * u1.x + (P.z - A0.z) * u1.z; if (!(sP >= margem)) return false;
            var iD = Math.max(i0d, (A0.y - A.y) / L1), yP = A0.y + (A.y - A0.y) * Math.min(sP, L1) / L1 - (sP > L1 ? iD * (sP - L1) : 0);
            P.y = Math.floor(yP * 1e4 + 1e-6) / 1e4; Q.y = Math.floor((P.y - iD * d2(P, Q)) * 1e4 + 1e-6) / 1e4;   // hid:ok grade de 0,1 mm
            var yC = Math.floor((Q.y - iD * d2(Q, C)) * 1e4 + 1e-6) / 1e4;   // hid:ok grade de 0,1 mm
            if (yC < stub.c.y - 0.03) return false;   // hid:ok 3 cm: além disso a peça teria de descer
            P = { x: r4(P.x), y: P.y, z: r4(P.z) }; Q = { x: r4(Q.x), y: Q.y, z: r4(Q.z) };
            V[vL] = { x: P.x, y: P.y, z: P.z }; T[oL] = { x: P.x, y: P.y, z: P.z }; T[lado] = { x: Q.x, y: Q.y, z: Q.z };
            stub.S[stub.k] = { x: Q.x, y: Q.y, z: Q.z }; var kc = stub.k === "p1" ? "p2" : "p1"; stub.S[kc] = { x: stub.c.x, y: Math.min(stub.c.y, yC), z: stub.c.z };
            ajustes.push({ trecho: String(T.id), vizinho: String(V.id), peca: String(K.id), lateral: r4(lat), degrau: true });
            return true;
          }
          var An = { x: r4(A0.x + u1.x * s), z: r4(A0.z + u1.z * s) }, En = { x: r4(C.x - u.x * rE), z: r4(C.z - u.z * rE) };
          /* cotas: o canto novo na reta do vizinho (a mesma declividade dele); o trecho que chega não fica mais raso que antes */
          /* o arredondamento da cota (0,1 mm) vai sempre no sentido do escoamento: nunca tira declividade (revisão 08/11/2026: DN 40 a 2 % saía 1,9953 %) */
          var yAn = A0.y + (A.y - A0.y) * s / L1;
          An.y = A0.y >= A.y ? Math.floor(yAn * 1e4 + 1e-6) / 1e4 : Math.ceil(yAn * 1e4 - 1e-6) / 1e4;   // hid:ok grade de 0,1 mm
          var i0 = (A.y - E.y) / Lh, Ln = d2(An, En);
          En.y = Math.floor(Math.min(E.y, An.y - i0 * Ln) * 1e4 + 1e-6) / 1e4;   // hid:ok grade de 0,1 mm
          if (i0 < 0) { En.y = Math.ceil(Math.max(E.y, An.y - i0 * Ln) * 1e4 - 1e-6) / 1e4; }   /* saindo da peça (o esgoto escoa da peça para o canto): a ponta não desce */   // hid:ok grade de 0,1 mm
          if (Math.abs(En.y - E.y) > 0.03) return;   // hid:ok 3 cm: além disso a peça teria de descer — deixa para o auditor
          if (stub && (i0 >= 0 ? En.y < stub.c.y : En.y > stub.c.y)) return;   /* o toco até o centro continua no sentido do escoamento */
          ajustes.push({ trecho: String(T.id), vizinho: String(V.id), peca: String(K.id), lateral: r4(lat) });
          T[oL] = { x: An.x, y: An.y, z: An.z }; T[lado] = { x: En.x, y: En.y, z: En.z }; V[vL] = { x: An.x, y: An.y, z: An.z };
          if (levar) { var vistosL = []; levar.forEach(function (m) { var q = m.o[m.k]; if (vistosL.indexOf(q) >= 0) return; vistosL.push(q); m.o[m.k] = { x: r4(q.x + levar.v.x), y: q.y, z: r4(q.z + levar.v.z) }; }); }
          if (stub) tiraToco();
        });
      });
    });
    return { ops: ops, ajustes: ajustes, apagar: apagar };
  }

  /* fundirAlinhados(ops, luvas): "nenhuma conexão a mais" — a LUVA automática entre dois trechos ALINHADOS do mesmo DN e material (a
     rede do ambiente que encontra a rede externa no mesmo alinhamento) some: os dois viram UM trecho. luvas = as conexões "luva" da
     rede (BimInst.rede) sem peça forçada nem junta da ponta, com { ramos:[a, b], x, y, z }. Só funde o que é do plano (ops), na mesma
     ordem do escoamento (a.p2 = nó = b.p1) e sem nada que cite o trecho que some (acessório, continua no nó). Devolve os ids fundidos. */
  function fundirAlinhados(ops, luvas) {
    var feitos = [], donos = [];
    (function achar(L) { (L || []).forEach(function (o) { if (!o) return; if (o.op === "lote") achar(o.ops); else if (o.op === "trecho") donos.push({ op: o, lista: L }); }); })(ops);
    function de(id) { var l = donos.filter(function (d) { return String(d.op.id) === String(id); }); return l.length ? l[l.length - 1] : null; }   /* o último de cada id vale (o BimEdit aplica em ordem) */
    var citados = {};
    (function cit(L) { (L || []).forEach(function (o) { if (!o) return; if (o.op === "lote") cit(o.ops); else if (o.op !== "trecho" && o.trecho != null) citados[String(o.trecho)] = 1; }); })(ops);
    (luvas || []).forEach(function (c) {
      if (!c || c.tipo !== "luva" || c.juntaDe != null || c.forcada || !c.ramos || c.ramos.length !== 2) return;
      var A = de(c.ramos[0]), B = de(c.ramos[1]); if (!A || !B) return;
      var N = { x: num(c.x, 0), y: num(c.y, 0), z: num(c.z, 0) }, a = A.op, b = B.op;
      if (igual(a.p1, N) && igual(b.p2, N)) { var t = a; a = b; b = t; var T2 = A; A = B; B = T2; }   /* a chega no nó, b sai dele */
      if (!igual(a.p2, N) || !igual(b.p1, N) || a.material !== b.material || Math.abs(num(a.dn, 0) - num(b.dn, 0)) > 0.5 || a.sistema !== b.sistema) return;   // hid:ok meio milímetro de DN (o mesmo do BimInst)
      if (citados[String(a.id)] || a.pecaIni || a.pecaFim || b.pecaIni) return;
      /* revisão 08/11/2026: o trecho da REDE (rede-auto-*, refeito/apagado pelo "refazer a rede") nunca absorve o do ambiente — o refazer levaria o
         tubo do ambiente junto. A luva entre os dois fica */
      if ((a.rede != null) !== (b.rede != null) || (a.rede != null && String(a.rede) !== String(b.rede))) return;
      /* derivação no MEIO de um dos dois (a ponta de outro tubo ou uma conexão sobre ele, fora das pontas — o tê sem nó): só funde se ela continua
         sobre o tubo único (a mesma distância ao eixo, até 1 mm a mais); senão a derivação desligaria e a luva fica */
      var dEixo = function (q, P, Q) { var ax = Q.x - P.x, ay = Q.y - P.y, az = Q.z - P.z, L2 = ax * ax + ay * ay + az * az; if (!(L2 > 0)) return { s: -1, d: 1e9 }; var s2 = ((q.x - P.x) * ax + (q.y - P.y) * ay + (q.z - P.z) * az) / L2; return { s: s2, d: Math.hypot(P.x + ax * s2 - q.x, P.y + ay * s2 - q.y, P.z + az * s2 - q.z) }; };   // hid:ok sentinela
      var noMeio = function (q, t) { var r = dEixo(q, t.p1, t.p2); return r.s > 1e-3 && r.s < 1 - 1e-3 && r.d <= 0.02 ? r.d : -1; };   // hid:ok 2 cm (a tolerância do motor)
      var pts = []; donos.forEach(function (d) { var w = d.op; if (w !== a && w !== b) pts.push(w.p1, w.p2); });
      (luvas || []).forEach(function (k) { if (k && k !== c && k.tipo !== "luva") pts.push({ x: num(k.x, 1e9), y: num(k.y, 1e9), z: num(k.z, 1e9) }); });   // hid:ok sentinela de coordenada ausente
      var deriv = pts.some(function (q) { var d0 = Math.max(noMeio(q, a), noMeio(q, b)); if (d0 < 0) return false; var r = dEixo(q, a.p1, b.p2); return !(r.s > 0 && r.s < 1 && r.d <= Math.min(d0 + 0.001, 0.02)); });   // hid:ok 1 mm a mais, nunca além dos 2 cm do motor
      if (deriv) return;
      /* fica o trecho de JUSANTE (o da rede: os ids rede-auto-* seguem valendo) e ele começa onde o de montante começava. A ESPERA do ambiente no
         nó ("continua" p2 de a) é justamente o encontro com a rede: some junto com o nó; as das pontas que ficam seguem */
      var c1 = a.continua === "p1" || a.continua === "ambos", c2 = b.continua === "p2" || b.continua === "ambos";
      b.p1 = { x: a.p1.x, y: a.p1.y, z: a.p1.z };
      if (c1 && c2) b.continua = "ambos"; else if (c1) b.continua = "p1"; else if (c2) b.continua = "p2"; else delete b.continua;
      if (a.ap != null && b.ap == null) b.ap = a.ap;
      var i = A.lista.indexOf(a); if (i >= 0) A.lista.splice(i, 1);
      donos = donos.filter(function (d) { return d.op !== a; });
      feitos.push({ fica: String(b.id), saiu: String(a.id), x: N.x, y: N.y, z: N.z });
    });
    return feitos;
  }
  /* ==================================================================== FOLGAR (rodada 2, 07/11/2026)
   * O desvio curto do traçado que não comporta as peças (o joelho de 45° com a luva encavalado na peça seguinte, o toco de 3 cm entre o pé da
   * descida e o desvio, o tê do tubo de queda colado no desvio). Roda NO PLANO JÁ ESCOLHIDO (não muda qual estratégia vence) e mexe só na
   * geometria, com a MESMA régua do 3D e do auditor de encaixe (js/biminstgeo.js HidGeo.no: o tubo entre os fundos das bolsas comporta as duas):
   *   (a) CHANFRO: o desvio de 45° entre duas retas que se cruzam (o canto de 90° feito com 2 × 45°, ou a entrada a 45° na junção) cresce ou encolhe
   *       mantendo os 45° — as pontas andam sobre as retas vizinhas (a junção anda sobre o coletor);
   *   (b) COME A PERNA: o desvio começa direto no pé da descida (o joelho de 90° do pé aceita qualquer direção na horizontal) ou continua o desvio
   *       paralelo anterior (dois desvios de 45° seguidos viram um só);
   *   (c) DESLIZA: o desvio entre duas retas paralelas anda ao longo delas (uma perna cresce, a outra encolhe);
   *   (d) CANTO: sem chanfro que caiba, o canto de 90° feito com 2 × 45° vira UM joelho de 90° (nunca na entrada da junção: lá seria tê a 90°).
   * Cada tentativa é medida na vizinhança e só fica se tirar a sobreposição sem criar outra, sem tirar declividade do esgoto (a mínima do DN) e sem
   * mexer no que está no modelo (o.fixos, o.pontos). O que não tem solução fica — o auditor de encaixe 3D mostra.
   *   HidEncaixe.folgar(plano, { fixos, pontos, pecas, familias, avaliarFam, BimInst, HidGeo }) → { ajustes: [...], apagar: [ids] }
   * plano = as ops do plano (lista plana; os objetos são alterados no lugar). */
  var DECL_EPS = 1e-6;       // hid:ok só o ruído numérico: a declividade mínima do esgoto vale inteira (o dimensionamento não tem folga)
  var ACLIVE_VENT = 0.01;    // hid:ok aclive mínimo do horizontal da ventilação (NBR 8160, es8160.ventilacao_regras aclive_min_pct = 1 %)
  var FOLGA_TUBOS = 0.03;    // hid:ok 3 cm entre geratrizes de tubos que não se ligam (a folga de montagem do HidRota e do auditor)
  var FOLGA_BOLSA = 0.002;   // hid:ok 2 mm de bolsa (a mesma régua do auditor de encaixe 3D)
  var RAIO_VIZ = 1.2;        // hid:ok vizinhança medida em volta dos nós mexidos (m)
  var MIN_PERNA = 0.03;      // hid:ok reta que sobra numa perna: abaixo disto ela some (vira o próprio canto)
  var KS = [1.6, 1.4, 1.25, 1.12, 0.88, 0.75, 0.62, 0.5, 0.38];   // hid:ok fatores do chanfro tentados (escala do desvio)
  var TS = [0.04, 0.08, 0.12, 0.16, 0.24, -0.04, -0.08, -0.12, -0.16, -0.24];   // hid:ok passos do deslizamento (m)
  function sub3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function dh(a, b) { return Math.hypot(b.x - a.x, b.z - a.z); }
  function un2(a, b) { var L = dh(a, b) || 1; return { x: (b.x - a.x) / L, z: (b.z - a.z) / L }; }
  function cp(p) { return { x: p.x, y: p.y, z: p.z }; }
  function no3(a, b) { return Math.abs(a.x - b.x) <= TOL && Math.abs(a.z - b.z) <= TOL && Math.abs(a.y - b.y) <= TOL * 5; }   // hid:ok 5 mm na altura (arredondamento da cota)
  function horiz(t) { return Math.abs(t.p2.y - t.p1.y) < dh(t.p1, t.p2); }
  /* o y de um ponto (x,z) na reta 3D do trecho t (a declividade dele fica) */
  function yNa(t, q) { var L2 = Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.z - t.p1.z, 2); if (!(L2 > 0)) return t.p1.y; var s = ((q.x - t.p1.x) * (t.p2.x - t.p1.x) + (q.z - t.p1.z) * (t.p2.z - t.p1.z)) / L2; return t.p1.y + s * (t.p2.y - t.p1.y); }
  function cruza2(P, u, Q, v) { var det = u.x * v.z - u.z * v.x; if (Math.abs(det) < 1e-9) return null; var wx = Q.x - P.x, wz = Q.z - P.z, s = (wx * v.z - wz * v.x) / det; return { x: P.x + u.x * s, z: P.z + u.z * s }; }   // hid:ok tolerância numérica / de geometria

  /* a RÉGUA: o déficit de encaixe de cada trecho (m; > 0 = as peças se sobrepõem) — a mesma conta do auditor de encaixe 3D */
  function deficits(trs, ctx) {
    var BI = ctx.BimInst, HG = ctx.HidGeo, e = BI.novoEstado(), out = {};
    trs.forEach(function (t) { try { BI.aplicarOp(e, t); } catch (eA) {} });
    (ctx.pecas || []).forEach(function (k) { try { var o = {}; Object.keys(k).forEach(function (q) { o[q] = k[q]; }); o.op = "peca"; BI.aplicarOp(e, o); } catch (eP) {} });
    var est = { caixas: [], familias: ctx.familias || [], instalacoes: BI.fechar(e) }, R = null;
    try { R = BI.rede(est, ctx.avaliarFam); } catch (eR) { return null; }
    var porId = {}, rec = {}, fac = {}, nos = {}, ordem = [];
    R.trechos.forEach(function (t) { porId[t.id] = t; });
    R.conexoes.forEach(function (c) { var k = c.x + "," + c.y + "," + c.z + "|" + c.sistema; if (!nos[k]) { nos[k] = []; ordem.push(k); } nos[k].push(c); });
    ordem.forEach(function (k) {
      var r = null; try { r = HG.no(nos[k], porId, { tol: BI.TOL }); } catch (eN) { r = null; }
      if (!r) return;
      Object.keys(r.recuos).forEach(function (q) { rec[q] = Math.max(rec[q] || 0, r.recuos[q]); });
      Object.keys(r.faces || {}).forEach(function (q) { fac[q] = Math.max(fac[q] || 0, r.faces[q]); });
    });
    /* as peças redondas (caixa sifonada, ralo) e a caixa de inspeção: o tubo para no fundo da bolsa da boca (a mesma conta do js/biminstui.js) */
    var HCI = global.HidCI || (typeof require === "function" ? (function () { try { return require("./hidcigeo.js"); } catch (eH) { return null; } })() : null);
    R.pecas.forEach(function (k) {
      if (!/^(ralo_|caixa_sifonada|caixa_inspecao)/.test(k.peca)) return;
      var lig = R.ligacoes.filter(function (l) { return l.tipo === "peca" && l.alvo === k.id; }).map(function (l) {
        var t = porId[l.trecho]; if (!t) return null;
        var lado = Math.hypot(t.p1.x - l.x, t.p1.y - l.y, t.p1.z - l.z) <= Math.hypot(t.p2.x - l.x, t.p2.y - l.y, t.p2.z - l.z) ? 0 : 1, E = lado ? t.p2 : t.p1, F = lado ? t.p1 : t.p2;
        return { trecho: t.id, lado: lado, dn: t.dn, ponto: E, dir: [F.x - E.x, F.y - E.y, F.z - E.z], saida: F.y < E.y - 1e-4 && Math.abs(F.y - E.y) < Math.hypot(F.x - E.x, F.z - E.z) };   // hid:ok tolerância numérica / de geometria
      }).filter(Boolean);
      var g = null; try { g = k.peca === "caixa_inspecao" ? (HCI && HCI.geo ? HCI.geo(k, lig, {}) : null) : HG.peca(k, lig, {}); } catch (eG) { g = null; }
      if (!g) return;
      g.portas.forEach(function (pt) {
        var t = porId[pt.trecho]; if (!t) return;
        var E = pt.lado ? t.p2 : t.p1, F = pt.lado ? t.p1 : t.p2, u = [F.x - E.x, F.y - E.y, F.z - E.z], L = Math.hypot(u[0], u[1], u[2]); if (!(L > 0)) return;
        u = [u[0] / L, u[1] / L, u[2] / L];
        var kk = null;
        if (pt.raio != null) { var ex = E.x - pt.centro[0], ez = E.z - pt.centro[2], a = u[0] * u[0] + u[2] * u[2], b = ex * u[0] + ez * u[2], c = ex * ex + ez * ez - pt.raio * pt.raio; if (a > 1e-9 && b * b - a * c >= 0) kk = (-b + Math.sqrt(b * b - a * c)) / a; }   // hid:ok tolerância numérica / de geometria
        else if (pt.recuoAbs && Math.abs(u[1]) > 1e-6) kk = (pt.recuoAbs[1] - E.y) / u[1];   // hid:ok tolerância numérica / de geometria
        if (kk != null && kk > 0 && kk < L - 0.01) { var key = pt.trecho + ":" + pt.lado; rec[key] = Math.max(rec[key] || 0, kk); }   // hid:ok 1 cm
      });
    });
    var dir = {}; (R.juntas || []).forEach(function (j) { if (j.junta === "direta") dir[j.trecho + ":" + j.lado] = 1; });
    R.trechos.forEach(function (t) {
      var r0 = rec[t.id + ":0"], r1 = rec[t.id + ":1"]; if (!(r0 > 0) || !(r1 > 0)) return;
      var c = null; try { c = HG.cotasConexao(t.material, "luva", t.dn); } catch (eC) { c = null; } if (!c) return;
      var L = Math.hypot(t.p2.x - t.p1.x, t.p2.y - t.p1.y, t.p2.z - t.p1.z), pb = num(c.pb2 || c.pb, 0) / 1000, d;
      var dj = dir[t.id + ":0"] ? 0 : (dir[t.id + ":1"] ? 1 : -1);
      if (dj >= 0) { var kP = t.id + ":" + dj, rOut = dj ? r0 : r1, ponta = ((rec[kP] || 0) + (fac[kP] || rec[kP] || 0)) / 2, livre = L - ponta; d = Math.max(rOut - livre, livre - rOut - num(c.pb, 0) / 1000); }
      else d = 2 * pb - FOLGA_BOLSA - (L - r0 - r1);
      out[t.id] = d;
    });
    return out;
  }

  function folgar(plano, o) {
    o = o || {};
    var BI = o.BimInst || global.BimInst, HG = o.HidGeo || global.HidGeo;
    var res = { ajustes: [], apagar: [] };
    if (!BI || !HG || !HG.no || !BI.rede) return res;
    var ctx = { BimInst: BI, HidGeo: HG, pecas: o.pecas || [], familias: o.familias || [], avaliarFam: o.avaliarFam };
    var plan = ultimos(plano);
    var fixosT = (o.fixos || []).filter(function (x) { return x && x.op === "trecho" && x.p1 && x.p2; });
    var fixosP = (o.pontos || []).filter(function (q) { return q && isFinite(num(q.x, NaN)); }).map(function (q) { return { x: num(q.x, 0), y: num(q.y, 0), z: num(q.z, 0) }; });
    plano.forEach(function (x) { if (x && x.op !== "trecho" && isFinite(num(x.x, NaN)) && isFinite(num(x.y, NaN))) fixosP.push({ x: num(x.x, 0), y: num(x.y, 0), z: num(x.z, 0) }); });
    (ctx.pecas || []).forEach(function (k) { if (isFinite(num(k.x, NaN))) fixosP.push({ x: num(k.x, 0), y: num(k.y, 0), z: num(k.z, 0) }); });
    /* o RALO (sifonado ou seco) de onde o trecho SAI: o ralo não tem corpo que acompanhe a cota do tubo — a reta que sai dele pode encurtar/alongar
       (rodada 7: o ralo sifonado do box que vai direto ao ramal por junção de 45°) */
    function saiDeRalo(P) { return (ctx.pecas || []).some(function (k) { var h = k.hub; return /^ralo_/.test(String(k.peca)) && h && Math.hypot(P.x - h.x, P.z - h.z) <= num(h.r, 0) + 1e-4 && P.y <= num(h.yTop, 0) + 1e-4 && P.y >= num(h.yBot, 0) - 1e-4; }); }   // hid:ok tolerância numérica
    function naPeca(P) { return (ctx.pecas || []).some(function (k) { var h = k.hub; return h && Math.hypot(P.x - h.x, P.z - h.z) <= num(h.r, 0) + 1e-4 && P.y <= num(h.yTop, 0) + 1e-4 && P.y >= num(h.yBot, 0) - 1e-4; }); }   // hid:ok tolerância numérica / de geometria
    function vivos() { return plan.filter(function (t) { return res.apagar.indexOf(String(t.id)) < 0; }); }
    function todos() { return vivos().concat(fixosT); }
    /* o nó: os trechos do plano que terminam nele; "preso" = toca o modelo, um ponto de aparelho/peça, ou um tubo passa por dentro dele */
    function noDe(P) {
      var ts = [], lados = [];
      vivos().forEach(function (t) { if (no3(t.p1, P)) { ts.push(t); lados.push("p1"); } else if (no3(t.p2, P)) { ts.push(t); lados.push("p2"); } });
      var preso = fixosT.some(function (t) { return no3(t.p1, P) || no3(t.p2, P); }) || fixosP.some(function (q) { return Math.abs(q.x - P.x) <= 0.01 && Math.abs(q.z - P.z) <= 0.01 && Math.abs(q.y - P.y) <= 0.05; });   // hid:ok 1 cm / 5 cm (a TOLE do HidRota)
      var passante = todos().some(function (t) { if (no3(t.p1, P) || no3(t.p2, P)) return false; var L2 = Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.y - t.p1.y, 2) + Math.pow(t.p2.z - t.p1.z, 2); if (!(L2 > 0)) return false; var s = ((P.x - t.p1.x) * (t.p2.x - t.p1.x) + (P.y - t.p1.y) * (t.p2.y - t.p1.y) + (P.z - t.p1.z) * (t.p2.z - t.p1.z)) / L2; if (s <= 0.001 || s >= 0.999) return false; return Math.hypot(t.p1.x + s * (t.p2.x - t.p1.x) - P.x, t.p1.y + s * (t.p2.y - t.p1.y) - P.y, t.p1.z + s * (t.p2.z - t.p1.z) - P.z) <= 0.01; });   // hid:ok passante a 1 cm
      /* dentro da captura de uma peça (caixa sifonada, ralo, CI): é a peça — não anda */
      if (!preso) preso = naPeca(P);
      /* a ESPERA (ponta "continua": o encontro com a coluna, a rede ou o barrilete que vêm depois) é interface — não anda */
      if (!preso) preso = ts.some(function (t, i) { var c = t.continua; return c === "ambos" || c === lados[i]; });
      /* ponta de outro tubo a mais de 1 mm e a até a tolerância do motor (2 cm): o motor liga as duas no mesmo nó, mas mexer numa só desencontraria */
      if (!preso) { var tm = num(BI.TOL, 0.02); preso = todos().some(function (t) { return [t.p1, t.p2].some(function (q) { if (no3(q, P)) return false; var dd = Math.hypot(q.x - P.x, q.y - P.y, q.z - P.z); return dd <= tm + 1e-9; }); }); }   // hid:ok tolerância numérica / de geometria
      /* o nó no MEIO de outro tubo (o tê no tubo de queda, a junção sem nó): não anda na horizontal (sairia do tubo) — só na vertical dele (rebaixar) */
      return { ts: ts, lados: lados, preso: preso || passante, passante: passante, presoReal: preso };
    }
    /* a "corrediça" de uma ponta do trecho T em P: o nó anda sobre a reta do(s) outro(s) trecho(s) dele — 1 vizinho horizontal (o canto) ou 2 alinhados
       (o coletor da junção). Devolve { linha (trecho de referência), u (sentido que encurta T... o sentido de quem fica), junc, longe } ou null */
    function corredica(T, P) {
      var N = noDe(P); if (N.preso) return null;
      var outros = N.ts.filter(function (t) { return t !== T; });
      if (outros.length === 1) { var U = outros[0]; if (!horiz(U) || U.sistema !== T.sistema) return null; var far = no3(U.p1, P) ? U.p2 : U.p1;
        if (naPeca(far) && !(no3(U.p2, far) && (U.sistema === "esgoto" || U.sistema === "pluvial")) && !(no3(U.p1, far) && saiDeRalo(far))) return null;   /* a SAÍDA da caixa/ralo não mexe (o corpo da peça acompanha a cota dela); a entrada pode encurtar/alongar na mesma reta (continua apontando para o centro) */ return { ref: U, far: far, junc: false, trechos: [U], u: un2(P, far), L: dh(P, far) }; }
      if (outros.length === 2) {
        var a = outros[0], b = outros[1]; if (!horiz(a) || !horiz(b) || a.sistema !== T.sistema || b.sistema !== T.sistema) return null;
        var fa = no3(a.p1, P) ? a.p2 : a.p1, fb = no3(b.p1, P) ? b.p2 : b.p1, ua = un2(P, fa), ub = un2(P, fb);
        if (ua.x * ub.x + ua.z * ub.z > -0.999) return null;   // hid:ok os dois do coletor alinhados (cos −1)
        return { ref: a, far: fa, far2: fb, junc: true, trechos: [a, b], u: ua, L: dh(P, fa), L2: dh(P, fb) };
      }
      return null;
    }
    /* o nó anda sobre a corrediça sem passar do fim da reta vizinha (sobra perna); no coletor da junção, nem do fim do outro lado */
    function cabe(c, P, Q) { var pr = (Q.x - P.x) * c.u.x + (Q.z - P.z) * c.u.z; if (pr > 0) return pr < c.L - MIN_PERNA; if (pr < 0 && c.junc) return -pr < c.L2 - MIN_PERNA; return true; }
    /* move o nó P → Q (todas as pontas do plano que estavam em P) */
    function mover(P, Q, mud) { vivos().forEach(function (t) { ["p1", "p2"].forEach(function (k) { if (no3(t[k], P)) { mud.push({ t: t, k: k, v: cp(t[k]) }); t[k] = { x: r4(Q.x), y: r4(Q.y), z: r4(Q.z) }; } }); }); }
    function desfazer(mud, apag) { for (var i = mud.length - 1; i >= 0; i--) mud[i].t[mud[i].k] = mud[i].v; apag.forEach(function () { res.apagar.pop(); }); }
    /* a declividade do esgoto (p1 → p2 é o escoamento) não cai abaixo da mínima do DN nem da que já tinha; ventilação mantém o sentido */
    function declOk(ts, antes) {
      return ts.every(function (t, i) {
        if (res.apagar.indexOf(String(t.id)) >= 0) return true;
        var L = dh(t.p1, t.p2); if (Math.hypot(L, t.p1.y - t.p2.y) < MIN_PERNA / 2) return false; if (L < 1e-4) return true;   /* vertical: sem declividade a conferir */   // hid:ok tolerância numérica / de geometria
        var dy = t.p1.y - t.p2.y, a = antes[i];
        if (t.sistema === "esgoto" || t.sistema === "pluvial") { var im = BI.declMinDn ? BI.declMinDn(t.sistema, t.dn) / 100 : 0.01; var okD = dy / L >= Math.min(im, a) - DECL_EPS; return okD; }   // hid:ok % → fração
        if (t.sistema === "ventilacao") { if (a === 0) return true; if (dy * a < -1e-6) return false; return Math.abs(dy / L) >= Math.min(ACLIVE_VENT, Math.abs(a)) - DECL_EPS; }   /* o horizontal da ventilação mantém o aclive (NBR 8160: 1 %) */   // hid:ok tolerância numérica / de geometria
        return true;
      });
    }
    /* a entrada no TUBO DE QUEDA (o tê/junção no meio da vertical) desce junto: o ramal que ficou mais longo pede mais queda, e o ponto de entrada
       anda para baixo sobre a vertical (que continua passando por ele) — nunca o esgoto abaixo da mínima */
    function rebaixar(mud) {
      var vistos = [];
      mud.forEach(function (q) {
        var t = q.t, esg = t.sistema === "esgoto" || t.sistema === "pluvial"; if (vistos.indexOf(t) >= 0 || (!esg && t.sistema !== "ventilacao")) return; vistos.push(t);
        var L = dh(t.p1, t.p2); if (L < 1e-4 || !horiz(t)) return;   // hid:ok tolerância numérica / de geometria
        /* esgoto: falta queda — a ponta de jusante desce ou a de montante sobe; ventilação: falta aclive — a ponta mais baixa desce ou a mais alta sobe.
           A ponta anda na VERTICAL que passa por ela (o tubo de queda, a coluna) ou que termina nela (a descida, a subida) — nada mais pode estar ligado ali */
        var falta, ops2;
        if (esg) { falta = (BI.declMinDn ? BI.declMinDn(t.sistema, t.dn) / 100 : 0.01) * L - (t.p1.y - t.p2.y); ops2 = [["p2", -1], ["p1", 1]]; }   // hid:ok % → fração
        else { var alto = t.p2.y >= t.p1.y ? "p2" : "p1", baixo = alto === "p2" ? "p1" : "p2"; falta = ACLIVE_VENT * L - Math.abs(t.p2.y - t.p1.y); ops2 = [[baixo, -1], [alto, 1]]; }
        if (!(falta > 0)) return;
        ops2.some(function (o2) {
          var k = o2[0], sinal = o2[1], E = cp(t[k]), yn = E.y + sinal * (falta + 1e-4), info = noDe(E); if (info.presoReal) return false;   // hid:ok tolerância numérica / de geometria
          var outros = info.ts.filter(function (u) { return u !== t; });
          var okV = outros.length ? outros.every(function (u) { if (horiz(u)) return false; var far = no3(u.p1, E) ? u.p2 : u.p1; return Math.abs(far.y - yn) > MIN_PERNA * 2 && (far.y - E.y) * (far.y - yn) > 0; })
            : todos().some(function (u) { if (u === t || horiz(u)) return false; if (Math.hypot(u.p1.x - E.x, u.p1.z - E.z) > 0.01) return false; var y0 = Math.min(u.p1.y, u.p2.y), y1 = Math.max(u.p1.y, u.p2.y); return yn > y0 + 0.05 && yn < y1 - 0.05 && E.y > y0 && E.y < y1; });   // hid:ok 1 cm de prumo, 5 cm das pontas da vertical
          if (!okV) return false;
          mover(E, { x: E.x, y: r4(yn), z: E.z }, mud);
          return true;
        });
      });
    }
    /* as DERIVAÇÕES de T na geometria de antes: pontas de tubos NÃO mexidos que caem no meio dele */
    function derivacoes(T, A, B, mexidos) {
      var ax = B.x - A.x, ay = B.y - A.y, az = B.z - A.z, L2 = ax * ax + ay * ay + az * az, out = []; if (!(L2 > 0)) return out;
      fixosT.concat(vivos()).forEach(function (W) {
        if (W === T || mexidos.indexOf(W) >= 0) return;
        [W.p1, W.p2].forEach(function (q) {
          var t = ((q.x - A.x) * ax + (q.y - A.y) * ay + (q.z - A.z) * az) / L2; if (t <= 1e-3 || t >= 1 - 1e-3) return;   // hid:ok tolerância numérica / de geometria
          if (Math.hypot(A.x + ax * t - q.x, A.y + ay * t - q.y, A.z + az * t - q.z) <= 0.02) out.push({ q: q, dono: W, sistema: T.sistema });   // hid:ok 2 cm (a tolerância do motor)
        });
      });
      return out;
    }
    /* o ponto continua ligado na rede nova: no meio de um trecho vivo ou numa ponta dele */
    function naRede(q, dono, sistema) {
      return vivos().concat(fixosT).some(function (t) {
        if (t === dono || t.sistema !== sistema) return false;   /* o próprio tubo que deriva não conta: a derivação tem de continuar num tubo do sistema de T */
        if (no3(t.p1, q) || no3(t.p2, q)) return true;
        var ax = t.p2.x - t.p1.x, ay = t.p2.y - t.p1.y, az = t.p2.z - t.p1.z, L2 = ax * ax + ay * ay + az * az; if (!(L2 > 0)) return false;
        var s2 = ((q.x - t.p1.x) * ax + (q.y - t.p1.y) * ay + (q.z - t.p1.z) * az) / L2; if (s2 <= 1e-3 || s2 >= 1 - 1e-3) return false;   // hid:ok tolerância numérica / de geometria
        return Math.hypot(t.p1.x + ax * s2 - q.x, t.p1.y + ay * s2 - q.y, t.p1.z + az * s2 - q.z) <= 0.005;   // hid:ok 5 mm: a derivação continua no eixo
      });
    }
    /* a FOLGA entre tubos que não se ligam (3 cm entre geratrizes, a mesma do auditor): o que a tentativa mexeu não pode encostar mais do que antes */
    function distSeg(p1, q1, p2, q2) {
      function sb(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; } function dt(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
      var d1 = sb(q1, p1), d2 = sb(q2, p2), r = sb(p1, p2), a = dt(d1, d1), e = dt(d2, d2), f = dt(d2, r), sc, tc;
      if (a < 1e-12 && e < 1e-12) return Math.sqrt(dt(r, r));   // hid:ok tolerância numérica / de geometria
      if (a < 1e-12) { sc = 0; tc = Math.max(0, Math.min(1, f / e)); }   // hid:ok tolerância numérica / de geometria
      else { var c = dt(d1, r); if (e < 1e-12) { tc = 0; sc = Math.max(0, Math.min(1, -c / a)); } else { var b = dt(d1, d2), den = a * e - b * b; sc = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0; tc = (b * sc + f) / e; if (tc < 0) { tc = 0; sc = Math.max(0, Math.min(1, -c / a)); } else if (tc > 1) { tc = 1; sc = Math.max(0, Math.min(1, (b - c) / a)); } } }   // hid:ok tolerância numérica / de geometria
      var w = { x: p1.x + d1.x * sc - p2.x - d2.x * tc, y: p1.y + d1.y * sc - p2.y - d2.y * tc, z: p1.z + d1.z * sc - p2.z - d2.z * tc };
      return Math.sqrt(dt(w, w));
    }
    function colado(t, u, A, B) { if ([t.p1, t.p2].some(function (q) { return no3(q, u.p1) || no3(q, u.p2); })) return Infinity; return distSeg(A, B, u.p1, u.p2) - (num(t.dn, 0) + num(u.dn, 0)) / 2000; }   // hid:ok DN mm → raio m
    /* tocam-se: ponta com ponta, ou a ponta de um no meio do outro (a derivação) */
    function tocam(a, b) {
      function noMeio(q, t) { var ax = t.p2.x - t.p1.x, ay = t.p2.y - t.p1.y, az = t.p2.z - t.p1.z, L2 = ax * ax + ay * ay + az * az; if (!(L2 > 0)) return false; var s2 = ((q.x - t.p1.x) * ax + (q.y - t.p1.y) * ay + (q.z - t.p1.z) * az) / L2; if (s2 <= 0 || s2 >= 1) return false; return Math.hypot(t.p1.x + ax * s2 - q.x, t.p1.y + ay * s2 - q.y, t.p1.z + az * s2 - q.z) <= 0.02; }   // hid:ok 2 cm (a tolerância do motor)
      return [a.p1, a.p2].some(function (q) { return no3(q, b.p1) || no3(q, b.p2) || noMeio(q, b); }) || [b.p1, b.p2].some(function (q) { return noMeio(q, a); });
    }
    /* os vizinhos até 2 ligações (a mesma conexão / a derivação logo ao lado — o auditor também não cobra folga entre eles) */
    function perto2(t) { var l = todos(), v1 = l.filter(function (u) { return u !== t && tocam(t, u); }), v2 = []; v1.forEach(function (w) { l.forEach(function (u) { if (u !== t && v1.indexOf(u) < 0 && v2.indexOf(u) < 0 && tocam(w, u)) v2.push(u); }); }); return v1.concat(v2); }
    function encosta(velhos) {
      return velhos.some(function (o) {
        var t = o.t; if (res.apagar.indexOf(String(t.id)) >= 0) return false;
        var viz = perto2(t);
        return todos().some(function (u) {
          if (u === t || viz.indexOf(u) >= 0 || velhos.some(function (v) { return v.t === u; })) return false;
          var dn = colado(t, u, t.p1, t.p2); if (!(dn < FOLGA_TUBOS)) return false;
          return dn < colado(t, u, o.p1, o.p2) - 1e-4;   // hid:ok tolerância numérica / de geometria
        });
      });
    }
    /* as COTAS dos nós mexidos no esgoto: cada nó fica dentro da faixa que dá a declividade mínima aos trechos dele (o de montante chega descendo, o
       de jusante sai descendo), na grade de 0,1 mm da cota — o arredondamento nunca tira declividade. Sem faixa possível: a tentativa não vale */
    function ajustarCotas(mud) {
      var nos = []; mud.forEach(function (q) { var P = q.t[q.k]; if (!nos.some(function (n) { return Math.abs(n.x - P.x) <= TOL && Math.abs(n.z - P.z) <= TOL && Math.abs(n.y - P.y) <= 0.05; })) nos.push(cp(P)); });   // hid:ok 5 cm de cota no mesmo nó
      for (var it = 0; it < 4; it++) {   // hid:ok 4 passadas (os nós mexidos se influenciam)
        var mudou = false;
        for (var i = 0; i < nos.length; i++) {
          var N = nos[i], lo = -Infinity, hi = Infinity, ts = vivos().filter(function (t) { return (t.sistema === "esgoto" || t.sistema === "pluvial") && horiz(t) && (no3(t.p1, N) || no3(t.p2, N)); });
          if (!ts.length) continue;
          ts.forEach(function (t) { var im = BI.declMinDn ? BI.declMinDn(t.sistema, t.dn) / 100 : 0.01, L = dh(t.p1, t.p2); if (no3(t.p2, N)) hi = Math.min(hi, t.p1.y - im * L); else lo = Math.max(lo, t.p2.y + im * L); });   // hid:ok % → fração
          var y = Math.min(hi, Math.max(lo, N.y)), yg = Math.floor(y * 1e4 + 1e-9) / 1e4;   // hid:ok grade de 0,1 mm
          if (yg < lo - 1e-9) yg = Math.ceil(lo * 1e4 - 1e-9) / 1e4;   // hid:ok tolerância numérica / de geometria
          if (yg > hi + 1e-9 || yg < lo - 1e-9) return false;   // hid:ok tolerância numérica / de geometria
          if (Math.abs(yg - N.y) > 1e-9) { mover(N, { x: N.x, y: yg, z: N.z }, mud); N.y = yg; mudou = true; }   // hid:ok tolerância numérica / de geometria
        }
        if (!mudou) break;
      }
      return true;
    }
    function inclin(t) { var L = dh(t.p1, t.p2); return L > 0 ? (t.p1.y - t.p2.y) / L : 0; }
    /* mede a vizinhança dos nós */
    function medir(pts) {
      var perto = todos().filter(function (t) { return pts.some(function (P) { return dh(t.p1, P) <= RAIO_VIZ || dh(t.p2, P) <= RAIO_VIZ; }); });
      var d = deficits(perto, ctx); if (!d) return null;
      var alvo = {}; perto.forEach(function (t) { if (pts.some(function (P) { return dh(t.p1, P) <= RAIO_VIZ / 2 || dh(t.p2, P) <= RAIO_VIZ / 2; })) alvo[t.id] = 1; });
      var ruins = 0, soma = 0; Object.keys(d).forEach(function (id) { if (!alvo[id]) return; if (d[id] > 0) { ruins++; soma += d[id]; } });
      return { ruins: ruins, soma: soma };
    }
    /* as tentativas para o trecho de desvio D (o que tem as duas corrediças) */
    /* RECUA A JUNÇÃO de montante: a reta U (cQ.ref) que chega no desvio nasce numa junção do coletor (3 trechos, 2 alinhados); a junção anda s para
       montante sobre o coletor e o ramal dela acompanha mantendo o rumo (a ponta de lá anda sobre a reta vizinha dela) — a reta U cresce s */
    function recuarJuncao(cQ, Q, s, mud) {
      var F = cp(cQ.far), info = noDe(F); if (info.preso || info.ts.length !== 3) return false;   // hid:ok tolerância numérica / de geometria
      var w = un2(Q, F), outros = info.ts.filter(function (t) { return t !== cQ.ref; });
      var main2 = outros.filter(function (t) { var g = no3(t.p1, F) ? t.p2 : t.p1, u = un2(F, g); return Math.abs(u.x * w.x + u.z * w.z - 1) < 1e-3; })[0];   // hid:ok alinhado com U (cos 1)
      var br = outros.filter(function (t) { return t !== main2; })[0]; if (!main2 || !br || !horiz(main2) || !horiz(br)) return false;
      var g2 = no3(main2.p1, F) ? main2.p2 : main2.p1; if (dh(F, g2) - s < MIN_PERNA * 3) return false;   // hid:ok tolerância numérica / de geometria
      var Bs = cp(no3(br.p1, F) ? br.p2 : br.p1), cBr = corredica(br, Bs); if (!cBr || cBr.junc) return false;
      var Fn = { x: F.x + w.x * s, z: F.z + w.z * s }; Fn.y = yNa(main2, Fn);
      var uBr = un2(F, Bs), Bn = cruza2(Fn, uBr, Bs, cBr.u); if (!Bn || !cabe(cBr, Bs, Bn)) return false;
      Bn.y = yNa(cBr.ref, Bn);
      mover(Bs, Bn, mud); mover(F, Fn, mud); return true;
    }
    function tentativas(D) {
      var out = [], A = cp(D.p1), B = cp(D.p2), cA = corredica(D, A), cB = corredica(D, B);
      if (!horiz(D)) return out;
      var fluxo = D.sistema === "esgoto" || D.sistema === "pluvial";
      /* as cotas: no esgoto o nó de MONTANTE fica na reta do vizinho dele e o de jusante desce na declividade do desvio (a do DN, no mínimo) —
         assim a queda que o desvio levava não some quando ele encurta; na ventilação/água cada nó fica na reta do seu vizinho */
      var iD = Math.max(inclin(D), fluxo && BI.declMinDn ? BI.declMinDn(D.sistema, D.dn) / 100 : 0), montA = no3(D.p1, A);   // hid:ok % → fração
      function cotas(Pa, Pb, refA, refB) {
        if (!fluxo) { Pa.y = yNa(refA, Pa); Pb.y = yNa(refB, Pb); return; }
        var L = dh(Pa, Pb);
        if (montA) { Pa.y = yNa(refA, Pa); Pb.y = Pa.y - iD * L; } else { Pb.y = yNa(refB, Pb); Pa.y = Pb.y - iD * L; }
      }
      /* (b) COME A PERNA: a perna de uma ponta some e o desvio sai direto do nó de lá — se lá só chegam verticais (o pé da descida) ou o desvio paralelo anterior */
      [[A, cA, "p1"], [B, cB, "p2"]].forEach(function (pp) {
        var P = pp[0], c = pp[1]; if (!c || c.junc) return;
        var Nf = noDe(c.far); if (Nf.preso && !Nf.ts.length) return;
        var outrosF = Nf.ts.filter(function (t) { return t !== c.ref; });
        var uD = un2(pp[2] === "p1" ? B : A, P);   /* do outro lado do desvio para esta ponta */
        /* (a) ENTRADA DIRETA NO TUBO DE QUEDA: o fim da perna é o tê no meio da vertical (só ela chega ali) — o desvio de 45° segue reto até o eixo
           do tubo de queda e a perna some (uma mudança de direção a menos; o tê na vertical aceita o ramal em qualquer rumo) */
        var noTQ = fluxo && !outrosF.length && Nf.passante && !Nf.presoReal;
        var ok = noTQ || outrosF.length >= 1 && outrosF.every(function (t) { if (!horiz(t)) return true; var g = no3(t.p1, c.far) ? t.p2 : t.p1, w = un2(c.far, g); var cw = w.x * uD.x + w.z * uD.z; return Math.abs(cw + 1) < 1e-3 || Math.abs(cw - 1) < 1e-3 || (D.sistema !== "agua_fria" && D.sistema !== "agua_quente" && Math.abs(Math.abs(cw) - Math.SQRT1_2) < 1e-3); });   // hid:ok o desvio paralelo continua na mesma reta, ou o canto de 90° vira um de 45° (o desvio sai direto da reta de antes)
        if (!ok) return;
        /* a outra ponta anda sobre a corrediça dela para o desvio manter a direção e chegar em c.far */
        var Q = pp[2] === "p1" ? B : A, cQ = pp[2] === "p1" ? cB : cA; if (!cQ) return;
        var uDir = un2(Q, P), X = cruza2(c.far, uDir, Q, cQ.u); if (!X) return;
        (noTQ ? [0, 0.1, 0.15, 0.2, 0.25, 0.3] : [0]).forEach(function (sJ) {   // hid:ok recuo da junção de montante (m) quando a reta dela fica curta
          out.push({ nome: (noTQ ? "entrada direta no tubo de queda" + (sJ ? " (junção recuada " + Math.round(sJ * 100) + " cm)" : "") : "come a perna") + " — sai " + c.ref.id, fazer: function (mud) {
            var Xq = { x: X.x, z: X.z }, Lq = dh(c.far, Xq), montP = (pp[2] === "p1") === montA;   /* o nó de lá não anda: a cota dele manda */
            Xq.y = fluxo ? (montP ? c.far.y - iD * Lq : c.far.y + iD * Lq) : yNa(cQ.ref, Xq);
            if (sJ && !recuarJuncao(cQ, Q, sJ, mud)) return null;
            mover(Q, Xq, mud); var ref = c.ref; mover(P, cp(c.far), mud); res.apagar.push(String(ref.id)); return [ref];
          } });
        });
      });
      if (!cA || !cB) return out;
      var paralelas = Math.abs(cA.u.x * cB.u.z - cA.u.z * cB.u.x) < 1e-3;   // hid:ok retas paralelas (seno ~ 0)
      if (paralelas) {
        /* (c) DESLIZA ao longo das retas paralelas (a junção desliza sobre o coletor) */
        TS.forEach(function (s) {
          out.push({ nome: "desliza " + Math.round(s * 100) + " cm", fazer: function (mud) {
            var w = cA.u, Pa = { x: A.x + w.x * s, z: A.z + w.z * s }, Pb = { x: B.x + w.x * s, z: B.z + w.z * s };
            if (!cabe(cA, A, Pa) || !cabe(cB, B, Pb)) return null;
            cotas(Pa, Pb, cA.ref, cB.ref); mover(A, Pa, mud); mover(B, Pb, mud); return [];
          } });
        });
        return out;
      }
      /* (a) CHANFRO: o canto virtual C (as duas retas se cruzam), a e b = as distâncias de C às pontas; escala k mantém a direção do desvio */
      var C = cruza2(A, cA.u, B, cB.u); if (!C) return out;
      var a = dh(C, A), b = dh(C, B), ua = un2(C, A), ub = un2(C, B);
      if (!(a > 1e-4) || !(b > 1e-4)) return out;   // hid:ok tolerância numérica / de geometria
      KS.forEach(function (k) {
        out.push({ nome: "chanfro × " + k, fazer: function (mud) {
          var Pa = { x: C.x + ua.x * a * k, z: C.z + ua.z * a * k }, Pb = { x: C.x + ub.x * b * k, z: C.z + ub.z * b * k };
          /* não passa do fim da reta vizinha (sobra perna) — na junção, o nó anda sobre o coletor */
          if (!cabe(cA, A, Pa) || !cabe(cB, B, Pb)) return null;
          cotas(Pa, Pb, cA.ref, cB.ref); mover(A, Pa, mud); mover(B, Pb, mud); return [];
        } });
      });
      /* (d) CANTO de 90° — nunca na junção (seria tê a 90° no horizontal) e NUNCA no esgoto/pluvial horizontal (NBR 8160: mudança de direção no
         horizontal com ângulo central até 45° — rodada 3, 07/11/2026); vale para a ventilação e a água */
      if (!cA.junc && !cB.junc && !fluxo) {
        var ang = Math.abs(ua.x * ub.x + ua.z * ub.z);
        if (ang < 0.05) out.push({ nome: "canto de 90° (sem o desvio)", fazer: function (mud) {   // hid:ok retas perpendiculares (cos ~ 0)
          var Cq = { x: C.x, z: C.z }; Cq.y = fluxo ? (no3(D.p1, A) ? yNa(cA.ref, Cq) : yNa(cB.ref, Cq)) : yNa(cA.ref, Cq);
          mover(A, Cq, mud); mover(B, Cq, mud); res.apagar.push(String(D.id)); return [D];
        } });
      }
      return out;
    }
    /* (e) EMPURRA: a reta curta X cresce empurrando um lado dela ao longo dela mesma — o que está desse lado anda junto (inteiro) até as retas
       paralelas a X, que esticam ou encolhem (a subida da ventilação entre o tê do ramal e o joelho: o horizontal de cima sobe e a coluna dele
       encurta; o toco entre duas prumadas: uma prumada anda). Na vertical só a ventilação (o esgoto e a água não mudam de cota assim) */
    function empurrar(X, def) {
      var out = [];
      if (!(def > 0)) return out;
      var L3 = Math.hypot(X.p2.x - X.p1.x, X.p2.y - X.p1.y, X.p2.z - X.p1.z); if (!(L3 > 1e-4)) return out;   // hid:ok tolerância numérica / de geometria
      var vert = !horiz(X); if (vert && X.sistema !== "ventilacao") return out;
      /* (f) VENTILAÇÃO NA COLUNA A 45°: o horizontal curto entre a subida e a coluna (o tê no meio dela) vira a junção a 45° — a ponta na coluna sobe
         o comprimento do trecho (NBR 8160: a ligação na coluna de ventilação é por junção a 45°) */
      if (!vert && X.sistema === "ventilacao") ["p1", "p2"].forEach(function (k) {
        var E = cp(X[k]), O = X[k === "p1" ? "p2" : "p1"], info = noDe(E); if (!info.passante || info.presoReal || info.ts.length !== 1) return;
        var Lh = dh(E, O), yn = O.y + Lh;   /* 45°: sobe o mesmo que anda (a partir da outra ponta) */
        var col = todos().filter(function (u) { if (u === X || horiz(u)) return false; if (Math.hypot(u.p1.x - E.x, u.p1.z - E.z) > 0.01) return false; var y0 = Math.min(u.p1.y, u.p2.y), y1 = Math.max(u.p1.y, u.p2.y); return E.y > y0 && E.y < y1 && yn < y1 - 0.05; })[0];   // hid:ok 1 cm de prumo, 5 cm do topo da coluna
        if (!col || yn <= E.y + 1e-3) return;   // hid:ok tolerância numérica / de geometria
        out.push({ nome: "ventilação na coluna a 45°", fazer: function (mud) { mover(E, { x: E.x, y: r4(yn), z: E.z }, mud); return []; } });
      });
      [["p2", "p1"], ["p1", "p2"]].forEach(function (lp) {
        var N = cp(X[lp[0]]), O = X[lp[1]], v = vert ? { x: 0, y: N.y > O.y ? 1 : -1, z: 0 } : (function () { var u = un2(O, N); return { x: u.x, y: 0, z: u.z }; })();
        [def + 0.004, def + 0.015, def + 0.03].forEach(function (dl) {   // hid:ok o que falta + 4 mm / 1,5 cm / 3 cm de corte
          if (dl > 0.08) return;   // hid:ok até 8 cm de empurrão (mais que isso é outro traçado)
          out.push({ nome: "empurra " + lp[0] + " " + Math.round(dl * 1000) + " mm", fazer: function (mud) {
            var nos = [N], vistos = [N], tr = [X], ok = true;
            while (nos.length && ok) {
              var P = nos.shift(), info = noDe(P); if (info.preso || fixosT.some(function (t) { return no3(t.p1, P) || no3(t.p2, P); })) { ok = false; break; }
              info.ts.forEach(function (t) {
                if (!ok || tr.indexOf(t) >= 0) return; tr.push(t);
                var far = no3(t.p1, P) ? t.p2 : t.p1, Lt = Math.hypot(far.x - P.x, far.y - P.y, far.z - P.z); if (!(Lt > 1e-4)) { ok = false; return; }   // hid:ok tolerância numérica / de geometria
                var c = ((far.x - P.x) * v.x + (far.y - P.y) * v.y + (far.z - P.z) * v.z) / Lt;
                if (Math.abs(c) > 0.999) { if (c > 0 && Lt - dl < MIN_PERNA * 2) ok = false; return; }   /* paralela: estica/encolhe (a ponta de lá fica) */   // hid:ok tolerância numérica / de geometria
                if (!vistos.some(function (q) { return no3(q, far); })) { vistos.push(cp(far)); nos.push(cp(far)); }
                if (vistos.length > 10) ok = false;   // hid:ok o empurrão não arrasta mais que 10 nós
              });
            }
            if (!ok) return null;
            vistos.forEach(function (P) { mover(P, { x: P.x + v.x * dl, y: P.y + v.y * dl, z: P.z + v.z * dl }, mud); });
            return [];
          } });
        });
      });
      return out;
    }
    /* (g) CANTO DE 90° NO HORIZONTAL DO ESGOTO (NBR 8160: até 45° no horizontal) — o traçado que chega aqui com o canto reto (a saída da caixa de
       gordura posta pelo usuário, o ramal até a caixa de inspeção) vira 2 × 45°: as duas retas encurtam d e um desvio de 45° as liga */
    res.novos = []; res.pendentes = [];
    function pend90(U, V, N, porque) {
      res.pendentes.push({ trecho: String(U.id), outro: V ? String(V.id) : null, sistema: U.sistema, dn: U.dn, x: N.x, y: N.y, z: N.z,
        texto: "Canto de 90° no horizontal do " + (U.sistema === "pluvial" ? "pluvial" : "esgoto") + " entre " + U.id + (V ? " e " + V.id : "") + " (DN " + U.dn + "): " + porque +
          ". A NBR 8160 pede peças de até 45° no horizontal — refaça o canto com 2 × 45° (afaste a peça/o tubo de queda ou alongue as retas) e trace de novo" });
    }
    var vistos90 = {};
    vivos().forEach(function (U) {
      if ((U.sistema !== "esgoto" && U.sistema !== "pluvial") || !horiz(U) || res.apagar.indexOf(String(U.id)) >= 0 || U.rede != null) return;   /* a rede externa faz o dela (js/hidrede.js chanfroEspera: o "refazer a rede" refaz igual); o auditor confere */
      [U.p1, U.p2].forEach(function (Np) {
        var N = cp(Np), k90 = Math.round(N.x * 1e4) + "," + Math.round(N.z * 1e4) + "," + Math.round(N.y * 1e3);   // hid:ok chave do nó (0,1 mm)
        if (vistos90[k90]) return;
        var info = noDe(N), hs = info.ts.filter(function (t) { return t.sistema === U.sistema && horiz(t); });
        if (hs.length !== 2 || info.ts.length !== 2) return;
        var A = hs[0], B = hs[1], fa = no3(A.p1, N) ? A.p2 : A.p1, fb = no3(B.p1, N) ? B.p2 : B.p1, ua = un2(N, fa), ub = un2(N, fb);
        if (Math.abs(ua.x * ub.x + ua.z * ub.z) > 0.05) return;   // hid:ok só o canto reto (cos ~ 0)
        vistos90[k90] = 1;
        if (info.passante || naPeca(N)) return;   /* no meio de outro tubo (é tê/junção, o auditor cobra) ou dentro da caixa/ralo (a peça é a ligação, não há joelho) */
        /* quem chega (p2 no nó) e quem sai (p1 no nó): o escoamento p1 → p2 */
        var Uc = no3(A.p2, N) ? A : (no3(B.p2, N) ? B : null), Vs = no3(A.p1, N) ? A : (no3(B.p1, N) ? B : null);
        if (!Uc || !Vs || Uc === Vs) { pend90(A, B, N, "os dois trechos estão no mesmo sentido (um deles desenhado contra o escoamento)"); return; }
        if (Uc.rede != null || Vs.rede != null) return;
        if (info.preso) { pend90(Uc, Vs, N, "o canto encosta numa peça, num ponto de aparelho ou numa espera e não pode virar desvio aqui"); return; }
        if (Math.abs(num(Uc.dn, 0) - num(Vs.dn, 0)) > 0.5) { pend90(Uc, Vs, N, "o diâmetro muda no canto (DN " + Uc.dn + " → " + Vs.dn + ")"); return; }   // hid:ok meio milímetro de DN
        var dn = num(Uc.dn, 0), need = 0, mat = Uc.material || "pvc_esgoto";
        try { need = (HG.faceProduto(mat, "joelho45", dn, "luva", 45) || 0) + (HG.faceProduto(mat, "joelho45", dn, "bolsa", 45) || 0) + 0.005; } catch (eN) { need = 0; }   // hid:ok 5 mm de corte
        var u1 = un2(Uc.p1, N), u2 = un2(N, Vs.p2), L1 = dh(Uc.p1, N), L2 = dh(N, Vs.p2), d = Math.min(0.15, L1 - 0.1, L2 - 0.1);   // hid:ok perna do desvio (a do HidRota) e 10 cm de reta que sobra
        if (!(d > 0) || d * Math.SQRT2 < need) { pend90(Uc, Vs, N, "as retas do canto são curtas para o desvio de 45° (" + Math.round(L1 * 100) + " e " + Math.round(L2 * 100) + " cm)"); return; }
        /* derivação no pedaço que sai (os últimos d + 5 cm de cada reta, como o chanfroEspera da rede): o desvio a desligaria */
        var noPedaco = function (T, A0, uu, q) { var s2 = (q.x - A0.x) * uu.x + (q.z - A0.z) * uu.z, Lt = dh(T.p1, T.p2); return s2 > -1e-3 && s2 < d + 0.05 && Math.abs((q.x - A0.x) * uu.z - (q.z - A0.z) * uu.x) < 0.05 && Math.abs(q.y - N.y) < 0.15 && Lt > 0; };   // hid:ok 5 cm de folga / 15 cm de altura
        var deriva = todos().some(function (W) { if (W === Uc || W === Vs) return false; return [W.p1, W.p2].some(function (q) { if (no3(q, N)) return false; return noPedaco(Uc, N, { x: -u1.x, z: -u1.z }, q) || noPedaco(Vs, N, u2, q); }); });
        if (deriva) { pend90(Uc, Vs, N, "há uma derivação perto do canto (a menos de " + Math.round((d + 0.05) * 100) + " cm) que o desvio desligaria"); return; }   // hid:ok 5 cm de folga (texto)
        var im = BI.declMinDn ? BI.declMinDn(Uc.sistema, dn) / 100 : 0.01;   // hid:ok % → fração
        var P = { x: r4(N.x - u1.x * d), z: r4(N.z - u1.z * d) }; P.y = Math.floor(yNa(Uc, P) * 1e4) / 1e4;   // hid:ok grade de 0,1 mm
        var Q = { x: r4(N.x + u2.x * d), z: r4(N.z + u2.z * d) }; Q.y = Math.floor((P.y - im * d * Math.SQRT2) * 1e4) / 1e4;   // hid:ok grade de 0,1 mm
        var nv = {}; Object.keys(Uc).forEach(function (kk) { if (kk !== "continua" && kk !== "id" && kk !== "p1" && kk !== "p2") nv[kk] = Uc[kk]; });
        nv.op = "trecho"; nv.id = String(Uc.id) + "-45"; nv.p1 = cp(P); nv.p2 = cp(Q);
        var velhos = [{ t: Uc, p1: cp(Uc.p1), p2: cp(Uc.p2) }, { t: Vs, p1: cp(Vs.p1), p2: cp(Vs.p2) }], incl = [inclin(Uc), inclin(Vs)];
        Uc.p2 = cp(P); Vs.p1 = cp(Q); plan.push(nv);
        /* as mesmas conferências do resto: declividade (U, V e o desvio) e a folga entre tubos */
        var ok = declOk([Uc, Vs, nv], incl.concat([im])) && !encosta(velhos.concat([{ t: nv, p1: cp(N), p2: cp(N) }]));
        if (!ok) { Uc.p2 = velhos[0].p2; Vs.p1 = velhos[1].p1; plan.pop(); pend90(Uc, Vs, N, "o desvio de 45° tiraria declividade do esgoto ou encostaria noutro tubo"); return; }
        res.novos.push(nv);
        res.ajustes.push({ trecho: String(Uc.id), desvio: nv.id, como: "canto de 90° no horizontal → 2 × 45°", apagados: [] });
      });
    });
    var rodada = 0, feitos = {};
    while (rodada++ < 4) {   // hid:ok rodadas de folga (cada uma mede tudo de novo)
      var d0 = deficits(todos(), ctx); if (!d0) break;
      var ruins = vivos().filter(function (t) { return d0[t.id] > 0 && !feitos[t.id + "#" + rodada]; });
      if (!ruins.length) break;
      var mexeu = false;
      ruins.forEach(function (X) {
        if (res.apagar.indexOf(String(X.id)) >= 0) return;
        var dAt = deficits(todos(), ctx); if (!dAt || !(dAt[X.id] > 0)) return;
        /* o desvio a mexer: o próprio X, ou o vizinho dele que é desvio (tem as duas corrediças) */
        /* até 2 trechos de distância: o desvio que resolve pode estar do outro lado da reta curta (os dois desvios seguidos) */
        var cands = [X];
        for (var anel = 0; anel < 2; anel++) cands.slice().forEach(function (Y) { [Y.p1, Y.p2].forEach(function (P) { noDe(P).ts.forEach(function (t) { if (cands.indexOf(t) < 0) cands.push(t); }); }); });   // hid:ok 2 anéis
        var melhor = null, pts0 = [cp(X.p1), cp(X.p2)], m0 = medir(pts0); if (!m0) return;
        var lista = [{ D: X, tl: empurrar(X, dAt[X.id]) }].concat(cands.map(function (D) { return { D: D, tl: tentativas(D) }; }));
        lista.forEach(function (it) {
          var D = it.D, tl = it.tl;
          tl.forEach(function (tt) {
            var mud = [], nAp = res.apagar.length, antesT = todos().map(function (t) { return t; }), incl = antesT.map(inclin);
            var r = null; try { r = tt.fazer(mud); if (r) { rebaixar(mud); if (!ajustarCotas(mud)) r = null; } } catch (eF) { r = null; }
            var apag = res.apagar.slice(nAp);
            /* um tubo que DERIVA no meio de um trecho mexido (a ventilação que nasce no ramal, a junção sem nó): a reta dele mudaria e a derivação
               ficaria solta — não vale (a revisão da CASA pegou a ventilação solta do esgoto) */
            if (r) {
              var mexidos = []; mud.forEach(function (q) { if (mexidos.indexOf(q.t) < 0) mexidos.push(q.t); }); plan.forEach(function (t) { if (apag.indexOf(String(t.id)) >= 0 && mexidos.indexOf(t) < 0) mexidos.push(t); });
              var velhos = mexidos.map(function (t) { var o = { t: t, p1: cp(t.p1), p2: cp(t.p2) }; for (var qi = mud.length - 1; qi >= 0; qi--) if (mud[qi].t === t) o[mud[qi].k] = cp(mud[qi].v); return o; });
              var dvs = []; velhos.forEach(function (o) { derivacoes(o.t, o.p1, o.p2, mexidos).forEach(function (q) { dvs.push(q); }); });
              if (dvs.some(function (d) { return !naRede(d.q, d.dono, d.sistema); }) || encosta(velhos)) r = null;
            }
            if (r) {
              var m = declOk(antesT, incl) ? medir(pts0) : null;
              /* empate: a que TIRA peças ganha ("nenhuma conexão a mais"), depois a de menor sobreposição */
              if (m && (m.ruins < m0.ruins || (m.ruins === m0.ruins && m.soma < m0.soma - 1e-4)) && (!melhor || m.ruins < melhor.m.ruins || (m.ruins === melhor.m.ruins && (apag.length > melhor.apag.length || (apag.length === melhor.apag.length && m.soma < melhor.m.soma))))) melhor = { tt: tt, D: D, m: m, mud: mud.map(function (q) { return { t: q.t, k: q.k, v: q.v, novo: cp(q.t[q.k]) }; }), apag: apag.slice() };   // hid:ok tolerância numérica / de geometria
            }
            desfazer(mud, apag);
          });
        });
        if (!melhor) { feitos[X.id + "#" + rodada] = 1; return; }
        melhor.mud.forEach(function (q) { q.t[q.k] = q.novo; }); melhor.apag.forEach(function (id) { res.apagar.push(id); });
        res.ajustes.push({ trecho: String(X.id), desvio: String(melhor.D.id), como: melhor.tt.nome, apagados: melhor.apag.slice() });
        mexeu = true;
      });
      if (!mexeu) break;
    }
    /* (c) o que NÃO coube fica declarado (pendência com Corrigir/Mostrar no 3D) — nunca escondido nem resolvido com 90° no horizontal */
    var dF = deficits(todos(), ctx);
    if (dF) vivos().forEach(function (t) { if (dF[t.id] > 0) res.pendentes.push({ trecho: String(t.id), mm: Math.round(dF[t.id] * 1000), sistema: t.sistema, dn: t.dn }); });
    return res;
  }

  var HidEncaixe = { VERSAO: 1, radial: radial, fundirAlinhados: fundirAlinhados, folgar: folgar, deficits: deficits, TOL: TOL, MARGEM: MARGEM };
  global.HidEncaixe = HidEncaixe;
  if (typeof module !== "undefined" && module.exports) module.exports = HidEncaixe;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

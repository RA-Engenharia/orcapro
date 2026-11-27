/* =====================================================================
 * hidmao.js — O MOTOR DO DESENHO À MÃO do hidrossanitário (26/11/2026). Motor PURO, ES5, Node-testável. Global: HidMao.
 * A fiação é a ferramenta Tubo (js/biminstui.js clique / tentarLigacao).
 *
 * POR QUE. Pedido do Rogério (26/11/2026, antes de fechar o hidro de um projeto à mão): "clicar numa peça e na outra e já funcionar certinho:
 * descer pela parede, seguir certinho, nada bugado, tudo conectado; se eu continuar à mão, ele identificar a peça e encaixar certinho nela,
 * pegar a linha onde eu cliquei e seguir com a inclinação que precisa". A bancada tools/hid-bancada-mao.js repetiu esses cliques no banheiro
 * do kit e achou, no master 1.2.448:
 *   1. ÁGUA ponto ↔ tubo pelo Ligar A → B: "sem caminho livre (parede 1,20 m)" — o motor do traçado automático procura a faixa do ramal da
 *      parede e o próprio ramal clicado a ocupa. A volta ponto a ponto deixava toco + sobe 2 cm + desce 2 cm + toco (CRUZETA) no ponto.
 *   2. ÁGUA ponto → ponto (lavatório → chuveiro): "tubo atravessando louça × chu" — a família de DESTINO bloqueava a própria chegada.
 *   3. DEGRAU DE 2 CM: a altura de trabalho da água (0,60 m) contra o ponto do lavatório (0,58 m) punha dois joelhos a 2 cm um do outro.
 *   4. ESGOTO à mão terminando na caixa sifonada: o traço chegava a −0,056 m e subia para −0,022 m (o topo da entrada), CONTRA o escoamento —
 *      embora a entrada possa ficar mais baixa no corpo (até o fecho hídrico), como o Ligar A → B já fazia.
 *   5. O DN do traço à mão era o da ferramenta (esgoto DN 100 saindo do lavatório).
 * Este motor resolve 1, 2 e 3 (rota direta por dentro da parede, que é como se executa) e dá à tela as contas de 3, 4 e 5.
 *
 *   ligarParede(estado, famAval, A, B, o)   rota direta, ÁGUA: ponto de parede ↔ tubo deitado (tê), ↔ coluna (tê), ↔ outro ponto (mesma parede
 *                                           ou parede do canto). → { ok, ops, comprimento, nome, avisos } | { ok:false, erro }
 *   nivelPonto(yTrab, yPonto)               a altura que o traço da ÁGUA adota saindo/chegando num ponto: o do ponto, se a diferença for menor que
 *                                           LIMIAR_DEGRAU (um degrau tão curto não comporta dois joelhos); senão a de trabalho.
 *   renivelar(trechos, dy, fixos, o)        sobe/desce o traço inteiro (mantém a declividade): devolve as ops de substituição | { erro }.
 *   entradaCaixa(estado, pk, de, dn, yChega) a cota da entrada da caixa sifonada/ralo para um tubo que chega em yChega: no corpo, entre o topo da
 *                                           entrada e o fecho hídrico; abaixo dele, o rebaixo (prolongador) que falta.
 *   dnDoPonto(estado, alvo, sistema)        o DN do ramal pelo APARELHO do ponto (as mesmas tabelas do traçado automático) | null.
 * ⚠ Nenhum valor de norma aqui: o DN vem do js/hidnormas.js; declividade e conexões são do js/biminst.js.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function HB() { return dep("HidBocas", "./hidbocas.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok arredondamento a 0,1 mm (formatação)
  function r6(v) { return Math.round(v * 1e6) / 1e6; }   // hid:ok cota com 6 casas (a mesma do traço à mão)
  function txt(v) { return v == null ? "" : String(v); }
  function d3(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)); }
  function hz(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.z - b.z, 2)); }
  var EPS = 1e-6;   // hid:ok tolerância numérica (geometria)

  /* GEOMETRIA DO DESENHO (não é norma): */
  var LIMIAR_DEGRAU = 0.15;   // hid:ok 15 cm: abaixo disso o degrau vertical entre a altura de trabalho e o ponto não comporta dois joelhos com folga (perna DN 20–32 + bolsa) — o traço adota a cota do ponto
  var EMBUTIR = 0.05;         // hid:ok eixo do tubo embutido atrás da face da parede (o mesmo do js/biminstui.js e do traçado automático)
  var ALINHADO = 0.025;       // hid:ok 2,5 cm: um tubo a menos que isso da linha embutida está NELA (o toco cresce até ele, nenhum desvio curto)
  var PERTO_LINHA = 0.60;     // hid:ok 60 cm: coluna/tubo a até isso da linha da parede (shaft encostado) ainda liga pela parede, com um trecho a 90°
  var FOLGA_PONTA = 0.05;     // hid:ok 5 cm da ponta do tubo para o tê nascer no meio (a bolsa da ponta)

  function sisAgua(s) { return s === "agua_fria" || s === "agua_quente"; }
  function tol() { var I = BI(); return (I && I.TOL) || 0.02; }   // hid:ok geometria do desenho / tolerância (não é norma)

  /* o eixo embutido do ponto de parede: o ponto + a normal da parede × (embutir, no mínimo o raio + 1 cm de reboco) + a distância à face */
  function embutido(A, dn) {
    var n = A.parede, e = Math.max(EMBUTIR, num(dn, 25) / 2000 + 0.01) + Math.max(0, num(n.d, 0));   // hid:ok 1 cm de reboco sobre o tubo (o mesmo do js/biminstui.js chegada)
    return { x: r4(A.x + n.x * e), y: A.y, z: r4(A.z + n.z * e), e: e };
  }
  function unit(x, z) { var L = Math.sqrt(x * x + z * z); return L > EPS ? { x: x / L, z: z / L, L: L } : null; }

  /* --------------------------------------------------------------- DN do ponto pelo aparelho */
  function dnDoPonto(estado, alvo, sistema) {
    if (!alvo) return null;
    if (num(alvo.dn, 0) > 0) return num(alvo.dn, 0);
    if (alvo.famInst == null) return null;
    var K = dep("HidKit", "./hidkit.js"), N = dep("HidNormas", "./hidnormas.js");
    var fi = arr(estado && estado.familias).filter(function (f) { return String(f.id) === String(alvo.famInst); })[0];
    if (!K || !N || !fi || !K.tipoDaFamilia || !N.consulta) return null;
    var ap = null; try { ap = K.tipoDaFamilia(fi.famId, fi.tipoId); if (ap && K.aparelhoNorma) ap = K.aparelhoNorma(ap); } catch (e) { ap = null; }
    if (!ap) return null;
    var chaves = sistema === "esgoto" ? ["es.aparelhos"] : (sisAgua(sistema) ? ["af.aparelhos.dn_min", "af.aparelhos.dn_min_fabricante", "af.aparelhos"] : []);
    for (var i = 0; i < chaves.length; i++) {
      var c = null; try { c = N.consulta(chaves[i], { aparelho: ap }, "dn_min"); } catch (e2) { c = null; }
      if (c && c.ok && num(c.valor, 0) > 0) return num(c.valor, 0);
    }
    return null;
  }

  /* --------------------------------------------------------------- nível do ponto (água) */
  function nivelPonto(yTrab, yPonto) {
    return Math.abs(num(yTrab, 0) - num(yPonto, 0)) < LIMIAR_DEGRAU ? num(yPonto, 0) : num(yTrab, 0);
  }

  /* --------------------------------------------------------------- conferência de colisão da rota direta
     Só o que a rota PODE bater dentro da parede: outro tubo (de qualquer sistema) e o volume de louça/equipamento — fora as famílias dos dois
     pontos (a chegada no ponto é dela). Parede não conta: a rota corre embutida por construção. */
  function colide(estado, famAval, segs, dn, ignorarTrechos, ignorarFam) {
    var I = BI(), H = HR(), G = H && H._int, r = num(dn, 25) / 2000, motivo = null;   // hid:ok raio = DN/2000 (mm → m)
    var ign = {}; arr(ignorarTrechos).forEach(function (id) { ign[String(id)] = 1; });
    var pontas = []; segs.forEach(function (s) { pontas.push(s.a, s.b); });
    function tocaNasPontas(t) { return pontas.some(function (q) { return d3(q, t.p1) <= tol() + EPS || d3(q, t.p2) <= tol() + EPS; }); }
    if (G && G.segSeg3) arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      if (motivo || ign[String(t.id)] || !t.p1 || !t.p2) return;
      var rt = num(t.dn, 0) / 2000;   // hid:ok raio (mm → m)
      segs.forEach(function (s) {
        if (motivo) return;
        if (tocaNasPontas(t) && t.sistema === s.sistema) return;   /* encosta numa ponta da rota (é a ligação), não cruza */
        if (G.segSeg3(s.a, s.b, t.p1, t.p2) < r + rt - 0.002) motivo = "cruza o tubo " + txt(t.id) + " (" + txt(t.sistema).replace("_", " ") + ")";   // hid:ok 2 mm de folga de desenho
      });
    });
    var vols = []; try { vols = I && I.volumesFamilias ? I.volumesFamilias(estado, famAval) : []; } catch (eV) { vols = []; }
    var ignF = {}; arr(ignorarFam).forEach(function (id) { if (id != null) ignF[String(id)] = 1; });
    vols.forEach(function (v) {
      if (motivo || ignF[String(v.id)]) return;
      segs.forEach(function (s) {
        if (motivo) return;
        var L = d3(s.a, s.b), n = Math.max(2, Math.ceil(L / 0.01));   // hid:ok amostra a cada 1 cm
        for (var i = 1; i < n; i++) {
          var q = { x: s.a.x + (s.b.x - s.a.x) * i / n, y: s.a.y + (s.b.y - s.a.y) * i / n, z: s.a.z + (s.b.z - s.a.z) * i / n };
          var dx = q.x - v.cx, dz = q.z - v.cz, u = dx * v.ux + dz * v.uz, w = -dx * v.uz + dz * v.ux;
          if (Math.abs(u) < v.hl + r - 0.002 && Math.abs(w) < v.hw + r - 0.002 && q.y > v.y0 - r + 0.002 && q.y < v.y1 + r - 0.002) { motivo = "atravessa " + txt(v.famId || v.id); return; }   // hid:ok 2 mm de folga
        }
      });
    });
    return motivo;
  }

  /* --------------------------------------------------------------- LIGAÇÃO PELA PAREDE (água)
     A = ponto de parede do aparelho { tipo:"aparelho"|"conector", x,y,z, parede:{x,z,d}, famInst } ; B = { tipo: "meio"|"ponta"|"vertical"|
     "aparelho"|"conector", ... }. A ordem não importa na água (sem escoamento). o = { sistema, material, dn, prefixo, opTrecho(p1,p2) } */
  function ligarParede(estado, famAval, A, B, o) {
    o = o || {}; var I = BI(); if (!I) return { ok: false, erro: "motor das instalações não carregado" };
    var sis = o.sistema || A.sistema || B.sistema;
    if (!sisAgua(sis)) return { ok: false, erro: "a rota direta pela parede é da água (fria/quente)" };
    function ehPonto(p) { return p && (p.tipo === "aparelho" || p.tipo === "conector") && p.parede; }
    if (!ehPonto(A) && ehPonto(B)) { var tx = A; A = B; B = tx; }
    if (!ehPonto(A)) return { ok: false, erro: "nenhum dos dois é ponto de parede" };
    var dn = num(o.dn, 25), n = { x: A.parede.x, z: A.parede.z }, u = { x: -n.z, z: n.x }, Pa = embutido(A, dn);   // hid:ok geometria do desenho / tolerância (não é norma)
    var TS = arr(estado && estado.instalacoes && estado.instalacoes.trechos), pts = [], ign = [], extras = [], nome = "", avisos = [];
    function tr(id) { return TS.filter(function (t) { return String(t.id) === String(id); })[0] || null; }
    function caminho(lista) { var out = []; lista.forEach(function (q) { var ult = out[out.length - 1]; if (!ult || d3(ult, q) > 0.005) out.push({ x: r4(q.x), y: r6(q.y), z: r4(q.z) }); }); return out; }   // hid:ok 5 mm: ponto repetido
    var Ap = { x: A.x, y: A.y, z: A.z };

    if (B.tipo === "meio" || B.tipo === "ponta") {
      var T = tr(B.trecho); if (!T) return { ok: false, erro: "não achei o tubo " + txt(B.trecho) };
      if (T.sistema !== sis) return { ok: false, erro: "o tubo " + T.id + " é de outro sistema" };
      var d = unit(T.p2.x - T.p1.x, T.p2.z - T.p1.z); if (!d || Math.abs(T.p1.y - T.p2.y) > 0.01) return { ok: false, erro: "o tubo " + T.id + " não é deitado" };   // hid:ok 1 cm: tubo de água deitado
      /* a PONTA de um tubo que está NA linha embutida (o toco de outro ponto desta parede, um ramal que chega de frente): a rota corre pela parede até ela */
      if (B.tipo === "ponta" && Math.abs(d.x * n.x + d.z * n.z) > 0.05) {   // hid:ok geometria do desenho / tolerância (não é norma)
        var Pp = d3({ x: B.x, y: B.y, z: B.z }, T.p1) <= d3({ x: B.x, y: B.y, z: B.z }, T.p2) ? T.p1 : T.p2, oP = (Pp.x - Pa.x) * n.x + (Pp.z - Pa.z) * n.z;
        if (Math.abs(oP) > ALINHADO) return { ok: false, erro: "o tubo " + T.id + " não corre ao longo da parede do ponto e a ponta dele está fora da parede" };
        var Lp = { x: r4(Pa.x + n.x * oP), z: r4(Pa.z + n.z * oP) };
        pts = caminho([Ap, { x: Lp.x, y: A.y, z: Lp.z }, { x: Lp.x, y: Pp.y, z: Lp.z }, { x: Pp.x, y: Pp.y, z: Pp.z }]);
        ign.push(T.id); nome = "pela parede até a ponta do tubo " + T.id;
        return fechar();
      }
      if (Math.abs(d.x * n.x + d.z * n.z) > 0.05) return { ok: false, erro: "o tubo " + T.id + " não corre ao longo da parede do ponto" };   // hid:ok ~3°
      var yT = T.p1.y, off = (T.p1.x - Pa.x) * n.x + (T.p1.z - Pa.z) * n.z;   /* quanto o tubo está além (+) ou aquém (−) da linha embutida */
      if (Math.abs(off) > PERTO_LINHA) return { ok: false, erro: "o tubo " + T.id + " está longe da parede do ponto (" + Math.round(Math.abs(off) * 100) + " cm)" };
      var linha = Math.abs(off) <= ALINHADO && Pa.e + off > 0.01 ? { x: r4(Pa.x + n.x * off), z: r4(Pa.z + n.z * off) } : { x: Pa.x, z: Pa.z };   // hid:ok o toco nunca menor que 1 cm
      /* o pé da perpendicular no tubo (o tê): o ponto do tubo na direção do ponto; fora do tubo → a ponta mais perto (o tubo cresce até lá) */
      var s = (linha.x - T.p1.x) * d.x + (linha.z - T.p1.z) * d.z, X = null, ponta = null;
      if (B.tipo === "ponta") ponta = d3({ x: B.x, y: B.y, z: B.z }, T.p1) <= d3({ x: B.x, y: B.y, z: B.z }, T.p2) ? T.p1 : T.p2;
      else if (s > FOLGA_PONTA && s < d.L - FOLGA_PONTA) X = { x: r4(T.p1.x + d.x * s), y: yT, z: r4(T.p1.z + d.z * s) };
      else ponta = s <= FOLGA_PONTA ? T.p1 : T.p2;
      var Lin = { x: linha.x, y: A.y, z: linha.z }, Lt = { x: linha.x, y: yT, z: linha.z };
      if (X) {
        /* o tê no tubo, bem acima/abaixo do ponto: toco no ponto, vertical embutida até o tubo; se o tubo está fora da linha, o trecho curto a 90° */
        pts = caminho([Ap, Lin, Lt].concat(hz(Lt, X) > 0.005 ? [X] : []));   // hid:ok 5 mm
        if (hz(Lt, X) <= 0.005) pts[pts.length - 1] = { x: X.x, y: r6(yT), z: X.z };   // hid:ok geometria do desenho / tolerância (não é norma)
        extras = I.dividirTrecho ? I.dividirTrecho(estado, T.id, pts[pts.length - 1]) : [];
        nome = "pela parede: tê no tubo " + T.id + " e descida embutida até o ponto";
      } else {
        /* o tubo acaba antes do ponto: ele cresce pela parede (mesma cota) até a vertical do ponto */
        var E = { x: ponta.x, y: ponta.y, z: ponta.z }, oE = (E.x - linha.x) * n.x + (E.z - linha.z) * n.z;
        /* a ponta fora da linha embutida: a quina na linha, em frente à ponta (a 90°) */
        var quina = Math.abs(oE) <= ALINHADO ? null : { x: r4(E.x - n.x * oE), y: yT, z: r4(E.z - n.z * oE) };
        pts = caminho([Ap, Lin, Lt].concat(quina ? [quina] : []).concat([E]));
        ign.push(T.id);
        nome = "pela parede: o tubo " + T.id + " continua até a descida do ponto";
      }
      ign.push(T.id);
    } else if (B.tipo === "vertical") {
      var V = tr(B.trecho); if (!V) return { ok: false, erro: "não achei a coluna " + txt(B.trecho) };
      var y0 = Math.min(V.p1.y, V.p2.y), y1 = Math.max(V.p1.y, V.p2.y), yL = A.y;
      if (!(yL > y0 + FOLGA_PONTA && yL < y1 - FOLGA_PONTA)) return { ok: false, erro: "a coluna " + V.id + " não passa na altura do ponto" };
      var w = { x: V.p1.x - Pa.x, z: V.p1.z - Pa.z }, on = w.x * n.x + w.z * n.z, ou = w.x * u.x + w.z * u.z;
      if (Math.abs(on) > PERTO_LINHA) return { ok: false, erro: "a coluna " + V.id + " está longe da parede do ponto" };
      var Pv = { x: V.p1.x, y: yL, z: V.p1.z };
      if (Math.abs(on) <= ALINHADO && Pa.e + on > 0.01) pts = caminho([Ap, { x: r4(Pa.x + n.x * on), y: yL, z: r4(Pa.z + n.z * on) }, Pv]);   // hid:ok o toco nunca menor que 1 cm
      else { var Q = { x: r4(Pa.x + u.x * ou), y: yL, z: r4(Pa.z + u.z * ou) }; pts = caminho([Ap, Pa, Q, Pv]); }
      if (Math.abs(ou) < 0.005 && Math.abs(on) <= ALINHADO) return { ok: false, erro: "a coluna está no próprio ponto" };   // hid:ok
      ign.push(V.id);
      nome = "pela parede até a coluna " + V.id + " (tê na coluna)";
    } else if (ehPonto(B)) {
      var nB = { x: B.parede.x, z: B.parede.z }, Pb = embutido(B, dn), cosN = n.x * nB.x + n.z * nB.z;
      var yH = nivelPonto(A.y, B.y), mesma = cosN > 0.99 && Math.abs((Pb.x - Pa.x) * n.x + (Pb.z - Pa.z) * n.z) <= ALINHADO;   // hid:ok paralelas
      if (mesma) {
        var Pb2 = { x: Pb.x, y: A.y, z: Pb.z };
        pts = caminho([Ap, Pa, Pb2, { x: Pb.x, y: B.y, z: Pb.z }, { x: B.x, y: B.y, z: B.z }]);
        nome = "pela parede: corre embutido e sobe/desce no ponto de destino";
        void yH;
      } else if (Math.abs(cosN) < 0.05) {   // hid:ok geometria do desenho / tolerância (não é norma)
        /* paredes do canto: o encontro das duas linhas embutidas */
        var uB = { x: -nB.z, z: nB.x }, den = u.x * uB.z - u.z * uB.x; if (Math.abs(den) < EPS) return { ok: false, erro: "paredes paralelas fora de linha" };
        var t0 = ((Pb.x - Pa.x) * uB.z - (Pb.z - Pa.z) * uB.x) / den, Cq = { x: r4(Pa.x + u.x * t0), y: A.y, z: r4(Pa.z + u.z * t0) };
        if (Math.abs(t0) > 8 || hz(Cq, Pb) > 8) return { ok: false, erro: "o canto entre as paredes fica longe" };   // hid:ok 8 m de alcance
        pts = caminho([Ap, Pa, Cq, { x: Pb.x, y: A.y, z: Pb.z }, { x: Pb.x, y: B.y, z: Pb.z }, { x: B.x, y: B.y, z: B.z }]);
        nome = "pela parede até o canto e pela outra parede até o ponto";
      } else return { ok: false, erro: "os pontos estão em paredes que não se encontram em ângulo reto" };
    } else return { ok: false, erro: "destino sem ligação direta pela parede" };

    return fechar();
    function fechar() {
    if (pts.length < 2) return { ok: false, erro: "pontos coincidentes" };
    var segs = []; for (var i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i], sistema: sis });
    /* ⚠ nenhum trecho menor que o nó do biminst (2 cm) entre duas conexões: vira cruzeta / joelho colado (o defeito 1 da bancada) */
    var curto = segs.filter(function (s, k) { return k > 0 && k < segs.length - 1 && d3(s.a, s.b) < tol() + 0.005; })[0];   // hid:ok
    if (curto) return { ok: false, erro: "a rota direta teria um trecho de " + Math.round(d3(curto.a, curto.b) * 1000) + " mm entre duas conexões" };
    var famIgn = [A.famInst, B.famInst];
    var bate = colide(estado, famAval, segs.slice(1), dn, ign, famIgn);   /* o 1º trecho é o toco do próprio ponto */
    if (bate) return { ok: false, erro: "a rota pela parede " + bate };
    var ops = [], seq = 0, pref = txt(o.prefixo || ("mao" + Date.now().toString(36) + "-"));   // hid:ok geometria do desenho / tolerância (não é norma)
    segs.forEach(function (s) {
      var op = o.opTrecho ? o.opTrecho(s.a, s.b) : { op: "trecho", sistema: sis, material: o.material, dn: dn, p1: s.a, p2: s.b };
      op.id = pref + (++seq); ops.push(op);
    });
    var comp = segs.reduce(function (acc, s) { return acc + d3(s.a, s.b); }, 0);
    return { ok: true, ops: extras.concat(ops), comprimento: r4(comp), nome: nome, avisos: avisos, pontos: pts };
    }
  }

  /* --------------------------------------------------------------- RENIVELAR o traço
     trechos = os trechos do traço em curso (do 1º clique até agora), dy = quanto subir (+) ou descer (−); fixos = os pontos que NÃO andam (o ponto
     do aparelho e o toco dele: a vertical embutida só estica/encolhe). o = { piso, cobrimento, gravidade }: com o traço sob o piso, nenhum tubo
     deitado pode passar a cobrir menos que `cobrimento` (o esgoto não sobe para dentro do contrapiso). */
  function renivelar(trechos, dy, fixos, o) {
    o = o || {}; dy = num(dy, 0); if (Math.abs(dy) < EPS) return { ops: [] };
    function fixo(q) { return arr(fixos).some(function (f) { return d3(f, q) <= 0.001; }); }   // hid:ok 1 mm
    var ops = [], erro = null;
    arr(trechos).forEach(function (t) {
      if (erro) return;
      var a = { x: t.p1.x, y: fixo(t.p1) ? t.p1.y : r6(t.p1.y + dy), z: t.p1.z }, b = { x: t.p2.x, y: fixo(t.p2) ? t.p2.y : r6(t.p2.y + dy), z: t.p2.z };
      var deitado = hz(t.p1, t.p2) > 0.005, eraVert = !deitado;   // hid:ok 5 mm
      if (deitado && (fixo(t.p1) !== fixo(t.p2))) { erro = "o trecho " + t.id + " tem uma ponta presa (no aparelho) e outra que andaria"; return; }
      if (eraVert) {
        var L0 = t.p1.y - t.p2.y, L1 = a.y - b.y;
        if (Math.abs(L1) < tol() + 0.005 && Math.abs(L0) >= tol()) { erro = "a vertical " + t.id + " ficaria com " + Math.round(Math.abs(L1) * 1000) + " mm"; return; }   // hid:ok
        if (L0 * L1 < 0) { erro = "a vertical " + t.id + " inverteria"; return; }
      }
      if (deitado && o.piso != null && o.cobrimento != null) {
        var r = num(t.dn, 50) / 2000, lim = num(o.piso, 0) - num(o.cobrimento, 0);   // hid:ok raio (mm → m)
        var acima = Math.max(a.y, b.y) + r;
        if (Math.max(t.p1.y, t.p2.y) < num(o.piso, 0) && acima > lim + 0.0005) { erro = "o tubo " + t.id + " subiria para dentro do contrapiso (cobrimento " + Math.round(num(o.cobrimento, 0) * 1000) + " mm)"; return; }   // hid:ok 0,5 mm
      }
      var nt = JSON.parse(JSON.stringify(t)); nt.op = "trecho"; nt.p1 = a; nt.p2 = b; delete nt.comprimento;
      ops.push(nt);
    });
    return erro ? { erro: erro } : { ops: ops };
  }

  /* --------------------------------------------------------------- ENTRADA DA CAIXA na altura da chegada
     → { ok, boca, y, rebaixo (m, a mais no corpo), erro } — boca = a entrada (js/hidbocas.js) já com a cota escolhida; a cota fica entre o topo
     da entrada e o fecho hídrico; o tubo que chega abaixo do fecho pede o corpo mais fundo (rebaixo, até BimInst.limiteRebaixo). */
  function entradaCaixa(estado, pk, de, dn, yChega, bocaId) {
    var H = HB(); if (!H || !pk) return { ok: false, erro: "sem catálogo de bocas" };
    var e = H.entradasLivres(estado, pk, de, dn); if (!e.ok) return { ok: false, erro: e.erro, dnDiferente: e.dnDiferente, dnBoca: e.dnBoca, semBoca: e.semBoca };
    var b = e.bocas[0]; if (bocaId != null) { var bs = e.bocas.filter(function (q) { return String(q.id) === String(bocaId); }); if (bs.length) b = bs[0]; }
    var yTop = num(b.y, 0), yMin = H.yMinEntrada(estado, pk, dn), y = Math.min(yTop, num(yChega, yTop));
    if (y >= yMin - EPS) return { ok: true, boca: copiaB(b, y), y: r6(y), rebaixo: 0 };
    var lim = Math.max(0, num(H.limiteRebaixo(pk), 0) - num(pk.rebaixo, 0)), falta = Math.ceil((yMin - y) * 200 - 1e-6) / 200;   // hid:ok o rebaixo em passos de 5 mm (corte do prolongador)
    if (falta > lim + EPS) return { ok: false, erro: "o tubo chega " + Math.round((yMin - y) * 1000) + " mm abaixo do fecho hídrico da " + txt(pk.id) + (lim > EPS ? " e o prolongador de catálogo só desce " + Math.round(lim * 1000) + " mm" : " e ela não tem prolongador no catálogo"), falta: yMin - y };
    var bb = copiaB(b, y); bb.dRebaixo = falta;
    return { ok: true, boca: bb, y: r6(y), rebaixo: r4(falta) };
  }
  function copiaB(b, y) { var c = JSON.parse(JSON.stringify(b)); c.y = r6(y); return c; }

  /* --------------------------------------------------------------- CANTO DO RAMAL → CORPO DO TUBO A JUSANTE (27/11/2026)
     Esgoto terminando no NÓ em que dois tubos já se encontram (o canto de um ramal): o nó virava um TÊ sem dois tubos alinhados (o verificador
     avisa "tê assumido") e, no Ligar A → B, até cruzeta. O certo é a derivação entrar no corpo do tubo que SAI do canto (a jusante), logo depois
     da bolsa da conexão, onde a ferramenta já põe a junção a 45° a favor do fluxo. → alvo { tipo: "meio", trecho, x, y, z, dn, doCanto: true } ou null
     (ponta livre, tubo a jusante vertical ou curto: fica como está). */
  var DESLOC_CANTO = 0.20;   // hid:ok 20 cm do nó: a bolsa da conexão do canto + a folga até a junção (geometria, o mesmo da perna lateral do HidLigar)
  function cantoParaMeio(estado, alvo, sistema, de) {
    if (!alvo || alvo.tipo !== "ponta" || alvo.trecho == null) return null;
    var tr = arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return t && t.p1 && t.p2 && (!sistema || t.sistema === sistema); });
    var no = { x: num(alvo.x, 0), y: num(alvo.y, 0), z: num(alvo.z, 0) }, juntos = tr.filter(function (t) { return d3(t.p1, no) <= tol() || d3(t.p2, no) <= tol(); });
    if (juntos.length !== 2) return null;
    function ponta(t) { var a = d3(t.p1, no) <= tol() ? t.p1 : t.p2; return { no: a, outra: a === t.p1 ? t.p2 : t.p1 }; }
    var sai = juntos.filter(function (t) { var q = ponta(t); return q.outra.y <= q.no.y + EPS; }), chega = juntos.filter(function (t) { return sai.indexOf(t) < 0; });
    if (sai.length !== 1 || chega.length !== 1) { sai = juntos.filter(function (t) { var q = ponta(t); return q.outra.y <= q.no.y + EPS; }).slice(0, 1); chega = juntos.filter(function (t) { return t !== sai[0]; }); }
    function no2(t, longe) {   /* o ponto a DESLOC_CANTO do canto, no tubo t (deitado e comprido o bastante) */
      if (!t || hz(t.p1, t.p2) <= 0.005) return null;   // hid:ok 5 mm: deitado
      var q = ponta(t), L = d3(q.no, q.outra); if (L < 2 * DESLOC_CANTO) return null;
      var u = DESLOC_CANTO / L;
      return { tipo: "meio", trecho: t.id, dn: t.dn, doCanto: true, lado: longe, x: r6(q.no.x + (q.outra.x - q.no.x) * u), y: r6(q.no.y + (q.outra.y - q.no.y) * u), z: r6(q.no.z + (q.outra.z - q.no.z) * u) };
    }
    /* o traço que vem de  até o ponto não pode cruzar o OUTRO tubo do canto em planta (senão: o tubo a montante, do lado de quem chega) */
    function cruza(pt, outro) {
      if (!de || !outro) return false;
      var a = de, b = pt, c = outro.p1, d = outro.p2;
      function o(p, q, r) { return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x); }
      var d1 = o(c, d, a), d2 = o(c, d, b), d3_ = o(a, b, c), d4 = o(a, b, d);
      return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3_ > 1e-9 && d4 < -1e-9) || (d3_ < -1e-9 && d4 > 1e-9));   // hid:ok tolerância numérica da interseção
    }
    var jus = no2(sai[0], "jusante"), mon = no2(chega[0], "montante");
    if (jus && !cruza(jus, chega[0])) return jus;
    if (mon && !cruza(mon, sai[0])) return mon;
    return jus || mon || null;
  }
  var HidMao = { VERSAO: 1, LIMIAR_DEGRAU: LIMIAR_DEGRAU, dnDoPonto: dnDoPonto, nivelPonto: nivelPonto, ligarParede: ligarParede, renivelar: renivelar, entradaCaixa: entradaCaixa, cantoParaMeio: cantoParaMeio, DESLOC_CANTO: DESLOC_CANTO, _int: { colide: colide, embutido: embutido } };
  global.HidMao = HidMao;
  if (typeof module !== "undefined" && module.exports) module.exports = HidMao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

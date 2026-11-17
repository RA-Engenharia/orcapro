/* =====================================================================
 * madt3.js — T3: TELHADO DE 4 ÁGUAS (planta retangular a × b, ou quadrada = pirâmide) em madeira engenharada.
 * Motor PURO, ES5, sem DOM, Node-testável. Arquivo NOVO (a frente claude/madeira-fink mexe em madtipologias/madligacoes/madorcamento): nada dos arquivos
 * compartilhados foi alterado para o T3 — este arquivo só LÊ MadTipologias/MadLig/MadMateriais/MadDim/AcoAnalise/AcoVento/AcoCargas e MadDimensionar2 (funções "_").
 * Decisões, fontes e conta à mão: docs/madeira/T3-REFERENCIA.md.
 *
 * GEOMETRIA (convenção da T2: ponto = [X, Z da planta, altura]; no solver x = X, y = vertical, z = Z):
 *   · cumeeira ao longo de X, de b/2 a a − b/2 (comprimento a − b; pirâmide: um ponto), mesma inclinação nas 4 águas;
 *   · TESOURAS PRINCIPAIS (Pratt ou Howe, as mesmas barras da T2) nos eixos X_k, de b/2 a a − b/2 (espaçamento ≤ sTes);
 *   · MEIAS-TESOURAS (MS, MI, MP, MG) nas águas de cabeceira, no eixo Z = b/2, da parede (X = 0 ou a) até a tesoura de extremidade; fazem o papel da
 *     cumeeira da cabeceira (a ponta da MS apoia na tesoura de extremidade);
 *   · ESPIGÕES (E): 4 vigas inclinadas, do canto da parede (com o balanço do beiral) à ponta da cumeeira, a 45° em planta; apoiam no canto (frechal + pilar)
 *     e na ponta da cumeeira;
 *   · TERÇAS das 4 águas, nas MESMAS linhas (a cada dz = b/(2·nH) em planta): as das águas laterais correm de espigão a espigão (apoiadas nas tesouras),
 *     as das cabeceiras de espigão a espigão (apoiadas na meia-tesoura); as pontas são cortadas em BISEL (45° em planta) e assentam no espigão;
 *   · FRECHAL em anel (4 lados) sobre os pilares; a tração do anel é a CINTA que resolve o empuxo horizontal do espigão no canto;
 *   · contraventamento em madeira (diagonais em X só-tração) nas águas laterais entre tesouras e nas paredes; as cabeceiras e o triângulo canto–tesoura são
 *     triangulados pelo próprio espigão.
 * RINCÃO (planta em L): NÃO implementado nesta entrega (ver T3-REFERENCIA.md, §Pendências).
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  function D() {
    return { AN: req("AcoAnalise", "acoanalise.js"), VE: req("AcoVento", "acovento.js"), CA: req("AcoCargas", "acocargas.js"), MM: req("MadMateriais", "madmateriais.js"), MD: req("MadDim", "maddim7190.js"),
      MT: req("MadTipologias", "madtipologias.js"), ML: req("MadLig", "madligacoes.js"), D2: req("MadDimensionar2", "maddimensionar2.js") };
  }
  function rd(x, n) { return Number(x.toFixed(n)); }
  function r2(x) { return Math.round(x * 1000) / 1000; }
  function linspace(a, b, n) { var o = [], i; if (n === 1) return [a]; for (i = 0; i < n; i++) o.push(a + (b - a) * i / (n - 1)); return o; }
  function norm(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }
  function ext(a) { for (var i = 1; i < arguments.length; i++) for (var k in arguments[i]) if (Object.prototype.hasOwnProperty.call(arguments[i], k)) a[k] = arguments[i][k]; return a; }
  function mescla(base, o) { var r = {}, k; for (k in base) r[k] = (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) ? mescla(base[k], (o || {})[k]) : ((o || {})[k] != null ? o[k] : base[k]); for (k in (o || {})) if (!(k in r)) r[k] = o[k]; return r; }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }
  function subdiv(brk, vmax) { var o = [brk[0]], k, j, n; for (k = 1; k < brk.length; k++) { n = Math.max(1, Math.ceil((brk[k] - brk[k - 1]) / vmax - 1e-9)); for (j = 1; j <= n; j++) o.push(brk[k - 1] + (brk[k] - brk[k - 1]) * j / n); } return o; }
  function br(x, n) { return (n == null ? x.toFixed(2) : x.toFixed(n)).replace(".", ","); }

  var FOLGA = 0.010;      /* folga construtiva mínima (m) nas pontas da peça comprimida (espigão e diagonal Howe): a carga passa SÓ por chapa + pinos */
  var MLC = "MLC GL24h (EN 14080) — pinus/eucalipto, cola PUR/MUF classe de serviço 3", INOX = "aço inox AISI 316 (A4)", GALV = "aço ASTM A36 galvanizado a fogo (NBR 6323)";

  var T3_PADRAO = {
    a: 12, b: 8, peDireito: 3.0, baseZ: 0, incl: 0.30, beiral: 0.8, vMaxPilar: 4.0, telha: { peso: 0.55, descricao: "telha cerâmica com ripas" }, cobertura: { sTercaMax: 1.4, travBaixo: null },
    tesoura: { sTes: 4.0, tipo: "pratt" }, contraventamento: { tipo: "madeira" }, vedacaoRigida: false, origem: { x: 0, y: 0 }, nome: "Telhado de 4 águas"
  };
  function t3Parametros(p) {
    var q = mescla(T3_PADRAO, p || {}), be = q.beiral;
    if (be && typeof be === "object") {
      var v = [be.frente, be.fundo, be.esq, be.dir].filter(function (x) { return x != null; });
      if (!v.length) be = 0.8; else { if (v.some(function (x) { return Math.abs(x - v[0]) > 1e-9; })) throw new Error("madt3: o espigão a 45° exige o MESMO beiral nos 4 lados (informado: " + v.join("; ") + ")"); be = v[0]; }
    }
    q.beiral = Number(be);
    if (!(q.beiral >= 0 && q.beiral <= 2.5)) throw new Error("madt3: beiral fora de 0 a 2,5 m");
    if (!(q.incl > 0.05)) throw new Error("madt3: inclinação mínima de 5 % (telha)");
    if (q.a < q.b - 1e-9) throw new Error("madt3: a ≥ b (a cumeeira corre pela maior dimensão; NBR 6123 Tabela 5): gire a planta 90°");
    if (q.a - q.b > 1e-6 && q.a - q.b < 0.5) throw new Error("madt3: a − b = " + br(q.a - q.b) + " m (entre 0 e 0,5 m): use planta QUADRADA (a = b, pirâmide) ou afaste a de b (cumeeira de pelo menos 0,5 m)");
    if (q.tesoura.tipo !== "pratt" && q.tesoura.tipo !== "howe") throw new Error("madt3: tesoura.tipo deve ser \"pratt\" ou \"howe\"");
    if (!(q.b >= 3)) throw new Error("madt3: vão mínimo de 3 m");
    q._t3 = true; return q;
  }

  /** orientação da altura h da seção (vetor unitário em [X, Z, altura]) */
  function upDe(m) {
    var d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), Lh = hyp(d[0], d[1]);
    if (m.up) return m.up;
    if (Lh < 0.02 * L) return m.plano === "x" ? [1, 0, 0] : (m.plano === "z" ? [0, 1, 0] : [1, 0, 0]);
    if (Math.abs(d[2]) < 0.02 * L) return [0, 0, 1];
    var al = Lh / L, be = d[2] / L, hx = d[0] / Lh, hz = d[1] / Lh;
    return [-be * hx, -be * hz, al];
  }

  /** GEOMETRIA: membros no formato da T2 ({ id, g, p0, p1, nos, ... } com pontos [X, Z, altura]) e info */
  function t3Geometria(pp) {
    var p = pp && pp._t3 ? pp : t3Parametros(pp), a = p.a, b = p.b, Hp = p.peDireito + p.baseZ, i = p.incl, sc = Math.sqrt(1 + i * i), e = p.beiral, cob = p.cobertura, M = [], j, k;
    var nH = Math.max(2, Math.ceil((b / 2) * sc / cob.sTercaMax - 1e-9)), dz = (b / 2) / nH, lp = dz * sc, La = a - b, pir = La < 0.05, howe = p.tesoura.tipo === "howe", tipE = e * sc;
    var xs; if (pir) xs = [a / 2]; else { var nTv = Math.max(1, Math.ceil(La / p.tesoura.sTes - 1e-9)); xs = linspace(b / 2, a - b / 2, nTv + 1); }
    var yD = function (d) { return Hp + i * d; };                       /* altura do telhado a d (m em planta) da parede; d < 0 = beiral */
    var yT = function (z) { return z < 0 ? Hp + i * z : (z > b ? Hp + i * (b - z) : Hp + i * Math.min(z, b - z)); };
    var zH = function (jj) { return jj * dz; };
    var P3 = function (x, z, y) { return [x, z, y]; };
    var xbrk = [0].concat(xs.filter(function (x) { return x > 1e-6 && x < a - 1e-6; })).concat([a]), pX = subdiv(xbrk, p.vMaxPilar), pZ = subdiv([0, b / 2, b], p.vMaxPilar);
    var nid = {}, n = 0;
    function add(o) { o.p0 = o.p0.map(function (v) { return rd(v, 4); }); o.p1 = o.p1.map(function (v) { return rd(v, 4); }); if (o.nos) o.nos = o.nos.map(function (P) { return P.map(function (v) { return rd(v, 4); }); }); M.push(o); return o; }
    function trib(arr, kx) { return ((kx > 0 ? arr[kx] - arr[kx - 1] : 0) + (kx < arr.length - 1 ? arr[kx + 1] - arr[kx] : 0)) / 2; }
    /* ---- pilares do perímetro ---- */
    [0, b].forEach(function (z) {
      pX.forEach(function (x, kx) {
        var partes = [[z === 0 ? "esquerda" : "direita", x, trib(pX, kx)]];
        if (kx === 0 || kx === pX.length - 1) partes.push([kx === 0 ? "frente" : "fundo", z, trib(pZ, z === 0 ? 0 : pZ.length - 1)]);
        add({ id: "P" + (++n), g: "P", p0: P3(x, z, p.baseZ), p1: P3(x, z, Hp), partes: partes, pinJ: true });
      });
    });
    var nc = 0;
    [0, a].forEach(function (x) { pZ.forEach(function (z, kz) { if (kz === 0 || kz === pZ.length - 1) return; add({ id: "PO" + (++nc), g: "PO", p0: P3(x, z, p.baseZ), p1: P3(x, z, Hp), partes: [[x === 0 ? "frente" : "fundo", z, trib(pZ, kz)]], pinJ: true }); }); });
    /* ---- tesouras principais (as barras da T2) ---- */
    xs.forEach(function (x, kx) {
      add({ id: "BI" + kx, g: "BI", tes: kx, plano: "z", p0: P3(x, 0, Hp), p1: P3(x, b, Hp), nos: linspace(0, b, 2 * nH + 1).slice(1, 2 * nH).map(function (z) { return P3(x, z, Hp); }), pinI: true, pinJ: true });
      [["F", -1, tipE], ["B", 1, tipE]].forEach(function (S) {
        var ag = S[0], sg = S[1], z0 = sg < 0 ? 0 : b, tip = S[2], nos = tip > 0 ? [P3(x, z0, Hp)] : [], zt = sg < 0 ? -tip / sc : b + tip / sc;
        for (j = 1; j < nH; j++) nos.push(P3(x, sg < 0 ? zH(j) : b - zH(j), yT(zH(j))));
        add({ id: "BS" + ag + kx, g: "BS", plano: "z", agua: ag, tes: kx, p0: P3(x, zt, yT(zt)), p1: P3(x, b / 2, yT(b / 2)), nos: nos });
        for (j = 1; j <= nH; j++) {
          var zj = sg < 0 ? zH(j) : b - zH(j);
          if (j < nH || ag === "F") add({ id: "PD" + ag + j + "_" + kx, g: "PD", plano: "z", tes: kx, p0: P3(x, zj, Hp), p1: P3(x, zj, yT(zj)), pinI: true, pinJ: true });
          if (j >= 2) {
            var zj1 = sg < 0 ? zH(j - 1) : b - zH(j - 1);
            add({ id: "DG" + ag + j + "_" + kx, g: "DG", plano: "z", tes: kx, agua: ag, p0: howe ? P3(x, zj1, yT(zj1)) : P3(x, zj1, Hp), p1: howe ? P3(x, zj, Hp) : P3(x, zj, yT(zj)), pinI: true, pinJ: true });
          }
        }
      });
    });
    /* ---- meias-tesouras das cabeceiras (plano Z = b/2; u = distância à parede de cabeceira) ---- */
    [["W", 0, 1], ["E", a, -1]].forEach(function (H) {
      var s = H[0], x0 = H[1], sg = H[2], X = function (u) { return sg > 0 ? x0 + u : x0 - u; }, tag = s;
      var nosS = e > 0 ? [P3(x0, b / 2, Hp)] : [];
      for (j = 1; j < nH; j++) nosS.push(P3(X(zH(j)), b / 2, yD(zH(j))));
      add({ id: "MS" + tag, g: "MS", plano: "x", agua: s, pinJ: true, p0: P3(X(-e), b / 2, yD(-e)), p1: P3(X(b / 2), b / 2, yD(b / 2)), nos: nosS });
      add({ id: "MI" + tag, g: "MI", plano: "x", agua: s, p0: P3(x0, b / 2, Hp), p1: P3(X(b / 2), b / 2, Hp), nos: linspace(0, b / 2, nH + 1).slice(1, nH).map(function (u) { return P3(X(u), b / 2, Hp); }), pinI: true, pinJ: true });
      for (j = 1; j < nH; j++) add({ id: "MP" + tag + j, g: "MP", plano: "x", agua: s, p0: P3(X(zH(j)), b / 2, Hp), p1: P3(X(zH(j)), b / 2, yD(zH(j))), pinI: true, pinJ: true });
      for (j = 2; j <= nH; j++) {
        var u0 = zH(j - 1), u1 = zH(j);
        add({ id: "MG" + tag + j, g: "MG", plano: "x", agua: s, p0: howe ? P3(X(u0), b / 2, yD(u0)) : P3(X(u0), b / 2, Hp), p1: howe ? P3(X(u1), b / 2, Hp) : P3(X(u1), b / 2, yD(u1)), pinI: true, pinJ: true });
      }
    });
    /* ---- espigões: do canto (com o balanço do beiral) à ponta da cumeeira ---- */
    var CANTOS = [[0, 0, 1, 1], [0, b, 1, -1], [a, 0, -1, 1], [a, b, -1, -1]];
    CANTOS.forEach(function (C, ix) {
      var cx = C[0], cz = C[1], sx = C[2], sz = C[3], nos = [];
      if (e > 0) nos.push(P3(cx, cz, Hp));
      for (j = 1; j < nH; j++) nos.push(P3(cx + sx * zH(j), cz + sz * zH(j), yD(zH(j))));
      add({ id: "E" + (ix + 1), g: "E", p0: P3(cx - sx * e, cz - sz * e, yD(-e)), p1: P3(cx + sx * b / 2, cz + sz * b / 2, yD(b / 2)), nos: nos, canto: [cx, cz], sx: sx, sz: sz, pinJ: true, tip: e > 0 ? P3(cx, cz, Hp) : null });
    });
    /* ---- terças das 4 águas (nas mesmas linhas) e cumeeira; pesos por faixa (área em planta ∫ (L − 2d) dd, exata nos trapézios) ---- */
    var faixas = [];                                                    /* linhas: { k, lo, hi } em d (m da parede) */
    if (e > 0) faixas.push({ k: 0, d: -e, lo: -e, hi: -e / 2, nome: "tip" });
    faixas.push({ k: "FR", d: 0, lo: e > 0 ? -e / 2 : 0, hi: dz / 2, nome: "fr" });
    for (k = 1; k < nH; k++) faixas.push({ k: k, d: k * dz, lo: k * dz - dz / 2, hi: k === nH - 1 ? "topo" : k * dz + dz / 2, nome: "t" });
    function wsEff(Lw, lo, hi, d, a2) { var Lm = Lw - 2 * d; return Lm > 1e-6 ? ((Lw - (lo + hi)) * (hi - lo) * sc) / Lm * (a2 || 1) : 0; }
    function addLinha(sl, f) {
      var Lw = (sl === "F" || sl === "B") ? a : b, hi = f.hi === "topo" ? (((sl === "F" || sl === "B") && !pir) ? f.d + dz / 2 : b / 2) : f.hi, d = f.d, ws = wsEff(Lw, f.lo, hi, d);
      var wsIn = f.nome === "tip" ? 0 : (f.nome === "fr" ? wsEff(Lw, 0, hi, 0) : ws);
      var idk = f.nome === "fr" ? "FR" : (f.nome === "tip" ? "T" + sl + "0" : "T" + sl + f.k);
      var m;
      if (f.nome === "fr") {
        if (sl === "F") m = add({ id: "FR1", g: "FR", pinI: true, pinJ: true, p0: P3(0, 0, Hp), p1: P3(a, 0, Hp), nos: pX.slice(1, -1).map(function (x) { return P3(x, 0, Hp); }) });
        else if (sl === "B") m = add({ id: "FR2", g: "FR", pinI: true, pinJ: true, p0: P3(0, b, Hp), p1: P3(a, b, Hp), nos: pX.slice(1, -1).map(function (x) { return P3(x, b, Hp); }) });
        else if (sl === "W") m = add({ id: "FR3", g: "FR", pinI: true, pinJ: true, p0: P3(0, 0, Hp), p1: P3(0, b, Hp), nos: pZ.slice(1, -1).map(function (z) { return P3(0, z, Hp); }) });
        else m = add({ id: "FR4", g: "FR", pinI: true, pinJ: true, p0: P3(a, 0, Hp), p1: P3(a, b, Hp), nos: pZ.slice(1, -1).map(function (z) { return P3(a, z, Hp); }) });
      } else {
        var y = yD(d);
        if (sl === "F") m = add({ id: idk, g: "T", agua: "F", p0: P3(d, d, y), p1: P3(a - d, d, y), nos: xs.map(function (x) { return P3(x, d, y); }), artic: true, ends: true });
        else if (sl === "B") m = add({ id: idk, g: "T", agua: "B", p0: P3(d, b - d, y), p1: P3(a - d, b - d, y), nos: xs.map(function (x) { return P3(x, b - d, y); }), artic: true, ends: true });
        else if (sl === "W") m = add({ id: idk, g: "T", agua: "W", p0: P3(d, d, y), p1: P3(d, b - d, y), nos: [P3(d, b / 2, y)], artic: true, ends: true });
        else m = add({ id: idk, g: "T", agua: "E", p0: P3(a - d, d, y), p1: P3(a - d, b - d, y), nos: [P3(a - d, b / 2, y)], artic: true, ends: true });
      }
      m.faces = [{ sl: sl, ws: ws, wsIn: wsIn }]; m.ws = ws; m.wp = ws / sc; m.d = d; m.linha = d;
    }
    ["F", "B", "W", "E"].forEach(function (sl) { faixas.forEach(function (f) { addLinha(sl, f); }); });
    if (!pir) {
      var lo = b / 2 - dz / 2;
      var areaR = (a - (lo + b / 2)) * (b / 2 - lo) * sc;                /* uma água, faixa de cumeeira */
      var wsCM = 2 * areaR / La;
      add({ id: "CM", g: "CM", agua: "R", p0: P3(b / 2, b / 2, yD(b / 2)), p1: P3(a - b / 2, b / 2, yD(b / 2)), nos: xs.map(function (x) { return P3(x, b / 2, yD(b / 2)); }), faces: [{ sl: "F", ws: wsCM / 2, wsIn: wsCM / 2 }, { sl: "B", ws: wsCM / 2, wsIn: wsCM / 2 }], artic: true, ends: true, ws: wsCM, wp: wsCM / sc, d: b / 2, linha: b / 2 });
    }
    /* ---- linhas longitudinais do banzo inferior (LB; articuladas) entre as tesouras ---- */
    /* (de parede a parede de cabeceira, ligando-se ao frechal; na linha Z = b/2 o trecho das cabeceiras já é a MI da meia-tesoura) */
    for (j = 1; j < 2 * nH; j++) {
      if (j === nH) { if (xs.length >= 2) add({ id: "LB" + j, g: "LB", uni: true, p0: P3(xs[0], zH(j), Hp), p1: P3(xs[xs.length - 1], zH(j), Hp), nos: xs.slice(1, xs.length - 1).map(function (x) { return P3(x, zH(j), Hp); }), linha: zH(j) }); }
      else add({ id: "LB" + j, g: "LB", uni: true, p0: P3(0, zH(j), Hp), p1: P3(a, zH(j), Hp), nos: xs.map(function (x) { return P3(x, zH(j), Hp); }), linha: zH(j) });
    }
    [3, 4].forEach(function (q) { var fm = M.filter(function (m) { return m.id === "FR" + q; })[0]; if (!fm) return; for (j = 1; j < 2 * nH; j++) if (j !== nH) fm.nos.push(P3(q === 3 ? 0 : a, zH(j), Hp)); });
    /* ---- contraventamento: diagonais de madeira em X (só tração) ---- */
    var fx = 0, baias = [], bay; for (k = 0; k < xs.length - 1; k++) baias.push([xs[k], xs[k + 1]]);
    var selB = baias.length < 2 ? baias : D().MT.T2.baiasContraventadas(baias).map(function (ix) { return baias[ix]; });
    selB.forEach(function (bb) {
      [["F", 0], ["B", b]].forEach(function (S) {
        var zl = [S[1]], jj; for (jj = 1; jj <= nH; jj++) zl.push(S[1] === 0 ? zH(jj) : b - zH(jj));
        zl.slice(0, zl.length - 1).forEach(function (za, q) { var zb = zl[q + 1]; [[bb[0], bb[1]], [bb[1], bb[0]]].forEach(function (dd) { add({ id: "DX" + (++fx), g: "DX", agua: S[0], p0: P3(dd[0], za, yT(za)), p1: P3(dd[1], zb, yT(zb)), tracao: true, mad: true }); }); });
      });
    });
    var fv = 0;
    selB.forEach(function (bb) { for (k = 1; k < 2 * nH; k++) { var zk = zH(k); [[bb[0], bb[1]], [bb[1], bb[0]]].forEach(function (dd) { add({ id: "DV" + (++fv), g: "DV", p0: P3(dd[0], zk, Hp), p1: P3(dd[1], zk, yT(zk)), tracao: true, mad: true }); }); } });
    if (!p.vedacaoRigida) {
      var fxp = 0, diag = function (e2, plano, c) { fxp++; var A = plano === "x" ? P3(e2[0], c, p.baseZ) : P3(c, e2[0], p.baseZ), B2 = plano === "x" ? P3(e2[1], c, Hp) : P3(c, e2[1], Hp); return { id: "DP" + fxp, g: "DP", p0: A, p1: B2, tracao: true, mad: true }; };
      var bbx = [[pX[0], pX[1]], [pX[pX.length - 2], pX[pX.length - 1]]], bbz = [[pZ[0], pZ[1]], [pZ[pZ.length - 2], pZ[pZ.length - 1]]];
      [0, b].forEach(function (z) { bbx.forEach(function (dd) { [[dd[0], dd[1]], [dd[1], dd[0]]].forEach(function (e2) { add(diag(e2, "x", z)); }); }); });
      [0, a].forEach(function (x) { bbz.forEach(function (dd) { [[dd[0], dd[1]], [dd[1], dd[0]]].forEach(function (e2) { add(diag(e2, "z", x)); }); }); });
    }
    return { p: p, membros: M, info: { tesouraTipo: howe ? "howe" : "pratt", xs: xs, nH: nH, dz: dz, lp: lp, sc: sc, Hp: Hp, yT: yT, yD: yD, a: a, b: b, incl: i, beiral: e, tipE: tipE, pX: pX, pZ: pZ, pir: pir, La: La, baias: selB } };
  }

  /* ---------------------------------------------------------------- FONTE (lista de peças) */
  function Lista() {
    var pecas = [];
    return { pecas: pecas, add: function (k) {
      if (k.qtd == null) k.qtd = 1; if (!k.unidade) k.unidade = "peça";
      if (k.p0 && k.p1) { var L = norm(k.p0, k.p1); k.comprimento_m = rd(L, 3); var s = k.secao; if (s) { var A = s.tipo === "ret" ? s.b * s.h : s.tipo === "circ" ? Math.PI * s.d * s.d / 4 : (s.area_media || 0); k.volume_m3 = rd(A * L * k.qtd, 4); } }
      k.p0 = k.p0 ? k.p0.map(function (v) { return rd(v, 4); }) : null; k.p1 = k.p1 ? k.p1.map(function (v) { return rd(v, 4); }) : null; if (k.secao === undefined) k.secao = null; pecas.push(k); return k;
    } };
  }
  function cm(x) { return rd(x * 100, 0); }
  var NOMES = { P: ["Telhado 4 águas — pilares", "Pilar do perímetro"], PO: ["Telhado 4 águas — pilares", "Pilar de cabeceira"], FR: ["Telhado 4 águas — frechal (anel)", "Frechal em anel (viga de respaldo; cinta do canto)"],
    BS: ["Tesouras principais", "Banzo superior da tesoura"], BI: ["Tesouras principais", "Banzo inferior (tirante) da tesoura"], PD: ["Tesouras principais", "Montante da tesoura"], DG: ["Tesouras principais", "Diagonal da tesoura"],
    MS: ["Meias-tesouras (cabeceiras)", "Banzo superior da meia-tesoura"], MI: ["Meias-tesouras (cabeceiras)", "Banzo inferior da meia-tesoura"], MP: ["Meias-tesouras (cabeceiras)", "Montante da meia-tesoura"], MG: ["Meias-tesouras (cabeceiras)", "Diagonal da meia-tesoura"],
    E: ["Espigões", "Espigão (viga inclinada na aresta saliente)"], T: ["Cobertura — terças", "Terça (ponta em bisel de 45° no espigão)"], CM: ["Cobertura — cumeeira", "Viga de cumeeira"],
    LB: ["Contraventamento — linhas do banzo inferior", "Linha longitudinal do banzo inferior (6.6.4)"], DX: ["Contraventamento — águas (madeira)", "Diagonal de madeira em X no plano das águas (6.6.2 e 6.6.4)"],
    DV: ["Contraventamento — vertical (madeira)", "Diagonal de madeira em X nos planos verticais entre tesouras (6.6.4, Figura 5)"], DP: ["Contraventamento — paredes (madeira)", "Diagonal de madeira em X nos painéis das paredes (pilar → frechal)"] };
  var LINEAR = { T: 1, CM: 1, FR: 1, LB: 1, E: 1 };
  /** FONTE: marcas com quantidade; a diagonal Howe da tesoura principal e da meia-tesoura sai APARADA (folga ≥ 10 mm); o espigão sai aparado nas duas pontas (T3 aparar) */
  function t3Fonte(p, sec, ext2, apar) {
    ext2 = ext2 || {}; var G = t3Geometria(p), lista = Lista(), M = G.membros, I = G.info, marcas = {}, ordem = [], cont = {};
    var nomeClasse = String(ext2.classe || "mlc:GL24h").split(":")[1] || "GL24h";
    function put(k) { ["material", "especificacao", "descricao"].forEach(function (c) { if (typeof k[c] === "string") k[c] = k[c].replace(/GL24h/g, nomeClasse); }); return lista.add(k); }
    if (apar) M = apar.membros;
    M.forEach(function (m) {
      if (!NOMES[m.g]) return;
      var s = sec[m.g === "DV" ? "DX" : m.g] || {}, L = norm(m.p0, m.p1), linear = !!LINEAR[m.g], key = [m.g, rd(L, 3), linear ? m.id : "", JSON.stringify(s), m.bisel ? 1 : 0].join("|");
      if (!marcas[key]) { marcas[key] = { m: m, qtd: 0, sec: s }; ordem.push(key); }
      marcas[key].qtd++;
    });
    ordem.forEach(function (key) {
      var r = marcas[key], m = r.m, nm = NOMES[m.g], s = r.sec, linear = !!LINEAR[m.g], forma = s.forma === "circular" ? { tipo: "circ", d: s.d } : { tipo: "ret", b: s.b, h: s.h }, up = upDe(m);
      cont[m.g] = (cont[m.g] || 0) + 1;
      var desc = nm[1]; if (I.tesouraTipo === "howe" && (m.g === "DG" || m.g === "MG")) desc = "Diagonal da " + (m.g === "MG" ? "meia-tesoura" : "tesoura") + " Howe (comprimida sob gravidade)"; if (I.tesouraTipo === "howe" && (m.g === "PD" || m.g === "MP")) desc = "Montante da " + (m.g === "MP" ? "meia-tesoura" : "tesoura") + " Howe (tracionado sob gravidade)";
      var k = { id: linear ? m.id : m.g + cont[m.g], marca: m.g, grupo: nm[0], descricao: desc, material: MLC, especificacao: "MLC GL24h " + (s.forma === "circular" ? "Ø" + cm(s.d) : cm(s.b) + "×" + cm(s.h)) + " cm", secao: forma, p0: m.p0, p1: m.p1, up: up, qtd: r.qtd };
      if (m.bisel) { k.bisel = m.bisel; k.especificacao += "; pontas em bisel (folga ≥ 10 mm, carga só por chapa + pinos)"; }
      if (m.g === "T") k.especificacao += "; extremidades em bisel de 45° (assentam no espigão / na cabeceira)";
      put(k);
    });
    var nTes = M.filter(function (m) { return m.g === "BI"; }).length, nMt = M.filter(function (m) { return m.g === "MI"; }).length, nE = M.filter(function (m) { return m.g === "E"; }).length;
    if (nTes) put({ id: "LIG-TES", grupo: "Ligações — tesouras", descricao: "Nós da tesoura principal: chapa interna de aço + pinos (grupos dimensionados pela NBR 7190-1)", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por nó", secao: null, qtd: nTes * (2 * I.nH * 2 + 2) });
    if (nMt) put({ id: "LIG-MTS", grupo: "Ligações — meias-tesouras", descricao: "Nós da meia-tesoura e ligação meia-tesoura × tesoura de extremidade: chapa interna + pinos inox", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por nó", secao: null, qtd: nMt * (2 * I.nH + 2) });
    if (nE) put({ id: "LIG-ESP", grupo: "Ligações — espigões", descricao: "Espigão × cumeeira/tesoura (ponta) e espigão × canto (frechal + pilar + cinta): chapa interna + pinos inox + cinta de aço", material: INOX, especificacao: "chapa t = 8 mm + pinos inox; cinta de aço galvanizado no canto", secao: null, qtd: nE * 2 });
    var nDX = M.filter(function (m) { return m.g === "DX" || m.g === "DV" || m.g === "DP"; }).length;
    if (nDX) put({ id: "LIG-DX", grupo: "Ligações — contraventamento", descricao: "Pontas das diagonais de madeira do contraventamento: chapa interna de aço + pinos inox (NBR 7190-1:2022, cap. 7)", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por ponta de diagonal", secao: null, qtd: nDX * 2 });
    return { pecas: lista.pecas, membros: M, info: I };
  }
  function volumePorMaterial(pecas) { return D().MT.volumePorMaterial(pecas); }

  var MadT3 = { PADRAO: T3_PADRAO, parametros: t3Parametros, geometria: t3Geometria, fonte: t3Fonte, upDe: upDe, FOLGA: FOLGA, volumePorMaterial: volumePorMaterial, _util: { linspace: linspace, subdiv: subdiv, norm: norm, rd: rd, copia: copia, ext: ext, mescla: mescla, hyp: hyp, r2: r2, br: br, D: D } };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3;
  else global.MadT3 = MadT3;
})(typeof window !== "undefined" ? window : this);

/* =====================================================================
 * madt4.js — T4: TELHADO SEXTAVADO / OITAVADO (quiosque poligonal regular, n = 6 ou 8) em madeira engenharada (MLC). Motor PURO, ES5, sem DOM, Node-testável.
 * Arquivo NOVO: só LÊ MadT3 (util, upDe, FOLGA), MadMateriais, MadDim, MadLig, AcoAnalise/AcoVento/AcoCargas. Decisões, fontes e conta à mão: docs/madeira/T4-REFERENCIA.md.
 *
 * GEOMETRIA (convenção da T2/T3: ponto = [X, Z da planta, altura]; no solver x = X, y = vertical, z = Z):
 *   · polígono regular de n lados, raio circunscrito R (ou lado s = 2·R·sen(π/n)), centro C = (R, R); o lado 0 é paralelo a X (embaixo);
 *   · mesma inclinação i nas n águas, medida ⊥ ao lado; beiral e ⊥ aos lados (a ponta do espigão fica em R + e/cos β, β = π/n);
 *   · n ESPIGÕES radiais (viga inclinada do canto, com o balanço do beiral, ao ÁPICE central);
 *   · TERÇAS das n águas nas linhas d = −e, 1…nH−1 (d = distância ⊥ ao lado), cada uma de espigão a espigão (corda de comprimento 2·(a − d)·tg β, a = apótema);
 *   · FRECHAL em ANEL (n lados) sobre os pilares do perímetro; a tração do anel é a CINTA que resolve o empuxo horizontal do espigão no canto;
 *   · CAIBRO DE MEIO de água (CB, opcional; automático quando o lado passa de 4,5 m): do beiral ao ápice sobre o apótema, apoia as terças a meio vão e o pé assenta no pilar do meio do lado;
 *   · PILAR CENTRAL (PC, opcional): do piso ao ápice, como no caso de um quiosque com um poste no centro;
 *   · contraventamento de madeira em X (só tração) em cada água (entre linhas de terça, de espigão a espigão) e nos painéis das paredes (um painel por lado).
 * NÓ DO ÁPICE (decisão): CUBO DE AÇO — tubo central vertical com n chapas radiais (t = 8 mm) soldadas, cada espigão e cada caibro entra com a sua chapa em fenda, nunca contra o vizinho.
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var T3 = req("MadT3", "madt3.js"), U = T3._util, D = U.D, rd = U.rd, linspace = U.linspace, ext = U.ext, norm = U.norm, mescla = U.mescla, copia = U.copia, br = U.br;
  var FOLGA = T3.FOLGA, MLC = "MLC GL24h (EN 14080) — pinus/eucalipto, cola PUR/MUF classe de serviço 3", INOX = "aço inox AISI 316 (A4)", GALV = "aço ASTM A36 galvanizado a fogo (NBR 6323)";
  /* cubo central do ápice: tubo Ø114,3 × 6,3 (A = 21,4 cm², 16,8 kg/m) com n chapas radiais t = 8 mm; o tubo desce dentro do pilar central (CUBO_DESCE) e sobe CUBO_SOBE acima do nó */
  var CUBO = { d: 0.1143, t: 0.0063, A: 21.4e-4, kgm: 16.8, desce: 0.40, sobe: 0.15, fy: 250 };

  var T4_PADRAO = { n: 6, R: 4.0, peDireito: 3.0, baseZ: 0, incl: 0.30, beiral: 0.8, vMaxPilar: 4.0, telha: { peso: 0.55, descricao: "telha cerâmica com ripas" }, cobertura: { sTercaMax: 1.4, travBaixo: null },
    pilarCentral: false, caibroMeio: "auto", contraventamento: { tipo: "madeira" }, vedacaoRigida: false, origem: { x: 0, y: 0 }, nome: "Telhado poligonal" };
  function t4Parametros(p) {
    var q = mescla(T4_PADRAO, p || {}), be = q.beiral;
    if (be && typeof be === "object") { var v = [be.frente, be.fundo, be.esq, be.dir].filter(function (x) { return x != null; }); if (!v.length) be = 0.8; else { if (v.some(function (x) { return Math.abs(x - v[0]) > 1e-9; })) throw new Error("madt4: o beiral é igual nos n lados (informado: " + v.join("; ") + ")"); be = v[0]; } }
    q.beiral = Number(be); q.n = Number(q.n);
    if (q.n !== 6 && q.n !== 8) throw new Error("madt4: planta hexagonal (n = 6) ou octogonal (n = 8); informado n = " + q.n);
    if (q.lado != null && !(q.R != null && p && p.R != null)) q.R = Number(q.lado) / (2 * Math.sin(Math.PI / q.n));
    q.R = Number(q.R); q.lado = 2 * q.R * Math.sin(Math.PI / q.n);
    if (!(q.R >= 1.8 && q.R <= 12)) throw new Error("madt4: raio fora de 1,8 a 12 m (informado " + br(q.R) + ")");
    if (!(q.beiral >= 0 && q.beiral <= 2.5)) throw new Error("madt4: beiral fora de 0 a 2,5 m");
    if (!(q.incl > 0.05)) throw new Error("madt4: inclinação mínima de 5 % (telha)");
    if (!(q.peDireito > 1)) throw new Error("madt4: pé-direito inválido");
    if (q.fechamento !== "aberto" && q.fechamento !== "fechado") throw new Error("madt4: informe o fechamento das faces (\"aberto\" = cobertura isolada, NBR 6123 item 8.2; \"fechado\" = edificação fechada) — não há padrão");
    q.detalheSela = q.detalheSela === "torcao" ? "torcao" : "chapa";
    q.pilarCentral = q.pilarCentral === true || q.pilarCentral === "sim" || q.pilarCentral === 1;
    var ap = q.R * Math.cos(Math.PI / q.n); q.apotema = ap;
    q.caibro = q.caibroMeio === true || q.caibroMeio === "sim" || (q.caibroMeio === "auto" && q.lado > 4.5 + 1e-9);
    q._t4 = true; return q;
  }

  /** GEOMETRIA: membros no formato da T3 ({ id, g, p0, p1, nos, ... }) e info */
  function t4Geometria(pp) {
    var p = pp && pp._t4 ? pp : t4Parametros(pp), n = p.n, be = Math.PI / n, R = p.R, ap = p.apotema, Hp = p.peDireito + p.baseZ, i = p.incl, sc = Math.sqrt(1 + i * i), e = p.beiral, cob = p.cobertura, M = [], j, k, cx = R, cz = R;
    var tgb = Math.tan(be), cb = Math.cos(be), nH = Math.max(2, Math.ceil(ap * sc / cob.sTercaMax - 1e-9)), dz = ap / nH, lp = dz * sc, Hap = Hp + i * ap, Rt = R + e / cb;
    var th = function (k2) { return -Math.PI / 2 - be + 2 * be * k2; }, psi = function (k2) { return th(k2) + be; };       /* ângulo do canto k e da normal externa do lado k */
    var Pn = function (rho, ang, y) { return [cx + rho * Math.cos(ang), cz + rho * Math.sin(ang), y]; };
    var yD = function (d) { return Hp + i * d; }, Wd = function (d) { return 2 * (ap - d) * tgb; };
    var hipPt = function (k2, d) { return Pn((ap - d) / cb, th(((k2 % n) + n) % n), yD(d)); };
    var canto = function (k2) { return Pn(R, th(((k2 % n) + n) % n), Hp); };
    var nid = 0, nS = Math.max(1, Math.ceil(p.lado / p.vMaxPilar - 1e-9)); if (p.caibro && nS % 2) nS += 1;
    function add(o) { o.p0 = o.p0.map(function (v) { return rd(v, 4); }); o.p1 = o.p1.map(function (v) { return rd(v, 4); }); if (o.nos) o.nos = o.nos.map(function (P) { return P.map(function (v) { return rd(v, 4); }); }); M.push(o); return o; }
    function ladoPt(k2, t) { var A = canto(k2), B = canto(k2 + 1); return [A[0] + (B[0] - A[0]) * t / nS, A[1] + (B[1] - A[1]) * t / nS, Hp]; }
    /* ---- pilares do perímetro (cantos + intermediários) ---- */
    for (k = 0; k < n; k++) for (j = 0; j < nS; j++) {
      var Pb = ladoPt(k, j), partes = [{ u: [Math.cos(psi(k)), Math.sin(psi(k))], trib: (j === 0 ? 0.5 : 1) * p.lado / nS }];
      if (j === 0) partes.push({ u: [Math.cos(psi(k - 1)), Math.sin(psi(k - 1))], trib: 0.5 * p.lado / nS });
      add({ id: "P" + (++nid), g: "P", p0: [Pb[0], Pb[1], p.baseZ], p1: [Pb[0], Pb[1], Hp], partes: partes, pinJ: true, lado: k, ptLado: j });
    }
    if (p.pilarCentral) add({ id: "PC", g: "PC", p0: [cx, cz, p.baseZ], p1: [cx, cz, Hap], pinI: true, pinJ: true, partes: [] });
    /* ---- espigões: do canto (com o balanço do beiral) ao ápice ---- */
    for (k = 0; k < n; k++) {
      var nos = []; if (e > 0) nos.push(canto(k));
      for (j = 1; j < nH; j++) nos.push(hipPt(k, j * dz));
      add({ id: "E" + (k + 1), g: "E", p0: e > 0 ? hipPt(k, -e) : canto(k), p1: [cx, cz, Hap], nos: nos, canto: [canto(k)[0], canto(k)[1]], idx: k, pinJ: true, tip: e > 0 ? canto(k) : null });
    }
    /* ---- faixas (pesos por faixa trapezoidal exata: área = (hi − lo)·W(meio), W(d) = 2·(a − d)·tg β) ---- */
    var faixas = [];
    if (e > 0) faixas.push({ d: -e, lo: -e, hi: -e / 2, nome: "tip", k: 0 });
    faixas.push({ d: 0, lo: e > 0 ? -e / 2 : 0, hi: dz / 2, nome: "fr", k: "FR" });
    for (k = 1; k < nH; k++) faixas.push({ d: k * dz, lo: k * dz - dz / 2, hi: k === nH - 1 ? ap : k * dz + dz / 2, nome: "t", k: k });
    var area = function (lo, hi) { return (hi - lo) * Wd((lo + hi) / 2) * sc; };
    var wsE = function (f, a2) { return area(f.lo, f.hi) / Wd(f.d) * (a2 || 1); };
    for (j = 0; j < n; j++) {
      faixas.forEach(function (f) {
        var ws = wsE(f), wsIn = f.nome === "tip" ? 0 : (f.nome === "fr" ? area(0, f.hi) / Wd(0) : ws), m;
        if (f.nome === "fr") {
          var fn = []; for (var t2 = 1; t2 < nS; t2++) fn.push(ladoPt(j, t2));
          m = add({ id: "FR" + (j + 1), g: "FR", pinI: true, pinJ: true, p0: canto(j), p1: canto(j + 1), nos: fn, lado: j });
        } else {
          var A = hipPt(j, f.d), B = hipPt(j + 1, f.d), tn = []; if (p.caibro) tn.push([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, yD(f.d)]);
          m = add({ id: "T" + (j + 1) + "_" + f.k, g: "T", agua: j, p0: A, p1: B, nos: tn, artic: true, ends: true });
        }
        m.faces = [{ pane: j, ws: ws, wsIn: wsIn }]; m.ws = ws; m.wp = ws / sc; m.d = f.d; m.linha = f.d; m.agua = j;
      });
    }
    /* ---- caibro de meio de água ---- */
    if (p.caibro) for (j = 0; j < n; j++) {
      var a0 = psi(j), cn = [Pn(ap, a0, Hp)]; for (k = 1; k < nH; k++) cn.push(Pn(ap - k * dz, a0, yD(k * dz)));
      if (e > 0) { /* nós: pé no frechal e as linhas de terça */ }
      add({ id: "CB" + (j + 1), g: "CB", agua: j, p0: Pn(ap + e, a0, yD(-e)), p1: [cx, cz, Hap], nos: cn, pinJ: true, pe: Pn(ap, a0, Hp), idx: j });
    }
    /* ---- contraventamento em X (só tração): em cada água, entre linhas de terça, de espigão a espigão; um painel em cada parede ---- */
    var fx = 0, dl = [0]; for (k = 1; k < nH; k++) dl.push(k * dz);
    for (j = 0; j < n; j++) for (k = 0; k + 1 < dl.length; k++) {
      [[j, dl[k], j + 1, dl[k + 1]], [j + 1, dl[k], j, dl[k + 1]]].forEach(function (D4) { add({ id: "DX" + (++fx), g: "DX", agua: j, p0: hipPt(D4[0], D4[1]), p1: hipPt(D4[2], D4[3]), tracao: true, mad: true }); });
    }
    if (!p.vedacaoRigida) { var fxp = 0; for (k = 0; k < n; k++) { var Pa = ladoPt(k, 0), Pb2 = ladoPt(k, 1); [[Pa, Pb2], [Pb2, Pa]].forEach(function (pr) { add({ id: "DP" + (++fxp), g: "DP", p0: [pr[0][0], pr[0][1], p.baseZ], p1: [pr[1][0], pr[1][1], Hp], tracao: true, mad: true }); }); } }
    return { p: p, membros: M, info: { n: n, R: R, lado: p.lado, apotema: ap, beta: be, nH: nH, dz: dz, lp: lp, sc: sc, Hp: Hp, Hap: Hap, incl: i, beiral: e, tipE: e * sc, Rt: Rt, nS: nS, caibro: !!p.caibro, pilarCentral: !!p.pilarCentral, cx: cx, cz: cz, yD: yD, W: Wd,
      cantos: (function () { var o = []; for (var q2 = 0; q2 < n; q2++) o.push(canto(q2)); return o; })(), ang: th, angLado: psi, hipPt: hipPt, area: area, a: 2 * R, b: 2 * R } };
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
  var NOMES = { P: ["Telhado poligonal — pilares", "Pilar do perímetro"], PC: ["Telhado poligonal — pilar central", "Pilar central (sob o cubo do ápice)"], FR: ["Telhado poligonal — frechal (anel)", "Frechal em anel (viga de respaldo; cinta do canto)"],
    E: ["Espigões", "Espigão (viga inclinada na aresta saliente, do canto ao cubo do ápice)"], T: ["Cobertura — terças", "Terça (pontas em bisel no espigão)"], CB: ["Caibros de meio de água", "Caibro de meio de água (do beiral ao cubo do ápice)"],
    DX: ["Contraventamento — águas (madeira)", "Diagonal de madeira em X no plano da água (de espigão a espigão)"], DP: ["Contraventamento — paredes (madeira)", "Diagonal de madeira em X no painel da parede (pilar → frechal)"] };
  var LINEAR = { T: 1, FR: 1, E: 1, CB: 1 };
  /** FONTE: marcas com quantidade; as pontas do espigão e do caibro no cubo, o frechal no canto e as terças junto ao espigão saem APARADAS (folga ≥ 10 mm) */
  function t4Fonte(p, sec, ext2, apar) {
    ext2 = ext2 || {}; var G = t4Geometria(p), lista = Lista(), M = G.membros, I = G.info, marcas = {}, ordem = [], cont = {};
    var nomeClasse = String(ext2.classe || "mlc:GL24h").split(":")[1] || "GL24h";
    function put(k) { ["material", "especificacao", "descricao"].forEach(function (c) { if (typeof k[c] === "string") k[c] = k[c].replace(/GL24h/g, nomeClasse); }); return lista.add(k); }
    if (apar) M = apar.membros;
    M.forEach(function (m) {
      if (!NOMES[m.g]) return;
      var s = sec[m.g] || {}, L = norm(m.p0, m.p1), linear = !!LINEAR[m.g], key = [m.g, rd(L, 3), linear ? m.id : "", JSON.stringify(s), m.bisel ? 1 : 0].join("|");
      if (!marcas[key]) { marcas[key] = { m: m, qtd: 0, sec: s }; ordem.push(key); }
      marcas[key].qtd++;
    });
    ordem.forEach(function (key) {
      var r = marcas[key], m = r.m, nm = NOMES[m.g], s = r.sec, linear = !!LINEAR[m.g], forma = s.forma === "circular" ? { tipo: "circ", d: s.d } : { tipo: "ret", b: s.b, h: s.h }, up = T3.upDe(m);
      cont[m.g] = (cont[m.g] || 0) + 1;
      var k = { id: linear ? m.id : m.g + cont[m.g], marca: m.g, grupo: nm[0], descricao: nm[1], material: MLC, especificacao: "MLC GL24h " + (s.forma === "circular" ? "Ø" + cm(s.d) : cm(s.b) + "×" + cm(s.h)) + " cm", secao: forma, p0: m.p0, p1: m.p1, up: up, qtd: r.qtd };
      if (m.bisel) { k.bisel = m.bisel; k.especificacao += "; pontas aparadas (folga ≥ 10 mm, carga só por chapa + pinos)"; }
      if (m.g === "T") k.especificacao += "; extremidades em bisel de " + rd(90 - 180 / I.n, 1) + "° em planta (assentam no espigão)";
      put(k);
    });
    var nE = M.filter(function (m) { return m.g === "E"; }).length, nCB = M.filter(function (m) { return m.g === "CB"; }).length, nDX = M.filter(function (m) { return m.g === "DX" || m.g === "DP"; }).length;
    if (nE) put({ id: "LIG-ESP", grupo: "Ligações — espigões", descricao: "Espigão × cubo do ápice e espigão × canto (frechal + pilar + cinta): chapa interna + pinos inox + cinta de aço", material: INOX, especificacao: "chapa t = 8 mm + pinos inox; cinta de aço galvanizado no canto", secao: null, qtd: nE * 2 });
    put({ id: "CUBO", grupo: "Ligações — cubo do ápice", descricao: "Cubo de aço do ápice: tubo Ø114,3 × 6,3 com " + (nE + nCB) + " chapas radiais t = 8 mm soldadas (uma por espigão e caibro)", material: GALV, especificacao: "tubo Ø114,3×6,3 + chapas radiais t = 8 mm, solda de oficina", secao: null, qtd: 1 });
    if (nDX) put({ id: "LIG-DX", grupo: "Ligações — contraventamento", descricao: "Pontas das diagonais de madeira do contraventamento: chapa interna de aço + pinos inox (NBR 7190-1:2022, cap. 7)", material: INOX, especificacao: "chapa t = 8 mm + pinos inox, por ponta de diagonal", secao: null, qtd: nDX * 2 });
    return { pecas: lista.pecas, membros: M, info: I };
  }
  function volumePorMaterial(pecas) { return D().MT.volumePorMaterial(pecas); }

  var MadT4 = { PADRAO: T4_PADRAO, parametros: t4Parametros, geometria: t4Geometria, fonte: t4Fonte, upDe: T3.upDe, FOLGA: FOLGA, CUBO: CUBO, NOMES: NOMES, volumePorMaterial: volumePorMaterial, _util: U };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT4;
  else global.MadT4 = MadT4;
})(typeof window !== "undefined" ? window : this);

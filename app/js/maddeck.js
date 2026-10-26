/* =====================================================================
 * maddeck.js — VERIFICAÇÃO ESTRUTURAL da tipologia T7 (DECK ELEVADO + ESCADA + GUARDA-CORPO) em madeira. Motor PURO, ES5, sem DOM, Node-testável. (E4, rodada 6)
 * Antes desta rodada o T7 só gerava peças e orçamento (madtipologias.T7). Aqui cada peça passa por conta, com o mesmo laço de crescimento da T1/T2.
 *
 *   MadDeck.verificar(proj, secoes?)      → resultado com as seções DADAS (mostra o que reprova)
 *   MadDeck.projetar(proj, opcoes)        → laço de crescimento de seção + ligações + auditor + fonte (peças)
 *   MadDeck.memorial(res)                 → linhas de texto do memorial (fórmula → números → resultado)
 *
 * proj = { params: { decks:[…], escada, guardaCorpo:[{onde, L, deck}] }   (a MESMA entrada de MadTipologias.T7.fonte)
 *          classe ("mlc:GL24h"), umidade (4 = deck externo exposto, padrão), limVao (300), limBalanco (150), pesoMLC (kN/m³, 5,0),
 *          tabua { classe ("nativa:D60"), e (0,021), b (0,145), gama (10,0) },
 *          cargas { sobrecarga (2,5 — NBR 6120 Tab. 10), concentrada (1,0 kN — ADOTADA), psi0 (0,7) },
 *          lateral { vento: kN/m² de pressão sobre o guarda-corpo vazado (opcional), topoTravado (false), krBase (kN·m/rad, opcional) },
 *          guardaCorpo { regiao ("V" — a favor da segurança), uso ("privativo"|"coletivo"), h (1,10), montante {b,h,passo,classe}, corrimao {b,h}, regua {b,passo},
 *                        fixacao { d (0,012), z (m), tChapaU, apoio (lado da chapa de apoio, m — null = o motor dimensiona), arruela ("chapa"|"3d") } },
 *          limites { barrote:{hMax}, viga:{hMax}, pilarete:{max}, tabua:[e…] } }
 * FONTES (cópias de consulta, NÃO licenciadas à RA — exemplarLicenciado:false):
 *   NBR 6120:2019  — Tab. 10 balcões/sacadas/varandas/terraços residencial 2,5 kN/m² e SEM carga concentrada ("‒"), p. 18 impr. (PDF 24); escadas residenciais
 *                    privativas 2,5 kN/m², p. 21 (PDF 27); nota j: borda de varanda com guarda-corpo +2 kN/m vertical, nota t: degrau isolado 2,5 kN, p. 26 (PDF 32);
 *                    6.3 / Tab. 12: força horizontal 1,0 kN/m a 1,1 m (áreas privativas, terraços), p. 27–28 (PDF 33–34); 6.4: elemento isolado de cobertura, 1 kN, p. 30 (PDF 36).
 *   NBR 14718:2019 — Tab. 1 (carga de uso e de segurança por região/altura), p. 6 (PDF 12); 4.4.1.1 altura ≥ 1,10 m, p. 8 (PDF 14); 4.4.2.1 vão ≤ 0,11 m, p. 10 (PDF 16);
 *                    4.4.3.1 ancoragem dimensionada, p. 12 (PDF 18); 5.1.1 deslocamento ≤ 25 mm com a carga de uso, 5.1.2 carga de segurança = 1,7 × a de uso, p. 14 (PDF 20);
 *                    5.2 / Anexo B: esforço vertical = carga de segurança, p. 14 e 23 (PDF 20 e 29).
 *   NBR 7190-1:2022 — coeficientes (kmod, φ da Tab. 20 = 2,0 na classe de umidade 4), 6.5 (estabilidade), 7 (ligações), 9.2.1 (arruela ≥ 3d × 0,3d); via madmateriais/maddim7190/madligacoes.
 * Teste: node tools/test-mad-eng-t7.js · conta à mão: docs/madeira/T7-REFERENCIA.md
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var MM = req("MadMateriais", "madmateriais.js"), MD = req("MadDim", "maddim7190.js"), MT = req("MadTipologias", "madtipologias.js"), ML = req("MadLig", "madligacoes.js");
  function opc(nome, arq) { try { return req(nome, arq); } catch (e) { return null; } }
  var AUD = opc("MadAuditor", "madauditor.js");

  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p) / p; }
  function br(x, n) { return (n == null ? x.toFixed(2) : x.toFixed(n)).replace(".", ","); }
  function ext(a) { for (var i = 1; i < arguments.length; i++) for (var k in arguments[i]) if (Object.prototype.hasOwnProperty.call(arguments[i], k)) a[k] = arguments[i][k]; return a; }
  function clone(o) { if (o == null || typeof o !== "object") return o; if (Array.isArray(o)) return o.map(clone); var c = {}; Object.keys(o).forEach(function (k) { c[k] = clone(o[k]); }); return c; }          // cópia profunda que PRESERVA funções (terreno)
  function xy(p) { return [p[0], p[1]]; }
  function dist2(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2)); }

  /* ---------------- NBR 14718:2019, Tabela 1 (p. 6 impr./PDF 12): residencial ou comercial de USO PRIVATIVO e áreas técnicas; N/m [uso, segurança] por região I–V ---------------- */
  var TAB1_PRIV = [
    { pav: 2, alt: 6, I: [400, 680], II: [400, 680], III: [400, 680], IV: [450, 680], V: [500, 800] },
    { pav: 5, alt: 15, I: [400, 680], II: [400, 680], III: [500, 680], IV: [600, 800], V: [800, 1000] },
    { pav: 10, alt: 30, I: [400, 680], II: [400, 680], III: [500, 750], IV: [600, 950], V: [800, 1150] },
    { pav: 20, alt: 60, I: [400, 680], II: [450, 680], III: [600, 900], IV: [750, 1100], V: [900, 1400] },
    { pav: 30, alt: 90, I: [400, 680], II: [500, 750], III: [650, 950], IV: [800, 1200], V: [1000, 1500] }
  ];
  /** carga de uso e de segurança do guarda-corpo (N/m) */
  function cargaGC(g, alturaDeck) {
    var reg = String(g.regiao || "V").toUpperCase(), uso = g.uso || "privativo";
    if (uso === "coletivo") return { uso: 1000, seguranca: 1700, regiao: "I a V", linha: "residencial de uso coletivo/comercial/institucional de médio tráfego (até 2 500 pessoas): 1 000 N/m de uso e 1 700 N/m de segurança — NBR 14718:2019, Tab. 1, p. 6 (PDF 12)", assumida: false };
    var lin = TAB1_PRIV.filter(function (x) { return alturaDeck <= x.alt + 1e-9; })[0] || TAB1_PRIV[TAB1_PRIV.length - 1];
    if (!lin[reg]) throw new Error("maddeck: região " + reg + " inválida (I a V — NBR 10821-2:2017, Fig. 4)");
    return { uso: lin[reg][0], seguranca: lin[reg][1], regiao: reg, assumida: !g.regiao, linha: "residencial/comercial de uso privativo, " + lin.pav + " pavimentos (até " + lin.alt + " m), região " + reg + ": " + lin[reg][0] + " N/m de uso e " + lin[reg][1] + " N/m de segurança — NBR 14718:2019, Tab. 1, p. 6 (PDF 12)" };
  }

  var PADRAO = {
    classe: "mlc:GL24h", umidade: 4, limVao: 300, limBalanco: 150, pesoMLC: 5.0,
    tabua: { classe: "nativa:D60", e: 0.021, b: 0.145, gama: 10.0 },
    cargas: { sobrecarga: 2.5, concentrada: 1.0, psi0: 0.7, gc2: 2.0 },
    lateral: { vento: 0, topoTravado: false, krBase: null, amarracao: { L: null, passo: 0.40, d: 0.012 }, psiVento: 0.6 },
    guardaCorpo: { regiao: null, uso: "privativo", h: 1.10, montante: { b: 0.09, h: 0.09, passo: 1.20, classe: "nativa:D60" }, corrimao: { b: 0.04, h: 0.14 }, regua: { b: 0.04, passo: 0.14 },
      fixacao: { d: 0.012, z: null, tChapaU: 0.006, apoio: null, arruela: "chapa", fu: 500 }, pesoLinear: 0.40 },
    limites: { barrote: { hMax: 0.28 }, viga: { hMax: 0.60, bMax: 0.24 }, pilarete: { max: 0.30 }, pilar: { max: 0.50 }, tabua: [0.021, 0.028, 0.035, 0.045] },
    passo: { altura: 0.04, lado: 0.02 }
  };
  function padrao(proj) {
    var q = {};
    Object.keys(PADRAO).forEach(function (k) { var v = PADRAO[k]; q[k] = (v && typeof v === "object" && !Array.isArray(v)) ? clone(v) : v; });
    Object.keys(proj).forEach(function (k) {
      if (k.charAt(0) === "_") return;
      if (proj[k] && typeof proj[k] === "object" && !Array.isArray(proj[k]) && q[k] && typeof q[k] === "object") {
        q[k] = ext(q[k], proj[k]);
        Object.keys(proj[k]).forEach(function (kk) { var a = PADRAO[k] && PADRAO[k][kk]; if (a && typeof a === "object" && !Array.isArray(a) && proj[k][kk] && typeof proj[k][kk] === "object") q[k][kk] = ext(clone(a), proj[k][kk]); });
      } else q[k] = proj[k];
    });
    if ([1, 2, 3, 4].indexOf(q.umidade) < 0) throw new Error("maddeck: classe de umidade inválida");
    return q;
  }

  /* ---------------- perfis e vigas ---------------- */
  function perfilFn(q) {
    var c = {};
    return function (car, prod) { var k = car + "|" + (prod || ""); return c[k] || (c[k] = MM.perfil2022({ carregamento: car, umidade: q.umidade, produto: "serrada", betaC: prod === "mlc" ? 0.1 : undefined, limVao: q.limVao, limBalanco: q.limBalanco })); };
  }
  function ehMlc(classe) { return /^mlc:/i.test(classe); }
  function vf(o) { return MD.vigaFletida(o); }
  function getR(reac, x) { var k, best = null, bd = 1e9; for (k in reac) { var d = Math.abs(parseFloat(k) - x); if (d < bd) { bd = d; best = reac[k]; } } return bd < 0.02 ? best : [0, 0]; }
  function uniqSorted(a, tol) { var s = a.slice().sort(function (x, y) { return x - y; }), o = []; s.forEach(function (v) { if (!o.length || v - o[o.length - 1] > tol) o.push(v); }); return o; }

  /* interseção de dois segmentos em planta: devolve a posição (m) sobre A e sobre B */
  function inter2D(a0, a1, b0, b1, tolA, tolB) {
    var dx = a1[0] - a0[0], dy = a1[1] - a0[1], ex = b1[0] - b0[0], ey = b1[1] - b0[1], den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) return null;
    var rx = b0[0] - a0[0], ry = b0[1] - a0[1], s = (rx * ey - ry * ex) / den, t = (rx * dy - ry * dx) / den, La = Math.sqrt(dx * dx + dy * dy), Lb = Math.sqrt(ex * ex + ey * ey);
    if (s * La < -tolA || s * La > La + tolA || t * Lb < -tolB || t * Lb > Lb + tolB) return null;
    return { a: Math.min(La, Math.max(0, s * La)), b: Math.min(Lb, Math.max(0, t * Lb)) };
  }
  function posNoSeg(p0, p1, pt, tol) {
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.sqrt(dx * dx + dy * dy), t = ((pt[0] - p0[0]) * dx + (pt[1] - p0[1]) * dy) / (L * L), cx = p0[0] + t * dx, cy = p0[1] + t * dy;
    if (t * L < -tol || t * L > L + tol) return null;
    return dist2([cx, cy], pt) <= tol ? Math.min(L, Math.max(0, t * L)) : null;
  }

  /* ---------------- tábua ---------------- */
  function tabuaVerif(q, P, passo, sec) {
    var T = ext({}, q.tabua), e = sec && sec.e ? sec.e : T.e, b = T.b, qG = T.gama * e * b, qQ = q.cargas.sobrecarga * b, Pc = q.cargas.concentrada, cl = T.classe;
    var r1 = vf({ L: passo, apoios: [0, passo], G: { d: [[0, passo, qG]] }, Q: { d: [[0, passo, qQ]] }, b: b, h: e, classe: cl, perfil: P("longa") });
    var r2 = vf({ L: passo, apoios: [0, passo], G: { d: [[0, passo, qG]] }, Q: { p: [[passo / 2, Pc]] }, b: b, h: e, classe: cl, perfil: ext({}, P("curta"), { phi: 0 }) });          // carga isolada e momentânea: flecha instantânea, sem fluência
    var eta = Math.max(r1.eta, r2.eta);
    return { e: e, b: b, vao: passo, classe: cl, distribuida: r1, concentrada: r2, eta: eta, ok: eta <= 1 + 1e-9, governa: r1.eta >= r2.eta ? "carga distribuída (NBR 6120 Tab. 10)" : "carga concentrada isolada",
      passos: ["Tábua " + br(b * 100, 1) + " × " + br(e * 100, 1) + " cm, " + cl + ", vão entre barrotes " + br(passo) + " m (biapoiada: a favor da segurança). Distribuída: qG = γ·e·b = " + br(qG, 3) + " kN/m, qQ = " + br(q.cargas.sobrecarga) + " kN/m² · b = " + br(qQ, 3) + " kN/m → η = " + br(r1.eta, 3) + " (flexão " + br(r1.eta_flexao, 3) + ", flecha " + br(r1.eta_flecha, 3) + ").",
        "Concentrada isolada Qk = " + br(Pc) + " kN no meio do vão, sem a distribuída (NBR 6120, 6.2, p. 16 impr.; a Tab. 10 não traz carga concentrada para varandas — valor ADOTADO por analogia com a cobertura, 6.4, p. 30): η = " + br(r2.eta, 3) + "."] };
  }

  /* ---------------- guarda-corpo (14718 + 6120) ---------------- */
  function guardaCorpoDados(q, hDeck) {
    var g = q.guardaCorpo, c = cargaGC(g, hDeck), F6120 = 1.0;                 // kN/m, Tab. 12 (áreas privativas / terraços), p. 27 impr. (PDF 33)
    return { c: c, Fseg: c.seguranca / 1000, Fuso: c.uso / 1000, F6120: F6120, Fliga: Math.max(c.seguranca / 1000, F6120) };
  }
  /** montante em balanço + corrimão + réguas (NBR 14718) */
  function guardaCorpoVerif(q, P, dados) {
    var g = q.guardaCorpo, M = g.montante, s = M.passo, h = g.h, out = { dados: dados, itens: [], avisos: [] };
    var Fd = dados.Fseg * s, Md = Fd * h;                                       // carga de segurança já é 1,7 × a de uso → valor de cálculo
    var bar = MD.barra2022({ N: 0, My: Md, Mz: 0, Vy: Fd, Vz: 0, T: 0, b: M.b, h: M.h, L0y: 1, L0z: 1, L1: 0, classe: M.classe, perfil: P("curta") });
    var pf = P("curta"), f = MM.resistencias2022(M.classe, pf), EI = f.E0m * 1e3 * M.b * Math.pow(M.h, 3) / 12;
    var dTop = dados.Fuso * s * Math.pow(h, 3) / (3 * EI) * 1000;               // mm, carga de USO (5.1.1)
    out.montante = { Fd: Fd, Md: Md, eta: bar.eta, ok: bar.ok, governa: bar.governa, passos: ["Montante " + br(M.b * 100, 0) + "×" + br(M.h * 100, 0) + " cm (" + M.classe + ") a cada " + br(s) + " m, h = " + br(h) + " m (NBR 14718, 4.4.1.1, p. 8): " + dados.c.linha + ".",
      "Carga de segurança por montante Fd = " + br(dados.Fseg, 3) + " kN/m × " + br(s) + " m = " + br(Fd, 3) + " kN (já é 1,7 × a de uso, 5.1.2, p. 14: sem γ adicional); Md = Fd·h = " + br(Md, 3) + " kN·m. η da seção = " + br(bar.eta, 3) + " (" + bar.governa + ")."].concat(bar.verif.reduce(function (a, v) { return a.concat(v.passos); }, [])) };
    out.deslocamento = { mm: dTop, limite: 25, eta: dTop / 25, ok: dTop <= 25 + 1e-9, passos: ["Deslocamento do topo com a carga de USO (5.1.1, p. 14): δ = Fu·h³/(3·E·I) = " + br(dados.Fuso * s, 3) + "·" + br(h, 2) + "³/(3·" + br(EI, 1) + ") = " + br(dTop, 1) + " mm ≤ 25 mm → η = " + br(dTop / 25, 3) + " (rigidez da ligação não incluída: ensaio de protótipo, 4.5.1, p. 12)."] };
    var Cm = g.corrimao, Mc = dados.Fseg * s * s / 8, Wc = Cm.h * Cm.b * Cm.b / 6, sc = Mc / Wc / 1e3, fm = MM.resistencias2022(M.classe, pf).fmd, etaC = sc / fm;
    out.corrimao = { eta: etaC, ok: etaC <= 1 + 1e-9, passos: ["Corrimão " + br(Cm.b * 100, 0) + "×" + br(Cm.h * 100, 0) + " cm biapoiado entre montantes (vão " + br(s) + " m): M = F·s²/8 = " + br(Mc, 3) + " kN·m, σ = M/W = " + br(sc, 2) + " MPa ≤ fm,d = " + br(fm, 2) + " MPa → η = " + br(etaC, 3) + "."] };
    var vao = g.regua.passo - g.regua.b;
    out.reguas = { vaoLivre: vao, limite: 0.11, ok: vao <= 0.11 + 1e-9, altura: h, alturaOk: h >= 1.10 - 1e-9, passos: ["Réguas verticais " + br(g.regua.b * 100, 0) + " cm a cada " + br(g.regua.passo * 100, 0) + " cm: vão livre " + br(vao * 100, 1) + " cm ≤ 11 cm (4.4.2.1, p. 10); altura " + br(h) + " m ≥ 1,10 m (4.4.1.1, p. 8)."] };
    return out;
  }

  /** fixação do montante na viga de borda: 2 parafusos passantes em prumo (binário), arruela/chapa de apoio do outro lado, bloqueio entre barrotes */
  function fixacaoVerif(q, P, dados, vigaB, vigaH, hDeckTopoViga, opts) {
    var g = q.guardaCorpo, F = g.fixacao, M = g.montante, s = M.passo, h = g.h, d = F.d, cTop = Math.max(4 * d, 0.05), z = F.z != null ? F.z : Math.min(0.14, vigaH - 2 * cTop);
    var out = { d: d, z: z, passos: [], ok: true, eta: 0 };
    if (!(z >= 3 * d - 1e-9)) { out.ok = false; out.eta = Infinity; out.passos.push("Viga de borda alta demais para 2 parafusos Ø" + br(d * 1000, 0) + ": z = " + br(z * 100, 1) + " cm < 3d."); return out; }
    var pf = P("curta"), pl = P("longa"), cl = MM.classe2022(q.classe), f = MM.resistencias2022(q.classe, pf), fl = MM.resistencias2022(q.classe, pl);
    var Pk = dados.Fliga * s, aUp = hDeckTopoViga + cTop, braco = h + aUp + z, Mfix = Pk * braco, Tup = Mfix / z, Cl = Tup + Pk * 0;       // tração do parafuso de cima; o de baixo comprime a madeira
    var fu = F.fu, As = Math.PI / 4 * Math.pow(d * 1000 * 0.9, 2) /* área resistente ≈ 0,81 da bruta (rosca) */, FtAco = ML.chumbadorFtRd(fu, As, 1.25);
    var fc90 = f.fc90d, Aw3d = Math.PI / 4 * (Math.pow(3 * d * 1000, 2) - Math.pow(d * 1000 + 1, 2));
    var alfa = function (aCm) { return ML.alfaN(aCm); };
    var lado, Aw, Rarr, tReq = null, gv = (g.pesoLinear + q.cargas.gc2) * s * 1.4, Fv = gv / 2, Rk = ML.chapasExternas(d, vigaB, Math.PI / 2, cl.rhok, fu, 0.006, "conifera"), Rvd = Rk * pf.kmod / 1.4;
    function arr(ladoM) { var A = ladoM === "3d" ? Aw3d : Math.pow(ladoM * 1000, 2) - Math.pow(d * 1000 + 1, 2), aCm = ladoM === "3d" ? 3 * d * 100 : ladoM * 100; return { A: A, R: Math.min(fc90 * alfa(aCm), 0.25 * f.fc0d * alfa(aCm)) * A / 1000, aCm: aCm }; }
    function inter(a) { return Tup / Math.min(a.R, FtAco) + Fv / Rvd; }
    if (F.arruela === "3d") { lado = "3d"; var a3 = arr("3d"); Aw = a3.A; Rarr = a3.R; }
    else {
      lado = F.apoio != null ? F.apoio : null;
      if (lado == null) { for (var l = 0.05; l <= 0.30001; l += 0.01) { if (inter(arr(l)) <= 1 + 1e-9) { lado = r(l, 2); break; } } if (lado == null) lado = 0.30; }
      var aa = arr(lado); Aw = aa.A; Rarr = aa.R;
    }
    var nN = 1, TupP = Tup / nN, etaArr = TupP / Rarr, etaAco = TupP / FtAco;
    // espessura da chapa de apoio (flexão da faixa em balanço, aço fy 250/1,1)
    if (lado !== "3d") { var pBear = TupP * 1000 / Aw, cc = (lado * 1000 - d * 1000 - 2) / 2; tReq = cc * Math.sqrt(3 * pBear / (250 / 1.1)); }
    // cortante vertical (guarda-corpo + sobrecarga de borda, nota j da Tab. 10) nos parafusos, chapas externas (aço–madeira–aço)
    var etaV = Fv / Rvd, inter = Math.max(TupP / Math.min(Rarr, FtAco) + Fv / Rvd, 0), etaT = Math.max(etaArr, etaAco, inter);
    var Mt = Pk * (h + aUp + z / 2), zb = opts && opts.hBarrote || 0.16, Fb = Mt / zb, WT = ML.PARAFUSOS["WT-T-8,2"], RAX = ML.roscaRaxd({ Rk_ref: WT.RaxK_cruzado150, lefRef: WT.lefRef, lefA: 100, lefB: 100, kmod: pf.kmod }).Rd, nBl = Math.max(2, Math.ceil(Fb / RAX)), etaBl = Fb / (nBl * RAX);
    out.passos = [
      "Fixação do montante (NBR 14718, 4.4.3.1, p. 12: ancoragem dimensionada para o desempenho): maior entre a carga de segurança (" + br(dados.Fseg, 3) + " kN/m) e a força da NBR 6120 Tab. 12 (" + br(dados.F6120, 1) + " kN/m a 1,1 m, p. 27) = " + br(dados.Fliga, 3) + " kN/m × " + br(s) + " m = " + br(Pk, 3) + " kN por montante, aplicada a " + br(h) + " m.",
      "Binário nos 2 parafusos Ø" + br(d * 1000, 0) + " em prumo (z = " + br(z * 100, 1) + " cm, parafuso de cima a " + br(aUp * 100, 1) + " cm abaixo do piso): M = Pk·(h + a + z) = " + br(Pk, 3) + "·" + br(braco, 3) + " = " + br(Mfix, 3) + " kN·m; tração do parafuso de cima T = M/z = " + br(Tup, 2) + " kN.",
      "Arruela/chapa de apoio do lado oposto: " + (lado === "3d" ? "arruela mínima 3d = " + br(3 * d * 1000, 0) + " mm (9.2.1, p. 80 impr.)" : "chapa " + br(lado * 1000, 0) + " × " + br(lado * 1000, 0) + " mm") + ", A = " + br(Aw, 0) + " mm²; embutimento ⊥ à fibra Rd = min(fc90,d; 0,25·fc0,d)·αn·A = " + br(Rarr, 2) + " kN → η = " + br(etaArr, 3) + (tReq != null ? "; espessura mínima da chapa " + br(tReq, 1) + " mm (adotar ≥ 8 mm)." : "."),
      "Tração do aço: Ft,Rd = 0,9·fu·As/γ = " + br(FtAco, 2) + " kN → η = " + br(etaAco, 3) + ". Cortante vertical por parafuso (peso do guarda-corpo + 2 kN/m da nota j, p. 26): Fv = " + br(Fv, 2) + " kN ≤ Rd = " + br(Rvd, 2) + " kN (chapas externas, 7.3) → η = " + br(etaV, 3) + "; interação linear Ft/Rt + Fv/Rv = " + br(inter, 3) + ".",
      "Bloqueio entre barrotes na linha do montante (torção da viga de borda): Mt = " + br(Mt, 2) + " kN·m, F = Mt/hb = " + br(Fb, 2) + " kN → " + nBl + " parafusos de rosca total (Rax,d = " + br(RAX, 2) + " kN) → η = " + br(etaBl, 3) + "."];
    out.eta = Math.max(etaT, etaBl); out.ok = out.eta <= 1 + 1e-9;
    ext(out, { Pk: Pk, T: Tup, M: Mfix, lado: lado, apoioA: Aw, Rarr: Rarr, etaArr: etaArr, etaAco: etaAco, etaV: etaV, inter: inter, tChapaReq_mm: tReq, bloqueio: { F: Fb, n: nBl, eta: etaBl }, nMontante: null });
    return out;
  }

  /** vento NA COTA z (NBR 6123 pelo acovento): q = 0,613·(V0·S1·S2·S3)² — V0 do mapa de isopletas (ou informado), S1 do terreno (pode variar com z), S2 pela categoria/classe e a altura z, S3 do grupo da obra.
   *  Devolve null quando a entrada de vento da obra não está completa (aí vale a pressão informada à mão, se houver). E4 r8: o deck NÃO usa mais pressão fixa. */
  function ventoNaCota(q, z, dimFrontal) {
    var v = q.vento, VE = opc("AcoVento", "acovento.js"); if (!v || !VE) return null;
    var loc = v.local || {}, v0 = Number(loc.v0), origem = "informado", iso = null;
    if (!isFinite(v0) || loc.v0 == null || loc.v0 === "") {
      v0 = NaN; iso = opc("AcoIsopletas", "acoisopletas.js");
      var lat = Number(loc.lat), lon = Number(loc.lon);
      if (iso && typeof iso.v0 === "function" && loc.lat != null && loc.lon != null && isFinite(lat) && isFinite(lon)) { try { var m = iso.v0(lat, lon); if (m && isFinite(m.v0Adotado)) { v0 = m.v0Adotado; origem = "mapa de isopletas (" + br(lat, 3) + "; " + br(lon, 3) + ")"; } } catch (e) { v0 = NaN; } }
    }
    var cat = String(v.categoria || "").toUpperCase(), g3 = Number(v.grupoS3 || 2);
    if (!isFinite(v0) || !cat) return null;
    var classe = VE.classePorDimensao(dimFrontal), s1 = VE.fatorS1(v.s1 || { tipo: "plano" }, z), s2 = VE.fatorS2(cat, classe, z), s3 = VE.fatorS3(g3);
    if (!s1 || s1.erro || !s2 || !s3) return null;
    var vk = v0 * s1.valor * s2.valor * s3.valor, qv = 0.613 * vk * vk / 1000;
    return { q: qv, v0: v0, s1: s1.valor, s2: s2.valor, s3: s3.valor, vk: vk, z: z, classe: classe, categoria: cat, grupoS3: g3, origem: origem,
      texto: "V0 = " + br(v0, 1) + " m/s (" + origem + "); S1 = " + br(s1.valor, 3) + "; S2 = " + br(s2.valor, 3) + " (categoria " + cat + ", classe " + classe + ", z = " + br(z, 2) + " m do terreno ao topo do guarda-corpo/pilarete); S3 = " + br(s3.valor, 2) + " (grupo " + g3 + "); Vk = " + br(vk, 1) + " m/s; q = 0,613·Vk² = " + br(qv, 3) + " kN/m² (NBR 6123:1988 — conferir na 2023)" };
  }
  /** E4 r10 (R34): pilar engastado na base com TOPO PRESO AO DECK por mão-francesa (pórtico de balanço lateral livre): o topo translada com o deck e gira contra uma MOLA DE ROTAÇÃO Kθ = k·c²/2 (k = rigidez axial da mão-francesa em SÉRIE com o deslizamento dos parafusos das duas pontas, Ku = 2/3·Kser; c = afastamento horizontal da ponta). 
   *  Equilíbrio (equações de inclinação, base engastada, topo com mola): M_base/(H·h) = (K + a/2)/(2K + a/2), a = 4EI/h  (K = 0 → 1: balanço; K → ∞ → 1/2). Flambagem com deslocamento do topo livre: tan ν = −ν/κ, κ = K·h/EI, β = π/ν (K = 0 → 2; K → ∞ → 1).
   *  Premissa DECLARADA: a rotação da viga no apoio é restringida pelo conjunto viga + barrotes + tábuas (não verificada aqui); a base é rígida (a rigidez da base só aumenta o momento do topo, a favor). */
  function portico(EI, h, K) {
    var a = 4 * EI / h, razao = (K + a / 2) / (2 * K + a / 2), kap = K * h / EI, lo = Math.PI / 2, hi = Math.PI, f = function (v) { return Math.tan(v) + v / kap; }, m, i;
    if (!(kap > 1e-9)) return { razao: 1, beta: 2, nu: Math.PI / 2, kappa: 0 };
    for (i = 0; i < 80; i++) { m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
    return { razao: razao, beta: Math.PI / ((lo + hi) / 2), nu: (lo + hi) / 2, kappa: kap };
  }
  /* ---------------- E4 r13 (A3): coeficiente de arrasto e fator de proteção da NBR 6123:1988, lidos NA IMAGEM (p. 27 e 29 impr.) ----------------
   * Fig. 6 (7.5, p. 27): Ca de RETICULADO PLANO de barras prismáticas de cantos vivos, em função do índice de área exposta φ = Ae/A: vértices lidos (0; 2,0) (0,2; 1,8) (0,3; 1,7) (0,5; 1,6) (0,7; 1,6) (0,9; 1,8) (1,0; 2,0).
   * Fig. 8 (7.6, p. 29): fator de proteção η do reticulado de SOTAVENTO (n reticulados iguais e paralelos: Ca,n = Ca,1·[1 + (n − 1)·η]); em φ ≥ 0,6 η depende só de e/h: ≤ 0,5 → 0,2; 1 → 0,3; 2 → 0,4; 3 → 0,5; 4 → 0,6; 5 → 0,7; 6 → 0,8; ≥ 7 → 1,0;
   * em φ < 0,6 a reta liga (0; 1,1) a (0,6; η_c), limitada a 1,0 (entre e/h = 6 e 7 a interpolação é linear: ADOÇÃO). Chapa maciça = φ = 1 da Fig. 6 (Ca = 2,0): limite superior, a favor da segurança. */
  var FIG6 = [[0, 2.0], [0.2, 1.8], [0.3, 1.7], [0.5, 1.6], [0.7, 1.6], [0.9, 1.8], [1.0, 2.0]], FIG8_E_H = [[0.5, 0.2], [1, 0.3], [2, 0.4], [3, 0.5], [4, 0.6], [5, 0.7], [6, 0.8], [7, 1.0]];
  function interpTab(tab, x) { var i; if (x <= tab[0][0]) return tab[0][1]; for (i = 1; i < tab.length; i++) if (x <= tab[i][0]) return tab[i - 1][1] + (tab[i][1] - tab[i - 1][1]) * (x - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]); return tab[tab.length - 1][1]; }
  function caFig6(phi) { return interpTab(FIG6, Math.min(1, Math.max(0, phi))); }
  function etaFig8(phi, eh) { var ec = interpTab(FIG8_E_H, eh), f = Math.min(1, Math.max(0, phi)); return f >= 0.6 ? ec : Math.min(1, 1.1 - (1.1 - ec) * f / 0.6); }
  /** força horizontal sobre o deck: pessoas no guarda-corpo (NBR 6120, Tab. 12: 1,0 kN/m) e vento (q da NBR 6123 NA COTA do topo do guarda-corpo/pilarete; Ca do guarda-corpo vazado pela Fig. 6 da NBR 6123 (φ), trecho de sotavento pela Fig. 8, faixa lateral do deck como placa (Ca = 2,0), pilaretes Ca = 1,0 adotado); combinação: o maior entre Hg + ψ0,v·Hv e Hv + ψ0,q·Hg */
  function forcaHoriz(q, GC, d, bb) {
    var g = q.guardaCorpo, Hg = GC.Lmax * 1.0, Hw = 0, Agc = 0, Adeck = 0, Apil = 0, prof = (d.tabua || q.tabua.e) + bb.hBarr + bb.hViga, Ldir = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY), phi = g.regua.b / g.regua.passo;
    var hPilMax = 0; (bb.pils || []).forEach(function (pl) { var hh = pl.h_livre != null ? pl.h_livre : Math.abs(pl.p1[2] - pl.p0[2]), dd = pl.secao.tipo === "circ" ? pl.secao.d : Math.max(pl.secao.b, pl.secao.h); hPilMax = Math.max(hPilMax, hh); Apil += hh * dd; });
    var zTopo = hPilMax + prof + (GC.temGC ? g.h : 0), vc = ventoNaCota(q, zTopo, Math.max(Ldir, zTopo)), qv = vc ? vc.q : (q.lateral.vento || 0), origemQ = vc ? "NBR 6123 (acovento)" : (qv > 0 ? "pressão informada" : "");
    var phiGC = Math.min(1, ((g.h - g.corrimao.h) * phi + g.corrimao.h) / g.h), CaGC = GC.temGC ? caFig6(phiGC) : 0, etaGC = (GC.temGC && (GC.n || 1) >= 2) ? etaFig8(phiGC, Ldir / g.h) : 0, CaDeck = caFig6(1.0), nGC = etaGC > 0 ? 2 : 1;
    if (qv > 0) { Agc = GC.temGC ? GC.Lmax * (g.h * phi + g.corrimao.h) : 0; Adeck = Ldir * prof; Hw = qv * (CaGC * (1 + etaGC) * Agc + CaDeck * Adeck); }
    var c1 = Hg + q.lateral.psiVento * Hw, c2 = Hw + q.cargas.psi0 * Hg, H = Hw > 0 ? Math.max(c1, c2) : Hg, Hpil = qv > 0 ? qv * Apil : 0;
    var vtxt = qv <= 0 ? "; vento NÃO considerado." : "; vento: " + (vc ? vc.texto : "pressão informada " + br(qv) + " kN/m²") + "; coeficiente de arrasto pela NBR 6123:1988, 7.5, Fig. 6 (p. 27, lida na imagem): guarda-corpo vazado com índice de área exposta φ = Ae/A = " + br(phiGC, 3) + " → Ca = " + br(CaGC, 2) + (nGC > 1 ? "; trecho de SOTAVENTO paralelo pela 7.6/Fig. 8 (p. 29): e/h = " + br(Ldir / g.h, 1) + ", η = " + br(etaGC, 2) + " → Ca,2 = Ca·(1 + η) = " + br(CaGC * (1 + etaGC), 2) : "; um só trecho de guarda-corpo declarado (sem sotavento)") + "; faixa lateral do deck tratada como placa maciça (φ = 1 da Fig. 6, Ca = " + br(CaDeck, 2) + ": limite superior, a favor da segurança) sobre o guarda-corpo vazado (" + br(Agc, 1) + " m²) e a faixa lateral (" + br(Adeck, 1) + " m²): Hv = " + br(qv, 3) + " × (" + br(CaGC * (1 + etaGC), 2) + " × " + br(Agc, 1) + " + " + br(CaDeck, 2) + " × " + br(Adeck, 1) + ") = " + br(Hw, 2) + " kN no nível do deck; combinação: máx(Hg + " + br(q.lateral.psiVento, 1) + "·Hv; Hv + " + br(q.cargas.psi0, 1) + "·Hg) = " + br(H, 2) + " kN (ψ0 do vento 0,6 adotado, NBR 8681:2003 — tabela não conferida na biblioteca). Vento nos próprios pilaretes (Ca = 1,0 ADOTADO, sem figura da norma para o prisma isolado: a confirmar pelo RT; área " + br(Apil, 1) + " m²): " + br(Hpil, 2) + " kN, aplicado a meia altura de cada pilarete (momento na base = força × h/2; metade da força vai ao topo, às mãos-francesas/amarração)";
    return { Hg: Hg, Hw: Hw, CaGC: CaGC, etaGC: etaGC, CaDeck: CaDeck, phiGC: phiGC, qv: qv, Agc: Agc, Adeck: Adeck, Apil: Apil, zTopo: zTopo, vento: vc, origemQ: origemQ, Hpil: Hpil, c1: c1, c2: c2, H: H, passos: ["Força horizontal no deck " + d.id + ": pessoas no guarda-corpo Hg = 1,0 kN/m × " + br(GC.Lmax) + " m = " + br(Hg, 2) + " kN (NBR 6120:2019, Tab. 12, p. 27)" + vtxt] };
  }
  /** amarração do deck à edificação: a horizontal H vai aos chumbadores/parafusos da linha de amarração (tração no parafuso, chapa de apoio na viga de borda) — o arrancamento no substrato é da edificação */
  function amarracaoVerif(q, P, d, Hi, bb, vigs) {
    var am = q.lateral.amarracao, Lled = am.L != null ? am.L : Math.max(0.5, Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY)), s = am.passo, dd = am.d, n = Math.max(2, Math.ceil(Lled / s) + 1), Hd = 1.4 * Hi.H, Tb = Hd / n;
    var pc = P("curta", "mlc"), f = MM.resistencias2022(q.classe, pc), fu = q.guardaCorpo.fixacao.fu, As = Math.PI / 4 * Math.pow(dd * 1000 * 0.9, 2), Ft = ML.chumbadorFtRd(fu, As, 1.25), bV = vigs.length ? vigs[0].secao.b : 0.12;
    function Rar(l) { var A = Math.pow(l * 1000, 2) - Math.pow(dd * 1000 + 1, 2), aCm = l * 100; return Math.min(f.fc90d * ML.alfaN(aCm), 0.25 * f.fc0d * ML.alfaN(aCm)) * A / 1000; }
    var lado = null; for (var l = 0.05; l <= 0.30001; l += 0.01) { if (Tb <= Rar(l) + 1e-9) { lado = r(l, 2); break; } } if (lado == null) lado = 0.30;
    var Rr = Rar(lado), eta = Math.max(Tb / Ft, Tb / Rr);
    return { L: Lled, passo: s, n: n, d: dd, Hd: Hd, Tb: Tb, FtRd: Ft, lado: lado, Rarr: Rr, eta: eta, ok: eta <= 1 + 1e-9, premissaL: am.L == null,
      passos: ["Amarração à edificação (deck " + d.id + "): a horizontal H = " + br(Hi.H, 2) + " kN (Hd = 1,4·H = " + br(Hd, 2) + " kN) é levada à edificação por " + n + " parafusos/chumbadores Ø" + br(dd * 1000, 0) + " em linha de " + br(Lled) + " m a cada " + br(s) + " m" + (am.L == null ? " (comprimento da linha ADOTADO = menor lado do deck: a confirmar pelo RT)" : "") + " → tração por parafuso " + br(Tb, 2) + " kN.",
        "Aço: Ft,Rd = 0,9·fu·As/γ = " + br(Ft, 2) + " kN (fu = " + fu + " MPa adotado, sem fonte) → η = " + br(Tb / Ft, 3) + "; chapa de apoio " + br(lado * 1000, 0) + " × " + br(lado * 1000, 0) + " mm na viga de borda (embutimento ⊥ à fibra, Rd = " + br(Rr, 2) + " kN) → η = " + br(Tb / Rr, 3) + ". O arrancamento no substrato (parede/viga da edificação) é verificado pelo projeto da edificação (outra empresa); a ligação não leva carga vertical (o deck apoia nos pilaretes)."] };
  }

  /* ---------------- chumbadores da base (extraído do pacoteLigacoes na r11: o contraventamento precisa da Kθ da MESMA ligação) ---------------- */
  var CH_CAT = [[12, 84.3], [16, 157], [20, 245], [24, 353]], CH_NS = [4, 6, 8];
  /** eng = base engastada; Mb (kN·m, de cálculo), z (braço, m), Nmin (kN, COM SINAL: compressão +, arrancamento −), Vd (kN, de cálculo, no pé do pilar). Cresce o diâmetro e o número até fechar. Kθ = n_tracionados·E·As/L_ef·z² (M2; L_ef 0,22 m adotado) */
  function selChumb(eng, Mb, z, Nmin, Vd) {
    var sel = null, k1, k2, dC, AsC, nC, Tc, Vc, Ftr, Fvr, e3, TL, VL;
    for (k1 = 0; k1 < CH_CAT.length && !sel; k1++) for (k2 = 0; k2 < CH_NS.length && !sel; k2++) {
      dC = CH_CAT[k1][0]; AsC = CH_CAT[k1][1]; nC = CH_NS[k2]; Tc = eng ? Math.max(0, Mb / z - Nmin / 2) / (nC / 2) : 0; Vc = Vd / nC; Ftr = ML.chumbadorFtRd(500, AsC); Fvr = ML.chumbadorFvRd(500, Math.PI / 4 * dC * dC); e3 = Math.max(Tc / Ftr + Vc / Fvr, 0);
      if (e3 <= 1 + 1e-9) sel = { d: dC, As: AsC, n: nC, Tch: Tc, Vch: Vc, FtRd: Ftr, FvRd: Fvr, eta: e3 };
    }
    if (!sel) { dC = CH_CAT[CH_CAT.length - 1]; nC = CH_NS[CH_NS.length - 1]; TL = eng ? Math.max(0, Mb / z - Nmin / 2) / (nC / 2) : 0; VL = Vd / nC; Ftr = ML.chumbadorFtRd(500, dC[1]); Fvr = ML.chumbadorFvRd(500, Math.PI / 4 * dC[0] * dC[0]); sel = { d: dC[0], As: dC[1], n: nC, Tch: TL, Vch: VL, FtRd: Ftr, FvRd: Fvr, eta: Math.max(TL / Ftr + VL / Fvr, 0), semSolucao: true }; }
    sel.Ktheta = eng ? ML.kthetaChumbadores({ n: sel.n / 2, As: sel.As * 1e-6, lp: z + 0.10 }).Ktheta : 0;
    return sel;
  }

  /* ---------------- E4 r11 (R34): CONTRAVENTAMENTO EM X entre pilares altos (> 3 m), nas duas direções ----------------
   * Quadro = dois pilares vizinhos + viga + um X da base à viga (nós a zNo0 do pé e zNo1 do topo). Padrão: diagonais de MLC (SÓ TRAÇÃO no modelo: a diagonal comprimida é esbelta e NÃO é creditada; comprimento 6–8 m) ou
   * tirantes inox com esticador (só tração, pré-tensionados). O cortante do quadro V (ELU) = (H/nQuadros + metade do vento nos pilares do quadro) vira tração Fd = V/cosθ na diagonal e um binário vertical ±V·tgθ nos pilares
   * (compressão a mais num, arrancamento no outro). Rigidez: o K do quadro (EA/L em série com o deslizamento dos pinos, ×cos²θ) por pilar tem de superar K_br,min = 2·αm·π²·E0,ef·I/h³ com αm = 1 + cos(π/m), m = 2
   * (um travamento no topo; analogia à Tabela 9 / 6.6.2 da NBR 7190-1:2022 — ADOÇÃO a confirmar pelo RT). Só então o topo do pilar é tratado como travado (engastado-apoiado). */
  var CV_SEC = [[0.12, 0.20], [0.12, 0.24], [0.14, 0.24], [0.16, 0.24], [0.16, 0.28], [0.18, 0.28], [0.20, 0.30], [0.20, 0.36]];
  var CV_TIR = [[0.016, 157], [0.020, 245], [0.024, 353]];
  function cvAnalise(q, P, d, cvs, pils, Hinfo, cl, pilReac) {
    var tirante = /-CVT\d+$/.test(cvs[0].id), pc = P("curta", "mlc"), fm = MM.resistencias2022(cl, pc), clM = MM.classe2022(cl), Eef = MD.perfilEResist(cl, pc).f.Eef, tCh = 0.008, cfgL = ext({}, ML.PADRAO, { kmod: pc.kmod, rhok: clM.rhok });
    var dirs = { X: {}, Y: {} }, qv = Hinfo.qv || 0, pl0 = pils[0], circ = pl0.secao.tipo === "circ", dPil = circ ? pl0.secao.d : Math.max(pl0.secao.b, pl0.secao.h), hPil = pl0.h_livre != null ? pl0.h_livre : Math.abs(pl0.p1[2] - pl0.p0[2]);
    var clP = (d.pilar && d.pilar.classe) || "nativa:D40", cfgP = ext({}, ML.PADRAO, { kmod: pc.kmod, rhok: MM.classe2022(clP).rhok || clM.rhok }), Hown = qv > 0 ? qv * dPil * hPil : 0;
    cvs.forEach(function (c) {
      var dx = Math.abs(c.p1[0] - c.p0[0]), dy = Math.abs(c.p1[1] - c.p0[1]), dir = dx >= dy ? "X" : "Y", key = r(dir === "X" ? c.p0[1] : c.p0[0], 2), fr = dirs[dir][key];
      if (!fr) fr = dirs[dir][key] = { dir: dir, key: key, diag: [], span: Math.max(dx, dy), hc: Math.abs(c.p1[2] - c.p0[2]), Ld: c.comprimento_m };
      fr.diag.push(c);
    });
    var quadros = []; ["X", "Y"].forEach(function (dir) { var ks = Object.keys(dirs[dir]); ks.forEach(function (k) { var fr = dirs[dir][k]; fr.nQ = ks.length; fr.nPil = pils.filter(function (pl) { return Math.abs((dir === "X" ? pl.p0[1] : pl.p0[0]) - fr.key) < 0.06; }).length; quadros.push(fr); }); });
    /* M6 (r14): a horizontal H NÃO se divide igualmente entre os quadros: cada quadro leva a sua faixa TRIBUTÁRIA (metade da distância aos quadros vizinhos; os de borda, metade da faixa) e nunca menos que a divisão igual (1/nQ) — o quadro de borda recebe o guarda-corpo e o vento da borda, o interno mais afastado recebe mais área. O tabuado de fixação oculta não é diafragma. */
    ["X", "Y"].forEach(function (dir) { var ks = Object.keys(dirs[dir]).map(function (k) { return parseFloat(k); }).sort(function (u, v) { return u - v; }), n = ks.length, ws = ks.map(function (k, i) { return n < 2 ? 1 : ((i > 0 ? k - ks[i - 1] : 0) + (i < n - 1 ? ks[i + 1] - k : 0)) / 2; }), sw = ws.reduce(function (s, v) { return s + v; }, 0) || 1;
      ks.forEach(function (k, i) { var fr = dirs[dir][r(k, 2)] || dirs[dir][String(k)]; if (!fr) { Object.keys(dirs[dir]).forEach(function (kk) { if (Math.abs(parseFloat(kk) - k) < 1e-9) fr = dirs[dir][kk]; }); } if (fr) fr.share = Math.max(1 / n, ws[i] / sw); }); });
    var b = tirante ? 0 : cvs[0].secao.b, h = tirante ? 0 : cvs[0].secao.h, dRod = tirante ? (cvs[0].d_tirante || 0.016) : 0, AsRod = tirante ? (CV_TIR.filter(function (x) { return Math.abs(x[0] - dRod) < 1e-6; })[0] || CV_TIR[0])[1] : 0;
    var NdP = pils.reduce(function (m, pl) { var rc = pilReac && pilReac[pl.id] || { NG: 0, NQ: 0 }, hh = pl.h_livre != null ? pl.h_livre : Math.abs(pl.p1[2] - pl.p0[2]), Ap = pl.secao.tipo === "circ" ? Math.PI * pl.secao.d * pl.secao.d / 4 : pl.secao.b * pl.secao.h; return Math.max(m, 1.4 * (rc.NG + rc.NQ + Ap * hh * q.pesoMLC)); }, 0);      /* A2 (r13, NBR 7190-1:2022 6.6.4: "os seus efeitos devem ser acrescidos"): força de travamento F1d = Nd/150 por pilar travado, SOMADA ao cortante do quadro */
    var gov = null, qres = [], I = circ ? Math.PI * Math.pow(dPil, 4) / 64 : dPil * Math.pow(dPil, 3) / 12, EIcl = MM.classe2022(clP), EefP = MD.perfilEResist(clP, P("curta")).f.Eef, Kreq = 2 * (1 + Math.cos(Math.PI / 2)) * Math.PI * Math.PI * EefP * 1e3 * I / Math.pow(hPil, 3), Nov = 0, Vmax = 0;
    quadros.forEach(function (fr) {
      var F1dQ = fr.nPil * NdP / 150, shareQ = fr.share != null ? fr.share : 1 / fr.nQ, Vf = 1.4 * (Hinfo.H * shareQ + 0.5 * Hown * fr.nPil) + F1dQ, cosT = fr.span / fr.Ld, tgT = fr.hc / fr.span, Fd = Vf / cosT, o = { F1d: F1dQ, dir: fr.dir, chave: fr.key, vao: fr.span, altura: fr.hc, Ld: fr.Ld, theta: Math.atan(tgT) * 180 / Math.PI, nPilares: fr.nPil, nQuadros: fr.nQ, share: shareQ, V: Vf, Fd: Fd, Nov: Vf * tgT };
      Nov = Math.max(Nov, o.Nov); Vmax = Math.max(Vmax, Vf);
      var etaT, kAx, kDesl = Infinity, pn = null, Kf, chap;
      if (tirante) {
        var FtR = ML.chumbadorFtRd(500, AsRod, 1.25); etaT = Fd / FtR; kAx = 2e8 * AsRod * 1e-6 / fr.Ld; o.FtRd = FtR;
        pn = ML.pinosAxiais(cfgP, "ligação do tirante ao pilar (chapa/olhal inox 8 mm + parafusos passantes)", Fd * Math.sin(Math.atan(tgT)), Fd * cosT, dPil, dPil, tCh); chap = { eta: 0 };
        o.ligPilar = pn; o.ligDiag = null;
      } else {
        var ft0d = fm.ft0d, pnD = ML.pinosAxiais(cfgL, "ligação da diagonal DI-CV (chapa interna 8 mm + pinos)", Fd, 0.001, b, h, tCh), nPn = pnD && pnD.n ? pnD.n : 0, dPn = pnD && pnD.d ? pnD.d : 0.012, ncP = pnD && pnD.nc ? pnD.nc : 2;
        var Anet = (b - 0.010) * h - ncP * dPn * (b - 0.010); etaT = Fd / (Anet * 1e3) / ft0d; kAx = Eef * 1e3 * b * h / fr.Ld;
        var Ku = ML.kuPino(dPn, clM.rhok, true); kDesl = nPn > 0 ? nPn * Ku / 2 : 1e-9;
        chap = { Rd: tCh * Math.max(0.03, h - 0.05) * cfgL.fy * 1e3 / cfgL.gamaA1 }; chap.eta = Fd / chap.Rd;
        pn = ML.pinosAxiais(cfgP, "ligação da diagonal ao pilar roliço (chapa 8 mm + parafusos passantes)", Fd * Math.sin(Math.atan(tgT)), Fd * cosT, dPil, dPil, tCh);
        o.ligDiag = pnD; o.ligPilar = pn; o.Anet = Anet; o.ft0d = ft0d; o.chapa = chap;
      }
      var kF = 1 / (1 / kAx + (isFinite(kDesl) ? 1 / kDesl : 0)); Kf = kF * cosT * cosT; o.Kf = Kf; o.KporPilar = Kf / Math.max(1, fr.nPil); o.Kreq = Kreq; o.etaK = Kreq / o.KporPilar; o.etaTracao = etaT;
      o.eta = Math.max(etaT, o.etaK, o.ligDiag ? o.ligDiag.eta : 0, o.ligPilar ? o.ligPilar.eta : 0, chap.eta);
      if (!gov || o.eta > gov.eta) gov = o; qres.push(o);
    });
    var credito = gov.etaK <= 1 + 1e-9 && gov.eta <= 1 + 1e-9;
    var txt = [tirante ? "Contraventamento em X (tirantes inox Ø" + br(dRod * 1000, 0) + " mm com esticador, SÓ TRAÇÃO, pré-tensionados) em " + quadros.length + " quadros pilar–viga–pilar (" + quadros.filter(function (x) { return x.dir === "X"; }).length + " ao longo de X, " + quadros.filter(function (x) { return x.dir === "Y"; }).length + " ao longo de Y)."
      : "Contraventamento em X (diagonais de MLC " + br(b * 100, 0) + "×" + br(h * 100, 0) + " cm, SÓ TRAÇÃO no modelo: a diagonal comprimida é esbelta e não é creditada) em " + quadros.length + " quadros pilar–viga–pilar (" + quadros.filter(function (x) { return x.dir === "X"; }).length + " ao longo de X, " + quadros.filter(function (x) { return x.dir === "Y"; }).length + " ao longo de Y); nós a 0,40 m do pé e do topo."];
    qres.forEach(function (o) {
      txt.push("Quadro " + o.dir + " (cota " + br(o.chave, 2) + "): vão " + br(o.vao, 2) + " m, altura entre nós " + br(o.altura, 2) + " m, diagonal L = " + br(o.Ld, 2) + " m a " + br(o.theta, 1) + "°; cortante do quadro Vd = 1,4·(H·" + br(o.share, 3) + " [faixa tributária, mín. 1/" + o.nQuadros + "] + ½·Hpilar·" + o.nPilares + ") + F1d = " + br(o.V - o.F1d, 2) + " + " + br(o.F1d, 2) + " (força de travamento Nd/150 dos " + o.nPilares + " pilares, NBR 7190-1:2022 6.6.4) = " + br(o.V, 2) + " kN → tração na diagonal Fd = Vd/cosθ = " + br(o.Fd, 2) + " kN; binário vertical nos pilares ±Vd·tgθ = ±" + br(o.Nov, 2) + " kN.");
      txt.push("  " + (tirante ? "Tirante: Ft,Rd = 0,9·fu·As/γ = " + br(o.FtRd, 1) + " kN → η = " + br(o.etaTracao, 3) : "Tração na diagonal (área líquida " + br(o.Anet * 1e4, 0) + " cm² = (b − fenda 10 mm − furos)·h; ft0,d = " + br(o.ft0d, 2) + " MPa) → η = " + br(o.etaTracao, 3) + "; chapa de aço t = 8 mm: Rd = " + br(o.chapa.Rd, 1) + " kN → η = " + br(o.chapa.eta, 3)) + ". Rigidez do quadro (EA/L em série com o deslizamento dos pinos, ×cos²θ) K = " + br(o.Kf, 0) + " kN/m = " + br(o.KporPilar, 0) + " kN/m por pilar × K_br,min = 2·αm·π²·E0,ef·I/h³ = " + br(o.Kreq, 0) + " kN/m (αm = 1 + cos(π/2) = 1; m = 2, analogia à Tab. 9, 6.6.2 — a confirmar pelo RT) → η = " + br(o.etaK, 3) + ".");
      if (o.ligDiag) o.ligDiag.passos.forEach(function (t) { txt.push("  " + t); }); if (o.ligPilar) o.ligPilar.passos.forEach(function (t) { txt.push("  " + t); });
    });
    if (!MM.classe2022(clP).rhok) txt.push("Ligação ao pilar roliço: a Tab. 2 da NBR 7190-1:2022 não dá ρk da classe " + clP + " (só ρ12 = " + MM.classe2022(clP).rho12 + " kg/m³); adotado ρk = " + clM.rhok + " kg/m³ (o da MLC GL24h), MENOR que o do eucalipto — a favor da segurança; a confirmar com o fornecedor do roliço.");
    txt.push(credito ? "Contraventamento VERIFICADO (tração, ligações e rigidez K_br): o topo do pilar é travado lateralmente (pilar engastado-apoiado, base semirrígida pela ligação)." : "Contraventamento NÃO verificado: SEM crédito de topo travado — pilar em balanço com mola de base (topo livre) até o laço fechar.");
    return { tipo: tirante ? "tirante" : "madeira", b: b, h: h, d: dRod, quadros: qres, gov: gov, eta: gov.eta, ok: gov.eta <= 1 + 1e-9, credito: credito, Nov: Nov, Vmax: Vmax, Kreq: Kreq, Hown: Hown, nDiag: cvs.length, comprimentoTotal_m: cvs.reduce(function (s, c) { return s + c.comprimento_m; }, 0),
      nPinosPorPonta: gov.ligDiag && gov.ligDiag.n ? gov.ligDiag.n : (gov.ligPilar && gov.ligPilar.n) || 0, dPino: gov.ligDiag && gov.ligDiag.d ? gov.ligDiag.d : (gov.ligPilar && gov.ligPilar.d) || 0.012, passos: txt };
  }

  /* ---------------- um deck ---------------- */
  function deckVerif(q, P, d, F, GC, cargasEsc) {
    var pecas = F.pecas, pre = d.id, rx = function (suf) { return new RegExp("^" + pre + "-" + suf + "\\d+$"); };
    var bars = pecas.filter(function (p) { return rx("B").test(p.id) && p.secao; }), vigs = pecas.filter(function (p) { return rx("V").test(p.id) && p.secao; }), pils = pecas.filter(function (p) { return rx("P").test(p.id) && p.secao; });
    var mfs = pecas.filter(function (p) { return rx("MF").test(p.id); });
    var cvs = pecas.filter(function (p) { return /^[A-Z]+-CVT?\d+$/.test(p.id) && p.id.indexOf(pre + "-") === 0 && p.p0 && p.p1; });      /* E4 r11: diagonais/tirantes do contraventamento em X */
    var mask = d.modo !== "retangulo", barS = d.barrote, passo = barS.passo, gM = q.pesoMLC, cl = q.classe, out = { id: pre, barrotes: [], vigas: [], pilaretes: [], pior: {}, avisos: [] };
    var ml = ehMlc(cl) ? "mlc" : "";
    var gTab = q.tabua.gama * (d.tabua || q.tabua.e) * 1.0;                         // kN/m² (tábua + fixação oculta, juntas desprezadas)
    // 1) tábua
    out.tabua = tabuaVerif(q, P, passo, { e: d.tabua || q.tabua.e });
    // 2) barrotes (contínuos sobre as vigas)
    var mus = pecas.filter(function (p) { return rx("MU").test(p.id) && p.mureta; });      /* R35: muretas da fundação (outra empresa) são linhas de apoio dos barrotes, sem viga */
    var vigaPos = vigs.concat(mus.map(function (m) { return { id: m.id, mureta: true, secao: { b: 0.20, h: 0 }, p0: m.p0, p1: m.p1, comprimento_m: m.comprimento_m, alturaMax: m.alturaMax_m, alturaMin: m.alturaMin_m }; })).map(function (v) { return { v: v, a: xy(v.p0), b: xy(v.p1), L: v.comprimento_m, resG: [], resQ: [] }; });
    out.muretas = [];
    var reacBV = {};                                                                    // vigaId → [{s, RG, RQ}]
    bars.forEach(function (bp) {
      var a = xy(bp.p0), b = xy(bp.p1), L = bp.comprimento_m, aps = [], vids = [];
      vigaPos.forEach(function (vp) { var ip = inter2D(a, b, vp.a, vp.b, vp.v.secao.b / 2 + 0.03, bp.secao.b / 2 + 0.03); if (ip) { aps.push(ip.a); vids.push({ v: vp.v.id, sv: ip.b, sb: ip.a }); } });
      var apU = uniqSorted(aps, 0.03), item = { id: bp.id, L: L, apoios: apU, b: bp.secao.b, h: bp.secao.h };
      if (apU.length < 2) { item.eta = Infinity; item.ok = false; item.motivo = "menos de 2 apoios nas vigas"; out.barrotes.push(item); return; }
      var qG = gTab * passo + bp.secao.b * bp.secao.h * gM, qQ = q.cargas.sobrecarga * passo;
      var res = vf({ L: L, apoios: apU, G: { d: [[0, L, qG]] }, Q: { d: [[0, L, qQ]] }, b: bp.secao.b, h: bp.secao.h, classe: cl, perfil: P("longa", ml) });
      item.eta = res.eta; item.ok = res.ok; item.res = res; item.qG = qG; item.qQ = qQ;
      var bal = Math.max(apU[0], L - apU[apU.length - 1]); item.balanco = bal;
      vids.forEach(function (vi) { var rr = getR(res.reacoes, vi.sb); (reacBV[vi.v] = reacBV[vi.v] || []).push({ s: vi.sv, RG: rr[0], RQ: rr[1], barrote: bp.id }); });
      out.barrotes.push(item);
    });
    // 2b) reação do topo da escada sobre as vigas (alavanca: o degrau/patamar apoia entre as duas vigas vizinhas)
    out.escada = [];
    (cargasEsc || []).forEach(function (ce) {
      var cand = { neg: null, pos: null };
      vigaPos.forEach(function (vp) {
        var dx = vp.b[0] - vp.a[0], dy = vp.b[1] - vp.a[1], Lv = Math.sqrt(dx * dx + dy * dy), ux = dx / Lv, uy = dy / Lv, rx = ce.x - vp.a[0], ry = ce.y - vp.a[1], t = rx * ux + ry * uy, o = -rx * uy + ry * ux;
        if (t < -0.3 || t > Lv + 0.3) return; var k = o < 0 ? "neg" : "pos", ao = Math.abs(o);
        if (!cand[k] || ao < cand[k].ao) cand[k] = { v: vp.v, ao: ao, s: Math.min(Lv, Math.max(0, t)) };
      });
      var par = [];
      if (cand.neg && cand.pos && cand.neg.ao + cand.pos.ao > 1e-9) { var tot = cand.neg.ao + cand.pos.ao; par = [{ c: cand.neg, f: cand.pos.ao / tot }, { c: cand.pos, f: cand.neg.ao / tot }]; }
      else { var u1 = cand.neg || cand.pos; if (u1 && u1.ao <= 0.8) par = [{ c: u1, f: 1 }]; }
      if (!par.length) { out.avisos.push("T7: a reação do topo da escada (" + ce.id + ") não caiu entre vigas do deck " + pre + ": conferir o apoio da escada."); return; }
      par.forEach(function (x) { (reacBV[x.c.v.id] = reacBV[x.c.v.id] || []).push({ s: x.c.s, RG: ce.RG * x.f, RQ: ce.RQ * x.f, barrote: "ESC" }); });
      out.escada.push({ id: ce.id, x: ce.x, y: ce.y, RG: ce.RG, RQ: ce.RQ, vigas: par.map(function (x) { return { id: x.c.v.id, parte: x.f, s: x.c.s }; }) });
    });
    // 3) vigas
    var bxs = bars.map(function (p) { return [p.p0, p.p1]; }), minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    pecas.filter(function (p) { return rx("B").test(p.id) && p.p0; }).concat(vigs).forEach(function (p) { [p.p0, p.p1].forEach(function (t) { minX = Math.min(minX, t[0]); maxX = Math.max(maxX, t[0]); minY = Math.min(minY, t[1]); maxY = Math.max(maxY, t[1]); }); });
    var pilReac = {};
    vigaPos.forEach(function (vp) {
      var v = vp.v, L = vp.L, ap = [], ids = [];
      if (v.mureta) {      /* R35: a mureta recebe os barrotes; a reação por metro é INFORMADA à fundação (outra empresa) e o barrote é verificado no apoio (σc,90 sobre a chapa de 100 mm) */
        var rsm = reacBV[v.id] || [], sG = 0, sQ = 0, Rmax = 0, bmax = 0, hmax = 0; rsm.forEach(function (x) { sG += x.RG; sQ += x.RQ; if (1.4 * (x.RG + x.RQ) > Rmax) Rmax = 1.4 * (x.RG + x.RQ); });
        bars.forEach(function (bp) { bmax = Math.max(bmax, bp.secao.b); hmax = Math.max(hmax, bp.secao.h); });
        var fPm = MM.resistencias2022(cl, P("longa", ml)), aPl = 10, lmtM = Math.min(fPm.fc90d * ML.alfaN(aPl), 0.25 * fPm.fc0d * ML.alfaN(aPl)), sgM = Rmax / (bmax * 0.10) / 1e3;
        out.muretas.push({ id: v.id, L: L, altura_max_m: v.alturaMax, altura_min_m: v.alturaMin, reacao_G_kN: sG, reacao_Q_kN: sQ, reacao_kN_por_m: (sG + sQ) / L, reacao_d_kN_por_m: 1.4 * (sG + sQ) / L, R_d_barrote_max: Rmax, sigma_c90_MPa: sgM, fc90d_alfaN_MPa: lmtM, eta: sgM / lmtM, ok: sgM / lmtM <= 1 + 1e-9, interface: true,
          passos: ["Mureta " + v.id + " (fundação, OUTRA EMPRESA): recebe " + rsm.length + " barrotes; reação característica G = " + br(sG, 2) + " kN, Q = " + br(sQ, 2) + " kN em " + br(L, 2) + " m → " + br((sG + sQ) / L, 3) + " kN/m (cálculo " + br(1.4 * (sG + sQ) / L, 3) + " kN/m) a informar à fundação.", "Barrote sobre chapa inox + neoprene de 100 mm: Rd,máx = " + br(Rmax, 2) + " kN, σc,90 = " + br(sgM, 3) + " MPa ≤ " + br(lmtM, 3) + " MPa (fc90,d·αn, a = 10 cm) → η = " + br(sgM / lmtM, 3) + "."] });
        return;
      }
      pils.forEach(function (pl) { var s = posNoSeg(vp.a, vp.b, xy(pl.p1), 0.12); if (s != null) { ap.push(s); ids.push(pl.id); } });
      (v.apoios_externos || []).forEach(function (pt) { var s = posNoSeg(vp.a, vp.b, pt, 0.12); if (s != null) { ap.push(s); ids.push(null); } });
      var order = ap.map(function (s, i) { return i; }).sort(function (i, j) { return ap[i] - ap[j]; }), apS = order.map(function (i) { return ap[i]; }), idS = order.map(function (i) { return ids[i]; });
      var item = { id: v.id, L: L, b: v.secao.b, h: v.secao.h, apoios: apS };
      if (apS.length < 2) { item.eta = Infinity; item.ok = false; item.motivo = "menos de 2 apoios (pilaretes)"; out.vigas.push(item); return; }
      var rs = reacBV[v.id] || [], Gp = [], Qp = [], Gd = [[0, L, v.secao.b * v.secao.h * gM]], Qd = [];
      rs.forEach(function (x) { Gp.push([x.s, x.RG]); Qp.push([x.s, x.RQ]); });
      var dEdge = Math.min.apply(null, [Math.abs(vp.a[0] - minX), Math.abs(vp.a[0] - maxX), Math.abs(vp.a[1] - minY), Math.abs(vp.a[1] - maxY)].filter(function (_, k) { var vertical = Math.abs(vp.a[0] - vp.b[0]) < 1e-6; return vertical ? k < 2 : k >= 2; }));
      item.borda = dEdge <= 0.60 && GC.temGC;
      if (item.borda) { Gd.push([0, L, q.guardaCorpo.pesoLinear]); Qd.push([0, L, q.cargas.gc2]); }
      var res = vf({ L: L, apoios: apS, G: { d: Gd, p: Gp }, Q: { d: Qd, p: Qp }, b: v.secao.b, h: v.secao.h, classe: cl, perfil: P("longa", ml) });
      item.eta = res.eta; item.ok = res.ok; item.res = res;
      apS.forEach(function (s, i) { if (idS[i]) { var rr = getR(res.reacoes, s); pilReac[idS[i]] = { NG: rr[0], NQ: rr[1], viga: v.id }; } });
      out.vigas.push(item);
    });
    // 4) pilaretes / pilares
    var Hinfo = forcaHoriz(q, GC, d, { minX: minX, maxX: maxX, minY: minY, maxY: maxY, hViga: Math.max.apply(null, vigs.map(function (v) { return v.secao.h; }).concat([0])), hBarr: barS.h, pils: pils }), H = Hinfo.H, nP = Math.max(1, pils.length), Hp = H / nP, engastadoDeck = !!d.pilarEngastado || (d.pilar && d.pilar.engastado), amarrado = !!d.amarracaoEdificacao;
    out.H = { total: H, porPilarete: Hp, nPilaretes: nP, info: Hinfo }; out.pior = {};
    var cvI = cvs.length && engastadoDeck && pils.length ? cvAnalise(q, P, d, cvs, pils, Hinfo, cl, pilReac) : null; out.contraventamento = cvI;
    pils.forEach(function (pl) {
      var rc = pilReac[pl.id] || { NG: 0, NQ: 0 }, circ = pl.secao.tipo === "circ", h = pl.h_livre != null ? pl.h_livre : Math.abs(pl.p1[2] - pl.p0[2]), eng = !!pl.engastado;
      var clP = (d.pilar && d.pilar.classe) || (d.pilarete && d.pilarete.classe) || (circ ? "nativa:D40" : cl), mlcP = ehMlc(clP) ? "mlc" : "";
      var pesoP = (circ ? Math.PI * pl.secao.d * pl.secao.d / 4 : pl.secao.b * pl.secao.h) * h * gM;
      var temMF = mfs.some(function (m) { return m.id === pl.id.replace(/-P(\d+)$/, "-MF$1"); });
      var beta, tipoE, passosB = [];
      var pm0 = null, pmR = null, topoDuro = amarrado;      /* A6 (r13): a caixa "topo travado" NÃO credita nada sozinha — só vale pelo elemento que trava e foi VERIFICADO (amarração à edificação ou X com crédito); sem ele, aviso bloqueante e o pilar é calculado SEM o travamento */
      if (q.lateral.topoTravado && !amarrado && !(cvI && cvI.credito)) out.avisos.push("T7: topo dos pilares declarado TRAVADO pelo usuário, mas sem elemento verificado que trave (nem contraventamento em X com crédito, nem amarração à edificação calculada) no deck " + pre + ": o travamento NÃO foi creditado (pilar calculado sem ele); desmarcar a opção ou projetar o X/a amarração.");
      var Hown = Hinfo.qv > 0 ? Hinfo.qv * (circ ? pl.secao.d : Math.max(pl.secao.b, pl.secao.h)) * h : 0, nPmf = ((d.pilar && d.pilar.mfParafusos) || (d.pilarete && d.pilarete.mfParafusos)) || 2, Fmf_i = null, Tx_d = null;
      if (eng && temMF && !topoDuro) {      /* R34: topo preso por mão-francesa → pórtico com mola de rotação (modelo REAL), em vez de pilar em balanço */
        var clM = MM.classe2022(cl), clC = MM.classe2022(clP), IcP = circ ? Math.PI * Math.pow(pl.secao.d, 4) / 64 : pl.secao.b * Math.pow(pl.secao.h, 3) / 12, EIp = clC.Ec0m * 1e3 * IcP, Lmf = 0.9, cmf0 = Lmf / Math.SQRT2, nPm = nPmf;
        var kAx = clM.Ec0m * 1e3 * 0.06 * 0.12 / Lmf, KuP = ML.kuPino(0.012, clM.rhok, false), kDesl = nPm * KuP / 2, kMF = 1 / (1 / kAx + 1 / kDesl), Kth = kMF * cmf0 * cmf0 / 2, pt = portico(EIp, h, Kth);
        pm0 = { Kth: Kth, kMF: kMF, kAx: kAx, kDesl: kDesl, EI: EIp, razao: pt.razao, beta: pt.beta, nPm: nPm, KuP: KuP, c: cmf0 };
      }
      if (!eng && temMF && !topoDuro) {      /* C1 (r13): base ROTULADA com a mão-francesa no topo = PÓRTICO DESLOCÁVEL (o topo anda com o deck): β ≥ 2 pela mola de rotação do topo (ν·tg ν = κ), força na mão-francesa F = Heff·h/c·√2 e momento no pilar Heff·(h − c) */
        var clMr = MM.classe2022(cl), clCr = MM.classe2022(clP), IcR = circ ? Math.PI * Math.pow(pl.secao.d, 4) / 64 : pl.secao.b * Math.pow(pl.secao.h, 3) / 12, EIr = clCr.Ec0m * 1e3 * IcR, LmfR = 0.9, cR = Math.min(LmfR / Math.SQRT2, 0.9 * h);
        var kAxR = clMr.Ec0m * 1e3 * 0.06 * 0.12 / LmfR, KuR = ML.kuPino(0.012, clMr.rhok, false), kDeslR = nPmf * KuR / 2, kMFR = 1 / (1 / kAxR + 1 / kDeslR), KthR = kMFR * cR * cR / 2, btR = MD.betaFlambagemMola({ C: KthR, EI: EIr, L: h }), HeffR = Hp + Hown / 2;
        pmR = { Kth: KthR, kMF: kMFR, kAx: kAxR, kDesl: kDeslR, EI: EIr, beta: Math.min(btR.beta, 50), nu: btR.x, kappa: btR.CL_EI, nPm: nPmf, KuP: KuR, c: cR, Heff: HeffR, Fh: HeffR * h / cR, Mmax: HeffR * (h - cR) + Hown * h / 8, Tx: HeffR * (h - cR) / cR };
        Fmf_i = pmR.Fh * Math.SQRT2; Tx_d = 1.4 * pmR.Tx;
      }
      var braced = !!(eng && cvI && !topoDuro), cvB = null;
      if (braced) {      /* E4 r11 (R34): pilar ALTO contraventado em X: trabalha quase só axialmente; momento = vento no próprio pilar (w·h²/8, apoiado no topo pelo X) + o cortante do quadro no nó do pé; base semirrígida pela ligação REAL (Kθ dos chumbadores) */
        var IcB = circ ? Math.PI * Math.pow(pl.secao.d, 4) / 64 : pl.secao.b * Math.pow(pl.secao.h, 3) / 12, EIb = MM.classe2022(clP).Ec0m * 1e3 * IcB, dB = circ ? pl.secao.d : pl.secao.b, zB = Math.max(0.1, dB - 0.06), z0n = 0.40, HownB = Hinfo.qv > 0 ? Hinfo.qv * dB * h : 0;
        var MdB = 1.4 * HownB * h / 8 + cvI.Vmax * z0n, NminB = (rc.NG + pesoP) - cvI.Nov, VdB = cvI.Vmax + 1.4 * 0.625 * HownB, selB = selChumb(true, MdB, zB, NminB, VdB), bt = cvI.credito ? MD.betaEngastadoApoiado({ C: selB.Ktheta, EI: EIb, L: h }) : MD.betaFlambagemMola({ C: Math.max(selB.Ktheta, 1e-3), EI: EIb, L: h });
        cvB = { MdB: MdB, NminB: NminB, VdB: VdB, zB: zB, sel: selB, Ktheta: selB.Ktheta, beta: bt.beta, credito: cvI.credito, HownB: HownB, passosB: bt.passos };
      }
      if (braced) { tipoE = cvI.credito ? "engastado-apoiado (topo travado pelo contraventamento em X; base semirrígida)" : "balanço engastado (contraventamento NÃO verificado: sem crédito de topo travado)"; beta = cvB.beta; passosB = cvB.passosB; }
      else if (eng) { var topo = topoDuro; tipoE = pm0 ? "engastado + mãos-francesas (pórtico, topo com mola de rotação)" : (topo ? "engastado-articulado" : "balanço engastado"); beta = pm0 ? pm0.beta : (topo ? 0.7 : 2.0);
        if (!topo && !pm0 && q.lateral.krBase) { var Ii = circ ? Math.PI * Math.pow(pl.secao.d, 4) / 64 : pl.secao.b * Math.pow(pl.secao.h, 3) / 12, EI = MM.classe2022(clP).Ec0m * 1e3 * Ii, bm = MD.betaFlambagemMola({ C: q.lateral.krBase, EI: EI, L: h }); beta = bm.beta; passosB = bm.passos; }
        else if (!topo && !pm0) {      /* A4 (r13): balanço com a rigidez REAL da base (Kθ dos chumbadores selecionados para o MESMO pilar), não engaste perfeito; N mínimo com γ = 1,0 e sem sobrecarga (A5) */
          var Ib = circ ? Math.PI * Math.pow(pl.secao.d, 4) / 64 : pl.secao.b * Math.pow(pl.secao.h, 3) / 12, EIb0 = MM.classe2022(clP).Ec0m * 1e3 * Ib, dBb = circ ? pl.secao.d : pl.secao.b, zBb = Math.max(0.1, dBb - 0.06), MbB = 1.4 * (Hp * h + Hown * h / 2), selA4 = selChumb(true, MbB, zBb, rc.NG + pesoP, 1.4 * (Hp + Hown)), bmA4 = MD.betaFlambagemMola({ C: Math.max(selA4.Ktheta, 1e-3), EI: EIb0, L: h });
          beta = bmA4.beta; passosB = ["Balanço engastado com a rigidez REAL da base (A4): " + selA4.n + " chumbadores M" + selA4.d + " → Kθ = " + br(selA4.Ktheta, 0) + " kN·m/rad (n_tracionados·E·As/L_ef·z², L_ef 0,22 m adotado); " + bmA4.passos[0]]; }
        if (pm0) passosB = ["Pórtico (R34): mão-francesa 6×12 cm a 45° (c = " + br(pm0.c, 3) + " m) com " + pm0.nPm + " parafusos Ø12 por ponta: k axial = E·A/L = " + br(pm0.kAx, 0) + " kN/m em série com o deslizamento das duas pontas (n·Ku/2 = " + br(pm0.kDesl, 0) + " kN/m; Ku = 2/3·Kser = " + br(pm0.KuP, 0) + " kN/m por parafuso) → k = " + br(pm0.kMF, 0) + " kN/m; Kθ,topo = k·c²/2 = " + br(pm0.Kth, 0) + " kN·m/rad; EI do pilar = " + br(pm0.EI, 0) + " kN·m². M_base/(H·h) = (K + a/2)/(2K + a/2) = " + br(pm0.razao, 3) + " (balanço = 1,000); β = " + br(pm0.beta, 2) + " (tan ν = −ν/κ, topo livre para deslocar). Premissa a validar pelo RT: a viga e os barrotes restringem a rotação da viga no apoio."];
        if (!topo && !q.lateral.krBase && !pm0) tipoE = "balanço engastado (mola real da base)"; }
      else if (pmR) { tipoE = "rotulado na base + mão-francesa (pórtico DESLOCÁVEL, topo com mola de rotação)"; beta = pmR.beta;
        passosB = ["Pórtico de base ROTULADA (C1, r13): o topo anda com o deck, a horizontal só chega ao chão pelo cortante do pilarete — NÃO é pilar travado. Mão-francesa 6×12 cm a 45° (c = " + br(pmR.c, 3) + " m) com " + pmR.nPm + " parafusos Ø12 por ponta: k = " + br(pmR.kMF, 0) + " kN/m (E·A/L em série com n·Ku/2); Kθ,topo = k·c²/2 = " + br(pmR.Kth, 0) + " kN·m/rad; EI = " + br(pmR.EI, 0) + " kN·m²; κ = Kθ·h/EI = " + br(pmR.kappa, 2) + "; ν·tg ν = κ ⇒ ν = " + br(pmR.nu, 4) + "; β = π/ν = " + br(pmR.beta, 2) + " (≥ 2: nunca 1,0).",
          "Estática (momento no pilar em torno do pé = 0, rótula): H_efetiva = Hp + Hown/2 = " + br(pmR.Heff, 3) + " kN; componente horizontal na mão-francesa = H·h/c = " + br(pmR.Fh, 2) + " kN → força axial F = H·h/c·√2 = " + br(pmR.Fh * Math.SQRT2, 2) + " kN; força horizontal na ligação viga–pilarete = H·(h − c)/c = " + br(pmR.Tx, 2) + " kN; momento máximo no pilarete (no nó da mão-francesa) M = H·(h − c) + Hown·h/8 = " + br(pmR.Mmax, 3) + " kN·m (característico). Premissa a validar pelo RT: viga e barrotes restringem a rotação da viga no apoio."]; }
      else { tipoE = amarrado ? "rotulado-rotulado travado (amarração à edificação)" : (temMF ? "rotulado-rotulado travado" : "rotulado sem travamento"); beta = 1.0; }
      var L0 = beta * h, N1 = 1.4 * (rc.NG + pesoP * 1.0 + rc.NQ) - 0, Hd = 1.4 * (Hp + Hown), M2 = eng ? (pm0 ? pm0.razao : 1) * 1.4 * (Hp * h + Hown * h / 2) : (pmR ? 1.4 * pmR.Mmax : 0), Mtopo = pm0 ? (1 - pm0.razao) * 1.4 * (Hp * h + Hown * h / 2) : 0, N2 = 1.4 * (rc.NG + pesoP + q.cargas.psi0 * rc.NQ);
      if (braced) { M2 = cvB.MdB; N2 += cvI.Nov; }      /* r11: momento = vento no pilar (1,4·w·h²/8) + cortante do quadro no nó do pé; N2 soma o binário do X (compressão no pilar do lado da diagonal tracionada) */
      function chk(N, M, car) {
        var pr = P(car, mlcP);
        if (circ) { var c = MD.circular2022({ N: -N, My: M, Mz: 0, d: pl.secao.d, L0: L0, classe: clP, perfil: pr }); return { eta: c.esbelto ? Math.max(c.eta, 1.0001) : c.eta, esbelto: c.esbelto, lambda: c.lambda, passos: c.passos }; }
        var c2 = MD.compressao2022({ N: N, Mx: M, My: 0, b: pl.secao.b, h: pl.secao.h, L0x: L0, L0y: L0, classe: clP, perfil: pr }); return { eta: c2.esbelto ? Math.max(c2.eta, 1.0001) : c2.eta, esbelto: c2.esbelto, lambda: c2.lambda[0], passos: c2.passos };
      }
      var c1 = chk(N1, 0, "longa"), c2 = chk(N2, M2, "curta"), eta = Math.max(c1.eta, c2.eta), it = { id: pl.id, h: h, tipo: tipoE, L0: L0, beta: beta, NG: rc.NG, NQ: rc.NQ, peso: pesoP, N1: N1, N2: N2, M2: M2, Hd: Hd, eta: eta, ok: eta <= 1 + 1e-9 && !c1.esbelto && !c2.esbelto, esbelto: c1.esbelto || c2.esbelto, lambda: c1.lambda,
        classe: clP, b: circ ? pl.secao.d : pl.secao.b, circ: circ, travado: temMF || amarrado || eng, eng: eng, Fmf: Fmf_i, Tx_d: Tx_d, Nfav: rc.NG + pesoP, pmR: pmR, cv: cvB, comMF: temMF, portico: pm0 ? { Kth: pm0.Kth, razaoMbase: pm0.razao, beta: pm0.beta, Mtopo_d: Mtopo } : null, passos: ["Pilar " + pl.id + " (" + tipoE + "), h = " + br(h) + " m, L0 = " + br(beta, 1) + "·h = " + br(L0) + " m; reação da viga " + br(rc.NG + rc.NQ) + " kN (G " + br(rc.NG) + " + Q " + br(rc.NQ) + ") + peso próprio " + br(pesoP) + " kN.", "Combinação 1 (permanente + sobrecarga, longa duração): Nd = " + br(N1) + " kN → η = " + br(c1.eta, 3) + ".", "Combinação 2 (G + ψ0·Q + força horizontal do guarda-corpo, curta duração): Nd = " + br(N2) + " kN, Hd = " + br(Hd, 3) + " kN" + (eng ? ", Md = " + (pm0 ? br(pm0.razao, 3) + "·" : "") + "1,4·(Hp·h + Hown·h/2) = 1,4·(" + br(Hp, 2) + "·" + br(h) + " + " + br(Hown, 2) + "·" + br(h) + "/2) = " + br(M2) + " kN·m (vento no próprio pilar: " + br(Hown, 2) + " kN a meia altura)" : (pmR ? ", Md = 1,4·[H·(h − c) + Hown·h/8] = " + br(M2) + " kN·m (pórtico de base rotulada, ver acima)" : " (rótula: a horizontal vai às mãos-francesas)")) + " → η = " + br(c2.eta, 3) + "."].concat(braced ? ["Pilar contraventado (r11): Md = 1,4·Hpilar·h/8 + Vquadro·z_nó = 1,4·" + br(cvB.HownB, 2) + "·" + br(h) + "/8 + " + br(cvI.Vmax, 2) + "·0,40 = " + br(cvB.MdB, 2) + " kN·m; N mín. na base (arrancamento) = " + br(cvB.NminB, 2) + " kN; base: " + cvB.sel.n + " chumbadores M" + cvB.sel.d + " → Kθ = n_tracionados·E·As/L_ef·z² = " + br(cvB.Ktheta, 0) + " kN·m/rad (L_ef 0,22 m adotado)."] : []).concat(passosB).concat(c2.passos) };
      var vgp = vigs.filter(function (v) { return v.id === rc.viga; })[0];
      if (vgp) {
        var fP = MM.resistencias2022(cl, P("longa", "mlc")), aCm = (circ ? pl.secao.d : pl.secao.b) * 100, sgm = N1 / ((circ ? pl.secao.d : pl.secao.b) * vgp.secao.b) / 1e3, lmt = Math.min(fP.fc90d * ML.alfaN(aCm), 0.25 * fP.fc0d * ML.alfaN(aCm));
        it.apoio = { N: N1, sigma: sgm, limite: lmt, eta: sgm / lmt, viga: vgp.id, bViga: vgp.secao.b, a: aCm };
        if (sgm / lmt > (out.pior.apoioMax || 0)) { out.pior.apoioMax = sgm / lmt; out.pior.apoioId = pl.id; }
      }
      out.pilaretes.push(it);
    });
    // 5) mãos-francesas
    if (mfs.length) {
      var HownMax = pils.reduce(function (m, pl) { var hh = pl.h_livre != null ? pl.h_livre : Math.abs(pl.p1[2] - pl.p0[2]); return Math.max(m, Hinfo.qv > 0 ? Hinfo.qv * (pl.secao.tipo === "circ" ? pl.secao.d : Math.max(pl.secao.b, pl.secao.h)) * hh : 0); }, 0), MtopoMax = out.pilaretes.reduce(function (m, x) { return Math.max(m, x.portico ? x.portico.Mtopo_d : 0); }, 0) / 1.4, cMF = 0.9 / Math.SQRT2, FmfRot = out.pilaretes.reduce(function (m, x) { return Math.max(m, x.Fmf || 0); }, 0), Fmf = Math.max(FmfRot, MtopoMax > 0 ? MtopoMax * Math.SQRT2 / cMF : (FmfRot > 0 ? 0 : (Hp + HownMax / 2) * Math.SQRT2)), pm = P("curta", "mlc"), cmf = MD.compressao2022({ N: 1.4 * Fmf, Mx: 0, My: 0, b: 0.06, h: 0.12, L0x: 0.9, L0y: 0.9, classe: cl, perfil: pm }), fm = MM.resistencias2022(cl, pm), etaT = 1.4 * Fmf / (0.06 * 0.12 * 1e3) / fm.ft0d;
      var cfg = ML.PADRAO, mm = ML.madeiraMadeiraSimples(0.012, 0.06, 0.12, 0, Math.PI / 4, MM.classe2022(cl).rhok, cfg.fu, "conifera"), nPMF = ((d.pilar && d.pilar.mfParafusos) || (d.pilarete && d.pilarete.mfParafusos)) || 2, RdP = mm.Rk * pm.kmod / 1.4 * ML.nefFator(nPMF, 0.07, 0.012), etaL = 1.4 * Fmf / (nPMF * RdP);      /* R34: as mãos-francesas do topo do pilar roliço levam mais parafusos por ponta (d.pilar.mfParafusos) */
      out.maoFrancesa = { F: Fmf, Fd: 1.4 * Fmf, etaCompressao: cmf.eta, etaTracao: etaT, etaLigacao: etaL, eta: Math.max(cmf.eta, etaT, etaL), ok: Math.max(cmf.eta, etaT, etaL) <= 1 + 1e-9, n: mfs.length,
        passos: [FmfRot > 0 && FmfRot >= Fmf - 1e-9 ? "Mão-francesa 6×12 cm a 45° (0,9 m) de pilarete de base ROTULADA (C1): F = H·h/c·√2 (equilíbrio de momentos do pilar em torno do pé, ver o pilarete) = " + br(Fmf, 3) + " kN (reversível: comprime ou traciona), Fd = " + br(1.4 * Fmf, 3) + " kN. Compressão (L0 = 0,9 m): η = " + br(cmf.eta, 3) + "; tração: η = " + br(etaT, 3) + "." : MtopoMax > 0 ? "Mão-francesa 6×12 cm a 45° (0,9 m) no pórtico do pilar (R34): o momento do topo (parcela da força horizontal que o pilar NÃO leva na base) é binário na mão-francesa: F = Mtopo/(c/√2) = " + br(MtopoMax, 2) + "/(" + br(cMF / Math.SQRT2, 3) + ") = " + br(Fmf, 3) + " kN (reversível: comprime ou traciona), Fd = " + br(1.4 * Fmf, 3) + " kN. Compressão (L0 = 0,9 m): η = " + br(cmf.eta, 3) + "; tração: η = " + br(etaT, 3) + "." : "Mão-francesa 6×12 cm a 45° (0,9 m): F = (Hp + Hown/2)/cos45° = (" + br(Hp, 3) + " + " + br(HownMax, 3) + "/2)·1,414 = " + br(Fmf, 3) + " kN (reversível: comprime ou traciona), Fd = " + br(1.4 * Fmf, 3) + " kN. Compressão (L0 = 0,9 m): η = " + br(cmf.eta, 3) + "; tração: η = " + br(etaT, 3) + ".", "Ligação (2 parafusos Ø12 por ponta, corte simples madeira–madeira, Tab. 18, 7.2, p. 58–59; n_ef pela Tab. 14 com a1 = 70 mm): Rk = " + br(mm.Rk, 2) + " kN (modo " + mm.modo + "), Rd = Rk·kmod/γ·n_ef = " + br(RdP, 2) + " kN por parafuso → η = " + br(etaL, 3) + "."] };
    }
    out.estabilidade = { tipo: engastadoDeck ? "base-engastada" : (mfs.length ? "maos-francesas" : (amarrado ? "amarracao-edificacao" : null)), engastado: engastadoDeck, maosFrancesas: mfs.length, contraventamento: cvs.length, amarrado: amarrado };
    if (amarrado) out.amarracao = amarracaoVerif(q, P, d, ext({}, Hinfo, { H: Hinfo.H + (Hinfo.Hpil || 0) / 2 }), { minX: minX, maxX: maxX, minY: minY, maxY: maxY }, vigs);
    function piorDe(L) { var m = 0, id = null; L.forEach(function (x) { var e = isFinite(x.eta) ? x.eta : 99; if (e > m) { m = e; id = x.id; } }); return { eta: m, id: id }; }
    var apx = out.pior.apoioMax || 0, apid = out.pior.apoioId;
    out.pior = { apoio: { eta: apx, id: apid }, tabua: { eta: out.tabua.eta, id: pre + "-TAB" }, barrote: piorDe(out.barrotes), viga: piorDe(out.vigas), pilar: piorDe(out.pilaretes), mf: out.maoFrancesa ? { eta: out.maoFrancesa.eta, id: pre + "-MF" } : { eta: 0 }, cv: out.contraventamento ? { eta: out.contraventamento.eta, id: pre + "-CV" } : { eta: 0 }, amarracao: out.amarracao ? { eta: out.amarracao.eta, id: pre + "-AMARR" } : { eta: 0 } };
    return out;
  }

  /* ---------------- escada ---------------- */
  function escadaVerif(q, P, esc, avisos) {
    if (!esc) return null;
    if (!esc.longarinas) { avisos.push("T7: escada de OUTRO material (concreto, na arquitetura): só os degraus de madeira entram como item de orçamento; a estrutura da escada e a fixação dos degraus são do projeto da escada."); return { tipo: "outro-material", longarinas: null, degraus: esc.degraus, eta: 0, ok: true, passos: ["Escada de outro material: sem verificação de longarinas pela madeira (declarado)."] }; }
    var e = esc.longarinas, nL = e.xs.length, W = esc.largura || (nL > 1 ? (e.xs[nL - 1] - e.xs[0]) + 0.10 : 0.90), Lh = Math.sqrt(Math.pow(e.y1 - e.y0, 2)), dz = e.z1 - e.z0, Ls = Math.sqrt(Lh * Lh + dz * dz), cosA = Lh / Ls;
    var Td = ext({ classe: q.tabua.classe, e: 0.04, gama: q.tabua.gama }, esc.degrau || {}), cl = q.classe, ml = ehMlc(cl) ? "mlc" : "", qEsc = 2.5, sc = W / nL;       // 6120 Tab. 10: escadas residenciais privativas 2,5 kN/m² (p. 21)
    var qG = (Td.gama * Td.e * sc + e.b * e.h * q.pesoMLC) / cosA, qQ = qEsc * sc;
    var res = vf({ L: Lh, apoios: [0, Lh], G: { d: [[0, Lh, qG]] }, Q: { d: [[0, Lh, qQ]] }, b: e.b, h: e.h, classe: cl, perfil: P("longa", ml) });
    var R = 1.4 * (qG + qQ) * Lh / 2, kmod = P("longa", ml).kmod, f = MM.resistencias2022(cl, P("longa", ml)), apoio = esc.apoioBase || 0.10, sig = R / (e.b * apoio) / 1e3, a90 = Math.min(f.fc90d * ML.alfaN(apoio * 100), 0.25 * f.fc0d * ML.alfaN(apoio * 100)), etaApoio = sig / a90;
    var vao = nL > 1 ? (e.xs[1] - e.xs[0]) : W, pd = ext({}, Td), Pd = 2.5, rd = vf({ L: vao, apoios: [0, vao], G: { d: [[0, vao, Td.gama * Td.e * 0.28]] }, Q: { p: [[vao / 2, Pd]] }, b: 0.28, h: Td.e, classe: Td.classe, perfil: P("curta") }),
      rd2 = vf({ L: vao, apoios: [0, vao], G: { d: [[0, vao, Td.gama * Td.e * 0.28]] }, Q: { d: [[0, vao, qEsc * 0.28]] }, b: 0.28, h: Td.e, classe: Td.classe, perfil: P("longa") });
    var eta = Math.max(res.eta, etaApoio, rd.eta, rd2.eta);
    var cfg = ML.PADRAO, rk = ML.chapasExternas(0.012, e.b, Math.PI / 2, MM.classe2022(cl).rhok, cfg.fu, 0.006, "conifera"), Rdp = rk * P("longa", ml).kmod / 1.4, nB = Math.max(2, Math.ceil(R / Rdp)), etaLig = R / (nB * Rdp);
    var topoY = e.z1 >= e.z0 ? e.y1 : e.y0, topos = e.xs.map(function (xv, i) { return { id: "ESC-L" + (i + 1), x: xv, y: topoY, RG: qG * Lh / 2, RQ: qQ * Lh / 2 }; });
    return { tipo: "madeira", topos: topos, nLongarinas: nL, largura: W, Lh: Lh, Ls: Ls, inclinacao: Math.atan(dz / Lh) * 180 / Math.PI, longarina: res, degrauConcentrada: rd, degrauDistribuida: rd2, R: R, apoioBase: { sigma: sig, resistencia: a90, eta: etaApoio },
      ligacaoTopo: { n: nB, Rd: Rdp, eta: etaLig, ok: etaLig <= 1 + 1e-9 }, eta: Math.max(eta, etaLig), ok: eta <= 1 + 1e-9 && etaLig <= 1 + 1e-9, apoios: !!(esc.apoioTopo !== false && esc.apoioBase !== false),
      passos: ["Escada " + nL + " longarinas " + br(e.b * 100, 0) + "×" + br(e.h * 100, 0) + " cm, vão horizontal " + br(Lh) + " m, inclinação " + br(Math.atan(dz / Lh) * 180 / Math.PI, 1) + "°, largura " + br(W) + " m; carga variável 2,5 kN/m² (NBR 6120 Tab. 10, escadas residenciais privativas, p. 21): qG = " + br(qG, 3) + ", qQ = " + br(qQ, 3) + " kN/m por longarina → η = " + br(res.eta, 3) + " (flexão " + br(res.eta_flexao, 3) + ", flecha " + br(res.eta_flecha, 3) + ").",
        "Degrau " + br(Td.e * 100, 1) + " cm (" + Td.classe + "), vão " + br(vao) + " m: carga concentrada isolada 2,5 kN (nota t da Tab. 10, p. 26) η = " + br(rd.eta, 3) + "; distribuída 2,5 kN/m² η = " + br(rd2.eta, 3) + ".", "Reação Rd = " + br(R, 2) + " kN por longarina; apoio na base " + br(apoio * 100, 0) + " cm: σc,90 = " + br(sig, 3) + " MPa ≤ " + br(a90, 3) + " MPa (η = " + br(etaApoio, 3) + "); ligação ao deck: " + nB + " parafusos Ø12 em corte duplo (chapas externas) η = " + br(etaLig, 3) + "."] };
  }

  /* ---------------- orquestra ---------------- */
  function aplicarSecoes(params, sec) {
    var p = clone(params);
    p.decks.forEach(function (d) {
      var s = sec && sec[d.id]; if (!s) return;
      if (s.tabua && s.tabua.e) d.tabua = s.tabua.e;
      if (s.barrote) d.barrote = ext({}, d.barrote, s.barrote);
      if (s.viga) { if (d.modo === "retangulo") d.vigas = ext({}, d.vigas, s.viga); else d.viga = ext({}, d.viga, s.viga); }
      if (s.pilarete) { if (d.modo === "retangulo") d.pilar = ext({}, d.pilar, s.pilarete); else d.pilarete = ext({}, d.pilarete, s.pilarete); }
      if (s.cv && d.modo === "retangulo") d.pilar = ext({}, d.pilar, { cv: ext({}, d.pilar.cv, s.cv) });      /* r11: seção da diagonal/tirante do contraventamento */
    });
    return p;
  }
  function secoesIniciais(params) {
    var o = {};
    params.decks.forEach(function (d) {
      var rect = d.modo === "retangulo";
      o[d.id] = { tabua: { e: d.tabua }, barrote: { b: d.barrote.b, h: d.barrote.h }, viga: rect ? { b: d.vigas.b, h: d.vigas.h } : { b: d.viga.b, h: d.viga.h }, pilarete: rect ? { d: d.pilar.d } : (d.pilarete.forma === "circ" ? { d: d.pilarete.d } : { b: d.pilarete.b }) };
      if (rect && d.pilar.contraventamento) o[d.id].cv = ext({}, d.pilar.cv || (d.pilar.contraventamento.tipo === "tirante" ? { d: 0.016 } : { b: CV_SEC[0][0], h: CV_SEC[0][1] }));
    });
    return o;
  }
  function gcDoDeck(q, params, d) {
    var itens = (params.guardaCorpo || []).filter(function (g) { return !g.deck || g.deck === d.id; }), L = itens.reduce(function (m, g) { return Math.max(m, g.L); }, 0);
    return { temGC: itens.length > 0, Lmax: L, n: itens.length, itens: itens };
  }
  function rodar(proj, sec) {
    var q = padrao(proj), P = perfilFn(q), avisos = [], params = aplicarSecoes(q.params, sec);
    var F = MT.T7.fonte(ext({}, params, { classe: q.classe })), res = { decks: {}, avisos: avisos, fonte: F, params: params, q: q, grupos: {}, pior: {} };
    if (!q.guardaCorpo.regiao) avisos.push("T7: região do país (NBR 10821-2:2017, Fig. 4) NÃO informada: adotada a região V, a mais severa, para a carga do guarda-corpo (NBR 14718, Tab. 1, p. 6) — informar a região da obra.");
    if (q.cargas.concentrada != null) avisos.push("T7: a NBR 6120:2019 (Tab. 10, p. 18) não fixa carga concentrada para varandas/terraços (\"‒\"); a verificação da tábua usa Qk = " + br(q.cargas.concentrada) + " kN isolada, por analogia com o elemento isolado de cobertura (6.4, p. 30) — adoção a confirmar pelo RT.");
    var alturaMax = 0, resEsc = escadaVerif(q, P, params.escada, avisos), topos = resEsc && resEsc.topos ? resEsc.topos : [], bbDeck = {};
    params.decks.forEach(function (d) { var pre = d.id, xs = [], ys = []; F.pecas.forEach(function (p) { if (p.id.indexOf(pre + "-") === 0 && p.p0 && p.p1) { xs.push(p.p0[0], p.p1[0]); ys.push(p.p0[1], p.p1[1]); } }); bbDeck[pre] = xs.length ? [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)] : null; });
    function distRet(b, x, y) { if (!b) return 1e9; var dx = Math.max(b[0] - x, 0, x - b[1]), dy = Math.max(b[2] - y, 0, y - b[3]); return Math.sqrt(dx * dx + dy * dy); }
    var escPorDeck = {}; topos.forEach(function (t) { var best = null, bd = 1e9; params.decks.forEach(function (d) { var dd = distRet(bbDeck[d.id], t.x, t.y); if (dd < bd) { bd = dd; best = d.id; } }); if (best && bd <= 0.8) (escPorDeck[best] = escPorDeck[best] || []).push(t); else avisos.push("T7: o topo da " + t.id + " (x " + br(t.x) + ", y " + br(t.y) + ") fica a mais de 0,8 m de qualquer deck: a reação da escada não entra nas vigas."); });
    params.decks.forEach(function (d) {
      var gc = gcDoDeck(q, params, d), cotaDeck = d.cota, zt = d.terreno ? d.terreno((d.rects ? d.rects[0][0] : d.x0), (d.rects ? d.rects[0][2] : d.y0)) : 0;
      var h = d.modo === "retangulo" ? (d.cota - (d.pilar.zBase || 0)) : Math.max(0.1, cotaDeck - (zt || 0));
      alturaMax = Math.max(alturaMax, h);
      var GC = { temGC: gc.temGC, Lmax: gc.Lmax, n: gc.n };
      var dv = deckVerif(q, P, d, F, GC, escPorDeck[d.id]); dv.alturaDeck = h; res.decks[d.id] = dv; (dv.avisos || []).forEach(function (a) { if (avisos.indexOf(a) < 0) avisos.push(a); });
      ["tabua", "barrote", "viga", "pilar", "mf", "cv", "apoio", "amarracao"].forEach(function (k) { if (dv.pior[k] && dv.pior[k].eta) res.grupos[d.id + "/" + k] = { eta: dv.pior[k].eta, id: dv.pior[k].id }; });
      if (!dv.estabilidade.tipo) avisos.push("T7: o deck " + d.id + " não tem estabilidade lateral definida (nem mão-francesa, nem base engastada, nem amarração à edificação).");
    });
    /* vento no deck: com pilaretes altos (> 1,5 m) sem pressão informada é omissão (bloqueia); com pilaretes baixos fica como premissa declarada */
    var hPil = 0; Object.keys(res.decks).forEach(function (id) { res.decks[id].pilaretes.forEach(function (p) { hPil = Math.max(hPil, p.h); }); });
    res.hPiletreMax = hPil;
    var comVento = Object.keys(res.decks).map(function (id) { var i = res.decks[id].H.info; return { id: id, qv: i.qv, z: i.zTopo, vento: i.vento, origem: i.origemQ }; }).filter(function (x) { return x.qv > 0; });
    res.ventoDeck = comVento;
    if (!comVento.length) avisos.push(hPil > 1.5 + 1e-9 ? "T7: vento NÃO considerado e há pilaretes/pilares mais altos que 1,5 m (h máx. " + br(hPil) + " m): informar a localização da obra (V0), a categoria de rugosidade e o grupo S3 (NBR 6123) para a estabilidade lateral — sem eles o deck não pode ser emitido."
      : "T7: vento sobre o deck e o guarda-corpo vazado NÃO considerado (pilaretes até 1,5 m; informar a localização da obra, a categoria e o grupo S3 pela NBR 6123); a estabilidade lateral usa a força horizontal do guarda-corpo (NBR 6120, Tab. 12).");
    else if (comVento.every(function (x) { return !x.vento; })) avisos.push("T7: vento no deck com a pressão informada de " + br(comVento[0].qv) + " kN/m² (tratada como pressão dinâmica q; Ca pela Fig. 6 da NBR 6123; ψ0 = " + br(q.lateral.psiVento, 1) + ") — pressão e ψ0 a confirmar pelo RT; sem a localização da obra o motor não calcula q pela NBR 6123.");
    else avisos.push("T7: vento no deck calculado pela NBR 6123 NA COTA do topo do guarda-corpo/pilarete — " + comVento.map(function (x) { return x.id + ": q = " + br(x.qv, 3) + " kN/m² (z = " + br(x.z, 2) + " m)"; }).join("; ") + "; Ca do guarda-corpo pela Fig. 6 da NBR 6123 (sotavento pela Fig. 8), faixa do deck como placa (Ca = 2,0), pilaretes Ca = 1,0 adotado, e ψ0 = " + br(q.lateral.psiVento, 1) + " — Ca dos pilaretes e ψ0 a confirmar pelo RT.");
    var pOrigem = [["Qk = " + br(q.cargas.concentrada) + " kN isolada sobre a tábua, por analogia com a NBR 6120:2019 6.4 (a Tab. 10 não traz carga concentrada para varandas)", "cargas.concentrada"], ["classe do pilar roliço D40 e da tábua de cumaru D60 SEM laudo da espécie", "classe"], ["fu = " + q.guardaCorpo.fixacao.fu + " MPa do parafuso/chumbador sem fonte (a favor: inox A4-70 tem 700 MPa)", "guardaCorpo.fixacao.fu"]];
    pOrigem.forEach(function (x) { if (x[1] === "classe" || x[1] === "guardaCorpo.fixacao.fu") avisos.push("T7: adotado (a confirmar pelo RT): " + x[0] + "."); });
    res.premissas = [{ cod: "Qk", texto: pOrigem[0][0], quem: "RT" }, { cod: "regiao", texto: "região do país da NBR 14718 " + (q.guardaCorpo.regiao ? "informada: " + q.guardaCorpo.regiao : "NÃO informada: adotada a região V (a mais severa)") , quem: "RT" }, { cod: "classe", texto: pOrigem[1][0], quem: "RT/fornecedor" }, { cod: "fu", texto: pOrigem[2][0], quem: "RT" },
      { cod: "vento", texto: comVento.length ? "vento no deck: q da NBR 6123 na cota do topo (" + comVento.map(function (x) { return x.id + " q = " + br(x.qv, 3) + " kN/m² a " + br(x.z, 2) + " m"; }).join("; ") + "), Ca do guarda-corpo pela Fig. 6 da NBR 6123:1988 (φ = Ae/A; sotavento pela Fig. 8), faixa do deck como placa (Ca = 2,0), pilaretes Ca = 1,0 adotado, ψ0 = " + br(q.lateral.psiVento, 1) : "vento no deck NÃO considerado" , quem: "RT" }];
    /* E4 r11 (R35): a mureta da fundação é PREMISSA VISÍVEL — nunca silenciosa: lista os trechos de viga que viraram apoio em mureta, com o critério (face inferior a menos de 15 cm do terreno) */
    var muAll = []; Object.keys(res.decks).forEach(function (id) { (res.decks[id].muretas || []).forEach(function (m) { muAll.push(m); }); });
    if (muAll.length) {
      var fMu = F.pecas.filter(function (pc2) { return pc2.mureta && pc2.p0; }), xsMu = []; fMu.forEach(function (pc2) { var xx = r(pc2.p0[0], 2); if (xsMu.indexOf(xx) < 0) xsMu.push(xx); });
      var txMu = "T7: R35 — " + muAll.length + " trecho(s) de viga (" + muAll.map(function (m) { return m.id; }).join(", ") + "; linhas x = " + xsMu.map(function (x) { return br(x, 2); }).join("; ") + "; " + br(muAll.reduce(function (a, m) { return a + m.L; }, 0), 1) + " m) apoiado(s) em MURETA da fundação SÓ NO TRECHO a menos de 15 cm do terreno (o resto da viga continua viga) — ALTURAS das muretas a informar à fundação (do terreno do modelo ao topo): " + muAll.map(function (m) { return m.id + " " + br(m.altura_min_m || 0, 2) + " a " + br(m.altura_max_m || 0, 2) + " m"; }).join("; ") + " — confirmar com a fundação (outra empresa): reação informada ao projeto de fundação (chapa inox 316 + neoprene é item nosso). Para manter as vigas, desligar a opção \"Não usar mureta\" na entrada do deck (muretaSeAbaixoDoTerreno = falso).";
      avisos.push(txMu); res.premissas.push({ cod: "R35", texto: txMu, quem: "fundação / RT" });
    }
    res.guardaCorpo = null;
    if ((params.guardaCorpo || []).length) {
      var dados = guardaCorpoDados(q, alturaMax), gcv = guardaCorpoVerif(q, P, dados), d0 = params.decks[0], vg = d0.modo === "retangulo" ? d0.vigas : d0.viga, hTopo = (d0.tabua || q.tabua.e) + d0.barrote.h;
      gcv.fixacao = fixacaoVerif(q, P, dados, vg.b, vg.h, hTopo, { hBarrote: d0.barrote.h });
      if (dados.c.assumida) avisos.push("T7: guarda-corpo calculado com a carga da região V (" + dados.c.seguranca + " N/m de segurança) por falta da região da obra.");
      res.guardaCorpo = gcv;
      F.pecas.forEach(function (pc) {            /* a especificação do guarda-corpo passa a trazer o que foi VERIFICADO (era "carga a conferir") */
        if (!/^GC\d+$/.test(pc.id)) return; var g = q.guardaCorpo, fx = gcv.fixacao;
        pc.especificacao = "h " + br(g.h) + " m (NBR 14718, 4.4.1.1); carga de segurança " + dados.c.seguranca + " N/m (Tab. 1, região " + dados.c.regiao + ") e 1,0 kN/m (NBR 6120, Tab. 12) na fixação: montantes " + br(g.montante.b * 100, 0) + "×" + br(g.montante.h * 100, 0) + " cm a cada " + br(g.montante.passo) + " m (η " + br(gcv.montante.eta, 2) + "), em suporte de chapa inox " + br(g.fixacao.tChapaU * 1000, 0) + " mm em U parafusado à viga de borda (2 Ø" + br(g.fixacao.d * 1000, 0) + " passantes em prumo, z = " + br(fx.z * 100, 0) + " cm" + (fx.lado === "3d" ? ", arruela 3d" : ", chapa de apoio " + Math.round(fx.lado * 1000) + "×" + Math.round(fx.lado * 1000) + "×8 mm do lado oposto") + ") + bloqueio entre barrotes com " + fx.bloqueio.n + " parafusos de rosca total; corrimão " + br(g.corrimao.b * 100, 0) + "×" + br(g.corrimao.h * 100, 0) + " cm; réguas verticais " + br(g.regua.b * 100, 0) + "×" + br(g.regua.b * 100, 0) + " cm, vão livre " + br(gcv.reguas.vaoLivre * 100, 1) + " cm ≤ 11 cm";
        pc.verificado = true;
      });
      res.grupos["GC/montante"] = { eta: gcv.montante.eta, id: "GC-montante" }; res.grupos["GC/fixacao"] = { eta: gcv.fixacao.eta, id: "GC-fixacao" };
      res.grupos["GC/deslocamento"] = { eta: gcv.deslocamento.eta, id: "GC-desloc" }; res.grupos["GC/corrimao"] = { eta: gcv.corrimao.eta, id: "GC-corrimao" };
      if (!gcv.reguas.ok) res.grupos["GC/reguas"] = { eta: gcv.reguas.vaoLivre / 0.11, id: "GC-reguas" };
    }
    res.escada = resEsc;
    if (res.escada && res.escada.tipo === "madeira") res.grupos["ESC"] = { eta: res.escada.eta, id: "ESC" };
    res.reacoes = []; Object.keys(res.decks).forEach(function (id) { res.decks[id].pilaretes.forEach(function (p) { res.reacoes.push({ id: p.id, deck: id, tipo: p.tipo, h: p.h, Nmax: Math.max(p.N1, p.N2), Nmin: 1.0 * (p.NG + p.peso), Hd: p.Hd, Md: p.eng ? p.M2 : 0, engastado: !!p.eng }); }); });
    Object.keys(res.grupos).forEach(function (k) { res.pior[k] = res.grupos[k].eta; });
    res.eta = Object.keys(res.pior).reduce(function (m, k) { return Math.max(m, res.pior[k]); }, 0);
    return res;
  }
  /** só verifica (mostra o que reprova) */
  function verificar(proj, sec) { var q = padrao(proj); return rodar(proj, sec || secoesIniciais(q.params)); }

  function crescer(q, sec, grupo, res) {
    var m = /^([^/]+)\/(.+)$/.exec(grupo); if (!m) return false;
    var id = m[1], g = m[2], s = sec[id], L = q.limites, st = q.passo, d = res.params.decks.filter(function (x) { return x.id === id; })[0];
    if (g === "tabua") { var lst = L.tabua, i = lst.indexOf(s.tabua.e || lst[0]); if (i < 0) i = 0; if (i + 1 >= lst.length) return false; s.tabua.e = lst[i + 1]; return true; }
    if (g === "barrote") { if (s.barrote.h + st.altura > L.barrote.hMax + 1e-9) return false; s.barrote.h = r(s.barrote.h + st.altura, 3); return true; }
    if (g === "apoio") { var bM = d.modo === "retangulo" ? 0.30 : L.viga.bMax; if (s.viga.b + st.lado > bM + 1e-9) return false; s.viga.b = r(s.viga.b + st.lado, 3); return true; }
    if (g === "viga") { if (s.viga.h + st.altura > L.viga.hMax + 1e-9) return false; s.viga.h = r(s.viga.h + st.altura, 3); return true; }
    var mfTopo = d.modo === "retangulo" && d.pilar && d.pilar.maosFrancesasTopo, mfLig = res.decks[id] && res.decks[id].maoFrancesa && res.decks[id].maoFrancesa.etaLigacao > 1 + 1e-9;
    if (g === "mf" && (mfTopo || mfLig)) {      /* E4 r10: a ligação da mão-francesa (n parafusos Ø12 por ponta) cresce ANTES do pilar: engrossar o pilar só para descarregar a mão-francesa não é projeto. r13: vale também para o pilarete de base rotulada (força F = H·h/c·√2); teto de 8 parafusos por ponta na mão-francesa 6×12 cm (a1 = 70 mm) */
      var nAt = s.pilarete.mfParafusos || (d.pilar && d.pilar.mfParafusos) || (d.pilarete && d.pilarete.mfParafusos) || 2; if (nAt + 2 <= (mfTopo ? 16 : 8)) { s.pilarete.mfParafusos = nAt + 2; return true; } }
    if (g === "cv" && s.cv) {      /* r11: a diagonal de MLC cresce pela lista de seções comerciais; o tirante pelo catálogo de diâmetros */
      if (s.cv.d != null) { var iT = -1; CV_TIR.forEach(function (x, i) { if (Math.abs(x[0] - s.cv.d) < 1e-6) iT = i; }); if (iT < 0 || iT + 1 >= CV_TIR.length) return false; s.cv.d = CV_TIR[iT + 1][0]; return true; }
      var iS = -1; CV_SEC.forEach(function (x, i) { if (Math.abs(x[0] - s.cv.b) < 1e-6 && Math.abs(x[1] - s.cv.h) < 1e-6) iS = i; }); if (iS < 0) iS = 0; if (iS + 1 >= CV_SEC.length) return false; s.cv.b = CV_SEC[iS + 1][0]; s.cv.h = CV_SEC[iS + 1][1]; return true; }
    if (g === "pilar" || g === "mf") { var lim = d.modo === "retangulo" ? L.pilar.max : L.pilarete.max, k = s.pilarete.d != null ? "d" : "b"; if (s.pilarete[k] + st.lado > lim + 1e-9) return false; s.pilarete[k] = r(s.pilarete[k] + st.lado, 3); return true; }
    return false;
  }
  /** laço de crescimento: seções crescem no passo do fabricante até todos os grupos do deck fecharem (guarda-corpo e escada são verificados, mas não crescem sozinhos: seção informada) */
  function dimensionar(proj, partida, opcoes) {
    opcoes = opcoes || {}; var q = padrao(proj);
    var sec = clone(partida || secoesIniciais(q.params)), hist = [], res, it;
    for (it = 0; it < (opcoes.maxIter || 40); it++) {
      res = rodar(proj, sec); hist.push({ it: it, sec: clone(sec), eta: res.eta });
      var falha = Object.keys(res.pior).filter(function (k) { return res.pior[k] > 1 + 1e-9 && /^[A-Z]+\/(tabua|barrote|viga|pilar|mf|cv|apoio)$/.test(k); });
      if (!falha.length) return { secoes: sec, resultado: res, historico: hist, semSolucao: Object.keys(res.pior).some(function (k) { return res.pior[k] > 1 + 1e-9; }), pior: res.pior };
      var mexeu = false; falha.sort(function (a, b) { return res.pior[b] - res.pior[a]; }).forEach(function (k) { if (crescer(q, sec, k, res)) mexeu = true; });
      if (!mexeu) return { secoes: sec, resultado: res, historico: hist, semSolucao: true, pior: res.pior };
    }
    return { secoes: sec, resultado: res, historico: hist, semSolucao: true, pior: res.pior, motivo: "limite de iterações" };
  }
  /** TROCA AUTOMÁTICA DE SISTEMA (r14): quando o pilarete/pilar chega ao limite da seção (0,30 m; 0,50 m no deck retangular) e o deck NÃO fecha, antes de bloquear tenta, por deck que falha: (1) BASE ENGASTADA pela ligação real (chumbadores selecionados, Kθ calculado: o pilar vira balanço com mola real ou pórtico com a mão-francesa); (2) no deck RETANGULAR, além disso, CONTRAVENTAMENTO EM X entre os pilares (diagonais de MLC, R34). O deck máscara não tem geometria de X entre pilaretes: só o passo (1). Cada troca vai registrada em `trocaSistema` e em avisos — nunca é silenciosa. */
  function escalarSistema(proj, d0, opcoes) {
    var cur = d0, pj = proj, trocas = [], tentadas = [];
    function falhas(dd) { var ids = []; Object.keys(dd.pior || {}).forEach(function (k) { var m = /^([^/]+)\/(pilar|mf)$/.exec(k); if (m && dd.pior[k] > 1 + 1e-9 && ids.indexOf(m[1]) < 0) ids.push(m[1]); }); return ids; }
    function mudar(p0, id, fn) { var ps = ext({}, p0.params); ps.decks = p0.params.decks.map(function (dk) { if (dk.id !== id) return dk; var n = ext({}, dk); fn(n); return n; }); return ext({}, p0, { params: ps }); }
    var passos = [
      { nome: "base engastada pela ligação real (chumbadores e Kθ calculados)", vale: function (dk) { return dk.modo === "retangulo" ? !(dk.pilar && dk.pilar.engastado) : !dk.pilarEngastado; },
        aplica: function (dk) { if (dk.modo === "retangulo") dk.pilar = ext({}, dk.pilar, { engastado: true }); else dk.pilarEngastado = true; } },
      { nome: "contraventamento em X entre os pilares (diagonais de MLC)", vale: function (dk) { return dk.modo === "retangulo" && dk.pilares && dk.pilares.length > 1 && !(dk.pilar && dk.pilar.contraventamento); },
        aplica: function (dk) { dk.pilar = ext({}, dk.pilar, { engastado: true, contraventamento: { tipo: "madeira" } }); } }];
    passos.forEach(function (ps) {
      var ids = falhas(cur).filter(function (id) { var dk = pj.params.decks.filter(function (x) { return x.id === id; })[0]; return dk && ps.vale(dk); });
      if (!ids.length) return;
      var pj2 = pj; ids.forEach(function (id) { pj2 = mudar(pj2, id, ps.aplica); });
      var d2 = dimensionar(pj2, opcoes.partida, opcoes), antes = falhas(cur).length, depois = falhas(d2).length;
      tentadas.push({ passo: ps.nome, decks: ids, falhasAntes: antes, falhasDepois: depois, fechou: !d2.semSolucao });
      if (!d2.semSolucao || depois < antes) { pj = pj2; cur = d2; ids.forEach(function (id) { trocas.push({ deck: id, para: ps.nome, fechou: !d2.semSolucao }); }); }
    });
    return { d: cur, proj: pj, trocas: trocas, tentadas: tentadas };
  }
  function projetar(proj, opcoes) {
    opcoes = opcoes || {};
    var d = dimensionar(proj, opcoes.partida, opcoes), trocaInfo = null;
    if (d.semSolucao && opcoes.trocaSistema !== false) { trocaInfo = escalarSistema(proj, d, opcoes); if (trocaInfo.trocas.length) { d = trocaInfo.d; proj = trocaInfo.proj; } }
    var res = d.resultado, q = res.q;
    if (trocaInfo && trocaInfo.tentadas.length) { trocaInfo.tentadas.forEach(function (t) { res.avisos.push("T7 troca automática de sistema: " + t.passo + " no(s) deck(s) " + t.decks.join(", ") + " (o pilarete/pilar chegou ao limite da seção sem fechar) → " + (t.fechou ? "FECHOU" : (t.falhasDepois < t.falhasAntes ? "melhorou, mas ainda NÃO fecha" : "não resolveu (descartada)")) + "."); }); }
    var out = { trocaSistema: trocaInfo ? trocaInfo.trocas : [], secoes: d.secoes, resultado: res, historico: d.historico, semSolucao: d.semSolucao, pior: d.pior, tipologia: "T7", fonte: { pecas: res.fonte.pecas, volume_por_material_m3: MT.volumePorMaterial ? MT.volumePorMaterial(res.fonte.pecas) : null }, avisos: res.avisos };
    out.ligacoes = pacoteLigacoes(q, res);
    if (AUD && AUD.auditarT7 && opcoes.auditor !== false) out.auditoria = AUD.auditarT7({ pecas: res.fonte.pecas, params: res.params, deck: res, ligacoes: out.ligacoes, terreno: opcoes.terreno, dim: { semSolucao: d.semSolucao, pior: d.pior } });
    return out;
  }

  /* ---------------- ligações do deck (NBR 7190-1:2022, cap. 7) ---------------- */
  function pacoteLigacoes(q, res) {
    var L = { tipologia: "T7", ligacoes: {}, avisos: [], verificacoes: [] }, P = perfilFn(q), pl = P("longa", "mlc"), pc = P("curta", "mlc"), f = MM.resistencias2022(q.classe, pl), fc = MM.resistencias2022(q.classe, pc), cl = MM.classe2022(q.classe);
    Object.keys(res.decks).forEach(function (id) {
      var dv = res.decks[id], d = res.params.decks.filter(function (x) { return x.id === id; })[0];
      // barrote–viga: apoio ⊥ à fibra da viga (6.2.4, Tab. 6) + 2 parafusos de rosca total inclinados para o deslocamento lateral (diafragma)
      var Rmax = 0, bB = d.barrote.b, bV = d.modo === "retangulo" ? d.vigas.b : d.viga.b;
      dv.vigas.forEach(function (v) { (v.res && Object.keys(v.res.reacoes).length) ; });
      dv.barrotes.forEach(function (b) { if (b.res) Object.keys(b.res.reacoes).forEach(function (k) { var rr = b.res.reacoes[k]; Rmax = Math.max(Rmax, 1.4 * (rr[0] + rr[1])); }); });
      var aCm = bB * 100, sig = Rmax / (bB * bV) / 1e3, lim = Math.min(f.fc90d * ML.alfaN(aCm), 0.25 * f.fc0d * ML.alfaN(aCm)), eta1 = sig / lim;
      var WT = ML.PARAFUSOS["WT-T-8,2"], RAX = ML.roscaRaxd({ Rk_ref: WT.RaxK_cruzado150, lefRef: WT.lefRef, lefA: 100, lefB: 100, kmod: pc.kmod }).Rd, Fb = dv.H.total / Math.max(1, dv.barrotes.length), ax = ML.roscaInclinada({ F: Math.max(Fb * 1.4, 0.01), n: 2, anguloGraus: 45, Rax_d: RAX });
      L.ligacoes[id + "/barroteViga"] = { descricao: "Barrote × viga: apoio por contato (σc,90) e 2 parafusos de rosca total WT-T 8,2 a 45° por barrote contra o deslocamento do diafragma.", eta: Math.max(eta1, ax.eta), ok: eta1 <= 1 + 1e-9 && ax.ok, apoio: { Rd: Rmax, sigma: sig, limite: lim, eta: eta1 }, parafusos: { n: 2, eta: ax.eta },
        passos: ["Barrote × viga: Rd = " + br(Rmax, 2) + " kN em " + br(bB * 100, 0) + " × " + br(bV * 100, 0) + " cm → σc,90 = " + br(sig, 3) + " MPa ≤ min(fc90,d; 0,25·fc0,d)·αn = " + br(lim, 3) + " MPa (6.2.4, Tab. 6, p. 17; αn para a' = " + br(aCm, 0) + " cm) → η = " + br(eta1, 3) + "."].concat(ax.passos) };
      // viga–pilarete: apoio ⊥ + chapa interna com pinos para a horizontal Hp
      var pil = dv.pilaretes[0];
      if (pil) {
        var sp = d.modo === "retangulo" ? { b: d.pilar.d, h: d.pilar.d } : (d.pilarete.forma === "circ" ? { b: d.pilarete.d, h: d.pilarete.d } : { b: d.pilarete.b, h: d.pilarete.b }), Nmax = Math.max.apply(null, dv.pilaretes.map(function (x) { return x.N1; }));
        var ap0 = dv.pilaretes.reduce(function (m, x) { return x.apoio && (!m || x.apoio.eta > m.eta) ? x.apoio : m; }, null) || { sigma: 0, limite: 1, eta: 0 }, sg = ap0.sigma, lm = ap0.limite, e2 = ap0.eta;
        var pn = ML.pinosAxiais(ext({}, ML.PADRAO, { kmod: pc.kmod, rhok: cl.rhok }), "viga × pilarete (chapa interna 6 mm + pinos)", 0.001, Math.max(dv.H.porPilarete * 1.4, 0.01, Math.max.apply(null, dv.pilaretes.map(function (x) { return x.Tx_d || 0; }))), sp.b, sp.h, 0.006);
        L.ligacoes[id + "/vigaPilarete"] = { descricao: "Viga × pilarete: apoio por contato (σc,90) e chapa interna com pinos inox para a horizontal.", eta: Math.max(e2, pn.eta || 0), ok: e2 <= 1 + 1e-9 && pn.ok, apoio: { sigma: sg, limite: lm, eta: e2 }, pinos: pn,
          passos: ["Viga × pilarete: Nd = " + br(Nmax, 2) + " kN em " + br(sp.b * 100, 0) + " × " + br(bV * 100, 0) + " cm → σc,90 = " + br(sg, 3) + " MPa ≤ " + br(lm, 3) + " MPa → η = " + br(e2, 3) + "."].concat(pn.passos || []) };
        // base: chumbadores (tração do binário + corte)
        var Mb = Math.max.apply(null, dv.pilaretes.map(function (x) { return x.eng ? x.M2 : 0; })), eng = Mb > 0, z = Math.max(0.1, sp.b - 0.06), Nmin = Math.min.apply(null, dv.pilaretes.map(function (x) { return x.Nfav; }));      /* A5 (r13): N mínimo p/ o arrancamento = permanente FAVORÁVEL (γ = 1,0, NBR 8681) e SEM sobrecarga; a sucção do vento no deck não é calculada (declarado) */
        // chumbadores da base: cresce o diâmetro (M12 a M24, áreas de tensão ISO 898) e o número (4, 6, 8) até fechar; fu = 500 MPa adotado (sem fonte)
        var sel;
        if (dv.contraventamento) {      /* r11: pilar contraventado — mesma seleção do pilar (momento, arrancamento e cortante do quadro) */
          var pcv = dv.pilaretes.filter(function (x) { return x.cv; }).sort(function (x, y) { return y.cv.sel.eta - x.cv.sel.eta; })[0];
          sel = pcv ? pcv.cv.sel : selChumb(true, Mb, z, Nmin, dv.H.porPilarete * 1.4); Mb = pcv ? pcv.cv.MdB : Mb; Nmin = pcv ? pcv.cv.NminB : Nmin; z = pcv ? pcv.cv.zB : z;
        } else sel = selChumb(eng, Mb, z, Nmin, dv.H.porPilarete * 1.4);
        var etaB = sel.eta;
        L.ligacoes[id + "/base"] = { descricao: eng ? "Base engastada: " + sel.n + " chumbadores M" + sel.d + " (" + (sel.n / 2) + " por lado), tração do binário M/z e corte." : "Base rotulada: " + sel.n + " chumbadores M" + sel.d + " só ao corte (H/n).", eta: etaB, ok: etaB <= 1 + 1e-9, Tch: sel.Tch, Vch: sel.Vch, FtRd: sel.FtRd, FvRd: sel.FvRd, d: sel.d / 1000, n: sel.n,
          passos: [(dv.contraventamento ? "Pilar contraventado (X): " : "") + "Base do pilarete: M = " + br(Mb) + " kN·m, z = " + br(z * 100, 0) + " cm, N mín = " + br(Nmin) + " kN → " + sel.n + " chumbadores M" + sel.d + ": tração por chumbador " + br(sel.Tch, 2) + " kN (Ft,Rd " + br(sel.FtRd, 2) + "), corte " + br(sel.Vch, 3) + " kN (Fv,Rd " + br(sel.FvRd, 2) + ") → interação linear η = " + br(etaB, 3) + " (NBR 8800, 6.3.3; fu 500 MPa adotado, sem fonte — a favor; diâmetro e número crescem até fechar)."] };
      }
      if (dv.amarracao) L.ligacoes[id + "/amarracao"] = { descricao: "Amarração do deck à edificação: parafusos/chumbadores Ø" + br(dv.amarracao.d * 1000, 0) + " em linha, chapa de apoio na viga de borda.", eta: dv.amarracao.eta, ok: dv.amarracao.ok, passos: dv.amarracao.passos, chapaApoio_mm: Math.round(dv.amarracao.lado * 1000), n: dv.amarracao.n };
      if (dv.contraventamento) {      /* r11: diagonal/tirante + ligações (ponta da diagonal: chapa interna + pinos; ponta no pilar: chapa + parafusos passantes) */
        var cvx = dv.contraventamento, gv = cvx.gov;
        L.ligacoes[id + "/contraventamento"] = { descricao: cvx.tipo === "tirante" ? "Contraventamento em X de tirantes inox Ø" + br(cvx.d * 1000, 0) + " mm com esticador: tração e rigidez." : "Contraventamento em X de diagonais de MLC " + br(cvx.b * 100, 0) + "×" + br(cvx.h * 100, 0) + " cm: tração na área líquida, chapa interna de aço t = 8 mm e rigidez do quadro.", eta: Math.max(cvx.eta, 0), ok: cvx.ok, passos: cvx.passos, tipo: cvx.tipo, nDiag: cvx.nDiag, nPinosPorPonta: cvx.nPinosPorPonta, dPino: cvx.dPino, Fd: gv.Fd, credito: cvx.credito };
        if (gv.ligDiag) L.ligacoes[id + "/cvDiagonal"] = { descricao: "Ponta da diagonal do contraventamento: chapa interna de aço t = 8 mm em fenda + " + gv.ligDiag.n + " pinos inox Ø" + br(gv.ligDiag.d * 1000, 0) + " (NBR 7190-1:2022, cap. 7).", eta: gv.ligDiag.eta, ok: gv.ligDiag.ok, passos: gv.ligDiag.passos, n: gv.ligDiag.n, d: gv.ligDiag.d };
        if (gv.ligPilar) L.ligacoes[id + "/cvPilar"] = { descricao: "Ponta do contraventamento no pilar roliço: chapa/olhal inox 8 mm + " + gv.ligPilar.n + " parafusos passantes Ø" + br(gv.ligPilar.d * 1000, 0) + ".", eta: gv.ligPilar.eta, ok: gv.ligPilar.ok, passos: gv.ligPilar.passos, n: gv.ligPilar.n, d: gv.ligPilar.d };
      }
      if (dv.maoFrancesa) L.ligacoes[id + "/maoFrancesa"] = { descricao: "Mão-francesa 6×12: compressão, tração e 2 parafusos Ø12 por ponta.", eta: dv.maoFrancesa.eta, ok: dv.maoFrancesa.ok, passos: dv.maoFrancesa.passos };
    });
    if (res.guardaCorpo) L.ligacoes["GC/fixacao"] = { descricao: "Montante do guarda-corpo × viga de borda: 2 parafusos passantes em prumo + chapa de apoio + bloqueio entre barrotes.", eta: res.guardaCorpo.fixacao.eta, ok: res.guardaCorpo.fixacao.ok, passos: res.guardaCorpo.fixacao.passos, chapaApoio_mm: res.guardaCorpo.fixacao.lado === "3d" ? null : Math.round(res.guardaCorpo.fixacao.lado * 1000) };
    if (res.escada && res.escada.ligacaoTopo) L.ligacoes["ESC/topo"] = { descricao: "Longarina × deck: parafusos Ø12 em corte duplo.", eta: res.escada.ligacaoTopo.eta, ok: res.escada.ligacaoTopo.ok, passos: [] };
    L.verificacoes = Object.keys(L.ligacoes).map(function (k) { return { nome: k, eta: L.ligacoes[k].eta, ok: L.ligacoes[k].ok !== false && L.ligacoes[k].eta <= 1 + 1e-9 }; });
    L.eta = L.verificacoes.reduce(function (m, v) { return Math.max(m, v.eta); }, 0); L.ok = L.verificacoes.every(function (v) { return v.ok; });
    return L;
  }

  /** dados do deck CALCULADO que o orçamento precisa (chapas de apoio, bloqueios, amarração): quantidades por montante/trecho, sem preço */
  function paraOrcamento(R, lig) {
    var q = R.q, g = q.guardaCorpo, trechos = (R.params.guardaCorpo || []), nMont = trechos.reduce(function (a, t) { return a + Math.ceil(t.L / g.montante.passo - 1e-9) + 1; }, 0), fx = R.guardaCorpo && R.guardaCorpo.fixacao, d0 = R.params.decks[0];
    var bar = d0 ? d0.barrote : null, out = { nMontantes: R.guardaCorpo ? nMont : 0, chapaApoio: null, bloqueio: null, amarracao: [], bases: [] };
    Object.keys(R.decks).forEach(function (id) { var b = lig && lig.ligacoes && lig.ligacoes[id + "/base"]; if (b && b.n) out.bases.push({ deck: id, n: b.n * R.decks[id].pilaretes.length, d: b.d, nPorPilar: b.n, nPilares: R.decks[id].pilaretes.length }); });
    if (fx && fx.lado !== "3d") out.chapaApoio = { ladoM: fx.lado, espM: 0.008, kgUn: fx.lado * fx.lado * 0.008 * 7900, n: nMont };
    if (fx && bar) out.bloqueio = { n: nMont, parafusosPorUn: fx.bloqueio.n, vUnM3: bar.b * bar.h * Math.max(0, bar.passo - bar.b) };
    out.cv = []; Object.keys(R.decks).forEach(function (id) { var c = R.decks[id].contraventamento; if (!c) return; var lg = lig && lig.ligacoes || {}, nEnd = c.nDiag * 2, nPD = (lg[id + "/cvDiagonal"] || {}).n || 0, nPP = (lg[id + "/cvPilar"] || {}).n || 0, dPD = (lg[id + "/cvDiagonal"] || {}).d || 0.012;
      out.cv.push({ deck: id, tipo: c.tipo, nDiag: c.nDiag, compM: c.comprimentoTotal_m, b: c.b, h: c.h, d: c.d, nPontas: nEnd, kgChapaDiagUn: c.tipo === "madeira" ? 0.008 * Math.max(0.1, c.h - 0.05) * 0.60 * 7900 : 0, kgChapaPilarUn: 0.008 * 0.20 * 0.30 * 7900, pinosDiag: nEnd * nPD, dPinoDiag: dPD, parafPilar: nEnd * nPP, esticadores: c.tipo === "tirante" ? c.nDiag : 0 }); });
    Object.keys(R.decks).forEach(function (id) { var a = R.decks[id].amarracao; if (a) out.amarracao.push({ deck: id, n: a.n, d: a.d, ladoM: a.lado, kgUn: a.lado * a.lado * 0.008 * 7900 }); });
    return out;
  }
  /** linhas do memorial (texto corrido por item) */
  function memorial(res) {
    var L = ["T7 — DECK ELEVADO, ESCADA E GUARDA-CORPO: verificação estrutural (classe de umidade " + res.q.umidade + ", " + res.q.classe + ")"];
    Object.keys(res.decks).forEach(function (id) {
      var dv = res.decks[id]; L.push("", "Deck " + id + " — H horizontal (guarda-corpo, NBR 6120 Tab. 12) = " + br(dv.H.total, 2) + " kN, " + dv.H.nPilaretes + " pilaretes → " + br(dv.H.porPilarete, 3) + " kN cada.");
      dv.tabua.passos.forEach(function (t) { L.push("  " + t); });
      var pb = dv.pior.barrote.id && dv.barrotes.filter(function (b) { return b.id === dv.pior.barrote.id; })[0]; if (pb && pb.res) pb.res.passos.forEach(function (t) { L.push("  [" + pb.id + "] " + t); });
      var pv = dv.pior.viga.id && dv.vigas.filter(function (b) { return b.id === dv.pior.viga.id; })[0]; if (pv && pv.res) pv.res.passos.forEach(function (t) { L.push("  [" + pv.id + "] " + t); });
      var pp = dv.pior.pilar.id && dv.pilaretes.filter(function (b) { return b.id === dv.pior.pilar.id; })[0]; if (pp) pp.passos.forEach(function (t) { L.push("  [" + pp.id + "] " + t); });
      if (dv.maoFrancesa) dv.maoFrancesa.passos.forEach(function (t) { L.push("  " + t); });
      if (dv.contraventamento) dv.contraventamento.passos.forEach(function (t) { L.push("  " + t); });
      if (dv.H && dv.H.info) dv.H.info.passos.forEach(function (t) { L.push("  " + t); });
      if (dv.amarracao) dv.amarracao.passos.forEach(function (t) { L.push("  " + t); });
      (dv.escada || []).forEach(function (e) { L.push("  Reação do topo da " + e.id + " no deck (RG " + br(e.RG, 2) + " + RQ " + br(e.RQ, 2) + " kN), repartida por alavanca entre as vigas " + e.vigas.map(function (v) { return v.id + " (" + br(v.parte * 100, 0) + " %)"; }).join(" e ") + "."); });
    });
    if (res.guardaCorpo) { var g = res.guardaCorpo; [g.montante, g.deslocamento, g.corrimao, g.reguas, g.fixacao].forEach(function (x) { (x.passos || []).forEach(function (t) { L.push("  " + t); }); }); }
    if (res.escada) (res.escada.passos || []).forEach(function (t) { L.push("  " + t); });
    L.push("", "PREMISSAS ADOTADAS (a confirmar pelo RT):"); (res.premissas || []).forEach(function (p) { L.push("  - " + p.texto + " [confirma: " + p.quem + "]"); });
    return L;
  }

  var MadDeck = { PADRAO: PADRAO, TAB1_PRIV: TAB1_PRIV, cargaGC: cargaGC, padrao: padrao, verificar: verificar, dimensionar: dimensionar, projetar: projetar, pacoteLigacoes: pacoteLigacoes, memorial: memorial, paraOrcamento: paraOrcamento, forcaHoriz: forcaHoriz, secoesIniciais: secoesIniciais, _tabuaVerif: tabuaVerif, _fixacaoVerif: fixacaoVerif, _guardaCorpoVerif: guardaCorpoVerif, _guardaCorpoDados: guardaCorpoDados, _perfilFn: perfilFn, _selChumb: selChumb, caFig6: caFig6, etaFig8: etaFig8 };
  if (typeof module !== "undefined" && module.exports) module.exports = MadDeck;
  else global.MadDeck = MadDeck;
})(typeof window !== "undefined" ? window : this);

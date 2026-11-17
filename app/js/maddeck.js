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
  function portico(EI, h, K, Kb) {
    var a = 4 * EI / h, razao = (K + a / 2) / (2 * K + a / 2), kap = K * h / EI, lo = Math.PI / 2, hi = Math.PI, f = function (v) { return Math.tan(v) + v / kap; }, m, i;
    if (Kb != null && isFinite(Kb) && Kb > 0) return porticoMola(EI, h, K, Kb);      /* N3/A4 (E4b): base com a rigidez REAL (pinos madeira–chapa em série com os chumbadores), não engaste perfeito */
    if (!(kap > 1e-9)) return { razao: 1, beta: 2, nu: Math.PI / 2, kappa: 0 };
    for (i = 0; i < 80; i++) { m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
    return { razao: razao, beta: Math.PI / ((lo + hi) / 2), nu: (lo + hi) / 2, kappa: kap };
  }
  /** N3/A4 (E4b): pórtico deslocável com MOLA DE ROTAÇÃO na base (Kb) e no topo (K = mão-francesa). Equações de inclinação (a = 2EI/h): θA = θB·(a + K)/(a + Kb); H·h = Kb·θA + K·θB, logo M_base/(H·h) = Kb·θA/(H·h). Flambagem com translação do topo livre (ábaco de nós deslocáveis): (GA·GB·x² − 36)/(6(GA + GB)) = x/tg x, G = 6EI/(h·K_mola), β = π/x. Kb → ∞ recai em `portico` (base rígida). */
  function porticoMola(EI, h, K, Kb) {
    var am = 2 * EI / h, D1 = Kb * (am + K) / (am + Kb), razao = D1 / (D1 + K), GA = 6 * EI / (h * Kb), GB = K > 1e-9 ? Math.min(6 * EI / (h * K), 1e9) : 1e9;
    function g(x) { return (GA * GB * x * x - 36) / (6 * (GA + GB)) - x / Math.tan(x); }
    var x0 = 1e-4, x1 = x0, gx0 = g(x0), st = (Math.PI - 2e-6) / 4000, k, lo = null, hi = null;
    for (k = 1; k <= 4000; k++) { x1 = x0 + st; var gx1 = g(x1); if (gx0 < 0 && gx1 >= 0 && Math.abs(x1 - Math.PI / 2) > 1e-9) { lo = x0; hi = x1; break; } x0 = x1; gx0 = gx1; }
    if (lo == null) { lo = Math.PI - 1e-3; hi = Math.PI - 1e-6; }
    for (k = 0; k < 80; k++) { var mm = (lo + hi) / 2; if (g(mm) < 0) lo = mm; else hi = mm; }
    var x = (lo + hi) / 2;
    return { razao: razao, beta: Math.PI / x, nu: x, kappa: K * h / EI, Kb: Kb, comMolaBase: true };
  }
  /** R59 (E4b final): MÃO-FRANCESA DUPLA (duas peças 6×12 cm abraçando o pilar e a viga, uma de cada lado) com parafusos passantes em CORTE DUPLO (Tab. 19, 7.2). O grupo de parafusos de cada ponta tem de caber na SOBREPOSIÇÃO da mão-francesa com a peça ligada, com TODAS as distâncias da Tabela 14 da NBR 7190-1:2022 (parafusos passantes: NBR7190-2022_valores.md, linhas 165-169 e 214-216) medidas no referencial da FIBRA DE CADA PEÇA — não do eixo da mão-francesa. Antes só se conferia se as duas pontas cabiam nos 0,9 m: o grupo de 8 Ø12 nem cabia no pilarete 16×16.
   *  Referencial da ponta do pilar: (u, v) = distância ao longo do eixo da mão-francesa a partir do nó (u cresce para a viga) e ao largo; o pilar (fibra vertical) vê x = (u − v)/√2 (largura) e z = (u + v)/√2 (ao longo da fibra); a viga (fibra horizontal), por simetria de 45°, vê a = (v − u)/√2 ao longo da fibra e b = (−u − v)/√2 na altura. Tab. 14, parafusos: a1 = (4 + 3|cos α|)·d; a2 = 4·d; a3,t = maior de 7·d e 80 mm; a4,t = maior de (2 + 2·sen α)·d e 3·d; a4,c = 3·d. Na mão-francesa a força é AXIAL (α = 0); no pilar e na viga a componente da força faz α = 45° com a fibra (a1 = 73,5 mm para Ø12).
   *  Regra de par (adoção, a favor da segurança e usual): dois parafusos só convivem se estiverem a ≥ a1 ao longo da fibra OU a ≥ a2 ao largo, em CADA uma das duas peças. Procura-se por busca exaustiva (malha de 4 mm) o maior grupo que cabe; o grupo começa no lugar certo: a extremidade da mão-francesa fica a a3,t do primeiro parafuso (trecho que passa do nó = sobra da peça: Lpeça = 0,9 m + sobra de cada ponta). */
  var _mfCache = {};
  function tab14Parafuso(d, alfaGraus) { var a = alfaGraus * Math.PI / 180; return { a1: (4 + 3 * Math.abs(Math.cos(a))) * d, a2: 4 * d, a3t: Math.max(7 * d, 0.08), a4: Math.max((2 + 2 * Math.abs(Math.sin(a))) * d, 3 * d), a4c: 3 * d }; }
  function mfBuscaPonta(n, d, largPeca, lado, hMF) {
    hMF = hMF || 0.12; var key = [n, Math.round(d * 1e4), Math.round(largPeca * 1e4), lado, Math.round(hMF * 1e4)].join("|"); if (_mfCache[key]) return _mfCache[key];
    var S2 = Math.SQRT2, tM = tab14Parafuso(d, 0), tP = tab14Parafuso(d, 45), vmax = hMF / 2 - Math.max(tM.a4, tM.a4c), bmax = largPeca / 2 - Math.max(tP.a4, tP.a4c), st = 0.004, C = [], u, v;
    function fr(uu, vv) { return lado === "p" ? { u: uu, v: vv, a: (uu + vv) / S2, b: (uu - vv) / S2 } : { u: uu, v: vv, a: (vv - uu) / S2, b: (-uu - vv) / S2 }; }
    function par(p, q) { return (Math.abs(p.u - q.u) >= tM.a1 - 1e-9 || Math.abs(p.v - q.v) >= tM.a2 - 1e-9) && (Math.abs(p.a - q.a) >= tP.a1 - 1e-9 || Math.abs(p.b - q.b) >= tP.a2 - 1e-9); }
    if (vmax >= 0 && bmax >= 0) for (u = -0.30; u <= 0.50 + 1e-9; u += st) for (v = -vmax; v <= vmax + 1e-9; v += st) { var p = fr(u, v); if (Math.abs(p.b) <= bmax + 1e-9) C.push(p); }
    var best = [], cnt = 0;
    (function dfs(sel, i) {
      if (sel.length > best.length) best = sel.slice(); if (best.length >= n || cnt++ > 300000) return;
      for (var k = i; k < C.length; k++) { if (sel.length + (C.length - k) <= best.length) return; var pk = C[k]; if (sel.every(function (qq) { return par(pk, qq); })) { sel.push(pk); dfs(sel, k + 1); sel.pop(); if (best.length >= n) return; } }
    })([], 0);
    return (_mfCache[key] = { pos: best.map(function (p) { return { u: p.u, v: p.v }; }), n: best.length, tM: tM, tP: tP });
  }
  /** arranjo da mão-francesa dupla com n parafusos de diâmetro d por ponta; o = { d, bPil (largura do pilar no plano), hViga }. cabe = o grupo cabe na sobreposição das duas peças (pilar E viga) e as duas pontas cabem na peça. */
  function arranjoMF(n, Lmf, o) {
    o = o || {}; var d = o.d || 0.012, bPil = o.bPil || 0.16, hV = o.hViga || 0.24, Ln = Lmf || 0.9, gp = mfBuscaPonta(n, d, bPil, "p", o.hMF), gv = mfBuscaPonta(n, d, hV, "v", o.hMF), tM = gp.tM;
    var okG = gp.n >= n && gv.n >= n, pos = gp.pos.slice(0, n), ov = function (g) { if (!g.length) return 0; var umin = Math.min.apply(null, g.map(function (q) { return q.u; })); return Math.max(0, tM.a3t - umin); };
    var posV = gv.pos.slice(0, n), ovP = ov(pos), ovV = ov(posV), ext = function (g) { return g.length ? Math.max.apply(null, g.map(function (q) { return q.u; })) - Math.min.apply(null, g.map(function (q) { return q.u; })) : 0; };
    var comp = Math.max(ext(pos), ext(posV)) + tM.a3t, Lpeca = Ln + ovP + ovV, vs = {}; pos.forEach(function (q) { vs[Math.round(q.v * 1e4)] = 1; });
    var nc = Math.max(1, Object.keys(vs).length);
    return { n: n, d: d, dupla: true, planos: 2, nc: nc, nr: Math.ceil(n / nc), a1: tM.a1, a2: tM.a2, a3: tM.a3t, a4: Math.max(tM.a4, tM.a4c), compPonta: comp, Lmf: Ln, Lpeca: Lpeca, sobraPilar: ovP, sobraViga: ovV, pos: pos, posViga: posV, nMaxPilar: mfBuscaPonta(40, d, bPil, "p", o.hMF).n, nMaxViga: mfBuscaPonta(40, d, hV, "v", o.hMF).n, bPil: bPil, hViga: hV,
      tabPilar: gp.tP, cabe: okG && 2 * comp + 0.10 <= Lpeca + 1e-9 };
  }
  /** R66 (E4b, 2ª revisão): as DUAS direções de mão-francesa no mesmo pilarete. A 1ª (paralela às vigas) chega à viga; a 2ª (perpendicular às vigas — no modo máscara as vigas só correm em Y) chegaria ao nível do fundo da viga onde NÃO há peça: recebe-a uma TRAVESSA de MLC sob a viga, na cota do fundo dela. Os nós da 2ª direção ficam DESLOCADOS para baixo por δ (mão-francesa a 45°: c2 = c + δ, comprimento 0,9 + δ·√2) até que os parafusos dos dois grupos, projetados na fibra do pilarete, fiquem a ≥ a1 (Tab. 14, 45°: 73,5 mm para Ø12) uns dos outros — adoção conservadora para os parafusos perpendiculares não se cruzarem. A altura mínima do pilarete com mão-francesa vira c + max(descida do 1º grupo, δ + descida do 2º) + base + folga. */
  function mfDuasDir(mp, bPil, hViga, travH, hMF) {      /* R73: a direção X NÃO tem mão-francesa (contraventamento em X de madeira entre pilaretes); fica só a da direção das vigas */
    var a1 = arranjoMF(mp.n, 0.9, { d: mp.d, bPil: bPil, hViga: hViga, hMF: hMF }), S2 = Math.SQRT2, zs1 = a1.pos.map(function (q) { return (q.u + q.v) / S2; }), d1 = zs1.length ? Math.max(0, -Math.min.apply(null, zs1)) : 0;
    return { arr1: a1, arr2: a1, delta: 0, zdMax: d1, c2: 0.9 / S2, Lmf2: 0.9, cabe: a1.cabe, travH: travH };
  }
  /** R66 (5ª rodada): vão da travessa biapoiada para um pilarete: a linha de viga vizinha (a <= 2,0 m, em qualquer lado) que dê lugar à 2ª mão-francesa (carga a c2 do eixo, a >= 0,05 m do apoio de ponta e >= 0,10 m do apoio oposto), sem pilarete da mesma altura no caminho. null = sem vão. */
  function acharVao(plp, bP, c2, bVigT, bT, xsB, pils) {
    var ARM = 0.05, xi = plp.p0[0], yi = plp.p0[1], ok = null;
    xsB.filter(function (xb) { return Math.abs(xb - xi) > 0.30 && Math.abs(xb - xi) <= 2.0 + 1e-9; }).sort(function (u, w) { return Math.abs(u - xi) - Math.abs(w - xi); }).forEach(function (xb) {
      if (ok) return;
      var conf = pils.some(function (pp) { return pp.id !== plp.id && (pp.p0[0] - xi) * (pp.p0[0] - xb) < -1e-6 && Math.abs(pp.p0[1] - yi) < bP / 2 + bT / 2 + 0.02; }), noJ = pils.some(function (pp) { return Math.abs(pp.p0[0] - xb) < 1e-3 && Math.abs(pp.p0[1] - yi) < bP / 2 + bT / 2 + 0.02; });
      if (conf) return;
      var Lt = Math.abs(xb - xi) - (bP / 2 + ARM) - ((noJ ? bP / 2 : bVigT / 2) + ARM), a = c2 - (bP / 2 + ARM); if (a >= 0.05 && a <= Lt - 0.10) ok = { xj: xb, sinal: xb > xi ? 1 : -1, Lt: Lt, a: a, noJ: noJ };
    });
    return ok;
  }
  /** R66 (4ª rodada): a travessa NÃO pode ocupar o topo do pilarete (região da ligação viga×pilarete): começa ao lado do pilarete, a >= 25 mm da face dele */
  function travessaForaDoTopo(xIni, xPilar, bPil) { return Math.abs(xIni - xPilar) >= bPil / 2 + 0.025 - 1e-9; }
  function travHde(d) { return (d.pilarete && d.pilarete.travH) || (d.pilar && d.pilar.travH) || 0.16; }
  /** parâmetros da mão-francesa do deck: n parafusos por ponta, diâmetro, e as larguras do pilar e da viga do plano (para a verificação da sobreposição) */
  /** 5ª rodada: seção de CADA peça da mão-francesa dupla (espessura × largura no plano): 6×12 cm de partida; cresce (largura 12 → 16 → 20 cm, depois espessura 6 → 8 cm) quando parafusos e seção do pilarete se esgotam */
  function mfSec(d) { var o = d.pilar || {}, p = d.pilarete || {}; return { b: o.mfB || p.mfB || 0.06, h: o.mfH || p.mfH || 0.12 }; }
  function mfPar(d) { var a = (d.pilar && d.pilar.mfParafusos) || (d.pilarete && d.pilarete.mfParafusos) || 2, dd = (d.pilar && d.pilar.mfD) || (d.pilarete && d.pilarete.mfD) || 0.012; return { n: a, d: dd }; }
  /** E5/R57 (E4b final): comprimentos ADOTADOS (declarados) da verificação geométrica do pilar: folga mínima livre entre a ligação de base e a de topo 0,15 m; comprimento da ligação de uma base ROTULADA (sapata/estribo inox + chumbadores M12) 0,10 m; chapa de apoio do pedestal 0,30 m ao longo da viga. */
  var CX_MF_C = 0.9 / Math.SQRT2, PILAR_FOLGA = 0.15, PILAR_LBASE_ROT = 0.10, PED_CHAPA = 0.30, PED_ARM = 0.06, PED_CBORDA = 0.10, FY_INOX = 205, PED_BASEW = 0.36;      /* N4: fy do inox 316 = 205 MPa (ASTM A240 316; EN 1.4401 = 220 MPa; o MENOR) como premissa visível "conferir com o fornecedor/certificado" — NÃO o 250 do aço carbono do PADRÃO. N5: largura da chapa de base do U = 360 mm com os chumbadores FORA das abas (a mesma da LG12) */      /* R60: braço da resultante do apoio na aba do U (aba de 0,12 m) e borda mínima do chumbador ao concreto (ADOÇÕES declaradas; a fundação confirma) */
  /** ligação viga × pilarete (chapa interna 6 mm + pinos inox) para a horizontal Fd: a MESMA no pacote de ligações e na verificação geométrica */
  function ligTopoPilarete(q, Fd, b, h) {
    var pc = perfilFn(q)("curta", "mlc"), cl = MM.classe2022(q.classe);
    return ML.pinosAxiais(ext({}, ML.PADRAO, { kmod: pc.kmod, rhok: cl.rhok }), "viga × pilarete (chapa interna 6 mm + pinos)", 0.001, Fd, b, h, 0.006);
  }
  /** R66: ligação da travessa ao pilarete (chapa interna 6 mm + pinos): a força da mão-francesa Fd decompõe-se em Fd/√2 ao longo da travessa e Fd/√2 vertical */
  function ligTravessa(q, F, H, b, h) {      /* estribo × travessa: F = horizontal ao longo da travessa, H = vertical (reação) */
    var pc = perfilFn(q)("curta", "mlc"), cl = MM.classe2022(q.classe);
    return ML.pinosAxiais(ext({}, ML.PADRAO, { kmod: pc.kmod, rhok: cl.rhok }), "estribo × travessa (chapa interna 6 mm + pinos)", F, H, b, h, 0.006);
  }
  /** N3 (E4b): LIGAÇÃO madeira–chapa da base engastada do pilarete de deck, pelo pacote de base da T1 (chapa em cruz + pinos inox por Johansen, geometria de bordas, flexão da chapa) + fendilhamento F90 (7.1.1) da transferência transversal, com reforço por rosca total como na T2, + rigidez do conjunto (pinos em série com os chumbadores selecionados). Esforços de cálculo (kN, kN·m). Memoizada (função pura). */
  var _cacheBase = {};
  function baseMadeiraVerif(q, P, pl, clP, M, Ncomp, Hd, Kch) {
    var circ = pl.secao.tipo === "circ", dim = circ ? pl.secao.d : pl.secao.b, key = [circ ? "c" : "q", Math.round(dim * 1e4), clP, Math.round(M * 100), Math.round(Ncomp * 10), Math.round(Hd * 100), Math.round((Kch || 0) / 10)].join("|");
    if (_cacheBase[key]) return _cacheBase[key];
    var pc = P("curta", ""), cl = MM.classe2022(clP), cfg0 = ext({}, ML.PADRAO, { kmod: pc.kmod, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera", dBase: 0.012 });
    var entrada = { secoes: { T: { b: 0.1, h: 0.2 }, V: { b: 0.2 }, VG: { b: 0.1, h: 0.2 }, P: circ ? { forma: "circular", d: dim } : { forma: "quadrado", b: dim, h: dim } }, reacoes: { B0: { Nmax: Math.max(Ncomp, 0.01), Nmin: 0, Hmax: Math.max(Hd, 0.01), Mmax: Math.max(M, 0.001) } },
      lig: { tercaV: { Tmax: 0.1, Cmax: 0.1, Hmax: 0.1 }, pilarTopo: { Tmax: 0.1, Cmax: 0, Hmax: 0.1 }, escora: { Nmax: 0.1 }, bloqueador: { Nmax: 0.1 }, verga: { Vmax: 0.1, Vy: 0.1, Vz: 0.1, Nmax: 0.1 }, pendural: 0.1 }, fitaNmax: 0.1, hV: 0.3, cfg: cfg0 };
    var out;
    try {
      var L = ML.pacoteT1(entrada), b = L.base || {}, ver = [], Kp = L.rigidezBase ? L.rigidezBase.KthetaPinos : null;
      var add = function (nome, x) { if (x) ver.push({ nome: nome, eta: x.eta == null ? 0 : x.eta, ok: x.ok !== false && (x.eta == null || x.eta <= 1 + 1e-9) }); };
      add("pinos madeira–chapa", b); add("geometria da base em cruz", b.cruz); add("flexão da chapa", b.chapa);
      /* fendilhamento: componente ⊥ à fibra das forças dos pinos (soma em módulo: a favor), na borda a he = 4·d da face; reforço por rosca total ⊥ como na T2 */
      var lado = circ ? dim * 0.85 : dim, Db = 0.012, he = Math.max(0.02, (b.centroGrupo ? lado / 2 - b.centroGrupo.a : 4 * Db)), al = Math.min(0.9, he / lado), Fperp = 0;
      ((b.a1PorPino && b.a1PorPino.pinos) || []).forEach(function (pp) { Fperp += pp.F * Math.abs(Math.sin(pp.alfa_graus * Math.PI / 180)); });
      if (!Fperp && b.Fmax) Fperp = b.Fmax * (b.n || 1);
      Fperp = Fperp / 2 + Math.max(0, Hd || 0) / 2;      /* E2 (E4b final): o binário do momento empurra METADE das forças ⊥ para cada face (Σ|F⊥|/2), mas o CORTANTE Hd empurra TODOS os pinos para a MESMA face: a face mais carregada recebe também Hd/2 */
      var F90k = ML.fendilhamentoF90Rk(lado, he, lado), F90d = F90k * pc.kmod / 1.4, eta90 = Fperp / F90d, WT = ML.PARAFUSOS["WT-T-8,2"], RAX = ML.roscaRaxd({ Rk_ref: WT.RaxK_cruzado150, lefRef: WT.lefRef, lefA: 100, lefB: 100, kmod: pc.kmod }).Rd, Ft90 = (1 - 3 * al * al + 2 * Math.pow(al, 3)) * Fperp, ref = null, etaF = eta90;
      if (eta90 > 1) { var nR = Math.max(2, Math.ceil(Ft90 / RAX)); nR += nR % 2; ref = { parafusos: nR, Rax_d: RAX, Ft90_d: Ft90, ok: nR <= 12, eta: Ft90 / (nR * RAX) }; etaF = ref.ok ? ref.eta : eta90; }
      ver.push({ nome: "fendilhamento F90 (7.1.1)", eta: etaF, ok: eta90 <= 1 || (ref && ref.ok) });
      var etaMax = ver.reduce(function (m, v) { return Math.max(m, isFinite(v.eta) ? v.eta : 99); }, 0), okTudo = ver.every(function (v) { return v.ok; }) && !!b.ok;
      var Ktheta = (okTudo && Kp != null) ? ML.emSerie([Kp, Kch || null]) : null;
      out = { ok: okTudo, eta: b.ok ? etaMax : 99, grupo: b.ok ? { n: b.n, nc: b.nc, nr: b.nr, d: b.d, a1: b.a1, a3: b.a3, comprimento: b.comprimento, chapaLarg_mm: b.chapa ? b.chapa.largura_mm : null } : null, Ktheta: Ktheta, Kpinos: Kp, Kchumb: Kch || null, verificacoes: ver, f90: { Fperp: Fperp, F90Rd: F90d, he_mm: he * 1000, eta: eta90, reforco: ref }, base: b,
        passos: ["Base engastada, ligação madeira–chapa (pacote de base da T1): " + (b.ok ? b.nc + " colunas × " + b.nr + " linhas = " + b.n + " pinos Ø" + Math.round(b.d * 1000) + ", a1 = " + br(b.a1 * 1000, 0) + " mm, a3 = " + br(b.a3 * 1000, 0) + " mm, η = " + br(b.eta, 3) : "SEM SOLUÇÃO / RECUSADA: " + ((b.cruz && b.cruz.passos && b.cruz.passos[0]) || "pilarete pequeno demais para a chapa em cruz")) + "; geometria da cruz η = " + (b.cruz && isFinite(b.cruz.eta) ? br(b.cruz.eta, 3) : "∞") + "; flexão da chapa η = " + (b.chapa ? br(b.chapa.eta, 3) : "-") + ".",
          "Fendilhamento (7.1.1): F⊥ = " + br(Fperp, 2) + " kN (metade da soma em módulo das componentes ⊥ à fibra dos pinos, que o binário empurra para cada face, + Hd/2 = " + br(Math.max(0, Hd || 0) / 2, 2) + " kN do cortante, que empurra todos os pinos para a mesma face) contra F90,Rd = 14·b·√(he/(1 − he/h))·kmod/γ = " + br(F90d, 2) + " kN (he = " + br(he * 1000, 0) + " mm) → η = " + br(eta90, 3) + (ref ? "; REFORÇO por " + ref.parafusos + " parafusos de rosca total ⊥ (Ft,90 = " + br(Ft90, 2) + " kN ≤ " + ref.parafusos + " × " + br(RAX, 2) + " kN, η = " + br(ref.eta, 3) + ")" : "") + ".",
          Ktheta != null ? "Rigidez da base: Kθ,pinos = " + br(Kp, 0) + " kN·m/rad (Ku = 2/3·Kser, chapa interna = 2 planos de corte, Σr²) em série com os chumbadores (" + br(Kch || 0, 0) + ") → Kθ = " + br(Ktheta, 0) + " kN·m/rad, usado no β do pórtico." : "Rigidez da base indisponível (ligação não verificada): o engaste NÃO está provado."] };
    } catch (ex) {
      out = { ok: false, eta: 99, Ktheta: null, verificacoes: [{ nome: "base madeira–chapa", eta: 99, ok: false }], passos: ["Base engastada: a ligação madeira–chapa não pôde ser dimensionada (" + String(ex && ex.message || ex).slice(0, 120) + ")."] };
    }
    _cacheBase[key] = out; return out;
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
      dC = CH_CAT[k1][0]; AsC = CH_CAT[k1][1]; nC = CH_NS[k2]; Tc = eng ? Math.max(0, Mb / z - Nmin / 2) / (nC / 2) : Math.max(0, -Nmin) / nC; Vc = Vd / nC; Ftr = ML.chumbadorFtRd(500, AsC); Fvr = ML.chumbadorFvRd(500, Math.PI / 4 * dC * dC); e3 = Math.max(Tc / Ftr + Vc / Fvr, 0);
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
  /* ---------------- R73 (6ª/7ª rodadas, decidido pelo Rogério em 27/10/2026): CONTRAVENTAMENTO EM X de madeira entre pilaretes na direção X ----------------
   * Substitui a mão-francesa em X e a travessa biapoiada (R66). Premissas DECLARADAS: linha em X = apoios com o mesmo y (tolerância CX_TOL = 0,16 m); altura útil da diagonal = h − 0,35 (nó de cima FORA da chapa interna viga×pilarete de 0,304 m) − 0,15 (acima da base)
   * = h − 0,50 m; vão = apoios CONSECUTIVOS da linha (pilarete ou pedestal) a ≤ 2,5 m; ângulo da diagonal com a horizontal entre 25° e 75° (regra de PROJETO, não de norma: a verificação da diagonal, da ligação e da vertical é quem manda).
   * Cada linha leva a fração das cargas verticais dela do H (sem diafragma rígido no piso); a parcela vai aos vãos com X (2 vãos das pontas), pela rigidez axial das diagonais (cruz = 2 diagonais, diagonal única = 1); nenhum crédito a pedestal ou a pilarete sem X.
   * Pilarete–pilarete: CRUZ de Santo André (uma diagonal em cada face, unidas no cruzamento por bloco espaçador de MLC e 1 parafuso passante: flambagem no plano com o trecho maior até o cruzamento real). Pilarete–pedestal: UMA diagonal, do pé do pilarete ao topo do pedestal, ancorada por chapa de inox e 2 chumbadores. */
  var CX_SEC = [[0.06, 0.12], [0.08, 0.12], [0.08, 0.16], [0.10, 0.16], [0.10, 0.20]], CX_PIL_MAX = 0.24, CX_TOP = 0.35, CX_BASE = 0.15, CX_TOL = 0.16, CX_DXMAX = 2.5, CX_ANG0 = 25, CX_ANG1 = 75, CX_PEDDIM = 0.56;
  function cxSecDe(d) { var p = d.pilarete || {}, o = d.pilar || {}, i = p.cxSec != null ? p.cxSec : (o.cxSec != null ? o.cxSec : 0); i = Math.max(0, Math.min(CX_SEC.length - 1, i)); return { i: i, b: CX_SEC[i][0], h: CX_SEC[i][1] }; }
  /** geometria de um vão (puro): a, b = apoios consecutivos da linha; devolve null se não serve */
  /** etapa 1 (coordenação): cota do nó de BAIXO da diagonal acima do pé do pilarete; 0,15 m por padrão e o laço do deck pode SUBI-LA (d.pilarete.cxBase: 0,25 → 0,35 → 0,45) para o grupo de parafusos caber depois da sapata e do a3; o valor em uso fica em cxBaseAtual (fixado por cxAnalisar) e em cx.base */
  var cxBaseAtual = CX_BASE;
  function cxBasePedida(d) { var p = (d && d.pilarete) || {}, o = (d && d.pilar) || {}; return p.cxBase != null ? p.cxBase : (o.cxBase != null ? o.cxBase : CX_BASE); }
  function cxBaseDe(d) { var b = Number(cxBasePedida(d)); if (!isFinite(b)) b = CX_BASE; return Math.max(CX_BASE, Math.min(0.45, b)); }      /* M3 (revisor): a cota do nó de baixo fica entre 0,15 e 0,45 m; fora disso o motor CORTA e avisa (cx.baseCortada) */
  function cxVao(a, b) {
    if ((a.tipo === "ped" && b.tipo === "ped") || a.tipo === "eng" || b.tipo === "eng") return null;      /* pilarete ENGASTADO resiste sozinho (base verificada): não entra no X */
    var dx = Math.abs(b.x - a.x), tipo = (a.tipo === "pil" && b.tipo === "pil") ? "x" : "u", pil = a.tipo === "pil" ? a : b, diags;
    /* R12 (revisor): CADA diagonal com a sua geometria real, a mesma das peças modeladas: a 1ª liga o TOPO de a (z1 − 0,35) à BASE de b (z0 + 0,15); a 2ª, a BASE de a ao TOPO de b. Com pilaretes de alturas/cotas diferentes as duas têm ângulos e comprimentos diferentes (antes: min(h) para as duas). Sem z0/z1 no apoio vale z0 = 0, z1 = h. */
    if (tipo === "x") { var az0 = a.z0 != null ? a.z0 : 0, az1 = a.z1 != null ? a.z1 : a.h, bz0 = b.z0 != null ? b.z0 : 0, bz1 = b.z1 != null ? b.z1 : b.h; diags = [{ hd: (az1 - CX_TOP) - (bz0 + cxBaseAtual) }, { hd: (bz1 - CX_TOP) - (az0 + cxBaseAtual) }]; }
    else diags = [{ hd: pil.h - cxBaseAtual }];
    if (!(dx > 0.05) || diags.some(function (g) { return !(g.hd > 0.05); })) return null;
    diags.forEach(function (g) { g.ang = Math.atan2(g.hd, dx) * 180 / Math.PI; g.Ld = Math.sqrt(dx * dx + g.hd * g.hd); });
    if (dx > CX_DXMAX + 1e-9 || diags.some(function (g) { return g.ang < CX_ANG0 - 1e-9 || g.ang > CX_ANG1 + 1e-9; })) return null;
    var tc = null;      /* R13: fração (do lado de a) em que as duas diagonais da cruz se cruzam, pelas cotas reais dos nós; sem cruzamento dentro do vão fica null (flambagem com o comprimento todo) */
    if (tipo === "x") { var za1 = (a.z1 != null ? a.z1 : a.h) - CX_TOP, zb1 = (b.z0 != null ? b.z0 : 0) + cxBaseAtual, za2 = (a.z0 != null ? a.z0 : 0) + cxBaseAtual, zb2 = (b.z1 != null ? b.z1 : b.h) - CX_TOP, den = (zb1 - za1) - (zb2 - za2); if (Math.abs(den) > 1e-9) { var tt = (za2 - za1) / den; if (tt > 0.02 && tt < 0.98) tc = tt; } }
    return { a: a, b: b, tipo: tipo, dx: dx, hd: diags[0].hd, ang: diags[0].ang, Ld: diags[0].Ld, diags: diags, tc: tc };
  }
  /** Ligação da ponta da diagonal (R73, laço decidido pela coordenação): 2 → 4 → 6 Ø12 e depois 4 → 6 Ø16 inox, passantes em corte simples, DISTÂNCIAS DA TABELA 14 na diagonal (α = 0: a1 = 7d, a2 = 4d, a3,t = 7d, a4 = 3d) e no pilarete/chapa (força a α = 90° − θ da fibra do pilarete: a1 = (4 + 3|cos α|)d, a4 = máx((2 + 2 sen α)d; 3d)); o grupo = colunas × linhas (colunas = 1 com 2 parafusos, senão 2); a largura da seção da diagonal só cresce (laço) para caber o grupo. outro = "pil" (madeira) ou "chapa" (chapa de inox t = 8 mm). */
  /** Posições dos parafusos da ponta da diagonal NO PILARETE (R59 generalizada para o ângulo θ): referencial (u, v) da diagonal (u ao longo do eixo a partir do nó, afastando-se do pilar; v ao largo); no referencial da FIBRA do pilar x = u·cosθ − v·senθ (ao largo, largura bPil) e z = u·senθ + v·cosθ (ao longo da fibra). Tabela 14: na diagonal (α = 0) a1 = 7d, a2 = 4d, a4 = 3d; no pilar (força a α = 90° − θ da fibra) a1 = (4 + 3·senθ)d, a2 = 4d, a4 = máx((2 + 2·cosθ)d; 3d). Regra de par (R59): dois parafusos convivem se ≥ a1 ao longo da fibra OU ≥ a2 ao largo, nas DUAS peças. O grupo fica a no máx. 0,04 m acima do nó (o nó de cima já está a 0,35 m do topo, fora da chapa viga×pilarete). Busca exaustiva (malha de 4 mm). */
  var _cxCache = {};
  /** Candidatos (u, v) da ponta da diagonal no pilarete, no referencial da diagonal, já com as exclusões do pilarete que recebe DUAS diagonais (C1 do revisor): `proib` = parafusos já colocados pela(s) outra(s) diagonal(is) (passantes; x já espelhado para o lado desta diagonal; {x, z, a1, a2, d}) e `zonas` = a PEÇA da(s) outra(s) diagonal(is) ({relx = lado em X da outra × lado desta, relz = idem em Z (cima/baixo), th, h, uEnd = u da ponta da peça no referencial dela}). Um candidato é recusado se (1) violar a regra de par com um parafuso já colocado (a1 na fibra OU a2 ao largo); (2) cair DENTRO da peça oposta (|v'| < h/2 + 1,5d e u' >= uEnd - 1,5d, no referencial dela); (3) deixar um parafuso já colocado DENTRO desta peça (|v| < h/2 + 1,5d do parafuso colocado e u do candidato - 7d <= u do colocado + 1,5d: a ponta desta peça fica a 7d antes do primeiro parafuso). Vale nos dois sentidos, então a ordem em que os grupos são colocados não importa para a validade. */
  function cxCand(d, bPil, hDiag, th, proib, zonas) {
    var c = Math.cos(th), s = Math.sin(th), a1d = 7 * d, a2 = 4 * d, a1p = (4 + 3 * s) * d, a4d = 3 * d, a4p = Math.max((2 + 2 * c) * d, 3 * d), vmax = hDiag / 2 - a4d, xmax = bPil / 2 - a4p, st = 0.004, C = [], u, v, folga = 1.5 * d;
    var lat = proib.map(function (q) { return { u: q.x * c + q.z * s, v: -q.x * s + q.z * c, d: q.d || d }; }), lim = (zonas && zonas.lim) || [];
    if (vmax >= 0 && xmax >= 0) for (u = -0.15; u <= 0.40 + 1e-9; u += st) for (v = -vmax; v <= vmax + 1e-9; v += st) {
      var px = u * c - v * s, pz = u * s + v * c; if (!(Math.abs(px) <= xmax + 1e-9 && pz >= -0.04 - 1e-9)) continue;
      if (!proib.every(function (q) { return Math.abs(pz - q.z) >= Math.max(a1p, q.a1) - 1e-9 || Math.abs(px - q.x) >= Math.max(a2, q.a2) - 1e-9; })) continue;
      if (!zonas.every(function (z) { var xp = z.relx * px, zp = z.relz * pz, up = xp * Math.cos(z.th) + zp * Math.sin(z.th), vp = -xp * Math.sin(z.th) + zp * Math.cos(z.th); return !(Math.abs(vp) < z.h / 2 + folga - 1e-9 && up >= z.uEnd - folga + 1e-9); })) continue;
      if (lim.some(function (L) { var re = L.nR + L.sz * pz; if (re < PILAR_LBASE_ROT + 7 * d - 1e-9 || re > L.hTop - 7 * d + 1e-9) return true; return (L.mf || []).some(function (zm) { return Math.abs(re - zm) < 5 * Math.max(d, L.dmf || d) - 1e-9; }); })) continue;      /* etapa 1 (revisor): a3 da Tab. 14 (7d, extremidade carregada) até o pé do pilarete JÁ DEPOIS da sapata (PILAR_LBASE_ROT) e até o topo; e o grupo da mão-francesa do MESMO pilarete (parafusos passantes em outra direção) a >= 4d na fibra */
      if (!lat.every(function (q) { return !(Math.abs(q.v) < hDiag / 2 + 1.5 * q.d - 1e-9) || (q.u + 1.5 * q.d < 1e-9 && u - 7 * d > q.u + 1.5 * q.d - 1e-9); })) continue;      /* a ponta desta peça é min(0, u do 1º parafuso − 7d): a peça sempre chega ao nó */
      C.push({ u: u, v: v, x: px, z: pz });
    }
    return { C: C, a1d: a1d, a1p: a1p, a2: a2, a4d: a4d, a4p: a4p, par: function (p, q) { return (Math.abs(p.u - q.u) >= a1d - 1e-9 || Math.abs(p.v - q.v) >= a2 - 1e-9) && (Math.abs(p.z - q.z) >= a1p - 1e-9 || Math.abs(p.x - q.x) >= a2 - 1e-9); } };
  }
  function cxChave(n, d, bPil, hDiag, th, proib, zonas) { return [n, Math.round(d * 1e4), Math.round(bPil * 1e4), Math.round(hDiag * 1e4), Math.round(th * 1e3), proib.map(function (q) { return [q.x, q.z, q.a1, q.a2, q.d || 0].map(function (w) { return Math.round(w * 1e4); }).join(","); }).join(";"), zonas.map(function (z) { return [z.relx, z.relz, z.th * 1e3, z.h * 1e3, z.uEnd * 1e4].map(function (w) { return Math.round(w); }).join(","); }).join(";"), JSON.stringify((zonas && zonas.lim) || [])].join("|"); }
  function cxBuscaPil(n, d, bPil, hDiag, th, proib, zonas) {
    proib = proib || []; zonas = zonas || []; var key = cxChave(n, d, bPil, hDiag, th, proib, zonas); if (_cxCache[key]) return _cxCache[key];
    var K = cxCand(d, bPil, hDiag, th, proib, zonas), C = K.C, par = K.par, best = [], cnt = 0;
    (function dfs(sel, i) {
      if (sel.length > best.length) best = sel.slice(); if (best.length >= n || cnt++ > 300000) return;
      for (var k = i; k < C.length; k++) { if (sel.length + (C.length - k) <= best.length) return; var pk = C[k]; if (sel.every(function (q) { return par(pk, q); })) { sel.push(pk); dfs(sel, k + 1); sel.pop(); if (best.length >= n) return; } }
    })([], 0);
    return (_cxCache[key] = { pos: best.map(function (q) { return { u: q.u, v: q.v, x: q.x, z: q.z }; }), n: best.length, a1d: K.a1d, a1p: K.a1p, a2: K.a2, a4d: K.a4d, a4p: K.a4p });
  }
  /** Enumera TODAS as posições possíveis de um grupo JÁ ESCOLHIDO (mesmos n, Ø; busca exaustiva na malha de 4 mm) e chama fn(posições) em cada uma até fn devolver true: serve para refazer o PRIMEIRO grupo sabendo do segundo quando o guloso não fecha (M3 do revisor; a solução do pilarete com dois X pode ser única na malha). */
  function cxAlternativas(n, d, bPil, hDiag, th, proib, zonas, fn) {
    var K = cxCand(d, bPil, hDiag, th, proib || [], zonas || []), C = K.C, par = K.par, parou = false, cnt = 0;
    (function dfs(sel, i) {
      if (parou || cnt++ > 6000000) return;
      if (sel.length === n) { if (fn(sel.map(function (q) { return { u: q.u, v: q.v, x: q.x, z: q.z }; }))) parou = true; return; }
      for (var k = i; k < C.length; k++) { if (sel.length + (C.length - k) < n) return; var pk = C[k]; if (sel.every(function (q) { return par(pk, q); })) { sel.push(pk); dfs(sel, k + 1); sel.pop(); if (parou) return; } }
    })([], 0);
  }
  var CX_LIGS_PIL = [[0.012, 2], [0.012, 4], [0.012, 6], [0.016, 2], [0.016, 4], [0.016, 6]];
  function cxLigPil(Nd, sec, tPil, th, rhok, pm, proib, zonas) {      /* laço da ligação NO pilarete: Ø12 (2→4→6) → Ø16 (2→4→6); se nada fecha, o pilarete cresce (18×18 → 20×20 → 22×22 → 24×24) e depois BLOQUEIA */
    var best = null, esc = null, alf = Math.PI / 2 - th;
    CX_LIGS_PIL.forEach(function (g) {
      var d = g[0], n = g[1]; if (esc || sec.b < 2 * d - 1e-9) return; var bs = cxBuscaPil(n, d, tPil, sec.h, th, proib, zonas); if (bs.n < n) return;
      var rk = ML.madeiraMadeiraSimples(d, sec.b, tPil, 0, alf, rhok, ML.PADRAO.fu, "conifera").Rk, rd = rk * pm.kmod / 1.4 * ML.nefFator(n, Math.max(bs.a1d, bs.a1p), d), eta = Nd / (n * rd), umin = Math.min.apply(null, bs.pos.map(function (q) { return q.u; })), umax = Math.max.apply(null, bs.pos.map(function (q) { return q.u; }));
      var r = { d: d, n: n, nc: 2, rows: Math.ceil(n / 2), eta: eta, rd: rd, rk: rk, a1: Math.max(bs.a1d, bs.a1p), a2: bs.a2, a3: 7 * d, a4: Math.max(bs.a4d, bs.a4p), larg: sec.h, pos: bs.pos, a1p: bs.a1p, uniao: (proib || []).length, sobra: Math.max(0, 7 * d - umin), compGrupo: umax - umin };
      if (!best || eta < best.eta) best = r; if (eta <= 1 + 1e-9) esc = r;
    });
    return esc || best || { d: 0.012, n: 2, nc: 1, rows: 2, eta: 9, rd: 0, rk: 0, a1: 0.084, a2: 0.048, a3: 0.084, a4: 0.036, larg: 0.072, pos: [], sobra: 0, compGrupo: 0, naoCabe: true };
  }
  function cxEtaGrupo(n, d, Nd, sec, tPil, th, rhok, pm) {      /* η de um grupo n Ø d (Johansen, Tab. 14) para a força Nd no ângulo th: só para conferência de projetos antigos */
    var rk = ML.madeiraMadeiraSimples(d, sec.b, tPil, 0, Math.PI / 2 - th, rhok, ML.PADRAO.fu, "conifera").Rk, a1 = Math.max(7 * d, (4 + 3 * Math.sin(th)) * d);
    return Nd / (n * rk * pm.kmod / 1.4 * ML.nefFator(n, a1, d));
  }
  var CX_LIGS = [[0.012, 2, 1], [0.012, 4, 2], [0.012, 6, 2], [0.016, 4, 2], [0.016, 6, 2]];
  function cxLig(Nd, sec, tPil, alf, Ld, rhok, pm, outro) {
    var best = null, esc = null;
    CX_LIGS.forEach(function (g) {
      var d = g[0], n = g[1], nc = g[2], rows = n / nc, a1d = 7 * d, a2 = 4 * d, a3 = 7 * d, a4d = 3 * d, a1p = (4 + 3 * Math.abs(Math.cos(alf))) * d, a4p = Math.max((2 + 2 * Math.sin(alf)) * d, 3 * d);
      var larg = 2 * a4d + (nc - 1) * a2, largP = 2 * a4p + (nc - 1) * a2, comp = (rows - 1) * Math.max(a1d, a1p) + a3 + a3, fit = sec.h >= larg - 1e-9 && (outro === "chapa" || tPil >= largP - 1e-9) && comp <= 0.45 * Ld + 1e-9 && sec.b >= 2 * d - 1e-9;
      if (!fit) return;
      var rk = outro === "chapa" ? ML.chapaCorteSimples(d, sec.b, 0, rhok, ML.PADRAO.fu, 0.008, "conifera") : ML.madeiraMadeiraSimples(d, sec.b, tPil, 0, alf, rhok, ML.PADRAO.fu, "conifera").Rk;
      var rd = rk * pm.kmod / 1.4 * ML.nefFator(rows, Math.max(a1d, a1p), d), eta = Nd / (n * rd), r = { d: d, n: n, nc: nc, rows: rows, eta: eta, rd: rd, rk: rk, a1: Math.max(a1d, a1p), a2: a2, a3: a3, a4: Math.max(a4d, a4p), larg: Math.max(larg, largP) };
      if (!best || eta < best.eta) best = r; if (!esc && eta <= 1 + 1e-9) esc = r;
    });
    return esc || best || { d: 0.012, n: 2, nc: 1, rows: 2, eta: 9, rd: 0, rk: 0, a1: 0.084, a2: 0.048, a3: 0.084, a4: 0.036, larg: 0.072 };
  }
  /** etapa 1 (revisor): momentos que o contraventamento em X introduz no pilarete (valores de cálculo; Vb e dNd já levam o 1,4): Mx = Vb·CX_TOP (horizontal do X aplicada a 0,35 m do topo, no plano do X) e My = (ΣNd·senθ)·e fora do plano (a vertical da diagonal está na FACE: e = (lado do pilarete + largura da diagonal)/2) */
  function cxMomentos(cxP, tPil, bDiag) { if (!cxP) return null; var e = (tPil + bDiag) / 2; return { Mx: cxP.Vb * CX_TOP, My: cxP.dNd * e, e: e }; }
  /** etapa 1 (revisor): força de cálculo na ligação viga × pilarete = máx(parcela da horizontal, mínimo, Vb do contraventamento em X, cortante do pórtico): o Vb do X entra no MESMO máximo nos dois lugares (ligação e altura mínima do topo) */
  function cxFtopo(hDeCalculo, vbMax, txMax) { return Math.max(hDeCalculo || 0, 0.01, vbMax || 0, txMax || 0); }
  function cxAnalisar(o) {
    var d = o.d; cxBaseAtual = cxBaseDe(d); var sec = cxSecDe(d), cl = o.cl, H = o.H, pm = o.P("curta", "mlc"), clM = MM.classe2022(cl), rhok = clM.rhok, fm = MM.resistencias2022(cl, pm), S12 = Math.sqrt(12), apoios = [], linhas = [], porPilar = {}, porPed = {}, tPil = 0.14;
    o.pils.forEach(function (pl) { var rc = o.pilReac[pl.id] || { NG: 0, NQ: 0 }, hh = pl.h_livre != null ? pl.h_livre : Math.abs(pl.p1[2] - pl.p0[2]), bb = pl.secao.tipo === "circ" ? pl.secao.d : pl.secao.b; apoios.push({ tipo: pl.engastado ? "eng" : "pil", id: pl.id, x: pl.p0[0], y: pl.p0[1], h: hh, N: rc.NG + rc.NQ, b: bb, z0: pl.p0[2], z1: pl.p1[2] }); });
    Object.keys(o.pilReac).filter(function (k) { return /^PED@/.test(k); }).forEach(function (k) { var xy = k.slice(4).split(","), rc = o.pilReac[k]; apoios.push({ tipo: "ped", id: k, x: +xy[0], y: +xy[1], h: rc.h || 0, N: rc.NG + rc.NQ, b: CX_PEDDIM }); });
    var tot = apoios.reduce(function (a, p) { return a + p.N; }, 0) || 1;
    if (apoios.some(function (p) { return p.tipo === "pil"; })) tPil = Math.min.apply(null, apoios.filter(function (p) { return p.tipo === "pil"; }).map(function (p) { return p.b; }));
    apoios.forEach(function (p) { var l = linhas.filter(function (q) { return Math.abs(q.y - p.y) < CX_TOL; })[0]; if (!l) { l = { y: p.y, apoios: [] }; linhas.push(l); } l.apoios.push(p); });
    linhas.sort(function (u, v) { return u.y - v.y; });
    function cxEnds(v, i) {      /* pontas da diagonal i do vão v nos pilaretes: nó (cima/baixo), lado em X (e) e sentido em Z (sz: +1 a diagonal SOBE a partir do nó; -1 DESCE) */
      var r; if (v.tipo === "x") r = i === 0 ? [[v.a, "cima", 1, -1], [v.b, "baixo", -1, 1]] : [[v.a, "baixo", 1, 1], [v.b, "cima", -1, -1]];
      else { var pa = v.a.tipo === "pil"; r = [[pa ? v.a : v.b, "baixo", pa ? 1 : -1, 1]]; }
      return r.map(function (x) { return { ap: x[0], nodo: x[1], e: x[2], sz: x[3], key: x[0].id + "|" + x[1], face: (v.diags[i] && v.diags[i].face) || (v.tipo === "x" ? (i === 0 ? 1 : -1) : 1) }; });
    }
    var mfIds = o.mfIds || {}, mfP0 = mfPar(d), mfD = mfP0.d, mfZs = (function () { try { var a = mfDuasDir(mfP0, tPil, o.hVigaMin != null ? o.hVigaMin : 0.24, 0, mfSec(d).h).arr1; return a.pos.map(function (q) { return (q.u + q.v) / Math.SQRT2; }); } catch (e) { return []; } })();      /* zs = cota de cada parafuso do pilarete na mão-francesa em relação ao nó dela (c = 0,9/√2 abaixo do topo) */
    var occ = {};
    function cxConstr(ends, excl) {      /* parafusos e peças das OUTRAS diagonais que chegam aos mesmos nós, no referencial desta */
      var proib = [], zonas = [], tem = false;
      ends.forEach(function (E) { (occ[E.key] || []).forEach(function (O) {
        if (O === excl) return; var oe = O.ends.filter(function (x) { return x.key === E.key; })[0]; if (!oe) return; tem = true;
        O.lig.pos.forEach(function (q) { proib.push({ x: E.e * oe.e * q.x, z: E.sz * oe.sz * q.z, a1: O.lig.a1p, a2: 4 * O.lig.d, d: O.lig.d }); });
        zonas.push({ relx: oe.e * E.e, relz: oe.sz * E.sz, th: O.th, h: sec.h, uEnd: Math.min(0, Math.min.apply(null, O.lig.pos.map(function (q) { return q.u; })) - 7 * O.lig.d) });
      }); });
      zonas.lim = ends.filter(function (E) { return E.ap.tipo === "pil"; }).map(function (E) {      /* limites ao longo da fibra de CADA pilarete da diagonal: cota do nó, altura, sentido (sz) e parafusos da mão-francesa do mesmo pilarete */
        var hT = E.ap.z1 != null ? E.ap.z1 - (E.ap.z0 || 0) : E.ap.h, nR = E.nodo === "baixo" ? cxBaseAtual : hT - CX_TOP;
        return { sz: E.sz, nR: Math.round(nR * 1e4) / 1e4, hTop: Math.round(hT * 1e4) / 1e4, dmf: mfD, mf: mfIds[E.ap.id] ? mfZs.map(function (zs) { return Math.round((hT - CX_MF_C + zs) * 1e4) / 1e4; }) : [] };
      });
      return { proib: proib, zonas: zonas, tem: tem };
    }
    var faceConf = [], semVaoPil = [], precisaPilar = false, hxEng = {}, etaMax = 0, etaDiag = 0, etaLig = 0, etaAnc = 0, VbMax = 0, dNmax = 0, relatorio = [];
    linhas.forEach(function (l) {
      l.apoios.sort(function (u, v) { return u.x - v.x; });
      var pilsL = l.apoios.filter(function (p) { return p.tipo === "pil"; }), frac = l.apoios.reduce(function (a, p) { return a + p.N; }, 0) / tot, Hl = H * frac, vaos = [], i;
      l.frac = frac; l.H = Hl; l.vaos = []; l.escolhidos = [];
      var engL = l.apoios.filter(function (p) { return p.tipo === "eng"; });
      if (!pilsL.length) { if (engL.length && apoios.some(function (p) { return p.tipo === "pil"; })) engL.forEach(function (p) { hxEng[p.id] = Math.max(hxEng[p.id] || 0, Hl / engL.length); }); return; }      /* guarda (deck MISTO: há pilaretes rotulados e engastados): a parcela da linha SÓ com engastados e sem vão com X não some — vai aos engastados (verificados como balanço). No deck todo engastado vale a partilha por rigidez de sempre */
      for (i = 0; i + 1 < l.apoios.length; i++) { var v = cxVao(l.apoios[i], l.apoios[i + 1]); if (v) vaos.push(v); }
      if (!vaos.length) { pilsL.forEach(function (p) { semVaoPil.push({ id: p.id, x: p.x, y: p.y, b: p.b, h: p.h, linha: l.y }); }); return; }
      var esc = vaos.length >= 2 ? [vaos[0], vaos[vaos.length - 1]] : [vaos[0]], kk = esc.map(function (v) { return v.diags.reduce(function (s0, g0) { return s0 + Math.pow(v.dx / g0.Ld, 2) / g0.Ld; }, 0); }), sk = kk.reduce(function (a, b) { return a + b; }, 0);
      l.vaos = vaos.length;
      /* R13 (revisor): FACE (+y/-y) de cada diagonal. A 1ª diagonal do X fica em +y e a 2ª em −y; a diagonal do PEDESTAL fica em +y, e passa para −y se uma diagonal do X (ou outra do pedestal) já ocupa +y no MESMO nó do pilarete; se −y também está ocupada, BLOQUEIA (duas peças na mesma face do mesmo nó) */
      var fN = {}; function fUsa(k0, f0) { return (fN[k0] && fN[k0][f0]) || 0; } function fReg(k0, f0) { (fN[k0] = fN[k0] || {})[f0] = fUsa(k0, f0) + 1; }
      esc.forEach(function (v) { if (v.tipo !== "x") return; v.diags[0].face = 1; v.diags[1].face = -1; cxEnds(v, 0).forEach(function (E) { fReg(E.key, 1); }); cxEnds(v, 1).forEach(function (E) { fReg(E.key, -1); }); });
      esc.forEach(function (v) {
        if (v.tipo !== "u") return; var E0 = cxEnds(v, 0)[0], f = 1;
        if (!o.faceAntiga && fUsa(E0.key, 1)) f = fUsa(E0.key, -1) ? 0 : -1;
        v.diags[0].face = f || 1; if (!f) faceConf.push({ id: E0.ap.id, nodo: E0.nodo, linha: l.y }); fReg(E0.key, f || 1);
      });
      esc.forEach(function (v, j) {
        var Hs = Hl * kk[j] / sk, kD = v.diags.map(function (g0) { return Math.pow(v.dx / g0.Ld, 2) / g0.Ld; }), skD = kD.reduce(function (s0, k0) { return s0 + k0; }, 0), dgs = [];
        /* R12: H do vão dividido entre as diagonais pela rigidez axial projetada k_i = cos²θ_i / L_i (mesma seção): N_i = 1,4·H·(k_i/Σk)/cosθ_i; com geometria igual dá a divisão de sempre (metade para cada) */
        v.diags.forEach(function (g, i) {
          var th = g.ang * Math.PI / 180, Nd = 1.4 * Hs * (kD[i] / skD) / Math.cos(th), L0in = v.tipo === "x" ? g.Ld * (v.tc != null ? Math.max(v.tc, 1 - v.tc) : 1) : g.Ld;      /* R13: trecho MAIOR até o cruzamento real das duas diagonais (antes Ld/2) */
          var cmp = MD.compressao2022({ N: Nd, Mx: 0, My: 0, b: sec.b, h: sec.h, L0x: L0in, L0y: g.Ld, classe: cl, perfil: pm }), lamOut = g.Ld / (sec.b / S12), lamIn = L0in / (sec.h / S12), etaLam = (cmp.esbelto || Math.max(lamOut, lamIn) > 140 + 1e-9) ? 1.01 : 0;      /* etapa 1 (revisor): o limite é o da compressao2022 (40·√12 = 138,6, 9.3), não só os 140 da 6.5.3: λ = 139,3 também reprova */
          var ends = cxEnds(v, i), c = cxConstr(ends, null), lig, etaT;
          /* C1/M3 (revisor), agora POR NÓ REAL (cima/baixo de cada pilarete): cada ponta é buscada sabendo dos parafusos e da peça das diagonais que de fato chegam ao mesmo nó (espelhados), nos dois sentidos */
          lig = cxLigPil(Nd, sec, tPil, th, rhok, pm, c.proib, c.zonas);
          if (c.tem && lig.eta > 1 + 1e-9) {      /* o guloso não fechou: refaz o(s) grupo(s) já colocado(s) no(s) mesmo(s) nó(s) com outras posições (mesmos n e Ø) e tenta de novo */
            var vizinhas = []; ends.forEach(function (E) { (occ[E.key] || []).forEach(function (O) { if (vizinhas.indexOf(O) < 0) vizinhas.push(O); }); });
            vizinhas.forEach(function (O) {
              if (lig.eta <= 1 + 1e-9 || O.lig.pos.length < 1) return; var cO = cxConstr(O.ends, O);
              cxAlternativas(O.lig.n, O.lig.d, tPil, sec.h, O.th, cO.proib, cO.zonas, function (alt) {
                if (lig.eta <= 1 + 1e-9) return true; var antes = O.lig.pos; O.lig.pos = alt; var c2 = cxConstr(ends, null), l3 = cxLigPil(Nd, sec, tPil, th, rhok, pm, c2.proib, c2.zonas);
                if (l3.eta <= 1 + 1e-9) { lig = l3; c = c2; var us = alt.map(function (q) { return q.u; }); O.lig.compGrupo = Math.max.apply(null, us) - Math.min.apply(null, us); O.lig.sobra = Math.max(0, 7 * O.lig.d - Math.min.apply(null, us)); O.lig.refeito = true; return true; }
                O.lig.pos = antes; return false;
              });
            });
          }
          etaT = Nd / (sec.b * (sec.h - lig.nc * 0.013) * 1e3) / fm.ft0d;
          if (lig.eta > 1 + 1e-9) { [0.18, 0.20, 0.22, 0.24].forEach(function (tc) { if (tc > tPil + 1e-9 && tc <= CX_PIL_MAX + 1e-9 && !precisaPilar) { var l2 = cxLigPil(Nd, sec, tc, th, rhok, pm, c.proib, c.zonas); if (l2.eta < lig.eta - 1e-9) precisaPilar = true; } }); if (c.tem) precisaPilar = true; }      /* a ligação está NO pilarete: crescer o pilarete (18 -> 20 -> 22 -> 24 cm) por geometria é permitido; com dois grupos no mesmo nó o maior reposiciona os dois; esgotado o 24x24, BLOQUEIA (A1) */
          var rec = { lig: lig, th: th, ends: ends, vao: v.a.id + "-" + v.b.id, i: i, ang: g.ang, face: g.face };
          ends.forEach(function (E) { (occ[E.key] = occ[E.key] || []).push(rec); });
          dgs.push({ i: i, face: g.face || (v.tipo === "x" ? (i === 0 ? 1 : -1) : 1), ang: g.ang, hd: g.hd, Ld: g.Ld, th: th, Nd: Nd, lamOut: lamOut, lamIn: lamIn, etaComp: Math.max(cmp.eta, etaLam), etaTr: etaT, lig: lig, ends: ends, kfrac: kD[i] / skD });
        });
        var gv = dgs.slice().sort(function (u, w) { return (w.lig.eta - u.lig.eta) || (w.Nd - u.Nd); })[0];
        var tanSum = dgs.reduce(function (s0, g0) { return s0 + g0.kfrac * Math.tan(g0.th); }, 0);
        var sp = { linha: l.y, tipo: v.tipo, ang: gv.ang, dx: v.dx, hd: gv.hd, Ld: gv.Ld, a: v.a, b: v.b, H: Hs, Nd: gv.Nd, lamOut: gv.lamOut, lamIn: gv.lamIn, etaComp: Math.max.apply(null, dgs.map(function (g0) { return g0.etaComp; })), etaTr: Math.max.apply(null, dgs.map(function (g0) { return g0.etaTr; })), lig: gv.lig, tc: v.tc, diags: dgs, dNchar: Hs * tanSum, dNd: 1.4 * Hs * tanSum, cx: v.tipo === "x" };
        if (v.tipo === "u") {      /* extremidade no PEDESTAL: chapa de inox (t = 8 mm) + 2 chumbadores; a diagonal vem do pé do pilarete ao topo do pedestal */
          var th0 = gv.th, Nd = gv.Nd, Fh = 1.4 * Hs, Fv = 1.4 * Hs * Math.tan(th0), ligC = cxLig(Nd, sec, tPil, 0, gv.Ld, rhok, pm, "chapa");
          var T = Fv / 2 + 0.5 * Fh, V = Fh / 2, chm = null;
          [[0.012, 84.3], [0.016, 157], [0.020, 245]].forEach(function (c) { if (chm) return; var ft = ML.chumbadorFtRd(500, c[1], 1.25), fv = ML.chumbadorFvRd(500, Math.PI / 4 * c[0] * c[0] * 1e6), e = T / ft + V / fv; if (e <= 1 + 1e-9) chm = { d: c[0], T: T, V: V, FtRd: ft, FvRd: fv, eta: e }; });
          if (!chm) { var cL = [0.020, 245], ftL = ML.chumbadorFtRd(500, cL[1], 1.25), fvL = ML.chumbadorFvRd(500, Math.PI / 4 * 0.02 * 0.02 * 1e6); chm = { d: 0.020, T: T, V: V, FtRd: ftL, FvRd: fvL, eta: T / ftL + V / fvL }; }
          var chapa = { t: 0.008, w: sec.h, Rd: FY_INOX * 1e3 * 0.008 * (sec.h - ligC.nc * 0.013) / 1.1 }; chapa.eta = Nd / chapa.Rd;
          sp.anc = { Fh: Fh, Fv: Fv, ligacao: ligC, chumbadores: chm, chapa: chapa, eta: Math.max(ligC.eta, chm.eta, chapa.eta) };
          var pp = v.a.tipo === "ped" ? v.a : v.b; porPed[pp.id] = porPed[pp.id] || { Fh: 0, Fv: 0, spans: [] }; porPed[pp.id].Fh += Fh; porPed[pp.id].Fv += Fv; porPed[pp.id].spans.push(sp);
          etaAnc = Math.max(etaAnc, sp.anc.eta);
        }
        sp.eta = Math.max(sp.etaComp, sp.etaTr, Math.max.apply(null, dgs.map(function (g0) { return g0.lig.eta; })), sp.anc ? sp.anc.eta : 0);
        [v.a, v.b].forEach(function (ap) {
          if (ap.tipo !== "pil") return; var pr = porPilar[ap.id] = porPilar[ap.id] || { dNd: 0, dNchar: 0, Vb: 0, spans: [] };
          pr.dNd += sp.dNd; pr.dNchar += sp.dNchar; pr.Vb += v.tipo === "x" ? 1.4 * Hs / 2 : 1.4 * Hs; pr.spans.push(sp);
          VbMax = Math.max(VbMax, pr.Vb); dNmax = Math.max(dNmax, pr.dNd);
        });
        etaDiag = Math.max(etaDiag, sp.etaComp, sp.etaTr); etaLig = Math.max(etaLig, Math.max.apply(null, dgs.map(function (g0) { return g0.lig.eta; }))); etaMax = Math.max(etaMax, sp.eta);
        l.escolhidos.push(sp); relatorio.push(sp);
      });
    });
    /* pilarete sem vão: vira PEDESTAL (R57 estendida, R73b APROVADA pelo Rogério) se a posição comporta o pedestal (pegada de CX_PEDDIM); senão BLOQUEIA */
    var conv = semVaoPil.map(function (s) { return s.id; });
    semVaoPil.forEach(function (s) {
      s.comporta = !apoios.some(function (q) { if (q.id === s.id) return false; var bq = conv.indexOf(q.id) >= 0 ? CX_PEDDIM : q.b; return Math.abs(q.x - s.x) < (CX_PEDDIM + bq) / 2 - 1e-9 && Math.abs(q.y - s.y) < (CX_PEDDIM + bq) / 2 - 1e-9; });
    });
    var bloqPil = semVaoPil.filter(function (s) { return !s.comporta; });
    /* pedestal com diagonal: o topo divide-se entre o U (360 mm), a chapa da diagonal (150 mm) e a borda dos chumbadores dos dois lados: dimensão mínima máx(500; U + chapa + 2·borda); confere se cabe sem invadir os vizinhos */
    var dimX = Math.max(PED_CHAPA + 0.2, PED_BASEW + 0.15 + 2 * PED_CBORDA), confPed = [];
    Object.keys(porPed).forEach(function (k) { var pp = apoios.filter(function (a) { return a.id === k; })[0]; if (!pp) return; var viz = apoios.filter(function (q) { if (q.id === k) return false; var bq = q.tipo === "ped" ? (porPed[q.id] ? dimX : CX_PEDDIM) : q.b; return Math.abs(q.x - pp.x) < (dimX + bq) / 2 - 1e-9 && Math.abs(q.y - pp.y) < (dimX + bq) / 2 - 1e-9; }); if (viz.length) confPed.push({ id: k, x: pp.x, y: pp.y, vizinhos: viz.map(function (q) { return q.id; }) }); porPed[k].dimMin = dimX; });
    var duplos = []; Object.keys(occ).forEach(function (k0) { if (occ[k0].length < 2) return; var pp0 = k0.split("|"); duplos.push({ id: pp0[0], nodo: pp0[1], diags: occ[k0].map(function (O) { var oe = O.ends.filter(function (x) { return x.key === k0; })[0]; return { e: oe.e, sz: oe.sz, face: O.face || oe.face, ang: O.ang, d: O.lig.d, n: O.lig.n, eta: O.lig.eta, pos: O.lig.pos, sobra: O.lig.sobra, vao: O.vao, i: O.i }; }) }); });
    return { hVigaMin: o.hVigaMin, mfZs: mfZs, base: cxBaseAtual, baseCortada: (function () { var q0 = Number(cxBasePedida(d)); return isFinite(q0) && Math.abs(q0 - cxBaseAtual) > 1e-9 ? q0 : null; })(), ctx: { tPil: tPil, rhok: rhok, pm: pm }, duplos: duplos, precisaPilar: precisaPilar, hxEng: hxEng, sec: sec, linhas: linhas, spans: relatorio, porPilar: porPilar, porPed: porPed, semVaoPil: semVaoPil, bloqueados: bloqPil, confPed: confPed, dimX: dimX, eta: Math.max(etaMax, bloqPil.length || confPed.length || faceConf.length ? 1.01 : 0), faceConf: faceConf, etaDiag: etaDiag, etaLig: etaLig, etaAnc: etaAnc, VbMax: VbMax, dNmax: dNmax, nApoios: apoios.length };
  }

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
        pn = ML.pinosAxiais(cfgP, "ligação do tirante ao pilar (chapa/olhal inox 8 mm + parafusos passantes)", Fd * Math.sin(Math.atan(tgT)), Fd * cosT, dPil, dPil, tCh, { Lmax: ML.PINOS_LMAX_PONTA }); chap = { eta: 0 };
        o.ligPilar = pn; o.ligDiag = null;
      } else {
        var ft0d = fm.ft0d, pnD = ML.pinosAxiais(cfgL, "ligação da diagonal DI-CV (chapa interna 8 mm + pinos)", Fd, 0.001, b, h, tCh, { Lmax: Math.min(0.4 * fr.Ld, ML.PINOS_LMAX_PONTA) })      /* item 11 (E4b final): o teto E1 de 0,60 m por ponta vale também nas diagonais do X do deck (40 % da diagonal, e no máximo 0,60 m) */, nPn = pnD && pnD.n ? pnD.n : 0, dPn = pnD && pnD.d ? pnD.d : 0.012, ncP = pnD && pnD.nc ? pnD.nc : 2;
        var Anet = (b - 0.010) * h - ncP * dPn * (b - 0.010); etaT = Fd / (Anet * 1e3) / ft0d; kAx = Eef * 1e3 * b * h / fr.Ld;
        var Ku = ML.kuPino(dPn, clM.rhok, true, 2); kDesl = nPn > 0 ? nPn * Ku / 2 : 1e-9;
        chap = { Rd: tCh * Math.max(0.03, h - 0.05) * cfgL.fy * 1e3 / cfgL.gamaA1 }; chap.eta = Fd / chap.Rd;
        pn = ML.pinosAxiais(cfgP, "ligação da diagonal ao pilar roliço (chapa 8 mm + parafusos passantes)", Fd * Math.sin(Math.atan(tgT)), Fd * cosT, dPil, dPil, tCh, { Lmax: ML.PINOS_LMAX_PONTA });
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
      (v.apoios_externos || []).forEach(function (pt) { var s = posNoSeg(vp.a, vp.b, pt, 0.12); if (s != null) { ap.push(s); ids.push((v.pedestais || []).some(function (pp) { return Math.abs(pp[0] - pt[0]) < 1e-9 && Math.abs(pp[1] - pt[1]) < 1e-9; }) ? "PED@" + pt[0] + "," + pt[1] : null); } });
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
      apS.forEach(function (s, i) { if (idS[i]) { var rr = getR(res.reacoes, s); if (/^PED@/.test(idS[i])) { var e0 = pilReac[idS[i]]; pilReac[idS[i]] = e0 ? { NG: e0.NG + rr[0], NQ: e0.NQ + rr[1], viga: e0.viga + "+" + v.id, h: e0.h, bViga: Math.max(e0.bViga, v.secao.b) } : { NG: rr[0], NQ: rr[1], viga: v.id, h: ((v.pedestais || []).filter(function (pp) { return idS[i] === "PED@" + pp[0] + "," + pp[1]; })[0] || [0, 0, 0])[2], bViga: v.secao.b }; } else pilReac[idS[i]] = { NG: rr[0], NQ: rr[1], viga: v.id }; } });
      out.vigas.push(item);
    });
    // 4) pilaretes / pilares
    var Hinfo = forcaHoriz(q, GC, d, { minX: minX, maxX: maxX, minY: minY, maxY: maxY, hViga: Math.max.apply(null, vigs.map(function (v) { return v.secao.h; }).concat([0])), hBarr: barS.h, pils: pils }), H = Hinfo.H, nP = Math.max(1, pils.length), HpUni = H / nP, Hp = HpUni, engastadoDeck = !!d.pilarEngastado || (d.pilar && d.pilar.engastado), amarrado = !!d.amarracaoEdificacao;
    /* N2 (E4b): a horizontal H vai SÓ aos pilaretes que a resistem (base engastada ou mão-francesa, com o topo não preso à edificação), em proporção à rigidez lateral de cada um (deck rígido: mesmo deslocamento): engastado 3EI/h³ + mão-francesa k_MF/2 (k_MF = E·A/L em série com o deslizamento n·Ku/2; 45°: cos² = 1/2). Pilarete rotulado sem travamento não leva nada. Com amarração à edificação, ou sem nenhum pilarete que resista, vale a divisão uniforme antiga. */
    var HpPor = {}, nRes = 0, kHlat = {}, HpDir = null;
    (function () {
      var soma = 0, nPmfD = mfPar(d).n, dPmfD = mfPar(d).d;
      /* 5ª rodada (B1): volta ao ENVELOPE. Os PEDESTAIS continuam dimensionados com o H inteiro; os PILARETES recebem o H INTEIRO de cada direção, repartido pela rigidez SÓ entre eles (a folga de 6 mm por lado da LG12 e os furos de 1–2 mm fazem os pilaretes rígidos receberem o H antes de o pedestal trabalhar: contar os pedestais na divisão era CONTRA a segurança). Por direção: Y (paralela às vigas) = todos os pilaretes com mão-francesa em Y (ou base engastada); X = só os que TÊM travessa (mão-francesa em X) ou base engastada. O pilarete é verificado com o MAIOR dos dois H. */
      var mpN = mfPar(d), bPilN = pils.length ? Math.min.apply(null, pils.map(function (x) { return x.secao.tipo === "circ" ? (d.pilarete && d.pilarete.aplainado ? d.pilarete.aplainado.chord : x.secao.d) : x.secao.b; })) : 0.16, hVigN = vigs.length ? Math.min.apply(null, vigs.map(function (v) { return v.secao.h; })) : 0.24, bVigN = vigs.length ? Math.min.apply(null, vigs.map(function (v) { return v.secao.b; })) : 0.12;
      var ddN = mfDuasDir(mpN, bPilN, hVigN, travHde(d), mfSec(d).h), xsBN = []; vigs.forEach(function (v) { if (v.p0 && v.p1 && Math.abs(v.p0[0] - v.p1[0]) < 1e-6) { var xx = Math.round(v.p0[0] * 1000) / 1000; if (xsBN.indexOf(xx) < 0) xsBN.push(xx); } });
      var kY = {}, kX = {}, somaY = 0, somaX = 0, comVaoN = {};
      pils.forEach(function (pl0) {
        var circ0 = pl0.secao.tipo === "circ", eng0 = !!pl0.engastado, hh = pl0.h_livre != null ? pl0.h_livre : Math.abs(pl0.p1[2] - pl0.p0[2]), mf0 = mfs.some(function (m) { return m.id === pl0.id.replace(/-P(\d+)$/, "-MF$1"); });
        if (amarrado || !(eng0 || mf0)) return;
        var cM0 = MM.classe2022(cl), kEng = 0, kMFc = 0;
        if (eng0) { var clP0 = (d.pilar && d.pilar.classe) || (d.pilarete && d.pilarete.classe) || (circ0 ? "nativa:D40" : cl), I0 = circ0 ? Math.PI * Math.pow(pl0.secao.d, 4) / 64 : pl0.secao.b * Math.pow(pl0.secao.h, 3) / 12; kEng = 3 * MM.classe2022(clP0).Ec0m * 1e3 * I0 / Math.pow(Math.max(hh, 0.1), 3); }
        if (mf0) { var kA0 = 2 * cM0.Ec0m * 1e3 * mfSec(d).b * mfSec(d).h / 0.9, kD0 = nPmfD * ML.kuPino(dPmfD, cM0.rhok, false, 2) / 2;      /* R59: mão-francesa DUPLA (área x2) e parafuso em corte duplo (Ku x2) */ kMFc = 1 / (1 / kA0 + 1 / kD0) / 2; }
        var cv0 = false;      /* R73: a direção X não tem mão-francesa */
        comVaoN[pl0.id] = cv0;
        kY[pl0.id] = kEng + kMFc; kX[pl0.id] = kEng + (cv0 ? kMFc : 0);
        somaY += kY[pl0.id]; somaX += kX[pl0.id]; kHlat[pl0.id] = kY[pl0.id]; nRes++;
      });
      var HpY = {}, HpX = {};
      pils.forEach(function (pl0) {
        HpY[pl0.id] = (nRes > 0 && somaY > 0) ? (kY[pl0.id] != null ? H * kY[pl0.id] / somaY : 0) : HpUni;
        HpX[pl0.id] = (nRes > 0 && somaX > 0) ? (kX[pl0.id] != null ? H * kX[pl0.id] / somaX : 0) : (nRes > 0 ? 0 : HpUni);
        HpPor[pl0.id] = Math.max(HpY[pl0.id], HpX[pl0.id]);
      });
      HpDir = { Y: HpY, X: HpX, kY: kY, kX: kX, somaY: somaY, somaX: somaX, comVao: comVaoN, nX: Object.keys(kX).filter(function (k) { return kX[k] > 0; }).length };
    })();
    var cxRes = (d.modo !== "retangulo" && !amarrado) ? cxAnalisar({ d: d, pils: pils, pilReac: pilReac, H: H, cl: cl, P: P, hVigaMin: vigs.length ? Math.min.apply(null, vigs.map(function (v) { return v.secao.h; })) : 0, mfIds: pils.reduce(function (m0, p0) { if (mfs.some(function (m) { return m.id === p0.id.replace(/-P(\d+)$/, "-MF$1"); })) m0[p0.id] = 1; return m0; }, {}) }) : null; out.cx = cxRes;
    var HpMax = pils.reduce(function (m, pl0) { return Math.max(m, HpPor[pl0.id] || 0); }, 0); Hp = HpMax;
    out.H = { total: H, porPilarete: HpMax, parcelaUniforme: HpUni, nPilaretes: nP, nResistentes: nRes || nP, porPilar: HpPor, dir: HpDir, info: Hinfo }; out.pior = {}; out.base = null;
    var cvI = cvs.length && engastadoDeck && pils.length ? cvAnalise(q, P, d, cvs, pils, Hinfo, cl, pilReac) : null; out.contraventamento = cvI;
    pils.forEach(function (pl) {
      var Hp = HpPor[pl.id] || 0;      /* N2: parcela deste pilarete (0 se rotulado sem travamento) */
      if (cxRes && cxRes.hxEng[pl.id]) Hp = Math.max(Hp, cxRes.hxEng[pl.id]);
      var rc = pilReac[pl.id] || { NG: 0, NQ: 0 }, circ = pl.secao.tipo === "circ", h = pl.h_livre != null ? pl.h_livre : Math.abs(pl.p1[2] - pl.p0[2]), eng = !!pl.engastado;
      var clP = (d.pilar && d.pilar.classe) || (d.pilarete && d.pilarete.classe) || (circ ? "nativa:D40" : cl), mlcP = ehMlc(clP) ? "mlc" : "";
      var pesoP = (circ ? Math.PI * pl.secao.d * pl.secao.d / 4 : pl.secao.b * pl.secao.h) * h * gM;
      var temMF = mfs.some(function (m) { return m.id === pl.id.replace(/-P(\d+)$/, "-MF$1"); });
      var beta, tipoE, passosB = [];
      var pm0 = null, pmR = null, topoDuro = amarrado;      /* A6 (r13): a caixa "topo travado" NÃO credita nada sozinha — só vale pelo elemento que trava e foi VERIFICADO (amarração à edificação ou X com crédito); sem ele, aviso bloqueante e o pilar é calculado SEM o travamento */
      if (q.lateral.topoTravado && !amarrado && !(cvI && cvI.credito)) out.avisos.push("T7: topo dos pilares declarado TRAVADO pelo usuário, mas sem elemento verificado que trave (nem contraventamento em X com crédito, nem amarração à edificação calculada) no deck " + pre + ": o travamento NÃO foi creditado (pilar calculado sem ele); desmarcar a opção ou projetar o X/a amarração.");
      var Hown = Hinfo.qv > 0 ? Hinfo.qv * (circ ? pl.secao.d : Math.max(pl.secao.b, pl.secao.h)) * h : 0, nPmf = mfPar(d).n, dPmf = mfPar(d).d, Fmf_i = null, Tx_d = null;
      if (eng && temMF && !topoDuro) {      /* R34: topo preso por mão-francesa → pórtico com mola de rotação (modelo REAL), em vez de pilar em balanço */
        var clM = MM.classe2022(cl), clC = MM.classe2022(clP), IcP = circ ? Math.PI * Math.pow(pl.secao.d, 4) / 64 : pl.secao.b * Math.pow(pl.secao.h, 3) / 12, EIp = clC.Ec0m * 1e3 * IcP, Lmf = 0.9, cmf0 = Lmf / Math.SQRT2, nPm = nPmf;
        var kAx = 2 * clM.Ec0m * 1e3 * mfSec(d).b * mfSec(d).h / Lmf, KuP = ML.kuPino(dPmf, clM.rhok, false, 2), kDesl = nPm * KuP / 2, kMF = 1 / (1 / kAx + 1 / kDesl), Kth = kMF * cmf0 * cmf0 / 2, pt = portico(EIp, h, Kth), Kb0 = null, bv0 = null, itB0;
        /* N3/A4 (E4b): a base NÃO é engaste perfeito — M da base ⇄ ligação madeira–chapa (pinos + chumbadores) ⇄ Kθ da base ⇄ M, até convergir (3 %) */
        for (itB0 = 0; itB0 < 4; itB0++) {
          var Mb0 = pt.razao * 1.4 * (Hp * h + Hown * h / 2), zB0 = Math.max(0.1, (circ ? pl.secao.d : pl.secao.b) - 0.06), selB0 = selChumb(true, Mb0, zB0, rc.NG + pesoP, 1.4 * (Hp + Hown));
          bv0 = baseMadeiraVerif(q, P, pl, clP, Mb0, 1.4 * (rc.NG + pesoP + q.cargas.psi0 * rc.NQ), 1.4 * (Hp + Hown), selB0.Ktheta);
          var Kn0 = bv0.ok ? bv0.Ktheta : null; if (Kn0 == null) break;
          var conv0 = Kb0 != null && Math.abs(Kn0 - Kb0) <= 0.03 * Kb0; Kb0 = Kn0; pt = portico(EIp, h, Kth, Kb0); if (conv0) break;
        }
        pm0 = { Kth: Kth, kMF: kMF, kAx: kAx, kDesl: kDesl, EI: EIp, razao: pt.razao, beta: pt.beta, nPm: nPm, KuP: KuP, c: cmf0, Kb: Kb0 };
      }
      if (!eng && temMF && !topoDuro) {      /* C1 (r13): base ROTULADA com a mão-francesa no topo = PÓRTICO DESLOCÁVEL (o topo anda com o deck): β ≥ 2 pela mola de rotação do topo (ν·tg ν = κ), força na mão-francesa F = Heff·h/c·√2 e momento no pilar Heff·(h − c) */
        var clMr = MM.classe2022(cl), clCr = MM.classe2022(clP), IcR = circ ? Math.PI * Math.pow(pl.secao.d, 4) / 64 : pl.secao.b * Math.pow(pl.secao.h, 3) / 12, EIr = clCr.Ec0m * 1e3 * IcR, LmfR = 0.9, cR = Math.min(LmfR / Math.SQRT2, 0.9 * h);
        var kAxR = 2 * clMr.Ec0m * 1e3 * mfSec(d).b * mfSec(d).h / LmfR, KuR = ML.kuPino(dPmf, clMr.rhok, false, 2), kDeslR = nPmf * KuR / 2, kMFR = 1 / (1 / kAxR + 1 / kDeslR), KthR = kMFR * cR * cR / 2, btR = MD.betaFlambagemMola({ C: KthR, EI: EIr, L: h }), HeffR = Hp + Hown / 2;
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
          var Ib = circ ? Math.PI * Math.pow(pl.secao.d, 4) / 64 : pl.secao.b * Math.pow(pl.secao.h, 3) / 12, EIb0 = MM.classe2022(clP).Ec0m * 1e3 * Ib, dBb = circ ? pl.secao.d : pl.secao.b, zBb = Math.max(0.1, dBb - 0.06), MbB = 1.4 * (Hp * h + Hown * h / 2), selA4 = selChumb(true, MbB, zBb, rc.NG + pesoP, 1.4 * (Hp + Hown)), baseA4 = baseMadeiraVerif(q, P, pl, clP, MbB, 1.4 * (rc.NG + pesoP + q.cargas.psi0 * rc.NQ), 1.4 * (Hp + Hown), selA4.Ktheta), KthA4 = baseA4.ok && baseA4.Ktheta != null ? baseA4.Ktheta : selA4.Ktheta, bmA4 = MD.betaFlambagemMola({ C: Math.max(KthA4, 1e-3), EI: EIb0, L: h });
          beta = bmA4.beta; passosB = ["Balanço engastado com a rigidez REAL da base (A4): " + selA4.n + " chumbadores M" + selA4.d + " → Kθ,chumb = " + br(selA4.Ktheta, 0) + " kN·m/rad (n_tracionados·E·As/L_ef·z², L_ef 0,22 m adotado)" + (baseA4.ok && baseA4.Ktheta != null ? ", em série com os pinos madeira–chapa (N3) → Kθ = " + br(KthA4, 0) + " kN·m/rad; " : "; ligação madeira–chapa NÃO verificada, só os chumbadores; ") + bmA4.passos[0]]; }
        if (pm0) passosB = ["Pórtico (R34): mão-francesa 6×12 cm a 45° (c = " + br(pm0.c, 3) + " m) com " + pm0.nPm + " parafusos Ø12 por ponta: k axial = E·A/L = " + br(pm0.kAx, 0) + " kN/m em série com o deslizamento das duas pontas (n·Ku/2 = " + br(pm0.kDesl, 0) + " kN/m; Ku = 2/3·Kser = " + br(pm0.KuP, 0) + " kN/m por parafuso) → k = " + br(pm0.kMF, 0) + " kN/m; Kθ,topo = k·c²/2 = " + br(pm0.Kth, 0) + " kN·m/rad; EI do pilar = " + br(pm0.EI, 0) + " kN·m². M_base/(H·h) = (K + a/2)/(2K + a/2) = " + br(pm0.razao, 3) + " (balanço = 1,000); β = " + br(pm0.beta, 2) + " (tan ν = −ν/κ, topo livre para deslocar). Premissa a validar pelo RT: a viga e os barrotes restringem a rotação da viga no apoio." + (pm0.Kb ? " Base com a rigidez REAL (N3/A4): Kθ,base = " + br(pm0.Kb, 0) + " kN·m/rad (pinos madeira–chapa em série com os chumbadores), com a qual β e o momento da base foram refeitos (mola de rotação também na base)." : " Base tomada como RÍGIDA: a ligação madeira–chapa NÃO foi verificada (ver a reprovação da base).")];
        if (!topo && !q.lateral.krBase && !pm0) tipoE = "balanço engastado (mola real da base)"; }
      else if (pmR) { tipoE = "rotulado na base + mão-francesa (pórtico DESLOCÁVEL, topo com mola de rotação)"; beta = pmR.beta;
        passosB = ["Pórtico de base ROTULADA (C1, r13): o topo anda com o deck, a horizontal só chega ao chão pelo cortante do pilarete — NÃO é pilar travado. Mão-francesa DUPLA (2 × 6×12 cm, metade do Fd em cada peça) a 45° (c = " + br(pmR.c, 3) + " m) com " + pmR.nPm + " parafusos Ø12 por ponta: k = " + br(pmR.kMF, 0) + " kN/m (E·A/L em série com n·Ku/2); Kθ,topo = k·c²/2 = " + br(pmR.Kth, 0) + " kN·m/rad; EI = " + br(pmR.EI, 0) + " kN·m²; κ = Kθ·h/EI = " + br(pmR.kappa, 2) + "; ν·tg ν = κ ⇒ ν = " + br(pmR.nu, 4) + "; β = π/ν = " + br(pmR.beta, 2) + " (≥ 2: nunca 1,0).",
          "Estática (momento no pilar em torno do pé = 0, rótula): H_efetiva = Hp + Hown/2 = " + br(pmR.Heff, 3) + " kN; componente horizontal na mão-francesa = H·h/c = " + br(pmR.Fh, 2) + " kN → força axial F = H·h/c·√2 = " + br(pmR.Fh * Math.SQRT2, 2) + " kN; força horizontal na ligação viga–pilarete = H·(h − c)/c = " + br(pmR.Tx, 2) + " kN; momento máximo no pilarete (no nó da mão-francesa) M = H·(h − c) + Hown·h/8 = " + br(pmR.Mmax, 3) + " kN·m (característico). Premissa a validar pelo RT: viga e barrotes restringem a rotação da viga no apoio."]; }
      else { tipoE = amarrado ? "rotulado-rotulado travado (amarração à edificação)" : (temMF ? "rotulado-rotulado travado" : "rotulado sem travamento"); beta = 1.0; }
      var L0 = beta * h, N1 = 1.4 * (rc.NG + pesoP * 1.0 + rc.NQ) - 0, Hd = 1.4 * (Hp + Hown), M2 = eng ? (pm0 ? pm0.razao : 1) * 1.4 * (Hp * h + Hown * h / 2) : (pmR ? 1.4 * pmR.Mmax : 0), Mtopo = pm0 ? (1 - pm0.razao) * 1.4 * (Hp * h + Hown * h / 2) : 0, N2 = 1.4 * (rc.NG + pesoP + q.cargas.psi0 * rc.NQ);
      if (braced) { M2 = cvB.MdB; N2 += cvI.Nov; }
      var cxP = cxRes && cxRes.porPilar[pl.id]; if (cxP) N2 += cxP.dNd;      /* R73: a componente vertical da(s) diagonal(is) do X soma-se ao axial do pilarete */
      var baseV = null;      /* N3 (E4b): todo pilarete ENGASTADO tem a ligação madeira–chapa verificada (pacote de base da T1 + fendilhamento) com o M de cálculo final */
      if (eng) { var zBv = Math.max(0.1, (circ ? pl.secao.d : pl.secao.b) - 0.06), selBv = selChumb(true, M2, zBv, rc.NG + pesoP, Hd); baseV = baseMadeiraVerif(q, P, pl, clP, M2, N2, Hd, selBv.Ktheta); }      /* r11: momento = vento no pilar (1,4·w·h²/8) + cortante do quadro no nó do pé; N2 soma o binário do X (compressão no pilar do lado da diagonal tracionada) */
      function chk(N, M, car, X) {      /* etapa 1 (revisor): X = momentos do contraventamento em X no pilarete (Mx = Vb·CX_TOP no plano do X; My = (ΣNd·senθ)·e fora do plano, e = excentricidade da diagonal na face): somados, nunca ignorados */
        var pr = P(car, mlcP), mX = X ? X.Mx : 0, mY = X ? X.My : 0;
        if (circ) { var c = MD.circular2022({ N: -N, My: Math.sqrt(Math.pow(M + mX, 2) + mY * mY), Mz: 0, d: pl.secao.d, L0: L0, classe: clP, perfil: pr }); return { eta: c.esbelto ? Math.max(c.eta, 1.0001) : c.eta, esbelto: c.esbelto, lambda: c.lambda, passos: c.passos }; }
        var c2 = MD.compressao2022({ N: N, Mx: M + mX, My: mY, b: pl.secao.b, h: pl.secao.h, L0x: L0, L0y: L0, classe: clP, perfil: pr }); return { eta: c2.esbelto ? Math.max(c2.eta, 1.0001) : c2.eta, esbelto: c2.esbelto, lambda: c2.lambda[0], passos: c2.passos };
      }
      var tPy = circ ? pl.secao.d : Math.max(pl.secao.b, pl.secao.h), cxMom = cxMomentos(cxP, tPy, cxRes && cxRes.sec ? cxRes.sec.b : 0), c1 = chk(N1, 0, "longa"), c2 = chk(N2, M2, "curta", cxMom), eta = Math.max(c1.eta, c2.eta), it = { id: pl.id, h: h, tipo: tipoE, L0: L0, beta: beta, NG: rc.NG, NQ: rc.NQ, peso: pesoP, N1: N1, N2: N2, M2: M2, Hd: Hd, eta: eta, ok: eta <= 1 + 1e-9 && !c1.esbelto && !c2.esbelto, esbelto: c1.esbelto || c2.esbelto, lambda: c1.lambda,
        classe: clP, b: circ ? pl.secao.d : pl.secao.b, circ: circ, travado: temMF || amarrado || eng, eng: eng, Fmf: Fmf_i, Tx_d: Tx_d, Nfav: rc.NG + pesoP - (cxP ? cxP.dNchar : 0), Hp: Hp, base: baseV, pmR: pmR, cv: cvB, cxMom: cxMom, comMF: temMF, portico: pm0 ? { Kth: pm0.Kth, razaoMbase: pm0.razao, beta: pm0.beta, Mtopo_d: Mtopo } : null, passos: ["Pilar " + pl.id + " (" + tipoE + "), h = " + br(h) + " m, L0 = " + br(beta, 1) + "·h = " + br(L0) + " m; reação da viga " + br(rc.NG + rc.NQ) + " kN (G " + br(rc.NG) + " + Q " + br(rc.NQ) + ") + peso próprio " + br(pesoP) + " kN.", "Combinação 1 (permanente + sobrecarga, longa duração): Nd = " + br(N1) + " kN → η = " + br(c1.eta, 3) + ".", "Combinação 2 (G + ψ0·Q + força horizontal do guarda-corpo, curta duração): Nd = " + br(N2) + " kN, Hd = " + br(Hd, 3) + " kN" + (eng ? ", Md = " + (pm0 ? br(pm0.razao, 3) + "·" : "") + "1,4·(Hp·h + Hown·h/2) = 1,4·(" + br(Hp, 2) + "·" + br(h) + " + " + br(Hown, 2) + "·" + br(h) + "/2) = " + br(M2) + " kN·m (vento no próprio pilar: " + br(Hown, 2) + " kN a meia altura)" : (pmR ? ", Md = 1,4·[H·(h − c) + Hown·h/8] = " + br(M2) + " kN·m (pórtico de base rotulada, ver acima)" : " (rótula: a horizontal vai às mãos-francesas)")) + " → η = " + br(c2.eta, 3) + "."].concat(braced ? ["Pilar contraventado (r11): Md = 1,4·Hpilar·h/8 + Vquadro·z_nó = 1,4·" + br(cvB.HownB, 2) + "·" + br(h) + "/8 + " + br(cvI.Vmax, 2) + "·0,40 = " + br(cvB.MdB, 2) + " kN·m; N mín. na base (arrancamento) = " + br(cvB.NminB, 2) + " kN; base: " + cvB.sel.n + " chumbadores M" + cvB.sel.d + " → Kθ = n_tracionados·E·As/L_ef·z² = " + br(cvB.Ktheta, 0) + " kN·m/rad (L_ef 0,22 m adotado)."] : []).concat(passosB).concat(baseV ? baseV.passos : []).concat(c2.passos) };
      var vgp = vigs.filter(function (v) { return v.id === rc.viga; })[0];
      if (vgp) {
        var fP = MM.resistencias2022(cl, P("longa", "mlc")), aCm = (circ ? pl.secao.d : pl.secao.b) * 100, sgm = N1 / ((circ ? pl.secao.d : pl.secao.b) * vgp.secao.b) / 1e3, lmt = Math.min(fP.fc90d * ML.alfaN(aCm), 0.25 * fP.fc0d * ML.alfaN(aCm));
        it.apoio = { N: N1, sigma: sgm, limite: lmt, eta: sgm / lmt, viga: vgp.id, bViga: vgp.secao.b, a: aCm };
        if (sgm / lmt > (out.pior.apoioMax || 0)) { out.pior.apoioMax = sgm / lmt; out.pior.apoioId = pl.id; }
      }
      out.pilaretes.push(it);
    });
    var bgov = out.pilaretes.filter(function (x) { return x.base; }).sort(function (u, v) { return v.base.eta - u.base.eta; })[0];
    if (bgov) out.base = { eta: bgov.base.eta, ok: bgov.base.ok, id: bgov.id, verificacoes: bgov.base.verificacoes, passos: bgov.base.passos, Ktheta: bgov.base.Ktheta, f90: bgov.base.f90, grupo: bgov.base.grupo };
    /* E5 (E4b final): verificação GEOMÉTRICA de todo pilar/pilarete: altura livre >= ligação da base + ligação do topo + folga mínima (0,15 m, adotada). Se não couber, o laço (projetar) troca o pilar por PEDESTAL/BLOCO da fundação (R57). */
    out.geo = null;
    if (out.pilaretes.length) {
      var spG = out.pilaretes[0].b, FtG = cxFtopo(HpMax * 1.4, cxRes ? cxRes.VbMax : 0, out.pilaretes.reduce(function (m, x) { return Math.max(m, x.Tx_d || 0); }, 0)), pnG = ligTopoPilarete(q, FtG, spG, spG), LtG = pnG && isFinite(pnG.comprimento) ? pnG.comprimento : 0, pgG = { eta: 0, id: null }, flG = [];
      var mpG = mfPar(d), dd2G = mfDuasDir(mpG, (d.pilarete && d.pilarete.aplainado ? d.pilarete.aplainado.chord : spG), vigs.length ? Math.min.apply(null, vigs.map(function (v) { return v.secao.h; })) : 0.24, travHde(d), mfSec(d).h), cMFg = 0.9 / Math.SQRT2, zdG = dd2G.zdMax;
      out.pilaretes.forEach(function (it) {
        var Lb = it.eng ? ((it.base && it.base.grupo && it.base.grupo.comprimento) || 0) : PILAR_LBASE_ROT, nec = Lb + LtG + PILAR_FOLGA, necMF = it.comMF ? cMFg + zdG + Lb + PILAR_FOLGA : 0, eg;
        /* R59/E5 (E4b final): com mão-francesa, o nó dela fica c = 0,9/√2 = 0,636 m ABAIXO da viga e o grupo de parafusos desce mais zdG abaixo do nó: a altura mínima do pilarete é c + zdG + base + folga (≈ 0,9 m). Antes só se somavam as ligações de topo e base, e a mão-francesa era desenhada com c = 0,9·h (0,54 m num pilarete de 0,6 m): contradição com os 0,9 m da peça. */
        if (necMF > nec) nec = necMF; eg = nec / Math.max(it.h, 1e-6);
        it.geo = { h: it.h, Lbase: Lb, Ltopo: LtG, folga: PILAR_FOLGA, necessario: nec, necessarioMF: necMF, eta: eg, cabe: nec <= it.h + 1e-9 };
        it.passos.push("Geometria do pilar (E5): altura livre " + br(it.h, 3) + " m " + (it.geo.cabe ? "≥" : "<") + " ligação da base (" + br(Lb, 3) + " m" + (it.eng ? "" : ", base rotulada: sapata inox adotada") + ") + ligação do topo (" + br(LtG, 3) + " m) + folga mínima adotada (" + br(PILAR_FOLGA, 2) + " m)" + (necMF > 0 && necMF >= nec - 1e-9 ? "; com mão-francesa dupla: nó a " + br(cMFg, 3) + " m da viga + grupo " + br(zdG, 3) + " m abaixo do nó + base + folga" : "") + " = " + br(nec, 3) + " m → " + (it.geo.cabe ? "CABE" : "NÃO CABE (a viga passa a apoiar direto em pedestal da fundação, R57)") + ".");
        if (eg > pgG.eta) pgG = { eta: eg, id: it.id }; if (!it.geo.cabe) flG.push({ id: it.id, h: it.h, necessario: nec });
      });
      out.geo = { Ft: FtG, Ltopo: LtG, folga: PILAR_FOLGA, LbaseRot: PILAR_LBASE_ROT, pior: pgG, falhas: flG };
    }
    out.pedestais = [];
    /* R57/R60 (E4b final): apoio da viga em PEDESTAL da fundação (outra empresa). O caminho da horizontal é DIMENSIONADO (antes só havia o atrito do neoprene): APOIO EM U de inox 316 (chapa de base PED_CHAPA = 300 mm ao longo da viga + duas abas que abraçam a viga), com 2 parafusos passantes Ø12 que atravessam a viga (resistem à horizontal ao longo da viga: chapas laterais, Tab. do 7.3, NBR7190-2022_valores.md linha 190) e a aba à FLEXÃO (resistem à horizontal transversal: a viga empurra a aba, que é um balanço engastado na chapa de base; Mpl = fy·t²/4 por metro de aba). Chumbadores M12 à tração + cisalhamento do AÇO. O concreto (borda, arrancamento, dimensão) é da FUNDAÇÃO: o memorial só emite as EXIGÊNCIAS (H,d, N,d, M,d, dimensão mínima, borda). Horizontal por pedestal: o MAIOR entre a divisão igual e a parte pela rigidez de balanço (∝ 1/h³, mesma seção de concreto): a favor da segurança (R60). */
    (function () {
      var ks = Object.keys(pilReac).filter(function (k) { return /^PED@/.test(k); }), nPed = ks.length;
      if (!nPed) return;
      var pcP = P("curta", ""), fP = MM.resistencias2022(cl, P("longa", "mlc")), aCm = PED_CHAPA * 100, lmP = Math.min(fP.fc90d * ML.alfaN(aCm), 0.25 * fP.fc0d * ML.alfaN(aCm)), cfgU = ML.PADRAO, Fv12 = ML.chumbadorFvRd(500, Math.PI / 4 * 12 * 12), Ft12 = ML.chumbadorFtRd(500, 84.3, 1.25), etaMax = 0, idMax = null;
      var w3 = ks.map(function (k) { return Math.pow(Math.max(pilReac[k].h || 0.1, 0.1), -3); }), sw3 = w3.reduce(function (a, v) { return a + v; }, 0);
      var HdLista = ks.map(function (k, i) { return 1.4 * H * Math.max(1 / nPed, w3[i] / sw3); }), HdMax = Math.max.apply(null, HdLista), bVmax = ks.reduce(function (m, k) { return Math.max(m, pilReac[k].bViga || 0); }, 0);
      /* aba do U: resultante do apoio a PED_ARM = 0,06 m acima da chapa de base (aba de 0,12 m, adotada); espessura mínima da lista comercial tal que Mrd = fy·t²/4·L/γa1 >= Hd·arm */
      var armU = PED_ARM, tU = [0.006, 0.008, 0.010, 0.012, 0.016, 0.020].filter(function (tt) { return FY_INOX * 1e3 * tt * tt / 4 * PED_CHAPA / cfgU.gamaA1 >= HdMax * armU - 1e-9; })[0] || 0.020;
      var MrdU = FY_INOX * 1e3 * tU * tU / 4 * PED_CHAPA / cfgU.gamaA1, MsdU = HdMax * armU, etaU = MsdU / MrdU;
      var RkB = ML.chapasExternas(0.012, Math.max(bVmax, 0.05), 0, MM.classe2022(cl).rhok, cfgU.fu, tU, "conifera"), RdB = RkB * pcP.kmod / 1.4;
      var cMin = PED_CBORDA, bUacross = Math.max(PED_BASEW, bVmax + 2 * tU + 2 * 0.07), dimMin = Math.max(PED_CHAPA, bUacross) + 2 * cMin, kgU = (PED_CHAPA * bUacross * tU + 2 * PED_CHAPA * 0.12 * tU) * 7900, leverU = bVmax + 2 * tU + 0.07;      /* N5: peso do U com a base real (360 mm, chumbadores fora das abas) */
      ks.sort().forEach(function (k, i) {
        var rc = pilReac[k], xy2 = k.slice(4).split(","), Nd = 1.4 * (rc.NG + rc.NQ), Hd = HdLista[i], sg = Nd / (PED_CHAPA * rc.bViga) / 1e3, e1 = sg / lmP, id = pre + "-PD" + (i + 1 < 10 ? "0" : "") + (i + 1);
        var Tch = Math.max(0, (Hd * armU / leverU - rc.NG) / 2), e2 = Hd / 2 / Fv12 + Tch / Ft12, eB = Hd / (2 * RdB), Md = Hd * (rc.h + armU), eBr = Hd / (PED_CHAPA * 0.12) / 1e3 / fP.fc90d;
        out.pedestais.push({ id: id, x: +xy2[0], y: +xy2[1], viga: rc.viga, h: rc.h, NG: rc.NG, NQ: rc.NQ, Nd: Nd, Nmin: rc.NG, Hd: Hd, Md: Md, apoio: { sigma: sg, limite: lmP, eta: e1, chapa_m: PED_CHAPA, bViga: rc.bViga },
          chumbadores: { n: 2, d: 12, Vd: Hd / 2, Td: Tch, FvRd: Fv12, FtRd: Ft12, eta: e2 }, parafusosViga: { n: 2, d: 12, Rd: RdB, Vd: Hd / 2, eta: eB, Rk: RkB }, abaU: { t: tU, L: PED_CHAPA, braco: armU, Msd: Hd * armU, Mrd: MrdU, eta: Hd * armU / MrdU, apoioAba_eta: eBr },
          concreto: { dimMin_m: dimMin, cBorda_m: cMin, Hd: Hd, Nd: Nd, Md: Md, kgU: kgU }, eta: Math.max(e1, e2, eB, Hd * armU / MrdU, eBr) });
        var pedO = out.pedestais[out.pedestais.length - 1], cxp = cxRes && cxRes.porPed[k];
        if (cxp) {      /* R73: a diagonal do X ancora direto no topo do pedestal: a horizontal e a vertical dela SOMAM-SE ao que o pedestal já tem (a fundação recebe Hd, Nd e Md totais); o apoio em U segue verificado só com o H do deck */
          pedO.HdU = pedO.Hd; pedO.NminU = pedO.Nmin; pedO.Hd += cxp.Fh; pedO.Nd += cxp.Fv; pedO.Md += cxp.Fh * rc.h; pedO.Nmin -= cxp.Fv / 1.4;      /* a fundação recebe também o ARRANCAMENTO da diagonal (vertical característica) */
          pedO.cx = { dimMin: Math.max(dimMin, bUacross + 0.15 + 2 * cMin), Fh: cxp.Fh, Fv: cxp.Fv, n: cxp.spans.length, eta: Math.max.apply(null, cxp.spans.map(function (s) { return s.anc.eta; })), spans: cxp.spans }; pedO.eta = Math.max(pedO.eta, pedO.cx.eta);
        }
        var ee = out.pedestais[out.pedestais.length - 1].eta;
        if (e1 > (out.pior.apoioMax || 0)) { out.pior.apoioMax = e1; out.pior.apoioId = id; }
        if (ee > etaMax) { etaMax = ee; idMax = id; }
      });
      out.pedestalU = { t: tU, L: PED_CHAPA, braco: armU, HdMax: HdMax, Mrd: MrdU, Msd: MsdU, eta: etaU, RdParafuso: RdB, RkParafuso: RkB, _rhok: MM.classe2022(cl).rhok, _kmod: pcP.kmod, dimMin_m: dimMin, cBorda_m: cMin, kgU: kgU, bAcross_m: bUacross, bViga_m: bVmax, leverU_m: leverU, fyInox_MPa: FY_INOX, distribuicao: "o maior entre a divisão igual (1/" + nPed + ") e a parte pela rigidez de balanço ∝ 1/h³ (mesma seção de concreto)", nPed: nPed, w: w3.map(function (v) { return v / sw3; }) };
      out.pedestalPior = { eta: etaMax, id: idMax };
    })();
    // 5) mãos-francesas
    if (mfs.length) {
      var HownMax = pils.reduce(function (m, pl) { var hh = pl.h_livre != null ? pl.h_livre : Math.abs(pl.p1[2] - pl.p0[2]); return Math.max(m, Hinfo.qv > 0 ? Hinfo.qv * (pl.secao.tipo === "circ" ? pl.secao.d : Math.max(pl.secao.b, pl.secao.h)) * hh : 0); }, 0), MtopoMax = out.pilaretes.reduce(function (m, x) { return Math.max(m, x.portico ? x.portico.Mtopo_d : 0); }, 0) / 1.4, cMF = 0.9 / Math.SQRT2, FmfRot = out.pilaretes.reduce(function (m, x) { return Math.max(m, x.Fmf || 0); }, 0), Fmf = Math.max(FmfRot, MtopoMax > 0 ? MtopoMax * Math.SQRT2 / cMF : (FmfRot > 0 ? 0 : (Hp + HownMax / 2) * Math.SQRT2)), pm = P("curta", "mlc"), msec = mfSec(d), cmf = MD.compressao2022({ N: 1.4 * Fmf / 2, Mx: 0, My: 0, b: msec.b, h: msec.h, L0x: 0.9, L0y: 0.9, classe: cl, perfil: pm }), fm = MM.resistencias2022(cl, pm), etaT = 1.4 * Fmf / 2 / ((msec.b * (msec.h - 2 * 0.013)) * 1e3) / fm.ft0d;
      /* R59 (E4b final): mão-francesa DUPLA (2 × 6×12, metade da força em cada peça) com parafusos passantes em CORTE DUPLO (Tab. 19, 7.2: t1 = 60 mm de cada mão-francesa, t2 = o pilar); o grupo tem de CABER na sobreposição com o pilar e com a viga (arranjoMF) — grupo que não cabe NUNCA aprova (sem exceção para o topo do pilar roliço). */
      var cfg = ML.PADRAO, mpar = mfPar(d), clMF = MM.classe2022(cl), clPMF = MM.classe2022(out.pilaretes.length ? out.pilaretes[0].classe : cl), bPilM = out.pilaretes.length ? Math.min.apply(null, out.pilaretes.map(function (x) { return x.b; })) : 0.16, hVigaM = vigs.length ? Math.min.apply(null, vigs.map(function (v) { return v.secao.h; })) : 0.24, nPMF = mpar.n, dMF = mpar.d,
        apl = d.pilarete && d.pilarete.aplainado ? d.pilarete.aplainado : null, dd2M = mfDuasDir(mpar, apl ? apl.chord : bPilM, hVigaM, travHde(d), mfSec(d).h), arrMF = dd2M.arr1, arr2M = dd2M.arr2, RkMF = ML.madeiraMadeira(dMF, msec.b, apl ? apl.tf : bPilM, 0, Math.PI / 4, Math.min.apply(null, [clMF.rhok, clPMF.rhok].filter(function (v) { return isFinite(v) && v > 0; })), cfg.fu, false, "conifera"), nefMF = ML.nefFator(nPMF, arrMF.a1, dMF), RdP = RkMF * pm.kmod / 1.4 * nefMF, etaL = 1.4 * Fmf / (nPMF * RdP), etaG = dd2M.cabe ? (apl ? Math.max.apply(null, out.pilaretes.map(function (x) { return x.eta; })) * Math.max(apl.Afull / apl.A, apl.Ifull / apl.I) : 0) : 1.01;      /* R68: roliço aplainado → η do pilarete na seção reduzida */      /* etaG > 1: o grupo não cabe → reprova (o laço cresce a ligação: mais parafusos, Ø16, depois o pilar) */
      /* R66 (travessa biapoiada e mão-francesa em X) SUBSTITUÍDA pelo contraventamento em X de madeira entre pilaretes (R73, decidido pelo Rogério em 27/10/2026): ver out.cx. No deck retangular com mão-francesa no topo (R34) a 2ª direção segue SEM solução: bloqueado. */
      var ehRetT = d.modo === "retangulo", porPilarT = {}, etaTrav = ehRetT ? 1.01 : 0, cmf2 = { eta: 0 };
      if (ehRetT) out.avisos.push("T7: R34 — deck " + pre + ": mãos-francesas no topo do pilar sem solução para a 2ª direção (perpendicular às vigas). NÃO APROVADO: o contraventamento em X (R73) só está aplicado ao deck em modo máscara; usar o contraventamento em X entre pilares (R34).");
      out.travessa = ehRetT ? { eta: 1.01, ok: false, semTravessa: true, biapoiada: false } : null;
      out.maoFrancesa = { F: Fmf, Fd: 1.4 * Fmf, etaCompressao: Math.max(cmf.eta, cmf2.eta), etaTracao: etaT, etaLigacao: etaL, eta: Math.max(cmf.eta, cmf2.eta, etaT, etaL, etaG), ok: Math.max(cmf.eta, cmf2.eta, etaT, etaL, etaG) <= 1 + 1e-9, arranjo2: arr2M, delta: dd2M.delta, c2: dd2M.c2, Lmf2: dd2M.Lmf2, n: mfs.length, nPecas: mfs.reduce(function (a, m) { return a + (ehRetT || porPilarT[m.id.replace("-MF", "-P")] ? 4 : 2); }, 0), nDirs: mfs.reduce(function (a, m) { return a + (ehRetT || porPilarT[m.id.replace("-MF", "-P")] ? 2 : 1); }, 0), nIdsX: mfs.filter(function (m) { return !ehRetT && porPilarT[m.id.replace("-MF", "-P")]; }).length, dupla: true, parafusosPorPonta: nPMF, dParafuso: dMF, arranjo: arrMF, sec: msec,
        passos: [FmfRot > 0 && FmfRot >= Fmf - 1e-9 ? "Mão-francesa DUPLA (2 × 6×12 cm, metade do Fd em cada peça) a 45° (0,9 m) de pilarete de base ROTULADA (C1): F = H·h/c·√2 (equilíbrio de momentos do pilar em torno do pé, ver o pilarete) = " + br(Fmf, 3) + " kN (reversível: comprime ou traciona), Fd = " + br(1.4 * Fmf, 3) + " kN. Compressão (L0 = 0,9 m): η = " + br(cmf.eta, 3) + "; tração: η = " + br(etaT, 3) + "." : MtopoMax > 0 ? "Mão-francesa DUPLA (2 × 6×12 cm, metade do Fd em cada peça) a 45° (0,9 m) no pórtico do pilar (R34): o momento do topo (parcela da força horizontal que o pilar NÃO leva na base) é binário na mão-francesa: F = Mtopo/(c/√2) = " + br(MtopoMax, 2) + "/(" + br(cMF / Math.SQRT2, 3) + ") = " + br(Fmf, 3) + " kN (reversível: comprime ou traciona), Fd = " + br(1.4 * Fmf, 3) + " kN. Compressão (L0 = 0,9 m): η = " + br(cmf.eta, 3) + "; tração: η = " + br(etaT, 3) + "." : "Mão-francesa DUPLA (2 × 6×12 cm, metade do Fd em cada peça) a 45° (0,9 m): F = (Hp + Hown/2)/cos45° = (" + br(Hp, 3) + " + " + br(HownMax, 3) + "/2)·1,414 = " + br(Fmf, 3) + " kN (reversível: comprime ou traciona), Fd = " + br(1.4 * Fmf, 3) + " kN. Compressão (L0 = 0,9 m): η = " + br(cmf.eta, 3) + "; tração: η = " + br(etaT, 3) + ".", "Ligação DUPLA (R59): " + nPMF + " parafusos passantes Ø" + Math.round(dMF * 1000) + " por ponta em CORTE DUPLO (Tab. 19, 7.2; t1 = 60 mm de cada mão-francesa, t2 = " + br(bPilM * 1000, 0) + " mm do pilar; n_ef pela Tab. 14, a1 = " + br(arrMF.a1 * 1000, 0) + " mm): Rk = " + br(RkMF, 2) + " kN por parafuso (2 planos), Rd = Rk·kmod/γ·n_ef = " + br(RdP, 2) + " kN → η = " + br(etaL, 3) + ".", "Arranjo por ponta (Tab. 14 em CADA peça, no referencial da fibra dela): mão-francesa a1 = " + br(arrMF.a1 * 1000, 0) + " mm (α = 0), a2 = " + br(arrMF.a2 * 1000, 0) + " mm, a3,t = " + br(arrMF.a3 * 1000, 0) + " mm, a4 = " + br(arrMF.a4 * 1000, 0) + " mm; pilar/viga a 45° (a1 = " + br(arrMF.tabPilar.a1 * 1000, 1) + " mm, a4,t = " + br(arrMF.tabPilar.a4 * 1000, 0) + " mm). Sobreposição com o pilar de " + br(bPilM * 100, 0) + " cm e a viga de " + br(hVigaM * 100, 0) + " cm: cabem no máximo " + arrMF.nMaxPilar + " Ø" + Math.round(dMF * 1000) + " por ponta no pilar e " + arrMF.nMaxViga + " na viga; pedidos " + nPMF + " → " + (arrMF.cabe ? "CABE" : "NÃO CABE (reprova)") + ". Comprimento da peça " + br(arrMF.Lpeca, 2) + " m (0,9 m entre nós + sobra de " + br(arrMF.sobraPilar * 100, 0) + " cm no pilar e " + br(arrMF.sobraViga * 100, 0) + " cm na viga para a3,t)."] };
      out.maoFrancesa.passos.push("Direção X: SEM mão-francesa — a travessa biapoiada (R66) foi SUBSTITUÍDA pelo contraventamento em X de madeira entre pilaretes (R73): ver o item do contraventamento em X.");
    }
    var soPed = !out.pilaretes.length && out.pedestais.length > 0;      /* R60: sem pilar de madeira não há base engastada: a horizontal é resistida pelos PEDESTAIS de concreto (fundação) */
    out.estabilidade = { tipo: soPed ? "pedestais" : (engastadoDeck ? "base-engastada" : (mfs.length ? "maos-francesas" : (amarrado ? "amarracao-edificacao" : null))), engastado: engastadoDeck && !soPed, pedestais: out.pedestais.length, maosFrancesas: mfs.length, contraventamento: cvs.length, amarrado: amarrado };
    if (amarrado) out.amarracao = amarracaoVerif(q, P, d, ext({}, Hinfo, { H: Hinfo.H + (Hinfo.Hpil || 0) / 2 }), { minX: minX, maxX: maxX, minY: minY, maxY: maxY }, vigs);
    function piorDe(L) { var m = 0, id = null; L.forEach(function (x) { var e = isFinite(x.eta) ? x.eta : 99; if (e > m) { m = e; id = x.id; } }); return { eta: m, id: id }; }
    var apx = out.pior.apoioMax || 0, apid = out.pior.apoioId;
    out.pior = { apoio: { eta: apx, id: apid }, tabua: { eta: out.tabua.eta, id: pre + "-TAB" }, barrote: piorDe(out.barrotes), viga: piorDe(out.vigas), pilar: piorDe(out.pilaretes), mf: out.maoFrancesa ? { eta: out.maoFrancesa.eta, id: pre + "-MF" } : { eta: 0 }, tv: out.travessa ? { eta: out.travessa.eta, id: pre + "-TV" } : { eta: 0 }, cx: out.cx ? { eta: out.cx.eta, id: pre + "-CX" } : { eta: 0 }, base: out.base ? { eta: out.base.eta, id: pre + "-BASE" } : { eta: 0 }, cv: out.contraventamento ? { eta: out.contraventamento.eta, id: pre + "-CV" } : { eta: 0 }, amarracao: out.amarracao ? { eta: out.amarracao.eta, id: pre + "-AMARR" } : { eta: 0 } };
    if (out.H.dir && !amarrado && out.pilaretes.length && out.maoFrancesa && (out.pior.mf.eta > 1 + 1e-9 || out.pior.tv.eta > 1 + 1e-9 || out.pior.pilar.eta > 1 + 1e-9)) {      /* 5ª rodada: o H de cada direção só se reparte entre os pilaretes que têm mão-francesa NAQUELA direção; reprovado depois do laço (parafusos → seção do pilarete) → aviso BLOQUEANTE, sem dividir a carga de outro jeito */
      var hY = Math.max.apply(null, Object.keys(out.H.dir.Y).map(function (k) { return out.H.dir.Y[k]; })), hX = Math.max.apply(null, Object.keys(out.H.dir.X).map(function (k) { return out.H.dir.X[k]; }));
      if (hX >= hY - 1e-9) out.avisos.push("T7: R53x — deck " + pre + ": falta rigidez lateral em X: só " + out.H.dir.nX + " dos " + out.H.nResistentes + " pilaretes têm travessa/mão-francesa na direção X e o H inteiro (" + br(out.H.total, 2) + " kN) se reparte entre eles (parcela máx. " + br(hX, 2) + " kN contra " + br(hY, 2) + " kN em Y): η mão-francesa = " + br(out.pior.mf.eta, 2) + ", travessa = " + br(out.pior.tv.eta, 2) + ", pilarete = " + br(out.pior.pilar.eta, 2) + ". O laço já cresceu os parafusos e a seção do pilarete até o limite; a seção da mão-francesa (6×12) não cresce no motor. NÃO APROVADO (sem nova divisão de carga).");
    }
    out.pior.geo = out.geo ? out.geo.pior : { eta: 0 }; out.pior.ped = out.pedestalPior || { eta: 0 };
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
  /** R68 (N7 da 2ª revisão): o corte duplo da mão-francesa exige FACES PLANAS no pilarete. Seção do roliço Ø D com 4 faces aplainadas (quadrado de lado tf = 0,8·D inscrito no círculo): área e inércia por integração numérica (malha de 1 mm). */
  function secaoAplainada(Dc, tf) {
    var A = 0, I = 0, h2 = Dc / 2, y, x, st = 0.001;
    for (y = -h2 + st / 2; y < h2; y += st) for (x = -h2 + st / 2; x < h2; x += st) { if (x * x + y * y <= h2 * h2 && Math.abs(x) <= tf / 2 && Math.abs(y) <= tf / 2) { A += st * st; I += y * y * st * st; } }
    return { A: A, I: I, Afull: Math.PI * Dc * Dc / 4, Ifull: Math.PI * Math.pow(Dc, 4) / 64, tf: tf, chord: 2 * Math.sqrt(Math.max(0, h2 * h2 - tf * tf / 4)) };
  }
  function aplicarSecoes(params, sec) {
    var p = clone(params);
    p.decks.forEach(function (d) {
      var s = sec && sec[d.id]; if (!s) return;
      if (s.tabua && s.tabua.e) d.tabua = s.tabua.e;
      if (s.barrote) d.barrote = ext({}, d.barrote, s.barrote);
      if (s.viga) { if (d.modo === "retangulo") d.vigas = ext({}, d.vigas, s.viga); else d.viga = ext({}, d.viga, s.viga); }
      if (s.pilarete) { if (d.modo === "retangulo") d.pilar = ext({}, d.pilar, s.pilarete); else d.pilarete = ext({}, d.pilarete, s.pilarete); }
      if (d.modo !== "retangulo" && d.pilarete && d.pilarete.forma === "circ" && d.pilarete.d && s.pilarete && s.pilarete.b != null && s.pilarete.d == null) {      /* M3 (4ª rodada): seções já gravadas como SERRADO quadrado (b, sem d) */
        d.pilarete = ext({}, d.pilarete, { forma: "ret", b: s.pilarete.b, serradoMF: true }); delete d.pilarete.d;
      } else if (d.modo !== "retangulo" && d.pilarete && d.pilarete.forma === "circ" && d.pilarete.d) {      /* R68: pilarete ROLIÇO com mão-francesa dupla: faces aplainadas (se o grupo couber na face aplainada) ou pilarete SERRADO quadrado de lado D (decisão por deck, declarada) */
        var Dc = d.pilarete.d, mpR = mfPar(d), spl = secaoAplainada(Dc, 0.8 * Dc), arR = arranjoMF(mpR.n, 0.9, { d: mpR.d, bPil: spl.chord, hViga: d.viga ? d.viga.h : 0.24 });
        if (arR.cabe) d.pilarete = ext({}, d.pilarete, { aplainado: { tf: spl.tf, chord: spl.chord, A: spl.A, I: spl.I, Afull: spl.Afull, Ifull: spl.Ifull } });
        else { d.pilarete = ext({}, d.pilarete, { forma: "ret", b: Dc, serradoMF: true, d: null }); delete d.pilarete.d; }
      }
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
      ["tabua", "barrote", "viga", "pilar", "mf", "tv", "cx", "cv", "apoio", "amarracao", "base", "geo", "ped"].forEach(function (k) { if (dv.pior[k] && dv.pior[k].eta) res.grupos[d.id + "/" + k] = { eta: dv.pior[k].eta, id: dv.pior[k].id }; });
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
    if (Object.keys(res.decks).some(function (id) { return res.decks[id].pilaretes.some(function (x) { return x.comMF && !x.eng; }); })) res.premissas.push({ cod: "E3", texto: "PENDÊNCIA DECLARADA (E3, revisão final): a rigidez lateral do pilarete com mão-francesa e base rotulada é tomada como k_MF/2, independente da altura; o modelo físico é k = 1/(h²/(k_MF·c²/2) + h³/(3·E·I)), e por ele os pilaretes MAIS CURTOS recebem mais horizontal que a parcela adotada (Casa Mar DS: até ~2,3 × na ligação viga–pilarete e na base dos curtos, com folga nos casos conferidos; a força na mão-francesa fica a favor: ~4,2 kN pelo modelo físico contra 8,0 kN adotado). Aproximação a refinar (distribuição pela rigidez real) e a validar pelo RT; num deck que MISTURE pilares engastados e com mão-francesa, o engastado fica quase sem carga neste modelo", quem: "RT" });
    /* E4 r11 (R35): a mureta da fundação é PREMISSA VISÍVEL — nunca silenciosa: lista os trechos de viga que viraram apoio em mureta, com o critério (face inferior a menos de 15 cm do terreno) */
    var muAll = []; Object.keys(res.decks).forEach(function (id) { (res.decks[id].muretas || []).forEach(function (m) { muAll.push(m); }); });
    if (muAll.length) {
      var fMu = F.pecas.filter(function (pc2) { return pc2.mureta && pc2.p0; }), xsMu = []; fMu.forEach(function (pc2) { var xx = r(pc2.p0[0], 2); if (xsMu.indexOf(xx) < 0) xsMu.push(xx); });
      var txMu = "T7: R35 — " + muAll.length + " trecho(s) de viga (" + muAll.map(function (m) { return m.id; }).join(", ") + "; linhas x = " + xsMu.map(function (x) { return br(x, 2); }).join("; ") + "; " + br(muAll.reduce(function (a, m) { return a + m.L; }, 0), 1) + " m) apoiado(s) em MURETA da fundação SÓ NO TRECHO a menos de 15 cm do terreno (o resto da viga continua viga) — ALTURAS das muretas a informar à fundação (do terreno do modelo ao topo): " + muAll.map(function (m) { return m.id + " " + br(m.altura_min_m || 0, 2) + " a " + br(m.altura_max_m || 0, 2) + " m"; }).join("; ") + " — confirmar com a fundação (outra empresa): reação informada ao projeto de fundação (chapa inox 316 + neoprene é item nosso). Para manter as vigas, desligar a opção \"Não usar mureta\" na entrada do deck (muretaSeAbaixoDoTerreno = falso).";
      avisos.push(txMu); res.premissas.push({ cod: "R35", texto: txMu, quem: "fundação / RT" });
    }
    var pedAll = []; Object.keys(res.decks).forEach(function (id) { (res.decks[id].pedestais || []).forEach(function (pp) { pedAll.push(pp); }); });
    if (pedAll.length) {      /* R57 (decisão do coordenador): premissa VISÍVEL, nunca silenciosa */
      var txPd = "T7: R57 — " + pedAll.length + " apoio(s) da viga em PEDESTAL/BLOCO da fundação (OUTRA EMPRESA) em vez de pilar de madeira, porque a altura livre não comporta a ligação da base + a ligação do topo + folga mínima de " + br(PILAR_FOLGA, 2) + " m (adotada): " + (function () { var alt = pedAll.filter(function (pp) { return pp.h > 1.2 + 1e-9; }); return alt.length ? "[ALTURA: " + alt.length + " de " + pedAll.length + " pedestais passam de 1,20 m (máx. " + br(Math.max.apply(null, pedAll.map(function (pp) { return pp.h; })), 2) + " m) — escopo/custo da fundação: decisão do ROGÉRIO] " : ""; })() + pedAll.map(function (pp) { return pp.id + " (x " + br(pp.x, 2) + ", y " + br(pp.y, 2) + "; altura " + br(pp.h, 2) + " m; N,d " + br(pp.Nd, 1) + " kN, N mín " + br(pp.Nmin, 1) + " kN, H,d " + br(pp.Hd, 1) + " kN)"; }).join("; ") + " — INTERFACE: reação e altura acima informadas à fundação (a horizontal total do deck vai por inteiro aos pedestais, que devem resistir ao cortante e ao momento H·h na base; os pilaretes de madeira do mesmo deck seguem calculados com a sua parcela, em envelope). Nosso: chapa de apoio inox 316 + neoprene (σc,90 sobre " + br(PED_CHAPA * 100, 0) + " cm de chapa e 2 chumbadores M12 ao corte verificados) — confirmar com a fundação.";
      avisos.push(txPd); res.premissas.push({ cod: "R57", texto: txPd, quem: "fundação / RT" });
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
    /* R59/R60 (E4b final): a fonte (lista de peças) sai com o arranjo REAL calculado — nunca texto fixo — e as premissas ficam visíveis */
    (function () {
      var mfD = null, pU = null, pecas = F.pecas, travHde0 = function (pc3) { return pc3.secao ? pc3.secao.h : 0.16; };
      /* N3 (E4b): UM só tipo de apoio em U no projeto — o de maior espessura entre os decks; cada deck é reverificado com ele (ligação, memorial, fonte e orçamento falam do mesmo t) */
      (function () {
        var tMax = 0; Object.keys(res.decks).forEach(function (id) { var u = res.decks[id].pedestalU; if (u && u.t > tMax) tMax = u.t; });
        Object.keys(res.decks).forEach(function (id) {
          var dv3 = res.decks[id], u = dv3.pedestalU; if (!u || u.t >= tMax - 1e-9) return;
          var Mrd3 = FY_INOX * 1e3 * tMax * tMax / 4 * PED_CHAPA / ML.PADRAO.gamaA1, Rk3 = ML.chapasExternas(0.012, Math.max(u.bViga_m, 0.05), 0, u._rhok, ML.PADRAO.fu, tMax, "conifera"), Rd3 = Rk3 * u._kmod / 1.4, kg3 = (PED_CHAPA * u.bAcross_m * tMax + 2 * PED_CHAPA * 0.12 * tMax) * 7900, etaMx = 0;
          dv3.pedestais.forEach(function (pp) { var hdu = pp.HdU != null ? pp.HdU : pp.Hd; pp.abaU = { t: tMax, L: PED_CHAPA, braco: PED_ARM, Msd: hdu * PED_ARM, Mrd: Mrd3, eta: hdu * PED_ARM / Mrd3, apoioAba_eta: pp.abaU.apoioAba_eta }; pp.parafusosViga.Rk = Rk3; pp.parafusosViga.Rd = Rd3; pp.parafusosViga.eta = (pp.HdU != null ? pp.HdU : pp.Hd) / (2 * Rd3); pp.concreto.kgU = kg3; pp.eta = Math.max(pp.apoio.eta, pp.chumbadores.eta, pp.parafusosViga.eta, pp.abaU.eta, pp.abaU.apoioAba_eta, pp.cx ? pp.cx.eta : 0); etaMx = Math.max(etaMx, pp.eta); });
          u.t = tMax; u.Mrd = Mrd3; u.Msd = u.HdMax * PED_ARM; u.eta = u.Msd / Mrd3; u.RkParafuso = Rk3; u.RdParafuso = Rd3; u.kgU = kg3; dv3.pedestalPior = { eta: Math.max(etaMx, 0), id: dv3.pedestalPior && dv3.pedestalPior.id };
          res.grupos[id + "/ped"] = { eta: etaMx, id: dv3.pedestalPior.id };
        });
      })();
      Object.keys(res.decks).forEach(function (id) {
        var dv2 = res.decks[id], mf = dv2.maoFrancesa; if (mf && !mfD) mfD = mf; if (dv2.pedestalU && (!pU || dv2.pedestalU.t > pU.t + 1e-9 || (Math.abs(dv2.pedestalU.t - pU.t) < 1e-9 && dv2.pedestalU.kgU > pU.kgU))) pU = dv2.pedestalU;      /* um só tipo de apoio em U no projeto: o de maior espessura */
        if (!mf) return;
        var ar = mf.arranjo;
        pecas.forEach(function (pc2) {
          if (new RegExp("^" + id + "-MF\\d+$").test(pc2.id)) {
            var tem2 = !!(dv2.travessa && dv2.travessa.porPilar && dv2.travessa.porPilar[pc2.id.replace("-MF", "-P")]); pc2.qtd = tem2 ? 4 : 2; pc2.dupla = true; pc2.descricao = "Mãos-francesas DUPLAS do pilarete (uma peça de cada lado do pilarete e da viga; 2 pares, nas duas direções)";
            pc2.especificacao = "MLC GL24h tratada " + br(mf.sec.b * 100, 0) + "×" + br(mf.sec.h * 100, 0) + " cm, " + br(ar.Lpeca, 2) + " m (0,9 m entre nós + sobras de " + br(ar.sobraPilar * 100, 0) + " cm no pilar e " + br(ar.sobraViga * 100, 0) + " cm na viga), " + mf.parafusosPorPonta + " parafusos passantes inox A4 Ø" + Math.round(mf.dParafuso * 1000) + " por ponta em corte duplo (a1 = " + br(ar.a1 * 1000, 0) + " mm, a2 = " + br(ar.a2 * 1000, 0) + " mm, a3 = " + br(ar.a3 * 1000, 0) + " mm; Tab. 14, NBR 7190-1:2022)";
            var ar2 = mf.arranjo2, Lp2 = mf.Lmf2 + ar2.sobraPilar + ar2.sobraViga;
            pc2.especificacao = "MLC GL24h tratada " + br(mf.sec.b * 100, 0) + "×" + br(mf.sec.h * 100, 0) + " cm: 2 peças de " + br(ar.Lpeca, 2) + " m (direção das vigas)" + (tem2 ? " + 2 peças de " + br(Lp2, 2) + " m (direção perpendicular, nós " + br(mf.delta * 100, 1) + " cm mais baixos, recebidas pela travessa)" : "; SEM mão-francesa na direção perpendicular (sem vão para a travessa)") + ", " + mf.parafusosPorPonta + " parafusos passantes inox A4 Ø" + Math.round(mf.dParafuso * 1000) + " por ponta em corte duplo (a1 = " + br(ar.a1 * 1000, 0) + " mm, a2 = " + br(ar.a2 * 1000, 0) + " mm, a3 = " + br(ar.a3 * 1000, 0) + " mm; Tab. 14, NBR 7190-1:2022)";
            pc2.mf = { n: mf.parafusosPorPonta, d: mf.dParafuso, Lpeca: ar.Lpeca, Lpeca2: Lp2 };
          }
          if (dv2.travessa && new RegExp("^" + id + "-TV\\d+$").test(pc2.id)) {      /* R66 (4ª rodada): travessa BIAPOIADA entre duas linhas de viga, ao lado do pilarete (fora do topo e da ligação viga×pilarete), pendurada por estribos de inox */
            var tvc = dv2.travessa, pp = tvc.porPilar[pc2.id.replace("-TV", "-P")], hOld = pc2.secao ? pc2.secao.h : 0.16, zc = (pc2.p0[2] + pc2.p1[2]) / 2 + (hOld - tvc.h) / 2;
            pc2.secao = { tipo: "ret", b: tvc.b, h: tvc.h }; pc2.biapoiada = true;
            if (pp) {
              var xa = pp.xi + pp.sinal * (pp.bP / 2 + 0.025), xb2 = pp.xj - pp.sinal * (pp.bVig / 2 + 0.025);
              pc2.p0 = [Math.min(xa, xb2), pp.y, zc]; pc2.p1 = [Math.max(xa, xb2), pp.y, zc];
              pc2.especificacao = "MLC GL24h tratada " + br(tvc.b * 100, 0) + "×" + br(tvc.h * 100, 0) + " cm, " + br(Math.abs(xb2 - xa), 2) + " m, BIAPOIADA entre as vigas das linhas x = " + br(pp.xi, 2) + " e " + br(pp.xj, 2) + " m, pendurada por 2 estribos de inox 316 (" + (tvc.estribo.n * (tvc.estribo.nCol || 1)) + " parafusos Ø12 passantes cada); começa a 25 mm da face do pilarete (fora da ligação viga×pilarete) e recebe a 2ª mão-francesa a " + br(tvc.c2, 2) + " m do eixo do pilarete (η flexo-tração " + br(tvc.etaFlexao, 2) + ", flecha " + br(tvc.etaFlecha, 2) + ", estribo " + br(tvc.estribo.eta, 2) + ")";
            } else { pc2.p0 = [pc2.p0[0], pc2.p0[1], zc]; pc2.p1 = [pc2.p1[0], pc2.p1[1], zc]; pc2.especificacao = "TRAVESSA SEM VÃO: nenhuma linha de viga a <= 2,0 m que dê lugar à 2ª mão-francesa — BLOQUEADO (R66)"; }
          }
        });
      });
      for (var iT = pecas.length - 1; iT >= 0; iT--) { var mt = /^(.+)-TV(\d+)$/.exec(pecas[iT].id); if (mt && res.decks[mt[1]] && res.decks[mt[1]].travessa && !(res.decks[mt[1]].travessa.porPilar || {})[mt[1] + "-P" + mt[2]]) pecas.splice(iT, 1); }      /* 5ª rodada: pilarete sem vão não tem travessa (fica só com a mão-francesa em Y) */
      if (pU) pecas.forEach(function (pc2) { if (/-APOIO$/.test(pc2.id)) pc2.especificacao = "apoio em U de chapa inox 316 t = " + br(pU.t * 1000, 0) + " mm (base " + br(PED_CHAPA * 1000, 0) + " mm ao longo da viga + 2 abas de 120 mm) + 2 parafusos passantes inox Ø12 na viga + 2 chumbadores M12 + calço de neoprene (R60)"; });
      if (mfD) { var txR59 = "T7: R59 — mão-francesa DUPLA (duas peças 6×12 cm abraçando o pilarete e a viga) com parafusos passantes em CORTE DUPLO: " + mfD.parafusosPorPonta + " Ø" + Math.round(mfD.dParafuso * 1000) + " por ponta; o grupo foi verificado NA SOBREPOSIÇÃO com o pilarete e com a viga (Tab. 14 da NBR 7190-1:2022 no referencial da fibra de cada peça; a regra de par a1 OU a2 em cada peça é adoção usual), nunca só nos 0,9 m da peça; peça de " + br(mfD.arranjo.Lpeca, 2) + " m (sobras para a3,t) — o RT confirma"; avisos.push(txR59); res.premissas = res.premissas || []; res.premissas.push({ cod: "R59", texto: txR59, quem: "RT" }); }
      if (pU) { var txR60 = "T7: R60 — apoio da viga no pedestal em U de inox 316 t = " + br(pU.t * 1000, 0) + " mm com 2 parafusos passantes Ø12 na viga: a horizontal passa da viga ao pedestal pelos parafusos (ao longo da viga) e pela aba do U à flexão (transversal); fy do inox 316 = 205 MPa (ASTM A240 316; EN 1.4401 = 220 MPa; o menor) — PREMISSA: conferir com o fornecedor/certificado; concreto, borda e arrancamento são da FUNDAÇÃO (exigências mínimas emitidas: dimensão mínima " + br(pU.dimMin_m * 1000, 0) + " mm, borda " + br(pU.cBorda_m * 1000, 0) + " mm, N,d, H,d e M,d por pedestal)"; avisos.push(txR60); res.premissas = res.premissas || []; res.premissas.push({ cod: "R60", texto: txR60, quem: "fundação / RT" }); }
      var usaWT = !!res.guardaCorpo || Object.keys(res.decks).some(function (id) { var b2 = res.decks[id].base; return b2 && b2.f90 && b2.f90.reforco; });
      if (usaWT && !avisos.some(function (a) { return /^7\.1\.9/.test(a); })) avisos.push("7.1.9 (NBR 7190-1:2022, p. 51 impr.): rosca soberba pede d ≥ 9,5 mm; o WT-T-8,2 do deck (bloqueio entre barrotes do guarda-corpo e reforço do fendilhamento da base) tem 8,2 mm e a transcrição da norma não esclarece se o autoatarraxante de rosca total entra nesse mínimo. Resistência pela ETA do fabricante (fonte EN/ETA), com γ_lig = 1,4 (7.1.2); o RT deve confirmar o enquadramento (comprovação experimental, 7.1.2 e 9.2.1) — A CONFIRMAR PELO RT.");
    })();
    (function () {      /* R67 (N2 da 2ª revisão): a regra de altura mínima manda o deck baixo para PEDESTAL de concreto da fundação; a alternativa é do ROGÉRIO */
      var comPed = Object.keys(res.decks).filter(function (id) { return (res.decks[id].pedestais || []).length > 0; }), alt = params.decks.filter(function (dk) { return dk.deckBaixo === "pilareteX"; });
      if (comPed.length) { var txR67 = "T7: R67 — deck baixo em PEDESTAL de concreto da fundação (regra de altura mínima do pilarete com mão-francesa ≈ 0,96 m): " + comPed.join(", ") + ". R67 APROVADA pelo Rogério em 27/10/2026; a alternativa \"pilarete curto sem mão-francesa com contraventamento em X\" (opção deckBaixo = pilareteX) fica como alternativa não usada"; avisos.push(txR67); res.premissas = res.premissas || []; res.premissas.push({ cod: "R67", texto: txR67, quem: "ROGÉRIO" }); }
      /* R67 APROVADA pelo Rogério em 27/10/2026: o deck baixo vai para PEDESTAL de concreto. A opção deckBaixo = pilareteX (pilarete curto sem mão-francesa com X) fica como ALTERNATIVA NÃO USADA: não converte em pedestal e não emite aviso bloqueante. */
    })();
    (function () {      /* R73: premissas declaradas + peças DS-CX (diagonais) + avisos dos pilaretes que não cabem como pedestal */
      var mat = (F.pecas.filter(function (pc4) { return /-V\d+$/.test(pc4.id) && pc4.material; })[0] || {}).material, nEspac = 0, nCX = 0, convTot = 0, linhasTot = 0, vaosTot = 0;
      Object.keys(res.decks).forEach(function (id) {
        var dv5 = res.decks[id], cx = dv5.cx; if (!cx) return; var dk5 = params.decks.filter(function (z5) { return z5.id === id; })[0]; convTot += ((dk5 && dk5.pedForcado) || []).length;
        cx.linhas.forEach(function (l5) { if (l5.escolhidos.length) linhasTot++; });
        var seq = 0;
        cx.spans.forEach(function (sp) {
          vaosTot++; var a = sp.a, b = sp.b, y = a.y, sec = cx.sec, yoff = ((a.b || 0.14) / 2 + sec.b / 2), diags = [];
          if (sp.tipo === "x") { var f0 = sp.diags[0].face || 1, f1 = sp.diags[1].face || -1; diags.push([[a.x, y + f0 * yoff, a.z1 - CX_TOP], [b.x, y + f0 * yoff, b.z0 + (cx.base != null ? cx.base : CX_BASE)]]); diags.push([[a.x, y + f1 * yoff, a.z0 + (cx.base != null ? cx.base : CX_BASE)], [b.x, y + f1 * yoff, b.z1 - CX_TOP]]); }
          else { var pil5 = a.tipo === "pil" ? a : b, ped5 = a.tipo === "ped" ? a : b; diags.push([[pil5.x, y + (sp.diags[0].face || 1) * yoff, pil5.z0 + (cx.base != null ? cx.base : CX_BASE)], [ped5.x, y + (sp.diags[0].face || 1) * yoff, pil5.z1]]); }
          if (sp.tipo === "x") {      /* etapa 1 (revisor): as duas diagonais ficam em faces OPOSTAS do pilarete, separadas por tPil: no cruzamento entra um BLOCO ESPAÇADOR de MLC (espessura = a do pilarete, face = h da diagonal) e o parafuso passa pelas três peças; sem o bloco a "amarração" não existia */
            var tcE = sp.tc != null ? sp.tc : 0.5, xcE = a.x + tcE * (b.x - a.x), zcE = diags[0][0][2] + tcE * (diags[0][1][2] - diags[0][0][2]), tEsp = a.b || 0.14; nEspac++;
            F.pecas.push({ id: id + "-CXE" + (nEspac < 10 ? "0" : "") + nEspac, grupo: id + " — contraventamento em X (R73)", descricao: "Bloco espaçador do cruzamento das diagonais do X (linha y = " + br(sp.linha, 2) + " m, vão " + sp.a.id + "–" + sp.b.id + "): espessura igual à do pilarete, une as duas diagonais com o parafuso passante", material: mat, secao: { tipo: "ret", b: sec.h, h: sec.h }, p0: [xcE, y - tEsp / 2, zcE], p1: [xcE, y + tEsp / 2, zcE], up: [1, 0, 0], qtd: 1, unidade: "peça", comprimento_m: Math.round(tEsp * 1000) / 1000, volume_m3: Math.round(sec.h * sec.h * tEsp * 1e6) / 1e6,
              especificacao: "MLC GL24h tratada " + br(sec.h * 100, 0) + "×" + br(sec.h * 100, 0) + " cm, espessura " + br(tEsp * 100, 0) + " cm (bloco espaçador entre as duas diagonais, com 1 parafuso inox Ø16 passante pelas 3 peças)", cx: true, espacador: true });
          }
          var sob5 = 0;      /* M1 (revisor): a peça passa do nó pela sobra do grupo de parafusos (a3,t antes do primeiro parafuso, que pode estar em u < 0): estende p0/p1 nas pontas do PILARETE */
          diags.forEach(function (dg, idg) {
            var dgR = sp.diags[idg] || sp.diags[0]; sob5 = dgR.lig.sobra || 0;
            var ddx = dg[1][0] - dg[0][0], ddz = dg[1][2] - dg[0][2], dL = Math.sqrt(ddx * ddx + ddz * ddz) || 1, ux = ddx / dL, uz = ddz / dL;
            dg[0] = [dg[0][0] - ux * sob5, dg[0][1], dg[0][2] - uz * sob5]; if (sp.tipo === "x") dg[1] = [dg[1][0] + ux * sob5, dg[1][1], dg[1][2] + uz * sob5];
            nCX++; seq++;
            F.pecas.push({ id: id + "-CX" + (seq < 10 ? "0" : "") + seq, grupo: id + " — contraventamento em X (R73)", descricao: sp.tipo === "x" ? "Diagonal do contraventamento em X (cruz de Santo André, " + (idg === 0 ? "do topo de " + sp.a.id + " à base de " + sp.b.id : "da base de " + sp.a.id + " ao topo de " + sp.b.id) + ") entre pilaretes da linha y = " + br(sp.linha, 2) + " m" : "Diagonal única do pé do pilarete ao topo do pedestal da linha y = " + br(sp.linha, 2) + " m (ancoragem em chapa de inox)", material: mat, secao: { tipo: "ret", b: sec.b, h: sec.h }, p0: dg[0], p1: dg[1], up: [0, 1, 0], qtd: 1, unidade: "peça", comprimento_m: Math.round(Math.sqrt(Math.pow(dg[1][0] - dg[0][0], 2) + Math.pow(dg[1][1] - dg[0][1], 2) + Math.pow(dg[1][2] - dg[0][2], 2)) * 1000) / 1000, volume_m3: Math.round(sec.b * sec.h * Math.sqrt(Math.pow(dg[1][0] - dg[0][0], 2) + Math.pow(dg[1][1] - dg[0][1], 2) + Math.pow(dg[1][2] - dg[0][2], 2)) * 1e4) / 1e4,      /* M1/ALTO: comprimento e volume da peça (com a sobra além do nó) — sem isto a diagonal ficava fora do fornecimento 04.01 e do frete 01.03 */
              especificacao: "MLC GL24h tratada " + br(sec.b * 100, 0) + "×" + br(sec.h * 100, 0) + " cm, " + br(dgR.Ld + (sp.tipo === "x" ? 2 : 1) * sob5, 2) + " m (" + br(dgR.Ld, 2) + " m entre nós + sobra de " + br(sob5 * 100, 0) + " cm por ponta no pilarete) a " + br(dgR.ang, 1) + " graus; " + dgR.lig.n + " parafusos inox Ø" + Math.round(dgR.lig.d * 1000) + " passantes em corte simples por ponta" + (sp.tipo === "x" ? ", amarrada à outra diagonal no cruzamento pelo bloco espaçador de MLC (peça DS-CXE) com 1 parafuso passante" : "") + " (η diagonal " + br(Math.max(dgR.etaComp, dgR.etaTr), 2) + ", ligação " + br(dgR.lig.eta, 2) + ")", cx: true });
          });
        });
      });
      var bsTx = Object.keys(res.decks).filter(function (k7) { return res.decks[k7].cx; }).map(function (k7) { return br(res.decks[k7].cx.base != null ? res.decks[k7].cx.base : CX_BASE, 2); }).filter(function (v7, i7, a7) { return a7.indexOf(v7) === i7; }).join(" / ");      /* M4: a cota do nó de baixo de CADA deck (cx.base), não a global do último deck calculado */
      Object.keys(res.decks).forEach(function (k7) { var c7 = res.decks[k7].cx; if (c7 && c7.baseCortada != null) avisos.push("T7: R73 — deck " + k7 + ": a cota do nó de baixo da diagonal informada (" + br(c7.baseCortada, 2) + " m) está fora de 0,15 a 0,45 m: o motor usou " + br(c7.base, 2) + " m."); });
      if (vaosTot) { var txR73 = "T7: R73 — direção X contraventada por CONTRAVENTAMENTO EM X de madeira entre pilaretes (decidido pelo Rogério em 27/10/2026; substitui a mão-francesa em X e a travessa biapoiada, R66): " + linhasTot + " linha(s) em X com " + vaosTot + " vão(s) contraventado(s); premissas declaradas: linha em X = apoios com o mesmo y (tolerância " + br(CX_TOL, 2) + " m), altura útil da diagonal = h − " + br(CX_TOP, 2) + " − " + bsTx + " m, vão <= " + br(CX_DXMAX, 1) + " m entre apoios consecutivos (pilarete ou pedestal), ângulo de " + CX_ANG0 + " a " + CX_ANG1 + " graus (regra de projeto, não de norma), parcela da linha = fração das cargas verticais dela, sem diafragma rígido e sem crédito a pedestal ou a pilarete sem X" + (convTot ? "; " + convTot + " pilarete(s) sem vão possível passaram a PEDESTAL (R57 ESTENDIDA, R73b APROVADA pelo Rogério em 27/10/2026)" : ""); avisos.push(txR73); res.premissas = res.premissas || []; res.premissas.push({ cod: "R73", texto: txR73, quem: "ROGÉRIO / RT" });
        var txR73t = "T7: R73 — o pilarete é verificado à flexocompressão com Mx = Vb·" + br(CX_TOP, 2) + " m (horizontal do X no nó) e My = (ΣNd·senθ)·e (vertical da diagonal na face, e = (lado do pilarete + largura da diagonal)/2); a TORÇÃO do pilarete (binário das diagonais em faces opostas do mesmo nó) NÃO é verificada pelo motor: premissa declarada, a conferir pelo RT (NBR 7190-1:2022 sem tratamento direto de torção em peça serrada/MLC)."; avisos.push(txR73t); res.premissas.push({ cod: "R73-torção", texto: txR73t, quem: "RT" }); }
      Object.keys(res.decks).forEach(function (id) { var cx = res.decks[id].cx; if (cx && cx.confPed.length) avisos.push("T7: R73y — deck " + id + ": o topo do pedestal com X (" + br(cx.dimX, 2) + " m: U + chapa da diagonal + 2 bordas de chumbador) invade vizinho em " + cx.confPed.map(function (s) { return s.id; }).join(", ") + ". NÃO APROVADO."); if (cx) { var ligR = []; cx.spans.forEach(function (sp9) { sp9.diags.forEach(function (g9) { if (g9.lig.eta > 1 + 1e-9) ligR.push(sp9.a.id + "–" + sp9.b.id + " (diagonal a " + br(g9.ang, 1) + "°, " + (g9.lig.naoCabe ? "grupo de parafusos NÃO CABE no pilarete (a3 de 7d até o pé depois da sapata, 5d do grupo da mão-francesa e as peças das outras diagonais)" : "η da ligação = " + br(g9.lig.eta, 2)) + ")"); }); }); if (ligR.length) avisos.push("T7: R73z — deck " + id + ": ligação das diagonais do X no pilarete REPROVADA em " + ligR.join("; ") + ". NÃO APROVADO. Saídas: ancorar o deck na edificação, pilarete acima de 24 cm ou pedestal de concreto da fundação (outra empresa); o RT pode ainda testar, por entrada, a diagonal de seção maior (cxSec) e o nó de baixo mais alto (cxBase 0,25 a 0,45 m) — na Casa Mar essa tentativa levou o η de 9,00 a 2,47 e não fechou."); }
        if (cx && cx.faceConf && cx.faceConf.length) avisos.push("T7: R73w — deck " + id + ": " + cx.faceConf.length + " nó(s) de pilarete recebem duas diagonais na MESMA face (+y e −y já ocupadas): " + cx.faceConf.map(function (s) { return s.id + " (nó de " + s.nodo + ", linha y = " + br(s.linha, 2) + ")"; }).join("; ") + ". NÃO APROVADO."); if (cx && cx.bloqueados.length) avisos.push("T7: R73x — deck " + id + ": " + cx.bloqueados.length + " pilarete(s) sem vão possível para o contraventamento em X e cuja posição NÃO comporta o pedestal (pegada " + br(CX_PEDDIM, 2) + " m): " + cx.bloqueados.slice(0, 4).map(function (s) { return s.id + " (linha y = " + br(s.y, 2) + ")"; }).join("; ") + ". NÃO APROVADO."); });
      var ser = params.decks.filter(function (dk) { return dk.pilarete && dk.pilarete.serradoMF; }), apl = params.decks.filter(function (dk) { return dk.pilarete && dk.pilarete.aplainado; });
      ser.forEach(function (dk) { var tx = "T7: R68 — deck " + dk.id + ": pilarete ROLIÇO Ø" + br(Math.round(dk.pilarete.b * 1000) / 10, 0) + " cm com mão-francesa dupla: o corte duplo exige faces planas e o grupo de parafusos NÃO cabe na face aplainada do roliço (4 faces aplainadas, lado 0,8·D); os pilaretes passam a MLC GL24h " + br(dk.pilarete.b * 100, 0) + "×" + br(dk.pilarete.b * 100, 0) + " cm (efeito: mais madeira que o roliço, ver o orçamento) — decisão R68 do coordenador, o RT confirma"; avisos.push(tx); res.premissas = res.premissas || []; res.premissas.push({ cod: "R68", texto: tx, quem: "RT" }); });
      apl.forEach(function (dk) { var a = dk.pilarete.aplainado, tx = "T7: R68 — deck " + dk.id + ": pilarete ROLIÇO com FACES APLAINADAS na região da ligação (lado " + br(a.tf * 1000, 0) + " mm, face de " + br(a.chord * 1000, 0) + " mm): área " + br(a.A / a.Afull * 100, 1) + " % e inércia " + br(a.I / a.Ifull * 100, 1) + " % da seção cheia — a verificação do pilarete usa a seção reduzida (η × max(A/Ar; I/Ir)) — decisão R68 do coordenador, o RT confirma"; avisos.push(tx); res.premissas = res.premissas || []; res.premissas.push({ cod: "R68", texto: tx, quem: "RT" }); });
    })();
    res.escada = resEsc;
    if (res.escada && res.escada.tipo === "madeira") res.grupos["ESC"] = { eta: res.escada.eta, id: "ESC" };
    res.reacoes = []; Object.keys(res.decks).forEach(function (id) { res.decks[id].pilaretes.forEach(function (p) { res.reacoes.push({ id: p.id, deck: id, tipo: p.tipo, h: p.h, Nmax: Math.max(p.N1, p.N2), Nmin: 1.0 * (p.NG + p.peso), Hd: p.Hd, Md: p.eng ? p.M2 : 0, engastado: !!p.eng }); }); (res.decks[id].pedestais || []).forEach(function (p) { res.reacoes.push({ id: p.id, deck: id, tipo: "pedestal da fundação (outra empresa)", h: p.h, Nmax: p.Nd, Nmin: p.Nmin, Hd: p.Hd, Md: p.Md, engastado: true, pedestal: true }); }); });
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
    var mfTopo = d.modo === "retangulo" && d.pilar && d.pilar.maosFrancesasTopo, mfA = res.decks[id] && res.decks[id].maoFrancesa, mfLig = !!mfA && (mfA.etaLigacao > 1 + 1e-9 || (mfA.arranjo && !mfA.arranjo.cabe));
    function mfAtual() { var pp = s.pilarete, nn = pp.mfParafusos || (d.pilar && d.pilar.mfParafusos) || (d.pilarete && d.pilarete.mfParafusos) || 2, dd = pp.mfD || (d.pilar && d.pilar.mfD) || (d.pilarete && d.pilarete.mfD) || 0.012; return { n: nn, d: dd, bPil: pp.d != null ? pp.d : pp.b, hViga: s.viga.h, hMF: pp.mfH || (d.pilar && d.pilar.mfH) || (d.pilarete && d.pilarete.mfH) || 0.12 }; }
    if (g === "mf" && (mfTopo || mfLig)) {      /* E4 r10 + R59 (E4b final): a ligação da mão-francesa dupla cresce ANTES do pilar: mais parafusos Ø12 enquanto o grupo CABE na sobreposição (pilar e viga, Tab. 14 na fibra de cada peça); se não couber, Ø16 com os espaçamentos recalculados (a1 = 112 mm); só depois engrossa o pilar */
      var m0 = mfAtual(), limW = d.modo === "retangulo" ? L.pilar.max : L.pilarete.max, capN = mfTopo ? 16 : 8;
      var cabeEm = function (nn, dd, w) { return arranjoMF(nn, 0.9, { d: dd, bPil: w, hViga: m0.hViga, hMF: m0.hMF }).cabe; };
      var cabeAlargando = function (nn, dd) { for (var w = m0.bPil + st.lado; w <= limW + 1e-9; w += st.lado) if (cabeEm(nn, dd, w)) return true; return false; };      /* o pilar ainda pode crescer até o limite e dar lugar ao grupo? */
      /* 5ª rodada: ordem do laço = parafusos da mão-francesa (o que a Tab. 14 deixa caber) → seção do pilarete (a cada passo o grupo ganha lugar) → Ø16 SEM perder capacidade (o mínimo de parafusos Ø16 cuja capacidade supera a do Ø12 atual); a seção da mão-francesa (6×12) não cresce: esgotado isso, a verificação reprova com "falta rigidez lateral em X" */
      var rkDe = function (dd) { return ML.madeiraMadeira(dd, mfSec(d).b, Math.max(m0.bPil, 0.1), 0, Math.PI / 4, MM.classe2022(q.classe).rhok, ML.PADRAO.fu, false, "conifera"); };
      var trocaPara16 = function () { var n16 = 2 * Math.ceil((m0.n * rkDe(m0.d) / rkDe(0.016) + 0.5) / 2); if (n16 > capN || !cabeAlargando(n16, 0.016) && !cabeEm(n16, 0.016, m0.bPil)) return false; s.pilarete.mfD = 0.016; s.pilarete.mfParafusos = n16; return true; };      /* só troca se o Ø16 comporta (Tab. 14, pilar e viga) o número que iguala a capacidade do Ø12 atual */
      if (cabeEm(m0.n, m0.d, m0.bPil)) {
        if (m0.n + 2 <= capN) {
          if (cabeEm(m0.n + 2, m0.d, m0.bPil)) { s.pilarete.mfParafusos = m0.n + 2; return true; }
          if (!cabeAlargando(m0.n + 2, m0.d) && m0.d < 0.016 - 1e-9) if (trocaPara16()) return true;
        } else if (m0.d < 0.016 - 1e-9) if (trocaPara16()) return true;
      } else if (!cabeAlargando(m0.n, m0.d) && m0.d < 0.016 - 1e-9) if (trocaPara16()) return true; }
    if (g === "cx") {
      if (res.decks[id] && res.decks[id].cx && res.decks[id].cx.precisaPilar) { var kc = s.pilarete.d != null ? "d" : "b"; if (s.pilarete[kc] + st.lado <= CX_PIL_MAX + 1e-9) { s.pilarete[kc] = r(s.pilarete[kc] + st.lado, 3); return true; }
        /* etapa 1 (coordenação): UMA tentativa feita e registrada (Casa Mar, opção A, 16/11/2026): esgotado o pilarete 24×24, a busca testou a seção da diagonal 8×12 → 8×16 → 10×16 → 10×20 e depois o nó de baixo a 0,25 m do pé: η do deck 9,00 (grupo NÃO CABE) → 2,47, e NÃO fechou; cada passo custa uma rodada inteira do deck (cerca de 1 a 2 minutos e até 3,5 GB de memória na seção 10×20), por isso o laço automático NÃO repete a tentativa: esgotado o pilarete BLOQUEIA (R73z). O nó mais alto continua disponível por entrada (d.pilarete.cxBase = 0,25 | 0,35 | 0,45 m) e a seção da diagonal por d.pilarete.cxSec, para o RT testar caso a caso. */
        return false; }
      var cxA = s.pilarete.cxSec != null ? s.pilarete.cxSec : ((d.pilar && d.pilar.cxSec) || (d.pilarete && d.pilarete.cxSec) || 0); if (cxA + 1 < CX_SEC.length) { s.pilarete.cxSec = cxA + 1; return true; } return false; }      /* R73: ordem do laço = ligação (2→4→6 Ø12, 4→6 Ø16, dentro de cxLig) → seção da diagonal (a largura só cresce para caber o grupo); a seção do PILARETE nunca cresce para caber a ligação da diagonal, só se o próprio pilarete reprovar */      /* R73: seção da diagonal 6×12 → 8×12 → 8×16 → 10×16 */
    if (g === "tv") { var tvA = s.pilarete.travH || (d.pilar && d.pilar.travH) || (d.pilarete && d.pilarete.travH) || 0.16; if (tvA + 0.04 <= 0.40 + 1e-9) { s.pilarete.travH = r(tvA + 0.04, 3); return true; } return false; }      /* R66: a travessa cresce em altura (passo 4 cm, até 40 cm) */
    if (g === "cv" && s.cv) {      /* r11: a diagonal de MLC cresce pela lista de seções comerciais; o tirante pelo catálogo de diâmetros */
      if (s.cv.d != null) { var iT = -1; CV_TIR.forEach(function (x, i) { if (Math.abs(x[0] - s.cv.d) < 1e-6) iT = i; }); if (iT < 0 || iT + 1 >= CV_TIR.length) return false; s.cv.d = CV_TIR[iT + 1][0]; return true; }
      var iS = -1; CV_SEC.forEach(function (x, i) { if (Math.abs(x[0] - s.cv.b) < 1e-6 && Math.abs(x[1] - s.cv.h) < 1e-6) iS = i; }); if (iS < 0) iS = 0; if (iS + 1 >= CV_SEC.length) return false; s.cv.b = CV_SEC[iS + 1][0]; s.cv.h = CV_SEC[iS + 1][1]; return true; }
    if (g === "pilar") {      /* N3(a) (E4b): pilarete de base ROTULADA com mão-francesa e esbeltez reprovada → primeiro mais parafusos na mão-francesa (Kθ do topo maior, β menor), até o que CABE na peça; só depois engrossa o pilarete */
      var dvP = res.decks[id], pw = dvP && dvP.pilaretes.filter(function (x) { return x.id === dvP.pior.pilar.id; })[0];
      if (pw && pw.pmR && !pw.eng && !mfTopo) { var m1 = mfAtual(); if (m1.n + 2 <= 8 && arranjoMF(m1.n + 2, 0.9, m1).cabe) { s.pilarete.mfParafusos = m1.n + 2; return true; } } }
    if (g === "pilar" || g === "mf" || g === "base") { var lim = d.modo === "retangulo" ? L.pilar.max : L.pilarete.max, k = s.pilarete.d != null ? "d" : "b"; if (s.pilarete[k] + st.lado > lim + 1e-9) {      /* 5ª rodada: esgotados parafusos e seção do pilarete, cresce a SEÇÃO DA MÃO-FRANCESA (largura 12 → 16 → 20 cm, depois espessura 6 → 8 cm) */
        if (g === "mf") { var ms = mfSec(d.pilarete ? ext({}, d, { pilarete: ext({}, d.pilarete, s.pilarete) }) : d); if (ms.h < 0.20 - 1e-9) { s.pilarete.mfH = r(ms.h + 0.04, 3); return true; } if (ms.b < 0.08 - 1e-9) { s.pilarete.mfB = 0.08; return true; } }
        return false; } s.pilarete[k] = r(s.pilarete[k] + st.lado, 3); return true; }
    return false;
  }
  /** laço de crescimento: seções crescem no passo do fabricante até todos os grupos do deck fecharem (guarda-corpo e escada são verificados, mas não crescem sozinhos: seção informada) */
  function dimensionar(proj, partida, opcoes) {
    var r0 = dimensionar0(proj, partida, opcoes), mudou = false;
    /* M3 (R68, 4ª rodada): onde o roliço virou pilarete SERRADO quadrado, as SEÇÕES gravam { b } SEM d (pranchas, fonte e memorial falam do 18×18, nunca de Ø180) e o resultado final é recalculado com elas */
    r0.resultado.params.decks.forEach(function (dk) { var sp = r0.secoes[dk.id] && r0.secoes[dk.id].pilarete; if (dk.modo !== "retangulo" && dk.pilarete && dk.pilarete.serradoMF && sp && sp.d != null) { sp.b = dk.pilarete.b; delete sp.d; mudou = true; } });
    if (mudou) { r0.resultado = rodar(proj, r0.secoes); r0.pior = r0.resultado.pior; r0.semSolucao = Object.keys(r0.resultado.pior).some(function (k) { return r0.resultado.pior[k] > 1 + 1e-9; }); }
    return r0;
  }
  function dimensionar0(proj, partida, opcoes) {
    opcoes = opcoes || {}; var q = padrao(proj);
    var sec = clone(partida || secoesIniciais(q.params)), hist = [], res, it;
    for (it = 0; it < (opcoes.maxIter || 40); it++) {
      res = rodar(proj, sec); hist.push({ it: it, sec: clone(sec), eta: res.eta });
      var falha = Object.keys(res.pior).filter(function (k) { return res.pior[k] > 1 + 1e-9 && /^[A-Z]+\/(tabua|barrote|viga|pilar|mf|tv|cx|cv|apoio|base)$/.test(k); });
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
  /** E5/R57 (E4b final): decks cujo pilar de madeira NÃO cabe (altura livre < ligação da base + ligação do topo + folga) passam a apoiar a viga DIRETO em PEDESTAL/BLOCO da fundação (outra empresa) nos apoios cuja altura é menor ou igual à do pior pilar reprovado; refaz o dimensionamento (a horizontal vai aos pedestais) até estabilizar (4 voltas no máximo). Nunca silencioso: premissa R57 e item de interface. */
  function pedestaisR57(proj, d, opcoes) {
    var rounds = 0, mudou = false;
    while (rounds++ < 4) {
      var res = d.resultado, falhas = {};
      Object.keys(res.decks).forEach(function (id) { var g = res.decks[id].geo; if (g && g.falhas.length) falhas[id] = Math.max.apply(null, g.falhas.map(function (f) { return f.h; })); });
      if (!Object.keys(falhas).length) break;
      var ps = ext({}, proj.params);
      ps.decks = proj.params.decks.map(function (dk) {
        if (!(dk.id in falhas) || dk.deckBaixo === "pilareteX") return dk;      /* R67 (APROVADA pelo Rogério em 27/10/2026; alternativa não usada): opção "pilarete curto sem mão-francesa com contraventamento em X" — não converte em pedestal */
        var n = ext({}, dk), hT = falhas[dk.id] + 1e-6;
        if (dk.modo === "retangulo") n.pilar = ext({}, dk.pilar, { pedestalR57: true, hMinPilar: Math.max(dk.pilar.hMinPilar || 0, hT) });
        else { n.pedestalR57 = true; n.hMinPilarete = Math.max(dk.hMinPilarete || 0.15, hT); }
        return n;
      });
      proj = ext({}, proj, { params: ps }); d = dimensionar(proj, opcoes.partida, opcoes); mudou = true;
    }
    return { proj: proj, d: d, mudou: mudou };
  }
  /** R73 / R57 estendida (R73b APROVADA pelo Rogério em 27/10/2026): pilarete que fica sem vão possível para o contraventamento em X (nem pilarete, nem pedestal vizinho a <= 2,5 m, diagonal de 25° a 75°) passa a apoiar a viga em PEDESTAL da fundação — só se a posição comporta a pegada do pedestal (CX_PEDDIM); senão o motor BLOQUEIA (aviso). Repete: virar pedestal muda os vizinhos. */
  function pedestaisCx(proj, d, opcoes) {
    var rounds = 0;
    while (rounds++ < 6) {
      var res = d.resultado, mud = false, ps = ext({}, proj.params);
      ps.decks = proj.params.decks.map(function (dk) {
        var dv = res.decks[dk.id], cx = dv && dv.cx; if (!cx || !cx.semVaoPil.length || dk.modo === "retangulo") return dk;
        var n = ext({}, dk), lst = (dk.pedForcado || []).slice();
        if (dk.deckBaixo === "pilareteX") return dk;      /* opção pendente do Rogério (R67): não converte */
        cx.semVaoPil.forEach(function (q) { if (q.comporta && !lst.some(function (o2) { return Math.abs(o2[0] - q.x) < 0.02 && Math.abs(o2[1] - q.y) < 0.02; })) { lst.push([Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100]); mud = true; } });
        n.pedForcado = lst; return n;
      });
      if (!mud) break;
      proj = ext({}, proj, { params: ps }); d = dimensionar(proj, opcoes.partida, opcoes);
    }
    return { proj: proj, d: d };
  }
  function projetar(proj, opcoes) {
    opcoes = opcoes || {};
    var d = dimensionar(proj, opcoes.partida, opcoes), trocaInfo = null;
    if (opcoes.pedestais !== false) { var pr0 = pedestaisR57(proj, d, opcoes); proj = pr0.proj; d = pr0.d; }
    if (d.semSolucao && opcoes.trocaSistema !== false) { trocaInfo = escalarSistema(proj, d, opcoes); if (trocaInfo.trocas.length) { d = trocaInfo.d; proj = trocaInfo.proj; if (opcoes.pedestais !== false) { var pr1 = pedestaisR57(proj, d, opcoes); proj = pr1.proj; d = pr1.d; } } }
    if (opcoes.pedestais !== false) { var pv2 = pedestaisCx(proj, d, opcoes); proj = pv2.proj; d = pv2.d; }
    var res = d.resultado, q = res.q;
    if (trocaInfo && trocaInfo.tentadas.length) { trocaInfo.tentadas.forEach(function (t) { var ap = t.falhasDepois < t.falhasAntes || t.fechou; res.avisos.push("T7 troca automática de sistema" + (ap ? "" : " (descartada)") + ": " + t.passo + " no(s) deck(s) " + t.decks.join(", ") + " (o pilarete/pilar chegou ao limite da seção sem fechar) → " + (t.fechou ? "FECHOU, com a ligação madeira–chapa da base verificada e a rigidez real da base no pórtico; é decisão de projeto: o RT confirma o sistema (para fixá-lo, marcar a base engastada do deck na entrada e recalcular)" : (t.falhasDepois < t.falhasAntes ? "melhorou, mas o deck ainda NÃO fecha (a reprovação que sobra está listada como bloqueante)" : "não resolveu (descartada; o sistema original foi mantido)")) + "."); }); }
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
        var pn = ligTopoPilarete(q, cxFtopo(dv.H.porPilarete * 1.4, dv.cx ? dv.cx.VbMax : 0, Math.max.apply(null, dv.pilaretes.map(function (x) { return x.Tx_d || 0; }))), sp.b, sp.h);
        L.ligacoes[id + "/vigaPilarete"] = { descricao: "Viga × pilarete: apoio por contato (σc,90) e chapa interna com pinos inox para a horizontal.", eta: Math.max(e2, pn.eta || 0), ok: e2 <= 1 + 1e-9 && pn.ok, apoio: { sigma: sg, limite: lm, eta: e2 }, pinos: pn,
          passos: ["Viga × pilarete: Nd = " + br(Nmax, 2) + " kN em " + br(sp.b * 100, 0) + " × " + br(bV * 100, 0) + " cm → σc,90 = " + br(sg, 3) + " MPa ≤ " + br(lm, 3) + " MPa → η = " + br(e2, 3) + "."].concat(pn.passos || []) };
        // base: chumbadores (tração do binário + corte)
        var Mb = Math.max.apply(null, dv.pilaretes.map(function (x) { return x.eng ? x.M2 : 0; })), eng = Mb > 0, z = Math.max(0.1, sp.b - 0.06), Nmin = Math.min.apply(null, dv.pilaretes.map(function (x) { return x.Nfav; }));      /* A5 (r13): N mínimo p/ o arrancamento = permanente FAVORÁVEL (γ = 1,0, NBR 8681) e SEM sobrecarga; a sucção do vento no deck não é calculada (declarado) */
        // chumbadores da base: cresce o diâmetro (M12 a M24, áreas de tensão ISO 898) e o número (4, 6, 8) até fechar; fu = 500 MPa adotado (sem fonte)
        var sel;
        if (dv.contraventamento) {      /* r11: pilar contraventado — mesma seleção do pilar (momento, arrancamento e cortante do quadro) */
          var pcv = dv.pilaretes.filter(function (x) { return x.cv; }).sort(function (x, y) { return y.cv.sel.eta - x.cv.sel.eta; })[0];
          sel = pcv ? pcv.cv.sel : selChumb(true, Mb, z, Nmin, dv.H.porPilarete * 1.4); Mb = pcv ? pcv.cv.MdB : Mb; Nmin = pcv ? pcv.cv.NminB : Nmin; z = pcv ? pcv.cv.zB : z;
        } else sel = selChumb(eng, Mb, z, Nmin, dv.H.porPilarete * 1.4 + (dv.cx ? dv.cx.VbMax : 0));
        var etaB = sel.eta;
        L.ligacoes[id + "/base"] = { descricao: eng ? "Base engastada: " + sel.n + " chumbadores M" + sel.d + " (" + (sel.n / 2) + " por lado), tração do binário M/z e corte." : "Base rotulada: " + sel.n + " chumbadores M" + sel.d + " só ao corte (H/n).", eta: Math.max(etaB, eng && dv.base ? dv.base.eta : 0), ok: etaB <= 1 + 1e-9 && !(eng && dv.base && !dv.base.ok), baseMadeira: eng && dv.base ? dv.base : null, Tch: sel.Tch, Vch: sel.Vch, FtRd: sel.FtRd, FvRd: sel.FvRd, d: sel.d / 1000, n: sel.n,
          passos: [(dv.contraventamento ? "Pilar contraventado (X): " : "") + "Base do pilarete: M = " + br(Mb) + " kN·m, z = " + br(z * 100, 0) + " cm, N mín = " + br(Nmin) + " kN → " + sel.n + " chumbadores M" + sel.d + ": tração por chumbador " + br(sel.Tch, 2) + " kN (Ft,Rd " + br(sel.FtRd, 2) + "), corte " + br(sel.Vch, 3) + " kN (Fv,Rd " + br(sel.FvRd, 2) + ") → interação linear η = " + br(etaB, 3) + " (NBR 8800, 6.3.3; fu 500 MPa adotado, sem fonte — a favor; diâmetro e número crescem até fechar)."].concat(eng && dv.base ? dv.base.passos : []) };
      }
      if ((dv.pedestais || []).length) {      /* R57: apoio da viga em pedestal da fundação (outra empresa): nosso = chapa inox + neoprene; interface = reação e altura */
        var pdx = dv.pedestais, pdN = pdx.reduce(function (m, x) { return Math.max(m, x.Nd); }, 0), pdH = pdx.reduce(function (m, x) { return Math.max(m, x.Hd); }, 0), pdE = pdx.reduce(function (m, x) { return Math.max(m, x.eta); }, 0), pg0 = pdx[0], pdhMin = Math.min.apply(null, pdx.map(function (x) { return x.h; })), pdhMax = Math.max.apply(null, pdx.map(function (x) { return x.h; }));
        var pU = dv.pedestalU, pb0 = pdx[0];
        L.ligacoes[id + "/pedestal"] = { descricao: "Apoio da viga em PEDESTAL/bloco da fundação (outra empresa, R57/R60): apoio em U de inox 316 t = " + br(pU.t * 1000, 0) + " mm com 2 parafusos passantes Ø12 na viga e 2 chumbadores M12; reação, horizontal e momento informados à fundação.", eta: pdE, ok: pdE <= 1 + 1e-9, n: pdx.length, U: pU, interface: { Nmin_min: Math.min.apply(null, pdx.map(function (x) { return x.Nmin; })), dimMinX_m: Math.max.apply(null, pdx.map(function (x) { return x.cx ? x.cx.dimMin : pU.dimMin_m; })), Nd_max: pdN, Hd_max: pdH, Md_max: pdx.reduce(function (m, x) { return Math.max(m, x.Md); }, 0), alturas_m: [pdhMin, pdhMax], dimMin_m: pU.dimMin_m, cBorda_m: pU.cBorda_m },
          passos: ["R57: " + pdx.length + " pedestais da fundação (outra empresa) no deck " + id + ": o pilar de madeira não cabe (ligação da base + do topo + folga " + br(PILAR_FOLGA, 2) + " m, ou mão-francesa + base + folga, > altura livre). Interface (para a FUNDAÇÃO): N,d máx. " + br(pdN, 2) + " kN, H,d máx. " + br(pdH, 2) + " kN, M,d máx. " + br(pdx.reduce(function (m, x) { return Math.max(m, x.Md); }, 0), 2) + " kN·m (= H,d·(altura + braço do apoio)) por pedestal, altura " + br(pdhMin, 2) + " a " + br(pdhMax, 2) + " m do terreno do modelo à face inferior da viga.",
            "Horizontal por pedestal (R60): " + pU.distribuicao + " — adotado o MAIOR, a favor da segurança; sem somar a parcela dos pilaretes de madeira vizinhos (envelope: o pedestal assume a horizontal total do deck).",
            "Chapa de base inox 316 (" + br(PED_CHAPA * 100, 0) + " cm ao longo da viga de " + br(pb0.apoio.bViga * 100, 0) + " cm) sobre neoprene: σc,90 = " + br(pdx.reduce(function (m, x) { return Math.max(m, x.apoio.sigma); }, 0), 3) + " MPa ≤ " + br(pb0.apoio.limite, 3) + " MPa (6.2.4, Tab. 6; αn para a' = " + br(PED_CHAPA * 100, 0) + " cm) → η = " + br(pdx.reduce(function (m, x) { return Math.max(m, x.apoio.eta); }, 0), 3) + ". O neoprene NÃO transmite a horizontal (só o atrito, desprezado).",
            "Horizontal ao longo da viga: 2 parafusos passantes inox Ø12 atravessam a viga (chapas laterais = as abas do U, NBR 7190-1:2022, 7.3; embutimento paralelo às fibras): Rk = " + br(pU.RkParafuso, 2) + " kN por parafuso (2 planos), Rd = Rk·kmod/γ = " + br(pU.RdParafuso, 2) + " kN; Vd = " + br(pdH / 2, 2) + " kN por parafuso → η = " + br(pdx.reduce(function (m, x) { return Math.max(m, x.parafusosViga.eta); }, 0), 3) + ".",
            "Horizontal transversal à viga: a viga empurra a aba do U (balanço de 0,12 m engastado na chapa de base; resultante a " + br(pU.braco * 100, 0) + " cm da base, adotado): Msd = H,d·braço = " + br(pU.Msd, 3) + " kN·m contra Mpl,Rd = fy·t²/4·L/γa1 = " + br(pU.Mrd, 3) + " kN·m (t = " + br(pU.t * 1000, 0) + " mm, L = " + br(PED_CHAPA * 1000, 0) + " mm, fy " + br(FY_INOX, 0) + " MPa do inox 316 (ASTM A240 316; EN 1.4401 = 220 MPa, o menor das duas referências): PREMISSA, conferir com o fornecedor/certificado) → η = " + br(pU.eta, 3) + "; a espessura de 6 mm NÃO bastava (Mpl,Rd = " + br(FY_INOX * 1e3 * 0.006 * 0.006 / 4 * PED_CHAPA / ML.PADRAO.gamaA1, 3) + " kN·m).",
            "2 chumbadores M12 no pedestal (fu 500 MPa adotado): cisalhamento do AÇO Vd = " + br(pdH / 2, 2) + " kN contra Fv,Rd = " + br(pb0.chumbadores.FvRd, 2) + " kN, tração do momento do apoio Td = " + br(pdx.reduce(function (m, x) { return Math.max(m, x.chumbadores.Td); }, 0), 2) + " kN contra Ft,Rd = " + br(pb0.chumbadores.FtRd, 2) + " kN → interação linear η = " + br(pdx.reduce(function (m, x) { return Math.max(m, x.chumbadores.eta); }, 0), 3) + ".",
            "EXIGÊNCIAS À FUNDAÇÃO (outra empresa; o concreto não é verificado aqui): pedestal com dimensão mínima " + br(pU.dimMin_m * 1000, 0) + " mm em planta (largura do U " + br(PED_CHAPA * 1000, 0) + " mm + 2 × borda mínima " + br(pU.cBorda_m * 1000, 0) + " mm, ADOÇÃO), chumbadores químicos M12 com distância de borda ao eixo ≥ " + br(pU.cBorda_m * 1000, 0) + " mm (confirmar com o manual do chumbador), e resistir a N,d = " + br(pdN, 2) + " kN, H,d = " + br(pdH, 2) + " kN e M,d = " + br(pdx.reduce(function (m, x) { return Math.max(m, x.Md); }, 0), 2) + " kN·m na base de cada pedestal, com arrancamento e ruptura do cone de concreto verificados pela fundação."] };
      }
      if (dv.amarracao) L.ligacoes[id + "/amarracao"] = { descricao: "Amarração do deck à edificação: parafusos/chumbadores Ø" + br(dv.amarracao.d * 1000, 0) + " em linha, chapa de apoio na viga de borda.", eta: dv.amarracao.eta, ok: dv.amarracao.ok, passos: dv.amarracao.passos, chapaApoio_mm: Math.round(dv.amarracao.lado * 1000), n: dv.amarracao.n };
      if (dv.contraventamento) {      /* r11: diagonal/tirante + ligações (ponta da diagonal: chapa interna + pinos; ponta no pilar: chapa + parafusos passantes) */
        var cvx = dv.contraventamento, gv = cvx.gov;
        L.ligacoes[id + "/contraventamento"] = { descricao: cvx.tipo === "tirante" ? "Contraventamento em X de tirantes inox Ø" + br(cvx.d * 1000, 0) + " mm com esticador: tração e rigidez." : "Contraventamento em X de diagonais de MLC " + br(cvx.b * 100, 0) + "×" + br(cvx.h * 100, 0) + " cm: tração na área líquida, chapa interna de aço t = 8 mm e rigidez do quadro.", eta: Math.max(cvx.eta, 0), ok: cvx.ok, passos: cvx.passos, tipo: cvx.tipo, nDiag: cvx.nDiag, nPinosPorPonta: cvx.nPinosPorPonta, dPino: cvx.dPino, Fd: gv.Fd, credito: cvx.credito };
        if (gv.ligDiag) L.ligacoes[id + "/cvDiagonal"] = { descricao: "Ponta da diagonal do contraventamento: chapa interna de aço t = 8 mm em fenda + " + gv.ligDiag.n + " pinos inox Ø" + br(gv.ligDiag.d * 1000, 0) + " (NBR 7190-1:2022, cap. 7).", eta: gv.ligDiag.eta, ok: gv.ligDiag.ok, passos: gv.ligDiag.passos, n: gv.ligDiag.n, d: gv.ligDiag.d };
        if (gv.ligPilar) L.ligacoes[id + "/cvPilar"] = { descricao: "Ponta do contraventamento no pilar roliço: chapa/olhal inox 8 mm + " + gv.ligPilar.n + " parafusos passantes Ø" + br(gv.ligPilar.d * 1000, 0) + ".", eta: gv.ligPilar.eta, ok: gv.ligPilar.ok, passos: gv.ligPilar.passos, n: gv.ligPilar.n, d: gv.ligPilar.d };
      }
      if (dv.maoFrancesa) L.ligacoes[id + "/maoFrancesa"] = { descricao: "Mão-francesa 6×12: compressão, tração e " + (dv.maoFrancesa.parafusosPorPonta || 2) + " parafusos Ø12 por ponta.", eta: dv.maoFrancesa.eta, ok: dv.maoFrancesa.ok, passos: dv.maoFrancesa.passos, arranjo: dv.maoFrancesa.arranjo, parafusosPorPonta: dv.maoFrancesa.parafusosPorPonta };
      if (dv.cx && dv.cx.spans.length) {      /* R73: contraventamento em X de madeira entre pilaretes — o caminho de H_x por linha, as diagonais, as ligações, a vertical e a ancoragem no pedestal */
        var cxs = dv.cx, spW = cxs.spans.slice().sort(function (u, w) { return w.eta - u.eta; })[0], spU = cxs.spans.filter(function (s) { return s.anc; }).sort(function (u, w) { return w.anc.eta - u.anc.eta; })[0] || null, psC = [];
        psC.push("Contraventamento em X de madeira entre pilaretes (R73, decidido pelo Rogério em 27/10/2026; ângulo de 25° a 75°, pedestal na ponta e laço da ligação decididos pela coordenação): diagonais MLC " + br(cxs.sec.b * 100, 0) + "×" + br(cxs.sec.h * 100, 0) + " cm; H_x tributário por LINHA em X (fração das cargas verticais; sem diafragma rígido; nenhum crédito a pedestal nem a pilarete sem X); a parcela da linha vai aos vãos contraventados, pela rigidez axial das diagonais.");
        cxs.linhas.forEach(function (l) { if (!l.escolhidos.length) return; psC.push("Linha y = " + br(l.y, 2) + " m: " + l.apoios.length + " apoios, fração das cargas " + br(l.frac * 100, 1) + " % → H_x = " + br(l.H, 2) + " kN; vãos: " + l.escolhidos.map(function (s) { return (s.tipo === "x" ? "cruz" : "diagonal única com ancoragem no pedestal") + " " + br(s.a.x, 2) + "→" + br(s.b.x, 2) + " (dx " + br(s.dx, 2) + " m): H = " + br(s.H, 2) + " kN; " + s.diags.map(function (g) { return "diagonal " + (s.tipo === "x" ? (g.i === 0 ? "topo de " + s.a.id + " → base de " + s.b.id : "base de " + s.a.id + " → topo de " + s.b.id) + " " : "") + br(g.Ld, 2) + " m a " + br(g.ang, 1) + "° (parcela " + br(g.kfrac * 100, 0) + " % do H do vão): N_d = " + br(g.Nd, 2) + " kN, compressão η = " + br(g.etaComp, 3) + " (λ " + br(g.lamOut, 0) + "/" + br(g.lamIn, 0) + "), tração líquida η = " + br(g.etaTr, 3) + ", ligação " + g.lig.n + " Ø" + Math.round(g.lig.d * 1000) + " η = " + br(g.lig.eta, 3); }).join("; ") + (s.anc ? ", ancoragem no pedestal η = " + br(s.anc.eta, 3) : "") + "; vertical ±" + br(s.dNd, 2) + " kN no pilarete"; }).join(" | ")); });
        if (cxs.semVaoPil.length) psC.push(cxs.semVaoPil.length + " pilarete(s) sem vão possível (nenhum apoio vizinho a <= 2,5 m com diagonal entre 25° e 75°) passaram a PEDESTAL (R57 ESTENDIDA, R73b APROVADA pelo Rogério em 27/10/2026).");
        L.ligacoes[id + "/contraventamentoX"] = { descricao: "Contraventamento em X de madeira: " + cxs.spans.length + " vão(s) contraventado(s) em " + cxs.linhas.filter(function (l) { return l.escolhidos.length; }).length + " linha(s) em X; diagonal " + br(cxs.sec.b * 100, 0) + "×" + br(cxs.sec.h * 100, 0) + " cm, ligação " + spW.lig.n + " Ø" + Math.round(spW.lig.d * 1000) + " na pior ponta.", eta: cxs.eta, ok: cxs.eta <= 1 + 1e-9, cx: { sec: cxs.sec, pior: spW, ped: spU, duplos: cxs.duplos, n: cxs.spans.length, linhas: cxs.linhas.filter(function (l) { return l.escolhidos.length; }).length, VbMax: cxs.VbMax, dNmax: cxs.dNmax }, passos: psC };
      }
      if (dv.travessa && !dv.travessa.semTravessa && dv.travessa.biapoiada) {      /* R66 (4ª rodada): travessa biapoiada da 2ª mão-francesa, estribos e transferência da horizontal ao deck */
        var tv = dv.travessa, es = tv.estribo;
        L.ligacoes[id + "/travessa"] = { descricao: "Travessa de MLC " + br(tv.b * 100, 0) + "×" + br(tv.h * 100, 0) + " cm BIAPOIADA entre duas linhas de viga, pendurada por estribos de inox 316 (" + (es.n * (es.nCol || 1)) + " parafusos Ø12 passantes por estribo), recebendo a 2ª mão-francesa a " + br(tv.c2, 2) + " m do pilarete.", eta: tv.eta, ok: tv.ok, travessa: tv, n: Object.keys(tv.porPilar).length,
          passos: ["Travessa biapoiada (pior vão " + br(tv.Lt, 2) + " m), carga concentrada Fd/√2 = " + br(tv.Fv, 2) + " kN: M = " + br(tv.M, 2) + " kN·m, V = " + br(tv.V, 2) + " kN, axial Fd/√2 = " + br(tv.Fh, 2) + " kN → flexo-tração η = " + br(tv.etaFlexao, 3) + ", cortante η = " + br(tv.etaCortante, 3) + ", flecha (L/300) η = " + br(tv.etaFlecha, 3) + ".",
            "Estribo de inox (braço " + br(es.arm * 100, 0) + " cm): reação máx. " + br(tv.Rmax, 2) + " kN, " + (es.n * (es.nCol || 1)) + " parafusos Ø12 passantes na viga, Rd " + br(es.Rd, 2) + " kN (corte simples ⊥ às fibras), η = " + br(es.etaCis, 3) + ". A horizontal Fd/√2 = " + br(tv.Fh, 2) + " kN passa ao deck pelo estribo (tração dos parafusos e arruelas, contato na face da viga) η = " + br(es.etaH, 3) + "; ligação estribo × travessa (chapa interna e pinos, vertical + horizontal) η = " + br(tv.etaLigacao, 3) + ".",
            "A travessa fica ao lado do pilarete, a 25 mm da sua face: fora da região da ligação viga×pilarete (a viga continua apoiada no pilarete; a travessa não suporta a viga)."] };
      }
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
    out.mfExtra = []; out.mf = []; out.cx = []; out.travessas = []; out.pedestais = []; out.apoioU = null; out.basesEng = [];
    Object.keys(R.decks).forEach(function (id) {      /* E4b: parafusos a mais da mão-francesa (acima dos 2 por ponta do preço unitário) e a base engastada verificada (pinos, chapas em cruz, rosca total do fendilhamento) */
      var dv0 = R.decks[id], mf0 = dv0.maoFrancesa, nEng = dv0.pilaretes.filter(function (x) { return x.eng; }).length, bs = dv0.base;
      /* R59 + item 6 (E4b final): mão-francesa DUPLA — as peças somam as QUANTIDADES da fonte (cada id = 2 direções; dupla = 2 peças por direção) e não o número de ids (antes o extra de parafusos usava mf0.n = 37 ids em vez de 74 mãos-francesas: faltavam ~R$ 28 mil com BDI); parafusos passantes = ids × 2 direções × 2 pontas × n (cada parafuso atravessa as duas peças) */
      if (mf0) { var arMF = mf0.arranjo; out.mf.push({ deck: id, ids: mf0.n, secB: mf0.sec.b, secH: mf0.sec.h, pecas: mf0.nPecas, LpecaM: (2 * mf0.n * arMF.Lpeca + 2 * mf0.nIdsX * (mf0.Lmf2 + mf0.arranjo2.sobraPilar + mf0.arranjo2.sobraViga)) / Math.max(1, mf0.nPecas), b: 0.06, h: 0.12, porPonta: mf0.parafusosPorPonta, dParafuso: mf0.dParafuso, parafusos: mf0.nDirs * 2 * mf0.parafusosPorPonta }); }
      if (dv0.travessa && dv0.travessa.biapoiada && !dv0.travessa.semTravessa) { var tv0 = dv0.travessa, nTv0 = Object.keys(tv0.porPilar).length, cmpTv = Object.keys(tv0.porPilar).reduce(function (a, k) { return a + Math.abs(tv0.porPilar[k].xj - tv0.porPilar[k].xi) - (tv0.porPilar[k].bP / 2 + 0.025) - (tv0.porPilar[k].bVig / 2 + 0.025); }, 0); out.travessas.push({ deck: id, n: nTv0, h: tv0.h, b: tv0.b, compTotalM: cmpTv, estribos: 2 * nTv0, parafPorEstribo: tv0.estribo.n * (tv0.estribo.nCol || 1), kgEstribo: (2 * 0.12 * 0.20 + 0.12 * 0.10) * 0.006 * 7900 }); }
      if (dv0.cx && dv0.cx.spans.length) {      /* R73: diagonais (MLC já nos volumes da fonte), parafusos das pontas por Ø, amarração nos cruzamentos, chapas de ancoragem e chumbadores dos pedestais */
        var cx0 = dv0.cx, c0 = { deck: id, sec: cx0.sec, nDiag: 0, comp: 0, vol: 0, b12: 0, b16: 0, cruzes: 0, chapas: 0, kgChapa: 0.008 * 0.15 * 0.30 * 7900, chumb: 0 };
        cx0.spans.forEach(function (s) { s.diags.forEach(function (g) { var sobO = (g.lig.sobra || 0) * (s.tipo === "x" ? 2 : 1); c0.nDiag += 1; c0.comp += g.Ld + sobO; c0.vol += (g.Ld + sobO) * cx0.sec.b * cx0.sec.h; var nb = s.tipo === "x" ? 2 * g.lig.n : g.lig.n + s.anc.ligacao.n; if (g.lig.d > 0.0125) c0.b16 += nb; else c0.b12 += nb; }); if (s.tipo === "x") c0.cruzes++; else { c0.chapas++; c0.chumb += 2; } });      /* R12: por diagonal, com a geometria real */
        out.cx.push(c0);
      }
      if (dv0.pedestalU) { if (!out.apoioU || dv0.pedestalU.t > out.apoioU.t + 1e-9 || (Math.abs(dv0.pedestalU.t - out.apoioU.t) < 1e-9 && dv0.pedestalU.kgU > out.apoioU.kgU)) out.apoioU = { kgU: dv0.pedestalU.kgU, t: dv0.pedestalU.t, L: dv0.pedestalU.L, bViga: dv0.pedestalU.bViga_m }; out.pedestais.push({ deck: id, bViga: dv0.pedestalU.bViga_m, n: dv0.pedestais.length, hMin: Math.min.apply(null, dv0.pedestais.map(function (x) { return x.h; })), hMax: Math.max.apply(null, dv0.pedestais.map(function (x) { return x.h; })) }); }
      if (nEng && bs && bs.grupo) out.basesEng.push({ deck: id, nPilares: nEng, pinos: 2 * bs.grupo.n * nEng, dPino: bs.grupo.d, kgChapa: 2 * 0.016 * ((bs.grupo.chapaLarg_mm || 150) / 1000) * (bs.grupo.comprimento + 0.10) * 7850 * nEng, wt: (bs.f90 && bs.f90.reforco ? bs.f90.reforco.parafusos : 0) * nEng });
    });
    out.cv = []; Object.keys(R.decks).forEach(function (id) { var c = R.decks[id].contraventamento; if (!c) return; var lg = lig && lig.ligacoes || {}, nEnd = c.nDiag * 2, nPD = (lg[id + "/cvDiagonal"] || {}).n || 0, nPP = (lg[id + "/cvPilar"] || {}).n || 0, dPD = (lg[id + "/cvDiagonal"] || {}).d || 0.012;
      out.cv.push({ deck: id, tipo: c.tipo, nDiag: c.nDiag, compM: c.comprimentoTotal_m, b: c.b, h: c.h, d: c.d, nPontas: nEnd, kgChapaDiagUn: c.tipo === "madeira" ? 0.008 * Math.max(0.1, c.h - 0.05) * 0.60 * 7900 : 0, kgChapaPilarUn: 0.008 * 0.20 * 0.30 * 7900, pinosDiag: nEnd * nPD, dPinoDiag: dPD, parafPilar: nEnd * nPP, esticadores: c.tipo === "tirante" ? c.nDiag : 0 }); });
    Object.keys(R.decks).forEach(function (id) { var a = R.decks[id].amarracao; if (a) out.amarracao.push({ deck: id, n: a.n, d: a.d, ladoM: a.lado, kgUn: a.lado * a.lado * 0.008 * 7900 }); });
    return out;
  }
  /** linhas do memorial (texto corrido por item) */
  function memorial(res) {
    var L = ["T7 — DECK ELEVADO, ESCADA E GUARDA-CORPO: verificação estrutural (classe de umidade " + res.q.umidade + ", " + res.q.classe + ")"];
    Object.keys(res.decks).forEach(function (id) {
      var dv = res.decks[id]; L.push("", "Deck " + id + " — H horizontal (guarda-corpo, NBR 6120 Tab. 12) = " + br(dv.H.total, 2) + " kN" + (dv.pilaretes.length ? ", " + dv.H.nPilaretes + " pilaretes, dos quais " + dv.H.nResistentes + " resistem à horizontal (engastados ou com mão-francesa; rotulado sem travamento não leva nada), repartida pela rigidez lateral → parcela máxima " + br(dv.H.porPilarete, 3) + " kN (uniforme sobre os " + dv.H.nPilaretes + ": " + br(dv.H.parcelaUniforme, 3) + " kN)." : ", sem pilaretes de madeira: os " + dv.pedestais.length + " apoios são pedestais de concreto da fundação, que resistem à horizontal (ver R60)."));
      dv.tabua.passos.forEach(function (t) { L.push("  " + t); });
      var pb = dv.pior.barrote.id && dv.barrotes.filter(function (b) { return b.id === dv.pior.barrote.id; })[0]; if (pb && pb.res) pb.res.passos.forEach(function (t) { L.push("  [" + pb.id + "] " + t); });
      var pv = dv.pior.viga.id && dv.vigas.filter(function (b) { return b.id === dv.pior.viga.id; })[0]; if (pv && pv.res) pv.res.passos.forEach(function (t) { L.push("  [" + pv.id + "] " + t); });
      var pp = dv.pior.pilar.id && dv.pilaretes.filter(function (b) { return b.id === dv.pior.pilar.id; })[0]; if (pp) pp.passos.forEach(function (t) { L.push("  [" + pp.id + "] " + t); });
      if (dv.maoFrancesa) dv.maoFrancesa.passos.forEach(function (t) { L.push("  " + t); });
      if ((dv.pedestais || []).length) {
        var pU2 = dv.pedestalU, mdMax = Math.max.apply(null, dv.pedestais.map(function (x) { return x.Md; }));
        L.push("  R57/R60: " + dv.pedestais.length + " apoio(s) em pedestal da fundação (outra empresa), N,d máx. " + br(Math.max.apply(null, dv.pedestais.map(function (x) { return x.Nd; })), 1) + " kN, H,d máx. " + br(Math.max.apply(null, dv.pedestais.map(function (x) { return x.Hd; })), 1) + " kN, M,d máx. " + br(mdMax, 1) + " kN·m, altura " + br(Math.min.apply(null, dv.pedestais.map(function (x) { return x.h; })), 2) + " a " + br(Math.max.apply(null, dv.pedestais.map(function (x) { return x.h; })), 2) + " m: o pilar de madeira não comporta as ligações (base + topo/mão-francesa + folga).");
        L.push("  Horizontal por pedestal: " + pU2.distribuicao + " (adotado o maior, a favor da segurança; envelope: cada pedestal assume a horizontal total do deck sem descontar os pilaretes vizinhos).");
        L.push("  Apoio em U de inox 316 t = " + br(pU2.t * 1000, 0) + " mm: aba à flexão Msd = " + br(pU2.Msd, 3) + " kN·m ≤ Mpl,Rd = " + br(pU2.Mrd, 3) + " kN·m; 2 parafusos passantes Ø12 na viga Rd = " + br(pU2.RdParafuso, 2) + " kN (horizontal ao longo da viga); 2 chumbadores M12 ao cisalhamento e à tração do aço.");
        L.push("  EXIGÊNCIAS À FUNDAÇÃO: pedestal com dimensão mínima " + br(pU2.dimMin_m * 1000, 0) + " mm em planta (U de " + br(pU2.L * 1000, 0) + " mm + 2 × borda " + br(pU2.cBorda_m * 1000, 0) + " mm, adoção), distância de borda dos chumbadores ≥ " + br(pU2.cBorda_m * 1000, 0) + " mm, resistindo a N,d, H,d e M,d acima na base de cada pedestal; arrancamento e cone de concreto verificados pela fundação.");
      }
      if (dv.cx && dv.cx.spans.length) {
        L.push("  Contraventamento em X (R73): diagonais " + br(dv.cx.sec.b * 100, 0) + "×" + br(dv.cx.sec.h * 100, 0) + " cm; H_x por linha → vãos:");
        dv.cx.linhas.forEach(function (l) { if (!l.escolhidos.length) return; L.push("    y = " + br(l.y, 2) + " m: " + br(l.H, 2) + " kN (" + br(l.frac * 100, 1) + " % das cargas) → " + l.escolhidos.map(function (s) { return (s.tipo === "x" ? "cruz " : "diagonal única ") + br(s.a.x, 2) + "→" + br(s.b.x, 2) + " " + br(s.H, 2) + " kN (η " + br(s.eta, 2) + ", " + s.lig.n + " Ø" + Math.round(s.lig.d * 1000) + ")"; }).join("; ")); });
      }
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

  var MadDeck = { PADRAO: PADRAO, TAB1_PRIV: TAB1_PRIV, cargaGC: cargaGC, padrao: padrao, verificar: verificar, dimensionar: dimensionar, projetar: projetar, pacoteLigacoes: pacoteLigacoes, memorial: memorial, paraOrcamento: paraOrcamento, forcaHoriz: forcaHoriz, secoesIniciais: secoesIniciais, _tabuaVerif: tabuaVerif, _fixacaoVerif: fixacaoVerif, _guardaCorpoVerif: guardaCorpoVerif, _guardaCorpoDados: guardaCorpoDados, _perfilFn: perfilFn, _selChumb: selChumb, caFig6: caFig6, etaFig8: etaFig8, _portico: portico, _arranjoMF: arranjoMF, _cxVao: cxVao, _cxBuscaPil: cxBuscaPil, _perfilFn: perfilFn, _cxEtaGrupo: cxEtaGrupo, _cxLigPil: cxLigPil, _cxPilMax: function (v) { var o0 = CX_PIL_MAX; if (v != null) CX_PIL_MAX = v; return o0; }, _cxAlternativas: cxAlternativas, _CX: { TOP: CX_TOP, BASE: CX_BASE, TOL: CX_TOL, DXMAX: CX_DXMAX, ANG0: CX_ANG0, ANG1: CX_ANG1 }, _cxAnalisar: cxAnalisar, _cxMomentos: cxMomentos, _cxFtopo: cxFtopo, _cxBaseDe: cxBaseDe, _travessaForaDoTopo: travessaForaDoTopo, _secaoAplainada: secaoAplainada, _mfDuasDir: mfDuasDir, _baseMadeiraVerif: baseMadeiraVerif };
  if (typeof module !== "undefined" && module.exports) module.exports = MadDeck;
  else global.MadDeck = MadDeck;
})(typeof window !== "undefined" ? window : this);

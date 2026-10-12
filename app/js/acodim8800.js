/* =====================================================================
 * acodim8800.js — DIMENSIONAMENTO DE BARRAS DE AÇO pela ABNT NBR 8800
 * (perfis laminados e soldados I/H, U, cantoneira, tubos retangular e
 * circular, barra redonda) — motor PURO, ES5, sem DOM, Node-testável.
 *
 * Cada verificação devolve os PASSOS (fórmula, valores, resultado, item da
 * norma) para o memorial de cálculo. Nada aqui decide comprimento de
 * flambagem: quem decide é o js/acomodelo.js pelo papel da barra no modelo
 * (terça trava a mesa de cima da viga, mão-francesa a de baixo, travessa a
 * de fora do pilar…) e manda os trechos destravados de cada mesa.
 *
 *   verificarBarra(p) → { ok, razao, governante, verificacoes[], avisos[] }
 *     p.secao        propriedades (mm) — js/acosecao.js (dePerfil/perfilI…)
 *     p.aco          { id, fy, fu } (MPa)
 *     p.estacoes     [{ x (m), N (kN, + tração), Vy, Vz (kN), Mz, My (kN·m), comb }]
 *                    (esforços de CÁLCULO de 2ª ordem, eixos locais do
 *                    js/acoanalise.js: Mz > 0 comprime a face +y)
 *     p.L            comprimento da barra (m)
 *     p.flambagem    { Lx, Ly, Lz (m) } — comprimento de flambagem por eixo
 *                    (K = 1 com análise de 2ª ordem e imperfeições — 4.9.7)
 *     p.travamentos  { mais: [x…], menos: [x…] } posições (m) onde a mesa +y
 *                    e a mesa −y estão travadas lateralmente (as pontas
 *                    entram sempre); define os trechos da FLT
 *     p.ligacao      { An_Ag (≤ 1), Ct (≤ 1) } para a ruptura na tração
 *     p.papel        "viga" | "pilar" | "escora" | "contravento" | "tirante" …
 *
 * FÓRMULAS: NBR 8800:2008 — 5.2 (tração), 5.3 e Anexo E (compressão,
 * flambagem por flexão, torção e flexo-torção), Anexo F (flambagem local:
 * Qs, Qa), 5.4 e Anexo G (flexão: FLT, FLM, FLA; tubos), 5.4.3 (cortante),
 * 5.5.1.2 (força axial + momento), 5.2.8/5.3.4 (esbeltez). Conferidas
 * contra exemplos resolvidos publicados em tools/test-aco-8800.js.
 * ⚠ Edição vigente 2024 sem texto na biblioteca: o memorial mostra
 *   "NBR 8800:2008" em cada passo até a conferência.
 * Unidades internas: N, mm, MPa. Entrada/saída: kN, kN·m, m.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* opcoes.edicaoFLT = "2008" refaz a FLT pela 2008; opcoes.sigmaQa2008 (só na compressão pela 2008): "chi" = σ = χ·fy com o χ de
     Q = 1,0 (F.3.2, regra principal) ou "fy" = σ = fy (opção conservadora, a dos exemplos publicados) — para conferir exemplos */
  var OPC = { edicaoFLT: "2024-conservadora", sigmaQa2008: "chi" };
  var ED = "NBR 8800:2008";   /* itens sem mudança confirmada na 2024; os que mudaram citam a 2024 */
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function sq(v) { return v * v; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c); return s.replace(".", ","); }
  var PI = Math.PI;

  function Mat(p) { var M = global.AcoMateriais || (typeof require === "function" ? (function () { try { return require("./acomateriais.js"); } catch (e) { return null; } })() : null); return M; }
  function gamas() { var M = Mat(); return M ? M.GAMA : { a1: 1.10, a2: 1.35 }; }

  /* ---------------------------------------------- FLAMBAGEM LOCAL (Anexo F) */
  function grupoAL(forma, soldado) { if (forma === "L") return 3; return soldado ? 5 : 4; }
  function Qs_AL(bt, fy, E, grupo, kc) {
    var r = Math.sqrt(E / fy), lim, lim2, Qs;
    if (grupo === 3) { lim = 0.45 * r; lim2 = 0.91 * r; if (bt <= lim) Qs = 1; else if (bt <= lim2) Qs = 1.340 - 0.76 * bt * Math.sqrt(fy / E); else Qs = 0.53 * E / (fy * bt * bt); }
    else if (grupo === 5) { var rk = Math.sqrt(E / (fy / kc)); lim = 0.64 * rk; lim2 = 1.17 * rk; if (bt <= lim) Qs = 1; else if (bt <= lim2) Qs = 1.415 - 0.65 * bt * Math.sqrt(fy / (kc * E)); else Qs = 0.90 * E * kc / (fy * bt * bt); }
    else { lim = 0.56 * r; lim2 = 1.03 * r; if (bt <= lim) Qs = 1; else if (bt <= lim2) Qs = 1.415 - 0.74 * bt * Math.sqrt(fy / E); else Qs = 0.69 * E / (fy * bt * bt); }
    return { Qs: Math.min(1, Qs), lim: lim, lim2: lim2 };
  }
  /* largura efetiva de elemento AA (F.3.2): bef = 1,92·t·√(E/σ)·[1 − ca/(b/t)·√(E/σ)] ≤ b */
  function bef(b, t, E, sigma, ca) {
    var r = Math.sqrt(E / sigma), be = 1.92 * t * r * (1 - ca / (b / t) * r);
    return Math.max(0, Math.min(b, be));
  }

  function fatorQ(s, fy, E, sigma) {
    /* devolve { Q, Qs, Qa, passos } */
    var f = s.forma, passos = [], Qs = 1, Qa = 1, lim;
    if (f === "I") {
      var btf = s.bf / (2 * s.tf), hw = s.soldado ? s.d - 2 * s.tf : s.h, htw = hw / s.tw;
      var kc = Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(htw)));
      var g = Qs_AL(btf, fy, E, s.soldado ? 5 : 4, kc); Qs = g.Qs;
      passos.push({ rotulo: "Mesa (AL, grupo " + (s.soldado ? 5 : 4) + "): b/t = bf/(2·tf)", valor: br(btf, 2), extra: "limite " + br(g.lim, 2) + (Qs < 1 ? " → Qs = " + br(Qs, 3) : " → Qs = 1") });
      lim = 1.49 * Math.sqrt(E / fy);
      if (htw > lim) {
        var be = bef(hw, s.tw, E, sigma || fy, 0.34), Aef = s.A - (hw - be) * s.tw; Qa = Aef / s.A;
        passos.push({ rotulo: "Alma (AA, grupo 2): h/tw", valor: br(htw, 2), extra: "> " + br(lim, 2) + " → bef = " + br(be, 1) + " mm, Qa = " + br(Qa, 3) });
      } else passos.push({ rotulo: "Alma (AA, grupo 2): h/tw", valor: br(htw, 2), extra: "≤ 1,49·√(E/fy) = " + br(lim, 2) + " → Qa = 1" });
    } else if (f === "U") {
      var bt = s.bf / s.tf, gU = Qs_AL(bt, fy, E, 4); Qs = gU.Qs;
      passos.push({ rotulo: "Mesa (AL, grupo 4): b/t = bf/tf", valor: br(bt, 2), extra: "limite " + br(gU.lim, 2) + " → Qs = " + br(Qs, 3) });
      var htwU = (s.d - 2 * s.tf) / s.tw; lim = 1.49 * Math.sqrt(E / fy);
      if (htwU > lim) { var beU = bef(s.d - 2 * s.tf, s.tw, E, sigma || fy, 0.34); Qa = (s.A - (s.d - 2 * s.tf - beU) * s.tw) / s.A; }
      passos.push({ rotulo: "Alma (AA, grupo 2): h/tw", valor: br(htwU, 2), extra: "limite " + br(lim, 2) + " → Qa = " + br(Qa, 3) });
    } else if (f === "L") {
      var t = s.t, bL = Math.max(num(s.a, 0), num(s.b, 0)), btL = bL / t, gL = Qs_AL(btL, fy, E, 3); Qs = gL.Qs;
      passos.push({ rotulo: "Aba da cantoneira (AL, grupo 3): b/t", valor: br(btL, 2), extra: "limite " + br(gL.lim, 2) + " → Qs = " + br(Qs, 3) });
    } else if (f === "tubo-ret") {
      var hP = num(s.hPlana, s.h - 3 * s.t), bP = num(s.bPlana, s.b - 3 * s.t), l1 = 1.40 * Math.sqrt(E / fy), Aperd = 0;
      [[hP, 2], [bP, 2]].forEach(function (par) { if (par[0] / s.t > l1) { var be2 = bef(par[0], s.t, E, sigma || fy, 0.38); Aperd += par[1] * (par[0] - be2) * s.t; } });
      Qa = (s.A - Aperd) / s.A;
      passos.push({ rotulo: "Paredes do tubo (AA, grupo 1): b/t (maior)", valor: br(Math.max(hP, bP) / s.t, 2), extra: "limite " + br(l1, 2) + " → Qa = " + br(Qa, 3) });
    } else if (f === "tubo-circ") {
      var Dt = s.D / s.t, l2 = 0.11 * E / fy;
      if (Dt > l2) Qa = Math.min(1, 0.038 * E / (fy * Dt) + 2 / 3);
      passos.push({ rotulo: "Tubo circular: D/t", valor: br(Dt, 2), extra: "limite 0,11·E/fy = " + br(l2, 2) + " → Q = " + br(Qa, 3) + (Dt > 0.45 * E / fy ? " (⚠ D/t > 0,45·E/fy: fora do campo da norma)" : "") });
    }
    return { Q: Qs * Qa, Qs: Qs, Qa: Qa, passos: passos };
  }

  /* ----------------------------------------- FORÇA DE FLAMBAGEM ELÁSTICA (Anexo E) */
  function Ne(s, E, G, Lx, Ly, Lz) {
    var Nex = PI * PI * E * s.Ix / sq(Lx), Ney = PI * PI * E * s.Iy / sq(Ly);
    var r0 = num(s.r0, Math.sqrt((s.Ix + s.Iy) / s.A)), Nez = (PI * PI * E * num(s.Cw, 0) / sq(Lz) + G * num(s.J, 0)) / (r0 * r0);
    var x0 = num(s.x0, 0), y0 = num(s.y0, 0), modo, N;
    if (s.forma === "tubo-ret" || s.forma === "tubo-circ" || s.forma === "circ") { N = Math.min(Nex, Ney); modo = Nex <= Ney ? "flexão em x" : "flexão em y"; return { Ne: N, Nex: Nex, Ney: Ney, Nez: null, modo: modo }; }
    if (Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6) {
      N = Math.min(Nex, Ney, Nez); modo = N === Nex ? "flexão em x" : N === Ney ? "flexão em y" : "torção";
    } else if (Math.abs(y0) < 1e-6) {
      var k = 1 - sq(x0 / r0), Nxz = (Nex + Nez) / (2 * k) * (1 - Math.sqrt(1 - 4 * Nex * Nez * k / sq(Nex + Nez)));
      N = Math.min(Ney, Nxz); modo = N === Ney ? "flexão em y" : "flexo-torção (x–z)";
    } else if (Math.abs(x0) < 1e-6) {
      var k2 = 1 - sq(y0 / r0), Nyz = (Ney + Nez) / (2 * k2) * (1 - Math.sqrt(1 - 4 * Ney * Nez * k2 / sq(Ney + Nez)));
      N = Math.min(Nex, Nyz); modo = N === Nex ? "flexão em x" : "flexo-torção (y–z)";
    } else {
      /* assimétrica: menor raiz de (N−Nex)(N−Ney)(N−Nez) − N²(N−Ney)(x0/r0)² − N²(N−Nex)(y0/r0)² = 0 (E.3) */
      var f = function (n) { return (n - Nex) * (n - Ney) * (n - Nez) - n * n * (n - Ney) * sq(x0 / r0) - n * n * (n - Nex) * sq(y0 / r0); };
      var lo = 0, hi = Math.min(Nex, Ney, Nez);
      for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
      N = (lo + hi) / 2; modo = "flexo-torção (assimétrica)";
    }
    return { Ne: N, Nex: Nex, Ney: Ney, Nez: Nez, modo: modo };
  }

  /* ------------------------------------------------------------ COMPRESSÃO (5.3)
   * NBR 8800:2024 — o fator Q saiu: Nc,Rd = χ·Aef·fy/γa1, com λ0 = √(Ag·fy/Ne) e a
   * largura efetiva de cada elemento esbelto calculada com a tensão χ·fy:
   *   bef = b                                          se b/t ≤ (b/t)lim/√χ
   *   bef = b·[1 − c1·√(σel/(χ·fy))]·√(σel/(χ·fy))     senão,  σel = [c2·(b/t)lim/(b/t)]²·fy
   *   c1/c2 = 0,18/1,31 (elementos AA: almas), 0,20/1,38 (paredes de tubo retangular),
   *           0,22/1,49 (elementos AL: mesas e abas de cantoneira).
   * Fonte: "Novidades da ABNT NBR 8800:2024" (Gerdau, 10/10/2024) e UFU 2025 (repositorio.ufu.br/handle/123456789/47194)
   * — a mesma formulação do AISC 360-22, E7. (b/t)lim = os limites da Tabela F.1. Tubo circular: Aef da E7.2. */
  function elementosCompressao(s, fy, E) {
    /* [{ nome, b (mm), t (mm), lim ((b/t)lim), c1, c2, n (quantos iguais) }] */
    var r = Math.sqrt(E / fy), o = [];
    if (s.forma === "I") {
      var hw = s.soldado ? s.d - 2 * s.tf : s.h, kc = Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(hw / s.tw)));
      o.push({ nome: "mesas (AL)", b: s.bf / 2, t: s.tf, lim: s.soldado ? 0.64 * Math.sqrt(E / (fy / kc)) : 0.56 * r, c1: 0.22, c2: 1.49, n: 4 });
      o.push({ nome: "alma (AA)", b: hw, t: s.tw, lim: 1.49 * r, c1: 0.18, c2: 1.31, n: 1 });
    } else if (s.forma === "U") {
      o.push({ nome: "mesas (AL)", b: s.bf, t: s.tf, lim: 0.56 * r, c1: 0.22, c2: 1.49, n: 2 });
      o.push({ nome: "alma (AA)", b: s.d - 2 * s.tf, t: s.tw, lim: 1.49 * r, c1: 0.18, c2: 1.31, n: 1 });
    } else if (s.forma === "L") {
      o.push({ nome: "aba maior (AL)", b: Math.max(num(s.a, 0), num(s.b, 0)), t: s.t, lim: 0.45 * r, c1: 0.22, c2: 1.49, n: 1 });
      o.push({ nome: "aba menor (AL)", b: Math.min(num(s.a, 0), num(s.b, 0)), t: s.t, lim: 0.45 * r, c1: 0.22, c2: 1.49, n: 1 });
    } else if (s.forma === "tubo-ret") {
      o.push({ nome: "paredes maiores (tubo)", b: num(s.hPlana, s.h - 3 * s.t), t: s.t, lim: 1.40 * r, c1: 0.20, c2: 1.38, n: 2 });
      o.push({ nome: "paredes menores (tubo)", b: num(s.bPlana, s.b - 3 * s.t), t: s.t, lim: 1.40 * r, c1: 0.20, c2: 1.38, n: 2 });
    }
    return o;
  }
  function areaEfetiva(s, fy, E, chi) {
    var passos = [], Aef = s.A;
    if (s.forma === "tubo-circ") {
      var Dt = s.D / s.t, l1 = 0.11 * E / fy, l2 = 0.45 * E / fy;
      if (Dt > l1) Aef = Math.min(1, 0.038 * E / (fy * Dt) + 2 / 3) * s.A;
      passos.push({ rotulo: "Tubo circular: D/t = " + br(Dt, 1), formula: "Aef = [0,038·E/(fy·D/t) + 2/3]·Ag quando D/t > 0,11·E/fy (= " + br(l1, 1) + ")", valor: "Aef/Ag = " + br(Aef / s.A, 3), extra: Dt > l2 ? "⚠ D/t > 0,45·E/fy: fora do campo da norma" : "" });
      return { Aef: Aef, passos: passos };
    }
    elementosCompressao(s, fy, E).forEach(function (el) {
      var bt = el.b / el.t, lim = el.lim / Math.sqrt(chi), be = el.b;
      if (bt > lim) {
        var sel = Math.pow(el.c2 * el.lim / bt, 2) * fy, raiz = Math.sqrt(sel / (chi * fy));
        be = Math.max(0, Math.min(el.b, el.b * (1 - el.c1 * raiz) * raiz));
        Aef -= el.n * (el.b - be) * el.t;
      }
      passos.push({ rotulo: "Largura efetiva — " + el.nome + ": b/t = " + br(bt, 2), formula: "(b/t)lim/√χ = " + br(el.lim, 2) + "/√" + br(chi, 3) + " = " + br(lim, 2), valor: bt > lim ? "bef = " + br(be, 1) + " mm (de " + br(el.b, 1) + ")" : "bef = b (elemento não esbelto)" });
    });
    return { Aef: Aef, passos: passos };
  }
  function compressao(s, aco, E, G, fl, papel, edicao) {
    if (edicao === "2008") return compressao2008(s, aco, E, G, fl);
    var g = gamas(), fy = aco.fy, Lx = fl.Lx * 1000, Ly = fl.Ly * 1000, Lz = num(fl.Lz, fl.Ly) * 1000, passos = [], avisos = [];
    var e = Ne(s, E, G, Lx, Ly, Lz);
    var l0 = Math.sqrt(s.A * fy / e.Ne), chi = l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0);
    var ae = areaEfetiva(s, fy, E, chi);
    var NRd = chi * ae.Aef * fy / g.a1;
    var esb = Math.max(Lx / num(s.rx, Math.sqrt(s.Ix / s.A)), Ly / num(s.ry, Math.sqrt(s.Iy / s.A)));
    if (s.forma === "L" && s.rz) esb = Math.max(esb, Math.min(Lx, Ly) / s.rz);
    passos.push({ rotulo: "Comprimentos de flambagem (K = 1: análise de 2ª ordem com imperfeições)", valor: "Lx = " + br(Lx / 1000, 2) + " m; Ly = " + br(Ly / 1000, 2) + " m; Lz = " + br(Lz / 1000, 2) + " m" });
    passos.push({ rotulo: "Força de flambagem elástica Ne (Anexo E) — modo " + e.modo, formula: "Nex = π²·E·Ix/Lx²; Ney = π²·E·Iy/Ly²" + (e.Nez != null ? "; Nez = [π²·E·Cw/Lz² + G·J]/r0²" : ""), valor: br(e.Ne / 1000, 1) + " kN", extra: "Nex = " + br(e.Nex / 1000, 1) + "; Ney = " + br(e.Ney / 1000, 1) + (e.Nez != null ? "; Nez = " + br(e.Nez / 1000, 1) : "") + " kN" });
    passos.push({ rotulo: "Índice de esbeltez reduzido (NBR 8800:2024: sem o fator Q)", formula: "λ0 = √(Ag·fy/Ne)", valor: br(l0, 3) });
    passos.push({ rotulo: "Fator de redução χ", formula: l0 <= 1.5 ? "χ = 0,658^(λ0²)" : "χ = 0,877/λ0²", valor: br(chi, 3) });
    ae.passos.forEach(function (q) { passos.push(q); });
    passos.push({ rotulo: "Área efetiva", formula: "Aef = Ag − Σ(b − bef)·t", valor: br(ae.Aef, 0) + " mm²", extra: "Ag = " + br(s.A, 0) + " mm²" });
    passos.push({ rotulo: "Força axial resistente de cálculo", formula: "Nc,Rd = χ·Aef·fy/γa1", valor: br(NRd / 1000, 1) + " kN" });
    passos.push({ rotulo: "Índice de esbeltez KL/r (recomendado ≤ 200 — 5.3.7.1 da 2024)", valor: br(esb, 0), extra: esb > 200 ? "⚠ acima de 200" : "ok" });
    if (esb > 200) avisos.push("Esbeltez " + br(esb, 0) + " > 200 na compressão (NBR 8800).");
    return { NRd: NRd / 1000, passos: passos, avisos: avisos, chi: chi, Q: ae.Aef / s.A, Aef: ae.Aef, esbeltez: esb, Ne: e.Ne / 1000 };
  }

  /* compressão pela NBR 8800:2008 (fator Q do Anexo F) — mantida para conferir os exemplos publicados (quase todos de 2008) */
  function compressao2008(s, aco, E, G, fl) {
    var g = gamas(), fy = aco.fy, Lx = fl.Lx * 1000, Ly = fl.Ly * 1000, Lz = num(fl.Lz, fl.Ly) * 1000;
    var e = Ne(s, E, G, Lx, Ly, Lz), Qc = fatorQ(s, fy, E, fy);
    if (Qc.Qa < 1 && OPC.sigmaQa2008 !== "fy") {
      var l1 = Math.sqrt(s.A * fy / e.Ne), chi1 = l1 <= 1.5 ? Math.pow(0.658, l1 * l1) : 0.877 / (l1 * l1);   /* F.3.2: σ = χ·fy com o χ de Q = 1,0 */
      Qc = fatorQ(s, fy, E, chi1 * fy);
    }
    var l0 = Math.sqrt(Qc.Q * s.A * fy / e.Ne), chi = l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0);
    return { NRd: chi * Qc.Q * s.A * fy / g.a1 / 1000, chi: chi, Q: Qc.Q, Qs: Qc.Qs, Qa: Qc.Qa, l0: l0, Ne: e.Ne / 1000, modo: e.modo, passos: Qc.passos, avisos: [] };
  }

  /* --------------------------------------------------------------- TRAÇÃO (5.2) */
  function tracao(s, aco, lig, papel, L) {
    var g = gamas(), passos = [], avisos = [];
    var An = s.A * Math.min(1, num(lig && lig.An_Ag, 1)), Ct = Math.min(1, num(lig && lig.Ct, 1)), Ae = Ct * An;
    var N1 = s.A * aco.fy / g.a1, N2 = Ae * aco.fu / g.a2;
    if (s.forma === "circ") {
      /* barra redonda rosqueada: escoamento do fuste e ruptura da rosca (Abe = 0,75·Ab — 6.3.2.2) */
      var Abe = 0.75 * s.A; N2 = Abe * aco.fu / g.a2;
      passos.push({ rotulo: "Escoamento da seção bruta (5.2.2 a)", formula: "Nt,Rd = Ag·fy/γa1", valor: br(N1 / 1000, 1) + " kN" });
      passos.push({ rotulo: "Ruptura da parte rosqueada (6.3.3.1)", formula: "Nt,Rd = 0,75·Ab·fu/γa2", valor: br(N2 / 1000, 1) + " kN" });
    } else {
      passos.push({ rotulo: "Escoamento da seção bruta (5.2.2 a)", formula: "Nt,Rd = Ag·fy/γa1", valor: br(N1 / 1000, 1) + " kN" });
      passos.push({ rotulo: "Ruptura da seção líquida efetiva (5.2.2 b)", formula: "Nt,Rd = Ae·fu/γa2; Ae = Ct·An", valor: br(N2 / 1000, 1) + " kN", extra: "Ct = " + br(Ct, 2) + "; An/Ag = " + br(An / s.A, 3) });
      /* 5.2.8: maior relação COMPRIMENTO DESTRAVADO / raio de giração correspondente (a viga travada pelas terças usa o vão entre terças) */
      var fl = lig && lig.flambagem, rx = num(s.rx, Math.sqrt(s.Ix / s.A)), ry = num(s.ry, Math.sqrt(s.Iy / s.A));
      var esb = fl ? Math.max(num(fl.Lx, L) * 1000 / rx, num(fl.Ly, L) * 1000 / ry) : L * 1000 / Math.min(rx, ry, num(s.rz, 1e9));
      if (papel !== "tirante" && esb > 300) avisos.push("Esbeltez (comprimento destravado / r) = " + br(esb, 0) + " > 300 na tração (NBR 8800, 5.2.8).");
    }
    return { NRd: Math.min(N1, N2) / 1000, passos: passos, avisos: avisos };
  }

  /* ------------------------------------------------------------ FLEXÃO (Anexo G) */
  function flexaoI(s, aco, E, G, Lb, Cb, eixo) {
    var g = gamas(), fy = aco.fy, sr = 0.3 * fy, passos = [];
    if (eixo === "y") {
      /* eixo de menor inércia: só FLM (G.2.2; sem FLT nem FLA) */
      var Mply = Math.min(num(s.Zy, 1.5 * s.Wy) * fy, 1.5 * s.Wy * fy), lamy = s.bf / (2 * s.tf), lpy = 0.38 * Math.sqrt(E / fy);
      var kc = Math.min(0.76, Math.max(0.35, 4 / Math.sqrt((s.soldado ? s.d - 2 * s.tf : s.h) / s.tw)));
      var lry = s.soldado ? 0.95 * Math.sqrt(kc * E / (fy - sr)) : 0.83 * Math.sqrt(E / (fy - sr)), Mry = (fy - sr) * s.Wy, My;
      if (lamy <= lpy) My = Mply; else if (lamy <= lry) My = Mply - (Mply - Mry) * (lamy - lpy) / (lry - lpy); else My = (s.soldado ? 0.90 * E * kc : 0.69 * E) * s.Wy / (lamy * lamy);
      passos.push({ rotulo: "Flexão em torno do eixo de menor inércia — FLM (Anexo G)", formula: "λ = bf/(2tf) = " + br(lamy, 2) + "; λp = " + br(lpy, 2) + "; λr = " + br(lry, 2), valor: "MRd,y = " + br(My / g.a1 / 1e6, 2) + " kN·m" });
      return { MRd: My / g.a1 / 1e6, passos: passos };
    }
    var W = num(s.Wx, 2 * s.Ix / s.d), Mpl = Math.min(num(s.Zx, 1.12 * W) * fy, 1.5 * W * fy), Mr = (fy - sr) * W;
    /* FLT */
    var lam = Lb / s.ry, lp = 1.76 * Math.sqrt(E / fy), b1 = (fy - sr) * W / (E * s.J);
    var lr = 1.38 * Math.sqrt(s.Iy * s.J) / (s.ry * s.J * b1) * Math.sqrt(1 + Math.sqrt(1 + 27 * s.Cw * b1 * b1 / s.Iy));
    var Mcr = Cb * PI * PI * E * s.Iy / (Lb * Lb) * Math.sqrt(s.Cw / s.Iy * (1 + 0.039 * s.J * Lb * Lb / s.Cw));
    var Mflt;
    /* NBR 8800:2024: o Cb deixou de multiplicar a faixa INELÁSTICA (vale só no Mcr) e perdeu o teto de 3,0 — as fórmulas novas
       de λr não foram publicadas fora do texto. Até a conferência: faixa inelástica SEM Cb (a favor da segurança nas duas edições),
       faixa elástica com Cb no Mcr limitado a 3,0 (2008). edicaoFLT = "2008" refaz pela 2008 (Cb multiplicando a reta). */
    var cbInel = OPC.edicaoFLT === "2008" ? Cb : 1;
    if (lam <= lp) Mflt = Mpl; else if (lam <= lr) Mflt = Math.min(Mpl, cbInel * (Mpl - (Mpl - Mr) * (lam - lp) / (lr - lp))); else Mflt = Math.min(Mpl, Mcr);
    if (lam > lp && lam <= lr && OPC.edicaoFLT !== "2008") Mflt = Math.max(Mflt, Math.min(Mpl, Mcr, Mr));   /* sem degrau: nunca abaixo do elástico limitado a Mr */
    passos.push({ rotulo: "FLT — flambagem lateral com torção (Anexo G; Cb só na faixa elástica, a favor da segurança — ver nota)", formula: "λ = Lb/ry = " + br(lam, 1) + "; λp = 1,76·√(E/fy) = " + br(lp, 1) + "; λr = " + br(lr, 1) + "; Cb = " + br(Cb, 2) + (lam > lr ? "; Mcr = " + br(Mcr / 1e6, 1) + " kN·m" : ""), valor: "MRk = " + br(Mflt / 1e6, 2) + " kN·m", extra: "Lb = " + br(Lb / 1000, 2) + " m" });
    /* FLM */
    var lm = s.forma === "U" ? s.bf / s.tf : s.bf / (2 * s.tf), lpm = 0.38 * Math.sqrt(E / fy), hw = s.soldado ? s.d - 2 * s.tf : s.h;   /* U: bf/tf (FLX-04, FLX-07) */
    var kc2 = Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(hw / s.tw)));
    var lrm = s.soldado ? 0.95 * Math.sqrt(kc2 * E / (fy - sr)) : 0.83 * Math.sqrt(E / (fy - sr)), Mflm;
    if (lm <= lpm) Mflm = Mpl; else if (lm <= lrm) Mflm = Mpl - (Mpl - Mr) * (lm - lpm) / (lrm - lpm); else Mflm = (s.soldado ? 0.90 * E * kc2 : 0.69 * E) * W / (lm * lm);
    passos.push({ rotulo: "FLM — flambagem local da mesa comprimida", formula: (s.forma === "U" ? "λ = bf/tf = " : "λ = bf/(2tf) = ") + br(lm, 2) + "; λp = " + br(lpm, 2) + "; λr = " + br(lrm, 2), valor: "MRk = " + br(Mflm / 1e6, 2) + " kN·m" });
    /* FLA */
    var la = hw / s.tw, lpa = 3.76 * Math.sqrt(E / fy), lra = 5.70 * Math.sqrt(E / fy), Mfla, aviso = null;
    if (la <= lpa) Mfla = Mpl; else if (la <= lra) Mfla = Mpl - (Mpl - fy * W) * (la - lpa) / (lra - lpa); else { Mfla = fy * W; aviso = "Alma esbelta (h/tw = " + br(la, 1) + " > λr = " + br(lra, 1) + "): viga de alma esbelta — Anexo H, não coberto; trocar o perfil."; }
    passos.push({ rotulo: "FLA — flambagem local da alma", formula: "λ = h/tw = " + br(la, 2) + "; λp = 3,76·√(E/fy) = " + br(lpa, 2) + "; λr = 5,70·√(E/fy) = " + br(lra, 2), valor: "MRk = " + br(Mfla / 1e6, 2) + " kN·m" });
    var Mk = Math.min(Mflt, Mflm, Mfla, 1.5 * W * fy), MRd = Mk / g.a1;
    passos.push({ rotulo: "Momento resistente de cálculo", formula: "MRd = min(FLT, FLM, FLA)/γa1 ≤ 1,5·W·fy/γa1", valor: br(MRd / 1e6, 2) + " kN·m" });
    return { MRd: MRd / 1e6, passos: passos, aviso: aviso, lam: lam, lp: lp, lr: lr, Mcr: Mcr / 1e6 };
  }
  function flexaoTuboRet(s, aco, E, Lb, Cb, eixo) {
    var g = gamas(), fy = aco.fy, passos = [];
    var W = eixo === "y" ? s.Wy : s.Wx, Z = eixo === "y" ? s.Zy : s.Zx, Mpl = Math.min(Z * fy, 1.5 * W * fy);
    var bM = (eixo === "y" ? num(s.hPlana, s.h - 3 * s.t) : num(s.bPlana, s.b - 3 * s.t)) / s.t, hA = (eixo === "y" ? num(s.bPlana, s.b - 3 * s.t) : num(s.hPlana, s.h - 3 * s.t)) / s.t;
    var lpm = 1.12 * Math.sqrt(E / fy), lrm = 1.40 * Math.sqrt(E / fy), Mflm;
    if (bM <= lpm) Mflm = Mpl; else if (bM <= lrm) Mflm = Mpl - (Mpl - fy * W) * (bM - lpm) / (lrm - lpm); else { var beM = bef(bM * s.t, s.t, E, fy, 0.38); Mflm = fy * W * Math.max(0.5, beM / (bM * s.t)); }
    var lpa = 2.42 * Math.sqrt(E / fy), lra = 5.70 * Math.sqrt(E / fy), Mfla = hA <= lpa ? Mpl : (hA <= lra ? Mpl - (Mpl - fy * W) * (hA - lpa) / (lra - lpa) : fy * W);
    /* FLT de tubo retangular fletido em torno do eixo de maior inércia (Tabela G.1) */
    var Mflt = Mpl;
    if (eixo !== "y" && s.h > s.b) {
      var r = s.ry, lam = Lb / r, JA = Math.sqrt(s.J * s.A), Mr = fy * W, lp = 0.13 * E / Mpl * JA, lr = 2.00 * E / Mr * JA, Mcr = 2.00 * Cb * E * JA / lam;
      Mflt = lam <= lp ? Mpl : (lam <= lr ? Math.min(Mpl, Cb * (Mpl - (Mpl - Mr) * (lam - lp) / (lr - lp))) : Math.min(Mpl, Mcr));
      passos.push({ rotulo: "FLT do tubo retangular", formula: "λ = Lb/ry = " + br(lam, 1) + "; λp = " + br(lp, 1) + "; λr = " + br(lr, 1), valor: "MRk = " + br(Mflt / 1e6, 2) + " kN·m" });
    }
    passos.push({ rotulo: "FLM do tubo (b/t = " + br(bM, 1) + "; λp = " + br(lpm, 1) + "; λr = " + br(lrm, 1) + ")", valor: "MRk = " + br(Mflm / 1e6, 2) + " kN·m" });
    passos.push({ rotulo: "FLA do tubo (h/t = " + br(hA, 1) + "; λp = " + br(lpa, 1) + "; λr = " + br(lra, 1) + ")", valor: "MRk = " + br(Mfla / 1e6, 2) + " kN·m" });
    var MRd = Math.min(Mflt, Mflm, Mfla) / g.a1;
    passos.push({ rotulo: "Momento resistente de cálculo (eixo " + (eixo === "y" ? "y" : "x") + ")", valor: br(MRd / 1e6, 2) + " kN·m" });
    return { MRd: MRd / 1e6, passos: passos };
  }
  function flexaoTuboCirc(s, aco, E) {
    var g = gamas(), fy = aco.fy, Dt = s.D / s.t, W = s.Wx, Z = s.Zx, Mk;
    if (Dt <= 0.07 * E / fy) Mk = Math.min(Z * fy, 1.5 * W * fy);
    else if (Dt <= 0.31 * E / fy) Mk = (0.021 * E / Dt + fy) * W;
    else Mk = 0.33 * E / Dt * W;
    return { MRd: Mk / g.a1 / 1e6, passos: [{ rotulo: "Flexão do tubo circular (G.2.3)", formula: "D/t = " + br(Dt, 1) + " (limites 0,07·E/fy = " + br(0.07 * E / fy, 1) + " e 0,31·E/fy = " + br(0.31 * E / fy, 1) + ")", valor: "MRd = " + br(Mk / g.a1 / 1e6, 2) + " kN·m" }] };
  }
  function flexaoSimples(s, aco, eixo) {   /* cantoneira, barra, U no eixo fraco: escoamento elástico (a favor da segurança) */
    var g = gamas(), W = eixo === "y" ? s.Wy : s.Wx;
    return { MRd: aco.fy * W / g.a1 / 1e6, passos: [{ rotulo: "Flexão — início do escoamento (W·fy/γa1, a favor da segurança)", valor: br(aco.fy * W / g.a1 / 1e6, 2) + " kN·m" }] };
  }
  /* módulo plástico do U em torno do eixo paralelo à alma (y), pela geometria (mesas bf × tf, alma tw na altura d):
     linha neutra plástica onde as áreas dos dois lados se igualam; Z = ∫ H(x)·|x − xp| dx */
  function zyU(s) {
    var d = s.d, bf = s.bf, tf = s.tf, tw = s.tw;
    if (!(d > 0 && bf > 0 && tf > 0 && tw > 0)) return null;
    var A = 2 * bf * tf + (d - 2 * tf) * tw, xp = A / 2 <= tw * d ? A / (2 * d) : tw + (A / 2 - tw * d) / (2 * tf);
    function faixa(a, b, H) { if (b <= a) return 0; var f = function (x) { return (x - xp) * Math.abs(x - xp) / 2; }; return H * (f(b) - f(a)) * 1; }
    function integ(a, b, H) { if (b <= a) return 0; if (xp <= a || xp >= b) return Math.abs(faixa(a, b, H)); return Math.abs(faixa(a, xp, H)) + Math.abs(faixa(xp, b, H)); }
    return integ(0, tw, d) + integ(tw, bf, 2 * tf);
  }
  /* U fletido em torno do eixo de menor inércia (Tabela G.1): FLM com λ = bf/tf (a mesa do U é inteira) e FLA da alma
     (elemento AA comprimido por inteiro: λp = 1,12·√(E/fy), λr = 1,40·√(E/fy)); Mpl = Zy·fy ≤ 1,50·Wy·fy (5.4.2.2) */
  function flexaoUy(s, aco, E) {
    var g = gamas(), fy = aco.fy, sr = 0.3 * fy, W = s.Wy, Zc = num(s.Zy, null), Z = Zc || zyU(s) || 1.5 * W, passos = [];
    var Mpl = Math.min(Z * fy, 1.5 * W * fy), Mr = (fy - sr) * W;
    var lm = s.bf / s.tf, lpm = 0.38 * Math.sqrt(E / fy), lrm = 0.83 * Math.sqrt(E / (fy - sr)), Mflm;
    if (lm <= lpm) Mflm = Mpl; else if (lm <= lrm) Mflm = Mpl - (Mpl - Mr) * (lm - lpm) / (lrm - lpm); else Mflm = 0.69 * E * W / (lm * lm);
    var hA = num(s.h, s.d - 2 * s.tf) / s.tw, lpa = 1.12 * Math.sqrt(E / fy), lra = 1.40 * Math.sqrt(E / fy), Mfla;
    if (hA <= lpa) Mfla = Mpl; else if (hA <= lra) Mfla = Mpl - (Mpl - fy * W) * (hA - lpa) / (lra - lpa); else { var be = bef(hA * s.tw, s.tw, E, fy, 0.34); Mfla = fy * W * Math.max(0.5, be / (hA * s.tw)); }
    var MRd = Math.min(Mflm, Mfla) / g.a1;
    passos.push({ rotulo: "Momento de plastificação (eixo y)", formula: "Mpl = Zy·fy ≤ 1,50·Wy·fy (5.4.2.2)" + (Zc ? "" : "; Zy pela geometria do perfil = " + br(Z / 1000, 2) + " cm³"), valor: br(Mpl / 1e6, 2) + " kN·m" });
    passos.push({ rotulo: "FLM — mesa do U (Tabela G.1)", formula: "λ = bf/tf = " + br(lm, 2) + "; λp = 0,38·√(E/fy) = " + br(lpm, 2) + "; λr = 0,83·√(E/(fy − σr)) = " + br(lrm, 2), valor: "MRk = " + br(Mflm / 1e6, 2) + " kN·m" });
    passos.push({ rotulo: "FLA — alma do U comprimida por inteiro (Tabela G.1)", formula: "λ = h/tw = " + br(hA, 2) + "; λp = 1,12·√(E/fy) = " + br(lpa, 2) + "; λr = 1,40·√(E/fy) = " + br(lra, 2), valor: "MRk = " + br(Mfla / 1e6, 2) + " kN·m" });
    passos.push({ rotulo: "Momento resistente de cálculo (eixo y)", formula: "MRd = mín(FLM, FLA)/γa1", valor: br(MRd / 1e6, 2) + " kN·m" });
    return { MRd: MRd / 1e6, passos: passos };
  }
  function flexao(s, aco, E, G, Lb, Cb, eixo) {
    if (s.forma === "U" && eixo === "y" && s.Wy > 0 && s.tf > 0) return flexaoUy(s, aco, E);
    if (s.forma === "I" || (s.forma === "U" && eixo !== "y")) return flexaoI(s, aco, E, G, Lb, Cb, eixo);
    if (s.forma === "tubo-ret") return flexaoTuboRet(s, aco, E, Lb, Cb, eixo);
    if (s.forma === "tubo-circ") return flexaoTuboCirc(s, aco, E);
    return flexaoSimples(s, aco, eixo);
  }

  /* ------------------------------------------------------------- CORTANTE (5.4.3) */
  function cortante(s, aco, E, eixo) {
    var g = gamas(), fy = aco.fy, Aw, lam, kv = 5.0, passos = [];
    if (s.forma === "tubo-circ") {
      var Dt = s.D / s.t, fcr = Math.min(0.60 * fy, 0.78 * E / Math.pow(Dt, 1.5)), V = 0.5 * fcr * s.A / g.a1;
      return { VRd: V / 1000, passos: [{ rotulo: "Cortante do tubo circular (5.4.3.5)", formula: "VRd = 0,5·fcr·Ag/γa1", valor: br(V / 1000, 1) + " kN" }] };
    }
    if (s.forma === "circ" || s.forma === "L") { var Vb = 0.6 * fy * s.A * 0.5 / g.a1; return { VRd: Vb / 1000, passos: [{ rotulo: "Cortante (seção maciça/aba — 0,6·fy·A/2/γa1, a favor da segurança)", valor: br(Vb / 1000, 1) + " kN" }] }; }
    if (eixo === "y") { /* cortante no plano das mesas */
      if (s.forma === "tubo-ret") { Aw = 2 * s.b * s.t; lam = num(s.bPlana, s.b - 3 * s.t) / s.t; }
      else { Aw = 2 * s.bf * s.tf; lam = s.forma === "U" ? s.bf / s.tf : s.bf / (2 * s.tf); kv = 1.2; }
    } else {
      if (s.forma === "tubo-ret") { Aw = 2 * s.h * s.t; lam = num(s.hPlana, s.h - 3 * s.t) / s.t; }
      else { Aw = s.d * s.tw; lam = (s.soldado ? s.d - 2 * s.tf : num(s.h, s.d - 2 * s.tf)) / s.tw; }
    }
    var lp = 1.10 * Math.sqrt(kv * E / fy), lr = 1.37 * Math.sqrt(kv * E / fy), Vpl = 0.60 * Aw * fy, VRd;
    if (lam <= lp) VRd = Vpl / g.a1; else if (lam <= lr) VRd = lp / lam * Vpl / g.a1; else VRd = 1.24 * sq(lp / lam) * Vpl / g.a1;
    passos.push({ rotulo: "Força cortante resistente (5.4.3)" + (eixo === "y" ? " — plano das mesas" : ""), formula: "λ = " + br(lam, 1) + "; λp = 1,10·√(kv·E/fy) = " + br(lp, 1) + "; λr = " + br(lr, 1) + "; Vpl = 0,60·Aw·fy", valor: "VRd = " + br(VRd / 1000, 1) + " kN", extra: "Aw = " + br(Aw, 0) + " mm²; kv = " + br(kv, 1) });
    return { VRd: VRd / 1000, passos: passos };
  }

  /* --------------------------------------------- Cb pelo diagrama de momentos (5.4.2.3) */
  function Cb(mom) {   /* mom(xRel 0..1) → |M| */
    var Ma = Math.abs(mom(0.25)), Mb = Math.abs(mom(0.5)), Mc = Math.abs(mom(0.75)), Mmax = 0;
    for (var i = 0; i <= 40; i++) Mmax = Math.max(Mmax, Math.abs(mom(i / 40)));
    if (!(Mmax > 0)) return 1;
    return Math.min(3.0, 12.5 * Mmax / (2.5 * Mmax + 3 * Ma + 4 * Mb + 3 * Mc));   /* teto 3,0 (2008) mantido até a conferência na 2024, que o removeu mas mudou o papel do Cb */
  }
  function interp(est, x, k) {
    if (!est.length) return 0; if (x <= est[0].x) return est[0][k]; if (x >= est[est.length - 1].x) return est[est.length - 1][k];
    for (var i = 1; i < est.length; i++) if (x <= est[i].x + 1e-12) { var a = est[i - 1], b = est[i], t = (x - a.x) / Math.max(1e-12, b.x - a.x); return a[k] + (b[k] - a[k]) * t; }
    return 0;
  }

  /* ============================================================ VERIFICAR BARRA */
  function verificarBarra(p) {
    var s = p.secao, aco = p.aco, M = Mat(), E = M ? M.CONST.E : 200000, G = M ? M.CONST.G : 77000;
    if (!s || !aco || !(aco.fy > 0)) return { ok: false, motivo: "Seção ou aço ausente." };
    var L = num(p.L, 0), fl = p.flambagem || { Lx: L, Ly: L, Lz: L };
    var porComb = {}, avisos = [], verifs = [], pior = { razao: 0 };
    arr(p.estacoes).forEach(function (e) { (porComb[e.comb || "?"] = porComb[e.comb || "?"] || []).push(e); });
    var temN = arr(p.estacoes).some(function (e) { return Math.abs(e.N) > 1e-6; });
    var comp = null, trac = null;
    var Ncmax = 0, Ntmax = 0; arr(p.estacoes).forEach(function (e) { if (e.N < Ncmax) Ncmax = e.N; if (e.N > Ntmax) Ntmax = e.N; });
    if (Ncmax < -1e-6 && p.papel !== "tirante") comp = compressao(s, aco, E, G, fl, p.papel);
    if (Ntmax > 1e-6 || p.papel === "tirante") { var lg = {}; Object.keys(p.ligacao || {}).forEach(function (k) { lg[k] = p.ligacao[k]; }); lg.flambagem = p.flambagem; trac = tracao(s, aco, lg, p.papel, L); }
    if (comp) avisos = avisos.concat(comp.avisos);
    if (trac) avisos = avisos.concat(trac.avisos);
    var flexivel = !(s.forma === "circ" || p.papel === "tirante" || p.papel === "contravento");
    /* trechos de FLT por mesa: travamentos (m) + as pontas */
    function trechos(lista) { var xs = [0, L].concat(arr(lista)).filter(function (x) { return x >= -1e-9 && x <= L + 1e-9; }).sort(function (a, b) { return a - b; }), o = []; for (var i = 0; i + 1 < xs.length; i++) if (xs[i + 1] - xs[i] > 1e-6) o.push([xs[i], xs[i + 1]]); return o; }
    var trv = p.travamentos || {}, tMais = trechos(trv.mais), tMenos = trechos(trv.menos);
    var cacheMRd = {};
    function MRdZ(x, sinal, est) {
      /* sinal > 0: Mz positivo comprime a mesa +y → trechos da mesa +y */
      var tr = (sinal >= 0 ? tMais : tMenos).filter(function (t) { return x >= t[0] - 1e-9 && x <= t[1] + 1e-9; })[0] || [0, L];
      var cb = 1;
      if (p.cb == null || p.cb === "auto") cb = Cb(function (r) { var v = interp(est, tr[0] + r * (tr[1] - tr[0]), "Mz"); return (sinal >= 0 ? Math.max(0, v) : Math.max(0, -v)); });
      else cb = num(p.cb, 1);
      var k = (sinal >= 0 ? "+" : "-") + tr[0].toFixed(3) + "-" + tr[1].toFixed(3) + "-" + cb.toFixed(3);
      if (!cacheMRd[k]) { var f = flexao(s, aco, E, G, (tr[1] - tr[0]) * 1000, cb, "x"); f.trecho = tr; f.cb = cb; f.mesa = sinal >= 0 ? "+y" : "−y"; cacheMRd[k] = f; }
      return cacheMRd[k];
    }
    var fy_ = flexivel ? flexao(s, aco, E, G, Math.max(1, fl.Ly * 1000), 1, "y") : null;
    var vz = flexivel ? cortante(s, aco, E, "x") : null, vy2 = flexivel ? cortante(s, aco, E, "y") : null;
    Object.keys(porComb).forEach(function (cid) {
      var est = porComb[cid].slice().sort(function (a, b) { return a.x - b.x; });
      est.forEach(function (e) {
        var N = e.N, Mz = e.Mz || 0, My = e.My || 0, r, det;
        var NRd = N < 0 ? (comp ? comp.NRd : null) : (trac ? trac.NRd : null);
        var fz = flexivel && Math.abs(Mz) > 1e-9 ? MRdZ(e.x, Mz >= 0 ? 1 : -1, est) : null;
        var rN = NRd ? Math.abs(N) / NRd : 0, rMz = fz ? Math.abs(Mz) / fz.MRd : 0, rMy = fy_ && Math.abs(My) > 1e-9 ? Math.abs(My) / fy_.MRd : 0;
        if (rN >= 0.2) { r = rN + 8 / 9 * (rMz + rMy); det = "NSd/NRd + 8/9·(Mx,Sd/Mx,Rd + My,Sd/My,Rd)"; }
        else { r = rN / 2 + rMz + rMy; det = "NSd/(2·NRd) + (Mx,Sd/Mx,Rd + My,Sd/My,Rd)"; }
        if (!flexivel) { r = rN; det = "NSd/NRd"; }
        var rV = vz ? Math.abs(e.Vy || 0) / vz.VRd : 0, rV2 = vy2 ? Math.abs(e.Vz || 0) / vy2.VRd : 0;
        var rr = Math.max(r, rV, rV2);
        if (rr > pior.razao) pior = { razao: rr, comb: cid, x: e.x, N: N, Mz: Mz, My: My, Vy: e.Vy, Vz: e.Vz, rN: rN, rMz: rMz, rMy: rMy, rV: Math.max(rV, rV2), formula: r >= Math.max(rV, rV2) ? det : "VSd/VRd", NRd: NRd, MRdz: fz ? fz.MRd : null, flt: fz, MRdy: fy_ ? fy_.MRd : null };
      });
    });
    /* monta as verificações para o memorial (as da situação que governa) */
    if (comp) verifs.push({ nome: "Compressão", item: "NBR 8800:2024, 5.3 e Anexo E (área efetiva)", passos: comp.passos, resistencia: comp.NRd, unidade: "kN", solicitante: Math.abs(Ncmax), razao: Math.abs(Ncmax) / comp.NRd });
    if (trac) verifs.push({ nome: "Tração", item: ED + ", 5.2", passos: trac.passos, resistencia: trac.NRd, unidade: "kN", solicitante: Ntmax, razao: Ntmax / trac.NRd });
    if (pior.flt) verifs.push({ nome: "Flexão em torno do eixo de maior inércia (mesa " + pior.flt.mesa + " comprimida, trecho " + br(pior.flt.trecho[0], 2) + "–" + br(pior.flt.trecho[1], 2) + " m)", item: ED + ", 5.4 e Anexo G", passos: pior.flt.passos, resistencia: pior.flt.MRd, unidade: "kN·m", solicitante: Math.abs(pior.Mz), razao: Math.abs(pior.Mz) / pior.flt.MRd });
    if (fy_ && Math.abs(num(pior.My, 0)) > 1e-6) verifs.push({ nome: "Flexão em torno do eixo de menor inércia", item: ED + ", Anexo G", passos: fy_.passos, resistencia: fy_.MRd, unidade: "kN·m", solicitante: Math.abs(pior.My), razao: Math.abs(pior.My) / fy_.MRd });
    if (vz) verifs.push({ nome: "Cortante", item: ED + ", 5.4.3", passos: vz.passos, resistencia: vz.VRd, unidade: "kN", solicitante: Math.abs(num(pior.Vy, 0)), razao: Math.abs(num(pior.Vy, 0)) / vz.VRd });
    if (flexivel && temN) verifs.push({ nome: "Força axial + momentos (interação)", item: ED + ", 5.5.1.2", passos: [{ rotulo: "Situação que governa: combinação " + pior.comb + ", x = " + br(pior.x, 2) + " m", formula: pior.formula, valor: br(pior.razao, 3), extra: "N = " + br(pior.N, 1) + " kN; Mx = " + br(pior.Mz, 2) + " kN·m; My = " + br(pior.My, 2) + " kN·m" }], resistencia: 1, unidade: "", solicitante: pior.razao, razao: pior.razao });
    if (pior.flt && pior.flt.aviso) avisos.push(pior.flt.aviso);
    var razao = Math.max.apply(null, [pior.razao].concat(verifs.map(function (v) { return v.razao || 0; })));
    var gov = verifs.slice().sort(function (a, b) { return (b.razao || 0) - (a.razao || 0); })[0];
    return { ok: razao <= 1.0 + 1e-9 && !avisos.some(function (a) { return /não coberto|fora do campo/.test(a); }), razao: razao, governante: gov ? gov.nome : null, pior: pior, verificacoes: verifs, avisos: avisos, edicao: ED };
  }

  var AcoDim8800 = { ED: ED, opcoes: OPC, compressao2008: compressao2008, verificarBarra: verificarBarra, compressao: compressao, tracao: tracao, flexao: flexao, cortante: cortante, fatorQ: fatorQ, Ne: Ne, Cb: Cb };
  global.AcoDim8800 = AcoDim8800;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoDim8800;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

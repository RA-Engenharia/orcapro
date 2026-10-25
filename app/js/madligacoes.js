/* =====================================================================
 * madligacoes.js — LIGAÇÕES de estruturas de madeira engenharada (motor PURO, ES5, sem DOM, Node-testável).
 * Generaliza o ligacoes_casa.js da obra Casa Mar (R01/R02, 23/10/2026): o que lá era um script de uma obra aqui são funções com
 * entrada e saída em objeto. Cada verificação devolve { eta, ok, passos[] } (como o maddim7190.js); `passos` é o texto do memorial.
 *
 * Conteúdo:
 *   · Johansen (NBR 7190-1:2022, 7.2 e 7.3, Tabelas 18/19 — cópia de consulta, exemplarLicenciado:false; ver NORMA no fim): chapa de aço INTERNA (2 planos), chapas
 *     EXTERNAS (aço-madeira-aço, chapa fina/grossa/interpolada pela espessura da chapa), chapa em corte simples (fina/grossa) e madeira-madeira (corte simples e duplo);
 *   · fh,α de Hankinson (fh,90 = k90·...: k90 = 1,35 + 0,015·d[mm], coníferas), My,Rk = 0,3·fu·d^2,6;
 *   · GRUPO de pinos com MOMENTO POLAR (pino mais carregado e seu ângulo com a fibra);
 *   · n_ef INTERPOLADO por ângulo (0° → n^-0,1·(a1/13d)^0,25; 90° → 1) — EN 1995 8.5.1.1 (a favor da segurança em relação à 7.1.7 da NBR, mantido: decisão do RT);
 *   · ESPAÇAMENTOS a1/a2/a3/a4 pelo ângulo (NBR 7190-1:2022, 7.1.10, Tab. 14) — a1 = (4 + 3|cos α|)·d etc. (R05, 24/10/2026: antes (4 + |cos α|)·d e a1 = 5d fixo, CONTRA a segurança);
 *   · γ_lig = 1,4 em TODA ligação (7.1.2), inclusive rosca total e fita; k_mod1 ≤ 1 para conector de aço; d ≤ t/2; Kser/Ku (7.1.12, Tab. 17) e a RIGIDEZ DA BASE Kθ = Ku·Σr² (N6);
 *   · aço da chapa (Mpl,Rd), placa de base e CHUMBADORES (tração por lado) — NBR 8800 / EN 1993;
 *   · parafuso de ROSCA TOTAL com ângulo e lef de cada lado (força axial = F/(n·cosθ); Rax,k proporcional ao menor lef);
 *   · REFORÇO à tração normal (he/h): Ft,90 = (1 − 3α² + 2α³)·F;
 *   · VERGA (chapa em T na fenda), PENDURAL, ESCORA, BLOQUEADOR, FITA;
 *   · pacoteT1(): o pacote de ligações da tipologia T1 (pilar × V × terça × verga) — regressão: ligacoes_casa.json (A, B e C).
 *
 * VALORES DE CATÁLOGO (SFS WT-T, ETA-12/0063) NÃO são inventados aqui: vêm de `PARAFUSOS` com a fonte, ou o chamador informa
 * (Rax,k). Sem valor → o motor recusa.
 * ⚠ Densidade de RESISTÊNCIA (rhok) ≠ peso de carga.
 * Teste: node tools/test-mad-eng-lig.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function ext(a) { for (var i = 1; i < arguments.length; i++) for (var k in arguments[i]) if (Object.prototype.hasOwnProperty.call(arguments[i], k)) a[k] = arguments[i][k]; return a; }
  function br(x, n) { return (n == null ? x.toFixed(2) : x.toFixed(n)).replace(".", ","); }
  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p) / p; }

  /* catálogo (kN): ver ligacoes_casa.js R01 — transcrito do catálogo SFS (ETA-12/0063, p. 3) e da conferência M2 da revisão */
  var PARAFUSOS = {
    "WT-T-8,2": {
      d_mm: 8.2, fonte: "SFS WT-T, ETA-12/0063 (catálogo transcrito na R01) — conferir a ETA para outra obra",
      RaxK_cruzado150: 14.2,   // kN: rosca ~150 mm de cada lado da junta (revisão M2: 11,5·8,2·150 ≈ 14,2)
      lefRef: 150,             // mm de cada lado, referência do valor acima
      RaxK_190: 12.37,         // kN: WT-T 8,2 × 190 numa peça (Tab. 4, ρ 380)
      FtK_aco: 17.1            // kN: resistência característica à tração do aço
    }
  };

  /* gamaRax: 1,4 (7.1.2, p. 49 impr.) — era 1,25 (EN/ETA) e 1,3 na fita: CONTRA a segurança (R05). gamaFtAco 1,25 = ruptura do AÇO do parafuso (NBR 8800/EN), não é resistência de ligação em madeira.
     kmod1/kmod2 (opcionais): se vierem os dois, kmod = mín(kmod1; 1,0)·kmod2 (7.1.2: conector de aço nunca com kmod1 > 1). pinoTipo: coluna da Tab. 14 — "ajustado" (parafusos passantes, rosca soberba, pinos ajustados; padrão) ou "liso".
     k90Tipo: "conifera" (padrão; MLC é conífera), "folhosa" ou "lvl" (6.2.5). */
  var PADRAO = { kmod: 0.72, gLig: 1.4, rhok: 385, fu: 500, fy: 250, gamaA1: 1.1, gamaRax: 1.4, gamaFtAco: 1.25, d: 0.016, dBase: null, kmod1: null, kmod2: null, pinoTipo: "ajustado", k90Tipo: "conifera" };
  function cfg(o) {
    var c = {}; Object.keys(PADRAO).forEach(function (k) { c[k] = o && o[k] != null ? o[k] : PADRAO[k]; });
    if (c.kmod1 != null && c.kmod2 != null) { c.kmod1Ef = Math.min(c.kmod1, 1); c.kmod = c.kmod1Ef * c.kmod2; }
    return c;
  }
  /* FONTE por item da NBR 7190-1:2022 (cópia de consulta, NÃO licenciada à RA; transcrição conferida na imagem em 24/10/2026; páginas: impressa (PDF = impressa + 12)) */
  var NORMA = {
    gLig: { item: "7.1.2", pagina: "49 (PDF 61)", texto: "R_d = k_mod1·k_mod2·R_k/γ_lig, γ_lig = 1,4; conector de aço: k_mod1 ≤ 1" },
    tab14: { item: "7.1.10, Tabela 14", pagina: "53 (PDF 65)", texto: "espaçamentos de pinos metálicos (parafusos passantes, rosca soberba, ajustados / pinos lisos)" },
    embutimento: { item: "6.2.5", pagina: "18 (PDF 30)", texto: "f_e0,k = 0,082·(1 − 0,01d)·ρk; f_eα,k = f_e0,k/(k90·sen²α + cos²α); k90 = 1,35 (conífera) / 1,30 (LVL) / 0,90 (folhosa) + 0,015d" },
    myRk: { item: "7.1.4", pagina: "50 (PDF 62)", texto: "M_y,Rk = 0,3·f_u,k·d^2,6" },
    tab18: { item: "7.2, Tabela 18", pagina: "58–59 (PDF 70–71)", texto: "madeira–madeira, uma seção de corte, 6 modos" },
    tab19: { item: "7.2, Tabela 19", pagina: "59–60 (PDF 71–72)", texto: "madeira–madeira, duas seções de corte, 4 modos" },
    aco73: { item: "7.3", pagina: "61–63 (PDF 73–75)", texto: "madeira–aço: chapa fina t ≤ 0,5d, grossa t ≥ d, interpolação entre as duas" },
    diametro72: { item: "7.2 (a)–(f)", pagina: "56–57 (PDF 68–69)", texto: "d do parafuso ≤ metade da menor espessura de madeira; ponta do parafuso de rosca ≥ 6d" },
    kser: { item: "7.1.12, Tabela 17", pagina: "55–56 (PDF 67–68)", texto: "K_ser = ρ_med^1,5·d/23 (N/mm por seção de corte); madeira–aço o dobro; K_u = (2/3)·K_ser" },
    tab6: { item: "6.2.4, Tabela 6; 6.3.3", pagina: "17 e 20 (PDF 29 e 32)", texto: "α_n pela extensão carregada; f_c90,d ≤ 0,25·f_c0,d·α_n" },
    pino9: { item: "7.1.9", pagina: "51 (PDF 63)", texto: "rosca soberba d ≥ 9,5 mm e f_y,k ≥ 250 MPa; parafuso passante d ≥ 9,5 mm" },
    f90: { item: "7.1.1", pagina: "48 (PDF 60)", texto: "F_90,Rk = 14·b·√(h_e/(1 − h_e/h))" },
    exemplarLicenciado: false
  };

  /* ---------------- Johansen (NBR 7190-1:2022, 6.2.5 e 7.1.4, 7.2, 7.3) ---------------- */
  function fh0(d, rhok) { return 0.082 * (1 - 0.01 * d * 1000) * rhok; }                       // MPa (6.2.5; pino sem pré-furo)
  /** k90 (6.2.5): conífera 1,35 + 0,015d; LVL 1,30 + 0,015d; folhosa 0,90 + 0,015d (d em mm) */
  function k90De(d, tipo) { var b = tipo === "folhosa" ? 0.90 : tipo === "lvl" ? 1.30 : 1.35; return b + 0.015 * d * 1000; }
  function fhAlfa(d, a, rhok, k90tipo) { var k90 = k90De(d, k90tipo); return fh0(d, rhok) / (k90 * Math.pow(Math.sin(a), 2) + Math.pow(Math.cos(a), 2)); }
  function MyRk(d, fu) { return 0.3 * fu * Math.pow(d * 1000, 2.6); }                           // N·mm (7.1.4)

  /** chapa de aço INTERNA (fenda no elemento de madeira), 2 planos de corte: kN por pino. t1 = espessura de madeira de cada lado (m). Modos (f)(g)(h) da 7.3 (qualquer espessura de chapa); sem F_ax/4 */
  function chapaInterna(d, t1, a, rhok, fu, k90t) {
    var f = fhAlfa(d, a, rhok, k90t), Dm = d * 1000, T = t1 * 1000, m = MyRk(d, fu);
    var modos = [f * T * Dm, f * T * Dm * (Math.sqrt(2 + 4 * m / (f * Dm * T * T)) - 1), 2.3 * Math.sqrt(m * f * Dm)];
    return 2 * Math.min(modos[0], modos[1], modos[2]) / 1000;
  }
  /** classe da chapa (7.3): "fina" (ts ≤ 0,5d), "grossa" (ts ≥ d) ou "intermediaria" (interpolação linear dos menores valores). ts em m; sem ts → fina (comportamento anterior) */
  function classeChapa(d, ts) { if (ts == null || ts <= 0.5 * d + 1e-12) return "fina"; if (ts >= d - 1e-12) return "grossa"; return "intermediaria"; }
  function interpChapa(d, ts, fina, grossa) { var c = classeChapa(d, ts); if (c === "fina") return fina; if (c === "grossa") return grossa; return fina + (grossa - fina) * (ts - 0.5 * d) / (0.5 * d); }
  /**
   * chapas EXTERNAS (aço-madeira-aço, corte duplo), t2 = espessura da peça de madeira (m), ts = espessura de cada chapa (m): kN por pino (2 planos).
   * 7.3 (i)(j) chapa FINA: mín(0,5·fe2·t2·d ; 1,15·√(2·My·fe2·d)); (k)(l) chapa GROSSA: mín(0,5·fe2·t2·d ; 2,3·√(My·fe2·d)); entre 0,5d e d, interpolação linear. Sem F_ax/4 (a favor).
   */
  function chapasExternas(d, t2, a, rhok, fu, ts, k90t) {
    var f = fhAlfa(d, a, rhok, k90t), Dm = d * 1000, T = t2 * 1000, m = MyRk(d, fu), emb = 0.5 * f * T * Dm;
    var fina = Math.min(emb, 1.15 * Math.sqrt(2 * m * f * Dm)), grossa = Math.min(emb, 2.3 * Math.sqrt(m * f * Dm));
    return 2 * interpChapa(d, ts, fina, grossa) / 1000;
  }
  /**
   * MADEIRA-MADEIRA, corte duplo simétrico (peça central t2 entre duas laterais t1): kN por pino (2 planos) — Tabela 19 (Ia, Ib, II, III), sem F_ax/4.
   * simplificado:true = a forma usada na R02 (2·min(fe,α·t1·d ; 1,15·√(2·My·fe,90·d))): NÃO EXISTE na norma — resultado até 5 % ACIMA do completo a 90°. Só reproduz a R02; fora do caminho de cálculo (cfg.mmSimplificado; pacoteT1 avisa).
   */
  function madeiraMadeira(d, t1, t2, a1, a2, rhok, fu, simplificado, k90t) {
    var f1 = fhAlfa(d, a1, rhok, k90t), f2 = fhAlfa(d, a2 == null ? Math.PI / 2 : a2, rhok, k90t), Dm = d * 1000, T1 = t1 * 1000, T2 = t2 * 1000, m = MyRk(d, fu);
    if (simplificado) return 2 * Math.min(f1 * T1 * Dm, 1.15 * Math.sqrt(2 * m * f2 * Dm)) / 1000;
    var beta = f2 / f1;
    var g = f1 * T1 * Dm, h = 0.5 * f2 * T2 * Dm, j = 1.05 * f1 * T1 * Dm / (2 + beta) * (Math.sqrt(2 * beta * (1 + beta) + 4 * beta * (2 + beta) * m / (f1 * Dm * T1 * T1)) - beta);
    var k = 1.15 * Math.sqrt(2 * beta / (1 + beta)) * Math.sqrt(2 * m * f1 * Dm);
    return 2 * Math.min(g, h, j, k) / 1000;
  }
  /**
   * MADEIRA-MADEIRA, UMA seção de corte (Tabela 18, 6 modos Ia, Ib, Ic, IIa, IIb, III; sem F_ax/4): kN por pino por seção de corte. t1 = peça junto à cabeça, t2 = a outra (m).
   * a1, a2 = ângulos da força com a fibra em cada peça. Devolve { Rk, modo, modos }.
   */
  function madeiraMadeiraSimples(d, t1, t2, a1, a2, rhok, fu, k90t) {
    var f1 = fhAlfa(d, a1, rhok, k90t), f2 = fhAlfa(d, a2 == null ? Math.PI / 2 : a2, rhok, k90t), Dm = d * 1000, T1 = t1 * 1000, T2 = t2 * 1000, m = MyRk(d, fu), be = f2 / f1, r = T2 / T1;
    var modos = [
      ["Ia", f1 * T1 * Dm],
      ["Ib", f1 * T2 * Dm * be],
      ["Ic", f1 * T1 * Dm / (1 + be) * (Math.sqrt(be + 2 * be * be * (1 + r + r * r) + be * be * be * r * r) - be * (1 + r))],
      ["IIa", 1.05 * f1 * T1 * Dm / (2 + be) * (Math.sqrt(2 * be * (1 + be) + 4 * be * (2 + be) * m / (f1 * Dm * T1 * T1)) - be)],
      ["IIb", 1.05 * f1 * T2 * Dm / (1 + 2 * be) * (Math.sqrt(2 * be * be * (1 + be) + 4 * be * (1 + 2 * be) * m / (f1 * Dm * T2 * T2)) - be)],
      ["III", 1.15 * Math.sqrt(2 * be / (1 + be)) * Math.sqrt(2 * m * f1 * Dm)]];
    var pior = modos[0]; modos.forEach(function (x) { if (x[1] < pior[1]) pior = x; });
    return { Rk: pior[1] / 1000, modo: pior[0], modos: modos.map(function (x) { return [x[0], x[1] / 1000]; }) };
  }
  /** chapa de aço numa face, corte SIMPLES (7.3): fina (a)(b) = mín(0,4·fe·t·d ; 1,15·√(2·My·fe·d)); grossa (c)(d)(e); ts em m (omitido → fina). t = espessura da peça de madeira (m). kN por parafuso. Sem F_ax/4 */
  function chapaCorteSimples(d, t, a, rhok, fu, ts, k90t) {
    var f = fhAlfa(d, a, rhok, k90t), Dm = d * 1000, T = t * 1000, m = MyRk(d, fu);
    var fina = Math.min(0.4 * f * T * Dm, 1.15 * Math.sqrt(2 * m * f * Dm));
    var grossa = Math.min(f * T * Dm, f * T * Dm * (Math.sqrt(2 + 4 * m / (f * Dm * T * T)) - 1), 2.3 * Math.sqrt(m * f * Dm));
    return interpChapa(d, ts, fina, grossa) / 1000;
  }
  function chapaFinaCorteSimples(d, t, a, rhok, fu, k90t) { return chapaCorteSimples(d, t, a, rhok, fu, null, k90t); }       // compatibilidade (chapa fina)

  /* ---------------- rigidez do pino (7.1.12, Tabela 17) ---------------- */
  /** K_ser (N/mm = kN/m) de UMA seção de corte: ρ_med^1,5·d/23, ρ_med = 1,2·ρk (kg/m³; 7.1.12 e 6.2.5); madeira–aço: o dobro. d em m */
  function kserPino(d, rhok, madeiraAco) { var rm = 1.2 * rhok; return Math.pow(rm, 1.5) * (d * 1000) / 23 * (madeiraAco ? 2 : 1); }
  /** K_u = (2/3)·K_ser (7.1.12) */
  function kuPino(d, rhok, madeiraAco) { return 2 / 3 * kserPino(d, rhok, madeiraAco); }
  /** M2 (revisão R05): rigidez à rotação dos CHUMBADORES da placa de base: n chumbadores tracionados por lado, cada um com k = E·As/L_ef (kN/m), girando em torno da linha de compressão a z = lp − 100 mm (o mesmo braço da placa):
   *  Kθ,chumb = n·k·z² (kN·m/rad). L_ef adotado = 220 mm (placa + graute + trecho livre da barra roscada M20; embutimento "pela fundação" — ADOÇÃO declarada, informar `chumbLef`). */
  function kthetaChumbadores(o) {
    var As = o.As || 245e-6, E = o.E || 2e8, lef = o.lef || 0.22, k = E * As / lef, z = o.lp - 0.10;
    return { n: o.n, k_kN_m: k, z_m: z, lef_m: lef, As_m2: As, E_kN_m2: E, Ktheta: o.n * k * z * z };
  }
  /** molas em SÉRIE: 1/K = Σ 1/Kᵢ (ignora as nulas/infinitas) */
  function emSerie(Ks) { var inv = 0; Ks.forEach(function (k) { if (k && isFinite(k) && k > 0) inv += 1 / k; }); return inv > 0 ? 1 / inv : null; }
  /** soma dos r² (m²) de um grupo de nc colunas (±a) por nr linhas (passo a1) em torno do centro do grupo */
  function somaR2(nc, nr, a, a1) { var s = 0, i, j, x, z; for (i = 0; i < nc; i++) for (j = 0; j < nr; j++) { x = nc === 1 ? 0 : -a + 2 * a * i / (nc - 1); z = (j - (nr - 1) / 2) * a1; s += x * x + z * z; } return s; }

  /* ---------------- espaçamentos (NBR 7190-1:2022, 7.1.10, Tabela 14, p. 53 impr.) ---------------- */
  /**
   * a1, a2, a3,t, a3,c, a4,t, a4,c mínimos pelo ângulo α (rad) entre a força e a fibra (dobrado em 0..90°); d em m. tipo: "ajustado" (parafusos passantes, rosca soberba e ajustados; padrão) ou "liso" (pinos lisos).
   *   a1 = (4 + 3|cos α|)d (liso: (3 + 3|cos α|)d) · a2 = 4d (liso 3d) · a3,t = máx(7d; 80 mm) · a3,c (extremidade NÃO carregada, ângulo β = 180° − α): β < 150°: (1 + 6 sen β)d; 150°–210°: 4d
   *   · a4,t = máx((2 + 2 sen α)d; 3d) · a4,c = 3d.  (R05: antes a1 = (4 + |cos α|)d e a3,c = máx(a3,t·|sen α|; 3d), CONTRA a segurança.)
   * Na coluna "pinos lisos" o a3,c vem com colchetes truncados na cópia de consulta; para liso o motor usa o MESMO a3,c do ajustado (a favor).
   */
  function bordas(d, alfa, tipo) {
    var a = Math.abs(alfa) % Math.PI; if (a > Math.PI / 2) a = Math.PI - a;
    var s = Math.sin(a), c = Math.cos(a), liso = tipo === "liso", beta = Math.PI - a, a3t = Math.max(7 * d, 0.08), a3c;
    if (beta < 150 * Math.PI / 180 - 1e-12) a3c = (1 + 6 * Math.sin(beta)) * d; else a3c = 4 * d;
    return {
      a1: (liso ? 3 + 3 * c : 4 + 3 * c) * d, a2: (liso ? 3 : 4) * d, a3t: a3t, a3c: a3c,
      a4t: Math.max((2 + 2 * s) * d, 3 * d), a4c: 3 * d, tipo: liso ? "liso" : "ajustado",
      fonte: "NBR 7190-1:2022, 7.1.10, Tabela 14, p. 53 (impressa; PDF 65) — cópia de consulta, exemplarLicenciado:false; coluna " + (liso ? "pinos lisos" : "parafusos passantes, rosca soberba e ajustados") +
        ": a1 = (" + (liso ? "3" : "4") + " + 3|cosα|)·d; a2 = " + (liso ? "3" : "4") + "d; a3,t = máx(7d; 80 mm); a3,c = (1 + 6·senβ)·d (β < 150°) ou 4d; a4,t = máx((2 + 2·senα)·d; 3d); a4,c = 3d"
    };
  }

  /* ---------------- grupo de pinos ---------------- */
  /** nc colunas (a = semi-distância entre eixos externos), nr linhas (passo a1), esforços M (kN·m), N, H (kN) no centro do grupo */
  function grupoPinos(nc, nr, a, a1, M, N, H) {
    var pts = [], i, j;
    for (i = 0; i < nc; i++) for (j = 0; j < nr; j++) pts.push({ x: nc === 1 ? 0 : -a + 2 * a * i / (nc - 1), z: (j - (nr - 1) / 2) * a1 });
    var Ip = pts.reduce(function (s, p) { return s + p.x * p.x + p.z * p.z; }, 0), n = pts.length, pior = { F: 0, alfa: 0 }, pinos = [];
    pts.forEach(function (p) {
      var fz = N / n + (Ip ? M * p.x / Ip : 0), fx = H / n - (Ip ? M * p.z / Ip : 0);
      var F = Math.sqrt(fx * fx + fz * fz), alfa = Math.atan2(Math.abs(fx), Math.abs(fz));
      pinos.push({ x: p.x, z: p.z, F: F, alfa: alfa });
      if (F > pior.F) pior = { F: F, alfa: alfa };
    });
    return { F: pior.F, alfa: pior.alfa, n: n, pinos: pinos };
  }
  /** n_ef: fator em 0° = min(1; n^-0,1·(a1/13d)^0,25); em 90° = 1; interpolado linearmente pelo ângulo (revisão A3) */
  function nefFator(n, a1, d) { return Math.min(1, Math.pow(n, -0.1) * Math.pow(a1 / (13 * d), 0.25)); }

  /** A4 (revisão R05): a Tabela 14 vale pelo ângulo α de CADA pino — sob momento o pino de canto tem força quase ⊥ à fibra e os das linhas centrais quase ∥. a1 do grupo = máx. de (4 + 3|cos α_i|)d sobre os pinos com força. */
  function a1PorPino(g, d, tipo) {
    var lista = g.pinos.filter(function (p) { return p.F > 1e-9; }).map(function (p) { return { x: p.x, z: p.z, F: p.F, alfa_graus: p.alfa * 180 / Math.PI, a1: bordas(d, p.alfa, tipo).a1 }; });
    if (!lista.length) lista = [{ x: 0, z: 0, F: g.F, alfa_graus: g.alfa * 180 / Math.PI, a1: bordas(d, g.alfa, tipo).a1 }];
    var mx = lista.reduce(function (m, p) { return Math.max(m, p.a1); }, 0);
    return { max: mx, pinos: lista };
  }
  function a1PinoAPino(g, d, tipo) { return a1PorPino(g, d, tipo).max; }
  /**
   * Dimensiona (cresce o nº de linhas) o grupo de pinos.
   * o = { nome, cap: function(alfa) → kN por pino (2 planos) , nc, a, d, M, N, H, nrMax, kmod, gLig, a1 (mínimo; padrão 5d), tMadeira (m: menor espessura de madeira atravessada; 7.2: d ≤ t/2), pinoTipo }
   * R05: o passo a1 entre linhas nunca fica abaixo do mínimo da Tabela 14 para o ÂNGULO do pino mais carregado — a1 = máx(a1 pedido; (4 + 3|cos α|)d) —, refeito o momento polar; n < 2 recusado (7.1.1).
   */
  function dimGrupo(o) {
    var c = cfg(o), d = o.d, a1base = o.a1 || 5 * d, nrMax = o.nrMax || 20, nr, g, f0, fat, Rd, a1, k, req;
    if (o.nc < 1) return { nome: o.nome, ok: false, eta: Infinity, d: d, nc: o.nc, passos: [o.nome + ": ligação com menos de 2 pinos é proibida (NBR 7190-1:2022, 7.1.1, p. 48)."] };
    if (o.tMadeira != null && d > o.tMadeira / 2 + 1e-9) {
      var etaD = d / (o.tMadeira / 2);
      return { nome: o.nome, ok: false, eta: etaD, d: d, nc: o.nc, nr: 0, n: 0, comprimento: 0, diametro: { d_mm: d * 1000, t_mm: o.tMadeira * 1000, eta: etaD },
        passos: [o.nome + ": RECUSADA — d = " + br(d * 1000, 0) + " mm > t/2 = " + br(o.tMadeira * 500, 1) + " mm (menor espessura de madeira " + br(o.tMadeira * 1000, 0) + " mm; NBR 7190-1:2022, 7.2 (a), p. 56): usar pino menor ou peça mais espessa."] };
    }
    for (nr = Math.max(2, o.nrMin || 2); nr <= nrMax; nr++) {
      a1 = a1base; g = grupoPinos(o.nc, nr, o.a, a1, o.Mfun ? o.Mfun(nr, a1) : o.M, o.N, o.H);
      for (k = 0; k < 6; k++) {
        req = a1PinoAPino(g, d, c.pinoTipo);
        if (a1 >= req - 1e-9) break;
        a1 = req; g = grupoPinos(o.nc, nr, o.a, a1, o.Mfun ? o.Mfun(nr, a1) : o.M, o.N, o.H);
      }
      f0 = nefFator(nr, a1, d); fat = f0 + (1 - f0) * g.alfa / (Math.PI / 2);
      Rd = o.cap(g.alfa) * c.kmod / c.gLig * fat;
      if (g.F <= Rd) {
        var bd = bordas(d, g.alfa, c.pinoTipo), a3 = Math.max(bd.a3t, bd.a3c), eta = g.F / Rd, a1pino = a1PorPino(g, d, c.pinoTipo);
        g.pinos.forEach(function (pp) { if (pp.F > 1e-9) a3 = Math.max(a3, bordas(d, pp.alfa, c.pinoTipo).a3c); });          // A4: a3,c também pelo ângulo de CADA pino
        return { nome: o.nome, ok: true, d: d, nc: o.nc, nr: nr, n: g.n, a1: a1, a3: a3, comprimento: (nr - 1) * a1 + 2 * a3, Fmax: g.F, Rd: Rd, eta: eta, alfa: g.alfa, nef: fat, a1min: Math.max(bd.a1, a1pino.max), a1PorPino: a1pino, espacamentos: bd, centroGrupo: { nc: o.nc, a: o.a },
          passos: [o.nome + ": " + o.nc + " colunas × " + nr + " linhas = " + g.n + " pinos Ø" + br(d * 1000, 0) + " (a1 = " + br(a1 * 1000, 0) + " mm ≥ máx. dos pinos de (4 + 3|cosα|)d = " + br(a1pino.max * 1000, 0) + " mm [pino mais carregado: " + br(bd.a1 * 1000, 0) + " mm; cada pino pelo seu ângulo], a3 = " + br(a3 * 1000, 0) + " mm; Tab. 14, p. 53 impr.).",
            "Pino mais carregado: F = " + br(g.F) + " kN a " + br(g.alfa * 180 / Math.PI, 0) + "° da fibra (momento polar + N + H).",
            "Rd = Rk·kmod/γ·n_ef = " + br(o.cap(g.alfa)) + " × " + br(c.kmod, 2) + " / " + br(c.gLig, 1) + " × " + br(fat, 3) + " = " + br(Rd) + " kN → η = " + br(eta, 3) + "."] };
      }
    }
    return { nome: o.nome, ok: false, eta: Infinity, d: d, nc: o.nc, nrMax: nrMax, passos: [o.nome + ": SEM SOLUÇÃO até " + nrMax + " linhas."] };
  }

  /* ---------------- aço ---------------- */
  /** chapa fletida no plano: Mpl,Rd = t·h²/4·fy/γa1 (kN·m); t e hp em m, fy em MPa */
  function chapaMpl(o) {
    var c = cfg(o), Mpl = o.t * o.hp * o.hp / 4 * c.fy * 1e3 / c.gamaA1, eta = o.M / Mpl;
    return { Mpl_Rd: Mpl, eta: eta, ok: eta <= 1 + 1e-9, t_mm: Math.round(o.t * 1000), largura_mm: Math.round(o.hp * 1000),
      passos: ["Chapa " + br(o.t * 1000, 0) + " mm × " + br(o.hp * 1000, 0) + " mm: Mpl,Rd = t·h²/4·fy/γa1 = " + br(Mpl) + " kN·m ≥ M = " + br(o.M) + " kN·m → η = " + br(eta, 3) + " (NBR 8800 / EN 1993)."] };
  }
  /** resistência de cálculo à tração de um chumbador roscado (kN): 0,9·fu·As/γ2 */
  function chumbadorFtRd(fu, As, gama) { return 0.9 * fu * As / (gama || 1.25) / 1000; }
  /** resistência de cálculo ao CORTE de um chumbador roscado, rosca no plano de corte (NBR 8800:2008 6.3.3.2): 0,4·Ab·fub/γa2 (kN); Ab = área bruta (mm²), γa2 = 1,35 */
  function chumbadorFvRd(fu, Ab, gama) { return 0.4 * Ab * fu / (gama || 1.35) / 1000; }
  /**
   * PLACA DE BASE (M12) — chumbadores (tração + cortante), flexão da placa e solda chapa–placa. Esforços REAIS de cálculo (N3), em kN, kN·m e m.
   * o = { lp (lado da placa), M, Ntracao, Ncompressao, H, FtRd, FvRd, chumbExtra (nº fixo a mais, garfo), espessura_mm (mínima, 25), tChapa, hpChapa (comprimento da chapa soldada), nChapas, MchapaSolda,
   *       fy, gamaA1, fw, gamaW, mwMin_mm, fck }
   * CHUMBADORES: tração por lado = M/z + N/2 (z = lp − 100 mm); cortante H dividido por TODOS os chumbadores (sem atrito nem chaveta); interação LINEAR
   *   Ft,Sd/Ft,Rd + Fv,Sd/Fv,Rd ≤ 1 (mais conservadora que a elíptica da NBR 8800 6.3.3.4 e que a da EN 1993-1-8 Tab. 3.4 — fonte secundária, adotada por segurança).
   * FLEXÃO DA PLACA: faixa em balanço a partir da face da chapa vertical (tração: m = z/2 − tChapa/2, largura b_ef = mín(2m; lp/nº por lado), força = tração por chumbador;
   *   compressão: tensão elástica linear, σ0 = N/lp² na face da chapa e σmáx = N/lp² + 6M/lp³ na borda, no balanço lp/2 − tChapa/2, por metro); resistência plástica Z·fy/γa1 (NBR 8800:2008 5.4: Mpl = Z·fy, γa1 = 1,10). Espessura sobe 25 → 32 → 38 → 50 mm.
   * SOLDA (filete de 2 lados, comprimento hpChapa): f_d = 0,6·fw/γw (NBR 8800:2008 6.2.5; fw = 415 MPa adotado — o menor, eletrodo E60; E70 = 485 —, γw = 1,35 conservador);
   *   tensão = √[(M/Sw + N/Aw)² + (H/Aw)²] com a garganta 0,707·perna; M inteiro numa chapa (conservador), N e H em 2 chapas; perna 6 → 8 → 10 → 12 mm.
   */
  /** N9: solda de penetração total entre a chapa e a placa traciona a placa na espessura → risco de arrancamento lamelar (EN 1993-1-10 / EN 10164) */
  var NOTA_ACO_Z = "Aço da placa de base com qualidade Z (EN 10164) — placa de 25 mm ou mais com solda de penetração total: a solda traciona a placa na espessura (arrancamento lamelar); a classe Z (EN 10164) fica a definir com o responsável técnico.";
  function placaBase(o) {
    var c = cfg(o), Ft = o.FtRd, Fv = o.FvRd || chumbadorFvRd(700, 314.16), lp = o.lp, z = lp - 0.10, Tlado = o.M / z + o.Ntracao / 2, Tpos = Math.max(Tlado, 0), H = o.H || 0, extra = o.chumbExtra || 0;
    var n, nCh = Math.max(2, Math.ceil(Tpos / Ft)), total, Tb, Vb, etaC = 0;
    for (n = nCh; n <= 12; n++) { total = 2 * n + extra; Tb = Tpos / n; Vb = H / total; etaC = Tb / Ft + Vb / Fv; nCh = n; if (etaC <= 1) break; }
    total = 2 * nCh + extra; Tb = Tpos / nCh; Vb = H / total;
    var tCh = o.tChapa || 0.016, m = z / 2 - tCh / 2, bef = Math.min(2 * m, lp / nCh), mc = lp / 2 - tCh / 2;
    /* N7 (R05): COMPRESSÃO coerente com o lado tracionado. Sem levantamento (e = M/N ≤ lp/6) vale a tensão elástica linear (σ0 = N/A na face da chapa, σmáx = N/A + 6M/lp³ na borda). Com levantamento (e > lp/6, ou só momento/tração),
       a placa apoia num BLOCO de compressão na borda (largura `blocoMm`, padrão 50 mm, tensão uniforme) e o equilíbrio fecha com o MESMO braço z do lado tracionado: C = T + N, T = M/z − Nc/2 → C = M/z + Nc/2 (caso com compressão); C = M/z − Nt/2 (caso com tração).
       A pressão enviada à fundação é o pico real (C/(bloco·lp)); o braço z é mantido (a favor no lado tracionado); bloco fixo de 50 mm é ADOÇÃO conservadora declarada. */
    var Nc0 = o.Ncompressao || 0, Nt0 = o.Ntracao || 0, M0 = o.M || 0, wb = o.blocoMm != null ? o.blocoMm / 1000 : 0.05, eLev = Nc0 > 0 ? M0 / Nc0 : Infinity;
    var elast = Nc0 > 0 && eLev <= lp / 6 + 1e-12, sig0 = 0, sig, McPm, modoC, Cbloco = 0;
    function blocoC(C) { return { sig: C / (wb * lp), Mc: C / lp * (mc - wb / 2) }; }
    if (elast) { sig0 = Nc0 / (lp * lp); sig = sig0 + 6 * M0 / (lp * lp * lp); McPm = sig0 * mc * mc / 2 + (sig - sig0) * mc * mc / 3; modoC = "elastico"; }
    else { Cbloco = M0 / z + Nc0 / 2; var bc = blocoC(Cbloco); sig = bc.sig; McPm = bc.Mc; modoC = "bloco"; }
    if (Nt0 > 0 || (elast && Nt0 > 0)) { var C2 = Math.max(M0 / z - Nt0 / 2, 0), b2 = blocoC(C2); if (b2.Mc > McPm) { McPm = b2.Mc; modoC = modoC + "+bloco-tracao"; } if (b2.sig > sig) { sig = b2.sig; Cbloco = Math.max(Cbloco, C2); } }
    var esp = [25, 32, 38, 50].filter(function (e) { return e >= (o.espessura_mm || 25); }), flex = null, i;
    for (i = 0; i < esp.length; i++) {
      var t = esp[i] / 1000, MRdt = bef * t * t / 4 * c.fy * 1e3 / c.gamaA1, MRdc = t * t / 4 * c.fy * 1e3 / c.gamaA1;
      flex = { espessura_mm: esp[i], M_tracao: Tb * m, MRd_tracao: MRdt, eta_tracao: Tb * m / MRdt, M_compressao_por_m: McPm, MRd_compressao_por_m: MRdc, eta_compressao: McPm / MRdc, modo_compressao: modoC, C_bloco_kN: Cbloco, bloco_mm: wb * 1000, m_mm: m * 1000, bef_mm: bef * 1000, sigma_c_kPa: sig };
      flex.eta = Math.max(flex.eta_tracao, flex.eta_compressao); flex.ok = flex.eta <= 1 + 1e-9;
      if (flex.ok) break;
    }
    var hp = o.hpChapa || (lp - 0.10), nC = o.nChapas || 2, Mw = o.MchapaSolda != null ? o.MchapaSolda : o.M, fw = o.fw || 415, gW = o.gamaW || 1.35, fd = 0.6 * fw / gW * 1e3, solda = null, N = Math.max(o.Ntracao || 0, o.Ncompressao || 0), mws = [6, 8, 10, 12].filter(function (v) { return v >= (o.mwMin_mm || 6); });
    for (i = 0; i < mws.length; i++) {
      var a = 0.707 * mws[i] / 1000, Aw1 = 2 * a * hp, Sw = 2 * a * hp * hp / 6, sM = Mw / Sw, sN = N / (nC * Aw1), sH = H / (nC * Aw1), sd = Math.sqrt(Math.pow(sM + sN, 2) + sH * sH);
      solda = { mw_mm: mws[i], fw: fw, gamaW: gW, fd_kPa: fd, tensao_kPa: sd, eta: sd / fd, ok: sd / fd <= 1 + 1e-9, hp_mm: hp * 1000, nChapas: nC };
      if (solda.ok) break;
    }
    if (!solda.ok) {                                                                // filete de 12 mm não basta → solda de PENETRAÇÃO TOTAL (resistência = a do metal-base da chapa; soma linear de M, N e H, conservadora)
      var fyd = c.fy * 1e3 / c.gamaA1, MplC = tCh * hp * hp / 4 * fyd, etaP = Mw / MplC + N / (nC * tCh * hp * fyd) + H / (nC * 0.6 * tCh * hp * fyd);
      solda = { tipo: "penetracao-total", mw_mm: null, fw: fw, eta: etaP, ok: etaP <= 1 + 1e-9, hp_mm: hp * 1000, nChapas: nC, nota: "filete de 12 mm reprovou (η = " + br(solda.eta, 2) + "); exige solda de PENETRAÇÃO TOTAL com controle e soldador qualificado (NBR 8800 6.2.5: resistência do metal-base)" };
    }
    var eta = Math.max(etaC, flex.eta, solda.eta), ok = etaC <= 1 + 1e-9 && flex.ok && solda.ok;
    return { dimensoes_mm: [Math.round(lp * 1000), Math.round(lp * 1000)], espessura_mm: flex.espessura_mm, Tlado_d: Tlado, porLado: nCh, Ft_Rd: Ft, Fv_Rd: Fv, total: total, flexao: flex, solda: solda,
      chumbadoresVerif: { tracao_por_chumbador: Tb, cortante_por_chumbador: Vb, eta_tracao: Tb / Ft, eta_cortante: Vb / Fv, eta: etaC, ok: etaC <= 1 + 1e-9 },
      eta: eta, ok: ok, pressao_max_kPa: sig,
      notaAcoZ: (flex.espessura_mm >= 25 && solda.tipo === "penetracao-total") ? NOTA_ACO_Z : null,
      verificacoes: [{ nome: "chumbadores", eta: etaC, ok: etaC <= 1 + 1e-9 }, { nome: "placa-flexao", eta: flex.eta, ok: flex.ok }, { nome: "placa-solda", eta: solda.eta, ok: solda.ok }],
      fonte: "NBR 8800:2008 (5.4 flexão, 6.2.5 solda de filete, 6.3.3 parafusos/chumbadores) e EN 1993-1-8 — fonte secundária, conferir no PDF; lever arm, largura efetiva e distribuição de tensões são ADOÇÕES conservadoras declaradas acima",
      passos: ["Placa " + br(lp * 1000, 0) + " mm; braço z = lp − 100 mm = " + br(z * 1000, 0) + " mm; tração por lado = M/z + N/2 = " + br(Tlado) + " kN; " + nCh + " chumbadores por lado (" + total + " no total): tração " + br(Tb) + " kN/Ft,Rd " + br(Ft) + " kN + cortante " + br(Vb) + " kN/Fv,Rd " + br(Fv) + " kN → η = " + br(etaC, 3) + " (interação linear).",
        "Flexão da placa " + flex.espessura_mm + " mm: tração M = " + br(flex.M_tracao) + " kN·m (m = " + br(m * 1000, 0) + " mm, b_ef = " + br(bef * 1000, 0) + " mm) ≤ " + br(flex.MRd_tracao) + " → η = " + br(flex.eta_tracao, 3) + "; compressão (" + (modoC.indexOf("bloco") >= 0 ? "bloco de " + br(wb * 1000, 0) + " mm, C = " + br(Cbloco) + " kN" : "tensão elástica") + ", pico " + br(sig, 0) + " kPa) η = " + br(flex.eta_compressao, 3) + ".",
        solda.tipo === "penetracao-total" ? "Solda chapa–placa: filete reprovou → PENETRAÇÃO TOTAL, η = " + br(solda.eta, 3) + " (resistência do metal-base da chapa)." : "Solda chapa–placa: filete " + solda.mw_mm + " mm (garganta " + br(0.707 * solda.mw_mm, 1) + " mm), tensão " + br(solda.tensao_kPa / 1000, 1) + " MPa ≤ 0,6·fw/γw = " + br(fd / 1000, 1) + " MPa → η = " + br(solda.eta, 3) + "."] };
  }

  /* ---------------- parafuso de rosca total ---------------- */
  /**
   * Rax,d de parafuso de rosca total com o lef de CADA LADO da junta: Rax,k ∝ menor lef (a rosca que ancora é a do lado mais curto).
   * o = { Rk_ref (kN), lefRef (mm), lefA, lefB (mm), kmod, gama }
   */
  function roscaRaxd(o) {
    var c = cfg(o), lef = Math.min(o.lefA == null ? o.lefRef : o.lefA, o.lefB == null ? o.lefRef : o.lefB), Rk = o.Rk_ref * lef / o.lefRef;
    return { lef: lef, Rk: Rk, Rd: Rk * c.kmod / (o.gama || c.gamaRax) };
  }
  /** força axial por parafuso inclinado de θ da direção da força: F/(n·cosθ); η = F_axial/Rax,d */
  function roscaInclinada(o) {
    var th = (o.anguloGraus == null ? 45 : o.anguloGraus) * Math.PI / 180, ax = o.F / (o.n * Math.cos(th)), eta = ax / o.Rax_d;
    return { axial: ax, eta: eta, ok: eta <= 1 + 1e-9, passos: ["Axial por parafuso = F/(n·cosθ) = " + br(o.F) + "/(" + o.n + "·" + br(Math.cos(th), 3) + ") = " + br(ax) + " kN ≤ Rax,d = " + br(o.Rax_d) + " kN → η = " + br(eta, 3) + "."] };
  }
  /** REFORÇO à tração normal: Ft,90 = (1 − 3α² + 2α³)·F, α = he/h; parafusos = máx(mínimo, ⌈Ft,90/Rax,d⌉) */
  function reforcoTracaoNormal(o) {
    var al = o.he_h, Ft90 = (1 - 3 * al * al + 2 * Math.pow(al, 3)) * o.F, nCalc = Math.ceil(Ft90 / o.Rax_d), n = Math.max(o.minimo || 2, nCalc);
    return { parafusos: n, he_h: al, Ft90_d: Ft90, Rax_d: o.Rax_d, eta: Ft90 / (n * o.Rax_d), ok: n * o.Rax_d >= Ft90 - 1e-9,
      passos: ["Ft,90 = (1 − 3α² + 2α³)·F com α = he/h = " + br(al, 2) + ": " + br(Ft90) + " kN; Rax,d = " + br(o.Rax_d) + " kN → " + nCalc + " parafusos" + (n > nCalc ? " (mínimo adotado " + n + ")" : "") + "."] };
  }

  /* ---------------- verga → V (C3, A8) ---------------- */
  /* (a chapa em corte simples está em chapaCorteSimples, acima) */
  /** F90,Rk (NBR 7190-1:2022, 7.1.1, p. 48 impr. — mesma forma da EN 1995-1-1 8.1.4, eq. 8.4): fendilhamento de peça carregada ⊥ à fibra por conectores a `he` da borda carregada. b, he, h em m → kN */
  function fendilhamentoF90Rk(b, he, h) { var hh = Math.min(he, 0.95 * h); return 14 * b * 1000 * Math.sqrt(hh * 1000 / (1 - hh / h)) / 1000; }
  /**
   * Verga → V: UMA chapa em T numa face da V, n parafusos Ø16 passantes em CORTE SIMPLES. Vy é ∥ à fibra da V (α = 0), Vz é ⊥ (α = 90°) e a resultante tem o ângulo real;
   * N (axial da verga, ⊥ à face da V) é a tração AXIAL dos parafusos (arruela 3d: Fax,Rk = mín(0,9·fu·As ; 3·fc90,k·Aw) — fator 3 da EN 8.5.2, fonte secundária, conferir);
   * interação LINEAR (η = η_corte + η_axial), conservadora. Fendilhamento F90 com Vz e he = menor distância do parafuso a uma borda da V.
   * o = { Vy, Vz, N, Vb, hV, zPino (altura do eixo do parafuso sobre a face de baixo da V), d, fc90k, cfg, nMax, arruela: {lado, fator} }
   */
  function vergaNaV(o) {
    var c = cfg(o.cfg), d = o.d || c.d, nMax = o.nMax || 14, Vy = Math.abs(o.Vy || 0), Vz = Math.abs(o.Vz || 0), N = Math.abs(o.N || 0), n, out = null;
    var alfa = Math.atan2(Vz, Vy), tCh = o.tChapa != null ? o.tChapa : 0.008, a1 = Math.max(5 * d, bordas(d, alfa, c.pinoTipo).a1);          // R05: a1 ≥ (4 + 3|cos α|)d (Tab. 14), nunca 5d fixo
    var Rk = chapaCorteSimples(d, o.Vb, alfa, c.rhok, c.fu, tCh, c.k90Tipo);
    if (d > o.Vb / 2 + 1e-9) return { n: 0, eta: d / (o.Vb / 2), eta_corte: Infinity, eta_axial: 0, eta_F90: 0, ok: false, avisos: [], diametro: { d_mm: d * 1000, t_mm: o.Vb * 1000 },
      passos: ["Verga → V: RECUSADA — d = " + br(d * 1000, 0) + " mm > t/2 = " + br(o.Vb * 500, 1) + " mm da V (NBR 7190-1:2022, 7.2 (a), p. 56)."] };
    var lado = (o.arruela && o.arruela.lado) || 3 * d, fat3 = (o.arruela && o.arruela.fator != null) ? o.arruela.fator : 3, Dm = d * 1000;
    var Aw = Math.pow(lado * 1000, 2) - Math.PI * Math.pow(Dm + 1, 2) / 4, As = Math.PI * Dm * Dm / 4 * 0.78;                  // mm² (arruela quadrada; As da rosca ≈ 0,78·A)
    var FaxK = Math.min(0.9 * c.fu * As / 1000, fat3 * (o.fc90k || 2.5) * Aw / 1000), FaxD = Math.min(0.9 * c.fu * As / 1000 / c.gamaFtAco, FaxK * c.kmod / c.gLig);
    /* N2: o fendilhamento (F90) NÃO depende do nº de parafusos — crescer n não o resolve. Se η_F90 > 1, troca de MODO: (1) afastamento: subir a fila de parafusos (he maior) até o limite
       `o.zMax` informado (sem limite informado, não sobe); (2) reforço: parafusos de rosca total ⊥ à fibra da V recebendo Ft,90 = (1 − 3α² + 2α³)·Vz (mesma forma do reforço do topo do pilar),
       se `o.RaxReforco` (kN, Rax,d de um parafuso de rosca total) vier; (3) recusa, com mensagem. */
    var zP = o.zPino, he = Math.min(zP, o.hV - zP), F90k = fendilhamentoF90Rk(o.Vb, he, o.hV), F90d = F90k * c.kmod / c.gLig, eta90 = Vz / F90d, modoF90 = "direto", reforcoF90 = null, avisosV = [];
    if (eta90 > 1 && o.zMax != null && o.zMax > zP) {
      for (var zt = zP; zt <= Math.min(o.zMax, o.hV / 2) + 1e-9; zt += 0.01) {
        he = Math.min(zt, o.hV - zt); F90k = fendilhamentoF90Rk(o.Vb, he, o.hV); F90d = F90k * c.kmod / c.gLig; eta90 = Vz / F90d; zP = zt;
        if (eta90 <= 1) { modoF90 = "afastamento"; avisosV.push("N2: fendilhamento da V (EN 8.1.4) reprovou com a fila a " + br(o.zPino * 1000, 0) + " mm da face de baixo; fila subida para " + br(zt * 1000, 0) + " mm (he = " + br(he * 1000, 0) + " mm) — a chapa em T precisa de aba mais alta."); break; }
      }
    }
    if (eta90 > 1 && modoF90 === "direto") {
      var alR = Math.min(0.95, he / o.hV), Ft90R = (1 - 3 * alR * alR + 2 * Math.pow(alR, 3)) * Vz;
      if (o.RaxReforco > 0 && Math.ceil(Ft90R / o.RaxReforco) <= 12) {
        var nR = Math.max(2, Math.ceil(Ft90R / o.RaxReforco)); modoF90 = "reforco"; reforcoF90 = { parafusos: nR, Ft90_d: Ft90R, he_h: alR, Rax_d: o.RaxReforco, eta: Ft90R / (nR * o.RaxReforco) };
        avisosV.push("N2: fendilhamento da V (EN 8.1.4) reprova (η = " + br(eta90, 2) + ") e não melhora com mais parafusos — adotado REFORÇO: " + nR + " parafusos de rosca total ⊥ à fibra da V, Ft,90 = " + br(Ft90R) + " kN (he/h = " + br(alR, 2) + ").");
        eta90 = reforcoF90.eta;
      } else {
        modoF90 = "recusa";
        avisosV.push("N2: fendilhamento da V (EN 8.1.4) reprova (η = " + br(eta90, 2) + ") e não melhora com mais parafusos: SOLUÇÃO RECUSADA — subir a fila de parafusos (informar zMax), pôr reforço de rosca total ⊥ à fibra da V (informar RaxReforco) ou aumentar a largura da verga/da V.");
      }
    }
    for (n = 2; n <= nMax; n++) {
      var F = Math.sqrt(Vy * Vy + Vz * Vz) / n, f0 = nefFator(n, a1, d), fat = f0 + (1 - f0) * alfa / (Math.PI / 2), Rd = Rk * c.kmod / c.gLig * fat;
      var eV = F / Rd, eA = N / n / FaxD, eta = eV + eA;
      out = { n: n, a1: a1, a2: bordas(d, alfa, c.pinoTipo).a2, a1min: bordas(d, alfa, c.pinoTipo).a1, tChapa_mm: tCh * 1000, classeChapa: classeChapa(d, tCh), eta: Math.max(eta, eta90), eta_corte: eV, eta_axial: eA, eta_F90: eta90, Rk: Rk, Rd: Rd, FaxD: FaxD, F90d: F90d, he: he, zPino: zP, alfa: alfa, nef: fat, modoF90: modoF90, reforcoF90: reforcoF90, avisos: avisosV, ok: eta <= 1 && eta90 <= 1 };
      if (eta <= 1) break;                                              // N2: n cresce só para o corte + tração; o F90 já foi resolvido (ou recusado) acima
    }
    out.ok = out.eta_corte + out.eta_axial <= 1 && eta90 <= 1;
    out.passos = ["Verga → V: chapa em T inox numa face da V; " + out.n + " parafusos passantes Ø" + br(d * 1000, 0) + " em corte SIMPLES (NBR 7190-1:2022, 7.3 (a)(b), p. 63 impr.; chapa " + classeChapa(d, tCh) + "): Rk = mín(0,4·fh·t·d ; 1,15·√(2·My·fh·d)) = " + br(Rk) + " kN a " + br(alfa * 180 / Math.PI, 0) + "° da fibra da V (Vy ∥ " + br(Vy) + " kN, Vz ⊥ " + br(Vz) + " kN).",
      "Corte: F = " + br(Math.sqrt(Vy * Vy + Vz * Vz) / out.n) + " kN/parafuso ≤ Rd = Rk·kmod/γ·n_ef = " + br(out.Rd) + " kN → η = " + br(out.eta_corte, 3) + ". Tração axial (N = " + br(N) + " kN) com arruela " + br(lado * 1000, 0) + " mm: Fax,Rd = " + br(FaxD) + " kN → η = " + br(out.eta_axial, 3) + " (interação linear: " + br(out.eta_corte + out.eta_axial, 3) + ").",
      "Fendilhamento (EN 8.1.4): F90,Rk = 14·b·√(he/(1 − he/h)) com he = " + br(he * 1000, 0) + " mm, h = " + br(o.hV * 1000, 0) + " mm → F90,Rd = " + br(F90d) + " kN; Vz = " + br(Vz) + " kN → η = " + br(eta90, 3) + (modoF90 === "reforco" ? " (com reforço de rosca total)" : modoF90 === "afastamento" ? " (fila subida)" : modoF90 === "recusa" ? " — RECUSADO" : "") + "."].concat(avisosV);
    return out;
  }

  /** α_n (6.2.4, Tabela 6, p. 17 impr.) pela extensão a' (cm) da carga ∥ às fibras: 1→2,00; 2→1,70; 3→1,55; 4→1,40; 5→1,30; 7,5→1,15; 10→1,10; ≥15→1,00 (interpolação linear) */
  function alfaN(aCm) {
    var T = [[1, 2.0], [2, 1.7], [3, 1.55], [4, 1.4], [5, 1.3], [7.5, 1.15], [10, 1.1], [15, 1.0]], i;
    if (aCm >= 15) return 1; if (aCm <= 1) return 2;
    for (i = 1; i < T.length; i++) if (aCm <= T[i][0]) return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * (aCm - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
    return 1;
  }
  /**
   * N6 — RIGIDEZ À ROTAÇÃO DA BASE pela ligação DIMENSIONADA: Kθ = Σ K_u·r² (kN·m/rad), K_u = (2/3)·K_ser (7.1.12, Tab. 17), K_ser = (1,2·ρk)^1,5·d/23 por seção de corte, ×2 madeira–aço, × 2 planos de corte.
   * Cruz: um plano de chapa resiste ao momento do seu plano (as duas chapas são iguais). Garfo: mín(momento no plano da peça: 2 peças × Σr²; binário entre as peças: n·K_u·braço²/2).
   * Só o escorregamento dos pinos conta (placa, chumbadores e fundação são tomados como rígidos — DECLARADO: rigidez por cima da real; o aviso N6 diz). Devolve { Ktheta (ou null), ... }.
   */
  function rigidezBase(L, P, Vb, D, c, garfo, serie) {
    var Ku = 2 * kuPino(D, c.rhok, true), dir = {}, K = null, nota;
    if (!garfo) {
      if (L.base && L.base.ok && L.base.nr) { var sr = somaR2(L.base.nc, L.base.nr, L.base.centroGrupo.a, L.base.a1); dir.cruz = Ku * sr; K = dir.cruz; nota = "cruz: Kθ = Ku·Σr² de UMA chapa (n = " + L.base.n + " pinos, Σr² = " + br(sr, 3) + " m²), igual nas duas direções"; L.base.somaR2 = sr; }
    } else {
      var c1 = L.base && L.base.casos && L.base.casos[0], c2 = L.base && L.base.casos && L.base.casos[1], braco = Vb + P.b;
      if (c1 && c1.ok && c2 && c2.ok) {
        var sr2 = somaR2(c2.nc, c2.nr, c2.centroGrupo.a, c2.a1); dir.plano = 2 * Ku * sr2; dir.binario = c1.n * Ku * braco * braco / 2; K = Math.min(dir.plano, dir.binario);
        nota = "garfo: mín(plano da peça = 2·Ku·Σr² = " + br(dir.plano, 0) + "; binário entre as peças = n·Ku·braço²/2 = " + br(dir.binario, 0) + ") kN·m/rad";
      }
    }
    serie = serie || {};
    var Kp = K, Kch = serie.Kch ? serie.Kch.Ktheta : null, Kfu = serie.Kfund || null;
    if (Kp != null) K = emSerie([Kp, Kch, Kfu]);
    return { Ktheta: K, KthetaPinos: Kp, KthetaChumbadores: Kch, KthetaFundacao: Kfu, semFundacao: !Kfu, chumbadores: serie.Kch || null, Kser_pino_kN_m: 2 * kserPino(D, c.rhok, true), Ku_pino_kN_m: Ku, direcoes: dir, nota: (nota || "base sem solução: Kθ indisponível") + (Kp != null && Kch ? "; em série com os chumbadores (Kθ,chumb = n·E·As/L_ef·z² = " + br(Kch, 0) + ") → Kθ = " + br(K, 0) : ""), fonte: NORMA.kser,
      declarado: "M2: Kθ = pinos (escorregamento, K_ser da 7190-1, 7.1.12) EM SÉRIE com os chumbadores (deformação axial, L_ef adotado " + br((Kch ? serie.Kch.lef_m : 0.22) * 1000, 0) + " mm)" + (Kfu ? " e com a fundação informada (" + br(Kfu, 0) + " kN·m/rad)" : "; NÃO inclui a flexão da placa nem a fundação (rígidas) — Kθ SEM A FUNDAÇÃO, por cima da real: informar `KthetaFundacao` (kN·m/rad)") + "." };
  }

  /* ---------------- pacote da tipologia T1 ---------------- */
  /**
   * i = { secoes {T, V, VG, P}, reacoes {no: {Nmax, Nmin, Hmax, Mmax}}, lig {tercaV, pilarTopo, escora, bloqueador, verga {Vmax, Vy, Vz, Nmax}, pendural}, fitaNmax,
   *       cfg {kmod, rhok, ...}, parafuso: "WT-T-8,2",
   *       OPCIONAIS (revisão E1; sem eles valem os padrões antigos): fitaNeq (esforço equivalente da fita p/ os parafusos), fc90k (MPa, apoio ⊥ da V), hV (altura da V sobre o pilar, m),
   *       hVmin, hT (m — lef das rosca-total pela geometria), dims {escora {modelo, fonte}, travessa, pendural}, fitaRk (kN/parafuso da fita), arruela {lado, fator} }
   * N3: `reacoesReais`/`ligReal` (opcionais) = esforços REAIS de cálculo, usados no aço (chapa, placa, chumbadores) e em reacoesParaFundacao; `reacoes`/`lig` ficam equivalentes (madeira/pinos).
   * C2: `lig`/`reacoes` devem vir como ESFORÇO EQUIVALENTE (F·kmodRef/kmod da combinação — maddimensionar2.pacoteLigacoes) e cfg.kmod = kmodRef; rhok = da classe escolhida.
   * P.forma: "quadrado"/"circular" → base em CRUZ (chapa em T/cruz, pinos Ø16 inox ocultos); "duplo" → base em GARFO (chapas externas).
   */
  function pacoteT1(i) {
    var c = cfg(i.cfg), D = c.d, P = i.secoes.P, Vb = i.secoes.V.b, WT = PARAFUSOS[i.parafuso || "WT-T-8,2"], dm = i.dims || {}, avisos = [];
    var lefRefA = i.hVmin ? Math.min(WT.lefRef, i.hVmin * 1000 / 2) : WT.lefRef;                                              // A9: lef pela geometria
    var cosC = Math.cos(Math.PI / 4), lefTr = i.hT ? Math.min(WT.lefRef, i.hT * 1000 * cosC) : WT.lefRef, lefV = i.hVmin ? Math.min(WT.lefRef, i.hVmin * 1000 * cosC) : WT.lefRef;
    var RAX_CRUZ = roscaRaxd({ Rk_ref: WT.RaxK_cruzado150, lefRef: WT.lefRef, lefA: lefTr, lefB: lefV, kmod: c.kmod }).Rd;
    var RAX_REF = roscaRaxd({ Rk_ref: WT.RaxK_cruzado150, lefRef: WT.lefRef, lefA: lefRefA, lefB: lefRefA, kmod: c.kmod }).Rd;
    var RAX_190 = Math.min(WT.RaxK_190 * c.kmod / c.gamaRax, WT.FtK_aco / 1.1);
    var CHUMB = chumbadorFtRd(700, 245, 1.25);
    var K9 = c.k90Tipo, cap = function (t, ext, ts) { return function (al) { return ext ? chapasExternas(D, t, al, c.rhok, c.fu, ts, K9) : chapaInterna(D, t, al, c.rhok, c.fu, K9); }; };
    var a2Tab = bordas(D, Math.PI / 2, c.pinoTipo).a2;                                           // R05: a2 = 4d (parafuso/ajustado) ou 3d (pino liso) — Tab. 14
    if (i.cfg && i.cfg.mmSimplificado) avisos.push("R05: cfg.mmSimplificado LIGADO — madeira–madeira pela forma simplificada da R02, que NÃO existe na NBR 7190-1:2022 e dá até 5 % a mais que a Tabela 19 a 90°; usar só para reproduzir a R02.");
    var R = Object.keys(i.reacoes).map(function (k) { return i.reacoes[k]; }), lig = i.lig;
    var Mb = Math.max.apply(null, R.map(function (x) { return x.Mmax; })), Nt = Math.max.apply(null, R.map(function (x) { return -x.Nmin; }));
    var Nc = Math.max.apply(null, R.map(function (x) { return x.Nmax; })), Hb = Math.max.apply(null, R.map(function (x) { return x.Hmax; }));
    var Tt = lig.pilarTopo.Tmax, Ht = lig.pilarTopo.Hmax;
    /* N3: `reacoes`/`lig` chegam MAJORADOS por kmodRef/kmod (equivalentes — só valem para a MADEIRA e os pinos). O AÇO (chapa, placa, chumbadores) e a FUNDAÇÃO recebem o esforço REAL
       de cálculo da combinação: `reacoesReais` / `ligReal` (se não vierem, valem os mesmos — compatível com quem não separa). */
    var RR = Object.keys(i.reacoesReais || i.reacoes).map(function (k) { return (i.reacoesReais || i.reacoes)[k]; }), ligR = i.ligReal || lig;
    var MbR = Math.max.apply(null, RR.map(function (x) { return x.Mmax; })), NtR = Math.max.apply(null, RR.map(function (x) { return -x.Nmin; }));
    var NcR = Math.max.apply(null, RR.map(function (x) { return x.Nmax; })), HbR = Math.max.apply(null, RR.map(function (x) { return x.Hmax; })), TtR = ligR.pilarTopo.Tmax, HtR = ligR.pilarTopo.Hmax;
    var L = { esforcos: { base: { M: MbR, Ntracao: NtR, Ncompressao: NcR, H: HbR }, baseEq: { M: Mb, Ntracao: Nt, Ncompressao: Nc, H: Hb }, topo: { Ntracao: TtR, H: HtR }, topoEq: { Ntracao: Tt, H: Ht },
      nota: "N3: base/topo = esforço REAL de cálculo (vai ao aço e à fundação); baseEq/topoEq e tercaV…verga = equivalentes F·kmodRef/kmod (só para madeira e pinos)", tercaV: lig.tercaV, escora: lig.escora, bloqueador: lig.bloqueador, verga: lig.verga, fita: i.fitaNmax },
      cfg: { kmod: c.kmod, rhok: c.rhok, gLig: c.gLig }, avisos: avisos };
    var tCh = 0.016, fenda = 0.018, garfo = P.forma === "duplo", a, aTopoV = 0.05;
    /* M2: o nº de chumbadores por lado só depende dos esforços (não das chapas): uma passada prévia da placa dá a rigidez dos chumbadores, que entra EM SÉRIE na rigidez da base (e no mínimo β ≤ 3 abaixo) */
    var lpPre = garfo ? 2 * P.b + Vb + 0.12 : (P.forma === "quadrado" ? P.b : P.d) + 0.12;
    var plPre = placaBase({ lp: lpPre, M: MbR, Ntracao: NtR, Ncompressao: NcR, H: HbR, FtRd: CHUMB, FvRd: chumbadorFvRd(700, 314.16), chumbExtra: garfo ? 2 : 0, espessura_mm: 25, tChapa: garfo ? 0.012 : tCh, hpChapa: lpPre - 0.10, nChapas: garfo ? 4 : 2, MchapaSolda: MbR, fy: c.fy, gamaA1: c.gamaA1 });
    var serieK = { Kch: kthetaChumbadores({ n: plPre.porLado, lp: lpPre, lef: i.chumbLef }), Kfund: i.KthetaFundacao || null };
    if (!garfo) {
      var lado = P.forma === "quadrado" ? P.b : P.d * 0.85, t1 = (lado - fenda) / 2;
      /* M6 (R05): os pinos da BASE em cruz podem ter diâmetro menor que o do resto (cfg.dBase, ex. 0,012 = Ø12): a cruz cabe num pilar menor (lado útil ≥ 16d + fenda). O topo continua com D. */
      var Db = c.dBase || D, aT = lado / 2 - 4 * D;
      a = lado / 2 - 4 * Db;                                                                // borda carregada ≥ 4d (revisão A3)
      /* A6: a fenda da OUTRA chapa é borda: distância do pino à fenda = a − fenda/2 ≥ a4,t (4d); entre colunas 2a ≥ 3d; a ≤ 0 recusa */
      var a4min = 4 * Db, dFenda = a - fenda / 2, etaCruz = a <= 0 ? Infinity : Math.max(a4min / dFenda, (bordas(Db, Math.PI / 2, c.pinoTipo).a2) / (2 * a));
      if (a <= 0 || dFenda <= 0) etaCruz = Infinity;
      if (a > 0) {
        /* N6: a base também é projetada por RIGIDEZ — Kθ = Ku·Σr² ≥ i.KthetaMin (a rigidez abaixo da qual o pilar ficaria "mole", β > 3: o aviso M7 do motor); sem isso o ponto fixo da iteração é uma base quase rotulada */
        var nrMin = 2, Ku2 = 2 * kuPino(Db, c.rhok, true), porRig = false;
        for (;;) {
          L.base = dimGrupo({ nome: "base: chapa em cruz 16 mm + pinos Ø" + Math.round(Db * 1000) + " inox (por chapa)", cap: (Db === D ? cap(t1) : function (al) { return chapaInterna(Db, t1, al, c.rhok, c.fu, K9); }), nc: 2, a: a, d: Db, M: Mb, N: Nt / 2, H: Hb, nrMax: 24, kmod: c.kmod, gLig: c.gLig, pinoTipo: c.pinoTipo, tMadeira: t1, nrMin: nrMin });
          if (!L.base.ok || !i.KthetaMin || emSerie([Ku2 * somaR2(L.base.nc, L.base.nr, a, L.base.a1), serieK.Kch.Ktheta, serieK.Kfund]) >= i.KthetaMin - 1e-9 || L.base.nr >= 24) break;
          nrMin = L.base.nr + 1; porRig = true;
        }
        /* B2: o laço pode parar em nr = 24 (ou porque os chumbadores/fundação em série já limitam Kθ) SEM atingir o mínimo — o resultado diz a verdade */
        var KpCruz = L.base.ok && L.base.nr ? emSerie([Ku2 * somaR2(L.base.nc, L.base.nr, a, L.base.a1), serieK.Kch.Ktheta, serieK.Kfund]) : null;
        if (L.base.ok && i.KthetaMin && KpCruz != null && KpCruz < i.KthetaMin - 1e-9) { L.base.rigidezMinimaNaoAtingida = true; L.base.passos.push("N6/B2: Kθ = " + br(KpCruz, 0) + " kN·m/rad NÃO atinge o mínimo " + br(i.KthetaMin, 0) + " kN·m/rad (β ≤ 3) nem com " + L.base.nr + " linhas — limitado pelos chumbadores/fundação em série; reforçar a ancoragem ou aumentar o pilar."); avisos.push("N6/B2: a rigidez mínima da base (" + br(i.KthetaMin, 0) + " kN·m/rad, β ≤ 3) NÃO foi atingida (Kθ = " + br(KpCruz, 0) + "): o pilar fica com β > 3 (aviso M7)."); }
        else if (porRig && L.base.ok) { L.base.porRigidez = true; L.base.passos.push("N6: grupo aumentado para " + L.base.nr + " linhas por RIGIDEZ: Kθ (pinos em série com os chumbadores) ≥ " + br(i.KthetaMin, 0) + " kN·m/rad (pilar com β ≤ 3; abaixo disso a base é mole, aviso M7)."); }
      } else {
        L.base = { nome: "base: chapa em cruz — RECUSADA (lado do pilar pequeno demais)", ok: false, eta: Infinity, n: 0, nr: 0, comprimento: 0, passos: [] };
      }
      L.base.cruz = { a: a, distFenda: dFenda, a4t_min: a4min, a2_min: bordas(Db, Math.PI / 2, c.pinoTipo).a2, eta: etaCruz, ok: etaCruz <= 1 + 1e-9,
        passos: ["Base em cruz (pinos Ø" + Math.round(Db * 1000) + "): pino a " + br(dFenda * 1000, 0) + " mm da fenda da outra chapa (a − 9 mm), mínimo a4,t = 4d = " + br(a4min * 1000, 0) + " mm; entre colunas 2a = " + br(2 * a * 1000, 0) + " mm ≥ a2 = " + br(bordas(Db, Math.PI / 2, c.pinoTipo).a2 * 1000, 0) + " mm (Tab. 14, coluna " + (c.pinoTipo === "liso" ? "pinos lisos: 3d" : "parafusos/ajustados: 4d") + ") → η = " + (isFinite(etaCruz) ? br(etaCruz, 3) : "∞") + (etaCruz > 1 ? " — RECUSADA: usar base em garfo ou pilar de lado maior (a ≥ " + br((a4min + fenda / 2) * 1000, 0) + " mm)." : ".")] };
      var hp = 2 * (a + 1.2 * 0.017);
      L.base.chapa = chapaMpl({ t: tCh, hp: hp, M: MbR, fy: c.fy, gamaA1: c.gamaA1 });
      L.base.descricao = "Base engastada: placa de base 25 mm chumbada (fundação de outra empresa) + 2 chapas verticais de 16 mm soldadas em cruz, embutidas no pilar em fendas de 18 mm; pinos inox Ø" + Math.round(Db * 1000) + " ocultos (linhas das duas chapas alternadas meio passo), tampões de madeira.";
      L.topo = dimGrupo({ nome: "topo: chapa em T 16 mm + pinos Ø16 no pilar", cap: cap(t1), nc: 2, a: aT, d: D, M: 0, N: Tt, H: Ht, nrMax: 14, kmod: c.kmod, gLig: c.gLig, pinoTipo: c.pinoTipo, tMadeira: t1 });
      L.topoV = dimGrupo({ nome: "topo, lado da V: alma da chapa em T na V + pinos Ø16 ⊥ fibra", cap: function () { return chapaInterna(D, (Vb - fenda) / 2, Math.PI / 2, c.rhok, c.fu, K9); },
        nc: 2, a: aTopoV, d: D, M: 0, N: 0, H: Math.sqrt(Tt * Tt + Ht * Ht), nrMax: 12, kmod: c.kmod, gLig: c.gLig, pinoTipo: c.pinoTipo, tMadeira: (Vb - fenda) / 2 });
      L.topo.descricao = "Chapa em T de 16 mm com FORQUILHA (2 abas laterais abraçando a face de baixo da V — trava a torção da V): alma no pilar (pinos Ø16) e alma na V (pinos Ø16) + parafusos SFS WT-T 8,2×300 de reforço à tração normal.";
    } else {
      var braco = Vb + P.b, Npeca = Nt / 2 + Mb / braco; a = P.h / 2 - 4 * D;
      /* B3 (revisão R05): o garfo também é projetado por RIGIDEZ — Kθ = mín(plano da peça; binário entre as peças), em série com os chumbadores, ≥ KthetaMin (β ≤ 3 no eixo forte, como na cruz). O grupo cresce na mola que governa até
         atingir o mínimo, ou até 24 linhas / 1,0 m de comprimento: se não atinge, avisa (a rigidez fica limitada pela geometria do garfo, pelos chumbadores ou pela fundação). */
      var Ku2g = 2 * kuPino(D, c.rhok, true), nr1 = 2, nr2 = 2, c1, c2, Kg = null, limiteG = false, porRigG = false;
      for (;;) {
        c1 = dimGrupo({ nome: "base: garfo, binário entre as peças (por peça)", cap: cap(P.b, true, 0.012), nc: 2, a: a, d: D, M: 0, N: Npeca, H: Hb / 2, nrMax: 24, kmod: c.kmod, gLig: c.gLig, pinoTipo: c.pinoTipo, tMadeira: P.b, nrMin: nr1 });
        c2 = dimGrupo({ nome: "base: garfo, momento no plano da peça (por peça)", cap: cap(P.b, true, 0.012), nc: 2, a: a, d: D, M: Mb / 2, N: Nt / 2, H: Hb / 2, nrMax: 24, kmod: c.kmod, gLig: c.gLig, pinoTipo: c.pinoTipo, tMadeira: P.b, nrMin: nr2 });
        if (!c1.ok || !c2.ok) break;
        var Kpl = 2 * Ku2g * somaR2(c2.nc, c2.nr, c2.centroGrupo.a, c2.a1), Kbi = c1.n * Ku2g * braco * braco / 2;
        Kg = emSerie([Math.min(Kpl, Kbi), serieK.Kch.Ktheta, serieK.Kfund]);
        if (!i.KthetaMin || Kg >= i.KthetaMin - 1e-9) break;
        var pr = Kpl <= Kbi ? c2 : c1;
        if (pr.nr >= 24 || (pr.nr) * pr.a1 + 2 * pr.a3 > 1.0) { limiteG = true; break; }
        if (Kpl <= Kbi) nr2 = c2.nr + 1; else nr1 = c1.nr + 1;
        porRigG = true;
      }
      L.base = ext({}, c1.ok && c2.ok && c1.nr >= c2.nr ? c1 : c2, { casos: [c1, c2] });
      if (c1.ok && c2.ok && i.KthetaMin && Kg != null) {
        if (Kg < i.KthetaMin - 1e-9) { L.base.rigidezMinimaNaoAtingida = true; avisos.push("N6/B3: o garfo NÃO atinge a rigidez mínima da base (Kθ = " + br(Kg, 0) + " < " + br(i.KthetaMin, 0) + " kN·m/rad, β ≤ 3 no eixo forte)" + (limiteG ? " nem com " + Math.max(c1.nr, c2.nr) + " linhas" : "") + " — limitado pela geometria do garfo, pelos chumbadores ou pela fundação: o pilar fica com β > 3 (aviso M7)."); L.base.passos.push("N6/B3: Kθ = " + br(Kg, 0) + " kN·m/rad NÃO atinge o mínimo " + br(i.KthetaMin, 0) + " (β ≤ 3)."); }
        else if (porRigG) { L.base.porRigidez = true; L.base.passos.push("N6/B3: garfo aumentado por RIGIDEZ para " + Math.max(c1.nr, c2.nr) + " linhas: Kθ = " + br(Kg, 0) + " ≥ " + br(i.KthetaMin, 0) + " kN·m/rad (β ≤ 3)."); }
      }
      var Mpl2 = 2 * 0.012 * Math.pow(P.h - 0.02, 2) / 4 * c.fy * 1e3 / c.gamaA1 / 2;
      L.base.chapa = { t_mm: 12, obs: "2 chapas externas por peça (garfo), dupla — momento no plano da peça dividido pelas 2 chapas", Mpl_Rd: Mpl2, eta: (MbR / 2) / Mpl2, ok: (MbR / 2) / Mpl2 <= 1,
        passos: ["Garfo: 2 chapas 12 mm por peça; Mpl,Rd = " + br(Mpl2) + " kN·m; M por peça = " + br(MbR / 2) + " kN·m → η = " + br((MbR / 2) / Mpl2, 3) + "."] };
      L.base.descricao = "Base em garfo: para cada peça do pilar duplo, 2 chapas externas de 12 mm de aço galvanizado a fogo soldadas à placa de base; parafusos passantes Ø16 inox AJUSTADOS (furo = Ø16, sem folga) aparentes.";
      /* A7: madeira-madeira COMPLETO (EN 8.7: g, h, j, k) — o modo h (embutimento da V) entra; o simplificado só reproduz a R02 (i.cfg.mmSimplificado) */
      L.topo = dimGrupo({ nome: "topo: V entre as peças, parafusos passantes Ø16 (madeira-madeira)", cap: function (al) { return madeiraMadeira(D, P.b, Vb, al, Math.PI / 2, c.rhok, c.fu, !!(i.cfg && i.cfg.mmSimplificado), K9); }, nc: 2, a: a, d: D, M: 0, N: Tt, H: Ht, nrMax: 14, kmod: c.kmod, gLig: c.gLig, pinoTipo: c.pinoTipo, tMadeira: Math.min(P.b, Vb) });
      L.topo.descricao = "A V passa entre as duas peças do pilar (garfo natural, trava a torção); parafusos passantes Ø16 inox ajustados + parafusos SFS WT-T 8,2×300 de reforço à tração normal na V.";
    }
    /* A4: he/h do detalhe REAL. Pilar quadrado/circular: pinos da alma da chapa em T em 2 colunas verticais a ±a do meio da V → he = hV/2 + a.
       Pilar duplo: as linhas de parafusos sobem centradas na V → he = hV/2 + (nr − 1)·a1/2. Sem hV, vale o 0,65 antigo (R02). */
    var heh = 0.65, heTxt = "pino mais alto do detalhe a 0,65·h da face de baixo";
    if (i.hV) {
      var heAbs = garfo ? i.hV / 2 + ((L.topo.nr || 2) - 1) * (L.topo.a1 || 5 * D) / 2 : i.hV / 2 + aTopoV;
      heh = Math.min(0.95, heAbs / i.hV);
      heTxt = "pino mais alto do detalhe a he = " + br(heAbs * 1000, 0) + " mm (he/h = " + br(heh, 3) + ", V com h = " + br(i.hV * 1000, 0) + " mm sobre o pilar)";
    } else avisos.push("A4: altura da V sobre o pilar (hV) não informada — he/h = 0,65 da R02.");
    L.reforcoV = reforcoTracaoNormal({ F: Tt, he_h: heh, Rax_d: RAX_REF, minimo: 6 });
    L.reforcoV.especificacao = "SFS WT-T-8,2 × 300 verticais, metade de cada lado da ligação; " + heTxt;
    /* placa de base e chumbadores */
    var lp = garfo ? 2 * P.b + Vb + 0.12 : (P.forma === "quadrado" ? P.b : P.d) + 0.12;
    var chapaBase = garfo ? { t: 0.012, hp: P.h - 0.02, n: 4, Mw: MbR / 2 } : { t: tCh, hp: Math.max(0.05, L.base.chapa ? L.base.chapa.largura_mm / 1000 : lp - 0.10), n: 2, Mw: MbR };
    var pl = placaBase({ lp: lp, M: MbR, Ntracao: NtR, Ncompressao: NcR, H: HbR, FtRd: CHUMB, FvRd: chumbadorFvRd(700, 314.16), chumbExtra: garfo ? 2 : 0, espessura_mm: 25, tChapa: chapaBase.t, hpChapa: chapaBase.hp, nChapas: chapaBase.n, MchapaSolda: chapaBase.Mw, fy: c.fy, gamaA1: c.gamaA1 });
    L.placaBase = { dimensoes_mm: pl.dimensoes_mm, espessura_mm: pl.espessura_mm, chumbadores: { tipo: "barra roscada inox A4-70 M20 com ancoragem química (sistema e embutimento pela fundação)", porLado: pl.porLado, total: pl.total, Tlado_d: pl.Tlado_d, Ft_Rd: CHUMB, Fv_Rd: pl.Fv_Rd, verificacao: pl.chumbadoresVerif },
      flexao: pl.flexao, solda: pl.solda, eta: pl.eta, ok: pl.ok, fonte: pl.fonte, pressao_max_kPa: pl.pressao_max_kPa, notaAcoZ: pl.notaAcoZ,
      reacoesParaFundacao: { M_d: MbR, Ntracao_d: NtR, Ncompressao_d: NcR, H_d: HbR, pressao_max_kPa: pl.pressao_max_kPa, nota: "valores de CÁLCULO da combinação (γ já incluído), sem o artifício do kmod — N3" }, passos: pl.passos };
    /* B7 (revisão R05): pressão de PICO sob a placa × resistência do concreto/graute. fck informado (`fckFundacao`, MPa) ou, na falta, C25 DECLARADO como padrão; f_cd = 0,85·fck/1,4 (aviso, não reprova: o concreto é da fundação de outra empresa) */
    var fckF = i.fckFundacao || 25, fcdF = 0.85 * fckF / 1.4 * 1000;
    L.placaBase.pressaoPico = { sigma_kPa: pl.pressao_max_kPa, fck_MPa: fckF, fckInformado: !!i.fckFundacao, fcd_kPa: fcdF, eta: pl.pressao_max_kPa / fcdF, ok: pl.pressao_max_kPa <= fcdF, nota: "f_cd = 0,85·fck/1,4" + (i.fckFundacao ? "" : "; fck = 25 MPa (C25) é PADRÃO declarado — informar `fckFundacao` do projeto da fundação") };
    if (pl.pressao_max_kPa > fcdF) avisos.push("B7: a pressão de pico sob a placa (" + br(pl.pressao_max_kPa / 1000, 1) + " MPa) passa de f_cd = 0,85·fck/1,4 = " + br(fcdF / 1000, 1) + " MPa do concreto/graute (fck " + fckF + " MPa" + (i.fckFundacao ? "" : ", C25 padrão declarado") + "): aumentar a placa ou o fck, ou confirmar com a fundação.");
    /* M9: apoio da V sobre o pilar (compressão ⊥ às fibras) — só onde a V apoia de fato (não no garfo) */
    if (!garfo && i.fc90k && lig.pilarTopo.Cmax != null) {
      var ladoP = P.forma === "quadrado" ? P.b : P.d * 0.85, sg = lig.pilarTopo.Cmax / (Vb * ladoP) / 1000, an = i.alphaN ? alfaN(ladoP * 100) : 1, fc90d = i.fc90k * c.kmod / 1.4 * an;
      if (i.alphaN && i.fc0k) fc90d = Math.min(fc90d, 0.25 * i.fc0k * c.kmod / 1.4 * an);          // 6.3.3: f_c90,d ≤ 0,25·f_c0,d·α_n
      L.apoioV = { sigma_c90: sg, fc90d: fc90d, alphaN: an, eta: sg / fc90d, ok: sg / fc90d <= 1, passos: ["Apoio da V no pilar (⊥ às fibras): σc,90 = " + br(lig.pilarTopo.Cmax) + " kN / (" + br(Vb * 100, 0) + " × " + br(ladoP * 100, 0) + " cm) = " + br(sg, 3) + " MPa ≤ fc,90,d = " + br(fc90d, 3) + " MPa (kc,90 = 1" + (i.alphaN ? "; α_n = " + br(an, 2) + " pela extensão de " + br(ladoP * 100, 0) + " cm, Tab. 6 — opção ligada" : "; α_n = 1, a favor da segurança") + ") → η = " + br(sg / fc90d, 3) + "."] };
    }
    /* A9: terça → V — arrancamento e corte lateral na MESMA verificação: axial do parafuso tracionado = (T + H)/(n·cosθ) (a envoltória não separa as combinações:
       soma conservadora); n cresce de 2 em 2 (pares cruzados) */
    var nS, up = lig.tercaV.Tmax, H = lig.tercaV.Hmax, ta, tl, tc;
    for (nS = 4; nS <= 24; nS += 2) {
      ta = roscaInclinada({ F: up, n: nS, anguloGraus: 45, Rax_d: RAX_CRUZ }); tl = roscaInclinada({ F: H, n: nS, anguloGraus: 45, Rax_d: RAX_CRUZ }); tc = roscaInclinada({ F: up + H, n: nS, anguloGraus: 45, Rax_d: RAX_CRUZ });
      if (tc.ok) break;
    }
    L.tercaV = { parafuso: "SFS WT-T-8,2 × 300 (ETA-12/0063)", porApoio: nS, Rax_d: RAX_CRUZ, lef_mm: Math.min(lefTr, lefV), eta_arrancamento: ta.eta, eta_lateral: tl.eta, eta_combinado: tc.eta, eta: tc.eta, ok: tc.ok,
      passos: ta.passos.concat(tl.passos).concat(["Combinado (T + H na mesma verificação): axial = (T + H)/(n·cosθ) = " + br(tc.axial) + " kN → η = " + br(tc.eta, 3) + " com " + nS + " parafusos por apoio (lef = " + br(Math.min(lefTr, lefV), 0) + " mm de cada lado)."]) };
    /* escoras, bloqueadores */
    var eb = dm.escora ? Math.min(dm.escora.modelo.b, dm.escora.fonte.b) : 0.08, escTxt = dm.escora ? Math.round(dm.escora.fonte.b * 100) + "×" + Math.round(dm.escora.fonte.h * 100) : "8×14";
    var nBl = Math.ceil(lig.bloqueador.Nmax / RAX_190), pEsc = chapasExternas(D, eb, 0, c.rhok, c.fu, 0.004, K9) * c.kmod / c.gLig;
    var nPe = Math.max(2, Math.ceil(lig.escora.Nmax / pEsc));
    L.escora = { especificacao: "MLC " + escTxt + "; 2 chapas inox 4 mm laterais + " + nPe + " parafusos passantes Ø16 por ponta (detalhe na emissão)", N_d: lig.escora.Nmax, Rd_parafuso: pEsc, parafusosPorPonta: nPe, eta: lig.escora.Nmax / (nPe * pEsc), ok: true,
      passos: ["Escora N = " + br(lig.escora.Nmax) + " kN; Rd por parafuso Ø16 (aço-madeira-aço, t = " + br(eb * 100, 0) + " cm — a menor entre a seção calculada e a especificada) = " + br(pEsc) + " kN → " + nPe + " por ponta."] };
    L.bloqueador = { especificacao: "MLC 6×(h terça − 8 cm); " + Math.max(2, nBl) + " parafusos SFS WT-T 8,2 × 190 por ponta (atravessando a terça)", N_d: lig.bloqueador.Nmax, parafusosPorPonta: Math.max(2, nBl), Rax_d: RAX_190,
      eta: lig.bloqueador.Nmax / (Math.max(2, nBl) * RAX_190), ok: true, passos: ["Bloqueador N = " + br(lig.bloqueador.Nmax) + " kN; Rax,d (WT-T 8,2×190) = " + br(RAX_190) + " kN → " + Math.max(2, nBl) + " por ponta."] };
    /* verga: lado da verga (pinos Ø12, chapa interna: N ∥ à fibra da verga, cortante ⊥ — A8) e lado da V (corte simples — C3) */
    var vg = lig.verga, semComp = vg.Vy == null && vg.Vz == null, Vy = semComp ? 0 : (vg.Vy || 0), Vz = semComp ? vg.Vmax : (vg.Vz || 0),   // sem componentes: tudo ⊥ à fibra da V (a favor da segurança)
      Nvg = vg.Nmax || 0, d12 = 0.012, VGs = i.secoes.VG;
    var Hvg = Math.sqrt(Vy * Vy + Vz * Vz);
    var lvg = dimGrupo({ nome: "verga: chapa em T na fenda da verga, pinos Ø12", cap: function (al) { return chapaInterna(d12, (VGs.b - 0.010) / 2, al, c.rhok, c.fu, K9); }, nc: 2, a: VGs.h / 2 - 4 * d12, d: d12, M: 0, N: Nvg, H: Hvg, nrMax: 14, kmod: c.kmod, gLig: c.gLig, pinoTipo: c.pinoTipo, tMadeira: (VGs.b - 0.010) / 2,
      Mfun: function (nr, a1) { return Hvg * (Math.max(7 * d12, 0.08) + (nr - 1) * a1 / 2 + 0.004); } });    // A8: M = H·e, e = V → centro do grupo de pinos (a3 + (nr − 1)·a1/2 + ½ aba de 8 mm)
    var hVv = i.hV || 0.30, vv = vergaNaV({ Vy: Vy, Vz: Vz, N: Nvg, Vb: Vb, hV: hVv, zPino: Math.min(VGs.b / 2, hVv / 2), d: D, fc90k: i.fc90k, cfg: i.cfg, arruela: i.arruela, RaxReforco: RAX_REF, zMax: i.vergaZMax });
    (vv.avisos || []).forEach(function (t) { avisos.push(t); });
    var trTxt = dm.travessa ? Math.round(dm.travessa.b * 100) + "×" + Math.round(dm.travessa.h * 100) : "8×20", pdTxt = dm.pendural ? Math.round(dm.pendural.b * 100) + "×" + Math.round(dm.pendural.h * 100) : "6×12";
    L.verga = { especificacao: "ligação na face lateral da V: chapa em T inox 8 mm numa face (alma na fenda da verga com " + lvg.n + " pinos Ø12; aba na V com " + vv.n + " parafusos passantes Ø16 em corte simples, arruela 3d" + (vv.reforcoF90 ? "; + " + vv.reforcoF90.parafusos + " parafusos de rosca total ⊥ à fibra da V contra o fendilhamento" : "") + "); travessa MLC " + trTxt + " entre as terças vizinhas + pendural MLC " + pdTxt + " ao meio da verga",
      F_d: Math.sqrt(Vy * Vy + Vz * Vz + Nvg * Nvg), pinos: lvg, parafusosNaV: vv.n, parafusosReforcoVerga: vv.reforcoF90 ? vv.reforcoF90.parafusos : 0, naV: vv, pendural_N_d: lig.pendural, eta: Math.max(lvg.eta, vv.eta), ok: lvg.ok && vv.ok, passos: lvg.passos.concat(vv.passos) };
    if (lvg.ok) { var eEc = Math.max(7 * d12, 0.08) + (lvg.nr - 1) * lvg.a1 / 2 + 0.004; L.verga.excentricidade = { e_m: eEc, M_kNm: Hvg * eEc, nota: "A8: momento da excentricidade da chapa em T — a força da V (H) atua na face da V, a e do centro do grupo de pinos Ø12 da verga; entra no momento polar do grupo. A excentricidade do lado da V (aba) não é verificada." }; L.verga.passos = L.verga.passos.concat(["A8: excentricidade e = " + br(eEc * 1000, 0) + " mm → M = H·e = " + br(Hvg * eEc) + " kN·m no grupo de pinos da verga."]); }
    var Nf = i.fitaNmax, Nfe = i.fitaNeq != null ? i.fitaNeq : Nf, Af = 60 * 2 * 0.75, Rkf = i.fitaRk != null ? i.fitaRk : 1.75, pf = Rkf * c.kmod / c.gLig, etaF = Nf / (Af * 235 / 1.1 / 1000);
    if (i.fitaRk == null) avisos.push("M11: Rk do parafuso da fita (1,75 kN) vem da R02, SEM FONTE — informar o valor do catálogo/ETA em `fitaRk`.");
    L.fita = { especificacao: "fita metálica perfurada 60 × 2,0 mm galvanizada a fogo (ou inox), em X, com tensor", N_d: Nf, eta: etaF, ok: etaF <= 1, parafusosPorPonta: Math.max(8, Math.ceil(Nfe / pf)), Rk_parafuso: Rkf, pendencia: i.fitaRk == null ? "Rk do parafuso 5×50 sem fonte (R02)" : null,
      passos: ["Fita 60×2,0 (área líquida 75 %): N = " + br(Nf) + " kN ≤ " + br(Af * 235 / 1.1 / 1000) + " kN → η = " + br(etaF, 3) + "."] };
    if (!i.cfg || i.cfg.kmod == null) avisos.push("C2: kmod da ligação não informado — usado o padrão 0,72 (curta × umidade 3). Passe cfg.kmod e cfg.rhok da classe (maddimensionar2.pacoteLigacoes faz isso).");
    /* 7.1.9 / 7.2 (f): a rosca total WT-T tem d = 8,2 mm < 9,5 mm (rosca soberba). A transcrição da 7.1.9 só nomeia "rosca soberba" e "parafuso passante"; o autoatarraxante aparece apenas na Tab. 17 (Kser) — o texto
       NÃO esclarece se ele entra no mínimo de 9,5 mm. Conduta (RT precisa confirmar): resistência pela ETA do fabricante (fonte EN/ETA), γ_lig = 1,4 da 7.1.2, e aviso explícito no resultado. */
    var lefMinR = Math.min(lefTr, lefV, lefRefA), pontaMin = 6 * WT.d_mm;
    L.rosca = { parafuso: i.parafuso || "WT-T-8,2", d_mm: WT.d_mm, fonte: WT.fonte, gama: c.gamaRax, lef_min_mm: lefMinR, ponta_min_mm: pontaMin, eta: pontaMin / lefMinR, ok: lefMinR >= pontaMin - 1e-9,
      abaixoDe9_5: WT.d_mm < 9.5, norma: NORMA.pino9, aviso: WT.d_mm < 9.5 ? "7.1.9 (NBR 7190-1:2022, p. 51 impr.): rosca soberba pede d ≥ 9,5 mm; o " + (i.parafuso || "WT-T-8,2") + " tem " + br(WT.d_mm, 1) + " mm e a transcrição da norma não esclarece se o autoatarraxante de rosca total entra nesse mínimo. Resistência pela ETA do fabricante (fonte EN/ETA), com γ_lig = 1,4 (7.1.2); o RT deve confirmar o enquadramento (comprovação experimental, 7.1.2 e 9.2.1)." : null };
    if (L.rosca.aviso) avisos.push(L.rosca.aviso);
    if (!L.rosca.ok) avisos.push("7.2 (f): ponta do parafuso de rosca com " + br(lefMinR, 0) + " mm < 6d = " + br(pontaMin, 0) + " mm.");
    /* N6: rigidez da base pela ligação dimensionada */
    L.rigidezBase = rigidezBase(L, P, Vb, garfo ? D : (c.dBase || D), c, garfo, serieK);
    if (L.rigidezBase.semFundacao && L.rigidezBase.Ktheta != null) avisos.push("M2: Kθ da base " + br(L.rigidezBase.Ktheta, 0) + " kN·m/rad = pinos em série com os chumbadores; SEM a fundação e sem a flexão da placa (tomadas como rígidas) — por cima da real. Informar `KthetaFundacao`.");
    /* N9 e notas de especificação */
    L.notas = []; if (L.placaBase && L.placaBase.notaAcoZ) L.notas.push(L.placaBase.notaAcoZ);
    L.espacamentos = { fonte: bordas(D, 0, c.pinoTipo).fonte, coluna: c.pinoTipo === "liso" ? "pinos lisos" : "parafusos passantes, rosca soberba e ajustados", a1_base_mm: L.base && L.base.a1 ? Math.round(L.base.a1 * 1000) : null, a1_topo_mm: L.topo && L.topo.a1 ? Math.round(L.topo.a1 * 1000) : null };
    L.normaFonte = { exemplarLicenciado: false, itens: NORMA };
    /* resumo de η e ok de TODAS as verificações (o auditor lê daqui: ligação sem verificação do aço = sem chapa/Mpl) */
    L.verificacoes = [["base", L.base], ["base-cruz", L.base.cruz], ["base-chapa", L.base.chapa], ["topo", L.topo], ["topoV", L.topoV], ["reforcoV", L.reforcoV], ["apoioV", L.apoioV], ["tercaV", L.tercaV], ["verga", L.verga], ["verga-V", vv], ["fita", L.fita], ["rosca-ponta", L.rosca]]
      .concat(pl.verificacoes.map(function (v) { return ["placa-" + v.nome.replace(/^placa-/, ""), v]; }))
      .filter(function (p) { return p[1]; }).map(function (p) { return { nome: p[0], eta: p[1].eta, ok: p[1].ok !== false && p[1].eta <= 1 + 1e-9 }; });
    L.eta = Math.max.apply(null, L.verificacoes.map(function (v) { return v.eta; }));
    L.ok = L.verificacoes.every(function (v) { return v.ok; });
    L.passos = []; ["base", "topo", "topoV", "reforcoV", "apoioV", "tercaV", "verga", "fita"].forEach(function (k) { if (L[k] && L[k].passos) L.passos = L.passos.concat(L[k].passos); });
    if (L.base.cruz) L.passos = L.base.cruz.passos.concat(L.passos);
    return L;
  }

  var MadLig = {
    PARAFUSOS: PARAFUSOS, PADRAO: PADRAO, fh0: fh0, fhAlfa: fhAlfa, MyRk: MyRk,
    chapaInterna: chapaInterna, chapasExternas: chapasExternas, madeiraMadeira: madeiraMadeira, bordas: bordas,
    grupoPinos: grupoPinos, nefFator: nefFator, dimGrupo: dimGrupo, chapaMpl: chapaMpl, chumbadorFtRd: chumbadorFtRd, chumbadorFvRd: chumbadorFvRd, placaBase: placaBase,
    roscaRaxd: roscaRaxd, roscaInclinada: roscaInclinada, reforcoTracaoNormal: reforcoTracaoNormal, pacoteT1: pacoteT1,
    chapaFinaCorteSimples: chapaFinaCorteSimples, chapaCorteSimples: chapaCorteSimples, madeiraMadeiraSimples: madeiraMadeiraSimples, classeChapa: classeChapa, k90De: k90De,
    kserPino: kserPino, kuPino: kuPino, somaR2: somaR2, kthetaChumbadores: kthetaChumbadores, emSerie: emSerie, alfaN: alfaN, rigidezBase: rigidezBase, fendilhamentoF90Rk: fendilhamentoF90Rk, vergaNaV: vergaNaV, NORMA: NORMA, NOTA_ACO_Z: NOTA_ACO_Z
  };
  if (typeof module !== "undefined" && module.exports) module.exports = MadLig;
  else global.MadLig = MadLig;
})(typeof window !== "undefined" ? window : this);

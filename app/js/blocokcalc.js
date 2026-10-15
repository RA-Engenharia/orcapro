/* =====================================================================
 * blocokcalc.js — CÁLCULO da edificação em Blocok (motor PURO, ES5, sem
 * DOM, Node-testável). Lê as paredes, pagina cada uma (js/blocokexec.js),
 * calcula vento, cargas, painel, vergas, cintas, pilaretes e fundação, e
 * devolve a MEMÓRIA passo a passo para o memorial (js/blocokmemorial.js).
 *
 *   BlocokCalc.calcular(obra)  → { ok, paredes:[…], vento, fundacao, resumo, memoria, pendencias, avisos }
 *   BlocokCalc.flexao / cisalhamento / flecha / flexoCompressao / placaNavier  (partes testáveis)
 *
 * ---------------------------------------------------------------------
 * O MODELO (e por quê) — decisão do Rogério em 14/10/2026: "vedação +
 * estrutura embutida".
 * ---------------------------------------------------------------------
 * Os laudos UFMG/LAEES (2022) aprovam o painel Blocok como VEDAÇÃO; não há
 * ensaio de compressão nem DATec. Então:
 *  1. O PAINEL é vedação. É verificado à ação do VENTO fora do plano como
 *     placa apoiada nos 4 lados (base, cinta e dois pilaretes), momentos
 *     elásticos de Navier (Timoshenko & Woinowsky-Krieger, placa
 *     simplesmente apoiada sob carga uniforme). A resistência à flexão do
 *     painel NÃO É PUBLICADA: entra como parâmetro do fabricante (ensaio
 *     pela NBR 15575-2 Anexo A / Diretriz SiNAT). Sem ela, a verificação sai
 *     PENDENTE com o valor EXIGIDO — o memorial diz exatamente o que pedir
 *     ao fabricante (memorial por especificação de desempenho). A estimativa
 *     analítica (sanduíche com composição total, tração na flexão da junta
 *     por analogia à NBR 16868-1) aparece só como informação.
 *  2. A ESTRUTURA são os pilaretes, vergas e cintas de concreto armado
 *     moldados dentro da peça, calculados pela NBR 6118 (flexão simples,
 *     cisalhamento modelo I, flecha por Branson, flexo-compressão com 2ª
 *     ordem pelo pilar-padrão de curvatura aproximada).
 *  3. Pilarete só pode receber laje/cobertura se cumprir a NBR 6118 13.2.3
 *     (menor dimensão ≥ 14 cm com γn; área ≥ 360 cm²): na prática, só a
 *     peça de 20 cm (concreto de 15 cm). Nas de 13/15 cm o pilarete é de
 *     TRAVAMENTO (vento) e não pode receber carga vertical — o motor acusa
 *     o erro e diz a saída.
 *
 * NORMAS (texto local da biblioteca RA, 14/10/2026):
 *   NBR 6120:2019 Tabela 10 (p. 26): residencial 1,5 kN/m²; área de
 *     serviço 2,0; forro só manutenção 0,1; laje de cobertura (concreto)
 *     com acesso só para manutenção 1,0. Item 6.4: telhado ≥ 0,25 kN/m².
 *   NBR 6118:2014 (vigente 2023 — conferir): 13.2.2 viga ≥ 12 cm (10 cm
 *     excepcional); 13.2.3 pilar ≥ 19 cm, 14–19 com γn = 1,95 − 0,05 b,
 *     área ≥ 360 cm²; Tabela 7.2 cobrimento viga/pilar 25/30/40/50 mm (CAA
 *     I–IV); 17.3.5.2.1 As,mín por Md,mín = 0,8 W0 fctk,sup e ρ ≥ 0,15 %;
 *     17.3.5.3.1 pilar As,mín = 0,15 Nd/fyd ≥ 0,004 Ac.
 *   NBR 6123 (vento) via js/acovento.js (texto de 1988 — conferir na 2023).
 *   NBR 8681 (combinações): γg = γq = 1,4; ψ0 = 0,5 (residencial) e 0,6
 *     (vento) — texto de 2003, conferir na 2025.
 *   NBR 15575-4:2013 (texto local; vigente 2025 — conferir): deslocamento
 *     da vedação ao vento dh ≤ h/350 na combinação 0,9 G + 0,8 W.
 *   Diretriz SiNAT 019 (2026): elemento estrutural a ≤ 4,0 m (js/blocokexec).
 *
 * Teste: node tools/test-blocokcalc.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./blocokexec.js"), (function () { try { return require("./acovento.js"); } catch (e) { return null; } })());
  else root.BlocokCalc = factory(root.BlocokExec, root.AcoVento || null);
})(typeof self !== "undefined" ? self : this, function (BlocokExecDep, AcoVentoDep) {
  "use strict";
  /* no navegador a ordem dos <script> não é garantida (grupos carregados sob
     demanda): o motor e o vento são procurados NA HORA DO USO, não na carga */
  var G = typeof self !== "undefined" ? self : this;
  function BX() { return BlocokExecDep || (G && G.BlocokExec) || null; }
  function AV() { return AcoVentoDep || (G && G.AcoVento) || null; }
  var EnsaioDep = (typeof module !== "undefined" && module.exports) ? (function () { try { return require("./blocokensaio.js"); } catch (e) { return null; } })() : null;
  function EN() { return EnsaioDep || (G && G.BlocokEnsaio) || null; }

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function r2(n) { return Math.round((+n || 0) * 100) / 100; }
  function r3(n) { return Math.round((+n || 0) * 1000) / 1000; }
  function r4(n) { return Math.round((+n || 0) * 10000) / 10000; }
  function br(n, c) { return (+n || 0).toFixed(c == null ? 2 : c).replace(".", ","); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* NORMAS como saem nos documentos de CLIENTE (memorial, pranchas): número:ano e
     título, LIMPOS. Pedido do gerente em 14/10/2026: a S12a viu "(texto da
     biblioteca; vigente 2023 — conferir)" nas pranchas — nota interna não sai em
     documento de cliente. A edição citada é a do TEXTO que o cálculo seguiu (o da
     biblioteca RA); a edição vigente no catálogo ABNT e o que conferir nela ficam
     em EDICOES (abaixo, uso interno) e em docs/blocok/DUVIDAS-REFERENCIA.md.
     NORMA = forma curta (referência de cada passo); NORMAS = com o título (lista). */
  var NORMA = {
    nbr6118: "ABNT NBR 6118:2014", nbr6120: "ABNT NBR 6120:2019", nbr6123: "ABNT NBR 6123:1988", nbr8681: "ABNT NBR 8681:2003",
    nbr15575: "ABNT NBR 15575-4:2025", sinat019: "Diretriz SiNAT nº 019 (maio/2026)", nbr16868: "ABNT NBR 16868-1:2020"
  };
  var TITULO = {
    nbr6118: "Projeto de estruturas de concreto — Procedimento",
    nbr6120: "Ações para o cálculo de estruturas de edificações",
    nbr6123: "Forças devidas ao vento em edificações",
    nbr8681: "Ações e segurança nas estruturas — Procedimento",
    nbr15575: "Edificações habitacionais — Desempenho — Parte 4: Sistemas de vedações verticais internas e externas — SVVIE",
    sinat019: "Sistemas de paredes sem função estrutural compostas de blocos pré-fabricados de EPS e argamassa ou concreto",   // título: RA Brain\Pesquisas\Paineis EPS-concreto - normas e calculo.md
    nbr16868: "Alvenaria estrutural — Parte 1: Projeto (usada por analogia)"
  };
  var NORMAS = {};
  Object.keys(NORMA).forEach(function (k) { NORMAS[k] = NORMA[k] + " — " + TITULO[k]; });
  /* uso INTERNO (nunca impresso): edição usada × vigente — vigencia.json da
     biblioteca RA (catálogo ABNT, conferido em 12/10/2026). Vazio = não confirmado. */
  var EDICOES = {
    nbr6118: { usada: "2014", vigente: "2026" }, nbr6120: { usada: "2019", vigente: "2019" }, nbr6123: { usada: "1988", vigente: "2023" },
    nbr8681: { usada: "2003", vigente: "2025" },
    /* 15575-4: CITADA a 2025 (decisão do gerente, 14/10/2026); o h/350 do cálculo veio do texto de 2013 — conferir na 2025 (DUVIDAS-REFERENCIA.md, seção 10) */
    nbr15575: { usada: "2013", vigente: "2025", citada: "2025" }, nbr16868: { usada: "2020", vigente: "2020" }
  };
  /* tira de um texto do motor (vento, avisos) a nota interna de "conferir" */
  function semNotaInterna(s) { return String(s == null ? "" : s).replace(/\s*\(([^()]*\([^()]*\))?[^()]*conferir[^()]*\)/gi, "").replace(/\s*—\s*conferir\b/gi, "").replace(/\bconferir\b/gi, "verificar"); }
  var CARGAS = {   // NBR 6120:2019, Tabela 10 (p. 26) e 6.4
    residencial: { q: 1.5, ref: "NBR 6120:2019, Tabela 10 — dormitórios, sala, copa, cozinha, sanitários" },
    servico: { q: 2.0, ref: "NBR 6120:2019, Tabela 10 — despensa, área de serviço e lavanderia" },
    forro: { q: 0.1, ref: "NBR 6120:2019, Tabela 10 — forro acessível apenas para manutenção" },
    lajeCobertura: { q: 1.0, ref: "NBR 6120:2019, Tabela 10 — coberturas de concreto com acesso apenas para manutenção" },
    telhado: { q: 0.25, ref: "NBR 6120:2019, 6.4 — mínimo para telhados (0,25 a 0,50 kN/m² conforme a área de influência)" }
  };
  var GAMA = { concretoArmado: 25, argamassa: 21 };   // kN/m³ (NBR 6120:2019, Tabela 1)
  var COMB = { gg: 1.4, gq: 1.4, gw: 1.4, psi0Q: 0.5, psi0W: 0.6, ggFav: 1.0, ref: NORMA.nbr8681 };
  var COBR = { I: 25, II: 30, III: 40, IV: 50 };       // mm, viga/pilar (NBR 6118 Tabela 7.2)

  function padroes() {
    return {
      fck: 25, fyk: 500, fywk: 600, Es: 210000, caa: "II",
      estribo: 5.0, barraViga: 8, barraPilar: 10, dmaxAgregado: 9.5,
      vento: { v0: null, categoria: "IV", grupoS3: 2, s1: { tipo: "plano" }, q: null },
      painel: { MRdX: null, MRdY: null, EI: null, fonte: "" },          // do fabricante (ensaio)
      analogia: { ftkParalelo: 0.20, ftkPerpendicular: 0.10, gamaM: 2.0, Eface: null, fonte: "ABNT NBR 16868-1:2020, por analogia (pesquisa RA, 14/10/2026)" },
      fckFace: 12,   // MPa — DECLARADO pelo fabricante, sem laudo (site oficial: "alta resistência de 12MPa", sem dizer de quê; no laudo UFMG foi informado pela empresa, não ensaiado). Só fck do microconcreto da FACE (rigidez), nunca resistência do painel — js/blocokensaio.js DECLARADO
      laje: { tipo: "nenhuma", g: 0, q: 0, vao: 0, uso: "residencial" },     // g = peso próprio + revestimento (kN/m²)
      cobertura: { g: 0.5, q: CARGAS.telhado.q, vao: 0 },
      solo: { tensaoAdm: null, descricao: "" },
      diafragma: null   // null = automático (laje maciça/pré-moldada → sim)
    };
  }
  function mesclar(base, o) {
    if (!o || typeof o !== "object") return base;
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) mesclar(base[k], v);
      else if (v !== undefined) base[k] = v;
    });
    return base;
  }

  /* ------------------------------------------------------------------
   * CONCRETO ARMADO — NBR 6118
   * ------------------------------------------------------------------ */
  function mat(fck, fyk) {
    var fcd = fck / 1.4, fctm = 0.3 * Math.pow(fck, 2 / 3);
    return { fck: fck, fcd: fcd, fyd: fyk / 1.15, fctm: fctm, fctkInf: 0.7 * fctm, fctkSup: 1.3 * fctm, fctd: 0.7 * fctm / 1.4,
      Eci: 5600 * Math.sqrt(fck), Ecs: Math.min(1, 0.8 + 0.2 * fck / 80) * 5600 * Math.sqrt(fck) };
  }
  /* flexão simples, seção retangular, armadura simples; Md em kN·m, b/h/d em m → As em cm² */
  function flexao(Md, b, h, d, fck, fyk) {
    var m = mat(fck, fyk), B = b * 1000, D = d * 1000, H = h * 1000, M = Math.abs(Md) * 1e6;
    var lim = 0.85 * m.fcd * B * 0.8 * 0.45 * D * (D - 0.4 * 0.45 * D);
    var W0 = B * H * H / 6, MdMin = 0.8 * W0 * m.fctkSup;                  // N·mm
    function As(Mx) { var x = 1.25 * D * (1 - Math.sqrt(Math.max(0, 1 - Mx / (0.425 * m.fcd * B * D * D)))); return { x: x, As: Mx / (m.fyd * (D - 0.4 * x)) }; }
    var ok = M <= lim + 1e-6;
    var calc = ok ? As(M) : { x: 0.45 * D, As: NaN };
    var asMinMom = As(Math.min(MdMin, lim)).As, asMinTaxa = 0.0015 * B * H;
    var asMin = Math.max(asMinMom, asMinTaxa);
    return { ok: ok, Md: r3(Md), xd: r3(calc.x / D), As: ok ? r3(Math.max(calc.As, asMin) / 100) : null, AsCalc: ok ? r3(calc.As / 100) : null, AsMin: r3(asMin / 100),
      MdLim: r3(lim / 1e6), MdMin: r3(MdMin / 1e6),
      ref: "NBR 6118 17.2.2 (diagrama retangular 0,8x · 0,85fcd, x/d ≤ 0,45) e 17.3.5.2.1 (As,mín: Md,mín = 0,8 W0 fctk,sup, ρ ≥ 0,15 %)" };
  }
  /* cisalhamento, modelo I; Vd em kN → estribo φ (2 ramos) e espaçamento */
  function cisalhamento(Vd, b, d, fck, fywk, phiEst) {
    var m = mat(fck, 500), B = b * 1000, D = d * 1000, V = Math.abs(Vd) * 1000;
    var VRd2 = 0.27 * (1 - fck / 250) * m.fcd * B * D;
    var Vc = 0.6 * m.fctd * B * D;
    var fywd = Math.min(fywk / 1.15, 435);
    var aswS = Math.max(0, (V - Vc) / (0.9 * D * fywd));                 // mm²/mm
    var aswSmin = 0.2 * m.fctm / fywk * B;
    var ase = 2 * Math.PI * Math.pow(phiEst || 5, 2) / 4;
    var smax = V <= 0.67 * VRd2 ? Math.min(0.6 * D, 300) : Math.min(0.3 * D, 200);
    var s = Math.min(smax, ase / Math.max(aswS, aswSmin));
    return { ok: V <= VRd2, Vd: r3(Vd), VRd2: r3(VRd2 / 1000), Vc: r3(Vc / 1000), aswS: r3(Math.max(aswS, aswSmin) * 1000 / 100), s: r3(Math.floor(s / 10) * 10 / 1000), phi: phiEst || 5,
      ref: "NBR 6118 17.4.2.2 (modelo I: VRd2 = 0,27 αv2 fcd bw d; Vc0 = 0,6 fctd bw d; ρsw,mín = 0,2 fctm/fywk)" };
  }
  /* flecha de viga biapoiada sob carga uniforme (Branson + fluência) — q em kN/m (quase permanente), L em m, As em cm² */
  function flecha(qqp, L, b, h, d, As, fck, lim) {
    var m = mat(fck, 500), B = b * 1000, H = h * 1000, D = d * 1000, A = As * 100, Lm = L * 1000;
    var Ic = B * Math.pow(H, 3) / 12, Mr = 1.5 * m.fctm * Ic / (H / 2);
    var ae = 210000 / m.Ecs;
    var xII = (-ae * A + Math.sqrt(Math.pow(ae * A, 2) + 2 * B * ae * A * D)) / B;
    var III = B * Math.pow(xII, 3) / 3 + ae * A * Math.pow(D - xII, 2);
    var Ma = qqp * L * L / 8 * 1e6;
    var r = Ma > 0 ? Math.min(1, Math.pow(Mr / Ma, 3)) : 1;
    var Ieq = Math.min(Ic, r * Ic + (1 - r) * III);
    var f0 = 5 * (qqp) * Math.pow(Lm, 4) / (384 * m.Ecs * Ieq);          // qqp kN/m = N/mm
    var af = 1.32;                                                        // Δξ = 2 − 0,68 (t0 ≈ 1 mês), ρ' = 0
    var ft = f0 * (1 + af), L0 = lim || { div: 250 }, limite = Math.min(Lm / (L0.div || 250), L0.mm ? L0.mm : Infinity);
    return { ok: ft <= limite, imediata: r2(f0), total: r2(ft), limite: r2(limite), Ieq: r3(Ieq / Ic),
      ref: "NBR 6118 17.3.2.1 (Branson; αf = Δξ/(1+50ρ'), Δξ = 1,32) e Tabela 13.3 (" + (L0.ref || "ℓ/250") + ")" };
  }
  /* flexo-compressão, seção retangular com armadura simétrica em 2 camadas.
     Nd (kN, compressão +), Md (kN·m); b = largura (m), h = altura na direção do momento (m), dl = d' (m).
     Devolve a As TOTAL necessária (cm²). Diagrama retangular simplificado (εcu = 3,5 ‰). */
  function flexoCompressao(Nd, Md, b, h, dl, fck, fyk) {
    var m = mat(fck, fyk), B = b * 1000, H = h * 1000, DL = dl * 1000, N = Nd * 1000, M = Math.abs(Md) * 1e6, Es = 210000;
    function resist(As) {
      var a1 = As / 2, a2 = As / 2;
      function forcas(x) {
        var y = Math.min(0.8 * x, H), Fc = 0.85 * m.fcd * B * y, e1, e2;
        if (x <= H) { e1 = 0.0035 * (x - DL) / x; e2 = 0.0035 * (x - (H - DL)) / x; }
        else { var xc = x - 3 * H / 7; e1 = 0.002 * (x - DL) / xc; e2 = 0.002 * (x - (H - DL)) / xc; }   // domínio 5: pivô C a 3h/7, εc2 = 2 ‰ (revisão)
        var s1 = Math.max(-m.fyd, Math.min(m.fyd, Es * e1)), s2 = Math.max(-m.fyd, Math.min(m.fyd, Es * e2));
        return { N: Fc + a1 * s1 + a2 * s2, M: Fc * (H / 2 - y / 2) + (a1 * s1 - a2 * s2) * (H / 2 - DL) };
      }
      var lo = 1e-3 * H, hi = 20 * H, f;
      if (forcas(hi).N < N) return -1;            // nem toda comprimida resiste
      for (var i = 0; i < 80; i++) { var x = (lo + hi) / 2; f = forcas(x); if (f.N < N) lo = x; else hi = x; }
      return forcas((lo + hi) / 2).M;
    }
    var Ac = B * H, AsMax = 0.04 * Ac, lo = 0, hi = AsMax;
    if (resist(AsMax) < M) return { ok: false, As: null, motivo: "Seção insuficiente mesmo com 4 % de armadura." };
    for (var i = 0; i < 60; i++) { var a = (lo + hi) / 2; if (resist(a) >= M) hi = a; else lo = a; }
    var asMin = Math.max(0.15 * N / m.fyd, 0.004 * Ac);
    return { ok: true, AsCalc: r3(hi / 100), AsMin: r3(asMin / 100), As: r3(Math.max(hi, asMin) / 100),
      ref: "NBR 6118 17.2 (flexo-compressão, diagrama retangular) e 17.3.5.3.1 (As,mín = 0,15 Nd/fyd ≥ 0,4 % Ac)" };
  }
  /* placa retangular simplesmente apoiada nos 4 lados sob carga uniforme q (kN/m²): Navier.
     a = vão horizontal (x), b = vão vertical (y). Devolve coeficientes e momentos no centro (kN·m/m)
     e o coeficiente de flecha w0 = cw·q·b⁴/D. */
  function placaNavier(a, b, q, nu) {
    nu = nu == null ? 0.2 : nu;
    var sw = 0, sx = 0, sy = 0, PI = Math.PI;
    for (var mm = 1; mm <= 99; mm += 2) for (var n = 1; n <= 99; n += 2) {
      var s = (((mm - 1) / 2 + (n - 1) / 2) % 2 === 0) ? 1 : -1;
      var A = (mm / a) * (mm / a), Bq = (n / b) * (n / b), den = mm * n * (A + Bq) * (A + Bq);
      sw += s / den; sx += s * (A + nu * Bq) / den; sy += s * (Bq + nu * A) / den;
    }
    var Mx = 16 * q / Math.pow(PI, 4) * sx, My = 16 * q / Math.pow(PI, 4) * sy;
    var wD = 16 * q / Math.pow(PI, 6) * sw;           // w0 = wD / D
    return { a: a, b: b, q: q, Mx: Mx, My: My, wSobreD: wD, ref: "Placa simplesmente apoiada, solução de Navier (Timoshenko & Woinowsky-Krieger, Theory of Plates and Shells, cap. 5), ν = " + nu };
  }

  /* ------------------------------------------------------------------
   * VENTO
   * Correções da revisão independente (14/10/2026):
   *  · as QUATRO direções (todasDirecoes) — só 0°/90° deixava fundo e
   *    direita só com sucção (0,8 em vez de 0,9);
   *  · faces PERMEÁVEIS ("misto"): casa com janela que abre não é estanque
   *    (6.2.6 exige janelas fixas); com 6.2.5 o coeficiente sobe;
   *  · faixas de BORDA da vedação (cpe médio, 6.1.2) entram no máximo da face;
   *  · os avisos do motor de vento vão para o memorial;
   *  · fachada usa a PIOR face (os nomes frente/fundo do acovento não
   *    casam com os da planta — escolher pela pior é o lado seguro).
   * ------------------------------------------------------------------ */
  function vento(obra, P, memoria, avisos) {
    var ed = obra.edificacao || {}, V = P.vento;
    var out = { ok: false, qVed: null, porFace: {}, interna: null, fonte: "" };
    if (V.q != null && isFinite(+V.q)) {
      out.ok = true; out.qVed = +V.q; out.fonte = "q informado pelo usuário";
      out.porFace = { frente: 1.0 * V.q, fundo: 1.0 * V.q, esquerda: 1.0 * V.q, direita: 1.0 * V.q }; out.interna = 0.5 * V.q; out.externa = 1.0 * V.q;
      memoria.push({ passo: "Vento — pressão de projeto informada", formula: "p = q · Δcp, Δcp = 1,0 (externa) e 0,5 (interna)", resultado: br(V.q) + " kN/m²", referencia: "informado" });
      avisos.push("Pressão de vento informada à mão — confira com a NBR 6123.");
      return out;
    }
    if (!AV()) { avisos.push("Motor de vento indisponível: informe q (kN/m²)."); return out; }
    var a = num(ed.comprimento, 10), b = num(ed.largura, 8), h = num(ed.altura, 3), inc = num(ed.inclinacaoGraus, 17);
    var ent = {
      local: { v0: V.v0, lat: ed.lat, lon: ed.lon, descricao: ed.local || "" }, s1: V.s1 || { tipo: "plano" }, categoria: V.categoria || "IV", grupoS3: V.grupoS3 || 2,
      geometria: { a: Math.max(a, b), b: Math.min(a, b), h: h, hCumeeira: h + Math.min(a, b) / 2 * Math.tan(inc * Math.PI / 180), inclinacaoGraus: inc, cobertura: "duas-aguas" },
      faces: { frente: { vedacao: "misto" }, fundo: { vedacao: "misto" }, esquerda: { vedacao: "misto" }, direita: { vedacao: "misto" } }
    };
    var r;
    try { r = AV().calcular(ent, { isopletas: (typeof self !== "undefined" && self.AcoIsopletas) || null, todasDirecoes: true }); } catch (e) { r = { ok: false, erros: [String(e && e.message || e)] }; }
    if (!r || !r.ok) { avisos.push("Vento não calculado: " + ((r && r.erros && r.erros.join("; ")) || "falta V0 ou a localização da obra") + "."); return out; }
    /* só os avisos que dizem respeito às PAREDES (os de beiral/telhado/galpão são do telhado) */
    (r.avisos || []).forEach(function (x) { if (!/beiral|Tabela 5|Tabela 6|cobertura|telhado|galp/i.test(String(x))) avisos.push("Vento: " + semNotaInterna(x)); });
    var qv = r.qVedacao != null ? r.qVedacao : r.q;
    var maxF = { frente: 0, fundo: 0, esquerda: 0, direita: 0 }, cpis = [];
    (r.casos || []).forEach(function (c) {
      cpis.push(num(c.cpi));
      var pp = (c.pressao && c.pressao.paredes) || {};
      Object.keys(pp).forEach(function (f) { (pp[f] || []).forEach(function (z) { var k = Math.abs(num(z.coef)); if (k > maxF[f]) maxF[f] = k; }); });
    });
    var locais = (r.zonas && r.zonas.locais && r.zonas.locais.paredes) || {}, maxLoc = 0;
    Object.keys(maxF).forEach(function (f) {
      var pl = 0; (locais[f] || []).forEach(function (z) { pl = Math.max(pl, Math.abs(num(z.pVedacao != null ? z.pVedacao : z.p))); });
      out.porFace[f] = r3(Math.max(qv * maxF[f], pl)); maxLoc = Math.max(maxLoc, pl);
    });
    var dcpi = cpis.length ? Math.max.apply(null, cpis) - Math.min.apply(null, cpis) : 0.5;
    out.interna = r3(qv * Math.max(dcpi, 0.3));
    out.externa = Math.max.apply(null, Object.keys(out.porFace).map(function (f) { return out.porFace[f]; }));
    out.ok = true; out.qVed = r3(qv); out.v0 = r.v0; out.vk = r.vk; out.coef = maxF; out.dcpi = r3(dcpi); out.bordaLocal = r3(maxLoc);
    out.fonte = NORMAS.nbr6123;
    (r.memoria || []).slice(0, 12).forEach(function (m) { memoria.push({ passo: "Vento — " + m.passo, formula: m.formula, valores: m.valores, resultado: m.resultadoTexto || (m.resultado + " " + (m.unidade || "")), referencia: semNotaInterna(m.referencia + " (" + (m.edicao || "") + ")").replace(/\s*\(\s*\)$/, "") }); });
    memoria.push({ passo: "Vento — pressão característica na vedação", formula: "p = máx[q(vedação) · máx|cpe − cpi| da face, nas 4 direções; faixas de borda com o cpe médio (6.1.2)]; faces permeáveis (6.2.5)", valores: "q = " + br(qv, 3) + " kN/m²",
      resultado: "fachadas (pior face) " + br(out.externa, 3) + " kN/m²; paredes internas q·Δcpi = " + br(out.interna, 3) + " kN/m²", referencia: NORMA.nbr6123 });
    return out;
  }

  /* arranjo das barras numa camada (NBR 6118 18.3.2.2: ah ≥ 20 mm, φ, 1,2 dmáx).
     Tenta a bitola pedida e as maiores; devolve n, φ e se coube. b em m. */
  function arranjo(As, b, cobMm, phiEst, bitolas, nMin, dmax) {
    var ultimo = null;
    for (var i = 0; i < bitolas.length; i++) {
      var phi = bitolas[i], n = nBarras(As, phi, nMin), ah = Math.max(20, phi, 1.2 * (dmax || 9.5));
      var larg = 2 * cobMm + 2 * phiEst + n * phi + (n - 1) * ah;
      ultimo = { n: n, phi: phi, cabe: larg <= b * 1000 + 1e-6, largura: r2(larg) };
      if (ultimo.cabe) return ultimo;
    }
    return ultimo;
  }
  function txtArr(a) { var a1 = Math.PI * a.phi * a.phi / 400; return a.n + " φ" + String(a.phi).replace(".", ",") + " (" + br(a.n * a1, 2) + " cm²)"; }

  /* ------------------------------------------------------------------
   * PAREDE A PAREDE
   * ctx = { gLajeM, qLajeM, gCobM, qCobM } — carga UNIFORME por metro de parede
   * de apoio (área × carga ÷ Σ comprimento de apoio): garante o equilíbrio;
   * cada parede usa o MAIOR entre isto e vão/2 (lado seguro).
   * ------------------------------------------------------------------ */
  function calcularParede(w, obra, P, V, memoria, pend, ctx) {
    ctx = ctx || {};
    var esp = BX().espCm(w.espessura), cat = BX().CATALOGO[esp];
    var apoiaLaje = !!w.apoiaLaje, apoiaCob = !!w.apoiaCobertura, recebe = apoiaLaje || apoiaCob;
    var cw = cat.concreto, cwOk = cw >= 0.10 - 1e-9;
    var cfgW = clone(w.cfg || {});
    var estrutural = recebe && cw >= 0.14 - 1e-9;
    if (estrutural) { cfgW.pilarete = cfgW.pilarete || {}; if (!(cfgW.pilarete.largura >= 0.24)) cfgW.pilarete.largura = Math.max(0.25, Math.ceil(0.036 / cw * 100) / 100); }
    var pag = BX().paginar(w, cfgW);
    var res = { id: pag.id, nome: w.nome || "", espessura: esp, pag: pag, erros: [], avisos: [], verif: [] };
    if (!pag.ok) { res.erros.push("Parede sem dimensão."); return res; }
    var H = pag.alturaUtil, L = pag.comprimento;
    var interna = w.face === "interna" || (!w.externa && w.face !== "maior" && !/frente|fundo|esquerda|direita/.test(String(w.face || "")));
    var pk = num(interna ? V.interna : V.externa, 0);
    var pd = COMB.gw * pk;
    res.vento = { face: interna ? "interna" : "fachada (pior face)", pk: r3(pk), pd: r3(pd) };

    // ---- cargas verticais no topo (característica, kN/m) ----
    var lj = P.laje, cb = P.cobertura, gTop = 0, qTop = 0, temLaje = lj.tipo !== "nenhuma";
    if (apoiaLaje && temLaje) {
      gTop += Math.max(num(lj.g) * num(lj.vao) / 2, num(ctx.gLajeM)); qTop += Math.max(num(lj.q) * num(lj.vao) / 2, num(ctx.qLajeM));
      if (cb.sobreLaje !== false && num(cb.vao) > 0) { gTop += Math.max(num(cb.g) * num(cb.vao) / 2, num(ctx.gCobM)); qTop += Math.max(num(cb.q) * num(cb.vao) / 2, num(ctx.qCobM)); }
    } else if (apoiaCob) { gTop += Math.max(num(cb.g) * num(cb.vao) / 2, num(ctx.gCobM)); qTop += Math.max(num(cb.q) * num(cb.vao) / 2, num(ctx.qCobM)); }
    if (w.cargaTopo) { gTop += num(w.cargaTopo.g); qTop += num(w.cargaTopo.q); }
    res.topo = { g: r3(gTop), q: r3(qTop) };
    if (recebe && !estrutural) {
      res.erros.push("A parede " + pag.id + " (Blocok " + esp + " cm) recebe " + (apoiaLaje ? "laje" : "cobertura") + ", mas o pilar embutido tem " + Math.round(cw * 100) + " cm — abaixo do mínimo de 14 cm da NBR 6118 (13.2.3). Saídas: usar Blocok 20 cm (pilar de 15 cm) nas paredes de apoio, pilar convencional de concreto, ou apoiar a laje/cobertura em outra estrutura.");
    }
    /* PEÇA FINA (10 e 13 cm: concreto embutido de 0 e 8 cm). Abaixo de 10 cm não há
       viga (NBR 6118 13.2.2, mínimo absoluto) nem pilarete armado que caiba com o
       cobrimento. A parede só vale como divisória SEM vão, entre paredes travadas,
       encunhada sob a laje — o resto é erro com a saída (achado CRÍTICO da revisão:
       a de 10 cm saía aprovada sem estrutura nenhuma). */
    if (!cwOk) {
      var motivoFina = "Blocok " + esp + " cm (concreto embutido de " + Math.round(cw * 100) + " cm, abaixo do mínimo absoluto de 10 cm da NBR 6118 13.2.2)";
      if (pag.reforcos.vergas.length) res.erros.push("Parede " + pag.id + ": " + motivoFina + " não comporta verga armada — use Blocok 15 ou 20 nas paredes com porta/janela.");
      if (pag.reforcos.pilaretes.length) res.erros.push("Parede " + pag.id + ": " + motivoFina + " não comporta pilarete armado (" + pag.reforcos.pilaretes.map(function (p) { return p.id + " — " + p.motivo; }).join("; ") + "). A divisória fina tem de terminar em paredes nas duas pontas e ter até 4,0 m.");
      if (pag.reforcos.cintas.length) res.erros.push("Parede " + pag.id + ": " + motivoFina + " não comporta cinta armada — use o topo encunhado sob a laje (divisória) ou peça de 15/20 cm.");
    }
    // problemas de paginação que ferem a Diretriz SiNAT 019 reprovam a parede
    (pag.validacao.problemas || []).forEach(function (q) {
      if (q.tipo === "transpasse") res.erros.push("Parede " + pag.id + ", fiada " + q.fiada + ": junta com transpasse de " + br(q.defasagem * 100, 1) + " cm (mínimo " + br(q.minimo * 100, 1) + " cm, SiNAT 019) — ajustar a paginação.");
      else if (q.tipo === "espacamento-estrutura") res.erros.push("Parede " + pag.id + ": trecho de " + br(q.vao) + " m sem elemento estrutural (máximo 4,0 m, SiNAT 019).");
    });
    pag.avisos.forEach(function (a) { if (res.avisos.indexOf(a) < 0) res.avisos.push(a); });

    // ---- 1. PAINEL (vedação) ao vento: campos entre elementos estruturais ----
    var xs = cwOk ? pag.reforcos.pilaretes.map(function (p) { return { c: p.x + p.w / 2, w: p.w }; }) : [];
    if (pag.ini.tipo !== "livre") xs.push({ c: 0, w: 0 });
    if (pag.fim.tipo !== "livre") xs.push({ c: L, w: 0 });
    xs.sort(function (a, b) { return a.c - b.c; });
    var hc = (pag.reforcos.cintas[0] && pag.reforcos.cintas[0].h) || 0;
    var bVert = Math.max(0.3, H - hc);
    var painel = { vaoHorizontal: 0, vaoVertical: r3(bVert), MSdX: 0, MSdY: 0 };
    var campos = [];
    for (var i = 0; i < xs.length - 1; i++) campos.push({ x0: xs[i].c + xs[i].w / 2, x1: xs[i + 1].c - xs[i + 1].w / 2 });
    if (!campos.length) campos.push({ x0: 0, x1: L, umaDirecao: true });          // sem apoio lateral: faixa vertical
    campos.forEach(function (cp) {
      var a = cp.x1 - cp.x0; if (a <= 0.1) return;
      var pl = cp.umaDirecao ? { Mx: 0, My: pd * bVert * bVert / 8 } : placaNavier(a, bVert, pd, 0.2);
      /* janela pequena (< 1,20 m) dentro do campo, sem pilarete: a abertura é EMOLDURADA
         por verga e contraverga de concreto armado, que levam o vento do vão às faixas ao
         lado. Modelo: a placa inteira com a carga em TODA a área (o vento da janela
         incluído) × fator de abertura (parâmetro RA 1,25). Tratar as bordas do vão como
         livres (1ª versão) fazia o momento CRESCER quando os pilaretes se aproximavam. */
      var furo = 0; pag.vaos.forEach(function (v) { if (v.x > cp.x0 - 1e-6 && v.x + v.w < cp.x1 + 1e-6) furo += v.w; });
      var kAb = furo > 0 ? num(P.fatorAbertura, 1.25) : 1;
      var My = pl.My * kAb; if (furo > 0) { pl = { Mx: pl.Mx * kAb, My: My, wSobreD: pl.wSobreD }; painel.comAbertura = true; painel.fatorAbertura = kAb; }
      if (pl.Mx > painel.MSdX) painel.MSdX = pl.Mx;
      if (My > painel.MSdY) { painel.MSdY = My; }
      if (a > painel.vaoHorizontal) painel.vaoHorizontal = a;
    });
    painel.MSdX = r3(painel.MSdX); painel.MSdY = r3(painel.MSdY); painel.vaoHorizontal = r3(painel.vaoHorizontal);
    if (painel.vaoHorizontal > 0.1) {
      /* RESISTÊNCIA DO PAINEL — decisão do Rogério (14/10/2026): sem ensaio do
         fabricante, o sistema faz o ENSAIO SIMULADO pelos materiais (js/blocokensaio.js)
         e segue; o valor do fabricante, quando informado, vale por cima. */
      var ens = EN() ? EN().simular(esp, { H: bVert, pesoKgPeca: cat.peso, param: P.ensaio || null }) : null;
      var fab = P.painel.MRdX != null && P.painel.MRdY != null;
      painel.ensaio = ens ? { MRdX: ens.flexao.MRdX, MRdY: ens.flexao.MRdY, VRd: ens.flexao.VRd, NRd: ens.compressao.NRd, governaX: ens.flexao.governaX, governaY: ens.flexao.governaY, governaN: ens.compressao.governa, modos: ens.flexao.modos, modosN: ens.compressao.modos, memoria: ens.memoria, fonte: ens.fonte } : null;
      painel.MRdX = fab ? +P.painel.MRdX : (ens ? ens.flexao.MRdX : 0);
      painel.MRdY = fab ? +P.painel.MRdY : (ens ? ens.flexao.MRdY : 0);
      painel.VRd = P.painel.VRd != null ? +P.painel.VRd : (ens ? ens.flexao.VRd : Infinity);
      painel.NRd = P.painel.NRd != null ? +P.painel.NRd : (ens ? ens.compressao.NRd : Infinity);
      painel.fonte = fab ? ("ensaio do fabricante" + (P.painel.fonte ? " — " + P.painel.fonte : "")) : "ensaio simulado RA (materiais da peça)";
      /* cisalhamento no núcleo: reação da faixa mais carregada */
      painel.VSd = r3(pd * Math.max(bVert, painel.vaoHorizontal) / 2 * (painel.comAbertura ? 1.5 : 1));
      /* contato com a cinta: mesmo que o painel recebesse TODA a carga do topo, resiste? */
      painel.NSd = r3(COMB.gg * gTop + COMB.gq * qTop);
      var okM = painel.MSdX <= painel.MRdX + 1e-9 && painel.MSdY <= painel.MRdY + 1e-9, okV = painel.VSd <= painel.VRd + 1e-9, okN = painel.NSd <= painel.NRd + 1e-9;
      painel.verificacoes = { flexaoX: painel.MSdX <= painel.MRdX + 1e-9, flexaoY: painel.MSdY <= painel.MRdY + 1e-9, cisalhamento: okV, compressao: okN };
      painel.status = (okM && okV && okN) ? "atende" : "nao-atende";
      if (painel.status === "nao-atende") res.erros.push("Painel da parede " + pag.id + " (" + painel.fonte + "): " +
        (!okM ? "flexão M = " + br(painel.MSdX, 3) + " / " + br(painel.MSdY, 3) + " kN·m/m acima de " + br(painel.MRdX, 3) + " / " + br(painel.MRdY, 3) + "; " : "") +
        (!okV ? "cisalhamento " + br(painel.VSd, 2) + " > " + br(painel.VRd, 2) + " kN/m; " : "") +
        (!okN ? "compressão por contato " + br(painel.NSd, 1) + " > " + br(painel.NRd, 1) + " kN/m; " : "") + "aproxime os pilaretes ou acrescente cinta intermediária.");
      // deslocamento (NBR 15575-4: h/350, 0,9 G + 0,8 W) — flexão (EI do sanduíche) + cisalhamento do núcleo (S)
      var t = 0.015, dd = cat.esp - t;
      var Eface = P.analogia.Eface || (Math.min(1, 0.8 + 0.2 * P.fckFace / 80) * 5600 * Math.sqrt(P.fckFace) * 1000); // kN/m²
      var EI = P.painel.EI || (ens ? ens.rigidez.EI : Eface * 2 * t * Math.pow(dd / 2, 2));   // kN·m²/m
      var S = ens ? ens.rigidez.S : Infinity;
      var wS = 0;
      campos.forEach(function (cp) {
        var a = cp.x1 - cp.x0; if (a <= 0.1) return;
        var qS = 0.8 * pk, curto = Math.min(a, bVert);
        var wb = cp.umaDirecao ? 5 * qS * Math.pow(bVert, 4) / 384 / EI : placaNavier(a, bVert, qS, 0.2).wSobreD / EI;
        var ws = isFinite(S) ? qS * curto * curto / (8 * S) : 0;
        if (wb + ws > wS) wS = wb + ws;
      });
      painel.flecha = wS; painel.flechaMm = Math.round(wS * 1e6) / 1000; painel.flechaLim = r4(bVert / 350);
      painel.flechaOk = painel.flecha <= painel.flechaLim; painel.EI = r3(EI); painel.S = isFinite(S) ? r3(S) : null;
      if (!painel.flechaOk) res.erros.push("Painel da parede " + pag.id + ": deslocamento de " + br(painel.flechaMm, 2) + " mm acima de h/350 = " + br(painel.flechaLim * 1000, 1) + " mm (NBR 15575-4).");
    }
    res.painel = painel;

    // ---- 2. VERGAS ----
    /* parede interna: uma classe de agressividade mais branda (NBR 6118:2014,
       Tabela 6.1, nota a — ambientes internos secos) */
    var caaEf = (interna && P.caaInternaMaisBranda !== false) ? ({ I: "I", II: "I", III: "II", IV: "III" }[P.caa] || P.caa) : P.caa;
    var m = mat(P.fck, P.fyk), cob = COBR[caaEf] || 30;
    res.caa = caaEf; res.cobrimento = cob;
    var LIM_ALV = { div: 500, mm: 10, ref: "NBR 6118 Tabela 13.3 — paredes de alvenaria após a construção: ℓ/500 e 10 mm" };
    var pesoM2 = cat.peso / 0.81 * 0.00981;      // kN/m² do painel
    var vergas = [];
    function dUtil(h, phi) { return h - (cob + P.estribo + phi / 2) / 1000; }
    pag.reforcos.vergas.forEach(function (v) {
      if (!cwOk) return;
      var hv = v.h, b = cw;
      var vao = v.vaoW, lef = vao + 2 * Math.min(v.apoio / 2, 0.3 * hv);
      var alturaAcima = Math.max(0, (pag.reforcos.cintas[0] ? pag.reforcos.cintas[0].y : H) - (v.y + hv));
      var qk = v.naCinta ? qTop : 0;
      function tentar(hh) {
        var d = dUtil(hh, P.barraViga), gk = pesoM2 * alturaAcima + GAMA.concretoArmado * b * hh + (v.naCinta ? gTop : 0);
        var qd = COMB.gg * gk + COMB.gq * qk, Md = qd * lef * lef / 8, Vd = qd * lef / 2;
        var f = d > 0.02 ? flexao(Md, b, hh, d, P.fck, P.fyk) : { ok: false, As: null };
        var c = d > 0.02 ? cisalhamento(Vd, b, d, P.fck, P.fywk, P.estribo) : { ok: false };
        var fl = f.ok ? flecha(gk + 0.3 * qk, lef, b, hh, d, f.As, P.fck, LIM_ALV) : null;
        var arr = f.ok ? arranjo(f.As, b, cob, P.estribo, [P.barraViga, 10, 12.5, 16], 2) : null;
        return { h: hh, d: d, gk: gk, Md: Md, Vd: Vd, f: f, c: c, fl: fl, arr: arr, ok: !!(f.ok && c.ok && fl && fl.ok && arr && arr.cabe && c.s >= 0.05) };
      }
      var tt = tentar(hv), h0 = hv;
      for (var hh = hv + 0.05; !tt.ok && hh <= 0.451; hh += 0.05) { var t2 = tentar(hh); if (t2.ok) { tt = t2; break; } }
      var item = { id: v.id, vao: r3(vao), lef: r3(lef), b: b, h: h0, d: r3(tt.d), gk: r3(tt.gk), qk: r3(qk), Md: r3(tt.Md), Vd: r3(tt.Vd), flexao: tt.f, cisalhamento: tt.c, flecha: tt.fl, viga: !!v.viga, naCinta: !!v.naCinta };
      if (tt.h > h0 + 1e-9) item.hRecomendada = r3(tt.h);
      item.ok = tt.ok;
      item.armadura = tt.arr ? txtArr(tt.arr) + (tt.arr.cabe ? "" : " — não cabe numa camada") : null;
      item.arranjo = tt.arr;
      vergas.push(item);
      if (!item.ok) res.erros.push("Verga " + v.id + " (vão " + br(vao) + " m) não passa nem com 45 cm de altura (flexão, cisalhamento, flecha ℓ/500 ou alojamento das barras) — prever viga com pilares nas bordas.");
      if (b < 0.12 - 1e-9) res.avisos.push("Verga/cinta com " + Math.round(b * 100) + " cm de largura: a NBR 6118 (13.2.2) só admite abaixo de 12 cm em caso excepcional, com alojamento das armaduras e concretagem/vibração garantidos.");
    });
    res.vergas = vergas;

    // ---- 3. CINTA DE RESPALDO (viga contínua sobre os pilaretes) ----
    var cintaV = null;
    if (pag.reforcos.cintas.length && cwOk) {
      var ct = pag.reforcos.cintas[0], hcinta = ct.h;
      var sp = 0; for (var k = 0; k < xs.length - 1; k++) sp = Math.max(sp, xs[k + 1].c - xs[k].c);
      if (!sp) sp = L;
      var continua = xs.length >= 3;
      var qkC = qTop;
      function tentarC(hh) {
        var d = dUtil(hh, P.barraViga), gk = GAMA.concretoArmado * cw * hh + gTop, qd = COMB.gg * gk + COMB.gq * qkC;
        var Md = qd * sp * sp / 8, Mneg = continua ? qd * sp * sp / 10 : 0;   // +: biapoiado (lado seguro); −: apoio interno de viga contínua
        var f = d > 0.02 ? flexao(Md, cw, hh, d, P.fck, P.fyk) : { ok: false };
        var fn = Mneg > 0 && d > 0.02 ? flexao(Mneg, cw, hh, d, P.fck, P.fyk) : null;
        var c = d > 0.02 ? cisalhamento(qd * sp / 2, cw, d, P.fck, P.fywk, P.estribo) : { ok: false };
        var fl = f.ok ? flecha(gk + 0.3 * qkC, sp, cw, hh, d, f.As, P.fck, LIM_ALV) : null;
        var arr = f.ok ? arranjo(f.As, cw, cob, P.estribo, [P.barraViga, 10, 12.5, 16], 2) : null;
        var arrN = fn && fn.ok ? arranjo(fn.As, cw, cob, P.estribo, [P.barraViga, 10, 12.5, 16], 2) : null;
        var ok = !!(f.ok && c.ok && fl && fl.ok && arr && arr.cabe && (!fn || (fn.ok && arrN && arrN.cabe)) && c.s >= 0.05);
        return { h: hh, d: d, gk: gk, Md: Md, Mneg: Mneg, f: f, fn: fn, c: c, fl: fl, arr: arr, arrN: arrN, ok: ok };
      }
      var tc = tentarC(hcinta);
      if (recebe) for (var h2 = hcinta + 0.05; !tc.ok && h2 <= 0.601; h2 += 0.05) { var t3 = tentarC(h2); if (t3.ok) { tc = t3; break; } }
      cintaV = { vaoEntrePilaretes: r3(sp), continua: continua, h: hcinta, gk: r3(tc.gk), qk: r3(qkC), Md: r3(tc.Md), MdNeg: r3(tc.Mneg), flexao: tc.f, flexaoNeg: tc.fn, cisalhamento: tc.c, flecha: tc.fl, arranjo: tc.arr, arranjoNeg: tc.arrN };
      if (tc.h > hcinta + 1e-9) cintaV.hRecomendada = r3(tc.h);
      // vento na cinta (reação do painel) — só sem diafragma no topo
      var diaf = P.diafragma != null ? !!P.diafragma : (lj.tipo === "macica" || lj.tipo === "pre-moldada" || lj.tipo === "trelicada");
      cintaV.diafragma = diaf;
      var hFinal = tc.h;
      if (!diaf) {
        var Lh = L, Rw = pd * bVert / 2;                     // kN/m (já de cálculo)
        var MdH = Rw * Lh * Lh / 8, dH = cw - (cob + P.estribo + P.barraViga / 2) / 1000;
        var fH = dH > 0.02 ? flexao(MdH, hFinal, cw, dH, P.fck, P.fyk) : { ok: false };
        cintaV.ventoHorizontal = { vao: r3(Lh), Rd: r3(Rw), Md: r3(MdH), flexao: fH, arranjo: fH.ok ? arranjo(fH.As, hFinal, cob, P.estribo, [P.barraViga, 10, 12.5], 1) : null };
        if (!fH.ok || !cintaV.ventoHorizontal.arranjo.cabe) res.erros.push("Cinta de " + pag.id + " sem diafragma no topo (sem laje) não vence o vento entre as paredes transversais (" + br(Lh) + " m). Saídas: laje ou forro estruturado travando o topo, parede transversal intermediária, ou cinta mais larga.");
      }
      cintaV.ok = !!(tc.ok && (!cintaV.ventoHorizontal || (cintaV.ventoHorizontal.flexao.ok && cintaV.ventoHorizontal.arranjo && cintaV.ventoHorizontal.arranjo.cabe)));
      cintaV.armadura = tc.arr ? "inferior " + txtArr(tc.arr) + (tc.arrN ? " · superior nos apoios " + txtArr(tc.arrN) : "") + (cintaV.ventoHorizontal && cintaV.ventoHorizontal.arranjo ? " · lateral " + txtArr(cintaV.ventoHorizontal.arranjo) + " por face" : "") : null;
      if (recebe && !tc.ok) res.erros.push("Cinta de " + pag.id + " não passa nem com 60 cm de altura (flexão, cisalhamento, flecha ℓ/500 e 10 mm, alojamento das barras) — aproxime os pilares.");
    }
    res.cinta = cintaV;

    // ---- 4. PILARETES ----
    var pils = [];
    pag.reforcos.pilaretes.forEach(function (p) {
      if (!cwOk) return;
      var c = p.x + p.w / 2;
      var esq = xs.filter(function (z) { return z.c < c - 1e-6; }).pop(), dir = xs.filter(function (z) { return z.c > c + 1e-6; })[0];
      var trib = ((esq ? c - esq.c : 0) + (dir ? dir.c - c : 0)) / 2;
      var qwk = pk * trib;                                      // kN/m ao longo da altura (CARACTERÍSTICO)
      var Mwk = qwk * H * H / 8;                                // γf só nas combinações (revisão: o 1,4 entrava duas vezes)
      /* N: laje/telhado + peso da cinta na faixa + reação das vergas que apoiam neste pilarete */
      var hcF = cintaV ? (cintaV.hRecomendada || cintaV.h) : 0;
      var Ngk = gTop * trib + GAMA.concretoArmado * cw * hcF * trib, Nqk = qTop * trib;
      vergas.forEach(function (vv) {
        var ref = pag.reforcos.vergas.filter(function (z) { return z.id === vv.id; })[0]; if (!ref) return;
        var bordaE = ref.x + ref.apoio, bordaD = ref.x + ref.w - ref.apoio;
        if (Math.abs(c - bordaE) <= ref.apoio + p.w || Math.abs(c - bordaD) <= ref.apoio + p.w) { Ngk += vv.gk * vv.lef / 2; Nqk += vv.qk * vv.lef / 2; }
      });
      var bP = p.w, hP = cw, dl = (cob + P.estribo + P.barraPilar / 2) / 1000;
      var it = { id: p.id, motivo: p.motivo, trib: r3(trib), b: r3(bP), h: r3(hP), qwk: r3(qwk), qwd: r3(COMB.gw * qwk), Mvento: r3(Mwk), Nk: r3(Ngk + Nqk), Ngk: r3(Ngk), Nqk: r3(Nqk), estrutural: estrutural };
      if (hP - 2 * dl < 0.02) { it.ok = false; res.erros.push("Pilarete " + p.id + ": " + Math.round(hP * 100) + " cm de concreto não dão braço de alavanca com o cobrimento de " + cob + " mm (CAA " + caaEf + ")."); pils.push(it); return; }
      if (estrutural) {
        var gn = hP * 100 >= 19 ? 1.0 : 1.95 - 0.05 * Math.round(hP * 100);
        var area = bP * hP * 1e4;
        if (area < 360 - 1e-6) res.erros.push("Pilar " + p.id + " com " + Math.round(area) + " cm² (< 360 cm², NBR 6118 13.2.3).");
        // combinações NBR 8681: (a) vento principal; (b) carga principal; (c) G favorável + vento
        var combos = [
          { nome: "1,4G + 1,4(W + 0,5Q)", N: COMB.gg * Ngk + COMB.gq * COMB.psi0Q * Nqk, M: COMB.gw * Mwk },
          { nome: "1,4G + 1,4(Q + 0,6W)", N: COMB.gg * Ngk + COMB.gq * Nqk, M: COMB.gq * COMB.psi0W * Mwk },
          { nome: "1,0G + 1,4W", N: COMB.ggFav * Ngk, M: COMB.gw * Mwk }
        ];
        var le = H, lam = 3.46 * le / hP, piores = null;
        combos.forEach(function (cbn) {
          var Nd = cbn.N * gn, M1 = cbn.M * gn;
          var Mmin = Nd * (0.015 + 0.03 * hP);
          var M1d = Math.max(M1, Mmin);
          var e1 = Nd > 0 ? M1d / Nd : 0, lam1 = Math.max(35, Math.min(90, 25 + 12.5 * e1 / hP));
          var Mtot = M1d;
          if (lam > lam1 && Nd > 0) {
            var nu = Nd / (bP * hP * m.fcd * 1000), inv = Math.min(0.005 / (hP * (nu + 0.5)), 0.005 / hP);
            Mtot = Math.max(M1d, M1d + Nd * le * le / 10 * inv);
          }
          var fx = flexoCompressao(Nd, Mtot, bP, hP, dl, P.fck, P.fyk);
          var o = { nome: cbn.nome, Nd: r3(Nd), M1d: r3(M1d), Md: r3(Mtot), lambda: r2(lam), lambda1: r2(lam1), gn: gn, sec: fx };
          if (!piores || (fx.As == null) || (piores.sec.As != null && fx.As > piores.sec.As)) piores = o;
        });
        it.combos = piores; it.lambda = r2(lam);
        if (lam > 90) res.erros.push("Pilar " + p.id + ": λ = " + br(lam, 0) + " > 90 — fora do método simplificado (NBR 6118 15.8.3.3).");
        it.As = piores.sec.As;
        var arrP = piores.sec.As != null ? arranjo(piores.sec.As / 2, bP, cob, P.estribo, [P.barraPilar, 12.5, 16], 2) : null;   // metade em cada face
        it.ok = !!piores.sec.ok && lam <= 90 && !!(arrP && arrP.cabe);
        it.arranjo = arrP;
        it.armadura = arrP ? (2 * arrP.n) + " φ" + String(arrP.phi).replace(".", ",") + " (" + arrP.n + " por face" + (arrP.cabe ? "" : " — não cabe") + ")" : null;
        it.ref = "NBR 6118 13.2.3 (γn = " + br(gn) + "), 15.8.3.3.2 (pilar-padrão, curvatura aproximada), 18.4.2 (φ ≥ 10 mm, 4 barras)";
      } else {
        // travamento: só vento (flexão simples, eixo fraco), armadura simétrica (o vento inverte)
        var dP = hP - dl, Md0 = COMB.gw * Mwk;
        var f0 = flexao(Md0, bP, hP, dP, P.fck, P.fyk);
        var c0 = cisalhamento(COMB.gw * qwk * H / 2, bP, dP, P.fck, P.fywk, P.estribo);
        var arr0 = f0.ok ? arranjo(f0.As, bP, cob, P.estribo, [P.barraPilar, 12.5], 2) : null;
        it.flexao = f0; it.cisalhamento = c0; it.arranjo = arr0;
        it.ok = !!(f0.ok && c0.ok && arr0 && arr0.cabe);
        it.As = f0.ok ? r3(2 * f0.As) : null;
        it.armadura = arr0 ? txtArr(arr0) + " por face" + (arr0.cabe ? "" : " — não cabe") : null;
        it.ref = "Pilarete de travamento (sem carga vertical): flexão simples NBR 6118 17.2, vento nos dois sentidos";
        if (!it.ok) res.erros.push("Pilarete " + p.id + " (travamento) não vence o vento com " + Math.round(hP * 100) + " cm de concreto — aproxime os pilaretes ou use peça mais espessa.");
      }
      pils.push(it);
    });
    res.pilaretes = pils;

    // ---- 5. CARGA NA FUNDAÇÃO (característica, kN/m) ----
    var gParede = pag.quant.pesoTotalKg * 0.00981 / Math.max(L, 0.01);
    res.fundacao = { gParede: r3(gParede), gTopo: r3(gTop), qTopo: r3(qTop), qk: r3(gParede + gTop + qTop), L: r3(L) };

    // ---- resumo da parede ----
    res.ok = res.erros.length === 0 && pils.every(function (p) { return p.ok; }) && vergas.every(function (v) { return v.ok; }) && (!cintaV || cintaV.ok || !recebe);
    // a compra e o orçamento passam a usar o aço CALCULADO
    if (cwOk) {
      var ac = acoCalculado(res, P, pag), q0 = pag.quant;
      q0.acoConstrutivoKg = q0.acoKg; q0.aco = ac.aco; q0.acoKg = ac.kg; q0.acoConstrutivo = false;
    }
    return res;
  }

  /* bitola → nº de barras (texto). As em cm². */
  function nBarras(As, phi, minimo) { var a1 = Math.PI * phi * phi / 400; return Math.max(minimo || 2, Math.ceil((As || 0) / a1 - 1e-9)); }
  function barras(As, phi, minimo) {
    var a1 = Math.PI * phi * phi / 400, n = nBarras(As, phi, minimo);
    return n + " φ" + String(phi).replace(".", ",") + " (" + br(n * a1, 2) + " cm²)";
  }

  /* AÇO CALCULADO → QUANTITATIVO. Sem isto a compra e o orçamento usavam a
     armadura CONSTRUTIVA do motor executivo (2 barras por elemento) enquanto o
     cálculo pedia mais em 23 de 33 elementos da obra exemplo (achado da frente
     de orçamento, 14/10/2026). Contraverga continua construtiva (não é
     calculada). Comprimentos: barra longitudinal = elemento + ancoragem;
     estribo = perímetro interno + 10 cm de ganchos. */
  function acoCalculado(res, P, pag) {
    var MASSA = BX().MASSA, lin = [], kg = 0, cob = (res.cobrimento || COBR[P.caa] || 30) / 1000, cfg = pag.cfg || {};
    var anc = (cfg.aco && cfg.aco.ancoragem) || 0.30, espera = (cfg.pilarete && cfg.pilarete.esperaFundacao) || 0.50;
    function add(elem, n, bit, comp) { var m = n * comp, k = m * (MASSA[bit] || 0); lin.push({ elemento: elem, barras: n, bitola: bit, comprimento: r3(comp), metros: r3(m), kg: r3(k), calculado: true }); kg += k; }
    function estribos(elem, L, s, b, h, bit) {
      if (!(s > 0)) return; var n = Math.ceil(L / s) + 1, per = 2 * (Math.max(0.03, b - 2 * cob) + Math.max(0.03, h - 2 * cob)) + 0.10;
      add("estribos " + elem, n, bit || P.estribo, per);
    }
    var H = pag.alturaUtil;
    (res.pilaretes || []).forEach(function (q) {
      if (q.As == null) return;
      var ap = q.arranjo || { n: q.estrutural ? Math.ceil(nBarras(q.As, P.barraPilar, 4) / 2) : nBarras(q.As / 2, P.barraPilar, 2), phi: P.barraPilar };
      add("pilarete " + q.id, 2 * ap.n, ap.phi, H + espera);
      var sEst = Math.min(0.20, Math.min(q.b, q.h), 12 * ap.phi / 1000);   // NBR 6118 18.4.3
      estribos(q.id, H, sEst, q.b, q.h);
    });
    (res.vergas || []).forEach(function (v) {
      var ref = (pag.reforcos.vergas || []).filter(function (x) { return x.id === v.id; })[0], L = ref ? ref.w : v.lef;
      if (!v.flexao || v.flexao.As == null || v.naCinta) return;     // verga na cinta: a armadura é a da cinta (revisão)
      var av = v.arranjo || { n: nBarras(v.flexao.As, P.barraViga, 2), phi: P.barraViga };
      add((v.viga ? "viga " : "verga ") + v.id, av.n, av.phi, L + 2 * 0.10);
      add("porta-estribo " + v.id, 2, 6.3, L);
      estribos(v.id, L, v.cisalhamento && v.cisalhamento.s, pag.catalogo.concreto, v.hRecomendada || v.h);
    });
    if (res.cinta && res.cinta.flexao && res.cinta.flexao.As != null) {
      var c = res.cinta, ct = pag.reforcos.cintas[0], Lc = ct ? ct.w : pag.comprimento;
      var ai = c.arranjo || { n: nBarras(c.flexao.As, P.barraViga, 2), phi: P.barraViga };
      add("cinta " + (ct ? ct.id : "CR") + " — inferior", ai.n, ai.phi, Lc + 2 * anc);
      if (c.arranjoNeg) add("cinta " + (ct ? ct.id : "CR") + " — superior (negativo)", c.arranjoNeg.n, c.arranjoNeg.phi, Lc + 2 * anc);
      else add("porta-estribo cinta", 2, 6.3, Lc);
      if (c.ventoHorizontal && c.ventoHorizontal.arranjo) add("cinta " + (ct ? ct.id : "CR") + " — lateral (vento)", 2 * c.ventoHorizontal.arranjo.n, c.ventoHorizontal.arranjo.phi, Lc + 2 * anc);
      estribos("cinta", Lc, c.cisalhamento && c.cisalhamento.s, pag.catalogo.concreto, c.hRecomendada || c.h);
    }
    (pag.quant.aco || []).forEach(function (a) { if (/^contraverga/.test(a.elemento)) { lin.push(a); kg += a.kg; } });
    return { aco: lin, kg: r3(kg) };
  }

  /* ------------------------------------------------------------------
   * FUNDAÇÃO — recomendação do tipo (NBR 6122 para o projeto; aqui o
   * pré-dimensionamento e o porquê). A tensão admissível vem da sondagem.
   * ------------------------------------------------------------------ */
  function fundacao(paredes, obra, P, pend) {
    var qMax = 0, soma = 0, Ltot = 0;
    paredes.forEach(function (p) { if (!p.fundacao) return; qMax = Math.max(qMax, p.fundacao.qk); soma += p.fundacao.qk * p.fundacao.L; Ltot += p.fundacao.L; });
    var ed = obra.edificacao || {}, areaPlanta = num(ed.areaPlanta, num(ed.comprimento, 0) * num(ed.largura, 0));
    var s = P.solo.tensaoAdm != null ? +P.solo.tensaoAdm : null;
    var out = { qMax: r3(qMax), cargaTotal: r3(soma), comprimentoParedes: r3(Ltot), areaPlanta: r3(areaPlanta), tensaoAdm: s, recomendacao: "", justificativa: [], ref: "NBR 6122:2022 (projeto e execução de fundações) — o projeto de fundação é específico" };
    if (s == null || !(s > 0)) {
      out.recomendacao = "Definir com a sondagem (SPT)";
      out.justificativa.push("Sem a tensão admissível do solo não se escolhe fundação. Cargas lineares prontas para o projetista: máxima " + br(qMax) + " kN/m; total " + br(soma, 1) + " kN em " + br(Ltot, 1) + " m de parede.");
      pend.push({ chave: "sondagem", texto: "Sondagem SPT (NBR 6484) e tensão admissível do solo para definir a fundação." });
      return out;
    }
    var B = 1.1 * qMax / s;               // 10 % para o peso da própria fundação
    var areaSap = 1.1 * soma / s;
    out.larguraSapata = r3(Math.max(B, 0.30));
    out.taxaOcupacao = areaPlanta > 0 ? r3(areaSap / areaPlanta) : null;
    if (out.taxaOcupacao != null && out.taxaOcupacao > 0.5) {
      out.recomendacao = "Radier";
      out.justificativa.push("As sapatas corridas ocupariam " + Math.round(out.taxaOcupacao * 100) + " % da planta (> 50 %): o radier sai mais simples e distribui melhor.");
    } else if (B <= 0.6) {
      out.recomendacao = "Sapata corrida / viga baldrame";
      out.justificativa.push("Largura necessária " + br(Math.max(B, 0.30)) + " m (q = " + br(qMax) + " kN/m sobre σadm = " + br(s, 0) + " kPa).");
      out.justificativa.push("Parede leve e contínua: a sapata corrida (ou baldrame sobre brocas, se o solo superficial for fraco) segue a linha das paredes. O radier também serve e combina com a rapidez do sistema (piso pronto para a 1ª fiada).");
    } else {
      out.recomendacao = "Radier ou estacas com viga baldrame";
      out.justificativa.push("Largura necessária de " + br(B) + " m: sapata corrida larga demais para parede leve — solo fraco. Radier ou estaca + baldrame.");
    }
    out.justificativa.push("Esperas dos pilaretes ancoradas na fundação; primeira fiada sobre base nivelada (tolerância de nível conforme a montagem).");
    return out;
  }

  /* ------------------------------------------------------------------
   * ORQUESTRADOR
   * ------------------------------------------------------------------ */
  function calcular(obra) {
    obra = obra || {};
    var P = mesclar(padroes(), clone(obra.parametros || {}));
    var memoria = [], avisos = [], pend = [];
    memoria.push({ passo: "Modelo estrutural", formula: "Painel Blocok = vedação (laudos UFMG/LAEES 2022); estrutura = pilaretes, vergas e cintas de concreto armado moldados dentro das peças", resultado: "Diretriz SiNAT 019: elemento estrutural a ≤ 4,0 m; amarração ≥ 33 %", referencia: NORMA.sinat019 });
    memoria.push({ passo: "Materiais", formula: "concreto de preenchimento C" + P.fck + " (fcd = fck/1,4); aço CA-50 (fyd = fyk/1,15); CAA " + P.caa + " → cobrimento " + (COBR[P.caa] || 30) + " mm", resultado: "Ecs = " + br(mat(P.fck, P.fyk).Ecs / 1000, 1) + " GPa", referencia: NORMA.nbr6118 + " — 8.2, 8.3 e Tabela 7.2" });
    if (P.laje.tipo !== "nenhuma") memoria.push({ passo: "Cargas da laje", formula: "g = " + br(P.laje.g) + " kN/m² · q = " + br(P.laje.q) + " kN/m² · vão " + br(P.laje.vao) + " m → reação (g+q)·l/2 por metro de parede de apoio", resultado: br((P.laje.g + P.laje.q) * P.laje.vao / 2) + " kN/m", referencia: NORMA.nbr6120 + " Tabela 10" });
    /* LAJE E TELHADO COM EQUILÍBRIO (revisão): a reação por metro de parede de
       apoio é o MAIOR entre (g+q)·vão/2 e a carga total da planta repartida pelo
       comprimento de apoio — assim a soma das reações nunca fica abaixo da carga. */
    var ed0 = obra.edificacao || {}, area0 = num(ed0.areaPlanta, num(ed0.comprimento, 0) * num(ed0.largura, 0));
    var temLaje0 = P.laje.tipo !== "nenhuma";
    var Lap = 0, Lcob = 0;
    (obra.paredes || []).forEach(function (w) { var L = num(w.comprimento); if (w.apoiaLaje && temLaje0) Lap += L; if (w.apoiaCobertura || (w.apoiaLaje && temLaje0)) Lcob += L; });
    var ctx = {
      gLajeM: Lap > 0 ? num(P.laje.g) * area0 / Lap : 0, qLajeM: Lap > 0 ? num(P.laje.q) * area0 / Lap : 0,
      gCobM: Lcob > 0 && num(P.cobertura.vao) > 0 ? num(P.cobertura.g) * area0 / Lcob : 0, qCobM: Lcob > 0 && num(P.cobertura.vao) > 0 ? num(P.cobertura.q) * area0 / Lcob : 0
    };
    if (temLaje0) memoria.push({ passo: "Reação da laje nas paredes de apoio", formula: "máx[(g+q)·vão/2 ; (g+q)·área/Σ comprimento de apoio] — equilíbrio garantido", valores: "área " + br(area0, 1) + " m² · apoio " + br(Lap, 1) + " m", resultado: "g " + br(Math.max(P.laje.g * P.laje.vao / 2, ctx.gLajeM)) + " · q " + br(Math.max(P.laje.q * P.laje.vao / 2, ctx.qLajeM)) + " kN/m", referencia: NORMA.nbr6120 });
    if (num(P.cobertura.vao) > 0) memoria.push({ passo: "Cargas da cobertura", formula: "g = " + br(P.cobertura.g) + " · q = " + br(P.cobertura.q) + " kN/m² (" + (temLaje0 && P.cobertura.sobreLaje !== false ? "telhado apoiado na laje: vai às paredes que recebem a laje" : "telhado direto nas paredes de apoio") + ")", resultado: "máx[(g+q)·vão/2 ; total/Σ apoio] = " + br(Math.max((P.cobertura.g + P.cobertura.q) * P.cobertura.vao / 2, ctx.gCobM + ctx.qCobM)) + " kN/m", referencia: NORMA.nbr6120 + " 6.4" });
    if (temLaje0 && Lap === 0) avisos.push("Há laje, mas nenhuma parede está marcada como apoio dela — marque as paredes que recebem a laje (aba Paredes).");
    var V = vento(obra, P, memoria, avisos);
    if (!V.ok) { V.porFace = { frente: 0, fundo: 0, esquerda: 0, direita: 0 }; V.interna = 0; pend.push({ chave: "vento", texto: "Localização da obra (ou V0) para calcular o vento pela NBR 6123." }); }
    /* 2ª passada: se o cálculo pediu verga ou cinta mais alta, a paginação é
       refeita com essa altura — a faixa de EPS retirado, o concreto, o aço e
       a prancha têm de sair com a peça que vai ser executada. */
    /* AJUSTE AUTOMÁTICO DO PAINEL: não passou à flexão → pilaretes mais próximos
       (4,0 → 3,0 → 2,4 → 1,8 m) e, se a vertical governar, cinta intermediária a
       meia altura — o que o projetista faria. O que sobrar fica como erro. */
    function calcularComAjuste(w0) {
      var r = calcularParede(w0, obra, P, V, memoria, pend, ctx);
      if (!r.painel || r.painel.status !== "nao-atende") return r;
      var passos = [3.0, 2.4, 1.8], ajuste = null, melhor = r;
      for (var i = 0; i <= passos.length; i++) {
        var w1 = clone(w0); w1.cfg = w1.cfg || {}; w1.cfg.pilarete = w1.cfg.pilarete || {}; w1.cfg.cinta = w1.cfg.cinta || {};
        if (i < passos.length) w1.cfg.pilarete.espMax = passos[i];
        else { w1.cfg.pilarete.espMax = passos[passos.length - 1]; }
        var Hm = num(w0.altura); if ((i === passos.length || (r.painel.verificacoes && !r.painel.verificacoes.flexaoY)) && Hm > 1.9) w1.cfg.cinta.intermediarias = [Math.round(Hm / 2 / 0.915) * 0.915 - 0.15];
        var ri = calcularParede(w1, obra, P, V, memoria, [], ctx);
        melhor = ri; ajuste = { espMaxPilaretes: w1.cfg.pilarete.espMax, cintaIntermediaria: (w1.cfg.cinta.intermediarias || []).length > 0 };
        if (ri.painel && ri.painel.status === "atende") break;
      }
      melhor.ajustePainel = ajuste; melhor.cfgAjuste = { pilarete: { espMax: ajuste.espMaxPilaretes }, cinta: ajuste.cintaIntermediaria ? { intermediarias: melhor.pag.reforcos.cintas.filter(function (c) { return c.id !== "CR"; }).map(function (c) { return c.y; }) } : {} };
      return melhor;
    }
    var paredes = (obra.paredes || []).map(function (w) {
      var r1 = calcularComAjuste(w);
      if (r1.cfgAjuste) { w = clone(w); w.cfg = w.cfg || {}; w.cfg.pilarete = Object.assign({}, w.cfg.pilarete || {}, r1.cfgAjuste.pilarete); if (r1.cfgAjuste.cinta.intermediarias) w.cfg.cinta = Object.assign({}, w.cfg.cinta || {}, r1.cfgAjuste.cinta); }
      var hv = 0; (r1.vergas || []).forEach(function (v) { if (v.hRecomendada) hv = Math.max(hv, v.hRecomendada); });
      var hc = r1.cinta && r1.cinta.hRecomendada ? r1.cinta.hRecomendada : 0;
      if (!hv && !hc) return r1;
      var w2 = clone(w); w2.cfg = w2.cfg || {};
      if (hv) { w2.cfg.verga = w2.cfg.verga || {}; w2.cfg.verga.altura = hv; }
      if (hc) { w2.cfg.cinta = w2.cfg.cinta || {}; w2.cfg.cinta.altura = hc; }
      var r2 = calcularParede(w2, obra, P, V, memoria, [], ctx);
      r2.ajustes = { vergaAltura: hv || null, cintaAltura: hc || null };
      if (r1.ajustePainel) r2.ajustePainel = r1.ajustePainel;
      return r2;
    });
    /* o painel recebe parte da carga POR CONTATO (a cinta é concretada sobre ele e a
       verga apoia nele): o ensaio simulado verifica a compressão como se ele recebesse
       TODA a carga do topo, e a flecha da cinta fica limitada a ℓ/500 e 10 mm. */
    var fund = fundacao(paredes, obra, P, pend);
    // pendências repetidas (uma por parede) viram uma só, com o maior valor exigido
    var unicas = {}, pendFinal = [];
    pend.forEach(function (p) { if (!unicas[p.chave]) { unicas[p.chave] = p; pendFinal.push(p); } });
    var mx = { x: 0, y: 0 };
    paredes.forEach(function (p) { if (p.painel && p.painel.status === "pendente") { mx.x = Math.max(mx.x, p.painel.MSdX); mx.y = Math.max(mx.y, p.painel.MSdY); } });
    pendFinal.forEach(function (p) { if (p.chave === "painel-MRd") p.texto = "Resistência do painel Blocok à flexão fora do plano (kN·m/m, nas duas direções) — ensaio do fabricante (NBR 15575-2 Anexo A / Diretriz SiNAT). Maior exigido nesta obra: " + br(mx.x, 3) + " kN·m/m na horizontal e " + br(mx.y, 3) + " kN·m/m na vertical (com γf = 1,4)."; });
    var erros = []; paredes.forEach(function (p) { erros = erros.concat(p.erros); });
    var todosAvisos = avisos.slice(); paredes.forEach(function (p) { todosAvisos = todosAvisos.concat(p.avisos.filter(function (a) { return todosAvisos.indexOf(a) < 0; })); });
    var cons = BX().consolidar(paredes.map(function (p) { return p.pag; }));
    return {
      ok: erros.length === 0, data: new Date().toISOString().slice(0, 10), parametros: P, normas: NORMAS, cargas: CARGAS,
      vento: V, paredes: paredes, fundacao: fund, consolidado: cons,
      resumo: {
        paredes: paredes.length, aprovadas: paredes.filter(function (p) { return p.ok; }).length,
        painelPendente: paredes.some(function (p) { return p.painel && p.painel.status === "pendente"; }),
        erros: erros.length, pendencias: pendFinal.length
      },
      erros: erros, avisos: todosAvisos, pendencias: pendFinal, memoria: memoria
    };
  }

  return { NORMAS: NORMAS, NORMA: NORMA, EDICOES: EDICOES, semNotaInterna: semNotaInterna, CARGAS: CARGAS, COBR: COBR, padroes: padroes, calcular: calcular,
    flexao: flexao, cisalhamento: cisalhamento, flecha: flecha, flexoCompressao: flexoCompressao, placaNavier: placaNavier, barras: barras, mat: mat };
});

/* =====================================================================
 * andaimecalc.js — CÁLCULO E SIMULAÇÃO DO ANDAIME TUBO-ROLL (motor PURO, ES5, sem DOM, Node-testável).
 * Frente "Andaimes", etapas E4 (27/10/2026) e E4.1 (revisão adversarial nº 1: docs/andaime/REVISAO-CALCULO-1.md).
 * ⚠ CÁLCULO DE SEGURANÇA DE VIDA: passa pelo revisor adversarial antes de ir para o sistema. Cada hipótese, fórmula e
 * simplificação está em docs/andaime/CALCULO-HIPOTESES.md.
 *
 *   AndaimeCalc.calcular(modelo, p)  → { ok, verificacoes[], reacoes[], montantes[], caminho{}, naoVerificado[], ressalvas[], avisos[], resumo, parametros, vento }
 *       modelo = Andaime.montar(par); p = parâmetros do cálculo (PADRAO abaixo). Cada verificação:
 *       { id, tipo, pecas[], titulo, formula, valores{}, texto, solicitante, resistente, uso, estado, fonte, confirmarRT[],
 *         ressalvas[], porPeca{ idPeca: { uso, estado } }, corrigir:[{ texto, par, calc }] }
 *       estados: ok (uso ≤ 0,90) · atencao (0,90–1,00) · falha (> 1,00) · nao_verificado (dado faltando: NUNCA "ok").
 *   AndaimeCalc.simulacao(modelo, calc) → { idBarra | idConexao | idPrancha : { estado, uso, verificacao } }
 *   `corrigir` devolve o par alterado (ex.: vaoMax 2,0 → 1,5) e já o REFEZ para provar que passa; nunca altera sozinho.
 *
 * CAMINHO DE CARGA (E4.1, C7/C8): pranchão = viga CONTÍNUA sobre as transversais reais → reações na transversal (biapoiada nas duas
 * longitudinais) → longitudinal = viga contínua nos montantes com RÓTULA em cada luva (luvaRigida=false) → reações nos montantes.
 * Tudo resolvido por um solver de viga (elementos finitos de Euler-Bernoulli) deste arquivo, com envoltória de Q alternado por vão.
 *
 * M3 (27/10/2026): com modelo.sistema === "multidirecional" o calcular/simulacao/corrigir/montarInteligente DESPACHAM para js/andaimemulticalc.js, que recebe daqui (AndaimeCalc._int) o
 * vento, o solver de viga, o autovalor, a NBR 8800 e a tabela da base. O caminho do tubo-roll não mudou (golden-calc-tuboroll-7d7d23b7.json).
 *
 * Reaproveita: js/acodim8800.js (compressao, flexao), js/acosecao.js, js/perfisaco.js, js/acovento.js (S1, S2, S3) e
 * js/acoisopletas.js (V0 pelo local). Unidades: kN, kN·m, m, MPa; mostra kN e kgf. Teste: node tools/test-andaimecalc.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function AN() { return dep("Andaime", "./andaime.js"); }
  function D88() { return dep("AcoDim8800", "./acodim8800.js"); }
  function SEC() { return dep("AcoSecao", "./acosecao.js"); }
  function PAC() { return dep("PerfisAco", "./perfisaco.js"); }
  function VENTO() { return dep("AcoVento", "./acovento.js"); }
  function ISO() { return dep("AcoIsopletas", "./acoisopletas.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function brf(v, c) { c = c == null ? 2 : c; if (v == null || !isFinite(v)) return "—"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var GRAV = 9.80665;            /* m/s² : 1 kgf = 9,80665 N */
  var KGF_POR_KN = 1000 / GRAV;  /* 101,9716 kgf por kN */
  function kgf(kN) { return kN * KGF_POR_KN; }
  function kN(kgfv) { return kgfv / KGF_POR_KN; }
  function nkn(v) { return brf(v, 2) + " kN (" + brf(kgf(v), 0) + " kgf)"; }

  /* ================================================================ PARÂMETROS (padrão)
   * Tudo o que não é regra de norma BR fica editável e marcado confirmarRT. Fontes: docs/andaime/ESPEC-E3-E4.md 4.1 + REVISÃO,
   * docs/andaime/REFERENCIAS-ROGERIO.md. Nenhum número inventado: o que não tem fonte é null e vira "não verificado". */
  var PADRAO = {
    qServ: 2.0,                 /* kN/m² — classe de serviço EN 12811-1 (secundária); o RT escolhe pela atividade */
    pisosCarregados: "topo+50", /* "topo" | "topo+50" | "todos" */
    psi0Q: 0.7,                 /* ψ0 do Q de andaime na combinação com o VENTO principal (NBR 8681 Tab. 6 dá 0,5/0,7/0,8 p/ edifícios) — confirmarRT */
    fy: 235, fu: 360,           /* MPa — S235 (EN 39, secundária); SAE 1010/1020 → conferir o certificado */
    K: 1.0,                     /* KL = K × levante */
    eAbrac: 0.05,               /* m — excentricidade da carga que entra pela abraçadeira */
    capFixaKgf: 800,            /* kgf — abraçadeira fixa, carga ADMISSÍVEL (serviço) ao deslizamento (apostila/ensaio; outra fonte dá 900) */
    capGiratoriaKgf: 600,       /* kgf — giratória */
    sigmaMadeira: 80,           /* kgf/cm² — pranchão de pinho, tensão admissível */
    EMadeira: 98390,            /* kgf/cm² */
    IMadeira: 137,              /* cm⁴ — 3,8 × 30 */
    WMadeira: 72,               /* cm³ — 3,8 × 30 */
    pesoMadeiraKgfM: 9,         /* kg/m — pranchão 3,8 × 30 */
    sigmaCalco: 87,             /* kgf/cm² — calço de madeira sob a placa-base */
    placaCm: 12,                /* cm — placa-base 120 × 120 mm */
    sigmaSolo: null,            /* kPa — tensão admissível do apoio: SEM FONTE, o RT informa e confirma */
    sigmaSoloConfirmado: false,
    apoio: "solo",              /* "solo" | "laje" (laje → não verificado) */
    V0: null,                   /* m/s — se vazio: AcoIsopletas pelo local (lat/lon); sem nenhum → nao_verificado */
    lat: null, lon: null,
    categoria: null,            /* NBR 6123:2023 5.3.1: I a V; null = NÃO INFORMADA → pior caso (I) com a pendência visível */
    telaSombreamento: null,     /* fração fechada da tela (0,3 / 0,5 / 0,75 / 1,0 = lona); null = não informado → 0,75 (pior caso) */
    s3Temporaria: false,        /* S3 = 1,00 (NBR 6123:2023 Tabela 4, grupo 3: estruturas desmontáveis com vistas a reutilização = andaime de locação). true + s3Justificativa do RT → 0,83 (grupo 5) */
    s3Justificativa: "",        /* obrigatória para usar 0,83; aparece no memorial */
    ventoParaleloRT: false,     /* C-T1.1: o RT conferiu o vento paralelo à fachada (atrito na tela e cabeceiras) nas diagonais e giratórias; vale só com ventoParaleloJustificativa (>= 15 caracteres não brancos) */
    ventoParaleloJustificativa: "",
    s1: null,   /* categoria I = a mais desfavorável (S2 maior); o RT escolhe */
    cfTela: null, caTubo: 1.2,  /* cfTela null = sai de telaSombreamento (NBR 6123:2023 7.5, área líquida); caTubo SEM FONTE BR — confirmarRT */
    capAncoragem: 6.25,         /* kN — HSA Irlanda (referência, não norma BR); compara com a força de SERVIÇO; confirmarRT */
    flechaPisoRel: 200,         /* L/200 — NBR 6494 3.1.7 (REGRA do piso; exemplar não licenciado) */
    flechaTuboRel: 200,         /* L/200 nas travessas e transversais — ESPEC 4.2 (confirmarRT; L/100 é comum em ledgers, decisão do RT) */
    guardaKgfM: 90, guardaFlechaMax: 0.076, intermKgfM: 66, guardaPontualN: 350,  /* NR-18 18.9.4.2 (REGRA) e NBR 6494 3.2.1 (REGRA) */
    luvaRigida: false,          /* false = a luva da longitudinal é RÓTULA (conservador, sem fonte da rigidez da luva); true = contínua — confirmarRT */
    pontuais: [{ P: 1.5, a: 0.5 }, { P: 1.0, a: 0.2 }],   /* kN em a×a m — EN 12811-1 classe 3 (secundária, de memória): carga concentrada no pranchão — confirmarRT */
    notional: 0.003, nodalBr: 0.01, kBr: 10.7,   /* força nocional 0,3 % (NBR 8800 4.9.7), contenção nodal 1 % e rigidez 10,7·N/Lb — DE MEMÓRIA, conferir */
    guardaLaudo: ""             /* nº do laudo do guarda-corpo ensaiado (registrado na aprovação pelo RT) */
  };
  /* base regulável: carga admissível (kgf) pela altura da rosca exposta (cm) — apostila (R1, secundária) */
  var TABELA_BASE_KGF = [[8, 5000], [20, 3800], [25, 3300], [30, 2800], [35, 2450], [40, 2100]];
  function capBase(roscaCm) {
    var t = TABELA_BASE_KGF;
    if (!isFinite(roscaCm) || roscaCm > t[t.length - 1][0] + 1e-9) return null;
    if (roscaCm <= t[0][0]) return t[0][1];
    for (var i = 0; i + 1 < t.length; i++) if (roscaCm <= t[i + 1][0] + 1e-9) return t[i][1] + (t[i + 1][1] - t[i][1]) * (roscaCm - t[i][0]) / (t[i + 1][0] - t[i][0]);
    return null;
  }
  function estadoDe(uso) { if (uso == null || !isFinite(uso)) return "nao_verificado"; return uso <= 0.90 + 1e-9 ? "ok" : (uso <= 1.0 + 1e-9 ? "atencao" : "falha"); }
  var ORDEM_ESTADO = { ok: 0, nao_verificado: 1, atencao: 2, falha: 3 };
  function piorEstado(a, b) { return ORDEM_ESTADO[a] >= ORDEM_ESTADO[b] ? a : b; }

  var NUMS = ["qServ", "psi0Q", "fy", "fu", "K", "eAbrac", "capFixaKgf", "capGiratoriaKgf", "sigmaMadeira", "EMadeira", "IMadeira", "WMadeira", "pesoMadeiraKgfM", "sigmaCalco", "placaCm", "cfTela", "caTubo", "capAncoragem", "flechaPisoRel", "flechaTuboRel", "guardaKgfM", "guardaFlechaMax", "intermKgfM", "guardaPontualN", "grupoS3", "notional", "nodalBr", "kBr"];
  function normalizar(par) {
    var p = clone(PADRAO);
    Object.keys(par || {}).forEach(function (k) { if (par[k] !== undefined && par[k] !== "") p[k] = par[k]; });
    NUMS.forEach(function (k) { p[k] = num(p[k], PADRAO[k]); });
    ["sigmaSolo", "V0", "lat", "lon", "cfTela", "telaSombreamento"].forEach(function (k) { p[k] = p[k] == null ? null : num(p[k], null); });
    p.s3Temporaria = p.s3Temporaria === true || p.s3Temporaria === "true";
    p.s3Justificativa = p.s3Justificativa == null ? "" : String(p.s3Justificativa).trim();
    p.ventoParaleloRT = p.ventoParaleloRT === true || p.ventoParaleloRT === "true";
    p.ventoParaleloJustificativa = p.ventoParaleloJustificativa == null ? "" : String(p.ventoParaleloJustificativa).trim();
    p.sigmaSoloConfirmado = p.sigmaSoloConfirmado === true || p.sigmaSoloConfirmado === "true";
    p.luvaRigida = p.luvaRigida === true || p.luvaRigida === "true";
    p.guardaLaudo = p.guardaLaudo == null ? "" : String(p.guardaLaudo).trim();
    p.categoria = p.categoria == null || p.categoria === "" ? null : String(p.categoria).toUpperCase();
    return p;
  }
  /* M3 (revisão 1): parâmetro degenerado nunca vira "ok": a verificação que depende dele fica nao_verificado, com o motivo */
  var TODOS = ["montante", "montante_topo", "montante_guarda", "travessa", "transversal", "prancha", "prancha_pontual", "guarda", "abracadeira", "giratoria", "base", "calco", "apoio", "ancoragem", "long_horizontal", "contencao", "estabilidade"];
  function parametrosInvalidos(P) {
    var l = [];
    function add(chave, motivo, tipos) { l.push({ chave: chave, motivo: motivo, tipos: tipos }); }
    if (P.ventoParaleloRT && P.ventoParaleloJustificativa.replace(/\s/g, "").length < 15) add("ventoParaleloJustificativa", "informe a justificativa do RT para o vento paralelo (mínimo 15 caracteres)", ["vento_paralelo"]);
    if (!(P.K >= 0.5)) add("K", "K deve ser ≥ 0,5 (KL = K × levante)", ["montante", "montante_topo", "contencao"]);
    if (!(P.flechaTuboRel >= 50)) add("flechaTuboRel", "a flecha relativa do tubo (L/n) deve ter n ≥ 50", ["travessa", "transversal", "long_horizontal"]);
    if (!(P.flechaPisoRel >= 50)) add("flechaPisoRel", "a flecha relativa do piso (L/n) deve ter n ≥ 50", ["prancha", "prancha_pontual"]);
    if (P.categoria != null && ["I", "II", "III", "IV", "V"].indexOf(P.categoria) < 0) add("categoria", "categoria de rugosidade deve ser I a V", ["ancoragem", "long_horizontal", "montante", "montante_topo", "estabilidade", "contencao"]);
    if (P.telaSombreamento != null && !(P.telaSombreamento > 0 && P.telaSombreamento <= 1)) add("telaSombreamento", "o sombreamento da tela deve estar entre 0 e 1", ["ancoragem", "long_horizontal", "montante", "montante_topo", "estabilidade", "contencao"]);
    if (P.cfTela != null && !(P.cfTela > 0)) add("cfTela", "coeficiente de força da tela deve ser > 0", ["ancoragem", "long_horizontal", "montante", "montante_topo", "estabilidade", "contencao"]);
    if (!(P.caTubo > 0)) add("caTubo", "coeficiente de arrasto do tubo deve ser > 0", ["ancoragem", "long_horizontal", "montante", "montante_topo", "estabilidade", "contencao"]);
    if (!(P.capFixaKgf > 0 && P.capFixaKgf <= 2000)) add("capFixaKgf", "capacidade da abraçadeira fixa fora de 0 a 2 000 kgf (teto de catálogo)", ["abracadeira"]);
    if (!(P.capGiratoriaKgf > 0 && P.capGiratoriaKgf <= 2000)) add("capGiratoriaKgf", "capacidade da giratória fora de 0 a 2 000 kgf", ["giratoria"]);
    if (!(P.capAncoragem > 0 && P.capAncoragem <= 60)) add("capAncoragem", "capacidade da ancoragem fora de 0 a 60 kN", ["ancoragem"]);
    if (!(P.fy > 0 && P.fy <= 500 && P.fu >= P.fy)) add("fy/fu", "aço do tubo fora de 0 a 500 MPa ou fu < fy", TODOS);
    if (!(P.eAbrac >= 0 && P.eAbrac <= 0.2)) add("eAbrac", "excentricidade da abraçadeira fora de 0 a 0,20 m", ["montante"]);
    if (!(P.psi0Q >= 0 && P.psi0Q <= 1)) add("psi0Q", "ψ0 deve estar entre 0 e 1", ["montante", "montante_topo", "long_horizontal"]);
    if (!(P.sigmaMadeira > 0 && P.EMadeira > 0 && P.IMadeira > 0 && P.WMadeira > 0)) add("madeira", "σ, E, I e W da madeira devem ser > 0", ["prancha", "prancha_pontual"]);
    if (!(P.qServ > 0)) add("qServ", "carga de serviço deve ser > 0", TODOS);
    return l;
  }

  /* ================================================================ SOLVER DE VIGA (elementos finitos de Euler-Bernoulli)
   * Viga contínua com apoios verticais, rótulas e cargas uniformes por trecho e pontuais. Deslocamento v para CIMA; cargas P e w POSITIVAS PARA BAIXO.
   * casos = [{ w, wSeg:[{x0,x1,w}], pts:[{x,P}] }]; devolve por caso { X, M (sagrante +), v, R (por apoio, para cima +), vmax }. Solução EXATA para
   * carga pontual e uniforme (os nós ficam em todos os pontos de interesse e a cada `h`). */
  function resolverSistema(Am, B) {
    var n = Am.length, m = B[0].length, i, j, k;
    for (i = 0; i < n; i++) Am[i] = Am[i].concat(B[i]);
    for (i = 0; i < n; i++) {
      var p = i; for (k = i + 1; k < n; k++) if (Math.abs(Am[k][i]) > Math.abs(Am[p][i])) p = k;
      var tmp = Am[i]; Am[i] = Am[p]; Am[p] = tmp;
      var d = Am[i][i]; if (Math.abs(d) < 1e-300) d = 1e-300;
      for (k = i + 1; k < n; k++) { var f = Am[k][i] / d; if (f === 0) continue; for (j = i; j < n + m; j++) Am[k][j] -= f * Am[i][j]; }
    }
    var X = []; for (i = 0; i < n; i++) X.push(new Array(m));
    for (var c = 0; c < m; c++) for (i = n - 1; i >= 0; i--) { var s = Am[i][n + c]; for (j = i + 1; j < n; j++) s -= Am[i][j] * X[j][c]; X[i][c] = s / (Am[i][i] || 1e-300); }
    return X;
  }
  function viga(cfg, casos) {
    var EI = cfg.EI, h = cfg.h || 0.2, xs = [cfg.x0, cfg.x1], i, e, j;
    arr(cfg.apoios).forEach(function (x) { xs.push(x); }); arr(cfg.rotulas).forEach(function (x) { xs.push(x); }); arr(cfg.molas).forEach(function (m) { xs.push(m.x); });
    casos.forEach(function (c) { arr(c.pts).forEach(function (q) { xs.push(clamp(q.x, cfg.x0, cfg.x1)); }); arr(c.wSeg).forEach(function (sg) { xs.push(sg.x0); xs.push(sg.x1); }); });
    for (var x = cfg.x0 + h; x < cfg.x1 - 1e-9; x += h) xs.push(x);
    xs.sort(function (a, b) { return a - b; });
    var X = []; xs.forEach(function (v) { if (!X.length || v - X[X.length - 1] > 1e-7) X.push(v); });
    var n = X.length;
    function idx(x) { var b = 0, bd = Infinity; for (var q = 0; q < n; q++) { var dd = Math.abs(X[q] - x); if (dd < bd) { bd = dd; b = q; } } return b; }
    var hinge = {}; arr(cfg.rotulas).forEach(function (x) { hinge[idx(x)] = true; });
    var nd = 0, vI = [], thR = [], thL = [];
    for (i = 0; i < n; i++) { vI[i] = nd++; thR[i] = nd++; thL[i] = hinge[i] ? nd++ : thR[i]; }
    var N = nd, K = []; for (i = 0; i < N; i++) { K.push(new Array(N)); for (j = 0; j < N; j++) K[i][j] = 0; }
    var ke = [];
    for (e = 0; e + 1 < n; e++) {
      var L = X[e + 1] - X[e], k0 = EI / (L * L * L), kk = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
      var dofs = [vI[e], thR[e], vI[e + 1], thL[e + 1]];
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) K[dofs[i]][dofs[j]] += k0 * kk[i][j];
      ke.push({ L: L, k0: k0, kk: kk, dofs: dofs });
    }
    arr(cfg.molas).forEach(function (m) { var ii = vI[idx(m.x)]; K[ii][ii] += m.k; });   /* apoios elásticos */
    var reg = 1e-9 * EI; for (i = 0; i < n; i++) { K[thR[i]][thR[i]] += reg; if (thL[i] !== thR[i]) K[thL[i]][thL[i]] += reg; }
    var apI = arr(cfg.apoios).map(idx), fixos = apI.map(function (q) { return vI[q]; });
    var Fs = [], eqs = [];
    casos.forEach(function (c) {
      var F = new Array(N); for (i = 0; i < N; i++) F[i] = 0;
      var feq = [];
      for (e = 0; e + 1 < n; e++) {
        var w = num(c.w, 0), xm = (X[e] + X[e + 1]) / 2;
        arr(c.wSeg).forEach(function (sg) { if (xm >= sg.x0 - 1e-9 && xm <= sg.x1 + 1e-9) w += sg.w; });
        var Le = ke[e].L, f = [-w * Le / 2, -w * Le * Le / 12, -w * Le / 2, w * Le * Le / 12];
        for (i = 0; i < 4; i++) F[ke[e].dofs[i]] += f[i];
        feq.push(f);
      }
      arr(c.pts).forEach(function (q) { F[vI[idx(clamp(q.x, cfg.x0, cfg.x1))]] -= q.P; });
      Fs.push(F); eqs.push(feq);
    });
    var Kc = K.map(function (r) { return r.slice(); }), B = [];
    for (i = 0; i < N; i++) B.push(Fs.map(function (F) { return F[i]; }));
    fixos.forEach(function (dd) { for (j = 0; j < N; j++) { Kc[dd][j] = 0; Kc[j][dd] = 0; } Kc[dd][dd] = 1; B[dd] = Fs.map(function () { return 0; }); });
    var U = resolverSistema(Kc, B);
    return casos.map(function (c, ci) {
      var u = U.map(function (r) { return r[ci]; }), F = Fs[ci], Mn = new Array(n), v = new Array(n), vmax = 0;
      for (i = 0; i < n; i++) { v[i] = u[vI[i]]; vmax = Math.max(vmax, Math.abs(v[i])); }
      for (e = 0; e + 1 < n; e++) {
        var ue = ke[e].dofs.map(function (d) { return u[d]; }), fe = [];
        for (i = 0; i < 4; i++) { var s = 0; for (j = 0; j < 4; j++) s += ke[e].k0 * ke[e].kk[i][j] * ue[j]; fe.push(s - eqs[ci][e][i]); }
        if (e === 0 || true) Mn[e] = -fe[1];
        if (e + 2 === n) Mn[e + 1] = fe[3];
      }
      if (n === 1) Mn[0] = 0;
      var R = fixos.map(function (dd) { var s = 0; for (var q = 0; q < N; q++) s += K[dd][q] * u[q]; return s - F[dd]; });
      return { X: X, M: Mn, v: v, R: R, Rm: arr(cfg.molas).map(function (m) { return -m.k * v[idx(m.x)]; }), vmax: vmax, instavel: !(vmax < 100) };   /* deslocamento > 100 m = mecanismo (rótulas sem apoio suficiente) */
    });
  }


  /* ================================================================ AUTOVALOR 1D DO MONTANTE (E4.3)
   * Ncr de uma coluna de EI constante, com apoios rígidos (v = 0), molas laterais nos nós e carga axial N(y) variável: (K + Kmolas − λ·Kg(N))·u = 0, menor λ.
   * Elementos de viga de Euler-Bernoulli com a matriz geométrica consistente; base e topo com rotação livre. Iteração inversa com LU (K⁻¹·Kg). Devolve λ tal que
   * a carga crítica na seção é λ·N(y) (Infinity se N = 0). Emendas: contínuas, como estavam. */
  function luFatorar(A) {
    var n = A.length, piv = [], i, j, k;
    for (i = 0; i < n; i++) {
      var p = i; for (k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
      var t = A[i]; A[i] = A[p]; A[p] = t; piv.push(p);
      var d = A[i][i]; if (Math.abs(d) < 1e-300) { d = 1e-300; A[i][i] = d; }
      for (k = i + 1; k < n; k++) { var f = A[k][i] / d; A[k][i] = f; if (f === 0) continue; for (j = i + 1; j < n; j++) A[k][j] -= f * A[i][j]; }
    }
    return { lu: A, piv: piv };
  }
  function luResolver(F, b) {
    var n = b.length, x = b.slice(), i, k;
    for (i = 0; i < n; i++) { var t = x[i]; x[i] = x[F.piv[i]]; x[F.piv[i]] = t; }
    for (i = 0; i < n; i++) for (k = 0; k < i; k++) x[i] -= F.lu[i][k] * x[k];
    for (i = n - 1; i >= 0; i--) { for (k = i + 1; k < n; k++) x[i] -= F.lu[i][k] * x[k]; x[i] /= F.lu[i][i]; }
    return x;
  }
  function ncrColuna(cfg) {
    var EI = cfg.EI, h = cfg.h || 0.25, xs = [cfg.x0, cfg.x1], i, j, e;
    arr(cfg.apoios).forEach(function (x) { xs.push(x); }); arr(cfg.molas).forEach(function (m) { xs.push(m.x); });
    for (var x = cfg.x0 + h; x < cfg.x1 - 1e-9; x += h) xs.push(x);
    xs.sort(function (a, b) { return a - b; });
    var X = []; xs.forEach(function (v) { if (!X.length || v - X[X.length - 1] > 1e-7) X.push(v); });
    var n = X.length, N = 2 * n, K = [], Kg = []; for (i = 0; i < N; i++) { K.push(new Array(N)); Kg.push(new Array(N)); for (j = 0; j < N; j++) { K[i][j] = 0; Kg[i][j] = 0; } }
    function idx(x) { var b = 0, bd = Infinity; for (var q = 0; q < n; q++) { var dd = Math.abs(X[q] - x); if (dd < bd) { bd = dd; b = q; } } return b; }
    for (e = 0; e + 1 < n; e++) {
      var L = X[e + 1] - X[e], k0 = EI / (L * L * L), ke = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
      var Nm = cfg.N((X[e] + X[e + 1]) / 2), g0 = Nm / (30 * L), kg = [[36, 3 * L, -36, 3 * L], [3 * L, 4 * L * L, -3 * L, -L * L], [-36, -3 * L, 36, -3 * L], [3 * L, -L * L, -3 * L, 4 * L * L]], d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { K[d[i]][d[j]] += k0 * ke[i][j]; Kg[d[i]][d[j]] += g0 * kg[i][j]; }
    }
    arr(cfg.molas).forEach(function (m) { var ii = 2 * idx(m.x); K[ii][ii] += m.k; });
    var fixo = {}; arr(cfg.apoios).forEach(function (a) { fixo[2 * idx(a)] = true; });
    var livres = []; for (i = 0; i < N; i++) if (!fixo[i]) livres.push(i);
    var m2 = livres.length; if (m2 < 2) return Infinity;
    var Kr = [], Gr = []; for (i = 0; i < m2; i++) { Kr.push(new Array(m2)); Gr.push(new Array(m2)); for (j = 0; j < m2; j++) { Kr[i][j] = K[livres[i]][livres[j]]; Gr[i][j] = Kg[livres[i]][livres[j]]; } }
    var Kc = Kr.map(function (r) { return r.slice(); }), F = luFatorar(Kc), v = []; for (i = 0; i < m2; i++) v.push(1 + 0.37 * Math.sin(1.7 * i + 0.3));
    var lam = Infinity, ant = 0;
    function mul(A, vv) { var o = new Array(m2), s0, q; for (var a = 0; a < m2; a++) { s0 = 0; for (q = 0; q < m2; q++) s0 += A[a][q] * vv[q]; o[a] = s0; } return o; }
    for (var it = 0; it < 200; it++) {
      var gv = mul(Gr, v), z = luResolver(F, gv), nz = 0; for (i = 0; i < m2; i++) nz += z[i] * z[i]; nz = Math.sqrt(nz);
      if (!(nz > 1e-300)) return Infinity;
      for (i = 0; i < m2; i++) v[i] = z[i] / nz;
      var kv = mul(Kr, v), gv2 = mul(Gr, v), a1 = 0, a2 = 0; for (i = 0; i < m2; i++) { a1 += v[i] * kv[i]; a2 += v[i] * gv2[i]; }
      if (!(a2 > 1e-300)) return Infinity;
      lam = a1 / a2; if (it > 3 && Math.abs(lam - ant) < 1e-10 * Math.abs(lam)) break; ant = lam;
    }
    return lam;
  }

  /* ================================================================ VENTO (NBR 6123:2023 — reaproveita AcoVento / AcoIsopletas) */
  function ventoDe(P, catEf, grupoEf) {
    var V = VENTO(), I = ISO(), v0 = null, fonte = null, texto = null;
    if (P.V0 != null && P.V0 > 0) { v0 = P.V0; fonte = "V0 informado pelo responsável técnico"; }
    else if (P.lat != null && P.lon != null && I && I.v0) {
      var r = null; try { r = I.v0(P.lat, P.lon); } catch (e) { r = null; }
      if (r && r.v0Adotado > 0 && !r.foraDoMapa) { v0 = r.v0Adotado; fonte = "V0 pelo mapa de isopletas (NBR 6123:2023, Figura 1) em " + brf(P.lat, 4) + ", " + brf(P.lon, 4); texto = r.texto; }
    }
    if (v0 == null) return { ok: false, motivo: "V0 da obra não informado (informe V0 ou a latitude/longitude): vento não verificado." };
    if (!V) return { ok: false, motivo: "módulo de vento (acovento.js) indisponível." };
    var s1 = V.fatorS1(P.s1 || { tipo: "plano" }, 10), s3 = { valor: grupoEf === 5 ? 0.83 : 1.00 }, s2t = V.fatorS2(catEf, "A", 10);
    if (!s1 || s1.erro || !s3 || !s2t) return { ok: false, motivo: "fatores S1/S2/S3 inválidos (categoria " + catEf + ", grupo S3 " + grupoEf + ")." };
    function s2de(z) { return V.fatorS2(catEf, "A", Math.max(z, 0)).valor; }
    function qDe(z) { var vk = v0 * s1.valor * s2de(z) * s3.valor; return 0.613 * vk * vk / 1000; }   /* kN/m² */
    return { ok: true, V0: v0, fonteV0: fonte, textoV0: texto, S1: s1.valor, S3: s3.valor, s2de: s2de, qDe: qDe, categoria: catEf, classe: "A", grupoS3: grupoEf };
  }

  /* NBR 6123:1988 Fig. 6, p. 27 (= NBR 6123:2023 Fig. 12, p. 55): Ca(φ) lido do gráfico; cf na área bruta = Ca·φ, Ca interpolado linear (M3: subiu de dentro do calcular, corpo idêntico) */
  function cfTelaDeFi(f) {
    var T = [[0, 2.0], [0.1, 1.9], [0.2, 1.8], [0.3, 1.7], [0.5, 1.6], [0.7, 1.6], [0.9, 1.8], [1.0, 2.0]], ca = T[T.length - 1][1];
    if (f <= 0) return 0;
    for (var i = 0; i + 1 < T.length; i++) if (f <= T[i + 1][0] + 1e-9) { ca = T[i][1] + (T[i + 1][1] - T[i][1]) * (f - T[i][0]) / (T[i + 1][0] - T[i][0]); break; }
    return ca * Math.min(f, 1);
  }

  /* ================================================================ O CÁLCULO */
  function MC() { return dep("AndaimeMultiCalc", "./andaimemulticalc.js"); }   /* M3: verificações próprias do multidirecional (js/andaimemulticalc.js) */
  var PEND_MULTI = "Cálculo do multidirecional: etapa M3 (em preparação)";
  function resultadoMultiSemCalculo(modelo, out) {
    var v = { id: "multidirecional", tipo: "multidirecional", pecas: [], titulo: "Cálculo do andaime multidirecional (etapa M3)", formula: "", valores: {}, texto: PEND_MULTI, solicitante: "", resistente: "", uso: null, estado: "nao_verificado", fonte: "", confirmarRT: [], ressalvas: [PEND_MULTI], porPeca: {}, corrigir: [] };
    arr(modelo.barras).forEach(function (b) { v.pecas.push(b.id); v.porPeca[b.id] = { estado: "nao_verificado", uso: null }; });
    out.verificacoes = [v]; out.pendencias = [PEND_MULTI]; out.ressalvas.push(PEND_MULTI);
    (modelo.pendencias || []).forEach(function (t) { out.pendencias.push(t); });
    out.ok = true; out.resumo = resumir(out.verificacoes);
    return out;
  }
  function calcular(modelo, par, opt) {
    opt = opt || {};
    var P = normalizar(par), A = AN(), d88 = D88(), SC = SEC(), PA = PAC();
    var out = { ok: false, verificacoes: [], reacoes: [], montantes: [], caminho: { transversais: [], longitudinais: [] }, naoVerificado: [], ressalvas: [], avisos: [], resumo: "", parametros: P, vento: null, parametrosInvalidos: [] };
    if (!modelo || !modelo.ok) { out.erro = "Sem modelo de andaime montado."; out.resumo = out.erro; return out; }
    /* MULTIDIRECIONAL (M3): o cálculo é de js/andaimemulticalc.js (mesmo formato de saída). Rede de segurança do M1: se esse módulo não carregar, NENHUMA
       verificação pode sair "ok" — o guarda antigo (resultadoMultiSemCalculo) devolve tudo nao_verificado. */
    if (modelo.sistema === "multidirecional") { var mcM = MC(); return mcM && mcM.calcular ? mcM.calcular(modelo, par, opt, INTERNOS) : resultadoMultiSemCalculo(modelo, out); }
    out.parametrosInvalidos = parametrosInvalidos(P);
    if (!(P.qServ > 0)) { out.erro = "qServ deve ser maior que zero."; out.resumo = out.erro; return out; }
    var perfil = null; try { perfil = PA && PA.obter ? PA.obter(modelo.par.tubo) : null; } catch (e0) { perfil = null; }
    var s = perfil && SC ? SC.dePerfil(perfil, perfil.forma || "tubo-circ") : null;
    if (!s || !d88) { out.erro = "Seção do tubo (" + modelo.par.tubo + ") ou NBR 8800 indisponível."; out.resumo = out.erro; return out; }
    var naoV = out.naoVerificado, ress = out.ressalvas;
    out.parametrosInvalidos.forEach(function (x) { out.avisos.push("Parâmetro «" + x.chave + "» inválido: " + x.motivo + " — as verificações que dependem dele ficam NÃO VERIFICADAS."); });

    /* ---------- resistências do tubo (NBR 8800, reaproveitando AcoDim8800) */
    var E = 200000, G = 77000, fyOk = P.fy > 0 ? P.fy : 235, aco = { id: "tubo", fy: fyOk, fu: Math.max(P.fu, fyOk) };
    var MRd = d88.flexao(s, aco, E, G, 1, 1, "x").MRd;                      /* kN·m, ELU */
    var My = s.Wx * fyOk / 1e6;                                               /* kN·m, início do escoamento, SEM γ (carga pontual 350 N) */
    var EI = E * 1e3 * s.Ix * 1e-12;                                          /* kN·m² */
    var kgm = modelo.tubo && modelo.tubo.kgm ? modelo.tubo.kgm : 3.70, wTubo = kgm * GRAV / 1000;   /* kN/m */
    var cacheN = {};
    function NRdDe(KL) { var k = brf(KL, 4); if (!cacheN[k]) cacheN[k] = d88.compressao(s, aco, E, G, { Lx: KL, Ly: KL, Lz: KL }, "pilar"); return cacheN[k]; }

    /* ---------- estrutura do modelo */
    var M = modelo.medidas, niv = modelo.niveis, nL = niv.length - 1, W = M.largura, lev = M.alturaPiso / nL;
    var barrasPorId = {}; modelo.barras.forEach(function (b) { barrasPorId[b.id] = b; });
    var postes = modelo.postes, postePorKey = {}; postes.forEach(function (q) { postePorKey[q.key] = q; });
    function posteEm(x, z) { var best = null, bd = 0.03; postes.forEach(function (q) { var dd = Math.sqrt((q.x - x) * (q.x - x) + (q.z - z) * (q.z - z)); if (dd < bd) { bd = dd; best = q.key; } }); return best; }
    var topoY = 0; modelo.barras.forEach(function (b) { topoY = Math.max(topoY, b.a[1], b.b[1]); });
    modelo.pranchas.forEach(function (x) { topoY = Math.max(topoY, x.yTopo || 0); });
    var temTela = !!(modelo.par && modelo.par.tela);
    var guardaH = modelo.par && modelo.par.guarda ? modelo.par.guarda : 1.2;
    var semAnc = !modelo.ancoragens.length;

    /* ---------- pisos carregados */
    var pisoLv = niv.filter(function (n) { return n.k >= 1 && n.piso; }).map(function (n) { return n.k; }).sort(function (a, b) { return b - a; });
    var fPiso = {}, modoP = String(P.pisosCarregados || "topo+50").toLowerCase();
    pisoLv.forEach(function (k, i) { fPiso[k] = modoP === "todos" ? 1 : (i === 0 ? 1 : (i === 1 && modoP !== "topo" ? 0.5 : 0)); });
    function fK(k) { return fPiso[k] || 0; }
    var madeira = modelo.par.piso !== "metalico";
    var topoVento = temTela ? M.alturaPiso + 2.0 : topoY;

    /* ---------- vento: q(z) por faixa de altura e coeficiente de força por camada (C6, M5) */
    /* entradas de vento: o que não foi informado vira o PIOR CASO com a pendência visível (E4.3, item 8) */
    var catEf = P.categoria || "I", phiTela = P.telaSombreamento != null ? P.telaSombreamento : 0.75, s3Reduzido = P.s3Temporaria && P.s3Justificativa.length > 0, grupoEf = s3Reduzido ? 5 : 3;
    var cfDeFi = cfTelaDeFi;   /* M3: a função subiu para o nível do módulo (o multidirecional usa a mesma) — corpo idêntico */
    var cfTelaEf = P.cfTela != null && P.cfTela > 0 ? P.cfTela : cfDeFi(phiTela);
    out.pendencias = [];
    if (P.categoria == null || (modelo.par && modelo.par.tela && P.telaSombreamento == null && P.cfTela == null)) out.pendencias.push("categoria/tela não informadas — usando o pior caso (categoria " + catEf + ", sombreamento da tela " + brf(phiTela, 2) + ", cf " + brf(cfTelaEf, 2) + "); informe para um andaime mais leve.");
    if (s3Reduzido) out.pendencias.push("S3 = 0,83 (NBR 6123:2023 Tabela 4, grupo 5) por decisão do responsável técnico — justificativa: " + P.s3Justificativa);
    else if (P.s3Temporaria) out.pendencias.push("S3 = 1,00 mantido: s3Temporaria sem justificativa do RT não vale (o 0,83 exige justificativa escrita).");
    (modelo.pendencias || []).forEach(function (t) { out.pendencias.push(t); });
    var vt = ventoDe(P, catEf, grupoEf); out.vento = vt;
    var solidez = 0;
    (function () {
      var soma = 0, Dm = modelo.tubo.D;
      modelo.barras.forEach(function (b) { if (b.patamar) return; /* E9: o guarda-corpo do patamar de acesso (só no vão da escada) não entra na solidez da fachada: o vento é o do andaime sem o acesso */ if (/^(montante|travessa|varredor|guarda|intermediaria|diagonal|travaTopo)$/.test(b.papel)) soma += Dm * b.L; });
      solidez = clamp(M.areaFachada > 0 ? soma / M.areaFachada : 1, 0, 1);
    })();
    var yTelaIni = pisoLv.length ? niv[pisoLv[pisoLv.length - 1]].yPiso : 0, yTelaFim = M.alturaPiso + 2.0;
    /* M5: com tela = false a NR-18 18.9.4.2 d) ainda manda preencher os vãos do guarda-corpo (tela ou outro dispositivo): faixa cheia de cada piso */
    var faixasGuarda = pisoLv.map(function (k) { return [niv[k].yPiso, niv[k].yPiso + guardaH]; });
    function cfCamada(y) {
      if (temTela && y >= yTelaIni && y <= yTelaFim) return cfTelaEf;
      for (var q = 0; q < faixasGuarda.length; q++) if (y >= faixasGuarda[q][0] && y <= faixasGuarda[q][1]) return cfTelaEf;
      return P.caTubo * solidez;
    }
    function qAt(z) { return vt.ok ? vt.qDe(z) : 0; }
    /* ∫ q(y)·cf(y) dy e ∫ q·cf·y dy entre ylo e yhi (kN/m de fachada e kN·m/m) */
    function ventoFaixa(ylo, yhi) {
      var n = Math.max(1, Math.ceil((yhi - ylo) / 0.25)), dy = (yhi - ylo) / n, f = 0, mo = 0;
      for (var i = 0; i < n; i++) { var y = ylo + (i + 0.5) * dy, w = qAt(y) * cfCamada(y) * dy; f += w; mo += w * y; }
      return { f: f, m: mo };
    }

    /* ---------- área tributária de cada montante (só para repartir o peso dos itens que não têm caminho próprio) e largura de fachada do vento */
    var larguraCob = Math.max(1e-6, (M.nPranchasLargura || 1) * (madeira ? 0.30 : 0.37));
    var kLarg = W / larguraCob;
    var listasT = {};
    function listasDe(ti) {
      if (listasT[ti]) return listasT[ti];
      var T = modelo.trechos[ti], inn = [], ext = [];
      T.est.forEach(function (id) { var e = modelo.estacoes[id]; if (e.pi) inn.push({ s: e.s, key: posteEm(e.pi[0], e.pi[1]) }); ext.push({ s: e.s, key: posteEm(e.pe[0], e.pe[1]) }); });
      modelo.estacoes.forEach(function (e) { if (e.trecho === ti && e.outerOnly) ext.push({ s: e.s, key: posteEm(e.pe[0], e.pe[1]) }); });
      inn.sort(function (a, b) { return a.s - b.s; }); ext.sort(function (a, b) { return a.s - b.s; });
      listasT[ti] = { inner: inn.filter(function (x) { return x.key; }), outer: ext.filter(function (x) { return x.key; }) };
      return listasT[ti];
    }
    function reparte(lista, sA, area, acc) {
      if (!lista.length) return;
      if (sA <= lista[0].s) { acc[lista[0].key] = (acc[lista[0].key] || 0) + area; return; }
      var u = lista[lista.length - 1];
      if (sA >= u.s) { acc[u.key] = (acc[u.key] || 0) + area; return; }
      for (var i = 0; i + 1 < lista.length; i++) if (sA <= lista[i + 1].s) {
        var t = (sA - lista[i].s) / Math.max(1e-9, lista[i + 1].s - lista[i].s);
        acc[lista[i].key] = (acc[lista[i].key] || 0) + area * (1 - t); acc[lista[i + 1].key] = (acc[lista[i + 1].key] || 0) + area * t; return;
      }
    }
    var atrib = {};
    pisoLv.forEach(function (k) {
      var acc = {};
      modelo.pranchas.forEach(function (pr) {
        if (pr.nivel !== k) return;
        var T = modelo.trechos[pr.trecho]; if (!T) return;
        var e0 = modelo.estacoes[T.est[0]], L = pr.L, n = Math.max(1, Math.ceil(L / 0.25)), da = pr.larg * L / n * kLarg, ls = listasDe(pr.trecho);
        for (var i = 0; i < n; i++) {
          var t = (i + 0.5) / n, x = pr.a[0] + (pr.b[0] - pr.a[0]) * t, z = pr.a[2] + (pr.b[2] - pr.a[2]) * t;
          var sA = e0.s + (x - e0.pi[0]) * T.u[0] + (z - e0.pi[1]) * T.u[1], lat = (x - e0.pi[0]) * T.ns[0] + (z - e0.pi[1]) * T.ns[1], sh = clamp(lat / W, 0, 1);
          reparte(ls.inner, sA, da * (1 - sh), acc); reparte(ls.outer, sA, da * sh, acc);
        }
      });
      atrib[k] = acc;
    });
    var kRef = pisoLv.length ? pisoLv[0] : null, share = {}, somaRef = 0;
    if (kRef != null) Object.keys(atrib[kRef]).forEach(function (key) { somaRef += atrib[kRef][key]; });
    postes.forEach(function (q) { share[q.key] = kRef != null && somaRef > 0 ? (atrib[kRef][q.key] || 0) / somaRef : 1 / postes.length; });
    function bTrib(key) { return kRef != null ? (atrib[kRef][key] || 0) / Math.max(1e-6, W / 2) : 0; }   /* comprimento de fachada tributário do montante */

    /* ---------- pesos próprios dos itens SEM caminho próprio (varredor, diagonais, guarda-corpo, topo, postes de guarda, conexões, rodapés): por nível e
       repartidos pela área tributária. Pranchas, transversais e longitudinais dos pisos entram pelo CAMINHO DE CARGA (abaixo). Montantes e luvas dos montantes
       ficam com o PRÓPRIO montante. */
    function nivelDe(y) { var b = 0, bd = Infinity; for (var j = 0; j <= nL; j++) { var dd = Math.abs(niv[j].y - y); if (dd < bd - 1e-9) { bd = dd; b = j; } } return b; }
    var Gb = []; for (var jb = 0; jb <= nL; jb++) Gb.push(0);
    var proprio = {}; postes.forEach(function (q) { proprio[q.key] = { barras: [], luvas: [] }; });
    modelo.barras.forEach(function (b) {
      if (b.papel === "ancoragem" || b.papel === "travessa" || b.papel === "transversal") return;
      var w = b.L * wTubo;
      if (b.papel === "montante" && b.poste && proprio[b.poste]) { proprio[b.poste].barras.push({ y0: Math.min(b.a[1], b.b[1]), y1: Math.max(b.a[1], b.b[1]), w: wTubo }); return; }
      Gb[nivelDe((b.a[1] + b.b[1]) / 2)] += w;
    });
    var CAT = A ? A.CATALOGO.pecas : {}, pesoConex = { fixa: 1.24, giratoria: 1.24, luva: 0.5, rodape: 1.30, prancha: 1.24 };
    if (CAT.bracFixa) { pesoConex.fixa = CAT.bracFixa.pesoKg; pesoConex.prancha = CAT.bracFixa.pesoKg; }
    if (CAT.bracGiratoria) pesoConex.giratoria = CAT.bracGiratoria.pesoKg;
    if (CAT.luva) pesoConex.luva = CAT.luva.pesoKg;
    modelo.conexoes.forEach(function (c) {
      var pk = pesoConex[c.tipo]; if (pk == null) return;
      var w = pk * GRAV / 1000, ligaMont = null;
      arr(c.barras).forEach(function (id) { var b = barrasPorId[id]; if (b && b.papel === "montante" && b.poste) ligaMont = b.poste; });
      if (c.tipo === "luva" && ligaMont) { proprio[ligaMont].luvas.push({ y: c.pos[1], w: w }); return; }
      Gb[nivelDe(c.pos[1])] += w;
    });
    modelo.rodapes.forEach(function (x) { var pu = A ? A.pesoDaPeca(x.cod, x.L, { a: x.alt, e: x.esp }) : null; if (pu != null) Gb[clamp(x.nivel, 0, nL)] += pu * GRAV / 1000; });
    /* E9: o peso da escada de acesso entra nas cargas do nível onde ela se apoia — quando tem fonte. Sem fonte (todas, hoje) NÃO entra e isso fica dito no memorial
       (peso nulo não é zero silencioso). A torre de escada coletiva (modelo.torre) tem estrutura própria e NÃO é verificada aqui. */
    var acSemPeso = 0;
    modelo.acessos.forEach(function (x) { var pu = A ? A.pesoDaPeca(x.cod, x.L) : null; if (pu != null) Gb[clamp(x.nivel, 0, nL)] += pu * GRAV / 1000; else acSemPeso++; });
    if (acSemPeso) naoV.push("Peso da escada de acesso (" + acSemPeso + " peça" + (acSemPeso > 1 ? "s" : "") + ") sem fonte de catálogo: não somado nas cargas dos montantes (o responsável técnico informa o peso da locadora).");
    if (modelo.torre) naoV.push("Torre de escada de uso coletivo (" + modelo.torre.barras.length + " tubos, " + modelo.torre.bases.length + " bases): montantes, bases e ligação ao andaime NÃO verificados por este cálculo — o responsável técnico confere (NR-18 18.12.14 b).");
    function yIni(k) { return k <= 1 ? 0 : niv[k - 1].y; }
    function proprioAcima(key, y) {
      var t = 0, pp = proprio[key]; if (!pp) return 0;
      pp.barras.forEach(function (b) { var l = Math.max(0, b.y1 - Math.max(y, b.y0)); t += l * b.w; });
      pp.luvas.forEach(function (lv) { if (lv.y >= y - 1e-9) t += lv.w; });
      return t;
    }
    /* reações de cada nível em cada montante (serviço): partes G e Q do CAMINHO DE CARGA + a parte repartida dos demais itens */
    var RGc = [], RQc = []; for (var jr = 0; jr <= nL; jr++) { RGc.push({}); RQc.push({}); }
    function addR(tab, j, key, v) { tab[j][key] = (tab[j][key] || 0) + v; }
    function RG(j, key) { return (RGc[j][key] || 0) + (share[key] || 0) * Gb[j]; }
    function RQ(j, key) { return RQc[j][key] || 0; }

    /* ============ CAMINHO DE CARGA (C7/C8): pranchão contínuo → transversal → longitudinal contínua com rótula nas luvas → montantes */
    var transvs = {};   /* nivel|trecho → [{b, s, RG, RQ}] ordenadas por s */
    modelo.barras.forEach(function (b) {
      if (b.papel !== "transversal" || b.nivel < 1) return;
      var T = modelo.trechos[b.trecho], e0 = modelo.estacoes[T.est[0]], sT = e0.s + (b.a[0] - e0.pi[0]) * T.u[0] + (b.a[2] - e0.pi[1]) * T.u[1];
      var key = b.nivel + "|" + b.trecho; (transvs[key] = transvs[key] || []).push({ b: b, s: sT, RG: 0, RQ: 0 });
    });
    Object.keys(transvs).forEach(function (key) { transvs[key].sort(function (x, y) { return x.s - y.s; }); });
    var transvPorId = {}; Object.keys(transvs).forEach(function (key) { transvs[key].forEach(function (o) { transvPorId[o.b.id] = o; }); });
    var EIm = P.EMadeira * 98.0665 * P.IMadeira * 1e-8, ppM = P.pesoMadeiraKgfM * GRAV / 1000;   /* kN·m² e kN/m do pranchão de 0,30 m */
    var celulas = {};
    modelo.pranchas.forEach(function (pr) {
      if (!madeira) return;
      var T = modelo.trechos[pr.trecho]; if (!T) return;
      var key = pr.nivel + "|" + pr.trecho + "|" + pr.celula, e0 = modelo.estacoes[T.est[0]];
      function sDe(pt) { return e0.s + (pt[0] - e0.pi[0]) * T.u[0] + (pt[2] - e0.pi[1]) * T.u[1]; }
      var c = celulas[key];
      if (!c) {
        var sa = Math.min(sDe(pr.a), sDe(pr.b)), sb = Math.max(sDe(pr.a), sDe(pr.b));
        var ap = arr(transvs[pr.nivel + "|" + pr.trecho]).filter(function (o) { return o.s >= sa - 1e-6 && o.s <= sb + 1e-6; });
        c = celulas[key] = { nivel: pr.nivel, trecho: pr.trecho, sa: sa, sb: sb, ap: ap, eq: 0, ids: [] };
      }
      c.eq += pr.larg / 0.30; c.ids.push(pr.id);
    });
    var cel = [];
    Object.keys(celulas).forEach(function (key) {
      var c = celulas[key]; cel.push(c);
      if (c.ap.length < 2) { c.semApoio = true; return; }
      var xs = c.ap.map(function (o) { return o.s; }), q = P.qServ * fK(c.nivel) * 0.30;
      var cfg = { x0: c.sa, x1: c.sb, apoios: xs, EI: EIm, h: 0.1 };
      var casos = [{ w: ppM }, { w: q }];
      for (var i = 0; i + 1 < xs.length; i++) casos.push({ wSeg: [{ x0: xs[i], x1: xs[i + 1], w: q }] });
      /* carga concentrada: no meio de cada vão, mais o peso próprio (verificação à parte do q distribuído) */
      var pontos = [];
      arr(P.pontuais).forEach(function (pt) {
        var Pp = pt.P * Math.min(1, 0.30 / pt.a);   /* parte da carga que o pranchão de 0,30 m recebe */
        for (var i2 = 0; i2 + 1 < xs.length; i2++) pontos.push({ def: pt, vao: i2, caso: casos.length, Pp: Pp }), casos.push({ w: ppM, pts: [{ x: (xs[i2] + xs[i2 + 1]) / 2, P: Pp }] });
      });
      var r = viga(cfg, casos);
      c.xs = xs; c.q = q; c.res = r; c.pontos = pontos;
      var nGq = r[1].R.length;
      c.RG = r[0].R; c.RQ = r[1].R;
      for (var t = 0; t < nGq; t++) { c.ap[t].RG += r[0].R[t] * c.eq; c.ap[t].RQ += r[1].R[t] * c.eq * kLarg; }
    });
    /* transversal: biapoiada nas duas longitudinais, carga das pranchas distribuída em W */
    Object.keys(transvPorId).forEach(function (id) {
      var o = transvPorId[id], b = o.b;
      out.caminho.transversais.push({ id: id, nivel: b.nivel, s: o.s, RG_kN: o.RG, RQ_kN: o.RQ });
    });
    /* longitudinal: cada corrida (barras seguidas do mesmo nível e da mesma linha) é uma viga contínua nos montantes */
    function corridasDe(papel, nivelOk, extra) {
      var g = {};
      modelo.barras.forEach(function (b) { if (b.papel === papel && nivelOk(b)) { var key = b.corrida + "|" + (b.nivel == null ? "" : b.nivel); (g[key] = g[key] || []).push(b); } });
      return Object.keys(g).map(function (key) {
        var bs = g[key], a0 = bs[0].a, b0 = bs[0].b, dx = b0[0] - a0[0], dz = b0[2] - a0[2], ln = Math.sqrt(dx * dx + dz * dz) || 1, u = [dx / ln, dz / ln];
        var tmin = Infinity, tmax = -Infinity;
        bs.forEach(function (b) { [b.a, b.b].forEach(function (pt) { var t = (pt[0] - a0[0]) * u[0] + (pt[2] - a0[2]) * u[1]; tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }); });
        var ps = [];
        postes.forEach(function (q) { var t = (q.x - a0[0]) * u[0] + (q.z - a0[2]) * u[1], lat = (q.x - a0[0]) * u[1] - (q.z - a0[2]) * u[0]; if (Math.abs(lat) <= 0.03 && t >= tmin - 0.03 && t <= tmax + 0.03) ps.push({ t: t, key: q.key }); });
        arr(extra).forEach(function (eb) { var t = (eb.a[0] - a0[0]) * u[0] + (eb.a[2] - a0[2]) * u[1], lat = (eb.a[0] - a0[0]) * u[1] - (eb.a[2] - a0[2]) * u[0]; if (Math.abs(lat) <= 0.03 && t >= tmin - 0.03 && t <= tmax + 0.03 && Math.abs(eb.a[1] - a0[1]) < 3) ps.push({ t: t, key: "G:" + eb.id, guarda: true }); });
        ps.sort(function (x, y) { return x.t - y.t; });
        var luvas = []; bs.forEach(function (b) { var tt = tDeBarra({ a0: a0, u: u }, b); if (tt[1] < tmax - 1e-3) luvas.push(tt[1]); });
        return { barras: bs, a0: a0, u: u, tmin: tmin, tmax: tmax, postes: ps, nivel: bs[0].nivel, linha: bs[0].linha, luvas: luvas, corrida: bs[0].corrida };
      });
    }
    function tDeBarra(c, b) { var t1 = (b.a[0] - c.a0[0]) * c.u[0] + (b.a[2] - c.a0[2]) * c.u[1], t2 = (b.b[0] - c.a0[0]) * c.u[0] + (b.b[2] - c.a0[2]) * c.u[1]; return [Math.min(t1, t2), Math.max(t1, t2)]; }
    var longs = [];   /* resultados por corrida de longitudinal (travessa) */
    for (var kLv = 1; kLv <= nL; kLv++) (function (k) {
      corridasDe("travessa", function (b) { return b.nivel === k; }).forEach(function (c) {
        if (c.postes.length < 2) { c.semApoio = true; longs.push(c); return; }
        var cargas = [];
        Object.keys(transvs).forEach(function (kk) {
          if (kk.split("|")[0] !== String(k)) return;
          transvs[kk].forEach(function (o) {
            var tb = o.b, dxT = tb.b[0] - tb.a[0], dzT = tb.b[2] - tb.a[2], den = dxT * c.u[1] - dzT * c.u[0];
            if (Math.abs(den) < 1e-9) return;
            var rx = c.a0[0] - tb.a[0], rz = c.a0[2] - tb.a[2], sP = (rx * c.u[1] - rz * c.u[0]) / den;
            if (sP < -0.01 || sP > 1.01) return;
            var px = tb.a[0] + dxT * sP, pz = tb.a[2] + dzT * sP, t = (px - c.a0[0]) * c.u[0] + (pz - c.a0[2]) * c.u[1];
            if (t < c.tmin - 0.05 || t > c.tmax + 0.05) return;
            cargas.push({ t: clamp(t, c.tmin, c.tmax), o: o });
          });
        });
        var ts = c.postes.map(function (q) { return q.t; });
        c.cargas = cargas;
        c.cfg = { x0: c.tmin, x1: c.tmax, apoios: ts, rotulas: P.luvaRigida ? [] : c.luvas, EI: EI, h: 0.2 };
        var ptsG = cargas.map(function (q) { return { x: q.t, P: (q.o.RG + wTubo * q.o.b.L) / 2 }; }), ptsQ = cargas.map(function (q) { return { x: q.t, P: q.o.RQ / 2, i: q }; });
        var casos = [{ w: wTubo, pts: ptsG }, { pts: ptsQ }];
        for (var i = 0; i + 1 < ts.length; i++) {
          var a = ts[i], bb = ts[i + 1], lastE = i + 2 === ts.length, firstE = i === 0;
          casos.push({ pts: ptsQ.filter(function (p) { return (p.x >= a - 1e-9 && p.x < bb - 1e-9) || (firstE && p.x < a) || (lastE && p.x >= bb - 1e-9); }) });
        }
        c.res = viga(c.cfg, casos); c.ts = ts;
        if (c.res.some(function (r0) { return r0.instavel; })) { c.instavel = true; c.cfg = { x0: c.cfg.x0, x1: c.cfg.x1, apoios: c.cfg.apoios, rotulas: [], EI: EI, h: 0.2 }; c.res = viga(c.cfg, casos); }
        var R0 = c.res[0].R, R1 = c.res[1].R;
        c.postes.forEach(function (q, i2) { if (q.guarda) return; addR(RGc, k, q.key, R0[i2]); addR(RQc, k, q.key, R1[i2]); });
        longs.push(c);
        out.caminho.longitudinais.push({ corrida: c.corrida, nivel: k, linha: c.linha, reacoes: c.postes.map(function (q, i2) { return { poste: q.key, RG_kN: R0[i2], RQ_kN: R1[i2] }; }), luvas: c.luvas.slice() });
      });
    })(kLv);
    /* envoltória do momento vertical (ELU/ELS) de uma corrida: máx. |gG·M_G + gQ·M_Qp| sobre os padrões de Q alternado */
    function mVert(c, gG, gQ, X0, X1) {
      if (!c.res) return 0;
      var best = 0, M0 = c.res[0].M, X = c.res[0].X;
      for (var p = 1; p < c.res.length; p++) for (var i = 0; i < X.length; i++) {
        if (X0 != null && (X[i] < X0 - 1e-9 || X[i] > X1 + 1e-9)) continue;
        best = Math.max(best, Math.abs(gG * M0[i] + gQ * c.res[p].M[i]));
      }
      return best;
    }
    function fVert(c, i0, i1) {   /* flecha ELS máxima (G+Q) no vão entre os montantes i0 e i1 (o padrão que mais deforma) */
      var best = 0, X = c.res[0].X;
      for (var p = 1; p < c.res.length; p++) for (var i = 0; i < X.length; i++) if (X[i] > c.ts[i0] + 1e-9 && X[i] < c.ts[i1] - 1e-9) best = Math.max(best, Math.abs(c.res[0].v[i] + c.res[p].v[i]));
      return best;
    }

    /* ---------- verificações: construtores */
    var verifs = [];
    function nova(id, tipo, titulo, fonte) { var v = { id: id, tipo: tipo, pecas: [], titulo: titulo, formula: "", valores: {}, texto: "", solicitante: "", resistente: "", uso: null, estado: "nao_verificado", fonte: fonte, confirmarRT: [], ressalvas: [], porPeca: {}, corrigir: [] }; verifs.push(v); return v; }
    function peca(v, id, uso, estado) { if (!v.porPeca[id]) v.pecas.push(id); var o = v.porPeca[id]; if (!o) v.porPeca[id] = { uso: uso, estado: estado || estadoDe(uso) }; else { if (uso != null && (o.uso == null || uso > o.uso)) o.uso = uso; o.estado = piorEstado(o.estado, estado || estadoDe(uso)); } }
    function fecha(v) {
      var u = null, e = "ok", ids = Object.keys(v.porPeca);
      if (!ids.length) { v.estado = "nao_verificado"; return v; }
      ids.forEach(function (id) { var o = v.porPeca[id]; if (o.uso != null && (u == null || o.uso > u)) u = o.uso; e = piorEstado(e, o.estado); });
      v.uso = u; v.estado = e === "ok" && u == null ? "nao_verificado" : e;
      return v;
    }

    /* ============ 3. TRANSVERSAL — biapoiada nas duas longitudinais (vão = W), carga das pranchas contínuas em W */
    (function () {
      var v = nova("transversal", "transversal", "Transversal: flexão e flecha", "NBR 8800:2008 5.4 (tubo circular, G.2.3); flecha L/200 (confirmarRT); cargas = reações do pranchão CONTÍNUO");
      v.confirmarRT = ["limite de flecha L/200 da transversal"];
      var gov = null;
      Object.keys(transvPorId).forEach(function (id) {
        var o = transvPorId[id], b = o.b, L = W;
        var Gt = o.RG + wTubo * L, Qt = o.RQ;
        var Md = (1.25 * Gt + 1.5 * Qt) * L / 8, delta = 5 * ((Gt + Qt) / L) * Math.pow(L, 4) / (384 * EI);
        var uM = Md / MRd, uF = delta / (L / P.flechaTuboRel), u = Math.max(uM, uF);
        peca(v, id, u);
        if (!gov || u > gov.u) gov = { u: u, uM: uM, uF: uF, Md: Md, delta: delta, R: Gt + Qt, L: L, id: id, k: b.nivel, RG: o.RG, RQ: o.RQ };
      });
      if (!gov) return;
      v.formula = "carga = reações do pranchão contínuo (G + Q) distribuídas em W; Msd = (1,25·G + 1,5·Q)·L/8 ≤ MRd; δ = 5·w·L⁴/(384·E·I) ≤ L/" + P.flechaTuboRel;
      v.valores = { vao_m: gov.L, RG_kN: gov.RG, RQ_kN: gov.RQ, Msd_kNm: gov.Md, MRd_kNm: MRd, delta_m: gov.delta, deltaLim_m: gov.L / P.flechaTuboRel, usoFlexao: gov.uM, usoFlecha: gov.uF };
      v.texto = "Transversal " + gov.id + " (nível " + gov.k + "), vão " + brf(gov.L, 3) + " m, recebe do pranchão contínuo G = " + brf(gov.RG, 3) + " kN e Q = " + brf(gov.RQ, 3) + " kN: Msd = " + brf(gov.Md, 3) + " kN·m ≤ MRd = " + brf(MRd, 3) + " kN·m (uso " + brf(gov.uM, 3) + "); flecha = " + brf(gov.delta * 1000, 1) + " mm ≤ " + brf(gov.L / P.flechaTuboRel * 1000, 1) + " mm (uso " + brf(gov.uF, 3) + ").";
      v.solicitante = "Msd = " + brf(gov.Md, 3) + " kN·m; δ = " + brf(gov.delta * 1000, 1) + " mm"; v.resistente = "MRd = " + brf(MRd, 3) + " kN·m; δlim = " + brf(gov.L / P.flechaTuboRel * 1000, 1) + " mm";
      fecha(v);
    })();

    /* ============ 2. TRAVESSA (longitudinal) — viga contínua nos montantes, rótula em cada luva, Q alternado por vão */
    (function () {
      var v = nova("travessa", "travessa", "Travessa (longitudinal): flexão e flecha", "NBR 8800:2008 5.4 (tubo circular, G.2.3); flecha L/200 (NBR 6494 3.1.7 do piso, estendida à travessa — confirmarRT); luva = rótula (sem fonte da rigidez da luva)");
      v.confirmarRT = ["limite de flecha L/200 da travessa", "rigidez da luva à flexão (rótula por padrão)"];
      var gov = null;
      longs.forEach(function (c) {
        if (c.semApoio) { c.barras.forEach(function (b) { peca(v, b.id, null, "nao_verificado"); }); return; }
        if (c.instavel) { c.barras.forEach(function (b) { peca(v, b.id, 99, "falha"); }); v.ressalvas.push("Nível " + c.nivel + ", linha " + c.linha + ": a luva como rótula deixa um trecho da longitudinal sem apoio suficiente (mecanismo) — mude a emenda ou informe a capacidade da luva (luvaRigida, RT)."); if (!gov || 99 > gov.u) gov = { u: 99, uM: 99, uF: 99, Md: 0, delta: 0, vao: 0, nivel: c.nivel, nRot: c.luvas.length, nVaos: c.ts.length - 1, Rmax: 0, posteRmax: "—", linha: c.linha, mecanismo: true }; return; }
        var Mel = mVert(c, 1.25, 1.5), uMtot = Mel / MRd;
        c.barras.forEach(function (b) {
          var tt = tDeBarra(c, b), Mb = mVert(c, 1.25, 1.5, tt[0], tt[1]), uF = 0;
          for (var i = 0; i + 1 < c.ts.length; i++) if (tt[1] > c.ts[i] + 1e-9 && tt[0] < c.ts[i + 1] - 1e-9) uF = Math.max(uF, fVert(c, i, i + 1) / ((c.ts[i + 1] - c.ts[i]) / P.flechaTuboRel));
          peca(v, b.id, Math.max(Mb / MRd, uF));
        });
        var uF2 = 0, vaoF = 0, dF = 0;
        for (var i = 0; i + 1 < c.ts.length; i++) { var Lv = c.ts[i + 1] - c.ts[i], df = fVert(c, i, i + 1), uu = df / (Lv / P.flechaTuboRel); if (uu > uF2) { uF2 = uu; vaoF = Lv; dF = df; } }
        var u = Math.max(uMtot, uF2);
        if (!gov || u > gov.u) {
          var R0 = c.res[0].R, R1 = c.res[1].R, imax = 0; for (var q = 0; q < R0.length; q++) if (R0[q] + R1[q] > R0[imax] + R1[imax]) imax = q;
          gov = { u: u, uM: uMtot, uF: uF2, Md: Mel, delta: dF, vao: vaoF, nivel: c.nivel, nRot: P.luvaRigida ? 0 : c.luvas.length, nVaos: c.ts.length - 1, Rmax: R0[imax] + R1[imax], posteRmax: c.postes[imax].key, linha: c.linha };
        }
      });
      if (!gov) { return; }
      v.formula = "viga contínua nos montantes, rótula em cada luva; cargas pontuais = reações das transversais (pranchão contínuo); Msd = máx. de |1,25·M_G + 1,5·M_Q(padrões alternados)| ≤ MRd; δ(G+Q) ≤ L/" + P.flechaTuboRel;
      v.valores = { vao_m: gov.vao, nRotulas: gov.nRot, Msd_kNm: gov.Md, MRd_kNm: MRd, delta_m: gov.delta, deltaLim_m: gov.vao / P.flechaTuboRel, usoFlexao: gov.uM, usoFlecha: gov.uF, nivel: gov.nivel, Rmax_kN: gov.Rmax };
      v.texto = "Travessa do nível " + gov.nivel + " (linha " + gov.linha + "): viga contínua com " + gov.nVaos + " vão(s) e " + gov.nRot + " rótula(s) nas luvas, Q alternado por vão: Msd = " + brf(gov.Md, 3) + " kN·m ≤ MRd = " + brf(MRd, 3) + " kN·m (uso " + brf(gov.uM, 3) + "); flecha = " + brf(gov.delta * 1000, 1) + " mm no vão de " + brf(gov.vao, 3) + " m ≤ L/" + P.flechaTuboRel + " = " + brf(gov.vao / P.flechaTuboRel * 1000, 1) + " mm (uso " + brf(gov.uF, 3) + "). Maior reação (serviço) em " + gov.posteRmax + ": " + nkn(gov.Rmax) + ".";
      v.solicitante = "Msd = " + brf(gov.Md, 3) + " kN·m; δ = " + brf(gov.delta * 1000, 1) + " mm"; v.resistente = "MRd = " + brf(MRd, 3) + " kN·m; δlim = " + brf(gov.vao / P.flechaTuboRel * 1000, 1) + " mm";
      fecha(v);
    })();

    /* ============ 4. PRANCHÃO — viga CONTÍNUA sobre as transversais reais: σ = M/W ≤ 80 kgf/cm², flecha ≤ L/200 (serviço); carga concentrada à parte */
    (function () {
      var v = nova("prancha", "prancha", "Pranchão do piso: flexão e flecha L/200", "R1 (apostila, secundária: σadm 80 kgf/cm², E 98 390 kgf/cm², I 137 cm⁴, W 72 cm³ para 3,8 × 30 pinho); NBR 6494:1990 3.1.7 (exemplar não licenciado)");
      var vp = nova("prancha_pontual", "prancha_pontual", "Pranchão do piso: carga concentrada de trabalho", "EN 12811-1 Tab. 3 classe 3 (secundária, DE MEMÓRIA: 1,5 kN em 0,5 × 0,5 m e 1,0 kN em 0,2 × 0,2 m); R1 (σadm e E do pinho)");
      v.confirmarRT = ["espécie e classe da madeira (σadm, E)", "seção 3,8 × 30 cm"]; vp.confirmarRT = ["cargas concentradas da classe de serviço (EN 12811-1, de memória)", "espécie da madeira"];
      if (!madeira) { naoV.push("Piso metálico com gancho: capacidade do piso sem fonte no catálogo — não verificado."); return; }
      var Wc = P.WMadeira, gov = null, govP = null, Lmaxm = 0;
      cel.forEach(function (c) {
        if (c.semApoio) { c.ids.forEach(function (id) { peca(v, id, 99, "falha"); peca(vp, id, 99, "falha"); }); v.ressalvas.push("Pranchão com menos de dois apoios (transversais)."); return; }
        var r = c.res, nSp = c.xs.length - 1, uCel = 0, info = null, uCelP = 0, infoP = null;
        /* distribuída: padrões G + Q(todos) e G + Q(vão i): tensão pelo momento extremo e flecha em cada vão */
        for (var p = 1; p < r.length && p < 2 + nSp; p++) for (var ip = 0; ip < r[0].X.length; ip++) {
          var Mx = Math.abs(r[0].M[ip] + r[p].M[ip]), sig = Mx * KGF_POR_KN * 100 / Wc, us = sig / P.sigmaMadeira;
          if (us > uCel) { uCel = us; info = info || {}; info.sig = sig; info.M = Mx; info.uS = us; }
        }
        var dmax = 0, vaoD = 0, uFl = 0;
        for (var i = 0; i < nSp; i++) {
          var Lv = c.xs[i + 1] - c.xs[i];
          for (var p2 = 1; p2 < 2 + nSp; p2++) for (var ix = 0; ix < r[0].X.length; ix++) if (r[0].X[ix] > c.xs[i] + 1e-9 && r[0].X[ix] < c.xs[i + 1] - 1e-9) { var dv = Math.abs(r[0].v[ix] + r[p2].v[ix]); if (dv / (Lv / P.flechaPisoRel) > uFl) { uFl = dv / (Lv / P.flechaPisoRel); dmax = dv; vaoD = Lv; } }
          Lmaxm = Math.max(Lmaxm, Lv);
        }
        var u = Math.max(uCel, uFl);
        c.ids.forEach(function (id) { peca(v, id, u); });
        if (!gov || u > gov.u) gov = { u: u, uS: uCel, uF: uFl, sig: info ? info.sig : 0, M: info ? info.M : 0, delta: dmax, L: vaoD, nSp: nSp, id: c.ids[0], nivel: c.nivel };
        /* concentrada */
        c.pontos.forEach(function (pp) {
          var rr = r[pp.caso], Lv2 = c.xs[pp.vao + 1] - c.xs[pp.vao], Mx2 = 0, dmx = 0;
          for (var ix2 = 0; ix2 < rr.X.length; ix2++) { Mx2 = Math.max(Mx2, Math.abs(rr.M[ix2])); if (rr.X[ix2] > c.xs[pp.vao] + 1e-9 && rr.X[ix2] < c.xs[pp.vao + 1] - 1e-9) dmx = Math.max(dmx, Math.abs(rr.v[ix2])); }
          var sg = Mx2 * KGF_POR_KN * 100 / Wc, uu = Math.max(sg / P.sigmaMadeira, dmx / (Lv2 / P.flechaPisoRel));
          if (uu > uCelP) { uCelP = uu; infoP = { sig: sg, delta: dmx, L: Lv2, def: pp.def, Pp: pp.Pp, uS: sg / P.sigmaMadeira, uF: dmx / (Lv2 / P.flechaPisoRel), M: Mx2 }; }
        });
        c.ids.forEach(function (id) { peca(vp, id, uCelP); });
        if (infoP && (!govP || uCelP > govP.u)) { govP = infoP; govP.u = uCelP; govP.id = c.ids[0]; }
      });
      if (!gov) return;
      var Pdef = function (L) { return 48 * P.EMadeira * P.IMadeira / (P.flechaPisoRel * L * L * 1e4); };   /* kgf: carga pontual a meio vão que dá flecha L/200, L em m */
      v.formula = "pranchão = viga contínua sobre as transversais reais (balanços incluídos), w = qServ·0,30 + peso próprio, Q alternado por vão; σ = M/W ≤ " + P.sigmaMadeira + " kgf/cm²; δ ≤ L/" + P.flechaPisoRel + " em cada vão (serviço, sem majorar)";
      v.valores = { vao_m: gov.L, nVaos: gov.nSp, M_kNm: gov.M, sigma_kgfcm2: gov.sig, sigmaAdm_kgfcm2: P.sigmaMadeira, delta_m: gov.delta, deltaLim_m: gov.L / P.flechaPisoRel, usoSigma: gov.uS, usoFlecha: gov.uF, maiorVao_m: Lmaxm,
        ref_apostila_Padm2m_kgf: Pdef(2.0), ref_apostila_Padm15m_kgf: Pdef(1.5), ref_apostila_Padm1m_kgf: Pdef(1.0) };
      v.texto = "Pranchão " + gov.id + " (nível " + gov.nivel + "), viga contínua de " + gov.nSp + " vão(s): M = " + brf(gov.M, 3) + " kN·m; σ = " + brf(gov.sig, 1) + " ≤ " + P.sigmaMadeira + " kgf/cm² (uso " + brf(gov.uS, 3) + "); flecha = " + brf(gov.delta * 1000, 2) + " mm no vão de " + brf(gov.L, 2) + " m ≤ L/" + P.flechaPisoRel + " (uso " + brf(gov.uF, 3) + "). Conferência com a apostila (carga pontual a meio vão por L/200): vão 2,00 m → " + brf(Pdef(2.0), 0) + " kgf (apostila 82); 1,50 m → " + brf(Pdef(1.5), 0) + " (146); 1,00 m → " + brf(Pdef(1.0), 0) + " (329).";
      v.solicitante = "σ = " + brf(gov.sig, 1) + " kgf/cm²; δ = " + brf(gov.delta * 1000, 2) + " mm"; v.resistente = "σadm = " + P.sigmaMadeira + " kgf/cm²; δlim = " + brf(gov.L / P.flechaPisoRel * 1000, 1) + " mm";
      fecha(v);
      if (govP) {
        vp.formula = "carga concentrada P·min(1; 0,30/a) no meio de cada vão (+ peso próprio), viga contínua; σ = M/W ≤ " + P.sigmaMadeira + " kgf/cm²; δ ≤ L/" + P.flechaPisoRel;
        vp.valores = { P_kN: govP.def.P, a_m: govP.def.a, P_pranchao_kN: govP.Pp, vao_m: govP.L, M_kNm: govP.M, sigma_kgfcm2: govP.sig, delta_m: govP.delta, usoSigma: govP.uS, usoFlecha: govP.uF };
        vp.texto = "Carga de " + brf(govP.def.P, 2) + " kN em " + brf(govP.def.a, 2) + " × " + brf(govP.def.a, 2) + " m (pranchão recebe " + brf(govP.def.P * Math.min(1, 0.30 / govP.def.a), 2) + " kN) no vão de " + brf(govP.L, 2) + " m: σ = " + brf(govP.sig, 1) + " kgf/cm² (uso " + brf(govP.uS, 3) + "); flecha = " + brf(govP.delta * 1000, 2) + " mm (uso " + brf(govP.uF, 3) + ").";
        vp.solicitante = "σ = " + brf(govP.sig, 1) + " kgf/cm²; δ = " + brf(govP.delta * 1000, 2) + " mm"; vp.resistente = "σadm = " + P.sigmaMadeira + " kgf/cm²; δ ≤ L/" + P.flechaPisoRel;
        fecha(vp);
      }
    })();

    /* ---------- contenção dos nós, flambagem por autovalor, vento no montante e guarda-corpo sobre apoios elásticos (E4.3) */
    var estDePoste = {};
    modelo.estacoes.forEach(function (e) { if (e.pi) { var k1 = posteEm(e.pi[0], e.pi[1]); if (k1) estDePoste[k1] = e.id; } var k2 = posteEm(e.pe[0], e.pe[1]); if (k2) estDePoste[k2] = e.id; });
    var ancEst = {};   /* estacao|nivel (ou |T = topo) → ancoragem */
    modelo.ancoragens.forEach(function (a) { ancEst[a.estacao + "|" + (a.topo ? "T" : a.nivel)] = a; });
    var temTopo = modelo.ancoragens.some(function (a) { return a.topo; }), yTopoAnc = temTopo ? modelo.ancoragens.filter(function (a) { return a.topo; })[0].y : null;
    var dtEst = {}; modelo.barras.forEach(function (b) { if (b.papel === "diagonalTransv" && b.estacao != null) dtEst[b.estacao + "|" + b.nivel] = true; });
    function trussAte(e, j) { for (var l = 1; l <= j; l++) if (!dtEst[e + "|" + l]) return false; return true; }
    var estOrdenadas = modelo.estacoes.filter(function (e) { return !e.outerOnly; }).map(function (e) { return { id: e.id, cum: e.cum }; }).sort(function (x, y) { return x.cum - y.cum; });
    var estPorId = {}; modelo.estacoes.forEach(function (e) { estPorId[e.id] = e; });
    var Atubo = s.A * 1e-6, Ekpa = E * 1e3;
    /* conjunto de estações que seguram a longitudinal do nível j (ancoradas, ou com pórtico transversal diagonalizado); no topo só as ancoradas do topo */
    function ehApoio(id, j) { return j === "T" ? !!ancEst[id + "|T"] : !!(ancEst[id + "|" + j] || trussAte(id, j)); }
    /* rigidez de UMA longitudinal biapoiada entre as estações-apoio mais próximas, vista pelo nó da estação e: 3EI·L/(a²b²) (as duas) · 3EI/a³ (uma só). Cada longitudinal contém o SEU montante */
    /* C-T1 (revisão adversarial, Anexo T): no VENTO só estação ANCORADA é apoio das longitudinais. O pórtico transversal diagonalizado tem pé articulado
       (a base regulável só apoia, não segura tração): um pórtico "apoiando" o vento daria ~17 kN de levantamento numa base que não resiste a tração.
       Por isso o vento usa ehApoioV/kLongDe(.., true) e kTr = 0; o pórtico fica SÓ na contenção por flambagem (autovalor, força nodal de 1 %). */
    function ehApoioV(id, j) { return !!ancEst[id + "|" + j]; }
    function kLongDe(e, j, soAnc) {
      var cum = estPorId[e].cum, esq = null, dir = null;
      estOrdenadas.forEach(function (o) { if (o.id === e || !(soAnc ? ehApoioV(o.id, j) : ehApoio(o.id, j))) return; if (o.cum < cum - 1e-6 && (esq == null || cum - o.cum < esq)) esq = cum - o.cum; if (o.cum > cum + 1e-6 && (dir == null || o.cum - cum < dir)) dir = o.cum - cum; });
      if (esq != null && dir != null) return 3 * EI * (esq + dir) / (esq * esq * dir * dir);
      if (esq != null) return 3 * EI / Math.pow(esq, 3);
      if (dir != null) return 3 * EI / Math.pow(dir, 3);
      return 0;
    }
    /* pórtico transversal diagonalizado (2 montantes + transversais + diagonais, pés articulados): rigidez lateral do nó j = 1/(flexão dos banzos + cisalhamento das diagonais) */
    function kTruss(e, j) {
      if (j === "T" || !trussAte(e, j)) return 0;
      var yj = niv[j].y, Ieq = Atubo * W * W / 2, d = yj * yj * yj / (3 * Ekpa * Ieq), yPrev = 0;
      for (var l = 1; l <= j; l++) { var h = niv[l].y - yPrev, Ld = Math.sqrt(W * W + h * h); d += Ld * Ld * Ld / (Ekpa * Atubo * W * W); yPrev = niv[l].y; }
      return 1 / d;
    }
    /* nós de um montante: { j, y, tipo: rigido | mola | livre, kLong, kTr } */
    function nosDe(key, yPost) {
      var e = estDePoste[key], nos = [];
      if (e == null) return nos;
      for (var j = 1; j <= nL; j++) {
        if (ancEst[e + "|" + j]) { nos.push({ j: j, y: niv[j].y, tipo: "rigido", tipoV: "rigido", kLong: Infinity, kLongV: Infinity, kTr: 0 }); continue; }
        var kl = kLongDe(e, j), kt = kTruss(e, j), klV = kLongDe(e, j, true);   /* tipo/kLong/kTr = contenção (flambagem); tipoV/kLongV = vento (só ancoradas, sem pórtico) */
        nos.push({ j: j, y: niv[j].y, tipo: kl + kt > 0 ? "mola" : "livre", tipoV: klV > 0 ? "mola" : "livre", kLong: kl, kLongV: klV, kTr: kt });
      }
      if (temTopo && yTopoAnc != null && yTopoAnc < yPost + 1e-6) {
        if (ancEst[e + "|T"]) nos.push({ j: "T", y: yTopoAnc, tipo: "rigido", tipoV: "rigido", kLong: Infinity, kLongV: Infinity, kTr: 0 });
        else { var klT = kLongDe(e, "T"); nos.push({ j: "T", y: yTopoAnc, tipo: klT > 0 ? "mola" : "livre", tipoV: klT > 0 ? "mola" : "livre", kLong: klT, kLongV: klT, kTr: 0 }); }
      }
      return nos;
    }
    function yTopoPoste(key) { var y = 0; modelo.barras.forEach(function (b) { if (b.papel === "montante" && b.poste === key) y = Math.max(y, b.a[1], b.b[1]); }); return y; }

    /* ---- autovalor 1D do montante (C: contenção nodal sem corte binário): molas reais nos nós; N varia com a altura; as emendas ficam como estão (contínuo) */
    var COMBO_A = { gG: 1.25, gQ: 1.5 };
    function NProf(key, y, gG, gQ) {   /* compressão (kN) na cota y: peso do tubo acima + reações dos níveis acima */
      var N = gG * proprioAcima(key, y);
      for (var j = 1; j <= nL; j++) if (niv[j].y > y + 1e-9) N += gG * RG(j, key) + gQ * RQ(j, key);
      return N;
    }
    out.ventoModelo = { total: 0, chao: 0, rigidas: 0, molas: 0 }; out.topo = []; out.nos = []; out.trilhos = [];
    var pf = {}, ncrInfo = {};   /* pf[key] = resposta do montante ao vento e a cargas unitárias; ncrInfo[key] = { lambda } */
    postes.forEach(function (q) {
      var yPost = yTopoPoste(q.key), nos = nosDe(q.key, yPost), rig = [0], mol = [];
      nos.forEach(function (nn) { if (nn.tipo === "rigido") rig.push(nn.y); else if (nn.tipo === "mola") mol.push({ x: nn.y, k: nn.kLong + nn.kTr / 2 }); });
      var lam = ncrColuna({ x0: 0, x1: yPost, apoios: rig, molas: mol, EI: EI, h: 0.25, N: function (y) { return NProf(q.key, y, COMBO_A.gG, COMBO_A.gQ); } });
      ncrInfo[q.key] = { lambda: lam, nos: nos, yPost: yPost };
      nos.forEach(function (nn) { out.nos.push({ poste: q.key, no: nn.j, tipo: nn.tipo, tipoVento: nn.tipoV, kLong_kNm: nn.kLong === Infinity ? null : nn.kLong, kLongVento_kNm: nn.kLongV === Infinity ? null : nn.kLongV, kTruss_kNm: nn.kTr }); });
    });

    /* ---- vento no montante: viga vertical contínua (EI do tubo) sobre o chão, as ancoragens (rígidas) e as molas dos nós (par: 2 longitudinais + pórtico) */
    var niveisGuarda = pisoLv.slice().sort(function (a, b) { return a - b; });
    function alturaTrilho(kp, tipo) { return niv[kp].yPiso + (tipo === "g" ? guardaH : (modelo.par.intermediaria || 0.70)); }
    postes.forEach(function (q) {
      var inf = ncrInfo[q.key], yPost = inf.yPost, nos = inf.nos, rig = [0], mol = [], bT = bTrib(q.key);
      if (!(yPost > 0.5)) return;
      nos.forEach(function (nn) { if (nn.tipoV === "rigido") rig.push(nn.y); else if (nn.tipoV === "mola") mol.push({ x: nn.y, k: 2 * nn.kLongV }); });   /* C-T1: sem kTr no vento */
      var segs = [], nS = Math.max(1, Math.ceil(yPost / 0.25)), dS = yPost / nS;
      if (vt.ok) for (var iS = 0; iS < nS; iS++) { var ym = (iS + 0.5) * dS, cf = q.outer ? cfCamada(ym) : P.caTubo * solidez; segs.push({ x0: iS * dS, x1: (iS + 1) * dS, w: qAt(ym) * cf * bT }); }
      var casos = [{ wSeg: segs, pts: [] }];
      niveisGuarda.forEach(function (kp) { ["g", "i"].forEach(function (t) { casos.push({ pts: [{ x: Math.min(alturaTrilho(kp, t), yPost), P: 1 }] }); }); });
      var res = viga({ x0: 0, x1: yPost, apoios: rig, molas: mol, EI: EI, h: 0.25 }, casos);
      pf[q.key] = { res: res, yPost: yPost, rig: rig, mol: mol, nos: nos, inst: res[0].instavel };
      if (!res[0].instavel) { var vm = out.ventoModelo; segs.forEach(function (sg0) { vm.total += sg0.w * (sg0.x1 - sg0.x0); }); vm.chao += res[0].R[0]; for (var ir = 1; ir < res[0].R.length; ir++) vm.rigidas += res[0].R[ir]; res[0].Rm.forEach(function (x) { vm.molas += x; }); }
    });
    function maxMEm(r, y0, y1) { var m0 = 0; for (var i = 0; i < r.X.length; i++) if (r.X[i] >= y0 - 1e-6 && r.X[i] <= y1 + 1e-6) m0 = Math.max(m0, Math.abs(r.M[i])); return m0; }
    function vEm(r, y) { var bi = 0, bd = Infinity; for (var i = 0; i < r.X.length; i++) { var dd = Math.abs(r.X[i] - y); if (dd < bd) { bd = dd; bi = i; } } return r.v[bi]; }
    function casoRail(kp, t) { return 1 + niveisGuarda.indexOf(kp) * 2 + (t === "g" ? 0 : 1); }
    function kMain(key, kp, t) {   /* rigidez lateral do montante na altura do trilho = 1 / deslocamento da carga unitária */
      var f = pf[key]; if (!f || f.inst) return null; var d = Math.abs(vEm(f.res[casoRail(kp, t)], Math.min(alturaTrilho(kp, t), f.yPost))); return d > 1e-12 ? 1 / d : null;
    }

    /* ---- guarda-corpo: o trilho é viga contínua sobre APOIOS ELÁSTICOS (montantes e postes de guarda-corpo) com a rigidez real de cada um */
    var gpb = posteGrupoCorr(), railRes = {};   /* railRes[kp|t][key] = { R, k } */
    (function () {
      var Pi2 = modelo.par.intermediaria || 0.70;
      niveisGuarda.forEach(function (kp) {
        ["g", "i"].forEach(function (t) {
          var papel = t === "g" ? "guarda" : "intermediaria", w = (t === "g" ? P.guardaKgfM : P.intermKgfM) * GRAV / 1000, mapa = railRes[kp + "|" + t] = {};
          corridasDe(papel, function (b) { return b.nivel === kp && !b.cabeceira; }, gpb).forEach(function (c) {
            if (c.postes.length < 2) return;
            var molas = [], ok = true;
            c.postes.forEach(function (pq, i) {
              var k;
              if (pq.guarda) {
                var viz = (i > 0 ? pq.t - c.postes[i - 1].t : 0) + (i + 1 < c.postes.length ? c.postes[i + 1].t - pq.t : 0), Lr = Math.max(viz, 0.5);
                var kb = 48 * EI / Math.pow(Lr, 3), ag = alturaTrilho(kp, t) - niv[kp].y, ao = (t === "g" ? alturaTrilho(kp, "i") : alturaTrilho(kp, "g")) - niv[kp].y, yTopP = niv[kp].yPiso + guardaH + 0.05 - niv[kp].y;
                var rr = viga({ x0: 0, x1: yTopP, molas: [{ x: 0, k: kb }, { x: ao, k: kb }], EI: EI, h: 0.1 }, [{ pts: [{ x: ag, P: 1 }] }])[0];
                var d = Math.abs(vEm(rr, ag)); k = d > 1e-12 ? 1 / d : null;
              } else k = kMain(pq.key, kp, t);
              if (k == null) { ok = false; return; }
              molas.push({ x: pq.t, k: k, key: pq.key, guarda: !!pq.guarda });
            });
            if (!ok) return;
            var rrR = viga({ x0: c.tmin, x1: c.tmax, molas: molas, rotulas: P.luvaRigida ? [] : c.luvas, EI: EI, h: 0.2 }, [{ w: w }])[0];
            if (rrR.instavel) return;
            out.trilhos.push({ nivel: kp, tipo: t, corrida: c.corrida, somaR_kN: rrR.Rm.reduce(function (a0, x) { return a0 + x; }, 0), cargaTotal_kN: w * (c.tmax - c.tmin), nApoios: molas.length });
            molas.forEach(function (mm, i) { var R = Math.abs(rrR.Rm[i]); if (!mapa[mm.key] || R > mapa[mm.key].R) mapa[mm.key] = { R: R, k: mm.k, guarda: mm.guarda, trib: 0 }; });
          });
          /* cabeceira: meia largura em cada poste de ponta (apoio simples) */
          modelo.barras.forEach(function (b) { if (b.papel === papel && b.cabeceira && b.nivel === kp) [b.a, b.b].forEach(function (pt) { var kx = posteEm(pt[0], pt[2]); if (kx) { var R = w * W / 2; if (!mapa[kx] || R > mapa[kx].R) mapa[kx] = { R: R, k: null, guarda: false, cabeceira: true }; } }); });
        });
      });
    })();
    /* momento do guarda-corpo no montante no trecho [y0, y1] = R real × resposta da carga unitária */
    function MGuarda(key, kp, y0, y1) {
      var f = pf[key], m1 = 0; if (!f || f.inst) return 0;
      ["g", "i"].forEach(function (t) { var r0 = railRes[kp + "|" + t][key]; if (!r0) return; m1 = Math.max(m1, r0.R * maxMEm(f.res[casoRail(kp, t)], y0, y1)); });
      return m1;
    }
    function barraNoPoste2(key, y) { var l = modelo.barras.filter(function (b) { return b.papel === "montante" && b.poste === key && y >= Math.min(b.a[1], b.b[1]) - 1e-6 && y <= Math.max(b.a[1], b.b[1]) + 1e-6; }); return l.length ? l[0].id : null; }

    var COMBOS = [   /* NBR 8681: [rótulo, γG, γQ, γW] */
      { n: "Q principal + 0,6W", gG: 1.25, gQ: 1.5, gW: 1.4 * 0.6 },
      { n: "W principal sem Q (andaime parado)", gG: 1.25, gQ: 0, gW: 1.4 }   /* NBR 6494 3.3.4: para a atividade com vento forte; vento principal sem Q */
    ];
    var vMont = nova("montante", "montante", "Montante (pontalete): compressão com flambagem e flexocompressão", "NBR 8800:2008 5.5.1.2 e Anexo E (Ne por AUTOVALOR do montante sobre molas reais; χ pela rotina de AcoDim8800, D/t = 17); NBR 8681 (2 combinações); B1 (DE MEMÓRIA); conferência NB-14 (R1, secundária)");
    (function () {
      var v = vMont;
      v.confirmarRT = ["fy (aço do tubo do locador)", "K (só na conferência NB-14)", "eAbrac (excentricidade da abraçadeira)", "qServ e pisos carregados", "cfTela / caTubo", "B1 (de memória)", "rigidez do pórtico transversal"];
      var gov = null, secs = {}, NBpior = null, combos = vt.ok ? COMBOS : [COMBOS[0]];
      postes.forEach(function (q) {
        var inf = ncrInfo[q.key], f = pf[q.key];
        for (var k = 1; k <= nL; k++) {
          var NA = COMBO_A.gG * (proprioAcima(q.key, yIni(k))) + 0, NQA = 0; for (var j = k; j <= nL; j++) { NA += COMBO_A.gG * RG(j, q.key); NQA += RQ(j, q.key); } NA += COMBO_A.gQ * NQA;
          var Ne = inf.lambda * NA, KLeq = Ne > 1e-9 ? Math.PI * Math.sqrt(EI / Ne) : 1e3, nr = NRdDe(KLeq), NRd = nr.NRd, y0 = yIni(k), y1 = niv[k].y;
          var Mwk = f && !f.inst ? maxMEm(f.res[0], y0, y1) : (vt.ok ? 1e3 : 0), Mgk = k >= 2 && pisoLv.indexOf(k - 1) >= 0 ? MGuarda(q.key, k - 1, y0, y1) : 0;
          var piorC = null;
          combos.forEach(function (cb) {
            var NG = proprioAcima(q.key, yIni(k)), NQ = 0, Rk = 0, Rk1 = 0;
            for (var j2 = k; j2 <= nL; j2++) { NG += RG(j2, q.key); NQ += RQ(j2, q.key); }
            Rk = cb.gG * RG(k, q.key) + cb.gQ * RQ(k, q.key); Rk1 = cb.gG * RG(k - 1, q.key) + cb.gQ * RQ(k - 1, q.key);
            var Nd = cb.gG * NG + cb.gQ * NQ, Me = P.eAbrac * Math.max(Rk, Rk1), Mw = cb.gW * Mwk, Mg = cb.gQ * Mgk, B1 = Nd >= Ne ? 99 : Math.max(1, 1 / (1 - Nd / Ne)), Md = B1 * (Me + Mw + Mg);
            var r = Nd / NRd, u = Math.min(99, r >= 0.2 ? r + 8 / 9 * (Md / MRd) : r / 2 + Md / MRd);   /* acima de 99 = instável */
            if (!piorC || u > piorC.u) piorC = { u: u, cb: cb.n, Nd: Nd, NG: NG, NQ: NQ, Me: Me, Mw: Mw, Mg: Mg, B1: B1, Md: Md, r: r, Rd: Math.max(Rk, Rk1), NRd: NRd, nr: nr, KL: KLeq, Ne: Ne };
          });
          var Ns = piorC.NG + piorC.NQ, KLn = P.K * lev, lam = KLn * 1000 / Math.min(s.rx, s.ry), NB14 = lam <= 105 ? 1200 - 0.023 * lam * lam : 10363000 / (lam * lam), NadmNB14 = NB14 * s.A / 100, uNB = (Ns * KGF_POR_KN) / NadmNB14;
          var cx = { u: piorC.u, uNB: uNB, c: piorC, key: q.key, k: k, NB14: NB14, NadmNB14: NadmNB14, lam: lam };
          secs[q.key + "|" + k] = cx;
          out.montantes.push({ poste: q.key, levante: k, Lunb_m: KLeq, NcRd_kN: piorC.NRd, Ne_kN: Ne, lambdaCr: inf.lambda, RGk_kN: RG(k, q.key), RQk_kN: RQ(k, q.key), RGk1_kN: RG(k - 1, q.key), RQk1_kN: RQ(k - 1, q.key), Mwun_kNm: Mwk, Mguarda_kNm: Mgk,
            NG_kN: piorC.NG, NQ_kN: piorC.NQ, Nd_kN: piorC.Nd, Rd_kN: piorC.Rd, Me_kNm: piorC.Me, Mvento_kNm: piorC.Mw, Md_kNm: piorC.Md, uso: piorC.u, usoNB14: uNB, combinacao: piorC.cb, KL_m: KLeq, B1: piorC.B1 });
          if (!gov || cx.u > gov.u) gov = cx;
          if (!NBpior || uNB > NBpior.uNB) NBpior = cx;
        }
      });
      var luvaMeio = {};
      modelo.conexoes.forEach(function (c) {
        if (c.tipo !== "luva") return;
        var b0 = barrasPorId[c.barras[0]]; if (!b0 || b0.papel !== "montante") return;
        var dm = Infinity; niv.forEach(function (nn) { dm = Math.min(dm, Math.abs(c.pos[1] - nn.y)); });
        if (dm > 0.30 + 1e-9) { c.barras.forEach(function (id) { luvaMeio[id] = c.pos[1]; }); }
      });
      modelo.barras.forEach(function (b) {
        if (b.papel !== "montante" || !b.poste) return;
        var y0 = Math.min(b.a[1], b.b[1]), y1 = Math.max(b.a[1], b.b[1]), uu = null, cNB = 0;
        for (var k = 1; k <= nL; k++) {
          var lo = yIni(k), hi = k === nL ? 1e9 : niv[k].y;
          if (y1 > lo + 1e-9 && y0 < hi - 1e-9) { var c = secs[b.poste + "|" + k]; uu = uu == null ? c.u : Math.max(uu, c.u); cNB = Math.max(cNB, c.uNB); }
        }
        var est = estadoDe(uu);
        if (est === "ok" && cNB > 1.0 + 1e-9) est = "atencao";
        if (luvaMeio[b.id] != null && est === "ok") est = "atencao";
        if (!vt.ok) est = "nao_verificado";
        peca(v, b.id, uu, est);
      });
      var sg = gov.c;
      v.formula = "Ne = λcr·N (autovalor 1D do montante sobre molas reais nos nós) → KLeq = π√(EI/Ne) → Nc,Rd = χ·Ag·fy/γa1 (Anexo E); Md = B1·(eAbrac·R + γW·Mvento + γQ·Mguarda); " + (sg.r >= 0.2 ? "Nd/Nc,Rd + (8/9)·Md/MRd ≤ 1,0" : "Nd/(2·Nc,Rd) + Md/MRd ≤ 1,0") + " (5.5.1.2); pior das 2 combinações da NBR 8681";
      v.valores = { KL_m: sg.KL, lambda: gov.lam, chi: sg.nr.chi, NcRd_kN: sg.NRd, MRd_kNm: MRd, NSd_kN: sg.Nd, NserG_kN: sg.NG, NserQ_kN: sg.NQ, NserTotal_kN: sg.NG + sg.NQ, Rd_kN: sg.Rd, Me_kNm: sg.Me, Mvento_kNm: sg.Mw, Mguarda_kNm: sg.Mg, Md_kNm: sg.Md, B1: sg.B1, razaoN: sg.r, NB14_sigma_kgfcm2: gov.NB14, NB14_Nadm_kgf: gov.NadmNB14, NB14_uso: NBpior.uNB, montante: gov.key, levante: gov.k, combinacao: sg.cb, Ne_kN: sg.Ne, lambdaCr: ncrInfo[gov.key].lambda };
      v.texto = "Montante " + gov.key + ", levante " + gov.k + ", combinação «" + sg.cb + "»: autovalor do montante sobre molas reais λcr = " + brf(ncrInfo[gov.key].lambda, 2) + " → Ne = " + nkn(sg.Ne) + " (KLeq = " + brf(sg.KL, 2) + " m, χ = " + brf(sg.nr.chi, 3) + "); Nc,Rd = " + nkn(sg.NRd) + "; G = " + brf(sg.NG, 2) + " kN, Q = " + brf(sg.NQ, 2) + " kN → Nd = " + brf(sg.Nd, 2) + " kN; Md = B1·(e·R + Mvento + Mguarda) = " + brf(sg.B1, 3) + "·(" + brf(sg.Me, 3) + " + " + brf(sg.Mw, 3) + " + " + brf(sg.Mg, 3) + ") = " + brf(sg.Md, 3) + " kN·m (MRd = " + brf(MRd, 3) + " kN·m); Nd/Nc,Rd = " + brf(sg.r, 3) + " → " + brf(gov.u, 3) +
        ". Conferência NB-14 (σ = " + (gov.lam <= 105 ? "1200 − 0,023·λ²" : "10 363 000/λ²") + " = " + brf(gov.NB14, 0) + " kgf/cm²; Nadm = " + brf(gov.NadmNB14, 0) + " kgf): N de serviço " + brf(kgf(sg.NG + sg.NQ), 0) + " kgf → uso " + brf(NBpior.uNB, 3) + ".";
      v.solicitante = brf(sg.Nd, 2) + " kN (" + brf(kgf(sg.Nd), 0) + " kgf), Md = " + brf(sg.Md, 3) + " kN·m"; v.resistente = "Nc,Rd = " + brf(sg.NRd, 2) + " kN (" + brf(kgf(sg.NRd), 0) + " kgf); MRd = " + brf(MRd, 3) + " kN·m";
      if (!vt.ok) { v.ressalvas.push("Sem V0 o vento (a maior parcela do momento) não entra: montante NÃO VERIFICADO — " + vt.motivo); naoV.push("Montante: sem V0 o vento não entra — estado não verificado. " + vt.motivo); }
      if (NBpior.uNB > 1.0 + 1e-9) v.ressalvas.push("A NBR 8800 passa, mas a conferência NB-14 reprova (uso " + brf(NBpior.uNB, 3) + "): estado atenção, o RT decide (NBR 8800 uso " + brf(gov.u, 3) + "; NB-14 uso " + brf(NBpior.uNB, 3) + ").");
      if (Object.keys(luvaMeio).length) v.ressalvas.push("Há emenda de montante a mais de 0,30 m do nó (meio do levante): a rigidez da luva não tem fonte; os montantes com essa emenda ficam em atenção.");
      if (semAnc) v.ressalvas.push("Sem ancoragens: a contenção dos nós vem só do pórtico transversal diagonalizado (rigidez calculada) e das longitudinais até as estações com pórtico.");
      fecha(v);
      if (!vt.ok) { v.estado = "nao_verificado"; }
    })();

    /* ---- verificação da FORÇA na contenção (força nocional de CÁLCULO): cada nó com mola entrega F = nodalBr·Nd à longitudinal, que a leva até as estações-apoio */
    (function () {
      var vC = nova("contencao", "contencao", "Força na contenção dos nós do montante (longitudinal da fiada)", "NBR 8800 (força de contenção 1 % de Nd, DE MEMÓRIA — conferir); a rigidez da contenção entra no autovalor do montante, não aqui");
      vC.confirmarRT = ["força de contenção nodal (de memória)"];
      var gov = null;
      postes.forEach(function (q) {
        var inf = ncrInfo[q.key]; if (!inf) return;
        inf.nos.forEach(function (nn) {
          if (nn.tipo !== "mola" || !(nn.kLong > 0)) return;
          var j = nn.j === "T" ? nL : nn.j, Nd = NProf(q.key, nn.j === "T" ? niv[nL].y : niv[j].y - 1e-6, COMBO_A.gG, COMBO_A.gQ), F = P.nodalBr * Nd, e = estDePoste[q.key], cum = estPorId[e].cum, esq = null, dir = null;
          estOrdenadas.forEach(function (o) { if (o.id === e || !ehApoio(o.id, nn.j)) return; if (o.cum < cum - 1e-6 && (esq == null || cum - o.cum < esq)) esq = cum - o.cum; if (o.cum > cum + 1e-6 && (dir == null || o.cum - cum < dir)) dir = o.cum - cum; });
          var Mh = esq != null && dir != null ? F * esq * dir / (esq + dir) : F * (esq != null ? esq : (dir || 0)), u = Mh / MRd, bid = barraNoPoste2(q.key, nn.j === "T" ? nn.y - 0.05 : nn.y);
          if (bid) peca(vC, bid, u);
          if (!gov || u > gov.u) gov = { u: u, F: F, Mh: Mh, key: q.key, j: nn.j, Nd: Nd, kL: nn.kLong };
        });
      });
      if (!gov) { verifs.splice(verifs.indexOf(vC), 1); return; }
      vC.formula = "F = " + brf(P.nodalBr, 3) + "·Nd (Nd de CÁLCULO, combinação Q principal); M = F·a·b/L na longitudinal entre as estações-apoio; M ≤ MRd";
      vC.valores = { F_kN: gov.F, Nd_kN: gov.Nd, Mh_kNm: gov.Mh, kLong_kNm: gov.kL, montante: gov.key, no: gov.j };
      vC.texto = "Montante " + gov.key + ", nó " + gov.j + ": F = " + brf(P.nodalBr, 3) + " × " + brf(gov.Nd, 2) + " kN (cálculo) = " + brf(gov.F, 3) + " kN → M = " + brf(gov.Mh, 3) + " kN·m na longitudinal contra MRd = " + brf(MRd, 3) + " kN·m (uso " + brf(gov.u, 3) + "). A rigidez da contenção (k = " + brf(gov.kL, 1) + " kN/m) já entrou no autovalor do montante: não há corte «contido/não contido».";
      vC.solicitante = "F = " + brf(gov.F, 3) + " kN; M = " + brf(gov.Mh, 3) + " kN·m"; vC.resistente = "MRd = " + brf(MRd, 3) + " kN·m";
      fecha(vC);
    })();
    function posteGrupoCorr() { return modelo.barras.filter(function (b) { return b.papel === "posteGuarda"; }); }

    /* ============ 5. GUARDA-CORPO — NR-18 18.9.4.2 (REGRA): 90 kgf/m horizontal, flecha ≤ 76 mm; 66 kgf/m no intermediário; 350 N pontual (NBR 6494 3.2.1) */
    var guardSpan = {}, guardSpanK = {}, gsGuarda = {};   /* poste → maior tributário do guarda-corpo (m), por nível; e os postes de guarda-corpo (posteGuarda) */
    (function () {
      var vt1 = nova("guarda_travessao", "guarda", "Guarda-corpo — travessão (90 kgf/m, flecha ≤ 76 mm)", "NR-18 18.9.4.2 (REGRA); NBR 8800:2008 5.4");
      var vt2 = nova("guarda_interm", "guarda", "Guarda-corpo — intermediário (66 kgf/m)", "NR-18 18.9.4.2 (REGRA); NBR 8800:2008 5.4");
      var vt3 = nova("guarda_pontual", "guarda", "Guarda-corpo — carga pontual de 350 N no topo", "NBR 6494:1990 3.2.1 (exemplar não licenciado — conferir); NBR 8800 (My = W·fy, sem γ)");
      vt3.confirmarRT = ["NBR 6494 em exemplar licenciado"];
      var g1 = null, g2 = null, g3 = null, gp = posteGrupoCorr();
      function grupo(papel, kgfm, vd, setG) {
        corridasDe(papel, function (b) { return b.nivel >= 1; }, gp).forEach(function (c) {
          if (c.postes.length < 2) { c.barras.forEach(function (b) { peca(vd, b.id, null, "nao_verificado"); }); return; }
          var w = kgfm * GRAV / 1000;
          for (var i = 0; i + 1 < c.postes.length; i++) {
            var t0 = c.postes[i].t, t1 = c.postes[i + 1].t, L = t1 - t0, Md = 1.5 * w * L * L / 8, delta = 5 * w * Math.pow(L, 4) / (384 * EI);
            var uM = Md / MRd, uF = delta / P.guardaFlechaMax, u = Math.max(uM, uF), Pn = P.guardaPontualN / 1000, Mp = Pn * L / 4, uP = Mp / My;
            c.barras.forEach(function (b) { var tt = tDeBarra(c, b); if (tt[1] > t0 + 1e-9 && tt[0] < t1 - 1e-9) { peca(vd, b.id, u); if (papel === "guarda") peca(vt3, b.id, uP); } });
            setG({ u: u, uM: uM, uF: uF, L: L, Md: Md, delta: delta, w: w, uP: uP, Mp: Mp, id: c.barras[0].id });
          }
        });
      }
      grupo("guarda", P.guardaKgfM, vt1, function (x) { if (!g1 || x.u > g1.u) g1 = x; if (!g3 || x.uP > g3.uP) g3 = x; });
      grupo("intermediaria", P.intermKgfM, vt2, function (x) { if (!g2 || x.u > g2.u) g2 = x; });
      [[vt1, g1], [vt2, g2]].forEach(function (par2) {
        var v = par2[0], g = par2[1]; if (!g) return;
        v.formula = "Msd = 1,5·q·L²/8 ≤ MRd; δ = 5·q·L⁴/(384·E·I) ≤ 0,076 m";
        v.valores = { vao_m: g.L, q_kNm: g.w, q_kgfm: kgf(g.w), Msd_kNm: g.Md, MRd_kNm: MRd, delta_m: g.delta, deltaLim_m: P.guardaFlechaMax, usoFlexao: g.uM, usoFlecha: g.uF };
        v.texto = "Vão " + brf(g.L, 3) + " m, q = " + brf(g.w, 4) + " kN/m (" + brf(kgf(g.w), 0) + " kgf/m): Msd = " + brf(g.Md, 3) + " kN·m ≤ MRd = " + brf(MRd, 3) + " kN·m (uso " + brf(g.uM, 3) + "); flecha = " + brf(g.delta * 1000, 1) + " mm ≤ 76 mm (uso " + brf(g.uF, 3) + "). Limite de flecha de 76 mm adotado também no intermediário (conservador).";
        v.solicitante = "Msd = " + brf(g.Md, 3) + " kN·m; δ = " + brf(g.delta * 1000, 1) + " mm"; v.resistente = "MRd = " + brf(MRd, 3) + " kN·m; δlim = 76 mm";
        fecha(v);
      });
      if (g3) {
        vt3.formula = "M = P·L/4 (P = 350 N no meio do vão) ≤ My = W·fy (sem deformação permanente)";
        vt3.valores = { P_N: P.guardaPontualN, vao_m: g3.L, M_kNm: g3.Mp, My_kNm: My, uso: g3.uP };
        vt3.texto = "P = " + brf(P.guardaPontualN, 0) + " N, vão " + brf(g3.L, 3) + " m: M = " + brf(g3.Mp, 3) + " kN·m ≤ My = W·fy = " + brf(My, 3) + " kN·m (uso " + brf(g3.uP, 3) + ").";
        vt3.solicitante = "M = " + brf(g3.Mp, 3) + " kN·m"; vt3.resistente = "My = " + brf(My, 3) + " kN·m";
        fecha(vt3);
      }
      /* tributário do guarda-corpo de cada montante (metade dos vãos vizinhos), para o montante como poste do guarda-corpo */
      pisoLv.forEach(function (kp) {
        var gs = guardSpanK[kp] = {};
        corridasDe("guarda", function (b) { return b.nivel === kp; }, gp).forEach(function (c) {
          for (var i = 0; i < c.postes.length; i++) {
            var a = i > 0 ? (c.postes[i].t - c.postes[i - 1].t) / 2 : 0, b2 = i + 1 < c.postes.length ? (c.postes[i + 1].t - c.postes[i].t) / 2 : 0, key = c.postes[i].key;
            gs[key] = Math.max(gs[key] || 0, a + b2);
            if (c.postes[i].guarda) gsGuarda[c.postes[i].key] = { nivel: kp, trib: a + b2, vizinhos: (i > 0 ? c.postes[i].t - c.postes[i - 1].t : 0) + (i + 1 < c.postes.length ? c.postes[i + 1].t - c.postes[i].t : 0) };
          }
        });
        modelo.barras.forEach(function (b) {   /* cabeceira: meia largura em cada poste de ponta */
          if (b.papel === "guarda" && b.cabeceira && b.nivel === kp) { [b.a, b.b].forEach(function (pt) { var kx = posteEm(pt[0], pt[2]); if (kx) gs[kx] = Math.max(gs[kx] || 0, W / 2); }); }
        });
      });
      guardSpan = guardSpanK[nL] || {};
    })();

    /* ============ MONTANTE ACIMA DO ÚLTIMO NÓ (tela + guarda-corpo) e MONTANTE COMO POSTE DO GUARDA-CORPO (E4.3: trilho sobre apoios elásticos, carga real por montante) */
    (function () {
      var v = nova("montante_topo", "montante_topo", "Montante acima do último nó (tela e guarda-corpo)", "NBR 8800:2008 5.5.1.2; NBR 6123:2023 (vento na tela, NR-18 18.12.15.1: tela até 2 m acima do último piso); NR-18 18.9.4.2 (90 kgf/m); NBR 8681; viga contínua sobre molas reais (elementos finitos); B1 (de memória)");
      var vg = nova("montante_guarda", "montante_guarda", "Montante como poste do guarda-corpo sob a carga da NR-18 (90 kgf/m)", "NR-18 18.9.4.2 a) (REGRA: o travessão resiste a 90 kgf/m); o trilho é viga contínua sobre apoios ELÁSTICOS (montantes e postes de guarda-corpo, cada um com a rigidez real); NBR 8800 5.5.1.2");
      v.confirmarRT = ["tela e vento no balanço", "cfTela", "face onde ancorar (faceAte)"]; vg.confirmarRT = ["solução do guarda-corpo (poste, escora, ensaio)", "rigidez das abraçadeiras do poste"];
      var yNo = niv[nL].y, govT = null, govG = null, govI = null;
      postes.forEach(function (q) {
        var inf = ncrInfo[q.key], f = pf[q.key]; if (!inf || !f) return;
        var yPost = inf.yPost, hc = yPost - yNo;
        function sec(k) { var qm = out.montantes.filter(function (z) { return z.poste === q.key && z.levante === k; })[0]; return qm || null; }
        function usoComb(qm, Md0) { var Ne = qm.Ne_kN, B1 = qm.Nd_kN >= Ne ? 99 : Math.max(1, 1 / (1 - qm.Nd_kN / Ne)), Md = B1 * Md0, r = qm.Nd_kN / qm.NcRd_kN; return { u: Math.min(99, r >= 0.2 ? r + 8 / 9 * Md / MRd : r / 2 + Md / MRd), Md: Md, B1: B1 }; }
        if (hc > 0.05) {
          var qm = sec(nL); if (!qm) return;
          var Mwt = f.inst ? 1e3 : maxMEm(f.res[0], yNo, yPost), Mgt = f.inst ? 1e3 : MGuarda(q.key, nL, yNo, yPost);
          var Rg = (railRes[nL + "|g"][q.key] || { R: 0 }).R, sg = (guardSpanK[nL] || {})[q.key] || 0;
          var tipos = [{ n: "1,5·Q(guarda) + 0,6·1,4·W", Md: 1.5 * Mgt + 0.84 * Mwt }, { n: "1,4·W (sem Q)", Md: 1.4 * Mwt }], pior = null;
          tipos.forEach(function (tp) { var r2 = usoComb(qm, tp.Md); if (!pior || r2.u > pior.u) pior = { u: r2.u, Md: r2.Md, n: tp.n, B1: r2.B1 }; });
          var rg = usoComb(qm, 1.5 * Mgt), estT = !vt.ok && q.outer && temTela ? "nao_verificado" : estadoDe(pior.u), bid = barraNoPoste2(q.key, yPost - 0.05);
          if (bid) { if (Rg > 0 || Mwt > 0 || (q.outer && temTela)) peca(v, bid, pior.u, estT); if (Rg > 0) peca(vg, bid, rg.u); }
          out.topo.push({ poste: q.key, outer: q.outer, Mvento_kNm: Mwt, Mguarda_kNm: Mgt, Rtrilho_kN: Rg, hc_m: hc, noTopo: (inf.nos.filter(function (z) { return z.j === nL; })[0] || {}).tipoV || null, trib_m: sg });
          if (Rg > 0 && (!govG || rg.u > govG.u)) govG = { u: rg.u, key: q.key, Mg: Mgt, Rg: Rg, sg: sg, hc: hc, Md: rg.Md, NRd: qm.NcRd_kN, Nd: qm.Nd_kN, hg: alturaTrilho(nL, "g") - yNo, kmain: (railRes[nL + "|g"][q.key] || {}).k, apoios: f.rig.length + f.mol.length };
          if (!govT || pior.u > govT.u) govT = { u: pior.u, key: q.key, Mw: Mwt, Mg: Mgt, Md: pior.Md, comb: pior.n, hc: hc, NRd: qm.NcRd_kN, Nd: qm.Nd_kN, B1: pior.B1, outer: q.outer, Rg: Rg, rig: f.rig.slice(), nosTopo: inf.nos.filter(function (z) { return z.j === "T"; })[0] || null };
        }
        /* pisos intermediários: o trecho do montante entre dois nós, com a reação real do trilho */
        pisoLv.forEach(function (kp) {
          if (kp >= nL) return;
          var qm2 = sec(kp + 1); if (!qm2) return;
          var Mg2 = MGuarda(q.key, kp, niv[kp].y, niv[kp + 1].y), r0 = railRes[kp + "|g"][q.key]; if (!r0) return;
          var u2 = usoComb(qm2, 1.5 * Mg2).u, bid2 = barraNoPoste2(q.key, niv[kp].yPiso + 0.9);
          if (bid2) peca(vg, bid2, u2);
          if (!govI || u2 > govI.u) govI = { u: u2, key: q.key, nivel: kp, R: r0.R, a: alturaTrilho(kp, "g") - niv[kp].y, L: niv[kp + 1].y - niv[kp].y, M: Mg2 };
        });
      });
      if (govT) {
        v.formula = "montante = viga vertical contínua (EI do tubo) sobre o chão, as ancoragens e as molas dos nós; M = momento do vento na tela + momento da reação real do trilho; Md = B1·M; 5.5.1.2; pior das combinações (Q principal, vento sem Q)";
        v.valores = { hc_m: govT.hc, Mvento_kNm: govT.Mw, Mguarda_kNm: govT.Mg, Md_kNm: govT.Md, MRd_kNm: MRd, Nd_kN: govT.Nd, NcRd_kN: govT.NRd, B1: govT.B1, montante: govT.key, combinacao: govT.comb, ancoradoNoTopo: !!(govT.nosTopo && govT.nosTopo.tipo === "rigido") };
        v.texto = "Montante " + govT.key + " (" + (govT.outer ? "externo" : "interno") + "), trecho de " + brf(govT.hc, 2) + " m acima do último nó: vento na tela M = " + brf(govT.Mw, 3) + " kN·m (característico), guarda-corpo (reação real do trilho) M = " + brf(govT.Mg, 3) + " kN·m; combinação «" + govT.comb + "»: Md = " + brf(govT.Md, 3) + " kN·m contra MRd = " + brf(MRd, 3) + " kN·m → uso " + brf(govT.u, 2) + ". " +
          (temTopo ? "O topo é um nó " + (govT.nosTopo && govT.nosTopo.tipo === "rigido" ? "ANCORADO (ancoragem do topo)" : "com mola (longitudinal de topo entre estações ancoradas)") + ": o montante é viga contínua sobre o chão, os nós e o topo, contínua com os levantes de baixo. " : "Sem ancoragem do topo o trecho acima do último nó é balanço (a longitudinal de topo só amarra a tela). ") +
          "O Corrigir oferece a malha de ancoragem, ancTopo (se há onde ancorar) ou o vão menor.";
        v.solicitante = "Md = " + brf(govT.Md, 3) + " kN·m"; v.resistente = "MRd = " + brf(MRd, 3) + " kN·m";
        if (!vt.ok) v.ressalvas.push("Sem V0 o vento na tela não entra: " + vt.motivo);
        fecha(v); if (!vt.ok && temTela) v.estado = "nao_verificado";
        if (temTela && !temTopo) v.ressalvas.push("Longitudinal de topo (travaTopo) sem ancoragem do topo (ancTopo): amarra a tela e os montantes, mas não é apoio (balanço).");
        if (temTopo) v.ressalvas.push("Contenção do topo na direção da fachada pela diagonal de fachada + longitudinal: hipótese, não verificada numericamente (o RT confirma).");
      }
      if (govG) {
        vg.formula = "R = reação REAL do trilho no montante (viga contínua sobre apoios elásticos: k do montante, k do poste de guarda-corpo, luva = rótula); Md = B1·1,5·R·(resposta do montante à carga unitária na altura do trilho); 5.5.1.2";
        vg.valores = { R_kN: govG.Rg, h_m: govG.hg, vaoTrib_m: govG.sg, Md_kNm: govG.Md, MRd_kNm: MRd, montante: govG.key, uso: govG.u, kMontante_kNm: govG.kmain, apoiosDoMontante: govG.apoios };
        vg.texto = "Montante " + govG.key + ": reação real do travessão R = " + brf(govG.Rg, 2) + " kN (a " + brf(govG.hg, 2) + " m do nó; rigidez do montante nessa altura k = " + brf(govG.kmain, 1) + " kN/m; tributário simples seria " + brf(P.guardaKgfM * GRAV / 1000 * govG.sg, 2) + " kN) → M = " + brf(govG.Mg, 3) + " kN·m característico; Md = " + brf(govG.Md, 3) + " kN·m contra MRd = " + brf(MRd, 3) + " kN·m: uso " + brf(govG.u, 2) + ". Mp = Z·fy = " + brf(s.Zx * fyOk / 1e6, 2) + " kN·m: o tubo forma rótula plástica SOB a própria carga da NR (sem γ) quando M > Mp.";
        vg.solicitante = "Md = " + brf(govG.Md, 3) + " kN·m"; vg.resistente = "MRd = " + brf(MRd, 3) + " kN·m";
        if (govI) { vg.valores.intermediarios = { nivel: govI.nivel, R_kN: govI.R, a_m: govI.a, L_m: govI.L, M_kNm: govI.M, uso: govI.u, montante: govI.key }; vg.texto += " Pisos intermediários: o guarda-corpo fica ENTRE DOIS NÓS (M = " + brf(govI.M, 3) + " kN·m no nível " + govI.nivel + ", uso " + brf(govI.u, 3) + ") e o momento entra na interação do montante do mesmo levante."; }
        fecha(vg);
        if (P.guardaLaudo) { vg.estado = "atencao"; vg.ressalvas.push("Solução adotada pelo RT: guarda-corpo ensaiado, laudo nº " + P.guardaLaudo + " — o cálculo continua mostrando uso " + brf(govG.u, 2) + "; liberação só pelo laudo (atenção, nunca verde)."); }
        if (gpb.length) vg.ressalvas.push("Com poste de guarda-corpo (posteGuarda) o trilho divide a carga com o poste PELA RIGIDEZ — o montante recebe o que o poste não absorve (verificação «poste_guarda»).");
      } else if (govI) { vg.valores = { intermediarios: { nivel: govI.nivel, R_kN: govI.R, a_m: govI.a, L_m: govI.L, M_kNm: govI.M, uso: govI.u, montante: govI.key } }; vg.texto = "Pisos intermediários: guarda-corpo entre dois nós, uso " + brf(govI.u, 3) + "."; vg.solicitante = "—"; vg.resistente = "MRd = " + brf(MRd, 3) + " kN·m"; fecha(vg); }
    })();

    /* ============ POSTE DE GUARDA-CORPO (posteGuarda): recebe do trilho SÓ o que a rigidez dele atrai */
    (function () {
      if (!gpb.length) return;
      var v = nova("poste_guarda", "poste_guarda", "Poste de guarda-corpo no meio do vão: tubo, abraçadeira e intermediário", "NR-18 18.9.4.2 (90 kgf/m); R1 (800 kgf da fixa, secundária); NBR 8800 5.4 — carga do poste = reação do trilho sobre apoio elástico; equilíbrio entre a abraçadeira de baixo e a do intermediário");
      v.confirmarRT = ["capacidade da abraçadeira do poste à carga perpendicular (usa 800 kgf da fixa)", "rigidez do apoio de baixo (longitudinal do piso)"];
      var gov = null, Pi2 = modelo.par.intermediaria || 0.70;
      gpb.forEach(function (b) {
        var info = gsGuarda["G:" + b.id], kp = b.nivel, yb = niv[kp].y, ag = niv[kp].yPiso + guardaH - yb, ai = niv[kp].yPiso + Pi2 - yb;
        var rr = railRes[kp + "|g"] ? railRes[kp + "|g"]["G:" + b.id] : null;
        if (!info || !rr) { peca(v, b.id, null, "nao_verificado"); return; }
        var R = rr.R, Fint = R * ag / ai, Mpost = R * (ag - ai), Lrail = info.vizinhos || 2.0;
        var Mrail = 1.5 * (Fint * Lrail / 4 + P.intermKgfM * GRAV / 1000 * Lrail * Lrail / 8), uP = 1.5 * Mpost / MRd, uC = Fint / kN(P.capFixaKgf), uR = Mrail / MRd, u = Math.max(uP, uC, uR);
        peca(v, b.id, u);
        if (!gov || u > gov.u) gov = { u: u, uP: uP, uC: uC, uR: uR, R: R, Fint: Fint, Mpost: Mpost, Lrail: Lrail, id: b.id, trib: info.trib, k: rr.k, Rtrib: P.guardaKgfM * GRAV / 1000 * info.trib };
      });
      if (!gov) return;
      v.formula = "R = reação do trilho sobre o apoio elástico do poste (rigidez do poste em série: abraçadeira de baixo, intermediário, balanço); F_int = R·a_g/a_i; poste 1,5·R·(a_g − a_i) ≤ MRd; abraçadeira F_int ≤ 800 kgf; intermediário 1,5·(F_int·L/4 + q·L²/8) ≤ MRd";
      v.valores = { R_kN: gov.R, Rtributaria_kN: gov.Rtrib, kPoste_kNm: gov.k, F_int_kN: gov.Fint, F_int_kgf: kgf(gov.Fint), Mposte_kNm: gov.Mpost, usoPoste: gov.uP, usoAbracadeira: gov.uC, usoIntermediario: gov.uR, trib_m: gov.trib };
      v.texto = "Poste " + gov.id + " (rigidez no travessão k = " + brf(gov.k, 1) + " kN/m): recebe do trilho R = " + nkn(gov.R) + " (a tributária seria " + nkn(gov.Rtrib) + "; o resto fica no montante); força na abraçadeira do intermediário F = " + nkn(gov.Fint) + " (uso " + brf(gov.uC, 3) + " contra " + brf(P.capFixaKgf, 0) + " kgf); momento do poste " + brf(gov.Mpost, 3) + " kN·m (uso " + brf(gov.uP, 3) + "); intermediário com a carga pontual no meio de " + brf(gov.Lrail, 2) + " m (uso " + brf(gov.uR, 3) + ").";
      v.solicitante = "F = " + nkn(gov.Fint); v.resistente = brf(P.capFixaKgf, 0) + " kgf (abraçadeira); MRd = " + brf(MRd, 3) + " kN·m";
      fecha(v);
    })();

    /* ============ 6. ABRAÇADEIRA FIXA (travessa × montante) — reação do nível no nó (viga contínua com rótulas) ≤ 800 kgf */
    (function () {
      var v = nova("abracadeira", "abracadeira", "Abraçadeira fixa (travessa × montante): deslizamento", "R1 (apostila / ensaio de laboratório, secundária): fixa 800 kgf; outra fonte dá 900");
      v.confirmarRT = ["capacidade da abraçadeira do locador (800 kgf)"];
      var capKN = kN(P.capFixaKgf), gov = null, nCl = {};
      modelo.conexoes.forEach(function (c) { if (c.tipo !== "fixa") return; var bs0 = arr(c.barras).map(function (id) { return barrasPorId[id]; }), t0 = bs0.filter(function (b) { return b && b.papel === "travessa"; })[0], m0 = bs0.filter(function (b) { return b && b.papel === "montante"; })[0]; if (t0 && m0 && m0.poste) nCl[m0.poste + "|" + t0.nivel] = (nCl[m0.poste + "|" + t0.nivel] || 0) + 1; });
      var reacPorNo = {};   /* poste|nivel → reação (serviço) da longitudinal que passa por ele */
      longs.forEach(function (c) { if (!c.res) return; c.postes.forEach(function (q, i) { if (q.guarda) return; var kx = q.key + "|" + c.nivel; reacPorNo[kx] = (reacPorNo[kx] || 0) + c.res[0].R[i] + c.res[1].R[i]; }); });
      modelo.conexoes.forEach(function (c) {
        if (c.tipo !== "fixa") return;
        var bs = arr(c.barras).map(function (id) { return barrasPorId[id]; });
        var tr = bs.filter(function (b) { return b && b.papel === "travessa"; })[0], mo = bs.filter(function (b) { return b && b.papel === "montante"; })[0];
        if (!tr || !mo || !mo.poste) return;
        var R = reacPorNo[mo.poste + "|" + tr.nivel]; if (R == null) return;
        var nC = nCl[mo.poste + "|" + tr.nivel] || 1, u = R / (nC * capKN); peca(v, c.id, u);
        if (!gov || u > gov.u) gov = { u: u, R: R, id: c.id, poste: mo.poste, nivel: tr.nivel, nC: nC };
      });
      if (!gov) return;
      v.formula = "R = reação da longitudinal contínua (rótulas nas luvas) no nó, G + Q de serviço sem majorar ≤ carga admissível da abraçadeira fixa";
      v.valores = { R_kN: gov.R, R_kgf: kgf(gov.R), cap_kgf: P.capFixaKgf, cap_kN: capKN, poste: gov.poste, nivel: gov.nivel, nAbracadeiras: gov.nC };
      v.texto = "Nó " + gov.poste + ", nível " + gov.nivel + ": R = " + nkn(gov.R) + " ≤ " + (gov.nC > 1 ? gov.nC + " × " : "") + brf(P.capFixaKgf, 0) + " kgf (" + brf(gov.nC * capKN, 2) + " kN" + (gov.nC > 1 ? ", abraçadeira dupla de segurança" : "") + "); uso " + brf(gov.u, 3) + ".";
      v.solicitante = nkn(gov.R); v.resistente = brf(P.capFixaKgf, 0) + " kgf (" + brf(capKN, 2) + " kN)";
      fecha(v);
    })();

    /* ============ GIRATÓRIA (M6) — força nocional 0,3 % da carga gravitacional por nível, repartida nas diagonais do nível */
    (function () {
      var v = nova("giratoria", "giratoria", "Abraçadeira giratória das diagonais: força nocional", "NBR 8800 4.9.7 (forças nocionais 0,3 % — DE MEMÓRIA, conferir); R1: giratória 600 kgf admissível");
      v.confirmarRT = ["força nocional (de memória)", "capacidade da giratória"];
      var gov = null;
      for (var k = 1; k <= nL; k++) {
        var Hk = 0; postes.forEach(function (q) { var NG = proprioAcima(q.key, yIni(k)), NQ = 0; for (var j = k; j <= nL; j++) { NG += RG(j, q.key); NQ += RQ(j, q.key); } Hk += 1.25 * NG + 1.5 * NQ; });
        Hk *= P.notional;
        var dg = modelo.barras.filter(function (b) { return (b.papel === "diagonal" || b.papel === "diagonalTransv") && b.nivel === k; });
        if (!dg.length) continue;
        var cs = 0; dg.forEach(function (b) { var dxz = Math.sqrt(Math.pow(b.b[0] - b.a[0], 2) + Math.pow(b.b[2] - b.a[2], 2)); cs += dxz / b.L; });
        var cosM = Math.max(0.2, cs / dg.length), F = Hk / dg.length / cosM, u = F / kN(P.capGiratoriaKgf);
        dg.forEach(function (b) { peca(v, b.id, u); });
        modelo.conexoes.forEach(function (c) { if (c.tipo === "giratoria" && arr(c.barras).some(function (id) { var b = barrasPorId[id]; return b && b.nivel === k && (b.papel === "diagonal" || b.papel === "diagonalTransv"); })) peca(v, c.id, u); });
        if (!gov || u > gov.u) gov = { u: u, F: F, H: Hk, n: dg.length, cos: cosM, nivel: k };
      }
      if (!gov) { naoV.push("Abraçadeira giratória: sem diagonais no modelo."); return; }
      v.formula = "H = 0,003·ΣN_serviço do nível; F = H/(n diagonais·cos θ) ≤ 600 kgf";
      v.valores = { H_kN: gov.H, F_kN: gov.F, F_kgf: kgf(gov.F), cap_kgf: P.capGiratoriaKgf, nDiag: gov.n, nivel: gov.nivel };
      v.texto = "Nível " + gov.nivel + ": H = 0,003 × ΣN = " + brf(gov.H, 3) + " kN repartido em " + gov.n + " diagonal(is) (cos θ médio " + brf(gov.cos, 2) + ") → F = " + nkn(gov.F) + " ≤ " + brf(P.capGiratoriaKgf, 0) + " kgf; uso " + brf(gov.u, 3) + ". O vento paralelo à fachada (atrito na tela) não entra.";
      v.solicitante = nkn(gov.F); v.resistente = brf(P.capGiratoriaKgf, 0) + " kgf"; fecha(v);
      if (!(P.ventoParaleloRT && P.ventoParaleloJustificativa.replace(/\s/g, "").length >= 15)) naoV.push("Vento paralelo à fachada (atrito na tela e cabeceira) nas diagonais: não calculado.");
    })();
    /* C-T1 (revisão adversarial): o vento paralelo à fachada deixa de ser só um texto em naoVerificado — é uma VERIFICAÇÃO nao_verificado, que entra no portão
       (faixa PENDENTE das pranchas, "passou, com pendências" na tela) e nunca vira "ok" enquanto o sistema não calcular o atrito na tela e o arrasto das cabeceiras. */
    (function () {
      var vp0 = nova("vento_paralelo", "vento_paralelo", "Vento paralelo à fachada (atrito na tela e cabeceiras) nas diagonais e giratórias", "NBR 6123:2023");
      var conferido = P.ventoParaleloRT && P.ventoParaleloJustificativa.replace(/\s/g, "").length >= 15;   /* C-T1.1: mesmo molde do s3Temporaria/s3Justificativa */
      vp0.solicitante = "—"; vp0.resistente = "—";
      if (conferido) {
        vp0.fonte = "conferido pelo responsável técnico: " + P.ventoParaleloJustificativa;
        vp0.formula = "não calculado pelo sistema: conferido pelo responsável técnico";
        vp0.texto = "O vento paralelo à fachada (atrito na tela e arrasto das cabeceiras) nas diagonais e giratórias NÃO é calculado pelo sistema; foi conferido pelo responsável técnico — justificativa: " + P.ventoParaleloJustificativa;
        vp0.confirmarRT.push("vento paralelo à fachada conferido pelo RT: " + P.ventoParaleloJustificativa);
        peca(vp0, "fachada", 0, "ok");
      } else {
        vp0.formula = "não calculado: atrito na tela e arrasto das cabeceiras nas diagonais e abraçadeiras giratórias";
        vp0.texto = "O vento paralelo à fachada (atrito na tela e arrasto das cabeceiras) não é calculado pelo sistema: o RT confere as diagonais e as abraçadeiras giratórias para esse caso.";
        vp0.ressalvas.push("Vento paralelo à fachada (atrito na tela e cabeceiras) nas diagonais e giratórias: não calculado — o RT confere (NBR 6123:2023).");
      }
      fecha(vp0);
    })();

    /* ============ 7. BASE, CALÇO, APOIO */
    var bases = modelo.bases, reacoes = out.reacoes;
    bases.forEach(function (bs) {
      var key = bs.poste, NG = proprioAcima(key, 0), NQ = 0;
      for (var j = 0; j <= nL; j++) { NG += RG(j, key); NQ += RQ(j, key); }
      var Ns = NG + NQ, Nd = 1.25 * NG + 1.5 * NQ, pt = postePorKey[key];
      reacoes.push({ base: bs.id, poste: key, x: pt ? pt.x : null, z: pt ? pt.z : null, NG_kN: NG, NQ_kN: NQ, servico_kN: Ns, servico_kgf: kgf(Ns), elu_kN: Nd, elu_kgf: kgf(Nd), rosca_m: bs.rosca, tipo: bs.tipo });
    });
    (function () {
      var v = nova("base", "base", "Base regulável: carga admissível pela altura da rosca", "R1 (apostila, secundária): tabela 8 cm 5 000 · 20 cm 3 800 · 25 cm 3 300 · 30 cm 2 800 · 35 cm 2 450 · 40 cm 2 100 kgf");
      v.confirmarRT = ["tabela da base regulável do locador"];
      var gov = null;
      reacoes.forEach(function (r) {
        if (r.tipo !== "regulavel") { peca(v, r.base, null, "nao_verificado"); return; }
        var cap = capBase(r.rosca_m * 100);
        if (cap == null) { peca(v, r.base, null, "nao_verificado"); v.ressalvas.push("Rosca de " + brf(r.rosca_m * 100, 0) + " cm acima de 40 cm: fora da tabela, não verificada."); return; }
        var u = r.servico_kgf / cap; peca(v, r.base, u);
        if (!gov || u > gov.u) gov = { u: u, N: r.servico_kgf, cap: cap, rosca: r.rosca_m * 100, id: r.base };
      });
      if (reacoes.some(function (r) { return r.tipo !== "regulavel"; })) naoV.push("Base fixa ou rodízio: capacidade sem fonte no catálogo — não verificada.");
      if (!gov) { fecha(v); return; }
      v.formula = "N de serviço (G + Q) ≤ carga admissível da base pela altura da rosca (interpolada na tabela)";
      v.valores = { N_kgf: gov.N, N_kN: kN(gov.N), cap_kgf: gov.cap, rosca_cm: gov.rosca, base: gov.id };
      v.texto = "Base " + gov.id + ", rosca " + brf(gov.rosca, 1) + " cm → " + brf(gov.cap, 0) + " kgf; N de serviço = " + brf(gov.N, 0) + " kgf (" + brf(kN(gov.N), 2) + " kN); uso " + brf(gov.u, 3) + ".";
      v.solicitante = brf(gov.N, 0) + " kgf"; v.resistente = brf(gov.cap, 0) + " kgf";
      fecha(v);
    })();
    var haCalco = modelo.calcos.length > 0, calcoDe = {}; modelo.calcos.forEach(function (c) { calcoDe[c.base] = c; });
    if (haCalco) (function () {
      var v = nova("calco", "calco", "Calço de madeira sob a placa-base: compressão", "R1 (apostila, secundária): σadm 87 kgf/cm² sob a placa 120 × 120 mm (12 528 kgf)");
      v.confirmarRT = ["espécie da madeira do calço", "não usar compensado"];
      var area = P.placaCm * P.placaCm, cap = P.sigmaCalco * area, gov = null;
      reacoes.forEach(function (r) { if (!calcoDe[r.base]) return; var u = r.servico_kgf / cap; peca(v, calcoDe[r.base].id, u); if (!gov || u > gov.u) gov = { u: u, N: r.servico_kgf, id: r.base }; });
      if (!gov) return;
      v.formula = "N de serviço ≤ σadm·A_placa = " + P.sigmaCalco + " kgf/cm² × (" + P.placaCm + " cm)²";
      v.valores = { N_kgf: gov.N, cap_kgf: cap, area_cm2: area, sigmaAdm_kgfcm2: P.sigmaCalco };
      v.texto = "Base " + gov.id + ": N = " + brf(gov.N, 0) + " kgf ≤ " + brf(cap, 0) + " kgf (" + P.sigmaCalco + " × " + area + " cm²); uso " + brf(gov.u, 3) + ".";
      v.solicitante = brf(gov.N, 0) + " kgf"; v.resistente = brf(cap, 0) + " kgf"; fecha(v);
    })();
    (function () {
      var v = nova("apoio", "apoio", "Apoio: pressão no solo sob o calço (ou a placa)", "Valor de sigmaSolo informado pelo RT (SEM FONTE no sistema); NBR 6494 4.5.1 (exemplar não licenciado)");
      v.confirmarRT = ["tensão admissível do solo / capacidade da laje"];
      if (String(P.apoio).toLowerCase() === "laje") { naoV.push("Apoio em laje: a laje não é verificada — o RT confere a capacidade (e o escoramento) para as reações das bases."); bases.forEach(function (b) { peca(v, b.id, null, "nao_verificado"); }); v.ressalvas.push("Apoio em laje: não verificado."); fecha(v); return; }
      var conf = P.sigmaSolo != null && P.sigmaSolo > 0 && P.sigmaSoloConfirmado, gov = null;
      reacoes.forEach(function (r) {
        var c = calcoDe[r.base], area = c ? c.L * c.larg : P.placaCm * P.placaCm / 1e4, sig = r.servico_kN / area;   /* kPa */
        var u = P.sigmaSolo != null && P.sigmaSolo > 0 ? sig / P.sigmaSolo : null, est = u == null ? "nao_verificado" : (conf ? estadoDe(u) : (u > 1.0 + 1e-9 ? "falha" : "nao_verificado"));
        peca(v, c ? c.id : r.base, u, est); peca(v, r.base, u, est);
        if (!gov || (u != null && (gov.u == null || u > gov.u)) || (gov.u == null && sig > gov.sig)) gov = { u: u, sig: sig, area: area, N: r.servico_kN, id: r.base, calco: !!c };
      });
      if (!gov) return;
      v.formula = "σ_solo = N de serviço / área do calço ≤ sigmaSolo";
      v.valores = { sigma_kPa: gov.sig, area_m2: gov.area, N_kN: gov.N, sigmaSolo_kPa: P.sigmaSolo, confirmado: conf };
      v.texto = "Base " + gov.id + ": N = " + brf(gov.N, 2) + " kN sobre " + brf(gov.area, 4) + " m² (" + (gov.calco ? "calço de pranchão" : "só a placa-base") + ") → σ = " + brf(gov.sig, 1) + " kPa" + (P.sigmaSolo != null ? " contra sigmaSolo = " + brf(P.sigmaSolo, 0) + " kPa (uso " + brf(gov.u, 3) + ")" : "") + ".";
      v.solicitante = brf(gov.sig, 1) + " kPa"; v.resistente = P.sigmaSolo != null ? brf(P.sigmaSolo, 0) + " kPa" + (conf ? "" : " (NÃO confirmado)") : "sigmaSolo não informado";
      if (!conf) { v.ressalvas.push(P.sigmaSolo == null ? "Tensão admissível do solo não informada: apoio NÃO verificado (o RT informa e confirma sigmaSolo)." : "Tensão admissível do solo informada mas NÃO confirmada pelo RT: apoio não verificado."); naoV.push("Apoio no solo: tensão admissível não " + (P.sigmaSolo == null ? "informada" : "confirmada") + " — σ calculada = " + brf(gov.sig, 1) + " kPa; o RT informa sigmaSolo e confirma (sigmaSoloConfirmado)."); }
      fecha(v);
      if (!conf) v.estado = v.uso != null && v.uso > 1.0 + 1e-9 ? "falha" : "nao_verificado";
    })();

    /* ============ 8. LONGITUDINAL EM FLEXÃO HORIZONTAL e 9. ANCORAGEM (E4.3, item 7)
       O MONTANTE é a viga vertical contínua entre o chão, as ancoragens e as molas dos nós (pf). A reação de cada mola é a carga que a LONGITUDINAL daquela fiada recebe — só a parcela
       das fiadas que têm apoio, repartida entre a longitudinal interna e a externa. A longitudinal é viga contínua entre as estações-apoio (ancoradas ou com pórtico), rótula nas luvas.
       A flexão biaxial do tubo circular entra pela soma VETORIAL: M = √(Mx² + My²). A ancoragem recebe a reação direta do montante + a da longitudinal. */
    var vLH = nova("long_horizontal", "long_horizontal", "Longitudinal em flexão horizontal pelo vento, entre as estações-apoio", "NBR 6123:2023 (vento) + NBR 8681 (2 combinações) + NBR 8800 5.4 (G.2.3); carga = reação das molas do montante (viga vertical contínua); soma VETORIAL das flexões vertical e horizontal do tubo circular");
    var vAn = nova("ancoragem", "ancoragem", "Ancoragem: força do vento por ponto de amarração (serviço)", "NBR 6123:2023 (vento: S1, S2(z), S3, V0); capAncoragem: HSA Irlanda (referência, não é norma BR) comparada com a força de SERVIÇO; cf/ca: SEM FONTE BR");
    (function () {
      var v = vLH, va = vAn;
      v.confirmarRT = ["cfTela / caTubo", "luva = rótula", "rigidez do pórtico transversal", "categoria e sombreamento da tela"];
      va.confirmarRT = ["capAncoragem (6,25 kN, HSA)", "cfTela / caTubo", "categoria e sombreamento da tela", "teste de arrancamento em campo: 1,5 × (≥ 3 e ≥ 5 %)"];
      if (!modelo.ancoragens.length) { naoV.push("Ancoragem: o andaime não tem ancoragens (ver Estabilidade sem ancoragem)."); verifs.splice(verifs.indexOf(v), 1); verifs.splice(verifs.indexOf(va), 1); return; }
      if (!vt.ok) {
        va.texto = vt.motivo; va.ressalvas.push(vt.motivo); va.solicitante = "—"; va.resistente = nkn(P.capAncoragem); modelo.ancoragens.forEach(function (a) { peca(va, a.barra, null, "nao_verificado"); });
        v.texto = vt.motivo; v.ressalvas.push(vt.motivo); v.solicitante = "—"; v.resistente = "—"; peca(v, "fiadas", null, "nao_verificado");
        naoV.push("Ancoragem e longitudinal sob vento: " + vt.motivo); fecha(va); fecha(v); va.estado = "nao_verificado"; v.estado = "nao_verificado"; return;
      }
      /* cargas do vento por estação e nó, a partir da resposta de cada montante */
      var Flong = {}, Fdir = {}, Fbase = 0;   /* "e|j" → kN (par) */
      function somaR(tab, k, x) { tab[k] = (tab[k] || 0) + x; }
      postes.forEach(function (q) {
        var f = pf[q.key], e = estDePoste[q.key]; if (!f || e == null) return;
        if (f.inst) { somaR(Fdir, "inst", 1); return; }
        var r = f.res[0];
        f.rig.forEach(function (y, i) { if (i === 0) return; var no = f.nos.filter(function (z) { return Math.abs(z.y - y) < 1e-6 && z.tipoV === "rigido"; })[0]; if (no) somaR(Fdir, e + "|" + no.j, r.R[i]); });
        f.mol.forEach(function (m, i) {
          var no = f.nos.filter(function (z) { return Math.abs(z.y - m.x) < 1e-6 && z.tipoV === "mola"; })[0]; if (!no) return;
          /* C-T1: a mola do vento é só das longitudinais (2·kLongV): nada vai para o pórtico/base */
          somaR(Flong, e + "|" + no.j, r.Rm[i]);
        });
      });
      var instV = !!Fdir.inst;
      out.ventoModelo.portico = Fbase;   /* C-T1: kN do vento que passam por portico transversal/base - tem de ser 0 (o portico de pe articulado nao e apoio do vento) */
      var govH = null, anchF = {}, apoioH = {};
      var linhasNivel = [];
      for (var jn = 1; jn <= nL; jn++) linhasNivel.push(jn);
      if (temTopo) linhasNivel.push("T");
      linhasNivel.forEach(function (j) {
        ["e", "i"].forEach(function (ln) {
          corridasDe(j === "T" ? "travaTopo" : "travessa", function (b) { return (j === "T" ? b.nivel === nL : b.nivel === j) && b.linha === ln; }).forEach(function (c) {
            if (c.postes.length < 1) return;
            var pts = [], apoios = [], mapA = [], nP = c.postes.length;
            c.postes.forEach(function (pq) {
              var e = estDePoste[pq.key]; if (e == null) return;
              var F = (Flong[e + "|" + j] || 0) / 2; if (F !== 0) pts.push({ x: pq.t, P: F });
              if (ehApoioV(e, j)) { apoios.push(pq.t); mapA.push({ e: e, t: pq.t, ancorada: !!ancEst[e + "|" + j] }); }   /* C-T1: vento só apoia em estação ancorada */
            });
            /* pontas em canto: o trecho vizinho segura a ponta */
            var contam = {}; corridasTodas().forEach(function (o) { o.postes.forEach(function (q2) { contam[q2.key] = (contam[q2.key] || 0) + 1; }); });
            c.postes.forEach(function (pq, i) { if ((i === 0 || i === nP - 1) && contam[pq.key] > 1 && apoios.indexOf(pq.t) < 0) apoios.push(pq.t); });
            apoios.sort(function (x, y) { return x - y; });
            if (!pts.length) return;
            if (apoios.length < 2) { c.barras.forEach(function (b) { peca(v, b.id, 99, "falha"); }); if (!govH || 99 > govH.u) govH = { u: 99, instavel: true, nivel: j, linha: ln }; return; }
            var cfg = { x0: c.tmin, x1: c.tmax, apoios: apoios, rotulas: P.luvaRigida ? [] : c.luvas, EI: EI, h: 0.2 };
            var res = viga(cfg, [{ pts: pts }])[0], Mh = 0; for (var q3 = 0; q3 < res.M.length; q3++) Mh = Math.max(Mh, Math.abs(res.M[q3]));
            if (res.instavel) { c.barras.forEach(function (b) { peca(v, b.id, 99, "falha"); }); if (!govH || 99 > govH.u) govH = { u: 99, instavel: true, mecanismo: true, nivel: j, linha: ln }; return; }
            var pior = null;
            COMBOS.forEach(function (cb) {
              var Mv = longs.filter(function (L2) { return L2.corrida === c.corrida; }).reduce(function (m2, L2) { return Math.max(m2, mVert(L2, cb.gG, cb.gQ)); }, 0);
              var Mhc = cb.gW * Mh, u = Math.sqrt(Mhc * Mhc + Mv * Mv) / MRd;   /* soma VETORIAL no mesmo tubo circular */
              if (!pior || u > pior.u) pior = { u: u, cb: cb.n, Mh: Mhc, Mv: Mv };
            });
            c.barras.forEach(function (b) { peca(v, b.id, pior.u); });
            if (!govH || pior.u > govH.u) govH = { u: pior.u, cb: pior.cb, Mh: pior.Mh, Mv: pior.Mv, nivel: j, linha: ln, nApoios: apoios.length, vao: (function () { var m3 = 0; for (var a2 = 0; a2 + 1 < apoios.length; a2++) m3 = Math.max(m3, apoios[a2 + 1] - apoios[a2]); return m3; })() };
            /* reações da longitudinal nas estações ANCORADAS vão para a ancoragem; nas de pórtico, para a base */
            res.R.forEach(function (Rr, i) { var ma = mapA.filter(function (o) { return Math.abs(o.t - apoios[i]) < 1e-6; })[0]; if (ma && ma.ancorada) somaR(anchF, ma.e + "|" + j, Rr); });
          });
        });
      });
      function corridasTodas() { return longs.filter(function (L2) { return L2.postes; }); }
      /* ancoragens: reação direta do montante + reação das longitudinais, de SERVIÇO */
      var govA = null; out.forcasAncoragem = [];   /* E10: a força de SERVIÇO de cada ponto de amarração, para a tabela da prancha AND-04 (não muda a conta) */
      modelo.ancoragens.forEach(function (a) {
        var key = a.estacao + "|" + (a.topo ? "T" : a.nivel), F = (Fdir[key] || 0) + (anchF[key] || 0), u = F / P.capAncoragem;
        out.forcasAncoragem.push({ id: a.id, nivel: a.nivel, topo: !!a.topo, y: a.y, estacao: a.estacao, F_kN: F, F_kgf: F * 101.9716, uso: u });
        peca(va, a.barra, instV ? 99 : u, instV ? "falha" : undefined);
        if (!govA || u > govA.u) govA = { u: u, F: F, Fdir: Fdir[key] || 0, Fviga: anchF[key] || 0, id: a.id, nivel: a.nivel, topo: !!a.topo };
      });
      var yTopo = temTela ? M.alturaPiso + 2.0 : topoY;
      if (govA) {
        va.formula = "F = reação direta do montante (viga vertical sobre as ancoragens) + reação das longitudinais entre estações-apoio — de SERVIÇO (sem γ) — ≤ capAncoragem; q(z) = 0,613·(V0·S1·S2(z)·S3)²";
        va.valores = { V0: vt.V0, S1: vt.S1, S3: vt.S3, categoria: vt.categoria, q_topo_kNm2: qAt(yTopo), F_kN: govA.F, F_direta_kN: govA.Fdir, F_viga_kN: govA.Fviga, capAncoragem_kN: P.capAncoragem, ancoragem: govA.id, cfTela: cfTelaEf };
        va.texto = "V0 = " + brf(vt.V0, 0) + " m/s (" + vt.fonteV0 + "); categoria " + vt.categoria + (P.categoria == null ? " (NÃO informada: pior caso)" : "") + ", classe A, S1 = " + brf(vt.S1, 2) + ", S3 = " + brf(vt.S3, 2) + (P.temporaria ? " (temporária, grupo 5)" : "") + ", tela cf = " + brf(cfTelaEf, 2) + (P.telaSombreamento == null ? " (sombreamento não informado: 0,75)" : "") + ", S2 por faixa de altura (q no topo = " + brf(qAt(yTopo), 3) + " kN/m²). Ancoragem " + govA.id + (govA.topo ? " (topo)" : " (nível " + govA.nivel + ")") + ": força de serviço F = " + nkn(govA.F) + " (direta do montante " + brf(govA.Fdir, 2) + " kN + reação das longitudinais " + brf(govA.Fviga, 2) + " kN) ≤ " + brf(P.capAncoragem, 2) + " kN; uso " + brf(govA.u, 3) + ".";
        va.solicitante = nkn(govA.F); va.resistente = nkn(P.capAncoragem);
        fecha(va);
      }
      if (govH) {
        v.formula = "carga = reação das molas do montante repartida entre as longitudinais da fiada; viga contínua entre as estações-apoio (rótula nas luvas); uso = √((γW·Mh)² + Mv²)/MRd (soma vetorial), pior das 2 combinações";
        v.valores = { Mh_kNm: govH.Mh || 0, Mv_kNm: govH.Mv || 0, MRd_kNm: MRd, vaoEntreAncoragens_m: govH.vao || null, nivel: govH.nivel, parcelaParaBase_kN: Fbase };
        v.texto = govH.instavel ? "Fiada do nível " + govH.nivel + ": " + (govH.mecanismo ? "a luva como rótula entre as estações-apoio forma um MECANISMO (três articulações em linha): o vento não tem caminho até a estrutura — feche a malha de ancoragem ou informe a capacidade da luva (RT)." : "menos de duas estações-apoio seguram a longitudinal — o vento não tem caminho até a estrutura.") :
          "Fiada do nível " + govH.nivel + " (linha " + govH.linha + "), vão máximo entre estações-apoio " + brf(govH.vao, 2) + " m, combinação «" + govH.cb + "»: Mh = " + brf(govH.Mh, 3) + " kN·m e Mv = " + brf(govH.Mv, 3) + " kN·m somados em vetor = " + brf(Math.sqrt(govH.Mh * govH.Mh + govH.Mv * govH.Mv), 3) + " kN·m contra MRd = " + brf(MRd, 3) + " kN·m → uso " + brf(govH.u, 2) + ".";
        v.solicitante = "√(Mh² + Mv²) = " + brf(Math.sqrt((govH.Mh || 0) * (govH.Mh || 0) + (govH.Mv || 0) * (govH.Mv || 0)), 3) + " kN·m"; v.resistente = "MRd = " + brf(MRd, 3) + " kN·m";
        fecha(v);
        if (Fbase > 1e-6) v.ressalvas.push("Parcela do vento que vai para o pórtico transversal e daí para a base: " + brf(Fbase, 2) + " kN (o deslizamento da base não é verificado — listado em não verificado).");
      }
      if (Fbase > 1e-6) naoV.push("Deslizamento da base sob o vento: " + brf(Fbase, 2) + " kN passam pelo pórtico transversal até a base e a fricção do apoio não tem fonte — não verificado.");
    })();

    /* ============ 10. ESTABILIDADE SEM ANCORAGEM — NR-18 18.12.3 e tombamento por faixas de altura (C5, C6) */
    if (semAnc) (function () {
      var H = topoY, fechado = !!M.fechado, b, Lface, Gfrac = 1, nota = "";
      if (fechado) {
        var best = null, bestT = 0;
        for (var d = 0; d < 180; d += 1) {
          var cs = Math.cos(d * Math.PI / 180), sn = Math.sin(d * Math.PI / 180), mn = Infinity, mx = -Infinity;
          postes.forEach(function (q) { var pr = q.x * cs + q.z * sn; mn = Math.min(mn, pr); mx = Math.max(mx, pr); });
          if (best == null || mx - mn < best) { best = mx - mn; bestT = d; }
        }
        var csP = Math.cos((bestT + 90) * Math.PI / 180), snP = Math.sin((bestT + 90) * Math.PI / 180), mn2 = Infinity, mx2 = -Infinity;
        postes.forEach(function (q) { var pr = q.x * csP + q.z * snP; mn2 = Math.min(mn2, pr); mx2 = Math.max(mx2, pr); });
        b = best; Lface = mx2 - mn2; nota = "anel fechado: base = menor largura do fecho dos montantes (" + brf(b, 2) + " m), face = " + brf(Lface, 2) + " m";
        ress.push("Anel sem ancoragem: o RT confirma — tratado como corpo rígido, sem contraventamento em planta calculado."); out.avisos.push("Anel sem ancoragem: o RT confirma a estabilidade (a face a barlavento depende das longitudinais em flexão horizontal).");
      } else {
        b = W; var Lt = 0, Lmax = 0; modelo.trechos.forEach(function (t) { Lt += t.L; Lmax = Math.max(Lmax, t.L); });
        Lface = Lmax; Gfrac = Lt > 0 ? Lmax / Lt : 1; nota = "andaime aberto: base = largura do próprio andaime (" + brf(W, 2) + " m, da linha interna à externa); face = trecho de " + brf(Lmax, 2) + " m";
      }
      var v1 = nova("estab_nr18", "estabilidade", "Estabilidade sem ancoragem — altura ≤ 4 × menor base (NR-18 18.12.3)", "NR-18 18.12.3 (REGRA)");
      v1.formula = "H/b ≤ 4"; v1.valores = { H_m: H, b_m: b, razao: H / b }; v1.texto = "H = " + brf(H, 2) + " m; " + nota + " → H/b = " + brf(H / b, 2) + " ≤ 4,00; uso " + brf(H / b / 4, 3) + ".";
      v1.solicitante = "H/b = " + brf(H / b, 2); v1.resistente = "4,00"; peca(v1, "andaime", H / b / 4); fecha(v1);
      var v2 = nova("tombamento", "estabilidade", "Tombamento sem ancoragem (ELU2)", "NBR 6123:2023 (S2 por faixa de altura) e NBR 8681 (ELU2 = 1,0·G + 1,4·W)");
      v2.confirmarRT = ["cfTela / caTubo", "S3"];
      var Gk = M.pesoTotal * GRAV / 1000 * Gfrac;
      if (vt.ok) {
        var vf = ventoFaixa(0, Math.max(H, topoVento)), Mt = 1.4 * Lface * vf.m, Me = 1.0 * Gk * b / 2, u = Mt / Me, Fw = Lface * vf.f;
        v2.formula = "Mtomb = 1,4·L_face·Σ q(z)·cf(y)·Δy·y (faixas de 0,25 m) ≤ Mest = 1,0·G·b/2";
        v2.valores = { Fw_kN: Fw, Mtomb_kNm: Mt, Mest_kNm: Me, G_kN: Gk, b_m: b, H_m: H, Lface_m: Lface, bracoResultante_m: Fw > 0 ? vf.m / vf.f : 0 };
        v2.texto = "Vento por faixas de altura: Fw = " + brf(Fw, 2) + " kN, resultante a " + brf(Fw > 0 ? vf.m / vf.f : 0, 2) + " m do chão (não a H/2 = " + brf(H / 2, 2) + " m); Mtomb = 1,4·" + brf(Lface * vf.m, 2) + " = " + brf(Mt, 2) + " kN·m ≤ Mest = 1,0·" + brf(Gk, 2) + "·" + brf(b / 2, 3) + " = " + brf(Me, 2) + " kN·m; uso " + brf(u, 3) + " (" + nota + ").";
        v2.solicitante = brf(Mt, 2) + " kN·m"; v2.resistente = brf(Me, 2) + " kN·m"; peca(v2, "andaime", u); fecha(v2);
        if (fechado) v2.ressalvas.push("Anel sem ancoragem: o RT confirma.");
      } else { v2.texto = vt.motivo; v2.ressalvas.push(vt.motivo); v2.solicitante = "—"; v2.resistente = "—"; peca(v2, "andaime", null, "nao_verificado"); fecha(v2); naoV.push("Tombamento sem ancoragem: " + vt.motivo); }
    })();

    /* ---------- o que o motor NÃO verifica (listado sempre) */
    naoV.push("Rodapé de madeira (22 kgf/m): NBR 7190:2022 sem texto na biblioteca — não verificado; vão máximo do catálogo.");
    naoV.push("Varredor, diagonais (esforço de contraventamento), tubos de amarração: sem esforço calculado além da força nocional da giratória.");
    naoV.push("Luva (emenda) da longitudinal e do montante: tratada como rótula na longitudinal; capacidade à flexão da luva sem fonte (informar capLuva para verificar).");
    naoV.push("Impacto, queda de material e empuxo horizontal de pessoas: fora do escopo.");
    naoV.push("Material armazenado sobre o andaime durante a tempestade: não considerado (Q = 0 na combinação do vento) — não deixar material sobre o andaime fora do horário de trabalho.");
    if (!temTela) out.avisos.push("Andaime sem tela de fachada (tela = false): a NR-18 18.12.15 manda tela da 1ª plataforma até 2 m acima da última — o RT justifica; o vento usa a faixa cheia do guarda-corpo (18.9.4.2 d).");
    if (!modelo.par || modelo.par.ancoragem === "nenhuma") ress.push("Andaime sem ancoragem: valem a estabilidade e o tombamento do item correspondente.");

    out.verificacoes = verifs.filter(function (v) { return v.pecas.length || (v.valores && Object.keys(v.valores).length) || v.texto; });
    /* M3: parâmetro degenerado → as verificações que dependem dele ficam nao_verificado (nunca ok) */
    out.parametrosInvalidos.forEach(function (x) {
      out.verificacoes.forEach(function (v) {
        if (x.tipos.indexOf(v.tipo) < 0) return;
        v.estado = "nao_verificado"; v.uso = null; v.ressalvas.push("Parâmetro «" + x.chave + "» inválido: " + x.motivo + ".");
        Object.keys(v.porPeca).forEach(function (id) { v.porPeca[id].estado = "nao_verificado"; v.porPeca[id].uso = null; });
      });
    });
    out.ok = true;

    /* ---------- corrigir: devolve o par alterado e prova refazendo (nunca altera sozinho) */
    if (!opt.semCorrigir) {
      opt.cache = opt.cache || {};
      out.verificacoes.forEach(function (v) { if ((v.estado === "falha" || v.estado === "atencao") && v.uso != null && v.uso > 0.90 + 1e-9) v.corrigir = corrigirDe(modelo, par, P, v, opt.cache); });
    }
    out.resumo = resumir(out.verificacoes);
    return out;
  }

  function resumir(vs) {
    var n = vs.length, ok = vs.filter(function (v) { return v.estado === "ok"; }).length, nv = vs.filter(function (v) { return v.estado === "nao_verificado"; });
    var at = vs.filter(function (v) { return v.estado === "atencao"; }), fa = vs.filter(function (v) { return v.estado === "falha"; });
    var t = "Passa em " + ok + " de " + n + " verificações";
    if (fa.length) t += "; falha em: " + fa.map(function (v) { return v.titulo; }).join("; ");
    if (at.length) t += "; atenção em: " + at.map(function (v) { return v.titulo; }).join("; ");
    if (nv.length) t += "; não verificado: " + nv.map(function (v) { return v.titulo; }).join("; ");
    return t + ".";
  }

  /* ================================================================ CORRIGIR
   * Para cada verificação que não passa, procura entre valores de parâmetro (do mais folgado para o mais severo) o primeiro cujo
   * RECÁLCULO completo (montar + calcular) deixa essa verificação com uso ≤ 0,90; se não houver, o primeiro ≤ 1,00. Nunca altera o modelo. */
  var VAOS = [2.4, 2.2, 2.0, 1.8, 1.5, 1.25, 1.0];
  var MALHAS = [[4.0, 4.0], [3.0, 3.0], [3.0, 2.0], [2.0, 2.0], [2.0, 1.5], [1.5, 1.5], [1.0, 1.0]];
  function menores(lista, atual) { return lista.filter(function (x) { return x < atual - 1e-9; }); }
  function candidatos(modelo, P, v) {
    var par = modelo.par, c = [];
    function add(campos, texto) { c.push({ par: campos, texto: texto }); }
    function malhas() {
      MALHAS.forEach(function (x) { if (x[0] * x[1] < par.ancH * par.ancV - 1e-9) { var o = {}; o.ancH = x[0]; o.ancV = x[1]; add(o, "malha de ancoragem de " + brf(par.ancH, 1) + " × " + brf(par.ancV, 1) + " m para " + brf(x[0], 1) + " × " + brf(x[1], 1) + " m"); } });
      /* as ancoragens ficam nas estações do andaime: malha mais fechada só ajuda se houver estação (vão menor) */
      menores([2.4, 2.0, 1.5, 1.25, 1.0], par.vaoMax).forEach(function (x) { var o = {}; o.vaoMax = x; o.ancH = Math.min(par.ancH, x); o.ancV = Math.min(par.ancV, 2.0); add(o, "vão máximo de " + brf(par.vaoMax, 2) + " m para " + brf(x, 2) + " m e malha de ancoragem de " + brf(o.ancH, 1) + " × " + brf(o.ancV, 1) + " m"); });
    }
    if (v.tipo === "montante_topo" || v.tipo === "montante_guarda" || v.tipo === "montante") {
      if (par.tela && !par.ancTopo && par.ancoragem === "tubo") add({ travaTopo: true, ancTopo: true }, "longitudinal, transversal e ancoragem no topo da tela (travaTopo + ancTopo)");
    }
    if (v.tipo === "montante" || v.tipo === "contencao") {
      malhas();
      menores([1.5, 1.25, 1.0], par.levanteMax).forEach(function (x) { var o = {}; o.levanteMax = x; add(o, "levante máximo de " + brf(par.levanteMax, 2) + " m para " + brf(x, 2) + " m"); });
      menores(VAOS, par.vaoMax).forEach(function (x) { var o = {}; o.vaoMax = x; add(o, "vão máximo de " + brf(par.vaoMax, 2) + " m para " + brf(x, 2) + " m"); });
    } else if (v.tipo === "long_horizontal" || v.tipo === "ancoragem" || v.tipo === "montante_topo") {
      malhas();
    } else if (v.tipo === "travessa" || v.tipo === "abracadeira") {
      menores(VAOS, par.vaoMax).forEach(function (x) { var o = {}; o.vaoMax = x; add(o, "vão máximo de " + brf(par.vaoMax, 2) + " m para " + brf(x, 2) + " m"); });
    } else if (v.tipo === "guarda") {
      menores(VAOS, par.vaoMax).forEach(function (x) { var o = {}; o.vaoMax = x; add(o, "vão máximo de " + brf(par.vaoMax, 2) + " m para " + brf(x, 2) + " m"); });
    } else if (v.tipo === "montante_guarda") {
      if (!par.posteGuarda) add({ posteGuarda: true }, "poste de guarda-corpo no meio de cada vão");
      menores(VAOS, par.vaoMax).forEach(function (x) { var o = {}; o.vaoMax = x; if (!par.posteGuarda) o.posteGuarda = true; add(o, "vão máximo de " + brf(par.vaoMax, 2) + " m para " + brf(x, 2) + " m" + (o.posteGuarda ? " com poste de guarda-corpo" : "")); });
    } else if (v.tipo === "transversal") {
      [3, 2, 1].forEach(function (x) { if (x < par.nPranchas) { var o = {}; o.nPranchas = x; add(o, "plataforma com " + x + " pranchão(ões) de largura (em vez de " + par.nPranchas + ")"); } });
    } else if (v.tipo === "base") {
      [0.08, 0.05, 0.0].forEach(function (x) { if (x < par.roscaBase - 1e-9) { var o = {}; o.roscaBase = x; add(o, "rosca exposta da base de " + brf(par.roscaBase * 100, 0) + " cm para " + brf(x * 100, 0) + " cm"); } });
    } else if (v.tipo === "estabilidade") {
      if (par.ancoragem === "nenhuma") add({ ancoragem: "tubo" }, "ancorar o andaime na fachada (ancoragem por tubo)");
    }
    return c;
  }
  function corrigirDe(modelo, parCalc, P, v, cache) {
    if (modelo.sistema === "multidirecional") { var mcC = MC(); return mcC && mcC.corrigir ? mcC.corrigir(modelo, parCalc, P, v, cache, INTERNOS) : []; }
    var AnM = AN(), res = [], cands = candidatos(modelo, P, v), melhor = null, segundo = null;
    for (var i = 0; i < cands.length && !melhor; i++) {
      var par2 = clone(modelo.par); Object.keys(cands[i].par).forEach(function (k) { par2[k] = cands[i].par[k]; });
      var ck = JSON.stringify(par2), c2 = cache[ck];
      if (!c2) {
        var m2 = null; try { m2 = AnM.montar(par2); } catch (e) { m2 = null; }
        if (!m2 || !m2.ok) { cache[ck] = { ok: false, verificacoes: [] }; continue; }
        c2 = cache[ck] = calcular(m2, parCalc, { semCorrigir: true });
      }
      var v2 = null; c2.verificacoes.forEach(function (x) { if (x.tipo === v.tipo) v2 = v2 && v2.uso != null && (x.uso == null || x.uso <= v2.uso) ? v2 : x; });
      if (!v2 || v2.uso == null) continue;
      if (v2.uso <= 0.90 + 1e-9) melhor = { cand: cands[i], uso: v2.uso, resumo: c2.resumo };
      else if (v2.uso <= 1.0 + 1e-9 && !segundo) segundo = { cand: cands[i], uso: v2.uso, resumo: c2.resumo };
    }
    var ach = melhor || segundo;
    if (ach) res.push({ texto: "Alterar: " + ach.cand.texto + " — refeito, esta verificação passa (uso " + brf(ach.uso, 3) + ")." + (ach.resumo ? " Resultado geral: " + ach.resumo : ""), par: ach.cand.par, calc: null, usoRefeito: ach.uso, refeito: true });
    if (v.tipo === "prancha" || v.tipo === "prancha_pontual") res.push({ texto: "O vão do pranchão é o intervalo entre transversais: reduzir a carga de serviço, trocar por pranchão de seção/espécie mais forte (informar σ e E) ou usar dois pranchões sobrepostos — decisão do RT.", par: null, calc: null });
    if (v.tipo === "apoio") res.push({ texto: "Aumentar a área do calço (área necessária = N de serviço / sigmaSolo) ou melhorar o apoio — decisão do RT.", par: null, calc: null });
    if (v.tipo === "abracadeira") res.push({ texto: "Colocar abraçadeira de segurança logo abaixo (dupla) ou reduzir o vão.", par: null, calc: null });
    if (v.tipo === "montante_topo") {
      if (!ach) res.push({ texto: "Nenhuma das alterações testadas (ancTopo, malha, vão) resolve o balanço: tela só até o travessão superior (sem balanço) ou reprojeto — decisão do RT.", par: null, calc: null });
    }
    if (v.tipo === "montante_guarda") {
      res.push({ texto: "Escora / mão-francesa do montante na altura do guarda-corpo (ou montante duplo no último nível) — decisão do RT; o cálculo não modela.", par: null, calc: null });
      res.push({ texto: "Guarda-corpo ensaiado (laudo): só libera com o RT registrando o nº do laudo na aprovação (Aprovacao.registrarSolucao); o estado fica em atenção, nunca verde.", par: null, calc: { guardaLaudo: "<nº do laudo>" }, exigeLaudo: true });
    }
    if (!ach && v.tipo !== "prancha" && v.tipo !== "prancha_pontual" && v.tipo !== "apoio" && v.tipo !== "montante_topo" && v.tipo !== "montante_guarda") res.push({ texto: "Nenhum valor dos parâmetros testados resolve só por si: reduzir a carga de serviço (qServ) ou reprojetar com o RT.", par: null, calc: null });
    if (!ach && P.qServ > 0 && v.uso != null && v.uso > 1 && /^(montante|travessa|transversal|prancha|prancha_pontual|abracadeira|base|calco|apoio)$/.test(v.tipo)) res.push({ texto: "Alternativa: reduzir a carga de serviço qServ de " + brf(P.qServ, 2) + " para no máximo " + brf(P.qServ * 0.9 / v.uso, 2) + " kN/m² (estimativa linear — refazer o cálculo).", par: null, calc: { qServ: Math.floor(P.qServ * 0.9 / v.uso * 100) / 100 } });
    return res;
  }

  /* ================================================================ SIMULAÇÃO (estado por peça para pintar o 3D)
   * barra → verificação do papel; conexão fixa travessa×montante → abraçadeira; sem verificação → nao_verificado (cinza), nunca verde. */
  function simulacao(modelo, calc) {
    var mapa = {};
    if (!modelo || !modelo.ok || !calc || !calc.ok) return mapa;
    if (modelo.sistema === "multidirecional") { var mcS = MC(); if (mcS && mcS.simulacao) return mcS.simulacao(modelo, calc); }
    var porTipo = {}; calc.verificacoes.forEach(function (v) { (porTipo[v.tipo] = porTipo[v.tipo] || []).push(v); });
    function poe(id, v) {
      var o = v.porPeca[id]; if (!o) return false;
      var atual = mapa[id], novo = { estado: o.estado, uso: o.uso, verificacao: v.id };
      if (!atual || ORDEM_ESTADO[novo.estado] > ORDEM_ESTADO[atual.estado] || (novo.estado === atual.estado && (novo.uso || 0) > (atual.uso || 0))) mapa[id] = novo;
      return true;
    }
    function tipos(lista) { var r = []; lista.forEach(function (t) { arr(porTipo[t]).forEach(function (v) { r.push(v); }); }); return r; }
    var papelTipos = { montante: ["montante", "montante_topo", "montante_guarda", "contencao"], travessa: ["travessa", "long_horizontal"], transversal: ["transversal"], guarda: ["guarda"], intermediaria: ["guarda"], ancoragem: ["ancoragem"],
      diagonal: ["giratoria"], diagonalTransv: ["giratoria"], travaTopo: [], transversalTopo: [], posteGuarda: ["poste_guarda"] };
    modelo.barras.forEach(function (b) {
      var achou = false;
      tipos(papelTipos[b.papel] || []).forEach(function (v) { if (poe(b.id, v)) achou = true; });
      if (!achou) mapa[b.id] = { estado: "nao_verificado", uso: null, verificacao: null };
    });
    modelo.conexoes.forEach(function (c) {
      var achou = false;
      tipos(["abracadeira", "giratoria"]).forEach(function (v) { if (poe(c.id, v)) achou = true; });
      if (!achou) mapa[c.id] = { estado: "nao_verificado", uso: null, verificacao: null };
    });
    modelo.pranchas.forEach(function (pr) { var achou = false; tipos(["prancha", "prancha_pontual"]).forEach(function (v) { if (poe(pr.id, v)) achou = true; }); if (!achou) mapa[pr.id] = { estado: "nao_verificado", uso: null, verificacao: null }; });
    modelo.rodapes.forEach(function (r) { mapa[r.id] = { estado: "nao_verificado", uso: null, verificacao: null }; });
    modelo.bases.forEach(function (b) { var achou = false; tipos(["base", "apoio"]).forEach(function (v) { if (poe(b.id, v)) achou = true; }); if (!achou) mapa[b.id] = { estado: "nao_verificado", uso: null, verificacao: null }; });
    modelo.calcos.forEach(function (c) { var achou = false; tipos(["calco", "apoio"]).forEach(function (v) { if (poe(c.id, v)) achou = true; }); if (!achou) mapa[c.id] = { estado: "nao_verificado", uso: null, verificacao: null }; });
    return mapa;
  }

  /* ================================================================ MONTAR INTELIGENTE (E4.2)
   * montar → calcular → se houver FALHA, aplica as correções na ordem de MENOR CUSTO e refaz (no máximo 8 iterações):
   *   a. ancTopo/travaTopo (topo com tela contido)  b. posteGuarda  c. malha de ancoragem (ancH, ancV; NBR 6494 4.5.2: ≤ 6 m e ≤ 36 m²)
   *   d. vaoMax menor (de 0,25 em 0,25 m até 1,25 m)  e. levanteMax menor (até 1,50 m)  f. abraçadeira dupla de segurança nos nós que falham.
   * Só aceita uma mudança que MELHORA (menos falhas ou menor soma dos excessos). nao_verificado (sem V0, sem sigmaSolo) NÃO é falha e não dispara mudança,
   * mas vem em `pendencias`. `passou` é recalculado do ZERO a partir do par final: nunca diz «passou» sem passar.
   * devolve { par, modelo, calc, mudancas:[{campo, de, para, motivo}], passou, falhas[], atencao[], pendencias[], iteracoes, parOriginal } */
  function pontuar(c) {
    var n = 0, soma = 0, maior = 0;
    c.verificacoes.forEach(function (v) { if (v.estado === "falha") { n++; var u = Math.min(v.uso == null ? 99 : v.uso, 99); soma += u - 1; maior = Math.max(maior, u); } });
    return { n: n, soma: soma, maior: maior };
  }
  function melhor(a, b) { return a.n < b.n || (a.n === b.n && a.soma < b.soma - 1e-6); }
  function montarInteligente(par, opcoes) {
    opcoes = opcoes || {};
    var An = AN(), calcP = opcoes.calc || {}, maxIt = opcoes.maxIter || 8, cache = {}, mudancas = [];
    if (!An) return { passou: false, erro: "módulo andaime.js indisponível", mudancas: [], falhas: [], pendencias: [] };
    /* MULTIDIRECIONAL (M1): sem cálculo não há o que corrigir — devolve o modelo sem mudanças e a pendência da etapa M3 */
    if (par && par.sistema === "multidirecional") {
      var mcI = MC(); if (mcI && mcI.montarInteligente) return mcI.montarInteligente(par, opcoes, INTERNOS);
      var prM = An.normalizar(par), mM = null; try { mM = An.montar(prM); } catch (eM) { mM = null; }
      if (!mM || !mM.ok) return { passou: false, erro: "o andaime não monta com estes parâmetros" + (mM && mM.erro ? ": " + mM.erro : ""), par: prM, mudancas: [], falhas: [], pendencias: [] };
      var cM = calcular(mM, opcoes.calc || {}, { semCorrigir: true });
      return { faltam: [PEND_MULTI], par: prM, parOriginal: clone(prM), modelo: mM, calc: cM, mudancas: [], historico: [], iteracoes: 0, passou: false, falhas: [], atencao: [], pendenciasTexto: [PEND_MULTI],
        pendencias: [{ id: "multidirecional", titulo: "Cálculo do andaime multidirecional (etapa M3)", motivo: PEND_MULTI }], maiorUso: 0, maiorUsoEm: null };
    }
    var pr = An.normalizar(par || {}), parOrig = clone(pr);
    function avaliar(p2) {
      var k = JSON.stringify(p2); if (cache[k]) return cache[k];
      var m = null; try { m = An.montar(p2); } catch (e) { m = null; }
      if (!m || !m.ok) return (cache[k] = { ok: false });
      var c = calcular(m, calcP, { semCorrigir: true });
      return (cache[k] = { ok: true, m: m, c: c, sc: pontuar(c) });
    }
    var cur = avaliar(pr), historico = [];
    if (!cur.ok) return { passou: false, erro: "o andaime não monta com estes parâmetros", par: pr, mudancas: [], falhas: [], pendencias: [] };
    historico.push({ rotulo: "par de entrada", n: cur.sc.n, soma: cur.sc.soma });
    function falhasDe(c, tipos) { return c.verificacoes.filter(function (v) { return v.estado === "falha" && (!tipos || tipos.indexOf(v.tipo) >= 0); }); }
    function motivoDe(c, tipos) { var l = falhasDe(c, tipos).sort(function (a, b) { return (b.uso || 0) - (a.uso || 0); }).slice(0, 3); return l.map(function (v) { return v.titulo + " (uso " + brf(Math.min(v.uso == null ? 99 : v.uso, 99), 2) + ")"; }).join("; "); }
    function aplicar(p2, c0, tipos, rotulo) {
      Object.keys(p2).forEach(function (k) { if (JSON.stringify(p2[k]) !== JSON.stringify(pr[k])) mudancas.push({ campo: k, de: pr[k], para: p2[k], motivo: rotulo + " — " + motivoDe(c0, tipos) }); });
      pr = p2;
    }
    function tentar(candidatos, tipos, rotulo) {   /* primeiro candidato que zera as falhas dos `tipos`; senão o que mais melhora; só aceita se melhora */
      var bestC = null, bestS = null;
      for (var i = 0; i < candidatos.length; i++) {
        var p2 = clone(pr); Object.keys(candidatos[i]).forEach(function (k) { p2[k] = candidatos[i][k]; });
        var e = avaliar(p2); if (!e.ok) continue;
        if (!melhor(e.sc, cur.sc) && !(e.sc.n === cur.sc.n && falhasDe(e.c, tipos).length < falhasDe(cur.c, tipos).length)) continue;
        if (falhasDe(e.c, tipos).length === 0) { bestC = p2; bestS = e; break; }
        if (!bestS || melhor(e.sc, bestS.sc)) { bestC = p2; bestS = e; }
      }
      if (!bestC) return false;
      aplicar(bestC, cur.c, tipos, rotulo); cur = bestS; historico.push({ rotulo: rotulo, n: cur.sc.n, soma: cur.sc.soma }); return true;
    }
    var T_TOPO = ["montante_topo", "montante_guarda", "poste_guarda"], T_ANC = ["ancoragem", "long_horizontal", "contencao", "montante", "montante_topo"];
    var passos = [
      function () {   /* a */
        if (!(pr.tela && pr.ancoragem === "tubo" && (!pr.ancTopo || !pr.travaTopo)) || !falhasDe(cur.c, T_TOPO).length) return false;
        return tentar([{ travaTopo: true, ancTopo: true }], T_TOPO, "topo da tela contido (travaTopo + ancTopo)");
      },
      function () {   /* b */
        if (pr.posteGuarda || !falhasDe(cur.c, ["montante_guarda", "montante_topo"]).length) return false;
        return tentar([{ posteGuarda: true }], ["montante_guarda", "montante_topo"], "poste de guarda-corpo no meio do vão");
      },
      function () {   /* c */
        if (pr.ancoragem !== "tubo" || !falhasDe(cur.c, T_ANC).length) return false;
        var cs = []; [5, 4, 3, 2.5, 2, 1.5, 1.25].forEach(function (h) { [pr.ancV, 3, 2, 1.5].forEach(function (v) {
          if (h > 6 || v > 6 || h * v > 36 + 1e-9) return; if (h >= pr.ancH - 1e-9 && v >= pr.ancV - 1e-9) return;
          var o = { ancH: Math.min(h, pr.ancH), ancV: Math.min(v, pr.ancV) }; if (!cs.some(function (z) { return z.ancH === o.ancH && z.ancV === o.ancV; })) cs.push(o); }); });
        cs.sort(function (x, y) { return y.ancH * y.ancV - x.ancH * x.ancV; });
        return tentar(cs, T_ANC, "malha de ancoragem (NBR 6494 4.5.2: ≤ 6 m e ≤ 36 m²)");
      },
      function () {   /* d */
        var cs = []; for (var x = pr.vaoMax - 0.25; x >= 1.25 - 1e-9; x -= 0.25) { var o = { vaoMax: Math.round(x * 100) / 100 }; if (pr.ancH > x) o.ancH = Math.round(x * 100) / 100; cs.push(o); }
        if (!cs.length || !falhasDe(cur.c).length) return false;
        return tentar(cs, null, "vão máximo menor");
      },
      function () {   /* e */
        var cs = []; for (var x = pr.levanteMax - 0.25; x >= 1.5 - 1e-9; x -= 0.25) cs.push({ levanteMax: Math.round(x * 100) / 100 });
        if (!cs.length || !falhasDe(cur.c).length) return false;
        return tentar(cs, null, "levante máximo menor");
      },
      function () {   /* f */
        var fa = falhasDe(cur.c, ["abracadeira"]); if (!fa.length) return false;
        var nos = {}; cur.m.conexoes.forEach(function (c) { if (c.tipo === "fixa" && fa[0].porPeca[c.id] && fa[0].porPeca[c.id].estado === "falha") arr(c.barras).forEach(function (id) { var b = cur.m.barras.filter(function (z) { return z.id === id; })[0]; if (b && b.papel === "montante" && b.poste) nos[b.poste] = true; }); });
        var lista = Object.keys(nos); if (!lista.length) return false;
        return tentar([{ abracDupla: lista.join(";") }], ["abracadeira"], "abraçadeira dupla de segurança nos nós que falham");
      }
    ];
    var it = 0;
    while (it < maxIt && falhasDe(cur.c).length) {
      var mudou = false;
      for (var s2 = 0; s2 < passos.length && !mudou; s2++) mudou = passos[s2]();
      if (!mudou) break;
      it++;
    }
    /* E4.4 (4): se ainda falha, tenta o mais denso que o gerador permite (ancoragem a cada estação e a cada nível, vão 1,25 m, levante 1,50 m); só fica se melhorar */
    if (falhasDe(cur.c).length && pr.ancoragem === "tubo" && it < maxIt) {
      var den = { vaoMax: Math.min(pr.vaoMax, 1.25), levanteMax: Math.min(pr.levanteMax, 1.5), ancH: Math.min(pr.ancH, 1.25), ancV: Math.min(pr.ancV, 1.5) };
      if (den.vaoMax !== pr.vaoMax || den.levanteMax !== pr.levanteMax || den.ancH !== pr.ancH || den.ancV !== pr.ancV) {
        var pD = clone(pr); Object.keys(den).forEach(function (k) { pD[k] = den[k]; }); var eD = avaliar(pD);   /* aceito se baixa o MAIOR uso (mesmo com mais verificações no limite): o relato mostra o limite real */
        if (eD.ok && pontuar(eD.c).maior < pontuar(cur.c).maior - 1e-6) {
          Object.keys(den).forEach(function (k) { if (den[k] !== pr[k]) mudancas.push({ campo: k, de: pr[k], para: den[k], motivo: "densificação máxima do gerador (ancoragem a cada estação e a cada nível, vão 1,25 m, levante 1,50 m) — maior uso " + brf(pontuar(cur.c).maior, 2) + " → " + brf(pontuar(eD.c).maior, 2) }); });
          pr = pD; cur = eD; it++; historico.push({ rotulo: "densificação máxima", n: cur.sc.n, soma: cur.sc.soma });
        }
      }
    }
    /* E4.3 (6): depois de tudo, AFROUXA a malha: o maior espaçamento (de 0,5 em 0,5 m, ≤ 6 m, ≤ 36 m², nunca acima do que o usuário pediu) que ainda passa sem falha.
       Assim a malha nunca fica mais densa que a necessária (o passo do vão a apertava junto com vaoMax). */
    if (!falhasDe(cur.c).length && pr.ancoragem === "tubo") {
      var tetoH = Math.min(6, parOrig.ancH), tetoV = Math.min(6, parOrig.ancV);
      ["ancH", "ancV"].forEach(function (campo) {
        for (var g = 0; g < 30; g++) {
          var atual = pr[campo], prox = (Math.floor(atual / 0.5 + 1e-9) + 1) * 0.5, teto = campo === "ancH" ? tetoH : tetoV;
          if (prox > teto + 1e-9) {
            if (atual < teto - 1e-9) prox = teto; else break;
          }
          var p3 = clone(pr); p3[campo] = prox; if (p3.ancH * p3.ancV > 36 + 1e-9 || p3.ancH > 6 || p3.ancV > 6) break;
          var e3 = avaliar(p3); if (!e3.ok || falhasDe(e3.c).length) break;
          mudancas.push({ campo: campo, de: pr[campo], para: prox, motivo: "malha mais aberta que ainda passa (nunca mais densa que a necessária) — maior uso " + brf(pontuar(e3.c).maior > 0 ? pontuar(e3.c).maior : e3.c.verificacoes.reduce(function (m0, v) { return v.uso != null && v.estado !== "nao_verificado" ? Math.max(m0, Math.min(v.uso, 99)) : m0; }, 0), 2) });
          pr = p3; cur = e3; historico.push({ rotulo: "malha mais aberta", n: cur.sc.n, soma: cur.sc.soma });
        }
      });
    }
    /* mudanças repetidas no mesmo campo viram uma linha só (de original → para final) */
    (function () {
      var porCampo = {}, ordem = [];
      mudancas.forEach(function (m) { if (!porCampo[m.campo]) { porCampo[m.campo] = { campo: m.campo, de: m.de, para: m.para, motivo: m.motivo, passos: 1 }; ordem.push(m.campo); } else { porCampo[m.campo].para = m.para; porCampo[m.campo].passos++; } });
      mudancas = ordem.map(function (k) { return porCampo[k]; }).filter(function (m) { return JSON.stringify(m.de) !== JSON.stringify(m.para); });
    })();
    var fin = calcular(cur.m, calcP);   /* o par final refeito do zero, COM o corrigir */
    var fal = fin.verificacoes.filter(function (v) { return v.estado === "falha"; });
    /* E4.4 (4): quando não passa, diz o que falta — nunca maquia */
    var faltam = fal.map(function (v) {
      var t = v.titulo + " (uso " + brf(Math.min(v.uso == null ? 99 : v.uso, 99), 2) + ")";
      if (v.tipo === "ancoragem" && v.valores && v.valores.F_kN != null) t = "ancoragem de capacidade maior que " + brf(v.valores.F_kN, 2) + " kN (a adotada é " + brf(v.valores.capAncoragem_kN, 2) + " kN) — informe a do chumbador (capAncoragem) ou reduza a área de tela";
      else t += " — já no limite do gerador (vão 1,25 m, levante 1,50 m, ancoragem a cada estação e nível): exige reduzir a tela, mudar o sistema ou outro cálculo do RT";
      return t;
    });
    return {
      faltam: faltam, par: pr, parOriginal: parOrig, modelo: cur.m, calc: fin, mudancas: mudancas, historico: historico, iteracoes: it, passou: fal.length === 0,
      falhas: fal.map(function (v) { return { id: v.id, titulo: v.titulo, uso: v.uso, corrigir: v.corrigir }; }),
      atencao: fin.verificacoes.filter(function (v) { return v.estado === "atencao"; }).map(function (v) { return { id: v.id, titulo: v.titulo, uso: v.uso }; }),
      pendenciasTexto: (fin.pendencias || []).slice(),
      pendencias: fin.verificacoes.filter(function (v) { return v.estado === "nao_verificado"; }).map(function (v) { return { id: v.id, titulo: v.titulo, motivo: (v.ressalvas && v.ressalvas[0]) || v.texto || "" }; }),
      maiorUso: fin.verificacoes.reduce(function (m0, v) { return v.uso != null && v.estado !== "nao_verificado" ? Math.max(m0, Math.min(v.uso, 99)) : m0; }, 0),
      maiorUsoEm: (function () { var bv = null; fin.verificacoes.forEach(function (v) { if (v.uso != null && v.estado !== "nao_verificado" && (!bv || v.uso > bv.uso)) bv = v; }); return bv ? bv.id : null; })()
    };
  }

  /* M3: o que o multidirecional reaproveita do tubo-roll (revisado 3×) — nada é copiado, tudo vem daqui */
  var INTERNOS = { dep: dep, AN: AN, D88: D88, SEC: SEC, PAC: PAC, num: num, arr: arr, clone: clone, brf: brf, clamp: clamp, GRAV: GRAV, KGF_POR_KN: KGF_POR_KN, kgf: kgf, kN: kN, nkn: nkn,
    PADRAO: PADRAO, normalizar: normalizar, parametrosInvalidos: parametrosInvalidos, TABELA_BASE_KGF: TABELA_BASE_KGF, capBase: capBase, estadoDe: estadoDe, ORDEM_ESTADO: ORDEM_ESTADO, piorEstado: piorEstado,
    viga: viga, ncrColuna: ncrColuna, luFatorar: luFatorar, luResolver: luResolver, resolverSistema: resolverSistema, ventoDe: ventoDe, cfTelaDeFi: cfTelaDeFi, resumir: resumir, pontuar: pontuar, melhor: melhor,
    calcular: function (m, p, o) { return calcular(m, p, o); } };
  var AndaimeCalc = {
    _int: INTERNOS,
    versao: "E4.1", PADRAO: PADRAO, TABELA_BASE_KGF: TABELA_BASE_KGF, capBase: capBase, estadoDe: estadoDe, normalizar: normalizar, parametrosInvalidos: parametrosInvalidos,
    viga: viga, ncrColuna: ncrColuna, calcular: calcular, simulacao: simulacao, montarInteligente: montarInteligente, KGF_POR_KN: KGF_POR_KN
  };
  try { var An0 = AN(); if (An0) An0.montarInteligente = montarInteligente; } catch (e) { /* sem Andaime ainda */ }
  global.AndaimeCalc = AndaimeCalc;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimeCalc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

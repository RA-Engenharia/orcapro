/* =====================================================================
 * madmodelo.js — MODELO ANALÍTICO da estrutura de madeira para o CYPE 3D
 * (motor PURO, ES5, sem DOM, Node-testável). É o port de
 * gerar_modelo_V18.py (quiosque de referência, emissão R03, 12/10/2026): a mesma
 * fonte de peças que gera o Revit e o IFC gera nós, barras, apoios, placas,
 * cargas e os arquivos de texto de importação do CYPE 3D. Nada se modela à
 * mão no CYPE. O teste tools/test-mad-modelo.js roda o JS sobre as MESMAS
 * entradas do Python e exige os mesmos números — se mudar algo aqui, a
 * prova diz o que mudou.
 *
 * REGRAS DE MODELAGEM (cada uma com o porquê — texto idêntico ao campo
 * "regras" do modelo_V18.json, ver MadModelo.REGRAS):
 *  1. Peça horizontal = barra no EIXO da peça; pilar composto 4×(7×7) = uma
 *     barra no centro, S-140×140 (mesma área); peças "dupla" lado a lado =
 *     uma barra com b somado.
 *  2. Peça apoiada EM CIMA de outra (folga entre faces ≤ 5 cm) = barra
 *     vertical curta LIG_ROT, rotulada do lado da de baixo (o barrote é
 *     contínuo sobre a VP mas não torce a VP: tirefond inclinado não
 *     transmite momento).
 *  3. Ponta de peça na LATERAL de outra no mesmo nível = conector curto
 *     LIG_ROT do eixo da que recebe até a ponta, rotulado do lado dela.
 *  4. Cobertura no pilar composto = ligação RÍGIDA (nó comum; a favor do
 *     pilar). Barrote da fila no pilar = rotulado (regra 3).
 *  5. Apoio no pilarete: nó engastado no topo do concreto (cota ÚNICA, para
 *     o CYPECAD importar) e barra curta até o eixo da VP em GARFO (só o
 *     giro de flexão da VP livre; torção presa — rótula nos 2 planos fazia
 *     a viga rolar no R02). Pé do pilar = rótula.
 *  6. Parede de wood frame = PLACA por trecho cheio (sem vão de porta,
 *     b ≥ h/4), entre o dormente e a guia superior, com o E da rigidez da
 *     chapa pregada; peso ≈ 0 (o peso da parede vai como CP no dormente).
 *  7. Nós a menos de 1 cm viram um (barras de 4–17 mm não se clicam no CYPE).
 *
 * DIFERENÇAS PYTHON × JS que este port trata de propósito (cada uma foi
 * a causa possível de um número diferente):
 *  · round() do Python 3 é meio-para-o-par sobre o valor exato do double
 *    (pyRound/pyFixed); toFixed do JS arredonda o empate para cima.
 *  · "%g" e "%.nf" do Python (pyG/pyFixed), inclusive "-0.0000".
 *  · np.mean/np.sum fazem soma pairwise em blocos de 8 (npSoma).
 *  · np.linspace, // de float (pyFloorDiv), ordenação de tuplas.
 *  · dict em ordem de inserção: aqui, objetos com chaves não numéricas
 *    ou Map; "ordena igual" onde o Python usa sorted().
 *  · nenhuma entrada é modificada (o Python marca grupo_cype nas peças).
 *
 * ENTRADAS (objetos já carregados):
 *   fonte  = madeira_quiosque.json  (pecas[], piso_pw.niveis)
 *   opcoes.sobreposicao = v18_sobreposicao.json (pilaretes_v18[])
 *   opcoes.calcPiso     = calc_piso_v18.json (cargas_area_barrotes, paredes)
 *   opcoes.cargasCype   = cargas_cype.json  (cobertura_g_kN_m2, parede_kN_por_parcela)
 *   opcoes.ventoParedes = vento_paredes.json (q_kPa, Ca)
 *   opcoes.obra         = MadModelo.QUIOSQUE (o que é específico da obra)
 *   + tolerâncias com o default do Python: tolNo, tolSeg, folgaApoio,
 *     hParede, rPilar, scCob, ventoBorda, ventoPilar, prefixoArquivo.
 * SAÍDA: { modelo, placas, ops, balanco, hipoteses, textosCype, log, resumo }
 *   modelo = o modelo_V18.json; placas = lista do placas_V18.json;
 *   ops = ops_cargas_V18.json.ops; balanco = balanco_kN;
 *   textosCype = { "c3d_V18_<ETIQ>.txt": texto (CRLF, para gravar em latin-1) }.
 *
 * UNIDADES: m, kN, kPa. z = 0 no piso acabado.
 * Teste: node tools/test-mad-modelo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var MadModelo = {};

  /* ==================== BLOCO QUIOSQUE ====================
   * Tudo o que é específico da obra quiosque de referência (nomes, eixos, exceções
   * de painel, premissas do travamento). Para outra obra vira parâmetro:
   * passe outro objeto em opcoes.obra. O que está fora deste bloco é regra
   * geral de geometria. */
  MadModelo.QUIOSQUE = {
    sistema: "madeira V18 (revit_madeira): x ao longo do quiosque, y transversal, z = 0 no piso acabado (+17,5)",
    fonte: "madeira_quiosque.json + v18_sobreposicao.json + calc_piso_v18.json (08/10/2026)",
    chaveNivelApoio: "topo_concreto",          // piso_pw.niveis: −0,66 — cota única dos apoios
    chavePilaretes: "pilaretes_v18",           // sobreposição: lista dos pilaretes de concreto
    // verga 2×5×20 da frente do bar (V18): vence o vão do balcão -> família VERGA
    vergaFrenteBar: { grupo: "WF_VERGA", nomeContem: "frente do bar", grupoCype: "VERGA" },
    // painéis que não travam (nome da peça tem de bater em PN-nn ou "painel de wood frame nn")
    semTravar: { "14": "frente do bar aberta acima do peitoril (V18)" },
    // 08/10/2026: cobertura de baixo (z < 3,0) e de cima caem uma sobre a outra em planta; o motor de cargas
    // seleciona por clique EM PLANTA — nível de baixo = etiqueta própria (COBINF), como no R02
    cotaCobInf: 3.0,
    chaveCobInterna: "coberturas internas dos blocos (apoiadas nas paredes)",   // cargas_cype.parede_kN_por_parcela
    hipoteses: { CP: 1, SCpiso: 2, SCcob: 3, V1: 4, V2: 5, V3: 6, V4: 7 },
    // grupo da fonte -> família da etiqueta (grupo ausente = não é barra: o peso vai como carga)
    familia: { PISO_VIGA: "VP", PISO_BARROTE: "BAR", PISO_REQUADRO: "BAR", PISO_TESTEIRA: "TEST", PISO_DORMENTE: "DORM",
               COB_INF_VIGA: "COB", COB_INF_BLOQ: "COB", COB_SUP_VIGA: "COB", FORRO_BARROTE: "FORRO", WF_GUIA_SUP: "GUIA", VERGA: "VERGA" },
    material: { Tatajuba: ["Dicotiledônea C40, 2ª categoria", 1000.0], Pinus: ["Conífera C25", 600.0] },
    // quem recebe num encontro de topo (08/10/2026: "maior seção recebe" pendurou a guia do PN-12 na verga da frente do bar)
    prioridade: { VP: 6, GUIA: 5, DORM: 5, BAR: 4, COB: 4, VERGA: 3, FORRO: 3, TEST: 2 },
    // premissas do travamento por painel de wood frame (port de paineis_travamento.py; Johansen só entra pelo Kser)
    travamento: {
      S: 0.16, B_CHAPA: 1.20, T_CHAPA: 11.0, G_CHAPA: 500.0, D: 2.4, LP: 38.1, RHO_M_MAD: 420.0, RED_RIGIDEZ: 0.50,
      PREGO_REF: [2.7, 48.3],
      // painel: [faces, s_perímetro_m, (prego d, l)?]
      REFORCO: {
        "01": [2, 0.050],
        "11": [2, 0.040, [3.4, 55.2]],
        "09": [2, 0.075],
        "02": [2, 0.075],
        "10": [2, 0.075]
      }
    }
  };

  /* texto do campo "regras" do modelo_V18.json */
  MadModelo.REGRAS = [
    "(cada uma com o porquê):",
    " 1. Peça horizontal = barra no EIXO da peça (z do eixo); pilar composto 4×(7×7) = uma barra no centro do conjunto, S-140×140",
    "    (mesma área, como no R01). Peças \"dupla\" lado a lado (mesmo grupo, paralelas, encostadas) = uma barra com b somado.",
    " 2. Peça apoiada EM CIMA de outra (folga entre faces ≤ 5 cm — o Painel Wall de 4 cm fica entre o dormente e o barrote) = barra",
    "    vertical curta (etiqueta LIG_ROT) do eixo da de baixo ao eixo da de cima, rotulada do lado da de baixo: o barrote é contínuo",
    "    sobre a VP mas não torce a VP (tirefond inclinado L10 não transmite momento).",
    " 3. Ponta de peça encostada na LATERAL de outra no mesmo nível (cantoneira L08/L14/L15, tirefond L04, requadro, testeira) =",
    "    conector curto (LIG_ROT) do eixo da que recebe até a ponta, rotulado do lado da que recebe.",
    " 4. Cobertura no pilar composto (L03: viga no vão do pilar, barras M10 atravessando) = ligação RÍGIDA (LIG_RIG) — mesma premissa",
    "    do R01/R02 (pórtico; a favor do pilar). Barrote da fila no pilar (L15, cantoneiras) = rotulado (regra 3).",
    " 5. Apoio da madeira no pilarete: nó engastado no topo do concreto (−0,66, cota ÚNICA para o CYPECAD importar) e barra curta até o",
    "    eixo da VP em GARFO (só o giro de flexão da VP livre; torção presa — rótula nos 2 planos fazia a viga rolar no R02).",
    "    Pé do pilar (L01, uma barra M16 colada) = rótula (LIG_ROT do apoio até −0,62).",
    " 6. Parede de wood frame = PLACA por trecho cheio (sem vão de porta, b ≥ h/4), entre o eixo do dormente e o da guia superior,",
    "    material genérico com E da rigidez da chapa pregada (paineis_travamento.k_trecho, mesma fórmula do R01: placas_travamento.py);",
    "    peso ≈ 0 (o peso da parede vai como CP no dormente — calc_piso_v18 \"paredes\").",
    " 7. Nós a menos de 1 cm viram um (barras de 4–17 mm do R02 não se clicam no CYPE)."
  ].join("\n");

  var DEFAULTS = {
    tolNo: 0.01,                 // nós a menos de 1 cm viram um
    tolSeg: 0.04,                // nós da mesma barra a menos de 4 cm = um (barra curta não se clica)
    folgaApoio: 0.05,            // face a face (Painel Wall 40 mm entre dormente e barrote)
    hParede: 2.45,               // guia inferior (0,025) ao topo da guia superior (2,475)
    rPilar: 0.105,               // meia seção do pilar composto (raio de captura da cobertura)
    scCob: 0.50,                 // kN/m² — NBR 6120:2019 6.4
    ventoBorda: 0.725,           // kN/m (R00/R01)
    ventoPilar: 0.343,           // kN/m (R00/R01)
    prefixoArquivo: "c3d_V18_",
    /* Lado da rótula da LIG_ROT VERTICAL (peça apoiada em cima de outra). A regra 2 manda "do lado da de BAIXO" (o barrote
     * é contínuo sobre a VP mas não a torce). O gerar_modelo_V18.py criava a ligação com i = peça de CIMA e rotulava o nó i
     * — contra a própria regra. Achado em 12/10/2026 pela casca do madanalise: com a rótula embaixo os 73 pilaretes ficam a
     * < 10 % do CYPE 3D; com ela em cima, 46 de 73. "cima" só existe para a regressão contra o Python emitido. */
    rotulaVertical: "baixo"
  };

  /* ==================== helpers Python × JS ==================== */

  /** "%.nf" do Python (meio-para-o-par no valor exato do double; "-0.0000" para -0) */
  function pyFixed(x, n) {
    if (!isFinite(x)) { return String(x); }
    var neg = x < 0 || (x === 0 && 1 / x < 0);
    var ax = Math.abs(x);
    var s = ax.toFixed(n);                       // exato; o empate vai para cima
    var ext = ax.toFixed(Math.min(100, n + 40));
    var ponto = ext.indexOf(".");
    var frac = ext.slice(ponto + 1);
    var cauda = frac.slice(n);
    if (cauda.length && cauda.charAt(0) === "5" && /^50*$/.test(cauda)) {     // empate exato: par
      var t = ext.slice(0, ponto + 1 + n);
      if (n === 0) { t = ext.slice(0, ponto); }
      var ult = t.charAt(t.length - 1);
      if ((parseInt(ult, 10) % 2) === 0) { s = t; }
    }
    return (neg ? "-" : "") + s;
  }
  /** round(x, n) do Python 3 */
  function pyRound(x, n) {
    if (x === 0) { return x; }
    return parseFloat(pyFixed(x, n));
  }
  /** "%g" do Python (6 algarismos significativos; faixa usual de dimensões em cm) */
  function pyG(x) {
    if (x === 0) { return "0"; }
    var e = parseInt(x.toExponential(5).split("e")[1], 10);
    if (e < -4 || e >= 6) {
      var m = x.toExponential(5).split("e");
      var mant = m[0].indexOf(".") >= 0 ? m[0].replace(/0+$/, "").replace(/\.$/, "") : m[0];
      var ee = parseInt(m[1], 10);
      return mant + "e" + (ee < 0 ? "-" : "+") + (Math.abs(ee) < 10 ? "0" : "") + Math.abs(ee);
    }
    var s = x.toPrecision(6);
    if (s.indexOf(".") >= 0) { s = s.replace(/0+$/, "").replace(/\.$/, ""); }
    return s;
  }
  /** a // b de float do Python */
  function pyFloorDiv(vx, wx) {
    var mod = vx % wx;
    var div = (vx - mod) / wx;
    if (mod !== 0 && ((wx < 0) !== (mod < 0))) { div -= 1; }
    var fl;
    if (div !== 0) {
      fl = Math.floor(div);
      if (div - fl > 0.5) { fl += 1; }
    } else {
      fl = 0;
    }
    return fl;
  }
  /** soma de np.add.reduce em float64 contíguo (pairwise com 8 acumuladores; n < 8 = laço simples) */
  function npSoma(a) {
    var n = a.length, i, j, res;
    if (n < 8) {
      res = 0;
      for (i = 0; i < n; i++) { res += a[i]; }
      return res;
    }
    if (n <= 128) {
      var r = [];
      for (j = 0; j < 8; j++) { r[j] = a[j]; }
      for (i = 8; i < n - (n % 8); i += 8) {
        for (j = 0; j < 8; j++) { r[j] += a[i + j]; }
      }
      res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
      for (; i < n; i++) { res += a[i]; }
      return res;
    }
    var n2 = n >> 1; n2 -= n2 % 8;
    return npSoma(a.slice(0, n2)) + npSoma(a.slice(n2));
  }
  function npMedia(a) { return npSoma(a) / a.length; }
  /** np.linspace(lo, hi, num) */
  function npLinspace(lo, hi, num) {
    var div = num - 1, delta = hi - lo, step = delta / div, y = [], i;
    for (i = 0; i < num; i++) { y.push(step === 0 ? (i / div) * delta + lo : i * step + lo); }
    y[num - 1] = hi;
    return y;
  }
  function soma(a) { var s = 0, i; for (i = 0; i < a.length; i++) { s += a[i]; } return s; }   // sum() do Python
  function minimo(a) { var m = a[0], i; for (i = 1; i < a.length; i++) { if (a[i] < m) { m = a[i]; } } return m; }
  function maximo(a) { var m = a[0], i; for (i = 1; i < a.length; i++) { if (a[i] > m) { m = a[i]; } } return m; }
  function clamp(x, a, b) { return Math.min(Math.max(x, a), b); }   // min(max(x, a), b)
  function ceil(x) { return Math.ceil(x); }
  function ordNum(a) { return a.slice().sort(function (p, q) { return p - q; }); }
  function pyRepr(s) {
    if (typeof s === "number") { return String(s); }
    var asp = s.indexOf("'") >= 0 && s.indexOf("\"") < 0 ? "\"" : "'";
    return asp + s.replace(/\\/g, "\\\\").replace(new RegExp(asp, "g"), "\\" + asp) + asp;
  }
  function reprDict(ob) {
    var ps = [], k;
    for (k in ob) { if (Object.prototype.hasOwnProperty.call(ob, k)) { ps.push(pyRepr(k) + ": " + ob[k]); } }
    return "{" + ps.join(", ") + "}";
  }

  /* ---- vetores 3D / 2D (como np.array float) ---- */
  function sub(a, b) { var r = [], i; for (i = 0; i < a.length; i++) { r.push(a[i] - b[i]); } return r; }
  function add(a, b) { var r = [], i; for (i = 0; i < a.length; i++) { r.push(a[i] + b[i]); } return r; }
  function mul(a, k) { var r = [], i; for (i = 0; i < a.length; i++) { r.push(a[i] * k); } return r; }
  function dot(a, b) { var s = 0, i; for (i = 0; i < a.length; i++) { s += a[i] * b[i]; } return s; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function cross2(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function r4(x) { var r = [], i; for (i = 0; i < x.length; i++) { r.push(pyRound(x[i], 4)); } return r; }
  function xy(a) { return [a[0], a[1]]; }

  /* ---- travamento (port de paineis_travamento.py: só o que o modelo usa) ---- */
  function criarTravamento(T) {
    var KSER = Math.pow(T.RHO_M_MAD, 1.5) * Math.pow(T.D, 0.8) / 30.0;
    function kserPrego(d) { return Math.pow(T.RHO_M_MAD, 1.5) * Math.pow(d, 0.8) / 30.0; }
    var KSER_REF = kserPrego(T.PREGO_REF[0]);
    function kChapa(b, h, s, kser) {
      var sx2 = b * b / s * (b / 6 + h / 2);
      var sy2 = h * h / s * (b / 2 + h / 6);
      var kp = kser * sx2 * sy2 / ((sx2 + sy2) * h * h);
      var kg = T.G_CHAPA * T.T_CHAPA * (b * 1000) / (h * 1000);
      return 1.0 / (1.0 / kp + 1.0 / kg);
    }
    function kTrecho(b, h, s, faces, kser) {
      var n = pyFloorDiv(b, T.B_CHAPA), resto = b - n * T.B_CHAPA;
      var k = n * kChapa(T.B_CHAPA, h, s, kser);
      if (resto > 0.05) { k += kChapa(resto, h, s, kser); }
      return k * T.RED_RIGIDEZ * faces;
    }
    return { S: T.S, REFORCO: T.REFORCO, KSER: KSER, KSER_REF: KSER_REF, kserPrego: kserPrego, kTrecho: kTrecho };
  }

  /* ==================== o gerador ==================== */
  MadModelo.gerar = function (fonte, opcoes) {
    opcoes = opcoes || {};
    var k0, O = {};
    for (k0 in DEFAULTS) { O[k0] = (opcoes[k0] !== undefined) ? opcoes[k0] : DEFAULTS[k0]; }
    var Q = opcoes.obra || MadModelo.QUIOSQUE;
    var SOB = opcoes.sobreposicao, CALC = opcoes.calcPiso, CC = opcoes.cargasCype, VPAR = opcoes.ventoParedes;
    if (!fonte || !fonte.pecas || !SOB || !CALC || !CC || !VPAR) {
      throw new Error("MadModelo.gerar: faltam fonte.pecas, opcoes.sobreposicao, calcPiso, cargasCype ou ventoParedes");
    }
    if (O.rotulaVertical !== "baixo" && O.rotulaVertical !== "cima") throw new Error("MadModelo.gerar: rotulaVertical deve ser \"baixo\" ou \"cima\"");
    var PT = criarTravamento(Q.travamento);
    var TOL_NO = O.tolNo, TOL_SEG = O.tolSeg, FOLGA_APOIO = O.folgaApoio, H_PAREDE = O.hParede, R_PIL = O.rPilar;
    var Z_APOIO = fonte.piso_pw.niveis[Q.chaveNivelApoio];
    var Q_VENTO = VPAR.q_kPa, CA_PAREDE = VPAR.Ca;
    var G_COB = CC.cobertura_g_kN_m2, SC_COB = O.scCob;
    var G_COB_INTERNA = CC.parede_kN_por_parcela[Q.chaveCobInterna];
    var VENTO_BORDA = O.ventoBorda, VENTO_PILAR = O.ventoPilar;
    var HIP = Q.hipoteses;
    var VENTOS = [["V1", [1.0, 0, 0]], ["V2", [-1.0, 0, 0]], ["V3", [0, 1.0, 0]], ["V4", [0, -1.0, 0]]];
    var FAMILIA = Q.familia, MATERIAL = Q.material, PRIO = Q.prioridade;
    var avisos = [];
    var log = [];

    /* ---------------------------------------------- 1. barras-peça */
    function Membro(mid, grupo, fam, a, b, larg, alt, esp, ids, nome) {
      this.id = mid; this.grupo = grupo; this.fam = fam;
      this.a = a.slice(); this.b = b.slice();
      this.L = norm(sub(this.b, this.a));
      this.u = [(this.b[0] - this.a[0]) / this.L, (this.b[1] - this.a[1]) / this.L, (this.b[2] - this.a[2]) / this.L];
      this.hw = larg / 2.0; this.hv = alt / 2.0;
      this.larg = larg; this.alt = alt; this.esp = esp; this.ids = ids; this.nome = nome;
      this.pts = [0.0, this.L];
    }
    Membro.prototype.P = function (s) { return [this.a[0] + this.u[0] * s, this.a[1] + this.u[1] * s, this.a[2] + this.u[2] * s]; };
    Membro.prototype.s_de = function (p) { return dot(sub(p, this.a), this.u); };
    Membro.prototype.z = function (s) { return this.P(s)[2]; };
    Membro.prototype.horizontal = function () { return Math.abs(this.u[2]) < 0.3; };
    Membro.prototype.etiq = function () {
      if (this.fam === "PILAR") { return "PILAR"; }
      if (this.fam === "COB" && (this.a[2] + this.u[2] * this.L / 2) < Q.cotaCobInf) {
        return "COBINF_" + pyG(pyRound(this.larg * 100, 1)) + "x" + pyG(pyRound(this.alt * 100, 1));
      }
      return this.fam + "_" + pyG(pyRound(this.larg * 100, 1)) + "x" + pyG(pyRound(this.alt * 100, 1));
    };

    /** largura horizontal e altura vertical da seção pela caixa da fonte */
    function caixa(p) {
      var a = p.p0, b = p.p1;
      var ab = sub(b, a), nab = norm(ab);
      var d0 = [ab[0] / nab, ab[1] / nab, ab[2] / nab];
      var d1 = p.dir_largura.slice();
      var pd = dot(d1, d0);
      d1 = sub(d1, mul(d0, pd));
      var nd1 = norm(d1);
      d1 = [d1[0] / nd1, d1[1] / nd1, d1[2] / nd1];
      var d2 = cross3(d0, d1);
      var W = p.extensoes_m[1], T = p.extensoes_m[2];
      var alt = Math.abs(d1[2]) * W + Math.abs(d2[2]) * T;
      // seção NOMINAL (a caixa de uma peça inclinada dá 7,4×20,2 e multiplicava as etiquetas): em pé = b × h, deitada = h × b
      var b_ = p.secao_cm[0] / 100.0, h_ = p.secao_cm[1] / 100.0;
      return (Math.abs(alt - h_) <= Math.abs(alt - b_)) ? [b_, h_] : [h_, b_];
    }

    function grupoCype(p) {
      if (Object.prototype.hasOwnProperty.call(p, "grupo_cype")) { return p.grupo_cype; }
      var vf = Q.vergaFrenteBar;
      if (vf && p.grupo === vf.grupo && p.nome.indexOf(vf.nomeContem) >= 0) { return vf.grupoCype; }
      return p.grupo;
    }
    var pecas = [], i, j, p, q;
    for (i = 0; i < fonte.pecas.length; i++) {
      if (Object.prototype.hasOwnProperty.call(FAMILIA, grupoCype(fonte.pecas[i]))) { pecas.push(fonte.pecas[i]); }
    }
    var membros = [];
    var usadas = {};
    var par, larg, alt, a, b, qa, qb, ql, qh, esp, cx, cq;
    // 1a. dupla: mesma família, paralelas, mesmo comprimento, encostadas lado a lado -> uma barra (b somado)
    for (i = 0; i < pecas.length; i++) {
      p = pecas[i];
      if (usadas[p.id]) { continue; }
      cx = caixa(p); larg = cx[0]; alt = cx[1];
      a = p.p0; b = p.p1;
      par = null;
      for (j = i + 1; j < pecas.length; j++) {
        q = pecas[j];
        if (usadas[q.id] || grupoCype(q) !== grupoCype(p)) { continue; }
        qa = q.p0; qb = q.p1;
        if (Math.min(norm(sub(qa, a)) + norm(sub(qb, b)), norm(sub(qa, b)) + norm(sub(qb, a))) < 2 * (larg + 0.02)) {
          cq = caixa(q); ql = cq[0]; qh = cq[1];
          var mq = [((qa[0] + qb[0]) - (a[0] + b[0])) / 2, ((qa[1] + qb[1]) - (a[1] + b[1])) / 2, ((qa[2] + qb[2]) - (a[2] + b[2])) / 2];
          if (Math.abs(qh - alt) < 0.005 && norm(mq) <= (larg + ql) / 2 + 0.01) { par = q; break; }
        }
      }
      esp = ((p.especie || "").indexOf("Pinus") >= 0) ? "Pinus" : "Tatajuba";
      if (par !== null) {
        usadas[par.id] = true;
        ql = caixa(par)[0];
        qa = par.p0; qb = par.p1;
        if (norm(sub(qa, a)) > norm(sub(qa, b))) { var tmp = qa; qa = qb; qb = tmp; }
        membros.push(new Membro("M" + membros.length, p.grupo, FAMILIA[grupoCype(p)],
          [(a[0] + qa[0]) / 2, (a[1] + qa[1]) / 2, (a[2] + qa[2]) / 2], [(b[0] + qb[0]) / 2, (b[1] + qb[1]) / 2, (b[2] + qb[2]) / 2],
          larg + ql, alt, esp, [p.id, par.id], p.nome + " (dupla)"));
      } else {
        membros.push(new Membro("M" + membros.length, p.grupo, FAMILIA[grupoCype(p)], a, b, larg, alt, esp, [p.id], p.nome));
      }
      usadas[p.id] = true;
    }

    // 1b. pilar composto: centro das peças, do pé ao topo; aparado na última ligação depois
    var pilPecas = {}, pilNomes = [];
    for (i = 0; i < fonte.pecas.length; i++) {
      p = fonte.pecas[i];
      if (p.grupo === "PILAR_PECA") {
        if (!pilPecas[p.pilar]) { pilPecas[p.pilar] = []; pilNomes.push(p.pilar); }
        pilPecas[p.pilar].push(p);
      }
    }
    pilNomes.sort(function (x, y) { return parseInt(x.slice(1), 10) - parseInt(y.slice(1), 10); });
    var pilares = [];
    for (i = 0; i < pilNomes.length; i++) {
      var nome = pilNomes[i], ps = pilPecas[nome];
      var cxs = [], cys = [], z0s = [], z1s = [];
      for (j = 0; j < ps.length; j++) {
        cxs.push(ps[j].p0[0]); cys.push(ps[j].p0[1]);
        z0s.push(Math.min(ps[j].p0[2], ps[j].p1[2])); z1s.push(Math.max(ps[j].p0[2], ps[j].p1[2]));
      }
      var cxm = soma(cxs) / ps.length, cym = soma(cys) / ps.length;
      var ids = [];
      for (j = 0; j < ps.length; j++) { ids.push(ps[j].id); }
      var mp = new Membro("M" + membros.length, "PILAR_PECA", "PILAR", [cxm, cym, minimo(z0s)], [cxm, cym, maximo(z1s)],
        0.21, 0.21, "Tatajuba", ids, "Pilar composto " + nome + " 4x(7x7)");
      mp.pilar = nome;
      membros.push(mp); pilares.push(mp);
    }
    var horiz = [];
    for (i = 0; i < membros.length; i++) { if (membros[i].fam !== "PILAR") { horiz.push(membros[i]); } }
    var nDuplas = 0;
    for (i = 0; i < horiz.length; i++) { if (horiz[i].ids.length > 1) { nDuplas++; } }
    log.push("barras-peça: " + horiz.length + " horizontais (" + nDuplas + " duplas fundidas) + " + pilares.length + " pilares");

    /* ---------------------------------------------- 2. ligações */
    var ligs = [];   // {tipo, i:[membro,s]|["apoio",xyz,id], j, origem, rot_livre}

    function planoCruz(A, B) {
      var d = cross2(xy(A.u), xy(B.u));
      if (Math.abs(d) < 1e-6) { return null; }
      var w = [B.a[0] - A.a[0], B.a[1] - A.a[1]];
      var sA = cross2(w, xy(B.u)) / d;
      var sB = cross2(w, xy(A.u)) / d;
      return [sA / Math.hypot(A.u[0], A.u[1]), sB / Math.hypot(B.u[0], B.u[1])];
    }
    /** quem recebe: viga do piso > guia/dormente > barrote/cobertura > verga/forro > testeira; empate: maior seção */
    function prioGE(A, B) {
      var pa = PRIO[A.fam] !== undefined ? PRIO[A.fam] : 1, pb = PRIO[B.fam] !== undefined ? PRIO[B.fam] : 1;
      if (pa !== pb) { return pa > pb; }
      return A.larg * A.alt >= B.larg * B.alt;
    }
    function ponta(M, s, tol) { return s < tol || s > M.L - tol; }
    function addLig(tipo, pi, pj, origem, rotLivre) {
      ligs.push({ tipo: tipo, i: pi, j: pj, origem: origem, rot_livre: rotLivre === undefined ? null : rotLivre });
      var ms = [pi, pj], k;
      for (k = 0; k < 2; k++) {
        if (ms[k][0] instanceof Membro) { ms[k][0].pts.push(Math.min(Math.max(ms[k][1], 0.0), ms[k][0].L)); }
      }
    }

    /** LIG_ROT vertical: a rótula fica no nó i → i = peça de BAIXO (regra 2); "cima" = como o Python emitido */
    function ligVertical(pCima, pBaixo, origem) {
      if (O.rotulaVertical === "cima") addLig("LIG_ROT", pCima, pBaixo, origem);
      else addLig("LIG_ROT", pBaixo, pCima, origem);
    }

    var cont = {};
    function conta(k, n) { cont[k] = (cont[k] || 0) + (n === undefined ? 1 : n); }
    var ia, ib, A, B, cr, dl, s0, s1, ss, ea, eb, rec, car, sr, sc, sa_, sb_, sm, dz, toque, baixo, cima, n, k, pp, sA, sB, tA, tB, sA_, sB_, eA, eB, sb, pe, pr, pa, pb;
    var ordPar;
    for (ia = 0; ia < horiz.length; ia++) {
      A = horiz[ia];
      for (ib = ia + 1; ib < horiz.length; ib++) {
        B = horiz[ib];
        if (!(A.horizontal() && B.horizontal())) { continue; }
        cr = planoCruz(A, B);
        if (cr === null) {
          // paralelas: uma em cima da outra (dormente sobre barrote sob parede) -> ligações ao longo da sobreposição
          dl = Math.abs(cross2(xy(A.u), [B.a[0] - A.a[0], B.a[1] - A.a[1]]));
          if (dl > A.hw + B.hw + 0.01) { continue; }
          ordPar = [A.s_de(B.a), A.s_de(B.b)];
          s0 = Math.min(ordPar[0], ordPar[1]); s1 = Math.max(ordPar[0], ordPar[1]);
          if (s1 < 0.06 || s0 > A.L - 0.06) {                 // de topo (testeira com testeira, peça partida): conector rotulado
            var ptsA = [[A.a, 0.0], [A.b, A.L]], ptsB = [[B.a, 0.0], [B.b, B.L]], x1, x2;
            for (x1 = 0; x1 < 2; x1++) {
              for (x2 = 0; x2 < 2; x2++) {
                ea = ptsA[x1][0]; sa_ = ptsA[x1][1]; eb = ptsB[x2][0]; sb_ = ptsB[x2][1];
                if (norm(sub(ea, eb)) < 0.08 && Math.abs(ea[2] - eb[2]) < A.hv + B.hv) {
                  if (prioGE(A, B)) { rec = A; car = B; sr = sa_; sc = sb_; } else { rec = B; car = A; sr = sb_; sc = sa_; }
                  addLig("LIG_ROT", [rec, sr], [car, sc], "topo de " + car.etiq() + " com " + rec.etiq());
                  conta("de topo");
                }
              }
            }
            continue;
          }
          s0 = Math.max(s0, 0.0); s1 = Math.min(s1, A.L);
          if (s1 - s0 < 0.10) { continue; }
          sm = (s0 + s1) / 2;
          dz = B.z(B.s_de(A.P(sm))) - A.z(sm);
          toque = A.hv + B.hv;
          if (Math.abs(dz) < toque - 0.02) {                   // lado a lado no mesmo nível (requadro pregado no barrote)
            if (prioGE(A, B)) { rec = A; car = B; } else { rec = B; car = A; }
            var ses = [s0 + 0.05, s1 - 0.05], t;
            for (t = 0; t < 2; t++) {
              pp = A.P(ses[t]);
              addLig("LIG_ROT", [rec, rec.s_de(pp)], [car, car.s_de(pp)], car.etiq() + " encostada em " + rec.etiq());
            }
            conta("lado a lado", 2);
            continue;
          }
          if (!(toque - 0.02 <= Math.abs(dz) && Math.abs(dz) <= toque + FOLGA_APOIO)) { continue; }
          if (dz > 0) { baixo = A; cima = B; } else { baixo = B; cima = A; }
          n = Math.max(2, Math.ceil((s1 - s0 - 0.10) / 0.60) + 1);
          for (k = 0; k < n; k++) {
            var s = s0 + 0.05 + (s1 - s0 - 0.10) * k / (n - 1);
            pp = A.P(s);
            ligVertical([cima, cima.s_de(pp)], [baixo, baixo.s_de(pp)], "apoio paralelo " + cima.etiq() + " sobre " + baixo.etiq());
          }
          conta("paralelo", n);
          continue;
        }
        sA = cr[0]; sB = cr[1];
        tA = B.hw + (A.fam === "VERGA" ? 0.20 : 0.06); tB = A.hw + (B.fam === "VERGA" ? 0.20 : 0.06);
        if (!(-tA <= sA && sA <= A.L + tA && -tB <= sB && sB <= B.L + tB)) { continue; }
        sA_ = Math.min(Math.max(sA, 0.0), A.L); sB_ = Math.min(Math.max(sB, 0.0), B.L);
        dz = B.z(sB_) - A.z(sA_);
        toque = A.hv + B.hv;
        if (toque - 0.02 <= Math.abs(dz) && Math.abs(dz) <= toque + FOLGA_APOIO) {         // regra 2: uma em cima da outra
          if (dz > 0) { baixo = A; cima = B; sb = sA_; sc = sB_; } else { baixo = B; cima = A; sb = sB_; sc = sA_; }
          pp = cima.P(sc);                                // mesmo ponto em planta: o da peça de cima
          sb = Math.min(Math.max(baixo.s_de(pp), 0.0), baixo.L);
          ligVertical([cima, sc], [baixo, sb], cima.etiq() + " sobre " + baixo.etiq());
          conta("em cima");
        } else if (Math.abs(dz) < toque - 0.02) {                                        // mesmo nível: encontro de lado
          eA = ponta(A, sA, tA); eB = ponta(B, sB, tB);
          if (eA && !eB) {
            rec = B; car = A; sr = sB_; sc = (sA < A.L / 2 ? 0.0 : A.L);
          } else if (eB && !eA) {
            rec = A; car = B; sr = sA_; sc = (sB < B.L / 2 ? 0.0 : B.L);
          } else if (eA && eB) {                                                           // canto: quem recebe é a peça de maior função
            if (prioGE(A, B)) { rec = A; car = B; sr = sA_; sc = (sB < B.L / 2 ? 0.0 : B.L); }
            else { rec = B; car = A; sr = sB_; sc = (sA < A.L / 2 ? 0.0 : A.L); }
          } else {                                                                         // cruzamento no mesmo nível (as duas passam)
            pa = A.P(sA_); pb = B.P(sB_);
            if (norm(sub(pa, pb)) < TOL_NO) {
              addLig("UNIR", [A, sA_], [B, sB_], "cruzamento no mesmo nível");
            } else {
              if (pb[2] > pa[2]) { baixo = A; cima = B; sb = sA_; sc = sB_; } else { baixo = B; cima = A; sb = sB_; sc = sA_; }
              ligVertical([cima, sc], [baixo, sb], "cruzamento " + A.etiq() + " × " + B.etiq());
            }
            conta("cruzamento");
            continue;
          }
          // conector da ponta até o eixo de quem recebe (mínimo 2 cm: encurta a ponta se ela chega no eixo)
          pe = car.P(sc);
          sr = Math.min(Math.max(rec.s_de(pe), 0.0), rec.L);
          pr = rec.P(sr);
          if (norm(sub(pe, pr)) < TOL_SEG) {
            sc = sc + (sc === 0.0 ? (TOL_SEG + 0.005) : -(TOL_SEG + 0.005));
            car.pts.push(sc);
          }
          addLig("LIG_ROT", [rec, sr], [car, sc], "ponta de " + car.etiq() + " na lateral de " + rec.etiq());
          conta("ponta na lateral");
        }
      }
    }

    // pilares: cobertura rígida (regra 4), barrote da fila rotulado (regra 3)
    var P_, M, c, d, pm, zp, sp, se;
    for (i = 0; i < pilares.length; i++) {
      P_ = pilares[i];
      c = xy(P_.a);
      for (j = 0; j < horiz.length; j++) {
        M = horiz[j];
        if (!M.horizontal()) { continue; }
        var cm = [c[0] - M.a[0], c[1] - M.a[1]];
        var uu = M.u[0] * M.u[0] + M.u[1] * M.u[1];
        s = Math.min(Math.max(dot(cm, xy(M.u)) / Math.max(uu, 1e-9), 0.0), M.L);
        pm = M.P(s);
        d = norm([pm[0] - c[0], pm[1] - c[1]]);
        if (!(P_.a[2] - 0.01 <= pm[2] && pm[2] <= P_.b[2] + 0.12)) { continue; }
        if (M.fam === "COB" && d <= R_PIL + M.hw + 0.03) {
          zp = Math.min(pm[2], P_.b[2]);
          sp = zp - P_.a[2];
          if (d < TOL_NO && Math.abs(pm[2] - zp) < TOL_NO) {
            addLig("UNIR", [P_, sp], [M, s], M.etiq() + " no pilar " + P_.pilar + " (L03)");
          } else {
            addLig("UNIR", [P_, sp], [M, s], M.etiq() + " no pilar " + P_.pilar + " (L03, rígida: nó comum, excentricidade " + pyFixed(d * 1000, 0) + " mm)");
          }
          conta("cobertura no pilar");
        } else if (M.grupo === "PISO_BARROTE" && d <= R_PIL + 0.10 && ponta(M, s, 0.25)) {
          sp = pm[2] - P_.a[2];
          se = s < M.L / 2 ? 0.0 : M.L;
          addLig("LIG_ROT", [P_, sp], [M, se], "barrote da fila no pilar " + P_.pilar + " (L15)");
          conta("barrote no pilar");
        }
      }
    }

    // apoios nos pilaretes (regra 5)
    var pilaretes = SOB[Q.chavePilaretes];
    var apoios = [], pt, rx0, ry0, rx1, ry1, achou, it, mm, rl, tipo, nrl, ang;
    for (i = 0; i < pilaretes.length; i++) {
      pt = pilaretes[i];
      rx0 = pt.xt - pt.dx_t / 2 - 0.02; ry0 = pt.yt - pt.dy_t / 2 - 0.02;
      rx1 = pt.xt + pt.dx_t / 2 + 0.02; ry1 = pt.yt + pt.dy_t / 2 + 0.02;
      achou = 0;
      for (j = 0; j < horiz.length; j++) {
        M = horiz[j];
        if (M.grupo !== "PISO_VIGA") { continue; }
        it = clipSegmentoCaixa(M.a[0], M.a[1], M.b[0], M.b[1], rx0, ry0, rx1, ry1);
        if (it === null || it.comprimento < 0.02) { continue; }
        s = M.s_de([it.mx, it.my, M.a[2]]);
        s = Math.min(Math.max(s, 0.0), M.L);
        pp = M.P(s);
        rl = cross3([0, 0, 1.0], M.u); nrl = norm(rl); rl = [rl[0] / nrl, rl[1] / nrl, rl[2] / nrl];
        tipo = Math.abs(M.u[0]) >= Math.abs(M.u[1]) ? "APOIO_X" : "APOIO_Y";
        if (Math.min(Math.abs(M.u[0]), Math.abs(M.u[1])) > 0.1) {
          ang = Math.atan2(Math.abs(M.u[1]), Math.abs(M.u[0])) * (180.0 / Math.PI);
          avisos.push(M.etiq() + " (" + M.nome.slice(0, 30) + ") inclinada " + pyFixed(ang, 0) + "° em planta: garfo no plano " + tipo + " mais próximo (aproximação)");
          rl = tipo === "APOIO_X" ? [0, 1.0, 0] : [1.0, 0, 0];
        }
        // nó i = apoio (embaixo), j = VP: garfo no nó j, como as ligações provadas do R02 — engastamento APOIO_Y (1,1,1,0), APOIO_X (1,1,0,1)
        addLig(tipo, ["apoio", [pp[0], pp[1], Z_APOIO], pt.id], [M, s], "VP no pilarete " + pt.id + " (L09)", r4(rl));
        achou++;
      }
      for (j = 0; j < pilares.length; j++) {
        P_ = pilares[j];
        if (rx0 < P_.a[0] && P_.a[0] < rx1 && ry0 < P_.a[1] && P_.a[1] < ry1) {
          addLig("PE_PILAR", [P_, 0.0], ["apoio", [P_.a[0], P_.a[1], Z_APOIO], pt.id], "pé do pilar " + P_.pilar + " no pilarete " + pt.id + " (L01)");
          achou++;
        }
      }
      if (!achou) { avisos.push("pilarete " + pt.id + " sem madeira em cima"); }
      apoios.push(pt.id);
    }
    for (i = 0; i < pilares.length; i++) {
      P_ = pilares[i];
      var tem = false;
      for (j = 0; j < ligs.length; j++) { if (ligs[j].i[0] === P_ && ligs[j].j[0] === "apoio") { tem = true; break; } }
      if (!tem) { avisos.push("pilar " + P_.pilar + " fora de pilarete"); }
    }
    var nApoio = 0, nPe = 0;
    for (i = 0; i < ligs.length; i++) {
      if (ligs[i].tipo.indexOf("APOIO") === 0) { nApoio++; }
      if (ligs[i].tipo === "PE_PILAR") { nPe++; }
    }
    log.push("ligações: " + reprDict(cont) + " | apoios VP " + nApoio + ", pés de pilar " + nPe);

    // pilar aparado na ligação mais alta (o toco acima não tem função no modelo)
    for (i = 0; i < pilares.length; i++) {
      P_ = pilares[i];
      var zs = [];
      for (j = 0; j < ligs.length; j++) { if (ligs[j].i[0] === P_) { zs.push(ligs[j].i[1]); } }
      for (j = 0; j < ligs.length; j++) { if (ligs[j].j[0] === P_) { zs.push(ligs[j].j[1]); } }
      var topo = zs.length ? maximo(zs) : P_.L;
      if (topo < P_.L - 0.01) {
        P_.b = add(P_.a, mul(P_.u, topo)); P_.L = topo;
        P_.pts = P_.pts.filter(function (x) { return x <= topo + 1e-6; });
      }
    }

    /* ---------------------------------------------- 3. paredes (placas) */
    var dorm = {}, guia = {}, mt, kp;
    for (i = 0; i < horiz.length; i++) {
      M = horiz[i];
      mt = /PN-(\d+)/.exec(M.nome) || /painel de wood frame (\d+)/.exec(M.nome);
      if (!mt) { continue; }
      kp = ("0" + parseInt(mt[1], 10)).slice(-2);
      if (parseInt(mt[1], 10) >= 100) { kp = String(parseInt(mt[1], 10)); }
      if (M.fam === "DORM") { (dorm[kp] = dorm[kp] || []).push(M); }
      else if (M.fam === "GUIA") { (guia[kp] = guia[kp] || []).push(M); }
    }
    var vergas = {};
    for (i = 0; i < fonte.pecas.length; i++) {
      p = fonte.pecas[i];
      if (p.grupo === "WF_VERGA" && p.painel && p.nome.indexOf("Peitoril") < 0) {
        kp = p.painel.slice(3);
        (vergas[kp] = vergas[kp] || []).push([p.p0, p.p1]);
      }
    }
    var SEM_TRAVAR = Q.semTravar;
    var placas = [];
    var kdorm = Object.keys(dorm).sort();
    var D_, G, gs, g0, g1, lo, hi, vaos, trechos, cur, bb, a_, b_, ga, gb, fac, s_r, kser, Hm, k_tr, K_mod, rr, E_kPa, ref, tr, gi, di, vi, ab;
    for (i = 0; i < kdorm.length; i++) {
      k = kdorm[i];
      if (Object.prototype.hasOwnProperty.call(SEM_TRAVAR, k)) {
        avisos.push("painel " + k + " não trava: " + SEM_TRAVAR[k]);
        continue;
      }
      for (di = 0; di < dorm[k].length; di++) {
        D_ = dorm[k][di];
        gs = [];
        var gl = guia[k] || [];
        for (gi = 0; gi < gl.length; gi++) {
          G = gl[gi];
          if (Math.abs(Math.abs(dot(xy(G.u), xy(D_.u))) - 1) < 0.02 &&
              Math.abs(cross2(xy(D_.u), [G.a[0] - D_.a[0], G.a[1] - D_.a[1]])) < 0.03) { gs.push(G); }
        }
        if (!gs.length) {
          avisos.push("painel " + k + ": sem guia superior no plano do dormente — sem placa");
          continue;
        }
        G = gs[0];
        for (gi = 1; gi < gs.length; gi++) { if ((gs[gi].a[2] + gs[gi].b[2]) > (G.a[2] + G.b[2])) { G = gs[gi]; } }
        // trecho do dormente coberto pela guia, menos os vãos das vergas (± 5 cm de ombreira)
        ordPar = [D_.s_de(G.a), D_.s_de(G.b)];
        g0 = Math.min(ordPar[0], ordPar[1]); g1 = Math.max(ordPar[0], ordPar[1]);
        lo = Math.max(0.0, g0); hi = Math.min(D_.L, g1);
        vaos = [];
        var vl = vergas[k] || [];
        for (vi = 0; vi < vl.length; vi++) {
          var va0 = D_.s_de(vl[vi][0]) - 0.05, va1 = D_.s_de(vl[vi][1]) + 0.05;
          vaos.push(va0 <= va1 ? [va0, va1] : [va1, va0]);
        }
        vaos.sort(function (x, y) { return x[0] !== y[0] ? x[0] - y[0] : x[1] - y[1]; });
        trechos = []; cur = lo;
        for (vi = 0; vi < vaos.length; vi++) {
          if (vaos[vi][1] < lo || vaos[vi][0] > hi) { continue; }
          if (vaos[vi][0] - cur > 0.05) { trechos.push([cur, vaos[vi][0]]); }
          cur = Math.max(cur, vaos[vi][1]);
        }
        if (hi - cur > 0.05) { trechos.push([cur, hi]); }
        for (vi = 0; vi < trechos.length; vi++) {
          a_ = trechos[vi][0]; b_ = trechos[vi][1];
          bb = b_ - a_;
          if (bb < 0.20) { continue; }
          if (bb < H_PAREDE / 4) {
            avisos.push("painel " + k + ": trecho " + pyFixed(bb, 2) + " m < h/4 — placa só para sustentar a guia (não conta no travamento)");
          }
          D_.pts.push(a_, b_);
          ga = G.s_de(D_.P(a_)); gb = G.s_de(D_.P(b_));
          G.pts.push(Math.min(Math.max(ga, 0), G.L), Math.min(Math.max(gb, 0), G.L));
          ref = PT.REFORCO[k];
          if (ref) { fac = ref[0]; s_r = ref[1]; } else { fac = 1; s_r = PT.S; }
          kser = ref ? (ref.length > 2 ? PT.kserPrego(ref[2][0]) : PT.KSER_REF) : PT.KSER;
          Hm = npMedia([G.z(Math.min(Math.max(ga, 0), G.L)), G.z(Math.min(Math.max(gb, 0), G.L))]) - D_.z(a_);
          k_tr = PT.kTrecho(bb, H_PAREDE, s_r, fac, kser);                 // N/mm = kN/m
          K_mod = k_tr * H_PAREDE / Hm;
          rr = Hm / bb;
          E_kPa = K_mod * (2.6 * rr + Math.pow(rr, 3)) / 0.10;
          placas.push({ painel: k, dormente: D_, guia: G, trecho: [a_, b_], b_m: pyRound(bb, 3), H_m: pyRound(Hm, 3),
            conta_travamento: bb >= H_PAREDE / 4, faces: fac, s_m: s_r, reforco: !!ref,
            K_trecho_kN_m: pyRound(k_tr, 1), K_modelo_kN_m: pyRound(K_mod, 1), E_MPa: pyRound(E_kPa / 1000.0, 1), t_m: 0.10, nu: 0.30 });
        }
      }
    }
    log.push("placas (paredes que travam): " + placas.length);

    /* ---------------------------------------------- 4. nós e barras */
    var nos = [];            // [x, y, z]
    var grade = {};
    function no(pt3) {
      var kx = Math.floor(pt3[0] / TOL_NO), ky = Math.floor(pt3[1] / TOL_NO), kz = Math.floor(pt3[2] / TOL_NO);
      var dx, dy, dz2, lst, ii, ch;
      for (dx = -1; dx <= 1; dx++) {
        for (dy = -1; dy <= 1; dy++) {
          for (dz2 = -1; dz2 <= 1; dz2++) {
            lst = grade[(kx + dx) + "," + (ky + dy) + "," + (kz + dz2)];
            if (!lst) { continue; }
            for (ii = 0; ii < lst.length; ii++) {
              if (norm(sub(nos[lst[ii]], pt3)) < TOL_NO) { return lst[ii] + 1; }
            }
          }
        }
      }
      nos.push(r4(pt3));
      ch = kx + "," + ky + "," + kz;
      (grade[ch] = grade[ch] || []).push(nos.length - 1);
      return nos.length;
    }

    for (i = 0; i < membros.length; i++) {
      M = membros[i];
      ss = ordNum(M.pts);
      var junt = [ss[0]];
      for (j = 1; j < ss.length; j++) {
        s = ss[j];
        if (s - junt[junt.length - 1] >= TOL_SEG) { junt.push(s); }
        else if (s >= M.L - 1e-9) { junt[junt.length - 1] = M.L; }      // a ponta da peça fica; o ponto vizinho vai para ela
      }
      if (junt.length > 1 && junt[junt.length - 1] - junt[junt.length - 2] < TOL_SEG) { junt.splice(junt.length - 2, 1); }
      M.nos_s = junt;
      M.nos = junt.map(function (sv) { return no(this.P(sv)); }, M);
    }

    function noMembro(Mx, sv) {
      var im = 0, best = Math.abs(Mx.nos_s[0] - sv), jj, dd;
      for (jj = 1; jj < Mx.nos_s.length; jj++) {
        dd = Math.abs(Mx.nos_s[jj] - sv);
        if (dd < best) { best = dd; im = jj; }
      }
      if (Math.abs(Mx.nos_s[im] - sv) > TOL_SEG + 1e-6) {
        throw new Error("ponto " + pyFixed(sv, 3) + " fora dos nós de " + Mx.id + " (" + Mx.nome + ")");
      }
      return Mx.nos[im];
    }

    var barras = [];
    function barra(ni, nj, etiq, kw) {
      if (ni === nj) { return null; }
      var bo = { id: barras.length + 1, i: ni, j: nj, grupo: etiq }, kk;
      for (kk in kw) { if (Object.prototype.hasOwnProperty.call(kw, kk) && kw[kk] !== null && kw[kk] !== undefined) { bo[kk] = kw[kk]; } }
      barras.push(bo);
      return bo.id;
    }

    var segDe = {};          // membro.id -> [[s0, s1, id da barra]]
    for (i = 0; i < membros.length; i++) {
      M = membros[i];
      segDe[M.id] = [];
      for (k = 0; k < M.nos.length - 1; k++) {
        var bid = barra(M.nos[k], M.nos[k + 1], M.etiq(), {
          desc: M.nome.slice(0, 60) + " " + (M.fam !== "PILAR" ? M.ids.join("/").slice(0, 40) : M.pilar), membro: M.id, seg: k });
        if (bid) { segDe[M.id].push([M.nos_s[k], M.nos_s[k + 1], bid]); }
      }
    }
    var apoioNos = {};       // nó -> id do pilarete
    var unir = [];
    function noLig(e) {
      if (e[0] === "apoio") {
        var n_ = no(e[1]); apoioNos[n_] = e[2];
        return n_;
      }
      return noMembro(e[0], e[1]);
    }
    for (i = 0; i < ligs.length; i++) {
      var l = ligs[i];
      var ni = noLig(l.i), nj = noLig(l.j);
      if (l.tipo === "UNIR") {
        if (ni !== nj) { unir.push([ni, nj]); }
        continue;
      }
      var kw = { desc: l.origem };
      if (l.tipo === "LIG_ROT" || l.tipo === "PE_PILAR") { kw.art_ini = true; }   // rótula nos 2 planos no nó i
      else if (l.tipo.indexOf("APOIO") === 0) { kw.garfo_fim = true; kw.rot_livre = l.rot_livre; }
      barra(ni, nj, l.tipo, kw);
    }

    // nós unidos (cobertura no pilar, cruzamento no mesmo nível): o nó da peça vira o do pilar/da outra peça
    var pai = {};
    function raiz(nn) {
      while (pai[nn] !== undefined && pai[nn] !== nn) { nn = pai[nn]; }
      return nn;
    }
    for (i = 0; i < unir.length; i++) {
      var ra = raiz(unir[i][0]), rb = raiz(unir[i][1]);
      if (ra !== rb) { pai[rb] = ra; }
    }
    for (i = 0; i < barras.length; i++) { barras[i].i = raiz(barras[i].i); barras[i].j = raiz(barras[i].j); }
    barras = barras.filter(function (bx) { return bx.i !== bx.j; });
    // 08/10/2026: duas barras no MESMO par de nós -> o CYPE 3D recusa o arquivo de importação ("erro 280"). Fica UMA barra por par:
    //   a peça de maior seção; ligação só se não houver peça. A barra retirada empresta o trecho para a mantida (cargas).
    var MB = {};
    for (i = 0; i < membros.length; i++) { MB[membros[i].id] = membros[i]; }
    function ehLig(g) { return g === "LIG_ROT" || g === "PE_PILAR" || g === "APOIO_X" || g === "APOIO_Y"; }
    function pesoSecao(bx) {
      if (ehLig(bx.grupo)) { return -1.0; }
      var M_ = MB[bx.membro];
      return ((M_ && M_.larg) || 0.14) * ((M_ && M_.alt) || 0.14);
    }
    var porPar = {}, ordemPar = [];
    for (i = 0; i < barras.length; i++) {
      var kpar = Math.min(barras[i].i, barras[i].j) + "," + Math.max(barras[i].i, barras[i].j);
      if (!porPar[kpar]) { porPar[kpar] = []; ordemPar.push(kpar); }
      porPar[kpar].push(barras[i]);
    }
    var removidas = [], manter = [];
    for (i = 0; i < ordemPar.length; i++) {
      var bs = porPar[ordemPar[i]], kb = bs[0];
      for (j = 1; j < bs.length; j++) { if (pesoSecao(bs[j]) > pesoSecao(kb)) { kb = bs[j]; } }   // max estável: empate fica a 1ª
      manter.push(kb);
      for (j = 0; j < bs.length; j++) { if (bs[j] !== kb) { removidas.push([bs[j], kb]); } }
    }
    if (removidas.length) {
      var cnt = {};
      for (i = 0; i < removidas.length; i++) { var ck = removidas[i][0].grupo + " sob " + removidas[i][1].grupo; cnt[ck] = (cnt[ck] || 0) + 1; }
      avisos.push(removidas.length + " barras repetidas no mesmo par de nós retiradas (CYPE recusa): " + reprDict(cnt));
    }
    barras = barras.filter(function (bx) { return manter.indexOf(bx) >= 0; });
    for (i = 0; i < barras.length; i++) { barras[i].id = i + 1; }
    for (i = 0; i < membros.length; i++) { membros[i].nos = membros[i].nos.map(raiz); }
    segDe = {};
    for (i = 0; i < membros.length; i++) { segDe[membros[i].id] = []; }
    for (i = 0; i < barras.length; i++) {
      if (barras[i].membro !== undefined) {
        M = MB[barras[i].membro]; k = barras[i].seg;
        segDe[M.id].push([M.nos_s[k], M.nos_s[k + 1], barras[i].id]);
      }
    }
    for (i = 0; i < removidas.length; i++) {         // trecho da peça retirada -> carga na barra mantida (mesmos nós)
      if (removidas[i][0].membro !== undefined) {
        M = MB[removidas[i][0].membro]; k = removidas[i][0].seg;
        segDe[M.id].push([M.nos_s[k], M.nos_s[k + 1], removidas[i][1].id]);
      }
    }
    var apoioNos2 = {};
    for (k in apoioNos) { if (Object.prototype.hasOwnProperty.call(apoioNos, k)) { apoioNos2[raiz(parseInt(k, 10))] = apoioNos[k]; } }
    apoioNos = apoioNos2;
    var gr = {}, etiqs = [];
    for (i = 0; i < barras.length; i++) { if (!gr[barras[i].grupo]) { gr[barras[i].grupo] = true; etiqs.push(barras[i].grupo); } }
    function ehLigApoio(g) { return g.indexOf("LIG") === 0 || g.indexOf("APOIO") === 0; }
    var ETIQS = etiqs.sort(function (x, y) {
      var bx = ehLigApoio(x), by = ehLigApoio(y);
      if (bx !== by) { return bx ? 1 : -1; }
      return x < y ? -1 : (x > y ? 1 : 0);
    });
    log.push("nós " + nos.length + " | barras " + barras.length + " | etiquetas " + ETIQS.length + ": " + ETIQS.join(", "));
    var curtas = [];
    for (i = 0; i < barras.length; i++) {
      if (norm(sub(nos[barras[i].i - 1], nos[barras[i].j - 1])) < 0.03) { curtas.push(barras[i]); }
    }
    if (curtas.length) {
      avisos.push(curtas.length + " barras com menos de 3 cm (CYPE não clica): [" + curtas.slice(0, 10).map(function (bx) {
        return "(" + bx.id + ", " + pyRepr(bx.grupo) + ", " + pyRepr(bx.desc.slice(0, 40)) + ")"; }).join(", ") + "]");
    }

    // seções por etiqueta (série "RA Quiosque"; perfil = largura x altura em cm; pilar = S-140x140 maciça de mesma área)
    var secoes = {}, e;
    for (i = 0; i < membros.length; i++) {
      M = membros[i];
      e = M.etiq();
      if (secoes[e]) { continue; }
      if (M.fam === "PILAR") {
        secoes[e] = { serie: "Maciça h140", perfil: "S-140x140", b_cm: 14, h_cm: 14, material: MATERIAL.Tatajuba[0] };
      } else {
        secoes[e] = { serie: "RA Quiosque", perfil: pyG(pyRound(M.larg * 100, 1)) + "x" + pyG(pyRound(M.alt * 100, 1)),
          b_cm: pyRound(M.larg * 100, 1), h_cm: pyRound(M.alt * 100, 1), material: MATERIAL[M.esp][0], especie: M.esp };
      }
    }
    var LIBERACAO = { LIG_ROT: "rótula nos 2 planos no nó i", PE_PILAR: "rótula nos 2 planos no nó i (pé do pilar)",
      APOIO_X: "garfo no nó j (VP): giro livre em torno de Y global — engastamento (1,1,0,1)",
      APOIO_Y: "garfo no nó j (VP): giro livre em torno de X global — engastamento (1,1,1,0)" };
    var ge = ["LIG_ROT", "PE_PILAR", "APOIO_X", "APOIO_Y"];
    for (i = 0; i < ge.length; i++) {
      secoes[ge[i]] = { serie: "genérico", perfil: "aço 10x10", b_cm: 10, h_cm: 10, E_MPa: 200000.0, nu: 0.25, gama_kN_m3: 0.01, liberacao: LIBERACAO[ge[i]] };
    }

    /* ---------------------------------------------- 5. cargas */
    var ops = [];
    var balanco = {};
    function balAdd(hip, v) { balanco[hip] = (balanco[hip] || 0) + v; }

    function segsDe(Mx, s0_, s1_) {
      return segDe[Mx.id].filter(function (t) { return t[1] > s0_ + 1e-6 && t[0] < s1_ - 1e-6; });
    }
    /** carga uniforme q (kN/m) no trecho [s0, s1] do membro -> uniforme por barra (trecho inteiro) ou faixa (parcial) */
    function cargaLinha(Mx, s0_, s1_, qq, hip, direc, origem) {
      var sg = segsDe(Mx, s0_, s1_), t, aa, bb_;
      for (t = 0; t < sg.length; t++) {
        aa = Math.max(sg[t][0], s0_); bb_ = Math.min(sg[t][1], s1_);
        if (bb_ - aa < 1e-4) { continue; }
        balAdd(hip, qq * (bb_ - aa));
        if (aa - sg[t][0] < 0.005 && sg[t][1] - bb_ < 0.005) {
          ops.push({ tipo: "uniforme", hip: HIP[hip], dir: direc, q: qq, barras: [sg[t][2]], origem: origem });
        } else {
          ops.push({ tipo: "faixa", hip: HIP[hip], dir: direc, q: qq, a: pyRound(aa - sg[t][0], 4), b: pyRound(bb_ - sg[t][0], 4),
            barras: [sg[t][2]], origem: origem });
        }
      }
    }
    function dirTxt(vec) {
      var kk = 0, m = Math.abs(vec[0]);
      if (Math.abs(vec[1]) > m) { kk = 1; m = Math.abs(vec[1]); }
      if (Math.abs(vec[2]) > m) { kk = 2; }
      return (vec[kk] > 0 ? "+" : "-") + "XYZ".charAt(kk);
    }

    var porId = {};
    for (i = 0; i < membros.length; i++) { for (j = 0; j < membros[i].ids.length; j++) { porId[membros[i].ids[j]] = membros[i]; } }
    var pecaPorId = {};
    for (i = 0; i < fonte.pecas.length; i++) { if (pecaPorId[fonte.pecas[i].id] === undefined) { pecaPorId[fonte.pecas[i].id] = fonte.pecas[i]; } }

    // 5a. piso: faixas de área dos barrotes (calc_piso_v18), média por barra (soma conservada)
    var pids = Object.keys(CALC.cargas_area_barrotes), ca, p0, up, hips = [["CP", "G"], ["SCpiso", "Q"]], hh, faixas, f, tot, x0, x1_, qv, sg2, sgi;
    for (i = 0; i < pids.length; i++) {
      var pid = pids[i];
      M = porId[pid];
      if (M === undefined) { avisos.push("barrote " + pid + " do cálculo não está no modelo"); continue; }
      ca = CALC.cargas_area_barrotes[pid];
      p = pecaPorId[pid];
      if (p === undefined) { throw new Error("peça " + pid + " não encontrada na fonte"); }
      p0 = p.p0;
      var dpp = sub(p.p1, p0), ndp = norm(dpp);
      up = [dpp[0] / ndp, dpp[1] / ndp, dpp[2] / ndp];            // o cálculo mede s a partir do p0 da peça
      for (hh = 0; hh < 2; hh++) {
        faixas = [];
        var cl = ca[hips[hh][1]];
        for (f = 0; f < cl.length; f++) {
          var sa1 = M.s_de(add(p0, mul(up, cl[f][0]))), sa2 = M.s_de(add(p0, mul(up, cl[f][1])));
          faixas.push([Math.min(sa1, sa2), Math.max(sa1, sa2), cl[f][2]]);
        }
        sg2 = segDe[M.id];
        for (sgi = 0; sgi < sg2.length; sgi++) {
          tot = 0.0;
          for (f = 0; f < faixas.length; f++) {
            x0 = Math.max(sg2[sgi][0], faixas[f][0]); x1_ = Math.min(sg2[sgi][1], faixas[f][1]);
            if (x1_ > x0) { tot += faixas[f][2] * (x1_ - x0); }
          }
          if (tot > 1e-6) {
            qv = ceil(tot / (sg2[sgi][1] - sg2[sgi][0]) * 100) / 100.0;
            ops.push({ tipo: "uniforme", hip: HIP[hips[hh][0]], dir: "-Z", q: qv, barras: [sg2[sgi][2]], origem: "piso (calc_piso_v18)" });
            balAdd(hips[hh][0], qv * (sg2[sgi][1] - sg2[sgi][0]));
          }
        }
      }
    }
    // 5b. paredes: peso no dormente (CP); vento metade no dormente e metade na guia superior
    var pw, aw, bw, dd2, kk2;
    for (i = 0; i < CALC.paredes.length; i++) {
      pw = CALC.paredes[i];
      kk2 = pw.painel.slice(3);
      aw = [pw.a[0], pw.a[1], 0]; bw = [pw.b[0], pw.b[1], 0];
      var dl_ = dorm[kk2] || [];
      for (di = 0; di < dl_.length; di++) {
        D_ = dl_[di];
        var s0s1 = [D_.s_de([aw[0], aw[1], D_.a[2]]), D_.s_de([bw[0], bw[1], D_.a[2]])];
        s0 = Math.min(s0s1[0], s0s1[1]); s1 = Math.max(s0s1[0], s0s1[1]);
        if (Math.abs(cross2(xy(D_.u), [aw[0] - D_.a[0], aw[1] - D_.a[1]])) > 0.05) { continue; }
        cargaLinha(D_, Math.max(s0, 0), Math.min(s1, D_.L), pyRound(pw.g_kN_m, 3), "CP", "-Z", "parede " + pw.painel + " (peso)");
      }
    }
    // vento nas paredes: Ca·q·h na fachada fechada projetada; onde n paredes se sobrepõem na projeção, cada uma leva 1/n
    var vi2, hv_, vec, perp, eixo, w, xs, nn, qw, Ml, fr, lstM, ix, o_, wi, oi, c0, c1;
    for (vi2 = 0; vi2 < VENTOS.length; vi2++) {
      hv_ = VENTOS[vi2][0]; vec = VENTOS[vi2][1];
      perp = [];
      for (wi = 0; wi < CALC.paredes.length; wi++) {
        w = CALC.paredes[wi];
        var dwx = w.b[0] - w.a[0], dwy = w.b[1] - w.a[1], nw = Math.sqrt(dwx * dwx + dwy * dwy);
        if (Math.abs((dwx / nw) * vec[0] + (dwy / nw) * vec[1]) < 0.1) { perp.push(w); }
      }
      eixo = Math.abs(vec[0]) > 0 ? 1 : 0;                         // coordenada da projeção
      for (wi = 0; wi < perp.length; wi++) {
        w = perp[wi];
        lo = Math.min(w.a[eixo], w.b[eixo]); hi = Math.max(w.a[eixo], w.b[eixo]);
        xs = npLinspace(lo, hi, 21);
        nn = [];
        for (ix = 0; ix < xs.length; ix++) {
          c0 = 0;
          for (oi = 0; oi < perp.length; oi++) {
            o_ = perp[oi];
            if (Math.min(o_.a[eixo], o_.b[eixo]) - 1e-3 <= xs[ix] && xs[ix] <= Math.max(o_.a[eixo], o_.b[eixo]) + 1e-3) { c0++; }
          }
          nn.push(c0);
        }
        qw = CA_PAREDE * Q_VENTO * H_PAREDE * npMedia(nn.map(function (nv) { return 1.0 / nv; }));
        k = w.painel.slice(3);
        lstM = [];
        var dl2 = dorm[k] || [], gl2 = guia[k] || [];
        for (di = 0; di < dl2.length; di++) { lstM.push([dl2[di], 0.5]); }
        for (gi = 0; gi < gl2.length; gi++) { lstM.push([gl2[gi], 0.5]); }
        for (ix = 0; ix < lstM.length; ix++) {
          Ml = lstM[ix][0]; fr = lstM[ix][1];
          if (Math.abs(cross2(xy(Ml.u), [w.a[0] - Ml.a[0], w.a[1] - Ml.a[1]])) > 0.06) { continue; }
          var sw = [Ml.s_de([w.a[0], w.a[1], Ml.a[2]]), Ml.s_de([w.b[0], w.b[1], Ml.a[2]])];
          s0 = Math.max(Math.min(sw[0], sw[1]), 0); s1 = Math.min(Math.max(sw[0], sw[1]), Ml.L);
          if (s1 - s0 > 0.05) {
            var divg = (Ml.fam === "GUIA" && gl2.length > 1 && fr) ? gl2.length : 1;
            cargaLinha(Ml, s0, s1, pyRound(qw * fr / divg, 3), hv_, dirTxt(vec), "vento na parede " + w.painel);
          }
        }
      }
    }
    // 5c. cobertura superior: longarinas (paralelas ao comprimento, X) por faixa de influência em Y
    var sup = horiz.filter(function (m_) { return m_.grupo === "COB_SUP_VIGA"; });
    var long_ = sup.filter(function (m_) { return Math.abs(m_.u[0]) > 0.9; });
    var transv = sup.filter(function (m_) { return Math.abs(m_.u[1]) > 0.9; });
    var ysSet = {}, ys = [];
    for (i = 0; i < long_.length; i++) {
      var yy = pyRound((long_[i].a[1] + long_[i].b[1]) / 2, 2);
      if (!ysSet[yy]) { ysSet[yy] = true; ys.push(yy); }
    }
    ys = ordNum(ys);
    var y_lo = minimo(sup.map(function (m_) { return Math.min(m_.a[1], m_.b[1]) - m_.hw; }));
    var y_hi = maximo(sup.map(function (m_) { return Math.max(m_.a[1], m_.b[1]) + m_.hw; }));
    var x_lo = minimo(sup.map(function (m_) { return Math.min(m_.a[0], m_.b[0]) - m_.hw; }));
    var x_hi = maximo(sup.map(function (m_) { return Math.max(m_.a[0], m_.b[0]) + m_.hw; }));
    var trib = {}, y0, y1;
    for (k = 0; k < ys.length; k++) {
      y0 = k === 0 ? y_lo : (ys[k - 1] + ys[k]) / 2;
      y1 = k === ys.length - 1 ? y_hi : (ys[k + 1] + ys[k]) / 2;
      trib[ys[k]] = y1 - y0;
    }
    var area_cob = (x_hi - x_lo) * (y_hi - y_lo);
    var cobHip = [["CP", G_COB], ["SCcob", SC_COB]], t_;
    for (i = 0; i < long_.length; i++) {
      M = long_[i];
      t_ = trib[pyRound((M.a[1] + M.b[1]) / 2, 2)];
      // a longarina da ponta cobre até a borda em X
      for (j = 0; j < cobHip.length; j++) {
        cargaLinha(M, 0, M.L, pyRound(cobHip[j][1] * t_, 3), cobHip[j][0], "-Z", "cobertura superior (" + cobHip[j][0] + "), faixa " + pyFixed(t_, 2) + " m");
      }
      for (vi2 = 0; vi2 < VENTOS.length; vi2++) {
        cargaLinha(M, 0, M.L, pyRound(1.0 * Q_VENTO * t_, 3), VENTOS[vi2][0], "+Z", "sucção na cobertura, faixa " + pyFixed(t_, 2) + " m");
      }
    }
    // borda da cobertura e pilares (vento lateral)
    var alvo_, borda;
    for (vi2 = 0; vi2 < VENTOS.length; vi2++) {
      hv_ = VENTOS[vi2][0]; vec = VENTOS[vi2][1];
      if (Math.abs(vec[1]) > 0) {                        // vento em Y: longarina de borda do lado de barlavento
        alvo_ = long_[0];
        for (i = 1; i < long_.length; i++) { if (vec[1] > 0 ? long_[i].a[1] < alvo_.a[1] : long_[i].a[1] > alvo_.a[1]) { alvo_ = long_[i]; } }
        borda = long_.filter(function (m_) { return Math.abs(m_.a[1] - alvo_.a[1]) < 0.02; });
      } else {
        alvo_ = transv[0];
        for (i = 1; i < transv.length; i++) { if (vec[0] > 0 ? transv[i].a[0] < alvo_.a[0] : transv[i].a[0] > alvo_.a[0]) { alvo_ = transv[i]; } }
        borda = transv.filter(function (m_) { return Math.abs(m_.a[0] - alvo_.a[0]) < 0.02; });
      }
      for (i = 0; i < borda.length; i++) { cargaLinha(borda[i], 0, borda[i].L, VENTO_BORDA, hv_, dirTxt(vec), "vento na borda da cobertura"); }
      for (i = 0; i < pilares.length; i++) {     // etiqueta PILAR inteira (o motor seleciona por janela): pilar todo, a favor
        cargaLinha(pilares[i], 0.0, pilares[i].L, VENTO_PILAR, hv_, dirTxt(vec), "vento no pilar (pilar inteiro)");
      }
    }
    // 5d. cobertura interna dos blocos: nas vigas do forro (paralelas a Y), faixa de influência em X, total conservado
    var forro = horiz.filter(function (m_) { return m_.fam === "FORRO" && Math.abs(m_.u[1]) > 0.9; });
    var pesoForro = 0;
    for (i = 0; i < fonte.pecas.length; i++) { if (fonte.pecas[i].grupo === "FORRO_BARROTE") { pesoForro += (fonte.pecas[i].massa_kg || 0); } }
    pesoForro = pesoForro * 9.80665e-3;
    var alvoCi = G_COB_INTERNA - pesoForro;
    var tf = {}, viz, o2;
    for (i = 0; i < forro.length; i++) {
      M = forro[i];
      viz = [];
      for (j = 0; j < forro.length; j++) {
        o2 = forro[j];
        if (o2 !== M && Math.abs(o2.a[0] - M.a[0]) > 0.05 &&
            Math.min(o2.a[1], o2.b[1]) < Math.max(M.a[1], M.b[1]) && Math.max(o2.a[1], o2.b[1]) > Math.min(M.a[1], M.b[1])) {
          viz.push(Math.abs(o2.a[0] - M.a[0]));
        }
      }
      viz = ordNum(viz);
      tf[M.id] = viz.length ? Math.min(viz[0], 1.2) / 2 * 2 : 0.6;
    }
    var totCi = 0;
    for (i = 0; i < forro.length; i++) { totCi += tf[forro[i].id] * forro[i].L; }
    for (i = 0; i < forro.length; i++) {
      cargaLinha(forro[i], 0, forro[i].L, pyRound(alvoCi * tf[forro[i].id] / totCi, 3), "CP", "-Z", "cobertura interna do bloco (vidro + forro ripado)");
    }
    // 5e. bloqueadores do pilar (não modelados): peso total por metro de pilar, uniforme na etiqueta PILAR inteira (soma conservada)
    var pesoBloq = 0;
    for (i = 0; i < fonte.pecas.length; i++) { if (fonte.pecas[i].grupo === "PILAR_BLOQ") { pesoBloq += (fonte.pecas[i].massa_kg || 0); } }
    pesoBloq = pesoBloq * 9.80665e-3;
    var Lpil = 0;
    for (i = 0; i < pilares.length; i++) { Lpil += pilares[i].L; }
    var qBloq = ceil(pesoBloq / Lpil * 1000) / 1000.0;
    for (i = 0; i < pilares.length; i++) {
      cargaLinha(pilares[i], 0.0, pilares[i].L, qBloq, "CP", "-Z", "bloqueadores do pilar (" + pyFixed(pesoBloq, 2) + " kN no total)");
    }
    // agrupa: mesma operação (tipo, hip, dir, valor, a, b) em várias barras = uma operação só
    var grp = {}, ordemGrp = [], o, key, copia;
    function aNone(x) { return x === undefined ? "None" : String(x); }
    for (i = 0; i < ops.length; i++) {
      o = ops[i];
      key = [o.tipo, o.hip, o.dir, aNone(o.q), aNone(o.F), aNone(o.a), aNone(o.b)].join("|");
      if (grp[key]) {
        grp[key].barras = grp[key].barras.concat(o.barras);
      } else {
        copia = {};
        for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { copia[k] = o[k]; } }
        copia.barras = o.barras.slice();
        grp[key] = copia; ordemGrp.push(key);
      }
    }
    var opsFinal = [], fim = [], porG, ordG, g_, bsg, gk, oo;
    function comGrupo(ob, g, bsx) {
      var r = {}, kk;
      for (kk in ob) { if (Object.prototype.hasOwnProperty.call(ob, kk)) { r[kk] = ob[kk]; } }
      r.grupo = g; r.barras = bsx;
      return r;
    }
    for (i = 0; i < ordemGrp.length; i++) {
      oo = grp[ordemGrp[i]];
      porG = {}; ordG = [];
      for (j = 0; j < oo.barras.length; j++) {            // o motor seleciona por ETIQUETA: uma operação por etiqueta
        gk = barras[oo.barras[j] - 1].grupo;
        if (!porG[gk]) { porG[gk] = []; ordG.push(gk); }
        porG[gk].push(oo.barras[j]);
      }
      for (j = 0; j < ordG.length; j++) {
        g_ = ordG[j]; bsg = porG[g_];
        if (g_.indexOf("COBINF") === 0 && ordG.length > 1) { fim.push(comGrupo(oo, g_, bsg)); }   // parte COBINF vai para o FIM: a numeração das outras não muda
        else { opsFinal.push(comGrupo(oo, g_, bsg)); }
      }
    }
    ops = opsFinal.concat(fim);

    /* ---------------------------------------------- 6. saída */
    var lam = [], pl, baixoN, cimaN;
    for (i = 0; i < placas.length; i++) {
      pl = placas[i];
      D_ = pl.dormente; G = pl.guia; a_ = pl.trecho[0]; b_ = pl.trecho[1];
      baixoN = []; cimaN = [];
      for (j = 0; j < D_.nos_s.length; j++) { if (a_ - TOL_NO <= D_.nos_s[j] && D_.nos_s[j] <= b_ + TOL_NO) { baixoN.push(D_.nos[j]); } }
      var gg = [G.s_de(D_.P(a_)), G.s_de(D_.P(b_))];
      ga = Math.min(gg[0], gg[1]); gb = Math.max(gg[0], gg[1]);
      for (j = 0; j < G.nos_s.length; j++) { if (ga - TOL_NO <= G.nos_s[j] && G.nos_s[j] <= gb + TOL_NO) { cimaN.push(G.nos[j]); } }
      if (dot(G.u, D_.u) > 0) { cimaN.reverse(); }
      pl.vertices = baixoN.concat(cimaN);
      lam.push([i + 1].concat(pl.vertices));
    }
    // nós sem barra (sobras das uniões) saem; numeração compacta
    var usSet = {}, usados = [];
    function usa(nv) { if (!usSet[nv]) { usSet[nv] = true; usados.push(nv); } }
    for (i = 0; i < barras.length; i++) { usa(barras[i].i); }
    for (i = 0; i < barras.length; i++) { usa(barras[i].j); }
    for (i = 0; i < lam.length; i++) { for (j = 1; j < lam[i].length; j++) { usa(lam[i][j]); } }
    usados = ordNum(usados);
    var novo = {}, outNos = [], nosN = [];
    for (i = 0; i < usados.length; i++) { novo[usados[i]] = i + 1; }
    for (i = 0; i < usados.length; i++) {
      outNos.push({ id: i + 1, x: nos[usados[i] - 1][0], y: nos[usados[i] - 1][1], z: nos[usados[i] - 1][2] });
      nosN.push(nos[usados[i] - 1]);
    }
    nos = nosN;
    for (i = 0; i < barras.length; i++) { barras[i].i = novo[barras[i].i]; barras[i].j = novo[barras[i].j]; }
    lam = lam.map(function (lx) { return [lx[0]].concat(lx.slice(1).map(function (nv) { return novo[nv]; })); });
    for (i = 0; i < placas.length; i++) { placas[i].vertices = lam[i].slice(1); }
    var apNos = [];
    for (k in apoioNos) { if (Object.prototype.hasOwnProperty.call(apoioNos, k)) { apNos.push([novo[parseInt(k, 10)], apoioNos[k]]); } }
    apNos.sort(function (x, y) { return x[0] - y[0]; });

    var mod = {
      sistema: Q.sistema, fonte: Q.fonte, z_apoios: Z_APOIO, nos: outNos, barras: barras,
      apoios: apNos.map(function (x) { return { no: x[0], pilarete: x[1] }; }),
      etiquetas: ETIQS, secoes: secoes, avisos: avisos, regras: MadModelo.REGRAS
    };
    var placasOut = placas.map(function (pl2) {
      var r = {}, kk;
      for (kk in pl2) {
        if (Object.prototype.hasOwnProperty.call(pl2, kk) && kk !== "dormente" && kk !== "guia") { r[kk] = pl2[kk]; }
      }
      r.dormente = pl2.dormente.id; r.guia = pl2.guia.id;
      return r;
    });
    var balOut = {};
    for (k in balanco) { if (Object.prototype.hasOwnProperty.call(balanco, k)) { balOut[k] = pyRound(balanco[k], 2); } }
    var hipOut = {};
    for (k in HIP) { if (Object.prototype.hasOwnProperty.call(HIP, k)) { hipOut[String(HIP[k])] = k; } }

    // arquivos de importação do CYPE 3D (NUDOS + BARRAS por etiqueta; NUDOS + LAMINAS para as placas)
    var textos = {}, pref = O.prefixoArquivo, lines, bsE, nsE, ns2, nid, coord;
    function linhaNo(nid_) {
      var cc = nos[nid_ - 1];
      return nid_ + " X=" + pyFixed(cc[0], 4) + " Y=" + pyFixed(cc[1], 4) + " Z=" + pyFixed(cc[2], 4);
    }
    for (i = 0; i < ETIQS.length; i++) {
      e = ETIQS[i];
      bsE = barras.filter(function (bx) { return bx.grupo === e; });
      nsE = {}; ns2 = [];
      bsE.forEach(function (bx) { nsE[bx.i] = true; nsE[bx.j] = true; });
      for (nid in nsE) { if (Object.prototype.hasOwnProperty.call(nsE, nid)) { ns2.push(parseInt(nid, 10)); } }
      ns2 = ordNum(ns2);
      lines = ["NUDOS"];
      for (j = 0; j < ns2.length; j++) { lines.push(linhaNo(ns2[j])); }
      lines.push("BARRAS");
      for (j = 0; j < bsE.length; j++) { lines.push(bsE[j].id + " " + bsE[j].i + " " + bsE[j].j); }
      textos[pref + e + ".txt"] = lines.join("\r\n") + "\r\n";
    }
    if (lam.length) {
      nsE = {}; ns2 = [];
      lam.forEach(function (lx) { lx.slice(1).forEach(function (nv) { nsE[nv] = true; }); });
      for (nid in nsE) { if (Object.prototype.hasOwnProperty.call(nsE, nid)) { ns2.push(parseInt(nid, 10)); } }
      ns2 = ordNum(ns2);
      lines = ["NUDOS"];
      for (j = 0; j < ns2.length; j++) { lines.push(linhaNo(ns2[j])); }
      lines.push("LAMINAS");
      for (j = 0; j < lam.length; j++) { lines.push(lam[j].join(" ")); }
      textos[pref + "PAINEL.txt"] = lines.join("\r\n") + "\r\n";
    }

    log.push("cargas: " + ops.length + " operações | balanço (kN): " + JSON.stringify(balOut));
    log.push("avisos (" + avisos.length + ")");
    return {
      modelo: mod, placas: placasOut, ops: ops, balanco: balOut, hipoteses: hipOut, textosCype: textos, log: log,
      resumo: { nos: outNos.length, barras: barras.length, etiquetas: ETIQS.length, placas: placasOut.length, ops: ops.length,
        avisos: avisos.length, areaCoberturaM2: area_cob }
    };
  };

  /** recorta o segmento (x0,y0)-(x1,y1) pela caixa [bx0,bx1]×[by0,by1] (Liang-Barsky); devolve o comprimento
   *  e o ponto médio do trecho dentro (como LineString.intersection(box).interpolate(0.5, normalized=True)) */
  function clipSegmentoCaixa(x0, y0, x1, y1, bx0, by0, bx1, by1) {
    var dx = x1 - x0, dy = y1 - y0, t0 = 0.0, t1 = 1.0;
    var ps = [-dx, dx, -dy, dy], qs = [x0 - bx0, bx1 - x0, y0 - by0, by1 - y0], i, r;
    for (i = 0; i < 4; i++) {
      if (ps[i] === 0) {
        if (qs[i] < 0) { return null; }
      } else {
        r = qs[i] / ps[i];
        if (ps[i] < 0) { if (r > t1) { return null; } if (r > t0) { t0 = r; } }
        else { if (r < t0) { return null; } if (r < t1) { t1 = r; } }
      }
    }
    if (t1 < t0) { return null; }
    var ax = x0 + dx * t0, ay = y0 + dy * t0, cx = x0 + dx * t1, cy = y0 + dy * t1;
    return { comprimento: Math.sqrt((cx - ax) * (cx - ax) + (cy - ay) * (cy - ay)), mx: (ax + cx) / 2, my: (ay + cy) / 2 };
  }

  MadModelo._util = { pyRound: pyRound, pyFixed: pyFixed, pyG: pyG, pyFloorDiv: pyFloorDiv, npSoma: npSoma, npLinspace: npLinspace };

  if (typeof module !== "undefined" && module.exports) { module.exports = MadModelo; }
  global.MadModelo = MadModelo;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

/* =====================================================================
 * icarfisica.js — A FÍSICA DO IÇAMENTO: o "nunca visto num içamento".
 * Motor PURO (ES5, testável em Node). Especificação: ESPEC-ICAMENTO-CENARIO.md, §C e §II.4.
 *
 * O que calcula, componente por componente, com a UTILIZAÇÃO de trabalho e (quando existe) a de RUPTURA:
 *   tabela do equipamento · reação em cada patola · solo/pranchão sob cada sapata · escoras · tombamento ·
 *   cabo do guincho · moitão · cada perna da linga · manilhas · a peça içada.
 * E o "além do limite": com a carga multiplicada por k, em que k cada componente passa do limite de trabalho e
 * em que k ele rompe / descola / tomba — o RANKING DE FALHA.
 *
 * ⚠ NÃO INVENTA NÚMERO. Tudo o que falta (massa da superestrutura, raio do contrapeso, força máxima da patola, tração
 *   do cabo, σ adm do solo, f_y do aço…) deixa o componente CINZA e diz o que falta. A tabela do fabricante continua
 *   sendo o critério de aceite: a margem de estabilidade daqui é INFORMAÇÃO, não substitui a tabela (ver §II.4.2).
 * ⚠ CONVENÇÃO: forças verticais em kN, positivas para BAIXO. Referencial do equipamento: u ao longo do chassi (+u =
 *   para a cabine, "dianteira"), v transversal (+v = esquerda de quem olha para a frente). ORIGEM no centro do
 *   retângulo das patolas. Patolas na ordem DE, DD, TE, TD (dianteira/traseira, esquerda/direita).
 * ⚠ As FAIXAS de cor são premissa do plano (editáveis), não norma: o padrão é o da especificação (§II.4.6).
 * ===================================================================== */
(function (global) {
  "use strict";

  var G = 9.80665;
  /* faixas da utilização de TRABALHO; acima de 1 = vermelho; utilização de RUPTURA ≥ 1 = ruptura (pulsa) */
  var FAIXAS_PADRAO = { atencao: 0.5, critico: 0.8 };
  var CORES = {
    cinza: { cor: "#9ca3af", rotulo: "sem dado" },
    verde: { cor: "#16a34a", rotulo: "ok" },
    amarelo: { cor: "#eab308", rotulo: "atenção" },
    laranja: { cor: "#f97316", rotulo: "crítico" },
    vermelho: { cor: "#dc2626", rotulo: "acima do limite de trabalho" },
    ruptura: { cor: "#dc2626", rotulo: "ruptura", pulsa: true }
  };
  var NOMES_PATOLA = ["dianteira esquerda", "dianteira direita", "traseira esquerda", "traseira direita"];
  var SIGLAS_PATOLA = ["DE", "DD", "TE", "TD"];
  /* FS de ruptura dos acessórios (os mesmos do icarplano.js, com a fonte lá) */
  var FS_RUPTURA = { cabo: 5, cinta: 7, corrente: 4, manilha: 6 };

  function num(v) { var n = +v; return v !== null && v !== "" && v !== undefined && isFinite(n) ? n : null; }
  function juntar(l) { return l.filter(Boolean).join("; "); }
  function r(v, c) { if (v == null || !isFinite(v)) return v; var f = Math.pow(10, c == null ? 2 : c); return Math.round(v * f) / f; }

  /* ======================= utilização e cor ======================= */
  function faixa(uTrab, uRup, faixas) {
    var f = faixas || FAIXAS_PADRAO;
    var k;
    if (uRup != null && uRup >= 1 - 1e-12) k = "ruptura";
    else if (uTrab == null) k = "cinza";
    else if (uTrab > 1 + 1e-12) k = "vermelho";
    else if (uTrab >= f.critico) k = "laranja";
    else if (uTrab >= f.atencao) k = "amarelo";
    else k = "verde";
    return { chave: k, cor: CORES[k].cor, rotulo: CORES[k].rotulo, pulsa: !!CORES[k].pulsa };
  }
  /* esforço × limite de trabalho × limite de ruptura → utilizações + faixa (limite ausente = null, nunca 0) */
  function utilizacao(esforco, limTrab, limRup, faixas) {
    var e = num(esforco), lt = num(limTrab), lr = num(limRup);
    var o = { esforco: e, limTrab: lt > 0 ? lt : null, limRup: lr > 0 ? lr : null, uTrab: null, uRup: null };
    if (e != null && o.limTrab) o.uTrab = e / o.limTrab;
    if (e != null && o.limRup) o.uRup = e / o.limRup;
    o.faixa = faixa(o.uTrab, o.uRup, faixas);
    return o;
  }

  /* ======================= reações nas patolas (§II.4.2) ======================= */
  /* forcas: [{ nome, P (kN, +baixo), u, v }]; apoios: { a (base longitudinal), b (transversal) } — retângulo centrado na origem.
     Distribuição linear (chassi rígido, apoios de mesma rigidez): R_k = V/4 + Mv·u_k/a² + Mu·v_k/b². */
  function posApoios(a, b) { return [{ u: a / 2, v: b / 2 }, { u: a / 2, v: -b / 2 }, { u: -a / 2, v: b / 2 }, { u: -a / 2, v: -b / 2 }]; }
  function resolver3(ap, V, Mv, Mu) {
    /* 3 apoios: ΣR = V, ΣR·u = Mv, ΣR·v = Mu (sistema 3×3, Cramer) */
    var A = [[1, 1, 1], [ap[0].u, ap[1].u, ap[2].u], [ap[0].v, ap[1].v, ap[2].v]], B = [V, Mv, Mu];
    function det(m) { return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]); }
    var D = det(A); if (Math.abs(D) < 1e-12) return null;
    return [0, 1, 2].map(function (c) { var m = A.map(function (l, i) { var x = l.slice(); x[c] = B[i]; return x; }); return det(m) / D; });
  }
  function reacoes(forcas, apoios) {
    var a = num(apoios && apoios.a), b = num(apoios && apoios.b);
    var o = { ok: false, R: [null, null, null, null], descola: [], tomba: false, faltas: [] };
    if (!(a > 0) || !(b > 0)) { o.faltas.push("base das patolas (longitudinal × transversal)"); return o; }
    var V = 0, Mv = 0, Mu = 0;
    (forcas || []).forEach(function (f) {
      var P = num(f && f.P), u = num(f && f.u), v = num(f && f.v);
      if (P == null || u == null || v == null) { o.faltas.push((f && f.falta) || ("posição/peso: " + ((f && f.nome) || "?"))); return; }
      V += P; Mv += P * u; Mu += P * v;
    });
    if (o.faltas.length) return o;
    if (!(V > 0)) { o.faltas.push("nenhuma força vertical"); return o; }
    var ap = posApoios(a, b);
    o.V = V; o.Mv = Mv; o.Mu = Mu; o.a = a; o.b = b;
    o.resultante = { u: Mv / V, v: Mu / V };
    o.R = ap.map(function (p) { return V / 4 + Mv * p.u / (a * a) + Mu * p.v / (b * b); });
    o.apoiosAtivos = [0, 1, 2, 3];
    /* tombamento: a resultante fora do polígono de apoio (o retângulo) */
    o.margem_m = Math.min(a / 2 - Math.abs(o.resultante.u), b / 2 - Math.abs(o.resultante.v));
    o.tomba = o.margem_m < -1e-9;
    /* a linha de tombamento mais próxima e Me/Mt em torno dela */
    var dU = a / 2 - Math.abs(o.resultante.u), dV = b / 2 - Math.abs(o.resultante.v), eixo, sinal;
    if (dU <= dV) { eixo = "u"; sinal = o.resultante.u >= 0 ? 1 : -1; } else { eixo = "v"; sinal = o.resultante.v >= 0 ? 1 : -1; }
    var borda = (eixo === "u" ? a : b) / 2 * sinal, Me = 0, Mt = 0;
    (forcas || []).forEach(function (f) { var x = +f[eixo], d = (borda - x) * sinal; if (d >= 0) Me += f.P * d; else Mt += f.P * -d; });
    o.linha = { eixo: eixo, valor: borda, rotulo: eixo === "u" ? (sinal > 0 ? "dianteira" : "traseira") : (sinal > 0 ? "esquerda" : "direita") };
    o.Me = Me; o.Mt = Mt; o.MeMt = Mt > 1e-9 ? Me / Mt : null;
    /* tombando: o equipamento gira sobre a linha de tombamento — as patolas DELA levam tudo (V/2 cada, o limite) e as do
       lado oposto descolam. ⚠ Com momento num eixo só, as duas do lado oposto chegam a zero JUNTAS, exatamente quando a
       resultante alcança a linha (R = V/4 − M/(2a) = 0 ⇔ M/V = a/2): "descolar" e "tombar" são o mesmo instante. */
    function naLinha(k) { var p = ap[k]; return eixo === "u" ? p.u * sinal > 0 : p.v * sinal > 0; }
    if (o.tomba) { o.R = [0, 1, 2, 3].map(function (k) { return naLinha(k) ? V / 2 : 0; }); o.ok = true; o.descola = [0, 1, 2, 3].filter(function (k) { return !naLinha(k); }); return o; }
    /* patola que descola (R < 0): refaz com 3 apoios — a mais negativa sai */
    var menor = 0; for (var k = 1; k < 4; k++) if (o.R[k] < o.R[menor]) menor = k;
    if (o.R[menor] < -1e-9) {
      var ativos = [0, 1, 2, 3].filter(function (x) { return x !== menor; });
      var R3 = resolver3(ativos.map(function (x) { return ap[x]; }), V, Mv, Mu);
      o.descola = [menor];
      var R = [0, 0, 0, 0]; ativos.forEach(function (x, i) { R[x] = R3 ? R3[i] : null; });
      o.R4 = o.R; o.R = R; o.apoiosAtivos = ativos;
      /* com 3 apoios, outra reação negativa = só sobra a diagonal: a resultante fora do triângulo → tomba */
      if (R3 && R3.some(function (x) { return x < -1e-9; })) { o.tomba = true; o.R = [0, 1, 2, 3].map(function (k) { return naLinha(k) ? V / 2 : 0; }); o.descola = [0, 1, 2, 3].filter(function (k) { return !naLinha(k); }); }
    }
    o.ok = true;
    return o;
  }

  /* ======================= solo, pranchão, escoras (§II.4.3) ======================= */
  function pressao(R_kN, area_m2) { var R = num(R_kN), A = num(area_m2); return R != null && A > 0 ? R / A : null; }
  /* A_min = R / σ adm → lado arredondado para cima ao múltiplo de 0,1 m */
  function pranchaoMin(R_kN, sigma_kPa) {
    var R = num(R_kN), s = num(sigma_kPa); if (R == null || !(s > 0)) return null;
    var A = R / s, lado = Math.ceil(Math.sqrt(A) * 10 - 1e-9) / 10;
    return { area_m2: A, lado_m: lado };
  }

  /* ======================= cabo e moitão (§II.4.4) ======================= */
  function cabo(Q_kN, nPernas, TmaxPerna_kN, ruptura_kN, eta) {
    var Q = num(Q_kN), n = num(nPernas), e = num(eta) || 1;
    var o = { Q: Q, n: n, eta: e, T: null, faltas: [] };
    if (!(n >= 1)) { o.faltas.push("número de pernas do moitão"); o.u = utilizacao(null, null, null); return o; }
    o.T = Q != null ? Q / n / e : null;
    if (!(num(TmaxPerna_kN) > 0)) o.faltas.push("tração máxima por perna do cabo (ficha)");
    if (!(num(ruptura_kN) > 0)) o.faltas.push("carga de ruptura mínima do cabo (certificado)");
    o.u = utilizacao(o.T, TmaxPerna_kN, ruptura_kN);
    o.nMin = num(TmaxPerna_kN) > 0 && Q != null ? Math.ceil(Q / TmaxPerna_kN - 1e-9) : null;
    return o;
  }

  /* ======================= a peça içada (§II.4.5) ======================= */
  /* perfil I: h (altura), b (largura da mesa), tw (alma), tf (mesa) — em metros → I (m⁴) e W (m³) pela geometria */
  function pecaI(perfil) {
    var h = num(perfil && perfil.h), b = num(perfil && perfil.b), tw = num(perfil && perfil.tw), tf = num(perfil && perfil.tf);
    if (!(h > 0 && b > 0 && tw > 0 && tf > 0) || 2 * tf >= h) return null;
    var hw = h - 2 * tf, I = (b * h * h * h - (b - tw) * hw * hw * hw) / 12;
    return { I: I, W: I / (h / 2) };
  }
  /* momento máximo: 2 pontos a 0,207·L (apoio = meio do vão) ou 1 ponto no meio, carga distribuída q = P/L */
  function momentoPeca(P_kN, L_m, pontos) {
    var P = num(P_kN), L = num(L_m); if (P == null || !(L > 0)) return null;
    var q = P / L;
    return pontos === 1 ? q * L * L / 8 : 0.0214 * q * L * L;
  }

  /* ======================= as forças do equipamento a partir da ficha ======================= */
  /* f = ficha montada (IcarFicha.montar): números com fonte ou null. estado = { theta (rad, 0 = lança para a dianteira), R (raio do
     gancho a partir do eixo de giro, m), Q_kN (carga suspensa total), contrapeso_t (configuração) }.
     Origem = centro do retângulo das patolas; o eixo de giro em (giroU, 0). */
  function forcasGuindaste(f, est) {
    f = f || {}; est = est || {};
    var th = +est.theta || 0, cs = Math.cos(th), sn = Math.sin(th), gU = num(f.giroU), out = [];
    function ponto(raio) { return gU == null || raio == null ? { u: null, v: null } : { u: gU + raio * cs, v: raio * sn }; }
    function kN(t) { return t == null ? null : t * 1000 * G / 1000; }
    /* chassi (o que não gira) */
    out.push({ nome: "chassi", P: kN(f.chassiMassa_t), u: num(f.chassiCgU), v: num(f.chassiCgU) == null ? null : 0, falta: "massa e CG do chassi (o que não gira)" });
    /* superestrutura (gira) */
    var ps = ponto(num(f.superCgR));
    out.push({ nome: "superestrutura", P: kN(f.superMassa_t), u: ps.u, v: ps.v, falta: "massa e CG da superestrutura (giro, cabine, guincho)" });
    /* contrapeso: OPOSTO à lança */
    var cpR = num(f.contrapesoRaio), cp = ponto(cpR == null ? null : -cpR);
    var cpT = est.contrapeso_t != null ? num(est.contrapeso_t) : num(f.contrapeso_t);
    out.push({ nome: "contrapeso", P: kN(cpT), u: cp.u, v: cp.v, falta: "massa e raio do contrapeso" });
    /* lança: CG em fração do alcance horizontal até a ponta */
    var Lcg = num(f.lancaCgR);
    var pl = ponto(Lcg);
    out.push({ nome: "lança", P: kN(f.lancaMassa_t), u: pl.u, v: pl.v, falta: "massa e CG da lança" });
    /* a carga no raio */
    var pq = ponto(num(est.R));
    out.push({ nome: "carga", P: num(est.Q_kN), u: pq.u, v: pq.v, falta: "carga e raio" });
    return out;
  }
  /* munck: o caminhão (tara do CRLV) + o guindaste articulado + a carga */
  function forcasMunck(f, est) {
    f = f || {}; est = est || {};
    var th = +est.theta || 0, cs = Math.cos(th), sn = Math.sin(th), gU = num(f.giroU), out = [];
    function kN(kg) { return kg == null ? null : kg * G / 1000; }
    out.push({ nome: "caminhão (tara)", P: kN(f.taraCaminhao_kg), u: num(f.caminhaoCgU), v: num(f.caminhaoCgU) == null ? null : 0, falta: "tara e CG do caminhão (CRLV / ficha do veículo)" });
    out.push({ nome: "guindaste articulado", P: kN(f.guindasteMassa_kg), u: gU, v: gU == null ? null : 0, falta: "posição do guindaste no chassi" });
    out.push({ nome: "carga", P: num(est.Q_kN), u: gU == null || est.R == null ? null : gU + est.R * cs, v: gU == null || est.R == null ? null : est.R * sn, falta: "carga e raio" });
    return out;
  }

  /* ======================= os componentes (a tabela da aba "Física") ======================= */
  /* entrada = {
       ficha,                       — IcarFicha.montar(...) (números com fonte ou null)
       theta, R, Q_kN,              — estado do içamento
       tabela: { carga_kg, cap_kg },— do icarplano.avaliar (já com contingência, acessórios, moitão)
       solo: { sigmaAdm_kPa, fonte }, pranchao: { lado_m }, sapataLado_m,
       escoras: [{ capacidade_kN, patola (0..3) }],
       cabo: { pernas, TmaxPerna_kN, ruptura_kN, eta },
       moitao: { capacidade_kN },
       lingas: [{ nome, T_kg, cmtEfetiva_kg, cmt_kg, tipo }], manilhas: [{ nome, T_kg, cmt_kg }],
       peca: { perfil, L_m, P_kN, pontos, fy_MPa, phi, concreto },
       coefTombamento,              — Me/Mt mínimo INFORMADO (manual/norma do fabricante); sem ele, só se mostra
       k                            — sobrecarga do "além do limite" (multiplica tudo o que vem da carga)
     } */
  function componentes(e) {
    e = e || {};
    var k = num(e.k) || 1, f = e.ficha || {}, out = [], faixas = e.faixas;
    var Q = num(e.Q_kN) != null ? e.Q_kN * k : null;
    function add(c) { c.u = utilizacao(c.esforco, c.limTrab, c.limRup, faixas); out.push(c); return c; }

    /* 1. tabela do equipamento */
    var tb = e.tabela || {};
    add({ id: "tabela", nome: "Tabela do equipamento", grandeza: "carga × capacidade no raio", unidade: "kg",
      esforco: num(tb.carga_kg) != null ? tb.carga_kg * k : null, limTrab: tb.cap_kg, limRup: null,
      falta: num(tb.cap_kg) > 0 ? "" : "capacidade da tabela no raio" });

    /* 2. reações nas patolas */
    var forcas = f.tipo === "munck" ? forcasMunck(f, { theta: e.theta, R: e.R, Q_kN: Q }) : forcasGuindaste(f, { theta: e.theta, R: e.R, Q_kN: Q, contrapeso_t: e.contrapeso_t });
    var rea = reacoes(forcas, { a: f.patolaA, b: f.patolaB });
    var fmax = num(f.forcaPatolaMax_kN);
    var faltaRea = rea.faltas.length ? rea.faltas.join("; ") : "";
    for (var i = 0; i < 4; i++) {
      var Rk = rea.ok ? rea.R[i] : null, desc = rea.ok && rea.descola.indexOf(i) >= 0;
      var c = add({ id: "patola-" + SIGLAS_PATOLA[i], nome: "Patola " + NOMES_PATOLA[i], grandeza: "reação", unidade: "kN", patola: i,
        esforco: Rk, limTrab: fmax, limRup: null, descola: desc, tomba: rea.tomba,
        falta: faltaRea || (fmax > 0 ? "" : "força máxima por patola (ficha)") });
      /* patola que descola é a "ruptura" do apoio */
      if (desc) { c.u.uRup = 1; c.u.faixa = faixa(c.u.uTrab, 1, faixas); }
      /* sapata em ÁREA PROIBIDA (fossa, galeria…): vermelho com o motivo, qualquer que seja a carga */
      var pr = (e.proibidas || []).filter(function (x) { return x.k === i; })[0];
      if (pr) { c.proibida = pr.motivo; c.u.faixa = { chave: "vermelho", cor: CORES.vermelho.cor, rotulo: "proibido apoiar: " + pr.motivo, pulsa: false }; }
    }

    /* 3. solo sob cada sapata (pranchão se houver) */
    var lado = num(e.pranchao && e.pranchao.lado_m) || num(e.sapataLado_m) || num(f.sapataLado_m), sig = num(e.solo && e.solo.sigmaAdm_kPa);
    for (var j = 0; j < 4; j++) {
      var Rj = rea.ok ? rea.R[j] : null, p = Rj != null && lado > 0 ? pressao(Rj, lado * lado) : null;
      add({ id: "solo-" + SIGLAS_PATOLA[j], nome: "Solo sob a " + SIGLAS_PATOLA[j] + (num(e.pranchao && e.pranchao.lado_m) ? " (pranchão " + String(e.pranchao.lado_m).replace(".", ",") + " m)" : ""),
        grandeza: "pressão", unidade: "kPa", patola: j, esforco: p, limTrab: sig, limRup: null,
        pranchaoSugerido: Rj != null && sig > 0 ? pranchaoMin(Rj, sig) : null,
        falta: faltaRea || juntar([lado > 0 ? "" : "lado da sapata ou do pranchão", sig > 0 ? "" : "σ adm do solo (laudo/sondagem)"]) });
    }

    /* 3b. solo pelo PIOR CASO DO FABRICANTE: Fmax (a maior força que UMA patola descarrega no chão, publicada) ÷ área.
       ⚠ Não depende das massas que o fabricante NÃO publica — é a conta de pranchão que se faz sem o cálculo detalhado, e
       por isso existe mesmo quando as reações acima estão cinza. Fmax não cresce com a sobrecarga k (é o máximo DENTRO da
       tabela): passar da tabela já aparece na linha da tabela. */
    if (fmax > 0) {
      var pMx = lado > 0 ? pressao(fmax, lado * lado) : null;
      add({ id: "solo-fmax", nome: "Solo — pior caso do fabricante (Fmax " + r(fmax, 0) + " kN" + (lado > 0 ? " em " + String(r(lado, 2)).replace(".", ",") + " × " + String(r(lado, 2)).replace(".", ",") + " m" : "") + ")",
        grandeza: "pressão", unidade: "kPa", esforco: pMx, limTrab: sig, limRup: null, fmax: fmax,
        pranchaoSugerido: sig > 0 ? pranchaoMin(fmax, sig) : null,
        falta: juntar([lado > 0 ? "" : "lado da sapata ou do pranchão", sig > 0 ? "" : "σ adm do solo (laudo/sondagem)"]) });
    }

    /* 4. escoras (v1: dividem a reação da patola igualmente) */
    (e.escoras || []).forEach(function (es, n) {
      var pt = num(es && es.patola), mesmas = (e.escoras || []).filter(function (x) { return num(x && x.patola) === pt; }).length;
      var Rz = rea.ok && pt != null ? rea.R[pt] : null;
      add({ id: "escora-" + (n + 1), nome: "Escora " + (n + 1) + " (sob a " + (pt != null ? SIGLAS_PATOLA[pt] : "?") + ")", grandeza: "carga", unidade: "kN", patola: pt,
        esforco: Rz != null && mesmas ? Rz / mesmas : null, limTrab: es && es.capacidade_kN, limRup: null,
        falta: faltaRea || (num(es && es.capacidade_kN) > 0 ? "" : "capacidade da escora") });
    });

    /* 5. tombamento: Me/Mt contra o coeficiente INFORMADO; descolar todas = ruptura */
    var coef = num(e.coefTombamento);
    var tomb = add({ id: "tombamento", nome: "Estabilidade (tombamento)", grandeza: "Me/Mt", unidade: "",
      esforco: rea.ok && coef && rea.MeMt ? coef / rea.MeMt : null, limTrab: coef ? 1 : null, limRup: null,
      margem_m: rea.ok ? rea.margem_m : null, MeMt: rea.ok ? rea.MeMt : null, linha: rea.ok ? rea.linha : null, tomba: rea.tomba,
      falta: faltaRea || (coef ? "" : "coeficiente de estabilidade do fabricante (só se mostra a margem)") });
    if (rea.ok && rea.tomba) { tomb.u.uRup = 1; tomb.u.faixa = faixa(tomb.u.uTrab, 1, faixas); }

    /* 6. cabo do guincho */
    var cb = e.cabo || {}, cab = cabo(Q, cb.pernas, cb.TmaxPerna_kN, cb.ruptura_kN, cb.eta);
    var cC = add({ id: "cabo", nome: "Cabo do guincho" + (num(cb.pernas) ? " (" + cb.pernas + " pernas)" : ""), grandeza: "tração por perna", unidade: "kN",
      esforco: cab.T, limTrab: cb.TmaxPerna_kN, limRup: cb.ruptura_kN, nMin: cab.nMin, falta: cab.faltas.join("; ") });

    /* 7. moitão */
    add({ id: "moitao", nome: "Moitão / gancho", grandeza: "carga", unidade: "kN", esforco: Q, limTrab: e.moitao && e.moitao.capacidade_kN, limRup: null,
      falta: num(e.moitao && e.moitao.capacidade_kN) > 0 ? "" : "capacidade do moitão (placa)" });

    /* 8. lingas (cada perna) e manilhas */
    (e.lingas || []).forEach(function (lg, n) {
      var T = num(lg.T_kg) != null ? lg.T_kg * k : null, fs = FS_RUPTURA[lg.tipo] || null, cmt = num(lg.cmt_kg);
      add({ id: "linga-" + (n + 1), nome: lg.nome || ("Linga P" + (n + 1)), grandeza: "tração", unidade: "kg", esforco: T,
        limTrab: lg.cmtEfetiva_kg, limRup: cmt && fs ? cmt * fs : null, fs: fs, falta: cmt > 0 ? "" : "CMT da linga (etiqueta)" });
    });
    (e.manilhas || []).forEach(function (mn, n) {
      var T = num(mn.T_kg) != null ? mn.T_kg * k : null, cmt = num(mn.cmt_kg);
      add({ id: "manilha-" + (n + 1), nome: mn.nome || ("Manilha " + (n + 1)), grandeza: "tração", unidade: "kg", esforco: T,
        limTrab: cmt, limRup: cmt ? cmt * FS_RUPTURA.manilha : null, fs: FS_RUPTURA.manilha, falta: cmt > 0 ? "" : "CMT da manilha (marcação)" });
    });

    /* 9. a peça içada */
    if (e.peca) {
      var pc = e.peca, M = momentoPeca(num(pc.P_kN) != null ? pc.P_kN * k : null, pc.L_m, pc.pontos), phi = num(pc.phi) || 1;
      if (pc.concreto) add({ id: "peca", nome: "Peça (concreto)", grandeza: "momento", unidade: "kN·m", esforco: M == null ? null : M * phi, limTrab: null, limRup: null,
        aviso: "verificar armadura de içamento e resistência na idade do içamento", falta: "armadura de içamento (projeto da peça)" });
      else {
        var sec = pecaI(pc.perfil), sigma = M != null && sec ? M * phi / sec.W / 1000 : null; // kN·m / m³ = kPa → /1000 = MPa
        add({ id: "peca", nome: "Peça (aço)", grandeza: "tensão de flexão", unidade: "MPa", esforco: sigma, limTrab: pc.fy_MPa, limRup: null, W: sec ? sec.W : null, M: M,
          falta: juntar([sec ? "" : "perfil da peça (IFC)", num(pc.fy_MPa) > 0 ? "" : "f_y do aço (norma do material ou informado) — compare com o limite do aço"]) });
      }
    }
    return { componentes: out, reacoes: rea, forcas: forcas, cabo: cab, k: k };
  }

  /* ======================= "além do limite" (§II.4.8) ======================= */
  /* para cada componente, o k em que u_trab = 1 e o k em que u_rup = 1 (patola: R = 0; conjunto: tomba).
     Bisseção em [1, kMax] — as utilizações crescem com k. Fora da faixa → null ("acima de ×kMax"). */
  function bissecao(f, kMax) {
    var lo = 1, hi = kMax;
    if (f(lo)) return 1;
    if (!f(hi)) return null;
    for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2; if (f(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  function alemDoLimite(entrada, opts) {
    opts = opts || {};
    var kMax = num(opts.kMax) || 50;
    function comp(k, id) { var x = {}; for (var c in entrada) x[c] = entrada[c]; x.k = k; var r0 = componentes(x); return { c: r0.componentes.filter(function (y) { return y.id === id; })[0], rea: r0.reacoes }; }
    var base = componentes(entrada), eventos = [];
    base.componentes.forEach(function (c) {
      if (c.u.uTrab == null && c.u.uRup == null && c.id.indexOf("patola-") !== 0 && c.id !== "tombamento") return;
      var kT = c.u.uTrab != null ? bissecao(function (k) { var z = comp(k, c.id).c; return z && z.u.uTrab != null && z.u.uTrab >= 1 - 1e-12; }, kMax) : null;
      var kR = c.u.limRup ? bissecao(function (k) { var z = comp(k, c.id).c; return z && z.u.uRup != null && z.u.uRup >= 1 - 1e-12; }, kMax) : null;
      var kD = null;
      if (c.id.indexOf("patola-") === 0 && base.reacoes.ok) kD = bissecao(function (k) { var z = comp(k, c.id).c; return z && z.descola; }, kMax);
      if (c.id === "tombamento" && base.reacoes.ok) kD = bissecao(function (k) { return comp(k, c.id).rea.tomba; }, kMax);
      if (kT == null && kR == null && kD == null) return;
      eventos.push({ id: c.id, nome: c.nome, kTrab: kT, kRup: kR, kDescola: c.id.indexOf("patola-") === 0 ? kD : null, kTomba: c.id === "tombamento" ? kD : null,
        primeiro: Math.min(kT == null ? 1e9 : kT, kR == null ? 1e9 : kR, kD == null ? 1e9 : kD) });
    });
    eventos.sort(function (x, y) { return x.primeiro - y.primeiro; });
    eventos.forEach(function (ev, i) { ev.ordem = i + 1; ev.frase = fraseFalha(ev); });
    return { ranking: eventos, kMax: kMax };
  }
  function brk(k) { return "×" + r(k, 2).toFixed(2).replace(".", ","); }
  function fraseFalha(ev) {
    var p = [];
    if (ev.kTomba != null) p.push("o equipamento tomba com " + brk(ev.kTomba));
    if (ev.kDescola != null) p.push("a " + ev.nome.toLowerCase() + " descola com " + brk(ev.kDescola));
    if (ev.kRup != null) p.push(ev.nome + " rompe com " + brk(ev.kRup));
    if (ev.kTrab != null) p.push(ev.nome + " passa do limite de trabalho com " + brk(ev.kTrab));
    return p.join(" · ");
  }

  var IcarFisica = {
    G: G, CORES: CORES, FAIXAS_PADRAO: FAIXAS_PADRAO, NOMES_PATOLA: NOMES_PATOLA, SIGLAS_PATOLA: SIGLAS_PATOLA, FS_RUPTURA: FS_RUPTURA,
    faixa: faixa, utilizacao: utilizacao, reacoes: reacoes, pressao: pressao, pranchaoMin: pranchaoMin, cabo: cabo, pecaI: pecaI, momentoPeca: momentoPeca,
    forcasGuindaste: forcasGuindaste, forcasMunck: forcasMunck, componentes: componentes, alemDoLimite: alemDoLimite, bissecao: bissecao
  };
  global.IcarFisica = IcarFisica;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarFisica;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

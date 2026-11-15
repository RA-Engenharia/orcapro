/* =====================================================================
 * conclaje.js — DIMENSIONAMENTO DE LAJES de concreto armado (fase C3, 14/11/2026). Motor PURO (ES5, Node-testável, sem DOM).
 * Cálculo de apoio — o engenheiro responsável confere e assina (ART). Todo número vem de js/concdadoscalc.js (com fonte, item e página);
 * o que não foi conferido ('sem-fonte') aparece em ConcDadosCalc.semFonte() e vira pendência no memorial.
 *
 * MÉTODO (o do Bastos, "Lajes de concreto armado", UNESP 2023, que tem o aval da NBR 6118): Teoria das Placas por TABELAS de Bares adaptadas
 * por Pinheiro (1994), com momentos M = μ·p·ℓx²/100, reações V = ν·p·ℓx/10 e flecha a = α·p·ℓx⁴/(12·EI). Cada faixa de 100 cm é dimensionada
 * como viga de bw = 100 cm com as funções JÁ VALIDADAS da C2 (ConcViga.flexao, asMin, resistente, flecha, estadioII, abertura) — nada de solver novo.
 *
 * O QUE CALCULA
 *  1. classificação por λ = ℓy/ℓx (uma direção se λ > 2), vão efetivo (14.6.2.4), vinculação das bordas (simples, engastada, livre; borda parcialmente
 *     contínua: Eq. 5) e tipo de Bares (1, 2A, 2B, 3, 4A, 4B, 5A, 5B, 6)                       → classificar(), vaoEfetivo(), vinculacaoParcial(), tipoBares()
 *  2. momentos, reações e coeficiente de flecha pelas tabelas (interpolação linear em λ, ou a linha mais próxima como no livro) → momentosDuasDirecoes(), reacoes
 *  3. laje armada em uma direção (viga de 1 m: biapoiada, apoiada-engastada, biengastada) e balanço (com γn da Tabela 13.2 e carga linear na ponta)  → umaDirecao()
 *  4. compatibilização dos momentos negativos entre lajes vizinhas (maior valor — 14.7.6.2 — ou Eq. 22 com correção dos positivos)  → compatibilizar(), dimensionarPavimento()
 *  5. armadura de flexão com As,mín (17.3.5.2.1 + Tabela 19.1), As,máx 4 %, φ ≤ h/8, espaçamentos (20.1) e escolha de barras           → armar(), escolherBarras()
 *  6. cortante sem armadura transversal (19.4.1)                                                                                      → cortante()
 *  7. flecha imediata e diferida (17.3.2.1) com o limite ℓ/250 (Tabela 13.3) e fissuração (17.3.3.2, Tabela 13.4)                     → flecha(), fissuracao()
 *  8. aproveitamento por laje e por verificação; todo passo registrado { id, nome, valor, unidade, formula, item } para o memorial (C6)
 *  9. ligação com a C1: fração da carga da laje que vai a cada borda → vigas (substitui as charneiras)                               → fracoesDoModelo()
 * 10. laje treliçada/nervurada: a nervura é uma viga T (ConcViga.flexao); a altura pela tabela do fabricante vem do CATÁLOGO com fonte (LajesPre.escolher; Puma 2019, Belgo 2007, Construrohr 2017) ou da entrada do usuário → trelicada()
 *
 * LIMITES DECLARADOS (viram aviso/pendência, nunca silêncio): só concretos do Grupo I (fck ≤ 50 MPa); só CA-50 nas barras; cargas uniformes
 * (lineares/concentradas só na ponta do balanço); sem momentos volventes (armadura de canto, Figura 25 — a armadura 0,25ℓx fica como pendência),
 * sem borda livre em laje de duas direções (tipos 7 a 10 das Tabelas A-11/A-12 não transcritos), sem alternância de sobrecarga, sem laje com furo,
 * sem punção, sem armadura transversal, sem comprimento/corte de barras (C5), laje contínua em uma direção só pela viga isolada.
 * Pendência P1: tudo 'norma-lida' está na 6118:2014 (biblioteca) e precisa ser conferido no exemplar 2026. As tabelas de Bares usam ν ≈ 0,15 (a 6118
 * 14.7.3 manda 0,2): momentos positivos até ~4,5 % menores que os de ν = 0,2 — conferido por Navier no teste.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function D() { return dep("ConcDadosCalc", "./concdadoscalc.js"); }
  function VG() { return dep("ConcViga", "./concviga.js"); }
  function cv(k, d) { var X = D(); return X ? X.v(k, d) : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function sq(x) { return x * x; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function fmt(v, n) { return (Math.round(v * Math.pow(10, n)) / Math.pow(10, n)).toString().replace(".", ","); }
  function areaBarra(phiMm) { return Math.PI * sq(phiMm / 10) / 4; }
  function passo(R, id, nome, valor, unidade, formula, item) { R.push({ id: id, nome: nome, valor: valor, unidade: unidade, formula: formula, item: item }); return valor; }
  var ROTULO = "Cálculo de apoio — o engenheiro responsável confere e assina (ART)";
  var BASTOS = "Bastos, Lajes de concreto armado (UNESP, 2023)";

  /* ---------------------------------------------------------------- 1. classificação, vão efetivo, vinculação */
  /* λ = ℓy/ℓx (ℓx = menor vão). λ > 2: uma direção (Eq. 1 e 2). */
  function classificar(lx, ly) {
    var a = Math.min(lx, ly), b = Math.max(lx, ly), lam = b / a, lim = cv("lajeLambdaUmaDirecao", 2);
    return { lx: a, ly: b, lambda: lam, trocou: lx > ly, tipo: lam > lim + 1e-9 ? "uma-direcao" : "duas-direcoes", limite: lim };
  }
  /* vão efetivo (14.6.2.4 e 14.7.2.2): ℓef = ℓ0 + a1 + a2, ai = menor entre ti/2 e 0,3h. ℓ0, t1, t2, h na mesma unidade. */
  function vaoEfetivo(l0, t1, t2, h) {
    var f = cv("lajeVaoEfetivoFracaoH", 0.3), a1 = Math.min(t1 / 2, f * h), a2 = Math.min(t2 / 2, f * h);
    return { lef: l0 + a1 + a2, a1: a1, a2: a2 };
  }
  /* borda parcialmente contínua (Eq. 5): a ≥ 2L/3 → engastada; senão apoio simples. */
  function vinculacaoParcial(a, L) { return a >= cv("lajeVinculacaoParcialFracao", 2 / 3) * L - 1e-12 ? "engastada" : "simples"; }

  function tipoDe(b) { if (b == null) return "simples"; var t = typeof b === "string" ? b : b.tipo; t = String(t || "simples").toLowerCase(); return /engast/.test(t) ? "engastada" : (/livre/.test(t) ? "livre" : "simples"); }
  var TIPOS = { "0,0": "1", "0,1": "2A", "1,0": "2B", "1,1": "3", "0,2": "4A", "2,0": "4B", "1,2": "5A", "2,1": "5B", "2,2": "6" };
  /* bordas = { x: [b1, b2], y: [b1, b2] } — x = as duas bordas PERPENDICULARES a x (comprimento ℓy), y = as perpendiculares a y (comprimento ℓx).
   * Tipo de Bares pelo nº de bordas engastadas em cada direção (conferido nas Figuras da Tabela A-1: ∞ → 15,63 / 6,50 / 3,13 = 5/384, 1/185, 1/384). */
  function tipoBares(bordas) {
    var bx = arr(bordas && bordas.x).map(tipoDe), by = arr(bordas && bordas.y).map(tipoDe);
    if (bx.length !== 2 || by.length !== 2) return { ok: false, motivo: "informe as 4 bordas: bordas.x = [b1, b2] e bordas.y = [b1, b2]" };
    if (bx.concat(by).indexOf("livre") >= 0) return { ok: false, livre: true, motivo: "borda livre em laje de duas direções: tipos 7 a 10 de Bares (Tabelas A-11 e A-12) NÃO transcritos na C3 — pendência" };
    var nx = bx.filter(function (t) { return t === "engastada"; }).length, ny = by.filter(function (t) { return t === "engastada"; }).length;
    return { ok: true, tipo: TIPOS[nx + "," + ny], nx: nx, ny: ny, bx: bx, by: by };
  }

  /* ---------------------------------------------------------------- 2. tabelas de Bares */
  function tabelaDoTipo(prefixo, tipo) {
    var D0 = D(); if (!D0) return null;
    var ks = Object.keys(D0.criterios).filter(function (k) { return k.indexOf(prefixo) === 0; });
    for (var i = 0; i < ks.length; i++) { var t = D0.criterios[ks[i]].valor.tipos; if (t && t[tipo]) return { chave: ks[i], t: t[tipo], c: D0.criterios[ks[i]] }; }
    return null;
  }
  /* coeficientes (todas as colunas do tipo) para λ. modo "interpolar" (padrão) ou "linha-proxima" (o livro lê a linha mais próxima; empate → a de cima). λ > 2 → última linha ("> 2,00"). */
  function coef(prefixo, tipo, lambda, modo) {
    var T = tabelaDoTipo(prefixo, tipo); if (!T) return null;
    var L = T.t.linhas, cols = T.t.cols, out = { chave: T.chave, linhaLambda: null, item: T.c.item, pagina: T.c.pagina }, i, k;
    var lam = Math.max(1, lambda), last = L.length - 1;
    function dado(row) { var o = {}; for (k = 0; k < cols.length; k++) o[cols[k]] = row[k + 1]; return o; }
    if (lam > 2 + 1e-9) { out.linhaLambda = ">2"; out.v = dado(L[last]); return out; }
    for (i = 0; i < last - 1; i++) if (lam <= L[i + 1][0] + 1e-12) break;
    if (i > last - 2) i = last - 2;
    var a = L[i], b = L[i + 1], t = (lam - a[0]) / (b[0] - a[0]);
    if (modo === "linha-proxima") { var rowE = t >= 0.5 - 1e-9 ? b : a; out.linhaLambda = rowE[0]; out.v = dado(rowE); return out; }
    out.v = {}; for (k = 0; k < cols.length; k++) out.v[cols[k]] = a[k + 1] + t * (b[k + 1] - a[k + 1]);
    out.linhaLambda = lam; return out;
  }
  function interpolada(modo) { return modo === "linha-proxima" ? "linha mais próxima (como no livro)" : "interpolação linear entre linhas"; }

  /* momentos (kN·m/m) de laje de duas direções para a carga p (kN/m²), ℓx (m): M = μ·p·ℓx²/100 (Eq. 21) */
  function momentosDuasDirecoes(tipo, lx, ly, p, modo) {
    var c = coef("baresMomentos", tipo, ly / lx, modo); if (!c) return { ok: false, motivo: "tipo de Bares sem tabela de momentos: " + tipo };
    var k = p * lx * lx / cv("baresDivisorMomento", 100), M = {};
    Object.keys(c.v).forEach(function (n) { M[n] = c.v[n] * k; });
    return { ok: true, tipo: tipo, lambda: ly / lx, mu: c.v, M: M, linhaLambda: c.linhaLambda, item: c.item, pagina: c.pagina };
  }
  /* reações (kN/m) V = ν·p·ℓx/10 (Eq. 24) por coluna do tipo (vx, vxl, vy, vyl; 'l' = engastada) */
  function reacoesDuasDirecoes(tipo, lx, ly, p, modo) {
    var c = coef("baresReacoes", tipo, ly / lx, modo); if (!c) return { ok: false, motivo: "tipo de Bares sem tabela de reações: " + tipo };
    var k = p * lx / cv("baresDivisorReacao", 10), V = {};
    Object.keys(c.v).forEach(function (n) { V[n] = c.v[n] * k; });
    return { ok: true, nu: c.v, V: V, linhaLambda: c.linhaLambda, item: c.item, pagina: c.pagina };
  }
  /* coeficiente α da flecha (Tabela A-1): ai = α·p·ℓx⁴/(12·EI) */
  function alfaFlecha(tipo, lx, ly, modo) { var c = coef("baresFlecha", tipo, ly / lx, modo); return c ? { alfa: c.v.a, linhaLambda: c.linhaLambda, item: c.item, pagina: c.pagina } : null; }

  /* ---------------------------------------------------------------- 3. uma direção e balanço (viga de 1 m) */
  function casoUmaDirecao(b1, b2) {
    var a = tipoDe(b1), b = tipoDe(b2), n = [a, b].filter(function (t) { return t === "engastada"; }).length, nl = [a, b].filter(function (t) { return t === "livre"; }).length;
    if (nl === 2) return { ok: false, motivo: "duas bordas livres na direção do vão: sem apoio" };
    if (nl === 1) return n === 1 ? { ok: true, caso: "balanco", engastada: a === "engastada" ? 0 : 1 } : { ok: false, motivo: "uma borda livre e a outra apenas apoiada: mecanismo (a laje só funciona engastada: balanço)" };
    return { ok: true, caso: n === 0 ? "biapoiada" : (n === 1 ? "apoiada-engastada" : "biengastada"), engastada: n === 1 ? (a === "engastada" ? 0 : 1) : -1 };
  }
  /* esforços de viga de 1 m: p (kN/m²), l (m), P (kN/m, carga linear na ponta do balanço). Devolve M+ , M− (valores absolutos, kN·m/m) e V maior/menor (kN/m). */
  function umaDirecao(caso, p, l, P) {
    var K = cv("lajeUmaDirecaoCoefs", {})[caso]; if (!K) return null;
    P = num(P, 0);
    var o = { caso: caso, Mpos: K.Mpos * p * l * l, Mneg: K.Mneg * p * l * l, Vmaior: K.Vmaior * p * l, Vmenor: K.Vmenor * p * l, kFlecha: K.flecha };
    if (caso === "balanco") { o.Mneg += P * l; o.Vmaior += P; }
    return o;
  }

  /* ---------------------------------------------------------------- 4. compatibilização dos momentos negativos */
  /* Eq. 22 (equilibrar) ou o maior valor (14.7.6.2). X1, X2 ≥ 0. */
  function compatNegativo(X1, X2, modo) {
    var a = Math.max(X1, X2), b = Math.min(X1, X2);
    if (modo === "equilibrar") return Math.max(cv("lajeCompatFator", 0.8) * a, (a + b) / 2);
    return a;
  }

  /* ---------------------------------------------------------------- 5. materiais, cobrimento, altura */
  function cobrimentoLaje(caa) { var t = cv("lajeCobrimentoCAAmm", [20, 25, 35, 45]); return t[Math.max(1, Math.min(4, Math.round(num(caa, 2)))) - 1] / 10; }
  function gammaN(hCm) { return Math.max(1, cv("lajeGammaNBalancoA", 1.95) - cv("lajeGammaNBalancoB", 0.05) * hCm); }
  function espessuraMinima(uso) {
    var m = { "cobertura": "lajeEspessuraMinCoberturaCm", "piso": "lajeEspessuraMinPisoCm", "balanco": "lajeEspessuraMinBalancoCm", "veiculo-ate-30kN": "lajeEspessuraMinVeiculoAte30kNCm", "veiculo-mais-30kN": "lajeEspessuraMinVeiculoMais30kNCm" };
    return m[uso || "piso"] ? cv(m[uso || "piso"], 8) : null;
  }
  /* pré-dimensionamento (Eq. 15 a 17): d = (2,5 − 0,1·n)·ℓ*, ℓ* = min(ℓx; 0,7ℓy) em m; h = d + φ/2 + c arredondado ao cm, ≥ mínimo da 13.2.4.1 */
  function estimarAltura(lx, ly, n, caa, opc) {
    opc = opc || {};
    var ls = Math.min(lx, cv("lajeAlturaUtilLambdaEstrela", 0.7) * ly), d = (cv("lajeAlturaUtilCoefBase", 2.5) - cv("lajeAlturaUtilCoefPorBorda", 0.1) * n) * ls;
    var c = cobrimentoLaje(caa), phi = num(opc.phiMm, 10) / 10, h = Math.round(d + phi / 2 + c), mn = espessuraMinima(opc.uso);
    return { d: d, lStar: ls, hCalc: d + phi / 2 + c, h: Math.max(h, mn || 0), minimo: mn };
  }

  /* ---------------------------------------------------------------- 6. armaduras */
  /* barras por metro: menor φ (CA-50, φ ≤ h/8) com espaçamento ≥ mínimo prático e ≤ máximo da 20.1, arredondado a 0,5 cm */
  function escolherBarras(AsReq, hCm, opc) {
    opc = opc || {};
    var bit = cv("lajeBitolasEscolha", [6.3, 8, 10, 12.5]), phiMax = cv("lajePhiMaxFracaoH", 0.125) * hCm * 10;
    var smax = opc.secundaria ? cv("lajeEspacamentoMaxSecundariaCm", 33) : Math.min(cv("lajeEspacamentoMaxFracaoH", 2) * hCm, cv("lajeEspacamentoMaxCm", 20));
    var smin = cv("lajeEspacamentoMinPraticoCm", 7), passoE = cv("lajeEspacamentoPassoCm", 0.5), i, phi, A1, s;
    for (i = 0; i < bit.length; i++) {
      phi = bit[i]; if (phi > phiMax + 1e-9) continue;
      A1 = areaBarra(phi); s = Math.min(100 * A1 / Math.max(AsReq, 1e-9), smax); s = Math.floor(s / passoE + 1e-9) * passoE;
      if (s < smin - 1e-9) continue;
      return { ok: true, phi: phi, s: s, AsEf: 100 * A1 / s, smax: smax, texto: "φ " + fmt(phi, 1) + " c/" + fmt(s, 1) + " (" + fmt(r2(100 * A1 / s), 2) + " cm²/m)" };
    }
    return { ok: false, motivo: "As = " + fmt(r2(AsReq), 2) + " cm²/m não cabe com φ ≤ h/8 (" + fmt(phiMax, 1) + " mm) e s ≥ " + smin + " cm: aumente a espessura", smax: smax };
  }
  /* uma faixa de 100 cm: Md (kN·cm/m), d (cm). fator = multiplicador de ρmín (Tabela 19.1); secundaria: { AsPrincipal } */
  function armar(rot, Md, h, d, mat, opc) {
    opc = opc || {};
    var Vg = VG(), R = [], sec = { bw: 100, h: h, d: d, dl: Math.max(h - d, 1) }, fl = Md > 0 ? Vg.flexao(sec, Md, mat) : { ok: true, As: 0, passos: [] }, id = rot.id;
    var out = { id: id, nome: rot.nome, ok: true, Md: Md, d: d, h: h, avisos: [], passos: R };
    if (!fl.ok) { out.ok = false; out.motivo = fl.motivo; return out; }
    if (fl.dupla) { out.ok = false; out.motivo = "x/d > 0,45: a laje exigiria armadura dupla — aumente a espessura (laje não leva armadura de compressão na C3)"; return out; }
    fl.passos.forEach(function (p) { R.push({ id: id + "." + p.id, nome: p.nome, valor: p.valor, unidade: p.unidade, formula: p.formula, item: p.item }); });
    var amin = Vg.asMin({ bw: 100, h: h, d: 0.8 * h, dl: 4 }, mat, { mesaComprimida: false }), rho = amin.rho;
    passo(R, id + ".rho", "Taxa mínima de armadura de flexão (seção retangular)", rho, "-", "ρmín = max(As,mín(Md,mín)/Ac; 0,15 %) — reproduz a Tabela 17.3", "NBR 6118 17.3.5.2.1 e Tabela 19.1");
    var fator = opc.fator != null ? opc.fator : 1, AsMin = fator * rho * 100 * h;
    passo(R, id + ".fator", "Fator de ρmín desta armadura", fator, "-", opc.fatorTexto || "× ρmín", "NBR 6118 Tabela 19.1");
    if (opc.secundaria) {
      var s1 = cv("lajeSecundariaFracaoPrincipal", 0.2) * opc.secundaria.AsPrincipal, s2 = cv("lajeSecundariaMinCm2m", 0.9), s3 = cv("lajeSecundariaFracaoRhoMin", 0.5) * rho * 100 * h;
      AsMin = Math.max(s1, s2, s3);
      passo(R, id + ".secund", "Armadura secundária mínima", AsMin, "cm²/m", "max(20 % de As principal = " + fmt(r2(s1), 2) + "; 0,9; 0,5·ρmín·h = " + fmt(r2(s3), 2) + ")", "NBR 6118 Tabela 19.1 e 20.1");
    }
    passo(R, id + ".AsMin", "Armadura mínima", AsMin, "cm²/m", "As,mín = fator · ρmín · bw · h", "NBR 6118 Tabela 19.1");
    if (opc.AsForcado != null && opc.AsForcado > 0) passo(R, id + ".AsForcado", "Armadura adotada igual à da laje vizinha na borda comum (a maior)", opc.AsForcado, "cm²/m", "As = max(As própria; As da vizinha)", "NBR 6118 14.7.6.2 (adoção da maior armadura negativa) e " + BASTOS);
    var AsCalc = fl.As || 0, AsReq = Math.max(AsCalc, AsMin, opc.AsForcado || 0);
    passo(R, id + ".AsReq", "Armadura necessária (maior entre calculada e mínima)", AsReq, "cm²/m", "max(As,calc; As,mín)", "NBR 6118 17.3.5.2.1");
    var asMax = Vg.asMax({ bw: 100, h: h }).valor; passo(R, id + ".AsMax", "Armadura máxima (4 % Ac)", asMax, "cm²/m", "As,máx = 4 % · 100 · h", "NBR 6118 17.3.5.2.4");
    var b = escolherBarras(AsReq, h, { secundaria: !!opc.secundaria });
    out.AsCalc = AsCalc; out.AsMin = AsMin; out.AsReq = AsReq; out.AsMax = asMax; out.x = fl.x; out.xd = fl.xd; out.dominio = fl.dominio; out.rho = rho; out.governaMin = AsMin > AsCalc + 1e-12;
    if (!b.ok) { out.ok = false; out.motivo = b.motivo; return out; }
    out.barras = b;
    passo(R, id + ".barras", "Barras escolhidas", b.AsEf, "cm²/m", b.texto + " (s ≤ " + fmt(b.smax, 1) + " cm; φ ≤ h/8)", "NBR 6118 20.1");
    var rr = Md > 0 ? Vg.resistente({ bw: 100, h: h, d: d, dl: 4 }, b.AsEf, 0, mat) : { Mrd: Infinity };
    out.Mrd = rr.Mrd; out.razaoFlexao = Md > 0 ? Md / rr.Mrd : 0;
    passo(R, id + ".Mrd", "Momento resistente com as barras escolhidas", rr.Mrd, "kN·cm/m", "equilíbrio da seção com As,ef", "NBR 6118 17.2.2");
    if (b.AsEf > asMax + 1e-9) { out.ok = false; out.motivo = "As,ef acima de 4 % Ac"; }
    return out;
  }

  /* ---------------------------------------------------------------- 7. cortante sem armadura transversal (19.4.1) */
  /* Vk (kN/m) reação/cortante característico; gammaF (1,4), gammaN (balanço); As1 (cm²/m) das barras que chegam ao apoio; d (cm) */
  function cortante(Vk, gammaF, gammaNb, As1, d, mat, opc) {
    opc = opc || {};
    var R = [], Vsd = gammaF * gammaNb * Vk, tau = cv("lajeVrd1TauCoef", 0.25) * mat.fctd;
    var k = opc.metadeNaoChega ? 1 : Math.max(1, cv("lajeVrd1KBase", 1.6) - d / 100), rho1 = Math.min(As1 / (100 * d), cv("lajeVrd1Rho1Max", 0.02));
    var Vrd1 = tau * k * (cv("lajeVrd1Coef1", 1.2) + cv("lajeVrd1Coef2", 40) * rho1) * 100 * d;
    passo(R, "vs.Vsd", "Cortante de cálculo", Vsd, "kN/m", "VSd = γf" + (gammaNb !== 1 ? "·γn" : "") + "·Vk = " + gammaF + (gammaNb !== 1 ? "·" + fmt(gammaNb, 2) : "") + "·" + fmt(r2(Vk), 2), "NBR 6118 19.4.1");
    passo(R, "vs.tau", "Tensão resistente de cálculo do concreto", tau, "kN/cm²", "τRd = 0,25·fctd, fctd = fctk,inf/γc = " + fmt(mat.fctd * 10, 3) + " MPa", "NBR 6118 19.4.1");
    passo(R, "vs.k", "Coeficiente k", k, "-", opc.metadeNaoChega ? "k = 1 (50 % da armadura inferior não chega ao apoio)" : "k = |1,6 − d| ≥ 1, d = " + fmt(d / 100, 3) + " m", "NBR 6118 19.4.1");
    passo(R, "vs.rho1", "ρ1 = As1/(bw·d)", rho1, "-", "As1 = " + fmt(r2(As1), 2) + " cm²/m, ρ1 ≤ 0,02", "NBR 6118 19.4.1");
    passo(R, "vs.Vrd1", "Cortante resistente sem armadura transversal", Vrd1, "kN/m", "VRd1 = τRd·k·(1,2 + 40ρ1)·bw·d", "NBR 6118 19.4.1");
    return { Vsd: Vsd, Vrd1: Vrd1, k: k, rho1: rho1, tau: tau, razao: Vrd1 > 0 ? Vsd / Vrd1 : Infinity, ok: Vsd <= Vrd1 + 1e-9, passos: R };
  }

  /* ---------------------------------------------------------------- 8. ELS */
  /* flecha de uma faixa: aEl = flecha elástica com EcsIc BRUTO (cm) → ConcViga.flecha aplica (EI)eq e a fluência. Ma (kN·cm/m) na combinação rara. */
  function flecha(sec, As, Ma, mat, aEl, opc) {
    var f = VG().flecha(sec, As, 0, Ma, mat, { aElastica: aEl, t: opc.t, t0: opc.t0, limite: opc.limite, L: opc.L, aVariavel: opc.aVariavel });
    return f;
  }
  /* fissuração da laje: wk (mm) na combinação FREQUENTE com a área de envolvimento da barra (retângulo a 7,5φ do eixo, limitado pelo espaçamento) */
  function fissuracao(sec, As, Mser, mat, barras, caa, cob, opc) {
    opc = opc || {};
    var Vg = VG(), R = [], g = Vg.propsBruta(sec.bw, sec.h, 0, 0), lim = cv("wkLimiteCAAmm", [0.4, 0.3, 0.3, 0.2])[Math.max(1, Math.min(4, Math.round(num(caa, 2)))) - 1];
    var Mr = cv("mrAlphaRetangular", 1.5) * mat.fctkInf * g.Ic / g.yt;
    passo(R, "wk.Mr", "Momento de fissuração (fctk,inf)", Mr, "kN·cm/m", "Mr = α·fctk,inf·Ic/yt, α = 1,5", "NBR 6118 17.3.1");
    passo(R, "wk.Mser", "Momento da combinação frequente", Mser, "kN·cm/m", "Md,ser", "NBR 6118 Tabela 13.4 e 11.8.3");
    if (Mser <= Mr) return { ok: true, fissurada: false, wk: 0, limite: lim, razao: 0, Mr: Mr, passos: R };
    var ii = Vg.estadioII({ bw: sec.bw, d: sec.d, dl: 4 }, As, 0, mat.alphaE), sig = Mser * (sec.d - ii.x) * mat.alphaE / ii.III;
    passo(R, "wk.xII", "Linha neutra no estádio II", ii.x, "cm", "αe = " + fmt(mat.alphaE, 3), "NBR 6118 17.3.3.2");
    passo(R, "wk.sig", "Tensão na armadura (estádio II)", sig, "kN/cm²", "σs = αe·Md,ser·(d − xII)/III", "NBR 6118 17.3.3.2");
    var phi = barras.phi / 10, Rr = cv("wkRegiaoPhi", 7.5) * phi, y1 = cob + phi / 2, larg = Math.min(barras.s, 2 * Rr);
    var abaixo = Math.min(Rr, y1), acima = Math.min(Rr, Math.max(sec.h - y1 - ii.x, 0)), Acr = larg * (abaixo + acima), rho = areaBarra(barras.phi) / Acr;
    passo(R, "wk.Acr", "Área de concreto de envolvimento por barra", Acr, "cm²", "largura min(s; 15φ) × altura (até 7,5φ do eixo, limitada pela linha neutra)", "NBR 6118 17.3.3.2");
    passo(R, "wk.rho", "Taxa de armadura na região de envolvimento", rho, "-", "ρri = As,barra/Acr", "NBR 6118 17.3.3.2");
    var w = Vg.abertura(phi, sig, rho, mat.fctm, mat.Es);
    passo(R, "wk.wk", "Abertura característica de fissura", w.wk * 10, "mm", "wk = min(wk,1 ; wk,2) = min(" + fmt(w.wk1 * 10, 3) + "; " + fmt(w.wk2 * 10, 3) + ")", "NBR 6118 17.3.3.2");
    passo(R, "wk.lim", "Limite para a CAA " + caa, lim, "mm", "Tabela 13.4 (concreto armado, combinação frequente)", "NBR 6118 Tabela 13.4");
    return { ok: true, fissurada: true, wk: w.wk * 10, limite: lim, razao: w.wk * 10 / lim, sigma: sig, xII: ii.x, rho: rho, Acr: Acr, Mr: Mr, passos: R };
  }

  /* ---------------------------------------------------------------- 9. UMA LAJE MACIÇA */
  /* e = { id, marca, lx, ly (m, vãos efetivos), h (m), fck, fyk?, caa, bordas:{x:[..],y:[..]}, g (kN/m², permanente total) | gExtra (soma ao peso próprio 25·h), q (kN/m²), uso?:"resid"|"comercial"|"biblioteca" | psi1, psi2,
   *       usoLaje?: "piso"|"cobertura"|"balanco"|..., balanco?: true (lx = comprimento do balanço, bordas.x = ["engastada","livre"]),
   *       PgPonta, PqPonta (kN/m, carga linear na ponta do balanço: gradil), limiteFlecha?: "visual"|"alvenaria"|"vibracao", LparedeM?, t, t0, phiEst (mm),
   *       faceSuperiorRevestida?: true, bordaSimplesLigada?: false, momentosNegativos?: { "x1": kN·m/m, ... } (compatibilizados, pelo pavimento), positivos?: {...} }
   * opc = { tabela: "interpolar"|"linha-proxima", dDuasCamadas: true, PqNoELS: true, caaPadrao, agregado } */
  function dimensionarLaje(e, opc) {
    opc = opc || {};
    var Vg = VG(), out = { id: e.id, marca: e.marca || "", ok: true, avisos: [], pendencias: [], passos: [], verificacoes: [], armaduras: [], rotulo: ROTULO };
    var R = out.passos;
    var mat = Vg.material(e.fck, e.fyk, opc); if (!mat.ok) { out.ok = false; out.motivo = mat.motivo; return out; }
    var cl = classificar(num(e.lx, 0), num(e.ly, num(e.lx, 0)));
    if (!(cl.lx > 0)) { out.ok = false; out.motivo = "vãos inválidos"; return out; }
    var bordas = cl.trocou && e.bordas ? { x: e.bordas.y, y: e.bordas.x } : e.bordas;
    var hCm = num(e.h, 0) * 100; if (!(hCm > 0)) { out.ok = false; out.motivo = "espessura h inválida"; return out; }
    var lx = cl.lx, ly = cl.ly, balanco = !!e.balanco, gF = cv("gammaG_normal_desfavoravel", 1.4), qF = cv("gammaQ_normal", 1.4);
    /* cargas */
    var g = e.g != null ? Number(e.g) : cv("pesoConcretoArmado", 25) * hCm / 100 + num(e.gExtra, 0), q = num(e.q, 0);
    var uso = e.uso || "resid", psi1 = e.psi1 != null ? e.psi1 : cv("psi_" + uso + "_1", 0.4), psi2 = e.psi2 != null ? e.psi2 : cv("psi_" + uso + "_2", 0.3);
    var pd = gF * g + qF * q, pRara = g + q, pQP = g + psi2 * q, pFreq = g + psi1 * q;
    passo(R, "ln.cl", "Relação entre os lados λ = ℓy/ℓx", cl.lambda, "-", "ℓx = " + fmt(lx, 3) + " m (menor), ℓy = " + fmt(ly, 3) + " m" + (balanco ? " [balanço: ℓx = comprimento do balanço]" : ""), BASTOS + " Eq. 1 e 2");
    passo(R, "ln.pd", "Carga de cálculo (ELU)", pd, "kN/m²", "pd = γg·g + γq·q = " + gF + "·" + fmt(r2(g), 2) + " + " + qF + "·" + fmt(r2(q), 2), "NBR 6118 11.8 / NBR 8681");
    passo(R, "ln.pRara", "Carga na combinação rara", pRara, "kN/m²", "g + q (uma só ação variável; 11.8.3.2)", "NBR 6118 11.8.3.2");
    passo(R, "ln.pQP", "Carga na combinação quase permanente", pQP, "kN/m²", "g + ψ2·q, ψ2 = " + psi2, "NBR 6118 11.8.3.1");
    passo(R, "ln.pFreq", "Carga na combinação frequente", pFreq, "kN/m²", "g + ψ1·q, ψ1 = " + psi1, "NBR 6118 11.8.3.2");
    out.cargas = { g: g, q: q, pd: pd, pRara: pRara, pQP: pQP, pFreq: pFreq, psi1: psi1, psi2: psi2 };
    var hMin = espessuraMinima(e.usoLaje || (balanco ? "balanco" : "piso"));
    /* ⚠ h < mínimo da 13.2.4.1 REPROVA (revisão de cálculo 14/11/2026): era só um aviso e a laje saía "atende" com 7 cm de piso. Entra nas verificações (razão hMin/h > 1) e o atende cai. */
    if (hMin != null && hCm < hMin - 1e-9) { out.avisos.push("Espessura " + fmt(hCm, 1) + " cm abaixo do mínimo da 13.2.4.1 (" + hMin + " cm) para '" + (e.usoLaje || (balanco ? "balanco" : "piso")) + "': NÃO ATENDE."); out.abaixoMinimo = { h: hCm, minimo: hMin, uso: e.usoLaje || (balanco ? "balanco" : "piso") }; }
    if (q > cv("lajeAlternanciaQMaxKNm2", 5) || q > cv("lajeAlternanciaQFracaoTotal", 0.5) * (g + q)) out.pendencias.push("Alternância da sobrecarga (14.7.1) NÃO considerada, e a sobrecarga passa de 5 kN/m² ou de 50 % da carga total: o engenheiro avalia.");
    var caa = num(e.caa, num(opc.caaPadrao, 2)), cPos = cobrimentoLaje(caa), cNeg = e.faceSuperiorRevestida ? cv("lajeCobrimentoFaceSupRevestidaMm", 15) / 10 : cPos;
    var phiEst = num(e.phiMm, 10) / 10, dPos = hCm - cPos - phiEst / 2, dNeg = hCm - cNeg - phiEst / 2, dPosY = opc.dDuasCamadas === false ? dPos : dPos - phiEst;
    out.entrada = { lx: lx, ly: ly, h: hCm, fck: e.fck, caa: caa, cobrimentoPos: cPos, cobrimentoNeg: cNeg, dPos: dPos, dNeg: dNeg, phiEst: phiEst * 10 };
    passo(R, "ln.d", "Alturas úteis (φ estimado " + fmt(phiEst * 10, 1) + " mm)", dPos, "cm", "d+ = h − c − φ/2 = " + fmt(hCm, 1) + " − " + fmt(cPos, 1) + " − " + fmt(phiEst / 2, 2) + "; d− = " + fmt(dNeg, 2) + (opc.dDuasCamadas === false ? "" : "; d+(y) = d+ − φ = " + fmt(dPosY, 2)), "NBR 6118 Tabela 7.2 e " + BASTOS + " Eq. 18");

    var tipo = null, esf = { }, edges = [], reac = [], casoU = null, M = {}, Mrara = {}, Mfreq = {}, alfa = null, aElX = 0, PgP = num(e.PgPonta, 0), PqP = num(e.PqPonta, 0);
    var gN = balanco ? gammaN(hCm) : 1;
    if (balanco) passo(R, "bl.gn", "Coeficiente adicional γn para laje em balanço", gN, "-", "γn = 1,95 − 0,05·h = 1,95 − 0,05·" + fmt(hCm, 1), "NBR 6118 13.2.4.1 e Tabela 13.2");
    var umaDir = cl.tipo === "uma-direcao" || balanco || e.umaDirecao === true;

    if (umaDir) {
      casoU = casoUmaDirecao(bordas && bordas.x && bordas.x[0], bordas && bordas.x && bordas.x[1]);
      if (!casoU.ok) { out.ok = false; out.motivo = casoU.motivo; return out; }
      var cs = casoU.caso, PdP = gF * PgP + qF * PqP, PraraP = PgP + PqP;
      /* a carga linear VARIÁVEL da ponta (2 kN/m no parapeito, NBR 6120) entra no ELS pelas combinações; opc.PqNoELS = false a deixa de fora, como o exemplo do livro (3.17.6.2) */
      var PqEls = opc.PqNoELS === false ? 0 : PqP, PraraEls = PgP + PqEls, PqpP = PgP + psi2 * PqEls, PfreqP = PgP + psi1 * PqEls;
      var ed = umaDirecao(cs, pd, lx, PdP), er = umaDirecao(cs, pRara, lx, PraraEls), eq = umaDirecao(cs, pQP, lx, PqpP), ef = umaDirecao(cs, pFreq, lx, PfreqP);
      out.caso = cs; out.tipoLaje = balanco ? "balanço (armada em uma direção)" : "armada em uma direção (" + cs + ")";
      passo(R, "ud.caso", "Esquema estático da faixa de 1 m", 0, "-", cs + " (ℓ = " + fmt(lx, 3) + " m)", BASTOS + " Figuras 17 a 20");
      passo(R, "ud.Mpos", "Momento positivo de cálculo", ed.Mpos, "kN·m/m", "Mpos = k·pd·ℓ²", BASTOS + " Figuras 17 a 19");
      if (ed.Mneg > 0) passo(R, "ud.Mneg", "Momento negativo de cálculo no engaste", ed.Mneg, "kN·m/m", cs === "balanco" ? "M = pd·ℓ²/2 + Pd·ℓ" + (PdP ? " (Pd = " + fmt(r2(PdP), 2) + " kN/m na ponta)" : "") : "Mneg = k·pd·ℓ²", BASTOS + " Figuras 18 a 20");
      M.pos = ed.Mpos * gN; M.neg = ed.Mneg * gN;       /* kN·m/m de cálculo (γn já aplicado) */
      Mrara.pos = er.Mpos; Mrara.neg = er.Mneg; Mfreq.pos = ef.Mpos; Mfreq.neg = ef.Mneg;
      esf = { Mpos: ed.Mpos, Mneg: ed.Mneg, gammaN: gN };
      var Vk = umaDirecao(cs, pRara, lx, PraraP);
      /* armaduras */
      if (cs !== "balanco") {
        var aP = armar({ id: "A+x", nome: "Armadura positiva principal (direção x)" }, M.pos * 100, hCm, dPos, mat, { fator: cv("lajeFatorRhoMinPositivaUmaDirecao", 1), fatorTexto: "1,0·ρmín (positiva principal, laje armada em uma direção)" });
        out.armaduras.push(aP);
        if (aP.ok) out.armaduras.push(armar({ id: "A+y", nome: "Armadura positiva secundária (direção y)" }, 0, hCm, dPosY, mat, { secundaria: { AsPrincipal: aP.barras.AsEf }, fator: 1 }));
      }
      if (ed.Mneg > 0 || cs === "balanco") out.armaduras.push(armar({ id: "A-x", nome: cs === "balanco" ? "Armadura negativa no engaste do balanço" : "Armadura negativa no engaste" }, M.neg * 100, hCm, dNeg, mat, { fator: cv("lajeFatorRhoMinNegativa", 1), fatorTexto: "1,0·ρmín (armadura negativa)" }));
      if (cs === "balanco") {
        var aSec = out.armaduras[0];
        if (aSec && aSec.ok) out.armaduras.push(armar({ id: "A-y", nome: "Armadura de distribuição do balanço (direção y)" }, 0, hCm, dNeg - phiEst, mat, { secundaria: { AsPrincipal: aSec.barras.AsEf }, fator: 1 }));
        /* Em1:2026 20.6 (p.16): armadura na face INFERIOR, ancorada na estrutura principal, com capacidade de suportar TODAS as ações permanentes (evita o colapso total se
         * romper a seção de apoio). O texto não traz fórmula: interpretação CONSERVADORA do produto = a face inferior resiste, em flexão, ao momento das ações permanentes
         * (g + carga linear permanente da ponta) com γg e γn — o RT confere (decisão do produto: lajeBalancoAnticolapsoGammaG). */
        var gAc = num(opc.gammaGAnticolapso, cv("lajeBalancoAnticolapsoGammaG", 1.4)) * cv("lajeBalancoAnticolapso", 1), eAc = umaDirecao(cs, g, lx, PgP);
        passo(R, "ac.Md", "Momento das ações permanentes para a armadura inferior anticolapso", gAc * eAc.Mneg * gN, "kN·m/m", "Md = γg·γn·(g·ℓ²/2 + Pg·ℓ) = " + fmt(gAc, 2) + " × " + fmt(gN, 2) + " × " + fmt(r2(eAc.Mneg), 3), "NBR 6118:2023/Em1:2026 20.6; γg decisão do produto");
        var aAc = armar({ id: "A+x-anticolapso", nome: "Armadura inferior anticolapso do balanço (Em1:2026 20.6)" }, gAc * eAc.Mneg * gN * 100, hCm, dPos, mat, { fator: 1, fatorTexto: "1,0·ρmín (armadura inferior do balanço)" });
        aAc.anticolapso = true; out.armaduras.push(aAc);
        out.avisos.push("Balanço (Em1:2026 20.6): a armadura inferior anticolapso deve ser ANCORADA na estrutura principal (ℓb,nec, 9.4.2.5) e distribuída ao longo do apoio; dimensionada em flexão com γg = " + fmt(gAc, 2) + " (interpretação conservadora do produto — o RT confere).");
      }
      /* reações (kN/m) pelas bordas */
      var bx = bordas && bordas.x || [];
      [0, 1].forEach(function (k) {
        var t = tipoDe(bx[k]), V = 0;
        if (cs === "balanco") V = t === "engastada" ? Vk.Vmaior : 0;
        else if (cs === "apoiada-engastada") V = t === "engastada" ? Vk.Vmaior : Vk.Vmenor;
        else V = Vk.Vmaior;
        edges.push({ id: "x" + (k + 1), tipo: t, comp: ly, V: V, origem: "viga de 1 m" });
      });
      var by = bordas && bordas.y || [];
      [0, 1].forEach(function (k) { var t = tipoDe(by[k]); edges.push({ id: "y" + (k + 1), tipo: t, comp: lx, V: t === "livre" || balanco ? 0 : cv("lajeCargaViga1DirecaoFator", 0.15) * pRara * lx, origem: "triângulo lateral (Eq. 23)" }); });
      /* flecha: seção crítica = positiva (vão) ou o engaste (balanço); aElastica = k·p·ℓ⁴/EcIc (+ P·ℓ³/3 no balanço) */
      var gI = Vg.propsBruta(100, hCm, 0, 0), EcIc = mat.Ecs * gI.Ic, Lc = lx * 100, pLin = pQP / 100, kk = eq.kFlecha;       /* p da faixa de 1 m em kN/cm */
      var aEl = kk * pLin * Math.pow(Lc, 4) / EcIc;
      if (cs === "balanco" && PqpP > 0) aEl += PqpP * Math.pow(Lc, 3) / 3 / EcIc;      /* P em kN (faixa de 1 m de largura) */
      var secF = cs === "balanco" ? { bw: 100, h: hCm, d: dNeg } : { bw: 100, h: hCm, d: dPos };
      var armF = cs === "balanco" ? out.armaduras.filter(function (a) { return a.id === "A-x"; })[0] : out.armaduras[0];
      var MaF = (cs === "balanco" ? Mrara.neg : Mrara.pos) * 100;
      esf.MaRara = MaF / 100;
      if (armF && armF.ok) out.flecha = flecha(secF, armF.barras.AsEf, MaF, mat, aEl, { t: e.t, t0: e.t0, limite: e.limiteFlecha, L: (balanco ? 2 * Lc : (e.LparedeM ? e.LparedeM * 100 : Lc)) });
      var Mfq = (cs === "balanco" ? Mfreq.neg : Mfreq.pos) * 100;
      if (armF && armF.ok) out.fissuracao = fissuracao(secF, armF.barras.AsEf, Mfq, mat, armF.barras, caa, cs === "balanco" ? cNeg : cPos, {});
      out.alfaFlecha = null; out.kFlecha = kk;
    } else {
      /* duas direções */
      var tb = tipoBares(bordas); if (!tb.ok) { out.ok = false; out.motivo = tb.motivo; out.pendencias.push(tb.motivo); return out; }
      tipo = tb.tipo; out.tipoBares = tipo; out.tipoLaje = "armada em duas direções (tipo " + tipo + " de Bares)";
      passo(R, "bs.tipo", "Tipo de Bares (vinculação das bordas)", 0, "-", tipo + ": bordas engastadas ⟂x = " + tb.nx + ", ⟂y = " + tb.ny, BASTOS + " Figura 10 e Tabelas A-8 a A-10");
      var modo = opc.tabela || "interpolar", mmD = momentosDuasDirecoes(tipo, lx, ly, pd, modo), mmR = momentosDuasDirecoes(tipo, lx, ly, pRara, modo), mmF = momentosDuasDirecoes(tipo, lx, ly, pFreq, modo);
      if (!mmD.ok) { out.ok = false; out.motivo = mmD.motivo; return out; }
      Object.keys(mmD.mu).forEach(function (n) { passo(R, "mu." + n, "Coeficiente de momento " + n.replace("l", "'"), mmD.mu[n], "-", "Tabela de Bares, λ = " + fmt(cl.lambda, 3) + " (" + interpolada(modo) + ")", mmD.item + ", " + mmD.pagina); });
      M = {}; Mrara = {}; Mfreq = {};
      Object.keys(mmD.M).forEach(function (n) { M[n] = mmD.M[n]; Mrara[n] = mmR.M[n]; Mfreq[n] = mmF.M[n]; passo(R, "M." + n, "Momento de cálculo " + n.replace("l", "'"), mmD.M[n], "kN·m/m", "M = μ·pd·ℓx²/100", BASTOS + " Eq. 21"); });
      esf = { mu: mmD.mu, Md: mmD.M, Mk: mmR.M, linhaLambda: mmD.linhaLambda };
      /* momentos negativos compatibilizados (vindos do pavimento) */
      if (e.momentosNegativos) Object.keys(e.momentosNegativos).forEach(function (k) { var c = e.momentosNegativos[k]; if (c != null) { esf.compat = esf.compat || {}; esf.compat[k] = c; } });
      var al = alfaFlecha(tipo, lx, ly, modo); alfa = al; out.alfaFlecha = al;
      var rd = reacoesDuasDirecoes(tipo, lx, ly, pRara, modo);
      if (rd.ok) {
        [["x", 0], ["x", 1], ["y", 0], ["y", 1]].forEach(function (a) {
          var dir = a[0], k = a[1], t = tb[dir === "x" ? "bx" : "by"][k], col = "v" + dir + (t === "engastada" ? "l" : ""), nu = rd.nu[col], V = nu != null ? rd.V[col] : NaN;
          edges.push({ id: dir + (k + 1), tipo: t, comp: dir === "x" ? ly : lx, V: V, nu: nu, origem: "Tabelas A-5 a A-7" });
        });
        esf.reacoes = rd;
      }
      /* armaduras: positivas */
      var Mpx = Math.max(M.mx || 0, 0), Mpy = Math.max(M.my || 0, 0);
      if (e.positivos) { if (e.positivos.mx != null) Mpx = e.positivos.mx; if (e.positivos.my != null) Mpy = e.positivos.my; }
      var fPos = cv("lajeFatorRhoMinPositivaDuasDirecoes", 0.67), fTxt = "0,67·ρmín (positiva de laje armada em duas direções)";
      out.armaduras.push(armar({ id: "A+x", nome: "Armadura positiva na direção x (vão menor)" }, Mpx * 100, hCm, dPos, mat, { fator: fPos, fatorTexto: fTxt }));
      out.armaduras.push(armar({ id: "A+y", nome: "Armadura positiva na direção y (vão maior)" }, Mpy * 100, hCm, dPosY, mat, { fator: fPos, fatorTexto: fTxt }));
      /* negativas: uma por borda engastada; compat pelo pavimento substitui o isolado */
      ["x", "y"].forEach(function (dir) {
        [0, 1].forEach(function (k) {
          var t = tb[dir === "x" ? "bx" : "by"][k], id = dir + (k + 1), Mn = M[dir === "x" ? "mxl" : "myl"];
          if (t === "engastada" && Mn != null) {
            var Mu = (e.momentosNegativos && e.momentosNegativos[id] != null) ? e.momentosNegativos[id] : Mn;
            var a = armar({ id: "A-" + id, nome: "Armadura negativa na borda " + id + " (engastada)" }, Mu * 100, hCm, dNeg, mat, { fator: cv("lajeFatorRhoMinNegativa", 1), fatorTexto: "1,0·ρmín (armadura negativa)", AsForcado: e.asNegativa && e.asNegativa[id] });
            a.borda = id; a.Misolado = Mn; out.armaduras.push(a);
          } else if (t === "simples" && e.bordaSimplesLigada !== false) {
            var a2 = armar({ id: "A-" + id, nome: "Armadura negativa de borda sem continuidade " + id }, 0, hCm, dNeg, mat, { fator: cv("lajeFatorRhoMinNegativaBordaSemContinuidade", 0.67), fatorTexto: "0,67·ρmín (negativa de borda sem continuidade)" });
            a2.borda = id; a2.construtiva = true; a2.extensao = cv("lajeBordaNegativaExtensaoFracaoVaoMenor", 0.15) * lx; out.armaduras.push(a2);
          }
        });
      });
      out.pendencias.push("Momentos volventes nos cantos (armadura 0,25ℓx inferior e superior, Figura 25): NÃO calculados na C3 — o engenheiro dispõe.");
      /* flecha (direção x, Tabela A-1) */
      var gI2 = Vg.propsBruta(100, hCm, 0, 0), EcIc2 = mat.Ecs * gI2.Ic, aX = out.armaduras[0];
      if (al && aX && aX.ok) {
        var aElD = al.alfa / cv("baresDivisorFlecha", 12) * (pQP / 10000) * Math.pow(lx * 100, 4) / EcIc2;
        passo(R, "fl.alfa", "Coeficiente α da flecha", al.alfa, "-", "Tabela A-1, tipo " + tipo + ", λ = " + fmt(cl.lambda, 3), al.item + ", " + al.pagina);
        esf.MaRara = Mrara.mx;
        out.flecha = flecha({ bw: 100, h: hCm, d: dPos }, aX.barras.AsEf, Mrara.mx * 100, mat, aElD, { t: e.t, t0: e.t0, limite: e.limiteFlecha, L: e.LparedeM ? e.LparedeM * 100 : lx * 100 });
        out.fissuracao = fissuracao({ bw: 100, h: hCm, d: dPos }, aX.barras.AsEf, Mfreq.mx * 100, mat, aX.barras, caa, cPos, {});
      }
    }

    /* cortante nos apoios (maior reação) */
    var V1 = 0, iV = null; edges.forEach(function (ed) { if (isFinite(ed.V) && ed.V > V1) { V1 = ed.V; iV = ed; } });
    out.reacoes = edges;
    var aCort, dC;
    if (balanco) { aCort = out.armaduras.filter(function (a) { return a.id === "A-x" && a.ok; })[0]; dC = dNeg; }
    else if (iV && iV.id.charAt(0) === "y" && !umaDir) { aCort = out.armaduras.filter(function (a) { return a.id === "A+y" && a.ok; })[0]; dC = dPosY; }
    else { aCort = out.armaduras.filter(function (a) { return a.id === "A+x" && a.ok; })[0]; dC = dPos; }
    if (aCort && V1 > 0) {
      /* Vk = reação característica (carga rara; no balanço já inclui a carga na ponta); VSd = γf·γn·Vk como no exemplo do livro */
      out.cortante = cortante(V1, gF, gN, aCort.barras.AsEf, dC, mat, {});
      out.cortante.borda = iV.id;
    }
    /* verificações e aproveitamento */
    out.armaduras.forEach(function (a) {
      if (!a.ok) { out.ok = false; out.motivo = out.motivo || (a.id + ": " + a.motivo); return; }
      if (a.Md > 0) out.verificacoes.push({ nome: "Flexão " + a.id, valor: a.razaoFlexao, detalhe: "Md/MRd com " + a.barras.texto });
      out.verificacoes.push({ nome: "Armadura máxima " + a.id, valor: a.barras.AsEf / a.AsMax, detalhe: "As,ef/As,máx" });
      a.passos.forEach(function (p) { R.push(p); });
    });
    if (out.cortante) { out.verificacoes.push({ nome: "Cortante sem armadura transversal (borda " + out.cortante.borda + ")", valor: out.cortante.razao, detalhe: "VSd/VRd1" }); out.cortante.passos.forEach(function (p) { R.push(p); }); }
    if (out.flecha && out.flecha.ok) { out.verificacoes.push({ nome: "Flecha total", valor: out.flecha.razao, detalhe: "at = " + fmt(r2(out.flecha.at), 2) + " cm; limite " + fmt(r2(out.flecha.limite), 2) + " cm" }); out.flecha.passos.forEach(function (p) { R.push(p); }); }
    if (out.fissuracao && out.fissuracao.ok) { out.verificacoes.push({ nome: "Fissuração (wk)", valor: out.fissuracao.razao, detalhe: out.fissuracao.fissurada ? "wk = " + fmt(r2(out.fissuracao.wk), 3) + " mm" : "Md,ser ≤ Mr: sem fissuras" }); out.fissuracao.passos.forEach(function (p) { R.push(p); }); }
    if (out.abaixoMinimo) out.verificacoes.push({ nome: "Espessura mínima (13.2.4.1, " + out.abaixoMinimo.uso + ")", valor: out.abaixoMinimo.minimo / out.abaixoMinimo.h, detalhe: "h = " + fmt(hCm, 1) + " cm < " + out.abaixoMinimo.minimo + " cm" });
    var mx = 0, gov = ""; out.verificacoes.forEach(function (v) { if (v.valor > mx) { mx = v.valor; gov = v.nome; } });
    out.aproveitamento = mx; out.governa = gov; out.atende = out.ok && mx <= 1 + 1e-9;
    out.esforcos = esf; out.classificacao = cl; out.espessuraMinima = hMin;
    out.fracoes = fracoesDe(out);
    out.avisos.push("Vãos efetivos informados pela entrada (14.6.2.4); a espessura h é a informada — conferir o pré-dimensionamento (estimarAltura).");
    out.pendencias = out.pendencias.concat(D() ? D().semFonte().map(function (x) { return "SEM FONTE: " + x.chave + " (" + x.item + ")"; }) : []);
    return out;
  }

  /* fração da carga total da laje que vai a cada borda (soma = 1): V·L / Σ V·L (as tabelas de Pinheiro "alivam pela metade", e a Eq. 23 do livro é a favor da segurança: normaliza) */
  function fracoesDe(r) {
    var tot = 0, f = {};
    arr(r.reacoes).forEach(function (ed) { if (isFinite(ed.V) && ed.V > 0) tot += ed.V * ed.comp; });
    arr(r.reacoes).forEach(function (ed) { f[ed.id] = tot > 0 && isFinite(ed.V) ? ed.V * ed.comp / tot : 0; });
    var p = r.cargas ? r.cargas.pRara : 0, area = r.classificacao ? r.classificacao.lx * r.classificacao.ly : 0;
    return { porBorda: f, somaVL: tot, cargaTotal: p * area, razaoEquilibrio: p * area > 0 ? tot / (p * area) : 0 };
  }

  /* ---------------------------------------------------------------- 10. PAVIMENTO: compatibilização entre vizinhas */
  /* lajes = [e...]; e.bordas.x/y[k] = "simples" | "engastada" | "livre" | { tipo:"engastada", viz:"L3.y1" } (id da laje vizinha . id da borda dela: x1,x2,y1,y2). */
  function dimensionarPavimento(lajes, opc) {
    opc = opc || {};
    var modoC = opc.compat === "equilibrar" ? "equilibrar" : (opc.compat === "maior-armadura" ? "maior-armadura" : "maior"), iso = {}, porId = {};
    lajes.forEach(function (e) { porId[e.id] = e; iso[e.id] = dimensionarLaje(e, opc); });
    var pares = [], vistos = {};
    lajes.forEach(function (e) {
      ["x", "y"].forEach(function (dir) {
        arr(e.bordas && e.bordas[dir]).forEach(function (b, k) {
          if (!b || typeof b !== "object" || !b.viz) return;
          var meu = e.id + "." + dir + (k + 1), outro = String(b.viz), chave = [meu, outro].sort().join("|");
          if (vistos[chave]) return; vistos[chave] = 1; pares.push({ a: meu, b: outro });
        });
      });
    });
    var neg = {}, pos = {}, comp = [], asNeg = {};
    function asIso(ref) { var p = ref.split("."), r = iso[p[0]]; if (!r || !r.ok) return null; var ar = r.armaduras.filter(function (a) { return a.borda === p[1] && a.Misolado != null; })[0]; return ar ? ar.AsReq : null; }
    function mIso(ref) { var p = ref.split("."), r = iso[p[0]]; if (!r || !r.ok) return null; var ar = r.armaduras.filter(function (a) { return a.borda === p[1] && a.Misolado != null; })[0]; return ar ? ar.Misolado : null; }
    pares.forEach(function (pr) {
      var X1 = mIso(pr.a), X2 = mIso(pr.b);
      if (X1 == null || X2 == null) { comp.push({ borda: [pr.a, pr.b], motivo: "uma das lajes não tem momento negativo nesta borda (ou não foi dimensionada) — mantido o isolado" }); return; }
      if (modoC === "maior-armadura") {      /* o exemplo do livro (3.17.5): cada laje fica com o seu momento e as duas adotam a MAIOR ÁREA de armadura na borda comum */
        var A1 = asIso(pr.a), A2 = asIso(pr.b), Am = Math.max(A1, A2);
        [pr.a, pr.b].forEach(function (ref) { var q = ref.split("."); (asNeg[q[0]] = asNeg[q[0]] || {})[q[1]] = Am; });
        comp.push({ borda: [pr.a, pr.b], X1: X1, X2: X2, As1: A1, As2: A2, AsAdotada: Am, modo: modoC, formula: "As = max(As1; As2) na borda comum (o momento de cada laje não muda)" });
        return;
      }
      var X = compatNegativo(X1, X2, modoC);
      [[pr.a, X1], [pr.b, X2]].forEach(function (t) {
        var ref = t[0], p = ref.split("."); (neg[p[0]] = neg[p[0]] || {})[p[1]] = X;
        if (modoC === "equilibrar" && t[1] - X > 0) { var dirM = p[1].charAt(0) === "x" ? "mx" : "my"; (pos[p[0]] = pos[p[0]] || {})[dirM] = ((pos[p[0]] || {})[dirM] || 0) + (t[1] - X) / 2; }
      });
      comp.push({ borda: [pr.a, pr.b], X1: X1, X2: X2, X: X, modo: modoC, formula: modoC === "equilibrar" ? "X = max(0,8·X1; (X1 + X2)/2) (Eq. 22)" : "maior momento negativo (6118 14.7.6.2)" });
    });
    var res = lajes.map(function (e) {
      var e2 = JSON.parse(JSON.stringify(e)); e2.momentosNegativos = neg[e.id] || null; if (asNeg[e.id]) e2.asNegativa = asNeg[e.id];
      if (pos[e.id] && iso[e.id].ok && iso[e.id].esforcos !== false) {
        var M0 = iso[e.id].entrada && iso[e.id].cargas, base = momentosBase(iso[e.id]);
        e2.positivos = {}; Object.keys(pos[e.id]).forEach(function (k) { e2.positivos[k] = (base[k] || 0) + pos[e.id][k]; });
      }
      return dimensionarLaje(e2, opc);
    });
    var mx = 0; res.forEach(function (r) { if (r.aproveitamento > mx) mx = r.aproveitamento; });
    return { ok: res.every(function (r) { return r.ok; }), rotulo: ROTULO, lajes: res, compatibilizacoes: comp, aproveitamento: mx, naoAtendem: res.filter(function (r) { return !r.atende; }).length, modoCompat: modoC };
  }
  function momentosBase(r) { var o = {}; if (r.esforcos && r.esforcos.Md) Object.keys(r.esforcos.Md).forEach(function (k) { o[k] = r.esforcos.Md[k]; }); return o; }

  /* ---------------------------------------------------------------- 11. LIGAÇÃO COM A C1 (ConcModelo → fração de carga por borda) */
  /* lajeModelo = laje do ConcModelo.montar (ed: [{L, tipo:"simples"|"engastada"|"livre"}...], 4 bordas de um retângulo). Devolve { ok, fracoes:[f0..f3] } na ORDEM das bordas do modelo. */
  function fracoesDoModelo(lm, opc) {
    opc = opc || {};
    var ed = arr(lm && lm.ed);
    if (ed.length !== 4) return { ok: false, motivo: "laje não retangular (" + ed.length + " bordas): fica nas charneiras" };
    var L = ed.map(function (x) { return x.L; }), pares = [[0, 2], [1, 3]];
    if (Math.abs(L[0] - L[2]) > 0.02 * Math.max(L[0], L[2]) || Math.abs(L[1] - L[3]) > 0.02 * Math.max(L[1], L[3])) return { ok: false, motivo: "laje não retangular (lados opostos diferentes): fica nas charneiras" };
    var curtas = L[0] <= L[1] ? [0, 2] : [1, 3], longas = L[0] <= L[1] ? [1, 3] : [0, 2];
    var lx = Math.min(L[0], L[1]), ly = Math.max(L[0], L[1]);
    /* bordas ⟂x têm comprimento ℓy (as longas); ⟂y têm comprimento ℓx (as curtas) */
    var e = { id: lm.id, lx: lx, ly: ly, h: num(lm.h, 0.1), fck: 25, caa: 2, g: 1, q: 0, balanco: !!lm.balanco, umaDirecao: !!lm.umaDirecao || lm.tipo === "trelicada" || lm.tipo === "steel-deck" || lm.tipo === "painel-wall",
              bordas: { x: [ed[longas[0]].tipo, ed[longas[1]].tipo], y: [ed[curtas[0]].tipo, ed[curtas[1]].tipo] } };
    var cl = classificar(lx, ly), r = { ok: true };
    var edgeIdx = { x1: longas[0], x2: longas[1], y1: curtas[0], y2: curtas[1] };
    var umaDir = cl.tipo === "uma-direcao" || e.balanco || e.umaDirecao, edges = [];
    if (umaDir) {
      var cu = casoUmaDirecao(e.bordas.x[0], e.bordas.x[1]);
      if (!cu.ok) return { ok: false, motivo: cu.motivo };
      var K = umaDirecao(cu.caso, 1, lx, 0);
      [0, 1].forEach(function (k) { var t = tipoDe(e.bordas.x[k]); edges.push({ id: "x" + (k + 1), V: cu.caso === "balanco" ? (t === "engastada" ? K.Vmaior : 0) : (cu.caso === "apoiada-engastada" ? (t === "engastada" ? K.Vmaior : K.Vmenor) : K.Vmaior), comp: ly }); });
      [0, 1].forEach(function (k) { var t = tipoDe(e.bordas.y[k]); edges.push({ id: "y" + (k + 1), V: t === "livre" || e.balanco ? 0 : cv("lajeCargaViga1DirecaoFator", 0.15) * lx, comp: lx }); });
    } else {
      var tb = tipoBares(e.bordas); if (!tb.ok) return { ok: false, motivo: tb.motivo };
      var rd = reacoesDuasDirecoes(tb.tipo, lx, ly, 1, opc.tabela || "interpolar"); if (!rd.ok) return { ok: false, motivo: rd.motivo };
      [["x", 0], ["x", 1], ["y", 0], ["y", 1]].forEach(function (a) { var t = tb[a[0] === "x" ? "bx" : "by"][a[1]], col = "v" + a[0] + (t === "engastada" ? "l" : ""); edges.push({ id: a[0] + (a[1] + 1), V: rd.V[col], comp: a[0] === "x" ? ly : lx }); });
    }
    var tot = 0; edges.forEach(function (x) { if (isFinite(x.V) && x.V > 0) tot += x.V * x.comp; });
    if (!(tot > 0)) return { ok: false, motivo: "nenhuma borda recebe reação" };
    var fr = [0, 0, 0, 0];
    edges.forEach(function (x) { fr[edgeIdx[x.id]] = isFinite(x.V) && x.V > 0 ? x.V * x.comp / tot : 0; });
    return { ok: true, fracoes: fr, tipo: umaDir ? "uma direção" : "Bares " + tipoBares(e.bordas).tipo, razaoEquilibrio: tot / (lx * ly), lx: lx, ly: ly };
  }

  /* catálogo de lajes pré-fabricadas treliçadas (js/lajespre.js): menor altura que atende ao vão e à sobrecarga, com a fonte (nunca interpola: vão e carga arredondados PARA CIMA).
   * e.catalogo = { tipo?: "trelicada-eps"|"trelicada-ceramica", fabricante?, hMinCm?, hMaxCm? }; e.revestimentoKgfM2 (permanente adicional; sem ele a tabela fica com o que ela já admite). */
  function escolhaCatalogo(e, L, hCm) {
    var cat = e.catalogo || {}, tipoLj = cat.tipo || e.tipoLaje || "";
    /* LAJES MISTAS/SECAS (14/11/2026): "steel-deck" e "painel-wall" leem o catálogo do js/lajesmista.js, no mesmo encaixe da treliçada; no Painel Wall o "vão" é o espaçamento dos apoios */
    var misto = tipoLj === "steel-deck" || tipoLj === "painel-wall";
    var LP = misto ? dep("LajesMista", "./lajesmista.js") : dep("LajesPre", "./lajespre.js"); if (!LP || !LP.escolher) return null;
    var tipos = misto ? [tipoLj] : (cat.tipo ? [cat.tipo] : ["trelicada-eps", "trelicada-ceramica"]), todas = [], avisos = [], vistos = {}, k;
    var par = { vaoM: L, sobrecargaKnM2: num(e.q, 0), apoio: "simples", fabricante: cat.fabricante, hMinCm: cat.hMinCm, hMaxCm: cat.hMaxCm };
    if (e.revestimentoKgfM2 != null) par.revestimentoKgfM2 = num(e.revestimentoKgfM2, 0);
    tipos.forEach(function (t) {
      par.tipo = t; var r = LP.escolher(par);
      r.atendem.forEach(function (x) { todas.push(x); });
      (r.avisos || []).forEach(function (a) { if (!vistos[a.codigo]) { vistos[a.codigo] = 1; avisos.push(misto ? "Catálogo (" + tipoLj + "): " + a.texto : "Catálogo (NBR 14859-1:2002 6.3.1): " + a.texto); } });
    });
    function pesoKgf(x) { var p = x.quantitativos && x.quantitativos.publicado; if (!p) return 0; return p.pesoProprioKgfM2 != null ? p.pesoProprioKgfM2 : (p.pesoProprioKnM2 != null ? p.pesoProprioKnM2 * 101.972 : 0); }   /* a Metform imprime kN/m²; a Perfilor, kgf/m² */
    todas.sort(function (a, b) { return (a.h - b.h) || (pesoKgf(a) - pesoKgf(b)); });
    var resumo = function (x) { return { serie: x.serie, designacao: x.designacao, fabricante: x.fabricante, h: x.h, enchimento: x.enchimento, fonte: x.resultado.fonte, armaduraAdicional: x.resultado.armaduraAdicional || null, vaoTabelaM: x.resultado.vaoTabelaM || null,
                                           cargaTabelaKgfM2: x.resultado.cargaTabelaKgfM2 || null, pesoProprioKgfM2: x.quantitativos && x.quantitativos.publicado ? (x.quantitativos.publicado.pesoProprioKgfM2 != null ? x.quantitativos.publicado.pesoProprioKgfM2 : (x.quantitativos.publicado.pesoProprioKnM2 != null ? Math.round(x.quantitativos.publicado.pesoProprioKnM2 * 101.972 * 10) / 10 : null)) : null }; };
    var out = { origem: misto ? "catálogo de fabricantes (js/lajesmista.js, LajesMista.escolher)" : "catálogo de fabricantes (js/lajespre.js, LajesPre.escolher)", ok: todas.length > 0, tipos: tipos, vaoM: L, sobrecargaKnM2: num(e.q, 0), hAdotadaCm: hCm, avisos: avisos, nAtendem: todas.length, atendem: todas.slice(0, 8).map(resumo), rotulo: (LP.dados() && LP.dados().rotulo) || "" };
    if (out.ok) { out.melhor = resumo(todas[0]); out.razao = out.melhor.h / hCm; out.fonte = out.melhor.fonte; } else out.motivo = "todas as séries: vão ou carga fora da tabela, ou célula 'N/A' do fabricante";
    return out;
  }

  /* ---------------------------------------------------------------- 12. LAJE TRELIÇADA / NERVURADA: nervura = viga T */
  /* e = { id, vao (m, biapoiada) | caso, h (m total), hf (m, capa), bw (cm nervura), b (m, entre eixos), fck, caa, g (kN/m², TOTAL com enchimento), q, psi2,
   *       fabricante?: { vaoMaxM, descricao } (tabela do fabricante, entrada do usuário; sem ela vale o catálogo com fonte — escolhaCatalogo), catalogo?: {...}, revestimentoKgfM2? } */
  function trelicada(e, opc) {
    opc = opc || {};
    var Vg = VG(), R = [], out = { id: e.id, ok: true, avisos: [], pendencias: [], passos: R, rotulo: ROTULO, verificacoes: [] };
    var mat = Vg.material(e.fck, e.fyk, opc); if (!mat.ok) { out.ok = false; out.motivo = mat.motivo; return out; }
    var b = num(e.b, 0) * 100, hf = num(e.hf, 0) * 100, h = num(e.h, 0) * 100, bw = num(e.bw, 0), L = num(e.vao, 0);
    if (!(b > 0 && hf > 0 && h > hf && bw > 0 && L > 0)) { out.ok = false; out.motivo = "informe vao, h, hf, bw (cm) e b (entre eixos)"; return out; }
    if (b > cv("lajeNervEntreEixosLimiteCm", 110)) { out.ok = false; out.motivo = "entre eixos > 110 cm: a mesa deve ser projetada como laje maciça apoiada na grelha de vigas (13.2.4.2-c) — fora da C3"; return out; }
    var l0 = b - bw, mesaMin = Math.max(l0 * cv("lajeNervMesaMinFracaoL0", 1 / 15), cv("lajeNervMesaMinCm", 4));
    passo(R, "nv.mesa", "Espessura mínima da mesa", mesaMin, "cm", "max(ℓ0/15; 4 cm), ℓ0 = " + fmt(l0, 1) + " cm", "NBR 6118 13.2.4.2");
    if (hf < mesaMin - 1e-9) out.avisos.push("Mesa de " + fmt(hf, 1) + " cm abaixo do mínimo " + fmt(mesaMin, 1) + " cm (13.2.4.2).");
    if (bw < cv("lajeNervuraLarguraMinCm", 5) - 1e-9) out.avisos.push("Nervura com " + fmt(bw, 1) + " cm: mínimo 5 cm (13.2.4.2).");
    var gF = cv("gammaG_normal_desfavoravel", 1.4), qF = cv("gammaQ_normal", 1.4), g = num(e.g, 0), q = num(e.q, 0), psi2 = num(e.psi2, 0.3);
    var pd = (gF * g + qF * q) * b / 100, pRara = (g + q) * b / 100, pQP = (g + psi2 * q) * b / 100;             /* kN/m por nervura */
    var Md = pd * L * L / 8 * 100, Ma = pRara * L * L / 8 * 100;                                                  /* kN·cm */
    if (e.MkNervura != null) { Md = gF * Number(e.MkNervura) * 100; Ma = Number(e.MkNervura) * 100; passo(R, "nv.Mk", "Momento característico por nervura INFORMADO (ex.: de laje em cruz pelas tabelas de Bares)", Number(e.MkNervura), "kN·m", "Mk informado × b", "entrada do usuário"); }
    passo(R, "nv.pd", "Carga de cálculo por nervura", pd, "kN/m", "pd = (γg·g + γq·q)·b", "NBR 6118 11.8");
    passo(R, "nv.Md", "Momento de cálculo por nervura (biapoiada)", Md / 100, "kN·m", "Md = pd·ℓ²/8", "estática");
    var cob = cobrimentoLaje(num(e.caa, 2)), d = e.d != null ? Number(e.d) : h - cob - num(e.phiMm, 8) / 20 - num(e.phiEstMm, 5) / 10, sec = { bw: bw, h: h, d: d, dl: 4, bf: b, hf: hf };
    var fl = Vg.flexao(sec, Md, mat); if (!fl.ok) { out.ok = false; out.motivo = fl.motivo; return out; }
    fl.passos.forEach(function (p) { R.push(p); });
    var amin = Vg.asMin(sec, mat, { mesaComprimida: true }); passo(R, "nv.AsMin", "Armadura mínima da nervura (seção T)", amin.As, "cm²/nervura", "As,mín (17.3.5.2.1)", "NBR 6118 17.3.5.2.1");
    var AsReq = Math.max(fl.As, amin.As);
    var rr = Vg.resistente(sec, AsReq, 0, mat);
    var fle = Vg.flecha(sec, AsReq, 0, Ma, mat, { caso: { tipo: "biapoiada", p: pQP / 100, L: L * 100 }, L: L * 100, t: e.t, t0: e.t0, limite: e.limiteFlecha });
    out.nervura = { Md: Md, d: d, As: fl.As, AsMin: amin.As, AsReq: AsReq, modo: fl.modo, x: fl.x, Mrd: rr.Mrd, razaoFlexao: Md / rr.Mrd };
    out.verificacoes.push({ nome: "Flexão da nervura", valor: Md / rr.Mrd, detalhe: "Md/MRd com As,req = " + fmt(r2(AsReq), 2) + " cm²" });
    if (fle.ok) { out.flecha = fle; out.verificacoes.push({ nome: "Flecha total", valor: fle.razao, detalhe: "at = " + fmt(r2(fle.at), 2) + " cm; limite " + fmt(r2(fle.limite), 2) + " cm" }); fle.passos.forEach(function (p) { R.push(p); }); }
    var mx = 0; out.verificacoes.forEach(function (v) { if (v.valor > mx) mx = v.valor; });
    /* tabela do fabricante: 1º a entrada do usuário (e.fabricante); sem ela, o CATÁLOGO com fonte (js/lajespre.js → LajesPre.escolher, séries Puma 2019, Belgo 2007, Construrohr 2017) */
    if (e.fabricante && e.fabricante.vaoMaxM != null) {
      var rz = L / e.fabricante.vaoMaxM; out.fabricante = { vaoMaxM: e.fabricante.vaoMaxM, razao: rz, descricao: e.fabricante.descricao || "", origem: "entrada do usuário (tabela do fabricante)" };
      out.verificacoes.push({ nome: "Altura pela tabela do fabricante (entrada do usuário)", valor: rz, detalhe: "vão " + fmt(L, 2) + " m / vão máximo informado " + fmt(e.fabricante.vaoMaxM, 2) + " m" }); if (rz > mx) mx = rz;
    } else {
      var cat = escolhaCatalogo(e, L, h);
      if (!cat) out.pendencias.push("Altura da laje treliçada pela tabela do fabricante: catálogo de lajes pré-fabricadas (js/lajespre.js) ausente — informe vão máximo, altura e carga do fabricante (entrada do usuário); o motor só verificou a nervura como viga T (flexão, flecha).");
      else {
        out.fabricante = cat; cat.avisos.forEach(function (a) { out.avisos.push(a); });
        if (cat.ok) { out.verificacoes.push({ nome: "Altura pela tabela do fabricante (catálogo: " + cat.melhor.designacao + ")", valor: cat.razao, detalhe: "menor altura do catálogo que atende (" + fmt(cat.melhor.h, 1) + " cm) / altura adotada " + fmt(h, 1) + " cm — " + cat.melhor.fonte }); if (cat.razao > mx) mx = cat.razao; }
        else out.pendencias.push("Nenhuma série treliçada do catálogo (Puma 2019, Belgo 2007, Construrohr 2017) atende vão " + fmt(L, 2) + " m com sobrecarga " + fmt(num(e.q, 0), 2) + " kN/m² (" + cat.motivo + "): consulte o fabricante (e o ensaio do conjunto, NBR 14859-1:2002 6.3.1); o motor só verificou a nervura como viga T (flexão, flecha).");
      }
    }
    out.pendencias.push("Cisalhamento da nervura, ancoragem, armadura de distribuição da capa (≥ 1,5 cm²/m, 18.3.7) e nervuras transversais: não calculados na C3.");
    out.pendencias = out.pendencias.concat(D() ? D().semFonte().map(function (x) { return "SEM FONTE: " + x.chave + " (" + x.item + ")"; }) : []);
    out.aproveitamento = mx; out.atende = out.ok && mx <= 1 + 1e-9;
    return out;
  }

  var ConcLaje = {
    classificar: classificar, vaoEfetivo: vaoEfetivo, vinculacaoParcial: vinculacaoParcial, tipoBares: tipoBares, coef: coef,
    momentosDuasDirecoes: momentosDuasDirecoes, reacoesDuasDirecoes: reacoesDuasDirecoes, alfaFlecha: alfaFlecha,
    casoUmaDirecao: casoUmaDirecao, umaDirecao: umaDirecao, compatNegativo: compatNegativo, cobrimentoLaje: cobrimentoLaje, gammaN: gammaN,
    espessuraMinima: espessuraMinima, estimarAltura: estimarAltura, escolherBarras: escolherBarras, armar: armar, cortante: cortante,
    flecha: flecha, fissuracao: fissuracao, dimensionarLaje: dimensionarLaje, dimensionarPavimento: dimensionarPavimento,
    fracoesDoModelo: fracoesDoModelo, trelicada: trelicada
  };
  global.ConcLaje = ConcLaje;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcLaje;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

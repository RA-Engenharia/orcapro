/* =====================================================================
 * madt3tusaidas.js — T3TU (telhado de 4 águas em planta ORTOGONAL em T e U, com um rincão em cada canto côncavo): ETAPA 3a (ligar ao sistema).
 * RODAR no worker (dimensionamento pelo laço de crescimento do madt3tucalc.js + base dos pilares + reações nas paredes + orçamento POR PEÇAS) e MEMORIAL genérico.
 * Motor PURO, ES5, Node-testável. Arquivo novo: não altera madt3l*.js, madorcamento, madengsaidas.
 *
 * O QUE NÃO ESTÁ (declarado, nunca silenciado — vai para a ETAPA 3b):
 *   · PRANCHAS detalhadas do T/U (planta, cortes, tesouras, rincões, fichas de corte): pranchas() devolve { ok: false } com a mensagem; nenhuma folha é gerada (nada de prancha vazia ou errada);
 *   · VERIFICAÇÃO DETALHADA das ligações dos nós (as camadas madt3llig.js/madt3lig.js são específicas do L): os pinos, chapas e parafusos do orçamento (02.03 a 02.05) saem de `ligacoesNosTU` (grupo de pinos + chapa de cada
 *     tipo de nó, pelas mesmas funções do L, com os esforços do T/U) × `contagemNos` (o contador geométrico do L, com ajustes para vários cantos côncavos); sem os módulos, as linhas saem PENDENTE e o orçamento PARCIAL;
 *   · auditor de encontros (folgas ≥ 10 mm) e manual de montagem.
 * Preços e códigos: o MESMO mapeamento de chaves do L (MadOrcamento.preco: mlc, frete, montagem, aco_galv, chumb20, pino16, inox_kg, telha_cer, rufo, calha…); nenhum código SINAPI é inventado.
 * Fontes e decisões: docs/madeira/T3TU-REFERENCIA.md.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var br = function (x, n) { return (n == null ? Number(x || 0).toFixed(2) : Number(x || 0).toFixed(n)).replace(".", ","); }, copia = function (x) { return JSON.parse(JSON.stringify(x)); }, norm = function (a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); };
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r(x, n) { var p = Math.pow(10, n); return Math.round(x * p + (x >= 0 ? 1e-9 : -1e-9)) / p; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var FAIXA = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";
  var MSG_PRANCHAS = "Pranchas detalhadas do T/U (planta, cortes, tesouras, rincões e fichas de corte): próxima versão. Nenhuma prancha foi gerada, para não sair desenho vazio ou errado; o cálculo, as reações nas paredes, o orçamento por peças e o memorial já valem.";
  var NOMES = { P: "Pilar do perímetro", PO: "Pilar de cabeceira", FR: "Frechal", BS: "Banzo superior da tesoura", BI: "Banzo inferior da tesoura", PD: "Montante da tesoura", DG: "Diagonal da tesoura", MS: "Banzo superior da meia-tesoura", MI: "Banzo inferior da meia-tesoura", MP: "Montante da meia-tesoura", MG: "Diagonal da meia-tesoura", E: "Espigão", RC: "Rincão", CB: "Caibro de meio", T: "Terça", CM: "Cumeeira", LB: "Linha do banzo inferior", DX: "Diagonal de contraventamento (águas)", DV: "Diagonal de contraventamento (vertical)", DP: "Diagonal de contraventamento (parede)" };

  /* ---------------------------------------------------------------- PEÇAS (por seção e comprimento) */
  /** lista de peças da MADEIRA: uma marca por (grupo, comprimento, seção); volume = b × h × L × quantidade */
  function pecasDe(membros, sec, classe) {
    var nomeClasse = String(classe || "mlc:GL24h").split(":")[1] || "GL24h", mat = "MLC " + nomeClasse + " (EN 14080)", marcas = {}, ordem = [], out = [], cont = {};
    arr(membros).forEach(function (m) {
      if (!NOMES[m.g]) return;
      var s = sec[m.g === "DV" ? "DX" : m.g]; if (!s || !(s.b > 0) || !(s.h > 0)) return;
      var L = norm(m.p0, m.p1), key = [m.g, r(L, 3), s.b, s.h].join("|");
      if (!marcas[key]) { marcas[key] = { m: m, qtd: 0, sec: s, L: L }; ordem.push(key); }
      marcas[key].qtd++;
    });
    ordem.forEach(function (key) {
      var o = marcas[key], m = o.m, s = o.sec; cont[m.g] = (cont[m.g] || 0) + 1;
      out.push({ id: m.g + cont[m.g], marca: m.g, grupo: "T3TU — " + NOMES[m.g], descricao: NOMES[m.g], material: mat, especificacao: "MLC " + nomeClasse + " " + r(s.b * 100, 0) + "×" + r(s.h * 100, 0) + " cm", secao: { tipo: "ret", b: s.b, h: s.h },
        p0: m.p0.map(function (v) { return r(v, 4); }), p1: m.p1.map(function (v) { return r(v, 4); }), qtd: o.qtd, unidade: "peça", comprimento_m: r(o.L, 3), volume_m3: r(s.b * s.h * o.L * o.qtd, 4) });
    });
    return out;
  }

  /* ---------------------------------------------------------------- REAÇÕES NAS PAREDES (equilíbrio conferido) */
  /** Reação vertical CARACTERÍSTICA de G1, G2 e Q em cada apoio (análise linear do mesmo modelo), a reação de CÁLCULO (ELU, envoltória) e a conferência Σ reações = Σ cargas (±1 %).
   *  Devolve { apoios: [{ apoio, x, z, G1, G2, Q, kN, Nmin, Hmax }], soma: {G1,G2,Q}, cargas: {G1,G2,Q}, erro: {G1,G2,Q}, ok } — x, z no quadro da estrutura (origem no canto da barra). */
  function reacoesParedes(rr) {
    var AN = dep("AcoAnalise", "./acoanalise.js"), M = rr.modelo, casos = arr(rr._casos).filter(function (k) { return k.id === "G1" || k.id === "G2" || k.id === "Q"; });
    if (!AN || !M || !casos.length) return { apoios: [], soma: null, cargas: null, erro: null, ok: false, motivo: "sem o modelo do solver para conferir as reações" };
    var ra = AN.analisar({ nos: M.nos, barras: M.barras, apoios: M.apoios, casos: casos.map(function (k) { return { id: k.id, cargas: k.cargas }; }) }, { combinacoes: [{ id: "G1", fatores: { G1: 1 } }, { id: "G2", fatores: { G2: 1 } }, { id: "Q", fatores: { Q: 1 } }], estacoes: 3, comPCG: true });
    if (!ra.ok) return { apoios: [], soma: null, cargas: null, erro: null, ok: false, motivo: "análise das reações característica falhou" };
    var pp = 0; M.barras.forEach(function (b) { pp += (b.tracao ? 0 : b.secao.A * b.L * b.pesoEsp); });
    var cargas = { G1: pp, G2: -rr.cargasTotais.G2[1], Q: -rr.cargasTotais.Q[1] }, soma = { G1: 0, G2: 0, Q: 0 }, porMem = {}, apoios = [];
    M.G.membros.forEach(function (m) { porMem[m.id] = m; });
    M.apoios.forEach(function (ap) {
      var mem = porMem[ap.mem], R = rr.reacoes[ap.no] || {}, o = { apoio: ap.mem, x: r(mem ? mem.p0[0] : 0, 3), z: r(mem ? mem.p0[1] : 0, 3), g: ap.grupo, G1: 0, G2: 0, Q: 0, kN: r(R.Nmax || 0, 3), Nmin: r(R.Nmin || 0, 3), Hmax: r(R.Hmax || 0, 3) };
      ["G1", "G2", "Q"].forEach(function (k) { var Rk = ra.combinacoes[k].reacoes[ap.no]; if (Rk) { o[k] = r(Rk[1], 3); soma[k] += Rk[1]; } });
      apoios.push(o);
    });
    var erro = {}, ok = true; ["G1", "G2", "Q"].forEach(function (k) { erro[k] = Math.abs(cargas[k]) > 1e-9 ? Math.abs(soma[k] - cargas[k]) / Math.abs(cargas[k]) : 0; if (!(erro[k] <= 0.01)) ok = false; soma[k] = r(soma[k], 3); cargas[k] = r(cargas[k], 3); erro[k] = r(erro[k], 5); });
    return { apoios: apoios, soma: soma, cargas: cargas, erro: erro, ok: ok };
  }
  /** cargasNasParedes no formato do laço do madcobertura (apoio, kN, vigas): um registro por pilar da estrutura (x, z no quadro da estrutura); o madcobertura agrega por parede do modelo */
  function cargasNasParedes(rp) {
    return arr(rp && rp.apoios).map(function (a) { return { apoio: a.apoio, kN: a.kN, vigas: 1, x: a.x, z: a.z, kNk: r(a.G1 + a.G2 + a.Q, 3) }; });
  }

  /* ---------------------------------------------------------------- LIGAÇÕES DOS NÓS (só o que o ORÇAMENTO precisa: pinos e chapas por tipo de nó) */
  /** Dimensiona, com os esforços do PRÓPRIO T/U, o grupo de pinos + chapa de cada TIPO de nó, pelas MESMAS funções e fórmulas do L (madt3llig.js: `lLigacoes`) — pacote da tesoura (ML.pacoteT2), espigão × cumeeira,
   *  espigão × canto, cinta, rincão (ápice e pé), espigão interno, caibro de meio, nós da meia-tesoura, ponta da MI, terça × espigão (esforço axial) e emenda da terça. NÃO refaz as verificações de detalhe do L
   *  (f90, torção do frechal, chapa única do canto, folgas do aparo, auditor): isso é a etapa 3b. Hipótese: vento local de aresta pela asa MAIS LARGA (governa a V_terça e a V_sela).
   *  Devolve { ligacoes: { chave: { pinos, banzo?, chapa } }, avisos } (formato de `gruposDe` do L). */
  function ligacoesNosTU(q, sec, rr, G) {
    var TL = dep("MadT3L", "./madt3l.js"), L3m = dep("MadT3Lig", "./madt3lig.js"), C3 = dep("MadT3Calc", "./madt3calc.js"), LL = dep("MadT3LLig", "./madt3llig.js");
    if (!TL || !L3m || !C3 || !LL) return { ligacoes: {}, avisos: ["ligações dos nós não calculadas: módulos madt3l/madt3lig/madt3llig ausentes"], ok: false };
    var Dm = TL._util.D(), ML = Dm.ML, MM = Dm.MM, cl = MM.classe2022(q.classe), agg = {}, perf = C3.perfilFn(q), p = q.params, I = G.info, noChapa = L3m.noChapa, noChapaM = L3m.noChapaM, tg = p.incl, k0, RAX;
    Object.keys(rr.reacoes).forEach(function (k) { var o = rr.reacoes[k], a1 = agg.P || (agg.P = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, NminEq: 1e9, HmaxEq: 0 }); a1.Nmax = Math.max(a1.Nmax, o.Nmax); a1.Nmin = Math.min(a1.Nmin, o.Nmin); a1.Hmax = Math.max(a1.Hmax, o.Hmax); a1.NminEq = Math.min(a1.NminEq, o.NminEq); a1.HmaxEq = Math.max(a1.HmaxEq, o.HmaxEq); });
    var c = { kmod: rr.kmodRef, kmod1: rr.kmod1Ref, kmod2: rr.kmod2Ref, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" }, cc = ML.cfg(c), Lp0 = Math.abs(p.peDireito), pesoPil = { P: Math.max(sec.P.b * sec.P.h * Lp0 * q.pesoMLC, sec.PO.b * sec.PO.h * Lp0 * q.pesoMLC) };
    /* ângulos de abertura da diagonal Howe (só se a tesoura for Howe): o pior de todas as asas (A: tesoura ao longo de Z; pernas: ao longo de X, vão = largura da perna) */
    var howe = null;
    if (p.tesoura.tipo === "howe") {
      var bs = 0, bi = 0; G.membros.forEach(function (m) {
        if (m.g !== "DG" || m.tes !== 0) return; var lg = null; arr(p.legs).forEach(function (Lg) { if (Lg.asa === m.asa) lg = Lg; });
        var ci = lg ? 0 : 1, span = lg ? lg.w : p.b, off = lg ? lg.xl : 0, hb = span / 2, top = m.p0[2] > m.p1[2] ? m.p0 : m.p1, bot = top === m.p0 ? m.p1 : m.p0, dz = bot[ci] - top[ci], dy = bot[2] - top[2], Ld = Math.sqrt(dz * dz + dy * dy) || 1, sg = (top[ci] - off) < hb ? 1 : -1, Lu = Math.sqrt(1 + p.incl * p.incl);
        bs = Math.max(bs, Math.acos(Math.min(1, Math.abs(dz * sg + dy * p.incl) / (Ld * Lu)))); bi = Math.max(bi, Math.acos(Math.min(1, Math.abs(dz) / Ld)));
      }); howe = { betaBS: bs, betaBI: bi };
    }
    var esf = copia(rr.esf); ["BS", "BI", "PD", "DG", "T"].forEach(function (g) { if (!esf[g]) esf[g] = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }; });
    var L = ML.pacoteT2({ howe: howe, sistema: "tesoura", pesoPilar: pesoPil, secoes: sec, cfg: c, esf: esf, reacoes: agg, incl: p.incl, contrav: rr.contrav || null, f90Perp: rr.f90Perp || null, mat: { fc90k: cl.fc90k, fc0k: cl.fc0k, kmod90: perf("longa").kmod } });
    function eqv(x, k) { return x && x[k + "Eq"] != null ? x[k + "Eq"] : (x && x[k]) || 0; }
    k0 = ML.PARAFUSOS["WT-T-8,2"]; RAX = ML.roscaRaxd({ Rk_ref: k0.RaxK_cruzado150, lefRef: k0.lefRef, lefA: k0.lefRef * 0.8, lefB: k0.lefRef * 0.8, kmod: cc.kmod }).Rd;
    /* vento local de aresta: a asa mais larga governa (V cresce com a largura); passa pelo MESMO cálculo do L (MadT3LLig.ventoLocal) com b = barra e bb = a perna mais larga */
    var wMax = 0; arr(p.legs).forEach(function (Lg) { wMax = Math.max(wMax, Lg.w); });
    var vl = LL.ventoLocal(q, rr, { p: p, info: { incl: I.incl, sc: I.sc, dz: I.dz, beiral: I.beiral, b: p.b, bb: wMax || p.b } });
    var E = rr.espigao, Sa = Math.max(0.05, E.apice.S || 0), Seqa = Math.max(0.05, E.apice.SEq || 0);
    L.ligacoes.espigaoCumeeira = noChapa(ML, cc, "espigão × cumeeira (ponta)", Math.max(0.05, E.apice.N), Math.max(0.05, E.apice.NEq), Sa, Seqa, sec.E, {});
    var tgH = tg / Math.SQRT2, cosH = 1 / Math.sqrt(1 + tgH * tgH), Sh = Math.max(0.05, E.heel.S || 0, vl.V_sela * cosH), Seqh = Math.max(0.05, E.heel.SEq || 0, vl.V_sela * cosH), Nh = Math.max(0.05, E.heel.N), Nheq = Math.max(0.05, E.heel.NEq);
    L.ligacoes.espigaoCanto = noChapa(ML, cc, "espigão × canto (assentado no cruzamento dos frechais)", Nh, Nheq, Sh, Seqh, sec.E, {});
    var fim = rr.cinta.fim || { N: rr.cinta.N, NEq: rr.cinta.NEq, S: 0, SEq: 0 };
    L.ligacoes.cintaCanto = noChapaM(ML, cc, "cinta do canto (frechal × frechal)", Math.max(0.05, fim.N), Math.max(0.05, fim.NEq), Math.max(0.05, fim.S), Math.max(0.05, fim.SEq), 0, sec.FR, {});
    var mt = rr.meia, Sm = Math.max(0.05, mt.V || 0), Smeq = Math.max(0.05, mt.VEq || 0);
    L.ligacoes.meiaTesoura = noChapa(ML, cc, "meia-tesoura × tesoura de extremidade (cume)", Math.max(0.05, mt.N), Math.max(0.05, mt.NEq), Sm, Smeq, sec.MS, {});
    /* ponta da MI: grupo na MI (axial) + grupo no BI (força ⊥ às fibras) — como no L */
    var pmi = rr.pontaMI || { N: 0, NEq: 0, S: 0, SEq: 0, PD: 0, PDEq: 0, R: 0, REq: 0 }, tChM = 0.008;
    var gMI = noChapaM(ML, cc, "ponta da MI (grupo na MI, axial)", Math.max(0.05, pmi.N), Math.max(0.05, pmi.NEq), Math.max(0.05, pmi.S), Math.max(0.05, pmi.SEq), 0, sec.MI, {});
    var pBI = L3m.pinosMom(ML, cc, "ponta da MI no BI (força ⊥ às fibras: MI ⊕ montante)", 0, Math.max(0.05, pmi.REq), 0, sec.BI.b, sec.BI.h, tChM), chBI = L3m.chapaNBR8800(cc, pBI, tChM, Math.max(0.03, sec.BI.h - 0.05), Math.max(0.05, pmi.R), Math.max(0.05, pmi.REq));
    L.ligacoes.pontaMI = { pinos: gMI.pinos, chapa: gMI.chapa, banzo: { BI: { pinos: pBI, chapa: chBI } } };
    var RCr = rr.rincao || { heel: { N: 0, NEq: 0, S: 0, SEq: 0, V: 0, H: 0 }, apice: { N: 0, NEq: 0, S: 0, SEq: 0 }, cintaC: { N: 0, NEq: 0, S: 0, SEq: 0 } }, secRC = sec.RC || sec.E;
    L.ligacoes.rincaoApice = noChapa(ML, cc, "rincão × cumeeira / espigão interno (vértice V)", Math.max(0.05, RCr.apice.N), Math.max(0.05, RCr.apice.NEq), Math.max(0.05, RCr.apice.S), Math.max(0.05, RCr.apice.SEq), secRC, {});
    var cintaC = RCr.cintaC || { N: 0, NEq: 0, S: 0, SEq: 0 }, NhR = Math.max(0.05, RCr.heel.N, cintaC.N), NhReq = Math.max(0.05, RCr.heel.NEq, cintaC.NEq), ShR = Math.max(0.05, RCr.heel.S), ShReq = Math.max(0.05, RCr.heel.SEq);
    L.ligacoes.rincaoCanto = noChapa(ML, cc, "rincão × canto côncavo (sela de aço sobre o cruzamento dos frechais)", NhR, NhReq, ShR, ShReq, secRC, {});
    var E6 = rr.espigao6 || { heel: { N: 0, NEq: 0, S: 0, SEq: 0 }, apice: { N: 0, NEq: 0, S: 0, SEq: 0 } };
    if (G.membros.some(function (m) { return m.g === "E" && m.interior; })) L.ligacoes.espigaoInterno = noChapa(ML, cc, "espigão interno (vértice × topo da cumeeira)", Math.max(0.05, E6.heel.N, E6.apice.N), Math.max(0.05, E6.heel.NEq, E6.apice.NEq), Math.max(0.05, E6.heel.S, E6.apice.S), Math.max(0.05, E6.heel.SEq, E6.apice.SEq), sec.E, {});
    var eCB = rr.esf.CB || { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 };
    if (G.membros.some(function (m) { return m.g === "CB"; })) L.ligacoes.caibroMeio = noChapa(ML, cc, "caibro de meio da cabeceira (pé sobre o pilar de meio de parede e topo na cumeeira)", Math.max(0.05, eCB.Nt, eCB.Nc), Math.max(0.05, eqv(eCB, "Nt"), eqv(eCB, "Nc")), Math.max(0.05, eCB.V), Math.max(0.05, eqv(eCB, "V")), sec.CB, {});
    [["MS", "nó do banzo superior da meia-tesoura"], ["MI", "nó do banzo inferior da meia-tesoura (tirante)"], ["MP", "nó do montante da meia-tesoura"], ["MG", "nó da diagonal da meia-tesoura"]].forEach(function (x) {
      var e = rr.esf[x[0]]; if (!e) return; var F = Math.max(e.Nt, e.Nc), Fq = Math.max(eqv(e, "Nt"), eqv(e, "Nc"));
      L.ligacoes["no" + x[0]] = noChapa(ML, cc, x[1], Math.max(F, 0.05), Math.max(Fq, 0.05), 0.05, 0.05, sec[x[0]], {});
    });
    var eT = rr.esf.T || { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }, Vt = eT.VEq != null ? eT.VEq : eT.V, Vtu = Math.max(Vt, vl.V_terca), nS, tc;
    for (nS = 2; nS <= 24; nS += 2) { tc = ML.roscaInclinada({ F: Vtu + Vtu * tg, n: nS, anguloGraus: 45, Rax_d: RAX }); if (tc.ok) break; }
    L.ligacoes.tercaEspigao = { porApoio: nS };
    L.ligacoes.tercaEspigaoAxial = noChapa(ML, cc, "terça × espigão (esforço axial da terça pelo estribo)", Math.max(0.05, eT.Nt, eT.Nc), Math.max(0.05, eqv(eT, "Nt"), eqv(eT, "Nc")), Math.max(0.05, eT.V, vl.V_terca), Math.max(0.05, eqv(eT, "V"), vl.V_terca), sec.T, {});
    var Vem = Math.max(0.05, eT.V, vl.V_terca);
    L.ligacoes.emendaTerca = noChapa(ML, cc, "emenda passante da terça no banzo (chapa em fenda; só força axial)", Math.max(0.05, eT.Nt, eT.Nc), Math.max(0.05, eT.NtEq, eT.NcEq), Vem, Math.max(0.05, eT.VEq, vl.V_terca), sec.T, {});
    var falhaLig = Object.keys(L.ligacoes).filter(function (k) { return L.ligacoes[k] && L.ligacoes[k].ok === false; });
    return { ligacoes: L.ligacoes, avisos: falhaLig.map(function (k) { return "ligação " + k + " não fecha"; }), ok: falhaLig.length === 0, falhas: falhaLig, ventoLocal: { V_terca: vl.V_terca, V_sela: vl.V_sela } };
  }
  /** MULTIPLICIDADE de cada tipo de nó pelos membros do T/U: o MESMO contador geométrico do L (`MadT3LSaidas.multGeo`: nº de pontas de barra que chegam a cada nó com a peça hospedeira, 2 grupos por conexão
   *  chapa-a-chapa) com TRÊS ajustes para mais de um canto côncavo (declarados no memorial): (a) espigão interno = os espigões marcados `interior` (o L só conhecia o "E6"); (b) a cinta do frechal sai de TODOS os cantos
   *  côncavos (um rincão por canto, cuja sela leva a compressão do anel; o L tirava 1); (c) caibro de meio = 4 grupos por caibro (o L tem 1 caibro; o U tem 2). */
  function contagemNos(M3, howe) {
    var LS = dep("MadT3LSaidas", "./madt3lsaidas.js"), m = LS && LS.multGeo ? LS.multGeo(M3, !!howe) : null; if (!m) return null;
    var nRC = 0, nCB = 0, nInt = 0, e6L = M3.some(function (x) { return x.id === "E6"; }) ? 2 : 0; M3.forEach(function (x) { if (x.g === "RC") nRC++; if (x.g === "CB") nCB++; if (x.g === "E" && x.interior) nInt++; });
    var pontasE = m.espigaoCumeeira / 2 + e6L, e6n = 2 * nInt;
    m.espigaoCumeeira = 2 * (pontasE - e6n); m.espigaoInterno = 2 * e6n;
    m.cintaCanto = Math.max(0, m.cintaCanto + 2 * (nRC > 0 ? 1 : 0) - 2 * nRC);
    m.caibroMeio = 4 * nCB;
    return m;
  }
  /** pinos e chapas dos nós: Σ (nº de ligações do tipo × pinos do grupo) e kg de chapa 8 mm, como o laço do `orcarT3L` do L (a chapa leva o comprimento do maior grupo e a largura da peça/grupo) */
  function pinosChapasNos(L3, M3, howe, nm) {
    var LS = dep("MadT3LSaidas", "./madt3lsaidas.js"), mult = contagemNos(M3, howe), ALMAS = { noPendural: 1, noDiagonal: 1, noMP: 1, noMG: 1 }, nPinos = 0, kgChapa = 0, nWT = 0, porLig = {};
    if (!mult || !LS) return { ok: false, nPinos: 0, kgChapa: 0, nWT: 0, porLig: {} };
    Object.keys(L3).forEach(function (k) {
      var l = L3[k], m = mult[k] || 0, gs = LS.gruposDe(l), n = 0, comp = 0.2, larg = Math.max(0.03, l.chapa ? l.chapa.largura_mm / 1000 : 0.1);
      if (ALMAS[k] && l.pinos && l.pinos.n) gs = gs.map(function (g) { return g.nome === "peça" ? { nome: "alma (2 pontas)", n: 2 * g.n, pn: g.pn } : g; });
      gs.forEach(function (g) { n += g.n; comp = Math.max(comp, (g.pn && g.pn.comprimento) || 0.2); if (g.pn && g.pn.nc > 1 && g.pn.centroGrupo) larg = Math.max(larg, 2 * g.pn.centroGrupo.a + 4 * g.pn.d); });
      nPinos += m * n; kgChapa += m * 0.008 * larg * (comp + 0.05) * 7850; porLig[k] = { mult: m, grupos: gs.map(function (g) { return { nome: g.nome, n: g.n }; }), pinosPorInstancia: n, total: m * n };
      if (l.f90 && l.f90.reforco && m) nWT += m * l.f90.reforco.parafusos;
    });
    if (L3.tercaTesoura) { var cruz = 0; M3.forEach(function (m) { if (m.g === "T" || m.g === "CM") cruz += (m.nos || []).length; }); nWT += cruz * 4 * L3.tercaTesoura.porApoio; }
    if (L3.tercaEspigao) nWT += nm("T") * 2 * L3.tercaEspigao.porApoio;
    return { ok: true, nPinos: nPinos, kgChapa: kgChapa, nWT: nWT, porLig: porLig, mult: mult };
  }

  /* ---------------------------------------------------------------- ORÇAMENTO por peças */
  function orcarT3TU(e) {
    e = e || {};
    var MO = dep("MadOrcamento", "./madorcamento.js"), pc = e.pecas || [], X = e.extras || {}, sub = e.precos || {}, bdi = e.bdi == null ? MO.BDI_PADRAO : e.bdi, P = e.params || {}, LB = e.ligacoes || {}, M3 = e.membros || [], I = e.info || {}, preco = MO.preco;
    var be = P.beiral || 0, sc = I.sc || Math.sqrt(1 + Math.pow(P.incl || 0.3, 2)), per = e.perimetro || 0;
    function nm(g) { return M3.filter(function (m) { return m.g === g; }).length; }
    var vMlc = 0, aVerniz = 0; pc.forEach(function (p) { if (/MLC/.test(String(p.material || "")) && p.volume_m3) { vMlc += p.volume_m3; aVerniz += MO.areaFaces(p); } });
    /* a BASE dos pilares: o mesmo critério do L (placa de base + chapas em cruz + chumbadores M20), do que a base calculada trouxe */
    var nPil = nm("P") + nm("PO"), pb = LB.placaBase || { dimensoes_mm: [0, 0], chumbadores: { total: 0 } }, lp = (pb.dimensoes_mm || [0, 0])[0] / 1000, tpb = (pb.espessura_mm || 25) / 1000, base = LB.base || { n: 0, comprimento: 0, chapa: { largura_mm: 0 } };
    var kgBase = nPil * (lp * lp * tpb * 7850 + 2 * ((base.chapa && base.chapa.largura_mm) || 0) / 1000 * ((base.comprimento || 0) + 0.10) * 0.016 * 7850), nChumb = nPil * ((pb.chumbadores && pb.chumbadores.total) || 0);
    var mCM = 0, mE = 0, mRC = 0; M3.forEach(function (m) { if (m.g === "CM") mCM += norm(m.p0, m.p1); if (m.g === "E") mE += norm(m.eixo0 || m.p0, m.eixo1 || m.p1); if (m.g === "RC") mRC += norm(m.eixo0 || m.p0, m.eixo1 || m.p1); });
    var aInc = I.areaTotal || 0, perB = per + 8 * be;      /* perímetro do beiral de um polígono ortogonal: perímetro + 8·beiral (convexos − côncavos = 4) */
    var prazo = (X.prazoSemanas != null ? Number(X.prazoSemanas) : 6), hEnc = X.horasEncarregado != null ? Number(X.horasEncarregado) : prazo * 44, hEng = X.horasEngenheiro != null ? Number(X.horasEngenheiro) : Math.round(0.2 * prazo * 44), areaAnd = X.areaAndaime != null ? Number(X.areaAndaime) : r(per * (X.alturaAndaime || 4.5), 0), mesesAnd = X.mesesAndaime != null ? Number(X.mesesAndaime) : 2;
    var itens = [], etapa;
    function L(cod, desc, q, chave, obs) { var pr = preco(chave, sub), qq = r(q, 3); itens.push({ etapa: etapa, codigo: cod, descricao: desc, un: pr.un, qtd: qq, pu: pr.pu, total: r(qq * pr.pu, 2), fonte: pr.fonte, chave: chave, adotado: pr.adotado, editado: pr.editado, obs: obs || "" }); }
    etapa = "01 ESTRUTURA DE MADEIRA (MLC)";
    L("01.01", "Fornecimento de MLC GL24h aplainada — pilares, frechal em anel, tesouras, meias-tesouras, espigões, rincões, terças e cumeeiras", vMlc, "mlc");
    L("01.02", "Frete da madeira até a obra", vMlc, "frete"); L("01.03", "Montagem da estrutura", vMlc, "montagem");
    L("01.04", "Caminhão guindauto para içamento (" + (X.diariasMunck != null ? X.diariasMunck : 3) + " diárias de 8 h)", X.horasMunck != null ? Number(X.horasMunck) : (X.diariasMunck != null ? Number(X.diariasMunck) : 3) * 8, "munck_h");
    L("01.05", "Proteção da madeira aparente: stain/verniz marítimo 3 demãos", aVerniz, "verniz");
    etapa = "02 LIGAÇÕES E FERRAGENS";
    L("02.01", "Peças de aço galvanizado a fogo — bases engastadas dos pilares (placa + chapas em cruz)", kgBase, "aco_galv");
    L("02.02", "Chumbadores M20 inox A4-70 com ancoragem química", nChumb, "chumb20");
    var howeO = P.tesoura && P.tesoura.tipo === "howe", PC = e.ligacoesNos && e.ligacoesNos.ligacoes ? pinosChapasNos(e.ligacoesNos.ligacoes, M3, howeO, nm) : { ok: false, nPinos: 0, kgChapa: 0, nWT: 0, porLig: {} }, estLig = PC.ok ? "quantidade pelo critério de contagem do L (nº de ligações por tipo de nó × pinos do grupo dimensionado com os esforços do T/U)" : "PENDENTE: ligações dos nós não calculadas";
    L("02.03", "Pinos inox dos nós (TODOS os grupos de pinos de cada nó: tesouras, meias-tesouras, espigões, rincões, cinta, contraventamento); os de Ø10 e Ø12 orçados ao preço do Ø16" + (PC.ok ? "" : " — PENDENTE"), PC.nPinos + nPil * (2 * (base.n || 0)), "pino16", estLig);
    L("02.04", "Chapas internas de aço inox 8 mm dos nós (inclui selas, cintas do canto, rincões e a ponta da MI)" + (PC.ok ? "" : " — PENDENTE"), PC.kgChapa, "inox_kg", estLig);
    L("02.05", "Parafusos SFS WT-T 8,2×300 (terça × tesoura, terça × espigão e reforço do fendilhamento)" + (PC.ok ? "" : " — PENDENTE"), PC.nWT, "wt300", estLig);
    etapa = "03 COBERTURA";
    L("03.01", "Telha cerâmica sobre ripas, fornecida e instalada (área inclinada das águas)", aInc, "telha_cer");
    L("03.02", "Rufos das cumeeiras e dos espigões (cumeeiras " + br(mCM) + " m + " + nm("E") + " espigões " + br(mE) + " m)", mCM + mE, "rufo");
    L("03.03", "Calhas dos beirais", perB, "calha"); L("03.04", "Condutores pluviais", X.condutoresM != null ? Number(X.condutoresM) : 18, "condutor", "adoção: 18 m (planta em T/U: vários pontos de descida); ajustar à obra");
    if (mRC > 0) L("03.05", "Calha metálica dos RINCÕES (chapa galvanizada pré-pintada, 2 abas sobre as telhas; " + nm("RC") + " rincões, " + br(mRC) + " m de eixo)", mRC, "calha", "preço da calha dos beirais (adoção: sem preço próprio da calha de rincão no banco); lança na calha do perímetro no beiral");
    etapa = "04 SERVIÇOS GERAIS E ADMINISTRAÇÃO LOCAL";
    L("04.01", "Andaime (" + mesesAnd + " meses)", areaAnd * mesesAnd, "andaime_m2mes"); L("04.02", "Montagem e desmontagem do andaime", areaAnd, "andaime_mont");
    L("04.03", "Encarregado de carpintaria (" + prazo + " semanas)", hEnc, "encarregado_h"); L("04.04", "Acompanhamento técnico do engenheiro (20 % do prazo)", hEng, "engenheiro_h");
    L("04.05", "Mobilização, desmobilização e canteiro", 1, "mobilizacao"); L("04.06", "ART de execução", 1, "art");
    var cd = r(itens.reduce(function (s, x) { return s + x.total; }, 0), 2), etapas = {}; itens.forEach(function (x) { etapas[x.etapa] = r((etapas[x.etapa] || 0) + x.total, 2); });
    return { opcao: e.opcao || "T3TU", nome: (e.preliminar ? "PRELIMINAR — NÃO ATENDE — " : "") + (e.nome || ""), preliminar: !!e.preliminar, rotulo: e.preliminar ? "PRELIMINAR — NÃO ATENDE" : "", parcial: !PC.ok, rotuloParcial: PC.ok ? "" : "PARCIAL — ligações dos nós (pinos e chapas) não calculadas", estimativaLigacoes: PC.ok, rotuloEstimativa: PC.ok ? "Pinos e chapas dos nós: quantidade pelo critério de contagem do L (hipóteses no memorial); ligações detalhadas na etapa 3b" : "", itens: itens, etapas: etapas, custo_direto: cd, bdi: bdi, preco: r(cd * (1 + bdi), 2), volumes: { mlc: r(vMlc, 3) }, area_verniz: r(aVerniz, 1), area_telhado_m2: r(aInc, 2), pinos: { total: PC.nPinos, base: nPil * (2 * (base.n || 0)), porLigacao: PC.porLig }, kgChapa: r(PC.kgChapa, 1), nWT: PC.nWT, kgBase: r(kgBase, 1), nChumb: nChumb,
      adotados: itens.filter(function (x) { return x.adotado; }).length,
      pendencias: [PC.ok ? "Pinos e chapas dos nós (02.03 a 02.05): quantidades pelo critério de contagem do L (nº de ligações por tipo de nó × pinos/chapa do grupo dimensionado com os esforços do T/U); as verificações de detalhe das ligações (fendilhamento, torção, chapa única do canto, folgas) e as pranchas ficam para a etapa 3b — conferir antes de comprar." : "ORÇAMENTO PARCIAL: as ligações dos nós não foram calculadas (módulos ausentes); o custo real é MAIOR que o somado.", "Preço da telha cerâmica = o da telha PIR do banco (o mais alto; sem referência cerâmica publicada nesta base) — substituir pelo da obra.", "Ripas, caibrinhos e cumeeira/espigões cerâmicos dentro do preço da telha; caibros secundários não modelados.", "Preço da calha do rincão = o da calha dos beirais (adoção); calha de rincão tem desenvolvimento e mão de obra maiores — substituir pela cotação da obra.", "Fundação e vedações fora do escopo da madeira."] };
  }

  /* ---------------------------------------------------------------- RODAR (worker) */
  /** Projeto completo da opção: laço de crescimento (madt3tucalc) + rigidez/ligação da BASE dos pilares (as mesmas voltas do L) + reações nas paredes + orçamento por peças. */
  function rodar(sol, proj, avisa, t0, MO) {
    var CT = dep("MadT3TUCalc", "./madt3tucalc.js"), C3 = dep("MadT3Calc", "./madt3calc.js"), SA = dep("MadEngSaidas", "./madengsaidas.js"), itAtual = 0;
    avisa("dimensionar", { it: 0 });
    var opcoes = { voltasBase: 2, aoIterar: function (it, sec, pior) { itAtual = it + 1; avisa("dimensionar", { it: itAtual, pior: pior, sec: sec }); } };
    var kr = proj.krBase != null ? proj.krBase : 8000, krMap = null, tent = [], d, b, k, conv = false, partida = sol.partida, gv, krGov, rigidez, vezesP = 0;
    try {
    for (k = 0; k < opcoes.voltasBase; k++) {
      proj._krBase = krMap || kr; d = CT.dimensionar(proj, k ? d.secoes : partida, opcoes); b = CT.base(proj, d.resultado, d.secoes);
      tent.push({ krUsado: krMap ? copia(krMap) : kr, Ktheta: b.Ktheta, porGrupo: Object.keys(b.porGrupo).reduce(function (o, g) { o[g] = b.porGrupo[g].Ktheta; return o; }, {}) });
      if (proj.krBase != null) { conv = true; break; }
      var nm = {}, tudo = true; Object.keys(b.porGrupo).forEach(function (g) { var kg = krMap && krMap[g] != null ? krMap[g] : kr, kt = b.porGrupo[g].Ktheta; if (kt && Math.abs(kt - kg) / kg >= 0.12) tudo = false; nm[g] = !kt ? kg : (Math.min(kg, kt) === kg ? 0.5 * (kg + kt) : kt); });
      if (tudo) { conv = true; break; } krMap = nm;
    }
    gv = b.grupoGov; krGov = krMap && krMap[gv] != null ? krMap[gv] : kr; rigidez = { auto: proj.krBase == null, krBase: krGov, Ktheta: b.Ktheta, convergiu: conv, voltas: tent };
    while (b.LG && b.LG.ok === false && vezesP < 8) { var gr = false; ["P", "PO"].forEach(function (g) { if (C3.crescer(proj._pad3, d.secoes, g, d.resultado)) gr = true; }); if (!gr) break; vezesP++; proj._krBase = krMap || kr; d = CT.dimensionar(proj, d.secoes, opcoes); b = CT.base(proj, d.resultado, d.secoes); d.resultado.avisos.push("T3L: base reprovada — pilar crescido para " + Math.round(d.secoes.P.b * 100) + " cm (volta " + vezesP + ")."); }
    if (!conv) d.resultado.avisos.push("N6/T3L: a rigidez da base não convergiu em " + tent.length + " voltas — conferir.");
    proj._krBase = null;
    } catch (ex) {      /* o solver não achou equilíbrio (mecanismo): nada de seção falsa nem de exceção solta — sem solução COM O MOTIVO; o madcobertura tenta o espaçamento seguinte das tesouras */
      proj._krBase = null; if (!/instável|mecanismo|^análise:/.test(String(ex && ex.message || ex))) throw ex;
      return semSolucao(sol, proj, String(ex.message || ex), t0);
    }
    avisa("auditoria");
    var rr = d.resultado, q = proj._pad3, G = rr.modelo.G, I = G.info, P = G.p, membros = G.membros;
    var rp = reacoesParedes(rr), perim = 0;
    var TM = dep("MadT3TUMembros", "./madt3tumembros.js"), cnt = TM.contornoDe(P); cnt.forEach(function (p, i) { var p2 = cnt[(i + 1) % cnt.length]; perim += Math.sqrt(Math.pow(p2[0] - p[0], 2) + Math.pow(p2[1] - p[1], 2)); });
    var pecas = pecasDe(membros, d.secoes, q.classe);
    avisa("orcamento");
    var ligNos = ligacoesNosTU(q, d.secoes, rr, G), orc = orcarT3TU({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: pecas, params: P, secoes: d.secoes, ligacoes: b.LG, ligacoesNos: ligNos, membros: membros, info: I, perimetro: perim, extras: sol.extras, precos: sol.precos, bdi: sol.bdi });
    var vento = q._vento || proj._vento || {}, avisos = (rr.avisos || []).slice();
    var ligs = copia(b.LG || { ok: true, verificacoes: [] }); ligs.verificacoes = ligs.verificacoes || [];
    if (ligNos.ok === false) ligs.ok = false;
    var pTU = copia(rr.preliminarTU || { preliminar: false, motivos: [], pendenciasRT: 0 }), extra = [];
    arr(ligNos.falhas).forEach(function (k) { extra.push("ligação " + k + " não fecha (pinos/chapa do nó)"); });
    if (rp && rp.ok === false) extra.push("reações nas paredes não fecham o equilíbrio (Σ reações ≠ Σ cargas, ±1 %)" + (rp.motivo ? ": " + rp.motivo : ""));
    arr(I.avisos).forEach(function (t) { extra.push("geometria: " + t); });
    if (extra.length) { pTU.preliminar = true; pTU.motivos = arr(pTU.motivos).concat(extra); }
    var res = {
      ok: !d.semSolucao && ligs.ok !== false && !pTU.preliminar, semSolucao: !!d.semSolucao, tipologia: "T3TU", planta: rr.planta, sistema: "tesoura",
      opcao: sol.opcao, nomeOpcao: sol.nomeOpcao, secoes: d.secoes, iteracoes: d.historico.length, pior: d.pior, grupos: rr.grupos, flechas: rr.flechas, flechasMm: rr.flechasMm || null, reacoes: rr.reacoes,
      combinacoes: rr.combinacoes, avisos: avisos, avisosAnalise: rr.avisosAnalise || [], v0: vento.v0 != null ? vento.v0 : (vento.entrada && vento.entrada.v0) || null, cargasTotais: rr.cargasTotais || null, QCOB: rr.QCOB || null,
      ligacoes: ligs, rigidezBase: rigidez, fonte: { pecas: pecas, volume_por_material_m3: volumePorMaterial(pecas) }, auditoria: { achados: [], porRegra: {}, ok: true }, orcamento: orc, t7: null,
      t3: { params: P, info: copia(I), membros: membros.map(function (m) { return { id: m.id, g: m.g, agua: m.agua || null, aguaId: m.aguaId || null, asa: m.asa || null, tes: m.tes == null ? null : m.tes, p0: m.p0, p1: m.p1, eixo0: m.eixo0 || null, eixo1: m.eixo1 || null, nos: m.nos || [], canto: m.canto || null, concavo: !!m.concavo }; }) },
      espigao: rr.espigao, rincao: rr.rincao || null, cinta: rr.cinta, meia: rr.meia, porModelo: rr.porModelo || null, slipT: rr.slipT || null, pontaMI: rr.pontaMI || null, torcaoFR: rr.torcaoFR || null, contrav: rr.contrav || null, esf: rr.esf, compressaoE: rr.compressaoE || null, compressaoDG: rr.compressaoDG || null, compressaoMG: rr.compressaoMG || null,
      pendenciasRT: copia(rr.pendenciasRT || []), preliminarTU: pTU, reacoesParedes: rp, cargasNasParedes: cargasNasParedes(rp), rincaoCalhaKNm: rr.rincaoCalhaKNm,
      pranchas: { ok: false, folhas: [], motivo: MSG_PRANCHAS }, ms: Date.now() - t0 };
    res.pendencias3b = ["Pranchas detalhadas do T/U (planta, cortes, tesouras, rincões, fichas de corte).", "Verificação detalhada das ligações dos nós (η, fendilhamento, torção do frechal, chapa única do canto); os pinos e as chapas do orçamento já saem pela contagem do L.", "Auditor de encontros (folgas ≥ 10 mm) e manual de montagem."];
    var preX = SA ? SA.preliminar(res) : { preliminar: !res.ok };
    if (preX.preliminar || res.preliminarTU.preliminar) { orc.preliminar = true; orc.rotulo = "PRELIMINAR — NÃO ATENDE"; orc.nome = "PRELIMINAR — NÃO ATENDE — " + (sol.nomeOpcao || ""); }
    res.memoria = { vento: vento.ok ? { memoria: vento.memoria, avisos: vento.avisos, v0: vento.v0, s1: vento.s1, s2: vento.s2, s3: vento.s3, vk: vento.vk, q: vento.q, cpi: vento.cpi, excentricidade: vento.excentricidade, casos: (vento.casos || []).map(function (c) { return { id: c.id, nome: c.nome, direcao: c.direcao, cpi: c.cpi, cpiMotivo: c.cpiMotivo, q: c.q }; }), geometria: vento.geometria, norma: vento.norma, edicao: vento.edicao } : null,
      cargas: { telha: q.params && q.params.telha && q.params.telha.peso }, pesoMLC: q.pesoMLC, classe: q.classe, umidade: q.umidade, limVao: q.limVao, limBalanco: q.limBalanco, vento_entrada: proj.vento ? { local: proj.vento.local, s1: proj.vento.s1, categoria: proj.vento.categoria, grupoS3: proj.vento.grupoS3 } : null };
    return res;
  }
  /** resultado "SEM SOLUÇÃO" mínimo (o solver não fechou o equilíbrio): o sistema lê o motivo, tenta o espaçamento seguinte das tesouras e, esgotadas as tentativas, grava o cálculo PRELIMINAR com o motivo */
  function semSolucao(sol, proj, erro, t0) {
    var motivo = "T/U: o dimensionamento 3D não achou equilíbrio estável com as tesouras a " + br(proj.params && proj.params.tesoura && proj.params.tesoura.sTes) + " m (" + erro.replace(/\s+/g, " ").slice(0, 220) + ")";
    return { ok: false, semSolucao: true, motivo: motivo, tipologia: "T3TU", planta: null, sistema: "tesoura", opcao: sol.opcao, nomeOpcao: sol.nomeOpcao, secoes: {}, iteracoes: 0, pior: {}, grupos: {}, flechas: {}, reacoes: {}, combinacoes: 0, avisos: [], avisosAnalise: [],
      ligacoes: { ok: true, verificacoes: [] }, fonte: { pecas: [], volume_por_material_m3: {} }, auditoria: { achados: [], porRegra: {}, ok: true }, orcamento: null, t7: null, t3: { params: proj.params || null, info: {}, membros: [] }, pendenciasRT: [],
      preliminarTU: { preliminar: true, motivos: [motivo], pendenciasRT: 0 }, reacoesParedes: null, cargasNasParedes: [], pranchas: { ok: false, folhas: [], motivo: MSG_PRANCHAS }, ms: Date.now() - t0 };
  }
  function volumePorMaterial(pecas) { var o = {}; arr(pecas).forEach(function (p) { if (p.volume_m3) o[p.material] = r((o[p.material] || 0) + p.volume_m3, 4); }); return o; }

  /* ---------------------------------------------------------------- PRANCHAS (próxima versão) */
  /** Nesta versão o T/U NÃO gera pranchas: devolve a recusa clara (nada de folha vazia ou errada) */
  function pranchas() { return { ok: false, folhas: [], motivo: MSG_PRANCHAS }; }

  /* ---------------------------------------------------------------- MEMORIAL genérico (HTML) */
  var CSS = "body{font:11pt/1.45 'Segoe UI',Arial,sans-serif;color:#222;margin:24mm 20mm}h1{font-size:19pt;margin:0 0 4px}h2{font-size:13pt;border-bottom:2px solid #1f4e79;color:#1f4e79;margin-top:22px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:10pt}th,td{border:1px solid #999;padding:3px 6px;text-align:left}th{background:#e8eef5}.ok{color:#0a6b2d}.nok{color:#b00020;font-weight:700}.faixa{border:2px solid #b00020;color:#b00020;padding:6px 10px;margin:10px 0;font-weight:700}.aviso{border:2px solid #b9770e;color:#7a4b00;padding:6px 10px;margin:10px 0;font-weight:700}.nota{font-size:9.5pt;color:#555}@page{size:A4;margin:12mm}";
  function memorial(res, op) {
    op = op || {}; var SA = dep("MadEngSaidas", "./madengsaidas.js"), pre = SA ? SA.preliminar(res) : { preliminar: false, rotulo: "PRELIMINAR — NÃO ATENDE", motivos: [] }, o = op.obra || {}, d = op.documento || {}, Q = (res && res.t3) || {}, I = Q.info || {}, P = Q.params || {}, h = [], secoes = [];
    if (!res || res.tipologia !== "T3TU" || !res.t3) return { ok: false, motivo: "Resultado sem a T3TU (res.t3).", html: "" };
    var tu = res.preliminarTU || { preliminar: false, motivos: [] }, motivos = arr(pre.motivos).concat(arr(tu.motivos)).filter(function (t, i, v) { return v.indexOf(t) === i; }), prelim = !!pre.preliminar || !!tu.preliminar;
    function H2(t) { secoes.push(t); h.push("<h2>" + esc(t) + "</h2>"); }
    var legs = arr(P.legs), nome = res.planta === "U" ? "U" : (res.planta === "L" ? "L" : "T");
    h.push("<!doctype html><html><head><meta charset='utf-8'><title>Memorial de cálculo — telhado de 4 águas em " + nome + "</title><style>" + CSS + "</style></head><body>");
    if (prelim) h.push("<div class='faixa'>PRELIMINAR — NÃO ATENDE em todos os itens; nada deste documento vale para execução.<br>" + motivos.map(esc).join("<br>") + "</div>");
    h.push("<h1>Memorial de cálculo — telhado de 4 águas em " + nome + " com rincão em cada canto côncavo, em MLC (T3TU)</h1><p>" + esc(o.nome || P.nome || "") + (o.cidade ? " — " + esc(o.cidade) : "") + " · " + esc(d.numero || "EST-MAD-T3TU-MEM") + " · rev. " + esc(d.revisao || "R00") + " · " + esc(d.data || "") + (res.nomeOpcao ? " · opção " + esc(res.opcao) + ": " + esc(res.nomeOpcao) : "") + "</p><div class='faixa'>" + esc(FAIXA) + "</div>");
    h.push("<div class='aviso'>" + esc(MSG_PRANCHAS) + "</div>");
    H2("1. Objeto e geometria");
    h.push("<p>Estrutura de madeira laminada colada (MLC) de cobertura em <b>4 águas em planta em " + nome + " ortogonal</b>: barra " + br(I.a) + " × " + br(I.b) + " m (ao longo de X) e " + legs.length + " perna(s) ao longo de Z (" + legs.map(function (L) { return "largura " + br(L.w) + " m, comprimento " + br(L.c) + " m, começando em x = " + br(L.x0) + " m"; }).join("; ") + "), pé-direito " + br(P.peDireito) + " m, inclinação " + br((I.incl || 0) * 100, 0) + " % (a MESMA em todas as águas), beiral " + br(I.beiral) + " m em todos os lados, tesouras " + (I.tesouraTipo === "howe" ? "Howe" : "Pratt") + ". Um <b>RINCÃO</b> em cada canto côncavo (" + arr(I.reflexos).length + " canto(s) côncavo(s): " + arr(I.reflexos).map(function (c) { return "(" + br(c[0]) + "; " + br(c[1]) + ")"; }).join(", ") + " no quadro da estrutura, origem no canto da barra), com calha metálica. Área do telhado (com beiral): " + br(I.areaTotal) + " m².</p>");
    H2("2. Normas e premissas");
    h.push("<p>NBR 7190-1:2022 (critérios), NBR 6120:2019 (ações), NBR 6123:2023 (vento), NBR 8681 (combinações), NBR 8800 (chapas e chumbadores). A MLC segue a EN 14080 (classe GL24h; fonte secundária declarada).</p><ul>" + arr(res.avisos).filter(function (a) { return /PREMISSA|não modelad|K_br|C3|T3L:/.test(a); }).slice(0, 8).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>");
    H2("3. Ações");
    var cT = res.cargasTotais || {};
    h.push("<table><tr><th>Ação</th><th>Valor</th></tr><tr><td>Peso próprio MLC — resultante vertical</td><td>" + br(res.reacoesParedes && res.reacoesParedes.cargas ? res.reacoesParedes.cargas.G1 : 0) + " kN</td></tr><tr><td>G2 — telha + ripas (" + br(P.telha && P.telha.peso) + " kN/m² inclinado) + calha dos rincões</td><td>" + br(Math.abs((cT.G2 || [0, 0, 0])[1])) + " kN</td></tr><tr><td>Q — sobrecarga de cobertura (NBR 6120, por m² de planta) + água na calha</td><td>" + br(Math.abs((cT.Q || [0, 0, 0])[1])) + " kN</td></tr><tr><td>Vento — V0</td><td>" + (res.v0 != null ? br(res.v0, 1) + " m/s" : "—") + "</td></tr></table>");
    h.push("<p class='nota'>Vento: a NBR 6123:2023 não traz coeficientes para 4 águas nem para plantas em L, T ou U; foi adotado o campo de pressões da Tabela 5 (duas águas) POR ASA (barra e cada perna, cada uma com a sua cumeeira e o seu h/b; envoltória nas águas comuns), normal a cada água, com os beirais — inclusive os internos — a barlavento (+0,8·q por baixo). Combinações ELU/ELS pela NBR 8681 + 2ª ordem + abertura dominante excepcional; " + res.combinacoes + " combinações ELU.</p>");
    H2("4. Resultados por grupo (NBR 7190-1:2022)");
    var gs = Object.keys(res.secoes || {}).filter(function (g) { return NOMES[g] && res.grupos[g]; });
    h.push("<table><tr><th>Grupo</th><th>Seção (cm)</th><th>η máx.</th><th>Governa</th></tr>" + gs.map(function (g) { var s = res.secoes[g], e = res.grupos[g]; return "<tr><td>" + esc(NOMES[g]) + "</td><td>" + r(s.b * 100, 0) + " × " + r(s.h * 100, 0) + "</td><td class='" + (e.eta <= 1 ? "ok" : "nok") + "'>" + br(e.eta, 3) + "</td><td>" + esc(e.governa || "") + "</td></tr>"; }).join("") + "</table>");
    H2("5. Reações nas paredes (apoios dos pilares)");
    var RP = res.reacoesParedes || {};
    h.push("<p>Reação vertical de cada apoio: <b>característica</b> de G1, G2 e Q (análise linear do mesmo modelo) e <b>de cálculo</b> (envoltória ELU, compressão máxima). As coordenadas estão no quadro da estrutura (origem no canto da barra, X ao longo da barra).</p><table><tr><th>Apoio</th><th>x (m)</th><th>z (m)</th><th>G1 (kN)</th><th>G2 (kN)</th><th>Q (kN)</th><th>ELU compr. (kN)</th><th>ELU arranc. (kN)</th><th>H máx. (kN)</th></tr>" + arr(RP.apoios).map(function (a) { return "<tr><td>" + esc(a.apoio) + "</td><td>" + br(a.x) + "</td><td>" + br(a.z) + "</td><td>" + br(a.G1) + "</td><td>" + br(a.G2) + "</td><td>" + br(a.Q) + "</td><td>" + br(a.kN) + "</td><td>" + br(a.Nmin) + "</td><td>" + br(a.Hmax) + "</td></tr>"; }).join("") + "</table>");
    if (RP.soma) h.push("<p>Equilíbrio vertical (Σ reações × Σ cargas): G1 " + br(RP.soma.G1) + " × " + br(RP.cargas.G1) + " kN · G2 " + br(RP.soma.G2) + " × " + br(RP.cargas.G2) + " kN · Q " + br(RP.soma.Q) + " × " + br(RP.cargas.Q) + " kN — <span class='" + (RP.ok ? "ok" : "nok") + "'>" + (RP.ok ? "fecha (±1 %)" : "NÃO fecha em ±1 %") + "</span>. Resistência da parede, do frechal sobre ela e da fundação: projeto do RT.</p>");
    H2("6. Espigões, rincões e cinta do canto");
    var E = res.espigao || {}, RC = res.rincao || {}, RCh = RC.heel || {}, RCa = RC.apice || {};
    h.push("<p>Espigões dimensionados pela envolvente de 2 modelos (terça com rigidez axial cheia × estribo com deslizamento dos pinos) e pela viga bi-apoiada canto–ápice. Esforços de extremidade do espigão (ELU, kN): canto N = " + br(E.heel && E.heel.N) + ", V = " + br(E.heel && E.heel.V) + ", H = " + br(E.heel && E.heel.H) + "; ponta da cumeeira N = " + br(E.apice && E.apice.N) + ", V = " + br(E.apice && E.apice.V) + ", H = " + br(E.apice && E.apice.H) + ". Rincões (viga inclinada do canto côncavo ao vértice V, com a calha de " + br(res.rincaoCalhaKNm || 0.035, 3) + " kN/m): pé N = " + br(RCh.N) + ", V = " + br(RCh.V) + ", H = " + br(RCh.H) + "; vértice V N = " + br(RCa.N) + ", V = " + br(RCa.V) + ", H = " + br(RCa.H) + " (envoltória dos rincões).</p>");
    H2("7. Verificações de serviço e contraventamento");
    var fl = res.flechas || {};
    h.push("<table><tr><th>Grupo</th><th>η flecha (L/" + (res.memoria && res.memoria.limVao || 300) + ")</th></tr>" + Object.keys(fl).map(function (g) { return "<tr><td>" + esc(NOMES[g] || g) + "</td><td>" + br(fl[g], 3) + "</td></tr>"; }).join("") + "</table>");
    if (res.contrav && res.contrav.asa) h.push("<p>Rigidez K_br,1 (NBR 7190-1:2022, 6.6.2) por asa: " + Object.keys(res.contrav.asa).map(function (a) { var c = res.contrav.asa[a]; return "asa " + esc(a) + ": banzo superior " + Math.round(c.BS.Kbr) + " × " + Math.round(c.BS.Kmin) + " kN/m, banzo inferior " + Math.round(c.BI.Kbr) + " × " + Math.round(c.BI.Kmin) + " kN/m"; }).join("; ") + " — " + (res.contrav.ok ? "atende" : "<b class='nok'>NÃO atende</b>") + ".</p>");
    H2("8. Orçamento (resumo)");
    var O = res.orcamento || {}; h.push("<div class='aviso'>" + esc(O.rotuloParcial || O.rotuloEstimativa || "") + "</div><p>Custo direto R$ " + br(O.custo_direto, 2) + " · preço com BDI " + br((O.bdi || 0) * 100, 2) + " % = R$ " + br(O.preco, 2) + " · MLC " + br(O.volumes && O.volumes.mlc, 3) + " m³ · base dos pilares: " + br(O.kgBase, 1) + " kg de aço, " + (O.nChumb || 0) + " chumbadores. Pinos, chapas e parafusos dos nós: <b>" + (O.pinos ? O.pinos.total : 0) + " pinos</b>, " + br(O.kgChapa, 1) + " kg de chapa, " + (O.nWT || 0) + " parafusos WT — pelo critério de contagem do L (nº de ligações por tipo de nó × pinos do grupo dimensionado com os esforços do T/U). <b>Hipóteses:</b> (a) o contador geométrico é o do L, com três ajustes para o T/U: espigão interno = espigões marcados como interiores, a cinta do frechal sai de todos os cantos côncavos (a compressão do anel passa pela sela do rincão) e o caibro de meio conta por caibro; (b) vento local de aresta pela asa mais larga; (c) fendilhamento, torção do frechal, chapa única do canto e folgas do aparo não são verificados nesta versão.</p>");
    H2("9. Pendências ao responsável técnico");
    h.push("<p><b>Em cada canto côncavo</b> (sobrepressão local do vento na reentrância do rincão e sombreamento entre as asas, não cobertos pela Tabela 5):</p><ul>" + (arr(res.pendenciasRT).length ? res.pendenciasRT.map(function (p) { return "<li>" + esc(p.texto) + "</li>"; }).join("") : "<li>Nenhum canto côncavo.</li>") + "</ul>");
    h.push("<p><b>Peças e itens PRELIMINARES</b> (por peça e motivo):</p>" + (motivos.length ? "<ul>" + motivos.map(function (m) { return "<li class='nok'>" + esc(m) + "</li>"; }).join("") + "</ul>" : "<p class='ok'>Nenhuma peça reprova; flecha e K_br,1 atendem.</p>"));
    h.push("<p><b>Fica para a próxima versão:</b></p><ul>" + arr(res.pendencias3b).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul><ul><li>Torção por excentricidade do vento (6.6) e vento oblíquo: não modelados.</li><li>Caibros e ripas secundários: não modelados (dentro do preço da telha).</li><li>Tesoura de rincão (“falsa tesoura”): não modelada — o rincão é viga inclinada apoiada no canto côncavo e no vértice V.</li><li>Vento em 4 águas: premissa da Tabela 5 (duas águas) por asa — confirmar com o RT (ou ensaio em túnel de vento).</li><li>Valores da NBR 7190-1:2022 conferidos na transcrição da biblioteca; MLC pela EN 14080 (fonte secundária).</li></ul>");
    h.push("<p class='nota'>" + esc(FAIXA) + "</p></body></html>");
    return { ok: true, html: h.join(""), titulo: "Memorial de cálculo — telhado de 4 águas em " + nome, secoes: secoes, avisos: [], situacao: pre, preliminar: prelim, pendenciasRT: arr(res.pendenciasRT).length };
  }

  var MadT3TUSaidas = { rodar: rodar, orcar: orcarT3TU, memorial: memorial, pranchas: pranchas, reacoesParedes: reacoesParedes, cargasNasParedes: cargasNasParedes, pecasDe: pecasDe, ligacoesNos: ligacoesNosTU, contagemNos: contagemNos, pinosChapasNos: pinosChapasNos, MSG_PRANCHAS: MSG_PRANCHAS };
  if (typeof module !== "undefined" && module.exports) module.exports = MadT3TUSaidas;
  else global.MadT3TUSaidas = MadT3TUSaidas;
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : this));

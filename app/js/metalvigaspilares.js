/* =====================================================================
 * metalvigaspilares.js — METÁLICA: VIGAS ENTRE PILARES (motor PURO, ES5,
 * sem DOM, Node-testável). 15/10/2026.
 *
 * Pedido do Rogério (15/10/2026): "tenho uma linha de pilares de fora a fora
 * e quero lançar as vigas parafusadas neles (não no topo, por cima — entre um
 * pilar e outro). Hoje teria de lançar uma a uma. Se eu puxar de fora a
 * fora, ele entende, corta as vigas e já deixa entre um e outro. E a opção de
 * lançar as vigas em todos os sentidos dos pilares: posicionei vários
 * pilares, clico e ele lança as vigas automaticamente, em todos os sentidos
 * ou nos que eu marcar (X, Y), travando todos os pilares. Tem de ser
 * paramétrico." Complemento do mesmo dia: a viga termina na FACE do pilar
 * onde chega (mesa ou alma, conforme o giro do pilar e a direção da viga) e
 * a viga contínua respeita o COMPRIMENTO MÁXIMO DA BARRA (12 m comercial;
 * 6 m como opção rápida), com a emenda desenhada e listada.
 *
 * O QUE MORA AQUI (a tela é o js/metalvigaspilaresui.js e a barra de opções
 * da ferramenta Viga, js/metalcriarui.js)
 *   pilares(caixas, ids) .. os pilares de aço VERTICAIS (Metálica e aba
 *                           Estrutura): eixo na planta, base, topo, eixos da
 *                           seção (B = altura d, A = largura bf) e medidas;
 *   face(P, dir, perfil) .. a face onde a viga chega: MESA quando a direção de
 *                           chegada fica mais perto do eixo d do pilar (a
 *                           mesma regra do js/acoligsugere.js), ALMA senão; a
 *                           distância do eixo à face (alma: a viga entra
 *                           entre as mesas se couber; senão para na ponta
 *                           delas, com aviso);
 *   planoLinha(...) ....... a linha desenhada de fora a fora → as vigas:
 *                           DIVIDIR = uma por vão, a LINHA (receita, nó do
 *                           cálculo, vínculos) de eixo a eixo e o SÓLIDO
 *                           recuado até a face + a folga de fabricação;
 *                           CONTÍNUA = sobre os pilares (a mesa de baixo na
 *                           chapa de cabeça), quebrada no comprimento máximo:
 *                           (a) EMENDA SOBRE O PILAR (padrão) — a quebra vai
 *                               para o eixo do pilar mais longe que ainda
 *                               cabe no máximo; ali a viga deixa de ser
 *                               contínua (as duas pontas rotuladas no
 *                               cálculo — metal.calc) e a chapa de cabeça
 *                               recebe as duas vigas;
 *                           (b) EMENDA DE CONTINUIDADE — a 0,2·L do apoio
 *                               (perto do momento nulo), talas parafusadas
 *                               (emenda-viga-talas-paraf), dimensionada com
 *                               os esforços da análise — sem análise, A
 *                               DIMENSIONAR.
 *                           Nenhuma barra passa do máximo: o trecho que não
 *                           cabe NÃO é lançado e vira pendência com o motivo;
 *   planoGrade(...) ....... os pilares selecionados → os pares VIZINHOS
 *                           alinhados em X e/ou em Y da planta (tolerância;
 *                           diagonal fica de fora; viga que já existe entre o
 *                           par não é lançada de novo) → uma viga por vão;
 *   executar(...) ......... o plano → as ops de UM lote (um Ctrl+Z): as
 *                           vigas e, em cada encontro, a ligação PARAFUSADA
 *                           FLEXÍVEL escolhida pela sugestão que já existe
 *                           (AcoLigSugere.analisar → sugerir → escolherLote,
 *                           aplicada pelo MetalLigSugUI.aplicarOpcao). Sem
 *                           esforço da análise a ligação fica marcada A
 *                           DIMENSIONAR (ligInfo.aDimensionar, ok = false);
 *                           sem tipologia aplicável, a ponta fica "a
 *                           dimensionar" na receita da viga (vp.pend) — nunca
 *                           aprovada.
 * PARAMÉTRICO: as pontas da LINHA ficam no eixo do pilar; o js/bimvinculos.js
 * liga a ponta ao pilar e, quando o pilar anda, refaz a viga pelo
 * MetalCriar.editar — o recuo vai junto (metal.cria.recuo); o js/metalligacao.js
 * ajustarPonta preserva a receita dessas vigas. O cálculo guardado fica
 * DESATUALIZADO pela assinatura da geometria (BimVinculos.assinatura).
 * Teste: node tools/test-metal-vigas-pilares.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function MC() { return dep("MetalCriar", "./metalcriar.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function Sug() { return dep("AcoLigSugere", "./acoligsugere.js"); }
  function BL() { return dep("BimMetalLig", "./metalligacao.js"); }
  function LSU() { return dep("MetalLigSugUI", "./metalligsugui.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function hor(v) { return [v[0], 0, v[2]]; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function P3(v) { return [r6(v[0]), r6(v[1]), r6(v[2])]; }

  var FOLGA = 0.0127;        /* folga de fabricação até a face do pilar: a mesma das macros de chapa simples e cantoneira (js/metalligacao.js) */
  var GAP_EMENDA = 0.010;    /* a junta da emenda: 10 mm entre as duas vigas (5 mm de cada lado da linha) */
  var MAX_PADRAO = 12;       /* comprimento comercial do perfil laminado (m) */
  var MAX_RAPIDOS = [6, 12];
  var TOL_ALINH = 0.05;      /* pilares "alinhados" na grade: até 5 cm fora da linha */
  var T_CABECA = 0.016;      /* chapa de cabeça de partida (js/metalligacao.js chapaCabeca) */
  var FRAC_EMENDA = 0.2;     /* emenda de continuidade a 0,2·L do apoio (perto do momento nulo da viga contínua) */
  var COS_VERT = 0.999;      /* pilar vertical (a ferramenta Pilar cria assim; inclinado fica de fora) */

  /* ================================================================ PILARES */
  function dimDe(mb) {
    var p = mb.perfil || {}, s = mb.s || {}, A = Aco(), reg = p.cat && A && A.paraPerfil ? A.paraPerfil(p.cat) : null;
    var q = reg && reg.forma ? reg : p;
    var alt = num(s.alt, num(q.d, 0.2)), larg = num(s.larg, num(q.bf, alt));
    var forma = String(q.forma || ""), d = num(q.d, alt), bf = num(q.bf, larg), tw = num(q.tw, 0), tf = num(q.tf, 0);
    return { forma: forma, d: d, bf: bf, tw: tw, tf: tf, alt: alt, larg: larg, h: Math.max(alt, larg), ehI: forma === "I" && tw > 0 && tf > 0, nome: p.cat || forma };
  }
  function pilarDe(c) {
    if (!c || c.id == null) return null;
    var metal = c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && !c.metal.lig;
    var estr = (c.tipo === "pilar") && !c.metal && c.material === "aco" && c.perfil;
    if (!metal && !estr) return null;
    if (metal && /contravent|diagonal|tirante|ter[cç]a/i.test(String(c.metal.papel || ""))) return null;
    var B = BM(); if (!B) return null;
    var mb = null; try { mb = B.membro(c); } catch (e) { mb = null; }
    if (!mb || !(mb.L > 0.05) || Math.abs(mb.X[1]) < COS_VERT) return null;
    var fim = add(mb.P0, mul(mb.X, mb.L));
    var Bh = unit(hor(mb.B)) || [1, 0, 0], Ah = unit(hor(mb.A)) || [0, 0, 1];
    var nome = ""; try { nome = metal && B.nome ? B.nome(c) : "Pilar " + c.id; } catch (e2) { nome = "Pilar " + c.id; }
    return { id: String(c.id), c: c, mb: mb, x: r6(mb.P0[0]), z: r6(mb.P0[2]), y0: Math.min(mb.P0[1], fim[1]), y1: Math.max(mb.P0[1], fim[1]), B: Bh, A: Ah, dim: dimDe(mb), nome: nome };
  }
  function pilares(caixas, ids) {
    var so = null; if (arr(ids).length) { so = {}; ids.forEach(function (id) { so[String(id)] = 1; }); }
    var out = [];
    arr(caixas).forEach(function (c) { if (!c || (so && !so[String(c.id)])) return; var p = pilarDe(c); if (p) out.push(p); });
    return out;
  }
  function rotuloP(P) { return String(P.c && P.c.marca ? P.c.marca : P.id); }

  /* ================================================================ FACE
   * dir = a direção, NA PLANTA, do eixo do pilar para o lado de onde a viga chega. */
  function face(P, dir, perfilViga) {
    var d = unit(hor(dir)) || [1, 0, 0], D = P.dim;
    var eB = Math.abs(dot(d, P.B)), eA = Math.abs(dot(d, P.A)), mesa = eB >= eA, out = { face: mesa ? "mesa" : "alma" };
    var c = Math.max(mesa ? eB : eA, 0.2);
    out.obliqua = Math.round(Math.acos(Math.min(1, Math.max(eB, eA))) * 180 / Math.PI * 10) / 10;
    if (!D.ehI) {
      if (/circ|ret|tubo|quad|hss/i.test(D.forma + " " + D.nome)) out.face = "tubo";
      out.dist = (mesa ? D.alt : D.larg) / 2 / c;
      return out;
    }
    if (mesa) { out.dist = D.d / 2 / c; return out; }
    var bfV = num(perfilViga && perfilViga.bf, 0), livre = D.d - 2 * D.tf;
    out.cabe = bfV <= livre - 0.010 + 1e-9;
    out.dist = (out.cabe ? D.tw / 2 : D.bf / 2) / c;
    if (!out.cabe) out.aviso = "a viga (mesa de " + br(bfV * 1000, 0) + " mm) não cabe entre as mesas do pilar " + rotuloP(P) + " (" + br(livre * 1000, 0) + " mm livres): ela para na ponta das mesas — recorte as mesas da viga ou gire o pilar";
    return out;
  }

  /* ================================================================ OS PILARES NA LINHA */
  function tolPlanta(P) { return P.dim.h / 2 + 0.01; }
  function naLinha(pils, a, b) {
    var dd = [b[0] - a[0], 0, b[2] - a[2]], L = len(dd); if (!(L > 0.05)) return [];
    var u = mul(dd, 1 / L), out = [];
    pils.forEach(function (P) {
      var w = [P.x - a[0], 0, P.z - a[2]], t = dot(w, u), perp = Math.abs(w[0] * u[2] - w[2] * u[0]), tol = tolPlanta(P);
      if (perp > tol || t < -tol || t > L + tol) return;
      out.push({ P: P, t: t, perp: perp, interior: t > tol && t < L - tol });
    });
    out.sort(function (p, q) { return p.t - q.t; });
    var o2 = []; out.forEach(function (x) { if (o2.length && Math.abs(x.t - o2[o2.length - 1].t) < 0.05) return; o2.push(x); });
    return o2;
  }

  /* ================================================================ VIGA QUE JÁ EXISTE
   * entre os dois eixos (na planta) e na mesma faixa de altura — de eixo a eixo, recuada pela ligação ou passando sobre os dois */
  function existentes(caixas) {
    var B = BM(), M = MC(), out = [];
    arr(caixas).forEach(function (c) {
      if (!c || !B) return;
      var ok = (c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && !c.metal.lig) || (c.tipo === "viga" && !c.metal);
      if (!ok) return;
      var mb = null; try { mb = B.membro(c); } catch (e) { mb = null; }
      if (!mb || !(mb.L > 0.05) || Math.abs(mb.X[1]) > 0.2) return;
      var meia = Math.abs(num(mb.B && mb.B[1], 1)) * num(mb.s && mb.s.alt, 0.2) / 2;
      var linhas = [{ a: mb.P0, b: add(mb.P0, mul(mb.X, mb.L)) }];
      if (c.tipo === "metal" && M) { try { var li = M.linhaAtual(c); if (li && li.a && li.b) linhas.push({ a: li.a, b: li.b }); } catch (e2) {} }
      out.push({ id: String(c.id), linhas: linhas, y0: mb.P0[1] - meia, y1: mb.P0[1] + meia });
    });
    return out;
  }
  function cobre(ex, P1, P2, y0, y1) {
    if (Math.min(ex.y1, y1) - Math.max(ex.y0, y0) < 0.05) return false;
    return ex.linhas.some(function (l) {
      var d = [l.b[0] - l.a[0], 0, l.b[2] - l.a[2]], L = len(d); if (!(L > 0.05)) return false;
      var u = mul(d, 1 / L);
      return [P1, P2].every(function (P) {
        var w = [P.x - l.a[0], 0, P.z - l.a[2]], t = dot(w, u), perp = Math.abs(w[0] * u[2] - w[2] * u[0]), tol = P.dim.h / 2 + 0.05;
        return perp <= tol && t >= -tol && t <= L + tol;
      });
    });
  }

  /* ================================================================ DIVIDIR UM TRECHO NO MÁXIMO
   * seg = { E (m, do início), oS, oE (recuo do sólido nas pontas: + encurta, − estica), cands: [{ t, tipo, … }] } →
   * { ok, pecas: [{ de: {t, r, emenda?}, ate: {t, r, emenda?} }] } — o sólido de cada peça ≤ max. Guloso: a quebra mais
   * longe que ainda cabe. Sem quebra que caiba → ok false (o trecho inteiro NÃO é lançado: nenhuma barra acima do máximo). */
  function dividirSeg(seg, max) {
    var pecas = [], cur = { t: 0, r: seg.oS }, g = GAP_EMENDA / 2;
    function comp(a, ra, b, rb) { return b - a - ra - rb; }
    for (var k = 0; k < 400; k++) {
      if (comp(cur.t, cur.r, seg.E, seg.oE) <= max + 1e-6) { pecas.push({ de: cur, ate: { t: seg.E, r: seg.oE } }); return { ok: true, pecas: pecas }; }
      var best = null;
      arr(seg.cands).forEach(function (c) {
        if (c.t <= cur.t + 0.3 || c.t >= seg.E - 0.3) return;
        if (comp(cur.t, cur.r, c.t, g) <= max + 1e-6 && (!best || c.t > best.t)) best = c;
      });
      if (!best) return { ok: false, pecas: pecas, falta: comp(cur.t, cur.r, seg.E, seg.oE), de: cur.t };
      pecas.push({ de: cur, ate: { t: best.t, r: g, emenda: best } });
      cur = { t: best.t, r: g, emenda: best };
    }
    return { ok: false, pecas: pecas };
  }

  function perfilDe(cat) {
    var M = MC(), A = Aco(); if (!M || !A) return null;
    var nome = M.perfilCat(cat); if (!nome) return null;
    var pf = A.paraPerfil(nome), ds = pf ? M.dimSecao(pf) : null;
    return pf && ds ? { cat: nome, pf: pf, d: ds.alt, larg: ds.larg } : null;
  }
  function novoPlano(modo, perfil) { return { ok: true, modo: modo, cat: perfil ? perfil.cat : null, just: modo === "continua" ? "base" : "topo", pecas: [], emendas: [], apoios: [], pendentes: [], avisos: [], existentes: 0, pares: 0, porEixo: { x: 0, y: 0 } }; }
  function avisar(pl, t) { if (t && pl.avisos.indexOf(t) < 0) pl.avisos.push(t); }

  /* ---------------------------------------------------------------- um vão entre dois pilares (dividir e grade) */
  function vao(pl, P1, P2, o, ex, eixo) {
    var pf = o.perfil, dV = pf.d, yT = o.yTop != null && fin(o.yTop) ? o.yTop : Math.min(P1.y1, P2.y1), nomes = rotuloP(P1) + "–" + rotuloP(P2);
    var A0 = [P1.x, yT, P1.z], B0 = [P2.x, yT, P2.z], Lp = len(hor(sub(B0, A0)));
    if (!(Lp > 0.3)) { pl.pendentes.push({ texto: "Pilares " + nomes + " a menos de 30 cm: sem viga.", de: P1.id, ate: P2.id }); return; }
    var alto = [P1, P2].filter(function (P) { return yT - dV > P.y1 - 0.005; }), baixo = [P1, P2].filter(function (P) { return yT - dV < P.y0 - 1e-6; });
    if (alto.length) { pl.pendentes.push({ texto: "Vão " + nomes + ": com o topo na cota " + br(yT) + " m a viga passa por cima do pilar " + alto.map(rotuloP).join(", ") + " — use \"Contínua sobre os pilares\" ou baixe a cota.", de: P1.id, ate: P2.id }); return; }
    if (baixo.length) { pl.pendentes.push({ texto: "Vão " + nomes + ": a viga ficaria abaixo da base do pilar " + baixo.map(rotuloP).join(", ") + ".", de: P1.id, ate: P2.id }); return; }
    [P1, P2].forEach(function (P) { if (yT > P.y1 + 0.005) avisar(pl, "O topo da viga passa " + br((yT - P.y1) * 1000, 0) + " mm do topo do pilar " + rotuloP(P) + " (a ligação na face fica abaixo do topo da viga)."); });
    if (arr(ex).some(function (e) { return cobre(e, P1, P2, yT - dV, yT); })) { pl.existentes++; return; }
    var dir = unit(hor(sub(B0, A0))), fA = face(P1, dir, pf.pf), fB = face(P2, mul(dir, -1), pf.pf), folga = num(o.folga, FOLGA);
    [fA, fB].forEach(function (f) { if (f.aviso) avisar(pl, f.aviso); if (f.obliqua > 3) avisar(pl, "Vão " + nomes + " chega oblíquo (" + br(f.obliqua, 1) + "°) na " + f.face + " do pilar."); });
    var seg = { E: Lp, oS: fA.dist + folga, oE: fB.dist + folga, cands: [] };
    if (o.emenda === "continuidade") seg.cands = [{ t: FRAC_EMENDA * Lp, tipo: "continuidade", s: FRAC_EMENDA * Lp, apoio: P1.id, vao: Lp }, { t: (1 - FRAC_EMENDA) * Lp, tipo: "continuidade", s: FRAC_EMENDA * Lp, apoio: P2.id, vao: Lp }];
    var dv = dividirSeg(seg, o.max);
    if (!dv.ok) {
      pl.pendentes.push({ texto: "Vão " + nomes + " de " + br(Lp) + " m: a peça teria " + br(Lp - seg.oS - seg.oE) + " m, acima do máximo de " + br(o.max) + " m — " +
        (o.emenda === "continuidade" ? "nem com as emendas a 0,2·L do apoio cabe no máximo (aumente o máximo)." : "a emenda no meio do vão exige \"Emenda de continuidade\" (ou aumente o máximo). NÃO lançado."), de: P1.id, ate: P2.id, excede: true });
      return;
    }
    pl.pares++; if (eixo) pl.porEixo[eixo]++;
    var i0 = pl.pecas.length;
    dv.pecas.forEach(function (pc, k) {
      var a = add(A0, mul(dir, pc.de.t)), b = add(A0, mul(dir, pc.ate.t));
      var pa = pc.de.emenda ? { tipo: "emenda-continuidade" } : { tipo: "pilar", pilar: P1.id, face: fA.face };
      var pb = pc.ate.emenda ? { tipo: "emenda-continuidade" } : { tipo: "pilar", pilar: P2.id, face: fB.face };
      pl.pecas.push({ a: P3(a), b: P3(b), recuo: { a: r6(pc.de.r), b: r6(pc.ate.r) }, Ls: r4(pc.ate.t - pc.de.t - pc.de.r - pc.ate.r), L: r4(pc.ate.t - pc.de.t), pontas: { a: pa, b: pb }, eixo: eixo || null, vao: nomes });
      if (pc.ate.emenda) pl.emendas.push({ tipo: "continuidade", entre: [i0 + k, i0 + k + 1], P: P3(b), s: r4(pc.ate.emenda.s), apoio: pc.ate.emenda.apoio, vao: r4(Lp), texto: "Emenda de continuidade no vão " + nomes + " a " + br(pc.ate.emenda.s) + " m (0,2·L) do pilar " + pc.ate.emenda.apoio });
    });
  }

  /* ================================================================ A LINHA DE FORA A FORA
   * a, b = a linha da ferramenta Viga (o topo da viga na cota da ferramenta); o = { cat, modo ("auto" | "dividir" |
   * "continua" | "nao"), topo ("ferramenta" | "pilar"), max (m), emenda ("pilar" | "continuidade"), folga } →
   * plano | null (null = a linha não atravessa pilares: a ferramenta faz a viga de sempre). "auto": divide quando
   * há pilar no MIOLO da linha e 2 ou mais pilares nela (a viga de ponta a ponta entre dois topos continua inteira). */
  function planoLinha(caixas, a, b, o) {
    o = o || {};
    var modo = o.modo || "auto"; if (modo === "nao") return null;
    var perfil = perfilDe(o.cat); if (!perfil) return null;
    var on = naLinha(pilares(caixas), a, b), nInt = on.filter(function (x) { return x.interior; }).length;
    if (on.length < 2 || (modo === "auto" && nInt < 1)) return null;
    var max = num(o.max, MAX_PADRAO); if (!(max >= 1)) max = MAX_PADRAO;
    var emenda = o.emenda === "continuidade" ? "continuidade" : "pilar", y = Math.max(num(a[1], 0), num(b[1], 0));
    var pl;
    if (modo === "continua") pl = planoContinua(on, { perfil: perfil, max: max, emenda: emenda, yTop: o.topo === "pilar" ? null : y });
    else {
      pl = novoPlano("dividir", perfil);
      var ex = existentes(caixas), oo = { perfil: perfil, max: max, emenda: emenda, folga: o.folga, yTop: o.topo === "pilar" ? null : y };
      for (var i = 0; i + 1 < on.length; i++) vao(pl, on[i].P, on[i + 1].P, oo, ex, null);
    }
    var desc = Math.max(0, on[0].t) + Math.max(0, len(hor(sub(b, a))) - on[on.length - 1].t);
    if (desc > 0.3) avisar(pl, "Os trechos da linha fora dos pilares das pontas (" + br(desc) + " m) não viram viga: a viga fica entre um pilar e outro.");
    pl.pilaresNaLinha = on.map(function (x) { return x.P.id; });
    pl.max = max; pl.emenda = emenda;
    return pl;
  }

  /* ---------------------------------------------------------------- CONTÍNUA sobre os pilares */
  function planoContinua(on, o) {
    var pf = o.perfil, pl = novoPlano("continua", pf), sup = [];
    var yB = o.yTop != null ? o.yTop - pf.d : Math.max.apply(null, on.map(function (x) { return x.P.y1; })) + T_CABECA;
    on.forEach(function (x) {
      var topo = x.P.y1, chapa = yB - T_CABECA;
      if (topo > chapa + 0.005) { avisar(pl, "O pilar " + rotuloP(x.P) + " passa " + br((topo - chapa) * 1000, 0) + " mm da chapa de cabeça: na contínua a viga apoia no TOPO dos pilares — ele fica de fora (baixe o pilar ou use \"Dividir nos pilares\")."); return; }
      if (topo < chapa - 0.5) { avisar(pl, "O pilar " + rotuloP(x.P) + " fica " + br(chapa - topo) + " m abaixo da viga contínua: não é apoio dela."); return; }
      if (topo < chapa - 0.0005) avisar(pl, "O topo do pilar " + rotuloP(x.P) + " fica " + br((chapa - topo) * 1000, 0) + " mm abaixo da chapa de cabeça: a ligação sobe o topo até ela.");
      sup.push(x);
    });
    if (sup.length < 2) { pl.ok = false; pl.pendentes.push({ texto: "Menos de dois pilares apoiam a viga contínua: nada lançado." }); return pl; }
    var Pa = sup[0].P, Pz = sup[sup.length - 1].P, A0 = [Pa.x, yB, Pa.z], dir = unit(hor(sub([Pz.x, yB, Pz.z], A0))) || [1, 0, 0];
    var ts = sup.map(function (x) { return dot(hor(sub([x.P.x, yB, x.P.z], A0)), dir); });
    var E = ts[ts.length - 1];
    /* a ponta da viga cobre o pilar da ponta (a chapa de cabeça fica toda sob a mesa): o sólido passa o eixo meia seção + 7 cm */
    var eS = Pa.dim.h / 2 + 0.07, eE = Pz.dim.h / 2 + 0.07, cands = [];
    if (o.emenda === "pilar") for (var i = 1; i + 1 < sup.length; i++) cands.push({ t: ts[i], tipo: "pilar", pilar: sup[i].P.id });
    else for (var j = 0; j + 1 < sup.length; j++) { var Lv = ts[j + 1] - ts[j]; cands.push({ t: ts[j] + FRAC_EMENDA * Lv, tipo: "continuidade", s: FRAC_EMENDA * Lv, apoio: sup[j].P.id, vao: Lv }, { t: ts[j + 1] - FRAC_EMENDA * Lv, tipo: "continuidade", s: FRAC_EMENDA * Lv, apoio: sup[j + 1].P.id, vao: Lv }); }
    var dv = dividirSeg({ E: E, oS: -eS, oE: -eE, cands: cands }, o.max);
    if (!dv.ok) {
      var maior = 0; for (var k = 0; k + 1 < ts.length; k++) maior = Math.max(maior, ts[k + 1] - ts[k]);
      pl.ok = false;
      pl.pendentes.push({ excede: true, texto: "Viga contínua de " + br(E + eS + eE) + " m não cabe no máximo de " + br(o.max) + " m " + (o.emenda === "pilar" ? (maior + 0.2 > o.max ? "— o vão de " + br(maior) + " m sozinho passa do máximo: a emenda no meio do vão exige \"Emenda de continuidade\" (ou aumente o máximo)." : "com as emendas sobre os pilares.") : "nem com as emendas a 0,2·L do apoio (aumente o máximo).") + " NADA lançado: nenhuma barra acima do máximo." });
      return pl;
    }
    dv.pecas.forEach(function (pc, n) {
      var a = add(A0, mul(dir, pc.de.t)), b = add(A0, mul(dir, pc.ate.t)), calc = null;
      if (pc.de.emenda && pc.de.emenda.tipo === "pilar") calc = { ini: "rotulada", tipologia: "emenda sobre o pilar" };
      if (pc.ate.emenda && pc.ate.emenda.tipo === "pilar") { calc = calc || { tipologia: "emenda sobre o pilar" }; calc.fim = "rotulada"; }
      var tipoP = function (e, fimLinha) { return e ? (e.tipo === "pilar" ? { tipo: "emenda-pilar", pilar: e.pilar } : { tipo: "emenda-continuidade" }) : { tipo: "apoio", pilar: (fimLinha ? Pz : Pa).id }; };
      pl.pecas.push({ a: P3(a), b: P3(b), recuo: { a: r6(pc.de.r), b: r6(pc.ate.r) }, Ls: r4(pc.ate.t - pc.de.t - pc.de.r - pc.ate.r), L: r4(pc.ate.t - pc.de.t), pontas: { a: tipoP(pc.de.emenda, false), b: tipoP(pc.ate.emenda, true) }, calc: calc });
      if (pc.ate.emenda) {
        var e = pc.ate.emenda;
        pl.emendas.push(e.tipo === "pilar" ? { tipo: "pilar", entre: [n, n + 1], pilar: e.pilar, P: P3(b), texto: "Emenda sobre o pilar " + e.pilar + " a " + br(e.t) + " m do início: nesta emenda a viga deixa de ser contínua (as duas vigas biapoiadas no pilar)." }
          : { tipo: "continuidade", entre: [n, n + 1], P: P3(b), s: r4(e.s), apoio: e.apoio, vao: r4(e.vao), texto: "Emenda de continuidade a " + br(e.s) + " m (0,2·L) do pilar " + e.apoio + " — dimensionada com os esforços da análise naquele ponto" });
      }
    });
    /* os apoios que a viga atravessa (o pilar sob a peça, fora das emendas sobre pilar) */
    sup.forEach(function (x, i) {
      var t = ts[i]; if (pl.emendas.some(function (e) { return e.tipo === "pilar" && e.pilar === x.P.id; })) return;
      for (var n = 0; n < dv.pecas.length; n++) { var pc = dv.pecas[n]; if (t >= pc.de.t - 1e-6 && t <= pc.ate.t + 1e-6) { pl.apoios.push({ peca: n, pilar: x.P.id }); return; } }
    });
    pl.pares = sup.length - 1;
    return pl;
  }

  /* ================================================================ A GRADE SELECIONADA
   * o = { x, y (sentidos: X e Y da PLANTA — o Y da planta é o Z do mundo; false desliga), tol (m), cat, topo ("pilar" |
   * "cota"), cota (m, o topo da viga com topo "cota"), max, emenda, folga }.
   * ⚠ A cota NÃO é `y`: até 15/10/2026 as duas usavam `o.y` e a tela montava { y: sentido, …, y: cota } — a 2ª chave
   * apagava a 1ª (null !== false = Y ligado) e desmarcar Y no diálogo não mudava nada (achado pela e2e). */
  function pares(pils, o) {
    var tol = num(o.tol, TOL_ALINH), out = [], vistos = {};
    var sentidos = []; if (o.x !== false) sentidos.push("x"); if (o.y !== false) sentidos.push("y");
    pils.forEach(function (P) {
      sentidos.forEach(function (s) {
        var best = null, dm = Infinity;
        pils.forEach(function (Q) {
          if (Q === P) return;
          var al = s === "x" ? Q.x - P.x : Q.z - P.z, tr = s === "x" ? Q.z - P.z : Q.x - P.x;
          if (al <= 0.05 || Math.abs(tr) > tol) return;   /* só para a frente; fora da linha (diagonal) não conta */
          if (al < dm) { dm = al; best = Q; }
        });
        if (!best) return;
        var k = s + "|" + P.id + "|" + best.id; if (vistos[k]) return; vistos[k] = 1;
        out.push({ P1: P, P2: best, eixo: s });
      });
    });
    return out;
  }
  function planoGrade(caixas, ids, o) {
    o = o || {};
    var perfil = perfilDe(o.cat), pl = novoPlano("grade", perfil);
    if (!perfil) { pl.ok = false; pl.pendentes.push({ texto: "Perfil não encontrado no catálogo: " + (o.cat || "?") + "." }); return pl; }
    var pils = pilares(caixas, ids);
    if (pils.length < 2) { pl.ok = false; pl.pendentes.push({ texto: "Selecione dois ou mais pilares de aço verticais." }); return pl; }
    if (o.x === false && o.y === false) { pl.ok = false; pl.pendentes.push({ texto: "Marque ao menos um sentido (X ou Y)." }); return pl; }
    var max = num(o.max, MAX_PADRAO); if (!(max >= 1)) max = MAX_PADRAO;
    var oo = { perfil: perfil, max: max, emenda: o.emenda === "continuidade" ? "continuidade" : "pilar", folga: o.folga, yTop: o.topo === "cota" && fin(num(o.cota, NaN)) ? num(o.cota, 0) : null };
    var ex = existentes(caixas), ps = pares(pils, o);
    ps.forEach(function (p) { vao(pl, p.P1, p.P2, oo, ex, p.eixo); });
    var semPar = pils.filter(function (P) { return !ps.some(function (p) { return p.P1 === P || p.P2 === P; }); });
    if (semPar.length) avisar(pl, semPar.length + " pilar(es) sem vizinho alinhado nos sentidos marcados (tolerância " + br(num(o.tol, TOL_ALINH) * 100, 0) + " cm): " + semPar.map(rotuloP).join(", ") + ".");
    pl.max = max; pl.emenda = oo.emenda; pl.pilares = pils.length;
    return pl;
  }

  /* ================================================================ PRÉVIA: as vigas do plano como peças (sem id) */
  function opcoesPeca(pl, pc, o) {
    var vp = { modo: pl.modo, pilares: { a: pc.pontas.a.pilar || null, b: pc.pontas.b.pilar || null }, faces: { a: pc.pontas.a.face || null, b: pc.pontas.b.face || null }, pontas: { a: pc.pontas.a.tipo, b: pc.pontas.b.tipo } };
    if (pc.calc) vp.calc = clone(pc.calc);
    return { ferr: "viga", cat: o.cat || pl.cat, just: pl.just, recuo: pc.recuo, vp: vp, nivel: o.nivel || null, aco: o.aco || undefined };
  }
  function previa(pl, o) {
    o = o || {};
    var M = MC(); if (!M || !pl) return [];
    return pl.pecas.map(function (pc) { var c = M.barra(pc.a, pc.b, opcoesPeca(pl, pc, o)); return c && !c.erro ? c : null; }).filter(Boolean);
  }

  /* ================================================================ EXECUTAR
   * caixas = o estado de agora; pl = planoLinha/planoGrade; o = { cat, novoId(), nivel (a viga acompanha o nível da
   * ferramenta), resultado (o último cálculo — esforços da análise), fundacoes, materiais } → { ok, ops (UM lote), vigas,
   * ligacoes, emendas, pendentes, avisos, resumo } */
  function executar(caixas, pl, o) {
    o = o || {};
    var M = MC(), S0 = Sug(), L0 = BL(), U = LSU(), Bm = BM();
    var seq = 0, base = Date.now().toString(36);
    var novoId = typeof o.novoId === "function" ? o.novoId : function () { return "mvp-" + base + "-" + (seq++); };
    var res = { ok: false, ops: [], vigas: [], ligacoes: [], emendas: [], pendentes: arr(pl && pl.pendentes).slice(), avisos: arr(pl && pl.avisos).slice(), aDimensionar: 0 };
    if (!M || !pl || !pl.pecas.length) { res.resumo = "Nenhuma viga a lançar" + (res.pendentes.length ? ": " + res.pendentes[0].texto : "."); return res; }
    var porId = {}; arr(caixas).forEach(function (c) { if (c && c.id != null) porId[String(c.id)] = c; });
    var pend = {};
    function pendPonta(id, k, t) { (pend[id] = pend[id] || {})[k] = t; }
    /* o estado LOCAL anda junto (como o "Ligar todos os nós"): a 2ª ligação da mesma viga vê o recuo e os furos da 1ª */
    function emular(ops) {
      ops.forEach(function (q) {
        if (q.op === "criar" && q.caixa) { var k = clone(q.caixa); k.id = String(q.id); porId[String(q.id)] = k; }
        else if (q.op === "metalFuros" && porId[String(q.id)]) { var c = clone(porId[String(q.id)]); c.metalFuros = arr(c.metalFuros).filter(function (f) { return f.lig !== q.lig; }).concat(arr(q.furos).map(function (f) { var h = clone(f); h.lig = q.lig; return h; })); porId[String(q.id)] = c; }
      });
    }
    /* 1. as vigas */
    var ids = pl.pecas.map(function (pc, i) {
      var c = M.barra(pc.a, pc.b, opcoesPeca(pl, pc, o));
      if (!c || c.erro) { res.pendentes.push({ texto: "Viga " + (i + 1) + ": " + ((c && c.erro) || "não deu para criar") }); return null; }
      var id = String(novoId()); c.id = id;
      res.ops.push({ op: "criar", id: id, caixa: c }); res.vigas.push(id); porId[id] = clone(c);
      return id;
    });
    var aDim = "esforços ESTIMADOS (sem o cálculo da estrutura): calcule a estrutura e confira a ligação com os esforços da análise";
    var motoresOk = !!(S0 && L0 && U && U.aplicarOpcao);
    /* 2. uma ligação pela sugestão que já existe (a mesma escolha do "Ligar todos os nós", parafusada) */
    function ligar(tipo, pecas, quer, rotulo, extra) {
      if (!motoresOk) return { ok: false, motivo: "os motores de ligação (js/acoligsugere.js, js/metalligacao.js, js/metalligsugui.js) não carregaram" };
      var cx = pecas.map(function (id) { return porId[String(id)]; });
      if (cx.some(function (x) { return !x; })) return { ok: false, motivo: "peça fora do modelo" };
      var pref = tipo === "viga-pilar" ? "flexivel" : undefined;
      var ctx = S0.analisar(cx, { resultado: o.resultado || null, fundacoes: o.fundacoes || [], preferir: pref });
      if (!ctx.ok) return { ok: false, motivo: ctx.motivo };
      if (quer && quer.indexOf(ctx.relacao) < 0) return { ok: false, motivo: "a sugestão leu o encontro como \"" + ctx.relacao + "\", não " + quer.join(" / ") };
      var opS = { execucao: "parafusada", preferir: pref, materiais: o.materiais || null }, CFo = global.AcoLigConfig, UIc = global.MetalLigSugUI, cfgO = o.configObra !== undefined ? o.configObra : (UIc && UIc.configuracaoSalva ? UIc.configuracaoSalva() : null);
      if (CFo && cfgO) { opS = CFo.opSugerir(cfgO, opS); opS.execucao = "parafusada"; }   /* F3b: a configuração da obra (as vigas entre pilares seguem parafusadas) */
      var sg = S0.sugerir(ctx, opS);
      var esc = S0.escolherLote(sg), op = esc.opcao;
      if (!op) return { ok: false, motivo: esc.motivo || "a sugestão não tem tipologia aplicável" };
      var a = U.aplicarOpcao(op, ctx, porId, novoId);
      if (!a.ok) return { ok: false, motivo: a.motivo };
      var adz = ctx.estimativa ? aDim : null;
      a.lote.ops.forEach(function (q) {
        var li = q.caixa && q.caixa.ligInfo; if (!li) return;
        li.origem = "vigas-pilares"; if (extra && extra.emenda) li.emenda = extra.emenda;
        if (adz) { li.aDimensionar = adz; li.passaEstimativa = !!li.ok; li.ok = false; }
      });
      emular(a.lote.ops); res.ops = res.ops.concat(a.lote.ops);
      if (adz) res.aDimensionar++;
      var item = { tipo: tipo, pecas: pecas.map(String), relacao: ctx.relacao, face: ctx.face, tipologia: op.tipologia, nome: op.nome, aDimensionar: adz, rotulo: rotulo };
      res.ligacoes.push(item);
      return { ok: true, item: item };
    }
    function falhou(r, rotulo, vigaId, ponta) {
      var t = rotulo + ": A DIMENSIONAR — " + r.motivo;
      res.ligacoes.push({ rotulo: rotulo, pendente: true, motivo: r.motivo, aDimensionar: t });
      res.aDimensionar++;
      if (vigaId) pendPonta(vigaId, ponta, "a dimensionar — " + r.motivo);
    }
    /* 2a. viga × pilar (dividir e grade): cada ponta na face */
    pl.pecas.forEach(function (pc, i) {
      var id = ids[i]; if (!id) return;
      ["a", "b"].forEach(function (k) {
        var pt = pc.pontas[k]; if (pt.tipo !== "pilar") return;
        var rot = "Viga " + (i + 1) + " × pilar " + pt.pilar + " (" + pt.face + ")";
        var r = ligar("viga-pilar", [id, pt.pilar], ["viga-pilar"], rot);
        if (!r.ok) falhou(r, rot, id, k);
      });
    });
    /* 2b. a viga contínua sobre o pilar (chapa de cabeça da tipologia viga-continua-cabeca) */
    pl.apoios.forEach(function (ap) {
      var id = ids[ap.peca]; if (!id) return;
      var rot = "Viga " + (ap.peca + 1) + " sobre o pilar " + ap.pilar;
      var r = ligar("viga-sobre-pilar", [id, ap.pilar], ["viga-sobre-pilar"], rot);
      if (!r.ok) falhou(r, rot, id, null);
    });
    /* 2c. as emendas */
    pl.emendas.forEach(function (e) {
      var i1 = ids[e.entre[0]], i2 = ids[e.entre[1]]; if (!i1 || !i2) return;
      var item = { tipo: e.tipo, pecas: [i1, i2], P: e.P, texto: e.texto, pilar: e.pilar || null, s: e.s || null };
      if (e.tipo === "continuidade") {
        var r = ligar("emenda", [i1, i2], ["emenda-viga"], "Emenda de continuidade", { emenda: "continuidade" });
        item.ligacao = r.ok ? r.item : null;
        if (!r.ok) { falhou(r, "Emenda de continuidade (vigas " + (e.entre[0] + 1) + " e " + (e.entre[1] + 1) + ")", i1, "b"); item.aDimensionar = "A DIMENSIONAR — " + r.motivo; }
        else item.aDimensionar = r.item.aDimensionar;
      } else {
        var r2 = emendaPilar(i1, i2, e.pilar);
        item.ligacao = r2.ok ? r2.item : null;
        if (!r2.ok) { falhou(r2, "Emenda sobre o pilar " + e.pilar, i1, "b"); item.aDimensionar = "A DIMENSIONAR — " + r2.motivo; }
        else item.aDimensionar = r2.item.aDimensionar;
      }
      res.emendas.push(item);
    });
    /* (a) EMENDA SOBRE O PILAR: a chapa de cabeça da viga contínua (js/metalligacao.js chapaCabeca) desenhada numa viga
       VIRTUAL das duas (a mesma linha), e os furos e enrijecedores devolvidos à viga de cada lado da junta */
    function emendaPilar(i1, i2, pid) {
      if (!L0 || !Bm) return { ok: false, motivo: "o motor das ligações (js/metalligacao.js) não carregou" };
      var b1 = porId[i1], b2 = porId[i2], pil = porId[String(pid)], P = pil ? pilarDe(pil) : null;
      if (!b1 || !b2 || !P) return { ok: false, motivo: "peça fora do modelo" };
      var w1 = M.linhaAtual(b1), w2 = M.linhaAtual(b2);
      var virt = M.barra(w1.a, w2.b, { ferr: "viga", cat: (b1.metal.perfil && b1.metal.perfil.cat) || o.cat || pl.cat, just: w1.just, recuo: { a: w1.recuo ? w1.recuo.a : 0, b: w2.recuo ? w2.recuo.b : 0 } });
      if (!virt || virt.erro) return { ok: false, motivo: (virt && virt.erro) || "viga virtual" };
      virt.id = "__mvp-virtual";
      var mv = Bm.membro(virt), along = Math.abs(dot(mv.X, P.B)) >= Math.abs(dot(mv.X, P.A)), D = P.dim;
      var xs = along && D.ehI ? [-(D.d - D.tf) / 2, (D.d - D.tf) / 2] : [-0.05, 0.05];
      var lig = String(novoId());
      var r = L0.aplicar("chapaCabeca", [virt, pil], { lig: lig, t: T_CABECA, enrij: { xs: xs, t: 0.0095 } });
      if (!r.ok) return { ok: false, motivo: r.motivo || "a chapa de cabeça recusou" };
      var tS = dot(sub(w1.b, mv.Pref), mv.X), m1 = Bm.membro(b1), m2 = Bm.membro(b2), fur = {};
      arr(r.furos[virt.id]).forEach(function (f) {
        var lado = num(f.x, 0) < tS ? { id: i1, m: m1 } : { id: i2, m: m2 }, g = clone(f);
        g.x = r6(num(f.x, 0) + dot(sub(mv.Pref, lado.m.Pref), mv.X));
        (fur[lado.id] = fur[lado.id] || []).push(g);
      });
      Object.keys(r.furos).forEach(function (k) { if (k !== virt.id) fur[k] = r.furos[k]; });
      r.furos = fur;
      r.pecas.forEach(function (q) { if (q.metal && String(q.metal.soldadaEm) === virt.id) { var tq = dot(sub([num(q.cx, 0), num(q.cy, 0), num(q.cz, 0)], mv.Pref), mv.X); q.metal.soldadaEm = tq < tS ? i1 : i2; } });
      var lote = L0.ops(r, novoId); if (!lote) return { ok: false, motivo: "nada a desenhar" };
      var txt = "emenda sobre o pilar: nesta emenda a viga deixa de ser contínua (as duas vigas biapoiadas no pilar " + pid + "); chapa de cabeça, parafusos e enrijecedores de partida — dimensionar com as reações da análise";
      var pri = lote.ops.filter(function (q) { return q.op === "criar" && q.caixa && q.caixa.metal && q.caixa.metal.papel === "Chapa de cabeça"; })[0];
      if (pri) pri.caixa.ligInfo = { v: 1, tipologia: "viga-continua-cabeca", nome: "Emenda sobre o pilar — chapa de cabeça", familia: "flexivel", regra: "R-VSP", pecas: [i1, i2, String(pid)], entrada: null, resumo: r.resumo || "",
        razao: 0, ok: false, estimativa: true, aDimensionar: txt, emenda: "pilar", origem: "vigas-pilares", em: new Date().toISOString() };
      emular(lote.ops); res.ops = res.ops.concat(lote.ops); res.aDimensionar++;
      var item = { tipo: "emenda-pilar", pecas: [i1, i2, String(pid)], tipologia: "viga-continua-cabeca", nome: "Emenda sobre o pilar — chapa de cabeça", aDimensionar: txt, rotulo: "Emenda sobre o pilar " + pid };
      res.ligacoes.push(item);
      return { ok: true, item: item };
    }
    /* 3. a pendência de ligação fica na RECEITA da viga (as Propriedades mostram "a dimensionar") */
    Object.keys(pend).forEach(function (id) {
      res.ops.forEach(function (q) { if (q.caixa && String(q.id) === id && q.caixa.metal && q.caixa.metal.cria && q.caixa.metal.cria.vp) q.caixa.metal.cria.vp.pend = clone(pend[id]); });
    });
    res.ok = res.vigas.length > 0;
    var nEm = res.emendas.length, nLig = res.ligacoes.filter(function (l) { return !l.pendente; }).length;
    res.resumo = res.vigas.length + " viga(s)" + (pl.modo === "continua" ? " contínua(s)" : " entre pilares") + ", " + nLig + " ligação(ões) parafusada(s)" + (nEm ? ", " + nEm + " emenda(s)" : "") +
      (res.aDimensionar ? " — " + res.aDimensionar + " A DIMENSIONAR" : "") + (pl.existentes ? "; " + pl.existentes + " vão(s) já tinham viga" : "") + (res.pendentes.length ? "; " + res.pendentes.length + " pendência(s)" : "") + ".";
    if (res.emendas.some(function (e) { return e.tipo === "pilar"; })) res.avisos.push("Nas emendas sobre o pilar a viga deixa de ser contínua: no cálculo as duas vigas ficam biapoiadas naquele apoio.");
    return res;
  }

  var MetalVigasPilares = {
    FOLGA: FOLGA, GAP_EMENDA: GAP_EMENDA, MAX_PADRAO: MAX_PADRAO, MAX_RAPIDOS: MAX_RAPIDOS, TOL_ALINH: TOL_ALINH, T_CABECA: T_CABECA, FRAC_EMENDA: FRAC_EMENDA,
    pilares: pilares, pilarDe: pilarDe, face: face, naLinha: naLinha, existentes: existentes, cobre: cobre, dividirSeg: dividirSeg, pares: pares,
    planoLinha: planoLinha, planoGrade: planoGrade, previa: previa, executar: executar, opcoesPeca: opcoesPeca, perfilDe: perfilDe
  };
  global.MetalVigasPilares = MetalVigasPilares;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalVigasPilares;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

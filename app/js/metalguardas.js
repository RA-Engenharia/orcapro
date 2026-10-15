/* =====================================================================
 * metalguardas.js — GUARDA-CORPOS PARAMÉTRICOS: o PREENCHIMENTO entre os
 * montantes, o VIDRO, a CANCELA na abertura e o VÃO-LUZ medido de cada
 * modelo (motor PURO, ES5, sem DOM, Node-testável). Frente M5, 14/10/2026.
 *
 * Pedido do Rogério: "quero parametrizado mais modelos de guarda-corpos, de
 * escadas etc." — industrial de 2 e de 3 travessas, com tela, com chapa
 * perfurada, com barras verticais (vão ≤ 11 cm, uso público), tubular
 * redondo e quadrado, com vidro, com cancela e o corrimão duplo.
 *
 * QUEM FAZ O QUÊ
 *   · os MONTANTES, o TRAVESSÃO SUPERIOR, as TRAVESSAS e o RODAPÉ continuam
 *     com o gerador de sempre (js/metalprontas.js guardaCorpo → o acabamento
 *     do js/metaldetalhe.js): este arquivo só ACRESCENTA o preenchimento de
 *     cada faixa entre duas travessas (um gancho de uma linha lá);
 *   · o preenchimento fica no PLANO DAS TRAVESSAS de baixo (a face interna
 *     dos montantes, onde o acabamento as põe) — lido das peças que o
 *     gerador acabou de criar, sem repetir a regra do lado interno;
 *   · cada peça leva `metal.lig = "gp-…"` (conjunto, não barra: não entra no
 *     modelo de cálculo como pilar) e `metal.acessorio = "guarda-corpo"`.
 *
 * O VÃO-LUZ (o que a esfera da norma enxerga, na projeção do guarda-corpo):
 *   barras verticais  (vão livre horizontal entre as faces: montante × barra
 *                     e barra × barra) — o número de barras sai do vão
 *                     máximo escolhido (vaoBarras), nunca de um passo fixo;
 *   tela / perfurada  a malha (ou o furo) e a folga até o montante;
 *   vidro             a junta até o montante e a folga até o travessão;
 *   e as faixas VERTICAIS entre a travessa de cima do preenchimento e o
 *   travessão superior; o vão do PISO à 1ª peça fica à parte (vaoInferior).
 *   A regra (≤ 0,11 m em uso público, NBR 14718; esfera de 0,15 m na saída
 *   de emergência, NPT 011) é do js/acoacessos.js — aqui só a medida.
 *
 * ⚠ O VIDRO NÃO É DIMENSIONADO aqui: a espessura e a fixação são da norma
 *   de vidro (ABNT NBR 7199) e do fabricante — sem o texto da norma na
 *   biblioteca, o cálculo sai INCOMPLETO (verificação crítica não feita).
 *
 * API
 *   MetalGuardas.TIPOS                       travessas | barras | tela | perfurada | vidro
 *   MetalGuardas.postsCaminho(pts, espac)    { P, posts, vaos, fechado } — a regra dos montantes
 *   MetalGuardas.espacamentos(posts, P)      { max, min, lista } (ao longo de cada trecho)
 *   MetalGuardas.preencher(K, pts, o, H, n0) nº de peças do preenchimento (gancho do guardaCorpo)
 *   MetalGuardas.vidroEmPerfil(K, pts, o, H) o vidro sem montantes, no perfil de base
 *   MetalGuardas.dividirCaminho(pts, s, larg) { antes, depois, a, b } (a abertura da cancela)
 *   MetalGuardas.telaKgM2(fio, malha), MetalGuardas.vidroEspessura("8+8")
 * Teste: node tools/test-metal-modelos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function AC() { return dep("AcoAcessos", "./acoacessos.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function rotY(v, th) { var c = Math.cos(th), s = Math.sin(th); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  var UP = [0, 1, 0], RHO = 7850, RHO_VIDRO = 2500;

  var TIPOS = {
    travessas: { rotulo: "Travessas (sem preenchimento)" },
    barras: { rotulo: "Barras verticais" },
    tela: { rotulo: "Tela (malha soldada)" },
    perfurada: { rotulo: "Chapa perfurada" },
    vidro: { rotulo: "Vidro laminado" }
  };
  function raioDe(pf) { if (!pf) return 0.024; if (pf.D) return pf.D / 2; if (pf.b) return pf.b / 2; if (pf.d) return pf.d / 2; return 0.024; }

  /* ------------------------------------------------ MONTANTES (a regra do gerador)
   * as pontas de cada trecho e a cada ≤ espac ao longo dele (comprimento real, inclinado na escada) — a MESMA
   * conta do js/metalprontas.js e do js/metaldetalhe.js: os testes contam com ela */
  function caminhoLimpo(pts) { var P = []; arr(pts).forEach(function (q) { if (!P.length || len(sub(q, P[P.length - 1])) > 0.05) P.push(q.slice()); }); return P; }
  function postsCaminho(pts, espac) {
    var P = caminhoLimpo(pts), nP = P.length, posts = [], vaos = [], es = num(espac, 1);
    var fechado = nP > 3 && len(sub(P[0], P[nP - 1])) < 1e-3;
    if (nP < 2 || !(es > 0)) return { P: P, posts: posts, vaos: vaos, fechado: fechado };
    for (var i = 0; i + 1 < nP; i++) {
      var a = P[i], d = sub(P[i + 1], a), L = len(d), nS = Math.max(1, Math.ceil(L / es - 1e-9));
      for (var k = 0; k <= nS; k++) { if (k === 0 && i > 0) continue; if (fechado && i === nP - 2 && k === nS) continue; posts.push(add(a, mul(d, k / nS))); }
      for (var k2 = 0; k2 < nS; k2++) vaos.push({ a: add(a, mul(d, k2 / nS)), b: add(a, mul(d, (k2 + 1) / nS)), seg: i, L: L / nS });
    }
    return { P: P, posts: posts, vaos: vaos, fechado: fechado };
  }
  /* o espaçamento entre montantes vizinhos do MESMO trecho (o que a alça de esticar tem de manter ≤ máximo) */
  function espacamentos(posts, P) {
    var ls = [], Pc = caminhoLimpo(P), ps = arr(posts);
    function naReta(q, i) { var a = Pc[i], d = sub(Pc[i + 1], a), L2 = dot(d, d); if (L2 < 1e-12) return false; var t = dot(sub(q, a), d) / L2; return t > -1e-6 && t < 1 + 1e-6 && len(sub(add(a, mul(d, t)), q)) < 1e-3; }
    for (var k = 1; k < ps.length; k++) for (var i = 0; i + 1 < Pc.length; i++) if (naReta(ps[k - 1], i) && naReta(ps[k], i)) { ls.push(len(sub(ps[k], ps[k - 1]))); break; }
    return { max: ls.length ? r4(Math.max.apply(null, ls)) : 0, min: ls.length ? r4(Math.min.apply(null, ls)) : 0, lista: ls.map(r4) };
  }

  /* ------------------------------------------------ PESOS */
  /* TELA SOLDADA de malha quadrada: fio Ø d a cada (malha + d) nas duas direções → kg/m² pela geometria (valor de partida) */
  function telaKgM2(fio, malha) { var d = num(fio, 0.004), a = num(malha, 0.05) + d; return a > 0 ? r4(2 * Math.PI * d * d / 4 * RHO / a) : 0; }
  /* "8+8" (mm) → espessura nominal do laminado (as lâminas + PVB de 0,76 mm por junta) */
  function vidroEspessura(comp) {
    var ls = String(comp == null ? "" : comp).split("+").map(function (s) { return num(s, NaN); }).filter(function (v) { return isFinite(v) && v > 0; });
    if (!ls.length) return null;
    var t = ls.reduce(function (s, v) { return s + v; }, 0) + 0.76 * (ls.length - 1);
    return { laminas: ls, n: ls.length, t: r4(t / 1000), pvb: ls.length - 1 };
  }

  /* ------------------------------------------------ o plano das travessas de baixo (lido das peças do gerador) */
  function inv(K, Pw) { return rotY(sub(Pw, K.F.O), -K.F.th); }
  function trilhos(K, n0, H) {
    var M = H && H.M ? H.M() : null, out = [];
    if (!M) return out;
    for (var i = n0; i < K.pecas.length; i++) {
      var c = K.pecas[i]; if (!c || !c.metal || c.metal.kind !== "perfil" || !/Travessa do guarda-corpo/.test(c.metal.papel || "")) continue;
      var mb = null; try { mb = M.membro(c); } catch (e) { mb = null; }
      if (!mb) continue;
      var a = inv(K, mb.P0), b = inv(K, add(mb.P0, mul(mb.X, mb.L)));
      out.push({ a: a, b: b });
    }
    return out;
  }
  /* a distância (com sinal) do trilho ao eixo do trecho, na horizontal perpendicular a ele */
  function desvioDoTrecho(tr, a, b) {
    var u = unit(sub(b, a)); if (!u) return null;
    var nH = unit([-u[2], 0, u[0]]); if (!nH) return null;
    var best = null;
    tr.forEach(function (t) {
      var ut = unit(sub(t.b, t.a)); if (!ut || Math.abs(dot(ut, u)) < 0.995) return;
      var m = mul(add(t.a, t.b), 0.5), dsl = dot(sub(m, a), nH), along = dot(sub(m, a), u), Ls = len(sub(b, a));
      if (along < -0.2 || along > Ls + 0.2) return;
      if (best == null || Math.abs(dsl) < Math.abs(best)) best = dsl;
    });
    return best == null ? null : { d: best, n: nH };
  }

  /* ------------------------------------------------ a CHAPA de preenchimento na faixa (vertical, segue a inclinação do trecho) */
  function painel(K, A, u, hz0, hz1, Lh, cosA, sinA, o, extra) {
    /* contorno no quadro ortonormal (ex = u do trecho, ey = perpendicular a u no plano vertical): um ponto (s ao longo da
       horizontal, h para cima) fica em (s/cos + h·sen, h·cos) — o painel tem os lados VERTICAIS mesmo no trecho inclinado */
    var ey = unit(sub(UP, mul(u, dot(UP, u)))) || UP;
    function q(s, h) { return [s / cosA + h * sinA, h * cosA]; }
    var C = [q(0, hz0), q(Lh, hz0), q(Lh, hz1), q(0, hz1)];
    var org = add(A, [0, 0, 0]);
    return K.chapa({ origem: org, ex: u, ey: ey, t: extra.t, contorno: C, papel: extra.papel, ifc: extra.ifc || "IFCPLATE", aco: extra.aco || o.aco || "ASTM A36", lig: extra.lig, nome: extra.nome }, extra.conta || "preenchimento");
  }

  /* ================================================================ PREENCHER
   * K: o construtor; pts: a linha de BASE local; o: as opções do guardaCorpo + { preenchimento, hInferior, hSub,
   * vaoBarras, barraD, telaFio, telaMalha, tPainel, furoD, furoPasso, folgaPainel, vidro, juntaVidro }; n0: o índice da
   * 1ª peça do guarda-corpo (para achar as travessas que ele criou). Devolve o nº de peças e guarda a medida em K._preench. */
  function preencher(K, pts, o, H, n0) {
    var tipo = String(o && o.preenchimento || "travessas"); if (tipo === "travessas" || !TIPOS[tipo]) return 0;
    var pm = H.perfilDe(o.montante), pc = H.perfilDe(o.corrimao); if (!pm) return 0;
    var G = postsCaminho(pts, o.espac), rM = raioDe(pm), rC = raioDe(pc), Hg = num(o.altura, 1.1), lig = "gp-" + o.gid, aco = o.aco || "ASTM A36", nIni = K.pecas.length;
    var cor2 = arr(o.corrimao2), trs = trilhos(K, num(n0, 0), H);
    /* as faixas: entre as travessas do preenchimento (as alturas que não são o travessão superior nem corrimão) */
    var R = arr(o.alturas).filter(function (h) { return Math.abs(h - Hg) > 1e-6 && cor2.indexOf(h) < 0; }).slice().sort(function (a, b) { return a - b; });
    var hInf = num(o.hInferior, 0.05), est = { tipo: tipo, vaoLuz: 0, vaoInferior: null, pecas: 0, faixas: [], kgm2: null, barras: 0, paineis: 0 };
    if (tipo === "vidro") R = [];
    var faixas = [];
    if (tipo === "vidro") {
      var vt = vidroEspessura(o.vidro && o.vidro.composicao || o.vidroComp) || { t: 0.01676 };
      faixas.push({ h0: hInf, h1: Hg - rC - num(o.folgaVidroTopo, 0.03), aberta: true });
      est.vidro = { composicao: (o.vidro && o.vidro.composicao) || o.vidroComp || "8+8", t: vt.t, fixacao: "montante" };
      est.vaoInferior = r4(hInf);
    } else {
      for (var i = 0; i + 1 < R.length; i++) faixas.push({ h0: R[i], h1: R[i + 1] });
      est.vaoInferior = R.length ? r4(Math.max(0, R[0] - rC - (o.rodape > 0 ? o.rodape : 0))) : null;
      /* a faixa de cima (travessa mais alta do preenchimento × travessão superior) e as faixas sem preenchimento entram no vão */
      if (R.length) est.vaoLuz = Math.max(est.vaoLuz, r4((Hg - rC) - (R[R.length - 1] + rC)));
    }
    if (!faixas.length) { K._preench = (K._preench || []).concat([est]); return 0; }
    var gMax = num(o.vaoBarras, 0.10), db = num(o.barraD, 0.016), fol = num(o.folgaPainel, 0.02), junta = num(o.juntaVidro, 0.015);
    G.vaos.forEach(function (v, jv) {
      var d = sub(v.b, v.a), u = unit(d); if (!u) return;
      var Lh = Math.sqrt(d[0] * d[0] + d[2] * d[2]); if (!(Lh > 2 * rM + 0.04)) return;
      var cosA = Lh / len(d), sinA = d[1] / len(d);
      var dv = desvioDoTrecho(trs, v.a, v.b), off = dv ? mul(dv.n, dv.d) : (tipo === "vidro" ? mul(unit([-u[2], 0, u[0]]) || [0, 0, 1], rM + num(o.afastVidro, 0.03) + (est.vidro ? est.vidro.t / 2 : 0.01)) : [0, 0, 0]);
      var base = function (s) { return add(add(v.a, mul(u, s / cosA)), off); };   /* s = horizontal a partir do montante A */
      var Lf = Lh - 2 * rM;
      faixas.forEach(function (fx, jf) {
        var z0 = fx.aberta ? fx.h0 : fx.h0 + rC, z1 = fx.aberta ? fx.h1 : fx.h1 - rC; if (!(z1 - z0 > 0.02)) return;
        if (tipo === "barras") {
          var nb = Math.max(0, Math.ceil((Lf - gMax) / (db + gMax) - 1e-9)), g = (Lf - nb * db) / (nb + 1);
          est.vaoLuz = Math.max(est.vaoLuz, r4(g));
          for (var k = 1; k <= nb; k++) {
            var s = rM + g * k + db * (k - 0.5), P0 = add(base(s), [0, z0, 0]);
            var c = K.perfil({ origem: P0, ex: UP, ey: [u[0], 0, u[2]], perfil: { forma: "circ", d: db }, L: z1 - z0, papel: "Barra vertical do guarda-corpo", ifc: "IFCMEMBER", aco: aco, lig: lig, nome: "Barra vertical " + (jv + 1) + "." + (k) + (faixas.length > 1 ? " — faixa " + (jf + 1) : "") }, "barras");
            if (c) { c.metal.solda = { tipo: "filete", perna: 3, lados: "contorno", campo: false, em: "travessa" }; est.barras++; }
          }
        } else {
          var t = tipo === "tela" ? 2 * num(o.telaFio, 0.004) : (tipo === "perfurada" ? num(o.tPainel, 0.003) : (est.vidro ? est.vidro.t : 0.017));
          var gap = tipo === "vidro" ? junta : fol, s0 = rM + gap, s1 = Lh - rM - gap; if (!(s1 - s0 > 0.05)) return;
          var A0 = base(s0), cp = painel(K, A0, u, z0, z1, s1 - s0, cosA, sinA, o, {
            t: t, lig: lig, aco: tipo === "vidro" ? "Vidro laminado " + est.vidro.composicao : aco, ifc: "IFCPLATE",
            papel: tipo === "tela" ? "Tela do guarda-corpo" : (tipo === "perfurada" ? "Chapa perfurada do guarda-corpo" : "Vidro laminado do guarda-corpo"),
            nome: (tipo === "tela" ? "Tela" : (tipo === "perfurada" ? "Chapa perfurada" : "Vidro")) + " " + (jv + 1) + (faixas.length > 1 ? " — faixa " + (jf + 1) : ""), conta: tipo === "vidro" ? "vidros" : "paineis" });
          if (!cp) return;
          est.paineis++;
          var area = (s1 - s0) * (z1 - z0), kg;
          if (tipo === "tela") { kg = telaKgM2(o.telaFio, o.telaMalha); cp.metal.tela = { fio: num(o.telaFio, 0.004), malha: num(o.telaMalha, 0.05), kgm2: kg, partida: true }; est.vaoLuz = Math.max(est.vaoLuz, num(o.telaMalha, 0.05), gap); }
          else if (tipo === "perfurada") { var A = AC(); kg = A ? A.pisoKgM2("perfurada", { t: t, furoD: o.furoD, furoPasso: o.furoPasso }).kgm2 : RHO * t * 0.6; cp.metal.perfurada = { t: t, furoD: num(o.furoD, 0.008), passo: num(o.furoPasso, 0.012), kgm2: kg }; est.vaoLuz = Math.max(est.vaoLuz, num(o.furoD, 0.008), gap); }
          else { kg = RHO_VIDRO * t; cp.metal.vidro = { composicao: est.vidro.composicao, t: t, fixacao: "montante", naoDimensionado: true }; est.vaoLuz = Math.max(est.vaoLuz, gap, r4((Hg - rC) - z1)); }
          est.kgm2 = kg;
          var ms = r4(kg * area); cp.massa = ms; cp.volume = r4(ms / (tipo === "vidro" ? RHO_VIDRO : RHO) * 1e4) / 1e4; cp.medidas = cp.medidas || {}; cp.medidas.massa = ms; cp.medidas.volume = cp.volume;
          /* VIDRO PRESO NOS MONTANTES: duas garras de cada lado (chapa com o furo do pino) — o modelo da garra é do fabricante */
          if (tipo === "vidro") [s0, s1].forEach(function (sx, js) { [z0 + 0.15, z1 - 0.15].forEach(function (zg, jg) {
            if (zg <= z0 || zg >= z1) return;
            var nU = unit([-u[2], 0, u[0]]) || [0, 0, 1], sg = dot(off, nU) >= 0 ? 1 : -1, Pg = add(add(add(v.a, mul(u, (js ? Lh - rM : rM) / cosA)), [0, zg, 0]), mul(nU, sg * rM));
            K.chapa({ origem: Pg, ex: mul(nU, sg), ey: UP, t: 0.008, ret: { L: Math.max(0.02, len(off) - rM + 0.01), B: 0.05 }, furos: [], papel: "Garra do vidro", aco: "ASTM A36", lig: lig, nome: "Garra " + (jv + 1) + "." + (js * 2 + jg + 1) }, "garras");
          }); });
        }
      });
    });
    for (var z = nIni; z < K.pecas.length; z++) if (K.pecas[z].metal) K.pecas[z].metal.acessorio = "guarda-corpo";
    est.pecas = K.pecas.length - nIni; est.vaoLuz = r4(est.vaoLuz);
    K._preench = (K._preench || []).concat([est]);
    return est.pecas;
  }

  /* ================================================================ VIDRO NO PERFIL DE BASE (sem montantes)
   * o perfil U deitado no piso ao longo do caminho, os painéis de vidro encaixados nele (até `painelMax` cada) e o
   * corrimão por cima do vidro (opcional). A espessura e o encaixe NÃO são dimensionados (NBR 7199 + fabricante). */
  function vidroEmPerfil(K, pts, o, H) {
    var P = caminhoLimpo(pts); if (P.length < 2) return { n: 0 };
    var vt = vidroEspessura(o.vidroComp) || { t: 0.01676 }, t = vt.t, Hg = num(o.altura, 1.1), lig = "gp-" + o.gid, n0 = K.pecas.length;
    var pU = H.perfilDe(o.perfilBase || "C75X6.1"), pc = o.corrimaoTopo ? H.perfilDe(o.corrimao) : null, rC = pc ? raioDe(pc) : 0, emb = num(o.embutimento, 0.10), junta = num(o.juntaVidro, 0.01), pMax = num(o.painelMax, 1.5);
    var est = { tipo: "vidro", vaoLuz: r4(junta), vaoInferior: 0, pecas: 0, paineis: 0, vidro: { composicao: o.vidroComp || "8+8", t: t, fixacao: "perfil" } };
    for (var i = 0; i + 1 < P.length; i++) {
      var a = P[i], b = P[i + 1], d = sub(b, a), L = len(d), u = unit(d); if (!u || Math.abs(u[1]) > 0.02) continue;   /* perfil de base só em trecho plano */
      if (pU) K.perfil({ origem: add(a, [0, (pU.d || 0.075) / 2, 0]), ex: u, ey: UP, perfil: pU, L: L, papel: "Perfil de base do vidro", ifc: "IFCMEMBER", aco: o.aco || "ASTM A36", lig: lig, nome: "Perfil de base " + (i + 1) }, "perfilBase");
      var nPn = Math.max(1, Math.ceil(L / pMax - 1e-9)), Lp = (L - (nPn + 1) * junta) / nPn;
      for (var k = 0; k < nPn; k++) {
        var s = junta + k * (Lp + junta), A0 = add(add(a, mul(u, s)), [0, (pU ? 0.01 : 0), 0]), z1 = Hg - (pc ? 2 * rC : 0);
        var ey = UP, cv = K.chapa({ origem: add(A0, mul(unit([-u[2], 0, u[0]]) || [0, 0, 1], -t / 2)), ex: u, ey: ey, t: t, ret: { L: Lp, B: z1 + emb - 0.01 }, papel: "Vidro laminado do guarda-corpo", ifc: "IFCPLATE", aco: "Vidro laminado " + est.vidro.composicao, lig: lig, nome: "Vidro " + (i + 1) + "." + (k + 1) }, "vidros");
        if (cv) { cv.origemVidro = true; var ms = r4(RHO_VIDRO * t * Lp * (z1 + emb - 0.01)); cv.massa = ms; cv.volume = r4(ms / RHO_VIDRO * 1e4) / 1e4; cv.medidas = cv.medidas || {}; cv.medidas.massa = ms; cv.metal.vidro = { composicao: est.vidro.composicao, t: t, fixacao: "perfil", embutimento: emb, naoDimensionado: true }; est.paineis++; }
      }
      if (pc) K.perfil({ origem: add(a, [0, Hg - rC, 0]), ex: u, ey: UP, perfil: pc, L: L, papel: "Travessa superior do guarda-corpo", ifc: "IFCRAILING", aco: o.aco || "ASTM A36", lig: lig, nome: "Corrimão sobre o vidro — trecho " + (i + 1) }, "guarda");
    }
    for (var z = n0; z < K.pecas.length; z++) if (K.pecas[z].metal) K.pecas[z].metal.acessorio = "guarda-corpo";
    est.pecas = K.pecas.length - n0;
    K._preench = (K._preench || []).concat([est]);
    return { n: est.pecas, est: est };
  }

  /* ================================================================ A ABERTURA (cancela)
   * o caminho cortado na posição s (fração 0..1 do comprimento total, o CENTRO da abertura) com a largura larg:
   * { antes: [pts], depois: [pts], a, b (as pontas da abertura) } — null se a abertura não cabe num trecho só */
  function dividirCaminho(pts, s, larg) {
    var P = caminhoLimpo(pts), Ls = [], tot = 0, i;
    for (i = 0; i + 1 < P.length; i++) { var l = len(sub(P[i + 1], P[i])); Ls.push(l); tot += l; }
    if (!(tot > 0) || !(larg > 0.3)) return null;
    var c = Math.max(0, Math.min(1, num(s, 0.5))) * tot, acc = 0;
    for (i = 0; i < Ls.length; i++) {
      if (c <= acc + Ls[i] + 1e-9) {
        var u = unit(sub(P[i + 1], P[i])), t0 = c - acc - larg / 2, t1 = c - acc + larg / 2;
        if (t0 < 0.15) { t1 += 0.15 - t0; t0 = 0.15; }
        if (t1 > Ls[i] - 0.15) { t0 -= t1 - (Ls[i] - 0.15); t1 = Ls[i] - 0.15; }
        if (t0 < 0.15 - 1e-9) return null;
        var A = add(P[i], mul(u, t0)), B = add(P[i], mul(u, t1));
        return { antes: P.slice(0, i + 1).concat([A]), depois: [B].concat(P.slice(i + 1)), a: A, b: B, trecho: i, largura: r4(t1 - t0) };
      }
      acc += Ls[i];
    }
    return null;
  }

  var MetalGuardas = { TIPOS: TIPOS, postsCaminho: postsCaminho, espacamentos: espacamentos, preencher: preencher, vidroEmPerfil: vidroEmPerfil, dividirCaminho: dividirCaminho,
    telaKgM2: telaKgM2, vidroEspessura: vidroEspessura, caminhoLimpo: caminhoLimpo, raioDe: raioDe };
  global.MetalGuardas = MetalGuardas;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalGuardas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

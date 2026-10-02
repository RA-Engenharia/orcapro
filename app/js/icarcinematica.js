/* =====================================================================
 * icarcinematica.js — ONDE CADA PEÇA DO EQUIPAMENTO ESTÁ: lança, braços, cabo e gancho.
 * Motor PURO (ES5, testável em Node). Especificação: ESPEC-ICAMENTO-CENARIO.md §II.3.3.
 *
 * Guindaste telescópico: dado o raio R do gancho (a partir do eixo de giro) e o comprimento L da lança (da tabela):
 *   α = acos((R − u_p)/L) · ponta em (u_p + L·cos α, w_p + L·sin α) · o cabo desce na vertical até o gancho.
 * Munck (2 braços + extensão): cinemática inversa de 2 elos (lei dos cossenos), "cotovelo para cima"; a MENOR extensão
 *   que alcança; se violar o limite de ângulo, tenta "cotovelo para baixo"; senão, aviso de fora do alcance.
 *
 * ⚠ Plano vertical da lança: r = horizontal a partir do eixo de giro, w = altura acima do apoio. Quem gira (θ) e põe
 *   no mundo é o desenho (js/bim.js); aqui é só o plano.
 * ⚠ Os números de geometria vêm da ficha (js/icarficha.js). Quando são da FORMA genérica (estimados), o desenho mostra
 *   tracejado — a cinemática não sabe e não precisa saber: ela só posiciona.
 * ===================================================================== */
(function (global) {
  "use strict";

  var GRAU = Math.PI / 180;
  function num(v) { var n = +v; return v !== null && v !== "" && v !== undefined && isFinite(n) ? n : null; }

  /* g = { peU, peW, L, dPonta, dMin, alfaMax (graus), Lmin, secoes } · alvo = { R, H (altura do gancho, opcional) } */
  function telescopica(g, alvo) {
    g = g || {}; alvo = alvo || {};
    var L = num(g.L), R = num(alvo.R), pu = num(g.peU) || 0, pw = num(g.peW) || 0;
    var o = { ok: false, avisos: [] };
    if (!(L > 0) || R == null) { o.avisos.push("Sem comprimento de lança ou raio."); return o; }
    var c = (R - pu) / L;
    if (c > 1 + 1e-12) { o.avisos.push("Raio de " + fmt(R) + " m maior que o alcance da lança de " + fmt(L) + " m."); return o; }
    if (c < -1) c = -1;
    var a = Math.acos(Math.min(1, c));
    o.alfa = a; o.alfaGraus = a / GRAU;
    o.pe = { r: pu, w: pw };
    o.ponta = { r: pu + L * Math.cos(a), w: pw + L * Math.sin(a) };
    var dP = num(g.dPonta) || 0, dMin = num(g.dMin) || dP;
    /* o gancho: na altura pedida (cabo pago) ou logo abaixo da ponta */
    var H = num(alvo.H);
    if (H != null) {
      o.gancho = { r: o.ponta.r, w: H };
      if (o.ponta.w - H < dMin - 1e-9) o.avisos.push("Gancho a " + fmt(H) + " m: acima do limite da ponta (" + fmt(o.ponta.w - dMin) + " m) — lança maior ou raio menor.");
    } else o.gancho = { r: o.ponta.r, w: o.ponta.w - dP };
    o.cabo = o.ponta.w - o.gancho.w;
    var aMax = num(g.alfaMax);
    if (aMax != null && o.alfaGraus > aMax + 1e-9) o.avisos.push("Ângulo da lança de " + fmt(o.alfaGraus, 1) + "° acima do máximo de " + fmt(aMax, 1) + "°: raio pequeno demais para esta lança.");
    /* telescopagem (aparência): as seções saem juntas, em proporção; a seção i (0 = base) desliza ext·i/(n−1) e as
       seções se encaixam umas nas outras (30 cm de folga de encaixe por seção) — a última termina na ponta */
    var n = Math.max(1, Math.round(num(g.secoes) || 1)), Lmin = Math.min(num(g.Lmin) || L, L), ext = Math.max(0, L - Lmin);
    o.secoes = [];
    for (var i = 0; i < n; i++) {
      var desl = n > 1 ? ext * i / (n - 1) : ext;
      o.secoes.push({ i: i, de: desl + 0.3 * i, ate: desl + Lmin - 0.3 * (n - 1 - i) });
    }
    o.ok = true;
    return o;
  }

  /* munck: m = { C: {r, w} (articulação da coluna), L1, L2, extMin, extMax, lim1: [min, max] (graus, 1ª lança com a horizontal),
     lim2: [min, max] (graus, 2ª lança relativa à 1ª) } · P = { r, w } (ponta desejada) */
  function munck(m, P) {
    m = m || {};
    var o = { ok: false, avisos: [] };
    var C = m.C || { r: 0, w: 0 }, L1 = num(m.L1), L2 = num(m.L2), eMin = num(m.extMin) || 0, eMax = num(m.extMax);
    if (!(L1 > 0) || !(L2 > 0) || !P) { o.avisos.push("Sem comprimento dos braços."); return o; }
    if (eMax == null) eMax = eMin;
    var dr = P.r - C.r, dw = P.w - C.w, d = Math.sqrt(dr * dr + dw * dw);
    /* a menor extensão que alcança */
    var e = Math.max(eMin, d - L1 - L2);
    if (e > eMax + 1e-9) { o.avisos.push("Ponta a " + fmt(d) + " m da coluna: além do alcance articulado (" + fmt(L1 + L2 + eMax) + " m)."); return o; }
    var l2 = L2 + e;
    if (d < Math.abs(L1 - l2) - 1e-9) { o.avisos.push("Ponta perto demais da coluna para os braços dobrarem até lá."); return o; }
    var cg = (L1 * L1 + d * d - l2 * l2) / (2 * L1 * d); cg = Math.max(-1, Math.min(1, cg));
    var gama = Math.acos(cg), beta = Math.atan2(dw, dr);
    function pose(sinal) {
      var a1 = beta + sinal * gama, cot = { r: C.r + L1 * Math.cos(a1), w: C.w + L1 * Math.sin(a1) };
      var a2 = Math.atan2(P.w - cot.w, P.r - cot.r);
      var rel = (a2 - a1) / GRAU; while (rel > 180) rel -= 360; while (rel < -180) rel += 360;
      return { a1: a1, a1Graus: a1 / GRAU, a2: a2, a2Graus: a2 / GRAU, relGraus: rel, cotovelo: cot, ponta: { r: P.r, w: P.w } };
    }
    function dentro(p) {
      var l1 = m.lim1, l2r = m.lim2;
      if (l1 && (p.a1Graus < l1[0] - 1e-9 || p.a1Graus > l1[1] + 1e-9)) return false;
      if (l2r && (p.relGraus < l2r[0] - 1e-9 || p.relGraus > l2r[1] + 1e-9)) return false;
      return true;
    }
    var cima = pose(1), escolha = cima, modo = "cima";
    if (!dentro(cima)) {
      var baixo = pose(-1);
      if (dentro(baixo)) { escolha = baixo; modo = "baixo"; o.avisos.push("Cotovelo para baixo: para cima passaria do limite dos cilindros."); }
      else { o.avisos.push("Posição fora do alcance articulado (limite de ângulo dos cilindros)."); return o; }
    }
    o.ok = true; o.modo = modo; o.ext = e; o.l2 = l2; o.d = d;
    o.coluna = C; o.cotovelo = escolha.cotovelo; o.ponta = escolha.ponta;
    o.a1Graus = escolha.a1Graus; o.a2Graus = escolha.a2Graus; o.relGraus = escolha.relGraus;
    return o;
  }

  /* do plano (r, w) e do giro θ (rad, 0 = para a dianteira +u) ao referencial do equipamento (u, v, w), com o giro em (giroU, 0) */
  function noEquipamento(pt, theta, giroU) {
    var c = Math.cos(theta || 0), s = Math.sin(theta || 0), g = num(giroU) || 0;
    return { u: g + pt.r * c, v: pt.r * s, w: pt.w };
  }

  function fmt(v, c) { return (Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toString().replace(".", ","); }

  var IcarCinematica = { telescopica: telescopica, munck: munck, noEquipamento: noEquipamento };
  global.IcarCinematica = IcarCinematica;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarCinematica;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

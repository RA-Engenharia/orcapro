/* =====================================================================
 * hidcatalogosn.js — as COTAS da ficha técnica do esgoto PVC série normal (Tigre FT Esgoto Série Normal, 2015), em mm, como a ficha traz
 * (15/11/2026, pedido do Rogério: "modele essas luvas de 40 mm corretamente com o catálogo"). Dados puros (ES5, Node-testável); marca só no
 * campo de fonte. Uma letra da ficha = uma chave (A, B, C, D...). Onde a ficha deixou valor ilegível: null + aConferir (nunca inventado).
 *   HidCatalogoSN.luva(dn)   → { A, B, D } da luva simples (A = comprimento, B = profundidade da bolsa, D = DE do tubo)
 *   HidCatalogoSN.junta(dn)  → "soldavel" (DN 40: sem anel de borracha) | "anel" (DN 50 em diante: bolsa de dupla atuação com anel)
 * ===================================================================== */
(function (global) {
  "use strict";
  var FONTE = "Tigre FT Esgoto Série Normal";
  var DNS = [40, 50, 75, 100, 150, 200];
  function por(dns, v) { var o = {}; dns.forEach(function (d, i) { o[String(d)] = v[i]; }); return o; }
  var T = {
    fonte: FONTE,
    /* p.7 — luva simples */
    luva: { pag: 7, A: por(DNS, [39, 62, 72.2, 83.5, 128, 157]), B: por(DNS, [18, 39, 44, 50, 67, 77]), D: por(DNS, [40, 50.7, 75.5, 101.6, 150, 200]) },
    /* p.7 — luva de correr */
    luvaCorrer: { pag: 7, A: por(DNS, [45, 82.5, 93, 113, 140, 210]), D: por(DNS, [40.5, 51.1, 76, 102.1, 150.5, 200.5]) },
    /* tubo SN: bolsa e parede */
    tubo: { pag: 7, B: por(DNS, [26, 42, 48, 55, 73, 77]), e: por(DNS, [1.2, 1.6, 1.7, 1.8, 2.5, 3.6]) },
    /* joelhos (40/50/75/100) */
    joelho90: { pag: 7, A: por([40, 50, 75, 100], [39, 70.6, 90, 110]), B: por([40, 50, 75, 100], [18, 40.1, 44, 50]), C: por([40, 50, 75, 100], [21, 29.9, 44, 58]) },
    joelho45: { pag: 7, A: por([40, 50, 75, 100], [27.5, 57.6, 68.7, 81.4]), B: por([40, 50, 75, 100], [18, 39, 44, 50]), C: por([40, 50, 75, 100], [18, 46, 52, 59]) }
  };

  /* ------------------------------------------------------------------ p.5 a p.8 (Tarefa 5): as demais conexões, só DADOS da ficha (as letras como a ficha
     traz). null = valor ilegível na ficha (marcado aConferir, nunca inventado). A criação das famílias paramétricas a partir daqui fica por tipo, com teste. */
  function tab(pag, dns, cols) { var o = { pag: pag, dns: dns.slice(), cotas: {} }; Object.keys(cols).forEach(function (k) { o.cotas[k] = por(dns, cols[k]); }); return o; }
  T.cap = tab(5, DNS, { A: [18, 39, 44, 50, 67, 103], D: [40, 50.7, 75.5, 101.6, 150, 200.5] });
  T.curva90Curta = tab(5, [50, 75, 100, 150], { A: [52, 95, 105, 135.6], B: [18, 39, 44, 50], C: [34, 55, 64, 80.8], D: [40, 50.7, 75.5, 106.55], R: [34, 77.42, 56.55, 101.6] });
  T.curva45Longa = tab(5, [50, 75, 100, 150, 200], { A: [124, 185, 220, 300, 420], B: [42, 48, 55, 73, 77], C: [139, 200, 230, 300, 400], D: [50.7, 75.5, 101.6, 150, 200], R: [105, 170, 200, 350, 450] });
  T.curva90Longa = tab(5, DNS, { A: [162, 185, 296, 344, 506, 550], B: [34, 42, 48, 55, 73, 77], C: [128, 157, 254, 327, 433, 473], D: [40, 50.7, 75.5, 101.65, 150, 200], R: [100, 108, 180, 208, 350, 450] });
  T.curvar45 = tab(5, [40, 100], { A: [58, 98], B: [45, 92], DE: [40, 101.6], d: [40, 101.6], e: [14.5, 19] });
  T.cruzeta = tab(5, [100], { D: [102.4], B: [50.4], H: [225.8], C: [118.2], A: [132] }); T.cruzeta.angulo = "87°30'";
  T.joelho90Anel = tab(6, [100], { A: [39], B: [26], b: [18], C: [21], D: [null] }); T.joelho90Anel.aConferir = "D ilegível na ficha";
  T.joelho90Visita = { pag: 6, k: "100x50", cotas: { A: 108, B: 50, C: 92, D: 101.6, d: 50.7, H: 202 } };
  T.juncaoDupla = tab(6, [75, 100], { A: [94.5, 129], B: [44, 50], C: [68, 80], D: [75.5, 101.6], H: [206.5, 259] });
  T.juncaoInvertida = { pag: 6, k: { "75x50": { A: 137, B: 41, b: 38, C: 23, c: 92, D: 75.5, d: 50.7 }, "75x75": { A: 137, B: 41, b: 41.5, C: 23, c: 102.5, D: 75.5, d: 75.5 } } };
  var KJ = ["40", "50x50", "75x50", "75x75", "100x50", "100x75", "100x100", "150x100", "150x150", "200x200"];
  function porK(v) { var o = {}; KJ.forEach(function (k, i) { o[k] = v[i]; }); return o; }
  T.juncao = { pag: 7, ks: KJ.slice(), cotas: { A: porK([95, 159.5, 172, 206.5, 185, 219.6, 259, 282, 351, 523]), B: porK([18, 39, 44, 44, 50, 50, 50, 67, 67, 77]), b: porK([18, 39, 39, 44, 39, 44, 50, 50, 67, 77]), C: porK([27, 56.5, 50, 68, 44.5, 61.6, 80, 66, 99, 115]), D: porK([50, 64, 79.5, 94.5, 100, 110.5, 129, 164, 185, 185]), d: porK([40, 50.7, 75.5, 75.5, 101.6, 101.6, 101.6, 150, 150, 200]), h: porK([40, 50.7, 75.5, 75.5, 50.7, 75.5, 101.6, 101.6, 150, 200]) } };
  T.plug = tab(7, [50, 75, 100], { A: [64, 73.6, 74.3], B: [39, 44, 41.4], DE: [50.7, 75.5, 101.6] });
  T.prolongamentoValvula = tab(7, [150], { A: [101], B: [21], DE: [150] });
  T.reducaoExcentrica = { pag: 7, ks: ["75x50?", "100x50", "100x75", "150x100", "200x150"], cotas: { A: [108.5, 130.5, 122, 148.9, 163.5], B: [39, 39, 44, 50, 60], C: [52, 59, 59, 67, 77], DE: [75.5, 101.6, 101.6, 150, 200], d: [50.7, 50.7, 75.5, 101.6, 150] }, aConferir: "o 1º par (75 × ?) é interrogação na ficha" };
  T.te = { pag: 8, ks: KJ.slice(), cotas: { A: porK([18, 46, 52, 52, 59, 59, 61, 67, 67, 77]), B: porK([39, 84.6, 109.8, 109.8, 97.6, 115.3, 137.6, 143.9, 182.5, 188]), C: porK([39, 79.4, 103.8, 103.8, 104.4, 116.6, 130.8, 154.2, 187, 225]), D: porK([40, 50.7, 75.5, 75.5, 101.6, 101.6, 101.6, 150, 150, 200]), d: porK([40, 50.7, 50.7, 75.5, 50.7, 75.5, 101.6, 101.6, 150, 200]), h: porK([78, 152, 194.5, 194.5, 178, 206, 241, 268.9, 330, 440]) } };
  T.teInspecao = { pag: 8, k: "100x75", cotas: { A: 95, B: 50, C: 67.3, D: 101.6, d: "2½\"", H: 187 } };
  T.terminalVentilacao = tab(8, [50, 75, 100], { A: [64, 73, 85], B: [62, 87, 115], C: [25.5, 31.5, 40], D: [50.7, 75.5, 101.6] });
  T.valvulaRetencao = tab(8, [100, 150], { A: [278, 303], B: [92.2, 121.5], C: [106.5, 41.5], D: [101.6, 150], DE: [160, 214], DL: [150, 205] });
  T.aneis = tab(8, [40, 50, 75, 100, 150], { e: [5, 6.2, 6.2, 6.2, 9.2], D: [37, 49.5, 74.6, 101.3, 149.8] });
  T.adaptadores = { pag: 4, maquinaLavarLouca: { k: "25/22-40/50", D1: 22, D2: 25, D3: 40, D4: 50, L: 20, A: 65 }, saidaVaso100: { A: 121.5, B: 57, C: 98, DE: 101.6 }, buchaLonga50x40: { A: 77, B: 26, De: 50.7, d: 40 } };
  function luva(dn) { var k = String(dn); return T.luva.A[k] == null ? null : { A: T.luva.A[k], B: T.luva.B[k], D: T.luva.D[k], fonte: FONTE + ", p." + T.luva.pag }; }
  function junta(dn) { return Number(dn) <= 40 ? "soldavel" : "anel"; }
  var HidCatalogoSN = { VERSAO: 1, DADOS: T, FONTE: FONTE, luva: luva, junta: junta };
  if (typeof module !== "undefined" && module.exports) module.exports = HidCatalogoSN; else global.HidCatalogoSN = HidCatalogoSN;
})(typeof window !== "undefined" ? window : globalThis);

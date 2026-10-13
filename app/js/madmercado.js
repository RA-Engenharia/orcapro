/* =====================================================================
 * madmercado.js — COMPATIBILIZAÇÃO COM O MERCADO e LISTA DE COMPRA da
 * madeira (motor PURO, ES5, sem DOM, Node-testável).
 *
 * Para cada peça (espécie, seção, comprimento de corte) responde:
 *   1. a seção EXISTE no catálogo do fornecedor? (bitola bruta × acabada)
 *   2. qual barra comercial comprar e como cortar (plano de corte 1D por
 *      "first fit decreasing" com perda de serra por corte), com sobra;
 *   3. o que NÃO tem fornecedor no catálogo → pendência visível (nunca
 *      "R$ 0,00", nunca seção trocada calada).
 *
 * Catálogo = lista de { fornecedor, produtoId, especie, b_mm, h_mm,
 * comprimentos_m[], bruta (bool), pagina, fonte }. O da Nibra vem de
 * dados-fonte/madeira/catalogos/nibra_pro_2025.json (Wood Framing pinus
 * autoclavado 50 × 100…300, 3/4/5/6 m, medidas BRUTAS, p. 5).
 *
 * ⚠ Medida BRUTA: o catálogo da Nibra diz "medidas brutas; para medidas
 *   finais consulte o departamento técnico". A peça calculada com 5×10
 *   nominal pode chegar aplainada menor. O motor marca `bruta: true` e o
 *   memorial avisa; a seção de cálculo é decisão do RT.
 * Teste: node tools/test-mad-mercado.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var MM = {};
  var SERRA_MM = 4;          // perda por corte (disco de serra) — parâmetro
  var TOPO_MM = 10;          // refilo de cada ponta da barra comprada — parâmetro

  function chaveSecao(b, h) { var a = Math.min(b, h), c = Math.max(b, h); return a + "x" + c; }
  MM.chaveSecao = chaveSecao;

  /** catálogo de madeira serrada a partir do JSON extraído (formato ESQUEMA.md) */
  MM.catalogoDeJson = function (json, fornecedor) {
    var out = [];
    (json.produtos || []).forEach(function (p) {
      if (p.categoria !== "madeira_serrada") return;
      (p.variantes || []).forEach(function (v) {
        var b = v.espessura_mm || v.b_mm, h = v.largura_mm || v.h_mm;
        var comp = v.comprimentos_m || (v.comprimento_m != null ? [v.comprimento_m] : (v.comprimento_mm != null ? [v.comprimento_mm / 1000] : null));
        if (!b || !h || !comp) return;
        out.push({ fornecedor: fornecedor || (json.fonte && json.fonte.fabricante) || "", produtoId: p.id, nome: p.nome_pt,
          especie: p.especie || "pinus_cca", b_mm: b, h_mm: h, comprimentos_m: comp.slice().sort(function (a, c) { return a - c; }),
          bruta: !!(v.bruta || p.medidas_brutas || /brut/i.test(String((p.dados_tecnicos || {}).obs || ""))), pagina: v.pagina || p.pagina, fonte: (json.fonte && json.fonte.arquivo) || "" });
      });
    });
    return out;
  };

  /** item do catálogo para (espécie, seção); null se não houver */
  MM.acharSecao = function (catalogo, especie, b_mm, h_mm) {
    var k = chaveSecao(b_mm, h_mm);
    for (var i = 0; i < catalogo.length; i++) {
      var c = catalogo[i];
      if (c.especie === especie && chaveSecao(c.b_mm, c.h_mm) === k) return c;
    }
    return null;
  };

  /**
   * Plano de corte 1D (first fit decreasing): cortes_mm[] em barras de comprimentos_m[].
   * Escolhe para cada barra nova o MENOR comprimento comercial em que a maior peça
   * pendente cabe (com refilo); depois enche a barra com as maiores que couberem.
   * → { barras: [{L_m, pecas_mm[], sobra_mm}], porComprimento: {L: n}, aproveitamento, semBarra: [mm] }
   */
  MM.planoDeCorte = function (cortes_mm, comprimentos_m, opc) {
    opc = opc || {};
    var serra = opc.serra_mm == null ? SERRA_MM : opc.serra_mm, topo = opc.topo_mm == null ? TOPO_MM : opc.topo_mm;
    var comps = comprimentos_m.map(function (x) { return Math.round(x * 1000); }).sort(function (a, b) { return a - b; });
    var maxUtil = comps[comps.length - 1] - 2 * topo;
    var pend = cortes_mm.slice().sort(function (a, b) { return b - a; });
    var semBarra = pend.filter(function (c) { return c > maxUtil; });
    pend = pend.filter(function (c) { return c <= maxUtil; });
    var barras = [];
    while (pend.length) {
      var maior = pend[0], L = null;
      for (var i = 0; i < comps.length; i++) if (comps[i] - 2 * topo >= maior) { L = comps[i]; break; }
      var livre = L - 2 * topo, pecas = [], resto = [];
      pend.forEach(function (c) {
        var gasto = pecas.length ? c + serra : c;
        if (gasto <= livre) { pecas.push(c); livre -= gasto; } else resto.push(c);
      });
      barras.push({ L_mm: L, L_m: L / 1000, pecas_mm: pecas, sobra_mm: livre });
      pend = resto;
    }
    /* troca a última barra (a mais vazia) pela menor que ainda serve */
    barras.forEach(function (b) {
      var usado = b.pecas_mm.reduce(function (s, c) { return s + c; }, 0) + serra * (b.pecas_mm.length - 1);
      for (var i = 0; i < comps.length; i++) if (comps[i] - 2 * topo >= usado) { if (comps[i] < b.L_mm) { b.sobra_mm = comps[i] - 2 * topo - usado; b.L_mm = comps[i]; b.L_m = comps[i] / 1000; } break; }
    });
    var por = {}, comprado = 0, util = 0;
    barras.forEach(function (b) { por[b.L_m] = (por[b.L_m] || 0) + 1; comprado += b.L_mm; util += b.pecas_mm.reduce(function (s, c) { return s + c; }, 0); });
    return { barras: barras, porComprimento: por, aproveitamento: comprado ? util / comprado : 0, comprado_m: comprado / 1000, util_m: util / 1000, semBarra: semBarra };
  };

  /**
   * Lista de compra de todas as peças.
   * pecas: [{ id, especie, b_cm, h_cm, comprimento_m }]
   * → { grupos: [{especie, secao, catalogo|null, n, util_m, plano|null, pendencia|null}], pendencias[] }
   */
  MM.listaDeCompra = function (pecas, catalogo, opc) {
    var g = {};
    pecas.forEach(function (p) {
      var b = Math.round(p.b_cm * 10), h = Math.round(p.h_cm * 10);
      var k = p.especie + "|" + chaveSecao(b, h);
      if (!g[k]) g[k] = { especie: p.especie, b_mm: Math.min(b, h), h_mm: Math.max(b, h), cortes: [], ids: [] };
      g[k].cortes.push(Math.round(p.comprimento_m * 1000));
      g[k].ids.push(p.id);
    });
    var grupos = [], pend = [];
    Object.keys(g).sort().forEach(function (k) {
      var x = g[k], cat = MM.acharSecao(catalogo, x.especie, x.b_mm, x.h_mm);
      var util = x.cortes.reduce(function (s, c) { return s + c; }, 0) / 1000;
      var item = { especie: x.especie, secao: (x.b_mm / 10) + "×" + (x.h_mm / 10) + " cm", b_mm: x.b_mm, h_mm: x.h_mm, n: x.cortes.length, util_m: util,
        volume_m3: util * x.b_mm * x.h_mm / 1e6, catalogo: cat, plano: null, pendencia: null };
      if (!cat) {
        item.pendencia = "seção " + item.secao + " de " + x.especie + " sem fornecedor no catálogo — cadastrar serraria/fornecedor ou trocar a seção (decisão do RT)";
        pend.push(item.pendencia);
      } else {
        item.plano = MM.planoDeCorte(x.cortes, cat.comprimentos_m, opc);
        if (item.plano.semBarra.length) {
          var msg = item.plano.semBarra.length + " peça(s) de " + item.secao + " maiores que a barra de " + cat.comprimentos_m[cat.comprimentos_m.length - 1] + " m (" + item.plano.semBarra.map(function (c) { return (c / 1000).toFixed(2); }).join(", ") + " m) — emenda ou fornecedor de barra longa";
          item.pendencia = msg; pend.push(msg);
        }
      }
      grupos.push(item);
    });
    return { grupos: grupos, pendencias: pend };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MM;
  else global.MadMercado = MM;
})(typeof window !== "undefined" ? window : this);

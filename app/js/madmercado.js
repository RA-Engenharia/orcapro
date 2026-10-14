/* =====================================================================
 * madmercado.js — COMPATIBILIZAÇÃO COM O MERCADO e LISTA DE COMPRA da
 * madeira (motor PURO, ES5, sem DOM, Node-testável).
 *
 * Para cada peça (espécie, seção, comprimento de corte) responde:
 *   1. a seção EXISTE no catálogo do fornecedor? (bitola bruta × acabada)
 *   2. qual barra comercial comprar e como cortar (plano de corte 1D por
 *      "first fit decreasing" com perda de serra por corte), com sobra;
 *   3. seção fora do catálogo: sai de uma bitola que existe (refilar a
 *      largura; compor 2 peças só em bloqueador) — dito na lista;
 *   4. espécie sem bitola em catálogo (folhosa nativa: Tatajuba, Itaúba)
 *      → COTAÇÃO em madeireira por m³, serrada sob medida (opc.sobMedida);
 *   5. o resto, sem fornecedor → pendência visível (nunca "R$ 0,00",
 *      nunca seção trocada calada).
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
  /**
   * Seção fora do catálogo, mas obtida de uma seção que existe (mesma espécie):
   *   · refilar: mesma espessura b, largura comercial imediatamente maior (5×12 sai da 5×15; sobra a tira);
   *   · compor: o dobro da espessura, mesma largura, SÓ em peça de travamento (opc.comporGrupo, ex. /BLOQ/):
   *     duas peças pregadas lado a lado (10×15 = 2 × 5×15).
   * Peça estrutural nunca é composta aqui (a ligação entre as lâminas muda o cálculo).
   */
  function origemNoCatalogo(catalogo, x, opc) {
    var mesmas = catalogo.filter(function (c) { return c.especie === x.especie; });
    var ref = null;
    mesmas.forEach(function (c) {
      var cb = Math.min(c.b_mm, c.h_mm), ch = Math.max(c.b_mm, c.h_mm);
      if (cb === x.b_mm && ch > x.h_mm && (!ref || ch < Math.max(ref.b_mm, ref.h_mm))) ref = c;
    });
    if (ref) return { tipo: "refilar", de: ref, fator: 1, texto: "refilar da " + (Math.min(ref.b_mm, ref.h_mm) / 10) + "×" + (Math.max(ref.b_mm, ref.h_mm) / 10) + " cm (" + ref.fornecedor + ")" };
    var rx = opc && opc.comporGrupo;
    if (rx && x.grupos.length && x.grupos.every(function (gr) { return rx.test(gr || ""); })) {
      for (var i = 0; i < mesmas.length; i++) {
        var c = mesmas[i], cb = Math.min(c.b_mm, c.h_mm), ch = Math.max(c.b_mm, c.h_mm);
        if (ch === x.h_mm && cb * 2 === x.b_mm) return { tipo: "compor", de: c, fator: 2, texto: "2 peças " + (cb / 10) + "×" + (ch / 10) + " cm pregadas lado a lado (" + c.fornecedor + ")" };
      }
    }
    return null;
  }

  MM.listaDeCompra = function (pecas, catalogo, opc) {
    opc = opc || {};
    var g = {};
    pecas.forEach(function (p) {
      var b = Math.round(p.b_cm * 10), h = Math.round(p.h_cm * 10);
      var k = p.especie + "|" + chaveSecao(b, h);
      if (!g[k]) g[k] = { especie: p.especie, b_mm: Math.min(b, h), h_mm: Math.max(b, h), cortes: [], ids: [], grupos: [] };
      g[k].cortes.push(Math.round(p.comprimento_m * 1000));
      g[k].ids.push(p.id);
      if (g[k].grupos.indexOf(p.grupo) < 0) g[k].grupos.push(p.grupo);
    });
    /* espécies compradas em madeireira, serradas na medida (sem bitola de catálogo): vão para a COTAÇÃO por m³, não para pendência */
    var sob = {}; (opc.sobMedida || []).forEach(function (s) { sob[s.especie] = s; });
    var grupos = [], pend = [], cot = {};
    Object.keys(g).sort().forEach(function (k) {
      var x = g[k], cat = MM.acharSecao(catalogo, x.especie, x.b_mm, x.h_mm);
      var util = x.cortes.reduce(function (s, c) { return s + c; }, 0) / 1000;
      var item = { especie: x.especie, secao: (x.b_mm / 10) + "×" + (x.h_mm / 10) + " cm", b_mm: x.b_mm, h_mm: x.h_mm, n: x.cortes.length, util_m: util,
        volume_m3: util * x.b_mm * x.h_mm / 1e6, catalogo: cat, plano: null, pendencia: null, origem: null, sobMedida: null };
      var org = !cat && opc.refilar !== false ? origemNoCatalogo(catalogo, x, opc) : null;
      if (org) {                                       // seção obtida de uma bitola do catálogo
        cat = org.de; item.origem = { tipo: org.tipo, texto: org.texto, de: (Math.min(cat.b_mm, cat.h_mm) / 10) + "×" + (Math.max(cat.b_mm, cat.h_mm) / 10) + " cm" };
        var cortes = org.fator === 2 ? x.cortes.concat(x.cortes) : x.cortes;
        item.catalogo = cat; item.plano = MM.planoDeCorte(cortes, cat.comprimentos_m, opc);
        if (item.plano.semBarra.length) { item.pendencia = item.plano.semBarra.length + " peça(s) de " + item.secao + " maiores que a barra de " + cat.comprimentos_m[cat.comprimentos_m.length - 1] + " m — emenda ou fornecedor de barra longa"; pend.push(item.pendencia); }
      } else if (!cat && sob[x.especie]) {             // madeireira, serrada sob medida
        var s = sob[x.especie];
        item.sobMedida = { fornecedor: s.fornecedor, unidade: "m³", obs: s.obs || null, maiorPeca_m: Math.max.apply(null, x.cortes) / 1000, cortes_m: x.cortes.map(function (c) { return c / 1000; }) };
        if (!cot[x.especie]) cot[x.especie] = { especie: x.especie, fornecedor: s.fornecedor, nomeEspecie: s.nome || x.especie, volume_m3: 0, secoes: [], maiorPeca_m: 0, obs: s.obs || null };
        cot[x.especie].volume_m3 += item.volume_m3; cot[x.especie].secoes.push(item.secao);
        cot[x.especie].maiorPeca_m = Math.max(cot[x.especie].maiorPeca_m, item.sobMedida.maiorPeca_m);
      } else if (!cat) {
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
    var cotacao = Object.keys(cot).sort().map(function (k) { return cot[k]; });
    return { grupos: grupos, pendencias: pend, cotacao: cotacao };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MM;
  else global.MadMercado = MM;
})(typeof window !== "undefined" ? window : this);

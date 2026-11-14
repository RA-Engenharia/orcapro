/* =====================================================================
 * mor/faixa.js — FAIXA DE CUSTO POR m² E POR ETAPA (F11 do MOR, ESPEC §15 item 6)
 *
 * Compara o custo direto por m² do orçamento (total e por etapa) com
 *   · as obras ANTERIORES do próprio sistema (orçamentos salvos que tenham área e custo) — mínimo, máximo e mediana;
 *   · o CUB, SOMENTE se houver um CUB importado (opts.cub = { valorM2, uf, competencia, rotulo }).
 * ⚠ Sem referência, diz «sem referência» — nenhum valor de mercado é inventado. O sistema ainda não importa CUB:
 *   a tela passa `cub:null` e o módulo responde «CUB não importado». O CUB é só informativo (razão custo/CUB), sem alerta,
 *   porque o limite aceitável seria um número que ninguém forneceu.
 * ⚠ Alerta de faixa só com ≥ 3 obras anteriores (como MorMemoria.faixa): com menos, «histórico curto».
 * Só obras da MESMA tipologia quando o orçamento atual tem tipologia. Custo = custo direto (qtd × custo unitário), sem BDI,
 * dos dois lados (comparação justa). Puro, ES5, sem DOM; não grava nada.
 *   analisar(orc, historico, opts) → { area, atual:{totalM2, etapas:{nome:m2}}, total:{…}, etapas:[…], cub:{…}, textos:[] }
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(x) { return Math.round(num(x) * 100) / 100; }
  function br(x) { return String(Math.round(num(x))).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function chaveEtapa(n) {
    var t = String(n == null ? "" : n);
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* segue */ }
    return t.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").toUpperCase();
  }

  var MIN_OBRAS = 3;

  function perfil(orc, area) {
    var tot = 0, et = {}, rot = {};
    arr(orc && orc.etapas).forEach(function (e) {
      var s = 0;
      arr(e && e.itens).forEach(function (it) { if (it) s += num(it.quantidade) * num(it.custoUnitario); });
      if (s > 0) { var k = chaveEtapa(e.nome); et[k] = (et[k] || 0) + s; rot[k] = rot[k] || e.nome; tot += s; }
    });
    var o = { total: tot, etapas: {}, rotulos: rot };
    if (area > 0) { o.totalM2 = tot / area; Object.keys(et).forEach(function (k) { o.etapas[k] = et[k] / area; }); }
    return o;
  }
  function areaDe(orc) { return num(orc && orc.mor && orc.mor.params && orc.mor.params.area); }

  function estat(vals, atual) {
    var n = vals.length;
    if (n < MIN_OBRAS) return { estado: "sem-referencia", n: n, alerta: false, texto: n ? "histórico curto (" + n + " obra(s) anterior(es); preciso de " + MIN_OBRAS + ")" : "sem referência (nenhuma obra anterior comparável)" };
    var s = vals.slice().sort(function (a, b) { return a - b; }), mn = s[0], mx = s[n - 1], med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    var fora = atual < mn || atual > mx;
    return { estado: fora ? "fora" : "ok", n: n, min: r2(mn), max: r2(mx), mediana: r2(med), atual: r2(atual), alerta: fora, direcao: atual > mx ? "acima" : (atual < mn ? "abaixo" : ""),
      texto: (fora ? "R$ " + br(atual) + "/m² está " + (atual > mx ? "ACIMA" : "ABAIXO") + " das suas " + n + " obras anteriores (" : "R$ " + br(atual) + "/m² está dentro das suas " + n + " obras anteriores (") + "R$ " + br(mn) + " a " + br(mx) + "/m², mediana " + br(med) + ")" };
  }

  function analisar(orc, historico, opts) {
    opts = opts || {};
    var area = opts.area !== undefined ? num(opts.area) : areaDe(orc), tp = orc && orc.mor && orc.mor.tipologia ? String(orc.mor.tipologia) : "";
    var out = { area: area, atual: null, total: null, etapas: [], cub: null, textos: [], nUsadas: 0 };
    if (!(area > 0)) {
      out.total = { estado: "sem-area", alerta: false, texto: "sem área da obra: informe a área para calcular o custo por m²" };
      out.cub = { estado: "sem-area", texto: out.total.texto }; out.textos.push(out.total.texto);
      return out;
    }
    var at = perfil(orc, area); out.atual = { total: r2(at.total), totalM2: r2(at.totalM2 || 0), etapas: {} };
    Object.keys(at.etapas).forEach(function (k) { out.atual.etapas[k] = r2(at.etapas[k]); });
    if (!(at.total > 0)) { out.total = { estado: "sem-valor", alerta: false, texto: "o orçamento ainda não tem valor: nada a comparar" }; out.textos.push(out.total.texto); out.cub = { estado: "sem-valor", texto: out.total.texto }; return out; }
    var ant = [];
    arr(historico).forEach(function (h) {
      if (!h || (orc && h.id && h.id === orc.id)) return;
      var a = areaDe(h); if (!(a > 0)) return;
      if (tp && String((h.mor && h.mor.tipologia) || "") !== tp) return;
      var p = perfil(h, a); if (!(p.total > 0)) return;
      ant.push(p);
    });
    out.nUsadas = ant.length;
    out.total = estat(ant.map(function (p) { return p.totalM2; }), at.totalM2);
    out.textos.push("Total: " + out.total.texto + ".");
    Object.keys(at.etapas).forEach(function (k) {
      var vals = []; ant.forEach(function (p) { if (p.etapas[k] > 0) vals.push(p.etapas[k]); });
      var e = estat(vals, at.etapas[k]); e.etapa = at.rotulos[k] || k; e.atualM2 = r2(at.etapas[k]);
      out.etapas.push(e);
      if (e.alerta) out.textos.push(e.etapa + ": " + e.texto + ".");
    });
    var cub = opts.cub;
    if (cub && num(cub.valorM2) > 0) {
      var razao = at.totalM2 / num(cub.valorM2);
      out.cub = { estado: "informativo", valorM2: r2(cub.valorM2), uf: cub.uf || "", competencia: cub.competencia || "", razao: r2(razao), alerta: false,
        texto: "Custo direto por m² = " + String(r2(razao * 100)).replace(".", ",") + "% do CUB" + (cub.uf ? " " + cub.uf : "") + (cub.competencia ? " " + cub.competencia : "") + " (R$ " + br(cub.valorM2) + "/m²). Só informativo." };
      if (cub.uf && orc && orc.uf && String(cub.uf).toUpperCase() !== String(orc.uf).toUpperCase()) out.cub.texto += " Atenção: o CUB é de " + cub.uf + " e o orçamento é de " + orc.uf + ".";
    } else out.cub = { estado: "sem-referencia", texto: "CUB: sem referência (não há CUB importado)" };
    out.textos.push(out.cub.texto + ".");
    return out;
  }

  var Faixa = { MIN_OBRAS: MIN_OBRAS, analisar: analisar };
  if (typeof module !== "undefined" && module.exports) module.exports = Faixa;
  global.MorFaixa = Faixa;
})(typeof window !== "undefined" ? window : globalThis);

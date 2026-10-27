/* =====================================================================
 * hidprecomercado.js — PREÇO DE REFERÊNCIA DE MERCADO (motor PURO, ES5, Node-testável). Pendências finais, 18/10/2026.
 *
 * Regra RA de orçamento (memória orcamento-sem-a-cotar): 100 % orçado, nada "a cotar"; na incerteza, o preço MAIS ALTO.
 * O item sem composição SINAPI (pressurizador, retenção de PVC, registro de gaveta de PVC, tê de inspeção de esgoto, o
 * dispositivo de inspeção de PVC Ø 300) leva o preço público de varejo — o MAIOR de pelo menos 3 lojas, com data e URL —
 * gerado por tools/gerar-hid-precos-mercado.js em js/hidprecomercadodados.js. NUNCA vira código SINAPI: o orçamento mostra
 * "referência de mercado (data, loja)", só fornecimento (a mão de obra não está no preço — o texto diz).
 *
 *   HidPrecoMercado.ref(id) → { id, valor, unidade, data, loja, url, nFontes, menosQueMinimo, nota, texto, fontes } | null
 *   HidPrecoMercado.soma(ids, rotulo) → a referência somada de um CONJUNTO (corpo + prolongadores + tampa) | null (falta uma)
 *   HidPrecoMercado.textoData(aaaa-mm-dd) → dd/mm/aaaa
 * Carregado SÓ no grupo "hidro" (prévia ?previa=hidro): sem ele, o BIM e o orçamento ficam como no master (pendente).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function D() { return dep("HidPrecoMercadoDados", "./hidprecomercadodados.js") || { itens: {}, ordem: [], semPreco: [] }; }
  function txt(v) { return v == null ? "" : String(v); }
  function textoData(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(d)); return m ? m[3] + "/" + m[2] + "/" + m[1] : txt(d); }   // hid:ok dígitos da data (não é norma)
  function moeda(v) { var s = (Math.round(v * 100) / 100).toFixed(2).split("."); s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); return "R$ " + s.join(","); }   // hid:ok milhar de 3 dígitos (formatação)
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function ref(id) {
    var it = D().itens[txt(id)]; if (!it) return null;
    var o = copia(it);
    o.texto = it.estimativa ? "ESTIMATIVA de mercado (" + textoData(it.data) + ", teto conservador: o preço de " + it.estimativaDe + ")" : "referência de mercado (" + textoData(it.data) + ", " + it.loja + ")";
    /* FRENTE 1g: preço de UMA fonte só entra, mas MARCADO "1 fonte — conferir" (aparece no orçamento) */
    o.criterio = it.estimativa ? it.nota + "; só fornecimento, sem mão de obra"
      : (!it.estimativa && it.nFontes === 1 ? "1 fonte — conferir: " : "") + "o maior de " + it.nFontes + " preço(s) público(s) de varejo (regra RA: na incerteza, o mais alto)" + (it.menosQueMinimo ? " — menos de " + D().minFontes + " fontes: " + it.nota : "") + "; só fornecimento, sem mão de obra";
    o.textoLongo = o.texto + " — " + moeda(it.valor) + "/" + it.unidade + "; " + o.criterio + "; " + it.url;
    return o;
  }
  /* um CONJUNTO comprado em peças (a caixa de PVC Ø 300: corpo + prolongadores + tampa): soma as referências; faltando
     uma, null (nunca um total pela metade) */
  function soma(ids, rotulo) {
    var refs = (ids || []).map(ref);
    if (!refs.length || refs.some(function (r) { return !r; })) return null;
    var tot = refs.reduce(function (s, r) { return s + r.valor; }, 0), datas = refs.map(function (r) { return r.data; }).sort();
    return { id: (ids || []).join("+"), valor: Math.round(tot * 100) / 100, unidade: "UN", data: datas[0], loja: refs.map(function (r) { return r.loja; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(" / "),
             url: refs[0].url, partes: refs, nFontes: Math.min.apply(null, refs.map(function (r) { return r.nFontes; })), menosQueMinimo: refs.some(function (r) { return r.menosQueMinimo; }),
             texto: "referência de mercado (" + textoData(datas[0]) + ", soma de " + refs.length + " peças" + (rotulo ? " — " + rotulo : "") + ")",
             criterio: refs.map(function (r) { return r.id + " " + moeda(r.valor) + " (" + r.loja + ")"; }).join(" + ") + "; só fornecimento, sem mão de obra" };
  }
  function ids() { return D().ordem.slice(); }
  function semPreco() { return D().semPreco.slice(); }

  var HidPrecoMercado = { VERSAO: 1, ref: ref, soma: soma, ids: ids, semPreco: semPreco, textoData: textoData };
  global.HidPrecoMercado = HidPrecoMercado;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPrecoMercado;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

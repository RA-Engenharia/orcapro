/* =====================================================================
 * arqquadros.js — OS QUADROS DAS PRANCHAS DE ARQUITETURA (motor PURO, ES5, sem DOM).
 * Tabelas do desenho da casa (AcoPranchas.Desenho.tabela), uma função por quadro. Cada uma recebe o
 * Desenho `D`, o canto (x, y) e a largura disponível `w`, e devolve { w, h } (o que ocupou).
 *
 *   quadroAreas(D, x, y, w, idx)            ÁREAS: terreno, construída existente / a demolir / a construir / total, projeção
 *   quadroIndices(D, x, y, w, idx)          ÍNDICES: ocupação, permeabilidade, aproveitamento × limite × ATENDE / NÃO ATENDE
 *   quadroRecuos(D, x, y, w, idx)           RECUOS por lado da divisa (edificação e cobertura)
 *   quadroEsquadrias(D, x, y, w, esq)       ESQUADRIAS: código, tipo, dimensão, peitoril, material, quantidade por fase
 *   quadroAcabamentos(D, x, y, w, ambs)     ACABAMENTOS por ambiente: área, piso, rodapé, parede, forro, pé-direito
 *   quadroLuminarias(D, x, y, w, ...)       resumo do forro
 * O que a lei do município pede e o modelo não traz sai com a palavra "informe" — nunca um número inventado.
 * Teste: tools/ (pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  var VERMELHO = "#c00000";
  function br(v, c) { if (v == null || !isFinite(v)) return "-"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  /* a largura das colunas, escalada para a largura disponível (as proporções ficam) */
  function cols(def, w) {
    var tot = 0; def.forEach(function (c) { tot += c.f; });
    return def.map(function (c) { return { t: c.t, w: c.f / tot * w, al: c.al }; });
  }
  function tabela(D, x, y, w, titulo, def, linhas, o) {
    o = o || {};
    var T = D.E.T, hT = 0;
    if (titulo) { D.texto(x, y + T.tabelaCab * 0.8, titulo, T.tabelaCab, { peso: 0.2 }); hT = T.tabelaCab * 1.5 + 1.2; }
    var r = D.tabela(x, y + hT, cols(def, w), linhas, { fs: o.fs || T.tabela, fsc: o.fsc || T.tabelaCab * 0.85 });
    return { w: r.w, h: r.h + hT };
  }
  function c2(v) { return br(v, 2); }

  function quadroAreas(D, x, y, w, idx) {
    var a = idx.areas, t = idx.terreno, p = idx.projecao;
    var L = [
      ["ÁREA DO TERRENO", t.area != null ? c2(t.area) : { t: "informe", cor: VERMELHO }],
      ["CONSTRUÍDA EXISTENTE (A MANTER)", c2(a.existente)], ["A DEMOLIR", c2(a.demolir)], ["A CONSTRUIR (AMPLIAÇÃO / REFORMA)", c2(a.construir)],
      { total: [{ t: "ÁREA CONSTRUÍDA TOTAL", cor: null }, c2(a.total)] },
      ["PROJEÇÃO DA EDIFICAÇÃO (APÓS A OBRA)", c2(p.depois)], ["PROJEÇÃO DA EDIFICAÇÃO (SITUAÇÃO EXISTENTE)", c2(p.antes)],
      ["ÁREA PERMEÁVEL (DESCOBERTA)", c2(idx.permeavel.area)]
    ];
    return tabela(D, x, y, w, "QUADRO DE ÁREAS (m²)", [{ t: "DISCRIMINAÇÃO", f: 4.2, al: "E" }, { t: "ÁREA m²", f: 1.2, al: "D" }], L);
  }
  function quadroIndices(D, x, y, w, idx) {
    var L = idx.verificacao.map(function (v) {
      var val = v.valor == null ? "-" : (v.un === "%" ? c2(v.valor) + " %" : c2(v.valor));
      var lim = v.limite == null ? { t: "informe", cor: VERMELHO } : ((v.op === "<=" ? "≤ " : "≥ ") + c2(v.limite) + (v.un === "%" ? " %" : ""));
      var sit = v.atende === true ? "ATENDE" : (v.atende === false ? { t: "NÃO ATENDE", cor: VERMELHO } : { t: "-", cor: null });
      return [v.rotulo, val, lim, sit];
    });
    var extra = idx.antes && idx.antes.ocupacaoPct != null ? [["Ocupação antes da obra (existente)", c2(idx.antes.ocupacaoPct) + " %", "", ""]] : [];
    return tabela(D, x, y, w, "ÍNDICES URBANÍSTICOS", [{ t: "ÍNDICE", f: 3.4, al: "E" }, { t: "PROJETO", f: 1.5, al: "D" }, { t: "LIMITE", f: 1.5, al: "D" }, { t: "SITUAÇÃO", f: 1.8, al: "C" }], L.concat(extra));
  }
  function quadroRecuos(D, x, y, w, idx) {
    var L = arr(idx.recuos).map(function (r) {
      return [txt(r.nome).toUpperCase(), c2(r.comprimento), r.recuo == null ? "-" : c2(r.recuo), r.recuoCobertura == null ? "-" : c2(r.recuoCobertura)];
    });
    if (!L.length) L = [[{ t: "sem divisa no modelo", cor: VERMELHO }, "", "", ""]];
    return tabela(D, x, y, w, "RECUOS (m)", [{ t: "DIVISA", f: 2.6, al: "E" }, { t: "TESTADA", f: 1.4, al: "D" }, { t: "EDIFICAÇÃO", f: 1.6, al: "D" }, { t: "COBERTURA", f: 1.6, al: "D" }], L);
  }
  function quadroEsquadrias(D, x, y, w, esq) {
    var L = arr(esq).map(function (q) {
      var tot = (q.qtd.novo || 0) + (q.qtd.existente || 0);
      var obs = q.dimPadrao ? { t: "conferir medida", cor: VERMELHO } : "";
      return [q.cod, q.tipo === "porta" ? "Porta" : "Janela", txt(q.nome), String(Math.round(q.largura * 100)), String(Math.round(q.altura * 100)), String(Math.round(q.peitoril * 100)),
        txt(q.material) || { t: "informe", cor: VERMELHO }, String(q.qtd.existente || 0), String(q.qtd.novo || 0), String(q.qtd.demolido || 0), String(tot), obs];
    });
    if (!L.length) L = [[{ t: "sem portas nem janelas no modelo", cor: VERMELHO }, "", "", "", "", "", "", "", "", "", "", ""]];
    return tabela(D, x, y, w, "QUADRO DE ESQUADRIAS", [{ t: "COD", f: 1 }, { t: "TIPO", f: 1.5 }, { t: "DESCRIÇÃO", f: 4.4, al: "E" }, { t: ["LARG", "(cm)"], f: 1.2 }, { t: ["ALT", "(cm)"], f: 1.2 }, { t: ["PEIT", "(cm)"], f: 1.2 },
      { t: "MATERIAL", f: 2.4, al: "E" }, { t: ["EXIST.", "MANTER"], f: 1.4 }, { t: ["A", "CONSTR."], f: 1.4 }, { t: ["A", "DEMOL."], f: 1.4 }, { t: ["QTD", "FINAL"], f: 1.2 }, { t: "OBS", f: 2.2, al: "E" }], L);
  }
  function quadroAcabamentos(D, x, y, w, ambs) {
    var L = arr(ambs).map(function (a) {
      function v(s) { return s ? s : { t: "informe", cor: VERMELHO }; }
      return [txt(a.numero), txt(a.nome).toUpperCase(), c2(a.area), v(a.piso), v(a.rodape), v(a.parede), v(a.forro), c2(a.pe)];
    });
    if (!L.length) L = [[{ t: "sem ambiente no modelo", cor: VERMELHO }, "", "", "", "", "", "", ""]];
    return tabela(D, x, y, w, "QUADRO DE ACABAMENTOS POR AMBIENTE", [{ t: "Nº", f: 0.8 }, { t: "AMBIENTE", f: 2.6, al: "E" }, { t: ["ÁREA", "(m²)"], f: 1.2 }, { t: "PISO", f: 3.2, al: "E" }, { t: "RODAPÉ", f: 2, al: "E" },
      { t: "PAREDES", f: 3.2, al: "E" }, { t: "FORRO", f: 3.2, al: "E" }, { t: ["PÉ-DIREITO", "(m)"], f: 1.5 }], L);
  }
  function quadroForros(D, x, y, w, forros, ambs, nLum) {
    var por = {}; arr(ambs).forEach(function (a) { por[a.id] = a; });
    var L = arr(forros).map(function (f) { var a = por[f.ambienteId]; return [txt(a ? a.nome : f.id).toUpperCase(), txt(f.tipo) || { t: "informe", cor: VERMELHO }, (f.cota > 0 ? "+" : "") + c2(f.cota), c2(f.area)]; });
    L.push({ total: [{ t: "LUMINÁRIAS (símbolo no desenho)", cor: null }, "", "", String(nLum)] });
    return tabela(D, x, y, w, "QUADRO DE FORROS", [{ t: "AMBIENTE", f: 2.6, al: "E" }, { t: "TIPO", f: 3.4, al: "E" }, { t: "NÍVEL (m)", f: 1.4 }, { t: ["ÁREA", "(m²)"], f: 1.2 }], L);
  }

  var ArqQuadros = { quadroAreas: quadroAreas, quadroIndices: quadroIndices, quadroRecuos: quadroRecuos, quadroEsquadrias: quadroEsquadrias, quadroAcabamentos: quadroAcabamentos, quadroForros: quadroForros, tabela: tabela };
  global.ArqQuadros = ArqQuadros;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqQuadros;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

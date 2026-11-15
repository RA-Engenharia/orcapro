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
 *   detalheEsquadrias(D, x, y, w, esq, o)   elevação 1:25 cotada de cada tipo do quadro de esquadrias (P1, J1…), só com os dados do modelo
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

  /* DETALHE DAS ESQUADRIAS (F1, 14/11/2026 — o padrão do Rogério: "tabelas de portas e janelas com detalhe"): a ELEVAÇÃO de cada tipo do quadro (P1, J1…) em 1:25, cotada,
     só com o que o modelo traz: largura, altura, peitoril, o nome da família e o material (informe, em vermelho, quando falta). A divisão das folhas vem do NOME da família
     (de correr = duas folhas com a seta do movimento; o resto = uma folha): o modelo não traz ferragem, vidro nem perfil, e o detalhe NÃO inventa. medir: só devolve a altura. */
  function detalheEsquadrias(D, x, y, w, esq, o) {
    o = o || {};
    var T = D.E.T, K = 40, lista = arr(esq), hTit = T.tabelaCab * 1.5 + 1.2, hL = T.nota * 1.6 + 1.5, cx = x, cy = y + hTit, rowH = 0, usada = 0, AD = global.ArqDesenho || (typeof require === "function" ? require("./arqdesenho.js") : null);
    function lw(s) { return AD ? AD.largTexto(s, T.nota) : s.length * T.nota * 0.62; }
    if (!o.medir) D.texto(x, y + T.tabelaCab * 0.8, "DETALHE DAS ESQUADRIAS - ELEVAÇÃO (ESC 1:25)", T.tabelaCab, { peso: 0.2 });
    if (!lista.length) return { w: 0, h: 0 };
    lista.forEach(function (q) {
      var L = Math.max(0.1, +q.largura || 0) * K, pe = Math.max(0, +q.peitoril || 0), A = Math.max(0.1, +q.altura || 0) * K, Hv = pe * K + A;
      var nome = txt(q.nome).toUpperCase().slice(0, 28), rot = txt(q.cod) + " - " + (nome || (q.tipo === "porta" ? "PORTA" : "JANELA")), mat = txt(q.material);
      var cw = Math.max(L + 30, lw(rot) + 4, 52), ch = hL + Hv + 12 + 6;
      if (cx > x && cx + cw > x + w) { cx = x; cy += rowH + 5; rowH = 0; }
      rowH = Math.max(rowH, ch); usada = Math.max(usada, cx + cw - x);
      if (!o.medir) {
        var x0 = cx + 18 + (cw - 30 - L) / 2, yb = cy + hL + Hv + 1.5, yt = yb - Hv, corre = /correr/i.test(txt(q.famId) + " " + txt(q.nome));
        D.texto(cx, cy + T.nota * 0.8, rot, T.nota);
        D.linha(x0 - 6, yb, x0 + L + 6, yb, "ARQ-TERRENO");                                   /* o piso acabado */
        var yv0 = yb - pe * K;                                                              /* a base do vão (peitoril) */
        D.ret(x0, yt, L, yv0 - yt, "ARQ-VAO");                                              /* o vão */
        D.ret(x0 + 0.8, yt + 0.8, L - 1.6, yv0 - yt - 1.6, "ARQ-FINA");                     /* o marco (folga de 2 cm no papel) */
        if (corre) {
          D.linha(x0 + L / 2, yt + 0.8, x0 + L / 2, yv0 - 0.8, "ARQ-FINA");
          var ym = (yt + yv0) / 2; D.linha(x0 + 3, ym, x0 + L / 2 - 3, ym, "ARQ-FINA"); D.cheio([[x0 + L / 2 - 3, ym], [x0 + L / 2 - 5.2, ym - 0.9], [x0 + L / 2 - 5.2, ym + 0.9]], "#000");
          D.linha(x0 + L / 2 + 3, ym, x0 + L - 3, ym, "ARQ-FINA"); D.cheio([[x0 + L / 2 + 3, ym], [x0 + L / 2 + 5.2, ym - 0.9], [x0 + L / 2 + 5.2, ym + 0.9]], "#000");
        }
        /* cotas: largura embaixo; altura (e o peitoril, quando há) à esquerda */
        D.cota(x0, yb + 5, x0 + L, yb + 5, 0, AD ? AD.cotaTxt(+q.largura) : br(+q.largura, 2), { desde: [false, false], semExt: true });
        var xv = x0 - 6, pv = pe > 0.005 ? [[xv, yb], [xv, yv0], [xv, yt]] : [[xv, yb], [xv, yt]], vv = pe > 0.005 ? [AD ? AD.cotaTxt(pe) : br(pe, 2), AD ? AD.cotaTxt(+q.altura) : br(+q.altura, 2)] : [AD ? AD.cotaTxt(+q.altura) : br(+q.altura, 2)];
        D.cadeia(pv, 0, vv, { offs: [4.5], desde: pv.map(function () { return false; }), semExt: true });
        if (q.dimPadrao) D.texto(cx + cw - 2, cy + T.nota * 0.8, "CONFERIR MEDIDA", T.nota * 0.8, { al: "D", cor: VERMELHO });
        if (!mat) D.texto(cx + cw - 2, yb + 5 + T.nota * 1.4, "MATERIAL: INFORME", T.nota * 0.8, { al: "D", cor: VERMELHO });
      }
      cx += cw + 4;
    });
    return { w: usada, h: (cy + rowH) - y };
  }

  var ArqQuadros = { quadroAreas: quadroAreas, quadroIndices: quadroIndices, quadroRecuos: quadroRecuos, quadroEsquadrias: quadroEsquadrias, quadroAcabamentos: quadroAcabamentos, quadroForros: quadroForros, detalheEsquadrias: detalheEsquadrias, tabela: tabela };
  global.ArqQuadros = ArqQuadros;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqQuadros;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimfundo.js — FUNDO (Padrão | Branco | Preto) e GRADE da vista 3D do BIM.
 * Motor puro (sem DOM, sem three): o js/bim.js aplica; a tela mora em
 * Propriedades › Gráficos da vista 3D (js/gestao.js, _bimPropsVista).
 *
 * Por quê (27/10/2026): material de venda e apresentação ao cliente sai com o
 * 3D sem grade e com fundo branco ou preto — antes só por script.
 *   - "padrao" = o fundo do tema (cena transparente sobre o contêiner) e o céu
 *     físico quando há sol; "branco" e "preto" = cor lisa, sem céu.
 *   - grade: null = a pessoa nunca mexeu (vale o padrão: ligada na tela, fora
 *     da foto HD); true/false = escolha dela, que vale também na foto.
 *   - preferência por pessoa e aparelho (localStorage, chave orcapro:tela:...).
 * ===================================================================== */
(function (global) {
  "use strict";
  var CHAVE = "orcapro:tela:bim-fundo:v1";
  var MODOS = [{ id: "padrao", rotulo: "Padrão" }, { id: "branco", rotulo: "Branco" }, { id: "preto", rotulo: "Preto" }];
  var COR = { branco: 0xffffff, preto: 0x000000 };
  var CSS = { branco: "#ffffff", preto: "#000000" };

  function modo(m) { m = String(m || ""); return m === "branco" || m === "preto" ? m : "padrao"; }
  function cor(m) { m = modo(m); return m === "padrao" ? null : COR[m]; }
  function css(m) { m = modo(m); return m === "padrao" ? null : CSS[m]; }
  /* contorno/arestas escuros somem no preto: nele as linhas ficam claras */
  function contorno(m, padrao) { return modo(m) === "preto" ? 0xe6e6e6 : padrao; }
  function gradeEfetiva(g) { return g === null || g === undefined ? true : !!g; }

  function ler(st) {
    var r = { fundo: "padrao", grade: null };
    try {
      st = st || (typeof localStorage !== "undefined" ? localStorage : null);
      var raw = st ? st.getItem(CHAVE) : null, o = raw ? JSON.parse(raw) : null;
      if (o && typeof o === "object") { r.fundo = modo(o.fundo); r.grade = typeof o.grade === "boolean" ? o.grade : null; }
    } catch (e) { /* storage ausente ou corrompido: volta ao padrão, nunca trava a tela */ }
    return r;
  }
  function gravar(pref, st) {
    try {
      st = st || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!st) return false;
      st.setItem(CHAVE, JSON.stringify({ fundo: modo(pref && pref.fundo), grade: pref && typeof pref.grade === "boolean" ? pref.grade : null }));
      return true;
    } catch (e) { return false; }
  }

  var BimFundo = { CHAVE: CHAVE, MODOS: MODOS, modo: modo, cor: cor, css: css, contorno: contorno, gradeEfetiva: gradeEfetiva, ler: ler, gravar: gravar };
  global.BimFundo = BimFundo;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFundo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * hidpressaoui.js — fiação FINA da pressurização na tela do dimensionamento
 * (js/hidcalcui.js). O motor é o js/hidpressao.js; aqui só:
 *   · as opções (a)–(d) do aviso "pressão insuficiente" viram soluções do
 *     cartão único (js/problemacard.js): a que tem ops vira botão "Corrigir",
 *     a que não tem vira NOTA (custo + consequência), nunca botão vazio;
 *   · aplicar = UM lote no editor do BIM (um Ctrl+Z desfaz o conjunto inteiro:
 *     bombas, base, uniões, registros, retenção, by-pass, dreno, ponto de força)
 *     e dimensionar de novo — a pressão do ponto é RECALCULADA com a curva.
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }

  /* soluções do cartão para o aviso i (ids "pz<i>_<k>") */
  function solucoes(c, i) {
    return arr(c && c.opcoes).map(function (o, k) {
      var tem = arr(o.ops).length > 0;
      return { id: "pz" + i + "_" + k, temOps: tem, ops: o.ops, pecas: [],
               texto: tem ? "(" + o.id + ") modelar " + (o.modelo ? (o.n > 1 ? o.n + " × " : "") + o.modelo : o.titulo) : "(" + o.id + ") " + o.titulo + ": " + txt(o.consequencia) + (o.custo ? " — custo: " + o.custo : ""),
               rotulo: "(" + o.id + ") " + o.titulo.replace(/ \(.*\)$/, ""),
               muda: txt(o.consequencia) + (o.custo ? " · custo: " + o.custo : "") };
    });
  }
  /* o texto do cartão: as quatro opções com custo e consequência (a pessoa compara antes de clicar) */
  function texto(c) {
    return arr(c && c.opcoes).map(function (o) { return "(" + o.id + ") " + o.titulo + (o.resolve ? "" : " — não resolve") + ": " + txt(o.consequencia) + (o.custo ? " · custo estimado: " + o.custo : ""); }).join("  ‖  ");
  }
  function aplicar(i, k) {
    var CU = global.HidCalcUI, E = CU && CU.estado, a = E && E.resultado && E.resultado.avisos[i], o = a && a.corrigir && arr(a.corrigir.opcoes)[k];
    var B = global.BIM;
    if (!o || !arr(o.ops).length) return false;
    if (!B || !B.editarLote) { E.msg = { k: "erro", t: "O editor do BIM não está disponível para modelar o conjunto." }; CU.redesenhar(); return false; }
    var ok = B.editarLote({ op: "lote", id: "hidpz-" + String(new Date().getTime()), origem: "hidrossanitario", ops: JSON.parse(JSON.stringify(o.ops)) });
    if (!ok) { E.msg = { k: "erro", t: "O editor recusou o conjunto de pressurização (nada foi alterado)." }; CU.redesenhar(); return false; }
    CU.dimensionar();
    E.msg = { k: "ok", t: "Modelado: " + o.titulo + " — " + txt(o.consequencia).split(";")[0] + ". A rede foi recalculada com a curva do equipamento. Ctrl+Z desfaz o conjunto inteiro." };
    CU.redesenhar();
    try { if (B.enquadrarUids) B.enquadrarUids(arr(o.pecas).slice(0, 40).map(function (id) { return "edit:" + id; })); } catch (e) {}   // hid:ok limite de peças enquadradas (tela)
    return true;
  }
  var HidPressaoUI = { VERSAO: 1, solucoes: solucoes, texto: texto, aplicar: aplicar };
  global.HidPressaoUI = HidPressaoUI;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPressaoUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

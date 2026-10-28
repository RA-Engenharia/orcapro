/* =====================================================================
 * bimembutido.js — PEÇA EMBUTIDA: o pilar dentro da parede que a arquitetura não desenha (motor PURO, ES5, Node-testável).
 *
 * POR QUE. Casa 487 (27/10/2026): o Rogério pediu "pilares embutidos nas paredes novas: não aparecem na arquitetura, aparecem no
 * projeto estrutural". O modelo não tinha visibilidade por disciplina para as peças do modelador (a "disciplina" da fita é de
 * FERRAMENTAS; o js/bimdisc.js agrupa por IFC/carimbo na árvore). O pilar é uma peça só, no mesmo modelo — o que muda é QUEM A VÊ.
 *
 * O CONTRATO. A caixa de um pilar (ou viga) embutido leva `embutido: true` (e, por informação, `hospedeira`: o id da parede). Este
 * motor responde:
 *   BimEmbutido.eEmbutido(c)               → a peça é embutida?
 *   BimEmbutido.oculta(c, disciplina)      → true se a vista dessa disciplina NÃO deve desenhá-la (arquitetura, hidráulica…);
 *                                            a estrutura e a vista "todas" (e a fundação) desenham.
 *   BimEmbutido.filtrar(caixas, disciplina)→ as caixas que a vista da disciplina desenha (planta, prancha, 3D).
 *   BimEmbutido.marcar(c, hospedeiraId)    → põe o carimbo na caixa (idempotente).
 *   BimEmbutido.resumo(caixas)             → { total, porHospedeira } para o relatório.
 * Disciplina vem do registro do js/bimdisciplinas.js (ids: completo, civil, estrutura, hidraulica, eletrica, metalica,
 * marcenaria, marmoraria…). Sem disciplina informada (null/""): desenha (vista sem filtro) — nunca esconde peça por engano.
 *
 * ⚠ ISTO É FILTRO DE VISTA. Quantitativo, orçamento, IFC e auditores seguem contando a peça: o pilar existe e custa dinheiro.
 * ⚠ GANCHO NO DESENHO (fora deste arquivo — js/bim.js, onde as caixas viram malha em editRebuild): `if (window.BimEmbutido &&
 *   BimEmbutido.oculta(c, disciplinaAtiva)) return;` no início do st.caixas.forEach. Enquanto o gancho não entra, o pilar tem a
 *   espessura da parede (as faces coincidem com as da parede) e, no 3D, só é visto se a vista cortar a parede.
 * Teste: node tools/test-bimembutido.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* quem DESENHA a peça embutida: a estrutura, a vista de todas as disciplinas e a metálica/fundação que a acompanham */
  var VEEM = { completo: 1, estrutura: 1 };
  var TIPOS = { pilar: 1, viga: 1 };

  function eEmbutido(c) { return !!(c && c.embutido === true && TIPOS[c.tipo]); }
  function oculta(c, disciplina) {
    if (!eEmbutido(c)) return false;
    var d = disciplina == null ? "" : String(disciplina);
    if (!d) return false;
    return !VEEM[d];
  }
  function filtrar(caixas, disciplina) {
    return (Array.isArray(caixas) ? caixas : []).filter(function (c) { return !oculta(c, disciplina); });
  }
  function marcar(c, hospedeiraId) {
    if (!c || !TIPOS[c.tipo]) return c;
    c.embutido = true;
    if (hospedeiraId != null) c.hospedeira = String(hospedeiraId);
    return c;
  }
  function resumo(caixas) {
    var out = { total: 0, porHospedeira: {} };
    (Array.isArray(caixas) ? caixas : []).forEach(function (c) {
      if (!eEmbutido(c)) return;
      out.total++;
      var h = c.hospedeira || "(sem hospedeira)";
      out.porHospedeira[h] = (out.porHospedeira[h] || 0) + 1;
    });
    return out;
  }

  var BimEmbutido = { VEEM: VEEM, eEmbutido: eEmbutido, oculta: oculta, filtrar: filtrar, marcar: marcar, resumo: resumo };
  global.BimEmbutido = BimEmbutido;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEmbutido;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * pranchavivamodulo.js — a LICENÇA do módulo PRANCHA VIVA (motor puro, Node-testável)
 *
 * Pedido do Rogério (21/10/2026): a Prancha Viva é módulo À PARTE, no mesmo esquema do Blocok e da Marmoraria — a
 * prancha do projeto que leva ao 3D no ponto tocado (corte na cota, disciplinas, medir, a peça com o item do orçamento e
 * a etapa do cronograma) e o pacote leve para o celular do cliente. O preço ainda não foi decidido: a OFERTA está
 * DESLIGADA (o texto está pronto aqui; ligar é no VPS — docs/prancha-viva/OFERTA.md).
 *
 * QUEM LIBERA (nesta ordem):
 *   1. a trava da MÁQUINA da RA (`orcapro:pranchaviva:owner` = "1", como a do Blocok e a da Marmoraria);
 *   2. Modela.tem("pranchaviva"): compra do módulo, licença interna pelo servidor (vendas-config modela.internos),
 *      o teste de 7 dias do Modela já começado, a vitrine (?demo=1) e o TESTE DE 1 HORA por módulo (js/testemodulo.js)
 *      — a regra mora em js/modela.js;
 *   fora disso → trancado. A VITALÍCIA do OrçaPRO e a licença interna da RA LIBERAM (23/10/2026, "vitalícia = tudo";
 *   a regra mora em js/modela.js: `tem(id)` responde true com `tudo`). O pacote Modela COMPLETO não (só as 6 disciplinas).
 * ⚠ A TRAVA É NA FUNÇÃO, NÃO NO BOTÃO: todo comando do módulo (js/pranchavivaui.js) passa por `guarda()` antes de
 *   fazer qualquer coisa; o atalho, a busca, o Navegador e o console chamam o comando direto.
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";
  var ID = "pranchaviva";
  var OWNER = "orcapro:pranchaviva:owner";

  /* o texto da oferta (pronto; a venda só liga quando o servidor listar um plano modela_pranchaviva_*) */
  var OFERTA = {
    titulo: "Prancha Viva",
    subtitulo: "A prancha do projeto que abre o prédio no ponto tocado.",
    itens: [
      "Toque num ponto da planta, do corte ou da fachada: o modelo sai da folha e o 3D abre exatamente ali.",
      "No 3D: o corte na cota da prancha com a alça para arrastar, as disciplinas liga/desliga e a trena.",
      "Toque numa peça: nome, tipo, GUID — e o item do orçamento e a etapa do cronograma ligados a ela.",
      "Volte para a prancha no mesmo ponto em que estava no 3D.",
      "Mande para o celular do cliente pelo link e QR da obra, com as pranchas e a maquete em realidade aumentada."
    ],
    vendaFechada: "A venda do módulo abre em breve. Para usar agora, fale com a RA Engenharia."
  };

  function M() { return global.Modela && typeof global.Modela.tem === "function" ? global.Modela : null; }
  function dono() { try { return !!(global.localStorage && global.localStorage.getItem(OWNER) === "1"); } catch (e) { return false; } }

  var PranchaVivaModulo = {
    ID: ID, OWNER: OWNER, OFERTA: OFERTA,

    /* {liberado, motivo: "dono"|"demo"|"teste"|"teste-1h"|"compra"|"", teste: {...} | null} */
    estado: function () {
      if (dono()) return { liberado: true, motivo: "dono", teste: null };
      var m = M(), s = null;
      try { s = m && m.status ? m.status() : null; } catch (e) { s = null; }
      var tem = false; try { tem = !!(m && m.tem(ID)); } catch (e2) { tem = false; }
      /* teste de 1 hora vencido/pausado (js/testemodulo.js): a oferta é a do teste, não a dos 7 dias */
      if (!tem) return { liberado: false, motivo: "", teste: s ? s.teste : null, play: !!(s && s.play), teste1h: (s && s.vencidos1h && s.vencidos1h[ID]) || "" };
      /* compra (ou licença interna pelo servidor) vale mais que o teste: quem comprou durante o teste é "compra" */
      var mot = "compra", comprado = false;
      try { var c = m._ler && m._ler().srv; comprado = !!(c && c.disciplinas && Number(c.disciplinas[ID]) > Date.now()); } catch (e3) {}
      if (s && s.demo) mot = "demo";
      else if (!comprado && s && s.tudo) mot = s.vitalicia ? "vitalicia" : "interno";
      else if (!comprado && s && s.teste && s.teste.ativo) mot = "teste";
      else if (!comprado && s && s.teste1h && s.teste1h[ID]) mot = "teste-1h";
      return { liberado: true, motivo: mot, teste: s ? s.teste : null };
    },
    liberado: function () { return this.estado().liberado; },

    /* a porta de todo comando do módulo: {ok:true, motivo} ou {ok:false, motivo, oferta, podeTestar, teste1h} */
    guarda: function (acao) {
      var e = this.estado();
      if (e.liberado) return { ok: true, motivo: e.motivo, acao: acao || "" };
      var t = e.teste || {};
      return { ok: false, acao: acao || "", motivo: "A " + OFERTA.titulo + " não está liberada nesta licença.", oferta: OFERTA, podeTestar: !!t.disponivel && !e.play, testeEncerrado: !!t.encerrado, teste1h: e.teste1h || "" };
    },

    /* começa o teste de 7 dias (o do Modela, que inclui os módulos à parte) */
    iniciarTeste: function (cb) { var m = M(); if (!m || !m.iniciarTeste) { if (cb) cb({ ok: false }); return false; } return m.iniciarTeste(cb); },

    /* a venda está aberta? — o servidor diz (planos modela_pranchaviva_* no /api/modela/oferta). Sem resposta: fechada. */
    planosAVenda: function (oferta) {
      var p = (oferta && oferta.planos) || {};
      return Object.keys(p).filter(function (k) { return /^modela_pranchaviva_/.test(k); }).map(function (k) { var o = p[k]; return { id: k, nome: o.nome, valor: o.valor, periodo: o.periodo, unico: !!o.unico }; });
    }
  };
  global.PranchaVivaModulo = PranchaVivaModulo;
  if (typeof module !== "undefined" && module.exports) module.exports = PranchaVivaModulo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

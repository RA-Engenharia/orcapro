/* =====================================================================
 * marmmodulo.js — a LICENÇA e a ÁREA DE TRABALHO do módulo MARMORARIA (motor puro, Node-testável)
 *
 * Pedido do Rogério (20/10/2026): "plugin à parte, mas dentro do sistema" — quem tem marmoraria compra só isto e
 * entra numa área enxuta (parede, bancada, executivo, plano de chapa, tabela de preços, orçamento e proposta); a RA
 * usa dentro do OrçaPRO completo sem comprar. Preço (23/10/2026): compra única R$ 989 em até 12× ou à vista com 10 %
 * — o valor mora só no vendas-config do VPS (docs/marmoraria/OFERTA.md).
 *
 * QUEM LIBERA (nesta ordem):
 *   1. a trava da MÁQUINA da RA (`orcapro:marmoraria:owner` = "1", como a do Blocok) — instalação interna;
 *   2. Modela.tem("marmoraria"): a VITALÍCIA do OrçaPRO (23/10/2026: vitalícia = tudo), compra do módulo, licença
 *      interna pelo servidor (vendas-config modela.internos), o teste de 7 dias do Modela já começado e a vitrine
 *      (?demo=1) — a regra mora em js/modela.js;
 *   fora disso → trancado.
 * ⚠ A TRAVA É NA FUNÇÃO, NÃO NO BOTÃO: todo comando do módulo (js/marmorariaui.js) passa por `guarda()` antes de
 *   fazer qualquer coisa; esconder o botão não basta (o atalho, a busca e o console chamam o comando direto).
 *
 * SÓ MARMORARIA: a licença do aparelho é a do Modela sozinho (tier "modela", Licenca.soModela) e o único direito
 *   comprado é este módulo → a fita do modelador abre na disciplina "marmoraria" (js/bimdisciplinas.js) e não deixa
 *   trocar para as outras. Quem tem o OrçaPRO (qualquer plano) e comprou o módulo vê a fita de sempre, com a
 *   disciplina Marmoraria no seletor.
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";
  var ID = "marmoraria";
  var OWNER = "orcapro:marmoraria:owner";

  /* o texto da oferta (pronto; a venda só liga quando o servidor listar um plano modela_marmoraria_*) */
  var OFERTA = {
    titulo: "Módulo Marmoraria",
    subtitulo: "Da parede à proposta: a bancada certa, o executivo pronto e o orçamento com os seus preços.",
    itens: [
      "Parede desenhada ou ambiente pelas medidas: a bancada encosta nela.",
      "Bancada de banheiro e de cozinha: pedra, espessura, saia, rodabanca, borda, cuba e torneira — o tampo já sai com o furo ou o recorte pelo gabarito da cuba.",
      "Executivo de marmoraria: planta da peça cotada a partir das bordas, vista frontal, detalhe da borda, plano de chapa e lista de peças, em PDF e DXF.",
      "A sua tabela de preços: R$/m² por pedra, R$/m de cada acabamento, furo, recorte, cuba, mão-francesa, instalação, frete, perda de chapa, margem e desconto — importa e exporta planilha.",
      "Orçamento na hora de modelar e a proposta em PDF com a sua marca, o executivo anexo, validade, prazo e condições de pagamento."
    ],
    semOrcapro: "Não precisa do OrçaPRO: a licença do módulo abre só a área da marmoraria.",
    vendaFechada: "A venda do módulo abre em breve. Para usar agora, fale com a RA Engenharia."
  };

  function M() { return global.Modela && typeof global.Modela.tem === "function" ? global.Modela : null; }
  function L() { return global.Licenca || null; }
  function dono() { try { return !!(global.localStorage && global.localStorage.getItem(OWNER) === "1"); } catch (e) { return false; } }

  var MarmModulo = {
    ID: ID, OWNER: OWNER, OFERTA: OFERTA,

    /* {liberado, motivo: "dono"|"demo"|"vitalicia"|"interno"|"teste"|"compra"|"" , teste: {...} | null} */
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
      else if (s && s.vitalicia) mot = "vitalicia";
      else if (s && s.tudo) mot = "interno";
      else if (!comprado && s && s.porTier && s.porTier[ID]) mot = "bim";   /* o plano BIM em dia inclui todos os módulos (24/10/2026) */
      else if (!comprado && s && s.teste && s.teste.ativo) mot = "teste";
      else if (!comprado && s && s.teste1h && s.teste1h[ID]) mot = "teste-1h";
      return { liberado: true, motivo: mot, teste: s ? s.teste : null };
    },
    liberado: function () { return this.estado().liberado; },

    /* a porta de todo comando do módulo: {ok:true} ou {ok:false, motivo, oferta, podeTestar} */
    guarda: function (acao) {
      var e = this.estado();
      if (e.liberado) return { ok: true, motivo: e.motivo };
      var t = e.teste || {};
      return { ok: false, acao: acao || "", motivo: "O " + OFERTA.titulo + " não está liberado nesta licença.", oferta: OFERTA, podeTestar: !!t.disponivel && !e.play, testeEncerrado: !!t.encerrado, teste1h: e.teste1h || "" };
    },

    /* a licença deste aparelho é SÓ a da marmoraria? (tier "modela" e nenhuma disciplina do Modela comprada) */
    soMarmoraria: function () {
      var lic = L(), m = M();
      try { if (!lic || !lic.soModela || !lic.soModela()) return false; } catch (e) { return false; }
      if (!this.liberado()) return false;
      try {
        var s = m ? m.status() : null;
        if (!s || s.demo || s.vitalicia) return false;
        return !Object.keys(s.compradas || {}).length;
      } catch (e2) { return false; }
    },

    /* começa o teste de 7 dias (o do Modela, que inclui os módulos à parte) */
    iniciarTeste: function (cb) { var m = M(); if (!m || !m.iniciarTeste) { if (cb) cb({ ok: false }); return false; } return m.iniciarTeste(cb); },

    /* a venda está aberta? — o servidor diz (planos modela_marmoraria_* no /api/modela/oferta). Sem resposta: fechada. */
    planosAVenda: function (oferta) {
      var p = (oferta && oferta.planos) || {};
      return Object.keys(p).filter(function (k) { return /^modela_marmoraria_/.test(k); }).map(function (k) { var o = p[k]; return { id: k, nome: o.nome, valor: o.valor, periodo: o.periodo, unico: !!o.unico, parcelasMax: o.parcelasMax, valorAVista: o.valorAVista, descontoAVista: o.descontoAVista }; });
    }
  };
  global.MarmModulo = MarmModulo;
  if (typeof module !== "undefined" && module.exports) module.exports = MarmModulo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

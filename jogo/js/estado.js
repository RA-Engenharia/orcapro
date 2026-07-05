/* ============================================================
   OrçaPro — Construtor 3D : ESTADO DO JOGO
   Gerencia o save (localStorage), o caixa, a obra atual e o
   progresso de níveis. Tudo determinístico para o jogo poder
   recalcular regras a partir dos dados.
   ============================================================ */
(function (global) {
  'use strict';

  var CHAVE = 'orcapro_jogo_v1';

  function novaObra() {
    return {
      nivelId: null,
      loteId: null,
      canteiro: [],          // ids de estruturas montadas
      equipe: {},            // {funcaoId: quantidade}
      ferramentasCompradas: [],   // ids
      ferramentasAlugadas: [],    // ids (custo/dia enquanto a obra roda)
      insumos: {},           // {insumoId: quantidade em estoque}
      projetos: [],          // ids de projetos contratados/aprovados
      etapasConcluidas: [],  // ids
      etapaAtual: null,      // id da etapa em execução (animação)
      dia: 0,                // dias decorridos
      gastoTotal: 0,         // controle interno
      // --- segurança (NR-18) ---
      segurancaItens: [],    // ids de itens de segurança adquiridos
      // --- simulação ---
      curaAte: 0,            // dia até o qual o concreto ainda está curando
      tempoChuva: false,     // está chovendo agora (visual)
      eventosVistos: [],     // ids de eventos já ocorridos nesta obra
      // --- economia ---
      recebido: 0,           // total já recebido em medições
      imposto: 0,            // total de impostos pagos
      emprestimo: 0,         // valor tomado emprestado (a devolver c/ juros)
      emprestimoJuros: 0     // juros a pagar na entrega
    };
  }

  function novoSave() {
    return {
      caixa: 600000,         // capital inicial
      nivelMax: 1,           // maior nível liberado
      estrelas: {},          // {nivelId: estrelas}
      obra: novaObra(),
      criadoEm: 'inicio'
    };
  }

  var S = null;

  function carregar() {
    try {
      var raw = localStorage.getItem(CHAVE);
      if (raw) { S = JSON.parse(raw); }
    } catch (e) { S = null; }
    if (!S) { S = novoSave(); }
    // garante campos novos
    if (!S.obra) { S.obra = novaObra(); }
    if (!S.estrelas) { S.estrelas = {}; }
    return S;
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (e) {}
  }

  function resetar() {
    S = novoSave();
    salvar();
    return S;
  }

  var ESTADO = {
    get: function () { return S || carregar(); },
    carregar: carregar,
    salvar: salvar,
    resetar: resetar,
    novaObra: novaObra,

    iniciarNivel: function (nivelId) {
      S.obra = novaObra();
      S.obra.nivelId = nivelId;
      salvar();
    },

    // --- caixa ---
    pode: function (valor) { return S.caixa >= valor; },
    debitar: function (valor) { S.caixa -= valor; salvar(); },
    creditar: function (valor) { S.caixa += valor; salvar(); },

    // --- conveniências ---
    temFerramenta: function (id) {
      return S.obra.ferramentasCompradas.indexOf(id) >= 0 ||
             S.obra.ferramentasAlugadas.indexOf(id) >= 0;
    },
    temProjeto: function (id) { return S.obra.projetos.indexOf(id) >= 0; },
    qtdEquipe: function (id) { return S.obra.equipe[id] || 0; },
    estoque: function (id) { return S.obra.insumos[id] || 0; },
    temCanteiro: function (id) { return S.obra.canteiro.indexOf(id) >= 0; },
    etapaFeita: function (id) { return S.obra.etapasConcluidas.indexOf(id) >= 0; },
    temSeguranca: function (id) { return S.obra.segurancaItens.indexOf(id) >= 0; },

    // pontuação de segurança (0-100) a partir dos itens adquiridos
    nivelSeguranca: function () {
      var total = 0;
      S.obra.segurancaItens.forEach(function (id) {
        var it = window.DADOS.seguranca(id); if (it) total += it.seg;
      });
      return Math.min(100, total);
    }
  };

  global.ESTADO = ESTADO;
})(window);

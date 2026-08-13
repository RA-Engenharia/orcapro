/* =====================================================================
 * orcwizard.js — Assistente de NOVO ORÇAMENTO em 3 passos
 *
 * Passo 1 · Dados do orçamento   (código, descrição, cliente, categoria,
 *            prazo, preço zerado, bloco de LICITAÇÃO)
 * Passo 2 · Configurações de cálculo (arredondamento nos 5 modos com o
 *            padrão do TCU, encargos sociais, BDI e onde ele incide)
 * Passo 3 · Bases de preços (estado/competência do SINAPI + tabelas
 *            instaladas que este orçamento vai usar)
 *
 * Os 3 passos são SEMPRE percorridos: parametrizar depois, com itens já
 * lançados, é o que gera divergência de centavo em licitação.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return Util.esc(String(s == null ? "" : s)); }
  function val(id) { var e = UI.el(id); return e ? e.value : ""; }
  function marcado(id) { var e = UI.el(id); return !!(e && e.checked); }
  function radio(nome) {
    var l = document.querySelectorAll('input[name="' + nome + '"]');
    for (var i = 0; i < l.length; i++) { if (l[i].checked) return l[i].value; }
    return "";
  }

  var TIPOS_LICITACAO = [
    "Concorrência", "Pregão eletrônico", "Pregão presencial", "Tomada de preços",
    "Convite", "RDC — Regime Diferenciado de Contratações", "Dispensa de licitação",
    "Inexigibilidade", "Chamada pública", "Cotação de preços"
  ];

  var OrcWizard = {
    TIPOS_LICITACAO: TIPOS_LICITACAO,
    _st: null,
    _app: null,

    /* ---------------- abertura ---------------- */
    abrir: function (app, aoCriar) {
      this._app = app || global.App;
      var base = Orcamento.configPadrao();
      var bdiPad = 0;
      try { bdiPad = Bdi.calcular(Bdi.paramsDoModelo("padrao")); } catch (e) {}
      this._bdiPadraoCalc = bdiPad;
      this._st = {
        passo: 1,
        aoCriar: aoCriar || null,
        numero: "ORC-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 9000 + 1000),
        nome: "", cliente: "", obra: "", local: "",
        categoria: "", prazoEntrega: "", controlarPrazo: false, permitirZerado: false,
        licitacao: { ativo: false, tipo: "", abertura: "", processo: "" },
        arredondamento: base.arredondamento,
        bdiIncidencia: base.bdiIncidencia,
        bdiPercentual: bdiPad, bdiInicial: bdiPad, bdiEraManual: false, bdiManual: false,
        encargos: { tipo: "desonerado", horista: 0, mensalista: 0 },
        uf: (this._app && this._app._baseUf) || (global.Sinapi ? Sinapi.uf : "") || CONFIG.sinapi.ufPadrao,
        competencia: (global.Sinapi ? Sinapi.competencia : "") || CONFIG.sinapi.competenciaPadrao,
        basesExtras: []
      };
      this._render();
    },

    /* Reabre a parametrização de um orçamento JÁ criado (botão ⚙ Parâmetros).
     * Mesmos campos dos passos 1 e 2, numa tela só — aqui não é assistente, é
     * edição: quem já tem itens lançados precisa ver tudo de uma vez. */
    editarParametros: function (app, orc) {
      this._app = app || global.App;
      var cfg = Orcamento.garantirConfig(orc);
      this._st = {
        passo: 0, aoCriar: null, orc: orc,
        numero: orc.numero || "", nome: orc.nome || "",
        cliente: (orc.cliente && orc.cliente.nome) || "", obra: (orc.obra && orc.obra.nome) || "",
        categoria: cfg.categoria || "", prazoEntrega: cfg.prazoEntrega || "", controlarPrazo: !!cfg.controlarPrazo,
        permitirZerado: !!cfg.permitirZerado,
        licitacao: {
          ativo: !!(cfg.licitacao && cfg.licitacao.ativo),
          tipo: (cfg.licitacao && cfg.licitacao.tipo) || "",
          abertura: (cfg.licitacao && cfg.licitacao.abertura) || "",
          processo: (cfg.licitacao && cfg.licitacao.processo) || ""
        },
        arredondamento: cfg.arredondamento,
        bdiIncidencia: cfg.bdiIncidencia,
        bdiPercentual: Util.num(orc.bdi && orc.bdi.percentual),
        bdiInicial: Util.num(orc.bdi && orc.bdi.percentual),
        bdiEraManual: !(orc.bdi && orc.bdi.params),
        bdiManual: !(orc.bdi && orc.bdi.params),
        encargos: {
          tipo: (cfg.encargos && cfg.encargos.tipo) || "desonerado",
          horista: Util.num(cfg.encargos && cfg.encargos.horista),
          mensalista: Util.num(cfg.encargos && cfg.encargos.mensalista)
        },
        uf: orc.uf || "", competencia: orc.competenciaSinapi || "", basesExtras: []
      };
      var self = this;
      /* A MESMA TABELA do passo 3, também aqui. O passo 3 só existe na
       * criação; sem um lugar para religar, um banco desmarcado ficava fora
       * do orçamento para sempre. Reusar a tabela (em vez de manter a lista
       * chapada antiga) evita o problema clássico de duas telas para o mesmo
       * dado divergirem — foi assim que a GOINFRA acabou com dois defaults.
       * ⚠ Aqui a tabela é SÓ marcação: os eixos de variante saem
       * desabilitados, porque trocar região de um banco compartilhado a
       * partir da tela de UM orçamento é efeito global disparado de tela
       * local. Quem troca variante é o assistente, que sabe perguntar. */
      var blocoBases = "";
      try {
        this._st._estados = null; this._st._srv = null;
        this._st._p3 = BasesUI.estadoInicial(this._ctx3(), Util.arr(cfg.basesExcluidas));
        this._st._p3.somenteMarcar = true;
        blocoBases = '<div class="ow-sec"><h4>Bancos de preço neste orçamento</h4>' +
          '<div id="ow-p3">' + this._tabela3() + "</div></div>";
      } catch (eB) { blocoBases = ""; }
      // v1.1.121 — faixa de CONTEXTO no topo: base/UF/competência/regime deste
      // orçamento sempre à vista (parâmetro implícito que ficava escondido).
      var regTxt = this._st.encargos.tipo === "desonerado" ? "Desonerado" : "Não desonerado";
      var faixaCtx = '<div class="ow-ctx">' +
        '<span><small>Base</small><b>SINAPI' + (this._st.uf ? " · " + esc(this._st.uf) : "") + '</b></span>' +
        '<span><small>Competência</small><b>' + esc(this._st.competencia || "—") + '</b></span>' +
        '<span><small>Regime</small><b>' + regTxt + '</b></span>' +
        '<span><small>BDI atual</small><b>' + Util.fmtPct(this._st.bdiPercentual) + '</b></span>' +
        '<small class="ow-ctx-dica">Estado e competência trocam em ' + (typeof Icones !== 'undefined' ? Icones.get('tabela', 15) : '') + ' Tabelas — aqui ajustam-se os critérios de cálculo.</small></div>';
      var corpo =
        '<p class="muted ow-nota" style="margin-top:0">Mudanças aqui <b>recalculam todos os totais</b> deste orçamento — inclusive o que já foi exportado. Confira antes de reemitir a planilha.</p>' +
        faixaCtx +
        '<div class="ow-sec"><h4>Dados do orçamento</h4>' + this._corpo1() + "</div>" +
        this._corpo2() + blocoBases;
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("ajustes", 15) : "") + " Parâmetros do orçamento", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar", classe: "primary", onClick: function () { self._salvarParametros(); } }
      ]);
      this._injetarCss();
      this._bind(1); this._bind(2);
      /* a tabela de bancos também vive aqui; sem reatar os eventos, o realce
         da linha e o liga/desliga dos selects não respondem ao clique */
      if (blocoBases) { try { this._bindTabela3(); } catch (eT) {} }
    },
    _salvarParametros: function () {
      if (!this._coletar1() || !this._coletar2()) return;
      var s = this._st, orc = s.orc, app = this._app;
      orc.numero = s.numero; orc.nome = s.nome;
      orc.cliente = orc.cliente || {}; orc.cliente.nome = s.cliente;
      orc.obra = orc.obra || {}; orc.obra.nome = s.obra;
      orc.desonerado = (s.encargos.tipo === "desonerado");
      orc.bdi = orc.bdi || {}; orc.bdi.percentual = s.bdiPercentual;
      // % digitado à mão não tem decomposição TCU: marcar como "manual" e zerar os
      // params do modelo, senão o Excel imprime "divergência TCU" comparando o
      // percentual do usuário com parcelas que não são dele.
      if (s.bdiManual) { orc.bdi.modeloId = "manual"; orc.bdi.params = null; }
      var cfg = Orcamento.garantirConfig(orc);
      cfg.categoria = s.categoria; cfg.prazoEntrega = s.prazoEntrega; cfg.controlarPrazo = !!s.controlarPrazo;
      cfg.permitirZerado = s.permitirZerado;
      cfg.arredondamento = s.arredondamento; cfg.bdiIncidencia = s.bdiIncidencia;
      cfg.encargos = { tipo: s.encargos.tipo, horista: s.encargos.horista, mensalista: s.encargos.mensalista };
      cfg.licitacao = {
        ativo: !!s.licitacao.ativo,
        tipo: s.licitacao.ativo ? s.licitacao.tipo : "",
        abertura: s.licitacao.ativo ? s.licitacao.abertura : "",
        processo: s.licitacao.ativo ? s.licitacao.processo : ""
      };
      /* DENYLIST pela MESMA regra do assistente (BasesUI.coletar): só banco
         INSTALADO e desmarcado fica de fora. Ler os checkboxes na mão aqui
         voltaria a jogar banco não instalado na denylist e mataria o "banco
         instalado depois entra sozinho" que o rodapé promete. */
      if (s._p3 && UI.el("ow-p3")) {
        this._lerTabela3();
        cfg.basesExcluidas = BasesUI.coletar(s._p3, this._ctx3()).excluir;
      }
      orc.atualizadoEm = Util.agoraISO();
      Store.salvarOrcamento(Auth.empresaId(), orc);
      UI.fecharModal();
      if (app) { app.orcAtual = orc; app.render(); }
      UI.toast("Parâmetros salvos — totais recalculados (" + Arred.rotulo(cfg.arredondamento).toLowerCase() + ").", "ok");
      this._st = null;
    },

    /* ---------------- cabeçalho de passos ---------------- */
    _trilha: function (p) {
      var nomes = ["Dados do orçamento", "Configurações de cálculo", "Bases de preços"];
      var h = '<div class="ow-trilha">';
      for (var i = 1; i <= 3; i++) {
        var cls = i < p ? "ok" : (i === p ? "on" : "");
        h += '<div class="ow-step ' + cls + '"><span class="n">' + (i < p ? "✓" : i) + "</span><b>" + nomes[i - 1] + "</b></div>";
      }
      return h + "</div>";
    },

    /* ---------------- PASSO 1 ---------------- */
    _html1: function () { return this._trilha(1) + this._corpo1(); },
    _corpo1: function () {
      var s = this._st;
      var cats = ['<option value="">— selecione —</option>'].concat(
        Orcamento.CATEGORIAS_OBRA.map(function (c) {
          return '<option value="' + esc(c) + '"' + (s.categoria === c ? " selected" : "") + ">" + esc(c) + "</option>";
        })).join("");
      var tips = TIPOS_LICITACAO.map(function (t) {
        return '<option value="' + esc(t) + '"' + (s.licitacao.tipo === t ? " selected" : "") + ">" + esc(t) + "</option>";
      }).join("");
      return '<div class="row"><div class="field"><label>Código do orçamento</label><input id="ow-numero" value="' + esc(s.numero) + '"></div>' +
        '<div class="field"><label>Prazo de entrega</label><input id="ow-prazo" type="date" value="' + esc(s.prazoEntrega) + '">' +
          /* O CONTROLE É OPT-IN. Semáforo de prazo que ninguém ligou vira
             vermelho de enfeite na lista, e vermelho de enfeite ensina a
             ignorar alerta de verdade. Quem quer cobrança, marca. */
          '<label class="ow-check" style="margin-top:6px;font-size:12px"><input type="checkbox" id="ow-controlar-prazo"' +
          (s.controlarPrazo ? " checked" : "") + '> Acompanhar este prazo na lista de orçamentos</label>' +
        '</div></div>' +
        '<div class="field"><label>Descrição do orçamento *</label><input id="ow-nome" value="' + esc(s.nome) + '" placeholder="Ex.: Reforma da Escola Municipal — Bloco A"></div>' +
        '<div class="row"><div class="field"><label>Cliente</label><input id="ow-cliente" value="' + esc(s.cliente) + '" placeholder="Nome do contratante"></div>' +
        '<div class="field"><label>Obra / Local</label><input id="ow-obra" value="' + esc(s.obra) + '" placeholder="Ex.: Bairro Centro"></div></div>' +
        '<div class="field"><label>Categoria da obra</label><select id="ow-categoria">' + cats + "</select></div>" +
        '<label class="ow-check"><input type="checkbox" id="ow-zerado"' + (s.permitirZerado ? " checked" : "") + '> ' +
        "<span>Permitir insumos com preço zerado <small>(itens sem preço na base entram com R$ 0,00 em vez de bloquear o lançamento)</small></span></label>" +
        '<label class="ow-check"><input type="checkbox" id="ow-lic"' + (s.licitacao.ativo ? " checked" : "") + '> ' +
        "<span><b>Este orçamento é para LICITAÇÃO</b> <small>(os dados abaixo saem no cabeçalho da planilha e do laudo)</small></span></label>" +
        '<div id="ow-licbox" class="ow-box"' + (s.licitacao.ativo ? "" : ' style="display:none"') + ">" +
        '<div class="field"><label>Modalidade / tipo</label><select id="ow-lic-tipo"><option value="">— selecione —</option>' + tips + "</select></div>" +
        '<div class="row"><div class="field"><label>Data e hora da abertura</label><input id="ow-lic-abertura" type="datetime-local" value="' + esc(s.licitacao.abertura) + '"></div>' +
        '<div class="field"><label>Nº do processo / edital</label><input id="ow-lic-processo" value="' + esc(s.licitacao.processo) + '" placeholder="Ex.: 001/2026"></div></div>' +
        "</div>";
    },
    _coletar1: function () {
      var s = this._st;
      s.numero = val("ow-numero").trim();
      s.nome = val("ow-nome").trim();
      s.cliente = val("ow-cliente").trim();
      s.obra = val("ow-obra").trim();
      s.categoria = val("ow-categoria");
      s.prazoEntrega = val("ow-prazo");
      s.controlarPrazo = marcado("ow-controlar-prazo");
      s.permitirZerado = marcado("ow-zerado");
      s.licitacao = {
        ativo: marcado("ow-lic"),
        tipo: val("ow-lic-tipo"),
        abertura: val("ow-lic-abertura"),
        processo: val("ow-lic-processo").trim()
      };
      if (!s.nome) { UI.toast("Dê uma descrição ao orçamento para continuar.", "erro"); return false; }
      return true;
    },

    /* ---------------- PASSO 2 ---------------- */
    _html2: function () { return this._trilha(2) + this._corpo2(); },
    _corpo2: function () {
      var s = this._st;
      var modos = Arred.MODOS.map(function (m) {
        return '<label class="ow-radio' + (s.arredondamento === m.id ? " on" : "") + '">' +
          '<input type="radio" name="ow-arred" value="' + esc(m.id) + '"' + (s.arredondamento === m.id ? " checked" : "") + "> " +
          "<span>" + esc(m.rotulo) + (m.selo ? ' <i class="ow-selo">' + esc(m.selo) + "</i>" : "") + "</span></label>";
      }).join("");
      var incs = Arred.INCIDENCIAS.map(function (o) {
        return '<label class="ow-radio' + (s.bdiIncidencia === o.id ? " on" : "") + '">' +
          '<input type="radio" name="ow-inc" value="' + esc(o.id) + '"' + (s.bdiIncidencia === o.id ? " checked" : "") + "> " +
          "<span>" + esc(o.rotulo) + (o.selo ? ' <i class="ow-selo">' + esc(o.selo) + "</i>" : "") + "</span></label>";
      }).join("");
      var deson = s.encargos.tipo === "desonerado";
      return '<div class="ow-sec"><h4>Arredondamento</h4>' +
        '<p class="muted ow-nota">Define como cada valor é fechado em 2 casas. Em obra pública o TCU manda <b>truncar</b> — arredondar para cima já rendeu impugnação por centavo no preço unitário.</p>' +
        modos + "</div>" +
        '<div class="ow-sec"><h4>Encargos sociais</h4>' +
        '<div class="ow-radio-lin">' +
        '<label class="ow-radio' + (deson ? " on" : "") + '"><input type="radio" name="ow-enc" value="desonerado"' + (deson ? " checked" : "") + "> <span>Desonerado</span></label>" +
        '<label class="ow-radio' + (!deson ? " on" : "") + '"><input type="radio" name="ow-enc" value="nao_desonerado"' + (!deson ? " checked" : "") + "> <span>Não desonerado</span></label>" +
        "</div>" +
        '<div class="row"><div class="field"><label>Horista (%)</label><input id="ow-enc-h" type="number" step="0.01" value="' + esc(s.encargos.horista || "") + '" placeholder="Ex.: 84,45"></div>' +
        '<div class="field"><label>Mensalista (%)</label><input id="ow-enc-m" type="number" step="0.01" value="' + esc(s.encargos.mensalista || "") + '" placeholder="Ex.: 45,52"></div></div>' +
        '<p class="muted ow-nota">Este bloco é <b>declaratório</b>: o regime e os percentuais saem no cabeçalho da planilha, do laudo e da proposta (a Lei 14.133 exige a declaração), mas <b>não recalculam</b> os preços da base. Para orçar com preços desonerados, filtre por “Desonerado” na busca de composições ao lançar os itens.</p></div>' +
        '<div class="ow-sec"><h4>BDI</h4>' +
        '<div class="field" style="max-width:220px"><label>BDI (%)</label><input id="ow-bdi" type="number" step="0.01" value="' + esc(s.bdiPercentual) + '"></div>' +
        '<p class="muted ow-nota">Onde o BDI incide:</p>' + incs +
        '<p class="muted ow-nota">Depois, na aba <b>BDI</b>, dá para abrir a fórmula do Acórdão TCU 2.622/2013 (AC, S, R, G, DF, L, I) e conferir se o percentual está dentro da faixa do tipo de obra.</p></div>';
    },
    _coletar2: function () {
      var s = this._st;
      s.arredondamento = Arred.normalizar(radio("ow-arred"));
      s.bdiIncidencia = Arred.normalizarIncidencia(radio("ow-inc"));
      s.encargos = {
        tipo: radio("ow-enc") === "nao_desonerado" ? "nao_desonerado" : "desonerado",
        horista: Util.num(val("ow-enc-h")),
        mensalista: Util.num(val("ow-enc-m"))
      };
      // BDI em branco NÃO vira 0% em silêncio (venda = custo, prejuízo direto)
      var bruto = String(val("ow-bdi") || "").trim();
      if (!bruto) { UI.toast("Informe o BDI (%). Se quiser mesmo orçar sem BDI, digite 0.", "erro"); return false; }
      var b = Util.num(bruto);
      if (b < 0 || b > 200) { UI.toast("BDI fora do intervalo aceitável (0 a 200%).", "erro"); return false; }
      s.bdiPercentual = b;
      // Só vira "manual" (que descarta a decomposição TCU) se o usuário REALMENTE
      // mexeu no número. Antes, abrir ⚙ Parâmetros e salvar sem tocar em nada já
      // apagava orc.bdi.params — e o orçamento perdia o quadro do Acórdão 2.622.
      s.bdiManual = s.bdiEraManual || (Math.abs(b - Util.num(s.bdiInicial)) > 0.005);
      return true;
    },

    /* ---------------- PASSO 3 ---------------- */

    /* Os FATOS que a tabela usa para decidir o que cada linha pode dizer.
     * Tudo aqui é medido agora: o que está instalado neste computador, o que
     * o servidor respondeu (quando respondeu) e quais estados o manifesto
     * conhece. Nada é lembrado de uma sessão anterior. */
    _ctx3: function () {
      var s = this._st, inst = {};
      try {
        (Bases.lista() || []).forEach(function (b) {
          inst[b.fonte] = { competencia: b.competencia, uf: b.uf, total: b.total, sel: b.sel || null };
        });
      } catch (e) {}
      var estados = (s._estados || []).map(function (u) { return { v: u.uf, r: u.uf + (u.competencia ? " · " + BasesCat.fmtVersao(u.competencia) : "") }; });
      if (!estados.length && s.uf) estados = [{ v: s.uf, r: s.uf }];
      var srv = s._srv || {};
      return {
        instaladas: inst,
        servidor: srv,
        estados: estados,
        sicroUfs: (srv.sicroUfs || []).map(function (u) { return { v: u, r: u }; }),
        sinapiDesUfs: (srv.sinapiDesoneradaUfs || []).map(function (u) { return { v: u, r: u }; })
      };
    },

    _html3: function () {
      var s = this._st;
      if (!s._p3) {
        var excl = [];
        try { excl = Util.arr((s.orc && s.orc.config && s.orc.config.basesExcluidas) || s.basesExcluidas || []); } catch (e) {}
        s._p3 = BasesUI.estadoInicial(this._ctx3(), excl);
      }
      return this._trilha(3) +
        '<p class="muted ow-nota" style="margin-top:0">Marque os bancos que <b>este orçamento</b> pode usar para lançar itens (busca de itens, Escopo Inteligente e Parede-Cebola). ' +
        'Regime declarado no passo anterior: <b>' + (s.encargos.tipo === "desonerado" ? "desonerado" : "não desonerado") + "</b>.</p>" +
        '<div id="ow-p3">' + this._tabela3() + "</div>";
    },
    _tabela3: function () {
      var lista = [];
      try { lista = Bases.lista() || []; } catch (e) {}
      return BasesUI.tabela(this._st._p3, this._ctx3(), lista);
    },
    /* Re-render EM CIMA do container, nunca por UI.modal.
     * ⚠ UI.modal() começa com fecharModal() incondicional (ui.js:64) e essa
     * porta NÃO passa pela guarda de trabalho não salvo (ui.js:101-103) —
     * redesenhar o passo por lá arrancaria o modal e levaria junto tudo que
     * foi digitado nos passos 1 e 2, sem perguntar nada. */
    _redesenhar3: function () {
      var box = UI.el("ow-p3"); if (!box) return;
      box.innerHTML = this._tabela3();
      this._bindTabela3();
    },
    /* "2026-06" e "06/2026" são a MESMA competência. Sem normalizar, a lista
       mostrava a mesma data-base duas vezes e a ordenação lexicográfica jogava
       o formato antigo para o topo. Usa o helper do auto-update quando existe. */
    _normComp: function (c) {
      c = String(c == null ? "" : c).trim();
      try { if (global.Atualizacao && Atualizacao._normComp) return Atualizacao._normComp(c); } catch (e) {}
      var m = c.match(/^(\d{2})[\/\-](\d{4})$/); // MM/AAAA -> AAAA-MM
      return m ? (m[2] + "-" + m[1]) : c;
    },

    _popularComp: function (compDoEstado, ufEscolhida) {
      var sel = UI.el("ow-comp"); if (!sel) return;
      var s = this, st = this._st;
      /* Para a UF que está CARREGADA vale a competência da base viva, não a do
         manifesto: o manifesto é estático do build e o auto-update anda sozinho —
         a divergência mensal fazia o campo oferecer uma data-base que já não era
         a dos preços na memória. Para outra UF, o manifesto é o que se sabe. */
      var ufBase = "";
      try { ufBase = ((this._app && this._app._baseUf) || (global.Sinapi ? Sinapi.uf : "") || "").toUpperCase(); } catch (e) {}
      var ufAlvo = String(ufEscolhida || st.uf || "").toUpperCase();
      var compBase = "";
      try { compBase = (global.Sinapi && Sinapi.competencia) || ""; } catch (e) {}
      /* Remontar o passo NÃO é trocar de base: voltar e avançar não pode apagar a
         competência que o usuário escolheu de propósito. A escolha vale só para a
         UF em que foi feita — trocar de estado recalcula, como tem que ser. */
      var escolha = (st._compEscolhida && ufAlvo === String(st._compEscolhidaUf || "").toUpperCase()) ? st._compEscolhida : "";
      var preferida = escolha || ((ufAlvo && ufAlvo === ufBase && compBase) ? compBase : (compDoEstado || st.competencia || ""));

      var lista = this._competenciasDisponiveis(preferida);
      var atual = preferida || lista[0] || "";
      var achou = false;
      lista.forEach(function (c) { if (s._normComp(c) === s._normComp(atual)) achou = true; });
      if (!achou && atual) lista.unshift(atual);
      /* o VALUE continua cru (é ele que vira orc.competenciaSinapi e que o
         _criar compara com a base carregada); só o RÓTULO é formatado, para
         a linha do SINAPI não destoar das outras da tabela, que mostram
         MM/AAAA. Formatar o value faria a comparação de competência falhar
         em silêncio e o orçamento recarregaria base à toa. */
      sel.innerHTML = lista.map(function (c) {
        var rot = (typeof BasesCat !== "undefined") ? BasesCat.fmtVersao(c) : c;
        return '<option value="' + esc(c) + '"' + (s._normComp(c) === s._normComp(atual) ? " selected" : "") + ">" + esc(rot || c) + "</option>";
      }).join("");
      sel.value = atual;
      st.competencia = atual;
      var hint = UI.el("ow-comp-hint");
      if (hint) {
        hint.innerHTML = lista.length > 1
          ? "Competências instaladas neste computador. A base da competência escolhida é carregada ao criar."
          : "Só esta competência está instalada. Para orçar em outra data-base, baixe a versão em <b>" + (typeof Icones !== "undefined" ? Icones.get("tabela", 15) : "") + " Tabelas</b>.";
      }
    },

    /* COMPETÊNCIAS QUE EXISTEM DE VERDADE.
     *
     * O campo era readonly, e isso tinha um motivo: escolher uma competência que
     * o app NÃO possui faria o documento declarar uma data-base e imprimir preços
     * de outra — em licitação isso é impugnação. A lista traz só o que está
     * instalado, e quem precisa de outra é mandado para a Central de Atualização
     * de Bases. Ao criar, _criar() CARREGA a base da competência escolhida e só
     * grava o rótulo se ela subir: escolha com lastro, não campo decorativo. */
    _competenciasDisponiveis: function (ufComp) {
      var self = this, vistas = {}, out = [];
      function add(c) {
        c = String(c || "").trim(); if (!c) return;
        var k = self._normComp(c);
        if (!vistas[k]) { vistas[k] = 1; out.push(c); }
      }
      add(ufComp);
      try { if (global.Sinapi && Sinapi.competencia) add(Sinapi.competencia); } catch (e) {}
      try { add(CONFIG.sinapi.competenciaPadrao); } catch (e) {}
      try {
        (Bases.lista() || []).forEach(function (b) { if (String(b.fonte).toUpperCase() === "SINAPI") add(b.competencia); });
      } catch (e) {}
      // mais nova primeiro — comparando a forma NORMALIZADA (AAAA-MM ordena sozinho)
      out.sort(function (a, b) {
        var na = self._normComp(a), nb = self._normComp(b);
        return na < nb ? 1 : (na > nb ? -1 : 0);
      });
      return out;
    },

    /* Lê a tabela de volta para o estado. Roda a cada clique (para o realce
       e o plano de download) e antes de avançar. */
    _lerTabela3: function () {
      var s = this._st; if (!s._p3) return;
      var l = document.querySelectorAll("#ow-p3 [data-base]");
      for (var i = 0; i < l.length; i++) {
        var lin = BasesUI.linhaDe(s._p3, l[i].getAttribute("data-base"));
        if (lin) lin.marcada = !!l[i].checked;
      }
      var sels = document.querySelectorAll("#ow-p3 [data-eixo]");
      for (var j = 0; j < sels.length; j++) {
        var base = sels[j].getAttribute("data-eixo-base");
        if (base === "SINAPI") continue;                  // a UF do SINAPI é campo próprio
        var lin2 = BasesUI.linhaDe(s._p3, base);
        if (lin2) { lin2.sel = lin2.sel || {}; lin2.sel[sels[j].getAttribute("data-eixo")] = sels[j].value; }
      }
    },
    _coletar3: function () {
      var s = this._st;
      this._lerTabela3();
      s.uf = (val("ow-uf") || s.uf || "").toUpperCase();
      // a competência acompanha o estado escolhido (cada UF tem a sua no manifesto)
      var comp = val("ow-comp"); if (comp) s.competencia = comp;
      /* DENYLIST, como sempre foi: só o que o usuário DESMARCOU fica de fora.
         Banco instalado depois entra sozinho — allowlist esconderia banco novo
         e a UI promete o contrário. O `coletar` do BasesUI já garante que
         banco sem fonte nunca chega aqui (não tem data-base para ser lido). */
      var r = BasesUI.coletar(s._p3, this._ctx3());
      s.basesExtras = r.usar.map(function (u) { return u.catId; });
      s.basesUsar = r.usar;                 // com a variante escolhida
      s.basesExcluidas = r.excluir;
      s._basesTocado = true;
      return true;
    },

    /* ---------------- render + navegação ---------------- */
    _render: function () {
      var self = this, s = this._st, p = s.passo;
      var corpo = p === 1 ? this._html1() : (p === 2 ? this._html2() : this._html3());
      var botoes = [];
      if (p > 1) botoes.push({ texto: "‹ Voltar", classe: "ghost", onClick: function () { self._ir(-1); } });
      else botoes.push({ texto: "Cancelar", classe: "ghost", onClick: function () {
        /* mesma regua dos irmaos (CRUD e criador): Cancelar nao descarta digitado sem perguntar */
        if (UI.temTrabalhoNaoSalvo() && !window.confirm("Descartar este orçamento e perder o que foi preenchido?")) return;
        UI.fecharModal();
      } });
      botoes.push(p < 3
        ? { texto: "Avançar ›", classe: "primary", onClick: function () { self._ir(1); } }
        : { texto: "" + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + " Criar orçamento", classe: "primary", onClick: function () { self._criar(); } });
      UI.modal("Novo orçamento — passo " + p + " de 3", corpo, botoes);
      /* o passo 3 é uma TABELA de 4 colunas: no modal padrão as colunas
         Situação e Local ficam espremidas a ponto de quebrar palavra por
         palavra. Mesmo truque de app.js:2230 — mexe só na largura, não no
         chrome do modal (full-bleed brigaria com o header/footer sticky e
         com a guarda UI.modalSujo). */
      if (p === 3) { var mm = document.querySelector("#modal-bg .modal"); if (mm) mm.style.maxWidth = "980px"; }
      /* cada passo recria o modal (UI.modal zera a guarda): re-registrar.
         Passo > 1 = já há trabalho investido; no passo 1 o _tocado do DOM
         cobre o que for digitado. */
      UI.modalSujo(function () { return p > 1; });
      this._injetarCss();
      this._bind(p);
    },
    _ir: function (d) {
      var s = this._st;
      if (d > 0) {
        if (s.passo === 1 && !this._coletar1()) return;
        if (s.passo === 2 && !this._coletar2()) return;
      } else {
        // voltar NÃO valida, mas preserva o que já foi digitado
        if (s.passo === 2) { try { this._coletar2(); } catch (e) {} }
        if (s.passo === 3) { try { this._coletar3(); } catch (e) {} }
      }
      s.passo = Math.max(1, Math.min(3, s.passo + d));
      this._render();
    },
    _bind: function (p) {
      var self = this;
      if (p === 1) {
        var lic = UI.el("ow-lic");
        if (lic) lic.addEventListener("change", function () {
          var box = UI.el("ow-licbox"); if (box) box.style.display = lic.checked ? "" : "none";
        });
        var n = UI.el("ow-nome"); if (n) n.focus();
      }
      if (p === 2) {
        // realce visual do rádio escolhido
        ["ow-arred", "ow-inc", "ow-enc"].forEach(function (nome) {
          var l = document.querySelectorAll('input[name="' + nome + '"]');
          for (var i = 0; i < l.length; i++) {
            l[i].addEventListener("change", function () {
              for (var j = 0; j < l.length; j++) {
                var lab = l[j].parentNode;
                if (lab && lab.classList) lab.classList.toggle("on", l[j].checked);
              }
            });
          }
        });
      }
      if (p === 3) {
        var wz = this, app = this._app, s3 = this._st;
        this._bindTabela3();

        /* ESTADOS do manifesto (para o Local do SINAPI). Chega assíncrono e
           redesenha a tabela; até lá a linha mostra a UF atual. */
        if (app && app._carregarEstados && !s3._estados) {
          app._carregarEstados().then(function (ests) {
            if (!UI.el("ow-p3")) return;   // o assistente já fechou
            // v1.1.121: sem manifesto local ainda dá pra escolher qualquer UF —
            // a troca baixa a base ao vivo do servidor (fallback do trocarEstadoSinapi)
            if (!ests || !ests.length) {
              ests = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"].map(function (u) { return { uf: u }; });
            }
            s3._estados = ests;
            wz._redesenhar3();
          }).catch(function () {});
        }

        /* O QUE O SERVIDOR TEM. Só informa (chip "há 07/2026 no servidor") e
           preenche as UFs do SICRO. Falhar aqui é normal — o app roda offline
           no computador da obra — e não pode alterar classe nem estragar nada. */
        if (!s3._srv && typeof Atualizacao !== "undefined" && Atualizacao.statusServidor) {
          Atualizacao.statusServidor().then(function (st) {
            if (!UI.el("ow-p3") || !st) return;
            s3._srv = st;
            wz._redesenhar3();
          }).catch(function () { s3._srv = {}; });
        }
      }
    },

    /* Eventos DENTRO da tabela. Reatado a cada redesenho, porque o innerHTML
       novo traz elementos novos. Nada aqui abre modal (ver _redesenhar3). */
    _bindTabela3: function () {
      var wz = this, s = this._st, box = UI.el("ow-p3");
      if (!box) return;

      /* marcar/desmarcar: realça a linha e liga os selects da variante na
         hora — select habilitado numa linha desmarcada convida a configurar
         um banco que não vai ser usado */
      var chks = box.querySelectorAll("[data-base]");
      for (var i = 0; i < chks.length; i++) {
        chks[i].addEventListener("change", function () {
          var id = this.getAttribute("data-base");
          var tr = box.querySelector('tr[data-lin="' + id + '"]');
          if (tr) tr.classList.toggle("p3-on", this.checked);
          var ss = box.querySelectorAll('[data-eixo-base="' + id + '"]');
          for (var k = 0; k < ss.length; k++) { if (ss[k].id !== "ow-uf") ss[k].disabled = !this.checked; }
          wz._lerTabela3();
          wz._plano3();
        });
      }
      /* variante escolhida (região, regime, preço) */
      var sels = box.querySelectorAll("[data-eixo]");
      for (var j = 0; j < sels.length; j++) {
        sels[j].addEventListener("change", function () { wz._lerTabela3(); });
      }
      /* revelar/ocultar os bancos que ainda não distribuímos */
      var tg = box.querySelector("[data-p3-toggle]");
      if (tg) tg.addEventListener("click", function () {
        wz._lerTabela3();
        s._p3.mostrarAusentes = !s._p3.mostrarAusentes;
        wz._redesenhar3();
      });

      /* SINAPI: Local (estados) e Versão (competências realmente instaladas) */
      var selUf = UI.el("ow-uf");
      if (selUf && s._estados && s._estados.length) {
        var atual = s.uf;
        selUf.innerHTML = s._estados.map(function (e) {
          return '<option value="' + esc(e.uf) + '"' + (e.uf === atual ? " selected" : "") + ">" + esc(e.uf) + (e.competencia ? " · " + esc(BasesCat.fmtVersao(e.competencia)) : "") + "</option>";
        }).join("");
        selUf.value = atual;
        selUf.addEventListener("change", function () {
          s.uf = selUf.value.toUpperCase();
          var e2 = null;
          for (var q = 0; q < s._estados.length; q++) { if (s._estados[q].uf === selUf.value) e2 = s._estados[q]; }
          wz._popularComp(e2 && e2.competencia, selUf.value);
        });
      }
      this._popularComp(this._st.competencia, this._st.uf);
      var selC = UI.el("ow-comp");
      if (selC) selC.addEventListener("change", function () {
        s.competencia = selC.value;
        s._compEscolhida = selC.value;                              // escolha explícita do usuário
        s._compEscolhidaUf = String(s.uf || "").toUpperCase();      // vale só para esta UF
      });
      this._plano3();
    },

    /* Quanto este passo vai baixar. Só aparece quando há o que baixar —
       "0 MB" é ruído, e prometer download que não acontece é pior. */
    _plano3: function () {
      var box = UI.el("ow-p3"); if (!box) return;
      var pl = BasesUI.plano(this._st._p3, this._ctx3());
      var el = box.querySelector(".p3-plano");
      if (!pl.baixar.length) { if (el) el.parentNode.removeChild(el); return; }
      var txt = "Ao criar, o app vai instalar " + pl.baixar.length + (pl.baixar.length === 1 ? " banco" : " bancos") +
        (pl.mb ? " (~" + String(pl.mb).replace(".", ",") + " MB)" : "") + ": " + pl.baixar.join(", ") + ".";
      if (!el) {
        el = document.createElement("p");
        el.className = "p3-plano";
        box.appendChild(el);
      }
      el.textContent = txt;
    },

    /* ---------------- criação ---------------- */
    _criar: function () {
      if (!this._coletar3()) return;
      var s = this._st, self = this, app = this._app;
      var orc = Orcamento.novo({ numero: s.numero, nome: s.nome, cliente: s.cliente, obra: s.obra });
      orc.uf = s.uf || orc.uf;
      orc.competenciaSinapi = s.competencia || orc.competenciaSinapi;
      orc.desonerado = (s.encargos.tipo === "desonerado");
      orc.bdi.percentual = s.bdiPercentual;
      if (s.bdiManual) { orc.bdi.modeloId = "manual"; orc.bdi.params = null; }
      orc.config = {
        categoria: s.categoria,
        prazoEntrega: s.prazoEntrega,
        controlarPrazo: !!s.controlarPrazo,
        arredondamento: s.arredondamento,
        bdiIncidencia: s.bdiIncidencia,
        encargos: { tipo: s.encargos.tipo, horista: s.encargos.horista, mensalista: s.encargos.mensalista },
        permitirZerado: s.permitirZerado,
        licitacao: {
          ativo: !!s.licitacao.ativo,
          tipo: s.licitacao.ativo ? s.licitacao.tipo : "",
          abertura: s.licitacao.ativo ? s.licitacao.abertura : "",
          processo: s.licitacao.ativo ? s.licitacao.processo : ""
        },
        bases: [{ fonte: "SINAPI", uf: s.uf, competencia: s.competencia }].concat(
          s.basesExtras.map(function (f) {
            var b = null;
            try { b = (Bases.lista() || []).filter(function (x) { return x.fonte === f; })[0]; } catch (e) {}
            return { fonte: f, uf: (b && b.uf) || "", competencia: (b && b.competencia) || "" };
          })),
        // DENYLIST: só o que o usuário desmarcou fica fora da busca deste
        // orçamento. Tabela instalada depois entra sozinha (config.bases acima
        // é registro informativo da emissão, não filtro).
        basesExcluidas: s.basesExcluidas || [],
        /* ⚠ CAMPO NOVO, NÃO CAMPO ENVENENADO. `bases` e `basesExcluidas`
           continuam sendo escritos EXATAMENTE na forma antiga logo acima —
           orçamento criado hoje abre numa versão anterior do app, e rollback
           de release continua possível. O que a tabela nova sabe a mais
           (variante escolhida, se a base realmente subiu) mora aqui, num
           campo versionado que o app velho ignora sem se machucar.
           `confirmado` nasce FALSE em tudo e só vira true quando a base
           carrega de verdade: registro que envelhece mentindo é o defeito
           que este campo existe para não repetir. */
        basesV2: {
          v: 1,
          principal: { catId: "SINAPI", uf: s.uf, competencia: s.competencia, confirmado: false },
          extras: (s.basesUsar || []).map(function (u) {
            return { catId: u.catId, sel: u.sel || null, confirmado: false };
          })
        }
      };
      Orcamento.garantirConfig(orc);
      // A escolha de tabelas fica GRAVADA NO ORÇAMENTO (config.bases) e filtra a
      // busca de itens deste orçamento. Nada de Bases.setAtiva aqui: isso é estado
      // global da sessão e desligaria a tabela para todos os outros orçamentos.

      Store.salvarOrcamento(Auth.empresaId(), orc);
      UI.fecharModal();
      this._instalarMarcadas(orc, s);
      if (this._st.aoCriar) { try { this._st.aoCriar(orc); } catch (e) {} }
      if (app) {
        /* view = "orcamentos", não null: com Gestão ligada o app resolve view nula
           como "dashboard" e o editor abriria por baixo do Painel. */
        app.orcAtual = orc; app.tela = "editor"; app.aba = "planilha"; app.view = "orcamentos";
        app.render();
        /* O orçamento nasce vazio e o próximo passo é SEMPRE a primeira etapa —
           abrir o cadastro aqui poupa o clique e deixa claro por onde começar.
           Guardas: só se ninguém pediu outro destino (aoCriar), só se o editor
           ainda estiver com ESTE orçamento na tela e ainda sem etapa. Quem vai
           importar planilha só cancela. */
        if (!this._st.aoCriar && !Util.arr(orc.etapas).length && app.addEtapa) {
          setTimeout(function () {
            if (app.tela !== "editor" || app.view !== "orcamentos" || app.orcAtual !== orc) return;
            if (Util.arr(orc.etapas).length) return;
            /* NUNCA atropelar formulário que o usuário abriu nesta janela de 240ms:
               UI.modal() começa com fecharModal(), que arranca o modal aberto SEM
               perguntar — o trabalho digitado nele iria embora sem aviso. */
            if (document.getElementById("modal-bg")) return;
            try { app.addEtapa(); } catch (e) {}
          }, 240);
        }
        /* A BASE DE PREÇO TEM QUE SER A QUE O DOCUMENTO DECLARA.
         *
         * O orçamento só assume a UF e a competência novas DEPOIS que a base
         * carregou: se falhar, o cabeçalho não pode dizer "PA · 2026-06" enquanto
         * os preços continuam de "MG · 2026-07". Vale para os dois campos do passo
         * 3 — antes só a UF disparava recarga, e a competência escolhida virava
         * rótulo sem lastro (achado do gate: impugnação em licitação). */
        var ufAtual = (app._baseUf || (global.Sinapi ? Sinapi.uf : "") || "").toUpperCase();
        var compAtual = (global.Sinapi && Sinapi.competencia) || "";
        var precisaUf = !!(orc.uf && orc.uf !== ufAtual);
        var precisaComp = !!(orc.competenciaSinapi && compAtual && this._normComp(orc.competenciaSinapi) !== this._normComp(compAtual));
        if ((precisaUf || precisaComp) && app.trocarBaseSinapi) {
          var ufPedida = orc.uf || ufAtual, compPedida = orc.competenciaSinapi || "";
          var orcId = orc.id;
          orc.uf = ufAtual || orc.uf;
          orc.competenciaSinapi = compAtual || orc.competenciaSinapi;
          Store.salvarOrcamento(Auth.empresaId(), orc);
          app.trocarBaseSinapi(ufPedida, precisaComp ? compPedida : "", function (ok) {
            var ufReal = (app._baseUf || (global.Sinapi ? Sinapi.uf : "") || "").toUpperCase();
            /* grava na versão VIVA do orçamento: o usuário pode ter reaberto o
               registro nesses segundos, e o objeto do closure ficaria obsoleto. */
            var vivo = (app.orcAtual && app.orcAtual.id === orcId) ? app.orcAtual : orc;
            if (ok && ufReal === ufPedida) {
              vivo.uf = ufPedida;
              if (global.Sinapi && Sinapi.competencia) vivo.competenciaSinapi = Sinapi.competencia;
              Store.salvarOrcamento(Auth.empresaId(), vivo);
            } else {
              UI.toast("Não deu para carregar a base de " + ufPedida + (precisaComp ? " · " + compPedida : "") +
                ". O orçamento continua em " + (vivo.uf || "—") + " · " + (vivo.competenciaSinapi || "—") +
                " — troque em " + (typeof Icones !== "undefined" ? Icones.get("tabela", 15) : "") + " Tabelas quando quiser.", "erro");
            }
            if (app.tela === "editor") app.render();
          });
        }
      }
      var selo = Arred.ehPadraoTcu(orc.config.arredondamento) ? " (padrão do TCU)" : "";
      UI.toast("Orçamento criado — " + Arred.rotulo(orc.config.arredondamento).toLowerCase() + selo + ".", "ok");
      self._st = null;
    },

    /* ==================================================================
     * INSTALA O QUE FOI MARCADO E AINDA NÃO ESTAVA NO COMPUTADOR.
     *
     * Roda DEPOIS de gravar o orçamento, uma base de cada vez (baixar 4 MB
     * do ORSE junto com o resto numa 4G de obra só faz as quatro falharem).
     *
     * ⚠ `confirmado` só vira true no callback de sucesso. Se o ORSE não
     * subir, ele NÃO entra em config.bases — e o documento não declara uma
     * base de preço que o orçamento não tem. Em licitação, declarar base que
     * não está carregada é o caminho curto para impugnação.
     * ================================================================== */
    /* ==================================================================
     * ⚠ A VARIANTE É POR ORÇAMENTO, MAS O DADO É GLOBAL.
     *
     * `Bases.registrar` dedupa por fonte (bases.js) e o remapeamento de
     * preço é destrutivo sobre custoUnitario: não existe "SETOP Central" e
     * "SETOP Triângulo" convivendo — existe UMA SETOP. Se este orçamento
     * pede Central e a instalada é Triângulo, há só dois desfechos honestos:
     * reinstalar (e o preço muda para TODOS os orçamentos que usam SETOP) ou
     * manter o que está e gravar Triângulo no registro deste orçamento.
     *
     * O que NÃO pode acontecer — e aconteceria em silêncio sem isto — é
     * gravar "Central" em basesV2, o laudo declarar Central, e os itens
     * saírem com preço de Triângulo. Em 910 das 3.977 composições da SETOP o
     * preço muda de verdade entre regiões.
     * ================================================================== */
    _divergencias: function (s) {
      var out = [];
      try {
        var inst = {};
        (Bases.lista() || []).forEach(function (b) { inst[b.fonte] = b; });
        (s.basesUsar || []).forEach(function (u) {
          var b = inst[u.catId]; if (!b || !u.sel) return;
          var atual = b.sel || null;
          if (!atual) return;                       // instalada antes de existir variante: nada a comparar
          var difere = false;
          Object.keys(u.sel).forEach(function (k) { if (String(u.sel[k]) !== String(atual[k])) difere = true; });
          if (difere) out.push({ catId: u.catId, pedida: u.sel, instalada: atual });
        });
      } catch (e) {}
      return out;
    },
    /* Quais OUTROS orçamentos declaram este banco — é o que dá ao usuário a
       informação para decidir, em vez de um "tem certeza?" às cegas. */
    _quemUsa: function (catId, idIgnorar) {
      var nomes = [];
      try {
        (Store.listarOrcamentos(Auth.empresaId()) || []).forEach(function (o) {
          if (!o || o.id === idIgnorar) return;
          var v2 = o.config && o.config.basesV2;
          var achou = false;
          if (v2 && v2.extras) v2.extras.forEach(function (x) { if (String(x.catId) === String(catId)) achou = true; });
          if (!achou) {
            Util.arr(o.config && o.config.bases).forEach(function (b) { if (String(b.fonte).toUpperCase() === String(catId).toUpperCase()) achou = true; });
          }
          if (achou) nomes.push(o.numero || o.nome || o.id);
        });
      } catch (e) {}
      return nomes;
    },
    _resolverDivergencias: function (orc, s) {
      var divs = this._divergencias(s);
      if (!divs.length) return;
      var wz = this;
      divs.forEach(function (d) {
        var e = BasesCat.get(d.catId);
        var rot = function (sel) {
          var p = [];
          Object.keys(sel).forEach(function (k) {
            var v = sel[k];
            (e.eixos || []).forEach(function (ex) {
              if (ex.id !== k) return;
              (ex.opcoes || []).forEach(function (o) { if (String(o.v) === String(v)) v = o.r; });
            });
            p.push(v);
          });
          return p.join(" · ");
        };
        var outros = wz._quemUsa(d.catId, orc.id);
        var msg = "A " + e.nome + " já está instalada como “" + rot(d.instalada) + "” e este orçamento pediu “" + rot(d.pedida) + "”.\n\n" +
          "Só existe uma cópia de cada banco no aplicativo — trocar muda o preço para " +
          (outros.length ? "os " + outros.length + " outros orçamentos que usam esta base:\n  " + outros.slice(0, 8).join("\n  ") + (outros.length > 8 ? "\n  …e mais " + (outros.length - 8) : "") : "qualquer outro orçamento que venha a usá-la") + "\n\n" +
          "OK = trocar para “" + rot(d.pedida) + "”\nCancelar = manter “" + rot(d.instalada) + "” (este orçamento passa a declarar essa)";
        if (window.confirm(msg)) {
          d.trocar = true;
        } else {
          /* mantém o que está instalado E corrige o registro deste orçamento:
             declarar uma variante e usar outra é justamente o que não pode */
          (s.basesUsar || []).forEach(function (u) { if (u.catId === d.catId) u.sel = d.instalada; });
          var v2 = orc.config && orc.config.basesV2;
          if (v2 && v2.extras) v2.extras.forEach(function (x) { if (x.catId === d.catId) x.sel = d.instalada; });
        }
      });
      return divs.filter(function (d) { return d.trocar; });
    },

    _instalarMarcadas: function (orc, s) {
      var falta = [];
      try {
        var trocar = {};
        (this._resolverDivergencias(orc, s) || []).forEach(function (d) { trocar[d.catId] = 1; });
        var ctx = this._ctx3();
        (s.basesUsar || []).forEach(function (u) {
          var e = BasesCat.get(u.catId); if (!e) return;
          var av = BasesCat.avaliar(e, ctx);
          // instala o que falta E o que o usuário mandou trocar de variante
          if (av.podeUsar && (!av.instalada || trocar[u.catId])) falta.push(u);
        });
      } catch (e) { return; }
      if (!falta.length) { this._selarBases(orc, s); return; }

      var wz = this, okNomes = [], erroNomes = [];
      UI.toast("Instalando " + falta.length + (falta.length === 1 ? " banco" : " bancos") + " de preço…", "ok");
      falta.reduce(function (fila, u) {
        return fila.then(function () {
          var e = BasesCat.get(u.catId);
          return Bases.instalar(u.catId, u.sel, { pesoMb: e.pesoMb })
            .then(function () { okNomes.push(e.nome); })
            .catch(function (err) { erroNomes.push(e.nome + " (" + err.message + ")"); });
        });
      }, Promise.resolve()).then(function () {
        wz._selarBases(orc, s);
        if (okNomes.length) UI.toast("Instalado: " + okNomes.join(", ") + ".", "ok");
        if (erroNomes.length) {
          UI.toast("Não consegui instalar: " + erroNomes.join("; ") +
            ". O orçamento foi criado sem esses bancos — instale em " +
            (typeof Icones !== "undefined" ? Icones.get("tabela", 15) : "") + " Tabelas quando tiver conexão.", "erro");
        }
        if (wz._app && wz._app.tela === "editor") wz._app.render();
      });
    },
    /* Carimba em basesV2 o que REALMENTE está carregado, e deriva o
       config.bases (forma antiga) só das confirmadas. */
    _selarBases: function (orc, s) {
      try {
        var cfg = orc.config || {};
        var v2 = cfg.basesV2; if (!v2) return;
        var inst = {};
        (Bases.lista() || []).forEach(function (b) { inst[b.fonte] = b; });
        var ufReal = (inst.SINAPI && inst.SINAPI.uf) || "";
        v2.principal.confirmado = !!(inst.SINAPI && String(ufReal).toUpperCase() === String(v2.principal.uf || "").toUpperCase());
        var novas = [];
        if (v2.principal.confirmado) novas.push({ fonte: "SINAPI", uf: v2.principal.uf, competencia: (inst.SINAPI && inst.SINAPI.competencia) || v2.principal.competencia });
        v2.extras.forEach(function (x) {
          var b = inst[x.catId];
          x.confirmado = !!b;
          /* o registro acompanha o que REALMENTE ficou instalado: se a carga
             caiu no arquivo do pacote, ou se o usuário optou por manter a
             variante que já estava, é ISSO que o laudo vai declarar */
          if (b && b.sel) x.sel = b.sel;
          if (b) novas.push({ fonte: x.catId, uf: b.uf || "", competencia: b.competencia || "" });
        });
        cfg.bases = novas;
        orc.atualizadoEm = Util.agoraISO();
        Store.salvarOrcamento(Auth.empresaId(), orc);
      } catch (e) {}
    },

    /* ---------------- css do assistente ---------------- */
    _injetarCss: function () {
      if (document.getElementById("ow-css")) return;
      var st = document.createElement("style");
      st.id = "ow-css";
      st.textContent = [
        ".ow-trilha{display:flex;gap:8px;margin:0 0 16px}",
        ".ow-step{flex:1;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--fundo-2,rgba(127,127,127,.08));opacity:.6}",
        ".ow-step b{font-size:11.5px;font-weight:700;line-height:1.2}",
        ".ow-step .n{width:20px;height:20px;flex:0 0 20px;border-radius:99px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:rgba(127,127,127,.25)}",
        ".ow-step.on{opacity:1;box-shadow:inset 0 0 0 1px var(--aco,#2e6f9e)}",
        ".ow-step.on .n{background:var(--aco,#2e6f9e);color:#fff}",
        ".ow-step.ok{opacity:.95}.ow-step.ok .n{background:#16a34a;color:#fff}",
        // v1.1.121 — seções em CAIXAS (borda + título com filete): parâmetros organizados por bloco
        ".ow-sec{margin:0 0 16px;padding:14px;border:1px solid var(--linha,#c9d6e4);border-radius:12px;background:var(--surface,transparent)}",
        ".ow-sec h4{margin:-14px -14px 12px;padding:9px 14px;font-size:12px;font-weight:800;color:var(--aco,#2e6f9e);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--linha,#c9d6e4);background:rgba(46,111,158,.05);border-radius:12px 12px 0 0}",
        ".ow-ctx{display:flex;gap:18px;flex-wrap:wrap;align-items:center;padding:11px 14px;margin:0 0 14px;border:1px solid var(--linha-forte,#a6bdd2);border-radius:12px;background:rgba(46,111,158,.06)}",
        ".ow-ctx span{display:flex;flex-direction:column;gap:1px}",
        ".ow-ctx small{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.65}",
        ".ow-ctx b{font-size:13px}",
        ".ow-ctx-dica{flex-basis:100%;font-size:10.5px;opacity:.7;margin-top:2px}",
        ".ow-nota{font-size:11.5px;margin:4px 0 10px;line-height:1.5}",
        ".ow-radio{display:flex;gap:9px;align-items:flex-start;padding:9px 11px;margin-bottom:6px;border-radius:9px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(127,127,127,.2);font-size:12.5px;line-height:1.4}",
        ".ow-radio.on{box-shadow:inset 0 0 0 2px var(--aco,#2e6f9e);background:rgba(46,111,158,.08)}",
        ".ow-radio input{margin-top:2px}",
        ".ow-radio-lin{display:flex;gap:8px;margin-bottom:10px}.ow-radio-lin .ow-radio{flex:1;margin-bottom:0}",
        ".ow-selo{display:inline-block;font-style:normal;font-size:10px;font-weight:800;padding:2px 7px;border-radius:99px;background:#16a34a;color:#fff;margin-left:6px;vertical-align:1px}",
        ".ow-check{display:flex;gap:9px;align-items:flex-start;padding:9px 2px;cursor:pointer;font-size:12.5px;line-height:1.45}",
        ".ow-check input{margin-top:3px}.ow-check small{display:block;font-size:11px;opacity:.72;margin-top:2px}",
        ".ow-base{padding:9px 11px;border-radius:9px;box-shadow:inset 0 0 0 1px rgba(127,127,127,.18);margin-bottom:6px}",
        ".ow-box{padding:12px;border-radius:10px;background:rgba(127,127,127,.07);margin-top:6px}",
        "@media (max-width:620px){.ow-step b{display:none}.ow-trilha{gap:6px}.ow-radio-lin{flex-direction:column}}",
        /* ---- Passo 3: a tabela de bancos (Base | Local | Versão | Situação) ---- */
        ".p3-wrap{margin:0 0 4px}",
        ".p3-tab{width:100%;border-collapse:collapse;font-size:12px}",
        ".p3-tab thead th{text-align:left;padding:6px 10px;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.6;border-bottom:1px solid var(--linha,#c9d6e4)}",
        ".p3-cab td{padding:14px 10px 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--aco,#2e6f9e)}",
        ".p3-cab small{font-weight:600;text-transform:none;letter-spacing:0;opacity:.6;margin-left:6px}",
        ".p3-lin td{padding:8px 10px;border-top:1px solid rgba(127,127,127,.16);vertical-align:top}",
        /* a linha marcada fica realçada — é o sinal do print do concorrente,
           e aqui ele também serve de confirmação de que o clique pegou */
        ".p3-lin.p3-on td{background:rgba(46,111,158,.10)}",
        ".p3-lin.p3-on td:first-child{box-shadow:inset 3px 0 0 var(--aco,#2e6f9e)}",
        ".p3-ausente td{opacity:.55}",
        ".p3-marca{display:flex;gap:7px;align-items:center;cursor:pointer}",
        ".p3-marca b{font-size:12.5px}",
        ".p3-off{cursor:default;padding-left:20px}",  /* alinha com quem tem checkbox */
        ".p3-c-base small{display:block;font-size:10.5px;opacity:.66;line-height:1.35;margin-top:2px;padding-left:20px;max-width:34ch}",
        ".p3-itens{font-variant-numeric:tabular-nums}",
        ".p3-sel{width:100%;max-width:210px;font-size:11.5px;padding:4px 6px;margin-bottom:4px}",
        ".p3-sel[disabled]{opacity:.45}",
        ".p3-fixo{font-size:11.5px;opacity:.7}",
        ".p3-versao{font-weight:700;font-variant-numeric:tabular-nums}",
        ".p3-c-versao small,.p3-c-sit small{display:block;font-size:10px;opacity:.66;line-height:1.35;margin-top:2px;max-width:30ch}",
        ".p3-nova{color:#b45309;font-weight:700;opacity:1!important}",
        ".p3-selo{display:inline-block;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:99px;white-space:nowrap}",
        ".p3-g1{background:rgba(127,127,127,.18)}",                       /* sem fonte */
        ".p3-g2{background:rgba(46,111,158,.16);color:var(--aco,#2e6f9e)}", /* vem no app */
        ".p3-g3{background:rgba(22,163,74,.16);color:#15803d}",            /* servidor */
        ".p3-nota{font-style:italic}",
        ".p3-toggle{margin-top:12px;background:none;border:0;padding:4px 0;font:inherit;font-size:11.5px;font-weight:700;color:var(--aco,#2e6f9e);cursor:pointer;text-decoration:underline}",
        ".p3-rodape{font-size:11px;opacity:.72;line-height:1.5;margin:8px 0 0}",
        ".p3-plano{font-size:11.5px;font-weight:700;margin:10px 0 0;padding:8px 11px;border-radius:9px;background:rgba(46,111,158,.10)}",
        /* no celular a tabela vira lista: 4 colunas em 375px é ilegível */
        "@media (max-width:760px){.p3-tab thead{display:none}.p3-tab,.p3-tab tbody,.p3-lin,.p3-lin td{display:block;width:auto}",
        ".p3-lin{border-top:1px solid rgba(127,127,127,.2);padding:4px 0}.p3-lin td{border-top:0;padding:3px 10px}",
        ".p3-lin.p3-on td:first-child{box-shadow:none}.p3-lin.p3-on{box-shadow:inset 3px 0 0 var(--aco,#2e6f9e);background:rgba(46,111,158,.10)}",
        ".p3-sel{max-width:none}.p3-c-base small,.p3-c-versao small,.p3-c-sit small{max-width:none}}"
      ].join("");
      document.head.appendChild(st);
    }
  };

  global.OrcWizard = OrcWizard;
})(window);

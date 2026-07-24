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
        categoria: "", prazoEntrega: "", permitirZerado: false,
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
        categoria: cfg.categoria || "", prazoEntrega: cfg.prazoEntrega || "",
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
      // Tabelas extras editáveis TAMBÉM aqui (o passo 3 só existe na criação;
      // sem isto, banco desmarcado ficava sem lugar para religar).
      var excl = {}, blocoBases = "";
      Util.arr(cfg.basesExcluidas).forEach(function (f) { excl[String(f).toUpperCase()] = 1; });
      try {
        var extrasEd = (Bases.lista() || []).filter(function (b) { return b.fonte !== "SINAPI"; });
        if (extrasEd.length) {
          blocoBases = '<div class="ow-sec"><h4>Tabelas neste orçamento</h4>' +
            '<p class="muted ow-nota">Desmarcar tira a tabela da busca de itens <b>deste orçamento</b> (não desinstala nada). Tabela instalada depois entra sozinha.</p>' +
            extrasEd.map(function (b) {
              var on = !excl[String(b.fonte).toUpperCase()];
              return '<label class="ow-check ow-base"><input type="checkbox" data-base="' + esc(b.fonte) + '"' + (on ? " checked" : "") + "> " +
                '<span><b>' + esc(b.label || b.fonte) + "</b> " +
                '<i class="pill ' + esc(b.cor || "outra") + '">' + esc(b.fonte) + "</i>" +
                "<small>Local: " + esc(b.uf || "—") + " · Versão: " + esc(b.competencia || "—") + "</small></span></label>";
            }).join("") + "</div>";
        }
      } catch (eB) {}
      var corpo =
        '<p class="muted ow-nota" style="margin-top:0">Mudanças aqui <b>recalculam todos os totais</b> deste orçamento — inclusive o que já foi exportado. Confira antes de reemitir a planilha.</p>' +
        '<div class="ow-sec"><h4>Dados do orçamento</h4>' + this._corpo1() + "</div>" +
        this._corpo2() + blocoBases;
      UI.modal("⚙ Parâmetros do orçamento", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar", classe: "primary", onClick: function () { self._salvarParametros(); } }
      ]);
      this._injetarCss();
      this._bind(1); this._bind(2);
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
      cfg.categoria = s.categoria; cfg.prazoEntrega = s.prazoEntrega;
      cfg.permitirZerado = s.permitirZerado;
      cfg.arredondamento = s.arredondamento; cfg.bdiIncidencia = s.bdiIncidencia;
      cfg.encargos = { tipo: s.encargos.tipo, horista: s.encargos.horista, mensalista: s.encargos.mensalista };
      cfg.licitacao = {
        ativo: !!s.licitacao.ativo,
        tipo: s.licitacao.ativo ? s.licitacao.tipo : "",
        abertura: s.licitacao.ativo ? s.licitacao.abertura : "",
        processo: s.licitacao.ativo ? s.licitacao.processo : ""
      };
      // tabelas: grava a DENYLIST a partir dos checkboxes (se o bloco existir)
      var lB = document.querySelectorAll("#modal-bg [data-base]");
      if (lB.length) {
        var novasExcl = [];
        for (var iB = 0; iB < lB.length; iB++) { if (!lB[iB].checked) novasExcl.push(lB[iB].getAttribute("data-base")); }
        cfg.basesExcluidas = novasExcl;
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
        '<div class="field"><label>Prazo de entrega</label><input id="ow-prazo" type="date" value="' + esc(s.prazoEntrega) + '"></div></div>' +
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
    _html3: function () {
      var s = this._st;
      var extras = [];
      try {
        extras = (Bases.lista() || []).filter(function (b) { return b.fonte !== "SINAPI"; });
      } catch (e) {}
      var linhas = extras.length
        ? extras.map(function (b) {
            // padrão LIGADO: tabela que o cliente instalou continua valendo — desmarcar
            // é opção dele, e vale só para ESTE orçamento (não desliga nos outros).
            var on = s.basesExtras.indexOf(b.fonte) >= 0 || (!s._basesTocado && b.ativa !== false);
            return '<label class="ow-check ow-base"><input type="checkbox" data-base="' + esc(b.fonte) + '"' + (on ? " checked" : "") + "> " +
              '<span><b>' + esc(b.label || b.fonte) + "</b> " +
              '<i class="pill ' + esc(b.cor || "outra") + '">' + esc(b.fonte) + "</i>" +
              "<small>Local: " + esc(b.uf || "—") + " · Versão: " + esc(b.competencia || "—") + " · " + esc((b.itens && b.itens.length) || 0) + " itens</small></span></label>";
          }).join("")
        : '<p class="muted ow-nota">Nenhuma tabela extra instalada além do SINAPI. Você pode instalar SICRO, IOPES, ORSE e outras em <b>🗂 Tabelas</b> — e voltar a este orçamento depois.</p>';
      return this._trilha(3) +
        '<div class="ow-sec"><h4>SINAPI</h4>' +
        '<div class="row"><div class="field"><label>Local (estado)</label><select id="ow-uf"><option value="' + esc(s.uf) + '">' + esc(s.uf) + "</option></select></div>" +
        '<div class="field"><label>Versão (competência)</label><input id="ow-comp" value="' + esc(s.competencia) + '" readonly></div></div>' +
        '<p class="muted ow-nota">Regime declarado no passo anterior: <b>' + (s.encargos.tipo === "desonerado" ? "desonerado" : "não desonerado") +
        '</b>. Trocar o estado recarrega a base e o detalhamento de insumos daquele local.</p></div>' +
        '<div class="ow-sec"><h4>Outras tabelas neste orçamento</h4>' + linhas + "</div>";
    },
    _coletar3: function () {
      var s = this._st;
      s.uf = (val("ow-uf") || s.uf || "").toUpperCase();
      // a competência acompanha o estado escolhido (cada UF tem a sua no manifesto)
      var comp = val("ow-comp"); if (comp) s.competencia = comp;
      // Grava o que foi DESMARCADO (denylist): tabela instalada DEPOIS aparece
      // sempre — allowlist escondia banco novo e a UI prometia o contrário.
      s.basesExtras = []; s.basesExcluidas = []; s._basesTocado = true;
      var l = document.querySelectorAll("[data-base]");
      for (var i = 0; i < l.length; i++) {
        var f = l[i].getAttribute("data-base");
        if (l[i].checked) s.basesExtras.push(f); else s.basesExcluidas.push(f);
      }
      return true;
    },

    /* ---------------- render + navegação ---------------- */
    _render: function () {
      var self = this, s = this._st, p = s.passo;
      var corpo = p === 1 ? this._html1() : (p === 2 ? this._html2() : this._html3());
      var botoes = [];
      if (p > 1) botoes.push({ texto: "‹ Voltar", classe: "ghost", onClick: function () { self._ir(-1); } });
      else botoes.push({ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } });
      botoes.push(p < 3
        ? { texto: "Avançar ›", classe: "primary", onClick: function () { self._ir(1); } }
        : { texto: "✓ Criar orçamento", classe: "primary", onClick: function () { self._criar(); } });
      UI.modal("Novo orçamento — passo " + p + " de 3", corpo, botoes);
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
        var sel = UI.el("ow-uf"), app = this._app;
        if (sel && app && app._carregarEstados) {
          app._carregarEstados().then(function (ests) {
            if (!UI.el("ow-uf")) return; // modal fechou no meio do caminho
            if (!ests || !ests.length) { sel.disabled = true; return; }
            var atual = self._st.uf;
            sel.innerHTML = ests.map(function (e) {
              return '<option value="' + esc(e.uf) + '"' + (e.uf === atual ? " selected" : "") + ">" + esc(e.uf) + (e.competencia ? " · " + esc(e.competencia) : "") + "</option>";
            }).join("");
            sel.value = atual;
            sel.addEventListener("change", function () {
              var e2 = null;
              for (var i = 0; i < ests.length; i++) { if (ests[i].uf === sel.value) e2 = ests[i]; }
              var c = UI.el("ow-comp"); if (c && e2 && e2.competencia) c.value = e2.competencia;
            });
          }).catch(function () {});
        }
      }
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
        basesExcluidas: s.basesExcluidas || []
      };
      Orcamento.garantirConfig(orc);
      // A escolha de tabelas fica GRAVADA NO ORÇAMENTO (config.bases) e filtra a
      // busca de itens deste orçamento. Nada de Bases.setAtiva aqui: isso é estado
      // global da sessão e desligaria a tabela para todos os outros orçamentos.

      Store.salvarOrcamento(Auth.empresaId(), orc);
      UI.fecharModal();
      if (this._st.aoCriar) { try { this._st.aoCriar(orc); } catch (e) {} }
      if (app) {
        app.orcAtual = orc; app.tela = "editor"; app.aba = "planilha"; app.view = null;
        app.render();
        // Troca o estado da base se o usuário escolheu outro no passo 3.
        // O orçamento só assume a UF nova DEPOIS que a base carregou: se falhar,
        // o cabeçalho não pode dizer "PA" enquanto os preços continuam de "MG".
        var ufAtual = (app._baseUf || (global.Sinapi ? Sinapi.uf : "") || "").toUpperCase();
        if (orc.uf && orc.uf !== ufAtual && app.trocarEstadoSinapi) {
          var ufPedida = orc.uf;
          orc.uf = ufAtual || orc.uf;
          Store.salvarOrcamento(Auth.empresaId(), orc);
          app.trocarEstadoSinapi(ufPedida, function (ok) {
            var ufReal = (app._baseUf || (global.Sinapi ? Sinapi.uf : "") || "").toUpperCase();
            if (ok && ufReal === ufPedida) {
              orc.uf = ufPedida;
              if (global.Sinapi && Sinapi.competencia) orc.competenciaSinapi = Sinapi.competencia;
              Store.salvarOrcamento(Auth.empresaId(), orc);
            } else {
              UI.toast("Não deu para carregar a base de " + ufPedida + ". O orçamento continua em " + (orc.uf || "—") + " — troque em 🗂 Tabelas quando quiser.", "erro");
            }
            if (app.tela === "editor") app.render();
          });
        }
      }
      var selo = Arred.ehPadraoTcu(orc.config.arredondamento) ? " (padrão do TCU)" : "";
      UI.toast("Orçamento criado — " + Arred.rotulo(orc.config.arredondamento).toLowerCase() + selo + ".", "ok");
      self._st = null;
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
        ".ow-sec{margin:0 0 18px}",
        ".ow-sec h4{margin:0 0 6px;font-size:13px;font-weight:800;color:var(--aco,#2e6f9e);text-transform:uppercase;letter-spacing:.3px}",
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
        "@media (max-width:620px){.ow-step b{display:none}.ow-trilha{gap:6px}.ow-radio-lin{flex-direction:column}}"
      ].join("");
      document.head.appendChild(st);
    }
  };

  global.OrcWizard = OrcWizard;
})(window);

/* =====================================================================
 * margemui.js — FIAÇÃO FINA do painel "Margem de lucro" (prévia ?previa=motor)
 *
 * Toda a conta mora em js/margem.js (motor puro, testado). Aqui só há tela:
 * ler o campo, chamar o motor, desenhar antes × depois e, SÓ com o clique em
 * "Confirmar e aplicar", gravar pelo caminho de sempre (App.persistir).
 *
 * ⚠ ATRÁS DE PRÉVIA: o botão só existe com `Margem.previa()` (a chave que
 *   `?previa=motor` grava). Sem a prévia o orçamento é idêntico ao de antes.
 * ⚠ NADA É GRAVADO ao calcular. Calcular é simulação; aplicar pede confirmação
 *   com os valores exatos, e o motor recusa se o orçamento mudou no meio.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return global.Util.esc(s == null ? "" : String(s)); }
  function moeda(v) { return global.Util.fmtMoeda(v); }
  function pct(v, c) { return global.Util.fmtNum(v, c == null ? 2 : c) + "%"; }
  function el(id) { return global.UI.el(id); }

  var ROTULO_TIPO = { reais: "R$", preco: "% do preço de venda", custo: "% do custo direto" };

  function linha(rot, v, forte) {
    return '<tr><td>' + esc(rot) + '</td><td class="num">' + (forte ? '<b>' + v + '</b>' : v) + '</td></tr>';
  }

  /* o quadro "hoje": custo, BDI, preço, lucro */
  function htmlHoje(a) {
    var h = '<table class="tbl" style="margin:0 0 8px"><tbody>' +
      linha("Custo direto", moeda(a.custoDireto)) +
      linha("BDI" + (a.estimado ? " (percentual do orçamento)" : ""), pct(a.bdiPct, 2)) +
      linha("Preço de venda", moeda(a.precoVenda)) +
      linha("Lucro" + (a.estimado ? " (estimado)" : ""), moeda(a.lucroReais), true) +
      linha("Lucro sobre o preço de venda" + (a.estimado ? " (estimado)" : ""), pct(a.pctSobrePreco, 2)) +
      linha("Lucro sobre o custo direto" + (a.estimado ? " (estimado)" : ""), pct(a.pctSobreCusto, 2)) +
      linha("Parcela de lucro (L) do BDI" + (a.estimado ? " (estimada)" : ""), pct(a.L, 4)) +
      '</tbody></table>';
    if (a.estimado) {
      h += '<div class="muted" data-margem="estimado" style="font-size:12.5px;border-left:3px solid #b45309;padding:6px 10px;margin-bottom:8px"><b>' + esc(a.rotuloEstimado) + '</b></div>';
    } else if (a.lucroFormula != null && Math.abs(a.lucroFormula - a.lucroReais) > 0.01) {
      h += '<div class="muted" data-margem="dif-formula" style="font-size:12px;margin-bottom:8px">Pela fórmula das parcelas (custo × fator × L) o lucro seria ' + moeda(a.lucroFormula) +
        '. A diferença de ' + moeda(Math.abs(a.lucroFormula - a.lucroReais)) + ' vem do preço real: o orçamento arredonda o BDI em 2 casas e trunca o preço de cada item em centavos. O valor mostrado acima é o que o preço de venda realmente deixa.</div>';
    }
    (a.avisos || []).forEach(function (x) { h += '<div class="muted" style="font-size:12px;margin-bottom:6px">⚠ ' + esc(x) + '</div>'; });
    return h;
  }

  /* antes × depois */
  function htmlResultado(r) {
    if (!r.ok) return '<div data-margem="erro" style="border-left:3px solid #b91c1c;padding:6px 10px;font-size:13px"><b>Não dá para chegar nesta meta.</b><br>' + esc(r.motivo) + '</div>';
    var a = r.antes, d = r.depois;
    var h = '<table class="tbl" data-margem="resultado"><thead><tr><th></th><th class="num">Antes</th><th class="num">Depois</th></tr></thead><tbody>' +
      '<tr><td>Parcela de lucro (L)</td><td class="num">' + pct(a.L, 4) + '</td><td class="num">' + pct(d.L, 4) + '</td></tr>' +
      '<tr><td>BDI</td><td class="num">' + pct(a.bdiPct, 4) + '</td><td class="num">' + pct(d.bdiPct, 4) + '</td></tr>' +
      '<tr><td>Preço de venda</td><td class="num">' + moeda(a.precoVenda) + '</td><td class="num"><b>' + moeda(d.precoVenda) + '</b></td></tr>' +
      '<tr><td>Lucro (R$)</td><td class="num">' + moeda(a.lucroReais) + '</td><td class="num"><b>' + moeda(d.lucroReais) + '</b></td></tr>' +
      '<tr><td>Lucro sobre o preço</td><td class="num">' + pct(a.pctSobrePreco, 2) + '</td><td class="num">' + pct(d.pctSobrePreco, 2) + '</td></tr>' +
      '<tr><td>Lucro sobre o custo</td><td class="num">' + pct(a.pctSobreCusto, 2) + '</td><td class="num">' + pct(d.pctSobreCusto, 2) + '</td></tr>' +
      '</tbody></table>';
    h += '<div style="font-size:13px;margin:6px 0">Diferença no preço de venda: <b>' + (r.deltaPreco >= 0 ? "+" : "−") + moeda(Math.abs(r.deltaPreco)) + '</b>. ' +
      'Custo direto, administração, seguro, risco, garantia, despesas financeiras e impostos não mudam: só o lucro.</div>';
    if (Math.abs(d.erroReais) > 0.01) {
      h += '<div class="muted" style="font-size:12px;margin-bottom:6px">Meta ' + moeda(d.lucroAlvo) + ' → resulta ' + moeda(d.lucroReais) + ' (diferença de ' + moeda(Math.abs(d.erroReais)) +
        '): o orçamento trunca o preço de cada item em centavos, e este é o ponto mais perto que o BDI alcança.</div>';
    }
    if (r.semMudanca) h += '<div class="muted" style="font-size:12px;margin-bottom:6px">O orçamento já está nesta meta: aplicar não altera nada.</div>';
    if (d.avisoFaixa) h += '<div data-margem="faixa" style="border-left:3px solid #b45309;padding:6px 10px;font-size:12.5px;margin-bottom:6px">⚠ ' + esc(d.avisoFaixa) + '</div>';
    (r.avisos || []).forEach(function (x) { h += '<div class="muted" style="font-size:12px;margin-bottom:6px">⚠ ' + esc(x) + '</div>'; });
    return h;
  }

  var MargemUI = {
    _res: null, _app: null,

    /* lê o formulário → { reais } | { pct, base } */
    _lerMeta: function () {
      var tipo = (el("mg-tipo") || {}).value || "reais", v = (el("mg-valor") || {}).value;
      if (tipo === "reais") return { reais: v };
      return { pct: v, base: tipo === "custo" ? "custo" : "preco" };
    },

    abrir: function (app, inicial) {
      var self = this, orc = app && app.orcAtual;
      if (!orc || typeof Margem === "undefined") { global.UI.toast("Abra um orçamento primeiro.", "erro"); return; }
      self._app = app; self._res = null;
      var a = Margem.lucroAtual(orc);
      if (!a.ok) {
        global.UI.modal("Margem de lucro", '<p style="font-size:13px">' + esc(a.motivo) + '</p>',
          [{ texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }]);
        return;
      }
      var corpo = '<p class="muted" style="font-size:12.5px;margin-top:0">Quanto sobra de lucro neste preço — e o que precisa mudar no BDI para chegar ao lucro que você quer. ' +
        'Fórmula do Acórdão TCU 2.622/2013: só a parcela de lucro (L) se ajusta.</p>' + htmlHoje(a);
      var botoes = [{ texto: "Fechar", classe: "ghost", onClick: function () { global.UI.fecharModal(); } }];
      if (a.bloqueio) {
        corpo += '<div data-margem="bloqueio" style="border-left:3px solid #b91c1c;padding:8px 10px;font-size:13px"><b>' + esc(a.bloqueio.motivo) + '</b><br>' + esc(a.bloqueio.porta) + '</div>';
        if (a.bloqueio.acao === "revisao") botoes.push({ texto: "Criar revisão e ajustar nela", classe: "primary", onClick: function () { global.UI.fecharModal(); app.criarRevisao(orc); } });
      } else {
        var t0 = (inicial && inicial.tipo) || "reais";
        corpo += '<div class="row" style="align-items:flex-end;margin-top:8px"><div class="field"><label for="mg-tipo">Lucro desejado em</label>' +
          '<select id="mg-tipo"><option value="reais"' + (t0 === "reais" ? " selected" : "") + '>R$ (reais)</option>' +
          '<option value="preco"' + (t0 === "preco" ? " selected" : "") + '>% do preço de venda</option>' +
          '<option value="custo"' + (t0 === "custo" ? " selected" : "") + '>% do custo direto</option></select></div>' +
          '<div class="field"><label for="mg-valor">Meta</label><input id="mg-valor" type="text" inputmode="decimal" placeholder="Ex.: 120.000,00" value="' + esc((inicial && inicial.valor) || "") + '"></div></div>' +
          '<div id="mg-res" style="margin-top:8px"></div>';
        botoes.push({ texto: "Calcular", classe: "", onClick: function () { self.calcular(); } });
        botoes.push({ texto: "Aplicar…", classe: "primary", onClick: function () { self.confirmar(); } });
      }
      global.UI.modal("Margem de lucro", corpo, botoes);
      if (inicial && inicial.valor) self.calcular();
    },

    calcular: function () {
      var orc = this._app && this._app.orcAtual, box = el("mg-res");
      if (!orc || !box) return;
      this._res = Margem.resolverPorLucro(orc, this._lerMeta());
      this._meta = this._lerMeta();
      box.innerHTML = htmlResultado(this._res);
    },

    /* a confirmação mostra os valores EXATOS que serão gravados */
    confirmar: function () {
      var self = this, app = this._app, orc = app && app.orcAtual;
      if (!orc) return;
      if (!this._res) this.calcular();
      var r = this._res;
      if (!r || !r.ok) { global.UI.toast((r && r.motivo) || "Calcule uma meta válida antes de aplicar.", "erro"); return; }
      var v = Margem.validar(orc, r);
      if (!v.ok) { global.UI.toast(v.motivo + (v.porta ? " " + v.porta : ""), "erro"); return; }
      var d = r.depois, meta = this._meta || {};
      var corpo = '<p style="font-size:13px;margin-top:0">Vai gravar no orçamento <b>' + esc(orc.numero || "") + '</b>:</p>' +
        '<ul style="font-size:13px;line-height:1.6">' +
        '<li>Parcela de lucro (L): <b>' + pct(r.antes.L, 4) + '</b> → <b>' + pct(d.params.L, 4) + '</b></li>' +
        '<li>BDI: <b>' + pct(r.antes.bdiPct, 4) + '</b> → <b>' + pct(d.percentual, 4) + '</b> <span class="muted">(gravado ' + global.Util.fmtNum(d.percentual, 8) + '%)</span></li>' +
        '<li>Preço de venda: <b>' + moeda(r.antes.precoVenda) + '</b> → <b>' + moeda(d.precoVenda) + '</b> (' + (r.deltaPreco >= 0 ? "+" : "−") + moeda(Math.abs(r.deltaPreco)) + ')</li>' +
        '<li>Lucro: <b>' + moeda(r.antes.lucroReais) + '</b> → <b>' + moeda(d.lucroReais) + '</b> (' + pct(d.pctSobrePreco, 2) + ' do preço · ' + pct(d.pctSobreCusto, 2) + ' do custo)</li></ul>';
      if (r.semMudanca) corpo += '<p class="muted" style="font-size:12.5px">O orçamento já está nesta meta: confirmar não altera nada.</p>';
      if (r.estimado) corpo += '<p style="font-size:12.5px;border-left:3px solid #b45309;padding:6px 10px">Este orçamento <b>só guardava o percentual</b> do BDI. Ao aplicar, as parcelas AC, S, R, G, DF e Impostos serão gravadas com os valores do modelo «' +
        esc(((global.CONFIG.bdiPresets[r.antes.modeloBase] || {}).nome) || "Padrão") + '» e o orçamento passa a constar como <b>com composição detalhada</b>. Confira essas parcelas na aba BDI.</p>';
      if (d.avisoFaixa) corpo += '<p style="font-size:12.5px;border-left:3px solid #b45309;padding:6px 10px">⚠ ' + esc(d.avisoFaixa) + '</p>';
      if (Math.abs(d.erroReais) > 0.01) corpo += '<p class="muted" style="font-size:12px">Atenção: o lucro que resulta (' + moeda(d.lucroReais) + ') difere da meta (' + moeda(d.lucroAlvo) + ') em ' + moeda(Math.abs(d.erroReais)) + ' por causa do arredondamento do orçamento.</p>';
      global.UI.modal("Confirmar a margem de lucro", corpo, [
        { texto: "Voltar", classe: "ghost", onClick: function () { self.abrir(app, { tipo: meta.reais != null ? "reais" : (meta.base === "custo" ? "custo" : "preco"), valor: meta.reais != null ? meta.reais : meta.pct }); } },
        { texto: "Confirmar e aplicar", classe: "primary", onClick: function () { self.aplicar(); } }
      ]);
    },

    aplicar: function () {
      var app = this._app, orc = app && app.orcAtual, r = this._res;
      if (!orc || !r) return;
      var g = Margem.aplicar(orc, r);
      if (!g.ok) { global.UI.fecharModal(); global.UI.toast(g.motivo + (g.porta ? " " + g.porta : ""), "erro"); return; }
      if (!g.aplicou) { global.UI.fecharModal(); global.UI.toast(g.motivo, "ok"); return; }
      var gravou = app.persistir(); global.UI.fecharModal();
      if (!app._gravou(gravou)) {
        /* ⚠ não gravou: a memória NÃO pode ficar com o BDI novo (o próximo salvar o gravaria sem ninguém ver).
           Volta ao que estava (cópia profunda) e redesenha. */
        orc.bdi = JSON.parse(JSON.stringify(g.bdiAntes));
        app.render();
        var pa = (orc.bdi && orc.bdi.percentual != null) ? global.Util.fmtNum(orc.bdi.percentual, 2) : "";
        global.UI.toast("Não salvei: o BDI voltou ao anterior (" + pa + "%). Tente de novo.", "erro");
        return;
      }
      app.render();
      global.UI.toast("Margem aplicada: lucro de " + moeda(g.depois.lucroReais) + " (" + pct(g.depois.pctSobrePreco, 2) + " do preço) · BDI " + pct(g.depois.bdiPct, 2) + ".", "ok");
      try { var av = g.depois.avisoFaixa; if (av) global.UI.toast("⚠ " + av, "erro"); } catch (e) {}
    }
  };

  global.MargemUI = MargemUI;
  if (typeof module !== "undefined" && module.exports) module.exports = MargemUI;
})(typeof window !== "undefined" ? window : globalThis);

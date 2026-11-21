/* =====================================================================
 * reajusteui.js — FIAÇÃO do "Reajustar por índice" (orçamento e contrato)
 *
 * O motor é js/reajusteindice.js (puro, testado com fixture do Banco Central).
 * Aqui só: pergunta índice / mês-base / mês-alvo, baixa a série UMA vez por clique em "Calcular",
 * mostra o fator mês a mês com a fonte e o link, e só então oferece aplicar.
 *   • Orçamento: aplica no custo unitário dos itens, com o antes guardado em orc.reajusteIndice
 *     (botão "Desfazer reajuste" aparece enquanto o carimbo existir).
 *   • Contrato: NÃO mexe no valor. Abre o formulário de TERMO ADITIVO já preenchido (valor, motivo com a
 *     série e o link) — nasce pendente e passa pela aprovação de sempre. Dinheiro de contrato muda por aditivo, nunca à mão.
 * ES5 de propósito.
 * ===================================================================== */
(function (global) {
  "use strict";
  function s(v) { return v == null ? "" : String(v); }
  function esc(v) { return s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return global.document ? global.document.getElementById(id) : null; }
  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function mesDe(d) { return d.getFullYear() + "-" + dd(d.getMonth() + 1); }
  function moeda(v) { return global.Util && Util.fmtMoeda ? Util.fmtMoeda(v) : s(v); }
  function pct4(v) { return v.toFixed(4).replace(".", ",") + "%"; }
  function dataHora(ms) { var d = new Date(ms); return dd(d.getDate()) + "/" + dd(d.getMonth() + 1) + "/" + d.getFullYear() + " " + dd(d.getHours()) + ":" + dd(d.getMinutes()); }

  /* tabela do cálculo — a pessoa CONFERE a conta, não confia nela */
  function htmlCalculo(calc, serieId, fonte) {
    var RI = global.ReajusteIndice, d = RI.SERIES[serieId];
    if (!calc.ok) return '<div style="border:1px solid #c00000;color:#c00000;padding:8px;font-size:12.5px"><b>Não deu para calcular.</b> ' + esc(calc.erro) + '</div>';
    var h = '<div style="font-size:13px;margin:8px 0"><b>Fator acumulado: ' + calc.fator.toFixed(6).replace(".", ",") + '</b> (' + pct4(calc.pct) + ' de ' + calc.meses[0].mes + ' a ' + calc.mesAlvo + ')</div>' +
      '<div class="muted" style="font-size:12px;margin-bottom:6px">' + esc(calc.regra) + '</div>' +
      '<div style="overflow:auto;max-height:26vh"><table class="tbl" style="font-size:12px"><thead><tr><th>Mês</th><th class="num">Variação</th><th class="num">Acumulado</th></tr></thead><tbody>' +
      calc.meses.map(function (m) { return "<tr><td>" + m.mes + '</td><td class="num">' + m.valor.toFixed(2).replace(".", ",") + '%</td><td class="num">' + m.acumulado.toFixed(6).replace(".", ",") + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      '<p class="muted" style="font-size:12px;margin:8px 0 0">Fonte: Banco Central do Brasil — SGS, série ' + d.codigo + " (" + esc(d.nome) + ", " + esc(d.orgao) + "). " +
      (fonte && fonte.url ? '<a href="' + esc(fonte.url) + '" target="_blank" rel="noopener">abrir a série na fonte</a>. ' : "") +
      (fonte ? "Consultada em " + dataHora(fonte.baixadoEm) + (fonte.deCache ? " (guardada neste computador" + (fonte.velho ? " — <b>sem internet, dado possivelmente desatualizado</b>" : "") + ")" : "") + "." : "") + "</p>";
    return h;
  }

  /* o formulário comum; `ext` define os botões e o que fazer com o cálculo */
  function abrir(ext) {
    var UI = global.UI, RI = global.ReajusteIndice;
    if (!UI || !RI) return;
    var estado = { calc: null, serie: "ipca", fonte: null, ocupado: false };
    var hoje = new Date(), alvoPad = mesDe(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1));
    var basePad = ext.baseSugerida && RI.mesOk(ext.baseSugerida) ? ext.baseSugerida : mesDe(new Date(hoje.getFullYear() - 1, hoje.getMonth() - 2, 1));
    var opt = Object.keys(RI.SERIES).map(function (k) { return '<option value="' + k + '">' + esc(RI.SERIES[k].nome) + " (" + esc(RI.SERIES[k].orgao) + ") — SGS " + RI.SERIES[k].codigo + "</option>"; }).join("");
    var corpo = ext.introHtml +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:10px 0">' +
      '<label style="flex:1 1 220px"><span style="font-size:12px;color:#64748b">Índice</span><select id="ri-idx" style="width:100%">' + opt + "</select></label>" +
      '<label><span style="font-size:12px;color:#64748b">Mês-base (data-base do preço)</span><input type="month" id="ri-base" value="' + basePad + '"></label>' +
      '<label><span style="font-size:12px;color:#64748b">Mês-alvo (último índice a aplicar)</span><input type="month" id="ri-alvo" value="' + alvoPad + '"></label></div>' +
      '<details style="margin:4px 0;font-size:12.5px"><summary>Sem internet? Cole a série do Banco Central</summary>' +
      '<textarea id="ri-cola" rows="3" style="width:100%" placeholder="Uma linha por mês: 2025-02;1,31 — ou o JSON baixado da fonte"></textarea></details>' +
      '<div id="ri-res" class="muted" style="font-size:13px">Escolha o índice e os meses e clique em <b>Calcular fator</b>. Nada é baixado antes disso.</div>';
    /* mudou índice/mês: o cálculo mostrado deixa de valer e o botão de aplicar exige recalcular */
    function limpar() { estado.calc = null; var box = el("ri-res"); if (box) box.innerHTML = "Dados alterados — clique em <b>Calcular fator</b> de novo."; }
    function calcular() {
      if (estado.ocupado) return;     /* freio: uma consulta por vez */
      var serie = (el("ri-idx") || {}).value || "ipca", base = (el("ri-base") || {}).value, alvo = (el("ri-alvo") || {}).value, box = el("ri-res");
      if (!RI.mesOk(base) || !RI.mesOk(alvo)) { box.innerHTML = htmlCalculo({ ok: false, erro: "Informe o mês-base e o mês-alvo." }, serie); return; }
      if (alvo <= base) { box.innerHTML = htmlCalculo({ ok: false, erro: "O mês-alvo precisa ser depois do mês-base." }, serie); return; }
      var cola = s((el("ri-cola") || {}).value).replace(/^\s+|\s+$/g, "");
      estado.ocupado = true; box.textContent = "Consultando o Banco Central…";
      var prom;
      if (cola) { var l = RI.lerSerie(cola); prom = l.pontos.length ? global.Promise.resolve({ pontos: l.pontos, fonte: { url: "", baixadoEm: new Date().getTime(), deCache: true, velho: false, colada: true } }) : global.Promise.reject(new Error("Não entendi a série colada.")); }
      else prom = RI.obterSerie(serie, base, alvo);
      prom.then(function (r) {
        estado.ocupado = false; estado.serie = serie; estado.fonte = r.fonte;
        estado.calc = RI.fatorAcumulado(r.pontos, base, alvo);
        var html = htmlCalculo(estado.calc, serie, r.fonte);
        if (r.fonte && r.fonte.colada) html += '<p class="muted" style="font-size:12px">Série colada por você — a fonte não foi consultada.</p>';
        box.innerHTML = html;
      }, function (e) {
        estado.ocupado = false; estado.calc = null;
        box.innerHTML = htmlCalculo({ ok: false, erro: e && e.message ? e.message : "falha desconhecida" }, serie);
      });
    }
    var botoes = [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }].concat(ext.botoesExtra ? ext.botoesExtra(estado) : []);
    botoes.push({ texto: "Calcular fator", classe: "ghost", onClick: calcular });
    botoes.push({ texto: ext.rotuloAplicar, classe: "primary", onClick: function () { if (!estado.calc || !estado.calc.ok) { UI.toast("Calcule o fator antes.", "erro"); return; } ext.aplicar(estado); } });
    UI.modal(ext.titulo, corpo, botoes);
    var corpoEl = el("modal-bg");
    if (corpoEl) { var ch = corpoEl.querySelectorAll("select,input"), i; for (i = 0; i < ch.length; i++) ch[i].addEventListener("change", limpar); }
  }

  function abrirOrcamento(App) {
    var orc = App && App.orcAtual, RI = global.ReajusteIndice, UI = global.UI;
    if (!orc) return;
    var comp = s(orc.competenciaSinapi).slice(0, 7);
    var intro = '<p style="font-size:13px;margin-top:0">Reajusta o <b>custo unitário</b> dos itens pelo índice oficial acumulado entre a data-base dos preços e o mês-alvo. Você confere a conta mês a mês antes de aplicar, e dá para <b>desfazer</b> depois.</p>' +
      (orc.reajusteIndice ? '<p style="border:1px solid #b45309;color:#b45309;padding:6px;font-size:12.5px">Este orçamento <b>já foi reajustado</b> em ' + esc(s(orc.reajusteIndice.aplicadoEm).slice(0, 10)) + " por " + esc(RI.SERIES[orc.reajusteIndice.indice] ? RI.SERIES[orc.reajusteIndice.indice].nome : "") + " (fator " + Number(orc.reajusteIndice.fator).toFixed(6).replace(".", ",") + "). Desfaça antes de aplicar outro.</p>" : "");
    abrir({
      titulo: "Reajustar o orçamento por índice", introHtml: intro, baseSugerida: comp, rotuloAplicar: "Aplicar ao orçamento",
      botoesExtra: function () {
        return orc.reajusteIndice ? [{ texto: "Desfazer reajuste", classe: "ghost", onClick: function () {
          if (!global.confirm("Desfazer o reajuste? Os custos unitários voltam ao que eram antes dele (inclusive o que você tenha editado à mão nos itens reajustados depois).")) return;
          var r = RI.desfazerOrcamento(orc); if (!r.ok) { UI.toast(r.erro, "erro"); return; }
          var g = App.persistir(); UI.fecharModal(); App.render();
          if (App._gravou(g)) UI.toast("Reajuste desfeito em " + r.itens + " item(ns).", "ok");
        } }] : [];
      },
      aplicar: function (st) {
        var plano = RI.planoOrcamento(orc, st.calc.fator);
        if (!global.confirm("Aplicar o fator " + st.calc.fator.toFixed(6).replace(".", ",") + " (" + pct4(st.calc.pct) + ") no custo unitário de " + plano.itens.length + " item(ns)?\n\nÍndice: " + RI.SERIES[st.serie].nome + ", de " + st.calc.mesBase + " (base) a " + st.calc.mesAlvo + ".\nÉ possível desfazer depois.")) return;
        var r = RI.aplicarOrcamento(orc, st.calc, st.serie, st.fonte);
        if (!r.ok) { UI.toast(r.erro, "erro"); return; }
        var g = App.persistir(); UI.fecharModal(); App.render();
        if (App._gravou(g)) UI.toast("Reajuste aplicado em " + r.itens + " item(ns): total de " + moeda(r.totalAntes) + " para " + moeda(r.totalDepois) + ".", "ok");
      }
    });
  }

  function abrirContrato(contratoId) {
    var RI = global.ReajusteIndice, UI = global.UI, G = global.Gestao;
    if (!G || !global.Store || !global.Auth) return;
    var emp = Auth.empresaId(), c = Store.obter(emp, "contratos", contratoId);
    if (!c) { UI.toast("Contrato não encontrado.", "erro"); return; }
    var vig = (global.Aditivo && Aditivo.vigente) ? Aditivo.vigente(c, Store.listar(emp, "aditivos")) : { valor: Number(c.valor) || 0 };
    var dataBase = s(c.dataAssinatura || c.dataInicio || c.data).slice(0, 7);
    var intro = '<p style="font-size:13px;margin-top:0">Contrato <b>' + esc(c.numero || "—") + "</b> · valor vigente <b>" + moeda(vig.valor) + "</b>. O reajuste <b>não altera o contrato</b>: abre um <b>termo aditivo</b> já preenchido (valor, motivo com a série e o link da fonte), que passa pela aprovação normal. Confira a cláusula de reajuste e a data-base do contrato.</p>";
    abrir({
      titulo: "Reajustar o contrato por índice", introHtml: intro, baseSugerida: dataBase, rotuloAplicar: "Criar aditivo de reajuste",
      aplicar: function (st) {
        var a = RI.aditivoDeContrato(vig.valor, st.calc, st.serie, st.fonte);
        if (!a.ok) { UI.toast(a.erro, "erro"); return; }
        UI.fecharModal();
        G.formAditivo({ contratoId: contratoId, obraId: c.obraId || "", valor: a.valor, motivo: a.motivo, fundamento: a.fundamento });
      }
    });
  }

  global.ReajusteUI = { abrirOrcamento: abrirOrcamento, abrirContrato: abrirContrato, htmlCalculo: htmlCalculo };
  if (typeof module !== "undefined" && module.exports) module.exports = global.ReajusteUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

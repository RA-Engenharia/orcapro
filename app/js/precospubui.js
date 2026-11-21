/* =====================================================================
 * precospubui.js — FIAÇÃO da pesquisa de preços públicos (motor: js/precospub.js)
 *
 *  1) CPLPRO → aba «Preços públicos»: consulta o serviço público do CertamePRO (atas e contratos), monta o MAPA DE PREÇOS com fonte e link
 *     de cada preço, descarta outliers por regra explícita e configurável, e gera o RELATÓRIO da pesquisa (.html) e o mapa (.xlsx) com a
 *     data da consulta. Segunda visão: «Atas vigentes para adesão (carona)».
 *  2) OrçaPRO → orçamento → «Comparar com preços públicos»: por item, uma consulta por clique, orçado × faixa praticada, com alerta.
 *
 * ⚠ O serviço ainda não estava no ar quando isto foi escrito (HTTP 401 em 20/11/2026): sem ele a tela mostra o recado de «indisponível»
 *   e a pesquisa manual do passo de pesquisa do processo segue valendo. Nada é consultado ao abrir a tela.
 * ES5 de propósito.
 * ===================================================================== */
(function (global) {
  "use strict";
  var PP = global.PrecosPub;
  if (!PP) return;
  var CHREGRA = "orcapro:precospub:regra";

  function s(v) { return v == null ? "" : String(v); }
  function esc(v) { return s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return global.document ? global.document.getElementById(id) : null; }
  function val(id) { var e = el(id); return e ? s(e.value).replace(/^\s+|\s+$/g, "") : ""; }
  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  function num(v) { var t = s(v).replace(/[^0-9.,]/g, ""); if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", "."); var n = parseFloat(t); return isFinite(n) ? n : NaN; }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function toast(m, t) { try { if (global.UI && global.UI.toast) global.UI.toast(m, t || "info"); } catch (e) {} }

  function regraSalva() {
    var r = { baixo: PP.REGRA_PADRAO.baixo, alto: PP.REGRA_PADRAO.alto, metodo: PP.REGRA_PADRAO.metodo };
    try { var o = JSON.parse(global.localStorage.getItem(CHREGRA) || "null"); if (o && o.baixo >= 0 && o.alto > 0) { r.baixo = o.baixo; r.alto = o.alto; r.metodo = o.metodo || r.metodo; } } catch (e) {}
    return r;
  }
  function gravarRegra(r) { try { global.localStorage.setItem(CHREGRA, JSON.stringify(r)); } catch (e) {} }

  function novoEstado() {
    var h = new Date(), a = new Date(h.getFullYear() - 1, h.getMonth(), h.getDate());
    return { params: { q: "", uf: "", desde: iso(a), ate: iso(h), limite: 50 }, regra: regraSalva(), proc: "", obj: "", consulta: null, falha: "", visao: "mapa", ocupado: false };
  }
  var E = novoEstado();

  function lerForm() {
    if (!el("pp-q")) return;
    E.params.q = val("pp-q"); E.params.uf = val("pp-uf"); E.params.desde = val("pp-desde"); E.params.ate = val("pp-ate"); E.params.limite = parseInt(val("pp-limite"), 10) || 50;
    E.proc = val("pp-proc"); E.obj = val("pp-obj");
    var b = num(val("pp-baixo")), a = num(val("pp-alto"));
    if (isFinite(b) && b >= 0) E.regra.baixo = b;
    if (isFinite(a) && a > 0) E.regra.alto = a;
    E.regra.metodo = val("pp-metodo") || E.regra.metodo;
  }
  function pesquisaAtual() { return E.consulta ? PP.montarPesquisa(E.consulta, E.regra) : null; }
  function render() { try { if (global.App && global.App.render) global.App.render(); } catch (e) {} }

  var UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
  function fmtN(v) { return typeof v === "number" ? v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "—"; }
  function dataBR(i) { return PP.brDeIso(i); }
  function link(u) { return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">abrir</a>' : "—"; }

  function tabelaItens(lista, comMotivo) {
    var h = '<div style="overflow:auto;max-height:46vh"><table class="tbl" style="font-size:12px"><thead><tr><th>Descrição</th><th>Un.</th><th class="num">Valor unit.</th><th>Data</th><th>Órgão</th><th>Local</th><th>Fornecedor</th><th>Tipo</th><th>Fonte</th>' + (comMotivo ? "<th>Motivo</th>" : "") + "</tr></thead><tbody>";
    lista.forEach(function (x) {
      var i = comMotivo ? x.item : x;
      h += "<tr><td>" + esc(i.descricao) + "</td><td>" + esc(i.unidade) + '</td><td class="num">' + fmtN(i.valor) + "</td><td>" + dataBR(i.data) + "</td><td>" + esc(i.orgao) + "</td><td>" + esc(i.municipio ? i.municipio + "/" + i.uf : i.uf) + "</td><td>" + esc(i.fornecedor) + "</td><td>" + esc(i.tipo) + "</td><td>" + link(i.link) + "</td>" + (comMotivo ? "<td>" + esc(x.motivo) + "</td>" : "") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function tabelaAtas(lista) {
    var h = '<div style="overflow:auto;max-height:46vh"><table class="tbl" style="font-size:12px"><thead><tr><th>Órgão gerenciador</th><th>Local</th><th>Descrição</th><th>Un.</th><th class="num">Valor unit.</th><th class="num">Qtd. registrada</th><th>Vigência</th><th>Fornecedor</th><th>Ata</th></tr></thead><tbody>';
    lista.forEach(function (i) {
      h += "<tr><td>" + esc(i.orgao) + "</td><td>" + esc(i.municipio ? i.municipio + "/" + i.uf : i.uf) + "</td><td>" + esc(i.descricao) + "</td><td>" + esc(i.unidade) + '</td><td class="num">' + fmtN(i.valor) + '</td><td class="num">' + (i.quantidade == null ? "—" : fmtN(i.quantidade)) + "</td><td>até " + dataBR(i.vigenteAte) +
        (i.vigenciaPresumida ? ' <span class="muted" title="O serviço não informou o fim da vigência: presumida em 12 meses a partir da data da ata. Confira no link.">(presumida)</span>' : "") + "</td><td>" + esc(i.fornecedor) + "</td><td>" + link(i.link) + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }

  /* conteúdo da aba (sem cabeçalho do CPLPRO: quem chama põe cab + abas) */
  function html() {
    var M = global.Modulo, p = E.params, r = E.regra, pesq = pesquisaAtual(), h = "";
    h += M.aviso({ tom: "info", titulo: "Pesquisa de preços em contratações públicas (Lei 14.133/2021, art. 23, § 1º, II).",
      texto: "Consulta o serviço público do CertamePRO: preços de atas e contratos de órgãos públicos, cada um com órgão, data e link. Nada é consultado ao abrir esta tela — só quando você clicar em Consultar. Os preços descartados e a regra usada saem no relatório." });
    var corpo = '<div class="cpl-form" id="pp-form">' +
      '<div class="field"><label>O que pesquisar</label><input id="pp-q" value="' + esc(p.q) + '" placeholder="ex.: cimento Portland CP II 50 kg" style="min-width:260px"></div>' +
      '<div class="field"><label>UF</label><select id="pp-uf"><option value="">todas</option>' + UFS.map(function (u) { return "<option" + (u === p.uf ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>De (data do contrato/ata)</label><input id="pp-desde" type="date" value="' + esc(p.desde) + '"></div>' +
      '<div class="field"><label>Até</label><input id="pp-ate" type="date" value="' + esc(p.ate) + '"></div>' +
      '<div class="field"><label>Até quantos preços</label><select id="pp-limite">' + [20, 50, 100].map(function (n) { return "<option" + (n === p.limite ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="cpl-form"><div class="field"><label>Processo (para o relatório)</label><input id="pp-proc" value="' + esc(E.proc) + '" placeholder="ex.: Pregão 12/2026"></div>' +
      '<div class="field"><label>Objeto</label><input id="pp-obj" value="' + esc(E.obj) + '" style="min-width:260px"></div></div>' +
      '<h4 style="margin:12px 0 4px">Regra de descarte (outliers)</h4>' +
      '<div class="cpl-form"><div class="field"><label>Descartar abaixo de (× a mediana)</label><input id="pp-baixo" inputmode="decimal" style="width:90px" value="' + esc(s(r.baixo).replace(".", ",")) + '"></div>' +
      '<div class="field"><label>Descartar acima de (× a mediana)</label><input id="pp-alto" inputmode="decimal" style="width:90px" value="' + esc(s(r.alto).replace(".", ",")) + '"></div>' +
      '<div class="field"><label>Preço de referência pela</label><select id="pp-metodo">' + [["mediana", "Mediana"], ["media", "Média"], ["menor", "Menor valor"]].map(function (o) { return "<option value=\"" + o[0] + "\"" + (o[0] === r.metodo ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div></div>" +
      '<p class="muted" style="font-size:12px;margin:2px 0 8px">Padrão: fora de 0,5× a 2× a mediana de todos os preços coletados, em uma única passada. A mediana é a base do art. 23; ajuste a faixa se o objeto pedir.</p>' +
      '<div class="cpl-acoes"><button type="button" class="btn primary" data-gacao="pp-consultar"' + (E.ocupado ? " disabled" : "") + ">" + (E.ocupado ? "Consultando…" : "Consultar preços públicos") + "</button> " +
      (E.consulta ? '<button type="button" class="btn" data-gacao="pp-recalcular">Aplicar a regra de novo (sem nova consulta)</button>' : "") + "</div>";
    h += M.secao({ titulo: "Consulta", corpoHtml: corpo });
    if (E.falha) h += M.aviso({ tom: "alerta", titulo: "Não foi possível consultar agora.", texto: E.falha });
    if (!pesq) return h;
    var st = pesq.referencia.stats;
    h += M.kpis([
      { rotulo: "Preços coletados", valor: String(pesq.itens.length), sub: "consulta de " + dataBR(s(pesq.consultadoEm).slice(0, 10)) },
      { rotulo: "Usados / descartados", valor: pesq.mantidos.length + " / " + pesq.descartados.length, sub: "regra " + s(pesq.regra.baixo).replace(".", ",") + "× a " + s(pesq.regra.alto).replace(".", ",") + "× a mediana" },
      { rotulo: "Preço de referência (" + (pesq.referencia.metodo || "") + ")", valor: pesq.referencia.valor == null ? "—" : "R$ " + fmtN(pesq.referencia.valor), sub: st.n ? "faixa R$ " + fmtN(st.minimo) + " a R$ " + fmtN(st.maximo) : "sem preços usados", tom: st.n ? "pos" : "alerta" }
    ]);
    if (pesq.estatisticaServico && pesq.estatisticaServico.mediana != null && Math.abs(pesq.estatisticaServico.mediana - (pesq.medianaBase || 0)) > 0.02) {
      h += M.aviso({ tom: "info", titulo: "A mediana do serviço difere da calculada aqui.", texto: "Serviço: R$ " + fmtN(pesq.estatisticaServico.mediana) + " (n=" + s(pesq.estatisticaServico.n) + "). Aqui: R$ " + fmtN(pesq.medianaBase) + " sobre os " + pesq.itens.length + " preços válidos recebidos. A regra de descarte usa a calculada aqui." });
    }
    if (pesq.invalidos) h += '<p class="muted" style="font-size:12px">' + pesq.invalidos + " registro(s) do serviço sem valor unitário utilizável foram ignorados.</p>";
    var abas = global.Modulo.abas([{ id: "mapa", rotulo: "Mapa de preços", ativa: E.visao === "mapa", attrs: 'data-gacao="pp-visao" data-v="mapa"' }, { id: "atas", rotulo: "Atas vigentes para adesão (carona)", ativa: E.visao === "atas", attrs: 'data-gacao="pp-visao" data-v="atas"' }]);
    h += abas;
    if (E.visao === "atas") {
      var atas = PP.atasVigentes(pesq.itens, iso(new Date()));
      h += M.aviso({ tom: "alerta", titulo: "Isto é uma lista de candidatas, não autorização de adesão.", texto: "A adesão (carona) exige previsão no edital da ata, vantajosidade comprovada, anuência do órgão gerenciador e do fornecedor e respeito aos limites do art. 86 da Lei 14.133/2021 e do regulamento do seu órgão. A vigência marcada «presumida» não veio do serviço: confira no link da ata." });
      h += atas.length ? tabelaAtas(atas) : '<p class="muted">Nenhuma ata vigente entre os preços coletados.</p>';
    } else {
      h += pesq.mantidos.length ? tabelaItens(pesq.mantidos, false) : '<p class="muted">Nenhum preço restou depois da regra de descarte.</p>';
      if (pesq.descartados.length) h += '<details style="margin-top:8px"><summary><b>' + pesq.descartados.length + " preço(s) descartado(s)</b> — " + esc(pesq.regraTexto) + "</summary>" + tabelaItens(pesq.descartados, true) + "</details>";
    }
    h += '<div class="cpl-acoes" style="margin-top:10px"><button type="button" class="btn" data-gacao="pp-relatorio">Relatório da pesquisa (.html, para o processo)</button> <button type="button" class="btn" data-gacao="pp-xlsx">Mapa de preços (.xlsx)</button></div>';
    h += '<p class="muted" style="font-size:12px">Fonte: serviço público do CertamePRO — <a href="' + esc(pesq.url) + '" target="_blank" rel="noopener">' + esc(pesq.url) + "</a>. Consultado em " + dataBR(s(pesq.consultadoEm).slice(0, 10)) + (E.consulta.deCache ? " (guardado neste computador por até 1 h)" : "") + ".</p>";
    return h;
  }

  var acoes = {
    "pp-consultar": function () {
      lerForm(); gravarRegra(E.regra);
      if (E.ocupado) return;
      E.ocupado = true; E.falha = ""; render();
      PP.consultar(E.params).then(function (r) {
        E.ocupado = false;
        if (r.ok) { r.params = { q: E.params.q, uf: E.params.uf, desde: E.params.desde, ate: E.params.ate, limite: E.params.limite }; E.consulta = r; E.falha = ""; E.visao = "mapa"; }
        else E.falha = r.motivo || r.erro || "Falha desconhecida.";
        render();
      });
    },
    "pp-recalcular": function () { lerForm(); gravarRegra(E.regra); render(); },
    "pp-visao": function (ds) { lerForm(); E.visao = ds && ds.v === "atas" ? "atas" : "mapa"; render(); },
    "pp-relatorio": function () {
      lerForm(); var pesq = pesquisaAtual(); if (!pesq) { toast("Consulte antes de gerar o relatório.", "erro"); return; }
      var info = { processo: E.proc, objeto: E.obj }, nome = "pesquisa-de-precos-" + s(pesq.consultadoEm).slice(0, 10) + ".html";
      global.Util.baixar(nome, PP.relatorioHtml(pesq, info), "text/html;charset=utf-8");
      toast("Relatório gerado (" + nome + "), com a data da consulta, a regra e os links.", "ok");
    },
    "pp-xlsx": function () {
      lerForm(); var pesq = pesquisaAtual(); if (!pesq) { toast("Consulte antes de gerar a planilha.", "erro"); return; }
      var Ex = global.ExcelOrc; if (!Ex || !Ex.ensureExcelJS) { toast("O gerador de Excel não carregou.", "erro"); return; }
      Ex.ensureExcelJS(function () {
        try {
          var wb = PP.construirXlsx(global.ExcelJS, pesq);
          wb.xlsx.writeBuffer().then(function (buf) {
            global.Util.baixar("mapa-de-precos-" + s(pesq.consultadoEm).slice(0, 10) + ".xlsx", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            toast("Mapa de preços gerado.", "ok");
          });
        } catch (e) { toast("Não consegui gerar a planilha: " + (e && e.message ? e.message : e), "erro"); }
      });
    }
  };
  if (global.Gestao && global.Gestao.registrarAcoes) global.Gestao.registrarAcoes("cplpro", acoes);

  /* ---------- OrçaPRO: comparar um item do orçamento com os preços públicos ---------- */
  function termoDoItem(d) {
    /* tira código/numeração do começo e corta em ~8 palavras: o texto do orçamento é longo demais para busca; a pessoa edita */
    var t = s(d).replace(/^\s*[\d.]+\s*[-–.]?\s*/, "").replace(/\s+/g, " ");
    return t.split(" ").slice(0, 8).join(" ");
  }
  function abrirOrcamento(App) {
    var orc = App && App.orcAtual, UI = global.UI, M = global.Modulo;
    if (!orc || !UI || !global.Orcamento) return;
    var linhas = global.Orcamento.calcular(orc).linhas.filter(function (L) { return L.item && !L.item.qtdPendente && (Number(L.precoUnit) > 0 || Number(L.custoUnitario) > 0); });
    var regra = regraSalva(), h = new Date(), desde = iso(new Date(h.getFullYear() - 1, h.getMonth(), h.getDate())), ate = iso(h);
    var uf = s(orc.uf).toUpperCase();
    var rows = linhas.slice(0, 300).map(function (L) {
      var pu = Number(L.precoUnit) > 0 ? Number(L.precoUnit) : Number(L.custoUnitario);
      return '<tr data-pp-lin="' + esc(L.itemId) + '" data-pu="' + pu + '" data-un="' + esc(L.unidade) + '"><td>' + esc(L.numero) + '</td><td title="' + esc(L.descricao) + '">' + esc(s(L.descricao).slice(0, 55)) + "</td><td>" + esc(L.unidade) + '</td><td class="num">' + fmtN(pu) + '</td><td><input data-pp-q="' + esc(L.itemId) + '" value="' + esc(termoDoItem(L.descricao)) + '" style="width:200px"></td><td><button type="button" class="btn sm" data-pp-cmp="' + esc(L.itemId) + '">Comparar</button></td><td data-pp-res="' + esc(L.itemId) + '" style="font-size:12px"></td></tr>';
    }).join("");
    var corpo = '<p style="font-size:13px;margin-top:0">Compara o preço unitário do item com a <b>faixa praticada</b> em atas e contratos públicos (serviço do CertamePRO, último ano' + (uf ? ", UF " + esc(uf) : "") + "). <b>Uma consulta por clique</b>; só itens com a mesma unidade entram. Descarte de outliers: " + s(regra.baixo).replace(".", ",") + "× a " + s(regra.alto).replace(".", ",") + "× a mediana.</p>" +
      '<input id="pp-filtro" placeholder="filtrar itens…" style="width:100%;margin-bottom:6px">' +
      '<div style="overflow:auto;max-height:54vh"><table class="tbl" style="font-size:12px"><thead><tr><th>Nº</th><th>Item</th><th>Un.</th><th class="num">Preço unit.</th><th>Termo da busca</th><th></th><th>Resultado</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      (linhas.length > 300 ? '<p class="muted">Mostrando os 300 primeiros de ' + linhas.length + " itens — use o filtro do orçamento para os demais.</p>" : "");
    UI.modal("Comparar com preços públicos", corpo, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
    var raiz = el("modal-bg"); if (!raiz) return;
    var f = el("pp-filtro");
    if (f) f.addEventListener("input", function () {
      var k = s(f.value).toLowerCase(), trs = raiz.querySelectorAll("tr[data-pp-lin]"), i;
      for (i = 0; i < trs.length; i++) trs[i].style.display = !k || trs[i].textContent.toLowerCase().indexOf(k) >= 0 || s(trs[i].querySelector("input").value).toLowerCase().indexOf(k) >= 0 ? "" : "none";
    });
    raiz.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-pp-cmp]") : null; if (!b || b.disabled) return;
      var id = b.getAttribute("data-pp-cmp"), tr = b.closest("tr"), cel = tr.querySelector("[data-pp-res]"), q = s(tr.querySelector("[data-pp-q]").value).replace(/^\s+|\s+$/g, "");
      var pu = Number(tr.getAttribute("data-pu")), un = tr.getAttribute("data-un");
      b.disabled = true; cel.textContent = "Consultando…";
      PP.consultar({ q: q, uf: uf, desde: desde, ate: ate, limite: 50 }).then(function (r) {
        b.disabled = false;
        if (!r.ok) { cel.innerHTML = '<span style="color:#b45309">' + esc(r.motivo || r.erro) + "</span>"; return; }
        var mesma = PP.filtrar(r.itens, { unidade: un }), pesq = PP.montarPesquisa({ itens: mesma, params: { q: q, uf: uf, desde: desde, ate: ate }, url: r.url, consultadoEm: r.consultadoEm, invalidos: r.invalidos }, regra);
        var c = PP.comparar(pu, pesq);
        if (!c.ok) { cel.innerHTML = '<span style="color:#b45309">' + esc(c.erro) + (r.itens.length && !mesma.length ? " Havia " + r.itens.length + " preço(s), nenhum na unidade «" + esc(un) + "»." : "") + "</span>"; return; }
        var fontes = pesq.mantidos.slice(0, 5).map(function (i) { return esc(i.orgao) + " " + dataBR(i.data) + " R$ " + fmtN(i.valor) + " " + link(i.link); }).join("<br>");
        cel.innerHTML = '<span style="color:' + (c.alerta ? "#b91c1c" : "#166534") + '"><b>' + (c.alerta ? "⚠ " : "✔ ") + esc(c.texto) + "</b></span> <span class=\"muted\">(" + c.n + " preços" + (mesma.length < r.itens.length ? ", só unidade " + esc(un) : "") + ")</span>" +
          '<details><summary>fontes</summary>' + fontes + '<br><span class="muted">consulta em ' + dataBR(s(r.consultadoEm).slice(0, 10)) + "</span></details>";
      });
    });
  }

  global.PrecosPubUI = { html: html, pesquisa: function () { lerForm(); return pesquisaAtual(); }, abrirOrcamento: abrirOrcamento, _estado: function () { return E; }, _reset: function () { E = novoEstado(); } };
  if (typeof module !== "undefined" && module.exports) module.exports = global.PrecosPubUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

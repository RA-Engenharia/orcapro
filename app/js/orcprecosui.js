/* =====================================================================
 * orcprecosui.js — A TELA de "Revisões e preços" do editor de orçamento
 *
 * Fiação fina sobre quatro motores puros (a regra está neles, não aqui):
 *   js/cotpreco.js   → "Usar preço de cotação" no item (botão e selo da linha)
 *   js/orcrevisao.js → Salvar revisão (R00, R01…), lista e comparar duas
 *   js/orcbases.js   → Atualizar preços para outra base (prévia + um clique)
 *                      e Comparar bases lado a lado (somente leitura)
 * Entrada: o menu "Mais" do editor (data-acao="orcprec-hub") e o botão/selo do
 * item (data-acao="orcprec-cotar"). Todo `data-acao="orcprec-…"` chega aqui pelo
 * App (app.js). Nada aqui calcula preço.
 *
 * ⚠ Orçamento APROVADO não grava (App.persistir recusa): os botões que gravam
 *   somem e a tela diz o caminho (criar revisão do aprovado, no menu Mais).
 * ⚠ ATUALIZAR PREÇOS CRIA A REVISÃO ANTES. Se a revisão não puder ser guardada
 *   (limite de 10 ou de tamanho), NADA é atualizado: sem volta não há aplicar.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ST = { aba: "rev", exc: "", previa: null, cmpRev: null, cmpBases: null, bases: [], ofertas: [], item: null, escolha: "" };
  var CACHE = { em: 0, idx: null, todas: [] };

  function esc(s) { return (global.Util && Util.esc) ? Util.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function moeda(v) { return Util.fmtMoeda(v); }
  function pct(v) { return v == null ? "—" : (v > 0 ? "+" : "") + Util.fmtNum(v, 1) + "%"; }
  function dif(v) { return (v > 0.004 ? "+" : v < -0.004 ? "−" : "") + moeda(Math.abs(v)); }
  function pil(t, tom) { return (typeof Modulo !== "undefined" && Modulo.pilula) ? Modulo.pilula(t, tom) : "<span>" + esc(t) + "</span>"; }
  function el(id) { return document.getElementById(id); }
  function eid() { return Auth.empresaId(); }
  function quem() { try { return (Auth.usuario() || {}).email || ""; } catch (e) { return ""; } }
  function dia(iso) { var s = String(iso || ""); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : s; }
  function diaHora(iso) { var s = String(iso || ""); return /^\d{4}-\d{2}-\d{2}T/.test(s) ? dia(s) + " " + s.slice(11, 16) : dia(s); }
  function comp(c) { var s = String(c || ""); return /^\d{4}-\d{2}/.test(s) ? s.slice(5, 7) + "/" + s.slice(0, 4) : s; }

  /* ---------- ofertas (cotações e catálogo) com índice para a linha da planilha ---------- */
  function carregarOfertas() {
    var cots = [], cat = [];
    try { cots = Store.listar(eid(), "cotacoes") || []; } catch (e) {}
    try {
      var b = (Store.lerBasesExtras(eid()) || []).filter(function (x) { return String(x.fonte).toUpperCase() === "PROPRIA"; })[0];
      cat = (b && b.dados) || [];
    } catch (e2) {}
    return CotPreco.ofertas(cots, cat);
  }
  function ofertas() {
    var agora = Date.now();
    if (!CACHE.idx || agora - CACHE.em > 4000) {
      var todas = carregarOfertas(), idx = { cod: {}, desc: {} };
      function chave(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
      todas.forEach(function (o) {
        var c = String(o.codigo || "").trim().toLowerCase(), d = chave(o.descricao);
        if (c && c !== "—") (idx.cod[c] = idx.cod[c] || []).push(o);
        if (d) (idx.desc[d] = idx.desc[d] || []).push(o);
      });
      CACHE = { em: agora, idx: idx, todas: todas };
    }
    return CACHE;
  }
  function temOferta(it) {
    try {
      var c = ofertas(), k = String(it.codigo || "").trim().toLowerCase(), d = String(it.descricao || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      var l = (k && c.idx.cod[k] ? c.idx.cod[k] : []).concat(d && c.idx.desc[d] ? c.idx.desc[d] : []);
      return CotPreco.sugeridas(it, l).length > 0;
    } catch (e) { return false; }
  }

  var OrcPrecosUI = {
    /* peças para a linha da planilha (ui.js) */
    seloHtml: function (etapaId, it) {
      if (typeof CotPreco === "undefined" || !CotPreco.vigente(it)) return "";
      var c = it.cotacao;
      return '<button class="selo-ajuste novo" data-acao="orcprec-cotar" data-item="' + esc(etapaId + "|" + it.id) + '" title="' + esc("Preço de " + CotPreco.rotulo(c) + ". Clique para trocar ou voltar ao preço da base.") + '">Cotação</button>';
    },
    botaoHtml: function (etapaId, it) {
      if (typeof CotPreco === "undefined" || CotPreco.vigente(it) || !temOferta(it)) return "";
      return '<button class="btn sm" data-acao="orcprec-cotar" data-item="' + esc(etapaId + "|" + it.id) + '" title="Há preço de fornecedor (cotação ou catálogo) para este item. Escolha qual usar no lugar do preço da base.">Cotação</button>';
    },
    /* a seção do Relatórios: itens com preço de fornecedor */
    secaoRelatorio: function (orc) {
      if (typeof CotPreco === "undefined") return "";
      var r = CotPreco.resumo(orc);
      if (!r.n) return "";
      var h = '<table class="tbl"><thead><tr><th>Código</th><th>Descrição</th><th>Un</th><th class="num">Qtd</th><th class="num">Preço da base</th><th class="num">Preço cotado</th><th class="num">Efeito</th><th>Fornecedor e origem</th></tr></thead><tbody>';
      r.linhas.forEach(function (l) {
        h += "<tr><td>" + esc(l.codigo) + "</td><td>" + esc(l.descricao.slice(0, 60)) + "</td><td>" + esc(Util.unidadeExibir ? Util.unidadeExibir(l.unidade) : l.unidade) + '</td><td class="num">' + Util.fmtNum(l.quantidade, 2) +
          '</td><td class="num">' + moeda(l.antes) + '</td><td class="num"><b>' + moeda(l.preco) + '</b></td><td class="num">' + dif(l.impacto) + "</td><td>" + esc(l.rotulo) + "</td></tr>";
      });
      h += "</tbody></table>";
      return Modulo.secao({ titulo: "Preços de fornecedor", sub: r.n + " item(ns) com preço de cotação ou catálogo no lugar da base. Efeito total sobre o custo: " + dif(r.impacto) + ".", corpoHtml: h });
    },

    acao: function (app, acao, t) {
      var d = (t && t.dataset) || {};
      switch (acao) {
        case "orcprec-hub": ST.aba = "rev"; ST.previa = null; ST.cmpRev = null; ST.cmpBases = null; ST.exc = ""; this.hub(app); break;
        case "orcprec-aba": ST.aba = d.aba || "rev"; ST.previa = null; ST.cmpRev = null; ST.cmpBases = null; ST.exc = ""; this.hub(app); break;
        case "orcprec-rev-salvar": this.revSalvar(app); break;
        case "orcprec-rev-excluir": ST.exc = d.id || ""; this.hub(app); break;
        case "orcprec-rev-excluir-sim": this.revExcluir(app, d.id); break;
        case "orcprec-rev-cancelar": ST.exc = ""; this.hub(app); break;
        case "orcprec-rev-comparar": this.revComparar(app, d.id); break;
        case "orcprec-atu-previa": this.atuPrevia(app); break;
        case "orcprec-atu-aplicar": this.atuAplicar(app); break;
        case "orcprec-cmp-bases": this.cmpBases(app); break;
        case "orcprec-cotar": this.cotar(app, String(d.item || "")); break;
        case "orcprec-cot-usar": this.cotUsar(app, parseInt(d.ix, 10)); break;
        case "orcprec-cot-voltar": this.cotVoltar(app); break;
      }
    },

    /* ============ HUB: revisões · atualizar preços · comparar bases ============ */
    _aprovado: function (orc) { return !!(Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc)); },
    _bases: function () {
      var l = [];
      try { l = Bases.lista().filter(function (b) { return b.ativa !== false && b.total > 0; }); } catch (e) {}
      return l.map(function (b) {
        var reg = b.fonte === "SINAPI_DES" ? "desonerada" : (b.fonte === "SINAPI" ? "não desonerada" : (b.desonerado === true ? "desonerada" : (b.desonerado === false ? "não desonerada" : "")));
        return { fonte: b.fonte, label: b.label || b.fonte, competencia: b.competencia || "", uf: b.uf || "", regime: reg, total: b.total,
          texto: (b.label || b.fonte) + (b.competencia ? " " + comp(b.competencia) : "") + (b.uf ? "/" + b.uf : "") + (reg ? ", " + reg : "") };
      });
    },
    _resolver: function (fonte, codigo) {
      if (String(fonte).toUpperCase() === "SINAPI") return (typeof Sinapi !== "undefined" && Sinapi.obter) ? Sinapi.obter(codigo) : null;
      return Bases.obter(fonte, codigo);
    },
    hub: function (app) {
      var orc = app.orcAtual; if (!orc) return;
      var self = this, aprov = this._aprovado(orc);
      var abas = [["rev", "Revisões"], ["atu", "Atualizar preços"], ["cmp", "Comparar bases"]];
      var h = '<div class="tabs" role="tablist" style="margin-bottom:12px;flex-wrap:wrap;overflow:visible">' + abas.map(function (a) {
        return '<button type="button" class="tab' + (ST.aba === a[0] ? " ativo active" : "") + '" role="tab" aria-selected="' + (ST.aba === a[0]) + '" data-acao="orcprec-aba" data-aba="' + a[0] + '">' + a[1] + "</button>";
      }).join("") + "</div>";
      if (ST.aba === "rev") h += this._htmlRev(orc, aprov);
      else if (ST.aba === "atu") h += this._htmlAtu(orc, aprov);
      else h += this._htmlCmp(orc);
      /* ⚠ A pílula "alerta" do kit mede 4,46:1 no tema claro (--amarelo sobre o fundo tintado): aqui, onde ela diz "sem correspondência", ela escurece só neste modal */
      h = '<style>.orcprec .mod-pil-alerta{color:#8f5200}[data-tema="dark"] .orcprec .mod-pil-alerta{color:var(--amarelo)}' +
        '@media (max-width:640px){.orcprec .orcprec-cartoes thead{display:none}.orcprec .orcprec-cartoes tr{display:block;padding:8px 0;border-bottom:1px solid var(--linha)}.orcprec .orcprec-cartoes td{display:block;padding:2px 0;text-align:left;border:0}.orcprec .orcprec-cartoes td[data-r]::before{content:attr(data-r) ": ";color:var(--texto-fraco)}.orcprec .orcprec-cartoes td.right{padding-top:6px}}</style><div class="orcprec">' + h + "</div>";
      UI.modal("Revisões e preços", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      UI.modalConsulta();
    },

    /* ---------- Revisões ---------- */
    _htmlRev: function (orc, aprov) {
      var lista = OrcRevisao.lista(orc), h = "";
      if (aprov) h += '<p class="muted" style="margin-top:0">Orçamento aprovado: o retrato não é guardado aqui (o aprovado não grava). Para mexer nele, use <b>Criar revisão</b> do aprovado.</p>';
      else h += '<div class="flex" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px"><div class="field" style="flex:1;min-width:220px;margin:0"><label for="orcprec-motivo">Motivo da revisão</label>' +
        '<input id="orcprec-motivo" maxlength="300" placeholder="Ex.: versão enviada ao cliente"></div>' +
        '<button class="btn primary" data-acao="orcprec-rev-salvar">Salvar revisão ' + ("R" + (function () { var n = 0; lista.forEach(function (r) { if (r.n >= n) n = r.n + 1; }); return n < 10 ? "0" + n : n; })()) + "</button></div>";
      if (!lista.length) return h + '<p class="muted">Nenhuma revisão guardada. A primeira (R00) congela o orçamento como está agora: itens, quantidades, preços e total.</p>';
      h += '<table class="tbl orcprec-cartoes"><thead><tr><th>Revisão</th><th>Data</th><th>Motivo</th><th class="num">Itens</th><th class="num">Total</th><th></th></tr></thead><tbody>';
      lista.slice().reverse().forEach(function (r) {
        var conf = ST.exc === r.id;
        h += '<tr><td><b>' + esc(r.rotulo) + "</b>" + (r.auto ? " " + pil("automática", "neutro") : "") + '</td><td data-r="Data">' + esc(diaHora(r.em)) + '</td><td data-r="Motivo">' + esc(r.motivo || "—") + '</td><td class="num" data-r="Itens">' + r.nItens + '</td><td class="num" data-r="Total">' + moeda(r.total) + '</td><td class="right">' +
          '<button class="btn sm" data-acao="orcprec-rev-comparar" data-id="' + esc(r.id) + '" title="Compara esta revisão com o orçamento como está agora">Comparar com o atual</button> ' +
          (conf ? '<button class="btn sm danger" data-acao="orcprec-rev-excluir-sim" data-id="' + esc(r.id) + '">Confirmar exclusão</button> <button class="btn sm ghost" data-acao="orcprec-rev-cancelar">Manter</button>'
                : '<button class="btn sm ghost" data-acao="orcprec-rev-excluir" data-id="' + esc(r.id) + '" title="Exclui só este retrato; o orçamento não muda">Excluir</button>') + "</td></tr>";
      });
      h += "</tbody></table>";
      /* comparar duas */
      /* padrão: a revisão mais recente (De) contra o orçamento como está (Para) */
      var rev = lista.slice().reverse().map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.rotulo + " de " + dia(r.em)) + "</option>"; }).join("");
      var opts = '<option value="__atual">Atual (como está agora)</option>' + rev, optsDe = rev + '<option value="__atual">Atual (como está agora)</option>';
      h += '<div class="flex" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin:14px 0 6px"><div class="field" style="margin:0"><label for="orcprec-ra">De</label><select id="orcprec-ra">' + optsDe + '</select></div>' +
        '<div class="field" style="margin:0"><label for="orcprec-rb">Para</label><select id="orcprec-rb">' + opts + '</select></div>' +
        '<button class="btn" data-acao="orcprec-rev-comparar" data-id="__duas">Comparar as duas</button></div>';
      if (ST.cmpRev) h += this._htmlCmpRev(ST.cmpRev);
      h += '<p class="muted" style="font-size:var(--t-micro)">Guardado dentro do orçamento, de forma enxuta (' + Math.round(OrcRevisao.bytes(orc) / 1000) + " KB de " + Math.round(OrcRevisao.MAX_BYTES / 1000) + " KB; até " + OrcRevisao.MAX + " revisões). É um retrato para conferir, não um backup para restaurar.</p>";
      return h;
    },
    _htmlCmpRev: function (c) {
      var r = c.r, h = '<div style="margin-top:12px;border-top:1px solid var(--linha);padding-top:12px"><h3 style="margin:0 0 8px;font-size:var(--t-corpo)">' + esc(c.nomeA) + " para " + esc(c.nomeB) + "</h3>" +
        '<div class="flex" style="gap:18px;flex-wrap:wrap;margin-bottom:10px"><div><div class="muted" style="font-size:var(--t-micro)">' + esc(c.nomeA) + '</div><b style="font-variant-numeric:tabular-nums">' + moeda(r.totalA) + "</b></div>" +
        '<div><div class="muted" style="font-size:var(--t-micro)">' + esc(c.nomeB) + '</div><b style="font-variant-numeric:tabular-nums">' + moeda(r.totalB) + "</b></div>" +
        '<div><div class="muted" style="font-size:var(--t-micro)">Diferença</div><b style="font-variant-numeric:tabular-nums">' + dif(r.dif) + (r.pct != null ? " (" + pct(r.pct) + ")" : "") + "</b></div></div>";
      if (!r.incluidos.length && !r.excluidos.length && !r.alterados.length) return h + '<p class="muted">Nenhuma diferença: os dois estão iguais.</p></div>';
      function tab(tit, linhas, cols, fn) {
        if (!linhas.length) return "";
        var t = '<h4 style="margin:12px 0 4px;font-size:var(--t-corpo)">' + tit + " (" + linhas.length + ')</h4><div style="overflow-x:auto"><table class="tbl"><thead><tr>' + cols + "</tr></thead><tbody>";
        linhas.slice(0, 40).forEach(function (l) { t += fn(l); });
        if (linhas.length > 40) t += '<tr><td colspan="6" class="muted">… e mais ' + (linhas.length - 40) + " (mostrando os 40 de maior valor)</td></tr>";
        return t + "</tbody></table></div>";
      }
      h += tab("Alterados, " + dif(r.difAlterados), r.alterados, '<th>Item</th><th>O que mudou</th><th class="num">Quantidade</th><th class="num">Custo unitário</th><th class="num">Efeito no preço</th>', function (l) {
        return "<tr><td>" + esc(l.item.codigo) + " " + esc(l.item.descricao.slice(0, 50)) + "</td><td>" + esc(l.campos.join(", ")) + '</td><td class="num">' + Util.fmtNum(l.antes.quantidade, 2) + " para " + Util.fmtNum(l.item.quantidade, 2) + '</td><td class="num">' + moeda(l.antes.custoUnitario) + " para " + moeda(l.item.custoUnitario) + '</td><td class="num">' + dif(l.dif) + "</td></tr>";
      });
      h += tab("Incluídos, " + dif(r.difIncluidos), r.incluidos, '<th>Item</th><th>Etapa</th><th class="num">Qtd</th><th class="num">Preço</th>', function (l) {
        return "<tr><td>" + esc(l.codigo) + " " + esc(l.descricao.slice(0, 50)) + "</td><td>" + esc(l.etapa) + '</td><td class="num">' + Util.fmtNum(l.quantidade, 2) + '</td><td class="num">' + moeda(l.preco) + "</td></tr>";
      });
      h += tab("Excluídos, " + dif(r.difExcluidos), r.excluidos, '<th>Item</th><th>Etapa</th><th class="num">Qtd</th><th class="num">Preço</th>', function (l) {
        return "<tr><td>" + esc(l.codigo) + " " + esc(l.descricao.slice(0, 50)) + "</td><td>" + esc(l.etapa) + '</td><td class="num">' + Util.fmtNum(l.quantidade, 2) + '</td><td class="num">' + moeda(l.preco) + "</td></tr>";
      });
      return h + "</div>";
    },
    revSalvar: function (app, motivoFixo, ctxExtra) {
      var orc = app.orcAtual; if (!orc) return { ok: false };
      var inp = el("orcprec-motivo"), motivo = motivoFixo != null ? motivoFixo : (inp ? inp.value : "");
      var r = OrcRevisao.salvar(orc, motivo, { agoraISO: Util.agoraISO(), por: quem(), auto: !!(ctxExtra && ctxExtra.auto) });
      if (!r.ok) { UI.toast(r.motivo, "erro", 9000); return r; }
      var g = app.persistir();
      if (!app._gravou(g)) { OrcRevisao.excluir(orc, r.rev.id); return { ok: false, motivo: "não gravou" }; }
      if (motivoFixo == null) { this.hub(app); UI.toast("Revisão " + r.rev.rotulo + " guardada.", "ok"); }
      return r;
    },
    revExcluir: function (app, id) {
      var orc = app.orcAtual; if (!orc) return;
      OrcRevisao.excluir(orc, id); ST.exc = ""; ST.cmpRev = null;
      var g = app.persistir(); this.hub(app);
      if (app._gravou(g)) UI.toast("Revisão excluída.", "ok");
    },
    revComparar: function (app, id) {
      var orc = app.orcAtual; if (!orc) return;
      var atual = OrcRevisao.instantaneo(orc), a, b, nomeA, nomeB;
      function pega(v) { if (v === "__atual") return { s: atual, n: "Atual" }; var r = OrcRevisao.obter(orc, v); return r ? { s: r, n: r.rotulo + " de " + dia(r.em) } : null; }
      var x, y;
      if (id === "__duas") { x = pega((el("orcprec-ra") || {}).value); y = pega((el("orcprec-rb") || {}).value); }
      else { x = pega(id); y = pega("__atual"); }
      if (!x || !y) { UI.toast("Escolha as duas revisões.", "erro"); return; }
      a = x.s; b = y.s; nomeA = x.n; nomeB = y.n;
      ST.cmpRev = { r: OrcRevisao.comparar(a, b), nomeA: nomeA, nomeB: nomeB };
      this.hub(app);
    },

    /* ---------- Atualizar preços ---------- */
    _optsBases: function (sel) {
      ST.bases = this._bases();
      return ST.bases.map(function (b, i) { return '<option value="' + i + '"' + (sel === i ? " selected" : "") + ">" + esc(b.texto) + "</option>"; }).join("");
    },
    _htmlAtu: function (orc, aprov) {
      var bs = this._bases();
      if (!bs.length) return '<p class="muted">Nenhuma base de preços instalada. Instale uma em Bases e Composições.</p>';
      var h = '<p style="margin-top:0">Escolha a base já instalada para onde levar os preços. Cada item é conferido pelo <b>código</b>, na <b>mesma base</b> em que foi lançado; o que a base nova não tem fica como está, marcado. Nada é estimado.</p>';
      h += '<div class="flex" style="gap:8px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="margin:0;min-width:260px"><label for="orcprec-alvo">Base e competência</label><select id="orcprec-alvo">' + this._optsBases(ST.previa ? ST.previa.ix : -1) + "</select></div>" +
        '<button class="btn" data-acao="orcprec-atu-previa">Ver a prévia</button></div>';
      h += '<p class="muted" style="font-size:var(--t-micro);margin:6px 0 0">Só há uma competência de cada base instalada por vez. Para outra competência da SINAPI, instale-a antes em Bases e Composições.</p>';
      if (ST.previa) h += this._htmlPrevia(ST.previa.p, aprov);
      return h;
    },
    _htmlPrevia: function (p, aprov) {
      var c = p.contagem, h = '<div style="margin-top:14px;border-top:1px solid var(--linha);padding-top:12px">';
      h += '<div class="flex" style="gap:18px;flex-wrap:wrap;margin-bottom:8px">' +
        '<div><div class="muted" style="font-size:var(--t-micro)">Total antes</div><b style="font-variant-numeric:tabular-nums">' + moeda(p.antes.total) + "</b></div>" +
        '<div><div class="muted" style="font-size:var(--t-micro)">Total depois</div><b style="font-variant-numeric:tabular-nums">' + moeda(p.depois.total) + "</b></div>" +
        '<div><div class="muted" style="font-size:var(--t-micro)">Diferença</div><b style="font-variant-numeric:tabular-nums">' + dif(p.dif) + (p.pct != null ? " (" + pct(p.pct) + ")" : "") + "</b></div></div>";
      h += '<p style="margin:0 0 8px">Mudam de preço: <b>' + c.atualizar + "</b>. Já estão iguais: " + c.igual + ". Sem correspondência na base: <b>" + c.sem_correspondencia + "</b>. Mantidos (cotação, preço seu, outra base ou item próprio): " + c.mantidos + ".</p>";
      var ordem = p.linhas.slice().sort(function (a, b) {
        var pa = a.estado === "atualizar" ? 0 : a.estado === "sem_correspondencia" ? 1 : 2, pb = b.estado === "atualizar" ? 0 : b.estado === "sem_correspondencia" ? 1 : 2;
        return pa - pb || Math.abs(b.dif) - Math.abs(a.dif);
      }).filter(function (l) { return l.estado !== "igual"; });
      var tom = { atualizar: "neutro", sem_correspondencia: "alerta" };
      h += '<div style="max-height:320px;overflow:auto;border:1px solid var(--linha);border-radius:var(--raio-lg,8px)"><table class="tbl"><thead><tr><th>Item</th><th>Un</th><th class="num">Qtd</th><th class="num">Antes</th><th class="num">Depois</th><th class="num">Variação</th><th>Situação</th></tr></thead><tbody>';
      ordem.slice(0, 300).forEach(function (l) {
        h += "<tr><td>" + esc(l.codigo) + " " + esc(l.descricao.slice(0, 48)) + "</td><td>" + esc(l.unidade) + '</td><td class="num">' + Util.fmtNum(l.quantidade, 2) + '</td><td class="num">' + moeda(l.antes) + '</td><td class="num">' + (l.estado === "atualizar" ? "<b>" + moeda(l.depois) + "</b>" : "—") +
          '</td><td class="num">' + (l.estado === "atualizar" ? pct(l.pct) : "—") + "</td><td>" + pil(l.motivo, tom[l.estado] || "neutro") + "</td></tr>";
      });
      if (ordem.length > 300) h += '<tr><td colspan="7" class="muted">… e mais ' + (ordem.length - 300) + " linhas.</td></tr>";
      if (!ordem.length) h += '<tr><td colspan="7" class="muted">Todos os itens já estão com o preço desta base.</td></tr>';
      h += "</tbody></table></div>";
      if (aprov) h += '<p class="muted" style="margin-top:10px">Orçamento aprovado não muda de preço. Crie a revisão do aprovado e atualize nela.</p>';
      else if (c.atualizar) h += '<div style="margin-top:12px"><button class="btn primary" data-acao="orcprec-atu-aplicar">Atualizar ' + c.atualizar + ' preço(s)</button> <span class="muted" style="font-size:var(--t-micro)">Antes de atualizar, o sistema guarda uma revisão automática do orçamento como está.</span></div>';
      return h + "</div>";
    },
    _alvoSel: function () {
      var s = el("orcprec-alvo"), ix = s ? parseInt(s.value, 10) : -1;
      ST.bases = this._bases();
      return ST.bases[ix] ? { ix: ix, b: ST.bases[ix] } : null;
    },
    atuPrevia: function (app) {
      var orc = app.orcAtual, a = this._alvoSel(); if (!orc || !a) { UI.toast("Escolha a base.", "erro"); return; }
      ST.previa = { ix: a.ix, alvo: { fonte: a.b.fonte, competencia: a.b.competencia, uf: a.b.uf, label: a.b.texto }, p: OrcBases.prever(orc, { fonte: a.b.fonte, competencia: a.b.competencia, uf: a.b.uf, label: a.b.texto }, this._resolver) };
      this.hub(app);
    },
    atuAplicar: function (app) {
      var orc = app.orcAtual; if (!orc || !ST.previa) return;
      var alvo = ST.previa.alvo, self = this;
      if (this._aprovado(orc)) { UI.toast("Orçamento aprovado não muda de preço. Crie a revisão do aprovado.", "erro"); return; }
      /* a revisão de segurança PRIMEIRO: sem ela, nada é atualizado */
      var rv = this.revSalvar(app, "Antes de atualizar os preços para " + alvo.label, { auto: true });
      if (!rv || !rv.ok) { UI.toast("Nada foi atualizado: a revisão de segurança não pôde ser guardada.", "erro", 9000); return; }
      var r = OrcBases.aplicar(orc, alvo, this._resolver);
      if (!r.ok) { UI.toast(r.motivo, "erro"); return; }
      var g = app.persistir();
      if (!app._gravou(g)) return;
      ST.previa = null; ST.aba = "rev"; UI.fecharModal(); app.render();
      UI.toast(r.n + " preço(s) atualizado(s) para " + alvo.label + ". Revisão " + rv.rev.rotulo + " guardada antes; compare por Mais, Revisões e preços.", "ok", 9000);
    },

    /* ---------- Comparar bases (só leitura) ---------- */
    _htmlCmp: function (orc) {
      var bs = this._bases();
      if (bs.length < 2) return '<p class="muted">Para comparar, instale ao menos duas bases (por exemplo SINAPI e SINAPI desonerada) em Bases e Composições.</p>';
      var sa = ST.cmpBases ? ST.cmpBases.ia : 0, sb = ST.cmpBases ? ST.cmpBases.ib : 1;
      var h = '<p style="margin-top:0">O orçamento recalculado em cada base, item a item. Somente leitura: nada no orçamento muda.</p>' +
        '<div class="flex" style="gap:8px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="margin:0;min-width:230px"><label for="orcprec-ba">Base A</label><select id="orcprec-ba">' + this._optsBases(sa) + "</select></div>" +
        '<div class="field" style="margin:0;min-width:230px"><label for="orcprec-bb">Base B</label><select id="orcprec-bb">' + this._optsBases(sb) + "</select></div>" +
        '<button class="btn" data-acao="orcprec-cmp-bases">Comparar</button></div>';
      if (ST.cmpBases && ST.cmpBases.r) h += this._htmlCmpBases(ST.cmpBases.r);
      return h;
    },
    cmpBases: function (app) {
      var orc = app.orcAtual; if (!orc) return;
      var ia = parseInt((el("orcprec-ba") || {}).value, 10), ib = parseInt((el("orcprec-bb") || {}).value, 10);
      ST.bases = this._bases();
      var a = ST.bases[ia], b = ST.bases[ib];
      if (!a || !b) { UI.toast("Escolha as duas bases.", "erro"); return; }
      if (ia === ib) { UI.toast("Escolha duas bases diferentes.", "erro"); return; }
      ST.cmpBases = { ia: ia, ib: ib, r: OrcBases.comparar(orc, { fonte: a.fonte, label: a.texto }, { fonte: b.fonte, label: b.texto }, this._resolver) };
      this.hub(app);
    },
    _htmlCmpBases: function (r) {
      var h = '<div style="margin-top:14px;border-top:1px solid var(--linha);padding-top:12px"><div class="flex" style="gap:18px;flex-wrap:wrap;margin-bottom:8px">' +
        '<div><div class="muted" style="font-size:var(--t-micro)">' + esc(r.a.label) + '</div><b style="font-variant-numeric:tabular-nums">' + moeda(r.totalA) + '</b><div class="muted" style="font-size:var(--t-micro)">custo direto; com BDI ' + moeda(r.comBdiA) + "</div></div>" +
        '<div><div class="muted" style="font-size:var(--t-micro)">' + esc(r.b.label) + '</div><b style="font-variant-numeric:tabular-nums">' + moeda(r.totalB) + '</b><div class="muted" style="font-size:var(--t-micro)">custo direto; com BDI ' + moeda(r.comBdiB) + "</div></div>" +
        '<div><div class="muted" style="font-size:var(--t-micro)">Diferença nos ' + r.nComum + ' itens das duas bases</div><b style="font-variant-numeric:tabular-nums">' + dif(r.difComum) + '</b><div class="muted" style="font-size:var(--t-micro)">com BDI ' + dif(r.difComumComBdi) + "</div></div></div>";
      h += '<p style="margin:0 0 8px">A base A tem preço para ' + r.coberturaA + " item(ns) e não tem para " + r.semA + "; a base B tem para " + r.coberturaB + " e não tem para " + r.semB + ". O total de cada lado soma só o que a base cobre; a diferença só conta os itens que as duas cobrem. Item sem código ou próprio não entra.</p>";
      var ordem = r.linhas.slice().sort(function (x, y) { return Math.abs(y.difTotal || 0) - Math.abs(x.difTotal || 0); });
      h += '<div style="max-height:320px;overflow:auto;border:1px solid var(--linha);border-radius:var(--raio-lg,8px)"><table class="tbl"><thead><tr><th>Item</th><th>Un</th><th class="num">Qtd</th><th class="num">' + esc(r.a.label) + '</th><th class="num">' + esc(r.b.label) + '</th><th class="num">Variação</th><th class="num">Efeito no custo</th></tr></thead><tbody>';
      ordem.slice(0, 300).forEach(function (l) {
        h += "<tr><td>" + esc(l.codigo) + " " + esc(l.descricao.slice(0, 48)) + "</td><td>" + esc(l.unidade) + '</td><td class="num">' + Util.fmtNum(l.quantidade, 2) + '</td><td class="num">' + (l.a != null ? moeda(l.a) : pil("sem preço", "alerta")) + '</td><td class="num">' + (l.b != null ? moeda(l.b) : pil("sem preço", "alerta")) +
          '</td><td class="num">' + (l.pct != null ? pct(l.pct) : "—") + '</td><td class="num">' + (l.difTotal != null ? dif(l.difTotal) : "—") + "</td></tr>";
      });
      if (ordem.length > 300) h += '<tr><td colspan="7" class="muted">… e mais ' + (ordem.length - 300) + " linhas.</td></tr>";
      return h + "</tbody></table></div></div>";
    },

    /* ============ COTAÇÃO NO ITEM ============ */
    _achar: function (orc, ref) {
      var p = String(ref || "").split("|"), e = (orc.etapas || []).filter(function (x) { return x.id === p[0]; })[0];
      var it = e && (e.itens || []).filter(function (x) { return x.id === p[1]; })[0];
      return it ? { e: e, it: it } : null;
    },
    cotar: function (app, ref) {
      var orc = app.orcAtual; if (!orc) return;
      var a = this._achar(orc, ref); if (!a) return;
      if (this._aprovado(orc)) { UI.toast("Orçamento aprovado não muda o preço. Crie uma revisão.", "erro"); return; }
      CACHE.em = 0;                       /* cotação nova entrou há pouco? o índice se refaz */
      var todas = ofertas().todas, sug = CotPreco.sugeridas(a.it, todas);
      var resto = todas.filter(function (o) { return sug.indexOf(o) < 0; });
      ST.item = { e: a.e.id, i: a.it.id }; ST.ofertas = sug.concat(resto);
      var it = a.it, atual = Util.num(it.custoUnitario);
      var h = '<p style="margin-top:0"><b>' + esc(it.codigo) + "</b> " + esc(it.descricao) + ' <span class="muted">(' + esc(it.unidade) + ")</span><br>Preço atual: <b>" + moeda(atual) + "</b>" +
        (CotPreco.vigente(it) ? ", de " + esc(CotPreco.rotulo(it.cotacao)) + ". Preço da base antes: " + moeda(it.cotacao.antes) + "." : ".") + "</p>";
      if (CotPreco.vigente(it)) h += '<p><button class="btn" data-acao="orcprec-cot-voltar">Voltar ao preço da base</button></p>';
      if (!ST.ofertas.length) h += '<p class="muted">Não há cotação nem catálogo com preço para este item. Cotações ficam em Compras, Cotações; catálogos, em Fornecedores.</p>';
      else {
        h += '<div class="field" style="margin:0 0 8px"><label for="orcprec-busca">Filtrar ofertas</label><input id="orcprec-busca" placeholder="Fornecedor ou descrição"></div>';
        h += '<div style="max-height:340px;overflow:auto;border:1px solid var(--linha);border-radius:var(--raio-lg,8px)"><table class="tbl"><thead><tr><th>Fornecedor</th><th>Origem</th><th>Data</th><th>Descrição</th><th class="num">Preço</th><th class="num">Contra o atual</th><th></th></tr></thead><tbody>';
        ST.ofertas.slice(0, 80).forEach(function (o, ix) {
          var ehSug = sug.indexOf(o) >= 0, c = CotPreco.casa(it, o);
          var difp = atual > 0 ? ((o.preco - atual) / atual) * 100 : null;
          h += '<tr data-busca="' + esc((o.fornecedor + " " + o.descricao + " " + o.numero).toLowerCase()) + '"' + (ehSug ? "" : ' data-outro="1" style="display:none"') + "><td>" + esc(o.fornecedor) + (ehSug && ix === 0 ? " " + pil("menor preço", "ok") : "") + "</td><td>" + (o.origem === "cotacao" ? esc("Cotação " + o.numero) : "Catálogo") + "</td><td>" + esc(dia(o.data)) + "</td><td>" + esc(o.descricao.slice(0, 44)) +
            '</td><td class="num"><b>' + moeda(o.preco) + '</b> <span class="muted">/' + esc(o.unidade) + '</span></td><td class="num">' + pct(difp) + "</td><td>" +
            (c.mesmaUnidade ? '<button class="btn sm' + (ehSug ? " primary" : "") + '" data-acao="orcprec-cot-usar" data-ix="' + ix + '">Usar</button>' + (ehSug ? "" : " " + pil("outro item, confira", "alerta")) : pil("unidade diferente", "alerta")) + "</td></tr>";
        });
        h += "</tbody></table></div>";
        h += '<p class="muted" style="font-size:var(--t-micro)">Aparecem as ofertas que casam com o item (mesmo código ou descrição, na mesma unidade); para usar o preço de outro item, digite no filtro. O preço entra como alteração sua: o selo do item mostra o preço da base e dá o caminho de volta. Frete e condição de pagamento não entram.</p>';
      }
      UI.modal("Usar preço de cotação", h, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      UI.modalConsulta();
      var b = el("orcprec-busca");
      if (b) b.oninput = function () {
        var q = String(b.value || "").toLowerCase().replace(/^\s+|\s+$/g, "");
        var linhas = document.querySelectorAll("#modal-bg tr[data-busca]");
        for (var i = 0; i < linhas.length; i++) {
          var outro = linhas[i].getAttribute("data-outro") === "1";
          /* as que não casam com o item só aparecem quando a pessoa digita */
          linhas[i].style.display = ((outro ? q.length >= 2 : true) && (!q || linhas[i].getAttribute("data-busca").indexOf(q) >= 0)) ? "" : "none";
        }
      };
    },
    cotUsar: function (app, ix) {
      var orc = app.orcAtual, of = ST.ofertas[ix]; if (!orc || !of || !ST.item) return;
      var r = CotPreco.aplicar(orc, ST.item.e, ST.item.i, of, { agoraISO: Util.agoraISO(), por: quem() });
      if (!r.ok) { UI.toast(r.motivo, "erro", 8000); return; }
      var g = app.persistir(); UI.fecharModal(); app.render();
      if (app._gravou(g)) UI.toast("Preço de " + CotPreco.rotulo(of) + " aplicado: " + moeda(r.preco) + " (antes " + moeda(r.antes) + ").", "ok", 7000);
    },
    cotVoltar: function (app) {
      var orc = app.orcAtual; if (!orc || !ST.item) return;
      var r = CotPreco.voltar(orc, ST.item.e, ST.item.i);
      if (!r.ok) { UI.toast(r.motivo, "erro"); return; }
      var g = app.persistir(); UI.fecharModal(); app.render();
      if (app._gravou(g)) UI.toast("Voltou ao preço da base: " + moeda(r.preco) + ".", "ok");
    }
  };

  global.OrcPrecosUI = OrcPrecosUI;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcPrecosUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

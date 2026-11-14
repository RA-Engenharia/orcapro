/* =====================================================================
 * mor/relatorio.js — «COMO ESTE ORÇAMENTO FOI MONTADO» (F7 do MOR, ESPEC §7)
 *
 * Lê o orçamento (orc.mor + item.mor) e devolve a prestação de contas do motor:
 *   premissas · perguntas respondidas · itens por origem · pendências (e o que NÃO foi entendido no documento) ·
 *   alertas de faixa de custo/m². Só LÊ: nenhuma conta, nenhum preço.
 *   montar(orc, opts)  opts: { catalogo, memoria, perfil }  (perfil = { orcId, tipologia, area, etapas:{id:custo} } do orçamento)
 *   html(rel, opts)    documento imprimível (A4), com a marca da empresa quando `opts.empresa` vem; é o que vira PDF
 *                      pelo MESMO caminho de impressão dos outros relatórios do app.
 * Puro, ES5, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  var P = global.MorPorque || (typeof require === "function" ? require("./porque.js") : null);
  var Mem = function () { return global.MorMemoria || (typeof require === "function" ? (function () { try { return require("./memoria.js"); } catch (e) { return null; } })() : null); };

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function f2(x) { return String(Math.round((Number(x) || 0) * 100) / 100).replace(".", ","); }

  function montar(orc, opts) {
    opts = opts || {};
    var C = opts.catalogo || global.MorCatalogo, mor = (orc && orc.mor) || {}, R = {
      orcamento: { nome: (orc && orc.nome) || "", numero: (orc && orc.numero) || "" },
      tipologia: mor.tipologia || "", obra: mor.params || {},
      perguntas: [], premissas: [], itensPorOrigem: {}, totalItens: 0, conferir: 0, conferidos: 0,
      pendencias: [], naoEntendidas: [], conflitos: [], alertasFaixa: [], documento: mor.documento ? { origem: mor.documento.origem, em: mor.documento.em } : null
    };
    var tp = C && mor.tipologia ? C.tipologia(mor.tipologia) : null;
    if (tp) R.tipologiaRotulo = tp.rotulo;
    /* perguntas respondidas */
    Object.keys(mor.respostas || {}).forEach(function (id) {
      var q = C && C.pergunta ? C.pergunta(id) : null, v = mor.respostas[id];
      R.perguntas.push({ id: id, txt: q ? q.txt : id, valor: (q && q.rotulos && q.rotulos[v]) || (typeof v === "boolean" ? (v ? "sim" : "não") : v) });
    });
    /* itens por origem, premissas, pendências */
    var vistas = {};
    arr(orc && orc.etapas).forEach(function (e) {
      arr(e.itens).forEach(function (it) {
        if (!it.mor) return;
        R.totalItens++;
        var o = P.origemDe(it.mor), g = R.itensPorOrigem[o] = R.itensPorOrigem[o] || { rotulo: P.ROTULOS[o], n: 0, itens: [] };
        g.n++; g.itens.push({ etapa: e.nome, descricao: it.descricao, quantidade: it.quantidade, unidade: it.unidade, regra: it.mor.regra, conferido: it.mor.conferido === true });
        if (P.precisaConferir(it)) R.conferir++; else if (it.mor.conferido === true) R.conferidos++;
        arr(it.mor.premissas).forEach(function (p) { if (!vistas[p]) { vistas[p] = 1; R.premissas.push(p); } });
        if (it.mor.confianca === "pendente" || !(Number(it.custoUnitario) > 0) || it.qtdPendente) {
          R.pendencias.push({ etapa: e.nome, descricao: it.descricao, motivo: !(Number(it.custoUnitario) > 0) ? "sem preço na base" : (it.qtdPendente ? "quantidade do projeto" : (it.mor.motivo || "confiança pendente")) });
        }
      });
    });
    if (mor.documento) {
      arr(mor.documento.pendentes).forEach(function (p) { R.pendencias.push({ etapa: p.etapa || "", descricao: p.bruto, motivo: "do documento, sem código: " + (p.motivo || "") + (arr(p.sugestoes).length ? " (sugestões: " + p.sugestoes.join(", ") + ")" : "") }); });
      R.naoEntendidas = arr(mor.documento.naoEntendidas).map(function (n) { return n.bruto; });
      R.conflitos = arr(mor.documento.conflitos).map(function (c) { return c.motivo; });
    }
    /* faixa de custo/m² contra os orçamentos anteriores da empresa */
    var M = Mem();
    if (M && opts.memoria && opts.perfil && Number(opts.perfil.area) > 0 && opts.perfil.tipologia) {
      Object.keys(opts.perfil.etapas || {}).forEach(function (id) {
        var f = M.faixa(opts.memoria, opts.perfil.tipologia, id, opts.perfil.etapas[id] / opts.perfil.area, { ignorarOrc: orc && orc.id });
        if (f.alerta) R.alertasFaixa.push({ etapa: (C && C.etapa(id) ? C.etapa(id).etapa : id), texto: f.texto, direcao: f.direcao });
      });
    }
    return R;
  }

  function lista(itens, vazio) { return itens.length ? "<ul>" + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : '<p class="mut">' + esc(vazio) + "</p>"; }

  function html(R, opts) {
    opts = opts || {};
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Como este orçamento foi montado</title><style>' +
      "@page{size:A4;margin:16mm}body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#1a2632}h1{font-size:19px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #c9d3dc;padding-bottom:3px}.sub{color:#5b6b79;margin:0 0 10px}" +
      "table{border-collapse:collapse;width:100%}th,td{border:1px solid #d5dde4;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f6}.mut{color:#5b6b79}.alerta{background:#fff7d6;border:1px solid #e6cf6a;padding:6px 8px}.r{text-align:right}</style></head><body>";
    h += "<h1>Como este orçamento foi montado</h1><p class=\"sub\">" + esc(R.orcamento.nome) + (R.orcamento.numero ? " · " + esc(R.orcamento.numero) : "") + (opts.empresa ? " · " + esc(opts.empresa) : "") + (opts.data ? " · " + esc(opts.data) : "") + "</p>";
    h += "<h2>Obra</h2><p>" + esc(R.tipologiaRotulo || R.tipologia || "tipo de obra não informado") + " · área: " + (R.obra.area !== undefined ? f2(R.obra.area) + " m²" : "não informada") +
      ["pavimentos", "quartos", "banheiros", "peDireito", "padrao", "perimetro"].filter(function (k) { return R.obra[k] !== undefined; }).map(function (k) { return " · " + k + ": " + esc(R.obra[k]); }).join("") + "</p>";
    if (R.documento) h += '<p class="mut">Gerado em parte a partir de um documento (' + esc(R.documento.origem || "texto") + ").</p>";
    h += "<h2>Perguntas respondidas</h2>" + (R.perguntas.length ? "<table><thead><tr><th>Pergunta</th><th>Resposta</th></tr></thead><tbody>" + R.perguntas.map(function (q) { return "<tr><td>" + esc(q.txt) + "</td><td>" + esc(q.valor) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="mut">Nenhuma pergunta foi respondida — valeram os padrões do catálogo.</p>');
    h += "<h2>Premissas</h2>" + lista(R.premissas, "Nenhuma premissa registrada.");
    h += "<h2>Itens por origem</h2>";
    var os = Object.keys(R.itensPorOrigem);
    h += os.length ? "<table><thead><tr><th>Origem</th><th class=\"r\">Itens</th><th>O que significa</th></tr></thead><tbody>" + os.map(function (o) { var g = R.itensPorOrigem[o]; return "<tr><td>" + esc(o) + '</td><td class="r">' + g.n + "</td><td>" + esc(g.rotulo) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="mut">Nenhum item foi gerado pelo motor.</p>';
    h += "<p>" + R.totalItens + " item(ns) do motor · <b>" + R.conferir + "</b> ainda a conferir · " + R.conferidos + " conferido(s) com OK.</p>";
    h += "<h2>Pendências</h2>" + (R.pendencias.length ? "<table><thead><tr><th>Etapa</th><th>Item</th><th>Motivo</th></tr></thead><tbody>" + R.pendencias.map(function (p) { return "<tr><td>" + esc(p.etapa) + "</td><td>" + esc(p.descricao) + "</td><td>" + esc(p.motivo) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="mut">Nenhuma pendência.</p>');
    if (R.naoEntendidas.length) h += "<h2>Frases do documento que o motor não entendeu</h2>" + lista(R.naoEntendidas, "");
    if (R.conflitos.length) h += "<h2>Conflitos no documento</h2>" + lista(R.conflitos, "");
    h += "<h2>Alertas de faixa de custo</h2>" + (R.alertasFaixa.length ? R.alertasFaixa.map(function (a) { return '<p class="alerta"><b>' + esc(a.etapa) + "</b> " + esc(a.texto) + ".</p>"; }).join("") : '<p class="mut">Nenhuma etapa fora da faixa dos seus orçamentos anteriores (ou histórico curto: preciso de 3 anteriores).</p>');
    h += "</body></html>";
    return h;
  }

  var Rel = { montar: montar, html: html };
  if (typeof module !== "undefined" && module.exports) module.exports = Rel;
  global.MorRelatorio = Rel;
})(typeof window !== "undefined" ? window : globalThis);

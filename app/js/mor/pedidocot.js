/* =====================================================================
 * mor/pedidocot.js — PEDIDO DE COTAÇÃO A FORNECEDOR (F11 do MOR, ESPEC §15 item 3)
 *
 * Para os itens «sob consulta» / sem preço, monta o pedido a mandar ao fornecedor e, quando a resposta volta digitada,
 * grava o preço no item com a fonte «cotação fornecedor».
 *   itensParaCotar(orc)                    → [{etapaId, itemId, etapa, descricao, unidade, quantidade, motivo}]
 *   gerar(orc, itens, opts)                → { texto (WhatsApp), assunto, email (texto), html (imprimível), itens }
 *   registrarResposta(orc, etapaId, itemId, resp, opts) → { ok, motivo, preco, antes }
 * O pedido leva SÓ: especificação (descrição), unidade, quantidade e a cidade da obra. Nunca leva preço do orçamento,
 * BDI, nome do cliente nem valor de outro item (o fornecedor não pode ver o que o orçamentista pensa pagar).
 * A resposta exige preço > 0, fornecedor e data válida (AAAA-MM-DD ou DD/MM/AAAA). Orçamento aprovado não muda.
 * O carimbo é o MESMO de js/cotpreco.js (`item.cotacao`, origem «cotacao») + `fonte: "cotação fornecedor"`, com o preço de
 * antes guardado — «voltar ao preço da base» continua funcionando. Puro, ES5, sem DOM; não envia nada a ninguém.
 * ===================================================================== */
(function (global) {
  "use strict";

  var FONTE = "cotação fornecedor";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(x) { return Math.round(num(x) * 100) / 100; }
  function txt(v) { return v == null ? "" : String(v).replace(/^\s+|\s+$/g, ""); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function qtdBr(q) { return String(Math.round(num(q) * 1000) / 1000).replace(".", ","); }
  function unChave(u) { return txt(u).toLowerCase().replace(/²/g, "2").replace(/³/g, "3").replace(/\s+/g, "").replace(/\./g, ""); }
  var SOB_CONSULTA = /sob consulta|a cotar|sob medida/i;

  function itensParaCotar(orc) {
    var out = [];
    arr(orc && orc.etapas).forEach(function (e) {
      arr(e && e.itens).forEach(function (it) {
        if (!it) return;
        var cotado = !!(it.cotacao && typeof it.cotacao === "object") && num(it.custoUnitario) > 0;
        if (cotado) return;
        var motivo = "";
        if (!(num(it.custoUnitario) > 0)) motivo = "sem preço";
        else if (SOB_CONSULTA.test(String(it.descricao || "")) || SOB_CONSULTA.test(String(it.codigo || ""))) motivo = "sob consulta";
        if (!motivo) return;
        out.push({ etapaId: e.id, itemId: it.id, etapa: e.nome || "", descricao: txt(it.descricao), unidade: txt(it.unidade), quantidade: num(it.quantidade), motivo: motivo });
      });
    });
    return out;
  }

  function dataBr(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }

  function gerar(orc, itens, opts) {
    opts = opts || {};
    var lista = arr(itens).filter(function (x) { return x && txt(x.descricao); });
    var cidade = txt(opts.cidade) || txt(orc && orc.obra && orc.obra.local) || "";
    var empresa = txt(opts.empresa), contato = txt(opts.contato), prazo = num(opts.prazoDias);
    var hoje = dataBr(String(opts.agora || new Date().toISOString()));
    var local = cidade || "a informar";
    var linhaQtd = function (x) { return num(x.quantidade) > 0 ? qtdBr(x.quantidade) + " " + x.unidade : "quantidade a confirmar (" + (x.unidade || "un") + ")"; };
    var t = ["Olá! Pedido de cotação" + (empresa ? " — " + empresa : "") + ".", "Obra em: " + local + ".", "Preciso do preço unitário POSTO NA OBRA (com frete) e prazo de entrega de:", ""];
    lista.forEach(function (x, i) { t.push((i + 1) + ") " + x.descricao + " — " + linhaQtd(x)); });
    t.push("");
    t.push("Por favor responda, para cada item: preço unitário, frete, prazo de entrega, validade da proposta" + (prazo > 0 ? " e responda em até " + prazo + " dia(s)" : "") + ".");
    if (contato) t.push("Contato: " + contato + ".");
    t.push("Obrigado!");
    var texto = t.join("\n");
    var assunto = "Pedido de cotação — obra em " + local + (empresa ? " — " + empresa : "");
    var email = "Prezados,\n\n" + t.slice(1).join("\n") + (empresa ? "\n\n" + empresa : "");
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(assunto) + '</title><style>' +
      "body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}p{margin:4px 0;font-size:13px}" +
      "table{border-collapse:collapse;width:100%;margin-top:12px;font-size:12.5px}th,td{border:1px solid #444;padding:6px;vertical-align:top;text-align:left}th{background:#eee}" +
      ".r{text-align:right;white-space:nowrap}.v{height:28px}@media print{body{margin:10mm}}</style></head><body>" +
      "<h1>Pedido de cotação</h1>" + (empresa ? "<p><b>" + esc(empresa) + "</b></p>" : "") +
      "<p>Obra em: <b>" + esc(local) + "</b> · Data do pedido: " + esc(hoje) + "</p>" +
      "<p>Informe o preço unitário POSTO NA OBRA (com frete), o prazo de entrega e a validade da proposta." + (prazo > 0 ? " Resposta em até " + prazo + " dia(s)." : "") + "</p>" +
      (contato ? "<p>Contato: " + esc(contato) + "</p>" : "") +
      '<table><thead><tr><th>Item</th><th>Especificação</th><th>Un</th><th class="r">Qtd</th><th>Preço unitário (R$)</th><th>Frete (R$)</th><th>Prazo (dias)</th></tr></thead><tbody>' +
      lista.map(function (x, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(x.descricao) + "</td><td>" + esc(x.unidade) + '</td><td class="r">' + (num(x.quantidade) > 0 ? esc(qtdBr(x.quantidade)) : "a confirmar") + '</td><td class="v"></td><td class="v"></td><td class="v"></td></tr>'; }).join("") +
      '</tbody></table><p style="margin-top:14px">Fornecedor: ______________________________ CNPJ: ____________________ Data: ___/___/______ Assinatura: ____________________</p></body></html>';
    return { texto: texto, assunto: assunto, email: email, html: h, itens: lista };
  }

  function dataValida(s) {
    s = txt(s);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s), a, mm, d;
    if (m) { a = +m[1]; mm = +m[2]; d = +m[3]; }
    else { m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); if (!m) return ""; d = +m[1]; mm = +m[2]; a = +m[3]; }
    var dt = new Date(Date.UTC(a, mm - 1, d));
    if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== d) return "";
    return (a < 10 ? "000" + a : a) + "-" + (mm < 10 ? "0" + mm : mm) + "-" + (d < 10 ? "0" + d : d);
  }

  function achar(orc, etapaId, itemId) {
    var r = null;
    arr(orc && orc.etapas).forEach(function (e) { if (e && e.id === etapaId) arr(e.itens).forEach(function (i) { if (i && i.id === itemId) r = i; }); });
    return r;
  }

  /* resp = { preco, fornecedor, data, unidade?, cnpj?, link? }. opts = { travado, quem, agora, Orcamento? } */
  function registrarResposta(orc, etapaId, itemId, resp, opts) {
    opts = opts || {}; resp = resp || {};
    var it = achar(orc, etapaId, itemId);
    if (!it) return { ok: false, motivo: "item não encontrado" };
    if (opts.travado) return { ok: false, motivo: "orçamento aprovado não muda o preço: crie uma revisão" };
    var preco = (typeof resp.preco === "string") ? Number(resp.preco.replace(/\./g, "").replace(",", ".")) : Number(resp.preco);
    if (!isFinite(preco) || !(preco > 0)) return { ok: false, motivo: "o preço precisa ser maior que zero" };
    preco = r2(preco);
    var forn = txt(resp.fornecedor);
    if (!forn) return { ok: false, motivo: "informe o fornecedor" };
    var data = dataValida(resp.data);
    if (!data) return { ok: false, motivo: "data inválida (use DD/MM/AAAA)" };
    if (txt(resp.unidade) && unChave(resp.unidade) !== unChave(it.unidade)) return { ok: false, motivo: "unidade diferente (item em " + txt(it.unidade) + ", resposta em " + txt(resp.unidade) + "): o preço não é comparável" };
    if (it.modoCusto === "mo") return { ok: false, motivo: "este item cobra só mão de obra; preço de fornecedor é de material" };
    var antes = it.cotacao && it.cotacao.antes != null ? num(it.cotacao.antes) : num(it.custoUnitario);
    var O = opts.Orcamento;
    if (O && typeof O.atualizarItem === "function") { try { O.atualizarItem(orc, etapaId, itemId, { custoUnitario: preco }); } catch (e) { /* cai no direto */ } }
    if (num(it.custoUnitario) !== preco) it.custoUnitario = preco;
    it.cotacao = { origem: "cotacao", fonte: FONTE, cotacaoId: "", numero: "", data: data, status: "", fornecedorId: "", fornecedor: forn, cnpj: txt(resp.cnpj), link: txt(resp.link), preco: preco, antes: antes, em: txt(opts.agora), por: txt(opts.quem) };
    return { ok: true, motivo: "", preco: preco, antes: antes };
  }

  var PedidoCot = { FONTE: FONTE, itensParaCotar: itensParaCotar, gerar: gerar, registrarResposta: registrarResposta, _dataValida: dataValida };
  if (typeof module !== "undefined" && module.exports) module.exports = PedidoCot;
  global.MorPedidoCot = PedidoCot;
})(typeof window !== "undefined" ? window : globalThis);

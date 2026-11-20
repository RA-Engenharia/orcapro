/* =====================================================================
 * metalcomparativo.js — METÁLICA: QUADRO COMPARATIVO DAS VARIANTES de
 * uma pré-configuração de pórticos (motor PURO, ES5, sem DOM; a tela fina
 * fica no fim). 20/11/2026, pedido do Rogério para o Pedido Gabriel
 * (Alumetal): as 4 variantes (PD 6/8 m × com/sem estrutura solar) lado a
 * lado — peso total, kg/m², peso por grupo, situação do cálculo e preço do
 * Orçamento da estrutura (js/metalorc.js), com os itens PROVISÓRIOS e os
 * SEM BASE marcados (nunca inventa preço: sem preço na base, a linha sai
 * "sem preço" e o total diz que está incompleto).
 *
 * API
 *   MetalComparativo.GRUPOS
 *   MetalComparativo.linha(v, calc, orc)    → a coluna de uma variante
 *        v = { id, rotulo, par }, calc = MetalPorticos.calcular(...),
 *        orc = MetalOrc.orcar({ caixas: calc.gerado.pecas }, opções) (ou null)
 *   MetalComparativo.calcularVariante(id, vid, op) → { v, calc, orc } (síncrono; a tela chama uma por vez)
 *   MetalComparativo.html(linhas, info)     → o quadro em HTML (para a tela e o PDF/HTML do cliente)
 *   MetalComparativo.xlsx(linhas, ExcelJS, info) → Workbook do ExcelJS
 * Teste: node tools/test-metal-comparativo.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { return null; } }
    return null;
  }
  function MP() { return dep("MetalPorticos", "./metalporticos.js"); }
  function MO() { return dep("MetalOrc", "./metalorc.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1); var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  function dist(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); }

  /* grupos do quadro ← grupos das peças da tipologia (js/metalporticos.js) */
  var GRUPOS = [
    { id: "tercas", rotulo: "Terças", de: ["terca"] },
    { id: "tesouras", rotulo: "Tesouras", de: ["banzoSup", "banzoInf", "montante", "diagonal", "maoFrancesa", "viga", "misula"] },
    { id: "colunas", rotulo: "Colunas", de: ["banzoColuna", "travejamento", "pilar", "pilarInterno"] },
    { id: "escoras", rotulo: "Escoras", de: ["escora"] },
    { id: "tapamento", rotulo: "Tapamento (oitões)", de: ["tapamento"] },
    { id: "contravento", rotulo: "Contraventos e correntes", de: ["contravento", "corrente", "tirante", "pendural"] }
  ];
  function grupoDe(g) { for (var i = 0; i < GRUPOS.length; i++) if (GRUPOS[i].de.indexOf(g) >= 0) return GRUPOS[i].id; return "outros"; }
  var SIT = { aprovado: "Aprovado", incompleto: "Atende (falta só o que o motor não verifica: ligações)", reprovado: "REPROVADO", "nao-calculou": "Não calculou" };

  function linha(v, calc, orc) {
    var o = { id: v.id, rotulo: v.rotulo, par: v.par || {}, ok: !!(calc && calc.ok), situacao: calc ? calc.situacao : "nao-calculou", grupos: {}, pesoTotal: 0, area: 0, kgm2: null, criticos: [], naoVerificados: [] };
    GRUPOS.forEach(function (g) { o.grupos[g.id] = 0; }); o.grupos.outros = 0;
    if (!o.ok) { o.motivo = calc && (calc.motivo || (calc.r && calc.r.motivo)) || "sem cálculo"; return o; }
    var r = calc.r, M = calc.gerado.modelo, massa = {};
    arr(r.modelo && r.modelo.membros).forEach(function (m) { var kg = num(m.secao && (m.secao.massa || (m.secao.mm && m.secao.mm.massa)), 0); if (kg > 0) massa[m.secao.nome] = kg; });
    /* o perfil FINAL de cada peça (o otimizador pode ter trocado) */
    var mapaPeca = {}; Object.keys(calc.gerado.mapa || {}).forEach(function (b) { mapaPeca[calc.gerado.mapa[b]] = b; });
    var final = {}; Object.keys(r.pecas || {}).forEach(function (pid) { final[mapaPeca[pid]] = r.pecas[pid].para; });
    M.barras.forEach(function (b) {
      var cat = final[b.id] || b.cat, kg = dist(M.nos[b.a], M.nos[b.b]) * num(massa[cat], 0), g = grupoDe(b.grupo);
      o.grupos[g] += kg; o.pesoTotal += kg;
    });
    var p = calc.gerado.par || v.par || {};
    o.area = num(p.vao, 0) * num(p.comprimento, 0);
    o.kgm2 = o.area > 0 ? o.pesoTotal / o.area : null;
    o.naoVerificados = arr(calc.naoVerificados).map(function (x) { return x.tema; });
    /* as 3 piores razões (para o "o que governa") */
    var piores = []; Object.keys(r.membros || {}).forEach(function (id) { var x = r.membros[id]; if (isFinite(x.razao)) piores.push({ id: id, razao: x.razao, governante: x.governante }); });
    piores.sort(function (a, b) { return b.razao - a.razao; });
    o.criticos = piores.slice(0, 3);
    if (orc && orc.ok) {
      var prov = arr(orc.linhas).filter(function (l) { return l.provisorio; }), sem = arr(orc.linhas).filter(function (l) { return l.status !== "ok"; });
      o.orcamento = { total: num(orc.total, 0), provisorios: prov.map(function (l) { return { codigo: l.codigo, descricao: l.descricao, total: l.total, motivo: l.provisorio.motivo }; }), semPreco: sem.map(function (l) { return { codigo: l.codigo, descricao: l.descricao }; }), linhas: arr(orc.linhas).length };
      o.orcamento.completo = sem.length === 0;
    } else o.orcamento = { total: null, provisorios: [], semPreco: [], motivo: orc ? orc.erro || orc.motivo || "o orçamento não fechou" : "sem orçamento" };
    return o;
  }

  /* calcula UMA variante (a tela chama uma por vez, com o progresso; o teste chama direto) */
  function calcularVariante(id, vid, op) {
    op = op || {};
    var P = MP(); if (!P) return null;
    var vs = P.presetVariantes(id), v = vs.filter(function (x) { return x.id === vid; })[0]; if (!v) return null;
    var par = JSON.parse(JSON.stringify(v.par)); par.x0 = 0;
    var calc = P.calcular(v.tipo, par, { vento: par.vento, calc: op.calc || {} }), orc = null;
    var O = MO();
    if (calc && calc.ok && O && O.orcar) { try { orc = O.orcar({ caixas: calc.gerado.pecas }, op.orcamento || {}); } catch (e) { orc = { ok: false, erro: e && e.message }; } }
    /* devolve ENXUTO (a análise inteira de 4 variantes passava de 3,6 GB de memória): a linha do quadro, as peças (para orçar de
       novo) e o resumo da situação; op.manterCalculo = true devolve o cálculo inteiro */
    var lin = linha(v, calc, orc), out = { v: v, linha: lin, orc: orc, pecas: calc && calc.gerado ? calc.gerado.pecas : [], situacao: calc ? calc.situacao : "nao-calculou",
               falhas: calc && calc.r ? calc.r.falhas : null, naoVerificados: arr(calc && calc.naoVerificados).map(function (x) { return x.tema; }), pesoMotor: calc && calc.r ? calc.r.peso : null, ok: !!(calc && calc.ok) };
    if (op.manterCalculo) out.calc = calc;
    return out;
  }

  function colunasValor(ls, f) { return ls.map(function (l) { return "<td>" + f(l) + "</td>"; }).join(""); }
  function html(ls, info) {
    info = info || {};
    var h = '<table class="mcomp" style="border-collapse:collapse;font:13px system-ui,sans-serif;width:100%">';
    var th = function (t) { return '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #00406a;background:#eef4f9">' + t + "</th>"; };
    h += "<thead><tr>" + th("") + ls.map(function (l) { return th(esc(l.rotulo)); }).join("") + "</tr></thead><tbody>";
    function lin(rot, f, forte) { h += '<tr><td style="padding:5px 8px;border-bottom:1px solid #dde5ee' + (forte ? ";font-weight:600" : "") + '">' + rot + "</td>" + ls.map(function (l) { return '<td style="padding:5px 8px;border-bottom:1px solid #dde5ee;text-align:right' + (forte ? ";font-weight:600" : "") + '">' + f(l) + "</td>"; }).join("") + "</tr>"; }
    lin("Situação do cálculo", function (l) { return '<span style="color:' + (l.situacao === "reprovado" || !l.ok ? "#b91c1c" : "#15803d") + '">' + esc(SIT[l.situacao] || l.situacao) + "</span>"; }, true);
    lin("Peso total da estrutura (kg)", function (l) { return l.ok ? br(l.pesoTotal, 0) : "—"; }, true);
    lin("Taxa (kg/m² de planta)", function (l) { return l.kgm2 != null ? br(l.kgm2, 1) : "—"; }, true);
    GRUPOS.forEach(function (g) { lin("&nbsp;&nbsp;" + esc(g.rotulo) + " (kg)", function (l) { return l.ok ? br(l.grupos[g.id], 0) : "—"; }); });
    lin("Preço do orçamento da estrutura (R$)", function (l) {
      var o = l.orcamento || {}; if (o.total == null) return '<span title="' + esc(o.motivo || "") + '">—</span>';
      return "R$ " + br(o.total, 2) + (o.semPreco.length ? ' <b style="color:#b91c1c">+ ' + o.semPreco.length + " item(ns) sem preço</b>" : "") + (o.provisorios.length ? '<br><small style="color:#a16207">' + o.provisorios.length + " item(ns) PROVISÓRIO(S) — cotar com o fornecedor</small>" : "");
    }, true);
    lin("O que governa (pior razão)", function (l) { return l.criticos.length ? esc(l.criticos[0].governante || "") + " — " + br(l.criticos[0].razao, 2) : "—"; });
    h += "</tbody></table>";
    var notas = [];
    ls.forEach(function (l) { (l.orcamento && l.orcamento.provisorios || []).forEach(function (p) { var t = p.codigo + " " + p.descricao + " (" + p.motivo + ")"; if (notas.indexOf(t) < 0) notas.push(t); }); });
    h += '<p style="font:12px system-ui,sans-serif;color:#475569;margin-top:10px">Peso = comprimento de eixo × massa linear do perfil (sem ligações, chapas e parafusos). ' + esc(info.nota || "") + "</p>";
    if (notas.length) h += '<p style="font:12px system-ui,sans-serif;color:#a16207"><b>Itens provisórios (cotar com o fornecedor):</b> ' + notas.map(esc).join("; ") + "</p>";
    return h;
  }
  function documento(ls, info) {
    info = info || {};
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(info.titulo || "Comparativo das variantes") + '</title>' +
      '<style>body{margin:24px;background:#fff;color:#0f172a}h1{font:600 20px system-ui,sans-serif;color:#00406a}@media print{body{margin:10mm}}</style></head><body><h1>' + esc(info.titulo || "Comparativo das variantes") + "</h1>" +
      (info.subtitulo ? '<p style="font:13px system-ui,sans-serif;color:#475569">' + esc(info.subtitulo) + "</p>" : "") + html(ls, info) + "</body></html>";
  }
  function xlsx(ls, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var ws = wb.addWorksheet("Comparativo", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } }), AZUL = "FF00406A";
    ws.getCell(1, 1).value = info.titulo || "Comparativo das variantes"; ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
    var cab = ws.getRow(3); cab.getCell(1).value = "Item"; ls.forEach(function (l, i) { cab.getCell(i + 2).value = l.rotulo; });
    cab.font = { bold: true, color: { argb: "FFFFFFFF" } }; cab.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; });
    ws.getColumn(1).width = 38; ls.forEach(function (l, i) { ws.getColumn(i + 2).width = 22; });
    var linhas = [["Situação do cálculo", function (l) { return SIT[l.situacao] || l.situacao; }], ["Peso total (kg)", function (l) { return l.ok ? Math.round(l.pesoTotal) : null; }, "#,##0"], ["Taxa (kg/m²)", function (l) { return l.kgm2 != null ? Math.round(l.kgm2 * 10) / 10 : null; }, "#,##0.0"]]
      .concat(GRUPOS.map(function (g) { return ["  " + g.rotulo + " (kg)", function (l) { return l.ok ? Math.round(l.grupos[g.id]) : null; }, "#,##0"]; }))
      .concat([["Preço do orçamento da estrutura (R$)", function (l) { return l.orcamento && l.orcamento.total != null ? l.orcamento.total : null; }, 'R$ #,##0.00'],
               ["Itens sem preço", function (l) { return l.orcamento ? l.orcamento.semPreco.length : null; }], ["Itens provisórios (cotar)", function (l) { return l.orcamento ? l.orcamento.provisorios.length : null; }]]);
    linhas.forEach(function (q, k) {
      var row = ws.getRow(4 + k); row.getCell(1).value = q[0];
      ls.forEach(function (l, i) { var c = row.getCell(i + 2); c.value = q[1](l); if (q[2]) c.numFmt = q[2]; });
    });
    var nota = ws.getRow(5 + linhas.length); nota.getCell(1).value = "Peso = comprimento de eixo × massa linear do perfil (sem ligações). Itens provisórios: preço público mais alto, cotar com o fornecedor.";
    return wb;
  }

  var MetalComparativo = { GRUPOS: GRUPOS, SIT: SIT, linha: linha, calcularVariante: calcularVariante, html: html, documento: documento, xlsx: xlsx };
  global.MetalComparativo = MetalComparativo;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalComparativo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

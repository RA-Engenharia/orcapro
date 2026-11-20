/* =====================================================================
 * metalproducao.js — METÁLICA: CONTROLE DE PRODUÇÃO POR QR
 * (motor PURO, ES5, sem DOM, Node-testável).
 *
 * Cada MARCA numerada (peça P1, CH3… e conjunto soldado A1…) ganha uma
 * ETIQUETA com QR (obra + marca). O pátio lê o QR com o celular e marca a
 * etapa que acabou de cumprir: corte → furação → solda/montagem → pintura →
 * expedição → montado em campo. O escritório vê, por marca e por etapa, o
 * % do PESO concluído.
 *
 * DADOS (entidade `metal_prod`, registros PLANOS, com obraId):
 *   item   { id:"mpi:<obra>:<marca>", tipo:"item", obraId, marca, kind:"peca"|"conjunto",
 *            descricao, perfil, qtd, pesoUnit, pesoTotal }
 *   etapa  { id:"mpe:<obra>:<marca>:<etapa>", tipo:"etapa", obraId, marca, etapa, qtd, em, por,
 *            hist:[{ em, por, acao:"marcou"|"ajustou"|"desfez", qtd, foraDeOrdem }] }
 * Um registro por marca E por etapa: o celular do pátio e o escritório
 * gravam registros diferentes — o merge da nuvem (por id) não os faz brigar.
 *
 * REGRAS
 *   - IDEMPOTENTE: marcar de novo a mesma etapa com a mesma quantidade não
 *     muda nada (nem data, nem histórico). Quantidade diferente = "ajustou".
 *   - AUDITADO: todo marcar/ajustar/desfazer entra no `hist` (nunca apaga;
 *     "desfazer" zera a quantidade e fica escrito quem e quando).
 *   - A quantidade é por marca (lote): marca com 12 peças pode ter 8 cortadas.
 *   - Fora de ordem é permitido (a fábrica pinta antes de furar um lote?) mas
 *     fica ESCRITO no histórico e a tela avisa.
 *   - % do peso: Σ(peso unitário × qtd feita) ÷ Σ peso total. As PEÇAS e os
 *     CONJUNTOS têm totais separados (o conjunto é feito das peças: somar os
 *     dois contaria o mesmo aço duas vezes).
 *
 * Teste: node tools/test-metalproducao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function QRm() { return dep("QR", "./qr.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round((num(v, 0) + 1e-9) * 100) / 100; }
  function r1(v) { return Math.round((num(v, 0) + 1e-9) * 10) / 10; }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1); var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  var ENTIDADE = "metal_prod";
  var ETAPAS = [["corte", "Corte"], ["furacao", "Furação"], ["solda", "Solda / montagem"], ["pintura", "Pintura"], ["expedicao", "Expedição"], ["campo", "Montado em campo"]];
  function nomeEtapa(id) { for (var i = 0; i < ETAPAS.length; i++) if (ETAPAS[i][0] === id) return ETAPAS[i][1]; return null; }
  function idxEtapa(id) { for (var i = 0; i < ETAPAS.length; i++) if (ETAPAS[i][0] === id) return i; return -1; }

  /* ============================================ IDS E QR */
  function idItem(obraId, marca) { return "mpi:" + txt(obraId) + ":" + txt(marca); }
  function idEtapa(obraId, marca, etapa) { return "mpe:" + txt(obraId) + ":" + txt(marca) + ":" + txt(etapa); }
  var PREFIXO_QR = "#metalprod=";
  /* o texto do QR: o endereço do app (base) + #metalprod=<obra>~<marca>. Sem base (aparelho sem endereço) vai só o texto
     "orcapro-metalprod:<obra>~<marca>", que o leitor do app também entende. */
  function textoQr(obraId, marca, base) {
    function cod(v) { return encodeURIComponent(txt(v)).replace(/~/g, "%7E"); }   /* o til separa obra e marca: o que for til de verdade vai codificado */
    var corpo = cod(obraId) + "~" + cod(marca);
    return base ? String(base).replace(/#.*$/, "") + PREFIXO_QR + corpo : "orcapro-metalprod:" + corpo;
  }
  function lerQr(texto) {
    var m = /(?:#metalprod=|^orcapro-metalprod:)([^~#&\s]+)~([^~#&\s]+)/.exec(txt(texto));
    if (!m) return null;
    try { return { obraId: decodeURIComponent(m[1]), marca: decodeURIComponent(m[2]) }; } catch (e) { return null; }
  }

  /* ============================================ ITENS A PARTIR DO MODELO */
  /* L = BimMetalFab.listas(estado): as peças (por marca) e os conjuntos SOLDADOS (os que têm partes) viram itens.
     Peça solta já tem a marca dela; conjunto sem partes seria a mesma peça duas vezes. */
  function itensDoModelo(L, obraId) {
    var out = [];
    arr(L && L.pecas).forEach(function (p) {
      out.push({ id: idItem(obraId, p.marca), tipo: "item", obraId: obraId, marca: p.marca, kind: "peca", descricao: txt(p.descricao), perfil: txt(p.perfil), qtd: Math.round(num(p.quantidade, 1)), pesoUnit: r2(p.pesoUnit), pesoTotal: r2(p.pesoTotal) });
    });
    arr(L && L.conjuntos).forEach(function (c) {
      if (!txt(c.partes)) return;
      out.push({ id: idItem(obraId, c.marca), tipo: "item", obraId: obraId, marca: c.marca, kind: "conjunto", descricao: txt(c.descricao) + " + " + txt(c.partes), perfil: "", qtd: Math.round(num(c.quantidade, 1)), pesoUnit: r2(c.pesoUnit), pesoTotal: r2(c.pesoTotal) });
    });
    return out;
  }
  /* o que gravar ao (re)gerar as etiquetas: só item NOVO ou que MUDOU (idempotente — não mexe no carimbo do que já está igual).
     `existentes` = a lista inteira da entidade. Devolve { gravar:[itens], novos, mudados, iguais } */
  function sincronizar(itens, existentes) {
    var por = {}; arr(existentes).forEach(function (r) { if (r && r.tipo === "item") por[r.id] = r; });
    var gravar = [], n = 0, m = 0, ig = 0;
    arr(itens).forEach(function (it) {
      var a = por[it.id];
      if (!a) { gravar.push(it); n++; return; }
      var mudou = ["kind", "descricao", "perfil", "qtd", "pesoUnit", "pesoTotal"].some(function (k) { return a[k] !== it[k]; });
      if (mudou) { var c = {}; Object.keys(a).forEach(function (k) { c[k] = a[k]; }); ["kind", "descricao", "perfil", "qtd", "pesoUnit", "pesoTotal"].forEach(function (k) { c[k] = it[k]; }); gravar.push(c); m++; } else ig++;
    });
    return { gravar: gravar, novos: n, mudados: m, iguais: ig };
  }

  /* ============================================ REGISTRO DE ETAPA (função pura) */
  /* lista = todos os registros da entidade; o chamador grava `registro` (se houver). pedido: { obraId, marca, etapa, qtd?, por, em?, desfazer? }
   * Devolve { ok, acao:"marcou"|"ajustou"|"desfez"|"igual", registro|null, avisos, erro? } */
  function registrar(lista, pedido) {
    pedido = pedido || {}; lista = arr(lista);
    var obraId = txt(pedido.obraId), marca = txt(pedido.marca), etapa = txt(pedido.etapa);
    if (!obraId || !marca) return { ok: false, erro: "Faltou a obra ou a marca.", registro: null, avisos: [] };
    if (idxEtapa(etapa) < 0) return { ok: false, erro: "Etapa desconhecida: " + etapa + ".", registro: null, avisos: [] };
    var por = {}; lista.forEach(function (r) { if (r && r.id) por[r.id] = r; });
    var item = por[idItem(obraId, marca)];
    if (!item) return { ok: false, erro: "A marca " + marca + " não está cadastrada nesta obra (gere as etiquetas pelo modelo primeiro).", registro: null, avisos: [] };
    var quem = txt(pedido.por).trim() || "(sem identificação)";
    var qtd = pedido.desfazer ? 0 : (pedido.qtd == null || pedido.qtd === "" ? item.qtd : Math.round(num(pedido.qtd, NaN)));
    if (!isFinite(qtd) || qtd < 0 || qtd > item.qtd) return { ok: false, erro: "Quantidade inválida: a marca " + marca + " tem " + item.qtd + " peça(s).", registro: null, avisos: [] };
    var atual = por[idEtapa(obraId, marca, etapa)], qAtual = atual ? num(atual.qtd, 0) : 0, avisos = [];
    if (qtd === qAtual) return { ok: true, acao: "igual", registro: null, avisos: ["Já estava registrado assim — nada mudou."] };
    /* fora de ordem: alguma etapa ANTERIOR com menos peças que esta */
    var foraDeOrdem = false, i0 = idxEtapa(etapa);
    for (var i = 0; i < i0; i++) { var ea = por[idEtapa(obraId, marca, ETAPAS[i][0])]; if ((ea ? num(ea.qtd, 0) : 0) < qtd) { foraDeOrdem = true; avisos.push("Fora de ordem: " + ETAPAS[i][1] + " ainda não cobre " + qtd + " peça(s)."); break; } }
    var acao = qtd === 0 ? "desfez" : (qAtual === 0 ? "marcou" : "ajustou"), em = pedido.em || new Date().toISOString();
    var reg = atual ? JSON.parse(JSON.stringify(atual)) : { id: idEtapa(obraId, marca, etapa), tipo: "etapa", obraId: obraId, marca: marca, etapa: etapa, hist: [] };
    reg.qtd = qtd; reg.em = em; reg.por = quem;
    reg.hist = arr(reg.hist).concat([{ em: em, por: quem, acao: acao, qtd: qtd, foraDeOrdem: foraDeOrdem }]);
    return { ok: true, acao: acao, registro: reg, avisos: avisos, foraDeOrdem: foraDeOrdem };
  }

  /* a próxima etapa pendente da marca (a primeira que ainda não cobre todas as peças) ou null se tudo feito */
  function proximaEtapa(lista, obraId, marca) {
    var por = {}; arr(lista).forEach(function (r) { if (r && r.id) por[r.id] = r; });
    var item = por[idItem(obraId, marca)]; if (!item) return null;
    for (var i = 0; i < ETAPAS.length; i++) { var e = por[idEtapa(obraId, marca, ETAPAS[i][0])]; if ((e ? num(e.qtd, 0) : 0) < item.qtd) return ETAPAS[i][0]; }
    return null;
  }

  /* ============================================ ACOMPANHAMENTO */
  /* linhas por marca de UMA obra + totais por etapa (peças e conjuntos separados) */
  function progresso(lista, obraId) {
    lista = arr(lista);
    var itens = [], et = {};
    lista.forEach(function (r) { if (!r || r.obraId !== obraId) return; if (r.tipo === "item") itens.push(r); else if (r.tipo === "etapa") et[r.id] = r; });
    itens.sort(function (a, b) { return a.kind !== b.kind ? (a.kind === "peca" ? -1 : 1) : (a.marca < b.marca ? -1 : a.marca > b.marca ? 1 : 0); });
    var tot = { peca: { peso: 0, feito: {} }, conjunto: { peso: 0, feito: {} } };
    ETAPAS.forEach(function (e) { tot.peca.feito[e[0]] = 0; tot.conjunto.feito[e[0]] = 0; });
    var linhas = itens.map(function (it) {
      var l = { id: it.id, obraId: obraId, marca: it.marca, kind: it.kind, descricao: it.descricao, perfil: it.perfil, qtd: it.qtd, pesoUnit: it.pesoUnit, pesoTotal: it.pesoTotal, etapas: {}, pctPeso: 0, ultimo: null, proxima: null };
      var somaPct = 0;
      ETAPAS.forEach(function (e) {
        var r = et[idEtapa(obraId, it.marca, e[0])], q = r ? num(r.qtd, 0) : 0, pct = it.qtd > 0 ? q / it.qtd * 100 : 0;
        l.etapas[e[0]] = { qtd: q, pct: r1(pct), completa: q >= it.qtd && it.qtd > 0, em: r ? r.em : null, por: r ? r.por : null };
        somaPct += pct; tot[it.kind].feito[e[0]] += num(it.pesoUnit, 0) * q;
        if (r && q > 0 && (!l.ultimo || r.em > l.ultimo.em)) l.ultimo = { etapa: e[0], em: r.em, por: r.por };
        if (!l.proxima && !(q >= it.qtd)) l.proxima = e[0];
      });
      l.pctPeso = r1(somaPct / ETAPAS.length);
      tot[it.kind].peso += num(it.pesoTotal, 0);
      return l;
    });
    function fecha(k) {
      var T = tot[k], por = {}, soma = 0;
      ETAPAS.forEach(function (e) { var pct = T.peso > 0 ? T.feito[e[0]] / T.peso * 100 : 0; por[e[0]] = { pesoFeito: r2(T.feito[e[0]]), pct: r1(pct) }; soma += pct; });
      return { pesoTotal: r2(T.peso), etapas: por, pctGeral: r1(soma / ETAPAS.length), marcas: linhas.filter(function (l) { return l.kind === k; }).length };
    }
    return { linhas: linhas, pecas: fecha("peca"), conjuntos: fecha("conjunto"), registros: Object.keys(et).map(function (k) { return et[k]; }) };
  }
  /* filtro: { texto, kind, etapa, estado:"feito"|"falta" } (etapa+estado juntos) */
  function filtrar(linhas, f) {
    f = f || {}; var t = txt(f.texto).toLowerCase().trim();
    return arr(linhas).filter(function (l) {
      if (f.kind && l.kind !== f.kind) return false;
      if (t && (l.marca + " " + l.descricao + " " + l.perfil).toLowerCase().indexOf(t) < 0) return false;
      if (f.etapa && f.estado) { var e = l.etapas[f.etapa]; if (!e) return false; if (f.estado === "feito" && !e.completa) return false; if (f.estado === "falta" && e.completa) return false; }
      return true;
    });
  }

  /* ============================================ ETIQUETAS (HTML para imprimir / salvar em PDF) */
  function svgQr(texto, tam) { var Q = QRm(); return Q && Q.svg ? Q.svg(texto, { tamanhoPx: tam || 120, correcao: "M", margemModulos: 2 }) : ""; }
  function etiquetaHtml(it, o) {
    o = o || {};
    var txtQr = textoQr(it.obraId, it.marca, o.base), svg = svgQr(txtQr, 118);
    return '<div class="et" data-et="' + esc(it.marca) + '"><div class="qr">' + (svg || '<span class="sem">QR indisponível</span>') + '</div><div class="tx">' +
      '<div class="mc">' + esc(it.marca) + '</div><div class="ds">' + esc(it.descricao) + "</div>" +
      '<div class="mt">' + (it.kind === "conjunto" ? "Conjunto soldado" : "Peça") + " · " + it.qtd + " un · " + br(it.pesoUnit, 1) + " kg/un</div>" +
      '<div class="ob">' + esc(o.obraNome || "") + "</div></div></div>";
  }
  function etiquetasHtml(itens, o) {
    o = o || {}; itens = arr(itens);
    var css = "@page{size:A4;margin:8mm}body{font:12px Arial,sans-serif;color:#111;margin:0}.bar{padding:8px 12px;background:#eef2f7;font-size:12px}.bar button{padding:6px 12px;margin-right:8px}" +
      ".folha{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;padding:4mm}.et{display:flex;gap:3mm;align-items:center;border:1px dashed #667;border-radius:2mm;padding:3mm;height:36mm;box-sizing:border-box;page-break-inside:avoid;overflow:hidden}" +
      ".qr{flex:0 0 31mm}.qr svg{width:31mm;height:31mm}.tx{flex:1;min-width:0}.mc{font-size:22px;font-weight:700;line-height:1}.ds{font-size:10.5px;margin:2px 0;max-height:3.6em;overflow:hidden}.mt{font-size:10px;color:#333}.ob{font-size:9.5px;color:#555;margin-top:2px}" +
      "@media print{.bar{display:none}}";
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas de produção — ' + esc(o.obraNome || "obra") + "</title><style>" + css + "</style></head><body>" +
      '<div class="bar"><button onclick="window.print()">Imprimir / salvar em PDF</button> ' + itens.length + " etiqueta(s) — " + esc(o.obraNome || "") + ". Cole na peça; o QR abre a marca no OrçaPRO para marcar a etapa.</div>" +
      '<div class="folha" data-mp="etiquetas">' + itens.map(function (it) { return etiquetaHtml(it, o); }).join("") + "</div></body></html>";
  }

  /* ============================================ .xlsx DO ACOMPANHAMENTO */
  function xlsx(P, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var CINZA = "FFDDE5EE";
    function aba(nome, cols, linhas) {
      var ws = wb.addWorksheet(nome);
      ws.columns = cols.map(function (c) { return { header: c[1], key: c[0], width: c[2] || 12 }; });
      linhas.forEach(function (l) { ws.addRow(l); });
      var cab = ws.getRow(1); cab.font = { bold: true }; cab.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } }; });
      cols.forEach(function (c, i) { if (c[3]) ws.getColumn(i + 1).numFmt = c[3]; });
      ws.views = [{ state: "frozen", ySplit: 1 }];
      return ws;
    }
    var colsM = [["marca", "Marca", 9], ["tipo", "Tipo", 11], ["descricao", "Descrição", 44], ["qtd", "Qtd", 6, "0"], ["peso", "Peso total (kg)", 14, "#,##0.00"]];
    ETAPAS.forEach(function (e) { colsM.push([e[0], e[1] + " (%)", 14, "0.0"]); });
    colsM.push(["geral", "Avanço (média das etapas, %)", 18, "0.0"], ["proxima", "Próxima etapa", 18], ["ultimo", "Último registro", 34]);
    aba("Por marca", colsM, P.linhas.map(function (l) {
      var o = { marca: l.marca, tipo: l.kind === "conjunto" ? "Conjunto" : "Peça", descricao: l.descricao, qtd: l.qtd, peso: l.pesoTotal, geral: l.pctPeso, proxima: l.proxima ? nomeEtapa(l.proxima) : "concluída",
                ultimo: l.ultimo ? nomeEtapa(l.ultimo.etapa) + " — " + l.ultimo.em + " — " + l.ultimo.por : "" };
      ETAPAS.forEach(function (e) { o[e[0]] = l.etapas[e[0]].pct; });
      return o;
    }));
    var ve = [];
    [["Peças", P.pecas], ["Conjuntos soldados", P.conjuntos]].forEach(function (g) { ETAPAS.forEach(function (e) { ve.push({ grupo: g[0], etapa: e[1], feito: g[1].etapas[e[0]].pesoFeito, total: g[1].pesoTotal, pct: g[1].etapas[e[0]].pct }); }); ve.push({ grupo: g[0], etapa: "AVANÇO GERAL (média das etapas)", feito: "", total: g[1].pesoTotal, pct: g[1].pctGeral }); });
    aba("Por etapa", [["grupo", "Grupo", 20], ["etapa", "Etapa", 34], ["feito", "Peso concluído (kg)", 20, "#,##0.00"], ["total", "Peso total (kg)", 16, "#,##0.00"], ["pct", "% do peso", 12, "0.0"]], ve);
    var reg = [];
    arr(P.registros).forEach(function (r) { arr(r.hist).forEach(function (h) { reg.push({ marca: r.marca, etapa: nomeEtapa(r.etapa) || r.etapa, acao: h.acao, qtd: h.qtd, em: h.em, por: h.por, fora: h.foraDeOrdem ? "sim" : "" }); }); });
    reg.sort(function (a, b) { return a.em < b.em ? -1 : a.em > b.em ? 1 : 0; });
    aba("Registros", [["marca", "Marca", 9], ["etapa", "Etapa", 20], ["acao", "Ação", 10], ["qtd", "Qtd", 6, "0"], ["em", "Data e hora", 26], ["por", "Quem", 26], ["fora", "Fora de ordem", 14]], reg);
    var wl = wb.addWorksheet("Leia-me");
    ["OrçaPRO Modela — Metálica: acompanhamento de produção por marca e por etapa" + (info.obra ? " — " + info.obra : "") + ".",
     "Etapas: corte → furação → solda/montagem → pintura → expedição → montado em campo. % do peso = Σ(peso unitário × peças feitas) ÷ peso total.",
     "Peças e conjuntos soldados têm totais separados (o conjunto é feito das peças: somar os dois contaria o mesmo aço duas vezes).",
     "A aba Registros é o histórico completo (quem marcou, quando, ajustes e o que foi desfeito); nada é apagado."].forEach(function (t) { wl.addRow([t]); });
    wl.getColumn(1).width = 150;
    return wb;
  }

  var BimMetalProducao = {
    ENTIDADE: ENTIDADE, ETAPAS: ETAPAS, nomeEtapa: nomeEtapa, idItem: idItem, idEtapa: idEtapa, textoQr: textoQr, lerQr: lerQr,
    itensDoModelo: itensDoModelo, sincronizar: sincronizar, registrar: registrar, proximaEtapa: proximaEtapa, progresso: progresso, filtrar: filtrar,
    etiquetaHtml: etiquetaHtml, etiquetasHtml: etiquetasHtml, xlsx: xlsx, br: br
  };
  global.BimMetalProducao = BimMetalProducao;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalProducao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

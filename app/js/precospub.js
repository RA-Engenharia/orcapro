/* =====================================================================
 * precospub.js — PESQUISA DE PREÇOS PÚBLICOS (art. 23, Lei 14.133/2021) e ADESÃO A ATA (carona) — motor puro
 *
 * FONTE: serviço público do CertamePRO (preços de atas e contratos de órgãos públicos), contrato combinado entre os dois sistemas:
 *   GET https://app.certamepro.com.br/api/publico/precos?q=&uf=&desde=&ate=&limite=
 *   → { itens: [{ descricao, unidade, quantidade, valor_unitario, data, orgao, uf, municipio, fornecedor, tipo ('ata'|'contrato'), link }],
 *       estatistica: { n, minimo, mediana, media, maximo } }
 * ⚠ EM 20/11/2026 O ENDPOINT AINDA NÃO ESTAVA NO AR (respondeu 401 "entre com seu e-mail e senha"). Tudo aqui foi escrito contra o contrato,
 *   testado com fixture SINTÉTICA (tools/dados/apis/certamepro-precos.json — marcada como sintética) e tem o modo "indisponível" amigável:
 *   401/403/404/rede fora viram um recado que diz o que aconteceu e que a pesquisa manual (fontes do passo de pesquisa) continua valendo.
 *
 * O QUE ESTE MOTOR GARANTE (cada regra existe por causa de um erro que a pesquisa de preços não pode cometer):
 *  • Todo preço mostrado leva FONTE: órgão, data, link. Item sem valor positivo não entra (e é contado, não escondido).
 *  • DESCARTE POR REGRA EXPLÍCITA e configurável: fora de [baixo × mediana, alto × mediana] (padrão 0,5× e 2×), UMA passada, mediana calculada
 *    sobre TODOS os preços válidos. Cada descartado carrega o motivo com os números. Sem regra, nada some em silêncio.
 *  • O relatório sai com a DATA DA CONSULTA, os parâmetros, a regra e a URL da fonte — é o que o processo precisa mostrar.
 *  • A vigência de ata NÃO é inventada: se o serviço informa o fim, usa; se não, a ata é tratada como "vigência presumida" (registrada há até
 *    12 meses — prazo-base da ata de registro de preços, art. 84 da Lei 14.133) e a tela manda conferir no link.
 *  • Adesão (carona) depende de previsão no edital da ata e dos limites do art. 86 da Lei 14.133 e do regulamento do órgão — o sistema lista
 *    candidatas, não autoriza adesão.
 * FREIO: uma chamada por clique, ≥ 2 s entre chamadas, cache de 1 h por consulta (localStorage em try/catch), nada ao abrir a tela.
 * ES5. Testes: tools/test-precospub.js (só fixture).
 * ===================================================================== */
(function (global) {
  "use strict";

  var ENDPOINT = "https://app.certamepro.com.br/api/publico/precos";
  var TTL_MS = 3600 * 1000, INTERVALO_MIN_MS = 2000, MAX_CACHE = 20;
  var CH = "orcapro:precospub:";
  var REGRA_PADRAO = { baixo: 0.5, alto: 2, metodo: "mediana" };
  var _ultima = 0, _voo = {};

  function s(v) { return v == null ? "" : String(v); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function isoDe(d) { return d.getFullYear() + "-" + dd(d.getMonth() + 1) + "-" + dd(d.getDate()); }
  function brDeIso(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(iso)); return m ? m[3] + "/" + m[2] + "/" + m[1] : s(iso); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function moeda(v) { return typeof v === "number" ? "R$ " + r2(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "—"; }
  function esc(v) { return s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    var t = s(v).replace(/[^0-9.,\-]/g, ""); if (!t) return NaN;
    if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(t); return isFinite(n) ? n : NaN;
  }
  /* data ISO (AAAA-MM-DD…) ou DD/MM/AAAA → ISO; vazio se não entender */
  function dataIso(v) {
    var t = s(v).replace(/^\s+|\s+$/g, ""), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t), b = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
    return m ? m[1] + "-" + m[2] + "-" + m[3] : (b ? b[3] + "-" + b[2] + "-" + b[1] : "");
  }
  function addMeses(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return "";
    var a = +m[1], mes = +m[2] - 1 + n, dia = +m[3];
    a += Math.floor(mes / 12); mes = ((mes % 12) + 12) % 12;
    var ult = new Date(a, mes + 1, 0).getDate();
    return a + "-" + dd(mes + 1) + "-" + dd(Math.min(dia, ult));
  }

  function estatistica(valores) {
    var v = arr(valores).filter(function (x) { return typeof x === "number" && isFinite(x); }).slice().sort(function (a, b) { return a - b; });
    if (!v.length) return { n: 0, minimo: null, mediana: null, media: null, maximo: null };
    var soma = 0; v.forEach(function (x) { soma += x; });
    var meio = Math.floor(v.length / 2), med = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
    return { n: v.length, minimo: v[0], mediana: med, media: soma / v.length, maximo: v[v.length - 1] };
  }

  /* um item do serviço → item do sistema; null se não tem preço utilizável */
  function normalizarItem(x) {
    if (!x || typeof x !== "object") return null;
    var valor = num(x.valor_unitario);
    if (!(valor > 0)) return null;
    var tipo = s(x.tipo).toLowerCase();
    return { descricao: s(x.descricao).replace(/\s+/g, " ").replace(/^ | $/g, ""), unidade: s(x.unidade), quantidade: isFinite(num(x.quantidade)) ? num(x.quantidade) : null,
      valor: valor, data: dataIso(x.data), orgao: s(x.orgao), uf: s(x.uf).toUpperCase(), municipio: s(x.municipio), fornecedor: s(x.fornecedor),
      tipo: tipo === "ata" || tipo === "contrato" ? tipo : (tipo || "outro"), link: s(x.link), vigenciaFim: dataIso(x.vigencia_fim || x.vigenciaFim) };
  }
  function lerResposta(j) {
    if (!j || typeof j !== "object" || Object.prototype.toString.call(j.itens) !== "[object Array]") return { ok: false, erro: "Resposta fora do contrato combinado (esperava { itens: [...] })." };
    var itens = [], invalidos = 0;
    j.itens.forEach(function (x) { var n = normalizarItem(x); if (n) itens.push(n); else invalidos++; });
    return { ok: true, itens: itens, invalidos: invalidos, estatisticaServico: j.estatistica && typeof j.estatistica === "object" ? j.estatistica : null };
  }

  function montarUrl(p) {
    p = p || {};
    var q = [];
    /* 20/11/2026: o PNCP não publica itens de contrato — o contrato vem com o valor GLOBAL (unidade "global"), que não é preço
       unitário. Preço de referência e mapa de preços pedem só ATA (preço unitário registrado); quem quiser contrato pede tipo explícito. */
    if (p.tipo == null) p = Object.assign({}, p, { tipo: "ata" });
    ["q", "uf", "desde", "ate", "limite", "tipo"].forEach(function (k) {
      var v = p[k]; if (v == null || s(v) === "") return;
      q.push(k + "=" + encodeURIComponent(k === "uf" ? s(v).toUpperCase() : s(v)));
    });
    return ENDPOINT + (q.length ? "?" + q.join("&") : "");
  }

  /* ---- cache ---- */
  function arm(ctx) { try { return (ctx && ctx.storage) || global.localStorage || null; } catch (e) { return null; } }
  function cacheLer(url, ctx, agora) {
    var a = arm(ctx); if (!a) return null;
    try { var o = JSON.parse(a.getItem(CH + "q:" + url) || "null"); return o && agora - o.em < TTL_MS ? o : null; } catch (e) { return null; }
  }
  function cacheGravar(url, dados, ctx, agora) {
    var a = arm(ctx); if (!a) return;
    try {
      var ind = JSON.parse(a.getItem(CH + "ind") || "[]"); if (!arr(ind).length) ind = [];
      ind = ind.filter(function (u) { return u !== url; }); ind.push(url);
      while (ind.length > MAX_CACHE) { try { a.removeItem(CH + "q:" + ind.shift()); } catch (e) {} }
      a.setItem(CH + "ind", JSON.stringify(ind));
      a.setItem(CH + "q:" + url, JSON.stringify({ em: agora, d: dados }));
    } catch (e) {}
  }

  /* consultar(params, ctx) → Promise<{ok:true, itens, estatisticaServico, invalidos, url, consultadoEm, deCache}
                                   | {ok:false, indisponivel:true, motivo} | {ok:false, erro}>   (nunca rejeita) */
  function consultar(params, ctx) {
    ctx = ctx || {};
    var P = ctx.Promise || global.Promise, agora = ctx.agora != null ? ctx.agora : new Date().getTime(), url = montarUrl(params);
    if (!s(params && params.q).replace(/\s/g, "")) return P.resolve({ ok: false, erro: "Digite o que pesquisar (ex.: cimento CP II 50 kg)." });
    var c = cacheLer(url, ctx, agora);
    if (c) { var d0 = c.d; d0.deCache = true; return P.resolve(d0); }
    if (_voo[url]) return _voo[url];
    if (!ctx.semFreio && _ultima && agora - _ultima < INTERVALO_MIN_MS) return P.resolve({ ok: false, erro: "Aguarde alguns segundos entre consultas." });
    var f = ctx.fetch || (global.fetch ? function (u) { return global.fetch(u); } : null);
    if (!f) return P.resolve({ ok: false, indisponivel: true, motivo: "Este navegador não consegue consultar o serviço de preços." });
    _ultima = agora;
    _voo[url] = P.resolve().then(function () { return f(url); }).then(function (r) {
      delete _voo[url];
      if (!r) return { ok: false, indisponivel: true, motivo: "Sem resposta do serviço de preços do CertamePRO." };
      if (r.status === 401 || r.status === 403) return { ok: false, indisponivel: true, motivo: "O serviço de preços do CertamePRO ainda não está liberado para consulta pública (exigiu login: HTTP " + r.status + "). Use as fontes do passo de pesquisa de preços enquanto isso." };
      if (r.status === 404) return { ok: false, indisponivel: true, motivo: "O serviço de preços do CertamePRO ainda não está no ar (HTTP 404). Use as fontes do passo de pesquisa de preços enquanto isso." };
      if (!r.ok) return { ok: false, indisponivel: true, motivo: "O serviço de preços do CertamePRO respondeu com erro (HTTP " + r.status + "). Tente de novo mais tarde." };
      return P.resolve(r.json()).then(function (j) {
        var l = lerResposta(j);
        if (!l.ok) return { ok: false, erro: l.erro };
        var out = { ok: true, itens: l.itens, invalidos: l.invalidos, estatisticaServico: l.estatisticaServico, url: url, consultadoEm: new Date(agora).toISOString(), deCache: false };
        cacheGravar(url, out, ctx, agora);
        return out;
      });
    }).then(null, function (e) {
      delete _voo[url];
      return { ok: false, indisponivel: true, motivo: "Sem conexão com o serviço de preços (" + (e && e.message ? e.message : "falha de rede") + "). Confira a internet; a pesquisa manual segue valendo." };
    });
    return _voo[url];
  }

  /* DESCARTE: fora de [baixo × mediana, alto × mediana]; mediana de TODOS os válidos; uma passada */
  function aplicarRegra(itens, regra) {
    regra = regra || {};
    var baixo = typeof regra.baixo === "number" && regra.baixo >= 0 ? regra.baixo : REGRA_PADRAO.baixo, alto = typeof regra.alto === "number" && regra.alto > 0 ? regra.alto : REGRA_PADRAO.alto;
    var base = estatistica(arr(itens).map(function (i) { return i.valor; })), med = base.mediana;
    var mantidos = [], descartados = [];
    arr(itens).forEach(function (i) {
      if (med != null && i.valor < baixo * med) descartados.push({ item: i, motivo: "valor " + moeda(i.valor) + " abaixo de " + s(baixo).replace(".", ",") + " × a mediana (" + moeda(med) + ") = " + moeda(baixo * med) });
      else if (med != null && i.valor > alto * med) descartados.push({ item: i, motivo: "valor " + moeda(i.valor) + " acima de " + s(alto).replace(".", ",") + " × a mediana (" + moeda(med) + ") = " + moeda(alto * med) });
      else mantidos.push(i);
    });
    return { mantidos: mantidos, descartados: descartados, medianaBase: med, baixo: baixo, alto: alto,
      texto: "Descartados os preços fora de " + s(baixo).replace(".", ",") + "× a " + s(alto).replace(".", ",") + "× a mediana de todos os preços coletados (" + moeda(med) + "), em uma única passada." };
  }

  function precoReferencia(mantidos, metodo) {
    var st = estatistica(arr(mantidos).map(function (i) { return i.valor; }));
    if (!st.n) return { valor: null, metodo: metodo, stats: st };
    var m = metodo === "media" ? "media" : (metodo === "menor" ? "minimo" : "mediana");
    return { valor: st[m], metodo: m === "media" ? "média" : (m === "minimo" ? "menor valor" : "mediana"), stats: st };
  }

  /* filtros do usuário depois da consulta */
  function filtrar(itens, f) {
    f = f || {};
    return arr(itens).filter(function (i) {
      if (f.tipo && i.tipo !== f.tipo) return false;
      if (f.uf && i.uf !== s(f.uf).toUpperCase()) return false;
      if (f.unidade && s(i.unidade).toLowerCase() !== s(f.unidade).toLowerCase()) return false;
      return true;
    });
  }

  /* ATAS PARA ADESÃO: tipo ata e vigente. vigência informada pelo serviço vale; sem ela, presumida = data + 12 meses (e é dito). */
  function atasVigentes(itens, hojeIso) {
    hojeIso = hojeIso || isoDe(new Date());
    var out = [];
    arr(itens).forEach(function (i) {
      if (i.tipo !== "ata") return;
      var fim = i.vigenciaFim, presumida = false;
      if (!fim) { fim = i.data ? addMeses(i.data, 12) : ""; presumida = true; }
      if (!fim) return;                          /* sem data nenhuma não dá para dizer que está vigente */
      if (fim < hojeIso) return;
      var c = {}; for (var k in i) if (i.hasOwnProperty(k)) c[k] = i[k];
      c.vigenteAte = fim; c.vigenciaPresumida = presumida; out.push(c);
    });
    return out;
  }

  /* mapa de preços da pesquisa: tudo que o relatório e a tela mostram */
  function montarPesquisa(consulta, regra, hojeIso) {
    regra = regra || REGRA_PADRAO;
    var r = aplicarRegra(consulta.itens, regra), ref = precoReferencia(r.mantidos, regra.metodo || REGRA_PADRAO.metodo);
    return { params: consulta.params || {}, url: consulta.url, consultadoEm: consulta.consultadoEm, itens: consulta.itens, mantidos: r.mantidos, descartados: r.descartados,
      regraTexto: r.texto, regra: { baixo: r.baixo, alto: r.alto, metodo: regra.metodo || REGRA_PADRAO.metodo }, medianaBase: r.medianaBase,
      referencia: ref, estatisticaServico: consulta.estatisticaServico || null, invalidos: consulta.invalidos || 0 };
  }

  /* orçado × contratado: o valor do orçamento contra a FAIXA (mín–máx) dos preços mantidos */
  function comparar(valorOrcado, pesq) {
    var st = pesq && pesq.referencia ? pesq.referencia.stats : null;
    if (!st || !st.n) return { ok: false, erro: "Sem preços públicos válidos para comparar." };
    var v = Number(valorOrcado);
    if (!(v > 0)) return { ok: false, erro: "O item do orçamento não tem preço para comparar." };
    var med = st.mediana, dev = (v / med - 1) * 100, sit = v > st.maximo ? "acima" : (v < st.minimo ? "abaixo" : "dentro");
    var txt = sit === "dentro" ? "Dentro da faixa praticada (" + moeda(st.minimo) + " a " + moeda(st.maximo) + "); " + (dev >= 0 ? "+" : "") + dev.toFixed(1).replace(".", ",") + "% sobre a mediana."
      : (sit === "acima" ? "ACIMA do maior preço público encontrado (" + moeda(st.maximo) + "): " + dev.toFixed(1).replace(".", ",") + "% sobre a mediana (" + moeda(med) + ")."
        : "ABAIXO do menor preço público encontrado (" + moeda(st.minimo) + "): " + dev.toFixed(1).replace(".", ",") + "% sobre a mediana (" + moeda(med) + ") — confira se há erro de unidade ou inexequibilidade.");
    return { ok: true, situacao: sit, alerta: sit !== "dentro", desvioPct: dev, faixa: [st.minimo, st.maximo], mediana: med, n: st.n, texto: txt };
  }

  /* ---- relatório da pesquisa (o que o processo anexa) ---- */
  function linhaHtml(i, motivo) {
    return "<tr><td>" + esc(i.descricao) + "</td><td>" + esc(i.unidade) + '</td><td class="n">' + moeda(i.valor) + "</td><td>" + esc(brDeIso(i.data)) + "</td><td>" + esc(i.orgao) + "</td><td>" + esc(i.municipio ? i.municipio + "/" + i.uf : i.uf) + "</td><td>" + esc(i.fornecedor) + "</td><td>" + esc(i.tipo) + "</td><td>" +
      (i.link ? '<a href="' + esc(i.link) + '">' + esc(i.link) + "</a>" : "—") + "</td>" + (motivo !== undefined ? "<td>" + esc(motivo) + "</td>" : "") + "</tr>";
  }
  function relatorioHtml(pesq, info) {
    info = info || {};
    var st = pesq.referencia.stats, dtc = s(pesq.consultadoEm).slice(0, 10), hora = s(pesq.consultadoEm).slice(11, 16);
    var cab = "<tr><th>Descrição</th><th>Un.</th><th>Valor unit.</th><th>Data</th><th>Órgão</th><th>Local</th><th>Fornecedor</th><th>Tipo</th><th>Fonte (link)</th>";
    var h = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pesquisa de preços — ' + esc(pesq.params.q) + "</title><style>" +
      "body{font:12px/1.45 Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #aaa;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}td.n{text-align:right;white-space:nowrap}.k td{font-weight:bold}.aviso{border:1px solid #b45309;padding:6px;margin:8px 0}@media print{a{color:#000;text-decoration:none}}</style></head><body>" +
      "<h1>Pesquisa de preços — contratações públicas similares</h1><div>Lei 14.133/2021, art. 23, § 1º, inciso II (contratações similares da Administração Pública). Consulta feita em <b>" + esc(brDeIso(dtc)) + (hora ? " às " + esc(hora) : "") + "</b>.</div>" +
      (info.processo ? "<div>Processo: <b>" + esc(info.processo) + "</b></div>" : "") + (info.objeto ? "<div>Objeto: " + esc(info.objeto) + "</div>" : "") +
      "<h2>1. Parâmetros da consulta</h2><table><tr><td>Termo pesquisado</td><td>" + esc(pesq.params.q) + "</td></tr><tr><td>UF</td><td>" + esc(pesq.params.uf || "todas") + "</td></tr><tr><td>Período (data do contrato/ata)</td><td>" + esc(pesq.params.desde ? brDeIso(pesq.params.desde) : "—") + " a " + esc(pesq.params.ate ? brDeIso(pesq.params.ate) : "—") + "</td></tr>" +
      "<tr><td>Fonte</td><td>CertamePRO — preços públicos de atas e contratos<br>" + esc(pesq.url) + "</td></tr>" +
      "<tr><td>Regra de descarte</td><td>" + esc(pesq.regraTexto) + "</td></tr><tr><td>Método do preço de referência</td><td>" + esc(pesq.referencia.metodo || pesq.regra.metodo) + "</td></tr></table>" +
      "<h2>2. Resultado</h2><table><tr><th>Preços coletados</th><th>Utilizados</th><th>Descartados</th><th>Mínimo</th><th>Mediana</th><th>Média</th><th>Máximo</th><th>Preço de referência (" + esc(pesq.referencia.metodo || "") + ")</th></tr>" +
      '<tr class="k"><td>' + pesq.itens.length + "</td><td>" + pesq.mantidos.length + "</td><td>" + pesq.descartados.length + '</td><td class="n">' + moeda(st.minimo) + '</td><td class="n">' + moeda(st.mediana) + '</td><td class="n">' + moeda(st.media) + '</td><td class="n">' + moeda(st.maximo) + '</td><td class="n">' + moeda(pesq.referencia.valor) + "</td></tr></table>" +
      (pesq.invalidos ? "<p>" + pesq.invalidos + " registro(s) do serviço sem valor unitário utilizável foram ignorados.</p>" : "") +
      "<h2>3. Preços utilizados</h2><table>" + cab + "</tr>" + pesq.mantidos.map(function (i) { return linhaHtml(i); }).join("") + "</table>" +
      (pesq.descartados.length ? "<h2>4. Preços descartados (e por quê)</h2><table>" + cab + "<th>Motivo</th></tr>" + pesq.descartados.map(function (d) { return linhaHtml(d.item, d.motivo); }).join("") + "</table>" : "") +
      '<div class="aviso">Os valores acima são os registrados nas fontes públicas indicadas e podem ter sido atualizados depois da consulta; a conferência dos links faz parte da pesquisa. Este relatório não substitui a análise e a motivação da autoridade competente.</div>' +
      "<p>Responsável pela pesquisa: " + esc(info.responsavel || "[PREENCHER]") + " — Cargo/matrícula: " + esc(info.cargo || "[PREENCHER]") + "<br>Data e assinatura: ____________________</p></body></html>";
    return h;
  }

  /* planilha do mapa de preços (ExcelJS por parâmetro, testável em Node) */
  function construirXlsx(ExcelJS, pesq) {
    var wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Mapa de preços"), st = pesq.referencia.stats;
    ws.addRow(["Pesquisa de preços — Lei 14.133/2021, art. 23, § 1º, II"]).font = { bold: true, size: 13 };
    ws.addRow(["Consulta em", brDeIso(s(pesq.consultadoEm).slice(0, 10)) + " " + s(pesq.consultadoEm).slice(11, 16)]);
    ws.addRow(["Termo", pesq.params.q, "UF", pesq.params.uf || "todas"]);
    ws.addRow(["Fonte", pesq.url]);
    ws.addRow(["Regra de descarte", pesq.regraTexto]);
    ws.addRow([]);
    var cab = ws.addRow(["Situação", "Descrição", "Un.", "Valor unit. (R$)", "Data", "Órgão", "UF", "Município", "Fornecedor", "Tipo", "Fonte (link)", "Motivo do descarte"]); cab.font = { bold: true };
    function lin(i, sit, mot) { ws.addRow([sit, i.descricao, i.unidade, i.valor, i.data, i.orgao, i.uf, i.municipio, i.fornecedor, i.tipo, i.link, mot || ""]); }
    pesq.mantidos.forEach(function (i) { lin(i, "usado"); });
    pesq.descartados.forEach(function (d) { lin(d.item, "descartado", d.motivo); });
    var ult = ws.rowCount, ini = ult - pesq.itens.length + 1;
    ws.addRow([]);
    /* estatística com FÓRMULA viva sobre os preços USADOS (as linhas 'usado' vêm primeiro) */
    var fim = ini + pesq.mantidos.length - 1;
    if (pesq.mantidos.length) {
      ws.addRow(["Mínimo", "", "", { formula: "MIN(D" + ini + ":D" + fim + ")", result: st.minimo }]);
      ws.addRow(["Mediana", "", "", { formula: "MEDIAN(D" + ini + ":D" + fim + ")", result: st.mediana }]);
      ws.addRow(["Média", "", "", { formula: "AVERAGE(D" + ini + ":D" + fim + ")", result: st.media }]);
      ws.addRow(["Máximo", "", "", { formula: "MAX(D" + ini + ":D" + fim + ")", result: st.maximo }]);
    }
    ws.getColumn(2).width = 48; ws.getColumn(4).width = 16; ws.getColumn(6).width = 30; ws.getColumn(11).width = 50; ws.getColumn(12).width = 50;
    ws.getColumn(4).numFmt = "#,##0.00";
    return wb;
  }


  /* ---- «Usar no processo»: preços ACEITOS → fontes do passo de pesquisa do CPLPRO ----
     ⚠ Entram como «contratacao_similar» (art. 23, § 1º, II / § 2º, III conforme o regulamento do processo), que é o que atas e contratos de
     outros órgãos são. Cada fonte leva órgão, local, fornecedor, data do registro, link, a DATA DA CONSULTA e a REGRA DE DESCARTE (em origem/obs).
     ⚠ dataConclusao recebe a data do REGISTRO (ata/contrato): o serviço não informa a conclusão, então é uma aproximação declarada — o
        passo de pesquisa continua validando a janela de 1 ano e a pessoa confere no link.
     ⚠ fatorAtualizacao NÃO é inventado: vem do que a pessoa informa (1,0000 = sem atualização) — o regulamento exige índice nesse tipo de fonte.
     ⚠ SEM DUPLICAR: cada fonte leva uma chave (link|órgão|data|valor|unidade); clicar duas vezes (ou consultar de novo) não repete. */
  function chaveFonte(i) { return "pp|" + [s(i.link), s(i.orgao), s(i.data), (typeof i.valor === "number" ? i.valor.toFixed(2) : ""), s(i.unidade).toLowerCase()].join("|"); }
  function fontesParaProcesso(pesq, opts) {
    opts = opts || {};
    var un = s(opts.unidade).toLowerCase(), fator = typeof opts.fator === "number" && opts.fator > 0 ? opts.fator : 1;
    var dtc = s(pesq.consultadoEm).slice(0, 10), fontes = [], outraUnidade = 0;
    arr(pesq.mantidos).forEach(function (i) {
      if (un && s(i.unidade).toLowerCase() !== un) { outraUnidade++; return; }
      var local = i.municipio ? i.municipio + "/" + i.uf : i.uf;
      fontes.push({ tipo: "contratacao_similar", valor: i.valor, link: i.link || null, dataConclusao: i.data || null, fatorAtualizacao: fator,
        fornecedor: [i.orgao, local].filter(Boolean).join(" — ") + "; " + (i.fornecedor || "fornecedor não informado") + " (" + i.tipo + (i.data ? " de " + brDeIso(i.data) : "") + "; consulta CertamePRO em " + brDeIso(dtc) + ")",
        origem: { sistema: "CertamePRO — preços públicos", chave: chaveFonte(i), consultadoEm: pesq.consultadoEm, url: pesq.url, termo: s(pesq.params && pesq.params.q),
          regraDescarte: pesq.regraTexto, metodo: pesq.regra ? pesq.regra.metodo : "", orgao: i.orgao, tipoRegistro: i.tipo, dataRegistro: i.data } });
    });
    return { fontes: fontes, outraUnidade: outraUnidade };
  }
  function mesclarFontes(existentes, novas) {
    var tem = {}, out = arr(existentes).slice(), add = 0, repetidas = 0;
    out.forEach(function (f) { if (f && f.origem && f.origem.chave) tem[f.origem.chave] = 1; });
    arr(novas).forEach(function (f) { if (f.origem && tem[f.origem.chave]) { repetidas++; return; } tem[f.origem.chave] = 1; out.push(f); add++; });
    return { fontes: out, adicionadas: add, repetidas: repetidas };
  }

  global.PrecosPub = { fontesParaProcesso: fontesParaProcesso, mesclarFontes: mesclarFontes, chaveFonte: chaveFonte, ENDPOINT: ENDPOINT, REGRA_PADRAO: REGRA_PADRAO, TTL_MS: TTL_MS, INTERVALO_MIN_MS: INTERVALO_MIN_MS,
    montarUrl: montarUrl, lerResposta: lerResposta, normalizarItem: normalizarItem, estatistica: estatistica, consultar: consultar, aplicarRegra: aplicarRegra,
    precoReferencia: precoReferencia, filtrar: filtrar, atasVigentes: atasVigentes, montarPesquisa: montarPesquisa, comparar: comparar,
    relatorioHtml: relatorioHtml, construirXlsx: construirXlsx, addMeses: addMeses, moeda: moeda, brDeIso: brDeIso, isoDe: isoDe,
    _reset: function () { _ultima = 0; _voo = {}; } };
  if (typeof module !== "undefined" && module.exports) module.exports = global.PrecosPub;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

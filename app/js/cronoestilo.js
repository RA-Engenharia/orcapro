/* =====================================================================
 * cronoestilo.js — ESTILOS DE CRONOGRAMA (motor puro; 14/11/2026, prévia ?previa=motor)
 *
 * POR QUE ISTO EXISTE. O cronograma que sai nos documentos era um só: a tabela físico-financeira do órgão público. Obra
 * residencial quer barras por mês e a parcela de cada etapa; obra industrial quer o Gantt de verdade, com dependência e
 * caminho crítico. O motor de prazo é um só (js/cronograma.js) — aqui mora só a APRESENTAÇÃO:
 *   "oficial"  físico-financeiro tabular, sem barras (prefeitura, edital): etapas × meses, % e R$ por período, total,
 *              acumulado, assinatura do responsável técnico;
 *   "simples"  uma barra por mês em que a etapa trabalha, com a parcela em R$ (residencial, reforma, condomínio);
 *   "gantt"    estilo MS Project: tabela à esquerda (nº, tarefa com recuo, duração, início, término, predecessoras, %),
 *              linha do tempo mês/semana, barra de atividade com preenchimento do %, barra-resumo da etapa com pontas,
 *              marco em losango, caminho crítico em vermelho, linha de hoje, setas de dependência, físico-financeiro e
 *              curva S embaixo (comercial, industrial).
 *
 * ⚠ NÃO RECALCULA PRAZO. As datas, as dependências, as folgas e o caminho crítico vêm de Cronograma.estimar (js/cronograma.js);
 *   o desembolso por mês vem de Orcamento.cronograma (a mesma distribuição que a tela e o pacote usam). Aqui só se
 *   arredonda ao centavo (o último mês de cada etapa fecha o total dela) e se desenha.
 * ⚠ ATIVIDADES (nível abaixo da etapa, só no Gantt): são os itens da etapa dispostos em sequência DENTRO da janela da etapa,
 *   com o peso do esforço estimado do próprio motor (Cronograma.estimarItem). Não criam prazo novo nem mexem no da etapa.
 * ⚠ % CONCLUÍDO vem de `opts.avanco` ({ etapaId: 0..100 }); sem ele, 0. Nada é inventado.
 * Saídas: HTML/SVG (PDF e documentos) e linhas de ExcelJS (preenchimento de células finas). ES5 de propósito.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ESTILOS = [
    { id: "oficial", nome: "Oficial (físico-financeiro tabular)", desc: "Etapas × meses, com % e R$ por período, total, acumulado e assinatura do responsável técnico. Sem barras." },
    { id: "simples", nome: "Simples (barras por mês e parcela)", desc: "Uma barra por mês em que a etapa trabalha, com o valor da parcela." },
    { id: "gantt", nome: "Gantt (estilo MS Project)", desc: "Tarefas, predecessoras, caminho crítico, % concluído, físico-financeiro e curva S." }
  ];
  /* estilo de partida de cada perfil (js/saidas.js guarda o mesmo, para a tela; aqui é o reserva) */
  var PADRAO_PERFIL = { prefeitura: "oficial", edital: "oficial", industrial: "gantt", comercial: "gantt", residencial: "simples", reforma: "simples", condominio: "simples" };

  var MESR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var COR = { barra: "#4f81bd", feito: "#1f3864", critica: "#e06666", criticaFeito: "#c00000", resumo: "#111827", linha: "#cbd5e1", hoje: "#dc2626", marco: "#111827", seta: "#475569", faixa: "#f1f5f9" };

  function s(v) { return String(v == null ? "" : v); }
  function esc(v) { return s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function arr2(v) { return Math.round((Number(v) || 0) * 100 + (v < 0 ? -1e-9 : 1e-9)) / 100; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function dep(nome) {
    if (global[nome]) return global[nome];
    var arq = { Cronograma: "cronograma", Orcamento: "orcamento" }[nome];
    try { if (typeof require === "function" && arq) return require("./" + arq + ".js"); } catch (e) { /* sem o módulo */ }
    return null;
  }
  function moeda(v) { return (Math.round(num(v) * 100) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function pc(v) { return (Math.round(num(v) * 100) / 100).toFixed(2).replace(".", ",") + "%"; }
  function dia(d) { return d ? ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + String(d.getFullYear()).slice(2) : ""; }
  function meiaNoite(v) {
    var d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function somaDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function segunda(d) { return somaDias(d, -((d.getDay() + 6) % 7)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------------------------------------------------------------------
   * MODELO — a linha do tempo normalizada, a mesma para os três estilos.
   * opts: { hoje, avanco:{etapaId:pct}, atividades:bool, marcoFinal:bool, valores:[total por etapa, na ordem], meses }
   * Devolve { ok, erro } ou { ok:true, linhas, meses, semanas, fin, total, dataInicio, dataFim, hoje, deps, critico:[ids], origem }
   * --------------------------------------------------------------------- */
  function modelo(orc, opts) {
    opts = opts || {};
    var C = dep("Cronograma"), O = dep("Orcamento");
    if (!C || !C.estimar || !O || !O.cronograma) return { ok: false, erro: "O motor de cronograma não está disponível." };
    if (!orc || !orc.etapas || !orc.etapas.length) return { ok: false, erro: "O orçamento não tem etapas." };
    var r;
    try { r = C.estimar(orc); } catch (e) { r = null; }
    if (!r || !r.etapas || r.etapas.length !== orc.etapas.length) return { ok: false, erro: "O orçamento não tem cronograma elaborado (durações e dependências das etapas)." };
    if (r.temCiclo) return { ok: false, erro: "As dependências das etapas formam um ciclo." };
    var cr = O.cronograma(orc, opts.meses);
    if (!cr || cr.etapas.length !== r.etapas.length) return { ok: false, erro: "O desembolso por mês não fechou com as etapas." };
    var nM = cr.meses;
    var avanco = opts.avanco || {};
    var hoje = meiaNoite(opts.hoje || new Date());

    /* ---- financeiro: o último mês de cada etapa fecha o total dela ao centavo ---- */
    var totais = [];
    r.etapas.forEach(function (e, i) { totais.push(opts.valores && opts.valores[i] != null ? arr2(opts.valores[i]) : arr2(cr.etapas[i].total)); });
    var finLinhas = [];
    r.etapas.forEach(function (e, i) {
      var ms = cr.etapas[i].meses.slice(0, nM), soma = ms.reduce(function (a, v) { return a + num(v); }, 0), tot = totais[i], pcts = [], vals = [], ac = 0, k;
      for (k = 0; k < nM; k++) pcts.push(soma > 0 ? num(ms[k]) / soma : (k === 0 ? 1 : 0));
      for (k = 0; k < nM; k++) { var v = k === nM - 1 ? arr2(tot - ac) : arr2(tot * pcts[k]); vals.push(v); ac = arr2(ac + v); }
      finLinhas.push({ numero: String(i + 1), nome: s(e.nome), total: tot, pcts: pcts, valores: vals });
    });
    var total = 0, fm = [], ac2 = 0, k2;
    totais.forEach(function (t) { total = arr2(total + t); });
    for (k2 = 0; k2 < nM; k2++) {
      var sv = 0; finLinhas.forEach(function (l) { sv += l.valores[k2]; }); sv = arr2(sv); ac2 = arr2(ac2 + sv);
      fm.push({ valor: sv, pct: total > 0 ? sv / total * 100 : 0, acumValor: ac2, acumPct: total > 0 ? ac2 / total * 100 : 0 });
    }

    /* ---- linhas: etapa (resumo), atividade e marco ---- */
    var numPorId = {}, linhas = [], deps = [], primeira = {}, ultima = {};
    r.etapas.forEach(function (e, i) { numPorId[e.id] = String(i + 1); });
    r.etapas.forEach(function (e, i) {
      var ini = meiaNoite(e.dataInicio), fim = meiaNoite(e.dataFim), pct = clamp(num(avanco[e.id]), 0, 100);
      if (!ini || !fim) return;
      if (fim < ini) fim = ini;
      var marco = !!e.marco || num(e.duracao) === 0;
      var preds = (e.preds || []).map(function (id) { return numPorId[id]; }).filter(Boolean);
      var linhaE = { id: e.id, numero: String(i + 1), nome: s(e.nome), nivel: 0, tipo: marco ? "marco" : "etapa", duracao: num(e.duracao), inicio: ini, fim: fim, preds: preds.join(";"), predIds: (e.preds || []).slice(),
        pct: pct, critico: !!e.critico, folga: num(e.folga), valor: totais[i], etapaIdx: i };
      linhas.push(linhaE);
      primeira[e.id] = linhas.length - 1; ultima[e.id] = linhas.length - 1;
      if (opts.atividades && !marco) {
        var itens = (orc.etapas[i].itens || []).filter(function (it) { return it; }), pesos = [], somaP = 0, MAX = 10, rotulos = [];
        itens.forEach(function (it) { var w = 1; try { w = Math.max(0.01, num(C.estimarItem(it, r.params).equipeDias)); } catch (e2) { w = 1; } pesos.push(w); rotulos.push(s(it.descricao)); });
        if (itens.length > MAX) {   /* o excedente vira uma linha só: o Gantt não vira lista de 80 itens */
          var resto = pesos.slice(MAX - 1).reduce(function (a, b) { return a + b; }, 0);
          pesos = pesos.slice(0, MAX - 1).concat([resto]); rotulos = rotulos.slice(0, MAX - 1).concat(["Demais serviços (" + (itens.length - MAX + 1) + ")"]);
        }
        somaP = pesos.reduce(function (a, b) { return a + b; }, 0);
        var span = fim - ini, cum = 0, n = pesos.length, a;
        for (a = 0; a < n; a++) {
          var f0 = cum / somaP, f1 = (cum + pesos[a]) / somaP; cum += pesos[a];
          var ia = new Date(ini.getTime() + span * f0), fa = new Date(ini.getTime() + span * f1);
          ia = meiaNoite(ia); fa = meiaNoite(fa); if (fa < ia) fa = ia;
          var p0 = pct / 100 * somaP, acumAntes = cum - pesos[a];
          var pa = clamp((p0 - acumAntes) / pesos[a], 0, 1) * 100;
          linhas.push({ id: e.id + "~a" + a, numero: (i + 1) + "." + (a + 1), nome: rotulos[a], nivel: 1, tipo: "atividade", duracao: Math.max(1, Math.round(num(e.duracao) * pesos[a] / somaP)), inicio: ia, fim: fa,
            preds: a === 0 ? "" : (i + 1) + "." + a, predIds: [], pct: pa, critico: !!e.critico, folga: num(e.folga), valor: null, etapaIdx: i, paiId: e.id });
          if (a === 0) primeira[e.id] = linhas.length - 1;
          ultima[e.id] = linhas.length - 1;
          if (a > 0) deps.push({ de: linhas.length - 2, para: linhas.length - 1, critico: !!e.critico });
        }
      }
    });
    /* dependências entre etapas: da última linha da predecessora à primeira da sucessora */
    linhas.slice().forEach(function (L) {
      if (L.nivel !== 0) return;
      (L.predIds || []).forEach(function (pid) {
        if (ultima[pid] == null) return;
        var iL = linhas.indexOf(L), de = ultima[pid], para = (linhas[iL + 1] && linhas[iL + 1].paiId === L.id) ? iL + 1 : iL;
        var peCrit = !!(L.critico && linhas[de].critico);
        deps.push({ de: de, para: para, critico: peCrit });
      });
    });
    var dI = meiaNoite(r.dataInicio), dF = meiaNoite(r.dataFim);
    var ultimaFim = linhas.reduce(function (m, L) { return L.fim > m ? L.fim : m; }, dI);
    if (ultimaFim > dF) dF = ultimaFim;
    if (opts.marcoFinal !== false && opts.atividades) {
      var crit = linhas.filter(function (L) { return L.nivel === 0 && L.critico; }), ult = crit.length ? crit[crit.length - 1] : linhas[linhas.length - 1];
      linhas.push({ id: "~fim", numero: String(r.etapas.length + 1), nome: "Entrega da obra", nivel: 0, tipo: "marco", duracao: 0, inicio: dF, fim: dF, preds: ult ? ult.numero : "", predIds: [], pct: 0, critico: true, folga: 0, valor: null, etapaIdx: -1 });
      if (ult) deps.push({ de: ultima[ult.id], para: linhas.length - 1, critico: true });
    }

    /* ---- eixo do tempo: meses (do 1º ao último) e semanas (segundas-feiras) ---- */
    var meses = [], semanas = [], d0 = new Date(dI.getFullYear(), dI.getMonth(), 1), dN = new Date(dF.getFullYear(), dF.getMonth() + 1, 1);
    for (var md = d0; md < dN; md = new Date(md.getFullYear(), md.getMonth() + 1, 1)) {
      meses.push({ rotulo: MESR[md.getMonth()] + "/" + String(md.getFullYear()).slice(2), ini: md, fim: new Date(md.getFullYear(), md.getMonth() + 1, 1) });
    }
    for (var sd = segunda(dI); sd <= dF || semanas.length < 1; sd = somaDias(sd, 7)) { var qui = somaDias(sd, 3); semanas.push({ ini: sd, fim: somaDias(sd, 7), mes: qui.getFullYear() * 12 + qui.getMonth() }); }   /* o mês da semana é o da quinta-feira (a maioria dos dias) */
    return { ok: true, linhas: linhas, deps: deps, meses: meses, semanas: semanas, dataInicio: dI, dataFim: dF, hoje: hoje, total: total,
      fin: { rotulos: cr.rotulos || [], linhas: finLinhas, totais: fm, nMeses: nM, total: total }, critico: r.caminhoCritico.slice(), totalDias: r.totalDias,
      origem: cr.base === "gantt" ? "Gantt do orçamento (js/cronograma.js)" : "distribuição proporcional (o orçamento não tem Gantt elaborado)", base: cr.base };
  }

  function estiloValido(e) { return e === "oficial" || e === "simples" || e === "gantt"; }
  function padraoDoPerfil(id) { return PADRAO_PERFIL[id] || "oficial"; }
  /* documentos TÉCNICOS internos (relatório executivo, planejamento) usam sempre o Gantt: quem os lê quer dependência e caminho crítico.
     O Gantt de planejamento deles é o do js/cronopdf.js (nível de serviço e subetapa); este é o do orçamento (nível de etapa/atividade). */
  function estiloDoDocumento(tipo) { return (tipo === "relatorioExecutivo" || tipo === "planejamento" || tipo === "tecnico") ? "gantt" : null; }

  /* ---------------------------------------------------------------------
   * HTML — oficial e simples (tabelas) e gantt (SVG)
   * --------------------------------------------------------------------- */
  var CSS_BASE = ".ce{font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:9pt}.ce h2{font-size:12pt;margin:0 0 6px}" +
    ".ce table{border-collapse:collapse;width:100%}.ce th,.ce td{border:1px solid #94a3b8;padding:2px 4px}.ce th{background:#e5e7eb;font-weight:700;text-align:center}" +
    ".ce td.n{text-align:right;white-space:nowrap}.ce tr.tt td{font-weight:700;background:#f3f4f6}.ce .nota{font-size:8pt;color:#475569;margin:6px 0}" +
    ".ce td.bar{background:#4f81bd;color:#fff;text-align:center}.ce .ass{margin-top:22px;display:flex;gap:40px}.ce .ass div{border-top:1px solid #111827;padding-top:3px;min-width:220px;font-size:8.5pt}";

  function rotMes(m, i) { return m.fin.rotulos && m.fin.rotulos[i] ? m.fin.rotulos[i] : (i + 1) + "º mês"; }

  function htmlOficial(m, o) {
    o = o || {};
    var f = m.fin, h = '<div class="ce ce-oficial"><style>' + CSS_BASE + '</style><h2>Cronograma físico-financeiro</h2><table><thead><tr><th>ITEM</th><th>ETAPA</th><th>VALOR (R$)</th>', i;
    for (i = 0; i < f.nMeses; i++) h += '<th>' + esc(rotMes(m, i)) + '</th>';
    h += '<th>TOTAL (R$)</th></tr></thead><tbody>';
    f.linhas.forEach(function (l) {
      h += '<tr><td style="text-align:center">' + esc(l.numero) + '</td><td>' + esc(l.nome) + '</td><td class="n">' + moeda(l.total) + '</td>';
      for (i = 0; i < f.nMeses; i++) h += '<td class="n" style="font-size:7.5pt">' + pc(l.pcts[i] * 100) + '<br>' + moeda(l.valores[i]) + '</td>';
      h += '<td class="n">' + moeda(l.total) + '</td></tr>';
    });
    h += '<tr class="tt"><td></td><td>TOTAL</td><td class="n">' + moeda(f.total) + '</td>';
    for (i = 0; i < f.nMeses; i++) h += '<td class="n" style="font-size:7.5pt">' + pc(f.totais[i].pct) + '<br>' + moeda(f.totais[i].valor) + '</td>';
    h += '<td class="n">' + moeda(f.total) + '</td></tr><tr><td></td><td>Acumulado</td><td></td>';
    for (i = 0; i < f.nMeses; i++) h += '<td class="n" style="font-size:7.5pt">' + pc(f.totais[i].acumPct) + '<br>' + moeda(f.totais[i].acumValor) + '</td>';
    h += '<td></td></tr></tbody></table><p class="nota">Origem: ' + esc(m.origem) + '. Em cada mês, o percentual físico da etapa e o valor financeiro; o último mês fecha o total da etapa.</p>';
    var rt = o.rt || {};
    h += '<div class="ass"><div>' + esc(rt.nome || "{rt.nome}") + '<br>Responsável técnico<br>CREA/CAU: ' + esc(rt.registro || "{rt.crea}") + ' · ' + esc(rt.tipoArt || "ART/RRT") + ': ' + esc(rt.art || "{rt.art}") + '</div></div></div>';
    return h;
  }

  function htmlSimples(m, o) {
    var f = m.fin, h = '<div class="ce ce-simples"><style>' + CSS_BASE + '</style><h2>Cronograma de execução e desembolso</h2><table><thead><tr><th>ETAPA</th><th>VALOR (R$)</th>', i;
    for (i = 0; i < f.nMeses; i++) h += '<th>' + esc(rotMes(m, i)) + '</th>';
    h += '</tr></thead><tbody>';
    f.linhas.forEach(function (l) {
      h += '<tr><td>' + esc(l.numero + " " + l.nome) + '</td><td class="n">' + moeda(l.total) + '</td>';
      for (i = 0; i < f.nMeses; i++) h += l.valores[i] > 0 ? '<td class="bar n" style="font-size:7.5pt">' + moeda(l.valores[i]) + '</td>' : '<td></td>';
      h += '</tr>';
    });
    h += '<tr class="tt"><td>Parcela do mês</td><td class="n">' + moeda(f.total) + '</td>';
    for (i = 0; i < f.nMeses; i++) h += '<td class="n" style="font-size:7.5pt">' + moeda(f.totais[i].valor) + '</td>';
    h += '</tr><tr><td>Acumulado</td><td></td>';
    for (i = 0; i < f.nMeses; i++) h += '<td class="n" style="font-size:7.5pt">' + pc(f.totais[i].acumPct) + '</td>';
    h += '</tr></tbody></table>' + (o && o.desembolso === false ? '' : '<p class="nota">A barra marca os meses em que a etapa trabalha, com a parcela a pagar. Origem: ' + esc(m.origem) + '.</p>') + '</div>';
    return h;
  }

  /* SVG do Gantt. Devolve { svg, largura, altura } (unidades do viewBox, em px a 96 dpi). */
  function svgGantt(m, o) {
    o = o || {};
    var L = m.linhas, nS = m.semanas.length, RH = 22, HH = 18;
    var cols = [["Nº", 34], ["Tarefa", 250], ["Duração", 52], ["Início", 62], ["Término", 62], ["Predec.", 62], ["% concl.", 50]], W0 = cols.reduce(function (a, c) { return a + c[1]; }, 0);
    var wk = clamp(Math.floor(900 / Math.max(1, nS)), 8, 26), W = W0 + nS * wk + 12, Ht = HH * 2 + L.length * RH, t0 = m.semanas[0].ini.getTime(), MS = 86400000 * 7;
    function xDe(d) { return W0 + (d.getTime() - t0) / MS * wk; }
    var g = '', i, x = 0;
    var hoje = o.hoje === false ? null : (o.hoje ? meiaNoite(o.hoje) : m.hoje);
    g += '<defs><marker id="ceseta" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="' + COR.seta + '"/></marker>' +
      '<marker id="cesetaC" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="' + COR.criticaFeito + '"/></marker></defs>';
    /* cabeçalho da tabela */
    cols.forEach(function (c) {
      g += '<rect x="' + x + '" y="0" width="' + c[1] + '" height="' + (HH * 2) + '" fill="#e5e7eb" stroke="#94a3b8"/><text x="' + (x + c[1] / 2) + '" y="' + (HH + 4) + '" text-anchor="middle" font-size="10" font-weight="700">' + esc(c[0]) + '</text>';
      x += c[1];
    });
    /* meses (por semanas) e semanas */
    var ini = 0;
    while (ini < nS) {
      var fim = ini; while (fim + 1 < nS && m.semanas[fim + 1].mes === m.semanas[ini].mes) fim++;
      var dm = new Date(Math.floor(m.semanas[ini].mes / 12), m.semanas[ini].mes % 12, 1);
      g += '<rect x="' + (W0 + ini * wk) + '" y="0" width="' + ((fim - ini + 1) * wk) + '" height="' + HH + '" fill="#e5e7eb" stroke="#94a3b8"/><text x="' + (W0 + (ini + (fim - ini + 1) / 2) * wk) + '" y="13" text-anchor="middle" font-size="10" font-weight="700">' + MESR[dm.getMonth()] + '/' + String(dm.getFullYear()).slice(2) + '</text>';
      ini = fim + 1;
    }
    for (i = 0; i < nS; i++) {
      g += '<rect x="' + (W0 + i * wk) + '" y="' + HH + '" width="' + wk + '" height="' + HH + '" fill="#f3f4f6" stroke="#cbd5e1"/>';
      if (wk >= 14) g += '<text x="' + (W0 + i * wk + wk / 2) + '" y="' + (HH * 2 - 6) + '" text-anchor="middle" font-size="8">' + m.semanas[i].ini.getDate() + '</text>';
    }
    /* linhas */
    L.forEach(function (ln, r) {
      var y = HH * 2 + r * RH, resumo = ln.nivel === 0 && ln.tipo === "etapa" && m.linhas.some(function (z) { return z.paiId === ln.id; }), bg = ln.nivel === 0 ? '#f8fafc' : '#ffffff';
      g += '<rect x="0" y="' + y + '" width="' + W + '" height="' + RH + '" fill="' + bg + '" stroke="' + COR.linha + '" stroke-width="0.5"/>';
      var xx = 0, vals = [ln.numero, ln.nome, ln.tipo === "marco" ? "0 d" : ln.duracao + " d", dia(ln.inicio), dia(ln.fim), ln.preds, ln.tipo === "marco" ? "" : Math.round(ln.pct) + "%"];
      cols.forEach(function (c, ci) {
        var anc = ci === 1 ? "start" : "middle", tx = ci === 1 ? xx + 4 + ln.nivel * 14 : xx + c[1] / 2, nome = vals[ci];
        if (ci === 1 && nome.length > 40 - ln.nivel * 3) nome = nome.slice(0, 38 - ln.nivel * 3) + "…";
        g += '<text x="' + tx + '" y="' + (y + 15) + '" text-anchor="' + anc + '" font-size="9"' + (ln.nivel === 0 ? ' font-weight="700"' : '') + (ln.critico && ci === 1 ? ' fill="' + COR.criticaFeito + '"' : '') + '>' + esc(nome) + '</text>';
        xx += c[1];
      });
      var xa = xDe(ln.inicio), xb = Math.max(xDe(ln.fim), xa + 3), ym = y + RH / 2;
      if (ln.tipo === "marco") {
        g += '<polygon points="' + xa + ',' + (ym - 7) + ' ' + (xa + 7) + ',' + ym + ' ' + xa + ',' + (ym + 7) + ' ' + (xa - 7) + ',' + ym + '" fill="' + (ln.critico ? COR.criticaFeito : COR.marco) + '"/>';
      } else if (resumo) {
        g += '<rect x="' + xa + '" y="' + (ym - 3) + '" width="' + (xb - xa) + '" height="6" fill="' + COR.resumo + '"/>' +
          '<polygon points="' + xa + ',' + (ym + 3) + ' ' + (xa + 7) + ',' + (ym + 3) + ' ' + xa + ',' + (ym + 9) + '" fill="' + COR.resumo + '"/>' +
          '<polygon points="' + xb + ',' + (ym + 3) + ' ' + (xb - 7) + ',' + (ym + 3) + ' ' + xb + ',' + (ym + 9) + '" fill="' + COR.resumo + '"/>';
        if (ln.pct > 0) g += '<rect x="' + xa + '" y="' + (ym - 1) + '" width="' + ((xb - xa) * ln.pct / 100) + '" height="2" fill="#fbbf24"/>';
      } else {
        var cor = ln.critico ? COR.critica : COR.barra, corF = ln.critico ? COR.criticaFeito : COR.feito;
        g += '<rect x="' + xa + '" y="' + (ym - 6) + '" width="' + (xb - xa) + '" height="12" fill="' + cor + '" stroke="' + corF + '" stroke-width="0.7"/>';
        if (ln.pct > 0) g += '<rect x="' + xa + '" y="' + (ym - 6) + '" width="' + ((xb - xa) * ln.pct / 100) + '" height="12" fill="' + corF + '"/>';
      }
    });
    /* setas de dependência (fim da predecessora → início da sucessora) */
    m.deps.forEach(function (d) {
      var a = L[d.de], b = L[d.para]; if (!a || !b) return;
      var ya = HH * 2 + d.de * RH + RH / 2, yb = HH * 2 + d.para * RH + RH / 2, xa = xDe(a.fim), xb = xDe(b.inicio), p;
      if (xb >= xa + 12) p = 'M' + xa + ',' + ya + ' H' + (xa + 6) + ' V' + yb + ' H' + xb;
      else { var ym2 = yb > ya ? ya + RH / 2 : ya - RH / 2; p = 'M' + xa + ',' + ya + ' H' + (xa + 6) + ' V' + ym2 + ' H' + (xb - 6) + ' V' + yb + ' H' + xb; }
      g += '<path d="' + p + '" fill="none" stroke="' + (d.critico ? COR.criticaFeito : COR.seta) + '" stroke-width="0.9" marker-end="url(#' + (d.critico ? 'cesetaC' : 'ceseta') + ')"/>';
    });
    /* hoje */
    if (hoje && hoje >= m.semanas[0].ini && hoje <= m.semanas[nS - 1].fim) {
      var xh = xDe(hoje);
      g += '<line x1="' + xh + '" y1="' + HH + '" x2="' + xh + '" y2="' + Ht + '" stroke="' + COR.hoje + '" stroke-width="1.2" stroke-dasharray="4 3"/><text x="' + (xh + 3) + '" y="' + (HH * 2 + 9) + '" font-size="8" fill="' + COR.hoje + '">Hoje</text>';
    }
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + Ht + '" width="100%" font-family="Arial,Helvetica,sans-serif" class="ce-gantt-svg">' + g + '</svg>', largura: W, altura: Ht };
  }

  /* curva S (acumulado planejado) em SVG */
  function svgCurvaS(m, o) {
    var f = m.fin, W = (o && o.largura) || 520, H = 170, pl = 38, pt = 10, pb = 22, pr = 10, n = f.nMeses, i, g = '';
    function px(k) { return pl + (n === 1 ? 0 : k / (n - 1)) * (W - pl - pr); }
    function py(v) { return pt + (1 - v / 100) * (H - pt - pb); }
    for (i = 0; i <= 4; i++) g += '<line x1="' + pl + '" y1="' + py(i * 25) + '" x2="' + (W - pr) + '" y2="' + py(i * 25) + '" stroke="#e2e8f0"/><text x="' + (pl - 4) + '" y="' + (py(i * 25) + 3) + '" text-anchor="end" font-size="8">' + (i * 25) + '%</text>';
    var pts = ['' + px(0) + ',' + py(0)];
    for (i = 0; i < n; i++) pts.push(px(i + (n === 1 ? 0 : 0)) + ',' + py(f.totais[i].acumPct));
    g += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + COR.feito + '" stroke-width="2"/>';
    for (i = 0; i < n; i++) g += '<circle cx="' + px(i) + '" cy="' + py(f.totais[i].acumPct) + '" r="2.5" fill="' + COR.feito + '"/><text x="' + px(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="8">' + esc(rotMes(m, i)) + '</text>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:' + W + 'px" font-family="Arial,Helvetica,sans-serif" class="ce-curvas">' + g + '</svg>';
  }

  function htmlGantt(m, o) {
    o = o || {};
    var sv = svgGantt(m, o), f = m.fin, i;
    var h = '<div class="ce ce-gantt"><style>' + CSS_BASE + '.ce-gantt .fin td,.ce-gantt .fin th{font-size:7.5pt}</style><h2>Cronograma — ' + esc(o.titulo || "Gantt do orçamento") + '</h2>' + sv.svg +
      '<p class="nota">Barra azul: atividade; preenchida, o % concluído. Barra preta com pontas: resumo da etapa. Losango: marco. <span style="color:' + COR.criticaFeito + '">Vermelho: caminho crítico</span> (dependências em seta). Linha tracejada: hoje. Origem do prazo: ' + esc(m.origem) + '.</p>' +
      '<div style="display:flex;gap:18px;align-items:flex-start"><table class="fin" style="width:auto;flex:1"><thead><tr><th></th>';
    for (i = 0; i < f.nMeses; i++) h += '<th>' + esc(rotMes(m, i)) + '</th>';
    h += '<th>TOTAL</th></tr></thead><tbody><tr><td>Desembolso do mês (R$)</td>';
    for (i = 0; i < f.nMeses; i++) h += '<td class="n">' + moeda(f.totais[i].valor) + '</td>';
    h += '<td class="n">' + moeda(f.total) + '</td></tr><tr><td>% do mês</td>';
    for (i = 0; i < f.nMeses; i++) h += '<td class="n">' + pc(f.totais[i].pct) + '</td>';
    h += '<td class="n">100,00%</td></tr><tr class="tt"><td>Acumulado (R$)</td>';
    for (i = 0; i < f.nMeses; i++) h += '<td class="n">' + moeda(f.totais[i].acumValor) + '</td>';
    h += '<td></td></tr><tr class="tt"><td>% acumulado</td>';
    for (i = 0; i < f.nMeses; i++) h += '<td class="n">' + pc(f.totais[i].acumPct) + '</td>';
    h += '<td></td></tr></tbody></table><div style="flex:0 0 420px"><b style="font-size:8.5pt">Curva S (acumulado planejado)</b><br>' + svgCurvaS(m, { largura: 420 }) + '</div></div></div>';
    return h;
  }

  /* html(modelo, estilo, opts) → fragmento de seção. Estilo inválido → null (quem chama decide; nada de cair em outro). */
  function html(m, estilo, o) {
    if (!m || !m.ok) return "";
    if (estilo === "oficial") return htmlOficial(m, o);
    if (estilo === "simples") return htmlSimples(m, o);
    if (estilo === "gantt") return htmlGantt(m, o);
    return null;
  }
  /* documento completo A3 paisagem (Gantt) para imprimir/PDF; os outros em A4 paisagem */
  function documento(m, estilo, o) {
    var corpo = html(m, estilo, o); if (corpo == null) return "";
    var folha = estilo === "gantt" ? "A3 landscape" : "A4 landscape";
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cronograma</title><style>@page{size:' + folha + ';margin:10mm}body{margin:0;background:#fff}</style></head><body>' + corpo + '</body></html>';
  }

  /* ---------------------------------------------------------------------
   * EXCEL — escreve numa planilha ExcelJS já criada.
   * opts: { linha:1ª linha livre, fonte:"Arial", cabCor:"FF111827", rt:{nome,registro,art,tipoArt}, titulo }
   * Devolve { ultimaLinha, ref:{...} } com as linhas úteis para conferência.
   * --------------------------------------------------------------------- */
  function colL(n) { var r = ""; while (n > 0) { var q = (n - 1) % 26; r = String.fromCharCode(65 + q) + r; n = Math.floor((n - 1) / 26); } return r; }
  function fillS(argb) { return { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; }
  function thin() { var b = { style: "thin", color: { argb: "FFCBD5E1" } }; return { top: b, left: b, bottom: b, right: b }; }
  function hex(c) { return "FF" + s(c).replace("#", "").toUpperCase(); }
  var MOEDA = '"R$" #,##0.00', PCT = '0.00"%"';

  function xlsxOficial(ws, m, o) {
    o = o || {};
    var f = m.fin, n = f.nMeses, fonte = o.fonte || "Arial", cab = o.cabCor || "FF111827", r0 = o.linha || 1, c0 = 4, i, k;
    function put(r, c, v, fmt, bold) { var ce = ws.getCell(r, c); ce.value = v; if (fmt) ce.numFmt = fmt; ce.font = { name: fonte, size: 9, bold: !!bold }; ce.border = thin(); return ce; }
    function head(r, c, t) { var ce = ws.getCell(r, c); ce.value = t; ce.font = { name: fonte, size: 9, bold: true, color: { argb: "FFFFFFFF" } }; ce.fill = fillS(cab); ce.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; ce.border = thin(); }
    var r = r0;
    ws.mergeCells(r, 1, r, 3 + n * 2 + 1); ws.getCell(r, 1).value = o.titulo || "Cronograma físico-financeiro"; ws.getCell(r, 1).font = { name: fonte, size: 12, bold: true }; r += 2;
    head(r, 1, "ITEM"); head(r, 2, "ETAPA"); head(r, 3, "VALOR (R$)");
    for (i = 0; i < n; i++) { ws.mergeCells(r, c0 + i * 2, r, c0 + i * 2 + 1); head(r, c0 + i * 2, f.rotulos[i] || (i + 1) + "º mês"); head(r, c0 + i * 2 + 1, ""); }
    var cTot = c0 + n * 2; head(r, cTot, "TOTAL (R$)");
    r++;
    head(r - 0, 1, ""); head(r, 2, ""); head(r, 3, "");
    for (i = 0; i < n; i++) { head(r, c0 + i * 2, "%"); head(r, c0 + i * 2 + 1, "R$"); }
    head(r, cTot, ""); var rh = r; r++;
    var r1 = r;
    f.linhas.forEach(function (l) {
      put(r, 1, l.numero); put(r, 2, l.nome); put(r, 3, l.total, MOEDA);
      for (k = 0; k < n; k++) {
        var cp = colL(c0 + k * 2), cv = c0 + k * 2 + 1;
        put(r, c0 + k * 2, l.pcts[k], "0.00%").protection = { locked: false };
        var fm = k === n - 1 ? { formula: "$C" + r + "-SUM(" + colL(c0 + 1) + r + (k > 0 ? ":" + colL(c0 + (k - 1) * 2 + 1) + r : "") + ")", result: l.valores[k] } : { formula: "ROUND($C" + r + "*" + cp + r + ",2)", result: l.valores[k] };
        if (k === n - 1 && n === 1) fm = { formula: "$C" + r, result: l.valores[k] };
        else if (k === n - 1) {   /* soma só as colunas de R$ anteriores */
          var parts = []; for (var q = 0; q < k; q++) parts.push(colL(c0 + q * 2 + 1) + r);
          fm = { formula: "$C" + r + "-(" + parts.join("+") + ")", result: l.valores[k] };
        }
        put(r, cv, fm, MOEDA);
      }
      put(r, cTot, { formula: "SUM(" + (function () { var p = []; for (var q = 0; q < n; q++) p.push(colL(c0 + q * 2 + 1) + r); return p.join(","); })() + ")", result: l.total }, MOEDA);
      r++;
    });
    var rT = r;
    put(rT, 1, "", null, true); put(rT, 2, "TOTAL", null, true); put(rT, 3, { formula: "SUM(C" + r1 + ":C" + (rT - 1) + ")", result: f.total }, MOEDA, true);
    for (k = 0; k < n; k++) {
      var cvv = colL(c0 + k * 2 + 1);
      put(rT, c0 + k * 2, { formula: "IFERROR(" + cvv + rT + "/$C" + rT + ",0)", result: f.totais[k].valor / (f.total || 1) }, "0.00%", true);
      put(rT, c0 + k * 2 + 1, { formula: "SUM(" + cvv + r1 + ":" + cvv + (rT - 1) + ")", result: f.totais[k].valor }, MOEDA, true);
    }
    put(rT, cTot, { formula: "SUM(" + colL(cTot) + r1 + ":" + colL(cTot) + (rT - 1) + ")", result: f.total }, MOEDA, true);
    var rA = rT + 1;
    put(rA, 1, ""); put(rA, 2, "Acumulado", null, true); put(rA, 3, "");
    for (k = 0; k < n; k++) {
      var ps = []; for (var q2 = 0; q2 <= k; q2++) ps.push(colL(c0 + q2 * 2 + 1) + rT);
      put(rA, c0 + k * 2, { formula: "IFERROR(" + colL(c0 + k * 2 + 1) + rA + "/$C" + rT + ",0)", result: f.totais[k].acumPct / 100 }, "0.00%");
      put(rA, c0 + k * 2 + 1, { formula: "SUM(" + ps.join(",") + ")", result: f.totais[k].acumValor }, MOEDA);
    }
    put(rA, cTot, "");
    ws.getColumn(1).width = 7; ws.getColumn(2).width = 40; ws.getColumn(3).width = 17;
    for (k = 0; k < n; k++) { ws.getColumn(c0 + k * 2).width = 8; ws.getColumn(c0 + k * 2 + 1).width = 15; }
    ws.getColumn(cTot).width = 17;
    var rr = rA + 3, rt = o.rt || {};
    ws.mergeCells(rr, 2, rr, 3); ws.getCell(rr, 2).value = "_____________________________________"; ws.getCell(rr + 1, 2).value = rt.nome || "{rt.nome}";
    ws.getCell(rr + 2, 2).value = "Responsável técnico — CREA/CAU: " + (rt.registro || "{rt.crea}");
    ws.getCell(rr + 3, 2).value = (rt.tipoArt || "ART/RRT") + ": " + (rt.art || "{rt.art}");
    [rr, rr + 1, rr + 2, rr + 3].forEach(function (q3) { ws.getCell(q3, 2).font = { name: fonte, size: 9 }; });
    ws.getCell(rr + 5, 2).value = "Origem: " + m.origem + ". O último mês de cada etapa fecha o total dela; edite os percentuais e os valores recalculam.";
    ws.getCell(rr + 5, 2).font = { name: fonte, size: 8, italic: true };
    ws.views = [{ state: "frozen", ySplit: rh, xSplit: 3 }];
    return { ultimaLinha: rr + 5, linhaTotal: rT, linhaAcumulado: rA, colTotal: cTot, primeiraLinha: r1, colunaValor: function (k3) { return c0 + k3 * 2 + 1; } };
  }

  function xlsxSimples(ws, m, o) {
    o = o || {};
    var f = m.fin, n = f.nMeses, fonte = o.fonte || "Arial", cab = o.cabCor || "FF111827", barra = hex(o.corBarra || "#4f81bd"), r = o.linha || 1, k;
    function put(rr, c, v, fmt, bold) { var ce = ws.getCell(rr, c); ce.value = v; if (fmt) ce.numFmt = fmt; ce.font = { name: fonte, size: 9, bold: !!bold }; ce.border = thin(); return ce; }
    ws.mergeCells(r, 1, r, 2 + n); ws.getCell(r, 1).value = o.titulo || "Cronograma de execução e desembolso"; ws.getCell(r, 1).font = { name: fonte, size: 12, bold: true }; r += 2;
    var rh = r;
    ["ETAPA", "VALOR (R$)"].forEach(function (t, i) { var ce = put(r, i + 1, t); ce.fill = fillS(cab); ce.font = { name: fonte, size: 9, bold: true, color: { argb: "FFFFFFFF" } }; ce.alignment = { horizontal: "center" }; });
    for (k = 0; k < n; k++) { var ce2 = put(r, 3 + k, f.rotulos[k] || (k + 1) + "º mês"); ce2.fill = fillS(cab); ce2.font = { name: fonte, size: 9, bold: true, color: { argb: "FFFFFFFF" } }; ce2.alignment = { horizontal: "center" }; }
    r++;
    var r1 = r;
    f.linhas.forEach(function (l) {
      put(r, 1, l.numero + " " + l.nome); put(r, 2, l.total, MOEDA);
      for (k = 0; k < n; k++) {
        var ce3 = put(r, 3 + k, l.valores[k] > 0 ? l.valores[k] : null, MOEDA);
        if (l.valores[k] > 0) { ce3.fill = fillS(barra); ce3.font = { name: fonte, size: 8, color: { argb: "FFFFFFFF" } }; }
      }
      r++;
    });
    var rT = r;
    put(rT, 1, "Parcela do mês", null, true); put(rT, 2, { formula: "SUM(B" + r1 + ":B" + (rT - 1) + ")", result: f.total }, MOEDA, true);
    for (k = 0; k < n; k++) put(rT, 3 + k, { formula: "SUM(" + colL(3 + k) + r1 + ":" + colL(3 + k) + (rT - 1) + ")", result: f.totais[k].valor }, MOEDA, true);
    put(rT + 1, 1, "Acumulado (%)"); put(rT + 1, 2, "");
    for (k = 0; k < n; k++) put(rT + 1, 3 + k, { formula: "IFERROR(SUM($C" + rT + ":" + colL(3 + k) + rT + ")/$B" + rT + ",0)", result: f.totais[k].acumPct / 100 }, "0.00%");
    ws.getColumn(1).width = 40; ws.getColumn(2).width = 17; for (k = 0; k < n; k++) ws.getColumn(3 + k).width = 14;
    ws.getCell(rT + 3, 1).value = "A barra marca os meses em que a etapa trabalha, com a parcela a pagar. Origem: " + m.origem + ".";
    ws.getCell(rT + 3, 1).font = { name: fonte, size: 8, italic: true };
    ws.views = [{ state: "frozen", ySplit: rh, xSplit: 2 }];
    return { ultimaLinha: rT + 3, linhaTotal: rT, primeiraLinha: r1, colunaValor: function (k3) { return 3 + k3; } };
  }

  /* Gantt no Excel: tabela à esquerda + uma coluna fina por semana pintada (barra, % concluído, crítico, resumo, marco, hoje)
     + físico-financeiro e curva S (colunas de cor) embaixo, alinhados aos meses. Dependência: coluna "Predec." (setas só no PDF). */
  function xlsxGantt(ws, m, o) {
    o = o || {};
    var L = m.linhas, nS = m.semanas.length, fonte = o.fonte || "Arial", cab = o.cabCor || "FF111827", r = o.linha || 1, i, k;
    var CW = 7, hoje = o.hoje === false ? null : (o.hoje ? meiaNoite(o.hoje) : m.hoje);
    function cel(rr, c, v, ops) {
      var ce = ws.getCell(rr, c); if (v != null) ce.value = v; ops = ops || {};
      ce.font = { name: fonte, size: ops.size || 9, bold: !!ops.bold, color: ops.cor ? { argb: ops.cor } : undefined };
      if (ops.fmt) ce.numFmt = ops.fmt; if (ops.fill) ce.fill = fillS(ops.fill); if (ops.borda !== false) ce.border = thin();
      if (ops.al) ce.alignment = { horizontal: ops.al, vertical: "middle" };
      return ce;
    }
    ws.mergeCells(r, 1, r, CW); ws.getCell(r, 1).value = o.titulo || "Cronograma — Gantt do orçamento"; ws.getCell(r, 1).font = { name: fonte, size: 12, bold: true }; r += 2;
    var rm = r, rs = r + 1, c0 = CW + 1;
    ["Nº", "Tarefa", "Duração", "Início", "Término", "Predec.", "% concl."].forEach(function (t, ix) {
      ws.mergeCells(rm, ix + 1, rs, ix + 1); cel(rm, ix + 1, t, { bold: true, fill: cab, cor: "FFFFFFFF", al: "center" }); cel(rs, ix + 1, null, { fill: cab });
    });
    var ini = 0;
    while (ini < nS) {
      var fim = ini; while (fim + 1 < nS && m.semanas[fim + 1].mes === m.semanas[ini].mes) fim++;
      var dm = new Date(Math.floor(m.semanas[ini].mes / 12), m.semanas[ini].mes % 12, 1);
      if (fim > ini) ws.mergeCells(rm, c0 + ini, rm, c0 + fim);
      cel(rm, c0 + ini, MESR[dm.getMonth()] + "/" + String(dm.getFullYear()).slice(2), { bold: true, fill: "FFE5E7EB", al: "center", size: 8 });
      for (k = ini + 1; k <= fim; k++) cel(rm, c0 + k, null, { fill: "FFE5E7EB" });
      ini = fim + 1;
    }
    for (i = 0; i < nS; i++) { cel(rs, c0 + i, m.semanas[i].ini.getDate(), { size: 7, fill: "FFF3F4F6", al: "center" }); ws.getColumn(c0 + i).width = 2.6; }
    var r1 = rs + 1, anyHoje = false;
    L.forEach(function (ln, ix) {
      var rr = r1 + ix, resumo = ln.nivel === 0 && ln.tipo === "etapa" && L.some(function (z) { return z.paiId === ln.id; });
      var nome = (ln.nivel ? "      " : "") + ln.nome, cor = ln.critico ? "FFC00000" : undefined;
      cel(rr, 1, ln.numero, { al: "center", bold: ln.nivel === 0 }); cel(rr, 2, nome, { bold: ln.nivel === 0, cor: cor });
      cel(rr, 3, ln.tipo === "marco" ? "0 d" : ln.duracao + " d", { al: "center" }); cel(rr, 4, ln.inicio, { fmt: "dd/mm/yy", al: "center" }); cel(rr, 5, ln.fim, { fmt: "dd/mm/yy", al: "center" });
      cel(rr, 6, ln.preds, { al: "center" }); cel(rr, 7, ln.tipo === "marco" ? null : ln.pct / 100, { fmt: "0%", al: "center" });
      var bIni = ln.inicio.getTime(), bFim = Math.max(ln.fim.getTime(), bIni + 86400000), lim = bIni + (bFim - bIni) * ln.pct / 100;
      for (i = 0; i < nS; i++) {
        var w0 = m.semanas[i].ini.getTime(), w1 = m.semanas[i].fim.getTime(), c = cel(rr, c0 + i, null, { borda: false });
        c.border = { left: { style: "hair", color: { argb: "FFE2E8F0" } }, right: { style: "hair", color: { argb: "FFE2E8F0" } }, bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
        if (ln.tipo === "marco") { if (bIni >= w0 && bIni < w1) { c.value = "◆"; c.font = { name: fonte, size: 10, bold: true, color: { argb: ln.critico ? "FFC00000" : "FF111827" } }; c.alignment = { horizontal: "center" }; } }
        else if (bFim > w0 && bIni < w1) {
          var meio = (Math.max(w0, bIni) + Math.min(w1, bFim)) / 2;
          if (resumo) c.fill = fillS("FF111827");
          else if (meio <= lim) c.fill = fillS(ln.critico ? "FFC00000" : "FF1F3864");
          else c.fill = fillS(ln.critico ? "FFE06666" : "FF4F81BD");
        }
        if (hoje && hoje.getTime() >= w0 && hoje.getTime() < w1) { c.border = { left: { style: "medium", color: { argb: "FFDC2626" } }, right: c.border.right, bottom: c.border.bottom }; anyHoje = true; }
      }
    });
    var rF = r1 + L.length + 1, f = m.fin;
    ws.getColumn(1).width = 6; ws.getColumn(2).width = 40; ws.getColumn(3).width = 8; ws.getColumn(4).width = 10; ws.getColumn(5).width = 10; ws.getColumn(6).width = 9; ws.getColumn(7).width = 8;
    /* físico-financeiro: cada mês mesclado sobre as semanas dele */
    var spans = [], si = 0;
    while (si < nS) { var sf = si; while (sf + 1 < nS && m.semanas[sf + 1].mes === m.semanas[si].mes) sf++; spans.push([si, sf]); si = sf + 1; }
    ws.mergeCells(rF, 1, rF, CW); cel(rF, 1, "FÍSICO-FINANCEIRO", { bold: true, fill: cab, cor: "FFFFFFFF" });
    var rotulos = ["Desembolso do mês (R$)", "% do mês", "Acumulado (R$)", "% acumulado"];
    rotulos.forEach(function (t, ix) { ws.mergeCells(rF + 1 + ix, 1, rF + 1 + ix, CW); cel(rF + 1 + ix, 1, t, { bold: ix > 1 }); });
    var porMes = {}; m.meses.forEach(function (mm, ix) { porMes[mm.rotulo] = ix; });
    var cols = [], pos = 0;
    spans.forEach(function (sp, ix) {
      var dm2 = new Date(Math.floor(m.semanas[sp[0]].mes / 12), m.semanas[sp[0]].mes % 12, 1), rot = MESR[dm2.getMonth()] + "/" + String(dm2.getFullYear()).slice(2);
      var idx = f.rotulos.indexOf(rot); if (idx < 0) idx = pos;
      cols.push({ sp: sp, idx: idx }); pos++;
    });
    cols.forEach(function (cc) {
      var sp = cc.sp, tot = f.totais[cc.idx]; if (!tot) return;
      [[0, tot.valor, MOEDA], [1, tot.pct / 100, "0.00%"], [2, tot.acumValor, MOEDA], [3, tot.acumPct / 100, "0.00%"]].forEach(function (d) {
        var rr = rF + 1 + d[0], v = d[1];
        if (sp[1] > sp[0]) ws.mergeCells(rr, c0 + sp[0], rr, c0 + sp[1]);
        cel(rr, c0 + sp[0], v, { fmt: d[2], size: 7, al: "center", bold: d[0] > 1 });
        for (var q = sp[0] + 1; q <= sp[1]; q++) cel(rr, c0 + q, null, {});
      });
    });
    /* curva S em colunas de cor (10 faixas) */
    var rC = rF + 6;
    ws.mergeCells(rC, 1, rC, CW); cel(rC, 1, "CURVA S (acumulado planejado)", { bold: true, fill: cab, cor: "FFFFFFFF" });
    for (i = 10; i >= 1; i--) {
      var rr2 = rC + (11 - i); ws.mergeCells(rr2, 1, rr2, CW); cel(rr2, 1, i * 10 + "%", { al: "right", size: 7 });
      cols.forEach(function (cc) {
        var tot = f.totais[cc.idx]; if (!tot) return;
        for (var q = cc.sp[0]; q <= cc.sp[1]; q++) { var ce = cel(rr2, c0 + q, null, { borda: false }); if (tot.acumPct >= i * 10 - 5) ce.fill = fillS("FF1F3864"); }
      });
    }
    var rN = rC + 12;
    ws.getCell(rN, 1).value = "Azul: atividade (escuro = % concluído) · preto: resumo da etapa · ◆ marco · vermelho: caminho crítico" + (anyHoje ? " · borda vermelha: hoje" : "") + ". Origem do prazo: " + m.origem + ".";
    ws.getCell(rN, 1).font = { name: fonte, size: 8, italic: true };
    ws.views = [{ state: "frozen", ySplit: rs, xSplit: CW }];
    ws.pageSetup = { paperSize: 8, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };   /* 8 = A3 */
    return { ultimaLinha: rN, primeiraLinha: r1, linhaFin: rF };
  }

  function xlsx(ws, m, estilo, o) {
    if (!m || !m.ok) return null;
    if (estilo === "oficial") return xlsxOficial(ws, m, o);
    if (estilo === "simples") return xlsxSimples(ws, m, o);
    if (estilo === "gantt") return xlsxGantt(ws, m, o);
    return null;
  }

  var CronoEstilo = { ESTILOS: ESTILOS, PADRAO_PERFIL: PADRAO_PERFIL, estiloValido: estiloValido, padraoDoPerfil: padraoDoPerfil, estiloDoDocumento: estiloDoDocumento, modelo: modelo, html: html, documento: documento, svgGantt: svgGantt, svgCurvaS: svgCurvaS, xlsx: xlsx, _fmt: { moeda: moeda, pc: pc, dia: dia } };
  global.CronoEstilo = CronoEstilo;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoEstilo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

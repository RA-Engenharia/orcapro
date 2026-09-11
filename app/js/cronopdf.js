/* =====================================================================
 * cronopdf.js — Cronograma da obra em documento imprimível (A4 PAISAGEM).
 *
 * POR QUE EXISTE: o Gantt vive numa aba do editor, e a obra acontece no
 * canteiro. Quem cobra prazo (cliente, fiscal, mestre) precisa do cronograma
 * em papel/PDF, com o mesmo número que o app mostra — não com um redesenho.
 *
 * MOTOR PURO + FIAÇÃO FINA: aqui só se monta HTML. Os números vêm do
 * `Cronograma.estimar` e o desenho vem do `UI._gantt` — um Gantt só, para a
 * tela e para o papel. Se um dia divergirem, é porque alguém copiou.
 *
 * ⚠ SEM CUSTO DIRETO NESTE DOCUMENTO. A coluna de dinheiro é o PREÇO DE VENDA
 *   da etapa (o que o cliente paga). Imprimir custo direto ao lado do preço
 *   entrega a margem para quem está do outro lado da mesa — e este papel sai
 *   da empresa. Sem o módulo de orçamento à mão, sobra só o PESO em %, que é
 *   razão e não revela margem.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return (typeof Util !== "undefined" && Util.esc) ? Util.esc(s) : String(s == null ? "" : s); }
  function dbr(d) { try { return d.toLocaleDateString("pt-BR"); } catch (e) { return "—"; } }
  function moeda(v) { return (typeof Util !== "undefined" && Util.fmtMoeda) ? Util.fmtMoeda(v) : String(v); }
  function pct1(v) { return (Math.round((v || 0) * 10) / 10).toFixed(1).replace(".", ",") + "%"; }
  /* código da etapa que JÁ É o nº da linha ("1", "01", "1.0"): no detalhado a
     coluna Nº diz "1" e a atividade dizia "1.0 Serviços preliminares" */
  function codNum(c) { var m = /^0*(\d+)(?:\.0+)?$/.exec(String(c == null ? "" : c).trim()); return m ? String(parseInt(m[1], 10)) : null; }

  /* O CSS vem embutido no próprio documento por um motivo: o `@page` de
     PAISAGEM. O app.css declara `@page { size: A4; margin: 10mm }` (retrato)
     para todos os entregáveis; um cronograma de obra em retrato corta o Gantt
     ao meio. Como este <style> entra DEPOIS da folha do app, ele vence — e só
     enquanto este documento estiver aberto. */
  var CSS =
    '<style>' +
    '.cron-doc{width:297mm;max-width:297mm}' +
    '.cron-doc .cron-legenda{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0 4px;font-size:9pt;color:#5a6b7b}' +
    '.cron-doc .cron-legenda i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}' +
    '.cron-doc .cron-nota{font-size:8.8pt;color:#5a6b7b;line-height:1.5;margin-top:6px}' +
    '.cron-doc .cron-nota b{color:#0f2740}' +
    '.cron-doc .cron-crit{color:#b91c1c;font-weight:700}' +
    '.cron-doc .cron-marco{color:#0f172a;font-weight:700}' +
    '.cron-doc .cron-barra{display:block;height:5px;border-radius:3px;background:#dbe4ee;margin-top:3px}' +
    '.cron-doc .cron-barra span{display:block;height:5px;border-radius:3px;background:#2e6f9e}' +
    '.cron-doc .cron-bfr span{background:#b45309}' +
    '.cron-doc .cron-aviso{border-left:4px solid #b45309;background:#fdf6ec;padding:8px 12px;margin:10px 0;font-size:9.5pt;color:#7c4a06}' +
    '.cron-doc .cron-assin{margin-top:26px;display:flex;justify-content:flex-end}' +
    '.cron-doc .cron-assin div{width:80mm;text-align:center;font-size:9.5pt}' +
    '.cron-doc .cron-assin .l{border-top:1.5px solid #1a2632;margin-bottom:6px}' +
    '@media print{@page{size:A4 landscape;margin:10mm}' +
    '.cron-doc{width:auto;max-width:none;padding:0;box-shadow:none;margin:0}' +
    '.cron-doc .gantt{page-break-inside:avoid;break-inside:avoid}' +
    '.cron-doc table.prop-tbl thead{display:table-header-group}' +
    '.cron-doc table.prop-tbl tr{page-break-inside:avoid}}' +
    '</style>';

  /* ⚠ CSS SÓ DO DOCUMENTO DETALHADO (opts.detalhe), num <style> À PARTE de
     propósito: o documento por etapa tem de sair BYTE A BYTE igual ao de antes
     (é o que a proposta e as 38 instalações imprimem — tools/test-crono-
     documentos.js compara com a cópia do master), e qualquer regra nova no
     <style> comum mudaria o arquivo de todo mundo.
     Cada parte do Gantt começa numa página nova e não se parte: o SVG é
     dimensionado para caber numa folha A4 deitada (ver `_ganttPaginado`). */
  var CSS_HIER =
    '<style>' +
    '.cron-doc .cron-gpag{margin:0 auto 10px}' +
    '.cron-doc .cron-gpag-tit{font-size:8.8pt;color:#5a6b7b;margin:8px 0 3px}' +
    '.cron-doc table.cron-eap td.n{white-space:nowrap;color:#5a6b7b}' +
    '.cron-doc table.cron-eap tr.h0 td{font-weight:700;background:#f3f6fa}' +
    '.cron-doc table.cron-eap tr.h2 td{font-size:8.6pt;color:#334155}' +
    '.cron-doc .cron-tag{font-size:8pt;font-weight:400;color:#5a6b7b;border:1px solid #cbd5e1;border-radius:3px;padding:0 4px;margin-left:4px}' +
    '@media print{.cron-doc .cron-gpag{page-break-inside:avoid;break-inside:avoid}' +
    '.cron-doc .cron-gpag+.cron-gpag{page-break-before:always;break-before:page}}' +
    '</style>';

  function ehData(d) { return !!d && typeof d.getTime === "function" && !isNaN(d.getTime()); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function numero(v) { return typeof v === "number" && isFinite(v); }
  // "2.g,2.3II+5" → "#2.g, #2.3II+5" (o "#" diz que é nº de linha, não quantidade — como no documento por etapa)
  function comCerquilha(dep) { return (!dep || dep === "0") ? "" : dep.split(",").map(function (s) { return "#" + s; }).join(", "); }

  var CronoPDF = {

    /* Curva S: barras do desembolso do mês + linha do acumulado. É o desenho
       que responde "quando o dinheiro sai" sem ninguém ler a tabela inteira.
       SVG cru, sem biblioteca — o documento é impresso e tem de sair igual em
       qualquer navegador, inclusive no WebView do instalador antigo. */
    _curvaS: function (per, modo, conf) {
      var L = per.lista, n = L.length;
      if (!n) return "";
      var W = 900, H = 190, padL = 46, padR = 40, padB = 30, padT = 14;
      var pw = W - padL - padR, ph = H - padT - padB;
      var maxV = 0; L.forEach(function (p) { if (p.pct > maxV) maxV = p.pct; });
      if (maxV <= 0) maxV = 1;
      var bw = Math.max(4, (pw / n) * 0.62);
      var passoR = Math.max(1, Math.ceil(n / 18));
      var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;background:#fff;border:1px solid #d8e0ea;border-radius:8px;font-family:inherit">';
      // grade do acumulado (0–100%) à direita
      [0, 25, 50, 75, 100].forEach(function (g) {
        var y = padT + ph - (g / 100) * ph;
        s += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="#eef2f7" stroke-width="1"/>';
        s += '<text x="' + (W - padR + 4) + '" y="' + (y + 3).toFixed(1) + '" font-size="8" fill="#94a3b8">' + g + '%</text>';
      });
      var pts = [];
      L.forEach(function (p, i) {
        var cx = padL + (i + 0.5) * (pw / n);
        var hb = (p.pct / maxV) * ph * 0.90;
        s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (padT + ph - hb).toFixed(1) + '" width="' + bw.toFixed(1) +
          '" height="' + Math.max(1, hb).toFixed(1) + '" rx="2" fill="#2e6f9e" opacity="0.85"><title>' +
          esc(p.rotulo) + ': ' + pct1(p.pct) + (modo === "valor" ? ' · ' + moeda(p.valor) : '') + '</title></rect>';
        // rótulo de mês com PASSO: obra de 40 meses amontoava "set/26out/26nov/26"
        if (i % passoR === 0) s += '<text x="' + cx.toFixed(1) + '" y="' + (H - padB + 12) + '" font-size="8" fill="#64748b" text-anchor="middle">' + esc(p.rotulo) + '</text>';
        pts.push(cx.toFixed(1) + "," + (padT + ph - (p.acumPct / 100) * ph).toFixed(1));
      });
      s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#15803d" stroke-width="1.8"/>';
      pts.forEach(function (pt) { var xy = pt.split(","); s += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="2.4" fill="#15803d"/>'; });
      /* ⚠ o REALIZADO só é desenhado onde EXISTE medição. Prolongar a linha até
         o fim do gráfico (com zero, ou repetindo o último valor) desenharia uma
         obra parada ou entregue que ninguém mediu — e é a figura que o cliente
         leva para a reunião. */
      if (conf && conf.temReal) {
        var pr = [];
        conf.linhas.forEach(function (l, i) {
          if (l.realizado == null) return;
          pr.push((padL + (i + 0.5) * (pw / n)).toFixed(1) + "," + (padT + ph - (l.realizado / 100) * ph).toFixed(1));
        });
        if (pr.length) {
          s += '<polyline points="' + pr.join(" ") + '" fill="none" stroke="#b45309" stroke-width="1.8" stroke-dasharray="5,3"/>';
          pr.forEach(function (pt) { var xy = pt.split(","); s += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="2.4" fill="#b45309"/>'; });
        }
      }
      s += '</svg>';
      /* ⚠ a legenda mora FORA do desenho. Dentro do SVG, no canto superior
         esquerdo, ela caía em cima da primeira barra — que é justamente o mês
         de maior desembolso em obra que começa forte (visto na foto). */
      return s + '<div class="cron-legenda" style="margin-top:4px">' +
        '<span><i style="background:#2e6f9e"></i>' + (modo === "valor" ? "desembolso do mês" : "avanço do mês") + '</span>' +
        '<span><i style="background:#15803d"></i>previsto (acumulado)</span>' +
        ((conf && conf.temReal) ? '<span><i style="background:#b45309"></i>realizado (avanço medido)</span>' : '') +
        '</div>';
    },

    /* =================================================================
       DOCUMENTO DETALHADO (cronograma executivo) — só com opts.detalhe
       EXPLÍCITO ("subetapa" ou "servico"). A aba passa o detalhe atual; a
       proposta e os demais chamadores não passam, e recebem o documento por
       etapa de sempre (byte a byte).
       ================================================================= */
    POR_PAGINA: 22,   // linhas por parte do Gantt (≈ uma folha A4 deitada)

    _detalhe: function (opts) {
      var d = opts && opts.detalhe;
      return (d === "subetapa" || d === "servico") ? d : null;
    },

    /* r com a árvore EAP quando o detalhe veio sem r: numeração da planilha
       pelo `Orcamento.calcular` e VALOR DE VENDA pelo `Orcamento.valoresEAP`
       (o helper único do I6), quando estão carregados. */
    _estimarEAP: function (orc) {
      if (typeof Cronograma === "undefined" || !Cronograma.estimar) return null;
      var ctx = { eap: true };
      if (typeof Orcamento !== "undefined") {
        try { if (Orcamento.calcular) ctx.calc = Orcamento.calcular(orc); } catch (e) { ctx.calc = null; }
        try { if (Orcamento.valoresEAP) ctx.valores = Orcamento.valoresEAP(orc); } catch (e2) { ctx.valores = null; }
      }
      return Cronograma.estimar(orc, null, ctx);
    },

    /* Linhas do documento detalhado + valores. Devolve {ok:false, motivo}
       quando não dá para detalhar (o documento sai por etapa e DIZ por quê).
       ⚠ VALOR = PREÇO DE VENDA, nunca custo direto: o do nó (ctx.valores de
       `estimar`), senão `opts.valores`, senão `Orcamento.valoresEAP(orc)`. Se
       nenhum cobre TODAS as linhas, a coluna de valor e a de peso saem do
       documento com o motivo — o documento por etapa cai no peso pelo custo
       quando falta a sintética, mas aqui não: é a regra dos modos novos (I6),
       e a margem do escritório não pode virar peso de subetapa no papel do
       cliente. */
    _hier: function (orc, r, opts, detalhe) {
      if (!r || !Array.isArray(r.atividades)) {
        return { ok: false, motivo: (r && r.exec && r.exec.erro) || "o cronograma veio sem a árvore EAP (a tela precisa passar o resultado de Cronograma.estimar com {eap: true})" };
      }
      var linhas = [], gantt = [], nSub = 0, nSoltos = 0, nServ = 0, nSemBase = 0, i;
      r.atividades.forEach(function (n) {
        if (n.tipo === "servico") {
          if (detalhe !== "servico") return;
          linhas.push(n); nServ++; if (n.semBase) nSemBase++;
          return;
        }
        if (n.tipo === "subetapa") nSub++;
        if (n.tipo === "soltos") nSoltos++;
        linhas.push(n); gantt.push(n);   // ⚠ o Gantt vai no máximo até a subetapa: serviço só na tabela
      });
      for (i = 0; i < gantt.length; i++) {
        if (!ehData(gantt[i].dataInicio) || !ehData(gantt[i].dataFim)) return { ok: false, motivo: "a linha " + gantt[i].numero + " ficou sem data no cronograma" };
      }
      var val = null, motivoValor = null, VE = null;
      function cobre(get) { return linhas.every(function (n) { return numero(get(n)); }); }
      if (cobre(function (n) { return n.valor; })) {
        val = {}; linhas.forEach(function (n) { val[n.id] = n.valor; });
      } else {
        VE = opts.valores || null;
        if (!VE && typeof Orcamento !== "undefined" && Orcamento.valoresEAP) {
          try { VE = Orcamento.valoresEAP(orc); } catch (e) { VE = { ok: false, motivo: "não consegui repartir o preço de venda (" + ((e && e.message) || e) + ")" }; }
        }
        if (!VE) motivoValor = "o módulo de orçamento não está carregado";
        else if (VE.ok === false) motivoValor = VE.motivo || "os valores de venda por subetapa não fecharam";
        else {
          var P = VE.porId || VE;
          if (cobre(function (n) { return own(P, n.id) ? P[n.id] : null; })) { val = {}; linhas.forEach(function (n) { val[n.id] = P[n.id]; }); }
          else motivoValor = "os valores de venda recebidos não são deste orçamento (faltam linhas)";
        }
      }
      var total = 0;
      if (val) linhas.forEach(function (n) { if (n.tipo === "etapa") total += val[n.id]; });
      return { ok: true, detalhe: detalhe, linhas: linhas, gantt: gantt, paginas: this.paginasGantt(gantt, this.POR_PAGINA),
        valor: val, total: total, motivoValor: motivoValor, nSub: nSub, nSoltos: nSoltos, nServ: nServ, nSemBase: nSemBase,
        avisos: (r.exec && r.exec.avisos) || [], rede: !!(r.exec && r.exec.rede) };
    },

    /* Partes do Gantt com no máximo `porPagina` linhas. ⚠ Etapa-resumo não
       fica sozinha no pé de uma parte com as subetapas na seguinte: desce
       junto (senão a barra da etapa aparece numa folha e o que a compõe na
       outra, e ninguém liga uma coisa à outra). */
    paginasGantt: function (nos, porPagina) {
      var n = porPagina > 0 ? porPagina : this.POR_PAGINA, pags = [], cur = [];
      (nos || []).forEach(function (no, i) {
        var prox = nos[i + 1];
        if (no.tipo === "etapa" && prox && prox.tipo !== "etapa" && cur.length === n - 1 && cur.length > 0) { pags.push(cur); cur = []; }
        cur.push(no);
        if (cur.length === n) { pags.push(cur); cur = []; }
      });
      if (cur.length) pags.push(cur);
      return pags;
    },

    /* Uma PARTE do Gantt no formato que o `UI._gantt` desenha (r.etapas), com
       a ESCALA DA OBRA INTEIRA (totalDias, início, semanas, feriados): toda
       parte tem o mesmo eixo de tempo, e uma barra se compara com a da folha
       anterior. `atividades` leva os nós reais da parte para um desenhista
       hierárquico (opts.desenharGantt). O nº EAP entra no rótulo e o recuo é
       feito com espaço inquebrável (espaço comum some no SVG). */
    _rPagina: function (r, nos, k, total) {
      var rows = nos.map(function (no) {
        var fl = no.tipo !== "etapa";
        return { id: no.id, codigo: (fl ? "   " : "") + no.numero, nome: no.nome || "", categoria: no.categoria,
          categoriaNome: no.categoriaNome, cor: no.cor, inicio: no.inicio, fim: no.fim, duracao: no.duracao, folga: no.folga || 0,
          critico: !!no.critico, marco: !!no.marco, editado: !!no.editado, preds: (no.preds || []).slice(), predsExplicito: !!no.predsExplicito,
          predLag: no.predLag || {}, predDesloc: no.predDesloc || {}, dataInicio: no.dataInicio, dataFim: no.dataFim,
          dataLimite: ehData(no.dataLimite) ? no.dataLimite : no.dataFim };
      });
      return { etapas: rows, atividades: nos, totalDias: r.totalDias, totalSemanas: r.totalSemanas, dataInicio: r.dataInicio,
        dataFim: r.dataFim, params: r.params, feriados: r.feriados, caminhoCritico: [], temCiclo: false, pagina: k + 1, paginas: total };
    },

    /* Quem desenha as partes, nesta ordem:
         "opts" — `opts.desenharGantt(rPagina, info)`, se quem chama passar;
         "tela" — o Gantt hierárquico da aba (`CronoExecUI.gantt`, com resumo,
                  recuo e nº EAP), fatiado por `de`/`ate` — ⚠ só quando as
                  linhas dele são EXATAMENTE as do documento (mesmos ids, mesma
                  ordem): a fatia é por posição, e um desencontro desenharia a
                  subetapa de uma etapa na parte da outra;
         "ui"   — o `UI._gantt` de sempre, com a parte no formato de etapas. */
    _pintor: function (r, H, opts) {
      if (typeof opts.desenharGantt === "function") return "opts";
      if (typeof CronoExecUI !== "undefined" && CronoExecUI && typeof CronoExecUI.gantt === "function" && typeof CronoExecUI.linhas === "function") {
        try {
          var L = CronoExecUI.linhas(r, { detalhe: "subetapa", abertas: {} }) || [];
          if (L.length === H.gantt.length && L.every(function (l, i) { var x = l && (l.no || l.et); return !!x && x.id === H.gantt[i].id; })) return "tela";
        } catch (e) { /* desenhista da tela quebrado: o documento sai com o de sempre */ }
      }
      return (typeof UI !== "undefined" && UI._gantt) ? "ui" : "";
    },

    /* Gantt em partes, um desenho só para a tela e o papel (ver `_pintor`).
       ⚠ Com o `UI._gantt`, o " · depende de: N" das dicas sai: ele numera pela
       POSIÇÃO na parte (a 3ª linha vira "3"), que não é o nº da planilha. A
       coluna "Depende de" da tabela tem o número certo.
       ⚠ LARGURA: o SVG ocupa a largura toda e cresce em altura com as linhas;
       22 linhas na largura de uma A4 deitada passam da altura da folha e a
       impressão corta o fim. Cada parte é limitada a uma largura que faz a
       MAIOR parte caber em ~170 mm de altura — a mesma largura para todas, para
       a escala de tempo ser a mesma em todas as folhas. */
    _ganttPaginado: function (r, H, opts) {
      var self = this, pags = H.paginas, n = pags.length, svgs = [], razao = 0, de = 0;
      var pintor = H.pintor = this._pintor(r, H, opts);
      pags.forEach(function (nos, k) {
        var rp = self._rPagina(r, nos, k, n), s = "";
        if (pintor === "opts") s = String(opts.desenharGantt(rp, { pagina: k + 1, paginas: n, detalhe: H.detalhe, de: de, ate: de + nos.length }) || "");
        else if (pintor === "tela") s = String(CronoExecUI.gantt(r, { detalhe: "subetapa", abertas: {}, papel: true, semLegenda: true, de: de, ate: de + nos.length }) || "");
        else if (pintor === "ui") s = UI._gantt(rp, { semLegenda: true }).replace(/ · depende de: [^<]*/g, "");
        de += nos.length;
        var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(s);
        if (vb && +vb[1] > 0) razao = Math.max(razao, +vb[2] / +vb[1]);
        svgs.push(s);
      });
      var larg = razao > 0 ? Math.min(277, Math.floor(170 / razao)) : 0;
      return svgs.map(function (s, k) {
        var nos = pags[k];
        return '<div class="cron-gpag"' + (larg ? ' style="max-width:' + larg + 'mm"' : '') + '>' +
          (n > 1 ? '<div class="cron-gpag-tit">Parte ' + (k + 1) + ' de ' + n + ' — linhas ' + esc(nos[0].numero) + ' a ' + esc(nos[nos.length - 1].numero) + ' (mesma escala de tempo em todas as partes)</div>' : '') +
          s + '</div>';
      }).join("");
    },

    /* notas do detalhado: o que os códigos novos significam, e o que este
       papel NÃO afirma (a subetapa no modo padrão é o que coube na etapa; o
       serviço não tem rede própria). */
    _notasHier: function (H) {
      var n = H.paginas.length;
      return '<b>Nº:</b> o número da planilha orçamentária (1, 1.2, 1.2.3). <b>N.g</b> = serviços gerais da etapa (itens fora das subetapas).<br>' +
        '<b>Subetapas:</b> ' + (H.rede
          ? 'o prazo de cada etapa com subetapas é o encadeamento delas (cronograma executivo).'
          : 'estão distribuídas dentro do prazo de cada etapa — a duração e o “Depende de” da subetapa são a regra; as datas são o que coube no prazo da etapa.') + '<br>' +
        '<b>#2.3II+5</b> = começa 5 dias úteis depois do <b>início</b> da 2.3 (início-início); sem “II”, depois do fim. Dependência entre subetapas vale só dentro da mesma etapa.<br>' +
        (H.detalhe === "servico" ? '<b>Serviços:</b> a barra de cada serviço é a divisão do prazo da subetapa pelo esforço — o serviço não tem dependência própria; “sem quantidade” não entra no prazo.<br>' : '') +
        '<b>Gantt:</b> vai até a subetapa' + (H.detalhe === "servico" ? ' (os serviços estão só na tabela)' : '') +
        (n > 1 ? ', em ' + n + ' partes com a mesma escala de tempo; dependência com linha de outra parte aparece só na coluna “Depende de”' : '') + '.<br>' +
        (H.valor ? '<b>Valor:</b> preço de venda (o que o cliente paga) da etapa, repartido entre subetapas e serviços; a soma das partes fecha com a etapa.<br>' : '');
    },

    /* ⚠ O PDF PODE IR AO CLIENTE: recado INTERNO do motor não vai ao papel
       (revisão da Fase 2, 11/09/2026). Saíam no documento "salve o orçamento
       para que aparelhos com versão anterior do app vejam o mesmo prazo"
       (nao-materializado) e "todas as subetapas são marco — a duração da etapa
       não vem delas" (sem-vao) — instrução ao engenheiro, inclusive no
       orçamento APROVADO. Esses ficam na tela. Vão ao papel só os que mudam a
       leitura das datas, reescritos para quem lê de fora. */
    _avisosPapel: function (avisos, r) {
      var num = {}, out = [];
      ((r && r.etapas) || []).forEach(function (e, i) { num[e.id] = i + 1; });
      (avisos || []).forEach(function (a) {
        var et = "Etapa " + (num[a.etapaId] || "") + ": ";
        if (a.tipo === "comprimida") out.push(et + "as subetapas estão desenhadas dentro do prazo da etapa e se sobrepõem mais do que o encadeamento previsto entre elas.");
        else if (a.tipo === "ciclo") out.push(et + "há dependência circular entre subetapas — o elo que fecha o laço foi ignorado no cálculo das datas.");
      });
      return out;
    },

    /* etapas cujo prazo é o VÃO das subetapas (modo executivo): no papel elas
       levam ∑, não ✎ — o vão é CALCULADO, e a nota do documento diz que ✎ é
       "informada pela equipe e prevalece". ⚠ Só com o modo LIGADO; desligado
       devolve {} e o documento por etapa sai byte a byte o de sempre. */
    _vaoEt: function (orc) {
      var cr = orc && orc.cronograma;
      if (!cr || !cr.exec || cr.exec.rede !== true || typeof Cronograma === "undefined" || !Cronograma._vaosExec) return {};
      try { var v = Cronograma._vaosExec(orc); return (v && v.porId) || {}; } catch (e) { return {}; }
    },

    // tabela hierárquica: nº EAP, recuo, nome, duração, depende de, datas, folga, valor de venda e peso
    _tabelaHier: function (r, H) {
      var numPorId = {}, numEt = {}, comV = !!H.valor, total = H.total;
      r.atividades.forEach(function (n) { numPorId[n.id] = n.numero; if (n.tipo === "etapa") numEt[n.id] = n.numero; });
      var h = '<table class="prop-tbl cron-eap"><thead><tr>' +
        '<th>Nº</th><th>Atividade</th><th class="r">Duração</th><th class="r">Depende de</th>' +
        '<th>Início</th><th>Fim</th><th class="r">Folga</th>' +
        (comV ? '<th class="r">Valor (R$)</th><th class="r">Peso</th>' : '') + '</tr></thead><tbody>';
      H.linhas.forEach(function (n) {
        var serv = n.tipo === "servico", et = n.tipo === "etapa", niv = et ? 0 : (serv ? n.prof : 1);
        var nome = et ? ((n.codigo && codNum(n.codigo) !== String(n.numero) ? n.codigo + " " : "") + (n.nome || "")) : (serv ? ((n.codigo ? n.codigo + " " : "") + (n.nome || "")) : (n.nome || ""));
        var dep;
        if (serv) dep = "—";
        else if (et) dep = comCerquilha((typeof Cronograma !== "undefined" && Cronograma.predsTexto) ? Cronograma.predsTexto(n, numEt) : "") || "início da obra";
        else dep = comCerquilha((typeof Cronograma !== "undefined" && Cronograma.predsTextoSub) ? Cronograma.predsTextoSub(n, numPorId) : "") || "início da etapa";
        var sem = serv && n.semBase;
        var pe = comV && total ? (H.valor[n.id] / total) * 100 : 0;
        h += '<tr class="h' + (et ? 0 : (serv ? 2 : 1)) + '">' +
          '<td class="n">' + esc(n.numero) + '</td>' +
          '<td style="padding-left:' + (6 + niv * 14) + 'px">' + esc(nome.replace(/^\s+/, "")) +
            (n.marco ? ' <span class="cron-marco">◆ marco</span>' : '') +
            // ⚠ o vão das subetapas é CALCULADO: ∑, nunca o ✎ de "informada pela equipe" (ver _vaoEt)
            (n.fonte === "subetapas" ? ' <span title="duração = encadeamento das subetapas (cronograma executivo)">∑</span>'
              : (n.editado ? ' <span title="duração informada manualmente">✎</span>' : '')) +
            (et && n.opcional ? '<span class="cron-tag">opcional</span>' : '') + '</td>' +
          // serviço dentro de subetapa MARCO não tem duração: "—", não "0 d" com o valor "num dia só"
          '<td class="r">' + (sem ? 'sem quantidade' : (n.marco || (serv && !n.duracao) ? '—' : n.duracao + ' d')) + '</td>' +
          '<td class="r">' + esc(dep) + '</td>' +
          '<td>' + (sem ? '—' : dbr(n.dataInicio)) + '</td>' +
          '<td>' + (sem ? '—' : dbr(n.dataFim)) + '</td>' +
          '<td class="r">' + (serv ? '—' : (n.critico ? '<span class="cron-crit">crítica</span>' : '+' + (n.folga || 0) + ' d')) + '</td>' +
          (comV ? '<td class="r">' + moeda(H.valor[n.id]) + '</td><td class="r">' + pct1(pe) +
            (serv ? '' : '<b class="cron-barra"><span style="width:' + Math.max(1, Math.min(100, pe)).toFixed(1) + '%"></span></b>') + '</td>' : '') +
          '</tr>';
      });
      var nEt = r.etapas.length;
      h += '</tbody><tfoot><tr><td></td><td>TOTAL — ' + nEt + ' etapa' + (nEt === 1 ? '' : 's') +
        ' · ' + H.nSub + ' subetapa' + (H.nSub === 1 ? '' : 's') +
        (H.nSoltos ? ' + ' + H.nSoltos + ' grupo' + (H.nSoltos === 1 ? '' : 's') + ' de serviços gerais' : '') +
        (H.detalhe === "servico" ? ' · ' + H.nServ + ' serviço' + (H.nServ === 1 ? '' : 's') + (H.nSemBase ? ' (' + H.nSemBase + ' sem quantidade)' : '') : '') +
        '</td><td class="r">' + r.totalDias + ' d</td><td></td>' +
        '<td>' + dbr(r.dataInicio) + '</td><td>' + dbr(r.dataFim) + '</td><td></td>' +
        (comV ? '<td class="r">' + moeda(total) + '</td><td class="r">100,0%</td>' : '') + '</tr></tfoot></table>';
      return h;
    },

    /* orc: orçamento · r: resultado de Cronograma.estimar (opcional — calcula)
       opts.ganttSVG: o SVG já pronto (a tela passa o UI._gantt; o teste passa
       o dele). Sem opts, tenta o UI global — é a mesma fonte.
       opts.detalhe ("subetapa" | "servico"): documento detalhado — r deve vir
       de Cronograma.estimar(orc, override, {eap:true, calc, valores}); sem r,
       calcula assim. opts.ganttSVG continua mandando (string ou lista de
       partes); sem ele, o Gantt sai em partes (ver `_ganttPaginado`).
       opts.desenharGantt(rPagina, info): desenhista de cada parte (opcional).
       opts.valores: {ok, porId} de Orcamento.valoresEAP, se r veio sem eles. */
    gerarHTML: function (orc, r, opts) {
      opts = opts || {};
      var detalhe = this._detalhe(opts);
      if (!r && detalhe) r = this._estimarEAP(orc);
      if (!r && typeof Cronograma !== "undefined" && Cronograma.estimar) r = Cronograma.estimar(orc);
      if (!r || !r.etapas || !r.etapas.length) return '<div class="rel-doc">Sem etapas para montar o cronograma.</div>';
      var p = r.params || {};
      /* ⚠ H = null no documento de SEMPRE: todo trecho novo abaixo é
         condicionado a `H` e devolve "" sem ele, para o arquivo por etapa sair
         byte a byte igual (a proposta e as 38 instalações dependem disso). */
      var H = detalhe ? this._hier(orc, r, opts, detalhe) : null;
      /* ⚠ detalhe "subetapa" num orçamento SEM subetapa: nada abaixo da etapa
         para mostrar — sai o documento por etapa de sempre, byte a byte. A
         tela já manda "etapa" nesse caso; outro chamador que forçasse o
         detalhe mudava o papel sem ter nada a mais (medido na Fase 2). */
      if (H && H.ok && detalhe === "subetapa" && !H.nSub && !H.nSoltos) H = null;
      var hierOk = !!(H && H.ok);
      var vaoEt = this._vaoEt(orc);   // {} com o modo executivo desligado (documento de sempre)
      /* opts.ganttSVG manda (a tela passa o desenho dela). ⚠ Exceção só no
         detalhado: UM desenho único com mais linhas do que cabem numa folha
         (obra com 48 subetapas = 1.000 px de altura num bloco que não se
         parte) sairia cortado na impressão — aí o documento pagina sozinho,
         com o mesmo desenhista (ver `_pintor`). Lista de partes é sempre
         respeitada: quem chama já paginou. */
      var svgUnico = opts.ganttSVG != null && !Array.isArray(opts.ganttSVG) && !(hierOk && H.gantt.length > this.POR_PAGINA);
      var svg = Array.isArray(opts.ganttSVG) ? opts.ganttSVG.map(function (s) { return '<div class="cron-gpag">' + s + '</div>'; }).join("")
        : (svgUnico ? opts.ganttSVG
        : (hierOk ? this._ganttPaginado(r, H, opts)
        : ((typeof UI !== "undefined" && UI._gantt) ? UI._gantt(r) : "")));

      var empresa = ((typeof Empresa !== "undefined" && Empresa.nomeDoc) ? Empresa.nomeDoc() : "") ||
        (opts.usuario && opts.usuario.empresa) || "Sua Empresa";
      var hoje = new Date().toLocaleDateString("pt-BR");

      /* Preço de venda por etapa: a sintética é mapeada de `orc.etapas` na
         MESMA ordem do motor de cronograma (os dois fazem map sobre a mesma
         lista), então o índice casa. Se o módulo não estiver à mão — ou se a
         conta estourar em algum orçamento estranho — cai no peso pelo custo,
         nunca em número inventado. */
      var valores = null, somaValor = 0;
      try {
        if (typeof Orcamento !== "undefined" && Orcamento.sintetico) {
          var sint = Orcamento.sintetico(orc);
          if (sint && sint.length === r.etapas.length) {
            valores = sint.map(function (s) { return s.precoVenda || 0; });
            valores.forEach(function (v) { somaValor += v; });
          }
        }
      } catch (e) { valores = null; }
      var somaCusto = 0;
      r.etapas.forEach(function (e) { somaCusto += (e.custo || 0); });
      var base = valores ? (somaValor || 1) : (somaCusto || 1);
      function pesoDe(i) { return ((valores ? valores[i] : (r.etapas[i].custo || 0)) / base) * 100; }

      var nCrit = (r.caminhoCritico || []).length;
      var nMarcos = r.etapas.filter(function (e) { return e.marco; }).length;
      var numPorId = {}; r.etapas.forEach(function (e, i) { numPorId[e.id] = i + 1; });

      var h = CSS + (hierOk ? CSS_HIER : '') + '<div class="rel-doc cron-doc">';
      var wm = (typeof Empresa !== "undefined" && Empresa.marcaDaguaTexto) ? Empresa.marcaDaguaTexto() : empresa;
      if (wm) h += '<div class="wm">' + esc(wm) + '</div>';

      // ---- cabeçalho ----
      h += '<div class="rel-head">' +
        '<div><div class="rel-emp">' + esc(empresa) + '</div><h1>Cronograma da Obra</h1>' +
        '<div class="rel-sub">' + esc(orc.nome || "") + '</div></div>' +
        '<div class="rel-meta">' +
          '<div><span>Nº</span> ' + esc(orc.numero || "—") + '</div>' +
          '<div><span>Cliente</span> ' + esc((orc.cliente && orc.cliente.nome) || "—") + '</div>' +
          '<div><span>Obra</span> ' + esc((orc.obra && orc.obra.nome) || "—") + '</div>' +
          '<div><span>Emissão</span> ' + hoje + '</div>' +
          '<div><span>Regime</span> ' + (p.diasUteisSemana || 5) + ' dias úteis/semana · ' +
            (p.equipes || 1) + ' frente' + ((p.equipes || 1) === 1 ? '' : 's') +
            ' · paralelismo ' + Math.round((p.paralelismo || 0) * 100) + '%</div>' +
          (hierOk ? '<div><span>Detalhe</span> ' + (H.detalhe === "servico" ? 'por serviço' : 'por subetapa') + ' · ' +
            (H.rede ? 'prazo das etapas pelas subetapas (cronograma executivo)' : 'subetapas dentro do prazo de cada etapa') + '</div>' : '') +
        '</div></div>';

      // ---- KPIs ----
      h += '<div class="rel-kpis">' +
        '<div><span>Prazo total</span><b>' + r.totalDias + ' dias úteis</b></div>' +
        '<div><span>Início</span><b>' + dbr(r.dataInicio) + '</b></div>' +
        '<div class="dest"><span>Entrega prevista</span><b>' + dbr(r.dataFim) + '</b></div>' +
        '<div><span>Caminho crítico</span><b>' + nCrit + ' de ' + r.etapas.length + ' etapas</b></div>' +
        '</div>';

      if (r.temCiclo) {
        h += '<div class="cron-aviso"><b>Dependência circular no cronograma.</b> Uma etapa depende de outra que, por sua vez, depende dela. ' +
          'O elo que fecha o laço foi ignorado no cálculo — revise a coluna “Depende de” antes de usar estas datas.</div>';
      }
      /* detalhe pedido e impossível: o documento sai por etapa e DIZ por quê
         (recado que o sistema não pode cumprir não finge que cumpriu). */
      if (H && !H.ok) {
        h += '<div class="cron-aviso"><b>Detalhamento por subetapa indisponível</b> — ' + esc(H.motivo) + '. Este documento saiu por etapa.</div>';
      }
      // avisos do motor sobre as subetapas (etapa curta demais, dependência circular entre subetapas)
      var avPapel = hierOk ? this._avisosPapel(H.avisos, r) : [];   // ⚠ só os que o cliente pode ler (ver _avisosPapel)
      if (avPapel.length) h += '<div class="cron-aviso">' + avPapel.map(esc).join("<br>") + '</div>';

      // ---- Gantt ----
      h += '<h2 class="rel-tit">1. Gráfico de Gantt</h2>' + svg;
      /* a legenda só explica o que ESTÁ no gráfico: "folga" e "marco" numa obra
         que não tem nenhum dos dois é ruído que faz o leitor procurar na figura
         algo que não existe. No detalhado, "o gráfico" são as etapas E as
         subetapas desenhadas. */
      var noGrafico = hierOk ? H.gantt : r.etapas;
      var temFolga = false;
      noGrafico.forEach(function (e) { if (e.folga > 0) temFolga = true; });
      var marcoNoGrafico = hierOk ? noGrafico.filter(function (e) { return e.marco; }).length : nMarcos;
      h += '<div class="cron-legenda">' +
        (nCrit ? '<span><i style="background:#b91c1c"></i>caminho crítico (sem folga)</span>' : '') +
        '<span><i style="background:#94a3b8"></i>' + (hierOk ? 'dependência (entre etapas, e entre subetapas da mesma etapa)' : 'dependência entre etapas') + '</span>' +
        (temFolga ? '<span><i style="background:#dbe4ee;border:1px dashed #94a3b8"></i>folga</span>' : '') +
        (marcoNoGrafico ? '<span><b style="color:#0f172a">◆</b> marco (evento sem duração)</span>' : '') +
        (hierOk && H.pintor === "tela" ? '<span><i style="background:#334155;height:5px;vertical-align:2px"></i>resumo da etapa (as subetapas vêm logo abaixo)</span>' : '');
      var vistas = {};
      noGrafico.forEach(function (e) {
        if (vistas[e.categoria]) return; vistas[e.categoria] = 1;
        h += '<span><i style="background:' + esc(e.cor || "#94a3b8") + '"></i>' + esc(e.categoriaNome || e.categoria) + '</span>';
      });
      h += '</div>';

      // ---- tabela de etapas (detalhada: etapas, subetapas e, no "servico", serviços) ----
      if (hierOk) {
        h += '<h2 class="rel-tit">2. Etapas' + (H.detalhe === "servico" ? ', subetapas e serviços' : ' e subetapas') + ', prazos e precedências</h2>';
        /* ⚠ texto NEUTRO no papel: o motivo técnico ("informe a quantidade dos
           itens pendentes (Memória de cálculo) e tente de novo") é instrução ao
           engenheiro — fica em H.motivoValor, e a tela o mostra ao gerar */
        if (!H.valor) h += '<div class="cron-aviso"><b>Valor de venda por subetapa indisponível para este orçamento.</b> As colunas de valor e peso ficam fora deste documento.</div>';
        h += this._tabelaHier(r, H);
      } else {
      h += '<h2 class="rel-tit">2. Etapas, prazos e precedências</h2>';
      h += '<table class="prop-tbl"><thead><tr>' +
        '<th class="r">#</th><th>Etapa</th><th>Categoria</th>' +
        '<th class="r">Duração</th><th class="r">Depende de</th>' +
        '<th>Início</th><th>Fim</th><th class="r">Folga</th><th>Data limite</th>' +
        (valores ? '<th class="r">Valor (R$)</th>' : '') + '<th class="r">Peso</th>' +
        '</tr></thead><tbody>';
      r.etapas.forEach(function (e, i) {
        /* "#1, #3" e não "1,3": no meio de uma linha com datas e dias, o número
           solto é lido como quantidade. O "#" diz que aquilo é o nº da etapa —
           mesma decisão tomada na planilha do Excel. */
        var dep = (typeof Cronograma !== "undefined" && Cronograma.predsTexto) ? Cronograma.predsTexto(e, numPorId) : "";
        // "0" do campo = "não depende de ninguém"; no papel isso se escreve por extenso
        dep = (!dep || dep === "0") ? "" : dep.split(",").map(function (s) { return "#" + s; }).join(", ");
        var pe = pesoDe(i);
        h += '<tr>' +
          '<td class="r">' + (i + 1) + '</td>' +
          '<td>' + esc(((e.codigo ? e.codigo + " " : "") + (e.nome || "")).replace(/^\s+/, "")) +
            (e.marco ? ' <span class="cron-marco">◆ marco</span>' : '') +
            (e.editado ? (own(vaoEt, e.id) ? ' <span title="duração = encadeamento das subetapas (cronograma executivo)">∑</span>' : ' <span title="duração informada manualmente">✎</span>') : '') + '</td>' +
          '<td>' + esc(e.categoriaNome || e.categoria || "—") + '</td>' +
          '<td class="r">' + (e.marco ? '—' : e.duracao + ' d') + '</td>' +
          '<td class="r">' + esc(dep || "início da obra") + '</td>' +
          '<td>' + dbr(e.dataInicio) + '</td>' +
          '<td>' + dbr(e.dataFim) + '</td>' +
          '<td class="r">' + (e.critico ? '<span class="cron-crit">crítica</span>' : '+' + e.folga + ' d') + '</td>' +
          '<td>' + dbr(e.dataLimite) + '</td>' +
          (valores ? '<td class="r">' + moeda(valores[i]) + '</td>' : '') +
          '<td class="r">' + pct1(pe) + '<b class="cron-barra"><span style="width:' + Math.max(1, Math.min(100, pe)).toFixed(1) + '%"></span></b></td>' +
          '</tr>';
      });
      h += '</tbody><tfoot><tr>' +
        '<td></td><td>TOTAL — ' + r.etapas.length + ' etapa' + (r.etapas.length === 1 ? '' : 's') +
          (nMarcos ? ' (' + nMarcos + ' marco' + (nMarcos === 1 ? '' : 's') + ')' : '') + '</td><td></td>' +
        '<td class="r">' + r.totalDias + ' d</td><td></td>' +
        '<td>' + dbr(r.dataInicio) + '</td><td>' + dbr(r.dataFim) + '</td>' +
        '<td class="r"></td><td></td>' +
        (valores ? '<td class="r">' + moeda(somaValor) + '</td>' : '') +
        '<td class="r">100,0%</td></tr></tfoot></table>';
      }   // fim do documento por etapa (o de sempre)

      // ---- resumo por categoria (visão de gestão: onde está o prazo e o dinheiro) ----
      var porCat = {}, ordemCat = [];
      r.etapas.forEach(function (e, i) {
        var k = e.categoria || "outros";
        if (!porCat[k]) { porCat[k] = { nome: e.categoriaNome || k, cor: e.cor || "#94a3b8", n: 0, dias: 0, valor: 0, peso: 0 }; ordemCat.push(k); }
        porCat[k].n++; porCat[k].dias += (e.duracao || 0);
        porCat[k].valor += valores ? valores[i] : (e.custo || 0);
        porCat[k].peso += pesoDe(i);
      });
      h += '<h2 class="rel-tit">3. Resumo por frente de serviço</h2>';
      h += '<table class="prop-tbl"><thead><tr><th>Frente</th><th class="r">Etapas</th>' +
        '<th class="r" title="Soma das durações; com frentes em paralelo, é maior que o prazo da obra.">Dias de serviço</th>' +
        (valores ? '<th class="r">Valor (R$)</th>' : '') + '<th class="r">Peso</th></tr></thead><tbody>';
      ordemCat.forEach(function (k) {
        var c = porCat[k];
        h += '<tr><td><i style="display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:' + esc(c.cor) + '"></i>' + esc(c.nome) + '</td>' +
          '<td class="r">' + c.n + '</td><td class="r">' + c.dias + ' d</td>' +
          (valores ? '<td class="r">' + moeda(c.valor) + '</td>' : '') +
          '<td class="r">' + pct1(c.peso) + '</td></tr>';
      });
      h += '</tbody></table>';

      /* ---- desembolso e frentes por mês, seguindo o Gantt ----
         ⚠ É a pergunta que o cliente faz depois de ver o prazo: "quanto sai por
         mês?". A resposta tem de vir da DURAÇÃO de cada etapa, não do peso
         dela: a régua antiga do app fatiava o valor pela ordem das etapas e
         punha dinheiro em mês onde não havia serviço. */
      var per = null;
      try {
        if (typeof Cronograma !== "undefined" && Cronograma.periodos) {
          var vmap = {};
          r.etapas.forEach(function (e, i) { vmap[e.id] = valores ? valores[i] : (e.custo || 0); });
          per = Cronograma.periodos(r, { valores: vmap });
        }
      } catch (e) { per = null; }
      /* previsto × realizado: só aparece quando ALGUÉM MEDIU. O realizado vem
         do avanço físico da obra vinculada (`Fisico.serieMes`), a mesma fonte
         do painel — duas respostas para "quanto andou" na mesma empresa é pior
         que uma resposta faltando. */
      var conf = null;
      try {
        if (per && opts.realizado && typeof Cronograma !== "undefined" && Cronograma.confronto) {
          conf = Cronograma.confronto(per, opts.realizado);
          if (conf && !conf.temReal) conf = null;
        }
      } catch (e) { conf = null; }

      if (per && per.lista.length) {
        h += '<h2 class="rel-tit">4. Desembolso e frentes por mês</h2>';
        if (conf) {
          var sit = conf.situacao, corSit = sit === "atrasada" ? "#b91c1c" : (sit === "adiantada" ? "#15803d" : "#2e6f9e");
          h += '<div class="cron-nota" style="margin:0 0 8px"><b style="color:' + corSit + '">Obra ' + esc(sit) + '</b> — ' +
            'em ' + esc(conf.mesAtual.rotulo) + ' o previsto era <b>' + pct1(conf.mesAtual.previsto) + '</b> e o medido foi <b>' +
            pct1(conf.mesAtual.realizado) + '</b> (' + (conf.desvio > 0 ? "+" : "") + pct1(conf.desvio).replace("%", "") +
            ' pontos). Avanço apurado pelos diários de obra.</div>';
        }
        h += this._curvaS(per, valores ? "valor" : "peso", conf);
        h += '<table class="prop-tbl"><thead><tr><th>Mês</th>' +
          '<th class="r">Dias de trabalho</th>' +
          (valores ? '<th class="r">Desembolso (R$)</th>' : '') +
          '<th class="r">% do mês</th><th class="r">% acumulado</th>' +
          (conf ? '<th class="r" title="Avanço físico apurado pelos diários de obra.">Realizado</th><th class="r">Desvio</th>' : '') +
          '<th class="r" title="Quantas frentes de serviço precisam estar abertas ao mesmo tempo, em média, no mês.">Frentes (média)</th>' +
          '<th>Etapas no mês</th></tr></thead><tbody>';
        var idxEt = {}; r.etapas.forEach(function (e, i) { idxEt[e.id] = i + 1; });
        per.lista.forEach(function (p) {
          h += '<tr><td>' + esc(p.rotulo) + '</td>' +
            '<td class="r">' + p.diasUteis + '</td>' +
            (valores ? '<td class="r">' + moeda(p.valor) + '</td>' : '') +
            '<td class="r">' + pct1(p.pct) + '</td>' +
            '<td class="r">' + pct1(p.acumPct) + '</td>' +
            (conf ? (function () {
              var l = conf.linhas[p.i] || {};
              if (l.realizado == null) return '<td class="r">—</td><td class="r">—</td>';
              return '<td class="r">' + pct1(l.realizado) + '</td><td class="r" style="color:' +
                (l.desvio < -1 ? '#b91c1c' : (l.desvio > 1 ? '#15803d' : '#5a6b7b')) + '">' +
                (l.desvio > 0 ? '+' : '') + pct1(l.desvio).replace('%', '') + ' p.p.</td>';
            })() : '') +
            '<td class="r">' + (p.frentes ? p.frentes + '<b class="cron-barra cron-bfr"><span style="width:' +
              Math.max(2, Math.min(100, (p.frentes / (per.picoFrentes || 1)) * 100)).toFixed(0) + '%"></span></b>' : "—") + '</td>' +
            '<td>' + esc(p.etapas.map(function (id) { return "#" + idxEt[id]; }).join(", ")) + '</td></tr>';
        });
        h += '</tbody><tfoot><tr><td>TOTAL — ' + per.lista.length + ' ' + (per.lista.length === 1 ? 'mês' : 'meses') + '</td>' +
          '<td class="r">' + r.totalDias + '</td>' +
          (valores ? '<td class="r">' + moeda(per.total) + '</td>' : '') +
          '<td class="r">100,0%</td><td class="r"></td>' +
          (conf ? '<td class="r">' + pct1(conf.mesAtual.realizado) + '</td><td class="r">' +
            (conf.desvio > 0 ? '+' : '') + pct1(conf.desvio).replace('%', '') + ' p.p.</td>' : '') +
          '<td class="r" title="Mês de maior exigência de frentes simultâneas.">pico ' + per.picoFrentes + '</td>' +
          '<td>' + (per.mesPico ? 'em ' + esc(per.mesPico.rotulo) : '') + '</td></tr></tfoot></table>';
      }

      // ---- notas: o que estes números são, e o que eles NÃO são ----
      /* ⚠ A nota de feriados não é rodapé de praxe, e ela MUDA conforme o
         cálculo: com o desconto ligado, lista os dias que saíram; desligado,
         avisa que a data se desloca. Recado que não acompanha o que o sistema
         fez é pior que recado nenhum — a versão anterior deste documento dizia
         "feriados não são descontados" mesmo quando passariam a ser. */
      var fer = r.feriados || {}, nFer = (fer.noPeriodo || []).length;
      h += '<h2 class="rel-tit">5. Notas e critérios</h2><div class="cron-nota">' +
        '<b>Dias úteis:</b> o prazo é contado em <b>' + (p.diasUteisSemana || 5) + ' dias úteis por semana</b>. ' +
        (p.descontarFeriados === false
          ? '<b>Feriados não estão descontados</b> — havendo feriado no período, as datas se deslocam na mesma medida.'
          : (nFer
            ? 'Estão descontados <b>' + nFer + ' feriado' + (nFer === 1 ? '' : 's') + '</b> no período: ' +
              esc(fer.noPeriodo.map(function (x) { return x.data.slice(8, 10) + "/" + x.data.slice(5, 7) + " " + x.nome; }).join(" · ")) + '.'
            : 'Feriados nacionais estão descontados; nenhum cai em dia de trabalho neste período.')) +
        (fer.ajusteInicio ? ' O início foi ajustado de ' + esc(fer.ajusteInicio.de.split("-").reverse().join("/")) +
          ' para o primeiro dia de trabalho (' + esc(fer.ajusteInicio.motivo) + ').' : '') + '<br>' +
        '<b>Caminho crítico:</b> etapas sem folga. Atrasar qualquer uma delas atrasa a entrega da obra na mesma proporção.<br>' +
        '<b>Folga:</b> quanto a etapa pode atrasar sem mudar a entrega; a <b>data limite</b> é o fim já usando toda a folga.<br>' +
        '<b>Depende de:</b> número das etapas que precisam terminar antes (ex.: <b>1,3</b>). ' +
        '<b>1+7</b> = começa 7 dias úteis depois da 1ª (cura, secagem); <b>1-3</b> = começa 3 dias antes de a 1ª acabar.<br>' +
        '<b>Durações:</b> estimadas pela produtividade das composições de preço; onde há ✎, a duração foi informada pela equipe e prevalece.' +
        ((hierOk ? H.linhas.some(function (n) { return n.fonte === "subetapas"; }) : r.etapas.some(function (e) { return e.editado && own(vaoEt, e.id); }))
          ? ' Onde há ∑, a duração da etapa é o encadeamento das subetapas dela (cronograma executivo).' : '') + '<br>' +
        (nMarcos ? '<b>Marcos (◆):</b> eventos sem duração (entrega, vistoria, liberação) — aparecem como losango no gráfico.<br>' : '') +
        (hierOk ? this._notasHier(H) : '') +
        'Cronograma sujeito a condições de clima, liberação de frentes de serviço e fornecimento de materiais.' +
        '</div>';

      h += '<div class="cron-assin"><div><div class="l"></div>' + esc(empresa) + '<br><span style="color:#6b7b8a">Responsável Técnico</span></div></div>';

      var rod = empresa + " · Cronograma da obra · emitido em " + hoje;
      var cred = (typeof Empresa !== "undefined" && Empresa.creditoTexto) ? Empresa.creditoTexto() : "";
      if (cred) rod += " · " + cred;
      h += '<div class="rel-rod">' + esc(rod) + '</div>';

      return h + '</div>';
    }
  };

  global.CronoPDF = CronoPDF;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoPDF;
})(typeof window !== "undefined" ? window : this);

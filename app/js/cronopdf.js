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

  /* ⚠ CSS SÓ DO GANTT RECORTADO NO TEMPO (opts.mesesPorFolha), em <style>
     à parte pelo mesmo motivo do CSS_HIER: sem a opção, o documento de sempre
     não ganha um caractere. */
  var CSS_FAIXA =
    '<style>' +
    '.cron-doc .cdoc-gpag{margin:0 auto 10px}' +
    '.cron-doc .cdoc-gpag+.cdoc-gpag{margin-top:14px}' +
    '@media print{.cron-doc .cdoc-gpag{page-break-inside:avoid;break-inside:avoid}' +
    '.cron-doc .cdoc-gpag+.cdoc-gpag{page-break-before:always;break-before:page}}' +
    '</style>';

  // rótulo curto de mês — o mesmo alfabeto de `Cronograma.periodos` ("set/26")
  var MESES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

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
      /* ⚠ D3 — RECORTE NO EIXO DO TEMPO, e SÓ com `opts.mesesPorFolha`. Sem a
         opção `faixaDoc` é null e as três linhas abaixo são, caractere por
         caractere, as de sempre: é o que a paridade com o master cobra. */
      var faixaDoc = (opts.mesesPorFolha > 0) ? this._ganttTempoHTML(r, hierOk ? H.gantt : null, opts) : null;
      var svgUnico = opts.ganttSVG != null && !Array.isArray(opts.ganttSVG) && !(hierOk && H.gantt.length > this.POR_PAGINA);
      var svg = faixaDoc ? faixaDoc.html
        : (Array.isArray(opts.ganttSVG) ? opts.ganttSVG.map(function (s) { return '<div class="cron-gpag">' + s + '</div>'; }).join("")
        : (svgUnico ? opts.ganttSVG
        : (hierOk ? this._ganttPaginado(r, H, opts)
        : ((typeof UI !== "undefined" && UI._gantt) ? UI._gantt(r) : ""))));

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

      var h = CSS + (hierOk ? CSS_HIER : '') + (faixaDoc ? CSS_FAIXA : '') + '<div class="rel-doc cron-doc">';
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
      /* ⚠ recorte no tempo: a folha precisa DIZER o que ela não mostra. Barra
         que atravessa o corte leva seta nas bordas, e o elo cuja outra ponta
         ficou noutra folha sai contado — senão o leitor conclui que a etapa
         termina onde a folha termina. */
      if (faixaDoc) {
        var fx = faixaDoc.dados.faixas;
        h += '<div class="cron-nota"><b>Folhas do gráfico:</b> o Gantt está recortado por <b>faixa de tempo</b>' +
          (fx ? ' (' + fx.porFolha + ' mês(es) por folha, ' + fx.meses + ' no total)' : '') +
          ', com a mesma coluna de nomes e a régua de mês-calendário repetidas em todas. ' +
          'O triângulo preto na borda da barra diz que a etapa <b>começou antes</b> ou <b>continua depois</b> desta folha.' +
          (faixaDoc.elosFora ? ' ' + faixaDoc.elosFora + ' de ' + faixaDoc.elosTotal +
            ' elo(s) de precedência têm as pontas em folhas diferentes e não foram desenhados — eles estão na coluna “Depende de”.' : '') +
          (faixaDoc.dados.vazias ? ' ' + faixaDoc.dados.vazias + ' folha(s) do recorte não foram impressas por não ter nenhuma etapa no período.' : '') +
          '</div>';
      }

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
    },

    /* =====================================================================
       ===================  O PAPEL DOS DOCUMENTOS NOVOS  ==================

       Daqui para baixo NADA é chamado pelo `gerarHTML` sem opção explícita:
       o documento por etapa continua saindo byte a byte igual ao do master
       b8907ef (tools/test-crono-documentos.js:6-10 compara ~700 arquivos, e
       é o que a proposta e as 38 instalações imprimem). Documento novo é
       FUNÇÃO nova, com `<style>` próprio — o motivo está escrito em
       cronopdf.js:57-61 e vale igual aqui.

       O que mora aqui:
         · o SHELL paginado (D2): capa com logo, cabeçalho repetido, rodapé
           com "Página N de M", papel/orientação escolhíveis e índice;
         · o recorte do Gantt no EIXO DO TEMPO (D3), que hoje só paginava em
           linhas;
         · o papel dos quatro documentos do motor js/cronodocs.js (D1, D4,
           D7 e D9) — aqui só se DESENHA; número nenhum nasce nesta casa.

       ⚠ TODO TEXTO QUE VEM DE DADO PASSA POR esc(). `App._abrirPrint` faz
         `overlay.innerHTML = html` (js/app.js:11845): nome de obra, de
         tarefa, causa de não cumprimento e as considerações do responsável
         são texto do usuário, e este projeto já teve XSS por aspas em
         atributo (memória "XSS por aspas em onclick no admin").

       ⚠ O QUE NÃO PODE SAIR sai pela GUARDA DO MOTOR, não por `if` aqui: o
         `CronoDocs.publico(nivel)` já retira do payload custo, margem,
         folga, caminho crítico, restrição e causa. Este arquivo só desenha
         o que RESTOU, e ainda confere `payload.publico.<perm>` antes de
         imprimir os campos sensíveis — duas fechaduras na mesma porta, de
         propósito: a de cá pega o payload montado à mão por uma fiação
         futura, a de lá pega o esquecimento do desenhista.
       ===================================================================== */

    PAPEIS: {
      "a4-paisagem": { nome: "A4 paisagem", larg: 297, alt: 210, size: "A4 landscape" },
      "a4-retrato": { nome: "A4 retrato", larg: 210, alt: 297, size: "A4 portrait" },
      "a3-paisagem": { nome: "A3 paisagem", larg: 420, alt: 297, size: "A3 landscape" },
      "a3-retrato": { nome: "A3 retrato", larg: 297, alt: 420, size: "A3 portrait" }
    },
    MARGEM_MM: 12,

    /* Papel + a área ÚTIL em mm, que é o que decide quantas colunas de mês e
       quantas linhas cabem numa folha. `utilA` já desconta o rodapé. */
    papel: function (id) {
      var k = String(id == null ? "" : id).toLowerCase().replace(/\s+/g, "-");
      if (k === "a4") k = "a4-paisagem";
      if (k === "a3") k = "a3-paisagem";
      if (!this.PAPEIS[k]) k = "a4-paisagem";
      var p = this.PAPEIS[k], m = this.MARGEM_MM;
      return { id: k, nome: p.nome, larg: p.larg, alt: p.alt, size: p.size, margem: m,
        utilL: p.larg - 2 * m, utilA: p.alt - 2 * m - 8 };
    },

    /* ⚠ CORES LITERAIS, NUNCA TOKEN DE TEMA. Quem trabalha no tema escuro
       imprimia o entregável PRETO (o roteiro está em css/app.css:1487): os
       documentos usavam `var(--surface)` e o `print-color-adjust: exact`
       forçava o preto a sair na impressora. Aqui todo hexadecimal é cravado.
       ⚠ `@page{margin:0}` + a folha inteira em `.cdoc-pg`: é assim que a
       promessa "Página N de M" se sustenta — a margem mora no padding da
       seção, e uma seção é uma folha. Com margem no `@page` o navegador
       decide sozinho onde quebra, e a conta do rodapé vira mentira. */
    _cssDoc: function (P) {
      var m = P.margem;
      return '<style>' +
        '.cdoc-pg{position:relative;box-sizing:border-box;width:' + P.larg + 'mm;min-height:' + P.alt + 'mm;' +
        'padding:' + m + 'mm ' + m + 'mm ' + (m + 6) + 'mm;background:#fff;color:#16232f;margin:0 auto 14px;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.3);font-size:9.5pt;line-height:1.4;' +
        '-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        '.cdoc-pg>*{position:relative;z-index:1}' +
        '.cdoc-wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:56pt;' +
        'font-weight:700;color:rgba(15,39,64,.05);transform:rotate(-30deg);letter-spacing:4px;z-index:0;pointer-events:none}' +
        '.cdoc-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;' +
        'border-bottom:2px solid #2e6f9e;padding-bottom:5px;margin-bottom:9px}' +
        '.cdoc-cab .e{font-weight:700;color:#2e6f9e;letter-spacing:.4px;font-size:8.6pt}' +
        '.cdoc-cab h1{font-size:13.5pt;color:#0f2740;margin:1px 0 0;line-height:1.15}' +
        '.cdoc-cab .s{color:#5a6b7b;font-size:8.6pt}' +
        '.cdoc-cab .m{text-align:right;font-size:8pt;color:#334155;white-space:nowrap}' +
        '.cdoc-cab .m span{color:#7a8a99}' +
        '.cdoc-cab img{max-height:13mm;max-width:48mm;object-fit:contain;display:block;margin-bottom:3px}' +
        '.cdoc-cab .logo-ph{display:inline-block;border:1px dashed #b6c6d6;border-radius:4px;padding:2px 6px;' +
        'color:#7a8a99;font-size:7.6pt;margin-bottom:3px}' +
        '.cdoc-tit{font-size:11pt;color:#0f2740;border-left:4px solid #2e6f9e;padding-left:8px;margin:0 0 7px}' +
        '.cdoc-rod{position:absolute;left:' + m + 'mm;right:' + m + 'mm;bottom:' + (m - 5) + 'mm;' +
        'border-top:1px solid #d8e0ea;padding-top:3px;font-size:7.4pt;color:#7a8a99;display:flex;' +
        'justify-content:space-between;gap:10px}' +
        '.cdoc-rod b{color:#0f2740}' +
        '.cdoc-capa{background:#0f2740;color:#fff;display:flex;flex-direction:column}' +
        '.cdoc-capa .logo-ph{border:2px dashed rgba(255,255,255,.4);padding:10px 16px;display:inline-block;' +
        'border-radius:8px;color:rgba(255,255,255,.85);font-weight:600;font-size:11pt}' +
        '.cdoc-capa h1{font-size:25pt;margin:12px 0 6px;color:#fff;line-height:1.12}' +
        '.cdoc-capa .kick{letter-spacing:5px;font-size:9.5pt;color:#9be7af;font-weight:700}' +
        '.cdoc-capa .sub{font-size:12pt;color:#cfe0ef}' +
        '.cdoc-capa .info{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);' +
        'border-radius:8px;padding:10px 16px;margin:16px 0}' +
        '.cdoc-capa .info div{display:flex;justify-content:space-between;gap:14px;padding:5px 0;' +
        'border-bottom:1px solid rgba(255,255,255,.1);font-size:10pt}' +
        '.cdoc-capa .info div:last-child{border-bottom:none}' +
        '.cdoc-capa .info span{color:#a9c4dc}' +
        '.cdoc-capa .rod{margin-top:auto;font-size:8.5pt;color:rgba(255,255,255,.65);' +
        'border-top:1px solid rgba(255,255,255,.12);padding-top:10px}' +
        '.cdoc-tarja{display:inline-block;border:1px solid #b45309;color:#7c4a06;background:#fdf6ec;' +
        'border-radius:4px;padding:1px 8px;font-size:8pt;font-weight:700;letter-spacing:.5px}' +
        '.cdoc-capa .cdoc-tarja{border-color:rgba(255,255,255,.5);color:#fff;background:rgba(255,255,255,.10)}' +
        'table.cdoc-tbl{width:100%;border-collapse:collapse;font-size:8pt;margin:0 0 6px}' +
        'table.cdoc-tbl th,table.cdoc-tbl td{border:1px solid #d8e0ea;padding:2px 4px;text-align:left;vertical-align:top}' +
        'table.cdoc-tbl thead th{background:#0f2740;color:#fff;font-weight:700;font-size:7.4pt;line-height:1.2}' +
        'table.cdoc-tbl tbody tr:nth-child(even) td{background:#f7fafd}' +
        'table.cdoc-tbl td.r,table.cdoc-tbl th.r{text-align:right;font-variant-numeric:tabular-nums}' +
        'table.cdoc-tbl td.c,table.cdoc-tbl th.c{text-align:center}' +
        'table.cdoc-tbl tfoot td{background:#eef4fa;font-weight:700;border-top:2px solid #0f2740}' +
        'table.cdoc-tbl td i{display:block;font-style:normal;font-size:6.8pt;color:#5a6b7b}' +
        'table.cdoc-tbl th.dest,table.cdoc-tbl td.dest{background:#fff7e6}' +
        'table.cdoc-tbl thead th.dest{background:#b45309;color:#fff}' +
        'table.cdoc-tbl tr.fora td{color:#7a8a99;font-style:italic}' +
        'table.cdoc-mtz{table-layout:fixed}' +
        '.cdoc-mtz td.nm{word-wrap:break-word;overflow-wrap:break-word}' +
        '.cdoc-mtz td.v{font-size:7.6pt}' +
        '.cdoc-vazio{color:#c3cfdb}' +
        '.cdoc-tag{font-size:6.8pt;font-weight:600;color:#7c4a06;background:#fdf6ec;border:1px solid #e6c99a;' +
        'border-radius:3px;padding:0 3px}' +
        '.cdoc-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:0 0 9px}' +
        '.cdoc-kpis.k2{grid-template-columns:repeat(2,1fr)}' +
        '.cdoc-kpi{border:1px solid #d8e0ea;border-radius:6px;padding:5px 9px}' +
        /* ⚠ `> span`, nunca `span`: a unidade ("%") mora num <span> DENTRO do
           <b> do número, e a regra larga a jogava para a linha de baixo — o
           cartão saiu com "0,5" e "%" em linhas diferentes (visto na foto). */
        '.cdoc-kpi>span{display:block;font-size:7.2pt;text-transform:uppercase;color:#7a8a99;letter-spacing:.3px}' +
        '.cdoc-kpi b span{display:inline;font-size:9pt;color:#5a6b7b;text-transform:none;letter-spacing:0}' +
        '.cdoc-kpi b{font-size:15pt;color:#0f2740;font-variant-numeric:tabular-nums;line-height:1.2}' +
        '.cdoc-kpi i{display:block;font-style:normal;font-size:7pt;color:#5a6b7b;margin-top:2px;line-height:1.3}' +
        '.cdoc-nota{font-size:7.8pt;color:#5a6b7b;line-height:1.45;margin-top:5px}' +
        '.cdoc-nota b{color:#0f2740}' +
        '.cdoc-aviso{border-left:4px solid #b45309;background:#fdf6ec;padding:6px 10px;margin:6px 0;' +
        'font-size:8.2pt;color:#7c4a06}' +
        '.cdoc-texto{border:1px solid #d8e0ea;border-radius:6px;padding:8px 11px;font-size:9pt;' +
        'line-height:1.5;white-space:pre-wrap;min-height:18mm}' +
        '.cdoc-vago{color:#9aa8b6;font-style:italic}' +
        '.cdoc-ok{color:#15803d;font-weight:700}.cdoc-nao{color:#b91c1c;font-weight:700}' +
        '.cdoc-assin{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:16mm;text-align:center;font-size:9pt}' +
        '.cdoc-assin .l{border-top:1.4px solid #16232f;margin-bottom:5px}' +
        '.cdoc-legenda{display:flex;flex-wrap:wrap;gap:6px 15px;font-size:7.6pt;color:#5a6b7b;margin:4px 0}' +
        '.cdoc-legenda i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px;font-style:normal}' +
        '.cdoc-fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}' +
        '.cdoc-foto{border:1px solid #d8e0ea;border-radius:6px;overflow:hidden}' +
        '.cdoc-foto .q{height:38mm;background:#eef2f7;display:flex;align-items:center;justify-content:center;' +
        'color:#9aa8b6;font-size:8pt;text-align:center;padding:4px}' +
        '.cdoc-foto img{width:100%;height:38mm;object-fit:cover;display:block}' +
        '.cdoc-foto .c{padding:4px 6px;font-size:7.6pt;color:#334155}' +
        '.cdoc-pg .rel-doc{width:auto;max-width:none;padding:0;margin:0;box-shadow:none;background:transparent}' +
        '@media print{@page{size:' + P.size + ';margin:0}' +
        '.cdoc-pg{margin:0;box-shadow:none;page-break-after:always;break-after:page}' +
        '.cdoc-pg:last-child{page-break-after:auto;break-after:auto}' +
        'table.cdoc-tbl tr{page-break-inside:avoid;break-inside:avoid}}' +
        '</style>';
    },

    /* Construtor do documento paginado. Cada `secao`/`continua` é UMA folha —
       e é por isso que o "Página N de M" pode ser escrito: o gerador paginou,
       não o navegador. Conteúdo maior que a folha se corta com `tabela()`,
       que fatia a MESMA tabela já montada (nenhuma linha se reescreve). */
    documento: function (opc) {
      opc = opc || {};
      var self = this, P = this.papel(opc.papel);
      var emp = (opc.empresa != null && opc.empresa !== "") ? String(opc.empresa)
        : (((typeof Empresa !== "undefined" && Empresa.nomeDoc) ? Empresa.nomeDoc() : "") || "Sua Empresa");
      var wm = (opc.marcaDagua != null) ? String(opc.marcaDagua)
        : ((typeof Empresa !== "undefined" && Empresa.marcaDaguaTexto) ? Empresa.marcaDaguaTexto() : emp);
      var cred = (typeof Empresa !== "undefined" && Empresa.creditoTexto) ? Empresa.creditoTexto() : "";
      var nivel = opc.nivel ? String(opc.nivel) : "";
      var hojeTxt = opc.emissao ? String(opc.emissao) : new Date().toLocaleDateString("pt-BR");
      var pags = [], secoes = [];
      /* ⚠ O LOGO ENTRA UMA VEZ SÓ. `Empresa.logoHTML` devolve um <img> com o
         logo em base64 (data URI); repetido no cabeçalho de 20 folhas, o mesmo
         arquivo viaja 20 vezes dentro do HTML que o `_abrirPrint` injeta no
         DOM — relatório mensal com foto já é o caso em que o navegador trava na
         hora de imprimir. Aqui ele vira REGRA de CSS, escrita uma vez, e cada
         folha carrega só uma <div> vazia. */
      var logoBruto = (opc.logoHTML != null) ? String(opc.logoHTML)
        : ((typeof Empresa !== "undefined" && Empresa.logoHTML) ? Empresa.logoHTML(70) : "");
      var mSrc = /<img[^>]+src="([^"]+)"/.exec(logoBruto);
      var cssLogo = mSrc ? ('<style>.cdoc-logo{background:url("' + mSrc[1] + '") no-repeat left center;' +
        'background-size:contain;display:block}' +
        '.cdoc-cab .cdoc-logo{width:48mm;height:13mm;margin-bottom:3px}' +
        '.cdoc-capa .cdoc-logo{width:62mm;height:22mm}</style>') : "";
      function logo(maxH) {
        if (mSrc) return '<div class="cdoc-logo"></div>';
        return logoBruto;
      }
      var api = {
        papel: P, empresa: emp, secoes: secoes, paginas: pags,
        secao: function (titulo, corpo) {
          secoes.push({ titulo: String(titulo == null ? "" : titulo), i: pags.length });
          pags.push({ titulo: titulo, corpo: corpo || "" });
          return api;
        },
        continua: function (titulo, corpo) {
          pags.push({ titulo: titulo, corpo: corpo || "" });
          return api;
        },
        /* tabela fatiada em folhas de `porPag` linhas: a 1ª abre a seção, as
           demais continuam. `antes`/`depois` entram só na 1ª e na última. */
        tabela: function (titulo, tab, porPag, o2) {
          o2 = o2 || {};
          /* o bloco de topo (`antes`) só existe na 1ª folha: descontá-lo de
             todas é o que fabrica folha de continuação quase vazia */
          var prim = o2.antes ? (porPag - self._alturaBlocosMM([o2.antes], P.utilL)) : porPag;
          var partes = self._fatiar(tab, porPag, o2.custos, prim), i;
          for (i = 0; i < partes.length; i++) {
            var corpo = ((o2.antes && i === 0) ? o2.antes : "") + partes[i] +
              ((o2.depois && i === partes.length - 1) ? o2.depois : "");
            if (i === 0) api.secao(titulo, corpo);
            else api.continua(titulo + " (continuação " + (i + 1) + " de " + partes.length + ")", corpo);
          }
          return api;
        },
        html: function () {
          var comCapa = opc.capa !== false;
          var comInd = (opc.indice == null) ? (comCapa && secoes.length > 4) : !!opc.indice;
          var pre = (comCapa ? 1 : 0) + (comInd ? 1 : 0);
          var total = pre + pags.length, n = 0;
          var metaCab = (opc.meta || []).slice(0, 4);
          var wmH = wm ? '<div class="cdoc-wm">' + esc(wm) + '</div>' : '';
          function cab(tit) {
            return '<div class="cdoc-cab"><div>' + logo(36) +
              '<div class="e">' + esc(emp) + '</div>' +
              '<h1>' + esc(opc.titulo || "") + '</h1>' +
              (opc.subtitulo ? '<div class="s">' + esc(opc.subtitulo) + '</div>' : '') + '</div>' +
              '<div class="m">' + metaCab.map(function (x) {
                return '<div><span>' + esc(x[0]) + '</span> ' + esc(x[1]) + '</div>';
              }).join("") + '</div></div>' +
              (tit ? '<h2 class="cdoc-tit">' + esc(tit) + '</h2>' : '');
          }
          function rod(num) {
            return '<div class="cdoc-rod"><span>' + esc(emp) + (nivel ? ' · ' + esc(nivel) : '') + '</span>' +
              '<span>' + esc(opc.titulo || "") + (opc.obra ? ' · ' + esc(opc.obra) : '') + '</span>' +
              '<span>emitido em ' + esc(hojeTxt) + '</span>' +
              '<span><b>Página ' + num + ' de ' + total + '</b></span></div>';
          }
          var out = self._cssDoc(P) + cssLogo + '<div class="cdoc">';
          if (comCapa) {
            n++;
            out += '<section class="cdoc-pg cdoc-capa"><div>' + logo(70) + '</div>' +
              '<div style="margin:auto 0">' +
              (opc.kicker ? '<div class="kick">' + esc(opc.kicker) + '</div>' : '') +
              '<h1>' + esc(opc.titulo || "") + '</h1>' +
              (opc.subtitulo ? '<div class="sub">' + esc(opc.subtitulo) + '</div>' : '') +
              ((opc.meta || []).length ? '<div class="info">' + (opc.meta || []).map(function (x) {
                return '<div><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>';
              }).join("") + '</div>' : '') +
              (nivel ? '<div><span class="cdoc-tarja">' + esc(nivel) + '</span></div>' : '') +
              '</div>' +
              '<div class="rod">' + esc(emp) + ' · ' + esc(opc.titulo || "") + ' · emitido em ' + esc(hojeTxt) +
              (cred ? ' · ' + esc(cred) : '') + '</div></section>';
          }
          if (comInd) {
            n++;
            out += '<section class="cdoc-pg">' + wmH + cab("Índice") +
              '<table class="cdoc-tbl"><thead><tr><th class="r" style="width:12mm">#</th><th>Seção</th>' +
              '<th class="r" style="width:24mm">Página</th></tr></thead><tbody>' +
              secoes.map(function (s, i) {
                return '<tr><td class="r">' + (i + 1) + '</td><td>' + esc(s.titulo) + '</td><td class="r">' +
                  (pre + s.i + 1) + '</td></tr>';
              }).join("") + '</tbody></table>' +
              '<div class="cdoc-nota">Documento com <b>' + total + '</b> folha' + (total === 1 ? '' : 's') +
              ', numeradas no rodapé. Confira a última folha antes de rubricar: o modelo oficial pede a rubrica em todas.</div>' +
              rod(n) + '</section>';
          }
          pags.forEach(function (pg) {
            n++;
            out += '<section class="cdoc-pg">' + wmH + cab(pg.titulo) + pg.corpo + rod(n) + '</section>';
          });
          return out + '</div>';
        }
      };
      return api;
    },

    /* Fatia UMA tabela já montada em folhas de `porPag` linhas, preservando
       `thead` em todas e `tfoot` só na última.
       ⚠ NENHUMA LINHA SE REESCREVE: o `<tr>` que sai daqui é exatamente o que
       entrou. Foi a forma de paginar sem ter uma segunda cópia do código que
       monta a linha — réplica apodrece calada (33 módulos desta base já
       copiaram o `Util.parseNum`, com dois erros opostos movendo dinheiro).
       Cabendo tudo numa folha, devolve a tabela INTACTA (a string original). */
    _fatiar: function (tab, orcamento, custos, orcPrimeira) {
      var s = String(tab == null ? "" : tab);
      var orc = (orcamento > 0) ? orcamento : 0;
      var iAb = s.indexOf("<table"), iFe = s.lastIndexOf("</table>");
      if (!orc || iAb < 0 || iFe < 0) return [s];
      var abre = s.slice(0, s.indexOf(">", iAb) + 1), depois = s.slice(iFe);
      var meio = s.slice(abre.length, iFe);
      var mH = /<thead[\s\S]*?<\/thead>/.exec(meio), mF = /<tfoot[\s\S]*?<\/tfoot>/.exec(meio);
      var thead = mH ? mH[0] : "", tfoot = mF ? mF[0] : "";
      var corpo = meio.replace(thead, "").replace(tfoot, "");
      var linhas = [], re = /<tr[\s\S]*?<\/tr>/g, m;
      while ((m = re.exec(corpo))) linhas.push(m[0]);
      if (!linhas.length) return [s];
      var c = [], i;
      for (i = 0; i < linhas.length; i++) c.push((custos && custos[i] > 0) ? custos[i] : 1);
      var grupos = this._paginar(c, orc, orcPrimeira);
      if (grupos.length <= 1) return [s];
      var out = [];
      grupos.forEach(function (g, k) {
        var bloco = g.map(function (j) { return linhas[j]; });
        out.push(abre + thead + "<tbody>" + bloco.join("") + "</tbody>" +
          (k === grupos.length - 1 ? tfoot : "") + depois);
      });
      return out;
    },

    /* Reparte os índices em folhas sem estourar o orçamento da folha.
       ⚠ DUAS PASSADAS, e a segunda não é luxo: a primeira diz de quantas
       folhas o conteúdo precisa; a segunda reparte pelo ALVO (total ÷ folhas)
       para não sobrar uma folha com uma linha só — a linha órfã que o leitor
       lê como "faltou alguma coisa aqui". O teto da folha continua sendo o
       orçamento real, nunca o alvo. */
    _paginar: function (custos, orcamento, orcPrimeira) {
      var orc = orcamento > 0 ? orcamento : 1, i, total = 0;
      /* ⚠ A PRIMEIRA FOLHA TEM MENOS ESPAÇO QUE AS OUTRAS, e descontar o
         bloco de topo (curva S, cartões de KPI) de TODAS era o que fabricava
         a folha órfã: a seção "Desembolso e frentes por mês" saía 5+5+5+5+1,
         com 134 mm de branco na última, porque as folhas 2..5 recebiam 53 mm
         de orçamento quando tinham 122 mm livres. Quem chama passa o
         orçamento da 1ª à parte; sem ele, tudo segue como antes. */
      var orc1 = orcPrimeira > 0 ? orcPrimeira : orc;
      for (i = 0; i < custos.length; i++) total += custos[i];
      function teto(iPag, fator) { return (iPag === 0 ? orc1 : orc) * fator; }
      function encher(fator) {
        var out = [], cur = [], a = 0, k;
        for (k = 0; k < custos.length; k++) {
          if (cur.length && (a + custos[k] > teto(out.length, fator))) { out.push(cur); cur = []; a = 0; }
          cur.push(k); a += custos[k];
        }
        if (cur.length) out.push(cur);
        return out;
      }
      /* ⚠ FOLHAS EQUILIBRADAS SEM FOLHA A MAIS. Com o alvo cravado em
         total÷folhas nascia uma folha com UMA linha (visto: 10 + 10 + 1) —
         o arredondamento de cada corte empurra a sobra para o fim. E baixar o
         alvo de novo só multiplica as folhas (visto: 23 folhas de 2 linhas).
         Aqui a busca é pelo MENOR fator que ainda cabe no mesmo número de
         folhas do corte guloso — equilibra sem nunca passar do orçamento. */
      var melhor = encher(1), min = melhor.length;
      var lo = 0, hi = 1, volta;
      for (volta = 0; volta < 14; volta++) {
        var mid = (lo + hi) / 2, t = encher(mid);
        if (t.length <= min && t.length === min) { melhor = t; hi = mid; } else { lo = mid; }
      }
      /* ⚠ CUSTO UNIFORME NÃO SE EQUILIBRA POR ALVO DE CUSTO. Quando todas as
         linhas custam o mesmo (21 linhas de 9,5 mm), `encher(alvo)` sempre
         produz ⌊alvo/c⌋ por folha: NENHUM alvo gera 5+4+4+4+4 — só 5+5+5+5+1
         ou 4+4+4+4+4+1. O comentário acima descrevia o caso que o código não
         cobria. Aqui, quando a última folha fica com menos de 40% do que
         sobraria em média, reparte por CONTAGEM (base = ⌊n/folhas⌋, e as
         primeiras folhas levam o resto) e só aceita se cada folha continuar
         cabendo no orçamento dela. */
      if (melhor.length > 1) {
        var ult = 0, gU = melhor[melhor.length - 1], z;
        for (z = 0; z < gU.length; z++) ult += custos[gU[z]];
        if (ult < (total / melhor.length) * 0.4) {
          var eq = this._porContagem(custos, melhor.length, orc, orc1);
          if (eq) melhor = eq;
        }
      }
      return melhor;
    },

    /* Reparte por CONTAGEM em `folhas` grupos (as primeiras levam o resto) e
       devolve `null` se algum grupo estourar o orçamento da folha dele. */
    _porContagem: function (custos, folhas, orc, orc1) {
      var n = custos.length;
      if (!(folhas > 1) || n < folhas) return null;
      var base = Math.floor(n / folhas), resto = n % folhas, out = [], i = 0, g, k, soma;
      for (g = 0; g < folhas; g++) {
        var quantos = base + (g < resto ? 1 : 0), grupo = [];
        soma = 0;
        for (k = 0; k < quantos; k++) { grupo.push(i); soma += custos[i]; i++; }
        if (soma > (g === 0 ? orc1 : orc)) return null;
        out.push(grupo);
      }
      return out;
    },

    /* Quanto cada linha de uma tabela ocupa, em mm. A conta é sobre a CÉLULA
       MAIS LONGA: numa tabela de obra é o nome do serviço que decide se a
       linha quebra em duas ("ALVENARIA DE VEDAÇÃO COM BLOCO CERÂMICO 14 CM"
       não cabe em 56 mm a 8 pt). Estimativa declarada, e conferida de fora:
       a e2e conta as folhas do PDF de verdade e reprova se a conta mentir. */
    _custoTRs: function (tab, chars, alturaMM, extraMM) {
      var c = chars > 0 ? chars : 40, alt = alturaMM > 0 ? alturaMM : 3.2, ex = extraMM > 0 ? extraMM : 0;
      var linhas = [], re = /<tr[\s\S]*?<\/tr>/g, m, s = String(tab == null ? "" : tab);
      var corpo = s.replace(/<thead[\s\S]*?<\/thead>/, "").replace(/<tfoot[\s\S]*?<\/tfoot>/, "");
      while ((m = re.exec(corpo))) linhas.push(m[0]);
      return linhas.map(function (tr) {
        var maior = 0, rc = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g, x;
        while ((x = rc.exec(tr))) {
          var t2 = x[1].replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, "x").replace(/\s+/g, " ").replace(/^ | $/g, "");
          if (t2.length > maior) maior = t2.length;
        }
        return alt * Math.max(1, Math.ceil(maior / c)) + ex;
      });
    },

    /* Altura ESTIMADA de um pedaço de HTML na largura dada, em mm. Um SVG
       responde pela proporção do próprio viewBox (é exato); texto sai por
       estimativa declarada. Serve para saber quanto sobra da folha para a
       tabela — antes disso o gerador reservava um número fixo, e a curva S
       (58 mm) fazia a primeira folha estourar toda vez. */
    _alturaBlocosMM: function (blocos, largMM) {
      var larg = largMM > 0 ? largMM : 180, total = 0;
      (blocos || []).forEach(function (b) {
        var s = String(b == null ? "" : b);
        var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(s);
        if (vb && +vb[1] > 0) {
          var m = /max-width:(\d+)mm/.exec(s);
          var L = m ? Math.min(larg, +m[1]) : larg;
          total += (+vb[2] / +vb[1]) * L + 4;
          return;
        }
        var txt = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");
        if (!txt) { total += 2; return; }
        var porLinha = Math.max(20, Math.floor(larg / 1.7));
        total += Math.ceil(txt.length / porLinha) * 4.2 + 3;
      });
      return total;
    },

    /* Blocos de topo de um HTML bem formado, com as tags BALANCEADAS.
       ⚠ Cortar por `indexOf("</div>")` já produziu seções com div a mais e a
       menos (medido em 11/09/2026: 5 das 13 folhas do cronograma paginado
       saíam desbalanceadas, e o navegador aninhava uma folha dentro da
       outra — o PDF vinha com MENOS páginas do que o rodapé prometia). */
    _blocosTopo: function (html) {
      var s = String(html == null ? "" : html), out = [], i = 0, ini = -1, prof = 0;
      var VAZIAS = { br: 1, img: 1, hr: 1, input: 1, meta: 1, link: 1, col: 1, source: 1, wbr: 1 };
      while (i < s.length) {
        var a = s.indexOf("<", i);
        if (a < 0) break;
        var b = s.indexOf(">", a);
        if (b < 0) break;
        var tag = s.slice(a + 1, b);
        if (tag.charAt(0) === "!") { i = b + 1; continue; }   // comentário/doctype
        var fecha = tag.charAt(0) === "/";
        var nome = (fecha ? tag.slice(1) : tag).split(/[\s/>]/)[0].toLowerCase();
        var auto = tag.charAt(tag.length - 1) === "/";
        if (prof === 0 && ini < 0) ini = a;
        if (fecha) prof--;
        else if (!auto && !VAZIAS[nome]) prof++;
        if (prof <= 0) { out.push(s.slice(ini, b + 1)); ini = -1; prof = 0; }
        i = b + 1;
      }
      if (ini >= 0 && ini < s.length) out.push(s.slice(ini));   // resto (HTML torto): não se perde
      return out;
    },

    /* ================================================================
       D3 — O GANTT PAGINADO NO EIXO DO TEMPO

       O documento de hoje só corta em LINHAS (`paginasGantt`, 22 por folha)
       e espreme a obra inteira na largura de uma folha: numa obra de 20
       meses cada mês fica com ~13 mm e a barra mínima é forçada a 4 px
       (js/ui.js:2646) — o Gantt impresso vira um borrão onde nenhuma data é
       legível.

       ⚠ A ESCALA NÃO É REIMPLEMENTADA: a geometria (largura do desenho, da
         coluna de rótulos, altura da linha) é MEDIDA do próprio `UI._gantt`
         com um desenho-sonda, e a conta de X é a mesma dele —
         `labelW + min(1, d/dias) * plotW`, só que `d` corre dentro da faixa.
         Medir em vez de decorar: se o `ui.js` mudar a largura, a faixa anda
         junto, e a suíte compara as duas de verdade (test-crono-papel,
         bloco "a faixa inteira cai em cima do desenho de sempre").
       ================================================================ */

    /* geometria do desenhista, medida com uma sonda de 2 linhas */
    _geoGantt: function (pintar) {
      var padrao = { W: 880, labelW: 184, plotW: 682, rowH: 30, top: 22, barH: 18, medida: false };
      if (typeof pintar !== "function") return padrao;
      function no(i) {
        var d0 = new Date(2026, 0, 5), d1 = new Date(2026, 0, 16);
        return { id: "sonda" + i, codigo: "", nome: "sonda", categoria: "outros", categoriaNome: "Outros",
          cor: "#94a3b8", inicio: 0, fim: 10, duracao: 10, folga: 0, critico: false, marco: false, editado: false,
          preds: [], predsExplicito: false, predLag: {}, predDesloc: {},
          dataInicio: d0, dataFim: d1, dataLimite: d1 };
      }
      var r = { etapas: [no(0), no(1)], totalDias: 10, totalSemanas: 2,
        dataInicio: new Date(2026, 0, 5), dataFim: new Date(2026, 0, 16),
        params: { diasUteisSemana: 5, paralelismo: 0 }, feriados: {}, caminhoCritico: [], temCiclo: false };
      var svg = "";
      try { svg = String(pintar(r) || ""); } catch (e) { return padrao; }
      var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      var re = /<rect class="gantt-barra[^"]*" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g;
      var a = re.exec(svg), b = re.exec(svg);
      if (!vb || !a || !b) return padrao;
      var g = { W: +vb[1], labelW: +a[1], plotW: +a[3], rowH: +b[2] - +a[2], top: +a[2] - 5, barH: +a[4], medida: true };
      if (!(g.W > 0 && g.plotW > 0 && g.rowH > 0 && g.barH > 0)) return padrao;
      return g;
    },

    /* Faixas de tempo: os meses do cronograma agrupados em folhas.
       O calendário (dia útil -> data) é o do motor — `Cronograma.calendario`,
       a MESMA régua das barras, com feriado. Sem ele, não há faixa (e o
       documento sai como sempre, dizendo que não paginou no tempo). */
    faixasTempo: function (r, mesesPorFolha) {
      if (!r || !r.dataInicio || typeof Cronograma === "undefined" || !Cronograma.calendario) return null;
      var cal = null;
      try { cal = Cronograma.calendario(r); } catch (e) { cal = null; }
      if (!cal) return null;
      var dias = Math.max(1, Math.ceil(r.totalDias || 0)), meses = [], atual = null, k, d;
      for (k = 0; k < dias; k++) {
        d = cal.dia(k);
        if (!d || isNaN(d.getTime())) break;
        var ch = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
        if (!atual || atual.chave !== ch) {
          atual = { chave: ch, rotulo: MESES3[d.getMonth()] + "/" + String(d.getFullYear()).slice(2),
            de: k, ate: k + 1, dataDe: d };
          meses.push(atual);
        } else { atual.ate = k + 1; }
      }
      if (!meses.length) return null;
      var por = (mesesPorFolha > 0) ? Math.floor(mesesPorFolha) : meses.length;
      var faixas = [], i;
      for (i = 0; i < meses.length; i += por) {
        var g = meses.slice(i, i + por), ult = g[g.length - 1];
        faixas.push({ i: faixas.length, mesDe: i + 1, mesAte: i + g.length, nMeses: g.length, meses: g,
          diaDe: g[0].de, diaAte: ult.ate,
          rotulo: g[0].rotulo + (g.length > 1 ? " a " + ult.rotulo : ""),
          dataDe: g[0].dataDe, dataAte: cal.dia(Math.max(0, ult.ate - 1)) });
      }
      return { meses: meses.length, porFolha: por, faixas: faixas, dias: dias };
    },

    /* Uma folha do Gantt: as MESMAS linhas da parte, só que dentro de uma
       faixa de tempo. Barra que atravessa o corte leva seta de continuação
       nas duas bordas — sem isso a etapa PARECE terminar no fim da folha. */
    _ganttFaixaSVG: function (r, nos, faixa, geo, opts) {
      opts = opts || {};
      var G = geo, dias = Math.max(1, faixa.diaAte - faixa.diaDe);
      var dir = G.labelW + G.plotW;
      /* ⚠ a MESMA conta do UI._gantt (js/ui.js:2613), com a faixa somada:
         labelW + min(1, max(0, (d - diaDe)/dias)) * plotW. O max(0) é o que o
         desenho de sempre não precisa (lá a faixa começa em 0) e aqui é
         obrigatório: sem ele, barra que começou antes da folha seria desenhada
         À ESQUERDA, por cima da coluna de nomes. */
      function X(d) { return G.labelW + Math.min(1, Math.max(0, (d - faixa.diaDe) / dias)) * G.plotW; }
      function yBar(i) { return G.top + i * G.rowH + 5; }
      var h = G.top + nos.length * G.rowH + 12;
      var maxCh = Math.max(12, Math.floor((G.labelW - 10) / 5.6));
      /* ⚠ NOME TRUNCADO FAZ DUAS ETAPAS VIRAREM A MESMA LINHA. Com labelW=184
         cabem 31 caracteres, e na obra de 21 etapas TODOS os 22 rótulos saíam
         com reticências — dois deles idênticos ("5 ESTRUTURA DE CONCRETO
         ARMADO…" e "6 ESTRUTURA DE CONCRETO ARMADO…", que no orçamento são
         TÉRREO e PAVIMENTO TIPO). Alargar `labelW` estreitaria o desenho e
         mudaria o X de toda barra: a suíte compara barra a barra com o
         `UI._gantt`, e dois cronogramas com o mesmo nome é o defeito maior.
         Por isso a segunda linha, que não custa um pixel de geometria: a
         altura da linha é 30 px e a barra ocupa 18. */
      function quebrarRotulo(s2, max) {
        if (s2.length <= max) return [s2];
        var corte = s2.lastIndexOf(" ", max);
        if (corte < Math.floor(max * 0.45)) corte = max;       // palavra única e longa: corta duro
        var a2 = s2.slice(0, corte).replace(/\s+$/, "");
        var b2 = s2.slice(corte).replace(/^\s+/, "");
        if (b2.length > max) b2 = b2.slice(0, max - 1) + "…";   // três linhas não cabem na altura
        return [a2, b2];
      }
      var s = '<svg class="gantt cdoc-gantt" viewBox="0 0 ' + G.W + ' ' + h + '" style="width:100%;background:#fff;' +
        'border:1px solid #e2e8f0;border-radius:8px;font-family:inherit">';
      // régua de MÊS-CALENDÁRIO (quem lê cronograma de obra procura "mar/26", não "S17")
      faixa.meses.forEach(function (m2) {
        var gx = X(m2.de);
        s += '<line x1="' + gx.toFixed(1) + '" y1="' + G.top + '" x2="' + gx.toFixed(1) + '" y2="' + (h - 8) +
          '" stroke="#dbe4ee" stroke-width="1"/>';
        /* ⚠ o rótulo do ÚLTIMO mês não pode sair pela borda: em fev/27 a out/27 o
           "out/27" saiu cortado ("out/2") na foto da folha 2. Perto do fim, o
           rótulo ancora à direita — mais vale encostado que decepado. */
        var perto = gx > dir - 34;
        s += '<text x="' + (perto ? (dir - 2).toFixed(1) : (gx + 3).toFixed(1)) + '" y="' + (G.top - 7) +
          '" font-size="9" fill="#64748b"' + (perto ? ' text-anchor="end"' : '') + '>' + esc(m2.rotulo) + '</text>';
      });
      s += '<line x1="' + dir.toFixed(1) + '" y1="' + G.top + '" x2="' + dir.toFixed(1) + '" y2="' + (h - 8) + '" stroke="#dbe4ee" stroke-width="1"/>';
      // linha de HOJE, pelo motor (mesma régua das barras, com feriado)
      var jHoje = null;
      try { jHoje = Cronograma.diaUtilDoCorte(r, opts.hoje); } catch (e2) { jHoje = null; }
      if (jHoje != null && jHoje >= faixa.diaDe && jHoje <= faixa.diaAte) {
        s += '<line x1="' + X(jHoje).toFixed(1) + '" y1="' + (G.top - 2) + '" x2="' + X(jHoje).toFixed(1) + '" y2="' + (h - 8) +
          '" stroke="#b45309" stroke-width="1.2" stroke-dasharray="4,3"><title>hoje</title></line>';
      }
      var idxNa = {};
      nos.forEach(function (no, i) { idxNa[no.id] = i; });
      var elosFora = 0;
      nos.forEach(function (no, i) {
        var y = yBar(i), fora = (no.fim <= faixa.diaDe) || (no.inicio >= faixa.diaAte);
        if (no.marco) fora = (no.inicio < faixa.diaDe) || (no.inicio > faixa.diaAte);
        var rotulo = ((no.codigo ? no.codigo + " " : "") + (no.nome || "")).replace(/^\s+/, "");
        var linhasRot = quebrarRotulo(rotulo, maxCh);
        var corRot = fora ? "#a9b6c4" : "#475569", pesoRot = (no.critico && !fora) ? ' font-weight="600"' : '';
        s += '<text x="6" y="' + (linhasRot.length > 1 ? y + 8 : y + 13) + '" font-size="10" fill="' + corRot + '"' +
          pesoRot + '>' + esc(linhasRot[0]) + '<title>' + esc(rotulo) + '</title></text>';
        if (linhasRot.length > 1) {
          s += '<text x="6" y="' + (y + 19) + '" font-size="9" fill="' + corRot + '"' + pesoRot + '>' +
            esc(linhasRot[1]) + '<title>' + esc(rotulo) + '</title></text>';
        }
        if (fora) return;   // ⚠ nada se desenha fora da faixa: barra na borda seria data que este mês não tem
        var cor = (typeof Cronograma !== "undefined" && Cronograma.cat) ? Cronograma.cat(no.categoria).cor : (no.cor || "#94a3b8");
        var dica = esc(no.nome || "") + (no.marco ? " — MARCO" : " — " + no.duracao + " dia(s)") +
          (no.dataInicio && no.dataInicio.toLocaleDateString ? " · " + dbr(no.dataInicio) + " → " + dbr(no.dataFim) : "");
        /* ⚠ O CAMINHO CRÍTICO TEM DE SAIR NO DESENHO, e não só no negrito do
           rótulo: com 20 de 21 etapas críticas, o negrito não contrasta com
           nada. No recorte ele SUMIA — zero barras com `gantt-critica` —
           enquanto a legenda da MESMA folha continuava prometendo "caminho
           crítico (sem folga)", a tabela trazia a coluna Folga e o KPI dizia
           "Caminho crítico 20 de 21". A legenda desta casa só explica o que
           está no desenho (cronopdf.js:504): quem some com o traço tem de
           somer com a legenda, e aqui o certo era desenhar. Traço igual ao do
           `UI._gantt` (js/ui.js:2665): CRIT #b91c1c, 1.6. */
        var CRIT = "#b91c1c";
        if (no.marco) {
          var cx = X(no.inicio), cy = y + 9;
          s += '<polygon class="gantt-marco' + (no.critico ? ' gantt-critica' : '') + '" points="' + cx.toFixed(1) + ',' + (cy - 9) + ' ' + (cx + 9).toFixed(1) + ',' + cy +
            ' ' + cx.toFixed(1) + ',' + (cy + 9) + ' ' + (cx - 9).toFixed(1) + ',' + cy + '" fill="' + (no.critico ? CRIT : "#0f172a") +
            '"><title>' + dica + '</title></polygon>';
          return;
        }
        /* o recorte mora no X (min/max): barra que começa antes da folha entra
           colada na borda esquerda, e a que passa do fim pára na direita */
        var x1 = X(no.inicio), x2 = X(no.fim);
        var w = Math.max(3, x2 - x1);
        s += '<rect class="gantt-barra' + (no.critico ? ' gantt-critica' : '') + '" x="' + x1.toFixed(1) + '" y="' + y +
          '" width="' + w.toFixed(1) + '" height="' + G.barH + '" rx="3" fill="' + esc(cor) + '" opacity="0.92"' +
          (no.critico ? ' stroke="' + CRIT + '" stroke-width="1.6"' : '') + '><title>' + dica + '</title></rect>';
        /* ⚠ O RÓTULO DA DURAÇÃO NÃO PODE FICAR DEBAIXO DA SETA. O texto ancora
           em `x1+w-4` e a seta de continuação ocupa de `x1+w-6` a `x1+w+1`: os
           dois se sobrepunham em 2 px e o "25d" foi lido como "25c" na folha 4
           (5 rótulos na obra inteira). Com continuação, o rótulo recua e só
           sai se ainda sobrar barra para ele. */
        var contFim = no.fim > faixa.diaAte;
        if (w >= (contFim ? 40 : 30)) {
          s += '<text x="' + (x1 + w - (contFim ? 12 : 4)).toFixed(1) + '" y="' + (y + 13) + '" font-size="9" font-weight="600" ' +
            'fill="#fff" text-anchor="end" pointer-events="none">' + no.duracao + 'd</text>';
        }
        // continuação: a etapa não começa nem termina nesta folha
        if (no.inicio < faixa.diaDe) {
          s += '<polygon class="cdoc-cont" points="' + (x1 - 1).toFixed(1) + ',' + (y + G.barH / 2) + ' ' +
            (x1 + 6).toFixed(1) + ',' + (y + 1) + ' ' + (x1 + 6).toFixed(1) + ',' + (y + G.barH - 1) +
            '" fill="#16232f"><title>começou antes desta folha</title></polygon>';
        }
        if (no.fim > faixa.diaAte) {
          s += '<polygon class="cdoc-cont" points="' + (x1 + w + 1).toFixed(1) + ',' + (y + G.barH / 2) + ' ' +
            (x1 + w - 6).toFixed(1) + ',' + (y + 1) + ' ' + (x1 + w - 6).toFixed(1) + ',' + (y + G.barH - 1) +
            '" fill="#16232f"><title>continua na folha seguinte</title></polygon>';
        }
      });
      /* elos: só os que têm as DUAS pontas nesta folha; os demais saem contados.
         ⚠ O CONTADOR É POR PAR, NÃO POR FOLHA. `elosFora` é do desenho desta
         folha; quem soma os documentos tem de contar PARES DISTINTOS que não
         foram desenhados em folha NENHUMA — somar os contadores dizia «65
         elo(s) de precedência têm as pontas em folhas diferentes» numa obra
         com 20 elos no total, e o leitor que confere a coluna "Depende de"
         acha 20 e conclui que o documento erra. Por isso saem também os dois
         conjuntos de chaves `pred>no`. */
      var elosVistos = {}, elosDesenhados = {};
      nos.forEach(function (no, i) {
        (no.preds || []).forEach(function (pid) {
          var chaveElo = String(pid) + ">" + String(no.id);
          elosVistos[chaveElo] = 1;
          var j = idxNa[pid];
          if (j == null) { elosFora++; return; }
          var p = nos[j];
          if (p.fim < faixa.diaDe || p.fim > faixa.diaAte || no.inicio < faixa.diaDe || no.inicio > faixa.diaAte) { elosFora++; return; }
          elosDesenhados[chaveElo] = 1;
          var px = X(p.fim), py = yBar(j) + 9, sx = X(no.inicio), sy = yBar(i) + 9, d2;
          if (sx >= px + 12) d2 = "M" + px.toFixed(1) + "," + py + " H" + (sx - 5).toFixed(1) + " V" + sy + " H" + (sx - 1).toFixed(1);
          else {
            var faixaY = py + (sy > py ? 15 : -15), volta = Math.max(G.labelW + 2, sx - 6);
            d2 = "M" + px.toFixed(1) + "," + py + " H" + (px + 5).toFixed(1) + " V" + faixaY + " H" + volta.toFixed(1) + " V" + sy + " H" + (sx - 1).toFixed(1);
          }
          s += '<path class="gantt-dep" d="' + d2 + '" fill="none" stroke="#94a3b8" stroke-width="1.1" opacity="0.9"/>' +
            '<polygon points="' + sx.toFixed(1) + ',' + sy + ' ' + (sx - 5).toFixed(1) + ',' + (sy - 3) + ' ' +
            (sx - 5).toFixed(1) + ',' + (sy + 3) + '" fill="#94a3b8"/>';
        });
      });
      s += '</svg>';
      return { svg: s, elosFora: elosFora, elosVistos: elosVistos, elosDesenhados: elosDesenhados };
    },

    /* As folhas do Gantt: LINHAS × FAIXA DE TEMPO. Devolve uma lista de
       {titulo, svg, faixa, linhas} — quem chama decide se vira página do
       shell ou bloco solto no documento que flui. */
    ganttFolhas: function (r, nos, opts) {
      opts = opts || {};
      var self = this;
      var linhas = (nos && nos.length) ? nos : (r.etapas || []);
      var faixasInfo = this.faixasTempo(r, opts.mesesPorFolha);
      var pintar = (typeof opts.desenharGantt === "function") ? opts.desenharGantt
        : ((typeof UI !== "undefined" && UI._gantt) ? function (rr) { return UI._gantt(rr, { semLegenda: true }); } : null);
      var geo = this._geoGantt(pintar);
      /* ⚠ QUANTAS LINHAS CABEM É O PAPEL QUE DIZ. 22 linhas numa folha de 210
         mm de altura obrigam o desenho a encolher para ~60% da largura — e aí
         a barra de uma etapa de 10 dias volta a ser um traço. Sabendo a área
         útil, o número de linhas sai da PROPORÇÃO da folha, e o desenho ocupa
         a largura toda. Sem a área (documento que flui), continua 22. */
      var porPagina = opts.porPagina > 0 ? opts.porPagina : this.POR_PAGINA;
      if (!(opts.porPagina > 0) && opts.alturaMM > 0 && opts.larguraMM > 0) {
        var hPx = geo.W * (opts.alturaMM / opts.larguraMM);
        porPagina = Math.max(6, Math.min(this.POR_PAGINA, Math.floor((hPx - geo.top - 12) / geo.rowH)));
      }
      var pags = this.paginasGantt(linhas, porPagina);
      var faixas = faixasInfo ? faixasInfo.faixas : [{ i: 0, mesDe: 1, mesAte: 1, nMeses: 1, meses: [],
        diaDe: 0, diaAte: Math.max(1, Math.ceil(r.totalDias || 1)), rotulo: "" }];
      var out = [], de = 0, vazias = 0;
      pags.forEach(function (parte, k) {
        faixas.forEach(function (fx) {
          /* ⚠ FOLHA SEM NENHUMA ETAPA NO PERÍODO NÃO SE IMPRIME. O recorte por
             linhas × tempo cria combinações vazias (as 13 primeiras etapas
             nada têm a fazer no último ano da obra): uma folha com 13 nomes
             cinza e barra nenhuma só faz o leitor procurar o que não existe. */
          var ativa = parte.filter(function (no) {
            return no.marco ? (no.inicio >= fx.diaDe && no.inicio <= fx.diaAte)
              : (no.fim > fx.diaDe && no.inicio < fx.diaAte);
          }).length;
          if (!ativa && (pags.length * faixas.length) > 1) { vazias++; return; }
          var d = self._ganttFaixaSVG(r, parte, fx, geo, opts);
          out.push({
            svg: d.svg, elosFora: d.elosFora, elosVistos: d.elosVistos, elosDesenhados: d.elosDesenhados,
            faixa: fx, parte: k + 1, partes: pags.length,
            de: de, ate: de + parte.length, linhas: parte.length,
            titulo: (pags.length > 1 ? "linhas " + esc(parte[0].numero != null ? parte[0].numero : (de + 1)) + " a " +
              esc(parte[parte.length - 1].numero != null ? parte[parte.length - 1].numero : (de + parte.length)) +
              " (parte " + (k + 1) + " de " + pags.length + ")" : "") +
              (faixasInfo && faixasInfo.faixas.length > 1
                ? (pags.length > 1 ? " · " : "") + "meses " + fx.mesDe + " a " + fx.mesAte + " de " + faixasInfo.meses + " (" + fx.rotulo + ")"
                : (fx.rotulo ? (pags.length > 1 ? " · " : "") + fx.rotulo : ""))
          });
        });
        de += parte.length;
      });
      out.forEach(function (f, i) { f.folha = i + 1; f.folhas = out.length; });
      return { folhas: out, faixas: faixasInfo, geo: geo, partes: pags.length, vazias: vazias, porPagina: porPagina };
    },

    /* O mesmo Gantt em blocos soltos, para o documento que FLUI (gerarHTML
       com opts.mesesPorFolha). Não entra sem a opção — o documento de sempre
       não muda um caractere. */
    _ganttTempoHTML: function (r, nos, opts) {
      opts = opts || {};
      var d = this.ganttFolhas(r, nos, opts), fora = 0, razao = 0;
      /* ⚠ O SVG OCUPA A LARGURA TODA E CRESCE EM ALTURA COM AS LINHAS. 22
         linhas na largura de uma A4 deitada dão ~206 mm de altura e a
         impressão corta o fim da folha (medido: 6 das 13 folhas estouravam).
         A largura de todas é a que faz a MAIOR delas caber na altura útil —
         a mesma para todas, senão a escala muda de folha para folha. */
      d.folhas.forEach(function (f) {
        var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(f.svg);
        if (vb && +vb[1] > 0) razao = Math.max(razao, +vb[2] / +vb[1]);
      });
      var largMax = opts.larguraMM > 0 ? opts.larguraMM : 277;
      var altMax = opts.alturaMM > 0 ? opts.alturaMM : 170;
      var larg = razao > 0 ? Math.min(largMax, Math.floor(altMax / razao)) : 0;
      /* ⚠ PARES DISTINTOS, NUNCA A SOMA DOS CONTADORES POR FOLHA. Ver o ⚠ do
         `_ganttFaixaSVG`: o mesmo elo é "fora" em cada folha em que não foi
         desenhado, e somar isso imprimia 65 numa obra de 20 elos. Elo
         desenhado em PELO MENOS UMA folha não é elo fora. */
      var vistos = {}, desenhados = {}, kE;
      d.folhas.forEach(function (f) {
        for (kE in (f.elosVistos || {})) { if (own(f.elosVistos, kE)) vistos[kE] = 1; }
        for (kE in (f.elosDesenhados || {})) { if (own(f.elosDesenhados, kE)) desenhados[kE] = 1; }
      });
      var totalElos = 0;
      for (kE in vistos) { if (own(vistos, kE)) { totalElos++; if (!desenhados[kE]) fora++; } }
      var html = d.folhas.map(function (f) {
        return '<div class="cron-gpag cdoc-gpag"' + (larg ? ' style="max-width:' + larg + 'mm"' : '') + '>' +
          (f.titulo ? '<div class="cron-gpag-tit">' + f.titulo + ' — a escala de tempo é a mesma em todas as folhas</div>' : '') +
          f.svg + '</div>';
      }).join("");
      return { html: html, elosFora: fora, elosTotal: totalElos, dados: d, larguraMM: larg };
    },

    /* ================================================================
       PEÇAS QUE OS QUATRO DOCUMENTOS COMPARTILHAM
       ================================================================ */

    // "2026-09-11" -> "11/09/2026" (sem Date: fuso já trocou o dia neste projeto)
    _dISO: function (s) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? "" : s));
      return m ? (m[3] + "/" + m[2] + "/" + m[1]) : "—";
    },
    _n1: function (v) { return (v == null || v === "") ? "—" : (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); },
    /* ⚠ ÍNDICE ADIMENSIONAL PEDE DUAS CASAS. O IDP é VA÷VP: 0,95 significa 5%
       de valor agregado a menos que o previsto, e o próprio motor decide "no
       ritmo" × "abaixo do ritmo" por `valor >= 1`. Com uma casa, 0,95 · 0,97 ·
       0,99 · 1,00 · 1,04 saíam TODOS como "1,0" — obra 5% atrasada com a mesma
       cara de obra no ritmo, na folha da diretoria e no capítulo de avanço do
       relatório mensal (medido em 12/09/2026, pelo motor de verdade). */
    _n2: function (v) { return (v == null || v === "") ? "—" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); },
    _pp: function (v) { return (v == null || v === "") ? "—" : ((v > 0 ? "+" : "") + this._n1(v) + " p.p."); },
    /* ⚠ null NÃO É ZERO. "Não medido" escrito como 0% desenha queda a pique na
       tela do contratante (memória "Portal lê null como zero"). Aqui todo
       número ausente vira travessão, em todo documento. */
    _pctOuTraco: function (v) { return (v == null || v === "") ? '<span class="cdoc-vazio">—</span>' : pct1(v); },
    _pode: function (pub, perm) { return !!(pub && pub[perm] === true); },
    /* ⚠ TOKEN DO MOTOR NÃO VIRA PARÊNTESE NO PAPEL. `fonteCorte` só pode ser
       "informada", "ultimoDiario" ou "hoje" (js/cronoplan.js:899-902): é
       identificador de código. Saía cru na folha da diretoria e na da
       fiscalização — «Data de corte: 13/01/2027 (ultimoDiario)». Token que
       este mapa não conhece NÃO imprime parêntese nenhum: inventar tradução
       seria pior que não traduzir, e imprimir o token é o defeito de origem. */
    CORTE_ROTULO: { informada: "data escolhida pelo responsável", ultimoDiario: "último diário publicado", hoje: "data de hoje" },
    _corte: function (token, rotulo) {
      var r = (rotulo != null && rotulo !== "") ? String(rotulo) : this.CORTE_ROTULO[String(token == null ? "" : token)];
      return r ? ' (' + esc(r) + ')' : '';
    },
    _txt: function (v, vazio) {
      var s = String(v == null ? "" : v).replace(/^\s+|\s+$/g, "");
      return s ? esc(s).replace(/\n/g, "<br>") : '<span class="cdoc-vago">' + esc(vazio || "não preenchido") + '</span>';
    },
    _kpi: function (k) {
      if (!k) return "";
      /* o número traz do motor quantas casas ele precisa; a LEITURA vem junto
         porque número sozinho perto de 1,00 não diz nada a quem lê */
      var num = (k.casas === 2) ? this._n2(k.valor) : this._n1(k.valor);
      var v = (k.valor == null || k.valor === "") ? '<span class="cdoc-vazio">—</span>'
        : (esc(num) + (k.unidade ? '<span style="font-size:9pt"> ' + esc(k.unidade) + '</span>' : ''));
      var pe = (k.valor != null && k.valor !== "" && k.leitura) ? String(k.leitura) : "";
      var rod = pe ? (pe + (k.fonte ? " · " + k.fonte : "")) : (k.fonte || "");
      return '<div class="cdoc-kpi"><span>' + esc(k.rotulo || "") + '</span><b>' + v + '</b>' +
        (rod ? '<i>' + (pe ? '<b style="font-size:7pt;color:#0f2740">' + esc(pe) + '</b>' +
          (k.fonte ? ' · ' + esc(k.fonte) : '') : esc(rod)) + '</i>' : '') + '</div>';
    },
    /* ⚠ RECADO INTERNO DO MOTOR NÃO VAI AO PAPEL DE FORA. O precedente desta
       casa é o `_avisosPapel` (cronopdf.js:342-351), que é ALLOWLIST desde
       sempre; os documentos novos nasceram sem essa régua e o quadro da
       FISCALIZAÇÃO saiu com «4 tarefa(s) estão gravadas como comprometidas E
       têm restrição aberta… resolva a restrição ou tire a tarefa do plano da
       semana» — uma instrução ao NOSSO engenheiro entregue ao contratante,
       junto com a admissão de que comprometemos tarefa travada (achado em
       12/09/2026, lido na folha 4 do lookahead).
       O aviso marcado `interno` some do papel de fora, e o documento DIZ
       quantos ficaram — esconder calado é o outro defeito. */
    _avisos: function (lista, titulo, pub) {
      var L = (lista || []).filter(function (a) { return a && a.msg; });
      var pode = (pub === undefined) ? true : this._pode(pub, "avisosInternos");
      var fora = 0;
      if (!pode) {
        L = L.filter(function (a) { if (a.interno) { fora++; return false; } return true; });
      }
      if (!L.length && !fora) return "";
      return '<div class="cdoc-aviso"><b>' + esc(titulo || "Avisos") + '</b><br>' +
        L.map(function (a) { return esc(a.msg); }).join("<br>") +
        (fora ? (L.length ? "<br>" : "") + esc(fora + " recado(s) de operação interna deste documento não entram neste nível " +
          "de papel — eles são instrução à equipe da obra, não informação do documento.") : '') + '</div>';
    },
    /* O que o nível do documento deixou de fora, dito em voz alta. Documento
       que esconde sem dizer é o que faz alguém procurar a coluna que sumiu. */
    /* Tipos de "fora da conta" que CARREGAM o texto proibido pelo nível.
       ⚠ ACHADO EM 11/09/2026, pela própria suíte: no nível FISCALIZAÇÃO a
       guarda do motor tira as restrições das tarefas — mas a LISTA do que
       ficou de fora ("a restrição 'bloco cerâmico não entregue' está sem
       responsável") não é varrida (ela é o registro da guarda), e o texto
       saía impresso no rodapé do quadro. A declaração do que foi retirado
       não pode reimprimir o que foi retirado. */
    FORA_VEDADO: { "restricao-sem-dono": "restricoes", "restricao-sem-prazo": "restricoes",
      "restricao": "restricoes", "causa": "causasPPC", "ppc": null },
    /* ⚠ SEGUNDA FECHADURA, ACHADA EM 12/09/2026 COM A FOLHA NA MÃO. O conserto
       de 11/09 parou no primeiro consumidor: barrou a DESCRIÇÃO da restrição e
       deixou passar a DOUTRINA. O `_guardar` do motor empurra sempre um item
       `{tipo:"publico"}`, e `FORA_VEDADO["publico"]` é `undefined` — então o
       papel da fiscalização saía imprimindo, três vezes na mesma folha,
       «restrição aberta diz onde a NOSSA gestão falhou — no documento do
       contratante vira prova contra».
       A regra é: DECLARAR o que se retirou é obrigação; reimprimir o PORQUÊ
       interno é o vazamento. O motor já nasce com a face pública separada
       (CronoDocs.RESTRITOS[].publico × .motivo); aqui varre-se a lista contra
       os `motivo` de verdade, porque um payload montado à mão por uma fiação
       futura não passa pelo motor. Tipo desconhecido que carregue doutrina
       cai fora; tipo desconhecido limpo passa (esconder calado é o outro
       defeito, e ele faz o leitor procurar a coluna que sumiu). */
    _doutrinaVedada: function (msg, pub) {
      var CD = (typeof CronoDocs !== "undefined") ? CronoDocs
        : ((typeof global !== "undefined" && global.CronoDocs) ? global.CronoDocs : null);
      var R = CD && CD.RESTRITOS;
      if (!R || !R.length) return false;
      var s = String(msg == null ? "" : msg), i;
      for (i = 0; i < R.length; i++) {
        if (!R[i] || !R[i].motivo) continue;
        if (s.indexOf(R[i].motivo) > -1 && !this._pode(pub, R[i].perm)) return true;
      }
      return false;
    },
    _foraDaConta: function (lista, max, pub) {
      var self = this;
      var L = (lista || []).filter(function (x) {
        if (!x || !x.msg) return false;
        if (self._doutrinaVedada(x.msg, pub)) return false;
        var perm = self.FORA_VEDADO[String(x.tipo || "")];
        if (perm === undefined && x.perm) perm = null;   // item da guarda do motor: a msg já é a face pública
        return !perm || self._pode(pub, perm);
      });
      if (!L.length) return "";
      /* ⚠ CINCO LINHAS DIZENDO A MESMA COISA NÃO SÃO CINCO INFORMAÇÕES. Lido
         na folha 4 do lookahead da fiscalização (12/09/2026): «“restrições
         pendentes” ficou fora… controle interno de execução, fora do escopo
         deste documento. · “restrições a liberar” ficou fora… (a mesma frase)
         · …» — cinco vezes o mesmo motivo. Quem lê para de ler. Os campos que
         saíram pela MESMA permissão viram uma linha só, com a lista dos
         rótulos; nada é escondido, só deixa de ser repetido. */
      /* a chave do agrupamento é o MOTIVO PÚBLICO, não a permissão: dois
         campos de permissões diferentes podem sair pela mesma razão
         ("controle interno de execução"), e duas linhas idênticas continuam
         sendo repetição para quem lê */
      var porMotivo = {}, ordem = [], soltos = [];
      function motivoDe(msg) { var i2 = String(msg).indexOf(": "); return i2 > -1 ? String(msg).slice(i2 + 2) : String(msg); }
      L.forEach(function (x) {
        if (x.tipo === "publico" && x.perm && x.rotulo) {
          var mt = motivoDe(x.msg);
          if (!porMotivo[mt]) { porMotivo[mt] = { rotulos: [], base: x }; ordem.push(mt); }
          if (porMotivo[mt].rotulos.indexOf(x.rotulo) < 0) porMotivo[mt].rotulos.push(x.rotulo);
          return;
        }
        soltos.push(x);
      });
      var linhas = ordem.map(function (mt) {
        var g = porMotivo[mt];
        if (g.rotulos.length === 1) return esc(g.base.msg);
        return esc("“" + g.rotulos.join("”, “") + "” ficaram fora do documento de nível " +
          (pub && pub.rotulo ? pub.rotulo : "") + ": " + mt);
      }).concat(soltos.map(function (x) { return esc(x.msg); }));
      var n = max > 0 ? max : 8;
      return '<div class="cdoc-nota"><b>Fora deste documento (' + L.length + '):</b> ' +
        linhas.slice(0, n).join(" · ") +
        (linhas.length > n ? ' <i>(e mais ' + (linhas.length - n) + ')</i>' : '') + '</div>';
    },
    _docErro: function (titulo, msg, opc) {
      opc = opc || {};
      /* ⚠ a folha de erro leva a MESMA data de emissão do documento que ela
         substitui: lida na foto de 12/09/2026, a recusa saiu "emitido em
         12/09/2026" dentro de um pacote emitido em 15/01/2027 — duas datas
         para a mesma emissão é como o leitor perde a confiança nas duas */
      var d = this.documento({ papel: opc.papel || "a4-retrato", titulo: titulo, subtitulo: opc.subtitulo,
        capa: false, indice: false, meta: opc.meta || [], obra: opc.obra, empresa: opc.empresa,
        nivel: opc.nivel, emissao: opc.emissao });
      d.secao("Documento não emitido",
        '<div class="cdoc-aviso"><b>Este documento não foi emitido.</b><br>' + esc(msg) + '</div>' +
        '<div class="cdoc-nota">Nada foi estimado no lugar do que falta. Um documento que preenche o buraco com zero ' +
        'é pior que a folha que diz o que falta: o zero é lido como medição.</div>');
      return d.html();
    },

    /* ================================================================
       D1 — CRONOGRAMA FÍSICO-FINANCEIRO (matriz ETAPA × MÊS)

       É o documento que licitação, banco e fiscalização pedem, e o formato
       é o consagrado: etapas em linha, uma coluna por mês, cada linha
       somando 100% da própria etapa, e as linhas de fecho TOTAL DO MÊS e
       ACUMULADO. Lei 14.133/2021 e Decreto 7.983/2013 vinculam medição e
       pagamento a ele.

       ⚠ A coluna "Σ etapa" é a guarda do modelo: se a linha não fecha em
         100%, o papel DIZ que não fecha. Arredondar calado aqui é assinar
         uma matriz que não serve para medir.
       ================================================================ */
    _matrizPaginas: function (ff, P, opc) {
      opc = opc || {};
      var self = this, modo = (opc.modo === "pct") ? "pct" : "valor";
      var colMes = (modo === "pct") ? 12 : 21;              // mm por coluna de mês
      /* ⚠ 21 mm não é chute: "R$ 237.249,62" a 7,6 pt mede ~19 mm, e em 18 mm
         o número quebrava NO MEIO ("R$ 237.249,6" / "2") — visto na foto da
         folha 2. Número partido em documento de medição é erro de leitura
         esperando acontecer. */
      var fixas = 9 + 56 + 23 + 12 + 16;                    // Nº · Etapa · Valor · % obra · Σ etapa
      var porFolha = Math.max(2, Math.floor((P.utilL - fixas) / colMes));
      /* orçamento da folha em mm: a área útil menos cabeçalho, título da
         seção, rodapé do documento e a nota de leitura do fim da matriz */
      var espaco = P.utilA - 32;
      var destaque = (opc.colunaDoMes == null) ? -1 : opc.colunaDoMes;
      var blocos = [], i;
      for (i = 0; i < ff.meses; i += porFolha) blocos.push({ de: i, ate: Math.min(ff.meses, i + porFolha) });
      var pags = [];
      blocos.forEach(function (b) {
        var th = '<table class="cdoc-tbl cdoc-mtz"><thead><tr>' +
          '<th class="r" style="width:9mm">Nº</th><th style="width:56mm">Etapa</th>' +
          '<th class="r" style="width:23mm">Valor (R$)</th><th class="r" style="width:12mm">% obra</th>';
        for (i = b.de; i < b.ate; i++) {
          th += '<th class="r' + (i === destaque ? ' dest' : '') + '">' + esc(ff.rotulos[i]) + '</th>';
        }
        th += '<th class="r" style="width:16mm">Σ etapa</th></tr></thead>';
        var tb = '<tbody>';
        ff.linhas.forEach(function (L) {
          tb += '<tr' + (L.foraDoTotal ? ' class="fora"' : '') + '>' +
            '<td class="r">' + esc(L.numero) + '</td>' +
            '<td class="nm">' + esc(((L.codigo ? L.codigo + " " : "") + (L.nome || "")).replace(/^\s+/, "")) +
            (L.marco ? ' ◆' : '') + (L.opcional ? ' <b class="cdoc-tag">opcional</b>' : '') + '</td>' +
            '<td class="r">' + moeda(L.total) + '</td>' +
            '<td class="r">' + self._pctOuTraco(L.pctObra) + '</td>';
          for (i = b.de; i < b.ate; i++) {
            var c = L.meses[i] || {}, cls = (i === destaque ? ' dest' : '');
            if (!(c.valor > 0)) { tb += '<td class="r' + cls + '"><span class="cdoc-vazio">—</span></td>'; continue; }
            tb += '<td class="r v' + cls + '">' +
              (modo === "pct" ? pct1(c.pctEtapa == null ? 0 : c.pctEtapa)
                : moeda(c.valor) + '<i>' + (c.pctEtapa == null ? '—' : pct1(c.pctEtapa)) + '</i>') + '</td>';
          }
          tb += '<td class="r">' + (L.somaPctEtapa == null ? '<span class="cdoc-vazio">—</span>'
            : (pct1(L.somaPctEtapa) + '<i>' + (L.fecha ? '<span class="cdoc-ok">fecha</span>'
              : '<span class="cdoc-nao">NÃO FECHA</span>') + '</i>')) + '</td></tr>';
        });
        tb += '</tbody>';
        /* ⚠ O RÓTULO DA LINHA VALE PARA AS COLUNAS DE MÊS, NÃO PARA A COLUNA
           "VALOR (R$)". A linha dizia "TOTAL DO MÊS" e a célula sob Valor
           trazia o total da OBRA inteira (R$ 4.814.351,16 ao lado do primeiro
           mês, R$ 274.822,11) — numa matriz que serve de base de medição, é
           erro de leitura esperando acontecer. Cada célula agora diz o que
           ela é, e o ACUMULADO explica por que as duas primeiras estão
           vazias em vez de ficar em branco calado. */
        var tf = '<tfoot><tr><td></td><td>TOTAL<i>nas colunas de mês: total DO MÊS</i></td>' +
          '<td class="r">' + moeda(ff.total) + '<i>total da obra</i></td><td class="r">100,0%<i>da obra</i></td>';
        for (i = b.de; i < b.ate; i++) {
          tf += '<td class="r v' + (i === destaque ? ' dest' : '') + '">' + moeda(ff.totaisMes[i]) + '<i>' + pct1(ff.pctMes[i]) + '</i></td>';
        }
        tf += '<td></td></tr><tr><td></td><td>ACUMULADO</td>' +
          '<td class="r"><span class="cdoc-vazio">—</span><i>o acumulado só existe por mês</i></td>' +
          '<td class="r"><span class="cdoc-vazio">—</span></td>';
        for (i = b.de; i < b.ate; i++) {
          tf += '<td class="r v' + (i === destaque ? ' dest' : '') + '">' + moeda(ff.acumValor[i]) + '<i>' + pct1(ff.acumPct[i]) + '</i></td>';
        }
        tf += '<td></td></tr></tfoot>';
        var tabela = th + tb + tf + '</table>';
        /* ⚠ 38 caracteres é o que cabe na coluna Etapa (56 mm a 8 pt): nome de
           serviço de obra ("ALVENARIA DE VEDAÇÃO COM BLOCO CERÂMICO 14 CM")
           quebra em duas linhas, e a folha que não conta isso estoura por 3 px
           — exatamente o que fez o PDF sair com 9 folhas e o rodapé prometer 8
           (medido em 11/09/2026).
           ⚠ NÚMEROS MEDIDOS NO NAVEGADOR EM 12/09/2026, não estimados: com
           `modo: "valor"` a linha mede 9,23 mm (1 linha de nome) e 9,23–9,36 mm
           (2 linhas) — a altura é ditada pelas CÉLULAS DE MÊS (valor + o <i> do
           percentual), não pelo nome da etapa, e por isso quase não cresce com
           ele. A conta antiga cobrava 12,7 mm por linha de 2 linhas: 1,38× a
           real, e a folha saía com 45% de branco (lido na foto). Agora cobra
           9,6 / 10,8 / 12,0 mm — ainda para cima, com ~4% de margem no caso
           medido. Quem prova de fora é a e2e (tools/e2e-crono-papel.js), que
           conta as folhas do PDF de verdade: se a conta mentir, o rodapé
           mente junto e ela reprova.
           ⚠ `modo: "pct"` NÃO foi medido — fica com os números de antes, que
           são declaradamente pessimistas. Recalibrar sem medir é trocar um
           chute por outro. */
        var custos = (modo === "pct")
          ? self._custoTRs(tabela, 38, 3.1, 3)
          : self._custoTRs(tabela, 38, 1.2, 8.4);
        var partes = self._fatiar(tabela, espaco, custos);
        var tituloBloco = "Cronograma físico-financeiro" +
          (blocos.length > 1 ? " — meses " + (b.de + 1) + " a " + b.ate + " de " + ff.meses : "");
        partes.forEach(function (p, pi) {
          pags.push({ titulo: tituloBloco + (pi ? " (continuação " + (pi + 1) + " de " + partes.length + ")" : ""),
            nova: pi === 0,
            corpo: p + (pi === partes.length - 1
              ? '<div class="cdoc-nota"><b>Leitura:</b> em cada mês, a linha de cima é o <b>valor previsto</b> ' +
                'e a de baixo, o <b>percentual da própria etapa</b> naquele mês. <b>Σ etapa</b> é a soma dos ' +
                'percentuais de TODOS os ' + ff.meses + ' meses da etapa — tem de fechar 100%.' +
                (blocos.length > 1 ? ' Esta folha mostra os meses ' + (b.de + 1) + ' a ' + b.ate + '; as colunas Nº, Etapa, Valor e % da obra se repetem em todas.' : '') +
                '</div>'
              : '') });
        });
      });
      return { paginas: pags, mesesPorFolha: porFolha, espacoMM: espaco, blocos: blocos.length };
    },

    _matrizNotas: function (ff) {
      var interno = this._pode(ff.publico, "avisosInternos");
      var base = (ff.base === "gantt")
        ? 'Distribuição pela <b>duração real de cada etapa no Gantt</b>, com feriados descontados.'
        : 'Distribuição <b>estimada</b> — não há rede de precedências datada para este orçamento.';
      /* ⚠ O RÓTULO TEM DE FECHAR COM A CONTA. Isto saía como "Pico de frentes:
         29,9 frentes simultâneas (média)" numa obra em que no máximo DUAS
         etapas acontecem ao mesmo tempo — 15 vezes o máximo físico, num
         documento que vai a licitação, banco e fiscalização. O número é
         `dias-equipe ÷ dias de trabalho`: exigência média de EQUIPES, não
         contagem de frentes abertas. Agora o papel diz a conta e imprime, ao
         lado, quantas etapas o mês de pico tem abertas — que é o que o leitor
         confere contra o Gantt (achado e medido em 12/09/2026). */
      var pf = "";
      if (ff.picoFrentes) {
        pf = '<b>Mês de maior carga de equipes:</b> ' + esc(this._n1(ff.picoFrentes.valor)) + ' ' +
          esc(ff.picoFrentes.unidade || "equipes/dia (média do mês)") +
          (ff.picoFrentes.mes ? ' em ' + esc(ff.picoFrentes.mes) : '') +
          (ff.picoFrentes.etapasNoMes ? ', com <b>' + ff.picoFrentes.etapasNoMes + '</b> etapa(s) aberta(s) nesse mês' : '') +
          '. <b>A conta é</b> ' + esc(ff.picoFrentes.conta || "dias-equipe do mês ÷ dias de trabalho do mês") +
          ' — não é contagem de frentes abertas, e não é pessoa: o motor sabe quantos dias-equipe a etapa consome, ' +
          'não de quantas pessoas a equipe é feita.<br>';
      }
      return '<div class="cdoc-nota">' +
        '<b>Origem dos valores:</b> ' + esc(ff.fonteValor || "preço de venda por etapa") +
        (interno && ff.fonteValorTecnica ? ' (' + esc(ff.fonteValorTecnica) + ')' : '') + '. ' +
        '⚠ A coluna de dinheiro é o <b>preço de venda</b> (o que o contratante paga); custo direto não entra neste documento.<br>' +
        '<b>Base da distribuição:</b> ' + base +
        (interno && ff.fonteTecnica ? ' <i style="display:inline">(' + esc(ff.fonteTecnica) + ')</i>' : '') + '<br>' +
        '<b>Conferência:</b> soma da matriz ' + moeda(ff.conferencia.totalMatriz) + ' × esperado ' + moeda(ff.conferencia.esperado) +
        ' — diferença de ' + moeda(ff.conferencia.diferenca) + ' (' +
        (ff.conferencia.confere ? '<span class="cdoc-ok">confere</span>' : '<span class="cdoc-nao">NÃO confere</span>') + ').<br>' +
        pf +
        '<b>Medição:</b> Lei 14.133/2021 e Decreto 7.983/2013 vinculam medição e pagamento às etapas deste cronograma.' +
        '</div>';
    },

    gerarFisicoFinanceiro: function (ff, opc) {
      opc = opc || {};
      if (!ff || ff.ok !== true) {
        return this._docErro("Cronograma físico-financeiro",
          (ff && ff.erro) || "a matriz físico-financeira não foi calculada (o motor não devolveu resultado).",
          { papel: opc.papel || "a4-paisagem", obra: opc.obra, empresa: opc.empresa, meta: opc.meta, emissao: opc.emissao });
      }
      var P = this.papel(opc.papel || "a4-paisagem");
      var meta = opc.meta || [];
      if (!meta.length) {
        meta = [["Obra", opc.obra || "—"], ["Cliente", opc.cliente || "—"], ["Nº", opc.numero || "—"],
          ["Prazo", ff.meses + (ff.meses === 1 ? " mês" : " meses")], ["Total", moeda(ff.total)]];
      }
      var d = this.documento({ papel: P.id, titulo: opc.titulo || "Cronograma Físico-Financeiro",
        subtitulo: opc.subtitulo || opc.obra || "", kicker: "CRONOGRAMA", meta: meta, obra: opc.obra,
        empresa: opc.empresa, nivel: ff.publico ? ff.publico.rotulo : "", capa: opc.capa, indice: opc.indice,
        emissao: opc.emissao });
      var m = this._matrizPaginas(ff, P, opc);
      m.paginas.forEach(function (p) { if (p.nova) d.secao(p.titulo, p.corpo); else d.continua(p.titulo, p.corpo); });
      d.secao("Notas, conferência e avisos",
        this._avisos(ff.avisos, "Avisos desta matriz", ff.publico) +
        this._matrizNotas(ff) +
        this._foraDaConta(ff.foraDaConta, 10, ff.publico));
      return d.html();
    },

    /* ================================================================
       CURVA S em folha inteira — linha de base, plano atual e executado.

       ⚠ O EXECUTADO NÃO SE PROJETA NO FUTURO. A série do motor PARA no
         último mês medido e chega aqui mais curta que os rótulos; completar
         com zero desenharia obra parada numa obra andando. A linha para, e
         a legenda diz onde parou.
       ⚠ Convenção de cor do modelo oficial (DEINFRA/SC): AZUL = previsto,
         VERMELHO = executado, PRETO = contrato/linha de base.
       ================================================================ */
    _curvaSVG: function (c, opc) {
      opc = opc || {};
      var rot = c.rotulos || [], n = rot.length;
      if (!n) return '<div class="cdoc-aviso">Não há curva para desenhar: a obra não tem eixo de meses.</div>';
      var W = 1000, H = 330, padL = 44, padR = 16, padB = 34, padT = 16;
      var pw = W - padL - padR, ph = H - padT - padB;
      var X = function (i) { return padL + (n === 1 ? pw / 2 : (i / (n - 1)) * pw); };
      var Y = function (v) { return padT + ph - (Math.max(0, Math.min(100, v)) / 100) * ph; };
      var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;background:#fff;border:1px solid #d8e0ea;' +
        'border-radius:8px;font-family:inherit">';
      [0, 25, 50, 75, 100].forEach(function (g) {
        s += '<line x1="' + padL + '" y1="' + Y(g).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + Y(g).toFixed(1) +
          '" stroke="#eef2f7" stroke-width="1"/><text x="' + (padL - 6) + '" y="' + (Y(g) + 3).toFixed(1) +
          '" font-size="9" fill="#94a3b8" text-anchor="end">' + g + '%</text>';
      });
      var passo = Math.max(1, Math.ceil(n / 20));
      rot.forEach(function (rt, i) {
        if (i % passo) return;
        s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - padB + 13) + '" font-size="9" fill="#64748b" text-anchor="middle">' + esc(rt) + '</text>';
      });
      function serie(vals, cor, tracejado, nome) {
        var pts = [], i;
        for (i = 0; i < vals.length && i < n; i++) {
          if (vals[i] == null || vals[i] === "") continue;   // ⚠ buraco é buraco: não se interpola medição
          pts.push(X(i).toFixed(1) + "," + Y(vals[i]).toFixed(1));
        }
        if (!pts.length) return "";
        var o = '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + cor + '" stroke-width="2"' +
          (tracejado ? ' stroke-dasharray="6,4"' : '') + '><title>' + esc(nome) + '</title></polyline>';
        pts.forEach(function (p) { var xy = p.split(","); o += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="2.6" fill="' + cor + '"/>'; });
        return o;
      }
      if (c.mesDeCorte && c.mesDeCorte.i != null) {
        var xc = X(c.mesDeCorte.i);
        s += '<line x1="' + xc.toFixed(1) + '" y1="' + padT + '" x2="' + xc.toFixed(1) + '" y2="' + (padT + ph) +
          '" stroke="#b45309" stroke-width="1.3" stroke-dasharray="5,3"/>' +
          '<text x="' + (xc + 4).toFixed(1) + '" y="' + (padT + 10) + '" font-size="9" fill="#b45309">' +
          esc(c.mesDeCorte.rotulo || "competência") + '</text>';
      }
      s += serie(c.base || [], "#111827", true, "linha de base");
      s += serie(c.atual || [], "#1d4ed8", false, "plano atual");
      s += serie(c.executado || [], "#b91c1c", false, "executado (medido)");
      s += '</svg>';
      var fim = (c.executado && c.executado.length) ? rot[c.executado.length - 1] : null;
      return s + '<div class="cdoc-legenda">' +
        ((c.base && c.base.length) ? '<span><i style="background:#111827"></i>linha de base (contrato de prazo)</span>' : '') +
        '<span><i style="background:#1d4ed8"></i>previsto — plano atual</span>' +
        '<span><i style="background:#b91c1c"></i>executado (medido)</span>' +
        (c.mesDeCorte ? '<span><i style="background:#b45309"></i>competência do relatório</span>' : '') +
        '</div>' +
        '<div class="cdoc-nota"><b>Até onde a linha vermelha vai:</b> ' +
        (fim ? 'o executado está medido até <b>' + esc(fim) + '</b> (' + c.executado.length + ' de ' + n + ' meses do eixo). '
          : 'não há mês medido nesta obra. ') +
        'Depois disso <b>não houve medição</b> — a linha PARA ali, e não cai a zero: mês sem medição é ausência de medição, nunca 0%.' +
        ((c.base && c.base.length) ? '' : ' <b>Esta obra não tem linha de base congelada</b>, então o gráfico não afirma atraso nem adiantamento.') +
        '</div>';
    },

    /* ================================================================
       D4 — RELATÓRIO MENSAL DE ACOMPANHAMENTO
       Espinha do modelo oficial (DEINFRA/SC), reduzida ao que serve à obra
       de edificação. Uma seção por folha; a matriz e as tabelas longas se
       fatiam sozinhas. `opc.fotoSrc(foto)` devolve a URL da foto autorizada
       (sem ele, a folha sai com a moldura e a legenda, dizendo que a imagem
       não veio — nunca com um buraco calado).
       ================================================================ */
    gerarRelatorioMensal: function (rel, opc) {
      opc = opc || {};
      var self = this;
      if (!rel || rel.ok !== true) {
        return this._docErro("Relatório Mensal de Acompanhamento",
          (rel && rel.erro) || "o relatório não foi montado pelo motor.",
          { papel: opc.papel || "a4-paisagem", obra: opc.obra, empresa: opc.empresa, emissao: opc.emissao });
      }
      var P = this.papel(opc.papel || "a4-paisagem");
      var capa = null, sec = {};
      (rel.secoes || []).forEach(function (s) { sec[s.id] = s; });
      capa = sec.capa || {};
      var obraNome = (capa.obra && capa.obra.nome) || opc.obra || "";
      var meta = [["Obra", obraNome || "—"], ["Competência", rel.rotuloMes || rel.mes],
        ["Relatório nº", rel.numero == null ? "sem número" : rel.numero],
        ["Período", this._dISO(rel.periodo.de) + " a " + this._dISO(rel.periodo.ate)]];
      if (capa.contrato && capa.contrato.numero) meta.push(["Contrato", capa.contrato.numero]);
      var d = this.documento({ papel: P.id, titulo: opc.titulo || "Relatório Mensal de Acompanhamento de Obra",
        subtitulo: obraNome, kicker: "ACOMPANHAMENTO DE OBRA", meta: meta, obra: obraNome,
        empresa: opc.empresa || (capa.empresa && capa.empresa.nome), nivel: rel.publico ? rel.publico.rotulo : "",
        capa: opc.capa, indice: opc.indice, emissao: opc.emissao || this._dISO(capa.emitidoEm) });

      // ---- 1. informações contratuais e equipe técnica ----
      var c1 = sec.contratuais;
      if (c1) {
        var linhas = [];
        function par(k, v) { linhas.push('<tr><td style="width:52mm">' + esc(k) + '</td><td>' + v + '</td></tr>'); }
        par("Obra", esc(c1.obra.nome || "—") + (c1.obra.inicio ? " · início " + this._dISO(c1.obra.inicio) : ""));
        if (c1.contrato) {
          par("Contrato", esc(c1.contrato.numero || "—") + (c1.contrato.assinatura ? " · assinado em " + this._dISO(c1.contrato.assinatura) : ""));
          par("Objeto", this._txt(c1.contrato.objeto, "objeto não informado"));
          par("Valor contratado", c1.contrato.valor == null ? '<span class="cdoc-vazio">não informado</span>' : moeda(c1.contrato.valor));
          par("Valor com aditivos", c1.contrato.valorComAditivos == null ? '<span class="cdoc-vazio">—</span>' : moeda(c1.contrato.valorComAditivos));
          par("Prazo contratual", c1.contrato.prazoDias ? (c1.contrato.prazoDias + " dias") : '<span class="cdoc-vazio">—</span>');
        } else par("Contrato", '<span class="cdoc-vago">não informado — a capa e este capítulo saem sem número de contrato</span>');
        par("Construtora", this._txt(c1.equipe.construtora));
        par("Supervisora", this._txt(c1.equipe.supervisora));
        par("Fiscalização", this._txt(c1.equipe.fiscalizacao));
        par("Responsável técnico", this._txt(c1.equipe.responsavelTecnico) + (c1.equipe.crea ? " · CREA " + esc(c1.equipe.crea) : ""));
        if (c1.linhaDeBase) {
          par("Linha de base", "v" + esc(c1.linhaDeBase.versao) + " · congelada em " + this._dISO(c1.linhaDeBase.criadaEm) +
            (c1.linhaDeBase.dataFim ? " · término previsto " + this._dISO(c1.linhaDeBase.dataFim) : ""));
        } else par("Linha de base", '<span class="cdoc-vago">a obra não tem linha de base congelada — sem ela não há “previsto” contra o qual comparar</span>');
        var adit = (c1.aditivos || []).length
          ? '<table class="cdoc-tbl"><thead><tr><th>Aditivo</th><th>Data</th><th class="r">Valor (R$)</th>' +
            '<th class="r">Prazo (dias)</th><th>Objeto</th></tr></thead><tbody>' +
            c1.aditivos.map(function (a) {
              return '<tr><td>' + esc(a.numero || "—") + '</td><td>' + self._dISO(a.data) + '</td><td class="r">' + moeda(a.valor) +
                '</td><td class="r">' + (a.prazoDias || 0) + '</td><td>' + esc(a.objeto || "—") + '</td></tr>';
            }).join("") + '</tbody></table>'
          : '<div class="cdoc-nota">Sem aditivos registrados até esta competência.</div>';
        d.secao(c1.titulo, '<table class="cdoc-tbl"><tbody>' + linhas.join("") + '</tbody></table>' +
          '<h3 style="font-size:9.5pt;color:#0f2740;margin:9px 0 4px">Aditivos</h3>' + adit +
          '<div class="cdoc-nota"><b>Fonte:</b> ' + esc(c1.fonte || "") + '</div>');
      }

      // ---- 2. resumo executivo (considerações do responsável) ----
      if (sec.resumoExecutivo) {
        d.secao(sec.resumoExecutivo.titulo,
          '<div class="cdoc-texto">' + this._txt(sec.resumoExecutivo.texto,
            "campo vazio — o modelo oficial exige as considerações do responsável em todo capítulo com dado físico ou financeiro") + '</div>' +
          '<div class="cdoc-nota"><b>Fonte:</b> ' + esc(sec.resumoExecutivo.fonte || "") + '</div>');
      }

      // ---- 3. avanço físico: as TRÊS réguas lado a lado ----
      var av = sec.avancoFisico;
      if (av) {
        var corpo = "";
        if (!av.reguas.length) {
          corpo += '<div class="cdoc-aviso">O painel da obra não veio (ou não fechou): este capítulo sai <b>sem número</b>. ' +
            'Nenhum percentual foi estimado aqui.</div>';
        } else {
          corpo += '<div class="cdoc-kpis">' + av.reguas.map(function (k) { return self._kpi(k); }).join("") + '</div>' +
            '<div class="cdoc-nota">⚠ <b>São três perguntas diferentes</b>, e por isso os três números aparecem juntos: ' +
            'o executado sobre o orçamento, o número que o cliente vê no Portal e o medido em boletins aprovados. ' +
            'Um relatório que mostra um sem os outros faz o engenheiro discutir com o contratante usando números diferentes.</div>';
          var seg = [];
          if (av.previstoNaData) seg.push(av.previstoNaData);
          if (av.desvioTerminoDias) seg.push(av.desvioTerminoDias);
          if (av.idp) seg.push(av.idp);
          if (seg.length) corpo += '<div class="cdoc-kpis" style="margin-top:8px">' + seg.map(function (k) { return self._kpi(k); }).join("") + '</div>';
          if (av.previstoNaData && av.previstoNaData.desvioPP != null) {
            corpo += '<div class="cdoc-nota"><b>Desvio na data de corte:</b> ' + esc(this._pp(av.previstoNaData.desvioPP)) +
              ' (realizado ' + esc(this._n1(av.previstoNaData.realNaMesmaRegua)) + '% contra previsto ' +
              esc(this._n1(av.previstoNaData.valor)) + '%).</div>';
          }
          if (av.situacao) corpo += '<div class="cdoc-nota"><b>Situação:</b> obra <b>' + esc(av.situacao.texto) + '</b>' +
            (av.situacao.contra ? ' (contra ' + esc(av.situacao.contra) + ')' : '') + ' — ' + esc(av.situacao.fonte) + '.</div>';
          corpo += '<div class="cdoc-nota"><b>Data de corte:</b> ' + this._dISO(av.dataCorte) +
            this._corte(av.fonteCorte, av.fonteCorteRotulo) + '. <b>Fonte:</b> ' + esc(av.fonte || "") +
            /* o identificador do módulo é para o log e para o nível interno */
            (av.fonteTecnica && this._pode(rel.publico, "avisosInternos") ? ' (' + esc(av.fonteTecnica) + ')' : '') + '.</div>';
        }
        if (av.texto) corpo += '<div class="cdoc-texto" style="margin-top:8px">' + this._txt(av.texto) + '</div>';
        d.secao(av.titulo, corpo);
      }

      // ---- 4. curva S ----
      if (sec.curvaS) d.secao(sec.curvaS.titulo, this._curvaSVG(sec.curvaS, opc));

      // ---- 5. cronograma físico-financeiro ----
      var ffS = sec.fisicoFinanceiro;
      if (ffS && ffS.matriz) {
        var m = this._matrizPaginas(ffS.matriz, P, { modo: opc.modo, colunaDoMes: ffS.colunaDoMes });
        m.paginas.forEach(function (p) { if (p.nova) d.secao(p.titulo, p.corpo); else d.continua(p.titulo, p.corpo); });
        d.continua("Cronograma físico-financeiro — notas e conferência", this._matrizNotas(ffS.matriz));
      } else {
        d.secao("Cronograma físico-financeiro",
          '<div class="cdoc-aviso"><b>A matriz físico-financeira não entrou neste relatório.</b><br>' +
          esc((rel.foraDaConta || []).filter(function (x) { return x.tipo === "matriz"; }).map(function (x) { return x.msg; })[0] ||
            "o orçamento da obra não foi informado ao gerador.") + '</div>');
      }

      // ---- 6. marcos ----
      if (sec.marcos) {
        var mk = sec.marcos;
        var tabMk = mk.linhas.length
          ? '<table class="cdoc-tbl"><thead><tr><th class="r" style="width:12mm">Nº</th><th>Marco</th>' +
            '<th style="width:26mm">Previsto</th><th style="width:26mm">Realizado</th><th style="width:30mm">Situação</th>' +
            '<th style="width:52mm">Fonte</th></tr></thead><tbody>' +
            mk.linhas.map(function (L) {
              return '<tr><td class="r">' + esc(L.numero) + '</td><td>' + esc(L.nome) + '</td>' +
                '<td>' + self._dISO(L.previsto) + '</td>' +
                '<td>' + (L.realizado ? self._dISO(L.realizado) : '<span class="cdoc-vazio">não apurado</span>') + '</td>' +
                '<td>' + (L.situacao ? esc(L.situacao) : '<span class="cdoc-vazio">—</span>') + '</td>' +
                '<td>' + esc(L.fonte || "") + '</td></tr>';
            }).join("") + '</tbody></table>'
          : '<div class="cdoc-nota">O cronograma desta obra não tem marco marcado (◆).</div>';
        d.secao(mk.titulo, tabMk + (mk.fonte ? '<div class="cdoc-nota"><b>Fonte:</b> ' + esc(mk.fonte) + '</div>' : ''));
      }

      // ---- 7. ocorrências e controle das condições do tempo ----
      var oc = sec.ocorrencias;
      if (oc) {
        var cl = oc.clima || {};
        var cab = '<div class="cdoc-kpis"><div class="cdoc-kpi"><span>Dias com diário</span><b>' + oc.diasComDiario +
          '<span style="font-size:9pt"> de ' + oc.diasDoMes + '</span></b><i>dias corridos da competência</i></div>' +
          '<div class="cdoc-kpi"><span>Chuva ou parada</span><b>' + cl.diasComChuvaOuParada +
          '</b><i>' + cl.comFonteExterna + ' com fonte externa verificável · ' + cl.semFonteExterna + ' só anotados</i></div>' +
          '<div class="cdoc-kpi"><span>Dias impraticáveis</span><b>' + cl.impraticaveis +
          '</b><i>condição registrada no diário</i></div></div>';
        var tabD = oc.diarios.length
          ? '<table class="cdoc-tbl"><thead><tr><th style="width:22mm">Data</th><th style="width:18mm">Nº</th>' +
            '<th style="width:26mm">Condição</th><th style="width:20mm">Efetivo</th><th style="width:44mm">Clima</th>' +
            '<th>Ocorrências</th></tr></thead><tbody>' +
            oc.diarios.map(function (x) {
              /* ⚠ CONTAGEM POR FUNÇÃO, nunca a lista de pessoas: o motor já
                 entrega só o total e o `porFuncao`, e é só isso que se imprime. */
              var ef = x.efetivo ? (x.efetivo.pessoas + " pessoa(s)") : "—";
              var fun = x.efetivo && x.efetivo.porFuncao ? Object.keys(x.efetivo.porFuncao).map(function (f) {
                var v = x.efetivo.porFuncao[f];
                return esc(f) + " " + esc(String(v && v.pessoas != null ? v.pessoas : v));
              }).join(" · ") : "";
              var clima = x.clima ? (esc(x.clima.descricao || "—") +
                (x.clima.chuvaMm ? " · " + self._n1(x.clima.chuvaMm) + " mm" : "") +
                (x.clima.verificavel ? ' <span class="cdoc-ok">fonte externa</span>' : ' <span class="cdoc-vago">sem fonte externa</span>')) : "—";
              return '<tr><td>' + self._dISO(x.data) + '</td><td>' + esc(x.numero || "—") + '</td>' +
                '<td>' + esc(x.condicao || "—") + '</td>' +
                '<td>' + esc(ef) + (fun ? '<i>' + fun + '</i>' : '') + '</td>' +
                '<td>' + clima + '</td>' +
                '<td>' + esc(x.ocorrencias || "") +
                ((x.ocorrenciasItens || []).length ? '<i>' + x.ocorrenciasItens.map(function (o2) {
                  return esc(o2.tipo) + (o2.horasParadas ? " (" + self._n1(o2.horasParadas) + " h paradas)" : "");
                }).join(" · ") + '</i>' : '') + '</td></tr>';
            }).join("") + '</tbody></table>'
          : '<div class="cdoc-aviso">Nenhum diário publicável nesta competência. O controle das condições do tempo do mês ' +
            'está vazio — e isso pesa numa solicitação de prorrogação de prazo.</div>';
        d.tabela(oc.titulo, tabD, P.utilA - 66, {
          custos: this._custoTRs(tabD, 60, 3.1, 1.6),
          antes: cab,
          depois: '<div class="cdoc-nota"><b>Fonte:</b> ' + esc(oc.fonte || "") + '. ' +
            '⚠ O efetivo entra como <b>contagem por função</b>: nome de trabalhador não sai em documento nenhum.<br>' +
            '<b>Chuva com fonte externa</b> (' + self._n1(cl.chuvaMmComFonte) + ' mm no mês) é a que se sustenta se a fiscalização contestar; ' +
            'os ' + cl.semFonteExterna + ' dia(s) apenas anotados contam separado.' +
            (oc.texto ? '</div><div class="cdoc-texto" style="margin-top:6px">' + this._txt(oc.texto) : '') + '</div>'
        });
      }

      // ---- 8. registro fotográfico ----
      /* ⚠ TRÊS ESTADOS, NÃO DOIS — "NÃO APUREI" ≠ "NÃO AUTORIZARAM".
         Roteiro do defeito (12/09/2026, release 1.2.76): este capítulo saía no
         documento do CONTRATANTE dizendo "Nenhuma foto AUTORIZADA para este
         relatório" e "0 foto(s) ficaram de fora por falta de autorização" —
         duas afirmações que o dado não sustenta. O payload que a tela monta
         (`App._cronoDocDados`, js/app.js) nasce com `fotos: []` e
         `fotoIds: []` FIXOS: ninguém foi atrás de foto nenhuma. O papel
         acusava de falta de autorização um mês que não foi apurado, e a
         Ficha de verificação REPROVAVA a linha das fotos.
         A régua da casa: se o sistema não consegue verificar algo, ele diz
         que NÃO CONSEGUE — não afirma que está tudo bem nem que está errado.
         E autorização de foto é coisa séria: referência fora de `fotoIds`
         devolve 403 no Portal e o leitor vê um buraco calado (por isso a
         doutrina continua escrita nos dois estados apurados).
         Quem decide o estado é o motor (js/cronodocs.js) pelo campo
         `apurado`; enquanto ele não disser, o renderizador INFERE pelo
         contrário — só afirma ter apurado se houver foto na mão ou foto
         barrada, e no silêncio diz que não apurou. */
      var fo = sec.fotos, fotosNaoApuradas = false;
      if (fo) {
        var temFotos = (fo.fotos || []).length > 0;
        /* o `apurado` explícito do motor manda; sem ele, só foto na mão ou
           foto barrada provam que alguém procurou */
        var apurouFotos = temFotos || (typeof fo.apurado === "boolean" ? fo.apurado : fo.foraPorAutorizacao > 0);
        fotosNaoApuradas = !apurouFotos;
        var doutrina = '<b>Só foto autorizada entra.</b> ' + fo.foraPorAutorizacao +
          ' foto(s) ficaram de fora por falta de autorização — referência não autorizada devolve 403 no Portal e o leitor veria ' +
          'um buraco calado. <b>Fonte:</b> ' + esc(fo.fonte || "");
        var corpoF;
        if (temFotos) {
          corpoF = '<div class="cdoc-fotos">' + fo.fotos.map(function (f) {
            var src = (typeof opc.fotoSrc === "function") ? opc.fotoSrc(f) : null;
            return '<div class="cdoc-foto">' +
              (src ? '<img src="' + esc(src) + '" alt="' + esc(f.legenda || "foto da obra") + '">'
                : '<div class="q">imagem não anexada a este arquivo<br>(referência ' + esc(f.id || "—") + ')</div>') +
              '<div class="c"><b>' + esc(f.legenda || "sem legenda") + '</b><br>' + self._dISO(f.data) + '</div></div>';
          }).join("") + '</div>';
        } else if (apurouFotos) {
          corpoF = '<div class="cdoc-aviso">Nenhuma foto <b>autorizada</b> para este relatório.</div>';
        } else {
          /* ⚠ TODA TRAVA PRECISA DE PORTA: o leitor fica sabendo onde as fotos
             do mês estão, em vez de ficar com a impressão de que a obra não
             registrou nada — e quem emite fica sabendo o que falta para o
             anexo existir. */
          corpoF = '<div class="cdoc-aviso"><b>Registro fotográfico não apurado nesta versão do relatório.</b> ' +
            'Este documento ainda não anexa fotos: ele <b>não procurou</b> o registro fotográfico do mês. ' +
            'Por isso ele <b>não afirma</b> que houve fotos no período nem que alguma ficou de fora por falta de autorização.<br>' +
            'As fotos do mês continuam nos <b>diários de obra</b> da competência (e no Portal, para quem tem acesso a ele).</div>';
          doutrina = '<b>Quando o anexo existir, só foto autorizada entra.</b> ' +
            'Referência que não está autorizada devolve 403 no Portal e o leitor veria um buraco calado — por isso a lista de ' +
            'autorização é conferida antes de montar a folha, e o que ficar de fora sai declarado. ' +
            '<b>Fonte:</b> nenhuma — o registro fotográfico não entrou neste relatório.';
        }
        d.secao(fo.titulo, corpoF + '<div class="cdoc-nota">' + doutrina + '</div>');
      }

      // ---- 9. medição do mês ----
      var md = sec.medicao;
      if (md) {
        var tabM = md.linhas.length
          ? '<table class="cdoc-tbl"><thead><tr><th style="width:26mm">Boletim</th><th style="width:24mm">Data</th>' +
            '<th style="width:26mm">Situação</th><th class="r" style="width:24mm">% da obra</th>' +
            '<th class="r" style="width:30mm">Valor (R$)</th><th>Conta neste mês</th></tr></thead><tbody>' +
            md.linhas.map(function (L) {
              return '<tr><td>' + esc(L.numero || L.id) + '</td><td>' + self._dISO(L.data) + '</td>' +
                '<td>' + esc(L.status || "—") + '</td>' +
                '<td class="r">' + self._pctOuTraco(L.percentual) + '</td>' +
                '<td class="r">' + moeda(L.valor) + '</td>' +
                '<td>' + (L.contaNoMes ? '<span class="cdoc-ok">sim</span>' : '<span class="cdoc-vago">não — boletim não aprovado</span>') + '</td></tr>';
            }).join("") + '</tbody></table>'
          : '<div class="cdoc-aviso"><b>Nenhum boletim de medição com data nesta competência.</b> O modelo oficial exige que os ' +
            'dados do relatório correspondam à medição do mesmo mês.</div>';
        d.secao(md.titulo, tabM +
          '<div class="cdoc-nota"><b>No mês:</b> ' + md.aprovadasNoMes + ' boletim(ns) aprovado(s) · ' +
          (md.percentualNoMes == null ? 'percentual não informado' : pct1(md.percentualNoMes) + ' da obra') +
          ' · ' + moeda(md.valorNoMes) + '.<br><b>Fonte:</b> ' + esc(md.fonte || "") + '</div>' +
          (md.texto ? '<div class="cdoc-texto" style="margin-top:6px">' + this._txt(md.texto) + '</div>' : ''));
      }

      // ---- 10. pendências, entraves e providências ----
      var pd = sec.pendencias;
      if (pd) {
        var tabA = (pd.atrasadas || []).length
          ? '<table class="cdoc-tbl"><thead><tr><th class="r" style="width:14mm">Nº</th><th>Frente</th>' +
            '<th class="r" style="width:22mm">Previsto</th><th class="r" style="width:22mm">Realizado</th>' +
            '<th class="r" style="width:22mm">Desvio</th><th class="r" style="width:28mm">Valor (R$)</th>' +
            '<th style="width:26mm">Situação</th></tr></thead><tbody>' +
            pd.atrasadas.map(function (a) {
              return '<tr><td class="r">' + esc(a.numero) + '</td><td>' + esc(a.nome) + '</td>' +
                '<td class="r">' + self._pctOuTraco(a.previstoPct) + '</td>' +
                '<td class="r">' + self._pctOuTraco(a.realPct) + '</td>' +
                '<td class="r">' + esc(self._pp(a.desvioPP)) + '</td>' +
                '<td class="r">' + moeda(a.valor) + '</td><td>' + esc(a.situacao || "—") + '</td></tr>';
            }).join("") + '</tbody></table>'
          : '<div class="cdoc-nota">O painel da obra não apontou frente atrasada nesta competência.</div>';
        var tabR = "";
        /* ⚠ restrição em aberto diz onde a NOSSA gestão falhou: no documento
           do contratante ela vira prova contra. Quem decide é o nível, e o
           motor já retirou o campo quando não podia sair. */
        if ((pd.restricoes || []).length && this._pode(rel.publico, "restricoes")) {
          tabR = '<h3 style="font-size:9.5pt;color:#0f2740;margin:9px 0 4px">Restrições em aberto (Last Planner)</h3>' +
            '<table class="cdoc-tbl"><thead><tr><th>Tarefa</th><th style="width:26mm">Tipo</th><th>Descrição</th>' +
            '<th style="width:34mm">Responsável</th><th style="width:24mm">Prazo</th></tr></thead><tbody>' +
            pd.restricoes.map(function (x) {
              return '<tr><td>' + esc(x.tarefa) + '</td><td>' + esc(x.tipo) + '</td><td>' + esc(x.descricao) + '</td>' +
                '<td>' + esc(x.responsavel || "—") + '</td><td>' + (x.prazo ? self._dISO(x.prazo) : '<span class="cdoc-vazio">sem prazo</span>') + '</td></tr>';
            }).join("") + '</tbody></table>';
        }
        d.secao(pd.titulo, tabA + tabR +
          (pd.texto ? '<div class="cdoc-texto" style="margin-top:6px">' + this._txt(pd.texto) + '</div>' : '') +
          (pd.fonte ? '<div class="cdoc-nota"><b>Fonte:</b> ' + esc(pd.fonte) + '</div>' : ''));
      }

      // ---- 11. conclusão e assinaturas ----
      var cc = sec.conclusao;
      if (cc) {
        d.secao(cc.titulo, '<div class="cdoc-texto">' + this._txt(cc.texto, "campo vazio") + '</div>' +
          '<div class="cdoc-assin">' + (cc.assinaturas || []).map(function (a) {
            return '<div><div class="l"></div>' + esc(a.nome || "—") + '<br><span style="color:#6b7b8a">' +
              esc(a.papel) + (a.registro ? " · " + esc(a.registro) : "") + '</span></div>';
          }).join("") + '</div>');
      }

      // ---- 12. ficha de verificação (cap. 13 do modelo oficial) ----
      /* ⚠ A FICHA TEM TRÊS ESTADOS, E "NÃO AVALIADA" É UM DELES. Reprovar
         (☐) o que nem foi apurado é o mesmo defeito do capítulo 8 com outra
         cara: a folha acusava a obra de não ter foto autorizada num mês em
         que ninguém procurou foto (release 1.2.76). Enquanto o registro
         fotográfico não for apurado, TODA linha da ficha que fale de foto sai
         como não avaliada — a pergunta não foi respondida, e a ficha diz
         isso em vez de responder por conta própria.
         O `x.ok == null` é leitura tolerante do contrato que o motor ainda
         vai emitir (pendência em js/cronodocs.js): no dia em que o `checar`
         souber dizer "não avaliei", a folha já sabe imprimir. */
      var vf = rel.verificacao || [];
      var naoAvaliadas = 0;
      var hFicha = vf.map(function (x) {
        var na = (x.ok == null) || (fotosNaoApuradas && /foto/i.test(String(x.item || "")));
        if (na) naoAvaliadas++;
        return '<tr><td class="c">' +
          (na ? '<span class="cdoc-vago">—</span>'
            : (x.ok ? '<span class="cdoc-ok">☑</span>' : '<span class="cdoc-nao">☐</span>')) + '</td>' +
          '<td>' + esc(x.item) + '</td>' +
          '<td>' + esc(na ? "não apurado" : x.apurado) + '</td>' +
          '<td>' + esc(na ? "não avaliada — esta versão do relatório não apura o registro fotográfico, então não há o que aprovar nem reprovar" : x.motivo) + '</td></tr>';
      }).join("");
      d.secao("Ficha de verificação do relatório",
        '<table class="cdoc-tbl"><thead><tr><th style="width:16mm">Consta</th><th>Peça exigida</th>' +
        '<th style="width:60mm">Apurado</th><th>Motivo, quando falta</th></tr></thead><tbody>' +
        hFicha + '</tbody></table>' +
        /* ⚠ o exemplo entre aspas era um número FIXO ("2 de 31") ao lado de uma
           coluna que dizia 3 de 31 — dois números para a mesma pergunta na
           mesma folha (lido em 12/09/2026). O exemplo agora é genérico. */
        '<div class="cdoc-nota">⚠ <b>Contar não é conferir:</b> a coluna <b>Apurado</b> traz o <b>número</b> ' +
        '(“N de M dias com diário”), nunca um “ok” genérico — quem lê decide se o buraco importa.</div>' +
        /* a legenda do “—” só nasce quando existe linha não avaliada: sem ela,
           a folha é a de sempre, byte a byte */
        (naoAvaliadas ? '<div class="cdoc-nota"><b>—</b> na coluna <b>Consta</b> é <b>não avaliada</b>: ' +
          naoAvaliadas + ' item(ns) desta ficha não foram apurados por este relatório. Não avaliada não é reprovada — ' +
          'o documento não afirma o que não verificou.</div>' : '') +
        this._avisos(rel.avisos, "Avisos deste relatório", rel.publico) +
        this._foraDaConta(rel.foraDaConta, 12, rel.publico));
      return d.html();
    },

    /* ================================================================
       D7 — LOOKAHEAD (3 semanas) — o quadro do canteiro

       ⚠ O PAPEL NÃO PODE PROMETER O QUE O MÉTODO PROÍBE: tarefa com
         restrição aberta sai NÃO comprometida, com a restrição à vista. O
         motor já resolve isso (`comprometida` × `comprometidaNoRegistro`);
         aqui só se imprime, e o conflito sai marcado.
       ================================================================ */
    gerarLookahead: function (lk, opc) {
      opc = opc || {};
      var self = this;
      if (!lk || lk.ok !== true) {
        return this._docErro("Lookahead — plano de médio prazo",
          (lk && lk.erro) || "o lookahead não foi montado pelo motor.",
          { papel: opc.papel || "a4-paisagem", obra: opc.obra, empresa: opc.empresa, emissao: opc.emissao });
      }
      var P = this.papel(opc.papel || "a4-paisagem");
      var obraNome = (lk.obra && lk.obra.nome) || opc.obra || "";
      /* ⚠ "Referência", não "Emitido em": a data do lookahead é a que define
         qual é "esta semana", e o rodapé já tem a data de emissão. Duas datas
         com o mesmo rótulo e valores diferentes na mesma folha é como o leitor
         perde a confiança nas duas. */
      var meta = [["Obra", obraNome || "—"], ["Referência", this._dISO(lk.hoje)],
        ["Horizonte", lk.semanas.length + " semana(s)"],
        ["Tarefas", String(lk.totais ? lk.totais.tarefasNoHorizonte : 0)]];
      var d = this.documento({ papel: P.id, titulo: opc.titulo || "Lookahead — plano de médio prazo",
        subtitulo: obraNome, kicker: "QUADRO DO CANTEIRO", meta: meta, obra: obraNome, empresa: opc.empresa,
        nivel: lk.publico ? lk.publico.rotulo : "",
        capa: opc.capa === true, indice: opc.indice === true, emissao: opc.emissao });
      var podeRestr = this._pode(lk.publico, "restricoes");

      lk.semanas.forEach(function (s) {
        /* ⚠ O CARTÃO "TRAVADAS" É INFORMAÇÃO DE RESTRIÇÃO com outro nome: a
           CONTAGEM de tarefas travadas e a frase "têm restrição em aberto"
           dizem o mesmo que a coluna que o nível já esconde. Sem este `_pode`
           a coluna saía guardada e o cartão ao lado entregava o número. */
        var cab = '<div class="cdoc-kpis"><div class="cdoc-kpi"><span>Tarefas na semana</span><b>' + s.nTarefas +
          '</b><i>' + esc(s.periodo || "") + '</i></div>' +
          '<div class="cdoc-kpi"><span>Comprometidas</span><b>' + s.nComprometidas +
          '</b><i>' + (podeRestr ? 'só tarefa sem restrição aberta pode ser comprometida'
            : 'tarefas assumidas para a semana') + '</i></div>' +
          (podeRestr
            ? '<div class="cdoc-kpi"><span>Travadas</span><b>' + s.nTravadas +
              '</b><i>têm restrição em aberto — precisam ser liberadas antes</i></div>'
            : '<div class="cdoc-kpi"><span>Em preparação</span><b>' + s.nTravadas +
              '</b><i>ainda não assumidas para esta semana</i></div>') + '</div>';
        var tab = s.tarefas.length
          ? '<table class="cdoc-tbl"><thead><tr><th style="width:16mm">Comprom.</th><th>Tarefa</th>' +
            '<th style="width:34mm">Frente</th><th style="width:34mm">Responsável</th>' +
            '<th style="width:20mm">Situação</th>' +
            (podeRestr ? '<th>Restrições em aberto (o que liberar antes)</th>' : '<th style="width:26mm">Liberada</th>') +
            '</tr></thead><tbody>' +
            s.tarefas.map(function (t2) {
              var marca = t2.comprometida ? '<span class="cdoc-ok">☑</span>' : '☐';
              var restr = "";
              if (podeRestr) {
                restr = t2.restricoes.length
                  ? t2.restricoes.map(function (x) {
                    return '☐ ' + esc(x.tipo) + (x.descricao ? " — " + esc(x.descricao) : "") +
                      (x.responsavel ? " · " + esc(x.responsavel) : ' · <span class="cdoc-vago">sem responsável</span>') +
                      (x.prazo ? " · até " + self._dISO(x.prazo) + (x.vencida ? ' <span class="cdoc-nao">VENCIDA</span>' : "")
                        : ' · <span class="cdoc-vago">sem prazo</span>');
                  }).join("<br>")
                  : '<span class="cdoc-vazio">sem restrição</span>';
              } else {
                restr = t2.podeComprometer ? '<span class="cdoc-ok">sim</span>' : '<span class="cdoc-nao">não</span>';
              }
              /* ⚠ A MARCA "conflito" É A MESMA ADMISSÃO DO CARTÃO "Conflitos no
                 plano": ela diz que NÓS gravamos como comprometida uma tarefa
                 travada. O cartão já ficou atrás do `podeRestr`; a marca de
                 linha continuava saindo em vermelho no papel da fiscalização
                 (lido na folha 1 em 12/09/2026). Onde a coluna de restrição
                 não entra, esta marca também não — a linha continua com a
                 caixa DESmarcada, que é a regra que não cede. */
              return '<tr><td class="c">' + marca +
                (t2.conflito && podeRestr ? '<i><span class="cdoc-nao">conflito</span></i>' : '') + '</td>' +
                '<td>' + esc(t2.titulo) + (t2.etapa ? '<i>' + esc(t2.etapa) + '</i>' : '') + '</td>' +
                '<td>' + esc(t2.frente || "—") + '</td><td>' + esc(t2.responsavel || "—") + '</td>' +
                '<td>' + esc(t2.status) + '</td><td>' + restr + '</td></tr>';
            }).join("") + '</tbody></table>'
          : '<div class="cdoc-nota">Nenhuma tarefa planejada para esta semana.</div>';
        d.tabela(s.rotulo + " — " + (s.periodo || s.chave), tab, P.utilA - 62,
          { antes: cab, custos: self._custoTRs(tab, 52, 3.1, 1.6) });
      });

      if (podeRestr) {
        var al = lk.aLiberar || [];
        var tabL = al.length
          ? '<table class="cdoc-tbl"><thead><tr><th style="width:28mm">Liberar até</th><th style="width:30mm">Semana</th>' +
            '<th>Tarefa</th><th style="width:26mm">Tipo</th><th>Restrição</th><th style="width:34mm">Responsável</th>' +
            '<th style="width:24mm">Prazo</th></tr></thead><tbody>' +
            al.map(function (x) {
              return '<tr><td>' + self._dISO(x.liberarAte) + '</td><td>' + esc(x.rotuloSemana) + '</td>' +
                '<td>' + esc(x.tarefa) + '</td><td>' + esc(x.tipo) + '</td><td>' + esc(x.descricao) + '</td>' +
                '<td>' + (x.responsavel ? esc(x.responsavel) : '<span class="cdoc-vago">sem dono</span>') + '</td>' +
                '<td>' + (x.prazo ? (self._dISO(x.prazo) + (x.atrasadaParaASemana ? ' <span class="cdoc-nao">depois da semana</span>' : ''))
                  : '<span class="cdoc-vago">sem prazo</span>') + '</td></tr>';
            }).join("") + '</tbody></table>'
          : '<div class="cdoc-nota">Nenhuma restrição em aberto no horizonte impresso.</div>';
        d.tabela("O que precisa ser liberado antes", tabL, P.utilA - 36, {
          custos: this._custoTRs(tabL, 48, 3.1, 1.6),
          depois: '<div class="cdoc-nota">O método chama isto de <b>limpar o terreno</b>: a tarefa só é comprometida ' +
            'quando a restrição dela foi removida. Restrição <b>sem dono</b> ou <b>sem prazo</b> não se remove sozinha.</div>'
        });
      }

      var rodape = "";
      if (lk.ppc) {
        rodape += '<div class="cdoc-kpis"><div class="cdoc-kpi"><span>PPC da semana anterior</span><b>' +
          (lk.ppc.valor == null ? '<span class="cdoc-vazio">—</span>' : esc(this._n1(lk.ppc.valor)) + '<span style="font-size:9pt">%</span>') +
          '</b><i>' + lk.ppc.feitas + ' de ' + lk.ppc.comprometidas + ' comprometidas · semana ' + esc(lk.ppc.semana) + '</i></div>' +
          '<div class="cdoc-kpi"><span>Não cumpridas</span><b>' + lk.ppc.naofeitas + '</b><i>' + lk.ppc.pendentes + ' ainda pendentes</i></div>' +
          /* ⚠ "Conflitos no plano" É A NOSSA GESTÃO ADMITINDO que comprometeu
             tarefa travada: no documento do contratante vira prova contra, e
             saía impresso em FISCALIZAÇÃO e CLIENTE (achado 12/09/2026). */
          (podeRestr ? '<div class="cdoc-kpi"><span>Conflitos no plano</span><b>' + (lk.totais ? lk.totais.conflitos : 0) +
            '</b><i>comprometidas com restrição aberta — saem NÃO comprometidas no papel</i></div>' : '') + '</div>';
        if (lk.ppc.valor == null) rodape += '<div class="cdoc-nota">A semana anterior não teve tarefa comprometida: o PPC fica <b>em branco</b>, nunca em 0%.</div>';
      }
      if (lk.causas && this._pode(lk.publico, "causasPPC")) {
        rodape += '<h3 style="font-size:9.5pt;color:#0f2740;margin:9px 0 4px">Causas de não cumprimento (Pareto)</h3>' +
          '<table class="cdoc-tbl"><thead><tr><th>Causa</th><th class="r" style="width:20mm">Ocorrências</th>' +
          '<th class="r" style="width:20mm">%</th></tr></thead><tbody>' +
          lk.causas.linhas.map(function (L) {
            return '<tr><td>' + esc(L.causa) + '</td><td class="r">' + L.n + '</td><td class="r">' + esc(self._n1(L.pct)) + '%</td></tr>';
          }).join("") + '</tbody></table>';
      }
      rodape += this._avisos(lk.avisos, "Avisos deste quadro", lk.publico) + this._foraDaConta(lk.foraDaConta, 8, lk.publico);
      d.secao("PPC, causas e avisos", rodape);
      return d.html();
    },

    /* ================================================================
       D9 — RESUMO EXECUTIVO (uma folha, diretoria)

       ⚠ Nasce INTERNO e sai carimbado. Ao lado do avanço vai sempre a
         RÉGUA que respondeu: são três perguntas diferentes, e a folha que
         mostra uma sem as outras faz duas pessoas da mesma empresa
         discutirem com números diferentes.
       ================================================================ */
    gerarResumoExecutivo: function (ex, opc) {
      opc = opc || {};
      var self = this;
      if (!ex || ex.ok !== true) {
        return this._docErro("Resumo executivo da obra",
          (ex && ex.erro) || "o resumo executivo não foi montado pelo motor.",
          { papel: opc.papel || "a4-retrato", obra: opc.obra, empresa: opc.empresa, emissao: opc.emissao });
      }
      var P = this.papel(opc.papel || "a4-retrato");
      var obraNome = (ex.obra && ex.obra.nome) || opc.obra || "";
      var d = this.documento({ papel: P.id, titulo: opc.titulo || "Resumo executivo da obra", subtitulo: obraNome,
        meta: [["Obra", obraNome || "—"], ["Data de corte", this._dISO(ex.dataCorte)],
          ["Situação", ex.situacao ? ex.situacao.texto : "não apurada"]],
        obra: obraNome, empresa: opc.empresa, nivel: ex.publico ? ex.publico.rotulo : "",
        capa: opc.capa === true, indice: opc.indice === true, emissao: opc.emissao });

      var corpo = '<div class="cdoc-kpis">' + (ex.kpis || []).map(function (k) { return self._kpi(k); }).join("") + '</div>';
      var pz = ex.prazo || {};
      corpo += '<h3 style="font-size:9.5pt;color:#0f2740;margin:8px 0 4px">Prazo</h3>' +
        '<table class="cdoc-tbl"><tbody>' +
        '<tr><td style="width:46mm">Início</td><td>' + this._dISO(pz.inicio) +
        (pz.fonteInicio ? ' <i style="display:inline">(' + esc(pz.fonteInicio) + ')</i>' : '') + '</td></tr>' +
        '<tr><td>Término previsto (plano atual)</td><td>' + this._dISO(pz.terminoPrevisto) + '</td></tr>' +
        '<tr><td>Término da linha de base</td><td>' + (pz.terminoBase ? this._dISO(pz.terminoBase)
          : '<span class="cdoc-vago">a obra não tem linha de base congelada</span>') + '</td></tr>' +
        '<tr><td>Desvio de término</td><td>' + (pz.desvioDias == null ? '<span class="cdoc-vazio">—</span>'
          : (esc(String(pz.desvioDias)) + " " + esc(pz.unidadeDesvio || "dias"))) + '</td></tr>' +
        /* ⚠ caminho crítico e folga só existem no payload do nível que os
           permite; a segunda fechadura é este `_pode` */
        (pz.caminhoCritico && this._pode(ex.publico, "caminhoCritico")
          ? '<tr><td>Caminho crítico</td><td>' + pz.caminhoCritico.etapas + ' de ' + pz.caminhoCritico.de + ' etapas sem folga</td></tr>' : '') +
        (pz.folgaMinimaDias != null && this._pode(ex.publico, "folga")
          ? '<tr><td>Menor folga fora do caminho crítico</td><td>' + esc(String(pz.folgaMinimaDias)) + ' dias úteis</td></tr>' : '') +
        '</tbody></table>';

      if (ex.tendencia) {
        /* ⚠ O LEITOR TEM DE CONSEGUIR REFAZER A CONTA NA FOLHA. O ritmo saía
           com UMA casa (0,2) e o resultado vinha calculado com o valor cheio
           (0,17): pelo número impresso a divisão dava 498 meses e o papel
           dizia 586. Aqui o ritmo sai com a MESMA precisão da divisão e o que
           falta (p.p.) vai junto — os três números fecham entre si. */
        corpo += '<div class="cdoc-nota"><b>Tendência (projeção, não medição):</b> ritmo de ' +
          esc(this._n2(ex.tendencia.ritmoPPmes)) + ' p.p./mês nos últimos ' + ex.tendencia.mesesDaBase +
          ' mês(es) medido(s) — último medido ' + esc(this._n1(ex.tendencia.ultimoMedido)) + '% em ' +
          esc(ex.tendencia.ultimoMesMedido || "—") +
          /* ⚠ sem ponto depois de "p.p." — a frase já emenda o ponto final e a
             folha saía com "99,6 p.p.." (lido na foto de 12/09/2026) */
          (ex.tendencia.faltaPP == null ? '. ' : ', faltando ' + esc(this._n1(ex.tendencia.faltaPP)) + ' p.p. ') +
          (ex.tendencia.mesesParaConcluir == null
            ? (ex.tendencia.foraDoHorizonte
              ? 'Nesse ritmo o término <b>não cai dentro de um horizonte útil</b> (o plano ainda tem ' +
                (ex.tendencia.mesesRestantesDoPlano == null ? '—' : ex.tendencia.mesesRestantesDoPlano) +
                ' mês(es)): a folha não projeta data.'
              : 'Com esse ritmo não se projeta término.')
            : 'Nesse ritmo faltariam <b>' + ex.tendencia.mesesParaConcluir + ' mês(es)</b>.') +
          ' ⚠ é projeção rotulada: nunca entra somada ao acumulado real.</div>';
      }
      if ((ex.marcos || []).length) {
        corpo += '<h3 style="font-size:9.5pt;color:#0f2740;margin:8px 0 4px">Marcos</h3>' +
          '<table class="cdoc-tbl"><thead><tr><th class="r" style="width:12mm">Nº</th><th>Marco</th>' +
          '<th style="width:26mm">Previsto</th></tr></thead><tbody>' +
          ex.marcos.slice(0, 6).map(function (m) {
            return '<tr><td class="r">' + esc(m.numero) + '</td><td>' + esc(m.nome) + '</td><td>' + self._dISO(m.previsto) + '</td></tr>';
          }).join("") + '</tbody></table>';
      }
      corpo += '<h3 style="font-size:9.5pt;color:#0f2740;margin:8px 0 4px">Pontos de atenção</h3>';
      corpo += (ex.atencao || []).length
        ? '<table class="cdoc-tbl"><thead><tr><th style="width:34mm">Origem</th><th>O quê</th><th>Leitura</th>' +
          '</tr></thead><tbody>' + ex.atencao.map(function (a) {
            return '<tr><td>' + esc(a.origem) + '</td><td>' + (a.numero ? esc(a.numero) + " " : "") + esc(a.titulo) + '</td>' +
              '<td>' + esc(a.detalhe) + (a.responsavel ? ' · ' + esc(a.responsavel) : '') + '</td></tr>';
          }).join("") + '</tbody></table>'
        : '<div class="cdoc-nota">O painel e o Last Planner não apontaram ponto de atenção. ' +
          'Pontos não se inventam para fechar uma lista.</div>';
      corpo += '<h3 style="font-size:9.5pt;color:#0f2740;margin:8px 0 4px">Decisões pedidas</h3>' +
        '<div class="cdoc-texto">' + this._txt(opc.decisoes, "a preencher pelo responsável antes da reunião") + '</div>' +
        '<div class="cdoc-nota"><b>Data de corte:</b> ' + this._dISO(ex.dataCorte) +
        this._corte(ex.fonteCorte, ex.fonteCorteRotulo) + '. ' +
        '⚠ Cada percentual acima traz a <b>régua</b> que o respondeu — são três perguntas diferentes.</div>' +
        this._avisos(ex.avisos, "Avisos do painel", ex.publico) + this._foraDaConta(ex.foraDaConta, 6, ex.publico);
      d.secao("Situação da obra", corpo);
      return d.html();
    },

    /* ================================================================
       D10 — O CRONOGRAMA DE SEMPRE, NO SHELL PAGINADO

       ⚠ O CORPO NÃO É REESCRITO: sai do `gerarHTML` (o mesmo código que a
         proposta e as 38 instalações imprimem) e é RECORTADO por seção. As
         tabelas longas passam pelo `_fatiar`, que não reescreve linha
         nenhuma. Uma segunda cópia do gerador seria a réplica que apodrece
         calada — e a divergência apareceria no papel do cliente.
       ================================================================ */
    /* ⚠ LARGURA MÍNIMA DO CRONOGRAMA COMPLETO — NÚMERO MEDIDO, NÃO ESTIMADO.
       No Chrome com `media=print`, a tabela "2. Etapas, prazos e precedências"
       da obra de 21 etapas mediu 246,7 · 259,6 · 257,4 mm de largura mínima
       (12/09/2026). Em A4 RETRATO (186 mm úteis) ela saía decepada: a coluna
       "Data limite" cortada ao meio («26/02/20|26») e "Valor (R$)" e "Peso"
       fora da folha — e o `_fatiar` corta LINHAS, nunca COLUNAS, então nada no
       caminho percebia. A3 retrato (273 mm) não tem o problema.
       260 mm é o pior caso medido, arredondado para cima. */
    LARG_MIN_CRONOGRAMA_MM: 260,

    /* Rótulos de público que o `CronoDocs` carimba. ⚠ O SHELL NÃO PODE
       CARIMBAR "CLIENTE / CONTRATANTE" NUM DOCUMENTO QUE IMPRIME CAMINHO
       CRÍTICO E FOLGA. As duas réguas da casa divergem de propósito (o
       cronograma de sempre mostra folga e crítico ao cliente e os explica na
       seção 5; os documentos novos não), e a unificação é decisão do Rogério
       — pendência declarada em js/cronodocs.js. Mas no MESMO pacote o
       físico-financeiro dizia por escrito que caminho crítico não entra no
       nível CLIENTE enquanto esta folha o imprimia com a tarja CLIENTE: o
       produto se contradizia na mesa do contratante. Enquanto a decisão não
       sai, este documento recusa o carimbo em vez de mentir. A PORTA está na
       mensagem: nível interno/canteiro, tarja livre, ou o documento próprio
       desse público. */
    NIVEL_VEDADO_NO_CRONOGRAMA: { "FISCALIZAÇÃO": "fiscalizacao", "CLIENTE / CONTRATANTE": "cliente" },

    gerarPaginado: function (orc, r, opts) {
      opts = opts || {};
      var self = this;
      var P0 = this.papel(opts.papel || "a4-paisagem");
      if (P0.utilL < this.LARG_MIN_CRONOGRAMA_MM) {
        return this._docErro("Cronograma da Obra",
          "este cronograma não cabe em " + P0.nome + ": a tabela de etapas precisa de pelo menos " +
          this.LARG_MIN_CRONOGRAMA_MM + " mm de largura útil e esta folha tem " + P0.utilL +
          " mm. As colunas Data limite, Valor e Peso sairiam decepadas pela borda, sem aviso. " +
          "Use A4 paisagem, A3 paisagem ou A3 retrato.",
          { papel: "a4-paisagem", obra: (orc && orc.obra && orc.obra.nome) || "", empresa: opts.empresa, emissao: opts.emissao });
      }
      var nvVed = this.NIVEL_VEDADO_NO_CRONOGRAMA[String(opts.nivel == null ? "" : opts.nivel)];
      if (nvVed) {
        return this._docErro("Cronograma da Obra",
          "este documento imprime caminho crítico, folga e data limite, e o nível “" + String(opts.nivel) +
          "” não admite esses campos nos documentos desta frente — carimbá-lo aqui seria o mesmo pacote " +
          "dizendo duas coisas contrárias ao contratante. Emita-o sem esse carimbo (ou como USO INTERNO / " +
          "QUADRO DO CANTEIRO), ou emita o Cronograma Físico-Financeiro, que é o documento feito para este público.",
          { papel: P0.id, obra: (orc && orc.obra && orc.obra.nome) || "", empresa: opts.empresa, emissao: opts.emissao });
      }
      /* o corpo é gerado para ESTE papel: o Gantt precisa saber a altura útil
         da folha, senão o desenho nasce mais alto que ela */
      var o2 = {}, k2;
      for (k2 in opts) { if (Object.prototype.hasOwnProperty.call(opts, k2)) o2[k2] = opts[k2]; }
      if (o2.larguraMM == null) o2.larguraMM = P0.utilL;
      if (o2.alturaMM == null) o2.alturaMM = P0.utilA - 46;
      var corpo = this.gerarHTML(orc, r, o2);
      var iDiv = corpo.indexOf('<div class="rel-doc cron-doc">');
      if (iDiv < 0) return corpo;   // documento de erro ("sem etapas"): sai como está
      var estilos = corpo.slice(0, iDiv);
      var dentro = corpo.slice(iDiv + '<div class="rel-doc cron-doc">'.length, corpo.lastIndexOf("</div>"));
      var P = this.papel(opts.papel || "a4-paisagem");
      /* blocos BALANCEADOS do corpo (nunca `indexOf("</div>")`: ver _blocosTopo) */
      var blocos = this._blocosTopo(dentro);
      var secs = [], atual = { titulo: "Resumo do cronograma", blocos: [] };
      blocos.forEach(function (b) {
        if (b.indexOf('<h2 class="rel-tit">') === 0) {
          if (atual.blocos.length) secs.push(atual);
          atual = { titulo: b.replace(/<[^>]+>/g, ""), blocos: [] };
          return;
        }
        if (b.indexOf('<div class="wm">') === 0) return;   // o shell desenha a marca d'água em toda folha
        atual.blocos.push(b);
      });
      if (atual.blocos.length) secs.push(atual);
      var d = this.documento({ papel: P.id,
        titulo: opts.titulo || (orc && orc._planoDaObra ? "Plano de execução da obra" : "Cronograma da Obra"),
        subtitulo: (orc && orc.nome) || "", kicker: "CRONOGRAMA",
        meta: [["Nº", (orc && orc.numero) || "—"], ["Cliente", (orc && orc.cliente && orc.cliente.nome) || "—"],
          ["Obra", (orc && orc.obra && orc.obra.nome) || "—"],
          ["Prazo", (r && r.totalDias ? r.totalDias + " dias úteis" : "—")]],
        obra: (orc && orc.obra && orc.obra.nome) || "", empresa: opts.empresa, nivel: opts.nivel,
        capa: opts.capa, indice: opts.indice, emissao: opts.emissao });
      function env(x) { return '<div class="rel-doc cron-doc">' + x + '</div>'; }
      /* ⚠ SVG SOLTO TAMBÉM PRECISA CABER NA ALTURA. Sem recorte de tempo o
         Gantt vem como um desenho único: 21 linhas na largura da folha dão
         ~206 mm de altura e a folha tem ~165 mm úteis. Aqui ele ganha a mesma
         trava de largura que as folhas recortadas têm. */
      function limitarSVG(b) {
        // só o GANTT: a curva S é baixa e não precisa de trava (nem de folha própria)
        if (b.indexOf('<svg class="gantt') !== 0) return b;
        var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(b);
        if (!vb || !(+vb[1] > 0)) return b;
        var larg = Math.min(P.utilL, Math.floor((P.utilA - 46) / (+vb[2] / +vb[1])));
        return '<div class="cron-gpag" style="max-width:' + larg + 'mm;margin:0 auto">' + b + '</div>';
      }
      secs.forEach(function (s) {
        s.blocos = s.blocos.map(limitarSVG);
        /* cada folha do Gantt (cron-gpag) é UMA folha do documento */
        var gpags = [], resto = [];
        s.blocos.forEach(function (b) {
          if (b.indexOf('class="cron-gpag') > -1 && b.indexOf("<div") === 0) gpags.push(b); else resto.push(b);
        });
        if (gpags.length) {
          gpags.forEach(function (g, i) {
            var t2 = s.titulo + (gpags.length > 1 ? " (folha " + (i + 1) + " de " + gpags.length + ")" : "");
            /* legenda e notas do gráfico vão na ÚLTIMA folha: elas explicam o
               que o leitor acabou de ver, inclusive as setas de continuação */
            var html = env(g + (i === gpags.length - 1 ? resto.join("") : ""));
            if (i === 0) d.secao(t2, html); else d.continua(t2, html);
          });
          return;
        }
        var tab = null, antes = [], depois = [];
        resto.forEach(function (b) {
          if (tab === null && b.indexOf("<table") === 0) { tab = b; return; }
          (tab === null ? antes : depois).push(b);
        });
        if (tab) {
          /* ⚠ a altura da linha do documento antigo é maior: `.prop-tbl` usa
             10,5 pt com 8 px de padding — perto de 7 mm por linha no papel.
             O número é estimativa DECLARADA; quem confere é a e2e, que conta
             as folhas do PDF de verdade. */
          /* ⚠ MEDIDO NO NAVEGADOR, não deduzido: a linha do `.prop-tbl` com
             nome de etapa de obra ocupa 56 px (2 linhas) a 76 px (3 linhas) —
             5,3 mm por linha de texto e 4,2 mm de padding, numa coluna de
             ~54 mm. O corte em 15 caracteres por linha é PESSIMISTA de
             propósito: errar para menos custa uma folha a mais do que o
             rodapé promete, e aí o "Página N de M" mente. */
          var custos = self._custoTRs(tab, 15, 5.3, 4.2);
          /* ⚠ O QUE VEM ANTES DA TABELA (curva S, 69 mm) SÓ ESTÁ NA 1ª FOLHA.
             Descontá-lo de todas dava 53 mm de orçamento a folhas que tinham
             122 mm livres, e a seção saía 5+5+5+5+1 com 134 mm de branco na
             última (medido no navegador em 12/09/2026). */
          var espaco = P.utilA - 56 - self._alturaBlocosMM(depois, P.utilL);
          var espaco1 = espaco - self._alturaBlocosMM(antes, P.utilL);
          var partes = self._fatiar(tab, espaco, custos, espaco1);
          partes.forEach(function (p, i) {
            var corpo = env((i === 0 ? antes.join("") : "") + p + (i === partes.length - 1 ? depois.join("") : ""));
            if (i === 0) d.secao(s.titulo, corpo);
            else d.continua(s.titulo + " (continuação " + (i + 1) + " de " + partes.length + ")", corpo);
          });
          return;
        }
        d.secao(s.titulo, env(s.blocos.join("")));
      });
      return estilos + d.html();
    },

    /* Porta única para a fiação (js/app.js): tipo + payload do motor.
       ⚠ tipo desconhecido NÃO devolve documento vazio — devolve a folha que
       diz o que aconteceu. */
    gerarDocumento: function (tipo, payload, opc) {
      var t = String(tipo == null ? "" : tipo);
      if (t === "fisico-financeiro") return this.gerarFisicoFinanceiro(payload, opc);
      if (t === "relatorio-mensal") return this.gerarRelatorioMensal(payload, opc);
      if (t === "lookahead") return this.gerarLookahead(payload, opc);
      if (t === "resumo-executivo") return this.gerarResumoExecutivo(payload, opc);
      return this._docErro("Documento do cronograma",
        'tipo de documento desconhecido: “' + t + '”. Os tipos são: fisico-financeiro, relatorio-mensal, lookahead e resumo-executivo.', opc);
    }
  };

  global.CronoPDF = CronoPDF;
  if (typeof module !== "undefined" && module.exports) module.exports = CronoPDF;
})(typeof window !== "undefined" ? window : this);

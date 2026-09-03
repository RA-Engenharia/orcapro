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

    /* orc: orçamento · r: resultado de Cronograma.estimar (opcional — calcula)
       opts.ganttSVG: o SVG já pronto (a tela passa o UI._gantt; o teste passa
       o dele). Sem opts, tenta o UI global — é a mesma fonte. */
    gerarHTML: function (orc, r, opts) {
      opts = opts || {};
      if (!r && typeof Cronograma !== "undefined" && Cronograma.estimar) r = Cronograma.estimar(orc);
      if (!r || !r.etapas || !r.etapas.length) return '<div class="rel-doc">Sem etapas para montar o cronograma.</div>';
      var p = r.params || {};
      var svg = (opts.ganttSVG != null) ? opts.ganttSVG
        : ((typeof UI !== "undefined" && UI._gantt) ? UI._gantt(r) : "");

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

      var h = CSS + '<div class="rel-doc cron-doc">';
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

      // ---- Gantt ----
      h += '<h2 class="rel-tit">1. Gráfico de Gantt</h2>' + svg;
      /* a legenda só explica o que ESTÁ no gráfico: "folga" e "marco" numa obra
         que não tem nenhum dos dois é ruído que faz o leitor procurar na figura
         algo que não existe. */
      var temFolga = false;
      r.etapas.forEach(function (e) { if (e.folga > 0) temFolga = true; });
      h += '<div class="cron-legenda">' +
        (nCrit ? '<span><i style="background:#b91c1c"></i>caminho crítico (sem folga)</span>' : '') +
        '<span><i style="background:#94a3b8"></i>dependência entre etapas</span>' +
        (temFolga ? '<span><i style="background:#dbe4ee;border:1px dashed #94a3b8"></i>folga</span>' : '') +
        (nMarcos ? '<span><b style="color:#0f172a">◆</b> marco (evento sem duração)</span>' : '');
      var vistas = {};
      r.etapas.forEach(function (e) {
        if (vistas[e.categoria]) return; vistas[e.categoria] = 1;
        h += '<span><i style="background:' + esc(e.cor || "#94a3b8") + '"></i>' + esc(e.categoriaNome || e.categoria) + '</span>';
      });
      h += '</div>';

      // ---- tabela de etapas ----
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
            (e.editado ? ' <span title="duração informada manualmente">✎</span>' : '') + '</td>' +
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
        '<b>Durações:</b> estimadas pela produtividade das composições de preço; onde há ✎, a duração foi informada pela equipe e prevalece.<br>' +
        (nMarcos ? '<b>Marcos (◆):</b> eventos sem duração (entrega, vistoria, liberação) — aparecem como losango no gráfico.<br>' : '') +
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

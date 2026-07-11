/* =====================================================================
 * excel.js — Exportação Excel PROFISSIONAL (workbook vivo, 3 abas)
 * Abas: Resumo · Sintética · Analítica. Tudo com FÓRMULAS (recalcula
 * ao mudar QTD, custo ou BDI) + formatação padrão de planilha
 * orçamentária (navy/aço, moeda R$, zebra, freeze, subtotais).
 * Usa ExcelJS (lazy-load CDN). `construir()` é pura/testável (Node).
 * ===================================================================== */
(function (global) {
  "use strict";

  var SH_RES = "Resumo", SH_SINT = "Sintética", SH_ANAL = "Analítica";
  var BDI_ADDR = "'" + SH_RES + "'!$B$6"; // endereço físico do parâmetro BDI (input amarelo)
  var BDI_CELL = "p_BDI"; // FASE 2: fórmulas usam o named range (legível e à prova de mover célula)
  function ref(sheet, cell) { return "'" + sheet + "'!" + cell; }

  var MOEDA = 'R$ #,##0.00', NUM = '#,##0.00', PCT = '0.00"%"';
  var navy = 'FF0F2740', aco = 'FF2E6F9E', cinza = 'FFEFF3F8', branco = 'FFFFFFFF',
      verde = 'FF16A34A', cinzaSub = 'FFE2E8F0', muted = 'FF64748B', amarelo = 'FFFFF7CC';

  function thin() { var s = { style: 'thin', color: { argb: 'FFCBD5E1' } }; return { top: s, left: s, bottom: s, right: s }; }
  function hStyle(c) { c.font = { bold: true, color: { argb: branco }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = thin(); }

  // Cores da identidade (para os gráficos em canvas)
  var COR = { navy: '#0f2740', aco: '#2e6f9e', verde: '#16a34a', amarelo: '#f59e0b', vermelho: '#dc2626', cinza: '#e2e8f0', muted: '#64748b', texto: '#1e293b' };

  /* =====================================================================
   * GRÁFICOS EM CANVAS (SÓ NO BROWSER) — geram PNG base64 p/ embutir.
   * Rodam no wrapper gerar()/ensureExcelJS, ANTES de construir(). Node não
   * tem document/canvas → nunca são chamados lá (construir só usa deps.graficos).
   * ===================================================================== */

  // Cria um canvas offscreen com fundo branco (qualidade de impressão).
  function _canvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    return { cv: cv, ctx: ctx };
  }
  function _titulo(ctx, txt, w) {
    ctx.fillStyle = COR.navy; ctx.font = 'bold 26px Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(txt, 34, 44);
    ctx.strokeStyle = COR.aco; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(34, 58); ctx.lineTo(w - 34, 58); ctx.stroke();
  }
  function _corta(ctx, txt, maxW) {
    txt = String(txt == null ? '' : txt);
    if (ctx.measureText(txt).width <= maxW) return txt;
    while (txt.length > 1 && ctx.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1);
    return txt + '…';
  }
  function _money(v, fmtNum) { return 'R$ ' + fmtNum(v || 0, 0); }

  // --- Curva ABC / Pareto: barras (custo desc) + linha do % acumulado + faixas A/B/C ---
  // abc = { linhas:[{codigo,descricao,custoTotal,pct,acumPct,classe}], ... } (Orcamento.curvaABC)
  function _pngABC(abc, fmtNum) {
    var linhas = (abc && abc.linhas) ? abc.linhas.slice(0, 20) : [];
    var W = 900, H = 460, o = _canvas(W, H), ctx = o.ctx;
    _titulo(ctx, 'Curva ABC — Pareto (custo por item)', W);
    var padL = 60, padR = 56, padT = 80, padB = 96;
    var plotW = W - padL - padR, plotH = H - padT - padB, x0 = padL, y0 = H - padB;
    var maxV = linhas.reduce(function (m, l) { return Math.max(m, l.custoTotal || 0); }, 0) || 1;
    var corCl = { A: COR.verde, B: COR.amarelo, C: COR.muted };
    // grade + eixo Y esquerdo (R$) e direito (%)
    ctx.textAlign = 'right'; ctx.font = '12px Arial, sans-serif';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      var yy = y0 - g * plotH;
      ctx.strokeStyle = COR.cinza; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + plotW, yy); ctx.stroke();
      ctx.fillStyle = COR.muted; ctx.fillText(fmtNum(maxV * g, 0), x0 - 6, yy + 4);
      ctx.textAlign = 'left'; ctx.fillText((g * 100).toFixed(0) + '%', x0 + plotW + 6, yy + 4); ctx.textAlign = 'right';
    });
    var n = linhas.length || 1, bw = plotW / n, bar = Math.min(bw * 0.62, 46);
    // barras
    linhas.forEach(function (l, i) {
      var cx = x0 + i * bw + (bw - bar) / 2;
      var bh = (l.custoTotal || 0) / maxV * plotH;
      ctx.fillStyle = corCl[l.classe] || COR.aco;
      ctx.fillRect(cx, y0 - bh, bar, bh);
      ctx.save(); ctx.translate(cx + bar / 2, y0 + 6); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = COR.muted; ctx.font = '10px Arial, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(_corta(ctx, l.codigo || l.descricao || ('#' + (i + 1)), 74), 0, 0);
      ctx.restore();
    });
    // linha % acumulado
    ctx.strokeStyle = COR.navy; ctx.lineWidth = 2.5; ctx.beginPath();
    linhas.forEach(function (l, i) {
      var cx = x0 + i * bw + bw / 2, cy = y0 - (Math.min(100, l.acumPct || 0) / 100) * plotH;
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    linhas.forEach(function (l, i) {
      var cx = x0 + i * bw + bw / 2, cy = y0 - (Math.min(100, l.acumPct || 0) / 100) * plotH;
      ctx.fillStyle = COR.navy; ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, 2 * Math.PI); ctx.fill();
    });
    // faixas A/B/C (80% / 95%)
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
    [{ v: 80, c: COR.verde }, { v: 95, c: COR.amarelo }].forEach(function (f) {
      var yy = y0 - (f.v / 100) * plotH;
      ctx.strokeStyle = f.c; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + plotW, yy); ctx.stroke();
    });
    ctx.setLineDash([]);
    // legenda
    var lx = padL, ly = H - 30;
    ctx.font = '13px Arial, sans-serif'; ctx.textAlign = 'left';
    [['A', 'até 80%'], ['B', '80–95%'], ['C', '95–100%']].forEach(function (p) {
      ctx.fillStyle = corCl[p[0]]; ctx.fillRect(lx, ly - 11, 14, 14);
      ctx.fillStyle = COR.texto; ctx.fillText('Classe ' + p[0] + ' (' + p[1] + ')', lx + 20, ly);
      lx += 200;
    });
    ctx.fillStyle = COR.navy; ctx.fillText('— % acumulado', lx, ly);
    return o.cv.toDataURL('image/png');
  }

  // --- Curva S: linha do avanço físico-financeiro acumulado (%) ---
  // pts = [%acum semana 1, ...] ; rotulos p/ eixo X. (mesma lógica do _curvaS do ui.js)
  function _pngCurvaS(pts, totalTxt) {
    pts = (pts && pts.length) ? pts : [0];
    var W = 900, H = 420, o = _canvas(W, H), ctx = o.ctx;
    _titulo(ctx, 'Curva S — avanço físico-financeiro acumulado', W);
    var padL = 54, padR = 24, padT = 82, padB = 56;
    var plotW = W - padL - padR, plotH = H - padT - padB, x0 = padL, yTop = padT, yBot = H - padB;
    var nSem = pts.length;
    var X = function (i) { return x0 + (nSem <= 1 ? plotW / 2 : (i / (nSem - 1)) * plotW); };
    var Y = function (v) { return yBot - (Math.min(100, Math.max(0, v)) / 100) * plotH; };
    ctx.font = '12px Arial, sans-serif';
    [0, 25, 50, 75, 100].forEach(function (g) {
      var yy = Y(g);
      ctx.strokeStyle = COR.cinza; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + plotW, yy); ctx.stroke();
      ctx.fillStyle = COR.muted; ctx.textAlign = 'right'; ctx.fillText(g + '%', x0 - 8, yy + 4);
    });
    // área
    ctx.beginPath(); ctx.moveTo(X(0), yBot);
    pts.forEach(function (v, i) { ctx.lineTo(X(i), Y(v)); });
    ctx.lineTo(X(nSem - 1), yBot); ctx.closePath();
    ctx.fillStyle = 'rgba(46,111,158,0.12)'; ctx.fill();
    // linha
    ctx.strokeStyle = COR.aco; ctx.lineWidth = 3; ctx.beginPath();
    pts.forEach(function (v, i) { if (i === 0) ctx.moveTo(X(i), Y(v)); else ctx.lineTo(X(i), Y(v)); });
    ctx.stroke();
    // pontos + rótulos X
    var step = Math.max(1, Math.ceil(nSem / 12));
    ctx.textAlign = 'center';
    pts.forEach(function (v, i) {
      ctx.fillStyle = COR.navy; ctx.beginPath(); ctx.arc(X(i), Y(v), 3.4, 0, 2 * Math.PI); ctx.fill();
      if (i % step === 0 || i === nSem - 1) {
        ctx.fillStyle = COR.muted; ctx.font = '10px Arial, sans-serif';
        ctx.fillText('S' + (i + 1), X(i), yBot + 18);
      }
    });
    if (totalTxt) { ctx.fillStyle = COR.muted; ctx.font = '12px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(totalTxt, x0, H - 12); }
    return o.cv.toDataURL('image/png');
  }

  // --- Composição MO/MAT/EQ: pizza + legenda ---
  // dados = [{rotulo, valor, cor}]
  function _pngPizza(dados, fmtNum) {
    var W = 900, H = 420, o = _canvas(W, H), ctx = o.ctx;
    _titulo(ctx, 'Composição de custo — MO / MAT / EQ', W);
    var tot = dados.reduce(function (s, d) { return s + (d.valor || 0); }, 0) || 1;
    var cx = 250, cy = 250, R = 140, ang = -Math.PI / 2;
    dados.forEach(function (d) {
      var frac = (d.valor || 0) / tot, a1 = ang + frac * 2 * Math.PI;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, ang, a1); ctx.closePath();
      ctx.fillStyle = d.cor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      ang = a1;
    });
    // legenda
    var lx = 480, ly = 150;
    ctx.textAlign = 'left';
    dados.forEach(function (d) {
      var pct = (d.valor || 0) / tot * 100;
      ctx.fillStyle = d.cor; ctx.fillRect(lx, ly - 16, 20, 20);
      ctx.fillStyle = COR.texto; ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(d.rotulo + '  ' + fmtNum(pct, 1) + '%', lx + 30, ly);
      ctx.fillStyle = COR.muted; ctx.font = '14px Arial, sans-serif';
      ctx.fillText(_money(d.valor, fmtNum), lx + 30, ly + 22);
      ly += 64;
    });
    return o.cv.toDataURL('image/png');
  }

  // Monta { abc, curvaS, moMatEq } (dataURLs). SÓ chamar no browser.
  // orc: orçamento; deps: { num, fmtNum, abc?, crono?, cronoAgente? }
  function gerarGraficos(orc, deps) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var num = deps.num, fmtNum = deps.fmtNum;
    var g = {};
    try {
      // ABC
      var abc = deps.abc || (global.Orcamento && Orcamento.curvaABC ? Orcamento.curvaABC(orc) : null);
      if (abc && abc.linhas && abc.linhas.length) g.abc = _pngABC(abc, fmtNum);

      // Curva S — preferir a curva semanal do agente (mesma do _curvaS); fallback: crono mensal
      var pts = null, totalTxt = '';
      if (typeof global.Cronograma !== 'undefined' && Cronograma.estimar) {
        var r = Cronograma.estimar(orc), nSem = r.totalSemanas || 1, dpw = (r.params && r.params.diasUteisSemana) || 5;
        var custoSem = [], totalCusto = 0, w;
        for (w = 0; w < nSem; w++) custoSem[w] = 0;
        (r.etapas || []).forEach(function (e) {
          totalCusto += e.custo;
          var s0 = e.inicio / dpw, s1 = e.fim / dpw, dur = Math.max(0.01, s1 - s0);
          for (var ww = 0; ww < nSem; ww++) { var ov = Math.max(0, Math.min(ww + 1, s1) - Math.max(ww, s0)); if (ov > 0) custoSem[ww] += e.custo * (ov / dur); }
        });
        var acc = 0, totV = totalCusto || 1; pts = [];
        for (w = 0; w < nSem; w++) { acc += custoSem[w]; pts.push(acc / totV * 100); }
        totalTxt = 'Custo distribuído em ' + nSem + ' semanas do cronograma. Total: ' + _money(totalCusto, fmtNum) + '.';
      } else if (deps.crono && deps.crono.acumPct && deps.crono.acumPct.length) {
        pts = deps.crono.acumPct.slice();
        totalTxt = 'Avanço acumulado ao longo de ' + deps.crono.meses + ' meses (preço com BDI).';
      }
      if (pts && pts.length) g.curvaS = _pngCurvaS(pts, totalTxt);

      // MO/MAT/EQ — mesmos totais da pizza do ui.js (soma qtd × custoMO/MAT/EQ)
      var mo = 0, mat = 0, eq = 0;
      (orc.etapas || []).forEach(function (e) {
        (e.itens || []).forEach(function (it) {
          var q = num(it.quantidade);
          mo += num(it.custoMO) * q; mat += num(it.custoMAT) * q; eq += num(it.custoEQ) * q;
        });
      });
      if (mo + mat + eq > 0) {
        g.moMatEq = _pngPizza([
          { rotulo: 'Mão de obra', valor: mo, cor: '#2563eb' },
          { rotulo: 'Material', valor: mat, cor: COR.verde },
          { rotulo: 'Equipamento', valor: eq, cor: COR.amarelo }
        ], fmtNum);
      }
    } catch (e) { if (global.console) console.warn('[excel graficos]', e); }
    return (g.abc || g.curvaS || g.moMatEq) ? g : null;
  }

  // ---------- Construtor PURO do workbook (testável em Node) ----------
  // deps: { num(v), fmtNum(v,casas), empresa }
  function construir(ExcelJS, orc, deps) {
    var num = deps.num, fmtNum = deps.fmtNum, empresa = deps.empresa || "RA Engenharia";
    var bdiPct = num(orc.bdi && orc.bdi.percentual) || 0;
    var etapas = Array.isArray(orc.etapas) ? orc.etapas : [];
    var cronoTotRef = null, resumoChecksRow = 0; // refs p/ os checks de sanidade (FASE 2)

    var wb = new ExcelJS.Workbook();
    wb.creator = "OrçaPRO — RA Engenharia"; wb.created = orc.criadoEm ? new Date(orc.criadoEm) : undefined;
    // FASE 2: recalcular tudo ao abrir — sem isso, LibreOffice (e Excel em
    // alguns fluxos) exibe os valores congelados da emissão após o cliente editar.
    wb.calcProperties = { fullCalcOnLoad: true };
    wb.definedNames.add(BDI_ADDR, BDI_CELL); // p_BDI -> Resumo!$B$6

    // abas na ORDEM de exibição pedida: Resumo, Sintética, Analítica
    var wr  = wb.addWorksheet(SH_RES,  { properties: { tabColor: { argb: verde } } });
    var wsi = wb.addWorksheet(SH_SINT, { properties: { tabColor: { argb: aco } },  views: [{ state: 'frozen', ySplit: 6 }] });
    var wa  = wb.addWorksheet(SH_ANAL, { properties: { tabColor: { argb: navy } }, views: [{ state: 'frozen', ySplit: 6 }] });
    var abc = deps.abc, crono = deps.crono, insMap = deps.insumosMap; // opcionais
    // FASE 2 lote 6: aba Parâmetros (matriz de desembolso) — criada aqui p/ ficar
    // logo após a Analítica na ordem das abas; preenchida mais abaixo.
    var wpar = crono ? wb.addWorksheet('Parâmetros', { properties: { tabColor: { argb: 'FFF59E0B' } }, views: [{ state: 'frozen', ySplit: 5 }] }) : null;
    var wins = insMap ? wb.addWorksheet("Insumos", { properties: { tabColor: { argb: 'FF0EA5E9' } }, views: [{ state: 'frozen', ySplit: 5 }] }) : null;
    var wabc = abc   ? wb.addWorksheet("Curva ABC",  { properties: { tabColor: { argb: 'FFF59E0B' } }, views: [{ state: 'frozen', ySplit: 7 }] }) : null;
    var wcr  = crono ? wb.addWorksheet("Cronograma", { properties: { tabColor: { argb: 'FF8B5CF6' } }, views: [{ state: 'frozen', ySplit: 4 }] }) : null;

    // ===================== ANALÍTICA (preenche 1º p/ saber as linhas) =====================
    wa.columns = [{ width: 6 }, { width: 12 }, { width: 11 }, { width: 50 }, { width: 7 }, { width: 10 }, { width: 14 }, { width: 15 }, { width: 14 }, { width: 16 }];
    wa.mergeCells('A1:J1'); wa.getCell('A1').value = empresa; wa.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
    wa.mergeCells('A2:J2'); wa.getCell('A2').value = 'PLANILHA ORÇAMENTÁRIA ANALÍTICA — ' + (orc.numero || '') + (orc.nome ? ' · ' + orc.nome : ''); wa.getCell('A2').font = { bold: true, size: 11 };
    wa.mergeCells('A3:J3'); wa.getCell('A3').value = 'Cliente: ' + ((orc.cliente && orc.cliente.nome) || '-') + '   |   Obra: ' + ((orc.obra && orc.obra.nome) || '-') + (orc.obra && orc.obra.local ? ' (' + orc.obra.local + ')' : ''); wa.getCell('A3').font = { size: 9, color: { argb: muted } };
    wa.mergeCells('A4:J4'); wa.getCell('A4').value = Orcamento.basesUsadasTexto(orc) + '   |   BDI ' + fmtNum(bdiPct, 2) + '%   |   ' + (orc.desonerado ? 'Desonerado' : 'Não desonerado'); wa.getCell('A4').font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } };

    var hr = 6, colsA = ['Item', 'Código', 'Fonte', 'Descrição', 'Und', 'Qtd', 'Custo Unit', 'Custo Total', 'Preço Unit c/BDI', 'Preço Total c/BDI'];
    colsA.forEach(function (h, i) { hStyle(wa.getRow(hr).getCell(i + 1)); wa.getRow(hr).getCell(i + 1).value = h; });
    // FASE 2: coluna K oculta com a etapa de cada linha de item — âncora dos
    // SUMIFS da Sintética (fim das referências fixas tipo 'Analítica'!H16).
    wa.getRow(hr).getCell(11).value = 'Etapa';
    wa.getColumn(11).width = 14; wa.getColumn(11).hidden = true;

    var r = hr + 1, n = 0, subCustoCells = [], etInfo = [], grandCusto = 0, grandMO = 0, grandMAT = 0, grandEQ = 0;
    var itensFlat = []; // FASE 4 (AI-ready): 1 registro por item p/ a Table tblItens da aba "Dados IA"
    etapas.forEach(function (et) {
      var etKey = et.codigo || et.nome || 'Etapa';
      wa.mergeCells('A' + r + ':J' + r);
      var bc = wa.getCell('A' + r); bc.value = (et.codigo ? et.codigo + '  ' : '') + (et.nome || 'Etapa'); bc.font = { bold: true, color: { argb: branco } }; bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: aco } }; bc.border = thin();
      r++;
      var first = r, etCusto = 0, etVenda = 0;
      (Array.isArray(et.itens) ? et.itens : []).forEach(function (it) {
        n++; var row = wa.getRow(r);
        var qt = num(it.quantidade), cu = num(it.custoUnitario);
        var ct = qt * cu, pu = cu * (1 + bdiPct / 100), pt = qt * pu;
        etCusto += ct; etVenda += pt;
        // quebra MO/MAT/EQ do item (razão da composição analítica × custo real; próprio → material)
        var ana = insMap && insMap[String(it.codigo)];
        if (ana && ana.custoUnitario > 0) {
          grandMO += ct * ((ana.custoMO || 0) / ana.custoUnitario);
          grandMAT += ct * ((ana.custoMAT || 0) / ana.custoUnitario);
          grandEQ += ct * ((ana.custoEQ || 0) / ana.custoUnitario);
        } else { grandMAT += ct; }
        row.getCell(1).value = n;
        row.getCell(2).value = it.codigo || '';
        // FASE 2: fonte honesta no xlsx — SEINFRA/SETOP/etc. não são "Própria"
        var fonteIt = it.baseFonte || it.origem || '';
        row.getCell(3).value = (!fonteIt || fonteIt === 'PROPRIO') ? 'Própria' : (fonteIt === 'OUTRA' ? 'Outra' : fonteIt);
        row.getCell(4).value = it.descricao || '';
        row.getCell(5).value = it.unidade || 'un';
        row.getCell(6).value = qt;
        row.getCell(7).value = cu;
        row.getCell(8).value  = { formula: 'F' + r + '*G' + r, result: ct };
        row.getCell(9).value  = { formula: 'G' + r + '*(1+' + BDI_CELL + '/100)', result: pu };
        row.getCell(10).value = { formula: 'F' + r + '*I' + r, result: pt };
        row.getCell(11).value = etKey; // âncora SUMIFS (coluna oculta; vazia em banner/subtotal)
        itensFlat.push({ r: r, etapa: etKey, n: n, qt: qt, cu: cu, ct: ct, pu: pu, pt: pt, it: it });
        row.getCell(6).numFmt = NUM;
        [7, 8, 9, 10].forEach(function (k) { row.getCell(k).numFmt = MOEDA; });
        row.getCell(3).alignment = { horizontal: 'center' };
        for (var k = 1; k <= 10; k++) { row.getCell(k).border = thin(); if (n % 2 === 0) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
        // FASE 2: Qtd e Custo Unit editáveis (amarelo claro) — o resto é fórmula travada
        [6, 7].forEach(function (k2) {
          row.getCell(k2).protection = { locked: false };
          row.getCell(k2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E0' } };
        });
        r++;
      });
      var last = r - 1, sr = wa.getRow(r);
      sr.getCell(4).value = 'Subtotal — ' + (et.nome || 'Etapa'); sr.getCell(4).font = { bold: true };
      if (last >= first) {
        sr.getCell(8).value = { formula: 'SUM(H' + first + ':H' + last + ')', result: etCusto };
        sr.getCell(10).value = { formula: 'SUM(J' + first + ':J' + last + ')', result: etVenda };
      } else { sr.getCell(8).value = 0; sr.getCell(10).value = 0; }
      [8, 10].forEach(function (k) { sr.getCell(k).numFmt = MOEDA; sr.getCell(k).font = { bold: true }; sr.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinzaSub } }; });
      subCustoCells.push('H' + r);
      etInfo.push({ nome: et.nome || 'Etapa', codigo: et.codigo || '', key: etKey, subRow: r, custo: etCusto, venda: etVenda });
      grandCusto += etCusto;
      r++;
    });
    r++;
    var gCustoRow = r;
    wa.getCell('D' + r).value = 'CUSTO DIRETO (sem BDI)'; wa.getCell('D' + r).font = { bold: true };
    wa.getCell('H' + r).value = { formula: subCustoCells.join('+') || '0', result: grandCusto }; wa.getCell('H' + r).numFmt = MOEDA; wa.getCell('H' + r).font = { bold: true };
    r++; var gBdiRow = r;
    wa.getCell('D' + r).value = 'BDI (' + fmtNum(bdiPct, 2) + '%)'; wa.getCell('D' + r).font = { bold: true };
    wa.getCell('H' + r).value = { formula: 'H' + gCustoRow + '*' + BDI_CELL + '/100', result: grandCusto * bdiPct / 100 }; wa.getCell('H' + r).numFmt = MOEDA;
    r++; var gVendaRow = r;
    wa.getCell('D' + r).value = 'PREÇO DE VENDA (com BDI)'; wa.getCell('D' + r).font = { bold: true, size: 12, color: { argb: branco } }; wa.getCell('D' + r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
    wa.getCell('H' + r).value = { formula: 'H' + gCustoRow + '+H' + gBdiRow, result: grandCusto * (1 + bdiPct / 100) }; wa.getCell('H' + r).numFmt = MOEDA; wa.getCell('H' + r).font = { bold: true, size: 12, color: { argb: branco } }; wa.getCell('H' + r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };

    // ===================== SINTÉTICA =====================
    wsi.columns = [{ width: 10 }, { width: 46 }, { width: 16 }, { width: 9 }, { width: 15 }, { width: 17 }, { width: 10 }];
    wsi.mergeCells('A1:G1'); wsi.getCell('A1').value = empresa; wsi.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
    wsi.mergeCells('A2:G2'); wsi.getCell('A2').value = 'PLANILHA SINTÉTICA (por etapa) — ' + (orc.numero || ''); wsi.getCell('A2').font = { bold: true, size: 11 };
    wsi.mergeCells('A3:G3'); wsi.getCell('A3').value = 'Cliente: ' + ((orc.cliente && orc.cliente.nome) || '-') + '   |   ' + ((orc.obra && orc.obra.nome) || '-'); wsi.getCell('A3').font = { size: 9, color: { argb: muted } };
    var colsS = ['Item', 'Etapa', 'Custo Direto', 'BDI %', 'BDI (R$)', 'Preço de Venda', 'Peso %'];
    colsS.forEach(function (h, i) { hStyle(wsi.getRow(6).getCell(i + 1)); wsi.getRow(6).getCell(i + 1).value = h; });
    var s0 = 7, sr = s0, totVenda = grandCusto * (1 + bdiPct / 100);
    etInfo.forEach(function (et, i) {
      var row = wsi.getRow(sr);
      row.getCell(1).value = et.codigo || ((i + 1) + '.0');
      row.getCell(2).value = et.nome;
      // FASE 2: SUMIFS pela coluna-âncora K (linhas de item têm a etapa; subtotais
      // ficam vazios) — robusto a inserção/remoção de linhas, faixa com folga fixa.
      var kSeg = "'" + SH_ANAL + "'!$K$7:$K$1006", hSeg = "'" + SH_ANAL + "'!$H$7:$H$1006";
      row.getCell(3).value = { formula: 'SUMIFS(' + hSeg + ',' + kSeg + ',"' + String(et.key).replace(/"/g, '""') + '")', result: et.custo };
      row.getCell(4).value = { formula: BDI_CELL, result: bdiPct };
      row.getCell(5).value = { formula: 'C' + sr + '*' + BDI_CELL + '/100', result: et.custo * bdiPct / 100 };
      row.getCell(6).value = { formula: 'C' + sr + '+E' + sr, result: et.venda };
      row.getCell(3).numFmt = MOEDA; row.getCell(4).numFmt = PCT; row.getCell(5).numFmt = MOEDA; row.getCell(6).numFmt = MOEDA;
      for (var k = 1; k <= 7; k++) { row.getCell(k).border = thin(); if (i % 2 === 1) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
      sr++;
    });
    var sintTot = sr, tr = wsi.getRow(sr);
    tr.getCell(2).value = 'TOTAL';
    tr.getCell(3).value = { formula: 'SUM(C' + s0 + ':C' + (sr - 1) + ')', result: grandCusto };
    tr.getCell(5).value = { formula: 'SUM(E' + s0 + ':E' + (sr - 1) + ')', result: grandCusto * bdiPct / 100 };
    tr.getCell(6).value = { formula: 'SUM(F' + s0 + ':F' + (sr - 1) + ')', result: totVenda };
    [2, 3, 5, 6].forEach(function (k) { tr.getCell(k).font = { bold: true, color: { argb: branco } }; tr.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; });
    [3, 5, 6].forEach(function (k) { tr.getCell(k).numFmt = MOEDA; });
    // peso % (precisa do total) — FASE 2: percentual REAL (fração + formato 0.0%),
    // não mais número ×100 com sufixo de texto
    for (var i = 0; i < etInfo.length; i++) {
      var rr = s0 + i, cell = wsi.getCell('G' + rr);
      cell.value = { formula: 'F' + rr + '/$F$' + sintTot, result: totVenda ? (etInfo[i].venda / totVenda) : 0 };
      cell.numFmt = '0.0%';
    }

    // ===================== RESUMO (B6 = BDI parâmetro) =====================
    wr.columns = [{ width: 26 }, { width: 34 }];
    wr.mergeCells('A1:B1'); wr.getCell('A1').value = empresa; wr.getCell('A1').font = { bold: true, size: 16, color: { argb: navy } };
    wr.mergeCells('A2:B2'); wr.getCell('A2').value = 'RESUMO DO ORÇAMENTO — ' + (orc.numero || ''); wr.getCell('A2').font = { bold: true, size: 11, color: { argb: muted } };
    function lin(rw, lab, val, fmt, opt) {
      opt = opt || {};
      var a = wr.getCell('A' + rw), b = wr.getCell('B' + rw);
      a.value = lab; a.font = { bold: true, color: { argb: opt.head ? branco : navy } };
      b.value = val; if (fmt) b.numFmt = fmt;
      b.font = { bold: !!opt.bold || !!opt.head, size: opt.size || 11, color: { argb: opt.head ? branco : 'FF1E293B' } };
      if (opt.head) { a.fill = b.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }; }
      a.border = b.border = thin();
    }
    lin(4, 'Cliente', (orc.cliente && orc.cliente.nome) || '-');
    lin(5, 'Obra / Local', ((orc.obra && orc.obra.nome) || '-') + (orc.obra && orc.obra.local ? ' — ' + orc.obra.local : ''));
    lin(6, 'BDI (%)  ⟵ edite aqui', bdiPct, '0.00');
    wr.getCell('B6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: amarelo } }; wr.getCell('B6').font = { bold: true };
    wr.getCell('B6').protection = { locked: false }; // FASE 2: input liberado sob proteção
    lin(7, 'Bases de preços', Orcamento.basesUsadasTexto(orc));
    lin(8, 'Nº de etapas / itens', etapas.length + ' / ' + n);
    lin(10, 'Custo Direto (sem BDI)', { formula: ref(SH_SINT, 'C' + sintTot), result: grandCusto }, MOEDA, { bold: true });
    lin(11, 'BDI (R$)', { formula: 'B10*$B$6/100', result: grandCusto * bdiPct / 100 }, MOEDA, { bold: true });
    lin(12, 'PREÇO DE VENDA', { formula: 'B10+B11', result: totVenda }, MOEDA, { head: true, bold: true, size: 13 });
    wr.getCell('A14').value = 'Dica: as células AMARELAS são editáveis (BDI aqui, Qtd/Custo na Analítica) — tudo recalcula sozinho. A planilha é protegida só contra edição acidental (senha: raeng).';
    wr.mergeCells('A14:B15'); wr.getCell('A14').font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } }; wr.getCell('A14').alignment = { wrapText: true, vertical: 'top' };

    // Composição de custo MO/MAT/EQ (derivada da base analítica)
    if (insMap) {
      var gCat = (grandMO + grandMAT + grandEQ) || 1;
      wr.mergeCells('A17:B17'); wr.getCell('A17').value = 'COMPOSIÇÃO DE CUSTO (MO / MAT / EQ)'; wr.getCell('A17').font = { bold: true, color: { argb: navy } };
      lin(18, 'Mão de obra — ' + fmtNum(grandMO / gCat * 100, 1) + '%', grandMO, MOEDA);
      lin(19, 'Material — ' + fmtNum(grandMAT / gCat * 100, 1) + '%', grandMAT, MOEDA);
      lin(20, 'Equipamento — ' + fmtNum(grandEQ / gCat * 100, 1) + '%', grandEQ, MOEDA);
      wr.getCell('A21').value = 'Itens sem código SINAPI entram como material.'; wr.mergeCells('A21:B21'); wr.getCell('A21').font = { italic: true, size: 8, color: { argb: '#94A3B8'.replace('#', 'FF') } };
    }

    // ===================== QUADRO BDI — Acórdão TCU 2.622/2013 (FASE 2) =====================
    // Usa os parâmetros REAIS do orçamento (orc.bdi.params). Sem parcelas
    // detalhadas -> [PREENCHER]; NUNCA decompor um % seco em números fictícios.
    var bp = (orc.bdi && orc.bdi.params) || {};
    var parcelas = [
      ['AC — Administração Central', bp.AC], ['S — Seguros', bp.S], ['R — Riscos', bp.R],
      ['G — Garantias', bp.G], ['DF — Despesas Financeiras', bp.DF], ['L — Lucro', bp.L],
      ['I — Impostos (PIS/COFINS/ISS/CPRB)', bp.I]
    ];
    var temParcelas = parcelas.some(function (pp) { return num(pp[1]) > 0; });
    var rb = insMap ? 23 : 17;
    wr.mergeCells('A' + rb + ':B' + rb);
    wr.getCell('A' + rb).value = 'COMPOSIÇÃO DO BDI — Acórdão TCU 2.622/2013';
    wr.getCell('A' + rb).font = { bold: true, color: { argb: navy } };
    var r0 = rb + 1;
    parcelas.forEach(function (pp, i) {
      lin(r0 + i, pp[0], temParcelas ? num(pp[1]) / 100 : '[PREENCHER]', temParcelas ? '0.00%' : null);
      if (temParcelas) { // parcela editável: o check TCU abaixo recalcula ao vivo
        var cc = wr.getCell('B' + (r0 + i));
        cc.protection = { locked: false };
        cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E0' } };
      }
    });
    var rF = r0 + parcelas.length;
    if (temParcelas) {
      var cAC = 'B' + r0, cS = 'B' + (r0 + 1), cR = 'B' + (r0 + 2), cG = 'B' + (r0 + 3),
          cDF = 'B' + (r0 + 4), cL = 'B' + (r0 + 5), cI = 'B' + (r0 + 6);
      var fTcu = '(1+' + cAC + '+' + cS + '+' + cR + '+' + cG + ')*(1+' + cDF + ')*(1+' + cL + ')/(1-' + cI + ')-1';
      var vTcu = (1 + (num(bp.AC) + num(bp.S) + num(bp.R) + num(bp.G)) / 100) * (1 + num(bp.DF) / 100) * (1 + num(bp.L) / 100) / (1 - num(bp.I) / 100) - 1;
      lin(rF, 'BDI pela fórmula TCU', { formula: fTcu, result: vTcu }, '0.00%', { bold: true });
      lin(rF + 1, 'BDI aplicado (B6)', { formula: '$B$6/100', result: bdiPct / 100 }, '0.00%', { bold: true });
      if (Math.abs(vTcu * 100 - bdiPct) > 0.05) {
        wr.mergeCells('A' + (rF + 2) + ':B' + (rF + 2));
        wr.getCell('A' + (rF + 2)).value = '⚠ BDI aplicado difere da fórmula TCU com estas parcelas — revise antes de licitar.';
        wr.getCell('A' + (rF + 2)).font = { italic: true, size: 8, color: { argb: 'FFDC2626' } };
      }
    } else {
      wr.mergeCells('A' + rF + ':B' + rF);
      wr.getCell('A' + rF).value = 'Modelo de BDI sem parcelas detalhadas — preencha conforme o Acórdão TCU 2.622/2013.';
      wr.getCell('A' + rF).font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
    }
    resumoChecksRow = rF + (temParcelas ? 4 : 2); // 1ª linha livre p/ o bloco de verificações

    // ===================== CURVA ABC =====================
    if (wabc) {
      var corCl = { A: 'FF16A34A', B: 'FFF59E0B', C: 'FF94A3B8' };
      wabc.columns = [{ width: 8 }, { width: 12 }, { width: 48 }, { width: 7 }, { width: 10 }, { width: 15 }, { width: 9 }, { width: 10 }];
      wabc.mergeCells('A1:H1'); wabc.getCell('A1').value = empresa; wabc.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wabc.mergeCells('A2:H2'); wabc.getCell('A2').value = 'CURVA ABC — ' + (orc.numero || ''); wabc.getCell('A2').font = { bold: true, size: 11 };
      ['Classe', 'Itens', 'Valor', '% do total'].forEach(function (h, i) { var c = wabc.getRow(4).getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: muted } }; });
      // resumo por classe via COUNTIF/SUMIFS sobre a lista (recalcula junto)
      var abcN = (abc.linhas || []).length, abcIni = 9, abcFim = 8 + abcN;
      var rngCl = '$A$' + abcIni + ':$A$' + abcFim, rngVal = '$F$' + abcIni + ':$F$' + abcFim;
      ['A', 'B', 'C'].forEach(function (cl, i) {
        var rr = 5 + i, rs = (abc.resumo && abc.resumo[cl]) || { qtd: 0, valor: 0, pct: 0 };
        wabc.getCell('A' + rr).value = 'Classe ' + cl; wabc.getCell('A' + rr).font = { bold: true, color: { argb: corCl[cl] } };
        wabc.getCell('B' + rr).value = { formula: 'COUNTIF(' + rngCl + ',"' + cl + '")', result: rs.qtd };
        wabc.getCell('C' + rr).value = { formula: 'SUMIFS(' + rngVal + ',' + rngCl + ',"' + cl + '")', result: num(rs.valor) }; wabc.getCell('C' + rr).numFmt = MOEDA;
        wabc.getCell('D' + rr).value = { formula: 'C' + rr + '/SUM(' + rngVal + ')', result: num(rs.pct) / 100 }; wabc.getCell('D' + rr).numFmt = '0.0%';
      });
      var hh = 8, colsABC = ['Classe', 'Código', 'Descrição', 'Und', 'Qtd', 'Custo Total', '%', '% Acum.'];
      colsABC.forEach(function (h, i) { hStyle(wabc.getRow(hh).getCell(i + 1)); wabc.getRow(hh).getCell(i + 1).value = h; });
      // FASE 2: ABC recalculável — custo puxado da Analítica (SUMIFS por código
      // quando o código é único), % / % acum. / classe por fórmula. A ORDEM das
      // linhas é a da emissão; valores e classes recalculam ao editar a Analítica.
      var abcLinhas = abc.linhas || [], abcLast = hh + abcLinhas.length;
      var contaCod = {};
      abcLinhas.forEach(function (l) { var cd = String(l.codigo || ''); contaCod[cd] = (contaCod[cd] || 0) + 1; });
      var somaAbc = 'SUM($F$' + (hh + 1) + ':$F$' + abcLast + ')';
      var ar = hh + 1;
      abcLinhas.forEach(function (l, idx) {
        var row = wabc.getRow(ar);
        var cd = String(l.codigo || ''), vivo = cd && cd !== '—' && cd !== '-' && contaCod[cd] === 1;
        var fAcum = (ar === hh + 1) ? 'G' + ar : 'H' + (ar - 1) + '+G' + ar;
        row.getCell(1).value = { formula: 'IF(H' + ar + '<=0.8,"A",IF(H' + ar + '<=0.95,"B","C"))', result: l.classe };
        row.getCell(1).alignment = { horizontal: 'center' }; row.getCell(1).font = { bold: true, color: { argb: corCl[l.classe] || navy } };
        row.getCell(2).value = l.codigo || ''; row.getCell(3).value = l.descricao || ''; row.getCell(4).value = l.unidade || '';
        row.getCell(5).value = num(l.quantidade); row.getCell(5).numFmt = NUM;
        row.getCell(6).value = vivo
          ? { formula: "SUMIFS('" + SH_ANAL + "'!$H$7:$H$1006,'" + SH_ANAL + "'!$B$7:$B$1006,B" + ar + ')', result: num(l.custoTotal) }
          : num(l.custoTotal);
        row.getCell(6).numFmt = MOEDA;
        row.getCell(7).value = { formula: 'F' + ar + '/' + somaAbc, result: num(l.pct) / 100 }; row.getCell(7).numFmt = '0.0%';
        row.getCell(8).value = { formula: fAcum, result: num(l.acumPct) / 100 }; row.getCell(8).numFmt = '0.0%';
        for (var k = 1; k <= 8; k++) { row.getCell(k).border = thin(); if (idx % 2 === 1) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
        ar++;
      });
      var abcNota = wabc.getCell('A' + (abcLast + 2));
      abcNota.value = 'Ordem das linhas = emissão. Valores, %, classes e o resumo acima recalculam ao editar Qtd/Custo na Analítica.';
      wabc.mergeCells('A' + (abcLast + 2) + ':H' + (abcLast + 2));
      abcNota.font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
    }

    // ===================== PARÂMETROS: matriz de desembolso etapa×mês =====================
    // % editáveis (amarelas) que DIRIGEM o Cronograma por fórmula. Cada linha
    // precisa somar 100% — a coluna Check acusa ao vivo.
    if (wpar) {
      var Mp = crono.meses || 0, etsP = crono.etapas || [];
      var wcolsP = [{ width: 34 }];
      for (var mp = 0; mp < Mp; mp++) wcolsP.push({ width: 9 });
      wcolsP.push({ width: 10 }, { width: 12 });
      wpar.columns = wcolsP;
      wpar.mergeCells(1, 1, 1, Mp + 3); wpar.getCell('A1').value = empresa; wpar.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wpar.mergeCells(2, 1, 2, Mp + 3); wpar.getCell('A2').value = 'PARÂMETROS — MATRIZ DE DESEMBOLSO (' + Mp + ' meses) — ' + (orc.numero || ''); wpar.getCell('A2').font = { bold: true, size: 11 };
      wpar.mergeCells(3, 1, 3, Mp + 3); wpar.getCell('A3').value = 'Edite os % (células amarelas): o Cronograma e a Curva S recalculam sozinhos. Cada linha deve somar 100% — a coluna Check avisa.'; wpar.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } };
      var hp = ['Etapa']; for (var mp2 = 0; mp2 < Mp; mp2++) hp.push('Mês ' + (mp2 + 1)); hp.push('Soma', 'Check');
      hp.forEach(function (h, i) { hStyle(wpar.getRow(5).getCell(i + 1)); wpar.getRow(5).getCell(i + 1).value = h; });
      etsP.forEach(function (et, i) {
        var pr = 6 + i, rowP = wpar.getRow(pr), tot = num(et.total);
        rowP.getCell(1).value = (et.codigo ? et.codigo + ' ' : '') + (et.nome || 'Etapa'); rowP.getCell(1).border = thin();
        var somaFrac = 0;
        for (var m3 = 0; m3 < Mp; m3++) {
          var frac = tot > 0 ? num(et.meses[m3]) / tot : 0;
          somaFrac += frac;
          var cP = rowP.getCell(2 + m3);
          cP.value = frac; cP.numFmt = '0.0%'; cP.border = thin();
          cP.protection = { locked: false };
          cP.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E0' } };
        }
        var colSoma = wpar.getColumn(Mp + 2).letter, colFirstP = wpar.getColumn(2).letter, colLastP = wpar.getColumn(Mp + 1).letter;
        rowP.getCell(Mp + 2).value = { formula: 'SUM(' + colFirstP + pr + ':' + colLastP + pr + ')', result: somaFrac };
        rowP.getCell(Mp + 2).numFmt = '0.0%'; rowP.getCell(Mp + 2).font = { bold: true }; rowP.getCell(Mp + 2).border = thin();
        var okSoma = Math.abs(somaFrac - 1) <= 0.001;
        rowP.getCell(Mp + 3).value = { formula: 'IF(ABS(' + colSoma + pr + '-1)>0.001,"⚠ ≠100%","OK")', result: okSoma ? 'OK' : '⚠ ≠100%' };
        rowP.getCell(Mp + 3).font = { bold: true, color: { argb: okSoma ? verde : 'FFDC2626' } }; rowP.getCell(Mp + 3).border = thin();
      });
    }

    // ===================== CRONOGRAMA FÍSICO-FINANCEIRO =====================
    if (wcr) {
      var M = crono.meses || 0, totalIdx = M + 2;
      var ws2 = [{ width: 34 }]; for (var m = 0; m < M; m++) ws2.push({ width: 13 }); ws2.push({ width: 15 });
      wcr.columns = ws2;
      var colFirst = wcr.getColumn(2).letter, colLast = wcr.getColumn(M + 1).letter;
      wcr.mergeCells(1, 1, 1, totalIdx); wcr.getCell('A1').value = empresa; wcr.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wcr.mergeCells(2, 1, 2, totalIdx); wcr.getCell('A2').value = 'CRONOGRAMA FÍSICO-FINANCEIRO (' + M + ' meses, com BDI) — ' + (orc.numero || ''); wcr.getCell('A2').font = { bold: true, size: 11 };
      var ch = 4, chdr = ['Etapa']; for (var m = 0; m < M; m++) chdr.push('Mês ' + (m + 1)); chdr.push('Total');
      chdr.forEach(function (h, i) { hStyle(wcr.getRow(ch).getCell(i + 1)); wcr.getRow(ch).getCell(i + 1).value = h; });
      var cr = ch + 1, firstData = cr;
      // FASE 2 lote 6: mês = preço da etapa (Sintética) × % da matriz de Parâmetros.
      // Só liga a fórmula se as etapas do crono alinham 1:1 com a Sintética.
      var etsOk = wpar && (crono.etapas || []).length === etInfo.length &&
        (crono.etapas || []).every(function (e, i) { return String(e.codigo || '') === String(etInfo[i].codigo || ''); });
      (crono.etapas || []).forEach(function (et, idx) {
        var row = wcr.getRow(cr);
        row.getCell(1).value = (et.codigo ? et.codigo + ' ' : '') + (et.nome || 'Etapa');
        for (var m = 0; m < M; m++) {
          var c = row.getCell(2 + m);
          c.value = etsOk
            ? { formula: "'" + SH_SINT + "'!$F$" + (s0 + idx) + "*'Parâmetros'!" + wpar.getColumn(2 + m).letter + (6 + idx), result: num(et.meses[m]) }
            : num(et.meses[m]);
          c.numFmt = MOEDA; c.border = thin();
        }
        row.getCell(totalIdx).value = { formula: 'SUM(' + colFirst + cr + ':' + colLast + cr + ')', result: num(et.total) };
        row.getCell(totalIdx).numFmt = MOEDA; row.getCell(totalIdx).font = { bold: true };
        row.getCell(1).border = thin(); row.getCell(totalIdx).border = thin();
        if (idx % 2 === 1) for (var k = 1; k <= totalIdx; k++) if (!row.getCell(k).fill) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } };
        cr++;
      });
      var lastData = cr - 1, tot = wcr.getRow(cr);
      tot.getCell(1).value = 'TOTAL / MÊS'; tot.getCell(1).font = { bold: true, color: { argb: branco } }; tot.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      for (var m = 0; m < M; m++) {
        var L = wcr.getColumn(2 + m).letter, c = tot.getCell(2 + m);
        c.value = { formula: 'SUM(' + L + firstData + ':' + L + lastData + ')', result: num(crono.totaisMes[m]) };
        c.numFmt = MOEDA; c.font = { bold: true, color: { argb: branco } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      }
      tot.getCell(totalIdx).value = { formula: 'SUM(' + colFirst + cr + ':' + colLast + cr + ')', result: num(crono.total) };
      tot.getCell(totalIdx).numFmt = MOEDA; tot.getCell(totalIdx).font = { bold: true, color: { argb: branco } }; tot.getCell(totalIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
      var totColL = wcr.getColumn(totalIdx).letter;
      cronoTotRef = "'Cronograma'!$" + totColL + '$' + cr; // p/ check de sanidade no Resumo
      // FASE 2: % acumulado por FÓRMULA (curva S viva) — Σ dos meses até m / total
      var acc = wcr.getRow(cr + 1);
      acc.getCell(1).value = '% acumulado'; acc.getCell(1).font = { bold: true, color: { argb: muted } };
      for (var m = 0; m < M; m++) {
        var L2 = wcr.getColumn(2 + m).letter, c2 = acc.getCell(2 + m);
        c2.value = { formula: 'SUM($' + colFirst + '$' + cr + ':' + L2 + cr + ')/$' + totColL + '$' + cr, result: num(crono.acumPct[m]) / 100 };
        c2.numFmt = '0.0%'; c2.font = { color: { argb: muted } };
      }
    }

    // ===================== INSUMOS (composições explodidas) =====================
    if (wins) {
      var catNome = { MO: 'Mão de obra', MAT: 'Material', EQ: 'Equipamento' };
      wins.columns = [{ width: 10 }, { width: 11 }, { width: 11 }, { width: 46 }, { width: 6 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }];
      wins.mergeCells('A1:I1'); wins.getCell('A1').value = empresa; wins.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wins.mergeCells('A2:I2'); wins.getCell('A2').value = 'DETALHAMENTO DE COMPOSIÇÕES (INSUMOS) — ' + (orc.numero || ''); wins.getCell('A2').font = { bold: true, size: 11 };
      wins.mergeCells('A3:I3'); wins.getCell('A3').value = 'Cada composição SINAPI explodida nos seus insumos (referência analítica ' + (deps.analiticoComp || '') + '). MO = mão de obra · MAT = material · EQ = equipamento.'; wins.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF94A3B8' } };
      var hi = ['Composição', 'Cód. Item', 'Tipo', 'Insumo', 'Und', 'Coef.', 'Custo Unit', 'Custo Total', 'Categoria'];
      hi.forEach(function (h, i) { hStyle(wins.getRow(5).getCell(i + 1)); wins.getRow(5).getCell(i + 1).value = h; });
      var ir = 6, vistos = {};
      (etapas).forEach(function (et) {
        (Array.isArray(et.itens) ? et.itens : []).forEach(function (it) {
          if (it.origem !== 'SINAPI') return;
          var a = insMap[String(it.codigo)];
          if (!a || vistos[it.codigo]) return;
          vistos[it.codigo] = 1;
          wins.mergeCells('A' + ir + ':I' + ir);
          var bc = wins.getCell('A' + ir); bc.value = it.codigo + '  ' + (a.descricao || it.descricao || ''); bc.font = { bold: true, color: { argb: branco } }; bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: aco } }; bc.border = thin();
          ir++;
          var insFirst = ir, somaComp = 0;
          (Array.isArray(a.insumos) ? a.insumos : []).forEach(function (ins, idx) {
            var row = wins.getRow(ir);
            row.getCell(1).value = it.codigo;
            row.getCell(2).value = ins.codigo;
            row.getCell(3).value = (ins.tipo === 'COMPOSICAO') ? 'Sub-comp.' : 'Insumo';
            row.getCell(4).value = ins.descricao;
            row.getCell(5).value = ins.unidade;
            row.getCell(6).value = num(ins.coeficiente); row.getCell(6).numFmt = '#,##0.0000';
            row.getCell(7).value = num(ins.custoUnitario); row.getCell(7).numFmt = MOEDA;
            // FASE 2: custo total do insumo por fórmula (coef × custo unit)
            row.getCell(8).value = { formula: 'F' + ir + '*G' + ir, result: num(ins.custoTotal) }; row.getCell(8).numFmt = MOEDA;
            somaComp += num(ins.custoTotal);
            row.getCell(9).value = catNome[ins.categoria] || ins.categoria;
            for (var k = 1; k <= 9; k++) { row.getCell(k).border = thin(); if (idx % 2 === 1) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
            ir++;
          });
          var sr = wins.getRow(ir);
          sr.getCell(4).value = 'Σ  MO ' + fmtNum(a.custoMO, 2) + '  |  MAT ' + fmtNum(a.custoMAT, 2) + '  |  EQ ' + fmtNum(a.custoEQ, 2);
          sr.getCell(4).font = { bold: true, italic: true, color: { argb: muted } };
          sr.getCell(8).value = (ir > insFirst)
            ? { formula: 'SUM(H' + insFirst + ':H' + (ir - 1) + ')', result: somaComp }
            : num(a.custoUnitario);
          sr.getCell(8).numFmt = MOEDA; sr.getCell(8).font = { bold: true }; sr.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinzaSub } };
          ir++;
        });
      });
    }

    // ===================== GANTT (agente de cronograma) =====================
    var cronoAg = deps.cronoAgente;
    if (cronoAg && cronoAg.etapas && cronoAg.etapas.length) {
      var fmtData = function (d) { return (d && d.toLocaleDateString) ? d.toLocaleDateString('pt-BR') : ''; };
      var nSem = cronoAg.totalSemanas || 1, dpw = (cronoAg.params && cronoAg.params.diasUteisSemana) || 5;
      var wg = wb.addWorksheet("Gantt", { properties: { tabColor: { argb: 'FF0EA5E9' } }, views: [{ state: 'frozen', xSplit: 5, ySplit: 5 }] });
      var gcols = [{ width: 30 }, { width: 18 }, { width: 7 }, { width: 11 }, { width: 11 }];
      for (var gs = 0; gs < nSem; gs++) gcols.push({ width: 3.4 });
      wg.columns = gcols;
      wg.mergeCells(1, 1, 1, 5 + nSem); wg.getCell('A1').value = empresa; wg.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wg.mergeCells(2, 1, 2, 5 + nSem); wg.getCell('A2').value = 'CRONOGRAMA / GANTT — ' + (orc.numero || ''); wg.getCell('A2').font = { bold: true, size: 11 };
      wg.mergeCells(3, 1, 3, 5 + nSem); wg.getCell('A3').value = 'Estimado pelo agente: ' + cronoAg.totalDias + ' dias úteis (~' + nSem + ' semanas) · Início ' + fmtData(cronoAg.dataInicio) + ' → Fim ' + fmtData(cronoAg.dataFim) + '. Edite no app (aba Cronograma).'; wg.getCell('A3').font = { italic: true, size: 9, color: { argb: muted } };
      ['Etapa', 'Categoria', 'Dias', 'Início', 'Fim'].forEach(function (h, i) { hStyle(wg.getRow(5).getCell(i + 1)); wg.getRow(5).getCell(i + 1).value = h; });
      for (var gh = 0; gh < nSem; gh++) { var hc = wg.getRow(5).getCell(6 + gh); hStyle(hc); hc.value = 'S' + (gh + 1); hc.alignment = { horizontal: 'center' }; }
      var grow = 6;
      cronoAg.etapas.forEach(function (e) {
        var row = wg.getRow(grow);
        row.getCell(1).value = (e.codigo ? e.codigo + ' ' : '') + e.nome;
        row.getCell(2).value = e.categoriaNome || e.categoria;
        row.getCell(3).value = e.duracao;
        row.getCell(4).value = fmtData(e.dataInicio);
        row.getCell(5).value = fmtData(e.dataFim);
        var argbCor = 'FF' + String(e.cor || '#0EA5E9').replace('#', '').toUpperCase();
        var s0 = Math.floor(e.inicio / dpw), s1 = Math.max(s0 + 1, Math.ceil(e.fim / dpw));
        for (var k = 1; k <= 5; k++) row.getCell(k).border = thin();
        for (var gw = 0; gw < nSem; gw++) {
          var cc = row.getCell(6 + gw); cc.border = thin();
          if (gw >= s0 && gw < s1) cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbCor } };
        }
        grow++;
      });
    }

    // ===================== GRÁFICOS (imagens PNG geradas no browser) =====================
    // Só embute se deps.graficos existir (browser). Em Node (testes) é undefined → aba não é criada.
    var G = deps.graficos;
    if (G && (G.abc || G.curvaS || G.moMatEq)) {
      var wg2 = wb.addWorksheet("Gráficos", { properties: { tabColor: { argb: 'FFEC4899' } } });
      wg2.columns = [{ width: 3 }, { width: 130 }];
      wg2.mergeCells('A1:B1'); wg2.getCell('A1').value = empresa; wg2.getCell('A1').font = { bold: true, size: 16, color: { argb: navy } };
      wg2.mergeCells('A2:B2'); wg2.getCell('A2').value = 'GRÁFICOS DO ORÇAMENTO — ' + (orc.numero || '') + (orc.nome ? ' · ' + orc.nome : ''); wg2.getCell('A2').font = { bold: true, size: 11, color: { argb: muted } };

      // largura das imagens no canvas (900px). Altura por gráfico difere.
      var IMG_W = 900, linhaTop = 4; // linha (1-based) onde começa a próxima imagem
      function b64(dataUrl) { return String(dataUrl).replace(/^data:image\/png;base64,/, ''); }
      function embutir(titulo, dataUrl, hPx) {
        if (!dataUrl) return;
        var tCell = wg2.getCell('B' + linhaTop);
        tCell.value = titulo; tCell.font = { bold: true, size: 12, color: { argb: navy } };
        linhaTop += 1;
        var imgId = wb.addImage({ base64: b64(dataUrl), extension: 'png' });
        // tl usa índices 0-based (col 1 = coluna B); ~15px por linha p/ reservar espaço vertical.
        wg2.addImage(imgId, { tl: { col: 1, row: linhaTop - 1 }, ext: { width: IMG_W, height: hPx } });
        linhaTop += Math.ceil(hPx / 15) + 2;
      }
      embutir('Curva ABC (Pareto)', G.abc, 460);
      embutir('Curva S — avanço físico-financeiro', G.curvaS, 420);
      embutir('Composição de custo (MO / MAT / EQ)', G.moMatEq, 420);
    }

    // ===================== FASE 3: data-base em todas as abas =====================
    // Exigência formal de licitação: data-base/competência visível em cada quadro.
    var dtEmissao = orc.atualizadoEm ? new Date(orc.atualizadoEm) : new Date();
    var txtBase = 'Bases de preços: ' + Orcamento.basesUsadasTexto(orc) + ' — ' +
      (orc.desonerado ? 'desonerado' : 'não desonerado') + '   ·   Emissão: ' + dtEmissao.toLocaleDateString('pt-BR');
    function linhaBase(ws, rr, lastCol) {
      if (!ws) return;
      var c = ws.getCell('A' + rr);
      if (c.value) return; // linha já ocupada — não sobrescreve
      try { ws.mergeCells('A' + rr + ':' + lastCol + rr); } catch (e) {}
      c.value = txtBase; c.font = { italic: true, size: 8, color: { argb: 'FF94A3B8' } };
    }
    linhaBase(wsi, 4, 'G'); linhaBase(wabc, 3, 'H'); linhaBase(wins, 4, 'I');
    if (wcr) linhaBase(wcr, 3, wcr.getColumn((crono.meses || 0) + 2).letter);

    // ===================== FASE 3: memória de cálculo (Lei 14.133) =====================
    // Só entra se algum item tiver o campo memoriaCalculo preenchido no app.
    var wmem = null, comMem = itensFlat.filter(function (x) { return x.it && x.it.memoriaCalculo; });
    if (comMem.length) {
      wmem = wb.addWorksheet('Memória de Cálculo', { properties: { tabColor: { argb: 'FF8B5CF6' } } });
      wmem.columns = [{ width: 6 }, { width: 12 }, { width: 44 }, { width: 6 }, { width: 10 }, { width: 70 }];
      wmem.mergeCells('A1:F1'); wmem.getCell('A1').value = empresa; wmem.getCell('A1').font = { bold: true, size: 14, color: { argb: navy } };
      wmem.mergeCells('A2:F2'); wmem.getCell('A2').value = 'MEMÓRIA DE CÁLCULO DE QUANTITATIVOS — ' + (orc.numero || ''); wmem.getCell('A2').font = { bold: true, size: 11 };
      linhaBase(wmem, 3, 'F');
      ['Item', 'Código', 'Descrição', 'Und', 'Qtd', 'Memória de cálculo'].forEach(function (h, i) { hStyle(wmem.getRow(5).getCell(i + 1)); wmem.getRow(5).getCell(i + 1).value = h; });
      var mr = 6;
      comMem.forEach(function (x, idx) {
        var row = wmem.getRow(mr);
        row.getCell(1).value = x.n; row.getCell(2).value = x.it.codigo || '';
        row.getCell(3).value = x.it.descricao || ''; row.getCell(4).value = x.it.unidade || 'un';
        row.getCell(5).value = { formula: "'" + SH_ANAL + "'!F" + x.r, result: x.qt }; row.getCell(5).numFmt = NUM;
        row.getCell(6).value = String(x.it.memoriaCalculo);
        row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
        for (var k = 1; k <= 6; k++) { row.getCell(k).border = thin(); if (idx % 2 === 1) row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cinza } }; }
        mr++;
      });
    }

    // ===================== DADOS IA (Excel Table viva p/ Copilot) =====================
    // Tabela plana tblItens: 1 linha por item, TODA por fórmula referenciando a
    // Analítica — editou lá, aqui acompanha. É a superfície que IA/Copilot lê bem
    // (Table nomeada, cabeçalho único, zero merge). Analítica não vira Table
    // porque os banners mesclados de etapa são proibidos dentro de Tables.
    var wdad = null;
    if (itensFlat.length) {
      wdad = wb.addWorksheet('Dados IA', { properties: { tabColor: { argb: 'FF64748B' } } });
      wdad.getCell('A1').value = 'BASE DE DADOS DO ORÇAMENTO (para análise e IA/Copilot) — espelho vivo da aba Analítica';
      wdad.getCell('A1').font = { bold: true, size: 11, color: { argb: navy } };
      var refA = function (col, rr, res) { return { formula: "'" + SH_ANAL + "'!" + col + rr, result: res }; };
      wdad.addTable({
        name: 'tblItens', ref: 'A2', headerRow: true,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: [{ name: 'Etapa' }, { name: 'Item' }, { name: 'Codigo' }, { name: 'Fonte' }, { name: 'Descricao' },
                  { name: 'Und' }, { name: 'Qtd' }, { name: 'CustoUnit' }, { name: 'CustoTotal' },
                  { name: 'PrecoUnitBDI' }, { name: 'PrecoTotalBDI' }],
        rows: itensFlat.map(function (x) {
          return [x.etapa, x.n,
            refA('B', x.r, x.it.codigo || ''), refA('C', x.r, ''), refA('D', x.r, x.it.descricao || ''),
            refA('E', x.r, x.it.unidade || 'un'), refA('F', x.r, x.qt), refA('G', x.r, x.cu),
            refA('H', x.r, x.ct), refA('I', x.r, x.pu), refA('J', x.r, x.pt)];
        })
      });
      wdad.columns = [{ width: 12 }, { width: 6 }, { width: 11 }, { width: 10 }, { width: 50 }, { width: 6 },
                      { width: 10 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 14 }];
      for (var di = 3; di <= 2 + itensFlat.length; di++) {
        wdad.getCell('G' + di).numFmt = NUM;
        ['H', 'I', 'J', 'K'].forEach(function (cl) { wdad.getCell(cl + di).numFmt = MOEDA; });
      }
    }

    // ===================== LEIA-ME =====================
    var wleia = wb.addWorksheet('Leia-me', { properties: { tabColor: { argb: 'FF16A34A' } } });
    wleia.columns = [{ width: 110 }];
    var leiaLinhas = [
      ['ORÇAPRO — COMO USAR ESTA PLANILHA', { bold: true, size: 14, cor: navy }],
      [(orc.numero || '') + (orc.nome ? ' · ' + orc.nome : '') + '   |   ' + Orcamento.basesUsadasTexto(orc) + '   |   ' + (orc.desonerado ? 'Desonerado' : 'Não desonerado'), { size: 9, cor: 'FF64748B' }],
      [''],
      ['✏️  O QUE VOCÊ PODE EDITAR (células AMARELAS):', { bold: true }],
      ['     • Resumo!B6 — o BDI aplicado (%). Tudo recalcula: preços unitários, totais, curva ABC, cronograma.'],
      ['     • Analítica, colunas Qtd e Custo Unit — simule quantidades e preços negociados.'],
      ['     • Resumo, parcelas do quadro BDI — a linha "BDI pela fórmula TCU" confere na hora.'],
      ['     • Parâmetros — matriz de desembolso (% de cada etapa por mês): o Cronograma e a Curva S seguem.'],
      [''],
      ['🔒  PROTEÇÃO: as demais células têm fórmula e estão travadas só contra edição acidental.'],
      ['     Senha para desproteger (Revisão → Desproteger Planilha): raeng'],
      [''],
      ['✅  VERIFICAÇÕES AUTOMÁTICAS: o fim da aba Resumo confere se os totais seguem consistentes'],
      ['     após suas edições ("OK" verde · "⚠ verificar" vermelho).'],
      [''],
      ['📷  A aba Gráficos contém IMAGENS da emissão (não recalculam). Os dados vivos estão nas abas.'],
      [''],
      ['🤖  DICA (Excel 365/Copilot): a aba "Dados IA" tem a tabela tblItens pronta para análise.'],
      ['     Experimente perguntar: "quais os 5 itens de maior impacto no custo?" ou'],
      ['     "faça um gráfico de custo por etapa usando tblItens".'],
      [''],
      ['📞  RA ENGENHARIA ESPECIAL LTDA — CNPJ 59.507.116/0001-64 · Uberlândia/MG'],
      ['     Eng. Civil Rogério Alves de Souza · CREA-MG 323736 · WhatsApp (34) 9286-9383'],
      ['     Gerado pelo OrçaPRO — orçamento de obras com bases oficiais e IA.']
    ];
    leiaLinhas.forEach(function (ln, i) {
      var c = wleia.getCell('A' + (i + 1));
      c.value = ln[0];
      var o = ln[1] || {};
      c.font = { bold: !!o.bold, size: o.size || 10, color: { argb: o.cor || 'FF1E293B' } };
      c.alignment = { wrapText: false, vertical: 'top' };
    });

    // Notas nas células-chave (documentação p/ humano e p/ IA)
    wr.getCell('B6').note = 'BDI em % aplicado sobre o custo direto. Edite aqui: preços unitários, totais, ABC e cronograma recalculam. Named range: p_BDI. Referência: Acórdão TCU 2.622/2013 (quadro abaixo).';
    if (itensFlat.length) {
      wa.getCell('F' + itensFlat[0].r).note = 'Qtd editável (amarelo). Custo Total, Preço c/ BDI, subtotais, Sintética, Resumo, ABC e cronograma recalculam em cadeia.';
    }

    // ===================== _META (round-trip xlsx → app) =====================
    // Aba veryHidden com o JSON do orçamento fatiado (≤30k chars por célula —
    // limite do Excel é 32.767). Habilita a reimportação com diff no app
    // (FASE 4; o import é a etapa seguinte). Invisível p/ usuário e impressão.
    var wmeta = wb.addWorksheet('_meta');
    wmeta.state = 'veryHidden';
    var metaJson = JSON.stringify(orc);
    var FATIA = 30000, metaPartes = Math.max(1, Math.ceil(metaJson.length / FATIA));
    wmeta.getCell('A1').value = JSON.stringify({
      v: 1, tipo: 'orcapro-meta', partes: metaPartes,
      schemaVersao: orc.schemaVersao || null, id: orc.id || '', numero: orc.numero || '',
      geradoEm: dtEmissao.toISOString()
    });
    for (var mi = 0; mi < metaPartes; mi++) {
      wmeta.getCell('A' + (mi + 2)).value = metaJson.slice(mi * FATIA, (mi + 1) * FATIA);
    }

    // ===================== FASE 2: verificações automáticas (Resumo) =====================
    // Sanidade viva: se o usuário editar algo e um total desalinhar, o Resumo
    // acusa na hora — nada de número silenciosamente errado.
    var rc = resumoChecksRow || 23, checks = [];
    if (insMap) {
      var difCat = Math.abs((grandMO + grandMAT + grandEQ) - grandCusto);
      checks.push(['Soma MO+MAT+EQ = Custo Direto', 'IF(ABS((B18+B19+B20)-B10)<=1,"OK","⚠ verificar")', difCat <= 1 ? 'OK' : '⚠ verificar']);
    }
    if (cronoTotRef) {
      checks.push(['Cronograma fecha com o Preço de Venda', 'IF(ABS(' + cronoTotRef + '-B12)<=0.05,"OK","⚠ verificar")',
        Math.abs(num(crono && crono.total) - totVenda) <= 0.05 ? 'OK' : '⚠ verificar']);
    }
    if (wabc) {
      checks.push(['Curva ABC soma = Custo Direto', "IF(ABS(SUM('Curva ABC'!$F$9:$F$" + abcFim + ')-B10)<=0.05,"OK","⚠ verificar")', 'OK']);
    }
    if (checks.length) {
      wr.mergeCells('A' + rc + ':B' + rc);
      wr.getCell('A' + rc).value = 'VERIFICAÇÕES AUTOMÁTICAS';
      wr.getCell('A' + rc).font = { bold: true, color: { argb: navy } };
      checks.forEach(function (ck, i) {
        var rr = rc + 1 + i;
        wr.getCell('A' + rr).value = ck[0]; wr.getCell('A' + rr).font = { size: 9 };
        wr.getCell('B' + rr).value = { formula: ck[1], result: ck[2] };
        wr.getCell('B' + rr).font = { bold: true, color: { argb: ck[2] === 'OK' ? verde : 'FFDC2626' } };
        wr.getCell('A' + rr).border = wr.getCell('B' + rr).border = thin();
      });
    }

    // ===================== FASE 3: responsável técnico + ART (Súmula TCU 260) =====================
    // Sempre presente — sem dado, sai placeholder explícito ([...]), nunca vazio.
    var resp = deps.responsavel || {};
    var ri = rc + checks.length + 2;
    wr.mergeCells('A' + ri + ':B' + ri);
    wr.getCell('A' + ri).value = 'RESPONSÁVEL TÉCNICO PELO ORÇAMENTO';
    wr.getCell('A' + ri).font = { bold: true, color: { argb: navy } };
    lin(ri + 1, 'Nome', resp.responsavel || '[RESPONSÁVEL TÉCNICO]');
    lin(ri + 2, 'Título / Registro', (resp.titulo || 'Engenheiro Civil') + ' · ' + (resp.crea || '[CREA/CAU]'));
    lin(ri + 3, 'ART/RRT', orc.art || '[nº da ART/RRT — informar]');
    lin(ri + 4, 'Empresa', (resp.nome || empresa || '') + (resp.cnpj ? ' · CNPJ ' + resp.cnpj : ''));
    wr.getCell('A' + (ri + 6)).value = '___________________________________';
    wr.getCell('A' + (ri + 7)).value = (resp.responsavel || '[nome]') + ' — ' + (resp.crea || '[CREA/CAU]');
    wr.getCell('A' + (ri + 7)).font = { size: 9, color: { argb: muted } };

    // ===================== FASE 2: impressão + proteção =====================
    // Impressão pronta p/ PDF/licitação: A4, ajusta à largura, cabeçalho repetido
    // e rodapé com nº do orçamento + página.
    function pset(ws, orient, titles) {
      if (!ws) return;
      ws.pageSetup = {
        paperSize: 9, orientation: orient, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.25 },
        printTitlesRow: titles
      };
      ws.headerFooter.oddFooter = '&L&8OrçaPRO — ' + (orc.numero || '') + '&C&8' + (empresa || '') + '&R&8Pág. &P de &N';
    }
    pset(wr, 'portrait'); pset(wsi, 'portrait', '1:6'); pset(wa, 'landscape', '1:6');
    pset(wins, 'landscape', '1:5'); pset(wabc, 'portrait', '1:8'); pset(wcr, 'landscape', '1:4');
    pset(wdad, 'landscape', '2:2'); pset(wleia, 'portrait'); pset(wmem, 'landscape', '1:5'); pset(wpar, 'landscape', '1:5');

    // Proteção anti-edição acidental: só as células amarelas editam (B6, parcelas
    // do BDI, Qtd/Custo da Analítica). Senha documentada no Resumo: 'raeng'.
    // ws.protect é assíncrono no ExcelJS -> construir passa a devolver Promise<wb>.
    // Dados IA fica SEM proteção: Table protegida bloqueia ordenar/filtrar no Excel.
    var protOpts = { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, sort: true };
    return Promise.all([wr, wsi, wa, wins, wabc, wcr, wleia, wmem, wpar].filter(Boolean).map(function (ws) {
      return ws.protect('raeng', protOpts);
    })).then(function () { return wb; });
  }

  // ---------- Camada browser ----------
  var ExcelOrc = {
    construir: construir,

    ensureExcelJS: function (cb) {
      if (global.ExcelJS) { cb(); return; }
      var avisarFalha = function () { if (global.UI) UI.toast("Não foi possível carregar o gerador de Excel (precisa de internet na 1ª vez).", "erro"); };
      if (document.getElementById("exceljs-cdn")) {
        var t = setInterval(function () { if (global.ExcelJS) { clearInterval(t); cb(); } }, 120);
        setTimeout(function () { clearInterval(t); if (!global.ExcelJS) avisarFalha(); }, 15000); return;
      }
      var s = document.createElement("script"); s.id = "exceljs-cdn";
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
      s.onload = function () { cb(); };
      s.onerror = function () { var el = document.getElementById("exceljs-cdn"); if (el) el.remove(); avisarFalha(); }; // remove a tag morta p/ permitir nova tentativa
      document.head.appendChild(s);
    },

    // SheetJS (vendorizado, OFFLINE) — só p/ LER .xls antigo (BIFF), que o ExcelJS não abre.
    // Lazy: injeta o script só quando um .xls é importado (não pesa o load de quem não usa).
    ensureSheetJS: function (cb) {
      if (global.XLSX) { cb(); return; }
      var avisarFalha = function () { if (global.UI) UI.toast("Não foi possível carregar o leitor de .xls.", "erro"); };
      if (document.getElementById("sheetjs-vendor")) {
        var t = setInterval(function () { if (global.XLSX) { clearInterval(t); cb(); } }, 120);
        setTimeout(function () { clearInterval(t); if (!global.XLSX) avisarFalha(); }, 15000); return;
      }
      var s = document.createElement("script"); s.id = "sheetjs-vendor";
      s.src = "js/vendor/xlsx.full.min.js";
      s.onload = function () { cb(); };
      s.onerror = function () { var el = document.getElementById("sheetjs-vendor"); if (el) el.remove(); avisarFalha(); };
      document.head.appendChild(s);
    },

    gerar: function (orc) {
      this.ensureExcelJS(function () {
        var finalizar = function (insumosMap) {
          try {
            var deps = {
              num: Util.num,
              fmtNum: Util.fmtNum,
              empresa: (Auth.usuario && Auth.usuario()) ? Auth.usuario().empresa : (CONFIG.marca.fabricante || "RA Engenharia"),
              abc: (typeof Orcamento.curvaABC === "function") ? Orcamento.curvaABC(orc) : null,
              crono: (typeof Orcamento.cronograma === "function") ? Orcamento.cronograma(orc, orc.cronogramaMeses) : null,
              cronoAgente: (typeof Cronograma !== "undefined") ? Cronograma.estimar(orc) : null,
              insumosMap: insumosMap,
              analiticoComp: (typeof Analitico !== "undefined" && Analitico.carregado) ? (Analitico.competencia + "/" + Analitico.uf) : "",
              responsavel: (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : null
            };
            // Gera os PNGs dos gráficos NO BROWSER (canvas). Node nunca passa por aqui.
            try { deps.graficos = gerarGraficos(orc, deps); } catch (eg) { console.warn('[excel graficos]', eg); deps.graficos = null; }
            // construir devolve Promise (proteção de abas é assíncrona no ExcelJS)
            Promise.resolve(construir(global.ExcelJS, orc, deps)).then(function (wb) {
              return wb.xlsx.writeBuffer();
            }).then(function (buf) {
              var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = (orc.numero || 'orcamento') + '_PRO.xlsx';
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
              if (global.UI) UI.toast(insumosMap ? "Excel gerado (com aba Insumos)!" : "Excel gerado (com fórmulas)!", "ok");
            }).catch(function (e) { console.error('[excel write]', e); if (global.UI) UI.toast("Falha ao escrever Excel: " + e.message, "erro"); });
          } catch (e) { console.error('[excel]', e); if (global.UI) UI.toast("Falha ao gerar Excel: " + e.message, "erro"); }
        };
        // tenta incluir a aba "Insumos" (carrega a base analítica sob demanda)
        var montarMapa = function () {
          var m = {};
          (orc.etapas || []).forEach(function (et) {
            (et.itens || []).forEach(function (it) {
              if (it.origem === "SINAPI") { var a = Analitico.obter(it.codigo); if (a) m[String(it.codigo)] = a; }
            });
          });
          return m;
        };
        if (typeof Analitico === "undefined") { finalizar(null); return; }
        // O App (exportarExcel) já carrega o analítico do ESTADO ATIVO antes de gerar.
        // Se estiver carregado, usa; se não (raro/offline), gera SEM a aba — nunca com o MG errado.
        finalizar(Analitico.carregado ? montarMapa() : null);
      });
    }
  };

  if (global) global.ExcelOrc = ExcelOrc;
  if (typeof module !== "undefined" && module.exports) module.exports = ExcelOrc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

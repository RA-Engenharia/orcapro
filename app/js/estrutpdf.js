/* =====================================================================
 * estrutpdf.js — O PROJETO ESTRUTURAL EM PDF VIRA DADO DE CANTEIRO (motor PURO)
 *
 * O QUE ISTO RESOLVE. O projeto de fundação/estrutura chega em PDF (pranchas
 * A1 exportadas do programa de cálculo). No canteiro ninguém quer prancha:
 * quer, para a sapata S5 que vai concretar amanhã, o desenho DELA como está
 * no projeto, as barras dela (posição, bitola, quantidade, comprimento), o
 * cobrimento, o volume de concreto — e a lista de material da etapa. Este
 * motor lê o TEXTO POSICIONADO das páginas (o que o pdf.js entrega) e monta:
 *
 *   especificações ... fck, a/c, classe de agressividade, agregado, cotas;
 *   cobrimentos ...... por elemento, como escritos na nota do projeto;
 *   pilares .......... locação X/Y, seção, cargas e a sapata (B, H, h0, h1, df);
 *   vigas e lajes .... seção, elevação e nível por pavimento;
 *   tabelas de aço ... a "Relação do aço" (N, bitola, quantidade, C) e o
 *                      "Resumo do aço" (m e kg +10 %) de cada prancha, com o
 *                      volume de concreto e a área de fôrma declarados;
 *   vistas ........... o RETÂNGULO de cada detalhe (S1=S2…, V1, P6) na página,
 *                      com as chamadas de armação que caem dentro dele — é o
 *                      recorte que a tela desenha "como está no projeto".
 *
 * ⚠ NADA É INVENTADO. O que não foi lido sai vazio e a conferência diz "não
 *   conferido". Quantidade que o projeto não dá (espaçador, arame) NÃO é
 *   estimada aqui: a lista de material traz só o que está no PDF.
 *
 * ⚠ A CONFERÊNCIA É O QUE TORNA O LIDO CONFIÁVEL. Leitura de PDF erra calada
 *   (uma célula pulada desloca a tabela inteira). Por isso o motor cruza três
 *   fontes que o próprio calculista escreveu e que têm de bater entre si:
 *     1. cada linha da relação: quantidade × C.unit = C.total;
 *     2. relação × resumo: Σ C.total por bitola = C.total (m) do resumo, e
 *        peso do resumo = m × massa nominal (NBR 7480) × 1,10;
 *     3. detalhes × relação: as chamadas "10 N1 ø10.0 c/12 C=175" dentro das
 *        vistas, vezes quantos elementos a vista representa (S1=…=S10 → 8),
 *        somam a quantidade da relação.
 *   Linha que não bate aparece com os dois números. Recado que mente é pior
 *   que recado nenhum.
 *
 * ⚠ O RESUMO VEM EM DUAS ORDENS. O mesmo programa grava o "Resumo do aço" ora
 *   linha a linha (CA50 10.0 184.4 125 CA60 5.0 225.7 38.3), ora coluna a
 *   coluna (CA50 CA60 12.5 5.0 136.7 295.3 144.8 50.1) — depende da ordem em
 *   que a prancha foi desenhada. Ler sempre por linha trocava bitola por
 *   comprimento em silêncio. As duas ordens são testadas e só vale a que
 *   passa na conta do peso (m × massa × 1,10).
 *
 * ⚠ O pdf.js QUEBRA TEXTO NA TROCA DE FONTE: "10 N1 ", "ø", "10.0 c/12 C=175"
 *   podem chegar como três itens (o ø costuma vir de outra fonte). As chamadas
 *   de armação e os títulos são lidos sobre LINHAS (itens na mesma linha de
 *   base, colados) — nunca item a item. As tabelas, ao contrário, são lidas na
 *   ordem do conteúdo, item a item: juntar células vizinhas destruiria a
 *   coluna.
 *
 * Coordenadas: x,y em pontos PDF com a origem no CANTO SUPERIOR ESQUERDO
 * (espaço do viewport do pdf.js em escala 1); retângulos das vistas em
 * FRAÇÃO da página [x0, y0, x1, y1] — desenháveis em qualquer escala.
 *
 * Node-testável: tools/test-estrutpdf.js (com controles negativos).
 * ES5: o produto roda em WebView de instalador antigo.
 * ===================================================================== */
(function (global) {
  "use strict";

  var VERSAO = 1;
  /* massa nominal kg/m (NBR 7480) — a do resumo "+10 %" é esta × 1,10 */
  var MASSA = { "3.4": 0.071, "4.2": 0.109, "5": 0.154, "6": 0.222, "6.3": 0.245, "8": 0.395, "10": 0.617,
    "12.5": 0.963, "16": 1.578, "20": 2.466, "22": 2.984, "25": 3.853, "32": 6.313, "40": 9.865 };

  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function limpa(s) { return txt(s).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }
  function sem(s) { return limpa(s).toUpperCase().replace(/[ÁÀÂÃ]/g, "A").replace(/[ÉÊ]/g, "E").replace(/[Í]/g, "I").replace(/[ÓÔÕ]/g, "O").replace(/[Ú]/g, "U").replace(/Ç/g, "C"); }

  /* número como o calculista escreve: "9.77", "1.234,56", "0,55", "344.9" */
  function num(s) {
    var t = limpa(s).replace(/\s/g, "");
    if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
    if (t.indexOf(",") >= 0 && t.indexOf(".") >= 0) t = t.replace(/\./g, "").replace(",", ".");
    else if (t.indexOf(",") >= 0) t = t.replace(",", ".");
    var v = parseFloat(t);
    return isFinite(v) ? v : null;
  }
  function chaveBitola(d) { var v = Math.round(d * 10) / 10; return String(v % 1 === 0 ? v.toFixed(0) : v); }
  function massa(d) { var k = chaveBitola(d); return MASSA.hasOwnProperty(k) ? MASSA[k] : null; }
  function ehBitola(v) { return v != null && massa(v) != null; }
  function ehAco(s) { return /^CA-?\s?\d{2}[A-Z]?$/i.test(limpa(s)); }
  function nomeAco(s) { return limpa(s).toUpperCase().replace(/[\s-]/g, "").replace(/^CA(\d{2})/, "CA-$1"); }
  function ehVar(s) { return /^VAR\.?$/i.test(limpa(s)); }
  function ehInt(s) { return /^\d+$/.test(limpa(s)); }

  /* ------------------------------------------------------------------
   * ITENS DO pdf.js → itens com caixa no viewport
   * items: tc.items (str, transform, width, height); vt: viewport.transform
   * ------------------------------------------------------------------ */
  function mult(m1, m2) {
    return [m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]];
  }
  function itensDaPagina(items, vt, w, h) {
    var out = [];
    arr(items).forEach(function (it) {
      if (!it || typeof it.str !== "string" || !limpa(it.str)) return;
      var m = mult(vt || [1, 0, 0, -1, 0, h || 0], it.transform || [1, 0, 0, 1, 0, 0]);
      var s = Math.sqrt(m[2] * m[2] + m[3] * m[3]) || Math.abs(it.height) || 1;
      var ua = Math.sqrt(m[0] * m[0] + m[1] * m[1]) || 1;
      var ux = m[0] / ua, uy = m[1] / ua, vx = m[2] / s, vy = m[3] / s;
      /* pdf.js mede `width` no espaço da página; em escala 1 vale direto */
      var wd = +it.width || 0, ox = m[4], oy = m[5];
      var xs = [ox, ox + ux * wd, ox + vx * s, ox + ux * wd + vx * s];
      var ys = [oy, oy + uy * wd, oy + vy * s, oy + uy * wd + vy * s];
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      out.push({ t: it.str, x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0), s: r2(s), ang: Math.round(Math.atan2(uy, ux) * 180 / Math.PI), bx: r2(ox), by: r2(oy) });
    });
    return { w: +w || 0, h: +h || 0, itens: out };
  }

  /* ------------------------------------------------------------------
   * LINHAS: itens na mesma linha de base, horizontais e colados
   * ------------------------------------------------------------------ */
  function linhas(pag) {
    var its = arr(pag.itens).filter(function (i) { return limpa(i.t); });
    var hor = its.filter(function (i) { return !i.ang; }), outros = its.filter(function (i) { return i.ang; });
    hor = hor.slice().sort(function (a, b) { return (a.by - b.by) || (a.x - b.x); });
    var res = [], usados = [];
    for (var i = 0; i < hor.length; i++) {
      if (usados[i]) continue;
      var L = { t: hor[i].t, x: hor[i].x, y: hor[i].y, w: hor[i].w, h: hor[i].h, s: hor[i].s, by: hor[i].by, ang: 0 };
      usados[i] = true;
      var fim = hor[i].x + hor[i].w, mudou = true;
      while (mudou) {
        mudou = false;
        for (var j = i + 1; j < hor.length; j++) {
          if (usados[j]) continue;
          var o = hor[j];
          if (Math.abs(o.by - L.by) > 0.35 * Math.max(o.s, L.s)) { if (o.by - L.by > L.s) break; continue; }
          var gap = o.x - fim;
          if (gap > -0.3 * L.s && gap < 0.65 * Math.max(o.s, L.s)) {
            /* ⚠ DOIS NÚMEROS NUNCA SE COLAM. No projeto real duas chamadas vizinhas
             * ("5 N1 ø5.0 C=95" e "2x5 N2 ø5.0 C=75") ficam a menos de 1 pt uma da
             * outra; coladas viravam "C=952x5 N2" — o C=95 lido como 952 e o N2
             * sumido. Texto sobreposto (gap negativo) também é entidade diferente. */
            var esp = gap > 0.15 * L.s || gap < -0.1 * L.s || (/\d$/.test(L.t) && /^\d/.test(o.t));
            L.t += (esp ? " " : "") + o.t;
            var nx1 = Math.max(fim, o.x + o.w);
            L.w = nx1 - L.x; fim = nx1;
            L.y = Math.min(L.y, o.y); L.h = Math.max(L.h, o.y + o.h - L.y); L.s = Math.max(L.s, o.s);
            usados[j] = true; mudou = true;
          }
        }
      }
      L.t = limpa(L.t);
      res.push(L);
    }
    outros.forEach(function (o) { res.push({ t: limpa(o.t), x: o.x, y: o.y, w: o.w, h: o.h, s: o.s, by: o.by, ang: o.ang }); });
    return res;
  }

  function mediana(v) { if (!v.length) return 0; var s = v.slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length / 2)]; }

  /* ------------------------------------------------------------------
   * CHAMADAS DE ARMAÇÃO: "10 N1 ø10.0 c/12 C=175", "2x5 N2 ø5.0 C=75",
   * "16 N1 c/17" (distribuição, sem bitola) — sobre LINHAS
   * ------------------------------------------------------------------ */
  var RX_ANOT = /(\d+)\s*(?:[xX×]\s*(\d+)\s*)?N\s?(\d+)\b\s*(?:[øØφΦ]\s*(\d+(?:[.,]\d+)?))?\s*(?:c\s*\/\s*(\d+(?:[.,]\d+)?))?\s*(?:C\s*=\s*(VAR|\d+(?:[.,]\d+)?))?/g;
  function anotacoes(texto) {
    var out = [], m, s = txt(texto);
    RX_ANOT.lastIndex = 0;
    while ((m = RX_ANOT.exec(s))) {
      if (m.index > 0 && /[\w.\/]/.test(s.charAt(m.index - 1))) continue;
      var q = parseInt(m[1], 10), k = m[2] ? parseInt(m[2], 10) : 1;
      var d = m[4] ? num(m[4]) : null, esp = m[5] ? num(m[5]) : null;
      var c = m[6] ? (ehVar(m[6]) ? "VAR" : num(m[6])) : null;
      out.push({ n: parseInt(m[3], 10), quant: q * k, grupos: k > 1 ? q : 1, diam: d, espac: esp, comp: c,
        definitiva: d != null && c != null, texto: limpa(m[0]) });
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * TABELAS (na ordem do conteúdo, item a item)
   * ------------------------------------------------------------------ */
  function tokens(pag) { return arr(pag.itens).map(function (i) { return limpa(i.t); }).filter(function (t) { return t; }); }

  function achaIdx(tk, rx, de) { for (var i = de || 0; i < tk.length; i++) if (rx.test(tk[i])) return i; return -1; }

  function lerRelacao(tk, i0) {
    /* cabeçalho até o primeiro aço; guarda nomes de elementos (8xS1, V1…, "Positivos X") */
    var i = i0 + 1, cab = [];
    while (i < tk.length && !ehAco(tk[i]) && !/^RESUMO/i.test(sem(tk[i]))) {
      if (!/^(ACO|N|DIAM|QUANT|C\.?\s?UNIT|C\.?\s?TOTAL|\(MM\)|\(CM\)|\(M\)|\(KG\))$/i.test(sem(tk[i]))) cab.push(tk[i]);
      i++;
    }
    var barras = [], aco = "", falhas = [];
    while (i < tk.length) {
      var t = tk[i];
      if (/^RESUMO|^PESO TOTAL|^VOLUME DE CONCRETO/i.test(sem(t))) break;
      if (ehAco(t)) { aco = nomeAco(t); i++; continue; }
      if (!ehInt(t)) { i++; continue; }
      var f = tk.slice(i, i + 5);
      var n = parseInt(f[0], 10), d = num(f[1]), q = ehInt(f[2]) ? parseInt(f[2], 10) : null;
      var cu = ehVar(f[3]) ? "VAR" : num(f[3]), ct = ehVar(f[4]) ? "VAR" : num(f[4]);
      if (!ehBitola(d) || q == null || cu == null || ct == null) { falhas.push(f.join(" ")); i++; continue; }
      barras.push({ aco: aco, n: n, diam: d, quant: q, cUnit: cu, cTotal: ct });
      i += 5;
    }
    return { cabecalho: cab, barras: barras, fim: i, naoLidas: falhas };
  }

  /* as duas ordens do resumo; só vale a que fecha a conta do peso */
  function pesoOk(d, m, kg) { var ms = massa(d); if (ms == null || m == null || kg == null) return false; var e = m * ms * 1.10; return Math.abs(e - kg) <= Math.max(0.6, kg * 0.02); }
  function lerResumo(tk, i0, barras) {
    var i = i0 + 1, dados = [];
    while (i < tk.length && !/^PESO TOTAL|^VOLUME DE CONCRETO|^AREA DE FORMA/i.test(sem(tk[i]))) {
      var t = tk[i];
      if (ehAco(t)) dados.push({ aco: nomeAco(t) });
      else if (num(t) != null && !/^\(/.test(t)) dados.push({ v: num(t) });
      i++;
    }
    var fimRes = i;
    function porLinha() {
      var out = [], aco = "", k = 0;
      while (k < dados.length) {
        if (dados[k].aco) { aco = dados[k].aco; k++; continue; }
        if (k + 2 >= dados.length || dados[k + 1].aco || dados[k + 2].aco) return null;
        var d = dados[k].v, m = dados[k + 1].v, kg = dados[k + 2].v;
        if (!pesoOk(d, m, kg)) return null;
        out.push({ aco: aco, diam: d, m: m, kg: kg }); k += 3;
      }
      return out.length ? out : null;
    }
    function porColuna() {
      var acos = [], nums = [];
      dados.forEach(function (x) { if (x.aco) acos.push(x.aco); else nums.push(x.v); });
      if (!nums.length || nums.length % 3) return null;
      var k = nums.length / 3, out = [];
      for (var j = 0; j < k; j++) {
        var d = nums[j], m = nums[k + j], kg = nums[2 * k + j];
        if (!pesoOk(d, m, kg)) return null;
        /* o aço da bitola sai da relação (é lá que cada barra diz o seu) */
        var ac = "";
        arr(barras).forEach(function (b) { if (!ac && Math.abs(b.diam - d) < 0.05) ac = b.aco; });
        if (!ac && acos.length === 1) ac = acos[0];
        out.push({ aco: ac, diam: d, m: m, kg: kg });
      }
      return out;
    }
    var res = porLinha(), ordem = "linha";
    if (!res) { res = porColuna(); ordem = "coluna"; }
    /* PESO TOTAL por aço (as mesmas duas ordens) */
    var tot = [], j2 = fimRes;
    if (j2 < tk.length && /^PESO TOTAL/i.test(sem(tk[j2]))) {
      var ds = [];
      j2++;
      while (j2 < tk.length && !/^VOLUME DE CONCRETO|^AREA DE FORMA|^RELACAO|^TAMANHO PAPEL/i.test(sem(tk[j2])) && ds.length < 12) {
        if (ehAco(tk[j2])) ds.push({ aco: nomeAco(tk[j2]) });
        else if (num(tk[j2]) != null) ds.push({ v: num(tk[j2]) });
        else if (!/^\(KG\)$/i.test(sem(tk[j2]))) break;
        j2++;
      }
      var acs = ds.filter(function (x) { return x.aco; }), vs = ds.filter(function (x) { return !x.aco; });
      if (acs.length === vs.length) {
        var alterna = ds.length > 1 && ds[0].aco && !ds[1].aco;
        acs.forEach(function (a, q) { tot.push({ aco: a.aco, kg: alterna ? ds[q * 2 + 1].v : vs[q].v }); });
      }
    }
    return { itens: res || [], ordem: res ? ordem : "", lido: !!res, fim: fimRes, pesoTotal: tot };
  }

  function lerTabelasAco(pag, pagIdx) {
    var tk = tokens(pag), out = [], i = 0;
    while (true) {
      var ir = achaIdx(tk, /^RELA[CÇ][AÃ]O DO A[CÇ]O/i, i);
      if (ir < 0) break;
      var rel = lerRelacao(tk, ir);
      var titulo = limpa(tk[ir] + " " + rel.cabecalho.filter(function (c) { return /^[A-ZÇÃÁÉÍÓÚ ]+$/i.test(c) && !/^\d/.test(c); }).slice(0, 3).join(" "));
      var is = achaIdx(tk, /^RESUMO DO A[CÇ]O/i, rel.fim);
      var res = is >= 0 ? lerResumo(tk, is, rel.barras) : { itens: [], ordem: "", lido: false, fim: rel.fim, pesoTotal: [] };
      out.push({ pagina: pagIdx, titulo: titulo, cabecalho: rel.cabecalho, barras: rel.barras, naoLidas: rel.naoLidas,
        resumo: res.itens, resumoOrdem: res.ordem, resumoLido: res.lido, pesoTotal: res.pesoTotal, concretoM3: null, concretoClasse: "", formaM2: null });
      i = Math.max(res.fim, ir + 1);
    }
    /* concreto e fôrma declarados na prancha: vão para a tabela da prancha */
    var s = tk.join(" | ");
    var mc = /Volume de concreto\s*(?:\(\s*([A-Z]-?\s?\d+)\s*\))?\s*=\s*([\d.,]+)\s*m/i.exec(s);
    var mf = /[ÁA]rea de f[oô]rma\s*=\s*([\d.,]+)\s*m/i.exec(s);
    if (out.length) {
      if (mc) { out[0].concretoM3 = num(mc[2]); out[0].concretoClasse = limpa(mc[1] || "").replace(/\s/g, ""); }
      if (mf) out[0].formaM2 = num(mf[1]);
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * FICHA DA PRANCHA, PAVIMENTO, ESPECIFICAÇÕES
   * ------------------------------------------------------------------ */
  function fichaPagina(pag, idx) {
    var tk = tokens(pag), s = tk.join(" | ");
    var cod = /([A-Z0-9]+-[A-Z]{2,4}_[A-Z0-9]+_\d+_R\d+(?:\.V\d+)?)/.exec(s);
    var ic = achaIdx(tk, /^CONTE[ÚU]DO DA PRANCHA$/i, 0);
    /* ⚠ a folha é o "NN/NN" DEPOIS do rótulo FOLHA — a tabela de bitolas tem "1/8" (polegada) antes */
    var folha = "", iF = achaIdx(tk, /^FOLHA$/i, 0);
    if (iF >= 0) for (var q = iF + 1; q < Math.min(tk.length, iF + 25) && !folha; q++) if (/^\d{1,3}\/\d{1,3}$/.test(tk[q])) folha = tk[q];
    if (!folha) tk.forEach(function (t) { if (!folha && /^\d{2}\/\d{2}$/.test(t)) folha = t; });
    var data = /\b(\d{2}\/\d{2}\/\d{4})\b/.exec(s);
    var pv = /PAVIMENTO\s+(.+?)\s*\(\s*N[ÍI]VEL\s*(-?\d+(?:[.,]\d+)?)\s*\)/i.exec(s);
    /* o DOCUMENTO no padrão "OBRA-FUND_R02" (código com hífens + _Rnn): é a
       identidade que o carimbo OrcaPRO_Folha da peça cita. ⚠ Só a forma com
       sublinhado: a mesma folha cita "OBRA-ES R00" (o projeto do calculista,
       com espaço) como referência — pegar esse seria casar a folha errada. */
    var docM = /(?:^|[^A-Z0-9-])([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+_R\d{2,3})(?![0-9])/.exec(s);
    return { pagina: idx, codigo: cod ? cod[1] : "", documento: docM ? docM[1] : "", folha: folha, data: data ? data[1] : "",
      titulo: ic >= 0 && tk[ic + 1] ? tk[ic + 1] : "", pavimento: pv ? { nome: limpa(pv[1]).replace(/\s*\|\s*/g, " "), nivel: num(pv[2]) } : null };
  }

  function especificacoes(paginas) {
    /* ⚠ SOBRE LINHAS, NÃO SOBRE ITENS. Com os itens juntados por espaço, uma
     * nota CORTADA ("*Cobrimento dos Blocos de Fundação ou Sapata", sem o
     * "s= 5,0 cm" — o pdf.js descarta texto que sai da folha; a e2e pegou)
     * emendava na nota seguinte e a sapata herdava os 4 cm da viga de
     * equilíbrio. Agora cada nota é uma linha e o nome do elemento não
     * atravessa "*", "=", ";" nem a quebra: nota sem número fica sem número.
     * A linha também remonta a nota partida em dois itens (troca de fonte). */
    var s = arr(paginas).map(function (p) { return linhas(p).filter(function (l) { return !l.ang; }).map(function (l) { return l.t; }).join("\n"); }).join("\n");
    function pega(rx, f) { var m = rx.exec(s); return m ? (f ? f(m) : num(m[1])) : null; }
    var cob = [], vistos = {}, m, rx = /Cobrimento d[oa]s?\s+([^=\n*;]+?)\s*=\s*([\d.,]+)\s*cm/gi;
    while ((m = rx.exec(s))) {
      var el = limpa(m[1]); var k = sem(el);
      if (vistos[k]) continue; vistos[k] = 1;
      cob.push({ elemento: el, cm: num(m[2]), tipo: tipoCobrimento(el) });
    }
    return {
      fckMPa: pega(/fck\s*[>≥]?=?\s*(\d+(?:[.,]\d+)?)\s*MPa/i),
      relacaoAc: pega(/[áa]gua\s*\/\s*cimento[^≤<\d\n]*[≤<]=?\s*([\d.,]+)/i),
      consumoMinKgM3: pega(/Consumo m[íi]nimo[^>\d\n]*>=?\s*(\d+)\s*kg/i),
      classeAgressividade: pega(/agressividade ambiental\s*=\s*([^;*\n|]+?)(?:\s*\(|;|\*|\n|$)/i, function (x) { return limpa(x[1]); }),
      agregadoMaxMm: pega(/(?:Tamanho|Dimens[ãa]o) m[áa]xim[oa] do agregado\s*=\s*(\d+)\s*mm/i),
      tensaoAdmKgfCm2: pega(/TENS[ÃA]O ADM\.?\s*(?:DO\s*)?TERRENO\s*[>≥]?=?\s*([\d.,]+)\s*kg/i),
      cotaAssentamentoM: pega(/COTA DE ASSENTAMENTO DAS SAPATAS\s*=\s*([\d.,]+)\s*m/i),
      cargaPermanenteKgfM2: pega(/Carga Permanente\s*:\s*([\d.,]+)\s*kgf/i),
      cargaAcidentalKgfM2: pega(/Carga Acidental\s*:\s*([\d.,]+)\s*kgf/i),
      moduloSecanteKgfCm2: pega(/El[áa]sticidade secante\s*=\s*([\d.,]+)/i),
      cobrimentos: cob
    };
  }
  /* o tipo de elemento a que o cobrimento se aplica (para ligar à peça) */
  function tipoCobrimento(el) {
    var s = sem(el);
    if (/SOLO/.test(s) && /PILAR/.test(s)) return "pilar-solo";
    if (/SAPATA|BLOCO/.test(s)) return "sapata";
    if (/EQUIL|BALDRAME/.test(s)) return "viga-baldrame";
    if (/PILAR/.test(s)) return "pilar";
    if (/LAJE/.test(s)) return "laje";
    if (/VIGA/.test(s)) return "viga";
    return "outro";
  }

  /* ------------------------------------------------------------------
   * PILARES (locação + fundação), VIGAS e LAJES — linhas de tabela
   * ------------------------------------------------------------------ */
  function lerLinhasNomeadas(pag, rxNome) {
    var tk = tokens(pag), out = [];
    for (var i = 0; i < tk.length; i++) {
      if (!rxNome.test(tk[i])) continue;
      var nome = tk[i].toUpperCase(), j = i + 1, sec = null, pal = [];
      if (j < tk.length && /^\d+(?:[.,]\d+)?\s*[xX×]\s*\d+(?:[.,]\d+)?$/.test(tk[j])) { sec = tk[j].replace(/\s/g, "").toLowerCase().replace("×", "x"); j++; }
      while (j < tk.length && /^[A-Za-zÀ-ú]+$/.test(tk[j]) && !rxNome.test(tk[j]) && pal.length < 1) { pal.push(tk[j]); j++; }
      var ns = [];
      while (j < tk.length && num(tk[j]) != null && !rxNome.test(tk[j])) { ns.push(num(tk[j])); j++; }
      var extra = j < tk.length && /^(sim|n[ãa]o|-)$/i.test(tk[j]) ? tk[j] : "";
      out.push({ nome: nome, secao: sec, palavra: pal[0] || "", numeros: ns, extra: extra });
    }
    return out;
  }
  function dimSecao(sec) { var m = /^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)$/.exec(txt(sec)); return m ? { b: num(m[1]), h: num(m[2]) } : { b: null, h: null }; }

  function lerElementos(paginas, fichas) {
    var pil = {}, vig = [], laj = [];
    paginas.forEach(function (pag, idx) {
      var pv = fichas[idx].pavimento;
      lerLinhasNomeadas(pag, /^\s*P\d+[A-Z]?\s*$/i).forEach(function (r) {
        if (!r.secao) return;
        var nome = limpa(r.nome), p = pil[nome] || (pil[nome] = { nome: nome, secao: r.secao, b: dimSecao(r.secao).b, h: dimSecao(r.secao).h, x: null, y: null, niveis: [], fundacao: null, cargaMaxTf: null, cargaMinTf: null });
        if (r.numeros.length >= 17) {
          var n = r.numeros;
          p.x = n[0]; p.y = n[1]; p.cargaMaxTf = n[2]; p.cargaMinTf = n[3];
          p.fundacao = { B: n[12], H: n[13], h0: n[14], h1: n[15], df: n[16] };
        } else if (r.numeros.length === 2 && pv) {
          if (p.niveis.indexOf(r.numeros[1]) < 0) p.niveis.push(r.numeros[1]);
        }
      });
      if (!pv) return;
      lerLinhasNomeadas(pag, /^\s*V[BE]?\d+[A-Z]?\s*$/i).forEach(function (r) {
        if (!r.secao || r.numeros.length !== 2) return;
        var d = dimSecao(r.secao);
        vig.push({ nome: limpa(r.nome), pavimento: pv.nome, secao: r.secao, b: d.b, h: d.h, elevacao: r.numeros[0], nivel: r.numeros[1], pagina: idx });
      });
      lerLinhasNomeadas(pag, /^\s*L\d+[A-Z]?\s*$/i).forEach(function (r) {
        if (!r.palavra || r.numeros.length < 3) return;
        var n = r.numeros;
        laj.push({ nome: limpa(r.nome), pavimento: pv.nome, tipo: r.palavra, altura: n[0], elevacao: n[1], nivel: n[2],
          pesoProprioTfM2: n.length > 3 ? n[3] : null, adicionalTfM2: n.length > 4 ? n[4] : null, acidentalTfM2: n.length > 5 ? n[5] : null,
          localizada: /^sim$/i.test(r.extra), pagina: idx });
      });
    });
    var lista = Object.keys(pil).map(function (k) { pil[k].niveis.sort(function (a, b) { return a - b; }); return pil[k]; });
    lista.sort(function (a, b) { return parseInt(a.nome.slice(1), 10) - parseInt(b.nome.slice(1), 10); });
    /* vigas repetidas (a mesma tabela aparece em mais de uma prancha): uma por pavimento+nome */
    function uniq(v) { var s = {}; return v.filter(function (x) { var k = x.pavimento + "|" + x.nome; if (s[k]) return false; s[k] = 1; return true; }); }
    return { pilares: lista, vigas: uniq(vig), lajes: uniq(laj) };
  }

  /* ------------------------------------------------------------------
   * VISTAS DE DETALHAMENTO: título de elemento em fonte GRANDE (V1, P6,
   * S1=S2=…) + o retângulo do detalhe na grade da prancha
   * ------------------------------------------------------------------ */
  var RX_TIT = /^(?:(?:VB|VE|BL|[PVLSB])\d+[A-Z]?)(?:\s*=\s*(?:(?:VB|VE|BL|[PVLSB])\d+[A-Z]?))*$/i;
  function elementosDoTitulo(t) { return limpa(t).toUpperCase().split(/\s*=\s*/).filter(function (x) { return x; }); }

  function limiteConteudo(pag, lin) {
    /* a coluna da direita (especificações, carimbo) não é desenho */
    var dir = pag.w || 0;
    /* ⚠ "Legenda" NÃO é a coluna de notas: é um quadro solto à esquerda dela, numa
     * faixa de altura. Como limite, cortava as seções A-A das vigas V2, V7 e V4
     * (a conferência detalhes × relação acusou 3 chamadas de estribo sumidas). */
    lin.forEach(function (l) { if (/^ESPECIFICA[CÇ][OÕ]ES DOS MATERIAIS|^NOTAS GERAIS:?$/i.test(sem(l.t)) && l.x > (pag.w || 0) * 0.55) dir = Math.min(dir, l.x - 6); });
    var baixo = pag.h || 0;
    lin.forEach(function (l) { if (/^TAMANHO PAPEL/i.test(sem(l.t))) baixo = Math.min(baixo, l.y - 4); });
    return { x0: 0, y0: 0, x1: dir || pag.w, y1: baixo || pag.h };
  }

  function vistasDaPagina(pag, idx, ficha) {
    var lin = linhas(pag), med = mediana(lin.map(function (l) { return l.s; }));
    var C = limiteConteudo(pag, lin);
    var tit = lin.filter(function (l) { return !l.ang && RX_TIT.test(l.t) && l.s >= 1.4 * med; });
    /* marcadores de bloco que NÃO são desenho do detalhe (tabelas, títulos de folha) */
    var marc = lin.filter(function (l) { return !l.ang && (/^RELA[CÇ][AÃ]O DO A[CÇ]O|^RESUMO DO A[CÇ]O|^VOLUME DE CONCRETO|^BITOLAS$|^LEGENDA$|^DETALHE\s/i.test(sem(l.t)) || l.s >= 2.6 * med); });
    var gap = 1.2 * med, pad = 1.5 * med, out = [];
    tit.forEach(function (T) {
      /* a cota vertical da planta fica à ESQUERDA do título (o "150" da S5=S11 saía cortado): 2,5 × a fonte */
      var x0 = Math.max(C.x0, T.x - 2.5 * med), y0 = Math.max(C.y0, T.y - pad), x1 = C.x1, y1 = C.y1;
      tit.concat(marc).forEach(function (o) {
        if (o === T) return;
        var mesmaFaixa = Math.abs(o.y - T.y) < 8 * T.s;
        if (mesmaFaixa && o.x > T.x + T.w) x1 = Math.min(x1, o.x - gap);
      });
      tit.concat(marc).forEach(function (o) {
        if (o === T) return;
        if (o.y > T.y + 2 * T.h && o.x >= x0 - 3 * med && o.x < x1) y1 = Math.min(y1, o.y - gap);
      });
      /* extensão pelo texto que desce na coluna do título: para no primeiro vão grande */
      var col = lin.filter(function (l) { return l !== T && l.y >= T.y && l.y < y1 && l.x >= x0 - med && l.x < x1; })
        .sort(function (a, b) { return a.y - b.y; });
      /* ⚠ 8 × a fonte: com 11 a sapata S6=S12 engolia o "DETALHE DE FORMA" e o
       * "DETALHE DO ARRANQUE" logo abaixo (88 pt de vão); dentro de um detalhe o
       * maior vão sem texto é a faixa da viga (~55 pt) */
      var ult = T.y + T.h, vaoMax = 8 * med;
      for (var k = 0; k < col.length; k++) {
        if (col[k].y - ult > vaoMax) break;
        ult = Math.max(ult, col[k].y + col[k].h);
      }
      y1 = Math.min(y1, ult + pad);
      /* largura pelo texto da faixa (o detalhe não vai até a borda se a linha acaba antes) */
      /* ⚠ A TABELA COMEÇA À ESQUERDA DO TÍTULO DELA: o "RELAÇÃO DO AÇO" é centrado
       * sobre as colunas, e cortar no título deixava "AÇO | CA50" na borda do
       * recorte da sapata S5=S11. Célula de tabela na metade direita da vista corta
       * a vista antes dela. */
      var meio = (x0 + x1) / 2;
      lin.forEach(function (l) {
        if (l.y >= y0 && l.y <= y1 && l.x > meio && l.x < x1 && /^(A[ÇC]O|CA-?\d{2}|DIAM|QUANT|C\.?\s?UNIT|C\.?\s?TOTAL)$/i.test(l.t)) x1 = Math.min(x1, l.x - gap);
      });
      var dentro = lin.filter(function (l) { return l.y >= y0 && l.y <= y1 && l.x >= x0 && l.x < x1; });
      var xm = T.x + T.w;
      dentro.forEach(function (l) { xm = Math.max(xm, l.x + l.w); });
      x1 = Math.min(x1, xm + pad);
      var els = elementosDoTitulo(T.t);
      var anot = [], apoios = [];
      dentro.forEach(function (l) {
        if (l.y > y1) return;
        /* x/y da chamada: acima dos rótulos de apoio = barra superior (convenção do desenho de viga) */
        anotacoes(l.t).forEach(function (a) { a.x = r2(l.x + l.w / 2); a.y = r2(l.y); anot.push(a); });
        /* apoios da viga: os rótulos de pilar (fonte pequena) dentro do detalhe, da esquerda para a direita */
        if (l !== T && !l.ang && /^P\d+[A-Z]?$/i.test(l.t) && l.s < 1.4 * med) apoios.push({ nome: l.t.toUpperCase(), x: l.x, y: l.y });
      });
      apoios.sort(function (a, b) { return a.x - b.x; });
      var apN = [], apY = null;
      apoios.forEach(function (a) { if (apN.indexOf(a.nome) < 0) apN.push(a.nome); apY = apY == null ? a.y : Math.min(apY, a.y); });
      out.push({ id: "p" + idx + "-" + els.join("=") , pagina: idx, titulo: limpa(T.t), elementos: els, multiplicidade: els.length,
        pavimento: ficha && ficha.pavimento ? ficha.pavimento.nome : "", auto: true,
        rect: [r3(x0 / pag.w), r3(y0 / pag.h), r3(x1 / pag.w), r3(y1 / pag.h)], armacao: anot, apoios: apN, apoiosY: apY });
    });
    /* a prancha inteira (sem a coluna de notas) também é uma vista: planta de locação, fôrmas, lajes */
    var anotF = [];
    lin.forEach(function (l) { if (l.x < C.x1 && l.y < C.y1) anotacoes(l.t).forEach(function (a) { a.x = r2(l.x + l.w / 2); a.y = r2(l.y); anotF.push(a); }); });
    out.push({ id: "p" + idx + "-folha", pagina: idx, titulo: ficha && ficha.titulo ? ficha.titulo : "Prancha " + (idx + 1), elementos: [], multiplicidade: 1,
      pavimento: ficha && ficha.pavimento ? ficha.pavimento.nome : "", auto: true, folha: true,
      rect: [0, 0, r3(C.x1 / pag.w), r3(C.y1 / pag.h)], armacao: anotF });
    return out;
  }

  /* grupo de cada prancha (sapatas, vigas, pilares, lajes) pelo título */
  function grupoDe(s) {
    var t = sem(s);
    /* fôrma antes de laje/viga: "PLANTA DE FÔRMA DO TOPO (NÍVEL DA LAJE)" é fôrma, não armação de laje */
    if (/\bFORMA\b/.test(t) && !/ARMA[CÇ]/.test(t)) return "formas";
    if (/SAPATA|BLOCO/.test(t)) return "sapatas";
    if (/LAJE/.test(t) && !/VIGA/.test(t)) return "lajes";
    if (/VIGA/.test(t)) return "vigas";
    if (/PILAR/.test(t)) return "pilares";
    if (/LOCA[CÇ]/.test(t)) return "locacao";
    if (/F[OÔ]RMA/.test(t)) return "formas";
    return "";
  }

  /* pavimento de uma prancha de armação: palavra do pavimento no título */
  function pavimentoPorTitulo(titulo, pavs) {
    var t = sem(titulo), best = "";
    pavs.forEach(function (p) {
      var palavras = sem(p.nome).split(/\s+/).filter(function (w) { return w.length > 3; });
      if (palavras.some(function (w) { return t.indexOf(w) >= 0; }) && !best) best = p.nome;
    });
    return best;
  }

  /* ------------------------------------------------------------------
   * LER tudo
   * ------------------------------------------------------------------ */
  function ler(paginas, opts) {
    opts = opts || {};
    var pgs = arr(paginas);
    var fichas = pgs.map(function (p, i) { return fichaPagina(p, i); });
    var pavs = [], vistosP = {};
    fichas.forEach(function (f) { if (f.pavimento && !vistosP[f.pavimento.nome]) { vistosP[f.pavimento.nome] = 1; pavs.push({ nome: f.pavimento.nome, nivel: f.pavimento.nivel, pagina: f.pagina }); } });
    fichas.forEach(function (f) {
      f.grupo = grupoDe(f.titulo);
      /* só VIGA é "de um pavimento" (V1 do baldrame ≠ V1 do topo); pilar atravessa pavimentos */
      if (!f.pavimento && f.grupo === "vigas") { var pn = pavimentoPorTitulo(f.titulo, pavs); if (pn) f.pavimentoArmacao = pn; }
    });
    var tabelas = [];
    pgs.forEach(function (p, i) { lerTabelasAco(p, i).forEach(function (t) { t.grupo = fichas[i].grupo || grupoDe(t.titulo); t.pavimento = fichas[i].pavimentoArmacao || (fichas[i].pavimento ? fichas[i].pavimento.nome : ""); tabelas.push(t); }); });
    var vistas = [];
    pgs.forEach(function (p, i) { vistasDaPagina(p, i, fichas[i]).forEach(function (v) { v.grupo = fichas[i].grupo; if (!v.pavimento && fichas[i].pavimentoArmacao) v.pavimento = fichas[i].pavimentoArmacao; vistas.push(v); }); });
    var el = lerElementos(pgs, fichas);
    var esp = especificacoes(pgs);
    var codBase = "";
    fichas.forEach(function (f) { if (!codBase && f.codigo) codBase = f.codigo.replace(/_\d+_R/, "_R"); });
    var proj = {
      versao: VERSAO,
      origem: { arquivo: txt(opts.arquivo), paginas: pgs.length, lidoEm: txt(opts.agora), tamanhos: pgs.map(function (p) { return [r2(p.w), r2(p.h)]; }) },
      codigo: codBase, data: (fichas[0] || {}).data || "",
      documento: (fichas.filter(function (f) { return f.documento; })[0] || {}).documento || "",
      folhas: fichas, pavimentos: pavs,
      especificacoes: esp,
      pilares: el.pilares, vigas: el.vigas, lajes: el.lajes,
      tabelas: tabelas, vistas: vistas
    };
    proj.conferencia = conferir(proj);
    return proj;
  }

  /* ------------------------------------------------------------------
   * CONFERÊNCIA
   * ------------------------------------------------------------------ */
  function conferir(proj) {
    var out = [];
    function add(grupo, item, ok, esperado, lido, nota) { out.push({ grupo: grupo, item: item, ok: ok, esperado: esperado, lido: lido, nota: nota || "" }); }
    arr(proj.tabelas).forEach(function (t) {
      var nomeT = t.titulo + " (prancha " + (t.pagina + 1) + ")";
      if (!t.barras.length) { add(nomeT, "relação do aço", false, "linhas", 0, "nenhuma linha lida"); return; }
      t.barras.forEach(function (b) {
        if (b.cUnit === "VAR" || b.cTotal === "VAR") return;
        var e = b.quant * b.cUnit;
        if (Math.abs(e - b.cTotal) > 1) add(nomeT, "N" + b.n + " quantidade × C.unit", false, e, b.cTotal, "a linha não fecha");
      });
      if (t.naoLidas.length) add(nomeT, "linhas não lidas", false, 0, t.naoLidas.length, t.naoLidas.slice(0, 3).join(" · "));
      if (!t.resumoLido) { add(nomeT, "resumo do aço", false, "lido", "não lido", "nenhuma das duas ordens fechou a conta do peso"); }
      /* relação × resumo, por bitola */
      var porD = {};
      t.barras.forEach(function (b) {
        var k = b.aco + "|" + chaveBitola(b.diam);
        var g = porD[k] || (porD[k] = { aco: b.aco, diam: b.diam, cm: 0, temVar: false });
        if (b.cTotal === "VAR") g.temVar = true; else g.cm += b.cTotal;
      });
      Object.keys(porD).forEach(function (k) {
        var g = porD[k];
        var r = arr(t.resumo).filter(function (x) { return Math.abs(x.diam - g.diam) < 0.05; })[0];
        if (!r) { if (t.resumoLido) add(nomeT, g.aco + " ø" + chaveBitola(g.diam), false, "no resumo", "ausente"); return; }
        if (g.temVar) { add(nomeT, g.aco + " ø" + chaveBitola(g.diam) + " (tem C=VAR)", true, "—", r.m, "comprimento variável: vale o total do resumo"); return; }
        var m = g.cm / 100;
        add(nomeT, g.aco + " ø" + chaveBitola(g.diam) + " m (relação × resumo)", Math.abs(m - r.m) <= Math.max(0.15, r.m * 0.005), r2(m), r.m);
      });
      arr(t.resumo).forEach(function (r) {
        var e = r.m * (massa(r.diam) || 0) * 1.10;
        add(nomeT, "ø" + chaveBitola(r.diam) + " peso (m × massa × 1,10)", pesoOk(r.diam, r.m, r.kg), r2(e), r.kg);
      });
      arr(t.pesoTotal).forEach(function (pt) {
        var s = 0; arr(t.resumo).forEach(function (r) { if (r.aco === pt.aco) s += r.kg; });
        add(nomeT, pt.aco + " peso total", Math.abs(s - pt.kg) <= 0.25, r2(s), pt.kg);
      });
      /* detalhes × relação: vistas de elemento da mesma prancha (ou a folha, se não houver) */
      var vs = arr(proj.vistas).filter(function (v) { return v.pagina === t.pagina && !v.folha; });
      if (!vs.length) vs = arr(proj.vistas).filter(function (v) { return v.pagina === t.pagina && v.folha; });
      var soma = {};
      vs.forEach(function (v) {
        arr(v.armacao).forEach(function (a) {
          if (!a.definitiva) return;
          soma[a.n] = (soma[a.n] || 0) + a.quant * (v.multiplicidade || 1);
        });
      });
      if (vs.length) {
        t.barras.forEach(function (b) {
          var q = soma[b.n] || 0;
          add(nomeT, "N" + b.n + " ø" + chaveBitola(b.diam) + " detalhes × relação", q === b.quant, b.quant, q, q === b.quant ? "" : "as chamadas dentro das vistas não somam a relação (vista cortada ou chamada fora do detalhe)");
        });
      }
    });
    /* sapatas: volume e fôrma pelas dimensões da tabela de locação (só sapata prismática) */
    var ps = arr(proj.pilares).filter(function (p) { return p.fundacao && p.fundacao.B; });
    var tabS = arr(proj.tabelas).filter(function (t) { return t.grupo === "sapatas"; })[0];
    if (ps.length && tabS && (tabS.concretoM3 != null || tabS.formaM2 != null)) {
      var prism = ps.every(function (p) { return p.fundacao.h0 === p.fundacao.h1; });
      if (prism) {
        var v = 0, f = 0;
        ps.forEach(function (p) { var F = p.fundacao; v += F.B * F.H * F.h1 / 1e6; f += 2 * (F.B + F.H) * F.h0 / 1e4; });
        if (tabS.concretoM3 != null) add("Sapatas", "volume de concreto (B × H × h)", Math.abs(v - tabS.concretoM3) <= Math.max(0.02, tabS.concretoM3 * 0.01), r2(v), tabS.concretoM3);
        if (tabS.formaM2 != null) add("Sapatas", "área de fôrma (perímetro × h0)", Math.abs(f - tabS.formaM2) <= Math.max(0.05, tabS.formaM2 * 0.01), r2(f), tabS.formaM2);
      } else add("Sapatas", "volume de concreto", true, "—", tabS.concretoM3, "sapata com tronco de pirâmide (h0 ≠ h1): volume do projeto sem recálculo");
    }
    return out;
  }

  function resumoConferencia(c) {
    var ok = 0, falha = 0;
    arr(c).forEach(function (x) { if (x.ok) ok++; else falha++; });
    return { ok: ok, falhas: falha, total: ok + falha };
  }

  /* ------------------------------------------------------------------
   * LISTA DE MATERIAL (só o que está no projeto)
   * ------------------------------------------------------------------ */
  var NOME_GRUPO = { sapatas: "Sapatas", vigas: "Vigas", lajes: "Lajes", pilares: "Pilares", locacao: "Locação", formas: "Fôrmas" };
  function listaMaterial(proj) {
    var aco = {}, conc = [], forma = [], porGrupo = [];
    arr(proj.tabelas).forEach(function (t) {
      var nomeG = (NOME_GRUPO[t.grupo] || t.titulo) + (t.pavimento && t.grupo === "vigas" ? " — " + t.pavimento : "");
      var kgG = 0;
      arr(t.resumo).forEach(function (r) {
        var k = r.aco + "|" + chaveBitola(r.diam);
        var a = aco[k] || (aco[k] = { aco: r.aco, diam: r.diam, m: 0, kg: 0 });
        a.m += r.m; a.kg += r.kg; kgG += r.kg;
      });
      if (t.concretoM3 != null) conc.push({ origem: nomeG, m3: t.concretoM3, classe: t.concretoClasse });
      if (t.formaM2 != null) forma.push({ origem: nomeG, m2: t.formaM2 });
      porGrupo.push({ grupo: nomeG, pagina: t.pagina, acoKg: r2(kgG), concretoM3: t.concretoM3, formaM2: t.formaM2, resumoLido: t.resumoLido });
    });
    var acoL = Object.keys(aco).map(function (k) {
      var a = aco[k];
      /* barra comercial de 12 m: o "+10 %" do resumo já é a perda de corte */
      return { aco: a.aco, diam: a.diam, m: r2(a.m), kg: r2(a.kg), barras12m: Math.ceil(a.m * 1.10 / 12 - 1e-9) };
    }).sort(function (a, b) { return (a.aco < b.aco ? -1 : a.aco > b.aco ? 1 : 0) || a.diam - b.diam; });
    var tot = { acoKg: 0, concretoM3: 0, formaM2: 0 };
    acoL.forEach(function (a) { tot.acoKg += a.kg; });
    conc.forEach(function (c) { tot.concretoM3 += c.m3; });
    forma.forEach(function (f) { tot.formaM2 += f.m2; });
    tot.acoKg = r2(tot.acoKg); tot.concretoM3 = r2(tot.concretoM3); tot.formaM2 = r2(tot.formaM2);
    tot.taxaKgM3 = tot.concretoM3 ? r2(tot.acoKg / tot.concretoM3) : null;
    return { aco: acoL, concreto: conc, forma: forma, porGrupo: porGrupo, totais: tot,
      cobrimentos: arr((proj.especificacoes || {}).cobrimentos), fckMPa: (proj.especificacoes || {}).fckMPa };
  }

  /* ------------------------------------------------------------------
   * CONSULTAS usadas pela tela e pelo elo com o modelo
   * ------------------------------------------------------------------ */
  /* a vista de um elemento ("S5", "V3" do pavimento, "P6") — a de elemento vem antes da folha */
  function vistaDoElemento(proj, nome, pavimento, grupo) {
    var n = limpa(nome).toUpperCase();
    var cands = arr(proj.vistas).filter(function (v) { return !v.folha && v.elementos.indexOf(n) >= 0; });
    if (grupo) { var g = cands.filter(function (v) { return v.grupo === grupo; }); if (g.length) cands = g; }
    if (pavimento) { var p = cands.filter(function (v) { return sem(v.pavimento) === sem(pavimento); }); if (p.length) cands = p; }
    return cands[0] || null;
  }
  /* a barra da relação que uma chamada da vista referencia (N é por prancha) */
  function barraDaChamada(proj, vista, a) {
    var t = arr(proj.tabelas).filter(function (x) { return x.pagina === vista.pagina; })[0];
    if (!t) return null;
    return arr(t.barras).filter(function (b) { return b.n === a.n; })[0] || null;
  }
  /* armação de UM elemento da vista (chamadas definitivas, com peso) */
  function armacaoDaVista(proj, vista) {
    var out = [];
    arr(vista && vista.armacao).forEach(function (a) {
      if (!a.definitiva) return;
      var b = barraDaChamada(proj, vista, a);
      var comp = a.comp === "VAR" ? null : a.comp;
      var ms = massa(a.diam);
      var m = comp != null ? a.quant * comp / 100 : null;
      out.push({ n: a.n, aco: b ? b.aco : "", diam: a.diam, quant: a.quant, espac: a.espac, comp: a.comp, m: m != null ? r2(m) : null,
        kg: m != null && ms != null ? r2(m * ms) : null, texto: a.texto });
    });
    /* UMA LINHA POR POSIÇÃO (N + bitola + C): no desenho a mesma barra aparece em
     * várias chamadas (as duas direções da sapata, cada trecho de estribo do
     * pilar — o P6 tinha N3 seis vezes). Para cortar e dobrar a lista é por
     * posição, com a quantidade somada. */
    var por = {}, lista = [];
    out.forEach(function (l) {
      var k = l.n + "|" + chaveBitola(l.diam) + "|" + l.comp;
      var g = por[k];
      if (!g) { g = por[k] = { n: l.n, aco: l.aco, diam: l.diam, quant: 0, espac: l.espac, comp: l.comp, m: l.m != null ? 0 : null, kg: l.kg != null ? 0 : null, chamadas: [] }; lista.push(g); }
      g.quant += l.quant;
      if (g.espac !== l.espac) g.espac = null;
      if (g.m != null && l.m != null) g.m = r2(g.m + l.m); else g.m = null;
      if (g.kg != null && l.kg != null) g.kg = r2(g.kg + l.kg); else g.kg = null;
      g.chamadas.push(l.texto);
    });
    return lista;
  }
  function cobrimentoDe(proj, tipo) {
    var c = arr((proj.especificacoes || {}).cobrimentos).filter(function (x) { return x.tipo === tipo; })[0];
    return c ? c.cm : null;
  }
  /* tipo do elemento pelo nome (S → sapata, P → pilar, V/VB → viga, L → laje) */
  function tipoDoNome(nome, grupo) {
    var n = limpa(nome).toUpperCase();
    if (/^S\d/.test(n) || /^BL\d/.test(n)) return "sapata";
    if (/^P\d/.test(n)) return "pilar";
    if (/^L\d/.test(n)) return "laje";
    if (/^V[BE]\d/.test(n)) return "viga-baldrame";
    if (/^V\d/.test(n)) return grupo === "vigas-baldrame" ? "viga-baldrame" : "viga";
    return "outro";
  }

  /* validação do que vem do armazenamento (registro corrompido não trava a tela) */
  function valido(p) {
    return !!(p && typeof p === "object" && Array.isArray(p.vistas) && Array.isArray(p.tabelas) && Array.isArray(p.pilares));
  }

  var EstrutPDF = {
    VERSAO: VERSAO, MASSA: MASSA,
    num: num, massa: massa, chaveBitola: chaveBitola,
    itensDaPagina: itensDaPagina, linhas: linhas, anotacoes: anotacoes,
    tabelasDaPagina: lerTabelasAco, fichaPagina: fichaPagina, especificacoes: especificacoes,
    vistasDaPagina: vistasDaPagina, ler: ler, conferir: conferir, resumoConferencia: resumoConferencia,
    listaMaterial: listaMaterial, vistaDoElemento: vistaDoElemento, armacaoDaVista: armacaoDaVista,
    cobrimentoDe: cobrimentoDe, tipoDoNome: tipoDoNome, tipoCobrimento: tipoCobrimento, valido: valido,
    elementosDoTitulo: elementosDoTitulo
  };
  global.EstrutPDF = EstrutPDF;
  if (typeof module !== "undefined" && module.exports) module.exports = EstrutPDF;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

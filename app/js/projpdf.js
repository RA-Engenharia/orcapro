/* =====================================================================
 * projpdf.js — PDF VETORIAL DE ARQUITETURA como fonte do mesmo pipeline do DXF (F7). Motor PURO. window.ProjPdf.
 *
 * Entrada: os traços da página já extraídos pelo js/pdfvetor.js (em PONTOS de PDF, com a ESPESSURA do traço e a
 * marca `curva` nos pedaços de curva) + os textos da página (se o PDF tiver texto: muitas pranchas do AutoCAD saem
 * com a fonte SHX virada em traço e NÃO têm texto nenhum).
 * Saída: o mesmo modelo do js/projler.js (elementos medidos + ambientes + pavimentos), para o mesmo orçamento.
 *
 * UM CLIQUE, ZERO PERGUNTAS — o que o motor decide sozinho:
 *   · A CANETA DA PAREDE: parede cortada é desenhada com traço grosso. Para cada espessura de traço que pesa na
 *     página, o detector de pares paralelos (js/planta3d.js) roda; a caneta que dá mais metros de parede com
 *     espessura de parede comum vence.
 *   · A ESCALA: a COTA manda (mediana de valor escrito ÷ comprimento, quando o PDF tem texto de cota junto da linha);
 *     sem cota legível, a ESCALA DO CARIMBO («ESCALA 1/75», «1:50») confirma; sem as duas, a PLAUSIBILIDADE:
 *     entre 1/50, 1/75, 1/100 e 1/125, a que faz as paredes caírem nas espessuras comuns (9–25 cm). A conferência
 *     registra de onde veio e, se o carimbo divergir da cota, que valeu a cota.
 *   · Portas (arco + vão), janelas (traço no vão), ambientes (rótulo dentro do recinto; sem rótulo, «sem nome»):
 *     tudo pelo js/projler.js, que recebe a página convertida para metros.
 * Sem IA. ES5.
 * ===================================================================== */
(function (global) {
  "use strict";

  function mod(g, c) { if (global[g]) return global[g]; if (typeof require === "function") { try { return require(c); } catch (e) { return null; } } return null; }
  var P3 = mod("Planta3D", "./planta3d.js"), PL = mod("ProjLer", "./projler.js");
  var PT_M = 0.0254 / 72;   /* 1 ponto de PDF em metros de PAPEL */
  var ESCALAS = [50, 75, 100, 125];
  /* espessuras comuns de parede acabada e o PESO de cada uma (a de 15 cm é a mais frequente no Brasil; 25 cm existe,
     mas é rara). O peso desempata escalas que dão espessuras «comuns» nas duas (1/75 → 15 cm × 1/125 → 25 cm). */
  var COMUNS = [[0.09, 0.5], [0.10, 0.6], [0.115, 0.6], [0.12, 0.7], [0.14, 0.9], [0.15, 1.0], [0.19, 0.6], [0.20, 0.6], [0.25, 0.35]];
  function len(s) { var dx = s.x2 - s.x1, dy = s.y2 - s.y1; return Math.sqrt(dx * dx + dy * dy); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function comum(e) { for (var i = 0; i < COMUNS.length; i++) if (Math.abs(e - COMUNS[i][0]) <= 0.006) return COMUNS[i][1]; return 0; }

  /* escala escrita: «ESCALA 1/75», «ESC. 1:50» */
  function escalaDoTexto(textos) {
    var achou = {};
    (textos || []).forEach(function (t) { var m = /(?:esc(?:ala)?\.?\s*:?\s*)?1\s*[\/:]\s*(\d{2,4})\b/i.exec(t.s || t.txt || ""); if (m && /esc|^\s*1\s*[\/:]/i.test(t.s || t.txt || "")) { var d = +m[1]; if (d >= 10 && d <= 1000) achou[d] = (achou[d] || 0) + 1; } });
    var ks = Object.keys(achou).sort(function (a, b) { return achou[b] - achou[a]; });
    return ks.length ? +ks[0] : 0;
  }

  /* caneta e escala pela plausibilidade das paredes */
  function escolher(segs, opts) {
    opts = opts || {};
    P3 = P3 || mod("Planta3D", "./planta3d.js");   /* na chamada: a ordem do grupo «bim» não garante o planta3d antes (ver projler) */
    var porLarg = {};
    (segs || []).forEach(function (s) { if (s.curva) return; var k = Math.round((s.largura || 0) * 100) / 100; (porLarg[k] = porLarg[k] || { L: 0, segs: [] }); porLarg[k].L += len(s); porLarg[k].segs.push(s); });
    var cand = Object.keys(porLarg).filter(function (k) { return +k > 0; }).sort(function (a, b) { return porLarg[b].L - porLarg[a].L; }).slice(0, opts.nCanetas || 8);
    var escalas = opts.escala ? [opts.escala] : ESCALAS, res = [], melhor = null;
    cand.forEach(function (k) {
      var ss = porLarg[k].segs.filter(function (s) { return len(s) > 2; });
      if (ss.length < 10) return;
      if (ss.length > 6000) { var passo = Math.ceil(ss.length / 6000); ss = ss.filter(function (s, ix) { return ix % passo === 0; }); }   /* teto de custo (pares são quadráticos) */
      escalas.forEach(function (D) {
        var f = PT_M * D, sm = ss.map(function (s) { return { x1: s.x1 * f, y1: s.y1 * f, x2: s.x2 * f, y2: s.y2 * f, layer: "c" }; });
        var r = P3.detectarParedes(sm, { espMin: 0.06, espMax: 0.40 });
        var Lc = 0, Lt = 0;
        var Lp = 0;
        r.paredes.forEach(function (p) { if (p.ligada === false) return; Lt += p.comprimento; var w = comum(p.espessura); if (w) { Lc += p.comprimento; Lp += p.comprimento * w; } });
        /* nota no PAPEL (÷ escala): metros reais crescem com a escala e não podem decidir sozinhos */
        var item = { caneta: +k, D: D, fator: f, metrosComuns: r2(Lc), metros: r2(Lt), score: Lp / D };
        res.push(item);
        if (!melhor || item.score > melhor.score) melhor = item;
      });
    });
    return { melhor: melhor, candidatos: res.sort(function (a, b) { return b.score - a.score; }) };
  }

  /* página do pdfvetor → estrutura do dxf.js (metros) + classificação; depois o projler */
  function lerPagina(pg, opts) {
    opts = opts || {};
    P3 = P3 || mod("Planta3D", "./planta3d.js"); PL = PL || mod("ProjLer", "./projler.js");
    if (!P3 || !PL) return { ok: false, erro: "motores de planta não carregaram" };
    var segs = pg.segmentos || pg.segs || [], textos = pg.textos || [];
    if (!segs.length) return { ok: false, erro: "a página não tem traço vetorial (é imagem/escaneada): use o caminho de imagem" };
    var avisos = [];
    var escTxt = escalaDoTexto(textos);
    var esc = escolher(segs, { escala: opts.escala || 0 });
    var m = esc.melhor;
    if (!m || m.metrosComuns < 3) return { ok: false, erro: "nenhuma caneta da página forma paredes plausíveis em 1/50–1/125", escolha: esc };
    var origem = "plausibilidade";
    if (escTxt && !opts.escala) {
      var comTxt = escolher(segs, { escala: escTxt }).melhor;
      if (comTxt && comTxt.metrosComuns >= 0.6 * m.metrosComuns) { if (escTxt !== m.D) avisos.push("escala do carimbo 1/" + escTxt + " usada (a plausibilidade sozinha preferia 1/" + m.D + ")"); m = comTxt; origem = "carimbo"; }
      else avisos.push("escala do carimbo 1/" + escTxt + " não confere com as paredes; usada 1/" + m.D + " pela espessura das paredes");
    }
    if (!textos.length) avisos.push("a página não tem texto (fonte virada em traço): sem cotas, títulos nem nomes de ambiente legíveis — escala pela espessura das paredes, ambientes sem nome");
    var f = m.fator, larg = m.caneta, camadaParede = "pdf-parede";
    var segM = segs.map(function (s) {
      var parede = !s.curva && Math.abs((s.largura || 0) - larg) < 0.006;
      var o = { x1: s.x1 * f, y1: -s.y1 * f, x2: s.x2 * f, y2: -s.y2 * f, layer: parede ? camadaParede : "pdf-" + (Math.round((s.largura || 0) * 100) / 100), curva: !!s.curva };
      return o;
    });
    var layers = {}; segM.forEach(function (s) { layers[s.layer] = (layers[s.layer] || 0) + 1; });
    var tx = textos.map(function (t) { return { txt: t.s || t.txt || "", x: (t.x || 0) * f, y: -(t.y || 0) * f, layer: "pdf-texto" }; });
    var dx = { segmentos: segM, textos: tx, layers: layers, inserts: [], hachuras: [], cotas: [], unidade: { origem: "pdf-" + origem, fator: f } };
    var cam = {}; Object.keys(layers).forEach(function (L) { cam[L] = { classe: L === camadaParede ? "parede" : "anotacao", sub: "", fonte: L === camadaParede ? "caneta" : "", regra: L === camadaParede ? "traço de " + larg + " pt: a caneta que forma paredes plausíveis" : "" }; });
    cam["pdf-texto"] = { classe: "ambiente-rotulo", sub: "", fonte: "pdf", regra: "texto do PDF" };
    var cls = { camadas: cam, blocos: {}, naoReconhecidos: { camadas: [], blocos: [] }, resumo: { camadas: Object.keys(cam).length } };
    var md = PL.ler(dx, cls, { alturas: opts.alturas, peDireitoPadrao: opts.peDireitoPadrao, celVista: opts.celVista || 3 });
    if (!md.ok) return md;
    md.fonte = "pdf";
    md.pdf = { caneta: larg, escala: "1/" + m.D, origemEscala: origem, fator: f, candidatos: esc.candidatos.slice(0, 8) };
    md.avisos = avisos.concat(md.avisos || []);
    md.elementos.forEach(function (e) { e.porque = "PDF, escala 1/" + m.D + " (" + origem + "), caneta " + larg + " pt · " + e.porque; });
    return md;
  }

  var ProjPdf = { escolher: escolher, lerPagina: lerPagina, escalaDoTexto: escalaDoTexto, PT_M: PT_M };
  global.ProjPdf = ProjPdf;
  if (typeof module !== "undefined" && module.exports) module.exports = ProjPdf;
})(typeof window !== "undefined" ? window : globalThis);

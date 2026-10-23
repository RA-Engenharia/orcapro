/* =====================================================================
 * pranchasdxf.js — O DXF DAS PRANCHAS DO GALPÃO (metálica) E DA MADEIRA (21/10/2026)
 *
 * Motor PURO (ES5, sem DOM). As pranchas do galpão (js/acopranchas.js) e da madeira (js/madpranchas.js) saíam só em
 * SVG/PDF; agora cada folha também sai em DXF R2000, em mm de papel 1:1, a partir do MESMO SVG (o que a tela e o PDF
 * mostram é o que o DXF leva — nenhum desenho é refeito aqui):
 *
 *   PranchasDxf.dxfDaFolha(folha)       → o texto do DXF de UMA folha (folha = item de AcoPranchas/MadPranchas.gerar().folhas)
 *   PranchasDxf.arquivos(saida, opcoes) → { ok, arquivos: { "<nome>.dxf": texto }, nomes, avisos, resumo }
 *
 * O QUE O DXF TEM (padrão RA de detalhamento, v2.x = padrão visual do TQS; o carimbo RA não muda):
 *   - LAYERS do Padrão RA (EST-FORMA-CORTE, EST-FORMA-VISTA, EST-COTA, EST-EIXO, EST-TEXTO, EST-TITULO…), cada uma com a PENA
 *     (espessura de linha da layer, grupo 370) e a COR do CTB do Padrão — quem plota por CTB sai na pena certa. A camada do
 *     desenho (MET-*, MAD-*) é a que o SVG traz em `data-cam`; a tabela camada → layer é a PADRAO_ACO / PADRAO_MAD das pranchas
 *     (vai junto na folha, em folha.dxf.camadas). Pendência (o que o cálculo não decidiu) vai em vermelho, na layer EST-PENDENCIA;
 *   - TEXTOS como TEXT (não como traços), estilo RA_TQS (romans.shx); Ø vira %%c (o SHX não tem o Ø);
 *   - COTAS como DIMENSION de verdade (o AutoCAD mede de novo e edita), uma por trecho, com o texto do desenho — o SVG marca cada
 *     cota num grupo `data-dimgrp`; sem o grupo (ou com o grupo torto) a cota cai para traços soltos, nunca some;
 *   - o CARIMBO RA pelas primitivas do js/prancha.js (carimboRA), nas layers RA-CARIMBO-* do gabarito, com "nn/NN" da folha;
 *   - nada de sobreposição NOVA: posição, corpo e quebra de cada texto são os do SVG (que o teste do desenho já confere);
 *   - DWG não existe no sistema (BimDxf.DWG): o AutoCAD abre o DXF e salva em DWG.
 *
 * Reusa o BimDxf (novoDoc/escrever e o svgParaDxf no modo `camadaPor`, js/bimdxf.js). A marca "Versão de teste" NÃO é
 * posta aqui: quem baixa passa o arquivo por TesteModulo.marcarArquivo (a tela do cálculo já faz).
 * Teste: node tools/test-pranchas-dxf.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* módulo ausente */ } }
    return null;
  }
  function BD() { return dep("BimDxf", "./bimdxf.js"); }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function PD() { return dep("PadraoDet", "./padraodet.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return isFinite(x) ? x : d; }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }

  /* a letra do SVG é o corpo; a altura do TEXT do DXF é a da maiúscula (a mesma conta do DXF da estrutura desenhada) */
  var ALT = 0.72;
  var VERMELHO = "#c00000";
  var PEND = "EST-PENDENCIA", MOLDURA = "FOLHA-MOLDURA";

  function atributos(s) { var o = {}, re = /([\w:-]+)="([^"]*)"/g, m; while ((m = re.exec(s))) o[m[1]] = m[2]; return o; }
  function desesc(s) { return txt(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"); }
  /* códigos de controle do AutoCAD: o romans.shx não tem Ø, ° nem ± */
  function paraTexto(s) { return txt(s).replace(/Ø/g, "%%c").replace(/ø/g, "%%c").replace(/°/g, "%%d").replace(/±/g, "%%p"); }

  /* ------------------------------------------------------------ layers */
  /* cada layer do Padrão RA entra no doc com a pena (mm), a cor ACI e o tipo de linha que o Padrão manda */
  function resolvedor(doc, meta) {
    var P = PD(), base = null, cache = {}, mapa = meta.camadas || {};
    try { base = P ? P.normPadrao(meta.padrao || P.padraoRA()) : null; } catch (e) { base = null; }
    function est(lay) {
      if (cache[lay]) return cache[lay];
      var l = null; try { l = base ? P.linhaDe(base, lay) : null; } catch (e) { l = null; }
      var lt = l && l.dash ? (lay === "EST-EIXO" ? "TRACO-PONTO" : "TRACEJADO") : "CONTINUOUS";
      cache[lay] = doc.camada(lay, l ? l.mm : 0.25, lt, l ? l.aci : 7);
      return cache[lay];
    }
    function pend() { return cache[PEND] || (cache[PEND] = doc.camada(PEND, 0.25, "CONTINUOUS", 1)); }
    function moldura() { return cache[MOLDURA] || (cache[MOLDURA] = doc.camada(MOLDURA, 0.5, "CONTINUOUS", 7)); }
    return {
      est: est, pend: pend,
      /* camada do desenho (MET-*, MAD-*) → layer do Padrão RA */
      de: function (cam) {
        cam = txt(cam);
        if (/-MOLDURA$/.test(cam)) return moldura();
        if (/-PEND(T)?$/.test(cam)) return pend();
        return est(mapa[cam] || "EST-LINHA-FINA");
      }
    };
  }
  /* a função que o BimDxf.svgParaDxf (modo camadaPor) chama para cada elemento do SVG */
  function camadaPorDe(R, meta) {
    var tituloH = num(meta.tituloH, 99);
    return function (tag, a) {
      var fill = txt(a.fill).toLowerCase(), st = txt(a.stroke).toLowerCase(), verm = fill === VERMELHO || st === VERMELHO;
      if (tag === "text") return verm ? R.pend() : R.est(num(a["font-size"], 0) >= tituloH - 0.01 ? "EST-TITULO" : "EST-TEXTO");
      if (tag === "fill") {
        if (verm) return R.pend();
        return (fill === "#000" || fill === "#000000" || fill === "black") ? R.est("EST-FORMA-CORTE") : R.est("EST-HACHURA");
      }
      if (a["data-cam"]) return R.de(a["data-cam"]);
      /* traço branco sem camada = apagador do SVG (esconde o que passa por baixo): no CAD não existe fundo */
      if (st === "#fff" || st === "#ffffff" || st === "white") return null;
      return R.est("EST-LINHA-FINA");
    };
  }

  /* ------------------------------------------------------------ cotas (DIMENSION) */
  function pontos(s) { return txt(s).trim().split(/\s+/).filter(Boolean).map(function (q) { var v = q.split(","); return [+v[0], +v[1]]; }); }
  function textosDe(inner) { var out = [], re = /<text\b([^>]*)>([^<]*)<\/text>/g, m; while ((m = re.exec(inner))) out.push({ a: atributos(m[1]), s: desesc(m[2]) }); return out; }
  /* entidade TEXT (em coordenadas do DXF) de um <text> do SVG */
  function textoEnt(t, camada, H) {
    var a = t.a, mr = /rotate\(([-\d.eE]+)/.exec(a.transform || ""), fs = num(a["font-size"], 2.5), anc = a["text-anchor"];
    return { t: "TEXT", camada: camada, x: num(a.x, 0), y: H - num(a.y, 0), h: fs * ALT, s: paraTexto(t.s), ang: -(mr ? +mr[1] : 0), centro: anc === "middle", direita: anc === "end" };
  }
  /* troca cada grupo `data-dimgrp` por DIMENSION; devolve o SVG sem as linhas e textos dessas cotas (o que sobra do grupo —
     o círculo de origem da cota acumulada — continua no desenho) */
  /* ⚠ O QUE A COTA MEDE (revisão adversarial 21/10/2026): o DXF é a folha em mm de papel 1:1, mas o texto da cota é a medida
     da OBRA (5714 mm a 1:75; 288 cm a 1:30). Com DIMLFAC 1 a DIMENSION media o papel: quem tirasse o texto forçado, ou
     esticasse a cota no AutoCAD, via "76" no lugar de "5714". O fator de cada cota é o da escala da vista dela (uma folha
     mistura escalas — "INDICADA"): sai do próprio texto ÷ a medida no papel, aceito só se for uma escala de desenho (ou
     ampliação 2:1, 5:1…) e se a medida × fator cair a até 1 unidade do texto. Texto que não é número (ou fator que não fecha) fica no estilo 1:1, como antes. */
  var FATORES = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 3, 4, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
  function numeroDaCota(s) {
    var t = txt(s).replace(/\s+/g, "");
    if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(t)) return null;
    return Number(t.replace(/\./g, "").replace(",", "."));
  }
  function fatorDaCota(s, medida) {
    var v = numeroDaCota(s), m = num(medida, 0), melhor = null;
    if (v == null || !(v > 0) || !(m > 1e-6)) return 1;
    var casas = (txt(s).split(",")[1] || "").length, tol = Math.pow(10, -casas);
    FATORES.forEach(function (F) {
      var d = Math.abs(m * F - v);
      /* folga: 1 na última casa do texto (a cadeia de cotas redistribui o arredondamento para fechar o total: 5714 + 5715 + …)
         e a medida do papel, que vem do SVG com 3 casas (±0,002 mm × fator); entre dois fatores, o mais perto */
      if (d <= tol + 0.002 * F + 1e-9 && (melhor === null || d < melhor.d)) melhor = { F: F, d: d };
    });
    return melhor ? melhor.F : 1;
  }
  function cotas(svg, doc, R, H, avisos) {
    var re = /<g data-dimgrp="(\w+)" data-pts="([^"]*)" data-off="([^"]*)" data-seg="([^"]*)" data-ext="([^"]*)" data-e="([^"]*)">([\s\S]*?)<\/g>/g, n = 0, estilos = {}, camCota = null;
    var resto = svg.replace(re, function (_, tipo, ptsS, offS, segS, extS, eS, inner) {
      var P = pontos(ptsS), off = num(offS, NaN), segs = segS ? segS.split(",").map(Number) : [], tx = textosDe(inner);
      var ext = extS.split(",").map(function (v) { return v === "x" ? null : num(v, null); }), ee = eS.split(",").map(function (v) { return num(v, 1.2); });
      var L = P.length > 1 ? hip(P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]) : 0;
      if (P.length < 2 || !isFinite(off) || L < 1e-6 || tx.length !== segs.length) { avisos.push("Uma cota (" + tipo + ") não pôde virar DIMENSION: saiu em traços soltos."); return inner; }
      var ux = (P[P.length - 1][0] - P[0][0]) / L, uy = (P[P.length - 1][1] - P[0][1]) / L, nx = uy, ny = -ux, sg = off >= 0 ? 1 : -1;
      var Q = P.map(function (p) { return [p[0] + nx * off, p[1] + ny * off]; });
      var ang = Math.atan2(-uy, ux) * 180 / Math.PI;
      if (ang > 90.0001) ang -= 180; else if (ang <= -90.0001) ang += 180;
      camCota = camCota || R.est("EST-COTA");
      var hTxt = num(tx[0] && tx[0].a["font-size"], 2.5) * ALT;
      /* um estilo por fator (escala da vista) e casas do texto: "RA mm" (1:1, o de antes), "RA mm x75", "RA mm x3 ,1"… */
      function estiloDe(s, medida) {
        var fa = fatorDaCota(s, medida), ca = fa === 1 && numeroDaCota(s) == null ? 0 : (txt(s).replace(/\s+/g, "").split(",")[1] || "").length;
        var nome = "RA mm" + (fa !== 1 ? " x" + String(fa).replace(".", ",") : "") + (ca ? " ," + ca : "");
        if (!estilos[nome]) estilos[nome] = doc.estiloCota(nome, { escala: 1, fator: fa, texto: hTxt, casas: ca, traco: 1.1 });
        return estilos[nome];
      }
      function F(p) { return [p[0], H - p[1]]; }
      segs.forEach(function (i, k) {
        var ia = tipo === "acum" ? 0 : i, ib = tipo === "acum" ? i : i + 1;
        if (ia < 0 || ib >= P.length || ia === ib) { doc.add(textoEnt(tx[k], camCota, H)); return; }   /* sem trecho a medir (o "0" da origem): fica só o texto */
        var graf = [];
        function ln(x1, y1, x2, y2) { var A = F([x1, y1]), B = F([x2, y2]); graf.push({ t: "LINE", camada: camCota, p: [A[0], A[1], B[0], B[1]] }); }
        function tique(q) { var tx2 = (ux + nx) / Math.SQRT2, ty2 = (uy + ny) / Math.SQRT2; ln(q[0] - tx2 * 1.1, q[1] - ty2 * 1.1, q[0] + tx2 * 1.1, q[1] + ty2 * 1.1); }
        /* as linhas de chamada e a linha de cota como o desenho as fez: folga em cada ponto (ou nenhuma) e o quanto a linha passa das pontas */
        [ia, ib].forEach(function (j) { if (ext[j] != null) ln(P[j][0] + nx * ext[j] * sg, P[j][1] + ny * ext[j] * sg, Q[j][0] + nx * 1.5 * sg, Q[j][1] + ny * 1.5 * sg); });
        var e0 = ia === 0 ? ee[0] : 0, e1 = ib === P.length - 1 ? ee[1] : 0;
        ln(Q[ia][0] - ux * e0, Q[ia][1] - uy * e0, Q[ib][0] + ux * e1, Q[ib][1] + uy * e1);
        if (tipo !== "acum") tique(Q[ia]);
        tique(Q[ib]);
        graf.push(textoEnt(tx[k], camCota, H));
        var med = hip(P[ib][0] - P[ia][0], P[ib][1] - P[ia][1]);
        doc.cota(camCota, estiloDe(tx[k].s, med), F(P[ia]), F(P[ib]), F(Q[ia]), ang, med, paraTexto(tx[k].s), graf);
        n++;
      });
      return inner.replace(/<line\b[^>]*\/>/g, "").replace(/<text\b[^>]*>[^<]*<\/text>/g, "");
    });
    return { svg: resto, n: n };
  }

  /* ------------------------------------------------------------ carimbo RA */
  function carimbo(doc, meta, H) {
    var P = PR(), L = P.carimboRA(meta.pr, meta.folha, null, meta.empresa || null, meta.geo, { logos: meta.logo ? 1 : 0 }), cam = P.CAMADAS_CARIMBO_RA;
    Object.keys(cam).forEach(function (nome) { doc.especificar(nome, cam[nome][1], null, cam[nome][0]); });
    function px(x) { return L.x + x; }
    function py(y) { return H - (L.y + y); }
    L.retangulos.forEach(function (r) { doc.poli(r.camada, [[px(r.x), py(r.y)], [px(r.x + r.w), py(r.y)], [px(r.x + r.w), py(r.y + r.h)], [px(r.x), py(r.y + r.h)]], true); });
    L.linhas.forEach(function (l) { doc.linha(l.camada, px(l.x1), py(l.y1), px(l.x2), py(l.y2)); });
    L.logos.forEach(function (b) { doc.texto("RA-CARIMBO-LOGO", px(b.x + b.w / 2), py(b.y + b.h / 2) - 1.25 * L.k, 2.5 * L.k, "[LOGO]", 0, true); });
    L.textos.forEach(function (t) { doc.texto(t.camada, px(t.x), py(t.y), t.h, t.campo === "folha" && meta.rotulo ? meta.rotulo : t.s, 0, t.al === "C"); });
  }

  /* ------------------------------------------------------------ a folha */
  function dxfDaFolha(folha, op) {
    var X = BD(), P = PR(); op = op || {};
    if (!X || !X.novoDoc || !X.svgParaDxf) throw new Error("O motor de DXF (js/bimdxf.js) não carregou.");
    if (!P || !P.carimboRA) throw new Error("O motor de pranchas (js/prancha.js) não carregou.");
    if (!folha || !folha.svg) throw new Error("Folha sem desenho.");
    var meta = folha.dxf;
    if (!meta || !meta.geo || !meta.pr) throw new Error("A folha não traz os dados do carimbo (folha.dxf): gere as pranchas de novo.");
    var H = meta.geo.papel.h, doc = X.novoDoc({ unidade: "mm" }), avisos = arr(op.avisos);
    doc.escala = 1;
    var R = resolvedor(doc, meta);
    /* o carimbo do SVG sai (o DXF refaz o carimbo RA pelas primitivas do prancha.js, nas layers do gabarito) */
    var svg = folha.svg.replace(/<g [^>]*data-carimbo="RA"[^>]*>[\s\S]*?<\/g>/, "");
    var c = cotas(svg, doc, R, H, avisos);
    X.svgParaDxf(c.svg, doc, { pt: function (x, y) { return [x, H - y]; }, s: 1 }, { camadaPor: camadaPorDe(R, meta), alturaTexto: ALT, paraTexto: paraTexto });
    carimbo(doc, meta, H);
    var s = X.escrever(doc);
    /* a letra do Padrão RA: RomanS (romans.shx), estilo RA_TQS — o mesmo texto do DXF, só o estilo trocado (como o DXF da estrutura desenhada) */
    return s.replace(/(\r?\n)RA-ARIAL(\r?\n)/g, "$1RA_TQS$2").replace(/(\r?\n)arial\.ttf(\r?\n)/g, "$1romans.shx$2");
  }

  /* ------------------------------------------------------------ o jogo inteiro */
  function limpo(s) {
    var t = txt(s);
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* sem normalize */ }
    return t.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  function nomeArquivo(f, i) { return (limpo((f.numero || ("folha-" + (i + 1))) + "-" + (f.titulo || "")).slice(0, 90) || ("folha-" + (i + 1))) + ".dxf"; }
  /* saida = o devolvido por AcoPranchas.gerar / MadPranchas.gerar ({ ok, folhas, avisos }) */
  function arquivos(saida, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], out = {}, nomes = [], falhas = [];
    if (!saida || !saida.ok || !arr(saida.folhas).length) return { ok: false, arquivos: {}, nomes: [], avisos: ["Sem pranchas geradas: gere as pranchas antes do DXF."], resumo: null };
    saida.folhas.forEach(function (f, i) {
      var nome = nomeArquivo(f, i), k = 2;
      while (out[nome]) { nome = nome.replace(/(-\d+)?\.dxf$/, "-" + (k++) + ".dxf"); }
      try { out[nome] = dxfDaFolha(f, { avisos: avisos }); nomes.push(nome); }
      catch (e) { falhas.push((f.numero || ("folha " + (i + 1))) + ": " + (e && e.message ? e.message : e)); }
    });
    falhas.forEach(function (m) { avisos.push("DXF não gerado - " + m); });
    return { ok: nomes.length > 0 && !falhas.length, arquivos: out, nomes: nomes, avisos: avisos, resumo: { folhas: saida.folhas.length, dxf: nomes.length, bytes: nomes.reduce(function (t, k) { return t + out[k].length; }, 0) } };
  }

  var PranchasDxf = { dxfDaFolha: dxfDaFolha, arquivos: arquivos, nomeArquivo: nomeArquivo, paraTexto: paraTexto, PENDENCIA: PEND };
  global.PranchasDxf = PranchasDxf;
  if (typeof module !== "undefined" && module.exports) module.exports = PranchasDxf;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

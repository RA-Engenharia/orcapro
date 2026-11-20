/* =====================================================================
 * woodframequadro.js — QUADRO DE MADEIRA (WOOD FRAME) DA PAREDE DO BIM.
 * Motor PURO (ES5, sem DOM, sem three.js, Node-testável). 20/11/2026.
 *
 * Pedido do Rogério: a casa é modelada pela arquitetura normal, a parede é
 * paramétrica e, quando a parede (ou o vão) é esticada, o quadro se refaz sozinho:
 * guias, montantes no espaçamento, ombreiras, vergas, cripples, peitoril,
 * bloqueadores, placas de OSB, fixações, membrana e todas as camadas. As camadas
 * e os montantes aparecem na PLANTA, com o espaçamento certo.
 *
 * ENTRADA  uma parede do modelador (caixa B2 com `tipoParede.wf`, js/alvtipos.js —
 *          tipos "wf-*") + os vãos dela (BimEdit.vaosNaParede, `aceitos`).
 *          daCaixa() converte; gerar() é o motor; paraParede() põe no CACHE por
 *          chave (esticou a parede, moveu o vão ou mudou o espaçamento = chave nova =
 *          quadro novo; nada mudou = o MESMO objeto).
 * SAÍDA    peças com id estável (posição em mm no id), seção, comprimento e posição
 *          3D LOCAL da parede: u ao longo do eixo (0 = ponta inicial da caixa), y a
 *          partir da base, w na espessura (w < 0 = face "fora", como no js/bimarq.js).
 *          emMundo() leva a peça ao mundo (caixa {x,y,z,rotY,comp,alt,esp}) — é o que
 *          o js/bim.js desenha e o que o corte da planta fatia.
 *
 * COMO O QUADRO É ARMADO (critérios RA, escritos aqui para a conferência):
 *   · Guia inferior (38 mm de altura) cortada nas PORTAS; guia superior DUPLA.
 *     Montante: altura da parede − 3 guias (uma de baixo + duas de cima).
 *   · Montantes alinhados a partir de UMA PONTA (origem "ini" ou "fim"): o de
 *     ponta rente e os demais com o CENTRO em k × espaçamento (400 mm de padrão), de
 *     modo que as juntas do OSB (a cada 1,20 m, a partir da mesma ponta) caem no
 *     centro de um montante. Montante que encosta no de ponta ou no de canto é cortado.
 *   · Canto em L (ponta unida a outra parede): "3montantes" = 3 montantes lado a lado
 *     (2 de canto + 1 de pregação do acabamento); "bloco" = 2 montantes com bloco
 *     espaçador entre eles. É um arranjo SIMPLIFICADO — o californiano/em C é fase 2.
 *   · Encontro em T/X no meio da parede: 2 montantes ladeando a parede que chega,
 *     com blocos de pregação entre eles a cada 0,60 m.
 *   · Cada vão (abertura bruta = x0..x1): 2 ombreiras-rei (king) fora, 2 ombreiras-jack
 *     (trimmer) dentro, VERGA dupla sobre os jacks (a seção vem da tabela abaixo),
 *     cripples acima da verga e — janela — PEITORIL com cripples abaixo.
 *   · Bloqueadores a meia altura quando a parede passa de 2,40 m (parâmetro) e, para a
 *     junta horizontal do OSB, na cota da altura da chapa.
 *   · OSB modulado em 1,20 × 2,40 m, a partir da mesma ponta, cortado nos vãos.
 *
 * ⚠ VERGA — PRÉ-DIMENSIONAMENTO, A CONFIRMAR NO CÁLCULO. Tabela por vão livre
 *   (≤ 0,90 / 1,50 / 2,10 / 3,00 m) com as seções do catálogo Nibra (madeira serrada para
 *   Wood Framing: 50×100, 50×150, 50×200, 50×250, 50×300 — MEDIDAS BRUTAS, o próprio
 *   catálogo avisa). A seção FINAL (38×89, 38×140, 38×184, 38×235, 38×286) é a premissa de
 *   beneficiamento usual das peças de 2" — NÃO consta do catálogo: confirmar com o
 *   fornecedor. Não há valor normativo aqui: a NBR 7190-1:2022 e a Diretriz SINAT nº 005
 *   (sistemas leves estruturados em peças de madeira) são a referência para o cálculo
 *   de verdade; esta tabela é CRITÉRIO RA até esse cálculo. Vão acima de 3,00 m sai
 *   "fora da tabela" (aviso) e exige o cálculo.
 *
 * QUANTITATIVO: peças (por seção), OSB (chapas), pregos, parafusos, chumbadores, hold-downs,
 * membrana (m², com sobreposição), fita, selante, espuma, lã, gesso e as demais camadas.
 * Nada tem código SINAPI aqui: o item sai `orcarAParte` (pendente) — nunca código inventado.
 *
 * Teste: node tools/test-woodframe.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function mm(v) { return Math.round(v * 1000); }
  /* teto com tolerância: 7,2 / 0,15 dá 48,00000000000001 em ponto flutuante — sem isso o quantitativo ganha 1 prego fantasma por chapa */
  function ceilT(v) { return Math.ceil(v - 1e-9); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function virg(v, c) { c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  /* ------------------------------------------------ parâmetros (do TIPO, e da parede se ela trouxer) */
  var PADRAO = {
    espac: 400,                 /* mm entre eixos dos montantes (400 ou 600) */
    montante: [38, 89],         /* mm: [espessura ao longo da parede, profundidade] */
    osbE: 11.1,                 /* mm (11,1 ou 9,5) */
    canto: "3montantes",        /* "3montantes" | "bloco" */
    origem: "ini",              /* de qual ponta os montantes e o OSB são alinhados: "ini" | "fim" */
    blocoAlt: 2400,             /* mm — acima desta altura entra a fiada de bloqueadores a meia altura */
    osbModulo: [1200, 2400],    /* mm — chapa de OSB (largura × altura) */
    espOsbBorda: 150,           /* mm — fixação do OSB na borda */
    espOsbCampo: 300,           /* mm — fixação do OSB no campo */
    guiaCompMax: 4800,          /* mm — comprimento máximo de COMPRA da guia superior (emenda sobre montante); a confirmar com o fornecedor */
    espChumbador: 1200,         /* mm — chumbador na guia inferior (e hold-down nas pontas e cantos) */
    espParafusoGesso: 250,      /* mm — parafuso do gesso ao longo de cada montante (critério RA) */
    sobreposicaoMembrana: 0.10, /* fração — sobreposição da membrana (critério RA: 10 %) */
    pregosPorExtremidade: 2,    /* pregos por ponta de montante (topo e base) */
    espPregoGuiaSup: 600,       /* mm — prego entre as duas guias superiores */
    espPregoVerga: 300,         /* mm — prego entre as peças da verga (2 fileiras) */
    espBlocoEncontro: 600       /* mm — bloco de pregação entre os montantes do encontro T/X */
  };

  /* verga: vão livre máximo (m) → seção final [espessura, altura] mm e a seção de COMPRA (medida bruta do catálogo Nibra) */
  var VERGAS = [
    { ate: 0.90, secao: [38, 89],  compra: "50x100" },
    { ate: 1.50, secao: [38, 140], compra: "50x150" },
    { ate: 2.10, secao: [38, 184], compra: "50x200" },
    { ate: 3.00, secao: [38, 235], compra: "50x250" }
  ];
  var VERGA_ACIMA = { secao: [38, 286], compra: "50x300" };
  var VERGAS_NOTA = "Pré-dimensionamento (critério RA), a confirmar no cálculo — referências: NBR 7190-1:2022 e Diretriz SINAT nº 005. As seções de compra são as do catálogo Nibra (medida bruta); a seção final por beneficiamento é premissa a confirmar com o fornecedor.";

  function params(wfTipo, wfInst) {
    var P = {}, k;
    for (k in PADRAO) if (Object.prototype.hasOwnProperty.call(PADRAO, k)) P[k] = PADRAO[k];
    [wfTipo, wfInst].forEach(function (o) { if (o && typeof o === "object") for (var q in o) if (Object.prototype.hasOwnProperty.call(o, q) && o[q] != null) P[q] = o[q]; });
    P.montante = arr(P.montante).length === 2 ? [num(P.montante[0], 38), num(P.montante[1], 89)] : [38, 89];
    P.osbModulo = arr(P.osbModulo).length === 2 ? [num(P.osbModulo[0], 1200), num(P.osbModulo[1], 2400)] : [1200, 2400];
    P.espac = Math.max(150, num(P.espac, 400));
    P.canto = P.canto === "bloco" ? "bloco" : "3montantes";
    P.origem = P.origem === "fim" ? "fim" : "ini";
    return P;
  }

  function vergaDe(vaoLivre, dEsp) {
    var t = null, i;
    for (i = 0; i < VERGAS.length; i++) if (vaoLivre <= VERGAS[i].ate + 1e-9) { t = VERGAS[i]; break; }
    var fora = !t; if (!t) t = VERGA_ACIMA;
    return { secao: t.secao.slice(), compra: t.compra, foraTabela: fora, ate: fora ? null : t.ate };
  }

  /* posição de cada camada na espessura (w centrado; w < 0 = face "fora") */
  function posCamadas(camadas, t) {
    var cam = arr(camadas), soma = 0, w = 0, out = [];
    cam.forEach(function (k) { soma += num(k.e, 0); });
    var T = soma > 0 ? soma : num(t, 0);
    w = -T / 2;
    cam.forEach(function (k) {
      var e = num(k.e, 0);
      out.push({ id: String(k.id), rotulo: k.rotulo || "", face: k.face || "", e: e, w0: r6(w), w1: r6(w + e), hach: hachDe(k) });
      w += e;
    });
    return out;
  }
  /* o desenho da camada na planta */
  function hachDe(k) {
    var id = String(k.id || ""), h = k.hach;
    if (h) return h;
    if (id === "nucleo" || k.face === "nucleo") return "la";
    if (/^osb/.test(id)) return "osb";
    if (/gesso/.test(id)) return "gesso";
    if (/cimenticia|siding/.test(id)) return "cimenticia";
    if (/ripa|camara/.test(id)) return "ripa";
    if (/membrana/.test(id)) return "membrana";
    if (/vapor/.test(id)) return "vapor";
    if (/imper/.test(id)) return "imper";
    return "solido";
  }

  /* subtrai de um retângulo [u0,u1]×[y0,y1] os retângulos dos vãos → lista de retângulos que sobram */
  function menosRets(r, buracos) {
    var lista = [r];
    buracos.forEach(function (b) {
      var nova = [];
      lista.forEach(function (q) {
        if (b.u1 <= q.u0 + 1e-9 || b.u0 >= q.u1 - 1e-9 || b.y1 <= q.y0 + 1e-9 || b.y0 >= q.y1 - 1e-9) { nova.push(q); return; }
        if (b.u0 > q.u0 + 1e-9) nova.push({ u0: q.u0, u1: b.u0, y0: q.y0, y1: q.y1 });
        if (b.u1 < q.u1 - 1e-9) nova.push({ u0: b.u1, u1: q.u1, y0: q.y0, y1: q.y1 });
        var a = Math.max(q.u0, b.u0), z = Math.min(q.u1, b.u1);
        if (b.y0 > q.y0 + 1e-9) nova.push({ u0: a, u1: z, y0: q.y0, y1: b.y0 });
        if (b.y1 < q.y1 - 1e-9) nova.push({ u0: a, u1: z, y0: b.y1, y1: q.y1 });
      });
      lista = nova;
    });
    return lista.filter(function (q) { return q.u1 - q.u0 > 0.005 && q.y1 - q.y0 > 0.005; });
  }

  /* ================================================================== EMPENA / TOPO INCLINADO (fase 2C, 20/11/2026)
   * Quando a parede segue o telhado (topo recortado/anexado à cobertura: oitão, empena, meia-água) o quadro acompanha o recorte. O quadro é gerado
   * como retângulo na altura MÁXIMA (o motor de sempre, sem mudança) e `empenar` recorta as peças pela linha do topo `t(u)` (m, a partir da base):
   *   · GUIA SUPERIOR DUPLA inclinada: as duas guias seguem o topo (cada uma com a espessura de 38 mm medida PERPENDICULAR à água: na vertical vale
   *     38·√(1+i²)); a peça é um paralelogramo de pontas verticais (corte de prumo = o ângulo da água), partida onde o topo muda de inclinação
   *     (na cumeeira as duas águas se encontram em duas peças de corte de prumo). Comprimento de compra = o ao longo da água (Δu·√(1+i²)).
   *   · MONTANTES (grade, extremo, canto, encontro, ombreira-rei, cripple superior) CORTADOS no ângulo: o topo de cada um acompanha a face de baixo da
   *     guia inferior da dupla; a lista de corte leva o comprimento MAIOR (ponta alta), o MENOR (ponta baixa) e o ângulo do corte (= atan da inclinação).
   *     Montante a cavaleiro da cumeeira leva duas águas ("bico": corte duplo). Montante que fica curto demais (≤ 3 cm) é descartado com aviso.
   *   · BLOQUEADORES: o que fica acima do topo some; onde o montante mais curto do vão passa de `blocoAlt` e não sobrou bloqueador, entra um a meia altura
   *     do montante curto (o que não passa de `blocoAlt` não leva bloqueio).
   *   · OSB: cada chapa é RECORTADA pela linha do topo (polígono `pol`); a contagem de chapas e a área são as das peças recortadas.
   * Peça recortada = a mesma peça (id, tipo, seção) + `pol` [[u, y]…] (contorno real na elevação), `comp` (maior), `compMin`, `ang` (graus) e `vol` exato do polígono.
   * A caixa envolvente (u0..u1 × y0..y1) segue valendo para o resto do motor (planta, OSB, 3D de caixas). SEM `topo` nada disto roda: o quadro é o de sempre. */
  function criarTopo(segs) {
    var S = arr(segs).map(function (g) { return { u0: g.u0, u1: g.u1, a: g.a, b: g.b }; });
    function segEm(uu) {
      var k;
      for (k = 0; k < S.length; k++) if (uu >= S[k].u0 - 1e-9 && uu <= S[k].u1 + 1e-9) return S[k];
      return S[uu < S[0].u0 ? 0 : S.length - 1];
    }
    return {
      segs: S, segEm: segEm,
      /* y em u; `m` = um u do lado de dentro do trecho (decide o lado numa quebra) */
      y: function (u, m) { var g = segEm(m != null ? m : u); return g.a + g.b * u; },
      quebras: function (a, c) { var o = []; S.forEach(function (g) { [g.u0, g.u1].forEach(function (u) { if (u > a + 1e-6 && u < c - 1e-6 && o.indexOf(u) < 0) o.push(u); }); }); return o.sort(function (p, q) { return p - q; }); }
    };
  }
  function areaPol(pol) { var s = 0, i; for (i = 0; i < pol.length; i++) { var a = pol[i], b = pol[(i + 1) % pol.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  function perimPol(pol) { var s = 0, i; for (i = 0; i < pol.length; i++) { var a = pol[i], b = pol[(i + 1) % pol.length]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); } return s; }
  function limparPol(pol) {
    var o = [], i;
    pol.forEach(function (q) { var u = o[o.length - 1]; if (!u || Math.abs(u[0] - q[0]) > 1e-6 || Math.abs(u[1] - q[1]) > 1e-6) o.push([r6(q[0]), r6(q[1])]); });
    if (o.length > 1 && Math.abs(o[0][0] - o[o.length - 1][0]) < 1e-6 && Math.abs(o[0][1] - o[o.length - 1][1]) < 1e-6) o.pop();
    /* vértice no meio de uma reta cai */
    for (i = o.length - 1; i >= 0 && o.length > 3; i--) {
      var a = o[(i - 1 + o.length) % o.length], b = o[i], c = o[(i + 1) % o.length];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9) o.splice(i, 1);
    }
    return o;
  }
  function ymaxPol(pol) { var m = -Infinity; pol.forEach(function (q) { if (q[1] > m) m = q[1]; }); return m; }
  function yminPol(pol) { var m = Infinity; pol.forEach(function (q) { if (q[1] < m) m = q[1]; }); return m; }
  /* o OSB (retângulo u0..u1 × y0..y1) sob a linha do topo: polígono (contorno) ou null se nada sobra */
  function recortarRet(T, r) {
    var cand = [r.u0, r.u1], k;
    T.quebras(r.u0, r.u1).forEach(function (u) { cand.push(u); });
    cand.sort(function (a, c) { return a - c; });
    /* onde a linha do topo cruza y0 e y1 dentro de cada trecho */
    var extra = [];
    for (k = 0; k + 1 < cand.length; k++) {
      var m = (cand[k] + cand[k + 1]) / 2, g = T.segEm(m);
      if (Math.abs(g.b) < 1e-9) continue;
      [r.y0, r.y1].forEach(function (yy) { var uc = (yy - g.a) / g.b; if (uc > cand[k] + 1e-6 && uc < cand[k + 1] - 1e-6) extra.push(uc); });
    }
    cand = cand.concat(extra).sort(function (a, c) { return a - c; });
    var top = [];
    cand.forEach(function (u, i) {
      var mEsq = i > 0 ? (cand[i - 1] + u) / 2 : u + 1e-7, mDir = i + 1 < cand.length ? (u + cand[i + 1]) / 2 : u - 1e-7;
      var ye = T.y(u, mEsq), yd = T.y(u, mDir);
      var ce = Math.max(r.y0, Math.min(r.y1, ye)), cd = Math.max(r.y0, Math.min(r.y1, yd));
      top.push([u, ce]); if (Math.abs(ce - cd) > 1e-6) top.push([u, cd]);
    });
    var pol = [[r.u0, r.y0], [r.u1, r.y0]];
    top.slice().reverse().forEach(function (q) { pol.push(q); });
    pol = limparPol(pol);
    if (pol.length < 3 || areaPol(pol) < 1e-4) return null;
    return pol;
  }
  /* o corte de um polígono CONVEXO por y = yh: [ua, ub] ou null (a planta corta as peças recortadas pelo mesmo contorno) */
  function corteHPol(pol, yh) {
    var us = [], i;
    for (i = 0; i < pol.length; i++) {
      var a = pol[i], b = pol[(i + 1) % pol.length];
      if ((a[1] - yh) * (b[1] - yh) <= 0 && Math.abs(a[1] - b[1]) > 1e-12) us.push(a[0] + (b[0] - a[0]) * (yh - a[1]) / (b[1] - a[1]));
      else if (Math.abs(a[1] - yh) < 1e-9 && Math.abs(b[1] - yh) < 1e-9) { us.push(a[0]); us.push(b[0]); }
    }
    if (us.length < 2) return null;
    return [Math.min.apply(null, us), Math.max.apply(null, us)];
  }
  var VERTICAIS_TOPO = /^(montante|montante-extremo|montante-canto|montante-encontro|ombreira-rei|cripple-superior)$/;

  /* cx = { topo, pecas, add, avisos, guia, guiaInf, yTopoMont, P, vaosOk (x já com o deslocamento), wn0, wn1, SEC_MONT, COMPRA_MONT, osb } */
  function empenar(cx) {
    var T = cx.topo, pecas = cx.pecas, g = cx.guia, avisos = cx.avisos, P = cx.P, out = [], k;
    function fsec(seg) { return Math.sqrt(1 + seg.b * seg.b); }
    function angDe(seg) { return r4(Math.atan(Math.abs(seg.b)) * 180 / Math.PI); }
    function ybEm(u, seg) { return seg.a + seg.b * u - 2 * g * fsec(seg); }     /* face de baixo da guia superior dupla, na água `seg` */
    var angulos = {}, descartados = 0, nBico = 0;
    /* ---- 1. guias superiores e montantes */
    pecas.forEach(function (q) {
      if (/^guia-superior-[12]$/.test(q.tipo)) {
        var cortes = [q.u0].concat(T.quebras(q.u0, q.u1)).concat([q.u1]), n = 0;
        for (k = 0; k + 1 < cortes.length; k++) {
          var a = cortes[k], c = cortes[k + 1]; if (c - a < 0.005) continue;
          var sg = T.segEm((a + c) / 2), tv = g * fsec(sg), o0 = q.tipo === "guia-superior-2" ? 0 : tv, o1 = o0 + tv;
          var pol = limparPol([[a, sg.a + sg.b * a - o1], [c, sg.a + sg.b * c - o1], [c, sg.a + sg.b * c - o0], [a, sg.a + sg.b * a - o0]]);
          var peca = { id: n ? q.id + "~" + (n + 1) : q.id, tipo: q.tipo, grupo: q.grupo, secao: q.secao, u0: r6(a), u1: r6(c), y0: r6(yminPol(pol)), y1: r6(ymaxPol(pol)), w0: q.w0, w1: q.w1, pol: pol };
          if (q.compra) peca.compra = q.compra;
          peca.comp = r4((c - a) * fsec(sg)); peca.ang = angDe(sg); peca.compMin = peca.comp; peca.vol = r6(peca.comp * g * (q.w1 - q.w0));
          if (peca.ang > 0) angulos[peca.ang] = 1;
          out.push(peca); n++;
        }
        return;
      }
      if (q.grupo === "madeira" && VERTICAIS_TOPO.test(q.tipo) && Math.abs(q.y1 - cx.yTopoMont) < 1e-6) {
        var br = T.quebras(q.u0, q.u1), cs = [q.u0].concat(br).concat([q.u1]), cadeia = [], sg0 = T.segEm((q.u0 + q.u1) / 2);
        for (k = 0; k + 1 < cs.length; k++) {
          var sgk = T.segEm((cs[k] + cs[k + 1]) / 2);
          if (k === 0) cadeia.push([cs[k], ybEm(cs[k], sgk)]);
          else {
            var ant = cadeia[cadeia.length - 1], ya = ybEm(cs[k], sgk);
            if (Math.abs(ant[1] - ya) > 1e-6) { var yb2 = Math.min(ant[1], ya); ant[1] = yb2; ya = yb2; }
            cadeia.push([cs[k], ya]);
          }
        }
        cadeia.push([q.u1, ybEm(q.u1, T.segEm(q.u1 - 1e-7))]);
        var topoMin = Infinity, topoMax = -Infinity; cadeia.forEach(function (v) { if (v[1] < topoMin) topoMin = v[1]; if (v[1] > topoMax) topoMax = v[1]; });
        if (topoMin - q.y0 <= 0.03) { descartados++; avisos.push("Peça " + q.tipo + " em u = " + virg(q.u0) + " m fica com menos de 3 cm sob o topo inclinado — descartada (conferir o telhado)."); return; }
        var inclinada = cadeia.some(function (v, i) { return i > 0 && Math.abs(v[1] - cadeia[i - 1][1]) > 1e-6; });
        var p2 = { id: q.id, tipo: q.tipo, grupo: q.grupo, secao: q.secao, u0: q.u0, u1: q.u1, y0: q.y0, y1: r6(topoMax), w0: q.w0, w1: q.w1 };
        if (q.compra) p2.compra = q.compra;
        if (q.aoLado) p2.aoLado = q.aoLado;
        if (inclinada) {
          var pol2 = [[q.u0, q.y0], [q.u1, q.y0]]; cadeia.slice().reverse().forEach(function (v) { pol2.push([v[0], v[1]]); });
          p2.pol = limparPol(pol2); p2.comp = r4(topoMax - q.y0); p2.compMin = r4(topoMin - q.y0);
          p2.ang = angDe(sg0); if (br.length) { p2.duplo = true; nBico++; }
          p2.vol = r6(areaPol(p2.pol) * (q.w1 - q.w0)); angulos[p2.ang] = 1;
        } else { p2.comp = r4(topoMax - q.y0); p2.compMin = p2.comp; p2.ang = 0; p2.vol = r6((q.u1 - q.u0) * (topoMax - q.y0) * (q.w1 - q.w0)); }
        out.push(p2); return;
      }
      out.push(q);
    });
    pecas.length = 0; out.forEach(function (q) { pecas.push(q); });
    /* ---- 2. bloqueadores e blocos: o que passa do topo some; onde o montante curto passa de blocoAlt e ficou sem bloqueador, entra um */
    function topoMinEm(a, c) {
      var us = [a, c].concat(T.quebras(a, c)), mn = Infinity;
      us.forEach(function (u) { var m = u <= a + 1e-6 ? a + 1e-6 : (u >= c - 1e-6 ? c - 1e-6 : u), y = ybEm(u, T.segEm(m)); if (y < mn) mn = y; });
      return mn;
    }
    var jH = P.osbModulo[1] / 1000, lim = P.blocoAlt / 1000, fora = 0;
    for (k = pecas.length - 1; k >= 0; k--) {
      var z = pecas[k];
      if (z.grupo !== "madeira" || !/^(bloqueador|bloco)$/.test(z.tipo)) continue;
      var tm = topoMinEm(z.u0, z.u1), yc = (z.y0 + z.y1) / 2, nec = tm - cx.guiaInf > lim - 1e-9;      /* o montante mais curto do vão passa de blocoAlt? */
      if (z.y1 > tm + 1e-6 || (z.tipo === "bloqueador" && !nec && Math.abs(yc - jH) >= 0.10)) { pecas.splice(k, 1); fora++; }
    }
    var verts = pecas.filter(function (z) { return z.grupo === "madeira" && /^(montante|montante-extremo|montante-canto|montante-encontro|ombreira-rei)$/.test(z.tipo) && z.y0 <= cx.guiaInf + 1e-6; }).sort(function (p, q) { return p.u0 - q.u0; });
    var nBloq = 0;
    for (k = 0; k + 1 < verts.length; k++) {
      var va = verts[k], vc = verts[k + 1], gap = vc.u0 - va.u1;
      if (gap < 0.02) continue;
      var hmin = Math.min(va.compMin != null ? va.compMin : va.comp, vc.compMin != null ? vc.compMin : vc.comp);
      if (hmin <= lim + 1e-9) continue;
      var temVao = cx.vaosOk.some(function (v) { return v.x1 > va.u1 - 1e-6 && v.x0 < vc.u0 + 1e-6; });
      if (temVao) continue;
      var jaTem = pecas.some(function (z) { return /^(bloqueador|bloco)$/.test(z.tipo) && z.u0 >= va.u1 - 1e-6 && z.u1 <= vc.u0 + 1e-6; });
      if (jaTem) continue;
      var ycn = cx.guiaInf + hmin / 2;
      cx.add("bloqueador", "madeira", cx.SEC_MONT, va.u1, vc.u0, ycn - g / 2, ycn + g / 2, cx.wn0, cx.wn1, { compra: cx.COMPRA_MONT, ajusteEmpena: true }); nBloq++;
    }
    /* ---- 3. OSB recortado */
    var osbN = 0, osbArea = 0, mods = {}, perdidas = 0;
    for (k = pecas.length - 1; k >= 0; k--) {
      var o = pecas[k]; if (o.grupo !== "osb") continue;
      var pg = recortarRet(T, { u0: o.u0, u1: o.u1, y0: o.y0, y1: o.y1 });
      if (!pg) { pecas.splice(k, 1); perdidas++; continue; }
      var recortada = Math.abs(areaPol(pg) - (o.u1 - o.u0) * (o.y1 - o.y0)) > 1e-6;
      if (recortada) { o.pol = pg; o.y1 = r6(ymaxPol(pg)); o.recorte = true; }
      o.area = r6(recortada ? areaPol(pg) : (o.u1 - o.u0) * (o.y1 - o.y0)); o.vol = r6(o.area * (o.w1 - o.w0)); o.comp = r4(Math.max(o.u1 - o.u0, o.y1 - o.y0));
      osbN++; osbArea += o.area; mods[o.modulo] = 1;
    }
    cx.osb.chapas = Object.keys(mods).length; cx.osb.area = r4(osbArea); cx.osb.pecas = osbN;
    /* ---- 4. conferência dos vãos contra o topo */
    var vaosInfo = [], interf = [];
    cx.vaosOk.forEach(function (v) {
      var tm = topoMinEm(v.x0, v.x1), topoV = v._hdrTopo != null ? v._hdrTopo : v.y1;
      vaosInfo.push({ id: v.id, topoMin: r4(tm), topoVerga: r4(topoV), interfere: topoV > tm - 0.01 });
      if (topoV > tm - 0.01) interf.push(v.id);
      if (topoV > tm - 0.01) avisos.push("Vão " + v.id + ": o topo da verga (" + virg(topoV) + " m) chega na guia superior inclinada (face de baixo a " + virg(tm) + " m no ponto mais baixo): conferir o vão ou o telhado.");
    });
    var hs = []; T.segs.forEach(function (sg) { [sg.u0, sg.u1].forEach(function (u) { hs.push(sg.a + sg.b * u); }); });
    return { ativo: true, hMax: r4(Math.max.apply(null, hs)), hMin: r4(Math.min.apply(null, hs)), angulos: Object.keys(angulos).map(Number).sort(function (a, b2) { return a - b2; }),
             descartados: descartados, bicos: nBico, bloqueadoresFora: fora, bloqueadoresNovos: nBloq, osbPerdidas: perdidas,
             vaos: vaosInfo, interferencias: interf };
  }


  /* ================================================================== GERAR */
  /* p = { id, L, H, t, vaos:[{id,x0,x1,y0,y1}] (u de 0 a L, y da base), encontros:[{u,larg}], vazios:[{u0,u1}],
           pontas:{ini:"L"|"livre", fim:"L"|"livre"}, wf:{…}, camadas:[{id,face,e (m),…}], inverterFaces, deslocU } */
  function gerar(p) {
    p = p || {};
    var P = params(p.wf), L = num(p.L, 0), H = num(p.H, 0), avisos = [];
    if (!(L >= 0.15) || !(H >= 0.5)) return { ok: false, motivo: "Parede curta ou baixa demais para um quadro (" + virg(L) + " × " + virg(H) + " m).", avisos: avisos, pecas: [] };
    var wL = posCamadas(p.camadas, p.t), nuc = null, osbL = null;
    wL.forEach(function (k) { if (k.face === "nucleo") nuc = k; else if (/^osb/.test(k.id) && !osbL) osbL = k; });
    var b = P.montante[0] / 1000, d = nuc && nuc.e > 0 ? nuc.e : P.montante[1] / 1000;
    var wn0 = nuc ? nuc.w0 : -d / 2, wn1 = wn0 + d;
    var mir = P.origem === "fim";
    var guia = b;                                           /* a guia tem a espessura do montante na vertical */
    var yTopoMont = H - 2 * guia;                           /* o montante termina sob as duas guias superiores */
    var hMont = yTopoMont - guia;
    if (hMont < 0.2) return { ok: false, motivo: "Altura da parede (" + virg(H) + " m) não comporta guias e montantes.", avisos: avisos, pecas: [] };
    function esp(u) { return mir ? L - u : u; }              /* gerar na ponta "ini" do quadro de geração */

    /* --- vãos, pontas, encontros, vazios (no quadro de geração) */
    var vaos = [];
    arr(p.vaos).forEach(function (v) {
      var x0 = num(v.x0, 0), x1 = num(v.x1, 0), y0 = Math.max(0, num(v.y0, 0)), y1 = Math.min(H, num(v.y1, 0));
      if (x1 - x0 < 0.05 || y1 - y0 < 0.05) return;
      if (x0 < 0) x0 = 0; if (x1 > L) x1 = L;
      vaos.push({ id: v.id != null ? String(v.id) : "v" + vaos.length, x0: mir ? L - x1 : x0, x1: mir ? L - x0 : x1, y0: y0, y1: y1 });
    });
    vaos.sort(function (a, c) { return a.x0 - c.x0; });
    /* Entre dois vãos cabem, no mínimo, rei + jack de cada lado = 4 × b. De 3 × b até 4 × b os dois dividem UM rei (o comum, no meio);
       abaixo de 3 × b não cabe nem o rei comum: o vão é ignorado e o aviso diz. */
    var vaosOk = [];
    vaos.forEach(function (v) {
      var ult = vaosOk[vaosOk.length - 1];
      v.porta = v.y0 <= guia + 1e-4;
      if (ult) {
        var gap = v.x0 - ult.x1;
        if (gap < 3 * b - 1e-6) { avisos.push("Vão " + v.id + " a menos de " + virg(3 * b * 1000, 0) + " mm do vão " + ult.id + " — sem espaço nem para um rei comum entre os dois: o quadro ignora este vão (conferir a modelagem)."); return; }
        if (gap < 4 * b - 1e-6) { ult.reiDir = true; v.reiEsq = true; v.reiComum = (ult.x1 + v.x0) / 2; ult._comumCom = v.id; }
      }
      vaosOk.push(v);
    });
    /* "L" = canto com o arranjo completo (a parede que passa, ou a meia-esquadria); "Lb" = a parede que ENCOSTA no canto (1 montante de ponta);
       "T" = pé da parede que morre no meio de outra (1 montante de ponta, sem hold-down); "livre" = ponta solta */
    function tpPonta(v) { return v === "L" || v === "Lb" || v === "T" ? v : "livre"; }
    var ptIni = tpPonta(p.pontas && p.pontas.ini), ptFim = tpPonta(p.pontas && p.pontas.fim);
    var pontaA = mir ? ptFim : ptIni, pontaB = mir ? ptIni : ptFim;       /* A = a ponta de origem do alinhamento */
    var encontros = arr(p.encontros).map(function (e) { var l = Math.max(0.04, num(e.larg, 0.09)); return { u: esp(num(e.u, 0)), larg: l }; });
    var vazios = arr(p.vazios).map(function (z) { var a = esp(num(z.u0, 0)), c = esp(num(z.u1, 0)); return { u0: Math.min(a, c), u1: Math.max(a, c) }; });

    var pecas = [], ids = {}, ocupado = [];
    function nomeId(tipo, u0, y0) {
      var k = tipo + "@" + mm(u0) + (y0 > 1e-6 ? "/" + mm(y0) : ""), n = 1, base = k;
      while (ids[k]) { n++; k = base + "#" + n; }
      ids[k] = 1; return "wfq-" + String(p.id) + "-" + (mir ? "f-" : "") + k;
    }
    function add(tipo, grupo, secao, u0, u1, y0, y1, w0, w1, ex) {
      var o = { id: nomeId(tipo, u0, y0), tipo: tipo, grupo: grupo, secao: secao, u0: r6(u0), u1: r6(u1), y0: r6(y0), y1: r6(y1), w0: r6(w0), w1: r6(w1) };
      o.comp = r4(Math.max(o.u1 - o.u0, o.y1 - o.y0, o.w1 - o.w0));
      if (ex) for (var k in ex) if (Object.prototype.hasOwnProperty.call(ex, k)) o[k] = ex[k];
      pecas.push(o); return o;
    }
    var SEC_MONT = P.montante[0] + "x" + P.montante[1], COMPRA_MONT = "50x100", cm0 = null;
    VERGAS.concat([{ secao: VERGA_ACIMA.secao, compra: VERGA_ACIMA.compra }]).forEach(function (t) { if (t.secao[0] === P.montante[0] && t.secao[1] === P.montante[1]) cm0 = t.compra; });
    COMPRA_MONT = cm0;     /* a seção de compra do catálogo Nibra (89 → 50x100, 140 → 50x150…); 38×64 e outras: sem seção de catálogo — pendência */
    function mont(tipo, u0, u1, y0, y1, ex) { return add(tipo, "madeira", SEC_MONT, u0, u1, y0, y1, wn0, wn1, ex); }
    function bloco(u0, u1, yc) { return add("bloco", "madeira", SEC_MONT, u0, u1, yc - guia / 2, yc + guia / 2, wn0, wn1, { aoLado: "bloco" }); }
    function ocupa(u0, u1) { ocupado.push({ u0: u0, u1: u1 }); }
    var verticais = [], pontaOc = [];

    /* --- guias */
    var segs = [{ u0: 0, u1: L }];
    vaosOk.forEach(function (v) {
      if (!v.porta) return;
      var nova = [];
      segs.forEach(function (s) {
        if (v.x1 <= s.u0 + 1e-9 || v.x0 >= s.u1 - 1e-9) { nova.push(s); return; }
        if (v.x0 > s.u0 + 1e-9) nova.push({ u0: s.u0, u1: v.x0 });
        if (v.x1 < s.u1 - 1e-9) nova.push({ u0: v.x1, u1: s.u1 });
      });
      segs = nova;
    });
    segs.forEach(function (s) { if (s.u1 - s.u0 > 0.02) add("guia-inferior", "madeira", SEC_MONT, s.u0, s.u1, 0, guia, wn0, wn1, { compra: COMPRA_MONT }); });

    /* --- pontas: livre = 1 montante rente; L = o arranjo de canto */
    function ponta(tipoPonta, aPartirDeA) {
      var o = aPartirDeA ? 0 : L, sg = aPartirDeA ? 1 : -1;
      function uu(a, c) { var x = o + sg * a, z = o + sg * c; return [Math.min(x, z), Math.max(x, z)]; }
      var u;
      if (tipoPonta !== "L") { u = uu(0, b); mont("montante-extremo", u[0], u[1], guia, yTopoMont, { compra: COMPRA_MONT }); ocupa(u[0], u[1]); pontaOc.push([u[0], u[1]]); return; }
      if (P.canto === "bloco") {
        u = uu(0, b); mont("montante-canto", u[0], u[1], guia, yTopoMont, { compra: COMPRA_MONT });
        u = uu(2 * b, 3 * b); mont("montante-canto", u[0], u[1], guia, yTopoMont, { compra: COMPRA_MONT });
        var bu = uu(b, 2 * b);
        for (var yb = guia + 0.3; yb < yTopoMont - guia; yb += 0.6) bloco(bu[0], bu[1], yb);
        ocupa(Math.min(uu(0, 3 * b)[0], uu(0, 3 * b)[1]), Math.max(uu(0, 3 * b)[0], uu(0, 3 * b)[1]));
        pontaOc.push([Math.min(uu(0, 3 * b)[0], uu(0, 3 * b)[1]), Math.max(uu(0, 3 * b)[0], uu(0, 3 * b)[1])]);
      } else {
        for (var i = 0; i < 3; i++) { u = uu(i * b, (i + 1) * b); mont("montante-canto", u[0], u[1], guia, yTopoMont, { compra: COMPRA_MONT }); }
        var uz = uu(0, 3 * b); ocupa(uz[0], uz[1]); pontaOc.push([uz[0], uz[1]]);
      }
    }
    ponta(pontaA, true); ponta(pontaB, false);

    /* --- encontros T/X no meio da parede */
    /* as juntas verticais do OSB são conhecidas ANTES (a cada módulo, a partir da ponta de origem): se uma cai no vão do encontro T, o bloco de
       pregação cede lugar a um montante CHEIO centrado na junta (a junta não se move) */
    var juntasPrev = [];
    if (osbL) for (var jk = P.osbModulo[0] / 1000; jk < L - 1e-6; jk += P.osbModulo[0] / 1000) juntasPrev.push(jk);
    encontros.forEach(function (e) {
      var a0 = e.u - e.larg / 2 - b, a1 = e.u - e.larg / 2, c0 = e.u + e.larg / 2, c1 = e.u + e.larg / 2 + b;
      if (a0 < 0 || c1 > L) { avisos.push("Encontro em " + virg(e.u) + " m: a parede que chega fica rente à ponta — o montante de encontro foi dispensado (a ponta já tem o seu)."); return; }
      mont("montante-encontro", a0, a1, guia, yTopoMont, { compra: COMPRA_MONT });
      mont("montante-encontro", c0, c1, guia, yTopoMont, { compra: COMPRA_MONT });
      var jEnc = null; juntasPrev.forEach(function (jj) { if (jj >= a1 - 1e-6 && jj <= c0 + 1e-6) jEnc = jj; });
      if (jEnc != null) {
        var m0 = jEnc - b / 2; if (c0 - a1 >= b) { if (m0 < a1) m0 = a1; if (m0 + b > c0) m0 = c0 - b; }
        mont("montante-encontro", m0, m0 + b, guia, yTopoMont, { compra: COMPRA_MONT, junta: true });
      } else for (var yb = guia + 0.3; yb < yTopoMont - guia; yb += P.espBlocoEncontro / 1000) bloco(a1, c0, yb);
      ocupa(a0, c1);
    });
    vazios.forEach(function (z) {
      var f0 = z.u0 - b, f1 = z.u1 + b;
      if (f0 >= 0) mont("montante-encontro", f0, z.u0, guia, yTopoMont, { compra: COMPRA_MONT });
      if (f1 <= L) mont("montante-encontro", z.u1, f1, guia, yTopoMont, { compra: COMPRA_MONT });
      ocupa(Math.max(0, f0), Math.min(L, f1));
    });

    /* --- vãos: reis, jacks, verga, cripples, peitoril */
    var vergas = [];
    vaosOk.forEach(function (v) {
      var vl = v.x1 - v.x0, dv = vergaDe(vl);
      var k0 = v.reiEsq ? v.x0 - b : v.x0 - 2 * b, k1 = v.reiDir ? v.x1 + b : v.x1 + 2 * b;
      if (k0 < -1e-6 || k1 > L + 1e-6) avisos.push("Vão " + v.id + ": as ombreiras não cabem entre a ponta e o vão (" + virg(Math.max(0, v.x0) * 1000, 0) + " mm) — conferir a posição do vão.");
      if (dv.foraTabela) avisos.push("Vão " + v.id + " de " + virg(vl) + " m: acima de 3,00 m a tabela de vergas não vale — verga a CALCULAR (NBR 7190-1:2022 / Diretriz SINAT nº 005).");
      var dh = dv.secao[1] / 1000, hdrBase = v.y1, hdrTopo = v.y1 + dh;
      if (hdrTopo > yTopoMont + 1e-6) {
        avisos.push("Vão " + v.id + ": a verga (" + dv.secao[0] + "×" + dv.secao[1] + ") não cabe acima do vão sob as guias (" + virg(yTopoMont - v.y1) + " m livres) — baixar o vão ou calcular a verga.");
        hdrTopo = Math.max(hdrBase, yTopoMont);
      }
      /* ombreiras */
      if (!v.reiEsq) mont("ombreira-rei", Math.max(0, v.x0 - 2 * b), Math.max(0, v.x0 - b), guia, yTopoMont, { vao: v.id, compra: COMPRA_MONT });
      else { mont("ombreira-rei", v.reiComum - b / 2, v.reiComum + b / 2, guia, yTopoMont, { vao: v.id, compra: COMPRA_MONT, comum: true }); ocupa(v.reiComum - b / 2, v.reiComum + b / 2); }
      if (!v.reiDir) mont("ombreira-rei", Math.min(L, v.x1 + b), Math.min(L, v.x1 + 2 * b), guia, yTopoMont, { vao: v.id, compra: COMPRA_MONT });
      mont("ombreira-jack", Math.max(0, v.x0 - b), v.x0, guia, v.y1, { vao: v.id, compra: COMPRA_MONT });
      mont("ombreira-jack", v.x1, Math.min(L, v.x1 + b), guia, v.y1, { vao: v.id, compra: COMPRA_MONT });
      ocupa(Math.max(0, k0), Math.min(L, k1));
      /* verga: 2 peças de (espessura do montante × altura da tabela) + espaçador, ou peça única em parede de 38×64 */
      var hu0 = Math.max(0, v.x0 - b), hu1 = Math.min(L, v.x1 + b), vSec = dv.secao[0] + "x" + dv.secao[1];
      var dupla = d >= 2 * b + 0.004;
      if (hdrTopo - hdrBase > 0.02) {
        if (dupla) {
          add("verga", "madeira", vSec, hu0, hu1, hdrBase, hdrTopo, wn0, wn0 + b, { vao: v.id, compra: dv.compra, lado: "a" });
          add("verga", "madeira", vSec, hu0, hu1, hdrBase, hdrTopo, wn1 - b, wn1, { vao: v.id, compra: dv.compra, lado: "b" });
          if (d - 2 * b > 0.003) add("espacador-verga", "espacador", "OSB/compensado " + mm(d - 2 * b) + " mm", hu0, hu1, hdrBase, hdrTopo, wn0 + b, wn1 - b, { vao: v.id });
        } else {
          add("verga", "madeira", vSec, hu0, hu1, hdrBase, hdrTopo, wn0, wn0 + b, { vao: v.id, compra: dv.compra, lado: "unica" });
        }
        vergas.push({ vao: v.id, vaoLivre: r4(vl), secao: dv.secao.slice(), secaoCompra: dv.compra, pecas: dupla ? 2 : 1, foraTabela: dv.foraTabela });
      }
      /* cripples acima da verga e (janela) peitoril + cripples abaixo — no passo da grade, dentro do vão */
      v._hdrTopo = hdrTopo;
      if (!v.porta) {
        add("peitoril", "madeira", SEC_MONT, v.x0, v.x1, v.y0 - guia, v.y0, wn0, wn1, { vao: v.id, compra: COMPRA_MONT });
      }
    });

    /* --- grade de montantes: centro em k × espaçamento a partir da ponta de origem */
    var passo = P.espac / 1000, grade = [];
    for (var kq = 1; kq * passo < L; kq++) {
      var c = kq * passo, g0 = c - b / 2, g1 = c + b / 2;
      if (g1 > L + 1e-6) break;
      var dentroVao = null;
      vaosOk.forEach(function (v) { if (g0 >= v.x0 - 1e-6 && g1 <= v.x1 + 1e-6) dentroVao = v; });
      if (dentroVao) {
        var v2 = dentroVao;
        if (yTopoMont - v2._hdrTopo > 0.02) mont("cripple-superior", g0, g1, v2._hdrTopo, yTopoMont, { vao: v2.id, compra: COMPRA_MONT });
        if (!v2.porta && v2.y0 - guia - guia > 0.02) mont("cripple-inferior", g0, g1, guia, v2.y0 - guia, { vao: v2.id, compra: COMPRA_MONT });
        continue;
      }
      var bate = false;
      ocupado.forEach(function (o) { if (g0 < o.u1 - 1e-6 && g1 > o.u0 + 1e-6) bate = true; });
      if (bate) continue;
      grade.push(c);
      mont("montante", g0, g1, guia, yTopoMont, { compra: COMPRA_MONT });
    }

    /* --- guias superiores (dupla), com EMENDA quando passam do comprimento de compra: a emenda cai sobre o centro de um montante e as duas
           guias ficam defasadas em pelo menos um vão (o espaçamento) */
    (function () {
      var maxC = P.guiaCompMax / 1000, cs = [];
      pecas.forEach(function (q) { if (q.grupo === "madeira" && /^(montante|ombreira)/.test(q.tipo) && q.y1 - q.y0 > 0.5 * hMont) cs.push((q.u0 + q.u1) / 2); });
      cs = cs.filter(function (v, i, A) { return A.indexOf(v) === i; }).sort(function (a, c) { return a - c; });
      function emendas(evita) {
        var out = [], pos = 0, guard = 0;
        while (L - pos > maxC + 1e-9 && guard++ < 50) {
          var cand = cs.filter(function (c) { return c > pos + 0.2 && c - pos <= maxC + 1e-9 && evita.every(function (e) { return Math.abs(e - c) >= P.espac / 1000 - 1e-6; }); });
          if (!cand.length) cand = cs.filter(function (c) { return c > pos + 0.2 && c - pos <= maxC + 1e-9; });
          var cx = cand.length ? cand[cand.length - 1] : Math.min(pos + maxC, L);
          if (!cand.length) avisos.push("Guia superior: sem montante para emendar a menos de " + virg(maxC) + " m — emenda fora de montante em " + virg(cx) + " m.");
          out.push(cx); pos = cx;
        }
        return out;
      }
      var e1 = emendas([]), e2 = emendas(e1);
      [["guia-superior-1", H - 2 * guia, H - guia, e1], ["guia-superior-2", H - guia, H, e2]].forEach(function (g) {
        var pts = [0].concat(g[3]).concat([L]);
        for (var kk = 0; kk + 1 < pts.length; kk++) add(g[0], "madeira", SEC_MONT, pts[kk], pts[kk + 1], g[1], g[2], wn0, wn1, { compra: COMPRA_MONT, emenda: kk > 0 });
      });
    })();

    /* --- vão na ponta: rei/jack que cai sobre o montante de ponta (ou de canto) é FUNDIDO com ele (a parte que sobra no estoque da ponta
           sai da peça) e peça com menos de 5 mm de largura é descartada (antes saía uma "ombreira" de 0 mm) */
    for (var iL = pecas.length - 1; iL >= 0; iL--) {
      var ql = pecas[iL];
      if (ql.tipo === "ombreira-rei" || ql.tipo === "ombreira-jack") {
        pontaOc.forEach(function (R) {
          if (ql.u0 < R[1] - 1e-6 && ql.u1 > R[0] + 1e-6) { if (ql.u0 >= R[0] - 1e-6) ql.u0 = R[1]; else if (ql.u1 <= R[1] + 1e-6) ql.u1 = R[0]; }
        });
      }
      if (ql.grupo === "madeira" && ql.u1 - ql.u0 < 0.005) pecas.splice(iL, 1);
    }

    /* --- bloqueadores: fiada(s) a meia altura e a da junta horizontal do OSB */
    var linhasBloq = [], altBloq = P.blocoAlt / 1000;
    if (H > altBloq + 1e-6) {
      var nFiadas = ceilT(H / altBloq) - 1;
      for (var iF = 1; iF <= nFiadas; iF++) linhasBloq.push(r6(H * iF / (nFiadas + 1)));
      if (osbL) {
        var jH = P.osbModulo[1] / 1000;
        if (jH < H - 0.05 && !linhasBloq.some(function (y) { return Math.abs(y - jH) < 0.10; })) linhasBloq.push(jH);
      }
    }
    linhasBloq.forEach(function (yc) {
      var vs = pecas.filter(function (q) { return q.grupo === "madeira" && /^(montante|ombreira|cripple)/.test(q.tipo) && q.y0 <= yc - guia / 2 + 1e-6 && q.y1 >= yc + guia / 2 - 1e-6; })
        .sort(function (a, c) { return a.u0 - c.u0; });
      for (var i = 0; i + 1 < vs.length; i++) {
        var a = vs[i], c2 = vs[i + 1], g = c2.u0 - a.u1;
        if (g < 0.02) continue;
        if (pecas.some(function (z) { return z.tipo === "bloco" && z.u0 >= a.u1 - 1e-6 && z.u1 <= c2.u0 + 1e-6; })) continue;     /* o vão entre montantes de encontro/canto já tem bloco de pregação */
        var dentroDoVaoLivre = vaosOk.some(function (v) { return a.u1 >= v.x0 - 1e-6 && c2.u0 <= v.x1 + 1e-6 && yc >= v.y0 - 1e-6 && yc <= v._hdrTopo + 1e-6; });
        if (dentroDoVaoLivre) continue;
        add("bloqueador", "madeira", SEC_MONT, a.u1, c2.u0, yc - guia / 2, yc + guia / 2, wn0, wn1, { compra: COMPRA_MONT });
      }
    });

    /* --- OSB modulado a partir da ponta de origem; juntas verticais sobre montante */
    var osb = { chapas: 0, area: 0, e: osbL ? osbL.e * 1000 : null, pecas: 0 }, juntas = [], osbRets = [];
    if (osbL) {
      var mw = P.osbModulo[0] / 1000, mh = P.osbModulo[1] / 1000, buracos = vaosOk.map(function (v) { return { u0: v.x0, u1: v.x1, y0: v.y0, y1: v.y1 }; });
      for (var yy = 0; yy < H - 1e-6; yy += mh) {
        for (var xx = 0; xx < L - 1e-6; xx += mw) {
          var mod = { u0: xx, u1: Math.min(L, xx + mw), y0: yy, y1: Math.min(H, yy + mh) };
          var sobras = menosRets(mod, buracos);
          if (!sobras.length) continue;
          osb.chapas++;
          sobras.forEach(function (q) {
            osb.area += (q.u1 - q.u0) * (q.y1 - q.y0); osb.pecas++;
            osbRets.push(q);
            add("osb", "osb", "OSB " + virg(osbL.e * 1000, 1) + " mm", q.u0, q.u1, q.y0, q.y1, osbL.w0, osbL.w1, { modulo: mm(xx) + "x" + mm(yy) });
          });
        }
      }
      for (var ju = mw; ju < L - 1e-6; ju += mw) {
        var tem = osbRets.some(function (q) { return Math.abs(q.u1 - ju) < 1e-6 || Math.abs(q.u0 - ju) < 1e-6; });
        if (!tem) continue;
        var apoio = pecas.some(function (q) { return q.grupo === "madeira" && /^(montante|ombreira|cripple)/.test(q.tipo) && q.u0 - 1e-6 <= ju && q.u1 + 1e-6 >= ju && Math.abs((q.u0 + q.u1) / 2 - ju) < b / 2 + 1e-6; });
        juntas.push({ u: r4(ju), apoio: apoio });
        if (!apoio) avisos.push("Junta do OSB em " + virg(ju) + " m cai fora de um montante (espaçamento de " + P.espac + " mm não divide 1,20 m) — mudar o espaçamento ou a ponta de origem.");
      }
      osb.area = r4(osb.area);
    }

    /* --- espelhamento (origem "fim") e deslocamento da ponta real do corpo da parede */
    var desl = num(p.deslocU, 0);
    if (mir) {
      pecas.forEach(function (q) { var a = L - q.u1, c = L - q.u0; q.u0 = r6(a); q.u1 = r6(c); });
      juntas.forEach(function (j) { j.u = r4(L - j.u); });
      vaosOk.forEach(function (v) { var a = L - v.x1, c = L - v.x0; v.x0 = a; v.x1 = c; });
    }
    pecas.forEach(function (q) { if (desl) { q.u0 = r6(q.u0 + desl); q.u1 = r6(q.u1 + desl); } });
    /* o CORTE da ponta (u = c0 + c1·w, js/bimarq.js `juntas`): cada peça fica do lado de dentro da reta NA FAIXA DE w DELA — o quadro (núcleo) e
       cada placa acabam na face da parede vizinha, sem furar o OSB/a cimentícia dela quando o corte é inclinado (c1 ≠ 0) */
    if (p.corte) {
      var cI = p.corte.ini, cF = p.corte.fim;
      for (var iC = pecas.length - 1; iC >= 0; iC--) {
        var qc = pecas[iC];
        if (cI) qc.u0 = r6(Math.max(qc.u0, cI.c0 + cI.c1 * qc.w0, cI.c0 + cI.c1 * qc.w1));
        if (cF) qc.u1 = r6(Math.min(qc.u1, cF.c0 + cF.c1 * qc.w0, cF.c0 + cF.c1 * qc.w1));
        if (qc.u1 - qc.u0 < 0.005) pecas.splice(iC, 1);
      }
    }
    juntas.forEach(function (j) { if (desl) j.u = r4(j.u + desl); });
    /* EMPENA (fase 2C): o topo inclinado recorta guias, montantes, bloqueadores e OSB (só quando `p.topo` vem; sem ele o quadro é o de sempre) */
    var empena = null;
    if (arr(p.topo).length) {
      empena = empenar({ topo: criarTopo(p.topo), pecas: pecas, add: add, avisos: avisos, guia: guia, guiaInf: guia, yTopoMont: yTopoMont, P: P, wn0: wn0, wn1: wn1, SEC_MONT: SEC_MONT, COMPRA_MONT: COMPRA_MONT, osb: osb,
        vaosOk: vaosOk.map(function (v) { return { id: v.id, x0: v.x0 + desl, x1: v.x1 + desl, y0: v.y0, y1: v.y1, _hdrTopo: v._hdrTopo }; }) });
    }
    pecas.forEach(function (q) { if (q.pol) return; q.comp = r4(Math.max(q.u1 - q.u0, q.y1 - q.y0, q.w1 - q.w0)); q.vol = r6((q.u1 - q.u0) * (q.y1 - q.y0) * (q.w1 - q.w0)); });

    var res = { ok: true, id: String(p.id), L: L, H: H, t: num(p.t, 0), params: P, b: b, d: d, wn0: wn0, wn1: wn1, deslocU: desl,
      pecas: pecas, juntasOsb: juntas, vergas: vergas, osb: osb, avisos: avisos, vergasNota: VERGAS_NOTA,
      vaos: vaosOk.map(function (v) { return { id: v.id, x0: v.x0 + desl, x1: v.x1 + desl, y0: v.y0, y1: v.y1, porta: v.porta }; }),
      camadas: wL, inverterFaces: !!p.inverterFaces, pontas: { ini: ptIni, fim: ptFim } };
    if (empena) {
      /* área real da parede = ∫ topo(u) du no corpo do quadro (trapézios por trecho) */
      var areaE = 0; arr(p.topo).forEach(function (sg) { var ua = Math.max(sg.u0, desl), uc = Math.min(sg.u1, desl + L); if (uc > ua) areaE += (uc - ua) * (sg.a + sg.b * (ua + uc) / 2); });
      empena.areaBruta = r4(areaE); empena.topo = arr(p.topo).map(function (sg) { return { u0: sg.u0, u1: sg.u1, a: sg.a, b: sg.b }; });
      res.empena = empena;
    }
    res.contagem = contagem(pecas);
    res.q = quantidades(res, p);
    return res;
  }

  function contagem(pecas) {
    var c = {};
    pecas.forEach(function (q) { c[q.tipo] = (c[q.tipo] || 0) + 1; });
    var mont = 0; Object.keys(c).forEach(function (k) { if (/^(montante|ombreira|cripple)/.test(k)) mont += c[k]; });
    c._montantesTotal = mont;
    c._montantesGrade = (c.montante || 0);
    return c;
  }

  /* POSIÇÃO dos chumbadores da guia inferior (m a partir da ponta inicial do quadro) — UMA função para o desenho e para o quantitativo.
     Ordem: 1º os da porta (0,15 m antes e depois do vão); 2º a grade de espChumbador, descartando o que ficar a menos de max(0,30 m; espChumbador/2)
     de um chumbador de porta ou a menos de 0,10 m do FIM de um trecho de guia cortado pela porta (a borda do vão; o chumbador na ponta da parede continua, a ponta tem o hold-down). */
  function posChumbadores(res) {
    var P = res.params, L = res.L, des = res.deslocU, portas = arr(res.vaos).filter(function (v) { return v.porta; }), out = [], porta = [], i;
    portas.forEach(function (v) { porta.push(Math.max(0.05, v.x0 - des - 0.15)); porta.push(Math.min(L - 0.05, v.x1 - des + 0.15)); });
    var fins = []; portas.forEach(function (v) { fins.push(v.x0 - des, v.x1 - des); });
    var dmin = Math.max(0.30, P.espChumbador / 2000), nCh = Math.max(2, ceilT(L / (P.espChumbador / 1000)) + 1), passo = L / (nCh - 1);
    for (i = 0; i < nCh; i++) {
      var u = i * passo;
      if (portas.some(function (v) { return u > v.x0 - des - 0.02 && u < v.x1 - des + 0.02; })) continue;
      if (porta.some(function (c) { return Math.abs(c - u) < dmin - 1e-9; })) continue;
      if (fins.some(function (f) { return Math.abs(f - u) < 0.10 - 1e-9; })) continue;
      out.push(u);
    }
    return out.concat(porta).sort(function (a, c) { return a - c; });
  }

  /* ----------------------------------------------------------- QUANTIDADES de UMA parede */
  function quantidades(res, p) {
    var P = res.params, L = res.L, H = res.H, q = {}, i;
    var vaos = res.vaos, areaVaos = 0, perim = 0;
    vaos.forEach(function (v) { areaVaos += (v.x1 - v.x0) * (v.y1 - v.y0); perim += 2 * ((v.x1 - v.x0) + (v.y1 - v.y0)); });
    var areaBr = res.empena ? res.empena.areaBruta : L * H;           /* empena: a área real sob o topo inclinado */
    var areaLiq = Math.max(0, areaBr - areaVaos);
    q.areaBruta = r4(areaBr); q.areaVaos = r4(areaVaos); q.areaLiquida = r4(areaLiq); q.perimetroVaos = r4(perim);
    /* madeira por seção (final) → compra (bruta) */
    var sec = {};
    res.pecas.forEach(function (x) {
      if (x.grupo !== "madeira") return;
      var k = x.secao + "|" + (x.compra || "");
      var s = sec[k] || (sec[k] = { secao: x.secao, compra: x.compra || null, n: 0, comp: 0, vol: 0 });
      s.n++; s.comp += x.comp; s.vol += x.vol;
    });
    q.madeira = Object.keys(sec).map(function (k) { var s = sec[k]; return { secao: s.secao, compra: s.compra, n: s.n, comp_m: r4(s.comp), vol_m3: r6(s.vol) }; })
      .sort(function (a, c) { return a.secao < c.secao ? -1 : 1; });
    /* pregos de montante em guia: por ponta de cada peça vertical */
    var vert = res.pecas.filter(function (x) { return x.grupo === "madeira" && /^(montante|ombreira|cripple)/.test(x.tipo); });
    q.pregoMontante = vert.length * 2 * P.pregosPorExtremidade;
    q.pregoGuiaSup = ceilT(L / (P.espPregoGuiaSup / 1000)) + 1;
    if (res.empena) {      /* a guia superior segue a água: o comprimento é o ao longo dela, em cada peça */
      var lgs = 0, ngs = 0; res.pecas.forEach(function (x) { if (x.tipo === "guia-superior-1") { lgs += x.comp; ngs++; } });
      q.pregoGuiaSup = ceilT(lgs / (P.espPregoGuiaSup / 1000)) + ngs;
    }
    var pv = 0; res.pecas.forEach(function (x) { if (x.tipo === "verga") pv += 2 * (ceilT((x.u1 - x.u0) / (P.espPregoVerga / 1000)) + 1); });
    q.pregoVerga = pv;
    /* OSB: borda e campo */
    var pB = 0, pC = 0;
    res.pecas.forEach(function (x) {
      if (x.tipo !== "osb") return;
      var per = x.pol ? perimPol(x.pol) : 2 * ((x.u1 - x.u0) + (x.y1 - x.y0));
      pB += ceilT(per / (P.espOsbBorda / 1000));
      var internos = 0;
      vert.forEach(function (m) { var c = (m.u0 + m.u1) / 2; if (c > x.u0 + res.b / 2 + 1e-6 && c < x.u1 - res.b / 2 - 1e-6 && m.y0 < x.y1 && m.y1 > x.y0) internos += Math.min(m.y1, x.y1) - Math.max(m.y0, x.y0); });
      pC += ceilT(internos / (P.espOsbCampo / 1000));
    });
    q.osbBorda = pB; q.osbCampo = pC; q.osbFixacoes = pB + pC;
    /* ancoragem: chumbadores na guia inferior (fora das portas) e hold-down nas pontas e cantos */
    var portas = vaos.filter(function (v) { return v.porta; });
    q.chumbadores = posChumbadores(res).length;
    /* canto = hold-down dividido entre as duas paredes (0,5 em cada); pé de T = nenhum (a parede de apoio é quem ancora); ponta livre = 1 */
    function hdPonta(t) { return t === "L" || t === "Lb" ? 0.5 : (t === "T" ? 0 : 1); }
    q.holdDown = hdPonta(res.pontas.ini) + hdPonta(res.pontas.fim);
    /* camadas */
    var lam = [];
    res.camadas.forEach(function (k) {
      if (k.face === "nucleo") return;
      lam.push({ id: k.id, rotulo: k.rotulo, e_mm: r4(k.e * 1000), area_m2: r4(areaLiq) });
    });
    q.camadas = lam;
    var tem = function (rx) { return res.camadas.some(function (k) { return rx.test(k.id); }); };
    q.membrana_m2 = tem(/^membrana/) ? r4(areaLiq * (1 + P.sobreposicaoMembrana)) : 0;
    q.la_m2 = r4(areaLiq);
    var gessos = res.camadas.filter(function (k) { return /gesso/.test(k.id); });
    q.gessoCamadas = gessos.length;
    /* parafuso do gesso: 1 a cada espParafusoGesso ao longo de cada LINHA de montante que a placa toca (grade, reis, jacks, cripples, encontro,
       extremo) + as bordas horizontais (guia inferior fora das portas e guia superior). O canto (2 ou 3 montantes lado a lado) conta UMA linha
       por face — a placa não prende nos três — e a ponta "Lb"/"T" já tem o seu montante de ponta na lista. */
    var altVert = 0, hCanto = H - 3 * res.b, nCanto = 0;
    function altDe(m) { return m.pol ? (m.comp + (m.compMin != null ? m.compMin : m.comp)) / 2 : m.y1 - m.y0; }    /* empena: altura média do montante cortado */
    vert.forEach(function (m) { if (m.tipo === "montante-canto") { hCanto = altDe(m); return; } altVert += altDe(m); });
    if (res.pontas.ini === "L") nCanto++;
    if (res.pontas.fim === "L") nCanto++;
    altVert += nCanto * hCanto;
    var larguraPortas = 0; portas.forEach(function (v) { larguraPortas += v.x1 - v.x0; });
    var horiz = ceilT(Math.max(0, L - larguraPortas) / (P.espParafusoGesso / 1000)) + ceilT(L / (P.espParafusoGesso / 1000));
    q.parafusoGessoPorCamada = ceilT(altVert / (P.espParafusoGesso / 1000)) + horiz;
    q.parafusoGesso = gessos.length * q.parafusoGessoPorCamada;
    q.fitaVaos_m = r4(perim); q.selanteVaos_m = r4(perim); q.espumaVaos_m = r4(perim);
    q.blocos = (res.contagem.bloco || 0) + (res.contagem.bloqueador || 0);
    return q;
  }

  /* ===================================================== DA PAREDE DO MODELADOR */
  function ehWf(c) { return !!(c && c.tipo === "parede" && c.tipoParede && c.tipoParede.wf && arr(c.tipoParede.camadas).length); }

  /* o que a ponta é para o quadro: sem corte = livre; corte sem "face" = pé de T (a ponta morre no meio de outra parede);
     com face = canto em L — a parede que PASSA (o corte vai além da face, até o canto de fora) e a meia-esquadria montam o arranjo de
     canto ("L"); a que ENCOSTA (corte aquém da face) leva só 1 montante de ponta ("Lb"). Sem isso o canto saía em dobro. */
  function tipoPontaUniao(un, fim) {
    var cut = fim ? un.fim : un.ini, face = fim ? un.faceFim : un.faceIni;
    if (!cut || !isFinite(Number(cut.c0))) return "livre";
    if (!face || !isFinite(Number(face.c0))) return "T";
    var d = fim ? Number(cut.c0) - Number(face.c0) : Number(face.c0) - Number(cut.c0);
    if (Math.abs(d) < 1e-4) return "L";
    return d > 0 ? "L" : "Lb";
  }

  /* TOPO INCLINADO (fase 2C): o BIM guarda o topo da parede em `c.topo` = [{ u0, u1, a, b }] (js/bimarq.js topoParede): u = distância ao CENTRO da
     parede ao longo do eixo e y = a + b·u na cota ABSOLUTA do mundo. Aqui vira o topo no sistema do quadro (u a partir da ponta inicial da parede, y a
     partir da base). Só há empena quando algum trecho do corpo do quadro [u0, u1] é inclinado (|b| > 1e-4); topo plano (mesmo mais alto ou mais baixo
     que `altura`) segue como sempre, o quadro retangular de `altura`. */
  function topoDaCaixa(c, u0, u1) {
    var tp = arr(c && c.topo); if (!tp.length) return null;
    var L = num(c.comprimento, 0), base = num(c.cy, 0) - num(c.altura, 0) / 2, segs = [], inclinado = false;
    tp.forEach(function (sg) {
      var a = num(sg.u0, -1e9) + L / 2, z = num(sg.u1, 1e9) + L / 2, b = num(sg.b, 0);
      if (z <= u0 + 1e-6 || a >= u1 - 1e-6) return;
      a = Math.max(a, u0); z = Math.min(z, u1);
      if (!(z - a > 1e-6)) return;
      if (Math.abs(b) > 1e-4) inclinado = true;
      segs.push({ u0: r6(a), u1: r6(z), a: r6(num(sg.a, 0) - b * L / 2 - base), b: r6(b) });
    });
    if (!inclinado || !segs.length) return null;
    segs.sort(function (p, q) { return p.u0 - q.u0; });
    segs[0].u0 = r6(Math.min(segs[0].u0, u0)); segs[segs.length - 1].u1 = r6(Math.max(segs[segs.length - 1].u1, u1));
    var hMax = 0;
    segs.forEach(function (sg) { [sg.u0, sg.u1].forEach(function (u) { var y = sg.a + sg.b * u; if (y > hMax) hMax = y; }); });
    return { segs: segs, hMax: r6(hMax) };
  }
  /* vaos = o `aceitos` do BimEdit.vaosNaParede (local da parede: x de −L/2 a L/2, y da base) */
  function daCaixa(c, vaos) {
    if (!ehWf(c)) return null;
    var L = num(c.comprimento, 0), un = c.uniao || {};
    var u0 = un.ini && isFinite(Number(un.ini.c0)) ? Number(un.ini.c0) + L / 2 : 0;
    var u1 = un.fim && isFinite(Number(un.fim.c0)) ? Number(un.fim.c0) + L / 2 : L;
    if (!(u1 - u0 > 0.15)) { u0 = 0; u1 = L; }
    var Le = u1 - u0;
    var tp = topoDaCaixa(c, u0, u1);
    return {
      id: String(c.id), L: Le, H: tp ? tp.hMax : num(c.altura, 0), t: num(c.espessura, 0), deslocU: u0, topo: tp ? tp.segs : null,
      vaos: arr(vaos).map(function (v) { return { id: v.id, x0: num(v.x0, 0) + L / 2 - u0, x1: num(v.x1, 0) + L / 2 - u0, y0: num(v.y0, 0), y1: num(v.y1, 0) }; }),
      encontros: arr(un.abut).map(function (ab) { return { u: (num(ab.u0, 0) + num(ab.u1, 0)) / 2 + L / 2 - u0, larg: Math.abs(num(ab.u1, 0) - num(ab.u0, 0)) }; }),
      vazios: arr(un.cruz).filter(function (g) { return g && g.a && g.b; }).map(function (g) { return { u0: num(g.a.c0, 0) + L / 2 - u0, u1: num(g.b.c0, 0) + L / 2 - u0 }; }),
      pontas: { ini: tipoPontaUniao(un, false), fim: tipoPontaUniao(un, true) },
      corte: { ini: un.ini && isFinite(Number(un.ini.c0)) ? { c0: Number(un.ini.c0) + L / 2, c1: num(un.ini.c1, 0) } : null, fim: un.fim && isFinite(Number(un.fim.c0)) ? { c0: Number(un.fim.c0) + L / 2, c1: num(un.fim.c1, 0) } : null },
      wf: c.tipoParede.wf, wfInst: c.wf || null, camadas: c.tipoParede.camadas, inverterFaces: !!c.inverterFaces
    };
  }
  function chaveDe(p) {
    function q(v) { return typeof v === "number" ? r4(v) : v; }
    return JSON.stringify([q(p.L), q(p.H), q(p.t), q(p.deslocU), p.wf, p.wfInst, arr(p.camadas).map(function (k) { return [k.id, q(k.e)]; }),
      arr(p.vaos).map(function (v) { return [v.id, q(v.x0), q(v.x1), q(v.y0), q(v.y1)]; }),
      arr(p.encontros).map(function (e) { return [q(e.u), q(e.larg)]; }), arr(p.vazios).map(function (z) { return [q(z.u0), q(z.u1)]; }), p.pontas, p.corte || null, !!p.inverterFaces, p.topo ? p.topo.map(function (g) { return [q(g.u0), q(g.u1), q(g.a), q(g.b)]; }) : null]);
  }
  var _cache = {}, _nCache = 0, _estat = { gerados: 0, reaproveitados: 0 };
  function limparCache() { _cache = {}; _nCache = 0; }
  /* o quadro da parede, com CACHE pela chave: a mesma parede = o MESMO objeto; esticou, mexeu no vão ou mudou o tipo = outro */
  function paraParede(c, vaos) {
    var p = daCaixa(c, vaos); if (!p) return null;
    var pw = { id: p.id, L: p.L, H: p.H, t: p.t, deslocU: p.deslocU, vaos: p.vaos, encontros: p.encontros, vazios: p.vazios, pontas: p.pontas,
      wf: mesclaWf(p.wf, p.wfInst), camadas: p.camadas, inverterFaces: p.inverterFaces, corte: p.corte, topo: p.topo };
    var k = chaveDe({ L: p.L, H: p.H, t: p.t, deslocU: p.deslocU, wf: pw.wf, wfInst: null, camadas: p.camadas, vaos: p.vaos, encontros: p.encontros, vazios: p.vazios, pontas: p.pontas, corte: p.corte, inverterFaces: p.inverterFaces, topo: p.topo });
    var e = _cache[p.id];
    /* ⚠ a POSIÇÃO da parede (cx, cy, cz, rotY) não entra na chave do quadro (mover/girar não muda as peças, só o lugar delas), mas o lugar
       tem de ser o ATUAL a cada chamada: antes `res.parede` ficava com o da 1ª geração e a planta desenhava o quadro onde a parede ESTAVA. */
    var pose = { cx: num(c.cx, 0), cy: num(c.cy, 0), cz: num(c.cz, 0), rotY: num(c.rotY, 0), comprimento: num(c.comprimento, 0), altura: num(c.altura, 0), inverterFaces: !!c.inverterFaces };
    if (e && e.chave === k) { _estat.reaproveitados++; e.res.parede = pose; return e.res; }
    var res = gerar(pw); res.chave = k; res.parede = pose;
    if (!e) { _nCache++; if (_nCache > 4000) { limparCache(); _nCache = 1; } }
    _cache[p.id] = { chave: k, res: res }; _estat.gerados++;
    return res;
  }
  function mesclaWf(a, b) { return params(a, b); }
  function estatisticas() { return { gerados: _estat.gerados, reaproveitados: _estat.reaproveitados, emCache: _nCache }; }

  /* peça local → caixa no mundo (BoxGeometry(comp, alt, esp) girada em Y por rotY, como as caixas do B2) */
  function emMundo(parede, res, peca) {
    var co = Math.cos(num(parede.rotY, 0)), si = Math.sin(num(parede.rotY, 0)), L = num(parede.comprimento, res.L);
    var uc = (peca.u0 + peca.u1) / 2 - L / 2, wc = (peca.w0 + peca.w1) / 2 * (res.inverterFaces || parede.inverterFaces ? -1 : 1);
    return { x: r6(num(parede.cx, 0) + uc * co + wc * si), y: r6(num(parede.cy, 0) - num(parede.altura, res.H) / 2 + (peca.y0 + peca.y1) / 2),
             z: r6(num(parede.cz, 0) - uc * si + wc * co), rotY: num(parede.rotY, 0), comp: r6(peca.u1 - peca.u0), alt: r6(peca.y1 - peca.y0), esp: r6(peca.w1 - peca.w0) };
  }

  /* peça com contorno recortado (empena) → triângulos do MUNDO do prisma (u, y) × (w0..w1): { pos: [x,y,z, …] } para o 3D. Contorno convexo ou não: corte de orelhas. */
  function triangulos(pol) {
    var idx = [], n = pol.length, i, area = 0;
    for (i = 0; i < n; i++) { var a0 = pol[i], b0 = pol[(i + 1) % n]; area += a0[0] * b0[1] - b0[0] * a0[1]; }
    var ord = []; for (i = 0; i < n; i++) ord.push(area >= 0 ? i : n - 1 - i);
    var guard = 0;
    function cruzP(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    while (ord.length > 3 && guard++ < 500) {
      var feito = false;
      for (i = 0; i < ord.length; i++) {
        var ia = ord[(i + ord.length - 1) % ord.length], ib = ord[i], ic = ord[(i + 1) % ord.length], A = pol[ia], B = pol[ib], C = pol[ic];
        if (cruzP(A, B, C) <= 1e-12) continue;
        var dentro = false, j;
        for (j = 0; j < ord.length; j++) { var k2 = ord[j]; if (k2 === ia || k2 === ib || k2 === ic) continue; var Pp = pol[k2]; if (cruzP(A, B, Pp) >= -1e-12 && cruzP(B, C, Pp) >= -1e-12 && cruzP(C, A, Pp) >= -1e-12) { dentro = true; break; } }
        if (dentro) continue;
        idx.push([ia, ib, ic]); ord.splice(i, 1); feito = true; break;
      }
      if (!feito) break;
    }
    if (ord.length === 3) idx.push([ord[0], ord[1], ord[2]]);
    return idx;
  }
  function malhaPol(parede, res, peca, folga) {
    if (!peca || !peca.pol) return null;
    folga = num(folga, 0);                         /* folga (m) em cada face da espessura: o 3D normal entra eW/2 de cada lado para não coincidir com a casca (z-fighting) */
    var co = Math.cos(num(parede.rotY, 0)), si = Math.sin(num(parede.rotY, 0)), L = num(parede.comprimento, res.L), sgn = (res.inverterFaces || parede.inverterFaces ? -1 : 1);
    var base = num(parede.cy, 0) - num(parede.altura, res.H) / 2, pos = [], pol = peca.pol, tri = triangulos(pol), w0 = peca.w0 + folga, w1 = peca.w1 - folga;
    if (!(w1 > w0)) { w0 = peca.w0; w1 = peca.w1; }
    function mundo(u, y, w) { var uc = u - L / 2, wc = w * sgn; return [num(parede.cx, 0) + uc * co + wc * si, base + y, num(parede.cz, 0) - uc * si + wc * co]; }
    /* face invertida (sgn < 0) espelha a peça em w: a ordem dos vértices vira, senão as normais apontam para DENTRO */
    function push3(a, b, c) { if (sgn < 0) pos.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]); else pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
    tri.forEach(function (t) {
      var A0 = mundo(pol[t[0]][0], pol[t[0]][1], w0), B0 = mundo(pol[t[1]][0], pol[t[1]][1], w0), C0 = mundo(pol[t[2]][0], pol[t[2]][1], w0);
      var A1 = mundo(pol[t[0]][0], pol[t[0]][1], w1), B1 = mundo(pol[t[1]][0], pol[t[1]][1], w1), C1 = mundo(pol[t[2]][0], pol[t[2]][1], w1);
      push3(A0, C0, B0); push3(A1, B1, C1);
    });
    pol.forEach(function (q, i) {
      var r = pol[(i + 1) % pol.length], a0 = mundo(q[0], q[1], w0), b0 = mundo(r[0], r[1], w0), a1 = mundo(q[0], q[1], w1), b1 = mundo(r[0], r[1], w1);
      push3(a0, b0, b1); push3(a0, b1, a1);
    });
    return { pos: pos };
  }

  /* ============================================================ PLANTA (corte da parede) */
  /* O que o corte horizontal à altura `h` (mundo) mostra desta parede: cada camada com a espessura real, os montantes
     cortados (38×89 na posição exata) e a cota de espaçamento entre eixos. Coordenadas do MUNDO (x, z) = tela (x, y).
     Os vãos que o plano atravessa abrem a camada; ombreiras, vergas e blocos que o plano corta aparecem como madeira cortada. */
  function planta(c, vaos, h) {
    var res = paraParede(c, vaos); if (!res || !res.ok) return null;
    var par = res.parede, base = par.cy - par.altura / 2, yh = h - base;
    if (yh < 0 || yh > Math.max(par.altura, res.H)) return null;
    var co = Math.cos(par.rotY), si = Math.sin(par.rotY), L = par.comprimento, sg = par.inverterFaces ? -1 : 1;
    function mundo(u, w) { return [r4(par.cx + (u - L / 2) * co + sg * w * si), r4(par.cz - (u - L / 2) * si + sg * w * co)]; }
    var desl = res.deslocU, Le = res.L, u0 = desl, u1 = desl + Le;
    var cortes = res.vaos.filter(function (v) { return yh > v.y0 + 1e-6 && yh < v.y1 - 1e-6; }).sort(function (a, b2) { return a.x0 - b2.x0; });
    var segs = [], cur = u0;
    cortes.forEach(function (v) { if (v.x0 > cur + 0.005) segs.push([cur, v.x0]); cur = Math.max(cur, v.x1); });
    if (u1 > cur + 0.005) segs.push([cur, u1]);
    var itens = [];
    res.camadas.forEach(function (k) {
      var fino = k.e < 0.001 || k.hach === "membrana" || k.hach === "vapor";
      segs.forEach(function (s) {
        if (fino) { var wm = (k.w0 + k.w1) / 2; itens.push({ k: "linha", hach: k.hach, camada: k.id, a: mundo(s[0], wm), b: mundo(s[1], wm) }); }
        else itens.push({ k: "camada", hach: k.hach, camada: k.id, rotulo: k.rotulo, e: k.e, pts: [mundo(s[0], k.w0), mundo(s[1], k.w0), mundo(s[1], k.w1), mundo(s[0], k.w1)] });
      });
    });
    var studs = [];
    res.pecas.forEach(function (q) {
      if (q.grupo !== "madeira") return;
      if (yh < q.y0 - 1e-6 || yh > q.y1 + 1e-6) return;
      var qa = q.u0, qb = q.u1;
      if (q.pol) { var iv = corteHPol(q.pol, yh); if (!iv) return; qa = iv[0]; qb = iv[1]; }      /* empena: o corte na altura do plano pega só o que a peça cortada tem ali */
      itens.push({ k: "montante", tipo: q.tipo, id: q.id, pts: [mundo(qa, q.w0), mundo(qb, q.w0), mundo(qb, q.w1), mundo(qa, q.w1)] });
      if (/^montante/.test(q.tipo)) studs.push((q.u0 + q.u1) / 2);
    });
    studs.sort(function (a, b2) { return a - b2; });
    var cotas = [], esp = res.params.espac / 1000;
    for (var i = 0; i + 1 < studs.length; i++) {
      var g = studs[i + 1] - studs[i];
      if (g < 0.05 || g > esp * 1.5 + 1e-6) continue;
      /* canto em L ou pé de T: a cota da parede vizinha corre perpendicular a esta e o texto das duas se atropelava no canto/no encontro
         (conferido na tela, 20/11/2026). Perto da ponta que encosta em outra parede (menos de 0,5 m) a cota não é desenhada. */
      var mid = (studs[i] + studs[i + 1]) / 2, cantoIni = res.pontas.ini !== "livre", cantoFim = res.pontas.fim !== "livre";
      if ((cantoIni && mid - u0 < 0.5) || (cantoFim && u1 - mid < 0.5)) continue;
      cotas.push({ a: mundo(studs[i], 0), b: mundo(studs[i + 1], 0), texto: String(mm(g)), u: (studs[i] + studs[i + 1]) / 2 });
    }
    return { id: res.id, itens: itens, cotas: cotas, n: [r4(sg * si), r4(sg * co)], metade: res.t / 2, espac: res.params.espac };
  }

  /* ================================================================ QUANTITATIVO (modelo inteiro) */
  function item(nome, un, qtd, obs, extra) {
    var o = { grupo: "Wood Frame", item: nome, un: un, qtd: r4(qtd), sinapi: null, orcarAParte: true, obs: obs || null };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }
  var PEND = "sem composição SINAPI neste sistema: orçar à parte (código nunca inventado)";
  /* ---- SINAPI (fase 2C): só códigos que EXISTEM na base do sistema (data/sinapi-MG-2026-06.json, SINAPI 06/2026 MG); o teste tools/test-woodframe-f2c.js confere CADA um
     (código, unidade e descrição) contra a base. NÃO existe composição de Wood Frame, nem insumo de OSB/membrana hidrófuga/hold-down/fita de esquadria nessa base:
     esses ficam pendentes, com o motivo. `aprox`: o insumo é o mais próximo (a bitola do projeto não consta), e vai escrito. */
  var SINAPI_BASE = "SINAPI 06/2026 (MG)";
  var SINAPI_WF = {
    madeira:    { cod: "4006",   un: "M3",    desc: "MADEIRA SERRADA EM PINUS, MISTA OU EQUIVALENTE DA REGIAO - BRUTA" },
    pregoMont:  { cod: "39027",  un: "KG",    desc: "PREGO DE ACO POLIDO COM CABECA 19 X 36 (3 1/4 X 9)", aprox: true, d: 3.76, L: 82.55,
                  obs: "o prego do cálculo é 3,4 × 82,8 mm (EN 1995); o insumo mais próximo é o 19 × 36 (3 1/4 × 9: 3,76 × 82,55 mm) — peso por prego calculado da geometria desse insumo" },
    pregoOsb:   { cod: "5068",   un: "KG",    desc: "PREGO DE ACO POLIDO COM CABECA 17 X 21 (2 X 11)", aprox: true, d: 3.05, L: 50.8,
                  obs: "fixação do OSB: o insumo mais próximo do prego de 2 pol (3,05 × 50,8 mm) — bitola definitiva pelo cálculo/fornecedor" },
    selante:    { cod: "142",    un: "310ML", desc: "SELANTE ELASTICO MONOCOMPONENTE A BASE DE POLIURETANO (PU) PARA JUNTAS DIVERSAS" },
    espuma:     { cod: "38124",  un: "UN",    desc: "ESPUMA EXPANSIVA DE POLIURETANO, APLICACAO MANUAL - 500 ML" },
    gessoST:    { cod: "39413",  un: "M2",    desc: "PLACA / CHAPA DE GESSO ACARTONADO, STANDARD (ST), COR BRANCA, E = 12,5 MM, 1200 X 2400 MM (L X C)" },
    gessoRU:    { cod: "39417",  un: "M2",    desc: "PLACA / CHAPA DE GESSO ACARTONADO, RESISTENTE A UMIDADE (RU), COR VERDE, E = 12,5 MM, 1200 X 2400 MM (L X C)" },
    cimenticia: { cod: "11062",  un: "M2",    desc: "PLACA CIMENTICIA LISA E = 10 MM, DE 1,20 X *2,50* M (SEM AMIANTO)" },
    la:         { cod: "104725", un: "M2",    desc: "INSTALAÇÃO DE ISOLAMENTO COM LÃ DE VIDRO EM PAREDE DRYWALL. AF_07/2023", obs: "composição de instalação em parede drywall; preço 0 na base MG 06/2026 (sem preço na UF)" }
  };
  /* o que NÃO tem código na base e por quê (a tela e o teste leem daqui) */
  var SINAPI_PENDENTE = {
    osb: "a base tem só composições de tapume e de parede TEMPORÁRIA em OSB (105117…105134, 105118), não a chapa de OSB estrutural",
    membrana: "a base não tem membrana hidrófuga/permeável ao vapor de parede (só subcobertura de telhado e camada separadora de piso)",
    hold: "a base não tem hold-down; o chumbador zincado de 1/2 pol × 75 mm (11977) é curto para guia de 38 mm + ancoragem e o parabolt (13279) vem por kg: diâmetro e comprimento pelo cálculo/fornecedor",
    fita: "a base não tem fita de vedação de esquadria (só fita de espuma 43727 e a aluminizada de subcobertura 42529, de outra função)",
    paraf: "o único parafuso de gesso da base (39438, GN55) é para perfil metálico drywall, não para quadro de madeira",
    madeiraSemSecao: "seção sem medida de compra no catálogo Nibra: cotar com o fornecedor"
  };
  /* RENDIMENTOS e perdas (parâmetros; opc.compra sobrescreve): TODOS "a confirmar com o fornecedor" — nenhum vem de norma ou de manual */
  var COMPRA_PADRAO = {
    perdaMadeira: 0.10, perdaPrego: 0.05, perdaSelante: 0.10, perdaEspuma: 0.10, perdaFita: 0.10, perdaMembrana: 0.10, perdaPlaca: 0.10,
    selanteCordaoMm: [10, 6],        /* seção do cordão no perímetro do vão (largura × profundidade, mm) → ml por metro */
    selanteCartuchoMl: 310,          /* o cartucho do insumo 142 */
    espumaMPorLata: 10,              /* m de cordão por lata de 500 ml (rendimento de partida) */
    fitaRoloM: 25, membranaRoloM2: 75, parafusoCaixaUn: 1000, pregoCaixaKg: 18, placaM2: 2.88   /* 1,20 × 2,40 m */
  };
  function mesclaCompra(o) { var c = {}, k; for (k in COMPRA_PADRAO) c[k] = COMPRA_PADRAO[k]; if (o && typeof o === "object") for (k in o) if (o[k] != null) c[k] = o[k]; return c; }
  function sinRef(ref) { var x = SINAPI_WF[ref]; return x ? { codigo: x.cod, un: x.un, descricao: x.desc, base: SINAPI_BASE, aproximado: !!x.aprox, obs: x.obs || null } : null; }
  function pesoPrego(ref) { var x = SINAPI_WF[ref]; return Math.PI / 4 * x.d * x.d * x.L * 7.85e-6; }     /* kg por prego: haste cilíndrica de aço (7850 kg/m³), sem a cabeça */
  /* os vãos de cada parede: do chamador (opc.vaos) ou, no navegador, do BimEdit + a avaliação das famílias do BIM */
  function vaosDasParedes(estado, opc) {
    if (opc && opc.vaos) return opc.vaos;
    try {
      var BE = global.BimEdit || (typeof require === "function" ? require("./bimedit.js") : null), BM = global.BIM;
      var fn = opc && opc.famAval ? opc.famAval : (BM && BM.familiaAvaliar ? function (f, t, i) { return BM.familiaAvaliar(f, t, i); } : null);
      if (BE && BE.vaosDasParedes && fn) return BE.vaosDasParedes(estado, fn) || {};
    } catch (e) { /* sem vãos: o quadro sai sem abertura e o aviso diz */ }
    return {};
  }
  function quantitativo(estado, opc) {
    opc = opc || {};
    var vaosTodos = null;
    var itens = [], avisos = [], A = { paredes: 0 }, mad = {}, camadas = {}, pend = [];
    var interf = [], extSet = {}, parafSet = {}, tot = { osb: 0, osbArea: 0, pregoMontante: 0, pregoGuiaSup: 0, pregoVerga: 0, osbFix: 0, chumb: 0, hd: 0, membr: 0, la: 0, gessoParaf: 0, fita: 0, selante: 0, espuma: 0 }, osbE = {};
    arr(estado && estado.caixas).forEach(function (c) {
      if (!ehWf(c)) return;
      if (!vaosTodos) vaosTodos = vaosDasParedes(estado, opc);
      var vz = vaosTodos[c.id] ? vaosTodos[c.id].aceitos : [];
      var r = paraParede(c, vz); if (!r || !r.ok) { avisos.push("Wood Frame " + c.id + ": " + (r && r.motivo ? r.motivo : "quadro não gerado")); return; }
      A.paredes++;
      r.avisos.forEach(function (a) { avisos.push("Parede " + c.id + ": " + a); });
      var q = r.q; extSet[r.params.pregosPorExtremidade] = 1; parafSet[r.params.espParafusoGesso] = 1;
      q.madeira.forEach(function (m) {
        var k = m.secao + "|" + (m.compra || ""), s = mad[k] || (mad[k] = { secao: m.secao, compra: m.compra, n: 0, comp: 0, vol: 0, bruto: 0 });
        s.n += m.n; s.comp += m.comp_m; s.vol += m.vol_m3;
      });
      r.pecas.forEach(function (x) {
        if (x.grupo !== "madeira") return;
        var k = x.secao + "|" + (x.compra || ""), s = mad[k], mc = /^(\d+)x(\d+)$/.exec(String(x.compra || ""));
        if (s) s.bruto += mc ? (+mc[1] / 1000) * (+mc[2] / 1000) * x.comp : x.vol;
      });
      tot.osb += r.osb.chapas; tot.osbArea += r.osb.area; if (r.osb.e) osbE[r.osb.e] = 1;
      tot.pregoMontante += q.pregoMontante; tot.pregoGuiaSup += q.pregoGuiaSup; tot.pregoVerga += q.pregoVerga; tot.osbFix += q.osbFixacoes;
      tot.chumb += q.chumbadores; tot.hd += q.holdDown; tot.membr += q.membrana_m2; tot.la += q.la_m2; tot.gessoParaf += q.parafusoGesso;
      tot.fita += q.fitaVaos_m; tot.selante += q.selanteVaos_m; tot.espuma += q.espumaVaos_m;
      q.camadas.forEach(function (k) { var s = camadas[k.id] || (camadas[k.id] = { rotulo: k.rotulo, e: k.e_mm, area: 0 }); s.area += k.area_m2; });
      if (r.empena && arr(r.empena.interferencias).length) interf.push("parede " + c.id + ", vão(s) " + r.empena.interferencias.join(", "));
      r.vergas.forEach(function (v) { if (v.foraTabela) pend.push("verga do vão " + v.vao + " da parede " + c.id + " acima de 3,00 m"); });
    });
    if (!A.paredes) return { itens: [], avisos: avisos, paredes: 0 };
    var ex = { woodframe: true }, CP = mesclaCompra(opc.compra);
    /* põe o código SINAPI e a UNIDADE DE COMPRA no item (a quantidade de medição fica; a de compra vai em item.compra) */
    function comCod(it, ref, compra) {
      it.sinapi = sinRef(ref); it.orcarAParte = !it.sinapi;
      if (compra) it.compra = compra;
      return it;
    }
    /* item de CONFERÊNCIA (informativo): a referência SINAPI vai em `refSinapi`, NUNCA em `sinapi` (não conta como item com código nem entra no total) */
    function comRef(it, ref, compra) {
      it.refSinapi = sinRef(ref); it.sinapi = null; it.orcarAParte = false;
      if (compra) it.compra = compra;
      return it;
    }
    function semCod(it, motivo) { it.motivoPendente = motivo; it.obs = (it.obs ? it.obs + "; " : "") + "SEM CÓDIGO NA BASE: " + motivo; return it; }
    Object.keys(mad).sort().forEach(function (k) {
      var s = mad[k], it = item("Madeira serrada do quadro Wood Frame — seção " + s.secao.replace("x", "×") + (s.compra ? " (compra: " + s.compra.replace("x", "×") + " bruta, catálogo Nibra)" : " (sem seção no catálogo: cotar com o fornecedor)"),
        "m³", s.vol, s.n + " peças, " + virg(s.comp) + " m lineares; volume líquido da seção final; pré-dimensionamento a confirmar no cálculo (NBR 7190-1:2022 / Diretriz SINAT nº 005)", ex);
      if (!s.compra) semCod(it, SINAPI_PENDENTE.madeiraSemSecao);
      else {
        comCod(it, "madeira", { un: "m³", qtd: r4(s.bruto * (1 + CP.perdaMadeira)), regra: "volume BRUTO da seção de compra (" + s.compra.replace("x", "×") + ") + " + virg(CP.perdaMadeira * 100, 0) + " % de perda (a confirmar com o fornecedor); SINAPI 4006 é madeira serrada de Pinus BRUTA, por m³" });
        it.sinapi.obs = "insumo de madeira serrada de Pinus bruta (não é composição de Wood Frame); preço por m³ do volume bruto comprado";
      }
      itens.push(it);
    });
    var osbTxt = Object.keys(osbE).map(function (e) { return virg(+e, 1); }).join(" / ");
    if (tot.osb) itens.push(semCod(item("Chapa de OSB 1,20 × 2,40 m (" + osbTxt + " mm) do contraventamento", "un", tot.osb, "uma chapa por módulo tocado pela parede (o recorte dos vãos e da empena não reaproveita sobra); " + virg(tot.osbArea) + " m² líquidos; " + PEND, ex), SINAPI_PENDENTE.osb));
    function kgPrego(nUn, ref) { return r4(nUn * pesoPrego(ref) * (1 + CP.perdaPrego)); }
    function compraPrego(nUn, ref) { var kg = kgPrego(nUn, ref); return { un: "kg", qtd: kg, caixas: ceilT(kg / CP.pregoCaixaKg - 1e-9), regra: nUn + " pregos × " + virg(pesoPrego(ref) * 1000, 2) + " g (haste de aço do insumo SINAPI " + SINAPI_WF[ref].cod + ") + " + virg(CP.perdaPrego * 100, 0) + " % de perda; caixa de " + CP.pregoCaixaKg + " kg (a confirmar com o fornecedor)" }; }
    if (tot.pregoMontante) itens.push(comCod(item("Pregos dos montantes nas guias (" + Object.keys(extSet).sort().join(" ou ") + " por ponta de montante) — prego para madeira, bitola e comprimento a definir no cálculo", "un", tot.pregoMontante, "peso pela bitola do insumo SINAPI mais próximo", ex), "pregoMont", compraPrego(tot.pregoMontante, "pregoMont")));
    if (tot.pregoGuiaSup + tot.pregoVerga) itens.push(comCod(item("Pregos das guias superiores duplas e das vergas — bitola a definir no cálculo", "un", tot.pregoGuiaSup + tot.pregoVerga, "guia superior a cada 600 mm (empena: pelo comprimento ao longo da água); verga em 2 fileiras a cada 300 mm", ex), "pregoMont", compraPrego(tot.pregoGuiaSup + tot.pregoVerga, "pregoMont")));
    if (tot.osbFix) itens.push(comCod(item("Fixação do OSB (prego ou parafuso) — borda a 150 mm, campo a 300 mm", "un", tot.osbFix, "espaçamentos são parâmetros do tipo; contado como prego", ex), "pregoOsb", compraPrego(tot.osbFix, "pregoOsb")));
    if (tot.chumb) itens.push(semCod(item("Chumbador de expansão da guia inferior na fundação (a cada 1,20 m e junto às portas)", "un", tot.chumb, "catálogo: chumbador de expansão Eurotec (eurotec-bolt-anchor*); diâmetro e classe pelo cálculo; " + PEND, ex), SINAPI_PENDENTE.hold));
    if (tot.hd) itens.push(semCod(item("Hold-down nas pontas e cantos da parede", "un", ceilT(tot.hd - 1e-9), "canto compartilhado entre duas paredes conta 0,5 em cada uma; modelo e capacidade pelo cálculo; " + PEND, ex), SINAPI_PENDENTE.hold));
    /* UMA FONTE SÓ (revisão 20/11/2026): as CAMADAS da parede (lã do núcleo, membrana, OSB, gesso, cimentícia…) já saem em m² no
       quantitativo da própria parede ("Camadas — quantitativo", js/bimedit.js/bimarq.js `camadasDe`). Aqui ficam só as peças que a camada
       não tem: madeira do quadro, pregos, parafusos, ancoragem, vedação dos vãos. Membrana, lã e camadas NÃO entram aqui de novo. */
    if (tot.fita) {
      var itF = semCod(item("Fita de vedação do perímetro dos vãos", "m", tot.fita, "catálogo: fitas Eurovent; " + PEND, ex), SINAPI_PENDENTE.fita);
      itF.compra = { un: "rolo", qtd: ceilT(tot.fita * (1 + CP.perdaFita) / CP.fitaRoloM - 1e-9), regra: virg(tot.fita) + " m + " + virg(CP.perdaFita * 100, 0) + " % de perda ÷ rolo de " + CP.fitaRoloM + " m (a confirmar com o fornecedor)" };
      itens.push(itF);
    }
    if (tot.selante) {
      var mlM = CP.selanteCordaoMm[0] * CP.selanteCordaoMm[1];           /* mm² × 1 m (1000 mm) = mm³ ÷ 1000 = ml por metro */
      itens.push(comCod(item("Selante nos vãos (perímetro)", "m", tot.selante, "cordão de " + CP.selanteCordaoMm[0] + " × " + CP.selanteCordaoMm[1] + " mm (parâmetro a confirmar com o fornecedor)", ex), "selante",
        { un: "cartucho 310 ml", qtd: ceilT(tot.selante * mlM * (1 + CP.perdaSelante) / CP.selanteCartuchoMl - 1e-9), regra: virg(tot.selante) + " m × " + virg(mlM, 0) + " ml/m + " + virg(CP.perdaSelante * 100, 0) + " % de perda ÷ cartucho de " + CP.selanteCartuchoMl + " ml (SINAPI 142 é por cartucho de 310 ml)" }));
    }
    if (tot.espuma) itens.push(comCod(item("Espuma expansiva nos vãos (perímetro)", "m", tot.espuma, "rendimento da lata a confirmar com o fornecedor", ex), "espuma",
      { un: "lata 500 ml", qtd: ceilT(tot.espuma * (1 + CP.perdaEspuma) / CP.espumaMPorLata - 1e-9), regra: virg(tot.espuma) + " m + " + virg(CP.perdaEspuma * 100, 0) + " % de perda ÷ " + CP.espumaMPorLata + " m por lata de 500 ml (rendimento de partida, a confirmar com o fornecedor)" }));
    if (tot.membr) {
      avisos.push("Wood Frame: a membrana hidrófuga sai só em 'Camadas — quantitativo' da parede; ao orçar essa camada, acrescente a sobreposição de " + virg(PADRAO.sobreposicaoMembrana * 100, 0) + " % (critério RA).");
      var itM = semCod(item("Membrana hidrófuga — unidade de compra (conferência)", "m²", tot.membr, "conferência: a camada já sai em 'Camadas — quantitativo' (não somar)", { woodframe: true, somar: false, informativo: true, inclusoEm: "Camadas — quantitativo" }), SINAPI_PENDENTE.membrana);
      itM.orcarAParte = false; itM.compra = { un: "rolo", qtd: ceilT(tot.membr * (1 + CP.perdaMembrana) / CP.membranaRoloM2 - 1e-9), regra: virg(tot.membr) + " m² (já com a sobreposição) + " + virg(CP.perdaMembrana * 100, 0) + " % de perda ÷ rolo de " + CP.membranaRoloM2 + " m² (a confirmar com o fornecedor)" };
      itens.push(itM);
    }
    if (tot.gessoParaf) {
      var itP = semCod(item("Parafuso de gesso acartonado", "un", tot.gessoParaf, "1 a cada " + Object.keys(parafSet).sort().join(" ou ") + " mm ao longo de cada linha de montante (o canto conta uma linha por face) e nas bordas horizontais; " + PEND, ex), SINAPI_PENDENTE.paraf);
      itP.compra = { un: "caixa", qtd: ceilT(tot.gessoParaf / CP.parafusoCaixaUn - 1e-9), regra: tot.gessoParaf + " un ÷ caixa de " + CP.parafusoCaixaUn + " un (a confirmar com o fornecedor)" };
      itens.push(itP);
    }
    /* as CAMADAS de placa (m², já medidas em 'Camadas — quantitativo'): só a REFERÊNCIA SINAPI e a conversão em chapas — conferência, NÃO somar */
    function refCamada(id, ref, nome, planta) {
      var cm = camadas[id]; if (!cm || !(cm.area > 0)) return;
      var it = item(nome + " — referência SINAPI e chapas (conferência)", "m²", cm.area, "conferência: a camada já sai em 'Camadas — quantitativo' (não somar)", { woodframe: true, somar: false, informativo: true, inclusoEm: "Camadas — quantitativo" });
      comRef(it, ref, { un: "chapa", qtd: ceilT(cm.area * (1 + CP.perdaPlaca) / planta - 1e-9), regra: virg(cm.area) + " m² + " + virg(CP.perdaPlaca * 100, 0) + " % de perda ÷ chapa de " + virg(planta, 2) + " m² (a confirmar com o fornecedor)" });
      itens.push(it);
    }
    refCamada("gesso_acart", "gessoST", "Gesso acartonado ST 12,5 mm", CP.placaM2); refCamada("gesso_acart_ru", "gessoRU", "Gesso acartonado RU 12,5 mm", CP.placaM2); refCamada("cimenticia_10", "cimenticia", "Placa cimentícia 10 mm", 1.2 * 2.5);
    if (tot.la > 0) { var itL = item("Lã do núcleo — referência SINAPI (conferência)", "m²", tot.la, "conferência: a camada já sai em 'Camadas — quantitativo' (não somar); SINAPI 104725 é instalação em parede drywall (sem preço na base MG)", { woodframe: true, somar: false, informativo: true, inclusoEm: "Camadas — quantitativo" }); comRef(itL, "la", null); itens.push(itL);
      avisos.push("Wood Frame: a lã do núcleo tem só REFERÊNCIA SINAPI 104725 (instalação em parede drywall) e essa composição está SEM PREÇO na base MG 06/2026 (custo 0): não entra no total; orçar à parte."); }
    pend.forEach(function (x) { avisos.push("Pendente: " + x + " — fora da tabela, calcular."); });
    /* CÁLCULO ESTRUTURAL (fase 2B, js/woodframecalc.js): opc.calculo (resultado) ou opc.calcular = true. O orçamento continua refletindo o MODELO; o cálculo só
       marca PRELIMINAR (reprova, sem solução ou premissa sem confirmação do RT), diz a força do hold-down e avisa onde a seção/espaçamento calculados diferem. */
    var calc = opc.calculo || null, WCm = global.WoodFrameCalc || (typeof require === "function" ? (function () { try { return require("./woodframecalc.js"); } catch (eW) { return null; } })() : null);
    if (!calc && opc.calcular) {
      try { if (WCm) calc = WCm.calcular({ estado: estado, vaos: vaosTodos || {}, opc: opc.calcOpc || {} }); } catch (eC) { avisos.push("Cálculo estrutural do Wood Frame: " + (eC && eC.message ? eC.message : eC)); }
    }
    var preliminar = false, prelMsg = null;
    if (interf.length) {
      /* EMPENA: a verga chega na guia superior inclinada — a verga/jacks não foram dimensionados contra o topo; o orçamento é PRELIMINAR até o RT resolver */
      preliminar = true; prelMsg = "PRELIMINAR (empena): o topo da verga interfere com a guia superior inclinada em " + interf.join("; ") + " — conferir o vão ou o telhado.";
      itens.forEach(function (x) { x.preliminar = true; x.obs = (x.obs ? x.obs + "; " : "") + "PRELIMINAR (verga × topo inclinado)"; });
    }
    /* o cálculo guardado só vale para o modelo que ele viu (assinatura das paredes de quadro e dos vãos): mudou depois = DESATUALIZADO, sem aplicar as diferenças */
    var obraAtual = typeof Gestao !== "undefined" && Gestao && Gestao._bimSel != null ? String(Gestao._bimSel) : null, cobAtual = null;     /* a obra aberta agora (o cálculo guardado é de UMA obra) */
    try { if (WCm && WCm.coberturaDoEstado && arr(estado && estado.telhados).length) { var cdq = WCm.coberturaDoEstado(estado, null); if (cdq && !cdq.erro) cobAtual = WCm.cobKey(cdq); } } catch (eK) { cobAtual = null; }
    if (calc && calc.ok && ((calc.assinatura != null && WCm && WCm.assinatura && calc.assinatura !== WCm.assinatura(estado, vaosTodos || {})) ||
        (calc.obraId != null && obraAtual != null && calc.obraId !== obraAtual) || (cobAtual != null && calc.cobKey != null && calc.cobKey !== "" && calc.cobKey !== cobAtual))) {
      preliminar = true; prelMsg = "PRELIMINAR: o cálculo estrutural do Wood Frame está DESATUALIZADO (o modelo mudou depois dele) — rode o cálculo de novo; o orçamento segue o MODELO.";
      itens.forEach(function (x) { x.preliminar = true; x.obs = (x.obs ? x.obs + "; " : "") + "PRELIMINAR (cálculo estrutural desatualizado)"; });
      calc = null;
    }
    if (calc && calc.ok) {
      var difs = [], tdMax = 0;
      Object.keys(calc.paredes).forEach(function (id) {
        var R = calc.paredes[id], mc = R.montante.calculado;
        if (!mc) difs.push(id + ": nenhum montante do catálogo atende");
        else if (mc.mudou) difs.push(id + ": montante 38×" + R.montante.modelo.secao[1] + " c/ " + R.montante.modelo.espac + " do modelo → calculado 38×" + mc.secao[1] + " c/ " + mc.espac);
        arr(R.vergas).forEach(function (v) { if (v.calculada.mudou || !v.calculada.ok) difs.push(id + " vão " + v.vao + ": verga 38×" + v.tabela.secao[1] + " da tabela → calculada 38×" + v.calculada.secao[1] + (v.calculada.ok ? "" : " (NÃO ATENDE)")); });
        if (R.contraventamento && R.contraventamento.contribui) {
          if (R.contraventamento.pregoBorda.s !== R.contraventamento.espModelo) difs.push(id + ": prego de borda do OSB a " + R.contraventamento.pregoBorda.s + " mm (modelo " + R.contraventamento.espModelo + " mm)");
          if (R.contraventamento.hdMax > tdMax) tdMax = R.contraventamento.hdMax;
        }
      });
      preliminar = !!calc.preliminar || interf.length > 0;
      itens.forEach(function (x) {
        x.calculoEstrutural = true; x.preliminar = preliminar;
        if (/^Hold-down/.test(x.item) && tdMax > 0) x.obs = (x.obs ? x.obs + "; " : "") + "força de cálculo do hold-down Td até " + virg(tdMax, 1) + " kN (NBR 7190-1:2022, memorial)";
        if (preliminar) x.obs = (x.obs ? x.obs + "; " : "") + "PRELIMINAR (cálculo estrutural)";
      });
      difs.slice().reverse().forEach(function (d) { avisos.unshift("O CÁLCULO difere do modelo — " + d + ": o orçamento reflete o MODELO até o tipo ser atualizado."); });
      if (preliminar) prelMsg = (calc.preliminar ? "PRELIMINAR (cálculo estrutural do Wood Frame): " + calc.motivosPreliminar.join("; ") + "." : "") + (interf.length ? (calc.preliminar ? " " : "") + "PRELIMINAR (empena): o topo da verga interfere com a guia superior inclinada em " + interf.join("; ") + " — conferir o vão ou o telhado." : "");
    } else if (calc && !calc.ok) avisos.push("Cálculo estrutural do Wood Frame não rodou: " + (calc.motivo || "sem resultado") + ".");
    /* sem preço: nenhum item daqui tem composição SINAPI (código nunca inventado). O total que a tela mostrar fica PARCIAL e o aviso diz quantos. */
    /* TOTAL do Wood Frame (fase 2C): soma só o que tem código E preço na base (opc.precos(codigo) → R$ por unidade do SINAPI, ou Sinapi.obter no navegador), na UNIDADE DE COMPRA quando ela
       é a do insumo (m³, kg, cartucho, lata); o resto é pendente. Enquanto houver item sem código ou sem preço o total é PARCIAL e o aviso diz quantos. */
    var PREC = typeof opc.precos === "function" ? opc.precos : (global.Sinapi && global.Sinapi.obter ? function (cd) { var z = global.Sinapi.obter(cd); return z ? Number(z.custoUnitario) : null; } : null);
    var totalRS = 0, comPreco = 0, semPrecoBase = 0, semCodigo = 0, linhasTot = [];
    itens.forEach(function (x) {
      if (x.somar === false || x.informativo) return;
      if (!x.sinapi) { semCodigo++; return; }
      var pr = PREC ? PREC(x.sinapi.codigo) : null;
      if (!PREC) return;                       /* sem consulta de preço: o item tem código, o total em R$ simplesmente não é calculado (aviso abaixo) */
      if (!(pr > 0)) { semPrecoBase++; return; }
      var qtd = x.compra && (/^(m³|kg)$/.test(x.compra.un) || /^(cartucho|lata)/.test(x.compra.un)) ? x.compra.qtd : x.qtd, valor = r4(qtd * pr);
      totalRS += valor; comPreco++; linhasTot.push({ item: x.item, codigo: x.sinapi.codigo, qtd: qtd, un: x.compra ? x.compra.un : x.un, precoUn: pr, valor: valor });
    });
    var semPreco = semCodigo + semPrecoBase;
    var resumoTotal = { total: PREC ? r4(totalRS) : null, comPreco: comPreco, semCodigo: semCodigo, semPrecoNaBase: semPrecoBase, semPreco: semPreco, parcial: semPreco > 0, base: SINAPI_BASE, linhas: linhasTot, precosConsultados: !!PREC };
    if (!PREC) avisos.push("Wood Frame: os preços do SINAPI não foram consultados (opc.precos / Sinapi.obter ausente): o total em R$ não foi calculado.");
    if (semPreco) avisos.unshift(semPreco + " itens Wood Frame sem preço (" + semCodigo + " sem composição/insumo SINAPI, " + semPrecoBase + " sem preço na base): o total do orçamento é PARCIAL até orçá-los à parte.");
    if (prelMsg) avisos.unshift(prelMsg);       /* o PRELIMINAR vai na frente de tudo */
    return { itens: itens, avisos: avisos, paredes: A.paredes, semPreco: semPreco, parcial: semPreco > 0, preliminar: preliminar, calculado: !!(calc && calc.ok), total: resumoTotal };
  }

  var WoodFrameQuadro = {
    PADRAO: PADRAO, VERGAS: VERGAS, VERGA_ACIMA: VERGA_ACIMA, VERGAS_NOTA: VERGAS_NOTA,
    params: params, vergaDe: vergaDe, gerar: gerar, ehWf: ehWf, daCaixa: daCaixa, paraParede: paraParede, emMundo: emMundo,
    SINAPI: SINAPI_WF, SINAPI_BASE: SINAPI_BASE, SINAPI_PENDENTE: SINAPI_PENDENTE, COMPRA_PADRAO: COMPRA_PADRAO, planta: planta, malhaPol: malhaPol, corteHPol: corteHPol, areaPol: areaPol, posChumbadores: posChumbadores, quantitativo: quantitativo, vaosDasParedes: vaosDasParedes, limparCache: limparCache, estatisticas: estatisticas, posCamadas: posCamadas, hachDe: hachDe
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFrameQuadro;
  else global.WoodFrameQuadro = WoodFrameQuadro;
})(typeof window !== "undefined" ? window : this);

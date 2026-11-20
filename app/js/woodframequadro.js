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
    var SEC_MONT = P.montante[0] + "x" + P.montante[1], COMPRA_MONT = "50x100";
    if (P.montante[1] !== 89) COMPRA_MONT = null;     /* 38×64 e outras: sem seção de catálogo — pendência */
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
    add("guia-superior-1", "madeira", SEC_MONT, 0, L, H - 2 * guia, H - guia, wn0, wn1, { compra: COMPRA_MONT });
    add("guia-superior-2", "madeira", SEC_MONT, 0, L, H - guia, H, wn0, wn1, { compra: COMPRA_MONT });

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
    encontros.forEach(function (e) {
      var a0 = e.u - e.larg / 2 - b, a1 = e.u - e.larg / 2, c0 = e.u + e.larg / 2, c1 = e.u + e.larg / 2 + b;
      if (a0 < 0 || c1 > L) { avisos.push("Encontro em " + virg(e.u) + " m: a parede que chega fica rente à ponta — o montante de encontro foi dispensado (a ponta já tem o seu)."); return; }
      mont("montante-encontro", a0, a1, guia, yTopoMont, { compra: COMPRA_MONT });
      mont("montante-encontro", c0, c1, guia, yTopoMont, { compra: COMPRA_MONT });
      for (var yb = guia + 0.3; yb < yTopoMont - guia; yb += P.espBlocoEncontro / 1000) bloco(a1, c0, yb);
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
    pecas.forEach(function (q) { q.comp = r4(Math.max(q.u1 - q.u0, q.y1 - q.y0, q.w1 - q.w0)); q.vol = r6((q.u1 - q.u0) * (q.y1 - q.y0) * (q.w1 - q.w0)); });
    juntas.forEach(function (j) { if (desl) j.u = r4(j.u + desl); });

    var res = { ok: true, id: String(p.id), L: L, H: H, t: num(p.t, 0), params: P, b: b, d: d, wn0: wn0, wn1: wn1, deslocU: desl,
      pecas: pecas, juntasOsb: juntas, vergas: vergas, osb: osb, avisos: avisos, vergasNota: VERGAS_NOTA,
      vaos: vaosOk.map(function (v) { return { id: v.id, x0: v.x0 + desl, x1: v.x1 + desl, y0: v.y0, y1: v.y1, porta: v.porta }; }),
      camadas: wL, inverterFaces: !!p.inverterFaces, pontas: { ini: ptIni, fim: ptFim } };
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

  /* ----------------------------------------------------------- QUANTIDADES de UMA parede */
  function quantidades(res, p) {
    var P = res.params, L = res.L, H = res.H, q = {}, i;
    var vaos = res.vaos, areaVaos = 0, perim = 0;
    vaos.forEach(function (v) { areaVaos += (v.x1 - v.x0) * (v.y1 - v.y0); perim += 2 * ((v.x1 - v.x0) + (v.y1 - v.y0)); });
    var areaLiq = Math.max(0, L * H - areaVaos);
    q.areaBruta = r4(L * H); q.areaVaos = r4(areaVaos); q.areaLiquida = r4(areaLiq); q.perimetroVaos = r4(perim);
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
    var pv = 0; res.pecas.forEach(function (x) { if (x.tipo === "verga") pv += 2 * (ceilT((x.u1 - x.u0) / (P.espPregoVerga / 1000)) + 1); });
    q.pregoVerga = pv;
    /* OSB: borda e campo */
    var pB = 0, pC = 0;
    res.pecas.forEach(function (x) {
      if (x.tipo !== "osb") return;
      var per = 2 * ((x.u1 - x.u0) + (x.y1 - x.y0));
      pB += ceilT(per / (P.espOsbBorda / 1000));
      var internos = 0;
      vert.forEach(function (m) { var c = (m.u0 + m.u1) / 2; if (c > x.u0 + res.b / 2 + 1e-6 && c < x.u1 - res.b / 2 - 1e-6 && m.y0 < x.y1 && m.y1 > x.y0) internos += Math.min(m.y1, x.y1) - Math.max(m.y0, x.y0); });
      pC += ceilT(internos / (P.espOsbCampo / 1000));
    });
    q.osbBorda = pB; q.osbCampo = pC; q.osbFixacoes = pB + pC;
    /* ancoragem: chumbadores na guia inferior (fora das portas) e hold-down nas pontas e cantos */
    var nCh = Math.max(2, ceilT(L / (P.espChumbador / 1000)) + 1), passoCh = L / (nCh - 1), pos = [];
    for (i = 0; i < nCh; i++) pos.push(i * passoCh);
    var portas = vaos.filter(function (v) { return v.porta; });
    var livres = pos.filter(function (u) { return !portas.some(function (v) { return u > v.x0 - res.deslocU - 0.02 && u < v.x1 - res.deslocU + 0.02; }); });
    q.chumbadores = livres.length + 2 * portas.length;
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
    vert.forEach(function (m) { if (m.tipo === "montante-canto") { hCanto = m.y1 - m.y0; return; } altVert += m.y1 - m.y0; });
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

  /* vaos = o `aceitos` do BimEdit.vaosNaParede (local da parede: x de −L/2 a L/2, y da base) */
  function daCaixa(c, vaos) {
    if (!ehWf(c)) return null;
    var L = num(c.comprimento, 0), un = c.uniao || {};
    var u0 = un.ini && isFinite(Number(un.ini.c0)) ? Number(un.ini.c0) + L / 2 : 0;
    var u1 = un.fim && isFinite(Number(un.fim.c0)) ? Number(un.fim.c0) + L / 2 : L;
    if (!(u1 - u0 > 0.15)) { u0 = 0; u1 = L; }
    var Le = u1 - u0;
    return {
      id: String(c.id), L: Le, H: num(c.altura, 0), t: num(c.espessura, 0), deslocU: u0,
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
      arr(p.encontros).map(function (e) { return [q(e.u), q(e.larg)]; }), arr(p.vazios).map(function (z) { return [q(z.u0), q(z.u1)]; }), p.pontas, p.corte || null, !!p.inverterFaces]);
  }
  var _cache = {}, _nCache = 0, _estat = { gerados: 0, reaproveitados: 0 };
  function limparCache() { _cache = {}; _nCache = 0; }
  /* o quadro da parede, com CACHE pela chave: a mesma parede = o MESMO objeto; esticou, mexeu no vão ou mudou o tipo = outro */
  function paraParede(c, vaos) {
    var p = daCaixa(c, vaos); if (!p) return null;
    var pw = { id: p.id, L: p.L, H: p.H, t: p.t, deslocU: p.deslocU, vaos: p.vaos, encontros: p.encontros, vazios: p.vazios, pontas: p.pontas,
      wf: mesclaWf(p.wf, p.wfInst), camadas: p.camadas, inverterFaces: p.inverterFaces, corte: p.corte };
    var k = chaveDe({ L: p.L, H: p.H, t: p.t, deslocU: p.deslocU, wf: pw.wf, wfInst: null, camadas: p.camadas, vaos: p.vaos, encontros: p.encontros, vazios: p.vazios, pontas: p.pontas, corte: p.corte, inverterFaces: p.inverterFaces });
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

  /* ============================================================ PLANTA (corte da parede) */
  /* O que o corte horizontal à altura `h` (mundo) mostra desta parede: cada camada com a espessura real, os montantes
     cortados (38×89 na posição exata) e a cota de espaçamento entre eixos. Coordenadas do MUNDO (x, z) = tela (x, y).
     Os vãos que o plano atravessa abrem a camada; ombreiras, vergas e blocos que o plano corta aparecem como madeira cortada. */
  function planta(c, vaos, h) {
    var res = paraParede(c, vaos); if (!res || !res.ok) return null;
    var par = res.parede, base = par.cy - par.altura / 2, yh = h - base;
    if (yh < 0 || yh > par.altura) return null;
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
      itens.push({ k: "montante", tipo: q.tipo, id: q.id, pts: [mundo(q.u0, q.w0), mundo(q.u1, q.w0), mundo(q.u1, q.w1), mundo(q.u0, q.w1)] });
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
    var extSet = {}, parafSet = {}, tot = { osb: 0, osbArea: 0, pregoMontante: 0, pregoGuiaSup: 0, pregoVerga: 0, osbFix: 0, chumb: 0, hd: 0, membr: 0, la: 0, gessoParaf: 0, fita: 0, selante: 0, espuma: 0 }, osbE = {};
    arr(estado && estado.caixas).forEach(function (c) {
      if (!ehWf(c)) return;
      if (!vaosTodos) vaosTodos = vaosDasParedes(estado, opc);
      var vz = vaosTodos[c.id] ? vaosTodos[c.id].aceitos : [];
      var r = paraParede(c, vz); if (!r || !r.ok) { avisos.push("Wood Frame " + c.id + ": " + (r && r.motivo ? r.motivo : "quadro não gerado")); return; }
      A.paredes++;
      r.avisos.forEach(function (a) { avisos.push("Parede " + c.id + ": " + a); });
      var q = r.q; extSet[r.params.pregosPorExtremidade] = 1; parafSet[r.params.espParafusoGesso] = 1;
      q.madeira.forEach(function (m) {
        var k = m.secao + "|" + (m.compra || ""), s = mad[k] || (mad[k] = { secao: m.secao, compra: m.compra, n: 0, comp: 0, vol: 0 });
        s.n += m.n; s.comp += m.comp_m; s.vol += m.vol_m3;
      });
      tot.osb += r.osb.chapas; tot.osbArea += r.osb.area; if (r.osb.e) osbE[r.osb.e] = 1;
      tot.pregoMontante += q.pregoMontante; tot.pregoGuiaSup += q.pregoGuiaSup; tot.pregoVerga += q.pregoVerga; tot.osbFix += q.osbFixacoes;
      tot.chumb += q.chumbadores; tot.hd += q.holdDown; tot.membr += q.membrana_m2; tot.la += q.la_m2; tot.gessoParaf += q.parafusoGesso;
      tot.fita += q.fitaVaos_m; tot.selante += q.selanteVaos_m; tot.espuma += q.espumaVaos_m;
      q.camadas.forEach(function (k) { var s = camadas[k.id] || (camadas[k.id] = { rotulo: k.rotulo, e: k.e_mm, area: 0 }); s.area += k.area_m2; });
      r.vergas.forEach(function (v) { if (v.foraTabela) pend.push("verga do vão " + v.vao + " da parede " + c.id + " acima de 3,00 m"); });
    });
    if (!A.paredes) return { itens: [], avisos: avisos, paredes: 0 };
    var ex = { woodframe: true };
    Object.keys(mad).sort().forEach(function (k) {
      var s = mad[k];
      itens.push(item("Madeira serrada do quadro Wood Frame — seção " + s.secao.replace("x", "×") + (s.compra ? " (compra: " + s.compra.replace("x", "×") + " bruta, catálogo Nibra)" : " (sem seção no catálogo: cotar com o fornecedor)"),
        "m³", s.vol, s.n + " peças, " + virg(s.comp) + " m lineares; volume líquido da seção final; " + PEND + "; pré-dimensionamento a confirmar no cálculo (NBR 7190-1:2022 / Diretriz SINAT nº 005)", ex));
    });
    var osbTxt = Object.keys(osbE).map(function (e) { return virg(+e, 1); }).join(" / ");
    if (tot.osb) itens.push(item("Chapa de OSB 1,20 × 2,40 m (" + osbTxt + " mm) do contraventamento", "un", tot.osb, "uma chapa por módulo tocado pela parede (o recorte dos vãos não reaproveita sobra); " + virg(tot.osbArea) + " m² líquidos; " + PEND, ex));
    if (tot.pregoMontante) itens.push(item("Pregos dos montantes nas guias (" + Object.keys(extSet).sort().join(" ou ") + " por ponta de montante) — prego para madeira, bitola e comprimento a definir no cálculo", "un", tot.pregoMontante, PEND, ex));
    if (tot.pregoGuiaSup + tot.pregoVerga) itens.push(item("Pregos das guias superiores duplas e das vergas — bitola a definir no cálculo", "un", tot.pregoGuiaSup + tot.pregoVerga, "guia superior a cada 600 mm; verga em 2 fileiras a cada 300 mm; " + PEND, ex));
    if (tot.osbFix) itens.push(item("Fixação do OSB (prego ou parafuso) — borda a 150 mm, campo a 300 mm", "un", tot.osbFix, "espaçamentos são parâmetros do tipo; " + PEND, ex));
    if (tot.chumb) itens.push(item("Chumbador de expansão da guia inferior na fundação (a cada 1,20 m e junto às portas)", "un", tot.chumb, "catálogo: chumbador de expansão Eurotec (eurotec-bolt-anchor*); diâmetro e classe pelo cálculo; " + PEND, ex));
    if (tot.hd) itens.push(item("Hold-down nas pontas e cantos da parede", "un", ceilT(tot.hd - 1e-9), "canto compartilhado entre duas paredes conta 0,5 em cada uma; modelo e capacidade pelo cálculo; " + PEND, ex));
    /* UMA FONTE SÓ (revisão 20/11/2026): as CAMADAS da parede (lã do núcleo, membrana, OSB, gesso, cimentícia…) já saem em m² no
       quantitativo da própria parede ("Camadas — quantitativo", js/bimedit.js/bimarq.js `camadasDe`). Aqui ficam só as peças que a camada
       não tem: madeira do quadro, pregos, parafusos, ancoragem, vedação dos vãos. Membrana, lã e camadas NÃO entram aqui de novo. */
    if (tot.fita) itens.push(item("Fita de vedação do perímetro dos vãos", "m", tot.fita, "catálogo: fitas Eurovent; " + PEND, ex));
    if (tot.selante) itens.push(item("Selante nos vãos (perímetro)", "m", tot.selante, "rendimento do cartucho a definir pelo fornecedor; " + PEND, ex));
    if (tot.espuma) itens.push(item("Espuma expansiva nos vãos (perímetro)", "m", tot.espuma, "conversão para lata a definir pelo fornecedor; " + PEND, ex));
    if (tot.membr) avisos.push("Wood Frame: a membrana hidrófuga sai só em 'Camadas — quantitativo' da parede; ao orçar essa camada, acrescente a sobreposição de " + virg(PADRAO.sobreposicaoMembrana * 100, 0) + " % (critério RA).");
    if (tot.gessoParaf) itens.push(item("Parafuso de gesso acartonado", "un", tot.gessoParaf, "1 a cada " + Object.keys(parafSet).sort().join(" ou ") + " mm ao longo de cada linha de montante (o canto conta uma linha por face) e nas bordas horizontais; " + PEND, ex));
    pend.forEach(function (x) { avisos.push("Pendente: " + x + " — fora da tabela, calcular."); });
    /* sem preço: nenhum item daqui tem composição SINAPI (código nunca inventado). O total que a tela mostrar fica PARCIAL e o aviso diz quantos. */
    var semPreco = itens.filter(function (x) { return x.orcarAParte && !x.sinapi; }).length;
    if (semPreco) avisos.unshift(semPreco + " itens Wood Frame sem preço (sem composição SINAPI neste sistema): o total do orçamento é PARCIAL até orçá-los à parte.");
    return { itens: itens, avisos: avisos, paredes: A.paredes, semPreco: semPreco, parcial: semPreco > 0 };
  }

  var WoodFrameQuadro = {
    PADRAO: PADRAO, VERGAS: VERGAS, VERGA_ACIMA: VERGA_ACIMA, VERGAS_NOTA: VERGAS_NOTA,
    params: params, vergaDe: vergaDe, gerar: gerar, ehWf: ehWf, daCaixa: daCaixa, paraParede: paraParede, emMundo: emMundo,
    planta: planta, quantitativo: quantitativo, vaosDasParedes: vaosDasParedes, limparCache: limparCache, estatisticas: estatisticas, posCamadas: posCamadas, hachDe: hachDe
  };
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFrameQuadro;
  else global.WoodFrameQuadro = WoodFrameQuadro;
})(typeof window !== "undefined" ? window : this);

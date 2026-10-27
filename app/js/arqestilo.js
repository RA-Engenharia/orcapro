/* =====================================================================
 * arqestilo.js — O ESTILO DAS PRANCHAS DE ARQUITETURA (e, na fase 2, de INTERIORES)
 * (motor PURO, ES5, sem DOM). Um caderno executivo de referência foi medido no vetor e virou o padrão
 * `arquitetura_interiores` (v2.13) do Padrão RA de Detalhamento
 * (OneDrive › Padrao RA - Detalhamento Estrutural › padrao_detalhamento_ra.json). TUDO o que é número do
 * estilo mora AQUI, transcrito dessa chave (cada bloco aponta a chave de origem); os geradores
 * (js/arqdesenho.js, js/arqplantas.js, js/arqcortes.js, js/arqquadros.js, js/arqpranchas.js) leem daqui e
 * não repetem valor nenhum. O CARIMBO é o RA (js/prancha.js) e NÃO passa por este módulo.
 *
 *   ArqEstilo.PENAS / CORES / TEXTOS / COTA / NOTA_MATERIAL / MARCADOR_VISTA / TITULO / LEGENDAS / OBS_PADRAO
 *   ArqEstilo.formatoNumero      "ponto" (".79", "1.52", como o padrão) | "virgula" ("0,79", "1,52") — troca num lugar só
 *   ArqEstilo.numeroCota(m)      o número da cota no formato escolhido (metros, 2 casas)
 *   ArqEstilo.alturaCota(esc)    altura do texto da cota pela escala (1:50 → 3,30 · 1:25 → 2,48 · 1:20 → 2,20)
 *   ArqEstilo.largTexto(s, h)    largura do texto em Verdana (medida no verdana.ttf, folga de 2 %)
 *   ArqEstilo.aplicar(D)         põe no Desenho D: texto em Verdana, cota com ponto + cruz, nota de material
 *   ArqEstilo.titulo(D, x, y, numero, nome, escala)                 "01 PLANTA BAIXA / ESCALA 1/50"
 *   ArqEstilo.marcadorVista(D, x, y, letra, prancha, ang, tipo)     marcador de vista (A) e de corte (B)   [fase 2]
 *   ArqEstilo.notaMaterial(D, px, py, xt, linhas, o)                nota de material com leader e seta em V
 *   ArqEstilo.quadroLegendas(D, x, y, w, itens, o)                  "Q U A D R O   D E   L E G E N D A S"
 * Teste: tools/test-arqestilo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }

  var ES = {};
  ES.VERSAO = "arquitetura_interiores v2.13";

  /* chave `fonte` */
  ES.FONTE = {
    padrao: "Verdana", marcador: "Verdana Bold", reserva: "DejaVu Sans", reserva2: "Arial",
    css: "Verdana, 'DejaVu Sans', Arial, sans-serif",
    caixa: "MAIÚSCULAS em notas, legendas, títulos e OBS.; números de cota como medidos"
  };

  /* chave `penas_mm` (mm de papel). "cabelo" = 0,05 (o padrão RA fixa; na tela, 1 px) */
  ES.PENAS = {
    parede_cortada: 0.3, piso_teto_em_vista: 0.3, bancada_e_batente: 0.3,
    marcenaria_em_vista: 0.09, folha_de_esquadria: 0.09, moldura_interna: 0.09, sublinhado_titulo: 0.09,
    mobiliario_em_planta: 0.05, linha_de_cota: 0.05, marca_de_cota: 0.05, hachura: 0.05,
    leader_de_nota: 0.21, simbolo_luminotecnico: 0.25, moldura_da_folha: 0.3,
    barra_marcador_vista: 0.45,            /* polígono cheio de 0,45 mm de espessura */
    tracejado: { traco: 2.0, espaco: 1.0, pena: 0.05 }   /* projeção: marcenaria superior, forro, gesso */
  };
  ES.TRACEJADO = ES.PENAS.tracejado.traco + " " + ES.PENAS.tracejado.espaco;

  /* chave `cores` */
  ES.CORES = { construir: "#D61B0A", demolir: "#F5E642", luminotecnico: "#D61B0A", texto_secundario: "#BABABA", vidro_reflexo: "#DBDBDB", preto: "#000" };

  /* chave `textos_mm` */
  ES.TEXTOS = {
    cota: { "1:50": 3.3, "1:25": 2.48, "1:20": 2.2, "1:10": 2.2, minimo: 2.0 },
    nota_de_material: 2.75, legenda: 2.75, obs: 2.15,
    titulo_numero: 11.0, titulo_nome: 5.5, titulo_escala: 2.75,
    marcador_letra: 4.13, marcador_prancha: 2.75,
    legenda_titulo: 3.44                    /* chave `marcador`/`legendas`: título de legenda espaçado */
  };
  /* altura da maiúscula/algarismo da Verdana, em partes do corpo (MEDIDAS_REF01.md, item 3) */
  ES.ALTURA_MAIUSCULA = 0.727;

  /* chave `cota` */
  ES.COTA = {
    marca_ponto_diametro: 0.64, marca_cruz: 2.0,       /* ponto cheio ø 0,64 mm + cruz fina de 2,0 mm */
    texto_acima_da_linha_mm: 1.04, texto_ao_lado_vertical_mm: 1.08,
    afastamento_1a_cadeia_mm: 5.0,
    entre_cadeias_mm: { "1:50": 5.3, "1:25": 4.4 },
    linha_passa_da_ultima_marca_mm: 1.0,
    linha_de_chamada: { alem_da_linha_mm: 1.0, do_objeto_mm: 1.0 }
  };

  /* chave `nota_de_material` + MEDIDAS_REF01.md item 3 (alinhamento) */
  ES.NOTA_MATERIAL = { seta_recuo_mm: 1.7, seta_meia_abertura_mm: 1.75, baseline_acima_da_linha_mm: 0.8, entrelinha_mm: 3.4 };

  /* chave `marcador_de_vista` */
  ES.MARCADOR_VISTA = {
    A: { base: 15.0, altura: 7.87, barra: 22.0, barra_da_base: 1.31, letra_baseline: 1.78, prancha_abaixo_da_barra: 2.75 },
    B: { base: 10.0, altura: 5.25, barra: [30.0, 36.0], barra_da_base: 1.14, prancha_ao_lado_da_barra: 2.9 }
  };

  /* chave `titulo_de_desenho` */
  ES.TITULO = { folga_numero_nome: 0.95, nome_acima_do_sublinhado: 1.19, escala_abaixo_do_sublinhado: 3.13 };

  /* chave `legendas.demolir_construir` */
  ES.LEGENDAS = {
    demolir_construir: { titulo: "QUADRO DE LEGENDAS", linha_titulo: 6.4, linha: 9.0, amostra_w: 6.0, amostra_h: 5.0, amostra_da_borda: 5.0, texto_x: 13.5,
                         largura: 94.8, obs: "OBS: CHECAR MEDIDAS NO LOCAL", obs_abaixo: 3.4 }
  };

  /* chave `obs_padrao` (elétrico e luminotécnico de interiores: fase 2) */
  ES.OBS_PADRAO = [
    "OBS.: 1 - A ALTURA DOS INTERRUPTORES SERÁ IGUAL A 1.10m, EXCETO QUANDO MARCADO (NESTE CASO A ALTURA ESTÁ INDICADA EM PLANTA OU NA VISTA);",
    "OBS.: 2 - OBSERVAR ATENTAMENTE ALTURA DE TOMADAS EM VISTA;",
    "OBS.: 3 - AS MEDIDAS DE COTAS E ALTURAS DOS PONTOS SÃO DADAS DE EIXO A EIXO;",
    "OBS.: 4 - SEGUIR MEDIDAS PELAS COTAS EM M, DÚVIDAS LIGAR PARA O RESPONSÁVEL TÉCNICO;"
  ];

  /* a convenção de reforma das PRANCHAS (chave `cores` + `legendas.demolir_construir`): parede cortada com preenchimento chapado,
     contorno de parede cortada (0,30) por cima. O desenho 2D do BIM (js/desenho2d.js) tem a convenção dele e não muda. */
  ES.CONVENCAO = {
    novo:      { rotulo: "CONSTRUIR PAREDE", cor: ES.CORES.construir, fill: ES.CORES.construir, hachura: null, tracejado: null },
    demolido:  { rotulo: "DEMOLIR", cor: ES.CORES.demolir, fill: ES.CORES.demolir, hachura: null, tracejado: null },
    existente: { rotulo: "EXISTENTE A MANTER", cor: "#1a1a1a", fill: "#bdbdbd", hachura: null, tracejado: null }
  };

  /* ------------------------------------------------------------ FORMATO DO NÚMERO DA COTA */
  ES.formatoNumero = "ponto";
  /* metros → texto da cota. "ponto": sem zero à esquerda abaixo de 1 (".79", ".05"), "1.52", "6.70"; "virgula": "0,79", "1,52" */
  ES.numeroCota = function (vm) {
    if (typeof vm !== "number" || !isFinite(vm)) return "-";
    var neg = vm < -0.0049, a = Math.abs(Math.round(vm * 100) / 100), s = a.toFixed(2);
    if (ES.formatoNumero === "virgula") return (neg ? "-" : "") + s.replace(".", ",");
    if (a < 1) s = s.replace(/^0/, "");
    return (neg ? "-" : "") + s;
  };
  /* "ESC 1:50" | "1:50" | 50 → "1/50" (a escrita do padrão); o que não é escala numérica volta como veio */
  ES.escalaTxt = function (e) {
    var s = txt(e), m = /1\s*[:\/]\s*(\d+)/.exec(s);
    if (m) return "1/" + m[1];
    if (typeof e === "number" && isFinite(e) && e > 0) return "1/" + Math.round(e);
    return s;
  };

  /* ------------------------------------------------------------ ALTURA E AFASTAMENTOS PELA ESCALA (denominador: 50 para 1:50) */
  function interp(den, pts) {   /* pts = [[den, valor] em ordem crescente de den]; fora da faixa: o do extremo */
    if (!(den > 0)) den = 50;
    if (den <= pts[0][0]) return pts[0][1];
    if (den >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (var i = 0; i + 1 < pts.length; i++) {
      if (den <= pts[i + 1][0]) { var t = (den - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]); }
    }
    return pts[pts.length - 1][1];
  }
  /* o texto da cota encolhe com a escala (medido); fora da tabela interpola e nunca fica abaixo de 2,0; mais grosso que 1:50 fica em 1:50 */
  ES.alturaCota = function (den) {
    var T = ES.TEXTOS.cota, v = interp(den, [[10, T["1:10"]], [20, T["1:20"]], [25, T["1:25"]], [50, T["1:50"]]]);
    return Math.max(T.minimo, Math.round(v * 100) / 100);
  };
  ES.entreCadeias = function (den) { var E = ES.COTA.entre_cadeias_mm; return Math.round(interp(den, [[25, E["1:25"]], [50, E["1:50"]]]) * 100) / 100; };
  ES.afastamento1 = function () { return ES.COTA.afastamento_1a_cadeia_mm; };

  /* ------------------------------------------------------------ LARGURA DO TEXTO EM VERDANA
   * avanço dos caracteres 32–255 em milésimos do corpo, MEDIDO no verdana.ttf (hmtx / unitsPerEm 2048) — não é a Arial nem a RomanS:
   * a Verdana é mais larga. Os de 127–159 e o que não existe na fonte valem 0 (cai no padrão). */
  var LARG = [352,394,459,818,636,1076,727,269,454,454,636,818,364,454,364,454,636,636,636,636,636,636,636,636,636,636,454,454,818,818,818,545,
    1000,684,686,698,771,632,575,775,751,421,455,693,557,843,748,787,603,787,695,684,616,732,684,989,685,615,685,454,454,454,818,636,
    636,601,623,521,623,596,352,623,633,274,344,592,274,973,633,607,623,623,427,521,394,633,592,818,592,592,525,635,454,635,818,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    352,394,636,636,636,636,454,636,636,1000,545,645,818,454,1000,636,542,818,542,542,636,642,636,364,636,542,545,645,1000,1000,1000,545,
    684,684,684,684,684,684,984,698,632,632,632,632,421,421,421,421,775,748,787,787,787,787,787,818,787,732,732,732,732,615,605,620,
    601,601,601,601,601,601,955,521,596,596,596,596,274,274,274,274,612,633,607,607,607,607,607,818,607,633,633,633,633,592,623,592];
  var FOLGA_LARG = 1.02;
  ES.largTexto = function (s, h) {
    s = txt(s); var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), v = c >= 32 && c < 256 ? LARG[c - 32] : 0;
      if (!v) v = (c === 8212 || c === 8230) ? 1000 : ((c === 8211) ? 636 : ((c === 8804 || c === 8805 || c === 8594) ? 818 : 760));
      w += v;
    }
    return w / 1000 * h * FOLGA_LARG;
  };
  ES.quebrar = function (s, h, wmax) {
    var pal = txt(s).split(/\s+/), linhas = [], at = "";
    pal.forEach(function (p) {
      if (!p) return;
      var t = at ? at + " " + p : p;
      if (at && ES.largTexto(t, h) > wmax) { linhas.push(at); at = p; } else at = t;
    });
    if (at) linhas.push(at);
    return linhas;
  };
  ES.maiusc = function (s) { return txt(s).toUpperCase(); };
  /* "QUADRO DE LEGENDAS" → "Q U A D R O   D E   L E G E N D A S" */
  ES.espacado = function (s) { return txt(s).split(" ").map(function (p) { return p.split("").join(" "); }).join("   "); };

  /* caixa orientada de um texto como o Desenho a registra (cantos): al E/C/D, meio, rot em graus */
  ES.caixaTexto = function (x, y, s, h, o) {
    o = o || {};
    var al = o.al || "E", w = ES.largTexto(txt(s), h), yb = o.meio ? y + 0.37 * h : y, a = (o.rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    var x0 = al === "C" ? -w / 2 : (al === "D" ? -w : 0);
    return [[x0, -0.76 * h], [x0 + w, -0.76 * h], [x0 + w, 0.18 * h], [x0, 0.18 * h]].map(function (p) { return [x + p[0] * c - p[1] * sn, yb + p[0] * sn + p[1] * c]; });
  };

  /* ------------------------------------------------------------ AS PEÇAS DE DESENHO (sobre um Desenho D) */
  /* a marca da cota: ponto cheio ø 0,64 + cruz fina de 2,0 mm (cabelo). A cruz não entra nos obstáculos (D.sg): é só tinta. */
  ES.marca = function (D, x, y) {
    var r = ES.COTA.marca_ponto_diametro / 2, b = ES.COTA.marca_cruz / 2, at = D.estilo("MET-COTA");
    D.add('<line x1="' + n(x - b) + '" y1="' + n(y) + '" x2="' + n(x + b) + '" y2="' + n(y) + '"' + at + "/>");
    D.add('<line x1="' + n(x) + '" y1="' + n(y - b) + '" x2="' + n(x) + '" y2="' + n(y + b) + '"' + at + "/>");
    D.add('<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r) + '" fill="' + ES.CORES.preto + '"' + at + ' data-marca="1"/>');
  };

  /* O Desenho com o estilo: texto em Verdana (sem o contorno que a RomanS pedia), cota com ponto + cruz e texto a 1,04 mm da linha,
     nota de material. Idempotente. A escala da cota vem de D.escCota (denominador; 50 se ninguém disse). */
  ES.aplicar = function (D) {
    if (D._estiloArq) return D;
    D._estiloArq = true; D.escCota = D.escCota || 50;
    D.larg = ES.largTexto;

    D.texto = function (x, y, s, h, o) {
      o = o || {}; s = txt(s);
      if (!s) return 0;
      var al = o.al || "E", anc = al === "C" ? "middle" : (al === "D" ? "end" : "start"), yb = o.meio ? y + 0.37 * h : y, rot = o.rot || 0, w = ES.largTexto(s, h);
      this.s.push('<text x="' + n(x) + '" y="' + n(yb) + '" font-size="' + n(h) + '"' + (anc !== "start" ? ' text-anchor="' + anc + '"' : "") +
        (rot ? ' transform="rotate(' + n(rot) + " " + n(x) + " " + n(yb) + ')"' : "") + (o.cor ? ' fill="' + o.cor + '"' : "") + (o.negrito ? ' font-weight="bold"' : "") + (/\s\s/.test(s) ? ' style="white-space:pre"' : "") + (o.attr || "") + ">" + esc(s) + "</text>");
      var x0 = anc === "middle" ? -w / 2 : (anc === "end" ? -w : 0), a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      var q = [[x0, -0.76 * h], [x0 + w, -0.76 * h], [x0 + w, 0.18 * h], [x0, 0.18 * h]].map(function (p) { return [x + p[0] * c - p[1] * sn, yb + p[0] * sn + p[1] * c]; });
      this.tb.push([Math.min(q[0][0], q[1][0], q[2][0], q[3][0]), Math.min(q[0][1], q[1][1], q[2][1], q[3][1]), Math.max(q[0][0], q[1][0], q[2][0], q[3][0]), Math.max(q[0][1], q[1][1], q[2][1], q[3][1])]);
      if (this.caixas && !o.semCaixa) this.caixas.push({ s: s, p: q });
      return w;
    };

    D.tique = function (x, y) { ES.marca(this, x, y); };

    /* CADEIA DE COTAS (a do js/acopranchas.js, com a marca, o texto e as folgas do padrão). P = pontos colineares; off (mm) + = à esquerda do
       sentido p0→pn; valores[i] = texto do trecho i; o = { attrs, semExt, desde (folga da linha de chamada ao objeto, por ponto; false = sem linha), h, offs } */
    D.cadeia = function (P, off, valores, o) {
      o = o || {};
      if (P.length < 2) return;
      var self = this, h = o.h || ES.alturaCota(this.escCota), C = ES.COTA, nseg = P.length - 1;
      var p0 = P[0], pn = P[nseg], L = hip(pn[0] - p0[0], pn[1] - p0[1]);
      if (L < 1e-6) return;
      var ux = (pn[0] - p0[0]) / L, uy = (pn[1] - p0[1]) / L, nx = uy, ny = -ux;
      var ang = Math.atan2(uy, ux) * 180 / Math.PI, rx = ux, ry = uy;
      if (ang > 90.01 || ang < -90.01) { ang = ang > 0 ? ang - 180 : ang + 180; rx = -ux; ry = -uy; }
      var tnx = ry, tny = -rx, vertical = Math.abs(Math.abs(ang) - 90) < 1, acima = vertical ? C.texto_ao_lado_vertical_mm : C.texto_acima_da_linha_mm, passa = C.linha_passa_da_ultima_marca_mm;
      function plano(of) {
        var Q = P.map(function (p) { return [p[0] + nx * of, p[1] + ny * of]; }), alt = 0, ext0 = passa, ext1 = passa, txs = [];
        function compr(j) { return j < 0 || j >= nseg ? 0 : hip(Q[j + 1][0] - Q[j][0], Q[j + 1][1] - Q[j][1]); }
        function folgaVizinho(j, w0) { var v2 = valores[j], L2 = compr(j), w2 = v2 == null || v2 === "" ? 0 : ES.largTexto(v2, h); return L2 > 0 && w2 + 1.0 <= L2 && (L2 - w2) / 2 >= w0 + 2.4; }
        for (var i = 0; i < nseg; i++) {
          var v = valores[i]; if (v == null || v === "") continue;
          var a = Q[i], b = Q[i + 1], seg = hip(b[0] - a[0], b[1] - a[1]), w = ES.largTexto(v, h), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, sobe = acima;
          if (w + 1.0 > seg) {
            if (i === 0 && nseg > 1) { var dd = w / 2 + 1.6; mx = a[0] - ux * dd; my = a[1] - uy * dd; ext0 = Math.max(ext0, w + 2.4); }
            else if (i === nseg - 1 && nseg > 1) { var de = w / 2 + 1.6; mx = b[0] + ux * de; my = b[1] + uy * de; ext1 = Math.max(ext1, w + 2.4); }
            else if (folgaVizinho(i + 1, w)) { mx = b[0] + ux * (w / 2 + 1.6); my = b[1] + uy * (w / 2 + 1.6); alt = 0; }
            else if (folgaVizinho(i - 1, w)) { mx = a[0] - ux * (w / 2 + 1.6); my = a[1] - uy * (w / 2 + 1.6); alt = 0; }
            else if (nseg > 1) { alt++; sobe = acima + h * (alt % 2 ? 1.25 : 2.5); }
          } else alt = 0;
          if (o.evitar && o.evitar.length) {
            var meia = w / 2 + 0.9, ts = o.evitar.map(function (p) { return (p[0] - mx) * ux + (p[1] - my) * uy; });
            var livre = function (dl) { return ts.every(function (t) { return Math.abs(t - dl) >= meia; }); };
            if (!livre(0)) {
              var cands = []; ts.forEach(function (t) { cands.push(t - meia, t + meia); });
              cands = cands.filter(livre).sort(function (p, q) { return Math.abs(p) - Math.abs(q); });
              if (cands.length) { mx += ux * cands[0]; my += uy * cands[0]; }
            }
          }
          txs.push([mx + tnx * sobe, my + tny * sobe, v, o.attrs ? o.attrs[i] : "", i]);
        }
        return { of: of, Q: Q, txs: txs, ext0: ext0, ext1: ext1 };
      }
      var pl = plano(off);
      if (o.offs && o.offs.length) {
        var tenta = [off].concat(o.offs), achou = null;
        for (var k = 0; k < tenta.length && !achou; k++) {
          var pk = plano(tenta[k]);
          if (pk.txs.every(function (t) { return self.livreQ(ES.caixaTexto(t[0], t[1], t[2], h, { al: "C", rot: ang }), 0.3); })) achou = pk;
        }
        if (achou) pl = achou;
      }
      var Q = pl.Q, sg = pl.of >= 0 ? 1 : -1, gIni = this.s.length, dc = C.linha_de_chamada;
      if (!o.semExt) P.forEach(function (p, i) {
        if (o.desde && o.desde[i] === false) return;
        var g0 = o.desde && o.desde[i] != null ? o.desde[i] : dc.do_objeto_mm;
        if (Math.abs(pl.of) - g0 < 0.6) return;
        self.linha(p[0] + nx * g0 * sg, p[1] + ny * g0 * sg, Q[i][0] + nx * dc.alem_da_linha_mm * sg, Q[i][1] + ny * dc.alem_da_linha_mm * sg, "MET-COTA");
      });
      this.linha(Q[0][0] - ux * pl.ext0, Q[0][1] - uy * pl.ext0, Q[nseg][0] + ux * pl.ext1, Q[nseg][1] + uy * pl.ext1, "MET-COTA");
      Q.forEach(function (q) { self.tique(q[0], q[1], ux, uy); });
      /* o número que cai em cima de linha ou de texto (móvel, deck, outra cota que passa por ali) anda AO LONGO da linha de cota até o primeiro lugar livre
         (a até meio trecho + o texto de cada lado); sem lugar, fica onde estava */
      pl.txs.forEach(function (t) {
        var wt = ES.largTexto(t[2], h), si = Math.min(t[4], nseg - 1), seg = hip(Q[si + 1][0] - Q[si][0], Q[si + 1][1] - Q[si][1]);
        if (!self.livreQ(ES.caixaTexto(t[0], t[1], t[2], h, { al: "C", rot: ang }), 0.2)) {
          var lim = Math.max(seg, wt) / 2 + wt / 2 + 1.0, ds = [];
          for (var d = 0.5; d <= lim; d += 0.5) ds.push(d, -d);
          for (var m = 0; m < ds.length; m++) {
            var xx = t[0] + ux * ds[m], yy = t[1] + uy * ds[m];
            if (self.livreQ(ES.caixaTexto(xx, yy, t[2], h, { al: "C", rot: ang }), 0.2)) { t[0] = xx; t[1] = yy; break; }
          }
        }
        self.texto(t[0], t[1], t[2], h, { al: "C", rot: ang, attr: t[3] });
      });
      this.grupoCota("cadeia", P, pl.of, pl.txs.map(function (t) { return t[4]; }), gIni, P.map(function (p, i) {
        if (o.semExt || (o.desde && o.desde[i] === false)) return "x";
        var g0 = o.desde && o.desde[i] != null ? o.desde[i] : dc.do_objeto_mm;
        return Math.abs(pl.of) - g0 < 0.6 ? "x" : n(g0);
      }), pl.ext0, pl.ext1);
      return pl.of;
    };

    /* NOTA DE MATERIAL (a chamada do padrão) — o padrão pede leader horizontal com a bandeira do tamanho do texto; ver ES.notaMaterial */
    D.chamada = function (px, py, tx, ty, linhas, o) {
      o = o || {};
      var dir = o.dir || (tx >= px ? 1 : -1), ls = arr(linhas).map(function (l) { return (l && typeof l === "object") ? l : { t: txt(l) }; }).filter(function (l) { return !!l.t; });
      var w = 0; ls.forEach(function (l) { w = Math.max(w, ES.largTexto(ES.maiusc(l.t), ES.TEXTOS.nota_de_material)); });
      return ES.notaMaterial(this, px, py, px + dir * (Math.abs(tx - px) + w), ls, o);
    };
    return D;
  };

  /* ------------------------------------------------------------ TÍTULO DE DESENHO ("01 PLANTA BAIXA" / ESCALA 1/50) — chave `titulo_de_desenho`
   * número grande (11,0) à esquerda; nome (5,5) sobre um sublinhado do comprimento do nome; "ESCALA" (2,75) 3,13 mm abaixo do sublinhado à esquerda
   * e "1/50" alinhado à direita no fim dele. (x, y) = canto de cima e da esquerda do conjunto; devolve a altura que o título ocupa. */
  ES.titulo = function (D, x, y, numero, nome, escala, o) {
    o = o || {};
    var T = ES.TEXTOS, K = ES.TITULO, num = typeof numero === "number" ? ("0" + numero).slice(-2) : txt(numero || "01"), nm = ES.maiusc(nome);
    var yB = y + T.titulo_numero * ES.ALTURA_MAIUSCULA + 0.2, yU = yB - K.escala_abaixo_do_sublinhado, wn = ES.largTexto(num, T.titulo_numero);
    var xn = x + wn + K.folga_numero_nome, wNome = ES.largTexto(nm, T.titulo_nome);
    D.texto(x, yB, num, T.titulo_numero, { attr: ' data-titulo-numero="1"' });
    D.texto(xn, yU - K.nome_acima_do_sublinhado, nm, T.titulo_nome, { attr: ' data-titulo="1"' });
    D.linha(xn, yU, xn + wNome, yU, "MET-TITULO");
    var esc0 = ES.escalaTxt(escala), semNum = !/^1\//.test(esc0);
    if (semNum) { if (txt(esc0)) D.texto(xn, yB, ES.maiusc(esc0), T.titulo_escala); }
    else { D.texto(xn, yB, "ESCALA", T.titulo_escala); D.texto(xn + wNome, yB, esc0, T.titulo_escala, { al: "D" }); }
    return (yB + 0.9 - y) + 1.0;
  };

  /* ------------------------------------------------------------ MARCADOR DE VISTA (A) E DE CORTE (B) — chave `marcador_de_vista` (fase 2)
   * (x, y) = o meio da base do triângulo; o ápice aponta para onde se olha (ang em graus: 0 = para cima no papel, horário). A letra fica
   * dentro do triângulo (Verdana Bold 4,13), a barra cheia (0,45 mm) corre sob a base, e "PR nn" (nº da prancha da vista) sai abaixo. */
  ES.marcadorVista = function (D, x, y, letra, prancha, ang, tipo, opc) {
    var M = ES.MARCADOR_VISTA, T = ES.TEXTOS, tp = tipo === "B" ? "B" : "A", m = M[tp], a = (ang || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    function P(u, v) { return [x + u * c - v * s, y + u * s + v * c]; }   /* u ao longo da base (para a direita), v para baixo no marcador sem giro (o ápice está em v < 0) */
    var tri = [P(-m.base / 2, 0), P(m.base / 2, 0), P(0, -m.altura)];
    D.poli(tri, "ARQ-SIMBOLO", true);
    var b0 = m.barra_da_base, e = ES.PENAS.barra_marcador_vista, Lb = tp === "A" ? m.barra : (opc && opc.barra >= m.barra[0] && opc.barra <= m.barra[1] ? opc.barra : m.barra[0]);   /* corte: a barra tem de 30 a 36 mm; o gerador escolhe pela profundidade da peça */
    var u0 = tp === "A" ? -Lb / 2 : -m.base / 2, u1 = u0 + Lb;
    D.cheio([P(u0, b0), P(u1, b0), P(u1, b0 + e), P(u0, b0 + e)], ES.CORES.preto);
    var lp = P(0, -(tp === "A" ? m.letra_baseline : m.altura * 0.2));
    D.texto(lp[0], lp[1], ES.maiusc(letra), tp === "A" ? T.marcador_letra : T.marcador_prancha, { al: "C", rot: ang || 0, negrito: true, attr: ' data-marcador="' + esc(letra) + '"' });
    if (prancha != null && txt(prancha) !== "") {
      var tx = "PR " + txt(prancha), q = tp === "A" ? P(0, b0 + e + m.prancha_abaixo_da_barra) : P(u0 + Lb / 2, b0 + e + m.prancha_ao_lado_da_barra + T.marcador_prancha * ES.ALTURA_MAIUSCULA);
      D.texto(q[0], q[1], tx, T.marcador_prancha, { al: "C", rot: ang || 0 });
    }
    return { w: Math.max(m.base, Lb), h: m.altura + b0 + e + 2.75 + T.marcador_prancha };
  };

  /* ------------------------------------------------------------ NOTA DE MATERIAL — chave `nota_de_material`
   * leader (0,21) horizontal da borda do texto até a peça, seta em V aberto de 1,7 mm (±1,75) com a ponta em (px, py); o texto fica SOBRE a linha,
   * que corre por baixo de todas as linhas dele. xt < px: o texto fica à esquerda da seta, alinhado à esquerda em xt; xt > px: à direita, alinhado à direita em xt.
   * linhas = [texto | { t, cor }]; o texto sai em MAIÚSCULAS ('informe' vermelho continua com a cor que o gerador der). */
  ES.notaMaterial = function (D, px, py, xt, linhas, o) {
    o = o || {};
    var N = ES.NOTA_MATERIAL, h = o.h || ES.TEXTOS.nota_de_material, ls = arr(linhas).map(function (l) { return (l && typeof l === "object") ? { t: ES.maiusc(l.t), cor: l.cor, attr: l.attr } : { t: ES.maiusc(l) }; }).filter(function (l) { return !!l.t; });
    if (!ls.length) return null;
    var esq = xt < px, yl = py, pen = "ARQ-LIDER";
    D.linha(xt, yl, px, yl, pen);
    var sg = esq ? 1 : -1;   /* a seta aponta para a peça: para a direita se o texto está à esquerda */
    D.linha(px, py, px - sg * N.seta_recuo_mm, py - N.seta_meia_abertura_mm, pen);
    D.linha(px, py, px - sg * N.seta_recuo_mm, py + N.seta_meia_abertura_mm, pen);
    var y = yl - N.baseline_acima_da_linha_mm;
    for (var i = ls.length - 1; i >= 0; i--) { D.texto(xt, y, ls[i].t, h, { al: esq ? "E" : "D", cor: ls[i].cor, attr: ls[i].attr }); y -= N.entrelinha_mm; }
    return { h: ls.length * N.entrelinha_mm };
  };

  /* ------------------------------------------------------------ QUADRO DE LEGENDAS — chave `legendas.demolir_construir`
   * caixa com o título espaçado (3,44), uma linha de 9,0 mm por item (amostra 6 x 5 mm a 5,0 mm da borda, texto 2,75 a 13,5 mm), e a OBS. 3,4 mm abaixo.
   * itens = [{ t, fill }] (só o que a folha usa). w = largura (94,8 no padrão). Devolve { w, h } (a altura inclui a OBS.). */
  ES.quadroLegendas = function (D, x, y, w, itens, o) {
    o = o || {};
    var Lg = ES.LEGENDAS.demolir_construir, hT = Lg.linha_titulo, hL = Lg.linha, ls = arr(itens), ww = w || Lg.largura, H = hT + ls.length * hL, hl = ES.TEXTOS.legenda;
    D.ret(x, y, ww, H, "ARQ-QUADRO");
    D.texto(x + ww / 2, y + hT / 2, ES.espacado(Lg.titulo), ES.TEXTOS.legenda_titulo, { al: "C", meio: true });
    D.linha(x, y + hT, x + ww, y + hT, "ARQ-QUADRO-DIV");
    ls.forEach(function (it, i) {
      var y0 = y + hT + i * hL, ys = y0 + (hL - Lg.amostra_h) / 2;
      if (i) D.linha(x, y0, x + ww, y0, "ARQ-QUADRO-DIV");
      D.add('<rect x="' + n(x + Lg.amostra_da_borda) + '" y="' + n(ys) + '" width="' + n(Lg.amostra_w) + '" height="' + n(Lg.amostra_h) + '" fill="' + (it.fill || "#fff") + '"' + D.estilo("ARQ-QUADRO") + "/>");
      D.texto(x + Lg.texto_x, y0 + hL / 2, ES.maiusc(it.t), hl, { meio: true });
    });
    var yo = y + H + Lg.obs_abaixo;
    D.texto(x + 1.0, yo + ES.TEXTOS.legenda * 0.76, Lg.obs, hl);
    return { w: ww, h: H + Lg.obs_abaixo + hl * 0.76 + 0.8 };
  };

  global.ArqEstilo = ES;
  if (typeof module !== "undefined" && module.exports) module.exports = ES;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

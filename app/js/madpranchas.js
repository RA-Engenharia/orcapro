/* =====================================================================
 * madpranchas.js — PRANCHAS DO PROJETO EXECUTIVO DE ESTRUTURA DE MADEIRA
 * (quiosque de referência e próximas obras). Motor PURO, ES5, sem DOM.
 *
 *   MadPranchas.gerar(resultado, opcoes) → { ok, folhas: [{ id, numero,
 *       titulo, formato, escala, svg }], avisos }
 *   resultado = MadDimensionar.calcular(...) (docs/madeira/CONTRATO.md)
 *   opcoes    = { fonte (OBRIGATÓRIA: madeira_quiosque.json — o resultado
 *               traz as peças sem geometria), ligacoesFonte (ligacoes_
 *               quiosque.json: quantidades das ferragens), catalogo
 *               (MadCatalogo), empresa, responsavel, registro, obra,
 *               proprietario, contratante, local, codigo, revisao, data,
 *               formato ("A1"), logo, padrao, depurar }
 *
 * O jogo (Padrão RA de detalhamento v2.4, seção estrutura_madeira):
 *   01 LOCAÇÃO DOS PILARETES E PÉ DOS PILARES + QUADRO DE CARGAS NA FUNDAÇÃO
 *   02 VIGAMENTO DO PISO SECO + PAGINAÇÃO DO PAINEL WALL + CORTE DO PISO
 *      EM CAMADAS POR ZONA (contrapiso detalhado, espessuras que somam o pacote)
 *   03 PLANTA DA COBERTURA INFERIOR (e forro)
 *   04 PLANTA DA COBERTURA SUPERIOR + VIDRO (pendência NBR 7199:2025)
 *   05 ELEVAÇÕES DOS PAINÉIS DE WOOD FRAME (Evoply, pregação, hold-downs)
 *   06 PILARES COMPOSTOS (elevação, seção, bloqueadores, pé do pilar L01)
 *   07 DETALHES TÍPICOS DAS LIGAÇÕES L01–L15
 *   08 LISTA DE MATERIAIS (madeira por espécie/seção, ferragens, painéis,
 *      membranas)
 *   09 ROMANEIO DE CORTE (uma linha por marca: espécie, seção, corte, qtd, m3)
 *
 * PADRÃO: papel, moldura e o CARIMBO RA vêm do js/prancha.js (o carimbo
 * não muda); penas e alturas de texto do js/padraodet.js; a largura das
 * letras e a conferência de sobreposição do js/acopranchas.js. O que é só
 * da madeira está em PADRAO_MAD (espelho da seção estrutura_madeira do
 * padrao_detalhamento_ra.json).
 *
 * ⚠ NADA É INVENTADO: o que o cálculo não verificou sai em VERMELHO
 *   (reprovações, pendências, ligações sem verificação, vidro, painel acima
 *   da ficha, produto de catálogo não vinculado). Desenho de ligação é
 *   ESQUEMA com as seções reais das peças; a especificação é o texto da
 *   ligação no resultado.
 * Teste: node tools/test-mad-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* decisões do RT do resultado (seção/espécie trocadas — MadDimensionar.decisoesRT) aplicadas à fonte de peças */
  function fonteComDecisoes(resultado, fonte) {
    if (!fonte || !fonte.pecas) return fonte;
    var ix = {};
    ((resultado && resultado.pecas) || []).forEach(function (q) { if (q && q.decisaoRT) ix[q.id] = q; });
    if (!Object.keys(ix).length) return fonte;
    var f = {}; Object.keys(fonte).forEach(function (k) { f[k] = fonte[k]; });
    f.pecas = fonte.pecas.map(function (p) {
      var q = ix[p.id]; if (!q) return p;
      var o = {}; Object.keys(p).forEach(function (k) { o[k] = p[k]; });
      o.secao_cm = q.secao_cm; o.extensoes_m = q.extensoes_m || p.extensoes_m; o.volume_m3 = q.volume_m3; o.decisaoRT = q.decisaoRT;
      if (q.especie === "tatajuba") { o.especie = "Tatajuba (Bagassa guianensis)"; o.material = "Madeira Tatajuba (Bagassa guianensis) — DEFINIÇÃO RA 12/10/2026"; }
      if (q.especie === "itauba") { o.especie = "Itaúba (Mezilaurus itauba)"; o.material = "Madeira Itaúba (Mezilaurus itauba) — DEFINIÇÃO RA 12/10/2026"; }
      return o;
    });
    return f;
  }

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function PD() { return dep("PadraoDet", "./padraodet.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function MM() { return dep("MadMateriais", "./madmateriais.js"); }
  function MCAT() { return dep("MadCatalogo", "./madcatalogo.js"); }

  /* ------------------------------------------------------------ utilidades */
  function num(v, d) { if (v == null || v === "") return d; var x = Number(v); return isFinite(x) ? x : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) {
    if (v == null || !isFinite(v)) return "-";
    c = c == null ? 2 : c;
    var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    if (/^0(\.0*)?$/.test(s)) neg = false;
    var p = s.split("."), ip = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + ip + (p[1] ? "," + p[1] : "");
  }
  function cm(vm) { return String(Math.round(vm * 100)); }            /* m → "295" (cota em cm) */
  function cm1(vm) { var v = Math.round(vm * 1000) / 10; return Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : br(v, 1); }
  function niv(z) { return (z > 0.0005 ? "+" : (z < -0.0005 ? "" : "±")) + br(z, 2) + "m"; }
  function dois(k) { return ("0" + k).slice(-2); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }
  function natural(a, b) { return String(a).localeCompare(String(b), "pt-BR", { numeric: true }); }
  function escolher(lista, ok) { for (var i = 0; i < lista.length; i++) if (ok(lista[i])) return lista[i]; return lista[lista.length - 1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function soma(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mult(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var L = Math.sqrt(dot(a, a)); return L > 1e-12 ? mult(a, 1 / L) : [0, 0, 0]; }
  function secTxt(s) { return s ? s[0] + "x" + s[1] : "-"; }

  var PRETO = "#000", VERMELHO = "#c00000", CINZA = "#7f7f7f", CINZA_CLARO = "#a6a6a6";
  var FONTE = "RomanS, ISOCPEUR, Arial, Helvetica, sans-serif";

  /* ================================================================ PADRÃO
   * Espelho da seção estrutura_madeira do padrao_detalhamento_ra.json (v2.4,
   * 12/10/2026). A madeira NÃO cria pena nem layer: cada camada interna MAD-*
   * usa um layer EST-* do Padrão RA (pena do CTB RA_Estrutural). */
  var PADRAO_MAD = {
    versao: "2.4", data: "12/10/2026",
    cotas: { unidade: "cm", niveis: "m (2 casas, z = 0 no piso acabado)", terminal: "traço oblíquo curto",
             porque: "a madeira serrada é especificada e comprada em centímetros (5x10, 12x16, 7x20) e a emissão aprovada PROJ-EST R03 cotou em cm; ferragem e furação em mm no texto da ligação" },
    camadas: {
      "MAD-CORTE": "EST-FORMA-CORTE", "MAD-PRINCIPAL": "EST-ARM-ESTRIBO", "MAD-PECA": "EST-FORMA-VISTA", "MAD-PAINEL": "EST-LINHA-FINA",
      "MAD-FERRAGEM": "EST-ARM-LONG-ELEV", "MAD-OCULTA": "EST-OCULTA", "MAD-FINA": "EST-LINHA-FINA", "MAD-COTA": "EST-COTA", "MAD-EIXO": "EST-EIXO",
      "MAD-HACHURA": "EST-HACHURA", "MAD-CONTEXTO": "EST-CONTEXTO", "MAD-TABELA": "EST-TABELA", "MAD-TITULO": "EST-TITULO"
    },
    escalas: { planta: [25, 50, 75, 100], elevacao: [20, 25, 50], detalhe: [5, 10, 20], cortePiso: [5, 10, 20], paginacao: [50, 100, 125] },
    folhas: ["LOCAÇÃO DOS PILARETES E PÉ DOS PILARES - CARGAS NA FUNDAÇÃO", "VIGAMENTO DO PISO SECO, PAINEL WALL E CAMADAS DO PISO",
      "PLANTA DA COBERTURA INFERIOR", "PLANTA DA COBERTURA SUPERIOR E VIDRO", "PAINÉIS DE WOOD FRAME - ELEVAÇÕES", "PILARES COMPOSTOS",
      "DETALHES TÍPICOS DAS LIGAÇÕES", "LISTA DE MATERIAIS", "ROMANEIO DE CORTE"],
    zonasPiso: { terrazzo: "SALÃO", banheiro: "SANITÁRIOS", externo: "ÁREA EXTERNA", ducha: "DUCHA" },
    zonaCalculo: { terrazzo: "quiosque", banheiro: "quiosque", externo: "externa", ducha: "ducha" },
    marcaPeca: "{marca} - {espécie} {b}x{h} x {comprimento cm}",
    painelWallReserva: { L: 2.5, b: 1.2, fonte: "Painel Wall 40 mm 2,50 x 1,20 m (ficha do fabricante)" }
  };
  var PENAS_RESERVA = { "EST-FORMA-CORTE": [0.5], "EST-ARM-ESTRIBO": [0.35], "EST-FORMA-VISTA": [0.25], "EST-OCULTA": [0.18, "3 1.5"], "EST-ARM-LONG-ELEV": [0.35],
    "EST-LINHA-FINA": [0.18], "EST-COTA": [0.13], "EST-EIXO": [0.13, "9.6 1.6 0.4 1.6"], "EST-HACHURA": [0.09], "EST-CONTEXTO": [0.13], "EST-TABELA": [0.25], "EST-TITULO": [0.35] };
  var ALTURAS_RESERVA = { titulo_desenho: 4.2, escala_sob_titulo: 3, cota: 2.5, nota: 2.5, tabela: 2.5, tabela_cabecalho: 3.1, balao_eixo: 3, notacao_estribo_trecho: 2.1,
    nome_apoio: 3.2, notacao_barra: 2.5, nivel: 3.8, titulo_quadro: 7.5, letra_corte: 3.4 };

  function estilo(padrao) {
    var P = PD(), base = null;
    try { base = P ? P.normPadrao(padrao || P.padraoRA()) : null; } catch (e) { base = null; }
    var cam = {};
    Object.keys(PADRAO_MAD.camadas).forEach(function (k) {
      var lay = PADRAO_MAD.camadas[k], l = null;
      if (P && base) { try { l = P.linhaDe(base, lay); } catch (e) { l = null; } }
      var f = PENAS_RESERVA[lay] || [0.25];
      cam[k] = { mm: l ? l.mm : f[0], dash: l ? l.dash : (f[1] || null) };
    });
    cam["MAD-CONTEXTO"].cor = CINZA; cam["MAD-HACHURA"].cor = CINZA_CLARO;
    cam["MAD-MOLDURA"] = { mm: 0.5, dash: null };
    cam["MAD-PEND"] = { mm: Math.max(0.25, cam["MAD-PECA"].mm), dash: null, cor: VERMELHO };
    cam["MAD-PENDT"] = { mm: cam["MAD-OCULTA"].mm, dash: cam["MAD-OCULTA"].dash || "3 1.5", cor: VERMELHO };
    var at = (base && base.textos && base.textos.alturas_plotadas_mm) || ALTURAS_RESERVA;
    function h(k) { return num(at[k], ALTURAS_RESERVA[k]); }
    return {
      camadas: cam,
      T: { titulo: h("titulo_desenho"), escala: h("escala_sob_titulo"), cota: h("cota"), nota: h("nota"), tabela: h("tabela"), tabelaCab: h("tabela_cabecalho"),
           eixo: h("balao_eixo"), marca: h("notacao_barra"), marcaDensa: h("notacao_estribo_trecho"), pilar: h("nome_apoio"), nivel: Math.min(h("nivel"), h("cota") * 1.2),
           quadro: h("titulo_quadro"), detalhe: h("letra_corte"), minimo: h("notacao_estribo_trecho") },
      padraoVersao: base ? txt(base.versao) : ""
    };
  }

  /* ------------------------------------------------------------ largura do texto (a mesma conta das pranchas da metálica) */
  function largTexto(s, h) { var A = AP(); if (A && A.largTexto) return A.largTexto(s, h); return txt(s).length * 0.75 * h; }
  function quebrar(s, h, wmax) {
    var pal = txt(s).split(/\s+/), linhas = [], at = "";
    pal.forEach(function (p) { if (!p) return; var t = at ? at + " " + p : p; if (at && largTexto(t, h) > wmax) { linhas.push(at); at = p; } else at = t; });
    if (at) linhas.push(at);
    return linhas;
  }
  function letraRomanS(s) { return s.replace(/[—–]/g, "-").replace(/×/g, "x").replace(/·/g, ".").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/→/g, "->").replace(/³/g, "3").replace(/²/g, "2").replace(/[“”]/g, "\"").replace(/η/g, "eta").replace(/Σ/g, "soma ").replace(/β/g, "beta").replace(/α/g, "alfa").replace(/γ/g, "gama").replace(/ρ/g, "rho").replace(/ψ/g, "psi"); }

  /* ================================================================ DESENHO (SVG em mm de papel, y para baixo)
   * Guarda os traços e as caixas dos textos num índice por células: um rótulo procura um lugar onde nenhuma
   * linha o atravesse e nenhum texto o cubra (a mesma regra do teste). */
  var CEL = 8;
  function Desenho(E, caixas) { this.E = E; this.s = []; this.caixas = caixas || null; this.sg = []; this.tb = []; this.gS = {}; this.gT = {}; this.marca = 0; this.mS = []; this.mT = []; }
  var DP = Desenho.prototype;
  DP._cel = function (g, bx, i) {
    var i0 = Math.floor(bx[0] / CEL), i1 = Math.floor(bx[2] / CEL), j0 = Math.floor(bx[1] / CEL), j1 = Math.floor(bx[3] / CEL);
    if (i1 - i0 > 200) i1 = i0 + 200; if (j1 - j0 > 200) j1 = j0 + 200;
    for (var a = i0; a <= i1; a++) for (var b = j0; b <= j1; b++) { var k = a + "," + b; (g[k] = g[k] || []).push(i); }
  };
  DP._cands = function (g, bx, marcas) {
    var out = [], i0 = Math.floor(bx[0] / CEL), i1 = Math.floor(bx[2] / CEL), j0 = Math.floor(bx[1] / CEL), j1 = Math.floor(bx[3] / CEL);
    this.marca++;
    for (var a = i0; a <= i1; a++) for (var b = j0; b <= j1; b++) { var l = g[a + "," + b]; if (!l) continue; for (var q = 0; q < l.length; q++) { var id = l[q]; if (marcas[id] !== this.marca) { marcas[id] = this.marca; out.push(id); } } }
    return out;
  };
  DP.add = function (t) { this.s.push(t); };
  DP.estilo = function (cam, extra) {
    var c = this.E.camadas[cam] || this.E.camadas["MAD-FINA"];
    return ' stroke="' + (c.cor || PRETO) + '" stroke-width="' + n(c.mm) + '"' + (c.dash ? ' stroke-dasharray="' + c.dash + '"' : "") + ' stroke-linecap="round" stroke-linejoin="round"' + (extra || "");
  };
  DP.seg = function (x1, y1, x2, y2) { var i = this.sg.length; this.sg.push([x1, y1, x2, y2]); this._cel(this.gS, [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], i); };
  DP.traco = function (L, fechado) { for (var i = 0; i + 1 < L.length; i++) this.seg(L[i][0], L[i][1], L[i + 1][0], L[i + 1][1]); if (fechado && L.length > 2) this.seg(L[L.length - 1][0], L[L.length - 1][1], L[0][0], L[0][1]); };
  DP.linha = function (x1, y1, x2, y2, cam, extra) {
    this.seg(x1, y1, x2, y2);
    this.s.push('<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '"' + this.estilo(cam, extra) + "/>");
  };
  function pts(L) { return L.map(function (p) { return n(p[0]) + "," + n(p[1]); }).join(" "); }
  DP.poli = function (L, cam, fechado, extra) { this.traco(L, fechado); this.s.push("<" + (fechado ? "polygon" : "polyline") + ' points="' + pts(L) + '" fill="none"' + this.estilo(cam, extra) + "/>"); };
  DP.ret = function (x, y, w, h, cam, extra) {
    if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
    this.traco([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
    this.s.push('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="none"' + this.estilo(cam, extra) + "/>");
  };
  DP.fundo = function (L, cor) { this.s.push('<polygon points="' + pts(L) + '" fill="' + (cor || "#fff") + '" stroke="none"/>'); };
  DP.circ = function (cx, cy, r, cam, extra) { var cl = []; for (var i = 0; i < 16; i++) cl.push([cx + r * Math.cos(i * Math.PI / 8), cy + r * Math.sin(i * Math.PI / 8)]); this.traco(cl, true); this.s.push('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="none"' + this.estilo(cam, extra) + "/>"); };
  DP.cheio = function (L, cor, extra) { this.traco(L, true); this.s.push('<polygon points="' + pts(L) + '" fill="' + (cor || PRETO) + '" stroke="none"' + (extra || "") + "/>"); };
  DP.ponto = function (cx, cy, r, cor) { this.s.push('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="' + (cor || PRETO) + '" stroke="none"/>'); };
  function caixaTexto(x, y, s, h, o) {
    o = o || {};
    var al = o.al || "E", w = largTexto(letraRomanS(txt(s)), h), yb = o.meio ? y + 0.37 * h : y, a = (o.rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    var x0 = al === "C" ? -w / 2 : (al === "D" ? -w : 0);
    return [[x0, -0.76 * h], [x0 + w, -0.76 * h], [x0 + w, 0.18 * h], [x0, 0.18 * h]].map(function (p) { return [x + p[0] * c - p[1] * sn, yb + p[0] * sn + p[1] * c]; });
  }
  function bboxQ(q) { var xs = q.map(function (p) { return p[0]; }), ys = q.map(function (p) { return p[1]; }); return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; }
  function dentroCaixa(sg, bx) {
    var t0 = 0, t1 = 1, dx = sg[2] - sg[0], dy = sg[3] - sg[1], pp = [-dx, dx, -dy, dy], qq = [sg[0] - bx[0], bx[2] - sg[0], sg[1] - bx[1], bx[3] - sg[1]];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(pp[i]) < 1e-12) { if (qq[i] < 0) return null; continue; }
      var t = qq[i] / pp[i]; if (pp[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t1 - t0 > 1e-9 ? [t0, t1] : null;
  }
  function sobrepoeQ(a, b, tol) {
    var polys = [a, b];
    for (var p = 0; p < 2; p++) {
      var Pp = polys[p];
      for (var i = 0; i < Pp.length; i++) {
        var q1 = Pp[i], q2 = Pp[(i + 1) % Pp.length], ax = -(q2[1] - q1[1]), ay = q2[0] - q1[0], L = hip(ax, ay);
        if (L < 1e-9) continue; ax /= L; ay /= L;
        var mA = Infinity, MA = -Infinity, mB = Infinity, MB = -Infinity;
        a.forEach(function (q) { var v = q[0] * ax + q[1] * ay; if (v < mA) mA = v; if (v > MA) MA = v; });
        b.forEach(function (q) { var v = q[0] * ax + q[1] * ay; if (v < mB) mB = v; if (v > MB) MB = v; });
        if (MA + tol <= mB || MB + tol <= mA) return false;
      }
    }
    return true;
  }
  /* caixa orientada q livre: nenhum traço a atravessa e nenhum texto a cobre (folga g) */
  DP.livreQ = function (q, g) {
    g = g == null ? 0.4 : g;
    var bb = bboxQ(q), ab = [bb[0] - g, bb[1] - g, bb[2] + g, bb[3] + g], self = this;
    var p0 = q[0], ux = q[1][0] - p0[0], uy = q[1][1] - p0[1], vx = q[3][0] - p0[0], vy = q[3][1] - p0[1], lu = hip(ux, uy), lv = hip(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) return true;
    var bx = [-g, -g, lu + g, lv + g];
    function loc(x, y) { var dx = x - p0[0], dy = y - p0[1]; return [(dx * ux + dy * uy) / lu, (dx * vx + dy * vy) / lv]; }
    var ts = this._cands(this.gT, ab, this.mT);
    var qg = [[-g, -g], [lu + g, -g], [lu + g, lv + g], [-g, lv + g]].map(function (p) { return [p0[0] + p[0] * ux / lu + p[1] * vx / lv, p0[1] + p[0] * uy / lu + p[1] * vy / lv]; });
    for (var i = 0; i < ts.length; i++) if (sobrepoeQ(qg, self.tb[ts[i]], 0)) return false;
    var ss = this._cands(this.gS, ab, this.mS);
    for (var j = 0; j < ss.length; j++) {
      var sg = this.sg[ss[j]];
      if (Math.max(sg[0], sg[2]) < ab[0] || Math.min(sg[0], sg[2]) > ab[2] || Math.max(sg[1], sg[3]) < ab[1] || Math.min(sg[1], sg[3]) > ab[3]) continue;
      var A = loc(sg[0], sg[1]), B = loc(sg[2], sg[3]);
      if (dentroCaixa([A[0], A[1], B[0], B[1]], bx)) return false;
    }
    return true;
  };
  DP.livre = function (bx, g) { return this.livreQ([[bx[0], bx[1]], [bx[2], bx[1]], [bx[2], bx[3]], [bx[0], bx[3]]], g); };
  DP.cortaTexto = function (x1, y1, x2, y2) {
    var bb = [Math.min(x1, x2) - 0.3, Math.min(y1, y2) - 0.3, Math.max(x1, x2) + 0.3, Math.max(y1, y2) + 0.3], ts = this._cands(this.gT, bb, this.mT);
    for (var i = 0; i < ts.length; i++) { var b = bboxQ(this.tb[ts[i]]); if (dentroCaixa([x1, y1, x2, y2], [b[0] - 0.2, b[1] - 0.2, b[2] + 0.2, b[3] + 0.2])) return true; }
    return false;
  };
  DP.texto = function (x, y, s, h, o) {
    o = o || {}; s = letraRomanS(txt(s));
    if (!s) return 0;
    var al = o.al || "E", anc = al === "C" ? "middle" : (al === "D" ? "end" : "start");
    var yb = o.meio ? y + 0.37 * h : y, rot = o.rot || 0, w = largTexto(s, h);
    var peso = o.peso != null ? o.peso : Math.round(0.022 * h * 1000) / 1000;
    this.s.push('<text x="' + n(x) + '" y="' + n(yb) + '" font-size="' + n(h) + '"' + (anc !== "start" ? ' text-anchor="' + anc + '"' : "") +
      (rot ? ' transform="rotate(' + n(rot) + " " + n(x) + " " + n(yb) + ')"' : "") + (o.cor ? ' fill="' + o.cor + '"' : "") +
      (peso > 0 ? ' stroke="' + (o.cor || PRETO) + '" stroke-width="' + n(peso) + '"' : "") + (o.attr || "") + ">" + esc(s) + "</text>");
    var q = caixaTexto(x, y, s, h, { al: al, meio: o.meio, rot: rot }), i = this.tb.length;
    this.tb.push(q); this._cel(this.gT, bboxQ(q), i);
    if (this.caixas && !o.semCaixa) this.caixas.push({ s: s, p: q });
    return w;
  };
  DP.seta = function (px, py, ux, uy, tam) { tam = tam || 2.0; var w = tam * 0.3, bx = px + ux * tam, by = py + uy * tam, nx = -uy, ny = ux; this.cheio([[px, py], [bx + nx * w, by + ny * w], [bx - nx * w, by - ny * w]]); };
  DP.tique = function (x, y, ux, uy) { var nx = uy, ny = -ux, tx = (ux + nx) / Math.SQRT2, ty = (uy + ny) / Math.SQRT2, L = 1.1; this.linha(x - tx * L, y - ty * L, x + tx * L, y + ty * L, "MAD-FINA"); };
  /* CADEIA DE COTAS (a da metálica, simplificada): pontos colineares; off + = à esquerda do sentido p0→pn */
  DP.cadeia = function (P, off, valores, o) {
    o = o || {};
    if (P.length < 2) return;
    var self = this, h = o.h || this.E.T.cota, p0 = P[0], pn = P[P.length - 1], L = hip(pn[0] - p0[0], pn[1] - p0[1]);
    if (L < 1e-6) return;
    var ux = (pn[0] - p0[0]) / L, uy = (pn[1] - p0[1]) / L, nx = uy, ny = -ux, ang = Math.atan2(uy, ux) * 180 / Math.PI, rx = ux, ry = uy;
    if (ang > 90.01 || ang < -90.01) { ang = ang > 0 ? ang - 180 : ang + 180; rx = -ux; ry = -uy; }
    var tnx = ry, tny = -rx, nseg = P.length - 1;
    function plano(of) {
      var Q = P.map(function (p) { return [p[0] + nx * of, p[1] + ny * of]; }), alt = 0, ext0 = 1.2, ext1 = 1.2, txs = [];
      for (var i = 0; i < nseg; i++) {
        var v = valores[i]; if (v == null || v === "") continue;
        var a = Q[i], b = Q[i + 1], seg = hip(b[0] - a[0], b[1] - a[1]), w = largTexto(v, h), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, sobe = 0.8;
        if (w + 1.0 > seg) {
          if (i === 0 && nseg > 1) { var dd = w / 2 + 1.6; mx = a[0] - ux * dd; my = a[1] - uy * dd; ext0 = Math.max(ext0, w + 2.4); }
          else if (i === nseg - 1 && nseg > 1) { var de = w / 2 + 1.6; mx = b[0] + ux * de; my = b[1] + uy * de; ext1 = Math.max(ext1, w + 2.4); }
          else if (nseg > 1) { alt++; sobe = 0.8 + h * (alt % 2 ? 1.25 : 2.5); }
        } else alt = 0;
        txs.push([mx + tnx * sobe, my + tny * sobe, v, o.attrs ? o.attrs[i] : ""]);
      }
      return { of: of, Q: Q, txs: txs, ext0: ext0, ext1: ext1 };
    }
    var pl = plano(off);
    if (o.offs && o.offs.length) {
      var tenta = [off].concat(o.offs), achou = null;
      for (var k = 0; k < tenta.length && !achou; k++) { var pk = plano(tenta[k]); if (pk.txs.every(function (t) { return self.livreQ(caixaTexto(t[0], t[1], t[2], h, { al: "C", rot: ang }), 0.3); })) achou = pk; }
      if (achou) pl = achou;
    }
    var Q = pl.Q, sg = pl.of >= 0 ? 1 : -1;
    if (!o.semExt) P.forEach(function (p, i) { if (Math.abs(pl.of) < 1.6) return; self.linha(p[0] + nx * sg, p[1] + ny * sg, Q[i][0] + nx * 1.5 * sg, Q[i][1] + ny * 1.5 * sg, "MAD-COTA"); });
    this.linha(Q[0][0] - ux * pl.ext0, Q[0][1] - uy * pl.ext0, Q[nseg][0] + ux * pl.ext1, Q[nseg][1] + uy * pl.ext1, "MAD-COTA");
    Q.forEach(function (q) { self.tique(q[0], q[1], ux, uy); });
    pl.txs.forEach(function (t) { self.texto(t[0], t[1], t[2], h, { al: "C", rot: ang, attr: t[3] }); });
  };
  DP.cota = function (x1, y1, x2, y2, off, valor, o) { this.cadeia([[x1, y1], [x2, y2]], off, [valor], o); };
  DP.balao = function (cx, cy, rot, attr) { var h = this.E.T.eixo, r = Math.max(h * 1.3, largTexto(rot, h) / 2 + 1.3); this.circ(cx, cy, r, "MAD-FINA"); this.texto(cx, cy, rot, h, { al: "C", meio: true, attr: attr }); return r; };
  DP.raioBalao = function (rot) { var h = this.E.T.eixo; return Math.max(h * 1.3, largTexto(rot, h) / 2 + 1.3); };
  /* balão de DETALHE: código em cima, folha embaixo; chamada até (px,py) */
  DP.marcaDet = function (cx, cy, codigo, folha, px, py) {
    var h = this.E.T.eixo * 0.82, r = Math.max(4.6, largTexto(codigo, h) / 2 + 1.2);
    if (px != null) { var dx = px - cx, dy = py - cy, L = hip(dx, dy); if (L > r + 0.5) { this.linha(cx + dx / L * r, cy + dy / L * r, px, py, "MAD-FINA"); this.ponto(px, py, 0.45); } }
    this.circ(cx, cy, r, "MAD-TITULO");
    this.linha(cx - r, cy, cx + r, cy, "MAD-FINA");
    this.texto(cx, cy - 0.8, codigo, h, { al: "C", attr: ' data-det="' + esc(codigo) + '"' });
    this.texto(cx, cy + 0.9 + h * 0.62, folha, Math.max(this.E.T.minimo, h * 0.8), { al: "C" });
    return r;
  };
  DP.nivel = function (x, y, valor, lado, attr) {
    var h = this.E.T.nivel, t = 2.2, sg = lado || 1, w = largTexto(valor, h);
    this.poli([[x, y], [x - t * 0.6, y - t], [x + t * 0.6, y - t]], "MAD-FINA", true);
    this.cheio([[x, y], [x, y - t], [x + sg * t * 0.6, y - t]]);
    this.linha(x - t * 0.6 * sg, y - t, x + sg * (w + 2.6), y - t, "MAD-FINA");
    this.texto(x + sg * 1.4, y - t - 0.8, valor, h, { al: sg > 0 ? "E" : "D", attr: attr });
  };
  /* chamada: ponto (px,py) → (tx,ty), patamar e as linhas de texto em cima */
  DP.chamada = function (px, py, tx, ty, linhas, o) {
    o = o || {};
    var self = this, h = o.h || this.E.T.nota, ls = arr(linhas).map(function (l) { return (l && typeof l === "object") ? l : { t: txt(l) }; }).filter(function (l) { return !!l.t; });
    var wmax = 0; ls.forEach(function (l) { wmax = Math.max(wmax, largTexto(l.t, h)); });
    var dir = o.dir || (tx >= px ? 1 : -1), L = hip(tx - px, ty - py) || 1, lh = h * 1.45;
    if (o.seta) this.seta(px, py, (tx - px) / L, (ty - py) / L, 1.8); else this.ponto(px, py, 0.4, o.cor);
    this.linha(px, py, tx, ty, o.cor ? "MAD-PEND" : "MAD-FINA");
    this.linha(tx, ty, tx + dir * (wmax + 1.6), ty, o.cor ? "MAD-PEND" : "MAD-FINA");
    ls.forEach(function (l, i) { self.texto(tx + dir * 0.8, ty - 0.9 - (ls.length - 1 - i) * lh, l.t, h, { al: dir > 0 ? "E" : "D", cor: l.cor || o.cor, attr: l.attr }); });
    return { w: wmax + 1.6, h: ls.length * lh };
  };
  /* bloco de linhas (com quebra pela largura): devolve a altura */
  DP.textos = function (x, y, linhas, h, o) {
    o = o || {}; var self = this, lh = h * (o.entre || 1.45), yy = y;
    arr(linhas).forEach(function (l) {
      var it = (l && typeof l === "object") ? l : { t: txt(l) };
      if (!it.t) { yy += lh * 0.5; return; }
      var ls = o.wmax ? quebrar(it.t, h, o.wmax - (o.recuo || 0)) : [it.t];
      ls.forEach(function (s, k) { self.texto(x + (k ? (o.recuo || 0) : 0), yy + h * 0.76, s, h, { cor: it.cor, attr: k ? "" : it.attr }); yy += lh; });
    });
    return yy - y;
  };
  DP.alturaTextos = function (linhas, h, wmax, recuo) { var nL = 0, lh = h * 1.45; arr(linhas).forEach(function (l) { var t = l && typeof l === "object" ? l.t : l; if (!t) { nL += 0.5; return; } nL += wmax ? quebrar(t, h, wmax - (recuo || 0)).length : 1; }); return nL * lh; };
  /* caixa w x h livre mais perto de pref dentro de area [x0,y0,x1,y1] */
  DP.procura = function (pref, w, h, area, o) {
    o = o || {};
    var passo = o.passo || 1.0, g = o.folga == null ? 0.4 : o.folga, best = null, bd = 1e18, R = o.raio || 1e9;
    for (var yy = area[1] + h / 2; yy <= area[3] - h / 2 + 1e-9; yy += passo)
      for (var xx = area[0] + w / 2; xx <= area[2] - w / 2 + 1e-9; xx += passo) {
        var dd = (xx - pref[0]) * (xx - pref[0]) + (yy - pref[1]) * (yy - pref[1]);
        if (dd < bd && dd <= R * R && this.livre([xx - w / 2, yy - h / 2, xx + w / 2, yy + h / 2], g)) { bd = dd; best = [xx, yy]; }
      }
    return best;
  };
  /* hachura a 45° (furos = caixas onde a linha é interrompida) */
  DP.hachura = function (x, y, w, h, passo, cam, furos) {
    passo = passo || 1.5;
    for (var c0 = -h + passo / 2; c0 < w; c0 += passo) {
      var xa = x + c0, ya = y + h, t0 = Math.max(0, x - xa), t1 = Math.min(h, x + w - xa);
      if (t1 <= t0 + 0.05) continue;
      var sg = [xa + t0, ya - t0, xa + t1, ya - t1], partes = [[0, 1]];
      (furos || []).forEach(function (fb) { var di = dentroCaixa(sg, fb); if (!di) return; var nv = []; partes.forEach(function (p) { if (di[1] <= p[0] || di[0] >= p[1]) nv.push(p); else { if (di[0] > p[0]) nv.push([p[0], di[0]]); if (di[1] < p[1]) nv.push([di[1], p[1]]); } }); partes = nv; });
      for (var ip = 0; ip < partes.length; ip++) { var pa = partes[ip]; if ((pa[1] - pa[0]) * (t1 - t0) < 0.05) continue; this.linha(sg[0] + (sg[2] - sg[0]) * pa[0], sg[1] + (sg[3] - sg[1]) * pa[0], sg[0] + (sg[2] - sg[0]) * pa[1], sg[1] + (sg[3] - sg[1]) * pa[1], cam || "MAD-HACHURA"); }
    }
  };
  /* MADEIRA EM CORTE TRANSVERSAL (Padrão RA v2.4): contorno grosso + anéis de crescimento concêntricos
     recortados na seção (EST-HACHURA). Retângulo x,y,w,h em papel. */
  DP.secaoMadeira = function (x, y, w, h, o) {
    o = o || {};
    this.ret(x, y, w, h, o.cam || "MAD-CORTE", o.attr);
    var cx = x + w * 0.28, cy = y + h * 0.72, rmax = Math.max(w, h) * 1.05, k = Math.min(w, h);
    if (k < 2.2) return;
    var bx = [x + 0.25, y + 0.25, x + w - 0.25, y + h - 0.25], passo = Math.max(1.2, k * 0.22);
    for (var r = passo; r < rmax; r += passo) {
      for (var i = 0; i < 40; i++) {
        var a0 = i * Math.PI / 20, a1 = (i + 1) * Math.PI / 20, s = [cx + r * Math.cos(a0), cy + r * Math.sin(a0) * 0.82, cx + r * Math.cos(a1), cy + r * Math.sin(a1) * 0.82], di = dentroCaixa(s, bx);
        if (di) this.linha(s[0] + (s[2] - s[0]) * di[0], s[1] + (s[3] - s[1]) * di[0], s[0] + (s[2] - s[0]) * di[1], s[1] + (s[3] - s[1]) * di[1], "MAD-HACHURA");
      }
    }
  };
  /* MADEIRA EM CORTE LONGITUDINAL (ao longo da fibra): contorno + linhas de fibra onduladas paralelas ao comprimento */
  DP.fibraMadeira = function (x, y, w, h, o) {
    o = o || {};
    this.ret(x, y, w, h, o.cam || "MAD-CORTE", o.attr);
    var horiz = o.vertical ? false : w >= h, Lc = horiz ? w : h, Lt = horiz ? h : w;
    if (Lt < 2.0) return;
    var nl = Math.max(1, Math.min(4, Math.floor(Lt / 2.2))), self = this;
    for (var j = 1; j <= nl; j++) {
      var t = Lt * j / (nl + 1), P = [];
      for (var s = 0.6; s <= Lc - 0.6 + 1e-9; s += Math.max(0.8, Lc / 40)) { var ond = Math.sin(s / Math.max(6, Lc / 3) * Math.PI * 2 + j) * Math.min(0.45, Lt * 0.08); P.push(horiz ? [x + s, y + t + ond] : [x + t + ond, y + s]); }
      for (var q = 0; q + 1 < P.length; q++) self.linha(P[q][0], P[q][1], P[q + 1][0], P[q + 1][1], "MAD-HACHURA");
    }
  };
  /* TABELA: cols [{ t: "TÍTULO" | ["L1","L2"], w?, al }]; linhas [[células] | { titulo, cor, attr } | { total: [..] }];
     célula: texto ou { t, cor, attr }; w ausente = pela maior célula. o = { fs, fsc, hl, grupos: [{ t, de, ate }] } → { w, h, cols } */
  DP.larguras = function (cols, linhas, o) {
    o = o || {};
    var T = this.E.T, fs = o.fs || T.tabela, fsc = o.fsc || T.tabelaCab;
    return cols.map(function (c, j) {
      if (c.w) return c.w;
      var w = 0; (Array.isArray(c.t) ? c.t : [c.t]).forEach(function (t) { w = Math.max(w, largTexto(letraRomanS(txt(t)), fsc)); });
      arr(linhas).forEach(function (L) { if (!L || L.titulo != null) return; var cel = L.total || L, v = cel[j], t = (v && typeof v === "object") ? txt(v.t) : txt(v); w = Math.max(w, largTexto(letraRomanS(t), fs)); });
      return Math.ceil(w + 2.6);
    });
  };
  DP.tabela = function (x, y, cols, linhas, o) {
    o = o || {};
    var self = this, T = this.E.T, fs = o.fs || T.tabela, fsc = o.fsc || T.tabelaCab, hl = o.hl || Math.max(4.4, fs * 1.85);
    var ws = this.larguras(cols, linhas, o), W = ws.reduce(function (s, v) { return s + v; }, 0);
    var nlc = 1; cols.forEach(function (c) { if (Array.isArray(c.t)) nlc = Math.max(nlc, c.t.length); });
    var gr = arr(o.grupos), hg = gr.length ? fsc * 1.5 + 2.2 : 0, hc = nlc * fsc * 1.3 + 2.4, emG = cols.map(function () { return false; });
    gr.forEach(function (g) { for (var j = g.de; j <= g.ate; j++) emG[j] = true; });
    function cabe(t, h, w) { var lt = largTexto(letraRomanS(t), h); return lt > w - 1.2 ? Math.max(T.minimo, h * (w - 1.2) / lt) : h; }
    var xc = x;
    cols.forEach(function (c, j) {
      var y0 = emG[j] ? y + hg : y, hh = emG[j] ? hc : hg + hc;
      self.ret(xc, y0, ws[j], hh, "MAD-TABELA");
      var ls = Array.isArray(c.t) ? c.t : [c.t], lh = fsc * 1.3, yt = y0 + hh / 2 - (ls.length - 1) * lh / 2;
      ls.forEach(function (t, q) { self.texto(xc + ws[j] / 2, yt + q * lh, t, cabe(t, fsc, ws[j]), { al: "C", meio: true }); });
      xc += ws[j];
    });
    gr.forEach(function (g) {
      var gx = x, gw = 0, j;
      for (j = 0; j < g.de; j++) gx += ws[j];
      for (j = g.de; j <= g.ate; j++) gw += ws[j];
      self.ret(gx, y, gw, hg, "MAD-TABELA");
      self.texto(gx + gw / 2, y + hg / 2, g.t, cabe(g.t, fsc, gw), { al: "C", meio: true });
    });
    var yy = y + hg + hc;
    arr(linhas).forEach(function (L) {
      if (L && L.titulo != null) { self.ret(x, yy, W, hl, "MAD-TABELA"); self.texto(x + 1.5, yy + hl / 2, L.titulo, cabe(L.titulo, fs, W), { meio: true, attr: L.attr || "", cor: L.cor }); yy += hl; return; }
      var cel = (L && L.total) || L, xx = x;
      cols.forEach(function (c, j) {
        var v = cel[j], t = (v && typeof v === "object") ? txt(v.t) : txt(v), cor = v && typeof v === "object" ? v.cor : null, at = v && typeof v === "object" ? v.attr : "";
        self.ret(xx, yy, ws[j], hl, "MAD-TABELA");
        if (t) { var h2 = cabe(t, fs, ws[j]), al = c.al || "C", tx = al === "E" ? xx + 1.0 : (al === "D" ? xx + ws[j] - 1.0 : xx + ws[j] / 2); self.texto(tx, yy + hl / 2, t, h2, { al: al, meio: true, cor: cor, attr: at }); }
        xx += ws[j];
      });
      yy += hl;
    });
    return { w: W, h: yy - y, cols: ws };
  };
  DP.svg = function () { return this.s.join(""); };
  function medirTabela(D, cols, linhas, o) { var Dm = new Desenho(D.E, null); return Dm.tabela(0, 0, cols, linhas, o); }

  /* título de vista (sem sublinhado — Padrão RA v2): nome e, embaixo, a escala */
  function tituloVista(D, x, y, titulo, escala, numero) {
    var T = D.E.T, xx = x, top = y;
    if (numero != null) {
      var r = 4.6; D.circ(x + r, y + r, r, "MAD-TITULO");
      D.texto(x + r, y + r, String(numero), T.detalhe * (String(numero).length > 2 ? 0.75 : 1), { al: "C", meio: true, attr: ' data-detalhe="' + esc(numero) + '"' });
      xx = x + 2 * r + 2.4; top = y + r - (T.titulo * 0.76 + (escala ? T.escala * 1.3 + 1.0 : 0)) / 2;
    }
    D.texto(xx, top + T.titulo * 0.76, titulo, T.titulo, { peso: 0.16, attr: ' data-titulo="1"' });
    if (escala) D.texto(xx, top + T.titulo * 0.76 + T.escala * 1.3 + 0.9, escala, T.escala);
    return Math.max(numero != null ? 9.2 : 0, (top - y) + T.titulo * 0.76 + (escala ? T.escala * 1.3 + 1.6 : 0.8)) + 1.0;
  }

  /* ================================================================ O MODELO PARA O DESENHO */
  function nomeEspecie(k) { var M = MM(); try { var e = M && M.especie(k); if (e && e.nome) return e.nome; } catch (er) { /* sem a tabela */ } return txt(k); }
  /* notação da peça (Padrão RA v2.4): "VI-12 - Itaúba 7x20 x 322" (cm) */
  function notacaoPeca(marca, esp, sec, L) { return txt(marca) + " - " + (esp ? especieCurta(esp) : "?") + " " + sec + " x " + cm(L); }
  function especieCurta(k) { var nm = nomeEspecie(k).split(" (")[0], p = nm.split(/[\s\/]+/)[0]; return p + (/CCA/i.test(nomeEspecie(k)) || /_cca$/.test(k) ? " CCA" : ""); }
  /* caixa da peça: centro de p0 a p1; extensoes = [comprimento, ao longo de dir_largura, ao longo de eixo × dir_largura] */
  function caixaPeca(p) {
    var u = unit(sub(p.p1, p.p0)), w = unit(p.dl || [0, 0, 1]);
    if (dot(u, u) < 0.5) u = [0, 0, 1];
    if (Math.abs(dot(u, w)) > 0.99) w = Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    var t = unit(cruz(u, w)), e1 = num(p.ext[1], 0.05), e2 = num(p.ext[2], 0.05), c = [];
    [p.p0, p.p1].forEach(function (P) { [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { c.push(soma(soma(P, mult(w, a * e1 / 2)), mult(t, b * e2 / 2))); }); }); });
    return { u: u, w: w, t: t, e1: e1, e2: e2, cantos: c };
  }
  function casco(P) {   /* casco convexo (monotone chain) */
    var p = P.slice().sort(function (a, b) { return (a[0] - b[0]) || (a[1] - b[1]); });
    if (p.length < 3) return p;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], i;
    for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 1e-12) lo.pop(); lo.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 1e-12) up.pop(); up.push(p[i]); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  function extrair(r, op, avisos) {
    var F = op.fonte, d = { r: r, op: op };
    var paraDe = {}; arr(r.especies && r.especies.pecas).forEach(function (e) { paraDe[e.id] = e.para; });
    d.pecas = arr(F.pecas).map(function (p) {
      var esp = paraDe[p.id] || null;
      return { id: p.id, marca: p.marca || null, grupo: p.grupo, nome: txt(p.nome), secao: p.secao_cm || null, p0: p.p0, p1: p.p1, dl: p.dir_largura, ext: p.extensoes_m || [num(p.comprimento_m, 0), 0.05, 0.05],
        painel: p.painel || null, pilar: p.pilar || null, comp: num(p.comprimento_corte_m, num(p.comprimento_m, 0)), vol: num(p.volume_m3, 0), massa: num(p.massa_kg, 0),
        especie: esp, especieNome: esp ? nomeEspecie(esp) : txt(p.especie), material: txt(p.material), entalhes: p.entalhes || null, obs: p.obs || null };
    });
    d.porId = {}; d.pecas.forEach(function (p) { d.porId[p.id] = p; });
    d.grupoDef = F.grupos || {};
    /* reprovações do cálculo → peças da fonte (o membro do modelo leva o id da peça no fim da descrição) */
    d.reprov = {};
    var mod = r.modelo && r.modelo.modelo, porMembro = {};
    if (mod) arr(mod.barras).forEach(function (b) { var id = txt(b.desc).split(" ").pop(); if (d.porId[id]) (porMembro[b.membro] = porMembro[b.membro] || {})[id] = 1; });
    arr(r.verificacoes).forEach(function (v) {
      if (v.ok) return;
      Object.keys(porMembro[v.membro] || {}).forEach(function (id) { var o = d.reprov[id]; if (!o || v.eta > o.eta) d.reprov[id] = { eta: v.eta, governa: v.governa, combinacao: v.combinacao, funcao: v.funcao, grupo: v.grupo }; });
    });
    /* pendências do resultado que citam marcas de peça ("BR-39") → a peça sai em vermelho com a nota */
    d.pendPeca = {};
    var porMarca = {}; d.pecas.forEach(function (p) { if (p.marca) (porMarca[p.marca] = porMarca[p.marca] || []).push(p); });
    d.porMarca = porMarca;
    arr(r.pendencias).forEach(function (t) { var re = /\b([A-Z]{2})-(\d{2,3})\b/g, m; while ((m = re.exec(t))) { (porMarca[m[0]] || []).forEach(function (p) { d.pendPeca[p.id] = t; }); } });
    /* pilares compostos: centro = média das 4 peças; eixos */
    var pil = {};
    d.pecas.forEach(function (p) { if (p.grupo === "PILAR_PECA" && p.pilar) { var q = pil[p.pilar] = pil[p.pilar] || { nome: p.pilar, pecas: [], bloq: [], z0: 1e9, z1: -1e9 }; q.pecas.push(p); q.z0 = Math.min(q.z0, p.p0[2], p.p1[2]); q.z1 = Math.max(q.z1, p.p0[2], p.p1[2]); } });
    d.pecas.forEach(function (p) { if (p.grupo === "PILAR_BLOQ" && p.pilar && pil[p.pilar]) pil[p.pilar].bloq.push(p); });
    d.pilares = Object.keys(pil).sort(natural).map(function (k) {
      var q = pil[k], sx = 0, sy = 0; q.pecas.forEach(function (p) { sx += p.p0[0]; sy += p.p0[1]; });
      q.x = sx / q.pecas.length; q.y = sy / q.pecas.length;
      var xs = q.pecas.map(function (p) { return p.p0[0]; }), ys = q.pecas.map(function (p) { return p.p0[1]; });
      q.bx = Math.max.apply(null, xs) - Math.min.apply(null, xs) + num(q.pecas[0].secao && q.pecas[0].secao[0], 7) / 100;
      q.by = Math.max.apply(null, ys) - Math.min.apply(null, ys) + num(q.pecas[0].secao && q.pecas[0].secao[1], 7) / 100;
      q.bloq.sort(function (a, b) { return a.p0[2] - b.p0[2]; });
      return q;
    });
    function agrupa(vs, tol) { var o = []; vs.slice().sort(function (a, b) { return a - b; }).forEach(function (v) { var u = o[o.length - 1]; if (u && Math.abs(v - u.m) < tol) { u.v.push(v); u.m = u.v.reduce(function (s, x) { return s + x; }, 0) / u.v.length; } else o.push({ v: [v], m: v }); }); return o.map(function (u) { return u.m; }); }
    d.eixosX = agrupa(d.pilares.map(function (p) { return p.x; }), 0.3).map(function (x, i) { return { v: x, nome: String(i + 1) }; });
    d.eixosY = agrupa(d.pilares.map(function (p) { return p.y; }), 0.3).map(function (y, i) { return { v: y, nome: String.fromCharCode(65 + i) }; });
    d.pilares.forEach(function (q) {
      var ex = d.eixosX.reduce(function (b, e) { return Math.abs(e.v - q.x) < Math.abs(b.v - q.x) ? e : b; }, d.eixosX[0]), ey = d.eixosY.reduce(function (b, e) { return Math.abs(e.v - q.y) < Math.abs(b.v - q.y) ? e : b; }, d.eixosY[0]);
      q.eixo = ey.nome + "-" + ex.nome;
    });
    /* pilaretes (topo do concreto) */
    d.pilaretes = arr(F.concreto).filter(function (c) { return c && c.pt; }).map(function (c) { var t = c.pt; return { id: t.id, x: num(t.xt, 0), y: num(t.yt, 0), dx: num(t.dx_t, 0.3), dy: num(t.dy_t, 0.3), topo: num(t.topo, null), nome: t.nome }; });
    d.niveis = r.niveisFonte || (F.piso_pw && F.piso_pw.niveis) || {};
    d.paineisPW = arr(F.piso_pw && F.piso_pw.paineis);
    /* painéis de wood frame: peças por painel; eixo pela guia inferior (ou a peça horizontal mais longa) */
    var pn = {};
    d.pecas.forEach(function (p) { if (p.painel) (pn[p.painel] = pn[p.painel] || { nome: p.painel, pecas: [], ferr: [] }).pecas.push(p); });
    d.pecas.forEach(function (p) {
      if (p.grupo !== "FERRAGEM") return;
      var m = /painel (\d+)/i.exec(p.nome); if (!m) return;
      var k = "PN-" + dois(+m[1]); if (pn[k]) pn[k].ferr.push(p);
    });
    d.paineis = Object.keys(pn).sort(natural).map(function (k) {
      var q = pn[k], hz = q.pecas.filter(function (p) { return Math.abs(p.p0[2] - p.p1[2]) < 0.01 && p.grupo !== "WF_CHAPA"; }), base = null;
      var gi = q.pecas.filter(function (p) { return p.grupo === "WF_GUIA_INF"; });
      (gi.length ? gi : hz).forEach(function (p) { if (!base || hip(p.p1[0] - p.p0[0], p.p1[1] - p.p0[1]) > hip(base.p1[0] - base.p0[0], base.p1[1] - base.p0[1])) base = p; });
      var u = unit([base.p1[0] - base.p0[0], base.p1[1] - base.p0[1], 0]);
      if (u[0] < -0.5 || (Math.abs(u[0]) < 0.5 && u[1] < 0)) u = mult(u, -1);
      q.u = u; q.n = [-u[1], u[0], 0];
      var ss = []; q.pecas.concat(q.ferr).forEach(function (p) { if (p.grupo === "WF_CHAPA") return; [p.p0, p.p1].forEach(function (P) { ss.push(dot(P, u)); }); });
      q.s0 = Math.min.apply(null, ss) - 0.06; q.s1 = Math.max.apply(null, ss) + 0.06;
      q.z0 = 0; q.z1 = Math.max.apply(null, q.pecas.filter(function (p) { return p.grupo !== "WF_CHAPA"; }).map(function (p) { return Math.max(p.p0[2], p.p1[2]) + 0.1; }));
      q.pos = dot(base.p0, q.n);
      q.num = k.replace(/^PN-/, "");
      return q;
    });
    /* chapas do fechamento sem painel na fonte: vão para os painéis do mesmo plano que elas cobrem */
    d.pecas.forEach(function (p) {
      if (!/^WF_/.test(p.grupo) || p.painel) return;
      var ax = sub(p.p1, p.p0), vert = Math.abs(ax[2]) > 0.9 * Math.sqrt(dot(ax, ax)), u, a0, a1, s0 = null;
      if (vert) { u = unit([num(p.dl && p.dl[0], 1), num(p.dl && p.dl[1], 0), 0]); }
      else u = unit([ax[0], ax[1], 0]);
      d.paineis.forEach(function (q) {
        if (s0 && p.grupo !== "WF_CHAPA") return;
        if (Math.abs(dot(u, q.u)) < 0.9 || Math.abs(dot(p.p0, q.n) - q.pos) > 0.25) return;
        if (vert) { var c0 = dot(p.p0, q.u), e = num(p.ext[1], 0) / 2; a0 = c0 - e; a1 = c0 + e; } else { a0 = Math.min(dot(p.p0, q.u), dot(p.p1, q.u)); a1 = Math.max(dot(p.p0, q.u), dot(p.p1, q.u)); }
        if (a1 > q.s0 + 0.02 && a0 < q.s1 - 0.02) { if (p.grupo === "WF_CHAPA") (q.chapasPlano = q.chapasPlano || []).push(p); else q.pecas.push(p); s0 = q; }
      });
      if (!s0) (d.semPainel = d.semPainel || []).push(p);
    });
    /* camadas do piso (pacotes por zona) */
    d.camadas = (r.acoes && r.acoes.camadasPiso) || null;
    /* ligações por código */
    d.lig = {}; arr(r.ligacoes).forEach(function (l) { (d.lig[l.codigo] = d.lig[l.codigo] || []).push(l); });
    /* seção mais comum de um grupo */
    d.secaoDe = function (g, filtro) { var c = {}; d.pecas.forEach(function (p) { if (p.grupo === g && p.secao && (!filtro || filtro(p))) { var k = p.secao.join("x"); c[k] = (c[k] || 0) + 1; } }); var best = null; Object.keys(c).forEach(function (k) { if (!best || c[k] > c[best]) best = k; }); return best ? best.split("x").map(Number) : null; };
    if (!d.pilares.length) avisos.push("Fonte sem pilares compostos (PILAR_PECA): folhas 01, 03, 04 e 06 sem eixos.");
    return d;
  }

  /* ---------------------------------------------------------------- vista ortogonal (planta ou elevação)
   * base = { e1, e2 } (vetores 3D do eixo x e do eixo y do papel, y do papel para BAIXO = -e2), escala s (mm/m) */
  function Vista(D, o) {
    var v = { s: o.s, ox: o.ox, oy: o.oy, e1: o.e1 || [1, 0, 0], e2: o.e2 || [0, 1, 0], a0: o.a0 || 0, b1: o.b1 || 0 };
    v.P3 = function (X) { return [v.ox + (dot(X, v.e1) - v.a0) * v.s, v.oy + (v.b1 - dot(X, v.e2)) * v.s]; };
    v.P = function (a, b) { return [v.ox + (a - v.a0) * v.s, v.oy + (v.b1 - b) * v.s]; };
    v.peca = function (p) { var c = caixaPeca(p); return { casco: casco(c.cantos.map(v.P3)), a: v.P3(p.p0), b: v.P3(p.p1), cx: c }; };
    return v;
  }
  /* rótulo de peça ao lado dela, paralelo ao eixo, num trecho livre; sem lugar, chamada até um lugar livre perto */
  function rotuloPeca(D, poly, a, b, s, h, o) {
    o = o || {};
    var L = hip(b[0] - a[0], b[1] - a[1]), cx = 0, cy = 0;
    poly.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= poly.length; cy /= poly.length;
    var ux, uy;
    if (L < 1e-6) { ux = 1; uy = 0; } else { ux = (b[0] - a[0]) / L; uy = (b[1] - a[1]) / L; }
    var ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90.01) ang -= 180; if (ang < -89.99) ang += 180;
    var ra = ang * Math.PI / 180, dx = Math.cos(ra), dy = Math.sin(ra), nx = -dy, ny = dx;
    /* meia largura do contorno na normal */
    var hw = 0; poly.forEach(function (p) { hw = Math.max(hw, Math.abs((p[0] - cx) * nx + (p[1] - cy) * ny)); });
    var hl = 0; poly.forEach(function (p) { hl = Math.max(hl, Math.abs((p[0] - cx) * dx + (p[1] - cy) * dy)); });
    var w = largTexto(letraRomanS(s), h), fr = [0, -0.18, 0.18, -0.32, 0.32, -0.42, 0.42, -0.1, 0.1, -0.25, 0.25];
    var oc = { cor: o.cor, attr: o.attr };
    if (!o.dentro && w <= 2 * hl + 4) {
      for (var k = 0; k < 3; k++) for (var i = 0; i < fr.length; i++) for (var sd = -1; sd <= 1; sd += 2) {
        var t = fr[i] * Math.max(0, 2 * hl - w), off = hw + 0.7 + h * 0.47 + k * 1.6;
        var px = cx + dx * t + nx * off * sd, py = cy + dy * t + ny * off * sd;
        var q = caixaTexto(px, py, s, h, { al: "C", meio: true, rot: ang });
        if (D.livreQ(q, 0.35)) { D.texto(px, py, s, h, { al: "C", meio: true, rot: ang, cor: oc.cor, attr: oc.attr }); return true; }
      }
    }
    if (o.dentro && w <= 2 * hl - 1 && 2 * hw > h * 1.2) { var qd = caixaTexto(cx, cy, s, h, { al: "C", meio: true, rot: ang }); if (D.livreQ(qd, 0.2)) { D.texto(cx, cy, s, h, { al: "C", meio: true, rot: ang, cor: oc.cor, attr: oc.attr }); return true; } }
    /* chamada: o texto deitado num lugar livre até `raio` mm do centro */
    var R = o.raio || 26, hb = h * 0.94, area = o.area || [cx - R, cy - R, cx + R, cy + R];
    var lugar = D.procura([cx + R * 0.35, cy - R * 0.35], w + 1.0, hb + 0.6, area, { passo: 1.0, folga: 0.35, raio: R });
    var tent = 0;
    while (lugar && tent < 6) {
      var ex = lugar[0] - (lugar[0] > cx ? (w / 2 + 0.6) : -(w / 2 + 0.6)), ey = lugar[1] + hb / 2 + 0.3;
      var ax = cx, ay = cy;
      if (!D.cortaTexto(ax, ay, ex, ey)) {
        D.texto(lugar[0], lugar[1], s, h, { al: "C", meio: true, cor: oc.cor, attr: oc.attr });
        D.linha(ex, ey, lugar[0] + (lugar[0] > cx ? w / 2 + 0.6 : -(w / 2 + 0.6)), ey, o.cor ? "MAD-PEND" : "MAD-FINA");
        D.linha(ax, ay, ex, ey, o.cor ? "MAD-PEND" : "MAD-FINA"); D.ponto(ax, ay, 0.35, o.cor);
        return true;
      }
      tent++; area = [area[0], area[1], area[2], area[3]];
      lugar = D.procura([cx - R * 0.35 * (tent % 2 ? 1 : -1), cy + R * 0.35 * (tent > 2 ? 1 : -1)], w + 1.0 + tent, hb + 0.6, area, { passo: 1.0, folga: 0.35, raio: R });
    }
    return false;
  }

  /* eixos de uma planta: linhas traço-ponto, balões nas duas pontas */
  function eixosPlanta(D, d, V, caixa, o) {
    o = o || {};
    var y0 = caixa[1] - (o.folga || 14), y1 = caixa[3] + (o.folga || 14), x0 = caixa[0] - (o.folga || 14), x1 = caixa[2] + (o.folga || 14);
    d.eixosX.forEach(function (e) {
      var P = V.P(e.v, 0), r = D.raioBalao(e.nome);
      D.linha(P[0], y0, P[0], y1, "MAD-EIXO");
      D.balao(P[0], y0 - r, e.nome, ' data-eixo="' + e.nome + '"'); D.balao(P[0], y1 + r, e.nome);
    });
    d.eixosY.forEach(function (e) {
      var P = V.P(0, e.v), r = D.raioBalao(e.nome);
      D.linha(x0, P[1], x1, P[1], "MAD-EIXO");
      D.balao(x0 - r, P[1], e.nome, ' data-eixo="' + e.nome + '"'); D.balao(x1 + r, P[1], e.nome);
    });
    return { x0: x0 - 2 * D.raioBalao("A"), x1: x1 + 2 * D.raioBalao("A"), y0: y0 - 2 * D.raioBalao("1"), y1: y1 + 2 * D.raioBalao("1") };
  }
  function cotasEixos(D, d, V, yTop, xEsq) {
    if (d.eixosX.length > 1) {
      var P = d.eixosX.map(function (e) { return [V.P(e.v, 0)[0], yTop]; }), v = [];
      for (var i = 0; i + 1 < d.eixosX.length; i++) v.push(cm(d.eixosX[i + 1].v - d.eixosX[i].v));
      D.cadeia(P, 7, v, { semExt: true, attrs: v.map(function () { return ' data-cota="eixos-x"'; }) });
      if (d.eixosX.length > 2) D.cota(P[0][0], yTop, P[P.length - 1][0], yTop, 13, cm(d.eixosX[d.eixosX.length - 1].v - d.eixosX[0].v), { semExt: true, attrs: [' data-cota="eixos-x-total"'] });
    }
    if (d.eixosY.length > 1) {
      var Q = d.eixosY.map(function (e) { return [xEsq, V.P(0, e.v)[1]]; }), w = [];
      for (var j = 0; j + 1 < d.eixosY.length; j++) w.push(cm(d.eixosY[j + 1].v - d.eixosY[j].v));
      D.cadeia(Q, 7, w, { semExt: true, attrs: w.map(function () { return ' data-cota="eixos-y"'; }) });
    }
  }

  /* desenha as peças de uma lista numa vista; devolve os itens (para os rótulos depois do resto) */
  function desenharPecas(D, d, V, lista, camDe) {
    return lista.map(function (p) {
      var g = V.peca(p), red = d.reprov[p.id] || d.pendPeca[p.id], cam = red ? "MAD-PEND" : (camDe ? camDe(p) : "MAD-PECA");
      D.poli(g.casco, cam, true, ' data-peca="' + esc(p.id) + '"' + (p.marca ? ' data-marca="' + esc(p.marca) + '"' : "") + (red ? ' data-pend="1"' : ""));
      return { p: p, g: g, red: !!red };
    });
  }
  function rotular(D, itens, h, o) {
    o = o || {};
    var feitos = {}, falhas = [];
    itens.sort(function (a, b) { return (b.red - a.red) || (hip(b.g.b[0] - b.g.a[0], b.g.b[1] - b.g.a[1]) - hip(a.g.b[0] - a.g.a[0], a.g.b[1] - a.g.a[1])); });
    itens.forEach(function (it) {
      var m = it.p.marca; if (!m) return;
      if (o.umaPorMarca && feitos[m]) return;
      var ok = rotuloPeca(D, it.g.casco, it.g.a, it.g.b, m, h, { cor: it.red ? VERMELHO : null, attr: ' data-rotulo="' + esc(m) + '"', raio: o.raio, area: o.area });
      if (!ok && o.raio2) ok = rotuloPeca(D, it.g.casco, it.g.a, it.g.b, m, h, { cor: it.red ? VERMELHO : null, attr: ' data-rotulo="' + esc(m) + '"', raio: o.raio2 });
      if (ok) feitos[m] = 1; else falhas.push(m);
    });
    return falhas;
  }
  function caixaDe(D, d, lista, V) { var xs = [], ys = []; lista.forEach(function (p) { V.peca(p).casco.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); }); return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; }
  function extensao(lista, f) { var a = [], b = []; lista.forEach(function (p) { [p.p0, p.p1].forEach(function (P) { var q = f(P); a.push(q[0]); b.push(q[1]); }); }); return { a0: Math.min.apply(null, a), a1: Math.max.apply(null, a), b0: Math.min.apply(null, b), b1: Math.max.apply(null, b) }; }

  /* ================================================================ COLUNA DE NOTAS E CARIMBO */
  function colunaNotas(D, g, blocos) {
    var col = g.coluna, car = g.carimbo, x0 = col.x + 4, wmax = col.w - 7, yMax = car.y - 3, yMin = col.y + 4, T = D.E.T;
    var tent = [T.nota, T.nota * 0.92, T.nota * 0.84].filter(function (hh) { return hh >= T.minimo - 1e-9; }).concat([T.minimo]), esc0 = null;
    function medir(h, hq) { var tot = 0; blocos.forEach(function (b) { tot += hq * 1.31 + 1.5; b.itens.forEach(function (it, i) { var t = (it && typeof it === "object") ? it.t : it, pre = b.numerar ? (i + 1) + "- " : "- "; tot += quebrar(t, h, wmax - largTexto(pre, h)).length * h * 1.42 + 0.7; }); tot += 3.5; }); return tot; }
    for (var i = 0; i < tent.length; i++) { var hq = Math.min(T.quadro * 0.62, tent[i] * 2.2); if (medir(tent[i], hq) <= yMax - yMin) { esc0 = [tent[i], hq]; break; } }
    var coube = !!esc0; if (!esc0) esc0 = [T.minimo, Math.min(T.quadro * 0.62, T.minimo * 2.2)];
    var h = esc0[0], hq0 = esc0[1], y = Math.max(yMin, yMax - medir(h, hq0));
    D.linha(col.x, col.y, col.x, car.y, "MAD-MOLDURA");
    blocos.forEach(function (b) {
      D.texto(x0, y + hq0 * 0.76, b.titulo, hq0, { peso: 0.26, cor: b.cor });
      y += hq0 * 1.31 + 1.5;
      b.itens.forEach(function (it, i) {
        var o = (it && typeof it === "object") ? it : { t: txt(it) }, pre = b.numerar ? (i + 1) + "- " : "- ", rec = largTexto(pre, h);
        D.texto(x0, y + h * 0.76, pre, h, { cor: o.cor || b.cor });
        quebrar(o.t, h, wmax - rec).forEach(function (s) { if (y + h < yMax + 0.5) D.texto(x0 + rec, y + h * 0.76, s, h, { cor: o.cor || b.cor, attr: o.attr }); y += h * 1.42; });
        y += 0.7;
      });
      y += 3.5;
    });
    return coube;
  }
  var COR_DESTAQUE = "#00406A", COR_CAMADA = { "RA-CARIMBO-ROTULO": "#444", "RA-CARIMBO-DESTAQUE": COR_DESTAQUE };
  function carimbo(D, pr, folha, g, empresa, logo, rotuloFolha) {
    var P = PR(), L = P.carimboRA(pr, folha, null, empresa || null, g, { logos: logo ? 1 : 0 }), cam = P.CAMADAS_CARIMBO_RA, A = P.ALT_MAIUSCULA, k = g.carimbo, s = [];
    function pena(c0) { return n((cam[c0] || [0, 0.18])[1]); }
    s.push('<g transform="translate(' + n(k.x) + " " + n(k.y) + ')" font-family="Arial,Helvetica,sans-serif" data-carimbo="RA" style="white-space:pre">');
    s.push('<rect x="0" y="0" width="' + n(L.w) + '" height="' + n(L.h) + '" fill="#fff"/>');
    if (logo) L.logos.forEach(function (b) { s.push('<image href="' + esc(logo) + '" x="' + n(b.x) + '" y="' + n(b.y) + '" width="' + n(b.w) + '" height="' + n(b.h) + '" preserveAspectRatio="xMidYMid meet"/>'); });
    L.retangulos.forEach(function (r) { s.push('<rect x="' + n(r.x) + '" y="' + n(r.y) + '" width="' + n(r.w) + '" height="' + n(r.h) + '" fill="none" stroke="#111" stroke-width="' + pena(r.camada) + '"/>'); });
    L.linhas.forEach(function (l) { s.push('<line x1="' + n(l.x1) + '" y1="' + n(l.y1) + '" x2="' + n(l.x2) + '" y2="' + n(l.y2) + '" stroke="' + (l.camada === "RA-CARIMBO-DESTAQUE" ? COR_DESTAQUE : "#111") + '" stroke-width="' + pena(l.camada) + '"/>'); });
    L.textos.forEach(function (t) {
      var ts = t.campo === "folha" && rotuloFolha ? rotuloFolha : t.s;
      s.push('<text x="' + n(t.x) + '" y="' + n(t.y) + '" font-size="' + n(t.h / A) + '" text-anchor="' + (t.al === "C" ? "middle" : "start") + '" fill="' + (COR_CAMADA[t.camada] || "#111") + '"' +
        (t.negrito ? ' font-weight="bold"' : "") + (t.param ? ' data-pr-param="' + t.param + '"' : "") + (t.campo ? ' data-cr="' + t.campo + '"' : "") + ">" + esc(ts) + "</text>");
    });
    s.push("</g>");
    D.add(s.join(""));
  }

  /* ================================================================ FOLHA 01 — LOCAÇÃO + CARGAS NA FUNDAÇÃO */
  var OV = 30;
  function folhaLocacao(c) {
    var D = c.D, d = c.d, r = c.r, a = c.geo.area, T = D.E.T, titH = 16;
    var xs = [], ys = [];
    d.pilaretes.forEach(function (p) { xs.push(p.x - p.dx / 2, p.x + p.dx / 2); ys.push(p.y - p.dy / 2, p.y + p.dy / 2); });
    d.pilares.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    if (!xs.length) { D.texto(a.x + 10, a.y + 20, "Fonte sem pilaretes nem pilares: sem locação.", T.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var X0 = Math.min.apply(null, xs), X1 = Math.max.apply(null, xs), Y0 = Math.min.apply(null, ys), Y1 = Math.max.apply(null, ys);
    var eE = escolher(PADRAO_MAD.escalas.planta, function (e) { var s = 1000 / e; return (X1 - X0) * s + 2 * OV + 10 <= a.w && (Y1 - Y0) * s + 2 * OV + titH <= a.h * 0.42; }), s = 1000 / eE;
    var wP = (X1 - X0) * s, ox = a.x + (a.w - wP) / 2, oy = a.y + titH + OV + 4;
    tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE LOCAÇÃO DOS PILARETES E DO PÉ DOS PILARES", "ESC 1:" + eE);
    var V = Vista(D, { s: s, ox: ox, oy: oy, a0: X0, b1: Y1 });
    var cx0 = V.P(X0, Y1), cx1 = V.P(X1, Y0), caixa = [cx0[0], cx0[1], cx1[0], cx1[1]];
    var lim = eixosPlanta(D, d, V, caixa, { folga: 12 });
    /* pilaretes (concreto = contexto) */
    var itensPT = d.pilaretes.map(function (p) {
      var A = V.P(p.x - p.dx / 2, p.y + p.dy / 2), B = V.P(p.x + p.dx / 2, p.y - p.dy / 2);
      D.ret(A[0], A[1], B[0] - A[0], B[1] - A[1], "MAD-CONTEXTO", ' data-pilarete="' + esc(p.id) + '"');
      D.linha(A[0], A[1], B[0], B[1], "MAD-CONTEXTO"); D.linha(A[0], B[1], B[0], A[1], "MAD-CONTEXTO");
      return { p: p, poly: [[A[0], A[1]], [B[0], A[1]], [B[0], B[1]], [A[0], B[1]]] };
    });
    /* pé dos pilares: as 4 peças cortadas no pé (seção) */
    d.pilares.forEach(function (q) {
      q.pecas.forEach(function (p) { var g = V.peca({ p0: p.p0, p1: [p.p0[0], p.p0[1], p.p0[2] + 0.01], dl: p.dl, ext: [0.01, p.ext[1], p.ext[2]] }); D.cheio(g.casco, PRETO, ' data-peca="' + esc(p.id) + '"'); });
    });
    cotasEixos(D, d, V, lim.y0 - 2, lim.x0 - 2);
    /* rótulos: pilares (P1…) e pilaretes (PT-…) */
    d.pilares.forEach(function (q) {
      var P = V.P(q.x, q.y), w = q.bx * s / 2;
      rotuloPeca(D, [[P[0] - w, P[1] - w], [P[0] + w, P[1] - w], [P[0] + w, P[1] + w], [P[0] - w, P[1] + w]], [P[0] - w, P[1]], [P[0] + w, P[1]], q.nome, T.pilar, { attr: ' data-pilar="' + q.nome + '"', raio: 18 });
    });
    itensPT.forEach(function (it) { var P = it.poly; rotuloPeca(D, P, [P[0][0], (P[0][1] + P[2][1]) / 2], [P[1][0], (P[0][1] + P[2][1]) / 2], it.p.id, T.marcaDensa, { attr: ' data-rotulo-pt="' + esc(it.p.id) + '"', raio: 22 }); });
    /* balão do pé do pilar (detalhe na folha 06) */
    var q1 = d.pilares[0];
    if (q1) { var P1 = V.P(q1.x, q1.y), lb = D.procura([P1[0] - 16, P1[1] - 14], 12, 12, [lim.x0, lim.y0, lim.x1, lim.y1], { folga: 0.4 }); if (lb) D.marcaDet(lb[0], lb[1], "L01", "06", P1[0], P1[1]); }
    /* QUADRO DE CARGAS NA FUNDAÇÃO */
    var yq = lim.y1 + 10, xq = a.x + 4;
    var rf = arr(r.reacoesFundacao).slice().sort(function (p, q) { return natural(p.pilarete, q.pilarete); });
    var ex1 = d.eixosX[0] ? d.eixosX[0].v : 0, ey1 = d.eixosY[0] ? d.eixosY[0].v : 0, ptPorId = {};
    d.pilaretes.forEach(function (p) { ptPorId[p.id] = p; });
    var hips = ["V1", "V2", "V3", "V4"].filter(function (h) { return rf.some(function (x) { return x[h]; }); });
    var cols = [{ t: "PILARETE" }, { t: ["SEÇÃO", "(cm)"] }, { t: ["x", "(cm)"] }, { t: ["y", "(cm)"] }, { t: "N" }, { t: "N" }];
    hips.forEach(function () { cols.push({ t: "N" }, { t: "Hx" }, { t: "Hy" }); });
    var grupos = [{ t: "G", de: 4, ate: 4 }, { t: "Q", de: 5, ate: 5 }];
    hips.forEach(function (h, i) { grupos.push({ t: h + " (vento)", de: 6 + 3 * i, ate: 8 + 3 * i }); });
    function v2(x, attr) { return { t: br(num(x, 0), 2), attr: attr || "" }; }
    var SG = 0, SQ = 0;
    var lin = rf.map(function (x) {
      var pt = ptPorId[x.pilarete], xx = x.x != null ? x.x : (pt ? pt.x : null), yy = x.y != null ? x.y : (pt ? pt.y : null);
      SG += num(x.G && x.G.N, 0); SQ += num(x.Q && x.Q.N, 0);
      var l = [{ t: x.pilarete, attr: ' data-reacao="' + esc(x.pilarete) + '"' }, pt ? cm(pt.dx) + "x" + cm(pt.dy) : "-", xx != null ? cm(xx - ex1) : "-", yy != null ? cm(yy - ey1) : "-",
        v2(x.G && x.G.N, ' data-rN="G"'), v2(x.Q && x.Q.N, ' data-rN="Q"')];
      hips.forEach(function (h) { var o = x[h] || {}; l.push(v2(o.N, ' data-rN="' + h + '"'), v2(o.Vx), v2(o.Vy)); });
      return l;
    });
    var tot = ["", "", "", { t: "SOMA" }, { t: br(SG, 2), attr: ' data-soma-G="' + (Math.round(SG * 1000) / 1000) + '"' }, { t: br(SQ, 2), attr: ' data-soma-Q="' + (Math.round(SQ * 1000) / 1000) + '"' }];
    hips.forEach(function () { tot.push("", "", ""); });
    lin.push({ total: tot });
    var hT = tituloVista(D, xq, yq, "QUADRO DE CARGAS NA FUNDAÇÃO (kN) - VALORES CARACTERÍSTICOS", null) + 1;
    var mT = medirTabela(D, cols, lin, { grupos: grupos });
    var hDisp = a.y + a.h - 2 - (yq + hT), fs = T.tabela, hl = null;
    if (mT.h > hDisp) { var k = hDisp / mT.h; fs = Math.max(T.minimo, T.tabela * Math.max(0.84, k)); hl = Math.max(fs * 1.62, (hDisp - 14) / (lin.length + 2)); }
    var tb = D.tabela(xq, yq + hT, cols, lin, { grupos: grupos, fs: fs, fsc: Math.max(T.minimo, fs * 1.15), hl: hl || undefined });
    if (yq + hT + tb.h > a.y + a.h + 0.5) c.avisos.push("Folha 01: o quadro de cargas passa do pé da área de desenho (" + rf.length + " pilaretes).");
    /* convenção ao lado */
    var xc = xq + tb.w + 10, wc = a.x + a.w - xc - 2;
    if (wc > 60) {
      var yc = yq + 1;
      yc += tituloVista(D, xc, yc, "CONVENÇÃO", null) + 1;
      var conv = [txt(r.reacoesConvencao), "x, y: posição do centro do pilarete a partir do cruzamento dos eixos " + (d.eixosX[0] ? d.eixosX[0].nome : "1") + " e " + (d.eixosY[0] ? d.eixosY[0].nome : "A") + " (eixos da madeira), em cm.",
        "Hx, Hy: forças horizontais no topo do pilarete nas direções x e y do modelo; N > 0 = compressão.", "Valores com 2 casas: cargas de estrutura leve (a 1 casa os casos de vento sumiriam)."];
      D.textos(xc, yc, conv.filter(Boolean), T.nota * 0.92, { wmax: wc });
    }
    return { escala: "INDICADA" };
  }

  /* ================================================================ FOLHA 02 — PISO SECO */
  function folhaPiso(c) {
    var D = c.D, d = c.d, r = c.r, a = c.geo.area, T = D.E.T, titH = 16;
    var lista = d.pecas.filter(function (p) { return /^PISO_/.test(p.grupo); });
    var ex = extensao(lista, function (P) { return [P[0], P[1]]; });
    d.paineisPW.forEach(function (pw) { arr(pw.contorno_t).forEach(function (q) { ex.a0 = Math.min(ex.a0, q[0]); ex.a1 = Math.max(ex.a1, q[0]); ex.b0 = Math.min(ex.b0, q[1]); ex.b1 = Math.max(ex.b1, q[1]); }); });
    var W = ex.a1 - ex.a0, H = ex.b1 - ex.b0;
    var eE = escolher(PADRAO_MAD.escalas.planta, function (e) { var s = 1000 / e; return W * s + 2 * OV + 6 <= a.w && H * s + 2 * OV + titH <= a.h * 0.46; }), s = 1000 / eE;
    var ox = a.x + (a.w - W * s) / 2, oy = a.y + titH + OV;
    tituloVista(D, a.x + 4, a.y + 2, "PLANTA DO VIGAMENTO DO PISO SECO", "ESC 1:" + eE + " - topo das vigas principais " + niv(num(d.niveis.topo_VP, -0.28)) + ", topo dos barrotes " + niv(num(d.niveis.topo_barrote, -0.12)));
    var V = Vista(D, { s: s, ox: ox, oy: oy, a0: ex.a0, b1: ex.b1 });
    var caixa = [ox, oy, ox + W * s, oy + H * s];
    var lim = eixosPlanta(D, d, V, caixa, { folga: 8 });
    var principal = /^PISO_VIGA$/;
    var itens = desenharPecas(D, d, V, lista.filter(function (p) { return principal.test(p.grupo); }), function () { return "MAD-PRINCIPAL"; })
      .concat(desenharPecas(D, d, V, lista.filter(function (p) { return !principal.test(p.grupo); }), function () { return "MAD-PECA"; }));
    cotasEixos(D, d, V, lim.y0 - 2, lim.x0 - 2);
    var falhas = rotular(D, itens, T.marcaDensa, { raio: 24, raio2: 48 });
    if (falhas.length) c.avisos.push("Folha 02: " + falhas.length + " marca(s) sem lugar livre na planta do piso: " + falhas.slice(0, 8).join(", "));
    var yAbaixo = lim.y1 + 6;
    /* PAGINAÇÃO DO PAINEL WALL (escala menor, à esquerda embaixo) */
    var cat = c.painelCat, yb = yAbaixo;
    var esc2 = escolher(PADRAO_MAD.escalas.paginacao, function (e) { return W * 1000 / e <= a.w * 0.5; }), s2 = 1000 / esc2;
    var hP = tituloVista(D, a.x + 4, yb, "PAGINAÇÃO DO PAINEL WALL 40 mm (" + br(cat.L, 2) + " x " + br(cat.b, 2) + " m)", "ESC 1:" + esc2 + " - seta = sentido do comprimento da chapa");
    var V2 = Vista(D, { s: s2, ox: a.x + 8, oy: yb + hP + 4, a0: ex.a0, b1: ex.b1 });
    var maiores = [];
    var rotPW = [];
    d.paineisPW.forEach(function (pw, i) {
      var cont = arr(pw.contorno_t).map(function (q) { return V2.P(q[0], q[1]); });
      if (cont.length < 3) return;
      var xs = arr(pw.contorno_t).map(function (q) { return q[0]; }), ys = arr(pw.contorno_t).map(function (q) { return q[1]; });
      var lx = Math.max.apply(null, xs) - Math.min.apply(null, xs), ly = Math.max.apply(null, ys) - Math.min.apply(null, ys), Lmax = Math.max(lx, ly), Lmin = Math.min(lx, ly);
      var grande = !/ducha/i.test(pw.nome) && (Lmax > cat.L + 0.005 || Lmin > cat.b + 0.005);
      if (grande) maiores.push({ nome: pw.nome, L: Lmax, b: Lmin });
      D.poli(cont, grande ? "MAD-PEND" : "MAD-PECA", true, ' data-painel-wall="' + esc(pw.id) + '"' + (grande ? ' data-pend="1"' : ""));
      var cxp = 0, cyp = 0; cont.forEach(function (p) { cxp += p[0]; cyp += p[1]; }); cxp /= cont.length; cyp /= cont.length;
      var lado = lx >= ly, hl2 = (Lmax * s2) * 0.32;
      if (Lmin * s2 > 3.2 && Lmax * s2 > 8) {
        var ax0 = lado ? [cxp - hl2, cyp] : [cxp, cyp - hl2], ax1 = lado ? [cxp + hl2, cyp] : [cxp, cyp + hl2];
        D.linha(ax0[0], ax0[1], ax1[0], ax1[1], "MAD-FINA"); D.seta(ax0[0], ax0[1], lado ? 1 : 0, lado ? 0 : 1, 1.4); D.seta(ax1[0], ax1[1], lado ? -1 : 0, lado ? 0 : -1, 1.4);
      }
      rotPW.push({ pw: pw, cont: cont, cx: cxp, cy: cyp, grande: grande });
    });
    rotPW.forEach(function (o) {
      var nm = o.pw.nome.replace(/^Painel Wall 40\s*/i, "").replace(/^[—-]\s*/, "") || String(o.pw.id);
      var bb = bboxQ(o.cont);
      rotuloPeca(D, o.cont, [bb[0], (bb[1] + bb[3]) / 2], [bb[2], (bb[1] + bb[3]) / 2], nm, T.marcaDensa, { dentro: false, cor: o.grande ? VERMELHO : null, raio: 14, attr: ' data-rotulo-pw="' + esc(o.pw.id) + '"' });
    });
    var yPag = yb + hP + 4 + H * s2 + 6;
    var notasPW = [];
    var pwr = r.painelWall;
    if (pwr) {
      notasPW.push("Produto: " + pwr.produto + (pwr.pagina ? " (ficha p. " + pwr.pagina + ")" : "") + "; apoios a " + br(pwr.vaoApoios_m, 3) + " m (barrotes).");
      if (pwr.impedeUso) notasPW.push({ t: "NÃO EXECUTAR: " + pwr.conclusao, cor: VERMELHO, attr: ' data-pend="painel-wall"' });
      if (pwr.criterio === "desempenho") {
        /* especificação de desempenho (RT 13/10/2026): a prancha diz a capacidade que o painel comprado tem de declarar */
        notasPW.push("Painel de 40 mm de qualquer fabricante, com carga admissível (de serviço) declarada pelo fabricante de no mínimo:");
        arr(pwr.requisitos).forEach(function (q) { notasPW.push("  zona " + q.zona + ": " + br(q.cargaServicoMin_kN_m2, 2) + " kN/m2 (" + q.cargaServicoMin_kgf_m2 + " kgf/m2) com apoios a " + br(q.vao_m, 2) + " m"); });
        notasPW.push("Exigir a ficha ou declaração do fabricante na compra (ver memorial).");
      } else arr(pwr.zonas).forEach(function (z) { notasPW.push({ t: "Zona " + z.zona + ": G + Q = " + br(z.total, 2) + " kN/m2 x ficha " + br(pwr.ficha && pwr.ficha.carga_kN_m2, 2) + " kN/m2" + (z.acimaFicha ? " - ACIMA DA FICHA" : ""), cor: z.acimaFicha ? VERMELHO : null }); });
      if (pwr.fabricanteConfirmado === false && pwr.obsFabricante) notasPW.push({ t: "Fabricante não confirmado: " + pwr.obsFabricante, cor: VERMELHO });
    }
    if (maiores.length) notasPW.push({ t: maiores.length + " contorno(s) da paginação maiores que a chapa " + br(cat.L, 2) + " x " + br(cat.b, 2) + " m (" + maiores.slice(0, 6).map(function (m) { return m.nome.replace(/^Painel Wall 40\s*/i, "") + " " + br(m.L, 2) + " x " + br(m.b, 2); }).join("; ") + (maiores.length > 6 ? "…" : "") + "): rever a paginação com o fabricante [PENDENTE].", cor: VERMELHO, attr: ' data-pend="paginacao"' });
    notasPW.push("Fixação no barrote: ligação L11 (folha 07).");
    var wPag = W * s2 + 8;
    D.textos(a.x + 4, yPag, notasPW, T.nota * 0.9, { wmax: Math.max(120, wPag - 4) });
    /* CORTE TÍPICO DO PISO EM CAMADAS POR ZONA */
    var xC = a.x + 4 + Math.max(wPag, 150) + 12, wC = a.x + a.w - xC;
    desenharCortesPiso(D, d, c, xC, yAbaixo, wC, a.y + a.h - yAbaixo - 2);
    return { escala: "INDICADA" };
  }

  function desenharCortesPiso(D, d, c, x, y, w, hDisp) {
    var T = D.E.T, cam = d.camadas, niveis = d.niveis;
    if (!cam || !cam.pacotes) { D.texto(x, y + 8, "Camadas do piso não informadas no resultado (acoes.camadasPiso) [PENDENTE].", T.nota, { cor: VERMELHO }); return; }
    var zonas = Object.keys(cam.pacotes);
    var zTopo = num(niveis.piso_acabado, 0), zFundo = num(niveis.topo_concreto, -0.62), nC0 = Math.max(1, Math.min(zonas.length, Math.floor(w / 185))), lin0 = (hDisp - 14) / Math.ceil(zonas.length / nC0);
    var eE = escolher(PADRAO_MAD.escalas.cortePiso, function (e) { return (zTopo - zFundo + 0.05) * 1000 / e + 36 <= lin0 - 4 && 0.34 * 1000 / e + 19 + 100 <= w / nC0; }), s = 1000 / eE;
    var hT = tituloVista(D, x, y, "CORTE TÍPICO DO PISO EM CAMADAS, POR ZONA", "ESC 1:" + eE + " - espessuras em cm; a soma das camadas = pacote entre o piso acabado e o topo do Painel Wall");
    var zPA = num(niveis.piso_acabado, 0), zPW = num(niveis.topo_painel, -0.08), zBR = num(niveis.topo_barrote, -0.12), zVP = num(niveis.topo_VP, -0.28), zPT = num(niveis.topo_pilarete, -0.58), zCC = num(niveis.topo_concreto, -0.62);
    var pacote = Math.round((zPA - zPW) * 1000) / 10;
    var nCol = Math.max(1, Math.min(zonas.length, Math.floor(w / 185))), nLin = Math.ceil(zonas.length / nCol), colW = w / nCol, linH = (hDisp - hT - 4) / nLin, larg = 0.34 * s;
    zonas.forEach(function (zk, i) {
      var cx0 = x + (i % nCol) * colW, yy = y + hT + 4 + Math.floor(i / nCol) * linH, nome = PADRAO_MAD.zonasPiso[zk] || zk.toUpperCase();
      var zinfo = (cam.zonas || {})[zk] || {};
      var ht = tituloVista(D, cx0, yy, nome, zinfo.area_m2 ? "área " + br(zinfo.area_m2, 2) + " m2" : null);
      var oy = yy + ht + 4, x0 = cx0 + 19, Y = function (z) { return oy + (zPA - z) * s; };
      var camadas = cam.pacotes[zk], somaE = 0, labels = [];
      /* pacote: camadas de cima para baixo */
      var zc = zPA;
      camadas.forEach(function (cmd) {
        var e = num(cmd[2], 0) / 100, y0 = Y(zc), y1 = Y(zc - e);
        D.linha(x0, y1, x0 + larg, y1, "MAD-PECA");
        if (/contrapiso|base armada/i.test(cmd[0] + " " + cmd[1])) D.hachura(x0, y0, larg, y1 - y0, 1.4, "MAD-HACHURA");
        labels.push({ y: (y0 + y1) / 2, t: (cmd[1] || cmd[0]) + " - " + br(num(cmd[2], 0), 1).replace(",0", "") + " cm", attr: ' data-camada="' + esc(zk + "|" + cmd[0] + "|" + num(cmd[2], 0)) + '"', e: num(cmd[2], 0) });
        somaE += num(cmd[2], 0); zc -= e;
      });
      D.ret(x0, Y(zPA), larg, Y(zPW) - Y(zPA), "MAD-PECA");
      var okPac = Math.abs(somaE - pacote) < 0.05;
      /* Painel Wall */
      var yP0 = Y(zPW), yP1 = Y(zBR);
      D.ret(x0, yP0, larg, yP1 - yP0, "MAD-CORTE"); D.hachura(x0, yP0, larg, yP1 - yP0, 0.9, "MAD-HACHURA");
      labels.push({ y: (yP0 + yP1) / 2, t: "Painel Wall 40 mm - " + br((zPW - zBR) * 100, 1).replace(",0", "") + " cm", attr: ' data-camada="' + esc(zk + "|painel|" + Math.round((zPW - zBR) * 1000) / 10) + '"' });
      /* barrote em seção (zona de cálculo → seção mais comum dos barrotes da zona) */
      var zc2 = PADRAO_MAD.zonaCalculo[zk], marcasZ = {};
      arr(c.r.piso && c.r.piso.pecas).forEach(function (p) { if (p.zona === zc2 && p.grupo === "PISO_BARROTE") marcasZ[p.marca] = 1; });
      var secB = d.secaoDe("PISO_BARROTE", function (p) { return marcasZ[p.marca]; }) || d.secaoDe("PISO_BARROTE");
      var bB = secB[0] / 100, hB = secB[1] / 100, xb = x0 + larg / 2 - bB * s / 2;
      var entalhe = 0; d.pecas.forEach(function (p) { if (p.grupo === "PISO_BARROTE" && marcasZ[p.marca] && p.secao && p.secao.join("x") === secB.join("x") && p.entalhes) entalhe = Math.max(entalhe, num(p.entalhes[0] && (p.entalhes[0].h_mm || p.entalhes[0].prof_mm), 0) / 1000); });
      if (!entalhe) d.pecas.forEach(function (p) { if (p.grupo === "PISO_BARROTE" && marcasZ[p.marca] && p.secao && p.secao.join("x") === secB.join("x") && p.rebaixo_apoio_cm) entalhe = Math.max(entalhe, num(p.rebaixo_apoio_cm, 0) / 100); });
      D.secaoMadeira(xb, Y(zBR), bB * s, hB * s, { attr: ' data-secao-barrote="' + secB.join("x") + '"' });
      labels.push({ y: Y(zBR) + hB * s / 2, t: "Barrote típico da zona " + secB.join("x") + " cm" + (entalhe ? " (entalhe " + br(entalhe * 100, 0) + " cm sobre a VP)" : "") });
      /* viga principal (vista longitudinal, fibra) */
      var secV = d.secaoDe("PISO_VIGA") || [12, 30], hV = secV[1] / 100, yV0 = Y(zVP);
      D.fibraMadeira(x0 - 2, yV0, larg + 4, hV * s, { attr: ' data-secao-vp="' + secV.join("x") + '"' });
      labels.push({ y: yV0 + hV * s / 2, t: "Viga principal (VP) " + secV.join("x") + " cm" });
      /* apoio no pilarete */
      var yPT = Y(zPT), yCC = Y(zCC);
      D.ret(x0 + larg / 2 - 0.2 * s / 2, yCC, 0.2 * s, 6, "MAD-CONTEXTO");
      var fix = txt(niveis.fixacao), fixT = fix.indexOf(":") >= 0 ? fix.slice(fix.indexOf(":") + 1).trim() : fix;
      if (yCC - yPT > 0.6) labels.push({ y: (yPT + yCC) / 2, t: "Apoio no pilarete: " + (fixT || "conforme a ligação L09") + " (mm)" });
      /* níveis */
      [[zPA, "piso acabado"], [zPW, null], [zBR, null], [zVP, null], [zCC, "topo do concreto"]].forEach(function (q) { D.linha(x0 - 6, Y(q[0]), x0 - 1, Y(q[0]), "MAD-FINA"); });
      var xn = x0 - 7;
      D.texto(xn, Y(zPA) - 0.6, niv(zPA), T.cota * 0.9, { al: "D", attr: ' data-nivel="pa"' });
      D.texto(xn, Y(zPW) + 2.6, niv(zPW), T.cota * 0.9, { al: "D" });
      D.texto(xn, Y(zBR) + 4.8, niv(zBR), T.cota * 0.9, { al: "D" });
      D.texto(xn, Y(zVP) + 2.6, niv(zVP), T.cota * 0.9, { al: "D" });
      D.texto(xn, Y(zCC) + 2.6, niv(zCC), T.cota * 0.9, { al: "D" });
      /* rótulos em leque à direita */
      var xl = x0 + larg + 6, hL = T.nota * 0.84, passo = hL * 1.55, yl = Math.min(labels[0].y, Y(zPA) + 1), ult = -1e9, wl = colW - (xl - cx0) - 4;
      labels.forEach(function (lb) {
        var ly = Math.max(lb.y, ult + passo), ls = quebrar(lb.t, hL, wl);
        D.linha(x0 + larg, lb.y, xl - 1, ly - 0.3 * hL, "MAD-FINA"); D.ponto(x0 + larg - 1.2, lb.y, 0.3);
        ls.forEach(function (s0, k) { D.texto(xl, ly + k * hL * 1.3, s0, hL, { cor: lb.cor, attr: k ? "" : lb.attr }); });
        ult = ly + (ls.length - 1) * hL * 1.3;
      });
      void yl;
      var yS = Math.max(Y(zCC) + 12, ult + passo + 2);
      D.texto(x0 - 17, yS, "Soma das camadas = " + br(somaE, 1) + " cm (pacote " + br(pacote, 1) + " cm)" + (okPac ? "" : " - NÃO FECHA"), T.nota * 0.84, { cor: okPac ? null : VERMELHO, attr: ' data-pacote="' + esc(zk + "|" + Math.round(somaE * 10) / 10 + "|" + pacote) + '"' });
    });
  }

  /* ================================================================ FOLHAS 03/04 — COBERTURAS */
  function folhaCobertura(c, qual) {
    var D = c.D, d = c.d, r = c.r, a = c.geo.area, T = D.E.T, titH = 16;
    var re = qual === "inferior" ? /^COB_INF_|^FORRO_/ : /^COB_SUP_/;
    var lista = d.pecas.filter(function (p) { return re.test(p.grupo); });
    var pilP = d.pecas.filter(function (p) { return p.grupo === "PILAR_PECA"; });
    if (!lista.length) { D.texto(a.x + 10, a.y + 20, "Fonte sem peças da cobertura " + qual + ".", T.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var ex = extensao(lista.concat(pilP), function (P) { return [P[0], P[1]]; }), W = ex.a1 - ex.a0 + 0.3, H = ex.b1 - ex.b0 + 0.3;
    ex.a0 -= 0.15; ex.b1 += 0.15;
    var hCorte = qual === "superior" ? 0.36 : 0.30;
    var eE = escolher(PADRAO_MAD.escalas.planta, function (e) { var s = 1000 / e; return W * s + 2 * OV + 6 <= a.w && H * s + 2 * OV + titH <= a.h * hCorte * 2.0; }), s = 1000 / eE;
    var ox = a.x + (a.w - W * s) / 2, oy = a.y + titH + OV;
    var zs = lista.map(function (p) { return Math.max(p.p0[2], p.p1[2]); }), zMax = Math.max.apply(null, zs), zMin = Math.min.apply(null, lista.map(function (p) { return Math.min(p.p0[2], p.p1[2]); }));
    tituloVista(D, a.x + 4, a.y + 2, qual === "inferior" ? "PLANTA DA ESTRUTURA DA COBERTURA INFERIOR E DO FORRO" : "PLANTA DA ESTRUTURA DA COBERTURA SUPERIOR", "ESC 1:" + eE + " - eixo das vigas de " + niv(zMin) + " a " + niv(zMax));
    var V = Vista(D, { s: s, ox: ox, oy: oy, a0: ex.a0, b1: ex.b1 });
    var lim = eixosPlanta(D, d, V, [ox, oy, ox + W * s, oy + H * s], { folga: 8 });
    /* pilares (cortados no plano da cobertura) */
    d.pilares.forEach(function (q) { q.pecas.forEach(function (p) { var g = V.peca({ p0: p.p0, p1: [p.p0[0], p.p0[1], p.p0[2] + 0.01], dl: p.dl, ext: [0.01, p.ext[1], p.ext[2]] }); D.secaoMadeira(bboxQ(g.casco)[0], bboxQ(g.casco)[1], bboxQ(g.casco)[2] - bboxQ(g.casco)[0], bboxQ(g.casco)[3] - bboxQ(g.casco)[1]); }); });
    var vigas = lista.filter(function (p) { return /VIGA/.test(p.grupo); });
    var itens = desenharPecas(D, d, V, vigas, function () { return "MAD-PRINCIPAL"; }).concat(desenharPecas(D, d, V, lista.filter(function (p) { return !/VIGA/.test(p.grupo); }), function (p) { return /FORRO/.test(p.grupo) ? "MAD-PECA" : "MAD-PECA"; }));
    cotasEixos(D, d, V, lim.y0 - 2, lim.x0 - 2);
    /* inclinação da cobertura superior */
    var notas = [];
    if (qual === "superior") {
      var incl = vigas.filter(function (p) { return Math.abs(p.p1[2] - p.p0[2]) > 0.005; });
      if (incl.length) {
        var p0 = incl[0], L = hip(p0.p1[0] - p0.p0[0], p0.p1[1] - p0.p0[1]), i = Math.abs(p0.p1[2] - p0.p0[2]) / L, alto = p0.p1[2] > p0.p0[2] ? p0.p1 : p0.p0, baixo = p0.p1[2] > p0.p0[2] ? p0.p0 : p0.p1;
        var A = V.P(alto[0], alto[1]), B = V.P(baixo[0], baixo[1]), lb = D.procura([(A[0] + B[0]) / 2 + 22, (A[1] + B[1]) / 2], 26, 8, [lim.x0, lim.y0, lim.x1, lim.y1]);
        if (lb) { var du = (B[1] - A[1]) >= 0 ? 1 : -1; D.linha(lb[0] - 9, lb[1] - du * 3, lb[0] - 9, lb[1] + du * 3, "MAD-FINA"); D.seta(lb[0] - 9, lb[1] + du * 3, 0, -du, 1.6); D.texto(lb[0] - 6.5, lb[1], "i = " + br(i * 100, 1) + " %", T.cota, { meio: true, attr: ' data-inclinacao="' + br(i * 100, 1) + '"' }); }
        notas.push("Vigas da cobertura superior inclinadas: i = " + br(i * 100, 1) + " % (eixo de " + niv(baixo[2]) + " a " + niv(alto[2]) + "); seta = sentido da descida.");
      }
    }
    var falhas = rotular(D, itens, T.marcaDensa, { raio: 22 });
    if (falhas.length) c.avisos.push("Folha " + (qual === "inferior" ? "03" : "04") + ": " + falhas.length + " marca(s) sem lugar livre: " + falhas.slice(0, 8).join(", "));
    var yb = lim.y1 + 8, xb = a.x + 4;
    /* reprovados */
    var rep = arr(r.reprovacoes).filter(function (x) { return lista.some(function (p) { return d.reprov[p.id] && d.reprov[p.id].grupo === x.grupo; }); });
    var linhasRep = [];
    rep.forEach(function (x) {
      var marcas = {}; lista.forEach(function (p) { if (d.reprov[p.id] && d.reprov[p.id].grupo === x.grupo && p.marca) marcas[p.marca] = 1; });
      linhasRep.push({ t: "NÃO ATENDE (NÃO EXECUTAR): " + x.funcao + " - " + x.membros.length + " membro(s), eta até " + br(x.etaMax, 2) + "; peças em vermelho: " + Object.keys(marcas).sort(natural).join(", ") + ".", cor: VERMELHO, attr: ' data-pend="reprovacao"' });
      if (x.mecanismo) linhasRep.push({ t: "Mecanismo: " + x.mecanismo, cor: VERMELHO });
      arr(x.alternativas).forEach(function (al, k) { linhasRep.push({ t: "Alternativa " + (k + 1) + " (decisão do RT): " + al, cor: VERMELHO }); });
    });
    /* quadro das peças */
    var grupos = {};
    lista.forEach(function (p) { var k = p.marca + "|" + secTxt(p.secao) + "|" + cm(p.comp); var g = grupos[k] = grupos[k] || { marca: p.marca, sec: secTxt(p.secao), L: p.comp, n: 0, esp: p.especie, grupo: p.grupo, red: false }; g.n++; if (d.reprov[p.id]) g.red = true; });
    var linQ = Object.keys(grupos).map(function (k) { return grupos[k]; }).sort(function (p, q) { return natural(p.marca, q.marca); }).map(function (g) {
      var cor = g.red ? VERMELHO : null;
      return [{ t: notacaoPeca(g.marca, g.esp, g.sec, g.L), cor: cor, al: "E", attr: ' data-notacao="' + esc(g.marca) + '"' }, { t: txt((d.grupoDef[g.grupo] || {}).descricao || g.grupo), cor: cor }, { t: String(g.n), cor: cor }];
    });
    var colsQ = [{ t: ["PEÇA", "marca - espécie b x h x comprimento (cm)"], al: "E" }, { t: "FUNÇÃO", al: "E" }, { t: "QUANT." }];
    var hq = tituloVista(D, xb, yb, "PEÇAS DA COBERTURA " + qual.toUpperCase() + (qual === "inferior" ? " E DO FORRO" : ""), null) + 1;
    var hDisp = a.y + a.h - 2 - yb - hq, nCab = Math.max(6, Math.floor((hDisp - 12) / 4.6)), parte = [], tabs = [];
    for (var i0 = 0; i0 < linQ.length; i0 += nCab) parte.push(linQ.slice(i0, i0 + nCab));
    var xt = xb;
    parte.forEach(function (pt) { var tb = D.tabela(xt, yb + hq, colsQ, pt, {}); tabs.push(tb); xt += tb.w + 8; });
    /* corte transversal típico na superior (pilar, vigas inferior e superior, forro) */
    var xn = xt + 4, wn = a.x + a.w - xn - 2;
    if (qual === "superior") {
      var yv = yb;
      var hv = tituloVista(D, xn, yv, "VIDRO DA COBERTURA", null) + 1;
      var linV = [{ t: "Vidro laminado sobre as vigas da cobertura superior: composição, espessura, paginação, apoio mínimo, inclinação mínima e fixação NÃO CALCULADOS - a NBR 7199:2025 não tem texto na biblioteca da RA [PENDENTE].", cor: VERMELHO, attr: ' data-pend="vidro"' },
        { t: "Flecha das vigas sob o vidro não verificada pela análise global (limite depende da NBR 7199:2025) [PENDENTE].", cor: VERMELHO }].concat(notas);
      var hvn = D.textos(xn, yv + hv, linV, T.nota * 0.92, { wmax: Math.max(60, wn) });
      var yct = yv + hv + hvn + 8;
      desenharCorteCobertura(D, d, c, xn, yct, wn, a.y + a.h - yct - 2);
    } else {
      var lN = linhasRep.concat(["Forro (barrotes BF) apoiado no nível " + niv(Math.min.apply(null, lista.filter(function (p) { return /FORRO/.test(p.grupo); }).map(function (p) { return p.p0[2]; }).concat([zMax]))) + "; vigas e bloqueadores da cobertura no eixo " + niv(zMax) + ".",
        "Ligações: vigas no pilar L03; peça de topo na lateral da viga L04 (longarina: L08); folha 07."]);
      D.textos(xn, yb, lN, T.nota * 0.92, { wmax: Math.max(60, wn) });
    }
    return { escala: "INDICADA" };
  }
  function desenharCorteCobertura(D, d, c, x, y, w, hDisp) {
    var T = D.E.T, q = d.pilares[0]; if (!q || hDisp < 40) return;
    var sup = d.pecas.filter(function (p) { return p.grupo === "COB_SUP_VIGA"; }), inf = d.pecas.filter(function (p) { return p.grupo === "COB_INF_VIGA"; });
    /* o corte passa num eixo de pilares: a viga superior transversal mais perto de um eixo e a inferior no mesmo alinhamento */
    var trans = sup.filter(function (p) { return Math.abs(p.p0[1] - p.p1[1]) > 1; }), vs = null, dmin = 1e9;
    trans.forEach(function (p) { d.eixosX.forEach(function (e) { var dd = Math.abs(p.p0[0] - e.v); if (dd < dmin) { dmin = dd; vs = p; } }); });
    if (!vs) vs = trans[0];
    if (!vs) return;
    var vi = inf.filter(function (p) { return Math.abs(p.p0[1] - p.p1[1]) > 1 && Math.abs(p.p0[0] - vs.p0[0]) < 0.2; })[0] || null;
    var forro = d.pecas.filter(function (p) { return /^FORRO_/.test(p.grupo) && Math.abs(p.p0[1] - p.p1[1]) > 0.3 && Math.abs(p.p0[0] - vs.p0[0]) < 0.2; });
    var y0 = Math.min(vs.p0[1], vs.p1[1]) - 0.2, y1 = Math.max(vs.p0[1], vs.p1[1]) + 0.2, zA = Math.max(vs.p0[2], vs.p1[2]) + 0.25, zB = (vi ? vi.p0[2] : vs.p0[2]) - 0.6;
    var eE = escolher([20, 25, 50], function (e) { return (y1 - y0) * 1000 / e + 30 <= w && (zA - zB) * 1000 / e + 24 <= hDisp; }), s = 1000 / eE;
    var ht = tituloVista(D, x, y, "CORTE TRANSVERSAL TÍPICO DAS COBERTURAS (x = " + br(vs.p0[0], 2) + " m)", "ESC 1:" + eE);
    var V = Vista(D, { s: s, ox: x + 20, oy: y + ht + 6, e1: [0, 1, 0], e2: [0, 0, 1], a0: y0, b1: zA });
    var itens = [];
    /* pilares no alinhamento (em vista, atrás das vigas): contorno do conjunto */
    d.pilares.filter(function (pp) { return Math.abs(pp.x - vs.p0[0]) < 0.35; }).forEach(function (pp) { var A = V.P(pp.y - pp.by / 2, Math.min(zA - 0.02, pp.z1)), B = V.P(pp.y + pp.by / 2, zB); D.ret(A[0], A[1], B[0] - A[0], B[1] - A[1], "MAD-PECA", ' data-corte-pilar="' + pp.nome + '"'); D.texto((A[0] + B[0]) / 2, B[1] + 4.2, pp.nome, T.marcaDensa, { al: "C" }); });
    [vs, vi].concat(forro).filter(Boolean).forEach(function (p) { var g = V.peca(p); D.poli(g.casco, /FORRO/.test(p.grupo) ? "MAD-PECA" : "MAD-PRINCIPAL", true, ' data-corte-peca="' + esc(p.marca || "") + '"'); itens.push({ p: p, g: g, red: !!d.reprov[p.id] }); });
    var zs = [Math.min(vs.p0[2], vs.p1[2]), Math.max(vs.p0[2], vs.p1[2])].concat(vi ? [vi.p0[2]] : []).concat(forro.length ? [forro[0].p0[2]] : []);
    var yN = []; zs.forEach(function (z) { var P = V.P(y1, z); var yy = P[1]; yN.forEach(function (q) { if (Math.abs(q - yy) < 5) yy = q + 5; }); yN.push(yy); D.linha(P[0] - 2, P[1], P[0] + 3, yy, "MAD-FINA"); D.nivel(P[0] + 4, yy, niv(z), 1); });
    rotular(D, itens, T.marcaDensa, { raio: 18 });
    var Pa = V.P(y0 + 0.2, zB), Pb = V.P(y1 - 0.2, zB);
    D.cota(Pa[0], Pa[1] + 6, Pb[0], Pb[1] + 6, -2, cm(y1 - y0 - 0.4), { attrs: [' data-cota="vao-transversal"'] });
  }

  /* ================================================================ FOLHA 05 — PAINÉIS DE WOOD FRAME */
  function folhaPaineis(c) {
    var D = c.D, d = c.d, r = c.r, a = c.geo.area, T = D.E.T;
    var ps = d.paineis; if (!ps.length) { D.texto(a.x + 10, a.y + 20, "Fonte sem painéis de wood frame.", T.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var prem = (r.paredes && r.paredes.premissas) || {}, pc = r.paredesPremissas && r.paredesPremissas.catalogo, pinfo = (r.paredes && r.paredes.paineis) || {};
    var chapaL = pc ? num(pc.largura_m, 1.2) : 1.2, chapaH = pc ? num(pc.altura_m, 2.4) : 2.4;
    var nCol = 4, gapX = 16, hTxt = 27, hNotas = 20, nLin = Math.ceil(ps.length / nCol);
    function fundo(p) { return Math.max(0, -Math.min.apply(null, [0].concat(p.ferr.map(function (f) { return Math.min(f.p0[2], f.p1[2]); })))); }
    function alturasLinhas(s) { var hs = []; for (var l = 0; l < nLin; l++) { var mx = 0; ps.slice(l * nCol, l * nCol + nCol).forEach(function (p) { mx = Math.max(mx, (p.z1 - p.z0) * s + Math.max(8, fundo(p) * s + 4)); }); hs.push(mx + 6 + hTxt); } return hs; }
    var eE = escolher([20, 25, 30, 50], function (e) {
      var s = 1000 / e, maxW = Math.max.apply(null, ps.map(function (p) { return (p.s1 - p.s0) * s; }));
      return nCol * (maxW + 22) + (nCol - 1) * gapX <= a.w - 6 && alturasLinhas(s).reduce(function (t, v) { return t + v; }, 0) + hNotas <= a.h - 4;
    }), s = 1000 / eE;
    var celW = (a.w - 6) / nCol, hLin = alturasLinhas(s), yLin = [a.y + 2]; hLin.forEach(function (h, l) { yLin.push(yLin[l] + h); });
    ps.forEach(function (q, i) {
      var col = i % nCol, lin = Math.floor(i / nCol), x0 = a.x + 4 + col * celW + 14, yTop = yLin[lin];
      var maxH = Math.max.apply(null, ps.slice(lin * nCol, lin * nCol + nCol).map(function (p) { return (p.z1 - p.z0) * s; }));
      var oy = yTop + 6 + maxH, V = Vista(D, { s: s, ox: x0, oy: oy, e1: q.u, e2: [0, 0, 1], a0: q.s0, b1: 0 });
      var info = pinfo[q.num] || null, ref = prem.reforco && prem.reforco[q.num];
      /* peças (sem a chapa): montantes, guias, bloqueadores, vergas, travessas */
      var lista = q.pecas.filter(function (p) { return p.grupo !== "WF_CHAPA"; });
      var itens = desenharPecas(D, d, V, lista, function (p) { return /GUIA_SUP/.test(p.grupo) && p.secao && p.secao[1] >= 20 ? "MAD-PRINCIPAL" : "MAD-PECA"; });
      /* ferragens (hold-downs) */
      q.ferr.forEach(function (p) { var g = V.peca(p); D.poli(g.casco, "MAD-FERRAGEM", true, ' data-peca="' + esc(p.id) + '" data-ferragem="1"'); });
      /* chapas do fechamento: a fonte traz o painel da chapa; o desenho mostra a paginação da chapa da premissa (juntas tracejadas) */
      var chs = q.pecas.filter(function (p) { return p.grupo === "WF_CHAPA"; });
      chs.concat(q.chapasPlano || []).forEach(function (p) { D.add('<g data-peca="' + esc(p.id) + '" data-chapa="1"></g>'); });
      var sA = q.s0 + 0.06, sB = q.s1 - 0.06, zt = q.z1 - 0.1;
      for (var sj = sA + chapaL; sj < sB - 0.05; sj += chapaL) { var J0 = V.P(sj, 0.02), J1 = V.P(sj, zt); D.linha(J0[0], J0[1], J1[0], J1[1], "MAD-OCULTA", ' data-junta-chapa="1"'); }
      if (zt > chapaH + 0.02) { var H0 = V.P(sA, chapaH), H1 = V.P(sB, chapaH); D.linha(H0[0], H0[1], H1[0], H1[1], "MAD-OCULTA", ' data-junta-chapa="1"'); }
      /* cotas: comprimento e altura */
      var Pa = V.P(sA, 0), Pb = V.P(sB, 0), Pt = V.P(sA, zt);
      D.cota(Pa[0], Pa[1], Pb[0], Pb[1], -6, cm(sB - sA), { semExt: false, attrs: [' data-cota="painel-L"'] });
      D.cota(Pa[0], Pa[1], Pt[0], Pt[1], 6, cm(zt), { attrs: [' data-cota="painel-H"'] });
      var falhas = rotular(D, itens, T.marcaDensa, { raio: 12, raio2: 24, umaPorMarca: true, area: [x0 - 14, yTop, x0 + celW - 16, oy + 8] });
      void falhas;
      /* título e dados do painel */
      var yt = oy + Math.max(8, fundo(q) * s + 4);
      var ht = tituloVista(D, x0 - 12, yt, "PAINEL " + q.nome, "ESC 1:" + eE);
      var lin2 = [];
      if (info) lin2.push({ t: "FvRd = " + br(info.FvRd_kN, 2) + " kN; K = " + br(info.K_kN_m, 1) + " kN/m" + (info.reforco ? " (reforço " + info.reforco.faces + " faces: " + br(info.reforco.FvRd_kN, 2) + " kN)" : ""), attr: ' data-painel-fvrd="' + q.num + '"' });
      lin2.push("Chapa " + (pc ? pc.produto : "do fechamento") + "; pregos " + br(arr(ref && ref[2] ? ref[2] : prem.prego_mm)[0] || prem.prego_mm && prem.prego_mm[0], 1) + "x" + br(arr(ref && ref[2] ? ref[2] : prem.prego_mm)[1] || prem.prego_mm && prem.prego_mm[1], 1) + " a " + cm(ref ? num(ref.s_m, ref[1]) || num(ref[1], 0.16) : num(prem.s_pregos_m, 0.16)) + " cm na borda" + (ref ? " (" + (ref.faces || ref[0]) + " faces)" : ""));
      var nHD = q.ferr.filter(function (p) { return /^Chapa do hold-down/.test(p.nome); }).length;
      if (nHD) lin2.push("Hold-downs: " + nHD + " chapa(s) - L05 (folha 07)");
      D.textos(x0 - 12, yt + ht, lin2, T.nota * 0.84, { wmax: celW - 6 });
    });
    /* notas no pé */
    var yN = a.y + a.h - hNotas;
    var notas = [{ t: "Solicitação de cálculo dos painéis e dos hold-downs não calculada: os painéis trazem a resistência (FvRd) e a rigidez, sem eta [PENDENTE].", cor: VERMELHO, attr: ' data-pend="paineis"' }];
    if (pc && pc.decisaoRT) notas.push("Chapa de contraventamento: " + pc.produto + " - " + pc.decisaoRT.replace(/^Decisão do RT \(([^)]*)\): .*$/, "decisão do RT de $1") + " (no lugar do OSB da fonte R03).");
    else if (pc) notas.push({ t: "Confirmar o " + pc.produto + " como chapa de contraventamento (premissa pelo orçamento; a fonte R03 traz OSB) [PENDENTE].", cor: VERMELHO });
    notas.push("Juntas tracejadas = paginação da chapa " + br(chapaL, 2) + " x " + br(chapaH, 2) + " m a partir da extremidade esquerda do painel; montantes a no máximo " + (pc ? pc.montantesMaxCm : 60) + " cm; pregação L07.");
    D.textos(a.x + 4, yN, notas, T.nota * 0.88, { wmax: a.w - 8 });
    return { escala: "1:" + eE };
  }

  /* ================================================================ FOLHA 06 — PILARES COMPOSTOS */
  function folhaPilares(c) {
    var D = c.D, d = c.d, r = c.r, a = c.geo.area, T = D.E.T;
    if (!d.pilares.length) { D.texto(a.x + 10, a.y + 20, "Fonte sem pilares compostos.", T.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var Hm = Math.max.apply(null, d.pilares.map(function (q) { return q.z1 - q.z0; })), nP = d.pilares.length;
    var eE = escolher([20, 25, 50], function (e) { return Hm * 1000 / e + 40 <= a.h * 0.5 && nP * 40 <= a.w - 40; }), s = 1000 / eE;
    var wCel = Math.min(58, (a.w - 40) / nP), yTop = a.y + 2;
    var ht = tituloVista(D, a.x + 4, yTop, "ELEVAÇÃO DOS PILARES COMPOSTOS 4 x (" + secTxt(d.pilares[0].pecas[0].secao) + ") COM OS BLOQUEADORES", "ESC 1:" + eE + " - cotas dos bloqueadores (eixo) a partir do pé do pilar, em cm");
    var z0 = Math.min.apply(null, d.pilares.map(function (q) { return q.z0; })), z1 = Math.max.apply(null, d.pilares.map(function (q) { return q.z1; }));
    var oy = yTop + ht + 12 + z1 * s, x0 = a.x + 4 + 34 + (a.w - 40 - nP * wCel) / 2;
    d.pilares.forEach(function (q, i) {
      var xc = x0 + i * wCel + wCel / 2, V = Vista(D, { s: s, ox: xc, oy: oy, e1: [1, 0, 0], e2: [0, 0, 1], a0: q.x, b1: 0 });
      /* as duas peças da frente (as de trás ficam escondidas) + os bloqueadores em vista */
      var xs = {}; q.pecas.forEach(function (p) { var k = Math.round(p.p0[0] * 1000); if (!xs[k]) { xs[k] = p; var g = V.peca(p); D.poli(g.casco, d.reprov[p.id] ? "MAD-PEND" : "MAD-PECA", true, ' data-peca="' + esc(p.id) + '"'); } else D.add('<g data-peca="' + esc(p.id) + '"></g>'); });
      var itB = q.bloq.map(function (b) { var g = V.peca(b); D.poli(g.casco, "MAD-PRINCIPAL", true, ' data-peca="' + esc(b.id) + '"'); return { p: b, g: g, red: false }; });
      q.itensBloq = itB;
      var Pp = V.P(q.x - q.bx / 2, q.z0), cadeia = [[Pp[0], Pp[1]]], vals = [], zAnt = q.z0;
      q.bloq.forEach(function (b) { var zc = (b.p0[2] + b.p1[2]) / 2, P = V.P(q.x - q.bx / 2, zc); cadeia.push([P[0], P[1]]); vals.push(cm(zc - zAnt)); zAnt = zc; });
      var Pt = V.P(q.x - q.bx / 2, q.z1); cadeia.push([Pt[0], Pt[1]]); vals.push(cm(q.z1 - zAnt));
      D.cadeia(cadeia, 6, vals, { attrs: vals.map(function () { return ' data-cota="bloq-' + q.nome + '"'; }) });
      var Pb = V.P(q.x + q.bx / 2, q.z0), Pc = V.P(q.x + q.bx / 2, q.z1);
      D.cota(Pb[0], Pb[1], Pc[0], Pc[1], -5, cm(q.z1 - q.z0), { attrs: [' data-cota="pilar-L-' + q.nome + '"'] });
      D.texto(xc, oy - z1 * s - 5, q.nome, T.pilar, { al: "C", attr: ' data-pilar="' + q.nome + '"' });
      D.texto(xc, Pp[1] + 4.5 + T.marcaDensa, "eixo " + q.eixo, T.marcaDensa, { al: "C" });
      /* marcas das 4 peças do pilar, embaixo (duas por linha) */
      var mk = q.pecas.map(function (p) { return p.marca; }).filter(Boolean), vist = {};
      mk.filter(function (m) { if (vist[m]) return false; vist[m] = 1; return true; }).forEach(function (m, k) { D.texto(xc + (k % 2 ? 1 : -1) * 0.8, Pp[1] + 9.5 + T.marcaDensa + Math.floor(k / 2) * T.marcaDensa * 1.5, m, T.marcaDensa, { al: k % 2 ? "E" : "D", attr: ' data-rotulo="' + esc(m) + '"' }); });
    });
    d.pilares.forEach(function (q) { rotular(D, q.itensBloq || [], T.marcaDensa, { raio: 16, umaPorMarca: true }); });
    var xl = a.x + 6;
    [z0, 0, z1].forEach(function (z) { var y = oy - z * s; D.linha(xl + 17, y, xl + 23, y, "MAD-FINA"); D.texto(xl + 16, y + 1, niv(z), T.cota * 0.9, { al: "D" }); });
    var yB = oy - z0 * s + 28;
    /* QUADRO DOS PILARES */
    var vPorPilar = {}; arr(r.verificacoes).forEach(function (v) { if (v.pilar) vPorPilar[v.pilar] = v; });
    var cols = [{ t: "PILAR" }, { t: "EIXO" }, { t: "PEÇAS" }, { t: "BLOQUEADORES" }, { t: ["COMPR.", "(cm)"] }, { t: "ESPÉCIE" }, { t: "beta" }, { t: ["L0", "(cm)"] }, { t: "eta" }, { t: "GOVERNA" }, { t: "SITUAÇÃO" }];
    var lin = d.pilares.map(function (q) {
      var v = vPorPilar[q.nome], cor = v && !v.ok ? VERMELHO : null, mk = q.pecas.map(function (p) { return p.marca; }).filter(Boolean), mb = q.bloq.map(function (p) { return p.marca; }).filter(Boolean);
      return [{ t: q.nome, attr: ' data-pilar-linha="' + q.nome + '"' }, q.eixo, mk.length + " (" + mk[0] + (mk.length > 1 ? " a " + mk[mk.length - 1] : "") + ")", mb.length + " (" + (mb.filter(function (m, k) { return mb.indexOf(m) === k; }).join(", ") || "-") + ")", cm(q.z1 - q.z0), q.pecas[0].especie ? especieCurta(q.pecas[0].especie) : "-",
        v ? br(v.beta, 2) : "-", v && v.L0 ? cm(v.L0) : "-", { t: v ? br(v.eta, 2) : "-", cor: cor }, v ? v.governa : "-", { t: v ? (v.ok ? "ATENDE" : "NÃO ATENDE") : "SEM VERIFICAÇÃO", cor: v && v.ok ? null : VERMELHO }];
    });
    var hq = tituloVista(D, a.x + 4, yB, "QUADRO DOS PILARES COMPOSTOS", "flexocompressão do cálculo (NBR 7190-1:2022); L0 = beta x L") + 1;
    var tq = D.tabela(a.x + 4, yB + hq, cols, lin, {});
    var be = r.analise && r.analise.estabilidade;
    if (be && be.alphaCrMin != null) D.textos(a.x + 4, yB + hq + tq.h + 3, ["Estabilidade global (autovalor): alfa_cr = " + br(be.alphaCrMin, 1) + (be.combinacaoCritica ? " em " + be.combinacaoCritica : "") + "; beta de projeto = máx(1,0; beta do autovalor); L = altura total do pilar (pé ao topo)."], T.nota * 0.86, { wmax: tq.w });
    /* SEÇÃO NO BLOQUEADOR (1:5) */
    var xS = a.x + 4 + tq.w + 16, q1 = d.pilares[0], sec = q1.pecas[0].secao || [7, 7], b0 = q1.bloq[0], eS = 5, sS = 1000 / eS;
    var hs = tituloVista(D, xS, yB, "SEÇÃO NO BLOQUEADOR (" + q1.nome + ")", "ESC 1:" + eS);
    var cx = xS + 14 + q1.bx * sS / 2, cy = yB + hs + 10 + q1.by * sS / 2, w3 = q1.bx - 2 * sec[0] / 100;
    function P(u, v) { return [cx + u * sS, cy - v * sS]; }
    if (b0) {
      var h2 = q1.bx / 2, i2 = w3 / 2;
      D.poli([P(-i2, -h2), P(i2, -h2), P(i2, -i2), P(h2, -i2), P(h2, i2), P(i2, i2), P(i2, h2), P(-i2, h2), P(-i2, i2), P(-h2, i2), P(-h2, -i2), P(-i2, -i2)], "MAD-PRINCIPAL", true, ' data-bloq-secao="1"');
      [-1, 1].forEach(function (k) { var A = P(-h2 - 0.015, k * i2 * 0.5), B = P(h2 + 0.015, k * i2 * 0.5); D.linha(A[0], A[1], B[0], B[1], "MAD-FERRAGEM"); var C = P(k * i2 * 0.5, -h2 - 0.015), E2 = P(k * i2 * 0.5, h2 + 0.015); D.linha(C[0], C[1], E2[0], E2[1], "MAD-FERRAGEM"); });
    }
    q1.pecas.forEach(function (p) { var X = cx + (p.p0[0] - q1.x) * sS - sec[0] / 200 * sS, Y = cy - (p.p0[1] - q1.y) * sS - sec[1] / 200 * sS; D.secaoMadeira(X, Y, sec[0] / 100 * sS, sec[1] / 100 * sS); });
    D.cota(cx - q1.bx * sS / 2, cy + q1.by * sS / 2, cx + q1.bx * sS / 2, cy + q1.by * sS / 2, -6, cm1(q1.bx), {});
    var l2 = (d.lig.L02 || [])[0], xT = cx + q1.bx * sS / 2 + 8, hN0 = T.nota * 0.84;
    if (b0) D.chamada(cx + w3 * sS * 0.3, cy - w3 * sS * 0.1, xT + 4, cy - q1.by * sS / 2 + 2, ["bloqueador em cruz " + secTxt(b0.secao) + " x " + cm(b0.ext[0]) + " cm"], { h: hN0 });
    D.chamada(cx + q1.bx * sS / 2 - 3, cy + q1.by * sS / 2 - 3, xT + 4, cy + q1.by * sS / 2 - 8, ["peça " + secTxt(sec) + " cm (4 por pilar)"], { h: hN0 });
    if (l2) D.chamada(cx + q1.bx * sS / 2 + 1.2, cy - w3 * sS * 0.25, xT + 4, cy + 3, ["L02: barras M10 (2 por braço)"], { h: hN0 });
    if (l2) D.textos(xS, cy + q1.by * sS / 2 + 12, [{ t: "L02: " + l2.descricao + (l2.eta != null ? " - eta = " + br(l2.eta, 2) + " (" + l2.governante + ")." : "."), attr: ' data-lig-l02="1"' }], hN0, { wmax: 112 });
    /* PÉ DO PILAR L01 (1:5) */
    var xPe = xS + 128, l1 = (d.lig.L01 || [])[0], nv = d.niveis, eP = 5, sP = 1000 / eP, wPe = a.x + a.w - xPe - 2;
    var hp = tituloVista(D, xPe, yB, "PÉ DO PILAR (L01)", "ESC 1:" + eP);
    var zCC = num(nv.topo_concreto, -0.62), zPT = num(nv.topo_pilarete, q1.z0), xp = xPe + 32, Hpe = 0.36, yp0 = yB + hp + 8;
    function Yp(z) { return yp0 + (zPT + Hpe - z) * sP; }
    var bp = sec[0] / 100 * sP;
    D.fibraMadeira(xp - q1.bx * sP / 2, Yp(zPT + Hpe), bp, Hpe * sP, { vertical: true });
    D.fibraMadeira(xp + q1.bx * sP / 2 - bp, Yp(zPT + Hpe), bp, Hpe * sP, { vertical: true });
    var bBase = q1.bloq.filter(function (b) { return Math.min(b.p0[2], b.p1[2]) < zPT + 0.1; })[0];
    if (bBase) { var bz0 = Math.min(bBase.p0[2], bBase.p1[2]), bz1 = Math.min(zPT + Hpe, Math.max(bBase.p0[2], bBase.p1[2])); D.ret(xp - (q1.bx / 2 - sec[0] / 100) * sP, Yp(bz1), (q1.bx - 2 * sec[0] / 100) * sP, (bz1 - bz0) * sP, "MAD-PRINCIPAL", ' data-bloq-base="1"'); }
    var hc = 0.09;
    D.ret(xp - 0.2 * sP, Yp(zCC), 0.4 * sP, hc * sP, "MAD-CONTEXTO"); D.hachura(xp - 0.2 * sP, Yp(zCC), 0.4 * sP, hc * sP, 2.2, "MAD-CONTEXTO");
    D.ret(xp - q1.bx * sP / 2 - 1.5, Yp(zPT), q1.bx * sP + 3, (zPT - zCC) * sP, "MAD-FINA", ' data-apoio-l01="1"');
    var m = l1 ? /x\s*(\d+)/.exec(l1.descricao) : null, emb = l1 ? /(\d+)\s*mm no pilarete/.exec(l1.descricao) : null, Lb = m ? +m[1] / 1000 : null, Le = emb ? +emb[1] / 1000 : null;
    if (Lb && Le) D.linha(xp, Yp(zCC - Math.min(Le, hc)), xp, Yp(Math.min(zPT + Hpe, zCC - Le + Lb)), "MAD-FERRAGEM", ' data-barra-l01="1"');
    D.nivel(xp + q1.bx * sP / 2 + 3, Yp(zPT), niv(zPT), 1); D.nivel(xp + q1.bx * sP / 2 + 3, Yp(zCC) + 0.01, niv(zCC), 1);
    var xT2 = xp + q1.bx * sP / 2 + 30, hN = T.nota * 0.84;
    D.chamada(xp - q1.bx * sP / 2 + bp / 2, Yp(zPT + Hpe * 0.75), xT2, Yp(zPT + Hpe * 0.92), ["peça do pilar " + secTxt(sec)], { h: hN });
    if (bBase) D.chamada(xp + 1.5, Yp(zPT + 0.12), xT2, Yp(zPT + Hpe * 0.55), ["bloqueador de base " + (bBase.marca || "")], { h: hN });
    var fix = txt(nv.fixacao), fixT = fix.indexOf(":") >= 0 ? fix.slice(fix.indexOf(":") + 1).trim() : fix;
    if (fixT) D.chamada(xp + q1.bx * sP / 2 + 1.5, Yp((zPT + zCC) / 2), xp + 0.2 * sP + 6, Yp(zCC) + hc * sP + 7, [fixT + " (mm)"], { h: hN, dir: 1 });
    if (Lb && Le) D.chamada(xp, Yp(zCC - 0.05), xT2, Yp(zCC) + 8, ["barra M16 - " + cm(Le) + " cm no pilarete"], { h: hN });
    var tPe = [l1 ? { t: "L01: " + l1.descricao + ".", attr: ' data-lig-l01="1"' } : { t: "L01 não informada no resultado [PENDENTE].", cor: VERMELHO }];
    if (l1 && l1.eta != null) tPe.push("Verificada: eta = " + br(l1.eta, 3) + " (" + l1.governante + ").");
    D.textos(xPe, Yp(zCC) + hc * sP + 22, tPe, hN, { wmax: wPe - 2 });
    return { escala: "INDICADA" };
  }

  /* ================================================================ FOLHA 07 — LIGAÇÕES */
  /* esquema de cada ligação com as SEÇÕES REAIS das peças da fonte (m); retângulos { x, y, w, h, tipo: "corte"|"fibra"|"vista"|"concreto"|"chapa" } e
     fixadores { x1, y1, x2, y2 } no plano do esquema (y para cima) */
  function esquemaLig(cod, d) {
    function sec(g, f) { var s = d.secaoDe(g, f); return s ? [s[0] / 100, s[1] / 100] : null; }
    var pil = sec("PILAR_PECA") || [0.07, 0.07], vi = sec("COB_INF_VIGA") || [0.07, 0.2], vp = sec("PISO_VIGA") || [0.12, 0.3], br0 = sec("PISO_BARROTE") || [0.12, 0.16];
    var ts = sec("PISO_TESTEIRA") || [0.05, 0.16], bq = sec("PISO_BLOQ") || [0.1, 0.16], gi = sec("WF_GUIA_INF") || [0.05, 0.1], dm = sec("PISO_DORMENTE") || [0.1, 0.08], mt = sec("WF_MONTANTE") || [0.05, 0.1];
    var R = [], F = [], vista = "corte";
    function rr(x, y, w, h, tipo, rot) { R.push({ x: x, y: y, w: w, h: h, tipo: tipo, rot: rot || "" }); }
    function ff(x1, y1, x2, y2) { F.push({ x1: x1, y1: y1, x2: x2, y2: y2 }); }
    var p = pil[0];
    switch (cod) {
      case "L01": rr(-0.2, -0.25, 0.4, 0.25, "concreto", "pilarete"); rr(-0.12, 0, 0.24, 0.03, "vista", "graute"); rr(-0.12, 0.03, 0.24, 0.0064, "chapa", "sela inox"); rr(-1.5 * p, 0.04, p, 0.4, "fibra", "peça do pilar"); rr(0.5 * p, 0.04, p, 0.4, "fibra", "peça do pilar"); rr(-0.5 * p, 0.04, p, 0.25, "vista", "bloqueador de base"); ff(0, -0.2, 0, 0.29); vista = "elevação"; break;
      case "L02": rr(-1.5 * p, -1.5 * p, p, p, "corte"); rr(0.5 * p, -1.5 * p, p, p, "corte"); rr(-1.5 * p, 0.5 * p, p, p, "corte"); rr(0.5 * p, 0.5 * p, p, p, "corte"); rr(-0.5 * p, -1.5 * p, p, 3 * p, "vista", "bloqueador"); rr(-1.5 * p, -0.5 * p, 3 * p, p, "vista"); ff(-1.5 * p - 0.02, -0.25 * p, 1.5 * p + 0.02, -0.25 * p); ff(-1.5 * p - 0.02, 0.25 * p, 1.5 * p + 0.02, 0.25 * p); ff(-0.25 * p, -1.5 * p - 0.02, -0.25 * p, 1.5 * p + 0.02); ff(0.25 * p, -1.5 * p - 0.02, 0.25 * p, 1.5 * p + 0.02); vista = "planta"; break;
      case "L03": rr(-1.5 * p, -0.3, p, 0.6, "fibra", "peça do pilar"); rr(0.5 * p, -0.3, p, 0.6, "fibra", "peça do pilar"); rr(-vi[0] / 2, -vi[1] / 2, vi[0], vi[1], "corte", "viga"); ff(-1.5 * p - 0.02, vi[1] * 0.25, 1.5 * p + 0.02, vi[1] * 0.25); ff(-1.5 * p - 0.02, -vi[1] * 0.25, 1.5 * p + 0.02, -vi[1] * 0.25); vista = "elevação"; break;
      case "L04": rr(-0.45, -vi[0] / 2, 0.9, vi[0], "fibra", "viga"); rr(-vi[0] / 2, vi[0] / 2, vi[0], 0.35, "fibra", "peça de topo"); ff(-0.02, -vi[0] / 2 - 0.02, -0.02, vi[0] / 2 + 0.08); ff(0.02, -vi[0] / 2 - 0.02, 0.02, vi[0] / 2 + 0.08); vista = "planta"; break;
      case "L05": rr(-0.15, -0.16, 0.6, 0.16, "fibra", "barrote"); rr(-mt[1] / 2, 0, mt[1], 0.55, "fibra", "montante"); rr(mt[1] / 2, 0.02, 0.006, 0.4, "chapa", "chapa do hold-down"); ff(mt[1] / 2 + 0.06, -0.2, mt[1] / 2 + 0.06, 0.05); ff(-mt[1] / 2 - 0.02, 0.12, mt[1] / 2 + 0.03, 0.12); ff(-mt[1] / 2 - 0.02, 0.24, mt[1] / 2 + 0.03, 0.24); vista = "elevação"; break;
      case "L06": rr(-0.3, -br0[1] - 0.04, 0.6, br0[1], "fibra", "barrote / bloqueio"); rr(-0.3, -0.04, 0.6, 0.04, "chapa", "Painel Wall"); rr(-dm[0] / 2, 0, dm[0], dm[1], "corte", "dormente"); rr(-gi[1] / 2, dm[1], gi[1], gi[0], "corte", "guia inferior"); ff(0, -br0[1] - 0.06, 0, dm[1] + gi[0] + 0.02); vista = "corte"; break;
      case "L07": rr(-0.6, 0, 1.2, 0.012, "chapa", "chapa"); [-0.6, 0, 0.6].forEach(function (x) { rr(x - mt[0] / 2, -mt[1], mt[0], mt[1], "corte"); }); vista = "corte"; break;
      case "L08": rr(-0.45, -vi[1] / 2, 0.9, vi[1], "fibra", "viga"); rr(-vi[0] / 2, vi[1] / 2 + 0.005, vi[0], 0.03, "vista"); rr(-0.08, -vi[1] / 2, 0.006, 0.12, "chapa", "cantoneira"); rr(0.074, -vi[1] / 2, 0.006, 0.12, "chapa"); ff(-0.1, -0.05, -0.04, -0.05); ff(0.06, -0.05, 0.12, -0.05); vista = "elevação"; break;
      case "L09": rr(-0.2, -0.3, 0.4, 0.3, "concreto", "pilarete"); rr(-0.45, 0.04, 0.9, vp[1], "fibra", "viga principal (VP)"); ff(-0.06, -0.3, -0.06, vp[1] + 0.06); ff(0.06, -0.3, 0.06, vp[1] + 0.06); vista = "elevação"; break;
      case "L10": rr(-vp[0] / 2, -vp[1], vp[0], vp[1], "corte", "viga principal (VP)"); rr(-0.4, 0, 0.8, br0[1], "fibra", "barrote"); ff(-0.07, br0[1] * 0.8, 0.03, -0.12); vista = "elevação"; break;
      case "L11": rr(-0.4, -br0[1], 0.8, br0[1], "fibra", "barrote"); rr(-0.4, 0, 0.8, 0.04, "chapa", "Painel Wall 40 mm"); ff(-0.1, 0.04, -0.1, -0.045); ff(0.1, 0.04, 0.1, -0.045); vista = "corte"; break;
      case "L12": rr(-0.35, -ts[0], 0.7, ts[0], "fibra", "testeira"); rr(-0.25, 0, br0[0], 0.4, "fibra", "barrote"); rr(0.13, 0, br0[0], 0.4, "fibra", "barrote"); ff(-0.19 - 0.02, -ts[0] - 0.01, -0.19 - 0.02, 0.1); ff(-0.19 + 0.02, -ts[0] - 0.01, -0.19 + 0.02, 0.1); ff(0.19 - 0.02, -ts[0] - 0.01, 0.19 - 0.02, 0.1); ff(0.19 + 0.02, -ts[0] - 0.01, 0.19 + 0.02, 0.1); vista = "planta"; break;
      case "L13": rr(-0.4, -0.25, br0[0], 0.5, "fibra", "barrote"); rr(0.28, -0.25, br0[0], 0.5, "fibra", "barrote"); rr(-0.28, -bq[0] / 2, 0.56, bq[0], "fibra", "bloqueio"); ff(-0.33, 0.06, -0.22, -0.02); ff(0.33, 0.06, 0.22, -0.02); ff(-0.33, -0.06, -0.22, 0.02); ff(0.33, -0.06, 0.22, 0.02); vista = "planta"; break;
      case "L14": rr(-0.45, -vp[0] / 2, 0.9, vp[0], "fibra", "VP"); rr(-vp[0] / 2, vp[0] / 2, vp[0], 0.4, "fibra", "viga de borda"); rr(-vp[0] / 2 - 0.006, vp[0] / 2, 0.006, 0.076, "chapa", "cantoneira"); rr(vp[0] / 2, vp[0] / 2, 0.006, 0.076, "chapa"); ff(-vp[0] / 2 - 0.03, vp[0] / 2 + 0.04, -vp[0] / 2 + 0.04, vp[0] / 2 + 0.04); ff(vp[0] / 2 + 0.03, vp[0] / 2 + 0.04, vp[0] / 2 - 0.04, vp[0] / 2 + 0.04); vista = "planta"; break;
      case "L15": rr(-1.5 * p, -1.5 * p, 3 * p, 3 * p, "vista", "pilar composto"); rr(-br0[0] / 2, 1.5 * p, br0[0], 0.4, "fibra", "barrote da fila"); rr(-br0[0] / 2 - 0.006, 1.5 * p, 0.006, 0.076, "chapa", "cantoneira"); rr(br0[0] / 2, 1.5 * p, 0.006, 0.076, "chapa"); ff(-br0[0] / 2 - 0.03, 1.5 * p + 0.04, -br0[0] / 2 + 0.04, 1.5 * p + 0.04); ff(br0[0] / 2 + 0.03, 1.5 * p + 0.04, br0[0] / 2 - 0.04, 1.5 * p + 0.04); vista = "planta"; break;
      default: return null;
    }
    var xs = [], ys = []; R.forEach(function (q) { xs.push(q.x, q.x + q.w); ys.push(q.y, q.y + q.h); }); F.forEach(function (f) { xs.push(f.x1, f.x2); ys.push(f.y1, f.y2); });
    return { R: R, F: F, vista: vista, cx: [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)] };
  }
  function folhaLigacoes(c) {
    var D = c.D, d = c.d, r = c.r, a = c.geo.area, T = D.E.T;
    var codigos = Object.keys(d.lig).sort(natural);
    if (!codigos.length) { D.texto(a.x + 10, a.y + 20, "O resultado não traz ligações: sem detalhes [PENDENTE].", T.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var nCol = 4, nLin = Math.ceil(codigos.length / nCol), gap = 6, cw = (a.w - 4 - (nCol - 1) * gap) / nCol, ch = (a.h - 4 - (nLin - 1) * gap) / nLin;
    codigos.forEach(function (cod, i) {
      var x = a.x + 2 + (i % nCol) * (cw + gap), y = a.y + 2 + Math.floor(i / nCol) * (ch + gap), ls = d.lig[cod], l0 = ls[0];
      var esq = esquemaLig(cod, d);
      var tTit = cod + " - " + txt(l0.tipo).split(" — ")[0].toUpperCase(), cortado = false;
      while (largTexto(letraRomanS(tTit), T.titulo) > cw - 6 && tTit.indexOf(" ") > 0) { tTit = tTit.slice(0, tTit.lastIndexOf(" ")); cortado = true; }
      var ht = tituloVista(D, x + 1, y + 1, tTit + (cortado ? " ..." : ""), esq ? "ESQUEMA - " + esq.vista.toUpperCase() : null);
      /* textos (medidos primeiro para saber quanto sobra para o desenho) */
      var hN = T.minimo, lin = cortado ? [cod + " - " + txt(l0.tipo) + "."] : [];
      ls.forEach(function (l) {
        lin.push((l.sub ? "[" + l.sub + "] " : "") + txt(l.descricao) + (l.quantidade ? " - " + l.quantidade + " ocorrência(s)." : "."));
        if (l.eta != null) lin.push({ t: (l.ok ? "VERIFICADA: eta = " + br(l.eta, 3) : "NÃO ATENDE: eta = " + br(l.eta, 3)) + (l.governante ? " (" + l.governante + ")" : "") + (l.substituidaPor ? " - substituída pela " + l.substituidaPor : "") + ". " + txt(l.norma), cor: l.ok ? null : VERMELHO, attr: l.ok ? ' data-lig-ok="' + cod + '"' : ' data-pend="lig-' + cod + '"' });
        else lin.push({ t: "SEM VERIFICAÇÃO DE RESISTÊNCIA NO CÁLCULO" + (l.status ? " (" + l.status + ")" : "") + " [PENDENTE].", cor: VERMELHO, attr: ' data-pend="lig-' + cod + '"' });
        if (l.nota) lin.push(l.nota);
      });
      var prods = arr(l0.produtos);
      if (prods.length) prods.forEach(function (p) { lin.push("Produto: " + p.nome + (p.codigo ? " - cód. " + p.codigo : "") + (p.pagina ? " - catálogo p. " + p.pagina : "") + (p.link ? " - " + p.link : "")); });
      else lin.push({ t: "Produto de catálogo (fabricante, código, página, link): não vinculado no resultado do cálculo - ferragem normalizada pelo texto acima [PENDENTE].", cor: VERMELHO, attr: ' data-pend="produto-' + cod + '"' });
      var hTx = D.alturaTextos(lin, hN, cw - 4);
      var hDes = ch - ht - hTx - 8;
      if (esq && hDes > 18) {
        var W = esq.cx[1] - esq.cx[0], H = esq.cx[3] - esq.cx[2];
        var esc0 = escolher([2, 5, 10, 20, 25], function (e) { return W * 1000 / e + 16 <= cw - 30 && H * 1000 / e <= hDes - 4; }), s = 1000 / esc0;
        var ox = x + (cw - W * s) / 2 - esq.cx[0] * s - 8, oy = y + ht + 3 + (hDes - H * s) / 2 + esq.cx[3] * s;
        function P(px, py) { return [ox + px * s, oy - py * s]; }
        var rotulos = [];
        esq.R.forEach(function (q) {
          var A = P(q.x, q.y + q.h), w = q.w * s, h = q.h * s;
          if (q.tipo === "corte") D.secaoMadeira(A[0], A[1], w, h);
          else if (q.tipo === "fibra") D.fibraMadeira(A[0], A[1], w, h);
          else if (q.tipo === "concreto") { D.ret(A[0], A[1], w, h, "MAD-CONTEXTO"); D.hachura(A[0], A[1], w, h, 2.2, "MAD-CONTEXTO"); }
          else if (q.tipo === "chapa") { if (Math.min(w, h) < 0.9) D.cheio([[A[0], A[1]], [A[0] + Math.max(w, 0.5), A[1]], [A[0] + Math.max(w, 0.5), A[1] + Math.max(h, 0.5)], [A[0], A[1] + Math.max(h, 0.5)]], PRETO); else D.ret(A[0], A[1], w, h, "MAD-FERRAGEM"); }
          else D.ret(A[0], A[1], w, h, "MAD-PECA");
          if (q.rot) rotulos.push({ q: q, A: A, w: w, h: h });
        });
        esq.F.forEach(function (f) { var A = P(f.x1, f.y1), B = P(f.x2, f.y2); D.linha(A[0], A[1], B[0], B[1], "MAD-FERRAGEM", ' data-fixador="' + cod + '"'); });
        /* rótulos das peças do esquema por chamada, à direita (ou à esquerda) */
        var xr = x + cw - 2, yr = y + ht + 4, usados = 0, hR = T.minimo;
        var vistos = {};
        rotulos.forEach(function (o, k) {
          if (vistos[o.q.rot]) return; vistos[o.q.rot] = 1;
          var px = o.A[0] + o.w * 0.75, py = o.A[1] + o.h * 0.5, wl = largTexto(letraRomanS(o.q.rot), hR) + 2, dirR = px > x + cw / 2 ? 1 : 1;
          var lugar = D.procura([o.A[0] + o.w + 6 + wl / 2, py - 3], wl, hR * 1.1, [x + 2, y + ht + 2, xr, y + ht + hDes], { folga: 0.4 }); void dirR;
          if (!lugar) return;
          var dir = lugar[0] > px ? 1 : -1, tx = lugar[0] - dir * wl / 2, ty = lugar[1] + hR * 0.62;
          if (D.cortaTexto(px, py, tx, ty)) return;
          D.texto(lugar[0], lugar[1], o.q.rot, hR, { al: "C", meio: true });
          D.linha(px, py, tx, ty, "MAD-FINA"); D.ponto(px, py, 0.3);
          usados++; void k;
        });
        D.texto(x + cw - 2, y + ht + hDes, "ESC 1:" + esc0, T.cota * 0.84, { al: "D" });
      } else if (!esq) D.texto(x + 2, y + ht + 8, "Sem esquema para " + cod + ".", hN, { cor: VERMELHO });
      D.textos(x + 2, y + ch - hTx - 2, lin, hN, { wmax: cw - 4 });
    });
    /* célula livre: as convenções do desenho de madeira (Padrão RA v2.4) */
    if (codigos.length < nCol * nLin) {
      var iL = codigos.length, xL = a.x + 2 + (iL % nCol) * (cw + gap), yL = a.y + 2 + Math.floor(iL / nCol) * (ch + gap);
      var yy0 = yL + 1 + tituloVista(D, xL + 1, yL + 1, "CONVENÇÕES DO DESENHO", "Padrão RA de detalhamento - estrutura de madeira") + 3, hC = T.nota * 0.84;
      var conv = [["corte", "seção cortada (anéis de crescimento)"], ["fibra", "corte ao longo da fibra"], ["vista", "peça em vista"], ["concreto", "concreto (fundação)"], ["chapa", "chapa metálica / ferragem"], ["fix", "parafuso, barra, tirefond, prego"], ["pend", "pendência ou reprovação (vermelho)"]];
      conv.forEach(function (q, k) {
        var yq = yy0 + k * 11, xq = xL + 6;
        if (q[0] === "corte") D.secaoMadeira(xq, yq, 14, 8); else if (q[0] === "fibra") D.fibraMadeira(xq, yq, 14, 8);
        else if (q[0] === "vista") D.ret(xq, yq, 14, 8, "MAD-PECA"); else if (q[0] === "concreto") { D.ret(xq, yq, 14, 8, "MAD-CONTEXTO"); D.hachura(xq, yq, 14, 8, 2.2, "MAD-CONTEXTO"); }
        else if (q[0] === "chapa") D.cheio([[xq, yq + 3], [xq + 14, yq + 3], [xq + 14, yq + 4.2], [xq, yq + 4.2]], PRETO); else if (q[0] === "fix") D.linha(xq, yq + 4, xq + 14, yq + 4, "MAD-FERRAGEM");
        else D.ret(xq, yq, 14, 8, "MAD-PEND");
        D.texto(xq + 20, yq + 4, q[1], hC, { meio: true, cor: q[0] === "pend" ? VERMELHO : null });
      });
      D.textos(xL + 4, yy0 + conv.length * 11 + 4, ["Esquemas desenhados com as seções reais das peças da fonte; a especificação vale pelo texto de cada ligação.", "Cotas em cm; ferragens em mm (designação do fabricante ou da norma)."], hC, { wmax: cw - 8 });
    }
    for (var j = 1; j < nCol; j++) { var xx = a.x + 2 + j * (cw + gap) - gap / 2; D.linha(xx, a.y + 2, xx, a.y + a.h - 2, "MAD-COTA"); }
    for (var k = 1; k < nLin; k++) { var yy = a.y + 2 + k * (ch + gap) - gap / 2; D.linha(a.x + 2, yy, a.x + a.w - 2, yy, "MAD-COTA"); }
    return { escala: "INDICADA" };
  }

  /* ================================================================ FOLHA 08 — LISTA DE MATERIAIS */
  function massaBarra(dmm, Lmm) { return Math.PI * dmm * dmm / 4 * Lmm * 7.85e-6; }   /* kg (aço inox ~7,9; carbono 7,85 — Ø nominal) */
  function listaFerragens(d, op) {
    var g = {}, ordem = [];
    function add(k, desc, un, kg, est, fonte) { if (!g[k]) { g[k] = { desc: desc, un: 0, kg: 0, est: false, fonte: fonte }; ordem.push(k); } g[k].un += un; g[k].kg += kg; if (est) g[k].est = true; }
    d.pecas.filter(function (p) { return p.grupo === "FERRAGEM"; }).forEach(function (p) {
      var desc = p.nome.replace(/\s+do hold-down.*$/i, "").replace(/\s*[—-]\s*painel.*$/i, "").replace(/\s*\(\d+\/\d+\)\s*$/, "");
      add("F|" + desc, desc + " (hold-downs)", 1, p.massa, false, "fonte (FERRAGEM)");
    });
    var LF = op.ligacoesFonte;
    arr(LF && LF.ferragens).forEach(function (f) {
      var fam = txt(f.familia).replace(/^RA FER - /, ""), k = "L|" + fam + "|" + f.tipo, Lmm = num(f.L_mm, 0), dmm = num(f.d, 0), kg = dmm && Lmm ? massaBarra(dmm, Lmm) : 0;
      add(k, fam + " " + f.tipo, 1, kg, !!kg, "ligacoes_quiosque.json");
    });
    return ordem.map(function (k) { return g[k]; });
  }
  function folhaMateriais(c) {
    var D = c.D, d = c.d, r = c.r, a = c.geo.area, T = D.E.T, x = a.x + 4, y = a.y + 2;
    var cp = r.compra;
    y += tituloVista(D, x, y, "LISTA DE MATERIAIS - MADEIRA POR ESPÉCIE E SEÇÃO", "comprimento útil pela fonte de peças (sem perdas); barras de compra pelo plano de corte do catálogo") + 1;
    var cols = [{ t: "ESPÉCIE" }, { t: ["SEÇÃO", "(cm)"] }, { t: "PEÇAS" }, { t: ["COMPR. ÚTIL", "(m)"] }, { t: ["VOLUME", "(m3)"] }, { t: "BARRAS DE COMPRA", al: "E" }, { t: "FORNECEDOR / CATÁLOGO", al: "E" }];
    var lin = [], porEsp = {}, ordemEsp = [];
    arr(cp && cp.grupos).forEach(function (g) { if (!porEsp[g.especie]) { porEsp[g.especie] = []; ordemEsp.push(g.especie); } porEsp[g.especie].push(g); });
    var totV = 0, totM = 0;
    ordemEsp.forEach(function (k) {
      var gs = porEsp[k].slice().sort(function (p, q) { return (p.b_mm * p.h_mm) - (q.b_mm * q.h_mm); }), sv = 0, sm = 0, sn = 0;
      lin.push({ titulo: nomeEspecie(k).toUpperCase(), attr: ' data-especie="' + esc(k) + '"' });
      gs.forEach(function (g) {
        var barras = "-", forn = "-", smd = g.sobMedida, pend = !smd && (!g.catalogo || !g.plano);
        if (g.plano && g.plano.barras) { var cont = {}; g.plano.barras.forEach(function (b) { cont[b.L_m] = (cont[b.L_m] || 0) + 1; }); barras = Object.keys(cont).sort(function (p, q) { return q - p; }).map(function (L) { return cont[L] + " x " + br(+L, 2) + " m"; }).join(" + "); }
        if (g.catalogo) forn = g.catalogo.fornecedor + " p. " + g.catalogo.pagina + (g.origem ? " - " + g.origem.texto.replace(/\s*\([^)]*\)$/, "") : "");
        if (smd) { barras = "sob medida (maior peça " + br(smd.maiorPeca_m, 2) + " m)"; forn = smd.fornecedor + " - cotação por m3"; }
        lin.push([especieCurta(k), cm(g.b_mm / 1000) + "x" + cm(g.h_mm / 1000), String(g.n), br(g.util_m, 2), { t: br(g.volume_m3, 3), attr: ' data-vol="' + (Math.round(g.volume_m3 * 1e6) / 1e6) + '" data-esp="' + esc(k) + '"' },
          pend ? { t: "sem fornecedor no catálogo [PENDENTE]", cor: VERMELHO, attr: ' data-pend="compra"' } : barras, pend ? { t: "cadastrar ou trocar a seção (RT)", cor: VERMELHO } : forn]);
        sv += g.volume_m3; sm += g.util_m; sn += g.n;
      });
      lin.push({ total: [{ t: "Subtotal" }, "", String(sn), br(sm, 2), { t: br(sv, 3), attr: ' data-subtotal-vol="' + esc(k) + '|' + (Math.round(sv * 1e6) / 1e6) + '"' }, "", ""] });
      totV += sv; totM += sm;
    });
    lin.push({ total: [{ t: "TOTAL" }, "", "", br(totM, 2), { t: br(totV, 3), attr: ' data-total-vol="' + (Math.round(totV * 1e6) / 1e6) + '"' }, "", ""] });
    var hl = 4.6, fsT = T.tabela;
    var tb = D.tabela(x, y, cols, lin, { fs: fsT, hl: hl });
    /* conferência com as espécies do cálculo */
    var pe = (r.especies && r.especies.porEspecie) || {}, conf = [];
    ordemEsp.forEach(function (k) { var sv = porEsp[k].reduce(function (s, g) { return s + g.volume_m3; }, 0), ve = pe[k] ? pe[k].volume_m3 : null; if (ve != null) conf.push({ t: nomeEspecie(k) + ": lista " + br(sv, 3) + " m3 x espécies do cálculo " + br(ve, 3) + " m3" + (Math.abs(sv - ve) > 0.001 ? " - DIFERENÇA [CONFERIR]" : " - confere"), cor: Math.abs(sv - ve) > 0.001 ? VERMELHO : null, attr: ' data-conf-esp="' + esc(k) + '"' }); });
    var yC = y + tb.h + 4;
    yC += D.textos(x, yC, conf, T.nota * 0.86, { wmax: tb.w });
    /* resumo por espécie (as espécies do cálculo: peças, metros e volume da fonte) */
    var esps = Object.keys(pe);
    if (esps.length) {
      yC += 6;
      yC += tituloVista(D, x, yC, "RESUMO POR ESPÉCIE", "todas as peças de madeira da fonte, por espécie de cálculo") + 1;
      var sN = 0, sM = 0, sV = 0;
      var linR = esps.map(function (k) { var o = pe[k]; sN += num(o.n, 0); sM += num(o.m, 0); sV += num(o.volume_m3, 0); return [nomeEspecie(k), txt((r.classes || {})[k]).replace(/^nativa:|^peca:/, "") || "-", String(o.n), br(o.m, 2), { t: br(o.volume_m3, 3), attr: ' data-resumo-esp="' + esc(k) + '|' + (Math.round(o.volume_m3 * 1e6) / 1e6) + '"' }]; });
      linR.push({ total: [{ t: "TOTAL" }, "", String(sN), br(sM, 2), br(sV, 3)] });
      var tr = D.tabela(x, yC, [{ t: "ESPÉCIE", al: "E" }, { t: "CLASSE" }, { t: "PEÇAS" }, { t: ["COMPR.", "(m)"] }, { t: ["VOLUME", "(m3)"] }], linR, {});
      yC += tr.h + 2;
    }
    /* coluna da direita: ferragens, painéis, membranas */
    var x2 = x + tb.w + 12, w2 = a.x + a.w - x2 - 2, y2 = a.y + 2;
    y2 += tituloVista(D, x2, y2, "FERRAGENS", "un e kg; kg estimado = Ø nominal x comprimento x 7.850 kg/m3 onde marcado (*)") + 1;
    var fr = listaFerragens(d, c.op), totKg = 0, totUn = 0;
    var linF = fr.map(function (f) { totKg += f.kg; totUn += f.un; return [{ t: f.desc, al: "E" }, String(f.un), f.kg > 0 ? br(f.kg, 2) + (f.est ? " *" : "") : "-"]; });
    linF.push({ total: [{ t: "TOTAL" }, { t: String(totUn), attr: ' data-ferr-un="' + totUn + '"' }, { t: br(totKg, 1), attr: ' data-ferr-kg="' + (Math.round(totKg * 10) / 10) + '"' }] });
    var colsF = [{ t: "FERRAGEM", al: "E" }, { t: "UN" }, { t: "kg" }];
    var hF = a.y + a.h - y2 - 70, porTab = Math.max(8, Math.floor((hF - 10) / 4.2));
    if (!fr.length) { D.texto(x2, y2 + 6, "Sem ferragens na fonte nem nas ligações [PENDENTE].", T.nota, { cor: VERMELHO }); y2 += 10; }
    else {
      var xf = x2, maxH = 0;
      for (var i0 = 0; i0 < linF.length; i0 += porTab) { var t = D.tabela(xf, y2, colsF, linF.slice(i0, i0 + porTab), { fs: T.tabela * 0.84, hl: 4.0 }); xf += t.w + 6; maxH = Math.max(maxH, t.h); if (xf > a.x + a.w - 40 && i0 + porTab < linF.length) { c.avisos.push("Folha 08: ferragens não couberam inteiras na largura."); break; } }
      y2 += maxH + 4;
      if (!c.op.ligacoesFonte) { D.texto(x2, y2 + T.nota * 0.76, "Ferragens das ligações (ligacoes_quiosque.json) não informadas: lista só com os hold-downs da fonte [PENDENTE].", T.nota * 0.84, { cor: VERMELHO }); y2 += 6; }
    }
    /* painéis */
    y2 += 6;
    y2 += tituloVista(D, x2, y2, "PAINÉIS E CHAPAS", null) + 1;
    var linP = [], cat = c.painelCat;
    var aPW = d.paineisPW.reduce(function (s, p) { return s + num(p.area_m2, 0); }, 0);
    if (d.paineisPW.length) linP.push(["Painel Wall 40 mm (piso)", d.paineisPW.length + " contornos", br(aPW, 2) + " m2", (r.painelWall && r.painelWall.impedeUso) ? { t: r.painelWall.criterio === "desempenho" ? "aproximar barrotes [PENDENTE]" : "acima da ficha [PENDENTE]", cor: VERMELHO } : "chapa " + br(cat.L, 2) + " x " + br(cat.b, 2) + " m"]);
    var pc = r.paredesPremissas && r.paredesPremissas.catalogo;
    var chs = d.pecas.filter(function (p) { return p.grupo === "WF_CHAPA"; }), aCh = chs.reduce(function (s, p) { return s + num(p.ext[0], 0) * num(p.ext[1], 0); }, 0);
    if (chs.length) { var ach = pc ? num(pc.largura_m, 1.2) * num(pc.altura_m, 2.4) : 2.88; linP.push([(pc ? pc.produto : "Chapa do fechamento") + " (paredes)", chs.length + " faces", br(aCh, 2) + " m2", { t: Math.ceil(aCh / ach) + " chapas " + (pc ? br(pc.largura_m, 2) + " x " + br(pc.altura_m, 2) : "1,20 x 2,40") + " (sem perdas) [CONFIRMAR]", cor: VERMELHO }]); }
    if (linP.length) { var tp = D.tabela(x2, y2, [{ t: "PRODUTO", al: "E" }, { t: "QUANT." }, { t: "ÁREA" }, { t: "OBS.", al: "E" }], linP, { fs: T.tabela * 0.84, hl: 4.2 }); y2 += tp.h + 6; }
    /* membranas (camadas do piso) */
    y2 += tituloVista(D, x2, y2, "MEMBRANAS E CAMADAS DO PISO", "área por zona (camadas_piso)") + 1;
    var cmz = d.camadas, linM = [], agg = {};
    arr(cmz && cmz.camadas).forEach(function (q) { if (!/manta|imperm/i.test(q.camada + " " + q.descricao)) return; var k = q.descricao.split(" (")[0].split(",")[0]; agg[k] = (agg[k] || 0) + num(q.area_m2, 0); });
    Object.keys(agg).forEach(function (k) { linM.push([{ t: k, al: "E" }, br(agg[k], 2)]); });
    if (linM.length) { D.tabela(x2, y2, [{ t: "MEMBRANA", al: "E" }, { t: ["ÁREA", "(m2)"] }], linM, { fs: T.tabela * 0.84, hl: 4.2 }); }
    else D.texto(x2, y2 + 6, "Camadas do piso sem área por zona [PENDENTE].", T.nota, { cor: VERMELHO });
    /* pendências da compra */
    var yP = yC + 6;
    var pendC = arr(cp && cp.pendencias), outras = arr(r.pendencias).filter(function (t) { return /γ|gama|pinus|placa ciment|lã de rocha/i.test(t) && !/^Compra:/.test(t); });
    var lP = [];
    if (pendC.length) lP.push({ t: "Compra: " + pendC.length + " seção(ões) sem fornecedor no catálogo (em vermelho na tabela) - cadastrar serraria/fornecedor ou trocar a seção (decisão do RT) [PENDENTE].", cor: VERMELHO });
    outras.forEach(function (t) { lP.push({ t: t, cor: VERMELHO }); });
    lP.push("Sem acréscimo de perdas: a perda é do orçamento, não do desenho (mesma regra do resumo do aço).");
    if (yP < a.y + a.h - 20) D.textos(x, yP, lP, T.nota * 0.86, { wmax: tb.w });
    return { escala: "SEM ESCALA" };
  }

  /* ================================================================ FOLHA 09 — ROMANEIO DE CORTE (por marca) */
  function folhaRomaneio(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T;
    var g = {}, ordem = [];
    d.pecas.forEach(function (p) { if (!p.marca || !p.secao || /^(FERRAGEM|WF_CHAPA)$/.test(p.grupo)) return; if (!g[p.marca]) { g[p.marca] = { marca: p.marca, esp: p.especie, sec: secTxt(p.secao), L: p.comp, n: 0, v: 0, difere: false }; ordem.push(p.marca); } var q = g[p.marca]; q.n++; q.v += p.vol; if (Math.abs(p.comp - q.L) > 0.01 || secTxt(p.secao) !== q.sec) q.difere = true; });
    ordem.sort(natural);
    var hT = tituloVista(D, a.x + 4, a.y + 2, "ROMANEIO DE CORTE - PEÇAS DE MADEIRA POR MARCA", "comprimento de corte da fonte de peças (cm); volume = soma das peças da marca (m3); sem perdas") + 2;
    var cols = [{ t: "MARCA" }, { t: "ESPÉCIE" }, { t: ["SEÇÃO", "(cm)"] }, { t: ["CORTE", "(cm)"] }, { t: "QTD" }, { t: "m3" }];
    var linhas = ordem.map(function (m) { var q = g[m], cor = q.difere ? VERMELHO : null; return [{ t: m, attr: ' data-romaneio="' + esc(m) + '"', cor: cor }, { t: q.esp ? especieCurta(q.esp) : "-", cor: cor }, { t: q.sec, cor: cor }, { t: cm(q.L), cor: cor }, String(q.n), br(q.v, 3)]; });
    var ws = D.larguras(cols, linhas, {}), wT = ws.reduce(function (t, v) { return t + v; }, 0), gap = 7;
    var nCol = Math.max(1, Math.floor((a.w - 8 + gap) / (wT + gap))), porCol = Math.ceil(linhas.length / nCol), hDisp = a.y + a.h - 4 - (a.y + 2 + hT) - 14;
    var hl = Math.max(4.2, Math.min(5.6, hDisp / (porCol + 1.6)));
    if (porCol * hl > hDisp) { porCol = Math.floor(hDisp / hl) - 1; nCol = Math.ceil(linhas.length / porCol); }
    var x = a.x + 4, y = a.y + 2 + hT, vt = 0, nt = 0, ht = 0;
    ordem.forEach(function (m) { vt += g[m].v; nt += g[m].n; });
    for (var i = 0; i < linhas.length; i += porCol) {
      var parte = linhas.slice(i, i + porCol);
      if (i + porCol >= linhas.length) parte.push({ total: [{ t: "TOTAL" }, "", "", "", { t: String(nt) }, { t: br(vt, 3), attr: ' data-romaneio-vol="' + (Math.round(vt * 1e6) / 1e6) + '"' }] });
      var tb = D.tabela(x, y, cols.map(function (cc, j) { return { t: cc.t, w: ws[j], al: cc.al }; }), parte, { hl: hl });
      ht = Math.max(ht, tb.h); x += wT + gap;
      if (x + wT > a.x + a.w + 1 && i + porCol < linhas.length) { c.avisos.push("Folha 09: o romaneio não coube inteiro na largura."); break; }
    }
    if (ordem.some(function (m) { return g[m].difere; })) D.texto(a.x + 4, y + ht + 6, "Marca com peças de seção ou comprimento diferentes (em vermelho): conferir a fonte [PENDENTE].", T.nota, { cor: VERMELHO });
    return { escala: "SEM ESCALA" };
  }

  /* ================================================================ NOTAS (coluna da direita, todas as folhas) */
  function blocosNotas(c) {
    var r = c.r, d = c.d, rev = c.rev, nv = d.niveis;
    var classes = r.classes || {}, partes = [];
    Object.keys(classes).forEach(function (k) { partes.push(especieCurta(k) + " " + txt(classes[k]).replace(/^nativa:|^peca:/, "")); });
    var notas = [
      "Cotas em centímetros; níveis em metros (z = 0,00 no piso acabado" + (nv.nota && /\+\d/.test(nv.nota) ? ", " + (/(\+\d+[,.]?\d*)/.exec(nv.nota) || [""])[0] + " da arquitetura" : "") + "). Não medir no desenho.",
      "Marca da peça: {marca} - {espécie} {b}x{h} x {comprimento} (cm), igual em todas as folhas e na lista de materiais.",
      "Classes de resistência (NBR 7190-1:2022, premissa do RT): " + partes.join("; ") + ".",
      txt(nv.fixacao) ? "Madeira nunca em contato com o concreto: " + nv.fixacao + "." : "",
      "Ligações e ferragens: conforme a folha 07 (texto de cada ligação); ferragem inox A4-70 (AISI 316) onde indicado.",
      "Hachura: seção cortada com anéis de crescimento; corte ao longo da fibra com linhas de fibra; peça em vista sem hachura.",
      "VERMELHO = pendência ou reprovação: não executar nem comprar o item antes de resolver.",
      "Projeto executivo - revisão " + rev + "."
    ].filter(Boolean);
    var normas = ["ABNT NBR 7190-1:2022 - projeto de estruturas de madeira", "ABNT NBR 7190:1997, Anexo A - desenho de estruturas de madeira (referência do desenho)",
      "ABNT NBR 16936:2023 - edificações em light wood frame (paredes)", "ABNT NBR 6120:2019 - ações", "ABNT NBR 6123:2023 - vento", "ABNT NBR 8681:2003 - ações e segurança (combinações)",
      "EN 1995-1-1:2004+A2:2014 - ligações (Johansen)", "ABNT NBR 7199:2025 - vidros (texto não lido: vidro pendente)",
      "ABNT NBR 16861:2020, 17006:2021, 17067:2022, 17068:2022 e 16752:2020 - desenho técnico (linhas, projeções, hachuras, cotagem, folhas)"];
    var imp = arr(r.impedimentos);
    var bl = [];
    if (imp.length) bl.push({ titulo: "NÃO EMITIR PARA EXECUÇÃO", cor: VERMELHO, itens: imp.map(function (t) { return { t: t, cor: VERMELHO, attr: ' data-impedimento="1"' }; }) });
    bl.push({ titulo: "NOTAS GERAIS", numerar: true, itens: notas });
    bl.push({ titulo: "NORMAS UTILIZADAS", numerar: true, itens: normas });
    return bl;
  }

  /* ================================================================ GERAR */
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    var avisos = [];
    if (!r || !r.pecas || !r.modelo) return { ok: false, folhas: [], avisos: [(r && r.motivo) || "Resultado do cálculo vazio: não há pranchas para gerar."] };
    var P = PR();
    if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    var F = fonteComDecisoes(r, opcoes.fonte);
    if (!F || !arr(F.pecas).length || !arr(F.pecas)[0].p0) return { ok: false, folhas: [], avisos: ["O resultado traz as peças sem geometria (resultado.pecas: id, grupo, seção e volume): passe opcoes.fonte (madeira_quiosque.json) para desenhar."] };
    var E = estilo(opcoes.padrao), d = extrair(r, opcoes, avisos);
    /* chapa do Painel Wall pelo catálogo */
    var cat = PADRAO_MAD.painelWallReserva, MC = opcoes.catalogo || MCAT();
    if (MC && MC.produto && r.painelWall && r.painelWall.produtoId) { try { var pp = MC.produto(r.painelWall.produtoId), v0 = pp && arr(pp.variantes)[0]; if (v0 && v0.L_mm && v0.largura_mm) cat = { L: v0.L_mm / 1000, b: v0.largura_mm / 1000, fonte: pp.fabricante + " " + pp.linha + " p. " + v0.pagina }; } catch (e) { /* sem catálogo */ } }
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA");
    if (formato !== "A1" && formato !== "A0") avisos.push("Formato " + formato + ": as pranchas da madeira foram conferidas em A1; em folha menor os quadros podem não caber.");
    var codigo = txt(opcoes.codigo).trim() || "EST-MAD", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    var defs = [
      { id: "locacao", fn: folhaLocacao }, { id: "piso", fn: folhaPiso },
      { id: "cobertura-inferior", fn: function (c) { return folhaCobertura(c, "inferior"); } }, { id: "cobertura-superior", fn: function (c) { return folhaCobertura(c, "superior"); } },
      { id: "paineis", fn: folhaPaineis }, { id: "pilares", fn: folhaPilares }, { id: "ligacoes", fn: folhaLigacoes }, { id: "materiais", fn: folhaMateriais }, { id: "romaneio", fn: folhaRomaneio }
    ];
    defs.forEach(function (df, i) { df.titulo = PADRAO_MAD.folhas[i]; });
    var ctx0 = { d: d, r: r, E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, painelCat: cat };
    var feitas = [];
    defs.forEach(function (def, i) {
      var D = new Desenho(E, opcoes.depurar ? [] : null), c = {}, res = {};
      Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.n = i + 1;
      try { res = def.fn(c) || {}; } catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + def.titulo + "): " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      feitas.push({ def: def, D: D, escala: res.escala || "INDICADA", rotulo: dois(i + 1) });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "madpranchas", nome: "Estrutura de madeira - projeto executivo", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local),
                 codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var blocos = blocosNotas(ctx0), nPrinc = defs.length;
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, M = geo.moldura, Fd = new Desenho(E, null);
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA");
      if (!colunaNotas(Fd, geo, blocos) && i === 0) avisos.push("As notas não cabem na coluna da direita com a letra mínima do padrão: conferir.");
      carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(nPrinc));
      var numero = codigo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(H) + 'mm" viewBox="0 0 ' + n(W) + " " + n(H) + '" font-family="' + FONTE + '" data-folha="' + f.def.id + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev) + "</title>" +
        '<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + "</svg>";
      var o = { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg };
      if (opcoes.depurar) o.caixasTexto = D.caixas;
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos };
  }

  function sobreposicoes(caixas, tol) { var A = AP(); if (A && A.sobreposicoes) return A.sobreposicoes(caixas, tol); var out = []; for (var i = 0; i < caixas.length; i++) for (var j = i + 1; j < caixas.length; j++) if (sobrepoeQ(caixas[i].p, caixas[j].p, -(tol == null ? 0.15 : tol))) out.push([caixas[i].s, caixas[j].s]); return out; }

  var MadPranchas = { PADRAO_MAD: PADRAO_MAD, gerar: gerar, largTexto: largTexto, sobreposicoes: sobreposicoes, extrair: extrair, caixaPeca: caixaPeca, esquemaLig: esquemaLig };
  global.MadPranchas = MadPranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = MadPranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

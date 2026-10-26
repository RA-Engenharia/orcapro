/* =====================================================================
 * acopranchas.js — PRANCHAS DO PROJETO EXECUTIVO DE ESTRUTURA METÁLICA
 * do galpão calculado (js/acodimensionar.js). Motor PURO, ES5, sem DOM.
 *
 *   AcoPranchas.gerar(r, opcoes) → { ok, folhas: [{ id, numero, titulo,
 *       formato, escala, svg }], avisos }
 *   r      = o resultado do AcoDimensionar.calcular (docs/metalica/CONTRATO.md)
 *   opcoes = { empresa (nome, ou o objeto do cadastro: nome, cnpj, titulo,
 *              responsavel, crea, endereco, cidade, email, telefone),
 *              responsavel, registro, obra, proprietario, contratante, local,
 *              codigo (código-base do desenho), revisao ("R00"), data,
 *              formato ("A1"), logo (imagem do carimbo), padrao (Padrão de
 *              detalhamento da empresa — vazio = o Padrão RA), depurar }
 *
 * O jogo sai inteiro, sem ninguém escolher vista nem escala:
 *   01 LOCAÇÃO DOS PILARES E DAS BASES — eixos com balões, cotas parciais e
 *      acumuladas, pilares e bases marcados, locação dos chumbadores e o
 *      quadro de cargas na fundação (r.reacoes, por caso e envoltória ELU)
 *   02 PLANTA DE COBERTURA — vigas, terças, cumeeira, contraventamento em X,
 *      correntes, mãos-francesas, caimento e beirais
 *   03 PÓRTICOS — típico e de oitão: perfis, cotas, terças, marcas das
 *      ligações (base, joelho, cumeeira, clip, mão-francesa)
 *   04 ELEVAÇÕES — filas laterais e oitões (vista externa): travessas,
 *      contraventamento vertical, fechamentos
 *   05 DETALHES TÍPICOS DE LIGAÇÃO — placa de base, joelho, cumeeira, clip
 *      de terça, contraventamento, mão-francesa (solda AWS A2.4, parafusos,
 *      chapas)
 *   06 LISTA DE MATERIAIS — por grupo e perfil, resumo por aço, kg/m²
 *
 * PADRÃO: papel, moldura e o CARIMBO RA vêm do js/prancha.js (a mesma
 * geometria das outras pranchas do sistema; o carimbo não muda). Penas,
 * tipos de linha e alturas de texto vêm do Padrão de detalhamento
 * (js/padraodet.js). O que é só da metálica (cota em mm, marcas das peças,
 * simbologia de solda, escalas) está em PADRAO_ACO, abaixo.
 *
 * ⚠ NADA É INVENTADO. O que o cálculo ainda não decidiu sai em VERMELHO
 *   como pendência: perfil das terças, travessas e mãos-francesas (NBR
 *   14762, à parte), correntes, vento ausente do resultado. As LIGAÇÕES não
 *   são dimensionadas pelo cálculo ainda: os detalhes saem com os valores de
 *   PARTIDA da Metálica (js/metalligacao.js + js/metalnorma.js), com a nota
 *   "dimensões de partida - conferir no memorial" e os esforços de cálculo
 *   que a ligação tem de resistir (tirados da análise).
 * Teste: node tools/test-aco-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------ dependências */
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* módulo ausente */ } }
    return null;
  }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function NR() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function MT() { return dep("AcoMateriais", "./acomateriais.js"); }
  function PD() { return dep("PadraoDet", "./padraodet.js"); }
  function CAT() { return global.PerfisAco || null; }   /* catálogo grande: só se já estiver carregado */

  /* ------------------------------------------------------------ utilidades */
  function num(v, d) { if (v == null || v === "") return d; var x = Number(v); return isFinite(x) ? x : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function cima5(v) { return Math.ceil(v / 5 - 1e-9) * 5; }
  /* número do SVG: 3 casas; o que não é número sai "NaN" de propósito (o teste reprova) */
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  /* número brasileiro: 1.234,5 */
  function br(v, c) {
    if (v == null || !isFinite(v)) return "-";
    c = c == null ? 2 : c;
    var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    if (/^0(\.0*)?$/.test(s)) neg = false;
    var p = s.split("."), ip = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + ip + (p[1] ? "," + p[1] : "");
  }
  /* espessura de chapa como se escreve no desenho: inteira sem casa decimal (# 19), fracionária com uma (# 12,5) */
  function espChapa(t) { t = +t; if (!isFinite(t)) return "-"; return Math.abs(t - Math.round(t)) < 1e-6 ? String(Math.round(t)) : br(t, 1); }
  /* corrente ou tirante do cálculo das terças e travessas (linhaTirante): só vale com o diâmetro */
  function barraLT(lt) { return lt && num(lt.d, 0) > 0 ? { nome: txt(lt.nome), d: num(lt.d, 0), aco: txt(lt.aco), F: num(lt.F, null), Rd: num(lt.Rd, null), linhas: num(lt.linhas, null), entre: num(lt.entre, null), texto: txt(lt.texto) } : null; }
  function diamTxt(b) { return "Ø " + br(b.d, 1); }
  function massaBarra(dmm) { return Math.PI * dmm * dmm / 4 * 7850e-6; }   /* kg/m de barra redonda (aço 7850 kg/m³) */
  function mm(vm) { return String(Math.round(vm * 1000)); }          /* m → "20000" (cota em mm) */
  function dois(k) { return ("0" + k).slice(-2); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }
  function escolher(lista, ok) { for (var i = 0; i < lista.length; i++) if (ok(lista[i])) return lista[i]; return lista[lista.length - 1]; }
  /* "P1, P2, P3, P5" → "P1 a P3, P5" */
  function seq(marcas) {
    var ms = arr(marcas).map(function (m) { var q = /^([A-Za-z]+)(\d+)$/.exec(m); return q ? { p: q[1], k: +q[2], s: m } : { p: m, k: null, s: m }; });
    var out = [], i = 0;
    while (i < ms.length) {
      var j = i;
      while (j + 1 < ms.length && ms[i].k != null && ms[j + 1].k != null && ms[j + 1].p === ms[i].p && ms[j + 1].k === ms[j].k + 1) j++;
      out.push(j - i >= 2 ? ms[i].s + " a " + ms[j].s : (j > i ? ms[i].s + ", " + ms[j].s : ms[i].s));
      i = j + 1;
    }
    return out.join(", ");
  }
  function eixosTxt(ks) {
    var u = []; ks.forEach(function (k) { if (u.indexOf(k) < 0) u.push(k); });
    u.sort(function (a, b) { return a - b; });
    if (!u.length) return "";
    if (u.length === 1) return "eixo " + u[0];
    if (u.length > 2 && u[u.length - 1] - u[0] === u.length - 1) return "eixos " + u[0] + " a " + u[u.length - 1];
    return "eixos " + u.slice(0, -1).join(", ") + " e " + u[u.length - 1];
  }
  /* vãos entre eixos: [0, 6] → "vãos 1-2 e 7-8" */
  function vaosTxt(ks) {
    var u = []; ks.forEach(function (k) { if (u.indexOf(k) < 0) u.push(k); });
    u.sort(function (a, b) { return a - b; });
    var t = u.map(function (k) { return (k + 1) + "-" + (k + 2); });
    return (t.length > 1 ? "vãos " + t.slice(0, -1).join(", ") + " e " + t[t.length - 1] : "vão " + t[0]);
  }
  /* nome do perfil para o desenho: "W 310 x 38,7 Gerdau" → "W 310 x 38,7" (o fabricante vai na lista) */
  function perfilCurto(nome) { return txt(nome).replace(/\s+(Gerdau|ArcelorMittal|Usiminas|VMB|Tuper|AISC)\b.*$/i, "").trim(); }
  function cantoneiraNome(cat) { var q = /^L(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/i.exec(txt(cat)); return q ? "L " + q[1] + " x " + q[2] + " x " + q[3].replace(".", ",") : txt(cat); }

  var PRETO = "#000", VERMELHO = "#c00000", CINZA = "#7f7f7f", CINZA_CLARO = "#a6a6a6";
  var FONTE = "RomanS, ISOCPEUR, Arial, Helvetica, sans-serif";
  var NOTA_PARTIDA = "DIMENSÕES DE PARTIDA - CONFERIR NO MEMORIAL";

  /* ================================================================ PADRÃO
   * O que é da METÁLICA (o Padrão RA v2.x é do concreto/TQS): de onde vem a
   * pena de cada camada (layer do Padrão RA), unidade das cotas, marcas das
   * peças, escalas e simbologia. Seção a levar para o padrao_detalhamento_ra.json
   * ("metalica") — até lá vale daqui. */
  var PADRAO_ACO = {
    versao: "1.0", data: "12/10/2026",
    origem: "Padrão RA de detalhamento v2.x (penas, tipos de linha, alturas de texto, letra RomanS, carimbo RA intocado) + prática de projeto executivo de estrutura metálica",
    cotas: { unidade: "mm", niveis: "m (2 casas)", terminal: "traço oblíquo curto (cota de fôrma do Padrão RA)",
             porque: "a fábrica e a montagem de estrutura metálica trabalham em milímetros (o concreto do Padrão RA cota em cm)" },
    camadas: {   /* camada da metálica → layer do Padrão RA (pena e tipo de linha) */
      "MET-PERFIL-CORTE": "EST-FORMA-CORTE", "MET-PRINCIPAL": "EST-FORMA-CORTE", "MET-PERFIL": "EST-ARM-ESTRIBO",
      "MET-SECUNDARIO": "EST-FORMA-VISTA", "MET-CONTRAVENTO": "EST-FORMA-VISTA", "MET-OCULTA": "EST-OCULTA",
      "MET-FINA": "EST-LINHA-FINA", "MET-COTA": "EST-COTA", "MET-EIXO": "EST-EIXO", "MET-HACHURA": "EST-HACHURA",
      "MET-CONTEXTO": "EST-CONTEXTO", "MET-TABELA": "EST-TABELA", "MET-TITULO": "EST-TITULO"
    },
    marcas: { pilar: "P", tapamento: "CT", viga: "V", base: "PB", terca: "TC", tercaBeiral: "TB", travessaLateral: "TL", travessaOitao: "TF",
              contraventoParede: "CV", contraventoCobertura: "CH", maoFrancesa: "MF", corrente: "CR" },
    escalas: { planta: [50, 75, 100, 125, 150, 200, 250, 500, 1000], elevacao: [25, 50, 75, 100, 125, 150, 200, 250, 500], detalhe: [5, 10, 15, 20, 25] },
    solda: "AWS A2.4 — símbolo na linha de referência: abaixo = lado da seta, acima = outro lado; círculo = em todo o contorno; bandeira = solda de campo",
    folhas: ["LOCAÇÃO DOS PILARES E DAS BASES", "PLANTA DE COBERTURA", "PÓRTICOS", "ELEVAÇÕES LATERAIS E FRONTAIS", "DETALHES TÍPICOS DE LIGAÇÃO", "LISTA DE MATERIAIS"],
    regras: [
      "Uma folha por tipo (locação, cobertura, pórticos, elevações, detalhes, lista); escala a maior que cabe; respiro de 15 mm entre desenhos.",
      "Perfis em elevação desenhados pelo contorno, na escala; seção cortada cheia; designação do perfil junto da peça.",
      "Ligação marcada no desenho geral por balão dividido (nº do detalhe / folha).",
      "Pendência (o que o cálculo não decidiu) em vermelho; ligação não dimensionada = valores de partida + nota.",
      "Lista de materiais com o peso igual ao do cálculo (perfis pelo eixo, nó a nó)."
    ]
  };
  /* pena (mm) e traço de reserva, se o js/padraodet.js não estiver carregado (os do Padrão RA v2.1) */
  var PENAS_RESERVA = { "EST-FORMA-CORTE": [0.5], "EST-ARM-ESTRIBO": [0.35], "EST-FORMA-VISTA": [0.25], "EST-OCULTA": [0.18, "3 1.5"],
    "EST-LINHA-FINA": [0.18], "EST-COTA": [0.13], "EST-EIXO": [0.13, "9.6 1.6 0.4 1.6"], "EST-HACHURA": [0.09], "EST-CONTEXTO": [0.13],
    "EST-TABELA": [0.25], "EST-TITULO": [0.35] };
  var ALTURAS_RESERVA = { titulo_desenho: 4.2, escala_sob_titulo: 3, cota: 2.5, nota: 2.5, tabela: 2.5, tabela_cabecalho: 3.1, balao_eixo: 3, notacao_estribo_trecho: 2.1,
    nome_apoio: 3.2, notacao_barra: 2.5, nivel: 3.8, titulo_quadro: 7.5, letra_corte: 3.4 };

  function estilo(padrao) {
    var P = PD(), base = null;
    try { base = P ? P.normPadrao(padrao || P.padraoRA()) : null; } catch (e) { base = null; }
    var cam = {};
    Object.keys(PADRAO_ACO.camadas).forEach(function (k) {
      var lay = PADRAO_ACO.camadas[k], l = null;
      if (P && base) { try { l = P.linhaDe(base, lay); } catch (e) { l = null; } }
      var f = PENAS_RESERVA[lay] || [0.25];
      cam[k] = { mm: l ? l.mm : f[0], dash: l ? l.dash : (f[1] || null) };
    });
    cam["MET-CONTEXTO"].cor = CINZA; cam["MET-HACHURA"].cor = CINZA_CLARO;
    cam["MET-MOLDURA"] = { mm: 0.5, dash: null };
    cam["MET-PEND"] = { mm: cam["MET-OCULTA"].mm, dash: cam["MET-OCULTA"].dash || "3 1.5", cor: VERMELHO };
    var at = (base && base.textos && base.textos.alturas_plotadas_mm) || ALTURAS_RESERVA;
    function h(k) { return num(at[k], ALTURAS_RESERVA[k]); }
    return {
      camadas: cam,
      T: { titulo: h("titulo_desenho"), escala: h("escala_sob_titulo"), cota: h("cota"), nota: h("nota"), tabela: h("tabela"),
           tabelaCab: h("tabela_cabecalho"), eixo: h("balao_eixo"), marca: h("nome_apoio"), perfil: h("notacao_barra"),
           nivel: Math.min(h("nivel"), h("cota") * 1.2), quadro: h("titulo_quadro"), detalhe: h("letra_corte"),
           /* a menor letra que o padrão usa (2,1 mm, trecho de estribo): nenhum texto encolhe abaixo dela para caber */
           minimo: Math.min.apply(null, Object.keys(at).map(function (k) { return num(at[k], 99); }).concat([h("notacao_estribo_trecho")])) },
      padraoVersao: base ? txt(base.versao) : ""
    };
  }

  /* ------------------------------------------------------------ largura do texto
   * avanço dos caracteres 32–255 (milésimos do corpo): o MAIOR entre a RomanS
   * (romans__.ttf, a letra do padrão) e a Arial (a reserva do navegador sem
   * a RomanS) — a conta de "cabe/não cabe" vale nas duas */
  var LARG = [751,366,506,751,716,891,926,366,506,506,576,926,366,926,366,786,716,716,716,716,716,716,716,716,716,716,366,366,856,926,856,646,
    1015,667,891,891,751,681,646,778,821,296,576,786,576,856,786,786,751,786,751,716,611,786,667,944,716,667,716,436,786,436,786,891,366,681,
    681,646,681,646,436,681,681,296,366,611,296,1066,681,681,681,681,471,611,436,681,576,786,611,576,611,506,296,506,891,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,751,471,646,646,556,786,260,716,333,737,471,646,584,926,737,552,400,926,385,333,333,716,537,
    333,333,333,471,646,996,996,834,646,667,667,667,667,667,667,1000,891,681,681,681,681,296,296,296,296,751,786,778,778,778,786,786,584,786,
    786,786,786,786,667,751,646,681,681,681,681,681,681,889,646,646,646,646,646,401,401,401,401,681,681,681,681,681,681,681,646,716,681,681,
    681,681,576,681,576];
  function largTexto(s, h) {
    s = txt(s); var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), v = c >= 32 && c < 256 ? LARG[c - 32] : 0;
      if (!v) v = (c === 8212 || c === 8230 || c === 8594) ? 1000 : 760;
      w += v;
    }
    return w / 1000 * h;
  }
  /* quebra de linha pela largura */
  function quebrar(s, h, wmax) {
    var pal = txt(s).split(/\s+/), linhas = [], at = "";
    pal.forEach(function (p) {
      if (!p) return;
      var t = at ? at + " " + p : p;
      if (at && largTexto(t, h) > wmax) { linhas.push(at); at = p; } else at = t;
    });
    if (at) linhas.push(at);
    return linhas;
  }

  /* ================================================================ DESENHO (SVG em mm de papel, y para baixo) */
  /* o desenho guarda os traços (sg) e as caixas dos textos (tb) que já fez: um rótulo pode procurar um lugar
     onde nenhuma linha o atravesse e nenhum texto o cubra (DP.livre) */
  function Desenho(E, caixas) { this.E = E; this.s = []; this.caixas = caixas || null; this.sg = []; this.tb = []; }
  var DP = Desenho.prototype;
  DP.add = function (t) { this.s.push(t); };
  DP.estilo = function (cam, extra) {
    var c = this.E.camadas[cam] || this.E.camadas["MET-FINA"];
    /* data-cam = a camada do desenho (só as MET-*: outras telas, como a do clima, usam este Desenho com camadas próprias que não vão ao SVG): o DXF (js/pranchasdxf.js) põe cada traço na layer do Padrão RA que a camada nomeia */
    return (/^MET-/.test(cam) ? ' data-cam="' + (this.E.camadas[cam] ? cam : "MET-FINA") + '"' : "") + ' stroke="' + (c.cor || PRETO) + '" stroke-width="' + n(c.mm) + '"' + (c.dash ? ' stroke-dasharray="' + c.dash + '"' : "") + (extra || "");
  };
  DP.traco = function (lista, fechado) { for (var i = 0; i + 1 < lista.length; i++) this.sg.push([lista[i][0], lista[i][1], lista[i + 1][0], lista[i + 1][1]]); if (fechado && lista.length > 2) this.sg.push([lista[lista.length - 1][0], lista[lista.length - 1][1], lista[0][0], lista[0][1]]); };
  DP.linha = function (x1, y1, x2, y2, cam, extra) {
    this.sg.push([x1, y1, x2, y2]);
    this.s.push('<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '"' + this.estilo(cam, extra) + "/>");
  };
  function pts(lista) { return lista.map(function (p) { return n(p[0]) + "," + n(p[1]); }).join(" "); }
  DP.poli = function (lista, cam, fechado, extra) {
    this.traco(lista, fechado);
    this.s.push("<" + (fechado ? "polygon" : "polyline") + ' points="' + pts(lista) + '" fill="none"' + this.estilo(cam, extra) + "/>");
  };
  DP.ret = function (x, y, w, h, cam, extra) {
    if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
    this.traco([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
    this.s.push('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="none"' + this.estilo(cam, extra) + "/>");
  };
  DP.fundo = function (x, y, w, h, cor) { this.s.push('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + (cor || "#fff") + '" stroke="none"/>'); };
  DP.circ = function (cx, cy, r, cam, extra) { var cl = []; for (var ic = 0; ic < 16; ic++) cl.push([cx + r * Math.cos(ic * Math.PI / 8), cy + r * Math.sin(ic * Math.PI / 8)]); this.traco(cl, true); this.s.push('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="none"' + this.estilo(cam, extra) + "/>"); };
  DP.cheio = function (lista, cor, extra) { this.traco(lista, true); this.s.push('<polygon points="' + pts(lista) + '" fill="' + (cor || PRETO) + '" stroke="none"' + (extra || "") + "/>"); };
  DP.ponto = function (cx, cy, r, cor) { this.s.push('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="' + (cor || PRETO) + '" stroke="none"/>'); };
  /* texto: y = linha de base (o.meio: y = meio da maiúscula); al E/C/D; rot em graus (horário, papel) */
  /* a RomanS não tem travessão, ×, ·, ≥, ³ e seta: troca pelo equivalente que ela tem (senão o navegador põe outra letra) */
  function letraRomanS(s) { return s.replace(/[—–]/g, "-").replace(/×/g, "x").replace(/·/g, ".").replace(/≥/g, ">=").replace(/→/g, "->").replace(/³/g, "3").replace(/⊥/g, "perp.").replace(/∥/g, "par.").replace(/[“”]/g, "\""); }
  /* cantos da caixa de um texto (como o DP.texto a desenha): al, meio, rot */
  function caixaTexto(x, y, s, h, o) {
    o = o || {};
    var al = o.al || "E", w = largTexto(letraRomanS(txt(s)), h), yb = o.meio ? y + 0.37 * h : y, a = (o.rot || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    var x0 = al === "C" ? -w / 2 : (al === "D" ? -w : 0);
    return [[x0, -0.76 * h], [x0 + w, -0.76 * h], [x0 + w, 0.18 * h], [x0, 0.18 * h]].map(function (p) { return [x + p[0] * c - p[1] * sn, yb + p[0] * sn + p[1] * c]; });
  }
  /* a caixa orientada q (4 cantos) está livre: nenhum traço a atravessa e nenhum texto a cobre (folga g) */
  DP.livreQ = function (q, g, gTexto) {
    g = g == null ? 0.4 : g;
    var gt = gTexto == null ? g : gTexto;
    var p0 = q[0], ux = q[1][0] - p0[0], uy = q[1][1] - p0[1], vx = q[3][0] - p0[0], vy = q[3][1] - p0[1], lu = hip(ux, uy), lv = hip(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) return true;
    var bx = [-g, -g, lu + g, lv + g];
    function loc(x, y) { var dx = x - p0[0], dy = y - p0[1]; return [(dx * ux + dy * uy) / lu, (dx * vx + dy * vy) / lv]; }
    var xs = q.map(function (p) { return p[0]; }), ys = q.map(function (p) { return p[1]; }), ab = [Math.min.apply(null, xs) - g, Math.min.apply(null, ys) - g, Math.max.apply(null, xs) + g, Math.max.apply(null, ys) + g];
    for (var i = 0; i < this.tb.length; i++) { var t = this.tb[i]; if (t[0] < ab[2] + gt - g && t[2] > ab[0] - gt + g && t[1] < ab[3] + gt - g && t[3] > ab[1] - gt + g) return false; }
    for (var j = 0; j < this.sg.length; j++) {
      var sg = this.sg[j];
      if (Math.max(sg[0], sg[2]) < ab[0] || Math.min(sg[0], sg[2]) > ab[2] || Math.max(sg[1], sg[3]) < ab[1] || Math.min(sg[1], sg[3]) > ab[3]) continue;
      var A = loc(sg[0], sg[1]), B = loc(sg[2], sg[3]);
      if (dentroCaixa([A[0], A[1], B[0], B[1]], bx)) return false;
    }
    return true;
  };
  DP.texto = function (x, y, s, h, o) {
    o = o || {}; s = letraRomanS(txt(s));
    if (!s) return 0;
    var al = o.al || "E", anc = al === "C" ? "middle" : (al === "D" ? "end" : "start");
    var yb = o.meio ? y + 0.37 * h : y, rot = o.rot || 0, w = largTexto(s, h);
    /* a RomanS TTF é traço único fino: um contorno leve dá a ela a espessura da pena de texto do Padrão (0,18–0,25 mm) */
    var peso = o.peso != null ? o.peso : Math.round(0.022 * h * 1000) / 1000;
    this.s.push('<text x="' + n(x) + '" y="' + n(yb) + '" font-size="' + n(h) + '"' + (anc !== "start" ? ' text-anchor="' + anc + '"' : "") +
      (rot ? ' transform="rotate(' + n(rot) + " " + n(x) + " " + n(yb) + ')"' : "") + (o.cor ? ' fill="' + o.cor + '"' : "") +
      (peso > 0 ? ' stroke="' + (o.cor || PRETO) + '" stroke-width="' + n(peso) + '"' : "") + (o.attr || "") + ">" + esc(s) + "</text>");
    var x0 = anc === "middle" ? -w / 2 : (anc === "end" ? -w : 0), a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    var q = [[x0, -0.76 * h], [x0 + w, -0.76 * h], [x0 + w, 0.18 * h], [x0, 0.18 * h]].map(function (p) { return [x + p[0] * c - p[1] * sn, yb + p[0] * sn + p[1] * c]; });
    this.tb.push([Math.min(q[0][0], q[1][0], q[2][0], q[3][0]), Math.min(q[0][1], q[1][1], q[2][1], q[3][1]), Math.max(q[0][0], q[1][0], q[2][0], q[3][0]), Math.max(q[0][1], q[1][1], q[2][1], q[3][1])]);
    if (this.caixas && !o.semCaixa) this.caixas.push({ s: s, p: q });
    return w;
  };
  /* ponta de seta cheia em (px,py); (ux,uy) aponta da ponta para trás */
  DP.seta = function (px, py, ux, uy, tam) {
    tam = tam || 2.0; var w = tam * 0.3, bx = px + ux * tam, by = py + uy * tam, nx = -uy, ny = ux;
    this.cheio([[px, py], [bx + nx * w, by + ny * w], [bx - nx * w, by - ny * w]]);
  };
  /* traço oblíquo (terminal de cota) */
  DP.tique = function (x, y, ux, uy) {
    var nx = uy, ny = -ux, tx = (ux + nx) / Math.SQRT2, ty = (uy + ny) / Math.SQRT2, L = 1.1;
    this.linha(x - tx * L, y - ty * L, x + tx * L, y + ty * L, "MET-FINA");
  };
  /* CADEIA DE COTAS: pontos colineares em ordem; off (mm de papel) + = à esquerda do sentido p0→pn;
     valores[i] = texto do trecho i; o = { attrs: [], semExt, desde: [] (afastamento da origem por ponto), h } */
  DP.cadeia = function (P, off, valores, o) {
    o = o || {};
    if (P.length < 2) return;
    var self = this, h = o.h || this.E.T.cota;
    var p0 = P[0], pn = P[P.length - 1], L = hip(pn[0] - p0[0], pn[1] - p0[1]);
    if (L < 1e-6) return;
    var ux = (pn[0] - p0[0]) / L, uy = (pn[1] - p0[1]) / L, nx = uy, ny = -ux;
    var ang = Math.atan2(uy, ux) * 180 / Math.PI, rx = ux, ry = uy;
    if (ang > 90.01 || ang < -90.01) { ang = ang > 0 ? ang - 180 : ang + 180; rx = -ux; ry = -uy; }
    var tnx = ry, tny = -rx, nseg = P.length - 1;
    /* onde ficam a linha de cota e os textos para um afastamento "of" */
    function plano(of) {
      var Q = P.map(function (p) { return [p[0] + nx * of, p[1] + ny * of]; }), alt = 0, ext0 = 1.2, ext1 = 1.2, txs = [];
      /* texto que não cabe no trecho: o 1º e o último saem para fora da cadeia (a linha de cota se estende
         por baixo dele); um do meio vai para logo depois (ou antes) do trecho quando o vizinho tem folga ao lado
         do próprio texto; senão sobe acima da fileira dos textos (alternando duas alturas), longe dos traços */
      function compr(j) { return j < 0 || j >= nseg ? 0 : hip(Q[j + 1][0] - Q[j][0], Q[j + 1][1] - Q[j][1]); }
      function folgaVizinho(j, w0) { var v2 = valores[j], L2 = compr(j), w2 = v2 == null || v2 === "" ? 0 : largTexto(v2, h); return L2 > 0 && w2 + 1.0 <= L2 && (L2 - w2) / 2 >= w0 + 2.4; }
      for (var i = 0; i < nseg; i++) {
        var v = valores[i]; if (v == null || v === "") continue;
        var a = Q[i], b = Q[i + 1], seg = hip(b[0] - a[0], b[1] - a[1]), w = largTexto(v, h), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, sobe = 0.8;
        if (w + 1.0 > seg) {
          if (i === 0 && nseg > 1) { var dd = w / 2 + 1.6; mx = a[0] - ux * dd; my = a[1] - uy * dd; ext0 = Math.max(ext0, w + 2.4); }
          else if (i === nseg - 1 && nseg > 1) { var de = w / 2 + 1.6; mx = b[0] + ux * de; my = b[1] + uy * de; ext1 = Math.max(ext1, w + 2.4); }
          else if (folgaVizinho(i + 1, w)) { mx = b[0] + ux * (w / 2 + 1.6); my = b[1] + uy * (w / 2 + 1.6); alt = 0; }
          else if (folgaVizinho(i - 1, w)) { mx = a[0] - ux * (w / 2 + 1.6); my = a[1] - uy * (w / 2 + 1.6); alt = 0; }
          else if (nseg > 1) { alt++; sobe = 0.8 + h * (alt % 2 ? 1.25 : 2.5); }
        } else alt = 0;
        /* o.evitar: pontos por onde passa uma linha transversal (eixo) — o texto anda ao longo da cota até sair dela */
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
    /* o.offs: outros afastamentos para tentar (o outro lado, mais longe) quando algum texto cai em cima de linha ou texto */
    var pl = plano(off);
    if (o.offs && o.offs.length) {
      var tenta = [off].concat(o.offs), achou = null;
      for (var k = 0; k < tenta.length && !achou; k++) {
        var pk = plano(tenta[k]);
        if (pk.txs.every(function (t) { return self.livreQ(caixaTexto(t[0], t[1], t[2], h, { al: "C", rot: ang }), 0.3); })) achou = pk;
      }
      if (achou) pl = achou;
    }
    var Q = pl.Q, sg = pl.of >= 0 ? 1 : -1, gIni = this.s.length;
    if (!o.semExt) P.forEach(function (p, i) {
      if (o.desde && o.desde[i] === false) return;
      var g0 = o.desde && o.desde[i] != null ? o.desde[i] : 1.0;
      if (Math.abs(pl.of) - g0 < 0.6) return;
      self.linha(p[0] + nx * g0 * sg, p[1] + ny * g0 * sg, Q[i][0] + nx * 1.5 * sg, Q[i][1] + ny * 1.5 * sg, "MET-COTA");
    });
    this.linha(Q[0][0] - ux * pl.ext0, Q[0][1] - uy * pl.ext0, Q[nseg][0] + ux * pl.ext1, Q[nseg][1] + uy * pl.ext1, "MET-COTA");
    Q.forEach(function (q) { self.tique(q[0], q[1], ux, uy); });
    pl.txs.forEach(function (t) { self.texto(t[0], t[1], t[2], h, { al: "C", rot: ang, attr: t[3] }); });
    this.grupoCota("cadeia", P, pl.of, pl.txs.map(function (t) { return t[4]; }), gIni, P.map(function (p, i) {
      if (o.semExt || (o.desde && o.desde[i] === false)) return "x";
      var g0 = o.desde && o.desde[i] != null ? o.desde[i] : 1.0;
      return Math.abs(pl.of) - g0 < 0.6 ? "x" : n(g0);
    }), pl.ext0, pl.ext1);
    return pl.of;   /* o afastamento usado (o pedido ou um dos o.offs): quem põe outra cota por fora precisa dele */
  };
  /* A COTA COMO GRUPO: o SVG é o mesmo (o <g> não desenha nada); o DXF lê o grupo e grava DIMENSION de verdade
     (js/pranchasdxf.js) em vez de traços soltos. data-pts = os pontos medidos; data-off = o afastamento da linha de cota;
     data-seg = os trechos que têm texto, na ordem dos <text> do grupo; data-ext = a folga da linha de chamada em cada ponto
     ("x" = sem linha); data-e = quanto a linha de cota passa do primeiro e do último ponto. */
  DP.grupoCota = function (tipo, P, off, segs, ini, ext, e0, e1) {
    this.s.splice(ini, 0, '<g data-dimgrp="' + tipo + '" data-pts="' + pts(P) + '" data-off="' + n(off) + '" data-seg="' + segs.join(",") + '" data-ext="' + ext.join(",") + '" data-e="' + n(e0) + "," + n(e1) + '">');
    this.s.push("</g>");
  };
  DP.cota = function (x1, y1, x2, y2, off, valor, o) { this.cadeia([[x1, y1], [x2, y2]], off, [valor], o); };
  /* COTA ACUMULADA: origem com círculo, traço em cada ponto e o valor acumulado escrito
     perpendicular à linha, junto de cada linha de chamada, do lado de fora */
  DP.acumulada = function (P, off, valores, o) {
    o = o || {};
    if (P.length < 2) return;
    var self = this, h = o.h || this.E.T.cota;
    var p0 = P[0], pn = P[P.length - 1], L = hip(pn[0] - p0[0], pn[1] - p0[1]);
    var ux = (pn[0] - p0[0]) / L, uy = (pn[1] - p0[1]) / L, nx = uy, ny = -ux, sg = off >= 0 ? 1 : -1;
    var Q = P.map(function (p) { return [p[0] + nx * off, p[1] + ny * off]; }), gIni = this.s.length;
    if (!o.semExt) P.forEach(function (p, i) {
      if (Math.abs(off) < 1.6) return;
      self.linha(p[0] + nx * sg, p[1] + ny * sg, Q[i][0] + nx * 1.5 * sg, Q[i][1] + ny * 1.5 * sg, "MET-COTA");
    });
    this.linha(Q[0][0] - ux * 1.2, Q[0][1] - uy * 1.2, Q[Q.length - 1][0] + ux * 1.2, Q[Q.length - 1][1] + uy * 1.2, "MET-COTA");
    this.circ(Q[0][0], Q[0][1], 0.8, "MET-FINA");
    for (var i = 1; i < Q.length; i++) this.tique(Q[i][0], Q[i][1], ux, uy);
    var angT = Math.atan2(uy, ux) * 180 / Math.PI - 90, a = angT * Math.PI / 180, tdx = Math.cos(a), tdy = Math.sin(a);
    var mesmo = tdx * nx * sg + tdy * ny * sg > 0;
    Q.forEach(function (q, i) {
      var v = valores[i]; if (v == null || v === "") return;
      self.texto(q[0] - ux * 0.8 + nx * sg * 1.2, q[1] - uy * 0.8 + ny * sg * 1.2, v, h, { al: mesmo ? "E" : "D", rot: angT, attr: o.attrs ? o.attrs[i] : "" });
    });
    var com = []; Q.forEach(function (q, i) { if (valores[i] != null && valores[i] !== "") com.push(i); });
    this.grupoCota("acum", P, off, com, gIni, P.map(function () { return Math.abs(off) < 1.6 || o.semExt ? "x" : "1"; }), 1.2, 1.2);
  };
  /* balão de eixo */
  DP.balao = function (cx, cy, rot, attr) {
    var h = this.E.T.eixo, r = Math.max(h * 1.3, largTexto(rot, h) / 2 + 1.3);
    this.circ(cx, cy, r, "MET-FINA");
    this.texto(cx, cy, rot, h, { al: "C", meio: true, attr: attr });
    return r;
  };
  DP.raioBalao = function (rot) { var h = this.E.T.eixo; return Math.max(h * 1.3, largTexto(rot, h) / 2 + 1.3); };
  /* balão de LIGAÇÃO: nº do detalhe em cima, folha embaixo; chamada até o ponto (px,py) */
  DP.marcaLig = function (cx, cy, numero, folha, px, py, alternativas) {
    var r = 4.2, h = this.E.T.eixo;
    if (alternativas && alternativas.length) {
      var lb = this.lugarBalao([[cx, cy]].concat(alternativas).map(function (q) { return { cx: q[0], cy: q[1], px: px, py: py }; }), r);
      cx = lb.cx; cy = lb.cy;
    }
    if (px != null) {
      var dx = px - cx, dy = py - cy, L = hip(dx, dy);
      if (L > r + 0.5) { this.linha(cx + dx / L * r, cy + dy / L * r, px, py, "MET-FINA"); this.ponto(px, py, 0.45); }
    }
    this.circ(cx, cy, r, "MET-TITULO");
    this.linha(cx - r, cy, cx + r, cy, "MET-FINA");
    this.texto(cx, cy - 0.8, String(numero), h, { al: "C", attr: ' data-lig="' + esc(numero) + '"' });
    this.texto(cx, cy + 0.9 + h * 0.62, folha, h * 0.72, { al: "C" });
  };
  /* símbolo de nível: triângulo com o vértice no nível, traço e o valor em cima */
  DP.nivel = function (x, y, valor, lado) {
    var h = this.E.T.nivel, t = 2.2, sg = lado || 1, w = largTexto(valor, h);
    this.poli([[x, y], [x - t * 0.6, y - t], [x + t * 0.6, y - t]], "MET-FINA", true);
    this.cheio([[x, y], [x, y - t], [x + sg * t * 0.6, y - t]]);
    this.linha(x - t * 0.6 * sg, y - t, x + sg * (w + 2.6), y - t, "MET-FINA");
    this.texto(x + sg * 1.4, y - t - 0.8, valor, h, { al: sg > 0 ? "E" : "D" });
  };
  /* chamada (leader): ponto (px,py) → (tx,ty), patamar e textos em cima; linhas = [texto | { t, cor, attr }] */
  DP.chamada = function (px, py, tx, ty, linhas, o) {
    o = o || {};
    var self = this, h = o.h || this.E.T.nota;
    var ls = arr(linhas).map(function (l) { return (l && typeof l === "object") ? l : { t: txt(l) }; }).filter(function (l) { return !!l.t; });
    var wmax = 0; ls.forEach(function (l) { wmax = Math.max(wmax, largTexto(l.t, h)); });
    var lh0 = h * 1.45;
    /* o.alternativas: outros pontos (tx, ty) para o ombro, tentados quando o texto cairia em cima de linha ou texto */
    if (o.alternativas && o.alternativas.length) {
      var cands = [[tx, ty]].concat(o.alternativas), achou = null;
      for (var ic = 0; ic < cands.length && !achou; ic++) {
        var cx0 = cands[ic][0], cy0 = cands[ic][1], dr = cands[ic][2] || o.dir || (cx0 >= px ? 1 : -1);
        var bx = [dr > 0 ? cx0 : cx0 - wmax - 1.6, cy0 - 0.9 - (ls.length - 1) * lh0 - 0.76 * h, dr > 0 ? cx0 + wmax + 1.6 : cx0, cy0 + 0.2];
        if (this.livre(bx, 0.3) && !this.cortaTexto(px, py, cx0, cy0)) achou = cands[ic];
      }
      if (achou) { tx = achou[0]; ty = achou[1]; if (achou[2]) o = Object.keys(o).reduce(function (m, k) { m[k] = o[k]; return m; }, { dir: achou[2] }); if (achou[2]) o.dir = achou[2]; }
    }
    var dir = o.dir || (tx >= px ? 1 : -1), L = hip(tx - px, ty - py) || 1;
    if (o.seta) this.seta(px, py, (tx - px) / L, (ty - py) / L, 1.8); else this.ponto(px, py, 0.4);
    this.linha(px, py, tx, ty, "MET-FINA");
    this.linha(tx, ty, tx + dir * (wmax + 1.6), ty, "MET-FINA");
    var lh = h * 1.45;
    ls.forEach(function (l, i) { self.texto(tx + dir * 0.8, ty - 0.9 - (ls.length - 1 - i) * lh, l.t, h, { al: dir > 0 ? "E" : "D", cor: l.cor, attr: l.attr }); });
    return { w: wmax + 1.6, h: ls.length * lh };
  };
  /* bloco de texto (linhas soltas): devolve a altura */
  DP.textos = function (x, y, linhas, h, o) {
    o = o || {}; var self = this, lh = h * (o.entre || 1.45), yy = y;
    arr(linhas).forEach(function (l) {
      var it = (l && typeof l === "object") ? l : { t: txt(l) };
      if (!it.t) { yy += lh * 0.5; return; }
      var ls = o.wmax ? quebrar(it.t, h, o.wmax) : [it.t];
      ls.forEach(function (s, k) { self.texto(x + (k ? (o.recuo || 0) : 0), yy + h * 0.76, s, h, { cor: it.cor, attr: k ? "" : it.attr, al: o.al }); yy += lh; });
    });
    return yy - y;
  };
  /* SÍMBOLO DE SOLDA (AWS A2.4): seta em (px,py); a linha da seta sai no ângulo `ang` (graus, papel) com
     comprimento ls até a linha de referência horizontal (lr, para a direita; o.esquerda = para a esquerda).
     o = { perna, lados: "seta"|"outro"|"ambos", contorno, campo, comp (texto), cauda (texto) } */
  DP.solda = function (px, py, ang, o) {
    o = o || {};
    var h = this.E.T.cota * 0.9;
    if (o.alternativas && o.alternativas.length) {
      /* caixas do triângulo e dos textos de uma configuração, para saber se cabem sem cortar nada */
      var self = this, wp = largTexto(txt(o.perna), h), wc = o.comp ? largTexto(o.comp, h) : 0, ld = o.lados || "seta";
      var cfgs = [{ ang: ang, ls: o.ls, lr: o.lr, esquerda: o.esquerda }].concat(o.alternativas), achou = null;
      for (var ic = 0; ic < cfgs.length && !achou; ic++) {
        var c = cfgs[ic], ac = c.ang * Math.PI / 180, lsc = c.ls || 8, lrc = c.lr || 15, dc = c.esquerda ? -1 : 1;
        var jx0 = px + Math.cos(ac) * lsc, jy0 = py + Math.sin(ac) * lsc, ex0 = jx0 + dc * lrc, xs0 = dc > 0 ? jx0 + lrc * 0.45 : ex0 + lrc * 0.45, cx = [];
        cx.push([xs0, jy0 - 2.0, xs0 + 2.0, jy0 + 2.0]);
        if (ld === "seta" || ld === "ambos") cx.push([xs0 - 0.7 - wp, jy0 + 1.9 - 0.76 * h, xs0 - 0.7, jy0 + 1.9 + 0.18 * h]);
        if (ld === "outro" || ld === "ambos") cx.push([xs0 - 0.7 - wp, jy0 - 0.55 - 0.76 * h, xs0 - 0.7, jy0 - 0.55 + 0.18 * h]);
        if (wc) cx.push([xs0 + 2.8, jy0 + 1.9 - 0.76 * h, xs0 + 2.8 + wc, jy0 + 1.9 + 0.18 * h]);
        if (cx.every(function (b) { return self.livre(b, 0.25); }) && !self.cortaTexto(px, py, jx0, jy0) && !self.cortaTexto(jx0, jy0, ex0, jy0)) achou = c;
      }
      if (achou) { ang = achou.ang; o = Object.keys(o).reduce(function (m, k) { m[k] = o[k]; return m; }, {}); o.ls = achou.ls; o.lr = achou.lr; o.esquerda = achou.esquerda; }
    }
    var a = ang * Math.PI / 180, ls = o.ls || 8, jx = px + Math.cos(a) * ls, jy = py + Math.sin(a) * ls;
    this.linha(px, py, jx, jy, "MET-FINA");
    this.seta(px, py, Math.cos(a), Math.sin(a), 1.8);
    var dir = o.esquerda ? -1 : 1, lr = o.lr || 15, ex = jx + dir * lr;
    this.linha(jx, jy, ex, jy, "MET-FINA");
    var t = 2.0, xs = dir > 0 ? jx + lr * 0.45 : ex + lr * 0.45, lados = o.lados || "seta";
    if (o.chanfro) {
      /* AWS A2.4 — chanfro em bisel (penetração total): perna perpendicular à linha de referência e perna inclinada,
         as duas saindo da linha; dos dois lados = K. A cauda leva "CJP" (o cálculo pediu penetração total). */
      if (lados === "seta" || lados === "ambos") { this.linha(xs, jy, xs, jy + t, "MET-FINA"); this.linha(xs, jy, xs + t, jy + t, "MET-FINA"); }
      if (lados === "outro" || lados === "ambos") { this.linha(xs, jy, xs, jy - t, "MET-FINA"); this.linha(xs, jy, xs + t, jy - t, "MET-FINA"); }
    } else {
      if (lados === "seta" || lados === "ambos") this.poli([[xs, jy], [xs, jy + t], [xs + t, jy]], "MET-FINA", true);
      if (lados === "outro" || lados === "ambos") this.poli([[xs, jy], [xs, jy - t], [xs + t, jy]], "MET-FINA", true);
    }
    var pr = o.chanfro ? "" : txt(o.perna);
    if (lados === "seta" || lados === "ambos") this.texto(xs - 0.7, jy + t * 0.95, pr, h, { al: "D" });
    if (lados === "outro" || lados === "ambos") this.texto(xs - 0.7, jy - 0.55, pr, h, { al: "D" });
    if (o.comp) {
      if (lados === "seta" || lados === "ambos") this.texto(xs + t + 0.8, jy + t * 0.95, o.comp, h);
      if (lados === "outro") this.texto(xs + t + 0.8, jy - 0.55, o.comp, h);
    }
    if (o.contorno) this.circ(jx, jy, 1.0, "MET-FINA");
    if (o.campo) { this.linha(jx, jy, jx, jy - 3.4, "MET-FINA"); this.cheio([[jx, jy - 3.4], [jx + 2.2, jy - 2.8], [jx, jy - 2.2]]); }
    if (o.cauda) {
      this.linha(ex, jy, ex + dir * 1.5, jy - 1.5, "MET-FINA"); this.linha(ex, jy, ex + dir * 1.5, jy + 1.5, "MET-FINA");
      this.texto(ex + dir * 2.3, jy, o.cauda, h, { al: dir > 0 ? "E" : "D", meio: true });
    }
  };
  /* linha de interrupção (o "Z" no meio) */
  DP.quebra = function (x1, y1, x2, y2) {
    var L = hip(x2 - x1, y2 - y1); if (L < 1e-6) return;
    var ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    this.poli([[x1 - ux * 1.5, y1 - uy * 1.5], [mx - ux * 1.2, my - uy * 1.2], [mx - ux * 0.4 + nx * 1.6, my - uy * 0.4 + ny * 1.6],
               [mx + ux * 0.4 - nx * 1.6, my + uy * 0.4 - ny * 1.6], [mx + ux * 1.2, my + uy * 1.2], [x2 + ux * 1.5, y2 + uy * 1.5]], "MET-FINA", false);
  };
  /* hachura a 45° num retângulo */
  /* trecho [t0,t1] (0..1) do segmento dentro da caixa bx, ou null */
  function dentroCaixa(sg, bx) {
    var t0 = 0, t1 = 1, dx = sg[2] - sg[0], dy = sg[3] - sg[1], pp = [-dx, dx, -dy, dy], qq = [sg[0] - bx[0], bx[2] - sg[0], sg[1] - bx[1], bx[3] - sg[1]];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(pp[i]) < 1e-12) { if (qq[i] < 0) return null; continue; }
      var t = qq[i] / pp[i]; if (pp[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t1 - t0 > 1e-9 ? [t0, t1] : null;
  }
  /* a caixa bx = [x0, y0, x1, y1] (papel) está livre: nenhum traço a atravessa e nenhum texto a cobre (folga g) */
  DP.livre = function (bx, g) {
    g = g == null ? 0.4 : g;
    var b = [bx[0] - g, bx[1] - g, bx[2] + g, bx[3] + g];
    for (var i = 0; i < this.tb.length; i++) { var t = this.tb[i]; if (t[0] < b[2] && t[2] > b[0] && t[1] < b[3] && t[3] > b[1]) return false; }
    for (var j = 0; j < this.sg.length; j++) if (dentroCaixa(this.sg[j], b)) return false;
    return true;
  };
  /* o traço (x1,y1)-(x2,y2) passaria por cima de algum texto já escrito? */
  DP.cortaTexto = function (x1, y1, x2, y2) {
    for (var i = 0; i < this.tb.length; i++) { var t = this.tb[i]; if (dentroCaixa([x1, y1, x2, y2], [t[0] - 0.2, t[1] - 0.2, t[2] + 0.2, t[3] + 0.2])) return true; }
    return false;
  };
  /* primeiro lugar de balão (raio r) com o círculo livre e a chamada até (px, py) sem cortar texto; cands = [{ cx, cy, px, py }] */
  DP.lugarBalao = function (cands, r) {
    r = r || 4.2;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!this.livre([c.cx - r, c.cy - r, c.cx + r, c.cy + r], 0.4)) continue;
      if (c.px == null) return c;
      var dx = c.px - c.cx, dy = c.py - c.cy, L = hip(dx, dy);
      if (L <= r + 0.5 || !this.cortaTexto(c.cx + dx / L * r, c.cy + dy / L * r, c.px, c.py)) return c;
    }
    return cands[0];
  };
  /* rótulo vertical (rot -90) à direita de uma das linhas dadas [[x, yA, yB] em papel], no primeiro trecho livre;
     se o texto inteiro não couber em lugar nenhum, tenta o curto (só a marca) */
  DP.rotuloLinha = function (linhas, textos, h) {
    for (var it = 0; it < textos.length; it++) {
      for (var il = 0; il < linhas.length; il++) {
        var L = linhas[il], xq = L[0] + 1.2 + h * 0.76, ya = Math.min(L[1], L[2]), yb = Math.max(L[1], L[2]), ym = (ya + yb) / 2;
        for (var dy = 0; dy <= (yb - ya) / 2; dy += 0.5) {
          var cs = dy ? [ym - dy, ym + dy] : [ym];
          for (var ic = 0; ic < cs.length; ic++) if (this.livreQ(caixaTexto(xq, cs[ic], textos[it], h, { al: "C", rot: -90 }), 0.3)) { this.texto(xq, cs[ic], textos[it], h, { al: "C", rot: -90 }); return true; }
        }
      }
    }
    return false;
  };
  /* centro de uma caixa w x h livre (DP.livre) dentro de area = [x0, y0, x1, y1], o mais perto de pref; null se não houver */
  DP.procura = function (pref, w, h, area, o) {
    o = o || {};
    var passo = o.passo || 1.0, g = o.folga == null ? 0.4 : o.folga, best = null, bd = 1e18;
    for (var yy = area[1] + h / 2; yy <= area[3] - h / 2 + 1e-9; yy += passo)
      for (var xx = area[0] + w / 2; xx <= area[2] - w / 2 + 1e-9; xx += passo) {
        var dd = (xx - pref[0]) * (xx - pref[0]) + (yy - pref[1]) * (yy - pref[1]);
        if (dd < bd && this.livre([xx - w / 2, yy - h / 2, xx + w / 2, yy + h / 2], g)) { bd = dd; best = [xx, yy]; }
      }
    return best;
  };
  /* texto (al C, meio) no lugar livre mais perto de pref; sem lugar livre, fica em pref */
  DP.textoLivre = function (pref, s, h, area, o) {
    o = o || {};
    var w = largTexto(s, h), c = this.procura([pref[0], pref[1] + 0.08 * h], w, 0.94 * h, area, o) || [pref[0], pref[1] + 0.08 * h];
    this.texto(c[0], c[1] - 0.08 * h, s, h, { al: "C", meio: true, cor: o.cor, attr: o.attr });
    return [c[0] - w / 2, c[1] - 0.47 * h, c[0] + w / 2, c[1] + 0.47 * h];
  };
  DP.hachura = function (x, y, w, h, passo, cam, furos) {
    passo = passo || 1.5;
    for (var c0 = -h + passo / 2; c0 < w; c0 += passo) {
      var xa = x + c0, ya = y + h, t0 = Math.max(0, x - xa), t1 = Math.min(h, x + w - xa);
      if (t1 <= t0 + 0.05) continue;
      /* furos (caixas onde vai texto): a linha da hachura é interrompida dentro deles */
      var sg = [xa + t0, ya - t0, xa + t1, ya - t1], partes = [[0, 1]];
      (furos || []).forEach(function (fb) {
        var di = dentroCaixa(sg, fb); if (!di) return;
        var nv = []; partes.forEach(function (p) { if (di[1] <= p[0] || di[0] >= p[1]) nv.push(p); else { if (di[0] > p[0]) nv.push([p[0], di[0]]); if (di[1] < p[1]) nv.push([di[1], p[1]]); } });
        partes = nv;
      });
      for (var ip = 0; ip < partes.length; ip++) {
        var pa = partes[ip]; if ((pa[1] - pa[0]) * (t1 - t0) < 0.05) continue;
        this.linha(sg[0] + (sg[2] - sg[0]) * pa[0], sg[1] + (sg[3] - sg[1]) * pa[0], sg[0] + (sg[2] - sg[0]) * pa[1], sg[1] + (sg[3] - sg[1]) * pa[1], cam || "MET-HACHURA");
      }
    }
  };
  /* seção I cortada (cheia), centro (cx,cy); dimensões já em mm de papel; rot = 90 → alma horizontal */
  DP.secaoI = function (cx, cy, d, bf, tw, tf, o) {
    o = o || {};
    var mn = o.min || 0.25; tw = Math.max(tw, mn); tf = Math.max(tf, mn);
    var a = bf / 2, b = d / 2, c = tw / 2, e = b - tf;
    var P = [[-a, -b], [a, -b], [a, -e], [c, -e], [c, e], [a, e], [a, b], [-a, b], [-a, e], [-c, e], [-c, -e], [-a, -e]];
    if (o.rot) P = P.map(function (p) { return [-p[1], p[0]]; });
    this.cheio(P.map(function (p) { return [cx + p[0], cy + p[1]]; }), o.cor, o.attr);
  };
  /* retângulo girado: de (px,py) ao longo de (ux,uy) por `comp`, meia-largura hw */
  DP.retRot = function (px, py, ux, uy, comp, hw, cam, cheio) {
    var nx = -uy, ny = ux, P = [[px + nx * hw, py + ny * hw], [px + ux * comp + nx * hw, py + uy * comp + ny * hw], [px + ux * comp - nx * hw, py + uy * comp - ny * hw], [px - nx * hw, py - ny * hw]];
    if (cheio) this.cheio(P); else this.poli(P, cam || "MET-SECUNDARIO", true);
  };
  /* PARAFUSO de lado: cabeça apoiada em A, porca do lado de B (A→B = eixo); pf = do js/metalnorma.js (mm); k = papel/mm */
  DP.parafuso = function (ax, ay, bx, by, pf, k) {
    var L = hip(bx - ax, by - ay); if (L < 1e-6 || !pf) return;
    var ux = (bx - ax) / L, uy = (by - ay) / L, r = pf.d / 2 * k, hk = pf.k * k, sw = pf.s / 2 * k, hw = pf.arr.h * k, rw = pf.arr.d2 / 2 * k, hm = pf.m * k, pj = 3 * pf.passo * k;
    this.retRot(ax - ux * hk, ay - uy * hk, ux, uy, hk, sw, "MET-SECUNDARIO");
    this.retRot(bx, by, ux, uy, hw, rw, "MET-SECUNDARIO");
    this.retRot(bx + ux * hw, by + uy * hw, ux, uy, hm, sw, "MET-SECUNDARIO");
    var fim = L + hw + hm + pj, nx = -uy, ny = ux;
    this.linha(ax + nx * r, ay + ny * r, ax + ux * fim + nx * r, ay + uy * fim + ny * r, "MET-SECUNDARIO");
    this.linha(ax - nx * r, ay - ny * r, ax + ux * fim - nx * r, ay + uy * fim - ny * r, "MET-SECUNDARIO");
    this.linha(ax + ux * fim + nx * r, ay + uy * fim + ny * r, ax + ux * fim - nx * r, ay + uy * fim - ny * r, "MET-SECUNDARIO");
  };
  /* furo visto de frente: círculo + cruz de centro */
  DP.furo = function (cx, cy, r) {
    this.circ(cx, cy, r, "MET-SECUNDARIO");
    this.linha(cx - r - 0.9, cy, cx + r + 0.9, cy, "MET-COTA");
    this.linha(cx, cy - r - 0.9, cx, cy + r + 0.9, "MET-COTA");
  };
  /* TABELA: cols [{ t: "TÍTULO" | ["L1","L2"], w, al }]; linhas [[células] | { titulo, attr } | { total: [..] }];
     célula: texto ou { t, cor, attr }; o = { fs, fsc, hl, grupos: [{ t, de, ate }] } → { w, h } */
  DP.tabela = function (x, y, cols, linhas, o) {
    o = o || {};
    var self = this, T = this.E.T, fs = o.fs || T.tabela, fsc = o.fsc || T.tabelaCab, hl = o.hl || Math.max(4.4, fs * 1.85);
    var W = 0; cols.forEach(function (c) { W += c.w; });
    var nlc = 1; cols.forEach(function (c) { if (Array.isArray(c.t)) nlc = Math.max(nlc, c.t.length); });
    var gr = arr(o.grupos), hg = gr.length ? fsc * 1.5 + 2.2 : 0, hc = nlc * fsc * 1.3 + 2.4;
    var emG = cols.map(function () { return false; });
    gr.forEach(function (g) { for (var j = g.de; j <= g.ate; j++) emG[j] = true; });
    function cabe(t, h, w) { var lt = largTexto(t, h); return lt > w - 1.0 ? Math.max(T.minimo || 1.5, h * (w - 1.0) / lt) : h; }
    var xc = x;
    cols.forEach(function (c, j) {
      var y0 = emG[j] ? y + hg : y, hh = emG[j] ? hc : hg + hc;
      self.ret(xc, y0, c.w, hh, "MET-TABELA");
      var ls = Array.isArray(c.t) ? c.t : [c.t], lh = fsc * 1.3, yt = y0 + hh / 2 - (ls.length - 1) * lh / 2;
      ls.forEach(function (t, q) { self.texto(xc + c.w / 2, yt + q * lh, t, cabe(t, fsc, c.w), { al: "C", meio: true }); });
      xc += c.w;
    });
    gr.forEach(function (g) {
      var gx = x, gw = 0, j;
      for (j = 0; j < g.de; j++) gx += cols[j].w;
      for (j = g.de; j <= g.ate; j++) gw += cols[j].w;
      self.ret(gx, y, gw, hg, "MET-TABELA");
      self.texto(gx + gw / 2, y + hg / 2, g.t, cabe(g.t, fsc, gw), { al: "C", meio: true });
    });
    var yy = y + hg + hc;
    arr(linhas).forEach(function (L) {
      if (L && L.titulo != null) {
        self.ret(x, yy, W, hl, "MET-TABELA");
        self.texto(x + 1.5, yy + hl / 2, L.titulo, fs, { meio: true, attr: L.attr || "", cor: L.cor });
        yy += hl; return;
      }
      var cel = (L && L.total) || L, xx = x;
      cols.forEach(function (c, j) {
        var v = cel[j], t = (v && typeof v === "object") ? txt(v.t) : txt(v), cor = v && typeof v === "object" ? v.cor : null, at = v && typeof v === "object" ? v.attr : "";
        self.ret(xx, yy, c.w, hl, "MET-TABELA");
        if (t) {
          var h2 = cabe(t, fs, c.w), al = c.al || "C", tx = al === "E" ? xx + 0.9 : (al === "D" ? xx + c.w - 0.9 : xx + c.w / 2);
          self.texto(tx, yy + hl / 2, t, h2, { al: al, meio: true, cor: cor, attr: at });
        }
        xx += c.w;
      });
      yy += hl;
    });
    return { w: W, h: yy - y };
  };
  DP.svg = function () { return this.s.join(""); };

  /* título de vista (sem sublinhado — Padrão RA v2): nome e, embaixo, a escala; numero = círculo do detalhe */
  function tituloVista(D, x, y, titulo, escala, numero) {
    var T = D.E.T, xx = x, top = y;
    if (numero != null) {
      var r = 4.4; D.circ(x + r, y + r, r, "MET-TITULO");
      D.texto(x + r, y + r, String(numero), T.detalhe, { al: "C", meio: true, attr: ' data-detalhe="' + numero + '"' });
      xx = x + 2 * r + 2.4; top = y + r - (T.titulo * 0.76 + (escala ? T.escala * 1.3 + 1.0 : 0)) / 2;
    }
    D.texto(xx, top + T.titulo * 0.76, titulo, T.titulo, { peso: 0.16, attr: ' data-titulo="1"' });
    if (escala) D.texto(xx, top + T.titulo * 0.76 + T.escala * 1.3 + 0.9, escala, T.escala);
    return Math.max(numero != null ? 8.8 : 0, (top - y) + T.titulo * 0.76 + (escala ? T.escala * 1.3 + 1.6 : 0.8)) + 1.0;
  }

  /* ================================================================ O MODELO PARA O DESENHO */
  function perfilSec(r, tipo) {
    var G = r.modelo || {}, cands = [];
    var o = r[tipo + "s"] || r[tipo];
    if (o && typeof o === "object") cands.push({ nome: o.perfil || o.nome, massa: o.massa });
    var g = (r.grupos || {})[tipo]; if (g) cands.push({ nome: g.perfil, massa: g.massa });
    var s = (G.secoes || {})[tipo]; if (s && s.mm) cands.push({ nome: s.nome, massa: s.massa });
    var p = ((G.par || {}).perfis || {})[tipo]; if (p && p !== "auto") cands.push({ nome: p, massa: null });
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c.nome && !/escora|^auto$/i.test(String(c.nome))) {
        var m = num(c.massa, null);
        if (m == null && CAT()) { try { var q = CAT().obter(c.nome); if (q) m = num(q.massa, null); } catch (e) { m = null; } }
        return { nome: String(c.nome), massa: m };
      }
    }
    return null;
  }

  function extrair(r, avisos) {
    var G = r.modelo, L = G.layout, mod = G.modelo, par = G.par || r.parametros || {}, d = { r: r, G: G, L: L, par: par };
    d.vao = num(L.vao, 0); d.Lt = num(L.Lt, 0); d.H = num(L.H, 0); d.i = num(L.i, 0); d.aguas = num(L.aguas, 2) === 1 ? 1 : 2;
    d.th = num(L.th, Math.atan(d.i)); d.co = Math.cos(d.th);
    d.zs = arr(L.zs).map(Number); d.nV = Math.max(0, d.zs.length - 1); d.esp = num(L.esp, d.nV ? d.Lt / d.nV : d.Lt);
    d.nos = {}; arr(mod.nos).forEach(function (q) { d.nos[q.id] = q; });
    d.apoios = {}; arr(mod.apoios).forEach(function (a) { d.apoios[a.no] = a; });
    d.yT = function (x) { return d.aguas === 2 ? d.H + d.i * Math.min(x, d.vao - x) : d.H + d.i * x; };
    d.meio = d.aguas === 2 ? d.vao / 2 : d.vao;
    var mem = arr(G.membros);
    function secMM(m) { return (m && m.secao && m.secao.mm) || {}; }
    function eixoK(z) { var best = 0, dm = 1e9; d.zs.forEach(function (zz, k) { var e = Math.abs(zz - z); if (e < dm) { dm = e; best = k; } }); return best; }
    /* filas = as linhas de pilares ao longo do comprimento (A, B…) */
    var pils = mem.filter(function (m) { return m.papel === "pilar"; }), xs = [];
    pils.forEach(function (m) { var b = d.nos[m.nos[0]]; if (b && !xs.some(function (x) { return Math.abs(x - b.x) < 1e-6; })) xs.push(b.x); });
    xs.sort(function (a, b) { return a - b; });
    d.filas = xs.map(function (x, i) { return { x: x, letra: String.fromCharCode(65 + i) }; });
    function letra(x) { for (var i = 0; i < d.filas.length; i++) if (Math.abs(d.filas[i].x - x) < 1e-6) return d.filas[i].letra; return "?"; }
    d.pilares = pils.map(function (m) {
      var b = d.nos[m.nos[0]] || { x: 0, z: 0 };
      return { id: m.id, m: m, x: b.x, z: b.z, k: m.k != null ? m.k : eixoK(b.z), fila: letra(b.x), base: m.nos[0], sec: secMM(m), perfil: m.secao ? m.secao.nome : "", L: num(m.L, 0), aco: m.aco };
    }).sort(function (a, b) { return (a.x - b.x) || (a.z - b.z); });
    d.pilares.forEach(function (p, i) { p.marca = "P" + (i + 1); p.eixo = p.fila + "-" + (p.k + 1); });
    d.taps = mem.filter(function (m) { return m.papel === "tapamento"; }).map(function (m) {
      var b = d.nos[m.nos[0]] || { x: num(m.x, 0), z: 0 };
      return { id: m.id, m: m, x: b.x, z: b.z, k: m.k != null ? m.k : eixoK(b.z), base: m.nos[0], sec: secMM(m), perfil: m.secao ? m.secao.nome : "", L: num(m.L, 0), aco: m.aco };
    }).sort(function (a, b) { return (a.z - b.z) || (a.x - b.x); });
    d.taps.forEach(function (t, i) { t.marca = "CT" + (i + 1); t.eixo = (t.k + 1) + " (A+" + mm(t.x) + ")"; });
    /* tipos de base: perfil + vinculação */
    var tipos = {}, ordem = [];
    function tipoBase(no) { var a = d.apoios[no] || {}; return (a.rz || a.rx) ? "engastada" : "rotulada"; }
    d.pilares.concat(d.taps).forEach(function (p) {
      p.tipoBase = tipoBase(p.base);
      var ch = p.perfil + "|" + p.tipoBase;
      if (!tipos[ch]) { tipos[ch] = { marca: "PB" + (ordem.length + 1), perfil: p.perfil, sec: p.sec, tipo: p.tipoBase, pecas: [], bases: [], ids: [] }; ordem.push(ch); }
      tipos[ch].pecas.push(p.marca); tipos[ch].bases.push(p.base); tipos[ch].ids.push(p.id); p.marcaBase = tipos[ch].marca;
    });
    d.tiposBase = ordem.map(function (k) { return tipos[k]; });
    d.vigas = mem.filter(function (m) { return m.papel === "viga"; }).map(function (m) {
      return { id: m.id, m: m, k: m.k, lado: /R$/.test(m.id) ? 1 : 0, sec: secMM(m), perfil: m.secao ? m.secao.nome : "", L: num(m.L, 0), aco: m.aco,
               mf: arr(m.maosFrancesas).map(Number), oitao: m.k === 0 || m.k === d.nV };
    });
    var temOit = d.vigas.some(function (v) { return v.oitao; }), temInt = d.vigas.some(function (v) { return !v.oitao; });
    d.vigas.forEach(function (v) { v.marca = temOit && temInt && v.oitao ? "V2" : "V1"; });
    /* mãos-francesas: posições do cálculo (membro.maosFrancesas, m ao longo da barra) */
    d.mf = [];
    d.vigas.forEach(function (v) { v.mf.forEach(function (s) { var X = v.lado ? d.vao - s * d.co : s * d.co; d.mf.push({ tipo: "viga", membro: v.id, k: v.k, lado: v.lado, s: s, X: X, Z: d.zs[v.k], Y: d.yT(X) }); }); });
    d.pilares.forEach(function (p) { arr(p.m.maosFrancesas).forEach(function (s) { d.mf.push({ tipo: "pilar", membro: p.id, k: p.k, lado: p.fila === "A" ? 0 : 1, s: +s, X: p.x, Z: p.z, Y: +s }); }); });
    /* contraventamento (barras só de tração) */
    d.cv = arr(mod.barras).filter(function (b) { return b.papel === "contravento"; }).map(function (b) {
      var a = d.nos[b.i], c = d.nos[b.j]; if (!a || !c) return null;
      var parede = Math.abs(a.x - c.x) < 1e-6 && Math.abs(a.y - c.y) > 1e-6;
      return { id: b.id, a: a, c: c, L: hip(hip(c.x - a.x, c.y - a.y), c.z - a.z), tipo: parede ? "parede" : "cobertura", k: eixoK(Math.min(a.z, c.z)) };
    }).filter(function (x) { return !!x; });
    var grpCV = {}, cont = { parede: 0, cobertura: 0 };
    d.cv.forEach(function (cv) { var ch = cv.tipo + "|" + Math.round(cv.L * 1000); if (!grpCV[ch]) { cont[cv.tipo]++; grpCV[ch] = (cv.tipo === "parede" ? "CV" : "CH") + cont[cv.tipo]; } cv.marca = grpCV[ch]; });
    d.tercas = arr(G.linhasTerca).map(function (t) { return { x: num(t.x, 0), beiral: !!t.beiral, cumeeira: d.aguas === 2 && Math.abs(num(t.x, 0) - d.vao / 2) < 1e-6 }; })
      .sort(function (a, b) { return a.x - b.x; });
    d.tercas.forEach(function (t) { t.marca = t.beiral ? "TB1" : "TC1"; });
    d.travE = arr(L.travE).map(Number); d.travD = arr(L.travD).map(Number); d.travF = arr(L.travF).map(Number); d.travB = arr(L.travB).map(Number);
    d.tapF = arr(L.tapF).map(Number); d.tapB = arr(L.tapB).map(Number); d.vaosCV = arr(L.vaosCV).map(Number);
    d.fech = par.fechamentos || {};
    var sc = G.secoes || {};
    d.secP = (sc.pilar && sc.pilar.mm) || (d.pilares[0] && d.pilares[0].sec) || {};
    d.secV = (sc.viga && sc.viga.mm) || (d.vigas[0] && d.vigas[0].sec) || {};
    d.secT = (sc.tapamento && sc.tapamento.mm) || (d.taps[0] && d.taps[0].sec) || {};
    d.cvSec = sc.contravento || null;
    d.cvNome = (sc.contravento && sc.contravento.nome) || ((G.grupos || {}).contravento || {}).perfil || "";
    /* terças e travessas (NBR 14762, js/acosecundarias.js): perfil, massa e as linhas de correntes/tirantes por vão */
    function sec2(o) { return o && o.perfil ? { nome: String(o.perfil), massa: num(o.massa, null), linhas: o.linhas != null ? Math.max(0, Math.round(num(o.linhas, 0))) : null, entre: num(o.entreLinhas, null), razao: num(o.razao, null), secao: o.secao || null, peso: num(o.pesoTotal, null), lt: barraLT(o.linhaTirante) } : null; }
    var trv = r.travessas && typeof r.travessas === "object" ? r.travessas : null;
    d.tercaInfo = sec2(r.tercas); d.perfilTerca = d.tercaInfo || perfilSec(r, "terca");
    d.trvLat = sec2(trv && trv.lateral) || (trv ? null : perfilSec(r, "travessa")); d.trvOit = sec2(trv && trv.oitao) || (trv ? null : d.trvLat); d.perfilTravessa = d.trvLat;
    d.perfilMF = perfilSec(r, "maoFrancesa");
    function linhasPos(nl) { var ps = []; for (var j = 1; j <= nl; j++) ps.push(j / (nl + 1)); return ps; }
    if (d.tercaInfo && d.tercaInfo.linhas != null) d.correntes = { calc: true, linhas: d.tercaInfo.linhas, posicoes: linhasPos(d.tercaInfo.linhas), entre: d.tercaInfo.entre };
    else { var corr = r.correntes || L.correntes; d.correntes = corr && typeof corr === "object" ? corr : null; }
    d.tirLat = d.trvLat && d.trvLat.linhas ? linhasPos(d.trvLat.linhas) : []; d.tirOit = d.trvOit && d.trvOit.linhas ? linhasPos(d.trvOit.linhas) : [];
    /* diâmetros do cálculo: correntes (terças), tirantes laterais (TR1) e do oitão (TR2) */
    d.ltCR = d.tercaInfo ? d.tercaInfo.lt : null; d.ltTR1 = d.trvLat && d.trvLat.lt ? d.trvLat.lt : null; d.ltTR2 = d.trvOit && d.trvOit.lt ? d.trvOit.lt : null;
    return d;
  }

  /* ================================================================ LIGAÇÕES
   * Vale o que o CÁLCULO dimensionou (r.ligacoes — js/acoligcalc.js: placa de
   * base, joelho, cumeeira, clip de terça, contraventamento), com o
   * aproveitamento e a verificação que governa. O que o cálculo não trouxer
   * sai com os valores de PARTIDA das macros do js/metalligacao.js e das
   * regras do js/metalnorma.js (as mesmas que a Metálica põe no modelo) e a
   * nota "dimensões de partida - conferir no memorial" — nunca como
   * dimensionado. Cada ligação devolvida leva `calc` (true/false). */
  function ligacoes(d, r, avisos) {
    var N = NR();
    if (!N) { avisos.push("Regras de ligação (js/metalnorma.js) não carregadas: os detalhes saem sem as dimensões das ligações."); return null; }
    var LC = (r && r.ligacoes && typeof r.ligacoes === "object") ? r.ligacoes : {}, o = { fonte: "", calculadas: 0, partida: 0 };
    function info(L) { return { calc: true, ok: L.ok !== false, razao: num(L.razao, null), governante: txt(L.governante), resumo: txt(L.resumo), notas: arr(L.notas).map(txt), sugestao: txt(L.sugestao) }; }
    function mesclar(a, b) { Object.keys(b).forEach(function (k) { a[k] = b[k]; }); return a; }
    function pf0(id, reserva) { return N.parafuso(id) || N.parafuso(reserva); }
    /* ---------------- placa de base */
    function basePartida(sec) {
      var pf = N.parafuso('3/4"'), db = pf.d, pt = N.partida(db, "laminada"), e = Math.max(pt.borda, cima5(N.bordaMin(db, "laminada").e));
      var B = Math.ceil((num(sec.bf, 100) + 150) / 10 - 1e-9) * 10, Nn = Math.ceil((num(sec.d, 100) + 150) / 10 - 1e-9) * 10, t = 25;
      var comp = N.comprimento({ id: pf.id, aperto: t, arruelas: 1, ancoragem: 425 });
      return { calc: false, B: B, N: Nn, t: t, e: e, pf: pf, db: db, furo: N.furo(db, "alargado").d, n: 4, classe: "ASTM F1554 Gr.36", ancoragem: 400, graute: 25, gancho: false,
               Lc: comp ? comp.L : null, perna: Math.max(N.soldaMin(Math.min(t, Math.min(num(sec.tf, t), num(sec.tw, t)))).perna, 5) };
    }
    function baseCalc(L) {
      var dm = L.dimensoes || {}, ch = dm.chumbadores || {}, ds = L.desenho || {}, pf = pf0(ch.id || ds.parafuso, '3/4"');
      var t = num(dm.t, 25), anc = num(ch.ancoragem, num(ds.ancoragem, 0.4) * 1000), gr = num(ds.graute, 0.025) * 1000;
      var comp = N.comprimento({ id: pf.id, aperto: t, arruelas: 1, ancoragem: anc + gr });
      return mesclar(info(L), { B: num(dm.B, num(ds.B, 0) * 1000), N: num(dm.L, num(ds.N, 0) * 1000), t: t, e: num(ch.borda, num(ds.borda, 40)), pf: pf, db: pf.d,
        furo: N.furo(pf.d, ds.furo || "alargado").d, n: num(ch.n, num(ds.nChumb, 4)), porLado: Math.max(2, Math.round(num(ch.porLado, num(ds.porLado, 2)))), classe: ch.material || "ASTM F1554 Gr.36", ancoragem: anc, lb: num(ch.lb, null),
        gancho: /gancho/i.test(txt(L.resumo)), graute: gr, Lc: comp ? comp.L : null, perna: num(dm.solda, 5), cjp: /penetra/i.test(String(dm.soldaMesas || "")) });
    }
    o.bases = {};
    d.tiposBase.forEach(function (tb) {
      var achou = null;
      Object.keys(LC).forEach(function (k) { var L = LC[k]; if (!achou && L && L.dimensoes && arr(L.membros).some(function (id) { return tb.ids.indexOf(id) >= 0; })) achou = L; });
      o.bases[tb.marca] = achou ? baseCalc(achou) : basePartida(tb.sec);
    });
    /* ---------------- joelho e cumeeira (chapa de extremidade) */
    var sv = d.secV, sp = d.secP, dV = num(sv.d, 300), tfV = num(sv.tf, 10);
    function linhasDe(pf, nl, ext, borda) {   /* as linhas de parafusos da macro chapaExtremidade (metalligacao.js) */
      var c1 = tfV + Math.max(35, pf.arr.d2 / 2 + 8), zona = dV - 2 * c1, vs = [];
      if (nl <= 1 || zona <= 0) vs.push(0); else for (var i = 0; i < nl; i++) vs.push(zona / 2 - i * zona / (nl - 1));
      if (ext >= 2 * borda - 1e-6) { vs.unshift(dV / 2 + ext - borda); vs.push(-(dV / 2 + ext - borda)); }
      return vs;
    }
    function topoPartida(cume) {
      var pf = N.parafuso("M20"), pt = N.partida(pf.d, "laminada"), t = 16;
      var gage = cima5(Math.max(3 * pf.d, 0.6 * num(sv.bf, 100), num(sv.tw, 6) + 2 * num(sv.r, 0) + pf.arr.d2));
      var W = Math.max(num(sv.bf, 100), cima5(gage + 2 * pt.borda)), c1 = tfV + Math.max(35, pf.arr.d2 / 2 + 8), zona = dV - 2 * c1;
      var nl = zona > 0 ? Math.max(2, Math.min(8, Math.floor(zona / pt.passo + 1e-9) + 1)) : 1, vs = linhasDe(pf, nl, 0, pt.borda);
      var comp = N.comprimento({ id: pf.id, aperto: cume ? 2 * t : t + num(sp.tf, 10), arruelas: 1 });
      return { calc: false, t: t, W: W, H: dV / d.co, gage: gage, linhas: vs, pf: pf, classe: "ISO 898-1 classe 8.8", furo: N.furo(pf.d, "padrao").d, n: vs.length * 2,
               perna: Math.max(N.soldaMin(Math.min(t, Math.min(tfV, num(sv.tw, t)))).perna, 5), L: comp ? comp.L : null, borda: pt.borda, ext: 0, enrij: null };
    }
    function topoCalc(L, cume) {
      var dm = L.dimensoes || {}, ds = L.desenho || {}, pf = pf0(dm.parafuso || ds.parafuso, "M20");
      var ext = num(dm.ext, num(ds.ext, 0) * 1000), borda = num(dm.borda, num(ds.borda, 30)), vs = linhasDe(pf, Math.round(num(ds.linhas, 2)), ext, borda);
      var t = num(dm.t, num(ds.t, 0.016) * 1000), comp = N.comprimento({ id: pf.id, aperto: cume ? 2 * t : t + num(sp.tf, 10), arruelas: 1 });
      var pm = parseFloat(String(dm.soldaMesa || "").replace(",", ".").replace(/[^\d.]/g, "")), cjp = /penetra/i.test(String(dm.soldaMesa || ""));
      var e = mesclar(info(L), { t: t, W: num(dm.largura, num(ds.largura, 0) * 1000), H: num(dm.altura, dV + 2 * ext), gage: num(dm.gage, num(ds.gage, 0) * 1000), linhas: vs, pf: pf,
        classe: txt(dm.classe), furo: N.furo(pf.d, "padrao").d, n: num(dm.n, vs.length * 2), perna: isFinite(pm) ? pm : num(dm.soldaAlma, 6), pernaAlma: num(dm.soldaAlma, null), cjp: cjp, aco: txt(dm.aco) || "ASTM A36",
        L: comp ? comp.L : null, borda: borda, ext: ext, enrij: dm.enrijecedores && typeof dm.enrijecedores === "object" ? dm.enrijecedores : null, diagonal: dm.diagonal || null });
      if (e.n !== vs.length * 2) avisos.push("Ligação " + (cume ? "da cumeeira" : "do joelho") + ": " + e.n + " parafusos no cálculo, " + vs.length * 2 + " no desenho do arranjo - conferir.");
      return e;
    }
    o.joelho = LC.joelho && LC.joelho.dimensoes ? topoCalc(LC.joelho, false) : topoPartida(false);
    o.cumeeira = LC.cumeeira && LC.cumeeira.dimensoes ? topoCalc(LC.cumeeira, true) : topoPartida(true);
    /* ---------------- clip de terça */
    function cant(cat) {
      var q = null;
      if (CAT() && CAT().paraPerfil) { try { var p = CAT().paraPerfil(cat); if (p && p.forma === "L") q = { a: p.a * 1000, b: p.b * 1000, t: p.t * 1000 }; } catch (e) { q = null; } }
      if (!q) { var m = /^L(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)$/i.exec(txt(cat)); q = m ? { a: +m[1], b: +m[2], t: +m[3] } : { a: 76.2, b: 76.2, t: 6.35 }; }
      return q;
    }
    if (LC.clip && LC.clip.dimensoes) {
      var dc = LC.clip.dimensoes, catC = dc.cat || "L76X76X6.4", qc = cant(catC), pc = pf0(dc.parafuso, "M12"), np = Math.max(1, Math.round(num(dc.n, 2)));
      var La = num(dc.comprimento, 90), eSc = cima5(N.bordaMin(pc.d, "serra").e), passoC = np > 1 ? Math.min(N.partida(pc.d, "laminada").passo, (La - 2 * eSc) / (np - 1)) : 0, fs = [];
      for (var i = 0; i < np; i++) fs.push((i - (np - 1) / 2) * passoC);
      o.clip = mesclar(info(LC.clip), { cat: catC, nome: cantoneiraNome(catC), a: qc.a, b: qc.b, t: qc.t, La: La, h: num(dc.h, cima5(qc.a * 0.55)), furos: fs, eS: eSc, passo: passoC, pf: pc,
        classe: txt(dc.classe), furo: N.furo(pc.d, "padrao").d, perna: num(dc.solda, 5), duasTercas: false });
    } else {
      var catP = "L76X76X6.4", qp = cant(catP), p12 = N.parafuso("M12"), pt12 = N.partida(p12.d, "laminada"), eS = cima5(N.bordaMin(p12.d, "serra").e);
      o.clip = { calc: false, cat: catP, nome: cantoneiraNome(catP), a: qp.a, b: qp.b, t: qp.t, La: 2 * (eS + pt12.passo + eS), h: cima5(Math.max(qp.a * 0.55, pt12.borda + qp.t)),
                 furos: [-(eS + pt12.passo), -eS, eS, eS + pt12.passo], eS: eS, passo: pt12.passo, pf: p12, classe: "ISO 898-1 classe 8.8", furo: N.furo(p12.d, "padrao").d,
                 perna: Math.max(N.soldaMin(Math.min(qp.t, tfV)).perna, 5), duasTercas: true };
    }
    /* ---------------- contraventamento (barra redonda com rosca e chapa de apoio da porca) */
    function porcaDe(dd) { var best = null, dm = 1e9; N.PARAFUSOS.forEach(function (p) { var e = Math.abs(p.d - dd); if (e < dm) { dm = e; best = p; } }); return best; }
    var alfa = Math.atan2(d.H, d.esp || 1);
    if (LC.contravento && LC.contravento.dimensoes) {
      var dk = LC.contravento.dimensoes, chk = dk.chapa || {}, dcv = num(dk.d, 12.5);
      o.contravento = mesclar(info(LC.contravento), { d: dcv, b: num(chk.b, 60), t: num(chk.t, 9.5), e: num(chk.e, 25), furo: N.furo(dcv, "padrao").d, perna: num(dk.solda, 5), porca: porcaDe(dcv),
        biselada: /biselad/i.test(txt(LC.contravento.resumo)), alfa: alfa });
    } else {
      var dcv0 = (d.cvSec && d.cvSec.mm && num(d.cvSec.mm.d, 0)) || 12.5, ptcv = N.partida(dcv0, "laminada");
      o.contravento = { calc: false, d: dcv0, b: 60, t: 9.5, e: ptcv.borda + 5, furo: N.furo(dcv0, "padrao").d, perna: Math.max(N.soldaMin(Math.min(9.5, num(sp.tf, 9.5))).perna, 5),
                        porca: porcaDe(dcv0), biselada: true, alfa: alfa };
    }
    /* ---------------- mão-francesa: perfil, parafusos, chapa e solda do cálculo (js/acoligcalc.js maoFrancesa); sem ele, partida */
    var MFc = LC.maoFrancesaViga || LC.maoFrancesaPilar;
    if (MFc && MFc.dimensoes) {
      var dmf = MFc.dimensoes;
      o.mf = mesclar(info(MFc), { pf: N.parafuso(dmf.parafuso || "M12"), classe: dmf.classe || "ISO 898-1 classe 8.8", n: num(dmf.n, 1), perfil: txt(dmf.perfil), L: num(dmf.L, null),
                                  chapa: dmf.chapa || null, perna: num(dmf.solda, null) });
      if (dmf.perfil) d.perfilMF = { nome: txt(dmf.perfil), massa: num(dmf.massa, null) };
    } else o.mf = { calc: false, pf: N.parafuso("M12"), classe: "ISO 898-1 classe 8.8" };
    ["joelho", "cumeeira", "clip", "contravento"].forEach(function (k) { if (k === "cumeeira" && d.aguas !== 2) return; if (o[k].calc) o.calculadas++; else o.partida++; });
    Object.keys(o.bases).forEach(function (k) { if (o.bases[k].calc) o.calculadas++; else o.partida++; });
    o.lista = arr(LC.lista);
    if (LC.aprovado === false) avisos.push("Ligações: " + num(LC.falhas, 0) + " verificação(ões) não passa(m) no cálculo das ligações - NÃO EMITIR.");
    arr(LC.avisos).forEach(function (a) { avisos.push("Ligações: " + a); });
    return o;
  }

  /* esforços de cálculo (envoltória ELU) que cada ligação tem de resistir — da análise */
  function esforcos(r, d) {
    var A = (r.analise && r.analise.combinacoes) || {}, elu = arr(r.combinacoes).filter(function (c) { return c.tipo === "ELU"; }).map(function (c) { return c.id; });
    function est(bid, ult) {
      var best = null;
      elu.forEach(function (c) {
        var cb = A[c]; if (!cb || cb.ok === false || !cb.barras || !cb.barras[bid]) return;
        var es = arr(cb.barras[bid].estacoes); if (!es.length) return;
        var e = ult ? es[es.length - 1] : es[0];
        if (!best || Math.abs(e.Mz) > Math.abs(best.Mz)) best = { Mz: num(e.Mz, 0), V: num(e.Vy, 0), N: num(e.N, 0), comb: c, barra: bid };
      });
      return best;
    }
    var o = { joelho: null, cumeeira: null, bases: {}, cv: null };
    d.vigas.forEach(function (v) {
      var segs = arr(v.m.segs); if (!segs.length) return;
      var a = est(segs[0], false), b = d.aguas === 2 ? est(segs[segs.length - 1], true) : null;
      if (a && (!o.joelho || Math.abs(a.Mz) > Math.abs(o.joelho.Mz))) { o.joelho = a; a.membro = v.id; }
      if (b && (!o.cumeeira || Math.abs(b.Mz) > Math.abs(o.cumeeira.Mz))) { o.cumeeira = b; b.membro = v.id; }
    });
    d.tiposBase.forEach(function (tb) {
      var q = { Vmax: null, Vmin: null, Hx: 0, Hz: 0, M: 0 };
      tb.bases.forEach(function (no) {
        var rr = r.reacoes && r.reacoes[no]; if (!rr || !rr.envELU) return;
        var e = rr.envELU;
        q.Vmax = q.Vmax == null ? e.Fy[1] : Math.max(q.Vmax, e.Fy[1]); q.Vmin = q.Vmin == null ? e.Fy[0] : Math.min(q.Vmin, e.Fy[0]);
        q.Hx = Math.max(q.Hx, Math.abs(e.Fx[0]), Math.abs(e.Fx[1])); q.Hz = Math.max(q.Hz, Math.abs(e.Fz[0]), Math.abs(e.Fz[1]));
        q.M = Math.max(q.M, Math.abs(num(e.Mz && e.Mz[0], 0)), Math.abs(num(e.Mz && e.Mz[1], 0)), Math.abs(num(e.Mx && e.Mx[0], 0)), Math.abs(num(e.Mx && e.Mx[1], 0)));
      });
      o.bases[tb.marca] = q;
    });
    if (r.contravento) o.cv = { N: num(r.contravento.N, 0), barra: r.contravento.barra, razao: r.contravento.verificacao ? num(r.contravento.verificacao.razao, null) : null };
    return o;
  }

  /* casos de carga presentes nas reações (G, Q, W…) */
  function casosReacao(r) {
    var ids = [], nomes = {};
    arr(r.casos).forEach(function (c) { nomes[c.id] = c.nome || c.id; });
    Object.keys(r.reacoes || {}).forEach(function (no) { Object.keys((r.reacoes[no] || {}).porCaso || {}).forEach(function (k) { if (ids.indexOf(k) < 0) ids.push(k); }); });
    var ordem = arr(r.casos).map(function (c) { return c.id; });
    ids.sort(function (a, b) { var ia = ordem.indexOf(a), ib = ordem.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return ids.map(function (id) { return { id: id, nome: nomes[id] || id, vento: /^W/i.test(id) }; });
  }

  /* ================================================================ LISTA DE MATERIAIS */
  function listaMateriais(d, r, avisos) {
    var linhas = [], porAco = {}, total = 0, ordemAco = [], barras = 0;
    function grupoDe(itens, chave, fazer) { var mp = {}, ord = []; itens.forEach(function (it) { var k = chave(it); if (!mp[k]) { mp[k] = []; ord.push(k); } mp[k].push(it); }); ord.forEach(function (k) { fazer(mp[k]); }); }
    /* fora = correntes e tirantes: entram na lista com peso, mas fora do total do cálculo (que é perfis + terças + travessas) */
    function add(grupo, marca, desc, perfil, aco, qtd, Lm, massa, fora) {
      var pu = massa != null ? massa * Lm : null, pt = pu != null ? pu * qtd : null;
      linhas.push({ grupo: grupo, marca: marca, desc: desc, perfil: perfil, aco: aco, qtd: qtd, L: Lm, massa: massa, pesoUnit: pu, pesoTotal: pt, pendente: massa == null, fora: !!fora });
      if (pt != null) { if (fora) barras += pt; else { total += pt; if (porAco[aco] == null) { porAco[aco] = 0; ordemAco.push(aco); } porAco[aco] += pt; } }
    }
    function barra(lt) { return lt ? ["Barra redonda " + diamTxt(lt) + " mm", lt.aco, massaBarra(lt.d)] : [null, "", null]; }
    function acoDe(m) { return (m && m.aco && m.aco.id) || ""; }
    grupoDe(d.pilares, function (p) { return p.perfil + "|" + Math.round(p.L * 1000); }, function (g) {
      add("PILARES", seq(g.map(function (p) { return p.marca; })), "Pilar do pórtico", g[0].perfil, acoDe(g[0]), g.length, g[0].L, num(g[0].m.secao && g[0].m.secao.massa, null));
    });
    grupoDe(d.vigas, function (v) { return v.marca + "|" + v.perfil + "|" + Math.round(v.L * 1000); }, function (g) {
      add("VIGAS DE COBERTURA", g[0].marca, "Viga (" + eixosTxt(g.map(function (v) { return v.k + 1; })) + ")", g[0].perfil, acoDe(g[0]), g.length, g[0].L, num(g[0].m.secao && g[0].m.secao.massa, null));
    });
    grupoDe(d.taps, function (t) { return t.perfil + "|" + Math.round(t.L * 1000); }, function (g) {
      add("COLUNAS DE TAPAMENTO", seq(g.map(function (t) { return t.marca; })), "Coluna de tapamento", g[0].perfil, acoDe(g[0]), g.length, g[0].L, num(g[0].m.secao && g[0].m.secao.massa, null));
    });
    var acoCV = (((d.G.grupos || {}).contravento || {}).aco || {}).id || "", massaCV = d.cvSec ? num(d.cvSec.massa, null) : null;
    grupoDe(d.cv, function (cv) { return cv.marca; }, function (g) {
      add("CONTRAVENTAMENTO", g[0].marca, (g[0].tipo === "parede" ? "Contraventamento vertical (" : "Contraventamento da cobertura (") + vaosTxt(g.map(function (c) { return c.k; })) + ")",
          d.cvNome, acoCV, g.length, g[0].L, massaCV);
    });
    var principal = total;
    /* terças e travessas (NBR 14762): com o perfil e a massa do cálculo; sem eles, quantidade e comprimento, sem peso */
    var aFrio = (d.par.acos && d.par.acos.frio) || "", pT = d.perfilTerca, pTr = d.trvLat, pTo = d.trvOit;
    var nB = d.tercas.filter(function (t) { return t.beiral; }).length, nC = d.tercas.length - nB;
    if (nB) add("TERÇAS", "TB1", "Terça de beiral", pT ? pT.nome : null, aFrio, nB * d.nV, d.esp, pT ? pT.massa : null);
    if (nC) add("TERÇAS", "TC1", "Terça de cobertura", pT ? pT.nome : null, aFrio, nC * d.nV, d.esp, pT ? pT.massa : null);
    var nTL = (d.travE.length + d.travD.length) * d.nV;
    if (nTL) add("TRAVESSAS", "TL1", "Travessa lateral", pTr ? pTr.nome : null, aFrio, nTL, d.esp, pTr ? pTr.massa : null);
    var tf = {};
    [[d.travF, d.tapF], [d.travB, d.tapB]].forEach(function (q) {
      q[0].forEach(function (y) {
        var xs = [0].concat(q[1].filter(function (xt) { return y < d.yT(xt) - 0.3; })).concat([d.vao]);
        for (var i = 0; i + 1 < xs.length; i++) { var Lr = Math.round((xs[i + 1] - xs[i]) * 1000); tf[Lr] = (tf[Lr] || 0) + 1; }
      });
    });
    Object.keys(tf).sort(function (a, b) { return a - b; }).forEach(function (Lr) { add("TRAVESSAS", "TF1", "Travessa do oitão", pTo ? pTo.nome : null, aFrio, tf[Lr], +Lr / 1000, pTo ? pTo.massa : null); });
    var secund = 0; linhas.forEach(function (l) { if ((l.grupo === "TERÇAS" || l.grupo === "TRAVESSAS") && l.pesoTotal != null) secund += l.pesoTotal; });
    var Lagua = d.meio / d.co;   /* corrente: do beiral à cumeeira, em cada água */
    var bCR = barra(d.ltCR), bT1 = barra(d.ltTR1), bT2 = barra(d.ltTR2);
    if (d.correntes && d.correntes.calc && d.correntes.linhas > 0) add("CORRENTES E TIRANTES", "CR1", "Corrente de terça (" + d.correntes.linhas + " por vão, a cada " + br(d.correntes.entre, 2) + " m)", bCR[0], bCR[1], d.correntes.linhas * d.nV * d.aguas, Lagua, bCR[2], true);
    if (d.tirLat.length && (d.travE.length || d.travD.length)) add("CORRENTES E TIRANTES", "TR1", "Tirante das travessas laterais (" + d.tirLat.length + " por vão)", bT1[0], bT1[1], d.tirLat.length * d.nV * ((d.travE.length ? 1 : 0) + (d.travD.length ? 1 : 0)), d.H - Math.min.apply(null, d.travE.concat(d.travD)), bT1[2], true);
    /* TR2: da viga (face de baixo) até a travessa mais baixa do oitão, em cada posição do cálculo entre as colunas */
    var tr2 = {}, hvM = num(d.secV.d, 300) / 2000 / d.co;
    if (d.tirOit.length) [[d.travF, d.tapF], [d.travB, d.tapB]].forEach(function (q) {
      if (!q[0].length) return;
      var yMin = Math.min.apply(null, q[0]), xs = [0].concat(q[1]).concat([d.vao]).sort(function (p, w) { return p - w; });
      for (var i = 0; i + 1 < xs.length; i++) d.tirOit.forEach(function (fr) { var xx = xs[i] + fr * (xs[i + 1] - xs[i]), Lr = Math.round((d.yT(xx) - hvM - yMin) * 1000); if (Lr > 0) tr2[Lr] = (tr2[Lr] || 0) + 1; });
    });
    Object.keys(tr2).sort(function (p, w) { return p - w; }).forEach(function (Lr) { add("CORRENTES E TIRANTES", "TR2", "Tirante das travessas do oitão", bT2[0], bT2[1], tr2[Lr], +Lr / 1000, bT2[2], true); });
    if (d.mf.length) add("MÃOS-FRANCESAS", "MF1", "Mão-francesa (" + d.mf.length + " posições)", d.perfilMF ? d.perfilMF.nome : null, "", d.mf.length, null, d.perfilMF ? d.perfilMF.massa : null);
    if (Math.abs(principal - num(r.peso, principal)) > 0.5) avisos.push("Lista de materiais (" + br(principal, 1) + " kg) diferente do peso do cálculo (" + br(num(r.peso, 0), 1) + " kg).");
    var area = d.vao * d.Lt, acr = num(d.par.acrescimoLigacoes, 0.05);
    if (r.pesoSecundarias != null && secund > 0 && Math.abs(secund - num(r.pesoSecundarias, secund)) > 0.5) avisos.push("Terças e travessas na lista (" + br(secund, 1) + " kg) diferentes do cálculo (" + br(num(r.pesoSecundarias, 0), 1) + " kg).");
    return { linhas: linhas, porAco: porAco, ordemAco: ordemAco, principal: principal, secundarias: secund, barras: barras, total: principal + secund, area: area, taxa: area > 0 ? principal / area : null,
             taxaTotal: area > 0 ? (principal + secund) / area : null, acrescimo: acr, ligacoes: principal * acr };
  }

  /* ================================================================ NOTAS DA COLUNA */
  /* parafusos e chumbadores como saíram das ligações (calculadas ou de partida) */
  function parafusosNota(c) {
    var lg = c.lig, d = c.d; if (!lg) return "Parafusos e chumbadores: conforme o memorial.";
    var jo = lg.joelho, cl = lg.clip, b0 = d.tiposBase.length ? lg.bases[d.tiposBase[0].marca] : null;
    return "Parafusos: joelho" + (d.aguas === 2 ? " e cumeeira " : " ") + jo.pf.id + " " + jo.classe + "; clip de terça " + cl.pf.id + " " + cl.classe + (d.mf.length ? "; mão-francesa " + lg.mf.pf.id + (lg.mf.calc ? " " + lg.mf.classe : " (partida)") : "") +
      (b0 ? "; chumbadores Ø " + b0.pf.id + " " + b0.classe : "") + ". Furo-padrão = Ø + 1,5 mm (NBR 8800, 6.3.6); placa de base com furo alargado.";
  }
  function blocosNotas(c) {
    var d = c.d, r = d.r, M = MT(), G = d.G, gr = G.grupos || {};
    var aP = (gr.pilar && gr.pilar.aco) || {}, aB = (gr.contravento && gr.contravento.aco) || {};
    var ch = (M && M.aco(M.PADRAO.chapa)) || { id: "ASTM A36", fy: 250 };
    var frio = (d.par.acos && d.par.acos.frio) || (M && M.PADRAO.frio) || "-";
    function aco(a) { return a && a.id ? a.id + (a.fy ? " (fy = " + a.fy + " MPa)" : "") : "-"; }
    var temTL = d.travE.length || d.travD.length, temTF = d.travF.length || d.travB.length;
    var notas = [
      "Cotas em milímetros e níveis em metros, salvo indicação. Não medir no desenho.",
      "Aços: perfis laminados " + aco(aP) + "; chapas de ligação " + aco(ch) + "; barras redondas " + aco(aB) + "; perfis formados a frio (terças e travessas) " + frio + ".",
      parafusosNota(c),
      "Soldas: eletrodo E70XX (AWS A5.1); filete com a perna indicada (mínimo da NBR 8800, Tabela 10); simbologia AWS A2.4; soldadores e procedimentos qualificados (AWS D1.1).",
      { t: "Pintura: preparo de superfície e sistema de pintura a definir conforme a agressividade do ambiente da obra [PENDENTE].", cor: VERMELHO },
      c.lig && !c.lig.partida ? "Ligações dimensionadas pelo cálculo: resistências e aproveitamentos no memorial; detalhes na folha 05." : { t: "Ligações marcadas como PARTIDA ainda não dimensionadas pelo cálculo: conferir no memorial antes da fabricação.", cor: VERMELHO }
    ];
    {
      var comP = [], semP = [];
      (d.perfilTerca ? comP : semP).push(d.perfilTerca ? "terças " + perfilCurto(d.perfilTerca.nome) : "terças");
      if (temTL) (d.trvLat ? comP : semP).push(d.trvLat ? "travessas laterais " + perfilCurto(d.trvLat.nome) : "travessas laterais (TL1)");
      if (temTF) (d.trvOit ? comP : semP).push(d.trvOit ? "travessas do oitão " + perfilCurto(d.trvOit.nome) : "travessas do oitão (TF1)");
      if (comP.length) notas.push(comP.join("; ").replace(/^./, function (c0) { return c0.toUpperCase(); }) + " - NBR 14762 (ver memorial).");
      if (semP.length) notas.push({ t: "Sem dimensionamento no resultado do cálculo: " + semP.join(", ") + " - perfil a dimensionar (NBR 14762) [PENDENTE].", cor: VERMELHO });
      if ((d.correntes && d.correntes.linhas) || d.tirLat.length || d.tirOit.length) {
        var pB = [], semD = false;
        [[d.correntes && d.correntes.linhas, "correntes CR1", d.ltCR], [d.tirLat.length, "tirantes TR1", d.ltTR1], [d.tirOit.length, "tirantes TR2", d.ltTR2]].forEach(function (q) { if (!q[0]) return; pB.push(q[1] + " " + (q[2] ? diamTxt(q[2]) + " mm" : "Ø a definir")); if (!q[2]) semD = true; });
        var acoB = (d.ltCR || d.ltTR1 || d.ltTR2 || {}).aco;
        notas.push(semD ? { t: "Barras redondas: " + pB.join(", ") + ", nas posições do cálculo das terças e travessas; diâmetro a definir [PENDENTE].", cor: VERMELHO }
          : "Barras redondas" + (acoB ? " " + acoB : "") + ": " + pB.join(", ") + ", nas posições e com os diâmetros do cálculo das terças e travessas (NBR 14762).");
        notas.push({ t: "Fixação das correntes e tirantes nas terças e travessas (furação e porcas): detalhe a incluir [PENDENTE].", cor: VERMELHO });
      }
      if (d.mf.length) notas.push(c.lig && c.lig.mf && c.lig.mf.calc ? "Mãos-francesas MF1: posições, perfil, parafusos, chapa de ligação e solda do cálculo (contenção nodal da mesa comprimida - ver memorial)."
                                  : { t: "Mãos-francesas: posições do cálculo; perfil e ligação a dimensionar [PENDENTE].", cor: VERMELHO });
    }
    notas.push("Graute não retrátil sob as placas de base (25 mm), após o nivelamento e o prumo dos pilares.");
    notas.push("Contraventamentos montados junto com os pórticos e tensionados (porca e contraporca); conferir prumo, nível e alinhamento antes do aperto final.");
    notas.push("Conferir a locação das bases na obra antes da fabricação.");
    if (r.aprovado === false) notas.push({ t: "O cálculo tem " + num(r.falhas, 0) + " verificação(ões) que não passa(m): NÃO EMITIR para fabricação.", cor: VERMELHO });
    notas.push("Projeto executivo - revisão " + c.rev + ".");
    var normas = [
      "ABNT NBR 8800:2024 - estruturas de aço (itens não conferidos na edição de 2024 seguem a de 2008 - ver memorial).",
      "ABNT NBR 6120:2019 - ações para o cálculo de estruturas de edificações.",
      "ABNT NBR 6123:2023 - forças devidas ao vento (mapa de isopletas igual ao de 1988).",
      "ABNT NBR 8681 - ações e segurança nas estruturas (coeficientes conforme a NBR 8800).",
      "ABNT NBR 14762:2010 - perfis formados a frio.",
      "AWS A2.4 (símbolos de soldagem) e AWS D1.1 (soldagem de estruturas de aço)."
    ];
    var cob = (d.par.cobertura || {}), cg = (d.par.cargas || r.parametros && r.parametros.cargas || {});
    var dados = [
      "Galpão " + br(d.vao, 2) + " x " + br(d.Lt, 2) + " m; pé-direito " + br(d.H, 2) + " m (eixo); inclinação " + br(d.i * 100, 1) + " %; " + d.aguas + (d.aguas === 2 ? " águas" : " água") + "; " + d.zs.length + " pórticos a cada " + br(d.esp, 3) + " m.",
      "Bases dos pilares: " + d.tiposBase.map(function (tb) { return tb.marca + " " + tb.tipo; }).join("; ") + ".",
      "Cobertura: " + (cob.telhaNome || "telha") + (cob.telhaVaoMax ? " (vão máx. " + br(cob.telhaVaoMax, 2) + " m)" : "") + "; telha " + br(num(cg.telhaPeso, cob.telhaPeso), 2) + " kN/m²; permanente adicional " + br(num(cg.permanenteExtra, cob.permanenteExtra), 2) + " kN/m².",
      "Sobrecarga de cobertura " + br(r.sobrecarga ? r.sobrecarga.q : null, 2) + " kN/m² (NBR 6120:2019, 6.4)."
    ];
    if (r.vento && typeof r.vento === "object") {
      var v = r.vento, partes = [];
      [["V0", v.V0 != null ? v.V0 : v.v0, " m/s"], ["S1", v.S1 != null ? v.S1 : v.s1, ""], ["S2", v.S2 != null ? v.S2 : v.s2, (v.s2 && v.s2.categoria ? " (cat. " + v.s2.categoria + (v.s2.classe ? ", classe " + v.s2.classe : "") + ")" : "")], ["S3", v.S3 != null ? v.S3 : v.s3, ""], ["Vk", v.vk, " m/s"], ["q", v.q, " kN/m²"]].forEach(function (p) {
        var x = typeof p[1] === "object" && p[1] ? (p[1].valor != null ? p[1].valor : p[1].v) : p[1];
        if (isFinite(+x)) partes.push(p[0] + " = " + br(+x, 2) + p[2]);
      });
      dados.push("Vento (NBR 6123): " + (partes.length ? partes.join("; ") : "ver memorial") + ".");
    } else if (c.semVento) dados.push({ t: "Vento: o resultado do cálculo não traz casos de vento - refazer o cálculo com o vento antes de emitir [PENDENTE].", cor: VERMELHO });
    var gmax = null; Object.keys(r.grupos || {}).forEach(function (k) { var g = r.grupos[k]; if (g && (!gmax || g.razao > gmax.razao)) gmax = { k: k, razao: g.razao, membro: g.membro }; });
    dados.push("Verificação das barras: " + (r.aprovado ? "todas aprovadas" : num(r.falhas, 0) + " falha(s)") + (gmax ? "; maior aproveitamento " + br(gmax.razao, 2) + " (" + gmax.k + ", " + gmax.membro + ")" : "") + ".");
    dados.push("Peso da estrutura principal e do contraventamento: " + br(num(r.peso, 0), 0) + " kg (" + br(num(r.taxa, 0), 2) + " kg/m²)" + (r.pesoTotal != null ? "; com terças e travessas: " + br(num(r.pesoTotal, 0), 0) + " kg (" + br(num(r.pesoTotal, 0) / (d.vao * d.Lt), 2) + " kg/m²)." : "."));
    return [{ titulo: "NOTAS GERAIS", itens: notas, numerar: true }, { titulo: "NORMAS UTILIZADAS", itens: normas, numerar: true }, { titulo: "DADOS DO PROJETO", itens: dados, numerar: false }];
  }
  /* a coluna da direita: blocos encostados em cima do carimbo (Padrão RA: notas acima do carimbo) */
  function colunaNotas(D, g, blocos) {
    var col = g.coluna, car = g.carimbo, x0 = col.x + 4, wmax = col.w - 7, yMax = car.y - 3, yMin = col.y + 4;
    var T = D.E.T, tentativas = [T.nota, T.nota * 0.92, T.nota * 0.84, T.nota * 0.76, T.nota * 0.68].filter(function (hh) { return hh >= T.minimo - 1e-9; }), esc0 = null, coube = true;
    if (tentativas[tentativas.length - 1] > T.minimo + 1e-9) tentativas.push(T.minimo);
    function medir(h, hq) {
      var tot = 0;
      blocos.forEach(function (b) {
        tot += hq * 0.76 + hq * 0.55 + 1.5;
        b.itens.forEach(function (it, i) {
          var t = (it && typeof it === "object") ? it.t : it, pre = b.numerar ? (i + 1) + "- " : "- ", rec = largTexto(pre, h);
          tot += quebrar(t, h, wmax - rec).length * h * 1.42 + 0.7;
        });
        tot += 3.5;
      });
      return tot;
    }
    for (var i = 0; i < tentativas.length; i++) { var hq = Math.min(T.quadro, tentativas[i] * 3); if (medir(tentativas[i], hq) <= yMax - yMin) { esc0 = [tentativas[i], hq]; break; } }
    if (!esc0) { esc0 = [tentativas[tentativas.length - 1], Math.min(T.quadro, tentativas[tentativas.length - 1] * 3)]; coube = false; }
    var h = esc0[0], hq0 = esc0[1], y = yMax - medir(h, hq0);
    D.linha(col.x, col.y, col.x, car.y, "MET-MOLDURA");
    var coubeNotas = coube;
    blocos.forEach(function (b) {
      D.texto(x0, y + hq0 * 0.76, b.titulo, hq0, { peso: 0.28 });
      y += hq0 * 0.76 + hq0 * 0.55 + 1.5;
      b.itens.forEach(function (it, i) {
        var o = (it && typeof it === "object") ? it : { t: txt(it) }, pre = b.numerar ? (i + 1) + "- " : "- ", rec = largTexto(pre, h);
        var ls = quebrar(o.t, h, wmax - rec);
        D.texto(x0, y + h * 0.76, pre, h, { cor: o.cor });
        ls.forEach(function (s) { D.texto(x0 + rec, y + h * 0.76, s, h, { cor: o.cor }); y += h * 1.42; });
        y += 0.7;
      });
      y += 3.5;
    });
    return coubeNotas;
  }

  /* ================================================================ CARIMBO RA (o do js/prancha.js, desenhado como na tela/PDF) */
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
      var ts = t.campo === "folha" && rotuloFolha ? rotuloFolha : t.s;   /* folha de continuação: "01A/06" (o resto do carimbo não muda) */
      s.push('<text x="' + n(t.x) + '" y="' + n(t.y) + '" font-size="' + n(t.h / A) + '" text-anchor="' + (t.al === "C" ? "middle" : "start") + '" fill="' + (COR_CAMADA[t.camada] || "#111") + '"' +
        (t.negrito ? ' font-weight="bold"' : "") + (t.param ? ' data-pr-param="' + t.param + '"' : "") + (t.campo ? ' data-cr="' + t.campo + '"' : "") + ">" + esc(ts) + "</text>");
    });
    s.push("</g>");
    D.add(s.join(""));
  }

  /* ================================================================ VISTAS */
  var OV = 34;   /* faixa em volta das plantas: cadeias de cota (10/18 mm) e balões (30 mm) */

  /* eixos da planta (fila na vertical do papel, pórtico na horizontal) */
  function eixosPlanta(D, d, PX, PY, onde) {
    var top = PY(d.vao), bot = PY(0), lef = PX(0), rig = PX(d.Lt);
    d.zs.forEach(function (z, k) {
      var px = PX(z), rot = String(k + 1), r = D.raioBalao(rot);
      D.linha(px, top - 30 + r, px, bot + 30 - r, "MET-EIXO");
      D.balao(px, top - 30, rot, ' data-eixo="' + rot + '"');
      D.balao(px, bot + 30, rot);
    });
    d.filas.forEach(function (f) {
      var py = PY(f.x), r = D.raioBalao(f.letra);
      D.linha(lef - 30 + r, py, rig + 30 - r, py, "MET-EIXO");
      D.balao(lef - 30, py, f.letra, ' data-eixo="' + f.letra + '"');
      D.balao(rig + 30, py, f.letra);
    });
  }
  function acumulados(vals) { return vals.map(function (v) { return Math.round(v * 1000); }); }
  function parciais(acc) { var o = []; for (var i = 0; i + 1 < acc.length; i++) o.push(String(acc[i + 1] - acc[i])); return o; }

  /* PLANTA DE LOCAÇÃO */
  function plantaLocacao(D, d, c, x0, y0, s) {
    var T = D.E.T, k = s / 1000;
    function PX(z) { return x0 + z * s; }
    function PY(x) { return y0 + (d.vao - x) * s; }
    eixosPlanta(D, d, PX, PY);
    /* contorno do galpão (eixo das filas/oitões): fino */
    function rotulo(cx, cy, marca, base, dir, meiaL, attrP, attrB) {
      var lx = cx + dir * (meiaL + 1.6);
      D.texto(lx, cy - 1.1, marca, T.marca, { al: dir > 0 ? "E" : "D", attr: attrP });
      D.texto(lx, cy + 1.1 + T.perfil * 0.76, base, T.perfil, { al: dir > 0 ? "E" : "D", attr: attrB });
    }
    d.pilares.forEach(function (p) {
      var cx = PX(p.z), cy = PY(p.x), pb = c.lig && c.lig.bases[p.marcaBase];
      if (pb) D.ret(cx - pb.B * k / 2, cy - pb.N * k / 2, pb.B * k, pb.N * k, "MET-SECUNDARIO");
      D.secaoI(cx, cy, num(p.sec.d, 300) * k, num(p.sec.bf, 150) * k, num(p.sec.tw, 6) * k, num(p.sec.tf, 10) * k, { min: 0.3 });
      var meia = Math.max(pb ? pb.B * k / 2 : 0, num(p.sec.bf, 150) * k / 2);
      rotulo(cx, cy, p.marca, p.marcaBase, p.k === d.nV ? -1 : 1, meia, ' data-pilar="' + p.marca + '"', ' data-base="' + p.marcaBase + '"');
    });
    d.taps.forEach(function (t) {
      var cx = PX(t.z), cy = PY(t.x), pb = c.lig && c.lig.bases[t.marcaBase];
      if (pb) D.ret(cx - pb.N * k / 2, cy - pb.B * k / 2, pb.N * k, pb.B * k, "MET-SECUNDARIO");
      D.secaoI(cx, cy, num(t.sec.d, 150) * k, num(t.sec.bf, 100) * k, num(t.sec.tw, 5) * k, num(t.sec.tf, 6) * k, { min: 0.3, rot: true });
      var meia = Math.max(pb ? pb.N * k / 2 : 0, num(t.sec.d, 150) * k / 2);
      rotulo(cx, cy, t.marca, t.marcaBase, t.k === d.nV ? -1 : 1, meia, ' data-tapamento="' + t.marca + '"', ' data-base="' + t.marcaBase + '"');
    });
    /* cotas: em cima, parciais entre eixos e total; embaixo, acumuladas a partir do eixo 1 */
    var top = PY(d.vao), bot = PY(0), acc = acumulados(d.zs);
    var ptsT = d.zs.map(function (z) { return [PX(z), top]; }), ptsB = d.zs.map(function (z) { return [PX(z), bot]; });
    D.cadeia(ptsT, 10, parciais(acc), { semExt: true, attrs: parciais(acc).map(function () { return ' data-cota="parcial-z"'; }) });
    D.cota(PX(0), top, PX(d.Lt), top, 18, mm(d.Lt), { semExt: true, attrs: [' data-cota="comprimento"'], evitar: d.zs.map(function (z) { return [PX(z), top]; }) });
    D.acumulada(ptsB, -10, acc.map(String), { semExt: true, attrs: acc.map(function () { return ' data-cota="acumulada-z"'; }) });
    /* vão: nos dois oitões (com as colunas de tapamento) */
    [[0, d.tapF, 1], [d.Lt, d.tapB, -1]].forEach(function (q) {
      var xs = [0].concat(q[1]).concat([d.vao]), P = xs.map(function (x) { return [PX(q[0]), PY(x)]; }), ac = acumulados(xs);
      if (xs.length > 2) D.cadeia(P, 10 * q[2], parciais(ac), { desde: xs.map(function (x, i) { return i === 0 || i === xs.length - 1 ? false : 3.0; }), attrs: parciais(ac).map(function () { return ' data-cota="parcial-x"'; }) });
      D.cota(PX(q[0]), PY(0), PX(q[0]), PY(d.vao), (xs.length > 2 ? 18 : 10) * q[2], mm(d.vao), { semExt: true, attrs: [q[2] > 0 ? ' data-cota="vao"' : ""] });
    });
  }

  /* locação dos chumbadores de um tipo de base (1:10), na orientação da planta */
  function locacaoChumbadores(D, d, c, tb, x, y, wDisp) {
    var pb = c.lig.bases[tb.marca], T = D.E.T, esc = escolher([10, 15, 20, 25], function (e) { return Math.max(pb.B, pb.N) / e + 36 <= wDisp; }), k = 1 / esc;
    var h0 = tituloVista(D, x, y, tb.marca + " - LOCAÇÃO DOS CHUMBADORES", "ESC 1:" + esc);
    var tap = d.taps.some(function (t) { return t.marcaBase === tb.marca; }) && !d.pilares.some(function (p) { return p.marcaBase === tb.marca; });
    var w = (tap ? pb.N : pb.B) * k, h = (tap ? pb.B : pb.N) * k;   /* tapamento: a alma na direção do comprimento do galpão */
    var cx = x + 8 + w / 2, cy = y + h0 + 16 + h / 2;
    /* eixos: passam 5 mm do lado do rótulo e 2 mm do lado das cotas (não cortam o texto da cota) */
    D.linha(cx - w / 2 - 5, cy, cx + w / 2 + 2, cy, "MET-EIXO");
    D.linha(cx, cy - h / 2 - 2, cx, cy + h / 2 + 5, "MET-EIXO");
    var hEixo = Math.max(T.minimo, T.cota * 0.8);
    D.texto(cx - w / 2 - 5.5, cy, "EIXO", hEixo, { al: "D", meio: true });
    D.texto(cx, cy + h / 2 + 5.8 + hEixo * 0.76, "EIXO", hEixo, { al: "C" });
    D.ret(cx - w / 2, cy - h / 2, w, h, "MET-PERFIL");
    D.secaoI(cx, cy, num(tb.sec.d, 300) * k, num(tb.sec.bf, 150) * k, num(tb.sec.tw, 6) * k, num(tb.sec.tf, 10) * k, { min: 0.3, rot: tap });
    var ex = (tap ? pb.N : pb.B) / 2 - pb.e, ey = (tap ? pb.B : pb.N) / 2 - pb.e, nl = Math.max(2, num(pb.porLado, 2));
    /* nl chumbadores por extremidade (base engastada com 6 ou 8): eles se distribuem ao longo de B */
    var posB = []; for (var iq = 0; iq < nl; iq++) posB.push(-1 + 2 * iq / (nl - 1));
    if (!tap) posB.forEach(function (fx) { [-1, 1].forEach(function (fy) { D.furo(cx + fx * ex * k, cy + fy * ey * k, pb.furo / 2 * k); }); });
    else posB.forEach(function (fy) { [-1, 1].forEach(function (fx) { D.furo(cx + fx * ex * k, cy + fy * ey * k, pb.furo / 2 * k); }); });
    var bw = tap ? pb.N : pb.B, bh = tap ? pb.B : pb.N;
    if (!tap && nl > 2) {
      var pc = [[cx - w / 2, cy - h / 2]], tx = [String(pb.e)], esp = (bw - 2 * pb.e) / (nl - 1);
      posB.forEach(function (fx) { pc.push([cx + fx * ex * k, cy - h / 2]); });
      for (var iq2 = 0; iq2 < nl - 1; iq2++) tx.push(String(Math.round(esp)));
      pc.push([cx + w / 2, cy - h / 2]); tx.push(String(pb.e));
      D.cadeia(pc, 6, tx);
    } else D.cadeia([[cx - w / 2, cy - h / 2], [cx - ex * k, cy - h / 2], [cx + ex * k, cy - h / 2], [cx + w / 2, cy - h / 2]], 6, [String(pb.e), String(bw - 2 * pb.e), String(pb.e)]);
    D.cota(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, 12, String(bw));
    D.cadeia([[cx + w / 2, cy + h / 2], [cx + w / 2, cy + ey * k], [cx + w / 2, cy - ey * k], [cx + w / 2, cy - h / 2]], -6, [String(pb.e), String(bh - 2 * pb.e), String(pb.e)]);
    D.cota(cx + w / 2, cy + h / 2, cx + w / 2, cy - h / 2, -12, String(bh));
    var yt = cy + h / 2 + 10.5;
    var hh = D.textos(x + 2, yt, [pb.n + " CHUMB. Ø " + pb.pf.id + " - " + pb.classe + (pb.gancho ? " (com gancho)" : ""), "PILARES: " + seq(tb.pecas), pb.calc ? { t: "Dimensionada pelo cálculo (ver detalhe 1, folha 05)." } : { t: NOTA_PARTIDA, cor: VERMELHO }], T.nota * 0.92, { wmax: wDisp - 4 });
    return yt + hh - y;
  }

  /* QUADRO DE CARGAS NA FUNDAÇÃO
     Cabe SEMPRE na largura livre que recebe (à esquerda da coluna de notas). Se os casos não couberem numa tabela
     só, vira blocos empilhados: o 1º com os casos permanentes e variáveis e a envoltória ELU, os seguintes com o
     vento (quantos precisar); BASE/PILAR/EIXO repetidas em cada bloco e "(continua)" no título de quem continua.
     A letra não encolhe (é a da tabela do padrão). Por quê: com portão dominante e vento em todas as direções
     (G, G2, Q + 12 casos de vento) o quadro passava por baixo da coluna de notas — achado do Rogério, 12/10/2026. */
  function temMomento(d) { return d.pilares.concat(d.taps).some(function (p) { return p.tipoBase === "engastada"; }); }
  function blocosReacoes(d, c, wMax) {
    var wId = 47, wCaso = (temMomento(d) ? 4 : 3) * 13.5, wElu = 60, casos = c.casos;
    function larg(cs, elu) { return wId + cs.length * wCaso + (elu ? wElu : 0); }
    if (larg(casos, true) <= wMax) return [{ casos: casos.slice(), elu: true }];
    var out = [], b = { casos: [], elu: true };
    function encher(lista) {
      lista.forEach(function (q) { if (b.casos.length && larg(b.casos.concat([q]), b.elu) > wMax) { out.push(b); b = { casos: [], elu: false }; } b.casos.push(q); });
    }
    encher(casos.filter(function (q) { return !q.vento; }));
    if (b.casos.length || b.elu) out.push(b);
    b = { casos: [], elu: false };
    encher(casos.filter(function (q) { return q.vento; }));
    if (b.casos.length) out.push(b);
    return out;
  }
  /* desenha os blocos de "de" a "ate" (todos, se não informado) a partir de (x, y); devolve a largura e a altura */
  function desenharReacoes(D, d, c, x, y, blocos, de, ate) {
    var r = d.r, temM = temMomento(d), n = blocos.length, yy = y, wTot = 0, un = "(kN" + (temM ? "; kN.m" : "") + ")";
    de = de || 0; ate = ate == null ? n - 1 : ate;
    function f1(v) { return br(v, 1); }
    for (var ib = de; ib <= ate; ib++) {
      var bl = blocos[ib], cont = ib < n - 1 ? " (continua)" : "";
      var tit = "QUADRO DE CARGAS NA FUNDAÇÃO " + un + (ib > 0 ? " - continuação" : "") + cont;
      var sub = ib === 0 ? "Ações da estrutura sobre a fundação - valores característicos por caso e de cálculo (ELU)"
        : (bl.casos.every(function (q) { return q.vento; }) ? "Casos de vento - valores característicos" : "Valores característicos por caso");
      var hT = tituloVista(D, x, yy, tit, sub);
      var cols = [{ t: "BASE", w: 13 }, { t: "PILAR", w: 13 }, { t: "EIXO", w: 21 }], grupos = [], wv = 13.5;
      bl.casos.forEach(function (cs) {
        var g0 = cols.length;
        cols.push({ t: "V", w: wv }, { t: "Hx", w: wv }, { t: "Hz", w: wv });
        if (temM) cols.push({ t: "M", w: wv });
        grupos.push({ t: "CASO " + cs.id, de: g0, ate: cols.length - 1 });
      });
      if (bl.elu) {
        var g1 = cols.length;
        cols.push({ t: "Vd,máx", w: 15 }, { t: "Vd,mín", w: 15 }, { t: "|Hx,d|", w: 15 }, { t: "|Hz,d|", w: 15 });
        grupos.push({ t: "ELU (ENVOLTÓRIA)", de: g1, ate: cols.length - 1 });
      }
      var linhas = d.pilares.concat(d.taps).map(function (p) {
        var rr = (r.reacoes || {})[p.base] || {}, pc = rr.porCaso || {}, e = rr.envELU || null;
        /* data-reacao só no 1º bloco: uma linha por base no quadro inteiro */
        var cel = [p.marcaBase, { t: p.marca, attr: ib === 0 ? ' data-reacao="' + p.marca + '"' : ' data-reacao-cont="' + p.marca + '"' }, p.eixo];
        bl.casos.forEach(function (cs) {
          var v = pc[cs.id];
          if (!v) { cel.push("-", "-", "-"); if (temM) cel.push("-"); return; }
          cel.push(f1(num(v[1], 0)), f1(-num(v[0], 0)), f1(-num(v[2], 0)));
          if (temM) cel.push(f1(Math.max(Math.abs(num(v[3], 0)), Math.abs(num(v[5], 0)))));
        });
        if (bl.elu) {
          if (e) cel.push(f1(e.Fy[1]), f1(e.Fy[0]), f1(Math.max(Math.abs(e.Fx[0]), Math.abs(e.Fx[1]))), f1(Math.max(Math.abs(e.Fz[0]), Math.abs(e.Fz[1]))));
          else cel.push("-", "-", "-", "-");
        }
        return cel;
      });
      var t = D.tabela(x, yy + hT + 1, cols, linhas, { grupos: grupos });
      wTot = Math.max(wTot, t.w);
      yy += hT + 1 + t.h + (ib < ate ? 8 : 0);
    }
    return { w: wTot, h: yy - y };
  }
  /* medida sem desenhar (num desenho de rascunho) */
  function medir(D, fn) { var Dm = new Desenho(D.E, null); return fn(Dm); }
  /* quadro de bases (tabela por tipo de placa + nota) */
  function quadroBases(D, d, c, x, y, wMax) {
    var T = D.E.T, yy = y;
    yy += tituloVista(D, x, yy, "QUADRO DE BASES", null) + 1;
    var cols = [{ t: "TIPO", w: 12 }, { t: "PILAR", w: 26 }, { t: "VINCULAÇÃO", w: 22 }, { t: ["PLACA (mm)", "B x N x t"], w: 30 }, { t: "CHUMBADORES", w: 26 }, { t: "QUANT.", w: 13 }];
    var linhas = d.tiposBase.map(function (tb) {
      var pb = c.lig && c.lig.bases[tb.marca];
      return [tb.marca, perfilCurto(tb.perfil), tb.tipo.toUpperCase(), pb ? pb.B + " x " + pb.N + " x " + espChapa(pb.t) : "-", pb ? pb.n + " Ø " + pb.pf.id : "-", String(tb.pecas.length)];
    });
    var t = D.tabela(x, yy, cols, linhas);
    yy += t.h + 2;
    var algumaPartida = d.tiposBase.some(function (tb) { return c.lig && c.lig.bases[tb.marca] && !c.lig.bases[tb.marca].calc; });
    yy += D.textos(x, yy, [algumaPartida ? { t: NOTA_PARTIDA + " (ver detalhe 1, folha 05).", cor: VERMELHO } : { t: "Placas e chumbadores dimensionados pelo cálculo (ver detalhe 1, folha 05 e o memorial)." }], T.nota * 0.92, { wmax: wMax });
    return { w: Math.max(t.w, 0), h: yy - y };
  }
  /* convenção do quadro de cargas (sinais e casos) */
  function convencao(D, d, c, x, y, wMax) {
    var T = D.E.T, yy = y;
    yy += tituloVista(D, x, yy, "CONVENÇÃO", null) + 0.5;
    var conv = ["V > 0: compressão na fundação; V < 0: tração (arrancamento).", "Hx > 0: no sentido da fila A para a fila B.", "Hz > 0: no sentido do eixo 1 para o eixo " + (d.nV + 1) + ".",
      "Valores característicos por caso; ELU = envoltória das combinações de cálculo (já majoradas)."];
    c.casos.forEach(function (cs) { conv.push(cs.id + " - " + cs.nome + "."); });
    var lin = conv.map(function (q) { return { t: q }; });
    if (c.semVento) lin.push({ t: "Vento: o resultado do cálculo não traz casos de vento - refazer o cálculo com o vento antes de emitir [PENDENTE].", cor: VERMELHO });
    yy += D.textos(x, yy, lin, T.nota * 0.92, { wmax: wMax });
    return { w: wMax, h: yy - y };
  }

  /* ---------------------------------------------------------------- PLANTA DE COBERTURA */
  function plantaCobertura(D, d, c, x0, y0, s) {
    var T = D.E.T;
    function PX(z) { return x0 + z * s; }
    function PY(x) { return y0 + (d.vao - x) * s; }
    eixosPlanta(D, d, PX, PY);
    var top = PY(d.vao), bot = PY(0), kMeio = Math.max(0, Math.floor(d.nV / 2) - (d.nV % 2 === 0 ? 1 : 0));
    /* rótulos e setas no meio de um trecho livre do vão (fora das correntes) */
    var cps = d.correntes && arr(d.correntes.posicoes).length ? arr(d.correntes.posicoes).map(Number) : (d.correntes ? [] : [0.5]);
    function fracLivre(ordem) { var ps = [0].concat(cps.slice().sort(function (a, b) { return a - b; })).concat([1]), gs = []; for (var i = 0; i + 1 < ps.length; i++) gs.push([ps[i + 1] - ps[i], (ps[i] + ps[i + 1]) / 2]); gs.sort(function (a, b) { return (b[0] - a[0]) || (a[1] - b[1]); }); return gs[Math.min(ordem, gs.length - 1)][1]; }
    var zMeio = d.zs[kMeio] + fracLivre(0) * (d.zs[Math.min(d.nV, kMeio + 1)] - d.zs[kMeio]);
    /* vigas (unifilar grossa) */
    var marcados = {};
    d.vigas.forEach(function (v) {
      var z = d.zs[v.k], xa = v.lado ? d.vao : 0, xb = d.meio;
      D.linha(PX(z), PY(xa), PX(z), PY(xb), "MET-PRINCIPAL", ' data-viga="' + v.marca + '"');
      if (!marcados[v.k] && v.lado === 0) {
        marcados[v.k] = 1;
        var xs = d.tercas.map(function (t) { return t.x; }).filter(function (x) { return x <= d.meio + 1e-6; }), q = Math.max(0, Math.floor(xs.length * 0.6) - 1);
        var xl = xs.length > 1 ? (xs[q] + xs[Math.min(q + 1, xs.length - 1)]) / 2 : d.vao / 4;
        D.texto(PX(z) + 1.2 + T.perfil * 0.76, PY(xl), v.marca, T.perfil, { al: "C", rot: -90 });
      }
    });
    /* terças */
    var pendT = !d.perfilTerca;
    d.tercas.forEach(function (t) {
      D.linha(PX(0), PY(t.x), PX(d.Lt), PY(t.x), "MET-PERFIL", ' data-terca="' + t.marca + '"');
      D.texto(PX(zMeio), PY(t.x) - 1.0, t.marca, T.perfil, { al: "C" });
      if (t.cumeeira) D.texto(PX(zMeio), PY(t.x) + 1.0 + 0.76 * T.perfil, "CUMEEIRA", T.perfil, { al: "C" });
    });
    /* contraventamento da cobertura (X) */
    var xs = {};
    d.cv.filter(function (cv) { return cv.tipo === "cobertura"; }).forEach(function (cv) {
      D.linha(PX(cv.a.z), PY(cv.a.x), PX(cv.c.z), PY(cv.c.x), "MET-CONTRAVENTO", ' data-cv="' + cv.marca + '"');
      var ch = cv.k + "|" + Math.round(Math.min(cv.a.x, cv.c.x) * 1000) + "|" + Math.round(Math.max(cv.a.x, cv.c.x) * 1000);
      if (!xs[ch]) xs[ch] = { cv: cv, n: 0 }; xs[ch].n++;
    });
    /* marca de cada X num lugar livre: nenhuma linha (terça, viga, corrente ou diagonal) atravessa o texto.
       Tenta à direita do cruzamento, depois em cima, embaixo e à esquerda, afastando aos poucos. */
    var segCV = d.cv.filter(function (cv) { return cv.tipo === "cobertura"; }).map(function (cv) { return [PX(cv.a.z), PY(cv.a.x), PX(cv.c.z), PY(cv.c.x)]; });
    var xsVert = d.zs.map(PX);
    for (var kc = 0; kc < d.nV; kc++) cps.forEach(function (fc) { xsVert.push(PX(d.zs[kc] + fc * (d.zs[kc + 1] - d.zs[kc]))); });
    var ysHor = d.tercas.map(function (t) { return PY(t.x); }).concat([PY(0), PY(d.vao)]);
    function cortaCaixa(sg, bx) {
      var t0 = 0, t1 = 1, dx = sg[2] - sg[0], dy = sg[3] - sg[1], pp = [-dx, dx, -dy, dy], qq = [sg[0] - bx[0], bx[2] - sg[0], sg[1] - bx[1], bx[3] - sg[1]];
      for (var i = 0; i < 4; i++) {
        if (Math.abs(pp[i]) < 1e-12) { if (qq[i] < 0) return false; continue; }
        var tt = qq[i] / pp[i]; if (pp[i] < 0) { if (tt > t1) return false; if (tt > t0) t0 = tt; } else { if (tt < t0) return false; if (tt < t1) t1 = tt; }
      }
      return t1 - t0 > 1e-9;
    }
    function caixaLivre(bx) {
      var g = 0.45, b2 = [bx[0] - g, bx[1] - g, bx[2] + g, bx[3] + g];
      if (ysHor.some(function (yy) { return yy > b2[1] && yy < b2[3]; })) return false;
      if (xsVert.some(function (xx) { return xx > b2[0] && xx < b2[2]; })) return false;
      return !segCV.some(function (sg) { return cortaCaixa(sg, b2); });
    }
    Object.keys(xs).forEach(function (ch) {
      var cv = xs[ch].cv, C = [PX((cv.a.z + cv.c.z) / 2), PY((cv.a.x + cv.c.x) / 2)], hm = T.perfil, wl = largTexto(cv.marca, hm), cand = [];
      [2.5, 3.5, 5, 7, 9].forEach(function (dl) { cand.push({ x: C[0] + dl, y: C[1] + 0.37 * hm, al: "E", bx: [C[0] + dl, C[1] - 0.39 * hm, C[0] + dl + wl, C[1] + 0.55 * hm] }); });
      [2, 3, 4.5, 6, 8].forEach(function (dl) { cand.push({ x: C[0], y: C[1] - dl, al: "C", bx: [C[0] - wl / 2, C[1] - dl - 0.76 * hm, C[0] + wl / 2, C[1] - dl + 0.18 * hm] }); });
      [2, 3, 4.5, 6, 8].forEach(function (dl) { cand.push({ x: C[0], y: C[1] + dl + 0.76 * hm, al: "C", bx: [C[0] - wl / 2, C[1] + dl, C[0] + wl / 2, C[1] + dl + 0.94 * hm] }); });
      [2.5, 3.5, 5, 7, 9].forEach(function (dl) { cand.push({ x: C[0] - dl, y: C[1] + 0.37 * hm, al: "D", bx: [C[0] - dl - wl, C[1] - 0.39 * hm, C[0] - dl, C[1] + 0.55 * hm] }); });
      /* F6 (15/10/2026): com UMA corrente no meio do vão (terça maior pelo cpe médio) a cruz em volta do centro não tem
         lugar livre — procura em grade no vão do X: no meio de cada intervalo entre linhas verticais e entre terças */
      var vs = xsVert.filter(function (xx) { return xx >= Math.min(PX(cv.a.z), PX(cv.c.z)) - 1e-6 && xx <= Math.max(PX(cv.a.z), PX(cv.c.z)) + 1e-6; }).sort(function (p, q) { return p - q; });
      var hs = ysHor.filter(function (yy) { return yy >= Math.min(PY(cv.a.x), PY(cv.c.x)) - 1e-6 && yy <= Math.max(PY(cv.a.x), PY(cv.c.x)) + 1e-6; }).sort(function (p, q) { return p - q; }), grade = [];
      for (var iv = 1; iv < vs.length; iv++) for (var ih = 1; ih < hs.length; ih++) [0.5, 0.3, 0.7].forEach(function (fv) { var gx = vs[iv - 1] + fv * (vs[iv] - vs[iv - 1]), gy = (hs[ih - 1] + hs[ih]) / 2; grade.push({ x: gx, y: gy + 0.37 * hm, al: "C", bx: [gx - wl / 2, gy - 0.39 * hm, gx + wl / 2, gy + 0.55 * hm], d: Math.abs(gx - C[0]) + Math.abs(gy - C[1]) }); });
      grade.sort(function (p, q) { return p.d - q.d; }); cand = cand.concat(grade);
      var ok = cand.filter(function (q) { return caixaLivre(q.bx); })[0] || cand[0];
      D.texto(ok.x, ok.y, cv.marca, hm, { al: ok.al });
    });
    /* correntes: as do cálculo, ou a posição de referência a meio vão (pendência) */
    var temCR = !!(d.correntes && (d.correntes.calc || arr(d.correntes.posicoes).length));
    for (var k = 0; k < d.nV; k++) {
      var zc = (d.zs[k] + d.zs[k + 1]) / 2;
      if (temCR) arr(d.correntes.posicoes).forEach(function (f) { var z = d.zs[k] + num(f, 0.5) * (d.zs[k + 1] - d.zs[k]); D.linha(PX(z), bot, PX(z), top, "MET-OCULTA", ' data-corrente="CR"'); });
      else D.linha(PX(zc), bot, PX(zc), top, "MET-PEND", ' data-corrente="CR"');
    }
    if (temCR && arr(d.correntes.posicoes).length && d.nV > 1) {
      var kR = Math.min(d.nV - 1, kMeio + 1), zR = d.zs[kR] + d.correntes.posicoes[0] * (d.zs[kR + 1] - d.zs[kR]), xsT0 = d.tercas.map(function (q) { return q.x; });
      var xR = xsT0.length > 2 ? (xsT0[1] + xsT0[2]) / 2 : d.vao * 0.15;
      D.texto(PX(zR) + 1.2 + T.perfil * 0.76, PY(xR), "CR1" + (d.ltCR ? " - " + diamTxt(d.ltCR) : ""), T.perfil, { al: "C", rot: -90 });
    }
    /* mãos-francesas (posições do cálculo); os rótulos vão no fim */
    var rotMF = [];
    d.mf.filter(function (m) { return m.tipo === "viga"; }).forEach(function (m) {
      var cx = PX(m.Z), cy = PY(m.X), r = 1.0;
      D.cheio([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], PRETO, ' data-mf="MF1"');
      rotMF.push([cx, cy, m.lado]);
    });
    /* caimento e beirais */
    /* a seta do caimento vai num vão sem contraventamento (o X atravessaria a seta e o texto), perto do meio */
    var baiasX = {}; d.cv.forEach(function (cv) { if (cv.tipo === "cobertura") baiasX[cv.k] = 1; });
    var ordK = [kMeio - 1, kMeio + 1, kMeio, kMeio - 2, kMeio + 2, kMeio - 3, kMeio + 3].filter(function (k) { return k >= 0 && k < d.nV; });
    var kC = ordK.filter(function (k) { return !baiasX[k]; })[0]; if (kC == null) kC = Math.min(d.nV - 1, Math.max(0, kMeio - 1));
    var zC = d.zs[kC] + fracLivre(1) * (d.zs[kC + 1] - d.zs[kC]);
    function caimento(xa, xb) {
      var ya = PY(xa), yb = PY(xb), xm = PX(zC);
      D.linha(xm, ya, xm, yb, "MET-SECUNDARIO"); D.seta(xm, yb, 0, ya > yb ? 1 : -1, 2.6);
      /* o texto fica entre duas terças (no vão das terças mais perto do meio da seta) */
      var xmd = (xa + xb) / 2, xsT2 = d.tercas.map(function (q) { return q.x; }).sort(function (p, q) { return p - q; }), lo = 0, hi = d.vao;
      xsT2.forEach(function (xx) { if (xx <= xmd && xx > lo) lo = xx; if (xx >= xmd && xx < hi) hi = xx; });
      D.texto(xm - 1.4, PY((lo + hi) / 2), "i = " + br(d.i * 100, 0) + " %", T.perfil, { al: "C", rot: -90, attr: ' data-caimento="1"' });
    }
    var lin = d.tercas.map(function (t) { return t.x; });
    function entre(a, b) { var ls = lin.filter(function (x) { return x > a + 1e-6 && x < b - 1e-6; }); return ls; }
    if (d.aguas === 2) {
      var e1 = entre(0, d.meio), e2 = entre(d.meio, d.vao);
      caimento(e1.length > 1 ? e1[e1.length - 1] - 0.15 * (e1[1] - e1[0]) : d.meio * 0.8, e1.length ? e1[0] * 0.5 + 0.1 : d.meio * 0.2);
      caimento(e2.length > 1 ? e2[0] + 0.15 * (e2[1] - e2[0]) : d.meio * 1.2, e2.length ? (e2[e2.length - 1] + d.vao) / 2 - 0.1 : d.vao * 0.9);
    } else caimento(d.vao * 0.8, d.vao * 0.2);
    D.texto(PX(zMeio), bot + 4.5, "BEIRAL", T.perfil, { al: "C" });
    if (d.aguas === 2) D.texto(PX(zMeio), top - 4.5, "BEIRAL", T.perfil, { al: "C" });
    /* cotas: em cima os vãos entre eixos; à esquerda as terças em planta */
    var acc = acumulados(d.zs);
    D.cadeia(d.zs.map(function (z) { return [PX(z), top]; }), 10, parciais(acc), { semExt: true });
    D.cota(PX(0), top, PX(d.Lt), top, 18, mm(d.Lt), { semExt: true, evitar: d.zs.map(function (z) { return [PX(z), top]; }) });
    var xT = [0].concat(d.tercas.map(function (t) { return t.x; })).concat([d.vao]).filter(function (x, i, a) { return !i || Math.abs(x - a[i - 1]) > 1e-6; }), aT = acumulados(xT);
    D.cadeia(xT.map(function (x) { return [PX(0), PY(x)]; }), 10, parciais(aT), { semExt: true });
    D.cota(PX(0), PY(0), PX(0), PY(d.vao), 18, mm(d.vao), { semExt: true });
    /* rótulos das mãos-francesas por último, num lugar livre perto de cada símbolo */
    rotMF.forEach(function (q) {
      var hm = T.perfil * 0.9, wm = largTexto("MF1", hm);
      D.textoLivre([q[0] + 1.6 + wm / 2, q[2] ? q[1] + 1.6 + 0.47 * hm : q[1] - 1.6 - 0.47 * hm], "MF1", hm, [q[0] - 16, q[1] - 12, q[0] + 16, q[1] + 12]);
    });
    return { pendTerca: pendT, temCR: !!temCR };
  }

  /* ---------------------------------------------------------------- PÓRTICO EM ELEVAÇÃO
   * o = { ox, oy (papel: eixo da fila A / cota 0), s, tipo: "tipico"|"oitao", k, espelhar, simples, folhaDet } */
  function vistaPortico(D, d, c, o) {
    var s = o.s, T = D.E.T, sp = d.secP, sv = d.secV, st = d.secT, esp = !!o.espelhar, oit = o.tipo === "oitao";
    var dP = num(sp.d, 300) / 1000, dV = num(sv.d, 300) / 1000, bfT = num(st.bf, 100) / 1000, tP = (c.lig ? c.lig.joelho.t : 16) / 1000;
    var hv = dV / 2 / d.co, meio = d.meio, yA = d.yT, kPap = s / 1000;
    function X(x) { return o.ox + (esp ? d.vao - x : x) * s; }
    function Y(y) { return o.oy - y * s; }
    function retM(x1, y1, x2, y2, cam, extra) { var a = X(x1), b = X(x2); D.ret(Math.min(a, b), Math.min(Y(y1), Y(y2)), Math.abs(b - a), Math.abs(Y(y2) - Y(y1)), cam, extra); }
    function cheioM(x1, y1, x2, y2) { var a = X(x1), b = X(x2); D.cheio([[a, Y(y1)], [b, Y(y1)], [b, Y(y2)], [a, Y(y2)]]); }
    var pb = c.lig && d.pilares[0] ? c.lig.bases[d.pilares[0].marcaBase] : null, pbT = c.lig && d.taps[0] ? c.lig.bases[d.taps[0].marcaBase] : null;
    var tPl = (pb ? pb.t : 25) / 1000, gr = (pb ? pb.graute : 25) / 1000, yF = -(tPl + gr);
    /* fundação (contexto) e placas de base */
    D.linha(X(-0.5), Y(yF), X(d.vao + 0.5), Y(yF), "MET-CONTEXTO");
    function placa(xc, larg) { retM(xc - larg / 2, -tPl, xc + larg / 2, 0, "MET-PERFIL"); var a = X(xc - larg / 2 - 0.03), b = X(xc + larg / 2 + 0.03); D.hachura(Math.min(a, b), Y(-tPl), Math.abs(b - a), gr * s, 0.9); }
    placa(0, pb ? pb.N / 1000 : dP + 0.15); placa(d.vao, pb ? pb.N / 1000 : dP + 0.15);
    /* pilares e chapas do joelho */
    var lados = [{ x: 0, sg: 1 }, { x: d.vao, sg: -1 }], topos = [];
    lados.forEach(function (L0) {
      var xin = L0.x + L0.sg * dP / 2, xpl = xin + L0.sg * tP, yc = yA(xin + L0.sg * tP / 2), yTop = yA(xpl) + hv;
      topos.push(yTop);
      retM(L0.x - dP / 2, 0, L0.x + dP / 2, yTop, "MET-PERFIL");
      cheioM(xin, yc - hv, xpl, yc + hv);
    });
    function vigaTrecho(xa, xb) {
      var ya = yA(xa), yb = yA(xb);
      D.linha(X(xa), Y(ya + hv), X(xb), Y(yb + hv), "MET-PERFIL"); D.linha(X(xa), Y(ya - hv), X(xb), Y(yb - hv), "MET-PERFIL");
      D.linha(X(xa), Y(ya + hv), X(xa), Y(ya - hv), "MET-PERFIL"); D.linha(X(xb), Y(yb + hv), X(xb), Y(yb - hv), "MET-PERFIL");
      var tf = num(sv.tf, 10) / 1000 / d.co;
      if (tf * s >= 0.35) { D.linha(X(xa), Y(ya + hv - tf), X(xb), Y(yb + hv - tf), "MET-FINA"); D.linha(X(xa), Y(ya - hv + tf), X(xb), Y(yb - hv + tf), "MET-FINA"); }
    }
    if (d.aguas === 2) {
      vigaTrecho(dP / 2 + tP, meio - tP); vigaTrecho(meio + tP, d.vao - dP / 2 - tP);
      cheioM(meio - tP, yA(meio) - hv, meio + tP, yA(meio) + hv);
    } else vigaTrecho(dP / 2 + tP, d.vao - dP / 2 - tP);
    /* colunas de tapamento */
    var taps = oit ? d.taps.filter(function (t) { return t.k === o.k; }) : [];
    taps.forEach(function (t) {
      retM(t.x - bfT / 2, 0, t.x + bfT / 2, yA(t.x) - hv, "MET-PERFIL");
      placa(t.x, pbT ? pbT.B / 1000 : bfT + 0.15);
    });
    /* travessas: laterais em seção na face de fora dos pilares; do oitão em vista */
    var ws = 3.0 / s, hs = 4.4 / s;
    lados.forEach(function (L0) {
      var lista = L0.x === 0 ? d.travE : d.travD, xf = L0.x - L0.sg * dP / 2;
      lista.forEach(function (y, i) { retM(xf - L0.sg * ws, y - hs / 2, xf, y + hs / 2, "MET-SECUNDARIO"); });
    });
    var tirO = [];   /* tirantes do oitão desenhados: [x, y da travessa de baixo, y da face de baixo da viga] */
    if (oit) {
      var trO = o.k === 0 ? d.travF : d.travB;
      trO.forEach(function (y) { D.linha(X(dP / 2), Y(y), X(d.vao - dP / 2), Y(y), "MET-PERFIL"); });
      if (d.tirOit.length && trO.length) {
        var xsO = [0].concat(taps.map(function (tq) { return tq.x; })).concat([d.vao]).sort(function (p, q) { return p - q; });
        for (var io = 0; io + 1 < xsO.length; io++) d.tirOit.forEach(function (f) { var xx = xsO[io] + f * (xsO[io + 1] - xsO[io]); D.linha(X(xx), Y(yA(xx) - hv), X(xx), Y(trO[0]), "MET-OCULTA", ' data-tirante="TR2"'); tirO.push([xx, trO[0], yA(xx) - hv]); });
      }
    }
    /* terças sobre as vigas (seção) */
    function simbTerca(x) {
      var y0 = (Math.abs(x) < 1e-6 || Math.abs(x - d.vao) < 1e-6) ? (Math.abs(x) < 1e-6 ? topos[0] : topos[1]) : yA(x) + hv;
      var dx = 0.05, ang = Math.atan2(Y(yA(Math.min(d.vao, x + dx))) - Y(yA(Math.max(0, x - dx))), X(Math.min(d.vao, x + dx)) - X(Math.max(0, x - dx)));
      if (Math.abs(x - meio) < 1e-6 && d.aguas === 2) ang = 0;
      var ux = Math.cos(ang), uy = Math.sin(ang), nx = uy, ny = -ux; if (ny > 0) { nx = -nx; ny = -ny; }
      var bx = X(x), by = Y(y0), w = 1.4, hh = 4.0;
      D.poli([[bx - ux * w, by - uy * w], [bx - ux * w + nx * hh, by - uy * w + ny * hh], [bx + ux * w + nx * hh, by + uy * w + ny * hh], [bx + ux * w, by + uy * w]], "MET-SECUNDARIO", true);
      return [bx + nx * hh, by + ny * hh];
    }
    var topoT = {};
    d.tercas.forEach(function (t) { topoT[t.x] = simbTerca(t.x); });
    /* mãos-francesas (pórtico típico) */
    var mfs = oit ? [] : d.mf.filter(function (m) { return m.tipo === "viga" && m.k === o.k; });
    mfs.forEach(function (m) { D.linha(X(m.X), Y(m.Y - hv), X(m.X), Y(m.Y + hv), "MET-SECUNDARIO"); });
    /* eixos A/B e balões */
    var yb0 = Y(yF);
    lados.forEach(function (L0, j) {
      var letra = j === 0 ? d.filas[0] && d.filas[0].letra : d.filas[d.filas.length - 1] && d.filas[d.filas.length - 1].letra;
      var r = D.raioBalao(letra || "?");
      D.linha(X(L0.x), Y(topos[j]) - 6, X(L0.x), yb0 + 30 - r, "MET-EIXO");
      D.balao(X(L0.x), yb0 + 30, letra || "?");
    });
    /* cotas: vão (com as colunas de tapamento), pé-direito com as travessas, altura da cumeeira */
    var xs = [0].concat(taps.map(function (t) { return t.x; })).concat([d.vao]).sort(function (a, b) { return a - b; });
    var Pv = xs.map(function (x) { return [X(x), yb0]; }); if (esp) Pv.reverse();
    var acx = acumulados(esp ? xs.slice().reverse().map(function (x) { return d.vao - x; }) : xs);
    if (xs.length > 2) D.cadeia(Pv, -10, parciais(acx), { semExt: true });
    D.cota(Pv[0][0], yb0, Pv[Pv.length - 1][0], yb0, xs.length > 2 ? -18 : -10, mm(d.vao), { semExt: true, attrs: [' data-cota="vao-portico"'] });
    var xEsq = esp ? d.vao : 0, xDir = esp ? 0 : d.vao, travEsq = xEsq === 0 ? d.travE : d.travD;
    var ys = [0].concat(travEsq).concat([d.H]), Pl = ys.map(function (y) { return [X(xEsq) - dP / 2 * s, Y(y)]; }), acy = acumulados(ys);
    if (ys.length > 2) D.cadeia(Pl, 10, parciais(acy), { desde: ys.map(function () { return 1.0; }) });
    D.cota(Pl[0][0], Pl[0][1], Pl[Pl.length - 1][0], Pl[Pl.length - 1][1], ys.length > 2 ? 18 : 10, mm(d.H), { attrs: [' data-cota="pe-direito"'] });
    var yC = d.aguas === 2 ? yA(meio) : yA(d.vao), xr = X(xDir) + dP / 2 * s;
    D.cota(xr, Y(0), xr, Y(yC), -10, mm(yC), { attrs: [' data-cota="cumeeira"'] });
    var xn = xr + 17;
    D.nivel(xn, Y(0), "±0,00m"); D.nivel(xn, Y(d.H), "+" + br(d.H, 2) + "m");
    if (Math.abs(yC - d.H) > 0.05) D.nivel(xn, Y(yC), "+" + br(yC, 2) + "m");
    /* cadeia das terças ao longo da água (lado esquerdo do modelo) */
    if (!o.simples) {
      var xq = d.tercas.map(function (t) { return t.x; }).filter(function (x) { return x <= meio + 1e-6; });
      if (xq.length > 1) {
        var Pq = xq.map(function (x) { return [X(x), Y(yA(x))]; }), accS = xq.map(function (x) { return Math.round(x / d.co * 1000); });
        if (esp) { Pq.reverse(); accS = accS.slice().reverse().map(function (v) { return accS[accS.length - 1] - v; }); }
        var offq = hv * s + 4.0 + 6.5;
        var ux = Pq[Pq.length - 1][0] - Pq[0][0], uy = Pq[Pq.length - 1][1] - Pq[0][1], L = hip(ux, uy), sgn = (uy / L * 1) < 0 || ux > 0 ? 1 : -1;
        var nyv = -(ux / L); var off = nyv < 0 ? offq : -offq;
        D.cadeia(Pq, off, parciais(accS), { semExt: true });
      }
    }
    /* textos dos perfis */
    var h = T.perfil, ang = Math.atan2(Y(yA(meio)) - Y(yA(0)), X(meio) - X(0)) * 180 / Math.PI;
    var pilA = d.pilares.filter(function (p) { return p.fila === (d.filas[0] || {}).letra && (oit ? p.k === o.k : p.k !== 0 && p.k !== d.nV); });
    var pilB = d.pilares.filter(function (p) { return p.fila === (d.filas[d.filas.length - 1] || {}).letra && (oit ? p.k === o.k : p.k !== 0 && p.k !== d.nV); });
    var vMarca = oit ? (d.vigas.filter(function (v) { return v.oitao; })[0] || {}).marca : (d.vigas.filter(function (v) { return !v.oitao; })[0] || {}).marca;
    /* rótulo vertical ao lado de uma coluna, no trecho livre entre as travessas que a cruzam (texto nunca cortado por
       linha): uma linha se couber; senão marca e perfil em duas linhas; senão a letra reduz até 75 %. lado: +1 = à
       direita da face xFace no papel, -1 = à esquerda; a marca fica sempre em cima na leitura. */
    function rotuloColuna(xFace, lado, cortes, y0, y1, yPref, marca, perfil, h0) {
      var ys = [y0].concat(cortes.filter(function (y) { return y > y0 + 1e-6 && y < y1 - 1e-6; })).concat([y1]).sort(function (p, q) { return p - q; });
      var gaps = []; for (var ig = 0; ig + 1 < ys.length; ig++) gaps.push([ys[ig], ys[ig + 1]]);
      var mg = 0.8 / s;
      function tenta(linhas, hh) {
        var Lm = 0; linhas.forEach(function (t) { Lm = Math.max(Lm, largTexto(t, hh) / s); });
        var best = null, bd = 1e9;
        gaps.forEach(function (g) {
          if (g[1] - g[0] - 2 * mg < Lm) return;
          var c = Math.max(g[0] + mg + Lm / 2, Math.min(g[1] - mg - Lm / 2, yPref)), dd = Math.abs(c - yPref);
          if (dd < bd - 1e-9) { bd = dd; best = c; }
        });
        return best == null ? null : { c: best, linhas: linhas, h: hh };
      }
      var rr = tenta([marca + " - " + perfil], h0) || tenta([marca, perfil], h0);
      for (var fr = 0.95; !rr && h0 * fr >= T.minimo - 1e-9; fr -= 0.05) rr = tenta([marca, perfil], h0 * fr);
      if (!rr) rr = tenta([marca, perfil], T.minimo);
      if (!rr) {
        /* nem na letra mínima a marca e o perfil cabem EM PÉ entre as travessas (escala pequena): escreve DEITADO, em
           duas linhas, ao lado da coluna, no maior trecho livre — texto nunca cortado por linha nem abaixo da letra mínima */
        var hh = Math.max(T.minimo, Math.min(h0, h0 * 0.84)), wl = Math.max(largTexto(marca, hh), largTexto(perfil, hh)), lh = hh * 1.45;
        var ordem = gaps.slice().sort(function (p, q) { return (q[1] - q[0]) - (p[1] - p[0]); }), xt0 = lado > 0 ? xFace + 1.2 : xFace - 1.2;
        for (var io = 0; io < ordem.length; io++) {
          var yc = Y((ordem[io][0] + ordem[io][1]) / 2), x0h = lado > 0 ? xt0 : xt0 - wl;
          if (D.livre([x0h, yc - lh / 2 - 0.39 * hh, x0h + wl, yc + lh / 2 + 0.55 * hh], 0.3)) {
            D.texto(xt0, yc - lh / 2 + 0.37 * hh, marca, hh, { al: lado > 0 ? "E" : "D" });
            D.texto(xt0, yc + lh / 2 + 0.37 * hh, perfil, hh, { al: lado > 0 ? "E" : "D" });
            return;
          }
        }
        var gm = gaps.reduce(function (a, g) { return g[1] - g[0] > a[1] - a[0] ? g : a; }, gaps[0]); rr = { c: (gm[0] + gm[1]) / 2, linhas: [marca, perfil], h: Math.max(T.minimo, Math.min(h0, h0 * 0.75)) };
      }
      var n = rr.linhas.length;
      rr.linhas.forEach(function (t, j) {
        var pos = lado > 0 ? j : n - 1 - j;
        D.texto(xFace + lado * (1.2 + pos * 1.45 * rr.h) + (lado > 0 ? rr.h * 0.76 : 0), Y(rr.c), t, rr.h, { al: "C", rot: -90 });
      });
    }
    var trOit = oit ? (o.k === 0 ? d.travF : d.travB) : [];
    [[0, pilA], [d.vao, pilB]].forEach(function (q) {
      var sg = q[0] === 0 ? 1 : -1, xin = q[0] + sg * dP / 2, dentro = (X(xin + sg * 0.1) - X(xin)) > 0 ? 1 : -1;
      rotuloColuna(X(xin), dentro, trOit, 0, yA(xin + sg * tP / 2) - hv, d.H * 0.42, seq(q[1].map(function (p) { return p.marca; })), perfilCurto(d.pilares[0] ? d.pilares[0].perfil : ""), h);
    });
    /* rótulo da viga e da inclinação no maior trecho livre de cada água (sem coluna de tapamento nem mão-francesa) */
    function vaoLivre(xa, xb, obst) {
      var ps = [xa].concat(obst.filter(function (x) { return x > xa + 1e-6 && x < xb - 1e-6; }).sort(function (p, q) { return p - q; })).concat([xb]), best = [xa, xb], bw = -1;
      for (var i = 0; i + 1 < ps.length; i++) if (ps[i + 1] - ps[i] > bw) { bw = ps[i + 1] - ps[i]; best = [ps[i], ps[i + 1]]; }
      return best;
    }
    var obst = taps.map(function (t) { return t.x; }).concat(mfs.map(function (m) { return m.X; }));
    if (oit && d.tirOit.length) { var xsO2 = [0].concat(taps.map(function (t) { return t.x; })).concat([d.vao]).sort(function (p, q) { return p - q; }); for (var i2 = 0; i2 + 1 < xsO2.length; i2++) d.tirOit.forEach(function (f) { obst.push(xsO2[i2] + f * (xsO2[i2 + 1] - xsO2[i2])); }); }
    var gL = vaoLivre(dP / 2 + tP, d.aguas === 2 ? meio - tP : d.vao - dP / 2 - tP, obst), gR = d.aguas === 2 ? vaoLivre(meio + tP, d.vao - dP / 2 - tP, obst) : null;
    function angEm(x) { var a2 = Math.atan2(Y(yA(x + 0.05)) - Y(yA(x - 0.05)), X(x + 0.05) - X(x - 0.05)) * 180 / Math.PI; if (a2 > 90) a2 -= 180; if (a2 < -90) a2 += 180; return a2; }
    /* rótulo sob a viga: na posição preferida ou na mais perto dela, ao longo da água, onde nada o atravesse */
    function rotuloViga(xPref, xa, xb, s0, gT) {
      var cands = [], passo = 0.05;
      for (var dx = 0; dx <= (xb - xa) + 1e-9; dx += passo) { [xPref + dx, xPref - dx].forEach(function (xx) { if (xx >= xa - 1e-9 && xx <= xb + 1e-9) cands.push(xx); }); }
      var ok = null;
      for (var i = 0; i < cands.length && ok == null; i++) {
        var xx = cands[i], op = { al: "C", rot: angEm(xx) }, q = caixaTexto(X(xx), Y(yA(xx) - hv) + 1.2 + h * 0.76, s0, h, op);
        var fora = q.some(function (p) { return p[0] < Math.min(X(xa), X(xb)) || p[0] > Math.max(X(xa), X(xb)); });
        if (!fora && D.livreQ(q, 0.3, gT)) ok = xx;
      }
      if (ok == null) ok = xPref;
      D.texto(X(ok), Y(yA(ok) - hv) + 1.2 + h * 0.76, s0, h, { al: "C", rot: angEm(ok) });
      return ok;
    }
    var rotulosViga = [];
    if (!(o.simples && oit)) {
      var nomeViga = (vMarca || "V1") + " - " + perfilCurto(d.vigas[0] ? d.vigas[0].perfil : "");
      if (gL) rotulosViga.push([gL[0] + 0.38 * (gL[1] - gL[0]), dP / 2 + tP, d.aguas === 2 ? meio - tP : d.vao - dP / 2 - tP, nomeViga]);
      if (gR) rotulosViga.push([gR[1] - 0.38 * (gR[1] - gR[0]), meio + tP, d.vao - dP / 2 - tP, nomeViga]);
    }
    var comInclinacao = !o.simples && !oit && gL;
    var trTap = oit ? (o.k === 0 ? d.travF : d.travB) : [];
    taps.forEach(function (t) {
      /* nome da coluna à direita dela no papel, de preferência no meio do maior trecho entre as travessas do oitão */
      var yTopo = yA(t.x) - hv, ys = [0].concat(trTap.filter(function (y) { return y < yTopo; })).concat([yTopo]).sort(function (p, q) { return p - q; }), gy = [0, yTopo], gw = -1;
      for (var iy = 0; iy + 1 < ys.length; iy++) if (ys[iy + 1] - ys[iy] > gw) { gw = ys[iy + 1] - ys[iy]; gy = [ys[iy], ys[iy + 1]]; }
      rotuloColuna(X(t.x) + bfT / 2 * s, 1, trTap, 0, yTopo, (gy[0] + gy[1]) / 2, t.marca, perfilCurto(t.perfil), h);
    });
    /* rótulos de travessas e terças */
    /* TL1: sempre do lado de fora do pilar da esquerda do papel, logo acima (ou abaixo) do símbolo da travessa mais alta,
       fora da linha de chamada da cota (que passa na altura da travessa) */
    var travY = travEsq.length ? travEsq[travEsq.length - 1] : null;
    if (travY != null) {
      var xL = X(xEsq) - (dP / 2 * s + 1.2), yAbaixo = travEsq.length > 1 ? travEsq[travEsq.length - 2] : 0, acima = (d.H - travY) >= (travY - yAbaixo) || (d.H - travY) * s >= 8;
      D.texto(xL, acima ? Y(travY) - 2.2 - 0.8 : Y(travY) + 2.2 + 0.8 + 0.743 * h * 0.9, "TL1", h * 0.9, { al: "D" });
    }
    if (oit && (o.k === 0 ? d.travF : d.travB).length) {
      var yTF = (o.k === 0 ? d.travF : d.travB)[0], xTF = taps.length ? taps[0].x + 0.25 * ((taps[1] ? taps[1].x : d.vao) - taps[0].x) : d.vao * 0.3;
      D.texto(X(xTF), Y(yTF) - 1.0, "TF1", h, { al: "C" });
    }
    var tPend = !d.perfilTerca;
    /* terças da água da direita (duas águas) ou da metade alta (uma água): onde vão a chamada da TC1 e o balão 4 */
    var xs2 = d.tercas.map(function (t) { return t.x; }).filter(function (x) { return d.aguas === 2 ? x > meio + 1e-6 : x > d.vao * 0.45 && x < d.vao - 1e-6; });
    if (xs2.length && !o.simples) {
      var xt = xs2[0], p0 = topoT[xt];
      var sx0 = esp ? -1 : 1;
      if (p0) D.chamada(p0[0], p0[1], p0[0] + sx0 * 10, p0[1] - 9, [{ t: "TC1 (TÍP.)" }].concat(tPend ? [{ t: "PERFIL A DIMENSIONAR", cor: VERMELHO }] : [{ t: perfilCurto(d.perfilTerca.nome) }]),
        { h: h, dir: sx0, alternativas: [[p0[0] + sx0 * 10, p0[1] - 15], [p0[0] + sx0 * 12, p0[1] - 21], [p0[0] + sx0 * 14, p0[1] - 27], [p0[0] + sx0 * 16, p0[1] - 33]] });
    }
    /* balões das ligações */
    var fd = o.folhaDet || "05";
    if (!o.simples) {
      /* o pilar da esquerda do papel tem o lado de dentro sempre à direita (espelhada ou não) */
      var xb = X(xEsq) + dP / 2 * s;
      D.marcaLig(xb + 11, Y(0) - 11, "1", fd, xb, Y(0));
      function balaoJoelho(xa, numero) {
        var xm = xa + (xa === 0 ? 1 : -1) * (dP / 2 + tP), sgP = X(xm) > X(xa) ? 1 : -1, xk = X(xm), yk = Y(yA(xm) - hv);
        D.marcaLig(xk + sgP * 13, yk + 15, numero, fd, xk, yk);
      }
      if (d.aguas === 2) { balaoJoelho(xEsq, "2"); D.marcaLig(X(meio) + (esp ? -12 : 12), Y(yA(meio) + hv) - 14, "3", fd, X(meio), Y(yA(meio) + hv)); }
      else { balaoJoelho(0, "2"); balaoJoelho(d.vao, "3"); }   /* uma água: 2 = joelho do lado baixo, 3 = do lado alto */
      var xc4 = xs2.length > 3 ? xs2[3] : (xs2.length > 1 ? xs2[xs2.length - 2] : null);
      if (xc4 != null && topoT[xc4]) {
        var s4 = esp ? -1 : 1, xsB = [xc4].concat(xs2.slice(1)), cand4 = [];
        if (d.aguas === 2) xsB = xsB.concat(d.tercas.map(function (t) { return t.x; }).filter(function (x) { return x < meio - 1e-6 && x > 1e-6; }).reverse());
        [-10, -16, -22, -28].forEach(function (dy) { xsB.forEach(function (xq) { var tq = topoT[xq]; if (tq) [s4, -s4].forEach(function (sd) { cand4.push({ cx: tq[0] + sd * 9, cy: tq[1] + dy, px: tq[0], py: tq[1] }); }); }); });
        var b4 = D.lugarBalao(cand4);
        D.marcaLig(b4.cx, b4.cy, "4", fd, b4.px, b4.py);
      }
      var mf = mfs.filter(function (m) { return m.lado === 1; })[0] || mfs[0];
      if (mf) D.marcaLig(X(mf.X) + (esp ? 10 : -10), Y(mf.Y - hv) + 13, "6", fd, X(mf.X), Y(mf.Y - hv));
      if (oit && taps.length) { var tq = taps[taps.length - 1]; D.marcaLig(X(tq.x) + (esp ? -10 : 10), Y(0) - 11, "1", fd, X(tq.x), Y(0)); }
    }
    var xsRot = rotulosViga.map(function (rv) { return rotuloViga(rv[0], rv[1], rv[2], rv[3], rv[4]); });
    if (tirO.length) D.rotuloLinha(tirO.map(function (tq) { return [X(tq[0]), Y(tq[1]), Y(tq[2])]; }), ["TR2" + (d.ltTR2 ? " - " + diamTxt(d.ltTR2) : ""), "TR2"], h * 0.9);
    if (comInclinacao) {
      /* a inclinação na mesma água do nome da viga, do outro lado dela (longe: não pode parecer um texto só) */
      var wa = dP / 2 + tP, wb = d.aguas === 2 ? meio - tP : d.vao - dP / 2 - tP, xv = xsRot.length ? xsRot[0] : (wa + wb) / 2;
      var xiPref = xv < (wa + wb) / 2 ? xv + 0.45 * (wb - wa) : xv - 0.45 * (wb - wa);
      rotuloViga(Math.max(wa, Math.min(wb, xiPref)), wa, wb, "i = " + br(d.i * 100, 0) + " %", 5);
    }
    return { topo: Y(Math.max(yC + hv, topos[0], topos[1])) };
  }

  /* ---------------------------------------------------------------- ELEVAÇÃO LATERAL (fila A ou B, vista externa) */
  function vistaLateral(D, d, c, o) {
    var s = o.s, T = D.E.T, esp = !!o.espelhar, fx = o.fila === (d.filas[0] || {}).letra ? 0 : d.vao, trav = fx === 0 ? d.travE : d.travD;
    function X(z) { return o.ox + (esp ? d.Lt - z : z) * s; }
    function Y(y) { return o.oy - y * s; }
    var bf = num(d.secP.bf, 150) / 1000, hv = num(d.secV.d, 300) / 2000 / d.co, topo = d.H + hv;
    var pb = c.lig && d.pilares[0] ? c.lig.bases[d.pilares[0].marcaBase] : null, tPl = (pb ? pb.t : 25) / 1000, gr = (pb ? pb.graute : 25) / 1000, yF = -(tPl + gr);
    D.linha(X(-0.5), Y(yF), X(d.Lt + 0.5), Y(yF), "MET-CONTEXTO");
    var pils = d.pilares.filter(function (p) { return Math.abs(p.x - fx) < 1e-6; }), rotTR1 = null;
    /* fechamento */
    var f = d.fech[fx === 0 ? "esquerda" : "direita"] || {}, h = T.perfil;
    /* a parede (contorno agora; a hachura no fim, com o rótulo já no lugar e a hachura interrompida em volta dele) */
    var parede = f.tipo === "misto" || f.tipo === "alvenaria" || f.tipo === "premoldado", ha = 0, a0 = Math.min(X(0), X(d.Lt));
    if (parede) { ha = f.tipo === "misto" ? num(f.alturaAlvenaria, 3) : d.H; D.ret(a0, Y(ha), d.Lt * s, ha * s, "MET-CONTEXTO"); }
    pils.forEach(function (p) {
      var a = X(p.z - bf / 2), b = X(p.z + bf / 2);
      D.ret(Math.min(a, b), Y(topo), Math.abs(b - a), topo * s, "MET-PERFIL");
      var lp = pb ? pb.B / 1000 : bf + 0.15, a1 = X(p.z - lp / 2), b1 = X(p.z + lp / 2);
      D.ret(Math.min(a1, b1), Y(0), Math.abs(b1 - a1), tPl * s, "MET-PERFIL");
      D.texto(X(p.z), Y(topo) - 3.0 - 2.0, p.marca, T.marca, { al: "C" });
    });
    /* terça de beiral sobre os pilares */
    D.ret(Math.min(X(0), X(d.Lt)), Y(topo) - 3.0, d.Lt * s, 3.0, "MET-PERFIL");
    trav.forEach(function (y) { D.linha(X(0), Y(y), X(d.Lt), Y(y), "MET-PERFIL"); });
    /* tirantes das travessas: do beiral até a travessa mais baixa, nas posições do cálculo */
    if (d.tirLat.length && trav.length) {
      for (var kt = 0; kt < d.nV; kt++) d.tirLat.forEach(function (f) { var z = d.zs[kt] + f * (d.zs[kt + 1] - d.zs[kt]); D.linha(X(z), Y(d.H), X(z), Y(trav[0]), "MET-OCULTA", ' data-tirante="TR1"'); });
      rotTR1 = [];   /* rótulo no fim da vista, num trecho livre de uma das linhas (entre travessas) */
      for (var kq = 0; kq < d.nV; kq++) d.tirLat.forEach(function (f) { var z = d.zs[kq] + f * (d.zs[kq + 1] - d.zs[kq]), ys = trav.concat([d.H]); for (var iy = 0; iy + 1 < ys.length; iy++) rotTR1.push([X(z), Y(ys[iy]), Y(ys[iy + 1])]); });
    }
    /* contraventamento vertical */
    var cvs = d.cv.filter(function (cv) { return cv.tipo === "parede" && Math.abs(cv.a.x - fx) < 1e-6; }), feitos = {}, rotCV = [];
    cvs.forEach(function (cv) {
      D.linha(X(cv.a.z), Y(cv.a.y), X(cv.c.z), Y(cv.c.y), "MET-CONTRAVENTO", ' data-cv="' + cv.marca + '"');
      if (!feitos[cv.k]) { feitos[cv.k] = 1; rotCV.push(cv); }
    });
    /* eixos */
    var yb0 = Y(yF);
    /* o eixo para na terça de beiral: em cima fica a marca do pilar */
    d.zs.forEach(function (z, k) { var rot = String(k + 1), r = D.raioBalao(rot); D.linha(X(z), Y(topo) - 3.0, X(z), yb0 + 26 - r, "MET-EIXO"); D.balao(X(z), yb0 + 26, rot); });
    var zs = esp ? d.zs.slice().reverse() : d.zs, acc = acumulados(esp ? zs.map(function (z) { return d.Lt - z; }) : zs);
    D.cadeia(zs.map(function (z) { return [X(z), yb0]; }), -8, parciais(acc), { semExt: true });
    D.cota(X(zs[0]), yb0, X(zs[zs.length - 1]), yb0, -15, mm(d.Lt), { semExt: true, evitar: d.zs.map(function (z) { return [X(z), yb0]; }) });
    var x0 = Math.min(X(0), X(d.Lt)) - bf / 2 * s, ys = [0].concat(trav).concat([d.H]), Pl = ys.map(function (y) { return [x0, Y(y)]; });
    if (ys.length > 2) D.cadeia(Pl, 8, parciais(acumulados(ys)));
    D.cota(x0, Y(0), x0, Y(d.H), ys.length > 2 ? 15 : 8, mm(d.H));
    if (trav.length) D.texto(Math.max(X(0), X(d.Lt)) + bf / 2 * s + 1.2, Y(trav[trav.length - 1]) + 0.37 * h, "TL1", h * 0.9);
    D.texto(Math.max(X(0), X(d.Lt)) + bf / 2 * s + 1.2, Y(topo) - 1.5 + 0.37 * h, "TB1", h * 0.9);
    /* por último, com tudo o mais desenhado, os rótulos que precisam de um lugar livre */
    if (rotTR1 && rotTR1.length) {
      /* começa pelo 2º vão (o 1º costuma ter o X do contraventamento) */
      var ordT = rotTR1.slice(d.tirLat.length * Math.max(1, trav.length)).concat(rotTR1.slice(0, d.tirLat.length * Math.max(1, trav.length)));
      D.rotuloLinha(ordT, ["TR1" + (d.ltTR1 ? " - " + diamTxt(d.ltTR1) : ""), "TR1"], h * 0.9);
    }
    function caixaX(cv) { return [Math.min(X(cv.a.z), X(cv.c.z)), Math.min(Y(cv.a.y), Y(cv.c.y)), Math.max(X(cv.a.z), X(cv.c.z)), Math.max(Y(cv.a.y), Y(cv.c.y))]; }
    if (cvs.length && !o.simples) {
      /* balão 5 de preferência no triângulo de cima do X (entre a travessa mais alta e o beiral); chamada até a ponta da diagonal */
      var cv0 = cvs[0], top0 = cv0.a.y > cv0.c.y ? cv0.a : cv0.c, px = X(top0.z), py = Y(top0.y), bxX = caixaX(cv0);
      var zc0 = (cv0.a.z + cv0.c.z) / 2, yAlto = trav.length ? (trav[trav.length - 1] + d.H) / 2 : d.H * 0.8;
      var cb = D.procura([X(zc0), Y(yAlto)], 9.0, 9.0, [bxX[0] - 6, bxX[1] - 2, bxX[2] + 6, bxX[3]], { folga: 0.3 }) || [X(zc0), Y(yAlto)];
      D.marcaLig(cb[0], cb[1], "5", o.folhaDet || "05", px, py);
    }
    rotCV.forEach(function (cv) {
      var bx = caixaX(cv), C = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2], w = largTexto(cv.marca, h);
      D.textoLivre([C[0] + 3.0 + w / 2, C[1]], cv.marca, h, [bx[0] + 1, bx[1] + 1, bx[2] - 1, bx[3] - 1]);
    });
    if (f.tipo === "aberto") D.texto((X(0) + X(d.Lt)) / 2, Y(d.H * 0.5), "LATERAL ABERTA (SEM FECHAMENTO)", h, { al: "C" });
    if (parede) {
      var nomeP = f.tipo === "misto" ? "ALVENARIA h = " + br(ha, 2) + " m" : (f.tipo === "premoldado" ? "PAINEL PRÉ-MOLDADO" : "ALVENARIA");
      var bxP = D.textoLivre([(X(0) + X(d.Lt)) / 2, Y(ha / 2)], nomeP, h, [a0 + 1, Y(ha) + 1, a0 + d.Lt * s - 1, Y(0) - 1]);
      D.hachura(a0, Y(ha), d.Lt * s, ha * s, 2.2, null, [[bxP[0] - 1.2, bxP[1] - 1.0, bxP[2] + 1.2, bxP[3] + 1.0]]);
    }
  }

  /* ================================================================ FOLHAS */
  function folhaLocacao(c) {
    var D = c.D, d = c.d, a = c.geo.area, titH = 18, larDet = c.lig ? 150 : 0;
    var esc = escolher(PADRAO_ACO.escalas.planta, function (e) { var s = 1000 / e; return d.Lt * s + 2 * OV + 4 <= a.w - larDet && d.vao * s + 2 * OV + titH <= a.h * 0.58; });
    var s = 1000 / esc, x0 = a.x + 4 + OV, y0 = a.y + titH + OV;
    tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE LOCAÇÃO DOS PILARES E DAS BASES", "ESC 1:" + esc);
    plantaLocacao(D, d, c, x0, y0, s);
    var yb = y0 + d.vao * s + OV;
    if (c.lig) {
      var xd = x0 + d.Lt * s + OV + 10, yd = a.y + 2;
      d.tiposBase.forEach(function (tb) { yd += locacaoChumbadores(D, d, c, tb, xd, yd, a.x + a.w - xd) + 9; });
      yb = Math.max(yb, yd - 9);
    }
    /* área livre abaixo da planta: da margem esquerda até 3 mm antes da coluna de notas, até o pé da moldura */
    var xL = a.x + 4, xR = a.x + a.w - 3, wLivre = xR - xL, yt = yb + 10, yFim = a.y + a.h - 2;
    var bl = blocosReacoes(d, c, wLivre), extras = [];
    /* tamanho de cada bloco (medido num desenho de rascunho) */
    var mBl = bl.map(function (b, ib) { return medir(D, function (Dm) { return desenharReacoes(Dm, d, c, xL, yt, bl, ib, ib); }); });
    function alturaBlocos(de, ate) { var hh = 0; for (var q = de; q <= ate; q++) hh += mBl[q].h + (q < ate ? 8 : 0); return hh; }
    /* bases e convenção: ao lado do 1º bloco (o mais estreito: casos permanentes, variáveis e a envoltória) ou embaixo de tudo */
    function ladoDe(w0) { var xl = xL + w0 + 15, wl = xR - xl; if (wl < 130) return null; var wq = Math.min(175, wl);
      return { x: xl, w: wq, hb: medir(D, function (Dm) { return quadroBases(Dm, d, c, 0, 0, wq); }).h, hc: medir(D, function (Dm) { return convencao(Dm, d, c, 0, 0, wq); }).h }; }
    var wBas = Math.min(175, wLivre), lado = ladoDe(mBl[0].w), hBC = medir(D, function (Dm) { return quadroBases(Dm, d, c, 0, 0, wBas); }).h + 5 + medir(D, function (Dm) { return convencao(Dm, d, c, 0, 0, wBas); }).h;
    var hLado = lado ? lado.hb + 5 + lado.hc : 0, hResto = bl.length > 1 ? 8 + alturaBlocos(1, bl.length - 1) : 0;
    var cabeLado = lado && yt + Math.max(mBl[0].h, hLado) + hResto <= yFim, cabeBaixo = yt + alturaBlocos(0, bl.length - 1) + 12 + hBC <= yFim;
    if (cabeLado || cabeBaixo) {
      desenharReacoes(D, d, c, xL, yt, bl, 0, 0);
      if (cabeLado) {
        var hb = quadroBases(D, d, c, lado.x, yt, lado.w).h; convencao(D, d, c, lado.x, yt + hb + 5, lado.w);
        if (bl.length > 1) desenharReacoes(D, d, c, xL, yt + Math.max(mBl[0].h, hLado) + 8, bl, 1, bl.length - 1);
      } else {
        if (bl.length > 1) desenharReacoes(D, d, c, xL, yt + mBl[0].h + 8, bl, 1, bl.length - 1);
        var yq = yt + alturaBlocos(0, bl.length - 1) + 12, hb2 = quadroBases(D, d, c, xL, yq, wBas).h; convencao(D, d, c, xL, yq + hb2 + 5, wBas);
      }
    } else {
      /* 2) não cabe: o quadro e a convenção vão para folha(s) própria(s) 01A, 01B…; aqui ficam as bases e a chamada */
      var hb3 = quadroBases(D, d, c, xL, yt, wBas).h;
      var yc = yt + hb3 + 6, letras = "ABCDEFGH";
      /* páginas: blocos empilhados enquanto couberem na área; a convenção ao lado do último bloco ou embaixo */
      var paginas = [], ini = 0, yTopo = a.y + 2;
      while (ini < bl.length) {
        var fim = ini;
        while (fim + 1 < bl.length && yTopo + alturaBlocos(ini, fim + 1) <= yFim) fim++;
        paginas.push([ini, fim]); ini = fim + 1;
      }
      var nomes = paginas.map(function (pg, k) { return dois(c.n) + letras.charAt(k); });
      /* chamada: o quadro está em outra folha */
      var hTc = tituloVista(D, xL, yc, "QUADRO DE CARGAS NA FUNDAÇÃO", null);
      D.textos(xL, yc + hTc + 0.5, [{ t: "Na" + (nomes.length > 1 ? "s folhas " + nomes.join(", ") : " folha " + nomes[0]) + ": " + c.casos.length + " casos de carga, valores característicos por caso e a envoltória ELU, com a convenção de sinais.", attr: ' data-quadro-cargas-em="' + nomes.join(",") + '"' }], c.D.E.T.nota, { wmax: wLivre });
      paginas.forEach(function (pg, k) {
        extras.push({ sufixo: letras.charAt(k), id: "cargas" + (k ? k + 1 : ""), titulo: "QUADRO DE CARGAS NA FUNDAÇÃO", desenhar: function (c2) {
          var D2 = c2.D, y2 = a.y + 2;
          /* a convenção vai na 1ª página do quadro: ao lado do 1º bloco se couber, senão embaixo dos blocos da página */
          var l2 = k === 0 ? ladoDe(mBl[pg[0]].w) : null, hl2 = l2 ? l2.hc : 0;
          if (k === 0 && l2 && y2 + Math.max(mBl[pg[0]].h, hl2) + (pg[1] > pg[0] ? 8 + alturaBlocos(pg[0] + 1, pg[1]) : 0) <= yFim) {
            desenharReacoes(D2, d, c2, xL, y2, bl, pg[0], pg[0]);
            convencao(D2, d, c2, l2.x, y2, l2.w);
            if (pg[1] > pg[0]) desenharReacoes(D2, d, c2, xL, y2 + Math.max(mBl[pg[0]].h, hl2) + 8, bl, pg[0] + 1, pg[1]);
          } else {
            var m2 = desenharReacoes(D2, d, c2, xL, y2, bl, pg[0], pg[1]);
            if (k === 0) convencao(D2, d, c2, xL, y2 + m2.h + 12, wBas);
          }
          return { escala: "SEM ESCALA" };
        } });
      });
    }
    return { escala: c.lig ? "INDICADA" : "1:" + esc, extras: extras };
  }

  function folhaCobertura(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, titH = 18;
    var esc = escolher(PADRAO_ACO.escalas.planta, function (e) { var s = 1000 / e; return d.Lt * s + 2 * OV <= a.w - 8 && d.vao * s + 2 * OV + titH <= a.h * 0.64; });
    var s = 1000 / esc, x0 = a.x + 4 + OV, y0 = a.y + titH + OV;
    tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE COBERTURA", "ESC 1:" + esc);
    var pc = plantaCobertura(D, d, c, x0, y0, s);
    /* quadro das peças da cobertura e notas */
    var yt = y0 + d.vao * s + OV + 10, x = a.x + 4;
    var hq = tituloVista(D, x, yt, "PEÇAS DA COBERTURA", null) + 1;
    var cols = [{ t: "MARCA", w: 16 }, { t: "DESCRIÇÃO", w: 76, al: "E" }, { t: "PERFIL", w: 46 }, { t: "QUANT.", w: 16 }, { t: ["COMPR.", "(mm)"], w: 18 }];
    var pend = { t: "A DIMENSIONAR", cor: VERMELHO };
    var lin = [];
    var vg = {}; d.vigas.forEach(function (v) { (vg[v.marca] = vg[v.marca] || []).push(v); });
    Object.keys(vg).sort().forEach(function (m) { var g = vg[m]; lin.push([m, "Viga de cobertura (" + eixosTxt(g.map(function (v) { return v.k + 1; })) + ")", perfilCurto(g[0].perfil), String(g.length), mm(g[0].L)]); });
    var nB = d.tercas.filter(function (t) { return t.beiral; }).length, nC = d.tercas.length - nB;
    if (nB) lin.push(["TB1", "Terça de beiral", d.perfilTerca ? perfilCurto(d.perfilTerca.nome) : pend, String(nB * d.nV), mm(d.esp)]);
    if (nC) lin.push(["TC1", "Terça (inclusive a da cumeeira)", d.perfilTerca ? perfilCurto(d.perfilTerca.nome) : pend, String(nC * d.nV), mm(d.esp)]);
    var ch = {}; d.cv.filter(function (cv) { return cv.tipo === "cobertura"; }).forEach(function (cv) { (ch[cv.marca] = ch[cv.marca] || []).push(cv); });
    Object.keys(ch).sort().forEach(function (m) { lin.push([m, "Contraventamento da cobertura (" + vaosTxt(ch[m].map(function (q) { return q.k; })) + ")", d.cvNome, String(ch[m].length), mm(ch[m][0].L)]); });
    if (d.mf.length) lin.push(["MF1", "Mão-francesa (" + eixosTxt(d.mf.map(function (m) { return m.k + 1; })) + ")", d.perfilMF ? perfilCurto(d.perfilMF.nome) : pend, String(d.mf.length), "-"]);
    if (pc.temCR && d.correntes.linhas > 0) lin.push(["CR1", "Corrente de terça (" + d.correntes.linhas + " por vão, a cada " + br(d.correntes.entre, 2) + " m)", d.ltCR ? "Barra redonda " + diamTxt(d.ltCR) + " mm" : { t: "Ø A DEFINIR", cor: VERMELHO }, String(d.correntes.linhas * d.nV * d.aguas), mm(d.meio / d.co)]);
    else if (!pc.temCR) lin.push(["CR", "Corrente de terça (posição de referência)", { t: "A DEFINIR", cor: VERMELHO }, "-", "-"]);
    var t = D.tabela(x, yt + hq, cols, lin);
    var xn = x + t.w + 15, wn = a.x + a.w - xn, yn = yt;
    yn += tituloVista(D, xn, yn, "COBERTURA", null) + 1;
    var cob = d.par.cobertura || {}, dec = arr(d.G.decisoes), dTer = dec.filter(function (q) { return q.tema === "Terças"; })[0], dMF = dec.filter(function (q) { return q.tema === "Mãos-francesas"; })[0];
    var notas = [
      "Telha: " + (cob.telhaNome || "-") + (cob.telhaVaoMax ? " - vão máximo " + br(cob.telhaVaoMax, 2) + " m na carga do projeto." : "."),
      "Inclinação " + br(d.i * 100, 1) + " % (" + br(d.th * 180 / Math.PI, 2) + "°), " + d.aguas + (d.aguas === 2 ? " águas, caimento para os beirais." : " água."),
      dTer ? "Terças: " + dTer.decisao + "." : "",
      dMF ? "Mãos-francesas: " + dMF.decisao + (d.mf.length ? " (símbolo MF1 na planta)." : ".") : "",
      pc.temCR ? (d.correntes.linhas > 0 ? (d.ltCR ? "Correntes CR1 (tracejado): barra redonda " + diamTxt(d.ltCR) + " mm (" + d.ltCR.aco + "), " + d.correntes.linhas + " linha(s) por vão, a cada " + br(d.correntes.entre, 2) + " m, do beiral à cumeeira" + (d.ltCR.F != null && d.ltCR.Rd != null ? "; força " + br(d.ltCR.F, 2) + " kN <= " + br(d.ltCR.Rd, 2) + " kN" : "") + " (cálculo das terças)."
        : { t: "Correntes CR1 (tracejado): " + d.correntes.linhas + " linha(s) por vão, a cada " + br(d.correntes.entre, 2) + " m, do beiral à cumeeira (cálculo das terças); diâmetro a definir [PENDENTE].", cor: VERMELHO }) : "Correntes: dispensadas pelo cálculo das terças.") :
        { t: "Correntes (CR): traço vermelho = posição de referência a meio vão; diâmetro, quantidade e fixação a definir no dimensionamento das terças (NBR 14762) [PENDENTE].", cor: VERMELHO },
      pc.pendTerca ? { t: "Perfil das terças a dimensionar (NBR 14762) [PENDENTE].", cor: VERMELHO } : ""
    ].filter(function (q) { return q && (typeof q === "string" ? q : q.t); });
    D.textos(xn, yn, notas, T.nota, { wmax: Math.max(80, Math.min(wn - 4, 220)), recuo: 0 });
    return { escala: "1:" + esc };
  }

  function folhaPorticos(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, dP = num(d.secP.d, 300) / 1000, dV = num(d.secV.d, 300) / 1000, hv = dV / 2 / d.co;
    var yTop = (d.aguas === 2 ? d.yT(d.meio) : d.yT(d.vao)) + hv, larLeg = 128;
    function larg(s) { return d.vao * s + dP * s + 30 + 48; }
    function alt(s) { return yTop * s + 26 + 0.06 * s + 40 + 16; }
    var esc = escolher(PADRAO_ACO.escalas.elevacao, function (e) { var s = 1000 / e; return larg(s) <= a.w - larLeg && 2 * alt(s) + 14 <= a.h; }), s = 1000 / esc;
    var ox = a.x + 4 + 30 + dP / 2 * s, y1 = a.y + 2;
    var h1 = tituloVista(D, a.x + 4, y1, "PÓRTICO TÍPICO - " + eixosTxt(d.zs.map(function (z, k) { return k + 1; }).filter(function (k) { return k !== 1 && k !== d.nV + 1; })).toUpperCase(), "ESC 1:" + esc);
    var kTip = d.mf.length ? d.mf[0].k : Math.min(1, d.nV);
    var oy1 = y1 + h1 + 26 + yTop * s;
    vistaPortico(D, d, c, { ox: ox, oy: oy1, s: s, tipo: "tipico", k: kTip });
    var y2 = oy1 + 0.06 * s + 40 + 14;
    var h2 = tituloVista(D, a.x + 4, y2, "PÓRTICO DE OITÃO - EIXOS 1 E " + (d.nV + 1), "ESC 1:" + esc);
    if (d.taps.length) D.texto(a.x + 4, y2 + h2 + 1.5 + T.nota * 0.76, "Topo das colunas de tapamento: ligação rotulada à viga (detalhe a fazer) [PENDENTE].", T.nota * 0.92, { cor: VERMELHO });
    var oy2 = y2 + h2 + 26 + yTop * s;
    vistaPortico(D, d, c, { ox: ox, oy: oy2, s: s, tipo: "oitao", k: 0 });
    /* legenda das ligações e perfis */
    var xl = ox + d.vao * s + dP / 2 * s + 48, wl = a.x + a.w - xl, yl = a.y + 2;
    if (wl > 100) {
      yl += tituloVista(D, xl, yl, "LIGAÇÕES (BALÕES)", null) + 1;
      var cols = [{ t: "Nº", w: 10 }, { t: "LIGAÇÃO", w: Math.min(80, wl - 30), al: "E" }, { t: "FOLHA", w: 16 }];
      var lin = [["1", "Placa de base (" + d.tiposBase.map(function (tb) { return tb.marca; }).join(", ") + ")", "05"], ["2", "Joelho - chapa de extremidade", "05"], ["3", d.aguas === 2 ? "Cumeeira - chapas de topo" : "Joelho do lado alto - chapa de extremidade", "05"], ["4", "Clip de terça", "05"], ["5", "Contraventamento (barra redonda)", "05"], ["6", d.mf.length ? "Mão-francesa" : "Quadro das ligações", "05"]];
      var tb = D.tabela(xl, yl, cols, lin); yl += tb.h + 10;
      yl += tituloVista(D, xl, yl, "PEÇAS DOS PÓRTICOS", null) + 1;
      var cols2 = [{ t: "MARCA", w: 34 }, { t: "PERFIL", w: 28 }, { t: ["COMPR.", "(mm)"], w: 18 }, { t: "QT.", w: 10 }];
      var lin2 = [], g = {};
      d.pilares.forEach(function (p) { var k = perfilCurto(p.perfil) + "|" + mm(p.L); (g[k] = g[k] || { m: [], p: perfilCurto(p.perfil), L: mm(p.L) }).m.push(p.marca); });
      Object.keys(g).forEach(function (k) { lin2.push([seq(g[k].m), g[k].p, g[k].L, String(g[k].m.length)]); });
      var gv = {}; d.vigas.forEach(function (v) { var k = v.marca + "|" + mm(v.L); (gv[k] = gv[k] || { m: v.marca, p: perfilCurto(v.perfil), L: mm(v.L), n: 0 }).n++; });
      Object.keys(gv).sort().forEach(function (k) { lin2.push([gv[k].m, gv[k].p, gv[k].L, String(gv[k].n)]); });
      var gt = {}; d.taps.forEach(function (t) { var k = mm(t.L); (gt[k] = gt[k] || { m: [], p: perfilCurto(t.perfil), L: mm(t.L) }).m.push(t.marca); });
      Object.keys(gt).forEach(function (k) { lin2.push([seq(gt[k].m), gt[k].p, gt[k].L, String(gt[k].m.length)]); });
      var tb2 = D.tabela(xl, yl, cols2, lin2); yl += tb2.h + 8;
      D.textos(xl, yl, ["Alturas e níveis no eixo das barras; " + (d.aguas === 2 ? "vigas de duas águas simétricas." : "viga de uma água, do lado baixo (fila " + ((d.filas[0] || {}).letra || "A") + ") ao lado alto (fila " + ((d.filas[d.filas.length - 1] || {}).letra || "B") + ")."), "Comprimentos pelo eixo (de nó a nó)."], T.nota * 0.92, { wmax: wl - 4 });
    }
    return { escala: "1:" + esc };
  }

  function folhaElevacoes(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, hv = num(d.secV.d, 300) / 2000 / d.co, yTop = (d.aguas === 2 ? d.yT(d.meio) : d.yT(d.vao)) + hv;
    var OVX = 36, titH = 16, baixo = 36, cima = 12;
    function hLat(s) { return titH + cima + (d.H + hv) * s + 5 + baixo; }
    function hOit(s) { return titH + cima + yTop * s + baixo; }
    var esc = escolher(PADRAO_ACO.escalas.elevacao, function (e) {
      var s = 1000 / e;
      return d.Lt * s + 2 * OVX <= a.w - 6 && 2 * (d.vao * s + 2 * OVX) + 12 <= a.w - 6 && 2 * hLat(s) + hOit(s) + 24 <= a.h;
    }), s = 1000 / esc;
    var x = a.x + 4, y = a.y + 2;
    [{ f: (d.filas[0] || {}).letra || "A", esp: false }, { f: (d.filas[d.filas.length - 1] || {}).letra || "B", esp: true }].forEach(function (q) {
      var h = tituloVista(D, x, y, "ELEVAÇÃO - FILA " + q.f + " (VISTA EXTERNA)", "ESC 1:" + esc);
      var oy = y + h + cima + (d.H + hv) * s + 5;
      vistaLateral(D, d, c, { ox: x + OVX, oy: oy, s: s, fila: q.f, espelhar: q.esp });
      y = oy + baixo + 12;
    });
    [{ k: 0, esp: true, nome: "EIXO 1 - OITÃO DA FRENTE (VISTA EXTERNA)" }, { k: d.nV, esp: false, nome: "EIXO " + (d.nV + 1) + " - OITÃO DO FUNDO (VISTA EXTERNA)" }].forEach(function (q, j) {
      var xo = x + j * (d.vao * s + 2 * OVX + 12);
      var h = tituloVista(D, xo, y, "ELEVAÇÃO - " + q.nome, "ESC 1:" + esc);
      vistaPortico(D, d, c, { ox: xo + OVX, oy: y + h + cima + yTop * s, s: s, tipo: "oitao", k: q.k, espelhar: q.esp, simples: true });
    });
    return { escala: "1:" + esc };
  }

  /* ---------------------------------------------------------------- DETALHES
   * Cada detalhe numa célula (1/6 da área): título com o número (o balão das
   * outras folhas aponta para ele), o desenho na MAIOR escala que cabe na
   * célula, chamadas em volta e, no pé da célula, a especificação e a
   * situação da ligação: DIMENSIONADA pelo cálculo (aproveitamento e a
   * verificação que governa) ou com as dimensões de PARTIDA (nota em
   * vermelho), mais os esforços de cálculo tirados da análise. */
  function kN(v) { return br(Math.abs(num(v, 0)), 1); }
  function linhasAltura(D, w, linhas) {
    var h = D.E.T.nota * 0.9, n0 = 0;
    linhas.forEach(function (l) { var t = l && typeof l === "object" ? l.t : l; if (t) n0 += quebrar(t, h, w).length; });
    return n0 * h * 1.45;
  }
  function notasPe(D, x, yFim, w, linhas) { var y0 = yFim - linhasAltura(D, w, linhas); D.textos(x, y0, linhas, D.E.T.nota * 0.9, { wmax: w }); return y0; }
  /* notas logo abaixo do desenho; se não couberem até o pé da célula, encostadas nele */
  function notasAbaixo(D, x, yMin, yFim, w, linhas) { var hN = linhasAltura(D, w, linhas), y0 = Math.min(yMin, yFim - hN); D.textos(x, y0, linhas, D.E.T.nota * 0.9, { wmax: w }); return y0 + hN; }
  /* situação da ligação: dimensionada (com o aproveitamento) ou de partida */
  function situacao(L, extra) {
    if (L && L.calc) {
      var s = "DIMENSIONADA PELO CÁLCULO (ver memorial)" + (L.razao != null ? ": aproveitamento " + br(L.razao, 2) : "") + (L.governante ? " - governa: " + L.governante.charAt(0).toLowerCase() + L.governante.slice(1) : "") + ".";
      return [{ t: s, attr: ' data-dimensionada="1"', cor: L.ok === false ? VERMELHO : null }].concat(L.ok === false ? [{ t: "A LIGAÇÃO NÃO PASSA" + (L.sugestao ? ": " + L.sugestao : "") + " - NÃO EMITIR.", cor: VERMELHO }] : []).concat(extra || []);
    }
    return [{ t: NOTA_PARTIDA, cor: VERMELHO, attr: ' data-partida="1"' }].concat(extra || []);
  }
  function VL(D, ox, oy, k) {
    var v = { k: k };
    v.P = function (x, y) { return [ox + x * k, oy - y * k]; };
    v.ln = function (x1, y1, x2, y2, cam) { var a = v.P(x1, y1), b = v.P(x2, y2); D.linha(a[0], a[1], b[0], b[1], cam); };
    v.cheio = function (lista, cor) { D.cheio(lista.map(function (p) { return v.P(p[0], p[1]); }), cor); };
    v.poli = function (lista, cam, f) { D.poli(lista.map(function (p) { return v.P(p[0], p[1]); }), cam, f); };
    v.quebra = function (x1, y1, x2, y2) { var a = v.P(x1, y1), b = v.P(x2, y2); D.quebra(a[0], a[1], b[0], b[1]); };
    v.ret = function (x1, y1, x2, y2) { return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]; };
    return v;
  }
  /* indicação de corte: linha do plano de a a b (já fora da peça), seta para o lado que se olha e a letra além da
     ponta da linha (fora do desenho, nunca em cima da peça) */
  function indCorte(D, a, b, sx, sy, letra) {
    var h = D.E.T.detalhe * 0.85;
    D.linha(a[0], a[1], b[0], b[1], "MET-EIXO");
    [[a, b], [b, a]].forEach(function (q) {
      var p = q[0], L = hip(p[0] - q[1][0], p[1] - q[1][1]) || 1, ox = (p[0] - q[1][0]) / L, oy = (p[1] - q[1][1]) / L;
      D.linha(p[0], p[1], p[0] + sx * 3.5, p[1] + sy * 3.5, "MET-TITULO");
      D.seta(p[0] + sx * 3.5, p[1] + sy * 3.5, -sx, -sy, 1.8);
      D.texto(p[0] + ox * (1.0 + 0.5 * h), p[1] + oy * (1.0 + 0.5 * h), letra, h, { al: "C", meio: true });
    });
  }

  /* 1 — PLACA DE BASE */
  function det1Base(D, c, x, y, w, hCel) {
    var d = c.d, T = D.E.T, hn = T.nota * 0.9, tb = d.tiposBase[0], pb = c.lig.bases[tb.marca], sec = tb.sec;
    var ANC = Math.min(pb.ancoragem, 200), PED = 60, pf = pb.pf, ROSCA = pf.arr.h + pf.m + 3 * pf.passo;
    var lin = ["Placa " + espChapa(pb.t) + " x " + pb.B + " x " + pb.N + " (ASTM A36); " + pb.n + " chumbadores Ø " + pf.id + " " + pb.classe + (pb.gancho ? " com gancho" : "") + ", ancoragem " + pb.ancoragem + " mm, arruela e porca; graute não retrátil " + pb.graute + " mm.",
      (pb.cjp ? "Mesas do pilar em penetração total (CJP) e alma com filete " + pb.perna + " mm (E70XX)." : "Solda de filete " + pb.perna + " mm em todo o contorno do pilar (E70XX).")];
    var ef = [];
    d.tiposBase.forEach(function (q) { var e = c.esf.bases[q.marca]; if (e && e.Vmax != null) ef.push("Esforços (ELU) " + q.marca + ": Nd,máx = " + kN(e.Vmax) + " kN (compr.); Nd,mín = " + br(e.Vmin, 1) + " kN; Hx,d = " + kN(e.Hx) + " kN; Hz,d = " + kN(e.Hz) + " kN" + (e.M > 0.05 ? "; Md = " + kN(e.M) + " kN.m" : "") + "."); });
    lin = lin.concat(situacao(pb, ef.concat(["Cone de arrancamento, bloco e armadura de fretagem: projeto de fundação, com as cargas da folha 01."])));
    var hN = linhasAltura(D, w - 4, lin);
    function caixa(e) { var k = 1 / e; return { w: 14 + (pb.N + 2 * PED) * k + 70, h: 13 + 16 + pb.B * k + 15 + Math.max(20, ROSCA * k + 8) + (pb.t + pb.graute + ANC) * k + 12 + 22 + hN + 6 }; }
    var esc = escolher([5, 10, 20], function (e) { var q = caixa(e); return q.w <= w && q.h <= hCel; }), k = 1 / esc;
    var y0 = y + tituloVista(D, x, y, "PLACA DE BASE - " + tb.marca + " (TÍPICA)", "ESC 1:" + esc, 1);
    var wN = pb.N * k, hB = pb.B * k, pk = PED * k, cx = x + 14 + pk + wN / 2, cy = y0 + 16 + hB / 2;
    D.linha(cx - wN / 2 - 5, cy, cx + wN / 2 + 5, cy, "MET-EIXO"); D.linha(cx, cy - hB / 2 - 5, cx, cy + hB / 2 + 5, "MET-EIXO");
    D.ret(cx - wN / 2, cy - hB / 2, wN, hB, "MET-PERFIL");
    D.secaoI(cx, cy, num(sec.d, 300) * k, num(sec.bf, 150) * k, num(sec.tw, 6) * k, num(sec.tf, 10) * k, { rot: true });
    var ex = pb.N / 2 - pb.e, ey = pb.B / 2 - pb.e, rf = pb.furo / 2 * k, nl1 = Math.max(2, num(pb.porLado, 2));
    /* nl1 chumbadores em cada extremidade de N (base engastada com 6 ou 8): ao longo de B */
    for (var iq3 = 0; iq3 < nl1; iq3++) { var fy3 = -1 + 2 * iq3 / (nl1 - 1); [-1, 1].forEach(function (fx3) { D.furo(cx + fx3 * ex * k, cy + fy3 * ey * k, rf); }); }
    D.cadeia([[cx - wN / 2, cy - hB / 2], [cx - ex * k, cy - hB / 2], [cx + ex * k, cy - hB / 2], [cx + wN / 2, cy - hB / 2]], 6, [String(pb.e), String(pb.N - 2 * pb.e), String(pb.e)]);
    D.cota(cx - wN / 2, cy - hB / 2, cx + wN / 2, cy - hB / 2, 12, String(pb.N));
    D.cadeia([[cx - wN / 2, cy + hB / 2], [cx - wN / 2, cy + ey * k], [cx - wN / 2, cy - ey * k], [cx - wN / 2, cy - hB / 2]], 6, [String(pb.e), String(pb.B - 2 * pb.e), String(pb.e)]);
    D.cota(cx - wN / 2, cy + hB / 2, cx - wN / 2, cy - hB / 2, 12, String(pb.B));
    D.chamada(cx + ex * k + rf * 0.75, cy + ey * k + rf * 0.75, cx + wN / 2 + 9, cy + hB / 2 + 4, ["FURO Ø " + br(pb.furo, 1) + " (ALARGADO)"], { h: hn });
    D.texto(cx, cy + hB / 2 + 6 + T.nota * 0.76, "PLANTA", T.nota, { al: "C" });
    var stub = Math.max(20, ROSCA * k + 8), yL = cy + hB / 2 + 15, yE = yL + stub, tk = pb.t * k, gk = pb.graute * k, xL = cx - wN / 2;
    var dk = num(sec.d, 300) * k, tfk = num(sec.tf, 10) * k;
    D.linha(cx - dk / 2, yL, cx - dk / 2, yE, "MET-PERFIL"); D.linha(cx + dk / 2, yL, cx + dk / 2, yE, "MET-PERFIL");
    if (tfk >= 0.3) { D.linha(cx - dk / 2 + tfk, yL, cx - dk / 2 + tfk, yE, "MET-FINA"); D.linha(cx + dk / 2 - tfk, yL, cx + dk / 2 - tfk, yE, "MET-FINA"); }
    D.quebra(cx - dk / 2 - 2.5, yL, cx + dk / 2 + 2.5, yL);
    D.texto(cx, (yL + yE) / 2, "PILAR", hn, { al: "C", meio: true, rot: -90 });
    D.ret(xL, yE, wN, tk, "MET-PERFIL");
    D.ret(xL - pk * 0.5, yE + tk, wN + pk, gk, "MET-CONTEXTO"); D.hachura(xL - pk * 0.5, yE + tk, wN + pk, gk, 0.9);
    var yC = yE + tk + gk, ak = ANC * k, yQ = yC + ak + 5;
    D.linha(xL - pk, yC, xL + wN + pk, yC, "MET-CONTEXTO");
    D.linha(xL - pk, yC, xL - pk, yQ, "MET-CONTEXTO"); D.linha(xL + wN + pk, yC, xL + wN + pk, yQ, "MET-CONTEXTO");
    D.quebra(xL - pk - 2, yQ, xL + wN + pk + 2, yQ);
    var rr = pf.d / 2 * k;
    [-1, 1].forEach(function (q) {
      var xc = cx + q * ex * k, topo = yE - ROSCA * k;
      D.retRot(xc, yE, 0, -1, pf.arr.h * k, pf.arr.d2 / 2 * k, "MET-SECUNDARIO");
      D.retRot(xc, yE - pf.arr.h * k, 0, -1, pf.m * k, pf.s / 2 * k, "MET-SECUNDARIO");
      D.linha(xc - rr, topo, xc - rr, yE, "MET-SECUNDARIO"); D.linha(xc + rr, topo, xc + rr, yE, "MET-SECUNDARIO"); D.linha(xc - rr, topo, xc + rr, topo, "MET-SECUNDARIO");
      D.linha(xc - rr, yE, xc - rr, yQ, "MET-OCULTA"); D.linha(xc + rr, yE, xc + rr, yQ, "MET-OCULTA");
    });
    D.solda(cx - dk / 2, yE, -125, { perna: pb.perna, contorno: !pb.cjp, lados: "seta", ls: 12, lr: 13, esquerda: true, cauda: pb.cjp ? "MESAS CJP" : undefined });
    var xt = xL + wN + pk + 4;
    D.chamada(xL + wN - 0.6, yE + tk / 2, xt, yE - 2, ["PLACA # " + espChapa(pb.t) + " x " + pb.B + " x " + pb.N], { h: hn });
    D.chamada(xL + wN + pk * 0.35, yE + tk + gk / 2, xt, yE + tk + gk + 7.5, ["GRAUTE e = " + pb.graute], { h: hn });
    D.chamada(cx + ex * k, yE - (pf.arr.h + pf.m / 2) * k, xt, yE - 11, ["ARRUELA E PORCA"], { h: hn });
    D.chamada(cx + ex * k + rr, yC + ak * 0.75, xt, Math.max(yC + ak * 0.75 + 2, yE + tk + gk + 7.5 + hn * 3.4), [pb.n + " CHUMB. Ø " + pf.id, pb.gancho ? "COM GANCHO NA PONTA" : "L = " + Math.round(num(pb.Lc, 0))], { h: hn });
    D.cadeia([[xL - pk, yQ - 5], [xL - pk, yC], [xL - pk, yE + tk], [xL - pk, yE]], 6, [String(pb.ancoragem), String(pb.graute), espChapa(pb.t)], { semExt: true });
    D.texto(cx, yQ + 5 + T.nota * 0.76, "ELEVAÇÃO", T.nota, { al: "C" });
    var yT = yQ + 12;
    var cols = [{ t: "TIPO", w: 12 }, { t: "PILAR", w: 25 }, { t: ["PLACA", "t x B x N"], w: 32 }, { t: "e", w: 9 }, { t: ["CHUMB.", "Ø"], w: 14 }, { t: "SOLDA", w: 13 }, { t: "QT.", w: 10 }];
    var tl = d.tiposBase.map(function (q) { var b = c.lig.bases[q.marca]; return [q.marca, perfilCurto(q.perfil), espChapa(b.t) + " x " + b.B + " x " + b.N, String(b.e), b.pf.id, b.perna + " mm", String(q.pecas.length)]; });
    var tb1 = D.tabela(x + 2, yT, cols, tl, { fs: T.tabela * 0.9, fsc: T.tabelaCab * 0.82 });
    notasAbaixo(D, x + 2, yT + tb1.h + 8, y + hCel - 2, w - 4, lin);
  }

  /* 2 e 3 — JOELHO E CUMEEIRA: chapa de extremidade (estendida quando o cálculo pede), parafusos, soldas, enrijecedores */
  /* modo: false = joelho (lado baixo / duas águas), true = cumeeira, "alto" = joelho do lado alto da viga de uma água */
  function detLigacaoTopo(D, c, x, y, w, hCel, modo) {
    var cumeeira = modo === true, alto = modo === "alto";
    var d = c.d, T = D.E.T, hn = T.nota * 0.9, L = cumeeira ? c.lig.cumeeira : c.lig.joelho, sv = d.secV, sp = d.secP, e = cumeeira ? c.esf.cumeeira : c.esf.joelho;
    var dV = num(sv.d, 300), bfV = num(sv.bf, 100), twV = num(sv.tw, 6), tfV = num(sv.tf, 10), dP = num(sp.d, 300), tfP = num(sp.tf, 10);
    var hv = dV / 2 / d.co, t = L.t, ti = Math.tan(d.th) * (alto ? -1 : 1), pf = L.pf, Lv = cumeeira ? 320 : 360, letra = cumeeira || alto ? "B" : "A", H2 = L.H / 2;
    var furosV = L.linhas.map(function (v) { return v / d.co; });
    var ex0, ex1, ey0, ey1;
    if (!cumeeira) { ex0 = -dP / 2 - 14; ex1 = dP / 2 + t + Lv + 16; ey0 = -Math.max(hv, H2) - 200 + Math.min(0, (dP / 2 + t + Lv) * ti); ey1 = Math.max(hv, H2) + Math.max(0, (dP / 2 + t + Lv) * ti) + 40; }
    else { ex0 = -(t + Lv + 16); ex1 = t + Lv + 16; ey0 = -Math.max(hv, H2) - (t + Lv) * ti - 40; ey1 = Math.max(hv, H2) + 45; }
    var lin = [(cumeeira ? "2 chapas de topo # " : "Chapa de extremidade # ") + espChapa(L.t) + " x " + Math.round(L.W) + " x " + Math.round(L.H) + " (" + (L.aco || "ASTM A36") + ")" + (L.ext > 0 ? ", estendida " + Math.round(L.ext) + " mm além das mesas" : "") + "; solda das mesas " + (L.cjp ? "de penetração total (CJP)" : "filete " + L.perna + " mm") + (L.pernaAlma ? " e da alma filete " + L.pernaAlma + " mm" : "") + " (E70XX).",
      L.n + " parafusos " + L.pf.id + " - " + L.classe + ", L = " + Math.round(num(L.L, 0)) + ", com porca e arruela; furos Ø " + br(L.furo, 1) + "."];
    if (L.enrij) lin.push("Enrijecedores no pilar: " + (L.enrij.texto || (num(L.enrij.n, 2) + " pares " + L.enrij.b + " x " + espChapa(L.enrij.t))) + ".");
    if (L.diagonal) lin.push("Painel da alma do pilar: " + (L.diagonal.texto || "diagonal de reforço") + ".");
    var ef = [];
    if (e) ef.push("Esforços (ELU, máx. |M|): Md = " + kN(e.Mz) + " kN.m; Vd = " + kN(e.V) + " kN; Nd = " + kN(e.N) + " kN (" + (e.N < 0 ? "compressão" : "tração") + ").");
    if (!cumeeira && !L.calc) ef.push("Enrijecedores na alma do pilar (continuidade das mesas da viga): verificar no dimensionamento da ligação.");
    lin = lin.concat(situacao(L, ef));
    var hN = linhasAltura(D, w - 4, lin);
    function caixa(es) { var k = 1 / es; return { w: (ex1 - ex0) * k + 8 + L.W * k + 30, h: 13 + 10 + Math.max((ey1 - ey0) * k, L.H * k + 24) + 8 + hN }; }
    var esc = escolher([5, 10, 15, 20], function (es) { var q = caixa(es); return q.w <= w && q.h <= hCel; }), k = 1 / esc;
    var y0 = y + tituloVista(D, x, y, cumeeira ? "LIGAÇÃO DA CUMEEIRA - CHAPAS DE TOPO" : (alto ? "JOELHO DO LADO ALTO - CHAPA DE EXTREMIDADE" : "LIGAÇÃO DO JOELHO - CHAPA DE EXTREMIDADE"), "ESC 1:" + esc, cumeeira || alto ? 3 : 2);
    var ox = x + 2 - ex0 * k, oy = y0 + 8 + ey1 * k, V = VL(D, ox, oy, k);
    function viga(x1, sg, semCorte) {
      var x2 = x1 + sg * Lv, tf = tfV / d.co;
      function yAx(xx) { return cumeeira ? -Math.abs(xx) * ti : xx * ti; }
      V.ln(x1, yAx(x1) + hv, x2, yAx(x2) + hv, "MET-PERFIL"); V.ln(x1, yAx(x1) - hv, x2, yAx(x2) - hv, "MET-PERFIL");
      V.ln(x1, yAx(x1) + hv, x1, yAx(x1) - hv, "MET-PERFIL");
      V.ln(x1, yAx(x1) + hv - tf, x2, yAx(x2) + hv - tf, "MET-FINA"); V.ln(x1, yAx(x1) - hv + tf, x2, yAx(x2) - hv + tf, "MET-FINA");
      V.quebra(x2, yAx(x2) + hv + 12, x2, yAx(x2) - hv - 12);
      var xm = x1 + sg * (Lv * 0.62 - 7.5), pm = V.P(xm, yAx(xm)), a1 = V.P(x1, yAx(x1)), a2 = V.P(x2, yAx(x2)), ang = Math.atan2(a2[1] - a1[1], a2[0] - a1[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      var nomeV = perfilCurto(d.vigas[0] ? d.vigas[0].perfil : ""), hV = Math.max(T.minimo, Math.min(hn, hn * (Lv * 0.6 - 15) * k / Math.max(1, largTexto(nomeV, hn))));
      D.texto(pm[0], pm[1], nomeV, hV, { al: "C", meio: true, rot: ang });
      if (!semCorte) {   /* um plano de corte só (na cumeeira, na viga da esquerda; a solda fica na da direita) */
        var xc0 = x1 + sg * Lv * 0.2, ca = V.P(xc0, yAx(xc0) + hv), cb = V.P(xc0, yAx(xc0) - hv);
        indCorte(D, [ca[0], ca[1] - 3.5], [cb[0], cb[1] + 3.5], -sg, 0, letra);
      }
      return yAx;
    }
    if (!cumeeira) {
      var xp = dP / 2, yc0 = (dP / 2 + t / 2) * ti, yTopC = Math.max(hv + (dP / 2 + t) * ti, yc0 + H2), yBotC = Math.min(-hv, yc0 - H2) - 200;
      V.ln(-dP / 2, yBotC, -dP / 2, yTopC, "MET-PERFIL"); V.ln(dP / 2, yBotC, dP / 2, yTopC, "MET-PERFIL"); V.ln(-dP / 2, yTopC, dP / 2, yTopC, "MET-PERFIL");
      V.ln(-dP / 2 + tfP, yBotC, -dP / 2 + tfP, yTopC, "MET-FINA"); V.ln(dP / 2 - tfP, yBotC, dP / 2 - tfP, yTopC, "MET-FINA");
      V.quebra(-dP / 2 - 12, yBotC, dP / 2 + 12, yBotC);
      V.cheio(V.ret(xp, yc0 - H2, xp + t, yc0 + H2));
      if (L.enrij) {   /* par de enrijecedores na altura de cada mesa da viga */
        var te = num(L.enrij.t, 12.5);
        [1, -1].forEach(function (sg) { var ym = yc0 + sg * (dV / 2 - tfV / 2) / d.co; V.cheio(V.ret(-dP / 2 + tfP, ym - te / 2, dP / 2 - tfP, ym + te / 2)); });
      }
      var yAx = viga(xp + t, 1);
      if (L.enrij) {
        var ye = yc0 - (dV / 2 - tfV / 2) / d.co, pe = V.P(dP / 2 - tfP - 20, ye - num(L.enrij.t, 12.5) / 2), pt2 = V.P(dP / 2 + t + 45, ye - hv * 0.55); pt2[1] += 3;
        D.chamada(pe[0], pe[1], pt2[0], pt2[1], ["ENRIJECEDORES " + num(L.enrij.b, 0) + " x " + espChapa(num(L.enrij.t, 0)), "(PAR, NAS 2 MESAS)"],
          { h: hn, dir: 1, alternativas: [[pt2[0], pt2[1] + 4], [pt2[0], pt2[1] + 8], [pt2[0] + 4, pt2[1] + 12], [pt2[0] + 4, pt2[1] + 16]] });
      }
      furosV.forEach(function (v) { var a = V.P(xp + t, yc0 + v), b = V.P(xp - tfP, yc0 + v); D.parafuso(a[0], a[1], b[0], b[1], pf, k); });
      /* chamada da solda alta o bastante para passar por cima da letra do corte */
      var sp0 = V.P(xp + t, yAx(xp + t) + hv); D.solda(sp0[0], sp0[1], -62, L.cjp ? { chanfro: true, cauda: "CJP", lados: "ambos", ls: 16, lr: 14 } : { perna: L.perna, lados: "ambos", ls: 16, lr: 14 });
      /* nome do pilar na alma, abaixo do enrijecedor de baixo (ou da viga) */
      var yLim = (L.enrij ? yc0 - (dV / 2) / d.co : Math.min(-hv, yc0 - H2)) - 15, nomeP = "PILAR " + perfilCurto(d.pilares[0] ? d.pilares[0].perfil : "");
      if (largTexto(nomeP, hn) > (yLim - yBotC - 25) * k) nomeP = perfilCurto(d.pilares[0] ? d.pilares[0].perfil : "");
      var pc = V.P(-dP / 4, yBotC + 20);
      D.texto(pc[0], pc[1], nomeP, hn, { al: "E", meio: true, rot: -90 });
    } else {
      V.cheio(V.ret(-t, -H2, 0, H2)); V.cheio(V.ret(0, -H2, t, H2));
      var s1 = V.P(0, H2), s2 = V.P(0, -H2); D.add('<line x1="' + n(s1[0]) + '" y1="' + n(s1[1]) + '" x2="' + n(s2[0]) + '" y2="' + n(s2[1]) + '" stroke="#fff" stroke-width="0.15"/>');
      var yA1 = viga(t, 1, true); viga(-t, -1);
      furosV.forEach(function (v) { var a = V.P(-t, v), b = V.P(t, v); D.parafuso(a[0], a[1], b[0], b[1], pf, k); });
      var sw = V.P(t, yA1(t) - hv); D.solda(sw[0], sw[1], 58, { perna: L.perna, lados: "ambos", ls: 10, lr: 14 });
      var eixo = V.P(0, Math.max(hv, H2) + 34), eixo2 = V.P(0, -Math.max(hv, H2) - 22); D.linha(eixo[0], eixo[1], eixo2[0], eixo2[1], "MET-EIXO");
      D.texto(eixo[0], eixo[1] - 1.2, "CUMEEIRA", hn, { al: "C" });
    }
    /* corte da chapa: furos, cotas, a seção da viga cortada */
    var Wk = L.W * k, Hk = L.H * k, vx = x + w - 2 - 16 - Wk, vy = y0 + 22, cxp = vx + Wk / 2, cyp = vy + Hk / 2;
    D.texto(cxp, vy - 15.5, "CORTE " + letra + "-" + letra, T.nota, { al: "C" });
    D.ret(vx, vy, Wk, Hk, "MET-PERFIL");
    D.secaoI(cxp, cyp, dV / d.co * k, bfV * k, twV * k, tfV / d.co * k);
    var ys = furosV.map(function (v) { return cyp - v * k; }), g2 = L.gage / 2 * k;
    ys.forEach(function (yy) { D.furo(cxp - g2, yy, L.furo / 2 * k); D.furo(cxp + g2, yy, L.furo / 2 * k); });
    var mb = Math.round((L.W - L.gage) / 2);
    D.cadeia([[vx, vy], [cxp - g2, vy], [cxp + g2, vy], [vx + Wk, vy]], 5.5, [String(mb), String(Math.round(L.gage)), String(Math.round(L.W - L.gage - mb))]);
    D.cota(vx, vy, vx + Wk, vy, 11, String(Math.round(L.W)));
    var yv = [vy + Hk].concat(ys.slice().sort(function (a, b) { return b - a; })).concat([vy]), acc = yv.map(function (yy) { return Math.round((vy + Hk - yy) / k); }), vv = [];
    for (var i = 0; i + 1 < acc.length; i++) vv.push(String(acc[i + 1] - acc[i]));
    D.cadeia(yv.map(function (yy) { return [vx + Wk, yy]; }), -5.5, vv);
    D.cota(vx + Wk, vy + Hk, vx + Wk, vy, -12, String(Math.round(L.H)));
    notasAbaixo(D, x + 2, Math.max(oy - ey0 * k, vy + Hk + 4) + 8, y + hCel - 2, w - 4, lin);
  }

  /* 4 — CLIP DE TERÇA */
  function det4Clip(D, c, x, y, w, hCel) {
    var d = c.d, T = D.E.T, hn = T.nota * 0.9, L = c.lig.clip, sv = d.secV;
    var sT = d.tercaInfo && d.tercaInfo.secao && num(d.tercaInfo.secao.bw, 0) > 0 ? d.tercaInfo.secao : null;
    var a = L.a, b = L.b, t = L.t, tfV = num(sv.tf, 10), bfV = num(sv.bf, 100), twV = num(sv.tw, 6), hT = sT ? num(sT.bw, 150) : 150, bT = sT ? num(sT.bf, 60) : 60, twT = sT ? num(sT.t, 2) : 2.0, lab = sT ? num(sT.D, 20) : 20, EXT = 50;
    var lin = [L.furos.length + " parafusos " + L.pf.id + " - " + L.classe + (L.duasTercas ? " (2 por terça)" : " na alma da terça") + ", furos Ø " + br(L.furo, 1) + "; clip " + L.nome + " x " + Math.round(L.La) + " soldado na mesa superior da viga, filete " + L.perna + " mm dos dois lados."];
    lin = lin.concat(situacao(L, sT ? [] : [{ t: "Terça desenhada como referência (tracejado vermelho): o perfil sai do dimensionamento NBR 14762.", cor: VERMELHO }]));
    var hN = linhasAltura(D, w - 4, lin), Lv2 = Math.max(L.La + 2 * EXT, bfV + 60);
    function caixa(e) { var k = 1 / e; return { w: Math.max((bT + 20 + b + 40) * k + 70, (Lv2 + 20) * k + 30), h: 13 + 10 + (hT + 42) * k + 16 + (hT + 39) * k + 12 + hN }; }
    var esc = escolher([2, 5, 10], function (e) { var q = caixa(e); return q.w <= w && q.h <= hCel; }), k = 1 / esc;
    var y0 = y + tituloVista(D, x, y, "CLIP DE TERÇA", "ESC 1:" + esc, 4);
    var V = VL(D, x + 6 + (bT + 20) * k, y0 + 10 + (hT + 12) * k, k), xa = -bT - 20, xb = b + 40;
    V.ln(xa, 0, xb, 0, "MET-PERFIL"); V.ln(xa, -tfV, xb, -tfV, "MET-PERFIL");
    V.quebra(xa, 6, xa, -tfV - 6); V.quebra(xb, 6, xb, -tfV - 6);
    V.cheio([[0, 0], [b, 0], [b, t], [t, t], [t, a], [0, a]]);
    var tw2 = sT ? twT : 2 * twT, tc = [[0, 0], [-bT, 0], [-bT, lab], [-bT + tw2, lab], [-bT + tw2, tw2], [-tw2, tw2], [-tw2, hT - tw2], [-bT + tw2, hT - tw2], [-bT + tw2, hT - lab], [-bT, hT - lab], [-bT, hT], [0, hT]];
    if (sT) V.cheio(tc); else V.poli(tc, "MET-PEND", true);
    var pa = V.P(t, L.h), pz = V.P(-twT, L.h); D.parafuso(pa[0], pa[1], pz[0], pz[1], L.pf, k);
    var sw = V.P(b, 0); D.solda(sw[0], sw[1], -40, { perna: L.perna, lados: "ambos", ls: 8, lr: 15, comp: String(Math.round(L.La)) });
    var q0 = V.P(t, 0), q1 = V.P(t, L.h); D.cota(q0[0], q0[1], q1[0], q1[1], -9, String(L.h));
    var ct = V.P(-bT, hT - 10); D.chamada(ct[0], ct[1], ct[0] - 3, ct[1] - 9, [{ t: "TERÇA TC1" }, sT ? { t: perfilCurto(d.perfilTerca.nome) } : { t: "A DIMENSIONAR", cor: VERMELHO }], { h: hn, dir: 1 });
    var cc = V.P(t, a - 6); D.chamada(cc[0], cc[1], cc[0] + 14, cc[1] - 12, [L.nome + " - L = " + Math.round(L.La)], { h: hn });
    D.texto(V.P(0, 0)[0], V.P(0, -tfV - 6)[1] + 5.5, "SEÇÃO", T.nota, { al: "C" });
    var cv = V.P(xb - 12, -tfV / 2);
    D.chamada(cv[0], cv[1], cv[0] - 2, cv[1] + 10, ["MESA SUPERIOR DA VIGA"], { h: hn, dir: -1, alternativas: [[cv[0] + 3, cv[1] + 10, 1], [cv[0] - 2, cv[1] + 15, -1], [cv[0] + 3, cv[1] + 15, 1], [cv[0] + 6, cv[1] - 9, 1]] });
    var y1 = V.P(0, -tfV - 6)[1] + 14, V2 = VL(D, x + w / 2, y1 + (hT + 14) * k, k);
    V2.ln(-bfV / 2, 0, bfV / 2, 0, "MET-PERFIL"); V2.ln(-bfV / 2, -tfV, bfV / 2, -tfV, "MET-PERFIL");
    V2.ln(-bfV / 2, 0, -bfV / 2, -tfV, "MET-PERFIL"); V2.ln(bfV / 2, 0, bfV / 2, -tfV, "MET-PERFIL");
    V2.ln(-twV / 2, -tfV, -twV / 2, -25, "MET-PERFIL"); V2.ln(twV / 2, -tfV, twV / 2, -25, "MET-PERFIL"); V2.quebra(-25, -25, 25, -25);
    V2.poli(V2.ret(-L.La / 2, 0, L.La / 2, a), "MET-PERFIL", true);
    V2.ln(-L.La / 2, t, L.La / 2, t, "MET-FINA");
    var camT = sT ? "MET-SECUNDARIO" : "MET-PEND";
    if (L.duasTercas) { V2.poli(V2.ret(-Lv2 / 2, 0, -5, hT), camT, true); V2.poli(V2.ret(5, 0, Lv2 / 2, hT), camT, true); }
    else V2.poli(V2.ret(-Lv2 / 2, 0, Lv2 / 2, hT), camT, true);
    /* eixo da alma da viga, interrompido onde passam os textos da cota dos furos (cota a 7 mm acima do clip) */
    var ea = V2.P(0, hT + 12), eb = V2.P(0, -25), yCot = V2.P(0, a)[1] - 7, gA = yCot - 0.8 - 0.76 * T.cota - 0.6, gB = yCot - 0.2;
    if (gA > ea[1] && gB < eb[1]) { D.linha(ea[0], ea[1], ea[0], gA, "MET-EIXO"); D.linha(ea[0], gB, eb[0], eb[1], "MET-EIXO"); }
    else D.linha(ea[0], ea[1], eb[0], eb[1], "MET-EIXO");
    L.furos.forEach(function (f) { var p = V2.P(f, L.h); D.furo(p[0], p[1], L.furo / 2 * k); });
    var px = [-L.La / 2].concat(L.furos).concat([L.La / 2]).map(function (f) { return V2.P(f, a); }), vals = [];
    for (var i = 0; i + 1 < px.length; i++) vals.push(String(Math.round((px[i + 1][0] - px[i][0]) / k)));
    D.cadeia(px, 7, vals);
    D.texto(V2.P(0, -25)[0], V2.P(0, -25)[1] + 5.5, "VISTA AO LONGO DA VIGA", T.nota, { al: "C" });
    notasAbaixo(D, x + 2, V2.P(0, -25)[1] + 16, y + hCel - 2, w - 4, lin);
  }

  /* 5 — FIXAÇÃO DO CONTRAVENTAMENTO: barra redonda com rosca e a chapa de apoio da porca soldada no apoio,
     perpendicular à barra (no ângulo de cada barra); porca e contraporca do lado do apoio. As medidas
     (largura, espessura, balanço até o furo, solda) são as da ligação; a folga da porca para o apoio é
     conferida aqui e, se não couber, vira pendência em vermelho. */
  function det5Contravento(D, c, x, y, w, hCel) {
    var d = c.d, T = D.E.T, hn = T.nota * 0.9, L = c.lig.contravento, pf = L.porca, bf = num(d.secP.bf, 150);
    var al = L.alfa, ca = Math.cos(al), sa = Math.sin(al), px = sa, py = ca, ux = -ca, uy = sa, tg = L.t, Lp = 2 * L.e, Lb = 170;
    var H0 = [px * L.e, py * L.e], hw = L.biselada ? 8 : pf.arr.h, pilha = hw + 2 * pf.m + 3 * pf.passo;
    /* folga até o apoio (x = 0): o canto da contraporca girando (raio = s/raiz 3, no plano da porca) e a ponta
       da barra (3 fios além da contraporca); |px| projeta esse raio na direção do apoio */
    var fimP = [H0[0] + ux * pilha, H0[1] + uy * pilha], tN = hw + 2 * pf.m, sxp = Math.abs(px);
    var folga = Math.min(H0[0] + ux * tN - sxp * pf.s / Math.sqrt(3), fimP[0] - sxp * L.d / 2);
    var fim = [H0[0] - ux * Lb, H0[1] - uy * Lb];
    var xmin = Math.min(-0.45 * bf - 10, fimP[0] - pf.s), xmax = Math.max(fim[0], px * Lp) + 20, ymin = fim[1] - 20, ymax = Math.max(fimP[1] + pf.s, py * Lp) + 30;
    var e = c.esf.cv;
    var lin = ["Chapa de apoio # " + espChapa(L.t) + " x " + L.b + " (ASTM A36) perpendicular à barra, furo Ø " + br(L.furo, 1) + " a " + L.e + " mm da solda; filete " + L.perna + " mm nos dois lados (2 x " + L.b + " mm) no pilar/viga.",
      d.cvNome + " (" + ((((d.G.grupos || {}).contravento || {}).aco || {}).id || "") + ") com rosca na ponta, " + (L.biselada ? "arruela biselada, " : "arruela, ") + "porca e contraporca; tensionar na montagem."];
    var ef = [];
    if (e) ef.push("Esforço de cálculo na barra mais solicitada (" + e.barra + "): Nd = " + kN(e.N) + " kN" + (e.razao != null ? "; verificação da barra " + br(e.razao, 2) : "") + ".");
    if (folga < 0) ef.push({ t: "Com a barra a " + br(al * 180 / Math.PI, 0) + "° e o furo a " + L.e + " mm da solda, a contraporca encosta no apoio (" + br(folga, 0) + " mm); prever chapa mais longa ou afastador [PENDENTE].", cor: VERMELHO });
    else if (folga < 5) ef.push({ t: "Com a barra a " + br(al * 180 / Math.PI, 0) + "°, a contraporca fica a " + br(folga, 0) + " mm do apoio: conferir o espaço para o aperto [PENDENTE].", cor: VERMELHO });
    lin = lin.concat(situacao(L, ef));
    var hN = linhasAltura(D, w - 4, lin);
    function caixa(es) { var k = 1 / es; return { w: (xmax - xmin) * k + 70, h: 13 + 8 + (ymax - ymin) * k + 6 + hN }; }
    var esc = escolher([2, 5, 10], function (es) { var q = caixa(es); return q.w <= w && q.h <= hCel; }), k = 1 / esc;
    var y0 = y + tituloVista(D, x, y, "FIXAÇÃO DO CONTRAVENTAMENTO", "ESC 1:" + esc, 5);
    var V = VL(D, x + 6 - xmin * k, y0 + 6 + ymax * k, k), yb = ymin + 8, yt = ymax - 6;
    V.ln(0, yb, 0, yt, "MET-PERFIL"); V.ln(-0.45 * bf, yb, -0.45 * bf, yt, "MET-FINA");
    V.quebra(-0.45 * bf - 6, yt, 6, yt); V.quebra(-0.45 * bf - 6, yb, 6, yb);
    /* chapa de apoio (vista de perfil, cortada): do apoio ao longo de p, espessura para o lado da barra */
    var A1 = [px * Lp, py * Lp];
    V.cheio([[0, 0], A1, [A1[0] - ux * tg, A1[1] - uy * tg], [-ux * tg, -uy * tg]]);
    /* a barra */
    var rr = L.d / 2;
    var pT = [H0[0] + ux * (pilha + 4), H0[1] + uy * (pilha + 4)];
    V.ln(fim[0] + px * rr, fim[1] + py * rr, pT[0] + px * rr, pT[1] + py * rr, "MET-PERFIL");
    V.ln(fim[0] - px * rr, fim[1] - py * rr, pT[0] - px * rr, pT[1] - py * rr, "MET-PERFIL");
    V.ln(pT[0] + px * rr, pT[1] + py * rr, pT[0] - px * rr, pT[1] - py * rr, "MET-PERFIL");
    var qf1 = V.P(fim[0] + px * 12, fim[1] + py * 12), qf2 = V.P(fim[0] - px * 12, fim[1] - py * 12); D.quebra(qf1[0], qf1[1], qf2[0], qf2[1]);
    /* arruela, porca e contraporca do lado do apoio */
    var Q0 = V.P(H0[0], H0[1]), Q1 = V.P(H0[0] + ux, H0[1] + uy), dl = hip(Q1[0] - Q0[0], Q1[1] - Q0[1]), dx = (Q1[0] - Q0[0]) / dl, dy = (Q1[1] - Q0[1]) / dl, cur = 0;
    [[hw, pf.arr.d2 / 2], [pf.m, pf.s / 2], [pf.m, pf.s / 2]].forEach(function (q) { D.retRot(Q0[0] + dx * cur, Q0[1] + dy * cur, dx, dy, q[0] * k, q[1] * k, folga < 5 ? "MET-PEND" : "MET-SECUNDARIO"); cur += q[0] * k; });
    /* solda da chapa no apoio: de preferência na faixa do pilar; se lá não couber (escala menor), a linha de referência
       passa a face de trás e o símbolo fica fora; ou vai para baixo da chapa */
    var sw = V.P(0, 1), Wf = 0.45 * bf * k, lrFora = Math.max(13, (Wf + 6) / 0.55);
    var altS = [{ ang: 100, ls: 14, lr: 13, esquerda: true }, { ang: 70, ls: 14, lr: 13, esquerda: false }, { ang: 110, ls: 20, lr: 13, esquerda: true },
                { ang: 150, ls: 9, lr: lrFora, esquerda: true }, { ang: 165, ls: 8, lr: lrFora, esquerda: true }]
      .filter(function (q) { var jx = sw[0] + Math.cos(q.ang * Math.PI / 180) * q.ls, ex = jx + (q.esquerda ? -1 : 1) * q.lr; return ex >= x + 2 && ex <= x + w - 2; });   /* dentro da célula */
    D.solda(sw[0], sw[1], 128, { perna: L.perna, lados: "ambos", ls: 9, lr: 13, esquerda: true, alternativas: altS });
    var a0 = V.P(0, 0), a1 = V.P(H0[0], H0[1]); D.cota(a0[0], a0[1], a1[0], a1[1], -6.5, String(L.e), { offs: [6.5, -10, 10, -13.5, 13.5], evitar: [V.P(H0[0] - px * rr, H0[1] - py * rr)] });
    var xR = V.P(xmax, 0)[0] - 4, yTop = V.P(0, ymax)[1] + 3;
    var pn = [Q0[0] + dx * (hw + pf.m * 1.5) * k, Q0[1] + dy * (hw + pf.m * 1.5) * k];
    var pc = V.P(A1[0] - ux * tg / 2, A1[1] - uy * tg / 2), xTx = Math.max(pc[0], pn[0]) + 12;
    D.chamada(pn[0], pn[1], xTx, yTop + 3, [(L.biselada ? "ARRUELA BISELADA, " : "ARRUELA, ") + "PORCA E CONTRAPORCA"], { h: hn, dir: 1 });
    D.chamada(pc[0], pc[1], xTx + 4, yTop + 12, ["CHAPA DE APOIO # " + espChapa(L.t) + " x " + L.b + " - FURO Ø " + br(L.furo, 1)], { h: hn, dir: 1 });
    var pb = V.P(H0[0] - ux * Lb * 0.6, H0[1] - uy * Lb * 0.6);
    D.chamada(pb[0], pb[1], pb[0] + 10, pb[1] - 7, [d.cvNome.toUpperCase()], { h: hn });
    /* nome do apoio por último, na faixa do pilar, onde nada o atravesse (a solda e as chamadas já estão lá) */
    var yMid = (yb + yt) / 2, ypl = null;
    for (var dy2 = 0; dy2 <= (yt - yb) / 2 && ypl == null; dy2 += 2) [yMid - dy2, yMid + dy2].forEach(function (yy) {
      if (ypl != null) return; var pq = V.P(-0.22 * bf, yy);
      if (D.livreQ(caixaTexto(pq[0], pq[1], "PILAR / VIGA", hn, { al: "C", meio: true, rot: -90 }), 1.0, 1.5)) ypl = yy;
    });
    var pl = V.P(-0.22 * bf, ypl != null ? ypl : yMid); D.texto(pl[0], pl[1], "PILAR / VIGA", hn, { al: "C", meio: true, rot: -90 });
    notasAbaixo(D, x + 2, V.P(0, ymin)[1] + 8, y + hCel - 2, w - 4, lin);
  }

  /* 6 — MÃO-FRANCESA (posições, perfil, parafusos, chapa e solda do cálculo; sem o cálculo da ligação, partida em vermelho) */
  function det6MaoFrancesa(D, c, x, y, w, hCel) {
    var d = c.d, T = D.E.T, hn = T.nota * 0.9, sv = d.secV, pf = c.lig.mf.pf;
    var dV = num(sv.d, 300), bf = num(sv.bf, 100), tw = num(sv.tw, 6), tf = num(sv.tf, 10), hT = 150, L0 = Math.max(450, dV + 200);
    var pos = "Posições do cálculo: " + d.mf.length + " mãos-francesas (" + eixosTxt(d.mf.map(function (m) { return m.k + 1; })) + "), na terça a " + br(d.mf[0].s, 2) + " m do beiral - ver a planta de cobertura (MF1).";
    var MFL = c.lig.mf, cal = !!(MFL && MFL.calc);
    var lin = [cal ? MFL.n + " parafuso" + (MFL.n > 1 ? "s " : " ") + pf.id + " - " + MFL.classe + " em cada ponta; chapa de ligação # " + espChapa(MFL.chapa ? MFL.chapa.t : 6.3) + " x " + (MFL.chapa ? MFL.chapa.b : 60) + " soldada na mesa (filete " + MFL.perna + " mm, dois lados)."
                   : "Parafusos " + pf.id + " - " + c.lig.mf.classe + " nas duas pontas (valor de partida da Metálica).", pos];
    lin = lin.concat(situacao(c.lig.mf, [{ t: "Cantoneira, chapa de ligação e solda a dimensionar: a mão-francesa trava a mesa inferior comprimida da viga.", cor: VERMELHO }]));
    var hN = linhasAltura(D, w - 4, lin);
    function caixa(e) { var k = 1 / e; return { w: (2 * L0 + 30) * k + 6, h: 13 + 14 + (dV + hT + 80) * k + 10 + hN }; }
    var esc = escolher([5, 10, 15, 20], function (e) { var q = caixa(e); return q.w <= w && q.h <= hCel; }), k = 1 / esc;
    var y0 = y + tituloVista(D, x, y, "MÃO-FRANCESA", "ESC 1:" + esc, 6);
    var V = VL(D, x + w / 2, y0 + 14 + (dV / 2 + hT + 20) * k, k);
    D.secaoI(V.P(0, 0)[0], V.P(0, 0)[1], dV * k, bf * k, tw * k, tf * k);
    var yt0 = dV / 2;
    V.poli(V.ret(-L0, yt0, L0, yt0 + hT), "MET-PEND", true);
    V.quebra(-L0, yt0 + hT + 14, -L0, yt0 - 14); V.quebra(L0, yt0 + hT + 14, L0, yt0 - 14);
    var xb = bf / 2 + 25, xt = xb + dV + 40;
    [-1, 1].forEach(function (sg) {
      var p0 = V.P(sg * xb, -dV / 2 + tf / 2), p1 = V.P(sg * xt, yt0 + 2), Lp = hip(p1[0] - p0[0], p1[1] - p0[1]), ux = (p1[0] - p0[0]) / Lp, uy = (p1[1] - p0[1]) / Lp;
      D.retRot(p0[0] - ux * 20 * k, p0[1] - uy * 20 * k, ux, uy, Lp + 20 * k, 20 * k, "MET-PEND");
      V.poli(V.ret(sg * bf / 2, -dV / 2, sg * (xb + 25), -dV / 2 + tf), "MET-PEND", true);
      D.ponto(p0[0], p0[1], pf.d / 2 * k + 0.25); D.ponto(p1[0] - ux * 30 * k, p1[1] - uy * 30 * k, pf.d / 2 * k + 0.25);
    });
    var cm = V.P(xb + dV * 0.55, -dV / 2 + dV * 0.55);
    D.chamada(cm[0] + 1.5, cm[1], cm[0] + 12, cm[1] + 12, cal ? [{ t: "MF1 - " + perfilCurto(MFL.perfil).replace(/X/g, " x ").replace(/^L(\d)/, "L $1").replace(/(\d)\.(\d)/g, "$1,$2") }] : [{ t: "MF1 - CANTONEIRA" }, { t: "A DIMENSIONAR", cor: VERMELHO }], { h: hn });
    var ctp = V.P(-L0 * 0.75, yt0 + hT), tcI = d.tercaInfo;
    D.chamada(ctp[0], ctp[1], ctp[0] + 4, ctp[1] - 8, tcI && tcI.nome ? [{ t: "TERÇA TC1 - " + perfilCurto(tcI.nome) }] : [{ t: "TERÇA TC1" }, { t: "A DIMENSIONAR", cor: VERMELHO }], { h: hn });
    var cvg = V.P(-bf / 2, -dV * 0.3);
    D.chamada(cvg[0], cvg[1], cvg[0] - 18, cvg[1] + 8, ["VIGA " + perfilCurto(d.vigas[0] ? d.vigas[0].perfil : "")], { h: hn, dir: -1 });
    notasAbaixo(D, x + 2, V.P(0, -dV / 2 - 40)[1] + 8, y + hCel - 2, w - 4, lin);
  }

  /* 6 (sem mão-francesa) — QUADRO DAS LIGAÇÕES: o resumo de cada ligação, como o cálculo devolveu */
  function det6Quadro(D, c, x, y, w, hCel) {
    var d = c.d, T = D.E.T, L = c.lig, y0 = y + tituloVista(D, x, y, "QUADRO DAS LIGAÇÕES", null, 6) + 3;
    var itens = [["1", "Placa de base", L.bases[(d.tiposBase[0] || {}).marca]], ["2", "Joelho", L.joelho], ["3", "Cumeeira", L.cumeeira], ["4", "Clip de terça", L.clip], ["5", "Contraventamento", L.contravento]];
    d.tiposBase.slice(1).forEach(function (tb) { itens.splice(1, 0, ["1", "Placa de base " + tb.marca, L.bases[tb.marca]]); });
    if (d.aguas !== 2) itens = itens.filter(function (q) { return q[1] !== "Cumeeira"; });
    var cols = [{ t: "DET.", w: 11 }, { t: "LIGAÇÃO", w: 32, al: "E" }, { t: "SITUAÇÃO", w: 30 }, { t: ["APROVEI-", "TAMENTO"], w: 20 }, { t: "GOVERNA", w: w - 4 - 93, al: "E" }];
    var lin = itens.map(function (q) {
      var o = q[2] || {};
      return [q[0], q[1] + (q[1] === "Placa de base" && d.tiposBase[0] ? " " + d.tiposBase[0].marca : ""), o.calc ? { t: "DIMENSIONADA" } : { t: "PARTIDA", cor: VERMELHO },
              o.calc && o.razao != null ? br(o.razao, 2) : "-", o.calc ? txt(o.governante) : "conferir no memorial"];
    });
    var t = D.tabela(x + 2, y0, cols, lin, { fs: T.tabela * 0.9, fsc: T.tabelaCab * 0.82 });
    var notas = ["Mãos-francesas: dispensadas pelo cálculo (as barras passam com a mesa comprimida destravada entre as ligações).",
      "Aproveitamento = solicitação / resistência da verificação que governa (NBR 8800; placa de base pelo AISC Design Guide 1)."];
    var yN = y0 + t.h + 6 + D.textos(x + 2, y0 + t.h + 6, notas, T.nota * 0.9, { wmax: w - 4 });
    var sit = L.partida ? [{ t: NOTA_PARTIDA + " nas ligações marcadas como PARTIDA.", cor: VERMELHO, attr: ' data-partida="1"' }] : [{ t: "Todas as ligações deste quadro foram dimensionadas pelo cálculo (ver memorial).", attr: ' data-dimensionada="1"' }];
    notasAbaixo(D, x + 2, yN + 3, y + hCel - 2, w - 4, sit);
  }

  function folhaDetalhes(c) {
    var D = c.D, a = c.geo.area, gap = 10, cw = (a.w - 2 * gap - 4) / 3, ch = (a.h - gap - 4) / 2;
    if (!c.lig) { D.texto(a.x + 10, a.y + 20, "Regras de ligação não carregadas: sem detalhes.", D.E.T.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var cel = [];
    for (var i = 0; i < 6; i++) cel.push({ x: a.x + 2 + (i % 3) * (cw + gap), y: a.y + 2 + Math.floor(i / 3) * (ch + gap) });
    det1Base(D, c, cel[0].x, cel[0].y, cw, ch);
    detLigacaoTopo(D, c, cel[1].x, cel[1].y, cw, ch, false);
    detLigacaoTopo(D, c, cel[2].x, cel[2].y, cw, ch, c.d.aguas === 2 ? true : "alto");
    det4Clip(D, c, cel[3].x, cel[3].y, cw, ch);
    det5Contravento(D, c, cel[4].x, cel[4].y, cw, ch);
    if (c.d.mf.length) det6MaoFrancesa(D, c, cel[5].x, cel[5].y, cw, ch); else det6Quadro(D, c, cel[5].x, cel[5].y, cw, ch);
    D.linha(a.x + 2 + cw + gap / 2, a.y + 2, a.x + 2 + cw + gap / 2, a.y + a.h - 2, "MET-COTA");
    D.linha(a.x + 2 + 2 * cw + 1.5 * gap, a.y + 2, a.x + 2 + 2 * cw + 1.5 * gap, a.y + a.h - 2, "MET-COTA");
    D.linha(a.x + 2, a.y + 2 + ch + gap / 2, a.x + a.w - 2, a.y + 2 + ch + gap / 2, "MET-COTA");
    return { escala: "INDICADA" };
  }

  /* quantitativo das ligações (chapas, clips, parafusos, chumbadores) com as dimensões que valem — as do
     cálculo, ou as de partida (marcadas) — para o orçamento */
  function quantLigacoes(d, lig) {
    if (!lig) return [];
    var rho = 7850e-9, out = [], nPort = d.zs.length, M = MT(), chapaAco = (M && M.PADRAO && M.PADRAO.chapa) || "ASTM A36";
    function sit(L) { return L && L.calc ? "" : " (partida)"; }
    function chapa(item, desc, t, b, h, q, L) { var pu = t * b * h * rho; out.push({ item: item, desc: desc + sit(L), dim: "# " + espChapa(t) + " x " + Math.round(b) + " x " + Math.round(h), mat: chapaAco, q: q, pu: pu, pt: pu * q, calc: !!(L && L.calc) }); }
    function peca(item, desc, dim, mat, q, L) { out.push({ item: item, desc: desc + sit(L), dim: dim, mat: mat, q: q, pu: null, pt: null, calc: !!(L && L.calc) }); }
    d.tiposBase.forEach(function (tb) { var b = lig.bases[tb.marca]; chapa(tb.marca, "Placa de base (" + seq(tb.pecas) + ")", b.t, b.B, b.N, tb.pecas.length, b); });
    var j = lig.joelho; chapa("2", "Chapa de extremidade do joelho", j.t, j.W, j.H, 2 * nPort, j);
    if (j.enrij) chapa("2", "Enrijecedor do pilar no joelho", num(j.enrij.t, 12.5), num(j.enrij.b, 90), Math.max(0, num(d.secP.d, 300) - 2 * num(d.secP.tf, 10)), 2 * nPort * 2 * Math.max(1, num(j.enrij.n, 2)), j);   /* 2 joelhos por pórtico x 2 mesas x n chapas */
    if (d.aguas === 2) { var cu = lig.cumeeira; chapa("3", "Chapa de topo da cumeeira", cu.t, cu.W, cu.H, 2 * nPort, cu); }
    var cl = lig.clip, mCl = null;
    if (CAT()) { try { var q = CAT().obter(cl.cat); if (q) mCl = num(q.massa, null); } catch (e) { mCl = null; } }
    if (mCl == null) mCl = (cl.a + cl.b - cl.t) * cl.t * 7850e-6;
    var nClip = d.tercas.length * nPort;
    out.push({ item: "4", desc: "Clip de terça (1 por cruzamento terça x viga)" + sit(cl), dim: cl.nome + " - L = " + Math.round(cl.La), mat: chapaAco, q: nClip, pu: mCl * cl.La / 1000, pt: mCl * cl.La / 1000 * nClip, calc: !!cl.calc });
    var cv = lig.contravento;
    if (d.cv.length) chapa("5", "Chapa de apoio da porca do contraventamento", cv.t, cv.b, 2 * cv.e, 2 * d.cv.length, cv);
    var nBases = d.pilares.length + d.taps.length, b0 = d.tiposBase.length ? lig.bases[d.tiposBase[0].marca] : null;
    if (b0) peca("1", "Chumbador Ø " + b0.pf.id + (b0.gancho ? " com gancho" : "") + ", porca e arruela", "ancoragem " + b0.ancoragem, b0.classe, d.tiposBase.reduce(function (s, tb) { return s + lig.bases[tb.marca].n * tb.pecas.length; }, 0), b0);
    peca("2", "Parafuso " + j.pf.id + " com porca e arruela (joelho)", "L = " + Math.round(num(j.L, 0)), j.classe, j.n * 2 * nPort, j);
    if (d.aguas === 2) peca("3", "Parafuso " + lig.cumeeira.pf.id + " com porca e arruela (cumeeira)", "L = " + Math.round(num(lig.cumeeira.L, 0)), lig.cumeeira.classe, lig.cumeeira.n * nPort, lig.cumeeira);
    var porClip = cl.duasTercas ? null : cl.furos.length, nPar = porClip != null ? porClip * nClip : d.tercas.length * (Math.max(0, nPort - 2) * cl.furos.length + Math.min(2, nPort) * cl.furos.length / 2);
    peca("4", "Parafuso " + cl.pf.id + " com porca e arruela (clip de terça)", "conforme a alma da terça", cl.classe, nPar, cl);
    if (d.cv.length) peca("5", (cv.biselada ? "Arruela biselada" : "Arruela") + " + porca + contraporca (pontas das barras)", "Ø " + br(cv.d, 1), "-", 2 * d.cv.length, cv);
    void nBases;
    return out;
  }

  function folhaMateriais(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, lm = c.lista, x = a.x + 4, y = a.y + 2;
    y += tituloVista(D, x, y, "LISTA DE MATERIAIS - ESTRUTURA METÁLICA", "Comprimentos pelo eixo das barras (de nó a nó); o comprimento de corte sai do detalhamento de fabricação.") + 2;
    var cols = [{ t: "MARCA", w: 34 }, { t: "DESCRIÇÃO", w: 96, al: "E" }, { t: "PERFIL", w: 38 }, { t: "AÇO", w: 34 }, { t: "QUANT.", w: 16 },
      { t: ["COMPR.", "UNIT. (mm)"], w: 22 }, { t: ["COMPR.", "TOTAL (m)"], w: 22 }, { t: ["MASSA", "(kg/m)"], w: 18 }, { t: ["PESO", "UNIT. (kg)"], w: 21 }, { t: ["PESO", "TOTAL (kg)"], w: 24 }];
    var linhas = [], grupo = null, sub = 0;
    function fecha() { if (grupo != null && sub > 0) linhas.push({ total: ["", { t: "Subtotal - " + grupo.toLowerCase() }, "", "", "", "", "", "", "", { t: br(sub, 1) }] }); }
    lm.linhas.forEach(function (l) {
      if (l.grupo !== grupo) { fecha(); grupo = l.grupo; sub = 0; linhas.push({ titulo: l.grupo, attr: ' data-grupo="' + esc(l.grupo) + '"' }); }
      var pend = { t: "A DIMENSIONAR", cor: VERMELHO };
      linhas.push([l.marca, l.desc, l.perfil ? perfilCurto(l.perfil) : pend, l.aco || "-", String(l.qtd), l.L != null ? mm(l.L) : "-", l.L != null ? br(l.L * l.qtd, 2) : "-",
        l.massa != null ? br(l.massa, 2) : "-", l.pesoUnit != null ? br(l.pesoUnit, 1) : "-",
        l.pesoTotal != null ? { t: br(l.pesoTotal, 1), attr: ' data-peso' + (l.fora ? "-barra" : (l.grupo === "TERÇAS" || l.grupo === "TRAVESSAS" ? "-sec" : "")) + '="' + (Math.round(l.pesoTotal * 1000) / 1000) + '"' } : "-"]);
      if (l.pesoTotal != null) sub += l.pesoTotal;
    });
    fecha();
    var t = D.tabela(x, y, cols, linhas, {});
    /* ligações: quantitativo de partida */
    var ql = quantLigacoes(d, c.lig), yq = y + t.h + 12, totLig = 0;
    if (ql.length) {
      var tudoCalc = ql.every(function (q) { return q.calc; });
      yq += tituloVista(D, x, yq, "LIGAÇÕES - QUANTITATIVO" + (tudoCalc ? "" : " (DIMENSIONADAS E DE PARTIDA)"), null) + 1;
      var cq = [{ t: "DET.", w: 14 }, { t: "PEÇA", w: 110, al: "E" }, { t: "DIMENSÕES (mm)", w: 56 }, { t: "MATERIAL", w: 44 }, { t: "QUANT.", w: 18 }, { t: ["PESO", "UNIT. (kg)"], w: 22 }, { t: ["PESO", "TOTAL (kg)"], w: 24 }];
      var lq = ql.map(function (q) { if (q.pt != null) totLig += q.pt; return [q.item, q.desc, q.dim, q.mat, String(q.q), q.pu != null ? br(q.pu, 2) : "-", q.pt != null ? br(q.pt, 1) : "-"]; });
      lq.push({ total: ["", { t: "Total das chapas e clips" }, "", "", "", "", { t: br(totLig, 1), attr: ' data-peso-ligacoes="' + (Math.round(totLig * 10) / 10) + '"' }] });
      var tq = D.tabela(x, yq, cq, lq, {});
      D.texto(x, yq + tq.h + 2 + T.nota * 0.76, tudoCalc ? "Ligações dimensionadas pelo cálculo (DET. = nº do detalhe na folha 05); quantidades pelo número de pórticos, terças e barras." : NOTA_PARTIDA + " nos itens marcados (partida); DET. = nº do detalhe na folha 05.", T.nota * 0.92, { cor: tudoCalc ? null : VERMELHO });
    }
    /* resumo e totais */
    var xr = x + t.w + 16, yr = a.y + 2, wr = a.x + a.w - xr;
    yr += tituloVista(D, xr, yr, "RESUMO POR AÇO", null) + 1;
    var lr = lm.ordemAco.map(function (k) { return [k, { t: br(lm.porAco[k], 1), attr: ' data-resumo-aco="' + esc(k) + '"' }]; });
    lr.push({ total: [{ t: "TOTAL" }, { t: br(lm.total, 1), attr: ' data-peso-total="' + (Math.round(lm.total * 1000) / 1000) + '"' }] });
    var t2 = D.tabela(xr, yr, [{ t: "AÇO", w: 46 }, { t: "PESO (kg)", w: 28 }], lr);
    yr += t2.h + 9;
    yr += tituloVista(D, xr, yr, "TOTAIS", null) + 1;
    var linhasTot = [
      { t: "Estrutura principal e contraventamento: " + br(lm.principal, 1) + " kg (" + br(lm.taxa, 2) + " kg/m²).", attr: ' data-peso-principal="' + (Math.round(lm.principal * 1000) / 1000) + '" data-taxa="' + br(lm.taxa, 2) + '"' },
      lm.secundarias > 0 ? { t: "Terças e travessas (NBR 14762): " + br(lm.secundarias, 1) + " kg.", attr: ' data-peso-secundarias="' + (Math.round(lm.secundarias * 1000) / 1000) + '"' } : "",
      "Total da estrutura: " + br(lm.total, 1) + " kg (" + br(lm.taxaTotal, 2) + " kg/m²); área coberta (projeção) " + br(lm.area, 2) + " m².",
      lm.barras > 0 ? { t: "Correntes e tirantes (barras redondas do cálculo das terças e travessas): " + br(lm.barras, 1) + " kg - fora do total da estrutura.", attr: ' data-peso-barras="' + (Math.round(lm.barras * 1000) / 1000) + '"' } : "",
      "",
      "Ligações: premissa do cálculo " + br(lm.acrescimo * 100, 0) + " % = " + br(lm.ligacoes, 0) + " kg" + (totLig > 0 ? "; chapas e clips do quadro = " + br(totLig, 0) + " kg." : "."),
      "Total estimado com " + (lm.barras > 0 ? "correntes, tirantes e " : "") + "ligações: " + br(lm.total + lm.barras + Math.max(lm.ligacoes, totLig), 0) + " kg (" + br((lm.total + lm.barras + Math.max(lm.ligacoes, totLig)) / lm.area, 2) + " kg/m²)."
    ];
    var pend = lm.linhas.filter(function (l) { return l.pendente; });
    if (pend.length) linhasTot.push({ t: "Não incluídos no peso (a dimensionar): " + pend.map(function (l) { return l.marca; }).filter(function (v, i, aa) { return aa.indexOf(v) === i; }).join(", ") + ".", cor: VERMELHO });
    /* a lista sai das peças desenhadas; se o cálculo somou outra coisa nas terças e travessas, a diferença aparece aqui */
    var rS = c.r && c.r.pesoSecundarias != null ? num(c.r.pesoSecundarias, 0) : null;
    if (rS != null && lm.secundarias > 0 && Math.abs(lm.secundarias - rS) > 0.5)
      linhasTot.push({ t: "Terças e travessas: a lista (peças desenhadas) soma " + br(lm.secundarias, 1) + " kg e o cálculo informa " + br(rS, 1) + " kg - conferir antes de emitir [PENDENTE].", cor: VERMELHO, attr: ' data-diferenca-secundarias="1"' });
    D.textos(xr, yr, linhasTot, T.nota, { wmax: Math.max(60, wr - 4) });
    return { escala: "SEM ESCALA" };
  }

  /* ================================================================ GERAR */
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }

  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    var avisos = [];
    if (!r || !r.ok || !r.modelo || !r.modelo.layout || !r.modelo.modelo) return { ok: false, folhas: [], avisos: [(r && r.motivo) || "Resultado do cálculo vazio ou com erro: não há pranchas para gerar."] };
    var P = PR();
    if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    var E = estilo(opcoes.padrao), d = extrair(r, avisos);
    if (!d.pilares.length || !(d.vao > 0) || !(d.Lt > 0)) return { ok: false, folhas: [], avisos: ["Modelo sem pilares ou sem geometria: não há pranchas para gerar."] };
    var lig = ligacoes(d, r, avisos), esf = esforcos(r, d), lista = listaMateriais(d, r, avisos), casos = casosReacao(r);
    var semVento = !casos.some(function (q) { return q.vento; });
    if (semVento) avisos.push("O resultado não traz casos de vento: o quadro de cargas na fundação sai só com " + casos.map(function (q) { return q.id; }).join(", ") + " (refazer o cálculo com o vento antes de emitir).");
    var faltaSec = [];
    if (!d.perfilTerca) faltaSec.push("terças");
    if ((d.travE.length || d.travD.length) && !d.trvLat) faltaSec.push("travessas laterais (o modelo tem travessa nas laterais, o resultado não traz r.travessas.lateral)");
    if ((d.travF.length || d.travB.length) && !d.trvOit) faltaSec.push("travessas do oitão");
    if (faltaSec.length) avisos.push("Sem perfil no resultado: " + faltaSec.join("; ") + " - saem como 'a dimensionar', em vermelho.");
    if (lig && lig.partida) avisos.push(lig.partida + " ligação(ões) sem dimensionamento no resultado: saem com as dimensões de partida da Metálica e a nota 'conferir no memorial'.");
    if (d.mf.length) avisos.push("Mãos-francesas: posições do cálculo; perfil e ligação a dimensionar (detalhe 6 com valores de partida).");
    if (!d.correntes) avisos.push("Correntes de terça: posição de referência a meio vão (pendência); diâmetro a definir no dimensionamento das terças.");
    else if ((d.correntes.linhas > 0 && !d.ltCR) || (d.tirLat.length && !d.ltTR1) || (d.tirOit.length && !d.ltTR2)) avisos.push("Correntes das terças e tirantes das travessas: posições do cálculo; o diâmetro não vem no resultado (pendente, em vermelho).");
    if (r.aprovado === false) avisos.push("O cálculo não está aprovado (" + num(r.falhas, 0) + " falha(s)): as pranchas saem com a nota 'NÃO EMITIR'.");
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA");
    if (formato !== "A1" && formato !== "A0") avisos.push("Formato " + formato + ": as pranchas da metálica foram conferidas em A1 e A0; em folha menor, detalhes e quadros podem não caber - conferir ou usar A1.");
    var codigo = txt(opcoes.codigo).trim() || "EST-MET", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    var defs = [
      { id: "locacao", titulo: PADRAO_ACO.folhas[0], fn: folhaLocacao },
      { id: "cobertura", titulo: PADRAO_ACO.folhas[1], fn: folhaCobertura },
      { id: "porticos", titulo: PADRAO_ACO.folhas[2], fn: folhaPorticos },
      { id: "elevacoes", titulo: PADRAO_ACO.folhas[3], fn: folhaElevacoes },
      { id: "detalhes", titulo: PADRAO_ACO.folhas[4], fn: folhaDetalhes },
      { id: "materiais", titulo: PADRAO_ACO.folhas[5], fn: folhaMateriais }
    ];
    var ctx0 = { d: d, r: r, E: E, geo: geo, lig: lig, esf: esf, lista: lista, casos: casos, semVento: semVento, op: opcoes, rev: rev, avisos: avisos };
    /* uma folha pode pedir folhas de continuação (ex.: 01A com o quadro de cargas): entram logo depois dela, com o
       número da folha + letra; a contagem "nn/TT" do carimbo continua sendo a das folhas principais */
    var feitas = [];
    function novoCtx(D, n) { var c = {}; Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.n = n; return c; }
    function erroFolha(D, rot, titulo, e) { avisos.push("Folha " + rot + " (" + titulo + "): " + (e && e.message ? e.message : String(e))); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
    defs.forEach(function (def, i) {
      var D = new Desenho(E, opcoes.depurar ? [] : null), c = novoCtx(D, i + 1), res = {};
      try { res = def.fn(c) || {}; } catch (e) { erroFolha(D, dois(i + 1), def.titulo, e); }
      feitas.push({ def: def, D: D, escala: res.escala || "INDICADA", rotulo: dois(i + 1) });
      arr(res.extras).forEach(function (x) {
        var D2 = new Desenho(E, opcoes.depurar ? [] : null), c2 = novoCtx(D2, i + 1), r2 = {}, rot = dois(i + 1) + x.sufixo;
        try { r2 = x.desenhar(c2) || {}; } catch (e) { erroFolha(D2, rot, x.titulo, e); }
        feitas.push({ def: { id: x.id, titulo: x.titulo }, D: D2, escala: r2.escala || "SEM ESCALA", rotulo: rot });
      });
    });
    /* a prancha (para o carimbo do js/prancha.js): o código do escritório + revisão; a folha "nn/NN" */
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null;
    var revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "acopranchas", nome: "Estrutura metálica - projeto executivo", formato: formato, orientacao: "paisagem", origem: "metalica",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local),
                 codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var nPrinc = defs.length;
    var blocos = blocosNotas(ctx0);
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, M = geo.moldura;
      var corpo = D.svg();
      var F = new Desenho(E, null);
      F.ret(M.x, M.y, M.w, M.h, "MET-MOLDURA");
      if (!colunaNotas(F, geo, blocos) && i === 0) avisos.push("As notas não cabem na coluna da direita com a letra mínima do padrão: conferir.");
      carimbo(F, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(nPrinc));
      var numero = codigo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(H) + 'mm" viewBox="0 0 ' + n(W) + " " + n(H) + '" font-family="' + FONTE + '" data-folha="' + f.def.id + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev) + "</title>" +
        '<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + corpo + "</g>" + F.svg() + "</svg>";
      var o = { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg };
      /* o que o DXF (js/pranchasdxf.js) precisa para refazer o carimbo RA e achar a layer do Padrão RA de cada camada MET-*; só dados simples (a madeira devolve isto do Worker em JSON) */
      o.dxf = { familia: "metalica", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: f.rotulo + "/" + dois(nPrinc), logo: !!opcoes.logo, padrao: opcoes.padrao || null,
                camadas: PADRAO_ACO.camadas, tituloH: E.T.titulo, codigo: codigo };
      if (opcoes.depurar) o.caixasTexto = D.caixas;
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos };
  }

  /* --------------------------------------------------- conferência de sobreposição de textos (teste/depuração) */
  function sobrepoe(a, b, tol) {
    var polys = [a, b];
    for (var p = 0; p < 2; p++) {
      var Pp = polys[p];
      for (var i = 0; i < Pp.length; i++) {
        var q1 = Pp[i], q2 = Pp[(i + 1) % Pp.length], ax = -(q2[1] - q1[1]), ay = q2[0] - q1[0], L = hip(ax, ay);
        if (L < 1e-9) continue; ax /= L; ay /= L;
        var mA = Infinity, MA = -Infinity, mB = Infinity, MB = -Infinity;
        a.forEach(function (q) { var v = q[0] * ax + q[1] * ay; if (v < mA) mA = v; if (v > MA) MA = v; });
        b.forEach(function (q) { var v = q[0] * ax + q[1] * ay; if (v < mB) mB = v; if (v > MB) MB = v; });
        if (MA - tol <= mB || MB - tol <= mA) return false;
      }
    }
    return true;
  }
  function sobreposicoes(caixas, tol) {
    tol = tol == null ? 0.15 : tol;
    var out = [];
    for (var i = 0; i < caixas.length; i++) for (var j = i + 1; j < caixas.length; j++) if (sobrepoe(caixas[i].p, caixas[j].p, tol)) out.push([caixas[i].s, caixas[j].s]);
    return out;
  }

  var AcoPranchas = { PADRAO_ACO: PADRAO_ACO, gerar: gerar, largTexto: largTexto, sobreposicoes: sobreposicoes,
    /* partes (teste e tela) */
    extrair: extrair, ligacoes: ligacoes, esforcos: esforcos, listaMateriais: listaMateriais, casosReacao: casosReacao,
    /* o MESMO desenho (penas, letra, cotas, solda AWS A2.4, tabela) e o MESMO carimbo RA para os desenhos de fabricação (js/metalfabdes.js) */
    Desenho: Desenho, estilo: estilo, carimbo: carimbo, tituloVista: tituloVista, quebrar: quebrar, espChapa: espChapa, FONTE: FONTE, VERMELHO: VERMELHO };
  global.AcoPranchas = AcoPranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoPranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

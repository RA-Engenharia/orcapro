/* ===================================================================
 * planilhapdf.js — LER A PLANILHA ORÇAMENTÁRIA DE UM PDF (sem cortar nada)
 *
 * Pedido do Rogério (10/11/2026): "vou pedir um PDF à prefeitura e ele vai
 * importar aqui dentro e ficar prontinho — e que nada do documento fique
 * cortado". Este arquivo é só o MOTOR: recebe as palavras do PDF COM
 * COORDENADAS (pdf.js, vendorizado em js/vendor/pdfjs) e devolve itens,
 * etapas, total impresso e a CONFERÊNCIA. Nada de servidor: o documento da
 * prefeitura não sai do computador.
 *
 * CONTRATO (fixo — a leva do CPLPRO liga nele):
 *   PlanilhaPDF.ler(arrayBuffer, { nome, paginas?, pdfjs? }) → Promise de
 *   { itens:[{ item, codigo, fonte, descricao, unidade, quantidade,
 *              precoUnit|null, total|null, pagina, linha, etapa }],
 *     etapas:[{ item, titulo }],
 *     totalImpresso|null,
 *     conferencia:{ nota, ok, motivos:[] } }
 *   Campos a mais (só somam, o contrato não muda): itens[].precoUnitSemBdi,
 *   itens[].duvidoso/avisos, etapas[].total/pagina, conferencia.checagens,
 *   conferencia.soma/tolerancia, paginas, bdi, regime, fontes.
 *   `etapa` do item = o número (`item`) da etapa mais funda que o contém.
 *   `linha` = nº da linha de texto (1 = a de cima) em que o número do item
 *   está na página; `pagina` conta a partir de 1 no PDF inteiro.
 *
 * COMO LÊ (o porquê de cada escolha — roteiro dos defeitos que já deram):
 *  1. PÁGINAS DA PLANILHA acham-se sozinhas: cabeçalho de colunas (ITEM,
 *     DESCRIÇÃO, UNID., QUANT., PREÇO...) + âncoras de número de item. Vale
 *     para a planilha dentro de um edital de 300 páginas (Muriaé/MG: p. 76–83).
 *  2. PÁGINA COM /Rotate 90 (Sangão/SC): o pdf.js entrega o texto no espaço
 *     SEM girar; as palavras passam pela matriz do viewport antes de tudo.
 *     Texto desenhado em pé numa página sem /Rotate também é girado de volta.
 *  3. PDF SEM LINHAS DE TABELA (Jaraguá do Sul/SC): colunas pela POSIÇÃO do
 *     cabeçalho; nada de find_tables. O título de coluna é centralizado sobre
 *     um texto alinhado à esquerda, então a coluna da descrição começa onde
 *     começam as linhas de continuação (moda), não onde está o título.
 *  4. DESCRIÇÃO EM VÁRIAS LINHAS: a célula é CENTRADA na vertical, e as linhas
 *     vêm antes e depois da linha dos números. Distribuição simétrica ao redor
 *     do centro do item (linhas acima = linhas abaixo): "linha mais perto"
 *     erra quando uma descrição de 6 linhas vem logo depois de uma de 1.
 *     A descrição final contém TODO o texto da célula; o que sobra sem dono
 *     (palavra que ficou sem item) é listado, nunca descartado em silêncio.
 *  5. Cabeçalho/rodapé repetidos por página são descartados (o corpo começa
 *     abaixo do cabeçalho de colunas; rodapé de página/endereço/data sai).
 *  6. CONFERÊNCIA (a leitura nunca vale só porque "achou itens"): soma das
 *     linhas × total impresso, subtotal de cada etapa × soma dos seus itens,
 *     quantidade × unitário = total, numeração sem salto, itens completos,
 *     sobras. Régua de centavos declarada em TOLERANCIA_*: cada linha impressa
 *     está arredondada a 0,01, então a soma de N linhas pode diferir do total
 *     em até N × 0,005 — nada além disso passa como "bate".
 *  7. NUNCA INVENTA: linha com número de item mas sem quantidade numérica vai
 *     para `motivos`; não vira item com quantidade zero. Fonte/código ficam
 *     como impressos (sem fonte → null).
 *
 * Em Node (testes) o pdf.js é passado em opts.pdfjs; no navegador sai do
 * vendor local (mesmo caminho do Gestao._pdfTexto). Sem CDN: documento de
 * cliente não vai para terceiro, nem no caminho de erro.
 * =================================================================== */
(function (global) {
  "use strict";

  /* ---------- régua declarada ---------- */
  var NOTA_MINIMA = 70;                 // nota que a leitura precisa para valer como conferida
  var TOL_BASE = 0.05;                  // piso da tolerância de soma (R$)
  var TOL_POR_LINHA = 0.005;            // meio centavo por linha somada (arredondamento de cada linha impressa)
  var LIMITE_FRACAO = 0.9;              // checagens "por fração" (etapas, linhas) passam com 90%
  var TETO_SEM_PROVA = 60;              // sem total impresso nem subtotal de etapa: não há conta para fazer
  var MAX_PAGINAS = 2000;
  var MAX_PALAVRAS_PAGINA = 20000;

  var PESOS = { total_impresso: 35, etapas: 20, linhas: 15, completos: 10, sequencia: 10, sobras: 10 };

  var FONTES_CONHECIDAS = ["SINAPI", "SICRO", "SIURB", "CPOS", "SCO", "SETOP", "SEINFRA", "ORSE", "SUDECAP", "EMOP", "DER", "DNIT",
    "AGETOP", "SBC", "CAERN", "TCPO", "FDE", "COMPESA", "CASAN", "CAGECE", "SABESP", "COPASA", "FIPE"];

  /* ---------- texto ---------- */
  var ACENTOS = { "À": "A", "Á": "A", "Â": "A", "Ã": "A", "Ä": "A", "È": "E", "É": "E", "Ê": "E", "Ë": "E", "Ì": "I", "Í": "I", "Î": "I", "Ï": "I",
    "Ò": "O", "Ó": "O", "Ô": "O", "Õ": "O", "Ö": "O", "Ù": "U", "Ú": "U", "Û": "U", "Ü": "U", "Ç": "C", "Ñ": "N" };
  function norm(s) {
    return String(s == null ? "" : s).toUpperCase().replace(/[ÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ]/g, function (c) { return ACENTOS[c] || c; })
      .replace(/[^A-Z0-9%$\/]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function limpaEspacos(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function ehNumeroBR(s) { return /^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d+$/.test(s); }

  /* Número em texto BR: "1.234,56", "1645,00", "2", "4.50" (decimal com ponto só se tem 1–2 casas: milhar tem sempre 3). null se não for número. */
  function numeroBR(txt) {
    if (txt == null) return null;
    var t = String(txt).replace(/R\$/g, "").replace(/\s+/g, "");
    if (!t) return null;
    if (/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d+$/.test(t)) return parseFloat(t.replace(/\./g, "").replace(",", "."));
    if (/^-?\d+$/.test(t)) return parseFloat(t);
    if (/^-?\d+\.\d{1,2}$/.test(t)) return parseFloat(t);
    return null;
  }
  function moeda(v) {
    var neg = v < 0, n = Math.abs(Math.round(v * 100)), s = String(n);
    while (s.length < 3) s = "0" + s;
    var int = s.slice(0, -2), dec = s.slice(-2), out = "";
    while (int.length > 3) { out = "." + int.slice(-3) + out; int = int.slice(0, -3); }
    return (neg ? "-" : "") + "R$ " + int + out + "," + dec;
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function mediana(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); var m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

  /* ================================================================
   * 1) PALAVRAS COM COORDENADAS (visuais: depois do /Rotate)
   * ================================================================ */
  /* Itens do getTextContent → palavras em coordenadas do VIEWPORT (y para baixo, 0 = topo). Uma palavra = pedaço sem espaço; o x de cada
     uma é proporcional ao nº de letras dentro do trecho do pdf.js (um trecho pode trazer várias células coladas quando o espaço é curto). */
  function palavrasDaPagina(itens, vt) {
    var ps = [], i, a = vt[0], b = vt[1], c = vt[2], d = vt[3], e = vt[4], f = vt[5];
    function V(x, y) { return [a * x + c * y + e, b * x + d * y + f]; }
    for (i = 0; i < itens.length && ps.length < MAX_PALAVRAS_PAGINA; i++) {
      var it = itens[i], str = it && it.str;
      if (!str || !/\S/.test(str) || !it.transform) continue;
      var t = it.transform, ta = t[0], tb = t[1], te = t[4], tf = t[5];
      var fh = Math.sqrt(t[2] * t[2] + t[3] * t[3]) || Math.abs(it.height) || 8;
      var along = Math.sqrt(ta * ta + tb * tb) || 1, w = Math.abs(it.width || 0);
      var dx = ta / along, dy = tb / along;
      var p0 = V(te, tf), p1 = V(te + dx * w, tf + dy * w);
      var n = str.length, k, ini = 0;
      for (k = 0; k <= n; k++) {
        if (k === n || /\s/.test(str.charAt(k))) {
          if (k > ini) {
            var f0 = ini / n, f1 = k / n;
            ps.push({ t: str.slice(ini, k), ax: p0[0] + (p1[0] - p0[0]) * f0, ay: p0[1] + (p1[1] - p0[1]) * f0,
                      bx: p0[0] + (p1[0] - p0[0]) * f1, by: p0[1] + (p1[1] - p0[1]) * f1, h: fh });
          }
          ini = k + 1;
        }
      }
    }
    return ps;
  }

  /* Texto desenhado em pé (página sem /Rotate, mas com o texto girado): se a maior parte das palavras anda na vertical, gira o quadro. */
  function endireitar(ps) {
    var vert = 0, hor = 0, i;
    for (i = 0; i < ps.length; i++) {
      var dx = Math.abs(ps[i].bx - ps[i].ax), dy = Math.abs(ps[i].by - ps[i].ay);
      if (ps[i].t.length < 2) continue;
      if (dy > dx * 1.5) vert++; else if (dx > dy * 1.5) hor++;
    }
    if (vert <= hor * 2 || vert < 8) return { ps: ps, giro: 0 };
    // sentido: o texto sobe (dy < 0) → gira 90° anti-horário; desce → horário
    var sobe = 0, desce = 0;
    for (i = 0; i < ps.length; i++) { var dd = ps[i].by - ps[i].ay; if (dd < 0) sobe++; else if (dd > 0) desce++; }
    var out = [];
    for (i = 0; i < ps.length; i++) {
      var p = ps[i], q;
      /* y cresce para baixo. Texto que SOBE (lê de baixo para cima, topo da letra à esquerda): (x,y) → (−y, x) leva "sobe" para "direita"
         e "esquerda" para "cima". Texto que DESCE: (x,y) → (y, −x). */
      if (sobe >= desce) q = { t: p.t, ax: -p.ay, ay: p.ax, bx: -p.by, by: p.bx, h: p.h };
      else q = { t: p.t, ax: p.ay, ay: -p.ax, bx: p.by, by: -p.bx, h: p.h };
      out.push(q);
    }
    return { ps: out, giro: sobe >= desce ? 270 : 90 };
  }

  /* Palavra pronta para a leitura: x0/x1 ordenados, y = linha de base. */
  function finalizar(ps) {
    var out = [], i;
    for (i = 0; i < ps.length; i++) {
      var p = ps[i], x0 = Math.min(p.ax, p.bx), x1 = Math.max(p.ax, p.bx);
      if (!isFinite(x0) || !isFinite(x1) || !isFinite(p.ay)) continue;
      out.push({ t: p.t, x0: x0, x1: x1, y: p.ay, h: p.h || 8 });
    }
    return out;
  }

  /* ================================================================
   * 2) LINHAS
   * ================================================================ */
  function agruparLinhas(ws, tol) {
    var ord = ws.slice().sort(function (a, b) { return a.y - b.y || a.x0 - b.x0; }), linhas = [], i;
    for (i = 0; i < ord.length; i++) {
      var w = ord[i], L = linhas.length ? linhas[linhas.length - 1] : null;
      if (L && Math.abs(w.y - L.y) <= tol) { L.ws.push(w); L.soma += w.y; L.y = L.soma / L.ws.length; }
      else linhas.push({ y: w.y, soma: w.y, ws: [w] });
    }
    linhas.forEach(function (L) { L.ws.sort(function (a, b) { return a.x0 - b.x0; }); delete L.soma; });
    return linhas;
  }
  function textoDaLinha(L) { return L.ws.map(function (w) { return w.t; }).join(" "); }

  /* ================================================================
   * 3) CABEÇALHO DE COLUNAS
   * ================================================================ */
  var RE_ITEM_TIT = /^(ITEM|N|NO|NUM|NUMERO|IT|SEQ|ITEM N|N ITEM|NO ITEM|NUMERO ITEM|ITEM NO|ITEM NUM|ITEM NUMERO)$/;

  function rotuloBdi(t) {
    if (/\b(SEM|S|EXCETO)\b\s*(?:\/\s*)?BDI|\bS\/\s*BDI|S\/BDI/.test(t) || /(^| )(SEM|S\/?) (O )?BDI/.test(t)) return "sem";
    if (/\b(COM|C)\b\s*(?:\/\s*)?BDI|\bC\/\s*BDI|C\/BDI/.test(t) || /(^| )(COM|C\/?) (O )?BDI/.test(t)) return "com";
    return null;
  }
  /* campo de um título de coluna (já normalizado). */
  function classeDoTitulo(t) {
    if (!t) return { campo: null };
    if (RE_ITEM_TIT.test(t)) return { campo: "item" };
    if (/^(BDI|BDI PERCENTUAL|PERCENTUAL BDI|PERCENTUAL DE BDI|TAXA BDI|TAXA DE BDI|BDI %|% BDI|BDI \d)$/.test(t)) return { campo: "bdiPct" };
    if (/\bBDI\b.*\$/.test(t) && !/TOTAL|UNIT/.test(t)) return { campo: "bdiValor" };
    if (/^(PESO|% PESO|PESO %|INCIDENCIA|% INCID|PERCENTUAIS?|%)( |$)/.test(t) && !/TOTAL|UNIT/.test(t)) return { campo: "peso" };
    if (/\b(TOTAL|PARCIAL)\b/.test(t)) return { campo: "total", rotulo: rotuloBdi(t) };
    if (/UNIT|\bPU\b|\bP U\b/.test(t)) return { campo: "preco", rotulo: rotuloBdi(t) };
    if (/^(COD|CODIGO|COD REF|REF|CODIGO REF|CODIGO DO SERVICO|COD SERVICO)( |$)/.test(t)) return { campo: "codigo" };
    if (/\b(FONTE|BASE|BANCO|ORIGEM)\b/.test(t)) return { campo: "fonte" };
    if (/^(UN|UND|UNID|UNIDADE|UNID MEDIDA|UNIDADE DE MEDIDA|U M|UM|MEDIDA|UNID DE MEDIDA)( |$)/.test(t) || /^UNID\b/.test(t)) return { campo: "unidade" };
    if (/\bQUANT|\bQTD|\bQTDE\b|\bQTE\b/.test(t)) return { campo: "quantidade" };
    if (/DESCRI|DISCRIMINA|ESPECIFICA|\bSERVICO|\bOBJETO\b|DENOMINA/.test(t)) return { campo: "descricao" };
    return { campo: null };
  }

  /* Títulos: só palavras com letra formam título (números e % do alto do cabeçalho são valores, não título). Palavras da mesma linha
     separadas por espaço largo viram títulos distintos; títulos de linhas vizinhas que se sobrepõem em x são o mesmo título (empilhado). */
  function titulosDaBanda(band, hmed) {
    var letras = band.filter(function (w) { return /[A-Za-zÀ-ÿ]/.test(w.t) && !/^R\$$/.test(w.t); });
    var linhas = agruparLinhas(letras, Math.max(1.5, hmed * 0.3)), clusters = [], gap = Math.max(4.5, hmed * 0.9);
    linhas.forEach(function (L, li) {
      var atual = null;
      L.ws.forEach(function (w) {
        if (atual && w.x0 - atual.x1 <= gap) { atual.ws.push(w); atual.x1 = Math.max(atual.x1, w.x1); }
        else { atual = { ws: [w], x0: w.x0, x1: w.x1, linha: li }; clusters.push(atual); }
      });
    });
    // une empilhados: sobreposição em x ≥ 50% da menor largura, em linhas vizinhas
    var pai = clusters.map(function (_, i) { return i; });
    function raiz(i) { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; }
    var i, j;
    for (i = 0; i < clusters.length; i++) for (j = i + 1; j < clusters.length; j++) {
      var dl = Math.abs(clusters[i].linha - clusters[j].linha);
      if (dl < 1 || dl > 2) continue;
      var ov = Math.min(clusters[i].x1, clusters[j].x1) - Math.max(clusters[i].x0, clusters[j].x0);
      var menor = Math.min(clusters[i].x1 - clusters[i].x0, clusters[j].x1 - clusters[j].x0);
      if (ov > 0 && ov >= menor * 0.5) pai[raiz(j)] = raiz(i);
    }
    var grupos = {};
    clusters.forEach(function (c, k) { var r = raiz(k); (grupos[r] = grupos[r] || []).push(c); });
    var tits = [];
    Object.keys(grupos).forEach(function (r) {
      var cs = grupos[r], ws = [];
      cs.forEach(function (c) { ws = ws.concat(c.ws); });
      ws.sort(function (a, b) { return a.y - b.y || a.x0 - b.x0; });
      // ordem de leitura: por linha de cima para baixo, dentro da linha da esquerda para a direita
      var ls = agruparLinhas(ws, Math.max(1.5, hmed * 0.3)), txt = ls.map(textoDaLinha).join(" ");
      var x0 = Math.min.apply(null, ws.map(function (w) { return w.x0; })), x1 = Math.max.apply(null, ws.map(function (w) { return w.x1; }));
      var n = norm(txt), cl = classeDoTitulo(n);
      tits.push({ texto: limpaEspacos(txt), n: n, x0: x0, x1: x1, c: (x0 + x1) / 2, campo: cl.campo, rotulo: cl.rotulo || null });
    });
    tits.sort(function (a, b) { return a.x0 - b.x0; });
    return tits;
  }

  /* Acha o cabeçalho de colunas da página: devolve { titulos, campos, yBase (linha do ITEM), yFim (fim da banda), banda } ou null.
     A banda é a linha do ITEM + as vizinhas que ainda são título (sem dígito, fora "(R$)" e "%"). O corpo começa onde a banda acaba:
     uma linha de dado (Muriaé: "1 ADMINISTRAÇÃO LOCAL R$ 58.327,28") tem dígito e não entra — antes, ±13 pt em torno do ITEM engolia o 1º item. */
  function linhaDeTitulo(L) {
    return L.ws.every(function (w) { return !/\d/.test(w.t) || /^\(?%\)?$/.test(w.t) || /^\(?R\$\)?$/.test(w.t) || /^N[º°o]?$/i.test(w.t) || /^BDI$/i.test(w.t); });
  }
  function linhaDeValorDoCabecalho(L) {
    return L.ws.length <= 4 && L.ws.every(function (w) { return /^R\$$/.test(w.t) || /^-?[\d.]+,\d+%?$/.test(w.t) || /^[\d.,]+%$/.test(w.t); });
  }
  function acharCabecalho(linhas, hmed) {
    var li, k, passoMax = Math.max(9, hmed * 2.2);
    for (li = 0; li < linhas.length; li++) {
      var L = linhas[li], itemW = null;
      for (k = 0; k < L.ws.length; k++) if (RE_ITEM_TIT.test(norm(L.ws[k].t))) { itemW = L.ws[k]; break; }
      if (!itemW) continue;
      var ini = li, fim = li, valoresTopo = [];
      while (ini > 0 && linhas[ini].y - linhas[ini - 1].y <= passoMax && linhaDeTitulo(linhas[ini - 1])) ini--;
      while (fim < linhas.length - 1 && linhas[fim + 1].y - linhas[fim].y <= passoMax) {
        var N = linhas[fim + 1];
        if (N.ws[0] && RE_ANCORA.test(N.ws[0].t) && N.ws[0].x0 < itemW.x1 + 3) break;
        if (linhaDeTitulo(N)) { fim++; continue; }
        if (linhaDeValorDoCabecalho(N)) { valoresTopo.push(N); fim++; continue; }
        break;
      }
      var band = [], yMax = L.y, j;
      for (j = ini; j <= fim; j++) { band = band.concat(linhas[j].ws); if (linhas[j].y > yMax) yMax = linhas[j].y; }
      var tits = titulosDaBanda(band, hmed).filter(function (t) { return t.campo; });
      var campos = {};
      tits.forEach(function (t) { if (!campos[t.campo]) campos[t.campo] = t; });
      var temPreco = campos.preco || campos.total;
      if (campos.descricao && campos.quantidade && temPreco && tits.length >= 4) {
        return { titulos: tits, campos: campos, yBase: L.y, yFim: yMax + Math.max(2, hmed * 0.35), banda: band };
      }
    }
    return null;
  }

  function assinaturaDoCabecalho(cab) { return cab.titulos.map(function (t) { return t.campo || "-"; }).join(","); }

  /* ================================================================
   * 4) LEITURA DE UMA PÁGINA
   * ================================================================ */
  var RE_ANCORA = /^\d+(?:\.\d+)*\.?$/;
  var RE_TOTAL_GERAL = /^(TOTAIS?|TOTAL|VALOR TOTAL|SOMA|SOMATORIO)( DO| DA| DE| DOS| DAS)? ?(GERAL|ORCAMENTO|OBRA|PLANILHA|CONTRATO|GLOBAL|ITENS|BDI)\b|^TOTAL GERAL|^TOTAL (COM|SEM) BDI|^TOTAL R\$|^PRECO TOTAL GERAL|^VALOR GLOBAL/;
  var RE_RODAPE = /(^|\b)(PAG|PAGINA|PAGE|FOLHA)\b\s*\d|\b\d+\s*(\/|DE)\s*\d+\s*$|WWW\.|HTTP|@|EMITIDO|IMPRESSO|GERADO EM|ASSINADO|CEP \d|^\d{2}\/\d{2}\/\d{4}$/;

  function moedaNaLinha(L) {
    var out = [];
    L.ws.forEach(function (w) { if (ehNumeroBR(w.t.replace(/^R\$/, "")) && /,\d{2}$/.test(w.t)) out.push(numeroBR(w.t)); });
    return out;
  }

  /* ⚠ A DISTRIBUIÇÃO DAS LINHAS DA DESCRIÇÃO ENTRE OS ITENS — o ponto que mais enganou leitor de planilha em PDF.
     A célula da descrição é CENTRADA na vertical: as linhas do item ficam metade antes e metade depois da linha dos números.
     "Linha mais perto do item" erra quando uma descrição de 7 linhas vem logo depois de uma de 1 (as 3 primeiras linhas da de 7
     ficam mais perto do item de cima); um corte guloso erra no sentido contrário (Muriaé: item 9.3 ficou sem descrição).
     Aqui o PARTICIONAMENTO é ótimo: grupos contíguos de linhas, um por item, na ordem; custo do grupo = quanto o bloco é assimétrico
     em torno do centro do item (distância da 1ª linha ao centro × distância do centro à última), mais multa se o centro cai fora do
     bloco; linha pulada (nota solta antes do 1º item ou depois do último) custa 4 passos de linha, então só pula o que está longe de tudo. */
  function distribuirLinhas(ys, centros, passo) {
    var n = ys.length, m = centros.length, i, j, l, INF = 1e12, MAXG = 16;
    var dono = [], k;
    for (k = 0; k < n; k++) dono.push(-1);
    if (!n || !m) return dono;
    var pular = 4 * passo, vazio = 3 * passo;
    function custo(it, a, b) {          // linhas a..b-1 para o item it
      var c = centros[it];
      if (b === a) return vazio;
      var y0 = ys[a], y1 = ys[b - 1], c0 = c - y0, c1 = y1 - c, cst = Math.abs(c0 - c1);
      if (c < y0) cst += 2 * (y0 - c);          // o centro tem de estar dentro do bloco (a linha dos números fica no meio)
      if (c > y1) cst += 2 * (c - y1);
      if (Math.abs(c0) > 120 || Math.abs(c1) > 120) cst += INF / 100;
      return cst;
    }
    var f = [], vindo = [];
    for (i = 0; i <= m; i++) { f.push([]); vindo.push([]); for (j = 0; j <= n; j++) { f[i].push(INF); vindo[i].push(-1); } }
    for (j = 0; j <= n; j++) f[0][j] = pular * j;                  // prefixo de linhas puladas
    for (i = 0; i < m; i++) {
      for (j = 0; j <= n; j++) {
        if (f[i][j] >= INF) continue;
        for (l = j; l <= Math.min(n, j + MAXG); l++) {
          var v = f[i][j] + custo(i, j, l);
          if (v < f[i + 1][l]) { f[i + 1][l] = v; vindo[i + 1][l] = j; }
        }
      }
    }
    var melhor = INF, fim = n;
    for (j = 0; j <= n; j++) { var t = f[m][j] + pular * (n - j); if (t < melhor) { melhor = t; fim = j; } }
    var pos = fim;
    for (i = m; i >= 1; i--) {
      var ini = vindo[i][pos];
      if (ini < 0) break;
      for (k = ini; k < pos; k++) dono[k] = i - 1;
      pos = ini;
    }
    return dono;
  }

  /* A palavra cabe na coluna? Número onde só cabe número; unidade curta onde cabe unidade. */
  function cabeNaColuna(campo, t) {
    var n = t.replace(/^R\$/, "");
    if (campo === "quantidade" || campo === "preco" || campo === "total" || campo === "bdiValor") return n === "" || /^-?[\d.,]+%?$/.test(n) || /^[-–—]$/.test(n);
    if (campo === "unidade") return t.length <= 7 && !/[,;()]/.test(t);
    return true;
  }

  /* Lê as linhas de UMA página já separada em palavras. `ctx` guarda colunas da página anterior (página sem cabeçalho repetido). */
  function lerPagina(pag, cab, ctx, saida) {
    var ws = pag.palavras, hmed = pag.hmed, linhasTodas = pag.linhas;
    var yCorpo = cab ? cab.yFim : -1e9;
    var titulos = cab ? cab.titulos : ctx.titulos;
    var campos = {};
    titulos.forEach(function (t) { if (t.campo && !campos[t.campo]) campos[t.campo] = t; });
    var tDesc = campos.descricao;
    if (!tDesc) return { fechou: false, anc: 0 };

    // zonas: à esquerda da descrição (item, código, fonte) e à direita (unidade, quantidade, preços, totais...)
    var esq = titulos.filter(function (t) { return t.c < tDesc.c && (t.campo === "item" || t.campo === "codigo" || t.campo === "fonte"); });
    var dir = titulos.filter(function (t) { return t.c > tDesc.c && t.x0 > tDesc.x0; });
    var primeiraDir = dir.length ? dir[0] : null;

    // corpo: linhas abaixo do cabeçalho, sem rodapé de página
    var altura = pag.altura, limiteRodape = altura - Math.max(28, altura * 0.06);
    var corpo = [];
    linhasTodas.forEach(function (L) {
      if (L.y <= yCorpo) return;
      corpo.push(L);
    });
    // linhas com cara de cabeçalho repetido DENTRO do corpo (a tabela repete o cabeçalho no meio da página)
    corpo = corpo.filter(function (L) {
      var n = norm(textoDaLinha(L));
      if (/\bITEM\b/.test(n) && /DESCRI|DISCRIMINA/.test(n) && /QUANT|QTD/.test(n)) return false;
      return true;
    });

    // --- borda esquerda da descrição: moda do x0 das linhas de continuação (só texto, sem número de item nem coluna numérica)
    var xPrimNum = primeiraDir ? primeiraDir.x0 - 2 : 1e9;
    var xItemMax = esq.length ? Math.max.apply(null, esq.map(function (t) { return t.x1; })) : tDesc.x0 - 20;
    var puras = [];
    corpo.forEach(function (L) {
      var soTexto = true, minX = 1e9;
      L.ws.forEach(function (w) {
        if (w.x0 >= xPrimNum - 6) soTexto = false;
        if (w.x0 < xItemMax - 1 && (w.x0 < tDesc.x0 - 40 || RE_ANCORA.test(w.t))) soTexto = false;
        if (w.x0 < minX) minX = w.x0;
      });
      if (soTexto && L.ws.length && L.y < limiteRodape) puras.push({ L: L, x0: minX, x1: L.ws[L.ws.length - 1].x1 });
    });
    var descLeft = null, descMaxX1 = null;
    if (puras.length >= 3) {
      var cont = {};
      puras.forEach(function (p) { var k = Math.round(p.x0); cont[k] = (cont[k] || 0) + 1; });
      var melhor = null;
      Object.keys(cont).forEach(function (k) { if (melhor === null || cont[k] > cont[melhor] || (cont[k] === cont[melhor] && +k < +melhor)) melhor = k; });
      if (cont[melhor] >= 3) {
        descLeft = +melhor;
        var xs = puras.filter(function (p) { return Math.abs(p.x0 - descLeft) <= 1.5; }).map(function (p) { return p.x1; });
        descMaxX1 = Math.max.apply(null, xs);
      }
    }
    if (descLeft === null) {
      // sem linhas de continuação suficientes: a borda é o fim do título à esquerda (ou o início do título da descrição)
      descLeft = esq.length ? Math.min(tDesc.x0, xItemMax + 1.5) : tDesc.x0 - 2;
      if (ctx.descLeft != null && !cab) descLeft = ctx.descLeft;
    }
    var descRight;
    if (primeiraDir) {
      if (descMaxX1 != null && descMaxX1 + 2 < primeiraDir.x0) descRight = (descMaxX1 + primeiraDir.x0) / 2;
      else descRight = primeiraDir.x0 - 2;
    } else descRight = 1e9;
    ctx.descLeft = descLeft;

    // --- cada palavra do corpo → campo
    function campoDaPalavra(w) {
      if (w.x0 < descLeft - 2) {
        if (!esq.length) return null;
        var melhorT = null, dm = 1e9, c = (w.x0 + w.x1) / 2;
        esq.forEach(function (t) { var d = Math.abs(c - t.c); if (d < dm) { dm = d; melhorT = t; } });
        return melhorT.campo;
      }
      if (w.x0 < descRight) return "descricao";
      var melhorN = null, dn = 1e9, cn = (w.x0 + w.x1) / 2;
      dir.forEach(function (t) { var d = Math.abs(cn - t.c); if (d < dn) { dn = d; melhorN = t; } });
      if (!melhorN) return null;
      /* ⚠ TEXTO DA DESCRIÇÃO QUE TRANSBORDA A CÉLULA (planilha de Excel impressa em PDF: "...plano diretor municipal, etc)" passa por
         cima das colunas de unidade/quantidade). Palavra que não cabe na coluna (texto onde só cabe número, ou unidade comprida) é
         descrição — antes ia para a coluna da quantidade e a linha era recusada ("a quantidade 'municipal, etc) 1' não é um número"). */
      if (!cabeNaColuna(melhorN.campo, w.t)) return "descricao";
      return "col:" + titulos.indexOf(melhorN);
    }

    // --- âncoras: número de item na coluna do item
    var ancoras = [], marcador = null, idxL;
    for (idxL = 0; idxL < corpo.length; idxL++) {
      var L = corpo[idxL];
      var textoL = norm(textoDaLinha(L));
      if (L.y > limiteRodape && RE_RODAPE.test(textoDaLinha(L)) && !L.ws.some(function (w) { return RE_ANCORA.test(w.t) && campoDaPalavra(w) === "item"; })) { L.descartada = "rodape"; continue; }
      // fim da planilha: "TOTAL GERAL", "TOTAL DO ORÇAMENTO"...
      var primeira = L.ws[0] ? norm(L.ws[0].t) : "";
      var temAncora = L.ws.some(function (w) { return RE_ANCORA.test(w.t) && campoDaPalavra(w) === "item"; });
      if (marcador) {
        // depois do fechamento só interessam as outras linhas de total ("Total sem BDI", "Total do BDI", "Total Geral" — Sangão/SC traz as três)
        if (!temAncora && /^(TOTAL|TOTAIS|VALOR TOTAL|SOMA)\b/.test(textoL)) { marcador.todos.push({ v: moedaNaLinha(L), n: textoL }); }
        L.descartada = "depois do total";
        continue;
      }
      if (!temAncora && (RE_TOTAL_GERAL.test(textoL) || (/^(TOTAL|VALOR)$/.test(primeira) && /GERAL|ORCAMENTO|OBRA/.test(textoL)))) {
        marcador = { linha: L, valores: moedaNaLinha(L), n: textoL, todos: [{ v: moedaNaLinha(L), n: textoL }] };
        L.descartada = "total";
        continue;
      }
      if (!temAncora && (primeira === "TOTAL" || primeira === "SUBTOTAL" || primeira === "SUB")) {
        // "Total sem BDI" aparece ANTES de "Total Geral" e também fecha a tabela: tratado como início dos totais
        if (/^TOTAL (SEM|COM|DO|DA) ?(BDI|ORCAMENTO)?/.test(textoL) && L.y > (ancoras.length ? ancoras[ancoras.length - 1].w.y : -1)) {
          marcador = { linha: L, valores: moedaNaLinha(L), n: textoL, todos: [{ v: moedaNaLinha(L), n: textoL }] };
          L.descartada = "total";
          continue;
        }
        L.descartada = "subtotal"; continue;
      }
      L.ws.forEach(function (w) {
        if (RE_ANCORA.test(w.t) && campoDaPalavra(w) === "item") ancoras.push({ w: w, L: L, idx: idxL });
      });
    }
    var corpoUtil = corpo.filter(function (L) { return !L.descartada; });
    corpoUtil = corpo.filter(function (L) { return !L.descartada; });

    // total impresso solto logo abaixo do cabeçalho (Muriaé: "R$ 1.224.858,87" na coluna do total, antes da 1ª etapa)
    var soltos = [];
    var primeiraAncoraY = ancoras.length ? ancoras[0].w.y : 1e9;
    corpoUtil.forEach(function (L) {
      if (L.y >= primeiraAncoraY - 1) return;
      var vals = moedaNaLinha(L);
      var soDinheiro = L.ws.every(function (w) { return /^R\$$/.test(w.t) || ehNumeroBR(w.t) || /^[\d.,]+%$/.test(w.t); });
      if (vals.length === 1 && soDinheiro) soltos.push(vals[0]);
    });
    // valores soltos na própria banda do cabeçalho ("Valor Total com BDI R$ 7.405.847,35")
    var topo = [];
    if (cab) {
      cab.banda.forEach(function (w) { if (ehNumeroBR(w.t) && /,\d{2}$/.test(w.t) && w.t.indexOf(".") > -1) topo.push(numeroBR(w.t)); });
    }
    saida.soltos = (saida.soltos || []).concat(soltos);
    saida.topo = (saida.topo || []).concat(topo);

    if (!ancoras.length) return { fechou: !!marcador, anc: 0, marcador: marcador, ancoras: ancoras };
    ancoras.sort(function (a, b) { return a.w.y - b.w.y; });

    // --- o que cada âncora possui (células fora da descrição): palavra → âncora de y mais próximo
    var gaps = [], k;
    for (k = 0; k < ancoras.length - 1; k++) gaps.push(ancoras[k + 1].w.y - ancoras[k].w.y);
    var passo = mediana(gaps) || 14;
    var celulas = ancoras.map(function () { return {}; });
    var linhasDesc = [];     // linhas com palavras da descrição: { y, ws:[...] }
    var sobras = [];

    // linhas de descrição: separa, por linha de texto, as palavras da descrição das demais
    corpoUtil.forEach(function (L) {
      var ds = [], ou = [];
      L.ws.forEach(function (w) {
        var cp = campoDaPalavra(w);
        if (cp === "descricao") ds.push(w); else ou.push({ w: w, campo: cp });
      });
      if (ds.length) linhasDesc.push({ y: median3(ds.map(function (w) { return w.y; })), ws: ds, L: L });
      ou.forEach(function (o) {
        if (!o.campo) { sobras.push({ w: o.w, L: L, motivo: "fora das colunas" }); return; }
        // âncora mais próxima em y
        var melhorA = -1, dm = 1e9;
        ancoras.forEach(function (a, i) { var d = Math.abs(a.w.y - o.w.y); if (d < dm) { dm = d; melhorA = i; } });
        var lim = Math.min(9, Math.max(4.5, 0.55 * minVizinho(ancoras, melhorA)));
        if (melhorA < 0 || dm > lim) { sobras.push({ w: o.w, L: L, motivo: "sem item" }); return; }
        var cel = celulas[melhorA];
        (cel[o.campo] = cel[o.campo] || []).push(o.w);
      });
    });
    function median3(a) { return mediana(a); }
    function minVizinho(an, i) {
      var m = 1e9;
      if (i > 0) m = Math.min(m, an[i].w.y - an[i - 1].w.y);
      if (i < an.length - 1) m = Math.min(m, an[i + 1].w.y - an[i].w.y);
      return m === 1e9 ? 30 : m;
    }

    // centro de cada item = média da linha de base das células dele (número, código, unidade, quantidade, valores)
    var centros = ancoras.map(function (a, i) {
      var ys = [a.w.y];
      Object.keys(celulas[i]).forEach(function (c) { celulas[i][c].forEach(function (w) { ys.push(w.y); }); });
      return mediana(ys);
    });

    // --- distribuição simétrica das linhas da descrição (programação dinâmica: ver distribuirLinhas)
    linhasDesc.sort(function (a, b) { return a.y - b.y; });
    var dif = [];
    for (k = 1; k < linhasDesc.length; k++) { var dd = linhasDesc[k].y - linhasDesc[k - 1].y; if (dd > 1) dif.push(dd); }
    var passoLinha = mediana(dif.filter(function (x) { return x < 20; })) || (hmed * 1.25) || 9;
    var dono = distribuirLinhas(linhasDesc.map(function (ld) { return ld.y; }), centros, passoLinha);
    // linhas que sobraram: antes da 1ª âncora (cadeia longe) ou depois do bloco do último → sobras de texto
    linhasDesc.forEach(function (ld, kk) {
      if (dono[kk] >= 0) return;
      ld.ws.forEach(function (w) { sobras.push({ w: w, L: ld.L, motivo: "sem item" }); });
    });

    // --- monta as linhas lidas
    var linhasLidas = ancoras.map(function (a, i) {
      var cel = celulas[i], texto = {}, ys = [];
      Object.keys(cel).forEach(function (c) {
        var ords = cel[c].slice().sort(function (x, y) { return x.y - y.y || x.x0 - y.x0; });
        texto[c] = ords.map(function (w) { return w.t; }).join(" ");
        texto[c + "#ws"] = ords;
      });
      var desc = [];
      linhasDesc.forEach(function (ld, kk) { if (dono[kk] === i) desc.push(ld.ws.map(function (w) { return w.t; }).join(" ")); });
      return { ancora: a, i: i, cel: texto, descricao: limpaEspacos(desc.join(" ")), nLinhasDesc: desc.length, pagina: pag.numero,
               linhaNum: a.idx + 1, y: a.w.y, colunaDe: function (campo) { return campo; } };
    });
    return { fechou: !!marcador, marcador: marcador, linhasLidas: linhasLidas, sobras: sobras, titulos: titulos, anc: ancoras.length, corpoY0: corpoUtil.length ? corpoUtil[0].y : 0,
             ancorasY: [ancoras[0].w.y, ancoras[ancoras.length - 1].w.y] };
  }

  /* ================================================================
   * 5) DE LINHAS LIDAS PARA ITENS/ETAPAS
   * ================================================================ */
  function textoDoCampo(ll, campo) { return ll.cel[campo] != null ? ll.cel[campo] : ""; }

  function separarFonte(celula) {
    // "103689-SINAPI- 07/2026" → ("103689", "SINAPI"); "AMV-PAV-0017-I- Cotação-06/2024" → ("AMV-PAV-0017-I", "Cotação"). Só separa com a data-base no fim.
    var t = limpaEspacos(celula);
    var m = /^(.+?)\s*-\s*([^\W\d_][^\W\d_ ]*(?: [^\W\d_][^\W\d_]*){0,2})\s*-?\s*(\d{2}\/\d{4})\s*$/.exec(t);
    if (!m) return { codigo: t, fonte: null };
    return { codigo: m[1].replace(/^[\s-]+|[\s-]+$/g, ""), fonte: m[2] };
  }
  /* Fonte como vem impressa, em maiúsculas ("SINAPI-I", "SETOP", "CCU-PMM"); a base conhecida (SINAPI...) sai em fonteBase. Nada do que
     está impresso se perde: "SINAPI-I" (insumo) não vira "SINAPI". "Próprio/Cotação/Composição" ficam como PROPRIA. */
  function baseDaFonte(txt) {
    var t = norm(txt), i;
    if (!t) return null;
    for (i = 0; i < FONTES_CONHECIDAS.length; i++) if (new RegExp("(^| )" + FONTES_CONHECIDAS[i] + "( |$)").test(t)) return FONTES_CONHECIDAS[i];
    if (/PROPRI|COTAC|COMPOSIC|ANALISE DE PRECO|MERCADO/.test(t)) return "PROPRIA";
    return null;
  }
  function normalizarFonte(txt) {
    var t = norm(txt);
    if (!t) return null;
    var base = baseDaFonte(txt);
    if (base === "PROPRIA") return "PROPRIA";
    return limpaEspacos(txt).toUpperCase();
  }

  /* Campo "col:N" → o que a coluna é, pelo título. */
  function mapaDeColunas(titulos) {
    var m = { unidade: null, quantidade: null, preco: [], total: [], bdiValor: null }, i;
    titulos.forEach(function (t, idx) {
      var chave = "col:" + idx;
      if (t.campo === "unidade" && !m.unidade) m.unidade = chave;
      else if (t.campo === "quantidade" && !m.quantidade) m.quantidade = chave;
      else if (t.campo === "preco") m.preco.push({ chave: chave, rotulo: t.rotulo });
      else if (t.campo === "total") m.total.push({ chave: chave, rotulo: t.rotulo });
      else if (t.campo === "bdiValor" && !m.bdiValor) m.bdiValor = chave;
    });
    // com dois unitários/totais: o rotulado "com BDI" é o COM, o "sem BDI" é o SEM; sem rótulo nenhum, o da esquerda é o SEM (custo) e o da direita o COM (preço)
    function par(lista) {
      var com = null, sem = null;
      lista.forEach(function (e) { if (e.rotulo === "com" && !com) com = e.chave; else if (e.rotulo === "sem" && !sem) sem = e.chave; });
      var livres = lista.filter(function (e) { return e.chave !== com && e.chave !== sem; });
      if (lista.length >= 2) {
        livres.forEach(function (e, k) {
          if (com && !sem) sem = e.chave;
          else if (sem && !com) com = e.chave;
          else if (!com && !sem) { if (k === 0) sem = e.chave; else if (!com) com = e.chave; }
        });
      }
      return { com: com, sem: sem };
    }
    m.pPreco = par(m.preco); m.pTotal = par(m.total);
    // linhas únicas sem rótulo contam como "valor do item"
    if (lista1(m.preco) && !m.pPreco.com && !m.pPreco.sem) m.pPreco.sem = m.preco[0].chave;
    if (lista1(m.total) && !m.pTotal.com && !m.pTotal.sem) m.pTotal.com = m.total[0].chave;
    return m;
    function lista1(l) { return l.length === 1; }
  }

  function valorDaCelula(texto) {
    if (texto == null || texto === "") return null;
    var partes = String(texto).replace(/R\$/g, " ").split(/\s+/).filter(Boolean);
    if (!partes.length) return null;
    // "5 8.327,28": pedaços só de dígito/ponto/vírgula grudam (espaço espúrio dentro do número)
    if (partes.every(function (x) { return /^[\d.,]+$/.test(x); })) return numeroBR(partes.join(""));
    return numeroBR(partes.join(" ").replace(/\s+/g, ""));
  }

  function lerLinha(ll, mapa) {
    var item = textoDoCampo(ll, "item"), codigoTxt = textoDoCampo(ll, "codigo"), fonteTxt = textoDoCampo(ll, "fonte");
    var r = { item: limpaEspacos(item).replace(/\.$/, ""), codigo: null, fonte: null, descricao: ll.descricao, unidade: null, quantidade: null,
              precoUnit: null, precoUnitSemBdi: null, total: null, totalSemBdi: null, pagina: ll.pagina, linha: ll.linhaNum, avisos: [] };
    if (codigoTxt) {
      if (!fonteTxt) { var sp = separarFonte(codigoTxt); r.codigo = sp.codigo || null; if (sp.fonte) r.fonte = normalizarFonte(sp.fonte); }
      else r.codigo = limpaEspacos(codigoTxt);
    }
    if (fonteTxt) r.fonte = normalizarFonte(fonteTxt);
    r.fonteBase = r.fonte ? (baseDaFonte(r.fonte) || null) : null;
    if (mapa.unidade) r.unidade = limpaEspacos(textoDoCampo(ll, mapa.unidade)) || null;
    var qTxt = mapa.quantidade ? textoDoCampo(ll, mapa.quantidade) : "";
    if (qTxt) r.quantidade = valorDaCelula(qTxt);
    r.qtdTexto = qTxt || null;
    var pc = mapa.pPreco.com ? valorDaCelula(textoDoCampo(ll, mapa.pPreco.com)) : null;
    var ps = mapa.pPreco.sem ? valorDaCelula(textoDoCampo(ll, mapa.pPreco.sem)) : null;
    var tc = mapa.pTotal.com ? valorDaCelula(textoDoCampo(ll, mapa.pTotal.com)) : null;
    var ts = mapa.pTotal.sem ? valorDaCelula(textoDoCampo(ll, mapa.pTotal.sem)) : null;
    // custo unitário SEM BDI + coluna "BDI (R$)" + total (CGU): o preço COM BDI é a soma impressa — por unidade ou pelo item todo, o que fechar com o total
    var bd = mapa.bdiValor ? valorDaCelula(textoDoCampo(ll, mapa.bdiValor)) : null;
    if (pc == null && ps != null && bd != null && r.quantidade != null) {
      var tt = tc != null ? tc : ts;
      if (tt != null) {
        if (Math.abs((ps + bd) * r.quantidade - tt) <= 0.005 * Math.abs(r.quantidade) + 0.011) pc = r2(ps + bd);
        else if (Math.abs(ps * r.quantidade + bd - tt) <= 0.011) pc = r2(r.quantidade ? (ps * r.quantidade + bd) / r.quantidade : ps + bd);
      }
    }
    r.precoUnit = pc != null ? pc : ps;
    r.precoUnitSemBdi = ps != null ? ps : (mapa.pPreco.com ? null : pc);
    r.total = tc != null ? tc : ts;
    r.totalSemBdi = ts;
    return r;
  }

  function semZeros(item) { return String(item).replace(/(\.0+)+$/, ""); }
  function nivelDe(item) { return String(item).split(".").filter(Boolean).length; }
  function chaveNum(item) { return String(item).split(".").filter(Boolean).map(function (x) { return parseInt(x, 10); }); }

  /* ================================================================
   * 6) LEITURA DE UM BLOCO DE PÁGINAS CONSECUTIVAS
   * ================================================================ */
  function lerBloco(paginas, cabecalhos) {
    var itens = [], etapas = [], motivos = [], ctx = { titulos: null, descLeft: null }, saida = { soltos: [], topo: [] }, marcadorFinal = null;
    var sobrasMeio = [], sobrasFim = [], etapaAtual = [], pagsUsadas = [], totalLinhas = 0, fechou = false, mapaPrimeiro = null, titulosRef = null;
    var linhasRaw = [];
    paginas.forEach(function (pag, ip) {
      if (fechou) return;
      var cab = cabecalhos[ip];
      if (cab) { ctx.titulos = cab.titulos; titulosRef = titulosRef || cab.titulos; }
      if (!ctx.titulos) return;
      var res = lerPagina(pag, cab, ctx, saida);
      pagsUsadas.push(pag.numero);
      if (res.marcador) {
        marcadorFinal = res.marcador;
        fechou = true;
      }
      if (!res.linhasLidas) return;
      var mapa = mapaDeColunas(res.titulos);
      mapaPrimeiro = mapaPrimeiro || mapa;
      res.linhasLidas.forEach(function (ll) { linhasRaw.push({ ll: ll, mapa: mapa }); });
      // sobras: dentro do vão dos itens = perda real; fora = nota solta
      res.sobras.forEach(function (s) {
        var dentro = s.w.y >= res.ancorasY[0] - 2 && s.w.y <= res.ancorasY[1] + 2;
        (dentro ? sobrasMeio : sobrasFim).push({ t: s.w.t, pagina: pag.numero, y: s.w.y, motivo: s.motivo, linha: s.L ? textoDaLinha(s.L) : "" });
      });
    });

    // --- classifica cada linha âncora: item, etapa ou linha com problema
    var duvidosas = [];
    linhasRaw.forEach(function (o) {
      var r = lerLinha(o.ll, o.mapa);
      var temUnid = !!r.unidade, temValor = r.precoUnit != null || r.total != null || r.precoUnitSemBdi != null;
      var temDesc = !!r.descricao;
      if (r.quantidade != null && (temUnid || temValor) && temDesc) {
        r.tipo = "item";
        r.etapaDe = etapaAtual.length ? etapaAtual[etapaAtual.length - 1].item : null;
        if (r.quantidade === 0) r.avisos.push("quantidade zero");
        if (!r.codigo && !temUnid) r.avisos.push("sem código");
        itens.push(r);
      } else if (r.quantidade == null && !temUnid && temDesc && !r.qtdTexto) {
        // título de etapa/subetapa: número + texto (+ total da etapa)
        r.tipo = "etapa";
        var nv = nivelDe(r.item);
        while (etapaAtual.length && nivelDe(etapaAtual[etapaAtual.length - 1].item) >= nv) etapaAtual.pop();
        etapaAtual.push(r);
        etapas.push({ item: r.item, titulo: r.descricao, total: r.total != null ? r.total : r.totalSemBdi, pagina: r.pagina, linha: r.linha, _totalSem: r.totalSemBdi, _valor: r.total });
      } else {
        var porque;
        if (r.qtdTexto && r.quantidade == null) porque = "a quantidade \"" + r.qtdTexto + "\" não é um número";
        else if (r.quantidade == null && (temUnid || temValor)) porque = "não tem quantidade numérica";
        else if (!temDesc) porque = "não tem descrição";
        else porque = "não deu para classificar";
        duvidosas.push("Linha " + r.item + " (pág. " + r.pagina + "): " + porque + " — não entrou como item.");
      }
    });

    // --- total impresso: linha de fechamento > valor solto abaixo do cabeçalho > valores do alto do cabeçalho
    var candidatos = [];
    if (marcadorFinal) {
      // "Total Geral" primeiro (é o último da lista de totais); entre os valores de uma linha, o maior
      marcadorFinal.todos.slice().reverse().forEach(function (o) {
        if (o.v.length) candidatos.push({ v: Math.max.apply(null, o.v), de: "fechamento", n: o.n });
      });
    }
    var vistos = {};
    (saida.soltos || []).forEach(function (v) { if (!vistos["s" + v]) { vistos["s" + v] = 1; candidatos.push({ v: v, de: "abaixo do cabeçalho" }); } });
    (saida.topo || []).forEach(function (v) { if (!vistos["s" + v]) { vistos["s" + v] = 1; candidatos.push({ v: v, de: "alto do cabeçalho" }); } });

    return { itens: itens, etapas: etapas, duvidosas: duvidosas, candidatos: candidatos, sobrasMeio: sobrasMeio, sobrasFim: sobrasFim,
             paginas: pagsUsadas, titulos: titulosRef, mapa: mapaPrimeiro, fechou: fechou };
  }

  /* ================================================================
   * 7) CONFERÊNCIA
   * ================================================================ */
  function tolerancia(n) { return Math.max(TOL_BASE, TOL_POR_LINHA * n + 0.01); }

  function conferir(bl) {
    var itens = bl.itens, etapas = bl.etapas, motivos = [], cs = [];
    function cheq(codigo, ok, detalhe, fracao, aplica) { var c = { codigo: codigo, ok: !!ok, peso: PESOS[codigo], detalhe: detalhe, fracao: fracao == null ? null : fracao, aplica: aplica !== false }; cs.push(c); return c; }
    if (!itens.length) return { nota: 0, ok: false, motivos: ["Nenhum item foi lido."].concat(bl.duvidosas.slice(0, 5)), checagens: [], soma: 0, tolerancia: TOL_BASE, totalImpresso: null };

    // valor de cada item: o total impresso; sem ele, quantidade × unitário
    function valor(it) { return it.total != null ? it.total : (it.quantidade != null && it.precoUnit != null ? r2(it.quantidade * it.precoUnit) : 0); }
    var soma = r2(itens.reduce(function (s, it) { return s + valor(it); }, 0));
    var tol = tolerancia(itens.length);

    // total impresso: entre os candidatos, o que a soma confirma; senão o 1º
    var totalImp = null, origemTotal = null, bateu = false;
    bl.candidatos = bl.candidatos.filter(function (c) { return c.v > 0; });
    bl.candidatos.forEach(function (c) { if (!bateu && Math.abs(soma - c.v) <= tol) { totalImp = c.v; origemTotal = c.de; bateu = true; } });
    if (!bateu && bl.candidatos.length) { totalImp = bl.candidatos[0].v; origemTotal = bl.candidatos[0].de; }
    if (totalImp != null) {
      cheq("total_impresso", bateu, bateu ? ("A soma dos itens (" + moeda(soma) + ") bate com o total impresso (" + moeda(totalImp) + ").")
        : ("A soma dos itens (" + moeda(soma) + ") NÃO bate com o total impresso (" + moeda(totalImp) + "), diferença de " + moeda(Math.abs(soma - totalImp)) + ": pode faltar item ou página."));
      if (!bateu) motivos.push("A soma dos itens (" + moeda(soma) + ") não bate com o total impresso na planilha (" + moeda(totalImp) + "): pode faltar item, página ou haver linha lida errada.");
    } else cheq("total_impresso", false, "A planilha não traz um total para comparar.", null, false);

    // etapas com total = soma dos itens sob o número dela
    var testadas = 0, batem = 0, ruins = [];
    etapas.forEach(function (e) {
      var alvo = e._valor != null ? e._valor : e.total;
      if (alvo == null || alvo <= 0) return;      // etapa de R$ 0,00 (modelo para o licitante preencher) não prova nada
      var pref = semZeros(e.item) + ".", filhos = itens.filter(function (it) { return it.item.indexOf(pref) === 0; });
      if (!filhos.length) return;
      testadas++;
      var s = r2(filhos.reduce(function (acc, it) { return acc + valor(it); }, 0));
      if (Math.abs(s - alvo) <= tolerancia(filhos.length)) batem++;
      else if (ruins.length < 3) ruins.push("etapa " + e.item + ": os itens somam " + moeda(s) + " e a etapa diz " + moeda(alvo));
    });
    var okEtapas = null;
    if (testadas) {
      var fr = batem / testadas;
      okEtapas = (fr >= 1 && testadas >= 2) || (testadas < 2 && fr >= 1);
      cheq("etapas", fr >= LIMITE_FRACAO, batem + " de " + testadas + " etapas batem com a soma dos seus itens" + (ruins.length ? " (" + ruins.join("; ") + ")" : "") + ".", fr);
      if (fr < LIMITE_FRACAO) motivos.push(ruins.length ? "Subtotal de etapa não bate: " + ruins.join("; ") + "." : "Subtotais de etapa não batem com os itens.");
    } else cheq("etapas", false, "Nenhuma etapa traz total para conferir.", null, false);

    // quantidade × unitário = total
    var tl = 0, bl2 = 0, mil = 0, exemplos = [];
    itens.forEach(function (it) {
      var q = it.quantidade, tot = it.total, precos = [it.precoUnit, it.precoUnitSemBdi].filter(function (x) { return x != null && x > 0; });
      if (!q || tot == null || !precos.length) return;
      tl++;
      var tolL = 0.005 * Math.abs(q) + 0.011;
      if (precos.some(function (p) { return Math.abs(q * p - tot) <= tolL; })) bl2++;
      else {
        it.avisos.push("quantidade × unitário não fecha com o total");
        if (exemplos.length < 3) exemplos.push(it.item);
        if (precos.some(function (p) { var rz = tot ? q * p / tot : 0; return (rz > 0.0009 && rz < 0.0011) || (rz > 900 && rz < 1100); })) mil++;
      }
    });
    if (tl) {
      var fl = bl2 / tl;
      cheq("linhas", fl >= LIMITE_FRACAO, bl2 + " de " + tl + " linhas têm quantidade × unitário igual ao total" + (exemplos.length ? " (conferir itens " + exemplos.join(", ") + ")" : "") + ".", fl);
      if (exemplos.length) motivos.push("Linhas em que quantidade × unitário não fecha com o total: itens " + exemplos.join(", ") + (mil ? " (diferença de 1000 vezes: ponto de milhar lido errado?)" : "") + ".");
    } else cheq("linhas", false, "Os itens não trazem quantidade, unitário e total juntos.", null, false);

    // itens completos
    var comp = itens.filter(function (it) { return it.unidade && it.quantidade != null && it.quantidade > 0 && it.descricao; }).length;
    var fc = comp / itens.length;
    cheq("completos", fc >= 0.95, comp + " de " + itens.length + " itens têm unidade, quantidade e descrição.", fc);
    if (fc < 0.95) motivos.push((itens.length - comp) + " item(ns) sem unidade, quantidade ou descrição.");

    // numeração sem salto: dentro do mesmo pai, o último número sobe de 1 em 1
    var pulos = [], porPai = {};
    var todos = [];
    itens.forEach(function (it) { todos.push(it.item); });
    etapas.forEach(function (e) { todos.push(e.item); });
    todos.forEach(function (n) {
      var partes = semZeros(n).split("."), ult = parseInt(partes.pop(), 10), pai = partes.join(".");
      (porPai[pai] = porPai[pai] || []).push(ult);
    });
    Object.keys(porPai).forEach(function (pai) {
      var lst = porPai[pai].slice().sort(function (a, b) { return a - b; }), j;
      // 0 ou 1 no começo (etapa "01.00" convive com "01.01")
      for (j = 1; j < lst.length; j++) {
        if (lst[j] === lst[j - 1]) { pulos.push("número " + (pai ? pai + "." : "") + lst[j] + " repetido"); }
        else if (lst[j] - lst[j - 1] > 1) pulos.push("falta " + (pai ? pai + "." : "") + (lst[j - 1] + 1) + (lst[j] - lst[j - 1] > 2 ? " até " + (pai ? pai + "." : "") + (lst[j] - 1) : ""));
      }
    });
    cheq("sequencia", pulos.length === 0, pulos.length ? ("Numeração com salto: " + pulos.slice(0, 4).join("; ") + (pulos.length > 4 ? " (e mais " + (pulos.length - 4) + ")" : "") + ".") : "Os números dos itens seguem sem salto.");
    if (pulos.length) motivos.push("A numeração dos itens tem salto: " + pulos.slice(0, 4).join("; ") + (pulos.length > 4 ? " (e mais " + (pulos.length - 4) + ")" : "") + ". Pode ter ficado item de fora.");

    // sobras no meio da tabela (palavra sem dono = texto cortado)
    var sm = bl.sobrasMeio;
    cheq("sobras", sm.length === 0, sm.length ? (sm.length + " palavra(s) dentro da tabela ficaram sem item: " + sm.slice(0, 6).map(function (s) { return "\"" + s.t + "\" (pág. " + s.pagina + ")"; }).join(", ") + ".") : "Todas as palavras da tabela foram para algum item.");
    if (sm.length) motivos.push(sm.length + " palavra(s) dentro da tabela ficaram sem item (texto possivelmente cortado): " + sm.slice(0, 6).map(function (s) { return "\"" + s.t + "\" (pág. " + s.pagina + ")"; }).join(", ") + ".");

    bl.duvidosas.forEach(function (d) { motivos.push(d); });

    var aplicaveis = cs.filter(function (c) { return c.aplica; }), pt = 0, pesoTot = 0;
    aplicaveis.forEach(function (c) { pesoTot += c.peso; pt += c.peso * (c.fracao != null ? c.fracao : (c.ok ? 1 : 0)); });
    var nota = pesoTot ? Math.round(100 * pt / pesoTot) : 0;
    var temProva = cs.some(function (c) { return c.aplica && (c.codigo === "total_impresso" || c.codigo === "etapas"); });
    if (!temProva) {
      nota = Math.min(nota, TETO_SEM_PROVA);
      motivos.push(soma === 0 ? "A planilha não traz preços (modelo para o licitante preencher): li os itens e as quantidades, mas não há valor para conferir."
        : "Não há como provar a soma: a planilha não traz total nem subtotal de etapa. Confira os valores à mão.");
    }
    // total NÃO batendo derruba a nota (peso 35 já pesa; trava para 69 para nunca valer como conferida)
    var ctot = cs.filter(function (c) { return c.codigo === "total_impresso" && c.aplica; })[0];
    if (ctot && !ctot.ok) nota = Math.min(nota, NOTA_MINIMA - 1);
    var ok;
    if (ctot) ok = nota >= NOTA_MINIMA && ctot.ok;
    else ok = nota >= NOTA_MINIMA && okEtapas === true && testadas >= 2 && batem === testadas;   // sem total impresso: vale se TODAS as etapas com total fecham (≥ 2)
    if (!ctot && ok) motivos.push("A planilha não traz total impresso; a leitura vale porque todos os subtotais de etapa fecham com os itens.");
    var comSem = itens.filter(function (it) { return it.precoUnitSemBdi != null && it.quantidade != null; });
    var somaSem = comSem.length === itens.length ? r2(comSem.reduce(function (acc, it) { return acc + it.quantidade * it.precoUnitSemBdi; }, 0)) : null;
    return { nota: nota, ok: ok, motivos: dedup(motivos), checagens: cs, soma: soma, somaSemBdi: somaSem, tolerancia: tol, totalImpresso: totalImp, origemTotal: origemTotal };
  }
  function dedup(a) { var v = {}, o = []; a.forEach(function (x) { if (!v[x]) { v[x] = 1; o.push(x); } }); return o; }

  /* ================================================================
   * 8) ACHAR AS PÁGINAS DA PLANILHA E LER
   * ================================================================ */
  /* paginas: [{ numero, largura, altura, palavras:[{t,x0,x1,y,h}] }] → resultado no contrato. Puro: não depende do pdf.js (é o que os testes usam). */
  function lerPaginas(paginas, opts) {
    opts = opts || {};
    var preparadas = paginas.map(function (pg) {
      var ws = pg.palavras || [];
      var hs = ws.map(function (w) { return w.h; });
      var hmed = mediana(hs) || 8;
      return { numero: pg.numero, largura: pg.largura, altura: pg.altura, palavras: ws, hmed: hmed, linhas: agruparLinhas(ws, Math.max(1.2, hmed * 0.3)) };
    });
    // 1) cabeçalho de colunas em cada página
    var cabs = preparadas.map(function (pg) { return pg.palavras.length >= 25 ? acharCabecalho(pg.linhas, pg.hmed) : null; });
    // 2) blocos de páginas seguidas: cabeçalho com a mesma assinatura (a continuação sem cabeçalho entra se tiver cara de tabela)
    var blocos = [], atual = null, i;
    function caraDeTabela(pg) {
      // página de continuação: várias linhas com número de item na margem esquerda e dinheiro à direita
      var an = 0, din = 0;
      pg.linhas.forEach(function (L) {
        if (L.ws.length && RE_ANCORA.test(L.ws[0].t) && L.ws[0].x0 < pg.largura * 0.3) an++;
        if (moedaNaLinha(L).length) din++;
      });
      return an >= 3 && din >= 3;
    }
    for (i = 0; i < preparadas.length; i++) {
      var cab = cabs[i];
      if (cab) {
        var sig = assinaturaDoCabecalho(cab);
        if (atual && atual.sig === sig && atual.ultimo === i - 1 && !atual.fechado) { atual.idx.push(i); atual.ultimo = i; }
        else { atual = { sig: sig, idx: [i], ultimo: i, fechado: false }; blocos.push(atual); }
      } else if (atual && atual.ultimo === i - 1 && caraDeTabela(preparadas[i])) { atual.idx.push(i); atual.ultimo = i; }
    }
    // 3) lê cada bloco e fica com o de melhor nota
    var melhor = null, tentativas = [];
    blocos.forEach(function (b) {
      var pgs = b.idx.map(function (k) { return preparadas[k]; }), cbs = b.idx.map(function (k) { return cabs[k]; });
      var bl = lerBloco(pgs, cbs);
      if (!bl.itens.length) return;
      var conf = conferir(bl);
      var cand = { bloco: bl, conf: conf, pontos: (conf.ok ? 1000 : 0) + conf.nota * 5 + Math.min(bl.itens.length, 400) / 400 };
      tentativas.push(cand);
      if (!melhor || cand.pontos > melhor.pontos) melhor = cand;
    });
    if (!melhor) {
      return { itens: [], etapas: [], totalImpresso: null,
               conferencia: { nota: 0, ok: false, motivos: [blocos.length ? "Achei uma tabela, mas nenhum item com número, descrição e quantidade foi lido." : "Não achei a planilha orçamentária neste PDF (nenhuma página com cabeçalho de colunas ITEM / DESCRIÇÃO / QUANTIDADE / PREÇO)."], checagens: [], soma: 0 },
               paginas: [], fontes: [], bdi: null };
    }
    return montarResultado(melhor, tentativas, opts);
  }

  function montarResultado(m, tentativas, opts) {
    var bl = m.bloco, conf = m.conf;
    var itens = bl.itens.map(function (it) {
      var o = { item: it.item, codigo: it.codigo, fonte: it.fonte, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade,
                precoUnit: it.precoUnit, total: it.total, pagina: it.pagina, linha: it.linha, etapa: it.etapaDe };
      if (it.fonteBase && it.fonteBase !== it.fonte) o.fonteBase = it.fonteBase;
      if (it.precoUnitSemBdi != null && it.precoUnitSemBdi !== it.precoUnit) o.precoUnitSemBdi = it.precoUnitSemBdi;
      if (it.avisos && it.avisos.length) { o.duvidoso = true; o.avisos = it.avisos.slice(); }
      return o;
    });
    var fontes = {};
    itens.forEach(function (it) { if (it.fonte) fontes[it.fonte] = (fontes[it.fonte] || 0) + 1; });
    return { itens: itens, etapas: bl.etapas.map(function (e) { return { item: e.item, titulo: e.titulo, total: e.total != null ? e.total : null, pagina: e.pagina }; }),
             totalImpresso: conf.totalImpresso != null ? conf.totalImpresso : null,
             conferencia: { nota: conf.nota, ok: conf.ok, motivos: conf.motivos, checagens: conf.checagens, soma: conf.soma, somaSemBdi: conf.somaSemBdi, tolerancia: conf.tolerancia },
             paginas: bl.paginas, fontes: Object.keys(fontes), blocosLidos: tentativas.length };
  }

  /* ================================================================
   * 9) pdf.js
   * ================================================================ */
  function carregarPdfjs(opts) {
    if (opts && opts.pdfjs) return Promise.resolve(opts.pdfjs);
    if (global.pdfjsLib && global.pdfjsLib.getDocument) {
      try { if (!global.pdfjsLib.GlobalWorkerOptions.workerSrc) global.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("js/vendor/pdfjs/pdf.worker.min.mjs", global.document.baseURI).href; } catch (e) {}
      return Promise.resolve(global.pdfjsLib);
    }
    if (global.Gestao && global.Gestao._pdfLib) return Promise.resolve(global.Gestao._pdfLib);
    return new Promise(function (resolve, reject) {
      try {
        var raiz = global.document.baseURI;
        /* sem CDN: o leitor é o vendor local; documento de prefeitura/cliente não sai para terceiro nem no caminho de erro */
        import(new URL("js/vendor/pdfjs/pdf.min.mjs", raiz).href).then(function (lib) {
          try { lib.GlobalWorkerOptions.workerSrc = new URL("js/vendor/pdfjs/pdf.worker.min.mjs", raiz).href; } catch (e) {}
          if (global.Gestao) global.Gestao._pdfLib = lib;
          resolve(lib);
        })["catch"](function () { reject(new Error("Não carreguei o leitor de PDF local (js/vendor/pdfjs). Reinstale o programa.")); });
      } catch (e) { reject(new Error("Este navegador não carrega o leitor de PDF.")); }
    });
  }

  function listaDePaginas(total, sel) {
    var todas = [], i;
    if (!sel) { for (i = 1; i <= Math.min(total, MAX_PAGINAS); i++) todas.push(i); return todas; }
    if (sel.length === 2 && typeof sel[0] === "number" && sel.rangeDe !== false && !sel.lista) {
      for (i = Math.max(1, sel[0]); i <= Math.min(total, sel[1], MAX_PAGINAS); i++) todas.push(i);
      return todas;
    }
    return sel.filter(function (n) { return n >= 1 && n <= total; }).slice(0, MAX_PAGINAS);
  }

  /* Extrai as palavras de cada página (só das que a seleção pede). onProgresso(feitas, total) opcional. */
  function extrairPaginas(lib, buffer, opts) {
    opts = opts || {};
    return lib.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise.then(function (pdf) {
      var nums = listaDePaginas(pdf.numPages, opts.paginas), out = [], idx = 0;
      function proxima() {
        if (idx >= nums.length) { try { pdf.destroy(); } catch (e) {} return Promise.resolve({ paginas: out, total: pdf.numPages }); }
        var n = nums[idx++];
        return pdf.getPage(n).then(function (page) {
          var vp = page.getViewport({ scale: 1 });
          return page.getTextContent().then(function (tc) {
            var ps = palavrasDaPagina(tc.items, vp.transform), end = endireitar(ps), ws = finalizar(end.ps);
            var largura = vp.width, altura = vp.height;
            if (end.giro === 90 || end.giro === 270) { var tmp = largura; largura = altura; altura = tmp; }
            // quadro: com o giro, as coordenadas podem ficar negativas; leva tudo para ≥ 0
            if (end.giro) {
              var minX = 1e9, minY = 1e9;
              ws.forEach(function (w) { if (w.x0 < minX) minX = w.x0; if (w.y < minY) minY = w.y; });
              ws.forEach(function (w) { w.x0 -= minX; w.x1 -= minX; w.y -= minY; });
            }
            out.push({ numero: n, largura: largura, altura: altura, palavras: ws, giro: end.giro });
            try { page.cleanup(); } catch (e) {}
            if (opts.onProgresso && (out.length % 10 === 0)) { try { opts.onProgresso(out.length, nums.length); } catch (e) {} }
            return null;
          });
        }).then(proxima);
      }
      return proxima();
    });
  }

  var PlanilhaPDF = {
    NOTA_MINIMA: NOTA_MINIMA,
    TOLERANCIA: { base: TOL_BASE, porLinha: TOL_POR_LINHA },

    /* O contrato: PDF (ArrayBuffer) → Promise do resultado. `opts.paginas`: [de, ate] (1 = primeira) ou {lista:[...]}; `opts.pdfjs`: a lib (testes). */
    ler: function (arrayBuffer, opts) {
      opts = opts || {};
      var nome = opts.nome || "";
      var sel = opts.paginas || null;
      if (sel && !Array.isArray(sel) && sel.lista) { sel = sel.lista.slice(); sel.lista = true; }
      return carregarPdfjs(opts).then(function (lib) {
        return extrairPaginas(lib, arrayBuffer, { paginas: sel, onProgresso: opts.onProgresso });
      }).then(function (ex) {
        var r = lerPaginas(ex.paginas, opts);
        r.nome = nome; r.totalPaginasPdf = ex.total;
        return r;
      });
    },

    /* Sem pdf.js: já com as palavras de cada página (testes e a leitura da leva do CPLPRO). */
    lerPaginas: lerPaginas,

    /* Matriz no formato que o Importador já lê (planilha de Excel): o PDF entra pelo mesmo funil do .xlsx. */
    paraMatriz: function (r, opts) {
      opts = opts || {};
      var linhas = [["Item", "Código", "Fonte", "Descrição", "Und", "Quantidade", "Preço unitário", "Total"]];
      var porEtapa = {};
      r.etapas.forEach(function (e) { porEtapa[e.item] = e; });
      var usadas = {};
      // etapa antes dos seus itens, na ordem do documento
      var ordem = [];
      r.etapas.forEach(function (e) { ordem.push({ pg: e.pagina, tipo: "e", e: e }); });
      var corpo = [], vistos = {};
      var todos = r.etapas.map(function (e) { return { n: e.item, etapa: true, e: e }; }).concat(r.itens.map(function (it) { return { n: it.item, etapa: false, it: it }; }));
      todos.sort(function (a, b) {
        var ka = chaveNum(a.n), kb = chaveNum(b.n), j;
        for (j = 0; j < Math.max(ka.length, kb.length); j++) { var x = ka[j] === undefined ? -1 : ka[j], y = kb[j] === undefined ? -1 : kb[j]; if (x !== y) return x - y; }
        return a.etapa ? -1 : 1;
      });
      todos.forEach(function (o) {
        if (o.etapa) linhas.push([o.e.item, "", "", o.e.titulo, "", "", "", ""]);
        else {
          var it = o.it, preco = (opts.semBdi && it.precoUnitSemBdi != null) ? it.precoUnitSemBdi : it.precoUnit;
          linhas.push([it.item, it.codigo || "", it.fonteBase || it.fonte || "", it.descricao, it.unidade || "", it.quantidade, preco != null ? preco : "", it.total != null ? it.total : ""]);
        }
      });
      return linhas;
    },

    /* Texto curto da conferência para a prévia (PT-BR): "Nota 92 — conferido: a soma dos itens bate com o total impresso." */
    resumoConferencia: function (r) {
      var c = r.conferencia, n = r.itens.length;
      var cab = (c.ok ? "Conferido" : "NÃO conferido") + " (nota " + c.nota + "/100) — " + n + " item(ns), " + r.etapas.length + " etapa(s)";
      if (r.totalImpresso != null) cab += ", total impresso " + moeda(r.totalImpresso) + " × soma lida " + moeda(c.soma);
      return cab + ".";
    },

    /* nomes de uso interno dos testes */
    _norm: norm, _numeroBR: numeroBR, _moeda: moeda, _palavrasDaPagina: palavrasDaPagina, _endireitar: endireitar, _finalizar: finalizar,
    _extrairPaginas: extrairPaginas, _acharCabecalho: acharCabecalho, _agruparLinhas: agruparLinhas, _tolerancia: tolerancia
  };

  global.PlanilhaPDF = PlanilhaPDF;
  if (typeof module !== "undefined" && module.exports) module.exports = PlanilhaPDF;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * imgplanta.js — IMAGEM DE PLANTA BAIXA → SEGMENTOS DE LINHA.
 *
 * Motor PURO (Node-testável, ES5). Recebe pixels, devolve linhas.
 * Nada de DOM, nada de canvas: quem rasteriza é a tela.
 *
 * ---------------------------------------------------------------------
 * A DECISÃO QUE ORGANIZA TUDO
 * ---------------------------------------------------------------------
 * Este arquivo NÃO é um detector de paredes novo. Ele é o SUBSTITUTO do
 * `DXF.parse`: termina entregando `segmentos: [{x1,y1,x2,y2,layer}]`, o
 * mesmo contrato que o js/planta3d.js já consome há versões — e que já
 * resolve o problema difícil (par de faces → eixo + espessura, exclusão
 * da linha-sanduíche, encontro em T, fusão de colineares), tudo isso já
 * endurecido por gate.
 *
 * Então o trabalho aqui é só o que a imagem tem e o DXF não: pixel virar
 * traço, e traço virar linha limpa.
 *
 * ---------------------------------------------------------------------
 * POR QUE ESQUELETONIZAÇÃO, E NÃO HOUGH
 * ---------------------------------------------------------------------
 * · Hough padrão devolve RETA INFINITA, sem extremidade — e comprimento
 *   é exatamente o que precisamos para sair m². Fora isso, traço tremido
 *   de croqui espalha a energia e não faz pico, e cota/hachura colineares
 *   fazem pico fantasma.
 * · Hough probabilística tem extremidade, mas é ESTOCÁSTICA: a mesma
 *   planta, duas execuções, duas volumetrias. Isso quebra o teste e a
 *   confiança de quem assina o projeto.
 * · Zhang-Suen + rastreio é DETERMINÍSTICO, dá uma polilinha por traço
 *   (zero duplicata), tem extremidade real, e — o que decide — junto com
 *   a transformada de distância entrega o RAIO local do traço. Esse raio
 *   separa os três casos numa passada só:
 *      parede oca (linha dupla) → esqueleto nas DUAS faces, raio 1–3 px;
 *      parede em poché sólido  → esqueleto no EIXO, raio grande;
 *      croqui de traço único   → raio pequeno e sem par.
 *
 * ---------------------------------------------------------------------
 * O QUE ESTE ARQUIVO NÃO FAZ (e diz que não faz)
 * ---------------------------------------------------------------------
 * · Não sabe a escala. Devolve PIXEL. Quem converte para metro é a tela,
 *   com a calibração de dois pontos — e sem calibrar, não gera nada.
 * · Não corrige perspectiva. Foto de celular torta sai com parede longe
 *   mais fina, errada COM CARA DE CERTA. O motor mede o desvio e avisa.
 * · Não lê cota, texto nem número. Descarta o que parece texto; não
 *   interpreta.
 *
 * Teste: node tools/test-imgplanta.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }

  /* ==================================================================
   * 1. PRÉ-PROCESSAMENTO
   * ================================================================== */

  /* luma inteira, sem ponto flutuante: Y = (77R + 150G + 29B) >> 8 */
  function cinza(data, w, h) {
    var g = new Uint8Array(w * h);
    for (var i = 0, p = 0; i < g.length; i++, p += 4) {
      g[i] = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8;
    }
    return g;
  }

  /* MÁXIMO EM JANELA, em tempo CONSTANTE por pixel (van Herk / Gil-Werman).
   *
   * A versão ingênua custa O(raio) por pixel, e isso amarrava o raio num
   * valor pequeno e fixo — que é justamente o defeito: com raio menor que
   * metade do traço, a janela inteira cai DENTRO da tinta, o "fundo"
   * estimado vira a própria tinta e o miolo do traço é apagado.
   * Com custo independente do raio, o raio pode CRESCER até funcionar.
   *
   * A conta: divide a linha em blocos de k = 2r+1; guarda o máximo
   * acumulado da esquerda (pref) e da direita (suf) dentro de cada bloco.
   * A janela centrada em i é max(suf[i-r], pref[i+r]) — duas leituras.
   * Nas bordas a janela é aparada e o resultado pode incluir um pouco
   * além; para estimar PAPEL isso é inofensivo. */
  function maxLinear(a, n, r) {
    var k = 2 * r + 1, i;
    if (k >= n) {   /* janela maior que a linha: um máximo só */
      var m = 0; for (i = 0; i < n; i++) if (a[i] > m) m = a[i];
      var u = new Uint8Array(n); for (i = 0; i < n; i++) u[i] = m; return u;
    }
    var pref = new Uint8Array(n), suf = new Uint8Array(n);
    for (i = 0; i < n; i++) pref[i] = (i % k === 0) ? a[i] : (a[i] > pref[i - 1] ? a[i] : pref[i - 1]);
    for (i = n - 1; i >= 0; i--) suf[i] = (i === n - 1 || (i + 1) % k === 0) ? a[i] : (a[i] > suf[i + 1] ? a[i] : suf[i + 1]);
    var out = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      var lo = i - r, hi = i + r;
      if (lo < 0) lo = 0;
      if (hi > n - 1) hi = n - 1;
      var v = suf[lo];
      if (pref[hi] > v) v = pref[hi];
      out[i] = v;
    }
    return out;
  }

  function maxBox(g, w, h, raio) {
    var a = new Uint8Array(w * h), b = new Uint8Array(w * h), x, y, i;
    var lin = new Uint8Array(w > h ? w : h);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) lin[x] = g[y * w + x];
      var rx = maxLinear(lin, w, raio);
      for (x = 0; x < w; x++) a[y * w + x] = rx[x];
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) lin[y] = a[y * w + x];
      var ry = maxLinear(lin, h, raio);
      for (y = 0; y < h; y++) b[y * w + x] = ry[y];
    }
    return b;
  }

  /* Achata a iluminação dividindo pelo fundo estimado. É a correção
     fisicamente certa para sombra de celular, que é MULTIPLICATIVA.
     Depois disso o Otsu global volta a valer.
     Limite honesto: feição de tinta mais larga que 2×raio é apagada pela
     divisão — carimbo preto sólido, por exemplo. Por isso recortar o
     desenho antes é etapa do fluxo, não luxo. */
  function achatar(g, w, h, raio) {
    var B = maxBox(g, w, h, raio), out = new Uint8Array(g.length);
    for (var i = 0; i < g.length; i++) {
      var d = B[i] < 1 ? 1 : B[i];
      var v = (255 * g[i] / d) | 0;
      out[i] = v > 255 ? 255 : v;
    }
    return out;
  }

  /* Otsu + SEPARABILIDADE. A separabilidade é o que diz se dá para
     confiar num limiar global: perto de 1, dois picos bem separados
     (papel e tinta); abaixo de 0,6, a imagem não tem dois grupos e o
     limiar global vai comer metade do desenho. */
  function otsu(g) {
    var hist = new Float64Array(256), i, n = g.length;
    for (i = 0; i < n; i++) hist[g[i]]++;
    var soma = 0, somaTot = 0;
    for (i = 0; i < 256; i++) { soma += hist[i]; somaTot += i * hist[i]; }
    var media = somaTot / soma, varTot = 0;
    for (i = 0; i < 256; i++) varTot += hist[i] * (i - media) * (i - media);
    varTot /= soma;

    /* O EMPATE IMPORTA. Numa imagem perfeitamente bimodal — que é o caso
       do scan limpo e do print de PDF — TODO limiar entre os dois picos
       dá a mesma variância entre classes. Pegando o primeiro máximo, o
       limiar sai 0 e a comparação `g < 0` não marca pixel nenhum: o motor
       decidia que a imagem não tinha tinta e caía no adaptativo à toa.
       O certo é o MEIO do platô, que é o limiar clássico do Otsu. */
    var w0 = 0, s0 = 0, melhor = -1, tIni = 128, tFim = 128;
    for (i = 0; i < 256; i++) {
      w0 += hist[i]; if (w0 === 0) continue;
      var w1 = soma - w0; if (w1 === 0) break;
      s0 += i * hist[i];
      var m0 = s0 / w0, m1 = (somaTot - s0) / w1;
      var vb = (w0 / soma) * (w1 / soma) * (m0 - m1) * (m0 - m1);
      if (vb > melhor + 1e-12) { melhor = vb; tIni = tFim = i; }
      else if (vb > melhor - 1e-12) { tFim = i; }
    }
    return { t: Math.round((tIni + tFim) / 2), eta: varTot > 0 ? melhor / varTot : 0,
             platô: tFim - tIni };
  }

  /* imagem integral — base do limiar adaptativo */
  function integral(g, w, h) {
    var S = new Float64Array((w + 1) * (h + 1));
    for (var y = 0; y < h; y++) {
      var acc = 0;
      for (var x = 0; x < w; x++) {
        acc += g[y * w + x];
        S[(y + 1) * (w + 1) + (x + 1)] = S[y * (w + 1) + (x + 1)] + acc;
      }
    }
    return S;
  }

  /* Bradley–Roth: limiar por média local. Serve quando o global falha
     (planta com fundo em degradê, foto muito irregular). A janela tem de
     ser bem maior que a espessura do traço, senão o miolo de uma parede
     em poché fica ACIMA da própria média e a parede esvazia. */
  function bradley(g, w, h, S, jan, frac) {
    var bin = new Uint8Array(w * h), r = jan >> 1;
    for (var y = 0; y < h; y++) {
      var y0 = y - r < 0 ? 0 : y - r, y1 = y + r >= h ? h - 1 : y + r;
      for (var x = 0; x < w; x++) {
        var x0 = x - r < 0 ? 0 : x - r, x1 = x + r >= w ? w - 1 : x + r;
        var n = (x1 - x0 + 1) * (y1 - y0 + 1);
        var s = S[(y1 + 1) * (w + 1) + (x1 + 1)] - S[y0 * (w + 1) + (x1 + 1)] -
                S[(y1 + 1) * (w + 1) + x0] + S[y0 * (w + 1) + x0];
        bin[y * w + x] = (g[y * w + x] * n < s * (1 - frac)) ? 1 : 0;
      }
    }
    return bin;
  }

  function limiarFixo(g, t) {
    var bin = new Uint8Array(g.length);
    for (var i = 0; i < g.length; i++) bin[i] = g[i] < t ? 1 : 0;
    return bin;
  }

  function fracaoTinta(bin) {
    var n = 0;
    for (var i = 0; i < bin.length; i++) if (bin[i]) n++;
    return n / bin.length;
  }

  /* ==================================================================
   * 2. LIMPEZA
   * ================================================================== */

  /* componentes conexos (8-vizinhos) com pilha explícita — recursão
     estoura a pilha do JS numa planta grande */
  /* MEIO-TRAÇO MAIS GROSSO da imagem, em pixels. É a distância do pixel
     mais "fundo" da tinta até o papel mais próximo — logo, metade da
     espessura do traço mais largo. Usada para dimensionar a janela do
     achatamento: janela menor que isso cai inteira dentro da tinta.
     Percentil 99,9 em vez do máximo puro para um borrão isolado (uma
     logomarca preta) não ditar o raio da planta inteira. */
  function meioTracoMax(bin, w, h) {
    var d = distancia(bin, w, h), hist = [], i, n = 0, mx = 0;
    for (i = 0; i < d.length; i++) if (d[i] > 0) { var v = (d[i] / 3) | 0; if (v > mx) mx = v; hist[v] = (hist[v] || 0) + 1; n++; }
    if (!n) return 0;
    var alvo = n * 0.001, acc = 0;                 /* 0,1 % mais fundo */
    for (i = mx; i >= 0; i--) { acc += hist[i] || 0; if (acc >= alvo) return i; }
    return mx;
  }

  function componentes(bin, w, h) {
    var rot = new Int32Array(w * h), lista = [], id = 0;
    var pilha = new Int32Array(w * h), dx = [1, -1, 0, 0, 1, 1, -1, -1], dy = [0, 0, 1, -1, 1, -1, 1, -1];
    for (var s = 0; s < bin.length; s++) {
      if (!bin[s] || rot[s]) continue;
      id++;
      var top = 0, area = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      pilha[top++] = s; rot[s] = id;
      while (top > 0) {
        var p = pilha[--top], px = p % w, py = (p - px) / w;
        area++;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
        for (var k = 0; k < 8; k++) {
          var nx = px + dx[k], ny = py + dy[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var q = ny * w + nx;
          if (bin[q] && !rot[q]) { rot[q] = id; pilha[top++] = q; }
        }
      }
      lista.push({ id: id, area: area, x0: x0, x1: x1, y0: y0, y1: y1,
                   l: x1 - x0 + 1, c: y1 - y0 + 1 });
    }
    return { rot: rot, comps: lista };
  }

  /* Tira sujeira e o que PARECE TEXTO. O filtro de texto vem ANTES de
     afinar: é mais barato, e mais seguro — letra afinada vira um punhado
     de traço curto que o pareador tenta casar com parede. */
  function limpar(bin, w, h, opts) {
    var cc = componentes(bin, w, h);
    var diag = Math.sqrt(w * w + h * h);
    var minArea = opts.minArea != null ? opts.minArea : 12;
    var maxTexto = opts.maxTexto != null ? opts.maxTexto : 0.025 * diag;
    var mortos = {}, nSujeira = 0, nTexto = 0;
    cc.comps.forEach(function (c) {
      if (c.area < minArea) { mortos[c.id] = 1; nSujeira++; return; }
      var maior = c.l > c.c ? c.l : c.c;
      var dens = c.area / (c.l * c.c);
      /* pequeno E cheio = caractere. Traço de parede é comprido e vazio. */
      if (maior < maxTexto && dens > 0.25) { mortos[c.id] = 1; nTexto++; }
    });
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = (bin[i] && !mortos[cc.rot[i]]) ? 1 : 0;
    return { bin: out, sujeira: nSujeira, texto: nTexto, comps: cc.comps.length };
  }

  /* ==================================================================
   * 3. TRANSFORMADA DE DISTÂNCIA (chamfer 3-4)
   * O raio local do traço. É ele que diz se o esqueleto é o EIXO de uma
   * parede grossa ou a FACE de uma parede oca.
   * ================================================================== */
  function distancia(bin, w, h) {
    var INF = 1 << 28, d = new Int32Array(w * h), x, y, i;
    for (i = 0; i < d.length; i++) d[i] = bin[i] ? INF : 0;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x; if (!bin[i]) continue;
        var m = d[i];
        if (y > 0) { if (d[i - w] + 3 < m) m = d[i - w] + 3;
          if (x > 0 && d[i - w - 1] + 4 < m) m = d[i - w - 1] + 4;
          if (x < w - 1 && d[i - w + 1] + 4 < m) m = d[i - w + 1] + 4; }
        if (x > 0 && d[i - 1] + 3 < m) m = d[i - 1] + 3;
        d[i] = m;
      }
    }
    for (y = h - 1; y >= 0; y--) {
      for (x = w - 1; x >= 0; x--) {
        i = y * w + x; if (!bin[i]) continue;
        var m2 = d[i];
        if (y < h - 1) { if (d[i + w] + 3 < m2) m2 = d[i + w] + 3;
          if (x > 0 && d[i + w - 1] + 4 < m2) m2 = d[i + w - 1] + 4;
          if (x < w - 1 && d[i + w + 1] + 4 < m2) m2 = d[i + w + 1] + 4; }
        if (x < w - 1 && d[i + 1] + 3 < m2) m2 = d[i + 1] + 3;
        d[i] = m2;
      }
    }
    return d;   /* em terços de pixel: divida por 3 */
  }

  /* ==================================================================
   * 4. ZHANG-SUEN — afinar para 1 px
   * ================================================================== */
  function zhangSuen(bin, w, h) {
    var img = new Uint8Array(bin), mudou = true, passo, i, x, y;
    var P = new Uint8Array(8);
    function viz(im, x, y) {
      P[0] = im[(y - 1) * w + x];       /* p2 N  */
      P[1] = im[(y - 1) * w + x + 1];   /* p3 NE */
      P[2] = im[y * w + x + 1];         /* p4 E  */
      P[3] = im[(y + 1) * w + x + 1];   /* p5 SE */
      P[4] = im[(y + 1) * w + x];       /* p6 S  */
      P[5] = im[(y + 1) * w + x - 1];   /* p7 SW */
      P[6] = im[y * w + x - 1];         /* p8 W  */
      P[7] = im[(y - 1) * w + x - 1];   /* p9 NW */
    }
    var guarda = 0;
    while (mudou && guarda++ < 200) {
      mudou = false;
      for (passo = 0; passo < 2; passo++) {
        var apagar = [];
        for (y = 1; y < h - 1; y++) {
          for (x = 1; x < w - 1; x++) {
            i = y * w + x;
            if (!img[i]) continue;
            viz(img, x, y);
            var B = P[0] + P[1] + P[2] + P[3] + P[4] + P[5] + P[6] + P[7];
            if (B < 2 || B > 6) continue;
            var A = 0;
            for (var k = 0; k < 8; k++) if (!P[k] && P[(k + 1) & 7]) A++;
            if (A !== 1) continue;
            if (passo === 0) {
              if (P[0] && P[2] && P[4]) continue;
              if (P[2] && P[4] && P[6]) continue;
            } else {
              if (P[0] && P[2] && P[6]) continue;
              if (P[0] && P[4] && P[6]) continue;
            }
            apagar.push(i);
          }
        }
        if (apagar.length) { mudou = true; for (var m = 0; m < apagar.length; m++) img[apagar[m]] = 0; }
      }
    }
    return img;
  }

  /* ==================================================================
   * 5. RASTREIO — esqueleto vira polilinha
   * ================================================================== */
  var DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];

  /* GRAU = NÚMERO DE CRUZAMENTOS, não de vizinhos.
   *
   * Uma diagonal rasterizada é uma escada, e no degrau o pixel tem TRÊS
   * vizinhos — mas os três são um bloco contíguo, uma perna só. Contando
   * vizinho cru, cada degrau virava bifurcação: uma reta de 340 px saía
   * picada em 340 ramos de 1 px, todos descartados como espinho. A
   * diagonal inteira desaparecia da planta, calada.
   *
   * O crossing number conta as TRANSIÇÕES fundo→traço ao redor do pixel,
   * isto é, quantas pernas de fato saem dali. Escada = 2. Ponta = 1.
   * Encontro em T = 3. */
  function cruzamentos(sk, w, h, x, y) {
    var v = [0, 0, 0, 0, 0, 0, 0, 0], k, cru = 0, n = 0;
    for (k = 0; k < 8; k++) {
      var nx = x + DX[k], ny = y + DY[k];
      v[k] = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : (sk[ny * w + nx] ? 1 : 0);
      n += v[k];
    }
    if (!n) return 0;
    for (k = 0; k < 8; k++) if (!v[k] && v[(k + 1) & 7]) cru++;
    return cru;
  }

  function rastrear(sk, w, h, dist) {
    var g = new Uint8Array(w * h), x, y, i;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (sk[i]) g[i] = cruzamentos(sk, w, h, x, y);
    }
    var usado = new Uint8Array(w * h), ramos = [];

    /* Anda do nó (x0,y0) na direção k0 até o próximo nó.
       Não volta porque o caminho já andado está marcado — e é isso que
       resolve o degrau: no corte, o pixel de trás já é `usado`, e entre os
       candidatos que sobram escolhe o MAIS LONGE do anterior, que é o que
       segue a reta em vez de andar de lado. */
    function anda(x0, y0, k0) {
      var ci0 = (y0 + DY[k0]) * w + (x0 + DX[k0]);
      var pts = [[x0, y0]], raios = [dist[y0 * w + x0] / 3];
      var px = x0, py = y0, cx = x0 + DX[k0], cy = y0 + DY[k0];
      for (var passo = 0; passo < 400000; passo++) {
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) break;
        var ci = cy * w + cx;
        if (!sk[ci]) break;
        pts.push([cx, cy]); raios.push(dist[ci] / 3);
        /* nó: PARA e não marca — as outras pernas ainda saem daqui */
        if (g[ci] !== 2) break;
        usado[ci] = 1;
        var melhor = -1, dMax = -1, mx = 0, my = 0;
        for (var k = 0; k < 8; k++) {
          var nx = cx + DX[k], ny = cy + DY[k];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var ni = ny * w + nx;
          if (!sk[ni] || usado[ni]) continue;
          if (nx === px && ny === py) continue;
          var d = (nx - px) * (nx - px) + (ny - py) * (ny - py);
          if (d > dMax) { dMax = d; melhor = ni; mx = nx; my = ny; }
        }
        if (melhor < 0) break;
        px = cx; py = cy; cx = mx; cy = my;
      }
      return { pts: pts, raios: raios, ini: ci0 };
    }

    /* a partir de cada nó (ponta ou bifurcação) */
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!sk[i] || g[i] === 2) continue;
      usado[i] = 1;
      for (var k = 0; k < 8; k++) {
        var nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (!sk[ni] || usado[ni]) continue;
        ramos.push(anda(x, y, k));
      }
    }
    /* laço fechado puro (todo mundo com 2 cruzamentos): semeia em um */
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!sk[i] || usado[i] || g[i] !== 2) continue;
      usado[i] = 1;
      for (var k2 = 0; k2 < 8; k2++) {
        var ax = x + DX[k2], ay = y + DY[k2];
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        if (!sk[ay * w + ax] || usado[ay * w + ax]) continue;
        ramos.push(anda(x, y, k2));
        break;
      }
    }
    return ramos;
  }

  /* ==================================================================
   * 6. RAMSER-DOUGLAS-PEUCKER — absorve o tremor do traço à mão
   * ================================================================== */
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    var pilha = [[0, pts.length - 1]];
    while (pilha.length) {
      var seg = pilha.pop(), a = seg[0], b = seg[1];
      if (b - a < 2) continue;
      var ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
      var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
      var pior = -1, dMax = -1;
      for (var i = a + 1; i < b; i++) {
        var d;
        if (len < 1e-9) {
          d = Math.sqrt((pts[i][0] - ax) * (pts[i][0] - ax) + (pts[i][1] - ay) * (pts[i][1] - ay));
        } else {
          d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
        }
        if (d > dMax) { dMax = d; pior = i; }
      }
      if (dMax > eps) { keep[pior] = 1; pilha.push([a, pior]); pilha.push([pior, b]); }
    }
    var out = [];
    for (var k = 0; k < pts.length; k++) if (keep[k]) out.push(pts[k]);
    return out;
  }

  function mediana(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  /* ==================================================================
   * 7. ORIENTAÇÃO DOMINANTE E ORTOGONALIZAÇÃO
   * Sem histograma e sem bin: o campo de direção de uma planta tem
   * período de 90°, então a soma vetorial do ângulo QUÁDRUPLO dá o eixo
   * dominante de forma exata, ponderada por comprimento.
   * ================================================================== */
  function orientacaoDominante(segs) {
    var sx = 0, sy = 0, tot = 0;
    segs.forEach(function (s) {
      var dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-9) return;
      var th = Math.atan2(dy, dx);
      sx += L * Math.cos(4 * th); sy += L * Math.sin(4 * th); tot += L;
    });
    if (!tot) return { theta: 0, fracao: 0 };
    var th0 = Math.atan2(sy, sx) / 4;
    var dentro = 0;
    segs.forEach(function (s) {
      var dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-9) return;
      var d = Math.atan2(dy, dx) - th0;
      d = Math.abs(((d % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
      if (d > Math.PI / 4) d = Math.PI / 2 - d;
      if (d <= 4 * Math.PI / 180) dentro += L;
    });
    return { theta: th0, fracao: dentro / tot, comprimento: tot };
  }

  /* Só ortogonaliza se a planta REALMENTE for ortogonal. Abaixo de 60 %
     de aderência ela tem parede diagonal de projeto, e o snap destruiria
     o desenho. Reprojeta em torno do CENTRO, preservando comprimento:
     girar em torno da ponta transladaria a parede. */
  function ortogonalizar(segs, theta, tolGraus) {
    var tol = (tolGraus || 4) * Math.PI / 180, n = 0;
    var out = segs.map(function (s) {
      var dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-9) return s;
      var th = Math.atan2(dy, dx);
      var rel = th - theta;
      var k = Math.round(rel / (Math.PI / 2));
      var alvo = theta + k * (Math.PI / 2);
      var d = Math.abs(rel - k * (Math.PI / 2));
      if (d > tol) return s;
      n++;
      var cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
      var hx = Math.cos(alvo) * L / 2, hy = Math.sin(alvo) * L / 2;
      var o = {}; for (var kk in s) o[kk] = s[kk];
      o.x1 = cx - hx; o.y1 = cy - hy; o.x2 = cx + hx; o.y2 = cy + hy;
      return o;
    });
    return { segmentos: out, ajustados: n };
  }

  /* ==================================================================
   * O MOTOR
   * ================================================================== */
  var ImgPlanta = {
    /* raio de estimativa de fundo = 2 % do lado maior */
    FRACAO_RAIO: 0.02,
    ETA_MIN: 0.60,

    /* ----------------------------------------------------------------
     * processar({data,width,height}, opts)
     *
     * data: RGBA (Uint8ClampedArray de getImageData, ou Array comum)
     * opts:
     *   croqui        — true = traço à mão (tolerâncias mais largas)
     *   achatar       — false desliga a correção de iluminação (imagem
     *                   já limpa, tipo print de PDF)
     *   eps           — tolerância do RDP em px (padrão 1,5 / croqui 3,5)
     *   espGrossa     — acima deste raio (px) o traço é poché e o
     *                   esqueleto é o EIXO da parede (padrão 4)
     *   compMin       — descarta ramo menor que isto, em px (padrão 12)
     * ---------------------------------------------------------------- */
    processar: function (img, opts) {
      opts = opts || {};
      if (!img || !img.data || !(img.width > 0) || !(img.height > 0)) {
        return { ok: false, motivo: "Imagem inválida." };
      }
      var w = img.width | 0, h = img.height | 0;
      if (w * h > 4200000) {
        return { ok: false, motivo: "Imagem de " + w + "×" + h + " px é grande demais. " +
                 "Reduza para no máximo 2000 px no lado maior antes de processar." };
      }
      var croqui = !!opts.croqui;
      var avisos = [];

      /* --- cinza + iluminação --- */
      var g = cinza(img.data, w, h);
      var lado = w > h ? w : h;
      var usouAchatamento = false, raioUsado = 0;
      if (opts.achatar !== false) {
        /* O RAIO TEM DE PASSAR DA METADE DO TRAÇO MAIS GROSSO.
         *
         * Estimar o fundo pelo máximo local só vale se toda janela pegar
         * um pedaço de papel. Numa parede em POCHÉ — a planta impressa
         * mais comum — a janela inteira cai dentro da tinta, o "fundo"
         * vira a própria tinta e o miolo do traço é apagado: sobram duas
         * tirinhas, uma em cada face. Medido: uma parede de 15 cm virava
         * QUINZE paredes de 7 cm, com confiança 80 % e a tela dizendo
         * "6 de 6 paredes encontradas". Metade da espessura, o dobro da
         * contagem, cara de certo.
         *
         * E o estrago NÃO aparece na conta de tinta. Com raio 32 numa
         * parede de 66 px só as 2 linhas do miolo viram papel: 0,3 % de
         * tinta a menos — e a parede partida em duas. Área não denuncia
         * fio de cabelo; ESPESSURA denuncia. Então o motor MEDE o traço
         * mais grosso e exige raio maior que o meio-traço, para que toda
         * janela alcance papel.
         *
         * A régua dessa medida não pode ser um limiar global — numa foto
         * com sombra ele funde o lado escuro num borrão só e acusaria um
         * "traço" de meia imagem, recusando justo o achatamento que
         * conserta a sombra. Então a régua é BRADLEY, que compara cada
         * pixel com a vizinhança e por isso não enxerga sombra. */
        var jRef = Math.max(15, (Math.round(lado / 8) | 1));
        var refBin = bradley(g, w, h, integral(g, w, h), jRef, 0.15);
        var espRef = meioTracoMax(refBin, w, h);          /* meio-traço, em px */
        var r0 = Math.max(6, Math.round(this.FRACAO_RAIO * lado));
        var rNec = Math.ceil(espRef) + 3;                 /* +3: folga p/ a janela achar papel */
        var rTeto = Math.round(lado / 6);
        var raio = r0 > rNec ? r0 : rNec;
        if (raio <= rTeto) {
          var gA = achatar(g, w, h, raio);
          /* prova: depois de achatar, o traço tem de continuar com a
             espessura que o Bradley já tinha medido */
          var espA = meioTracoMax(limiarFixo(gA, otsu(gA).t), w, h);
          if (espA >= espRef * 0.85) {
            g = gA; raioUsado = raio; usouAchatamento = true;
            avisos.push("Iluminação achatada com raio de " + raio + " px" +
              (raio > r0 ? " (subi de " + r0 + " px: o traço mais grosso tem " +
                Math.round(espRef * 2) + " px e a janela precisa passar dele)" : "") + ".");
          } else {
            avisos.push("NÃO achatei a iluminação: com raio " + raio + " px o traço encolheu de " +
              Math.round(espRef * 2) + " px para " + Math.round(espA * 2) + " px. Sigo com a imagem crua; " +
              "se houver sombra forte, recorte só o desenho e tente de novo.");
          }
        } else {
          avisos.push("NÃO achatei a iluminação: o desenho tem área cheia de " + Math.round(espRef * 2) +
            " px (poché largo, carimbo sólido) e a correção precisaria de uma janela de " + (2 * rNec) +
            " px, maior que o próprio desenho comporta. Sigo com a imagem crua — o que exige foto sem sombra.");
        }
      }

      /* --- binarização, com o motivo à vista --- */
      var o = otsu(g), bin, metodo = "otsu", jan = 0;
      bin = limiarFixo(g, o.t);
      var ft = fracaoTinta(bin);
      if (o.eta < this.ETA_MIN || ft < 0.002 || ft > 0.35) {
        jan = Math.max(15, (Math.round(lado / 8) | 1));
        bin = bradley(g, w, h, integral(g, w, h), jan, 0.15);
        metodo = "bradley";
        ft = fracaoTinta(bin);
        avisos.push("O limiar global não separou papel de tinta (separabilidade " +
          (Math.round(o.eta * 100) / 100) + "); usei limiar adaptativo por janela de " + jan + " px.");
      }
      if (ft < 0.0005) return { ok: false, motivo: "Não achei traço nenhum na imagem. Confira o contraste e o recorte." };
      if (ft > 0.5) return { ok: false, motivo: "Metade da imagem virou traço (" + Math.round(ft * 100) +
        " %). Provavelmente é foto escura ou fundo colorido — clareie ou recorte só o desenho." };

      /* --- limpeza --- */
      var lp = limpar(bin, w, h, { minArea: croqui ? 8 : 12 });
      bin = lp.bin;

      /* O EXTERIOR DA IMAGEM É FUNDO.
         Sem isto, dois defeitos se somam numa parede colada na borda: a
         transformada de distância mede o raio só pelo lado de dentro (o
         de fora não existe), e o Zhang-Suen nunca toca a moldura de 1 px
         — então o esqueleto fica NA BORDA, justo onde o raio está mais
         inflado. Medido: parede de 14 px encostada em y=0 saía com
         espessura 28. O dobro de alvenaria, calado.
         Apagar 1 px da moldura resolve os dois e custa 1 px de parede. */
      for (var bx = 0; bx < w; bx++) { bin[bx] = 0; bin[(h - 1) * w + bx] = 0; }
      for (var by = 0; by < h; by++) { bin[by * w] = 0; bin[by * w + w - 1] = 0; }

      /* --- distância e esqueleto --- */
      var dist = distancia(bin, w, h);
      var sk = zhangSuen(bin, w, h);

      /* --- rastreio --- */
      var compMin = opts.compMin != null ? opts.compMin : 12;
      var eps = opts.eps != null ? opts.eps : (croqui ? 3.5 : 1.5);
      var espGrossa = opts.espGrossa != null ? opts.espGrossa : 4;
      var ramos = rastrear(sk, w, h, dist);

      var segmentos = [], diretas = [], nSpur = 0, nCurto = 0;
      ramos.forEach(function (r) {
        var pts = r.pts;
        if (pts.length < 2) return;
        /* comprimento poligonal real, antes de simplificar */
        var L = 0, i;
        for (i = 1; i < pts.length; i++) {
          L += Math.sqrt((pts[i][0] - pts[i - 1][0]) * (pts[i][0] - pts[i - 1][0]) +
                         (pts[i][1] - pts[i - 1][1]) * (pts[i][1] - pts[i - 1][1]));
        }
        var raio = mediana(r.raios);
        /* spur: ramo curtinho pendurado numa bifurcação — vira parede
           perpendicular fantasma se passar */
        if (L < Math.max(4, 1.2 * raio * 2)) { nSpur++; return; }
        if (L < compMin) { nCurto++; return; }

        var simp = rdp(pts, eps);
        for (i = 1; i < simp.length; i++) {
          var s = {
            x1: simp[i - 1][0], y1: simp[i - 1][1], x2: simp[i][0], y2: simp[i][1],
            layer: raio > espGrossa ? "eixo" : "face", raio: r3(raio)
          };
          var sl = Math.sqrt((s.x2 - s.x1) * (s.x2 - s.x1) + (s.y2 - s.y1) * (s.y2 - s.y1));
          if (sl < 2) continue;
          /* Traço grosso: o esqueleto É o eixo da parede, e a espessura
             sai do raio. Ele NÃO pode ir para o pareador de faces —
             seria contado duas vezes. */
          if (raio > espGrossa) diretas.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
                                               espessuraPx: r3(2 * raio), comprimentoPx: r3(sl) });
          else segmentos.push(s);
        }
      });

      /* --- ortogonalização, só se a planta for ortogonal --- */
      var ori = orientacaoDominante(segmentos.concat(diretas));
      var ortoAplicada = false, nAjust = 0;
      if (ori.fracao >= 0.60) {
        var oo = ortogonalizar(segmentos, ori.theta, croqui ? 12 : 4);
        segmentos = oo.segmentos; nAjust = oo.ajustados;
        var od = ortogonalizar(diretas, ori.theta, croqui ? 12 : 4);
        diretas = od.segmentos; nAjust += od.ajustados;
        ortoAplicada = true;
      } else {
        avisos.push("Só " + Math.round(ori.fracao * 100) + " % do traço segue um par de eixos perpendiculares — " +
          "esta planta tem parede diagonal, então NÃO alinhei nada. Alinhar destruiria o projeto.");
      }

      if (!segmentos.length && !diretas.length) {
        return { ok: false, motivo: "Achei traço, mas nenhuma linha com comprimento de parede. " +
          "Se for croqui de traço fino, marque a opção de croqui; se for foto, aproxime e recorte." };
      }

      return {
        ok: true,
        /* em PIXEL — quem converte para metro é a calibração */
        segmentos: segmentos,
        paredesDiretas: diretas,
        largura: w, altura: h,
        limiar: { metodo: metodo, valor: o.t, separabilidade: r3(o.eta), fracaoTinta: r3(ft), janela: jan },
        iluminacao: { achatada: usouAchatamento, raio: raioUsado },
        orientacao: { grausDominante: Math.round(ori.theta * 180 / Math.PI * 10) / 10,
                      aderencia: r3(ori.fracao), alinhada: ortoAplicada, ajustados: nAjust },
        stats: { ramos: ramos.length, segmentos: segmentos.length, diretas: diretas.length,
                 spur: nSpur, curtos: nCurto, componentes: lp.comps,
                 sujeiraRemovida: lp.sujeira, textoRemovido: lp.texto },
        avisos: avisos,
        escopo: "devolve PIXEL. Sem calibrar dois pontos com uma medida real, não há metro — e sem metro não há volumetria."
      };
    },

    /* ----------------------------------------------------------------
     * CALIBRAÇÃO — dois cliques e uma medida.
     *
     * A propagação de erro manda: σ_escala/escala ≈ σ_clique·√2 / d_px.
     * Com 2 px de imprecisão no clique, 1 % de erro exige 280 px de
     * distância. Por isso o motor RECUSA calibração curta em vez de
     * aceitar e devolver uma planta 5 % errada com cara de certa.
     * ---------------------------------------------------------------- */
    DIST_MIN_PX: 300,

    calibrar: function (p1, p2, metrosReais, opts) {
      opts = opts || {};
      var dx = num(p2.x) - num(p1.x), dy = num(p2.y) - num(p1.y);
      var d = Math.sqrt(dx * dx + dy * dy);
      var m = num(metrosReais);
      if (!(m > 0)) return { ok: false, motivo: "Informe a medida real, em metros." };
      var min = opts.distMin != null ? num(opts.distMin) : this.DIST_MIN_PX;
      if (d < min) {
        return { ok: false, motivo: "Os dois pontos estão a " + Math.round(d) + " px. Use uma medida MAIOR " +
          "(pelo menos " + min + " px na imagem): com " + Math.round(d) + " px, 2 px de erro no clique já " +
          "deslocam a escala em " + (Math.round(2 * Math.SQRT2 / d * 1000) / 10) + " %." };
      }
      /* O erro do clique é em PIXEL DE TELA, não de imagem. Uma foto de
         1600 px exibida em 700 px de modal: 2 px de dedo valem 4,6 px de
         imagem, e a incerteza real é o DOBRO da declarada. Quem chama
         informa `distTelaPx`; sem isso a conta cai na imagem, que é
         otimista — e o retorno diz isso. */
      var tela = opts.distTelaPx != null ? num(opts.distTelaPx) : 0;
      if (tela > 0 && tela < 300) {
        return { ok: false, motivo: "Os dois cliques ficaram a " + Math.round(tela) + " pixels de TELA. " +
          "Amplie o desenho ou use uma medida maior: assim perto, 2 px de erro no dedo mudam a escala em " +
          (Math.round(2 * Math.SQRT2 / tela * 1000) / 10) + " %." };
      }
      var pxPorMetro = d / m;
      var erroPct = Math.round(2 * Math.SQRT2 / (tela > 0 ? tela : d) * 1000) / 10;
      return {
        medidoNaTela: tela > 0,
        ok: true, pxPorMetro: r3(pxPorMetro), distanciaPx: Math.round(d), metros: m,
        erroEstimadoPct: erroPct,
        nota: "Escala " + Math.round(pxPorMetro) + " px/m, com incerteza de cerca de " + erroPct +
              " % vinda da precisão do clique. Toda medida da volumetria carrega essa incerteza."
      };
    },

    /* PIXEL → METRO. Y da imagem cresce para baixo; planta cresce para
       cima — então inverte, senão a volumetria sai espelhada. */
    paraMetros: function (res, pxPorMetro) {
      if (!res || !res.ok) return { ok: false, motivo: "Processe a imagem antes." };
      var k = num(pxPorMetro);
      if (!(k > 0)) return { ok: false, motivo: "Calibre a escala antes." };
      var H = res.altura;
      function cv(s) {
        var o = {};
        for (var kk in s) o[kk] = s[kk];
        o.x1 = r3(s.x1 / k); o.y1 = r3((H - s.y1) / k);
        o.x2 = r3(s.x2 / k); o.y2 = r3((H - s.y2) / k);
        return o;
      }
      return {
        ok: true,
        segmentos: res.segmentos.map(cv),
        paredesDiretas: res.paredesDiretas.map(function (p) {
          var o = cv(p);
          o.espessura = r3(p.espessuraPx / k);
          o.comprimento = r3(p.comprimentoPx / k);
          return o;
        }),
        pxPorMetro: r3(k)
      };
    },

    /* utilidades expostas para o teste e para quem quiser conferir */
    _int: { cinza: cinza, achatar: achatar, otsu: otsu, bradley: bradley, integral: integral,
            limiarFixo: limiarFixo, componentes: componentes, limpar: limpar,
            distancia: distancia, zhangSuen: zhangSuen, rastrear: rastrear, rdp: rdp,
            orientacaoDominante: orientacaoDominante, ortogonalizar: ortogonalizar,
            fracaoTinta: fracaoTinta, mediana: mediana }
  };

  global.ImgPlanta = ImgPlanta;
  if (typeof module !== "undefined" && module.exports) module.exports = ImgPlanta;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

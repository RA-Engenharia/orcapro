/* =====================================================================
 * pdfvetor.js — TRAÇOS VETORIAIS DE UM PDF → SEGMENTOS DE LINHA.
 *
 * Motor PURO (Node-testável, ES5). Não importa o pdf.js: recebe a lista
 * de operadores que o pdf.js já produziu e devolve linhas.
 *
 * ---------------------------------------------------------------------
 * POR QUE ESTE CAMINHO É O BOM
 * ---------------------------------------------------------------------
 * Uma prancha exportada do AutoCAD ou do Revit para PDF continua sendo
 * VETOR: a parede está lá como duas retas, com as coordenadas exatas.
 * Rasterizar essa página e caçar pixel seria jogar fora a informação e
 * depois tentar adivinhá-la de volta.
 *
 * Então o fluxo tem duas portas, e a boa é esta:
 *   PDF com vetor  → aqui. Precisão de projeto.
 *   PDF escaneado, foto, croqui → js/imgplanta.js. Precisão de foto.
 * Quem decide qual é o próprio arquivo: se a página não devolve traço
 * nenhum, ela é imagem, e o motor DIZ isso em vez de entregar vazio.
 *
 * Saída: os mesmos `segmentos:[{x1,y1,x2,y2,layer}]` que o
 * js/planta3d.js já consome — em PONTOS de PDF (1/72"), não em metro.
 * A escala do desenho (1:50, 1:100) não está no arquivo: quem resolve é
 * a calibração de dois pontos, igual à da imagem.
 *
 * Teste: node tools/test-pdfvetor.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }

  /* matriz do PDF: [a,b,c,d,e,f] — x' = a·x + c·y + e ; y' = b·x + d·y + f */
  function mult(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }
  function apl(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  /* escala média da matriz — para converter espessura de traço */
  function escalaDe(m) {
    var sx = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
    var sy = Math.sqrt(m[2] * m[2] + m[3] * m[3]);
    return (sx + sy) / 2;
  }

  var PdfVetor = {
    /* pedaços em que a curva de Bézier é quebrada. 8 basta: o arco de
       porta vira polilinha, e o pareador do planta3d.js o descarta
       sozinho por curvatura — que é o certo, arco não é parede. */
    PEDACOS_CURVA: 8,

    /* ----------------------------------------------------------------
     * segmentos(opList, OPS, opts)
     *
     * opList — { fnArray, argsArray } de page.getOperatorList()
     * OPS    — o mapa pdfjsLib.OPS. Vem de fora DE PROPÓSITO: os códigos
     *          numéricos mudam entre versões do pdf.js, e um número
     *          hardcodado quebraria calado numa atualização.
     * opts:
     *   base      — matriz inicial (use viewport.transform para já sair
     *               no referencial da página desenhada)
     *   compMin   — descarta traço menor que isto, em pontos (padrão 3)
     *   maxSeg    — teto de segurança (padrão 120000)
     * ---------------------------------------------------------------- */
    segmentos: function (opList, OPS, opts) {
      opts = opts || {};
      if (!opList || !opList.fnArray || !opList.argsArray) {
        return { ok: false, motivo: "Lista de operadores inválida." };
      }
      if (!OPS || OPS.constructPath == null) {
        return { ok: false, motivo: "Mapa de operadores do pdf.js não recebido." };
      }
      var fn = opList.fnArray, ar = opList.argsArray;
      var compMin = opts.compMin != null ? num(opts.compMin) : 3;
      var maxSeg = opts.maxSeg != null ? num(opts.maxSeg) : 120000;

      var ctm = opts.base ? opts.base.slice() : [1, 0, 0, 1, 0, 0];
      var pilha = [], segs = [], larg = 1;
      var nPath = 0, nCurva = 0, nRet = 0, nForm = 0, estourou = false;

      function bota(x1, y1, x2, y2, esc) {
        if (segs.length >= maxSeg) { estourou = true; return; }
        var dx = x2 - x1, dy = y2 - y1;
        if (dx * dx + dy * dy < compMin * compMin) return;
        segs.push({ x1: r3(x1), y1: r3(y1), x2: r3(x2), y2: r3(y2),
                    layer: "pdf", largura: r3(larg * esc) });
      }

      for (var i = 0; i < fn.length && !estourou; i++) {
        var op = fn[i], a = ar[i];
        if (op === OPS.save) { pilha.push(ctm.slice()); continue; }
        if (op === OPS.restore) { if (pilha.length) ctm = pilha.pop(); continue; }
        if (op === OPS.transform) { ctm = mult(ctm, a); continue; }
        if (op === OPS.setLineWidth) { larg = num(a[0]); continue; }
        /* FORM XOBJECT — como o Revit e o AutoCAD empacotam camada.
           O pdf.js abre o form com a MATRIZ PRÓPRIA dele e fecha depois;
           quem ignora os dois perde a matriz (a geometria da camada sai
           deslocada e fora de escala) E deixa o `cm` de dentro vazar para
           o resto da página, entortando tudo que vem depois. */
        if (OPS.paintFormXObjectBegin != null && op === OPS.paintFormXObjectBegin) {
          pilha.push(ctm.slice());
          if (a && a[0] && a[0].length === 6) ctm = mult(ctm, a[0]);
          nForm++; continue;
        }
        if (OPS.paintFormXObjectEnd != null && op === OPS.paintFormXObjectEnd) {
          if (pilha.length) ctm = pilha.pop();
          continue;
        }
        if (OPS.beginGroup != null && op === OPS.beginGroup) {
          pilha.push(ctm.slice());
          if (a && a[0] && a[0].matrix && a[0].matrix.length === 6) ctm = mult(ctm, a[0].matrix);
          continue;
        }
        if (OPS.endGroup != null && op === OPS.endGroup) {
          if (pilha.length) ctm = pilha.pop();
          continue;
        }
        if (op !== OPS.constructPath) continue;

        nPath++;
        var subs = a[0], args = a[1] || [], p = 0;
        var esc = escalaDe(ctm);
        var cx = 0, cy = 0, ix = 0, iy = 0, temAtual = false;

        for (var k = 0; k < subs.length; k++) {
          var s = subs[k];
          if (s === OPS.moveTo) {
            var m1 = apl(ctm, num(args[p]), num(args[p + 1])); p += 2;
            cx = m1[0]; cy = m1[1]; ix = cx; iy = cy; temAtual = true;
          } else if (s === OPS.lineTo) {
            var l1 = apl(ctm, num(args[p]), num(args[p + 1])); p += 2;
            if (temAtual) bota(cx, cy, l1[0], l1[1], esc);
            cx = l1[0]; cy = l1[1]; temAtual = true;
          } else if (s === OPS.curveTo || s === OPS.curveTo2 || s === OPS.curveTo3) {
            /* curveTo2 e curveTo3 são a cúbica com um dos controles
               coincidindo com a ponta — reconstruo os quatro pontos para
               ter um caminho só, senão o arco de porta vira reta */
            var q0x = cx, q0y = cy, c1, c2, fim2;
            if (s === OPS.curveTo) {
              c1 = apl(ctm, num(args[p]), num(args[p + 1]));
              c2 = apl(ctm, num(args[p + 2]), num(args[p + 3]));
              fim2 = apl(ctm, num(args[p + 4]), num(args[p + 5])); p += 6;
            } else if (s === OPS.curveTo2) {
              c1 = [q0x, q0y];
              c2 = apl(ctm, num(args[p]), num(args[p + 1]));
              fim2 = apl(ctm, num(args[p + 2]), num(args[p + 3])); p += 4;
            } else {
              c1 = apl(ctm, num(args[p]), num(args[p + 1]));
              fim2 = apl(ctm, num(args[p + 2]), num(args[p + 3])); p += 4;
              c2 = [fim2[0], fim2[1]];
            }
            nCurva++;
            var px = q0x, py = q0y;
            for (var t = 1; t <= this.PEDACOS_CURVA; t++) {
              var u = t / this.PEDACOS_CURVA, v = 1 - u;
              var bx = v * v * v * q0x + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * fim2[0];
              var by = v * v * v * q0y + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * fim2[1];
              bota(px, py, bx, by, esc);
              px = bx; py = by;
            }
            cx = fim2[0]; cy = fim2[1]; temAtual = true;
          } else if (s === OPS.closePath) {
            if (temAtual) bota(cx, cy, ix, iy, esc);
            cx = ix; cy = iy;
          } else if (s === OPS.rectangle) {
            var rx = num(args[p]), ry = num(args[p + 1]), rw = num(args[p + 2]), rh = num(args[p + 3]); p += 4;
            var A = apl(ctm, rx, ry), B = apl(ctm, rx + rw, ry),
                C = apl(ctm, rx + rw, ry + rh), D = apl(ctm, rx, ry + rh);
            bota(A[0], A[1], B[0], B[1], esc); bota(B[0], B[1], C[0], C[1], esc);
            bota(C[0], C[1], D[0], D[1], esc); bota(D[0], D[1], A[0], A[1], esc);
            cx = A[0]; cy = A[1]; ix = cx; iy = cy; temAtual = true;
            nRet++;
          } else {
            /* sub-operador que não conheço: para de consumir args deste
               caminho, senão o cursor desalinha e TODO o resto do desenho
               sai deslocado — erro que ninguém veria até a planta ficar
               torta */
            break;
          }
        }
      }

      if (!segs.length) {
        return { ok: false, semVetor: true,
          motivo: "Esta página não tem traço vetorial — é imagem (PDF escaneado ou foto colada). " +
                  "Use o caminho de imagem: rasterize a página e processe como foto." };
      }

      return {
        ok: true, segmentos: segs,
        unidade: "ponto de PDF (1/72 pol)",
        stats: { caminhos: nPath, segmentos: segs.length, curvas: nCurva, retangulos: nRet,
                 formsXObject: nForm, estourou: estourou },
        escopo: "a ESCALA do desenho (1:50, 1:100) não está no arquivo — sem calibrar dois pontos " +
                "com uma medida real, não há metro."
      };
    },

    /* ----------------------------------------------------------------
     * Descarta a MOLDURA e o CARIMBO da prancha.
     *
     * Toda prancha tem uma margem retangular e um carimbo no canto. Eles
     * pareiam bonito como "parede" — duas paralelas a 1 cm de distância —
     * e entram na volumetria como parede fantasma de 30 m.
     * A regra é geométrica: fora do miolo do desenho, e comprido demais
     * para ser parede.
     * ---------------------------------------------------------------- */
    tirarMoldura: function (segs, opts) {
      opts = opts || {};
      if (!segs || !segs.length) return { segmentos: [], removidos: 0 };
      var x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18;
      segs.forEach(function (s) {
        x0 = Math.min(x0, s.x1, s.x2); x1 = Math.max(x1, s.x1, s.x2);
        y0 = Math.min(y0, s.y1, s.y2); y1 = Math.max(y1, s.y1, s.y2);
      });
      var L = x1 - x0, C = y1 - y0;
      var margem = opts.margem != null ? num(opts.margem) : 0.02;   /* 2 % da folha */
      var mx = L * margem, my = C * margem;
      var longo = opts.fracaoLonga != null ? num(opts.fracaoLonga) : 0.85;
      var n = 0;
      var out = segs.filter(function (s) {
        var comp = Math.sqrt((s.x2 - s.x1) * (s.x2 - s.x1) + (s.y2 - s.y1) * (s.y2 - s.y1));
        /* "Estar na borda" NÃO basta: a parede externa da planta está na
           borda por definição, e o filtro comia justamente ela — a mais
           importante do orçamento. Moldura de prancha é outra coisa: é
           uma linha que ATRAVESSA a folha de ponta a ponta. Então as
           duas condições valem JUNTAS, nunca sozinhas. */
        var naBorda =
          (s.x1 < x0 + mx && s.x2 < x0 + mx) || (s.x1 > x1 - mx && s.x2 > x1 - mx) ||
          (s.y1 < y0 + my && s.y2 < y0 + my) || (s.y1 > y1 - my && s.y2 > y1 - my);
        /* e "atravessar" mede-se no EIXO DO PRÓPRIO TRAÇO: a linha
           vertical da moldura atravessa a ALTURA da folha, não a
           largura. Comparar sempre com a maior dimensão deixava metade
           da moldura passar. */
        var horiz = Math.abs(s.x2 - s.x1) >= Math.abs(s.y2 - s.y1);
        var atravessa = comp > longo * (horiz ? L : C);
        if (naBorda && atravessa) { n++; return false; }
        return true;
      });
      /* TRAVA: quando o desenho OCUPA a folha inteira — planta exportada
         sem carimbo, recorte já feito — o próprio contorno da planta cai
         na regra de "está na borda" e o filtro come tudo. Se sobrar
         pouco, a hipótese de moldura estava errada: devolve intacto e
         diz. Apagar a planta achando que é moldura é o pior desfecho
         possível, e seria silencioso. */
      /* HONESTIDADE SOBRE O LIMITE DESTA HEURÍSTICA.
         Geometria sozinha NÃO distingue "quadro da prancha" de "parede
         externa da planta desenhada até a margem": as duas são linhas
         compridas na borda. Quando a suspeita pega mais da metade do
         desenho, é quase certo que pegou a planta — e apagar a parede
         externa é o pior erro possível, porque é a mais cara do
         orçamento e some sem ninguém ver.
         Por isso este método PROPÕE. Quem decide é a tela, e a saída de
         verdade é o RECORTE: o usuário marca a região da planta e o
         resto da prancha nem entra. */
      /* A PROVA da hipótese de moldura: se o que sobrou continua ocupando
         a folha inteira, o que saiu não era moldura — era a planta.
         Contar traços não decide (numa prancha o quadro pode ter tantas
         linhas quanto a planta); o que decide é SOBRAR ALGO NO MIOLO. */
      var suspeito = true;
      if (out.length) {
        var sx0 = 1e18, sx1 = -1e18, sy0 = 1e18, sy1 = -1e18;
        out.forEach(function (s) {
          sx0 = Math.min(sx0, s.x1, s.x2); sx1 = Math.max(sx1, s.x1, s.x2);
          sy0 = Math.min(sy0, s.y1, s.y2); sy1 = Math.max(sy1, s.y1, s.y2);
        });
        var fx = L > 0 ? (sx1 - sx0) / L : 1, fy = C > 0 ? (sy1 - sy0) / C : 1;
        suspeito = (fx > 0.7 && fy > 0.7);
      }
      return {
        segmentos: suspeito ? segs : out,
        removidos: suspeito ? 0 : n,
        candidatos: n, suspeito: suspeito,
        folha: { x0: r3(x0), y0: r3(y0), largura: r3(L), altura: r3(C) },
        nota: suspeito
          ? "Não tirei nada: " + n + " de " + segs.length + " traços pareceram moldura, o que quer dizer " +
            "que o desenho ocupa a folha toda. Geometria não distingue quadro de prancha da parede " +
            "externa da planta — recorte a região da planta em vez de confiar num palpite."
          : (n ? n + " traço(s) descartado(s) como moldura ou carimbo da prancha." : "")
      };
    },

    /* PONTO → METRO.
     *
     * ARMADILHA QUE ME PEGOU: no espaço de usuário do PDF o Y cresce para
     * cima, igual ao da planta — e por isso eu escrevi aqui que não se
     * inverte nada. Só que ninguém usa o espaço cru: o extrator recebe
     * `base: viewport.transform`, que é [1,0,0,-1,0,altura] — a matriz que
     * o pdf.js usa para desenhar no canvas, onde o Y cresce para BAIXO.
     * Sem desfazer, a volumetria saía ESPELHADA, com o desenho de revisão
     * mostrando certo. Errado com cara de certo, que é o pior desfecho.
     *
     * `alturaPagina` (em pontos) é o que desfaz. Quem passar `base` cru
     * não informa altura, e aí realmente não se inverte nada. */
    paraMetros: function (segs, ptPorMetro, opts) {
      opts = opts || {};
      var k = num(ptPorMetro);
      if (!(k > 0)) return { ok: false, motivo: "Calibre a escala antes." };
      var H = num(opts.alturaPagina);
      function fy(y) { return H > 0 ? (H - y) / k : y / k; }
      return {
        ok: true, ptPorMetro: r3(k), invertido: H > 0,
        segmentos: segs.map(function (s) {
          var o = {}; for (var kk in s) o[kk] = s[kk];
          o.x1 = r3(s.x1 / k); o.y1 = r3(fy(s.y1));
          o.x2 = r3(s.x2 / k); o.y2 = r3(fy(s.y2));
          return o;
        })
      };
    },

    calibrar: function (p1, p2, metrosReais, opts) {
      var dx = num(p2.x) - num(p1.x), dy = num(p2.y) - num(p1.y);
      var d = Math.sqrt(dx * dx + dy * dy), m = num(metrosReais);
      if (!(m > 0)) return { ok: false, motivo: "Informe a medida real, em metros." };
      /* 20 pt era folga demais: numa prancha A1 (2384 pt) exibida em 700
         px de tela, 20 pt são SEIS pixels — dá para "calibrar" com dois
         cliques praticamente no mesmo lugar e sair com escala qualquer.
         A régua é a mesma da imagem: o erro do clique tem de ficar
         abaixo de 1 %. */
      /* O que limita a precisão NÃO é o ponto de PDF: é o CLIQUE. O
         usuário aponta num canvas de algumas centenas de pixels, e é a
         distância NA TELA que manda. Quem chama informa `distTelaPx`; o
         piso em pontos fica só como sanidade (dois cliques no mesmo
         lugar). */
      var min = opts && opts.distMin != null ? num(opts.distMin) : 60;
      if (d < min) {
        return { ok: false, motivo: "Os dois pontos estão a " + Math.round(d) + " pontos do desenho — " +
          "praticamente juntos. Use uma medida maior." };
      }
      var tela = opts && opts.distTelaPx != null ? num(opts.distTelaPx) : 0;
      if (tela > 0 && tela < 300) {
        return { ok: false, motivo: "Os dois cliques ficaram a " + Math.round(tela) + " pixels de tela. " +
          "Use uma medida MAIOR (pelo menos 300 px na tela): assim perto, 2 px de erro no clique já mudam " +
          "a escala em " + (Math.round(2 * Math.SQRT2 / tela * 1000) / 10) + " %." };
      }
      var k = d / m;
      /* No vetor não há erro de clique se o usuário casar em vértice: a
         escala costuma sair num valor redondo. Reconhecer isso dá ao
         engenheiro a confirmação que ele procura. */
      var comuns = [{ e: 20, r: "1:20" }, { e: 25, r: "1:25" }, { e: 50, r: "1:50" },
                    { e: 75, r: "1:75" }, { e: 100, r: "1:100" }, { e: 125, r: "1:125" },
                    { e: 200, r: "1:200" }, { e: 250, r: "1:250" }];
      var achou = null;
      comuns.forEach(function (c) {
        /* pt por metro numa escala 1:N = 1000/N mm por metro em pontos:
           1 m real = 1000/N mm no papel = (1000/N)/25.4*72 pontos */
        var esperado = (1000 / c.e) / 25.4 * 72;
        if (Math.abs(k - esperado) / esperado < 0.02) achou = c.r;
      });
      return { ok: true, ptPorMetro: r3(k), distanciaPt: r3(d), metros: m,
               escalaProvavel: achou,
               /* a incerteza vem da TELA, que é onde o dedo erra */
               erroEstimadoPct: tela > 0 ? Math.round(2 * Math.SQRT2 / tela * 1000) / 10 : null,
               nota: achou ? "Bate com a escala " + achou + " — o desenho está em escala padrão."
                           : "Escala fora dos valores padrão. Confira a medida que você usou." };
    },

    _int: { mult: mult, apl: apl, escalaDe: escalaDe }
  };

  global.PdfVetor = PdfVetor;
  if (typeof module !== "undefined" && module.exports) module.exports = PdfVetor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

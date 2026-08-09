/* =====================================================================
 * paginacao.js — PAGINAÇÃO DE PISO E REVESTIMENTO.
 *
 * Motor PURO (Node-testável, ES5). Nada de DOM, nada de three.js.
 *
 * ---------------------------------------------------------------------
 * O QUE ESTE ARQUIVO RESOLVE
 * ---------------------------------------------------------------------
 * Paginar é decidir ONDE começa a primeira peça. Quem decide isso na
 * obra é o assentador, no olho, e o erro clássico é o mesmo sempre: a
 * peça começa cheia na porta e termina numa tira de 3 cm na parede do
 * fundo. A "bolacha" — o recorte fino — é feia, quebra na hora de
 * cortar, descola com o tempo e é a primeira coisa que o cliente vê.
 *
 * Aqui a decisão sai calculada: o motor varre os pontos de partida
 * possíveis e escolhe o que MAXIMIZA o menor recorte. E mostra as três
 * saídas lado a lado, com número, para o usuário escolher:
 *   · CANTO        — peça inteira num canto (o que todo mundo faz)
 *   · CENTRALIZADA — sobra dividida igual nos dois lados
 *   · OTIMIZADA    — a varredura, que quase sempre ganha das duas
 *
 * ---------------------------------------------------------------------
 * DE ONDE VÊM OS NÚMEROS
 * ---------------------------------------------------------------------
 * · Geometria: recorte de polígono (Sutherland–Hodgman). Cada peça é a
 *   interseção da célula da grade com o contorno do ambiente. Vale para
 *   ambiente em L, para 45° e para vão de porta — uma conta só.
 * · Rejunte: volume da junta pela geometria —
 *      (a+b) · j · e / (a·b)  [m³ por m² de piso] × massa específica.
 *   Conferido contra ficha de fabricante: 60×60, junta 3 mm, peça de
 *   9 mm dá 0,14 kg/m², e a faixa publicada é 0,15–0,20 kg/m².
 * · Argamassa colante: consumo por tipo de desempeno é dado de
 *   fabricante (NBR 14081 padroniza o produto, não o consumo). Vem como
 *   FAIXA com a fonte à vista, nunca como número fechado inventado.
 * · Dupla colagem para peça com lado >= 60 cm: recomendação da NBR
 *   13753/13754 e das fichas técnicas. É AVISO, não conta automática.
 *
 * ---------------------------------------------------------------------
 * O QUE ESTE ARQUIVO NÃO FAZ (e diz que não faz)
 * ---------------------------------------------------------------------
 * · Não decide o desenho artístico da paginação (espinha de peixe,
 *   paginação em losango com peça de cor). Faz reto, amarração e 45°.
 * · O aproveitamento de recorte é uma ESTIMATIVA de bancada: assume que
 *   o assentador reusa o pedaço bom do outro lado. Quem não reusa compra
 *   mais — por isso os dois números aparecem, não só o otimista.
 *
 * Teste: node tools/test-paginacao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = String(v).trim();
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(s) || 0;
  }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }
  function r4(n) { return Math.round(num(n) * 10000) / 10000; }
  var EPS = 1e-9;
  /* Acima desta fração da peça, o que se corta fora vira LASCA: 3 mm de
     porcelanato não saem inteiros da serra, lascam a borda e gastam a
     peça toda. É a bolacha ao contrário, e o motor conta as duas. */
  var RENTE = 0.92;

  /* ==================================================================
   * GEOMETRIA — recorte de polígono
   * ================================================================== */

  /* área com sinal (shoelace). O sinal diz a orientação; quem quer área
     mede o módulo. */
  function areaAssinada(p) {
    var s = 0;
    for (var i = 0; i < p.length; i++) {
      var a = p[i], b = p[(i + 1) % p.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }
  function area(p) { return Math.abs(areaAssinada(p)); }

  function lado(A, B, P) { return (B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]); }

  function inter(S, E, A, B) {
    var dx1 = E[0] - S[0], dy1 = E[1] - S[1];
    var dx2 = B[0] - A[0], dy2 = B[1] - A[1];
    var den = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(den) < 1e-15) return [E[0], E[1]];
    var t = ((A[0] - S[0]) * dy2 - (A[1] - S[1]) * dx2) / den;
    return [S[0] + t * dx1, S[1] + t * dy1];
  }

  /* Sutherland–Hodgman. O SUJEITO pode ser côncavo (ambiente em L); o
     RECORTE tem que ser convexo — e é sempre um retângulo aqui. */
  function recortar(sujeito, convexo) {
    var out = sujeito.slice();
    for (var i = 0; i < convexo.length; i++) {
      if (!out.length) return [];
      var A = convexo[i], B = convexo[(i + 1) % convexo.length];
      var inp = out; out = [];
      var S = inp[inp.length - 1];
      for (var k = 0; k < inp.length; k++) {
        var E = inp[k];
        var eDentro = lado(A, B, E) >= -1e-12;
        var sDentro = lado(A, B, S) >= -1e-12;
        if (eDentro) {
          if (!sDentro) out.push(inter(S, E, A, B));
          out.push(E);
        } else if (sDentro) {
          out.push(inter(S, E, A, B));
        }
        S = E;
      }
    }
    return out;
  }

  /* retângulo em ordem anti-horária — o recorte exige convexo e orientado */
  function ret(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }

  function caixa(p) {
    if (!p || !p.length) return null;
    var x0 = p[0][0], x1 = x0, y0 = p[0][1], y1 = y0;
    for (var i = 1; i < p.length; i++) {
      if (p[i][0] < x0) x0 = p[i][0];
      if (p[i][0] > x1) x1 = p[i][0];
      if (p[i][1] < y0) y0 = p[i][1];
      if (p[i][1] > y1) y1 = p[i][1];
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1, l: x1 - x0, c: y1 - y0 };
  }

  function girar(p, rad, cx, cy) {
    var co = Math.cos(rad), si = Math.sin(rad);
    return p.map(function (q) {
      var dx = q[0] - cx, dy = q[1] - cy;
      return [cx + dx * co - dy * si, cy + dx * si + dy * co];
    });
  }

  /* garante anti-horário: o recorte assume essa orientação */
  function ccw(p) { return areaAssinada(p) < 0 ? p.slice().reverse() : p; }

  /* ------------------------------------------------------------------
   * UNIÃO DE VÃOS — área que um conjunto de retângulos cobre DENTRO de
   * um polígono, contando a sobreposição UMA vez só.
   *
   * Somar vão a vão parece inofensivo até dois se cruzarem: a porta-
   * balcão que encosta na janela, dois retângulos desenhados por cima do
   * mesmo pilar. A interseção descia duas vezes da área a revestir, e é
   * essa área que vai para a planilha em m², para o rejunte e para o
   * número de peças. Aqui a conta é exata: comprime as coordenadas, e
   * cada sub-retângulo entra uma vez, se estiver dentro de algum vão.
   * ------------------------------------------------------------------ */
  function uniaoVaos(poli, rects) {
    if (!rects || !rects.length) return 0;
    var xs = [], ys = [], i, k;
    for (i = 0; i < rects.length; i++) {
      xs.push(rects[i][0][0]); xs.push(rects[i][1][0]);
      ys.push(rects[i][0][1]); ys.push(rects[i][2][1]);
    }
    function nsort(a, b) { return a - b; }
    xs.sort(nsort); ys.sort(nsort);
    var total = 0;
    for (i = 0; i < xs.length - 1; i++) {
      var w = xs[i + 1] - xs[i];
      if (w <= 1e-9) continue;
      for (k = 0; k < ys.length - 1; k++) {
        var h = ys[k + 1] - ys[k];
        if (h <= 1e-9) continue;
        var cx = xs[i] + w / 2, cy = ys[k] + h / 2, dentro = false;
        for (var r = 0; r < rects.length; r++) {
          var R = rects[r];
          if (cx > R[0][0] && cx < R[1][0] && cy > R[0][1] && cy < R[2][1]) { dentro = true; break; }
        }
        if (!dentro) continue;
        var iv = recortar(poli, ret(xs[i], ys[k], w, h));
        if (iv.length >= 3) total += area(iv);
      }
    }
    return total;
  }

  /* ==================================================================
   * CATÁLOGO DE FORMATOS
   * Os formatos que o mercado brasileiro realmente vende. Servem de
   * atalho na tela; o usuário digita qualquer medida.
   * ================================================================== */
  var FORMATOS = [
    { id: "60x60",   rotulo: "60 × 60 cm",   l: 0.60,  c: 0.60,  esp: 0.009, junta: 0.002, uso: "porcelanato — o mais vendido" },
    { id: "80x80",   rotulo: "80 × 80 cm",   l: 0.80,  c: 0.80,  esp: 0.010, junta: 0.002, uso: "porcelanato grande formato" },
    { id: "120x120", rotulo: "120 × 120 cm", l: 1.20,  c: 1.20,  esp: 0.011, junta: 0.002, uso: "grande formato — exige dupla colagem" },
    { id: "20x120",  rotulo: "20 × 120 cm",  l: 0.20,  c: 1.20,  esp: 0.009, junta: 0.002, uso: "réguas amadeiradas" },
    { id: "15x90",   rotulo: "15 × 90 cm",   l: 0.15,  c: 0.90,  esp: 0.009, junta: 0.002, uso: "réguas amadeiradas estreitas" },
    { id: "45x45",   rotulo: "45 × 45 cm",   l: 0.45,  c: 0.45,  esp: 0.008, junta: 0.003, uso: "cerâmica de piso popular" },
    { id: "32x57",   rotulo: "32 × 57 cm",   l: 0.32,  c: 0.57,  esp: 0.007, junta: 0.003, uso: "azulejo de parede" },
    { id: "30x60",   rotulo: "30 × 60 cm",   l: 0.30,  c: 0.60,  esp: 0.008, junta: 0.002, uso: "revestimento de parede" },
    { id: "10x10",   rotulo: "10 × 10 cm",   l: 0.10,  c: 0.10,  esp: 0.006, junta: 0.003, uso: "pastilha / azulejo pequeno" }
  ];

  var ASSENTAMENTOS = [
    { id: "reto",      rotulo: "Reto (junta alinhada)", defasagem: 0,     angulo: 0,  nota: "Junta corrida nas duas direções. É o mais usado e o que mais denuncia parede fora de esquadro." },
    { id: "amarr-1-2", rotulo: "Amarração 1/2",         defasagem: 0.5,   angulo: 0,  nota: "Cada fiada desloca meia peça. Some o desalinho e é o padrão de régua amadeirada — mas em peça grande pode empenar a junta (efeito de arqueamento)." },
    { id: "amarr-1-3", rotulo: "Amarração 1/3",         defasagem: 1 / 3, angulo: 0,  nota: "Deslocamento de um terço. É o recomendado para peça acima de 60 cm, justamente por causa do arqueamento." },
    { id: "diagonal",  rotulo: "Diagonal 45°",          defasagem: 0,     angulo: 45, nota: "Grade girada 45°. Aumenta o recorte de borda (todo o perímetro vira triângulo) e o consumo — conte com perda maior." }
  ];

  /* Consumo de argamassa colante — DADO DE FABRICANTE, em faixa.
     A NBR 14081 padroniza o produto (AC-I, AC-II, AC-III), não o consumo:
     quem publica kg/m² é a ficha técnica de cada fábrica. */
  var COLANTE = [
    { id: "6mm",   rotulo: "Desempenadeira 6 mm",  min: 3.5, max: 5.0, uso: "peça até 30 × 30 cm, colagem simples" },
    { id: "8mm",   rotulo: "Desempenadeira 8 mm",  min: 4.5, max: 6.0, uso: "peça até 60 × 60 cm, colagem simples" },
    { id: "dupla", rotulo: "Dupla colagem",        min: 7.0, max: 9.0, uso: "peça com lado >= 60 cm, fachada e área externa" }
  ];
  var DENS_REJUNTE = 1600;   /* kg/m³ — rejunte cimentício; epóxi é outro produto */

  var Paginacao = {
    FORMATOS: FORMATOS,
    ASSENTAMENTOS: ASSENTAMENTOS,
    COLANTE: COLANTE,
    DENS_REJUNTE: DENS_REJUNTE,
    /* Abaixo disso o recorte é "bolacha": quebra ao cortar e descola.
       10 cm é o número para peça grande — mas ele NÃO pode ser fixo: numa
       pastilha de 10 × 10 todo recorte ficaria abaixo de 10 cm e o motor
       declarava bolacha em tudo, inclusive na única paginação possível.
       A régua real é proporcional: um terço da peça, limitado a 10 cm. */
    RECORTE_MIN: 0.10,
    recorteMinDe: function (pl, pc) {
      var menor = Math.min(num(pl), num(pc));
      if (!(menor > 0)) return this.RECORTE_MIN;
      return Math.min(this.RECORTE_MIN, Math.round(menor / 3 * 1000) / 1000);
    },
    SERRA: 0.003,

    formato: function (id) {
      for (var i = 0; i < FORMATOS.length; i++) if (FORMATOS[i].id === id) return FORMATOS[i];
      return null;
    },
    assentamento: function (id) {
      for (var i = 0; i < ASSENTAMENTOS.length; i++) if (ASSENTAMENTOS[i].id === id) return ASSENTAMENTOS[i];
      return null;
    },

    /* ----------------------------------------------------------------
     * PAGINAR — o coração.
     *
     * opts:
     *   largura, comprimento  — retângulo do ambiente (m); OU
     *   ambiente: [[x,y],...] — polígono qualquer (m), inclusive em L
     *   peca: {l, c}          — dimensão da peça em X e em Y (m)
     *   junta                 — largura da junta (m)
     *   assentamento          — id da lista acima
     *   offX, offY            — deslocamento da grade (m)
     *   vaos: [{x,y,l,c}]     — retângulos descontados (porta, pilar, vão)
     *   recorteMin            — abaixo disso é bolacha (m)
     * ---------------------------------------------------------------- */
    paginar: function (opts) {
      opts = opts || {};
      var amb = opts.ambiente;
      if (!amb || !amb.length) {
        var L = num(opts.largura), C = num(opts.comprimento);
        if (!(L > 0) || !(C > 0)) return { ok: false, motivo: "Informe largura e comprimento do ambiente." };
        amb = ret(0, 0, L, C);
      }
      amb = ccw(amb.map(function (p) { return [num(p[0]), num(p[1])]; }));
      var areaAmb = area(amb);
      if (!(areaAmb > 0)) return { ok: false, motivo: "O contorno do ambiente não fecha uma área." };

      var pe = opts.peca || {};
      var pl = num(pe.l), pc = num(pe.c);
      if (!(pl > 0) || !(pc > 0)) return { ok: false, motivo: "Informe as duas dimensões da peça." };

      var j = opts.junta != null ? num(opts.junta) : 0.003;
      if (j < 0) j = 0;
      var recMin = opts.recorteMin != null ? num(opts.recorteMin) : this.recorteMinDe(pl, pc);

      var asId = opts.assentamento || "reto";
      var as = this.assentamento(asId) || ASSENTAMENTOS[0];
      var defas = opts.defasagem != null ? num(opts.defasagem) : as.defasagem;
      var angGrau = opts.angulo != null ? num(opts.angulo) : as.angulo;
      var ang = angGrau * Math.PI / 180;

      var vaos = (opts.vaos || []).map(function (v) {
        return ret(num(v.x), num(v.y), num(v.l), num(v.c));
      });

      /* Tudo acontece no referencial DA GRADE: gira o ambiente por −θ,
         resolve com retângulos alinhados aos eixos, gira o resultado de
         volta. Uma conta só serve para reto, amarração e 45°. */
      var cb = caixa(amb);
      var cx = (cb.x0 + cb.x1) / 2, cy = (cb.y0 + cb.y1) / 2;
      var ambG = ang ? girar(amb, -ang, cx, cy) : amb;
      var cg = caixa(ambG);

      var mx = pl + j, my = pc + j;
      var offX = num(opts.offX), offY = num(opts.offY);

      var r0 = Math.floor((cg.y0 - offY) / my) - 1;
      var r1 = Math.ceil((cg.y1 - offY) / my) + 1;
      var kSpan = Math.ceil((cg.x1 - cg.x0) / mx) + 3;
      /* trava de sanidade: peça minúscula em ambiente grande geraria
         milhões de células e travaria o navegador */
      var estim = (r1 - r0 + 1) * (kSpan + 2);
      if (estim > 60000) {
        return { ok: false, motivo: "São " + Math.round(estim / 1000) + " mil peças nesse ambiente — confira a dimensão da peça (está em metros)." };
      }

      var pecas = [], inteiras = 0, recortes = 0, bolachas = 0, rentes = 0;
      var areaAssentada = 0, menorRecorte = Infinity, areaCel = pl * pc;
      var tolA = areaCel * 1e-4;

      for (var r = r0; r <= r1; r++) {
        var desl = defas ? (((r * defas) % 1) + 1) % 1 : 0;
        var baseX = offX + desl * mx;
        var k0 = Math.floor((cg.x0 - baseX) / mx) - 1;
        for (var k = k0; k <= k0 + kSpan; k++) {
          var x = baseX + k * mx, y = offY + r * my;
          var cel = ret(x, y, pl, pc);
          var pg = recortar(ambG, cel);
          if (pg.length < 3) continue;
          var aBruta = area(pg);
          if (aBruta <= tolA) continue;

          var pw = ang ? girar(pg, ang, cx, cy) : pg;

          /* vão descontado: a interseção com cada abertura sai da área.
             Aberturas sobrepostas contariam duas vezes — o motor avisa
             em vez de somar errado calado. */
          var aVao = vaos.length ? uniaoVaos(pw, vaos) : 0;
          if (aVao > aBruta) aVao = aBruta;
          var aLiq = aBruta - aVao;
          if (aLiq <= tolA) continue;      /* peça inteiramente dentro do vão: não existe */

          var bg = caixa(pg);
          var cortada = Math.abs(aBruta - areaCel) > tolA || aVao > tolA;
          var menorLado = Math.min(bg.l, bg.c);
          var bolacha = false, rente = false;
          if (cortada) {
            recortes++;
            /* recorte causado por ABERTURA é inevitável — não conta como
               bolacha, senão o otimizador passa a fugir das portas */
            if (aVao <= tolA && menorLado < recMin - 1e-6) { bolacha = true; bolachas++; }
            /* corte rente: sobrou quase a peça inteira, o que sai é lasca */
            if (aVao <= tolA && !bolacha &&
                ((bg.l > pl * RENTE && bg.l < pl - 1e-6) || (bg.c > pc * RENTE && bg.c < pc - 1e-6))) {
              rente = true; rentes++;
            }
            if (aVao <= tolA && menorLado < menorRecorte) menorRecorte = menorLado;
          } else {
            inteiras++;
          }
          areaAssentada += aLiq;

          pecas.push({
            i: pecas.length, linha: r, coluna: k,
            poli: pw.map(function (q) { return [r4(q[0]), r4(q[1])]; }),
            x: r4(x), y: r4(y),
            inteira: !cortada, bolacha: bolacha, rente: rente, comVao: aVao > tolA,
            corteL: r4(bg.l), corteC: r4(bg.c),
            area: r4(aLiq)
          });
        }
      }

      if (menorRecorte === Infinity) menorRecorte = null;

      /* larguras das faixas de borda — é o que o assentador olha */
      var bordas = this._bordas(cg, offX, offY, mx, my, pl, pc);

      /* TRÊS áreas, e confundi-las é o erro que infla ou enxuga o
         orçamento inteiro:
         · areaAmbiente — o piso, cru;
         · areaCoberta  — o piso menos os vãos. É ESTA que se mede no
           SINAPI, é sobre ela que se calcula colante e rejunte, e é ela
           que entra na planilha em m²;
         · areaCeramica — só a face das peças. É menor que a coberta
           porque a junta não é cerâmica. Serve para conferir o desenho,
           nunca para orçar. */
      var areaVaoTotal = uniaoVaos(amb, vaos);
      var somaSolta = 0;
      for (var vj = 0; vj < vaos.length; vj++) {
        var ivAmb = recortar(amb, vaos[vj]);
        if (ivAmb.length >= 3) somaSolta += area(ivAmb);
      }
      var avisosPag = [];
      if (somaSolta - areaVaoTotal > 1e-4) {
        avisosPag.push("Há vãos sobrepostos: " + (Math.round((somaSolta - areaVaoTotal) * 100) / 100) +
          " m² aparecem em mais de um. A área comum foi contada UMA vez — junte os vãos num só para o desenho ficar claro.");
      }
      var areaCoberta = Math.max(0, areaAmb - areaVaoTotal);

      return {
        ok: true,
        ambiente: amb, areaAmbiente: r4(areaAmb),
        areaVaos: r4(areaVaoTotal), areaCoberta: r4(areaCoberta),
        areaCeramica: r4(areaAssentada),
        /* nome antigo mantido para não quebrar quem já lia daqui */
        areaAssentada: r4(areaAssentada),
        peca: { l: r3(pl), c: r3(pc) }, junta: r4(j),
        assentamento: as.id, assentamentoRotulo: as.rotulo, notaAssentamento: as.nota,
        defasagem: defas, angulo: angGrau,
        offX: r4(offX), offY: r4(offY),
        pecas: pecas, total: pecas.length,
        inteiras: inteiras, recortes: recortes, bolachas: bolachas, rentes: rentes,
        menorRecorte: menorRecorte != null ? r3(menorRecorte) : null,
        recorteMin: r3(recMin), fracaoRente: RENTE,
        bordas: bordas,
        vaos: (opts.vaos || []).slice(),
        avisos: avisosPag
      };
    },

    /* ----------------------------------------------------------------
     * NOTA RÁPIDA — o atalho que faz a varredura caber num teclado.
     *
     * Pontua uma partida sem montar peça nenhuma: só as quatro faixas de
     * borda da caixa envolvente, que é o que decide a paginação. Usa os
     * MESMOS pesos da nota completa, para o ranking não divergir.
     * É aproximação para ambiente em L e para 45° — por isso os
     * finalistas ainda passam pelo motor de verdade.
     * ---------------------------------------------------------------- */
    _notaRapida: function (cg, offX, offY, mx, my, pl, pc, recMin) {
      var b = this._bordas(cg, offX, offY, mx, my, pl, pc);
      var faixas = [
        { v: b.x.inicio, p: pl }, { v: b.x.fim, p: pl },
        { v: b.y.inicio, p: pc }, { v: b.y.fim, p: pc }
      ];
      var menor = Math.min(pl, pc), bol = 0, ren = 0, i;
      for (i = 0; i < faixas.length; i++) {
        var v = faixas[i].v, p = faixas[i].p;
        if (v <= 1e-6) continue;                 /* borda fecha exata: sem recorte */
        if (v < recMin - 1e-6) bol++;
        else if (v > p * RENTE && v < p - 1e-6) ren++;
        if (v < menor) menor = v;
      }
      var assim = Math.abs(b.x.inicio - b.x.fim) + Math.abs(b.y.inicio - b.y.fim);
      var inteiras = Math.max(0, b.x.cheias) * Math.max(0, b.y.cheias);
      return menor * 1000 - bol * 10000 - ren * 10000 + inteiras * 0.5 - assim * 60;
    },

    /* ----------------------------------------------------------------
     * A FAIXA DE BORDA — a peça que o assentador vai cortar.
     *
     * Cuidado com uma junta: da última peça inteira até a parede há a
     * folga do MÓDULO, e a peça de borda é essa folga MENOS a junta.
     * Reportar a folga é errar por 2 ou 3 mm — pouco no papel, mas o
     * bastante para o motor chamar de "corte rente" um recorte que não
     * é, e recusar a melhor paginação por causa disso.
     * Devolve as duas medidas, com o nome de cada uma.
     * ---------------------------------------------------------------- */
    _bordas: function (cg, offX, offY, mx, my, pl, pc) {
      function faixa(min, max, off, m, p) {
        var j = m - p;
        var k0 = Math.ceil((min - off) / m - 1e-9);
        var kN = Math.floor((max - off - p) / m + 1e-9);
        if (kN < k0) return { inicio: r3(max - min), fim: 0, cheias: 0, folgaInicio: r3(max - min), folgaFim: 0 };
        var fi = off + k0 * m - min, ff = max - (off + kN * m + p);
        return {
          /* a PEÇA: a folga menos a junta, nunca negativa */
          inicio: r3(Math.max(0, fi - (fi > 1e-9 ? j : 0))),
          fim: r3(Math.max(0, ff - (ff > 1e-9 ? j : 0))),
          /* a FOLGA do módulo, para quem quiser conferir a conta */
          folgaInicio: r3(fi), folgaFim: r3(ff),
          cheias: kN - k0 + 1
        };
      }
      return {
        x: faixa(cg.x0, cg.x1, offX, mx, pl),
        y: faixa(cg.y0, cg.y1, offY, my, pc)
      };
    },

    /* ----------------------------------------------------------------
     * MELHOR PARTIDA — a varredura anti-bolacha.
     * Duas passadas: grosseira para achar a região, fina de 1 mm para
     * cravar. Devolve as TRÊS estratégias com número, não só a vencedora
     * — quem assenta às vezes prefere a peça inteira na porta.
     * ---------------------------------------------------------------- */
    melhorPartida: function (opts) {
      opts = opts || {};
      var self = this;
      var pe = opts.peca || {};
      var pl = num(pe.l), pc = num(pe.c);
      if (!(pl > 0) || !(pc > 0)) return { ok: false, motivo: "Informe as duas dimensões da peça." };
      var j = opts.junta != null ? num(opts.junta) : 0.003;
      var mx = pl + j, my = pc + j;
      var recMin = opts.recorteMin != null ? num(opts.recorteMin) : this.recorteMinDe(pl, pc);

      function rodar(ox, oy) {
        var o = {}; for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
        o.offX = ox; o.offY = oy;
        return self.paginar(o);
      }
      function nota(res) {
        if (!res || !res.ok) return -1e9;
        var menor = res.menorRecorte == null ? Math.min(pl, pc) : res.menorRecorte;
        var b = res.bordas || { x: { inicio: 0, fim: 0 }, y: { inicio: 0, fim: 0 } };
        var assim = Math.abs(b.x.inicio - b.x.fim) + Math.abs(b.y.inicio - b.y.fim);
        /* as duas bolachas pesam igual: o recorte fino e o corte rente.
           Sem a segunda, a varredura ADORA a borda de 59,7 cm — o maior
           "menor recorte" possível — e manda o assentador tirar 3 mm de
           cada peça de borda. */
        return menor * 1000 - res.bolachas * 10000 - (res.rentes || 0) * 10000 + res.inteiras * 0.5 - assim * 60;
      }

      /* 1) canto: peça inteira encostada no canto do ambiente */
      var base = rodar(0, 0);
      if (!base.ok) return base;
      var cbb = caixa(base.ambiente);
      var ang = base.angulo * Math.PI / 180;
      var cgb = ang ? caixa(girar(base.ambiente, -ang, (cbb.x0 + cbb.x1) / 2, (cbb.y0 + cbb.y1) / 2)) : cbb;
      var canto = rodar(cgb.x0, cgb.y0);

      /* 2) centralizada: sobra dividida igual nos dois lados.
         COM a regra de bancada do assentador — mas com os DOIS limites,
         não só um. A regra clássica é "nunca menos de meia peça na
         borda"; aplicada sozinha ela erra feio: num ambiente de 3,00 m
         com peça de 60 a borda dá 29,5 cm, um fio abaixo da metade, e a
         regra tira uma fileira e devolve borda de 59,7 cm — quer dizer,
         cortar 3 mm de uma peça de porcelanato. Ninguém faz isso: a
         lasca quebra, lasca a borda e gasta a peça inteira.
         Então há duas bolachas, não uma: o recorte fino (ruim de
         assentar) e o CORTE RENTE (impossível de fazer limpo). A nota
         de cada opção vale a borda, mas desconta para o corte rente. */
      function centro(min, max, m, p) {
        var vao = max - min;
        function borda(k) { return (vao - (k * p + (k - 1) * (m - p))) / 2; }
        function nota(b) { return b > p * RENTE ? (p - b) : b; }
        var n = Math.floor((vao + (m - p)) / m);
        if (n < 1) n = 1;
        if (n > 1 && nota(borda(n - 1)) > nota(borda(n))) n--;
        return min + borda(n);
      }
      var central = rodar(centro(cgb.x0, cgb.x1, mx, pl), centro(cgb.y0, cgb.y1, my, pc));

      /* 3) VARREDURA.
         A conta cara é montar as peças; a decisão só precisa das FAIXAS
         DE BORDA, que saem por aritmética da caixa envolvente. Então a
         varredura pontua no barato — centenas de candidatos em
         microssegundos — e só os finalistas passam pelo motor completo.
         Antes, cada tecla digitada disparava ~600 paginações inteiras:
         629 ms num galpão de 30 × 20 m, com a tela travando a cada
         dígito. Agora são sete paginações, sempre. */
      var passos = Math.max(12, Math.min(60, Math.round(mx / 0.005)));
      var passosY = Math.max(12, Math.min(60, Math.round(my / 0.005)));
      var cands = [];
      for (var a = 0; a < passos; a++) {
        for (var b = 0; b < passosY; b++) {
          var ox = cgb.x0 + (a / passos) * mx, oy = cgb.y0 + (b / passosY) * my;
          cands.push({ x: ox, y: oy, n: self._notaRapida(cgb, ox, oy, mx, my, pl, pc, recMin) });
        }
      }
      cands.sort(function (p, q) { return q.n - p.n; });

      /* Os finalistas passam pelo motor de verdade: em ambiente em L ou a
         45° a caixa envolvente é aproximação, e quem decide é a paginação
         completa — nunca o atalho. */
      var melhor = null, melhorNota = -Infinity;
      var FINALISTAS = 5;
      for (var f = 0; f < Math.min(FINALISTAS, cands.length); f++) {
        var rf = rodar(cands[f].x, cands[f].y), nf = nota(rf);
        if (nf > melhorNota) { melhorNota = nf; melhor = rf; }
      }

      var ops = [
        { id: "canto", rotulo: "Peça inteira no canto", res: canto, nota: nota(canto),
          quando: "Mais rápido de assentar e é o que o pedreiro faz sozinho. Só serve quando a sobra já cai grande." },
        { id: "central", rotulo: "Centralizada", res: central, nota: nota(central),
          quando: "Recorte igual dos dois lados. É a escolha de projeto quando o ambiente é visto de frente — banheiro, hall." },
        { id: "otimizada", rotulo: "Otimizada (menor recorte máximo)", res: melhor, nota: melhorNota,
          quando: "A varredura: empurra a grade até o menor recorte ficar o maior possível." }
      ].filter(function (o) { return o.res && o.res.ok; });

      ops.sort(function (a, b) { return b.nota - a.nota; });
      return { ok: true, escolhida: ops[0], opcoes: ops };
    },

    /* ----------------------------------------------------------------
     * QUANTITATIVO — quantas caixas comprar.
     *
     * Recorte NÃO é peça perdida por definição: o assentador tira o
     * outro lado do mesmo pedaço. Mas nem todo mundo faz isso, e quem
     * compra pelo número otimista fica sem material no meio da obra.
     * Por isso saem os DOIS números, com o nome de cada um.
     * ---------------------------------------------------------------- */
    quantitativo: function (res, opts) {
      opts = opts || {};
      if (!res || !res.ok) return { ok: false, motivo: "Pagine antes de contar." };
      var pl = res.peca.l, pc = res.peca.c, areaPeca = pl * pc;
      var serra = opts.serra != null ? num(opts.serra) : this.SERRA;
      var girar = !!opts.girarRecorte;
      var reserva = opts.reserva != null ? num(opts.reserva) : 0;

      /* agrupa os recortes por medida (5 mm de tolerância) */
      var grupos = {}, nRec = 0;
      res.pecas.forEach(function (p) {
        if (p.inteira) return;
        nRec++;
        /* 1 cm de tolerância, não 5 mm: as duas faixas de borda de um
           ambiente saem com 288 e 297 mm, e ninguém na bancada corta
           duas medidas diferentes por causa de 9 mm — corta 29 e pronto.
           Separar em dois grupos fazia o aproveitamento parecer inútil. */
        var a = Math.round(p.corteL * 100) / 100, b = Math.round(p.corteC * 100) / 100;
        var ch = a + "x" + b;
        if (!grupos[ch]) grupos[ch] = { l: a, c: b, qtd: 0 };
        grupos[ch].qtd++;
      });

      var lista = [], pecasParaRecorte = 0;
      for (var ch in grupos) {
        if (!Object.prototype.hasOwnProperty.call(grupos, ch)) continue;
        var g = grupos[ch];
        function cabem(w, h) {
          var nx = Math.floor((pl + serra) / (w + serra) + 1e-9);
          var ny = Math.floor((pc + serra) / (h + serra) + 1e-9);
          return Math.max(0, nx) * Math.max(0, ny);
        }
        var porPeca = cabem(g.l, g.c);
        if (girar) porPeca = Math.max(porPeca, cabem(g.c, g.l));
        if (porPeca < 1) porPeca = 1;
        var gasta = Math.ceil(g.qtd / porPeca);
        pecasParaRecorte += gasta;
        lista.push({
          l: r3(g.l), c: r3(g.c), qtd: g.qtd, porPeca: porPeca, pecas: gasta,
          rotulo: Math.round(g.l * 100) + " × " + Math.round(g.c * 100) + " cm"
        });
      }
      lista.sort(function (a, b) { return b.qtd - a.qtd; });

      var comAprov = res.inteiras + pecasParaRecorte;
      var semAprov = res.inteiras + nRec;
      function comReserva(n) { return Math.ceil(n * (1 + reserva / 100)); }

      /* PERDA — contra o quê?
         A caixa de piso é vendida em m² de FACE (0,60 × 0,60 = 0,36 m²
         por peça). A junta não é cerâmica: um piso de 12 m² com junta de
         3 mm precisa de ~11,88 m² de face. Medir a perda contra os 12 m²
         do piso devolve perda NEGATIVA num ambiente perfeitamente modular
         — "perda de −1 %", que não quer dizer nada e destrói a confiança
         no resto da tabela.
         A referência certa é a face REALMENTE ASSENTADA. Aí a perda é o
         que sobra da caixa: nunca negativa, e é o número que o lojista e
         o mestre de obras entendem. A área do piso continua ali ao lado,
         com o nome dela, porque é ela que vai para a planilha em m². */
      var areaCob = res.areaCoberta != null ? res.areaCoberta : res.areaAssentada;
      var areaCer = res.areaCeramica != null ? res.areaCeramica : res.areaAssentada;
      function perda(n) {
        if (!(areaCer > 0)) return 0;
        return Math.round((n * areaPeca - areaCer) / areaCer * 1000) / 10;
      }

      /* RODAPÉ: as tiras saem da MESMA peça de piso, e ninguém pede
         rodapé em separado quando ele é recortado do próprio porcelanato.
         Ficar fora da linha "peças a comprar" faz o pedido sair curto e
         o lote não bater — e lote diferente é tom diferente. */
      var rod = opts.rodape && opts.rodape.ok ? opts.rodape : null;
      var pecasRodape = 0;
      if (rod && rod.metros > 0 && rod.tirasPorPeca > 0) {
        var tirasNec = Math.ceil(rod.metros / Math.max(pl, pc));
        pecasRodape = Math.ceil(tirasNec / rod.tirasPorPeca);
      }

      return {
        ok: true,
        areaPeca: r4(areaPeca),
        /* os dois números, com o nome de cada um */
        areaCoberta: r4(areaCob), areaCeramica: r4(areaCer),
        areaLiquida: r4(areaCob),          /* nome antigo = área do piso */
        inteiras: res.inteiras, recortes: nRec,
        rodapePecas: pecasRodape,
        comAproveitamento: { pecas: comReserva(comAprov) + pecasRodape, piso: comReserva(comAprov),
          m2: r3((comReserva(comAprov) + pecasRodape) * areaPeca), perdaPct: perda(comReserva(comAprov)),
          rotulo: "com aproveitamento de recorte", nota: "assume que o assentador tira o outro lado do mesmo pedaço — é estimativa de bancada, não garantia" },
        semAproveitamento: { pecas: comReserva(semAprov) + pecasRodape, piso: comReserva(semAprov),
          m2: r3((comReserva(semAprov) + pecasRodape) * areaPeca), perdaPct: perda(comReserva(semAprov)),
          rotulo: "cada recorte gasta uma peça", nota: "é o número seguro para comprar; sobra material, não falta" },
        reservaPct: reserva,
        grupos: lista,
        serra: r3(serra),
        notaPerda: "a perda é medida contra a cerâmica assentada (" + r3(areaCer) +
          " m² de face), não contra o piso (" + r3(areaCob) + " m²): a junta não é cerâmica"
      };
    },

    /* ---- rejunte: geometria da junta, não chute -------------------- */
    rejunte: function (res, opts) {
      opts = opts || {};
      if (!res || !res.ok) return { ok: false, motivo: "Pagine antes de contar." };
      var pl = res.peca.l, pc = res.peca.c, j = res.junta;
      var esp = opts.espessura != null ? num(opts.espessura) : 0.009;
      var dens = opts.densidade != null ? num(opts.densidade) : DENS_REJUNTE;
      if (!(j > 0)) return { ok: true, kgM2: 0, kg: 0, nota: "Junta zero: assentamento sem rejunte (junta seca)." };
      var volM2 = (pl + pc) * j * esp / (pl * pc);      /* m³ por m² */
      var kgM2 = volM2 * dens;
      var A = res.areaCoberta != null ? res.areaCoberta : res.areaAssentada;
      return {
        ok: true,
        kgM2: Math.round(kgM2 * 1000) / 1000,
        kg: Math.round(kgM2 * A * 100) / 100,
        volumeM3: r4(volM2 * A),
        espessura: r3(esp), junta: r4(j), densidade: dens,
        formula: "(a + b) × junta × espessura ÷ (a × b) × massa específica",
        nota: "Volume geométrico da junta. Fabricante costuma publicar de 10 a 20 % a mais, por causa da perda de aplicação e do enchimento acima do topo do rebaixo."
      };
    },

    /* ---- argamassa colante: faixa de fabricante, com o aviso certo -- */
    colante: function (res, opts) {
      opts = opts || {};
      if (!res || !res.ok) return { ok: false, motivo: "Pagine antes de contar." };
      var maior = Math.max(res.peca.l, res.peca.c);
      var externo = !!opts.externo;
      /* porcelanato: a junta fina do catálogo é o indício, mas quem diz é
         o usuário — por isso é opção, com um padrão explicável */
      var porcelanato = opts.porcelanato != null ? !!opts.porcelanato : (maior >= 0.45 && res.junta <= 0.0035);
      var sugerido = maior >= 0.60 ? "dupla" : (maior > 0.30 ? "8mm" : "6mm");
      var id = opts.tipo || sugerido;
      var t = null;
      for (var i = 0; i < COLANTE.length; i++) if (COLANTE[i].id === id) t = COLANTE[i];
      if (!t) t = COLANTE[1];
      var A = res.areaCoberta != null ? res.areaCoberta : res.areaAssentada;
      /* A CLASSE da argamassa (NBR 14081), que faltava.
         Dizer só "5 kg/m²" e não dizer QUAL argamassa deixa o item de
         orçamento com preço 2 a 3 vezes errado — AC-III custa muito mais
         que AC-I — e, pior, deixa o assentador comprar a errada. A regra
         é da absorção da peça e de onde ela vai: porcelanato (absorção
         <= 0,5 %, grupo BIa da NBR ISO 13006) não "bebe" a água da
         argamassa, e por isso precisa de aderência maior. */
      var classe = "AC-I", porqueClasse = "cerâmica de absorção normal, em área interna seca";
      if (externo) { classe = "AC-III"; porqueClasse = "área externa, fachada ou piso sobre piso — exposição a sol, chuva e movimentação"; }
      else if (maior >= 0.60) { classe = "AC-III"; porqueClasse = "peça de grande formato (" + Math.round(maior * 100) + " cm): o peso próprio exige aderência de AC-III"; }
      else if (porcelanato) { classe = "AC-II"; porqueClasse = "porcelanato (absorção <= 0,5 %) não absorve a água da argamassa — AC-I não adere"; }
      else if (opts.areaUmida) { classe = "AC-II"; porqueClasse = "área molhada (box, cozinha, área de serviço)"; }

      return {
        ok: true, tipo: t.id, rotulo: t.rotulo, uso: t.uso,
        classe: classe, porqueClasse: porqueClasse,
        classeFonte: "NBR 14081 classifica AC-I, AC-II e AC-III pela aderência. O enquadramento da PEÇA " +
          "(absorção, grupo da NBR ISO 13006) vem da caixa — confira antes de fechar o preço.",
        kgM2Min: t.min, kgM2Max: t.max,
        kgMin: Math.round(t.min * A * 10) / 10, kgMax: Math.round(t.max * A * 10) / 10,
        sacosMin: Math.ceil(t.min * A / 20), sacosMax: Math.ceil(t.max * A / 20),
        sugerido: sugerido, sugeridoAplicado: id === sugerido,
        aviso: maior >= 0.60
          ? "Peça com lado de " + Math.round(maior * 100) + " cm: a recomendação de fabricante e das NBR 13753/13754 é DUPLA COLAGEM — argamassa também no verso da peça. Sem isso o índice de contato não fecha e a peça descola."
          : "",
        fonte: "faixas de ficha técnica de fabricante. A NBR 14081 classifica o produto (AC-I, AC-II, AC-III); o consumo em kg/m² é de cada fábrica — confira o saco que você comprou."
      };
    },

    /* ----------------------------------------------------------------
     * JUNTAS DE MOVIMENTAÇÃO — o que faltava para a prancha poder ir
     * para a obra.
     *
     * O motor pagina o ambiente como um tabuleiro contínuo. Piso não se
     * executa assim: cerâmica e contrapiso se movem com a temperatura e
     * com a retração, e sem junta o piso estufa e descola em placa. A
     * NBR 13753 subdivide o pano — a referência corrente é 32 m² e no
     * máximo 8 m de maior dimensão em área interna, e pano bem menor em
     * área externa, onde a insolação é direta.
     *
     * Aqui isso é CONFERÊNCIA, não desenho automático: o motor diz
     * quantos panos são necessários e quantos metros de junta, e o
     * projetista decide onde passar cada uma. Os limites são editáveis
     * porque quem manda é a ficha do produto e o projeto.
     * ---------------------------------------------------------------- */
    LIMITE_PANO: { interno: { area: 32, lado: 8 }, externo: { area: 20, lado: 4.5 } },

    juntasMovimentacao: function (res, opts) {
      opts = opts || {};
      if (!res || !res.ok) return { ok: false, motivo: "Pagine antes de conferir." };
      var externo = !!opts.externo;
      var lim = opts.limite || (externo ? this.LIMITE_PANO.externo : this.LIMITE_PANO.interno);
      var cb = caixa(res.ambiente);
      var A = res.areaCoberta != null ? res.areaCoberta : res.areaAssentada;

      var nx = Math.max(1, Math.ceil(cb.l / lim.lado));
      var ny = Math.max(1, Math.ceil(cb.c / lim.lado));
      /* e ainda pode faltar por ÁREA, mesmo com o lado dentro do limite */
      while ((A / (nx * ny)) > lim.area + 1e-9) { if (cb.l / nx >= cb.c / ny) nx++; else ny++; }

      var linhas = [];
      var i;
      for (i = 1; i < nx; i++) linhas.push({ eixo: "x", pos: r3(cb.x0 + cb.l * i / nx), comprimento: r3(cb.c) });
      for (i = 1; i < ny; i++) linhas.push({ eixo: "y", pos: r3(cb.y0 + cb.c * i / ny), comprimento: r3(cb.l) });
      var metros = 0;
      linhas.forEach(function (l) { metros += l.comprimento; });

      var perim = 0;
      var p = res.ambiente;
      for (i = 0; i < p.length; i++) {
        var a = p[i], b = p[(i + 1) % p.length];
        perim += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      }

      return {
        ok: true, externo: externo, limite: lim,
        panos: nx * ny, nx: nx, ny: ny,
        areaPorPano: r3(A / (nx * ny)),
        linhas: linhas, metros: r3(metros),
        dessolidarizacao: r3(perim),
        precisa: linhas.length > 0,
        nota: linhas.length
          ? "Este piso pede " + linhas.length + " junta(s) de movimentação (" + r3(metros) +
            " m), dividindo em " + (nx * ny) + " panos de até " + r3(A / (nx * ny)) + " m². " +
            "O motor NÃO desenha a paginação já dividida — escolha onde passar cada junta e pagine cada pano."
          : "O pano cabe dentro do limite: não precisa de junta de movimentação no meio.",
        sempre: "Junta de DESSOLIDARIZAÇÃO no perímetro (" + r3(perim) + " m) é sempre necessária, " +
                "no encontro com parede, pilar e soleira — o rodapé costuma escondê-la.",
        fonte: "limites de referência da NBR 13753 (interno) e da prática de área externa. " +
               "Confira a ficha do produto e o projeto: quem manda são eles."
      };
    },

    /* ---- rodapé: perímetro menos as portas ------------------------- */
    rodape: function (res, opts) {
      opts = opts || {};
      if (!res || !res.ok) return { ok: false, motivo: "Pagine antes de contar." };
      var p = res.ambiente, per = 0;
      for (var i = 0; i < p.length; i++) {
        var a = p[i], b = p[(i + 1) % p.length];
        per += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      }
      var portas = num(opts.portas);
      var largPorta = opts.larguraPorta != null ? num(opts.larguraPorta) : 0.80;
      var desconto = portas * largPorta;
      var util = Math.max(0, per - desconto);
      var altura = opts.altura != null ? num(opts.altura) : 0.07;
      var barra = opts.barra != null ? num(opts.barra) : res.peca.c;
      return {
        ok: true, perimetro: r3(per), portas: portas, desconto: r3(desconto),
        metros: r3(util), altura: r3(altura), barra: r3(barra),
        barras: barra > 0 ? Math.ceil(util / barra) : 0,
        /* rodapé recortado da mesma peça: quantas tiras saem de uma */
        tirasPorPeca: altura > 0 ? Math.floor((res.peca.l + this.SERRA) / (altura + this.SERRA)) : 0,
        nota: "Rodapé cortado da própria peça de piso: cada peça rende as tiras acima. Metragem já descontada das portas."
      };
    },

    /* ----------------------------------------------------------------
     * DESENHO — a prancha que vai para a obra.
     * SVG puro: imprime, entra no PDF e abre em qualquer lugar.
     * ---------------------------------------------------------------- */
    svg: function (res, opts) {
      opts = opts || {};
      if (!res || !res.ok) return "";
      var larg = opts.largura || 900;
      var mg = 46;
      var cb = caixa(res.ambiente);
      var esc = (larg - mg * 2) / Math.max(cb.l, 0.001);
      var altPx = cb.c * esc + mg * 2;
      function X(v) { return mg + (v - cb.x0) * esc; }
      function Y(v) { return altPx - mg - (v - cb.y0) * esc; }   /* Y do desenho cresce para cima */

      var corInt = opts.corInteira || "#e8eef4";
      var corRec = opts.corRecorte || "#f6d9b0";
      var corBol = opts.corBolacha || "#f2b8b8";
      var traco = opts.traco || "#334155";

      var h = '<svg data-desenho="paginacao" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + larg + " " + Math.round(altPx) + '" width="100%" style="max-width:' + larg + 'px;background:#fff">';
      h += '<defs><pattern id="pgHachB" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
           '<line x1="0" y1="0" x2="0" y2="6" stroke="#c23a3a" stroke-width="1.4"/></pattern></defs>';

      /* peças */
      res.pecas.forEach(function (p) {
        var d = p.poli.map(function (q, i) { return (i ? "L" : "M") + r3(X(q[0])) + " " + r3(Y(q[1])); }).join(" ") + " Z";
        var fill = p.inteira ? corInt : (p.bolacha ? corBol : corRec);
        h += '<path d="' + d + '" fill="' + fill + '" stroke="' + traco + '" stroke-width="0.7"/>';
        if (p.bolacha) h += '<path d="' + d + '" fill="url(#pgHachB)" opacity="0.55"/>';
      });

      /* vãos por cima — o que não recebe piso */
      (res.vaos || []).forEach(function (v) {
        h += '<rect x="' + r3(X(num(v.x))) + '" y="' + r3(Y(num(v.y) + num(v.c))) + '" width="' + r3(num(v.l) * esc) +
             '" height="' + r3(num(v.c) * esc) + '" fill="#fff" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"/>';
      });

      /* contorno do ambiente */
      var dAmb = res.ambiente.map(function (q, i) { return (i ? "L" : "M") + r3(X(q[0])) + " " + r3(Y(q[1])); }).join(" ") + " Z";
      h += '<path d="' + dAmb + '" fill="none" stroke="#0f172a" stroke-width="2.2"/>';

      /* cotas gerais */
      var yc = altPx - mg + 22, xc = mg - 26;
      h += '<line x1="' + X(cb.x0) + '" y1="' + yc + '" x2="' + X(cb.x1) + '" y2="' + yc + '" stroke="#0f172a" stroke-width="1"/>';
      h += '<text x="' + ((X(cb.x0) + X(cb.x1)) / 2) + '" y="' + (yc - 5) + '" text-anchor="middle" font-family="Arial" font-size="12" fill="#0f172a">' +
           cb.l.toFixed(2).replace(".", ",") + " m</text>";
      h += '<line x1="' + xc + '" y1="' + Y(cb.y0) + '" x2="' + xc + '" y2="' + Y(cb.y1) + '" stroke="#0f172a" stroke-width="1"/>';
      h += '<text x="' + (xc - 4) + '" y="' + ((Y(cb.y0) + Y(cb.y1)) / 2) + '" text-anchor="middle" font-family="Arial" font-size="12" fill="#0f172a" transform="rotate(-90 ' +
           (xc - 4) + " " + ((Y(cb.y0) + Y(cb.y1)) / 2) + ')">' + cb.c.toFixed(2).replace(".", ",") + " m</text>";

      /* faixas de borda: o número que decide a paginação */
      if (res.bordas) {
        h += '<text x="' + mg + '" y="' + (mg - 22) + '" font-family="Arial" font-size="11.5" fill="#475569">' +
             "faixa de borda — X: " + Math.round(res.bordas.x.inicio * 1000) + " / " + Math.round(res.bordas.x.fim * 1000) +
             " mm · Y: " + Math.round(res.bordas.y.inicio * 1000) + " / " + Math.round(res.bordas.y.fim * 1000) + " mm</text>";
      }
      h += '<text x="' + mg + '" y="' + (mg - 8) + '" font-family="Arial" font-size="12.5" fill="#0f172a">' +
           res.inteiras + " inteiras · " + res.recortes + " recortes" +
           (res.bolachas ? " · " + res.bolachas + " abaixo de " + Math.round(res.recorteMin * 100) + " cm" : " · nenhum recorte fino") +
           (res.rentes ? " · " + res.rentes + " corte(s) rente(s)" : "") +
           " · " + res.assentamentoRotulo + "</text>";
      h += "</svg>";
      return h;
    },

    /* utilidades expostas para quem desenha e para os testes */
    _geo: { area: area, recortar: recortar, ret: ret, caixa: caixa, girar: girar, ccw: ccw }
  };

  global.Paginacao = Paginacao;
  if (typeof module !== "undefined" && module.exports) module.exports = Paginacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

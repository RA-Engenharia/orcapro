/* =====================================================================
 * planta3d.js — Detector de PAREDES em planta baixa 2D (motor PURO, Node-testável).
 * window.Planta3D. Fase C da reconstrução 2D→3D: recebe os segmentos do DXF
 * (js/dxf.js, já em metros) e PROPÕE paredes — o usuário confirma/corrige na
 * UI (modelo ASSISTIDO, decisão do Rogério: a IA propõe, o engenheiro decide).
 *
 * Heurística DETERMINÍSTICA (não LLM): parede em planta = PAR de segmentos
 * quase-paralelos com distância de espessura de parede (6–40 cm) e
 * sobreposição longitudinal real. Nada de mágica: o que não casar em par
 * fica de fora e é REPORTADO (stats honestas — segmentos usados/ignorados).
 * ===================================================================== */
(function (global) {
  "use strict";

  function ang(s) { return Math.atan2(s.y2 - s.y1, s.x2 - s.x1); }
  function len(s) { var dx = s.x2 - s.x1, dy = s.y2 - s.y1; return Math.sqrt(dx * dx + dy * dy); }

  var Planta3D = {
    // segmentos [{x1,y1,x2,y2,layer}] em METROS -> { paredes:[...], stats }
    // opts: { espMin (0.06), espMax (0.40), angTol (3°), sobreMin (0.30 m), compMin (0.30 m), layers (whitelist opcional) }
    detectarParedes: function (segmentos, opts) {
      opts = opts || {};
      var espMin = opts.espMin != null ? opts.espMin : 0.06;
      var espMax = opts.espMax != null ? opts.espMax : 0.40;
      var angTol = (opts.angTol != null ? opts.angTol : 3) * Math.PI / 180;
      var sobreMin = opts.sobreMin != null ? opts.sobreMin : 0.30;
      var compMin = opts.compMin != null ? opts.compMin : 0.30;
      var whitelist = opts.layers && opts.layers.length ? {} : null;
      if (whitelist) opts.layers.forEach(function (l) { whitelist[l] = 1; });

      // candidatos: só segmentos retos com comprimento útil (curvas discretizadas participam,
      // mas trechos minúsculos só geram ruído)
      var segs = [], nCurtos = 0, nForaLayer = 0;
      (segmentos || []).forEach(function (s, idx) {
        if (whitelist && !whitelist[s.layer]) { nForaLayer++; return; }
        /* traço curto demais não vira parede — mas some da CONTA se ninguém
           contar: a tela dizia "16 traços analisados" num desenho de 36 */
        var L = len(s); if (L < compMin) { nCurtos++; return; }
        var a = ang(s);
        // normaliza a direção pro intervalo [0, PI) — segmentos opostos são paralelos
        if (a < 0) a += Math.PI; if (a >= Math.PI) a -= Math.PI;
        segs.push({ i: idx, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, L: L, a: a, layer: s.layer, usado: false });
      });

      // pares paralelos com distância de parede e sobreposição no eixo longitudinal
      var candidatos = [];
      for (var i = 0; i < segs.length; i++) {
        var A = segs[i];
        var ux = Math.cos(A.a), uy = Math.sin(A.a); // direção longitudinal
        for (var j = i + 1; j < segs.length; j++) {
          var B = segs[j];
          var dAng = Math.abs(A.a - B.a); if (dAng > Math.PI / 2) dAng = Math.PI - dAng;
          if (dAng > angTol) continue;
          // distância perpendicular entre as retas (projeção do vetor A1->B1 na normal de A)
          var nx = -uy, ny = ux;
          var dPerp = Math.abs((B.x1 - A.x1) * nx + (B.y1 - A.y1) * ny);
          if (dPerp < espMin || dPerp > espMax) continue;
          // sobreposição longitudinal: projeta os 4 pontos no eixo u
          var a1 = A.x1 * ux + A.y1 * uy, a2 = A.x2 * ux + A.y2 * uy;
          var b1 = B.x1 * ux + B.y1 * uy, b2 = B.x2 * ux + B.y2 * uy;
          var aLo = Math.min(a1, a2), aHi = Math.max(a1, a2);
          var bLo = Math.min(b1, b2), bHi = Math.max(b1, b2);
          var lo = Math.max(aLo, bLo), hi = Math.min(aHi, bHi), sobre = hi - lo;
          if (sobre < sobreMin) continue;
          if (sobre < 0.3 * Math.min(A.L, B.L)) continue; // sobreposição irrisória = provavelmente não é o par
          candidatos.push({ ia: i, ib: j, esp: dPerp, sobre: sobre, lo: lo, hi: hi,
                            /* extremos de cada face: precisos p/ achar o fim do EIXO, não da face */
                            aLo: aLo, aHi: aHi, bLo: bLo, bHi: bHi,
                            ux: ux, uy: uy, nx: nx, ny: ny, A: A, B: B });
        }
      }

      // LINHA DE EIXO (achado do gate): segmento "sanduíche" — paralelo ENTRE duas faces que
      // já formam par válido, com sobreposição real — é eixo/centro de parede (ou linha de
      // acabamento), não face. Sem excluir, o par face-eixo (meia espessura) competia com o
      // par face-face e ganhava por ORDEM DE DESENHO do DXF (espessura errada não-determinística).
      var ehEixo = {};
      candidatos.forEach(function (c) {
        // offsets perpendiculares das duas retas do par (no referencial do par)
        var offA = c.A.x1 * c.nx + c.A.y1 * c.ny, offB = c.B.x1 * c.nx + c.B.y1 * c.ny;
        var lo2 = Math.min(offA, offB), hi2 = Math.max(offA, offB);
        segs.forEach(function (E, ei) {
          if (E === c.A || E === c.B) return;
          var dAng = Math.abs(E.a - c.A.a); if (dAng > Math.PI / 2) dAng = Math.PI - dAng;
          if (dAng > angTol) return;
          var offE = E.x1 * c.nx + E.y1 * c.ny;
          if (offE <= lo2 + 0.01 || offE >= hi2 - 0.01) return; // não está ENTRE as faces
          // sobreposição longitudinal do E com a porção do par
          var e1 = E.x1 * c.ux + E.y1 * c.uy, e2 = E.x2 * c.ux + E.y2 * c.uy;
          var eLo = Math.min(e1, e2), eHi = Math.max(e1, e2);
          var sob = Math.min(eHi, c.hi) - Math.max(eLo, c.lo);
          if (sob >= 0.5 * c.sobre) { ehEixo[ei] = 1; c.temEixo = true; }
        });
      });
      candidatos = candidatos.filter(function (c) { return !ehEixo[c.ia] && !ehEixo[c.ib]; });

      // greedy: pares mais LONGOS primeiro; empate (±1 cm) prefere a MENOR espessura
      // (mata a "parede fantasma" de 30 cm no vazio de um shaft entre duas paredes de 15)
      candidatos.sort(function (p, q) { var d = q.sobre - p.sobre; return Math.abs(d) > 0.01 ? d : (p.esp - q.esp); });
      // CONSUMO POR INTERVALO (achado do gate): em planta real as linhas são TRIMADAS nos
      // encontros (T) — a face externa contínua pareia com a interna em VÁRIOS trechos.
      // "cada segmento 1x" perdia todos os trechos menos o maior (m² subcontado em silêncio).
      var paredes = [], consumo = {}, usados = {};
      function fracaoConsumida(ei, lo, hi) {
        var ivs = consumo[ei]; if (!ivs) return 0;
        var tot = 0;
        for (var k2 = 0; k2 < ivs.length; k2++) { var s2 = Math.min(hi, ivs[k2][1]) - Math.max(lo, ivs[k2][0]); if (s2 > 0) tot += s2; }
        return tot / Math.max(1e-9, hi - lo);
      }
      candidatos.forEach(function (c) {
        if (fracaoConsumida(c.ia, c.lo, c.hi) > 0.3 || fracaoConsumida(c.ib, c.lo, c.hi) > 0.3) return;
        (consumo[c.ia] = consumo[c.ia] || []).push([c.lo, c.hi]);
        (consumo[c.ib] = consumo[c.ib] || []).push([c.lo, c.hi]);
        usados[c.ia] = 1; usados[c.ib] = 1;
        // eixo médio da porção sobreposta (linha central da parede)
        var offA = c.A.x1 * c.nx + c.A.y1 * c.ny; // offset perpendicular da reta A
        var offB = c.B.x1 * c.nx + c.B.y1 * c.ny;
        var offM = (offA + offB) / 2;

        /* A PAREDE VAI ATÉ O EIXO, NÃO ATÉ A FACE INTERNA.
         *
         * A sobreposição das duas faces é o trecho onde AS DUAS existem —
         * e num canto a face interna para antes, porque ela dobra. Usar a
         * sobreposição como comprimento joga fora meia espessura em cada
         * canto. Medido numa sala de 6 × 4 m com parede de 15 cm: o motor
         * dava 2,82 m² de alvenaria contra 2,91 m² reais (área do anel,
         * conta exata) — 3,09 % a menos, em silêncio, no orçamento.
         *
         * O fim do eixo é o MEIO-CAMINHO entre onde cada face termina —
         * metade da sobra, não a sobra inteira. Num canto mitrado o
         * vértice do eixo fica exatamente no meio entre o vértice da face
         * externa e o da interna, porque as duas faces são a mesma linha
         * deslocada de +t/2 e −t/2. A 90° com espessuras iguais a sobra
         * vale t e metade dela dá t/2, o que fez a conta fechar no
         * retângulo e escondeu o erro; num canto de 135° ou entre paredes
         * de espessuras diferentes a sobra é outra, e estender ela inteira
         * COBRAVA alvenaria a mais (medido: +2,03 % num octógono, +0,60 %
         * num chanfro a 45°).
         *
         * A sobra ainda é limitada a MEIA ESPESSURA: mais que isso não é
         * canto, é parede contínua passando por cima (caso do T), e aí
         * quem resolve é o AlvGeo. O preço desse teto é o canto AGUDO, em
         * que o mitrado avança mais que t/2 e a conta fica curta — está
         * declarado, não corrigido. Ponta livre (as duas faces terminam
         * juntas) não ganha nem um milímetro. */
        var meia = c.esp / 2;
        var extLo = Math.min(Math.max(0, c.lo - Math.min(c.aLo, c.bLo)) / 2, meia);
        var extHi = Math.min(Math.max(0, Math.max(c.aHi, c.bHi) - c.hi) / 2, meia);
        var eLo = c.lo - extLo, eHi = c.hi + extHi;
        var p1x = c.ux * eLo + c.nx * offM, p1y = c.uy * eLo + c.ny * offM;
        var p2x = c.ux * eHi + c.nx * offM, p2y = c.uy * eHi + c.ny * offM;
        var compr = eHi - eLo;

        /* CONFIANÇA QUE MEDE ALGUMA COISA.
         * A conta antiga era só "quanto da face maior está pareado" — e um
         * PILAR quadrado de 30 × 30 desenhado fechado dá dois pares
         * perfeitos, saía com 100 % e virava 2 paredes de 30 cm. O que
         * distingue parede de pilar é a ESBELTEZ: parede é comprida em
         * relação à espessura. Entra como fator, e o caso duvidoso vai
         * marcado para o usuário decidir — não sumindo nem entrando calado. */
        var cobertura = Math.min(1, c.sobre / Math.max(c.A.L, c.B.L));
        var esbeltez = compr / Math.max(c.esp, 1e-6);
        var confianca = cobertura * Math.min(1, esbeltez / 4);

        /* TRÊS LINHAS PARALELAS: GEOMETRIA NÃO DECIDE — QUEM DECIDE É O OLHO.
         *
         * Uma parede desenhada com a linha de centro no meio e uma CADEIA
         * DE COTAS são, no papel, o mesmo desenho: três paralelas
         * igualmente espaçadas, do mesmo comprimento. Não há critério
         * geométrico que separe as duas — e as duas leituras erradas são
         * caras: apagar faz a parede sumir; aceitar faz a cota virar
         * parede. Medido no caminho de hoje: cadeia de cotas a 18 cm
         * saía como parede de 36 cm com 100 % de confiança, MARCADA.
         *
         * Então o par com linha no meio entra marcado como duvidoso,
         * desligado, e a tela diz por quê. O usuário liga o que for
         * parede — que é a única informação que ele tem e o programa não. */
        var confMax = c.temEixo ? 0.35 : 1;
        paredes.push({
          x1: p1x, y1: p1y, x2: p2x, y2: p2y,
          comprimento: +compr.toFixed(4), espessura: +c.esp.toFixed(4),
          comprimentoFaces: +(c.sobre).toFixed(4),   /* o trecho onde as DUAS faces existem */
          cobertura: +cobertura.toFixed(4),
          esbeltez: +esbeltez.toFixed(2),
          /* 1,25 e não 1,5: a régua anterior pegava parede CURTA DE VERDADE
             — um nicho de 35 cm em bloco de 25 dá esbeltez 1,4 e saía
             desmarcado do orçamento. Pilar quadrado, que é o alvo, fica em
             1,0 e continua pego. */
          provavelPilar: esbeltez < 1.25,
          viaTrio: !!c.temEixo,
          layer: c.A.layer,
          confianca: +Math.min(confianca, confMax).toFixed(2),
          /* O DUVIDOSO NASCE DESLIGADO NA ORIGEM, não na tela.
             A regra do pilar morava só no assistente de volumetria — e o
             painel 2D→3D de dentro do viewer, que chama este motor direto,
             não sabia dela: o pilar continuava entrando em dobro por lá.
             Decidindo aqui, todo consumidor herda (extrudar já respeita
             ligada === false) e não há duas fontes da mesma verdade. */
          ligada: !(c.temEixo || esbeltez < 1.25)
        });
      });

      // merge de paredes COLINEARES contíguas (parede longa desenhada em trechos)
      var m = true;
      while (m) {
        m = false;
        outer:
        for (var p = 0; p < paredes.length; p++) for (var q = p + 1; q < paredes.length; q++) {
          var P = paredes[p], Q = paredes[q];
          if (Math.abs(P.espessura - Q.espessura) > 0.02) continue;
          var aP = Math.atan2(P.y2 - P.y1, P.x2 - P.x1), aQ = Math.atan2(Q.y2 - Q.y1, Q.x2 - Q.x1);
          var dA = Math.abs(aP - aQ); if (dA > Math.PI / 2) dA = Math.PI - dA;
          if (dA > angTol) continue;
          // colinear: distância perpendicular do início de Q à reta de P
          var ux2 = Math.cos(aP), uy2 = Math.sin(aP), nx2 = -uy2, ny2 = ux2;
          if (Math.abs((Q.x1 - P.x1) * nx2 + (Q.y1 - P.y1) * ny2) > 0.03) continue;
          // contíguas ou sobrepostas no eixo?
          var t = [P.x1 * ux2 + P.y1 * uy2, P.x2 * ux2 + P.y2 * uy2, Q.x1 * ux2 + Q.y1 * uy2, Q.x2 * ux2 + Q.y2 * uy2];
          var pLo = Math.min(t[0], t[1]), pHi = Math.max(t[0], t[1]);
          var qLo = Math.min(t[2], t[3]), qHi = Math.max(t[2], t[3]);
          if (qLo > pHi + 0.05 || pLo > qHi + 0.05) continue;
          var off2 = ((P.x1 * nx2 + P.y1 * ny2) + (Q.x1 * nx2 + Q.y1 * ny2)) / 2;
          var lo2 = Math.min(pLo, qLo), hi2 = Math.max(pHi, qHi);
          P.x1 = ux2 * lo2 + nx2 * off2; P.y1 = uy2 * lo2 + ny2 * off2;
          P.x2 = ux2 * hi2 + nx2 * off2; P.y2 = uy2 * hi2 + ny2 * off2;
          P.comprimento = +(hi2 - lo2).toFixed(4);
          P.espessura = +((P.espessura + Q.espessura) / 2).toFixed(4);
          P.comprimentoFaces = +((P.comprimentoFaces || 0) + (Q.comprimentoFaces || 0)).toFixed(4);
          /* a esbeltez é da parede JUNTA — dois trechos curtos colineares
             formam uma parede comprida, e ela deixa de parecer pilar */
          P.esbeltez = +(P.comprimento / Math.max(P.espessura, 1e-6)).toFixed(2);
          P.provavelPilar = P.esbeltez < 1.25;
          P.viaTrio = !!(P.viaTrio || Q.viaTrio);
          /* A NOTA TEM DE SER IDEMPOTENTE: a mesma parede, desenhada
             inteira ou partida em N trechos, precisa receber a mesma
             confiança. Multiplicar a esbeltez sobre uma nota que JÁ foi
             penalizada por ela rebaixava a parede a cada emenda — três
             trechos e uma parede boa saía vermelha. Por isso o fator entra
             sobre a COBERTURA crua, guardada de propósito. */
          P.cobertura = Math.max(P.cobertura || 0, Q.cobertura || 0);
          P.confianca = +Math.min(P.cobertura * Math.min(1, P.esbeltez / 4), P.viaTrio ? 0.35 : 1).toFixed(2);
          /* A DECISÃO É REFEITA INTEIRA, NÃO SÓ ENDURECIDA.
           * O merge recalculava esbeltez e provavelPilar mas só sabia
           * DESLIGAR — nunca voltava atrás. Numa parede grossa desenhada
           * em trechos (cada LINE do DXF é um pedaço), cada trecho isolado
           * tem esbeltez ~1,2 e parece pilar: nascia desligado. Depois de
           * emendados viravam uma parede de 4 m com esbeltez 13, que não
           * parece pilar nenhum — e continuava desligada. Medido numa sala
           * de 6 × 4 m com parede de 30 cm fatiada em 35 cm: 6 paredes,
           * ZERO ligadas, ZERO caixas no 3D. O modelo nascia vazio.
           * A parede emendada é outro objeto para efeito da regra, e neste
           * ponto o usuário ainda não tocou em nada — então a regra vale
           * inteira, nos dois sentidos. */
          P.ligada = !(P.viaTrio || P.provavelPilar);
          paredes.splice(q, 1); m = true; break outer;
        }
      }

      var nUsados = Object.keys(usados).length;
      return {
        paredes: paredes,
        stats: {
          segmentosAnalisados: segs.length,
          segmentosUsados: nUsados,
          segmentosSemPar: segs.length - nUsados, // honesto: o que NÃO virou parede (portas, mobiliário, cotas…)
          /* a conta tem de FECHAR: recebidos = analisados + curtos + fora de layer */
          segmentosRecebidos: (segmentos || []).length,
          segmentosCurtos: nCurtos,
          segmentosForaLayer: nForaLayer,
          paredes: paredes.length
        }
      };
    },

    // paredes confirmadas -> volumetria: caixas p/ o viewer (centro, dimensões, rotação em Y)
    // peDireito em metros. Y-up (mesma convenção do viewer three.js).
    extrudar: function (paredes, peDireito) {
      var h = peDireito > 0 ? peDireito : 2.8;
      var out = [];
      (paredes || []).forEach(function (p, i) {
        if (p.ligada === false) return;
        var compr = p.comprimento || Math.sqrt(Math.pow(p.x2 - p.x1, 2) + Math.pow(p.y2 - p.y1, 2));
        if (!(compr > 0) || !(p.espessura > 0)) return;
        out.push({
          id: i + 1,
          cx: (p.x1 + p.x2) / 2, cy: h / 2, cz: -(p.y1 + p.y2) / 2, // planta XY -> mundo XZ (Z = -Y pra manter o norte)
          comprimento: compr, altura: h, espessura: p.espessura,
          // three R_y(θ) leva (1,0,0) a (cosθ,0,−sinθ); com z=−y, a direção
          // p1→p2 exige θ = atan2(−dz,dx) = atan2(dy,dx). O sinal antigo
          // (−dy) espelhava paredes DIAGONAIS em Z (ortogonais não mudam) —
          // provado por teste de endpoints no test-bimedit.js.
          rotY: Math.atan2(p.y2 - p.y1, p.x2 - p.x1),
          area: +(compr * h).toFixed(4), // m² de UMA face (o que a Parede-Cebola consome)
          layer: p.layer || "0"
        });
      });
      return out;
    },

    /* ==================================================================
     * FAMÍLIA DE PARALELAS — o falso positivo mais perigoso da planta.
     *
     * O detector casa qualquer par de paralelas afastado de 6 a 40 cm.
     * Só que um LANCE DE ESCADA é exatamente isso: degraus de 28 cm,
     * paralelos, com 1,10 m de comprimento. Doze degraus viram onze
     * "paredes" de 28 cm com confiança alta, e o orçamento ganha 12 m²
     * de alvenaria que não existem. O mesmo vale para HACHURA de piso e
     * para a cadeia de cotas.
     *
     * O que separa: uma parede real tem EXATAMENTE DUAS faces. Escada,
     * hachura e cota têm TRÊS OU MAIS linhas paralelas, igualmente
     * espaçadas e de comprimento parecido. Isso é geométrico, é
     * determinístico, e não depende de layer nem de nome.
     *
     * Devolve os segmentos limpos E as famílias achadas — porque o
     * usuário precisa poder discordar: uma parede dupla com isolamento
     * no meio também são três linhas.
     * ================================================================== */
    filtrarFamilias: function (segmentos, opts) {
      opts = opts || {};
      var angTol = (opts.angTol != null ? opts.angTol : 4) * Math.PI / 180;
      var minLinhas = opts.minLinhas != null ? opts.minLinhas : 3;
      var tolEsp = opts.tolEspacamento != null ? opts.tolEspacamento : 0.25;  /* ±25 % */
      var tolComp = opts.tolComprimento != null ? opts.tolComprimento : 0.40;
      var espMax = opts.espMax != null ? opts.espMax : 0.40;
      var espMin = opts.espMin != null ? opts.espMin : 0.06;
      var segs = (segmentos || []).filter(function (s) { return len(s) > 1e-9; });
      if (segs.length < minLinhas) return { segmentos: segmentos || [], familias: [], removidos: 0 };

      /* 1) agrupa por DIREÇÃO (módulo 180°: sentido não importa) */
      var grupos = [];
      segs.forEach(function (s) {
        var a = ang(s); if (a < 0) a += Math.PI;
        if (a >= Math.PI - 1e-9) a -= Math.PI;
        for (var i = 0; i < grupos.length; i++) {
          var d = Math.abs(a - grupos[i].ang);
          if (d > Math.PI / 2) d = Math.PI - d;
          if (d <= angTol) { grupos[i].itens.push({ s: s, a: a }); return; }
        }
        grupos.push({ ang: a, itens: [{ s: s, a: a }] });
      });

      /* 2) dentro de cada direção, ordena pelo afastamento perpendicular */
      var mortos = [], familias = [];
      grupos.forEach(function (g) {
        if (g.itens.length < minLinhas) return;
        var nx = -Math.sin(g.ang), ny = Math.cos(g.ang);
        var lista = g.itens.map(function (it) {
          var mx = (it.s.x1 + it.s.x2) / 2, my = (it.s.y1 + it.s.y2) / 2;
          return { s: it.s, off: mx * nx + my * ny, L: len(it.s),
                   t: (mx * Math.cos(g.ang) + my * Math.sin(g.ang)) };
        });
        lista.sort(function (a, b) { return a.off - b.off; });

        var i = 0;
        while (i < lista.length - (minLinhas - 1)) {
          /* cresce a corrida enquanto o espaçamento se mantiver uniforme
             e as linhas continuarem parecidas em comprimento e posição */
          var passo = lista[i + 1].off - lista[i].off;
          if (!(passo > 1e-4) || passo > espMax) { i++; continue; }
          var fim = i + 1;
          while (fim + 1 < lista.length) {
            var p2 = lista[fim + 1].off - lista[fim].off;
            if (!(p2 > 1e-4)) break;
            if (Math.abs(p2 - passo) > tolEsp * passo) break;
            var dl = Math.abs(lista[fim + 1].L - lista[i].L) / Math.max(lista[i].L, 1e-6);
            if (dl > tolComp) break;
            /* têm de estar lado a lado, não em cantos opostos da planta */
            if (Math.abs(lista[fim + 1].t - lista[i].t) > Math.max(lista[i].L, lista[fim + 1].L)) break;
            fim++;
          }
          var n = fim - i + 1;
          /* EXCEÇÃO: TRÊS linhas cujo vão total cabe numa espessura de
             parede é FACE + EIXO + FACE — o jeito como muita prancha
             desenha parede, com a linha de centro no meio. Apagar isso
             faz a parede sumir inteira e em silêncio (medido: parede de
             6 m × 15 cm virava zero). Quem separa aqui é o vão TOTAL:
             face+eixo+face de 15 cm mede 15 cm entre as extremas; três
             degraus de escada medem 56 cm, e caem fora na hora.
             Três linhas não são apagadas — vão para o detector, que tem
             a regra do eixo-sanduíche e resolve o par certo. */
          var vaoTotal = passo * (n - 1);
          if (n === 3 && vaoTotal >= espMin && vaoTotal <= espMax) { i = fim + 1; continue; }
          if (n >= minLinhas) {
            var fam = { linhas: n, espacamento: Math.round(passo * 1000) / 1000,
                        anguloGraus: Math.round(g.ang * 180 / Math.PI * 10) / 10,
                        comprimento: Math.round(lista[i].L * 100) / 100,
                        motivo: passo < 0.06 ? "hachura" : (passo <= 0.35 ? "escada ou hachura larga" : "cadeia de cotas") };
            familias.push(fam);
            for (var k = i; k <= fim; k++) mortos.push(lista[k].s);
            i = fim + 1;
          } else i++;
        }
      });

      if (!mortos.length) return { segmentos: segmentos || [], familias: [], removidos: 0 };
      var fora = (segmentos || []).filter(function (s) { return mortos.indexOf(s) < 0; });
      return {
        segmentos: fora, familias: familias, removidos: mortos.length,
        descartados: mortos,
        nota: familias.length + " família(s) de linhas paralelas equidistantes descartadas (" +
              mortos.length + " traços). Parede tem DUAS faces; três ou mais linhas igualmente " +
              "espaçadas é escada, hachura ou cadeia de cotas."
      };
    }
  };

  global.Planta3D = Planta3D;
  if (typeof module !== "undefined" && module.exports) module.exports = Planta3D;
})(typeof window !== "undefined" ? window : globalThis);

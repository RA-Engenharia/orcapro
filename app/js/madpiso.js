/* =====================================================================
 * madpiso.js — DESCIDA DE CARGAS do PISO SECO de madeira (motor PURO,
 * ES5, sem DOM, Node-testável). É o resto de calc_piso_v18.py (Quiosque
 * de referência, emissão R03, 11/10/2026) que não estava em madviga.js nem em
 * maddim7190.js: zonas e cargas G/Q, paredes sobre o piso, área de
 * influência de cada barrote, barrotes apoiados nas vigas principais (VP)
 * como cargas concentradas, apoios por geometria, VP iteradas, tijolo da
 * ducha e reações nos pilaretes.
 *
 * REUSA MadDim.vigaFletida (que usa MadViga): a verificação de cada peça
 * (viga contínua, NBR 7190) NÃO é refeita aqui.
 *
 * GEOMETRIA — o Python usa shapely; aqui não há biblioteca: as poucas
 * operações usadas foram escritas à mão (nenhuma exige união de polígonos):
 *   · segmento ∩ polígono → só o COMPRIMENTO / ponto médio (intervalos);
 *   · área carregada = painéis ∪ (caixa da ducha ∩ envoltória dos painéis
 *     + 0,30 m) − tampas; o buffer 0,30 m reproduz o do GEOS (junta
 *     redonda, 16 segmentos por quadrante (quad_segs do shapely 2)) para o comprimento dar igual;
 *   · distâncias ponto/segmento/segmento e interseção com orientação
 *     exata (BigInt) nos casos de toque.
 *
 * FIDELIDADE: reproduz, de propósito, as convenções do script emitido:
 *   · round() do Python (meio-para-o-par sobre o valor exato do double);
 *   · a reação de um apoio é buscada pela chave round(x,4) — se o nó da
 *     malha (arredondado a 1e-6) cair em outro 4º decimal, o Python NÃO
 *     acha a reação e usa (0, 0). Isso acontece no R03 (VP-02/03/05) e foi
 *     mantido SÓ com `reacaoPorNo: false` (regressão). O PADRÃO é true
 *     (usa sempre a do nó): no R03 a perda foi 8,0 kN de G em 5 pilaretes
 *     (+1,6 kN cada em PT-4M, PT-1M, PT-4B, PT-2B, PT-1B) — reações que
 *     foram para a fundação CA R02 saíram menores.
 *   · barrote com 1 apoio: só calcula a faixa de carga (não verifica) — R03; no R04 a carga vai inteira ao apoio;
 *   · VP: 3 passadas, a reação da VP que apoia de lado entra na seguinte.
 *
 * REVISÃO (`opcoes.revisao`): "R04" (PADRÃO, 12/10/2026) = calc_piso_v18.py revisado; "R03" = o emitido em 11/10/2026 (regressão).
 * Mudanças do R04: (1) reação do apoio pelo NÓ MAIS PRÓXIMO (a busca round(x,4) zerava 5 apoios das VP-02/03/05, ΣG 7,95 kN), com
 * registro da perda antiga em `perdaRound`; (2) barrote com UM apoio: cabeceira no requadro com tolerância 0,16 (não 0,25);
 * (3) parede que cruza o barrote entra com a FAIXA DO PRÓPRIO BARROTE (meia distância aos vizinhos) em vez de 0,737 fixo;
 * (4) barrote com 1 apoio: a carga (peso próprio + faixas G/Q) vai inteira ao apoio; (5) topo_madeira do arquivo de reações vem de
 * madeira.piso_pw.niveis.topo_pilarete (padrão −0,58; o R03 usava −0,62).
 *
 * Regras gerais = funções com parâmetros (default = Python). O que é do
 * Quiosque fica no bloco QUIOSQUE (caixas das zonas, G/Q, ducha, tampas,
 * transformação CYPE→madeira, textos do arquivo de reações).
 *
 * UNIDADES: m, kN, kN/m, kN/m².  Teste: node tools/test-mad-piso.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var MD = global.MadDim || (typeof require === "function" ? require("./maddim7190.js") : null);
  var MV = global.MadViga || (typeof require === "function" ? require("./madviga.js") : null);

  var MadPiso = {};

  /* ------------------------------------------------------------------
   * QUIOSQUE — tudo o que é específico da obra (PROJ-EST R03, 11/10/2026)
   * ------------------------------------------------------------------ */
  var QUIOSQUE = {
    /* zonas por caixa [xmin, ymin, xmax, ymax] no sistema do modelo de madeira; a 1ª que contém o ponto vale; senão `zonaPadrao` */
    zonas: [["ducha", [12.18, -1.0, 17.5, 7.0]],           // ao sul da fila 5 (xt > 12,07)
            ["quiosque", [0.17, -0.01, 12.18, 3.51]]],
    zonaPadrao: "externa",
    /* R03 11/10/2026: pacote 8 cm (camadas_piso.json + Painel Wall 0,31 + 0,04); era 2,84 / 2,96 / 2,96 com 12 cm */
    G: { quiosque: 2.00, externa: 2.21, ducha: 1.98 },
    Q: { quiosque: 3.0, externa: 4.0, ducha: 4.0 },          // NBR 6120:2019
    /* na zona `zona` a área carregada é a caixa ∩ (envoltória dos painéis + folga) — a ducha é piso sobre toda a laje */
    areaExtra: { zona: "ducha", folga: 0.3 },
    /* tijolos da ducha (V07: 336 peças 24×11,3×7,6, ~3,7 kg) espalhados na área da zona */
    tijolo: { zona: "ducha", massaKg: 3.7 },
    /* identificação na cena SketchUp (cena_V18.json) */
    cena: { tampaTag: "05i", tampaMat: "tampa", tampaTipo: "prisma", tijoloTag: "29", tijoloNome: "ijolo" },
    /* base dos pilares (CYPE R03) → pilarete: o CYPE usa a "concepção"; xt = 12,176 − yc, yt = xc − 0,003 */
    cypeParaMadeira: { xt0: 12.176, yt0: -0.003, tolPilarete: 0.25 },
    hipoteses: ["Peso próprio", "CP", "SCpiso", "SCcob", "V1", "V2", "V3", "V4"],
    topoMadeira: -0.62,
    textos: {
      versao: "V18 — madeira (conversa da madeira), 08/10/2026",
      convencao: "kN e kN·m característicos; N > 0 compressão no pilarete; x, y = eixos da fundação (concepção); xt, yt = modelo " +
        "de madeira. M no topo = 0 (madeira apoiada em sela inox sobre graute: articulação). G = piso (este cálculo, V18) " +
        "+ pilar de madeira (base do pilar no CYPE R03: PP + CP). Q = piso + SCcob/SCpiso do pilar. V1..V4 = base do pilar " +
        "(CYPE R03). tracao_hold_down_vento_kN = soma de T_k = T_d/1,4 dos hold-downs que descarregam no pilarete (envoltória " +
        "do vento, sem sinal por caso: usar como tração adicional no pior caso de vento).",
      naoInclui: "parcela da cobertura que desce pelas PAREDES (A2/A3 do prep_fund_PW) e o vento horizontal das paredes: manter o " +
        "método da fundação para essas parcelas (prep_fund_PW / grelha V18). Este arquivo SUBSTITUI só a parcela " +
        "'piso_pw' (Rg/Rq) e confirma a base dos pilares."
    }
  };

  /* parâmetros gerais (default = Python) */
  var PADRAO = {
    classe: "C40-dic", perfil: "QUIO_R03_PISO",              // D40, kmod 0,448, φ 2,0, ψ2 0,4, L/350; ELU 1,4G + 1,4Q
    rho: 1000.0,                                             // kg/m³ do peso próprio
    g: 9.81e-3,                                              // kN/kg
    gRevestParede: 1.0,                                      // kN/m de revestimentos sobre o peso do modelo
    juntarTol: 0.15,                                         // apoios mais próximos viram um (viga dupla)
    passoBarrote: 0.25, minFaixas: 4,                        // faixas de carga ao longo do barrote
    larguraMax: 0.8, larguraSemVizinho: 0.40,                // vizinho ≤ 0,8 m; sem vizinho: 0,40 m de cada lado
    vizinhoMin: 0.02,
    tolApoioViga: 0.02, tolParalelo: 0.97,                   // topo da VP = fundo do barrote (±2 cm); cruzamento
    tolPonta: { pilar: 0.12, filtro: 0.3, requadro: 0.25, requadroDist: 0.04, deslocPilar: 0.03, deslocRequadro: 0.03 },
    paredeDistBarrote: 0.06, paredeFatorCruzada: 0.737,
    alturaBloqueioVP: 0.16, paredeFolgaVP: 0.05,
    pontaVP: { nivel: 0.03, dist: 0.03, filtro: 0.25, desloc: 0.04, tolPilarete: 0.05, minInterseccao: 0.02 },
    passesVP: 3,
    grupos: { viga: "PISO_VIGA", barrote: "PISO_BARROTE", requadro: "PISO_REQUADRO", pilar: "PILAR_PECA",
              guiaInf: "WF_GUIA_INF", prefixoWF: "WF" },
    reacaoPorNo: true,         // só vale com revisao "R03": false = igual ao emitido R03 (regressão); no R04 a reação é SEMPRE pelo nó mais próximo
    revisao: "R04",            // "R04" (padrão) | "R03" (regressão do emitido de 11/10/2026)
    tolCabeceiraUmApoio: 0.16  // R04: tolerância de cabeceira (requadro) com um apoio só (com 2 ou mais: tolPonta.requadro)
  };

  /* ------------------------------------------------------------------ utilidades numéricas */
  var BI = typeof BigInt === "function" ? BigInt : null;

  /** round() do Python 3 (meio-para-o-par sobre o valor EXATO do double) */
  function pyRound(x, n) {
    if (!isFinite(x)) return x;
    var s = x.toFixed(n), ax = Math.abs(x), y = ax * Math.pow(10, n);
    if (Math.abs((y - Math.floor(y)) - 0.5) < 1e-6) {
      var full = ax.toFixed(100), dot = full.indexOf(".");
      var cauda = full.slice(dot + 1 + n);
      if (/^50*$/.test(cauda)) {                                  // empate exato: par
        var baixo = full.slice(0, dot + 1 + n);
        if (n === 0) baixo = full.slice(0, dot);
        var ult = baixo.replace(".", "").slice(-1);
        s = (parseInt(ult, 10) % 2 === 0 ? baixo : ax.toFixed(n));
        if (x < 0) s = "-" + s;
      }
    }
    return Number(s);
  }
  function r6js(x) { return Math.round(x * 1e6) / 1e6; }         // o mesmo de madviga.js (nó da malha)
  function r4js(x) { return Math.round(x * 1e4) / 1e4; }
  function clamp(x, a, b) { return Math.min(Math.max(x, a), b); }
  function pyMax(a, b) { return b > a ? b : a; }
  function dot2(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add2(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function norm2(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function soma(arr) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return s; }
  function copiaProf(o) { return JSON.parse(JSON.stringify(o)); }
  function vazio(o) { return !o || (typeof o === "object" && Object.keys(o).length === 0); }

  /* ------------------------------------------------------------------ geometria */
  /** orientação (sinal de det) com filtro e, se duvidoso, aritmética exata (BigInt) */
  function paraBig(x) {
    if (x === 0) return BI(0);
    var dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
    var hi = dv.getUint32(0), lo = dv.getUint32(4);
    var e = (hi >>> 20) & 0x7ff;
    var m = (BI(hi & 0xfffff) << BI(32)) | BI(lo);
    var v = e === 0 ? m : ((m | (BI(1) << BI(52))) << BI(e - 1));
    return (hi >>> 31) ? -v : v;
  }
  function orient(ax, ay, bx, by, cx, cy) {
    var det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    var lim = 1e-12 * (Math.abs((bx - ax) * (cy - ay)) + Math.abs((by - ay) * (cx - ax)));
    if (Math.abs(det) > lim || !BI) return det > 0 ? 1 : (det < 0 ? -1 : 0);
    var A = [paraBig(ax), paraBig(ay)], B = [paraBig(bx), paraBig(by)], C = [paraBig(cx), paraBig(cy)];
    var d = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    return d > BI(0) ? 1 : (d < BI(0) ? -1 : 0);
  }
  function noSegmento(a, b, p) {                                   // p colinear a a-b: está dentro do envelope?
    return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
  }
  /** segmentos fechados a-b e c-d se tocam? */
  function seCruzam(a, b, c, d) {
    var o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
    var o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && noSegmento(a, b, c)) return true;
    if (o2 === 0 && noSegmento(a, b, d)) return true;
    if (o3 === 0 && noSegmento(c, d, a)) return true;
    if (o4 === 0 && noSegmento(c, d, b)) return true;
    return false;
  }
  function distPontoSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    if (l2 === 0) return norm2(sub2(p, a));
    var r = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    if (r <= 0) return norm2(sub2(p, a));
    if (r >= 1) return norm2(sub2(p, b));
    var s = ((a[1] - p[1]) * dx - (a[0] - p[0]) * dy) / l2;
    return Math.abs(s) * Math.sqrt(l2);
  }
  function distSegSeg(a, b, c, d) {
    if (seCruzam(a, b, c, d)) return 0;
    return Math.min(distPontoSeg(a, c, d), distPontoSeg(b, c, d), distPontoSeg(c, a, b), distPontoSeg(d, a, b));
  }
  /** ponto de interseção de dois segmentos NÃO paralelos (ou null) */
  function pontoInterseccao(a, b, c, d) {
    var r = sub2(b, a), s = sub2(d, c), den = r[0] * s[1] - r[1] * s[0];
    if (den === 0) return null;
    var t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
    return [a[0] + t * r[0], a[1] + t * r[1]];
  }

  /** corta o segmento A→B (λ∈[0,1]) pelo intervalo lo ≤ f(P) ≤ hi, com f(λ) = f0 + λ(f1−f0); iv = [λ0, λ1] */
  function cortaFaixa(f0, f1, lo, hi, iv) {
    var d = f1 - f0;
    if (d === 0) return f0 >= lo && f0 <= hi;
    var l0 = (lo - f0) / d, l1 = (hi - f0) / d, t;
    if (l0 > l1) { t = l0; l0 = l1; l1 = t; }
    if (l0 > iv[0]) iv[0] = l0;
    if (l1 < iv[1]) iv[1] = l1;
    return iv[0] <= iv[1];
  }
  /** segmento A→B ∩ retângulo "faixa" de qa→qb com largura w e pontas retas (buffer cap_style=2): [λ0, λ1] ou null */
  function cortaRetanguloLinha(A, B, qa, qb, w) {
    var dq = sub2(qb, qa), qL = norm2(dq);
    if (qL === 0) return null;
    var qu = [dq[0] / qL, dq[1] / qL], qn = [-qu[1], qu[0]];
    var iv = [0, 1];
    var sA = dot2(sub2(A, qa), qu), sB = dot2(sub2(B, qa), qu), tA = dot2(sub2(A, qa), qn), tB = dot2(sub2(B, qa), qn);
    if (!cortaFaixa(sA, sB, 0, qL, iv)) return null;
    if (!cortaFaixa(tA, tB, -w / 2.0, w / 2.0, iv)) return null;
    return iv;
  }
  /** segmento A→B ∩ caixa [x0,y0,x1,y1]: [λ0, λ1] ou null */
  function cortaCaixa(A, B, bx) {
    var iv = [0, 1];
    if (!cortaFaixa(A[0], B[0], bx[0], bx[2], iv)) return null;
    if (!cortaFaixa(A[1], B[1], bx[1], bx[3], iv)) return null;
    return iv;
  }
  function dentroPoligono(x, y, ring) {                           // ray casting
    var dentro = false, n = ring.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) dentro = !dentro;
    }
    return dentro;
  }
  /** intervalos λ de A→B dentro do polígono simples `ring` */
  function intervalosPoligono(A, B, ring) {
    var ps = [0, 1], n = ring.length, i;
    var r = sub2(B, A);
    for (i = 0; i < n; i++) {
      var c = ring[i], d = ring[(i + 1) % n], s = sub2(d, c), den = r[0] * s[1] - r[1] * s[0];
      if (den === 0) continue;
      var t = ((c[0] - A[0]) * s[1] - (c[1] - A[1]) * s[0]) / den, u = ((c[0] - A[0]) * r[1] - (c[1] - A[1]) * r[0]) / den;
      if (u >= 0 && u <= 1 && t > 0 && t < 1) ps.push(t);
    }
    ps.sort(function (p, q) { return p - q; });
    var out = [];
    for (i = 0; i + 1 < ps.length; i++) {
      if (ps[i + 1] - ps[i] <= 1e-13) continue;
      var m = (ps[i] + ps[i + 1]) / 2;
      if (dentroPoligono(A[0] + m * r[0], A[1] + m * r[1], ring)) {
        if (out.length && out[out.length - 1][1] === ps[i]) out[out.length - 1][1] = ps[i + 1];
        else out.push([ps[i], ps[i + 1]]);
      }
    }
    return out;
  }
  function uniaoIntervalos(iv) {
    iv = iv.slice().sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    iv.forEach(function (t) {
      var u = out[out.length - 1];
      if (u && t[0] <= u[1]) { if (t[1] > u[1]) u[1] = t[1]; } else out.push([t[0], t[1]]);
    });
    return out;
  }
  function subtraiIntervalos(a, b) {
    var out = [];
    a.forEach(function (t) {
      var ini = t[0];
      b.forEach(function (u) {
        if (u[1] <= ini || u[0] >= t[1]) return;
        if (u[0] > ini) out.push([ini, u[0]]);
        ini = Math.max(ini, u[1]);
      });
      if (ini < t[1]) out.push([ini, t[1]]);
    });
    return out;
  }

  /** envoltória convexa (anti-horário), sem pontos colineares */
  function envoltoria(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cruz(o, a, b) { return orient(o[0], o[1], a[0], a[1], b[0], b[1]); }
    var inf = [], sup = [], i;
    for (i = 0; i < p.length; i++) { while (inf.length >= 2 && cruz(inf[inf.length - 2], inf[inf.length - 1], p[i]) <= 0) inf.pop(); inf.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (sup.length >= 2 && cruz(sup[sup.length - 2], sup[sup.length - 1], p[i]) <= 0) sup.pop(); sup.push(p[i]); }
    inf.pop(); sup.pop();
    return inf.concat(sup);
  }
  /**
   * buffer positivo de um polígono CONVEXO anti-horário, junta redonda — como o GEOS
   * (quad_segs = 16): em cada vértice, do fim do deslocamento da aresta que chega até o início
   * da que sai, nSegs = int(ângulo/quantum + 0,5) passos iguais.
   */
  function bufferConvexo(ring, d, quadSegs) {
    quadSegs = quadSegs || 16;
    var quantum = Math.PI / 2 / quadSegs, n = ring.length, out = [];
    /* o GEOS percorre o anel NA ORDEM DADA: anel horário -> deslocamento à esquerda; anti-horário -> à direita
       (importa no atalho de vértices quase colineares, que fica com o fim do deslocamento da aresta que chega) */
    var horario = areaAnel(ring) < 0, lado = horario ? 1 : -1;
    function desloc(p0, p1) {
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.sqrt(dx * dx + dy * dy);
      var ux = lado * d * dx / len, uy = lado * d * dy / len;
      return [[p0[0] - uy, p0[1] + ux], [p1[0] - uy, p1[1] + ux]];
    }
    for (var i = 0; i < n; i++) {
      var P = ring[(i + n - 1) % n], V = ring[i], N = ring[(i + 1) % n];
      var o0 = desloc(P, V), o1 = desloc(V, N);
      var p0 = o0[1], p1 = o1[0];
      if (Math.sqrt(Math.pow(p0[0] - p1[0], 2) + Math.pow(p0[1] - p1[1], 2)) < d * 1e-3) { out.push(p0); continue; }
      out.push(p0);
      var a0 = Math.atan2(p0[1] - V[1], p0[0] - V[0]), a1 = Math.atan2(p1[1] - V[1], p1[0] - V[0]);
      if (horario) { if (a0 <= a1) a0 += 2 * Math.PI; } else if (a0 >= a1) a0 -= 2 * Math.PI;
      var total = Math.abs(a0 - a1), nSegs = Math.floor(total / quantum + 0.5);
      if (nSegs >= 1) {
        var inc = total / nSegs;
        for (var k = 1; k < nSegs; k++) {
          var ang = a0 + (horario ? -1 : 1) * k * inc;
          out.push([V[0] + d * Math.cos(ang), V[1] + d * Math.sin(ang)]);
        }
      }
      out.push(p1);
    }
    return out;
  }
  function caixaAnel(b) { return [[b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]; }   // anti-horário (como box())
  function areaAnel(r) { var s = 0; for (var i = 0; i < r.length; i++) { var j = (i + 1) % r.length; s += r[i][0] * r[j][1] - r[j][0] * r[i][1]; } return s / 2; }
  /** Sutherland–Hodgman: polígono `sujeito` cortado pelo convexo anti-horário `clip` */
  function recorta(sujeito, clip) {
    var saida = sujeito.slice();
    for (var i = 0; i < clip.length && saida.length; i++) {
      var A = clip[i], B = clip[(i + 1) % clip.length], ent = saida; saida = [];
      var dentro = function (p) { return (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= 0; };
      for (var j = 0; j < ent.length; j++) {
        var C = ent[j], D = ent[(j + 1) % ent.length], cd = dentro(C), dd = dentro(D);
        if (cd) saida.push(C);
        if (cd !== dd) saida.push(pontoInterseccao(A, B, C, D) || pontoInterseccao(C, D, A, B));
      }
    }
    return saida;
  }
  function contemCaixa(b, x, y) { return b[0] < x && x < b[2] && b[1] < y && y < b[3]; }

  /* ------------------------------------------------------------------ área carregada */
  /**
   * AREA = painéis ∪ (caixa ∩ buffer(envoltória dos painéis, folga)) − tampas   (com a caixa e a folga da `areaExtra`)
   * comprimento(A, B) = comprimento do segmento A→B dentro da área; area da caixa∩buffer p/ a carga dos tijolos
   */
  function criarArea(paineis, caixaExtra, folga, tampas) {
    var aneis = paineis.map(function (c) { return c.map(function (q) { return [q[0], q[1]]; }); });
    var todos = []; aneis.forEach(function (r) { r.forEach(function (q) { todos.push(q); }); });
    var buf = null, extraRing = null;
    if (caixaExtra && todos.length) {
      buf = bufferConvexo(envoltoria(todos).reverse(), folga, 16);   // anel horário, como o convex_hull do GEOS
      extraRing = recorta(buf, caixaAnel(caixaExtra));
    }
    var tamp = (tampas || []).map(function (c) { return c.map(function (q) { return [q[0], q[1]]; }); });
    return {
      caixaExtra: caixaExtra, buffer: buf, extraRing: extraRing,
      comprimento: function (A, B) {
        var iv = [], i;
        for (i = 0; i < aneis.length; i++) iv = iv.concat(intervalosPoligono(A, B, aneis[i]));
        if (buf) {
          var c = cortaCaixa(A, B, caixaExtra);
          if (c) iv = iv.concat(intervalosPoligono(A, B, buf).map(function (t) { return [Math.max(t[0], c[0]), Math.min(t[1], c[1])]; }).filter(function (t) { return t[1] > t[0]; }));
        }
        iv = uniaoIntervalos(iv);
        var ti = [];
        for (i = 0; i < tamp.length; i++) ti = ti.concat(intervalosPoligono(A, B, tamp[i]));
        iv = subtraiIntervalos(iv, uniaoIntervalos(ti));
        var L = norm2(sub2(B, A)), s = 0;
        iv.forEach(function (t) { s += (t[1] - t[0]); });
        return s * L;
      },
      /** área de (caixa ∩ AREA) = caixa ∩ buffer − tampas */
      areaCaixa: function () {
        if (!extraRing) return 0;
        var a = Math.abs(areaAnel(extraRing)), clip = extraRing.slice();
        if (areaAnel(clip) < 0) clip.reverse();
        tamp.forEach(function (t) { var r = recorta(t, clip); if (r.length > 2) a -= Math.abs(areaAnel(r)); });
        return a;
      }
    };
  }

  /* ------------------------------------------------------------------ peças */
  function cx(p) {
    var a = [Number(p.p0[0]), Number(p.p0[1]), Number(p.p0[2])], b = [Number(p.p1[0]), Number(p.p1[1]), Number(p.p1[2])];
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1e-9;
    var bw = p.secao_cm[0] / 100.0, hh = p.secao_cm[1] / 100.0, zc = (a[2] + b[2]) / 2.0;
    return { p: p, a: a, b: b, a2: [a[0], a[1]], b2: [b[0], b[1]], u: [dx / L, dy / L], L: L, bw: bw, hh: hh, zb: zc - hh / 2.0, zt: zc + hh / 2.0 };
  }
  function ponto(c, x) { return [c.a2[0] + c.u[0] * x, c.a2[1] + c.u[1] * x]; }     // a[:2] + u * x

  /* ------------------------------------------------------------------ verificação (MadDim + convenções do Python) */
  /**
   * Chama MadDim.vigaFletida e devolve { v (arredondado como no Python), R } com R indexado como o `reac` do
   * Python: chave = String(round(nó, 4)) — ver nota de FIDELIDADE no topo.
   */
  function verificar(cfg, L, ap, gd, gp, qd, qp, b, h) {
    var caso = { L: L, ap: ap.slice(), gd: gd.map(function (t) { return t.slice(); }), gp: gp.map(function (t) { return t.slice(); }),
                 qd: qd.map(function (t) { return t.slice(); }), qp: qp.map(function (t) { return t.slice(); }), b: b, h: h };
    if (cfg.rastro) cfg.rastro.push(copiaProf(caso));
    var r = MD.vigaFletida({ L: L, apoios: ap, G: { d: gd, p: gp }, Q: { d: qd, p: qp }, b: b, h: h, classe: cfg.classe, perfil: cfg.perfil });
    var v = { Md_kNm: pyRound(r.Md, 2), Vd_kN: pyRound(r.Vd, 2), eta_flexao: pyRound(r.eta_flexao, 3),
              eta_cisalh: pyRound(r.eta_cisalh, 3), eta_flecha: pyRound(r.eta_flecha, 3) };
    var nos = ap.map(function (a) { return r6js(clamp(a, 0, L)); }).sort(function (x, y) { return x - y; });
    var R = {}, vistos = {};
    nos.forEach(function (nx) {
      if (vistos[nx]) return; vistos[nx] = true;
      var rr = r.reacoes[String(r4js(nx))];
      if (rr) R[String(pyRound(nx, 4))] = rr;
    });
    return { v: v, R: R, caso: caso };
  }
  /** R04: reação do apoio em x pelo NÓ MAIS PRÓXIMO (R indexado por String(round(nó,4))). `quem` (opcional) registra em `perda` o apoio
   *  que a busca antiga (chave round(x,4)) zeraria — como o PERDA do Python. */
  function reacaoNo(R, x, L, perda, quem) {
    var ks = Object.keys(R);
    if (!ks.length) return [0.0, 0.0];
    var xc = clamp(x, 0.0, L), melhor = null, dm = Infinity;
    ks.map(function (kk) { return [kk, parseFloat(kk)]; }).sort(function (p, q) { return p[1] - q[1]; }).forEach(function (t) {
      var d = Math.abs(t[1] - xc);
      if (d < dm) { dm = d; melhor = t; }
    });
    if (quem && !(String(pyRound(xc, 4)) in R)) {
      var rr = R[melhor[0]];
      perda.apoios += 1; perda.G_kN += rr[0]; perda.Q_kN += rr[1];
      perda.casos.push(quem + " x=" + xc.toFixed(4) + " nó=" + melhor[1].toFixed(4) + " G=" + rr[0].toFixed(2) + " Q=" + rr[1].toFixed(2));
    }
    return R[melhor[0]];
  }
  function reacaoDe(cfg, R, x, L) {
    var k = String(pyRound(clamp(x, 0.0, L), 4));
    if (R[k]) return R[k];
    if (cfg.reacaoPorNo) {                                          // corrige a perda silenciosa do Python
      var melhor = null, dm = Infinity;
      Object.keys(R).forEach(function (kk) { var d = Math.abs(parseFloat(kk) - x); if (d < dm) { dm = d; melhor = kk; } });
      if (melhor !== null && dm < 5e-4) return R[melhor];
    }
    return [0.0, 0.0];
  }

  /* ------------------------------------------------------------------ calcular */
  /**
   * MadPiso.calcular(entradas, opcoes)
   *   entradas = {
   *     pecas: [...],                       peças do modelo de madeira (grupo, p0, p1, secao_cm, id, marca, nome, painel, massa_kg, rebaixo_apoio_cm)
   *     pilaretes: [{id, x, y, xt, yt, topo, dx_t, dy_t}],
   *     paineis: [[[x,y],...], ...],        contornos dos painéis do piso (modelo de madeira)
   *     tampas: [[[x,y],...], ...],         alçapões (fora da área carregada dos barrotes)
   *     nTijolos: n,                        peças de tijolo na zona do tijolo
   *     cype: { esforcos },                 (opcional) base dos pilares — resultados do CYPE
   *     holdDowns: [{ligacao, Td_kN}], ferragens: [{ligacao, tipo, ini}]   (opcional)
   *   }
   *   opcoes = { classe, perfil, zonas, G, Q, areaExtra, tijolo, ..., rastro: [] } — ver PADRAO e QUIOSQUE
   * → { cargasZona, paredes, pecas, reacoesPilaretes, etaMax, avisos, cargasAreaBarrotes, gTijolo }
   */
  MadPiso.calcular = function (entradas, opcoes) {
    var cfg = {}, k;
    for (k in PADRAO) cfg[k] = PADRAO[k];
    for (k in QUIOSQUE) cfg[k] = QUIOSQUE[k];
    opcoes = opcoes || {};
    for (k in opcoes) cfg[k] = opcoes[k];
    var GR = cfg.grupos, RHO = cfg.rho, GRAV = cfg.g;
    var R04 = cfg.revisao !== "R03";
    var PERDA = { apoios: 0, G_kN: 0.0, Q_kN: 0.0, casos: [] };
    function reacao(R, x, L, quem) { return R04 ? reacaoNo(R, x, L, PERDA, quem) : reacaoDe(cfg, R, x, L); }
    var P = entradas.pecas;
    var LOG = [];

    var G_Z = {}, Q_Z = {};
    for (k in cfg.G) G_Z[k] = cfg.G[k];
    for (k in cfg.Q) Q_Z[k] = cfg.Q[k];

    /* ---- zonas e área carregada */
    var caixaExtra = null;
    cfg.zonas.forEach(function (z) { if (cfg.areaExtra && z[0] === cfg.areaExtra.zona) caixaExtra = z[1]; });
    var AREA = criarArea(entradas.paineis, caixaExtra, cfg.areaExtra ? cfg.areaExtra.folga : 0, entradas.tampas);
    function zona(x, y) {
      for (var i = 0; i < cfg.zonas.length; i++) if (contemCaixa(cfg.zonas[i][1], x, y)) return cfg.zonas[i][0];
      return cfg.zonaPadrao;
    }
    var nTij = entradas.nTijolos || 0;
    var gTijolo = nTij * cfg.tijolo.massaKg * GRAV / pyMax(AREA.areaCaixa(), 1.0);
    G_Z[cfg.tijolo.zona] = G_Z[cfg.tijolo.zona] + gTijolo;

    var VP = [], BAR = [], REQ = [], PILPEC = [];
    P.forEach(function (p) {
      if (p.grupo === GR.viga) VP.push(cx(p));
      else if (p.grupo === GR.barrote) BAR.push(cx(p));
      else if (p.grupo === GR.requadro) REQ.push(cx(p));
      else if (p.grupo === GR.pilar) PILPEC.push(cx(p));
    });
    var pil = entradas.pilaretes;
    var PILR = {}, PILR_IDS = [];
    pil.forEach(function (pt) {
      PILR_IDS.push(pt.id);
      PILR[pt.id] = [pt.xt - pt.dx_t / 2, pt.yt - pt.dy_t / 2, pt.xt + pt.dx_t / 2, pt.yt + pt.dy_t / 2];
    });
    var PILR_BUF = {};                                              // buffer(0,05) e buffer(0,02) do retângulo do pilarete
    function bufPil(id, d) {
      var kk = id + "|" + d;
      if (!PILR_BUF[kk]) PILR_BUF[kk] = bufferConvexo(caixaAnel(PILR[id]), d, 16);
      return PILR_BUF[kk];
    }
    function distCaixaPonto(bx, x, y) {
      var dx = Math.max(bx[0] - x, 0, x - bx[2]), dy = Math.max(bx[1] - y, 0, y - bx[3]);
      return Math.sqrt(dx * dx + dy * dy);
    }

    /* ---- paredes (guia inferior) com carga linear */
    var massaPn = {}, compPn = {}, PAREDES = [];
    P.forEach(function (p) {
      if (p.painel && p.grupo.indexOf(GR.prefixoWF) === 0) massaPn[p.painel] = (massaPn[p.painel] || 0.0) + (p.massa_kg || 0.0);
    });
    P.forEach(function (p) {
      if (p.grupo === GR.guiaInf) {
        var a = [p.p0[0], p.p0[1]], b = [p.p1[0], p.p1[1]];
        compPn[p.painel] = (compPn[p.painel] || 0.0) + norm2(sub2(b, a));
        PAREDES.push({ painel: p.painel, a: a, b: b });
      }
    });
    PAREDES.forEach(function (w) {
      w.g = (massaPn[w.painel] || 0.0) * GRAV / pyMax(compPn[w.painel] || 0.0, 0.1) + cfg.gRevestParede;
      var dd = sub2(w.b, w.a), nn = norm2(dd) || 1;
      w.wu = [dd[0] / nn, dd[1] / nn];
    });

    var AREA_BAR = {};
    var CARGA = {};                                                 // id da VP -> [[ponto, G, Q]]
    function carga(id) { return CARGA[id] || (CARGA[id] = []); }
    var res = [];

    /* ================= barrotes ================= */
    BAR.forEach(function (c) {
      var p = c.p, a = c.a, u = c.u, L = c.L, bw = c.bw, hh = c.hh, a2 = c.a2;
      var ap = [], quem = [], i;
      VP.forEach(function (q) {
        /* barrote com rebaixo (ducha 16x20, 11/10): o fundo passa abaixo do topo da VP pela altura do rebaixo */
        if (Math.abs(q.zt - c.zb) > cfg.tolApoioViga + (p.rebaixo_apoio_cm || 0.0) / 100.0 || Math.abs(dot2(q.u, u)) > cfg.tolParalelo) return;
        var iv = cortaRetanguloLinha(c.a2, c.b2, q.a2, q.b2, q.bw);
        if (!iv) return;
        var Lseg = norm2(sub2(c.b2, c.a2));
        if ((iv[1] - iv[0]) * Lseg < 0.01) return;
        var lm = (iv[0] + iv[1]) / 2, m = [c.a2[0] + lm * (c.b2[0] - c.a2[0]), c.a2[1] + lm * (c.b2[1] - c.a2[1])];
        ap.push(dot2(sub2(m, a2), u));
        quem.push(q.p.id);
      });
      /* ponta no pilar composto (barrote da fila no pilar B): apoio na própria ponta */
      [[0.0, 0], [L, 1]].forEach(function (tl) {
        var t = tl[0], lado = tl[1], E = [a2[0] + u[0] * t, a2[1] + u[1] * t];
        if (ap.some(function (x) { return Math.abs(t - x) < cfg.tolPonta.filtro; })) return;
        for (var j = 0; j < PILPEC.length; j++) {
          if (norm2(sub2(PILPEC[j].a2, E)) < cfg.tolPonta.pilar) {
            ap.push(clamp(t + (lado === 0 ? cfg.tolPonta.deslocPilar : -cfg.tolPonta.deslocPilar), 0.0, L));
            quem.push("pilar");
            break;
          }
        }
      });
      /* ponta encostada no requadro do alçapão (cabeceira levada até os barrotes vizinhos — V13): apoio na ponta */
      [0.0, L].forEach(function (t) {
        var tolCab = (R04 && ap.length < 2) ? cfg.tolCabeceiraUmApoio : cfg.tolPonta.requadro;
        if (ap.some(function (x) { return Math.abs(t - x) < tolCab; })) return;
        var E = [a2[0] + u[0] * t, a2[1] + u[1] * t];
        for (var j = 0; j < REQ.length; j++) {
          var q = REQ[j];
          if (Math.abs(dot2(q.u, u)) < 0.3 && distPontoSeg(E, q.a2, q.b2) < q.bw / 2.0 + cfg.tolPonta.requadroDist) {
            ap.push(Math.min(Math.max(t, 0.03), L - 0.03));
            quem.push("pilar");                                    // carga da cabeceira vai aos barrotes vizinhos (não é somada de novo)
            break;
          }
        }
      });
      var jj = MV.juntarApoios(ap, quem, cfg.juntarTol);
      ap = jj.apoios; quem = jj.quem;
      var poucos = ap.length < 2;                                   // faixa de carga calculada mesmo assim
      /* largura de influência: meia distância aos barrotes paralelos vizinhos (≤ 0,8 m de cada lado) */
      var gd = [[0.0, L, RHO * GRAV * bw * hh]], qd = [], gp = [];
      var trib = [];                                                // R04: (s0, s1, largura da faixa do barrote) — carga de parede que cruza
      var n = Math.max(cfg.minFaixas, Math.floor(L / cfg.passoBarrote));
      var vizinhos = BAR.concat(REQ);                               // requadro do alçapão também é vizinho
      var nrm = [-u[1], u[0]];
      for (var kf = 0; kf < n; kf++) {
        var s0 = L * kf / n, s1 = L * (kf + 1) / n;
        var tm = (s0 + s1);
        var mpt = [a2[0] + (u[0] * tm) / 2.0, a2[1] + (u[1] * tm) / 2.0];
        var lados = [];
        [1, -1].forEach(function (sg) {
          var dmin = cfg.larguraMax;                                // sem vizinho: no máximo 0,40 m de faixa (borda/alçapão: testeira ou requadro)
          for (var jv = 0; jv < vizinhos.length; jv++) {
            var o = vizinhos[jv];
            if (o === c) continue;
            if (Math.abs(Math.abs(dot2(o.u, u)) - 1) > 0.02) continue;
            var d = dot2(sub2(o.a2, mpt), nrm) * sg;
            var t = dot2(sub2(mpt, o.a2), o.u);
            if (cfg.vizinhoMin < d && d < dmin && -0.05 <= t && t <= o.L + 0.05) dmin = d;
          }
          lados.push(dmin < cfg.larguraMax ? dmin / 2.0 : cfg.larguraSemVizinho);
        });
        var fa = [mpt[0] - nrm[0] * lados[1], mpt[1] - nrm[1] * lados[1]], fb = [mpt[0] + nrm[0] * lados[0], mpt[1] + nrm[1] * lados[0]];
        var larg = AREA.comprimento(fa, fb);
        var z = zona(mpt[0], mpt[1]);
        gd.push([s0, s1, G_Z[z] * larg]);
        qd.push([s0, s1, Q_Z[z] * larg]);
        trib.push([s0, s1, lados[0] + lados[1]]);
      }
      /* faixas de área (sem peso próprio e sem paredes) para o modelo do CYPE 3D */
      var areaB = { G: gd.slice(1).map(function (t) { return [pyRound(t[0], 4), pyRound(t[1], 4), pyRound(t[2], 4)]; }),
                    Q: qd.map(function (t) { return [pyRound(t[0], 4), pyRound(t[1], 4), pyRound(t[2], 4)]; }) };
      AREA_BAR[p.id] = areaB;
      if (poucos) {
        LOG.push("barrote " + p.marca + " (" + p.id.slice(0, 8) + ") com " + ap.length + " apoio(s)");
        if (R04 && ap.length === 1) {                               // a carga ia para lugar nenhum: vai inteira ao apoio
          var totG = 0.0, totQ = 0.0;
          gd.forEach(function (t) { totG += t[2] * (t[1] - t[0]); });
          qd.forEach(function (t) { totQ += t[2] * (t[1] - t[0]); });
          var qids1 = quem[0].filter(function (q) { return q !== "pilar"; });
          qids1.forEach(function (qid) { carga(qid).push([ponto(c, ap[0]), totG / qids1.length, totQ / qids1.length]); });
          if (!qids1.length) LOG.push("   (carga de " + totG.toFixed(2) + " kN G / " + totQ.toFixed(2) + " kN Q vai ao pilar composto ou à cabeceira — fora deste cálculo)");
        }
        return;
      }
      /* parede sobre o barrote (paralela, a ≤ 6 cm) ou cruzando o barrote fora de VP */
      PAREDES.forEach(function (w) {
        var par = Math.abs(Math.abs(dot2(w.wu, u)) - 1) < 0.02;
        if (par && distSegSeg(c.a2, c.b2, w.a, w.b) < cfg.paredeDistBarrote) {
          var s_ = [dot2(sub2(w.a, a2), u), dot2(sub2(w.b, a2), u)].sort(function (x, y) { return x - y; });
          if (s_[1] > 0 && s_[0] < L) gd.push([pyMax(s_[0], 0), Math.min(s_[1], L), w.g]);
        } else if (Math.abs(dot2(w.wu, u)) < 0.1 && seCruzam(c.a2, c.b2, w.a, w.b)) {
          var ip = pontoInterseccao(c.a2, c.b2, w.a, w.b);
          if (ip) {
            var sIp = dot2(sub2(ip, a2), u), largIp = cfg.paredeFatorCruzada;
            if (R04) {                                              // faixa do PRÓPRIO barrote (meia distância aos vizinhos)
              for (var it = 0; it < trib.length; it++) if (trib[it][0] - 1e-6 <= sIp && sIp <= trib[it][1] + 1e-6) { largIp = trib[it][2]; break; }
            }
            gp.push([sIp, w.g * largIp]);
          }
        }
      });
      var vr = verificar(cfg, L, ap, gd, gp, qd, [], bw, hh);
      res.push({ id: p.id, marca: p.marca, grupo: p.grupo, nome: p.nome, secao_cm: p.secao_cm,
                 L: pyRound(L, 3), zona: zona((a2[0] + c.b2[0]) / 2, (a2[1] + c.b2[1]) / 2), verif: vr.v, cargas_area: areaB, casoViga: vr.caso });
      ap.forEach(function (x, ix) {
        var gq = reacao(vr.R, x, L, "barrote " + p.marca), qids = quem[ix].filter(function (q) { return q !== "pilar"; });
        qids.forEach(function (qid) { carga(qid).push([ponto(c, x), gq[0] / qids.length, gq[1] / qids.length]); });
      });
    });

    /* ================= VPs (inclui VA, VBN, ducha) — apoios: pilaretes e VP sob a ponta ================= */
    function pontaLivre(q) {
      return [q.a2, q.b2].some(function (e) {
        return !PILR_IDS.some(function (id) { return dentroPoligono(e[0], e[1], bufPil(id, cfg.pontaVP.tolPilarete)); });
      });
    }
    var ordem = VP.map(function (q, i) { return { q: q, i: i, k: pontaLivre(q) ? 0 : 1 }; })
      .sort(function (x, y) { return x.k - y.k || x.i - y.i; }).map(function (t) { return t.q; });
    var LAT = {}, REAC = {}, resVP = [];
    for (var passe = 0; passe < cfg.passesVP; passe++) {
      REAC = {};
      var LAT_N = {};
      resVP = [];
      /* eslint-disable no-loop-func */
      ordem.forEach(function (c) {
        var p = c.p, u = c.u, L = c.L, bw = c.bw, hh = c.hh, a2 = c.a2;
        var ap = [], quem = [];
        PILR_IDS.forEach(function (pid) {
          var iv = cortaCaixa(c.a2, c.b2, PILR[pid]);
          if (!iv) return;
          var Lseg = norm2(sub2(c.b2, c.a2));
          if ((iv[1] - iv[0]) * Lseg > cfg.pontaVP.minInterseccao) {
            var lm = (iv[0] + iv[1]) / 2, m = [c.a2[0] + lm * (c.b2[0] - c.a2[0]), c.a2[1] + lm * (c.b2[1] - c.a2[1])];
            ap.push(dot2(sub2(m, a2), u));
            quem.push(["pil", pid]);
          }
        });
        [0.0, L].forEach(function (t) {                             // ponta encostada na lateral de outra VP (mesmo nível)
          if (ap.some(function (x) { return Math.abs(t - x) < cfg.pontaVP.filtro; })) return;
          var E = [a2[0] + u[0] * t, a2[1] + u[1] * t];
          for (var j = 0; j < VP.length; j++) {
            var q = VP[j];
            if (q === c) continue;
            if (Math.abs(q.zt - c.zt) < cfg.pontaVP.nivel && distPontoSeg(E, q.a2, q.b2) < q.bw / 2.0 + cfg.pontaVP.dist) {
              ap.push(Math.min(Math.max(t, cfg.pontaVP.desloc), L - cfg.pontaVP.desloc));
              quem.push(["vp", q.p.id]);
              break;
            }
          }
        });
        var jj = MV.juntarApoios(ap, quem, cfg.juntarTol);
        ap = jj.apoios;
        quem = jj.quem.map(function (g) { return g[0]; });
        if (ap.length < 2) {
          if (passe === cfg.passesVP - 1) LOG.push("VP " + p.marca + " (" + p.nome.slice(0, 30) + ") com " + ap.length + " apoio(s)");
          if (!ap.length) return;
        }
        var gd = [[0.0, L, RHO * GRAV * bw * hh]];
        var lista = (CARGA[p.id] || []).concat(LAT[p.id] || []);
        var gp = lista.map(function (t) { return [dot2(sub2(t[0], a2), u), t[1]]; });
        var qp = lista.map(function (t) { return [dot2(sub2(t[0], a2), u), t[2]]; });
        PAREDES.forEach(function (w) {                              // parede sobre a VP (via bloqueios/dormente)
          if (Math.abs(Math.abs(dot2(w.wu, u)) - 1) < 0.02 && distSegSeg(c.a2, c.b2, w.a, w.b) < bw / 2.0 + cfg.paredeFolgaVP) {
            var s_ = [dot2(sub2(w.a, a2), u), dot2(sub2(w.b, a2), u)].sort(function (x, y) { return x - y; });
            if (s_[1] > 0 && s_[0] < L) gd.push([pyMax(s_[0], 0), Math.min(s_[1], L), w.g + RHO * GRAV * bw * cfg.alturaBloqueioVP]);
          }
        });
        if (ap.length === 1) {                                      // balanço puro (não deveria): só reação, sem verificação
          var totG = soma(gd.map(function (t) { return t[2] * (t[1] - t[0]); })) + soma(gp.map(function (t) { return t[1]; }));
          var totQ = soma(qp.map(function (t) { return t[1]; }));
          var rr = REAC[quem[0][1]] || (REAC[quem[0][1]] = [0.0, 0.0]);
          rr[0] += totG; rr[1] += totQ;
          return;
        }
        var vr = verificar(cfg, L, ap, gd, gp, [], qp, bw, hh);
        resVP.push({ id: p.id, marca: p.marca, grupo: p.grupo, nome: p.nome, secao_cm: p.secao_cm, L: pyRound(L, 3),
                     zona: zona((a2[0] + c.b2[0]) / 2, (a2[1] + c.b2[1]) / 2), verif: vr.v, casoViga: vr.caso });
        ap.forEach(function (x, ix) {
          var tipo = quem[ix][0], qid = quem[ix][1], gq = reacao(vr.R, x, L, passe === 2 ? "VP " + p.marca + " (passada " + (passe + 1) + ")" : "");
          if (tipo === "pil") {
            var r2 = REAC[qid] || (REAC[qid] = [0.0, 0.0]);
            r2[0] += gq[0]; r2[1] += gq[1];
          } else {
            (LAT_N[qid] || (LAT_N[qid] = [])).push([ponto(c, x), gq[0], gq[1]]);
          }
        });
      });
      LAT = LAT_N;
    }
    res = res.concat(resVP);

    /* ================= superestrutura: base dos pilares (CYPE) e hold-downs por pilarete ================= */
    var baseP = {};
    var cm = cfg.cypeParaMadeira;
    if (entradas.cype && entradas.cype.esforcos) {
      Object.keys(entradas.cype.esforcos).forEach(function (bar) {
        var e = entradas.cype.esforcos[bar];
        if (e.grupo !== "PILAR") return;
        var m = /x ([\d.]+) y ([\d.]+)/.exec(e.desc);
        if (!m) return;
        var xc = parseFloat(m[1]), yc = parseFloat(m[2]);
        var xt = cm.xt0 - yc, yt = xc + cm.yt0;
        var best = null, db = Infinity;
        PILR_IDS.forEach(function (id) { var d = distCaixaPonto(PILR[id], xt, yt); if (d < db) { db = d; best = id; } });
        if (db > cm.tolPilarete) return;
        var d = {};
        cfg.hipoteses.forEach(function (h) {
          var f = e.hip[h];
          if (!vazio(f)) d[h] = { N: -f.N[0], Vy: f.Vy[0], Vz: f.Vz[0], My: f.My[0], Mz: f.Mz[0] };
        });
        baseP[best] = d;
      });
    }
    var hd = {};
    try {
      if (!entradas.holdDowns) throw new Error("calc_piso.json ausente");
      entradas.holdDowns.forEach(function (r) {
        var f_ = (entradas.ferragens || []).filter(function (f) { return f.ligacao === r.ligacao && f.tipo === "M16 HD"; });
        if (f_.length) {
          var x = f_[0].ini[0], y = f_[0].ini[1], best = null, db = Infinity;
          PILR_IDS.forEach(function (id) { var d = distCaixaPonto(PILR[id], x, y); if (d < db) { db = d; best = id; } });
          hd[best] = (hd[best] || 0.0) + r.Td_kN / 1.4;
        }
      });
    } catch (ex) { LOG.push("hold-downs: " + ex.message); }

    var topoMadeira = cfg.topoMadeira;
    if (R04) topoMadeira = typeof entradas.topoMadeira === "number" ? entradas.topoMadeira : (typeof opcoes.topoMadeira === "number" ? opcoes.topoMadeira : -0.58);
    var saida = [];
    pil.forEach(function (pt) {
      var rg = REAC[pt.id] || [0.0, 0.0], g_ = rg[0], q_ = rg[1];
      var bp = baseP[pt.id] || {};
      function Nde(h) { return bp[h] ? bp[h].N : 0.0; }
      var Gsup = Nde("Peso próprio") + Nde("CP"), Qsup = Nde("SCpiso") + Nde("SCcob");
      var casos = {
        G: { N: pyRound(g_ + Gsup, 2), Vx: 0.0, Vy: 0.0, M: 0.0, piso: pyRound(g_, 2), pilar: pyRound(Gsup, 2) },
        Q: { N: pyRound(q_ + Qsup, 2), Vx: 0.0, Vy: 0.0, M: 0.0, piso: pyRound(q_, 2), pilar: pyRound(Qsup, 2) }
      };
      ["V1", "V2", "V3", "V4"].forEach(function (h) {
        var f = bp[h] || {};
        /* eixos: CYPE (concepção) Vy//x_concepção? -> entregue no sistema da concepção (x = linha, y = fila), M no topo = 0 */
        casos[h] = { N: pyRound(f.N || 0.0, 2), Vx: pyRound(f.Vz || 0.0, 2), Vy: pyRound(f.Vy || 0.0, 2), M: 0.0 };
      });
      var tracao = pyRound(hd[pt.id] || 0.0, 2);
      var nmin = Math.min.apply(null, ["V1", "V2", "V3", "V4"].map(function (h) { return casos.G.N + casos[h].N; }));
      saida.push({ id: pt.id, x: pt.x, y: pt.y, xt: pt.xt, yt: pt.yt, topo_concreto: pt.topo, topo_madeira: topoMadeira,
                   dim_topo_m: [pt.dx_t, pt.dy_t], casos_kN: casos, tracao_hold_down_vento_kN: tracao,
                   N_min_G_mais_V_kN: pyRound(nmin - tracao, 2) });
    });

    /* ---- η máximo por grupo e critério */
    var eta = {}, etaOrdem = [];
    res.forEach(function (r) {
      ["eta_flexao", "eta_cisalh", "eta_flecha"].forEach(function (c) {
        var kk = r.grupo + "|" + c;
        if (!(kk in eta)) { eta[kk] = 0.0; etaOrdem.push(kk); }
        eta[kk] = Math.max(eta[kk], r.verif[c]);
      });
    });

    return {
      cargasZona: { G_Z_kN_m2: G_Z, Q_Z_kN_m2: Q_Z, G_revest_parede_kN_m: cfg.gRevestParede },
      paredes: PAREDES.map(function (w) {
        return { painel: w.painel, a: [pyRound(w.a[0], 4), pyRound(w.a[1], 4)], b: [pyRound(w.b[0], 4), pyRound(w.b[1], 4)], g_kN_m: pyRound(w.g, 4) };
      }),
      cargasAreaBarrotes: AREA_BAR,
      pecas: res,
      reacoesPilaretes: { versao: cfg.textos.versao, convencao: cfg.textos.convencao, nao_inclui: cfg.textos.naoInclui, pilaretes: saida, sem_apoio: LOG },
      etaMax: eta,
      avisos: LOG,
      gTijolo: pyRound(gTijolo, 3),
      perdaRound: PERDA,                                            // R04: o que a busca antiga round(x,4) zeraria (perda_round_R03 do Python)
      reacaoSomaPiso: [soma(Object.keys(REAC).map(function (id) { return REAC[id][0]; })), soma(Object.keys(REAC).map(function (id) { return REAC[id][1]; }))]
    };
  };

  /**
   * QUIOSQUE — monta `entradas` a partir dos arquivos do quiosque de referência (R03):
   *   { madeira: madeira_quiosque.json, sobreposicao: v18_sobreposicao.json, ligacoes: ligacoes_quiosque.json,
   *     cena: cena_V18.json, cype: resultados_R03.json, calcPiso: calc_piso.json }
   */
  MadPiso.entradasQuiosque = function (arq) {
    var cena = (arq.cena && arq.cena.objetos) || [], c = QUIOSQUE.cena;
    var pw = (arq.madeira && arq.madeira.piso_pw) || {};
    return {
      pecas: arq.madeira.pecas,
      pilaretes: (pw.pilaretes && pw.pilaretes.length ? pw.pilaretes : arq.sobreposicao.pilaretes_v18),   // com os pilaretes das DEFINIÇÕES RA
      paineis: arq.sobreposicao.paineis_v18.map(function (pn) { return pn.contorno_t; }),
      tampas: cena.filter(function (o) { return o.tag.indexOf(c.tampaTag) === 0 && o.tipo === c.tampaTipo && o.mat === c.tampaMat; })
        .map(function (o) { return o.ext; }),
      nTijolos: cena.filter(function (o) { return o.tag.indexOf(c.tijoloTag) === 0 && o.nome.indexOf(c.tijoloNome) >= 0; }).length,
      topoMadeira: pw.niveis && typeof pw.niveis.topo_pilarete === "number" ? pw.niveis.topo_pilarete : undefined,   // R04
      cype: arq.cype,
      holdDowns: arq.calcPiso && arq.calcPiso.hold_downs,
      ferragens: arq.ligacoes && arq.ligacoes.ferragens
    };
  };

  MadPiso.QUIOSQUE = QUIOSQUE;
  MadPiso.PADRAO = PADRAO;
  MadPiso._geo = { pyRound: pyRound, bufferConvexo: bufferConvexo, envoltoria: envoltoria, criarArea: criarArea, seCruzam: seCruzam,
                   distSegSeg: distSegSeg, orient: orient };

  if (typeof module !== "undefined" && module.exports) module.exports = MadPiso;
  else global.MadPiso = MadPiso;
})(typeof window !== "undefined" ? window : this);

/* =====================================================================
 * metalcorte.js — METÁLICA: LISTA DE CORTE COM APROVEITAMENTO DE BARRAS e
 * NESTING DE CHAPAS (motor PURO, ES5, sem DOM, Node-testável).
 *
 *   planoBarras(numeracao, cfg)   as peças de perfil (js/metalfab.js numerar)
 *                    agrupadas por PERFIL × AÇO e encaixadas nas barras
 *                    comerciais (6 m e 12 m, configurável) com a perda da
 *                    serra (mm) entre os cortes. Diz quantas barras comprar,
 *                    o plano de corte barra a barra, as SOBRAS reaproveitáveis
 *                    (acima de um mínimo) e a perda em kg e %.
 *   otimizarBarras(itens, cfg)    o empacotamento de UM grupo (o teste usa).
 *   nestingChapas(itens, cfg)     chapas planas (e as planificadas da chapa
 *                    dobrada) arrumadas em chapas comerciais (1200 × 3000,
 *                    1500 × 3000, 1500 × 6000 — configurável) pelos
 *                    RETÂNGULOS ENVOLVENTES, com o aproveitamento %.
 *   xlsxCorte / xlsxNesting       as planilhas formatadas (ExcelJS) — nunca CSV.
 *
 * O ALGORITMO DAS BARRAS (determinístico: o mesmo modelo dá sempre o mesmo
 * plano). Cada peça vira um "tamanho" L + serra e a barra vira uma caixa de
 * B + serra − refilo — assim a regra "n peças cabem se ΣL + serra·(n−1) +
 * refilo ≤ B" fica a do empacotamento comum.
 *   1. FIRST-FIT DECREASING: peças da maior para a menor (empate: a marca),
 *      cada uma na primeira barra aberta onde cabe; senão abre outra.
 *   2. MELHORIA LOCAL: as barras menos cheias são tomadas de 2 em 2 e de 3 em
 *      3; se as peças delas cabem em uma barra a menos (busca exata, com
 *      limite de nós), troca. Repete até não melhorar. É o que conserta os
 *      casos em que o FFD sozinho erra (ex.: 3,3,2,2,2,2 em barras de 7 —
 *      o FFD usa 3 barras, o ótimo é 2).
 *   3. Com mais de um comprimento comercial: roda com o maior (e depois cada
 *      barra desce para o MENOR comprimento que ainda leva o que tem nela) e
 *      com cada comprimento sozinho; fica o plano de MENOR comprimento
 *      comprado (empate: menos barras; depois a sobra mais concentrada).
 * Sobra = o que resta depois do último corte; reaproveitável se ≥ sobraMin.
 * Perda = comprado − peças − sobras reaproveitáveis (serra + pontas curtas).
 *
 * ⚠ VALORES DE PARTIDA (editáveis na tela): barras de 6 e 12 m, serra 3 mm,
 *   sobra reaproveitável a partir de 1 000 mm, refilo 0 — conferir com o
 *   fornecedor (barra de 12 m nem sempre existe em toda bitola) e a serra.
 * Teste: node tools/test-metal-corte.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1); var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  var EPS = 1e-6;
  var RHO = 7850;

  var CONFIG_BARRAS = { barras: [6000, 12000], serra: 3, sobraMin: 1000, refilo: 0, limiteNos: 40000 };
  var CONFIG_CHAPAS = { chapas: [[1200, 3000], [1500, 3000], [1500, 6000]], folga: 10, borda: 10, girar: true };

  function cfgBarras(c) {
    c = c || {};
    var b = arr(c.barras).map(function (x) { return Math.round(num(x, 0)); }).filter(function (x) { return x > 0; });
    if (!b.length) b = CONFIG_BARRAS.barras.slice();
    b = b.filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(function (p, q) { return p - q; });
    return { barras: b, serra: Math.max(0, num(c.serra, CONFIG_BARRAS.serra)), sobraMin: Math.max(0, num(c.sobraMin, CONFIG_BARRAS.sobraMin)),
             refilo: Math.max(0, num(c.refilo, CONFIG_BARRAS.refilo)), limiteNos: Math.max(1000, num(c.limiteNos, CONFIG_BARRAS.limiteNos)),
             barrasPorPerfil: c.barrasPorPerfil || null };
  }
  /* "6000; 12000" | "6 m, 12 m" → [6000, 12000] (mm). Número pequeno (< 100) = metro. */
  function lerLista(s) {
    return txt(s).split(/[;\s/]+|,(?=\s)/).map(function (p) { var v = num(p.replace(/[^\d.,]/g, "").replace(",", "."), NaN); return isFinite(v) ? (v < 100 ? v * 1000 : v) : NaN; })
      .filter(function (v) { return v > 0; }).map(function (v) { return Math.round(v); });
  }
  /* "1200x3000; 1500 × 3000" → [[1200,3000],[1500,3000]] */
  function lerChapas(s) {
    var out = [];
    txt(s).split(/[;\n]+/).forEach(function (p) {
      var m = /(\d+(?:[.,]\d+)?)\s*[x×X*]\s*(\d+(?:[.,]\d+)?)/.exec(p);
      if (m) { var a = num(m[1], 0), b = num(m[2], 0); if (a > 0 && b > 0) out.push([Math.min(a, b), Math.max(a, b)]); }
    });
    return out;
  }

  /* ================================================================ BARRAS
   * itens: [{ marca, L (mm), qtd }]  →  plano de um grupo */
  function expandir(itens) {
    var p = [], k = 0;
    arr(itens).forEach(function (it) { var q = Math.max(0, Math.round(num(it.qtd, 1))); for (var i = 0; i < q; i++) p.push({ marca: txt(it.marca), L: num(it.L, 0), k: k++ }); });
    p.sort(function (a, b) { return (b.L - a.L) || (a.marca < b.marca ? -1 : a.marca > b.marca ? 1 : 0) || (a.k - b.k); });
    return p;
  }
  function carga(bin, serra) { var s = 0; bin.forEach(function (p) { s += p.L + serra; }); return s; }
  function ffd(pecas, C, serra) {
    var bins = [], cargas = [];
    pecas.forEach(function (p) {
      var s = p.L + serra, i;
      for (i = 0; i < bins.length; i++) if (cargas[i] + s <= C + EPS) { bins[i].push(p); cargas[i] += s; return; }
      bins.push([p]); cargas.push(s);
    });
    return bins;
  }
  /* cabe tudo em nb barras de capacidade C? Busca exata com corte de simetria (cargas iguais) e limite de nós */
  function caber(pecas, nb, C, serra, limite) {
    var s = pecas.map(function (p) { return p.L + serra; }), tot = 0; s.forEach(function (v) { tot += v; });
    if (tot > nb * C + EPS) return null;
    var ordem = pecas.map(function (p, i) { return i; }).sort(function (a, b) { return (s[b] - s[a]) || (pecas[a].marca < pecas[b].marca ? -1 : 1) || (a - b); });
    var cargas = []; for (var b = 0; b < nb; b++) cargas.push(0);
    var atrib = new Array(pecas.length), nos = 0, estourou = false;
    function dfs(j) {
      if (j === ordem.length) return true;
      if (++nos > limite) { estourou = true; return false; }
      var i = ordem[j], vistos = {};
      for (var b2 = 0; b2 < nb; b2++) {
        var c = cargas[b2], ch = Math.round(c * 1000);
        if (vistos[ch] || c + s[i] > C + EPS) continue;
        vistos[ch] = 1;
        cargas[b2] += s[i]; atrib[i] = b2;
        if (dfs(j + 1)) return true;
        cargas[b2] -= s[i];
        if (estourou) return false;
      }
      return false;
    }
    if (!dfs(0)) return null;
    var out = []; for (var b3 = 0; b3 < nb; b3++) out.push([]);
    ordem.forEach(function (i) { out[atrib[i]].push(pecas[i]); });
    out.forEach(function (bin) { bin.sort(function (a, c) { return (c.L - a.L) || (a.marca < c.marca ? -1 : 1) || (a.k - c.k); }); });
    return out;
  }
  function combinacoes(n, k, fn) {
    var idx = []; for (var i = 0; i < k; i++) idx.push(i);
    while (true) {
      if (fn(idx.slice())) return true;
      var p = k - 1; while (p >= 0 && idx[p] === n - k + p) p--;
      if (p < 0) return false;
      idx[p]++; for (var q = p + 1; q < k; q++) idx[q] = idx[q - 1] + 1;
    }
  }
  function melhorar(bins, C, serra, limite) {
    var voltas = 0;
    while (voltas++ < 200) {
      var ord = bins.map(function (b, i) { return { i: i, c: carga(b, serra) }; }).sort(function (a, b) { return (a.c - b.c) || (a.i - b.i); });
      var achou = false;
      [2, 3].forEach(function (k) {
        if (achou || bins.length < k) return;
        var cand = ord.slice(0, Math.min(ord.length, k === 2 ? 16 : 11));
        combinacoes(cand.length, k, function (ix) {
          var sel = ix.map(function (j) { return cand[j].i; }), pecas = [];
          sel.forEach(function (bi) { pecas = pecas.concat(bins[bi]); });
          var tot = 0; pecas.forEach(function (p) { tot += p.L + serra; });
          if (tot > (k - 1) * C + EPS) return false;
          var r = caber(pecas, k - 1, C, serra, limite);
          if (!r) return false;
          var nov = bins.filter(function (b, i) { return sel.indexOf(i) < 0; }).concat(r);
          bins.length = 0; nov.forEach(function (b) { bins.push(b); });
          achou = true; return true;
        });
      });
      if (!achou) break;
    }
    return bins;
  }
  /* o resultado de uma barra (posições dos cortes, sobra e perda) */
  function barraInfo(bin, B, c) {
    var ordenadas = bin.slice().sort(function (a, b) { return (b.L - a.L) || (a.marca < b.marca ? -1 : 1) || (a.k - b.k); });
    var x = c.refilo, somaL = 0, cortes = [];
    ordenadas.forEach(function (p, i) { cortes.push({ marca: p.marca, L: r1(p.L), de: r1(x), ate: r1(x + p.L) }); somaL += p.L; x += p.L + (i < ordenadas.length - 1 ? c.serra : 0); });
    var uso = c.refilo + somaL + c.serra * Math.max(0, ordenadas.length - 1), resto = B - uso, sobra = resto >= c.serra - EPS ? resto - c.serra : 0;
    if (sobra < 0) sobra = 0;
    var reap = sobra >= c.sobraMin - EPS && sobra > 0;
    return { comprimento: B, pecas: cortes, somaL: r1(somaL), sobra: r1(sobra), reaproveitavel: reap, perda: r1(B - somaL - (reap ? sobra : 0)) };
  }
  function avaliar(bins, cfg) {
    var barras = bins.map(function (bin) {
      var C0 = carga(bin, cfg.serra), B = null;
      for (var i = 0; i < cfg.barras.length; i++) { var Bi = cfg.barras[i]; if (C0 <= Bi + cfg.serra - cfg.refilo + EPS) { B = Bi; break; } }
      return barraInfo(bin, B, cfg);
    });
    var comprado = 0, s2 = 0; barras.forEach(function (b) { comprado += b.comprimento; if (b.reaproveitavel) s2 += b.sobra * b.sobra; });
    return { barras: barras, comprado: comprado, n: barras.length, conc: s2 };
  }
  function melhorQue(a, b) {
    if (!b) return true;
    if (Math.abs(a.comprado - b.comprado) > EPS) return a.comprado < b.comprado;
    if (a.n !== b.n) return a.n < b.n;
    return a.conc > b.conc + EPS;
  }
  /* UM grupo: itens [{marca, L (mm), qtd}], cfg (barras, serra, sobraMin, refilo) */
  function otimizarBarras(itens, cfg0) {
    var cfg = cfgBarras(cfg0), pecas = expandir(itens), Lmax = cfg.barras[cfg.barras.length - 1];
    var fora = pecas.filter(function (p) { return p.L + cfg.refilo > Lmax + EPS; }), dentro = pecas.filter(function (p) { return p.L + cfg.refilo <= Lmax + EPS; });
    var melhor = null, politica = "", melhorar0 = cfg0 && cfg0.semMelhoria ? function (bins) { return bins; } : melhorar;   /* semMelhoria: só o FFD (o teste prova que a melhoria conserta) */
    if (dentro.length) {
      /* a) com a maior barra; cada barra desce para o menor comprimento que leva o que tem nela */
      var C = Lmax + cfg.serra - cfg.refilo;
      var binsMax = melhorar0(ffd(dentro, C, cfg.serra), C, cfg.serra, cfg.limiteNos);
      var aMax = avaliar(binsMax, cfg); melhor = aMax; politica = "maior barra (" + Lmax + " mm), cada uma reduzida ao menor comprimento comercial que leva o corte";
      /* b) com cada comprimento sozinho (só se todas as peças cabem nele) */
      cfg.barras.slice(0, -1).forEach(function (Bc) {
        if (dentro.some(function (p) { return p.L + cfg.refilo > Bc + EPS; })) return;
        var Cc = Bc + cfg.serra - cfg.refilo, bins = melhorar0(ffd(dentro, Cc, cfg.serra), Cc, cfg.serra, cfg.limiteNos), a = avaliar(bins, cfg);
        if (melhorQue(a, melhor)) { melhor = a; politica = "só barras de " + Bc + " mm"; }
      });
    }
    var barras = melhor ? melhor.barras : [];
    /* ordem de apresentação: comprimento da barra (maior primeiro), depois a mais cheia */
    barras.sort(function (a, b) { return (b.comprimento - a.comprimento) || (b.somaL - a.somaL) || (a.pecas[0].marca < b.pecas[0].marca ? -1 : 1); });
    barras.forEach(function (b, i) { b.n = i + 1; });
    var compra = {}, pecasMm = 0, sobrasMm = 0, perdaMm = 0, comprado = 0;
    barras.forEach(function (b) { compra[b.comprimento] = (compra[b.comprimento] || 0) + 1; pecasMm += b.somaL; comprado += b.comprimento; if (b.reaproveitavel) sobrasMm += b.sobra; perdaMm += b.perda; });
    /* o mínimo teórico (limite inferior pela soma) com a maior barra — para conferir o plano */
    var somaS = 0; dentro.forEach(function (p) { somaS += p.L + cfg.serra; });
    var minimo = dentro.length ? Math.ceil(somaS / (Lmax + cfg.serra - cfg.refilo) - 1e-9) : 0;
    return { barras: barras, compra: Object.keys(compra).map(Number).sort(function (a, b) { return b - a; }).map(function (k) { return { comprimento: k, quantidade: compra[k] }; }),
             pecasMm: r1(pecasMm), compradoMm: comprado, sobrasMm: r1(sobrasMm), perdaMm: r1(perdaMm), perdaPct: comprado ? r2(100 * perdaMm / comprado) : 0,
             fora: fora.map(function (p) { return { marca: p.marca, L: r1(p.L) }; }), minimoTeorico: minimo, politica: politica, nPecas: pecas.length, config: cfg };
  }

  /* comprimento de CORTE da barra: o eixo + a projeção do corte inclinado (alma: meia altura; aba: meia largura) */
  function comprimentoCorte(p) {
    /* peça com o ACABAMENTO medido (js/metaldetalhe.js: meia-esquadria, boca de lobo, curva): o externo medido nas
       geratrizes do sólido é o comprimento de corte — a fórmula abaixo não conhece a boca de lobo */
    if (p.fab && num(p.fab.externo, 0) > 0) return r1(num(p.fab.externo, 0));
    var ct = p.cortes || {}, d = p.dims || {}, tg = function (g) { return Math.abs(Math.tan(num(g, 0) * Math.PI / 180)); };
    var ext = (tg(ct.almaIni) + tg(ct.almaFim)) * num(d.h, 0) / 2 + (tg(ct.abaIni) + tg(ct.abaFim)) * num(d.b, 0) / 2;
    return r1(num(p.L, 0) + ext);
  }
  /* o ACABAMENTO das pontas para a lista: ângulo do corte com o eixo, comprimento interno, curva (raio e
     desenvolvimento), boca de lobo — texto curto "45°/45°", "R 97 · desenv. 303", "boca de lobo" */
  function acabamento(p) {
    var f = p.fab; if (!f && !p.curva) return null;
    var tp = function (t, a) { return t === "meia-esquadria" || t === "inclinado" ? br(a, 1).replace(/,0$/, "") + "°" : (t === "boca" ? "boca de lobo" : (t === "topo" ? "reto (topo)" : "reto")); };
    if (f && f.curva) return { texto: "curva " + br(f.ang, 0) + "° R " + br(f.R, 0) + " - desenv. " + br(f.desenvolvimento, 0), interno: null, curva: { R: f.R, ang: f.ang, desenvolvimento: f.desenvolvimento } };
    if (!f) return null;
    return { texto: tp(f.ini, f.angIni) + " / " + tp(f.fim, f.angFim), interno: num(f.interno, 0), angIni: f.angIni, angFim: f.angFim, ini: f.ini, fim: f.fim };
  }
  /* o PLANO DE CORTE do modelo: numeracao = BimMetalFab.numerar(estado) */
  function planoBarras(n, cfg0) {
    var cfg = cfgBarras(cfg0), grupos = {}, ordem = [];
    arr(n && n.grupos).forEach(function (g) {
      /* ⚠ ANDAIME: tubo de locação não se corta (vem em barra comercial) — fora do plano de corte; o pulo principal é BimMetalFab.pecasFab */
      var p = g.rep; if (!p || p.kind !== "perfil" || p.andaime) return;
      var k = p.nomePerfil + "|" + p.aco;
      if (!grupos[k]) { grupos[k] = { perfil: p.nomePerfil, aco: p.aco, kgm: num(p.kgm, 0), itens: [] }; ordem.push(k); }
      grupos[k].itens.push({ marca: g.marca, L: comprimentoCorte(p), Leixo: r1(num(p.L, 0)), qtd: g.ids.length, acab: acabamento(p) });
    });
    ordem.sort();
    var out = ordem.map(function (k) {
      var G = grupos[k], c2 = cfg;
      if (cfg.barrasPorPerfil && cfg.barrasPorPerfil[G.perfil]) { c2 = JSON.parse(JSON.stringify(cfg)); c2.barras = cfgBarras({ barras: cfg.barrasPorPerfil[G.perfil] }).barras; }
      var r = otimizarBarras(G.itens, c2), kg = function (mm) { return r2(mm / 1000 * G.kgm); };
      r.perfil = G.perfil; r.aco = G.aco; r.kgm = G.kgm; r.itens = G.itens;
      r.pecasKg = kg(r.pecasMm); r.compradoKg = kg(r.compradoMm); r.sobrasKg = kg(r.sobrasMm); r.perdaKg = kg(r.perdaMm);
      r.barras.forEach(function (b) { b.kg = kg(b.comprimento); b.perdaKg = kg(b.perda); b.sobraKg = b.reaproveitavel ? kg(b.sobra) : 0; });
      return r;
    });
    var T = { barras: 0, pecasKg: 0, compradoKg: 0, sobrasKg: 0, perdaKg: 0, pecas: 0, fora: 0 };
    out.forEach(function (g) { T.barras += g.barras.length; T.pecasKg += g.pecasKg; T.compradoKg += g.compradoKg; T.sobrasKg += g.sobrasKg; T.perdaKg += g.perdaKg; T.pecas += g.nPecas; T.fora += g.fora.length; });
    ["pecasKg", "compradoKg", "sobrasKg", "perdaKg"].forEach(function (k) { T[k] = r2(T[k]); });
    T.perdaPct = T.compradoKg ? r2(100 * T.perdaKg / T.compradoKg) : 0;
    return { grupos: out, totais: T, config: cfg };
  }

  /* ================================================================ NESTING DE CHAPAS
   * MaxRects (encaixe pelo lado curto que sobra), determinístico; folga entre peças e borda da chapa. */
  /* regra do encaixe: "bssf" (menor sobra no lado curto), "blsf" (no lado longo), "baf" (menor área que sobra),
     "bl" (mais embaixo, mais à esquerda). Nenhuma ganha sempre (ex.: 6 peças 980 × 580 numa 1200 × 3000: o BSSF
     gira a 1ª peça e cabem 5; o "bl" põe 3 × 2) — a chapa é arrumada pelas quatro e fica a que aproveita mais. */
  var REGRAS = ["bssf", "bl", "baf", "blsf"];
  function maxrects(W, H, itens, girar, regra) {
    var livres = [{ x: 0, y: 0, w: W, h: H }], postas = [], fora = [];
    function cabeEm(f, w, h) { return w <= f.w + EPS && h <= f.h + EPS; }
    function dividir(f, r) {
      if (r.x >= f.x + f.w - EPS || r.x + r.w <= f.x + EPS || r.y >= f.y + f.h - EPS || r.y + r.h <= f.y + EPS) return [f];
      var o = [];
      if (r.x > f.x + EPS) o.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w - EPS) o.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y + EPS) o.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h - EPS) o.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
      return o;
    }
    function contido(a, b) { return a.x >= b.x - EPS && a.y >= b.y - EPS && a.x + a.w <= b.x + b.w + EPS && a.y + a.h <= b.y + b.h + EPS; }
    itens.forEach(function (it) {
      var melhor = null;
      livres.forEach(function (f, fi) {
        [[it.w, it.h, false], [it.h, it.w, true]].forEach(function (o, oi) {
          if (oi === 1 && (!girar || Math.abs(it.w - it.h) < EPS)) return;
          if (!cabeEm(f, o[0], o[1])) return;
          var lh = f.w - o[0], lv = f.h - o[1], sc;
          if (regra === "bl") sc = [f.y, f.x, oi, fi];
          else if (regra === "baf") sc = [f.w * f.h - o[0] * o[1], Math.min(lh, lv), f.y, f.x, oi, fi];
          else if (regra === "blsf") sc = [Math.max(lh, lv), Math.min(lh, lv), f.y, f.x, oi, fi];
          else sc = [Math.min(lh, lv), Math.max(lh, lv), f.y, f.x, oi, fi];
          if (!melhor || menorLex(sc, melhor.sc)) melhor = { sc: sc, x: f.x, y: f.y, w: o[0], h: o[1], girada: o[2] };
        });
      });
      if (!melhor) { fora.push(it); return; }
      var r = { x: melhor.x, y: melhor.y, w: melhor.w, h: melhor.h };
      postas.push({ it: it, x: r.x, y: r.y, w: r.w, h: r.h, girada: melhor.girada });
      var nov = []; livres.forEach(function (f) { nov = nov.concat(dividir(f, r)); });
      livres = nov.filter(function (a, i) { return !nov.some(function (b, j) { return j !== i && contido(a, b) && (!contido(b, a) || j < i); }); });
    });
    return { postas: postas, fora: fora };
  }
  function menorLex(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] < b[i] - EPS) return true; if (a[i] > b[i] + EPS) return false; } return false; }
  function cfgChapas(c) {
    c = c || {};
    var ch = arr(c.chapas).map(function (q) { return Array.isArray(q) ? [num(q[0], 0), num(q[1], 0)] : [num(q.w || q.L, 0), num(q.h || q.B, 0)]; }).filter(function (q) { return q[0] > 0 && q[1] > 0; });
    if (!ch.length) ch = CONFIG_CHAPAS.chapas.map(function (q) { return q.slice(); });
    ch = ch.map(function (q) { return [Math.min(q[0], q[1]), Math.max(q[0], q[1])]; }).sort(function (a, b) { return (a[0] * a[1] - b[0] * b[1]) || (a[0] - b[0]); });
    return { chapas: ch, folga: Math.max(0, num(c.folga, CONFIG_CHAPAS.folga)), borda: Math.max(0, num(c.borda, CONFIG_CHAPAS.borda)), girar: c.girar !== false };
  }
  /* itens: [{ marca, w, h (mm, retângulo envolvente), qtd, area (mm², a real; padrão w·h), t (mm), aco }] → por grupo t × aço */
  function nestingChapas(itens, cfg0) {
    var cfg = cfgChapas(cfg0), grupos = {}, ordem = [];
    arr(itens).forEach(function (it) {
      var t = num(it.t, 0), k = ("000000" + Math.round(t * 10)).slice(-6) + "|" + txt(it.aco);
      if (!grupos[k]) { grupos[k] = { t: t, aco: txt(it.aco), lista: [] }; ordem.push(k); }
      var q = Math.max(0, Math.round(num(it.qtd, 1)));
      for (var i = 0; i < q; i++) grupos[k].lista.push({ marca: txt(it.marca), w0: num(it.w, 0), h0: num(it.h, 0), area: num(it.area, num(it.w, 0) * num(it.h, 0)), k: grupos[k].lista.length });
    });
    ordem.sort();
    var g = cfg.folga, b = cfg.borda;
    var res = ordem.map(function (key) {
      var G = grupos[key];
      var lista = G.lista.map(function (x) { return { marca: x.marca, w: x.w0 + g, h: x.h0 + g, w0: x.w0, h0: x.h0, area: x.area, k: x.k }; });
      lista.sort(function (p, q) { return (q.w0 * q.h0 - p.w0 * p.h0) || (Math.max(q.w0, q.h0) - Math.max(p.w0, p.h0)) || (p.marca < q.marca ? -1 : p.marca > q.marca ? 1 : 0) || (p.k - q.k); });
      var fora = lista.filter(function (x) { return !cfg.chapas.some(function (c) { var W = c[1] - 2 * b + g, H = c[0] - 2 * b + g; return (x.w <= W + EPS && x.h <= H + EPS) || (cfg.girar && x.h <= W + EPS && x.w <= H + EPS); }); });
      var rest = lista.filter(function (x) { return fora.indexOf(x) < 0; }), chapas = [];
      while (rest.length) {
        var melhor = null;
        cfg.chapas.forEach(function (c, ci) {
          REGRAS.forEach(function (rg, ri) {
            var W = c[1] - 2 * b + g, H = c[0] - 2 * b + g, r = maxrects(W, H, rest, cfg.girar, rg);
            if (!r.postas.length) return;
            var ap = 0; r.postas.forEach(function (p) { ap += p.it.area; });
            var util = ap / (c[0] * c[1]), sc = [-Math.round(util * 1e6) / 1e6, r.fora.length ? 1 : 0, c[0] * c[1], ci, ri];
            if (!melhor || menorLex(sc, melhor.sc)) melhor = { sc: sc, c: c, r: r, area: ap };
          });
        });
        if (!melhor) { fora = fora.concat(rest); break; }
        chapas.push({ W: melhor.c[1], H: melhor.c[0], pecas: melhor.r.postas.map(function (p) { return { marca: p.it.marca, x: r1(b + p.x), y: r1(b + p.y), w: r1(p.girada ? p.it.h0 : p.it.w0), h: r1(p.girada ? p.it.w0 : p.it.h0), girada: p.girada, area: p.it.area }; }),
                      aproveitamento: r1(100 * melhor.area / (melhor.c[0] * melhor.c[1])) });
        rest = melhor.r.fora;
      }
      var areaCh = 0, areaPc = 0, areaRet = 0, compra = {};
      chapas.forEach(function (c, i) { c.n = i + 1; areaCh += c.W * c.H; c.pecas.forEach(function (p) { areaPc += p.area; areaRet += p.w * p.h; }); var kf = c.H + " × " + c.W; compra[kf] = (compra[kf] || 0) + 1; });
      var kg = function (mm2) { return r2(mm2 * G.t * RHO * 1e-9); };
      return { t: G.t, aco: G.aco, chapas: chapas, compra: Object.keys(compra).map(function (k) { return { formato: k, quantidade: compra[k] }; }),
               areaChapasM2: r2(areaCh / 1e6), areaPecasM2: r2(areaPc / 1e6), aproveitamento: areaCh ? r1(100 * areaPc / areaCh) : 0, ocupacaoRet: areaCh ? r1(100 * areaRet / areaCh) : 0,
               kgChapas: kg(areaCh), kgPecas: kg(areaPc), perdaKg: r2(kg(areaCh) - kg(areaPc)), fora: fora.map(function (x) { return { marca: x.marca, w: x.w0, h: x.h0 }; }) };
    });
    var T = { chapas: 0, areaChapasM2: 0, areaPecasM2: 0, kgChapas: 0, kgPecas: 0, fora: 0 };
    res.forEach(function (r) { T.chapas += r.chapas.length; T.areaChapasM2 += r.areaChapasM2; T.areaPecasM2 += r.areaPecasM2; T.kgChapas += r.kgChapas; T.kgPecas += r.kgPecas; T.fora += r.fora.length; });
    ["areaChapasM2", "areaPecasM2", "kgChapas", "kgPecas"].forEach(function (k) { T[k] = r2(T[k]); });
    T.aproveitamento = T.areaChapasM2 ? r1(100 * T.areaPecasM2 / T.areaChapasM2) : 0; T.perdaKg = r2(T.kgChapas - T.kgPecas);
    return { grupos: res, totais: T, config: cfg };
  }
  /* as chapas do modelo (numeração do js/metalfab.js): planas e planificadas, pelo retângulo envolvente */
  function itensChapas(n) {
    return arr(n && n.grupos).filter(function (g) { return g.rep && g.rep.kind === "chapa"; }).map(function (g) {
      var p = g.rep, area = num(p.areaLiq, 0) > 0 ? p.areaLiq * 1e6 : p.L * p.B;
      return { marca: g.marca, w: num(p.L, 0), h: num(p.B, 0), qtd: g.ids.length, area: area, t: num(p.t, 0), aco: txt(p.aco), dobrada: !!p.dobras };
    });
  }

  /* ================================================================ PLANILHAS (ExcelJS) */
  var AZUL = "FF00406A", CINZA = "FFDDE5EE", CLARO = "FFF4F7FA";
  function estilizar(ws, ncols, linhaCab) {
    var cab = ws.getRow(linhaCab);
    cab.font = { bold: true, color: { argb: "FFFFFFFF" } }; cab.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; cab.height = 30;
    for (var c = 1; c <= ncols; c++) cab.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    ws.eachRow(function (row, i) {
      if (i < linhaCab) return;
      for (var c2 = 1; c2 <= ncols; c2++) row.getCell(c2).border = { top: { style: "thin", color: { argb: "FFB8C4D0" } }, bottom: { style: "thin", color: { argb: "FFB8C4D0" } }, left: { style: "thin", color: { argb: "FFB8C4D0" } }, right: { style: "thin", color: { argb: "FFB8C4D0" } } };
      if (i > linhaCab && (i - linhaCab) % 2 === 0) for (var c3 = 1; c3 <= ncols; c3++) if (!row.getCell(c3).fill || !row.getCell(c3).fill.fgColor) row.getCell(c3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLARO } };
    });
    ws.views = [{ state: "frozen", ySplit: linhaCab }];
  }
  function titulo(ws, t, sub, ncols) {
    ws.mergeCells(1, 1, 1, ncols); ws.getCell(1, 1).value = t; ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
    ws.mergeCells(2, 1, 2, ncols); ws.getCell(2, 1).value = sub; ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF555555" } };
    ws.getRow(1).height = 22;
  }
  function tabela(ws, cols, linhas, totais, l0) {
    cols.forEach(function (c, i) { ws.getColumn(i + 1).width = c[2] || 14; });
    var cab = ws.getRow(l0); cols.forEach(function (c, i) { cab.getCell(i + 1).value = c[1]; });
    linhas.forEach(function (l, k) { var row = ws.getRow(l0 + 1 + k); cols.forEach(function (c, i) { var v = l[c[0]]; row.getCell(i + 1).value = v == null ? "" : v; if (c[3]) row.getCell(i + 1).numFmt = c[3]; }); });
    var fim = l0 + linhas.length;
    if (totais) { var rt = ws.getRow(fim + 1); cols.forEach(function (c, i) { var v = totais[c[0]]; if (v != null) { rt.getCell(i + 1).value = v; if (c[3]) rt.getCell(i + 1).numFmt = c[3]; } rt.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } }; }); rt.font = { bold: true }; fim++; }
    estilizar(ws, cols.length, l0);
    return fim;
  }
  function xlsxCorte(plano, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var c = plano.config, sub = (info.obra ? info.obra + " · " : "") + "barras " + c.barras.map(function (b) { return br(b / 1000, 0) + " m"; }).join(" e ") + " · serra " + br(c.serra, 1) + " mm · sobra reaproveitável ≥ " + br(c.sobraMin, 0) + " mm" + (c.refilo ? " · refilo " + br(c.refilo, 0) + " mm" : "");
    /* COMPRA */
    var ws = wb.addWorksheet("Compra", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
    titulo(ws, "Lista de corte — barras a comprar", sub, 9);
    var lc = [];
    plano.grupos.forEach(function (g) { g.compra.forEach(function (x) { lc.push({ perfil: g.perfil, aco: g.aco, barra: x.comprimento, qtd: x.quantidade, kgm: g.kgm, kg: r2(x.comprimento / 1000 * g.kgm * x.quantidade), pecas: g.nPecas, perda: g.perdaPct / 100, sobras: g.sobrasKg }); }); });
    tabela(ws, [["perfil", "Perfil", 22], ["aco", "Aço", 18], ["barra", "Barra (mm)", 12, "#,##0"], ["qtd", "Barras", 9, "0"], ["kgm", "Massa (kg/m)", 12, "#,##0.00"], ["kg", "Peso comprado (kg)", 16, "#,##0.0"], ["pecas", "Peças do perfil", 12, "0"], ["sobras", "Sobras reaprov. (kg)", 16, "#,##0.0"], ["perda", "Perda do perfil", 12, "0.0%"]],
      lc, { perfil: "TOTAL", qtd: plano.totais.barras, kg: plano.totais.compradoKg, sobras: plano.totais.sobrasKg, perda: plano.totais.perdaPct / 100 }, 4);
    /* PLANO DE CORTE (barra a barra) */
    var wp = wb.addWorksheet("Plano de corte", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
    titulo(wp, "Plano de corte barra a barra", "Cortes na ordem, a partir da ponta da barra (mm). Serra entre cortes: " + br(c.serra, 1) + " mm.", 8);
    var lp = [];
    plano.grupos.forEach(function (g) { g.barras.forEach(function (b) { lp.push({ perfil: g.perfil, aco: g.aco, n: b.n, barra: b.comprimento, cortes: b.pecas.map(function (p) { return p.marca + " " + br(p.L, 0); }).join(" + "), npc: b.pecas.length, sobra: b.sobra, destino: b.sobra > 0 ? (b.reaproveitavel ? "reaproveitar" : "sucata") : "—" }); }); });
    tabela(wp, [["perfil", "Perfil", 20], ["aco", "Aço", 16], ["n", "Barra nº", 8, "0"], ["barra", "Comprimento (mm)", 14, "#,##0"], ["cortes", "Cortes (marca comprimento)", 70], ["npc", "Peças", 7, "0"], ["sobra", "Sobra (mm)", 11, "#,##0"], ["destino", "Sobra", 13]], lp, null, 4);
    wp.getColumn(5).alignment = { wrapText: true, vertical: "top" };
    /* PEÇAS */
    var wq = wb.addWorksheet("Peças");
    titulo(wq, "Peças de perfil a cortar", "Comprimento de corte = comprimento pelo eixo + projeção do corte inclinado nas pontas.", 6);
    var lq = []; plano.grupos.forEach(function (g) { g.itens.forEach(function (it) { lq.push({ marca: it.marca, perfil: g.perfil, aco: g.aco, eixo: it.Leixo, corte: it.L, interno: it.acab && it.acab.interno ? it.acab.interno : null, pontas: it.acab ? it.acab.texto : "reto / reto", qtd: it.qtd }); }); });
    tabela(wq, [["marca", "Marca", 9], ["perfil", "Perfil", 22], ["aco", "Aço", 18], ["eixo", "Compr. pelo eixo (mm)", 16, "#,##0"], ["corte", "Compr. de corte - externo (mm)", 18, "#,##0"], ["interno", "Compr. interno (mm)", 14, "#,##0"], ["pontas", "Pontas (corte com o eixo)", 26], ["qtd", "Qtd", 7, "0"]], lq, { marca: "TOTAL", qtd: plano.totais.pecas }, 4);
    /* SOBRAS */
    var wr = wb.addWorksheet("Sobras");
    titulo(wr, "Sobras reaproveitáveis", "Pontas a partir de " + br(c.sobraMin, 0) + " mm: identificar e estocar (perfil, aço e comprimento).", 5);
    var lr = []; plano.grupos.forEach(function (g) { g.barras.forEach(function (b) { if (b.reaproveitavel) lr.push({ perfil: g.perfil, aco: g.aco, n: b.n, sobra: b.sobra, kg: b.sobraKg }); }); });
    tabela(wr, [["perfil", "Perfil", 22], ["aco", "Aço", 18], ["n", "Da barra nº", 11, "0"], ["sobra", "Comprimento (mm)", 16, "#,##0"], ["kg", "Peso (kg)", 12, "#,##0.0"]], lr, { perfil: "TOTAL", kg: plano.totais.sobrasKg }, 4);
    /* RESUMO e LEIA-ME */
    var wz = wb.addWorksheet("Resumo");
    titulo(wz, "Resumo do aproveitamento", sub, 2);
    var T = plano.totais;
    tabela(wz, [["k", "Item", 44], ["v", "Valor", 18]], [
      { k: "Barras a comprar", v: T.barras }, { k: "Peso comprado (kg)", v: T.compradoKg }, { k: "Peso das peças (kg)", v: T.pecasKg }, { k: "Sobras reaproveitáveis (kg)", v: T.sobrasKg },
      { k: "Perda (serra + pontas curtas) (kg)", v: T.perdaKg }, { k: "Perda (%)", v: T.perdaPct / 100 }, { k: "Peças maiores que a barra comercial (emenda)", v: T.fora }], null, 4);
    wz.getCell("B10").numFmt = "0.00%";
    var wl = wb.addWorksheet("Leia-me");
    ["OrçaPRO Modela — Metálica & Mecânica: lista de corte com aproveitamento de barras.",
     "Algoritmo: first-fit decreasing + melhoria local (barras menos cheias reagrupadas por busca exata), determinístico.",
     "Valores de partida, editáveis: barras comerciais, perda de corte da serra, sobra mínima reaproveitável e refilo — conferir com o fornecedor e a serra.",
     "Perda = peso comprado − peso das peças − sobras reaproveitáveis. A perda é do orçamento, não do desenho (lista de materiais sem +10 %).",
     "Modelagem, detalhamento e fabricação — não é cálculo estrutural."].forEach(function (t) { wl.addRow([t]); });
    wl.getColumn(1).width = 130;
    return wb;
  }
  function xlsxNesting(res, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var c = res.config, sub = (info.obra ? info.obra + " · " : "") + "chapas " + c.chapas.map(function (q) { return q[0] + " × " + q[1]; }).join("; ") + " mm · folga " + br(c.folga, 0) + " mm · borda " + br(c.borda, 0) + " mm";
    var ws = wb.addWorksheet("Compra", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
    titulo(ws, "Nesting de chapas — chapas a comprar", sub, 7);
    var l = []; res.grupos.forEach(function (g) { g.compra.forEach(function (x) { l.push({ t: g.t, aco: g.aco, formato: x.formato, qtd: x.quantidade, ap: g.aproveitamento / 100, kg: g.kgChapas, perda: g.perdaKg }); }); });
    tabela(ws, [["t", "Espessura (mm)", 12, "0.0"], ["aco", "Aço", 18], ["formato", "Chapa (mm)", 16], ["qtd", "Chapas", 9, "0"], ["ap", "Aproveitamento do grupo", 14, "0.0%"], ["kg", "Peso comprado do grupo (kg)", 16, "#,##0.0"], ["perda", "Perda do grupo (kg)", 14, "#,##0.0"]],
      l, { t: null, aco: "TOTAL", qtd: res.totais.chapas, ap: res.totais.aproveitamento / 100, kg: res.totais.kgChapas, perda: res.totais.perdaKg }, 4);
    var wp = wb.addWorksheet("Chapas");
    titulo(wp, "Peças em cada chapa", "Posição do canto da peça a partir do canto da chapa (mm); \"girada\" = peça a 90°.", 8);
    var lp = []; res.grupos.forEach(function (g) { g.chapas.forEach(function (ch) { ch.pecas.forEach(function (p) { lp.push({ t: g.t, n: ch.n, chapa: ch.H + " × " + ch.W, marca: p.marca, x: p.x, y: p.y, dim: Math.round(p.w) + " × " + Math.round(p.h), gir: p.girada ? "sim" : "" }); }); }); });
    tabela(wp, [["t", "Espessura (mm)", 12, "0.0"], ["n", "Chapa nº", 9, "0"], ["chapa", "Formato", 14], ["marca", "Marca", 9], ["x", "x (mm)", 10, "#,##0"], ["y", "y (mm)", 10, "#,##0"], ["dim", "Peça (mm)", 14], ["gir", "Girada", 8]], lp, null, 4);
    var wl = wb.addWorksheet("Leia-me");
    ["Nesting simples por retângulo envolvente (MaxRects, determinístico): não encaixa uma peça no recorte da outra.",
     "Aproveitamento = área real das peças (furos descontados) ÷ área das chapas compradas.",
     "Formatos de chapa, folga entre peças e borda: valores de partida, editáveis — conferir com o fornecedor e o processo (laser, plasma, oxicorte)."].forEach(function (t) { wl.addRow([t]); });
    wl.getColumn(1).width = 120;
    return wb;
  }

  var BimMetalCorte = {
    CONFIG_BARRAS: CONFIG_BARRAS, CONFIG_CHAPAS: CONFIG_CHAPAS,
    cfgBarras: cfgBarras, cfgChapas: cfgChapas, lerLista: lerLista, lerChapas: lerChapas,
    otimizarBarras: otimizarBarras, planoBarras: planoBarras, comprimentoCorte: comprimentoCorte, acabamento: acabamento,
    nestingChapas: nestingChapas, itensChapas: itensChapas, maxrects: maxrects,
    xlsxCorte: xlsxCorte, xlsxNesting: xlsxNesting, br: br
  };
  global.BimMetalCorte = BimMetalCorte;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalCorte;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

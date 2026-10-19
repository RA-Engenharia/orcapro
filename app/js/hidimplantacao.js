/* =====================================================================
 * hidimplantacao.js — IMPLANTAÇÃO DA REDE DE ESGOTO no lote (motor PURO, ES5, Node-testável). 18/10/2026.
 *
 * Correção do Rogério no "Traçar automaticamente" (prints 21/22): a caixa de inspeção caiu DENTRO do banheiro, a caixa de
 * gordura ao lado da pia, DENTRO da cozinha, e o DN 100 atravessava a parede para dentro. "Caixas de passagem, de inspeção,
 * tudo é feito do lado de fora." O padrão está em docs/hidro/PADRAO-IMPLANTACAO-ESGOTO.md (NBR 8160 4.2.6 e 5.1.5,
 * manuais e livros-texto). Este motor responde, só com a geometria do modelo:
 *
 *   HidImplantacao.dentro(estado, p, o)          → { dentro, ambiente?, motivo }  — o ponto está em ambiente FECHADO da
 *       edificação? (dentro de um ambiente do BIM, ou cercado por paredes nas 4 direções)
 *   HidImplantacao.posicaoExterna(estado, p, o)  → { x, z, parede, normal:{x,z}, afast, origem, motivo } | null — o lugar da
 *       caixa do LADO DE FORA, junto à parede externa mais perto de p, a o.afast da face (padrão afastamentoCaixa = 1,0 m;
 *       com lote/divisa, recua para caber nele)
 *   HidImplantacao.caminhoExterno(estado, a, b, o) → [{x,z}...] — de a até b pela área externa (reto, em L ou contornando a
 *       edificação pelo corredor), nunca por baixo dos cômodos
 *   HidImplantacao.linhaRede(estado, pontos, o)  → { pontos:[{x,z}] (montante → SAÍDA), saida, lado, origemSaida, pendencias }
 *       — o eixo do coletor pelo recuo, paralelo às paredes externas, passando pelos pontos dados e terminando na frente
 *   HidImplantacao.contorno(estado)              → { x0, x1, z0, z1, paredes } a caixa envolvente da edificação
 *
 * ⚠ Nenhum número de norma aqui: GEO_IMP é geometria/critério de projeto (hid:ok), declarado e trocável em parametros.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  var EPS = 1e-6;   // hid:ok
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }

  /* ⚠ GEOMETRIA / CRITÉRIO DE PROJETO (não é norma) — trocável em parametros */
  var GEO_IMP = {
    afastamentoCaixaGordura: 0.35,   // hid:ok a caixa de gordura junto à parede da cozinha: eixo a 0,35 m da face (a de inspeção, no eixo do corredor, fica mais longe — a saída da gordura chega nela fora da parede dela)
    afastamentoCaixa: 1.0,   // hid:ok Rogério/coordenação (18/10/2026): sem lote, a caixa fica 1,0 m para fora da face da parede externa (eixo da caixa); editável
    margemLote: 0.30,        // hid:ok com lote: a borda da caixa fica a pelo menos isto da divisa
    folgaParede: 0.10,       // hid:ok a borda da caixa a pelo menos isto da face da parede (fundação/baldrame não comprometida — confirmar com o estrutural)
    sonda: 0.30,             // hid:ok o ponto de prova do "lado de fora" de uma face
    alcance: 80.0,           // hid:ok até onde o raio procura parede (cercado = parede nas 4 direções)
    pontaParede: 0.20        // hid:ok a caixa não fica na ponta da parede (canto)
  };
  function geo(par, k) { return par && par[k] != null && isFinite(Number(par[k])) ? Number(par[k]) : GEO_IMP[k]; }

  function dentroPoli(p, poli) {
    var dentro = false;
    for (var i = 0, j = poli.length - 1; i < poli.length; j = i++) {
      var a = poli[i], b = poli[j];
      if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / ((b.z - a.z) || EPS) + a.x)) dentro = !dentro;
    }
    return dentro;
  }
  function distSeg(p, a, b) { var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); var qx = a.x + dx * t, qz = a.z + dz * t; return Math.sqrt((p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz)); }

  /* as paredes da edificação (eixo em planta + espessura). Cache por estado (o mesmo objeto do replay) */
  function paredes(estado, o) {
    if (o && o.paredes) return o.paredes;
    if (estado && estado._impParedes) return estado._impParedes;
    var H = HR(), ws = H ? arr(H.obstaculosDoBim(estado, null).paredes) : [];
    var out = ws.map(function (w) { return { id: w.id, p1: { x: num(w.p1.x, 0), z: num(w.p1.z, 0) }, p2: { x: num(w.p2.x, 0), z: num(w.p2.z, 0) }, esp: num(w.espessura, 0), base: num(w.base, 0), altura: num(w.altura, 0) }; })
      .filter(function (w) { return d2(w.p1, w.p2) > EPS; });
    try { Object.defineProperty(estado, "_impParedes", { value: out, enumerable: false, configurable: true }); } catch (e) {}
    return out;
  }
  /* o raio a partir de p na direção (dx,dz) bate numa parede? (o eixo da parede, até o alcance) */
  function bate(p, dx, dz, ws, alc) {
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i], ex = w.p2.x - w.p1.x, ez = w.p2.z - w.p1.z, den = dx * ez - dz * ex;
      if (Math.abs(den) < EPS) continue;
      var qx = w.p1.x - p.x, qz = w.p1.z - p.z, t = (qx * ez - qz * ex) / den, u = (qx * dz - qz * dx) / den;
      if (t > EPS && t <= alc && u >= -EPS && u <= 1 + EPS) return true;
    }
    return false;
  }
  /* o ponto está em AMBIENTE FECHADO da edificação? */
  function dentro(estado, p, o) {
    o = o || {};
    var amb = arr(estado && estado.ambientes).filter(function (a) { return a && a.calc && arr(a.calc.contorno).length >= 3 && dentroPoli(p, a.calc.contorno); })[0];   // hid:ok polígono tem 3+ vértices
    if (amb) return { dentro: true, ambiente: amb.id, motivo: "dentro do ambiente " + (amb.nome || amb.id) };
    var ws = paredes(estado, o), alc = geo(o.parametros, "alcance");
    var naParede = ws.filter(function (w) { return distSeg(p, w.p1, w.p2) < w.esp / 2 - EPS; })[0];
    if (naParede) return { dentro: true, parede: naParede.id, motivo: "dentro da parede " + naParede.id };
    var cercado = bate(p, 1, 0, ws, alc) && bate(p, -1, 0, ws, alc) && bate(p, 0, 1, ws, alc) && bate(p, 0, -1, ws, alc);
    return cercado ? { dentro: true, motivo: "cercado por paredes nas quatro direções (cômodo fechado)" } : { dentro: false, motivo: "área externa" };
  }

  /* o LOTE (linha de propriedade/divisa do js/bimterreno.js), se houver */
  function lote(estado) {
    var T = estado && estado.terreno, d = T ? arr(T.divisas).filter(function (q) { return arr(q.contorno).length >= 3; })[0] : null;   // hid:ok polígono tem 3+ vértices
    return d ? { id: d.id, contorno: d.contorno.map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; }) } : null;
  }
  function distBordaPoli(p, poli) { var m = Infinity; for (var i = 0; i < poli.length; i++) m = Math.min(m, distSeg(p, poli[i], poli[(i + 1) % poli.length])); return m; }

  /* a caixa envolvente da edificação (faces externas das paredes) */
  function contorno(estado, o) {
    var ws = paredes(estado, o), xs = [], zs = [];
    ws.forEach(function (w) { var h = w.esp / 2; [w.p1, w.p2].forEach(function (q) { xs.push(q.x - h, q.x + h); zs.push(q.z - h, q.z + h); }); });
    if (!xs.length) return null;
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs), paredes: ws };
  }

  /* o LUGAR DA CAIXA do lado de fora: junto à parede externa mais perto de p */
  function posicaoExterna(estado, p, o) {
    o = o || {};
    var par = o.parametros || {}, ws = paredes(estado, o), raio = num(o.raio, 0), afast = num(o.afast, geo(par, "afastamentoCaixa"));
    var L = lote(estado), mg = geo(par, "margemLote"), fp = geo(par, "folgaParede"), sd = geo(par, "sonda"), best = null, todos = [];
    ws.forEach(function (w) {
      var ex = w.p2.x - w.p1.x, ez = w.p2.z - w.p1.z, Lw = Math.sqrt(ex * ex + ez * ez), u = { x: ex / Lw, z: ez / Lw };
      [1, -1].forEach(function (s) {
        var n = { x: -u.z * s, z: u.x * s };
        var t = (p.x - w.p1.x) * u.x + (p.z - w.p1.z) * u.z, tMin = raio + geo(par, "pontaParede"), tMax = Lw - tMin;
        if (tMax < tMin) return;
        var tc = Math.max(tMin, Math.min(tMax, t)), pe = { x: w.p1.x + u.x * tc, z: w.p1.z + u.z * tc };
        var sonda = { x: pe.x + n.x * (w.esp / 2 + sd), z: pe.z + n.z * (w.esp / 2 + sd) };
        if (dentro(estado, sonda, { paredes: ws, parametros: par }).dentro) return;   /* a face que olha para DENTRO não serve */
        var a = Math.max(afast, raio + fp), origem = "padrão: " + afast.toFixed(2).replace(".", ",") + " m da face externa";
        if (L) {
          /* recua para caber no lote (a borda da caixa a margemLote da divisa) */
          var a0 = a;
          while (a > raio + fp + EPS) { var c0 = { x: pe.x + n.x * (w.esp / 2 + a), z: pe.z + n.z * (w.esp / 2 + a) }; if (dentroPoli(c0, L.contorno) && distBordaPoli(c0, L.contorno) >= raio + mg - EPS) break; a = r4(a - 0.05); }   // hid:ok passo de 5 cm na busca
          var cL = { x: pe.x + n.x * (w.esp / 2 + a), z: pe.z + n.z * (w.esp / 2 + a) };
          if (!dentroPoli(cL, L.contorno)) return;
          origem = a < a0 - EPS ? "lote " + L.id + ": recuada para caber (" + a.toFixed(2).replace(".", ",") + " m da face)" : "dentro do lote " + L.id;
        }
        /* corredor ESTREITO (a parede do bloco vizinho perto): a caixa chega mais perto da face, até a folga mínima */
        var c = null, aMin = raio + fp;
        for (var aa = a; aa >= aMin - EPS; aa = r4(aa - 0.05)) {   // hid:ok passo de 5 cm na busca
          var cc = { x: r4(pe.x + n.x * (w.esp / 2 + aa)), z: r4(pe.z + n.z * (w.esp / 2 + aa)) };
          if (dentro(estado, cc, { paredes: ws, parametros: par }).dentro) continue;
          if (ws.some(function (w2) { return distSeg(cc, w2.p1, w2.p2) < w2.esp / 2 + raio + fp - EPS; })) continue;   /* não encosta em outra parede */
          if (arr(o.evitar).some(function (q) { return d2(q, cc) < num(q.r, 0) + raio + fp - EPS; })) continue;   /* nem em outra caixa */
          c = cc; if (aa < a - EPS) origem = "corredor estreito: " + aa.toFixed(2).replace(".", ",") + " m da face"; a = aa; break;
        }
        if (!c) return;
        var custo = d2(p, pe) + Math.abs(t - tc) + a * 0.1;   // hid:ok desempate: a parede mais perto, sem correr ao longo dela
        var cand = { x: c.x, z: c.z, parede: w.id, normal: { x: r4(n.x), z: r4(n.z) }, pe: { x: r4(pe.x), z: r4(pe.z) }, afast: r4(a), origem: origem, custo: custo, motivo: "junto à parede externa " + w.id + " (" + origem + ")" };
        todos.push(cand);
        if (!best || custo < best.custo - EPS) best = cand;
      });
    });
    if (o.todos) return todos.sort(function (x, y) { return x.custo - y.custo; });
    return best;
  }

  /* o segmento a→b passa por DENTRO da edificação? (amostra a cada 10 cm) */
  function cruzaDentro(estado, a, b, o) {
    var n = Math.max(2, Math.ceil(d2(a, b) / 0.10));   // hid:ok amostragem de 10 cm
    for (var i = 1; i < n; i++) { var f = i / n, q = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }; if (dentro(estado, q, o).dentro) return true; }
    return false;
  }
  function comp(pts) { var s = 0; for (var i = 1; i < pts.length; i++) s += d2(pts[i - 1], pts[i]); return s; }
  /* o anel do corredor: a caixa envolvente afastada d (os 4 cantos, sentido anti-horário) */
  function anel(C, d) { return [{ x: C.x0 - d, z: C.z0 - d }, { x: C.x1 + d, z: C.z0 - d }, { x: C.x1 + d, z: C.z1 + d }, { x: C.x0 - d, z: C.z1 + d }]; }
  function projAnel(R, p) {
    var best = null, s = 0;
    for (var i = 0; i < 4; i++) {   // hid:ok 4 lados do anel (retângulo)
      var a = R[i], b = R[(i + 1) % 4], L = d2(a, b), t = L > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (L * L))) : 0;   // hid:ok 4 lados do anel (retângulo)
      var q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, dd = d2(p, q);
      if (!best || dd < best.d - EPS) best = { d: dd, s: s + t * L, q: q, lado: i };
      s += L;
    }
    return best;
  }
  function projAnelExterno(estado, R, p, op) {
    var cands = [], s = 0;
    for (var i = 0; i < 4; i++) {   // hid:ok 4 lados do anel (retângulo)
      var a = R[i], b = R[(i + 1) % 4], L = d2(a, b), t = L > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (L * L))) : 0;   // hid:ok 4 lados do anel (retângulo)
      var q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      cands.push({ d: d2(p, q), s: s + t * L, q: q, lado: i, cruza: cruzaDentro(estado, p, q, op) });
      s += L;
    }
    cands.sort(function (x, y) { return (x.cruza ? 1 : 0) - (y.cruza ? 1 : 0) || x.d - y.d; });
    return cands[0];
  }
  function pesAnel(estado, R, p, op) {
    var out = [], s = 0;
    for (var i = 0; i < 4; i++) {   // hid:ok 4 lados do anel (retângulo)
      var a = R[i], b = R[(i + 1) % 4], L = d2(a, b), t = L > 0 ? ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (L * L) : 0;   // hid:ok 4 lados do anel (retângulo)
      /* só o pé PERPENDICULAR (o ramal da espera desce perpendicular à linha — js/hidrede.js); o canto não é pé */
      if (t * L > 0.05 && (1 - t) * L > 0.05) {   // hid:ok 5 cm: o canto não é pé
        var q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; if (!cruzaDentro(estado, p, q, op)) out.push({ s: s + t * L, q: q, lado: i, d: d2(p, q) }); }
      s += L;
    }
    if (!out.length) { var m = projAnel(R, p); out.push({ s: m.s, q: m.q, lado: m.lado, d: m.d }); }
    return out;
  }
  function trechoAnel(R, s0, s1, sentido) {
    var P = 0, cum = [0]; for (var i = 0; i < 4; i++) { P += d2(R[i], R[(i + 1) % 4]); cum.push(P); }   // hid:ok 4 lados do anel (retângulo)
    function ponto(s) { s = ((s % P) + P) % P; for (var k = 0; k < 4; k++) if (s <= cum[k + 1] + EPS) { var f = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1); return { x: R[k].x + (R[(k + 1) % 4].x - R[k].x) * f, z: R[k].z + (R[(k + 1) % 4].z - R[k].z) * f }; } return R[0]; }   // hid:ok índices dos 4 lados do anel / geometria
    var L = sentido > 0 ? ((s1 - s0) % P + P) % P : ((s0 - s1) % P + P) % P, out = [ponto(s0)];
    var cantos = cum.slice(0, 4).map(function (c) { return c; });   // hid:ok índices dos 4 lados do anel / geometria
    var lista = cantos.map(function (c) { return { c: c, k: sentido > 0 ? ((c - s0) % P + P) % P : ((s0 - c) % P + P) % P }; }).filter(function (q) { return q.k > EPS && q.k < L - EPS; }).sort(function (a, b) { return a.k - b.k; });
    lista.forEach(function (q) { out.push(ponto(q.c)); });
    out.push(ponto(s1));
    return { pontos: out, L: L, P: P };
  }
  /* de a até b PELA ÁREA EXTERNA: reto; em L (o canto que fica fora); senão contornando pelo corredor */
  function caminhoExterno(estado, a, b, o) {
    o = o || {};
    var op = { paredes: paredes(estado, o), parametros: o.parametros };
    var alinhado = Math.abs(a.x - b.x) < 0.01 || Math.abs(a.z - b.z) < 0.01;   // hid:ok 1 cm
    /* o LADO CERTO de entrar na caixa: a última perna não chega pela mesma direção de um tubo que já entra nela (o.ocupadas:
       direções unitárias de chegada) — penalidade em metros */
    function ocupado(P) { var n = P.length, ux = P[n - 1].x - P[n - 2].x, uz = P[n - 1].z - P[n - 2].z, L = Math.sqrt(ux * ux + uz * uz) || 1; return arr(o.ocupadas).some(function (d) { return (ux * d.x + uz * d.z) / L > 0.85; }) ? 50 : 0; }   // hid:ok cos 30° e a penalidade
    if (alinhado && !cruzaDentro(estado, a, b, op)) return [a, b];
    /* tubo enterrado anda em linhas retas paralelas às paredes (curvas nas caixas): em L antes da diagonal */
    var Ls = [{ x: b.x, z: a.z }, { x: a.x, z: b.z }].map(function (c) { return [a, c, b]; })
      .filter(function (P) { return !dentro(estado, P[1], op).dentro && !cruzaDentro(estado, P[0], P[1], op) && !cruzaDentro(estado, P[1], P[2], op); })
      .sort(function (x, y) { return comp(x) + ocupado(x) - comp(y) - ocupado(y); });
    if (Ls.length) return Ls[0];
    if (!cruzaDentro(estado, a, b, op)) return [a, b];
    var C = contorno(estado, op); if (!C) return [a, b];
    var R = anel(C, num(o.afast, geo(o.parametros, "afastamentoCaixa"))), pa = projAnel(R, a), pb = projAnel(R, b);
    var c1 = trechoAnel(R, pa.s, pb.s, 1), c2 = trechoAnel(R, pa.s, pb.s, -1), m = c1.L <= c2.L ? c1 : c2;
    return [a].concat(m.pontos).concat([b]).filter(function (q, i, L) { return i === 0 || d2(q, L[i - 1]) > 0.01; });   // hid:ok 1 cm: pontos repetidos saem
  }

  /* o lado da FRENTE (saída para o coletor público): a porta numa parede externa; senão o lado mais perto dos pontos (pendência) */
  function ladoFrente(estado, C, pontos, o) {
    var par = o.parametros || {}, LADOS = ["z0", "x1", "z1", "x0"];
    if (par.ladoSaida && LADOS.indexOf(par.ladoSaida) >= 0) return { lado: par.ladoSaida, origem: "parâmetro ladoSaida" };
    var H = HR(), abs = H ? arr(H.obstaculosDoBim(estado, null).aberturas).filter(function (a) { return a.tipo === "porta"; }) : [], ws = paredes(estado, o);
    var portas = abs.map(function (a) {
      var m = { x: (a.p1.x + a.p2.x) / 2, z: (a.p1.z + a.p2.z) / 2 }, ex = a.p2.x - a.p1.x, ez = a.p2.z - a.p1.z, L = Math.sqrt(ex * ex + ez * ez) || 1, n = { x: -ez / L, z: ex / L }, e = num(a.espessura, 0.15) / 2 + geo(par, "sonda");   // hid:ok espessura padrão se a abertura não disser
      var f1 = !dentro(estado, { x: m.x + n.x * e, z: m.z + n.z * e }, { paredes: ws }).dentro, f2 = !dentro(estado, { x: m.x - n.x * e, z: m.z - n.z * e }, { paredes: ws }).dentro;
      return f1 !== f2 ? m : null;
    }).filter(Boolean);
    function ladoDe(p) { var ds = { z0: Math.abs(p.z - C.z0), x1: Math.abs(p.x - C.x1), z1: Math.abs(p.z - C.z1), x0: Math.abs(p.x - C.x0) }; return LADOS.slice().sort(function (a, b) { return ds[a] - ds[b]; })[0]; }
    if (portas.length) return { lado: ladoDe(portas[0]), origem: "porta de entrada na parede externa" };
    var cont = {}; pontos.forEach(function (p) { var l = ladoDe(p); cont[l] = (cont[l] || 0) + 1; });
    var l0 = LADOS.slice().sort(function (a, b) { return (cont[b] || 0) - (cont[a] || 0); })[0];
    return { lado: l0, origem: "sem porta externa nem frente informada: o lado com mais saídas", pendente: true };
  }
  /* o EIXO DO COLETOR pelo recuo: anel da caixa envolvente afastado; do ponto mais a montante até a saída na frente */
  function linhaRede(estado, pontos, o) {
    o = o || {};
    var par = o.parametros || {}, op = { paredes: paredes(estado, o), parametros: par }, C = contorno(estado, op), pend = [];
    if (!C || !arr(pontos).length) return null;
    var d = num(o.afast, geo(par, "afastamentoCaixa")), L = lote(estado);
    if (L) {
      /* com lote: o anel recua para caber (a caixa de 0,60 m dentro, com a margem da divisa) */
      var raio = num(o.raio, 0);
      while (d > raio + geo(par, "folgaParede") + EPS && anel(C, d).some(function (q) { return !dentroPoli(q, L.contorno) || distBordaPoli(q, L.contorno) < raio + geo(par, "margemLote") - EPS; })) d = r4(d - 0.05);   // hid:ok passo de 5 cm
    }
    var R = anel(C, d), F = ladoFrente(estado, C, pontos, o);
    var ixLado = { z0: 0, x1: 1, z1: 2, x0: 3 }[F.lado], a = R[ixLado], b = R[(ixLado + 1) % 4];   // hid:ok índices dos 4 lados do anel / geometria
    /* o pé de cada ponto no anel PELA ÁREA EXTERNA: o ponto do corredor entre blocos vai ao lado do anel que ele alcança
       sem atravessar a edificação (a perpendicular mais curta podia cruzar um cômodo) */
    /* os PÉS de cada ponto no anel pela área externa (todos os lados que ele alcança sem atravessar a edificação — o ponto do
       corredor entre blocos alcança os dois lados do corredor) */
    var P0 = trechoAnel(R, 0, 0, 1).P, pes = pontos.map(function (p) { return pesAnel(estado, R, p, op); });
    /* a SAÍDA no lado da frente: os cantos, os pés no lado e o meio; o eixo é o arco que termina nela e cobre um pé de cada
       ponto — vale o mais curto (os dois sentidos) */
    var cands = [a, b, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }].map(function (q) { return projAnel(R, q).s; });
    pes.forEach(function (lst) { lst.forEach(function (f) { if (f.lado === ixLado) cands.push(f.s); }); });
    var melhor = null;
    cands.forEach(function (sOut) {
      [1, -1].forEach(function (sent) {
        var L = 0, ok = true;
        pes.forEach(function (lst) { var m = null; lst.forEach(function (f) { var k = sent > 0 ? ((sOut - f.s) % P0 + P0) % P0 : ((f.s - sOut) % P0 + P0) % P0; if (m == null || k < m) m = k; }); if (m == null) ok = false; else L = Math.max(L, m); });
        if (!ok) return;
        var s0 = sent > 0 ? sOut - L : sOut + L, t1 = trechoAnel(R, s0, sOut, sent);
        if (!melhor || L < melhor.Lc - 0.01) { t1.Lc = L; melhor = t1; }   // hid:ok 1 cm = empate (fica o primeiro)
      });
    });
    var Pm = melhor.pontos[melhor.pontos.length - 1];
    var pts = melhor.pontos.map(function (q) { return { x: r4(q.x), z: r4(q.z) }; }).filter(function (q, i, Lp) { return i === 0 || d2(q, Lp[i - 1]) > 0.01; });   // hid:ok 1 cm
    if (pts.length < 2) pts = [{ x: r4(Pm.x), z: r4(Pm.z) }, { x: r4(Pm.x + (b.x - a.x) * 0.05), z: r4(Pm.z + (b.z - a.z) * 0.05) }];   // hid:ok linha mínima de um ponto só
    if (F.pendente) pend.push({ chave: "implantacao.saida", motivo: "saída da rede: " + F.origem + " — confirme o lado da rua (frente do lote) e a posição do coletor público (a caixa de inspeção geral fica perto da frente; NBR 8160 4.2.6.2)" });
    return { pontos: pts, saida: pts[pts.length - 1], lado: F.lado, origemSaida: F.origem, afast: d, pendencias: pend };
  }

  /* A REDE EXTERNA PROPOSTA (o "Traçar automaticamente" sem linha da rede): o eixo do coletor pelo recuo, passando atrás de
     cada aparelho (onde fica a caixa dele do lado de fora) e saindo na frente. Não propõe se o modelo já tem linha da rede
     ou caixa de inspeção do usuário (aí a caixa dele manda). → { op (hidRede), linha, motivo } | { op: null, motivo } */
  function redeProposta(estado, aparelhos, o) {
    o = o || {};
    var par = o.parametros || {};
    if (par.redeAutomatica === false) return { op: null, motivo: "rede automática desligada" };
    if (arr(estado && estado.hidRedes).length) return { op: null, motivo: "o modelo já tem linha da rede" };
    var temCI = arr(estado && estado.instalacoes && estado.instalacoes.pecas).some(function (k) { return k.peca === "caixa_inspecao"; }) ||
      arr(estado && estado.familias).some(function (f) { return /caixa-inspecao/.test(String(f.famId)); });
    if (temCI) return { op: null, motivo: "o modelo já tem caixa de inspeção do usuário" };
    var raio = num(o.raio, 0), pts = arr(aparelhos).map(function (f) { var pe = posicaoExterna(estado, { x: num(f.x, 0), z: num(f.z, 0) }, { raio: raio, parametros: par }); return pe ? { x: pe.x, z: pe.z } : null; }).filter(Boolean);
    if (!pts.length) return { op: null, motivo: "sem parede externa perto dos aparelhos" };
    var L = linhaRede(estado, pts, { raio: raio, parametros: par });
    if (!L) return { op: null, motivo: "sem paredes para achar o recuo" };
    return { op: { op: "hidRede", id: o.id || "rede-auto", pontos: L.pontos, baldrame: o.baldrame || "por_baixo", auto: true }, linha: L,
             motivo: "eixo do coletor pela área externa, a " + L.afast.toFixed(2).replace(".", ",") + " m das paredes externas, saída no lado " + L.lado + " (" + L.origemSaida + ")" };
  }

  var HidImplantacao = { VERSAO: 1, redeProposta: redeProposta, GEO_IMP: GEO_IMP, dentro: dentro, posicaoExterna: posicaoExterna, caminhoExterno: caminhoExterno, linhaRede: linhaRede, contorno: contorno, lote: lote,
    _int: { projAnelExterno: projAnelExterno, dentroPoli: dentroPoli, paredes: paredes, anel: anel, trechoAnel: trechoAnel, projAnel: projAnel, cruzaDentro: cruzaDentro, ladoFrente: ladoFrente } };
  global.HidImplantacao = HidImplantacao;
  if (typeof module !== "undefined" && module.exports) module.exports = HidImplantacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

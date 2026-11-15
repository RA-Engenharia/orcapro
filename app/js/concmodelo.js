/* =====================================================================
 * concmodelo.js — MODELO ANALÍTICO do concreto (fase C1, 14/11/2026): peças do estado BIM (pilares, vigas, lajes) →
 * nós e barras do solver REAPROVEITADO js/acoanalise.js (pórtico espacial). Motor PURO (ES5, Node-testável, sem DOM).
 * Plano: docs/concreto/PLANO-CALCULO-CONCRETO.md. Os números moram em js/concdadoscalc.js (gerado de dados-fonte/concreto/calculo.json).
 *
 * ⚠ "Cálculo de apoio — o engenheiro responsável confere e assina (ART)". Este arquivo NÃO escreve solver: monta o modelo
 *   e entrega ao AcoAnalise (proibido um segundo solver).
 *
 * O QUE FAZ
 *  1. pilares: uma barra vertical por peça, da base ao topo; pilares de pavimentos seguidos se juntam no mesmo nó
 *     (prumada); pilar sem nada abaixo e na cota mais baixa = ENGASTADO NA FUNDAÇÃO; pilar apoiado em viga (transição) fica
 *     ligado à viga; pilar sem apoio abaixo em cota acima da fundação é engastado e AVISADO;
 *  2. vigas: uma barra por peça (partida onde outro nó cai sobre ela). O eixo da viga fica NO NÍVEL DO PAVIMENTO (topo da
 *     laje), como o pórtico espacial usual — o desnível h/2 entre o eixo da viga e o topo é desprezado (premissa registrada);
 *  3. EXCENTRICIDADE viga-pilar: viga cuja ponta cai DENTRO da seção do pilar, fora do eixo dele, liga ao nó do pilar por um
 *     TRECHO RÍGIDO (barra com EI e EA × fatorTrechoRigido); ponta fora de qualquer pilar e fora de outra viga = balanço (aviso);
 *  4. viga apoiada em viga (ponta sobre o miolo de outra): extremidade com as rotações de flexão liberadas (ry, rz);
 *  5. LAJES: distribuição de carga às vigas por CHARNEIRAS (NBR 6118 14.7.6.1 b: 45° entre apoios do mesmo tipo, 60° a partir do
 *     engastado, 90° junto a borda livre). Cada borda com viga é "engastada" se há laje vizinha do outro lado da mesma viga,
 *     senão "simples"; borda sem viga = livre. Laje em uma direção (ly/lx > razão do pré-lançamento) e treliçada mandam a carga
 *     só para as bordas longas (a direção das nervuras da treliçada é do fabricante — PENDENTE). GRELHA EQUIVALENTE: opção
 *     `lajes: "grelha"` NÃO implementada (C3 não coube; ver ConcCargas lajesPorTabela); cai nas charneiras com aviso;
 *  6. IDs ESTÁVEIS: nó = "N" + cota (cm) das 3 coordenadas; barra = id da peça (e "#k" se foi partida); mesmo modelo = mesmos ids.
 *
 * RIGIDEZ (dois jogos de barras, devolvidos por modelo(rigidez)):
 *  · "bruta":    E = Ecs, seção bruta (análise linear de 1ª ordem para esforços e deslocamentos de serviço);
 *  · "reduzida": não linearidade física aproximada da 6118 15.7.3 — (EI)sec = 0,4·Eci·Ic (viga, As' ≠ As) e 0,8·Eci·Ic (pilar):
 *                E = Eci e Iy, Iz × fator; A × αi (EA = Ecs·A); G = Ecs/2,4 (não reduz a torção). Para γz (15.5.3).
 *  Torção: J elástico pleno, sem redução por fissuração (a redução da norma NÃO foi conferida — pendência).
 *
 * API
 *   ConcModelo.material(fck, agregado) → { fck, alphaE, Eci, Ecs, alphaI, G, ... } (kN/m²)
 *   ConcModelo.montar(estado, opc) → { ok, motivo, nos, barras, apoios, pecas, lajes, niveis, material, avisos, pendencias, premissas,
 *                                      modelo(rigidez) → { nos, barras, apoios } para AcoAnalise, trecho(viga, s0, s1) → [{barra, a, b}] }
 *     opc = { fck, agregado, vigaAsIgual, lajes: "charneira"|"grelha" }
 *   ConcModelo.regioesCharneira(poli, pesos) → áreas por borda (exportado para teste)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function CD() { return dep("ConcDadosCalc", "./concdadoscalc.js"); }
  function CRIT() { return dep("ConcDados", "./concdados.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function cv(k, d) { var D = CD(); return D ? D.v(k, d) : d; }
  function coord(v) { var n = Math.round(v * 100); return (n < 0 ? "m" : "") + Math.abs(n); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* ---------------------------------------------------------------- material (6118 8.2.8, 8.2.9) */
  function material(fck, agregado) {
    var ag = agregado || cv("agregadoPadrao", "granito"), aE = cv("alphaE_" + ag, null);
    if (aE == null) return { ok: false, motivo: "agregado desconhecido: " + ag };
    fck = Number(fck);
    if (!(fck >= 20 && fck <= 90)) return { ok: false, motivo: "fck fora de 20 a 90 MPa (6118 8.2.8)" };
    var Eci = fck <= 50 ? aE * cv("eciCoefMPa", 5600) * Math.sqrt(fck) : cv("eciAltaCoefMPa", 21500) * aE * Math.pow(fck / 10 + 1.25, 1 / 3);
    var aI = Math.min(cv("alphaIMax", 1.0), cv("alphaIBase", 0.8) + cv("alphaIParcela", 0.2) * fck / cv("alphaIDivisorMPa", 80));
    var Ecs = aI * Eci;
    return { ok: true, fck: fck, agregado: ag, alphaE: aE, Eci: Eci * 1000, Ecs: Ecs * 1000, alphaI: aI, G: Ecs * 1000 / cv("gcDivisor", 2.4), EciMPa: Eci, EcsMPa: Ecs };
  }

  /* ---------------------------------------------------------------- seção retangular */
  /* b = largura (z local), h = altura (y local). Iz = b·h³/12 (em torno de z, a "maior" quando h > b). J elástico (fórmula clássica do retângulo) */
  function secao(b, h) {
    var a = Math.min(b, h), c = Math.max(b, h);
    return { A: b * h, Iz: b * h * h * h / 12, Iy: h * b * b * b / 12, J: a * a * a * c * (1 / 3 - 0.21 * (a / c) * (1 - Math.pow(a, 4) / (12 * Math.pow(c, 4)))) };
  }

  /* ---------------------------------------------------------------- geometria 2D (XZ) */
  function areaPoli(P) { var s = 0, i; for (i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.z - b.x * a.z; } return s / 2; }
  function convexo(P) {
    var sg = 0, n = P.length;
    for (var i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n], c = P[(i + 2) % n], z = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      if (Math.abs(z) < 1e-9) continue;
      if (sg === 0) sg = z > 0 ? 1 : -1; else if ((z > 0 ? 1 : -1) !== sg) return false;
    }
    return true;
  }
  /* recorta o polígono pelo semiplano a·x + b·z + c ≥ 0 (Sutherland–Hodgman) */
  function recortar(P, a, b, c) {
    var out = [], n = P.length;
    for (var i = 0; i < n; i++) {
      var p = P[i], q = P[(i + 1) % n], fp = a * p.x + b * p.z + c, fq = a * q.x + b * q.z + c;
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { var t = fp / (fp - fq); out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }); }
    }
    return out;
  }
  function distSeg(p, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(Math.pow(p.x - (a.x + dx * t), 2) + Math.pow(p.z - (a.z + dz * t), 2));
  }
  /* ÁREAS DE INFLUÊNCIA POR BORDA (charneiras da 6118 14.7.6.1 b).
     Pesos: simples w = 1; engastada w = tan 60° (a charneira sai a 60° do engaste); livre w = 0 (90°: a borda de apoio leva até a perpendicular).
     Região da borda i = pontos com d_i/w_i mínimo (d = distância à borda). Entre duas bordas do mesmo tipo dá a bissetriz (45°); entre
     engastada e simples dá a reta a 60° do engaste, porque d_i/d_j = w_i/w_j = tan 60°. Polígono convexo: recorte exato por semiplanos.
     Não convexo: varredura em grade de 5 cm (aproximada; marcado). poli = [{x,z}], pesos = [w por borda] (aresta i = poli[i]→poli[i+1]). */
  function regioesCharneira(poli, pesos) {
    var n = poli.length, A = Math.abs(areaPoli(poli)), sinal = areaPoli(poli) >= 0 ? 1 : -1, nor = [], i, j;
    for (i = 0; i < n; i++) {
      var a = poli[i], b = poli[(i + 1) % n], dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz);
      /* normal para dentro: giro de 90° à esquerda se anti-horário (área > 0) */
      nor.push({ nx: -dz / L * sinal, nz: dx / L * sinal, a: a, L: L });
    }
    var areas = [], aprox = false;
    if (convexo(poli)) {
      for (i = 0; i < n; i++) {
        if (!(pesos[i] > 0)) { areas.push(0); continue; }
        var R = poli.slice();
        for (j = 0; j < n && R.length >= 3; j++) {
          if (j === i || !(pesos[j] > 0)) continue;
          /* d_i·w_j − d_j·w_i ≤ 0  →  d_j·w_i − d_i·w_j ≥ 0, com d_k(p) = n_k·(p − a_k) */
          var ci = nor[i], cj = nor[j];
          var ax = cj.nx * pesos[i] - ci.nx * pesos[j], az = cj.nz * pesos[i] - ci.nz * pesos[j];
          var c0 = -(cj.nx * cj.a.x + cj.nz * cj.a.z) * pesos[i] + (ci.nx * ci.a.x + ci.nz * ci.a.z) * pesos[j];
          R = recortar(R, ax, az, c0);
        }
        areas.push(R.length >= 3 ? Math.abs(areaPoli(R)) : 0);
      }
    } else {
      aprox = true;
      var xs = poli.map(function (p) { return p.x; }), zs = poli.map(function (p) { return p.z; }), h = 0.05, x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
      for (i = 0; i < n; i++) areas.push(0);
      for (var x = x0 + h / 2; x < x1; x += h) for (var z = z0 + h / 2; z < z1; z += h) {
        var P = { x: x, z: z };
        if (!dentro(poli, P)) continue;
        var best = -1, bv = 1e30;
        for (i = 0; i < n; i++) { if (!(pesos[i] > 0)) continue; var v = distSeg(P, poli[i], poli[(i + 1) % n]) / pesos[i]; if (v < bv) { bv = v; best = i; } }
        if (best >= 0) areas[best] += h * h;
      }
    }
    return { areas: areas, total: A, aproximado: aprox };
  }
  function dentro(poli, p) {
    var c = false, n = poli.length, i, j;
    for (i = 0, j = n - 1; i < n; j = i++) if (((poli[i].z > p.z) !== (poli[j].z > p.z)) && (p.x < (poli[j].x - poli[i].x) * (p.z - poli[i].z) / (poli[j].z - poli[i].z) + poli[i].x)) c = !c;
    return c;
  }

  /* ---------------------------------------------------------------- montar */
  function ehConcreto(c) { return !!(c && (c.material === "concreto" || (c.conc && c.conc.origem))); }
  function ativa(c) { return !(c && c.faseDemolida) && !(c && c.faseCriada === "Existente"); }

  function montar(estado, opc) {
    opc = opc || {};
    var avisos = [], pendencias = [], premissas = [], D = CD(), TOL = cv("tolGeometriaM", 0.06), TOLY = 0.08;
    if (!D) return { ok: false, motivo: "js/concdadoscalc.js ausente" };
    var crit = CRIT(), fck = num(opc.fck, crit && crit.criterios && crit.criterios.fckPadraoMPa ? crit.criterios.fckPadraoMPa.valor : null);
    if (opc.fck == null) premissas.push("fck = " + fck + " MPa ASSUMIDO (concdados.fckPadraoMPa) — o engenheiro informa o fck real.");
    if (opc.agregado == null) premissas.push("Agregado graúdo = " + cv("agregadoPadrao", "granito") + " (αE = " + cv("alphaE_" + cv("agregadoPadrao", "granito"), "?") + ") ASSUMIDO — a Tabela 8.1 da 6118 considera granito.");
    var mat = material(fck, opc.agregado);
    if (!mat.ok) return { ok: false, motivo: mat.motivo };

    var cx = arr(estado && estado.caixas).filter(function (c) { return c && ativa(c); });
    var pil = cx.filter(function (c) { return c.tipo === "pilar" && ehConcreto(c); }), vig = cx.filter(function (c) { return c.tipo === "viga" && ehConcreto(c); });
    var laj = cx.filter(function (c) { return c.tipo === "laje" && (ehConcreto(c) || c.tipoLaje); });
    function porId(a, b) { return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0; }
    pil.sort(porId); vig.sort(porId); laj.sort(porId);
    if (!pil.length) return { ok: false, motivo: "Sem pilares de concreto no modelo.", avisos: avisos };
    if (!vig.length) avisos.push("Sem vigas de concreto: só pilares no modelo.");

    var nos = [], barras = [], pilarNo = {};
    function achaNo(x, y, z) {
      for (var i = 0; i < nos.length; i++) { var n = nos[i]; if (Math.abs(n.y - y) <= TOLY && Math.abs(n.x - x) <= TOL && Math.abs(n.z - z) <= TOL) return n; }
      return null;
    }
    function no(x, y, z) {
      var n = achaNo(x, y, z); if (n) return n;
      n = { id: "N" + coord(x) + "_" + coord(y) + "_" + coord(z), x: r6(x), y: r6(y), z: r6(z) };
      nos.push(n); return n;
    }

    /* 1. pilares */
    var pecas = { pilares: {}, vigas: {} };
    pil.forEach(function (c) {
      var base = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - num(c.altura, 0) / 2, top = base + num(c.altura, 0), r = num(c.rotY, 0);
      var comp = num(c.comprimento, 0.2), esp = num(c.espessura, 0.2);
      var nb = no(num(c.cx, 0), base, num(c.cz, 0)), nt = no(num(c.cx, 0), top, num(c.cz, 0));
      var S = secao(esp, comp);   /* altura da seção (y local) = lado ao longo de u (rotY); largura (z local) = o outro */
      var vy = [Math.cos(r), 0, -Math.sin(r)];
      var p = { id: String(c.id), tipo: "pilar", marca: c.marca || "", ni: nb.id, nj: nt.id, sec: S, b: esp, h: comp, vy: vy, base: base, top: top, cx: num(c.cx, 0), cz: num(c.cz, 0), rotY: r, comp: comp, esp: esp };
      pecas.pilares[p.id] = p;
      barras.push({ id: p.id, tipo: "pilar", peca: p.id, ni: nb.id, nj: nt.id, sec: S, vy: vy, libera: null, rigida: false });
      pilarNo[nb.id] = pilarNo[nb.id] || p.id; pilarNo[nt.id] = pilarNo[nt.id] || p.id;
    });

    /* 2. vigas: pontas */
    function pilarContendo(x, z, y) {
      var melhor = null, dm = 1e30;
      Object.keys(pecas.pilares).forEach(function (k) {
        var p = pecas.pilares[k]; if (y < p.base - TOLY || y > p.top + TOLY) return;
        var dx = x - p.cx, dz = z - p.cz, u = dx * Math.cos(p.rotY) - dz * Math.sin(p.rotY), w = dx * Math.sin(p.rotY) + dz * Math.cos(p.rotY);
        if (Math.abs(u) <= p.comp / 2 + TOL && Math.abs(w) <= p.esp / 2 + TOL) { var d = Math.sqrt(dx * dx + dz * dz); if (d < dm) { dm = d; melhor = p; } }
      });
      return melhor;
    }
    var rigidos = [];
    function ponta(x, y, z, vigaId, lado) {
      var p = pilarContendo(x, z, y);
      if (p) {
        var nPil = no(p.cx, y, p.cz), off = Math.sqrt(Math.pow(x - p.cx, 2) + Math.pow(z - p.cz, 2));
        pilarNo[nPil.id] = pilarNo[nPil.id] || p.id;
        if (off <= TOL) return nPil.id;
        var nv = no(x, y, z);
        if (nv.id !== nPil.id) { rigidos.push({ id: "rig:" + vigaId + ":" + lado, ni: nPil.id, nj: nv.id, viga: vigaId }); avisos.push("Viga " + vigaId + " (" + lado + "): ponta excêntrica " + Math.round(off * 100) + " cm do eixo do pilar " + (p.marca || p.id) + " — trecho rígido."); }
        return nv.id;
      }
      return no(x, y, z).id;
    }
    vig.forEach(function (c) {
      var r = num(c.rotY, 0), L = num(c.comprimento, 0), cxx = num(c.cx, 0), czz = num(c.cz, 0), y = c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
      var A = { x: cxx - L / 2 * Math.cos(r), z: czz + L / 2 * Math.sin(r) }, B = { x: cxx + L / 2 * Math.cos(r), z: czz - L / 2 * Math.sin(r) };
      var h = num(c.altura, 0.4), bw = num(c.espessura, 0.15), S = secao(bw, h);
      var ia = ponta(A.x, y, A.z, String(c.id), "i"), ib = ponta(B.x, y, B.z, String(c.id), "j");
      if (ia === ib) { avisos.push("Viga " + c.id + ": pontas no mesmo nó (comprimento nulo) — ignorada."); return; }
      pecas.vigas[String(c.id)] = { id: String(c.id), tipo: "viga", marca: c.marca || "", ni: ia, nj: ib, sec: S, b: bw, h: h, A: A, B: B, y: y, L: L };
      barras.push({ id: String(c.id), tipo: "viga", peca: String(c.id), ni: ia, nj: ib, sec: S, vy: [0, 1, 0], libera: null, rigida: false });
    });
    rigidos.forEach(function (rg) {
      var S = secao(0.3, 0.3);
      barras.push({ id: rg.id, tipo: "rigido", peca: rg.viga, ni: rg.ni, nj: rg.nj, sec: S, vy: [0, 1, 0], libera: null, rigida: true });
    });

    /* 3. partir as barras onde outro nó cai no miolo */
    var nosPorId = {}; nos.forEach(function (n) { nosPorId[n.id] = n; });
    var novas = [];
    barras.forEach(function (b) {
      if (b.rigida) { novas.push(b); return; }
      var P = nosPorId[b.ni], Q = nosPorId[b.nj], dx = Q.x - P.x, dy = Q.y - P.y, dz = Q.z - P.z, L2 = dx * dx + dy * dy + dz * dz, ts = [];
      nos.forEach(function (n) {
        if (n.id === b.ni || n.id === b.nj) return;
        var t = ((n.x - P.x) * dx + (n.y - P.y) * dy + (n.z - P.z) * dz) / L2; if (t <= 0.001 || t >= 0.999) return;
        var ex = P.x + dx * t - n.x, ey = P.y + dy * t - n.y, ez = P.z + dz * t - n.z;
        if (Math.sqrt(ex * ex + ey * ey + ez * ez) <= TOL) ts.push({ t: t, no: n.id });
      });
      if (!ts.length) { novas.push(b); return; }
      ts.sort(function (p, q) { return p.t - q.t; });
      var prev = b.ni, k = 1;
      ts.concat([{ t: 1, no: b.nj }]).forEach(function (s) {
        novas.push({ id: b.id + "#" + k, tipo: b.tipo, peca: b.peca, ni: prev, nj: s.no, sec: b.sec, vy: b.vy, libera: null, rigida: false, partida: true, ptoI: prev === b.ni, ptoJ: s.no === b.nj });
        prev = s.no; k++;
      });
    });
    barras = novas;

    /* 4. extremidades: viga apoiada em viga (rotações de flexão liberadas) e balanço */
    var inc = {}; barras.forEach(function (b) { (inc[b.ni] = inc[b.ni] || []).push(b); (inc[b.nj] = inc[b.nj] || []).push(b); });
    function dirBarra(b, de) { var P = nosPorId[b.ni], Q = nosPorId[b.nj], s = de === b.ni ? 1 : -1, dx = (Q.x - P.x) * s, dy = (Q.y - P.y) * s, dz = (Q.z - P.z) * s, l = Math.sqrt(dx * dx + dy * dy + dz * dz); return [dx / l, dy / l, dz / l]; }
    barras.forEach(function (b) {
      if (b.tipo !== "viga" || b.rigida) return;
      var lib = {};
      [["i", b.ni], ["j", b.nj]].forEach(function (e) {
        var nid = e[1];
        if (pilarNo[nid]) return;
        var outras = (inc[nid] || []).filter(function (o) { return o !== b && o.tipo !== "pilar"; });
        var d0 = dirBarra(b, nid), cont = outras.some(function (o) { if (o.peca === b.peca) return true; var d1 = dirBarra(o, nid); return d0[0] * d1[0] + d0[1] * d1[1] + d0[2] * d1[2] < -0.99; });
        if (!outras.length) { avisos.push("Viga " + b.peca + ": extremidade " + e[0] + " sem pilar nem viga (BALANÇO) — conferir."); return; }
        if (!cont) { lib[e[0]] = { ry: true, rz: true }; avisos.push("Viga " + b.peca + ": extremidade " + e[0] + " apoiada em viga — flexão liberada (rótula)."); }
      });
      if (lib.i || lib.j) b.libera = lib;
    });

    /* 5. apoios: engaste na fundação */
    var ymin = Math.min.apply(null, Object.keys(pecas.pilares).map(function (k) { return pecas.pilares[k].base; }));
    var apoios = [];
    Object.keys(pecas.pilares).forEach(function (k) {
      var p = pecas.pilares[k], nid = p.ni, outras = (inc[nid] || []).filter(function (o) { return o.peca !== p.id || o.tipo !== "pilar"; });
      var abaixo = (inc[nid] || []).some(function (o) { return o.peca !== p.id && o.tipo === "pilar" && nosPorId[o.ni] && nosPorId[o.ni].y < nosPorId[nid].y - 0.01 && o.nj === nid; });
      var sobreViga = (inc[nid] || []).some(function (o) { return o.tipo === "viga"; });
      if ((abaixo || sobreViga) && p.base > ymin + TOLY) return;
      if (apoios.some(function (a) { return a.no === nid; })) return;
      apoios.push({ no: nid, ux: true, uy: true, uz: true, rx: true, ry: true, rz: true });
      if (p.base > ymin + TOLY) avisos.push("Pilar " + (p.marca || p.id) + ": sem apoio abaixo (cota " + p.base.toFixed(2) + " m, acima da fundação) — engastado na base; conferir a transição.");
    });
    premissas.push("Pilares engastados na fundação (apoios com 6 graus restritos); a interação solo-estrutura não é modelada.");
    premissas.push("Eixo da viga no nível do pavimento (topo da laje): o desnível h/2 entre o eixo da viga e o topo é desprezado.");
    premissas.push("Viga apoiada no miolo de outra viga: extremidade com as rotações de flexão liberadas (rótula); a torção da viga principal não é verificada por essa ligação.");
    premissas.push("Torção: rigidez J elástica plena (sem redução por fissuração) — a redução da 6118 não foi conferida (pendência).");
    premissas.push("Rigidez 'reduzida' (15.7.3): vigas 0,4·Eci·Ic" + (opc.vigaAsIgual ? " → 0,5 (As' = As informado)" : " (As' ≠ As; armadura ainda desconhecida)") + ", pilares 0,8·Eci·Ic; lajes (0,3) não entram: viram carga nas vigas.");

    /* 6. lajes: charneiras */
    var vigasArr = Object.keys(pecas.vigas).map(function (k) { return pecas.vigas[k]; });
    var lajes = [];
    var modoLaje = opc.lajes === "grelha" ? "grelha" : "charneira";
    if (modoLaje === "grelha") { pendencias.push("Laje como GRELHA EQUIVALENTE: NÃO implementada (C3 decidiu não caber: exige rigidez de placa e torção das barras no AcoAnalise e validação própria). Usando charneiras (6118 14.7.6.1 b); para as reações pelas tabelas de Bares use ConcCargas opc.lajesPorTabela."); avisos.push("Opção lajes:'grelha' NÃO implementada — usadas as charneiras (ver lajesPorTabela, C3)."); }
    laj.forEach(function (c) {
      var P = arr(c.contorno).map(function (p) { return { x: num(p.x, 0), z: num(p.z, 0) }; });
      if (P.length < 3) { avisos.push("Laje " + c.id + ": contorno inválido — sem carga distribuída."); return; }
      var topo = num(c.cy, 0) + num(c.altura, 0) / 2, n = P.length, areaBruta = Math.abs(areaPoli(P)), areaFuros = num(c.areaFuros, 0);
      var ed = [], i;
      for (i = 0; i < n; i++) {
        var a = P[i], b = P[(i + 1) % n], dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz), ux = dx / L, uz = dz / L, apoios2 = [];
        vigasArr.forEach(function (v) {
          if (Math.abs(v.y - topo) > TOLY) return;
          var vx = v.B.x - v.A.x, vz = v.B.z - v.A.z, vl = Math.sqrt(vx * vx + vz * vz); if (!(vl > 0)) return;
          var vux = vx / vl, vuz = vz / vl;
          if (Math.abs(ux * vuz - uz * vux) > 0.05) return;
          var dperp = Math.abs((v.A.x - a.x) * (-uz) + (v.A.z - a.z) * ux);
          if (dperp > v.b / 2 + TOL + 0.02) return;
          var s0 = ((v.A.x - a.x) * ux + (v.A.z - a.z) * uz), s1 = ((v.B.x - a.x) * ux + (v.B.z - a.z) * uz);
          var t0 = Math.max(0, Math.min(s0, s1)), t1 = Math.min(L, Math.max(s0, s1));
          if (t1 - t0 < 0.05) return;
          /* lado da laje em relação ao eixo da viga: centroide da laje */
          var cxm = 0, czm = 0; P.forEach(function (q) { cxm += q.x / n; czm += q.z / n; });
          var lado = ((cxm - v.A.x) * (-vuz) + (czm - v.A.z) * vux) >= 0 ? 1 : -1;
          /* posição ao longo da viga: sv = distância desde A */
          var sa = ((a.x + ux * t0) - v.A.x) * vux + ((a.z + uz * t0) - v.A.z) * vuz, sb = ((a.x + ux * t1) - v.A.x) * vux + ((a.z + uz * t1) - v.A.z) * vuz;
          apoios2.push({ viga: v.id, t0: t0, t1: t1, sa: Math.min(sa, sb), sb: Math.max(sa, sb), lado: lado, comp: t1 - t0 });
        });
        ed.push({ i: i, L: L, apoios: apoios2 });
      }
      lajes.push({ id: String(c.id), marca: c.marca || "", poli: P, topo: topo, h: num(c.altura, 0.1), tipo: c.conc && c.conc.tipoLaje ? c.conc.tipoLaje : (c.tipoLaje && /treli/i.test(String(c.tipoLaje.id) + String(c.tipoLaje.rotulo)) ? "trelicada" : "macica"),
        umaDirecao: !!(c.conc && c.conc.umaDirecao), balanco: !!(c.conc && c.conc.balanco), areaBruta: areaBruta, areaFuros: areaFuros, areaLiquida: areaBruta - areaFuros, ed: ed });
    });
    /* tipo de cada borda: engastada se outra laje, do outro lado da mesma viga, a cobre */
    lajes.forEach(function (l) {
      l.ed.forEach(function (e) {
        e.tipo = "livre";
        if (!e.apoios.length) return;
        var engast = e.apoios.some(function (ap) {
          return lajes.some(function (o) { return o !== l && Math.abs(o.topo - l.topo) < TOLY && o.ed.some(function (oe) { return oe.apoios.some(function (oa) { return oa.viga === ap.viga && oa.lado !== ap.lado && Math.min(oa.sb, ap.sb) - Math.max(oa.sa, ap.sa) > 0.05; }); }); });
        });
        e.tipo = engast ? "engastada" : "simples";
        var cob = e.apoios.reduce(function (s, ap) { return s + ap.comp; }, 0);
        if (cob < 0.8 * e.L) avisos.push("Laje " + (l.marca || l.id) + ": borda " + e.i + " só " + Math.round(100 * cob / e.L) + "% apoiada em viga — a carga vai para o trecho com viga.");
      });
      /* uma direção: as bordas curtas não recebem carga */
      var unid = l.umaDirecao || l.tipo === "trelicada";
      if (l.tipo === "trelicada") pendencias.push("Laje treliçada " + (l.marca || l.id) + ": direção das nervuras (carga só nas bordas longas) é ASSUMIDA — vem do fabricante (pendente).");
      var W = l.ed.map(function (e) { return e.tipo === "livre" ? 0 : (e.tipo === "engastada" ? Math.tan(cv("charneiraEngastadoGraus", 60) * Math.PI / 180) : 1); });
      if (unid && l.ed.length === 4) {
        var comps = l.ed.map(function (e) { return e.L; }), par0 = comps[0] + comps[2], par1 = comps[1] + comps[3], curtas = par0 <= par1 ? [0, 2] : [1, 3];
        if (par0 !== par1) curtas.forEach(function (k) { W[k] = 0; });
      }
      var tem = W.some(function (w) { return w > 0; });
      if (!tem) { l.reacoes = []; l.semApoio = true; avisos.push("Laje " + (l.marca || l.id) + ": nenhuma borda apoiada em viga — carga NÃO transmitida (o equilíbrio fica aberto)."); return; }
      var R = regioesCharneira(l.poli, W);
      l.regioes = R.areas; l.aproximado = R.aproximado;
      if (R.aproximado) avisos.push("Laje " + (l.marca || l.id) + ": contorno não convexo — charneiras por varredura em grade (aproximado).");
      var escala = l.areaLiquida / R.total;
      l.reacoes = [];
      l.ed.forEach(function (e, k) {
        var tot = e.apoios.reduce(function (s, ap) { return s + ap.comp; }, 0); if (!(R.areas[k] > 0) || !(tot > 0)) return;
        e.apoios.forEach(function (ap) { l.reacoes.push({ viga: ap.viga, borda: k, sa: ap.sa, sb: ap.sb, fracaoArea: R.areas[k] / R.total * escala * (ap.comp / tot), tipoBorda: e.tipo }); });
      });
    });

    /* 7. níveis (cotas dos nós de topo de pilar acima da fundação) */
    var niveis = {};
    Object.keys(pecas.pilares).forEach(function (k) { var p = pecas.pilares[k], key = Math.round(p.top * 100); (niveis[key] = niveis[key] || { y: p.top, nos: [] }); if (niveis[key].nos.indexOf(p.nj) < 0) niveis[key].nos.push(p.nj); });
    var listaNiveis = Object.keys(niveis).map(function (k) { return niveis[k]; }).sort(function (a, b) { return a.y - b.y; });
    nos.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    barras.sort(function (a, b) { return a.id < b.id ? -1 : 1; });

    /* barras: s0/s1 (projeção no eixo da peça-viga a partir da ponta A) para os trechos carregados */
    var nosId = {}; nos.forEach(function (n) { nosId[n.id] = n; });
    barras.forEach(function (b) {
      if (b.tipo !== "viga") return;
      var v = pecas.vigas[b.peca], vx = v.B.x - v.A.x, vz = v.B.z - v.A.z, vl = Math.sqrt(vx * vx + vz * vz);
      function proj(nid) { var n = nosId[nid]; return ((n.x - v.A.x) * vx + (n.z - v.A.z) * vz) / vl; }
      var p0 = proj(b.ni), p1 = proj(b.nj); b.s0 = Math.min(p0, p1); b.s1 = Math.max(p0, p1); b.L = Math.sqrt(Math.pow(nosId[b.ni].x - nosId[b.nj].x, 2) + Math.pow(nosId[b.ni].z - nosId[b.nj].z, 2));
    });
    barras.forEach(function (b) {
      if (b.tipo === "pilar") { b.L = Math.abs(nosId[b.nj].y - nosId[b.ni].y); b.pecaDim = pecas.pilares[b.peca]; }
    });

    function trecho(vigaId, s0, s1) {
      var out = [];
      barras.forEach(function (b) {
        if (b.tipo !== "viga" || b.peca !== vigaId) return;
        var a = Math.max(s0, b.s0), z = Math.min(s1, b.s1); if (!(z > a + 1e-9) || !(b.s1 > b.s0)) return;
        var pi = nosId[b.ni], pj = nosId[b.nj], v = pecas.vigas[vigaId], vx = v.B.x - v.A.x, vz = v.B.z - v.A.z, vl = Math.sqrt(vx * vx + vz * vz);
        var sI = ((pi.x - v.A.x) * vx + (pi.z - v.A.z) * vz) / vl, sJ = ((pj.x - v.A.x) * vx + (pj.z - v.A.z) * vz) / vl, dir = sJ >= sI ? 1 : -1;
        var fa = dir > 0 ? (a - sI) / (sJ - sI) : (sI - z) / (sI - sJ), fb = dir > 0 ? (z - sI) / (sJ - sI) : (sI - a) / (sI - sJ);
        out.push({ barra: b.id, a: Math.max(0, Math.min(1, fa)), b: Math.max(0, Math.min(1, fb)) });
      });
      return out;
    }

    /* modelo para o AcoAnalise */
    function modelo(rigidez) {
      var red = rigidez === "reduzida", f = {
        viga: opc.vigaAsIgual ? cv("rigidezVigaAsLinhaIgual", 0.5) : cv("rigidezVigaAsLinhaDiferente", 0.4),
        pilar: cv("rigidezPilar", 0.8)
      }, KR = cv("fatorTrechoRigido", 1000);
      var bs = barras.map(function (b) {
        var S = b.sec, o = { id: b.id, i: b.ni, j: b.nj, vy: b.vy, nElem: 1, pesoEsp: 0, G: mat.G };
        if (b.rigida) { o.E = mat.Ecs * KR; o.secao = { A: 1, Iy: 1, Iz: 1, J: 1 }; o.G = mat.G * KR; return o; }
        if (!red) { o.E = mat.Ecs; o.secao = { A: S.A, Iy: S.Iy, Iz: S.Iz, J: S.J }; }
        else { var fr = b.tipo === "pilar" ? f.pilar : f.viga; o.E = mat.Ecs; o.secao = { A: S.A, Iy: S.Iy * fr, Iz: S.Iz * fr, J: S.J }; }
        if (b.libera) o.libera = { i: b.libera.i || {}, j: b.libera.j || {} };
        return o;
      });
      return { nos: nos.map(function (n) { return { id: n.id, x: n.x, y: n.y, z: n.z }; }), barras: bs, apoios: clone(apoios), casos: [] };
    }

    return { ok: true, nos: nos, barras: barras, apoios: apoios, pecas: pecas, lajes: lajes, niveis: listaNiveis, material: mat, fck: fck, ymin: ymin,
             avisos: avisos, pendencias: pendencias, premissas: premissas, modelo: modelo, trecho: trecho };
  }

  var ConcModelo = { montar: montar, material: material, secao: secao, regioesCharneira: regioesCharneira };
  global.ConcModelo = ConcModelo;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcModelo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

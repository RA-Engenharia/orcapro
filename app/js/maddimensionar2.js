/* =====================================================================
 * maddimensionar2.js — ORQUESTRADOR GENÉRICO do projeto de estrutura de madeira engenharada (motor PURO, ES5, sem DOM, Node-testável).
 * Generaliza o casamar_casa.js + dimensionar_casa.js + final_casa.js da obra Casa Mar (R02, 23/10/2026): a Casa Mar é um CASO de parâmetros.
 *
 * Fluxo (tipologia T1 — cobertura de uma água; as demais entram na E4):
 *   tipologia (madtipologias: geometria) → modelo do acoanalise (pilares com mola na base e topo rotulado na V, V de altura variável,
 *   terças contínuas, escoras e bloqueadores como BARRAS, fita só-tração, verga + travessa + pendural) → cargas (G, Q de cobertura, vento
 *   ortogonal + OBLÍQUO + beiral, abertura dominante como EXCEPCIONAL) → combinações (acocargas + excepcionais γ = 1) → análise 2ª ordem
 *   → verificação por GRUPO (maddim7190) → laço de CRESCIMENTO de seção no passo do fabricante (20 mm na largura, 40 mm na altura, dentro do
 *   limite de altura) → ligações (madligacoes) → flechas (φ, ψ2) e deslocamento de topo → fonte (madtipologias) → auditor (madauditor).
 *
 * Convenções do solver: x = X − origem.x, y = vertical (cota), z = Y − origem.y. Mz > 0 comprime a face de cima (acoanalise).
 * Todas as verificações são do maddim7190 (NBR 7190-1:2022, fonte secundária) e o MLC é EN 14080 (madmateriais, fonte secundária).
 * Entrada `proj`:
 *   { params (T1.parametros), vento (entrada do acovento), classe ("mlc:GL24h"), umidade (3), limVao (300), limBalanco (150),
 *     pesoMLC (kN/m³, 5,0), cargas {telha 0,12, lambriPeso 6,0, outros 0,03}, krBase (kN·m/rad — mola da base),
 *     passo {largura: 0.02, altura: 0.04}, limites {T:{hMax,bMax}, V:{bMax}, VG:{hMax}}, penduralPresente (true), opcao ("A"…) }
 * DESEMPENHO (R05, 24/10/2026) — meta: ≤ 20 s por opção na tela (worker), SEM mudar nenhum resultado. Com as combinações ELU em 78 (vento oblíquo, abertura dominante em sucção,
 *   torção) a Casa Mar levava 48 s (A), 104–292 s (B, pilar duplo) e 78 s (C). Perfil (--cpu-prof): 60 % do tempo era a FATORAÇÃO da matriz em perfil (Perfil.fatorar do
 *   acoanalise) — a 2ª ordem refatora a matriz a cada iteração (Kg(N) muda), 78 combinações × ~4,6 fatorações = 361 por análise. O que foi feito (tudo em js/acoanalise.js, as
 *   seções e os esforços saem iguais; a diferença máxima contra o cálculo anterior é de 1e-6 relativo, abaixo da tolerância de 1e-4 do próprio laço de 2ª ordem):
 *     · gradiente conjugado pré-condicionado (pcg) pelo fator da análise anterior em vez de fatorar de novo: 361 → 3 fatorações por análise;
 *     · kGlobal por blocos 3×3 (mesma ordem de somas — idêntico bit a bit) e laço interno da fatoração com índices incrementais (idêntico bit a bit);
 *     · estrutura quase solta (pivô relativo da 1ª fatoração < 1e-9 — caso da torre de 3 pilares do tanque elevado, test-aco-tanque) fica só no caminho direto: o gradiente conjugado poderia "resolver" uma matriz que o Cholesky recusa como instável;
 *     · opção `comPCG: true` (acoanalise.analisar; DESLIGADA por padrão no motor — a Metálica não usa) liga o gradiente conjugado; sem ela, caminho direto de sempre.
 *   Tempos (mesmo PC, node, medidos pelo test-mad-eng-casamar; PC em uso dobra o número): A 36–48 → 12 s · B 104–292 → 17 s · C 78 → 10 s. Não foi feito (e por quê): pré-filtro de combinações em 1ª ordem com 2ª ordem só nas que
 *   governam — o ganho (1 de 2–3 iterações do laço) não compensa o risco de trocar o caminho de crescimento das seções; salto direto da seção do pilar duplo — mudaria a seção final.
 *   Teste de tempo: tools/test-mad-eng-casamar.js avisa (não falha) quando uma opção passa de 30 s.
 * Teste: node tools/test-mad-eng-casamar.js (regressão)
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var AN = req("AcoAnalise", "acoanalise.js"), VE = req("AcoVento", "acovento.js"), CA = req("AcoCargas", "acocargas.js");
  var MM = req("MadMateriais", "madmateriais.js"), MD = req("MadDim", "maddim7190.js"), MT = req("MadTipologias", "madtipologias.js");
  var ML = req("MadLig", "madligacoes.js");
  function opc(nome, arq) { try { return req(nome, arq); } catch (e) { return null; } }
  var AUD = opc("MadAuditor", "madauditor.js");

  var DIR_PAREDE = { x0: 0, y0: 90, x1: 180, y1: 270 };   // direção do vento (°) que bate em cada parede da planta (convenção da obra: 0 = parede x0, 90 = frente y0, 180 = x1, 270 = fundos y1)
  function ext(a) { for (var i = 1; i < arguments.length; i++) for (var k in arguments[i]) if (Object.prototype.hasOwnProperty.call(arguments[i], k)) a[k] = arguments[i][k]; return a; }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }
  function idx(arr, f) { for (var i = 0; i < arr.length; i++) if (f(arr[i])) return i; return -1; }
  function r2(x) { return Math.round(x * 1000) / 1000; }

  function padrao(proj) {
    var q = {}; Object.keys(proj).forEach(function (k) { if (k.charAt(0) !== "_") q[k] = proj[k]; });
    q.classe = q.classe || "mlc:GL24h"; q.umidade = q.umidade || 3;
    if ([1, 2, 3, 4].indexOf(q.umidade) < 0) throw new Error("maddimensionar2: classe de umidade " + q.umidade + " inválida (1 a 4)");
    var cl = MM.classe2022(q.classe);                            // M5: classe incompleta (GL..c, CLT, LVL) recusa AQUI, com a mensagem certa
    if (cl.incompleta) throw new Error("madmateriais: classe " + q.classe + " incompleta — " + cl.incompleta + " (o motor recusa calcular sem valor com fonte)"); q.limVao = q.limVao || 300; q.limBalanco = q.limBalanco || 150;
    q.pesoMLC = q.pesoMLC != null ? q.pesoMLC : 5.0;
    q.cargas = ext({ telha: 0.12, lambriPeso: 6.0, outros: 0.03 }, q.cargas || {});
    q.passo = ext({ largura: 0.02, altura: 0.04 }, q.passo || {});
    q.limites = q.limites || { T: { hMax: 0.36, bMax: 0.24 }, V: { bMax: 0.28 }, VG: { hMax: 0.48 } };
    q.penduralPresente = q.penduralPresente !== false;
    q.params = MT.T1.parametros(q.params);
    /* M2 (R05): o T1 modela o caimento da água na direção Y (vão b) e o beiral ao longo de X (lado maior a); a NBR 6123:2023 (Tabelas 5/6 do acovento) exige a ≥ b. Casa mais FUNDA (Y) que LARGA (X) é recusada AQUI, antes de montar o modelo, com a saída: girar a planta 90° na entrada (trocar x e y). */
    var parM2 = q.params.parede;
    if (parM2 && (parM2.y1 - parM2.y0) > (parM2.x1 - parM2.x0) + 1e-6)
      throw new Error("M2: a casa é mais funda (Y = " + (parM2.y1 - parM2.y0).toFixed(2).replace(".", ",") + " m) do que larga (X = " + (parM2.x1 - parM2.x0).toFixed(2).replace(".", ",") + " m). O T1 modela o caimento da água em Y e a NBR 6123 (cobertura de uma água) exige a ≥ b, com o beiral ao longo do lado maior. Gire a planta 90° na entrada (o lado MAIOR em X, o caimento em Y: troque x por y em pilares, teto, parede e vento) e recalcule; o motor não gira a convenção sozinho.");
    /* M15: o T1 é SEMPRE casa fechada com vidro (verga, carga de fachada e abertura dominante entram sempre) — casa aberta, varanda e cobertura isolada são RECUSADAS até a tipologia própria (E4) */
    var vg0 = q.vento && q.vento.geometria, fcs = (q.vento && q.vento.faces) || {};
    if (q.aberta || q.params.semVidro || q.params.aberta || (vg0 && vg0.aberta) || Object.keys(fcs).some(function (k) { return fcs[k] && fcs[k].fechada === false; }))
      throw new Error("maddimensionar2: o T1 é uma casa FECHADA com vidro (vergas, vento nas fachadas e abertura dominante entram sempre). Casa aberta, varanda, pergolado ou cobertura isolada (face com fechada:false, geometria.aberta, params.semVidro) NÃO são modeladas — recusado até a tipologia de cobertura isolada (E4), que usa as Tabelas 17/18 da NBR 6123.");
    return q;
  }
  /** M14: o cache (proj._pad, q._vento) só vale enquanto a entrada não mudar — a chave é o JSON da entrada sem as chaves "_" */
  function padraoCache(proj) {
    var key = JSON.stringify(proj, function (k, v) { return (k.charAt(0) === "_" && k !== "") ? undefined : v; });
    if (!proj._pad || proj._padKey !== key) { proj._pad = padrao(proj); proj._padKey = key; }
    return proj._pad;
  }
  function modulos(c) {
    var E = c.Ec0m * 1e3;                                       // kN/m² (MPa → kN/m²)
    return { E: E, G: c.Gm * 1e3 };
  }

  /* ---------- tipo de ações e perfil ---------- */
  /* R26 (decisão do coordenador, 24/10/2026): φ pela NBR 7190-1:2022, Tabela 20 (p. 66 impressa / PDF 78): por PRODUTO (serrada, MLC, MLCC, LVL, roliça = mesma linha) e CLASSE DE UMIDADE — MLC na classe 3 = 0,8.
     O 2,0 fixo da R2 (NBR 7190:1997 / EN 1995 SC3, adotado antes de a norma estar transcrita) virou OPÇÃO explícita: proj.phiConservador = true (terça 16 cm e mais custo na Casa Mar). */
  function perfilFn(q) {
    var cache = {};
    return function (car) { return cache[car] || (cache[car] = MM.perfil2022({ carregamento: car, umidade: q.umidade, produto: "serrada", betaC: /^mlc:/i.test(q.classe) ? 0.1 : undefined, limVao: q.limVao, limBalanco: q.limBalanco, fluencia: q.fluencia, phiConservador: !!q.phiConservador })); };
  }
  function ret(b, h) {
    var a = Math.max(b, h), c = Math.min(b, h);
    var J = a * c * c * c * (1 / 3 - 0.21 * (c / a) * (1 - Math.pow(c / a, 4) / 12));
    return { A: b * h, Iz: b * h * h * h / 12, Iy: h * b * b * b / 12, J: J };
  }
  function circ(d) { var A = Math.PI * d * d / 4, I = Math.PI * Math.pow(d, 4) / 64; return { A: A, Iz: I, Iy: I, J: 2 * I }; }

  /* ---------- vento ---------- */
  /**
   * M1: a GEOMETRIA do vento sai do T1 (nada fixo de obra): a, b = planta do fechamento (parede); h/hCumeeira = ponto mais alto do telhado (cota da telha + DZ + testeira, sobre o lado alto) e
   * esse menos b·tg θ; θ = atan|incl|; lado alto = sinal de incl. Os campos de proj.vento.geometria que divergirem viram AVISO (vale o do T1). Faces/nervuras/obstruções: do usuário (padrão: fechadas "misto").
   */
  function ventoGeometria(q, g, avisos) {
    var p = q.params, c = p.cobertura, PAR = g.PAREDE, TETO = g.TETO, incl = c.incl, altoEsq = incl >= 0;
    var a = PAR.x1 - PAR.x0, b = PAR.y1 - PAR.y0, th = Math.atan(Math.abs(incl)) * 180 / Math.PI, hc = g.zt(altoEsq ? TETO.y0 : TETO.y1) - p.baseZ + (p.testeiraH || 0), h = hc - b * Math.abs(incl);
    var der = { a: a, b: b, h: h, hCumeeira: hc, inclinacaoGraus: th, cobertura: "uma-agua", ladoAlto: altoEsq ? "esquerda" : "direita" };
    var u = (q.vento && q.vento.geometria) || {}, dif = [];
    if (q.diagnostico && q.diagnostico.ventoUsuario) return ext({ nervuras: "retangulares" }, u);          // só para atribuir diferenças R03 → R04 (tools/r04-atribuicao.js)
    [["a", 0.05], ["b", 0.05], ["h", 0.2], ["hCumeeira", 0.2], ["inclinacaoGraus", 0.5]].forEach(function (t) { if (u[t[0]] != null && Math.abs(u[t[0]] - der[t[0]]) > t[1]) dif.push(t[0] + " " + String(u[t[0]]).replace(".", ",") + " → " + (Math.round(der[t[0]] * 1000) / 1000).toString().replace(".", ",")); });
    if (u.ladoAlto && u.ladoAlto !== der.ladoAlto) dif.push("ladoAlto \"" + u.ladoAlto + "\" → \"" + der.ladoAlto + "\"");
    if (u.cobertura && u.cobertura !== "uma-agua") dif.push("cobertura \"" + u.cobertura + "\" → \"uma-agua\"");
    if (dif.length) avisos.push("M1: a geometria do vento foi RECALCULADA a partir do T1 (planta do fechamento, cotas do telhado, inclinação e lado alto); divergiam: " + dif.join("; ") + ".");
    return ext({}, { nervuras: "retangulares" }, u, der);
  }
  /** vento com os 4 casos oblíquos (opção obliquos do acovento) — cacheado em q._vento, pela chave da geometria derivada (a cota da telha muda com DZ) */
  function vento(q, g, avisos) {
    var av = [], geo = ventoGeometria(q, g, av), key = JSON.stringify(geo) + JSON.stringify(q.vento), r;
    function junta() { av.forEach(function (t) { if (avisos.indexOf(t) < 0) avisos.push(t); }); }
    if (q._vento && q._ventoKey === key) { junta(); (q._ventoAv || []).forEach(function (t) { if (avisos.indexOf(t) < 0) avisos.push(t); }); return q._vento; }
    var ent = ext({}, q.vento, { geometria: geo }), av2 = [];
    if (!ent.faces) { ent.faces = {}; ["frente", "fundo", "esquerda", "direita"].forEach(function (k) { ent.faces[k] = { fechada: true, vedacao: "misto" }; }); av2.push("M1: faces do vento não informadas — adotadas as 4 fechadas (vedação mista)."); }
    r = VE.calcular(ent, { todasDirecoes: true, obliquos: true });
    if (!r.ok) throw new Error("vento: " + JSON.stringify(r.erros));
    q._vento = r; q._ventoKey = key; q._ventoAv = av2; junta(); av2.forEach(function (t) { if (avisos.indexOf(t) < 0) avisos.push(t); }); return r;
  }
  function foraDaPlanta(PAREDE, X, Y) { var o = {}; o[DIR_PAREDE.x0] = X < PAREDE.x0; o[DIR_PAREDE.x1] = X > PAREDE.x1; o[DIR_PAREDE.y0] = Y < PAREDE.y0; o[DIR_PAREDE.y1] = Y > PAREDE.y1; return o; }
  function pressaoTeto(PAREDE, caso, X, Y) {
    var xa = Math.min(Math.max(Y - PAREDE.y0, 0), PAREDE.y1 - PAREDE.y0), za = Math.min(Math.max(X - PAREDE.x0, 0), PAREDE.x1 - PAREDE.x0), p = null;
    caso.pressao.cobertura.forEach(function (z) {
      if (xa >= z.x0 - 1e-6 && xa <= z.x1 + 1e-6 && za >= z.z0 - 1e-6 && za <= z.z1 + 1e-6) {
        var pz = z.p;
        if (z.p0 != null && z.p1 != null && z.x1 > z.x0) pz = z.p0 + (z.p1 - z.p0) * (xa - z.x0) / (z.x1 - z.x0);
        if (p === null || pz < p) p = pz;
      }
    });
    if (p === null) p = 0;
    var f = foraDaPlanta(PAREDE, X, Y), barl = caso.barlavento || [caso.direcao];
    return VE.pressaoBeiral(p, caso.q, barl.some(function (d) { return f[d]; }));          // beiral a barlavento: + 0,8·q por baixo
  }
  function pressaoParede(caso, face, s) {
    var L = caso.pressao.paredes[face] || [], i;
    for (i = 0; i < L.length; i++) if (s >= L[i].s0 - 1e-6 && s <= L[i].s1 + 1e-6) return L[i].p;
    return 0;
  }

  /* ---------- modelo T1 ---------- */
  function montar(q, g, sec) {
    var p = q.params, c = p.cobertura, PX = g.PX, PY = g.PY, TETO = g.TETO, PAREDE = g.PAREDE, hT = sec.T.h, yT = g.yT, mat = MM.classe2022(q.classe), mod = modulos(mat);
    var X0 = p.origem.x, Y0 = p.origem.y, E_KN = mod.E, G_KN = mod.G, PESO = q.pesoMLC;
    var nos = [], barras = [], apoios = [], idn = {};
    function no(id, X, Y, Z) { if (!idn[id]) { idn[id] = { id: id, x: X - X0, y: Z, z: Y - Y0 }; nos.push(idn[id]); } return id; }
    var L = g.L, sT = g.sT, nT = g.nT, XT = g.XT, tAxis = g.tAxis, vBot = g.vBot, hVy = g.hVy, vAxis = g.vAxis;
    var sT_ = ret(sec.T.b, hT), FITA_A = p.fita.b * p.fita.e * p.fita.aproveitamento, kk, i;
    /* terças */
    yT.forEach(function (y, k) {
      XT.forEach(function (t) { no("T" + k + "_" + t[0], t[1], y, tAxis(y)); });
      for (i = 0; i < XT.length - 1; i++) {
        var xa = XT[i][1], xb = XT[i + 1][1], bal = xb <= PX[0] + 1e-6 || xa >= PX[1] - 1e-6;
        barras.push({ id: "T" + k + "s" + i, i: "T" + k + "_" + XT[i][0], j: "T" + k + "_" + XT[i + 1][0], secao: sT_, E: E_KN, G: G_KN, vy: [0, 1, 0], nElem: 2,
          pesoEsp: PESO, grupo: "T", linha: k, b: sec.T.b, h: hT, bal: bal, vao: bal ? (xb <= PX[0] + 1e-6 ? PX[0] - TETO.x0 : TETO.x1 - PX[1]) : L, xa: xa, xb: xb });
      }
    });
    /* fita em X e bloqueadores */
    var pares = [["v0", "t1"], ["t1", "t2"], ["t2", "v1"]];
    for (kk = 0; kk < yT.length - 1; kk++) {
      (function (k) {
        pares.forEach(function (pr, cc) {
          [["T" + k + "_" + pr[0], "T" + (k + 1) + "_" + pr[1]], ["T" + (k + 1) + "_" + pr[0], "T" + k + "_" + pr[1]]].forEach(function (ij, n) {
            barras.push({ id: "X" + k + "_" + cc + "_" + n, i: ij[0], j: ij[1], secao: { A: FITA_A, Iz: 1e-12, Iy: 1e-12, J: 1e-12 }, E: 2e8, G: 8e7, vy: [0, 1, 0],
              nElem: 1, tracao: true, pesoEsp: 0, libera: { i: { ry: true, rz: true }, j: { ry: true, rz: true } }, grupo: "X" });
          });
        });
        ["t1", "t2"].forEach(function (n) {
          barras.push({ id: "BL" + k + "_" + n, i: "T" + k + "_" + n, j: "T" + (k + 1) + "_" + n, secao: ret(p.bloqueador.b, hT - 0.08), E: E_KN, G: G_KN,
            vy: [0, 1, 0], nElem: 1, pesoEsp: PESO, libera: { i: { ry: true, rz: true }, j: { ry: true, rz: true } }, grupo: "BL", b: p.bloqueador.b, h: hT - 0.08, L: sT });
        });
      })(kk);
    }
    /* vigas V, elos, escoras, pilares */
    var vaoK = g.vaoK, escM = p.escora.modelo;
    PX.forEach(function (x, iv) {
      var ys = yT.concat(PY).sort(function (a, b) { return a - b; }).filter(function (y, k, a) { return k === 0 || y - a[k - 1] > 1e-6; });
      ys.forEach(function (y, k) { no("V" + iv + "_" + k, x, y, vAxis(y)); });
      for (var k0 = 0; k0 < ys.length - 1; k0++) {
        barras.push({ id: "V" + iv + "s" + k0, i: "V" + iv + "_" + k0, j: "V" + iv + "_" + (k0 + 1), secao: ret(sec.V.b, (hVy(ys[k0]) + hVy(ys[k0 + 1])) / 2), E: E_KN, G: G_KN,
          vy: [0, 1, 0], nElem: 2, pesoEsp: PESO, grupo: "V", linha: iv, b: sec.V.b, h: (hVy(ys[k0]) + hVy(ys[k0 + 1])) / 2, hA: hVy(ys[k0]), hB: hVy(ys[k0 + 1]), ys: [ys[k0], ys[k0 + 1]] });
      }
      var vn = "v" + iv;
      yT.forEach(function (y, k) {
        var kv = idx(ys, function (v) { return Math.abs(v - y) < 1e-6; });
        barras.push({ id: "L" + iv + "_" + k, i: "V" + iv + "_" + kv, j: "T" + k + "_" + vn, secao: { A: 0.05, Iz: 1e-3, Iy: 1e-3, J: 1e-3 },
          E: 2e8, G: 8e7, vy: [1, 0, 0], nElem: 1, pesoEsp: 0, libera: { j: { rz: true } }, grupo: "elo" });
      });
      vaoK.forEach(function (k) {
        var kv = idx(ys, function (v) { return Math.abs(v - yT[k]) < 1e-6; }), vb = "VB" + iv + "_" + k;
        no(vb, x, yT[k], vBot(yT[k]) + 0.03);
        barras.push({ id: "LB" + iv + "_" + k, i: "V" + iv + "_" + kv, j: vb, secao: { A: 0.05, Iz: 1e-3, Iy: 1e-3, J: 1e-3 }, E: 2e8, G: 8e7, vy: [1, 0, 0], nElem: 1, pesoEsp: 0, grupo: "elo2" });
        ["a", "b"].forEach(function (s) {
          if (!idn["T" + k + "_e" + iv + s]) return;                 // A2: sem beiral suficiente não há nó externo da escora
          barras.push({ id: "ES" + iv + "_" + k + s, i: "T" + k + "_e" + iv + s, j: vb, secao: ret(escM.b, escM.h), E: E_KN, G: G_KN, vy: [0, 1, 0], nElem: 1,
            pesoEsp: PESO, libera: { i: { ry: true, rz: true }, j: { ry: true, rz: true } }, grupo: "ES", b: escM.b, h: escM.h,
            L: Math.sqrt(Math.pow(idn["T" + k + "_e" + iv + s].x - idn[vb].x, 2) + Math.pow(idn["T" + k + "_e" + iv + s].y - idn[vb].y, 2) + Math.pow(idn["T" + k + "_e" + iv + s].z - idn[vb].z, 2)) });
        });
      });
      PY.forEach(function (y, ip) {
        var kv = idx(ys, function (v) { return Math.abs(v - y) < 1e-6; }), base = "B" + iv + ip, pt = "PT" + iv + ip;
        no(base, x, y, p.baseZ); no(pt, x, y, g.topoPilar);
        var P = sec.P, s = P.forma === "circular" ? circ(P.d) : P.forma === "duplo" ? (function () { var a = ret(P.h, P.b); return { A: 2 * a.A, Iz: 2 * a.Iz, Iy: 2 * a.Iy, J: 2 * a.J }; })() : ret(P.b, P.h);
        barras.push({ id: "P" + iv + ip, i: base, j: pt, secao: s, E: E_KN, G: G_KN, vy: [1, 0, 0], nElem: 5, pesoEsp: PESO, grupo: "P" });
        /* topo rotulado de verdade nas 3 rotações: a torção da V vem das escoras */
        barras.push({ id: "PQ" + iv + ip, i: pt, j: "V" + iv + "_" + kv, secao: s, E: E_KN, G: G_KN, vy: [1, 0, 0], nElem: 1, pesoEsp: PESO,
          libera: { j: { rx: true, ry: true, rz: true } }, grupo: "Ptopo" });
        var kr = q._krEf != null ? q._krEf : 1e9;                          // N6: sem krBase (informada ou calculada pela ligação) a base é RÍGIDA — só para diagnóstico, com aviso em rodar
        apoios.push({ no: base, ux: true, uy: true, uz: true, ry: true, rx: kr, rz: kr });
      });
    });
    /* garfo da V no pilar (barra de J alto; sem efeito numérico relevante — mantida como na R02) */
    PX.forEach(function (x, iv) {
      PY.forEach(function (y, ipp) {
        var ys = yT.concat(PY).sort(function (a, b) { return a - b; }).filter(function (v, k, a) { return k === 0 || v - a[k - 1] > 1e-6; });
        var kv = idx(ys, function (v) { return Math.abs(v - y) < 1e-6; });
        barras.push({ id: "GF" + iv + "_" + kv, i: "PT" + iv + PY.indexOf(y), j: "V" + iv + "_" + kv, secao: { A: 1e-6, Iz: 1e-9, Iy: 1e-9, J: 5e-4 }, E: 2e8, G: 8e7,
          vy: [1, 0, 0], nElem: 1, pesoEsp: 0, libera: { i: { ry: true, rz: true }, j: { ry: true, rz: true } }, grupo: "garfo" });
      });
    });
    /* vergas do topo do vidro em 2 trechos, pendurada por pendural numa travessa entre as terças vizinhas */
    var xm = (PX[0] + PX[1]) / 2, VG = sec.VG;
    PY.forEach(function (y, ip) {
      var zv = g.topoPilar + VG.b / 2;
      no("VGM" + ip, xm, y, zv);
      [["a", "PT0" + ip, "VGM" + ip, { i: { ry: true, rz: true } }], ["b", "VGM" + ip, "PT1" + ip, { j: { rx: true, ry: true, rz: true } }]].forEach(function (t) {
        barras.push({ id: "VG" + ip + t[0], i: t[1], j: t[2], secao: ret(VG.b, VG.h), E: E_KN, G: G_KN, vy: [0, 0, 1], nElem: 3, pesoEsp: PESO, libera: t[3], grupo: "VG", b: VG.b, h: VG.h, ip: ip });
      });
      var tv = g.travessa[ip];                                          // N1: sem beiral em Y a linha do pilar cai na terça de borda → sem travessa e sem pendural
      if (!tv.ok) return;
      var k1 = tv.k1, k2 = tv.k2;
      no("TR" + ip, xm, y, tAxis(y));
      [["a", "T" + k1 + "_m", "TR" + ip, { i: { ry: true, rz: true } }], ["b", "TR" + ip, "T" + k2 + "_m", { j: { ry: true, rz: true } }]].forEach(function (t) {
        barras.push({ id: "TR" + ip + t[0], i: t[1], j: t[2], secao: ret(p.travessa.b, p.travessa.h), E: E_KN, G: G_KN, vy: [0, 1, 0], nElem: 2, pesoEsp: PESO, libera: t[3], grupo: "TR", b: p.travessa.b, h: p.travessa.h, L: yT[k2] - yT[k1] });
      });
      if (q.penduralPresente) {
        barras.push({ id: "PD" + ip, i: "TR" + ip, j: "VGM" + ip, secao: ret(p.pendural.b, p.pendural.h), E: E_KN, G: G_KN, vy: [1, 0, 0], nElem: 1, pesoEsp: PESO,
          libera: { i: { ry: true, rz: true }, j: { ry: true, rz: true } }, grupo: "PD", b: p.pendural.b, h: p.pendural.h });
      }
    });
    return { nos: nos, barras: barras, apoios: apoios, g: g, vaoK: vaoK, nT: nT, sT: sT, yT: yT };
  }

  /**
   * M13: resultante horizontal que a estrutura recebe do vento (V para o vento em X, vergas para o vento em Y), momento T = Fa·e (e = fração × dimensão da planta NORMAL ao vento:
   * 7,5 % sem vizinhança, 15 % com — NBR 6123:1988 6.6, fonte secundária) e as forças nos topos dos 4 pilares que o equilibram (binário; diafragma rígido suposto). null se Fa ≈ 0.
   */
  function torcao(M, g, p, cargas, cv, frac) {
    var PX = g.PX, PY = g.PY, LX = PX[1] - PX[0], LY = PY[1] - PY[0], Fx = 0, Fz = 0, porId = {}, soma = LX * LX + LY * LY, d = cv.direcao;
    M.barras.forEach(function (b) { porId[b.id] = b; });
    cargas.forEach(function (c) {
      var b = c.tipo === "barra" ? porId[c.barra] : null; if (!b) return;
      if (b.grupo === "V" && c.q && c.q[0]) Fx += c.q[0] * (b.ys[1] - b.ys[0]);
      if (b.grupo === "VG" && c.q && c.q[2]) Fz += c.q[2] * ((c.b == null ? 1 : c.b) - (c.a == null ? 0 : c.a)) * (LX / 2);
    });
    var ao0 = (d === 0 || d === 180), Fa = Math.abs(ao0 ? Fx : Fz), e = frac * (ao0 ? (g.PAREDE.y1 - g.PAREDE.y0) : (g.PAREDE.x1 - g.PAREDE.x0));
    if (!(Fa > 1e-6)) return null;
    var T = Fa * e, forcas = [];
    PX.forEach(function (x, iv) { PY.forEach(function (y, ip) { var dx = (iv ? 1 : -1) * LX / 2, dz = (ip ? 1 : -1) * LY / 2; forcas.push({ no: "PT" + iv + ip, F: [-T * dz / soma, 0, T * dx / soma, 0, 0, 0] }); }); });
    return { Fa: Fa, e: e, T: T, forcas: forcas };
  }

  /* ---------- casos de carga ---------- */
  function casos(q, M, VT, QCOB, G2) {
    var g = M.g, p = q.params, PAREDE = g.PAREDE, PX = g.PX, TETO = g.TETO, C = [], larg = function (k) { return (k === 0 || k === M.nT) ? M.sT / 2 : M.sT; };
    var T = M.barras.filter(function (b) { return b.grupo === "T"; }), g2 = [], qq = [], H_PT = p.hParedeTopo;
    T.forEach(function (b) { var w = larg(b.linha); g2.push({ tipo: "barra", barra: b.id, q: [0, -G2 * w, 0], projetada: true }); qq.push({ tipo: "barra", barra: b.id, q: [0, -QCOB.q * w, 0], projetada: true }); });
    C.push({ id: "G1", tipo: "G", categoria: "G-insitu", nome: "peso próprio MLC", cargas: [{ tipo: "pesoProprio" }] });
    C.push({ id: "G2", tipo: "G", categoria: "G-insitu", nome: "telha + lambri + fixações", cargas: g2 });
    C.push({ id: "Q", tipo: "Q", categoria: "Q-cobertura", nome: "sobrecarga de cobertura", cargas: qq });
    var teto = function (cv) {
      var cg = [];
      T.forEach(function (b) {
        var w = larg(b.linha), y = M.yT[b.linha], NS = 3, s, dy, a, c, xm, pp;
        for (s = 0; s < NS; s++) {
          a = s / NS; c = (s + 1) / NS; xm = b.xa + (b.xb - b.xa) * (a + c) / 2; pp = 0;
          [-w / 2 + 0.01, 0, w / 2 - 0.01].forEach(function (d) { pp += pressaoTeto(PAREDE, cv, xm, y + d); });
          cg.push({ tipo: "barra", barra: b.id, q: [0, -pp / 3 * w, 0], a: a, b: c });
        }
      });
      return cg;
    };
    var paredes = function (cv) {   // frente/fundos → vergas; laterais → V
      var cg = [];
      [["esquerda", 0, +1], ["direita", 1, -1]].forEach(function (t) {
        for (var s = 0; s < 6; s++) {
          var pr = pressaoParede(cv, t[0], (s + 0.5) / 6 * (PAREDE.x1 - PAREDE.x0)), half = s < 3 ? "a" : "b", s3 = s % 3;
          cg.push({ tipo: "barra", barra: "VG" + t[1] + half, q: [0, 0, t[2] * pr * H_PT], a: s3 / 3, b: (s3 + 1) / 3 });
        }
      });
      [["frente", 0, +1], ["fundo", 1, -1]].forEach(function (t) {
        M.barras.filter(function (b) { return b.grupo === "V" && b.linha === t[1] && b.ys[0] >= PAREDE.y0 - 0.3 && b.ys[1] <= PAREDE.y1 + 0.3; }).forEach(function (b) {
          var pr = pressaoParede(cv, t[0], (b.ys[0] + b.ys[1]) / 2 - PAREDE.y0);
          cg.push({ tipo: "barra", barra: b.id, q: [t[2] * pr * H_PT, 0, 0] });
        });
      });
      return cg;
    };
    var tors = [], DG = q.diagnostico || {};
    VT.casos.forEach(function (cv, n) {
      var cargas = teto(cv).concat(paredes(cv)), eh0 = (/cpi0/.test(cv.id) || (!!cv.obliquo && !DG.semObliquoExc));          // M4: o oblíquo (cpi 0) também entra no excepcional
      C.push({ id: "W" + n, tipo: "W", direcao: cv.direcao, nome: cv.nome || cv.id, cargas: cargas, q: cv.q, cpi0: eh0 });
      /* M13 — TORÇÃO por excentricidade do vento (NBR 6123 6.6): só nos 4 ortogonais com cpi 0 (o cpi não muda a resultante horizontal); binário nos topos dos 4 pilares, ± */
      if (/cpi0/.test(cv.id) && !cv.obliquo && !DG.semTorcao) {
        var tc = torcao(M, g, p, cargas, cv, q.vizinhanca ? 0.15 : 0.075);
        if (tc) [1, -1].forEach(function (sg) {
          C.push({ id: "W" + n + (sg > 0 ? "e+" : "e-"), tipo: "W", direcao: cv.direcao, nome: (cv.nome || cv.id) + " + excentricidade " + (sg > 0 ? "+" : "−") + "e", cargas: cargas.concat(tc.forcas.map(function (f) { return { tipo: "no", no: f.no, F: [sg * f.F[0], 0, sg * f.F[2], 0, 0, 0] }; })), q: cv.q, cpi0: false, torcao: true });
          if (sg > 0) tors.push({ caso: "W" + n, direcao: cv.direcao, Fa: tc.Fa, e: tc.e, T: tc.T });
        });
      }
    });
    C.tors = tors;
    /* abertura dominante: Δcpi como caso EXCEPCIONAL. DCPI: abertura a barlavento, cpi +0,8 (telhado para cima, paredes para fora); DCPIS (M4): abertura em face de SUCÇÃO,
       cpi = Ce mais negativo das paredes (sobrepressão PARA DENTRO nas fachadas de barlavento e para baixo no telhado). Só o telhado sobre as paredes e a faixa de fachada carregada pelo topo. */
    var dominante = function (dcp, sg) {
      var qd = sg * dcp.p, cd = [];
      T.forEach(function (b) { if (b.bal) return; var w = larg(b.linha), y = M.yT[b.linha]; if (y < PAREDE.y0 || y > PAREDE.y1) return; cd.push({ tipo: "barra", barra: b.id, q: [0, qd * w, 0] }); });
      [0, 1].forEach(function (ip) { ["a", "b"].forEach(function (h) { cd.push({ tipo: "barra", barra: "VG" + ip + h, q: [0, 0, (ip === 0 ? -1 : 1) * qd * H_PT] }); }); });
      M.barras.filter(function (b) { return b.grupo === "V" && b.ys[0] >= PAREDE.y0 - 0.3 && b.ys[1] <= PAREDE.y1 + 0.3; }).forEach(function (b) { cd.push({ tipo: "barra", barra: b.id, q: [(b.linha === 0 ? -1 : 1) * qd * H_PT, 0, 0] }); });
      return cd;
    };
    var dcp = VE.casoAberturaDominante(VT.q);
    C.push({ id: "DCPI", tipo: "E", nome: dcp.nome, cargas: dominante(dcp, 1) });
    var dcs = DG.semDominanteSuccao ? null : VE.casoAberturaDominanteSuccao(VT, VT.q);
    if (dcs) C.push({ id: "DCPIS", tipo: "E", nome: dcs.nome, cargas: dominante(dcs, -1), dcpi: dcs.cpi });
    return C;
  }

  function durClasse(comb) {
    var f = comb.fatores, temW = Object.keys(f).some(function (k) { return (k[0] === "W" || k === "DCPI") && f[k] > 0; }), temQ = (f.Q || 0) > 0;
    return temW ? "curta" : temQ ? "longa" : "permanente";
  }

  /** N1: o acoanalise só AVISA de barra com nó inexistente / comprimento nulo / sem área e segue com a barra ignorada (peça "ok" que não existe no modelo) — no T1 isso é ERRO */
  function modeloSemFalha(avisos) {
    var ruins = (avisos || []).filter(function (a) { return /nó inexistente|comprimento nulo|seção sem área/.test(a); });
    if (ruins.length) throw new Error("modelo de cálculo inconsistente (barra/apoio ignorado pela análise): " + ruins.slice(0, 4).join("; "));
  }

  /* ---------- rodar: análise + verificação por grupo + ELS ---------- */
  function rodar(proj, sec) {
    var q = padraoCache(proj);
    q._krEf = proj._krBase != null ? proj._krBase : q.krBase;                  // N6: proj._krBase = rigidez calculada pela ligação (projetoComBase); proj.krBase = valor imposto pelo usuário
    var p = q.params, g = MT.T1.geometria(p, sec), M = montar(q, g, sec), perfil = perfilFn(q), CL = q.classe, mod0 = modulos(MM.classe2022(q.classe));
    var QCOB = CA.sobrecargaCobertura(Math.abs(p.cobertura.incl) * 100, { empocamentoVerificado: !!q.empocamentoVerificado }), G2 = q.cargas.telha + p.cobertura.lambri * q.cargas.lambriPeso + q.cargas.outros;
    if (!QCOB.ok) throw new Error("sobrecarga de cobertura: " + QCOB.motivo + " Com menos de 1 % o projeto precisa da verificação de empoçamento (Anexo D) e de carga própria — o motor recusa.");
    var avisos = (QCOB.avisos || []).slice();                    // C1: empoçamento (< 5 %) vira aviso; inclinação negativa usa |i|
    if (p.cobertura.incl < 0) avisos.push("Cobertura invertida (lado alto em y maior): sobrecarga calculada com |i| = " + (Math.abs(p.cobertura.incl) * 100).toFixed(1).replace(".", ",") + " %.");
    if (MM.classe2022(q.classe).conferir) avisos.push("M6: os valores da classe " + q.classe + " (EN 14080 Tab. 5) ainda NÃO foram conferidos no PDF — só o GL24h foi.");
    var VT = vento(q, g, avisos);                              // M1: geometria do vento = a do T1
    if (g.travessa.some(function (t) { return !t.ok; })) avisos.push("N1: sem beiral suficiente em Y (frente/fundos) não há travessa nem pendural para " + g.travessa.map(function (t, i) { return t.ok ? null : (i === 0 ? "a verga da frente" : "a verga dos fundos"); }).filter(Boolean).join(" e ") + ": a verga é verificada SEM o travamento do pendural (L0 do eixo fraco = vão inteiro) e a fonte não lista TR/PD dessa fachada.");
    if (g.DZ > 1e-9) avisos.push("N5: a cota da telha SOBE " + (g.DZ * 100).toFixed(1).replace(".", ",") + " cm em relação à referência (zTelhaRef) para a V caber entre o vidro e a terça (altura mínima " + (p.cobertura.hMinV * 100).toFixed(0) + " cm) — muda a arquitetura (platibanda, rufos, altura total); confirmar com o projeto de arquitetura.");
    var CS = casos(q, M, VT, QCOB, G2), PX = g.PX, PY = g.PY, TETO = g.TETO, X0 = p.origem.x, Y0 = p.origem.y;
    if (CS.tors && CS.tors.length) avisos.push("M13: torção por excentricidade do vento (NBR 6123 6.6, e = " + (q.vizinhanca ? "15" : "7,5") + " % da dimensão normal ao vento) montada como binário nos topos dos 4 pilares, ± (" + CS.tors.length + " direções; T máx. = " + Math.max.apply(null, CS.tors.map(function (t) { return t.T; })).toFixed(2).replace(".", ",") + " kN·m); diafragma rígido suposto; só a força que a estrutura recebe (faixa de fachada do topo) gera o momento.");
    if (CS.some(function (c) { return c.id === "DCPIS"; })) avisos.push("M4: abertura dominante em face de SUCÇÃO montada como excepcional (cpi = Ce mais negativo das paredes, " + String(VE.casoAberturaDominanteSuccao(VT, VT.q).cpi).replace(".", ",") + "), além da dominante a barlavento (+0,8); o vento oblíquo também entra no excepcional.");
    var normais = CS.filter(function (c) { return c.tipo !== "E"; });
    var combs = CA.combinacoes(normais.map(function (c) { return { id: c.id, tipo: c.tipo, categoria: c.categoria, direcao: c.direcao, nome: c.nome }; }), { nocional: true, segundaOrdem: true, nocionalDirecoes: [[1, 0, 0], [0, 0, 1]] });
    var elu = combs.filter(function (c) { return c.tipo === "ELU"; });
    /* combinações EXCEPCIONAIS: G (1,0) + vento ortogonal cpi 0 (1,0) + abertura dominante (1,0) */
    CS.filter(function (c) { return c.tipo === "W" && c.cpi0; }).forEach(function (c) {
      CS.filter(function (d) { return d.tipo === "E"; }).forEach(function (dc) {
        var f = { G1: 1, G2: 1 }; f[c.id] = 1; f[dc.id] = 1;
        elu.push({ id: "EXC_" + c.id + "_" + dc.id, nome: "excepcional: " + c.nome + " + " + dc.nome, tipo: "ELU", fatores: f, segundaOrdem: true });
      });
    });
    var modelo = { nos: M.nos, barras: M.barras, apoios: M.apoios, casos: CS.map(function (c) { return { id: c.id, cargas: c.cargas }; }) };
    var r = AN.analisar(modelo, { combinacoes: elu, estacoes: 5, comPCG: true });
    if (!r.ok) throw new Error("análise: " + (r.motivo || JSON.stringify(r.avisos)));
    modeloSemFalha(r.avisos);
    /* C2: além das envoltórias brutas (res.lig, res.reacoes, res.fitaNmax), guarda o ESFORÇO EQUIVALENTE = F·kmodRef/kmod da combinação que o gerou
       (res.ligEq…): a ligação é verificada com o kmod de referência (curta × umidade) e o esforço de uma combinação PERMANENTE entra majorado. */
    var novoLig = function () { return { tercaV: { Tmax: 0, Cmax: 0, Hmax: 0 }, pilarTopo: { Tmax: 0, Cmax: 0, Hmax: 0 }, escora: { Nmax: 0 }, bloqueador: { Nmax: 0 }, verga: { Vmax: 0, Vy: 0, Vz: 0, Nmax: 0 }, pendural: 0 }; };
    var KREF = perfil("curta").kmod, FK = 1;
    var res = { grupos: {}, esbeltez: {}, reacoes: {}, reacoesEq: {}, combinacoes: elu.length, lig: novoLig(), ligEq: novoLig(), fitaNmax: 0, fitaEq: 0, kmodRef: KREF, kmod1Ref: perfil("curta").kmod1, kmod2Ref: perfil("curta").kmod2, avisos: avisos };
    function mx(o, oe, k, v) { if (v > (o[k] || 0)) o[k] = v; if (v * FK > (oe[k] || 0)) oe[k] = v * FK; }
    /* E4: esbeltez (λ acima do limite) por grupo, lida do campo do resultado da verificação — o laço NÃO depende do η sentinela (1,0001) do maddim7190. eixo "b" = eixo fraco (plano de b). */
    function regEsb(gp, v) {
      if (!v || !v.esbelto) return; var lam = v.lambda, lx = Array.isArray(lam) ? lam[0] : lam, ly = Array.isArray(lam) ? lam[1] : lam, mx = Math.max(lx || 0, ly || 0), a = res.esbeltez[gp];
      if (!a || mx > a.lambdaMax) res.esbeltez[gp] = { esbelto: true, eixo: (ly || 0) >= (lx || 0) ? "b" : "h", lambdaMax: mx };
    }
    function reg(gp, eta, onde, comb, gov) { if (!res.grupos[gp] || eta > res.grupos[gp].eta) res.grupos[gp] = { eta: eta, onde: onde, comb: comb, governa: gov }; }
    var Lp = g.topoPilar - p.baseZ, sT = M.sT, nEsc = p.cobertura.nEsc, LX = PX[1] - PX[0], LY = PY[1] - PY[0], tgCorte = p.cobertura.incl;
    /* M7: comprimento de flambagem do pilar pela mola REAL da base (balanço, topo livre; a rotação do topo não é creditada). p.kFlambagem numérico = imposto pelo usuário. */
    var Psec = sec.P, EIh, EIb, kFlY, kFlZ, kFl, flamb = null, nPc = Psec.forma === "duplo" ? 2 : 1;
    if (Psec.forma === "circular") { EIh = EIb = mod0.E * circ(Psec.d).Iz; }
    else { EIh = mod0.E * nPc * Psec.b * Math.pow(Psec.h, 3) / 12; EIb = mod0.E * nPc * Psec.h * Math.pow(Psec.b, 3) / 12; }          // L0y: flambagem no plano de h (EI forte); L0z: no plano de b (EI fraco)
    if (q.diagnostico && q.diagnostico.kFlambagem24) { kFlY = kFlZ = 2.4; }
    else if (p.kFlambagem != null) { kFlY = kFlZ = p.kFlambagem; avisos.push("M7: kFlambagem = " + String(p.kFlambagem).replace(".", ",") + " IMPOSTO pelo usuário (não calculado pela mola da base)."); }
    else {
      var Cb = q._krEf != null ? q._krEf : 1e9, fy_ = MD.betaFlambagemMola({ C: Cb, EI: EIh, L: Lp }), fz_ = MD.betaFlambagemMola({ C: Cb, EI: EIb, L: Lp });
      kFlY = fy_.beta; kFlZ = fz_.beta; flamb = { y: fy_, z: fz_ };
      if (Math.max(kFlY, kFlZ) > 3) avisos.push("M7: mola de base mole (C·L/EI = " + Math.min(fy_.CL_EI, fz_.CL_EI).toFixed(2).replace(".", ",") + " no eixo fraco): β = " + Math.max(kFlY, kFlZ).toFixed(2).replace(".", ",") + " — L0 do pilar = " + (Math.max(kFlY, kFlZ) * Lp).toFixed(2).replace(".", ",") + " m; reforçar a base ou aumentar o pilar.");
      if (q._krEf == null) avisos.push("N6: rigidez da base NÃO informada nem calculada — análise com base RÍGIDA (engaste perfeito, β = 2,0), só para diagnóstico: use projetoComBase/projetarT1, que calcula Kθ pela ligação dimensionada (Kser·Σr², NBR 7190-1:2022, 7.1.12), ou informe `krBase`.");
      else if (proj._krBase != null && q.krBase == null) avisos.push("N6: rigidez da base = " + Math.round(proj._krBase) + " kN·m/rad CALCULADA pela ligação dimensionada (Kθ = Ku·Σr², Ku = ⅔·Kser, NBR 7190-1:2022, 7.1.12) EM SÉRIE com a deformação axial dos chumbadores (M2); a flexão da placa e a fundação entram como rígidas (a menos que a fundação seja informada em `KthetaFundacao`). β calculado por eixo (EI de cada plano); a rótula do topo não é creditada.");
      else avisos.push("M7: krBase = " + q.krBase + " kN·m/rad foi INFORMADO; conferir se a ligação de base dimensionada (pinos, Kser) realmente entrega essa rigidez — a rótula do topo não é creditada na flambagem (a favor da segurança). β calculado por eixo (EI de cada plano).");
    }
    kFl = kFlZ;                                                   // escalar p/ fonte/auditor: o do eixo FRACO (pareia com o i mínimo)
    elu.forEach(function (cb) {
      var rc = r.combinacoes[cb.id]; if (!rc) return;
      var car = durClasse(cb), pf = perfil(car); FK = KREF / pf.kmod;
      M.barras.forEach(function (b) {
        var es = rc.barras[b.id] && rc.barras[b.id].estacoes; if (!es) return;
        if (b.grupo === "elo") { es.forEach(function (e) { var L = res.lig.tercaV, Le = res.ligEq.tercaV; mx(L, Le, "Tmax", e.N); mx(L, Le, "Cmax", -e.N); mx(L, Le, "Hmax", hyp(e.Vy, e.Vz)); }); return; }
        if (b.grupo === "Ptopo") { var e0 = es[es.length - 1], L0 = res.lig.pilarTopo, L0e = res.ligEq.pilarTopo; mx(L0, L0e, "Tmax", e0.N); mx(L0, L0e, "Cmax", -e0.N); mx(L0, L0e, "Hmax", hyp(e0.Vy, e0.Vz)); return; }
        if (b.grupo === "X") { es.forEach(function (e) { res.fitaNmax = Math.max(res.fitaNmax || 0, e.N); res.fitaEq = Math.max(res.fitaEq, e.N * FK); }); return; }
        if (b.grupo === "elo2" || b.grupo === "garfo") return;
        es.forEach(function (e) {
          var v = null, base = { b: b.b, h: b.h, classe: CL, perfil: pf };
          if (b.grupo === "T") {
            var trav = { cima: 0.5, baixo: b.bal ? b.vao : LX / 3 };
            v = MD.barra2022(MD.deAnalise(e, { b: b.b, h: b.h, L0y: b.bal ? 2 * b.vao : b.vao, L0z: LX / 3, L1: MD.L1PorBorda(e.Mz, trav), classe: CL, perfil: pf }));
          } else if (b.grupo === "V") {
            var Lb = hyp(b.ys[1] - b.ys[0], 0.05);
            v = MD.vigaAlturaVariavel2022({ est: e, b: b.b, hA: b.hA, hB: b.hB, Lb: Lb, x: e.x, L0y: LY, L0z: sT, trav: { cima: sT, baixo: nEsc * sT }, tgAlfa: tgCorte, bordaCortada: "cima", classe: CL, perfil: pf });
          } else if (b.grupo === "P") {
            var P = sec.P;
            if (P.forma === "circular") v = MD.circular2022({ N: e.N, My: e.My, Mz: e.Mz, Vy: e.Vy, Vz: e.Vz, d: P.d, L0: Math.max(kFlY, kFlZ) * Lp, classe: CL, perfil: pf });
            else if (P.forma === "duplo") v = MD.pilarDuplo2022({ est: { N: e.N, My: e.My, Mz: e.Mz, Vy: e.Vy, Vz: e.Vz, T: 0 }, b: P.b, h: P.h, L0y: kFlY * Lp, L0z: kFlZ * Lp, L1: 0.01, trocarEixos: false, classe: CL, perfil: pf });
            else v = MD.barra2022(MD.deAnalise(e, { b: P.b, h: P.h, L0y: kFlY * Lp, L0z: kFlZ * Lp, L1: 0.01, classe: CL, perfil: pf }));
          } else if (b.grupo === "VG") {
            v = MD.barra2022(MD.deAnalise(e, { b: b.b, h: b.h, L0y: LX, L0z: (q.penduralPresente && g.travessa[b.ip].ok) ? LX / 2 : LX, L1: 0.5, classe: CL, perfil: pf }));
            /* verga → V: Vy é ∥ à fibra da V (eixo Y da planta) e Vz é ⊥ (vertical); N é axial da verga (⊥ à face da V) */
            mx(res.lig.verga, res.ligEq.verga, "Vmax", hyp(e.Vy, e.Vz)); mx(res.lig.verga, res.ligEq.verga, "Vy", Math.abs(e.Vy)); mx(res.lig.verga, res.ligEq.verga, "Vz", Math.abs(e.Vz)); mx(res.lig.verga, res.ligEq.verga, "Nmax", Math.abs(e.N));
          } else if (b.grupo === "TR") {
            v = MD.barra2022(MD.deAnalise(e, { b: b.b, h: b.h, L0y: b.L, L0z: b.L, L1: 0.5, classe: CL, perfil: pf }));
          } else if (b.grupo === "PD") {
            v = MD.barra2022(MD.deAnalise(e, { b: b.b, h: b.h, L0y: 0.5, L0z: 0.5, L1: 0.01, classe: CL, perfil: pf })); res.lig.pendural = Math.max(res.lig.pendural || 0, Math.abs(e.N)); res.ligEq.pendural = Math.max(res.ligEq.pendural, Math.abs(e.N) * FK);
          } else if (b.grupo === "ES" || b.grupo === "BL") {
            var Lbv = b.L;                                              // A1: comprimento REAL da barra no modelo (escora: nó da terça → nó da V)
            v = MD.barra2022(MD.deAnalise(e, { b: b.b, h: b.h, L0y: Lbv, L0z: Lbv, L1: 0.01, classe: CL, perfil: pf }));
            var k = b.grupo === "ES" ? "escora" : "bloqueador"; mx(res.lig[k], res.ligEq[k], "Nmax", Math.abs(e.N));
          }
          if (v) { reg(b.grupo, v.eta, b.id + "@" + e.x.toFixed(2), cb.id + " " + car, v.governa); regEsb(b.grupo, v); }
        });
      });
      M.apoios.forEach(function (a) {
        var R = rc.reacoes[a.no]; if (!R) return;
        var o = res.reacoes[a.no] || (res.reacoes[a.no] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, Mmax: 0 });
        o.Nmax = Math.max(o.Nmax, R[1]); o.Nmin = Math.min(o.Nmin, R[1]); o.Hmax = Math.max(o.Hmax, hyp(R[0], R[2])); o.Mmax = Math.max(o.Mmax, hyp(R[3], R[5]));
        var oe = res.reacoesEq[a.no] || (res.reacoesEq[a.no] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, Mmax: 0 });
        oe.Nmax = Math.max(oe.Nmax, R[1]); oe.Nmin = Math.min(oe.Nmin, R[1] * (R[1] < 0 ? FK : 1)); oe.Hmax = Math.max(oe.Hmax, hyp(R[0], R[2]) * FK); oe.Mmax = Math.max(oe.Mmax, hyp(R[3], R[5]) * FK);
      });
    });
    /* ELS: flechas finais (φ da Tabela 20 da NBR 7190-1:2022 por classe de umidade, ψ2 da cobertura) e deslocamento de topo (ψ1 do vento) */
    var PHI = perfil("permanente").phi;
    /* A2 (revisão R05): a flecha em BALANÇO é verificada COM SINAL (+ = sobe). A sobrecarga entra em PADRÃO: cada trecho carregado só conta no sentido em que piora (o vão principal carregado faz a ponta SUBIR pela rotação sobre o apoio;
       a sobrecarga só no balanço faz a ponta DESCER). Para isso a sobrecarga é repartida em casos só-ELS (nunca entram nas combinações ELU): por região em Y (Qy0 balanço da frente, QyM vão da V, Qy1 balanço dos fundos — vale para a V)
       e por trecho em X (Qx0 / QxM / Qx1 — vale para a terça). */
    var larg = function (kk) { return (kk === 0 || kk === M.nT) ? M.sT / 2 : M.sT; }, qPart = {}, qIds = [];
    M.barras.forEach(function (b) {
      if (b.grupo !== "T") return;
      var yy = g.yT[b.linha], cq = { tipo: "barra", barra: b.id, q: [0, -QCOB.q * larg(b.linha), 0], projetada: true };
      [yy < PY[0] - 1e-6 ? "Qy0" : (yy > PY[1] + 1e-6 ? "Qy1" : "QyM"), b.bal ? (b.xb <= PX[0] + 1e-6 ? "Qx0" : "Qx1") : "QxM"].forEach(function (id) { (qPart[id] = qPart[id] || []).push(cq); });
    });
    qIds = Object.keys(qPart);
    var modeloEls = { nos: modelo.nos, barras: modelo.barras, apoios: modelo.apoios, casos: modelo.casos.concat(qIds.map(function (id) { return { id: id, cargas: qPart[id] }; })) };
    var els = [{ id: "g", fatores: { G1: 1, G2: 1 } }, { id: "q", fatores: { Q: 1 } }].concat(qIds.map(function (id) { var f = {}; f[id] = 1; return { id: id, fatores: f }; })).concat(CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { var f = {}; f[c.id] = 1; return { id: "w" + c.id, fatores: f }; }));
    var re = AN.analisar(modeloEls, { combinacoes: els, estacoes: 5, comPCG: true });
    modeloSemFalha(re.avisos);
    var D = function (cb, id) { return re.combinacoes[cb].desloc[id] || [0, 0, 0]; };
    var psi2 = CA.PSI["Q-cobertura"].psi2, psi1W = CA.PSI.W.psi1;
    var fin = function (a, b) { return Math.abs(D("g", a)[1] - D("g", b)[1]) * (1 + PHI) + Math.abs(D("q", a)[1] - D("q", b)[1]) * (1 + psi2 * PHI); };
    var dV = function (cb, a, b) { return D(cb, a)[1] - D(cb, b)[1]; };
    /** faixa do deslocamento FINAL com sinal do nó a em relação ao nó b (m; + = sobe): G·(1+φ) + contraflecha + a sobrecarga em padrão (só o que piora, em cada sentido) — { cima, baixo, g } */
    var faixa = function (a, b, ids, cam) {
      var g0 = dV("g", a, b) * (1 + PHI) + (cam || 0), cima = g0, baixo = g0;
      ids.forEach(function (id) { if (!re.combinacoes[id]) return; var v = dV(id, a, b) * (1 + psi2 * PHI); if (v > 0) cima += v; else baixo += v; });
      return { cima: cima, baixo: baixo, g: g0 };
    };
    var etaFaixa = function (f, L1, lim) { return Math.max(f.cima, -f.baixo, 0) / (L1 / lim); };
    /* M4 (revisão R05): além do η, guarda o deslocamento em mm (e o limite) de cada verificação — o memorial imprime os dois */
    var fm = {};
    var regF = function (kk, valor, lim, extra) { var e = valor / lim; if (!fm[kk] || e > fm[kk].eta) fm[kk] = Object.assign({ mm: Math.round(valor * 100000) / 100, limite_mm: Math.round(lim * 100000) / 100, eta: e }, extra || {}); };
    var fT = 0, fTb = 0, fV = 0, fVb = 0, topo = 0, fVG = 0, balV = [], vaoN = [], avisosCF = [], k, LIM_VAO = q.limVao, LIM_BAL = q.limBalanco, sinalTb = { cima: 0, baixo: 0 };
    for (k = 0; k <= M.nT; k++) {
      fT = Math.max(fT, fin("T" + k + "_m", "T" + k + "_v0") / (LX / LIM_VAO)); regF("tercaVao", fin("T" + k + "_m", "T" + k + "_v0"), LX / LIM_VAO);
      [[g.bal1, "T" + k + "_bal1", "T" + k + "_v1", TETO.x1 - PX[1]], [g.bal0, "T" + k + "_bal0", "T" + k + "_v0", PX[0] - TETO.x0]].forEach(function (t) {
        if (!t[0]) return;
        var f = faixa(t[1], t[2], ["Qx0", "QxM", "Qx1"]);
        fTb = Math.max(fTb, etaFaixa(f, t[3], LIM_BAL)); regF("tercaBalanco", Math.max(f.cima, -f.baixo, 0), t[3] / LIM_BAL, { sentido: f.cima >= -f.baixo ? "sobe" : "desce", cima_mm: Math.round(f.cima * 100000) / 100, baixo_mm: Math.round(f.baixo * 100000) / 100 }); sinalTb.cima = Math.max(sinalTb.cima, f.cima); sinalTb.baixo = Math.min(sinalTb.baixo, f.baixo);
      });
    }
    PX.forEach(function (x, iv) {
      var vn = M.nos.filter(function (o) { return o.id.indexOf("V" + iv + "_") === 0; }), ref = vn.filter(function (n) { return Math.abs(n.z + Y0 - PY[0]) < 1e-6; })[0].id, ref1 = vn.filter(function (n) { return Math.abs(n.z + Y0 - PY[1]) < 1e-6; })[0].id;
      vn.forEach(function (o) { var Y = o.z + Y0; if (Y > PY[0] && Y < PY[1]) { fV = Math.max(fV, fin(o.id, ref) / (LY / LIM_VAO)); regF("vigaV", fin(o.id, ref), LY / LIM_VAO); vaoN.push({ id: o.id, a: ref, b: ref1, t: (Y - PY[0]) / LY }); } });
      /* B7 (R05) + R1: a V em BALANÇO além de cada linha de pilares — flecha final COM SINAL da PONTA (relativa ao nó do apoio) ÷ (comprimento do balanço inteiro / limBalanco), a mesma regra da terça em balanço */
      [0, 1].forEach(function (ip) {
        var refB = vn.filter(function (n) { return Math.abs(n.z + Y0 - PY[ip]) < 1e-6; })[0]; if (!refB) return;
        /* R1 (decisão do coordenador, 24/10/2026): a flecha do balanço é verificada SÓ NA PONTA, com L = o balanço INTEIRO (o nó mais distante do apoio) — não por nó (um nó a 0,28 m do apoio com L = 0,28 m dava η 0,98 num artefato) */
        var tipo = null; vn.forEach(function (o) { var Y = o.z + Y0, Lb = ip === 0 ? PY[0] - Y : Y - PY[1]; if (Lb > 0.05 && (!tipo || Lb > tipo.Lb)) tipo = { iv: iv, ip: ip, id: o.id, ref: refB.id, Lb: Lb }; });
        if (tipo) balV.push(tipo);
      });
    });
    /* A2 + R21 (revisão R05, 24/10/2026) — flecha da V em BALANÇO COM SINAL (+ = sobe). Dois mecanismos distintos:
     *   · SOBE: o vão principal (7,8 m) cede sob G e gira a V sobre o pilar; o balanço curto sobe quase como corpo rígido (η ≈ L1·θ). A altura na ponta quase não muda isso; o que muda é a RIGIDEZ DO VÃO (altura/largura da V
     *     entre o vidro e a telha, apoio intermediário) ou a contraflecha NO VÃO (que compensa a DESCIDA do vão — item 8.2 —, e como consequência devolve rotação à V).
     *   · DESCE: sobrecarga só no balanço (padrão) ou balanço longo com vão curto: reduzir o beiral, altura na ponta, escora.
     * Tab. 21 limita o MÓDULO (L/150 em balanço, adotado) nos dois sentidos. A contraflecha de fábrica (NBR 7190-1:2022, item 8.2, p. 67 impr./PDF 79: ≤ 2/3 do deslocamento instantâneo das ações PERMANENTES) só compensa DESCIDA:
     *   (1) no VÃO da V, onde G desce: forma = −β·(deformada instantânea de G), β·wG,vão ≤ 2/3·wG,vão; seu efeito na ponta é consequência (sobe menos);
     *   (2) na PONTA, só onde G desce na ponta: −βt·gS nos nós que descem, ≤ 2/3 de wG,inst do nó. NUNCA aumenta uma subida (a contraflecha na ponta que sobe não é aplicada).
     * Ordem: largura da V → altura na ponta (só se a ponta DESCE) → contraflecha (a menor que fecha) → recusa, com a causa real no texto. */
    var modoNorma = q.contraflechaModo !== "acimaNorma" && q.contraflechaModo !== "fluencia";
    var espec = q.vContraflechaBalanco || 0, hPAt = g.hPonta, hPMax = g.hPontaMax;
    var QY = ["Qy0", "QyM", "Qy1"], gS = function (o) { return dV("g", o.id, o.ref); };
    var camNo = function (c, o) { var s = gS(o), bEf = s < 0 ? Math.max(c.beta, c.tip[o.ip]) : c.beta; return espec - s * bEf; };
    /** avalia a V em balanço com a contraflecha c = { beta, tip: [bt0, bt1] } (frações da deformada instantânea de G): η por ponta, nó e deslocamentos com sinal do que governa */
    var avaliaBal = function (c) {
      var etaIp = [0, 0], gov = null, eta = 0, tips = [null, null];
      balV.forEach(function (o) {
        var f = faixa(o.id, o.ref, QY, camNo(c, o)), e = etaFaixa(f, o.Lb, LIM_BAL);
        if (e > etaIp[o.ip]) etaIp[o.ip] = e;
        if (!tips[o.ip] || o.Lb > tips[o.ip].Lb) tips[o.ip] = { ponta: o.ip === 1 ? "A" : "B", Lb: o.Lb, cima_mm: Math.round(f.cima * 100000) / 100, baixo_mm: Math.round(f.baixo * 100000) / 100, limite_mm: Math.round(o.Lb / LIM_BAL * 100000) / 100, eta: e };
        if (!gov || e > eta + 1e-12) { eta = e; gov = { ip: o.ip, iv: o.iv, id: o.id, Lb: o.Lb, cima_mm: f.cima * 1000, baixo_mm: f.baixo * 1000, g_mm: f.g * 1000, lim_mm: o.Lb / LIM_BAL * 1000 }; }
      });
      if (gov) { gov.mecanismo = gov.cima_mm >= -gov.baixo_mm ? "sobe" : "desce"; gov.desloc_mm = gov.mecanismo === "sobe" ? gov.cima_mm : gov.baixo_mm; }
      return { eta: eta, etaIp: etaIp, gov: gov, tips: tips };
    };
    var cfZero = { beta: 0, tip: [0, 0] }, ev0 = avaliaBal(cfZero), cf0 = ev0.eta, etaPP = ev0.etaIp;
    /* a altura na ponta só ajuda quando a ponta DESCE e enquanto a V não encosta no vidro (altura = topo da V − topo do vidro) NA PONTA QUE GOVERNA; subindo, crescer hPonta não muda nada */
    var capPonta = (etaPP[1] > etaPP[0] ? g.vTop(TETO.y1) : g.vTop(TETO.y0)) - p.vidroTopo;
    var hPEsg = hPAt >= hPMax - 1e-9 || hPAt >= capPonta - 1e-9, alturaInutil = !!(ev0.gov && ev0.gov.mecanismo === "sobe"), hPEsgEf = hPEsg || alturaInutil;
    var altPonta = { inicial_m: p.cobertura.hPonta, atual_m: r2(hPAt), max_m: r2(hPMax), esgotada: hPEsg, inutil: alturaInutil, cresceu: hPAt > p.cobertura.hPonta + 1e-9, pontas_m: [r2(g.hVy(TETO.y0)), r2(g.hVy(TETO.y1))] };
    var cfRes = { auto: false, aplicada: false, modo: modoNorma ? "norma" : "acimaNorma", pontas: [null, null], max_mm: 0, especificada_mm: espec * 1000, altura: altPonta, hPontaEsgotada: hPEsgEf };
    var vNoLimite = !!(sec.V && q.limites && q.limites.V && sec.V.b >= q.limites.V.bMax - 1e-9);
    fVb = cf0; cfRes.etaSemContraflecha = cf0; altPonta.etaPorPonta = etaPP;
    var mmSem = function (e) { return e && e.gov ? { ponta: e.gov.ip === 1 ? "A" : "B", mecanismo: e.gov.mecanismo, desloc_mm: Math.round(e.gov.desloc_mm * 100) / 100, cima_mm: Math.round(e.gov.cima_mm * 100) / 100, baixo_mm: Math.round(e.gov.baixo_mm * 100) / 100, g_mm: Math.round(e.gov.g_mm * 100) / 100, limite_mm: Math.round(e.gov.lim_mm * 100) / 100, balanco_m: e.gov.Lb, nosVerificados: balV.length, extremidades: e.tips } : null; };
    cfRes.deslocamentoSem = mmSem(ev0); cfRes.deslocamentoLiquido = mmSem(ev0);
    if (altPonta.cresceu) avisosCF.push("R21: a altura da V na ponta do balanço subiu de " + (p.cobertura.hPonta * 100).toFixed(0) + " para " + (hPAt * 100).toFixed(0) + " cm (limite atrás da testeira: " + (hPMax * 100).toFixed(0) + " cm) para fechar a flecha do balanço; flecha do balanço η " + cf0.toFixed(3).replace(".", ",") + ".");
    /* mensagem de recusa pela CAUSA REAL (mecanismo que governa), nunca "reduza o beiral" para uma ponta que sobe */
    var recusaTxt = function (ev, etaTxt, extra) {
      var gv = ev.gov, mm = gv ? Math.abs(gv.desloc_mm).toFixed(1).replace(".", ",") : "?", lim = gv ? gv.lim_mm.toFixed(1).replace(".", ",") : "?";
      if (gv && gv.mecanismo === "sobe") return "R21: a ponta da V em balanço SOBE " + mm + " mm (limite " + lim + " mm = L/" + LIM_BAL + ", Tab. 21; η " + etaTxt + " > 1) pela rotação da V sobre o pilar sob o vão principal: aumente a rigidez da V no vão (altura da V entre o vidro e a telha, largura), use contraflecha no vão (item 8.2) ou ponha apoio intermediário no vão." + (extra || "") + " Reduzir o beiral NÃO ajuda (tira o contrapeso do balanço).";
      return "R21: a ponta da V em balanço DESCE " + mm + " mm (limite " + lim + " mm = L/" + LIM_BAL + ", Tab. 21; η " + etaTxt + " > 1): reduza o beiral, aumente a altura na ponta (hPontaMax) ou ponha escora no balanço." + (extra || "");
    };
    if (q.contraflechaAuto !== false && cf0 > 1 && vNoLimite && !espec && balV.length && hPEsgEf) {
      var fator = modoNorma ? 2 / 3 : (1 + PHI), passo = modoNorma ? 0.001 : 0.005, limC = function (w) { return w > 0 ? (modoNorma ? Math.floor(w * fator / passo + 1e-9) * passo : Math.ceil(w * fator / passo - 1e-9) * passo) : 0; };
      /* deformada instantânea de G no vão (flecha em relação à corda entre os apoios; + = desce) e nas pontas (só os nós que DESCEM) */
      var wVao = 0, wPt = [0, 0];
      vaoN.forEach(function (o) { var c = D("g", o.a)[1] + (D("g", o.b)[1] - D("g", o.a)[1]) * o.t; wVao = Math.max(wVao, c - D("g", o.id)[1]); });
      balV.forEach(function (o) { var s = gS(o); if (s < 0) wPt[o.ip] = Math.max(wPt[o.ip], -s); });
      var c1Max = limC(wVao), c2Max = [limC(wPt[0]), limC(wPt[1])], best = null, a1, a2, a3;
      for (a1 = 0; a1 <= c1Max + 1e-12; a1 += passo) for (a2 = 0; a2 <= c2Max[0] + 1e-12; a2 += passo) for (a3 = 0; a3 <= c2Max[1] + 1e-12; a3 += passo) {
        var cc = { beta: wVao > 0 ? a1 / wVao : 0, tip: [wPt[0] > 0 ? a2 / wPt[0] : 0, wPt[1] > 0 ? a3 / wPt[1] : 0] }, ev = avaliaBal(cc), soma = a1 + a2 + a3, viavel = ev.eta <= 1 + 1e-9;
        var melhor = !best || (viavel && !best.viavel) || (viavel === best.viavel && (viavel ? (soma < best.soma - 1e-12 || (Math.abs(soma - best.soma) < 1e-12 && ev.eta < best.ev.eta)) : (ev.eta < best.ev.eta - 1e-9 || (Math.abs(ev.eta - best.ev.eta) <= 1e-9 && soma < best.soma - 1e-12))));
        if (melhor) best = { cc: cc, ev: ev, soma: soma, viavel: viavel, c1: a1, c2: [a2, a3] };
      }
      var cfMax = Math.max(best.c1, best.c2[0], best.c2[1]), fv = best.ev.eta;
      var ptEf = [0, 1].map(function (ip) { var nn = null; balV.forEach(function (o) { if (o.ip === ip && (nn === null || o.Lb > nn.Lb)) nn = o; }); return nn ? camNo(best.cc, nn) : 0; });
      var pontaMax = [0, 0]; balV.forEach(function (o) { if (o.Lb > pontaMax[o.ip]) pontaMax[o.ip] = o.Lb; });
      var mm1 = function (v) { return Math.round(v * 1000); }, wMax = Math.max(wVao, wPt[0], wPt[1]);
      cfRes = { auto: true, aplicada: cfMax > 1e-9, modo: cfRes.modo, fator: fator, vao: { contraflecha_mm: mm1(best.c1), gInst_mm: Math.round(wVao * 10000) / 10, limiteNorma_mm: Math.round(wVao * 2 / 3 * 10000) / 10 },
        pontas: [0, 1].map(function (ip) { return { ponta: ip, contraflecha_mm: mm1(best.c2[ip]), efeito_mm: Math.round(ptEf[ip] * 10000) / 10, balanco_m: pontaMax[ip], gInstDesce_mm: Math.round(wPt[ip] * 10000) / 10 }; }),
        max_mm: mm1(cfMax), gInst_mm: Math.round(wMax * 10000) / 10, limiteNorma_mm: Math.round(wMax * 2 / 3 * 10000) / 10,
        excedeNorma: best.c1 > wVao * 2 / 3 + 1e-9 || best.c2[0] > wPt[0] * 2 / 3 + 1e-9 || best.c2[1] > wPt[1] * 2 / 3 + 1e-9, especificada_mm: 0, etaSemContraflecha: cf0, etaLiquida: fv, altura: altPonta, hPontaEsgotada: hPEsgEf,
        deslocamentoSem: mmSem(ev0), deslocamentoLiquido: mmSem(best.ev), limiteFlecha: "L/" + LIM_BAL, tabela21: "NBR 7190-1:2022, Tab. 21, p. 67 impr. (PDF 79): δnet,fin de L/125 a L/175 em balanço, em módulo (sobe ou desce)",
        itemContraflecha: "NBR 7190-1:2022, item 8.2, p. 67 impr. (PDF 79): contraflecha ≤ 2/3 do deslocamento instantâneo das ações permanentes — só compensa DESCIDA" };
      fVb = fv;
      if (fv > 1) cfRes.recusa = recusaTxt(best.ev, fv.toFixed(2).replace(".", ","), cfMax > 0 ? " Já aplicada contraflecha de " + cfRes.max_mm + " mm (limite da norma: 2/3 de wG,inst = " + cfRes.limiteNorma_mm.toFixed(1).replace(".", ",") + " mm)." : "");
    } else if (cf0 > 1 && hPEsgEf && vNoLimite && !espec && q.contraflechaAuto !== false) cfRes.recusa = recusaTxt(ev0, cf0.toFixed(2).replace(".", ","));
    if (cfRes.aplicada) avisosCF.push("R21: contraflecha de fábrica na V (" + (cfRes.modo === "norma" ? "≤ 2/3 de wG,inst, NBR 7190-1:2022 item 8.2, arredondada para baixo ao mm" : "wG·(1+φ), φ = " + PHI + ", arredondada a 5 mm") + "): " + (cfRes.vao.contraflecha_mm ? cfRes.vao.contraflecha_mm + " mm no meio do vão (limite 2/3·wG,inst = " + cfRes.vao.limiteNorma_mm.toFixed(1).replace(".", ",") + " mm)" : "") + (cfRes.pontas.some(function (t) { return t.contraflecha_mm > 0; }) ? (cfRes.vao.contraflecha_mm ? "; " : "") + "na ponta que DESCE: A " + cfRes.pontas[1].contraflecha_mm + " mm, B " + cfRes.pontas[0].contraflecha_mm + " mm" : "") + "; a contraflecha só compensa DESCIDA. Ponta " + (cfRes.deslocamentoLiquido.mecanismo === "sobe" ? "SOBE" : "DESCE") + " " + Math.abs(cfRes.deslocamentoLiquido.desloc_mm).toFixed(1).replace(".", ",") + " mm (limite " + cfRes.deslocamentoLiquido.limite_mm.toFixed(1).replace(".", ",") + " mm); flecha líquida do balanço η " + fVb.toFixed(3).replace(".", ",") + " (sem contraflecha " + cf0.toFixed(3).replace(".", ",") + ", altura na ponta " + (hPAt * 100).toFixed(0) + " cm)." + (cfRes.excedeNorma ? " ATENÇÃO (VERMELHO): contraflecha ACIMA DO LIMITE DA NORMA (item 8.2) — escolhida explicitamente (contraflechaModo = acimaNorma); o RT precisa assumir o desvio." : ""));
    var hP = g.topoPilar - p.baseZ;
    CS.filter(function (c) { return c.tipo === "W"; }).forEach(function (c) {
      PX.forEach(function (x, iv) { PY.forEach(function (y, ip) { var d = D("w" + c.id, "PT" + iv + ip); topo = Math.max(topo, psi1W * hyp(d[0], d[2]) / (hP / 300)); regF("topoPilarVentoFreq_H300", psi1W * hyp(d[0], d[2]), hP / 300); }); });
      [0, 1].forEach(function (ip) {
        var d = D("w" + c.id, "VGM" + ip), a = D("w" + c.id, "PT0" + ip), b = D("w" + c.id, "PT1" + ip);
        fVG = Math.max(fVG, psi1W * Math.abs(d[2] - (a[2] + b[2]) / 2) / (LX / 300)); regF("vergaVentoFreq_L300", psi1W * Math.abs(d[2] - (a[2] + b[2]) / 2), LX / 300);
      });
    });
    var vgVert = 0; [0, 1].forEach(function (ip) { vgVert = Math.max(vgVert, fin("VGM" + ip, "PT0" + ip)); }); regF("vergaVertical_20mm", vgVert, 0.020);
    var dl = cfRes.deslocamentoLiquido; if (dl) fm.vigaVBalanco = { mm: Math.abs(dl.desloc_mm), limite_mm: dl.limite_mm, eta: fVb, sentido: dl.mecanismo, balanco_m: dl.balanco_m, extremidades: dl.extremidades };
    /* M1 (revisão R05, ajustada na R27): MATERIAIS FRÁGEIS ligados à estrutura (vidro sob a V e sob a verga) — NBR 7190-1:2022, itens 8.1/8.2, p. 65–67 impr. (PDF 77–79): o deslocamento INSTANTÂNEO só das ações VARIÁVEIS
       fica limitado a L/500 (vão) ou L/250 (balanço) e a 15 mm. Variáveis aqui = sobrecarga da cobertura e vento. COMBINAÇÃO RARA (NBR 8681): a variável principal CARACTERÍSTICA + ψ1 das demais (não ψ0), vale a pior das duas como principal.
       CADA PLANO é verificado ISOLADAMENTE (a norma permite; sem soma vetorial) — decisão do coordenador, 24/10/2026. V: deslocamento vertical em relação à corda entre os apoios (vão LY; o vidro não passa sob o balanço);
       verga: plano vertical e plano horizontal, cada um em relação à corda entre os topos dos pilares (vão LX), vale o maior. */
    var psi1Q = CA.PSI["Q-cobertura"].psi1, wCb = CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { return "w" + c.id; });
    var varInst = function (dq, dws) { var mw = dws.reduce(function (m, v) { return Math.max(m, v); }, 0); return Math.max(dq + psi1W * mw, mw + psi1Q * dq); };
    var fr = { V: { delta_mm: 0, limite_mm: 0, eta: 0, onde: "" }, VG: { delta_mm: 0, limite_mm: 0, eta: 0, onde: "" },
      regra: "NBR 7190-1:2022, item 8.2, p. 67 impr. (PDF 79): materiais frágeis (vidro) — deslocamento instantâneo só das ações variáveis ≤ L/500 (vão) e ≤ 15 mm; combinação rara: a variável principal característica + ψ1 das demais (Q-cobertura ψ1 = " + psi1Q + "; vento ψ1 = " + psi1W + "); cada plano (vertical e horizontal) isolado, vale o maior" };
    vaoN.forEach(function (o) {
      var ch = function (cb) { return D(cb, o.a)[1] + (D(cb, o.b)[1] - D(cb, o.a)[1]) * o.t; }, dq = Math.abs(D("q", o.id)[1] - ch("q")), dw = wCb.map(function (cb) { return Math.abs(D(cb, o.id)[1] - ch(cb)); }), v = varInst(dq, dw), lim = Math.min(LY / 500, 0.015);
      if (v / lim > fr.V.eta) fr.V = { delta_mm: v * 1000, limite_mm: lim * 1000, eta: v / lim, onde: o.id, parcelas: { q_mm: dq * 1000, w_mm: dw.reduce(function (m, x) { return Math.max(m, x); }, 0) * 1000, psi1Q: psi1Q, psi1W: psi1W } }; regF("vigaV_fragil_L500_15mm", v, lim);
    });
    [0, 1].forEach(function (ip) {
      var vec = function (eixo) { return function (cb) { var d = D(cb, "VGM" + ip), a = D(cb, "PT0" + ip), b = D(cb, "PT1" + ip); return Math.abs(d[eixo] - (a[eixo] + b[eixo]) / 2); }; }, v = Math.max(varInst(vec(1)("q"), wCb.map(vec(1))), varInst(vec(2)("q"), wCb.map(vec(2)))), lim = Math.min(LX / 500, 0.015);
      if (v / lim > fr.VG.eta) {
        var pl = function (eixo) { var dq = vec(eixo)("q"), mw = wCb.map(vec(eixo)).reduce(function (m, x) { return Math.max(m, x); }, 0); return { q_mm: dq * 1000, w_mm: mw * 1000, delta_mm: varInst(dq, wCb.map(vec(eixo))) * 1000 }; };
        fr.VG = { delta_mm: v * 1000, limite_mm: lim * 1000, eta: v / lim, onde: "VGM" + ip, planos: { vertical: pl(1), horizontal: pl(2) }, psi1Q: psi1Q, psi1W: psi1W };
        fr.VG.vetorial_ref_mm = Math.sqrt(Math.pow(fr.VG.planos.vertical.delta_mm, 2) + Math.pow(fr.VG.planos.horizontal.delta_mm, 2));     // só referência: a soma vetorial NÃO é o critério
      } regF("vergaFragil_L500_15mm", v, lim);
    });
    res.flechasMm = fm; res.fragil = fr; res.deslocBalanco = { terca: { cima_mm: Math.round(sinalTb.cima * 10000) / 10, baixo_mm: Math.round(sinalTb.baixo * 10000) / 10 }, vigaV: cfRes.deslocamentoLiquido || null };
    res.flechas = { tercaVao: fT, tercaBalanco: fTb, vigaV: fV, vigaVBalanco: fVb, topoPilarVentoFreq_H300: topo, vergaVentoFreq_L300: fVG, vergaVertical_20mm: vgVert / 0.020, vigaV_fragil_L500_15mm: fr.V.eta, vergaFragil_L500_15mm: fr.VG.eta };
    res.DZ = g.DZ; res.nTercas = M.nT + 1; res.espacTercas = sT; res.vento = { v0: VT.v0, q: VT.q, vk: VT.vk, s1: q.vento.s1.valor, avisos: VT.avisos };
    res.QCOB = QCOB; res.G2 = G2; res.secoes = JSON.parse(JSON.stringify(sec)); res.modelo = M; res.avisosAnalise = r.avisos; res.casosVento = VT.casos.map(function (c) { return c.id; });
    res.kFlambagem = kFl; res.kFlambagemEixos = { y: kFlY, z: kFlZ }; res.flambagemPilar = flamb; res.torcao = CS.tors; res.dominante = { DCPI: VE.casoAberturaDominante(VT.q), DCPIS: CS.some(function (c) { return c.id === "DCPIS"; }) ? VE.casoAberturaDominanteSuccao(VT, VT.q) : null };
    res.excepcionais = elu.filter(function (c) { return /^EXC_/.test(c.id); }).map(function (c) { return c.id; }); res.ventoGeometria = VT.geometria;
    res.contraflechaV = cfRes; avisosCF.forEach(function (a) { res.avisos.push(a); }); if (cfRes.recusa) res.avisos.push(cfRes.recusa); res.phi = PHI; res.geometria = { yT: M.yT, sT: M.sT, vaoK: M.vaoK };
    return res;
  }

  /* ---------- laço de crescimento da seção ---------- */
  function crescer(q, sec, gp, r) {
    var L = q.limites, pa = q.passo.altura, pl = q.passo.largura;
    if (gp === "T") {
      var o = sec.T, eT = r && r.esbeltez && r.esbeltez.T;
      if (eT && eT.eixo === "b" && o.b < L.T.bMax - 1e-9) o.b = r2(o.b + pl);       // E4: λ no eixo fraco → engrossa (b)
      else if (o.h + pa <= L.T.hMax + 1e-9) o.h = r2(o.h + pa);
      else if (o.b < L.T.bMax - 1e-9) o.b = r2(o.b + pl);
      else return false;
      return true;
    }
    if (gp === "V") {
      if (sec.V.b < L.V.bMax - 1e-9) { sec.V.b = r2(sec.V.b + pl); return true; }
      /* R21: com a largura no limite, a flecha do balanço fecha pela ALTURA NA PONTA (passos de 40 mm até hPontaMax); a contraflecha da norma só entra no `rodar` depois que a altura se esgota */
      var cv = r && r.contraflechaV, ht = cv && cv.altura;
      if (r && r.flechas && r.flechas.vigaVBalanco > 1 && ht && !cv.hPontaEsgotada) { sec.hPonta = r2(Math.min(ht.atual_m + pa, ht.max_m)); return true; }
      return false;
    }
    if (gp === "VG") { var eV = r && r.esbeltez && r.esbeltez.VG; if (eV && eV.eixo === "b" && sec.VG.b < L.VG.bMax - 1e-9) sec.VG.b = r2(sec.VG.b + pl); else if (sec.VG.h < L.VG.hMax - 1e-9) sec.VG.h = r2(sec.VG.h + pa); else sec.VG.b = r2(sec.VG.b + pl); return true; }
    if (gp === "ES" || gp === "BL" || gp === "TR" || gp === "PD") return false;
    var P = sec.P;
    if (P.forma === "quadrado") { P.b = r2(P.b + pl); P.h = P.b; }
    else if (P.forma === "circular") P.d = r2(P.d + pl);
    else { var esbelta = !!(r && r.esbeltez && r.esbeltez.P && r.esbeltez.P.eixo === "b");       // E4: λ acima do limite no eixo FRACO (campo esbelto/lambda da verificação, não o η sentinela): crescer h não resolve — engrossa a peça (b)
      if (P.b < 0.14 || esbelta) P.b = r2(P.b + pl); else P.h = r2(P.h + pa); }
    return true;
  }
  function piorPorGrupo(r) {
    var f = r.flechas, g = r.grupos, z = { eta: 0 };       // ES pode não existir (sem beiral) → 0
    return { T: Math.max(g.T.eta, f.tercaVao, f.tercaBalanco), V: Math.max(g.V.eta, f.vigaV, f.vigaVBalanco || 0, f.vigaV_fragil_L500_15mm || 0), P: Math.max(g.P.eta, f.topoPilarVentoFreq_H300), TR: g.TR ? g.TR.eta : 0, PD: g.PD ? g.PD.eta : 0,
      VG: Math.max(g.VG.eta, f.vergaVentoFreq_L300, f.vergaVertical_20mm, f.vergaFragil_L500_15mm || 0), ES: (g.ES || z).eta, BL: g.BL.eta };
  }
  /**
   * Cresce as seções (grupo mais carregado primeiro) até η ≤ 1 e flecha ≤ 1 em todos os grupos, ou até esgotar o limite de altura.
   * partida = seções iniciais {T, V, VG, P}. Devolve { secoes, resultado (último rodar), historico, semSolucao, pior }.
   */
  function dimensionar(proj, partida, opcoes) {
    opcoes = opcoes || {};
    var q = padraoCache(proj), sec = JSON.parse(JSON.stringify(partida)), hist = [], it, r, pior, falha, mexeu;
    for (it = 0; it < (opcoes.maxIter || 40); it++) {
      r = rodar(proj, sec); pior = piorPorGrupo(r);
      hist.push({ it: it, sec: JSON.parse(JSON.stringify(sec)), pior: pior });
      if (opcoes.aoIterar) opcoes.aoIterar(it, sec, pior);
      falha = Object.keys(pior).filter(function (k) { return pior[k] > 1; });
      if (!falha.length) return { secoes: sec, resultado: r, historico: hist, semSolucao: false, pior: pior };
      mexeu = false;
      falha.sort(function (a, b) { return pior[b] - pior[a]; }).forEach(function (k) { if (crescer(q, sec, k, r)) mexeu = true; });
      if (!mexeu) return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior };
    }
    return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior, motivo: "limite de iterações" };
  }

  /**
   * Pacote de ligações do T1 a partir do resultado de `rodar` (C2): esforços EQUIVALENTES (F·kmodRef/kmod da combinação que os gerou), kmod de referência e ρk da classe
   * escolhida, fc,90,k da classe, alturas da V (he/h e lef) e dimensões reais de escora/travessa/pendural. opc sobrescreve/acrescenta campos de ML.pacoteT1.
   */
  function pacoteLigacoes(proj, secoes, r, opc) {
    var q = padraoCache(proj), cl = MM.classe2022(q.classe), p = q.params, g = MT.T1.geometria(p, secoes), hs = g.PY.map(function (y) { return g.hVy(y); });
    var c = ext({ kmod: r.kmodRef, kmod1: r.kmod1Ref, kmod2: r.kmod2Ref, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" }, (opc && opc.cfg) || {});
    if (opc && opc.cfg && opc.cfg.kmod != null && opc.cfg.kmod1 == null) { delete c.kmod1; delete c.kmod2; }                    // kmod imposto pelo chamador vale como está
    /* N6: rigidez mínima da base (cruz e garfo): a que mantém β ≤ 3 no pilar (x·tan x = C·L/EI com x = π/3) — a mesma fronteira do aviso M7 de "mola de base mole" (B3: o garfo também, pelo eixo forte). */
    var Pf = secoes.P, Lp = g.topoPilar - p.baseZ, EIp = null, Em = MM.classe2022(q.classe).Ec0m * 1e3;
    if (Pf.forma === "quadrado") EIp = Em * Pf.b * Math.pow(Pf.h, 3) / 12; else if (Pf.forma === "circular") EIp = Em * Math.PI * Math.pow(Pf.d, 4) / 64;
    else if (Pf.forma === "duplo") EIp = Em * 2 * Pf.b * Math.pow(Pf.h, 3) / 12;                  // B3: garfo — o eixo FORTE (maior EI) é o que dá o maior β para a mesma mola
    var KthMin = EIp ? (Math.PI / 3) * Math.tan(Math.PI / 3) * EIp / Lp : null;
    return ML.pacoteT1(ext({ secoes: secoes, KthetaMin: KthMin, reacoes: r.reacoesEq || r.reacoes, lig: r.ligEq || r.lig, reacoesReais: r.reacoes, ligReal: r.lig, fitaNmax: r.fitaNmax, fitaNeq: r.fitaEq, cfg: c, fc90k: cl.fc90k, hV: Math.max.apply(null, hs), hVmin: Math.min.apply(null, hs),
      hT: secoes.T.h, dims: { escora: p.escora, travessa: p.travessa, pendural: p.pendural } }, opc || {}, { cfg: c }));
  }

  /**
   * N6 (R05) — dimensiona com a RIGIDEZ DA BASE calculada pela ligação dimensionada. Sem `proj.krBase` (valor imposto pelo usuário), itera:
   *   análise (base rígida só na 1ª volta) → seções → ligações (madligacoes.pacoteT1) → Kθ = Σ Ku·r² (7.1.12) → nova análise com Kθ, partindo das seções já achadas → até Kθ variar ≤ 5 % (máx. 6 voltas).
   * Não convergindo, adota a MENOR das duas últimas rigidezes e roda mais uma vez, com aviso. Com `proj.krBase` informado, roda uma vez só (como antes, com o aviso M7).
   * Devolve { d (dimensionar), LG (pacote de ligações), rigidezBase {auto, krBase, Ktheta, convergiu, iteracoes[]} }.
   */
  function projetoComBase(proj, partida, opcoes) {
    opcoes = opcoes || {};
    var tol = opcoes.tolBase != null ? opcoes.tolBase : 0.05, maxIt = opcoes.maxIterBase || 6, hist = [], d, LG, sec = partida, it, K, conv = false, auto = proj.krBase == null;
    proj._krBase = null;
    if (!auto) { d = dimensionar(proj, partida, opcoes); LG = pacoteLigacoes(proj, d.secoes, d.resultado, opcoes.ligacoes); return { d: d, LG: LG, rigidezBase: { auto: false, krBase: proj.krBase, Ktheta: LG.rigidezBase ? LG.rigidezBase.Ktheta : null, convergiu: true, iteracoes: [] } }; }
    for (it = 0; it < maxIt; it++) {
      d = dimensionar(proj, sec, opcoes); LG = pacoteLigacoes(proj, d.secoes, d.resultado, opcoes.ligacoes);
      K = LG.rigidezBase && LG.rigidezBase.Ktheta;
      hist.push({ volta: it + 1, krUsada: proj._krBase, Ktheta: K, P: JSON.parse(JSON.stringify(d.secoes.P)), nPinosBase: LG.base && LG.base.n });
      if (!K) break;
      if (proj._krBase != null && Math.abs(K / proj._krBase - 1) <= tol) { conv = true; break; }
      proj._krBase = K; sec = d.secoes;
    }
    if (!conv && K && hist.length >= 2) {
      proj._krBase = Math.min(K, hist[hist.length - 1].krUsada || K, hist[hist.length - 2].Ktheta || K); sec = d.secoes;
      d = dimensionar(proj, sec, opcoes); LG = pacoteLigacoes(proj, d.secoes, d.resultado, opcoes.ligacoes);
      hist.push({ volta: hist.length + 1, krUsada: proj._krBase, Ktheta: LG.rigidezBase && LG.rigidezBase.Ktheta, final: "menor das duas últimas" });
    }
    var info = { auto: true, krBase: proj._krBase, Ktheta: LG.rigidezBase ? LG.rigidezBase.Ktheta : null, convergiu: conv, iteracoes: hist };
    /* B5: no ramo "não convergiu" o resultado final pode ficar com a análise MAIS RÍGIDA que a ligação entrega (Kθ final < krBase usado) — isso é contra a segurança e o resultado diz */
    if (!conv && K && info.Ktheta != null && info.Ktheta < proj._krBase * 0.995) { info.mais_rigida_que_a_ligacao = true; d.resultado.avisos.push("N6/B5: a análise final usou krBase = " + Math.round(proj._krBase) + " kN·m/rad, MAIS RÍGIDA que a ligação final entrega (Kθ = " + Math.round(info.Ktheta) + "): contra a segurança — refazer com krBase informado ou aumentar a ligação da base."); }
    if (!K) d.resultado.avisos.push("N6: a base não tem solução de pinos — Kθ indisponível; a análise ficou com base RÍGIDA (diagnóstico), o resultado NÃO vale.");
    else if (!conv) d.resultado.avisos.push("N6: a rigidez da base não convergiu em " + hist.length + " voltas (variação > " + Math.round(tol * 100) + " %); adotada a MENOR das duas últimas (" + Math.round(info.krBase) + " kN·m/rad) — conferir.");
    else d.resultado.avisos.push("N6: rigidez da base " + Math.round(info.krBase) + " kN·m/rad, convergida em " + hist.length + " volta(s) (Kθ da ligação final " + Math.round(info.Ktheta) + ", variação ≤ " + Math.round(tol * 100) + " %).");
    proj._krBase = null;                                                                  // B4: a rigidez calculada fica em `info.krBase`; um `rodar(proj)` posterior NÃO herda em silêncio
    return { d: d, LG: LG, rigidezBase: info };
  }

  /**
   * M8 (R05) — projeto COMPLETO do T1 (dimensiona + base + ligações), com ALTERNATIVA AUTOMÁTICA quando a base em CRUZ reprova (pino a menos de 4d da fenda da outra chapa):
   *   1) pilar MAIOR — o menor lado (b ou Ø, no passo do fabricante, dentro de limites.P.bMax, padrão 0,40 m) com que a cruz fecha: lado útil ≥ 16d + fenda (18 mm); refaz o laço inteiro com o pilar novo;
   *   2) base em GARFO — não é aplicada sozinha (muda o pilar para duplo e a estrutura inteira): fica OFERECIDA no resultado, para rodar como a opção B.
   * `opcoes.alternativaBase === false` desliga. Devolve { d, LG, rigidezBase, alternativaBase: null | { motivo, tentativas[], garfo, resolvida } }.
   */
  /** M6: diâmetros de pino MENORES que o da base (Ø16) que o catálogo da RA tem — só Ø12 (Ø14 não existe no catálogo) */
  var DIAM_MENOR_BASE = [0.012];
  function projetoCompleto(proj, partida, opcoes) {
    opcoes = opcoes || {};
    var part = JSON.parse(JSON.stringify(partida)), tent = [], out, k, motivo = null, D = (opcoes.ligacoes && opcoes.ligacoes.cfg && opcoes.ligacoes.cfg.d) || ML.PADRAO.d, fenda = 0.018;
    for (k = 0; k < 5; k++) {
      out = projetoComBase(proj, part, opcoes);
      var cz = out.LG.base && out.LG.base.cruz, P = out.d.secoes.P, q = proj._pad, lim = (q.limites && q.limites.P && q.limites.P.bMax) || 0.40, pas = q.passo.largura;
      if (!cz || cz.ok || opcoes.alternativaBase === false || P.forma === "duplo") break;
      motivo = motivo || ("base em cruz reprovada (" + out.LG.base.cruz.passos[0] + ")");
      /* M6 (R05, decisão do coordenador 24/10/2026): ANTES de aumentar o pilar, tenta pinos MENORES na base em cruz (lado útil ≥ 16d + fenda; espaçamentos da Tab. 14 recalculados com o d novo). O catálogo da RA tem Ø12 (pinos da verga)
         e Ø16; Ø14 NÃO existe no catálogo e não é inventado. Só a base muda de diâmetro (cfg.dBase); topo, escora e verga seguem como estavam. Só vale se a cruz e a base fecham com o pilar atual. */
      if (opcoes.pinoMenorBase !== false && !tent.some(function (t) { return t.tipo === "pino-menor"; })) {
        var dAtual = (opcoes.ligacoes && opcoes.ligacoes.cfg && opcoes.ligacoes.cfg.dBase) || D;
        DIAM_MENOR_BASE.filter(function (dm) { return dm < dAtual - 1e-9; }).some(function (dm) {
          var op2 = ext({}, opcoes); op2.ligacoes = ext({}, opcoes.ligacoes || {}); op2.ligacoes.cfg = ext({}, (opcoes.ligacoes && opcoes.ligacoes.cfg) || {}, { dBase: dm });
          var out2 = projetoComBase(proj, part, op2), cz2 = out2.LG.base && out2.LG.base.cruz, bok = !!(out2.LG.base && out2.LG.base.ok);
          tent.push({ tipo: "pino-menor", aplicada: !!(cz2 && cz2.ok && bok), d_mm: Math.round(dm * 1000), de_mm: Math.round(dAtual * 1000), pilar_m: P.forma === "quadrado" ? P.b : P.d, motivo: cz2 && cz2.ok && bok ? null : "a cruz ou a base não fecha nem com Ø" + Math.round(dm * 1000) });
          if (cz2 && cz2.ok && bok) { out = out2; opcoes = op2; return true; }
          opcoes = op2;                                                                      /* E4 (d): não fechou com o pilar atual — o pilar cresce só até o MÍNIMO do Ø menor (16·d_menor + fenda), não do Ø16 */
          return false;
        });
        if (out.LG.base.cruz.ok) break;
      }
      var dEf = (opcoes.ligacoes && opcoes.ligacoes.cfg && opcoes.ligacoes.cfg.dBase) || D, ladoNec = 16 * dEf + fenda, atual = P.forma === "quadrado" ? P.b : P.d, nec = P.forma === "quadrado" ? ladoNec : ladoNec / 0.85, novo = Math.ceil((nec - 1e-9) / pas) * pas;
      novo = Math.max(novo, atual + pas); novo = Math.round(novo * 1000) / 1000;
      if (novo > lim + 1e-9) { tent.push({ tipo: "pilar-maior", aplicada: false, de_m: atual, para_m: novo, motivo: "passaria do limite do pilar (" + lim + " m)" }); break; }
      tent.push({ tipo: "pilar-maior", aplicada: true, de_m: atual, para_m: novo, forma: P.forma });
      part = JSON.parse(JSON.stringify(out.d.secoes)); if (P.forma === "quadrado") { part.P.b = novo; part.P.h = novo; } else part.P.d = novo;
    }
    var czF = out.LG.base && out.LG.base.cruz, alt = null, dEfTxt = (opcoes.ligacoes && opcoes.ligacoes.cfg && opcoes.ligacoes.cfg.dBase) || D, ladoNecTxt = 16 * dEfTxt + fenda;
    if (tent.length || (czF && !czF.ok)) {
      alt = { motivo: motivo, tentativas: tent, resolvida: !!(czF && czF.ok),
        garfo: { aplicada: false, nota: "Alternativa: pilar duplo com base em GARFO (chapas externas e parafusos ajustados aparentes) — rodar o projeto como opção de pilar duplo; não é trocada sozinha porque muda a estrutura inteira (esbeltez do eixo fraco, V entre as peças)." } };
      var tPino = tent.filter(function (t) { return t.tipo === "pino-menor" && t.aplicada; })[0], tPilar = tent.filter(function (t) { return t.tipo === "pilar-maior" && t.aplicada; })[0];
      if (tPino && !tPilar) out.d.resultado.avisos.push("M6: a base em cruz reprovava com pinos Ø" + tPino.de_mm + " (lado útil do pilar " + Math.round((tPino.pilar_m || 0) * 1000) + " mm < 16d + fenda); resolvida SEM aumentar o pilar, com pinos Ø" + tPino.d_mm + " na base (espaçamentos da Tab. 14 recalculados com d = " + tPino.d_mm + " mm; topo, escora e verga seguem como estavam). Orçamento: o pino Ø" + tPino.d_mm + " é orçado ao preço do Ø16 (a favor). Alternativa se o RT preferir Ø" + tPino.de_mm + ": pilar maior ou garfo (opcoes.pinoMenorBase = false).");
      else out.d.resultado.avisos.push("M8: " + (alt.resolvida ? "a base em cruz reprovava e o pilar foi AUMENTADO para " + (out.d.secoes.P.forma === "quadrado" ? Math.round(out.d.secoes.P.b * 100) + " × " + Math.round(out.d.secoes.P.b * 100) + " cm" : "Ø " + Math.round(out.d.secoes.P.d * 100) + " cm") + " (alternativa automática). M6: este é o pilar MÍNIMO IMPOSTO PELA BASE EM CRUZ (lado útil ≥ 16d + fenda = " + Math.round(ladoNecTxt * 1000) + " mm com Ø" + Math.round(dEfTxt * 1000) + "), não pela resistência do pilar (η do pilar = " + ((out.d.resultado.grupos.P || {}).eta || 0).toFixed(2).replace(".", ",") + ") — custo e estética; saída: base em GARFO (pilar duplo), oferecida abaixo (alternativaBase.garfo)." : "a base em cruz REPROVA e o pilar maior passaria do limite — alternativas: base em garfo (pilar duplo) ou pilar de lado maior."));
    }
    out.alternativaBase = alt;
    return out;
  }

  /**
   * Projeto completo de T1: dimensiona, verifica as ligações, gera a fonte e (se o auditor estiver carregado) o pente-fino.
   * opcoes.partida = seções iniciais; opcoes.t7 = parâmetros do deck (madtipologias.T7) para somar à fonte; opcoes.terreno, opcoes.auditor.
   */
  function projetarT1(proj, partida, opcoes) {
    opcoes = opcoes || {};
    var pc = projetoCompleto(proj, partida, opcoes), d = pc.d, r = d.resultado, q = proj._pad, LG = pc.LG;
    var F = MT.T1.fonte(q.params, d.secoes, { LG: LG, classe: q.classe, kFlambagem: r.kFlambagem }), pecas = F.pecas, t7 = null;
    if (opcoes.t7) { t7 = MT.T7.fonte(ext({ classe: q.classe }, opcoes.t7)); pecas = pecas.concat(t7.pecas); }
    var out = { secoes: d.secoes, resultado: r, historico: d.historico, semSolucao: d.semSolucao, ligacoes: LG, rigidezBase: pc.rigidezBase, alternativaBase: pc.alternativaBase, fonte: { pecas: pecas, volume_por_material_m3: MT.volumePorMaterial(pecas) }, t7: t7 };
    if (AUD && opcoes.auditor !== false) out.auditoria = AUD.auditar({ pecas: pecas, ligacoes: LG, params: q.params, secoes: d.secoes, terreno: opcoes.terreno, modelo: r.modelo, analise: r, analisar: AN.analisar, dim: { semSolucao: d.semSolucao, pior: d.pior } }, { verificarMecanismo: opcoes.verificarMecanismo !== false });
    return out;
  }

  /* =====================================================================
   * T2 — casa/pavilhão de DUAS ÁGUAS (E4): modelo 3D do acoanalise a partir da LISTA DE MEMBROS de madtipologias.T2.geometria (a mesma geometria da fonte).
   * Convenção do solver: x = X (cumeeira), y = vertical, z = Y da planta (através). Água F = frente (Y baixo), B = fundo (Y alto).
   * Cargas: G1 (peso próprio), G2 (telha cerâmica + ripas, kN/m² da água), Q (sobrecarga de cobertura por m² de PLANTA), vento (acovento, cobertura "duas-aguas": ortogonais + oblíquos da Tabela 5,
   * com beiral a barlavento) normal à água, vento nas paredes sobre os pilares do perímetro, abertura dominante (DCPI/DCPIS) como EXCEPCIONAL. Não modelado (declarado): torção por excentricidade do vento (M13 do T1),
   * vergas de vidro (parâmetro `vergas` reservado), caibros secundários e flecha do vidro.
   * EMPUXO (sistema cumeeira): assento "deslizante" = rolete vertical entre o caibro e o frechal (cumeeira portante, sem empuxo); assento "fixo" = nó rígido + tirante só-tração de aço (barra roscada); sem nenhum dos dois o motor RECUSA.
   * ===================================================================== */
  function norm(a, b) { return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2)); }
  var T2_LIM = { P: { bMax: 0.40, hMax: 0.40 }, PO: { bMax: 0.40, hMax: 0.40 }, PC: { bMax: 0.40, hMax: 0.40 }, FR: { hMax: 0.48, bMax: 0.30 }, BS: { hMax: 0.36, bMax: 0.20 }, BI: { hMax: 0.36, bMax: 0.20 }, PD: { hMax: 0.24, bMax: 0.16 },
    DG: { hMax: 0.24, bMax: 0.16 }, T: { hMax: 0.36, bMax: 0.20 }, CM: { hMax: 0.80, bMax: 0.24 }, CB: { hMax: 0.36, bMax: 0.16 }, LB: { hMax: 0.24, bMax: 0.16 }, DX: { hMax: 0.24, bMax: 0.16 }, FT: { bMax: 0.20 } };
  var T2_TI = [0.012, 0.016, 0.020, 0.025, 0.032];
  /* E4 T2fix C3: fita/chapa de aço do contraventamento DIMENSIONADA pela rigidez K_br,1 (6.6.2): catálogo b × e (m) que o laço percorre */
  var T2_FT = [[0.06, 0.002], [0.08, 0.0025], [0.10, 0.003], [0.12, 0.003], [0.15, 0.004], [0.20, 0.005]];
  function t2Padrao(proj) {
    var q = {}; Object.keys(proj).forEach(function (k) { if (k.charAt(0) !== "_") q[k] = proj[k]; });
    q.classe = q.classe || "mlc:GL24h"; q.umidade = q.umidade || 2; q.limVao = q.limVao || 300; q.limBalanco = q.limBalanco || 150; q.pesoMLC = q.pesoMLC != null ? q.pesoMLC : 5.0;
    q.cargas = ext({ outros: 0 }, q.cargas || {}); q.passo = ext({ largura: 0.02, altura: 0.04 }, q.passo || {}); q.limites = ext({}, T2_LIM, q.limites || {});
    var cl = MM.classe2022(q.classe); if (cl.incompleta) throw new Error("madmateriais: classe " + q.classe + " incompleta — " + cl.incompleta);
    q.params = MT.T2.parametros(q.params);
    if (q.params.contraventamento.tipo === "fita") q.limites = ext({}, q.limites, { FT: { bMax: 0.06 } });      /* decisão do coordenador: a fita metálica só vale como OPÇÃO quando a rigidez exigida (6.6.2) é atingida com fita ≤ 60 mm; o padrão é a diagonal de madeira */
    var c = q.params.cumeeira;
    if (q.params.sistema === "cumeeira" && c.assento === "fixo" && !c.tirante) { q.params = MT.T2.parametros(ext({}, q.params, { cumeeira: ext({}, c, { tirante: true }) })); q._avisoTirante = "EMPUXO: assento fixo dos caibros sem tirante informado — o motor ligou o TIRANTE de aço em todos os pares de caibros."; }
    if (q.params.sistema === "cumeeira" && c.assento === "deslizante" && c.tirante) q._avisoTirante = "EMPUXO: informado assento deslizante E tirante; o tirante fica na lista de peças (sem esforço enquanto o assento desliza).";
    return q;
  }
  function t2Vento(q, G, avisos) {
    var p = G.p, I = G.info, th = Math.atan(p.incl) * 180 / Math.PI, der = { a: p.a, b: p.b, h: I.Hp - p.baseZ, hCumeeira: I.yT(p.b / 2) - p.baseZ, inclinacaoGraus: th, cobertura: "duas-aguas" };
    var geo = ext({ nervuras: "retangulares" }, (q.vento && q.vento.geometria) || {}, der), ent = ext({}, q.vento, { geometria: geo }), key = JSON.stringify(ent);
    if (q._vento && q._ventoKey === key) return q._vento;
    if (!ent.faces) { ent.faces = {}; ["frente", "fundo", "esquerda", "direita"].forEach(function (k) { ent.faces[k] = { fechada: true, vedacao: "misto" }; }); avisos.push("T2: faces do vento não informadas — adotadas as 4 fechadas (vedação mista, permeável)."); }
    var r = VE.calcular(ent, { todasDirecoes: true, obliquos: true });
    if (!r.ok) throw new Error("vento: " + JSON.stringify(r.erros));
    avisos.push("T2: vento com a cobertura \"duas-aguas\" (NBR 6123:2023, Tabela 5) — " + r.casos.length + " casos (4 direções ortogonais × cpi); vento OBLÍQUO NÃO montado: a Tabela 5 não traz coeficientes oblíquos para duas águas (premissa declarada; a abertura dominante e a torção do item 6.6 entram à parte).");
    q._vento = r; q._ventoKey = key; return r;
  }
  function t2Orient(m, L, dx, dy, dz) {
    var ay = Math.abs(dy) / L, ax = Math.abs(dx) / L, s, c;
    /* E4 T2fix C1: só o TIRANTE (barra redonda, sem direção de altura) usa a regra do eixo transversal. BI, BS e CB (inclinação < 48 %) tinham |dy|/L > 0,9 e entravam DEITADOS (h ao longo da cumeeira),
       enquanto a fonte/prancha/IFC/ligações os desenham EM PÉ: a altura h vai sempre no plano vertical da tesoura/do caibro (ver o teste invariante vy × up em test-mad-eng-t2-orient.js). */
    if (ay > 0.9 && m.g === "TI") return [1, 0, 0];
    if (ax > 0.9 && m.g !== "DX" && m.g !== "DV" && m.g !== "DP") { if ((m.g === "T") && m.agua === "F") { s = Math.sqrt(1) ; return [0, 1, 0]; } return [0, 1, 0]; }
    var px = -dz, py = dy, nn = Math.sqrt(px * px + py * py) || 1; px /= nn; py /= nn;
    return py < 0 ? [0, -py, -px] : [0, py, px];
  }
  /** A1 (r13, NBR 7190-1:2022 6.6.2 e 7.1.12): as pontas da diagonal de madeira têm DESLIZAMENTO (Ku = 2/3·Kser dos pinos, em série): flexibilidade L/(E·A) + 1/kDesl, kDesl = n·Ku/2 (duas pontas em série).
   *  O fator f = 1/(1 + E·A/(L·kDesl)) multiplica a área da barra (rigidez axial efetiva); q._slip = { DX|DP: { n, d, Ku, k } } vem de t2SlipDiag (n pelos esforços da análise rígida e pelo piso de rigidez sec.nMin do laço). */
  function t2FatorSlip(q, m, s, E, L) {
    var sl = q._slip && q._slip[m.g === "DV" ? "DX" : m.g]; if (!sl || !(sl.k > 0)) return 1;
    return 1 / (1 + E * s.b * s.h / (L * sl.k));
  }
  function t2SlipDiag(q, sec, ELUrig, perfil) {
    var cl = MM.classe2022(q.classe), pc = perfil("curta"), cL = ML.cfg({ kmod: pc.kmod, kmod1: pc.kmod1, kmod2: pc.kmod2, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" }), out = {};
    ["DX", "DP"].forEach(function (g) {
      if (!sec[g]) return; var F = Math.max(ELUrig[g] || 0, 0.05), pn = ML.pinosAxiais(cL, "diagonal " + g, F, 0.001, sec[g].b, sec[g].h, 0.008), nF = pn && pn.n ? pn.n : 2, d = pn && pn.d ? pn.d : 0.012, n = Math.max(nF, sec[g].nMin || 0), Ku = ML.kuPino(d, cl.rhok, true);
      out[g] = { n: n, nForca: nF, d: d, Ku: Ku, k: n * Ku / 2, F: F };
    });
    return out;
  }
  function t2Montar(q, G, sec, comFV) {
    var p = G.p, I = G.info, mat = MM.classe2022(q.classe), mod = modulos(mat), X0 = p.origem.x, Y0 = p.origem.y, nos = [], barras = [], idn = {}, apoios = [], reg = {}, th = Math.atan(p.incl), cs = Math.cos(th), sn = Math.sin(th);
    function noX(P3, tag) { var key = tag + ":" + P3.map(function (v) { return Math.round(v * 1e4); }).join(","); if (!idn[key]) { idn[key] = { id: "n" + nos.length, x: P3[0] - X0, y: P3[2], z: P3[1] - Y0 }; nos.push(idn[key]); } return idn[key].id; }
    function no(P3) { var key = P3.map(function (v) { return Math.round(v * 1e4); }).join(","); if (!idn[key]) { idn[key] = { id: "n" + nos.length, x: P3[0] - X0, y: P3[2], z: P3[1] - Y0 }; nos.push(idn[key]); } return idn[key].id; }
    var FITA_A = (sec.FT ? sec.FT.b * sec.FT.e : p.contraventamento.fita.b * p.contraventamento.fita.e) * p.contraventamento.fita.aproveitamento, krAll = q._krEf != null ? q._krEf : 1e9;
    function krDe(g) { return (krAll !== null && typeof krAll === "object") ? (krAll[g] != null ? krAll[g] : 1e9) : krAll; }      /* A5: rigidez Kθ da base POR GRUPO de pilar (P, PO, PC) */
    G.membros.forEach(function (m) {
      if ((m.g === "FV" || m.g === "DV") && !comFV) return;      /* as diagonais verticais só entram nos modelos de rigidez e de F1d: na gravidade dividiriam carga entre tesouras (a favor de uma e CONTRA a outra) — o projeto não conta com isso */      /* as diagonais verticais só entram nos modelos de rigidez e de F1d: na gravidade elas dividiriam carga entre tesouras (a favor de uma e CONTRA a outra) — o projeto não conta com isso */
      var d = [m.p1[0] - m.p0[0], m.p1[1] - m.p0[1], m.p1[2] - m.p0[2]], L = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), pts = [m.p0].concat(m.nos || []).concat([m.p1]), tt = [], ps = [];
      pts.forEach(function (P) { var t = ((P[0] - m.p0[0]) * d[0] + (P[1] - m.p0[1]) * d[1] + (P[2] - m.p0[2]) * d[2]) / (L * L); tt.push({ t: t, P: P }); });
      tt.sort(function (u, v) { return u.t - v.t; });
      tt.forEach(function (o, k) { if (!k || (o.t - tt[k - 1].t) * L > 1e-3) ps.push(o); });
      var sg = [], k;
      for (k = 0; k + 1 < ps.length; k++) {
        var A = ps[k].P, B = ps[k + 1].P, mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
        if (m.tracao || m.uni || m.g === "PD" || m.g === "DG") sg.push([A, B]); else { sg.push([A, mid]); sg.push([mid, B]); }
      }
      var vy = t2Orient(m, L, d[0], d[1], d[2]), s = sec[m.g === "DV" ? "DX" : m.g], seg0 = 0;
      // unir meios-vãos: a barra de cada trecho tem 2 elementos; nó do meio já existe como 'mid'
      sg.forEach(function (S, n) {
        var A = S[0], B = S[1], Lb = Math.sqrt(Math.pow(B[0] - A[0], 2) + Math.pow(B[1] - A[1], 2) + Math.pow(B[2] - A[2], 2)), bar = { id: m.id + "#" + n, m: m.id, grupo: m.g, agua: m.agua, i: no(A), j: no(B), E: mod.E, G: mod.G, vy: vy, nElem: (m.tracao || m.uni) ? 1 : 2, pesoEsp: q.pesoMLC, L: Lb, mem: m, ax: [d[0] / L, d[2] / L, d[1] / L] };
        var primeiro = n === 0, ultimo = n === sg.length - 1, lib = {};
        if (m.tracao) {
          bar.secao = m.g === "TI" ? { A: Math.PI * Math.pow(sec.TI.d, 2) / 4, Iz: 1e-12, Iy: 1e-12, J: 1e-12 } : (m.mad ? { A: s.b * s.h * t2FatorSlip(q, m, s, mod.E, L), Iz: 1e-12, Iy: 1e-12, J: 1e-12 } : { A: FITA_A, Iz: 1e-12, Iy: 1e-12, J: 1e-12 });      /* diagonal de MADEIRA do X: só tração (a comprimida é desligada pelo solver, sem crédito de compressão), E da MLC, área da seção do laço */
          if (!m.mad) { bar.E = 2e8; bar.G = 8e7; } bar.tracao = true; bar.pesoEsp = 0; lib = { i: { ry: true, rz: true }, j: { ry: true, rz: true } };
        } else {
          if (m.g === "P" || m.g === "PO" || m.g === "PC") { bar.b = s.b; bar.h = s.h; bar.secao = ret(s.b, s.h); }
          else { bar.b = s.b; bar.h = s.h; bar.secao = ret(s.b, s.h); }
          if (m.pinI && primeiro) lib.i = { ry: true, rz: true };
          if (m.pinJ && ultimo) lib.j = { ry: true, rz: true };      /* caibro: rótula no apoio sobre a cumeeira, nos dois eixos (a versão da rodada 1 liberava só rz e a cumeeira recebia o momento do caibro como torção, +26 % na reação) */
          /* frechal: SEM liberação de torção (liberar nos dois lados de um nó do meio do vão deixa o nó sem rigidez de torção; o frechal recebe a torção dos balanços — a favor) */
        }
        if (m.uni) lib = { i: { ry: true, rz: true }, j: { ry: true, rz: true } };      /* linha do banzo inferior (LB): articulada nos dois eixos em cada tesoura — só esforço axial */
        if (m.artic && !(typeof process !== "undefined" && process.env && process.env.NOARTIC)) { var iv = n >> 1, nIv = ps.length - 1; if (iv >= 1 && iv <= nIv - 2) { if (!(n & 1)) lib.i = ext(lib.i || {}, { ry: true }); else lib.j = ext(lib.j || {}, { ry: true }); } }      /* terça parafusada: flexão horizontal (ry) articulada em cada tesoura nos vãos entre tesouras (o balanço do beiral segue engastado na continuidade do nó: rótula na raiz de balanço é mecanismo); a continuidade vertical (rz) é da própria peça */
        if (lib.i || lib.j) bar.libera = lib;
        /* assento DESLIZANTE (E4 r2): o caibro apoia no frechal por um nó PRÓPRIO (mesma posição) preso em ux (ao longo da parede) e uy (vertical), LIVRE em uz (transversal à parede = abre no plano do caibro):
           sem empuxo e sem flexão horizontal do frechal. O nó é um apoio rígido de solo; a reação dele volta ao frechal como CARGA NODAL (t2ReacaoAssento). Sem elo/calço: o pêndulo de 20 cm da rodada 1
           tinha rigidez geométrica −N/L e, com a sucção da excepcional, zerava a rigidez do nó do frechal (mecanismo em rx do nó X = 12,8 m). */
        if (m.g === "CB" && m.assento === "deslizante") {
          [["i", A], ["j", B]].forEach(function (E) {
            if (Math.abs(E[1][2] - I.Hp) < 1e-6 && (Math.abs(E[1][1]) < 1e-6 || Math.abs(E[1][1] - p.b) < 1e-6)) {
              var nd = noX(E[1], "AS"); bar[E[0]] = nd;
              if (!reg["AS" + nd]) { reg["AS" + nd] = 1; apoios.push({ no: nd, ux: true, uy: true, grupo: "AD", mem: m.id, frechal: no(E[1]) }); }
            }
          });
        }
        barras.push(bar);
      });
      if ((m.g === "P" || m.g === "PC") && p.sistema === "cumeeira") apoios.push({ no: no(m.p1), rx: true, grupo: "FRT", mem: m.id });      /* o frechal e a cumeeira não rolam sobre o pilar (garfo/chapa do topo): sem isso a torção do frechal é mecanismo quando o caibro desliza */
      if (m.g === "P" || m.g === "PO" || m.g === "PC") { var Bn = no(m.p0); apoios.push({ no: Bn, ux: true, uy: true, uz: true, ry: true, rx: krDe(m.g), rz: krDe(m.g), grupo: m.g, mem: m.id }); }
    });
    return { nos: nos, barras: barras, apoios: apoios, G: G, th: th, cs: cs, sn: sn };
  }
  var T2_NORMAL = function (ag, sn, cs) { return ag === "F" ? [0, cs, -sn] : [0, cs, sn]; };
  /** A2: resultante horizontal do vento sobre a estrutura (paredes + componente horizontal da cobertura), T = Fa·e (e = fração × dimensão normal ao vento, NBR 6123:1988 6.6) e o binário nos topos dos 4 pilares de canto */
  function t2Torcao(M, G, cargas, cv, frac) {
    var a = G.p.a, b = G.p.b, porId = {}, Fx = 0, Fz = 0, soma = a * a + b * b, ao0 = (cv.direcao === 0 || cv.direcao === 180), cantos = [];
    M.barras.forEach(function (x) { porId[x.id] = x; if (x.grupo === "P" && (Math.abs(x.mem.p0[0]) < 1e-6 || Math.abs(x.mem.p0[0] - a) < 1e-6) && (Math.abs(x.mem.p0[1]) < 1e-6 || Math.abs(x.mem.p0[1] - b) < 1e-6) && /#1$/.test(x.id)) cantos.push(x); });      /* #1 = metade de cima do pilar (nó do topo) */
    cargas.forEach(function (c) { var x = c.tipo === "barra" ? porId[c.barra] : null; if (!x || !c.q) return; var fr = (c.b == null ? 1 : c.b) - (c.a == null ? 0 : c.a); Fx += c.q[0] * x.L * fr; Fz += c.q[2] * x.L * fr; });
    var Fa = Math.abs(ao0 ? Fx : Fz), e = frac * (ao0 ? b : a); if (!(Fa > 1e-6) || cantos.length !== 4) return null;
    var T = Fa * e, forcas = cantos.map(function (x) { var dx = (Math.abs(x.mem.p0[0] - a) < 1e-6 ? 1 : -1) * a / 2, dz = (Math.abs(x.mem.p0[1] - b) < 1e-6 ? 1 : -1) * b / 2; return { no: x.j, F: [-T * dz / soma, 0, T * dx / soma, 0, 0, 0] }; });
    return { Fa: Fa, e: e, T: T, forcas: forcas };
  }
  function t2Casos(q, M, VT, QCOB, g2s) {
    var G = M.G, p = G.p, I = G.info, a = p.a, b = p.b, PAREDE = { x0: 0, x1: a, y0: 0, y1: b }, cs = M.cs, sn = M.sn, C = [], carr = p.sistema === "tesoura" ? { T: 1, CM: 1, FR: 1 } : { CB: 1 }, DG = q.diagnostico || {};
    var rb = M.barras.filter(function (x) { return carr[x.grupo] && x.mem.ws; }), pil = M.barras.filter(function (x) { return x.grupo === "P" || x.grupo === "PO" || x.grupo === "PC"; });
    var g2 = [], qq = [];
    rb.forEach(function (x) {
      var m = x.mem; g2.push({ tipo: "barra", barra: x.id, q: [0, -g2s * m.ws, 0] });
      if (x.grupo === "CB") qq.push({ tipo: "barra", barra: x.id, q: [0, -QCOB.q * m.wp, 0], projetada: true }); else qq.push({ tipo: "barra", barra: x.id, q: [0, -QCOB.q * m.wp, 0] });
    });
    C.push({ id: "G1", tipo: "G", categoria: "G-insitu", nome: "peso próprio MLC", cargas: [{ tipo: "pesoProprio" }] });
    C.push({ id: "G2", tipo: "G", categoria: "G-insitu", nome: "telha + ripas", cargas: g2 });
    C.push({ id: "Q", tipo: "Q", categoria: "Q-cobertura", nome: "sobrecarga de cobertura", cargas: qq });
    var NS = 3;
    function faces(x) { return x.mem.agua === "R" ? [["F", -0.01, 0.5], ["B", 0.01, 0.5]] : [[x.mem.agua, 0, 1]]; }
    function posBarra(x, f) {
      var A = M.nos.filter(function (n) { return n.id === x.i; })[0], B = M.nos.filter(function (n) { return n.id === x.j; })[0];
      return { A: [A.x, A.z], B: [B.x, B.z] };
    }
    var nodo = {}; M.nos.forEach(function (n) { nodo[n.id] = n; });
    function teto(cv) {
      var cg = [];
      rb.forEach(function (x) {
        var A = nodo[x.i], B = nodo[x.j], m = x.mem, f, s;
        for (s = 0; s < NS; s++) {
          var t0 = s / NS, t1 = (s + 1) / NS, tm = (t0 + t1) / 2, X = A.x + (B.x - A.x) * tm + p.origem.x, Y = A.z + (B.z - A.z) * tm + p.origem.y, fx = [0, 0, 0];
          faces(x).forEach(function (F) {
            var w = (x.grupo === "CB" ? m.wp : m.ws) * F[2], pp = 0, ofs = x.grupo === "CB" ? [[-m.wp / 2 + 0.01, 0], [0, 0], [m.wp / 2 - 0.01, 0]] : [[0, -m.wp / 2 + 0.01], [0, 0], [0, m.wp / 2 - 0.01]];
            ofs.forEach(function (o) { pp += pressaoTeto(PAREDE, cv, X + o[0], Y + o[1] + F[1]); }); pp /= 3;
            var nrm = T2_NORMAL(F[0], sn, cs); fx[0] += -pp * nrm[0] * w; fx[1] += -pp * nrm[1] * w; fx[2] += -pp * nrm[2] * w;
          });
          cg.push({ tipo: "barra", barra: x.id, q: fx, a: t0, b: t1 });
        }
      });
      return cg;
    }
    function paredes(cv, sinal) {
      var cg = [];
      pil.forEach(function (x) {
        var m = x.mem, partes = m.face ? [[m.face, m.s, m.trib]] : [];
        if (m.g === "P" && (Math.abs(m.p0[0]) < 1e-6 || Math.abs(m.p0[0] - a) < 1e-6)) partes.push([Math.abs(m.p0[0]) < 1e-6 ? "frente" : "fundo", m.p0[1], (I.zsOit[1] - I.zsOit[0]) / 2]);
        partes.forEach(function (pt) {
          var pr = pressaoParede(cv, pt[0], pt[1]) * pt[2], v = pt[0] === "esquerda" ? [0, 0, pr] : pt[0] === "direita" ? [0, 0, -pr] : pt[0] === "frente" ? [pr, 0, 0] : [-pr, 0, 0];
          cg.push({ tipo: "barra", barra: x.id, q: v });
        });
      });
      return cg;
    }
    var comW = 0;
    var tors = [];
    VT.casos.forEach(function (cv, n) {
      var eh0 = (/cpi0/.test(cv.id) || (!!cv.obliquo && !DG.semObliquoExc)), cargasW = teto(cv).concat(paredes(cv));
      C.push({ id: "W" + n, tipo: "W", direcao: cv.direcao, nome: cv.nome || cv.id, cargas: cargasW, q: cv.q, cpi0: eh0 }); comW++;
      /* A2 (M13 da T1): TORÇÃO por excentricidade do vento (NBR 6123, 6.6) nos 4 ortogonais com cpi 0: binário nos topos dos 4 pilares de canto, ±; diafragma rígido suposto (como na T1) */
      if (/cpi0/.test(cv.id) && !cv.obliquo && !DG.semTorcao) {
        var tc = t2Torcao(M, G, cargasW, cv, q.vizinhanca ? 0.15 : 0.075);
        if (tc) [1, -1].forEach(function (sg) {
          C.push({ id: "W" + n + (sg > 0 ? "e+" : "e-"), tipo: "W", direcao: cv.direcao, nome: (cv.nome || cv.id) + " + excentricidade " + (sg > 0 ? "+" : "−") + "e", cargas: cargasW.concat(tc.forcas.map(function (f) { return { tipo: "no", no: f.no, F: [sg * f.F[0], 0, sg * f.F[2], 0, 0, 0] }; })), q: cv.q, cpi0: false, torcao: true });
          if (sg > 0) tors.push({ caso: "W" + n, direcao: cv.direcao, Fa: tc.Fa, e: tc.e, T: tc.T });
        });
      }
    });
    C.tors = tors;
    var dominante = function (dcp, sg) {
      var qd = sg * dcp.p, cd = [];
      rb.forEach(function (x) {
        var m = x.mem, Pm = [(m.p0[0] + m.p1[0]) / 2, (m.p0[1] + m.p1[1]) / 2]; if (x.grupo !== "CB" && (Pm[1] < -1e-6 || Pm[1] > b + 1e-6)) return;
        var A = nodo[x.i], B = nodo[x.j]; if (A.z + p.origem.y < -0.01 || B.z + p.origem.y < -0.01 || A.z + p.origem.y > b + 0.01 || B.z + p.origem.y > b + 0.01) return;
        if (A.x + p.origem.x < -0.01 || B.x + p.origem.x < -0.01 || A.x + p.origem.x > a + 0.01 || B.x + p.origem.x > a + 0.01) return;          /* a pressão interna só age no telhado SOBRE a planta fechada (beirais ficam de fora) */
        faces(x).forEach(function (F) { var nrm = T2_NORMAL(F[0], sn, cs), w = (x.grupo === "FR" ? I.lp / 2 : (x.grupo === "CB" ? m.wp : m.ws)) * F[2]; cd.push({ tipo: "barra", barra: x.id, q: [0, qd * nrm[1] * w, qd * nrm[2] * w] }); });
      });
      pil.forEach(function (x) {
        var m = x.mem, ps = m.face ? [[m.face, m.trib]] : []; if (m.g === "P" && (Math.abs(m.p0[0]) < 1e-6 || Math.abs(m.p0[0] - a) < 1e-6)) ps.push([Math.abs(m.p0[0]) < 1e-6 ? "frente" : "fundo", (I.zsOit[1] - I.zsOit[0]) / 2]);
        ps.forEach(function (pt) { var v = pt[0] === "esquerda" ? [0, 0, -qd * pt[1]] : pt[0] === "direita" ? [0, 0, qd * pt[1]] : pt[0] === "frente" ? [-qd * pt[1], 0, 0] : [qd * pt[1], 0, 0]; cd.push({ tipo: "barra", barra: x.id, q: v }); });
      });
      return cd;
    };
    var dcp = VE.casoAberturaDominante(VT.q);
    C.push({ id: "DCPI", tipo: "E", nome: dcp.nome, cargas: dominante(dcp, 1) });
    var dcs = DG.semDominanteSuccao ? null : VE.casoAberturaDominanteSuccao(VT, VT.q);
    if (dcs) C.push({ id: "DCPIS", tipo: "E", nome: dcs.nome, cargas: dominante(dcs, -1), dcpi: dcs.cpi });
    return C;
  }
  /* diagnóstico do nó instável: posição e barras que chegam nele (a mensagem do solver só traz o id) */
  function t2DiagNo(M, motivo) {
    var m = /nó (\S+),/.exec(String(motivo || "")); if (!m) return ""; var n = M.nos.filter(function (x) { return x.id === m[1]; })[0]; if (!n) return "";
    var bs = M.barras.filter(function (b) { return b.i === n.id || b.j === n.id; }).map(function (b) { return b.id; });
    return " [nó " + n.id + " em X=" + n.x.toFixed(2) + " Y=" + n.z.toFixed(2) + " Z=" + n.y.toFixed(2) + "; barras: " + bs.join(", ") + "]";
  }
  /* reação dos apoios deslizantes dos caibros (primeira ordem, caso a caso) devolvida ao frechal como carga nodal: o frechal recebe o peso da cobertura sem prender o caibro na transversal */
  function t2ReacaoAssento(M, CS) {
    var rol = M.apoios.filter(function (a) { return a.grupo === "AD"; }); if (!rol.length) return null;
    var comb = CS.map(function (c) { var f = {}; f[c.id] = 1; return { id: "R_" + c.id, fatores: f }; });
    var r = AN.analisar({ nos: M.nos, barras: M.barras, apoios: M.apoios, casos: CS.map(function (c) { return { id: c.id, cargas: c.cargas }; }) }, { combinacoes: comb, estacoes: 3, comPCG: true });
    if (!r.ok) throw new Error("análise (reação do assento): " + (r.motivo || JSON.stringify(r.avisos)) + t2DiagNo(M, r.motivo));
    var tot = {};
    CS.forEach(function (c) { var rc = r.combinacoes["R_" + c.id], t = [0, 0, 0]; if (!rc) return; rol.forEach(function (a) { var R = rc.reacoes[a.no]; if (!R) return; t[0] += R[0]; t[1] += R[1]; t[2] += R[2]; c.cargas.push({ tipo: "no", no: a.frechal, F: [-R[0], -R[1], -R[2], 0, 0, 0] }); }); tot[c.id] = t; });
    return tot;
  }
  /* ---------- E4 T2fix C2/C3: contraventamento da tesoura (NBR 7190-1:2022, 6.6.2 a 6.6.4) ---------- */
  /** nós homólogos de cada tesoura: BS = nós do banzo superior onde as terças apoiam (k = 1…2nH−1, inclui a cumeeira); BI = nós internos do banzo inferior */
  function t2Familias(M, G) {
    var p = G.p, I = G.info, X0 = p.origem.x, Y0 = p.origem.y, mapa = {}, out = { BS: [], BI: [] };
    M.nos.forEach(function (n) { mapa[Math.round(n.x * 1e4) + "," + Math.round(n.y * 1e4) + "," + Math.round(n.z * 1e4)] = n.id; });
    function id(X, Ya, Zv) { return mapa[Math.round((X - X0) * 1e4) + "," + Math.round(Zv * 1e4) + "," + Math.round((Ya - Y0) * 1e4)]; }
    out.linhas = [];
    for (var k = 1; k < 2 * I.nH; k++) { var z = k * I.dz, L1 = { g: "BS", k: k, nos: [] }, L2 = { g: "BI", k: k, nos: [] }; I.xs.forEach(function (x) { var a = id(x, z, I.yT(z)), b = id(x, z, I.Hp); if (a) { out.BS.push(a); L1.nos.push(a); } if (b) { out.BI.push(b); L2.nos.push(b); } }); out.linhas.push(L1, L2); }
    return out;
  }
  /** K_br,1,min = 2·αm·π²·E0,ef·I2/L1³, αm = 1 + cos(π/m) (6.6.2, Tabela 9); Eef em MPa, I2 em m⁴, L1 em m → kN/m */
  function t2KbrMin(Eef, I2, L1, m) { return 2 * (1 + Math.cos(Math.PI / m)) * Math.PI * Math.PI * Eef * 1e3 * I2 / Math.pow(L1, 3); }
  /** rigidez lateral (X) que o contraventamento oferece a cada nó: 1 kN em +X em TODOS os nós homólogos de todas as tesouras ao mesmo tempo (modo coletivo, o que flamba junto); K = 1 / u do pior nó */
  function t2Kmedido(M, fam) {
    var casos = [], comb = [], nl = fam.linhas.length;
    fam.linhas.forEach(function (L, k) { casos.push({ id: "K" + k, cargas: L.nos.map(function (n) { return { tipo: "no", no: n, F: [1, 0, 0, 0, 0, 0] }; }) }); var f = {}; f["K" + k] = 1; comb.push({ id: "K" + k, fatores: f }); });
    var r = AN.analisar({ nos: M.nos, barras: M.barras, apoios: M.apoios, casos: casos }, { combinacoes: comb, estacoes: 3, comPCG: false });
    if (!r.ok) throw new Error("análise (rigidez do contraventamento): " + (r.motivo || JSON.stringify(r.avisos)));
    var o = { BS: 1e12, BI: 1e12, linhas: [] };
    fam.linhas.forEach(function (L, k) { var d = r.combinacoes["K" + k].desloc, u = 0; L.nos.forEach(function (n) { u = Math.max(u, Math.abs((d[n] || [0])[0])); }); var K = u > 1e-12 ? 1 / u : 1e12; o[L.g] = Math.min(o[L.g], K); o.linhas.push({ g: L.g, k: L.k, K: K }); });
    return o;
  }
  function t2Rodar(proj, sec) {
    var q = proj._pad2; if (!q || proj._pad2Key !== JSON.stringify(proj, function (k, v) { return (k.charAt(0) === "_" && k !== "") ? undefined : v; })) { q = proj._pad2 = t2Padrao(proj); proj._pad2Key = JSON.stringify(proj, function (k, v) { return (k.charAt(0) === "_" && k !== "") ? undefined : v; }); }
    q._krEf = proj._krBase != null ? proj._krBase : q.krBase;
    sec = JSON.parse(JSON.stringify(sec)); if (!sec.RP) sec.RP = { b: 0.05, h: 0.05 }; if (!sec.LB) sec.LB = { b: 0.10, h: 0.10 }; if (!sec.FT) { var fp0 = q.params.contraventamento.fita; sec.FT = { b: fp0.b, e: fp0.e }; } if (q.params.contraventamento.tipo !== "fita" && !sec.DX) sec.DX = { b: 0.08, h: 0.12 }; if (q.params.contraventamento.tipo !== "fita" && !q.params.vedacaoRigida && !sec.DP) sec.DP = { b: 0.12, h: 0.12 };      /* DP = diagonais de madeira dos painéis das paredes (E4 r10): padrão; vedacaoRigida as dispensa */      /* madeira: sec.DX = diagonais das águas/verticais; sec.FT passa a valer só para a fita das PAREDES (FP), que fazem parte do caminho de rigidez até o solo */
    var G = MT.T2.geometria(q.params), p = G.p, I = G.info, M = t2Montar(q, G, sec), perfil = perfilFn(q), CL = q.classe, mod0 = modulos(MM.classe2022(q.classe)), avisos = [];
    if (q._avisoTirante) avisos.push(q._avisoTirante);
    if (MM.classe2022(q.classe).conferir) avisos.push("M6: os valores da classe " + q.classe + " (EN 14080 Tab. 5) ainda NÃO foram conferidos no PDF — só o GL24h foi.");      /* A3 (a mesma recusa da T1) */
    var QCOB = CA.sobrecargaCobertura(p.incl * 100, { empocamentoVerificado: !!q.empocamentoVerificado }), g2s = p.telha.peso + q.cargas.outros;
    if (!QCOB.ok) throw new Error("sobrecarga de cobertura: " + QCOB.motivo);
    (QCOB.avisos || []).forEach(function (t) { avisos.push(t); });
    var VT = t2Vento(q, G, avisos), CS = t2Casos(q, M, VT, QCOB, g2s), reacAssento = null;
    /* as cargas totais (conta à mão) são lidas ANTES de somar as cargas nodais do assento */
    /* conferência: força TOTAL (kN) de cada caso de carga em barras (para a conta à mão do T2-REFERENCIA.md) */
    var porB = {}; M.barras.forEach(function (b) { porB[b.id] = b; });
    var cargasTot = {}; CS.forEach(function (c) { var t = [0, 0, 0]; c.cargas.forEach(function (k) { var b = k.tipo === "barra" ? porB[k.barra] : null; if (!b || !k.q) return; var fr = (k.b == null ? 1 : k.b) - (k.a == null ? 0 : k.a), pj = 1; if (k.projetada) { var ax = b.ax; pj = Math.sqrt(ax[0] * ax[0] + ax[2] * ax[2]); } for (var z = 0; z < 3; z++) t[z] += k.q[z] * b.L * fr * pj; }); cargasTot[c.id] = t; });
    reacAssento = p.sistema === "cumeeira" && p.cumeeira.assento === "deslizante" ? t2ReacaoAssento(M, CS) : null;
    if (CS.tors && CS.tors.length) avisos.push("M13: torção por excentricidade do vento (NBR 6123 6.6, e = " + (q.vizinhanca ? "15" : "7,5") + " % da dimensão normal ao vento) montada como binário nos topos dos 4 pilares de canto, ± (" + CS.tors.length + " direções; T máx. = " + Math.max.apply(null, CS.tors.map(function (t) { return t.T; })).toFixed(2).replace(".", ",") + " kN·m); diafragma rígido suposto (como na T1; a cobertura tem contraventamento em X nos vãos extremos).");
    var normais = CS.filter(function (c) { return c.tipo !== "E"; });
    var combs = CA.combinacoes(normais.map(function (c) { return { id: c.id, tipo: c.tipo, categoria: c.categoria, direcao: c.direcao, nome: c.nome }; }), { nocional: true, segundaOrdem: true, nocionalDirecoes: [[1, 0, 0], [0, 0, 1]] });
    var elu = combs.filter(function (c) { return c.tipo === "ELU"; });
    CS.filter(function (c) { return c.tipo === "W" && c.cpi0; }).forEach(function (c) { CS.filter(function (d) { return d.tipo === "E"; }).forEach(function (dc) { var f = { G1: 1, G2: 1 }; f[c.id] = 1; f[dc.id] = 1; elu.push({ id: "EXC_" + c.id + "_" + dc.id, nome: "excepcional: " + c.nome + " + " + dc.nome, tipo: "ELU", fatores: f, segundaOrdem: !(q.diagnostico && q.diagnostico.semSegundaOrdemExc) }); }); });
    var modelo = { nos: M.nos, barras: M.barras, apoios: M.apoios, casos: CS.map(function (c) { return { id: c.id, cargas: c.cargas }; }) };
    var r = AN.analisar(modelo, { combinacoes: elu, estacoes: 3, comPCG: true });
    if (!r.ok) throw new Error("análise: " + (r.motivo || JSON.stringify(r.avisos)) + t2DiagNo(M, r.motivo));
    /* A1 (r13): análise RÍGIDA → esforço nas diagonais de madeira → n de pinos → M refeito COM o deslizamento Ku em série (a análise final, o K_br,1 e a F1d usam este modelo) */
    q._slip = null; var slipInfo = null;
    if (q.params.contraventamento.tipo !== "fita" && (sec.DX || sec.DP) && !q._semSlip) {
      var fRig = { DX: 0, DP: 0 }, KREF0 = perfil("curta").kmod;
      elu.forEach(function (cb0) { var rc0 = r.combinacoes[cb0.id]; if (!rc0) return; var FK0 = KREF0 / perfil(durClasse(cb0)).kmod; M.barras.forEach(function (b0) { if (b0.grupo !== "DX" && b0.grupo !== "DP") return; var es0 = rc0.barras[b0.id] && rc0.barras[b0.id].estacoes; if (es0) es0.forEach(function (e0) { fRig[b0.grupo] = Math.max(fRig[b0.grupo], Math.max(0, e0.N) * FK0); }); }); });
      slipInfo = t2SlipDiag(q, sec, fRig, perfil); q._slip = slipInfo;
      M = t2Montar(q, G, sec); modelo = { nos: M.nos, barras: M.barras, apoios: M.apoios, casos: modelo.casos };
      r = AN.analisar(modelo, { combinacoes: elu, estacoes: 3, comPCG: true });
    }
    if (!r.ok) throw new Error("análise: " + (r.motivo || JSON.stringify(r.avisos)) + t2DiagNo(M, r.motivo));
    /* C2/C3: rigidez K_br,1 medida × exigida (6.6.2). Atendida → L0 fora do plano = distância entre travamentos (BS: lp; BI: dz). Não atendida → o código mantém L0 = L1 (distância entre nós), MAS o aviso C3 BLOQUEIA a entrega e o laço engrossa as diagonais/fita até o K_br,1 atender: o L0 não provado nunca chega à entrega (B1 da revisão final: o comentário antigo falava em L0 = heel→cumeeira / vão b, que o código não usa). */
    var CTV = null, Mf = null;
    if (p.sistema === "tesoura") {
      Mf = t2Montar(q, G, sec, true); var fam = t2Familias(Mf, G), Kb = t2Kmedido(Mf, fam), EefRef = MD.perfilEResist(CL, perfil("curta")).f.Eef;
      CTV = { E0ef: EefRef, BS: { m: I.nH, L1: I.lp, Kbr: Kb.BS }, BI: { m: 2 * I.nH, L1: I.dz, Kbr: Kb.BI }, nos: { BS: fam.BS.length, BI: fam.BI.length } };
      ["BS", "BI"].forEach(function (g) { var c = CTV[g], sg = sec[g]; c.I2 = sg.h * Math.pow(sg.b, 3) / 12; c.Kmin = t2KbrMin(EefRef, c.I2, c.L1, c.m); c.ok = c.Kbr >= c.Kmin; c.L0z = c.L1; c.razao = c.Kmin / c.Kbr; });
      CTV.razao = Math.max(CTV.BS.razao, CTV.BI.razao); CTV.ok = CTV.BS.ok && CTV.BI.ok; CTV.slip = slipInfo; CTV.semSlip = !slipInfo;
      if (!CTV.ok) avisos.push("C3: a rigidez K_br,1 do contraventamento (NBR 7190-1:2022, 6.6.2) NÃO atende: banzo superior " + Math.round(CTV.BS.Kbr) + " × " + Math.round(CTV.BS.Kmin) + " kN/m, banzo inferior " + Math.round(CTV.BI.Kbr) + " × " + Math.round(CTV.BI.Kmin) + " kN/m — o comprimento de flambagem fora do plano (distância entre nós travados) NÃO está provado" + (slipInfo ? " (rigidez com o DESLIZAMENTO dos pinos em série, Ku = 2/3·Kser, 7.1.12: DX " + (slipInfo.DX ? slipInfo.DX.n + " pinos Ø" + Math.round(slipInfo.DX.d * 1000) : "—") + ", DP " + (slipInfo.DP ? slipInfo.DP.n + " pinos Ø" + Math.round(slipInfo.DP.d * 1000) : "—") + " por ponta)" : "") + "; aumentar a fita/chapa, os pinos ou o contraventamento.");
    }
    modeloSemFalha(r.avisos);
    var KREF = perfil("curta").kmod, FK = 1, res = { grupos: {}, esbeltez: {}, reacoes: {}, reacoesAssento: {}, esf: {}, combinacoes: elu.length, kmodRef: KREF, kmod1Ref: perfil("curta").kmod1, kmod2Ref: perfil("curta").kmod2, avisos: avisos, tracoes: { fita: 0, parede: 0, tirante: 0, vert: 0 }, tirante: { N: 0 }, esf: {} };
    /* E4: esbeltez (λ acima do limite) por grupo, lida do campo do resultado da verificação — o laço NÃO depende do η sentinela (1,0001) do maddim7190. eixo "b" = eixo fraco (plano de b). */
    function regEsb(gp, v) {
      if (!v || !v.esbelto) return; var lam = v.lambda, lx = Array.isArray(lam) ? lam[0] : lam, ly = Array.isArray(lam) ? lam[1] : lam, mx = Math.max(lx || 0, ly || 0), a = res.esbeltez[gp];
      if (!a || mx > a.lambdaMax) res.esbeltez[gp] = { esbelto: true, eixo: (ly || 0) >= (lx || 0) ? "b" : "h", lambdaMax: mx };
    }
    function regG(gp, eta, onde, comb, gov) { if (!res.grupos[gp] || eta > res.grupos[gp].eta) res.grupos[gp] = { eta: eta, onde: onde, comb: comb, governa: gov }; }
    var Lcol = {}, flamb = null;
    var topoTravado = !!(CTV && CTV.ok && (sec.DP || (q.params.contraventamento && q.params.contraventamento.tipo === "fita")));      /* E4 r11: o K_br,1 medido (cobertura + paredes DP/FP no modelo) atende; sem DP/FP (vedação rígida informada) ou sem K verificado: SEM crédito */
    res.creditoTopo = { aplicado: topoTravado, motivo: topoTravado ? "K_br,1 do contraventamento da cobertura e das paredes VERIFICADO (banzo superior " + Math.round(CTV.BS.Kbr) + " × " + Math.round(CTV.BS.Kmin) + " kN/m; banzo inferior " + Math.round(CTV.BI.Kbr) + " × " + Math.round(CTV.BI.Kmin) + " kN/m): topo do pilar travado lateralmente, L0 pelo modelo engastado-apoiado (base semirrígida pela ligação)" : (CTV ? "K_br,1 NÃO atende ou paredes sem diagonais (vedação rígida informada): SEM crédito de topo travado — pilar em balanço com mola de base" : "sistema cumeeira: sem banzos a verificar por K_br,1 (6.6.2) — SEM crédito de topo travado (pilar em balanço com mola de base)") };
    avisos.push("E4 r11: " + res.creditoTopo.motivo + ".");
    function betas(b) {
      var P = sec[b.grupo], Cb = (q._krEf !== null && typeof q._krEf === "object") ? (q._krEf[b.grupo] != null ? q._krEf[b.grupo] : 1e9) : (q._krEf != null ? q._krEf : 1e9), EIh = mod0.E * P.b * Math.pow(P.h, 3) / 12, EIb = mod0.E * P.h * Math.pow(P.b, 3) / 12, key = b.grupo + "|" + b.mem.id;
      if (!Lcol[key]) { var Lb = Math.abs(b.mem.p1[2] - b.mem.p0[2]), KtMin = (Math.PI / 3) * Math.tan(Math.PI / 3) / Lb;      /* E4 r10: a base é SEMPRE projetada com Kθ ≥ KthetaMin (t2Base) da seção ATUAL do pilar; sem isto o kr da volta anterior (seção menor) ficava mole demais para o pilar que o laço acabava de engrossar e o laço corria atrás da própria cauda */
        var fb = topoTravado ? function (C, EI) { return MD.betaEngastadoApoiado({ C: C, EI: EI, L: Lb }).beta; } : function (C, EI) { return MD.betaFlambagemMola({ C: C, EI: EI, L: Lb }).beta; };      /* E4 r11 (decisão 2): contraventamento da cobertura E das paredes VERIFICADO (K_br,1) → topo do pilar travado lateralmente: engastado-apoiado (base semirrígida pela ligação); senão, balanço com mola */
        Lcol[key] = [fb(Math.max(Cb, KtMin * EIh), EIh), fb(Math.max(Cb, KtMin * EIb), EIb), Lb]; }
      return Lcol[key];
    }
    /* viga de cumeeira multiapoiada: vão de flambagem/lateral = maior intervalo entre apoios (oitões + pilares intermediários) */
    var apCM = [0, p.a].concat(M.barras.filter(function (b) { return b.grupo === "PC"; }).map(function (b) { return b.mem.p0[0]; })).sort(function (u, v) { return u - v; }), vaoCM = 0;
    apCM.forEach(function (x, k) { if (k && x - apCM[k - 1] > vaoCM) vaoCM = x - apCM[k - 1]; });
    /* M5 (r14): F⊥ do fendilhamento (F90, 7.1.1) = RESULTANTE, perpendicular ao banzo, das forças das almas (PD e DG) que a chapa entrega ao nó do banzo, por combinação (antes: só a força do montante, sozinha). Soma vetorial no nó com o esforço axial de cada alma (N em tração puxa o nó para o outro extremo da barra); o que sobra ⊥ ao banzo é a reação da terça no BS e ≈ 0 no BI sem carga externa. */
    var nd0 = {}, nBanzo = {}, f90Perp = { BS: 0, BI: 0 }; M.nos.forEach(function (n) { nd0[n.id] = n; });
    M.barras.forEach(function (b) { if (b.grupo !== "BS" && b.grupo !== "BI") return; var A = nd0[b.i], B = nd0[b.j], Lx = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2) + Math.pow(B.z - A.z, 2)) || 1; [b.i, b.j].forEach(function (n) { if (!nBanzo[n]) nBanzo[n] = { g: b.grupo, t: [(B.x - A.x) / Lx, (B.y - A.y) / Lx, (B.z - A.z) / Lx] }; }); });
    var nEluDiag = {};      /* A2 (r13): máximo da tração ELU de cada diagonal de madeira, somado depois à F1d = Nd/150 (6.6.4: "os seus efeitos devem ser acrescidos") */
    var ESF_G = { BS: 1, BI: 1, PD: 1, DG: 1, T: 1, CM: 1, CB: 1, DX: 1, DP: 1, LB: 1 };
    var spanX = p.a / I.nCol, travB = p.cobertura.travBaixo;
    elu.forEach(function (cb) {
      var rc = r.combinacoes[cb.id]; if (!rc) return; var car = durClasse(cb), pf = perfil(car), fnd = {}; FK = KREF / pf.kmod;
      M.barras.forEach(function (b) {
        var es = rc.barras[b.id] && rc.barras[b.id].estacoes; if (!es) return;
        var g = b.grupo;
        if (g === "AD") return;
        if (ESF_G[g]) { var ac = res.esf[g] || (res.esf[g] = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }); es.forEach(function (e) { var nt = Math.max(0, e.N), nc = Math.max(0, -e.N), vv = hyp(e.Vy, e.Vz); ac.Nt = Math.max(ac.Nt, nt); ac.Nc = Math.max(ac.Nc, nc); ac.V = Math.max(ac.V, vv); ac.NtEq = Math.max(ac.NtEq, nt * FK); ac.NcEq = Math.max(ac.NcEq, nc * FK); ac.VEq = Math.max(ac.VEq, vv * FK); }); }
        if (g === "PD" || g === "DG") [[b.i, es[0].N, b.j], [b.j, es[es.length - 1].N, b.i]].forEach(function (q9) { if (!nBanzo[q9[0]]) return; var a9 = nd0[q9[0]], o9 = nd0[q9[2]], L9 = Math.sqrt(Math.pow(o9.x - a9.x, 2) + Math.pow(o9.y - a9.y, 2) + Math.pow(o9.z - a9.z, 2)) || 1, f9 = fnd[q9[0]] || (fnd[q9[0]] = [0, 0, 0]); f9[0] += q9[1] * (o9.x - a9.x) / L9; f9[1] += q9[1] * (o9.y - a9.y) / L9; f9[2] += q9[1] * (o9.z - a9.z) / L9; });
        if (g === "DX" || g === "DP") es.forEach(function (e0) { nEluDiag[b.id] = Math.max(nEluDiag[b.id] || 0, Math.max(0, e0.N)); });
        if (g === "LB") { es.forEach(function (e) { var sL = sec.LB, vL = MD.barra2022(MD.deAnalise(e, { b: sL.b, h: sL.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pf })); regG("LB", vL.eta, b.id + "@" + e.x.toFixed(2), cb.id + " " + car, vL.governa); regEsb("LB", vL); }); return; }      /* M3 (r14): a linha LB do banzo inferior é verificada TAMBÉM no ELU (Nt/Nc que leva o vento do oitão ao contraventamento), além do caso F1d; o esforço entra na ligação LB–BI (CV-3) */
        if (g === "FX" || g === "FP" || g === "FV") { var kt = g === "FX" ? "fita" : (g === "FP" ? "parede" : "vert"); es.forEach(function (e) { res.tracoes[kt] = Math.max(res.tracoes[kt] || 0, e.N); }); return; }
        if (g === "TI") { es.forEach(function (e) { res.tirante.N = Math.max(res.tirante.N, e.N); }); return; }
        es.forEach(function (e) {
          var v = null, s = sec[g], base = { b: b.b, h: b.h, classe: CL, perfil: pf };
          if (g === "P" || g === "PO" || g === "PC") { var bt = betas(b); v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: bt[0] * bt[2], L0z: bt[1] * bt[2], L1: 0.01, classe: CL, perfil: pf })); }
          else if (g === "T" || g === "CM" || g === "FR") {
            var vao = g === "FR" ? spanX : (b.mem.nos && b.mem.nos.length ? spanX : b.mem.p1[0] - b.mem.p0[0]); if (g === "CM" && p.sistema === "cumeeira") vao = vaoCM;
            var bal = b.L; v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: vao, L0z: vao, L1: MD.L1PorBorda(e.Mz, { cima: 0.5, baixo: travB || Math.min(vao, 2) }), classe: CL, perfil: pf }));
          }
          else if (g === "CB") { var Lr = (p.b / 2) * I.sc; v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: Lr, L0z: 0.5, L1: MD.L1PorBorda(e.Mz, { cima: 0.5, baixo: travB || Lr / 2 }), classe: CL, perfil: pf })); }
          else if (g === "BS") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: I.lp, L0z: CTV ? CTV.BS.L0z : I.lp, L1: CTV ? CTV.BS.L0z : I.lp, classe: CL, perfil: pf })); }
          else if (g === "BI") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: I.dz, L0z: CTV ? CTV.BI.L0z : p.b, L1: CTV ? CTV.BI.L0z : p.b, classe: CL, perfil: pf })); }
          else if (g === "PD" || g === "DG" || g === "DX" || g === "DP") { v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pf })); }      /* DX (contraventamento de madeira): sem crédito do cruzamento — L0 = comprimento da diagonal nos dois eixos */
          if (v) { regG(g, v.eta, b.id + "@" + e.x.toFixed(2), cb.id + " " + car, v.governa); regEsb(g, v); }
        });
      });
      Object.keys(fnd).forEach(function (n9) { var nb = nBanzo[n9], f9 = fnd[n9], d9 = f9[0] * nb.t[0] + f9[1] * nb.t[1] + f9[2] * nb.t[2], pr = Math.sqrt(Math.pow(f9[0] - d9 * nb.t[0], 2) + Math.pow(f9[1] - d9 * nb.t[1], 2) + Math.pow(f9[2] - d9 * nb.t[2], 2)) * FK; if (pr > f90Perp[nb.g]) f90Perp[nb.g] = pr; });
      M.apoios.forEach(function (ap) {
        var R = rc.reacoes[ap.no]; if (!R) return;
        if (ap.grupo === "FRT") { res.frt = Math.max(res.frt || 0, Math.abs(R[3])); return; }      /* A4: momento de torção do frechal que o apoio fictício FRT absorve */
        if (ap.grupo === "AD") { var oa = res.reacoesAssento[ap.no] || (res.reacoesAssento[ap.no] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, mem: ap.mem, x: 0 }); oa.Nmax = Math.max(oa.Nmax, R[1]); oa.Nmin = Math.min(oa.Nmin, R[1]); oa.Hmax = Math.max(oa.Hmax, Math.abs(R[0])); return; }
        var o = res.reacoes[ap.no] || (res.reacoes[ap.no] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, Mmax: 0, NminEq: 1e9, HmaxEq: 0, grupo: ap.grupo, mem: ap.mem });
        o.Nmax = Math.max(o.Nmax, R[1]); o.Nmin = Math.min(o.Nmin, R[1]); o.Hmax = Math.max(o.Hmax, hyp(R[0], R[2])); o.Mmax = Math.max(o.Mmax, hyp(R[3], R[5]));
        o.NminEq = Math.min(o.NminEq, R[1] * (R[1] < 0 ? FK : 1)); o.HmaxEq = Math.max(o.HmaxEq, hyp(R[0], R[2]) * FK);
      });
    });
    if (res.frt != null) { var mBase = 0; Object.keys(res.reacoes).forEach(function (k) { mBase = Math.max(mBase, res.reacoes[k].Mmax); });
      if (res.frt > Math.max(0.01 * mBase, 0.05)) avisos.push("A4/T2: RECUSADO — o garfo do topo do pilar (apoio fictício FRT) absorve " + res.frt.toFixed(2).replace(".", ",") + " kN·m de torção do frechal, mais de 1 % do momento de base (" + mBase.toFixed(2).replace(".", ",") + " kN·m), e o modelo não leva esse momento ao pilar nem à ligação CP-4: modelar o garfo como mola de rotação ou prender a torção do frechal por outro meio."); }
    if (M.barras.some(function (b) { return b.grupo === "TI"; })) { var As = Math.PI * Math.pow(sec.TI.d, 2) / 4; res.grupos.TI = { eta: res.tirante.N / (As * 250e3 / 1.1), onde: "tirante", comb: "ELU", governa: "tração do aço (fy 250 MPa, γ 1,1)" }; res.tirante.Nrd = As * 250e3 / 1.1; }
    /* A1: compressão ⊥ às fibras nos apoios (6.3.3): o laço cresce a LARGURA (b) do banzo inferior / frechal / viga de cumeeira até o apoio fechar (a verificação final está em madligacoes.pacoteT2) */
    (function () {
      var cl = MM.classe2022(CL), kmL = perfil("longa").kmod, ap = {}, Rp = 0, Rc = 0, Ra = 0;
      function fc90(aCm) { var an = ML.alfaN(aCm); return Math.min(cl.fc90k * kmL / 1.4 * an, 0.25 * cl.fc0k * kmL / 1.4 * an); }
      function et(R, area, aCm) { return R > 0 ? 1.03 * R / area / 1000 / fc90(aCm) : 0; }      /* 3 % de folga: a reação muda ~0,5 % quando a base passa a ter a rigidez calculada */
      Object.keys(res.reacoes).forEach(function (k) { var o = res.reacoes[k]; if (o.grupo === "PC") Rc = Math.max(Rc, o.Nmax); else Rp = Math.max(Rp, o.Nmax); });
      Object.keys(res.reacoesAssento || {}).forEach(function (k) { Ra = Math.max(Ra, res.reacoesAssento[k].Nmax); });
      if (p.sistema === "tesoura") ap.FR = Math.max(et(Rp, sec.BI.b * sec.FR.b, sec.BI.b * 100), et(Rp, sec.FR.b * sec.P.b, sec.P.b * 100));      /* só o frechal cresce: alargar o banzo inferior para o apoio multiplicaria o K_br,1 exigido (∝ b³) */
      else { ap.CM = et(Rc, sec.CM.b * sec.PC.b, sec.PC.b * 100); ap.FR = et(Ra, 0.20 * sec.FR.b, 20); }
      res.apoioEta = ap; Object.keys(ap).forEach(function (g) { if (ap[g] > 1 + 1e-9) res.esbeltez[g] = { esbelto: true, eixo: "b", lambdaMax: 0, apoio: true }; });
    })();
    /* C3 (6.6.2 e 6.6.4, Figura 6): em cada nó do banzo comprimido age uma força transversal F1d = Nd/150 (Nd = compressão de cálculo do banzo). Caso próprio, linear, todos os nós no mesmo sentido (o pior): verifica as linhas LB,
       a terça (axial somado à compressão que já tem) e dá o esforço nas fitas (águas e vertical), que entra na ligação da fita. Fd,mín = (2/3)·n·F1d é o que o contraventamento de extremidade tem de carregar por linha de nós. */
    if (CTV) {
      var pfF = perfil("curta"), F1 = { BS: (res.esf.BS ? res.esf.BS.Nc : 0) / 150, BI: (res.esf.BI ? res.esf.BI.Nc : 0) / 150 }, cgF = [], nT = I.xs.length;
      fam.BS.forEach(function (n) { cgF.push({ tipo: "no", no: n, F: [F1.BS, 0, 0, 0, 0, 0] }); }); fam.BI.forEach(function (n) { cgF.push({ tipo: "no", no: n, F: [F1.BI, 0, 0, 0, 0, 0] }); });
      var rF = AN.analisar({ nos: Mf.nos, barras: Mf.barras, apoios: Mf.apoios, casos: [{ id: "F1D", cargas: cgF }] }, { combinacoes: [{ id: "F1D", fatores: { F1D: 1 } }], estacoes: 3, comPCG: false });
      if (!rF.ok) throw new Error("análise (F1d do contraventamento): " + (rF.motivo || JSON.stringify(rF.avisos)));
      modeloSemFalha(rF.avisos);
      var mxF = { FX: 0, FV: 0, T: 0, LBc: 0, LBt: 0 }, cF = rF.combinacoes.F1D;
      Mf.barras.forEach(function (b) {
        var es = cF.barras[b.id] && cF.barras[b.id].estacoes; if (!es) return; var g = b.grupo;
        if (g === "FX" || g === "FV") es.forEach(function (e) { mxF[g] = Math.max(mxF[g], e.N); });
        else if (g === "DX" || g === "DV" || g === "DP") es.forEach(function (e) { var kk = g === "DX" ? "DXn" : (g === "DP" ? "DPn" : "DVn"), gs = g === "DP" ? "DP" : "DX", sD = sec[gs], eT = ext({}, e, { N: Math.abs(e.N) + (nEluDiag[b.id] || 0) }); mxF[kk] = Math.max(mxF[kk] || 0, eT.N); var v = MD.barra2022(MD.deAnalise(eT, { b: sD.b, h: sD.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pfF })); regG(gs, v.eta, b.id + "@" + e.x.toFixed(2), "F1d", v.governa); regEsb(gs, v); });
        else if (g === "T" || g === "CM") es.forEach(function (e) { mxF.T = Math.max(mxF.T, Math.abs(e.N)); });
        else if (g === "LB") es.forEach(function (e) { var s = sec.LB; mxF.LBc = Math.max(mxF.LBc, Math.max(0, -e.N)); mxF.LBt = Math.max(mxF.LBt, Math.max(0, e.N)); var v = MD.barra2022(MD.deAnalise(e, { b: s.b, h: s.h, L0y: b.L, L0z: b.L, L1: 0.01, classe: CL, perfil: pfF })); regG("LB", v.eta, b.id + "@" + e.x.toFixed(2), "F1d", v.governa); regEsb("LB", v); });
      });
      res.tracoes.fita = Math.max(res.tracoes.fita, mxF.FX); res.tracoes.vert = Math.max(res.tracoes.vert, mxF.FV);
      if (sec.LB && (mxF.LBc > 0 || mxF.LBt > 0 || res.esf.LB)) { var aL = res.esf.LB || (res.esf.LB = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }); aL.Nt = Math.max(aL.Nt, mxF.LBt); aL.Nc = Math.max(aL.Nc, mxF.LBc); aL.NtEq = Math.max(aL.NtEq, mxF.LBt); aL.NcEq = Math.max(aL.NcEq, mxF.LBc); }      /* M3: a F1d (caso próprio) soma-se ao ELU no esforço de ligação da linha LB */
      if (sec.DX) { var aD = res.esf.DX || (res.esf.DX = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }), nD = Math.max(mxF.DXn || 0, mxF.DVn || 0); aD.Nt = Math.max(aD.Nt, nD); aD.Nc = Math.max(aD.Nc, nD); aD.NtEq = Math.max(aD.NtEq, nD); aD.NcEq = Math.max(aD.NcEq, nD); }      /* a F1d (caso próprio) entra no esforço de ligação das diagonais de madeira */
      if (res.esf.T) { var sT = sec.T, vT = MD.barra2022(MD.deAnalise({ N: -(res.esf.T.Nc + mxF.T), My: 0, Mz: 0, Vy: 0, Vz: 0, T: 0 }, { b: sT.b, h: sT.h, L0y: spanX, L0z: spanX, L1: 0.01, classe: CL, perfil: pfF })); regG("T", vT.eta, "T (axial + F1d)", "F1d", vT.governa); }
      if (sec.DP) { var aP = res.esf.DP || (res.esf.DP = { Nt: 0, Nc: 0, V: 0, NtEq: 0, NcEq: 0, VEq: 0 }), nP = mxF.DPn || 0; aP.Nt = Math.max(aP.Nt, nP); aP.Nc = Math.max(aP.Nc, nP); aP.NtEq = Math.max(aP.NtEq, nP); aP.NcEq = Math.max(aP.NcEq, nP); }
      res.f90Perp = f90Perp; CTV.F1d = F1; CTV.nTes = nT; CTV.Fd = { BS: 2 / 3 * nT * F1.BS, BI: 2 / 3 * nT * F1.BI }; CTV.maxN = mxF; CTV.sec = { BS: sec.BS, BI: sec.BI, LB: sec.LB };
      res.contrav = CTV;
    }
    /* ELS: flecha final (φ da Tabela 20 por umidade, ψ2 da cobertura) por intervalo entre apoios; balanços (ponta) com L/limBalanco */
    var PHI = perfil("permanente").phi, psi2 = CA.PSI["Q-cobertura"].psi2, psi1W = CA.PSI.W.psi1;
    var els = [{ id: "g", fatores: { G1: 1, G2: 1 } }, { id: "q", fatores: { Q: 1 } }].concat(CS.filter(function (c) { return c.tipo === "W"; }).map(function (c) { var f = {}; f[c.id] = 1; return { id: "w" + c.id, fatores: f }; }));
    var re = AN.analisar({ nos: M.nos, barras: M.barras, apoios: M.apoios, casos: modelo.casos }, { combinacoes: els, estacoes: 3, comPCG: true }); modeloSemFalha(re.avisos);
    var nodo = {}; M.nos.forEach(function (n) { nodo[n.id] = n; });
    var D = function (cb, id) { return re.combinacoes[cb].desloc[id] || [0, 0, 0]; }, fm = {}, flech = {};
    function dfin(id) { var g = D("g", id), qd = D("q", id); return [0, 1, 2].map(function (k) { return g[k] * (1 + PHI) + qd[k] * (1 + psi2 * PHI); }); }
    function reg(chave, grp, valor, lim, extra) { var e = valor / lim; if (!fm[chave] || e > fm[chave].eta) fm[chave] = ext({ mm: Math.round(valor * 1e5) / 100, limite_mm: Math.round(lim * 1e5) / 100, eta: e, grupo: grp }, extra || {}); flech[grp] = Math.max(flech[grp] || 0, e); }
    var supX = function (m) { return p.sistema === "tesoura" ? I.xs : (m.g === "CM" ? [0, p.a].concat(M.barras.filter(function (b) { return b.grupo === "PC"; }).map(function (b) { return b.mem.p0[0]; })) : I.xs); };
    var porMem = {}; M.barras.forEach(function (b) { if (b.grupo !== "AD") (porMem[b.m] = porMem[b.m] || []).push(b); });
    G.membros.forEach(function (m) {
      if (m.tracao || ["P", "PO", "PC", "PD", "DG", "DX", "DV", "DP"].indexOf(m.g) >= 0) return;
      var bs = porMem[m.id] || []; if (!bs.length) return;
      var ids = [], vistos = {}; bs.forEach(function (b) { [b.i, b.j].forEach(function (n) { if (!vistos[n]) { vistos[n] = 1; ids.push(n); } }); });
      var eixo = Math.abs(m.p1[0] - m.p0[0]) > 0.9 * norm(m.p0, m.p1) ? 0 : (m.g === "BI" ? 1 : 1), pos = function (n) { return eixo === 0 ? nodo[n].x + p.origem.x : nodo[n].z + p.origem.y; };
      var sup = m.g === "BI" ? [0, p.b] : (m.g === "BS" || m.g === "CB" ? [] : supX(m)), vao = (m.g === "BI") ? p.b : spanX;
      if (m.g === "CM" && p.sistema === "cumeeira") vao = vaoCM;
      if (m.g === "BS" || m.g === "CB") {
        // vão: do apoio do frechal até a cumeeira (só a parte interna; ponta do beiral = balanço)
        var zOf = function (n) { return nodo[n].z + p.origem.y; }, tip = ids.filter(function (n) { return zOf(n) < -1e-6 || zOf(n) > p.b + 1e-6; });
        var heel = ids.filter(function (n) { return Math.abs(zOf(n)) < 1e-6 || Math.abs(zOf(n) - p.b) < 1e-6; })[0], ridge = ids.filter(function (n) { return Math.abs(zOf(n) - p.b / 2) < 1e-6; })[0];
        if (tip.length && heel) { var dt = dfin(tip[0]), dh = dfin(heel), nm = Math.sqrt(Math.pow(dt[0] - dh[0], 2) + Math.pow(dt[1] - dh[1], 2) + Math.pow(dt[2] - dh[2], 2)), Lbal = Math.abs(zOf(tip[0]) - zOf(heel)) * I.sc; reg("balanco" + m.g, m.g, nm, Lbal / q.limBalanco); }
        if (heel && ridge) { var Ar = dfin(heel), Br = dfin(ridge); ids.forEach(function (n) { var zz = zOf(n); if (zz < -1e-6 || zz > p.b + 1e-6 || n === heel || n === ridge) return; var t = (zz - zOf(heel)) / (zOf(ridge) - zOf(heel)), dn = dfin(n), dd = [0, 1, 2].map(function (k) { return dn[k] - (Ar[k] + (Br[k] - Ar[k]) * t); }); reg("vao" + m.g, m.g, Math.sqrt(dd[0] * dd[0] + dd[1] * dd[1] + dd[2] * dd[2]), (p.b / 2) * I.sc / q.limVao); }); }
        return;
      }
      var cuts = sup.slice().sort(function (u, v) { return u - v; }); if (m.g !== "BI") { /* vãos entre apoios */ }
      for (var kk = 0; kk + 1 < cuts.length; kk++) {
        var c0 = cuts[kk], c1 = cuts[kk + 1], nA = ids.filter(function (n) { return Math.abs(pos(n) - c0) < 1e-6; })[0], nB = ids.filter(function (n) { return Math.abs(pos(n) - c1) < 1e-6; })[0]; if (!nA || !nB) continue;
        var dA = dfin(nA), dB = dfin(nB);
        ids.forEach(function (n) { var x = pos(n); if (x <= c0 + 1e-6 || x >= c1 - 1e-6) return; var t = (x - c0) / (c1 - c0), dn = dfin(n), dd = [0, 1, 2].map(function (k) { return dn[k] - (dA[k] + (dB[k] - dA[k]) * t); }); reg("vao" + m.g, m.g, Math.sqrt(dd[0] * dd[0] + dd[1] * dd[1] + dd[2] * dd[2]), (c1 - c0) / q.limVao, { onde: m.id }); });
      }
      if (m.g === "T" || m.g === "CM" || m.g === "FR") {   // balanço lateral (beiral em X)
        var xmin = Math.min.apply(null, ids.map(pos)), xmax = Math.max.apply(null, ids.map(pos)), ex = [[xmin, cuts[0]], [xmax, cuts[cuts.length - 1]]];
        ex.forEach(function (e) { if (Math.abs(e[0] - e[1]) < 0.05) return; var nT = ids.filter(function (n) { return Math.abs(pos(n) - e[0]) < 1e-6; })[0], nS = ids.filter(function (n) { return Math.abs(pos(n) - e[1]) < 1e-6; })[0]; if (!nT || !nS) return; var a1 = dfin(nT), b1 = dfin(nS); reg("balanco" + m.g, m.g, Math.sqrt(Math.pow(a1[0] - b1[0], 2) + Math.pow(a1[1] - b1[1], 2) + Math.pow(a1[2] - b1[2], 2)), Math.abs(e[0] - e[1]) / q.limBalanco); });
      }
    });
    var topo = 0; M.barras.forEach(function (b) { if (b.grupo !== "P" && b.grupo !== "PO" && b.grupo !== "PC") return; var top = b.j, H = Math.abs(b.mem.p1[2] - b.mem.p0[2]); CS.filter(function (c) { return c.tipo === "W"; }).forEach(function (c) { var d = D("w" + c.id, top); topo = Math.max(topo, psi1W * hyp(d[0], d[2]) / (H / 300)); }); });
    flech.P = Math.max(flech.P || 0, topo); fm.topoPilarVentoFreq_H300 = { eta: topo, grupo: "P" };
    res.flechasMm = fm; res.flechas = flech; res.phi = PHI; res.QCOB = QCOB; res.G2 = g2s; res.vento = { v0: VT.v0, q: VT.q, vk: VT.vk }; res.casosVento = VT.casos.map(function (c) { return c.id; });
    res.secoes = JSON.parse(JSON.stringify(sec)); res.modelo = M; res.geometria = { info: { nH: I.nH, nCol: I.nCol, dz: I.dz, lp: I.lp }, sistema: p.sistema };
    res.excepcionais = elu.filter(function (c) { return /^EXC_/.test(c.id); }).map(function (c) { return c.id; }); res.dominante = { DCPI: VE.casoAberturaDominante(VT.q) };
    Object.defineProperty(res, "_casos", { value: CS, enumerable: false });      /* casos de carga (com as cargas nodais do assento) para a conferência à mão: não vai para JSON */
    res.cargasTotais = cargasTot; res.reacaoAssento = reacAssento; res.tipologia = "T2"; res.ventoGeometria = VT.geometria; res.avisosAnalise = r.avisos; res.reacaoGov = null;
    res.avisos.push("T2: não modelados (declarado): vergas de vidro e caibros secundários; travamento inferior das terças/caibros adotado " + (travB ? travB + " m" : "= vão (a favor)") + ".");
    return res;
  }
  function t2Pior(r, sec) {
    var z = {}; Object.keys(r.grupos).forEach(function (g) { z[g] = Math.max(r.grupos[g].eta, (r.flechas && r.flechas[g]) || 0); });
    Object.keys(r.flechas || {}).forEach(function (g) { if (z[g] == null) z[g] = r.flechas[g]; });
    Object.keys(r.apoioEta || {}).forEach(function (g) { z[g] = Math.max(z[g] || 0, r.apoioEta[g]); });      /* A1: apoio ⊥ às fibras */
    if (r.contrav) { if (sec.DP) z.DP = Math.max(z.DP || 0, r.contrav.razao); if (sec.DX) z.DX = Math.max(z.DX || 0, r.contrav.razao); if (!sec.DP && !sec.DX && sec.FT) z.FT = r.contrav.razao; }      /* madeira: K_br,1 reprovado → o laço engrossa as diagonais de madeira dos painéis (o caminho de rigidez até o solo); sem solução → bloqueia */      /* C3: Kmin/Kbr > 1 → o laço engrossa a fita */
    return z;
  }
  function t2Crescer(q, sec, g, r) {
    var L = q.limites[g] || { hMax: 0.5, bMax: 0.25 }, s = sec[g], pa = q.passo.altura, pl = q.passo.largura;
    if (g === "FT") { var kf = -1; T2_FT.forEach(function (c, i) { if (Math.abs(c[0] - s.b) < 1e-9 && Math.abs(c[1] - s.e) < 1e-9) kf = i; }); if (kf < 0) { for (kf = 0; kf < T2_FT.length - 1 && T2_FT[kf][0] * T2_FT[kf][1] <= s.b * s.e + 1e-12; kf++); kf--; } if (kf + 1 < T2_FT.length && !(L.bMax && T2_FT[kf + 1][0] > L.bMax + 1e-9)) { s.b = T2_FT[kf + 1][0]; s.e = T2_FT[kf + 1][1]; return true; } return false; }
    if (g === "TI") { var k = T2_TI.indexOf(s.d); if (k >= 0 && k + 1 < T2_TI.length) { s.d = T2_TI[k + 1]; return true; } return false; }
    if (g === "P" || g === "PO" || g === "PC") { if (s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); s.h = s.b; return true; } return false; }
    if ((g === "DX" || g === "DP") && r && r.contrav && r.contrav.slip && r.contrav.slip[g] && r.contrav.razao > 1 + 1e-9 && (s.nMin || 0) < 16) { s.nMin = Math.max(s.nMin || 0, r.contrav.slip[g].n) + 2; return true; }      /* A1 (r13): a rigidez do contraventamento reprova com o deslizamento dos pinos → mais pinos por ponta (a diagonal maior sozinha não resolve: os pinos limitam) */
    var eb = r && r.esbeltez && r.esbeltez[g];       // E4: λ acima do limite no eixo fraco → engrossa (b) primeiro
    if (!(eb && eb.eixo === "b") && s.h + pa <= L.hMax + 1e-9) { s.h = r2(s.h + pa); return true; }
    if (s.b + pl <= L.bMax + 1e-9) { s.b = r2(s.b + pl); return true; }
    return false;
  }
  function t2Dimensionar(proj, partida, opcoes) {
    opcoes = opcoes || {}; var sec = JSON.parse(JSON.stringify(partida)), hist = [], it, r, pior, falha, mexeu, q;
    if (!sec.LB) sec.LB = { b: 0.10, h: 0.10 }; if (!sec.RP) sec.RP = { b: 0.05, h: 0.05 }; var ctp = MT.T2.parametros(proj.params).contraventamento; if (!sec.FT) sec.FT = { b: ctp.fita.b, e: ctp.fita.e }; if (ctp.tipo !== "fita" && !sec.DX) sec.DX = { b: 0.08, h: 0.12 }; if (ctp.tipo !== "fita" && !proj.params.vedacaoRigida && !sec.DP) sec.DP = { b: 0.12, h: 0.12 };
    for (it = 0; it < (opcoes.maxIter || 30); it++) {
      try { r = t2Rodar(proj, sec); } catch (ex) {
        /* combinação ELU instável (seção pequena demais para a 2ª ordem): cresce TODOS os grupos um passo e tenta de novo */
        if (!/instável|mecanismo/.test(String(ex.message)) || it >= 12) throw ex;
        var gr = false; Object.keys(sec).forEach(function (k) { if (t2Crescer(proj._pad2 || t2Padrao(proj), sec, k)) gr = true; });
        if (!gr) throw ex; hist.push({ it: it, sec: JSON.parse(JSON.stringify(sec)), instavel: String(ex.message).slice(0, 120) }); continue;
      }
      q = proj._pad2; pior = t2Pior(r, sec); hist.push({ it: it, sec: JSON.parse(JSON.stringify(sec)), pior: pior });
      if (opcoes.aoIterar) opcoes.aoIterar(it, sec, pior);
      falha = Object.keys(pior).filter(function (k) { return pior[k] > 1 && sec[k]; });
      if (!falha.length) return { secoes: sec, resultado: r, historico: hist, semSolucao: false, pior: pior };
      mexeu = false; falha.sort(function (u, v) { return pior[v] - pior[u]; }).forEach(function (k) { if (t2Crescer(q, sec, k, r)) mexeu = true; });
      if (!mexeu) return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior };
    }
    return { secoes: sec, resultado: r, historico: hist, semSolucao: true, pior: pior, motivo: "limite de iterações" };
  }
  /** base engastada dos pilares: rigidez Kθ pela ligação (madligacoes.pacoteT1 só para a base: chapa em cruz + chumbadores em série), uma volta de refinamento */
  function t2Base(proj, r, sec) {
    /* E4 T2fix A5: UMA base por GRUPO de pilar (P, PO, PC), cada uma com a envoltória de reações DO GRUPO (N máx., N mín. e H do grupo; M do pilar de maior momento) e o Kθ próprio */
    var cl = MM.classe2022(proj._pad2.classe), pf = perfilFn(proj._pad2)("curta"), env = {}, out = { porGrupo: {} }, gov = null, Lp = Math.abs(proj._pad2.params.peDireito);
    Object.keys(r.reacoes).forEach(function (k) { var o = r.reacoes[k], e = env[o.grupo] || (env[o.grupo] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, Mmax: 0, grupo: o.grupo }); e.Nmax = Math.max(e.Nmax, o.Nmax); e.Nmin = Math.min(e.Nmin, o.Nmin); e.Hmax = Math.max(e.Hmax, o.Hmax); e.Mmax = Math.max(e.Mmax, o.Mmax); });
    Object.keys(env).forEach(function (g) {
      var o = env[g], P = sec[g], entrada = { secoes: { T: { b: 0.1, h: 0.2 }, V: { b: 0.2 }, VG: { b: 0.1, h: 0.2 }, P: { forma: "quadrado", b: P.b, h: P.h } }, reacoes: { B0: { Nmax: o.Nmax, Nmin: o.Nmin, Hmax: o.Hmax, Mmax: o.Mmax } },
        lig: { tercaV: { Tmax: 0.1, Cmax: 0.1, Hmax: 0.1 }, pilarTopo: { Tmax: 0.1, Cmax: 0, Hmax: 0.1 }, escora: { Nmax: 0.1 }, bloqueador: { Nmax: 0.1 }, verga: { Vmax: 0.1, Vy: 0.1, Vz: 0.1, Nmax: 0.1 }, pendural: 0.1 }, fitaNmax: 0.1, hV: 0.3, cfg: { kmod: r.kmodRef, rhok: cl.rhok, k90Tipo: "conifera" } };
      entrada.KthetaMin = (Math.PI / 3) * Math.tan(Math.PI / 3) * (cl.Ec0m * 1e3 * P.b * Math.pow(P.h, 3) / 12) / Lp;
      var L = ML.pacoteT1(entrada); out.porGrupo[g] = { LG: L, Ktheta: L.rigidezBase ? L.rigidezBase.Ktheta : null, pilar: o };
      if (!gov || o.Mmax > env[gov].Mmax) gov = g;
    });
    var G0 = out.porGrupo[gov], LG = G0.LG;
    /* as bases dos OUTROS grupos entram nas verificações da ligação (base-cruz, base-chapa) com o nome do grupo: reprovou, bloqueia */
    Object.keys(out.porGrupo).forEach(function (g) { if (g === gov) return; var x = out.porGrupo[g].LG; (x.verificacoes || []).forEach(function (v) { if (/^base/.test(v.nome)) LG.verificacoes.push({ nome: v.nome + "[" + g + "]", eta: v.eta, ok: v.ok }); }); if (x.ok === false) LG.ok = false; });
    return { LG: LG, Ktheta: G0.Ktheta, pilar: env[gov], grupoGov: gov, porGrupo: out.porGrupo };
  }
  /** ligações da T2 (madligacoes.pacoteT2) a partir dos esforços do resultado: reações por grupo de pilar, assento deslizante, esforços nos banzos/terças/caibros */
  function t2Ligacoes(q, sec, r) {
    var cl = MM.classe2022(q.classe), agg = {}, asn = { Nmax: -1e9, Nmin: 1e9, Hmax: 0 };
    Object.keys(r.reacoes).forEach(function (k) { var o = r.reacoes[k], g = o.grupo === "PO" ? "P" : o.grupo, a = agg[g] || (agg[g] = { Nmax: -1e9, Nmin: 1e9, Hmax: 0, NminEq: 1e9, HmaxEq: 0 }); a.Nmax = Math.max(a.Nmax, o.Nmax); a.Nmin = Math.min(a.Nmin, o.Nmin); a.Hmax = Math.max(a.Hmax, o.Hmax); a.NminEq = Math.min(a.NminEq, o.NminEq); a.HmaxEq = Math.max(a.HmaxEq, o.HmaxEq); });
    Object.keys(r.reacoesAssento || {}).forEach(function (k) { var o = r.reacoesAssento[k]; asn.Nmax = Math.max(asn.Nmax, o.Nmax); asn.Nmin = Math.min(asn.Nmin, o.Nmin); asn.Hmax = Math.max(asn.Hmax, o.Hmax); });
    if (!agg.P) agg.P = { Nmax: 0, Nmin: 0, Hmax: 0, NminEq: 0, HmaxEq: 0 };
    var c = { kmod: r.kmodRef, kmod1: r.kmod1Ref, kmod2: r.kmod2Ref, rhok: cl.rhok, k90Tipo: cl.grupo === "dicotiledonea" ? "folhosa" : "conifera" };
    var Lp0 = Math.abs(q.params.peDireito), pesoPil = {}; ["P", "PO", "PC"].forEach(function (g) { if (sec[g]) pesoPil[g === "PO" ? "P" : g] = Math.max(pesoPil[g === "PO" ? "P" : g] || 0, sec[g].b * sec[g].h * (g === "PC" ? Lp0 + (q.params.b / 2) * q.params.incl : Lp0) * q.pesoMLC); });      /* B1 (r14): a reação de BASE subestima o arrancamento no TOPO do pilar pelo peso do próprio pilar (U_topo = U_base + P_pilar) */
    return ML.pacoteT2({ sistema: q.params.sistema, pesoPilar: pesoPil, secoes: sec, cfg: c, esf: r.esf, reacoes: agg, assento: asn, incl: q.params.incl, fita: { N: Math.max(sec.FT ? r.tracoes.fita : 0, r.tracoes.parede, sec.FT ? (r.tracoes.vert || 0) : 0), b: sec.FT ? sec.FT.b : 0.06, e: sec.FT ? sec.FT.e : 0.002 }, contrav: r.contrav || null, f90Perp: r.f90Perp || null, mat: { fc90k: cl.fc90k, fc0k: cl.fc0k, kmod90: perfilFn(q)("longa").kmod } });
  }
  function t2Projetar(proj, partida, opcoes) {
    opcoes = opcoes || {};
    var kr = proj.krBase != null ? proj.krBase : (opcoes.kr0 || 8000), krMap = null, tent = [], d, b, k, conv = false;
    for (k = 0; k < (opcoes.voltasBase || 3); k++) {
      proj._krBase = krMap || kr; d = t2Dimensionar(proj, k ? d.secoes : partida, opcoes); b = t2Base(proj, d.resultado, d.secoes);
      tent.push({ krUsado: krMap ? JSON.parse(JSON.stringify(krMap)) : kr, Ktheta: b.Ktheta, porGrupo: Object.keys(b.porGrupo).reduce(function (o, g) { o[g] = b.porGrupo[g].Ktheta; return o; }, {}) });
      if (proj.krBase != null) { conv = true; break; }
      /* A5: kr e Kθ POR GRUPO (cada pilar com a rigidez da própria base); amortece quando o Kθ calculado é menor que o usado */
      var nm = {}, tudo = true; Object.keys(b.porGrupo).forEach(function (g) { var kg = krMap && krMap[g] != null ? krMap[g] : kr, kt = b.porGrupo[g].Ktheta; if (kt && Math.abs(kt - kg) / kg >= 0.12) tudo = false; nm[g] = !kt ? kg : (Math.min(kg, kt) === kg ? 0.5 * (kg + kt) : kt); });
      if (tudo) { conv = true; break; }
      krMap = nm;
    }
    var gv = b.grupoGov, krGov = krMap && krMap[gv] != null ? krMap[gv] : kr, rigidez = { auto: proj.krBase == null, krBase: krGov, Ktheta: b.Ktheta, convergiu: conv, voltas: tent, porGrupo: Object.keys(b.porGrupo).reduce(function (o, g) { o[g] = { krBase: krMap && krMap[g] != null ? krMap[g] : kr, Ktheta: b.porGrupo[g].Ktheta }; return o; }, {}) };
    if (!conv) d.resultado.avisos.push("N6/T2: a rigidez da base não convergiu em " + tent.length + " voltas (krBase usado " + Math.round(krGov) + " × Kθ da ligação " + Math.round(b.Ktheta) + " kN·m/rad, grupo " + gv + ") — conferir.");
    proj._krBase = null;
    var q = proj._pad2, F = MT.T2.fonte(q.params, d.secoes, { classe: q.classe });
    var out = { secoes: d.secoes, resultado: d.resultado, historico: d.historico, semSolucao: d.semSolucao, pior: d.pior, ligacoes: b.LG, rigidezBase: rigidez, fonte: { pecas: F.pecas, volume_por_material_m3: MT.volumePorMaterial(F.pecas) }, tipologia: "T2" };
    out.ligacoesT2 = t2Ligacoes(q, d.secoes, d.resultado);
    if (AUD && AUD.auditarT2 && opcoes.auditor !== false) out.auditoria = AUD.auditarT2({ pecas: F.pecas, params: q.params, ligacoes: b.LG, ligacoesT2: out.ligacoesT2, dim: { semSolucao: d.semSolucao, pior: d.pior } });
    return out;
  }

  var MadDimensionar2 = { _pressaoTeto: pressaoTeto, _modeloSemFalha: modeloSemFalha, _torcao: torcao, _t2Orient: t2Orient, _t2Torcao: t2Torcao, _ventoGeometria: ventoGeometria, rodar: rodar, dimensionar: dimensionar, projetoComBase: projetoComBase, projetoCompleto: projetoCompleto, projetarT1: projetarT1, projetarT2: t2Projetar, rodarT2: t2Rodar, dimensionarT2: t2Dimensionar, pacoteLigacoes: pacoteLigacoes, padrao: padrao, crescer: crescer, piorPorGrupo: piorPorGrupo };
  if (typeof module !== "undefined" && module.exports) module.exports = MadDimensionar2;
  else global.MadDimensionar2 = MadDimensionar2;
})(typeof window !== "undefined" ? window : this);

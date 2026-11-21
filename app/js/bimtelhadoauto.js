/* =====================================================================
 * bimtelhadoauto.js — TELHADO AUTOMÁTICO: o contorno, as águas e o apoio na laje. Motor PURO (ES5, sem DOM, Node-testável).
 *
 * Pedido do Rogério (20/11/2026): "lançar o telhado automaticamente, para ganhar tempo" — pelo perímetro externo das paredes, ou pelos
 * ambientes que eu selecionar (estilo caixote); o sistema soma o beiral (padrão = parâmetro), pergunta o número de águas (1, 2 ou 4) e,
 * com laje embaixo, leva os pontaletes para as paredes e vigas, com VIGA DE DISTRIBUIÇÃO onde o ponto cairia no meio da laje.
 *
 * O QUE JÁ EXISTIA (nada daqui duplica):
 *   · js/bimcontorno.js — contornoDaEdificacao / contornoDeParedes (face externa), aguasContorno (1/2/várias águas), vincularArestas (o telhado
 *     SEGUE as paredes), arestaMaisPerto;
 *   · js/bimp3ui.js opTelhado — a op `telhado` por contorno, com o beiral e o modelo de madeira;
 *   · js/bimtelhadoestrut.js — a estrutura (terças sobre pontaletes na laje; tesoura sem laje) e js/madcobertura.js — o apoio (laje, paredes, pilares)
 *     e o cálculo; js/madcoberturaui.js calcularModelo — o botão Calcular.
 * O QUE ESTE ARQUIVO FAZ (o que faltava):
 *   1) contornoEdificacao / contornoAmbientes → { contorno } pela face externa (o beiral é somado pelo telhado, não aqui);
 *   2) aguas(contorno, 1|2|4, { paredeId, oitaoId }) → o contorno com o "define inclinação" de cada aresta (a parede clicada vira o beiral de
 *      1 água; 2 águas: cumeeira no sentido do lado maior, ou do oitão clicado);
 *   3) distribuicao(caixas, pontos, { distMeio }) → para cada pontalete sobre a laje: está sobre/perto de parede ou viga? Se estiver no MEIO da
 *      laje (distância ao eixo da parede/viga mais próxima > distMeio), uma VIGA DE DISTRIBUIÇÃO (madeira deitada sobre a laje, apoiada nas
 *      paredes/vigas) leva a carga às paredes. O cálculo da viga fica no js/madcobertura.js (mesma biblioteca de vigas das terças).
 *
 * CRITÉRIO DE "MEIO DA LAJE" (declarado): distância do ponto ao EIXO da parede/viga mais próxima > DIST_MEIO = 0,50 m (parâmetro `distMeio`).
 * É adoção da RA, não valor de norma: a 0,50 m do eixo a carga cai na faixa de apoio da laje (parede de 15 cm + a distribuição da própria laje);
 * acima disso o pontalete carregaria o vão. O RT confirma (a verificação da laje com as cargas é do RT — ver cargasNaLaje no madcobertura).
 * Teste: node tools/test-telhado-auto.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function BC() { return dep("BimContorno", "./bimcontorno.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  /* "T" ou "U" quando o contorno de 8 lados é um T/U ortogonal (a madeira calcula; só o rótulo da forma) — vazio nos outros casos */
  function formaTU(P) { try { var M = dep("MadCobertura", "./madcobertura.js"), f = M && M.descreverForma ? M.descreverForma(P) : ""; return f === "T" || f === "U" ? f : ""; } catch (e) { return ""; } }
  function virg(v, c) { c = c == null ? 2 : c; var x = Number(v); return isFinite(x) ? x.toFixed(c).replace(".", ",") : "—"; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var DIST_MEIO = 0.5;       /* m — o critério de "meio da laje" (ver o cabeçalho) */
  var BASE_VIGA = 0.08, BASE_PONTALETE = 0.08;   /* m — seções de partida (b da viga, b do pontalete): a folga lateral (b_viga − b_pontalete)/2 decide quem divide a mesma viga */
  var MIN_TRECHO = 0.5;      /* m — a parede só fecha o ambiente se o trecho em contato for de pelo menos isto (canto de parede perpendicular não conta) */
  var BEIRAL_PADRAO = 0.5;   /* m — o padrão do telhado (cfg.telhado.beiral do js/bimp3ui.js) */

  /* ------------------------------------------------------------ geometria plana */
  function dist(a, b) { return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2)); }
  function dentro(p, P) {
    var c = false, i, j;
    for (i = 0, j = P.length - 1; i < P.length; j = i++)
      if (((P[i][1] > p[1]) !== (P[j][1] > p[1])) && (p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) c = !c;
    return c;
  }
  function distPtSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0;
    return dist(p, [a[0] + t * dx, a[1] + t * dz]);
  }
  function distPtPoli(p, R) { if (dentro(p, R)) return 0; var m = 1e9, i; for (i = 0; i < R.length; i++) m = Math.min(m, distPtSeg(p, R[i], R[(i + 1) % R.length])); return m; }
  function areaSinal(P) { var s = 0, i, n = P.length; for (i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function pts2(C) { return arr(C).map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }); }

  /* eixo (segmento) de uma parede ou viga: centro, comprimento, rotY (o mesmo molde do js/madcobertura.js paredeRet) */
  function segDe(c) {
    var th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th), h = num(c.comprimento, 0) / 2, cx = num(c.cx, 0), cz = num(c.cz, 0);
    return { a: [cx - ux * h, cz - uz * h], b: [cx + ux * h, cz + uz * h], u: [ux, uz], c: [cx, cz], esp: num(c.espessura, num(c.largura, 0.15)) };
  }
  function topoDe(c) { return num(c.cy, 0) + num(c.altura, 0) / 2; }
  function baseDe(c) { return num(c.cy, 0) - num(c.altura, 0) / 2; }
  function polyDe(c) {
    if (arr(c.contorno).length >= 3) return pts2(c.contorno);
    var cx = num(c.cx, 0), cz = num(c.cz, 0), hx = num(c.comprimento, 0) / 2, hz = num(c.largura != null ? c.largura : c.profundidade, num(c.espessura, 0)) / 2, th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th);
    return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(function (q) { return [cx + q[0] * ux - q[1] * uz, cz + q[0] * uz + q[1] * ux]; });
  }
  /* o retângulo da parede (4 pontos), para o "ambiente encosta nesta parede" */
  function retDe(c) { var s = segDe(c), nx = -s.u[1] * s.esp / 2, nz = s.u[0] * s.esp / 2; return [[s.a[0] + nx, s.a[1] + nz], [s.b[0] + nx, s.b[1] + nz], [s.b[0] - nx, s.b[1] - nz], [s.a[0] - nx, s.a[1] - nz]]; }

  function parede(c) { return !!c && c.tipo === "parede" && num(c.comprimento, 0) > 0.01 && num(c.espessura, 0) > 0; }

  /* ======================================================================
   * 1) O CONTORNO — pela face externa (o beiral é somado pelo telhado)
   * ====================================================================== */
  function dadosContorno(r, extra) {
    var C = r.contorno.map(function (q) { return { x: q.x, z: q.z }; }), P = pts2(C), out = { ok: true, contorno: C, lados: C.length, area: r4(Math.abs(areaSinal(P))), perimetro: 0, alinhar: "externa", paredes: r.paredes || 0, ignoradas: r.ignoradas || 0 };
    var i; for (i = 0; i < P.length; i++) out.perimetro += dist(P[i], P[(i + 1) % P.length]); out.perimetro = r4(out.perimetro);
    out.forma = C.length === 4 ? "retangular" : (C.length === 6 ? "em L (6 lados)" : (C.length === 8 && formaTU(P) ? "em " + formaTU(P) + " (8 lados)" : C.length + " lados"));
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }
  /* PÁTIO INTERNO (revisão 20/11/2026): um laço externo DENTRO do externo maior é um furo no telhado (pátio). O contorno único não o representa:
     recusa com a mensagem em vez de lançar um telhado que cobre o pátio. */
  function achaPatio(M, caixasParede) {
    var an = M._analisar(caixasParede);
    if (!an || !an.ok || an.externos.length < 2) return null;
    var ext = an.externos[0], P0 = ext.pts, i;   /* os pontos do motor de contorno são [x, z] */
    for (i = 1; i < an.externos.length; i++) {
      var Q = an.externos[i].pts, cx = 0, cz = 0; Q.forEach(function (q) { cx += q[0]; cz += q[1]; }); cx /= Q.length; cz /= Q.length;
      if (dentro([cx, cz], P0)) return { area: r4(Math.abs(areaSinal(Q))) };
    }
    return null;
  }
  var MSG_PATIO = function (a) { return { ok: false, patio: true, motivo: "A edificação tem pátio interno (furo de " + virg(a) + " m²): o telhado automático faz um contorno só e cobriria o pátio.", corrigir: "Use \"Telhado nos ambientes\" nos ambientes que formam o anel, ou desenhe o contorno do telhado clicando os cantos." }; };
  /* "Telhado automático": o contorno externo de TODAS as paredes que delimitam a edificação no nível (sem mureta/divisa) */
  function contornoEdificacao(estado, o) {
    o = o || {}; var M = BC();
    if (!M) return { ok: false, motivo: "O motor do contorno (js/bimcontorno.js) não carregou.", corrigir: "Recarregue o aplicativo." };
    var r = M.contornoDaEdificacao(arr(estado && estado.caixas), { alinhar: "externa", cota: o.cota, nivelId: o.nivelId });
    if (!r.ok) return r;
    var wd = arr(estado && estado.caixas).filter(function (c) {
      if (!parede(c) || c.delimitaAmbiente === false) return false;
      if (o.nivelId != null && c.nivelId != null && String(c.nivelId) !== String(o.nivelId)) return false;
      return true;
    });
    var pat = M._analisar ? achaPatio(M, wd) : null;
    if (pat) return MSG_PATIO(pat.area);
    return dadosContorno(r, { origem: "edificacao", ambientes: r.ambientes || 0 });
  }
  /* "Telhado nos ambientes": os ambientes selecionados + as paredes que os fecham → o contorno externo do conjunto (a UNIÃO) */
  function contornoAmbientes(estado, ids, o) {
    o = o || {}; var M = BC(), set = {};
    if (!M) return { ok: false, motivo: "O motor do contorno (js/bimcontorno.js) não carregou.", corrigir: "Recarregue o aplicativo." };
    arr(ids).forEach(function (x) { set[String(x)] = 1; });
    var amb = arr(estado && estado.ambientes).filter(function (a) { return a && set[String(a.id)] && a.calc && a.calc.estado === "delimitado" && arr(a.calc.contorno).length >= 3; });
    if (!amb.length) return { ok: false, motivo: "Nenhum ambiente delimitado selecionado.", corrigir: "Selecione um ou mais ambientes já delimitados pelas paredes e clique em \"Telhado nos ambientes\"." };
    /* amostras ao longo do contorno de cada ambiente (a cada ~0,25 m): a parede que o fecha tem 2 ou mais perto dela (folga 6 cm) */
    var amostras = [];
    amb.forEach(function (a) {
      var P = pts2(a.calc.contorno), i, n = P.length, NF = normalFora(P);
      for (i = 0; i < n; i++) {
        var A = P[i], B = P[(i + 1) % n], L = dist(A, B), ns = Math.max(2, Math.ceil(L / 0.25)), j;
        for (j = 0; j <= ns; j++) amostras.push({ p: [A[0] + (B[0] - A[0]) * j / ns, A[1] + (B[1] - A[1]) * j / ns], nIn: [-NF[i][0], -NF[i][1]] });
      }
    });
    /* cada parede que fecha o ambiente entra APARADA ao trecho que o ambiente usa (+ a espessura da parede que fecha cada ponta): a parede
       comprida que passa por vários cômodos não leva o contorno para fora do que foi selecionado */
    var cand = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!parede(c) || c.delimitaAmbiente === false) return;
      if (o.nivelId != null && c.nivelId != null && String(c.nivelId) !== String(o.nivelId)) return;
      var R = retDe(c), sg = segDe(c), smin = 1e9, smax = -1e9, k = 0;
      amostras.forEach(function (am) {
        var p = am.p;
        if (distPtPoli(p, R) > 0.06) return;
        /* a face da parede tem de estar do lado do AMBIENTE: andando para dentro dele a distância ao eixo da parede CRESCE */
        var q = [p[0] + am.nIn[0] * 0.1, p[1] + am.nIn[1] * 0.1];
        if (!(distPtSeg(q, sg.a, sg.b) > distPtSeg(p, sg.a, sg.b) + 0.04)) return;
        var s = (p[0] - sg.c[0]) * sg.u[0] + (p[1] - sg.c[1]) * sg.u[1]; k++; if (s < smin) smin = s; if (s > smax) smax = s;
      });
      if (k >= 2 && smax - smin >= MIN_TRECHO) cand.push({ c: c, sg: sg, R: R, smin: smin, smax: smax });
    });
    if (!cand.length) return { ok: false, motivo: "Não achei as paredes que fecham o(s) ambiente(s) selecionado(s).", corrigir: "Confira se as paredes do ambiente existem no nível, ou use \"Telhado automático\" (pelo perímetro da edificação)." };
    function extPonta(self, s) {
      var pt = [self.sg.c[0] + self.sg.u[0] * s, self.sg.c[1] + self.sg.u[1] * s], e = 0;
      cand.forEach(function (o2) { if (o2 !== self && distPtPoli(pt, o2.R) <= 0.06) e = Math.max(e, o2.sg.esp + 0.002); });
      return e;
    }
    var aparadas = [], ids2 = [];
    cand.forEach(function (w) {
      var s0 = w.smin - extPonta(w, w.smin), s1 = w.smax + extPonta(w, w.smax), cp = clone(w.c), sm = (s0 + s1) / 2;
      delete cp.uniao; cp.comprimento = r4(s1 - s0); cp.cx = r4(w.sg.c[0] + w.sg.u[0] * sm); cp.cz = r4(w.sg.c[1] + w.sg.u[1] * sm);
      aparadas.push(cp); ids2.push(String(cp.id));
    });
    var r = M.contornoDeParedes(aparadas, ids2, { alinhar: "externa" });
    if (!r.ok) return r;
    var pat2 = M._analisar ? achaPatio(M, aparadas) : null;
    if (pat2) return MSG_PATIO(pat2.area);
    /* as pontas aparadas passam 2 mm da parede vizinha (para a união fechar): o contorno é refeito sobre as retas das faces das paredes de verdade, sem o desvio */
    var vv = M.vincularArestas ? M.vincularArestas(arr(estado && estado.caixas), r.contorno, { alinhar: "externa", tol: 0.3 }) : null;
    if (vv && vv.ok && arr(vv.contorno).length === r.contorno.length) r = { ok: true, contorno: vv.contorno.map(function (q) { return { x: r4(q.x), z: r4(q.z) }; }), paredes: r.paredes };
    return dadosContorno(r, { origem: "ambientes", ambientes: amb.length, paredesIds: ids2 });
  }

  /* ======================================================================
   * 2) AS ÁGUAS — 1, 2 ou 4 (várias)
   * ====================================================================== */
  function normalFora(P) {   /* normais unitárias PARA FORA de cada aresta */
    var s = areaSinal(P) >= 0 ? 1 : -1, n = P.length;
    return P.map(function (a, k) { var b = P[(k + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz) || 1; return [s * dz / L, -s * dx / L]; });
  }
  /* a aresta do contorno que a parede clicada forma: a paralela mais perto (a clicada pode ser a parede de dentro, no meio do caixote) */
  function arestaDaParede(C, caixas, id, nivelId) {
    var P = pts2(C), n = P.length, w = null;
    arr(caixas).forEach(function (c) { if (c && String(c.id) === String(id) && c.tipo === "parede") w = c; });
    if (!w || n < 3) return { k: -1, motivo: "A parede clicada não está no modelo." };
    if (nivelId != null && w.nivelId != null && String(w.nivelId) !== String(nivelId)) return { k: -1, motivo: "A parede clicada é de outro nível: clique numa parede do nível do telhado." };
    var s = segDe(w), k, melhor = -1, dm = 1e9, melhorQ = -1, dq = 1e9;
    for (k = 0; k < n; k++) {
      var a = P[k], b = P[(k + 1) % n], L = dist(a, b) || 1, cos = Math.abs(((b[0] - a[0]) * s.u[0] + (b[1] - a[1]) * s.u[1]) / L), d = distPtSeg(s.c, a, b);
      if (d < dq) { dq = d; melhorQ = k; }
      if (cos >= 0.97 && d < dm) { dm = d; melhor = k; }
    }
    if (melhor >= 0) return { k: melhor, distancia: r4(dm), interna: dm > s.esp + 0.35 };
    return { k: melhorQ, distancia: r4(dq), interna: dq > s.esp + 0.35, aviso: "A parede clicada não é paralela a nenhuma aresta do contorno: usei a aresta mais perto." };
  }
  function marcar(C, def) { return C.map(function (q, i) { var o = { x: q.x, z: q.z }; if (!def[i]) o.d = false; return o; }); }

  /* n: 1 | 2 | 4. o = { caixas, paredeId (1 água: para onde cai; 2 águas: o oitão), arestaSobe } */
  function aguas(contorno, n, o) {
    o = o || {}; var M = BC(), C = arr(contorno).map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; }), P = pts2(C), N = P.length, k;
    if (N < 3 || !M) return { ok: false, motivo: "Contorno inválido para o telhado.", corrigir: "Refaça o contorno." };
    var NF = normalFora(P), L = P.map(function (a, i) { return dist(a, P[(i + 1) % N]); }), maior = 0;
    for (k = 1; k < N; k++) if (L[k] > L[maior] + 1e-9) maior = k;
    if (n === 4 || n === "varias") { var tudo = {}; for (k = 0; k < N; k++) tudo[k] = 1; return { ok: true, aguas: 4, contorno: marcar(C, tudo), arestaSobe: null, resumo: "4 águas: todas as arestas definem a inclinação." }; }
    if (n === 1) {
      var ar = null, ks = o.arestaSobe;
      if (o.paredeId != null && o.paredeId !== "") ar = arestaDaParede(C, o.caixas, o.paredeId, o.nivelId);
      if (ar && ar.k >= 0) ks = ar.k;
      if (!(fin(ks) && ks >= 0 && ks < N)) return { ok: false, motivo: (ar && ar.motivo) || "Não achei a parede para onde a água vai cair.", corrigir: "Clique numa parede do contorno do telhado." };
      var d1 = {}; d1[ks] = 1;
      return { ok: true, aguas: 1, contorno: marcar(C, d1), arestaSobe: ks, interna: !!(ar && ar.interna), caimento: [r4(NF[ks][0]) + 0, r4(NF[ks][1]) + 0], aviso: ar && (ar.aviso || (ar.interna ? "A parede clicada é interna: a água cai para a parede mais perto do contorno." : null)) || null,
               resumo: "1 água: o caimento sai perpendicular à aresta " + (ks + 1) + " (" + virg(L[ks]) + " m), apontando para ela." };
    }
    /* 2 águas: o padrão é a cumeeira no sentido do LADO MAIOR (os beirais nos dois lados maiores); o oitão clicado manda a cumeeira para o outro lado */
    var oit = null;
    if (o.paredeId != null && o.paredeId !== "") oit = arestaDaParede(C, o.caixas, o.paredeId, o.nivelId);
    if (oit && oit.k < 0 && oit.motivo) return { ok: false, motivo: oit.motivo, corrigir: "Clique numa parede do nível do telhado." };
    if (oit && oit.k >= 0) {
      var ko = oit.k, dk = [(P[(ko + 1) % N][0] - P[ko][0]) / L[ko], (P[(ko + 1) % N][1] - P[ko][1]) / L[ko]], cand = [];
      for (k = 0; k < N; k++) {
        if (k === ko) continue;
        var dj = [(P[(k + 1) % N][0] - P[k][0]) / L[k], (P[(k + 1) % N][1] - P[k][1]) / L[k]];
        if (Math.abs(dj[0] * dk[0] + dj[1] * dk[1]) < 0.2) cand.push(k);   /* perpendicular ao oitão */
      }
      var par = null, bl = -1, i, j;
      for (i = 0; i < cand.length; i++) for (j = i + 1; j < cand.length; j++) {
        var di = [(P[(cand[i] + 1) % N][0] - P[cand[i]][0]) / L[cand[i]], (P[(cand[i] + 1) % N][1] - P[cand[i]][1]) / L[cand[i]]], dj2 = [(P[(cand[j] + 1) % N][0] - P[cand[j]][0]) / L[cand[j]], (P[(cand[j] + 1) % N][1] - P[cand[j]][1]) / L[cand[j]]];
        if (di[0] * dj2[0] + di[1] * dj2[1] < -0.9 && L[cand[i]] + L[cand[j]] > bl) { bl = L[cand[i]] + L[cand[j]]; par = [cand[i], cand[j]]; }
      }
      if (par) { var d2 = {}; d2[par[0]] = 1; d2[par[1]] = 1; var u0 = [P[(par[0] + 1) % N][0] - P[par[0]][0], P[(par[0] + 1) % N][1] - P[par[0]][1]], l0 = Math.sqrt(u0[0] * u0[0] + u0[1] * u0[1]) || 1;
        return { ok: true, aguas: 2, contorno: marcar(C, d2), oitao: ko, beirais: par, cumeeira: { dir: [r4(u0[0] / l0), r4(u0[1] / l0)], ladoMaior: false, porOitao: true }, aviso: oit.aviso || null,
                 resumo: "2 águas: cumeeira do oitão clicado (aresta " + (ko + 1) + ") para o lado oposto; beirais nas arestas " + (par[0] + 1) + " e " + (par[1] + 1) + "." }; }
      /* sem par paralelo: cai no padrão do lado maior (o aviso diz) */
    }
    var cd = M.aguasContorno(C, "duas"), def = {}; cd.forEach(function (q, i) { if (q.d !== false) def[i] = 1; });
    var ds = Object.keys(def).map(Number), u1 = ds.length ? [P[(ds[0] + 1) % N][0] - P[ds[0]][0], P[(ds[0] + 1) % N][1] - P[ds[0]][1]] : [1, 0], l1 = Math.sqrt(u1[0] * u1[0] + u1[1] * u1[1]) || 1;
    return { ok: true, aguas: 2, contorno: marcar(C, def), beirais: ds, cumeeira: { dir: [r4(u1[0] / l1), r4(u1[1] / l1)], ladoMaior: true }, aviso: oit && oit.k >= 0 ? "Não achei beirais paralelos ao oitão clicado: usei a cumeeira no sentido do lado maior." : null,
             resumo: "2 águas: cumeeira no sentido do lado maior (beirais nas arestas " + ds.map(function (x) { return x + 1; }).join(" e ") + ")." };
  }

  /* o plano todo: contorno + águas. modo: "edificacao" | "ambientes"; o = { ids, aguas, paredeId, nivelId, cota, beiral } */
  function planejar(estado, modo, o) {
    o = o || {};
    var c = modo === "ambientes" ? contornoAmbientes(estado, o.ids, o) : contornoEdificacao(estado, o);
    if (!c.ok) return c;
    var ag = aguas(c.contorno, o.aguas == null ? 4 : o.aguas, { caixas: estado && estado.caixas, paredeId: o.paredeId, nivelId: o.nivelId });
    if (!ag.ok) return ag;
    return { ok: true, modo: modo, contorno: ag.contorno, contornoBase: c.contorno, lados: c.lados, area: c.area, perimetro: c.perimetro, forma: c.forma, aguas: ag.aguas, arestaSobe: ag.arestaSobe, caimento: ag.caimento || null,
             cumeeira: ag.cumeeira || null, oitao: ag.oitao != null ? ag.oitao : null, beiral: fin(o.beiral) ? o.beiral : BEIRAL_PADRAO, aviso: ag.aviso || null, interna: !!ag.interna, paredes: c.paredes, ambientes: c.ambientes,
             resumo: "Contorno " + c.forma + " pela face externa das paredes (" + virg(c.area) + " m², perímetro " + virg(c.perimetro) + " m) + beiral de " + virg(fin(o.beiral) ? o.beiral : BEIRAL_PADRAO) + " m. " + ag.resumo };
  }

  /* ======================================================================
   * 3) O APOIO NA LAJE — pontaletes sobre paredes e vigas; viga de distribuição no meio da laje
   * ====================================================================== */
  /* a parte do eixo [a, b] que está dentro da projeção da laje (poli), com 10 cm de tolerância na borda: [t0, t1] em 0..1, ou null */
  function recortar(poli, a, b) {
    var L = dist(a, b), n = Math.max(2, Math.ceil(L / 0.05)), t0 = null, t1 = null, i;
    for (i = 0; i <= n; i++) {
      var t = i / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (distPtPoli(p, poli) <= 0.1) { if (t0 == null) t0 = t; t1 = t; }
    }
    return t0 == null || (t1 - t0) * L < 0.3 ? null : [t0, t1];
  }
  /* as paredes e vigas EMBAIXO da laje (o que a segura): atravessam a face de baixo dela E estão DENTRO da projeção dela (só o trecho de dentro vale) */
  function apoiosDaLaje(caixas, laje) {
    var b0 = baseDe(laje), out = [], poli = polyDe(laje);
    arr(caixas).forEach(function (c) {
      if (!c || (c.tipo !== "parede" && c.tipo !== "viga") || !(num(c.comprimento, 0) > 0.05)) return;
      if (!(baseDe(c) <= b0 + 0.05 && topoDe(c) >= b0 - 0.08)) return;
      var s = segDe(c), rc = recortar(poli, s.a, s.b); if (!rc) return;
      var a = [s.a[0] + (s.b[0] - s.a[0]) * rc[0], s.a[1] + (s.b[1] - s.a[1]) * rc[0]], b = [s.a[0] + (s.b[0] - s.a[0]) * rc[1], s.a[1] + (s.b[1] - s.a[1]) * rc[1]];
      out.push({ tipo: c.tipo, id: String(c.id), a: a, b: b, u: s.u, esp: s.esp, topo: topoDe(c) });
    });
    return out;
  }
  /* o raio de p na direção u contra os eixos (alongados 10 cm nas pontas): o t positivo mais perto (m), ou null */
  function raio(p, u, apoios) {
    var melhor = null;
    apoios.forEach(function (s) {
      var ex = s.b[0] - s.a[0], ez = s.b[1] - s.a[1], den = u[0] * ez - u[1] * ex;
      if (Math.abs(den) < 1e-6) return;
      var wx = s.a[0] - p[0], wz = s.a[1] - p[1], t = (wx * ez - wz * ex) / den, e = (wx * u[1] - wz * u[0]) / den;
      var Ls = Math.sqrt(ex * ex + ez * ez), tol = 0.05 / (Ls || 1);
      if (t > 1e-6 && e >= -tol && e <= 1 + tol && (!melhor || t < melhor.t)) melhor = { t: t, ap: s, ponto: [p[0] + u[0] * t, p[1] + u[1] * t] };
    });
    return melhor;
  }
  /* pontos = [{ x, z }] (a base dos pontaletes). Devolve { ok, distMeio, pontos:[{i, sobre, d, meio, viga}], vigas:[{ id, a, b, L, dir, apoios, pontos:[{i, x, z, s}] }], semApoio:[i], aviso } */
  function distribuicao(caixas, pontos, o) {
    o = o || {};
    var X = fin(o.distMeio) ? o.distMeio : DIST_MEIO, lajes = arr(caixas).filter(function (c) { return c && c.tipo === "laje" && (!o.lajeId || String(c.id) === String(o.lajeId)); });
    /* UM PONTALETE FORA DA VIGA (revisão): só dividem a mesma viga os pontaletes cujo afastamento lateral cabe na folga (b_viga − b_pontalete)/2; senão, uma viga por linha */
    var bV = fin(o.bViga) ? o.bViga : BASE_VIGA, bP = fin(o.bPontalete) ? o.bPontalete : BASE_PONTALETE, tolLat = Math.max(0, (bV - bP) / 2) + 0.002;
    var res = { ok: true, distMeio: X, tolLateral: r4(tolLat), pontos: [], vigas: [], semApoio: [], aviso: null }, mid = [];
    arr(pontos).forEach(function (q, i) {
      var p = [num(q.x, 0), num(q.z, 0)], laje = null;
      lajes.forEach(function (l) { if (!laje && dentro(p, polyDe(l)) && (!fin(o.cota) || Math.abs(topoDe(l) - o.cota) <= 0.35)) laje = l; });
      if (!laje) { res.pontos.push({ i: i, sobre: null, meio: false }); return; }
      var ap = apoiosDaLaje(caixas, laje), dm = 1e9, prox = null;
      ap.forEach(function (s) { var d = distPtSeg(p, s.a, s.b); if (d < dm) { dm = d; prox = s; } });
      var meio = !prox || dm > X;
      res.pontos.push({ i: i, sobre: prox ? prox.tipo + ":" + prox.id : null, d: prox ? r4(dm) : null, meio: meio, viga: null, laje: String(laje.id) });
      if (!meio) return;
      if (!prox) { res.semApoio.push(i); return; }
      /* as direções possíveis da viga (a normal e o eixo da parede mais perto + os eixos x e z): cada uma com os dois apoios que o raio acha */
      var nrm = [-prox.u[1], prox.u[0]], dirs = [nrm, prox.u, [1, 0], [0, 1]], cands = [];
      dirs.forEach(function (u0) {
        var dom = Math.abs(u0[0]) >= Math.abs(u0[1]) ? u0[0] : u0[1], u = dom < 0 ? [-u0[0], -u0[1]] : u0;   /* sentido canônico: as duas faces da mesma linha caem no mesmo grupo */
        var h1 = raio(p, u, ap), h2 = raio(p, [-u[0], -u[1]], ap);
        /* a viga é CORTADA no contorno da laje: se o caminho sai da projeção dela, essa direção não vale (sem apoio de laje) */
        if (h1 && h2) {
          var Lb0 = h1.t + h2.t, ns0 = Math.max(2, Math.ceil(Lb0 / 0.25)), fora = false, kk;
          for (kk = 0; kk <= ns0 && !fora; kk++) { var tt = -h2.t + Lb0 * kk / ns0; if (distPtPoli([p[0] + u[0] * tt, p[1] + u[1] * tt], polyDe(laje)) > 0.1) fora = true; }
          if (fora) return;
        }
        if (h1 && h2) cands.push({ u: u, Lfis: h1.t + h2.t + h1.ap.esp / 2 + h2.ap.esp / 2, chave: r4(u[0]).toFixed(3) + "," + r4(u[1]).toFixed(3), L: h1.t + h2.t, par: [h1.ap.id, h2.ap.id].sort().join("|") });
      });
      /* a madeira serrada do catálogo não passa de Lmax: havendo caminho mais curto que isso, o longo sai */
      var LmaxO = fin(o.Lmax) ? o.Lmax : limitesSerrada().Lmax, curtos = cands.filter(function (cd) { return cd.Lfis <= LmaxO + 1e-9; });
      if (curtos.length) cands = curtos;
      mid.push({ i: i, p: p, laje: laje, ap: ap, cands: cands });
    });
    /* escolhe as direções de modo a ter o MÍNIMO de vigas: a direção que cobre mais pontaletes com menos vigas (e menos madeira) vence; o resto repete a escolha */
    function agrupar(itens, chave) {
      var gs = [];
      itens.forEach(function (m) {
        var c = m.cands.filter(function (x) { return x.chave === chave; })[0]; if (!c) return;
        var perp = [-c.u[1], c.u[0]], off = m.p[0] * perp[0] + m.p[1] * perp[1], g = null;
        gs.forEach(function (G) { if (!g && G.par === c.par && String(G.laje.id) === String(m.laje.id) && Math.abs(G.off - off) <= tolLat) g = G; });
        if (!g) { g = { u: c.u, chave: chave, laje: m.laje, ap: m.ap, par: c.par, off: off, itens: [], L: c.L }; gs.push(g); }
        g.itens.push(m); g.L = Math.max(g.L, c.L);   /* a viga passa pelo 1º pontalete: os outros ficam a ≤ tolLat do eixo */
      });
      return gs;
    }
    var grupos = [], resto = mid.slice();
    while (resto.length) {
      var chaves = {}; resto.forEach(function (m) { m.cands.forEach(function (c) { chaves[c.chave] = 1; }); });
      var melhorG = null;
      Object.keys(chaves).forEach(function (ch) {
        var gs = agrupar(resto, ch), cob = 0, tot = 0; gs.forEach(function (G) { cob += G.itens.length; tot += G.L; });
        if (!melhorG || cob > melhorG.cob || (cob === melhorG.cob && (gs.length < melhorG.gs.length || (gs.length === melhorG.gs.length && tot < melhorG.tot - 1e-6)))) melhorG = { gs: gs, cob: cob, tot: tot };
      });
      if (!melhorG || !melhorG.cob) { resto.forEach(function (m) { res.semApoio.push(m.i); }); break; }
      melhorG.gs.forEach(function (G) { grupos.push(G); });
      var feitos = {}; melhorG.gs.forEach(function (G) { G.itens.forEach(function (m) { feitos[m.i] = 1; }); });
      resto = resto.filter(function (m) { return !feitos[m.i]; });
    }
    grupos.forEach(function (G, gi) {
      var c0 = G.itens[0].p;
      var h1 = raio(c0, G.u, G.ap), h2 = raio(c0, [-G.u[0], -G.u[1]], G.ap);
      if (!h1 || !h2) { G.itens.forEach(function (x) { res.semApoio.push(x.i); }); return; }
      var A = h2.ponto, B = h1.ponto, Lb = dist(A, B), vid = "vd" + (gi + 1);
      var e0 = h2.ap.esp / 2, e1 = h1.ap.esp / 2, AF = [A[0] - G.u[0] * e0, A[1] - G.u[1] * e0], BF = [B[0] + G.u[0] * e1, B[1] + G.u[1] * e1];   /* a viga vai até a FACE OPOSTA da parede (σc90 no apoio) */
      var v = { id: vid, a: [r4(A[0]), r4(A[1])], b: [r4(B[0]), r4(B[1])], aFis: [r4(AF[0]), r4(AF[1])], bFis: [r4(BF[0]), r4(BF[1])], ext: [r4(e0), r4(e1)], espApoio: [r4(h2.ap.esp), r4(h1.ap.esp)], L: r4(Lb), dir: [r4(G.u[0]), r4(G.u[1])], laje: String(G.laje.id), apoios: [h2.ap.tipo + ":" + h2.ap.id, h1.ap.tipo + ":" + h1.ap.id], pontos: [] };
      G.itens.forEach(function (x) { var s2 = (x.p[0] - A[0]) * G.u[0] + (x.p[1] - A[1]) * G.u[1]; v.pontos.push({ i: x.i, x: r4(x.p[0]), z: r4(x.p[1]), s: r4(Math.max(0.05, Math.min(Lb - 0.05, s2))) }); res.pontos[x.i].viga = vid; });
      res.vigas.push(v);
    });
    if (res.semApoio.length) res.aviso = res.semApoio.length + " pontalete(s) no meio da laje sem parede/viga para apoiar uma viga de distribuição: confira as paredes sob a laje.";
    return res;
  }

  /* o que o catálogo de MADEIRA SERRADA permite para uma viga (revisão): h ≤ 25 cm e comprimento ≤ 5 m, SALVO se o catálogo tiver mais (seções b ≥ 8 cm e comprimentos de
     js/madcatalogo.js); `mlc` = o catálogo tem produto de madeira laminada colada. Sem catálogo carregado: os limites de partida. */
  var LIM_CATALOGO = { hMax: 0.25, Lmax: 6, mlc: false };
  function limitesSerrada(o) {
    var hMax = 0.25, Lmax = 5, mlc = false, C = o && o.semCatalogo ? null : dep("MadCatalogo", "./madcatalogo.js");
    /* a tela do BIM não carrega o catálogo (js/madcatalogo.js, grande): sem ele valem os números DELE em 12/10/2026 (peças serradas de 8 cm ou mais, até 6 m) — o teste confere que as duas fontes batem */
    if (!(C && C.DADOS && C.DADOS.produtos)) return { hMax: LIM_CATALOGO.hMax, Lmax: LIM_CATALOGO.Lmax, mlc: LIM_CATALOGO.mlc, fonte: "constantes do catálogo de 12/10/2026" };
    try {
      arr(C && C.DADOS && C.DADOS.produtos).forEach(function (p) {
        if (p.categoria !== "madeira_serrada") return;
        var m = /^nibra-mwf-(\d+)x(\d+)$/.exec(String(p.id));
        if (m && Number(m[1]) >= 8) { hMax = Math.max(hMax, Number(m[2]) / 100); arr(p.variantes).forEach(function (v) { arr(v.comprimentos_m).forEach(function (c) { if (c > Lmax) Lmax = c; }); }); }
        if (/\bMLC\b|laminada colada|glulam/i.test(String(p.nome_pt || "") + " " + String(p.material || ""))) mlc = true;
      });
    } catch (e) { /* catálogo ausente */ }
    return { hMax: hMax, Lmax: Lmax, mlc: mlc };
  }
  /* A SETA DO CAIMENTO (parede interna clicada): o contorno e uma seta do meio do telhado para a aresta que cai, em SVG (a janela de confirmação mostra) */
  function setaSvg(plano) {
    var C = arr(plano && plano.contornoBase), P = pts2(C), c = plano && plano.caimento;
    if (P.length < 3 || !c) return "";
    var xs = P.map(function (q) { return q[0]; }), zs = P.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
    var W = 240, H = 170, pad = 14, k = Math.min((W - 2 * pad) / Math.max(x1 - x0, 0.1), (H - 2 * pad) / Math.max(z1 - z0, 0.1));
    function X(x) { return r4(pad + (x - x0) * k); } function Z(z) { return r4(pad + (z - z0) * k); }
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = Math.min(x1 - x0, z1 - z0) * 0.4;
    var pol = P.map(function (q) { return X(q[0]) + "," + Z(q[1]); }).join(" ");
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" data-caimento="' + c[0] + "," + c[1] + '" role="img" aria-label="Seta do caimento da água">' +
      '<defs><marker id="tauto-seta" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b00020"/></marker></defs>' +
      '<polygon points="' + pol + '" fill="#eef1f4" stroke="#445" stroke-width="1.5"/>' +
      '<line x1="' + X(cx - c[0] * len / 2) + '" y1="' + Z(cz - c[1] * len / 2) + '" x2="' + X(cx + c[0] * len / 2 + c[0] * len / 2) + '" y2="' + Z(cz + c[1] * len / 2 + c[1] * len / 2) + '" stroke="#b00020" stroke-width="3" marker-end="url(#tauto-seta)"/></svg>';
  }

  var BimTelhadoAuto = {
    DIST_MEIO: DIST_MEIO, BEIRAL_PADRAO: BEIRAL_PADRAO, BASE_VIGA: BASE_VIGA, BASE_PONTALETE: BASE_PONTALETE,
    contornoEdificacao: contornoEdificacao, contornoAmbientes: contornoAmbientes, aguas: aguas, planejar: planejar, arestaDaParede: arestaDaParede,
    apoiosDaLaje: apoiosDaLaje, distribuicao: distribuicao, setaSvg: setaSvg, limitesSerrada: limitesSerrada, MIN_TRECHO: MIN_TRECHO, _normalFora: normalFora
  };
  global.BimTelhadoAuto = BimTelhadoAuto;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTelhadoAuto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

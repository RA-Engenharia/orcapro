/* =====================================================================
 * bimvaoarr.js — PORTAS E JANELAS: ARRASTAR NA PAREDE E COTAS TEMPORÁRIAS EDITÁVEIS (pedido do Rogério, 18/10/2026).
 *
 * "Para portas e janelas, quero só clicar e poder arrastar, na planta baixa e no 3D, para onde eu quiser. Ao clicar,
 *  ele mostra uma cota do lado esquerdo e do lado direito, que eu posso digitar. Por exemplo, quero uma boneca de
 *  5 cm: digito 5 na cota e a porta já fica nesse espaçamento."
 *
 * Vale para toda família HOSPEDADA em parede reta (porta, janela, portão, vão; e a hospedada sem vão, como tomada).
 *
 * MOTOR PURO (ES5, Node-testável) — tudo no sistema LOCAL da parede hospedeira: t ao longo do eixo (0 = meio da
 * parede, −L/2 … +L/2, a mesma convenção do BimEdit.tNaParede), w de lado (a espessura):
 *   info(estado, avaliar, id)                → a abertura: parede, t, centro do vão, largura, altura, peitoril
 *   referencias(estado, avaliar, paredeId, exc) → paredes que CRUZAM o eixo (faces, faces do núcleo, eixo),
 *                                              pontas, os outros vãos da parede e os TRECHOS LIVRES (onde cabe vão)
 *   cotas(estado, avaliar, id, o)            → cota ESQUERDA (da referência até a borda esquerda do vão), DIREITA
 *                                              e o PEITORIL; o.modos = { esq, dir } ∈ face | nucleo | eixo
 *   opDaCota(estado, avaliar, id, lado, v, o) → a op que deixa a cota EXATA (a boneca de 5 cm) — ou o erro
 *   arrastar(estado, avaliar, id, p, o)      → o ponto do cursor (planta, 3D projetado no plano da parede, corte)
 *                                              vira posição na parede: presa ao eixo, encaixe (meio da parede,
 *                                              meio do trecho livre, face/eixo da parede que cruza), sem sair da
 *                                              parede, sem sobrepor outra abertura; passa para a parede COLINEAR
 *                                              ou ADJACENTE quando o cursor vai até ela
 *   lerCota(texto)                           → metros: "0,05" e "0.05" = m; "5" (inteiro, sem vírgula) = 5 cm;
 *                                              "5 cm" / "50 mm" / "0,05 m" respeitam a unidade escrita
 * A op é a de sempre: { op: "mover", id, cx, cz, host: { id, t } } (o BimEdit grava o host exato; quem não conhece o
 * campo host projeta cx/cz na parede, como antes) e { op: "instancia", id, inst: { Peitoril } } — UMA op por
 * arraste ou cota: um Ctrl+Z desfaz.
 *
 * A TELA (só no navegador, abaixo): o arraste no 3D (js/bim.js), na planta e no corte (js/bimselecao.js), a prévia
 * do vão (azul; vermelho quando sobrepõe), as cotas temporárias desenhadas por cima da vista ativa, o número que
 * vira campo ao clicar e a alça que alterna a referência (face → núcleo → eixo; a escolha fica gravada).
 * Teste: node tools/test-bimvaoarr.js · e2e: tools/e2e-bim-vao-arrastar.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function ARQ() { return dep("BimArq", "./bimarq.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function P(x, z) { return { x: x, z: z }; }
  function sub(a, b) { return P(a.x - b.x, a.z - b.z); }
  function dot(a, b) { return a.x * b.x + a.z * b.z; }
  function eixoU(r) { return P(Math.cos(r), -Math.sin(r)); }   /* o eixo da parede (o mesmo do BimEdit/BimPrecisao) */
  function eixoN(r) { return P(Math.sin(r), Math.cos(r)); }    /* a espessura */
  /* metros com 2 casas — 3 quando a medida tem meio centímetro (1,475 não vira "1,47" de um lado e "1,48" do outro) */
  function fmt(v, c) {
    v = Math.round(v * 1e4) / 1e4;
    if (c == null) c = Math.abs(v * 100 - Math.round(v * 100)) > 0.05 ? 3 : 2;
    var k = Math.pow(10, c); return (Math.round(v * k + (v >= 0 ? 1e-7 : -1e-7)) / k).toFixed(c).replace(".", ",");
  }
  var TOL = 1e-6;
  var MODOS = ["face", "nucleo", "eixo"];
  var ROT_MODO = { face: "face da parede", nucleo: "face do núcleo", eixo: "eixo" };

  function ehParedeReta(c) { return !!c && c.tipo === "parede" && fin(c.cx) && fin(c.cz) && c.comprimento > 0 && c.espessura > 0 && fin(c.rotY) && !c.arco; }
  function faixaY(c) { var h = num(c.altura, 0), y = num(c.cy, 0); return [y - h / 2, y + h / 2]; }
  function sobrepoeY(a, b) { var A = faixaY(a), B2 = faixaY(b); return Math.min(A[1], B2[1]) - Math.max(A[0], B2[0]) > 0.05; }
  function acharCaixa(estado, id) { var l = arr(estado && estado.caixas); for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return l[i]; return null; }
  function acharFam(estado, id) { var l = arr(estado && estado.familias); for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return l[i]; return null; }
  /* as espessuras de cada lado (fora, núcleo, dentro) — js/bimarq.js; sem ele (ou sem camadas) o núcleo é a parede toda */
  function lados(c) { var A = ARQ(); if (A && A.ladosParede) { try { return A.ladosParede(c); } catch (e) {} } return { fora: 0, nucleo: c.espessura, dentro: 0, t: c.espessura }; }
  function nucleoOff(c) {
    var L = lados(c), h = num(c.espessura, 0) / 2, a = -h + num(L.fora, 0), b = h - num(L.dentro, 0);
    return c.inverterFaces ? [-b, -a] : [a, b];
  }

  /* --------------------------------------------------------------- a abertura */
  /* a família hospedada (porta, janela, vão…) e o VÃO dela no sistema da parede */
  function info(estado, avaliar, id) {
    var f = acharFam(estado, id); if (!f || !f.host || f.host.id == null) return null;
    var par = acharCaixa(estado, f.host.id); if (!ehParedeReta(par)) return null;
    var av = typeof avaliar === "function" ? avaliar(f.famId, f.tipoId, f.inst) : null;
    var larg = 0, alt = 0, pe = 0, desl = 0, vao = false;
    if (av && av.abertura && av.abertura.largura > 0) {
      larg = num(av.abertura.largura, 0); alt = num(av.abertura.altura, 0); pe = num(av.abertura.peitoril, 0); desl = num(av.abertura.deslocX, 0); vao = true;
    } else if (av && av.caixa && fin(av.caixa.x0) && fin(av.caixa.x1)) {
      larg = av.caixa.x1 - av.caixa.x0; desl = (av.caixa.x0 + av.caixa.x1) / 2; pe = num(av.caixa.y0, 0); alt = num(av.caixa.y1, 0) - pe;
    } else return null;
    if (!(larg > 0)) return null;
    var temPeit = !!(av && av.valores && fin(av.valores.Peitoril));
    return { id: id, f: f, parede: par, t: num(f.host.t, 0), desl: desl, largura: larg, altura: alt, peitoril: pe, vao: vao, peitorilEditavel: temPeit, fixo: !!f.fixo, base: num(par.cy, 0) - num(par.altura, 0) / 2 };
  }

  /* ----------------------------------------------------------- as referências */
  /* paredes que CRUZAM a linha do eixo da parede P (faces, núcleo e eixo delas, em t de P), as pontas de P, os vãos
     das outras aberturas hospedadas em P e os trechos LIVRES (P menos as paredes que cruzam) */
  function referencias(estado, avaliar, paredeId, excluirId) {
    var c = typeof paredeId === "object" ? paredeId : acharCaixa(estado, paredeId);
    if (!ehParedeReta(c)) return null;
    var u = eixoU(c.rotY), C = P(c.cx, c.cz), L = c.comprimento, h2 = L / 2, cruz = [];
    arr(estado && estado.caixas).forEach(function (W) {
      if (!W || W.id === c.id || !ehParedeReta(W) || !sobrepoeY(c, W)) return;
      var uW = eixoU(W.rotY), nW = eixoN(W.rotY), un = dot(u, nW);
      if (Math.abs(un) < 0.05) return;   /* paralela (colinear = continuação, não é referência de face) */
      var CW = P(W.cx, W.cz), k0 = dot(sub(C, CW), nW), eW = W.espessura / 2;
      function s(o) { return (o - k0) / un; }
      var se = s(0), pe = P(C.x + u.x * se, C.z + u.z * se), tw = dot(sub(pe, CW), uW);
      if (Math.abs(tw) > W.comprimento / 2 + Math.max(eW, c.espessura / 2) + 0.01) return;   /* a linha não chega nela */
      var a = Math.min(s(-eW), s(eW)), b = Math.max(s(-eW), s(eW));
      if (b < -h2 - 1e-3 || a > h2 + 1e-3) return;   /* fora da parede P */
      var no = nucleoOff(W), na = Math.min(s(no[0]), s(no[1])), nb = Math.max(s(no[0]), s(no[1]));
      cruz.push({ id: W.id, f0: r6(a), f1: r6(b), n0: r6(na), n1: r6(nb), eixo: r6(se) });
    });
    /* os trechos livres: a parede menos as que cruzam */
    var livres = [[-h2, h2]];
    cruz.forEach(function (q) {
      var nv = [];
      livres.forEach(function (sp) {
        if (q.f1 <= sp[0] + TOL || q.f0 >= sp[1] - TOL) { nv.push(sp); return; }
        if (q.f0 > sp[0] + TOL) nv.push([sp[0], q.f0]);
        if (q.f1 < sp[1] - TOL) nv.push([q.f1, sp[1]]);
      });
      livres = nv;
    });
    var vaos = [];
    arr(estado && estado.familias).forEach(function (g) {
      if (!g || g.id === excluirId || !g.host || g.host.id !== c.id) return;
      var ig = info(estado, avaliar, g.id); if (!ig || !ig.vao) return;
      var tv = ig.t + ig.desl; vaos.push({ id: g.id, x0: r6(tv - ig.largura / 2), x1: r6(tv + ig.largura / 2), c: r6(tv) });
    });
    return { parede: c, L: L, cruz: cruz, livres: livres.map(function (sp) { return { a: r6(sp[0]), b: r6(sp[1]) }; }), vaos: vaos };
  }
  /* os pontos de referência de um lado, pela escolha (face | nucleo | eixo) */
  function candidatos(R, modo) {
    var h2 = R.L / 2, out = [{ s: -h2, k: "ponta", id: null }, { s: h2, k: "ponta", id: null }];
    R.cruz.forEach(function (q) {
      if (modo === "eixo") out.push({ s: q.eixo, k: "eixo", id: q.id });
      else if (modo === "nucleo") { out.push({ s: q.n0, k: "nucleo", id: q.id }); out.push({ s: q.n1, k: "nucleo", id: q.id }); }
      else { out.push({ s: q.f0, k: "face", id: q.id }); out.push({ s: q.f1, k: "face", id: q.id }); }
    });
    R.vaos.forEach(function (v) {
      if (modo === "eixo") out.push({ s: v.c, k: "vao-eixo", id: v.id });
      else { out.push({ s: v.x0, k: "vao", id: v.id }); out.push({ s: v.x1, k: "vao", id: v.id }); }
    });
    return out;
  }
  function modoOk(m) { return MODOS.indexOf(m) >= 0 ? m : "face"; }

  /* ----------------------------------------------------------------- as cotas */
  /* o.modos = { esq, dir }; o.paredeId / o.t = a posição de outra parede / outro t (o arraste em andamento) */
  function cotas(estado, avaliar, id, o) {
    o = o || {};
    var I = info(estado, avaliar, id); if (!I) return null;
    var par = o.paredeId != null && o.paredeId !== I.parede.id ? acharCaixa(estado, o.paredeId) : I.parede;
    if (!ehParedeReta(par)) return null;
    var t = fin(o.t) ? o.t : (par === I.parede ? I.t : 0), tv = t + I.desl, x0 = tv - I.largura / 2, x1 = tv + I.largura / 2;
    var R = referencias(estado, avaliar, par, id); if (!R) return null;
    var m = o.modos || {}, me = modoOk(m.esq), md = modoOk(m.dir), esq = null, dir = null;
    candidatos(R, me).forEach(function (q) { if (q.s <= x0 + 1e-6 && (!esq || q.s > esq.s)) esq = q; });
    candidatos(R, md).forEach(function (q) { if (q.s >= x1 - 1e-6 && (!dir || q.s < dir.s)) dir = q; });
    var base = num(par.cy, 0) - num(par.altura, 0) / 2;
    return {
      id: id, paredeId: par.id, parede: par, info: I, t: r6(t), tVao: r6(tv), x0: r6(x0), x1: r6(x1), L: R.L, refs: R, base: base,
      esq: esq ? { valor: r6(x0 - esq.s), s: esq.s, k: esq.k, ref: esq.id, modo: me } : null,
      dir: dir ? { valor: r6(dir.s - x1), s: dir.s, k: dir.k, ref: dir.id, modo: md } : null,
      peitoril: { valor: r6(I.peitoril), editavel: I.peitoril !== null && I.peitorilEditavel, y0: base, y1: base + I.peitoril }
    };
  }

  /* ---------------------------------------------------------------- validar */
  /* o vão com o centro em tVao na parede: cabe num trecho livre? sobrepõe outra abertura? */
  function validar(estado, avaliar, id, paredeId, tVao) {
    var I = info(estado, avaliar, id); if (!I) return { ok: false, erro: "Não é uma abertura hospedada em parede reta." };
    var R = referencias(estado, avaliar, paredeId, id); if (!R) return { ok: false, erro: "Parede não encontrada." };
    var x0 = tVao - I.largura / 2, x1 = tVao + I.largura / 2, h2 = R.L / 2;
    if (x0 < -h2 - 1e-6 || x1 > h2 + 1e-6) return { ok: false, erro: "A abertura sairia da parede.", motivo: "fora" };
    var dentro = R.livres.some(function (sp) { return x0 >= sp.a - 1e-6 && x1 <= sp.b + 1e-6; });
    if (!dentro) return { ok: false, erro: "A abertura entraria na parede que cruza.", motivo: "cruza" };
    if (I.vao) {
      var bate = null;
      R.vaos.forEach(function (v) { if (!bate && x0 < v.x1 - 1e-6 && x1 > v.x0 + 1e-6) bate = v.id; });
      if (bate) return { ok: false, erro: "Sobreporia outra abertura (" + bate + "): nada foi aplicado.", motivo: "sobrepoe", conflito: bate };
    }
    return { ok: true };
  }
  function opMover(par, id, t) {
    var B = BE(), ps = B ? B.posicaoHospedada(par, t) : { x: par.cx, z: par.cz };
    return { op: "mover", id: id, cx: r4(ps.x), cz: r4(ps.z), host: { id: par.id, t: r6(t) } };
  }
  /* a op que leva a abertura a tVao (centro do vão) na parede — ou o erro */
  function posicionar(estado, avaliar, id, paredeId, tVao) {
    var I = info(estado, avaliar, id); if (!I) return { ok: false, erro: "Não é uma abertura hospedada em parede reta." };
    if (I.fixo) return { ok: false, erro: "Elemento fixado: use Desafixar antes." };
    var par = acharCaixa(estado, paredeId); if (!ehParedeReta(par)) return { ok: false, erro: "Parede não encontrada." };
    var v = validar(estado, avaliar, id, paredeId, tVao); if (!v.ok) return v;
    return { ok: true, op: opMover(par, id, tVao - I.desl), t: r6(tVao - I.desl), tVao: r6(tVao), paredeId: par.id };
  }

  /* ------------------------------------------------------------ digitar a cota */
  /* "0,05" / "0.05" = metros; "5" (inteiro, sem vírgula) = 5 cm (a convenção da cota de boneca/peitoril: o pedreiro
     fala em centímetro); "5 cm", "50 mm", "0,05 m" respeitam a unidade escrita. null se não for número. */
  function lerCota(s) {
    var t = String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
    var m = /^(\d+(?:[.,]\d+)?)(mm|cm|m)?$/.exec(t); if (!m) return null;
    var v = parseFloat(m[1].replace(",", ".")); if (!isFinite(v)) return null;
    if (m[2] === "cm") return r6(v / 100);
    if (m[2] === "mm") return r6(v / 1000);
    if (m[2] === "m") return r6(v);
    return /[.,]/.test(m[1]) ? r6(v) : r6(v / 100);
  }
  /* a op que deixa a cota do lado ('esq' | 'dir' | 'peitoril') EXATA em v metros */
  function opDaCota(estado, avaliar, id, lado, v, o) {
    if (!fin(v) || v < 0) return { ok: false, erro: "Valor inválido para a cota." };
    var cc = cotas(estado, avaliar, id, o); if (!cc) return { ok: false, erro: "Não é uma abertura hospedada em parede reta." };
    if (lado === "peitoril") return opPeitoril(estado, avaliar, id, v);
    var ref = cc[lado]; if (!ref) return { ok: false, erro: "Sem referência deste lado." };
    var I = cc.info, tv = lado === "esq" ? ref.s + v + I.largura / 2 : ref.s - v - I.largura / 2;
    var r = posicionar(estado, avaliar, id, cc.paredeId, tv);
    if (!r.ok) return r;
    r.valor = r6(v); r.lado = lado;
    return r;
  }
  /* o peitoril (janela): o parâmetro de instância Peitoril. Se o vão não for o próprio Peitoril (fórmula), resolve
     pela reta das duas avaliações — o vão fica com o peitoril pedido. */
  function opPeitoril(estado, avaliar, id, v) {
    var I = info(estado, avaliar, id); if (!I) return { ok: false, erro: "Não é uma abertura hospedada." };
    if (!I.peitorilEditavel) return { ok: false, erro: "Esta família não tem o parâmetro Peitoril." };
    if (I.fixo) return { ok: false, erro: "Elemento fixado: use Desafixar antes." };
    if (v + I.altura > num(I.parede.altura, 0) + 1e-6) return { ok: false, erro: "Peitoril + altura do vão (" + fmt(v + I.altura) + " m) passam da altura da parede (" + fmt(I.parede.altura) + " m)." };
    var f = I.f, pv = function (x) { var inst = JSON.parse(JSON.stringify(f.inst || {})); inst.Peitoril = x; var a = avaliar(f.famId, f.tipoId, inst); return a && a.abertura ? num(a.abertura.peitoril, NaN) : (a && a.caixa ? num(a.caixa.y0, NaN) : NaN); };
    var x = v, p0 = pv(v);
    if (fin(p0) && Math.abs(p0 - v) > 1e-6) { var p1 = pv(v + 0.1), k = (p1 - p0) / 0.1; if (fin(k) && Math.abs(k) > 1e-6) x = v + (v - p0) / k; }
    return { ok: true, op: { op: "instancia", id: id, inst: { Peitoril: r6(x) } }, valor: r6(v), lado: "peitoril" };
  }

  /* --------------------------------------------------------------- o arraste */
  /* as paredes para onde a abertura pode passar: COLINEARES encostadas (a continuação) e ADJACENTES (o canto, o T) */
  function distPontoSeg(p, a, b) {
    var d = sub(b, a), L2 = dot(d, d); if (L2 < 1e-12) return Math.sqrt(dot(sub(p, a), sub(p, a)));
    var s = Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)), q = P(a.x + d.x * s, a.z + d.z * s), e = sub(p, q);
    return Math.sqrt(dot(e, e));
  }
  function pontas(c) { var u = eixoU(c.rotY), h = c.comprimento / 2; return [P(c.cx - u.x * h, c.cz - u.z * h), P(c.cx + u.x * h, c.cz + u.z * h)]; }
  function ligadas(estado, c) {
    var u = eixoU(c.rotY), n = eixoN(c.rotY), pc = pontas(c), out = [];
    arr(estado && estado.caixas).forEach(function (W) {
      if (!W || W.id === c.id || !ehParedeReta(W) || !sobrepoeY(c, W)) return;
      var uW = eixoU(W.rotY), pw = pontas(W), folga = (c.espessura + W.espessura) / 2 + 0.02;
      var paralela = Math.abs(u.x * uW.z - u.z * uW.x) < 0.01;
      if (paralela) {
        if (Math.abs(dot(sub(P(W.cx, W.cz), P(c.cx, c.cz)), n)) > 0.02) return;   /* paralela mas não colinear */
        var ta = dot(sub(pw[0], P(c.cx, c.cz)), u), tb = dot(sub(pw[1], P(c.cx, c.cz)), u), lo = Math.min(ta, tb), hi = Math.max(ta, tb);
        if (lo > c.comprimento / 2 + folga || hi < -c.comprimento / 2 - folga) return;
        out.push({ parede: W, colinear: true }); return;
      }
      var perto = pc.some(function (p) { return distPontoSeg(p, pw[0], pw[1]) <= folga; }) || pw.some(function (p) { return distPontoSeg(p, pc[0], pc[1]) <= folga; });
      if (perto) out.push({ parede: W, colinear: false });
    });
    return out;
  }
  /* o trecho livre que contém tv (ou o mais perto) */
  function trechoDe(R, tv) {
    var melhor = null, dm = Infinity;
    R.livres.forEach(function (sp) { var d = tv < sp.a ? sp.a - tv : tv > sp.b ? tv - sp.b : 0; if (d < dm) { dm = d; melhor = sp; } });
    return melhor;
  }
  /* o cursor (p = {x, z} do mundo) → a abertura na parede. o = { paredeId (a parede da vez), agarre (tVao − t do cursor
     no começo, na parede de origem), tol (encaixe, m), captura (m: o quanto o cursor pode sair da faixa da parede),
     corte (true: o ponto vem de um corte — troca só para a colinear), semEncaixe } */
  function arrastar(estado, avaliar, id, p, o) {
    o = o || {};
    var I = info(estado, avaliar, id); if (!I) return { ok: false, erro: "Não é uma abertura hospedada em parede reta." };
    if (I.fixo) return { ok: false, erro: "Elemento fixado: use Desafixar antes." };
    if (!p || !fin(p.x) || !fin(p.z)) return { ok: false, erro: "Sem ponto." };
    var atual = acharCaixa(estado, o.paredeId != null ? o.paredeId : I.parede.id); if (!ehParedeReta(atual)) atual = I.parede;
    var cap = fin(o.captura) ? o.captura : 0.25;
    function local(c) { return { t: dot(sub(p, P(c.cx, c.cz)), eixoU(c.rotY)), w: dot(sub(p, P(c.cx, c.cz)), eixoN(c.rotY)) }; }
    function naFaixa(c, q) { return Math.abs(q.w) <= c.espessura / 2 + cap && Math.abs(q.t) <= c.comprimento / 2 + 1e-6; }
    var par = atual, q = local(atual);
    var dentroAtual = o.corte ? Math.abs(q.t) <= atual.comprimento / 2 : naFaixa(atual, q);
    if (!dentroAtual) {
      ligadas(estado, atual).some(function (L) {
        if (o.corte && !L.colinear) return false;
        var qw = local(L.parede);
        if (o.corte ? Math.abs(qw.t) <= L.parede.comprimento / 2 : naFaixa(L.parede, qw)) { par = L.parede; q = qw; return true; }
        return false;
      });
    }
    var tv = q.t + (par.id === I.parede.id && fin(o.agarre) ? o.agarre : 0), larg = I.largura;
    var R = referencias(estado, avaliar, par, id), snap = null;
    if (!o.semEncaixe) {
      var tol = fin(o.tol) ? o.tol : 0.05, cand = [{ t: 0, k: "meio da parede" }];
      var sp0 = trechoDe(R, tv); if (sp0) cand.push({ t: (sp0.a + sp0.b) / 2, k: "meio do trecho livre" });
      R.cruz.forEach(function (c2) {
        [[c2.f0, "face"], [c2.f1, "face"], [c2.eixo, "eixo"]].forEach(function (k) {
          cand.push({ t: k[0] + larg / 2, k: k[1] + " da parede " + c2.id }); cand.push({ t: k[0] - larg / 2, k: k[1] + " da parede " + c2.id });
        });
      });
      cand.forEach(function (c3) { var d = Math.abs(c3.t - tv); if (d <= tol && (!snap || d < snap.d)) snap = { t: c3.t, k: c3.k, d: d }; });
      if (snap) tv = snap.t;
    }
    /* presa: dentro do trecho livre (não sai da parede, não entra na que cruza) */
    var sp = trechoDe(R, tv);
    if (!sp || sp.b - sp.a < larg - 1e-6) return { ok: false, erro: "A abertura não cabe neste trecho da parede.", paredeId: par.id, tVao: r6(tv), t: r6(tv - I.desl), motivo: "naoCabe" };
    var tvC = Math.max(sp.a + larg / 2, Math.min(sp.b - larg / 2, tv));
    if (Math.abs(tvC - tv) > 1e-9) snap = { t: tvC, k: "limite da parede", d: 0 };
    tv = tvC;
    var v = validar(estado, avaliar, id, par.id, tv);
    var res = { ok: v.ok, erro: v.erro || null, conflito: v.conflito || null, paredeId: par.id, trocou: par.id !== I.parede.id, tVao: r6(tv), t: r6(tv - I.desl), snap: snap ? snap.k : null };
    if (v.ok) res.op = opMover(par, id, tv - I.desl);
    return res;
  }

  /* a abertura cujo VÃO (entre as ombreiras, de face a face da parede) contém o ponto da planta; yCorte = a altura do
     plano de corte da planta (a parede tem de passar por ele) — null se nenhuma */
  function naPlanta(estado, avaliar, p, yCorte) {
    var achou = null;
    arr(estado && estado.familias).some(function (f) {
      var I = f && f.host ? info(estado, avaliar, f.id) : null; if (!I || !I.vao) return false;
      if (fin(yCorte)) { var fy = faixaY(I.parede); if (yCorte < fy[0] - 1e-6 || yCorte > fy[1] + 1e-6) return false; }
      var par = I.parede, q = sub(p, P(par.cx, par.cz)), t = dot(q, eixoU(par.rotY)), w = dot(q, eixoN(par.rotY)), tv = I.t + I.desl;
      if (Math.abs(t - tv) <= I.largura / 2 && Math.abs(w) <= par.espessura / 2 + 0.02) { achou = f.id; return true; }
      return false;
    });
    return achou;
  }

  /* =================================================================
   * PAREDES (pedido do Rogério, 18/10/2026: "clico na parede, naquela cota 1,56, digito 2 e ela se move para ficar
   * 2 m livres"): as cotas temporárias até a parede PARALELA mais perto de cada lado (face a face = vão livre, ou
   * núcleo, ou eixo) e a op que leva o vão ao valor digitado — a parede anda PARALELA; as ligadas nas pontas esticam
   * (js/bimvinculos.js, o mesmo do arrastar), portas e janelas acompanham; se quebrar algo, não aplica.
   * Lados: "n+" / "n-" = o sentido da normal da parede (eixoN do rotY). Cota de parede em METROS ("2" = 2 m).
   * ================================================================= */
  function PR() { return dep("BimPrecisao", "./bimprecisao.js"); }
  function VIN() { return dep("BimVinculos", "./bimvinculos.js"); }
  /* a referência da parede c do lado sg (+1/−1, no n DELA): face, núcleo ou eixo */
  function refPropria(c, modo, sg) {
    if (modo === "eixo") return 0;
    if (modo === "nucleo") { var no = nucleoOff(c); return sg > 0 ? no[1] : no[0]; }
    return sg * c.espessura / 2;
  }
  function cotasParede(estado, id, o) {
    o = o || {};
    var P0 = acharCaixa(estado, id); if (!ehParedeReta(P0)) return null;
    var dx0 = fin(o.dx) ? o.dx : 0, dz0 = fin(o.dz) ? o.dz : 0;   /* o arraste em andamento: a parede deslocada */
    var P_ = JSON.parse(JSON.stringify(P0)); P_.cx += dx0; P_.cz += dz0;
    var u = eixoU(P_.rotY), n = eixoN(P_.rotY), C = P(P_.cx, P_.cz), h2 = P_.comprimento / 2, viz = {};
    arr(estado && estado.caixas).forEach(function (W) {
      if (!W || W.id === id || !ehParedeReta(W) || !sobrepoeY(P_, W)) return;
      var uW = eixoU(W.rotY); if (Math.abs(u.x * uW.z - u.z * uW.x) > 0.01) return;   /* só a paralela */
      var d = dot(sub(P(W.cx, W.cz), C), n); if (Math.abs(d) < 1e-4) return;          /* colinear: é continuação */
      var pw = pontas(W), a = dot(sub(pw[0], C), u), b = dot(sub(pw[1], C), u), lo = Math.max(-h2, Math.min(a, b)), hi = Math.min(h2, Math.max(a, b));
      if (hi - lo < 0.05) return;                                                     /* não ficam frente a frente */
      var lado = d > 0 ? "n+" : "n-";
      if (!viz[lado] || Math.abs(d) < Math.abs(viz[lado].d)) viz[lado] = { W: W, d: d, lo: lo, hi: hi };
    });
    var m = o.modos || {}, out = { id: id, parede: P_, base: num(P_.cy, 0) - num(P_.altura, 0) / 2, lados: {} };
    ["n+", "n-"].forEach(function (lado) {
      var v = viz[lado]; if (!v) return;
      var sg = lado === "n+" ? 1 : -1, modo = modoOk(m[lado]), W = v.W, sgW = dot(eixoN(W.rotY), n) >= 0 ? 1 : -1;
      var sP = refPropria(P_, modo, sg), sW;
      if (modo === "eixo") sW = v.d;
      else {
        var offs = modo === "nucleo" ? nucleoOff(W) : [-W.espessura / 2, W.espessura / 2], vals = offs.map(function (x) { return v.d + sgW * x; });
        sW = sg > 0 ? Math.min(vals[0], vals[1]) : Math.max(vals[0], vals[1]);   /* a face de W virada para P */
      }
      out.lados[lado] = { valor: r6(sg * (sW - sP)), sP: r6(sP), sW: r6(sW), ref: W.id, modo: modo, t: r6((v.lo + v.hi) / 2), lo: r6(v.lo), hi: r6(v.hi), sg: sg };
    });
    return out;
  }
  /* as aberturas que ficam fora da própria parede (ou encavaladas) num estado — para comparar antes × depois */
  function aberturasRuins(estado, avaliar) {
    var ruins = {};
    arr(estado && estado.familias).forEach(function (f) {
      var I = f && f.host ? info(estado, avaliar, f.id) : null; if (!I || !I.vao) return;
      var tv = I.t + I.desl, h2 = I.parede.comprimento / 2;
      if (tv - I.largura / 2 < -h2 - 1e-6 || tv + I.largura / 2 > h2 + 1e-6) ruins[f.id] = "fora";
    });
    var B = BE(); if (B && B.vaosDasParedes) { try { var vz = B.vaosDasParedes(estado, avaliar); Object.keys(vz).forEach(function (k) { arr(vz[k].conflitos).forEach(function (c) { ruins[c] = "encavalada"; }); }); } catch (e) {} }
    return ruins;
  }
  /* a op que deixa a cota do lado EXATA em v metros. o = { modos, ops (a lista de ops do editor: com ela o
     resultado é refeito e conferido — abertura fora da parede ou parede sobreposta = não aplica), novoId } */
  function opDaCotaParede(estado, avaliar, id, lado, v, o) {
    o = o || {};
    if (!fin(v) || v < 0) return { ok: false, erro: "Valor inválido para a cota (metros, 0 ou mais)." };
    var cc = cotasParede(estado, id, o); if (!cc) return { ok: false, erro: "Não é uma parede reta." };
    var r = cc.lados[lado]; if (!r) return { ok: false, erro: "Não há parede paralela deste lado." };
    var P0 = acharCaixa(estado, id); if (P0.fixo) return { ok: false, erro: "Parede fixada: use Desafixar antes." };
    var desl = r.sg * (r.valor - v), n = eixoN(P0.rotY);   /* andar Δ para o vizinho encurta o vão em Δ */
    var outro = cc.lados[lado === "n+" ? "n-" : "n+"];
    if (outro && outro.valor + r.sg * desl < -1e-6) return { ok: false, erro: "A parede passaria por cima da parede " + outro.ref + " do outro lado: nada foi aplicado.", motivo: "sobrepoe" };
    var T = { tipo: "mover", dx: r6(n.x * desl), dz: r6(n.z * desl) };
    if (Math.abs(desl) < 1e-7) return { ok: true, op: null, T: T, valor: r6(v), nada: true };
    var rm = moverParede(estado, avaliar, id, T, o); if (rm.ok) rm.valor = r6(v);
    return rm;
  }
  /* a parede id transladada por T (paralela): a op com os vínculos + a conferência (parede paralela que ela
     atravessaria ou em que encostaria por dentro; abertura que sai da parede no estado refeito) */
  function moverParede(estado, avaliar, id, T, o) {
    o = o || {};
    var P0 = acharCaixa(estado, id); if (!ehParedeReta(P0)) return { ok: false, erro: "Não é uma parede reta." };
    if (P0.fixo) return { ok: false, erro: "Parede fixada: use Desafixar antes." };
    var nP = eixoN(P0.rotY), desl = T.dx * nP.x + T.dz * nP.z, C0 = P(P0.cx, P0.cz), C1 = P(P0.cx + T.dx, P0.cz + T.dz), uP = eixoU(P0.rotY), h2 = P0.comprimento / 2, bate = null;
    arr(estado && estado.caixas).forEach(function (W) {
      if (bate || !W || W.id === id || !ehParedeReta(W) || !sobrepoeY(P0, W)) return;
      var uW = eixoU(W.rotY); if (Math.abs(uP.x * uW.z - uP.z * uW.x) > 0.01) return;
      var pw = pontas(W), a = dot(sub(pw[0], C0), uP), b = dot(sub(pw[1], C0), uP), sl = dot(sub(C1, C0), uP);
      if (Math.min(h2 + sl, Math.max(a, b)) - Math.max(-h2 + sl, Math.min(a, b)) < 0.05) return;
      var d0 = dot(sub(P(W.cx, W.cz), C0), nP), d1 = dot(sub(P(W.cx, W.cz), C1), nP), folga = Math.abs(d1) - (P0.espessura + W.espessura) / 2;
      if (Math.abs(d0) < 1e-4) return;
      if ((d0 > 0) !== (d1 > 0) || folga < -1e-6) bate = W.id;
    });
    if (bate) return { ok: false, erro: "A parede passaria por cima da parede " + bate + ": nada foi aplicado.", motivo: "sobrepoe", conflito: bate };
    var Pr = PR(); if (!Pr || !Pr.opTransformar) return { ok: false, erro: "O motor de precisão (js/bimprecisao.js) não carregou." };
    var nid = typeof o.novoId === "function" ? o.novoId : (function () { var k = 0; return function (pre) { return (pre || "v") + "cp" + (++k); }; })();
    var t0 = Pr.opTransformar(estado, [id], T, false, nid); if (!t0 || t0.erro) return { ok: false, erro: (t0 && t0.erro) || "Não deu para mover." };
    var V = VIN(), res = null; try { res = V && V.propagar ? V.propagar(estado, t0.op, { novoId: nid }) : null; } catch (eV) { res = null; }
    var op = res && res.op ? res.op : t0.op, avisos = res ? arr(res.avisos).slice() : [];
    /* conferir no estado REFEITO: abertura que sai da parede (a vizinha encurtou) ou que encavala = não aplica */
    if (Array.isArray(o.ops) && BE()) {
      var antes = aberturasRuins(estado, avaliar), depois = null;
      try { depois = aberturasRuins(BE().aplicar(o.ops.concat([op])), avaliar); } catch (eA) { depois = null; }
      if (depois) { var novos = Object.keys(depois).filter(function (k) { return !antes[k]; }); if (novos.length) return { ok: false, erro: "A abertura " + novos.join(", ") + " ficaria fora da parede (a vizinha encurta): nada foi aplicado.", motivo: "abertura", aberturas: novos }; }
    }
    return { ok: true, op: op, T: T, desl: r6(desl), avisos: avisos, acompanharam: res ? arr(res.acompanharam).slice() : [] };
  }
  /* a COTA PERMANENTE (js/bimanot.js) que pega a parede: o deslocamento (ao longo da normal dela) para o trecho i
     valer `novo`. med = o medirCota do item (geo.n, geo.ts), refs = as refs do item. Planta: desenho = mundo (x, z). */
  function deslocPorCotaPermanente(estado, id, refs, med, i, novo) {
    var P0 = acharCaixa(estado, id); if (!ehParedeReta(P0) || !med || !med.ok || !med.geo || !fin(novo) || novo < 0) return null;
    var R = arr(refs), a = R[i], b = R[i + 1]; if (!a || !b) return null;
    var ea = String(a.el) === String(id), eb = String(b.el) === String(id); if (ea === eb) return null;   /* nenhuma ou as duas na parede */
    var j = ea ? i : i + 1, k = ea ? i + 1 : i, ts = med.geo.ts, nm = med.geo.n, nW = eixoN(P0.rotY);
    var atual = Math.abs(ts[j] - ts[k]), sgn = ts[j] - ts[k] >= 0 ? 1 : -1, nd = nW.x * nm[0] + nW.z * nm[1];
    if (Math.abs(nd) < 0.3) return null;   /* a cota não mede na direção em que a parede anda */
    var kk = sgn * (novo - atual) / nd;
    return { desl: r6(kk), dx: r6(nW.x * kk), dz: r6(nW.z * kk), atual: r6(atual) };
  }

  var BimVaoArr = {
    VERSAO: 1, naPlanta: naPlanta,
    cotasParede: cotasParede, opDaCotaParede: opDaCotaParede, moverParede: moverParede, deslocPorCotaPermanente: deslocPorCotaPermanente, aberturasRuins: aberturasRuins, MODOS: MODOS, ROT_MODO: ROT_MODO,
    info: info, referencias: referencias, cotas: cotas, validar: validar, posicionar: posicionar,
    opDaCota: opDaCota, opPeitoril: opPeitoril, arrastar: arrastar, ligadas: ligadas, lerCota: lerCota, fmt: fmt
  };

  /* =================================================================
   * A TELA (navegador)
   * ================================================================= */
  if (typeof document !== "undefined") {
    var CHAVE = "orcapro:bim:vao-ref:v1";
    var CHAVE_P = "orcapro:bim:parede-ref:v1";   /* a referência das cotas de parede (n+ / n−) */   /* a referência escolhida de cada lado (preferência do aparelho) */
    var NS = "http://www.w3.org/2000/svg";
    function B() { return global.BIM || null; }
    function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function modelador() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
    /* as setas (SVG, giram com a parede): ⇅ atravessa a parede (dentro/fora), ⇄ corre ao longo dela (mão) */
    var ICONE = {
      fora: '<svg xmlns="' + NS + '" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M6 17V3M3 6l3-3 3 3M14 3v14M11 14l3 3 3-3"/></svg>',
      mao: '<svg xmlns="' + NS + '" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><path d="M3 6h14M14 3l3 3-3 3M17 14H3M6 11l-3 3 3 3"/></svg>'
    };
    var UI = {
      _id: null, _a: null, _el: null, _laco: null, _cc: null, _idP: null, _ccP: null, _arrP: null,
      /* a referência de cada lado da cota de PAREDE (n+ / n−): face (vão livre), núcleo ou eixo — gravada no aparelho */
      modosParede: function (novo) {
        var m = { "n+": "face", "n-": "face" };
        try { var g = JSON.parse(global.localStorage.getItem(CHAVE_P) || "null"); if (g) { m["n+"] = modoOk(g["n+"]); m["n-"] = modoOk(g["n-"]); } } catch (e) {}
        if (novo) { if (novo["n+"]) m["n+"] = modoOk(novo["n+"]); if (novo["n-"]) m["n-"] = modoOk(novo["n-"]); try { global.localStorage.setItem(CHAVE_P, JSON.stringify(m)); } catch (e2) {} }
        return m;
      },
      _paredeSel: function (E, id) { var c = acharCaixa(E, id); return modelador() && ehParedeReta(c) ? c : null; },
      _ccAtual: function () { return this._a ? this._a.cc : (this._cc || this._ccP); },
      modos: function (novo) {
        var m = { esq: "face", dir: "face" };
        try { var g = JSON.parse(global.localStorage.getItem(CHAVE) || "null"); if (g) { m.esq = modoOk(g.esq); m.dir = modoOk(g.dir); } } catch (e) {}
        if (novo) { if (novo.esq) m.esq = modoOk(novo.esq); if (novo.dir) m.dir = modoOk(novo.dir); try { global.localStorage.setItem(CHAVE, JSON.stringify(m)); } catch (e2) {} }
        return m;
      },
      _est: function () { var b = B(); try { var e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; } catch (x) { return null; } },
      _aval: function () { var b = B(); return function (f, t, i) { return b && b.familiaAvaliar ? b.familiaAvaliar(f, t, i) : null; }; },
      /* a família é uma abertura que este módulo cuida (o js/bimprecisaoui.js deixa as cotas dela para cá) */
      /* → "vao" (porta/janela: as cotas são todas daqui) | "parede" (as de lado — n+/n− — são daqui) | "" */
      cuida: function (estado, id) { if (!modelador()) return ""; if (info(estado, this._aval(), id)) return "vao"; return this._paredeSel(estado, id) ? "parede" : ""; },
      pode: function (uid) {
        var s = String(uid || ""); if (!/^edit:/.test(s) || !modelador()) return false;
        var E = this._est(); if (!E) return false;
        var I = info(E, this._aval(), s.slice(5)); return !!(I && !I.fixo);
      },
      /* ---------------- seleção e redesenho */
      aoSelecionar: function (uids) {
        var u = arr(uids).length === 1 ? String(uids[0]) : null, E = u && /^edit:/.test(u) ? this._est() : null;
        this._id = E && modelador() && info(E, this._aval(), u.slice(5)) ? u.slice(5) : null;
        this._idP = !this._id && E && this._paredeSel(E, u.slice(5)) ? u.slice(5) : null;   /* PAREDE: as cotas até as paralelas */
        this._arrP = null;
        this._fecharCampo(); this.atualizar();
      },
      aposRebuild: function () {
        var E = this._est();
        if (this._id && (!E || !info(E, this._aval(), this._id))) this._id = null;
        if (this._idP && (!E || !this._paredeSel(E, this._idP))) this._idP = null;
        this.atualizar();
      },
      atualizar: function () {
        var E = this._id || this._idP ? this._est() : null;
        this._cc = E && this._id ? cotas(E, this._aval(), this._id, { modos: this.modos() }) : null;
        this._ccP = E && this._idP ? cotasParede(E, this._idP, { modos: this.modosParede(), dx: this._arrP ? this._arrP.dx : 0, dz: this._arrP ? this._arrP.dz : 0 }) : null;
        if (this._ccP && !Object.keys(this._ccP.lados).length && !this._perms(E).length) this._ccP = null;
        this.desenhar();
      },
      /* ARRASTAR A PAREDE (o arraste de sempre: js/bimselecao.js na planta, js/bimprecisaoui.js no 3D): as cotas ao vivo */
      arrasteParede: function (id, dx, dz) {
        if (id == null || String(id) !== String(this._idP)) { if (this._arrP) { this._arrP = null; this.atualizar(); } return; }
        this._arrP = { dx: num(dx, 0), dz: num(dz, 0) }; this.atualizar();
      },
      /* as COTAS PERMANENTES da vista ativa que pegam a parede selecionada (planta): [{ id, i, valor, med, refs }] */
      _perms: function (E) {
        var id = this._idP, vis = this._vista(), A7 = global.BimAnotP7, out = [];
        if (!id || !E || vis === "3d" || !A7 || !A7.medirCota || this._arrP) return out;
        var def = this._def(vis); if (!def || def.tipo !== "planta" || def.p6 === "forro" || def.p6base === "forro") return out;
        arr(E.anot2d && E.anot2d.itens).forEach(function (it) {
          if (!it || it.tipo !== "cota" || it.vista !== vis || !arr(it.refs).some(function (r) { return r && String(r.el) === String(id); })) return;
          if (it.cota !== "linear" && it.cota !== "alinhada") return;
          var m = null; try { m = A7.medirCota(E, it, { corte: false, vista: vis }); } catch (e) { m = null; }
          if (!m || !m.ok || !m.segs) return;
          m.segs.forEach(function (sgm, i) {
            var d = deslocPorCotaPermanente(E, id, it.refs, m, i, sgm.valor); if (!d) return;
            out.push({ id: it.id, i: i, valor: sgm.valor, med: m, refs: it.refs });
          });
        });
        return out;
      },
      /* a projeção da vista ativa (o mesmo do js/biminstcon.js): 3D (BIM.telaDe) ou 2D (o SVG da planta/corte) */
      _vista: function () {
        var tela = document.querySelector('.bim-tela[data-ativa="1"]'), vis = tela ? tela.getAttribute("data-vista") : "3d";
        return vis || "3d";
      },
      _def: function (vis) { var D = global.Bim2D; return D && D.def ? D.def(vis) : null; },
      _svgDe: function (vis) { var D = global.Bim2D, c = D && D._cache ? D._cache[vis] : null; return c && (c.svg || (c.el && c.el.querySelector ? c.el.querySelector("svg") : null)); },
      _noDesenho: function (def, p) {
        var K = global.BimInstCon; if (K && K.noDesenho) return K.noDesenho(def, p);
        if (def && def.tipo === "planta") return def.p6 === "forro" || def.p6base === "forro" ? { x: -p.x, y: p.z } : { x: p.x, y: p.z };
        return null;
      },
      _projetor: function () {
        var vis = this._vista(), b = B();
        if (vis !== "3d") {
          var sv = this._svgDe(vis), def = this._def(vis), self = this;
          if (!sv || !sv.getScreenCTM || !def) return null;
          var ctm = sv.getScreenCTM(); if (!ctm) return null;
          var rc = sv.getBoundingClientRect(); if (!(rc.width > 0)) return null;
          return { vista: vis, tipo: def.tipo === "planta" ? "planta" : "corte", rc: rc,
            f: function (p) { var d = self._noDesenho(def, p); if (!d) return null; var pt = sv.createSVGPoint(); pt.x = d.x; pt.y = d.y; var q = pt.matrixTransform(ctm); return { x: q.x, y: q.y }; } };
        }
        var cv = document.querySelector('canvas[data-bim-nav="1"]'), rc3 = cv ? cv.getBoundingClientRect() : null;
        if (!b || !b.telaDe || !rc3 || !(rc3.width > 0)) return null;
        return { vista: "3d", tipo: "3d", rc: rc3, f: function (p) { var q = b.telaDe(p.x, p.y, p.z); return q && !q.atras ? q : null; } };
      },
      /* o lado da parede virado para a câmera (3D): as cotas ficam na face que se vê */
      _ladoCam: function (par) {
        try { var F = B().renderFonte(), cp = F && F.camera ? F.camera.position : null; if (cp) return dot(sub(P(cp.x, cp.z), P(par.cx, par.cz)), eixoN(par.rotY)) >= 0 ? 1 : -1; } catch (e) {}
        return 1;
      },
      /* as LINHAS (mundo) e os RÓTULOS das cotas para a vista: { linhas:[[a,b,cls]], rotulos:[{lado,p,valor}], alcas:[{lado,p,modo}], vao:[pts] } */
      _geometria: function (cc, tipo, previa) {
        var par = cc.parede, u = eixoU(par.rotY), n = eixoN(par.rotY), C = P(par.cx, par.cz), e2 = par.espessura / 2, I = cc.info;
        var y0 = cc.base + I.peitoril, y1 = y0 + I.altura, ym = (y0 + y1) / 2, sg = tipo === "3d" ? this._ladoCam(par) : 1;
        function M(t, w, y) { return { x: C.x + u.x * t + n.x * w, y: y, z: C.z + u.z * t + n.z * w }; }
        var g = { linhas: [], rotulos: [], alcas: [], vao: [] }, off = tipo === "planta" ? e2 + 0.35 : sg * (e2 + 0.01), yc = tipo === "planta" ? cc.base : ym;
        [["esq", cc.esq, cc.x0], ["dir", cc.dir, cc.x1]].forEach(function (k) {
          var r = k[1]; if (!r) return;
          g.linhas.push([M(r.s, off, yc), M(k[2], off, yc), "cota"]);
          if (tipo === "planta") { g.linhas.push([M(r.s, e2 * 0.6, yc), M(r.s, off + 0.08, yc), "chamada"]); g.linhas.push([M(k[2], e2 * 0.6, yc), M(k[2], off + 0.08, yc), "chamada"]); }
          else { g.linhas.push([M(r.s, off, yc - 0.08), M(r.s, off, yc + 0.08), "chamada"]); g.linhas.push([M(k[2], off, yc - 0.08), M(k[2], off, yc + 0.08), "chamada"]); }
          g.rotulos.push({ lado: k[0], p: M((r.s + k[2]) / 2, off, yc), valor: r.valor, a: M(r.s, off, yc), b: M(k[2], off, yc) });
          g.alcas.push({ lado: k[0], p: M(r.s, off, yc), modo: r.modo });
        });
        if (tipo !== "planta" && (I.peitoril > 0.005 || I.peitorilEditavel)) {
          var tp = cc.x0 + Math.min(0.15, I.largura / 4);
          g.linhas.push([M(tp, off, cc.base), M(tp, off, y0), "cota"]);
          g.linhas.push([M(tp - 0.08, off, cc.base), M(tp + 0.08, off, cc.base), "chamada"]);
          g.rotulos.push({ lado: "peitoril", p: M(tp, off, (cc.base + y0) / 2), valor: I.peitoril });
        }
        /* SETAS DE INVERTER (js/vaoinverter.js): ⇅ dentro/fora na face da parede, ⇄ mão ao longo do vão — onde as cotas não passam */
        g.setas = [];
        if (!previa) {
          var tc = (cc.x0 + cc.x1) / 2;
          /* ⇅ junto à ombreira direita (não cobre o corpo da porta, que se clica e se arrasta); ⇄ no meio, fora da linha das cotas */
          if (tipo === "planta") { g.setas.push({ id: "fora", p: M(cc.x1 + 0.22, -(e2 + 0.20), yc) }); g.setas.push({ id: "mao", p: M(tc, e2 + 0.35, yc) }); }
          else { g.setas.push({ id: "fora", p: M(cc.x1 + 0.22, off, y0 + 0.30) }); g.setas.push({ id: "mao", p: M(tc, off, y1 + 0.16) }); }
          g.eixo = { a: M(0, 0, yc), b: M(1, 0, yc) };
        }
        if (previa) g.vao = tipo === "planta" ? [M(cc.x0, -e2, yc), M(cc.x1, -e2, yc), M(cc.x1, e2, yc), M(cc.x0, e2, yc)] : [M(cc.x0, off, y0), M(cc.x1, off, y0), M(cc.x1, off, y1), M(cc.x0, off, y1)];
        return g;
      },
      _camada: function () {
        if (!this._el) {
          var el = document.createElement("div"); el.className = "bim-vao-cotas"; el.setAttribute("data-bim-vao", "1");
          el.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:40;pointer-events:none";
          el.innerHTML = '<svg xmlns="' + NS + '" style="position:fixed;left:0;top:0;width:100vw;height:100vh;overflow:visible;pointer-events:none"></svg>';
          document.body.appendChild(el); this._el = el; this._ligarEventos(el);
        }
        return this._el;
      },
      desenhar: function () {
        var el = this._camada(), cc = this._ccAtual(), ehP = !!(cc && cc.lados), E0 = ehP ? this._est() : null;
        Array.prototype.slice.call(el.querySelectorAll("[data-vao-cota],[data-vao-alca],[data-vao-perm],[data-vao-inv]")).forEach(function (b) { if (!b.querySelector("input")) b.parentNode.removeChild(b); });
        if (!cc) { el.querySelector("svg").innerHTML = ""; el.style.display = "none"; this._pararLaco(); return; }
        el.style.display = "";
        var self = this, arrastando = !!this._a;
        (ehP ? ["n+", "n-"] : ["esq", "dir", "peitoril"]).forEach(function (lado) {
          if (el.querySelector('[data-vao-cota="' + lado + '"] input')) return;
          var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-vao-cota", lado);
          b.style.cssText = "position:fixed;transform:translate(-50%,-50%);pointer-events:" + (arrastando ? "none" : "auto") + ";padding:1px 6px;border-radius:4px;border:1px solid var(--aco,#2d6a9c);background:var(--card-bg,#fff);color:var(--aco,#2d6a9c);font:600 12px/1.3 sans-serif;cursor:text;white-space:nowrap;display:none";
          b.title = ehP ? "Vão até a parede paralela — clique e digite em metros (2 = 2,00 m): a parede selecionada anda" : lado === "peitoril" ? "Peitoril — clique e digite (5 = 5 cm; 1,10 = 1,10 m)" : "Distância " + (lado === "esq" ? "à esquerda" : "à direita") + " — clique e digite (5 = 5 cm; 0,05 = 0,05 m)";
          b.setAttribute("aria-label", b.title);
          el.appendChild(b);
        });
        (ehP ? ["n+", "n-"] : ["esq", "dir"]).forEach(function (lado) {
          var a = document.createElement("button"); a.type = "button"; a.setAttribute("data-vao-alca", lado);
          a.style.cssText = "position:fixed;transform:translate(-50%,-50%);pointer-events:" + (arrastando ? "none" : "auto") + ";width:16px;height:16px;padding:0;border-radius:50%;border:2px solid var(--aco,#2d6a9c);background:var(--card-bg,#fff);color:var(--aco,#2d6a9c);font:700 9px/12px sans-serif;cursor:pointer;display:none";
          el.appendChild(a);
        });
        if (!ehP && !arrastando) this.acoes().forEach(function (ac) {
          var b = document.createElement("button"); b.type = "button"; b.tabIndex = -1; b.setAttribute("data-vao-inv", ac.id); b.setAttribute("data-valor", ac.valor ? "1" : "0");
          b.style.cssText = "position:fixed;transform:translate(-50%,-50%);pointer-events:auto;width:26px;height:26px;padding:0;border-radius:50%;border:2px solid var(--aco,#2d6a9c);background:var(--card-bg,#fff);color:var(--aco,#2d6a9c);cursor:pointer;display:none;box-shadow:0 1px 4px rgba(0,0,0,.25);line-height:0";
          b.title = ac.rotulo + " — " + ac.dica + " (" + (ac.id === "fora" ? "espaço" : "Shift+espaço") + "; Ctrl+Z desfaz)";
          b.setAttribute("aria-label", ac.rotulo);
          b.innerHTML = ICONE[ac.id];
          el.appendChild(b);
        });
        if (ehP && !arrastando) this._perms(E0).forEach(function (q) {
          var k = q.id + "|" + q.i; if (el.querySelector('[data-vao-perm="' + k.replace(/"/g, "") + '"] input')) return;
          var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-vao-perm", k); b.setAttribute("data-valor", String(q.valor));
          b.style.cssText = "position:fixed;transform:translate(-50%,-50%);pointer-events:auto;padding:0 4px;border-radius:3px;border:1px dashed var(--aco,#2d6a9c);background:transparent;color:transparent;font:600 12px/1.3 sans-serif;cursor:text;white-space:nowrap;display:none";
          b.title = "Cota da parede selecionada — clique e digite em metros: a parede anda"; b.setAttribute("aria-label", b.title); b.textContent = fmt(q.valor);
          el.appendChild(b);
        });
        this.posicionar();
        if (!this._laco && typeof requestAnimationFrame === "function") {
          var passo = function () { if (!self._ccAtual()) { self._laco = null; return; } self.posicionar(); self._laco = requestAnimationFrame(passo); };
          this._laco = requestAnimationFrame(passo);
        }
      },
      _pararLaco: function () { if (this._laco && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._laco); this._laco = null; },
      /* uma ferramenta armada (cota, texto, parede, porta…) — as cotas da abertura saem da frente: o clique é dela */
      _ferramentaArmada: function () {
        try { if (global.BimAnot2DUI && global.BimAnot2DUI._f) return true; } catch (e) {}
        try { if (global.BimPlantaModelar && global.BimPlantaModelar.ferramenta && global.BimPlantaModelar.ferramenta()) return true; } catch (e2) {}
        try { var pz = B() && B().precisao ? B().precisao() : null; if (pz && pz.ferramenta && pz.ferramenta()) return true; } catch (e3) {}
        try { var ed = B() && B().planta2d ? B().planta2d() : null, tr = ed && ed.traco ? ed.traco() : null; if (tr && tr.on && tr.sub) return true; } catch (e4) {}
        return false;
      },
      posicionar: function () {
        var el = this._el, cc = this._ccAtual(); if (!el || !cc) return;
        var pj = this._ferramentaArmada() && !this._a ? null : this._projetor(), svg = el.querySelector("svg");
        /* PAREDE no 3D: a tela é a de sempre (js/bimprecisaoui.js) — estas cotas editáveis são só da planta e do corte */
        if (pj && cc.lados && pj.tipo === "3d") pj = null;
        if (!pj) { svg.innerHTML = ""; Array.prototype.forEach.call(el.querySelectorAll("button"), function (b) { if (!b.querySelector("input")) b.style.display = "none"; }); return; }
        var g = cc.lados ? this._geometriaParede(cc, pj.tipo) : this._geometria(cc, pj.tipo, !!this._a), rc = pj.rc;
        function dentro(q) { return q && q.x >= rc.left - 2 && q.x <= rc.right + 2 && q.y >= rc.top - 2 && q.y <= rc.bottom + 2; }
        var h = "", ruim = this._a && this._a.res && !this._a.res.ok;
        var cor = ruim ? "#dc2626" : "var(--aco,#2d6a9c)";
        if (g.vao.length) {
          var qs = g.vao.map(pj.f);
          if (qs.every(function (q) { return !!q; })) h += '<polygon data-vao-previa="' + (ruim ? "ruim" : "ok") + '" points="' + qs.map(function (q) { return q.x.toFixed(1) + "," + q.y.toFixed(1); }).join(" ") + '" fill="' + (ruim ? "rgba(220,38,38,.25)" : "rgba(56,189,248,.30)") + '" stroke="' + cor + '" stroke-width="2"/>';
        }
        g.linhas.forEach(function (l) {
          var a = pj.f(l[0]), b = pj.f(l[1]); if (!a || !b || (!dentro(a) && !dentro(b))) return;
          h += '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '" stroke="' + cor + '" stroke-width="' + (l[2] === "cota" ? 1.6 : 1) + '"' + (l[2] === "chamada" ? ' stroke-dasharray="3 2"' : "") + "/>";
        });
        svg.innerHTML = h;
        var vistos = {}, vistosQ = {};
        g.rotulos.forEach(function (r) {
          var b = el.querySelector('[data-vao-cota="' + r.lado + '"]'); if (!b) return; vistos[r.lado] = 1;
          var q = pj.f(r.p); if (!dentro(q)) { if (!b.querySelector("input")) b.style.display = "none"; return; }
          /* cota curta (a boneca de 5 cm): o número sai para FORA, além da referência — senão cobre a alça e a porta */
          if (r.par) {
            /* PAREDE: o número fica no meio do vão (livre, entre as duas paredes); só se o vão for mais curto que o número ele corre ao longo da parede,
               para fora do ponto onde se clica na parede — nunca por cima de uma delas */
            var pa = pj.f(r.a), pb = pj.f(r.b);
            if (pa && pb) { var ex = pa.x - pb.x, ey = pa.y - pb.y, ed = Math.sqrt(ex * ex + ey * ey); if (ed < 44) { var lx = ed > 1e-3 ? -ey / ed : 1, ly = ed > 1e-3 ? ex / ed : 0; q = { x: q.x + lx * 46, y: q.y + ly * 46 }; } }
          } else if (r.a && r.b) { var qa = pj.f(r.a), qb = pj.f(r.b); if (qa && qb) { var dx = qa.x - qb.x, dy = qa.y - qb.y, dd = Math.sqrt(dx * dx + dy * dy); if (dd < 70) { var ux = dd > 1e-3 ? dx / dd : -1, uy = dd > 1e-3 ? dy / dd : 0; q = { x: qa.x + ux * 34, y: qa.y + uy * 34 }; } } }
          vistosQ[r.lado] = q;
          b.style.left = q.x + "px"; b.style.top = q.y + "px"; b.style.display = "";
          if (!b.querySelector("input")) { b.textContent = fmt(r.valor); b.setAttribute("data-valor", String(r.valor)); }
        });
        Array.prototype.forEach.call(el.querySelectorAll("[data-vao-cota]"), function (b) { if (!vistos[b.getAttribute("data-vao-cota")] && !b.querySelector("input")) b.style.display = "none"; });
        var va = {};
        g.alcas.forEach(function (a) {
          var b = el.querySelector('[data-vao-alca="' + a.lado + '"]'); if (!b) return; va[a.lado] = 1;
          var q = pj.f(a.p);
          if (a.par && q) {
            /* PAREDE: a alça sai da parede e vai para o vão, ao lado do número da cota (acompanha o número se ele correu) */
            var nl = vistosQ[a.lado], c0 = pj.f(a.c0), ao = pj.f(a.ao);
            if (nl && c0 && ao) { var vx = ao.x - c0.x, vy = ao.y - c0.y, vd = Math.sqrt(vx * vx + vy * vy) || 1; q = { x: nl.x + vx / vd * 32, y: nl.y + vy / vd * 32 }; }
            else q = null;
          }
          if (!dentro(q) || this._a) { b.style.display = "none"; return; }
          b.style.left = q.x + "px"; b.style.top = q.y + "px"; b.style.display = "";
          b.textContent = a.modo === "eixo" ? "E" : a.modo === "nucleo" ? "N" : "F";
          b.setAttribute("data-modo", a.modo);
          b.title = "Referência: " + ROT_MODO[a.modo] + " — clique para alternar (face → núcleo → eixo)";
          b.setAttribute("aria-label", b.title);
        }, this);
        Array.prototype.forEach.call(el.querySelectorAll("[data-vao-alca]"), function (b) { if (!va[b.getAttribute("data-vao-alca")]) b.style.display = "none"; });
        /* SETAS DE INVERTER: giram com a parede na tela (⇄ fica ao longo dela, ⇅ atravessa) */
        var vi = {}, angW = 0;
        if (g.eixo) { var e1 = pj.f(g.eixo.a), e2q = pj.f(g.eixo.b); if (e1 && e2q) { angW = Math.atan2(e2q.y - e1.y, e2q.x - e1.x) * 180 / Math.PI; if (angW > 90) angW -= 180; if (angW <= -90) angW += 180; } }
        (g.setas || []).forEach(function (s) {
          var b = el.querySelector('[data-vao-inv="' + s.id + '"]'); if (!b) return; vi[s.id] = 1;
          var q = pj.f(s.p);
          if (!dentro(q) || this._a) { b.style.display = "none"; return; }
          b.style.left = q.x + "px"; b.style.top = q.y + "px"; b.style.display = "";
          var sv2 = b.firstChild; if (sv2 && sv2.style) sv2.style.transform = "rotate(" + angW.toFixed(1) + "deg)";
        }, this);
        Array.prototype.forEach.call(el.querySelectorAll("[data-vao-inv]"), function (b) { if (!vi[b.getAttribute("data-vao-inv")]) b.style.display = "none"; });
        /* COTA PERMANENTE: um botão por cima do número dela (clicar e digitar move a parede selecionada) */
        Array.prototype.forEach.call(el.querySelectorAll("[data-vao-perm]"), function (b) {
          if (b.querySelector("input")) return;
          var k = b.getAttribute("data-vao-perm").split("|"), sv = pj.vista !== "3d" ? this._svgDe(pj.vista) : null;
          var tx = sv ? sv.querySelector('g[data-a7="' + k[0].replace(/"/g, "") + '"] text[data-a7-seg="' + k[1] + '"]') : null, r2 = tx ? tx.getBoundingClientRect() : null;
          if (!r2 || !(r2.width > 0) || !dentro({ x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 })) { b.style.display = "none"; return; }
          b.style.left = (r2.left + r2.width / 2) + "px"; b.style.top = (r2.top + r2.height / 2) + "px"; b.style.minWidth = Math.max(30, r2.width + 8) + "px"; b.style.display = "";
        }, this);
      },
      /* PAREDE: a cota de cada lado atravessa o vão no meio do trecho frente a frente (planta: no nível; 3D/corte: a 1 m) */
      _geometriaParede: function (cc, tipo) {
        var par = cc.parede, u = eixoU(par.rotY), n = eixoN(par.rotY), C = P(par.cx, par.cz);
        var yc = tipo === "planta" ? cc.base : cc.base + Math.min(1.0, num(par.altura, 2) / 2);
        function M(t, w, y) { return { x: C.x + u.x * t + n.x * w, y: y, z: C.z + u.z * t + n.z * w }; }
        var g = { linhas: [], rotulos: [], alcas: [], vao: [] };
        ["n+", "n-"].forEach(function (lado) {
          var r = cc.lados[lado]; if (!r) return;
          var t = r.t, k = 0.08;
          g.linhas.push([M(t, r.sP, yc), M(t, r.sW, yc), "cota"]);
          g.linhas.push([M(t - k, r.sP, yc), M(t + k, r.sP, yc), "chamada"]); g.linhas.push([M(t - k, r.sW, yc), M(t + k, r.sW, yc), "chamada"]);
          g.rotulos.push({ lado: lado, p: M(t, (r.sP + r.sW) / 2, yc), valor: r.valor, a: M(t, r.sP, yc), b: M(t, r.sW, yc), par: true });
          g.alcas.push({ lado: lado, p: M(t, r.sW, yc), modo: r.modo, par: true, ao: M(t + 1, (r.sP + r.sW) / 2, yc), c0: M(t, (r.sP + r.sW) / 2, yc) });   /* par: a alça fica ao lado do número, no vão — nunca sobre a parede (é onde se clica nela) */
        });
        return g;
      },
      /* ---------------- clicar no número / na alça */
      _ligarEventos: function (el) {
        var self = this;
        if (!this._tkInv) { this._tkInv = function (e) { self._teclaInverter(e); }; document.addEventListener("keydown", this._tkInv, true); }
        el.addEventListener("pointerdown", function (e) { if (e.target && e.target.closest && e.target.closest("button")) e.stopPropagation(); });
        /* a roda passa por cima dos botões das cotas: o zoom da vista é de quem está por baixo */
        el.addEventListener("wheel", function (e) {
          if (!e.target || !e.target.closest || !e.target.closest("button") || e.__vaoRepasse) return;
          var bs = Array.prototype.slice.call(el.querySelectorAll("button")), ant = bs.map(function (x) { return x.style.pointerEvents; });
          bs.forEach(function (x) { x.style.pointerEvents = "none"; });
          var alvo = null; try { alvo = document.elementFromPoint(e.clientX, e.clientY); } catch (e1) {}
          bs.forEach(function (x, i) { x.style.pointerEvents = ant[i]; });
          if (!alvo || alvo === e.target) return;
          e.preventDefault(); e.stopPropagation();
          var ne = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey });
          ne.__vaoRepasse = true; alvo.dispatchEvent(ne);
        }, { passive: false });
        el.addEventListener("click", function (e) {
          var al = e.target.closest ? e.target.closest("[data-vao-alca]") : null;
          if (al) {
            e.preventDefault(); e.stopPropagation();
            var lado = al.getAttribute("data-vao-alca"), ehPar = lado === "n+" || lado === "n-", m = ehPar ? self.modosParede() : self.modos(), i = MODOS.indexOf(m[lado]), prox = MODOS[(i + 1) % MODOS.length];
            /* pula o núcleo quando ele é a própria face (parede sem camadas): o clique sempre muda alguma coisa */
            if (prox === "nucleo" && (ehPar ? self._nucleoIgualFaceP(lado) : (self._cc && self._nucleoIgualFace(self._cc, lado)))) prox = "eixo";
            var nv = {}; nv[lado] = prox; if (ehPar) self.modosParede(nv); else self.modos(nv); self.atualizar();
            status("Cota " + (ehPar ? "da parede" : lado === "esq" ? "esquerda" : "direita") + ": medida até a " + ROT_MODO[prox] + ".");
            return;
          }
          var iv = e.target.closest ? e.target.closest("[data-vao-inv]") : null;
          if (iv) { e.preventDefault(); e.stopPropagation(); self.inverter(iv.getAttribute("data-vao-inv")); return; }
          var b = e.target.closest ? e.target.closest("[data-vao-cota],[data-vao-perm]") : null;
          if (!b || b.querySelector("input")) return;
          e.preventDefault(); e.stopPropagation();
          self._abrirCampo(b);
        });
      },
      _nucleoIgualFaceP: function (lado) {
        var E = this._est(); if (!E || !this._idP) return true;
        var mf = {}, mn = {}; mf[lado] = "face"; mn[lado] = "nucleo";
        var a = cotasParede(E, this._idP, { modos: mf }), b = cotasParede(E, this._idP, { modos: mn });
        return !(a && b && a.lados[lado] && b.lados[lado]) || Math.abs(a.lados[lado].valor - b.lados[lado].valor) < 1e-6;
      },
      _nucleoIgualFace: function (cc, lado) {
        var r = cc[lado]; if (!r || !r.ref) return true;
        var q = cc.refs.cruz.filter(function (c) { return c.id === r.ref; })[0];
        return !q || (Math.abs(q.n0 - q.f0) < 1e-6 && Math.abs(q.n1 - q.f1) < 1e-6);
      },
      _abrirCampo: function (b) {
        var self = this, perm = b.getAttribute("data-vao-perm"), lado = perm ? "perm:" + perm : b.getAttribute("data-vao-cota"), v0 = num(b.getAttribute("data-valor"), 0);
        var met = !!perm || lado === "n+" || lado === "n-";   /* PAREDE: metro ("2" = 2,00 m), como a cota mostra */
        if (perm) { b.style.background = "var(--card-bg,#fff)"; b.style.color = "var(--aco,#2d6a9c)"; }
        b.innerHTML = '<input data-vao-in="' + esc(lado) + '" type="text" inputmode="decimal" autocomplete="off" style="width:5.5em;font:600 12px sans-serif;border:0;background:transparent;color:inherit;text-align:center" value="' + esc(fmt(v0)) + '" aria-label="' + (met ? "Novo vão em metros (2 = 2,00 m)" : "Nova distância (5 = 5 cm; 0,05 = 0,05 m)") + '">';
        var inp = b.querySelector("input"); inp.focus(); inp.select();
        inp.addEventListener("keydown", function (ev) {
          ev.stopPropagation();
          if (ev.key === "Escape") { ev.preventDefault(); self._fecharCampo(); self.atualizar(); return; }
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          var r = self.aplicarCota(lado, inp.value);
          if (!r.ok) { inp.style.color = "#dc2626"; inp.title = r.erro || ""; }
        });
        inp.addEventListener("blur", function () { setTimeout(function () { if (inp.parentNode && document.activeElement !== inp) { self._fecharCampo(); self.posicionar(); } }, 150); });
        status(met ? "Digite o vão em metros e Enter (2 = 2,00 m): a parede selecionada anda paralela. Esc cancela." : "Digite a distância e Enter (5 = 5 cm; 0,05 = 0,05 m). Esc cancela.");
      },
      _fecharCampo: function () {
        if (!this._el) return;
        Array.prototype.forEach.call(this._el.querySelectorAll("[data-vao-cota] input, [data-vao-perm] input"), function (i) { var b = i.parentNode; b.removeChild(i); b.textContent = fmt(num(b.getAttribute("data-valor"), 0)); if (b.hasAttribute("data-vao-perm")) { b.style.background = "transparent"; b.style.color = "transparent"; } });
      },
      /* digitar na cota: o texto → a op (um Ctrl+Z desfaz) */
      aplicarCota: function (lado, texto) {
        if (this._idP && (lado === "n+" || lado === "n-" || /^perm:/.test(lado))) return this.aplicarCotaParede(lado, texto);
        var E = this._est(), b = B(); if (!E || !this._id || !b) return { ok: false, erro: "Nada selecionado." };
        var v = lerCota(texto); if (v == null) { status("Valor inválido: digite 5 (cm) ou 0,05 (m)."); return { ok: false, erro: "Valor inválido." }; }
        var r = opDaCota(E, this._aval(), this._id, lado, v, { modos: this.modos() });
        if (!r.ok) { status("Cota: " + r.erro); return r; }
        var ok = r.op.op === "instancia" ? b.instanciaAlterar(this._id, { inst: r.op.inst }) : b.b2Op(r.op);
        if (!ok) { status("Não foi possível gravar a cota."); return { ok: false, erro: "Não gravou." }; }
        this._fecharCampo();
        status((lado === "peitoril" ? "Peitoril" : "Distância " + (lado === "esq" ? "à esquerda" : "à direita")) + " agora é " + fmt(v) + " m (Ctrl+Z desfaz).");
        this.atualizar();
        return r;
      },
      /* PAREDE: o vão digitado (metros) → a parede anda paralela, com os vínculos (as ligadas esticam); confere antes */
      aplicarCotaParede: function (lado, texto) {
        var E = this._est(), b = B(), id = this._idP; if (!E || !id || !b) return { ok: false, erro: "Nada selecionado." };
        var Pr = PR(), v = Pr && Pr.lerNumero ? Pr.lerNumero(texto) : null;
        if (v == null || v < 0) { status("Valor inválido: digite o vão em metros (2 ou 2,00)."); return { ok: false, erro: "Valor inválido." }; }
        var ops = []; try { ops = b.editarOps() || []; } catch (eO) { ops = []; }
        var r;
        if (/^perm:/.test(lado)) {
          var k = lado.slice(5).split("|"), q = this._perms(E).filter(function (x) { return String(x.id) === k[0] && String(x.i) === k[1]; })[0];
          var d = q ? deslocPorCotaPermanente(E, id, q.refs, q.med, q.i, v) : null;
          if (!d) { status("Esta cota não mede a parede selecionada na direção em que ela anda."); return { ok: false, erro: "Cota sem direção." }; }
          r = moverParede(E, this._aval(), id, { tipo: "mover", dx: d.dx, dz: d.dz }, { ops: ops });
        } else r = opDaCotaParede(E, this._aval(), id, lado, v, { modos: this.modosParede(), ops: ops });
        if (!r.ok) { status("Cota da parede: " + r.erro); return r; }
        if (r.nada) { this._fecharCampo(); status("A parede já está com " + fmt(v) + " m."); return r; }
        var pz = b.precisao ? b.precisao() : null, feito = pz && pz.mover ? pz.mover(r.T.dx, r.T.dz) : null;
        if (!feito || !feito.ok) { status("Não foi possível mover a parede" + (feito && feito.erro ? ": " + feito.erro : ".")); return { ok: false, erro: "Não gravou." }; }
        this._fecharCampo();
        status("Vão agora é " + fmt(v) + " m: a parede andou " + fmt(Math.abs(r.desl)) + " m" + (feito.acompanharam && feito.acompanharam.length ? "; " + feito.acompanharam.length + " parede(s) ligada(s) acompanharam" : "") + " (Ctrl+Z desfaz).");
        this.atualizar();
        return r;
      },
      /* ---------------- INVERTER / ESPELHAR (js/vaoinverter.js): as setas, a barra de espaço, as Propriedades e o menu do botão direito */
      /* as inversões que a abertura selecionada aceita: [{ id: "fora"|"mao", param, valor, rotulo, dica }] */
      acoes: function (idArg) {
        var id = idArg != null ? idArg : this._id, VI = global.VaoInverter, E = id != null ? this._est() : null; if (!VI || !E) return [];
        var f = acharFam(E, id); if (!f || !f.host) return [];
        var av = this._aval()(f.famId, f.tipoId, f.inst), fam = null;
        try { fam = (global.FamiliaUI && global.FamiliaUI.obter ? global.FamiliaUI.obter(f.famId) : null) || (global.FamiliasRA ? global.FamiliasRA.obter(f.famId, true) : null); } catch (e) {}
        return fam && av ? VI.acoes(fam, av, f.inst) : [];
      },
      /* grava a inversão (UMA op de instância: Ctrl+Z desfaz) e redesenha na hora */
      inverter: function (qual, idArg) {
        var id = idArg != null ? idArg : this._id, b = B(), VI = global.VaoInverter; if (id == null || !b || !VI) return { ok: false, erro: "Nada selecionado." };
        var ac = this.acoes(id).filter(function (x) { return x.id === qual; })[0];
        if (!ac) { status(qual === "mao" ? "Esta peça não tem mão (espelhar)." : "Esta peça não tem lado (dentro/fora)."); return { ok: false, erro: "Sem esta ação." }; }
        var o = VI.op(id, ac);
        if (!b.instanciaAlterar(id, { inst: o.inst })) { status("Não foi possível gravar."); return { ok: false, erro: "Não gravou." }; }
        status(qual === "fora" ? "Invertido: agora " + (o.inst.Abre_para_fora ? "para fora" : "para dentro") + " (Ctrl+Z desfaz)." : "Espelhado: dobradiça à " + (o.inst.Mao_direita ? "direita" : "esquerda") + " (Ctrl+Z desfaz).");
        this.atualizar();
        return { ok: true, op: o };
      },
      _teclaInverter: function (e) {
        if (!this._id || this._a || e.ctrlKey || e.metaKey || e.altKey) return false;
        if (!(e.key === " " || e.code === "Space")) return false;
        var t = e.target, tg = t && t.tagName ? String(t.tagName).toLowerCase() : "";
        if (tg === "input" || tg === "textarea" || tg === "select" || (t && t.isContentEditable)) return false;
        if (this._ferramentaArmada()) return false;
        var qual = e.shiftKey ? "mao" : "fora";
        if (!this.acoes().some(function (x) { return x.id === qual; })) return false;
        e.preventDefault(); e.stopPropagation(); this.inverter(qual); return true;
      },
      /* ---------------- o arraste (3D: o gancho do js/bim.js; planta/corte: o do js/bimselecao.js) */
      /* o ponto do MUNDO sob o cursor: 3D = o raio no PLANO DA PAREDE; planta = (x, z); corte = o plano do corte */
      _ponto: function (ev) {
        var a = this._a, b = B(); if (!a || !ev) return null;
        if (a.vista === "3d") {
          var par = acharCaixa(a.E, a.paredeId) || a.par, n = eixoN(par.rotY);
          /* o raio do cursor por dois planos horizontais (BIM.pontoPlanoY) e o cruzamento com o plano VERTICAL da parede */
          var A = b && b.pontoPlanoY ? b.pontoPlanoY(ev.clientX, ev.clientY, a.yRef) : null, Bq = null;
          if (b && b.pontoPlanoY) { Bq = b.pontoPlanoY(ev.clientX, ev.clientY, a.yRef + 1); if (!Bq) Bq = b.pontoPlanoY(ev.clientX, ev.clientY, a.yRef - 1); }
          if (A && Bq) {
            var dx = Bq.x - A.x, dz = Bq.z - A.z, nd = n.x * dx + n.z * dz;
            if (Math.abs(nd) > 1e-9) { var sR = (n.x * (par.cx - A.x) + n.z * (par.cz - A.z)) / nd; if (isFinite(sR) && Math.abs(sR) < 1e4) return { x: A.x + dx * sR, z: A.z + dz * sR }; }
          }
          var q2 = b && b.pontoPlanoY ? b.pontoPlanoY(ev.clientX, ev.clientY, a.yRef) : null;   /* de topo, olhando para a parede de lado: o plano horizontal */
          return q2 ? { x: q2.x, z: q2.z } : null;
        }
        var sv = this._svgDe(a.vista), def = this._def(a.vista);
        if (!sv || !sv.getScreenCTM || !def) return null;
        var mt = sv.getScreenCTM(); if (!mt) return null;
        var pt = sv.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; var p = pt.matrixTransform(mt.inverse());
        if (def.tipo === "planta") return { x: (def.p6 === "forro" || def.p6base === "forro") ? -p.x : p.x, z: p.y };
        var K = global.BimInstCon, w = K && K.doDesenho ? K.doDesenho(def, { x: p.x, y: p.y }) : null;
        return w ? { x: w.x, z: w.z } : null;
      },
      _mPorPx: function () {
        var a = this._a, b = B(), pj = this._projetor(); if (!a || !pj) return 0.01;
        var par = acharCaixa(a.E, a.paredeId) || a.par, u = eixoU(par.rotY), y = a.yRef;
        var p1 = pj.f({ x: par.cx, y: y, z: par.cz }), p2 = pj.f({ x: par.cx + u.x, y: y, z: par.cz + u.z });
        var px = p1 && p2 ? Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) : 100;
        return 1 / Math.max(px, 1);
      },
      iniciar: function (vista, uid, ev) {
        var b = B(); if (!b || !this.pode(uid)) return false;
        var id = String(uid).slice(5), E = this._est(); if (!E) return false;
        try { var sel = (b.selecao().uids || []); if (sel.length !== 1 || sel[0] !== uid) b.selecionar([uid], "trocar"); } catch (e) {}
        var I = info(E, this._aval(), id); if (!I) return false;
        this._fecharCampo();
        this._id = id;
        this._a = { vista: vista, uid: uid, id: id, E: E, par: I.parede, paredeId: I.parede.id, yRef: I.base + I.peitoril + I.altura / 2, res: null, cc: null, ev: null, agarre: 0 };
        var p0 = this._ponto(ev);
        if (!p0) { this._a = null; return false; }
        this._a.p0 = p0;
        var u = eixoU(I.parede.rotY), t0 = dot(sub(p0, P(I.parede.cx, I.parede.cz)), u);
        this._a.agarre = (I.t + I.desl) - t0;
        this._a.cc = cotas(E, this._aval(), id, { modos: this.modos() });
        this._teclas(true);
        status("Arrastando a abertura na parede — solte para aplicar; Esc cancela. As cotas mostram as distâncias.");
        this.desenhar();
        return true;
      },
      mover: function (ev) {
        var a = this._a; if (!a) return false;
        a.ev = { clientX: ev.clientX, clientY: ev.clientY, shiftKey: !!ev.shiftKey };
        if (a.raf) return true;
        var self = this;
        a.raf = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout)(function () { a.raf = null; self._calcular(); }, 16);
        return true;
      },
      _calcular: function () {
        var a = this._a; if (!a || !a.ev) return;
        var p = this._ponto(a.ev); if (!p) return;
        a.pFim = p;
        var mpp = this._mPorPx(), def = a.vista !== "3d" ? this._def(a.vista) : null;
        var r = arrastar(a.E, this._aval(), a.id, p, { paredeId: a.paredeId, agarre: a.agarre, tol: 10 * mpp, captura: Math.max(0.1, 14 * mpp), corte: !!(def && def.tipo !== "planta"), semEncaixe: a.ev.shiftKey });
        a.res = r;
        if (r.paredeId != null && r.paredeId !== a.paredeId) { a.paredeId = r.paredeId; }
        if (fin(r.t)) a.cc = cotas(a.E, this._aval(), a.id, { modos: this.modos(), paredeId: r.paredeId, t: r.t }) || a.cc;
        var tx = "Arrastando: " + (a.cc && a.cc.esq ? "← " + fmt(a.cc.esq.valor) + " m" : "") + (a.cc && a.cc.dir ? " · " + fmt(a.cc.dir.valor) + " m →" : "") + (r.snap ? " · encaixe: " + r.snap : "") + (r.trocou ? " · na parede " + r.paredeId : "");
        if (!r.ok) tx += " · ⚠ " + r.erro;
        status(tx + " (Esc cancela; Shift solta o encaixe).");
        this.posicionar();
      },
      _teclas: function (on) {
        var self = this;
        if (!this._tk) this._tk = function (e) { if (!self._a) return; if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); self.cancelar(); } };
        if (on) document.addEventListener("keydown", this._tk, true); else document.removeEventListener("keydown", this._tk, true);
      },
      cancelar: function () {
        var a = this._a; if (!a) return false;
        this._a = null; this._teclas(false); this.atualizar();
        status("Arraste cancelado: nada mudou.");
        return true;
      },
      soltar: function (ev) {
        var a = this._a, b = B(); if (!a) return false;
        if (ev && ev.clientX != null) { a.ev = { clientX: ev.clientX, clientY: ev.clientY, shiftKey: !!ev.shiftKey }; this._calcular(); }
        this._a = null; this._teclas(false);
        var r = a.res;
        this._ultimo = { vista: a.vista, agarre: a.agarre, inicio: a.p0 || null, fim: a.pFim || null, res: r ? { ok: r.ok, t: r.t, paredeId: r.paredeId, snap: r.snap } : null };   /* suporte e e2e */
        if (!r) { this.atualizar(); status("Nada foi movido."); return true; }
        if (!r.ok || !r.op) { this.atualizar(); status("Arrastar: " + (r.erro || "não deu para aplicar") + " Nada foi aplicado."); return true; }
        var I = info(a.E, this._aval(), a.id);
        if (I && r.paredeId === I.parede.id && Math.abs(r.t - I.t) < 1e-5) { this.atualizar(); status("Nada foi movido."); return true; }
        var ok = b.b2Op(r.op);
        this.atualizar();
        status(ok ? "Abertura movida" + (r.trocou ? " para a parede " + r.paredeId : "") + (this._cc && this._cc.esq ? ": ← " + fmt(this._cc.esq.valor) + " m" : "") + (this._cc && this._cc.dir ? " · " + fmt(this._cc.dir.valor) + " m →" : "") + " (Ctrl+Z desfaz)." : "Não foi possível gravar o arraste.");
        return true;
      },
      arrastando: function () { return !!this._a; },
      /* e2e e suporte (só leitura) */
      estado: function () {
        var cp = this._ccP;
        if (cp && !this._a) return { id: null, parede: this._idP, modos: this.modosParede(), arrastando: !!this._arrP,
          lados: Object.keys(cp.lados).map(function (k) { var r = cp.lados[k]; return { lado: k, valor: r.valor, ref: r.ref, modo: r.modo }; }),
          perms: this._el ? Array.prototype.map.call(this._el.querySelectorAll("[data-vao-perm]"), function (b) { return { k: b.getAttribute("data-vao-perm"), valor: +b.getAttribute("data-valor"), vis: b.style.display !== "none" }; }) : [] };
        var cc = this._a ? this._a.cc : this._cc;
        return { id: this._id, arrastando: !!this._a, modos: this.modos(), res: this._a && this._a.res ? { ok: this._a.res.ok, erro: this._a.res.erro, paredeId: this._a.res.paredeId, t: this._a.res.t, snap: this._a.res.snap } : null,
          cotas: cc ? { paredeId: cc.paredeId, t: cc.t, x0: cc.x0, x1: cc.x1, esq: cc.esq ? { valor: cc.esq.valor, k: cc.esq.k, modo: cc.esq.modo, ref: cc.esq.ref } : null, dir: cc.dir ? { valor: cc.dir.valor, k: cc.dir.k, modo: cc.dir.modo, ref: cc.dir.ref } : null, peitoril: cc.peitoril.valor } : null };
      }
    };
    Object.keys(UI).forEach(function (k) { BimVaoArr[k] = UI[k]; });
  }

  global.BimVaoArr = BimVaoArr;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVaoArr;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

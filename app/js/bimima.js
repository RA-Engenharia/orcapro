/* =====================================================================
 * bimima.js — "ÍMÃ": a ESTRUTURA (vigas/perfis, chapas e pisos metálicos, pilares) segue as paredes
 * (motor PURO, ES5, sem DOM, Node-testável). 29/10/2026.
 *
 * Pedido do Rogério: "Quero que tenha opção de poder aumentar também qualquer estrutura metálica, piso metálico etc., do jeito que fiz
 * no telhado. Tipo lá onde está a caixa d'água: eu puxei a parede, deveria ser paramétrico e daí ele ajustava também, como se tivesse
 * um ímã. Isso para tudo."
 *
 * O telhado (1.2.228) e o forro/laje (1.2.232) já seguem as paredes pelo contorno (js/bimcontorno.js: pr/pf/po por ponto). Aqui a
 * MESMA ideia vale para as peças da estrutura. O vínculo fica na caixa, em `ima` (campo de IDENTIDADE: a op metalAjustar não o apaga),
 * gravado pela op `ima` {id, ima | null}; nada de dado novo nas peças sem vínculo (estado idêntico ao de antes, byte a byte).
 *
 *   PERFIL / VIGA (metal "perfil", viga do modelador de qualquer material):
 *     ima = { v:1, a:{pr,pf,po}, b:{pr,pf,po}, eixo:{pr,pf,po,s} }
 *       a / b = a PONTA inicial / final presa a uma face de parede (ou a um perfil, em cadeia) — a ponta acompanha a face onde apoia;
 *               o comprimento se refaz; cortes inclinados e furos medidos de A ficam como estão; a outra ponta não mexe.
 *       eixo  = (opcional) a barra que corre junto a uma parede acompanha o deslocamento dela (as duas pontas andam juntas).
 *     pr = id da parede (ou do perfil), pf = "externa" | "eixo" | "interna", po = afastamento em m a partir da face, para FORA da peça
 *     (o que a peça tinha ao ligar: ligar não mexe em nada; só a parede andando mexe).
 *   CHAPA / PISO METÁLICO horizontal (metal "chapa"):
 *     ima = { v:1, arestas:[{pr,pf,po} | {} …] }  uma entrada por vértice do contorno (a aresta que SAI dele, como o telhado).
 *     A resolução é a do telhado (BimContorno.resolverVinculos) sobre o contorno no mundo, convertido de volta para (u, v).
 *     REGRA DOS FUROS/RECORTES: cada furo e cada recorte acompanha o vértice do contorno mais perto dele (translação pelo deslocamento
 *     daquele vértice) — o padrão de furos não se deforma; a posição relativa ao canto é mantida.
 *   PILAR (viga/pilar do modelador, perfil vertical da metálica):
 *     ima = { v:1, p1:{pr,pf,po,s}, p2:{pr,pf,po,s} }  o encontro de duas paredes (canto): a parede andou, o pilar vai junto.
 *     s = ±1, o lado da parede (sentido da normal) em que o pilar fica.
 *
 * CADEIA: o `pr` pode ser o id de OUTRA peça (a chapa apoiada numa viga, a viga apoiada numa viga). Resolve-se na ordem de dependência
 * (cada peça uma vez); laço → aviso e as peças do laço ficam como estão gravadas.
 * AVISO, nunca erro: parede apagada, parede que girou demais, comprimento que zeraria, peça fixada → a peça fica como estava e o aviso
 * entra nas `avisos`/`problemas` dela (problema com solução).
 *
 * Roda no replay (BimEdit) na mesma altura de BimContorno.lajesAntes: `antes(saida)` ANTES do BimArq.derivar, `depois(saida)` depois.
 * Teste: node tools/test-ima-segue-paredes.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function BC() { return dep("BimContorno", "./bimcontorno.js"); }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function dot2(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function rotY(v, th) { var c = Math.cos(th), s = Math.sin(th); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function O3(v) { return [r6(v[0]), r6(v[1]), r6(v[2])]; }

  var TOL_PONTA = 0.30;     /* ligar a ponta: a face a até 30 cm da ponta */
  var TOL_ARESTA = 0.15;    /* ligar a aresta da chapa: a face a até 15 cm (não encosta a chapa no que está longe) */
  var TOL_CANTO = 0.25;     /* ligar o pilar: cada face a até 25 cm do centro dele */
  var FACES = { externa: 1, eixo: 1, interna: 1 };

  /* ------------------------------------------------------------ o que é cada peça */
  function qMetal(c) { var B = BM(); return B && B.quadro ? B.quadro(c) : null; }
  /* "barra" (horizontal/inclinada), "pilar" (vertical), "chapa" (horizontal), ou null (não segue) */
  function tipoDe(c) {
    if (!c) return null;
    if (c.cob != null) return null;   /* peça da estrutura do telhado/cobertura: nasce do telhado (que já segue as paredes) e não é gravada por id */
    if (c.tipo === "viga") return "barra";
    if (c.tipo === "pilar") return "pilar";
    if (c.tipo === "metal" && c.metal) {
      var m = c.metal, q = qMetal(c);
      if (!q) return null;
      if (m.kind === "chapa") return Math.abs(q.Z[1]) >= 0.999 ? "chapa" : null;
      if (m.kind === "perfil") {
        if (m.curva || m.bocas) return null;   /* curvada / boca de lobo: a forma depende do tubo que recebe — não segue */
        if (Math.abs(q.X[1]) >= 0.95) return "pilar";
        return Math.abs(q.X[1]) <= 0.35 ? "barra" : null;
      }
    }
    return null;
  }
  function temIma(c) {
    var i = c && c.ima; if (!i || typeof i !== "object") return false;
    return !!(i.a || i.b || i.eixo || i.p1 || i.p2 || (Array.isArray(i.arestas) && i.arestas.some(function (x) { return x && x.pr != null && x.pr !== ""; })));
  }
  function ligado(e) { return !!e && e.pr != null && e.pr !== ""; }
  function contaLig(c) {
    var i = c && c.ima; if (!i) return 0;
    if (c.tipo === "metal" && c.metal && c.metal.kind === "chapa") return arr(i.arestas).filter(ligado).length;
    return (ligado(i.a) ? 1 : 0) + (ligado(i.b) ? 1 : 0) + (ligado(i.eixo) ? 1 : 0) + (ligado(i.p1) ? 1 : 0) + (ligado(i.p2) ? 1 : 0);
  }

  /* ------------------------------------------------------------ a barra (metal "perfil" ou viga do modelador) */
  /* → { A:[x,y,z], B:[x,y,z] (pontas do SÓLIDO), X:[…] (unitário 3D), L, c:|X plano| } ou null */
  function barraDe(c) {
    if (c.tipo === "metal") {
      var q = qMetal(c), L = num(c.metal.L, 0); if (!q || !(L > 0)) return null;
      return { A: q.O, B: add3(q.O, mul3(q.X, L)), X: q.X, L: L, c: Math.sqrt(q.X[0] * q.X[0] + q.X[2] * q.X[2]) };
    }
    if (c.tipo === "viga") {
      var th = num(c.rotY, 0), Xh = [Math.cos(th), -Math.sin(th)], Lh = num(c.comprimento, 0);
      if (!(Lh > 0)) return null;
      var s0 = -(Lh / 2 - num(c.recuoIni, 0) + num(c.extIni, 0)), s1 = Lh / 2 - num(c.recuoFim, 0) + num(c.extFim, 0), y = num(c.cy, 0);
      var A = [num(c.cx, 0) + Xh[0] * s0, y, num(c.cz, 0) + Xh[1] * s0], B = [num(c.cx, 0) + Xh[0] * s1, y, num(c.cz, 0) + Xh[1] * s1];
      return { A: A, B: B, X: [Xh[0], 0, Xh[1]], L: s1 - s0, c: 1 };
    }
    return null;
  }
  /* a parede "de mentira" de uma barra, para a CADEIA (outra peça apoia nela): eixo da barra no plano, largura = a da caixa */
  function paredeDeBarra(c) {
    var g = barraDe(c); if (!g) return null;
    var dx = g.B[0] - g.A[0], dz = g.B[2] - g.A[2], Lp = Math.sqrt(dx * dx + dz * dz); if (!(Lp > 0.01)) return null;
    return { tipo: "parede", id: String(c.id), cx: (g.A[0] + g.B[0]) / 2, cz: (g.A[2] + g.B[2]) / 2, rotY: Math.atan2(-dz / Lp, dx / Lp), comprimento: Lp, espessura: Math.max(0.01, num(c.espessura, 0.1)), cy: (g.A[1] + g.B[1]) / 2, altura: Math.max(0.01, num(c.altura, 0.1)) };
  }

  /* ------------------------------------------------------------ reta-face (a mesma do contorno) */
  function paredeReta(c) { var C = BC(); return C && C._paredeReta ? C._paredeReta(c) : null; }
  function retaFace(w, nf, pf, po) { return BC()._retaDaFace(w, nf, pf, po); }
  /* a normal unitária da parede alinhada a nf (para o sinal da distância) */
  function normalAlinhada(w, nf) { var s = dot2(w.n, nf) >= 0 ? 1 : -1; return [w.n[0] * s, w.n[1] * s]; }
  function paredeAlcanca(c, y) {   /* a parede cobre a cota y (a peça está na altura dela) */
    var h = num(c.altura, 0), cy = num(c.cy, 0);
    return y >= cy - h / 2 - 0.3 && y <= cy + h / 2 + 0.3;
  }

  /* ------------------------------------------------------------ resolver: barra */
  function aplicarBarra(c, ta, tb, g, lat) {
    /* ta, tb = onde a ponta inicial/final fica, em m ao longo do eixo 3D a partir de g.A (já deslocado lateralmente de `lat`, plano) */
    var A2 = [g.A[0] + lat[0], g.A[1], g.A[2] + lat[1]], Lnovo = tb - ta;
    if (c.tipo === "metal") {
      var Ow = add3(A2, mul3(g.X, ta)), m = c.metal;
      /* a receita de criação (js/metalcriar.js): a mesma linha, com as pontas novas — para a edição pelas Propriedades partir do que está na tela */
      var cr = m.cria, da = sub3(Ow, g.A), db = add3(sub3(A2, g.A), mul3(g.X, tb - g.L));
      m.L = r6(Lnovo);
      var th = num(c.rotY, 0), C0 = [num(c.cx, 0), num(c.cy, 0), num(c.cz, 0)];
      if (cr && arr(cr.a).length === 3 && arr(cr.b).length === 3) {
        var aw = add3(C0, rotY(cr.a, th)), bw = add3(C0, rotY(cr.b, th));
        reenvelope(c, Ow);
        var C1 = [c.cx, c.cy, c.cz];
        cr.a = O3(rotY(sub3(add3(aw, da), C1), -th)); cr.b = O3(rotY(sub3(add3(bw, db), C1), -th));
      } else reenvelope(c, Ow);
      return;
    }
    if (c.tipo === "viga") {
      var th2 = num(c.rotY, 0), Xh = [Math.cos(th2), -Math.sin(th2)];
      var ri = num(c.recuoIni, 0), rf = num(c.recuoFim, 0), ei = num(c.extIni, 0), ef = num(c.extFim, 0);
      var S0 = [A2[0] + Xh[0] * ta, A2[2] + Xh[1] * ta], Lh = Lnovo + ri + rf - ei - ef;
      var sh = Lh / 2 - ri + ei;   /* do início do sólido ao centro nominal */
      c.cx = r4(S0[0] + Xh[0] * sh); c.cz = r4(S0[1] + Xh[1] * sh); c.comprimento = r4(Lh);
    }
  }
  /* o envelope da peça metálica refeito a partir da origem do mundo Ow (a mesma conta de MetalCriar.orientar) */
  function reenvelope(c, Ow) {
    var B = BM(), m = c.metal, th = num(c.rotY, 0);
    c.cx = Ow[0]; c.cy = Ow[1]; c.cz = Ow[2]; m.o = { x: 0, y: 0, z: 0 };
    var pts = [], mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    B.solidos(c).forEach(function (s) { s.poli.forEach(function (q) { pts.push(s.ponto(q[0], q[1], s.z0)); pts.push(s.ponto(q[0], q[1], s.z1)); }); });
    pts.forEach(function (p) { var l = rotY(sub3(p, Ow), -th); for (var k = 0; k < 3; k++) { if (l[k] < mn[k]) mn[k] = l[k]; if (l[k] > mx[k]) mx[k] = l[k]; } });
    if (!pts.length) return;
    var cL = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], C2 = add3(Ow, rotY(cL, th));
    m.o = { x: r6(-cL[0]), y: r6(-cL[1]), z: r6(-cL[2]) };
    c.cx = r6(C2[0]); c.cy = r6(C2[1]); c.cz = r6(C2[2]);
    c.comprimento = r6(Math.max(0.001, mx[0] - mn[0])); c.altura = r6(Math.max(0.001, mx[1] - mn[1])); c.espessura = r6(Math.max(0.001, mx[2] - mn[2]));
    B.recalc(c);
  }

  /* resolve UMA barra contra o mapa de retas (paredes reais + barras já resolvidas). → { mudou, ligadas, avisos:[], problemas:[] } */
  function resolverBarra(c, mapa, rot) {
    var im = c.ima, R = { mudou: false, ligadas: 0, avisos: [], problemas: [] }, g = barraDe(c);
    if (!g || !(g.c > 0.2)) return R;
    var Xp = [g.X[0], g.X[2]], lat = [0, 0], ta = 0, tb = g.L, nome = rot;
    var Lp = Math.sqrt(Xp[0] * Xp[0] + Xp[1] * Xp[1]), u = [Xp[0] / Lp, Xp[1] / Lp];
    function falha(motivo, corrigir) { R.avisos.push(nome + ": " + motivo + " Ficou como estava gravado."); R.problemas.push({ motivo: nome + ": " + motivo, corrigir: corrigir || "Use \"Ajustar às paredes agora\" para ligar a outra parede, ou \"Seguir as paredes: Não\" para soltar." }); }
    /* eixo lateral */
    if (ligado(im.eixo)) {
      var we = mapa[String(im.eixo.pr)];
      if (!we) { falha("a parede do eixo não existe mais."); return R; }
      if (Math.abs(dot2(we.u, u)) < 0.99) { falha("a parede do eixo girou em relação à barra."); return R; }
      var se = im.eixo.s === -1 ? -1 : 1, nwe = [we.n[0] * se, we.n[1] * se], re = retaFace(we, nwe, FACES[im.eixo.pf] ? im.eixo.pf : "eixo", im.eixo.po);
      var dl = (re.p[0] - g.A[0]) * nwe[0] + (re.p[1] - g.A[2]) * nwe[1];
      if (Math.abs(dl) > 50) { falha("a parede do eixo ficaria a mais de 50 m."); return R; }
      lat = [nwe[0] * dl, nwe[1] * dl]; R.ligadas++;
    }
    var Ap = [g.A[0] + lat[0], g.A[2] + lat[1]];
    function ponta(e, nf, ord) {
      var w = mapa[String(e.pr)];
      if (!w) { falha("a parede da ponta " + ord + " não existe mais."); return null; }
      var nw = normalAlinhada(w, nf), den = dot2(Xp, nw);
      if (Math.abs(dot2(u, nw)) < 0.7) { falha("a parede da ponta " + ord + " girou mais de 45° em relação à barra."); return null; }
      var r = retaFace(w, nf, FACES[e.pf] ? e.pf : "interna", e.po), t = ((r.p[0] - Ap[0]) * nw[0] + (r.p[1] - Ap[1]) * nw[1]) / den;
      if (!fin(t) || Math.abs(t) > 200) { falha("a ponta " + ord + " não encontra a parede."); return null; }
      R.ligadas++; return t;
    }
    var temA = ligado(im.a), temB = ligado(im.b);
    if (temA) { var t1 = ponta(im.a, [-u[0], -u[1]], "inicial"); if (t1 == null) return { mudou: false, ligadas: 0, avisos: R.avisos, problemas: R.problemas }; ta = t1; }
    if (temB) { var t2 = ponta(im.b, [u[0], u[1]], "final"); if (t2 == null) return { mudou: false, ligadas: 0, avisos: R.avisos, problemas: R.problemas }; tb = t2; }
    if (!(tb - ta > 0.05)) { R.avisos = []; R.problemas = []; R.ligadas = 0; falha("a barra ficaria com menos de 5 cm."); return R; }
    if (Math.abs(ta) < 1e-6 && Math.abs(tb - g.L) < 1e-6 && Math.abs(lat[0]) < 1e-6 && Math.abs(lat[1]) < 1e-6) return R;   /* já está nas paredes */
    aplicarBarra(c, ta, tb, g, lat);
    R.mudou = true;
    return R;
  }

  /* ------------------------------------------------------------ resolver: pilar (canto) */
  function posPilar(c) {
    if (c.tipo === "metal") { var q = qMetal(c); return q ? [q.O[0], q.O[2]] : null; }
    return [num(c.cx, 0), num(c.cz, 0)];
  }
  function resolverPilar(c, mapa, rot) {
    var im = c.ima, R = { mudou: false, ligadas: 0, avisos: [], problemas: [] };
    if (!ligado(im.p1) || !ligado(im.p2)) return R;
    function falha(motivo) { R.avisos.push(rot + ": " + motivo + " Ficou como estava gravado."); R.problemas.push({ motivo: rot + ": " + motivo, corrigir: "Use \"Ajustar às paredes agora\" para ligar o pilar ao canto, ou \"Seguir as paredes: Não\" para soltar." }); R.ligadas = 0; return R; }
    var w1 = mapa[String(im.p1.pr)], w2 = mapa[String(im.p2.pr)];
    if (!w1 || !w2) return falha("uma das paredes do canto não existe mais.");
    var s1 = im.p1.s === -1 ? -1 : 1, s2 = im.p2.s === -1 ? -1 : 1;
    var r1 = retaFace(w1, [w1.n[0] * s1, w1.n[1] * s1], FACES[im.p1.pf] ? im.p1.pf : "eixo", im.p1.po), r2 = retaFace(w2, [w2.n[0] * s2, w2.n[1] * s2], FACES[im.p2.pf] ? im.p2.pf : "eixo", im.p2.po);
    var X = BC()._interReta(r1.p, r1.d, r2.p, r2.d);
    if (!X) return falha("as duas paredes do canto ficaram paralelas.");
    var P0 = posPilar(c); if (!P0) return R;
    var d = [X[0] - P0[0], X[1] - P0[1]];
    if (Math.sqrt(d[0] * d[0] + d[1] * d[1]) > 50) return falha("o canto ficaria a mais de 50 m do desenho.");
    R.ligadas = 2;
    if (Math.abs(d[0]) < 1e-6 && Math.abs(d[1]) < 1e-6) return R;
    if (c.tipo === "metal") { var q = qMetal(c); reenvelope(c, [q.O[0] + d[0], q.O[1], q.O[2] + d[1]]); }
    else { c.cx = r4(num(c.cx, 0) + d[0]); c.cz = r4(num(c.cz, 0) + d[1]); }
    R.mudou = true;
    return R;
  }

  /* ------------------------------------------------------------ resolver: chapa horizontal */
  function resolverChapa(c, caixasMapa, rot) {
    var im = c.ima, m = c.metal, R = { mudou: false, ligadas: 0, avisos: [], problemas: [] }, Bc = BC(), q = qMetal(c);
    var C = arr(m.contorno), A = arr(im.arestas);
    if (!q || C.length < 3 || A.length !== C.length) {
      if (C.length >= 3 && A.length !== C.length) { R.avisos.push(rot + ": o contorno mudou de forma e os vínculos não valem mais. Ficou como estava gravado."); R.problemas.push({ motivo: rot + ": o número de cantos mudou.", corrigir: "Use \"Ajustar às paredes agora\" para ligar de novo." }); }
      return R;
    }
    var W = C.map(function (p, k) {
      var e = A[k] || {}, P = add3(q.O, add3(mul3(q.X, num(p.u, 0)), mul3(q.Y, num(p.v, 0)))), o = { x: P[0], z: P[2] };
      if (ligado(e)) { o.pr = e.pr; o.pf = e.pf; o.po = e.po; }
      return o;
    });
    var res = Bc.resolverVinculos(caixasMapa, W, { de: "da chapa", rot: "A chapa" });
    res.avisos.forEach(function (t) { R.avisos.push(t); });
    res.problemas.forEach(function (t) { R.problemas.push(t); });
    if (res.usouGravado) return R;
    R.ligadas = res.ligadas;
    if (!res.mudou) return R;
    /* de volta para (u, v) — a chapa é horizontal: X e Y estão no plano */
    var novo = res.contorno.map(function (p) { var d = [p.x - q.O[0], p.z - q.O[2]]; return { u: r6(d[0] * q.X[0] + d[1] * q.X[2]), v: r6(d[0] * q.Y[0] + d[1] * q.Y[2]) }; });
    var dlt = novo.map(function (p, k) { return [p.u - num(C[k].u, 0), p.v - num(C[k].v, 0)]; });
    function maisPerto(u, v) { var b = 0, bd = Infinity; C.forEach(function (p, k) { var d = Math.pow(num(p.u, 0) - u, 2) + Math.pow(num(p.v, 0) - v, 2); if (d < bd) { bd = d; b = k; } }); return b; }
    arr(m.furos).forEach(function (f) { var k = maisPerto(num(f.u, 0), num(f.v, 0)); f.u = r6(num(f.u, 0) + dlt[k][0]); f.v = r6(num(f.v, 0) + dlt[k][1]); });
    arr(m.recortes).forEach(function (rc) {
      var pts = arr(rc.pts); if (!pts.length) return;
      var cu = 0, cv = 0; pts.forEach(function (p) { cu += num(p.u, 0); cv += num(p.v, 0); }); cu /= pts.length; cv /= pts.length;
      var k = maisPerto(cu, cv); pts.forEach(function (p) { p.u = r6(num(p.u, 0) + dlt[k][0]); p.v = r6(num(p.v, 0) + dlt[k][1]); });
    });
    m.contorno = novo;
    reenvelope(c, q.O);
    R.mudou = true;
    return R;
  }

  /* ------------------------------------------------------------ o replay: ANTES do derivar / DEPOIS */
  function antes(saida) {
    if (!saida) return saida;
    var cx = arr(saida.caixas), por = {}, pecas = [];
    cx.forEach(function (c) { if (c && c.id != null) por[String(c.id)] = c; if (temIma(c)) pecas.push(c); });
    if (!pecas.length) return saida;
    var B0 = BC(); if (!B0 || !B0.resolverVinculos) return saida;
    var paredes = {};
    cx.forEach(function (c) { if (c && c.tipo === "parede") { var w = paredeReta(c); if (w) paredes[w.id] = w; } });
    /* dependência: peça → outras PEÇAS (não parede) de que ela depende */
    function refs(c) {
      var i = c.ima, ids = [];
      function p(e) { if (ligado(e)) ids.push(String(e.pr)); }
      p(i.a); p(i.b); p(i.eixo); p(i.p1); p(i.p2); arr(i.arestas).forEach(p);
      return ids.filter(function (id) { return !paredes[id]; });
    }
    var feito = {}, emImaDep = {}, ordem = [], restantes = pecas.slice(), progresso = true;
    pecas.forEach(function (c) { emImaDep[String(c.id)] = 1; });
    while (restantes.length && progresso) {
      progresso = false;
      restantes = restantes.filter(function (c) {
        var pend = refs(c).some(function (id) { return emImaDep[id] && !feito[id] && id !== String(c.id); });
        if (pend) return true;
        feito[String(c.id)] = 1; ordem.push(c); progresso = true; return false;
      });
    }
    var mapaPseudo = {};   /* barras já resolvidas, em forma de parede, para a cadeia */
    function aviso(c, R) {
      c.segueParedes = { ligadas: R.ligadas, total: Math.max(R.ligadas, contaLig(c)), mudou: !!R.mudou, avisos: R.avisos.slice(), problemas: R.problemas.slice() };
    }
    function listaCaixasParaChapa(c) {
      var l = [];
      Object.keys(paredes).forEach(function (id) { l.push(por[id]); });
      refs(c).forEach(function (id) { var o = por[id]; if (o) { var ps = paredeDeBarra(o); if (ps) l.push(ps); } });
      return l;
    }
    ordem.forEach(function (c) {
      var t = tipoDe(c), rot = (t === "chapa" ? "A chapa " : (t === "pilar" ? "O pilar " : "A barra ")) + c.id, R = { mudou: false, ligadas: 0, avisos: [], problemas: [] };
      if (c.fixo) { R.avisos.push(rot + " está fixada e não segue as paredes."); R.problemas.push({ motivo: rot + " está fixada.", corrigir: "Solte a fixação da peça para ela seguir as paredes." }); aviso(c, R); return; }
      if (!t) { R.avisos.push(rot + " tem forma que não segue as paredes (curva, boca de lobo ou inclinada demais)."); aviso(c, R); return; }
      var mapa = {}; Object.keys(paredes).forEach(function (id) { mapa[id] = paredes[id]; });
      refs(c).forEach(function (id) { var o = por[id]; if (o) { var ps = paredeDeBarra(o); if (ps) { var w = paredeReta(ps); if (w) mapa[id] = w; } } });
      if (t === "barra") R = resolverBarra(c, mapa, rot);
      else if (t === "pilar") R = resolverPilar(c, mapa, rot);
      else R = resolverChapa(c, listaCaixasParaChapa(c), rot);
      aviso(c, R);
    });
    restantes.forEach(function (c) {
      var R = { mudou: false, ligadas: 0, avisos: ["A peça " + c.id + " depende de outra que depende dela (laço): ficou como estava gravado."], problemas: [{ motivo: "Vínculos em laço entre a peça " + c.id + " e as peças em que ela apoia.", corrigir: "Solte uma das ligações (\"Seguir as paredes: Não\" numa das peças) e ligue de novo." }] };
      aviso(c, R);
    });
    return saida;
  }
  /* DEPOIS do derivar (o recalc apaga avisos): os avisos entram na peça e o texto interno sai */
  function depois(saida) {
    if (!saida) return saida;
    arr(saida.caixas).forEach(function (c) {
      if (!c || !c.segueParedes || !c.ima) return;
      var sg = c.segueParedes;
      if (arr(sg.avisos).length) c.avisos = arr(c.avisos).concat(sg.avisos);
      if (arr(sg.problemas).length) c.problemas = arr(c.problemas).concat(sg.problemas);
      delete sg.avisos; delete sg.problemas;
    });
    return saida;
  }

  /* ------------------------------------------------------------ LIGAR (automático) */
  function paredesDoNivel(caixas, y) {
    var W = [];
    arr(caixas).forEach(function (c) {
      if (!c || c.tipo !== "parede" || c.delimitaAmbiente === false) return;
      if (fin(y) && !paredeAlcanca(c, y)) return;
      var w = paredeReta(c); if (w) W.push(w);
    });
    return W;
  }
  /* a ponta `qual` ("a" | "b") da barra → { pr, pf, po } da face de parede mais perto, ou null */
  function ligarPonta(caixas, c, qual, tol) {
    var g = barraDe(c); if (!g || !(g.c > 0.2)) return null;
    var Xp = [g.X[0], g.X[2]], Lp = Math.sqrt(dot2(Xp, Xp)), u = [Xp[0] / Lp, Xp[1] / Lp];
    var E = qual === "a" ? g.A : g.B, nf = qual === "a" ? [-u[0], -u[1]] : [u[0], u[1]], melhor = null;
    paredesDoNivel(caixas, E[1]).forEach(function (w) {
      var nw = normalAlinhada(w, nf);
      if (Math.abs(dot2(u, nw)) < 0.7) return;   /* a parede tem de cruzar a barra (≥ 45° da paralela) */
      var along = (E[0] - w.c[0]) * w.u[0] + (E[2] - w.c[1]) * w.u[1];
      if (Math.abs(along) > w.L + 0.05) return;   /* a ponta tem de cair no comprimento da parede */
      ["interna", "externa"].forEach(function (pf) {
        var r = retaFace(w, nf, pf, 0), s = (E[0] - r.p[0]) * nw[0] + (E[2] - r.p[1]) * nw[1];
        if (Math.abs(s) > tol + 1e-9) return;
        if (!melhor || Math.abs(s) < Math.abs(melhor.po) - 1e-9) melhor = { pr: w.id, pf: pf, po: r6(s) };
      });
    });
    return melhor;
  }
  /* o eixo lateral: a parede PARALELA (≥ 2,5°… 5°) mais perto da linha da barra, cujo trecho a sobrepõe */
  function ligarEixo(caixas, c, tol) {
    var g = barraDe(c); if (!g || !(g.c > 0.2)) return null;
    var Xp = [g.X[0], g.X[2]], Lp = Math.sqrt(dot2(Xp, Xp)), u = [Xp[0] / Lp, Xp[1] / Lp], M = [(g.A[0] + g.B[0]) / 2, (g.A[2] + g.B[2]) / 2], melhor = null;
    paredesDoNivel(caixas, g.A[1]).forEach(function (w) {
      if (Math.abs(dot2(w.u, u)) < 0.996) return;
      var sgn = dot2([M[0] - w.c[0], M[1] - w.c[1]], w.n) >= 0 ? 1 : -1, nw = [w.n[0] * sgn, w.n[1] * sgn];
      var s0 = (M[0] - w.c[0]) * w.u[0] + (M[1] - w.c[1]) * w.u[1];
      if (Math.abs(s0) > w.L + Lp / 2) return;
      ["externa", "interna"].forEach(function (pf) {
        var r = retaFace(w, nw, pf, 0), s = (M[0] - r.p[0]) * nw[0] + (M[1] - r.p[1]) * nw[1];
        if (Math.abs(s) > tol + 1e-9) return;
        if (!melhor || Math.abs(s) < Math.abs(melhor.po) - 1e-9) melhor = { pr: w.id, pf: pf, po: r6(s), s: sgn };
      });
    });
    return melhor;
  }
  /* o canto do pilar: as duas paredes (não paralelas) cujas faces passam mais perto do centro */
  function ligarCanto(caixas, c, tol) {
    var P = posPilar(c); if (!P) return null;
    var y = c.tipo === "metal" ? qMetal(c).O[1] : num(c.cy, 0), cand = [];
    paredesDoNivel(caixas, y).forEach(function (w) {
      var along = (P[0] - w.c[0]) * w.u[0] + (P[1] - w.c[1]) * w.u[1];
      if (Math.abs(along) > w.L + tol) return;
      var sgn = dot2([P[0] - w.c[0], P[1] - w.c[1]], w.n) >= 0 ? 1 : -1, nw = [w.n[0] * sgn, w.n[1] * sgn], b = null;
      ["externa", "interna", "eixo"].forEach(function (pf) {
        var r = retaFace(w, nw, pf, 0), s = (P[0] - r.p[0]) * nw[0] + (P[1] - r.p[1]) * nw[1];
        if (Math.abs(s) > tol + 1e-9) return;
        if (!b || Math.abs(s) < Math.abs(b.po) - 1e-9) b = { pr: w.id, pf: pf, po: r6(s), s: sgn, w: w };
      });
      if (b) cand.push(b);
    });
    var par = null;
    for (var i = 0; i < cand.length; i++) for (var j = i + 1; j < cand.length; j++) {
      if (Math.abs(dot2(cand[i].w.u, cand[j].w.u)) > 0.7) continue;   /* paralelas não fazem canto */
      var sc = Math.abs(cand[i].po) + Math.abs(cand[j].po);
      if (!par || sc < par.sc - 1e-9) par = { a: cand[i], b: cand[j], sc: sc };
    }
    if (!par) return null;
    function lim(e) { return { pr: e.pr, pf: e.pf, po: e.po, s: e.s }; }
    return { p1: lim(par.a), p2: lim(par.b) };
  }
  /* as arestas da chapa horizontal → [{pr,pf,po} | {}] (preserva a posição: po = a folga de agora) */
  function ligarArestas(caixas, c, tol) {
    var q = qMetal(c), Bc = BC(), C = arr(c.metal.contorno); if (!q || C.length < 3) return null;
    var P = C.map(function (p) { var w = add3(q.O, add3(mul3(q.X, num(p.u, 0)), mul3(q.Y, num(p.v, 0)))); return [w[0], w[2]]; });
    var NF = Bc._normaisFora(P), W = paredesDoNivel(caixas, q.O[1]), out = [], n = 0;
    if (!W.length) return null;
    P.forEach(function (_, k) {
      var f = Bc._acharFace(W, P, NF, k, "auto", tol);
      if (f) { out.push({ pr: f.w.id, pf: f.pf, po: r6(f.s) }); n++; } else out.push({});
    });
    return n ? out : null;
  }

  /* o `ima` novo da peça (fundindo com o que já tinha — ponta ligada a parede que existe fica) → { ima, ligadas, possiveis } | null */
  function ligarPeca(caixas, c, o) {
    o = o || {};
    var t = tipoDe(c), por = {}; if (!t) return null;
    arr(caixas).forEach(function (x) { if (x && x.id != null) por[String(x.id)] = x; });
    function existe(e) { return ligado(e) && por[String(e.pr)]; }
    var antigo = c.ima && typeof c.ima === "object" ? clone(c.ima) : {}, novo = { v: 1 }, lig = 0, pos = 0;
    if (t === "barra") {
      var tp = fin(o.tol) ? o.tol : TOL_PONTA;
      pos = 2;
      ["a", "b"].forEach(function (k) {
        var e = existe(antigo[k]) ? antigo[k] : ligarPonta(caixas, c, k, tp);
        if (e) { novo[k] = e; lig++; }
      });
      if (o.eixo || antigo.eixo) {
        var ee = existe(antigo.eixo) ? antigo.eixo : (o.eixo ? ligarEixo(caixas, c, tp) : null);
        if (ee) { novo.eixo = ee; lig++; }
      }
    } else if (t === "pilar") {
      pos = 2;
      var cn = existe(antigo.p1) && existe(antigo.p2) ? { p1: antigo.p1, p2: antigo.p2 } : ligarCanto(caixas, c, fin(o.tol) ? o.tol : TOL_CANTO);
      if (cn) { novo.p1 = cn.p1; novo.p2 = cn.p2; lig = 2; }
    } else if (t === "chapa") {
      var n = arr(c.metal.contorno).length; pos = n;
      var ar = ligarArestas(caixas, c, fin(o.tol) ? o.tol : TOL_ARESTA);
      var merged = [];
      for (var k = 0; k < n; k++) {
        var a0 = arr(antigo.arestas)[k];
        var e2 = existe(a0) ? a0 : (ar && ar[k] && ligado(ar[k]) ? ar[k] : {});
        merged.push(e2); if (ligado(e2)) lig++;
      }
      if (lig) novo.arestas = merged;
    }
    if (!lig) return { ima: null, ligadas: 0, possiveis: pos, tipo: t };
    return { ima: novo, ligadas: lig, possiveis: pos, tipo: t };
  }

  /* "AJUSTAR TUDO ÀS PAREDES", a parte da estrutura: liga TODAS as peças que têm parede perto.
     → { ok, ops:[{op:"ima",id,ima}], pecas:[…], nPecas, nLigadas, nPossiveis, naoLigou:[texto] } (o BimContorno.ajustarTudo soma ao lote dele) */
  function ajustarTudo(estado, o) {
    o = o || {};
    var cx = arr(estado && estado.caixas), ops = [], pecas = [], nPec = 0, nLig = 0, nPos = 0, nao = [];
    cx.forEach(function (c) {
      if (!c || (c.tipo !== "metal" && c.tipo !== "viga" && c.tipo !== "pilar")) return;
      if (o.nivelId != null && c.nivelId != null && String(c.nivelId) !== String(o.nivelId)) return;
      var t = tipoDe(c); if (!t) return;
      var rotulo = (t === "chapa" ? "Chapa " : (t === "pilar" ? "Pilar " : "Barra ")) + c.id;
      var r = ligarPeca(cx, c, { tol: o.tol, eixo: o.eixo });
      if (!r) return;
      nPos += r.possiveis;
      var item = { tipo: "estrutura-" + t, id: c.id, rotulo: rotulo, total: r.possiveis, ligadas: r.ligadas, naoLigadas: [] };
      if (!r.ima) { pecas.push(item); return; }
      nLig += r.ligadas; nPec++;
      if (JSON.stringify(r.ima) !== JSON.stringify(c.ima || null)) { ops.push({ op: "ima", id: c.id, ima: r.ima }); item.mudou = true; }
      pecas.push(item);
    });
    return { ok: true, ops: ops, pecas: pecas, nPecas: nPec, nLigadas: nLig, nPossiveis: nPos, naoLigou: nao };
  }
  /* uma peça só (o botão "Ajustar às paredes agora" das Propriedades) → { ok, op, resumo } | { ok:false, motivo, corrigir } */
  function ajustarPeca(estado, id, o) {
    var c = arr(estado && estado.caixas).filter(function (x) { return x && String(x.id) === String(id); })[0];
    if (!c) return { ok: false, motivo: "Peça não encontrada.", corrigir: "Selecione a peça de novo." };
    var t = tipoDe(c);
    if (!t) return { ok: false, motivo: "Esta peça não segue paredes (curva, inclinada demais ou de outro tipo).", corrigir: "Só viga, perfil reto, chapa horizontal e pilar seguem as paredes." };
    var r = ligarPeca(estado.caixas, c, o);
    if (!r || !r.ima) return { ok: false, motivo: "Não há parede perto o bastante para ligar " + (t === "chapa" ? "a chapa" : (t === "pilar" ? "o pilar" : "a barra")) + ".", corrigir: "Aproxime a peça da parede (até " + String(t === "chapa" ? TOL_ARESTA : (t === "pilar" ? TOL_CANTO : TOL_PONTA)).replace(".", ",") + " m) e tente de novo." };
    return { ok: true, op: { op: "ima", id: c.id, ima: r.ima }, ligadas: r.ligadas, possiveis: r.possiveis, resumo: r.ligadas + " de " + r.possiveis + (t === "chapa" ? " arestas" : (t === "pilar" ? " paredes do canto" : " pontas")) + " seguem as paredes." };
  }
  /* solta TUDO da peça ("Seguir as paredes: Não") → a op, ou null se já está solta */
  function soltar(c) { return temIma(c) || (c && c.ima) ? { op: "ima", id: c.id, ima: null } : null; }
  /* solta SÓ uma ponta / aresta / canto (arrastar a alça desvincula só aquela): qual = "a" | "b" | "eixo" | "canto" | número (aresta da chapa) */
  function soltarParte(c, qual) {
    if (!c || !c.ima) return null;
    var im = clone(c.ima);
    if (typeof qual === "number") { if (arr(im.arestas)[qual]) im.arestas[qual] = {}; }
    else if (qual === "canto") { delete im.p1; delete im.p2; }
    else delete im[qual];
    return { op: "ima", id: c.id, ima: temIma({ ima: im }) ? im : null };
  }
  /* AS ALÇAS da peça (a tela das alças no clique, js/bimcontornoui.js): onde fica cada parte que pode seguir uma parede, no mundo.
     → [{ parte: "a" | "b" | "eixo" | "canto" | número (aresta da chapa), x, y, z, ligada, rotulo }] (vazio se a peça não segue) */
  function alcas(c) {
    var t = tipoDe(c), im = c && c.ima, out = [];
    if (!t) return out;
    im = im || {};
    if (t === "barra") {
      var g = barraDe(c); if (!g) return out;
      out.push({ parte: "a", x: g.A[0], y: g.A[1], z: g.A[2], ligada: ligado(im.a), rotulo: "ponta inicial" });
      out.push({ parte: "b", x: g.B[0], y: g.B[1], z: g.B[2], ligada: ligado(im.b), rotulo: "ponta final" });
      if (ligado(im.eixo)) out.push({ parte: "eixo", x: (g.A[0] + g.B[0]) / 2, y: (g.A[1] + g.B[1]) / 2 + 0.12, z: (g.A[2] + g.B[2]) / 2, ligada: true, rotulo: "eixo (lado)" });
    } else if (t === "chapa") {
      var q = qMetal(c), C = arr(c.metal.contorno); if (!q) return out;
      var W = C.map(function (p) { return add3(q.O, add3(mul3(q.X, num(p.u, 0)), mul3(q.Y, num(p.v, 0)))); });
      W.forEach(function (p, k) { var b = W[(k + 1) % W.length]; out.push({ parte: k, x: (p[0] + b[0]) / 2, y: (p[1] + b[1]) / 2, z: (p[2] + b[2]) / 2, ligada: ligado(arr(im.arestas)[k]), rotulo: "aresta " + (k + 1) }); });
    } else if (t === "pilar") {
      var P = posPilar(c), y = c.tipo === "metal" ? qMetal(c).O[1] + num(c.metal.L, 1) / 2 : num(c.cy, 0);
      if (P) out.push({ parte: "canto", x: P[0], y: y, z: P[1], ligada: ligado(im.p1) && ligado(im.p2), rotulo: "canto" });
    }
    return out;
  }
  /* solta VÁRIAS partes de uma vez (as alças arrastadas na sessão) → UMA op `ima` (ou null se nada a soltar) */
  function soltarPartes(c, partes) {
    if (!c || !c.ima) return null;
    var tmp = { id: c.id, ima: clone(c.ima) }, op = null;
    arr(partes).forEach(function (p) {
      if (!tmp.ima) return;
      var o = soltarParte(tmp, p); if (!o) return;
      op = o; tmp.ima = o.ima;
    });
    return op;
  }
  function resumo(c) {
    var im = c && c.ima, t = tipoDe(c);
    if (!im) return { seguindo: false, ligadas: 0, total: t === "chapa" ? arr(c && c.metal && c.metal.contorno).length : 2 };
    return { seguindo: temIma(c), ligadas: contaLig(c), total: t === "chapa" ? arr(im.arestas).length : 2 };
  }

  /* ------------------------------------------------------------ a op `ima` no replay */
  function imaOk(i) {
    if (i == null) return true;
    if (typeof i !== "object" || Array.isArray(i)) return false;
    var ok = true;
    function e(x) { if (x == null) return; if (typeof x !== "object" || Array.isArray(x)) { ok = false; return; } if (x.pr != null && (typeof x.pr !== "string" && typeof x.pr !== "number")) ok = false; if (x.pf != null && !FACES[x.pf]) ok = false; if (x.po != null && !fin(Number(x.po))) ok = false; }
    ["a", "b", "eixo", "p1", "p2"].forEach(function (k) { e(i[k]); });
    if (i.arestas != null) { if (!Array.isArray(i.arestas)) ok = false; else i.arestas.forEach(e); }
    return ok;
  }
  var extensao = {
    nome: "ima",
    valida: function (o) {
      if (!o || o.op !== "ima") return undefined;
      return o.id != null && imaOk(o.ima);
    },
    aplicar: function (o, ctx) {
      if (!o || o.op !== "ima" || !ctx) return false;
      var c = ctx.caixas[o.id]; if (!c) return false;
      if (o.ima == null || !temIma({ ima: o.ima })) { delete c.ima; return true; }
      c.ima = clone(o.ima);
      return true;
    }
  };

  var BimIma = {
    TOL_PONTA: TOL_PONTA, TOL_ARESTA: TOL_ARESTA, TOL_CANTO: TOL_CANTO,
    tipoDe: tipoDe, temIma: temIma, antes: antes, depois: depois,
    ligarPeca: ligarPeca, ajustarTudo: ajustarTudo, ajustarPeca: ajustarPeca, soltar: soltar, soltarParte: soltarParte, soltarPartes: soltarPartes, alcas: alcas, resumo: resumo,
    ligarPonta: ligarPonta, ligarEixo: ligarEixo, ligarCanto: ligarCanto, ligarArestas: ligarArestas,
    barraDe: barraDe, extensao: extensao
  };
  var BE = dep("BimEdit", "./bimedit.js"); if (BE && BE.estender) BE.estender(extensao);
  global.BimIma = BimIma;
  if (typeof module !== "undefined" && module.exports) module.exports = BimIma;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

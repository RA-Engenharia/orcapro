/* =====================================================================
 * bimpaginacao.js — PAGINAÇÃO NO MODELO (piso e revestimento), motor PURO
 * (ES5, Node-testável, nada de DOM nem de three.js).
 *
 * Pedido do Rogério (14/10/2026): "a paginação de piso tem que ser
 * parametrizada com a modelagem. Feita a modelagem, a gente aplica o
 * ambiente dentro de cada cômodo, e depois ele faz a paginação através
 * disso [...] fica mostrando dentro da arquitetura, tanto na planta baixa
 * quanto no 3D. Tanto piso como revestimento. [...] Quando a parede for do
 * mesmo revestimento que o chão, ela pega o parâmetro do chão e sobe para
 * as paredes, para não ficar desencontrado."
 *
 * QUEM FAZ O QUÊ
 *   · js/paginacao.js    — o motor da paginação (recorte, varredura anti-
 *                          bolacha, quantitativo). Aqui ele só é ALIMENTADO.
 *   · js/bimambiente.js  — o contorno do ambiente NA FACE da parede, as ilhas
 *                          (pilar solto) e os LADOS com a parede dona.
 *   · este arquivo       — do ambiente à paginação: a geometria, as opções
 *                          lado a lado, a receita gravada, as faces de parede
 *                          com os vãos, a HERANÇA piso → parede e a
 *                          conferência das juntas.
 *   · js/bimpaginacaoui.js — a tela (modal, planta, 3D, botão direito).
 *
 * A RECEITA, NÃO AS PEÇAS
 *   O que fica gravado no ambiente é a receita da paginação — peça, junta,
 *   assentamento, ângulo, a ÂNCORA da grade em coordenada do mundo e a
 *   ASSINATURA do contorno em que ela foi decidida. As peças são refeitas a
 *   cada desenho, sempre recortadas pelo contorno ATUAL: mexeu a parede, a
 *   paginação nunca desenha peça fora do cômodo novo — e, como a assinatura
 *   não bate mais, ela aparece "desatualizada — repaginar".
 *   Mora em `params` do ambiente (texto até 300 caracteres, valores simples,
 *   o mapa que a nuvem e as versões antigas já aceitam):
 *     params.pagPiso                 — a do piso
 *     params["pagPar:<parede>:<face>"] — a de cada face de parede do cômodo
 *   Gravar é UMA op ajustarAmbiente por ambiente: o Ctrl+Z desfaz inteiro.
 *
 * A ÂNCORA (por que não guardar offX/offY do motor)
 *   O motor gira o contorno em torno do CENTRO DA CAIXA dele. Guardar o
 *   deslocamento da grade nesse referencial faria a grade inteira pular
 *   quando a parede mexesse (o centro anda). A âncora fica no mundo, e o
 *   deslocamento é refeito para o contorno de agora.
 *
 * HERANÇA PISO → PAREDE (a régua do pedido)
 *   Só com a MESMA peça (L × C) e a MESMA junta do piso do ambiente, e com a
 *   parede paralela a uma das direções da grade do piso. Aí a largura da
 *   peça na parede é a dimensão do piso AO LONGO da parede, e a junta
 *   vertical da parede cai em cima da junta do piso que chega na aresta de
 *   encontro: o deslocamento horizontal vem do piso e a parede só varre a
 *   altura. Peça diferente, piso a 45° ou parede torta: NÃO força — diz o
 *   motivo e pagina a parede sozinha.
 *
 * Teste: node tools/test-bimpaginacao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r3(v) { return Math.round(v * 1e3) / 1e3; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function PG() { return dep("Paginacao", "./paginacao.js"); }
  function AM() { return dep("BimAmbiente", "./bimambiente.js"); }
  function AR() { return dep("BimArq", "./bimarq.js"); }
  function ED() { return dep("BimEdit", "./bimedit.js"); }
  function CV() { return dep("BimCurva", "./bimcurva.js"); }

  var VERSAO = 1;
  var CHAVE_PISO = "pagPiso", PREF_PAREDE = "pagPar:";
  /* abaixo disto (graus) a parede é paralela à grade do piso */
  var TOL_ANG = 0.2;
  /* a porta "chega ao piso" (o mesmo do js/bimacabamento.js) */
  var TOL_PISO = 0.05;
  var LIMITE_TEXTO = 300;
  /* a ordem em que as opções aparecem lado a lado (a marcada é a de maior nota) */
  var ORDEM = ["canto", "central", "porta", "otimizada"];

  /* ================================================== texto compacto
   * k=v;k=v — cabe nos 300 caracteres do params mesmo com a âncora em
   * coordenada de obra grande. Ordem fixa: o mesmo dado dá o mesmo texto
   * (a assinatura do piso herdado depende disso). */
  var CODEC = [
    ["v", "n"], ["fmt", "s"], ["L", "n"], ["C", "n"], ["j", "n"], ["as", "s"], ["sen", "s"], ["ang", "n"], ["th", "n"],
    ["ax", "n"], ["az", "n"], ["est", "s"], ["rs", "n"], ["rm", "n"], ["esp", "n"],
    ["ori", "s"], ["hm", "s"], ["H", "n"], ["pw", "n"], ["ph", "n"], ["ox", "n"], ["oy", "n"], ["hd", "n"], ["ps", "s"], ["sig", "s"],
    ["pe", "n"], ["pd", "n"], ["ct", "n"], ["mr", "n"], ["in", "n"], ["bo", "n"]
  ];
  var INSTANTANEO = { pe: 1, pd: 1, ct: 1, mr: 1, "in": 1, bo: 1 };
  function numTexto(v) { var x = Math.round(Number(v) * 1e5) / 1e5; return String(x === 0 ? 0 : x); }
  function strLimpa(v) { return txt(v).replace(/[^A-Za-z0-9._\-]/g, "").slice(0, 24); }
  function codificar(o, semInstantaneo) {
    if (!o) return "";
    var partes = [];
    CODEC.forEach(function (d) {
      var k = d[0], v = o[k];
      if (v == null || v === "") return;
      if (semInstantaneo && INSTANTANEO[k]) return;
      if (d[1] === "n") { if (!fin(Number(v))) return; partes.push(k + "=" + numTexto(v)); }
      else { var s = strLimpa(v); if (s) partes.push(k + "=" + s); }
    });
    var t = partes.join(";");
    /* passou do limite: sai o instantâneo dos números (é refeito ao desenhar) */
    if (t.length > LIMITE_TEXTO && !semInstantaneo) return codificar(o, true);
    return t.length > LIMITE_TEXTO ? "" : t;
  }
  function decodificar(s) {
    if (typeof s !== "string" || !s) return null;
    var tipos = {}; CODEC.forEach(function (d) { tipos[d[0]] = d[1]; });
    var o = {};
    s.split(";").forEach(function (par) {
      var i = par.indexOf("="); if (i <= 0) return;
      var k = par.slice(0, i), v = par.slice(i + 1);
      if (!tipos[k]) return;
      if (tipos[k] === "n") { var n = Number(v); if (fin(n)) o[k] = n; }
      else o[k] = v;
    });
    return fin(o.v) && o.v >= 1 ? o : null;
  }

  /* ================================================== assinatura
   * O contorno em forma CANÔNICA (sem vértice colinear, anti-horário,
   * começando no menor ponto) — a mesma geometria dá a mesma assinatura
   * mesmo que o replay comece o ciclo em outro canto. */
  function hashTexto(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function areaSinal(p) { var s = 0; for (var i = 0, n = p.length; i < n; i++) { var a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function canon(P) {
    var Q = arr(P).map(function (q) { return [Math.round(q[0] * 1e4), Math.round(q[1] * 1e4)]; });
    /* tira repetido e colinear (inteiros: a conta é exata) */
    var mudou = true;
    while (mudou && Q.length > 3) {
      mudou = false;
      for (var i = 0; i < Q.length; i++) {
        var a = Q[(i - 1 + Q.length) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length];
        var cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if ((a[0] === b[0] && a[1] === b[1]) || Math.abs(cr) <= Math.max(Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1]))) { Q.splice(i, 1); mudou = true; break; }
      }
    }
    if (areaSinal(Q) < 0) Q.reverse();
    var k0 = 0;
    for (var k = 1; k < Q.length; k++) if (Q[k][0] < Q[k0][0] || (Q[k][0] === Q[k0][0] && Q[k][1] < Q[k0][1])) k0 = k;
    return Q.slice(k0).concat(Q.slice(0, k0)).map(function (q) { return q[0] + "," + q[1]; }).join(" ");
  }
  function assinatura(lacos, extra) {
    var L = arr(lacos).filter(function (x) { return arr(x).length >= 3; }).map(canon);
    var cab = L.shift() || "";
    L.sort();
    return hashTexto(cab + "|" + L.join("|") + (extra ? "#" + extra : ""));
  }

  /* ================================================== geometria plana */
  function caixa(P) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    arr(P).forEach(function (q) { if (q[0] < b.x0) b.x0 = q[0]; if (q[0] > b.x1) b.x1 = q[0]; if (q[1] < b.y0) b.y0 = q[1]; if (q[1] > b.y1) b.y1 = q[1]; });
    return b;
  }
  function centro(P) { var b = caixa(P); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
  /* a MESMA rotação do motor (Paginacao: girar) */
  function rot(p, graus, c) {
    var a = graus * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), dx = p[0] - c[0], dy = p[1] - c[1];
    return [c[0] + dx * co - dy * si, c[1] + dx * si + dy * co];
  }
  function dentro(p, P) {
    var x = p[0], z = p[1], d = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) d = !d;
    }
    return d;
  }
  function naRegiao(p, cont, furos) {
    if (!dentro(p, cont)) return false;
    for (var i = 0; i < furos.length; i++) if (dentro(p, furos[i])) return false;
    return true;
  }
  /* ângulo de uma direção, em graus, levado para (−90, 90] (a reta não tem sentido) */
  function angReta(dx, dz) {
    var a = Math.atan2(dz, dx) * 180 / Math.PI;
    a = ((a % 180) + 180) % 180;
    if (a > 90) a -= 180;
    return r6(a);
  }
  /* diferença entre duas retas, em graus, em [0, 180) */
  function difReta(a, b) { var d = ((a - b) % 180 + 180) % 180; return d; }

  /* ================================================== parâmetros */
  function paramsPadrao(modo) {
    if (modo === "parede") return { fmt: "30x60", L: 0.30, C: 0.60, j: 0.002, as: "reto", ori: "deitada", hm: "auto", H: null, rs: 10, rm: null, esp: 0.008 };
    return { fmt: "60x60", L: 0.60, C: 0.60, j: 0.002, as: "reto", sen: "longo", ang: 0, rs: 10, rm: null, esp: 0.009 };
  }
  function rotuloPeca(L, C) { return Math.round(num(L, 0) * 1000) / 10 + " × " + Math.round(num(C, 0) * 1000) / 10 + " cm"; }
  function mesmaPeca(a, b) {
    var aL = num(a.L, 0), aC = num(a.C, 0), bL = num(b.L, 0), bC = num(b.C, 0), t = 5e-4;
    var dims = (Math.abs(aL - bL) < t && Math.abs(aC - bC) < t) || (Math.abs(aL - bC) < t && Math.abs(aC - bL) < t);
    return { peca: dims, junta: Math.abs(num(a.j, 0) - num(b.j, 0)) < 1e-4 };
  }
  /* a peça no referencial da grade: X do motor = a direção de referência do ambiente.
     "longo" = o COMPRIMENTO (C) da peça ao longo do maior lado (régua no sentido da sala) */
  function pecaPiso(prm) {
    var L = num(prm.L, 0), C = num(prm.C, 0);
    return prm.sen === "atravessado" ? { l: L, c: C } : { l: C, c: L };
  }
  function pecaParede(prm) {
    var L = num(prm.L, 0), C = num(prm.C, 0), mx = Math.max(L, C), mn = Math.min(L, C);
    return prm.ori === "em-pe" ? { l: mn, c: mx } : { l: mx, c: mn };
  }
  function anguloAss(id) { var P = PG(), a = P ? P.assentamento(id) : null; return a ? num(a.angulo, 0) : 0; }

  /* ================================================== o cálculo do ambiente na FACE
   * O piso vai de face a face (o mesmo critério do js/bimacabamento.js), qualquer
   * que seja a regra de "Cálculos de área e volume" do projeto. */
  function calcFace(estado, amb, niveis) {
    var c = amb && amb.calc;
    if (!c || c.estado !== "delimitado") return c || null;
    if (!c.regra || c.regra === "face") return c;
    var M = AM(), cf = M && M.medir ? M.medir(estado, amb.id, "face", niveis) : null;
    return cf || c;
  }
  function motivoEstado(c) {
    if (!c) return "Ambiente sem cálculo: refaça o modelo.";
    if (c.estado === "redundante") return "Ambiente redundante: a região já é de outro ambiente.";
    return "Ambiente não delimitado: feche o cômodo com paredes, pilares ou separador de ambiente antes de paginar.";
  }
  function caixasPorId(estado) { var m = {}; arr(estado && estado.caixas).forEach(function (c) { if (c && c.id != null) m[String(c.id)] = c; }); return m; }
  function vaosDe(estado, ctx) {
    if (ctx && ctx.vaos) return ctx.vaos;
    var E = ED();
    return E && E.vaosDasParedes && ctx && typeof ctx.avaliarFam === "function" ? E.vaosDasParedes(estado, ctx.avaliarFam) : {};
  }
  function ehCurva(c) { var B = CV(); return !!(c && (c.arco || (B && B.ehCurva && B.ehCurva(c)))); }

  /* ------------------------------------------------------------------
   * geometriaPiso(estado, amb, ctx) — o contorno real do piso:
   *   { ok, ambId, nome, contorno:[[x,z]], furos:[[[x,z]]], area, ref (graus),
   *     portas:[{id, paredeId, a:[x,z], b:[x,z], meio, largura, n:[x,z]}],
   *     base, sig }   ctx: { niveis, vaos | avaliarFam }
   * ------------------------------------------------------------------ */
  function geometriaPiso(estado, amb, ctx) {
    ctx = ctx || {};
    if (!amb) return { ok: false, motivo: "Escolha um ambiente." };
    var c = calcFace(estado, amb, ctx.niveis);
    if (!c || c.estado !== "delimitado") return { ok: false, motivo: motivoEstado(c) };
    var cont = arr(c.contorno).map(function (q) { return [num(q.x, NaN), num(q.z, NaN)]; });
    var furos = arr(c.furos).map(function (f) { return arr(f).map(function (q) { return [num(q.x, NaN), num(q.z, NaN)]; }); }).filter(function (f) { return f.length >= 3; });
    function ruim(P) { return P.some(function (q) { return !fin(q[0]) || !fin(q[1]); }); }
    if (cont.length < 3 || ruim(cont) || furos.some(ruim)) return { ok: false, motivo: "O contorno do ambiente não fecha: refaça o modelo." };
    if (areaSinal(cont) < 0) cont.reverse();
    /* a direção de referência: o MAIOR lado de parede (a sala "corre" por ele) */
    var lados = arr(c.lados), maior = null;
    lados.forEach(function (l) {
      if (!l || !l.fonte || l.fonte.tipo !== "parede" || l.arco) return;
      if (!maior || num(l.comprimento, 0) > num(maior.comprimento, 0)) maior = l;
    });
    var ref;
    if (maior) ref = angReta(maior.x1 - maior.x0, maior.z1 - maior.z0);
    else {
      var mL = -1, mA = 0;
      for (var i = 0; i < cont.length; i++) {
        var a = cont[i], b = cont[(i + 1) % cont.length], L = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
        if (L > mL) { mL = L; mA = angReta(b[0] - a[0], b[1] - a[1]); }
      }
      ref = mA;
    }
    /* as PORTAS no contorno (vão que chega ao piso): a soleira é à parte, mas a
       porta é a referência de quem entra — a opção "peça inteira na porta" */
    var portas = [], A = AR(), cx = caixasPorId(estado), V = vaosDe(estado, ctx), base = num(c.base, 0);
    lados.forEach(function (l, li) {
      var f0 = l && l.fonte; if (!f0 || f0.tipo !== "parede" || (f0.face !== "fora" && f0.face !== "dentro") || l.arco) return;
      var w = cx[String(f0.id)], vv = V[String(f0.id)];
      if (!w || !A || !A.frameDe || !vv || !arr(vv.aceitos).length || ehCurva(w)) return;
      var f = A.frameDe(w); if (!f) return;
      var u0 = A.aLocal(f, l.x0, l.z0)[0], u1 = A.aLocal(f, l.x1, l.z1)[0]; if (Math.abs(u1 - u0) < 1e-6) return;
      vv.aceitos.forEach(function (v) {
        if (f.y0 + num(v.y0, 0) > base + TOL_PISO) return;           /* janela: não chega ao piso */
        var ua = Math.max(Math.min(u0, u1), num(v.x0, 0)), ub = Math.min(Math.max(u0, u1), num(v.x1, 0));
        if (!(ub - ua > 0.05)) return;
        var ta = (ua - u0) / (u1 - u0), tb = (ub - u0) / (u1 - u0); if (ta > tb) { var tt = ta; ta = tb; tb = tt; }
        var pa = [l.x0 + ta * (l.x1 - l.x0), l.z0 + ta * (l.z1 - l.z0)], pb = [l.x0 + tb * (l.x1 - l.x0), l.z0 + tb * (l.z1 - l.z0)];
        var dx = pb[0] - pa[0], dz = pb[1] - pa[1], Ld = Math.sqrt(dx * dx + dz * dz), n = [-dz / Ld, dx / Ld];
        var meio = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
        if (!naRegiao([meio[0] + n[0] * 0.02, meio[1] + n[1] * 0.02], cont, furos)) n = [-n[0], -n[1]];
        portas.push({ id: v.id != null ? String(v.id) : null, paredeId: String(f0.id), a: pa, b: pb, meio: meio, largura: r4(Ld), n: n, lado: li });
      });
    });
    portas.sort(function (p, q) { return q.largura - p.largura; });
    return {
      ok: true, ambId: String(amb.id), nome: txt(amb.nome) || "Ambiente", contorno: cont, furos: furos,
      area: num(c.areaFace, num(c.area, 0)), perimetro: num(c.perimetroFace, 0), ref: ref, portas: portas,
      base: base, topo: num(c.topo, base), calc: c,
      sig: assinatura([cont].concat(furos))
    };
  }

  /* as opções que o motor recebe para o piso */
  function motorPiso(geo, prm, theta) {
    var th = theta != null ? theta : r6(num(geo.ref, 0) + num(prm.ang, 0) + anguloAss(prm.as));
    var o = { ambiente: geo.contorno, furos: geo.furos, peca: pecaPiso(prm), junta: num(prm.j, 0.002), assentamento: prm.as || "reto", angulo: th };
    if (prm.rm != null && fin(Number(prm.rm))) o.recorteMin = Number(prm.rm);
    return o;
  }
  function copia(o, mais) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = o[k]; }); Object.keys(mais || {}).forEach(function (k) { r[k] = mais[k]; }); return r; }

  /* os números que a tela mostra lado a lado */
  function numeros(res, prm) {
    var P = PG();
    var q0 = P.quantitativo(res, { reserva: 0, girarRecorte: true });
    var q = P.quantitativo(res, { reserva: num(prm.rs, 0), girarRecorte: true });
    return {
      menorRecorte: res.menorRecorte, inteiras: res.inteiras, cortadas: res.recortes, bolachas: res.bolachas, rentes: res.rentes || 0,
      pecas: q.semAproveitamento.pecas, pecasAprov: q.comAproveitamento.pecas,
      perdaPct: q0.semAproveitamento.perdaPct, reservaPct: num(prm.rs, 0),
      m2Compra: q.semAproveitamento.m2, areaCoberta: res.areaCoberta, grupos: q.grupos
    };
  }

  /* a opção "peça inteira na porta": a primeira fiada começa cheia na soleira da
     porta mais larga e centrada no vão. Só quando a porta é paralela à grade. */
  function opcaoPorta(geo, M) {
    var P = PG(), pt = geo.portas && geo.portas[0]; if (!pt || !P) return null;
    var th = M.angulo, c = centro(M.ambiente), pl = M.peca.l, pc = M.peca.c;
    var phi = angReta(pt.b[0] - pt.a[0], pt.b[1] - pt.a[1]), d = difReta(phi, th);
    var A = rot(pt.a, -th, c), Mg = rot(pt.meio, -th, c), ng = rot([c[0] + pt.n[0], c[1] + pt.n[1]], -th, c);
    ng = [ng[0] - c[0], ng[1] - c[1]];
    var offX, offY;
    if (d < TOL_ANG || d > 180 - TOL_ANG) {          /* porta ao longo do X da grade */
      offY = ng[1] > 0 ? A[1] : A[1] - pc;
      offX = Mg[0] - pl / 2;
    } else if (Math.abs(d - 90) < TOL_ANG) {          /* ao longo do Y */
      offX = ng[0] > 0 ? A[0] : A[0] - pl;
      offY = Mg[1] - pc / 2;
    } else return null;
    var res = P.paginar(copia(M, { offX: offX, offY: offY }));
    if (!res || !res.ok) return null;
    return { id: "porta", rotulo: "Peça inteira na porta", res: res, nota: P._nota(res, pl, pc),
             quando: "A primeira fiada começa cheia na soleira e centrada no vão da porta: é o que o olho vê ao entrar." };
  }

  /* ------------------------------------------------------------------
   * opcoesPiso(geo, prm) — as configurações lado a lado:
   *   { ok, opcoes:[{id, rotulo, quando, res, nota, numeros, melhor}],
   *     melhor (id da de maior nota), escolhidaMotor (a da varredura), motor }
   * A MAIS EFICIENTE é a da régua do motor (Paginacao._nota: maior menor
   * recorte, nenhuma bolacha, nenhum corte rente). A opção da porta entra na
   * mesma régua; sem porta, a marcada é exatamente a escolhida da varredura.
   * ------------------------------------------------------------------ */
  function opcoesPiso(geo, prm) {
    var P = PG();
    if (!P) return { ok: false, motivo: "O motor de paginação não carregou." };
    if (!geo || !geo.ok) return { ok: false, motivo: (geo && geo.motivo) || "Escolha um ambiente delimitado." };
    var M = motorPiso(geo, prm);
    var mp = P.melhorPartida(M);
    if (!mp.ok) return { ok: false, motivo: mp.motivo };
    var todas = mp.opcoes.slice(), melhor = mp.escolhida;
    var po = opcaoPorta(geo, M);
    if (po) { todas.push(po); if (po.nota > melhor.nota) melhor = po; }
    var lst = [];
    ORDEM.forEach(function (id) { todas.forEach(function (o) { if (o.id === id) lst.push(o); }); });
    lst.forEach(function (o) { o.numeros = numeros(o.res, prm); o.melhor = o.id === melhor.id; });
    return { ok: true, opcoes: lst, melhor: melhor.id, escolhidaMotor: mp.escolhida.id, motor: M };
  }

  /* o cruzamento de juntas onde a primeira peça cheia encosta — marcado na planta */
  function partidaDe(res, M, est, geo) {
    var th = num(res.angulo, 0), c = centro(M.ambiente), mx = res.peca.l + res.junta, my = res.peca.c + res.junta;
    var cg = caixa(M.ambiente.map(function (q) { return rot(q, -th, c); }));
    var alvo;
    if (est === "porta" && geo && geo.portas && geo.portas[0]) alvo = rot(geo.portas[0].meio, -th, c);
    else if (est === "canto") alvo = [cg.x0, cg.y0];
    else alvo = [(cg.x0 + cg.x1) / 2, (cg.y0 + cg.y1) / 2];
    var r = Math.round((alvo[1] - res.offY) / my), defas = num(res.defasagem, 0);
    var desl = defas ? (((r * defas) % 1) + 1) % 1 : 0, baseX = res.offX + desl * mx;
    var k = Math.round((alvo[0] - baseX) / mx);
    return rot([baseX + k * mx, res.offY + r * my], th, c);
  }

  /* a receita a gravar (o que vira params.pagPiso) */
  function registroPiso(geo, prm, opcao, M) {
    var res = opcao.res, th = num(res.angulo, 0), c = centro(M.ambiente), A = rot([res.offX, res.offY], th, c), n = opcao.numeros || numeros(res, prm);
    return {
      v: VERSAO, fmt: prm.fmt || "custom", L: num(prm.L, 0), C: num(prm.C, 0), j: num(prm.j, 0.002), as: prm.as || "reto", sen: prm.sen || "longo",
      ang: num(prm.ang, 0), th: th, ax: r6(A[0]), az: r6(A[1]), est: opcao.id, rs: num(prm.rs, 0), rm: prm.rm != null ? num(prm.rm, null) : null, esp: num(prm.esp, null),
      sig: geo.sig, pe: n.pecas, pd: n.perdaPct, ct: n.cortadas, mr: n.menorRecorte, "in": n.inteiras, bo: n.bolachas
    };
  }
  /* o params do ambiente → a receita lida */
  function lerParams(amb, chave) { var p = amb && amb.params; return p && typeof p[chave] === "string" ? decodificar(p[chave]) : null; }
  function prmDoRegistro(R) { return { fmt: R.fmt, L: R.L, C: R.C, j: R.j, as: R.as, sen: R.sen, ang: R.ang, rs: R.rs, rm: R.rm, esp: R.esp, ori: R.ori, hm: R.hm, H: R.H }; }

  /* ------------------------------------------------------------------
   * pisoAplicado(estado, amb, ctx) — a paginação GRAVADA, refeita no contorno
   * de agora: { estado: "ok"|"desatualizada"|"semContorno", motivo, reg, geo,
   *   res, motor, partida:[x,z], numeros, rotulo } — ou null (sem paginação).
   * ------------------------------------------------------------------ */
  function pisoAplicado(estado, amb, ctx) {
    var R = lerParams(amb, CHAVE_PISO); if (!R) return null;
    var P = PG(); if (!P) return null;
    var geo = geometriaPiso(estado, amb, ctx);
    var out = { reg: R, geo: geo, rotulo: rotuloPeca(R.L, R.C), estado: "ok", motivo: "" };
    if (!geo.ok) { out.estado = "semContorno"; out.motivo = geo.motivo; return out; }
    var prm = prmDoRegistro(R), M = motorPiso(geo, prm, num(R.th, 0)), c = centro(M.ambiente);
    var G = rot([num(R.ax, 0), num(R.az, 0)], -M.angulo, c);
    var res = P.paginar(copia(M, { offX: G[0], offY: G[1] }));
    if (!res.ok) { out.estado = "semContorno"; out.motivo = res.motivo; return out; }
    out.res = res; out.motor = M; out.numeros = numeros(res, prm); out.partida = partidaDe(res, M, R.est, geo);
    if (R.sig !== geo.sig) { out.estado = "desatualizada"; out.motivo = "O contorno do ambiente mudou depois da paginação (parede, pilar ou separador mexeu): repagine."; }
    return out;
  }

  /* ================================================== FACES DE PAREDE
   * Cada LADO de parede de um ambiente (face fora/dentro voltada para o cômodo)
   * é uma face a revestir: s corre ao longo da face, para a DIREITA de quem
   * olha a parede de dentro do cômodo; v sobe a partir do piso do ambiente. */
  function facesDoAmbiente(estado, amb, ctx, filtro) {
    ctx = ctx || {};
    var out = [], c = calcFace(estado, amb, ctx.niveis);
    if (!c || c.estado !== "delimitado") return out;
    var A = AR(), cx = caixasPorId(estado), V = vaosDe(estado, ctx);
    var cont = arr(c.contorno).map(function (q) { return [q.x, q.z]; }), furos = arr(c.furos).map(function (f) { return arr(f).map(function (q) { return [q.x, q.z]; }); });
    var base = num(c.base, 0), topo = num(c.topo, base), conta = {};
    var forro = null;
    arr(c.forrosVolume).forEach(function (fv) { if (fv && fin(fv.altura) && (forro == null || fv.altura < forro)) forro = fv.altura; });
    arr(c.lados).forEach(function (l) {
      var f0 = l && l.fonte;
      if (!f0 || f0.tipo !== "parede" || (f0.face !== "fora" && f0.face !== "dentro")) return;
      var pid = String(f0.id);
      if (filtro && filtro.paredes && filtro.paredes.indexOf(pid) < 0) return;
      var ch0 = pid + ":" + f0.face, k = conta[ch0] || 0; conta[ch0] = k + 1;
      var chave = ch0 + (k ? ":" + k : "");
      var face = { ambId: String(amb.id), ambNome: txt(amb.nome) || "Ambiente", paredeId: pid, face: f0.face, chave: chave, ok: true, motivo: "" };
      var w = cx[pid];
      if (!w || !A || !A.frameDe) { face.ok = false; face.motivo = "A parede não está no modelo."; out.push(face); return; }
      if (l.arco || ehCurva(w)) { face.ok = false; face.motivo = "Parede curva: a paginação de revestimento é só de face plana."; out.push(face); return; }
      var F0 = [l.x0, l.z0], F1 = [l.x1, l.z1], dx = F1[0] - F0[0], dz = F1[1] - F0[1], L = Math.sqrt(dx * dx + dz * dz);
      if (!(L > 0.05)) return;
      var u = [dx / L, dz / L], n = [-u[1], u[0]];
      var meio = [(F0[0] + F1[0]) / 2, (F0[1] + F1[1]) / 2];
      if (!naRegiao([meio[0] + n[0] * 0.01, meio[1] + n[1] * 0.01], cont, furos)) n = [-n[0], -n[1]];
      /* s para a direita de quem olha a parede de dentro: direita = (n.z, −n.x) */
      var dir = [n[1], -n[0]];
      if (u[0] * dir[0] + u[1] * dir[1] < 0) { var tF = F0; F0 = F1; F1 = tF; }
      var f = A.frameDe(w);
      var vb = Math.max(0, num(f.y0, base) - base), vt = Math.min(topo, num(f.y1, topo)) - base;
      if (forro != null) vt = Math.min(vt, forro);
      var Hinf = ctx.alturaInf != null ? num(ctx.alturaInf, null) : null;
      if (Hinf != null && Hinf > 0) vt = Math.min(vt, Hinf);
      if (!(vt - vb > 0.05)) { face.ok = false; face.motivo = "A face não tem altura a revestir (parede abaixo do piso ou altura zero)."; out.push(face); return; }
      var uF0 = A.aLocal(f, F0[0], F0[1])[0], uF1 = A.aLocal(f, F1[0], F1[1])[0], vaos = [];
      var vv = V[pid];
      if (vv && Math.abs(uF1 - uF0) > 1e-6) arr(vv.aceitos).forEach(function (v) {
        var sa = (num(v.x0, 0) - uF0) / (uF1 - uF0) * L, sb = (num(v.x1, 0) - uF0) / (uF1 - uF0) * L;
        var s0 = Math.max(0, Math.min(sa, sb)), s1 = Math.min(L, Math.max(sa, sb));
        var v0 = Math.max(vb, num(f.y0, 0) + num(v.y0, 0) - base), v1 = Math.min(vt, num(f.y0, 0) + num(v.y1, 0) - base);
        if (!(s1 - s0 > 1e-3) || !(v1 - v0 > 1e-3)) return;
        vaos.push({ id: v.id != null ? String(v.id) : null, x: r6(s0), y: r6(v0), l: r6(s1 - s0), c: r6(v1 - v0), piso: v0 <= vb + TOL_PISO });
      });
      face.F0 = F0; face.F1 = F1; face.L = r6(L); face.n = n; face.s = dir; face.base = base;
      face.vb = r6(vb); face.vt = r6(vt); face.H = r6(vt - vb); face.vaos = vaos; face.forro = forro;
      face.sig = assinatura([[F0, F1, [F0[0] + n[0], F0[1] + n[1]]]], [r4(vb), r4(vt)].concat(vaos.map(function (v) { return [r4(v.x), r4(v.y), r4(v.l), r4(v.c)].join(","); })).join("/"));
      out.push(face);
    });
    return out;
  }
  /* as faces de várias paredes, em todos os ambientes delimitados (cada face é de UM cômodo) */
  function facesDasParedes(estado, paredes, ctx) {
    var out = [], ids = paredes ? arr(paredes).map(String) : null;
    arr(estado && estado.ambientes).forEach(function (a) {
      if (!a || !a.calc || a.calc.estado !== "delimitado") return;
      facesDoAmbiente(estado, a, ctx, ids ? { paredes: ids } : null).forEach(function (f) { out.push(f); });
    });
    return out;
  }

  /* o motor para uma face (s, v) */
  function retFace(face) { return [[0, face.vb], [face.L, face.vb], [face.L, face.vt], [0, face.vt]]; }
  function motorFace(face, peca, j, prm) {
    var o = { ambiente: retFace(face), vaos: arr(face.vaos).map(function (v) { return { x: v.x, y: v.y, l: v.l, c: v.c }; }), peca: peca, junta: j,
              assentamento: prm.as || "reto", angulo: anguloAss(prm.as) };
    if (prm.rm != null && fin(Number(prm.rm))) o.recorteMin = Number(prm.rm);
    return o;
  }

  /* ------------------------------------------------------------------
   * herancaPiso(pisoAp, face, prm) — a parede herda a grade do piso?
   *   { herda:true, eixo:"x"|"y", w, h, junta, mod, offX, juntasPiso:[s], ps }
   *   { herda:false, motivo }
   * ------------------------------------------------------------------ */
  function assinaturaPiso(R) { return R ? hashTexto(codificar(R, true)) : null; }
  function herancaPiso(pisoAp, face, prm) {
    if (!face || !face.ok) return { herda: false, motivo: (face && face.motivo) || "Face inválida." };
    if (!pisoAp || !pisoAp.res || !pisoAp.res.ok) return { herda: false, motivo: "O piso deste ambiente ainda não foi paginado: pagine o piso primeiro para a parede herdar a grade dele." };
    var R = pisoAp.reg, m = mesmaPeca(R, prm);
    if (!m.peca) return { herda: false, motivo: "Peça diferente da do piso (" + rotuloPeca(prm.L, prm.C) + " na parede, " + rotuloPeca(R.L, R.C) + " no piso): as juntas não têm como se encontrar. A parede é paginada sozinha." };
    if (!m.junta) return { herda: false, motivo: "Mesma peça, junta diferente (" + r3(num(prm.j, 0) * 1000) + " mm na parede, " + r3(num(R.j, 0) * 1000) + " mm no piso): o passo da grade não bate. Use a junta do piso para herdar." };
    if (anguloAss(prm.as) !== 0) return { herda: false, motivo: "Revestimento em diagonal não continua a junta do piso." };
    var res = pisoAp.res, th = num(res.angulo, 0), phi = angReta(face.s[0], face.s[1]), d = difReta(phi, th);
    var eixo = (d < TOL_ANG || d > 180 - TOL_ANG) ? "x" : (Math.abs(d - 90) < TOL_ANG ? "y" : null);
    if (!eixo) return { herda: false, motivo: "A grade do piso está a " + r3(Math.min(d, 180 - d)) + "° desta parede: a junta do piso chega inclinada e não continua na parede." };
    var pe = res.peca, j = res.junta, mx = pe.l + j, my = pe.c + j, c = centro(pisoAp.motor.ambiente);
    var meio = [(face.F0[0] + face.F1[0]) / 2, (face.F0[1] + face.F1[1]) / 2];
    var G = rot([meio[0] + face.n[0] * 0.005, meio[1] + face.n[1] * 0.005], -th, c), Jg, w, h, mod;
    if (eixo === "x") {
      /* a fiada do piso que encosta nesta parede (com a amarração dela) */
      var r = Math.floor((G[1] - res.offY) / my), defas = num(res.defasagem, 0);
      var desl = defas ? (((r * defas) % 1) + 1) % 1 : 0;
      Jg = [res.offX + desl * mx + pe.l + j / 2, G[1]]; w = pe.l; h = pe.c; mod = mx;
    } else {
      Jg = [G[0], res.offY + pe.c + j / 2]; w = pe.c; h = pe.l; mod = my;
    }
    var Jw = rot(Jg, th, c);
    var s0 = (Jw[0] - face.F0[0]) * face.s[0] + (Jw[1] - face.F0[1]) * face.s[1];
    var offX = s0 - w - j / 2; offX = offX - Math.floor(offX / mod) * mod;
    var juntas = [], sk = s0 - Math.ceil(s0 / mod) * mod;
    for (var g = 0; g < 100000 && sk < face.L; g++, sk += mod) if (sk > 0) juntas.push(r6(sk));
    return { herda: true, eixo: eixo, w: w, h: h, junta: j, mod: mod, offX: r6(offX), s0: r6(s0), juntasPiso: juntas, ps: assinaturaPiso(R),
             motivo: "Mesma peça e mesma junta do piso: a junta vertical da parede continua a junta do piso na aresta de encontro." };
  }

  var ROT_PAREDE = { canto: "Peça inteira no piso", central: "Centralizada na altura", otimizada: "Otimizada (menor recorte máximo)" };
  var ROT_PAREDE_LIVRE = { canto: "Peça inteira no canto do piso", central: "Centralizada", otimizada: "Otimizada (menor recorte máximo)" };
  /* ------------------------------------------------------------------
   * opcoesFace(face, prm, her) — as opções de uma face (com a herança, só a
   * altura varia): { ok, opcoes, melhor, motor, her }
   * ------------------------------------------------------------------ */
  function opcoesFace(face, prm, her) {
    var P = PG();
    if (!P) return { ok: false, motivo: "O motor de paginação não carregou." };
    if (!face || !face.ok) return { ok: false, motivo: (face && face.motivo) || "Face inválida." };
    var herda = !!(her && her.herda);
    var peca = herda ? { l: her.w, c: her.h } : pecaParede(prm), j = herda ? her.junta : num(prm.j, 0.002);
    var M = motorFace(face, peca, j, prm);
    if (herda) M.fixoX = her.offX;
    var mp = P.melhorPartida(M);
    if (!mp.ok) return { ok: false, motivo: mp.motivo };
    var R = herda ? ROT_PAREDE : ROT_PAREDE_LIVRE;
    var lst = mp.opcoes.map(function (o) { return { id: o.id, rotulo: R[o.id] || o.rotulo, quando: o.quando, res: o.res, nota: o.nota }; });
    lst.sort(function (a, b) { return ORDEM.indexOf(a.id) - ORDEM.indexOf(b.id); });
    lst.forEach(function (o) { o.numeros = numeros(o.res, prm); o.melhor = o.id === mp.escolhida.id; });
    return { ok: true, opcoes: lst, melhor: mp.escolhida.id, motor: M, her: her || { herda: false } };
  }
  function registroParede(face, prm, opcao, her, M) {
    var res = opcao.res, n = opcao.numeros || numeros(res, prm), herda = !!(her && her.herda);
    return {
      v: VERSAO, fmt: prm.fmt || "custom", L: num(prm.L, 0), C: num(prm.C, 0), j: M.junta, as: prm.as || "reto", ori: prm.ori || "deitada",
      hm: prm.hm === "info" ? "info" : "auto", H: prm.hm === "info" ? num(prm.H, null) : null,
      pw: M.peca.l, ph: M.peca.c, ox: r6(res.offX), oy: r6(res.offY), est: opcao.id, hd: herda ? 1 : 0, ps: herda ? her.ps : null,
      rs: num(prm.rs, 0), rm: prm.rm != null ? num(prm.rm, null) : null, esp: num(prm.esp, null), sig: face.sig,
      pe: n.pecas, pd: n.perdaPct, ct: n.cortadas, mr: n.menorRecorte, "in": n.inteiras, bo: n.bolachas
    };
  }
  function chavesParede(amb) {
    var p = amb && amb.params; if (!p) return [];
    return Object.keys(p).filter(function (k) { return k.indexOf(PREF_PAREDE) === 0 && typeof p[k] === "string"; }).sort();
  }
  /* ------------------------------------------------------------------
   * paredeAplicada(estado, amb, chave, ctx, pisoAp?) — a face gravada refeita:
   *   { estado: "ok"|"desatualizada"|"semFace", motivo, reg, face, res, motor, numeros }
   * ------------------------------------------------------------------ */
  function paredeAplicada(estado, amb, chave, ctx, pisoAp) {
    var R = lerParams(amb, PREF_PAREDE + chave); if (!R) return null;
    var P = PG(); if (!P) return null;
    var c2 = copia(ctx || {}, { alturaInf: R.hm === "info" ? R.H : null });
    var faces = facesDoAmbiente(estado, amb, c2), face = null;
    faces.forEach(function (f) { if (f.chave === chave) face = f; });
    var out = { chave: chave, reg: R, rotulo: rotuloPeca(R.L, R.C), estado: "ok", motivo: "", herda: !!R.hd };
    if (!face || !face.ok) { out.estado = "semFace"; out.motivo = face ? face.motivo : "A face desta parede não existe mais neste ambiente (parede apagada, trocada ou o ambiente mudou)."; return out; }
    var prm = prmDoRegistro(R), M = motorFace(face, { l: num(R.pw, 0), c: num(R.ph, 0) }, num(R.j, 0.002), prm);
    var res = P.paginar(copia(M, { offX: num(R.ox, 0), offY: num(R.oy, 0) }));
    out.face = face;
    if (!res.ok) { out.estado = "semFace"; out.motivo = res.motivo; return out; }
    out.res = res; out.motor = M; out.numeros = numeros(res, prm);
    if (R.sig !== face.sig) { out.estado = "desatualizada"; out.motivo = "A parede mudou depois da paginação (comprimento, altura ou vão): repagine."; }
    else if (R.hd) {
      var pa = pisoAp !== undefined ? pisoAp : pisoAplicado(estado, amb, ctx);
      if (!pa || assinaturaPiso(pa.reg) !== R.ps) { out.estado = "desatualizada"; out.motivo = "O piso deste ambiente foi repaginado (ou removido): a junta da parede não bate mais com a dele. Repagine a parede."; }
      else if (pa.estado === "desatualizada") { out.estado = "desatualizada"; out.motivo = "O piso deste ambiente está desatualizado: repagine o piso e depois a parede."; }
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * conferirJuntas(face, resParede, resPiso) — CONFERÊNCIA INDEPENDENTE da
   * herança, pela geometria das PEÇAS (não pela conta que a decidiu): as bordas
   * das peças do piso que tocam a aresta de encontro × as bordas das peças da
   * fiada de baixo da parede. Fora das portas e longe das pontas da face.
   *   { n, erroMax (m), pares:[{s, erro}] }
   * ------------------------------------------------------------------ */
  function conferirJuntas(face, resParede, resPiso) {
    var Lf = face.L, tol = 1e-3, sp = [], sw = [];
    function pontoNaAresta(q) {
      var dx = q[0] - face.F0[0], dz = q[1] - face.F0[1];
      var s = dx * face.s[0] + dz * face.s[1], d = Math.abs(dx * face.n[0] + dz * face.n[1]);
      return d < tol ? s : null;
    }
    function porta(s) { return arr(face.vaos).some(function (v) { return v.piso && s > v.x - 0.003 && s < v.x + v.l + 0.003; }); }
    function junta(L, s) { if (s < 0.003 || s > Lf - 0.003 || porta(s)) return; for (var i = 0; i < L.length; i++) if (Math.abs(L[i] - s) < 5e-5) return; L.push(s); }
    arr(resPiso && resPiso.pecas).forEach(function (p) { arr(p.poli).forEach(function (q) { var s = pontoNaAresta(q); if (s != null) junta(sp, s); }); });
    arr(resParede && resParede.pecas).forEach(function (p) { arr(p.poli).forEach(function (q) { if (Math.abs(q[1] - face.vb) < tol) junta(sw, q[0]); }); });
    var pares = sp.map(function (s) {
      var e = Infinity; sw.forEach(function (t) { var d = Math.abs(t - s); if (d < e) e = d; });
      return { s: r4(s), erro: e };
    });
    var mx = 0; pares.forEach(function (p) { if (p.erro > mx) mx = p.erro; });
    return { n: pares.length, erroMax: pares.length ? r6(mx) : null, pares: pares, bordasParede: sw.length };
  }

  /* ================================================== as ops (Ctrl+Z desfaz cada uma inteira) */
  function opValida(o) { var E = ED(); return !E || !E.opAmbienteValida || E.opAmbienteValida(o); }
  function opAjuste(ambId, params) {
    if (ambId == null || ambId === "") return { ok: false, motivo: "Escolha um ambiente." };
    var o = { op: "ajustarAmbiente", id: String(ambId), campos: { params: params } };
    if (!opValida(o)) return { ok: false, motivo: "A paginação não coube no formato do ambiente." };
    return { ok: true, op: o };
  }
  function opAplicarPiso(ambId, reg) {
    var t = codificar(reg); if (!t) return { ok: false, motivo: "A paginação não coube no formato do ambiente." };
    var p = {}; p[CHAVE_PISO] = t; return opAjuste(ambId, p);
  }
  function opRemoverPiso(ambId) { var p = {}; p[CHAVE_PISO] = null; return opAjuste(ambId, p); }
  /* várias faces → UMA op por ambiente (lista [{ambId, chave, reg}]) */
  function opsAplicarParedes(lista) {
    var por = {}, ordem = [], ops = [];
    arr(lista).forEach(function (x) {
      if (!x || x.ambId == null || !x.chave) return;
      var t = x.reg === null ? null : codificar(x.reg); if (t === "") return;
      var k = String(x.ambId); if (!por[k]) { por[k] = {}; ordem.push(k); }
      por[k][PREF_PAREDE + x.chave] = t;
    });
    for (var i = 0; i < ordem.length; i++) {
      var r = opAjuste(ordem[i], por[ordem[i]]);
      if (!r.ok) return r;
      ops.push(r.op);
    }
    return { ok: ops.length > 0, ops: ops, motivo: ops.length ? "" : "Nenhuma face para gravar." };
  }

  /* ================================================== o que vai para o orçamento
   * resumoAmbiente(estado, amb, ctx) — as peças e a perda da paginação gravada:
   *   { piso: {...} | null, paredes: [...], pecasPiso, pecasParede, desatualizadas, avisos }
   * (js/bimacabamento.js põe em Q.paginacao; js/orcmodelo.js leva para a linha) */
  function resumoAmbiente(estado, amb, ctx) {
    if (!amb || !amb.params) return null;
    var temPiso = typeof amb.params[CHAVE_PISO] === "string", chs = chavesParede(amb);
    if (!temPiso && !chs.length) return null;
    var pa = temPiso ? pisoAplicado(estado, amb, ctx) : null, out = { piso: null, paredes: [], pecasPiso: 0, pecasParede: 0, desatualizadas: 0, avisos: [] };
    function linha(x) {
      var n = x.numeros || {};
      return { estado: x.estado, motivo: x.motivo || "", peca: x.rotulo, pecas: n.pecas != null ? n.pecas : null, perdaPct: n.perdaPct != null ? n.perdaPct : null,
               cortadas: n.cortadas != null ? n.cortadas : null, inteiras: n.inteiras != null ? n.inteiras : null, m2Compra: n.m2Compra != null ? n.m2Compra : null,
               reservaPct: n.reservaPct != null ? n.reservaPct : null };
    }
    if (pa) {
      out.piso = linha(pa);
      if (pa.numeros) out.pecasPiso = pa.numeros.pecas;
      if (pa.estado !== "ok") { out.desatualizadas++; out.avisos.push("paginação do piso " + (pa.estado === "desatualizada" ? "desatualizada — repaginar" : "sem contorno") + ": " + pa.motivo); }
    }
    chs.forEach(function (k) {
      var x = paredeAplicada(estado, amb, k.slice(PREF_PAREDE.length), ctx, pa); if (!x) return;
      var l = linha(x); l.chave = x.chave; l.herda = x.herda; out.paredes.push(l);
      if (x.numeros && x.estado !== "semFace") out.pecasParede += x.numeros.pecas;
      if (x.estado !== "ok") { out.desatualizadas++; out.avisos.push("paginação da parede " + x.chave + " " + (x.estado === "desatualizada" ? "desatualizada — repaginar" : "sem face") + ": " + x.motivo); }
    });
    return out;
  }

  var BimPaginacao = {
    VERSAO: VERSAO, CHAVE_PISO: CHAVE_PISO, PREF_PAREDE: PREF_PAREDE, TOL_ANG: TOL_ANG, ORDEM: ORDEM,
    codificar: codificar, decodificar: decodificar, assinatura: assinatura, assinaturaPiso: assinaturaPiso,
    paramsPadrao: paramsPadrao, rotuloPeca: rotuloPeca, mesmaPeca: mesmaPeca, pecaPiso: pecaPiso, pecaParede: pecaParede,
    geometriaPiso: geometriaPiso, motorPiso: motorPiso, opcoesPiso: opcoesPiso, registroPiso: registroPiso, pisoAplicado: pisoAplicado,
    facesDoAmbiente: facesDoAmbiente, facesDasParedes: facesDasParedes, herancaPiso: herancaPiso, opcoesFace: opcoesFace,
    registroParede: registroParede, paredeAplicada: paredeAplicada, chavesParede: chavesParede, conferirJuntas: conferirJuntas,
    opAplicarPiso: opAplicarPiso, opRemoverPiso: opRemoverPiso, opsAplicarParedes: opsAplicarParedes, resumoAmbiente: resumoAmbiente,
    lerParams: lerParams, prmDoRegistro: prmDoRegistro, partidaDe: partidaDe,
    /* utilidades para a tela e o teste */
    _geo: { rot: rot, centro: centro, caixa: caixa, angReta: angReta, difReta: difReta, naRegiao: naRegiao, canon: canon }
  };

  global.BimPaginacao = BimPaginacao;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPaginacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

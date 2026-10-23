/* =====================================================================
 * mobauditor.js — AUDITOR DE LAYOUT DO MOBILIÁRIO (21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Confere QUALQUER layout — o do "Mobiliar ambiente" (js/mobauto.js) ou o feito à mão — contra as MESMAS regras e os MESMOS
 * números (js/mobregras.js ← regras-layout.json). Cada achado sai no molde do projeto (js/problemacard.js): o que é, em
 * palavras simples + "Corrigir" (reposicionar na posição válida mais perto / trocar pela peça MENOR da mesma categoria que
 * resolve) + "Mostrar no 3D" (as peças do problema).
 *
 *   MobAuditor.auditar({ estado, avaliarFam, ambientes: [ids] | null, acessivel, ops }) → { problemas[], porCodigo{}, porAmbiente{}, resumo }
 *
 * CÓDIGOS (gravidade · regra):
 *   MOB_FORA          erro   a peça sai do ambiente / atravessa a parede (inclusive armário planejado mais largo que a parede)
 *   MOB_PORTA         erro   a peça está no arco da porta ou na faixa livre dela (acess-9050-corredor-4m)
 *   MOB_SOBREPOSTO    erro   duas peças ocupam o mesmo lugar (na mesma faixa de altura)
 *   MOB_CIRCULACAO    erro   a faixa de uso da peça (a da regra dela) não está livre — diz quanto sobra
 *   MOB_SEM_ACESSO    erro   não há passagem da largura da regra da porta até a peça (grade de 5 cm)
 *   MOB_GIRO          erro   projeto acessível sem a área de giro Ø 1,50 (acess-9050-giro-dormitorio / -rot360)
 *   MOB_JANELA        aviso  peça mais alta que o peitoril na frente da janela (ra-janela-faixa [P])
 *   MOB_LATERAL_CASAL aviso  cama de casal com menos de 0,70 m de lado/pé (dorm-vao-lateral-frente — preferível)
 *   MOB_TV_DISTANCIA  aviso  sofá fora da faixa diagonal × 1,2–2,5 da TV (sala-tv-multiplicador-diagonal)
 *   MOB_COZ_TRIANGULO aviso  triângulo pia–fogão–geladeira fora de 1,2–2,7 m / soma > 7,9 m (coz-nkba-triangulo-*), só com a pia modelada
 *   MOB_PLAN_VAO      aviso  armário planejado com vão de eletro que não coube na largura total (o vão saiu do desenho)
 * ⚠ Corrigir só é oferecido quando a solução foi TESTADA aqui (a posição/peça nova passa nas mesmas regras). Sem solução
 *   testada, o cartão diz o problema sem botão — botão que não resolve é o defeito que o ProblemaCard existe para impedir.
 * ⚠ ÚLTIMO RECURSO (23/10/2026): ERRO de peça do Mobiliar automático (moba-…) em que nenhuma posição nem troca resolveu ganha
 *   "Retirar <peça> deste ambiente — não há posição livre que caiba" (op apagar), também testado. Nunca junto com outra solução,
 *   nunca em peça posta à mão (tools/test-mob-um-clique.js [6] "quarto apertado" + dois controles negativos).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function MA() { return dep("MobAuto", "./mobauto.js"); }
  function MR() { return dep("MobRegras", "./mobregras.js"); }
  function FC() { return dep("FamiliasCat", "./familiascat.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function CV(k) { return MR().CRITERIOS[k].valor; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function comp(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); }

  /* ---------------------------------------------------------------- a FAIXA DE USO de cada categoria (a mesma régua do motor) */
  function eh(cat, re) { return re.test(cat || ""); }
  /* faixas(e) → [{ x0, x1, z0, z1, crit, rotulo, opcional }] no quadro da peça (fundo em z = 0, frente em +z) */
  function faixas(e, ctx) {
    var c = e.cat, L = e.L, P = e.P, out = [];
    function frente(k, rot) { out.push({ x0: -L / 2, x1: L / 2, z0: P, z1: P + CV(k), crit: k, rotulo: rot }); }
    if (eh(c, /^cama-|^beliche/)) {
      var cd = CV("circDorm"), sol = eh(c, /solteiro|beliche/);
      out.push({ x0: -L / 2 - cd, x1: -L / 2, z0: 0.5, z1: P, crit: "circDorm", rotulo: "lateral da cama", lado: -1, encostavel: sol });
      out.push({ x0: L / 2, x1: L / 2 + cd, z0: 0.5, z1: P, crit: "circDorm", rotulo: "lateral da cama", lado: 1, encostavel: sol });
      out.push({ x0: -L / 2, x1: L / 2, z0: P, z1: P + cd, crit: "circDorm", rotulo: "pé da cama" });
    } else if (eh(c, /^guarda-roupa/)) frente(/correr/i.test(e.pecaNome || e.nome) ? "circDorm" : "roupeiroGiro", "frente do guarda-roupa");   /* o nome da PEÇA diz se é de correr (o da família não) */
    else if (c === "planejado-roupeiro") frente(ctx && ctx.tipo === "closet" ? "closetCorredor" : "roupeiroGiro", "frente do armário");
    else if (eh(c, /^(comoda|estante|buffet|aparador)/)) frente("circDorm", "frente da peça");
    else if (c === "rack-painel-tv") frente("mesaTv", "frente do móvel da TV");
    else if (eh(c, /^sofa-(2|3|retratil|canto)/)) frente("sofaMesaMin", "frente do sofá");
    else if (eh(c, /^mesa-(jantar|reuniao)/) || (c === "mesa-cadeira-varanda-gourmet" && /mesa/i.test(e.nome))) {
      var f = CV("jantarParede"); out.push({ x0: -L / 2 - f, x1: L / 2 + f, z0: -f, z1: P + f, crit: "jantarParede", rotulo: "em volta da mesa", volta: true });
    } else if (eh(c, /^(escrivaninha|mesa-escritorio)/) && e.encostada) frente("homeRecuo", "recuo da cadeira");
    else if (eh(c, /^(tanque|lava-seca)/)) frente("lavFrente", "frente da peça");
    else if (eh(c, /^(planejado-base|geladeira|fogao)/)) frente("cozCorredor", "corredor de trabalho");
    else if (eh(c, /^(balcao|sofa-espera|armario-baixo|vitrine|churrasqueira)/)) frente("circPrincipal", "frente da peça");
    else if (eh(c, /^maca/)) {   /* o atendimento por UM dos lados compridos (qualquer um): as duas faixas são alternativas */
      out.push({ x0: L / 2, x1: L / 2 + CV("circPrincipal"), z0: 0, z1: P, crit: "circPrincipal", rotulo: "lado do atendimento", lado: 1, ou: "maca" });
      out.push({ x0: -L / 2 - CV("circPrincipal"), x1: -L / 2, z0: 0, z1: P, crit: "circPrincipal", rotulo: "lado do atendimento", lado: -1, ou: "maca" });
    }
    return out;
  }
  /* a âncora de uma peça dependente (as cadeiras são da mesa, o criado e o colchão da cama, a TV do rack…) — mesmo grupo */
  var DONO = [[/^cadeira-jantar$|varanda/, /^mesa-(jantar|cadeira-varanda)/, 1.3], [/^cadeira-escritorio|^cadeira-visitante|^gaveteiro/, /^(escrivaninha|mesa-escritorio|mesa-reuniao|balcao)/, 1.5],
    [/^criado-mudo$|^colchao$/, /^cama-|^beliche/, 1.2], [/^tv$/, /^rack-painel-tv$/, 0.8], [/^coifa|^planejado-aereo$/, /^(fogao|planejado-base|geladeira)/, 1.5], [/^cadeira-escritorio/, /^mesa-reuniao/, 1.5]];
  function donoDe(e, todos) {
    for (var i = 0; i < DONO.length; i++) {
      if (!DONO[i][0].test(e.cat || "")) continue;
      var best = null, dmin = DONO[i][2];
      todos.forEach(function (o) { if (o === e || !DONO[i][1].test(o.cat || "") || !o.fp || !e.fp) return; var d = comp(sub(o.fp.c, e.fp.c)) - Math.max(o.fp.hu, o.fp.hv); if (d < dmin) { dmin = d; best = o; } });
      if (best) return best.dono || best.id;
    }
    return null;
  }
  /* as faixas de fila da cozinha: base/geladeira/fogão contíguos são o mesmo grupo */
  function grupoFila(ex) {
    var fila = ex.filter(function (e) { return eh(e.cat, /^(planejado-base|geladeira|fogao)/); });
    fila.forEach(function (e) { fila.forEach(function (o) { if (o !== e && Math.abs(dot(e.fp.v, o.fp.v)) > 0.99 && comp(sub(e.fp.c, o.fp.c)) < e.fp.hu + o.fp.hu + 0.6) { var g = e.dono || o.dono || ("fila:" + e.id); e.dono = g; o.dono = g; } }); });
  }

  /* ---------------------------------------------------------------- a medida LIVRE de uma faixa (para dizer "sobra x m") */
  function faixaObb(e, fx, prof) {
    var A = MA(), d = prof == null ? null : prof;
    if (fx.volta) { var f = d == null ? CV(fx.crit) : d; return A.obb(e.B, e.r, -e.L / 2 - f, e.L / 2 + f, -f, e.P + f); }
    if (d == null) return A.obb(e.B, e.r, fx.x0, fx.x1, fx.z0, fx.z1);
    if (fx.z0 >= e.P - 1e-6) return A.obb(e.B, e.r, fx.x0, fx.x1, fx.z0, fx.z0 + d);
    if (fx.x0 >= e.L / 2 - 1e-6) return A.obb(e.B, e.r, fx.x0, fx.x0 + d, fx.z0, fx.z1);
    return A.obb(e.B, e.r, fx.x1 - d, fx.x1, fx.z0, fx.z1);
  }
  function faixaLivre(ctx, e, o) {
    var A = MA(); if (!A.dentroUso(ctx, o)) return { ok: false, porque: "parede" };
    for (var i = 0; i < ctx.obst.length; i++) {
      var b = ctx.obst[i]; if (b.leve || b.id === e.id || b.y0 > 1.8 || (b.grupo && b.grupo === e.dono)) continue;
      if (A.sobrepoe(o, b.fp)) return { ok: false, porque: b.nome, id: b.id };
    }
    return { ok: true };
  }
  function medir(ctx, e, fx) {
    var req = CV(fx.crit), lo = 0, hi = req, i;
    if (faixaLivre(ctx, e, faixaObb(e, fx, req)).ok) return { ok: true, sobra: req, req: req };
    for (i = 0; i < 12; i++) { var m = (lo + hi) / 2; if (faixaLivre(ctx, e, faixaObb(e, fx, m)).ok) lo = m; else hi = m; }
    return { ok: false, sobra: lo, req: req, bate: faixaLivre(ctx, e, faixaObb(e, fx, req)) };
  }

  /* ---------------------------------------------------------------- SOLUÇÕES (testadas) */
  function validarPeca(ctx, e, B, r, pc) {
    var A = MA(), y0 = e.y0, c = { fp: A.obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: y0, y1: y0 + pc.A, grupo: e.dono || e.id, nome: e.nome, ignorar: [e.id], usos: [] };
    var e2 = { id: e.id, cat: e.cat, nome: pc.nome || e.nome, pecaNome: pc.nome || e.pecaNome, L: pc.L, P: pc.P, B: B, r: r, dono: e.dono || e.id, encostada: e.encostada };
    faixas(e2, ctx).forEach(function (fx) { if (fx.encostavel && encostadoLado(ctx, e2, fx)) return; var u = { obb: faixaObb(e2, fx), prof: CV(fx.crit), crit: fx.crit, rotulo: fx.rotulo }; c.usos.push(u); });
    var err = A.validar(ctx, c); if (err) return err;
    return null;
  }
  function encostadoLado(ctx, e, fx) { var A = MA(), o = A.obb(e.B, e.r, fx.lado < 0 ? -e.L / 2 - 0.06 : e.L / 2 + 0.01, fx.lado < 0 ? -e.L / 2 - 0.01 : e.L / 2 + 0.06, 0.1, e.P - 0.1); return !A.cantos(o).some(function (p) { return A.dentro(p, ctx.geo.pts); }); }
  function opsMover(e, B, r, cen, P) {
    var A = MA(), o = cen ? A.noMundo(B, r, 0, P / 2) : B, ops = [{ op: "mover", id: e.id, cx: r4(o[0]), cz: r4(o[1]) }];
    if (Math.abs(r - e.r) > 1e-4) ops.push({ op: "instancia", id: e.id, rotY: r4(r) });
    return ops;
  }
  /* reposicionar: as posições válidas mais perto (encostada: nas paredes; solta: em volta, mesmo giro) — até 6, a conferir */
  function reposicionar(ctx, e) {
    var A = MA(), pc = { L: e.L, P: e.P, A: e.A, nome: e.nome }, achados = [];
    function tenta(B, r, d) { if (achados.length >= 6) return; if (!validarPeca(ctx, e, B, r, pc) && semPerderAcesso(ctx, e, B, r, pc)) achados.push({ B: B, r: r, d: d }); }
    if (!e.cen) {   /* peça de encostar (origem no fundo): procura nas paredes, mesmo que agora esteja solta */
      var cand = [];
      ctx.geo.edges.forEach(function (ed) {
        A.livres(ed, e.y0, e.y0 + e.A).forEach(function (iv) {
          if (iv[1] - iv[0] < e.L - 1e-6) return;
          for (var s = iv[0] + e.L / 2; s <= iv[1] - e.L / 2 + 1e-6; s += 0.05) { var B = [ed.a[0] + ed.d[0] * s + ed.n[0] * 0.003, ed.a[1] + ed.d[1] * s + ed.n[1] * 0.003]; cand.push({ B: B, r: ed.r, d: comp(sub(B, e.B)) }); }
        });
      });
      cand.sort(function (a, b) { return a.d - b.d; });
      for (var i = 0; i < cand.length && i < 600 && achados.length < 6; i++) if (cand[i].d > 0.02) tenta(cand[i].B, cand[i].r, cand[i].d);
    } else {
      for (var rad = 0.05; rad <= 2.0 && achados.length < 6; rad += 0.05) {
        var n = Math.max(8, Math.round(2 * Math.PI * rad / 0.05));
        for (var k = 0; k < n && achados.length < 6; k++) { var a = 2 * Math.PI * k / n; tenta([e.B[0] + Math.cos(a) * rad, e.B[1] + Math.sin(a) * rad], e.r, rad); }
      }
    }
    return achados.map(function (b) { return { id: "reposicionar", texto: "Reposicionar " + e.nome + " a " + f2(b.d) + " m (posição livre mais perto)", ops: opsMover(e, b.B, b.r, e.cen, e.P), pecas: [e.id] }; });
  }
  /* as faixas que contam para a PASSAGEM (sofá, poltrona, mesa de centro: basta chegar perto da peça) */
  function alvoUsos(ctx, e) {
    var A = MA();
    if (/^(sofa-(2|3|retratil|canto)|poltrona|mesa-centro|mesa-lateral|puff)/.test(e.cat || "")) return [{ obb: A.encolher(e.fp, -0.5) }];
    return faixas(e, ctx).filter(function (fx) { return !(fx.encostavel && encostadoLado(ctx, e, fx)); }).map(function (fx) { return { obb: faixaObb(e, fx), prof: CV(fx.crit), crit: fx.crit, rotulo: fx.rotulo }; });
  }
  function alcancaveisAntes(ctx) {
    if (ctx._alc) return ctx._alc;
    var A = MA(), G = A.grade(ctx, []), vis = A.alcance(ctx, G, ctx.passagem), out = {};
    ctx.alvos.forEach(function (al) { out[al.id] = !vis || al.usos.some(function (u) { return A.chega(G, vis, u.obb); }); });
    ctx._alc = out; return out;
  }
  function semPerderAcesso(ctx, e, B, r, pc) {
    var A = MA(); if (!ctx.temPorta) return true;
    var fp = A.obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), obst0 = ctx.obst;
    ctx.obst = obst0.filter(function (o) { return o.id !== e.id; });
    var G = A.grade(ctx, e.y0 < 1.0 && !e.leve ? [fp] : []), vis = A.alcance(ctx, G, ctx.passagem), ok = true;
    var e2 = { id: e.id, cat: e.cat, nome: e.nome, L: pc.L, P: pc.P, B: B, r: r, fp: fp, encostada: e.encostada }, proprios = alvoUsos(ctx, e2), base = alcancaveisAntes(ctx);
    if (vis) {
      /* só conta quem JÁ era alcançável: o que outra peça bloqueia não reprova esta solução */
      ctx.alvos.forEach(function (al) { if (al.id === e.id || !ok || !base[al.id]) return; if (!al.usos.some(function (u) { return A.chega(G, vis, u.obb); })) ok = false; });
      if (ok && proprios.length && !proprios.some(function (u) { return A.chega(G, vis, u.obb); })) ok = false;
    }
    ctx.obst = obst0;
    return ok;
  }
  /* trocar pela MENOR da mesma categoria que resolve, na mesma posição (a encostada mantém o fundo; a solta, o centro) */
  function trocarMenor(ctx, e) {
    var F = FC(), A = MA();
    if (e.famId === "ra-plan-armario") {
      /* o planejado: a largura total vira a do trecho livre da parede onde ele está */
      var ed = ctx.geo.edges.filter(function (x) { return Math.abs(dot(x.n, A.eixoV(e.r))) > 0.99 && Math.abs(dot(sub(e.B, x.a), x.n)) < 0.05; })[0];
      if (!ed) return [];
      /* o trecho livre da parede SEM as outras peças encostadas nela (geladeira, fogão, a outra base…) */
      var s = dot(sub(e.B, ed.a), ed.d), livresP = A.livres(ed, e.y0, e.y0 + e.A), faixaP = A.obb([ed.a[0] + ed.d[0] * ed.len / 2, ed.a[1] + ed.d[1] * ed.len / 2], ed.r, -ed.len / 2, ed.len / 2, 0, e.P + 0.02);
      ctx.obst.forEach(function (o2) {
        if (o2.id === e.id || o2.leve || !(o2.y0 < e.y0 + e.A - 0.01 && e.y0 < o2.y1 - 0.01) || !A.sobrepoe(o2.fp, faixaP)) return;
        var ss = A.cantos(o2.fp).map(function (p2) { return dot(sub(p2, ed.a), ed.d); }), a0 = Math.min.apply(null, ss), a1 = Math.max.apply(null, ss), nv = [];
        livresP.forEach(function (x) { if (a1 <= x[0] || a0 >= x[1]) { nv.push(x); return; } if (a0 > x[0]) nv.push([x[0], a0]); if (a1 < x[1]) nv.push([a1, x[1]]); });
        livresP = nv;
      });
      var iv = livresP.filter(function (x) { return s >= x[0] - 0.05 && s <= x[1] + 0.05; })[0] || livresP.sort(function (x, y) { return Math.abs((x[0] + x[1]) / 2 - s) - Math.abs((y[0] + y[1]) / 2 - s); })[0];
      if (!iv) return [];
      var Lw = Math.floor((iv[1] - iv[0]) * 100) / 100; if (Lw < 0.3 || Lw >= e.L - 0.01) return [];
      var sc = (iv[0] + iv[1]) / 2, B = [ed.a[0] + ed.d[0] * sc + ed.n[0] * 0.003, ed.a[1] + ed.d[1] * sc + ed.n[1] * 0.003];
      if (validarPeca(ctx, e, B, e.r, { L: Lw, P: e.P, A: e.A })) return [];
      return [{ id: "trocar", texto: "Ajustar a largura total a " + f2(Lw) + " m (o trecho livre da parede)", ops: [{ op: "mover", id: e.id, cx: r4(B[0]), cz: r4(B[1]) }, { op: "instancia", id: e.id, inst: { Largura_total: Lw } }], pecas: [e.id] }];
    }
    if (!F || !/^ra-cat-/.test(e.famId)) return [];
    var alts = F.alternativas(e.famId, e.tipoId, 60).filter(function (a) { return a.largura <= e.L + 1e-6 && (a.largura < e.L - 0.01 || a.profundidade < e.P - 0.01); });
    alts.sort(function (a, b) { return (b.largura * b.profundidade) - (a.largura * a.profundidade); });
    var out = [];
    for (var i = 0; i < alts.length && out.length < 4; i++) {
      var a = alts[i], cx = A.caixaDe(ctx.aval, e.famId, a.tipoId, {}), pc = { L: cx ? cx.L : a.largura, P: cx ? cx.P : a.profundidade, A: cx ? cx.A : a.altura, nome: a.nome };
      var B2 = e.cen ? A.noMundo(e.B, e.r, 0, (e.P - pc.P) / 2) : e.B;
      if (validarPeca(ctx, e, B2, e.r, pc) || !semPerderAcesso(ctx, e, B2, e.r, pc)) continue;
      out.push({ id: "trocar", texto: "Trocar por " + a.nome + " (" + f2(pc.L) + " × " + f2(pc.P) + " m, " + a.precoTexto + ")", ops: [{ op: "instancia", id: e.id, tipoId: a.tipoId }], pecas: [e.id] });
    }
    return out;
  }

  /* o ÚLTIMO RECURSO: retirar a peça — só a do Mobiliar automático (id moba-…, mesmo a arrastada para outro ambiente: o e.auto só
     vale para o ambiente de origem); o filtro do fim do auditar só o confere quando nenhuma posição nem troca resolveu */
  function ultimoRecurso(e) {
    if (!e || String(e.id).indexOf(MA().PREF) !== 0) return [];
    return [{ id: "retirar", ultimoRecurso: true, texto: "Retirar " + e.nome + " deste ambiente — não há posição livre que caiba", ops: [{ op: "apagar", id: e.id }], pecas: [e.id] }];
  }

  /* ---------------------------------------------------------------- AUDITAR */
  function auditar(o) {
    o = o || {};
    var A = MA(), R = MR(), est = o.estado, aval = o.avaliarFam, L = A.leitura(est, aval), probs = [], hist = A.analisarOps(o.ops);
    var sel = o.ambientes ? o.ambientes.map(String) : null, brutos = {};
    arr(est && est.ambientes).forEach(function (a) { if (a) brutos[String(a.id)] = a; });
    var porFam = {}; arr(est && est.familias).forEach(function (f) { if (f) porFam[String(f.id)] = f; });
    function p(cod, grav, crit, titulo, texto, pecas, sols, amb, chave) {
      var c = crit ? R.criterio(crit) || { regra: crit, nivel: R.cite(crit).nivel, fonte: R.cite(crit).fonte } : null;
      probs.push({ tipo: cod, codigo: cod, gravidade: grav, ambiente: amb.id, ambienteNome: amb.nome, regra: c ? c.regra : null, nivel: c ? c.nivel : "P", nivelRotulo: c ? (R.NIVEIS[c.nivel] || "") + (c.fonte ? " — " + c.fonte : "") : "",
        titulo: titulo, texto: texto, pecas: arr(pecas).map(String), solucoes: arr(sols).filter(function (s) { return !!s; }), chave: chave || (cod + "|" + arr(pecas).join(",")) });
    }
    L.ambientes.filter(function (a) { return !sel || sel.indexOf(String(a.id)) >= 0; }).forEach(function (a) {
      var pr = (brutos[a.id] && brutos[a.id].params) || {}, cls = R.classificar(a.nome, { area: a.area, usuario: txt(pr.Uso_mobiliario) || null });
      var tipo = cls.id || "generico", ctx = A.novoCtx({ opc: { estilo: "contemporaneo", padrao: "medio", acessivel: !!o.acessivel || /\b(pne|pcd|acessivel)\b/.test(R.normalizar(a.nome)), opcionais: true }, avaliarFam: aval, estado: est }, L, a, tipo, hist);
      var ex = ctx.existentes.filter(function (e) { return e.fp; });
      if (!ex.length) return;
      /* encostada = o fundo da peça (z = 0) na face de uma parede */
      ex.forEach(function (e) { e.encostada = !e.cen && ctx.geo.edges.some(function (ed) { return Math.abs(dot(A.eixoV(e.r), ed.n)) > 0.99 && Math.abs(dot(sub(e.B, ed.a), ed.n)) < 0.06; }); });
      grupoFila(ex);
      ex.forEach(function (e) { if (!e.dono) e.dono = donoDe(e, ex) || null; });
      ex.forEach(function (e) { ctx.obst.push({ id: e.id, fp: e.fp, y0: e.y0, y1: e.y1, leve: e.leve, grupo: e.dono || e.id, nome: e.nome }); e.dono = e.dono || e.id; });
      ctx.temPorta = ctx.z.portas.length + ctx.z.abertos.length > 0;
      ex.forEach(function (e) {
        var us = faixas(e, ctx).filter(function (fx) { return !(fx.encostavel && encostadoLado(ctx, e, fx)); }).map(function (fx) { return { obb: faixaObb(e, fx), prof: CV(fx.crit), crit: fx.crit, rotulo: fx.rotulo }; });
        us.forEach(function (u) { ctx.usos.push({ obb: u.obb, grupo: e.dono, dono: e.nome, id: e.id, prof: u.prof, crit: u.crit, rotulo: u.rotulo }); });
        var ua = alvoUsos(ctx, e); if (ua.length && !e.leve) ctx.alvos.push({ id: e.id, nome: e.nome, usos: ua });
      });
      var nomeA = "\"" + a.nome + "\"";
      /* candidatas (cada uma é conferida no fim: aplicada numa cópia do modelo, o problema tem de sumir) */
      function sols(e) { return o.semSolucoes ? [] : reposicionar(ctx, e).concat(trocarMenor(ctx, e)).concat(ultimoRecurso(e)); }
      /* peça a peça */
      ex.forEach(function (e) {
        var y1 = e.y1, i;
        if (!A.obbDentro(e.fp, ctx.geo.pts, 0.02)) { p("MOB_FORA", "erro", null, e.nome + " sai do ambiente", nomeA + ": " + e.nome + " atravessa a parede ou passa do contorno do ambiente" + (e.famId === "ra-plan-armario" ? " (a largura total é maior que o trecho de parede)" : "") + ".", [e.id], sols(e), a); return; }
        for (i = 0; i < ctx.z.portas.length; i++) if (e.y0 < 2.15 && A.sobrepoe(e.fp, ctx.z.portas[i].obb)) { p("MOB_PORTA", "erro", "faixaPorta", e.nome + " bloqueia a porta", nomeA + ": " + e.nome + " está no arco da porta " + ctx.z.portas[i].id + " ou na faixa livre de " + f2(CV("faixaPorta")) + " m na frente dela.", [e.id, ctx.z.portas[i].id], sols(e), a); return; }
        for (i = 0; i < ctx.z.janelas.length; i++) { var j = ctx.z.janelas[i]; if (y1 > j.peitoril - 0.02 && e.y0 < j.topo && A.sobrepoe(e.fp, j.obb)) { p("MOB_JANELA", "aviso", "janelaFaixa", e.nome + " na frente da janela", nomeA + ": " + e.nome + " tem " + f2(y1) + " m de altura e fica na frente da janela " + j.id + " (peitoril " + f2(j.peitoril) + " m).", [e.id, j.id], o.semSolucoes ? [] : reposicionar(ctx, e), a); break; } }
      });
      /* sobreposição (um achado por par) */
      for (var i1 = 0; i1 < ex.length; i1++) for (var i2 = i1 + 1; i2 < ex.length; i2++) {
        var x = ex[i1], y = ex[i2];
        if (x.leve || y.leve || !(x.y0 < y.y1 - 0.01 && y.y0 < x.y1 - 0.01) || !A.sobrepoe(x.fp, y.fp, 0.01)) continue;
        if ((x.cat === "tv" && y.cat === "rack-painel-tv") || (y.cat === "tv" && x.cat === "rack-painel-tv")) continue;   /* a TV na frente do painel do rack */
        /* ⚠ REVISÃO (21/10/2026): mesa REDONDA — vale o tampo (círculo), não a caixa quadrada: a cadeira a 45° em volta dela acusava
           sobreposição falsa no layout bom feito à mão */
        var rx = /^mesa-/.test(x.cat || "") && A.mesaRedonda(x.L, x.P, x.pecaNome || x.nome), ry = /^mesa-/.test(y.cat || "") && A.mesaRedonda(y.L, y.P, y.pecaNome || y.nome);
        if ((rx && !A.obbNoCirculo(y.fp, x.fp.c, Math.min(x.fp.hu, x.fp.hv))) || (ry && !A.obbNoCirculo(x.fp, y.fp.c, Math.min(y.fp.hu, y.fp.hv)))) continue;
        /* a cadeira de trabalho entra sob o tampo da mesa dela */
        if ((/^cadeira-escritorio/.test(x.cat || "") && x.dono === y.id) || (/^cadeira-escritorio/.test(y.cat || "") && y.dono === x.id)) continue;
        /* quem sai do lugar: a peça que o usuário mexeu; senão a que ele pôs à mão; senão a menor */
        var mx = !!hist.mexidas[x.id], my = !!hist.mexidas[y.id];
        var mov = mx !== my ? (mx ? x : y) : (x.auto !== y.auto ? (x.auto ? y : x) : (x.fp.hu * x.fp.hv <= y.fp.hu * y.fp.hv ? x : y));
        p("MOB_SOBREPOSTO", "erro", null, x.nome + " e " + y.nome + " se sobrepõem", nomeA + ": " + x.nome + " e " + y.nome + " ocupam o mesmo lugar.", [x.id, y.id], sols(mov), a);
      }
      /* faixas de uso */
      ex.forEach(function (e) {
        var fxs = faixas(e, ctx), alt = fxs.filter(function (fx) { return fx.ou; });
        /* faixas alternativas (a maca atendida por qualquer lado): basta uma livre; senão vale a de maior sobra */
        if (alt.length > 1) { var ms = alt.map(function (fx) { return { fx: fx, m: medir(ctx, e, fx) }; }); if (ms.some(function (x) { return x.m.ok; })) fxs = fxs.filter(function (fx) { return !fx.ou; }); else { ms.sort(function (a2, b2) { return b2.m.sobra - a2.m.sobra; }); fxs = fxs.filter(function (fx) { return !fx.ou; }).concat([ms[0].fx]); } }
        fxs.forEach(function (fx) {
          if (fx.encostavel && encostadoLado(ctx, e, fx)) return;
          var m = medir(ctx, e, fx);
          if (m.ok) {
            if (e.cat && /^cama-(casal|queen|king)/.test(e.cat) && fx.crit === "circDorm") {
              var fx2 = { x0: fx.x0, x1: fx.x1, z0: fx.z0, z1: fx.z1, crit: "vaoLateralCasal", rotulo: fx.rotulo, lado: fx.lado }, m2 = medir(ctx, e, fx2);
              if (!m2.ok) p("MOB_LATERAL_CASAL", "aviso", "vaoLateralCasal", e.nome + ": " + fx.rotulo + " de " + f2(m2.sobra) + " m", nomeA + ": " + fx.rotulo + " com " + f2(m2.sobra) + " m — o preferível é " + f2(CV("vaoLateralCasal")) + "–0,90 m (o mínimo de " + f2(CV("circDorm")) + " m está atendido).", [e.id], [], a);
            }
            return;
          }
          var bate = m.bate && m.bate.id ? [m.bate.id] : [], bl = bate.length ? ex.filter(function (q) { return q.id === bate[0]; })[0] : null;
          /* quem bloqueia foi mexido à mão (ou posto à mão): é ele que sai do lugar */
          var quem = bl && (hist.mexidas[bl.id] || !bl.auto) ? bl : e;
          p("MOB_CIRCULACAO", "erro", fx.crit, e.nome + ": " + fx.rotulo + " de " + f2(m.sobra) + " m", nomeA + ": " + fx.rotulo + " — sobra " + f2(m.sobra) + " m, a regra pede " + f2(m.req) + " m" + (m.bate && m.bate.porque ? " (" + (m.bate.porque === "parede" ? "bate na parede" : "bate em " + m.bate.porque) + ")" : "") + ".", [e.id].concat(bate), quem === e ? sols(e) : sols(bl).concat(sols(e)), a, "MOB_CIRCULACAO|" + e.id + "|" + fx.rotulo + "|" + (fx.lado || 0));
        });
      });
      /* passagem da porta até cada peça (grade de 5 cm) e o giro */
      if (ctx.temPorta && ctx.alvos.length) {
        var G = A.grade(ctx, []), vis = A.alcance(ctx, G, ctx.passagem);
        if (vis) ctx.alvos.forEach(function (al) {
          if (al.usos.some(function (u) { return A.chega(G, vis, u.obb); })) return;
          var e = ex.filter(function (q) { return q.id === al.id; })[0];
          p("MOB_SEM_ACESSO", "erro", ctx.passagemCrit, "sem passagem até " + al.nome, nomeA + ": não há passagem de " + f2(ctx.passagem) + " m da porta até " + al.nome + ".", [al.id], e ? sols(e) : [], a);
        });
      } else if (!ctx.temPorta) p("MOB_SEM_PORTA", "aviso", null, "ambiente sem porta modelada", nomeA + ": sem porta nem lado aberto no modelo — a passagem até as peças não foi conferida. Lance as portas (Portas e janelas automáticas).", [], [], a);
      if (ctx.o.acessivel) {
        var G2 = A.grade(ctx, []), lim = CV(ctx.giroCrit) / 2 / G2.h, tem = false;
        for (var k = 0; k < G2.dist.length && !tem; k++) if (G2.dist[k] >= lim) tem = true;
        if (!tem) p("MOB_GIRO", "erro", ctx.giroCrit, "sem área de giro", nomeA + ": projeto acessível — não sobra um círculo livre de Ø " + f2(CV(ctx.giroCrit)) + " m entre as peças.", ex.map(function (e) { return e.id; }), [], a);
      }
      /* TV × sofá */
      var tv = ex.filter(function (e) { return e.cat === "tv"; })[0], sofa = ex.filter(function (e) { return /^sofa-(2|3|retratil|canto)/.test(e.cat || ""); })[0];
      if (tv && sofa) {
        var peca = FC() && FC().peca ? FC().peca(tv.tipoId) : null, dg = peca ? A.diagTv(peca) : null;
        if (dg) {
          var frenteS = A.noMundo(sofa.B, sofa.r, 0, sofa.P), d = Math.abs(dot(sub(frenteS, tv.B), A.eixoV(tv.r)));
          if (d < dg * CV("tvMin") - 0.02 || d > dg * CV("tvMax") + 0.02) p("MOB_TV_DISTANCIA", "aviso", "tvMin", "sofá a " + f2(d) + " m da TV", nomeA + ": o sofá está a " + f2(d) + " m da TV de " + Math.round(dg / 0.0254) + "\" — a faixa é " + f2(dg * CV("tvMin")) + "–" + f2(dg * CV("tvMax")) + " m (diagonal × " + f2(CV("tvMin")) + "–" + f2(CV("tvMax")) + ").", [tv.id, sofa.id],
            o.semSolucoes ? [] : [trocarTv(ctx, tv, d)], a);
        }
      }
      /* ⚠ REVISÃO (21/10/2026): peça vendida em KIT lançada uma por lugar — cada instância cobra o kit inteiro no orçamento
         (4 cadeiras do "kit 4" = 4 kits = 16 cadeiras). Uma instância só é o kit comprado uma vez: não acusa. */
      var porKit = {};
      ex.forEach(function (e) { var pk = FC() && FC().peca ? FC().peca(e.tipoId) : null, k = pk ? A.kitDe(pk.n) : 0; if (k > 1) (porKit[e.tipoId] = porKit[e.tipoId] || { k: k, nome: pk.n, l: [] }).l.push(e); });
      Object.keys(porKit).forEach(function (t) {
        var g = porKit[t]; if (g.l.length < 2) return;
        p("MOB_KIT", "aviso", null, g.l.length + " × " + g.nome, nomeA + ": " + g.l.length + " peças \"" + g.nome + "\" — o preço é do kit de " + g.k + ": o orçamento cobra " + g.l.length + " kits (" + (g.l.length * g.k) + " unidades) para " + g.l.length + " lugares.",
          g.l.map(function (e) { return e.id; }), o.semSolucoes ? [] : [trocarAvulsa(g)], a, "MOB_KIT|" + t);
      });
      /* ⚠ REVISÃO (21/10/2026): mesa que já traz as cadeiras no preço (conjunto) com cadeiras AVULSAS em volta — as cadeiras saem
         duas vezes no orçamento (a do conjunto e a avulsa). Corrigir = tirar as avulsas. */
      ex.forEach(function (m) {
        var nc = A.conjuntoMesa(m.pecaNome || m.nome); if (!(nc > 0) || !/^mesa-/.test(m.cat || "")) return;
        var cads = ex.filter(function (q) { return q !== m && q.dono === m.id && /^cadeira-|varanda/.test(q.cat || "") && !(A.conjuntoMesa(q.pecaNome || q.nome) > 0); });
        if (!cads.length) return;
        p("MOB_CONJUNTO", "aviso", null, (m.pecaNome || m.nome) + " + " + cads.length + " cadeira(s) avulsa(s)", nomeA + ": a mesa \"" + (m.pecaNome || m.nome) + "\" já traz " + nc + " cadeiras no preço e tem mais " + cads.length + " avulsa(s) em volta — o orçamento cobra as cadeiras duas vezes.",
          [m.id].concat(cads.map(function (q) { return q.id; })), [{ id: "apagar", texto: "Tirar as " + cads.length + " cadeira(s) avulsa(s) (as do conjunto ficam no preço da mesa)", ops: cads.map(function (q) { return { op: "apagar", id: q.id }; }), pecas: cads.map(function (q) { return q.id; }) }], a, "MOB_CONJUNTO|" + m.id);
      });
      /* ⚠ REVISÃO (21/10/2026): o colchão segue a cama — a cama que JÁ traz colchão com um avulso em cima (cama trocada depois do
         motor) cobra dois colchões; a cama sem colchão e sem avulso sai sem colchão no orçamento. */
      ex.forEach(function (cm) {
        if (!/^cama-/.test(cm.cat || "")) return;
        var nomeC = cm.pecaNome || cm.nome, traz = A.trazColchao(nomeC), cols = ex.filter(function (q) { return q.cat === "colchao" && q.dono === cm.id; });
        var sobra = cols.slice(traz ? 0 : 1);
        if (sobra.length) {
          p("MOB_COLCHAO", "aviso", null, nomeC + ": colchão a mais", nomeA + ": " + (traz ? "a cama \"" + nomeC + "\" já traz colchão e tem mais " + sobra.length + " avulso" : "a cama tem " + cols.length + " colchões") + " — o orçamento cobra colchão duas vezes.",
            [cm.id].concat(sobra.map(function (q) { return q.id; })), [{ id: "apagar", texto: "Tirar o colchão avulso" + (sobra.length > 1 ? " (" + sobra.length + ")" : ""), ops: sobra.map(function (q) { return { op: "apagar", id: q.id }; }), pecas: sobra.map(function (q) { return q.id; }) }], a, "MOB_COLCHAO|" + cm.id);
          return;
        }
        var larg = A.LARG_COLCHAO[cm.cat];
        if (traz || cols.length || !larg) return;
        var D = global.MobCatalogoDados || dep("MobCatalogoDados", "./mobcatalogodados.js"), lc = null;
        arr(D && D.pecas).forEach(function (q) { if (q.c === "colchao" && Math.abs(q.L - larg) < 0.03 && (!lc || q.pr < lc.pr)) lc = q; });
        var sol = null;
        if (lc && !o.semSolucoes) {
          var cxC = A.caixaDe(aval, "ra-cat-colchao", lc.id, {}), Pc = cxC ? cxC.P : lc.P, Bc = A.noMundo(cm.B, cm.r, 0, Math.max(0, (cm.P - Pc) / 2)), org = cxC && cxC.cen ? A.noMundo(Bc, cm.r, 0, Pc / 2) : Bc;
          var idN = A.PREF + a.id + "-colchao"; if (porFam[idN] || hist.apagadas[idN]) idN = A.PREF + a.id + "-colchao-" + String(cm.id).replace(/[^A-Za-z0-9_-]/g, "");
          sol = { id: "lancar", texto: "Lançar " + lc.n + " (" + f2(larg) + " m, o de menor preço)", ops: [{ op: "familia", id: idN, famId: "ra-cat-colchao", tipoId: lc.id, x: r4(org[0]), y: r4(a.base), z: r4(org[1]), rotY: r4(cm.r), inst: {} }], pecas: [cm.id] };
        }
        p("MOB_COLCHAO", "aviso", null, nomeC + ": sem colchão", nomeA + ": a cama \"" + nomeC + "\" não traz colchão e não há colchão avulso sobre ela — o orçamento sai sem colchão.", [cm.id], sol ? [sol] : [], a, "MOB_COLCHAO|" + cm.id);
      });
      /* triângulo da cozinha: só com a pia modelada (cuba/bancada) */
      var gel = ex.filter(function (e) { return e.cat === "geladeira"; })[0], fog = ex.filter(function (e) { return e.cat === "fogao-cooktop"; })[0];
      var pia = arr(L.moveis).filter(function (m) { return m.pav === a.pav && /cuba|bancada|pia/i.test(txt(m.famId) + " " + txt(m.nome)) && !/^ra-plan/.test(m.famId) && m.pts && A.dentro([(m.pts[0][0] + m.pts[2][0]) / 2, (m.pts[0][1] + m.pts[2][1]) / 2], a.pts); })[0];
      if (gel && fog && pia) {
        var pp = [(pia.pts[0][0] + pia.pts[2][0]) / 2, (pia.pts[0][1] + pia.pts[2][1]) / 2], ls = [comp(sub(gel.fp.c, fog.fp.c)), comp(sub(fog.fp.c, pp)), comp(sub(pp, gel.fp.c))], so = ls[0] + ls[1] + ls[2];
        if (!ls.every(function (v) { return v >= CV("cozTriMin") - 0.01 && v <= CV("cozTriMax") + 0.01; }) || so > CV("cozTriSoma") + 0.01) p("MOB_COZ_TRIANGULO", "aviso", "cozTriMin", "triângulo da cozinha fora da faixa", nomeA + ": geladeira–fogão–pia = " + ls.map(f2).join(" / ") + " m (soma " + f2(so) + ") — cada lado " + f2(CV("cozTriMin")) + "–" + f2(CV("cozTriMax")) + " m e soma ≤ " + f2(CV("cozTriSoma")) + " m.", [gel.id, fog.id, pia.id], [], a);
      }
      /* armário planejado com vão de eletro que não coube */
      ex.forEach(function (e) {
        if (e.famId !== "ra-plan-armario") return;
        var f = porFam[e.id] || {}, av = null; try { av = aval(e.famId, e.tipoId, f.inst || {}); } catch (eA) { av = null; }
        var avs = arr(av && av.avisos).filter(function (t) { return /vão de/.test(t); });
        if (!avs.length) return;
        var desl = {}; ["Nicho_geladeira", "Nicho_lava_loucas", "Nicho_forno_base", "Vao_coifa"].forEach(function (k) { if (f.inst && f.inst[k]) desl[k] = false; });
        var nomes = { geladeira: "Nicho_geladeira", "lava-louças": "Nicho_lava_loucas", "forno sob o cooktop": "Nicho_forno_base", coifa: "Vao_coifa" }, so2 = {};
        avs.forEach(function (t) { Object.keys(nomes).forEach(function (nm) { if (t.indexOf("vão de " + nm + " ") >= 0) so2[nomes[nm]] = false; }); });
        p("MOB_PLAN_VAO", "aviso", null, e.nome + ": vão de eletro não coube", nomeA + ": " + avs.join("; ") + ".", [e.id], [{ id: "desligar", texto: "Desligar o vão que não coube", ops: [{ op: "instancia", id: e.id, inst: so2 }], pecas: [e.id] }], a);
      });
    });
    /* ⚠ SÓ FICA A SOLUÇÃO TESTADA: aplicada numa cópia do modelo e auditada de novo, o problema some e o ambiente fica com menos
       erros. A primeira de cada tipo (reposicionar / trocar) que passa vira o botão; as outras são descartadas. */
    /* ⚠ PROBLEMA SEMPRE COM SOLUÇÃO (23/10/2026): o ERRO em que nenhuma posição nem troca passou ficava sem botão — o quarto com
       duas janelas deixava "guarda-roupa sobre a cama" sem Corrigir. O ÚLTIMO RECURSO (retirar a peça do Mobiliar automático) só é
       conferido depois que todas as outras falharam, com orçamento de conferência próprio (as outras não o esgotam), e também
       passa pelo `resolve`. Peça posta à mão nunca ganha "Retirar": o automático não apaga o que o usuário escolheu. */
    if (!o.semSolucoes) {
      var nVer = 0, nUlt = 0;
      probs.forEach(function (q) {
        var cands = q.solucoes, tipos = {}, ultimos = cands.filter(function (s) { return s.ultimoRecurso; }); q.solucoes = [];
        cands = cands.filter(function (s) { return !s.ultimoRecurso; });
        for (var i = 0; i < cands.length && nVer < 80; i++) {
          var sx = cands[i]; if (tipos[sx.id]) continue;
          nVer++;
          if (resolve(q, sx)) { q.solucoes.push(sx); tipos[sx.id] = 1; }
        }
        if (q.solucoes.length || q.gravidade !== "erro") return;
        for (var j = 0; j < ultimos.length && nUlt < 40; j++) { nUlt++; if (resolve(q, ultimos[j])) { q.solucoes.push(ultimos[j]); break; } }
      });
    }
    function resolve(q, sx) {
      var est2 = aplicarNoEstado(est, sx.ops), r2 = auditar({ estado: est2, avaliarFam: aval, ambientes: [q.ambiente], acessivel: o.acessivel, semSolucoes: true });
      if (r2.problemas.some(function (x) { return x.chave === q.chave; })) return false;
      var antes = probs.filter(function (x) { return x.ambiente === q.ambiente && x.gravidade === "erro"; }).length, depois = r2.problemas.filter(function (x) { return x.gravidade === "erro"; }).length;
      return depois < antes || (q.gravidade !== "erro" && depois <= antes);
    }
    var porCodigo = {}, porAmbiente = {};
    probs.forEach(function (q) { porCodigo[q.codigo] = (porCodigo[q.codigo] || 0) + 1; porAmbiente[q.ambiente] = (porAmbiente[q.ambiente] || 0) + 1; });
    return { problemas: probs, porCodigo: porCodigo, porAmbiente: porAmbiente, leitura: L, resumo: { erros: probs.filter(function (q) { return q.gravidade === "erro"; }).length, avisos: probs.filter(function (q) { return q.gravidade !== "erro"; }).length } };
  }
  /* as ops da solução numa CÓPIA do estado (mover / instancia das famílias) — para conferir antes de oferecer o botão */
  function aplicarNoEstado(est, ops) {
    var e2 = JSON.parse(JSON.stringify(est || {})), por = {};
    arr(e2.familias).forEach(function (f) { if (f) por[String(f.id)] = f; });
    arr(ops).forEach(function (x) {
      /* a peça NOVA da solução (o colchão que faltava): entra na cópia como no replay */
      if (x.op === "familia" && x.id != null && !por[String(x.id)]) { var nf = { id: x.id, famId: x.famId, tipoId: x.tipoId, x: x.x, y: x.y, z: x.z, rotY: x.rotY, inst: JSON.parse(JSON.stringify(x.inst || {})), host: null }; e2.familias = (e2.familias || []).concat([nf]); por[String(x.id)] = nf; return; }
      var f = por[String(x.id)]; if (!f) return;
      if (x.op === "mover") { if (x.cx != null) f.x = x.cx; if (x.cz != null) f.z = x.cz; }
      else if (x.op === "instancia") {
        if (x.famId != null && x.famId !== f.famId) { f.famId = x.famId; f.inst = {}; }
        if (x.tipoId != null) f.tipoId = x.tipoId;
        if (x.inst) { f.inst = f.inst || {}; Object.keys(x.inst).forEach(function (k) { f.inst[k] = x.inst[k]; }); }
        if (x.rotY != null) f.rotY = x.rotY;
        if (x.x != null) f.x = x.x; if (x.z != null) f.z = x.z;
      } else if (x.op === "apagar") { e2.familias = e2.familias.filter(function (g) { return g !== f; }); }
    });
    return e2;
  }
  /* a peça AVULSA da mesma categoria mais perto do preço por unidade do kit (e da largura) — troca todas as do kit */
  function trocarAvulsa(g) {
    var F = FC(), A = MA(), e0 = g.l[0]; if (!F || !F.alternativas) return null;
    var pk = F.peca ? F.peca(e0.tipoId) : null, pu = pk && pk.pr ? pk.pr / g.k : 0;
    var alts = F.alternativas(e0.famId, e0.tipoId, 200).filter(function (x) { return !(A.kitDe(x.nome) > 1) && x.preco > 0 && Math.abs(num(x.largura, 0) - e0.L) <= 0.12 && !x.provisorio; });
    alts.sort(function (x, y) { return Math.abs(x.preco - pu) - Math.abs(y.preco - pu); });
    if (!alts.length) return null;
    var a = alts[0];
    return { id: "trocar", texto: "Trocar as " + g.l.length + " por " + a.nome + " (avulsa, " + a.precoTexto + " cada)", ops: g.l.map(function (e) { return { op: "instancia", id: e.id, tipoId: a.tipoId }; }), pecas: g.l.map(function (e) { return e.id; }) };
  }
  /* a TV que acerta a distância (a mesma faixa) — testada: mesma posição na parede */
  function trocarTv(ctx, tv, d) {
    var F = FC(), A = MA(); if (!F) return null;
    var alts = F.alternativas(tv.famId, tv.tipoId, 40).map(function (a) { var pc = F.peca(a.tipoId); return { a: a, dg: pc ? A.diagTv(pc) : null }; }).filter(function (x) { return x.dg && d >= x.dg * CV("tvMin") - 1e-6 && d <= x.dg * CV("tvMax") + 1e-6; });
    alts.sort(function (x, y) { return Math.abs(x.dg * CV("tvIdeal") - d) - Math.abs(y.dg * CV("tvIdeal") - d); });
    if (!alts.length) return null;
    return { id: "trocar", texto: "Trocar por " + alts[0].a.nome + " (" + Math.round(alts[0].dg / 0.0254) + "\")", ops: [{ op: "instancia", id: tv.id, tipoId: alts[0].a.tipoId }], pecas: [tv.id] };
  }

  var MobAuditor = { auditar: auditar, faixas: faixas, medir: medir, reposicionar: reposicionar, trocarMenor: trocarMenor, aplicarNoEstado: aplicarNoEstado };
  global.MobAuditor = MobAuditor;
  if (typeof module !== "undefined" && module.exports) module.exports = MobAuditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * bimforrodrywall.js — FORRO DE DRYWALL sobre ESTRUTURA DE MADEIRA, SANCA com
 * luz indireta e LUMINÁRIAS EMBUTIDAS. Motor PURO (ES5, Node-testável).
 * Frente "cob" (19/10/2026). O forro em si (contorno, automático pelas paredes,
 * tipo com camadas) é o js/bimforro.js; aqui entra o que faz dele um forro de obra.
 *
 *   · TIPO "drywall-12_5-madeira" (em BimForro.TIPOS): chapa de gesso acartonado
 *     12,5 mm, estrutura de madeira, pintura.
 *   · SANCA — op {op:"sanca", id, forro, recuo?:m, profundidade?:m, luz?:bool}:
 *     rebaixo perimetral. A chapa central do forro fica DENTRO do contorno recuado
 *     (`recuo` a partir das paredes); na linha do recuo sobe a TESTEIRA (a parede da
 *     sanca) `profundidade` acima da face de baixo do forro e, no alto dela, a FAIXA
 *     SUPERIOR (a chapa do perímetro). A fita de LED, escondida atrás da testeira,
 *     ilumina a faixa de cima — luz INDIRETA. Padrões (recuo 0,20 m, profundidade
 *     0,12 m) são parâmetros de projeto ADOTADOS, não norma.
 *     Estado: `sancas` = [{id, forro, ok, recuo, profundidade, interno:[{x,z}], comprimento,
 *     areaFaixa, areaCentral, areaTesteira, areaDesenvolvida, fitaLedM, cota, cotaFaixa, avisos}];
 *     e o forro ganha `sancaInterno` (o desenho da chapa central) — a área do forro NÃO muda.
 *   · ESTRUTURA DE MADEIRA — opsEstruturaForro(): sarrafos (5×5) no espaçamento pedido e
 *     barrotes (5×10) por cima, com a faixa da sanca. Seções do catálogo do fornecedor
 *     (Nibra). O ESPAÇAMENTO da estrutura é o do manual do fabricante da chapa: o manual NÃO
 *     foi encontrado em fonte pública (Knauf/Placo bloqueiam o acesso) — o padrão (0,40 m entre
 *     sarrafos) é ADOTADO e sai "não verificado".
 *   · LUMINÁRIAS — opsLuminarias(): grade de spots (ou plafon) EMBUTIDOS na chapa central,
 *     família ra-luminaria (tipos spote, pq18e, pc12e); espaçamento ADOTADO a conferir no projeto
 *     luminotécnico.
 *   · QUANTITATIVO — quantitativo(): m² de forro, m de sanca, sarrafos, pintura e unidades de
 *     luminária, com SINAPI só quando ACHADO na base (o resto: "orçar à parte").
 * Teste: o teste da cobertura completa, em tools/ (unidade) e a e2e da mesma frente.
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
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function temChave(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function virg(v, c) { return (Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }
  function idOk(v) { return (typeof v === "string" && v.length > 0 && v.length <= 120) || fin(v); }
  function BT() { return dep("BimTelhado", "./bimtelhado.js"); }
  function ES() { return dep("BimTelhadoEstrut", "./bimtelhadoestrut.js"); }
  function BA() { return dep("BimArq", "./bimarq.js"); }

  var TIPO_ID = "drywall-12_5-madeira";
  var CHAPA = { espMm: 12.5, largura: 1.20, comprimento: 2.40, fonte: "SINAPI 06/2026, insumo 39413: chapa de gesso acartonado standard (ST), 12,5 mm, 1200 × 2400 mm" };
  var PADRAO = { recuo: 0.20, profundidade: 0.12, espSarrafo: 0.40, espBarrote: 1.20, secaoSarrafo: "5x5", secaoBarrote: "5x10", margemParede: 0.05,
                 espLuminarias: 1.20, margemLuminarias: 0.40, tipoLuminaria: "spote" };
  var LIM = { recuo: [0.05, 1.5], profundidade: [0.03, 0.8] };

  /* ------------------------------------------------------------ SINAPI (conferida contra a base pelo teste) */
  var SINAPI = {
    base: "SINAPI 06/2026 (MG)",
    forroDrywall: { cod: "96110", un: "M2", aprox: true, desc: "FORRO EM DRYWALL PARA AMBIENTES RESIDENCIAIS, INCLUSIVE ESTRUTURA UNIDIRECIONAL DE FIXAÇÃO", obs: "a composição traz estrutura de aço (canaleta e pendural): com estrutura de madeira só a chapa, os parafusos e o tratamento das juntas valem — a estrutura de madeira vai à parte" },
    sancaGesso: { cod: "99054", un: "M2", aprox: true, desc: "ACABAMENTOS PARA FORRO (SANCA DE GESSO, MONTADA NA OBRA)", obs: "sanca de gesso montada na obra: a de drywall com luz indireta é parecida, não igual" },
    fundoSelador: { cod: "88484", un: "M2", desc: "FUNDO SELADOR ACRÍLICO, APLICAÇÃO MANUAL EM TETO, UMA DEMÃO" },
    pinturaTeto: { cod: "104640", un: "M2", desc: "PINTURA LÁTEX ACRÍLICA STANDARD, APLICAÇÃO MANUAL EM TETO, DUAS DEMÃOS" }
  };
  function sin(ref) { var s = SINAPI[ref]; return s ? { codigo: s.cod, un: s.un, descricao: s.desc, base: SINAPI.base, aproximado: !!s.aprox, obs: s.obs || null } : null; }
  /* a luminária: chave da tabela das instalações (js/biminstsinapi.js), só os tipos que a SINAPI orça */
  var LUM_CHAVE = { pq18e: "luminaria|plafon_quadrada|embutir|18", spote: "luminaria|spot_par20|embutir|-", p60e: "luminaria|painel_60x60|embutir|-", pq24s: "luminaria|plafon_quadrada|sobrepor|24", pc12s: "luminaria|plafon_circular|sobrepor|12/13" };
  function sinLuminaria(tipoId) {
    var T = dep("BimInstSinapi", "./biminstsinapi.js"), k = LUM_CHAVE[String(tipoId)], l = T && k && T.chaves ? T.chaves[k] : null;
    return l && l.length ? { codigo: l[0][0], un: l[0][1], descricao: l[0][2], base: "SINAPI 06/2026 (MG)", aproximado: false, obs: null } : null;
  }

  /* ------------------------------------------------------------ geometria plana */
  function ptA(p) { return [Number(p.x), Number(p.z)]; }
  function areaS(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function perim(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); } return s; }
  function obj(p) { return { x: r6(p[0]), z: r6(p[1]) }; }
  function dentro(p, P) {
    var c = false, n = P.length;
    for (var i = 0, j = n - 1; i < n; j = i++) { var a = P[i], b = P[j]; if (((a[1] > p[1]) !== (b[1] > p[1])) && (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])) c = !c; }
    return c;
  }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0;
    var x = a[0] + t * dx - p[0], z = a[1] + t * dz - p[1]; return Math.sqrt(x * x + z * z);
  }
  function distBorda(p, P) { var m = Infinity; for (var i = 0, n = P.length; i < n; i++) m = Math.min(m, distSeg(p, P[i], P[(i + 1) % n])); return m; }
  /* contorno do forro em sentido anti-horário (o deslocar do telhado espera assim) */
  function ccw(P) { return areaS(P) >= 0 ? P.slice() : P.slice().reverse(); }

  /* ============================================================ SANCA */
  function calcularSanca(f, forros) {
    var s = clone(f), avisos = [], fo = forros[String(f.forro)];
    s.tipo = "sanca"; s.ok = false;
    s.recuoEf = fin(Number(f.recuo)) ? Number(f.recuo) : PADRAO.recuo;
    s.profundidadeEf = fin(Number(f.profundidade)) ? Number(f.profundidade) : PADRAO.profundidade;
    s.luzEf = f.luz !== false;
    if (!fo) { avisos.push("O forro desta sanca não existe mais."); s.avisos = avisos; return s; }
    if (!fo.ok || arr(fo.contorno).length < 3) { avisos.push("O forro não fechou (ver os avisos dele): sem sanca."); s.avisos = avisos; return s; }
    var T = BT(); if (!T || !T.deslocar) { avisos.push("O motor de deslocamento (js/bimtelhado.js) não carregou."); s.avisos = avisos; return s; }
    var P = ccw(arr(fo.contorno).map(ptA));
    if (arr(fo.contorno).some(function (p) { return p && p.m; })) avisos.push("O contorno do forro tem arco: a sanca segue só os pontos dele.");
    var I = T.deslocar(P, P.map(function () { return -s.recuoEf; }));
    if (!I || I.length < 3 || !(areaS(I) > 0.05)) { avisos.push("Recuo de " + virg(s.recuoEf) + " m grande demais para este forro: diminua o recuo."); s.avisos = avisos; return s; }
    s.interno = I.map(obj); s.contorno = P.map(obj);
    s.comprimento = r4(perim(I));
    s.areaTotal = r4(areaS(P)); s.areaCentral = r4(areaS(I)); s.areaFaixa = r4(areaS(P) - areaS(I));
    s.areaTesteira = r4(s.comprimento * s.profundidadeEf);
    s.areaDesenvolvida = r4(s.areaFaixa + s.areaTesteira);   /* a faixa de cima + a testeira: o que é "sanca" */
    s.fitaLedM = s.luzEf ? s.comprimento : 0;
    s.cota = r6(num(fo.cota, 0)); s.cotaFaixa = r6(s.cota + s.profundidadeEf);
    s.espessura = r6(num(fo.espessura, 0.0125));
    s.ok = true;
    if (avisos.length) s.avisos = avisos;
    return s;
  }

  /* ============================================================ A OP NO REPLAY */
  function validaSanca(o) {
    if (!idOk(o.id)) return false;
    if (o.forro !== undefined && !idOk(o.forro)) return false;
    if (o.recuo !== undefined && o.recuo !== null && !(fin(o.recuo) && o.recuo >= LIM.recuo[0] && o.recuo <= LIM.recuo[1])) return false;
    if (o.profundidade !== undefined && o.profundidade !== null && !(fin(o.profundidade) && o.profundidade >= LIM.profundidade[0] && o.profundidade <= LIM.profundidade[1])) return false;
    if (o.luz !== undefined && o.luz !== null && typeof o.luz !== "boolean") return false;
    return o.forro !== undefined || o.recuo !== undefined || o.profundidade !== undefined || o.luz !== undefined;
  }
  function valida(o) { return o && o.op === "sanca" ? validaSanca(o) : undefined; }
  function aplicarOp(o, ctx) {
    if (!o || !ctx) return false;
    var C = ctx.sanca || (ctx.sanca = { m: {}, ord: [] });
    if (o.op === "sanca") {
      if (valida(o) !== true) return false;
      var novo = !C.m[o.id];
      if (novo) { if (o.forro === undefined) return false; C.m[o.id] = { id: o.id }; C.ord.push(o.id); }
      ["forro", "recuo", "profundidade", "luz"].forEach(function (k) { if (!temChave(o, k)) return; if (o[k] === null) delete C.m[o.id][k]; else C.m[o.id][k] = o[k]; });
      return true;
    }
    if (o.op === "apagar" && C.m[o.id]) { delete C.m[o.id]; C.ord.splice(C.ord.indexOf(o.id), 1); return true; }
    return false;
  }
  function fim(ctx, saida) {
    var C = ctx && ctx.sanca; if (!C || !C.ord.length || !saida) return;
    var fo = {}; arr(saida.forros).forEach(function (f) { fo[String(f.id)] = f; });
    saida.sancas = C.ord.map(function (id) { return calcularSanca(C.m[id], fo); });
    saida.sancas.forEach(function (s) { if (s.ok && fo[String(s.forro)]) fo[String(s.forro)].sancaInterno = s.interno.map(function (p) { return { x: p.x, z: p.z }; }); });
  }
  function registrar(BE) {
    if (!BE || typeof BE.estender !== "function") return false;
    return BE.estender({ nome: "forro-drywall-sanca", aplicar: aplicarOp, valida: valida, fim: fim });
  }

  /* ============================================================ ESTRUTURA DE MADEIRA */
  function achaForro(estado, id) { var r = null; arr(estado && estado.forros).forEach(function (f) { if (String(f.id) === String(id)) r = f; }); return r; }
  function achaSanca(estado, forroId) { var r = null; arr(estado && estado.sancas).forEach(function (s) { if (s.ok && String(s.forro) === String(forroId)) r = s; }); return r; }
  function secao(id) { var E = ES(); return E && E.secaoMadeira ? E.secaoMadeira(id) : null; }

  /* sarrafos e barrotes. opc = { espacamento (m entre sarrafos), espBarrote, secaoSarrafo, secaoBarrote, dir:"x"|"z" } */
  function opsEstruturaForro(estado, forroId, opc) {
    opc = opc || {}; var f = achaForro(estado, forroId), A = BA(), E = ES(), avisos = [], premissas = [];
    if (!f) return { ok: false, motivo: "Forro não encontrado: " + forroId };
    if (!f.ok) return { ok: false, motivo: "O forro não fechou: sem estrutura." };
    if (!A || !E) return { ok: false, motivo: "Motores da estrutura (js/bimarq.js, js/bimtelhadoestrut.js) não carregaram." };
    var esp = fin(Number(opc.espacamento)) ? Number(opc.espacamento) : PADRAO.espSarrafo;
    var espB = fin(Number(opc.espBarrote)) ? Number(opc.espBarrote) : PADRAO.espBarrote;
    var sS = secao(opc.secaoSarrafo || PADRAO.secaoSarrafo), sB = secao(opc.secaoBarrote || PADRAO.secaoBarrote);
    if (!sS || !sB) return { ok: false, motivo: "Seção fora do catálogo (" + E.FONTE_MADEIRA + ")." };
    premissas.push("espaçamento entre sarrafos " + virg(esp) + " m — " + (fin(Number(opc.espacamento)) ? "informado" : "ADOTADO, NÃO VERIFICADO: o manual do fabricante da chapa não foi achado em fonte pública (Knauf/Placo bloqueiam o acesso); conferir antes de comprar"));
    premissas.push("barrotes a cada " + virg(espB) + " m (ADOTADO) e seções do catálogo " + E.FONTE_MADEIRA + ": sarrafo " + sS.b * 100 + "×" + sS.h * 100 + " cm, barrote " + sB.b * 100 + "×" + sB.h * 100 + " cm");
    var sa = achaSanca(estado, forroId), Pext = ccw(arr(f.contorno).map(ptA)), Pc = sa ? sa.interno.map(ptA) : Pext;
    var y0 = num(f.cota, 0) + num(f.espessura, 0.0125);   /* acima da chapa */
    var seq = 0, pecas = [], idP = "tef-" + f.id + "-";
    /* os sarrafos correm ao longo do lado CURTO do forro (peças mais curtas); opc.dir "x" ou "z" força */
    var bx = Pc.map(function (p) { return p[0]; }), bz = Pc.map(function (p) { return p[1]; }), larg = Math.max.apply(null, bx) - Math.min.apply(null, bx), prof = Math.max.apply(null, bz) - Math.min.apply(null, bz);
    var alongX = opc.dir === "x" ? true : (opc.dir === "z" ? false : larg <= prof);
    var d = alongX ? [0, 1] : [1, 0], td = [-d[1], d[0]];   /* sarrafos ao longo de td; as linhas ficam em d·p = const */
    function nova(a, b, sec, topo, papel) {
      var c = A.vigaPerfil([a[0], a[1]], [b[0], b[1]], { perfil: { forma: "ret", b: sec.b, h: sec.h }, material: "madeira", topo: topo });
      if (!c) return null;
      c.id = idP + (++seq); c.nome = papel === "forro-sarrafo" ? "Sarrafo do forro" : (papel === "forro-barrote" ? "Barrote do forro" : "Sarrafo da faixa da sanca");
      c.cob = { forro: String(f.id), papel: papel, material: "madeira" };
      pecas.push(c); return c;
    }
    function linhas(P, espac, sec, topo, papel, dd, tdd) {
      var umin = Infinity, umax = -Infinity;
      P.forEach(function (q) { var u = dd[0] * q[0] + dd[1] * q[1]; if (u < umin) umin = u; if (u > umax) umax = u; });
      var ini = umin + PADRAO.margemParede, fimU = umax - PADRAO.margemParede, n = fimU > ini ? Math.max(1, Math.ceil((fimU - ini) / espac - 1e-9)) : 0, i, cnt = 0, longas = 0;
      for (i = 0; i <= n; i++) {
        var u = n === 0 ? (umin + umax) / 2 : ini + (fimU - ini) * i / n;
        E.cordasU(P, u, dd, tdd).forEach(function (ch) {
          var a = [u * dd[0] + (ch[0] + PADRAO.margemParede) * tdd[0], u * dd[1] + (ch[0] + PADRAO.margemParede) * tdd[1]], b = [u * dd[0] + (ch[1] - PADRAO.margemParede) * tdd[0], u * dd[1] + (ch[1] - PADRAO.margemParede) * tdd[1]];
          if (Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])) < 0.2) return;
          if (Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])) > 6) longas++;
          if (nova(a, b, sec, topo, papel)) cnt++;
        });
      }
      if (longas) avisos.push(longas + " peça(s) de " + papel.replace("forro-", "") + " passam de 6 m (maior comprimento do catálogo): emendar.");
      return cnt;
    }
    var nS = linhas(Pc, esp, sS, y0 + sS.h, "forro-sarrafo", d, td);
    var nB = linhas(Pc, espB, sB, y0 + sS.h + sB.h, "forro-barrote", td, [-td[1], td[0]]);
    var nF = 0;
    if (sa) {
      /* a faixa superior da sanca: um sarrafo em cada lado do contorno, no nível da faixa */
      var yF = sa.cotaFaixa + num(f.espessura, 0.0125);
      for (var i = 0; i < Pext.length; i++) {
        var a = Pext[i], b = Pext[(i + 1) % Pext.length], L = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
        if (L < 0.3) continue;
        var ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, ent = -uz, enz = ux;   /* normal para dentro (anti-horário) */
        var m = PADRAO.margemParede + sS.b / 2;
        if (nova([a[0] + ent * m, a[1] + enz * m], [b[0] + ent * m, b[1] + enz * m], sS, yF + sS.h, "forro-faixa")) nF++;
      }
    }
    if (!pecas.length) return { ok: false, motivo: "Nenhuma peça gerada para o forro." };
    var apagar = arr(estado.caixas).filter(function (c) { return c && c.cob && String(c.cob.forro) === String(f.id); }).map(function (c) { return { op: "apagar", id: c.id }; });
    var lote = { op: "lote", id: "tef-" + f.id, origem: "estrutura-forro", ops: apagar.concat(pecas.map(function (c) { return { op: "criar", id: c.id, caixa: A.paraOp(c) }; })) };
    var res = { ok: true, forro: f.id, lote: lote, ops: [lote], pecas: pecas, premissas: premissas, avisos: avisos, resumo: { sarrafos: nS, barrotes: nB, faixa: nF, espacamento: esp } };
    res.resumo.total = E.resumoDePecas(pecas, "madeira");
    return res;
  }

  /* ============================================================ LUMINÁRIAS EMBUTIDAS */
  /* grade de luminárias DENTRO da chapa central (e fora da sanca). opc = { tipoId, espacamento, margem, circuito } */
  function opsLuminarias(estado, forroId, opc) {
    opc = opc || {}; var f = achaForro(estado, forroId), avisos = [], premissas = [];
    if (!f) return { ok: false, motivo: "Forro não encontrado: " + forroId };
    if (!f.ok) return { ok: false, motivo: "O forro não fechou: sem luminárias." };
    var tipoId = opc.tipoId || PADRAO.tipoLuminaria, esp = fin(Number(opc.espacamento)) ? Number(opc.espacamento) : PADRAO.espLuminarias, mg = fin(Number(opc.margem)) ? Number(opc.margem) : PADRAO.margemLuminarias;
    var sa = achaSanca(estado, forroId), P = sa ? sa.interno.map(ptA) : ccw(arr(f.contorno).map(ptA)), Fu = arr(f.furos).map(function (q) { return arr(q.pts).map(ptA); });
    premissas.push("espaçamento da grade " + virg(esp) + " m, a " + virg(mg) + " m das bordas — " + (fin(Number(opc.espacamento)) ? "informado" : "ADOTADO (a conferir no projeto luminotécnico; as frentes de elétrica definem os pontos)"));
    var xs = P.map(function (p) { return p[0]; }), zs = P.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs) + mg, x1 = Math.max.apply(null, xs) - mg, z0 = Math.min.apply(null, zs) + mg, z1 = Math.max.apply(null, zs) - mg;
    if (!(x1 >= x0) || !(z1 >= z0)) return { ok: false, motivo: "O forro é pequeno demais para a margem de " + virg(mg) + " m." };
    var nx = Math.max(1, Math.round((x1 - x0) / esp) + 1), nz = Math.max(1, Math.round((z1 - z0) / esp) + 1), ops = [], piso = num(f.cota, 0) - num(f.deslocNivel, 0), k = 0, i, j;
    for (i = 0; i < nx; i++) for (j = 0; j < nz; j++) {
      var x = nx === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (nx - 1), z = nz === 1 ? (z0 + z1) / 2 : z0 + (z1 - z0) * j / (nz - 1), p = [x, z];
      if (!dentro(p, P) || distBorda(p, P) < mg - 1e-3) continue;
      if (Fu.some(function (h) { return dentro(p, h); })) continue;
      var inst = { Altura_montagem: r4(num(f.deslocNivel, 2.6)) };
      if (opc.circuito) inst.Circuito = String(opc.circuito);
      ops.push({ op: "familia", id: "lum-" + f.id + "-" + (++k), famId: "ra-luminaria", tipoId: tipoId, x: r4(x), y: r4(piso), z: r4(z), rotY: 0, inst: inst });
    }
    if (!ops.length) return { ok: false, motivo: "Nenhum ponto coube dentro do forro com a margem de " + virg(mg) + " m." };
    var pref = "lum-" + f.id + "-", apagarL = arr(estado.familias).filter(function (q) { return q && String(q.id).indexOf(pref) === 0; }).map(function (q) { return { op: "apagar", id: q.id }; });
    var lote = { op: "lote", id: "tlu-" + f.id, origem: "luminarias-forro", ops: apagarL.concat(ops) };
    return { ok: true, forro: f.id, lote: lote, ops: [lote], n: ops.length, tipoId: tipoId, premissas: premissas, avisos: avisos };
  }
  /* troca idempotente de um lote (o mesmo id) na lista de ops */
  function opsSubstituir(ops, res) {
    if (!res || !res.ok) return arr(ops).slice();
    var lote = res.lote, out = [], pos = -1;
    arr(ops).forEach(function (o) { if (o && o.op === "lote" && o.id === lote.id) { if (pos < 0) pos = out.length; return; } out.push(o); });
    if (pos < 0) pos = out.length;
    out.splice(pos, 0, lote);
    return out;
  }

  /* ============================================================ QUANTITATIVO */
  function item(nome, un, qtd, s, obs, extra) {
    var o = { grupo: "Forro", item: nome, un: un, qtd: r4(qtd), sinapi: s || null, orcarAParte: !s, obs: obs || null };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function quantitativo(estado) {
    var itens = [], avisos = [];
    arr(estado && estado.forros).forEach(function (f) {
      if (!f || !f.ok || !f.tipoForro || String(f.tipoForro.id).indexOf("drywall") !== 0) return;
      var sa = achaSanca(estado, f.id), faixa = sa ? sa.areaFaixa : 0, tst = sa ? sa.areaTesteira : 0, ex = { forro: f.id };
      itens.push(item("Forro de drywall 12,5 mm (chapa, parafusos e tratamento das juntas) — sem a faixa da sanca", "m²", num(f.area, 0) - faixa, sin("forroDrywall"), SINAPI.forroDrywall.obs, ex));
      if (sa) {
        itens.push(item("Sanca de drywall com luz indireta (faixa superior + testeira: " + virg(sa.areaFaixa) + " + " + virg(sa.areaTesteira) + " m²; recuo " + virg(sa.recuoEf) + " m, profundidade " + virg(sa.profundidadeEf) + " m)", "m²", sa.areaDesenvolvida, sin("sancaGesso"), SINAPI.sancaGesso.obs, ex));
        itens.push(item("Sanca — extensão (comprimento da linha da testeira)", "m", sa.comprimento, null, "para a fita de LED e a conferência; a composição de sanca é por m²", ex));
        if (sa.fitaLedM > 0) itens.push(item("Fita de LED da sanca (luz indireta) e fonte", "m", sa.fitaLedM, null, "sem composição na base: orçar à parte", ex));
      }
      itens.push(item("Fundo selador acrílico no forro (uma demão)", "m²", num(f.area, 0) + tst, sin("fundoSelador"), null, ex));
      itens.push(item("Pintura látex acrílica no forro (duas demãos)", "m²", num(f.area, 0) + tst, sin("pinturaTeto"), null, ex));
      var ps = arr(estado.caixas).filter(function (c) { return c && c.cob && String(c.cob.forro) === String(f.id); });
      if (ps.length) {
        var m = 0, v = 0; ps.forEach(function (c) { m += num(c.comprimento, 0); v += num(c.volume, 0); });
        itens.push(item("Estrutura de madeira do forro (" + ps.length + " peças, " + virg(m) + " m)", "m³", v, null, "sarrafos e barrotes do catálogo do fornecedor (medidas brutas); espaçamento NÃO verificado no manual do fabricante da chapa", ex));
      } else avisos.push("Forro " + f.id + ": sem estrutura de madeira lançada — a estrutura do forro NÃO está no quantitativo.");
      var lum = {};
      arr(estado.familias).forEach(function (q) {
        if (!q || q.famId !== "ra-luminaria") return;
        var P = ccw(arr(f.contorno).map(ptA));
        if (!dentro([q.x, q.z], P)) return;
        var alt = num(q.y, 0) + num(q.inst && q.inst.Altura_montagem, 0);
        if (Math.abs(alt - num(f.cota, 0)) > 0.06) return;
        lum[q.tipoId] = (lum[q.tipoId] || 0) + 1;
      });
      Object.keys(lum).forEach(function (t) {
        var s = sinLuminaria(t);
        itens.push(item("Luminária embutida no forro (família ra-luminaria, tipo " + t + ")", "un", lum[t], s, s ? null : "tipo sem composição SINAPI na tabela das instalações: orçar à parte", ex));
      });
    });
    return { itens: itens, avisos: avisos };
  }

  var BimForroDrywall = {
    TIPO_ID: TIPO_ID, CHAPA: CHAPA, PADRAO: PADRAO, LIM: LIM, SINAPI: SINAPI, sin: sin, sinLuminaria: sinLuminaria,
    calcularSanca: calcularSanca, valida: valida, aplicarOp: aplicarOp, fim: fim, registrar: registrar,
    opsEstruturaForro: opsEstruturaForro, opsLuminarias: opsLuminarias, opsSubstituir: opsSubstituir, quantitativo: quantitativo,
    opSanca: function (id, d) {
      d = d || {}; var o = { op: "sanca", id: id, forro: d.forro != null ? String(d.forro) : d.forro };
      ["recuo", "profundidade", "luz"].forEach(function (k) { if (d[k] !== undefined && d[k] !== null) o[k] = d[k]; });
      return validaSanca(o) ? o : null;
    }
  };
  registrar(dep("BimEdit", "./bimedit.js"));
  global.BimForroDrywall = BimForroDrywall;
  if (typeof module !== "undefined" && module.exports) module.exports = BimForroDrywall;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

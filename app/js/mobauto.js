/* =====================================================================
 * mobauto.js — "MOBILIAR AMBIENTE" (um clique por ambiente) — motor PURO, ES5, Node-testável (21/10/2026).
 *
 * Pedido do Rogério (20/10/2026): o usuário seleciona um ambiente (ou vários, ou todos) e clica "Mobiliar ambiente";
 * pelo NOME/uso do ambiente o sistema escolhe o conjunto do docs/arquitetura/interiores/PADROES-AMBIENTES.md e posiciona
 * as peças do catálogo (js/familiascat.js, preço e fonte em cada tipo) respeitando as regras de
 * docs/arquitetura/interiores/dados/regras-layout.json (cópia em js/mobregrasdados.js; números em js/mobregras.js).
 *
 *   MobAuto.gerar({ estado, avaliarFam, ambientes: [ids] | null (todos), estilo, padrao, acessivel, opcionais, refazer, ops, tipos })
 *     → { ok, lote ({op:"lote"} — UM Ctrl+Z), ops, itens[], avisos[], pendencias[], reduzidos[], resumo }
 *   MobAuto.leitura(estado, avaliarFam)   → a leitura das esquadrias (js/esqauto.js) + os móveis por ambiente
 *   MobAuto.geometria(amb, leitura, pts?) → paredes, portas, janelas e trechos abertos de cada lado do contorno
 *   MobAuto.buscarParede(ctx, spec)       → a melhor posição de uma peça encostada (usada também pelo auditor no "Corrigir")
 *
 * ALGORITMO (PADROES §2, sempre nesta ordem): (1) zonas proibidas — cada porta (arco da folha + faixa livre
 *   acess-9050-corredor-4m) e cada janela (peça mais alta que o peitoril não fica na frente: ra-janela-faixa [P]);
 *   (2) parede de referência por tipo de ambiente; (3) peça ÂNCORA (cama, rack/sofá, mesa, fila da cozinha…), depois as
 *   DEPENDENTES (criado-mudo, mesa de centro, cadeiras…), depois o ARMAZENAMENTO nas paredes que sobram, depois a camada
 *   LEVE (tapete); (4) CIRCULAÇÃO: cada peça leva as faixas de uso da regra dela (dorm-circulacao-minima ao lado da cama,
 *   jantar-mesa-parede em volta da mesa, coz-nkba-corredor-1cozinheiro na frente da bancada…) e a passagem da porta até
 *   cada faixa é conferida numa grade de 5 cm (largura da regra do ambiente); não passou → (a) a próxima peça MENOR da
 *   mesma categoria, (b) a categoria seguinte (sofá 3 → 2 lugares, mesa 6 → 4), (c) cai a peça opcional, com o motivo.
 *   Peça OBRIGATÓRIA que não coube vira pendência — nunca some calada. (5) colisão: a pegada (caixa da família no catálogo)
 *   não bate em outra peça na mesma faixa de altura. (6) registro: cada peça leva ambiente, slot, categoria, a regra
 *   (id + fonte + nível) de cada decisão e o preço da família.
 *
 * ⚠ IDEMPOTENTE: a peça automática tem id "moba-<ambiente>-<slot>". Rodar de novo não lança o slot que já existe (nem
 *   o slot ocupado por peça da mesma categoria que o usuário pôs à mão); o que o usuário MOVEU, TROCOU ou APAGOU (achado
 *   no histórico de ops, fora dos lotes deste motor) nunca é sobrescrito nem relançado. "Refazer" apaga só o automático
 *   que ninguém mexeu e lança de novo — no mesmo lote (um Ctrl+Z volta tudo).
 * ⚠ ORÇAMENTO: cada peça entra pelo preço do TIPO da família (Preco_unitario + Fonte_preco, js/orcmodelo.js — referência
 *   de mercado); o armário planejado pela composição própria do tipo. O motor não põe op "orcar" (o preço já é da família:
 *   pôr outro serviço cobraria duas vezes). A cama que já traz colchão (nome da peça) não ganha colchão avulso.
 * ⚠ Não cita outro programa de modelagem. ES5, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function MR() { return dep("MobRegras", "./mobregras.js"); }
  function FC() { return dep("FamiliasCat", "./familiascat.js"); }
  function MD() { return dep("MobCatalogoDados", "./mobcatalogodados.js"); }
  function FPL() { return dep("FamiliasPlanejado", "./familiasplanejado.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function fmtR(v) { var s = (Math.round(v * 100) / 100).toFixed(2).split("."); return "R$ " + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1]; }
  var EPS = 1e-6, ORIGEM = "mobiliario-automatico", ORIGEM_AUD = "mobiliario-auditor", PREF = "moba-";
  function CV(k) { return MR().CRITERIOS[k].valor; }

  /* ---------------------------------------------------------------- geometria plana ([x, z]) */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
  function comp(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); }
  function dentro(p, P) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1] + 1e-15) + a[0]) c = !c;
    }
    return c;
  }
  function areaPol(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  /* giro como o three: Z local → (sen θ, cos θ); X local → (cos θ, −sen θ) */
  function eixoU(r) { return [Math.cos(r), -Math.sin(r)]; }
  function eixoV(r) { return [Math.sin(r), Math.cos(r)]; }
  function noMundo(B, r, lx, lz) { var u = eixoU(r), v = eixoV(r); return [B[0] + u[0] * lx + v[0] * lz, B[1] + u[1] * lx + v[1] * lz]; }
  /* caixa orientada no "quadro da peça": B = meio do FUNDO, frente em +Z local */
  function obb(B, r, x0, x1, z0, z1) { var c = noMundo(B, r, (x0 + x1) / 2, (z0 + z1) / 2); return { c: c, u: eixoU(r), v: eixoV(r), hu: Math.abs(x1 - x0) / 2, hv: Math.abs(z1 - z0) / 2 }; }
  function cantos(o) { return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (s) { return [o.c[0] + o.u[0] * o.hu * s[0] + o.v[0] * o.hv * s[1], o.c[1] + o.u[1] * o.hu * s[0] + o.v[1] * o.hv * s[1]]; }); }
  function sobrepoe(a, b, eps) {
    eps = eps == null ? 0.005 : eps;
    var ax = [a.u, a.v, b.u, b.v], d = sub(b.c, a.c);
    for (var i = 0; i < 4; i++) {
      var e = ax[i], ra = a.hu * Math.abs(dot(a.u, e)) + a.hv * Math.abs(dot(a.v, e)), rb = b.hu * Math.abs(dot(b.u, e)) + b.hv * Math.abs(dot(b.v, e));
      if (Math.abs(dot(d, e)) >= ra + rb - eps) return false;
    }
    return true;
  }
  function noObb(p, o, tol) { var d = sub(p, o.c); tol = tol || 0; return Math.abs(dot(d, o.u)) < o.hu - tol && Math.abs(dot(d, o.v)) < o.hv - tol; }
  function encolher(o, t) { return { c: o.c, u: o.u, v: o.v, hu: Math.max(0.001, o.hu - t), hv: Math.max(0.001, o.hv - t) }; }
  /* a caixa inteira dentro do contorno (cantos dentro, nenhum vértice nem trecho de lado do contorno dentro dela) */
  function obbDentro(o, P, tol) {
    var s = encolher(o, tol == null ? 0.01 : tol);
    if (!cantos(s).every(function (p) { return dentro(p, P); })) return false;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], L = comp(sub(b, a)), n = Math.max(1, Math.ceil(L / 0.1));
      for (var k = 0; k <= n; k++) if (noObb(add(a, sub(b, a), k / n), s)) return false;
    }
    return true;
  }
  function obbDePts(P) {   /* os 4 cantos da pegada (js/arqmodelo.js pegadaFamilia: [u0v0, u1v0, u1v1, u0v1]) → caixa orientada */
    var a = P[0], b = P[1], d = P[3], eu = sub(b, a), ev = sub(d, a), lu = comp(eu), lv = comp(ev);
    if (lu < 1e-6 || lv < 1e-6) return null;
    return { c: [(P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2], u: [eu[0] / lu, eu[1] / lu], v: [ev[0] / lv, ev[1] / lv], hu: lu / 2, hv: lv / 2 };
  }
  /* Sutherland–Hodgman: a parte do contorno com dot(p − p0, n) ≥ 0 */
  function cortarMeio(P, p0, n) {
    var out = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], da = dot(sub(a, p0), n), db = dot(sub(b, p0), n);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { var t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  /* o retângulo envolvente do contorno no eixo do lado mais comprido */
  function quadro(P) {
    var best = null;
    for (var i = 0; i < P.length; i++) { var e = sub(P[(i + 1) % P.length], P[i]), l = comp(e); if (!best || l > best.l) best = { l: l, d: [e[0] / l, e[1] / l] }; }
    var d = best ? best.d : [1, 0], n = [-d[1], d[0]], u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    P.forEach(function (p) { var u = dot(p, d), v = dot(p, n); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
    return { d: d, n: n, u0: u0, u1: u1, v0: v0, v1: v1, lu: u1 - u0, lv: v1 - v0, centro: [d[0] * (u0 + u1) / 2 + n[0] * (v0 + v1) / 2, d[1] * (u0 + u1) / 2 + n[1] * (v0 + v1) / 2] };
  }
  function raio(o, d, P) { return EA().raio(o, d, P); }

  /* ---------------------------------------------------------------- GEOMETRIA DO AMBIENTE */
  function unir(iv) {
    var s = iv.slice().sort(function (a, b) { return a[0] - b[0]; }), out = [];
    s.forEach(function (x) { var u = out[out.length - 1]; if (u && x[0] <= u[1] + 0.02) { u[1] = Math.max(u[1], x[1]); if (u[2].indexOf(x[2]) < 0) u[2].push(x[2]); } else out.push([x[0], x[1], [x[2]], x[3]]); });
    return out;
  }
  function tirar(iv, a, b) {
    var out = [];
    iv.forEach(function (s) { if (b <= s[0] || a >= s[1]) { out.push(s); return; } if (a > s[0]) out.push([s[0], a]); if (b < s[1]) out.push([b, s[1]]); });
    return out;
  }
  /* geometria(a, L, pts?) — cada lado do contorno: paredes (trechos com parede), portas e janelas nele (em s, ao longo do lado),
     o resto é ABERTO (separador de ambiente: integração). Sem `pts`, o contorno do ambiente; com, uma ZONA dele (estar/jantar). */
  function geometria(a, L, pts) {
    var P = pts || a.pts, E = [], porPar = L.porParede, A = EA();
    for (var i = 0; i < P.length; i++) {
      var p = P[i], q = P[(i + 1) % P.length], e = sub(q, p), l = comp(e); if (l < 0.05) continue;
      var d = [e[0] / l, e[1] / l], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], pp = [-d[1], d[0]];
      var n = dentro(add(mid, pp, 0.03), P) ? pp : [-pp[0], -pp[1]];
      var ed = { i: i, a: p, b: q, len: l, d: d, n: n, r: Math.atan2(n[0], n[1]), paredes: [], portas: [], janelas: [], abertos: [] }, brutos = [];
      arr(a.trechos).forEach(function (tr) {
        var w = porPar[tr.paredeId]; if (!w) return;
        var h = w.espessura / 2, PA = A.ptParede(w, tr.t0, tr.lado * h), PB = A.ptParede(w, tr.t1, tr.lado * h);
        if (Math.abs(dot(sub(PA, p), n)) > 0.06 || Math.abs(dot(sub(PB, p), n)) > 0.06) return;
        var sA = dot(sub(PA, p), d), sB = dot(sub(PB, p), d), s0 = Math.max(0, Math.min(sA, sB)), s1 = Math.min(l, Math.max(sA, sB));
        if (s1 - s0 > 0.02) brutos.push([s0, s1, tr.paredeId, tr.lado]);
      });
      ed.paredes = unir(brutos);
      var lados = {}; brutos.forEach(function (b) { lados[b[2]] = b[3]; });
      arr(L.vaos).forEach(function (v) {
        if (v.tipo !== "porta" && v.tipo !== "janela") return;
        var w = porPar[v.parede]; if (!w || lados[v.parede] == null) return;
        var C = A.ptParede(w, v.t, lados[v.parede] * w.espessura / 2);
        if (Math.abs(dot(sub(C, p), n)) > 0.06) return;
        var s = dot(sub(C, p), d); if (s < -v.largura / 2 || s > l + v.largura / 2) return;
        var s0 = s - v.largura / 2, s1 = s + v.largura / 2;
        if (v.tipo === "porta") {
          var N = A.eixoN(w.rotY), ladoAmb = dot(n, N) > 0 ? 1 : -1, abre = v.abreFora ? 1 : -1;
          ed.portas.push({ id: v.id, s0: s0, s1: s1, folha: num(v.folha, v.largura), dentro: !v.correr && abre === ladoAmb, correr: !!v.correr });
        } else ed.janelas.push({ id: v.id, s0: s0, s1: s1, peitoril: num(v.peitoril, 1), topo: num(v.peitoril, 1) + num(v.altura, 1) });
      });
      var ab = [[0, l]]; ed.paredes.forEach(function (s) { ab = tirar(ab, s[0], s[1]); });
      ed.abertos = ab.filter(function (s) { return s[1] - s[0] > 0.3; });
      E.push(ed);
    }
    return { pts: P, edges: E, area: areaPol(P), quadro: quadro(P) };
  }
  /* trechos de parede onde o FUNDO de uma peça pode encostar: parede, sem porta; a peça que passa do peitoril não encosta na janela */
  function livres(ed, y0, y1) {
    var iv = ed.paredes.map(function (s) { return [s[0], s[1]]; });
    ed.portas.forEach(function (pt) { iv = tirar(iv, pt.s0, pt.s1); });
    ed.janelas.forEach(function (j) { if (y1 > j.peitoril - 0.02 && y0 < j.topo) iv = tirar(iv, j.s0, j.s1); });
    return iv.filter(function (s) { return s[1] - s[0] > 0.1; });
  }
  /* as zonas proibidas do ambiente inteiro (portas, janelas) e as faixas abertas (de onde se chega) */
  function zonas(geo) {
    var portas = [], janelas = [], abertos = [], fx = CV("faixaPorta"), fj = CV("janelaFaixa");
    geo.edges.forEach(function (ed) {
      ed.portas.forEach(function (pt) {
        var sm = (pt.s0 + pt.s1) / 2, B = add(ed.a, ed.d, sm), prof = Math.max(pt.dentro ? pt.folha : 0, fx);
        portas.push({ id: pt.id, obb: obb(B, ed.r, -(pt.s1 - pt.s0) / 2, (pt.s1 - pt.s0) / 2, 0, prof), prof: prof, dentro: pt.dentro, folha: pt.folha });
      });
      ed.janelas.forEach(function (j) { var sm = (j.s0 + j.s1) / 2, B = add(ed.a, ed.d, sm); janelas.push({ id: j.id, obb: obb(B, ed.r, -(j.s1 - j.s0) / 2, (j.s1 - j.s0) / 2, 0, fj), peitoril: j.peitoril, topo: j.topo }); });
      ed.abertos.forEach(function (s) { var sm = (s[0] + s[1]) / 2, B = add(ed.a, ed.d, sm); abertos.push({ obb: obb(B, ed.r, -(s[1] - s[0]) / 2, (s[1] - s[0]) / 2, 0, 0.3) }); });
    });
    return { portas: portas, janelas: janelas, abertos: abertos };
  }

  /* ---------------------------------------------------------------- CATÁLOGO: escolher a peça pelo estilo e pelo padrão */
  var _porCat = null;
  function pecasDe(cat) {
    if (!_porCat) { _porCat = {}; arr(MD() && MD().pecas).forEach(function (p) { (_porCat[p.c] = _porCat[p.c] || []).push(p); }); }
    return _porCat[cat] || [];
  }
  function provisorio(p) { return p.pt === "provisorio-maior-da-categoria" || /^\s*provis/i.test(txt(p.pf)); }
  /* ⚠ REVISÃO (21/10/2026): peça vendida em KIT ("Cadeira … (kit 4)", "Banqueta … (conjunto 2)") — o preço do catálogo é o do kit.
     O motor lança UMA instância por lugar e o orçamento cobra o preço da família por instância: 8 lugares × kit de 4 = 32
     cadeiras cobradas. O motor não escolhe kit para lugar avulso; o auditor acusa kit repetido (MOB_KIT). Devolve N (0 = avulsa). */
  /* mesa que já traz as cadeiras no preço ("Conjunto 1 mesa e 4 cadeiras", "(mesa com 8 cadeiras)", "(1 mesa + 4 poltronas)"):
     quantas. Antes só valia com a palavra "conjunto" — a "Splendore (mesa com 8 cadeiras)" ganhava 8 cadeiras avulsas. */
  function conjuntoMesa(nome) { var m = /(\d+)\s*(?:cadeiras|poltronas|banquetas)\b/i.exec(txt(nome)); return m ? +m[1] : 0; }
  /* mesa REDONDA: quase quadrada na caixa E o nome diz (redonda, round, Ø, circular) — a quadrada de 1,35 × 1,35 não é */
  function mesaRedonda(L, P, nome) { return Math.abs(num(L, 0) - num(P, 0)) < 0.05 && /redond|round|ø|circular/i.test(txt(nome)); }
  /* a caixa orientada `o` invade o círculo (c, r)? — o ponto da caixa mais perto do centro fica dentro do raio */
  function obbNoCirculo(o, c, r, eps) {
    var d = sub(c, o.c), du = Math.max(-o.hu, Math.min(o.hu, dot(d, o.u))), dv = Math.max(-o.hv, Math.min(o.hv, dot(d, o.v)));
    var px = o.c[0] + o.u[0] * du + o.v[0] * dv, pz = o.c[1] + o.u[1] * du + o.v[1] * dv;
    return comp([c[0] - px, c[1] - pz]) < r - (eps == null ? 0.005 : eps);
  }
  function kitDe(nome) { var m = /\((?:kit|conjunto)\s*(?:c\/\s*|com\s*)?(\d+)[^)]*\)|\bkit\s*(?:c\/\s*|com\s*)?(\d+)\b/i.exec(txt(nome)); return m ? +(m[1] || m[2]) : 0; }
  var _cx = {};
  /* as medidas e a origem da peça: a CAIXA da família avaliada (a mesma pegada que a planta e o auditor usam) */
  function caixaDe(aval, famId, tipoId, inst) {
    var k = famId + "|" + tipoId + "|" + JSON.stringify(inst || {});
    if (_cx[k] !== undefined) return _cx[k];
    var av = null; try { av = typeof aval === "function" ? aval(famId, tipoId, inst || {}) : null; } catch (e) { av = null; }
    var c = av && av.caixa && isFinite(av.caixa.x0) ? av.caixa : null;
    _cx[k] = c ? { L: c.x1 - c.x0, P: c.z1 - c.z0, A: c.y1 - c.y0, y0: c.y0, cen: c.z0 < -0.01, x0: c.x0, z0: c.z0, valores: av.valores || {} } : null;
    return _cx[k];
  }
  function infoPeca(ctx, cat, p, via, motivoPadrao) {
    var famId = "ra-cat-" + cat, cx = caixaDe(ctx.aval, famId, p.id, {}), F = FC(), fam = F ? F.obter(famId) : null;
    var cen = cx ? cx.cen : (fam && F.encaixeTroca ? F.encaixeTroca(fam, fam).centroAntes : false);
    return { cat: cat, p: p, famId: famId, tipoId: p.id, nome: p.n, L: cx ? cx.L : p.L, P: cx ? cx.P : p.P, A: cx ? cx.A : p.A, cen: cen, preco: p.pr, fonte: p.pf, data: p.pd,
      provisorio: provisorio(p), fabricante: p.f || "", linha: p.li || "", alto: !!p.ap, estilos: arr(p.e), via: via, motivoPadrao: motivoPadrao || "" };
  }
  function porPadrao(lista, o) {
    var naoProv = lista.filter(function (p) { return !provisorio(p); }), base = naoProv.length ? naoProv : lista, mot = "";
    if (o.ordem === "larga") { var mx = 0; base.forEach(function (p) { mx = Math.max(mx, p.L); }); base = base.filter(function (p) { return p.L >= mx - 0.30; }); }
    if (o.alvoL != null) {
      var dmin = Infinity; base.forEach(function (p) { dmin = Math.min(dmin, Math.abs(p.L - o.alvoL)); });
      base = base.filter(function (p) { return Math.abs(p.L - o.alvoL) <= dmin + 0.15; });
    }
    var porPreco = base.slice().sort(function (a, b) { return a.pr - b.pr; });
    if (o.padrao === "economico") return { p: porPreco[0], motivo: "padrão econômico: a de menor preço que cabe" };
    if (o.padrao === "alto") {
      /* ALTO PADRÃO: fabricante → linha → acabamento (FamiliasCat.arvore: as marcas de linha de arquiteto primeiro) */
      var F = FC(), aps = lista.filter(function (p) { return p.ap; });
      if (aps.length && F && F.arvore) {
        var ids = {}; aps.forEach(function (p) { ids[p.id] = p; });
        var arv = F.arvore("ra-cat-" + lista[0].c);
        for (var i = 0; i < arv.length; i++) for (var j = 0; j < arv[i].linhas.length; j++) for (var k = 0; k < arv[i].linhas[j].tipos.length; k++) {
          var t = arv[i].linhas[j].tipos[k]; if (ids[t.tipoId]) return { p: ids[t.tipoId], motivo: "alto padrão: " + arv[i].fabricante + " › " + arv[i].linhas[j].linha + " › " + txt(t.acabamento) };
        }
      }
      mot = "alto padrão: nenhuma peça de linha de arquiteto cabe nesta categoria — usei a mais cara do estilo";
      return { p: porPreco[porPreco.length - 1], motivo: mot };
    }
    var semAp = porPreco.filter(function (p) { return !p.ap; }), lm = semAp.length ? semAp : porPreco;
    return { p: lm[Math.floor((lm.length - 1) / 2)], motivo: "padrão médio: a de preço mediano que cabe" };
  }
  /* escolher(ctx, cats, o) → a lista de peças a TENTAR, em ordem: a do padrão primeiro, depois as menores da mesma categoria
     (a redução do PADROES §2 passo 4a), depois a categoria seguinte (4b). o = { maxL, maxP, maxA, minL, filtro, ordem, alvoL, n } */
  function escolher(ctx, cats, o) {
    o = o || {}; var out = [], est = ctx.o.estilo;
    cats.forEach(function (cat) {
      var todas = pecasDe(cat).filter(function (p) { return !(kitDe(p.n) > 1) && (!o.filtro || o.filtro(p)) && (o.maxL == null || p.L <= o.maxL + EPS) && (o.maxP == null || p.P <= o.maxP + EPS) && (o.maxA == null || p.A <= o.maxA + EPS) && (o.minL == null || p.L >= o.minL - EPS); });
      if (!todas.length) return;
      var noEst = todas.filter(function (p) { return arr(p.e).indexOf(est) >= 0; }), via = "estilo";
      if (!noEst.length) { noEst = todas.filter(function (p) { return arr(p.e).indexOf("contemporaneo") >= 0; }); via = "contemporaneo"; }
      if (!noEst.length) { noEst = todas; via = "qualquer"; }
      var pr = porPadrao(noEst, { padrao: ctx.o.padrao, ordem: o.ordem, alvoL: o.alvoL });
      var resto = noEst.filter(function (p) { return p !== pr.p; }).sort(function (a, b) {
        if (o.alvoL != null) return Math.abs(a.L - o.alvoL) - Math.abs(b.L - o.alvoL) || a.pr - b.pr;
        return (b.L - a.L) || Math.abs(a.pr - pr.p.pr) - Math.abs(b.pr - pr.p.pr);
      }).filter(function (p) { return o.alvoL != null || p.L <= pr.p.L + EPS || o.ordem === "larga"; });
      var lst = [pr.p].concat(resto);
      /* lista LARGA (armário, rack): as mais largas e, depois, uma por faixa de 25 cm até a menor — a redução chega às pequenas */
      if (o.ordem === "larga" && lst.length > (o.n || 7)) {
        var am = lst.slice(0, 4), faixa = {};
        lst.slice(4).forEach(function (p) { var k = Math.floor(p.L / 0.25); if (!faixa[k]) { faixa[k] = 1; am.push(p); } });
        lst = am;
      }
      lst.slice(0, o.ordem === "larga" ? Math.max(o.n || 7, 16) : (o.n || 7)).forEach(function (p, i) { out.push(infoPeca(ctx, cat, p, via, i === 0 ? pr.motivo : "")); });
    });
    return out;
  }
  /* o armário planejado (largura total → módulos): o tipo pelo padrão, a largura pela parede */
  function planejado(ctx, modo, largura, inst) {
    var F = FPL(), fam = F && F.familia ? F.familia() : null; if (!fam) return null;
    var cor = ctx.o.padrao !== "economico", tid = { base: cor ? "base-cor" : "base-branco", aereo: cor ? "aereo-cor" : "aereo-branco", roupeiro: cor ? "roupeiro-cor" : "roupeiro-branco" }[modo];
    var t = null; fam.tipos.forEach(function (x) { if (x.id === tid) t = x; });
    if (!t) return null;
    var ins = { Largura_total: r4(largura) }; Object.keys(inst || {}).forEach(function (k) { ins[k] = inst[k]; });
    var vf = {}; fam.parametros.forEach(function (q) { vf[q.nome] = q.valor; }); Object.keys(t.valores).forEach(function (k) { vf[k] = t.valores[k]; });
    var y0 = modo === "aereo" ? num(ins.Altura_instalacao, num(vf.Altura_instalacao, 1.5)) : 0;
    return { cat: "planejado-" + modo, famId: fam.id, tipoId: tid, nome: t.nome, L: largura, P: num(vf.Profundidade, 0.52), A: num(vf.Altura, 0.855), y0: y0, yFam: y0, cen: false, inst: ins,
      preco: num(vf.Preco_unitario, 0), fonte: txt(vf.Fonte_preco), unidadePreco: "m² de frente", provisorio: false, fabricante: "composição própria RA", linha: txt(vf.Composicao_id), alto: false, estilos: [], via: "planejado", motivoPadrao: (cor ? "frente amadeirada/cor" : "frente branca") + " (" + txt(vf.Composicao_id) + ")" };
  }
  var LEGADO_CAT = { "ra-mob-sofa-reto": "sofa-3-lugares", "ra-mob-sofa-l": "sofa-canto-chaise", "ra-mob-poltrona": "poltrona", "ra-mob-mesa-centro": "mesa-centro", "ra-mob-rack-tv": "rack-painel-tv",
    "ra-mob-aparador": "aparador", "ra-mob-tapete": "tapete", "ra-mob-mesa-jantar": "mesa-jantar-6", "ra-mob-banqueta": "banqueta-bancada", "ra-mob-cama": "cama-queen", "ra-mob-criado": "criado-mudo",
    "ra-mob-guarda-roupa": "guarda-roupa-pronto", "ra-mob-escrivaninha": "escrivaninha-home-office", "ra-coz-geladeira": "geladeira", "ra-coz-lavadora": "lava-seca-maquina", "ra-lazer-espreguicadeira": "poltrona-externa-espreguicadeira",
    "ra-mob-closet": "planejado-roupeiro" };
  /* a categoria de uma peça qualquer do modelo (do catálogo, da biblioteca antiga, o planejado pelo tipo) */
  function categoriaDe(f) {
    var id = txt(f && f.famId);
    if (/^ra-cat-/.test(id)) return id.slice(7);
    if (id === "ra-plan-armario") { var t = txt(f.tipoId); return /^base/.test(t) ? "planejado-base" : (/^aereo/.test(t) ? "planejado-aereo" : (/^roupeiro/.test(t) ? "planejado-roupeiro" : "planejado-" + t.split("-")[0])); }
    if (/churrasqueira/.test(id)) return "churrasqueira";
    return LEGADO_CAT[id] || "";
  }

  /* ---------------------------------------------------------------- HISTÓRICO: o que é do motor, o que o usuário mexeu/apagou */
  /* ⚠ REVISÃO (21/10/2026): o BIM.editarLote passa o lote pelo BimEdit.sanear, que CORTA a origem em 20 caracteres —
     "mobiliario-automatico" (21) chegava gravado como "mobiliario-automatic". A comparação exata não reconhecia o lote do
     próprio motor: o "apagar" do 1º Refazer contava como apagado PELO USUÁRIO e o 2º Refazer apagava todo o automático do
     ambiente sem relançar nada (a casa de teste ia de 27 peças a 8). Compara pelos 20 primeiros, como o sanear grava. */
  /* ⚠ REVISÃO (21/10/2026): o lote do AUDITOR (Corrigir) é escolha do USUÁRIO — ele clicou. Contava como do motor e o Refazer
     apagava a troca/o reposicionamento aceito e relançava a peça de antes. Só o lote do próprio motor é "do motor". */
  function deOrigem(o, alvo) { return o != null && String(o).slice(0, 20) === String(alvo).slice(0, 20); }
  function analisarOps(ops) {
    var r = { conhecido: !!ops, mexidas: {}, apagadas: {} };
    (function varre(L, doMotor) {
      arr(L).forEach(function (x) {
        if (!x) return;
        if (x.op === "lote") { varre(x.ops, deOrigem(x.origem, ORIGEM)); return; }
        if (x.id == null || String(x.id).indexOf(PREF) !== 0) return;
        if (doMotor) { if (x.op === "familia") { delete r.apagadas[x.id]; delete r.mexidas[x.id]; } return; }
        if (x.op === "apagar") r.apagadas[x.id] = 1; else if (x.op !== "familia") r.mexidas[x.id] = 1;
      });
    })(ops, false);
    return r;
  }

  /* ---------------------------------------------------------------- VALIDAÇÃO de uma posição */
  function M(cod, texto, crit) { return { cod: cod, texto: texto, crit: crit || null }; }
  function dentroUso(ctx, o) {
    /* tolerância de 8 cm: a faixa não reprova por uma lasca da espessura de parede no canto (o ambiente acaba na face) */
    if (obbDentro(o, ctx.geo.pts, 0.08)) return true;
    /* a faixa de uso pode atravessar o lado ABERTO (integração): vale cada canto em algum ambiente do pavimento */
    var outros = ctx.L.ambientes.filter(function (b) { return b.pav === ctx.amb.pav; });
    return cantos(encolher(o, 0.08)).every(function (p) { return outros.some(function (b) { return dentro(p, b.pts); }); });
  }
  function validar(ctx, c) {
    var i;
    if (!obbDentro(c.fp, c.zonaPts || ctx.geo.pts, 0.01)) return M("fora", "não cabe dentro do ambiente");
    if (c.y0 < 2.15) for (i = 0; i < ctx.z.portas.length; i++) if (sobrepoe(c.fp, ctx.z.portas[i].obb)) return M("porta", "fica na frente da porta " + ctx.z.portas[i].id + " (arco da folha + faixa livre de " + f2(CV("faixaPorta")) + " m)", "faixaPorta");
    for (i = 0; i < ctx.z.janelas.length; i++) { var j = ctx.z.janelas[i]; if (c.y1 > j.peitoril - 0.02 && c.y0 < j.topo && sobrepoe(c.fp, j.obb)) return M("janela", "peça de " + f2(c.y1) + " m de altura na frente da janela " + j.id + " (peitoril " + f2(j.peitoril) + " m)", "janelaFaixa"); }
    if (!c.leve) for (i = 0; i < ctx.obst.length; i++) {
      var o = ctx.obst[i]; if (o.leve || (c.ignorar && c.ignorar.indexOf(o.id) >= 0)) continue;
      if (c.y0 < o.y1 - 0.01 && o.y0 < c.y1 - 0.01 && sobrepoe(c.fp, o.fp)) return M("colisao", "bate em " + o.nome);
    }
    for (var k = 0; k < arr(c.usos).length; k++) {
      var u = c.usos[k];
      if (!dentroUso(ctx, u.obb)) return M("circulacao", "não sobra a faixa de " + f2(u.prof) + " m (" + u.rotulo + ")", u.crit);
      for (i = 0; i < ctx.obst.length; i++) { var o2 = ctx.obst[i]; if (o2.leve || o2.y0 > 1.8 || (c.grupo && o2.grupo === c.grupo) || (c.ignorar && c.ignorar.indexOf(o2.id) >= 0)) continue; if (sobrepoe(u.obb, o2.fp)) return M("circulacao", "a faixa de " + f2(u.prof) + " m (" + u.rotulo + ") bate em " + o2.nome, u.crit); }
    }
    if (!c.leve && c.y0 < 1.8) for (i = 0; i < ctx.usos.length; i++) { var z = ctx.usos[i]; if ((c.grupo && z.grupo === c.grupo) || (c.ignorar && c.ignorar.indexOf(z.id) >= 0)) continue; if (sobrepoe(c.fp, z.obb)) return M("circulacao", "invade a faixa de " + f2(z.prof) + " m de " + z.dono + " (" + z.rotulo + ")", z.crit); }
    return null;
  }
  /* faixa de uso no quadro da peça: [x0, x1, z0, z1] + o critério */
  function uso(B, r, x0, x1, z0, z1, crit, rotulo) { return { obb: obb(B, r, x0, x1, z0, z1), prof: Math.min(Math.abs(x1 - x0), Math.abs(z1 - z0)), crit: crit, rotulo: rotulo || MR().CRITERIOS[crit].rotulo }; }
  function usoF(B, r, L, P, prof, crit, rot) { var u = uso(B, r, -L / 2, L / 2, P, P + prof, crit, rot); u.prof = prof; return u; }

  /* ---------------------------------------------------------------- GRADE: passagem da porta até a faixa de cada peça + área de giro */
  /* ⚠ REVISÃO (21/10/2026, desempenho): a grade testava o contorno e TODA peça em cada célula de 5 cm e a passagem alocava um
     ponto por célula — o auditor num salão de 400 m² com o layout bagunçado levava ~6,5 s (tela parada: o auditor refaz a grade
     a cada solução que confere). Agora o contorno vai por linha (os cruzamentos do lado com a linha, a MESMA conta do `dentro`),
     cada peça só nas células da caixa dela, e a passagem/chegada só nas células da caixa da porta/da faixa. O resultado é o
     MESMO célula a célula (tools/test-mob-um-clique-rev.js [R9] compara com a implementação de antes). */
  function faixaCel(G, o) {
    var ex = Math.abs(o.u[0]) * o.hu + Math.abs(o.v[0]) * o.hv, ez = Math.abs(o.u[1]) * o.hu + Math.abs(o.v[1]) * o.hv;
    return { i0: Math.max(0, Math.floor((o.c[0] - ex - G.x0) / G.h - 0.5) - 1), i1: Math.min(G.nx - 1, Math.ceil((o.c[0] + ex - G.x0) / G.h - 0.5) + 1),
      j0: Math.max(0, Math.floor((o.c[1] - ez - G.z0) / G.h - 0.5) - 1), j1: Math.min(G.nz - 1, Math.ceil((o.c[1] + ez - G.z0) / G.h - 0.5) + 1) };
  }
  function grade(ctx, extra) {
    var P = ctx.geo.pts, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, h = 0.05;
    P.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
    var nx = Math.max(1, Math.ceil((x1 - x0) / h)), nz = Math.max(1, Math.ceil((z1 - z0) / h)), N = nx * nz, occ = new Array(N), dist = new Array(N), i, j, k, q;
    var obs = ctx.obst.filter(function (o) { return !o.leve && o.y0 < 1.0; }).map(function (o) { return o.fp; }).concat(arr(extra));
    var G = { x0: x0, z0: z0, h: h, nx: nx, nz: nz, occ: occ, dist: dist, centro: function (kk) { return [x0 + (kk % nx + 0.5) * h, z0 + (Math.floor(kk / nx) + 0.5) * h]; } };
    /* o contorno por linha: os cruzamentos de cada lado com a linha (a conta do `dentro`); a célula está dentro com nº ímpar à direita */
    var nP = P.length, xs = [];
    for (j = 0; j < nz; j++) {
      var pz = z0 + (j + 0.5) * h; xs.length = 0;
      for (var a0 = 0, b0 = nP - 1; a0 < nP; b0 = a0++) { var A = P[a0], B = P[b0]; if ((A[1] > pz) !== (B[1] > pz)) xs.push((B[0] - A[0]) * (pz - A[1]) / (B[1] - A[1] + 1e-15) + A[0]); }
      xs.sort(function (u, v) { return u - v; });
      var m = 0;
      for (i = 0; i < nx; i++) { var px = x0 + (i + 0.5) * h; while (m < xs.length && xs[m] <= px) m++; k = j * nx + i; occ[k] = (xs.length - m) % 2 === 0; }
    }
    /* cada peça só nas células da caixa dela (o mesmo teste noObb) */
    for (q = 0; q < obs.length; q++) {
      var o = obs[q], fc = faixaCel(G, o);
      for (j = fc.j0; j <= fc.j1; j++) for (i = fc.i0; i <= fc.i1; i++) { k = j * nx + i; if (!occ[k] && noObb([x0 + (i + 0.5) * h, z0 + (j + 0.5) * h], o)) occ[k] = true; }
    }
    for (k = 0; k < N; k++) dist[k] = occ[k] ? 0 : 1e9;
    /* distância (chanfro 1 / √2) até a célula ocupada ou o lado de fora */
    var D2 = Math.SQRT2;
    function rel(kk, k2, c) { if (dist[k2] + c < dist[kk]) dist[kk] = dist[k2] + c; }
    for (j = 0; j < nz; j++) for (i = 0; i < nx; i++) { var k1 = j * nx + i; if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) { if (!occ[k1]) dist[k1] = Math.min(dist[k1], 1); }
      if (i > 0) rel(k1, k1 - 1, 1); if (j > 0) rel(k1, k1 - nx, 1); if (i > 0 && j > 0) rel(k1, k1 - nx - 1, D2); if (i < nx - 1 && j > 0) rel(k1, k1 - nx + 1, D2); }
    for (j = nz - 1; j >= 0; j--) for (i = nx - 1; i >= 0; i--) { var k2 = j * nx + i;
      if (i < nx - 1) rel(k2, k2 + 1, 1); if (j < nz - 1) rel(k2, k2 + nx, 1); if (i < nx - 1 && j < nz - 1) rel(k2, k2 + nx + 1, D2); if (i > 0 && j < nz - 1) rel(k2, k2 + nx - 1, D2); }
    return G;
  }
  /* a passagem de LARGURA w desde as portas e os lados abertos: as células alcançadas (null = sem porta nem lado aberto no modelo) */
  function alcance(ctx, G, w) {
    var lim = (w / 2 - 0.035) / G.h, N = G.nx * G.nz, vis = new Array(N), fila = [], nx = G.nx, nz = G.nz, dist = G.dist, i, j, k;
    var fontes = ctx.z.portas.map(function (p) { return p.obb; }).concat(ctx.z.abertos.map(function (a) { return a.obb; }));
    if (!fontes.length) return null;
    /* as sementes: as células livres na faixa da porta / do lado aberto (só as da caixa dela) */
    fontes.forEach(function (o0) {
      var o = encolher(o0, -0.05), fc = faixaCel(G, o);
      for (j = fc.j0; j <= fc.j1; j++) for (i = fc.i0; i <= fc.i1; i++) { k = j * nx + i; if (vis[k] || dist[k] < lim) continue; if (noObb([G.x0 + (i + 0.5) * G.h, G.z0 + (j + 0.5) * G.h], o)) { vis[k] = 1; fila.push(k); } }
    });
    while (fila.length) {
      var a = fila.pop(), ia = a % nx, ja = (a - ia) / nx, b;
      if (ia < nx - 1) { b = a + 1; if (!vis[b] && dist[b] >= lim) { vis[b] = 1; fila.push(b); } }
      if (ia > 0) { b = a - 1; if (!vis[b] && dist[b] >= lim) { vis[b] = 1; fila.push(b); } }
      if (ja < nz - 1) { b = a + nx; if (!vis[b] && dist[b] >= lim) { vis[b] = 1; fila.push(b); } }
      if (ja > 0) { b = a - nx; if (!vis[b] && dist[b] >= lim) { vis[b] = 1; fila.push(b); } }
    }
    return vis;
  }
  function chega(G, vis, alvo) {
    var o = encolher(alvo, -0.05), fc = faixaCel(G, o);
    for (var j = fc.j0; j <= fc.j1; j++) for (var i = fc.i0; i <= fc.i1; i++) { var k = j * G.nx + i; if (vis[k] && noObb([G.x0 + (i + 0.5) * G.h, G.z0 + (j + 0.5) * G.h], o)) return true; }
    return false;
  }
  /* acessoOk: com a peça nova, toda peça que tem faixa de uso continua alcançável (e, no projeto acessível, sobra o giro) */
  function acessoOk(ctx, cand) {
    var G = grade(ctx, cand && !cand.leve && cand.y0 < 1.0 ? [cand.fp] : []), vis = alcance(ctx, G, ctx.passagem);
    var alvos = ctx.alvos.slice(); if (cand && cand.usos && cand.usos.length) alvos.push({ nome: cand.nome, usos: cand.usos });
    if (vis) for (var i = 0; i < alvos.length; i++) {
      if (!alvos[i].usos.some(function (u) { return chega(G, vis, u.obb); })) return M("acesso", "sem passagem de " + f2(ctx.passagem) + " m da porta até " + alvos[i].nome, ctx.passagemCrit);
    }
    if (ctx.o.acessivel) {
      var lim = CV(ctx.giroCrit) / 2 / G.h, tem = false;
      for (var k = 0; k < G.dist.length && !tem; k++) if (G.dist[k] >= lim) tem = true;
      if (!tem) return M("giro", "não sobra a área de giro de Ø " + f2(CV(ctx.giroCrit)) + " m", ctx.giroCrit);
    }
    return null;
  }

  /* ---------------------------------------------------------------- BUSCA de posição encostada */
  /* spec: { peca (L, P, A, y0, cen), edges, zonaPts, grupo, leve, usos(B, r, lado) → [uso], score(ed, s, iv, B, r, var) → n°,
             variantes: ["ambos", "esq", "dir"], passo, folga, posicoes: "todas"|"centro" } */
  function buscarParede(ctx, spec) {
    var pc = spec.peca, y0 = num(pc.y0, 0) + num(spec.dy, 0), y1 = y0 + pc.A, cands = [], motivos = [], L = pc.L, P = pc.P;
    arr(spec.edges || ctx.zona.edges).forEach(function (ed) {
      livres(ed, y0, y1).forEach(function (iv) {
        var need = L + num(spec.folga, 0); if (iv[1] - iv[0] < need - EPS) { motivos.push(M("parede", "nenhuma parede livre de " + f2(need) + " m", spec.folga ? "folgaEncosto" : null)); return; }
        var a = iv[0] + L / 2, b = iv[1] - L / 2, ss = [(a + b) / 2, a, b], passo = spec.passo || 0.1;
        if (spec.posicoes !== "centro") for (var s = a + passo; s < b - passo / 2; s += passo) ss.push(s);
        ss.forEach(function (s) {
          var B = add(add(ed.a, ed.d, s), ed.n, 0.003), r = ed.r;
          (spec.variantes || ["ambos"]).forEach(function (vr) {
            if (vr !== "ambos" && !encostadoLado(ctx, B, r, L, P, vr === "esq" ? -1 : 1, spec.zonaPts)) return;
            var c = { fp: obb(B, r, -L / 2, L / 2, 0, P), y0: y0, y1: y1, usos: spec.usos ? spec.usos(B, r, vr) : [], grupo: spec.grupo, leve: !!spec.leve, zonaPts: spec.zonaPts, nome: pc.nome, ignorar: spec.ignorar };
            var e = validar(ctx, c); if (e) { motivos.push(e); return; }
            cands.push({ sc: spec.score ? spec.score(ed, s, iv, B, r, vr) : 0, c: c, B: B, r: r, ed: ed, s: s, iv: iv, variante: vr });
          });
        });
      });
    });
    cands.sort(function (x, y) { return y.sc - x.sc; });
    /* spec.aceitar(cand) → null | motivo: a posição tem de servir também às peças que dependem dela (a cama e os criados-mudos).
       Com ela, a busca passa das 14 primeiras e percorre as paredes candidatas até achar a que serve; nenhuma serve → fica a
       melhor que passou no acesso (o comportamento de antes: a dependente vira pendência com o motivo). */
    var lim = spec.aceitar ? 80 : 14, reserva = null;
    for (var i = 0; i < cands.length && i < lim; i++) {
      var e2 = spec.semAcesso ? null : acessoOk(ctx, cands[i].c);
      if (e2) { motivos.push(e2); continue; }
      if (!spec.aceitar) return cands[i];
      var e3 = spec.aceitar(cands[i]);
      if (!e3) return cands[i];
      if (!reserva) { reserva = cands[i]; reserva.recusa = e3; }
    }
    if (reserva) return reserva;
    return { falha: motivoPrincipal(motivos) };
  }
  /* o lado da peça encosta na parede/limite (a cama de solteiro no canto dispensa a faixa daquele lado) */
  function encostadoLado(ctx, B, r, L, P, lado, pts) {
    var o = obb(B, r, lado < 0 ? -L / 2 - 0.06 : L / 2 + 0.01, lado < 0 ? -L / 2 - 0.01 : L / 2 + 0.06, 0.1, P - 0.1);
    return !cantos(o).some(function (p) { return dentro(p, pts || ctx.geo.pts); });
  }
  function motivoPrincipal(L) {
    if (!L.length) return M("parede", "nenhuma parede livre");
    var ordem = ["acesso", "giro", "circulacao", "colisao", "janela", "porta", "fora", "parede"], cont = {};
    L.forEach(function (m) { cont[m.cod] = (cont[m.cod] || 0) + 1; });
    for (var i = 0; i < ordem.length; i++) for (var j = 0; j < L.length; j++) if (L[j].cod === ordem[i]) return L[j];
    return L[0];
  }
  /* posição LIVRE (peça solta ou relativa a outra): valida e confere o acesso */
  function tentarSolta(ctx, c) { var e = validar(ctx, c); if (e) return e; return c.semAcesso ? null : acessoOk(ctx, c); }

  /* ---------------------------------------------------------------- REGISTRO */
  function regrasTxt(chaves) {
    var R = MR(), out = [];
    arr(chaves).forEach(function (k) {
      if (!k) return;
      if (typeof k === "object") { out.push(k); return; }
      if (R.CRITERIOS[k]) { out.push(R.porque(k)); return; }
      var c = R.cite(k); out.push({ regra: k, nivel: c.nivel, texto: c.texto, fonte: c.fonte });
    });
    return out;
  }
  function rq(k, texto) { var p = MR().porque(k); if (texto) p.texto = texto; return p; }
  function registrar(ctx, slot, pc, pos, regras, extra) {
    extra = extra || {};
    var id = PREF + ctx.amb.id + "-" + slot, B = pos.B, r = pos.r, orig = pc.cen ? noMundo(B, r, 0, pc.P / 2) : B, y0 = num(pc.y0, 0) + num(extra.dy, 0);
    /* yFam: a família que se eleva sozinha (o aéreo planejado desenha a partir da Altura_instalacao) fica com a instância no piso */
    var op = { op: "familia", id: id, famId: pc.famId, tipoId: pc.tipoId, x: r4(orig[0]), y: r4(ctx.amb.base + y0 - num(pc.yFam, 0)), z: r4(orig[1]), rotY: r4(r), inst: JSON.parse(JSON.stringify(pc.inst || {})) };
    ctx.ops.push(op);
    var c = pos.c || { fp: obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), usos: [] };
    ctx.obst.push({ id: id, fp: c.fp, y0: y0, y1: y0 + pc.A, leve: !!extra.leve, grupo: extra.grupo || null, nome: pc.nome, auto: true, cat: pc.cat });
    arr(c.usos).forEach(function (u) { ctx.usos.push({ obb: u.obb, grupo: extra.grupo || null, dono: pc.nome, id: id, prof: u.prof, crit: u.crit, rotulo: u.rotulo }); });
    if (arr(c.usos).length && !extra.leve) ctx.alvos.push({ nome: pc.nome, usos: c.usos });
    var regs = regrasTxt(["faixaPorta"].concat(pc.A + y0 > 0.9 ? ["janelaFaixa"] : []).concat(regras || []));
    var item = { id: id, tipo: "peca", ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, tipoAmbiente: ctx.tipo, slot: slot, famId: pc.famId, tipoId: pc.tipoId, nome: pc.nome, categoria: pc.cat,
      L: r4(pc.L), P: r4(pc.P), A: r4(pc.A), x: op.x, y: op.y, z: op.z, rotY: op.rotY, preco: pc.preco, precoTexto: pc.preco ? fmtR(pc.preco) + (pc.unidadePreco ? " / " + pc.unidadePreco : "") : "SEM PREÇO no catálogo — pendência: orce à parte", semPreco: !(pc.preco > 0), fontePreco: pc.fonte || "",
      provisorio: !!pc.provisorio, fabricante: pc.fabricante, linha: pc.linha, alto: !!pc.alto, estilo: ctx.o.estilo, padrao: ctx.o.padrao, via: pc.via, escolha: pc.motivoPadrao || "", opcional: !!extra.opcional,
      regras: regs, reduzido: extra.reduzido || null, inst: op.inst };
    if (pc.via === "contemporaneo") item.regras.push({ regra: "PADROES §5", nivel: "P", texto: "sem peça do estilo " + ctx.o.estilo + " que caiba: usei a contemporânea (padrão)", fonte: "PADROES-AMBIENTES §5" });
    ctx.itens.push(item);
    return item;
  }
  /* tenta as peças da lista em ordem; a 1ª que couber entra; a redução é dita com o motivo da que não coube */
  function tentar(ctx, slot, lista, specFn, info) {
    info = info || {};
    if (!lista.length) { falhou(ctx, slot, info, "nenhuma peça da categoria " + (info.cats || []).join("/") + " cabe nas medidas do ambiente"); return null; }
    var primeiro = null;
    for (var i = 0; i < lista.length; i++) {
      var sp = specFn(lista[i]); if (!sp) continue;
      var res = sp.solta ? sp.solta() : buscarParede(ctx, sp);
      if (res && !res.falha) {
        var red = i > 0 && primeiro ? { de: lista[0].nome + " (" + f2(lista[0].L) + " m)", para: lista[i].nome + " (" + f2(lista[i].L) + " m)", motivo: primeiro.texto, regra: primeiro.crit ? MR().criterio(primeiro.crit).regra : null } : null;
        if (red) ctx.reduzidos.push({ ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: slot, texto: "\"" + ctx.amb.nome + "\": troquei " + red.de + " por " + red.para + " — " + red.motivo + (red.regra ? " (" + red.regra + ")" : "") });
        var it = registrar(ctx, slot, lista[i], res, (sp.regras || []).concat(info.regras || []), { grupo: sp.grupo, leve: sp.leve, opcional: info.opcional, reduzido: red, dy: sp.dy });
        res.item = it; res.peca = lista[i];
        return res;
      }
      if (!primeiro) primeiro = res ? res.falha : M("parede", "nenhuma posição");
    }
    falhou(ctx, slot, info, primeiro ? primeiro.texto + (primeiro.crit ? " (" + MR().criterio(primeiro.crit).regra + ")" : "") : "nenhuma posição");
    return null;
  }
  function falhou(ctx, slot, info, motivo) {
    var nome = info.rotulo || slot;
    if (info.opcional) ctx.reduzidos.push({ ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: slot, opcional: true, texto: "\"" + ctx.amb.nome + "\": tirei " + nome + " (opcional) — " + motivo });
    else ctx.pend.push({ ambiente: ctx.amb.id, slot: slot, texto: "\"" + ctx.amb.nome + "\": " + nome + " (obrigatório) não coube — " + motivo + ". Ajuste a planta ou ponha à mão; o auditor confere." });
  }
  /* o slot já está ocupado? (a peça automática dele, ou uma da mesma categoria que o usuário pôs) */
  function jaTem(ctx, slot, cats) {
    var id = PREF + ctx.amb.id + "-" + slot;
    if (ctx.hist.apagadas[id]) { ctx.itens.push({ id: id, tipo: "mantido", ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: slot, texto: "você apagou esta peça — não relancei" }); return { apagada: true }; }
    var e = ctx.existentes.filter(function (x) { return x.id === id; })[0];
    if (!e && cats) e = ctx.existentes.filter(function (x) { return !x.usado && !x.auto && cats.indexOf(x.cat) >= 0; })[0];
    if (!e) return null;
    e.usado = true;
    ctx.itens.push({ id: e.id, tipo: "mantido", ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: slot, texto: e.auto ? (ctx.hist.mexidas[e.id] ? "mexida por você — mantida onde está" : "já lançada — mantida") : "já existe no ambiente (" + e.nome + ") — conta para o programa" });
    return e;
  }

  /* ---------------------------------------------------------------- PROGRAMAS */
  function grupo(ctx, g) { return ctx.amb.id + ":" + g; }
  /* ⚠ REVISÃO (21/10/2026): a cama TRAZ colchão quando o nome diz "com colchão" / "+ colchão". Antes bastava "colch" no nome —
     "Cama Shape (casal) — p/ colchão 193x203" (a MEDIDA do colchão que ela recebe) contava como "traz", e o alto padrão saía
     sem colchão nenhum no orçamento. */
  function trazColchao(nome) { var s = txt(nome); return /(?:\+|\bcom)\s*colch/i.test(s) && !/\bsem\s+colch/i.test(s); }
  function semColchao(p) { return !trazColchao(p.n); }
  var LARG_COLCHAO = { "cama-casal": 1.38, "cama-queen": 1.58, "cama-solteiro": 0.88 };
  /* o colchão avulso sobre a cama (camada leve, no grupo dela) — sem ele o orçamento sai sem colchão */
  function lancarColchao(ctx, cama, G) {
    var larg = LARG_COLCHAO[cama.cat]; if (!larg) return null;
    var lc = escolher(ctx, ["colchao"], { filtro: function (p) { return Math.abs(p.L - larg) < 0.03; } })[0];
    if (!lc) { ctx.pend.push({ ambiente: ctx.amb.id, slot: "colchao", texto: "\"" + ctx.amb.nome + "\": a cama " + cama.nome + " não traz colchão e não há colchão de " + f2(larg) + " no catálogo — orce o colchão." }); return null; }
    var Bc = noMundo(cama.B, cama.r, 0, Math.max(0, (cama.P - lc.P) / 2));
    return registrar(ctx, "colchao", lc, { B: Bc, r: cama.r, c: { fp: obb(Bc, cama.r, -lc.L / 2, lc.L / 2, 0, lc.P), usos: [] } },
      [{ regra: "orçamento", nivel: "P", texto: "a peça " + cama.nome + " não traz colchão: colchão " + f2(larg) + " avulso (sem ele o orçamento sairia incompleto)", fonte: "nome da peça no catálogo" }], { leve: true, grupo: G });
  }
  /* a cama que JÁ estava no ambiente (rodar de novo, Refazer com a cama mexida, cama trocada depois do motor): o colchão segue a cama —
     traz colchão → sai o avulso automático que ninguém mexeu (cobraria dois); não traz → entra o avulso (o Refazer apagava e não relançava) */
  function conferirColchao(ctx, ex, G) {
    var nomeC = ex.pecaNome || ex.nome, idC = PREF + ctx.amb.id + "-colchao";
    if (trazColchao(nomeC)) {
      ctx.existentes = ctx.existentes.filter(function (e) {
        if (e.id !== idC || !e.auto || ctx.hist.mexidas[e.id]) return true;
        ctx.ops.push({ op: "apagar", id: e.id }); ctx.obst = ctx.obst.filter(function (o) { return o.id !== e.id; });
        ctx.itens.push({ id: e.id, tipo: "removido", ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: "colchao", texto: "\"" + ctx.amb.nome + "\": tirei o colchão avulso — a cama " + nomeC + " já traz colchão (não cobrar dois)" });
        return false;
      });
      return;
    }
    if (!LARG_COLCHAO[ex.cat] || jaTem(ctx, "colchao", ["colchao"])) return;
    lancarColchao(ctx, { B: ex.B, r: ex.r, P: ex.P, cat: ex.cat, nome: nomeC }, G);
  }
  /* o criado-mudo no lado `ld` da cabeceira (encostado na mesma parede, 2 cm da cama). `previa`: só as regras da posição
     (porta, janela, colisão, faixas) — a conferência da cama candidata, antes de ela existir; a passagem é conferida no lançamento */
  function posCriado(ctx, cama, ld, pc, G, z, previa) {
    var B = noMundo(cama.B, cama.r, ld * (cama.L / 2 + pc.L / 2 + 0.02), 0), c = { fp: obb(B, cama.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, usos: [], grupo: G, nome: pc.nome, zonaPts: z.pts };
    if (!naParede(ctx, B, cama.r, pc.L)) return { falha: M("parede", "sem parede ao lado da cabeceira") };
    var e = previa ? validar(ctx, c) : tentarSolta(ctx, c); return e ? { falha: e } : { B: B, r: cama.r, c: c };
  }
  /* os criados-mudos (índice do lado: 0 = criado-1, 1 = criado-2) que o motor ainda lançaria — sem efeito colateral (o jaTem
     registra "mantido"): o apagado pelo usuário não volta, o que já existe fica, o posto à mão conta para o programa */
  function criadosQuePrecisa(ctx, sol) {
    var out = [], mao = ctx.existentes.filter(function (x) { return !x.usado && !x.auto && x.cat === "criado-mudo"; }).length;
    (sol ? [0] : [0, 1]).forEach(function (k) {
      var id = PREF + ctx.amb.id + "-criado-" + (k + 1);
      if (ctx.hist.apagadas[id] || ctx.existentes.some(function (x) { return x.id === id; })) return;
      if (mao > 0) { mao--; return; }
      out.push(k);
    });
    return out;
  }
  /* ---- DORMITÓRIO (PADROES 3.8 e 3.9) */
  function planoDorm(ctx) {
    var t = ctx.tipo, sol = /solteiro|infantil/.test(t), z = ctx.zona, pad = ctx.o.padrao, cd = CV("circDorm"), acc = ctx.o.acessivel, fa = CV("faixaAcessivel");
    var cats = sol ? ["cama-solteiro"] : (pad === "alto" ? ["cama-king", "cama-queen", "cama-casal"] : (t === "suite" || pad === "medio" ? ["cama-queen", "cama-casal"] : ["cama-casal", "cama-queen"]));
    var todasCamas = ["cama-casal", "cama-queen", "cama-king", "cama-solteiro", "beliche-cama-infantil"], G = grupo(ctx, "cama");
    var ex = jaTem(ctx, "cama", todasCamas), cama = null;
    var lCriado = escolher(ctx, ["criado-mudo"], { maxP: 0.5 });
    function ladosDe(variante) { return sol ? [variante === "dir" ? -1 : 1] : [-1, 1]; }
    if (ex && !ex.apagada) { cama = { B: ex.B, r: ex.r, L: ex.L, P: ex.P, s: null }; conferirColchao(ctx, ex, G); }
    else if (!ex) {
      /* king sem colchão no catálogo (só há colchão até 1,58): a king tem de trazer o colchão */
      var lista = escolher(ctx, cats, { filtro: function (p) { return !(p.c === "cama-king" && semColchao(p)); } });
      /* ⚠ (23/10/2026) quarto com DUAS janelas em paredes diferentes (Código de Obras: j1212 + j1512 no lugar de uma j2012):
         a parede cega que sobrava era a da porta, e a cama centrada nela empurrava o criado-mudo para a faixa da porta — o
         obrigatório caía como pendência. A cabeceira agora só fica numa parede onde cabem também os criados-mudos (todas as
         paredes candidatas, a cama deslizando ao longo delas, inclusive sob janela de peitoril acima da cabeceira e do criado);
         nenhuma serve → a melhor de antes, e o criado vira pendência com o motivo (como antes). */
      var precisa = criadosQuePrecisa(ctx, sol);
      var res = tentar(ctx, "cama", lista, function (pc) {
        return { peca: pc, grupo: G, zonaPts: z.pts, edges: z.edges,
          variantes: sol ? ["ambos", "esq", "dir"] : ["ambos"],
          aceitar: precisa.length && lCriado.length ? function (cd0) {
            var lds = ladosDe(cd0.variante), cm = { B: cd0.B, r: cd0.r, L: pc.L };
            for (var q = 0; q < lds.length; q++) {
              if (precisa.indexOf(q) < 0) continue;
              var ok = false, mot = null;
              for (var w = 0; w < lCriado.length && !ok; w++) { var pp = posCriado(ctx, cm, lds[q], lCriado[w], G, z, true); if (pp.falha) { if (!mot) mot = pp.falha; } else ok = true; }
              if (!ok) return mot || M("parede", "sem lugar para o criado-mudo");
            }
            return null;
          } : null,
          regras: ["circDorm"].concat(sol ? [] : [rq("vaoLateralCasal", "preferível 0,70–0,90 m nas laterais e no pé (dorm-vao-lateral-frente) — conferido no auditor")]).concat(acc ? ["faixaAcessivel", "giro"] : []).concat([{ regra: "dorm-cabeceira-porta-feng-shui", nivel: "?", texto: "cabeceira de preferência em parede sem janela e fora do alinhamento da porta (prática popular, preferir — não exigir)", fonte: "sem fonte — conferir" }, { regra: "dorm-pe-cama-090", nivel: "?", texto: "pé da cama: usei " + f2(cd) + " m (dorm-circulacao-minima); 0,90 m é sem fonte", fonte: "sem fonte — conferir" }]),
          usos: function (B, r, vr) {
            var L = pc.L, P = pc.P, cE = cd, cDr = cd, out = [];
            if (acc) { if (vr === "dir" || vr === "ambos") cE = fa; else cDr = fa; }
            if (vr !== "esq") out.push(uso(B, r, -L / 2 - cE, -L / 2, 0.5, P, acc && cE === fa ? "faixaAcessivel" : "circDorm", "lateral da cama"));
            if (vr !== "dir") out.push(uso(B, r, L / 2, L / 2 + cDr, 0.5, P, acc && cDr === fa ? "faixaAcessivel" : "circDorm", "lateral da cama"));
            var pe = usoF(B, r, L, P, cd, "circDorm", "pé da cama"); out.push(pe);
            return out;
          },
          score: function (ed, s, iv, B, r, vr) {
            var sc = (ed.janelas.length ? 0 : 3) + (ed.portas.length ? 0 : 2);
            if (sol) sc += (vr !== "ambos" ? 2 : 0) - ed.len * 0.3;   /* solteiro: cabeceira na parede mais curta, no canto (sobra o centro livre — PADROES 3.9 [P]) */
            else sc += ed.len * 0.2 - Math.abs(s - (iv[0] + iv[1]) / 2) * 2;   /* casal: centralizada na parede mais longa */
            return sc;
          } };
      }, { rotulo: "a cama", cats: cats });
      if (res) cama = { B: res.B, r: res.r, L: res.peca.L, P: res.peca.P, variante: res.variante, peca: res.peca };
      /* a cama que não traz colchão ganha o colchão da largura dela (sem ele o orçamento sai sem colchão) */
      if (res && semColchao(res.peca.p) && res.peca.cat !== "cama-king" && !jaTem(ctx, "colchao", ["colchao"])) lancarColchao(ctx, { B: res.B, r: res.r, P: res.peca.P, cat: res.peca.cat, nome: res.peca.nome }, G);
    }
    /* criado-mudo ao lado da cabeceira (×2 no casal, ×1 no solteiro — o do lado livre) */
    if (cama) {
      var lados = ladosDe(cama.variante);
      lados.forEach(function (ld, k) {
        var slot = "criado-" + (k + 1); if (jaTem(ctx, slot, ["criado-mudo"])) return;
        tentar(ctx, slot, lCriado, function (pc) {
          return { peca: pc, grupo: G, regras: [rq("circDorm", "ao lado da cabeceira, fora da faixa lateral (dorm-circulacao-minima a partir de 0,50 m)"), "dorm-criado-mudo-altura"], solta: function () { return posCriado(ctx, cama, ld, pc, G, z, false); } };
        }, { rotulo: "o criado-mudo", cats: ["criado-mudo"] });
      });
    }
    /* guarda-roupa: parede oposta à janela se possível, ou lateral (PADROES 3.8) */
    if (!jaTem(ctx, "guarda-roupa", ["guarda-roupa-pronto", "planejado-roupeiro"])) {
      var lgr = [];
      if (pad === "alto") z.edges.forEach(function (ed) { livres(ed, 0, 2.3).forEach(function (iv) { var p = planejado(ctx, "roupeiro", Math.floor((iv[1] - iv[0]) * 100) / 100, { Parede_esquerda: true, Parede_direita: true }); if (p && p.L >= 0.9) lgr.push(p); }); });
      lgr.sort(function (a, b) { return b.L - a.L; });
      /* solteiro/infantil: 2–3 portas (PADROES 3.9) — até 1,60 m; casal: a partir de 1,00 m */
      lgr = lgr.slice(0, 3).concat(escolher(ctx, ["guarda-roupa-pronto"], { ordem: "larga", maxL: Math.min(maiorParede(z, 2.3), sol ? 1.6 : 9), n: 12, filtro: sol ? null : function (p) { return p.L >= 1.0; } }));
      tentar(ctx, "guarda-roupa", lgr, function (pc) {
        var correr = /correr/i.test(pc.nome), fr = correr ? CV("circDorm") : CV("roupeiroGiro"), kf = correr ? "circDorm" : "roupeiroGiro";
        return { peca: pc, grupo: grupo(ctx, "gr"), zonaPts: z.pts, regras: [kf], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, fr, kf, correr ? "frente do guarda-roupa de correr" : "frente do guarda-roupa de giro")]; },
          score: function (ed) { return (ed.janelas.length ? 0 : 2) + (cama && Math.abs(dot(ed.n, eixoV(cama.r))) > 0.99 && Math.abs(dot(sub(cama.B, ed.a), ed.n)) < 0.05 ? -1 : 0) + ed.len * 0.05; } };
      }, { rotulo: "o guarda-roupa", cats: ["guarda-roupa-pronto"] });
    }
    if (!ctx.o.opcionais) return;
    if (!sol && !jaTem(ctx, "comoda", ["comoda-sapateira"])) {
      tentar(ctx, "comoda", escolher(ctx, ["comoda-sapateira"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "com"), zonaPts: z.pts, regras: ["circDorm"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, cd, "circDorm", "frente da cômoda")]; } }; }, { rotulo: "a cômoda", opcional: true });
    }
    if (sol && !jaTem(ctx, "escrivaninha", ["escrivaninha-home-office"])) mesaTrabalho(ctx, ["escrivaninha-home-office"], true);
    if (cama && !sol && !jaTem(ctx, "tapete", ["tapete"])) {
      /* tapete sob 2/3 da cama, saindo ≥ 0,50 m nas laterais e no pé (PADROES 3.8 [P]) — camada leve */
      /* a largura da cama + ~0,50 de cada lado (PADROES 3.8 [P]): o tapete mais perto disso, nunca menor que a cama + 0,40 */
      tentar(ctx, "tapete", escolher(ctx, ["tapete"], { minL: cama.L + 0.4, alvoL: cama.L + 1.0 }), function (pc) {
        return { peca: pc, leve: true, regras: [{ regra: "PADROES 3.8", nivel: "P", texto: "tapete sob 2/3 da cama, saindo nas laterais e no pé", fonte: "PADROES-AMBIENTES 3.8 — prática" }], solta: function () {
          var zc = cama.P * 2 / 3 + 0.3, B = noMundo(cama.B, cama.r, 0, zc - pc.P / 2), c = { fp: obb(B, cama.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, leve: true, usos: [], nome: pc.nome, zonaPts: z.pts, semAcesso: true };
          var e = validar(ctx, c); return e ? { falha: e } : { B: B, r: cama.r, c: c };
        } };
      }, { rotulo: "o tapete", opcional: true });
    }
  }
  /* o trecho de parede livre mais comprido para uma peça até a altura y1 (corta a lista de peças largas antes de tentar) */
  function maiorParede(z, y1) { var m = 0; z.edges.forEach(function (ed) { livres(ed, 0, y1).forEach(function (iv) { m = Math.max(m, iv[1] - iv[0]); }); }); return m; }
  /* o ponto p cai num trecho com PAREDE do contorno (não no lado aberto da integração) */
  function paredeEm(z, p) {
    return z.edges.some(function (ed) {
      if (Math.abs(dot(sub(p, ed.a), ed.n)) > 0.06) return false;
      var s = dot(sub(p, ed.a), ed.d);
      return ed.paredes.some(function (w) { return s >= w[0] - 0.02 && s <= w[1] + 0.02; });
    });
  }
  /* a peça encosta numa parede ao longo de L (o criado ao lado da cama, o gaveteiro ao lado da mesa) */
  function naParede(ctx, B, r, L) {
    var n = eixoV(r);
    return ctx.geo.edges.some(function (ed) {
      if (dot(ed.n, n) < 0.99) return false;
      if (Math.abs(dot(sub(B, ed.a), ed.n)) > 0.05) return false;
      var s = dot(sub(B, ed.a), ed.d);
      return livres(ed, 0, 0.8).some(function (iv) { return s - L / 2 >= iv[0] - 0.01 && s + L / 2 <= iv[1] + 0.01; });
    });
  }
  /* ---- mesa de trabalho + cadeira (home office, escritório, estudo do quarto de solteiro) */
  function mesaTrabalho(ctx, cats, opcional) {
    var z = ctx.zona, rec = CV("homeRecuo"), G = grupo(ctx, "trab"), maior = maiorJanela(z);
    var r1 = tentar(ctx, "escrivaninha", escolher(ctx, cats, { minL: CV("escMesaLargura") }), function (pc) {
      return { peca: pc, grupo: G, zonaPts: z.pts, regras: ["homeRecuo", "escMesaLargura", "esc-nbr13966-mesa-altura"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, rec, "homeRecuo", "recuo da cadeira")]; },
        /* de frente para a parede com a janela de LADO — nunca a janela atrás da tela nem nas costas de quem trabalha (PADROES 3.13 [P]) */
        score: function (ed) { if (!maior) return 0; var c = Math.abs(dot(ed.n, maior.n)); return c < 0.1 ? 3 : (dot(ed.n, maior.n) < -0.9 ? -1 : 0); } };
    }, { rotulo: "a mesa de trabalho", opcional: opcional, cats: cats });
    if (!r1) return null;
    if (!jaTem(ctx, "cadeira", ["cadeira-escritorio-giratoria"])) {
      tentar(ctx, "cadeira", escolher(ctx, ["cadeira-escritorio-giratoria"], {}), function (pc) {
        return { peca: pc, grupo: G, regras: ["esc-nbr13962-cadeira-assento"], solta: function () {
          /* a cadeira entra um pouco sob o tampo (a mesa não conta como colisão dela) */
          var off = r1.peca.P + pc.P / 2 - 0.12, Bc = noMundo(r1.B, r1.r, 0, off), r = r1.r + Math.PI, B = noMundo(Bc, r, 0, -pc.P / 2);
          var c = { fp: obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, usos: [], grupo: G, nome: pc.nome, zonaPts: z.pts, ignorar: [r1.item.id] };
          var e = tentarSolta(ctx, c); return e ? { falha: e } : { B: B, r: r, c: c };
        } };
      }, { rotulo: "a cadeira", opcional: opcional });
    }
    return r1;
  }
  function maiorJanela(z) {
    var best = null;
    z.edges.forEach(function (ed) { ed.janelas.forEach(function (j) { var w = j.s1 - j.s0; if (!best || w > best.w) best = { w: w, n: ed.n, ed: ed, s: (j.s0 + j.s1) / 2 }; }); });
    return best;
  }
  /* ---- SALA DE ESTAR (PADROES 3.1) */
  function diagTv(p) { var m = /(\d{2,3})\s*pol/.exec(txt(p.n)); return m ? +m[1] * 0.0254 : null; }
  function planoSala(ctx, z) {
    z = z || ctx.zona;
    var G = grupo(ctx, "estar"), cp = CV("circPrincipal"), maior = maiorJanela(z), mesaPmin = Infinity;
    pecasDe("mesa-centro").forEach(function (p) { mesaPmin = Math.min(mesaPmin, p.P); });
    var dMinSofa = CV("mesaTv") + (isFinite(mesaPmin) ? mesaPmin : 0.4) + CV("sofaMesaMin");
    /* 1. rack/painel na parede cega mais longa, perpendicular à janela principal (reflexo na tela, PADROES 3.1 [P]) */
    var exR = jaTem(ctx, "rack", ["rack-painel-tv"]), rack = null;
    if (exR && !exR.apagada) rack = { id: exR.id, B: exR.B, r: exR.r, L: exR.L, P: exR.P, A: exR.A || 0.6 };
    else if (!exR) {
      var rr = tentar(ctx, "rack", escolher(ctx, ["rack-painel-tv"], { ordem: "larga", maxL: maiorParede(z, 0.6) - CV("folgaEncosto"), n: 10 }), function (pc) {
        return { peca: pc, grupo: G, zonaPts: z.pts, folga: CV("folgaEncosto"), regras: ["folgaEncosto", { regra: "PADROES 3.1", nivel: "P", texto: "TV na parede cega perpendicular à janela principal (sem reflexo na tela)", fonte: "PADROES-AMBIENTES 3.1 — prática" }],
          usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, CV("mesaTv"), "mesaTv", "frente do móvel da TV")]; },
          score: function (ed, s, iv, B) {
            var fundo = raio(add(B, ed.n, 0.02), ed.n, z.pts), sc = fundo >= pc.P + dMinSofa + 0.7 ? 5 : -5;
            if (maior) sc += Math.abs(dot(ed.n, maior.n)) < 0.1 ? 2 : (dot(ed.n, maior.n) > 0.9 ? -2 : 0);
            return sc + (ed.portas.length ? 0 : 1) + ed.len * 0.1 - Math.abs(s - (iv[0] + iv[1]) / 2);
          } };
      }, { rotulo: "o rack/painel da TV", cats: ["rack-painel-tv"] });
      if (rr) rack = { id: rr.item.id, B: rr.B, r: rr.r, L: rr.peca.L, P: rr.peca.P, A: rr.peca.A };
    }
    if (!rack) return;
    var n = eixoV(rack.r), fundo = raio(add(rack.B, n, 0.02), n, z.pts) + 0.02, maxDg = 0;
    pecasDe("tv").forEach(function (p) { maxDg = Math.max(maxDg, diagTv(p) || 0); });
    /* 2. sofá de frente para a TV: costas na parede oposta se a distância cabe na faixa da maior TV; senão solto, com 0,90 atrás */
    var exS = jaTem(ctx, "sofa", ["sofa-3-lugares", "sofa-2-lugares", "sofa-canto-chaise", "sofa-retratil-reclinavel"]), sofa = null;
    if (exS && !exS.apagada) sofa = { B: exS.B, r: exS.r, L: exS.L, P: exS.P, zs: Math.abs(dot(sub(exS.B, rack.B), n)) - exS.P };
    else if (!exS) {
      var rs = tentar(ctx, "sofa", escolher(ctx, ["sofa-3-lugares", "sofa-2-lugares"], {}), function (pc) {
        return { peca: pc, grupo: G, regras: ["circPrincipal", "tvMin", "tvMax", "tvIdeal"], solta: function () {
          var lo = rack.P + dMinSofa, hiParede = fundo - pc.P, ops = [], motivo = null, temParede = paredeEm(z, add(rack.B, n, fundo));
          if (temParede && hiParede >= lo - EPS && hiParede <= maxDg * CV("tvMax") + EPS) ops.push({ zs: hiParede, parede: true });
          var solto = Math.min(hiParede - cp, maxDg * CV("tvIdeal"));
          if (solto >= lo - EPS) ops.push({ zs: solto, parede: false });
          if (lo <= hiParede - cp + EPS && Math.abs(lo - solto) > 0.05) ops.push({ zs: lo, parede: false });
          if (!ops.length) return { falha: M("circulacao", "a sala não tem fundo para sofá (" + f2(pc.P) + " m) + mesa de centro + " + f2(CV("mesaTv")) + " m até a TV" + (temParede ? "" : " + a passagem de " + f2(cp) + " m atrás do sofá"), temParede ? "mesaTv" : "circPrincipal") };
          for (var i = 0; i < ops.length; i++) {
            var zs = ops[i].zs, r = rack.r + Math.PI, B = noMundo(rack.B, rack.r, 0, zs + pc.P), us = [];
            if (!ops[i].parede) { var ub = uso(B, r, -pc.L / 2, pc.L / 2, -cp, 0, "circPrincipal", "passagem atrás do sofá"); ub.prof = cp; us.push(ub); }
            us.push(usoF(B, r, pc.L, pc.P, CV("sofaMesaMin"), "sofaMesaMin", "frente do sofá"));
            var c = { fp: obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, usos: us, grupo: G, nome: pc.nome, zonaPts: z.pts };
            var e = tentarSolta(ctx, c); if (!e) return { B: B, r: r, c: c, zs: zs }; if (!motivo) motivo = e;
          }
          return { falha: motivo };
        } };
      }, { rotulo: "o sofá", cats: ["sofa-3-lugares", "sofa-2-lugares"] });
      if (rs) sofa = { B: rs.B, r: rs.r, L: rs.peca.L, P: rs.peca.P, zs: rs.zs };
    }
    /* 3. TV pela distância: diagonal × 1,2 a 2,5 (sala-tv-multiplicador-diagonal), centro a 1,10 m (ra-tv-centro) */
    if (sofa && !jaTem(ctx, "tv", ["tv"])) {
      var dv = sofa.zs, tvs = pecasDe("tv").filter(function (p) { var dg = diagTv(p); return dg && dv >= dg * CV("tvMin") - EPS && dv <= dg * CV("tvMax") + EPS && p.L <= rack.L + 0.6; });
      tvs.sort(function (a, b) { return Math.abs(diagTv(a) * CV("tvIdeal") - dv) - Math.abs(diagTv(b) * CV("tvIdeal") - dv) || (ctx.o.padrao === "alto" ? diagTv(b) - diagTv(a) : diagTv(a) - diagTv(b)); });
      var ltv = tvs.slice(0, 4).map(function (p) { return infoPeca(ctx, "tv", p, "estilo", "a diagonal mais perto de " + f2(dv) + " ÷ " + f2(CV("tvIdeal")) + " (distância ideal)"); });
      tentar(ctx, "tv", ltv, function (pc) {
        var dy = CV("tvCentro") - pc.A / 2;
        return { peca: pc, grupo: G, dy: dy, regras: ["tvCentro", "tvIdeal", rq("tvMin", "distância sofá–TV " + f2(dv) + " m dentro de " + f2(diagTv(pc.p) * CV("tvMin")) + "–" + f2(diagTv(pc.p) * CV("tvMax")) + " m (sala-tv-multiplicador-diagonal)")], solta: function () {
          /* na parede, sobre o rack (ou na frente do painel dele): o rack não conta como colisão */
          var B = noMundo(rack.B, rack.r, 0, rack.A > 1.0 ? 0.05 : 0), c = { fp: obb(B, rack.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: dy, y1: dy + pc.A, usos: [], grupo: G, nome: pc.nome, zonaPts: z.pts, semAcesso: true, ignorar: [rack.id] };
          var e = validar(ctx, c); return e ? { falha: e } : { B: B, r: rack.r, c: c };
        } };
      }, { rotulo: "a TV", cats: ["tv"] });
      if (!ltv.length) ctx.pend.push({ ambiente: ctx.amb.id, slot: "tv", texto: "\"" + ctx.amb.nome + "\": nenhuma TV do catálogo fica a " + f2(dv) + " m dentro da faixa diagonal × " + f2(CV("tvMin")) + "–" + f2(CV("tvMax")) + " (sala-tv-multiplicador-diagonal)." });
    }
    /* 4. mesa de centro: ≈ 2/3 do sofá, a 0,40 m dele (sala-sofa-mesa-centro) e ≥ 0,60 m do móvel da TV (sala-mesa-centro-tv) */
    var mesa = null;
    if (sofa && !jaTem(ctx, "mesa-centro", ["mesa-centro"])) {
      var vao = sofa.zs - rack.P - CV("mesaTv") - CV("sofaMesaMin");
      var rm = tentar(ctx, "mesa-centro", escolher(ctx, ["mesa-centro"], { alvoL: sofa.L * CV("mesaSofaProp"), maxP: vao, maxL: sofa.L }), function (pc) {
        return { peca: pc, grupo: G, regras: ["sofaMesa", "mesaTv", "mesaSofaProp"], solta: function () {
          var fr = Math.min(CV("sofaMesa"), sofa.zs - rack.P - CV("mesaTv") - pc.P), zc = sofa.zs - fr - pc.P;
          if (fr < CV("sofaMesaMin") - EPS) return { falha: M("circulacao", "não sobra " + f2(CV("sofaMesaMin")) + " m entre a mesa e o sofá", "sofaMesaMin") };
          var B = noMundo(rack.B, rack.r, 0, zc), c = { fp: obb(B, rack.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, usos: [], grupo: G, nome: pc.nome, zonaPts: z.pts, semAcesso: true };
          var e = tentarSolta(ctx, c); return e ? { falha: e } : { B: B, r: rack.r, c: c };
        } };
      }, { rotulo: "a mesa de centro", cats: ["mesa-centro"] });
      if (rm) mesa = { B: rm.B, L: rm.peca.L, P: rm.peca.P };
    }
    if (!ctx.o.opcionais || !sofa) return;
    /* 5. tapete sob a frente do sofá e a mesa (PADROES 3.1 [P]) — camada leve */
    if (!jaTem(ctx, "tapete", ["tapete"])) {
      var prof = sofa.zs - rack.P - 0.1 + 0.25;
      tentar(ctx, "tapete", escolher(ctx, ["tapete"], { maxL: sofa.L + 0.6, maxP: prof, ordem: "larga" }), function (pc) {
        return { peca: pc, leve: true, regras: [{ regra: "PADROES 3.1", nivel: "P", texto: "tapete sob a frente do sofá, 20–30 cm de cada lado", fonte: "PADROES-AMBIENTES 3.1 — prática" }], solta: function () {
          var z1 = sofa.zs + 0.25, B = noMundo(rack.B, rack.r, 0, z1 - pc.P), c = { fp: obb(B, rack.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, leve: true, usos: [], nome: pc.nome, zonaPts: z.pts, semAcesso: true };
          var e = validar(ctx, c); return e ? { falha: e } : { B: B, r: rack.r, c: c };
        } };
      }, { rotulo: "o tapete", opcional: true });
    }
    /* 6. poltrona ao lado da mesa de centro, virada para ela */
    if (!jaTem(ctx, "poltrona", ["poltrona"])) {
      /* ⚠ REVISÃO (21/10/2026): a poltrona tem grupo PRÓPRIO — no grupo do estar a faixa da frente do rack (sala-mesa-centro-tv)
         não era conferida para ela, e a poltrona encostava a 0,46 m do móvel da TV (o auditor reprovava o layout do motor) */
      var GP = grupo(ctx, "pol");
      tentar(ctx, "poltrona", escolher(ctx, ["poltrona"], {}), function (pc) {
        return { peca: pc, grupo: GP, regras: ["circPrincipal"], solta: function () {
          var zc = mesa ? dot(sub(mesa.B, rack.B), n) + mesa.P / 2 : sofa.zs - 0.6, mot = null;
          for (var ld = -1; ld <= 1; ld += 2) {
            /* virada para a mesa: a frente (+Z local) aponta para o eixo da sala (−ld no X do rack) */
            var lx = ld * (Math.max(sofa.L / 2, mesa ? mesa.L / 2 + 0.5 : 0) + 0.15 + pc.P / 2), cen = noMundo(rack.B, rack.r, lx, zc), r = rack.r - ld * Math.PI / 2, B = noMundo(cen, r, 0, -pc.P / 2);
            var c = { fp: obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, usos: [], grupo: GP, nome: pc.nome, zonaPts: z.pts };
            var e = tentarSolta(ctx, c); if (!e) return { B: B, r: r, c: c }; if (!mot) mot = e;
          }
          return { falha: mot };
        } };
      }, { rotulo: "a poltrona", opcional: true });
    }
    /* 7. aparador numa parede que sobrou */
    if (!jaTem(ctx, "aparador", ["aparador", "buffet-bar"])) {
      tentar(ctx, "aparador", escolher(ctx, ["aparador"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "apa"), zonaPts: z.pts, regras: ["circPrincipal"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, cp, "circPrincipal", "frente do aparador")]; } }; }, { rotulo: "o aparador", opcional: true });
    }
  }
  /* ---- MESA CENTRAL + CADEIRAS (jantar, reunião, gourmet) */
  function lugaresDe(cat, p) { var m = /(\d+)(-lugares)?$/.exec(cat); if (/mesa-(jantar|reuniao)/.test(cat) && m) return +m[1]; return null; }
  function mesaCentral(ctx, z, sp) {
    var G = grupo(ctx, sp.grupo), f = CV(sp.folga), q = z.quadro, pes = CV("jantarPessoa");
    var mesa = null, ex = jaTem(ctx, sp.slot, sp.cats);
    if (ex && !ex.apagada) { var pq = FC() && FC().peca ? FC().peca(ex.tipoId) : null; mesa = { id: ex.id, B: ex.B, r: ex.r, L: ex.L, P: ex.P, cen: true, lug: sp.lugares || lugaresDe(ex.cat) || 4, peca: { nome: pq ? pq.n : ex.nome } }; }
    else if (!ex) {
      var lista = escolher(ctx, sp.cats, { maxL: Math.max(q.lu, q.lv) - 2 * f, maxP: Math.min(q.lu, q.lv) - 2 * f, filtro: sp.filtroMesa });
      var res = tentar(ctx, sp.slot, lista, function (pc) {
        return { peca: pc, grupo: G, regras: [sp.folga, "jantarPessoa"].concat(sp.regras || []), solta: function () {
          var mot = null, eixos = q.lu >= q.lv ? [q.d] : [[-q.d[1], q.d[0]]];
          eixos.push([-eixos[0][1], eixos[0][0]]);
          var cs = [q.centro];
          [0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.5, -0.5].forEach(function (k) { cs.push(add(q.centro, q.d, k)); cs.push(add(q.centro, [-q.d[1], q.d[0]], k)); });
          for (var ie = 0; ie < eixos.length; ie++) for (var ic = 0; ic < cs.length; ic++) {
            var ax = eixos[ie], r = Math.atan2(-ax[1], ax[0]);   /* X local (cos θ, −sen θ) = o eixo comprido */
            var B = noMundo(cs[ic], r, 0, -pc.P / 2);
            var c = { fp: obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, grupo: G, nome: pc.nome, zonaPts: z.pts,
              usos: [(function () { var x = uso(B, r, -pc.L / 2 - f, pc.L / 2 + f, -f, pc.P + f, sp.folga, sp.rotFolga || "em volta da mesa"); x.prof = f; return x; })()] };
            var e = tentarSolta(ctx, c); if (!e) return { B: B, r: r, c: c }; if (!mot) mot = e;
          }
          return { falha: mot };
        } };
      }, { rotulo: sp.rotulo, cats: sp.cats });
      if (res) mesa = { id: res.item.id, B: res.B, r: res.r, L: res.peca.L, P: res.peca.P, peca: res.peca, lug: sp.lugares || lugaresDe(res.peca.cat) || Math.max(2, 2 * Math.floor(res.peca.L / pes)) };
    }
    if (!mesa) return null;
    /* cadeiras: comprimento ÷ 0,60 por lado (jantar-largura-por-pessoa); redonda = em volta */
    /* CONJUNTO (mesa + cadeiras num preço só, ex.: "Conjunto 1 mesa e 4 cadeiras"): as cadeiras já estão no preço da mesa —
       lançar cadeira avulsa cobraria duas vezes. Fica a nota (o desenho mostra só a mesa). */
    if (mesa.peca && conjuntoMesa(mesa.peca.nome) > 0) {
      ctx.itens.push({ id: null, tipo: "conjunto", ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, texto: "\"" + ctx.amb.nome + "\": " + mesa.peca.nome + " — as cadeiras estão no preço do conjunto (não lancei cadeira avulsa, para não cobrar duas vezes)" });
      /* ⚠ REVISÃO (21/10/2026): a mesa trocada por um conjunto DEPOIS do motor ficava com as cadeiras avulsas automáticas —
         cadeiras cobradas duas vezes. Rodando de novo, as avulsas automáticas que ninguém mexeu saem (no mesmo lote: Ctrl+Z volta) */
      var prefC = PREF + ctx.amb.id + "-" + sp.slotCadeira + "-";
      ctx.existentes = ctx.existentes.filter(function (e) {
        if (!e.auto || String(e.id).indexOf(prefC) !== 0 || ctx.hist.mexidas[e.id]) return true;
        ctx.ops.push({ op: "apagar", id: e.id }); ctx.obst = ctx.obst.filter(function (o) { return o.id !== e.id; });
        ctx.itens.push({ id: e.id, tipo: "removido", ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: String(e.id).slice(PREF.length + String(ctx.amb.id).length + 1), texto: "\"" + ctx.amb.nome + "\": tirei " + e.nome + " avulsa — a mesa " + mesa.peca.nome + " já traz as cadeiras (não cobrar duas vezes)" });
        return false;
      });
      return mesa;
    }
    /* ⚠ REVISÃO (21/10/2026): REDONDA pelo nome (a de 1,35 × 1,35 "Allure" é QUADRADA). As cadeiras em volta da redonda batiam na
       CAIXA quadrada da mesa (a 45° o canto da caixa passa do tampo) e caíam todas: a sala de jantar econômica saía com a mesa e
       nenhuma cadeira no orçamento. A cadeira da redonda confere o TAMPO (círculo), não a caixa; a quadrada vai pelos lados. */
    var redonda = mesaRedonda(mesa.L, mesa.P, mesa.peca && mesa.peca.nome), porLado = Math.max(1, Math.floor(mesa.L / pes + 1e-6)), pos = [], lug = mesa.lug;
    var listaC = escolher(ctx, sp.cadeiras, { filtro: sp.filtroCadeira, maxL: pes });
    if (!listaC.length) { ctx.pend.push({ ambiente: ctx.amb.id, slot: "cadeira", texto: "\"" + ctx.amb.nome + "\": nenhuma cadeira do catálogo com até " + f2(pes) + " m de largura." }); return mesa; }
    var cad = listaC[0];
    if (redonda) for (var i = 0; i < lug; i++) { var a = 2 * Math.PI * i / lug + Math.PI / lug * (lug === 4 ? 1 : 0); pos.push({ dir: [Math.cos(a), Math.sin(a)], d: mesa.L / 2 + 0.05 + cad.P / 2 }); }
    else {
      var k1 = Math.min(porLado, Math.ceil(lug / 2)), cab = Math.max(0, Math.min(2, lug - 2 * k1));
      [-1, 1].forEach(function (sd) { for (var j = 0; j < k1; j++) pos.push({ lx: -mesa.L / 2 + mesa.L / k1 * (j + 0.5), lz: sd < 0 ? -0.05 - cad.P / 2 : mesa.P + 0.05 + cad.P / 2, para: sd < 0 ? 0 : Math.PI }); });
      if (cab > 0) pos.push({ lx: -mesa.L / 2 - 0.05 - cad.P / 2, lz: mesa.P / 2, para: Math.PI / 2 });
      if (cab > 1) pos.push({ lx: mesa.L / 2 + 0.05 + cad.P / 2, lz: mesa.P / 2, para: -Math.PI / 2 });
    }
    var mc = noMundo(mesa.B, mesa.r, 0, mesa.P / 2), n = 0;
    pos.forEach(function (q2, k) {
      var slot = sp.slotCadeira + "-" + (k + 1); if (jaTem(ctx, slot, null)) { n++; return; }
      var cen = redonda ? add(mc, q2.dir, q2.d) : noMundo(mesa.B, mesa.r, q2.lx, q2.lz), dirM = sub(mc, cen), r = redonda ? Math.atan2(dirM[0], dirM[1]) : mesa.r + q2.para;
      /* ⚠ a cadeira também confere a passagem: as de cabeceira trancavam a sala integrada (porta → estar) e passavam (21/10/2026) */
      var B = noMundo(cen, r, 0, -cad.P / 2), c = { fp: obb(B, r, -cad.L / 2, cad.L / 2, 0, cad.P), y0: 0, y1: cad.A, usos: [], grupo: G, nome: cad.nome, zonaPts: z.pts, ignorar: redonda && mesa.id ? [mesa.id] : null };
      var e = redonda && obbNoCirculo(c.fp, mc, mesa.L / 2) ? M("colisao", "bate no tampo da mesa") : tentarSolta(ctx, c);
      if (e) { ctx.reduzidos.push({ ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: slot, texto: "\"" + ctx.amb.nome + "\": tirei a cadeira " + (k + 1) + " — " + e.texto }); return; }
      registrar(ctx, slot, cad, { B: B, r: r, c: c }, [rq("jantarPessoa", "1 lugar a cada " + f2(pes) + " m de mesa (jantar-largura-por-pessoa)")], { grupo: G });
      n++;
    });
    if (n < 2) ctx.pend.push({ ambiente: ctx.amb.id, slot: sp.slotCadeira, texto: "\"" + ctx.amb.nome + "\": só " + n + " cadeira(s) couberam em volta da mesa." });
    return mesa;
  }
  function planoJantar(ctx, z) {
    z = z || ctx.zona;
    var pad = ctx.o.padrao, cats = pad === "alto" ? ["mesa-jantar-8", "mesa-jantar-6", "mesa-jantar-4"] : (pad === "economico" ? ["mesa-jantar-4", "mesa-jantar-6"] : ["mesa-jantar-6", "mesa-jantar-4"]);
    var m = mesaCentral(ctx, z, { slot: "mesa", cats: cats, cadeiras: ["cadeira-jantar"], slotCadeira: "cadeira", grupo: "jantar", folga: "jantarParede", rotulo: "a mesa de jantar", regras: ["jantar-altura-mesa"] });
    if (m && ctx.o.opcionais && !jaTem(ctx, "buffet", ["buffet-bar", "aparador"])) {
      tentar(ctx, "buffet", escolher(ctx, ["buffet-bar", "aparador"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "buf"), zonaPts: z.pts, regras: ["jantarParede"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, CV("circDorm"), "circDorm", "frente do buffet")]; } }; }, { rotulo: "o buffet", opcional: true });
    }
  }
  /* ---- ESTAR/JANTAR INTEGRADO (PADROES 3.3): duas zonas pelo eixo maior; estar do lado da janela maior */
  function planoIntegrado(ctx) {
    var q = ctx.geo.quadro, ax = q.lu >= q.lv ? q.d : [-q.d[1], q.d[0]], P = ctx.geo.pts;
    var h1 = cortarMeio(P, q.centro, ax), h2 = cortarMeio(P, q.centro, [-ax[0], -ax[1]]);
    if (h1.length < 3 || h2.length < 3) { planoSala(ctx); return; }
    var z1 = geometria(ctx.amb, ctx.L, h1), z2 = geometria(ctx.amb, ctx.L, h2);
    function jan(z) { var s = 0; z.edges.forEach(function (ed) { ed.janelas.forEach(function (j) { s += j.s1 - j.s0; }); }); return s; }
    var estar = jan(z1) >= jan(z2) ? z1 : z2, jantar = estar === z1 ? z2 : z1;
    ctx.itens.push({ id: null, tipo: "zona", ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, texto: "estar/jantar: dividi pelo eixo maior — estar do lado da janela maior (PADROES 3.3 [P])" });
    planoSala(ctx, estar); planoJantar(ctx, jantar);
  }
  /* ---- COZINHA (PADROES 3.4): fila linear — geladeira na ponta da porta, fogão entre ela e a pia, base planejada, aéreo, coifa */
  function planoCozinha(ctx) {
    var z = ctx.zona, cc = CV("cozCorredor"), triMin = CV("cozTriMin"), G = grupo(ctx, "coz");
    var temBase = jaTem(ctx, "base-2", ["planejado-base"]), temGel = temBase ? jaTem(ctx, "geladeira", ["geladeira"]) : null;
    if (temBase && temGel) return;
    var lg = escolher(ctx, ["geladeira"], { n: 3 }), lf = escolher(ctx, ["fogao-cooktop"], { n: 3, filtro: function (p) { return p.A >= 0.8; } });
    if (!lg.length || !lf.length) { ctx.pend.push({ ambiente: ctx.amb.id, slot: "cozinha", texto: "\"" + ctx.amb.nome + "\": sem geladeira/fogão no catálogo." }); return; }
    var gel = lg[0], fog = lf[0], pB = planejado(ctx, "base", 1, {}), Pb = pB ? pB.P : 0.52, Pmax = Math.max(Pb, gel.P, fog.P);
    /* base 1 (geladeira → fogão): o apoio da geladeira e do fogão e o lado mínimo do triângulo; base 2: a pia a xPia da borda do fogão */
    var b1 = Math.max(0.40, CV("cozGelApoio"), CV("cozCooktopApoio"), triMin - gel.L / 2 - fog.L / 2);
    var xPia = Math.max(CV("cozPiaApoio1"), triMin - fog.L / 2), b2min = xPia + CV("cozPiaApoio2");
    var need = gel.L + b1 + fog.L + b2min, melhor = null;
    /* a parede: o trecho livre mais comprido (sem porta); a geladeira na ponta mais perto da porta e nunca na frente da janela */
    z.edges.forEach(function (ed) {
      livres(ed, 0, 0.9).forEach(function (iv) {
        var len = iv[1] - iv[0]; if (len < need - EPS) return;
        [1, -1].forEach(function (sent) {
          var s0 = sent > 0 ? iv[0] : iv[1], g0 = Math.min(s0, s0 + sent * gel.L), g1 = Math.max(s0, s0 + sent * gel.L);
          if (ed.janelas.some(function (j) { return gel.A > j.peitoril - 0.02 && j.s0 < g1 && j.s1 > g0; })) return;
          /* a geladeira nessa ponta não pode cair na faixa da janela da parede do canto nem na porta; a fila inteira precisa do corredor */
          var Bg = add(add(ed.a, ed.d, s0 + sent * gel.L / 2), ed.n, 0.003);
          if (validar(ctx, { fp: obb(Bg, ed.r, -gel.L / 2, gel.L / 2, 0, gel.P), y0: 0, y1: gel.A, usos: [], grupo: G, nome: gel.nome, zonaPts: z.pts })) return;
          var Bm = add(add(ed.a, ed.d, s0 + sent * len / 2), ed.n, 0.003), Pm = Math.max(Pb, gel.P, fog.P);
          if (!dentroUso(ctx, obb(Bm, ed.r, -len / 2, len / 2, Pm, Pm + cc))) return;
          var m = Infinity; ctx.z.portas.forEach(function (p) { m = Math.min(m, comp(sub(add(ed.a, ed.d, s0), p.obb.c))); });
          var sc = len - (isFinite(m) ? m * 0.3 : 0);
          if (!melhor || sc > melhor.sc) melhor = { ed: ed, iv: iv, sent: sent, s0: s0, len: len, sc: sc };
        });
      });
    });
    if (!melhor) { ctx.pend.push({ ambiente: ctx.amb.id, slot: "cozinha", texto: "\"" + ctx.amb.nome + "\": nenhuma parede livre de " + f2(need) + " m para geladeira + " + f2(b1) + " m + fogão + " + f2(b2min) + " m de bancada (coz-nkba-triangulo-lado " + f2(triMin) + " m; coz-nkba-pia-apoio) — a fila linear não cabe. Ajuste a planta ou lance à mão." }); return; }
    var ed = melhor.ed, sent = melhor.sent, s0 = melhor.s0, b2 = melhor.len - gel.L - b1 - fog.L;
    function Bem(s) { return add(add(ed.a, ed.d, s), ed.n, 0.003); }
    function sAt(off, w) { return s0 + sent * (off + w / 2); }
    /* o lado ESQUERDO do armário (−X local) fica no começo da fila quando o X local aponta no sentido da fila */
    var esqNoInicio = dot(eixoU(ed.r), ed.d) * sent > 0, fimNoCanto = cantoParede(ed, melhor.iv, sent);
    var segs = [{ slot: "geladeira", pc: gel, off: 0 }, { slot: "base-1", larg: b1, off: gel.L }, { slot: "fogao", pc: fog, off: gel.L + b1 }, { slot: "base-2", larg: b2, off: gel.L + b1 + fog.L, fim: true }];
    var usoFila = uso(Bem(s0 + sent * melhor.len / 2), ed.r, -melhor.len / 2, melhor.len / 2, Pmax, Pmax + cc, "cozCorredor", "corredor de trabalho"); usoFila.prof = cc;
    ctx.alvos.push({ nome: "a fila da cozinha", usos: [usoFila] });
    segs.forEach(function (sg, k) {
      if (jaTem(ctx, sg.slot, sg.pc ? [sg.pc.cat] : ["planejado-base"])) return;
      var pc = sg.pc;
      if (!pc) { var encFim = !!sg.fim && fimNoCanto; pc = planejado(ctx, "base", sg.larg, { Gaveteiro: !!sg.fim, Parede_esquerda: esqNoInicio ? false : encFim, Parede_direita: esqNoInicio ? encFim : false }); }
      var s = sAt(sg.off, pc.L), B = Bem(s), c = { fp: obb(B, ed.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: num(pc.y0, 0), y1: num(pc.y0, 0) + pc.A, usos: [usoFila], grupo: G, nome: pc.nome, zonaPts: z.pts };
      var e = tentarSolta(ctx, c);
      if (e) { ctx.pend.push({ ambiente: ctx.amb.id, slot: sg.slot, texto: "\"" + ctx.amb.nome + "\": " + pc.nome + " (obrigatório) não coube na fila — " + e.texto + "." }); return; }
      var regs = ["cozCorredor", "cozTriMin"];
      if (sg.slot === "base-1") regs = regs.concat(["cozGelApoio", "cozCooktopApoio"]);
      if (sg.slot === "base-2") regs = regs.concat(["cozPiaApoio1", "cozPiaApoio2", rq("cozTriMin", "pia a " + f2(xPia) + " m da borda do fogão (ponto na base; a cuba é da bancada — ra-pia-cuba [?])")]);
      if (sg.slot === "geladeira") regs.push({ regra: "PADROES 3.4", nivel: "P", texto: "geladeira na ponta da bancada, junto à porta", fonte: "PADROES-AMBIENTES 3.4" });
      registrar(ctx, sg.slot, pc, { B: B, r: ed.r, c: c }, regs, { grupo: G });
    });
    /* triângulo pia–fogão–geladeira (coz-nkba-triangulo-lado / -soma) com a pia no ponto da base: xPia além da borda do fogão */
    var pG = Bem(sAt(0, gel.L)), pF = Bem(sAt(gel.L + b1, fog.L)), pPia = Bem(s0 + sent * (gel.L + b1 + fog.L + xPia));
    var lados = [comp(sub(pG, pF)), comp(sub(pF, pPia)), comp(sub(pPia, pG))], soma = lados[0] + lados[1] + lados[2];
    var ok = lados.every(function (x) { return x >= triMin - 0.01 && x <= CV("cozTriMax") + 0.01; }) && soma <= CV("cozTriSoma") + 0.01;
    ctx.itens.push({ id: null, tipo: "triangulo", ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, lados: lados.map(r4), soma: r4(soma), ok: ok, pia: [r4(pPia[0]), r4(pPia[1])],
      texto: "triângulo geladeira–fogão–pia: " + lados.map(f2).join(" / ") + " m (soma " + f2(soma) + ") — " + (ok ? "dentro de" : "FORA de") + " " + f2(triMin) + "–" + f2(CV("cozTriMax")) + " m e soma ≤ " + f2(CV("cozTriSoma")) + " (coz-nkba-triangulo-lado, -soma [L])" });
    if (!ok) ctx.avisos.push("\"" + ctx.amb.nome + "\": triângulo da cozinha fora da faixa — " + lados.map(f2).join(" / ") + " m (coz-nkba-triangulo-lado).");
    ctx.pend.push({ ambiente: ctx.amb.id, slot: "bancada", texto: "\"" + ctx.amb.nome + "\": a cuba e o tampo de pedra não são lançados aqui — use Bancadas/Marmoraria sobre a base planejada (a pia no ponto a " + f2(xPia) + " m da borda do fogão)." });
    /* coifa sobre o fogão (coz-br-bancada-ilha-circulacao: 0,75 m acima da bancada) */
    var sF = sAt(gel.L + b1, fog.L), cofL = 0;
    if (!jaTem(ctx, "coifa", ["coifa-depurador"])) {
      var rc = tentar(ctx, "coifa", escolher(ctx, ["coifa-depurador"], { n: 3 }), function (pc) {
        var dy = CV("cozBancada") + CV("cozCoifa");
        return { peca: pc, grupo: G, dy: dy, regras: ["cozCoifa", "cozBancada"], solta: function () {
          var B = Bem(sF), c = { fp: obb(B, ed.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: dy, y1: dy + pc.A, usos: [], grupo: G, nome: pc.nome, zonaPts: z.pts, semAcesso: true };
          var e = validar(ctx, c); return e ? { falha: e } : { B: B, r: ed.r, c: c };
        } };
      }, { rotulo: "a coifa" });
      if (rc) cofL = rc.peca.L;
    }
    /* aéreo planejado sobre as bases, fora da coifa e da janela (coz-br-vao-bancada-aereo: bancada 0,90 + 0,60) */
    if (!ctx.o.opcionais) return;
    var aereoY = CV("cozBancada") + CV("cozVaoAereo"), pA = planejado(ctx, "aereo", 1, {}), yA1 = aereoY + (pA ? pA.A : 0.7);
    var cof = Math.max(cofL, fog.L), sCof0 = gel.L + b1 + fog.L / 2 - cof / 2, livresA = [];
    [[gel.L, gel.L + b1], [gel.L + b1 + fog.L, melhor.len]].forEach(function (x) { tirar([x], sCof0, sCof0 + cof).forEach(function (y) { livresA.push(y); }); });
    ed.janelas.forEach(function (j) {
      if (!(yA1 > j.peitoril && aereoY < j.topo)) return;
      var a0 = sent > 0 ? j.s0 - s0 : s0 - j.s1, a1 = sent > 0 ? j.s1 - s0 : s0 - j.s0, nv = [];
      livresA.forEach(function (y) { tirar([y], a0, a1).forEach(function (q) { nv.push(q); }); }); livresA = nv;
    });
    livresA.filter(function (x) { return x[1] - x[0] >= 0.30; }).forEach(function (x, k) {
      var slot = "aereo-" + (k + 1); if (jaTem(ctx, slot, null)) return;
      var pc = planejado(ctx, "aereo", Math.floor((x[1] - x[0]) * 100) / 100, { Altura_instalacao: r4(aereoY), Parede_esquerda: false, Parede_direita: false }); if (!pc) return;
      pc.y0 = aereoY; pc.yFam = aereoY;   /* a família desenha a partir da altura de instalação: a instância fica no piso */
      var B = Bem(sAt(x[0], pc.L)), c = { fp: obb(B, ed.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: aereoY, y1: aereoY + pc.A, usos: [], grupo: G, nome: pc.nome, zonaPts: z.pts, semAcesso: true };
      var e = validar(ctx, c); if (e) { ctx.reduzidos.push({ ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: slot, opcional: true, texto: "\"" + ctx.amb.nome + "\": tirei o aéreo " + (k + 1) + " — " + e.texto }); return; }
      registrar(ctx, slot, pc, { B: B, r: ed.r, c: c }, ["cozVaoAereo", "cozBancada"], { grupo: G, opcional: true });
    });
  }
  /* a ponta da fila encosta na parede do canto (o planejado faz o tamponamento só do lado com parede) */
  function cantoParede(ed, iv, sent) { var sF = sent > 0 ? iv[1] : iv[0]; return sF < 0.02 || sF > ed.len - 0.02; }
  /* ---- LAVANDERIA (PADROES 3.7): tanque e máquina lado a lado */
  function planoLavanderia(ctx) {
    var z = ctx.zona, fr = CV("lavFrente"), G = grupo(ctx, "lav");
    var lt = escolher(ctx, ["tanque-lavanderia-gabinete"], { n: 3 }), lm = escolher(ctx, ["lava-seca-maquina"], { n: 3 });
    var t0 = jaTem(ctx, "tanque", ["tanque-lavanderia-gabinete"]), m0 = jaTem(ctx, "maquina", ["lava-seca-maquina"]);
    var rt = null;
    if (!t0 && lt.length) rt = tentar(ctx, "tanque", lt, function (pc) { return { peca: pc, grupo: G, zonaPts: z.pts, regras: ["lavFrente"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, fr, "lavFrente", "frente do tanque")]; },
      score: function (ed, s, iv) { return Math.min(s - iv[0], iv[1] - s) < pc.L / 2 + 0.05 ? 2 : 0; } }; }, { rotulo: "o tanque", cats: ["tanque-lavanderia-gabinete"] });
    /* ⚠ grupo PRÓPRIO: a máquina não pode entrar na faixa da frente do tanque (com o mesmo grupo a faixa não era conferida) */
    if (!m0 && lm.length) tentar(ctx, "maquina", lm, function (pc) {
      return { peca: pc, grupo: grupo(ctx, "maq"), zonaPts: z.pts, regras: ["lavFrente", { regra: "PADROES 3.7", nivel: "P", texto: "máquina ao lado do tanque", fonte: "PADROES-AMBIENTES 3.7" }], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, fr, "lavFrente", "frente da máquina")]; },
        score: function (ed, s, iv, B) { return rt ? -comp(sub(B, rt.B)) * 2 : 0; } };
    }, { rotulo: "a lava e seca", cats: ["lava-seca-maquina"] });
  }
  /* ---- ESCRITÓRIO / HOME OFFICE (PADROES 3.13 e 4.1) */
  function planoHomeOffice(ctx) {
    mesaTrabalho(ctx, ["escrivaninha-home-office", "mesa-escritorio-reta-L"], false);
    if (ctx.o.opcionais && !jaTem(ctx, "estante", ["estante-livros", "estante-industrial-metal", "nicho-prateleira-modular"])) {
      var cats = ctx.o.estilo === "industrial" ? ["estante-industrial-metal", "estante-livros"] : ["estante-livros", "estante-industrial-metal"];
      tentar(ctx, "estante", escolher(ctx, cats, {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "est"), zonaPts: ctx.zona.pts, regras: [rq("circDorm", "0,60 m livres na frente (dorm-circulacao-minima, por analogia)")], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, CV("circDorm"), "circDorm", "frente da estante")]; } }; }, { rotulo: "a estante", opcional: true });
    }
  }
  function planoEscritorio(ctx) {
    var r1 = mesaTrabalho(ctx, ["mesa-escritorio-reta-L", "escrivaninha-home-office"], false);
    if (r1 && !jaTem(ctx, "gaveteiro", ["gaveteiro-arquivo"])) {
      tentar(ctx, "gaveteiro", escolher(ctx, ["gaveteiro-arquivo"], {}), function (pc) {
        return { peca: pc, grupo: grupo(ctx, "trab"), regras: [{ regra: "PADROES 4.1", nivel: "P", texto: "gaveteiro por posto, ao lado da mesa", fonte: "PADROES-AMBIENTES 4.1" }], solta: function () {
          var mot = null; for (var ld = 1; ld >= -1; ld -= 2) { var B = noMundo(r1.B, r1.r, ld * (r1.peca.L / 2 + pc.L / 2 + 0.02), 0), c = { fp: obb(B, r1.r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, usos: [], grupo: grupo(ctx, "trab"), nome: pc.nome, zonaPts: ctx.zona.pts, semAcesso: true };
            var e = tentarSolta(ctx, c); if (!e) return { B: B, r: r1.r, c: c }; if (!mot) mot = e; }
          return { falha: mot };
        } };
      }, { rotulo: "o gaveteiro", cats: ["gaveteiro-arquivo"] });
    }
    if (!jaTem(ctx, "armario", ["armario-baixo-escritorio"])) {
      tentar(ctx, "armario", escolher(ctx, ["armario-baixo-escritorio"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "arm"), zonaPts: ctx.zona.pts, regras: ["circPrincipal"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, CV("circPrincipal"), "circPrincipal", "frente do armário")]; } }; }, { rotulo: "o armário baixo", cats: ["armario-baixo-escritorio"] });
    }
    ctx.avisos.push("\"" + ctx.amb.nome + "\": 1 posto de trabalho lançado — m² por posto não tem fonte na pesquisa (esc-area-posto-trabalho, sem fonte); acrescente postos à mão.");
  }
  function planoReuniao(ctx) {
    var cats = ["mesa-reuniao-10-lugares", "mesa-reuniao-8-lugares", "mesa-reuniao-6-lugares", "mesa-reuniao-4-lugares"];
    if (ctx.o.padrao === "economico") cats = cats.slice(2);
    mesaCentral(ctx, ctx.zona, { slot: "mesa", cats: cats, cadeiras: ["cadeira-escritorio-giratoria"], slotCadeira: "cadeira", grupo: "reuniao", folga: "jantarParede", rotFolga: "em volta da mesa (jantar-mesa-parede, por analogia)", rotulo: "a mesa de reunião" });
    if (ctx.o.opcionais && !jaTem(ctx, "armario", ["armario-baixo-escritorio"])) {
      tentar(ctx, "armario", escolher(ctx, ["armario-baixo-escritorio"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "arm"), zonaPts: ctx.zona.pts, regras: ["circPrincipal"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, CV("circPrincipal"), "circPrincipal", "frente do armário")]; } }; }, { rotulo: "o armário baixo", opcional: true });
    }
  }
  /* ---- mesa/balcão AFASTADO da parede: o atendente senta entre ele e a parede (recepção, consultório).
     A busca usa a pegada com o espaço do atendente atrás (ra-recepcao-atras [P]); a peça vai para a frente desse espaço, virada
     para o salão, e o espaço fica reservado (faixa de uso do grupo: nenhuma outra peça entra nele). */
  function balcaoAfastado(ctx, slot, cats, frente, critFrente, rot, score) {
    var atras = CV("recepcaoAtras"), G = grupo(ctx, slot), lista = escolher(ctx, cats, {}), primeiro = null;
    for (var i = 0; i < lista.length; i++) {
      var pc = lista[i], pseudo = { L: pc.L, P: pc.P + atras, A: pc.A, nome: pc.nome };
      var res = buscarParede(ctx, { peca: pseudo, grupo: G, zonaPts: ctx.zona.pts, score: score, usos: function (B, r) { return [usoF(B, r, pc.L, pc.P + atras, frente, critFrente, "frente do " + rot)]; } });
      if (res && !res.falha) {
        var B = noMundo(res.B, res.r, 0, atras), c = { fp: obb(B, res.r, -pc.L / 2, pc.L / 2, 0, pc.P), usos: res.c.usos };
        var it = registrar(ctx, slot, pc, { B: B, r: res.r, c: c }, ["recepcaoAtras", critFrente], { grupo: G });
        var ua = uso(res.B, res.r, -pc.L / 2, pc.L / 2, 0, atras, "recepcaoAtras", "espaço do atendente"); ua.prof = atras;
        ctx.usos.push({ obb: ua.obb, grupo: G, dono: pc.nome, id: it.id, prof: atras, crit: "recepcaoAtras", rotulo: "espaço do atendente" });
        if (i > 0 && primeiro) ctx.reduzidos.push({ ambiente: ctx.amb.id, ambienteNome: ctx.amb.nome, slot: slot, texto: "\"" + ctx.amb.nome + "\": troquei " + lista[0].nome + " por " + pc.nome + " — " + primeiro.texto });
        return { B: B, r: res.r, L: pc.L, P: pc.P, Bw: res.B, G: G };
      }
      if (!primeiro) primeiro = res.falha;
    }
    falhou(ctx, slot, { rotulo: "o " + rot }, primeiro ? primeiro.texto + (primeiro.crit ? " (" + MR().criterio(primeiro.crit).regra + ")" : "") : "nenhuma peça da categoria");
    return null;
  }
  function cadeiraAtendente(ctx, base, slot) {
    if (jaTem(ctx, slot, ["cadeira-escritorio-giratoria"])) return;
    tentar(ctx, slot, escolher(ctx, ["cadeira-escritorio-giratoria"], {}), function (pc) {
      return { peca: pc, grupo: base.G, regras: ["recepcaoAtras"], solta: function () {
        var cen = noMundo(base.Bw, base.r, 0, CV("recepcaoAtras") / 2), r = base.r, B = noMundo(cen, r, 0, -pc.P / 2);
        var c = { fp: obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, usos: [], grupo: base.G, nome: pc.nome, zonaPts: ctx.zona.pts, semAcesso: true };
        var e = tentarSolta(ctx, c); return e ? { falha: e } : { B: B, r: r, c: c };
      } };
    }, { rotulo: "a cadeira do atendente" });
  }
  function planoRecepcao(ctx) {
    var cats = ["balcao-recepcao"];
    if (!jaTem(ctx, "balcao", cats)) { var b = balcaoAfastado(ctx, "balcao", cats, CV("recepcaoCorredor"), "recepcaoCorredor", "balcão"); if (b) cadeiraAtendente(ctx, b, "cadeira"); }
    if (!jaTem(ctx, "longarina", ["sofa-espera-longarina"])) {
      tentar(ctx, "longarina", escolher(ctx, ["sofa-espera-longarina"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "esp"), zonaPts: ctx.zona.pts, regras: ["recepcaoCorredor", "cons-rdc50-recepcao-espera"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, CV("recepcaoCorredor"), "recepcaoCorredor", "frente da longarina")]; } }; }, { rotulo: "a longarina de espera", cats: ["sofa-espera-longarina"] });
    }
  }
  function planoConsultorio(ctx) {
    var a = ctx.geo.area, q = ctx.geo.quadro;
    if (a < CV("consultorioArea") - 0.01 || Math.min(q.lu, q.lv) < CV("consultorioLado") - 0.01) ctx.avisos.push("\"" + ctx.amb.nome + "\": " + f2(a) + " m² e lado " + f2(Math.min(q.lu, q.lv)) + " m — abaixo de " + f2(CV("consultorioArea")) + " m² / " + f2(CV("consultorioLado")) + " m (cons-rdc50-consultorio-indiferenciado, RDC 50).");
    var cats = ["escrivaninha-home-office"], base = null;
    /* a mesa num canto da parede (sobra a outra ponta para a maca) */
    if (!jaTem(ctx, "mesa", cats)) base = balcaoAfastado(ctx, "mesa", cats, CV("circPrincipal"), "circPrincipal", "mesa de atendimento", function (ed, s, iv) { return -Math.min(s - iv[0], iv[1] - s); });
    if (base) {
      cadeiraAtendente(ctx, base, "cadeira");
      [-1, 1].forEach(function (ld, k) {
        var slot = "visitante-" + (k + 1); if (jaTem(ctx, slot, ["cadeira-visitante-fixa"])) return;
        tentar(ctx, slot, escolher(ctx, ["cadeira-visitante-fixa"], {}), function (pc) {
          return { peca: pc, grupo: base.G, regras: ["circPrincipal"], solta: function () {
            var cen = noMundo(base.B, base.r, ld * base.L / 4, base.P + 0.05 + pc.P / 2), r = base.r + Math.PI, B = noMundo(cen, r, 0, -pc.P / 2);
            var c = { fp: obb(B, r, -pc.L / 2, pc.L / 2, 0, pc.P), y0: 0, y1: pc.A, usos: [], grupo: base.G, nome: pc.nome, zonaPts: ctx.zona.pts };
            var e = tentarSolta(ctx, c); return e ? { falha: e } : { B: B, r: r, c: c };
          } };
        }, { rotulo: "a cadeira de visitante" });
      });
    }
    /* a maca de COMPRIDO na parede, com a faixa de atendimento do lado livre, longe da mesa */
    if (!jaTem(ctx, "maca", ["maca-consultorio-mesa-clinica"])) macaNaParede(ctx, base);
  }
  /* a maca (família solta, comprimento no Z local): girada 90° para o comprimento correr na parede; a busca usa a pegada girada */
  function macaNaParede(ctx, base) {
    var lista = escolher(ctx, ["maca-consultorio-mesa-clinica"], {}), cp = CV("circPrincipal"), G = grupo(ctx, "maca"), primeiro = null;
    for (var i = 0; i < lista.length; i++) {
      var pc = lista[i], giro = { L: pc.P, P: pc.L, A: pc.A, nome: pc.nome };
      /* longe da mesa (a frente dela é dos visitantes) */
      var res = buscarParede(ctx, { peca: giro, grupo: G, zonaPts: ctx.zona.pts, score: function (ed, s, iv, B) { return base ? comp(sub(B, base.B)) : 0; }, usos: function (B, r) { return [usoF(B, r, pc.P, pc.L, cp, "circPrincipal", "lado do atendimento")]; } });
      if (res && !res.falha) {
        var r2 = res.r + Math.PI / 2, cen = noMundo(res.B, res.r, 0, pc.L / 2), B2 = noMundo(cen, r2, 0, -pc.P / 2);
        registrar(ctx, "maca", pc, { B: B2, r: r2, c: { fp: res.c.fp, usos: res.c.usos } }, ["circPrincipal", { regra: "PADROES 4.4", nivel: "?", texto: "maca do catálogo vem de anúncio de loja (provisória)", fonte: "PADROES-AMBIENTES 4.4" }], { grupo: G });
        return true;
      }
      if (!primeiro) primeiro = res.falha;
    }
    falhou(ctx, "maca", { rotulo: "a maca" }, primeiro ? primeiro.texto + (primeiro.crit ? " (" + MR().criterio(primeiro.crit).regra + ")" : "") : "nenhuma maca no catálogo");
    return false;
  }
  function planoLoja(ctx) {
    var fr = CV("lojaCorredor");
    if (!jaTem(ctx, "balcao", ["balcao-recepcao"])) {
      tentar(ctx, "balcao", escolher(ctx, ["balcao-recepcao"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "cx"), zonaPts: ctx.zona.pts, regras: ["lojaCorredor", "acess-9050-balcao-atendimento"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, fr, "lojaCorredor", "frente do caixa")]; },
        score: function (ed, s, iv, B) { var m = Infinity; ctx.z.portas.forEach(function (p) { m = Math.min(m, comp(sub(B, p.obb.c))); }); return isFinite(m) ? -m : 0; } }; }, { rotulo: "o balcão (caixa)", cats: ["balcao-recepcao"] });
    }
    [1, 2].forEach(function (k) {
      var slot = "vitrine-" + k; if (jaTem(ctx, slot, k === 1 ? ["vitrine-expositor-loja"] : null)) return;
      tentar(ctx, slot, escolher(ctx, ["vitrine-expositor-loja"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, slot), zonaPts: ctx.zona.pts, regras: ["lojaCorredor"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, fr, "lojaCorredor", "corredor de clientes")]; } }; }, { rotulo: "a vitrine", opcional: k > 1, cats: ["vitrine-expositor-loja"] });
    });
  }
  function planoHall(ctx) {
    if (!jaTem(ctx, "aparador", ["aparador"])) tentar(ctx, "aparador", escolher(ctx, ["aparador", "cabideiro-hall-banco-hall"], { maxP: CV("hallAparador") }), function (pc) {
      return { peca: pc, grupo: grupo(ctx, "apa"), zonaPts: ctx.zona.pts, regras: ["hallAparador", "circPrincipal"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, CV("circPrincipal"), "circPrincipal", "passagem do hall")]; } };
    }, { rotulo: "o aparador do hall", opcional: true });
  }
  function planoCloset(ctx) {
    var z = ctx.zona, fr = CV("closetCorredor");
    [1, 2].forEach(function (k) {
      var slot = "roupeiro-" + k; if (jaTem(ctx, slot, k === 1 ? ["planejado-roupeiro", "guarda-roupa-pronto"] : null)) return;
      var lista = [];
      z.edges.forEach(function (ed) { livres(ed, 0, 2.3).forEach(function (iv) { var p = planejado(ctx, "roupeiro", Math.floor((iv[1] - iv[0]) * 100) / 100, { Parede_esquerda: true, Parede_direita: true }); if (p && p.L >= 0.6) lista.push(p); }); });
      lista.sort(function (a, b) { return b.L - a.L; });
      tentar(ctx, slot, lista.slice(0, 4), function (pc) { return { peca: pc, grupo: grupo(ctx, slot), zonaPts: z.pts, regras: ["closetCorredor", { regra: "PADROES 3.10", nivel: "P", texto: "parede cega mais longa (sol destrói tecido)", fonte: "PADROES-AMBIENTES 3.10" }], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, fr, "closetCorredor", "corredor do closet")]; },
        score: function (ed) { return ed.janelas.length ? 0 : 2; } }; }, { rotulo: "o armário do closet", opcional: k > 1, cats: ["planejado-roupeiro"] });
    });
  }
  function planoGourmet(ctx) {
    var z = ctx.zona, cp = CV("circPrincipal");
    if (!jaTem(ctx, "churrasqueira", ["churrasqueira"])) {
      var fam = "ra-lazer-churrasqueira-premoldada", tid = { economico: "p55", medio: "p76", alto: "p85" }[ctx.o.padrao] || "p76", cx = caixaDe(ctx.aval, fam, tid, {});
      var pc = cx ? { cat: "churrasqueira", famId: fam, tipoId: tid, nome: "Churrasqueira pré-moldada " + tid.slice(1) + " cm", L: cx.L, P: cx.P, A: cx.A, cen: cx.cen, preco: 0, fonte: "", provisorio: false, via: "biblioteca", motivoPadrao: "largura pelo padrão" } : null;
      if (pc) {
        var rc = tentar(ctx, "churrasqueira", [pc], function (p) { return { peca: p, grupo: grupo(ctx, "chu"), zonaPts: z.pts, regras: ["circPrincipal", { regra: "PADROES 3.6", nivel: "?", texto: "afastamento de segurança da churrasqueira a móveis de madeira/tecido: conferir no fabricante", fonte: "PADROES-AMBIENTES 3.6 — sem fonte" }], usos: function (B, r) { return [usoF(B, r, p.L, p.P, cp, "circPrincipal", "frente da churrasqueira")]; }, score: function (ed) { return ed.janelas.length ? 0 : 2; } }; }, { rotulo: "a churrasqueira" });
        if (rc) ctx.pend.push({ ambiente: ctx.amb.id, slot: "churrasqueira", texto: "\"" + ctx.amb.nome + "\": a churrasqueira é da biblioteca (sem preço de catálogo): orce à parte — o orçamento pelo modelo a lista sem preço." });
      }
    }
    var ehMesa = function (p) { return /mesa/i.test(p.n); }, ehCad = function (p) { return /cadeira|poltrona|banqueta/i.test(p.n) && p.L <= CV("jantarPessoa"); };
    mesaCentral(ctx, z, { slot: "mesa", cats: ["mesa-cadeira-varanda-gourmet"], filtroMesa: ehMesa, cadeiras: ["mesa-cadeira-varanda-gourmet", "cadeira-jantar"], filtroCadeira: ehCad, lugares: 4, slotCadeira: "cadeira", grupo: "gourmet", folga: "jantarParede", rotFolga: "em volta da mesa (como no jantar, PADROES 3.6)", rotulo: "a mesa da varanda" });
    if (ctx.o.opcionais && !jaTem(ctx, "espreguicadeira", ["poltrona-externa-espreguicadeira"])) {
      tentar(ctx, "espreguicadeira", escolher(ctx, ["poltrona-externa-espreguicadeira"], {}), function (pc) { return { peca: pc, grupo: grupo(ctx, "esp"), zonaPts: z.pts, regras: ["circPrincipal"], usos: function (B, r) { return [usoF(B, r, pc.L, pc.P, CV("circDorm"), "circDorm", "frente")]; } }; }, { rotulo: "a espreguiçadeira", opcional: true });
    }
  }
  var PLANOS = { "dormitorio-casal": planoDorm, suite: planoDorm, "dormitorio-solteiro": planoDorm, "dormitorio-infantil": planoDorm, "sala-estar": function (c) { planoSala(c); }, "sala-jantar": function (c) { planoJantar(c); },
    "sala-estar-jantar": planoIntegrado, cozinha: planoCozinha, "cozinha-americana": function (c) { planoCozinha(c); c.pend.push({ ambiente: c.amb.id, slot: "bancada-refeicao", texto: "\"" + c.amb.nome + "\": a bancada de refeição (península/ilha) e as banquetas saem da Marmoraria — não lançadas aqui." }); },
    lavanderia: planoLavanderia, "home-office": planoHomeOffice, escritorio: planoEscritorio, "sala-reuniao": planoReuniao, recepcao: planoRecepcao, consultorio: planoConsultorio, loja: planoLoja, hall: planoHall, closet: planoCloset, "area-gourmet": planoGourmet };
  var PASSAGEM = { "dormitorio-casal": "circDorm", suite: "circDorm", "dormitorio-solteiro": "circDorm", "dormitorio-infantil": "circDorm", closet: "closetCorredor", "home-office": "circDorm", lavanderia: "circDorm", cozinha: "cozPassagem", "cozinha-americana": "cozPassagem" };

  /* ---------------------------------------------------------------- LEITURA + os móveis de cada ambiente */
  function leitura(estado, avaliarFam) { return EA().leitura(estado, avaliarFam); }
  function existentesDe(a, L, est, aval) {
    var porId = {}; arr(est && est.familias).forEach(function (f) { if (f) porId[String(f.id)] = f; });
    return L.moveis.filter(function (m) {
      if (m.pav !== a.pav || !m.pts || m.pts.length < 4) return false;
      var c = [(m.pts[0][0] + m.pts[2][0]) / 2, (m.pts[0][1] + m.pts[2][1]) / 2]; return dentro(c, a.pts);
    }).map(function (m) {
      var f = porId[m.id] || {}, cx = caixaDe(aval, m.famId, m.tipoId, f.inst || {}), fp = obbDePts(m.pts), r = num(m.rotY, 0);
      var cen = cx ? cx.cen : false, P = cx ? cx.P : (fp ? fp.hv * 2 : 0.5), Lx = cx ? cx.L : (fp ? fp.hu * 2 : 0.5), base = a.base;
      var y0 = num(m.y, base) - base + (cx ? num(cx.y0, 0) : 0), A = cx ? cx.A : 0.8;
      var B = cen ? noMundo([m.x, m.z], r, 0, -P / 2) : [m.x, m.z];
      var pq = FC() && FC().peca && /^ra-cat-/.test(txt(m.famId)) ? FC().peca(m.tipoId) : null;
      return { id: m.id, auto: String(m.id).indexOf(PREF + a.id + "-") === 0, famId: m.famId, tipoId: m.tipoId, cat: categoriaDe(f.famId ? f : m), nome: m.nome, pecaNome: pq ? pq.n : "", fp: fp, y0: y0, y1: y0 + A, A: A, L: Lx, P: P, B: B, r: r, cen: cen,
        leve: /tapete|colchao/.test(categoriaDe(f.famId ? f : m)) };
    });
  }
  function pilaresDe(a, est) {
    var G = global.ArqGeo || dep("ArqGeo", "./arqgeo.js");
    /* ⚠ 25/10/2026: só o pilar que ocupa a ALTURA do ambiente — o pontalete do telhado (tec-*, tipo pilar, apoiado na laje) caía dentro
       do contorno do quarto e o guarda-roupa "batia no pilar" (projeto exemplo) */
    var br = null; arr(est && est.ambientes).forEach(function (x) { if (x && a && String(x.id) === String(a.id)) br = x; });
    var cb = br && br.calc, ab = num(cb && cb.base, -1e9), at = cb && cb.topo != null ? num(cb.topo, 1e9) : 1e9;
    return arr(est && est.caixas).filter(function (c) {
      if (!c || c.tipo !== "pilar" || !dentro([num(c.cx, 0), num(c.cz, 0)], a.pts)) return false;
      var h = num(c.altura, 0), y0 = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, h / 2) - h / 2;
      return !(h > 0 && (y0 >= at - 0.05 || y0 + h <= ab + 0.05));
    }).map(function (c) {
      var u = eixoU(num(c.rotY, 0)), v = eixoV(num(c.rotY, 0));
      return { id: String(c.id), fp: { c: [num(c.cx, 0), num(c.cz, 0)], u: u, v: v, hu: num(c.comprimento, 0.2) / 2, hv: num(c.espessura, 0.2) / 2 }, y0: 0, y1: 9, nome: "o pilar " + c.id };
    });
  }
  function novoCtx(o, L, a, tipo, hist) {
    var geo = geometria(a, L), z = zonas(geo);
    var ctx = { o: o.opc, L: L, amb: a, tipo: tipo, geo: geo, zona: geo, z: z, aval: o.avaliarFam, est: o.estado, hist: hist, obst: [], usos: [], alvos: [], ops: [], itens: [], avisos: [], pend: [], reduzidos: [],
      passagemCrit: o.opc.acessivel ? "faixaAcessivel" : (PASSAGEM[tipo] || "circPrincipal"), giroCrit: /dorm|suite/.test(tipo) ? "giro" : "giroGeral" };
    ctx.passagem = CV(ctx.passagemCrit);
    ctx.existentes = existentesDe(a, L, o.estado, o.avaliarFam);
    pilaresDe(a, o.estado).forEach(function (p) { ctx.obst.push(p); });
    return ctx;
  }
  function menorDim(P) { var q = quadro(P); return Math.min(q.lu, q.lv); }

  /* ---------------------------------------------------------------- GERAR */
  function gerar(o) {
    o = o || {};
    var est = o.estado, aval = o.avaliarFam, L = leitura(est, aval);
    var opc = { estilo: o.estilo || "contemporaneo", padrao: { economico: "economico", medio: "medio", alto: "alto" }[o.padrao] || "medio", acessivel: !!o.acessivel, opcionais: o.opcionais !== false, refazer: !!o.refazer };
    var hist = analisarOps(o.ops), ops = [], itens = [], avisos = [], pend = [], red = [], porAmb = {};
    if (!L.ambientes.length) return { ok: false, motivo: "Não há ambiente delimitado no modelo: lance os ambientes (Arquitetura › Ambiente) e rode de novo.", ops: [], itens: [], avisos: [], pendencias: [], reduzidos: [] };
    var sel = o.ambientes ? o.ambientes.map(String) : null, alvo = L.ambientes.filter(function (a) { return !sel || sel.indexOf(String(a.id)) >= 0; });
    if (!alvo.length) return { ok: false, motivo: "Selecione um ambiente (ou use \"todos\").", ops: [], itens: [], avisos: [], pendencias: [], reduzidos: [] };
    var brutos = {}; arr(est && est.ambientes).forEach(function (a) { if (a) brutos[String(a.id)] = a; });
    var o2 = { opc: opc, avaliarFam: aval, estado: est };
    alvo.forEach(function (a) {
      var pr = (brutos[a.id] && brutos[a.id].params) || {}, us = (o.tipos && o.tipos[a.id]) || txt(pr.Uso_mobiliario) || null;
      var cls = MR().classificar(a.nome, { area: a.area, menorDim: menorDim(a.pts), usuario: us });
      porAmb[a.id] = { tipo: cls.id, nome: cls.nome, por: cls.por };
      if (cls.aviso) avisos.push(cls.aviso);
      if (!cls.id) return;
      var prog = MR().PROGRAMAS[cls.id];
      if (prog && prog.nada) { itens.push({ id: null, tipo: "nada", ambiente: a.id, ambienteNome: a.nome, tipoAmbiente: cls.id, texto: "\"" + a.nome + "\" (" + cls.nome + "): " + prog.nada + "." }); return; }
      var fn = PLANOS[cls.id]; if (!fn) return;
      var ctx = novoCtx(o2, L, a, cls.id, hist);
      /* REFAZER: apaga o automático deste ambiente que ninguém mexeu (sem o histórico não dá para saber: nada é apagado) */
      if (opc.refazer) {
        if (!hist.conhecido) ctx.avisos.push("\"" + a.nome + "\": sem o histórico de edição não sei o que foi mexido à mão — nada foi apagado no Refazer.");
        else ctx.existentes = ctx.existentes.filter(function (e) { if (e.auto && !hist.mexidas[e.id]) { ctx.ops.push({ op: "apagar", id: e.id }); return false; } return true; });
      }
      ctx.existentes.forEach(function (e) { if (e.fp) ctx.obst.push({ id: e.id, fp: e.fp, y0: e.y0, y1: e.y1, leve: e.leve, grupo: null, nome: e.nome }); });
      try { fn(ctx); } catch (eP) { ctx.pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": o lançamento parou (" + (eP && eP.message) + ") — nada deste ambiente foi aplicado." }); ctx.ops = []; ctx.itens = ctx.itens.filter(function (x) { return x.tipo !== "peca"; }); }
      ops = ops.concat(ctx.ops); itens = itens.concat(ctx.itens); avisos = avisos.concat(ctx.avisos); pend = pend.concat(ctx.pend); red = red.concat(ctx.reduzidos);
      porAmb[a.id].pecas = ctx.itens.filter(function (x) { return x.tipo === "peca"; }).length;
    });
    var lote = ops.length ? { op: "lote", id: "mob-" + (o.loteId || Date.now().toString(36)), origem: ORIGEM, pedido: "Mobiliar ambiente", ops: ops } : null;
    var pecas = itens.filter(function (x) { return x.tipo === "peca"; }), total = 0;
    pecas.forEach(function (x) { if (x.famId !== "ra-plan-armario") total += num(x.preco, 0); });
    return { ok: true, lote: lote, ops: ops, itens: itens, avisos: avisos, pendencias: pend, reduzidos: red, leitura: L, porAmbiente: porAmb, opcoes: opc,
      resumo: { pecas: pecas.length, ambientes: alvo.length, totalVarejo: Math.round(total * 100) / 100, totalVarejoTexto: fmtR(total) } };
  }

  var MobAuto = { gerar: gerar, leitura: leitura, geometria: geometria, zonas: zonas, livres: livres, buscarParede: buscarParede, validar: validar, acessoOk: acessoOk, grade: grade, alcance: alcance, chega: chega, dentroUso: dentroUso, encolher: encolher, noObb: noObb, paredeEm: paredeEm, maiorParede: maiorParede,
    escolher: escolher, pecasDe: pecasDe, infoPeca: infoPeca, planejado: planejado, caixaDe: caixaDe, categoriaDe: categoriaDe, existentesDe: existentesDe, pilaresDe: pilaresDe, novoCtx: novoCtx, analisarOps: analisarOps,
    kitDe: kitDe, conjuntoMesa: conjuntoMesa, mesaRedonda: mesaRedonda, obbNoCirculo: obbNoCirculo, trazColchao: trazColchao, LARG_COLCHAO: LARG_COLCHAO, obb: obb, obbDePts: obbDePts, sobrepoe: sobrepoe, obbDentro: obbDentro, cantos: cantos, noMundo: noMundo, eixoU: eixoU, eixoV: eixoV, dentro: dentro, quadro: quadro, uso: uso, usoF: usoF, diagTv: diagTv,
    ORIGEM: ORIGEM, ORIGEM_AUD: ORIGEM_AUD, PREF: PREF, PLANOS: PLANOS, PASSAGEM: PASSAGEM, _limparCache: function () { _cx = {}; _porCat = null; } };
  global.MobAuto = MobAuto;
  if (typeof module !== "undefined" && module.exports) module.exports = MobAuto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

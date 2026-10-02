/* =====================================================================
 * icaragente.js — AGENTE DO MELHOR EQUIPAMENTO E DA MELHOR POSIÇÃO (ESPEC-ICAMENTO-CENARIO.md §II.12).
 * Motor PURO (ES5, testável em Node). Usa o js/icarplano.js (capacidade pela tabela, desenho das patolas) e, se
 * carregado, o js/icarcolisao.js (lança e cabo contra as caixas do modelo). A tela (gestao.js) monta a entrada e
 * aplica o cenário escolhido; aqui NADA se grava.
 *
 * Como decide:
 *  1. TRIAGEM pela tabela numa grade (1 m, premissa): para cada equipamento e cada ponto da grade, quais içamentos
 *     a tabela atende ali (raio até o destino e até a coleta; altura do gancho pela cota do apoio).
 *  2. COBERTURA gulosa: a posição que cobre MAIS içamentos que faltam (empate: menor utilização, depois mais perto do
 *     meio dos içamentos), repete até cobrir todos — o menor número de posições.
 *  3. CONFERÊNCIA só das posições que o guloso vai usar (preguiçosa): o caminhão e o retângulo das patolas cabem
 *     livres (peças do modelo na faixa de altura do veículo, áreas ocupadas, áreas onde não se pode apoiar, limite do
 *     terreno), a declividade entre as sapatas, a altura do gancho com a cota real do terreno e a lança/cabo na pose
 *     final contra as caixas do modelo (verificação GROSSA — o caminho inteiro é o "Verificar o caminho" do plano).
 *  4. ORDEM (lexicográfica): (a) cobre tudo; (b) menos posições; (b2) sem içamento crítico por utilização — a regra do
 *     IcarPlano.melhores, "o menor que atende com folga"; (c) menor porte; (d) menor utilização máxima; (e) menor
 *     custo, quando há preço; (f) menor tempo.
 *
 * ⚠ NUNCA inventa número: capacidade é a do IcarPlano.capacidade (a mesma do cartão do içamento, sem interpolar para
 *   cima). Reações das patolas NÃO entram aqui: o catálogo não publica as massas dos equipamentos (a aba Física diz
 *   isso em cinza) — o cenário manda conferir lá depois de aplicar.
 * ⚠ A triagem usa a cota do APOIO; a posição escolhida é refeita com a cota do TERRENO (quando a tela dá a função) e
 *   pode cair — por isso a conferência é feita antes de aceitar a posição, nunca depois.
 * ⚠ Coordenadas: as do motor (metros; x, y em planta; z para cima).
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREMISSAS = {
    passo_m: 1,                 // grade de posições candidatas (ESPEC §II.12.2)
    maxPosicoes: 40000,         // por equipamento: acima disso a grade engrossa (o aviso diz o passo usado)
    declividadeMax_pct: 5,      // premissa: diferença de cota entre sapatas vizinhas; confira o curso dos macacos na ficha do equipamento
    alturaVeiculo_m: 4.40,      // premissa: altura máxima de veículo do CONTRAN (4,40 m) — peça abaixo disso no lugar do caminhão ocupa; confira a resolução vigente
    rentePiso_m: 0.30,          // peça que sai menos que isso acima do apoio (piso, bloco enterrado) não ocupa o lugar do caminhão
    reposicionar_min: 45,       // premissa (só para desempatar por tempo): desmontar, andar e montar de novo
    maxConferir: 4000           // conferências por rodada do guloso (proteção contra grade toda ocupada)
  };
  var RUMOS = [0, 180, 30, 210, 60, 240, 90, 270, 120, 300, 150, 330];   // a partir do "de lado para os içamentos"

  function P() { return global.IcarPlano; }
  function C() { return global.IcarColisao || null; }
  function prem(p) { var o = {}, k; for (k in PREMISSAS) o[k] = PREMISSAS[k]; if (p) for (k in p) if (p[k] != null && p[k] !== "") o[k] = p[k]; return o; }
  /* número para frase (o mesmo jeito do icarplano: vírgula, milhar com ponto, sem "-0") */
  function br(v, c) {
    c = c == null ? 2 : c;
    var x = +v; if (!isFinite(x)) return "—";
    var f = Math.pow(10, c), r = Math.round(x * f) / f;
    var t = Math.abs(r).toFixed(c).split("."), ip = t[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (r < 0 ? "-" : "") + ip + (t[1] && /[1-9]/.test(t[1]) ? "," + t[1].replace(/0+$/, "") : "");
  }

  /* ---------------- geometria em planta (polígonos = [[x, y]…]) ---------------- */
  function arr(pts) { return pts.map(function (p) { return p.length ? [+p[0], +p[1]] : [+p.x, +p.y]; }); }
  function caixa(pol) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    pol.forEach(function (p) { if (p[0] < b.x0) b.x0 = p[0]; if (p[0] > b.x1) b.x1 = p[0]; if (p[1] < b.y0) b.y0 = p[1]; if (p[1] > b.y1) b.y1 = p[1]; });
    return b;
  }
  function caixasCruzam(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }
  /* os pontos em volta do centro (o retângulo das patolas vem como 4 sapatas soltas) */
  function contorno(pts) {
    var cx = 0, cy = 0; pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
    return pts.slice().sort(function (a, b) { return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx); });
  }
  function orient(a, b, c) { var v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return Math.abs(v) < 1e-12 ? 0 : v > 0 ? 1 : -1; }
  function noSeg(a, b, c) { return Math.min(a[0], b[0]) - 1e-12 <= c[0] && c[0] <= Math.max(a[0], b[0]) + 1e-12 && Math.min(a[1], b[1]) - 1e-12 <= c[1] && c[1] <= Math.max(a[1], b[1]) + 1e-12; }
  function segsCruzam(a, b, c, d) {
    var o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && noSeg(a, b, c)) || (o2 === 0 && noSeg(a, b, d)) || (o3 === 0 && noSeg(c, d, a)) || (o4 === 0 && noSeg(c, d, b));
  }
  function dentro(pt, pol) {
    var d = false;
    for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      var xi = pol[i][0], yi = pol[i][1], xj = pol[j][0], yj = pol[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-12) + xi)) d = !d;
    }
    return d;
  }
  /* dois polígonos (convexos ou não) se tocam: alguma aresta cruza, ou um está dentro do outro */
  function polCruza(A, B) {
    for (var i = 0, j = A.length - 1; i < A.length; j = i++)
      for (var k = 0, l = B.length - 1; k < B.length; l = k++) if (segsCruzam(A[j], A[i], B[l], B[k])) return true;
    return dentro(A[0], B) || dentro(B[0], A);
  }

  /* ---------------- entrada → contexto ---------------- */
  function contexto(ent, pp) {
    var zA = +ent.zApoio || 0, ocup = [];
    /* peças do modelo na faixa de altura do veículo: ocupam o chão (caixa em planta) */
    (ent.obstaculos || []).forEach(function (o) {
      var mn = o.min, mx = o.max; if (!mn || !mx) return;
      if (mx[2] <= zA + pp.rentePiso_m || mn[2] >= zA + pp.alturaVeiculo_m) return;
      var pol = [[mn[0], mn[1]], [mx[0], mn[1]], [mx[0], mx[1]], [mn[0], mx[1]]];
      ocup.push({ nome: o.nome || o.id || "peça do modelo", pol: pol, cx: caixa(pol) });
    });
    (ent.ocupadas || []).forEach(function (o) {
      if (!o || !o.poligono || o.poligono.length < 3) return;
      var pol = arr(o.poligono); ocup.push({ nome: o.nome || o.motivo || "área ocupada", pol: pol, cx: caixa(pol) });
    });
    var proib = [];
    (ent.proibidas || []).forEach(function (a) { if (a && a.poligono && a.poligono.length >= 3) proib.push({ motivo: a.motivo || "área marcada", pol: arr(a.poligono) }); });
    /* caixas 3D para a lança e o cabo (orientadas nos eixos) */
    var obst = [];
    (ent.obstaculos || []).forEach(function (o) {
      var mn = o.min, mx = o.max; if (!mn || !mx) return;
      obst.push({ nome: o.nome || o.id || "peça do modelo", mn: mn, mx: mx,
        obb: { c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], e: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2] } });
    });
    return { zA: zA, ocup: ocup, proib: proib, limite: ent.limite && ent.limite.length >= 3 ? arr(ent.limite) : null,
      terreno: typeof ent.terreno === "function" ? ent.terreno : null, obst: obst };
  }

  /* o equipamento cabe em pos com este rumo? → { ok, motivo, lay, zs } */
  function cabe(eq, pos, rumo, cx, pp, semTerreno) {
    var lay = P().layoutEquip(eq, pos, rumo);
    var corpo = arr(lay.retangulos[0].pts), pat = contorno(arr(lay.sapatas)), bc = caixa(corpo), bp = caixa(pat);
    for (var i = 0; i < cx.ocup.length; i++) {
      var oc = cx.ocup[i];
      if ((caixasCruzam(bc, oc.cx) && polCruza(corpo, oc.pol)) || (caixasCruzam(bp, oc.cx) && polCruza(pat, oc.pol))) return { ok: false, motivo: "ocupado por " + oc.nome };
    }
    for (var s = 0; s < lay.sapatas.length; s++) {
      var sp = [lay.sapatas[s].x, lay.sapatas[s].y];
      for (var a = 0; a < cx.proib.length; a++) if (dentro(sp, cx.proib[a].pol)) return { ok: false, motivo: "sapata " + lay.sapatasNomes[s] + " em área onde não se pode apoiar (" + cx.proib[a].motivo + ")" };
    }
    if (cx.limite) {
      var todos = corpo.concat(pat);
      for (var k = 0; k < todos.length; k++) if (!dentro(todos[k], cx.limite)) return { ok: false, motivo: "o caminhão ou as patolas saem do terreno/acesso marcado" };
    }
    var zs = null;
    if (cx.terreno && !semTerreno) {
      zs = lay.sapatas.map(function (q) { var z = cx.terreno(q.x, q.y); return z == null || !isFinite(+z) ? null : +z; });
      if (zs.every(function (z) { return z != null; })) {
        /* declividade entre sapatas VIZINHAS (as arestas do retângulo das patolas) */
        var ord = contorno(lay.sapatas.map(function (q, n) { return [q.x, q.y, n]; })), pior = 0;
        for (var m = 0; m < ord.length; m++) {
          var u = ord[m], v = ord[(m + 1) % ord.length], L = Math.sqrt((u[0] - v[0]) * (u[0] - v[0]) + (u[1] - v[1]) * (u[1] - v[1]));
          if (L > 1e-6) pior = Math.max(pior, Math.abs(zs[u[2]] - zs[v[2]]) / L * 100);
        }
        if (pior > pp.declividadeMax_pct + 1e-9) return { ok: false, motivo: "declividade de " + br(pior, 1) + " % entre as sapatas (limite " + br(pp.declividadeMax_pct, 1) + " %, premissa)" };
      }
    }
    return { ok: true, lay: lay, zs: zs };
  }

  /* raios da tabela do equipamento (o alcance da triagem) */
  function raiosEq(eq) {
    var t = eq.tabela || {};
    if (eq.tipo === "munck" || t.pontos) return (t.pontos || []).map(function (x) { return +x[0]; }).sort(function (a, b) { return a - b; });
    return (t.linhas || []).filter(function (l) { return l[1].some(function (v) { return v != null; }); }).map(function (l) { return +l[0]; });
  }

  /* a lança (pé → ponta) e o cabo (ponta → gancho) na pose final, contra as caixas do modelo */
  function choqueLanca(pos, z, ic, cap, H, cx, pp) {
    var Co = C(); if (!Co || !cx.obst.length) return null;
    var pre = P().prem(pp.premissasPlano);
    var pe = [pos.x, pos.y, z + pre.alturaPeLanca_m];
    var pontaZ = z + (cap.alturaPonta != null ? cap.alturaPonta : H + pre.pontaGancho_m);
    var ponta = [ic.cg.x, ic.cg.y, pontaZ], gancho = [ic.cg.x, ic.cg.y, ic.zAlvo];
    var segs = [[pe, ponta, "lança"], [ponta, gancho, "cabo"]];
    for (var s = 0; s < segs.length; s++) {
      var a = segs[s][0], b = segs[s][1];
      var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
      for (var i = 0; i < cx.obst.length; i++) {
        var o = cx.obst[i];
        if (o.mn[0] > x1 || o.mx[0] < x0 || o.mn[1] > y1 || o.mx[1] < y0 || o.mn[2] > z1 || o.mx[2] < z0) continue;
        if (Co.segCruzaObb(a, b, o.obb)) return segs[s][2] + " passa por " + o.nome;
      }
    }
    return null;
  }

  /* ======================= O AGENTE ======================= */
  /* ent = { icamentos: [{ id, nome, carga_kg (SEM o moitão), cg:{x,y}, coleta:{x,y}|null, zAlvo (cota do gancho) }],
             catalogo: [eq], moitaoPadrao_kg, condicoes, premissasPlano, zApoio, terreno: fn(x, y) → z|null,
             obstaculos: [{ id, nome, min:[x,y,z], max:[x,y,z] }], ocupadas: [{ nome, poligono }], proibidas: [{ motivo, poligono }],
             limite: [[x,y]…] | null, precos: { eqId: { hora, mobilizacao } }, premissas: {…PREMISSAS} }
     → { ok, cenarios (ordenados), melhores (até 3), mapa, avisos, conta, premissas } */
  function sugerir(ent, opts) {
    opts = opts || {};
    var t0 = Date.now(), pp = prem(ent && ent.premissas), Pl = P();
    pp.premissasPlano = ent && ent.premissasPlano || {};
    var out = { ok: false, cenarios: [], melhores: [], mapa: null, avisos: [], conta: { posicoes: 0, capacidade: 0, encaixes: 0, conferidas: 0, equipamentos: 0 }, premissas: pp };
    if (!Pl) { out.avisos.push("Motor do plano (icarplano.js) não carregado."); return out; }
    var ics = ((ent && ent.icamentos) || []).filter(function (x) { return x && x.cg && x.carga_kg > 0 && isFinite(+x.zAlvo); });
    if (!ics.length) { out.avisos.push("Nenhum içamento com peso, posição da peça e altura do gancho — complete os içamentos antes de pedir a sugestão."); return out; }
    var cx = contexto(ent, pp), cat = (ent.catalogo || []).filter(function (e) { return e && e.tabela; });
    if (!C() && cx.obst.length) out.avisos.push("Motor de colisões não carregado: lança e cabo NÃO foram conferidos contra o modelo.");
    var condicoes = ent.condicoes || {}, premCap = {}; for (var kp in pp.premissasPlano) premCap[kp] = pp.premissasPlano[kp]; premCap.condicoes = condicoes;
    /* a caixa de todos os pontos que importam (destinos e coletas) */
    var bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    ics.forEach(function (ic) { [ic.cg, ic.coleta].forEach(function (q) { if (!q) return; bx.x0 = Math.min(bx.x0, q.x); bx.x1 = Math.max(bx.x1, q.x); bx.y0 = Math.min(bx.y0, q.y); bx.y1 = Math.max(bx.y1, q.y); }); });
    var porEq = [], semAlcance = 0, engrossou = [];

    cat.forEach(function (eq, eqI) {
      out.conta.equipamentos++;
      var rs = raiosEq(eq); if (!rs.length) return;
      var rmax = rs[rs.length - 1], moP = ent.moitaoPadrao_kg != null && ent.moitaoPadrao_kg !== "" ? +ent.moitaoPadrao_kg : null;
      /* ⚠ a MESMA ordem do IcarPlano.avaliar: o moitão informado no plano vale primeiro, depois o do catálogo — senão o número do
         agente e o do cartão do içamento divergem depois do "Usar este" */
      var mo = moP != null ? moP : (eq.moitao_kg != null ? +eq.moitao_kg : 0), moConhecido = eq.moitao_kg != null || moP != null;
      var tot = ics.map(function (ic) { return +ic.carga_kg + mo; });
      var Hs = ics.map(function (ic) { return +ic.zAlvo - cx.zA; });
      /* memória da capacidade: dentro do mesmo par de linhas da tabela, a resposta é a mesma (não interpola) */
      var memo = ics.map(function () { return {}; });
      function capTri(li, R) {
        var c = Pl.cercar(rs, R), key = c.lo + "|" + c.hi, m = memo[li][key];
        if (m) return m;
        out.conta.capacidade++;
        var r = Pl.capacidade(eq, R, Hs[li], premCap);
        m = memo[li][key] = { ok: !!r.ok, cap_kg: r.cap_kg, motivo: r.motivo };
        return m;
      }
      var passo = +pp.passo_m > 0 ? +pp.passo_m : 1, x0, x1, y0, y1, nx, ny;
      for (;;) {
        x0 = Math.floor((bx.x0 - rmax) / passo) * passo; x1 = bx.x1 + rmax; y0 = Math.floor((bx.y0 - rmax) / passo) * passo; y1 = bx.y1 + rmax;
        nx = Math.floor((x1 - x0) / passo) + 1; ny = Math.floor((y1 - y0) / passo) + 1;
        if (nx * ny <= pp.maxPosicoes) break;
        passo *= 2;
      }
      if (passo !== +pp.passo_m) engrossou.push(Pl.nomeEq(eq) + " (" + br(passo, 1) + " m)");
      var cands = [], alcanca = ics.map(function () { return null; });
      for (var ix = 0; ix < nx; ix++) {
        var x = Math.round((x0 + ix * passo) * 1000) / 1000;
        for (var iy = 0; iy < ny; iy++) {
          var y = Math.round((y0 + iy * passo) * 1000) / 1000;
          out.conta.posicoes++;
          if (cx.limite && !dentro([x, y], cx.limite)) continue;
          var cobre = null, us = null;
          for (var li = 0; li < ics.length; li++) {
            var ic = ics[li], dx = x - ic.cg.x, dy = y - ic.cg.y, R = Math.sqrt(dx * dx + dy * dy);
            if (R > rmax) continue;
            if (ic.coleta) { var ex = x - ic.coleta.x, ey = y - ic.coleta.y, Rc = Math.sqrt(ex * ex + ey * ey); if (Rc > R) R = Rc; if (R > rmax) continue; }
            var cp = capTri(li, R);
            if (!cp.ok) { if (!alcanca[li]) alcanca[li] = cp.motivo; continue; }
            var u = tot[li] / cp.cap_kg;
            if (u > 1 + 1e-9) { if (!alcanca[li] || alcanca[li].indexOf("acima") < 0) alcanca[li] = "carga acima da capacidade da tabela em todos os raios alcançáveis"; continue; }
            if (!cobre) { cobre = []; us = []; }
            cobre.push(li); us.push(u);
          }
          if (cobre) cands.push({ x: x, y: y, cobre: cobre, us: us, conf: null });
        }
      }
      if (!cands.length) { semAlcance++; return; }

      /* conferência de UMA posição (preguiçosa e memorizada): cabe? com o terreno, ainda atende? a lança passa? */
      function conferir(cd) {
        if (cd.conf) return cd.conf;
        out.conta.conferidas++;
        var pos = { x: cd.x, y: cd.y }, z = cx.zA;
        if (cx.terreno) { var zt = cx.terreno(cd.x, cd.y); if (zt != null && isFinite(+zt)) z = Math.round(+zt * 1000) / 1000; }   // ao milímetro: a interpolação devolve 3e-9 num chão plano
        pos.z = z;
        var mx = 0, my = 0; cd.cobre.forEach(function (li) { mx += ics[li].cg.x; my += ics[li].cg.y; }); mx /= cd.cobre.length; my /= cd.cobre.length;
        var base = Pl.rumoPadrao(pos, { x: mx, y: my }), fit = null, rumo = null, motivo = "";
        for (var r = 0; r < RUMOS.length; r++) {
          var rr = Math.round((((base + RUMOS[r]) % 360) + 360) % 360 * 10) / 10;
          out.conta.encaixes++;
          var f = cabe(eq, pos, rr, cx, pp, false);
          if (f.ok) { fit = f; rumo = rr; break; }
          if (!motivo) motivo = f.motivo;
        }
        if (!fit) return (cd.conf = { cabe: false, motivo: motivo, cobre: [], falhas: {} });
        var det = {}, cobreOk = [], falhas = {};
        cd.cobre.forEach(function (li) {
          var ic = ics[li], dx = cd.x - ic.cg.x, dy = cd.y - ic.cg.y, R = Math.sqrt(dx * dx + dy * dy), Rd = R;
          if (ic.coleta) { var ex = cd.x - ic.coleta.x, ey = cd.y - ic.coleta.y; R = Math.max(R, Math.sqrt(ex * ex + ey * ey)); }
          var H = +ic.zAlvo - z;
          out.conta.capacidade++;
          var cap = Pl.capacidade(eq, R, H, premCap);
          if (!cap.ok) { falhas[li] = cap.motivo; return; }
          var u = tot[li] / cap.cap_kg;
          if (u > 1 + 1e-9) { falhas[li] = "carga acima da capacidade com a cota do terreno"; return; }
          var ch = choqueLanca(pos, z, ic, cap, H, cx, pp);
          if (ch) { falhas[li] = ch; return; }
          cobreOk.push(li);
          det[li] = { raio: Math.round(R * 100) / 100, raioDestino: Math.round(Rd * 100) / 100, H: Math.round(H * 100) / 100, cap_kg: cap.cap_kg, util: u, critico: u > Pl.CRITICO_UTIL, lanca: cap.lanca || null };
        });
        return (cd.conf = { cabe: true, x: cd.x, y: cd.y, z: z, rumo: rumo, cobre: cobreOk, det: det, falhas: falhas, sapatas: fit.lay.sapatas, zs: fit.zs });
      }

      /* ---- cobertura gulosa (ESPEC §II.12.2-3) ---- */
      var falta = {}; ics.forEach(function (ic, li) { falta[li] = true; });
      var posicoes = [], motivoFalta = {}, cmx = 0, cmy = 0;
      ics.forEach(function (ic) { cmx += ic.cg.x; cmy += ic.cg.y; }); cmx /= ics.length; cmy /= ics.length;
      function quantas(cd) { var n = 0, um = 0; for (var i = 0; i < cd.cobre.length; i++) if (falta[cd.cobre[i]]) { n++; if (cd.us[i] > um) um = cd.us[i]; } cd._n = n; cd._u = um; cd._d = Math.sqrt((cd.x - cmx) * (cd.x - cmx) + (cd.y - cmy) * (cd.y - cmy)); return n; }
      for (var rodada = 0; rodada < ics.length; rodada++) {
        var vivos = cands.filter(function (cd) { return quantas(cd) > 0 && !(cd.conf && !cd.conf.cabe); });
        if (!vivos.length) break;
        vivos.sort(function (a, b) { return (b._n - a._n) || (a._u - b._u) || (a._d - b._d) || (a.x - b.x) || (a.y - b.y); });
        var melhor = null, nConf = 0;
        for (var v = 0; v < vivos.length; v++) {
          var cd = vivos[v];
          if (melhor && cd._n < melhor.n) break;               // a triagem é o teto do que a posição pode cobrir
          if (++nConf > pp.maxConferir) { out.avisos.push("Grade muito ocupada para " + Pl.nomeEq(eq) + ": parei depois de " + pp.maxConferir + " posições conferidas numa rodada."); break; }
          var cf = conferir(cd);
          if (!cf.cabe) continue;
          var novos = cf.cobre.filter(function (li) { return falta[li]; });
          if (!novos.length) continue;
          var um = 0; novos.forEach(function (li) { if (cf.det[li].util > um) um = cf.det[li].util; });
          if (!melhor || novos.length > melhor.n || (novos.length === melhor.n && um < melhor.u - 1e-12)) melhor = { cd: cd, cf: cf, n: novos.length, u: um, novos: novos };
          if (melhor.n === cd._n) break;                        // ninguém depois dela cobre mais (ordem da triagem)
        }
        if (!melhor) break;
        posicoes.push(melhor);
        melhor.novos.forEach(function (li) { falta[li] = false; });
      }
      /* por que ficou de fora (o motivo mais útil que apareceu) */
      ics.forEach(function (ic, li) {
        if (!falta[li]) return;
        var m = "";
        cands.forEach(function (cd) { if (!m && cd.conf) { if (cd.conf.falhas[li]) m = cd.conf.falhas[li]; else if (!cd.conf.cabe && cd.cobre.indexOf(li) >= 0) m = "nenhuma posição livre que alcance (" + cd.conf.motivo + ")"; } });
        motivoFalta[li] = m || alcanca[li] || "fora do alcance da tabela em toda a área";
      });
      var cen = { eq: eq, eqId: eq.id, nome: Pl.nomeEq(eq), tipo: eq.tipo || "guindaste", porte: Pl.porte(eq), moitaoConhecido: moConhecido, moitao_kg: mo, passo: passo,
        posicoes: posicoes.map(function (m, k) {
          return { n: k + 1, x: m.cf.x, y: m.cf.y, z: m.cf.z, rumo: m.cf.rumo, sapatas: m.cf.sapatas, zs: m.cf.zs,
            ics: m.novos.map(function (li) { var d = m.cf.det[li]; return { idx: li, id: ics[li].id, nome: ics[li].nome || ("Içamento " + (li + 1)), raio: d.raio, raioDestino: d.raioDestino, H: d.H, cap_kg: d.cap_kg, util: d.util, critico: d.critico, lanca: d.lanca, carga_kg: tot[li] }; }) };
        }),
        faltam: ics.map(function (ic, li) { return falta[li] ? { idx: li, id: ic.id, nome: ic.nome || ("Içamento " + (li + 1)), motivo: motivoFalta[li] } : null; }).filter(Boolean),
        cands: cands };
      cen.utilMax = 0; cen.criticos = 0; cen.tempo_min = 0;
      cen.posicoes.forEach(function (ps) {
        ps.ics.forEach(function (x) {
          if (x.util > cen.utilMax) cen.utilMax = x.util; if (x.critico) cen.criticos++;
          var col = ics[x.idx].coleta || Pl.coletaPadrao(eq, ps, ps.rumo, { cg: ics[x.idx].cg });
          var g = Math.abs(Math.atan2(col.y - ps.y, col.x - ps.x) - Math.atan2(ics[x.idx].cg.y - ps.y, ics[x.idx].cg.x - ps.x)) * 180 / Math.PI; if (g > 180) g = 360 - g;
          cen.tempo_min += Pl.tempo({ altura_m: Math.max(0, x.H), giro_graus: g, tempo: (pp.premissasPlano || {}).tempo }).total_min;
        });
      });
      cen.tempo_min += Math.max(0, cen.posicoes.length - 1) * pp.reposicionar_min;
      var pr = ent.precos && ent.precos[eq.id];
      cen.custo = pr && (pr.hora != null || pr.mobilizacao != null) ? (+pr.mobilizacao || 0) + (+pr.hora || 0) * cen.tempo_min / 60 : null;
      porEq.push(cen);
    });

    /* ---- ordem (ESPEC §II.12.2-4) ---- */
    porEq.sort(comparar);
    out.cenarios = porEq;
    out.melhores = porEq.slice(0, 3);
    out.melhores.forEach(function (c, i) { c.porque = porque(c, i, out.melhores[0]); });
    if (semAlcance) out.avisos.push(semAlcance + " equipamento(s) do catálogo não atendem nenhum içamento em nenhuma posição.");
    if (engrossou.length) out.avisos.push("Área grande: a grade engrossou para " + engrossou.slice(0, 4).join(", ") + (engrossou.length > 4 ? "…" : "") + ".");
    if (porEq.length && porEq[0].faltam.length) out.avisos.push("Nenhum equipamento do catálogo atende TODOS os içamentos: veja o que falta em cada cenário.");
    if (!cx.terreno) out.avisos.push("Declividade não conferida: sem a superfície do terreno, a cota de todas as posições é a do apoio (" + br(cx.zA, 2) + " m).");
    out.avisos.push("Reações das patolas e pressão no solo não entram na escolha: o catálogo não publica as massas dos equipamentos — confira na aba Física depois de aplicar.");
    if (cx.obst.length && C()) out.avisos.push("Lança e cabo conferidos só na pose final, contra a caixa de cada peça (verificação grossa): depois de aplicar, rode \"Verificar o caminho\".");
    if (out.melhores.length && !opts.semMapa) out.mapa = mapa(out.melhores[0], ics, cx, pp, out.conta);
    out.melhores.forEach(function (c) { delete c.cands; });
    porEq.forEach(function (c) { delete c.cands; });
    out.ok = !!(out.melhores.length && !out.melhores[0].faltam.length);
    out.conta.ms = Date.now() - t0;
    return out;
  }

  function comparar(a, b) {
    return (a.faltam.length - b.faltam.length) ||
      (a.posicoes.length - b.posicoes.length) ||
      ((a.criticos > 0) - (b.criticos > 0)) ||
      (a.porte - b.porte) ||
      (a.utilMax - b.utilMax) ||
      ((a.custo != null && b.custo != null) ? a.custo - b.custo : 0) ||
      (a.tempo_min - b.tempo_min) ||
      String(a.eqId).localeCompare(String(b.eqId));
  }

  /* mapa de calor do melhor equipamento: em cada ponto da grade, quantos içamentos a tabela atende e se o caminhão cabe
     (com o rumo que encaixar; SEM a declividade — o terreno pedido ponto a ponto custaria um raio por ponto) */
  function mapa(cen, ics, cx, pp, conta) {
    var pts = [], eq = cen.eq, lim = 20000;
    (cen.cands || []).slice(0, lim).forEach(function (cd) {
      var ok = false, pos = { x: cd.x, y: cd.y, z: cx.zA }, mx = 0, my = 0;
      cd.cobre.forEach(function (li) { mx += ics[li].cg.x; my += ics[li].cg.y; });
      var base = P().rumoPadrao(pos, { x: mx / cd.cobre.length, y: my / cd.cobre.length });
      /* metade dos rumos (de 30 em 30° até 150°): o retângulo das patolas quase repete a cada 180° */
      for (var r = 0; r < RUMOS.length && !ok; r += 2) { conta.encaixes++; ok = cabe(eq, pos, base + RUMOS[r], cx, pp, true).ok; }
      pts.push({ x: cd.x, y: cd.y, n: cd.cobre.length, cabe: ok });
    });
    return { eqId: cen.eqId, nome: cen.nome, passo: cen.passo, total: cen.cands ? cen.cands.length : 0, pontos: pts, cortado: cen.cands && cen.cands.length > lim };
  }

  /* o porquê em números (a IA só reescreveria isto — nunca escolhe nem muda número) */
  function porque(c, i, melhor) {
    var s = c.nome + " em " + (c.posicoes.length === 1 ? "1 posição" : c.posicoes.length + " posições") + ": ";
    s += c.posicoes.map(function (p) {
      return "P" + p.n + " (X " + br(p.x, 1) + " / Y " + br(p.y, 1) + ", rumo " + br(p.rumo, 0) + "°) com " + p.ics.length + " içamento(s), raio até " + br(Math.max.apply(null, p.ics.map(function (x) { return x.raio; })), 2) + " m";
    }).join("; ");
    s += ". Utilização máxima " + br(c.utilMax * 100, 0) + " %" + (c.criticos ? " — " + c.criticos + " içamento(s) acima de 80 % (crítico)" : "") + ".";
    if (c.faltam.length) s += " Não atende " + c.faltam.length + ": " + c.faltam.map(function (f) { return f.nome + " (" + f.motivo + ")"; }).join("; ") + ".";
    if (!c.moitaoConhecido) s += " Moitão não informado: contado como 0 — informe o peso para o número valer.";
    if (i > 0 && melhor) {
      var pq = c.faltam.length > melhor.faltam.length ? "deixa içamento(s) de fora" : c.posicoes.length > melhor.posicoes.length ? (c.posicoes.length - melhor.posicoes.length) + " reposicionamento(s) a mais"
        : (c.criticos > 0) && !(melhor.criticos > 0) ? "tem içamento crítico por utilização" : c.porte > melhor.porte ? "equipamento maior" : c.utilMax > melhor.utilMax ? "menos folga" : "empate desfeito por custo/tempo";
      s += " Abaixo do 1º porque: " + pq + ".";
    }
    return s;
  }

  /* o TERRENO para o agente, a partir de uma sonda cara (no navegador, um raio por ponto no BIM): pede BLOCOS de bloco×bloco
     pontos da grade de `passo` m numa chamada só, guarda, e interpola entre os 4 cantos (bilinear — exato num plano).
     sondar(pts:[{x,y}]) → [z|null]. Canto sem superfície → o ponto fica sem cota (null): o agente usa a cota do apoio e
     não confere a declividade ali, como já faz sem terreno nenhum. */
  function terrenoEmBlocos(sondar, passo, bloco) {
    passo = +passo > 0 ? +passo : 1; bloco = +bloco > 0 ? Math.floor(+bloco) : 8;
    var z = {}, feitos = {}, conta = { chamadas: 0, pontos: 0 };
    function canto(i, j) {
      var k = i + "|" + j; if (k in z) return z[k];
      var bi = Math.floor(i / bloco), bj = Math.floor(j / bloco), kb = bi + "|" + bj;
      if (!feitos[kb]) {
        feitos[kb] = true;
        var pts = [], ids = [];
        for (var a = 0; a < bloco; a++) for (var b = 0; b < bloco; b++) { var ii = bi * bloco + a, jj = bj * bloco + b; pts.push({ x: ii * passo, y: jj * passo }); ids.push(ii + "|" + jj); }
        var r = []; try { r = sondar(pts) || []; } catch (e) { r = []; }
        conta.chamadas++; conta.pontos += pts.length;
        ids.forEach(function (id, n) { var v = r[n]; z[id] = v == null || !isFinite(+v) ? null : +v; });
      }
      return k in z ? z[k] : null;
    }
    var f = function (x, y) {
      var fx = x / passo, fy = y / passo, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      var a = canto(i, j), b = canto(i + 1, j), c = canto(i, j + 1), d = canto(i + 1, j + 1);
      if (a == null || b == null || c == null || d == null) return null;
      return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    };
    f.conta = conta;
    return f;
  }

  var IcarAgente = { PREMISSAS: PREMISSAS, RUMOS: RUMOS, sugerir: sugerir, terrenoEmBlocos: terrenoEmBlocos, comparar: comparar, cabe: function (eq, pos, rumo, ent) { var pp = prem(ent && ent.premissas); return cabe(eq, pos, rumo, contexto(ent || {}, pp), pp, false); },
    polCruza: polCruza, contorno: contorno };
  global.IcarAgente = IcarAgente;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarAgente;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

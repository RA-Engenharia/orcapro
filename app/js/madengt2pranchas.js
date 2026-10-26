/* =====================================================================
 * madengt2pranchas.js — PRANCHAS DA TIPOLOGIA T2 (casa/pavilhão de DUAS ÁGUAS) em MLC (E4, rodada 3). Motor PURO, ES5, sem DOM, Node-testável.
 * Mesmo padrão e mesmo carimbo RA da T1 (js/madengpranchas.js, v2.11 do Padrão RA): este arquivo só acrescenta as folhas próprias da T2 e reaproveita
 * os desenhistas internos da T1 (MadEngPranchas._p). Nada da T1 muda.
 *   MadEngT2.gerar(res, opcoes) → { ok, folhas, avisos, tabela, ferragens, reacoes, marcas, desenhaveis, celulas, pontos, naoEmitir }
 *   MadEngT2.pecasMembros(res)  → uma "peça" por MEMBRO (posição real) — é a entrada do IFC / SketchUp / CYPE da T2 (a fonte agrupa por marca).
 * res = resultado de UMA opção da T2 (js/madengworker.js › rodarT2: fonte, t2.membros, ligacoes, ligacoesT2, reacoes, auditoria…).
 * Folhas: E01 locação/bases/reações · E03 planta de cobertura · E04 elevação da tesoura (ou pórtico) cotada · E05 cortes e elevações · E06 detalhes · E07 contraventamento · E10/E11 tabelas.
 * Teste: node tools/test-mad-eng-t2-saidas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var EP = dep("MadEngPranchas", "./madengpranchas.js"), Q = EP && EP._p, I = Q && Q.I;
  var VERMELHO = "#c00000";

  var NOME_G = { P: "pilar do perímetro", PO: "pilar de oitão", PC: "pilar de cumeeira", FR: "frechal", BS: "banzo superior da tesoura", BI: "banzo inferior (tirante) da tesoura", PD: "montante da tesoura", DG: "diagonal da tesoura", LB: "linha longitudinal do banzo inferior", DX: "diagonal de madeira do contraventamento das águas", DV: "diagonal de madeira do contraventamento vertical", DP: "diagonal de madeira do painel da parede", T: "terça", CM: "viga de cumeeira", CB: "caibro principal" };
  var PREF = { P: "PL", PO: "PL", PC: "PL", FR: "FR", BS: "BS", BI: "BI", PD: "PD", DG: "DG", T: "TL", CM: "CM", CB: "CB", LB: "LB", DX: "DX", DV: "DV", DP: "DP" };
  var NOME_PREF = { PL: "pilar", FR: "frechal", BS: "banzo superior", BI: "banzo inferior", PD: "montante", DG: "diagonal", TL: "terça", CM: "cumeeira", CB: "caibro", LB: "linha do banzo inferior", DX: "diagonal de contraventamento", DV: "diagonal de contraventamento vertical" };
  var ESC_PLANTA = [50, 100];

  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { var x = Number(v); return v == null || v === "" || !isFinite(x) ? d : x; }
  function R(x, n) { var p = Math.pow(10, n == null ? 3 : n); return Math.round(x * p) / p; }
  function br(v, c) { return I.br(v, c); }

  /* ================================================================ PEÇAS POR MEMBRO */
  function mlcMaterial(res) { var p = arr(res.fonte && res.fonte.pecas).filter(function (x) { return /MLC/.test(x.material || ""); })[0]; return p ? p.material : "MLC GL24h (EN 14080)"; }
  /** uma peça por MEMBRO do modelo (res.t2.membros): mesma seção, mesmo "up" e mesmo volume da fonte agrupada (t2Fonte) — mas com a POSIÇÃO de cada uma */
  function pecasMembros(res) {
    var mat = mlcMaterial(res), out = [];
    if (!res || !res.t2) return out;
    arr(res.t2.membros).forEach(function (m) {
      var s = res.secoes && res.secoes[m.g === "DV" ? "DX" : m.g]; if (!PREF[m.g] || !s || !s.b || !s.h) return;
      var dx = m.p1[0] - m.p0[0], dy = m.p1[1] - m.p0[1], dz = m.p1[2] - m.p0[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz), Lyz = Math.sqrt(dy * dy + dz * dz);
      var ic = res.t2.params.incl, nq = Math.sqrt(1 + ic * ic), up = m.g === "DX" ? [0, (m.agua === "F" ? -1 : 1) * ic / nq, 1 / nq] : (m.g === "DV" ? [0, 1, 0] : (Lyz < 1e-6 ? [0, 0, 1] : (Lyz < 0.3 * L ? [0, 0, 1] : (Math.abs(dz) > 0.9 * L && /^(P|PO|PC)$/.test(m.g) ? [1, 0, 0] : [0, -dz / Lyz * (dy >= 0 ? 1 : -1), Math.abs(dy) / Lyz]))));
      out.push({ id: m.id, g: m.g, marca: m.g, grupo: "Casa T2 — " + NOME_G[m.g], descricao: NOME_G[m.g].charAt(0).toUpperCase() + NOME_G[m.g].slice(1), material: mat, especificacao: "MLC " + (Q.classeDe(mat)) + " " + I.cm(s.b) + "×" + I.cm(s.h) + " cm",
        secao: { tipo: "ret", b: s.b, h: s.h }, p0: m.p0, p1: m.p1, up: up, qtd: 1, comprimento_m: L, volume_m3: s.b * s.h * L, unidade: "peça", tes: m.tes, agua: m.agua });
    });
    return out;
  }

  /* ================================================================ CONTEXTO */
  function contexto(res) {
    var pecas = pecasMembros(res), pcs = Q.desenhaveis(pecas), porId = {}, d = { res: res, pecasM: pecas };
    pecas.forEach(function (p) { porId[p.id] = p; });
    pcs.forEach(function (pc) { var p = porId[pc.id]; pc.g = p.g; pc.tes = p.tes; pc.agua = p.agua; pc.prefixo = PREF[p.g]; });
    d.pcs = pcs; d.marcas = Q.marcar(pcs);
    d.grupo = function () { var gs = Array.prototype.slice.call(arguments); return pcs.filter(function (p) { return gs.indexOf(p.g) >= 0; }); };
    d.pilares = d.grupo("P", "PO", "PC");
    d.fitas = arr(res.t2.membros).filter(function (m) { return m.g === "FX" || m.g === "FP" || m.g === "DP" || m.g === "TI" || m.g === "FV"; });
    d.fonteTodos = arr(res.fonte && res.fonte.pecas);
    d.pend = {}; arr(res.auditoria && res.auditoria.achados).forEach(function (a) { if (a.peca) d.pend[a.peca] = a.mensagem; });
    pcs.forEach(function (pc) { if (!pc.marca) pc.marca = d.marcas.porId[pc.id]; });
    return d;
  }
  function eixos(pil, k) {
    var v = []; pil.forEach(function (p) { var x = R(p.p0[k], 3); if (v.indexOf(x) < 0) v.push(x); });
    v.sort(function (a, b) { return a - b; });
    return v.map(function (x, i) { return { v: x, nome: k === 0 ? String(i + 1) : String.fromCharCode(65 + i) }; });
  }
  function reacaoDe(res, id) { var ks = Object.keys(res.reacoes || {}); for (var i = 0; i < ks.length; i++) if (res.reacoes[ks[i]].mem === id) return { k: ks[i], q: res.reacoes[ks[i]] }; return null; }
  function yTfn(inf) { return function (z) { var i = inf.incl, b = inf.b; return z < 0 ? inf.Hp + i * z : (z > b ? inf.Hp + i * (b - z) : inf.Hp + i * Math.min(z, b - z)); }; }
  /* E4 r4: balão com chamada em lugar LIVRE — tenta o afastamento pedido e, se o círculo cair em cima de traço/texto ou a chamada cortar texto, outros (mesma direção mais longe, giros de 45 graus). Sem lugar livre, fica o pedido. */
  function lugarBal(D, x, y, dx, dy, n) {
    var rb = D.raioBalao(String(n)), L0 = Math.sqrt(dx * dx + dy * dy) || 10, a0 = Math.atan2(dy, dx), cands = [[dx, dy]], k, f, g;
    for (f = 0; f < 5; f++) for (k = 0; k < 12; k++) { g = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6; cands.push([Math.cos(g) * L0 * (1 + 0.6 * f), Math.sin(g) * L0 * (1 + 0.6 * f)]); }
    for (k = 0; k < cands.length; k++) {
      var cx = x + cands[k][0], cy = y + cands[k][1], d = Math.sqrt(cands[k][0] * cands[k][0] + cands[k][1] * cands[k][1]) || 1;
      if (!D.livre([cx - rb, cy - rb, cx + rb, cy + rb], 0.5)) continue;
      if (D.cortaTexto(x, y, cx - cands[k][0] / d * rb, cy - cands[k][1] / d * rb)) continue;
      return cands[k];
    }
    return cands[0];
  }
  function bal(D, x, y, dx, dy, n) {
    var o = lugarBal(D, x, y, dx, dy, n); dx = o[0]; dy = o[1];
    var rb = D.raioBalao(String(n)), Lh = Math.sqrt(dx * dx + dy * dy) || 1;
    D.linha(x, y, x + dx - dx / Lh * rb, y + dy - dy / Lh * rb, "MAD-FINA"); D.ponto(x, y, 0.45); D.balao(x + dx, y + dy, String(n), ' data-bal="' + n + '"');
  }
  /* cota de UM trecho curto (o texto não cabe entre os traços): linha e traços sem texto e o texto FORA do trecho, junto da ponta, sem atravessar traço (a cadeia do motor deixa o texto no meio, sobre os traços). */
  function cotaCurta(D, A, B, off, val, o) {
    var h = D.E.T.cota, L = Math.sqrt(Math.pow(B[0] - A[0], 2) + Math.pow(B[1] - A[1], 2)), ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, nx = uy, ny = -ux;
    var ang = Math.atan2(uy, ux) * 180 / Math.PI, rx = ux, ry = uy; if (ang > 90.01 || ang < -90.01) { ang = ang > 0 ? ang - 180 : ang + 180; rx = -ux; ry = -uy; }
    var tnx = ry, tny = -rx, w = String(val).length * h * 0.62, vert = Math.abs(ang) > 45;
    D.cota(A[0], A[1], B[0], B[1], off, "", o);
    var QA = [A[0] + nx * off, A[1] + ny * off], QB = [B[0] + nx * off, B[1] + ny * off], lados = [[QB, 1], [QA, -1]], esc = null, i;
    for (i = 0; i < 2 && !esc; i++) {
      var Q0 = lados[i][0], sg = lados[i][1], sobe = [0.8, -(h + 0.8)];
      for (var j = 0; j < 2 && !esc; j++) {
        var mx = Q0[0] + sg * ux * (w / 2 + 1.6) + tnx * sobe[j], my = Q0[1] + sg * uy * (w / 2 + 1.6) + tny * sobe[j], hx = vert ? h * 0.55 : w / 2, hy = vert ? w / 2 : h * 0.55;
        if (D.livre([mx - hx, my - hy - (vert ? 0 : h * 0.2), mx + hx, my + hy], 0.25) || (i === 1 && j === 1)) esc = { mx: mx, my: my, Q0: Q0, sg: sg };
      }
    }
    D.linha(esc.Q0[0] + esc.sg * ux * 1.2, esc.Q0[1] + esc.sg * uy * 1.2, esc.Q0[0] + esc.sg * ux * (w + 2.4), esc.Q0[1] + esc.sg * uy * (w + 2.4), "MET-COTA");
    D.texto(esc.mx, esc.my, String(val), h, { al: "C", rot: ang, attr: o && o.attrs ? (Array.isArray(o.attrs) ? o.attrs[0] : o.attrs) : "" });
  }
  function camT2(pc) { return pc.g === "BS" || pc.g === "T" || pc.g === "CM" || pc.g === "CB" ? "MAD-PRINCIPAL" : "MAD-PECA"; }

  /** vista de peças num retângulo r do papel; plano "YZ" (corte), "XZ" (elevação lateral) ou "XY" (planta). Devolve { f3, s, esc0, cx, ox, oy, itens } */
  function vistaPecas(c, lista, plano, r, o) {
    o = o || {};
    var D = c.D, T = D.E.T, cx = Q.caixaPontos(lista), W = plano === "YZ" ? cx.y1 - cx.y0 : cx.x1 - cx.x0, H = plano === "XY" ? cx.y1 - cx.y0 : cx.z1 - cx.z0, mx = o.mx || 34, my = o.my || 30, topo = 14;
    var esc0 = I.escolher(o.escs || [20, 25, 50, 100], function (e) { var s = 1000 / e; return W * s + 2 * mx <= r.w && H * s + 2 * my + topo <= r.h; }), s = 1000 / esc0;
    var ox = r.x + mx + Math.max(0, (r.w - 2 * mx - W * s) / 2), oy = r.y + topo + my, f3;
    if (plano === "YZ") f3 = Q.planoYZ(s, ox, oy, cx.y0, cx.z1); else if (plano === "XZ") f3 = Q.planoXZ(s, ox, oy, cx.x0, cx.z1); else f3 = Q.planoXY(s, ox, oy, cx.x0, cx.y1);
    I.tituloVista(D, r.x, r.y, o.titulo, "ESC 1:" + esc0);
    var itens = Q.desenharLista(D, c, lista, f3, o.cam || camT2);
    return { f3: f3, s: s, esc0: esc0, cx: cx, ox: ox, oy: oy, itens: itens, W: W * s, H: H * s };
  }

  /* ================================================================ E01 — LOCAÇÃO, BASES E REAÇÕES */
  function folhaE01(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, pil = d.pilares, res = c.res;
    if (!pil.length) { D.texto(a.x + 10, a.y + 20, "Fonte sem pilares: sem locação, não emitir.", T.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var X = eixos(pil, 0), Y = eixos(pil, 1), W = X[X.length - 1].v - X[0].v, Hh = Y[Y.length - 1].v - Y[0].v;
    var esc0 = I.escolher(ESC_PLANTA, function (e) { var s = 1000 / e; return W * s + 90 <= a.w * 0.54 && Hh * s + 90 <= a.h * 0.55; }), s = 1000 / esc0, ox = a.x + 40, oy = a.y + 54, y1 = Y[Y.length - 1].v, f3 = Q.planoXY(s, ox, oy, X[0].v, y1);
    I.tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE LOCAÇÃO DAS BASES", "ESC 1:" + esc0);
    var P0 = f3([X[0].v, y1]), P1 = f3([X[X.length - 1].v, Y[0].v]), caixa = [P0[0], P0[1], P1[0], P1[1]];
    Q.eixosEmPlanta(c, f3, X, Y, caixa, 14);
    var L = res.ligacoes, placa = L.placaBase.dimensoes_mm[0] / 1000, rows = [];
    pil.forEach(function (pc, i) {
      var C = f3([pc.p0[0], pc.p0[1]]), w = placa * s, wp = pc.b * s, rc = reacaoDe(res, pc.id), ex = X.filter(function (e) { return Math.abs(e.v - R(pc.p0[0], 3)) < 1e-6; })[0], ey = Y.filter(function (e) { return Math.abs(e.v - R(pc.p0[1], 3)) < 1e-6; })[0];
      D.ret(C[0] - w / 2, C[1] - w / 2, w, w, "MAD-ACO", ' data-base="' + pc.id + '" data-peca="' + I.esc(pc.id) + '" data-marca="' + I.esc(pc.marca) + '"');
      D.ret(C[0] - wp / 2, C[1] - wp / 2, wp, wp, "MAD-OCULTA");
      D.linha(C[0] - wp * 0.35, C[1], C[0] + wp * 0.35, C[1], "MAD-ACO"); D.linha(C[0], C[1] - wp * 0.35, C[0], C[1] + wp * 0.35, "MAD-ACO");
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { D.circ(C[0] + sx * (placa - 0.1) / 2 * s, C[1] + sy * (placa - 0.1) / 2 * s, 0.8, "MAD-LIG"); }); });
      D.texto(C[0] + 1.5, C[1] - w / 2 - 1.3, "BA-" + ("0" + (i + 1)).slice(-2), T.marca, { attr: ' data-rotulo="BA-' + (i + 1) + '"' });
      D.texto(C[0] + 1.5, C[1] + w / 2 + T.marcaDensa * 0.76 + 1.0, (ex ? ex.nome : "?") + "-" + (ey ? ey.nome : "?"), T.marcaDensa);
      rows.push({ ba: "BA-" + ("0" + (i + 1)).slice(-2), pc: pc, rc: rc, eixo: (ex ? ex.nome : "?") + "-" + (ey ? ey.nome : "?"), x: pc.p0[0] - X[0].v, y: pc.p0[1] - Y[0].v });
    });
    var xD = Math.max(caixa[2] + 50, a.x + 270), ed = (a.x + a.w - xD) >= 380 ? 5 : 10, yDet = a.y + 2;
    I.tituloVista(D, xD, yDet, "BASE BA-01 (LG01) - PLANTA E ELEVAÇÃO", "ESC 1:" + ed);
    var bp = Q.basePlanta(c, D, xD, yDet + 22, ed), be = Q.baseElevacao(c, D, xD + bp.w + 4, yDet + 22, ed);
    var yq = Math.max(caixa[3] + 40, Math.max(yDet + 22 + bp.h, be.y1) + 30), xq = a.x + 4;
    var hT = I.tituloVista(D, xq, yq, "QUADRO DE REAÇÕES NA FUNDAÇÃO (kN, kN.m) - VALORES DE CÁLCULO", null) + 1;
    var cols = [{ t: "BASE" }, { t: "PILAR" }, { t: "EIXO" }, { t: ["x", "(cm)"] }, { t: ["y", "(cm)"] }, { t: ["N compressão", "máx (kN)"] }, { t: ["N tração", "mín (kN)"] }, { t: ["H", "máx (kN)"] }, { t: ["M", "máx (kN.m)"] }, { t: "OBS.", al: "E" }];
    var lin = rows.map(function (r0) {
      var q = r0.rc ? r0.rc.q : null, k = r0.rc ? r0.rc.k : "-";
      function cel(nome, v) { return { t: q ? br(v, 2) : "-", attr: q ? ' data-rN="' + k + '|' + nome + '|' + R(v, 2) + '"' : "" }; }
      return [{ t: r0.ba + " (" + k + ")", attr: ' data-reacao="' + k + '"' }, r0.pc.id, r0.eixo, I.cm(r0.x), I.cm(r0.y), cel("Nmax", q && q.Nmax), cel("Nmin", q && q.Nmin), cel("Hmax", q && q.Hmax), cel("Mmax", q && q.Mmax),
        { t: q && q.Nmin < 0 ? "ARRANCAMENTO: a fundação resiste à tração (" + Q.ponto(c, "arrancamento", "E01", "Reação de arrancamento (N < 0) em bases do quadro: a fundação (outra empresa) precisa resistir à tração e ancorar os chumbadores", "", "fundação") + ")" : "" }];
    });
    var tb = D.tabela(xq, yq + hT, cols, lin, { fs: T.tabela, hl: 5.2 }), yy = yq + hT + tb.h + 3;
    D.textos(xq, yy, [
      "Valores de CÁLCULO (combinações últimas, NBR 8681), na base de cada pilar; N > 0 compressão, N < 0 arrancamento. Base engastada: o momento M entra no bloco/sapata. A base BA-01 detalhada é a do pilar de maior momento; as demais seguem a mesma ligação (LG01) com a placa de " + Math.round(placa * 1000) + " mm.",
      { t: "Decomposição característica G / Q / vento (a ser pedida pela fundação): o motor devolve só a envoltória de cálculo (" + Q.ponto(c, "reacoes-carac", "E01", "Decomposição característica das reações em G / Q / vento: o motor devolve só a envoltória de cálculo", "reações de cálculo da tabela; a fundação pede a decomposição ao calculista", "RT") + ").", attr: ' data-pend="reacoes-caracteristicas"' },
      "Tolerância de locação dos chumbadores e de nível da placa: definir com a fundação (" + Q.ponto(c, "embutimento", "LG01, E01", "Embutimento e sistema químico do chumbador M20, argamassa de nivelamento sob a placa e tolerância de locação dos chumbadores: pela fundação (outra empresa)", "", "fundação") + ")."
    ], T.nota * 0.9, { wmax: 560 });
    c.rows = rows;
    return { escala: "1:" + esc0 + " e 1:" + ed };
  }

  /* ================================================================ E03 — PLANTA DE COBERTURA */
  function folhaE03(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, sis = res.sistema, inf = res.t2.info;
    var lista = d.pcs.filter(function (p) { return p.g !== "PD" && p.g !== "DG" && p.g !== "DP"; }), madC = !d.fitas.some(function (m) { return m.g === "FX"; }) && d.pcs.some(function (p) { return p.g === "DX"; });
    var pl = Q.plantaPecas(c, lista, { tit: "PLANTA DE COBERTURA - " + (sis === "tesoura" ? "TESOURAS, TERÇAS, CUMEEIRA" : "CUMEEIRA PORTANTE, CAIBROS") + ", FRECHAIS E " + (madC ? "CONTRAVENTAMENTO" : "FITA"), fw: 0.64 }), f3 = pl.f3;
    var ord = { P: 0, PO: 0, PC: 0, FR: 1, T: 2, CM: 3, BS: 2, BI: 3, CB: 2, LB: 3, DX: 3, DV: 3 };
    var itens = Q.desenharLista(D, c, lista.slice().sort(function (p, q) { return ord[p.g] - ord[q.g]; }), f3, function (p) { return p.g === "BI" || p.g === "CM" || p.g === "T" || p.g === "DX" ? "MAD-PRINCIPAL" : "MAD-PECA"; });
    var fx = d.fitas.filter(function (m) { return m.g === "FX"; });
    fx.forEach(function (m) { var A = f3(m.p0), B = f3(m.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-FINA", ' data-peca="' + I.esc(m.id) + '" data-marca="TI-01"'); });
    d.fitas.filter(function (m) { return m.g === "FV"; }).forEach(function (m) { var A = f3(m.p0), B = f3(m.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-FINA", ' data-peca="' + I.esc(m.id) + '" data-marca="TI-03"'); });      /* FV (plano vertical): na planta cai sobre a linha LB */
    Q.eixosEmPlanta(c, f3, eixos(d.pilares, 0), eixos(d.pilares, 1).slice(0, 0), pl.caixa, 12);
    Q.rotular(c, itens.filter(function (it) { return it.pc.g === "T" || it.pc.g === "CM" || it.pc.g === "BI" || it.pc.g === "FR"; }), T.marca, { umaPorMarca: true, raio: 30 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.g === "BS" || it.pc.g === "CB" || it.pc.g === "DX"; }), T.marcaDensa, { umaPorMarca: true, raio: 34 });
    Q.rotular(c, itens.filter(function (it) { return it.pc.prefixo === "PL"; }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var f0 = fx[0];
    if (f0) { var A = f3(f0.p0), B = f3(f0.p1), mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, lg = D.procura([mx, my - 10], 14, 4, [pl.caixa[0] - 2, pl.caixa[1] - 2, pl.caixa[2] + 2, pl.caixa[3] + 2], { raio: 40 }); if (lg) { D.texto(lg[0], lg[1], "TI-01", T.marcaDensa, { al: "C", meio: true }); D.linha(mx, my, Q.tipoChamada(lg, mx, my)[0], Q.tipoChamada(lg, mx, my)[1], "MAD-FINA"); D.ponto(mx, my, 0.4); } }
    var xr = a.x + a.w * 0.66, yr = a.y + 18;
    var Lg = Q.legenda(D, xr, yr, [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: (sis === "tesoura" ? "terça TL, cumeeira CM e banzo inferior BI (tirante)" : "cumeeira CM e terça/caibro") }, { tipo: "ret", cam: "MAD-PECA", t: "pilar PL, frechal FR, " + (sis === "tesoura" ? "banzo superior BS" : "caibro CB") },
      (madC ? { tipo: "ret", cam: "MAD-PRINCIPAL", t: "diagonal de madeira DX em X nas águas (ver E07); linhas LB no banzo inferior" } : { tipo: "linha", cam: "MAD-FINA", t: "fita metálica em X nas águas, TI-01 (ver E07)" }), { tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria (vermelho)" }], T.nota * 0.9);
    var yS = yr + Lg + 6;
    D.texto(xr, yS + 3, "Inclinação das águas: i = " + Q.pct(inf.incl) + ", caindo para os beirais (frente -y e fundo +y).", T.nota * 0.95);
    D.seta(xr + 90, yS + 8, 0, 1, 3);
    var yy2 = yS + 14, tx = [];
    if (sis === "tesoura") tx.push(inf.nCol + 1 + " tesouras a cada " + br(inf.xs[1] - inf.xs[0], 2) + " m (eixos 1 a " + (inf.nCol + 1) + "); terças nos nós do banzo superior; elevação da tesoura na folha E04.");
    else tx.push("Cumeeira apoiada em " + d.grupo("PC").length + " pilares de cumeeira (vão máx. " + br(res.t2.params.vMaxPilar, 1) + " m); " + d.grupo("CB").length + " caibros principais; pórtico típico na folha E04; assento deslizante do caibro no frechal (LG-CP3).");
    tx.push("Cortes A-A e elevações do oitão e lateral: folha E05.");
    yy2 += D.textos(xr, yy2, tx, T.nota * 0.9, { wmax: a.x + a.w - xr - 3 }) + 2;
    var marcasDesenhadas = ["PL", "FR", "BS", "BI", "PD", "DG", "TL", "CM", "CB", "DX", "DV", "DP", "LB"].filter(function (mk) { return lista.some(function (p) { return PREF[p.g] === mk; }); });      /* r13: o quadro lista SÓ as marcas desenhadas NESTA folha */
    Q.tabMarcas(c, xr, yy2 + 4, marcasDesenhadas, "QUADRO DE MARCAS DA COBERTURA E DA CASA", 150);
    return { escala: "1:" + pl.esc0 };
  }

  /* ================================================================ E04 — ELEVAÇÃO DA TESOURA / PÓRTICO COTADA */
  function nosDoPortico(c) {
    var res = c.res, inf = res.t2.info, yT = yTfn(inf), b = inf.b, dz = inf.dz, Hp = inf.Hp, L = res.ligacoesT2.ligacoes;
    if (res.sistema === "tesoura") return [
      { n: 1, y: 0, z: Hp, cod: "TS-5", t: "Apoio da tesoura no pilar (chapa em T / garfo)", eta: L.tesouraPilar && L.tesouraPilar.eta },
      { n: 2, y: b / 2, z: yT(b / 2), cod: "TS-1", t: "Nó do banzo superior na cumeeira (chapa interna 8 mm)", eta: L.noBanzoSuperior && L.noBanzoSuperior.eta },
      { n: 3, y: dz, z: Hp, cod: "TS-2", t: "Nó do banzo inferior (tirante)", eta: L.noBanzoInferior && L.noBanzoInferior.eta },
      { n: 4, y: dz, z: (Hp + yT(dz)) / 2, cod: "TS-3", t: "Pendural (chapa interna + pinos nas duas pontas)", eta: L.noPendural && L.noPendural.eta },
      { n: 5, y: dz * 1.5, z: (Hp + yT(dz * 2)) / 2 - 0.0, cod: "TS-4", t: "Diagonal (chapa interna + pinos nas duas pontas)", eta: L.noDiagonal && L.noDiagonal.eta },
      { n: 6, y: dz, z: yT(dz), cod: "TS-6", t: "Terça sobre o banzo superior (rosca total a 45 gr)", eta: L.tercaTesoura && L.tercaTesoura.eta }];
    return [
      { n: 1, y: b / 2, z: yT(b / 2) - 0.0, cod: "CP-1", t: "Cumeeira sobre o pilar de cumeeira (chapa em T + garfo)", eta: L.cumeeiraPilar && L.cumeeiraPilar.eta },
      { n: 2, y: b / 4, z: (yT(b / 2) + Hp) / 2, cod: "CP-2", t: "Caibro na cumeeira (rosca total a 45 gr)", eta: L.caibroCumeeira && L.caibroCumeeira.eta },
      { n: 3, y: 0, z: Hp, cod: "CP-3", t: "Caibro no frechal (assento deslizante)", eta: L.caibroFrechal && L.caibroFrechal.eta },
      { n: 4, y: b, z: Hp, cod: "CP-4", t: "Frechal sobre o pilar (garfo + pinos)", eta: L.frechalPilar && L.frechalPilar.eta }];
  }
  function folhaE04(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, sis = res.sistema, inf = res.t2.info, yT = yTfn(inf), b = inf.b, Hp = inf.Hp, baseZ = res.t2.params.baseZ || 0, i = inf.incl;
    var xRef = inf.xs[Math.min(1, inf.xs.length - 1)];
    if (sis === "cumeeira") { var pc0 = d.grupo("PC").filter(function (p) { return p.p0[0] > 1e-6 && p.p0[0] < inf.a - 1e-6; })[0]; xRef = pc0 ? pc0.p0[0] : inf.xs[0]; }
    function em(p) { return Math.abs(p.p0[0] - xRef) < 1e-3 && Math.abs(p.p1[0] - xRef) < 1e-3; }
    var lista = d.pcs.filter(function (p) { return (em(p) && ["P", "PC", "BS", "BI", "PD", "DG", "CB"].indexOf(p.g) >= 0) || (["T", "CM", "FR"].indexOf(p.g) >= 0); });
    var r = { x: a.x + 4, y: a.y + 2, w: a.w - 8, h: a.h * 0.62 };
    var v = vistaPecas(c, lista, "YZ", r, { titulo: sis === "tesoura" ? "ELEVAÇÃO DA TESOURA TÍPICA (EIXO " + (inf.xs.indexOf(xRef) + 1) + ") - GEOMETRIA, SEÇÕES E NÓS" : "PÓRTICO TÍPICO DA CUMEEIRA PORTANTE - CORTE NO PILAR DE CUMEEIRA", mx: 46, my: 34, escs: [20, 25, 50, 100] }), f3 = v.f3, yEnd = v.oy + v.H + 40;
    /* cotas: cadeia dos beirais e do vão (abaixo), pé-direito e alturas (à esquerda), painéis do banzo (acima) */
    var yb = f3([0, v.cx.y0, v.cx.z0])[1] + 8, pts = [[-(res.t2.params.beiral.frente), "bf"], [0, ""], [b, ""], [b + res.t2.params.beiral.fundo, "bb"]];
    var Pp = pts.map(function (q) { return [f3([0, q[0], 0])[0], yb]; }), vals = [I.cm(res.t2.params.beiral.frente), I.cm(b), I.cm(res.t2.params.beiral.fundo)];
    D.cadeia(Pp, -7, vals, { semExt: true, offs: [7, -14], attrs: vals.map(function () { return ' data-cota="vao"'; }) });       /* E4 r4: cota ABAIXO da base (com +7 a linha ficava a 1 mm da base e o texto, em cima dela, era cortado pelo pé do pilar) */
    var xl = f3([0, v.cx.y0, 0])[0] - 8;
    D.cota(xl, f3([0, 0, baseZ])[1], xl, f3([0, 0, Hp])[1], -6, I.cm(Hp - baseZ), { semExt: true, attrs: ' data-cota="pe-direito"' });
    D.cota(xl - 14, f3([0, 0, baseZ])[1], xl - 14, f3([0, 0, yT(b / 2)])[1], -6, I.cm(yT(b / 2) - baseZ), { semExt: true, attrs: ' data-cota="altura-cumeeira"' });
    if (sis === "tesoura") {
      var ys = []; for (var j = 0; j <= 2 * inf.nH; j++) ys.push(j * inf.dz);
      var ytop = f3([0, 0, yT(b / 2)])[1] - 26, Pq = ys.map(function (z) { return [f3([0, z, 0])[0], ytop]; }), vq = []; for (var j2 = 0; j2 < ys.length - 1; j2++) vq.push(I.cm(inf.dz));
      D.cadeia(Pq, 6, vq, { semExt: true, attrs: vq.map(function () { return ' data-cota="painel"'; }) });
    }
    Q.rotular(c, v.itens.filter(function (it) { return em(it.pc) || it.pc.g === "CM" || it.pc.g === "T" || it.pc.g === "FR"; }), T.marca, { umaPorMarca: true, raio: 30, raio2: 60 });   /* E4 r4: os rótulos DEPOIS das cotas (a busca de lugar livre enxerga traços e traços de cota) e ANTES dos balões */
    D.nivel(f3([0, v.cx.y1, 0])[0] + 4, f3([0, 0, baseZ])[1], "+0,000m", 1, ' data-nivel="1"');
    D.nivel(f3([0, v.cx.y1, 0])[0] + 4, f3([0, 0, Hp])[1], Q.nv((Hp - baseZ) * 1000), 1, ' data-nivel="1"');
    D.nivel(f3([0, v.cx.y1, 0])[0] + 4, f3([0, 0, yT(b / 2)])[1], Q.nv((yT(b / 2) - baseZ) * 1000), 1, ' data-nivel="1"');
    var nos = nosDoPortico(c);
    nos.forEach(function (nn, k) { var P = f3([0, nn.y, nn.z]); bal(D, P[0], P[1], (k % 2 ? 1 : -1) * 15, -(14 + (k % 3) * 5), nn.n); });
    D.texto(r.x + 2, yEnd - 6, "Inclinação das águas i = " + Q.pct(i) + ". Seções em cm (b x h); comprimentos em cm; nós de 1 a " + nos.length + " detalhados na folha E06.", T.nota * 0.95);
    /* quadro de nós e esforços */
    var xr = a.x + 4, yy = yEnd + 4;
    var hT = I.tituloVista(D, xr, yy, "NÓS E LIGAÇÕES DESTA ELEVAÇÃO", null) + 1;
    var lin = nos.map(function (nn) { return [{ t: String(nn.n), attr: ' data-no="' + nn.n + '"' }, nn.cod, { t: nn.t, al: "E" }, nn.eta == null ? "-" : br(nn.eta, 3)]; });
    var tb = D.tabela(xr, yy + hT, [{ t: "Nº" }, { t: "DETALHE" }, { t: "LIGAÇÃO", al: "E" }, { t: "η" }], lin, { fs: T.tabela * 0.92, hl: 5 }), y2 = yy + 2, xn = a.x + a.w * 0.5;
    var P = res.secoes;
    var sec = Object.keys(P).filter(function (g) { return PREF[g] && P[g] && P[g].b && d.pcs.some(function (p) { return p.g === g; }); }).map(function (g) { return PREF[g] === "PL" ? g : g; });
    var linhas = ["Seções adotadas (cm): " + sec.map(function (g) { return g + " " + I.cm(P[g].b) + "x" + I.cm(P[g].h); }).join("; ") + ".", "η máximo por grupo: " + Object.keys(res.pior || {}).map(function (g) { return g + " " + br(res.pior[g], 2); }).join("; ") + "."];
    if (sis === "tesoura") linhas.push("Tesoura tipo Pratt (diagonais tracionadas sob gravidade): " + (2 * inf.nH) + " painéis de " + br(inf.dz, 3) + " m na planta; 1 banzo inferior contínuo, 2 banzos superiores, pendurais e diagonais com chapa interna de 8 mm. Tesouras de oitão (eixos 1 e " + (inf.nCol + 1) + ") têm os pilares de oitão PL sob o banzo inferior.");
    else linhas.push("Cumeeira portante: o caibro apoia no frechal por assento deslizante (livre transversalmente: sem empuxo na parede) e na viga de cumeeira com rosca total a 45 gr; viga de cumeeira multiapoiada nos pilares de cumeeira.");
    D.textos(xn, y2, linhas, T.nota * 0.95, { wmax: a.x + a.w - xn - 3 });
    return { escala: "1:" + v.esc0 };
  }

  /* ================================================================ E05 — CORTES E ELEVAÇÕES GERAIS */
  function folhaE05(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, inf = res.t2.info, yT = yTfn(inf), b = inf.b, Hp = inf.Hp, baseZ = res.t2.params.baseZ || 0, B = res.t2.params.beiral, ae = inf.a;
    var xMeio = (inf.xs[0] + inf.xs[Math.min(1, inf.xs.length - 1)]) / 2;
    /* A-A: corte entre dois pórticos (terças, cumeeira e frechais cortados; o pórtico seguinte ao fundo) */
    var xRef = inf.xs[Math.min(1, inf.xs.length - 1)];
    function emRef(p) { return Math.abs(p.p0[0] - xRef) < 1e-3 && Math.abs(p.p1[0] - xRef) < 1e-3; }
    var lA = d.pcs.filter(function (p) { return (emRef(p) && ["P", "PC", "BS", "BI", "PD", "DG", "CB"].indexOf(p.g) >= 0) || ["T", "CM", "FR"].indexOf(p.g) >= 0; });
    var rA = { x: a.x + 4, y: a.y + 2, w: a.w * 0.44, h: a.h * 0.5 - 4 };
    var vA = vistaPecas(c, lA, "YZ", rA, { titulo: "CORTE TRANSVERSAL A-A - AS DUAS ÁGUAS, BEIRAIS E NÍVEIS", mx: 40, my: 30, escs: [25, 50, 100], cam: function (p) { return emRef(p) && p.g !== "T" && p.g !== "CM" && p.g !== "FR" ? "MAD-OCULTA" : "MAD-CORTE"; } }), fA = vA.f3;
    var xl = fA([0, vA.cx.y0, 0])[0] - 8;
    D.cota(xl, fA([0, 0, baseZ])[1], xl, fA([0, 0, Hp])[1], -6, I.cm(Hp - baseZ), { semExt: true, attrs: ' data-cota="pe-direito"' });
    var Pp = [[-B.frente, 0], [0, 0], [b, 0], [b + B.fundo, 0]].map(function (q) { return [fA([0, q[0], 0])[0], fA([0, 0, vA.cx.z0])[1] + 8]; });
    D.cadeia(Pp, -7, [I.cm(B.frente), I.cm(b), I.cm(B.fundo)], { semExt: true, offs: [7, -14], attrs: [0, 1, 2].map(function () { return ' data-cota="vao"'; }) });
    [[baseZ, "+0,000m"], [Hp, Q.nv((Hp - baseZ) * 1000)], [yT(b / 2), Q.nv((yT(b / 2) - baseZ) * 1000)], [yT(-B.frente), Q.nv((yT(-B.frente) - baseZ) * 1000)]].forEach(function (q) { D.nivel(fA([0, vA.cx.y1, 0])[0] + 4, fA([0, 0, q[0]])[1], q[1], 1, ' data-nivel="1"'); });
    var Pe = fA([0, -B.frente, yT(-B.frente)]), Pc = fA([0, b / 2, yT(b / 2)]), Pf = fA([0, b + B.fundo, yT(b + B.fundo)]);
    D.linha(Pe[0], Pe[1], Pc[0], Pc[1], "MAD-FINA"); D.linha(Pc[0], Pc[1], Pf[0], Pf[1], "MAD-FINA");
    Q.rotular(c, vA.itens.filter(function (it) { return it.pc.g === "T" || it.pc.g === "CM" || it.pc.g === "FR"; }), T.marca, { umaPorMarca: true, raio: 30, raio2: 60 });
    /* oitão (x = 0): pilares de oitão, tesoura/caibros do oitão, fita da parede */
    var lO = d.pcs.filter(function (p) { return Math.abs(p.p0[0]) < 1e-3 && Math.abs(p.p1[0]) < 1e-3 && ["P", "PO", "PC", "BS", "BI", "PD", "DG", "CB"].indexOf(p.g) >= 0; }).concat(d.pcs.filter(function (p) { return p.g === "CM" || p.g === "FR"; }));
    var rO = { x: a.x + 4 + a.w * 0.46, y: a.y + 2, w: a.w * 0.44, h: a.h * 0.5 - 4 };
    var vO = vistaPecas(c, lO, "YZ", rO, { titulo: "ELEVAÇÃO DO OITÃO (EIXO 1) - PILARES, " + (res.sistema === "tesoura" ? "TESOURA" : "CAIBROS") + " E CONTRAVENTAMENTO DA PAREDE", mx: 40, my: 30, escs: [25, 50, 100] }), fO = vO.f3;
    d.fitas.filter(function (m) { return (m.g === "FP" || m.g === "DP") && Math.abs(m.p0[0]) < 1e-3 && Math.abs(m.p1[0]) < 1e-3; }).forEach(function (m) { var A = fO(m.p0), Bq = fO(m.p1); D.linha(A[0], A[1], Bq[0], Bq[1], m.g === "DP" ? "MAD-PRINCIPAL" : "MAD-FINA", ' data-peca="' + I.esc(m.id) + '" data-marca="' + (m.g === "DP" ? (d.marcas.porId[m.id] || "DP") : "TI-02") + '"'); });
    Q.rotular(c, vO.itens.filter(function (it) { return it.pc.g !== "PD" && it.pc.g !== "DG"; }), T.marcaDensa, { umaPorMarca: true, raio: 30, raio2: 60 });
    var Po = fO([0, 0.2 * b, 1.0]); D.texto(Po[0], Po[1], d.fitas.some(function (m) { return m.g === "DP"; }) ? "DP" : "TI-02", T.marcaDensa, { al: "C", meio: true });
    /* lateral (y = 0): pilares, frechal e a fita da parede */
    var lL = d.pcs.filter(function (p) { return (["P"].indexOf(p.g) >= 0 && Math.abs(p.p0[1]) < 1e-3) || p.g === "FR" && Math.abs(p.p0[1]) < 1e-3; });
    var rL = { x: a.x + 4, y: a.y + a.h * 0.5 + 2, w: a.w * 0.62, h: a.h * 0.5 - 6 };
    var vL = vistaPecas(c, lL, "XZ", rL, { titulo: "ELEVAÇÃO LATERAL (FACE -y) - PILARES, FRECHAL E CONTRAVENTAMENTO DA PAREDE", mx: 40, my: 30, escs: [50, 100] }), fL = vL.f3;
    d.fitas.filter(function (m) { return (m.g === "FP" || m.g === "DP") && Math.abs(m.p0[1]) < 1e-3 && Math.abs(m.p1[1]) < 1e-3; }).forEach(function (m) { var A = fL(m.p0), Bq = fL(m.p1); D.linha(A[0], A[1], Bq[0], Bq[1], m.g === "DP" ? "MAD-PRINCIPAL" : "MAD-FINA", ' data-peca="' + I.esc(m.id) + '" data-marca="' + (m.g === "DP" ? (d.marcas.porId[m.id] || "DP") : "TI-02") + '"'); });
    var Pr = fL([-B.esq, 0, yT(0)]), Pr2 = fL([ae + B.dir, 0, yT(0)]); D.linha(Pr[0], Pr[1], Pr2[0], Pr2[1], "MAD-FINA");
    Q.rotular(c, vL.itens, T.marcaDensa, { umaPorMarca: true, raio: 30, raio2: 60 });
    var xi = inf.xs; D.cadeia(xi.map(function (x) { return [fL([x, 0, 0])[0], fL([0, 0, vL.cx.z0])[1] + 8]; }), 7, xi.slice(1).map(function (x, k) { return I.cm(x - xi[k]); }), { semExt: true, attrs: xi.slice(1).map(function () { return ' data-cota="eixos-x"'; }) });
    var xt = a.x + a.w * 0.66, yt = a.y + a.h * 0.5 + 6;
    D.textos(xt, yt, ["Níveis relativos ao piso acabado da base (+0,000 = cota " + br(baseZ, 3) + " do modelo).", "Telhado de duas águas, inclinação i = " + Q.pct(inf.incl) + "; beirais " + [B.frente, B.fundo, B.esq, B.dir].map(function (x) { return I.cm(x); }).join("/") + " cm (frente/fundo/esq./dir.).",
      "Corte A-A passa entre os eixos 1 e 2: terças, cumeeira e frechais cortados; o pórtico do eixo 2 ao fundo, em tracejado.", "Contraventamento das paredes (mínimo de 2 painéis por fachada): diagonais de madeira DP em X (folha E07)" + (res.t2.membros.some(function (m) { return m.g === "FP"; }) ? "; fita TI-02 com tensor" : "") + "."], T.nota * 0.95, { wmax: a.x + a.w - xt - 3 });
    return { escala: "1:" + vA.esc0 + " e 1:" + vL.esc0 };
  }

  /* ================================================================ E06 — DETALHES TÍPICOS DAS LIGAÇÕES */
  function gPinos(nome, pn, S, quem) {
    var cg = pn.centroGrupo || {}, a2 = pn.nc > 1 ? 2 * (cg.a || 0) * 1000 : null, across = S.h * 1000, a4 = a2 == null ? across / 2 : (across - a2) / 2;
    return { nome: nome, d: pn.d * 1000, a1: pn.nr > 1 ? pn.a1 * 1000 : null, a2: a2, a3: pn.a3 * 1000, a3c: pn.a3 * 1000, a4t: a4, a4c: a4, alfa: pn.alfa == null ? Math.PI / 2 : pn.alfa, n: pn.n, nc: pn.nc, nr: pn.nr, eta: pn.eta, ok: pn.ok !== false, quem: quem };
  }
  /** grupo de pinos com chapa interna: elevação da barra, corte e chapa isolada */
  /* E4 r12: texto do esforço no nó. O F_d da ligação é só a SUCÇÃO (tração) e vale o piso de 0,001 kN quando o nó só comprime (CP-1: Nmin > 0); o que dimensiona os pinos é a reação horizontal H do grupo de pilares (res.reacoes, mesmo critério do motor: máximo do grupo) — a folha dizia "F = 0,0 kN" */
  function esforcoNo(c, o, LG) {
    var rs = (c.res && c.res.reacoes) || {}, H = 0, N = 0, F = LG.F_d || 0, Rn = Math.sqrt(F * F + H * H);
    Object.keys(rs).forEach(function (k) { var q = rs[k]; if (q && q.grupo === o.g) { H = Math.max(H, q.HmaxEq != null ? q.HmaxEq : (q.Hmax || 0)); N = Math.max(N, q.Nmax || 0); } });
    Rn = Math.sqrt(F * F + H * H);
    if (!(H > 0)) return "Esforço de cálculo no nó: F = " + br(LG.F_d, 1) + " kN" + (LG.F_eq ? " (equivalente de madeira " + br(LG.F_eq, 1) + " kN)" : "");
    return "Esforço de cálculo no nó: " + (F > 0.01 ? "sucção (tração) F = " + br(F, 1) + " kN" : "sem sucção (o nó só comprime)") + "; reação horizontal H = " + br(H, 1) + " kN nos " + LG.pinos.n + " pinos (pino mais carregado " + br(LG.pinos.Fmax, 2) + " kN); esforço na chapa = " + br(Rn, 1) + " kN; compressão por contato N = " + br(N, 1) + " kN (verificada perpendicular à fibra)";
  }
  function detPinos(c, o) {
    var res = c.res, LG = res.ligacoesT2.ligacoes[o.chave], pn = LG.pinos, ch = LG.chapa, S = res.secoes[o.g], d = Math.round(pn.d * 1000), nc = pn.nc, nr = pn.nr, a1 = Math.round(pn.a1 * 1000), a3 = Math.round(pn.a3 * 1000),
      a2 = nc > 1 ? Math.round(2 * pn.centroGrupo.a * 1000) : 0, bw = Math.round(S.b * 1000), hh = Math.round(S.h * 1000), tch = ch.t_mm, chW = ch.largura_mm, chL = Math.round(pn.comprimento * 1000), g = gPinos(o.cod + " " + o.quem, pn, S, o.quem);
    var pFuro = Q.ponto(c, "furos-aco", "LG01, E06", "Folga dos furos nas chapas (Ø do furo = d + folga do fabricante)", "d + 1 mm nos furos dos pinos (Ø17 para Ø16)", "fabricante");
    var pLam = Q.ponto(c, "lamela", "E06", "Espessura de lamela da ficha do fabricante (lamela desenhada com " + Q.LAM + " mm)", Q.LAM + " mm ilustrativa", "fabricante");
    var pGeo = Q.ponto(c, "geo-" + o.chave, o.cod + ", E06", "Posição do grupo de pinos em relação ao nó (excentricidade) e comprimento da chapa: o cálculo dá o grupo (n, a1, a3) e a largura da chapa; o contorno exato da chapa é do detalhamento de oficina", "chapa " + chW + " x " + chL + " mm, pinos centrados na barra", "RT/fabricante");
    var zc = []; for (var i = 0; i < nc; i++) zc.push((i - (nc - 1) / 2) * a2);
    var xr = []; for (var j = 0; j < nr; j++) xr.push(a3 + j * a1);
    function v1(cc, r) {
      var Lb = chL + 80, V = vista(cc, r, { x0: -40, x1: Lb - 40 + 20, z0: -hh / 2, z1: hh / 2 }, [18, 22, 8, 18], [5, 10, 20]);
      V.fundo(-40, -hh / 2, Lb, hh); V.mad(-40, -hh / 2, Lb, hh, { horiz: true }); V.vis(-40, -hh / 2, Lb, hh, "MAD-PECA");
      V.oc(0, -chW / 2, chL, chW);
      xr.forEach(function (x) { zc.forEach(function (z) { V.pino(x, z, d, true); }); });
      V.cadH([0].concat(xr).concat([chL]), -hh / 2, -6, [String(a3)].concat(xr.slice(1).map(function () { return String(a1); })).concat([String(a3)]), { semExt: true });
      if (nc > 1) V.cv(a2 / 2, -a2 / 2, xr[xr.length - 1] + 0, 6, String(a2), { semExt: true });
      V.cv(hh / 2, -hh / 2, -40, -6, String(hh), { semExt: true }); V.ch(0, chL, chW / 2, 5, String(chL), { semExt: true });
      V.bal(xr[0], zc[0] + (nc > 1 ? 0 : d), -14, -14, 1); V.bal(chL, -chW / 2, 8, 12, 2);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -20, x1: bw + 20, z0: -hh / 2, z1: hh / 2 }, [20, 22, 8, 16], [5, 10, 20]);
      V.fundo(0, -hh / 2, bw, hh); V.mad(0, -hh / 2, bw, hh, { horiz: true });
      V.aco(bw / 2 - tch / 2, -chW / 2, tch, chW);
      zc.forEach(function (z) { V.fundo(-12, z - d / 2, bw + 24, d); V.vis(-12, z - d / 2, bw + 24, d, "MAD-LIG"); V.ret(-12, z - 15, 12, 30, "MAD-LIG"); V.ret(bw, z - 15, 12, 30, "MAD-LIG"); V.eixoH(-18, bw + 18, z); });
      V.ch(0, bw, hh / 2, 5, String(bw), { semExt: true }); V.cv(hh / 2, -hh / 2, 0, -6, String(hh), { semExt: true });
      V.ch(bw / 2 - tch / 2, bw / 2 + tch / 2, -hh / 2, -5, String(tch), { semExt: true });
      if (nc > 1) V.cv(zc[1] + 0, zc[0], bw, 6, String(a2), { semExt: true });
      V.bal(bw / 2, chW / 2, 6, -10, 2); V.bal(bw + 6, zc[nc - 1], 8, -8, 1);
      return V;
    }
    function v3(cc, r) {
      var V = vista(cc, r, { x0: 0, x1: chL, z0: -chW / 2, z1: chW / 2 }, [14, 16, 12, 18], [5, 10, 20]);
      V.acoV(0, -chW / 2, chL, chW);
      xr.forEach(function (x) { zc.forEach(function (z) { V.furo(x, z, d + 1, true); }); });
      V.cadH([0].concat(xr).concat([chL]), -chW / 2, -6, [String(a3)].concat(xr.slice(1).map(function () { return String(a1); })).concat([String(a3)]), { semExt: true });
      V.cv(chW / 2, -chW / 2, 0, -6, String(chW), { semExt: true });
      if (nc > 1) V.cv(a2 / 2, -a2 / 2, chL, 6, String(a2), { semExt: true });
      V.bal(chL, chW / 2, 6, -8, 3);
      return V;
    }
    var notas = [{ t: o.cod + " - " + o.titulo + ": grupo de pinos na barra " + o.quem + " (seção " + I.cm(S.b) + "x" + I.cm(S.h) + " cm). " + LG.descricao },
      "1 - chapa interna de aço t = " + tch + " mm, " + chW + " x " + chL + " mm, em fenda na barra (kerf); 2 - " + pn.n + " pinos inox A4 Ø" + d + " (" + nc + " coluna" + (nc > 1 ? "s" : "") + " x " + nr + " linha" + (nr > 1 ? "s" : "") + "), furo da chapa Ø" + (d + 1) + " (" + pFuro + "); 3 - chapa isolada (vista 3).",
      "Espaçamentos real | mínimo (mm): " + Q.esp2(g) + ". Mínimo: " + Q.FONTE_MIN + "; conferir o ETA do fabricante.",
      Q.etaLinha(pn, o.cod + "-pinos", "Pinos (Johansen):"), Q.etaLinha(ch, o.cod + "-chapa", "Chapa em tração (NBR 8800):"),
      esforcoNo(c, o, LG) + ". Geometria do contorno da chapa (" + pGeo + "). Lamela de " + Q.LAM + " mm ilustrativa (" + pLam + ")."].concat(o.extra || []);
    return { cod: o.cod, titulo: o.titulo, layout: "T", fracW: 0.40, frac: [0.43, 0.22], vistas: [{ t: "ELEVAÇÃO DA BARRA (corte na fenda)", fn: v1 }, { t: "CORTE TRANSVERSAL", fn: v2 }, { t: "CHAPA CM (peça isolada)", fn: v3 }], notas: notas };
  }
  /* E4 r4: a vista do motor da T1, com (a) cotas que tentam OUTROS afastamentos quando o texto cairia em cima de traço/texto (o.offs da cadeia), (b) cota curta com o texto fora dos traços e (c) balão em lugar livre */
  var vista = function (c, r, ext, pad, escs) {
    var V = Q.vista(c, r, ext, pad, escs), D = V.D, sx = V.X, sy = V.Y, h = D.E.T.cota;
    function curta(v, A, B) { var L = Math.sqrt(Math.pow(B[0] - A[0], 2) + Math.pow(B[1] - A[1], 2)); return v != null && String(v) !== "" && String(v).length * h * 0.62 + 1.0 > L; }
    function com(o, off) { var m = Math.abs(off), x = {}; Object.keys(o || {}).forEach(function (k) { x[k] = o[k]; }); x.offs = [-off, 2 * off, -2 * off, 3 * m, -3 * m]; return x; }
    V.ch = function (X1, X2, Z, off, val, o) { var A = [sx(X1), sy(Z)], B = [sx(X2), sy(Z)]; if (curta(val, A, B)) cotaCurta(D, A, B, off, val, o || {}); else D.cota(A[0], A[1], B[0], B[1], off, val, com(o, off)); };
    V.cv = function (Zt, Zb, X, off, val, o) {
      var A, B, d; if (off < 0) { A = [sx(X), sy(Zb)]; B = [sx(X), sy(Zt)]; d = -off; } else { A = [sx(X), sy(Zt)]; B = [sx(X), sy(Zb)]; d = off; }
      if (curta(val, A, B)) cotaCurta(D, A, B, d, val, o || {}); else D.cota(A[0], A[1], B[0], B[1], d, val, com(o, d));
    };
    V.cadH = function (Xs, Z, off, vals, o) { D.cadeia(Xs.map(function (x) { return [sx(x), sy(Z)]; }), off, vals, com(o, off)); };
    V.cadV = function (Zs, X, off, vals, o) { var P = Zs.map(function (z) { return [sx(X), sy(z)]; }); if (off < 0) D.cadeia(P.slice().reverse(), -off, vals.slice().reverse(), com(o, -off)); else D.cadeia(P, off, vals, com(o, off)); };
    /* texto de legenda no primeiro lugar livre (em volta do pedido); sem lugar, fica o pedido */
    V.txLivre = function (X, Z, s, hh, o) {
      var w = String(s).length * hh * 0.62, p0 = sx(X), q0 = sy(Z), k, f, a, dx, dy, ds = [[0, 0]];
      for (f = 1; f <= 8; f++) for (k = 0; k < 8; k++) { a = k * Math.PI / 4; ds.push([Math.cos(a) * f * 3, Math.sin(a) * f * 3]); }
      for (k = 0; k < ds.length; k++) { dx = ds[k][0]; dy = ds[k][1]; if (D.livre([p0 + dx - 0.5, q0 + dy - hh * 0.85, p0 + dx + w + 0.5, q0 + dy + hh * 0.3], 0.3)) { D.texto(p0 + dx, q0 + dy, s, hh, o || {}); return; } }
      D.texto(p0, q0, s, hh, o || {});
    };
    return V;
  };

  /** parafusos de rosca total inclinados a 45° (terça–banzo, caibro–cumeeira) */
  function detRosca(c, o) {
    var res = c.res, LG = res.ligacoesT2.ligacoes[o.chave], S1 = res.secoes[o.sup], S2 = res.secoes[o.apoiada], Rs = res.ligacoes.rosca || {}, nParaf = LG.porApoio, bA = Math.round(S1.b * 1000), hA = Math.round(S1.h * 1000), bB = Math.round(S2.b * 1000), hB = Math.round(S2.h * 1000), Ls = 300, dS = 8.2;
    var pWt = Q.ponto(c, "wtt-eta", "LG03, LG06, LG11, E06", "Mínimos a1–a4 dos parafusos de rosca total SFS WT-T 8,2 pelo ETA-12/0063 (texto não lido) e dos parafusos 5x50 da fita", "espaçamentos desenhados conferidos só pelo critério da EN 1995-1-1 para parafusos autoperfurantes (a1 >= 7d, a2 >= 5d); sem redução", "RT (ler o ETA)");
    var pPos = Q.ponto(c, "wtt-posicao-" + o.chave, o.cod + ", E06", "Posição dos parafusos de rosca total no apoio (" + nParaf + " por apoio, par cruzado a 45 gr): o cálculo dá a quantidade e o ângulo, não as cotas", "pares cruzados a 1/4 e 3/4 da largura do apoio, centrados na altura", "RT/fabricante");
    function v1(cc, r) {          /* corte longitudinal ao apoio: barra de apoio (vista de lado), peça apoiada em corte, par cruzado a 45° */
      var V = vista(cc, r, { x0: -60, x1: Math.max(bB, 160) + 60, z0: -hA, z1: hB + 20 }, [20, 24, 8, 22], [5, 10, 20]), x0 = 0;
      V.fundo(-60, -hA, Math.max(bB, 160) + 120, hA); V.mad(-60, -hA, Math.max(bB, 160) + 120, hA, { horiz: true });
      V.fundo(x0, 0, bB, hB); V.mad(x0, 0, bB, hB, { horiz: false }); V.vis(x0, 0, bB, hB, "MAD-PECA");
      [0.25, 0.75].forEach(function (f) { var xc = x0 + f * bB, h4 = 100; V.lin(xc - h4, h4 * 0 + 0 - h4, xc + h4, h4 * 0 + 0 + h4, "MAD-LIG"); V.lin(xc + h4, -h4, xc - h4, h4, "MAD-LIG"); });
      V.ch(x0, x0 + bB, hB, 5, String(bB), { semExt: true }); V.cv(hB, 0, x0 + bB, 6, String(hB), { semExt: true }); V.cv(0, -hA, -60, -6, String(hA), { semExt: true });
      V.txLivre(x0 + bB / 2 - 40, -hA / 2, "45 gr", Q.nv ? V.D.E.T.nota : 2.4, {});
      V.bal(x0 + 0.25 * bB, 0, -22, 14, 1); V.bal(x0 + bB / 2, hB, 6, 10, 2);
      return V;
    }
    function v2(cc, r) {          /* planta: apoio por cima */
      var W = Math.max(bB, 160) + 120, V = vista(cc, r, { x0: -60, x1: W - 60, z0: -bA / 2 - 30, z1: bA / 2 + 30 }, [18, 22, 8, 18], [5, 10, 20]);
      V.fundo(-60, -bA / 2, W, bA); V.vis(-60, -bA / 2, W, bA, "MAD-PECA");
      V.fundo(0, -bA / 2 - 10, bB, bA + 20); V.vis(0, -bA / 2 - 10, bB, bA + 20, "MAD-PECA");
      [0.25, 0.75].forEach(function (f) { [-1, 1].forEach(function (sg) { V.furo(f * bB, sg * bA / 4, dS, true); }); });
      V.ch(0, bB, bA / 2 + 10, 5, String(bB), { semExt: true }); V.cv(bA / 2, -bA / 2, -60, -6, String(bA), { semExt: true });
      V.bal(0.25 * bB, bA / 4, -20, -14, 3);
      return V;
    }
    function v3(cc, r) {          /* parafuso isolado */
      var V = vista(cc, r, { x0: 0, x1: Ls, z0: -12, z1: 12 }, [14, 18, 10, 20], [1, 2, 5]);
      V.acoV(0, -dS / 2, Ls, dS); for (var x = 20; x < Ls - 10; x += 10) V.lin(x, -dS / 2, x, dS / 2, "MAD-FINA");
      V.ch(0, Ls, dS / 2, 4, String(Ls), { semExt: true }); V.cv(dS / 2, -dS / 2, Ls, 4, String(dS).replace(".", ","), { semExt: true });
      V.bal(Ls - 20, dS / 2, 8, -8, 4);
      return V;
    }
    var notas = [{ t: o.cod + " - " + o.titulo + ": " + LG.descricao },
      "1 - " + nParaf + " parafusos de rosca total " + LG.parafuso + " por apoio, em pares cruzados a 45 gr (" + pPos + "); 2 - peça apoiada " + o.nomeApoiada + " (" + I.cm(S2.b) + "x" + I.cm(S2.h) + " cm) sobre " + o.nomeSup + " (" + I.cm(S1.b) + "x" + I.cm(S1.h) + " cm); 3 - furos de passagem não são necessários (autoperfurante);",
      "Ponta mínima do parafuso na peça de apoio: " + (Rs.ponta_min_mm ? Math.round(Rs.ponta_min_mm) : 49) + " mm; comprimento efetivo mínimo " + (Rs.lef_min_mm || 150) + " mm. Espaçamentos a1-a4 pelo ETA (" + pWt + ").",
      "Reação do apoio F = " + br(LG.F_d, 2) + " kN; componente ao longo da água H = " + br(LG.H_d, 2) + " kN. Rax,d por parafuso = " + br(LG.Rax_d, 2) + " kN.",
      { t: (LG.eta <= 1 + 1e-9 && LG.ok !== false ? "VERIFICADA: eta = " : "NÃO ATENDE: eta = ") + br(LG.eta, 3) + ". NBR 7190-1:2022 / ETA-12/0063", cor: LG.eta <= 1 + 1e-9 && LG.ok !== false ? null : VERMELHO, attr: ' data-lig-ok="' + o.cod + '"' }];
    return { cod: o.cod, titulo: o.titulo, layout: "T", fracW: 0.40, frac: [0.43, 0.22], vistas: [{ t: "CORTE LONGITUDINAL", fn: v1 }, { t: "PLANTA", fn: v2 }, { t: "PARAFUSO WT-T 8,2 x 300", fn: v3 }], notas: notas };
  }

  /** apoio com compressão perpendicular às fibras (NBR 7190-1, 6.3.3): peça de cima sobre a peça de baixo; corte e planta de contato, com a área, sigma,c,90 e fc90,d·alfa,n */
  function detApoio90(c, o) {
    var res = c.res, AP = res.ligacoesT2.apoios90 && res.ligacoesT2.apoios90[o.chave], Sc = res.secoes[o.cima], Sb = res.secoes[o.baixo];
    if (!AP) return { cod: o.cod, titulo: o.titulo, layout: "G", fracW: 0.5, vistas: [], notas: [o.cod + " - apoio ⊥ não verificado nesta rodada."] };
    var bC = Math.round(Sc.b * 1000), hC = Math.round(Sc.h * 1000), bB = Math.round(Sb.b * 1000), hB = Math.round(Sb.h * 1000), comp = Math.max(bB + 160, 300);
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -80, x1: comp + 80, z0: -hB - 20, z1: hC + 40 }, [18, 22, 8, 20], [5, 10, 20]);
      var x0 = (comp - bC) / 2;
      V.fundo(0, -hB, comp, hB); V.mad(0, -hB, comp, hB, { horiz: true }); V.vis(0, -hB, comp, hB, "MAD-PECA");
      V.fundo(x0, 0, bC, hC); V.mad(x0, 0, bC, hC, { horiz: false }); V.vis(x0, 0, bC, hC, "MAD-PECA");
      V.ch(x0, x0 + bC, hC, 6, String(bC), { semExt: true }); V.cv(0, -hB, comp, 6, String(hB), { semExt: true });
      V.txLivre(x0 + bC + 14, hC / 2, "R,d = " + br(AP.R_d, 1) + " kN", V.D.E.T.nota * 0.9, {});
      V.bal(x0 + bC / 2, hC / 2, 30, 30, 1); V.bal(comp * 0.12, -hB / 2, -4, -10, 2);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -40, x1: comp + 40, z0: -bB / 2 - 40, z1: bB / 2 + 40 }, [20, 22, 8, 18], [5, 10, 20]);
      var x0 = (comp - bC) / 2;
      V.fundo(0, -bB / 2, comp, bB); V.vis(0, -bB / 2, comp, bB, "MAD-PECA");
      V.vis(x0, -bB / 2, bC, bB, "MAD-PRINCIPAL");
      V.ch(x0, x0 + bC, bB / 2, 5, String(bC), { semExt: true }); V.cv(bB / 2, -bB / 2, comp, 6, String(bB), { semExt: true });
      V.bal(x0 + bC / 2, 0, 6, 12, 3);
      return V;
    }
    var notas = [{ t: o.cod + " - " + o.titulo + ": " + AP.descricao + "." },
      "1 - " + o.nomeCima + " " + I.cm(Sc.b) + "x" + I.cm(Sc.h) + " cm; 2 - " + o.nomeBaixo + " " + I.cm(Sb.b) + "x" + I.cm(Sb.h) + " cm; 3 - área de contato = " + bC + " x " + bB + " mm = " + br(AP.area_cm2, 0) + " cm2 (alfa,n = " + br(AP.alphaN, 2) + ").",
      "Reação de cálculo R,d = " + br(AP.R_d, 2) + " kN: sigma,c,90 = " + br(AP.sigma_c90_MPa, 3) + " MPa <= fc90,d x alfa,n = " + br(AP.fc90d_MPa, 3) + " MPa (limite 0,25 x fc0,d x alfa,n; kmod de longa duração).",
      { t: (AP.ok ? "VERIFICADA: eta = " : "NÃO ATENDE: eta = ") + br(AP.eta, 3) + ". NBR 7190-1:2022, 6.3.3 e Tabela 6", cor: AP.ok ? null : VERMELHO, attr: ' data-lig-ok="' + o.cod + '"' }];
    return { cod: o.cod, titulo: o.titulo, layout: "G", fracW: 0.5, vistas: [{ t: "CORTE", fn: v1 }, { t: "PLANTA DO CONTATO", fn: v2 }], notas: notas };
  }

  /** assento deslizante do caibro no frechal */
  function detAssento(c, o) {
    var res = c.res, LG = res.ligacoesT2.ligacoes.caibroFrechal, FRs = res.secoes.FR, CBs = res.secoes.CB, bF = Math.round(FRs.b * 1000), hF = Math.round(FRs.h * 1000), bC = Math.round(CBs.b * 1000), hC = Math.round(CBs.h * 1000), inc = res.t2.info.incl, ang = Math.atan(inc), tch = 8, compCh = (LG.apoio && LG.apoio.comprimento_mm) || 200, folga = 20, nP = LG.cinta && LG.cinta.parafusos || 2;
    var pFolga = Q.ponto(c, "assento-folga", o.cod + ", E06", "Folga transversal do assento deslizante (>= 20 mm do cálculo) e furos oblongos: dimensão final do furo oblongo e da cinta", "folga de " + folga + " mm para cada lado; cinta de aço t 2 mm", "RT/fabricante");
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -80, x1: 380, z0: -hF - 20, z1: 380 }, [18, 22, 8, 20], [5, 10, 20]);
      V.fundo(0, -hF, bF + 160, hF); V.mad(0, -hF, bF + 160, hF, { horiz: true }); V.vis(0, -hF, bF + 160, hF, "MAD-PECA");
      V.aco(bF / 2 + 80 - compCh / 2, 0, compCh, tch);
      var L = 300, cs = Math.cos(ang), sn = Math.sin(ang), x0 = bF / 2 + 80 - bC / 2 / cs, pts = [[x0, tch], [x0 + L * cs, tch + L * sn], [x0 + L * cs - hC * sn, tch + L * sn + hC * cs], [x0 - hC * sn, tch + hC * cs]];
      V.D.poli(pts.map(function (q) { return [V.X(q[0]), V.Y(q[1])]; }), "MAD-PECA", true);
      V.ch(bF / 2 + 80 - compCh / 2, bF / 2 + 80 + compCh / 2, 0, -5 - 3, String(compCh), { semExt: true }); V.cv(0, -hF, 0, -6, String(hF), { semExt: true });
      V.txLivre(x0 + 120, tch + hC + 40, "caibro CB " + I.cm(CBs.b) + "x" + I.cm(CBs.h) + " (i = " + Q.pct(inc) + ")", V.D.E.T.nota * 0.9, {});
      V.bal(bF / 2 + 80, tch / 2, 40, 50, 1); V.bal(0, -hF / 2, -10, -4, 2);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -60, x1: 460, z0: -bC - 40, z1: bF + 40 }, [20, 22, 8, 20], [5, 10, 20]);
      V.fundo(-60, 0, 520, bF); V.vis(-60, 0, 520, bF, "MAD-PECA");
      var xc = 180; V.aco(xc, bF / 2 - 60, compCh, 120);
      V.vis(xc + 10, bF / 2 - bC / 2, 260, bC, "MAD-PECA");
      [-1, 1].forEach(function (sg) { V.oc(xc + 30, bF / 2 + sg * 40 - 8, 60 + folga * 2, 16); V.furo(xc + 60, bF / 2 + sg * 40, 14, false); });
      V.ch(xc, xc + compCh, bF / 2 + 62, 5, String(compCh), { semExt: true }); V.cv(bF / 2 + 60, bF / 2 - 60, xc + compCh, 6, "120", { semExt: true });
      V.ch(xc + 30, xc + 30 + folga, bF / 2 - 52, -4, String(folga), { semExt: true });
      V.bal(xc + compCh / 2, bF / 2 + 60, 6, 12, 3);
      return V;
    }
    var notas = [{ t: o.cod + " - " + o.titulo + ": " + LG.descricao },
      "1 - chapa de apoio t = " + tch + " mm x " + compCh + " mm com furos oblongos (folga " + folga + " mm transversal à parede, " + pFolga + "); 2 - frechal FR " + I.cm(FRs.b) + "x" + I.cm(FRs.h) + " cm; 3 - cinta de tração, " + nP + " parafusos só no caibro (passa pela folga).",
      "Reação vertical no apoio = " + br(LG.apoio && LG.apoio.sigma_c90_MPa, 3) + " MPa de compressão ⊥ às fibras na área de " + compCh + " x " + bF + " mm; reação longitudinal (ao longo da parede) = " + br(LG.longitudinal_kN, 2) + " kN. Sem reação transversal (assento livre em uz): sem empuxo na parede.",
      { t: (LG.eta <= 1 + 1e-9 && LG.ok !== false ? "VERIFICADA: eta = " : "NÃO ATENDE: eta = ") + br(LG.eta, 3) + " (cinta de tração). NBR 7190-1:2022 / ETA-12/0063", cor: LG.eta <= 1 + 1e-9 && LG.ok !== false ? null : VERMELHO, attr: ' data-lig-ok="' + o.cod + '"' }];
    return { cod: o.cod, titulo: o.titulo, layout: "G", fracW: 0.5, vistas: [{ t: "CORTE (plano do caibro)", fn: v1 }, { t: "PLANTA DO ASSENTO", fn: v2 }], notas: notas };
  }

  function listaDetalhes(c) {
    var res = c.res;
    var lg01 = { cod: "LG01", fn: Q.lg01 };
    if (res.sistema === "tesoura") return [lg01,
      { cod: "TS-1", fn: function (cc) { return detPinos(cc, { cod: "TS-1", titulo: "NÓ DO BANZO SUPERIOR", chave: "noBanzoSuperior", g: "BS", quem: "BS (banzo superior)" }); } },
      { cod: "TS-2", fn: function (cc) { return detPinos(cc, { cod: "TS-2", titulo: "NÓ DO BANZO INFERIOR", chave: "noBanzoInferior", g: "BI", quem: "BI (banzo inferior)" }); } },
      { cod: "TS-3", fn: function (cc) { return detPinos(cc, { cod: "TS-3", titulo: "NÓ DO MONTANTE", chave: "noPendural", g: "PD", quem: "PD (montante)" }); } },
      { cod: "TS-4", fn: function (cc) { return detPinos(cc, { cod: "TS-4", titulo: "NÓ DA DIAGONAL", chave: "noDiagonal", g: "DG", quem: "DG (diagonal)" }); } },
      { cod: "TS-5", fn: function (cc) { return detPinos(cc, { cod: "TS-5", titulo: "TESOURA SOBRE O PILAR (GARFO)", chave: "tesouraPilar", g: "P", quem: "PL (pilar, garfo no topo)" }); } },
      { cod: "TS-5a", fn: function (cc) { return detApoio90(cc, { cod: "TS-5a", titulo: "APOIO DA TESOURA NO FRECHAL (COMPRESSÃO PERPENDICULAR)", chave: "apoioTesouraFrechal", cima: "BI", baixo: "FR", nomeCima: "banzo inferior BI", nomeBaixo: "frechal FR" }); } },
      { cod: "TS-5b", fn: function (cc) { return detApoio90(cc, { cod: "TS-5b", titulo: "APOIO DO FRECHAL NO PILAR (COMPRESSÃO PERPENDICULAR)", chave: "apoioFrechalPilar", cima: "FR", baixo: "P", nomeCima: "frechal FR", nomeBaixo: "pilar PL" }); } },
      { cod: "CV-1", fn: function (cc) { return detPinos(cc, { cod: "CV-1", titulo: "PONTA DA DIAGONAL DE MADEIRA DO CONTRAVENTAMENTO", chave: "contravDiagonal", g: "DX", quem: "DX (diagonal de madeira)" }); } },
      { cod: "CV-2", fn: function (cc) { return detPinos(cc, { cod: "CV-2", titulo: "PONTA DA DIAGONAL DE MADEIRA DO PAINEL DA PAREDE", chave: "contravParede", g: "DP", quem: "DP (diagonal de madeira da parede)" }); } },
      { cod: "CV-3", fn: function (cc) { return detPinos(cc, { cod: "CV-3", titulo: "LIGAÇÃO DA LINHA DE TRAVAMENTO LB AO BANZO INFERIOR", chave: "contravLB", g: "LB", quem: "LB (linha de travamento)" }); } },
      { cod: "TS-6", fn: function (cc) { return detRosca(cc, { cod: "TS-6", titulo: "TERÇA SOBRE O BANZO SUPERIOR", chave: "tercaTesoura", sup: "BS", apoiada: "T", nomeSup: "banzo BS", nomeApoiada: "terça TL" }); } }];
    return [lg01,
      { cod: "CP-1", fn: function (cc) { return detPinos(cc, { cod: "CP-1", titulo: "CUMEEIRA SOBRE O PILAR (CHAPA EM T + GARFO)", chave: "cumeeiraPilar", g: "PC", quem: "PL (pilar de cumeeira)" }); } },
      { cod: "CP-2", fn: function (cc) { return detRosca(cc, { cod: "CP-2", titulo: "CAIBRO NA VIGA DE CUMEEIRA", chave: "caibroCumeeira", sup: "CM", apoiada: "CB", nomeSup: "cumeeira CM", nomeApoiada: "caibro CB" }); } },
      { cod: "CP-3", fn: function (cc) { return detAssento(cc, { cod: "CP-3", titulo: "CAIBRO NO FRECHAL (ASSENTO DESLIZANTE)" }); } },
      { cod: "CP-4", fn: function (cc) { return detPinos(cc, { cod: "CP-4", titulo: "FRECHAL SOBRE O PILAR (GARFO)", chave: "frechalPilar", g: "P", quem: "PL (pilar, garfo no topo)" }); } },
      { cod: "CV-1", fn: function (cc) { return detPinos(cc, { cod: "CV-1", titulo: "PONTA DA DIAGONAL DE MADEIRA DO CONTRAVENTAMENTO", chave: "contravDiagonal", g: "DX", quem: "DX (diagonal de madeira)" }); } },
      { cod: "CV-2", fn: function (cc) { return detPinos(cc, { cod: "CV-2", titulo: "PONTA DA DIAGONAL DE MADEIRA DO PAINEL DA PAREDE", chave: "contravParede", g: "DP", quem: "DP (diagonal de madeira da parede)" }); } }];
  }
  function gruposDeEspaco(c) {
    var res = c.res, L = res.ligacoes, P = res.secoes.P, a = Q.aBase(L, P) * 1000, lado = Q.ladoPilar(P), out = [], T2 = res.ligacoesT2.ligacoes, B = L.base;
    out.push({ nome: "LG01 base (por chapa)", d: B.d * 1000, a1: B.a1 * 1000, a3: B.a3 * 1000, a2: 2 * a, a4t: lado * 500 - a, a4c: lado * 500 - a, a3c: B.a3 * 1000, alfa: B.alfa, ok: B.ok !== false });
    [["noBanzoSuperior", "TS-1 nó BS", "BS"], ["noBanzoInferior", "TS-2 nó BI", "BI"], ["noPendural", "TS-3 nó PD", "PD"], ["noDiagonal", "TS-4 nó DG", "DG"], ["tesouraPilar", "TS-5 tesoura-pilar", "P"], ["cumeeiraPilar", "CP-1 cumeeira-pilar", "PC"], ["frechalPilar", "CP-4 frechal-pilar", "P"], ["contravDiagonal", "CV-1 diagonal DX", "DX"], ["contravParede", "CV-2 diagonal DP", "DP"], ["contravLB", "CV-3 linha LB", "LB"]].forEach(function (k) {
      if (T2[k[0]] && T2[k[0]].pinos) out.push(gPinos(k[1], T2[k[0]].pinos, res.secoes[k[2]], k[2]));
    });
    return out;
  }
  function quadroEspacos(c, x, y, w) {
    var D = c.D, T = D.E.T, pinos = gruposDeEspaco(c), hT = I.tituloVista(D, x, y, "ESPAÇAMENTOS A1-A4 DOS PINOS (mm): REAL | MÍNIMO", null) + 1;
    var cols = [{ t: ["FIXADOR", "(Ø mm)"], al: "E" }, { t: "a1" }, { t: "a2" }, { t: "a3,t" }, { t: "a3,c" }, { t: "a4,t" }, { t: "a4,c" }, { t: "OK?" }];
    var lin = pinos.map(function (g) {
      var q = Q.espacos(g), m = {}; q.forEach(function (e) { m[e.nome] = e; });
      function cel(n) { var e = m[n]; return e ? { t: Math.round(e.real) + " | " + I.br(e.min, 0), cor: e.ok ? null : VERMELHO } : "-"; }
      var ok = q.every(function (e) { return e.ok; });
      return [{ t: g.nome + " (Ø" + Math.round(g.d) + ")", al: "E" }, cel("a1"), cel("a2"), cel("a3,t"), cel("a3,c"), cel("a4,t"), cel("a4,c"), { t: ok ? "OK" : "NÃO ATENDE", cor: ok ? null : VERMELHO, attr: ' data-espacos-ok="' + (ok ? 1 : 0) + '"' }];
    });
    var tb = D.tabela(x, y + hT, cols, lin, { fs: T.tabela * 0.9, hl: 5.0 });
    return hT + tb.h;
  }
  function folhasE06(c) {
    var det = listaDetalhes(c).filter(function (it) { return (it.cod !== "CV-2" || (c.res.ligacoesT2.ligacoes.contravParede && c.res.ligacoesT2.ligacoes.contravParede.pinos)) && (it.cod !== "CV-3" || (c.res.ligacoesT2.ligacoes.contravLB && c.res.ligacoesT2.ligacoes.contravLB.pinos)); }), blocos = [], i;      /* CV-2 só existe com diagonais de madeira nas paredes (sem vedação rígida) */
    for (i = 0; i < det.length; i += 4) blocos.push(det.slice(i, i + 4));
    if (blocos[blocos.length - 1].length >= 4) blocos.push([]);
    blocos[blocos.length - 1].push({ cod: "QUADRO" });
    return blocos;
  }
  function folhaE06(c, bloco) {
    var D = c.D, a = c.geo.area, T = D.E.T, gap = 6, cw = (a.w - 4 - gap) / 2, ch = (a.h - 4 - gap) / 2, escs = [];
    bloco.forEach(function (it, i) {
      var x = a.x + 2 + (i % 2) * (cw + gap), y = a.y + 2 + Math.floor(i / 2) * (ch + gap);
      if (it.cod === "QUADRO") {
        var hq = quadroEspacos(c, x + 2, y + 1, cw - 4), pLam = Q.ponto(c, "lamela", "E06", "", "");
        var pwt = Q.ponto(c, "wtt-eta", "LG03, LG06, LG11, E06", "Mínimos a1–a4 dos parafusos de rosca total SFS WT-T 8,2 pelo ETA-12/0063 (texto não lido) e dos parafusos 5x50 da fita", "espaçamentos desenhados conferidos só pelo critério da EN 1995-1-1 para parafusos autoperfurantes (a1 >= 7d, a2 >= 5d); sem redução", "RT (ler o ETA)");
        var hu = D.textos(x + 2, y + hq + 4, [
          "Real = o desenhado nas vistas desta folha (o do cálculo); mínimo = " + Q.FONTE_MIN + ". Nenhum espaçamento é reduzido em obra.",
          "Parafusos de rosca total (WT-T 8,2) e parafusos 5x50 da fita: mínimos pelo ETA do fabricante (" + pwt + ").",
          "Lamelas desenhadas por linhas (padrão engenharada: sem anel de crescimento); lamela de " + Q.LAM + " mm é ilustrativa (" + pLam + ").",
          "Chapas de aço em corte: contorno 0,50 e hachura a 45 gr; pinos e parafusos 0,35 com eixo em traço-ponto; aço visto (sem corte) só em contorno.",
          "Cada ligação tem no mínimo duas vistas, a peça de aço isolada, os espaçamentos a1-a4 cotados e a nota técnica ao lado."], T.nota, { wmax: cw - 6 });
        c.pc.pos = { x: x + 2, y: y + hq + 4 + hu + 4, w: cw - 4, yb: y + ch - 2, rotulo: c.rotulo };
        return;
      }
      escs = escs.concat(Q.celulaDet(c, x, y, cw, ch, it.fn(c)));
    });
    var yy = a.y + 2 + ch + gap / 2; D.linha(a.x + 2, yy, a.x + a.w - 2, yy, "MAD-COTA");
    var xx = a.x + 2 + cw + gap / 2; D.linha(xx, a.y + 2, xx, a.y + a.h - 2, "MAD-COTA");
    var u = []; escs.sort(function (p, q) { return p - q; }).forEach(function (e) { if (u.indexOf(e) < 0) u.push(e); });
    return { escala: u.length ? u.map(function (e) { return "1:" + e; }).join(" e ") : "1:5 e 1:10" };
  }

  /* ================================================================ E07 — CONTRAVENTAMENTO */
  function folhaE07(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, res = c.res, L2 = res.ligacoesT2.ligacoes, fita = L2.fita, inf = res.t2.info;
    var ctx = d.pcs.filter(function (p) { return ["P", "PO", "PC", "BI", "CM", "FR", "T", "CB"].indexOf(p.g) >= 0; });
    var dxs = d.pcs.filter(function (p) { return p.g === "DX"; }), dvs = d.pcs.filter(function (p) { return p.g === "DV"; }), madC = dxs.length > 0;
    var pl = Q.plantaPecas(c, ctx.concat(dxs), { tit: "CONTRAVENTAMENTO DA COBERTURA - PLANTA (" + (madC ? "DIAGONAIS DE MADEIRA NAS ÁGUAS" : "FITA NAS ÁGUAS") + ")", fw: 0.64 }), f3 = pl.f3;
    Q.desenharLista(D, c, ctx, f3, function () { return "MAD-CONTEXTO"; });
    var itDX = Q.desenharLista(D, c, dxs, f3, function () { return "MAD-PRINCIPAL"; });
    Q.rotular(c, itDX, T.marcaDensa, { umaPorMarca: true, raio: 34 });
    var fx = d.fitas.filter(function (m) { return m.g === "FX"; });
    fx.forEach(function (m) { var A = f3(m.p0), B = f3(m.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-PRINCIPAL", ' data-peca="' + I.esc(m.id) + '" data-marca="TI-01"'); });
    Q.eixosEmPlanta(c, f3, eixos(d.pilares, 0), [], pl.caixa, 12);
    var f0 = fx[0];
    if (f0) { var A = f3(f0.p0), B = f3(f0.p1), mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, lg = D.procura([mx, my - 10], 14, 4, [pl.caixa[0] - 2, pl.caixa[1] - 2, pl.caixa[2] + 2, pl.caixa[3] + 2], { raio: 40 }); if (lg) { D.texto(lg[0], lg[1], "TI-01", T.marca, { al: "C", meio: true }); D.linha(mx, my, Q.tipoChamada(lg, mx, my)[0], Q.tipoChamada(lg, mx, my)[1], "MAD-FINA"); D.ponto(mx, my, 0.4); } }
    /* parede lateral (y = 0): pilares + fita FP */
    var pe = d.pcs.filter(function (p) { return p.g === "P" && Math.abs(p.p0[1]) < 1e-3; }).concat(d.pcs.filter(function (p) { return p.g === "FR" && Math.abs(p.p0[1]) < 1e-3; }));
    var rL = { x: a.x + 4, y: pl.caixa[3] + 28, w: a.w * 0.31, h: a.y + a.h - pl.caixa[3] - 34 }, rV = { x: a.x + 8 + a.w * 0.31, y: pl.caixa[3] + 28, w: a.w * 0.31, h: a.y + a.h - pl.caixa[3] - 34 };
    var vL = vistaPecas(c, pe, "XZ", rL, { titulo: "CONTRAVENTAMENTO DA PAREDE LATERAL (FACE -y) - ELEVAÇÃO", mx: 30, my: 24, escs: [50, 100], cam: function () { return "MAD-CONTEXTO"; } });
    var fp = d.fitas.filter(function (m) { return (m.g === "FP" || m.g === "DP") && Math.abs(m.p0[1]) < 1e-3 && Math.abs(m.p1[1]) < 1e-3; });
    fp.forEach(function (m) { var A = vL.f3(m.p0), B = vL.f3(m.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-PRINCIPAL", ' data-peca="' + I.esc(m.id) + '" data-marca="' + (m.g === "DP" ? (d.marcas.porId[m.id] || "DP") : "TI-02") + '"'); });
    /* E4 T2fix C2 (6.6.4, Figura 5): treliça VERTICAL entre tesouras no plano de uma linha do banzo inferior (cumeeira, y = b/2): linha LB (corda de baixo), terça/cumeeira (corda de cima), montantes e duas diagonais em X (fita) nos vãos extremos */
    if (res.sistema === "tesoura") {
      var yM = res.t2.params.b / 2, pv = d.pcs.filter(function (p) { return (p.g === "LB" || p.g === "CM" || (p.g === "PD" && Math.abs(p.p0[1] - yM) < 1e-3)) && (p.g !== "LB" || Math.abs(p.p0[1] - yM) < 1e-3); });
      var vV = vistaPecas(c, pv, "XZ", rV, { titulo: "TRELIÇA VERTICAL ENTRE TESOURAS (6.6.4) - PLANO DA CUMEEIRA, ELEVAÇÃO", mx: 30, my: 24, escs: [50, 100], cam: function () { return "MAD-CONTEXTO"; } });
      res.t2.membros.filter(function (m) { return m.g === "DV" && Math.abs(m.p0[1] - yM) < 1e-3; }).forEach(function (m) { var A = vV.f3(m.p0), B = vV.f3(m.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-PRINCIPAL", ' data-peca="' + I.esc(m.id) + '" data-marca="DV"'); });      /* diagonais verticais em linha (eixo), como a fita: a seção 12×12 não cabe na escala da treliça */
      d.fitas.filter(function (m) { return m.g === "FV" && Math.abs(m.p0[1] - yM) < 1e-3; }).forEach(function (m) { var A = vV.f3(m.p0), B = vV.f3(m.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-PRINCIPAL", ' data-peca="' + I.esc(m.id) + '" data-marca="TI-03"'); });
    }
    var xr = a.x + a.w * 0.66, yy = a.y + 18;
    yy += I.tituloVista(D, xr, yy, madC ? "DX/DV/DP - DIAGONAIS DE MADEIRA EM X (ÁGUAS, VERTICAL E PAREDES)" : "TI - FITA EM X (ÁGUAS, PLANOS VERTICAIS E PAREDES)", "ver detalhes de ligação (CV-1, CV-2) na folha E06") + 2;
    var nFV = d.fitas.filter(function (m) { return m.g === "FV"; }).length, nFX = fx.length, nFP = d.fitas.filter(function (m) { return m.g === "FP"; }).length, nDP = d.fitas.filter(function (m) { return m.g === "DP"; }).length, sD = res.secoes.DX || {}, sP = res.secoes.DP || {}, lcv = L2.contravDiagonal, lcp = L2.contravParede;
    yy += D.textos(xr, yy, [
      madC ? "DX - " + dxs.length + " diagonais de MLC " + br((sD.b || 0) * 100, 0) + "x" + br((sD.h || 0) * 100, 0) + " cm em X no plano das águas, painel a painel (nó em cada terça), nos vãos extremos; seção dada pela rigidez K_br,1 (NBR 7190-1, 6.6.2) e pela esbeltez (L0 = comprimento da diagonal, sem crédito do cruzamento)." : null,
      madC && dvs.length ? "DV - " + dvs.length + " diagonais de MLC em X nos planos verticais das linhas LB entre tesouras (vãos extremos), com as linhas LB nos nós do banzo inferior (6.6.4, Figura 5); ligação CV-1 (chapa interna + pinos) nas duas pontas." : null,
      madC && lcv ? "CV-1 - força axial de cálculo na diagonal = " + br(lcv.F_d, 2) + " kN (ELU e F1d = Nd/150); η = " + br(lcv.eta, 3) + (lcv.ok ? " (VERIFICADA)" : " (NÃO ATENDE)") + "." : null,
      !madC ? "TI-01 - " + nFX + " trechos de fita/chapa " + br(((res.secoes.FT && res.secoes.FT.b) || 0.06) * 1000, 0) + " x " + br(((res.secoes.FT && res.secoes.FT.e) || 0.002) * 1000, 1) + " mm em X no plano das águas, painel a painel (nó em cada terça), vãos extremos, sob a telha/ripa, com tensor; dimensionada pela rigidez K_br,1 (NBR 7190-1, 6.6.2)." : null,
      !madC && nFV ? "TI-03 - " + nFV + " trechos de fita em X nos planos verticais das linhas LB entre tesouras (vãos extremos), com as linhas longitudinais LB nos nós do banzo inferior (6.6.4, Figura 5)." : null,
      res.t2.contrav ? "K_br,1 medido x exigido: banzo superior " + br(res.t2.contrav.BS.Kbr, 0) + " x " + br(res.t2.contrav.BS.Kmin, 0) + " kN/m; banzo inferior " + br(res.t2.contrav.BI.Kbr, 0) + " x " + br(res.t2.contrav.BI.Kmin, 0) + " kN/m. F1d = Nd/150 = " + br(res.t2.contrav.F1d.BS, 2) + " kN por nó (banzo superior)." : null,
      nDP ? "DP - " + nDP + " diagonais de MLC " + br((sP.b || 0) * 100, 0) + "x" + br((sP.h || 0) * 100, 0) + " cm em X nos painéis das paredes, do pé do pilar ao frechal (mínimo de 2 painéis contraventados por fachada: primeiro e último vão); só tração no modelo, L0 = comprimento da diagonal; seção pelo laço (esbeltez e rigidez K_br,1)." : null,
      nDP && lcp ? "CV-2 - força axial de cálculo na diagonal da parede = " + br(lcp.F_d, 2) + " kN (ELU e F1d = Nd/150); η = " + br(lcp.eta, 3) + (lcp.ok ? " (VERIFICADA)" : " (NÃO ATENDE)") + "; ligação: chapa interna t = 8 mm + pinos inox nas duas pontas." : null,
      nFP ? "TI-02 - " + nFP + " trechos de fita em X nos planos das paredes (vãos extremos e oitões), do pé do pilar ao frechal, com tensor." : null,
      fita ? "N de cálculo na fita = " + br(fita.N_d, 2) + " kN; η = " + br(fita.eta, 3) + (fita.ok ? " (VERIFICADA)" : " (NÃO ATENDE)") + ". " + fita.parafusosPorPonta + " parafusos 5x50 por ponta." : null,
      fita ? { t: "Rk do parafuso 5x50: adotado pelo RT (24/10/2026), docs/madeira/CONFIRMACAO-RT.md.", attr: ' data-fonte="fita-rk"' } : null,
      res.t2.params.vedacaoRigida ? "VEDAÇÃO RÍGIDA informada pelo usuário (alvenaria/OSB estrutural): não há diagonais nas paredes; a vedação TEM de ser projetada para a força horizontal informada (premissa declarada, a validar pelo RT)." : "Sem vedação rígida estruturada nas paredes (premissa: nenhuma vedação rígida informada): a estabilidade lateral é das diagonais das paredes e dos pilares engastados."].filter(Boolean), T.nota * 0.95, { wmax: a.x + a.w - xr - 3 });
    Q.legenda(D, xr, yy + 4, [{ tipo: madC ? "ret" : "linha", cam: "MAD-PRINCIPAL", t: madC ? "diagonais de madeira em X (DX águas, DV vertical, DP paredes)" : "fita em X (TI-01 águas, TI-02 paredes)" }, { tipo: "ret", cam: "MAD-CONTEXTO", t: "pilares, frechais, terças e cumeeira (contexto)" }], T.nota * 0.9);
    return { escala: "1:" + pl.esc0 + " e 1:" + vL.esc0 };
  }

  /* ================================================================ E11 — FERRAGENS */
  function ferragensT2(c) {
    var res = c.res, L = res.ligacoes, T2 = res.ligacoesT2.ligacoes, pcs = c.d.pcs, itens = [];
    function qm(g) { return pcs.filter(function (p) { return p.g === g; }).length; }
    var P = res.secoes.P, nBases = c.d.pilares.length, pb = L.placaBase, pbd = pb.dimensoes_mm, pbe = pb.espessura_mm, B = L.base;
    var nTes = qm("BI"), nCB = qm("CB");
    itens.push({ ferr: "Placa de base " + pbd[0] + "x" + pbd[1] + "x" + pbe + " mm, aço A36 galv. a fogo" + (pb.solda && pb.solda.tipo === "penetracao-total" ? " (solda chapa-placa de penetração total)" : ""), cod: "-", fab: "-", mat: "ASTM A36 galv. fogo (NBR 6323)", qtd: nBases, kg: nBases * pbd[0] / 1000 * pbd[1] / 1000 * pbe / 1000 * 7850, est: true, lig: "LG01" });
    itens.push({ ferr: "Chapa em cruz t = 16 mm (" + (B.chapa ? B.chapa.largura_mm : 0) + " x " + Math.round(B.comprimento * 1000 + Q.FOLGA_PE) + " mm)", cod: "-", fab: "-", mat: "ASTM A36 galv. fogo", qtd: 2 * nBases, kg: 2 * nBases * 0.016 * (B.chapa ? B.chapa.largura_mm : 0) / 1000 * (B.comprimento + Q.FOLGA_PE / 1000) * 7850, est: true, lig: "LG01" });
    itens.push({ ferr: "Pino liso inox Ø" + Math.round(B.d * 1000) + " (base)", cod: "-", fab: "-", mat: "inox A4-70", qtd: 2 * B.n * nBases, kg: null, est: false, lig: "LG01" });
    itens.push({ ferr: "Chumbador químico M20 A4-70", cod: "-", fab: "-", mat: "inox A4-70", qtd: pb.chumbadores.total * nBases, kg: null, est: false, lig: "LG01" });
    var mult = res.sistema === "tesoura" ? { noBanzoSuperior: nTes * 2, noBanzoInferior: nTes * 4, noPendural: qm("PD") * 4, noDiagonal: qm("DG") * 4, tesouraPilar: nTes * 4, contravDiagonal: (qm("DX") + qm("DV")) * 4, contravParede: qm("DP") * 4, contravLB: qm("LB") * Math.max(0, nTes - 2) * 2 } : { cumeeiraPilar: qm("PC") * 2, frechalPilar: (qm("P") + qm("PO")) * 2, contravDiagonal: (qm("DX") + qm("DV")) * 4, contravParede: qm("DP") * 4 };      /* E4 r12: CV-1/CV-2 também na cumeeira portante (a tabela só listava CP-1 e CP-4) */
    var COD = { noBanzoSuperior: "TS-1", noBanzoInferior: "TS-2", noPendural: "TS-3", noDiagonal: "TS-4", tesouraPilar: "TS-5", contravDiagonal: "CV-1", contravParede: "CV-2", contravLB: "CV-3", cumeeiraPilar: "CP-1", frechalPilar: "CP-4" };
    Object.keys(mult).forEach(function (k) {
      var g = T2[k]; if (!g || !g.pinos) return;
      var kgCh = (g.chapa.t_mm / 1000) * (g.chapa.largura_mm / 1000) * g.pinos.comprimento * 7850;
      itens.push({ ferr: "Chapa interna t = " + g.chapa.t_mm + " mm, " + g.chapa.largura_mm + " x " + Math.round(g.pinos.comprimento * 1000) + " mm (" + COD[k] + ")", cod: "-", fab: "-", mat: "ASTM A36 galv. fogo", qtd: mult[k], kg: kgCh * mult[k], est: true, lig: COD[k] });
      itens.push({ ferr: "Pino inox Ø" + Math.round(g.pinos.d * 1000) + " (" + COD[k] + ", " + g.pinos.n + " por chapa)", cod: "-", fab: "-", mat: "inox A4-70", qtd: g.pinos.n * mult[k], kg: null, est: false, lig: COD[k] });
      if (g.f90 && g.f90.reforco && mult[k]) itens.push({ ferr: "Parafuso rosca total SFS WT-T 8,2 x 300 (reforço ⊥ às fibras contra o fendilhamento F90, " + g.f90.reforco.parafusos + " por nó, " + COD[k] + ")", cod: "WT-T-8,2x300", fab: "SFS", eta: "ETA-12/0063", mat: "aço c/ revestimento p/ classe de serviço", qtd: g.f90.reforco.parafusos * mult[k], kg: null, est: false, lig: COD[k] });
    });
    if (res.sistema === "tesoura" && T2.tercaTesoura) itens.push({ ferr: "Parafuso rosca total SFS WT-T 8,2 x 300 (terça-banzo, " + T2.tercaTesoura.porApoio + " por apoio)", cod: "WT-T-8,2x300", fab: "SFS", eta: "ETA-12/0063", mat: "aço c/ revestimento p/ classe de serviço", qtd: qm("T") * nTes * T2.tercaTesoura.porApoio, kg: null, est: false, lig: "TS-6" });
    if (res.sistema === "cumeeira") {
      if (T2.caibroCumeeira) itens.push({ ferr: "Parafuso rosca total SFS WT-T 8,2 x 300 (caibro-cumeeira, " + T2.caibroCumeeira.porApoio + " por apoio)", cod: "WT-T-8,2x300", fab: "SFS", eta: "ETA-12/0063", mat: "aço c/ revestimento p/ classe de serviço", qtd: nCB * T2.caibroCumeeira.porApoio, kg: null, est: false, lig: "CP-2" });
      itens.push({ ferr: "Assento deslizante do caibro: chapa de apoio 8 x 200 mm com furo oblongo + cinta de tração", cod: "-", fab: "-", mat: "ASTM A36 galv. fogo", qtd: nCB, kg: nCB * 0.008 * 0.2 * (P.b || 0.2) * 7850, est: true, lig: "CP-3", un: "cj" });
    }
    var mF = {}; c.d.fitas.forEach(function (m) { var L0 = Math.sqrt(Math.pow(m.p1[0] - m.p0[0], 2) + Math.pow(m.p1[1] - m.p0[1], 2) + Math.pow(m.p1[2] - m.p0[2], 2)); mF[m.g] = (mF[m.g] || 0) + L0; });
    var mTot = (mF.FX || 0) + (mF.FP || 0);
    if (T2.fita && mTot > 0) itens.push({ ferr: "Fita metálica perfurada 60 x 2,0 mm em X (" + (mF.FX ? "águas TI-01 e " : "") + "paredes TI-02) + " + T2.fita.parafusosPorPonta + " parafusos 5x50/ponta + tensor", cod: "-", fab: "-", mat: "ASTM A36 galv. fogo (ou inox)", qtd: R(mTot, 2), kg: mTot * 0.06 * 0.002 * 7850, est: true, lig: "E07", un: "m" });
    return itens;
  }
  function folhaE11(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, it = ferragensT2(c);
    var hT = I.tituloVista(D, a.x + 4, a.y + 2, "TABELA DE FERRAGENS E CONECTORES", "SEM ESCALA - * kg estimado (volume da chapa x 7.850 kg/m3); a definir = sem código do fabricante/ETA (quadro de pontos a confirmar, folha E06)") + 2;
    var cols = [{ t: "ITEM" }, { t: "FERRAGEM", al: "E" }, { t: ["CÓDIGO DO", "FABRICANTE"] }, { t: "FABRICANTE" }, { t: "ETA / FICHA" }, { t: ["MATERIAL /", "ACABAMENTO"], al: "E" }, { t: "QTD" }, { t: "UN." }, { t: "kg" }, { t: "LIGAÇÃO" }];
    var tk = 0, lin = it.map(function (f, i) {
      tk += f.kg || 0; var semCod = f.cod === "-";
      return [String(i + 1), { t: f.ferr, al: "E" }, semCod ? { t: "a definir (" + Q.ponto(c, "ferragem-codigo", "E11", "Código do fabricante e ETA dos pinos, chapas, placa e chumbadores: vêm do dimensionamento (ligações), não de catálogo", "", "RT/fabricante") + ")", attr: ' data-pend="ferragem-' + (i + 1) + '"' } : f.cod, semCod ? { t: "-" } : f.fab, semCod ? { t: "a definir" } : f.eta,
        { t: f.mat, al: "E" }, { t: f.qtd == null ? "-" : I.br(f.qtd, f.un === "m" ? 2 : 0), attr: ' data-ferr-qtd="' + (i + 1) + '|' + f.qtd + '"' }, f.un || "un", f.kg ? I.br(f.kg, 1) + (f.est ? " *" : "") : "-", f.lig];
    });
    lin.push({ total: ["", { t: "TOTAL kg (itens com massa)" }, "", "", "", "", "", "", { t: I.br(tk, 1) }, ""] });
    var tb = D.tabela(a.x + 4, a.y + 2 + hT, cols, lin, { fs: T.tabela, hl: 5.6 });
    D.textos(a.x + 4, a.y + 2 + hT + tb.h + 6, [
      "Quantidade escrita uma vez por ligação e totalizada aqui (" + (c.res.sistema === "tesoura" ? "nós da tesoura: cada extremidade de barra = um grupo de pinos na barra e outro na peça em que ela se prende" : "nós da cumeeira portante, do frechal e do contraventamento: cada ligação = um grupo de pinos na barra e outro na peça em que ela se prende") + ", como no orçamento). Conector de catálogo (SFS WT-T): conferir o relatório de avaliação ETA-12/0063.",
      "Alumínio nunca em contato com aço (galvânica); eletrolítico NÃO em área externa.",
      "Itens 'a definir': pinos, chapas, placa e chumbadores vêm do dimensionamento (ligações), não de catálogo; o código do fabricante e a ETA entram no quadro 'Pontos a confirmar' (folha E06)."], T.nota * 0.95, { wmax: a.w - 10 });
    return { escala: "SEM ESCALA" };
  }

  /* ================================================================ NOTAS e GERAR */
  function naoEmitir(res) {
    var imp = [];
    if (res.semSolucao) imp.push("O dimensionamento não encontrou solução: projeto NÃO EMITIDO para execução.");
    if (res.ligacoes && res.ligacoes.ok === false) imp.push("Ligação da base que NÃO ATENDE: ver folha E06 (LG01) e o memorial.");
    if (res.ligacoesT2 && res.ligacoesT2.ok === false) imp.push("Ligação dos nós que NÃO ATENDE: ver folha E06.");
    arr(res.auditoria && res.auditoria.achados).forEach(function (a0) { imp.push("Auditoria: " + String(a0.mensagem || "").slice(0, 110)); });
    return imp;
  }
  function blocosNotas(c, rev, cl) {
    var imp = naoEmitir(c.res).map(function (t) { return { t: t, cor: VERMELHO }; });
    var lista = ["E01 - Locação, bases e reações", "E02 - Decks: NÃO SE APLICA", "E03 - Planta de cobertura", "E04 - " + (c.res.sistema === "tesoura" ? "Elevação da tesoura cotada" : "Pórtico da cumeeira portante"), "E05 - Cortes e elevações gerais", "E06 - Detalhes das ligações; pontos a confirmar",
      "E07 - Contraventamento", "E08 - Oficina: por conta do fabricante a partir do IFC (nota)", "E09 - Painéis CLT: NÃO SE APLICA", "E10 - Tabela de peças", "E11 - Tabela de ferragens", "E12 - Manual de montagem: caderno A3 separado"];
    var notas = [
      "Cotas e seções de madeira em centímetros; ferragem e chapa em milímetros; níveis em metros. Não medir no desenho.",
      "Marca da peça: {marca} - {classe} - {b}x{h} x {L} (cm), igual em todas as folhas, na tabela e no IFC.",
      "MLC: classe " + cl + " (EN 14080), nunca inferior à do memorial; certificado do lote na entrega. Lamela máx. 45 mm (ficha); umidade de entrega 12 % +/- 2 %.",
      "Tratamento NBR 16143 e acabamento: conforme tabela E10; peça sem definição fica 'a definir' no quadro de pontos a confirmar. Proteção de topo em toda peça exposta.",
      "Ferragem inox A4 ou galvanizada a fogo em área externa/litorânea; alumínio não toca o aço. Mínimo de 2 fixadores onde o fixador é o caminho principal da carga.",
      "Espaçamentos a1-a4 cotados são os do cálculo (mínimo da NBR 7190-1:2022, Tab. 14, ao lado); não reduzir em obra. Madeira nunca em contato com o concreto.",
      "Tolerâncias EN 14080: largura +/- 2 mm; h <= 400 mm: +4/-2 mm; h > 400 mm: +1 %/-0,5 %; empenamento 4 mm em 2 m.",
      "Desenho de oficina por conta do fabricante a partir do IFC/BTLx, com aprovação da RT antes da fabricação (TFEC 061719).",
      "VERMELHO = o que impede emitir (ligação que não atende, achado aberto da auditoria): não fabricar nem comprar o item antes de resolver. Os pontos a confirmar e os valores adotados ficam em preto, no quadro da folha E06.",
      "Não modelados no cálculo (declarado): vergas de vidro, caibros secundários, vento oblíquo de duas águas (a Tabela 5 da NBR 6123 não traz coeficientes; a torção por excentricidade, 6.6, está modelada); travamento inferior de terças e caibros = vão (a favor da segurança) até o RT definir os bloqueadores.",
      "Projeto executivo - revisão " + rev + "."];
    var bl = [];
    if (imp.length) bl.push({ titulo: "NÃO EMITIR PARA EXECUÇÃO", cor: VERMELHO, itens: imp });
    bl.push({ titulo: "LISTA DE DESENHOS", itens: lista }, { titulo: "NOTAS GERAIS", numerar: true, itens: notas }, { titulo: "NORMAS", itens: ["NBR 7190-1:2022; NBR 7190:1997 Anexo A (desenho)", "EN 14080; EN 1995-1-1", "NBR 6123:2023, 6120:2019, 8681:2003", "NBR 16143 (preservação)"] });
    return bl;
  }

  function gerar(res, opcoes) {
    opcoes = opcoes || {};
    var avisos = [];
    if (!EP || !Q || !I) return { ok: false, folhas: [], avisos: ["js/madengpranchas.js não carregou."] };
    var P = Q.PR();
    if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    if (!res || !res.t2 || !res.fonte || !arr(res.fonte.pecas).length || !res.ligacoes || !res.ligacoesT2 || !res.secoes) return { ok: false, folhas: [], avisos: ["Resultado do cálculo da T2 sem fonte/ligações: não há pranchas."] };
    var E = I.estilo(opcoes.padrao);
    Object.keys(Q.PADRAO_ENG.base).forEach(function (k) { var b = E.camadas[Q.PADRAO_ENG.base[k]]; E.camadas[k] = { mm: b.mm, dash: b.dash, cor: b.cor }; });
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA");
    var codigo = Q.txt(opcoes.codigo).trim() || "EST-MAD-ENG", rev = (Q.txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = Q.txt(opcoes.data).trim() || Q.hoje();
    var classe = Q.txt(opcoes.classe) || Q.classeDe(mlcMaterial(res));
    var ctx0 = { res: res, E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, classe: classe, pc: [], cels: [] };
    ctx0.d = contexto(res); ctx0.pend = ctx0.d.pend;
    var ORDEM = [["E01", "locacao", folhaE01], ["E03", "cobertura", folhaE03], ["E04", "porticos", folhaE04], ["E05", "cortes", folhaE05]];
    var blocosE06 = folhasE06(ctx0);
    blocosE06.forEach(function (bl, k) { var ql = ["06A", "06B", "06C", "06D"][k]; ORDEM.push(["E06", "ligacoes-" + ql.slice(2).toLowerCase(), function (c) { return folhaE06(c, bl); }, ql]); });
    ORDEM.push(["E07", "contraventamento", folhaE07], ["E10", "pecas", Q.folhaE10], ["E11", "ferragens", folhaE11]);
    var feitas = [];
    ORDEM.forEach(function (def) {
      var D = new I.Desenho(E, opcoes.depurar ? [] : null), c = {}, resF = {};
      Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.rotulo = def[3] || def[0].slice(1);
      var titulo = Q.PADRAO_ENG.folhas[def[0]] + (def[3] ? " (" + (def[3].charCodeAt(2) - 64) + "/" + blocosE06.length + ")" : "");
      if (def[0] === "E04") titulo = (res.sistema === "tesoura" ? "TESOURA - ELEVAÇÃO COTADA, SEÇÕES E NÓS" : "PÓRTICO DA CUMEEIRA PORTANTE - ELEVAÇÃO COTADA");
      try { resF = def[2](c) || {}; } catch (e) { avisos.push("Folha " + def[0] + ": " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      feitas.push({ def: def, D: D, escala: resF.escala || "INDICADA", rotulo: c.rotulo, titulo: titulo });
    });
    var ult = feitas.filter(function (f) { return f.def[3]; }); ult = ult[ult.length - 1];
    if (ult) { var cq = {}; Object.keys(ctx0).forEach(function (k) { cq[k] = ctx0[k]; }); cq.D = ult.D; cq.rotulo = ult.rotulo; try { Q.quadroPontos(cq); } catch (e) { avisos.push("Quadro de pontos a confirmar: " + (e && e.message ? e.message : String(e))); } }
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "madengt2pranchas", nome: "Estrutura de madeira engenharada (T2, duas águas) - projeto executivo", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : Q.txt(emp), responsavel: Q.txt(opcoes.responsavel), registro: Q.txt(opcoes.registro), titulo: Q.txt(opcoes.tituloProfissional), obra: Q.txt(opcoes.obra), proprietario: Q.txt(opcoes.proprietario),
        contratante: Q.txt(opcoes.contratante), local: Q.txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, Q.txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def[1], n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var blocos = blocosNotas(ctx0, rev, classe), camadas = {};
    Object.keys(Q.MP.PADRAO_MAD.camadas).forEach(function (k) { camadas[k] = Q.MP.PADRAO_MAD.camadas[k]; }); Object.keys(Q.PADRAO_ENG.layers).forEach(function (k) { camadas[k] = Q.PADRAO_ENG.layers[k]; });
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, M = geo.moldura, Fd = new I.Desenho(E, null);
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA");
      if (!I.colunaNotas(Fd, geo, blocos) && i === 0) avisos.push("As notas não cabem na coluna da direita com a letra mínima do padrão: conferir.");
      var rotuloFolha = f.rotulo + "/12";
      I.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, rotuloFolha);
      var numero = codigo + "-E" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + I.n(W) + 'mm" height="' + I.n(H) + 'mm" viewBox="0 0 ' + I.n(W) + " " + I.n(H) + '" font-family="' + I.FONTE + '" data-folha="' + f.def[1] + '" data-numero="' + I.esc(numero) + '">' +
        "<title>" + I.esc(numero + " - " + f.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + I.n(W) + '" height="' + I.n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + '<text x="' + I.n(W / 2) + '" y="7" font-size="3" text-anchor="middle" fill="#c00000" data-faixa="1">' + I.esc(Q.FAIXA) + "</text></svg>";
      var o = { id: f.def[1], rotulo: f.rotulo, numero: numero, titulo: f.titulo, formato: formato, escala: f.escala, svg: svg, rotuloCarimbo: rotuloFolha };
      o.dxf = { familia: "madeira", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: rotuloFolha, logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: camadas, tituloH: E.T.titulo, codigo: codigo };
      if (opcoes.depurar) o.caixasTexto = D.caixas;
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    var linhasReac = (ctx0.rows || []).map(function (r0) { return r0; });
    return { ok: true, folhas: folhas, avisos: avisos, tabela: ctx0.d.marcas.tab, ferragens: ferragensT2(ctx0), reacoes: Object.keys(res.reacoes || {}).map(function (k) { var q = res.reacoes[k]; return { no: k, mem: q.mem, Nmax: q.Nmax, Nmin: q.Nmin, Hmax: q.Hmax, Mmax: q.Mmax }; }), marcas: ctx0.d.marcas.porId,
      desenhaveis: ctx0.d.pcs, celulas: ctx0.cels, pontos: ctx0.pc, naoEmitir: naoEmitir(res), linhasReac: linhasReac };
  }

  var MadEngT2 = { gerar: gerar, pecasMembros: pecasMembros, contexto: contexto, ferragens: function (res) { return ferragensT2({ res: res, d: contexto(res) }); }, naoEmitir: naoEmitir };
  global.MadEngT2 = MadEngT2;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngT2;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

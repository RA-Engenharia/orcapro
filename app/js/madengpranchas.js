/* =====================================================================
 * madengpranchas.js — PRANCHAS DO PROJETO EXECUTIVO DE MADEIRA ENGENHARADA (MLC/glulam; E3 do módulo "Estruturas de madeira").
 * Motor PURO, ES5, sem DOM, Node-testável. Papel, moldura e CARIMBO RA = js/prancha.js (intocado); penas e alturas = js/padraodet.js; o
 * desenho (Desenho, tabela, cota, rótulo sem sobreposição) é o do js/madpranchas.js (madeira serrada), reaproveitado sem mudar o que faz.
 *
 *   MadEngPranchas.gerar(res, opcoes) → { ok, folhas: [{ id, rotulo, numero, titulo, formato, escala, svg, dxf, caixasTexto? }], avisos, tabela, ferragens, reacoes, marcas }
 *   res = resultado do cálculo de UMA opção (js/madengworker.js: fonte.pecas com geometria, ligacoes, reacoes, auditoria…)
 *   opcoes = { obra, proprietario, contratante, local, empresa, responsavel, registro, tituloProfissional, codigo, revisao, data, formato ("A1"), logo, padrao, depurar,
 *              nomeOpcao, classe ("GL24h"), amostra: (reservado) }
 *
 * PADRÃO RA (padrao_detalhamento_ra.json › estrutura_madeira.engenharada, v2.11 de 24/10/2026): marcas PL/VL/TL…; folhas E01–E12 (aqui as que se aplicam à
 * Casa Mar, as demais saem "NÃO SE APLICA" na LISTA DE DESENHOS); ligações LG01–LG11; layers EST-MAD-ACO/LIG/LAM; a1–a4 cotados com o mínimo ao lado;
 * VERMELHO = pendência (nada inventado: o que o cálculo não traz sai [PENDENTE]).
 * Teste: node tools/test-mad-eng-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  var MP = dep("MadPranchas", "./madpranchas.js"), I = MP && MP._i;
  function PR() { return dep("Prancha", "./prancha.js"); }

  var PADRAO_ENG = {
    versao: "2.11", data: "24/10/2026",
    layers: { "MAD-ACO": "EST-MAD-ACO", "MAD-LIG": "EST-MAD-LIG", "MAD-LAM": "EST-MAD-LAM" },
    base: { "MAD-ACO": "MAD-CORTE", "MAD-LIG": "MAD-FERRAGEM", "MAD-LAM": "MAD-HACHURA" },
    folhas: {
      E01: "LOCAÇÃO, BASES E REAÇÕES NA FUNDAÇÃO", E02: "PLANTA ESTRUTURAL DOS DECKS (PISO)", E03: "PLANTA DE COBERTURA", E04: "PÓRTICOS - ELEVAÇÕES E CORTES",
      E05: "CORTES E ELEVAÇÕES GERAIS", E06: "DETALHES TÍPICOS DAS LIGAÇÕES", E07: "CONTRAVENTAMENTO", E08: "DESENHOS DE OFICINA POR PEÇA", E09: "PAINÉIS CLT - PAGINAÇÃO E USINAGEM",
      E10: "TABELA DE PEÇAS POR POSIÇÃO", E11: "TABELA DE FERRAGENS E CONECTORES", E12: "MANUAL DE MONTAGEM"
    },
    marcas: { PL: "pilar de MLC", VL: "viga de MLC (altura variável)", TL: "terça de MLC", BQ: "bloqueador", ES: "escora", VG: "verga", TR: "travessa", PD: "pendural", TI: "fita de contraventamento", DB: "barrote do deck superior", DV: "viga do deck superior", DP: "pilarete do deck superior", DW: "viga do deck inferior", DC: "barrote do deck inferior", DQ: "pilar do deck inferior", DY: "diagonal do contraventamento do deck", EL: "longarina da escada", ED: "degrau da escada" },
    escalas: { planta: [50, 100], porticos: [25, 50], ligacao: [2, 5, 10] }
  };

  /* ------------------------------------------------------------ utilidades */
  var FAIXA = "Documento gerado pelo sistema — emissão somente após conferência e ART do responsável técnico";
  /* garfo (E4 r2): pilar duplo (forma "duplo": 2 peças b x h com a V entre elas). Lado visto na elevação = h; chapas externas de 12 mm com largura h - 20 mm; colunas de parafusos a h/2 - 4d. */
  function ladoPilar(P) { return P.forma === "quadrado" ? P.b : (P.forma === "duplo" ? P.h : P.d); }
  function aBase(L, P) { var cz = L.base && L.base.cruz && L.base.cruz.a; if (cz != null) return cz; return P && P.forma === "duplo" && L.base ? P.h / 2 - 4 * (L.base.d || 0.016) : 0.076; }
  function chapaLarg(b, P) { return P && P.forma === "duplo" ? Math.round((P.h - 0.02) * 1000) : (b.chapa ? b.chapa.largura_mm : 193); }
  function num(v, d) { if (v == null || v === "") return d; var x = Number(v); return isFinite(x) ? x : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function mult(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { var L = Math.sqrt(dot(a, a)); return L > 1e-12 ? mult(a, 1 / L) : [0, 0, 0]; }
  function mm(v) { return String(Math.round(v * 1000)); }                 /* m → "280" (mm) */
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function dois(k) { return ("0" + k).slice(-2); }
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function pct(i) { return I.br(i * 100, 1) + " % (" + I.br(Math.atan(i) * 180 / Math.PI, 1) + " gr)"; }

  /* mínimos de espaçamento do PRÓPRIO motor de ligações (js/madligacoes.js › bordas: NBR 7190-1:2022, 7.1.10, Tabela 14 — parafusos passantes, rosca soberba e pinos ajustados) */
  function bordas(d, alfa) {
    var ML = dep("MadLig", "./madligacoes.js");
    if (ML && ML.bordas) return ML.bordas(d, alfa);
    var s = Math.abs(Math.sin(alfa)), c = Math.abs(Math.cos(alfa));
    return { a1: (4 + 3 * c) * d, a2: 4 * d, a3t: Math.max(7 * d, 0.08), a3c: 4 * d, a4t: Math.max((2 + 2 * s) * d, 3 * d), a4c: 3 * d };
  }
  var FONTE_MIN = "NBR 7190-1:2022, 7.1.10, Tab. 14, p. 53 (cópia de consulta; via motor de ligações)";

  /** ponta da linha de chamada: pára na BORDA da caixa do texto (meia largura 7 mm, meia altura 2,2 mm) no lado de onde a linha chega — nunca dentro do texto (a E03/E07 reprovava o TI-01 quando a chamada chegava na vertical) */
  function tipoChamada(lg, mx, my) {
    var dx = mx - lg[0], dy = my - lg[1], L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L, t = Math.min(Math.abs(ux) > 1e-9 ? 7 / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-9 ? 2.2 / Math.abs(uy) : 1e9);
    return [lg[0] + ux * t, lg[1] + uy * t];
  }

  /* ================================================================ PEÇAS, MARCAS, TABELAS */
  var PREFIXOS = [[/^T\d/, "TL"], [/^V\d/, "VL"], [/^P\d/, "PL"], [/^BL/, "BQ"], [/^ES\d/, "ES"], [/^VG/, "VG"], [/^TR/, "TR"], [/^PD/, "PD"], [/^FX\d/, "TI"],
    [/^DS-B/, "DB"], [/^DS-V/, "DV"], [/^DS-P/, "DP"], [/^DI-V/, "DW"], [/^DI-B/, "DC"], [/^DI-P/, "DQ"], [/^D[SI]-CV\d/, "DY"], [/^ESC-L/, "EL"], [/^ESC-D/, "ED"]];
  var NOME_PREFIXO = { TL: "terça", VL: "viga V", PL: "pilar", BQ: "bloqueador", ES: "escora", VG: "verga", TR: "travessa", PD: "pendural", TI: "fita de contraventamento",
    DB: "barrote do deck superior", DV: "viga do deck superior", DP: "pilarete do deck superior", DW: "viga do deck inferior", DC: "barrote do deck inferior", DQ: "pilar do deck inferior", DY: "diagonal do contraventamento do deck", EL: "longarina da escada", ED: "degrau da escada" };
  function prefixoDe(id) { for (var i = 0; i < PREFIXOS.length; i++) if (PREFIXOS[i][0].test(id)) return PREFIXOS[i][1]; return null; }
  function classeDe(m) { var t = txt(m), g = /GL\s?(\d+[hc])/i.exec(t); if (g) return "GL" + g[1]; if (/eucalipto/i.test(t)) return "Eucalipto roliço"; return t.split(" — ")[0].slice(0, 22); }
  function tratDe(m) { var t = txt(m); if (/autoclav|CCA|CCB/i.test(t)) return /categoria de uso 5/i.test(t) ? "CCA cat. 5" : "CCA/CCB cat. 4"; return null; }

  /** fonte de peças → peças desenháveis (com geometria) normalizadas para o caixaPeca do desenho */
  function desenhaveis(pecas) {
    var out = [];
    arr(pecas).forEach(function (p) {
      var s = p.secao; if (!s || !p.p0 || !p.p1) return;
      var dv = sub(p.p1, p.p0), L = Math.sqrt(dot(dv, dv)); if (L < 1e-6) return;
      var u = mult(dv, 1 / L), up = p.up || [0, 0, 1], v = unit(sub(up, mult(u, dot(up, u))));
      if (dot(v, v) < 0.5) { var alt = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; v = unit(sub(alt, mult(u, dot(alt, u)))); }
      var w = unit(cruz(v, u)), b, h, perf = null;
      if (s.tipo === "circ") { b = s.d; h = s.d; } else if (s.tipo === "perfil") { b = s.b; perf = s.perfil; var zs = perf.map(function (q) { return q[1]; }); h = Math.max.apply(null, zs) - Math.min.apply(null, zs); } else { b = s.b; h = s.h; }
      out.push({ id: p.id, grupo: p.grupo, desc: txt(p.descricao), esp: txt(p.especificacao), material: txt(p.material), secao: s, p0: p.p0, p1: p.p1, dl: w, ext: [L, b, h], u: u, v: v, w: w, b: b, h: h, perfil: perf,
        comp: num(p.comprimento_m, L), vol: num(p.volume_m3, 0), qtd: p.qtd == null ? 1 : p.qtd, prefixo: prefixoDe(p.id) });
    });
    return out;
  }
  function secTxt(pc) {
    var s = pc.secao;
    if (s.tipo === "circ") return "Ø" + I.cm(s.d);
    if (s.tipo === "perfil") return I.cm(s.b) + " x var.";
    return I.cm(s.b) + "x" + I.cm(s.h);
  }
  /** marcas: prefixo + hífen + 2 dígitos; peça diferente (seção/comprimento) = outra marca. Pilarete do deck: faixas de 10 cm de comprimento (corte pelo terreno). */
  function marcar(pcs) {
    var grupos = {}, ordem = [];
    pcs.forEach(function (pc) {
      if (!pc.prefixo || pc.prefixo === "TI") return;
      var Lk = pc.prefixo === "DP" ? Math.ceil(pc.comp * 10 - 1e-9) * 10 : Math.round(pc.comp * 100);
      var hv = pc.perfil ? "|" + Math.round(pc.perfil[0][1] * 1000) : "";
      var k = pc.prefixo + "|" + secTxt(pc) + "|" + Lk + hv + "|" + pc.material.slice(0, 12);
      if (!grupos[k]) { grupos[k] = { prefixo: pc.prefixo, chave: k, sec: secTxt(pc), Lcm: Lk, itens: [] }; ordem.push(k); }
      grupos[k].itens.push(pc);
    });
    var porPref = {}; ordem.forEach(function (k) { (porPref[grupos[k].prefixo] = porPref[grupos[k].prefixo] || []).push(grupos[k]); });
    var porId = {}, tab = [];
    Object.keys(porPref).sort().forEach(function (pf) {
      porPref[pf].sort(function (a, b) { return (b.itens[0].b * b.itens[0].h - a.itens[0].b * a.itens[0].h) || (b.Lcm - a.Lcm); }).forEach(function (g, i) {
        var marca = pf + "-" + dois(i + 1), vt = 0, q = 0, Lmax = 0;
        g.itens.forEach(function (pc) { porId[pc.id] = marca; vt += pc.vol; q += pc.qtd; Lmax = Math.max(Lmax, pc.comp); pc.marca = marca; });
        var p0 = g.itens[0], tr = tratDe(p0.material);
        tab.push({ marca: marca, prefixo: pf, qtd: q, classe: classeDe(p0.material), sec: g.sec, h1h2: p0.perfil ? hh(p0.perfil) : null, Lcm: Math.round(Lmax * 100), volUnit: vt / q, volTot: vt, material: p0.material, trat: tr, perfil: !!p0.perfil, ids: g.itens.map(function (x) { return x.id; }), desc: p0.desc });
      });
    });
    return { porId: porId, tab: tab };
  }
  /* alturas das pontas do perfil poligonal da V: [y, z] topo e fundo em cada ponta */
  function hh(perf) {
    var ys = perf.map(function (q) { return q[0]; }), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    function h(y) { var zs = perf.filter(function (q) { return Math.abs(q[0] - y) < 1e-6; }).map(function (q) { return q[1]; }); return Math.max.apply(null, zs) - Math.min.apply(null, zs); }
    return [h(y1), h(y0)];   /* h1 = ponta A (a de topo mais baixo, o beiral: maior y), h2 = ponta B */
  }

  /* ------------------------------------------------------------ reações: B{ix}{iy} → pilar */
  function reacoesPorBase(res, pilares) {
    var xs = [], ys = [];
    pilares.forEach(function (p) { if (xs.indexOf(p.p0[0]) < 0) xs.push(p.p0[0]); if (ys.indexOf(p.p0[1]) < 0) ys.push(p.p0[1]); });
    xs.sort(function (a, b) { return a - b; }); ys.sort(function (a, b) { return a - b; });
    var linhas = [], eX = xs.map(function (x, i) { return { v: x, nome: String(i + 1) }; }), eY = ys.map(function (y, i) { return { v: y, nome: String.fromCharCode(65 + i) }; });
    Object.keys(res.reacoes || {}).sort().forEach(function (no) {
      var ix = +no.charAt(1), iy = +no.charAt(2), q = res.reacoes[no];
      if (!eX[ix] || !eY[iy]) return;
      linhas.push({ no: no, ix: ix, iy: iy, x: eX[ix].v, y: eY[iy].v, eixo: eX[ix].nome + "-" + eY[iy].nome, Nmax: q.Nmax, Nmin: q.Nmin, Hmax: q.Hmax, Mmax: q.Mmax });
    });
    return { linhas: linhas, eixosX: eX, eixosY: eY };
  }

  /* ================================================================ DESENHO — primitivas */
  var PRETO = "#000", VERMELHO = "#c00000";
  function planoXY(s, ox, oy, x0, y1) { return function (P) { return [ox + (P[0] - x0) * s, oy + (y1 - P[1]) * s]; }; }
  function planoYZ(s, ox, oy, y0, z1) { return function (P) { return [ox + (P[1] - y0) * s, oy + (z1 - P[2]) * s]; }; }
  function planoXZ(s, ox, oy, x0, z1) { return function (P) { return [ox + (P[0] - x0) * s, oy + (z1 - P[2]) * s]; }; }
  function cascoDe(pc, f3) { return I.casco(I.caixaPeca(pc).cantos.map(f3)); }

  function desenharLista(D, c, lista, f3, camFn, opts) {
    opts = opts || {};
    return lista.map(function (pc) {
      var poly = cascoDe(pc, f3), red = c.pend[pc.id], cam = red ? "MAD-PEND" : (camFn ? camFn(pc) : "MAD-PECA");
      D.poli(poly, cam, true, ' data-peca="' + I.esc(pc.id) + '"' + (pc.marca ? ' data-marca="' + I.esc(pc.marca) + '"' : "") + (red ? ' data-pend="1"' : ""));
      return { pc: pc, poly: poly, a: f3(pc.p0), b: f3(pc.p1), red: !!red };
    });
  }
  /* rótulo de cada marca ao lado da peça, num trecho livre (a mesma busca da madeira serrada) */
  function rotular(c, itens, h, o) {
    o = o || {};
    var D = c.D, feitos = {};
    itens.sort(function (p, q) { return (q.red - p.red) || (I.hip(q.b[0] - q.a[0], q.b[1] - q.a[1]) - I.hip(p.b[0] - p.a[0], p.b[1] - p.a[1])); });
    itens.forEach(function (it) {
      var m = it.pc.marca; if (!m) return;
      if (o.umaPorMarca && feitos[m]) return;
      var cor = it.red ? VERMELHO : null, at = ' data-rotulo="' + I.esc(m) + '"';
      var ok = I.rotuloPeca(D, it.poly, it.a, it.b, m, h, { cor: cor, attr: at, raio: o.raio || 24, dentro: o.dentro });
      if (!ok) ok = I.rotuloPeca(D, it.poly, it.a, it.b, m, h, { cor: cor, attr: at, raio: o.raio2 || 46 });
      if (ok) feitos[m] = 1; else if (!o.umaPorMarca) c.avisos.push("Folha " + c.rotulo + ": a marca " + m + " (" + it.pc.id + ") não achou lugar livre.");
    });
    return feitos;
  }
  function limites(itens) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    itens.forEach(function (it) { it.poly.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }); });
    return [x0, y0, x1, y1];
  }
  function caixaPontos(pcs) {
    var xs = [], ys = [], zs = [];
    pcs.forEach(function (p) { I.caixaPeca(p).cantos.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); zs.push(q[2]); }); });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) };
  }
  function seta(D, x, y, ux, uy) { D.seta(x, y, ux, uy, 2.4); }
  /* balão de eixo + cotas entre eixos (cm) para uma planta */
  function eixosEmPlanta(c, f3, X, Y, caixa, folga) {
    var D = c.D, e = folga || 12;
    X.forEach(function (ex) {
      var P = f3([ex.v, 0, 0]), r = D.raioBalao(ex.nome);
      D.linha(P[0], caixa[1] - e, P[0], caixa[3] + e, "MAD-EIXO");
      D.balao(P[0], caixa[1] - e - r, ex.nome, ' data-eixo="' + ex.nome + '"'); D.balao(P[0], caixa[3] + e + r, ex.nome);
    });
    Y.forEach(function (ey) {
      var P = f3([0, ey.v, 0]), r = D.raioBalao(ey.nome);
      D.linha(caixa[0] - e, P[1], caixa[2] + e, P[1], "MAD-EIXO");
      D.balao(caixa[0] - e - r, P[1], ey.nome, ' data-eixo="' + ey.nome + '"'); D.balao(caixa[2] + e + r, P[1], ey.nome);
    });
    var yTop = caixa[1] - e - 2 * D.raioBalao("1") - 3, xEsq = caixa[0] - e - 2 * D.raioBalao("A") - 3;
    if (X.length > 1) {
      var P1 = X.map(function (ex) { return [f3([ex.v, 0, 0])[0], yTop]; }), v1 = [];
      for (var i = 0; i + 1 < X.length; i++) v1.push(I.cm(X[i + 1].v - X[i].v));
      D.cadeia(P1, 7, v1, { semExt: true, attrs: v1.map(function () { return ' data-cota="eixos-x"'; }) });
    }
    if (Y.length > 1) {
      var Q1 = Y.map(function (ey) { return [xEsq, f3([0, ey.v, 0])[1]]; }), w1 = [];
      for (var j = 0; j + 1 < Y.length; j++) w1.push(I.cm(Y[j + 1].v - Y[j].v));
      D.cadeia(Q1, 7, w1, { semExt: true, attrs: w1.map(function () { return ' data-cota="eixos-y"'; }) });
    }
  }
  /* madeira em corte com LAMELAS (Padrão engenharada: sem anel; uma linha por lamela) / longitudinal com linhas ao longo do comprimento */
  function lamelas(D, x, y, w, h, o) {
    o = o || {};
    D.ret(x, y, w, h, o.cam || "MAD-CORTE", o.attr);
    var esp = Math.max(1.3, (o.lam || 0.04) * (o.s || 100)), horiz = o.horiz !== false;
    if (horiz) { for (var yy = y + esp; yy < y + h - 0.3; yy += esp) D.linha(x + 0.2, yy, x + w - 0.2, yy, "MAD-LAM"); }
    else { for (var xx = x + esp; xx < x + w - 0.3; xx += esp) D.linha(xx, y + 0.2, xx, y + h - 0.2, "MAD-LAM"); }
  }
  function chapa(D, x, y, w, h) { if (Math.min(w, h) < 0.9) D.cheio([[x, y], [x + Math.max(w, 0.5), y], [x + Math.max(w, 0.5), y + Math.max(h, 0.5)], [x, y + Math.max(h, 0.5)]], PRETO); else { D.ret(x, y, w, h, "MAD-ACO"); D.hachura(x, y, w, h, 1.2, "MAD-HACHURA"); } }
  function pinoVista(D, cx, cy, rad, eixo) { D.circ(cx, cy, Math.max(rad, 0.5), "MAD-LIG"); if (eixo) { D.linha(cx - rad * 1.7, cy, cx + rad * 1.7, cy, "MAD-EIXO"); D.linha(cx, cy - rad * 1.7, cx, cy + rad * 1.7, "MAD-EIXO"); } }

  /* ================================================================ CONTEXTO */
  function contexto(res, op) {
    var pcs = desenhaveis(res.fonte && res.fonte.pecas), mk = marcar(pcs), d = { res: res, pcs: pcs, marcas: mk };
    d.por = function (re) { return pcs.filter(function (p) { return re.test(p.id); }); };
    d.cobertura = pcs.filter(function (p) { return /^(T\d|V\d|BL|ES\d|TR|PD|FX\d)/.test(p.id); });
    d.pilares = pcs.filter(function (p) { return /^P\d/.test(p.id); });
    d.vergas = pcs.filter(function (p) { return /^VG/.test(p.id); });
    d.decks = pcs.filter(function (p) { return /^(DS-|DI-|ESC-)/.test(p.id); });
    d.reac = reacoesPorBase(res, d.pilares);
    d.pend = {};
    arr(res.auditoria && res.auditoria.achados).forEach(function (a) { if (a.peca) d.pend[a.peca] = a.mensagem; });
    d.fonteTodos = arr(res.fonte && res.fonte.pecas);
    return d;
  }

  /* ================================================================ E01 — LOCAÇÃO, BASES E REAÇÕES */
  function baseElevacao(c, D, x, y, esc0, res0) {
    /* elevação/corte da base em cruz (LG01) na escala 1:esc0; (x,y) = canto sup. esq. da área; devolve a caixa usada */
    var L = c.res.ligacoes, T = D.E.T, s = 1000 / esc0 / 1000 * 1000 / 1000;   /* mm de papel por mm real = 1/esc0 */
    var k = 1 / esc0, b = L.base, pl = L.placaBase, P = c.res.secoes.P, lado = ladoPilar(P), aM = aBase(L, P) * 1000;
    var placa = pl.dimensoes_mm[0], esp = pl.espessura_mm, chH = b.comprimento * 1000, chW = chapaLarg(b, P), pinoD = b.d * 1000, a1 = b.a1 * 1000, a3 = b.a3 * 1000;
    var wC = Math.max(placa + 200, 600) * k, hC = 170 * k, xc = x + 14, yPl = y + 12 + (chH + 60) * k + hC * 0;   /* topo da placa */
    var topoY = y + 14, yPlaca = topoY + (chH + 120) * k;           /* y do topo da placa (papel) */
    var cx = xc + wC / 2;
    /* concreto da fundação (contexto) */
    D.ret(xc, yPlaca + esp * k, wC, hC, "MAD-CONTEXTO"); D.hachura(xc, yPlaca + esp * k, wC, hC, 2.2, "MAD-CONTEXTO");
    chapa(D, cx - placa * k / 2, yPlaca, placa * k, esp * k);
    /* pilar (madeira, vista com lamelas): sobre a base elevada — o espaço livre não vem do cálculo */
    var folga = FOLGA_PE;
    var yBasePilar = yPlaca - folga * k, hPilar = chH * k + 40 * k;
    lamelas(D, cx - lado * 1000 * k / 2, yBasePilar - hPilar, lado * 1000 * k, hPilar, { horiz: false, s: 1000 * k * 1.0, lam: 0.04 });
    /* chapas em cruz (vista da chapa de face) */
    chapa(D, cx - chW * k / 2, yPlaca - (chH + folga) * k, chW * k, (chH + folga) * k, true);
    D.ret(cx - chW * k / 2, yPlaca - (chH + folga) * k, chW * k, (chH + folga) * k, "MAD-ACO");
    /* pinos Ø nas duas colunas ±a, linhas a1 a partir da extremidade a3 */
    var nr = b.nr;
    for (var j = 0; j < nr; j++) [-1, 1].forEach(function (sg) { pinoVista(D, cx + sg * aM * k, yPlaca - (folga + a3 + j * a1) * k, pinoD * k / 2, j === 0 || j === nr - 1); });
    /* ligação da placa com a chapa: solda de filete (nota) */
    D.linha(cx - chW * k / 2, yPlaca, cx - lado * 1000 * k / 2 - 2, yPlaca, "MAD-ACO");
    /* cotas: a3, a1 (cadeia vertical à direita), placa, e - */
    var xd = cx + chW * k / 2 + 8, P0 = [];
    P0.push([xd, yPlaca - folga * k]); for (var q = 0; q < nr; q++) P0.push([xd, yPlaca - (folga + a3 + q * a1) * k]); P0.push([xd, yPlaca - (chH + folga) * k]);
    var vals = [mm(a3 / 1000)]; for (var q2 = 1; q2 < nr; q2++) vals.push(mm(a1 / 1000)); vals.push(mm(a3 / 1000));
    D.cadeia(P0, 7, vals, { semExt: true, offs: [7, 12, -12, 16], attrs: vals.map(function () { return ' data-cota="base-a1a3"'; }) });
    D.cota(cx - placa * k / 2, yPlaca + esp * k + hC + 6, cx + placa * k / 2, yPlaca + esp * k + hC + 6, -4, String(placa), { semExt: true, offs: [-8, -12] });
    D.cota(cx - aM * k, yPlaca - (chH + folga) * k - 6, cx + aM * k, yPlaca - (chH + folga) * k - 6, 4, mm(2 * aM / 1000), { semExt: true, offs: [8, 12] });
    if (esc0 <= 5) D.cota(xc - 3, yPlaca, xc - 3, yPlaca + esp * k, -6, String(esp), { semExt: true });          /* 1:10 deixa a chapa fina demais para a cota (E4 r3) */
    /* textos */
    var xt = xc + wC + 10, yt = topoY + 2, h = T.nota * 0.9;
    var hx = D.textos(xt, yt, [
      (P.forma === "duplo" ? "BA-01 - base em garfo (LG01)" : "BA-01 - base em cruz (LG01)"),
      "placa " + placa + "x" + placa + "x" + esp + " mm (" + (c.res.secoes.P.forma === "duplo" ? "pilar duplo, 2 peças de " + I.cm(P.b) + "x" + I.cm(P.h) + " cm" : c.res.secoes.P.forma === "quadrado" ? "pilar " + I.cm(lado) + "x" + I.cm(lado) + " cm" : "pilar Ø" + I.cm(lado) + " cm") + ")",
      (P.forma === "duplo" ? "4 chapas externas do garfo (2 por peça) t = 12 mm x " : "2 chapas em cruz t = " + (b.chapa ? b.chapa.t_mm : 16) + " mm x ") + chW + " x " + Math.round(chH + folga) + " mm (" + Math.round(chH) + " embutidos + " + folga + " de folga)" + (P.forma === "duplo" ? "" : ", fendas de 18 mm"),
      b.n + (P.forma === "duplo" ? " parafusos passantes inox Ø" : " pinos inox Ø") + pinoD + (P.forma === "duplo" ? " por peça (" : " por chapa (") + b.nc + " colunas x " + nr + " linhas), " + (P.forma === "duplo" ? "aparentes, ajustados" : "ocultos, tampão de madeira"),
      pl.chumbadores.total + " chumbadores M20 inox A4-70 (" + pl.chumbadores.porLado + " por lado), ancoragem química",
      "embutimento do chumbador e sistema químico: pela fundação, outra empresa (" + ponto(c, "embutimento", "LG01, E01", "Embutimento e sistema químico do chumbador M20, argamassa de nivelamento sob a placa e tolerância de locação dos chumbadores: pela fundação (outra empresa)", "", "fundação") + ")",
      "folga entre o pé do pilar e a placa (pé elevado e drenado): " + folga + " mm, adotado (" + ponto(c, "folga-pe", "LG01, E01", "Folga entre o pé do pilar e a placa de base (pé elevado e drenado): o cálculo não fixa", folga + " mm; a chapa em cruz sobe " + Math.round(chH + folga) + " mm = " + Math.round(chH) + " embutidos + " + folga + " de folga") + ")",
      "chumbadores a +/- " + (pl.dimensoes_mm[0] - 100) / 2 + " mm do eixo, nos cantos (braço z = placa - 100 mm do cálculo; afastamento lateral = premissa RA)",
      (pl.solda ? "solda chapa-placa: " + (pl.solda.tipo === "penetracao-total" ? "PENETRAÇÃO TOTAL com controle (filete reprovou)" : "filete") + ", eta " + I.br(pl.solda.eta, 2) + (pl.solda.ok === false ? " - NÃO ATENDE" : "") : ""),
      (pl.flexao ? "placa t = " + esp + " mm: flexão eta " + I.br(pl.flexao.eta, 2) + "; chumbadores (tração + cortante) eta " + I.br(pl.chumbadores.verificacao ? pl.chumbadores.verificacao.eta : 0, 2) : ""),
      "madeira nunca em contato com o concreto; topo e pé protegidos (PT)"
    ].filter(Boolean), h, { wmax: Math.max(60, (c.geo.area.x + c.geo.area.w) - xt - 4) });
    return { x1: xt + 60, y1: Math.max(yPlaca + esp * k + hC + 14, yt + hx) };
  }
  function basePlanta(c, D, x, y, esc0) {
    var L = c.res.ligacoes, k = 1 / esc0, P = c.res.secoes.P, lado = ladoPilar(P), pl = L.placaBase, placa = pl.dimensoes_mm[0], b = L.base;
    var chW = chapaLarg(b, P), aM = aBase(L, P) * 1000, braco = placa - 100;
    var cx = x + placa * k / 2 + 14, cy = y + placa * k / 2 + 8;
    chapa(D, cx - placa * k / 2, cy - placa * k / 2, placa * k, placa * k, true); D.ret(cx - placa * k / 2, cy - placa * k / 2, placa * k, placa * k, "MAD-ACO");
    if (P.forma === "duplo") {          /* garfo: 2 peças b x h com a V entre elas; cada peça entre 2 chapas externas de 12 mm soldadas na placa */
      var Vg = c.res.secoes.V.b * 1000, Pb = P.b * 1000, Ph = P.h * 1000, tg = 12, braco2 = placa - 100;
      [-1, 1].forEach(function (sg) {
        var x0 = sg < 0 ? -(Vg / 2 + Pb) : Vg / 2;
        D.ret(cx + x0 * k, cy - Ph / 2 * k, Pb * k, Ph * k, "MAD-OCULTA");
        D.ret(cx + (x0 - tg) * k, cy - chW / 2 * k, tg * k, chW * k, "MAD-ACO"); D.ret(cx + (x0 + Pb) * k, cy - chW / 2 * k, tg * k, chW * k, "MAD-ACO");
      });
      var rc2 = 10 * k, ch2 = braco2 / 2 * k;
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { pinoVista(D, cx + sx * ch2, cy + sy * ch2, Math.max(rc2, 0.9), true); }); });
      D.cota(cx - ch2, cy + placa * k / 2 + 2, cx + ch2, cy + placa * k / 2 + 2, -6, String(braco2), { semExt: false, offs: [-12, -18] });
      D.cota(cx - placa * k / 2, cy - placa * k / 2 - 2, cx + placa * k / 2, cy - placa * k / 2 - 2, 6, String(placa), { semExt: false, offs: [10, 14] });
      return { w: placa * k + 28, h: placa * k + 30 };
    }
    D.ret(cx - lado * 1000 * k / 2, cy - lado * 1000 * k / 2, lado * 1000 * k, lado * 1000 * k, "MAD-OCULTA");
    D.ret(cx - chW * k / 2, cy - 8 * k, chW * k, 16 * k, "MAD-ACO"); D.ret(cx - 8 * k, cy - chW * k / 2, 16 * k, chW * k, "MAD-ACO");
    var rc = 10 * k, ch = braco / 2 * k;
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { pinoVista(D, cx + sx * ch, cy + sy * ch, Math.max(rc, 0.9), true); }); });
    D.cota(cx - ch, cy + placa * k / 2 + 2, cx + ch, cy + placa * k / 2 + 2, -6, String(braco / 2 * 2 / 1000 * 1000 | 0), { semExt: false, offs: [-12, -18] });
    D.cota(cx - placa * k / 2, cy - placa * k / 2 - 2, cx + placa * k / 2, cy - placa * k / 2 - 2, 6, String(placa), { semExt: false, offs: [10, 14] });
    return { w: placa * k + 28, h: placa * k + 30 };
  }
  function folhaE01(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, pil = d.pilares, X = d.reac.eixosX, Y = d.reac.eixosY, titH = 16;
    if (!pil.length || !X.length) { D.texto(a.x + 10, a.y + 20, "Fonte sem pilares: sem locação, não emitir.", T.titulo, { cor: VERMELHO }); return { escala: "INDICADA" }; }
    var esc0 = I.escolher(PADRAO_ENG.escalas.planta, function (e) { var s = 1000 / e; return (X[X.length - 1].v - X[0].v) * s + 90 <= a.w * 0.5 && (Y[Y.length - 1].v - Y[0].v) * s + 90 <= a.h * 0.6; }), s = 1000 / esc0;
    var ox = a.x + 40, oy = a.y + titH + 38, y1 = Y[Y.length - 1].v, f3 = planoXY(s, ox, oy, X[0].v, y1);
    I.tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE LOCAÇÃO DAS BASES", "ESC 1:" + esc0);
    var caixa = [f3([X[0].v, y1])[0], f3([X[0].v, y1])[1], f3([X[X.length - 1].v, Y[0].v])[0], f3([X[0].v, Y[0].v])[1]];
    eixosEmPlanta(c, f3, X, Y, caixa, 14);
    var L = c.res.ligacoes, placa = L.placaBase.dimensoes_mm[0] / 1000, P = c.res.secoes.P, lado = ladoPilar(P);
    d.reac.linhas.forEach(function (ln) {
      var C = f3([ln.x, ln.y]), w = placa * s, wp = lado * s;
      D.ret(C[0] - w / 2, C[1] - w / 2, w, w, "MAD-ACO", ' data-base="' + ln.no + '"');
      D.ret(C[0] - wp / 2, C[1] - wp / 2, wp, wp, "MAD-OCULTA");
      D.linha(C[0] - wp * 0.35, C[1], C[0] + wp * 0.35, C[1], "MAD-ACO"); D.linha(C[0], C[1] - wp * 0.35, C[0], C[1] + wp * 0.35, "MAD-ACO");
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { D.circ(C[0] + sx * (placa - 0.1) / 2 * s, C[1] + sy * (placa - 0.1) / 2 * s, 0.8, "MAD-LIG"); }); });
      D.texto(C[0] + 1.5, C[1] - w / 2 - 1.3, "BA-01", T.marca, { attr: ' data-rotulo="BA-01"' });
      D.texto(C[0] + 1.5, C[1] + w / 2 + T.marcaDensa * 0.76 + 1.0, ln.eixo, T.marcaDensa);
    });
    /* detalhe da base: planta 1:10 e elevação 1:10 */
    var xD = Math.max(caixa[2] + 70, a.x + 270);
    var wDet = a.x + a.w - xD - 2;
    var ed = 5, yDet = a.y + 2;
    I.tituloVista(D, xD, yDet, "BASE BA-01 (LG01) - PLANTA E ELEVAÇÃO", "ESC 1:" + ed);
    var bp = basePlanta(c, D, xD, yDet + 22, ed);
    var be = baseElevacao(c, D, xD + bp.w + 4, yDet + 22, ed);
    c.baseExtent = { y1: Math.max(yDet + 22 + bp.h, be.y1) };
    /* quadro de reações */
    var yq = Math.max(caixa[3] + 40, c.baseExtent.y1 + 30), xq = a.x + 4;
    var hT = I.tituloVista(D, xq, yq, "QUADRO DE REAÇÕES NA FUNDAÇÃO (kN, kN.m) - VALORES DE CÁLCULO", null) + 1;
    var cols = [{ t: "BASE" }, { t: "EIXO" }, { t: ["x", "(cm)"] }, { t: ["y", "(cm)"] }, { t: ["N compressão", "máx (kN)"] }, { t: ["N tração", "mín (kN)"] }, { t: ["H", "máx (kN)"] }, { t: ["M", "máx (kN.m)"] }, { t: "OBS.", al: "E" }];
    var lin = d.reac.linhas.map(function (ln) {
      var arr0 = ln.Nmin < 0;
      return [{ t: "BA-01 (" + ln.no + ")", attr: ' data-reacao="' + ln.no + '"' }, ln.eixo, I.cm(ln.x - d.reac.eixosX[0].v), I.cm(ln.y - d.reac.eixosY[0].v),
        { t: I.br(ln.Nmax, 2), attr: ' data-rN="' + ln.no + '|Nmax|' + r2(ln.Nmax) + '"' }, { t: I.br(ln.Nmin, 2), attr: ' data-rN="' + ln.no + '|Nmin|' + r2(ln.Nmin) + '"' },
        { t: I.br(ln.Hmax, 2), attr: ' data-rN="' + ln.no + '|Hmax|' + r2(ln.Hmax) + '"' }, { t: I.br(ln.Mmax, 2), attr: ' data-rN="' + ln.no + '|Mmax|' + r2(ln.Mmax) + '"' },
        { t: arr0 ? "ARRANCAMENTO: a fundação resiste à tração (" + ponto(c, "arrancamento", "E01", "Reação de arrancamento (N < 0) em bases do quadro: a fundação (outra empresa) precisa resistir à tração e ancorar os chumbadores", "", "fundação") + ")" : "" }];
    });
    var tb = D.tabela(xq, yq + hT, cols, lin, { fs: T.tabela, hl: 5.2 });
    var yy = yq + hT + tb.h + 3;
    yy += D.textos(xq, yy, [
      "Valores de CÁLCULO (combinações últimas, NBR 8681), na base de cada pilar; N > 0 compressão, N < 0 arrancamento. Base engastada: o momento M entra no bloco/sapata. Pilaretes baixos dos decks fora desta tabela (cargas leves: conferir com o projetista da fundação); os pilares ALTOS do deck inferior (DQ, contraventados em X) têm N, H e M na folha D06 do caderno do deck.",
      { t: "Decomposição característica G / Q / vento (a ser pedida pela fundação): o motor devolve só a envoltória de cálculo (" + ponto(c, "reacoes-carac", "E01", "Decomposição característica das reações em G / Q / vento: o motor devolve só a envoltória de cálculo", "reações de cálculo da tabela; a fundação pede a decomposição ao calculista", "RT") + ").", attr: ' data-pend="reacoes-caracteristicas"' },
      "Tolerância de locação dos chumbadores e de nível da placa: definir com a fundação (" + ponto(c, "embutimento", "LG01, E01", "", "") + ")."
    ], T.nota * 0.9, { wmax: 560 });
    return { escala: "1:" + esc0 };
  }

  /* ================================================================ E03 — COBERTURA / E07 CONTRAVENTAMENTO / E02 DECKS (plantas) */
  function plantaPeças(c, lista, o) {
    var D = c.D, a = c.geo.area, T = D.E.T;
    var cx = caixaPontos(lista), W = cx.x1 - cx.x0, H = cx.y1 - cx.y0, tit = o.tit;
    var disp = o.area || [a.x + 4, a.y + 18, a.x + a.w * (o.fw || 0.62), a.y + a.h - 2];
    var esc0 = I.escolher(PADRAO_ENG.escalas.planta, function (e) { var s = 1000 / e; return W * s + 2 * (o.mx || 34) <= disp[2] - disp[0] && H * s + 2 * (o.my || 30) <= disp[3] - disp[1]; }), s = 1000 / esc0;
    var ox = disp[0] + (o.mx || 34), oy = disp[1] + (o.my || 30), f3 = planoXY(s, ox, oy, cx.x0, cx.y1);
    I.tituloVista(D, a.x + 4, a.y + 2, tit, "ESC 1:" + esc0 + (o.sub ? " - " + o.sub : ""));
    return { f3: f3, s: s, esc0: esc0, cx: cx, caixa: [ox, oy, ox + W * s, oy + H * s], disp: disp };
  }
  function legenda(D, x, y, itens, h) {
    var yy = y;
    itens.forEach(function (it) {
      if (it.tipo === "linha") D.linha(x, yy + 2, x + 12, yy + 2, it.cam);
      else if (it.tipo === "ret") D.ret(x, yy - 0.5, 12, 5, it.cam);
      D.texto(x + 15, yy + 3.2, it.t, h, { cor: it.cor });
      yy += 7;
    });
    return yy - y;
  }
  function tabMarcas(c, x, y, prefs, titulo, wmax) {
    var D = c.D, T = D.E.T, linhas = c.d.marcas.tab.filter(function (m) { return prefs.indexOf(m.prefixo) >= 0; });
    var hT = I.tituloVista(D, x, y, titulo, null) + 1, tq = 0, vt = 0;
    var cols = [{ t: "MARCA" }, { t: "QTD" }, { t: "CLASSE" }, { t: ["b x h", "(cm)"] }, { t: ["L", "(cm)"] }, { t: ["VOL.", "(m3)"] }];
    var lin = linhas.map(function (m) { tq += m.qtd; vt += m.volTot; return [{ t: m.marca, attr: ' data-tab-marca="' + m.marca + '"' }, String(m.qtd), m.classe, m.h1h2 ? m.sec.replace(" x var.", "") + " x " + I.br(m.h1h2[0] * 100, 1) + ">" + I.br(m.h1h2[1] * 100, 1) : m.sec, String(m.Lcm), I.br(m.volTot, 3)]; });
    lin.push({ total: [{ t: "TOTAL" }, String(tq), "", "", "", I.br(vt, 3)] });
    var tb = D.tabela(x, y + hT, cols, lin, { fs: T.tabela * 0.92, hl: 4.6 });
    return hT + tb.h + 3;
  }
  function folhaE03(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area;
    var lista = d.cobertura.concat(d.pilares), pl = plantaPeças(c, lista, { tit: "PLANTA DE COBERTURA - TERÇAS, VIGAS V, TRAVAMENTOS E FITA", fw: 0.64 }), f3 = pl.f3;
    var itensTI = [], itens = [];
    /* verga (abaixo da V): oculta */
    desenharLista(D, c, d.vergas, f3, function () { return "MAD-OCULTA"; });
    var pecasTR = d.cobertura.filter(function (p) { return p.prefixo !== "TI"; });
    itens = desenharLista(D, c, pecasTR.concat(d.pilares), f3, function (p) { return /^(T\d|V\d)/.test(p.id) ? "MAD-PRINCIPAL" : "MAD-PECA"; });
    itensTI = d.cobertura.filter(function (p) { return p.prefixo === "TI"; }).map(function (p) { var A = f3(p.p0), B = f3(p.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-PECA", ' data-peca="' + I.esc(p.id) + '" data-marca="TI-01"'); return null; });
    d.cobertura.filter(function (p) { return p.prefixo === "TI"; }).forEach(function (p) { p.marca = "TI-01"; });
    /* eixos dos pilares: balões */
    eixosEmPlanta(c, f3, d.reac.eixosX, d.reac.eixosY, pl.caixa, 12);
    var fe = rotular(c, itens.filter(function (it) { return !/^(BL|ES|TR|PD|P)/.test(it.pc.id); }), T.marca, { raio: 26 });
    rotular(c, itens.filter(function (it) { return /^(BL|ES)/.test(it.pc.id); }), T.marcaDensa, { umaPorMarca: true, raio: 30 });
    rotular(c, itens.filter(function (it) { return /^(TR|PD|P\d)/.test(it.pc.id); }), T.marca, { raio: 26 });
    /* TI-01: uma chamada na fita */
    var f0 = d.cobertura.filter(function (p) { return p.prefixo === "TI"; })[0];
    if (f0) { var A = f3(f0.p0), B = f3(f0.p1), mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, lg = D.procura([mx, my - 10], I.n && 14, 4, [pl.caixa[0] - 2, pl.caixa[1] - 2, pl.caixa[2] + 2, pl.caixa[3] + 2], { raio: 40 }); if (lg) { D.texto(lg[0], lg[1], "TI-01", T.marcaDensa, { al: "C", meio: true }); D.linha(mx, my, tipoChamada(lg, mx, my)[0], tipoChamada(lg, mx, my)[1], "MAD-FINA"); D.ponto(mx, my, 0.4); } }
    /* inclinação */
    var tp = d.por(/^T\d/)[0], inc = tp ? null : null;
    var Vp = d.por(/^V\d/)[0], sl = Vp && Vp.perfil ? Math.abs((Vp.perfil[1][1] - Vp.perfil[0][1]) / (Vp.perfil[1][0] - Vp.perfil[0][0])) : null;
    var xr = a.x + a.w * 0.66, yr = a.y + 18;
    var Lg = legenda(D, xr, yr, [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: "terça TL e viga V VL (principais)" }, { tipo: "ret", cam: "MAD-PECA", t: "bloqueador BQ, escora ES, travessa TR, pendural PD, pilar PL" },
      { tipo: "linha", cam: "MAD-PECA", t: "fita metálica em X TI-01 (contraventamento, ver E07)" }, { tipo: "linha", cam: "MAD-OCULTA", t: "verga VG (abaixo da V, em linha tracejada)" }, { tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria (vermelho)" }], T.nota * 0.9);
    if (sl != null) {
      var yS = yr + Lg + 6; D.texto(xr, yS + 3, "Inclinação da água: i = " + pct(sl) + ", caindo para o beiral (+y).", T.nota * 0.95);
      D.seta(xr + 90, yS + 8, 0, 1, 3);
      var yy2 = yS + 14;
      D.texto(xr, yy2 + 2, "Balão B-B: elevação da viga V na folha E04.", T.nota * 0.9);
      var rr = D.balao(xr + 100, yy2 + 12, "B", ' data-corte="B"');
    }
    var yT = yr + Lg + 40;
    tabMarcas(c, xr, yT, ["TL", "VL", "PL", "BQ", "ES", "TR", "PD", "VG"], "QUADRO DE MARCAS DA COBERTURA E DA CASA", 150);
    
    return { escala: "1:" + pl.esc0 };
  }
  function folhaE07(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, L = c.res.ligacoes;
    var lista = d.cobertura.filter(function (p) { return /^(T\d|V\d|ES\d|FX\d)/.test(p.id); });
    var pl = plantaPeças(c, lista.concat(d.pilares), { tit: "CONTRAVENTAMENTO DA COBERTURA - PLANTA", fw: 0.64 }), f3 = pl.f3;
    desenharLista(D, c, lista.filter(function (p) { return /^(T\d|V\d)/.test(p.id); }), f3, function () { return "MAD-CONTEXTO"; });
    var its = desenharLista(D, c, d.pilares, f3, function () { return "MAD-CONTEXTO"; });
    var esc = desenharLista(D, c, lista.filter(function (p) { return /^ES\d/.test(p.id); }), f3, function () { return "MAD-PECA"; });
    d.cobertura.filter(function (p) { return p.prefixo === "TI"; }).forEach(function (p) { var A = f3(p.p0), B = f3(p.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-PRINCIPAL", ' data-peca="' + I.esc(p.id) + '" data-marca="TI-01"'); });
    eixosEmPlanta(c, f3, d.reac.eixosX, d.reac.eixosY, pl.caixa, 12);
    rotular(c, esc, T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var f0 = d.cobertura.filter(function (p) { return p.prefixo === "TI"; })[0];
    if (f0) { var A = f3(f0.p0), B = f3(f0.p1), mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, lg = D.procura([mx, my - 10], 14, 4, [pl.caixa[0] - 2, pl.caixa[1] - 2, pl.caixa[2] + 2, pl.caixa[3] + 2], { raio: 40 }); if (lg) { D.texto(lg[0], lg[1], "TI-01", T.marca, { al: "C", meio: true }); D.linha(mx, my, tipoChamada(lg, mx, my)[0], tipoChamada(lg, mx, my)[1], "MAD-FINA"); D.ponto(mx, my, 0.4); } }
    var fita = d.cobertura.filter(function (p) { return p.prefixo === "TI"; });
    var xr = a.x + a.w * 0.66, yy = a.y + 18;
    yy += I.tituloVista(D, xr, yy, "LG10 - FITA E ESCORAS", "ver detalhes na folha E06B (LG10)") + 2;
    var fl = L.fita, es = L.escora;
    yy += D.textos(xr, yy, [
      "TI-01 - " + fita.length + " trechos de fita metálica perfurada em X (60 x 2,0 mm, galvanizada a fogo ou inox) sobre as terças, sob o lambri, com tensor.",
      "N de cálculo na fita = " + I.br(fl.N_d, 2) + " kN; η = " + I.br(fl.eta, 3) + (fl.ok ? " (VERIFICADA)" : " (NÃO ATENDE)") + ". " + fl.parafusosPorPonta + " parafusos 5x50 por ponta.",
      { t: "Rk do parafuso 5x50 = " + I.br(fl.Rk_parafuso, 2) + " kN: " + (fl.fonteRk || "adotado pelo RT (24/10/2026)") + ".", attr: ' data-fonte="fita-rk"' },
      "ES - " + d.por(/^ES\d/).length + " escoras (mão-francesa) de MLC da terça à borda de baixo da V: " + es.especificacao + ".",
      "N de cálculo na escora = " + I.br(es.N_d, 2) + " kN; η = " + I.br(es.eta, 3) + (es.ok ? " (VERIFICADA)" : " (NÃO ATENDE)") + ".",
      "Bloqueadores BQ (travam a borda de baixo da terça na sucção do vento): " + L.bloqueador.especificacao + "; η = " + I.br(L.bloqueador.eta, 3) + "."
    ], T.nota * 0.95, { wmax: a.x + a.w - xr - 3 });
    legenda(D, xr, yy + 4, [{ tipo: "linha", cam: "MAD-PRINCIPAL", t: "fita em X (TI-01)" }, { tipo: "ret", cam: "MAD-PECA", t: "escora ES" }, { tipo: "ret", cam: "MAD-CONTEXTO", t: "terças, vigas V e pilares (contexto)" }], T.nota * 0.9);
    return { escala: "1:" + pl.esc0 };
  }
  function folhaE02(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area;
    var lista = d.decks;
    if (!lista.length) { D.texto(a.x + 10, a.y + 20, "O projeto não tem decks.", T.titulo); return { escala: "INDICADA" }; }
    var pl = plantaPeças(c, lista, { tit: "PLANTA ESTRUTURAL DOS DECKS - VIGAS, BARROTES, PILARETES E ESCADA", fw: 0.73, mx: 30, my: 26 }), f3 = pl.f3;
    var vs = lista.filter(function (p) { return /^(DS-V|DI-V|ESC-L)/.test(p.id); }), bs = lista.filter(function (p) { return /^(DS-B|DI-B|ESC-D)/.test(p.id); }), ps = lista.filter(function (p) { return /^(DS-P|DI-P)/.test(p.id); });
    var iB = desenharLista(D, c, bs, f3, function () { return "MAD-FINA"; }), iV = desenharLista(D, c, vs, f3, function () { return "MAD-PRINCIPAL"; }), iP = desenharLista(D, c, ps, f3, function () { return "MAD-CORTE"; });
    iP.forEach(function (it) { D.cheio(it.poly, PRETO); });
    var iM = desenharLista(D, c, lista.filter(function (p) { return /^D[SI]-MU\d/.test(p.id); }), f3, function () { return "MAD-CONTEXTO"; }), iC = desenharLista(D, c, lista.filter(function (p) { return /^D[SI]-CV\d/.test(p.id); }), f3, function () { return "MAD-LIG"; });      /* r11: muretas da fundação (contexto) e diagonais do contraventamento em X (DY) */
    rotular(c, iC, T.marcaDensa, { umaPorMarca: true, raio: 34 });
    rotular(c, iV, T.marca, { raio: 22 });
    rotular(c, iB, T.marcaDensa, { umaPorMarca: true, raio: 26 });
    rotular(c, iP, T.marcaDensa, { umaPorMarca: true, raio: 30 });
    var xr = a.x + a.w - 158, yy = a.y + 18;
    yy += legenda(D, xr, yy, [{ tipo: "ret", cam: "MAD-PRINCIPAL", t: "vigas DV, DW e longarinas EL" }, { tipo: "ret", cam: "MAD-FINA", t: "barrotes DB, DC e degraus ED" }, { tipo: "ret", cam: "MAD-CORTE", t: "pilaretes DP e pilares DQ (cortados, preenchidos)" }, { tipo: "ret", cam: "MAD-LIG", t: "diagonais do contraventamento em X DY (pilares altos)" }, { tipo: "ret", cam: "MAD-CONTEXTO", t: "muretas da fundação (outra empresa)" }, { tipo: "ret", cam: "MAD-PEND", t: "peça com pendência da auditoria" }], T.nota * 0.9) + 5;
    var nota = ["Deck superior: " + I.br((c.res.t7 && c.res.t7.areas && c.res.t7.areas.DS) || 0, 1) + " m2; deck inferior: " + I.br((c.res.t7 && c.res.t7.areas && c.res.t7.areas.DI) || 0, 1) + " m2.",
      "Pilaretes do deck superior agrupados em faixas de 10 cm de comprimento (corte pelo terreno); a tabela E10 traz o volume exato da fonte.",
      "Mãos-francesas (DS-MF), tábuas, apoios em bloco e guarda-corpo: quantidades na folha E10/E11; detalhe de apoio e de guarda-corpo na folha E06C.",
      c.res.deck ? { t: "Deck, escada e guarda-corpo verificados pelo cálculo (T7, NBR 7190-1:2022, classe de umidade " + c.res.deck.umidade + "): η máximo " + I.br(c.res.deck.etaMax, 2) + " entre tábuas, barrotes, vigas, pilaretes, mãos-francesas e guarda-corpo; memorial T7 no pacote." }
        : { t: "Deck e guarda-corpo sem verificação estrutural neste cálculo (rode o T7): verificar vigas, barrotes, pilaretes e a fixação do guarda-corpo antes de executar (" + ponto(c, "lig-sem-verif", "LG03c, LG12, LG13, E02", "Ligações do deck e do guarda-corpo sem verificação de resistência neste cálculo", "desenhadas com o que o orçamento traz; verificar antes de executar", "RT") + ").", attr: ' data-pend="deck-sem-verificacao"' }];
    Object.keys(c.pend).forEach(function (k) { if (lista.some(function (p) { return p.id === k; })) nota.push({ t: "Auditoria: " + c.pend[k], cor: VERMELHO, attr: ' data-pend="auditoria-' + k + '"' }); });
    yy += D.textos(xr, yy, nota, T.nota * 0.9, { wmax: 155 }) + 3;
    tabMarcas(c, xr, yy, ["DV", "DB", "DP", "DW", "DC", "DQ", "DY", "EL", "ED"], "QUADRO DE MARCAS DOS DECKS", 150);
    return { escala: "1:" + pl.esc0 };
  }

  /* ================================================================ E04 — PÓRTICOS: VIGA V DE ALTURA VARIÁVEL */
  function folhaE04(c) {
    var D = c.D, d = c.d, T = D.E.T, a = c.geo.area, L = c.res.ligacoes;
    var V = d.por(/^V\d/)[0];
    if (!V || !V.perfil) { D.texto(a.x + 10, a.y + 20, "Sem viga de altura variável na fonte.", T.titulo); return { escala: "INDICADA" }; }
    var perf = V.perfil, ys = perf.map(function (q) { return q[0]; }), zs = perf.map(function (q) { return q[1]; });
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), z0 = 8.7, zT = Math.max.apply(null, zs) + 0.55;
    var P0s = c.res.secoes.P, tolP = P0s.forma === "duplo" ? c.res.secoes.V.b / 2 + P0s.b / 2 + 0.05 : 0.05;      /* garfo: as duas peças ficam a ± (V/2 + b/2) do eixo da V */
    var pils = d.pilares.filter(function (p) { return Math.abs(p.p0[0] - V.p0[0]) < tolP; });
    var ex = I.escolher(PADRAO_ENG.escalas.porticos, function (e) { return (y1 - y0) * 1000 / e + 70 <= a.w; }), s = 1000 / ex;
    var ox = a.x + 38, oy = a.y + 40, f3 = planoYZ(s, ox, oy, y0, zT);
    I.tituloVista(D, a.x + 4, a.y + 2, "ELEVAÇÃO DA VIGA V (VL-01) - PÓRTICO LATERAL", "ESC 1:" + ex);
    function PP(y, z) { return f3([0, y, z]); }
    /* chão e pilares */
    var Pz = PP(y0, z0)[1];
    D.linha(ox - 8, Pz, ox + (y1 - y0) * s + 8, Pz, "MAD-CONTEXTO");
    var terr = d.por(/^T\d/);
    pils.forEach(function (p) {
      var g = cascoDe(p, f3); D.poli(g, "MAD-PECA", true, ' data-peca="' + p.id + '" data-marca="' + p.marca + '"');
      var xs2 = g.map(function (q) { return q[0]; }), cxp = (Math.min.apply(null, xs2) + Math.max.apply(null, xs2)) / 2;
      D.texto(cxp, PP(0, z0 + 1.0)[1], p.marca, T.marca, { al: "C", attr: ' data-rotulo="' + p.marca + '"' });
    });
    /* perfil da V (polígono de altura variável) */
    var poly = perf.map(function (q) { return PP(q[0], q[1]); });
    D.poli(poly, "MAD-PRINCIPAL", true, ' data-peca="' + V.id + '" data-marca="' + V.marca + '"');
    /* lamelas ao longo do comprimento (corte longitudinal): linhas paralelas à face inferior, recortadas na altura */
    for (var k = 1; k <= 9; k++) {
      var ysamp = [], t0 = y0, t1 = y1, hsz = [];
      var zb = function (y) { var segs = perf; return null; };
    }
    /* escoras e terças em seção */
    d.por(/^ES\d/).filter(function (p) { return Math.abs(p.p0[0] - V.p0[0]) < 1.2; }).forEach(function (p) { var A = f3(p.p0), B = f3(p.p1); D.linha(A[0], A[1], B[0], B[1], "MAD-OCULTA"); });
    var itT = terr.map(function (p) { var g = cascoDe(p, f3); D.poli(g, "MAD-PECA", true, ' data-peca="' + p.id + '" data-marca="' + p.marca + '"'); return { g: g, p: p }; });
    /* topo e fundo da V: níveis nas pontas e nos apoios */
    function topoEm(y) { var best = null; for (var i = 0; i < perf.length; i++) { var A = perf[i], B = perf[(i + 1) % perf.length]; if (Math.abs(A[0] - B[0]) < 1e-9) continue; var lo = Math.min(A[0], B[0]), hi = Math.max(A[0], B[0]); if (y < lo - 1e-9 || y > hi + 1e-9) continue; var z = A[1] + (B[1] - A[1]) * (y - A[0]) / (B[0] - A[0]); if (best === null) best = [z, z]; best[0] = Math.max(best[0], z); best[1] = Math.min(best[1], z); } return best; }
    var apoios = pils.map(function (p) { return p.p0[1]; }).sort(function (p, q) { return p - q; }).filter(function (v, k, ar) { return k === 0 || Math.abs(v - ar[k - 1]) > 1e-6; });      /* garfo: duas peças por pilar na mesma posição = um apoio */
    var pontos = [{ y: y1, nome: "A" }, { y: y0, nome: "B" }];
    function nivelPonto(y, lado) { var t = topoEm(y); return t ? t : [0, 0]; }
    var yMaxTopo = Math.min.apply(null, itT.map(function (q) { return Math.min.apply(null, q.g.map(function (pt) { return pt[1]; })); }));
    [y0, y1].concat(apoios).forEach(function (y) {
      var t = topoEm(y); if (!t) return;
      var P1 = PP(y, t[0]), P2 = PP(y, t[1]), ehApoio = y !== y0 && y !== y1;
      D.linha(P1[0], P1[1], P1[0], yMaxTopo - 9, "MAD-COTA"); D.texto(P1[0], yMaxTopo - 10.5, "+" + I.br(t[0] - 8.7, 2) + "m", T.cota, { al: "C", attr: ' data-nivel="topo"' });
      D.ponto(P2[0], P2[1], 0.5);
      D.texto(P2[0] + (ehApoio ? (y === apoios[0] ? 18 : -18) : (y === y0 ? -12 : 12)), P2[1] + 5.5, "+" + I.br(t[1] - 8.7, 2) + "m", T.cota, { al: "C", attr: ' data-nivel="fundo"' });
    });
    /* A e B nas pontas */
    D.balao(PP(y1, zT)[0] + 6, PP(y1, zT)[1] - 18, "A"); D.balao(PP(y0, zT)[0] - 6, PP(y0, zT)[1] - 18, "B");
    /* cotas horizontais: balanço B, vão entre apoios, balanço A, total */
    var yc = Pz + 18, P0 = [[PP(y0, 0)[0], yc]]; apoios.forEach(function (ya) { P0.push([PP(ya, 0)[0], yc]); }); P0.push([PP(y1, 0)[0], yc]);
    var v0 = []; for (var i2 = 0; i2 + 1 < P0.length; i2++) v0.push(I.cm((i2 === 0 ? apoios[0] - y0 : (i2 === P0.length - 2 ? y1 - apoios[apoios.length - 1] : apoios[i2] - apoios[i2 - 1]))));
    D.cadeia(P0, -7, v0, { semExt: false, attrs: v0.map(function () { return ' data-cota="v-vao"'; }) });
    D.cota(P0[0][0], yc, P0[P0.length - 1][0], yc, -16, I.cm(y1 - y0), { semExt: true, attrs: [' data-cota="v-L"'] });
    /* cotas de altura h1, h2, h no apoio (perpendicular ao eixo: vertical da seção) */
    function cotaH(y, rot) { var t = topoEm(y), P1 = PP(y, t[0]), P2 = PP(y, t[1]); D.cota(P1[0], P1[1], P2[0], P2[1], rot, I.cm(t[0] - t[1]), { semExt: false, attrs: [' data-cota="v-h"'] }); return t[0] - t[1]; }
    var hA = cotaH(y1, 9), hB = cotaH(y0, -9);
    /* R21: contraflecha de fábrica NA PONTA da V em balanço (calculada pelo motor: ≤ 2/3 de wG,inst, NBR 7190-1:2022 item 8.2, arredondada para baixo ao mm — só depois de esgotada a altura na ponta; ponta A = y1 = ip 1, ponta B = y0 = ip 0) — cota "CF = X mm" a partir do resultado, nunca valor fixo */
    var cfV = c.res.contraflechaV, cfA = cfV && cfV.aplicada && cfV.pontas[1] ? cfV.pontas[1].contraflecha_mm : 0, cfB = cfV && cfV.aplicada && cfV.pontas[0] ? cfV.pontas[0].contraflecha_mm : 0, cfVao = cfV && cfV.aplicada && cfV.vao ? cfV.vao.contraflecha_mm : 0;
    if (cfV && cfV.aplicada) [[y1, cfA, 1], [y0, cfB, -1]].forEach(function (q) { var t = topoEm(q[0]), Pc = t && PP(q[0], t[1]); if (!Pc || !q[1]) return; D.linha(Pc[0], Pc[1] + 1, Pc[0] + q[2] * 0.01, Pc[1] + 10, "MAD-COTA"); D.texto(Pc[0] + q[2] * 0.5, Pc[1] + 13.5, "CF = " + q[1] + " mm", T.cota, { al: q[2] > 0 ? "L" : "R", attr: ' data-cota="v-cf"' }); });
    /* A2 (revisão R05): a contraflecha no VÃO da V (compensa a descida do vão; item 8.2) é cotada no meio do vão; na ponta só existe onde G desce */
    if (cfVao > 0 && apoios.length > 1) { var ymV = (apoios[0] + apoios[apoios.length - 1]) / 2, tV = topoEm(ymV), PcV = tV && PP(ymV, tV[1]); if (PcV) { D.linha(PcV[0], PcV[1] + 1, PcV[0] + 0.01, PcV[1] + 10, "MAD-COTA"); D.texto(PcV[0] + 0.5, PcV[1] + 13.5, "CF vão = " + cfVao + " mm", T.cota, { al: "L", attr: ' data-cota="v-cf-vao"' }); } }
    apoios.forEach(function (ya, i) { cotaH(ya, i === 0 ? -9 : 9); });
    /* inclinações */
    var sTop = Math.abs((perf[1][1] - perf[0][1]) / (perf[1][0] - perf[0][0])), sBal = Math.abs((perf[perf.length - 1][1] - perf[perf.length - 2][1]) / (perf[perf.length - 1][0] - perf[perf.length - 2][0]));
    /* ângulo, face de corte, contraflecha e alturas nas pontas/apoios: chamada sob a viga, no vão livre entre o apoio e a ponta A (R04) */
    var ymA = (apoios[0] + y1) / 2, tmA = topoEm(ymA), PmA = tmA && PP(ymA, tmA[1]);
    if (PmA) {
      D.texto(PmA[0], PmA[1] + 9, "FACE SUPERIOR i = " + pct(sTop) + " (cai para a ponta A)  -  FACE INFERIOR DO BALANÇO B i = " + pct(sBal), T.nota, { al: "C", attr: ' data-anot="v-angulo"' });
      D.texto(PmA[0], PmA[1] + 13.5, "FC VERTICAL 90 gr NAS PONTAS A E B  -  h1 = " + I.br(hA * 100, 1) + " cm (A)  h2 = " + I.br(hB * 100, 1) + " cm (B)" + (cfV && cfV.aplicada ? "" : "  -  CONTRAFLECHA 0 mm (" + ponto(c, "contraflecha", "E04", "Contraflecha da V: o cálculo não especifica", "sem contraflecha (empenamento máximo 4 mm em 2 m, EN 14080)", "RT") + ")"), T.nota, { al: "C", attr: ' data-anot="v-fc"' });
      if (cfV && cfV.aplicada) D.texto(PmA[0], PmA[1] + 18, "CONTRAFLECHA DE FABRICA: " + (cfVao ? "NO VAO = " + cfVao + " mm" : "") + (cfA || cfB ? (cfVao ? "; " : "") + "NA PONTA QUE DESCE A = " + cfA + " mm, B = " + cfB + " mm" : "") + " (" + ponto(c, "contraflecha", "E04", "Contraflecha de fábrica da V (R21): decisão do coordenador, a validar pelo RT", "contraflecha de fábrica " + cfV.max_mm + " mm (" + (cfVao ? "no vão " + cfVao + " mm" : "") + (cfA || cfB ? (cfVao ? "; " : "") + "na ponta que desce A " + cfA + " / B " + cfB + " mm" : "") + "; ≤ 2/3 de wG,inst = " + I.br(cfV.limiteNorma_mm, 1) + " mm, NBR 7190-1:2022 item 8.2; só compensa descida)" + (cfV.excedeNorma ? "; ACIMA DO LIMITE DA NORMA (escolha explícita)" : ""), "RT") + ")", T.nota, { al: "C", attr: ' data-anot="v-cf"' });
    }
    /* face de corte nas pontas: vertical 90 gr, hachura 3 traços 45 gr */
    [[y1, 1], [y0, -1]].forEach(function (q) { var t = topoEm(q[0]), Pm = PP(q[0], (t[0] + t[1]) / 2); for (var k2 = -1; k2 <= 1; k2++) D.linha(Pm[0] + q[1] * 0.4, Pm[1] + k2 * 3 + 1.2, Pm[0] + q[1] * 3.6, Pm[1] + k2 * 3 - 1.8, "MAD-HACHURA"); });
    var xtxt = ox, ytxt = yc + 40;
    var tmk = d.marcas.tab.filter(function (m) { return m.marca === V.marca; })[0];
    var dens = [
      V.marca + " - " + tmk.classe + " - " + I.cm(V.b) + "x" + I.br(hA * 100, 1) + ">" + I.br(hB * 100, 1) + " x " + tmk.Lcm + "  (b x h1>h2 x L, cm; A = ponta de topo mais baixo, o beiral)",
      "h1 (ponta A) = " + I.br(hA * 100, 1) + " cm; h2 (ponta B) = " + I.br(hB * 100, 1) + " cm; sobre os apoios: " + apoios.map(function (ya) { var t = topoEm(ya); return I.br((t[0] - t[1]) * 100, 1) + " cm"; }).join(" e ") + " (altura residual no apoio = a que governa o cisalhamento)." + (cfV && cfV.altura ? " Altura na ponta do balanço adotada pelo cálculo: " + I.br(cfV.altura.atual_m * 100, 0) + " cm (máximo atrás da testeira: " + I.br(cfV.altura.max_m * 100, 0) + " cm" + (cfV.altura.cresceu ? "; subiu de " + I.br(cfV.altura.inicial_m * 100, 0) + " cm para fechar a flecha do balanço" : "") + ")." : ""),
      "Perfil poligonal: volume pela área do perfil (" + I.br(V.vol, 3) + " m3 por viga), não pela média das pontas. Cisalhamento da seção variável com o fator do EN 14080 (memorial).",
      "FC (face de corte): vertical, 90 gr, nas duas pontas. Posição do eixo de cada apoio medida da ponta B e comprimento de apoio = lado do pilar (" + I.cm(c.res.secoes.P.b || c.res.secoes.P.d) + " cm).",
      (cfV && cfV.aplicada ? { t: "Contraflecha de fábrica da V (R21, a validar pelo RT; só compensa DESCIDA): " + (cfVao ? "no meio do vão = " + cfVao + " mm" : "") + (cfA || cfB ? (cfVao ? "; " : "") + "na ponta que desce A = " + cfA + " mm e B = " + cfB + " mm" : "") + ", " + (cfV.excedeNorma ? "ACIMA DO LIMITE" : "dentro do limite") + " da NBR 7190-1:2022 (item 8.2: contraflecha ≤ 2/3 do deslocamento instantâneo das cargas permanentes, wG,inst = " + I.br(cfV.gInst_mm, 1) + " mm; limite " + I.br(cfV.limiteNorma_mm, 1) + " mm), arredondada para baixo ao mm (" + ponto(c, "contraflecha") + "). " + (cfV.altura ? "Com a V de " + I.br(cfV.altura.atual_m * 100, 0) + " cm na ponta, a" : "A") + " flecha líquida do balanço é η " + I.br(cfV.etaLiquida, 2) + " (sem contraflecha " + I.br(cfV.etaSemContraflecha, 2) + "; limite " + (cfV.limiteFlecha || "L/150") + ", Tab. 21, p. 67 impr./PDF 79). Linha de contraflecha da V pela forma (invertida) da deformada instantânea de G; o fabricante marca e confere na mesa de colagem.", attr: ' data-pend="contraflecha"' } : { t: "Contraflecha: 0 mm no meio do vão, adotado (" + ponto(c, "contraflecha", "E04", "Contraflecha da V: o cálculo não especifica", "sem contraflecha (empenamento máximo 4 mm em 2 m, EN 14080)", "RT") + "). Sem contraflecha o empenamento máximo é 4 mm em 2 m (EN 14080).", attr: ' data-pend="contraflecha"' }),
      { t: "Reforço transversal Ft,90 sobre o pilar: " + L.reforcoV.parafusos + " parafusos SFS WT-T 8,2 x 300 (LG11, folha E06C).", attr: ' data-lg="LG11"' },
      "Inclinação da face superior i = " + pct(sTop) + " (caindo para a ponta A); face inferior no balanço B i = " + pct(sBal) + ". As 12 terças TL-01 aparecem em seção sobre a V.",
      "Níveis em metros relativos ao topo da placa de base (z = 0,00 = cota 8,70 do modelo da fonte); conferir com o nível do piso da arquitetura.",
      "Reações no pé do pilar = quadro da folha E01 (valores de cálculo)."
    ];
    D.textos(xtxt, ytxt, dens, T.nota * 0.95, { wmax: (y1 - y0) * s + 20 });
    /* elevação frontal 1:50 (x-z): pilares, V em seção, terças empilhadas, vergas */
    var lista = d.pilares.concat(d.vergas).concat(d.por(/^V\d/)).concat(d.por(/^T\d/));
    var cxF = caixaPontos(lista), eF = 50, sF = 1000 / eF, xF = a.x + a.w - (cxF.x1 - cxF.x0) * sF - 24, yF = a.y + a.h - 6 - (cxF.z1 - 8.7) * sF - 20;
    var ff = planoXZ(sF, xF, yF + 0, cxF.x0, cxF.z1);
    I.tituloVista(D, xF - 10, yF - 22, "ELEVAÇÃO FRONTAL", "ESC 1:" + eF);
    D.linha(xF - 6, ff([0, 0, 8.7])[1], xF + (cxF.x1 - cxF.x0) * sF + 6, ff([0, 0, 8.7])[1], "MAD-CONTEXTO");
    var its = [];
    d.pilares.forEach(function (p) { D.poli(cascoDe(p, ff), "MAD-PECA", true); });
    d.vergas.forEach(function (p) { D.poli(cascoDe(p, ff), "MAD-OCULTA", true); });
    d.por(/^V\d/).forEach(function (p) { var g = cascoDe(p, ff); D.poli(g, "MAD-PRINCIPAL", true); });
    d.por(/^T\d/).forEach(function (p) { D.poli(cascoDe(p, ff), "MAD-PECA", true); });
    var Pc = ff([0, 0, 11.05]), Pc2 = ff([cxF.x1, 0, 11.05]);
    D.cota(ff([d.reac.eixosX[0].v, 0, 8.7])[0], ff([0, 0, 8.7])[1] + 4, ff([d.reac.eixosX[1].v, 0, 8.7])[0], ff([0, 0, 8.7])[1] + 4, -7, I.cm(d.reac.eixosX[1].v - d.reac.eixosX[0].v), { semExt: true });
    D.texto(xF + 2, ff([0, 0, cxF.z1])[1] - 4, "PL, VL e TL em elevação; vergas VG tracejadas (atrás)", T.marcaDensa);
    return { escala: "1:" + ex };
  }

  /* ================================================================ E06 — DETALHES TÍPICOS DAS LIGAÇÕES (v2: vistas em mm reais, 2 a 3 vistas por ligação, peça de aço cotada, nota ao lado) */
  /* quadro de espaçamentos de um grupo de pinos: linhas { nome, d, a1, a2, a3, alfa, a4 } em mm → texto "a1 = 80 (min 71) ..." e OK */
  function espacos(g) {
    var m = bordas(g.d / 1000, g.alfa == null ? Math.PI / 2 : g.alfa), q = [];
    function it(nome, real, min) { if (real == null) return; q.push({ nome: nome, real: real, min: Math.round(min * 1000 * 10) / 10, ok: real + 1e-6 >= min * 1000 - 1e-6 }); }
    it("a1", g.a1, m.a1); it("a2", g.a2, m.a2); it("a3,t", g.a3, m.a3t); it("a3,c", g.a3c, m.a3c); it("a4,t", g.a4t, m.a4t); it("a4,c", g.a4c, m.a4c);
    return q;
  }
  function linhaEspacos(q) { return q.map(function (x) { return x.nome + " = " + Math.round(x.real) + " | " + I.br(x.min, 0) + (x.ok ? "" : " NÃO ATENDE"); }).join("; "); }
  function gruposPinos(c) {
    var L = c.res.ligacoes, P = c.res.secoes.P, a = aBase(L, P) * 1000, VG = c.res.secoes.VG, out = [];
    function G(nome, g, extra) { var o = { nome: nome, d: g.d * 1000, a1: g.a1 * 1000, a3: g.a3 * 1000, alfa: g.alfa, n: g.n, nc: g.nc, nr: g.nr, eta: g.eta, ok: g.ok !== false }; for (var k in extra) o[k] = extra[k]; return o; }
    var lado = P.forma === "quadrado" ? P.b : (P.forma === "duplo" ? P.h : P.d * 0.85);
    out.push(G("LG01 base (por chapa)", L.base, { a2: 2 * a, a4t: lado * 500 - a, a4c: lado * 500 - a, a3c: L.base.a3 * 1000 }));
    out.push(G("LG02 topo, no pilar", L.topo, { a2: 2 * a, a4t: lado * 500 - a, a4c: lado * 500 - a, a3c: L.topo.a3 * 1000 }));
    if (L.topoV) out.push(G("LG02 topo, na V", L.topoV, { a2: 100 }));          /* o garfo não tem topoV */
    if (VG && L.verga) out.push(G("LG03 verga, pinos na fenda", L.verga.pinos, { a2: 2 * (VG.h / 2 - 4 * 0.012) * 1000, a4t: 4 * 12, a4c: 4 * 12 }));
    if (VG && L.verga && L.verga.naV) { var gv = vergaVGeom(c); out.push({ nome: "LG03 verga, parafusos Ø16 na V", d: gv.d, a1: gv.a1, a2: gv.a2, a4t: gv.he, alfa: gv.alfa, n: gv.n, nc: 2, nr: gv.nCol, eta: gv.eta, ok: gv.ok }); }          // A1: os valores DESENHADOS (do motor), contra o mínimo da Tab. 14 no ângulo real
    return out;
  }

  /* ---- pontos a confirmar: UM quadro (folha E11); no desenho só a etiqueta "PC-n" em preto. adotado = valor conservador usado no desenho ("" = sem valor: a RT decide) ---- */
  function ponto(c, chave, onde, texto, adotado, quem) {
    var l = c.pc, k = null, i;
    for (i = 0; i < l.length; i++) if (l[i].chave === chave) { k = l[i]; break; }
    if (!k) { k = { n: l.length + 1, chave: chave, onde: onde || "", texto: texto || "", adotado: adotado || "", quem: quem || "RT" }; l.push(k); }
    else {
      if (onde) onde.split(", ").forEach(function (o) { if (o && k.onde.split(", ").indexOf(o) < 0) k.onde += (k.onde ? ", " : "") + o; });
      if (texto && !k.texto) { k.texto = texto; k.adotado = adotado || k.adotado; k.quem = quem || k.quem; }
    }
    return "PC-" + k.n;
  }

  /* ---- vista em mm reais: X para a direita, Z para cima; r = retângulo do painel em papel (mm); ext = extensão do desenho em mm; pad = folga em papel [esq, dir, cima, baixo] para cotas ---- */
  function vista(c, r, ext, pad, escs) {
    var D = c.D, W = ext.x1 - ext.x0, H = ext.z1 - ext.z0;
    var e = I.escolher(escs || [5, 10, 20], function (e) { return W / e + pad[0] + pad[1] <= r.w && H / e + pad[2] + pad[3] <= r.h; });
    var k = 1 / e, ox = r.x + pad[0] + (r.w - pad[0] - pad[1] - W * k) / 2, oy = r.y + pad[2] + (r.h - pad[2] - pad[3] - H * k) / 2;
    var V = { D: D, k: k, esc: e, n0: D.sg.length, r: r };
    function sx(X) { return ox + (X - ext.x0) * k; }
    function sy(Z) { return oy + (ext.z1 - Z) * k; }
    V.X = sx; V.Y = sy;
    V.ret = function (X, Z, w, h, cam, at) { D.ret(sx(X), sy(Z + h), w * k, h * k, cam, at); };
    V.fundo = function (X, Z, w, h) { D.fundo([[sx(X), sy(Z + h)], [sx(X + w), sy(Z + h)], [sx(X + w), sy(Z)], [sx(X), sy(Z)]], "#fff"); };
    V.mad = function (X, Z, w, h, o) { o = o || {}; lamelas(D, sx(X), sy(Z + h), w * k, h * k, { horiz: o.horiz !== false, s: k * 1000, lam: LAM / 1000 }); };
    V.vis = function (X, Z, w, h, cam) { D.ret(sx(X), sy(Z + h), w * k, h * k, cam || "MAD-PECA"); };
    V.oc = function (X, Z, w, h) { D.ret(sx(X), sy(Z + h), w * k, h * k, "MAD-OCULTA"); };
    V.aco = function (X, Z, w, h) { V.fundo(X, Z, w, h); chapa(D, sx(X), sy(Z + h), w * k, h * k); };
    V.acoV = function (X, Z, w, h) { V.fundo(X, Z, w, h); D.ret(sx(X), sy(Z + h), w * k, h * k, "MAD-ACO"); };   /* aço visto (sem hachura) */
    V.conc = function (X, Z, w, h) { D.ret(sx(X), sy(Z + h), w * k, h * k, "MAD-CONTEXTO"); D.hachura(sx(X), sy(Z + h), w * k, h * k, 2.4, "MAD-CONTEXTO"); };
    V.lin = function (X1, Z1, X2, Z2, cam) { D.linha(sx(X1), sy(Z1), sx(X2), sy(Z2), cam || "MAD-LIG"); };
    V.eixoV = function (X, Z1, Z2) { D.linha(sx(X), sy(Z1), sx(X), sy(Z2), "MAD-EIXO"); };
    V.eixoH = function (X1, X2, Z) { D.linha(sx(X1), sy(Z), sx(X2), sy(Z), "MAD-EIXO"); };
    V.furo = function (X, Z, d, eixo) { var rr = Math.max(d * k / 2, 0.5); D.circ(sx(X), sy(Z), rr, "MAD-LIG"); if (eixo) { D.linha(sx(X) - rr * 1.7, sy(Z), sx(X) + rr * 1.7, sy(Z), "MAD-EIXO"); D.linha(sx(X), sy(Z) - rr * 1.7, sx(X), sy(Z) + rr * 1.7, "MAD-EIXO"); } };
    V.pino = function (X, Z, d, eixo) { var rr = Math.max(d * k / 2, 0.5), cl = []; for (var i = 0; i < 16; i++) cl.push([sx(X) + rr * Math.cos(i * Math.PI / 8), sy(Z) + rr * Math.sin(i * Math.PI / 8)]); D.fundo(cl, "#fff"); V.furo(X, Z, d, eixo); };
    V.hex = function (X, Z, s) { var R = s / Math.sqrt(3) * k, pp = []; for (var i = 0; i < 6; i++) pp.push([sx(X) + R * Math.cos(i * Math.PI / 3), sy(Z) + R * Math.sin(i * Math.PI / 3)]); D.poli(pp, "MAD-LIG", true); };
    V.ch = function (X1, X2, Z, off, val, o) { D.cota(sx(X1), sy(Z), sx(X2), sy(Z), off, val, o || {}); };                 /* off > 0 = acima, < 0 = abaixo */
    V.cv = function (Zt, Zb, X, off, val, o) { if (off < 0) D.cota(sx(X), sy(Zb), sx(X), sy(Zt), -off, val, o || {}); else D.cota(sx(X), sy(Zt), sx(X), sy(Zb), off, val, o || {}); };   /* off > 0 = direita, < 0 = esquerda (o texto fica do lado de fora) */
    V.cadH = function (Xs, Z, off, vals, o) { D.cadeia(Xs.map(function (x) { return [sx(x), sy(Z)]; }), off, vals, o || {}); };
    V.cadV = function (Zs, X, off, vals, o) { var P = Zs.map(function (z) { return [sx(X), sy(z)]; }); if (off < 0) D.cadeia(P.slice().reverse(), -off, vals.slice().reverse(), o || {}); else D.cadeia(P, off, vals, o || {}); };   /* Zs de cima para baixo; off < 0 = esquerda */
    V.niv = function (X, Z, val, lado) { D.nivel(sx(X), sy(Z), val, lado || 1, ' data-nivel="1"'); };
    V.bal = function (X, Z, dx, dy, n) {
      var p = sx(X), q = sy(Z), rb = D.raioBalao(String(n)), L0 = Math.sqrt(dx * dx + dy * dy) || 10, a0 = Math.atan2(dy, dx), cands = [[dx, dy]], ar = c.geo && c.geo.area, f, k, g, ok = false;
      /* E4 r4: se o círculo cair em cima de traço/texto, sair da área da folha ou a chamada cortar texto, tenta outros afastamentos (giros de 30 graus, cada vez mais longe); sem lugar livre, fica o pedido */
      for (f = 0; f < 5; f++) for (k = 0; k < 12; k++) { g = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6; cands.push([Math.cos(g) * L0 * (1 + 0.6 * f), Math.sin(g) * L0 * (1 + 0.6 * f)]); }
      for (k = 0; k < cands.length && !ok; k++) {
        var cx = p + cands[k][0], cy = q + cands[k][1], dd = Math.sqrt(cands[k][0] * cands[k][0] + cands[k][1] * cands[k][1]) || 1;
        if (ar && (cx - rb < ar.x + 0.5 || cx + rb > ar.x + ar.w - 0.5 || cy - rb < ar.y + 0.5 || cy + rb > ar.y + ar.h - 0.5)) continue;
        if (!D.livre([cx - rb, cy - rb, cx + rb, cy + rb], 0.5) || D.cortaTexto(p, q, cx - cands[k][0] / dd * rb, cy - cands[k][1] / dd * rb)) continue;
        dx = cands[k][0]; dy = cands[k][1]; ok = true;
      }
      var Lh = Math.sqrt(dx * dx + dy * dy) || 1;
      D.linha(p, q, p + dx - dx / Lh * rb, q + dy - dy / Lh * rb, "MAD-FINA"); D.ponto(p, q, 0.45); D.balao(p + dx, q + dy, String(n), ' data-bal="' + n + '"');
    };
    V.tx = function (X, Z, s, h, o) { D.texto(sx(X), sy(Z), s, h || D.E.T.nota, o || {}); };
    V.quebra = function (X, Z, w) {   /* linha de quebra em zigue-zague (peça cortada), horizontal */
      var n = 6, pp = []; for (var i = 0; i <= n; i++) pp.push([sx(X) + w * k * i / n, sy(Z) + (i % 2 ? -1.1 : 1.1) * (i === 0 || i === n ? 0 : 1)]);
      D.fundo([[sx(X), sy(Z) - 1.4], [sx(X + w), sy(Z) - 1.4], [sx(X + w), sy(Z) + 1.4], [sx(X), sy(Z) + 1.4]], "#fff"); D.poli(pp, "MAD-FINA", false);
    };
    V.bbox = function () {
      var s = D.sg.slice(V.n0), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      s.forEach(function (q) { x0 = Math.min(x0, q[0], q[2]); x1 = Math.max(x1, q[0], q[2]); y0 = Math.min(y0, q[1], q[3]); y1 = Math.max(y1, q[1], q[3]); });
      return s.length ? [x0, y0, x1, y1] : [0, 0, 0, 0];
    };
    return V;
  }
  var LAM = 40;   /* espessura de lamela ilustrativa (mm) — ficha do fabricante desconhecida */
  function nv(z) { return (z < 0 ? "-" : "+") + I.br(Math.abs(z) / 1000, 3) + "m"; }
  function mmt(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : I.br(v, 1); }
  function esp2(g) { return linhaEspacos(espacos(g)); }

  /* uma célula de detalhe: título + 3 painéis de vista (cada um na sua escala, 1:5 ou 1:10) + painel de nota técnica legível.
     det = { cod, titulo, layout: "G" (grade 2x2) | "T" (vista alta à esquerda), frac, vistas: [{ t, fn(c, r) → V }], notas: [linhas] } */
  function celulaDet(c, x, y, w, h, det) {
    var D = c.D, T = D.E.T, ht = I.tituloVista(D, x + 1, y + 1, det.cod + " - " + det.titulo, null), by = y + ht, bh = h - ht - 2, g = 2, R, wl, wr;
    if (det.layout === "T") {
      wl = Math.round(w * (det.fracW || 0.43)); wr = w - wl;
      var f = det.frac || [0.43, 0.22], h2 = Math.round(bh * f[0]), h3 = Math.round(bh * f[1]);
      R = [{ x: x + 1, y: by, w: wl - 2, h: bh }, { x: x + wl + 1, y: by, w: wr - 2, h: h2 }, { x: x + wl + 1, y: by + h2 + g, w: wr - 2, h: h3 }, { x: x + wl + 1, y: by + h2 + h3 + 2 * g, w: wr - 2, h: bh - h2 - h3 - 2 * g }];
    } else {
      wl = Math.round(w * (det.fracW || 0.5)); wr = w - wl;
      var hA = Math.round(bh * (det.fracA || (det.vistas.length < 3 ? 0.72 : 0.66)));
      var hA2 = hA;
      R = [{ x: x + 1, y: by, w: wl - 2, h: hA }, { x: x + wl + 1, y: by, w: wr - 2, h: hA }, { x: x + 1, y: by + hA + g, w: wl - 2, h: bh - hA - g }, { x: x + wl + 1, y: by + hA + g, w: wr - 2, h: bh - hA - g }];
    }
    if (det.vistas.length < 3 && det.layout !== "T") R[3] = { x: x + 1, y: by + hA + g, w: w - 2, h: bh - hA - g };
    var reg = { cod: det.cod, titulo: det.titulo, cel: { x: x, y: y, w: w, h: h }, vistas: [], notas: R[3] }, escs = [];
    det.vistas.forEach(function (vv, i) {
      var rp = R[i], r = { x: rp.x, y: rp.y + 6, w: rp.w, h: rp.h - 6 }, V = vv.fn(c, r);
      D.texto(rp.x + 0.5, rp.y + 3.4, vv.t + " - ESC 1:" + V.esc, T.nota, { peso: 0.12, attr: ' data-vista="1"' });
      reg.vistas.push({ t: vv.t, esc: V.esc, bbox: V.bbox(), pane: rp }); if (escs.indexOf(V.esc) < 0) escs.push(V.esc);
    });
    var rn = R[3], hN = T.nota, wn = Math.min(rn.w - 1, det.vistas.length < 3 && det.layout !== "T" ? 190 : 1e9);
    if (D.alturaTextos(det.notas, hN, wn) > rn.h) hN = T.minimo;
    var hu = D.textos(rn.x + 0.5, rn.y, det.notas, hN, { wmax: wn });
    if (hu > rn.h + 0.5) c.avisos.push("Folha " + c.rotulo + ": a nota de " + det.cod + " passa do painel (" + Math.round(hu) + " > " + Math.round(rn.h) + " mm).");
    reg.notaH = hu; c.cels.push(reg);
    return escs;
  }
  function etaLinha(g, nome, norma, extra) {
    if (g == null || g.eta == null) return { t: "Sem verificação de resistência no cálculo: ver o quadro 'Pontos a confirmar' (folha E11).", attr: ' data-pend="lig-' + nome + '"' };
    var ok = g.eta <= 1 + 1e-9 && g.ok !== false;
    return { t: (ok ? "VERIFICADA: eta = " : "NÃO ATENDE: eta = ") + I.br(g.eta, 3) + ". " + (norma || "NBR 7190-1:2022 / EN 1995-1-1") + (extra ? " " + extra : ""), cor: ok ? null : VERMELHO, attr: ok ? ' data-lig-ok="' + nome + '"' : ' data-pend="lig-' + nome + '"' };
  }


  /* ---------------------------------------------------------------- LG01 — BASE DE PILAR EM CRUZ (BA-01) */
  function lg01(c) {
    var L = c.res.ligacoes, b = L.base, pl = L.placaBase, lado = ladoPilar(c.res.secoes.P) * 1000, placa = pl.dimensoes_mm[0], tp = pl.espessura_mm,
      chW = chapaLarg(b, c.res.secoes.P), tc = b.chapa ? b.chapa.t_mm : 16, emb = Math.round(b.comprimento * 1000), a = Math.round(aBase(L, c.res.secoes.P) * 1000),
      d = Math.round(b.d * 1000), a1 = Math.round(b.a1 * 1000), a3 = Math.round(b.a3 * 1000), nr = b.nr, br = placa - 100, fe = FOLGA_PE, fenda = 18, chT = emb + fe, zPe = tp + fe, zTopo = tp + chT;
    var pFolga = ponto(c, "folga-pe", "LG01, E01", "Folga entre o pé do pilar e a placa de base (pé elevado e drenado): o cálculo não fixa", fe + " mm; a chapa em cruz sobe " + chT + " mm = " + emb + " embutidos + " + fe + " de folga");
    var pEmb = ponto(c, "embutimento", "LG01, E01", "Embutimento e sistema químico do chumbador M20, argamassa de nivelamento sob a placa e tolerância de locação dos chumbadores: pela fundação (outra empresa)", "", "fundação");
    var pFuro = ponto(c, "furos-aco", "LG01, LG02, LG03, LG10", "Folga dos furos nas chapas (Ø do furo = d + folga do fabricante)", "d + 1 mm nos furos dos pinos (Ø17 para Ø16, Ø13 para Ø12); Ø22 para M20 na placa", "fabricante");
    var sb = pl.solda || {}, penet = sb.tipo === "penetracao-total";
    var pSolda = ponto(c, "solda", "LG01, LG02, LG03", penet ? "Solda chapa-placa da base: o cálculo (NBR 8800 6.2.5) exige PENETRAÇÃO TOTAL (o filete de 12 mm reprovou); WPS, soldador qualificado e ensaio não vêm do cálculo. Garganta dos filetes das demais chapas (AWS A2.4): também não vem do cálculo" : "Garganta da solda de filete (AWS A2.4): não vem do cálculo",
      penet ? "chapa-placa da base em penetração total (eta = " + I.br(sb.eta, 3) + "); filete a = 6 mm contínuo nas demais chapas (mínimo AWS D1.1 para chapa de 12 a 19 mm; verificar)" : "a = 6 mm contínuo (mínimo AWS D1.1 para chapa de 12 a 19 mm; verificar)");
    var pLam = ponto(c, "lamela", "E06", "Espessura de lamela da ficha do fabricante (lamela desenhada com " + LAM + " mm)", LAM + " mm ilustrativa", "fabricante");
    var pEpdm = ponto(c, "epdm", "LG01, LG02", "Espessura do separador EPDM aço-madeira nas fendas e acabamento do tampão", "", "RT/fabricante");
    var zs = []; for (var j = 0; j < nr; j++) zs.push(zPe + a3 + j * a1);
    var grp = gruposPinos(c)[0];
    function v1(cc, r) {
      var hw = Math.max(215, placa / 2 + 20);          /* E4 r4: a extensão acompanha a PLACA (no garfo ela tem 660 mm e passava da moldura da folha com os balões para fora); na cruz (400) segue ±215 */
      var V = vista(cc, r, { x0: -hw, x1: hw, z0: -100, z1: zTopo + 60 }, [13, 22, 3, 14], [5, 10]), zq = zTopo + 40;
      V.conc(-hw, -100, 2 * hw, 100);
      V.fundo(-lado / 2, zPe, lado, zq - zPe); V.mad(-lado / 2, zPe, lado, zq - zPe, { horiz: false }); V.quebra(-lado / 2 - 3, zq, lado + 6);
      V.aco(-chW / 2, tp, chW, chT);
      zs.forEach(function (z) { [-1, 1].forEach(function (sg) { V.pino(sg * a, z, d, true); }); });
      V.aco(-placa / 2, 0, placa, tp);
      [-1, 1].forEach(function (sg) {
        var X = sg * br / 2;
        V.oc(X - 10, -92, 20, 92);
        V.vis(X - 18.5, tp, 37, 3, "MAD-LIG"); V.vis(X - 15, tp + 3, 30, 16, "MAD-LIG");
        V.lin(X - 10, tp + 19, X - 10, tp + 27); V.lin(X + 10, tp + 19, X + 10, tp + 27); V.lin(X - 10, tp + 27, X + 10, tp + 27);
      });
      V.niv(hw - 19, tp, "+0,000m", 1); V.niv(hw - 19, zTopo, nv(zTopo - tp), 1);
      V.cv(zTopo, zPe, -hw, -6, String(emb), { semExt: true });
      V.ch(-placa / 2, placa / 2, -100, -6, String(placa), { semExt: true }); V.ch(-br / 2, br / 2, -100, -12, String(br), { semExt: true });
      V.bal(-placa / 2 + 4, tp / 2, -15, -6, 1); V.bal(-chW / 2, zs[Math.min(5, nr - 1)], -24, 0, 2); V.bal(-a, zs[Math.abs(2 - (nr - 1) / 2) < 0.1 ? nr - 2 : Math.min(2, nr - 1)], -32, 0, 3);          /* balão 3 numa fileira que NÃO é a do meio (a cota do comprimento da chapa fica no meio) */ V.bal(-br / 2 - 14, tp + 9, -18, -42, 4);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -205, x1: 205, z0: -205, z1: 205 }, [16, 16, 12, 12], [5, 10]), q = lado / 2, rb = chW / 2 + 1;
      V.fundo(-placa / 2, -placa / 2, placa, placa); V.acoV(-placa / 2, -placa / 2, placa, placa);
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) {
        var X = sx * br / 2, Z = sz * br / 2;
        V.furo(X, Z, 22, false); D2c(V, X, Z, 37); V.hex(X, Z, 30); V.furo(X, Z, 20, true);
      }); });
      V.fundo(-q, -q, lado, lado); V.mad(-q, -q, lado, lado, { horiz: false });
      V.fundo(-rb, -fenda / 2, 2 * rb, fenda); V.fundo(-fenda / 2, -rb, fenda, 2 * rb); V.vis(-rb, -fenda / 2, 2 * rb, fenda, "MAD-FINA"); V.vis(-fenda / 2, -rb, fenda, 2 * rb, "MAD-FINA");
      V.aco(-chW / 2, -tc / 2, chW, tc); V.aco(-tc / 2, -chW / 2, tc, chW);
      [-1, 1].forEach(function (sg) {
        V.oc(-q, sg * a - d / 2, lado, d);
        V.fundo(sg * a - d / 2, -q, d, lado); V.vis(sg * a - d / 2, -q, d, lado, "MAD-LIG"); V.eixoV(sg * a, -q - 6, q + 6);
        V.lin(sg * a - d / 2, q - 30, sg * a + d / 2, q - 30, "MAD-FINA"); V.lin(sg * a - d / 2, -q + 30, sg * a + d / 2, -q + 30, "MAD-FINA");
      });
      V.ch(-br / 2, br / 2, placa / 2, 5, String(br), { semExt: true }); V.ch(-placa / 2, placa / 2, placa / 2, 11, String(placa), { semExt: true });
      V.cadV([placa / 2, br / 2, -br / 2, -placa / 2], placa / 2, 6, ["50", String(br), "50"], { semExt: true });
      V.ch(-q, q, -placa / 2, -5, String(lado), { semExt: true }); V.ch(-a, a, -placa / 2, -11, String(2 * a), { semExt: true });
      V.bal(-placa / 2, -placa / 2 + 12, -9, 8, 1); V.bal(-chW / 2, 0, -30, 0, 2); V.bal(-a, q - 15, 0, -9, 6);
      V.bal(br / 2, br / 2, 12, -16, 4);
      return V;
    }
    function D2c(V, X, Z, dd) { V.D.circ(V.X(X), V.Y(Z), dd * V.k / 2, "MAD-FINA"); }
    var PG = c.res.secoes.P, duplo = PG.forma === "duplo", VbG = c.res.secoes.V ? c.res.secoes.V.b * 1000 : 0, PbG = PG.b * 1000, PhG = PG.h * 1000;
    function v2g(cc, r) {          /* planta do garfo (corte na fileira de parafusos): 2 peças com a V entre elas, 4 chapas externas de 12 mm, parafusos ajustados atravessando chapa-madeira-chapa */
      var V = vista(cc, r, { x0: -placa / 2 - 6, x1: placa / 2 + 6, z0: -placa / 2 - 6, z1: placa / 2 + 6 }, [16, 16, 12, 12], [5, 10]);
      V.fundo(-placa / 2, -placa / 2, placa, placa); V.acoV(-placa / 2, -placa / 2, placa, placa);
      [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { var X = sx * br / 2, Z = sz * br / 2; V.furo(X, Z, 22, false); D2c(V, X, Z, 37); V.hex(X, Z, 30); V.furo(X, Z, 20, true); }); });
      [-1, 1].forEach(function (sg) {
        var x0 = sg < 0 ? -(VbG / 2 + PbG) : VbG / 2;
        V.fundo(x0, -PhG / 2, PbG, PhG); V.mad(x0, -PhG / 2, PbG, PhG, { horiz: false });
        V.aco(x0 - tc, -chW / 2, tc, chW); V.aco(x0 + PbG, -chW / 2, tc, chW);
        [-1, 1].forEach(function (sy) { V.vis(x0 - tc, sy * a - d / 2, PbG + 2 * tc, d, "MAD-LIG"); });
      });
      V.ch(-VbG / 2, VbG / 2, PhG / 2, 5, String(Math.round(VbG)), { semExt: true }); V.ch(VbG / 2, VbG / 2 + PbG, PhG / 2, 11, String(Math.round(PbG)), { semExt: true });
      V.ch(-placa / 2, placa / 2, placa / 2, 17, String(placa), { semExt: true }); V.ch(-br / 2, br / 2, -placa / 2, -6, String(br), { semExt: true });
      V.bal(-placa / 2, -placa / 2 + 12, -9, 8, 1); V.bal(VbG / 2 + PbG + tc / 2, chW / 2, 6, -9, 2); V.bal(VbG / 2 + PbG / 2, a, 0, -9, 3); V.bal(br / 2, br / 2, 12, -16, 4);
      return V;
    }
    function v3(cc, r) {
      var V = vista(cc, r, { x0: -8, x1: chT + 8, z0: -chW / 2, z1: chW / 2 }, [14, 16, 19, 18], [5, 10]), xs = [fe];
      V.acoV(0, -chW / 2, chT, chW);
      zs.forEach(function (z, i) { var X = z - tp; xs.push(X); [-1, 1].forEach(function (sg) { V.furo(X, sg * a, d + 1, true); }); });
      V.lin(fe, -chW / 2 - 3, fe, chW / 2 + 3, "MAD-OCULTA"); xs.push(chT);
      var vals = []; for (var i = 0; i + 1 < xs.length; i++) vals.push(mmt(xs[i + 1] - xs[i]));
      V.cadH(xs, -chW / 2, -6, vals, { semExt: true });
      V.ch(0, chT, chW / 2, 5, String(chT), { semExt: true }); V.cv(chW / 2, -chW / 2, 0, -6, String(chW), { semExt: true });
      V.cadV([chW / 2, a, -a, -chW / 2], chT, 6, [mmt(chW / 2 - a), String(2 * a), mmt(chW / 2 - a)], { semExt: true });
      V.bal(chT - 40, chW / 2, 8, -12, 2); V.bal(zs[2] - tp, a, 0, 7.6, 3); V.bal(chT * 0.12, chW / 2, 7, -9, 7);
      return V;
    }
    var n = [
      { t: "BA-01 (LG01): base em cruz do pilar PL-01 (" + (c.res.secoes.P.forma === "circular" ? "Ø" + I.cm(lado / 1000) : I.cm(lado / 1000) + "x" + I.cm(lado / 1000)) + " cm, " + c.classe + "), pé elevado e drenado. A madeira não toca o concreto; os níveis são relativos (+0,000 = topo da placa de base, a mesma referência da folha E04: cota 8,70 do modelo; o nível absoluto do concreto vem da fundação)." },
      "1 - CM-01 placa de base " + placa + "x" + placa + "x" + tp + " mm, A36 galv. a fogo, furos Ø22 (" + pFuro + ").",
      "2 - CM-02 chapas em cruz, 2 x t " + tc + " x " + chW + " x " + chT + " mm (" + emb + " embutidos + " + fe + " de folga, " + pFolga + "), em fendas de " + fenda + " mm; " + (penet ? "solda de PENETRAÇÃO TOTAL na placa, com controle (" : "solda de filete contínua na placa (") + pSolda + ").",
      "3 - " + (2 * b.n) + " pinos inox A4-70 Ø" + d + " x " + Math.round(lado) + " (" + b.n + " por chapa: " + b.nc + " colunas x " + nr + " linhas, linhas das duas chapas alternadas meio passo), furo da chapa Ø" + (d + 1) + ", cabeça embutida 30 mm e tampão de madeira.",
      "4 - " + pl.chumbadores.total + " chumbadores M20 A4-70, ancoragem química, braço z = " + br + " mm, com arruela 37x3 e porca; embutimento e sistema químico pela fundação (" + pEmb + ").",
      "5 - separador EPDM aço-madeira nas fendas (" + pEpdm + "); topo e pé do pilar protegidos (PT); drenagem pelo pé elevado de " + fe + " mm.",
      "6 - tampão de madeira da cabeça do pino; fibra do tampão na direção da fibra do pilar.",
      "7 - " + (penet ? "solda de PENETRAÇÃO TOTAL chapa-placa em todo o contorno de encontro (NBR 8800 6.2.5), procedimento e soldador qualificados" : "solda de filete a = " + (6) + " mm em todo o contorno de encontro (AWS A2.4)") + ", galvanização a fogo depois da solda (NBR 6323)." + (pl.notaAcoZ ? " NOTA: " + pl.notaAcoZ : ""),
      "Espaçamentos real | mínimo (mm), pinos por chapa: " + esp2(grp) + ". Mínimo: " + FONTE_MIN + "; conferir o ETA do fabricante.",
      etaLinha(b, "LG01", "Pinos (Johansen):"), etaLinha(b.cruz, "LG01-cruz", "Distância à fenda da outra chapa:"), etaLinha(b.chapa, "LG01-chapa", "Chapa fletida (NBR 8800):"),
      "Chumbadores: tração por lado = " + I.br(pl.chumbadores.Tlado_d, 1) + " kN com 2 chumbadores por lado; Ft,Rd = " + I.br(pl.chumbadores.Ft_Rd, 1) + " kN" + (pl.chumbadores.Fv_Rd ? " e Fv,Rd = " + I.br(pl.chumbadores.Fv_Rd, 1) + " kN" : "") + " cada.",
      etaLinha(pl.chumbadores.verificacao, "LG01-chumbadores", "Chumbadores, tração + cortante (NBR 8800 6.3.3, interação linear):"),
      etaLinha(pl.flexao, "LG01-placa", "Placa fletida pela tração dos chumbadores (t = " + tp + " mm):"),
      etaLinha(sb.eta != null ? sb : null, "LG01-solda", "Solda chapa-placa (" + (penet ? "penetração total" : "filete") + ", NBR 8800 6.2.5):"),
      "Lamela ilustrativa de " + LAM + " mm (" + pLam + ")."
    ];
    if (duplo) {
      n[0] = "BA-01 (LG01): base em GARFO do pilar duplo PL-01 (2 peças de " + I.cm(PbG / 1000) + "x" + I.cm(PhG / 1000) + " cm com a V entre elas, " + c.classe + "), pé elevado e drenado. A madeira não toca o concreto.";
      n[2] = "2 - CM-02 chapas externas do garfo, 4 x t " + tc + " x " + chW + " x " + chT + " mm (" + emb + " embutidos + " + fe + " de folga), 2 por peça (uma de cada lado de cada peça de " + Math.round(PbG) + " mm); solda na placa conforme o item 7.";
      n[3] = "3 - " + (2 * b.n) + " parafusos passantes inox A4 Ø" + d + " AJUSTADOS (furo = Ø" + d + ", sem folga) x " + Math.round(PbG + 2 * tc) + " mm (" + b.n + " por peça: " + b.nc + " colunas x " + nr + " linhas), aparentes, com arruela e porca.";
    }
    return { cod: "LG01", titulo: duplo ? "BASE DE PILAR (GARFO)" : "BASE DE PILAR (CRUZ)", layout: "T", fracW: 0.40, frac: [0.43, 0.22], vistas: [{ t: duplo ? "ELEVAÇÃO (VISTA DA FACE DA CHAPA)" : "CORTE VERTICAL", fn: v1 }, { t: duplo ? "PLANTA (corte na fileira de parafusos)" : "PLANTA (corte na fileira de pinos)", fn: duplo ? v2g : v2 }, { t: "CHAPA CM-02 (peça isolada)", fn: v3 }], notas: n };
  }


  /* ---------------------------------------------------------------- LG02 — APOIO DA V NO TOPO DO PILAR (chapa em T com forquilha) */
  function numDe(txtS, re, d) { var m = re.exec(txt(txtS)); return m ? Number(m[1]) : d; }
  function lg02(c) {
    var L = c.res.ligacoes, t = L.topo, tv = L.topoV, P = c.res.secoes.P, V0 = c.res.secoes.V, lado = (P.b || P.d) * 1000, bV = V0.b * 1000, hV = numDe(L.reforcoV.especificacao, /h = (\d+) mm/, 689),
      he = numDe(L.reforcoV.especificacao, /he = (\d+) mm/, 395), a = Math.round(num(L.base.cruz && L.base.cruz.a, 0.076) * 1000), d = Math.round(t.d * 1000), a1 = Math.round(t.a1 * 1000), a3 = Math.round(t.a3 * 1000),
      comp = Math.round(t.comprimento * 1000), tc = 16, chW = 193, fenda = 18, tm = 16, hAba = 100, wMesa = bV + 2 * tc, hwV = Math.round(he + 20.5), a2V = 100, zB = tm,
      pil = c.d.pilares[0], zPilar = pil ? Math.max(pil.p0[2], pil.p1[2]) : 0, g1 = gruposPinos(c)[1], g2 = gruposPinos(c)[2];
    var pForq = ponto(c, "forquilha", "LG02", "Geometria da chapa em T com forquilha: o cálculo só traz as fileiras de pinos (n, Ø, a1, a3)", "mesa " + wMesa + "x" + lado + "x" + tm + "; abas 2 x " + lado + "x" + hAba + "x" + tc + "; alma no pilar " + chW + "x" + comp + "; alma na V " + comp + "x" + hwV + " (até 20,5 mm acima do pino mais alto)", "oficina/RT");
    var pFuro = ponto(c, "furos-aco", "LG01, LG02, LG03, LG10", "", ""), pSolda = ponto(c, "solda", "LG01, LG02, LG03", "", ""), pEpdm = ponto(c, "epdm", "LG01, LG02", "", ""), pLam = ponto(c, "lamela", "E06", "", "");
    var zsP = []; for (var j = 0; j < t.nr; j++) zsP.push(-(a3 + j * a1));       /* pinos do pilar: abaixo do topo */
    var a1V = Math.round(tv.a1 * 1000), zsV = [zB + he - a2V + 0, zB + he]; var xsV = []; for (var i = 0; i < tv.nr; i++) xsV.push((i - (tv.nr - 1) / 2) * a1V);     /* pinos da V: passo a1 do GRUPO da V (topoV), não o do pilar */
    function nvA(z) { return "+" + I.br(zPilar - 8.7 + z / 1000, 3) + "m"; }
    function v1(cc, r) {                                                                      /* corte perpendicular à V, no plano de um pino */
      var V = vista(cc, r, { x0: -170, x1: 170, z0: -405, z1: zB + hwV + 60 }, [12, 20, 3, 6], [5, 10]), zq = zB + hwV + 40;
      V.vis(-lado / 2, -400, lado, 400, "MAD-PECA"); V.quebra(-lado / 2 - 3, -400, lado + 6);
      V.oc(-tc / 2, -comp, tc, comp);
      zsP.forEach(function (z) { V.oc(-lado / 2, z - d / 2, lado, d); });
      V.fundo(-bV / 2, zB, bV, zq - zB); V.mad(-bV / 2, zB, bV, zq - zB, { horiz: true }); V.quebra(-bV / 2 - 3, zq, bV + 6);
      V.fundo(-fenda / 2, zB, fenda, hwV); V.vis(-fenda / 2, zB, fenda, hwV, "MAD-FINA"); V.aco(-tc / 2, zB, tc, hwV);
      zsV.forEach(function (z) { V.fundo(-bV / 2, z - d / 2, bV, d); V.vis(-bV / 2, z - d / 2, bV, d, "MAD-LIG"); V.eixoH(-bV / 2 - 5, bV / 2 + 5, z); });
      V.aco(-wMesa / 2, 0, wMesa, tm);
      [-1, 1].forEach(function (sg) { V.aco(sg * (bV / 2 + tc / 2) - tc / 2, tm, tc, hAba); });
      V.cadV([zB + hwV, zB + he, zB + he - a2V, zB], -170, -6, [mmt(hwV - he), String(a2V), mmt(he - a2V)], { semExt: true });
      V.cadV([0, zsP[0], zsP[1], zsP[2], -comp], -170, -6, [String(a3), String(a1), String(a1), String(a3)], { semExt: true });
      V.niv(150, 0, nvA(0), 1); V.niv(150, zB + he, nvA(zB + he), 1);
            V.bal(wMesa / 2, tm / 2, 16, 14, 1); V.bal(bV / 2 + tc, tm + hAba / 2, 20, 0, 2); V.bal(bV / 2, zB + hwV - 40, 30, 0, 3); V.bal(-lado / 2, zsP[1], -14, 0, 4);
      return V;
    }
    function v2(cc, r) {                                                                      /* elevação lateral (olhando ao longo de y) */
      var V = vista(cc, r, { x0: -490, x1: 490, z0: -392, z1: zB + hwV + 22 }, [8, 12, 4, 10], [10, 20]), zq = zB + hwV + 12;
      V.vis(-lado / 2, -380, lado, 380, "MAD-PECA"); V.quebra(-lado / 2 - 3, -380, lado + 6);
      V.vis(-485, zB, 970, zq - zB, "MAD-PECA"); V.quebra(-488, zq, 976);
      V.oc(-chW / 2, -comp, chW, comp); V.oc(-comp / 2, zB, comp, hwV);
      zsP.forEach(function (z) { [-1, 1].forEach(function (sg) { V.furo(sg * a, z, d, true); }); });
      zsV.forEach(function (z) { xsV.forEach(function (x) { V.furo(x, z, d, true); }); });
      V.fundo(-lado / 2, tm, lado, hAba); V.acoV(-lado / 2, tm, lado, hAba); V.acoV(-lado / 2, 0, lado, tm);
      (function () { var pts = [-comp / 2].concat(xsV, [comp / 2]), lab = []; for (var i = 1; i < pts.length; i++) lab.push(mmt(pts[i] - pts[i - 1])); V.cadH(pts, zB + hwV, 5, lab, { semExt: true }); })();     /* cotas das posições desenhadas (passo a1 da V) */
      V.cadH([-chW / 2, -a, a, chW / 2], -comp, -5, [mmt(chW / 2 - a), String(2 * a), mmt(chW / 2 - a)], { semExt: true });
      V.bal(lado / 2, tm + hAba / 2, 22, 6, 2); V.bal(-lado / 2, -150, -14, 0, 4);
      return V;
    }
    function v3(cc, r) {                                                                      /* peça de aço deitada: eixo do pilar na horizontal */
      var V = vista(cc, r, { x0: -comp - 8, x1: zB + hwV + 8, z0: -comp / 2 - 6, z1: comp / 2 + 6 }, [6, 14, 4, 12], [10, 20]);
      V.acoV(-comp, -chW / 2, comp, chW); V.acoV(zB, -comp / 2, hwV, comp); V.acoV(0, -wMesa / 2, tm, wMesa);
      zsP.forEach(function (z) { [-1, 1].forEach(function (sg) { V.furo(z, sg * a, d + 1, true); }); });
      zsV.forEach(function (z) { xsV.forEach(function (x) { V.furo(z, x, d + 1, true); }); });
      V.cadH([-comp, zsP[2], zsP[1], zsP[0], 0], -comp / 2, -5, [String(a3), String(a1), String(a1), String(a3)], { semExt: true }); V.cadH([0, zsV[0], zsV[1], zB + hwV], -comp / 2, -11, [mmt(zsV[0]), String(a2V), mmt(hwV - he)], { semExt: true });
      V.cv(comp / 2, -comp / 2, zB + hwV, 5, String(comp), { semExt: true }); if (xsV.length > 1) V.cadV(xsV.slice().sort(function (p, q) { return p - q; }), zB + hwV, -11, xsV.slice(1).map(function () { return String(a1V); }), { semExt: true });     /* passo a1 dos pinos da V, do resultado */ V.cv(chW / 2, -chW / 2, -comp, -5, String(chW), { semExt: true });
      V.bal(-comp / 2, chW / 2, 0, -8, 2);
      return V;
    }
    var n = [
      { t: "PL-01 x VL-01 no apoio (LG02): a V (" + I.cm(bV / 1000) + " cm) apoia na mesa da chapa em T que cobre o topo do pilar (" + (c.res.secoes.P.forma === "circular" ? "Ø" + I.cm(lado / 1000) : I.cm(lado / 1000) + "x" + I.cm(lado / 1000)) + " cm); a forquilha abraça a V e trava a torção. Níveis: topo do pilar " + nvA(0) + ", fundo da V " + nvA(zB) + "." },
      "1 - CM-03 mesa " + wMesa + "x" + lado + "x" + tm + " mm; 2 - abas da forquilha 2 x " + lado + "x" + hAba + "x" + tc + " (" + pForq + ").",
      "3 - alma na V " + comp + "x" + hwV + "x" + tc + ", em fenda de " + fenda + " mm; 4 - alma no pilar " + chW + "x" + comp + "x" + tc + ", em fenda de " + fenda + " mm. Aço A36 galv. a fogo, solda de filete a = 6 mm (" + pSolda + ").",
      "Pinos inox A4-70 Ø" + d + ": " + t.n + " no pilar (x " + Math.round(lado) + ") e " + tv.n + " na V (x " + Math.round(bV) + "), furo da chapa Ø" + (d + 1) + " (" + pFuro + "), cabeça embutida e tampão de madeira; separador EPDM (" + pEpdm + ").",
      "Reforço da tração normal à fibra: 6 SFS WT-T 8,2 x 300 verticais (LG11, folha E06C). Apoio da V: 26 x 28 cm, compressão perpendicular verificada.",
      "Espaçamentos real | mínimo (mm), pino no pilar: " + esp2(g1) + ". Na V: " + esp2(g2) + ". Mínimo: " + FONTE_MIN + ".",
      etaLinha(t, "LG02-pilar", "Pinos no pilar:"), etaLinha(tv, "LG02-V", "Pinos na V:"), etaLinha(L.apoioV, "LG02-apoio", "Apoio da V (compressão perpendicular):"),
      "Lamela ilustrativa de " + LAM + " mm (" + pLam + ")."
    ];
    return { cod: "LG02", titulo: "TOPO: CHAPA EM T COM FORQUILHA", layout: "T", fracW: 0.40, frac: [0.43, 0.24], vistas: [{ t: "CORTE PERPENDICULAR À V", fn: v1 }, { t: "ELEVAÇÃO LATERAL", fn: v2 }, { t: "CHAPA CM-03 (deitada)", fn: v3 }], notas: n };
  }


  /** A1 (revisão R05): geometria dos parafusos Ø16 da verga NA V — SEMPRE do resultado do motor (naV.a1 e naV.a2: Tab. 14 pelo ângulo REAL da força, quase ∥ à fibra da V → a1 = 7d), arredondada PARA CIMA ao mm; nenhum valor fixo.
   *  Colunas ao longo da fibra da V (passo a1), 2 fileiras (passo a2); a aba da chapa cobre as colunas + 40 mm de cada lado (mín. 240 mm). Também alimenta o quadro real | mínimo (gruposPinos). */
  function vergaVGeom(c) {
    var vg = c.res.ligacoes.verga, nV = vg.naV || {}, dB = 16, al = nV.alfa != null ? nV.alfa : 0, m = bordas(dB / 1000, al), nB = vg.parafusosNaV != null ? vg.parafusosNaV : (nV.n || 0), he = 80, k;
    var a1 = Math.ceil((nV.a1 != null ? nV.a1 : m.a1) * 1000 - 1e-6), a2 = Math.ceil((nV.a2 != null ? nV.a2 : m.a2) * 1000 - 1e-6), nCol = Math.max(1, Math.ceil(nB / 2)), cols = [];
    for (k = 0; k < nCol; k++) cols.push((k - (nCol - 1) / 2) * a1);
    return { d: dB, n: nB, alfa: al, a1: a1, a2: a2, nCol: nCol, colsB: cols, wAba: Math.max(240, (nCol - 1) * a1 + 2 * 40), he: he, eta: nV.eta, ok: nV.ok !== false };
  }
  /* ---------------------------------------------------------------- LG03 — VERGA SOBRE A V (chapa em T) */
  function lg03(c) {
    var L = c.res.ligacoes, vg = L.verga, pn = vg.pinos, VG = c.res.secoes.VG, bV = c.res.secoes.V.b * 1000, bG = VG.b * 1000, hG = VG.h * 1000, d12 = Math.round(pn.d * 1000), a1 = Math.round(pn.a1 * 1000), a3 = Math.round(pn.a3 * 1000),
      a2 = Math.round(2 * (VG.h / 2 - 4 * pn.d) * 1000), cmp = Math.round(pn.comprimento * 1000), tc = 8, fenda = 18, hPl = a2 + 2 * 24, nV = vg.naV || {}, cab = 10, yV = 20, gV = vergaVGeom(c), dB = gV.d, nB = gV.n, he = gV.he, a1B = gV.a1, a2B = gV.a2, nCol = gV.nCol, colsB = gV.colsB, wAba = gV.wAba, zc = he + a2B / 2,
      g4 = gruposPinos(c)[3];
    var pVerga = ponto(c, "verga-geom", "LG03", "Geometria da chapa em T da verga e posição dos " + nB + " parafusos Ø16 na V: o cálculo traz a quantidade (" + nB + "), o passo a1/a2 (Tab. 14 pelo ângulo da força) e he = 80 mm", "web " + cmp + "x" + hPl + "x" + tc + "; aba " + wAba + "x" + hPl + "x" + tc + "; " + nCol + " x 2 parafusos, a1 = " + a1B + " (do cálculo: " + I.br((nV.a1 || 0) * 1000, 1) + " mm, 7d com a força a " + I.br((nV.alfa || 0) * 180 / Math.PI, 1) + "° da fibra), a2 = " + a2B + " (primeira fileira a he = " + he + " do fundo da V); folga de " + (yV - tc) + " mm entre aba e topo da verga para a cabeça do parafuso", "oficina/RT");
    var pFuro = ponto(c, "furos-aco", "LG01, LG02, LG03, LG10", "", ""), pSolda = ponto(c, "solda", "LG01, LG02, LG03", "", ""), pWT = ponto(c, "wtt-eta", "LG03, LG06, LG11", "", "");
    var zP = [zc - a2 / 2, zc + a2 / 2];                                      /* pinos Ø12 da fenda (z a partir do fundo da V) */
    var yPin = [yV + a3 + (tc - tc), 0]; yPin = [tc + a3, tc + a3 + a1];      /* pinos ao longo da verga (y a partir da face da V) */
    var yTopo = tc + 330;
    function v1(cc, r) {                                                      /* planta: corte horizontal na fileira inferior de parafusos */
      var V = vista(cc, r, { x0: -290, x1: 290, z0: -bV, z1: yTopo + 4 }, [14, 14, 3, 8], [5, 10]);
      V.fundo(-290, -bV, 580, bV); V.mad(-290, -bV, 580, bV, { horiz: true });
      V.fundo(-bG / 2, yV, bG, yTopo - yV); V.mad(-bG / 2, yV, bG, yTopo - yV, { horiz: false }); V.quebra(-bG / 2 - 3, yTopo, bG + 6);
      V.fundo(-fenda / 2, yV, fenda, tc + cmp + 8 - yV + tc); V.vis(-fenda / 2, yV, fenda, tc + cmp + 8 - yV + tc, "MAD-FINA");
      V.aco(-wAba / 2, 0, wAba, tc); V.aco(-tc / 2, tc, tc, cmp);
      yPin.forEach(function (y) { V.fundo(-bG / 2, y - d12 / 2, bG, d12); V.vis(-bG / 2, y - d12 / 2, bG, d12, "MAD-LIG"); V.eixoH(-bG / 2 - 5, bG / 2 + 5, y); V.lin(-bG / 2 + 20, y - d12 / 2, -bG / 2 + 20, y + d12 / 2, "MAD-FINA"); V.lin(bG / 2 - 20, y - d12 / 2, bG / 2 - 20, y + d12 / 2, "MAD-FINA"); });
      colsB.forEach(function (X) {
        V.fundo(X - dB / 2, -bV - 3, dB, bV + 3 + tc); V.vis(X - dB / 2, -bV - 3, dB, bV + 3 + tc, "MAD-LIG"); V.eixoV(X, -bV - 14, tc + cab + 6);
        V.vis(X - 24, -bV - 3, 48, 3, "MAD-LIG"); V.vis(X - 12, tc, 24, cab, "MAD-LIG");
      });
      if (colsB.length > 1) V.cadH(colsB, -bV, -5, colsB.slice(1).map(function () { return String(a1B); }), { semExt: true }); V.ch(-wAba / 2, wAba / 2, -bV, -11, String(wAba), { semExt: true });
      V.cadV([tc + cmp, yPin[1], yPin[0], tc], 170, 6, [String(a3), String(a1), String(a3)], { semExt: true });
      V.ch(-bG / 2, bG / 2, yTopo - 20, 5, String(bG), { semExt: true });
      V.bal(wAba / 2, tc / 2, 14, 12, 1); V.bal(tc / 2, tc + 60, 24, 0, 2); V.bal(bG / 2, yPin[1], 10, 6, 3); V.bal(colsB[colsB.length - 1], -bV / 2, 10, 0, 4);
      return V;
    }
    function v2(cc, r) {                                                      /* seção transversal da verga na fileira de pinos (olhando para a V) */
      var zTop = zc + hG / 2 + 12, zBot = zc - hG / 2 - 12, V = vista(cc, r, { x0: -190, x1: 190, z0: zBot, z1: zTop }, [14, 18, 3, 6], [5, 10]);
      V.vis(-185, 0, 370, zTop - 2, "MAD-PECA"); V.quebra(-188, zTop - 2, 376);
      V.oc(-wAba / 2, zc - hPl / 2, wAba, hPl);
      V.fundo(-bG / 2, zc - hG / 2, bG, hG); V.mad(-bG / 2, zc - hG / 2, bG, hG, { horiz: true });
      V.fundo(-fenda / 2, zc - hPl / 2, fenda, hPl); V.vis(-fenda / 2, zc - hPl / 2, fenda, hPl, "MAD-FINA"); V.aco(-tc / 2, zc - hPl / 2, tc, hPl);
      zP.forEach(function (z) { V.fundo(-bG / 2, z - d12 / 2, bG, d12); V.vis(-bG / 2, z - d12 / 2, bG, d12, "MAD-LIG"); V.eixoH(-bG / 2 - 5, bG / 2 + 5, z); V.lin(-bG / 2 + 20, z - d12 / 2, -bG / 2 + 20, z + d12 / 2, "MAD-FINA"); V.lin(bG / 2 - 20, z - d12 / 2, bG / 2 - 20, z + d12 / 2, "MAD-FINA"); });
      V.cadV([zc + hG / 2, zP[1], zP[0], zc - hG / 2], -190, -6, [mmt(hG / 2 - a2 / 2), String(a2), mmt(hG / 2 - a2 / 2)], { semExt: true });
      V.ch(-bG / 2, bG / 2, zc + hG / 2, 5, String(bG), { semExt: true });
      V.cv(zc + hG / 2, zc - hG / 2, bG / 2, Math.max(13, (wAba / 2 + 12 - bG / 2) / V.esc), String(hG), { semExt: true });          /* a cota da altura da verga fica FORA do contorno da aba (que cresceu com o a1 do motor) */
      V.bal(-tc / 2, zc + hPl / 2 - 8, -26, -4, 2); V.bal(bG / 2, zP[1], Math.max(22, (wAba / 2 + 12 - bG / 2) / V.esc + 8), -6, 3);          /* balão 3 além da cota da altura da verga */ V.bal(wAba / 2, zc - hPl / 2 + 20, 20, 6, 1);
      return V;
    }
    function v3(cc, r) {                                                      /* peça CM-04: alma e aba planificadas lado a lado */
      var xA = cmp + 40, V = vista(cc, r, { x0: -8, x1: xA + wAba + 8, z0: -hPl / 2, z1: hPl / 2 }, [12, 14, 6, 12], [5, 10]);
      V.acoV(0, -hPl / 2, cmp, hPl); yPin.forEach(function (y) { [-1, 1].forEach(function (sg) { V.furo(y - tc, sg * a2 / 2, d12 + 1, true); }); });
      V.acoV(xA, -hPl / 2, wAba, hPl); colsB.forEach(function (kx, kc) { [-1, 1].forEach(function (sg, kr) { if (2 * kc + kr < nB) V.furo(xA + wAba / 2 + kx, sg * a2B / 2, dB + 1, true); }); });          /* nº ímpar de parafusos (ex.: 5): a última coluna leva só um furo */
      V.cadH([0, a3, a3 + a1, cmp], -hPl / 2, -5, [String(a3), String(a1), String(a3)], { semExt: true });
      V.cadV([hPl / 2, a2 / 2, -a2 / 2, -hPl / 2], 0, -6, [mmt((hPl - a2) / 2), String(a2), mmt((hPl - a2) / 2)], { semExt: true });
      V.cadH([xA].concat(colsB.map(function (kx) { return xA + wAba / 2 + kx; })).concat([xA + wAba]), -hPl / 2, -5, [mmt(wAba / 2 + colsB[0])].concat(colsB.slice(1).map(function () { return String(a1B); })).concat([mmt(wAba / 2 - colsB[colsB.length - 1])]), { semExt: true });
      V.cadV([a2B / 2 + 0, 0], xA + wAba, 6, [mmt(a2B / 2)], { semExt: true }); V.cv(hPl / 2, -hPl / 2, xA + wAba, 12, String(hPl), { semExt: true });
      V.tx(0, hPl / 2 + 5, "ALMA (na fenda da verga)", D2().T.nota * 0.84); V.tx(xA, hPl / 2 + 5, "ABA (na face da V)", D2().T.nota * 0.84);
      return V;
    }
    function D2() { return c.D.E; }
    var n = [
      { t: "VG-01 sobre a VL-01 (LG03): verga " + I.cm(bG / 1000) + "x" + I.cm(hG / 1000) + " cm ligada à face lateral da V por chapa em T inox de " + tc + " mm; o fundo da V é a referência (z = 0)." },
      "1 - CM-04 aba " + wAba + "x" + hPl + "x" + tc + " mm contra a face da V; 2 - alma " + cmp + "x" + hPl + "x" + tc + " na fenda de " + fenda + " mm da verga; aço inox AISI 316 (A4), solda de filete a = 6 mm (" + pSolda + ").",
      "3 - " + pn.n + " pinos inox Ø" + d12 + " x " + Math.round(bG) + " na fenda, furo Ø" + (d12 + 1) + " (" + pFuro + "), cabeça embutida e tampão.",
      "4 - " + nB + " parafusos passantes Ø" + dB + " (" + nCol + " x 2) em corte simples, arruela 48x3 (3d) na face de trás e porca; posição: " + pVerga + ".",
      "Espaçamentos real | mínimo (mm), pinos da fenda: " + esp2(g4) + ". Parafusos Ø16 na V (passos do cálculo, força a " + I.br((nV.alfa || 0) * 180 / Math.PI, 1) + "° da fibra da V; mínimos da Tab. 14 pelo motor de ligações, no ângulo real): " + esp2({ d: dB, alfa: nV.alfa != null ? nV.alfa : 0, a1: a1B, a2: a2B }) + ".",
      "Parafusos Ø16: mínimos a1-a4 completos pelo furo da chapa (" + pWT + ").",
      etaLinha(pn, "LG03-pinos", "Pinos na fenda:"), etaLinha(vg.naV, "LG03-V", "Parafusos na V, corte simples:"),
      "Esforço da ligação F = " + I.br(vg.F_d, 1) + " kN (cálculo)." + (vg.excentricidade ? " Excentricidade da chapa em T: e = " + I.br(vg.excentricidade.e_m * 100, 1) + " cm, M = " + I.br(vg.excentricidade.M_kNm, 2) + " kN.m, somado ao grupo de pinos Ø" + d12 + " (A8)." : ""),
      vg.naV && vg.naV.modoF90 ? "Fendilhamento da V (F90 = " + I.br(vg.naV.F90d, 1) + " kN): modo " + vg.naV.modoF90 + (vg.naV.reforcoF90 ? "; reforço de rosca total na V exigido" : "; não governa") + (vg.parafusosReforcoVerga ? "; " + vg.parafusosReforcoVerga + " parafuso(s) de reforço na verga" : "") + " (N2)." : ""
    ].filter(Boolean);
    return { cod: "LG03", titulo: "VERGA SOBRE A V (CHAPA EM T)", layout: "G", fracA: 0.58, vistas: [{ t: "PLANTA (corte na fileira inferior de parafusos)", fn: v1 }, { t: "CORTE C-C (verga na fileira de pinos)", fn: v2 }, { t: "CHAPA CM-04 (peça isolada)", fn: v3 }], notas: n };
  }


  var FOLGA_PE = 20;   /* folga adotada entre o pé do pilar e a placa de base (mm) — ponto a confirmar */
  function pecaPor(c, re) { return c.d.por(re)[0] || null; }

  /* ---------------------------------------------------------------- LG03 — BLOQUEADOR ENTRE TERÇAS */
  function lg03b(c) {
    var bq = c.res.ligacoes.bloqueador, T = c.res.secoes.T, bT = T.b * 1000, hT = T.h * 1000, pb = pecaPor(c, /^BL/), bB = pb ? Math.round(pb.b * 1000) : 60, hB = pb ? Math.round(pb.h * 1000) : 280,
      Lb = pb ? Math.round(pb.comp * 1000) : 804, np = bq.parafusosPorPonta, zo = (hT - hB) / 2, Ls = 190, dS = 8.2, pt = hB / np, zr = [], i;
    for (i = 0; i < np; i++) zr.push(zo + (i + 0.5) * pt);
    var pBq = ponto(c, "bloq-pos", "LG03", "Posição dos parafusos no bloqueador (a1, a3) e posição do bloqueador na altura da terça: o cálculo traz só o número (3 por ponta)", "bloqueador centrado na altura da terça; parafusos em partes iguais (a1 = " + mmt(pt) + "; a3 = " + mmt(pt / 2) + ")", "RT");
    var pWT = ponto(c, "wtt-eta", "LG03, LG06, LG11", "", "");
    var cut = 130, xB0 = bT, xT2 = bT + 2 * cut + 40, xB1 = xT2;
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -8, x1: xT2 + bT + 8, z0: -2, z1: hT + 2 }, [14, 14, 10, 8], [5, 10, 20]);
      var xa = bT + cut, xb = xT2 - cut;
      V.fundo(0, 0, bT, hT); V.mad(0, 0, bT, hT, { horiz: true }); V.fundo(xT2, 0, bT, hT); V.mad(xT2, 0, bT, hT, { horiz: true });
      V.fundo(xB0, zo, cut, hB); V.mad(xB0, zo, cut, hB, { horiz: true }); V.fundo(xb, zo, cut, hB); V.mad(xb, zo, cut, hB, { horiz: true });
      V.lin(xa, zo, xa, zo + hB, "MAD-FINA"); V.lin(xb, zo, xb, zo + hB, "MAD-FINA"); V.lin(xa + 6, zo - 6, xa + 6, zo + hB + 6, "MAD-FINA"); V.lin(xb - 6, zo - 6, xb - 6, zo + hB + 6, "MAD-FINA");
      zr.forEach(function (z) {
        V.fundo(0, z - dS / 2, Ls, dS); V.vis(0, z - dS / 2, Ls, dS, "MAD-LIG"); V.eixoH(-4, Ls + 4, z);
        V.fundo(xT2 + bT - Ls, z - dS / 2, Ls, dS); V.vis(xT2 + bT - Ls, z - dS / 2, Ls, dS, "MAD-LIG"); V.eixoH(xT2 + bT - Ls - 4, xT2 + bT + 4, z);
      });
      V.cv(hT, 0, 0, -5, String(hT), { semExt: true });
      V.cadV([zo + hB, zr[2] || zr[zr.length - 1], zr[1], zr[0], zo], xT2 + bT, 6, [mmt(pt / 2), mmt(pt), mmt(pt), mmt(pt / 2)], { semExt: true });
      V.ch(xB0, xB1, hT, 5, String(Lb), { semExt: true }); V.ch(0, bT, hT, 5, String(bT), { semExt: true });
      V.bal(bT / 2, 0, 0, 14, 1); V.bal(xa - 40, zo, -4, 36, 2);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -260, x1: 260, z0: -2, z1: hT + 2 }, [14, 14, 4, 8], [5, 10]);
      V.vis(-250, 0, 500, hT, "MAD-PECA"); V.oc(-bB / 2, zo, bB, hB);
      zr.forEach(function (z) { V.furo(0, z, dS, true); });
      V.cv(hT, 0, -250, -5, String(hT), { semExt: true }); V.cadV([zo + hB, zr[2] || zr[zr.length - 1], zr[1], zr[0], zo], 250, 6, [mmt(pt / 2), mmt(pt), mmt(pt), mmt(pt / 2)], { semExt: true });
      V.ch(-bB / 2, bB / 2, 0, -5, String(bB), { semExt: true });
      V.bal(bB / 2, zo + hB, 50, -8, 2); V.bal(0, zr[2] || zr[zr.length - 1], 70, -14, 3);
      return V;
    }
    function v3(cc, r) {
      var V = vista(cc, r, { x0: -bB / 2 - 4, x1: bB / 2 + 4, z0: zo - 4, z1: zo + hB + 4 }, [8, 22, 4, 4], [2, 5, 10]);
      V.fundo(-bB / 2, zo, bB, hB); V.mad(-bB / 2, zo, bB, hB, { horiz: true });
      zr.forEach(function (z) { V.pino(0, z, dS, true); });
      V.cadH([-bB / 2, 0, bB / 2], zo, -4, [mmt(bB / 2), mmt(bB / 2)], { semExt: true });
      return V;
    }
    var n = [
      { t: "BQ-01 entre duas terças TL-01 (" + I.cm(bT / 1000) + "x" + I.cm(hT / 1000) + " cm): bloqueador MLC " + I.cm(bB / 1000) + "x" + I.cm(hB / 1000) + " cm (" + c.classe + "), livre de " + Lb + " mm entre as terças; trava a borda inferior da terça na sucção do vento." },
      "1 - terça TL-01 em corte; 2 - bloqueador BQ-01; 3 - parafuso de rosca total SFS WT-T 8,2 x " + Ls + " (ETA-12/0063), " + np + " por ponta, atravessando a terça (" + bT + " mm) e entrando " + (Ls - bT) + " mm no topo (fibra de topo) do bloqueador.",
      "Posição dos parafusos e do bloqueador: " + pBq + ". Mínimos a1-a4 do parafuso de rosca total pelo ETA: " + pWT + ".",
      etaLinha(bq, "LG03-bloq", "Rosca total, arrancamento:"),
      "Bloqueador N = " + I.br(bq.N_d, 2) + " kN; Rax,d (WT-T 8,2 x 190) = " + I.br(bq.Rax_d, 2) + " kN por parafuso. Total na obra: 132 parafusos (22 bloqueadores x 2 pontas x 3).",
      "A distância do parafuso à lateral do bloqueador é de " + mmt(bB / 2) + " mm (3,7 d); ao topo e à base, " + mmt(pt / 2) + " mm."
    ];
    return { cod: "LG03", titulo: "BLOQUEADOR ENTRE TERÇAS", layout: "G", fracA: 0.56, vistas: [{ t: "CORTE (perpendicular às terças)", fn: v1 }, { t: "ELEVAÇÃO (face externa da terça)", fn: v2 }, { t: "SEÇÃO DO BLOQUEADOR", fn: v3 }], notas: n };
  }

  /* ---------------------------------------------------------------- LG03 — TRAVESSA E PENDURAL */
  function lg03c(c) {
    var T = c.res.secoes.T, bT = T.b * 1000, hT = T.h * 1000, VG = c.res.secoes.VG, tr = pecaPor(c, /^TR/), pd = pecaPor(c, /^PD/), Ltr = tr ? Math.round(tr.comp * 1000) : 804, bTr = tr ? Math.round(tr.b * 1000) : 80, hTr = tr ? Math.round(tr.h * 1000) : 200,
      Lpd = pd ? Math.round(pd.comp * 1000) : 527, bPd = pd ? Math.round(pd.b * 1000) : 60, hPd = pd ? Math.round(pd.h * 1000) : 120, bG = VG.b * 1000, hG = VG.h * 1000, d = 12, bd = bordas(d / 1000, 0), a1 = Math.ceil(bd.a1 * 1000 - 1e-6), a3 = Math.ceil(bd.a3t * 1000 - 1e-6), xm = bT + Ltr / 2;     /* a1 e a3 = mínimos da Tab. 14 pelo motor de ligações (força ∥ fibra: (4+3)d e 7d), nunca valor fixo */
    var pSv = ponto(c, "lig-sem-verif", "LG03c, LG12, LG13, E02", c.res.deck ? "Travessa e pendural verificados desde a R02; deck, apoio do deck e guarda-corpo verificados no T7: ligações conferidas no cálculo" : "Ligações do deck, do apoio do deck e do guarda-corpo sem verificação de resistência neste cálculo (travessa e pendural são verificados desde a R02)", c.res.deck ? "verificadas" : "desenhadas com o que o orçamento traz; verificar antes de executar", "RT");
    var pPos = ponto(c, "pend-pos", "LG03c", "Estribo inox da travessa e posição dos 2 parafusos Ø12 por ponta do pendural (o cálculo traz só o número)", "travessa com a face inferior alinhada à da terça; parafusos a1 = " + a1 + ", a3 = " + a3 + " (mínimos de Ø12 pelo motor de ligações, Tab. 14: a1 = " + I.br(bd.a1 * 1000, 0) + " e a3,t = " + I.br(bd.a3t * 1000, 0) + ")", "RT");
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -8, x1: bT * 2 + Ltr + 8, z0: -Lpd - bG - 4, z1: hT + 6 }, [14, 14, 6, 8], [10, 20]);
      V.fundo(0, 0, bT, hT); V.mad(0, 0, bT, hT, { horiz: true }); V.fundo(bT + Ltr, 0, bT, hT); V.mad(bT + Ltr, 0, bT, hT, { horiz: true });
      V.vis(bT, 0, Ltr, hTr, "MAD-PECA"); V.vis(xm - bPd / 2, -Lpd, bPd, Lpd, "MAD-PECA");
      V.fundo(xm - hG / 2, -Lpd - bG, hG, bG); V.mad(xm - hG / 2, -Lpd - bG, hG, bG, { horiz: true });
      V.furo(xm, -a3, d, true); V.furo(xm, -a3 - a1, d, true); V.furo(xm, -Lpd + a3, d, true); V.furo(xm, -Lpd + a3 + a1, d, true);
      V.ch(bT, bT + Ltr, hTr, 5, String(Ltr), { semExt: true }); 
      V.cadV([0, -a3, -a3 - a1], xm - bPd / 2, -8, [String(a3), String(a1)], { semExt: true });
      V.ch(xm - hG / 2, xm + hG / 2, -Lpd - bG, -5, String(hG), { semExt: true });
      V.bal(bT + 150, hTr, 0, -12, 1); V.bal(xm + bPd / 2, -Lpd / 2, 40, 0, 2); V.bal(xm - hG / 2, -Lpd - bG / 2, -20, 0, 3);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -300, x1: 300, z0: -Lpd - bG - 4, z1: hTr + 6 }, [14, 14, 6, 8], [10, 20]);
      V.fundo(-bTr / 2, 0, bTr, hTr); V.mad(-bTr / 2, 0, bTr, hTr, { horiz: true });
      V.fundo(-hPd / 2, -Lpd, hPd, Lpd); V.mad(-hPd / 2, -Lpd, hPd, Lpd, { horiz: false });
      V.vis(-290, -Lpd - bG, 580, bG, "MAD-PECA"); V.lin(-290, -Lpd - bG / 2, 290, -Lpd - bG / 2, "MAD-FINA");
      [-a3, -a3 - a1, -Lpd + a3, -Lpd + a3 + a1].forEach(function (z) { V.fundo(-hPd / 2, z - d / 2, hPd, d); V.vis(-hPd / 2, z - d / 2, hPd, d, "MAD-LIG"); V.eixoH(-hPd / 2 - 5, hPd / 2 + 5, z); });
      V.ch(-bTr / 2, bTr / 2, hTr, 5, String(bTr), { semExt: true }); V.ch(-hPd / 2, hPd / 2, -Lpd - bG, -5, String(hPd), { semExt: true });
      V.bal(bTr / 2, hTr / 2, 40, 0, 1); V.bal(hPd / 2, -Lpd / 2, 40, 0, 2);
      return V;
    }
    var n = [
      { t: "TR-01 e PD-01 (LG03): travessa entre duas terças e pendural ao meio da verga VG-01 (N = " + I.br(c.res.ligacoes.verga.pendural_N_d, 2) + " kN) reduzem o vão da verga." },
      "1 - travessa TR-01 MLC " + I.cm(bTr / 1000) + "x" + I.cm(hTr / 1000) + " cm, " + Ltr + " mm livre entre terças, estribo inox em cada terça; 2 - pendural PD-01 MLC " + I.cm(bPd / 1000) + "x" + I.cm(hPd / 1000) + " cm, " + Lpd + " mm, com 2 parafusos Ø12 inox por ponta; 3 - verga VG-01 " + I.cm(bG / 1000) + "x" + I.cm(hG / 1000) + " cm deitada.",
      "Posição do estribo e dos parafusos: " + pPos + ". Sem verificação de resistência própria no cálculo: " + pSv + ".",
      "Parafusos Ø12 inox A4, aço-madeira ou madeira-madeira conforme a ficha do estribo; cabeça embutida e tampão."
    ];
    return { cod: "LG03", titulo: "TRAVESSA E PENDURAL", layout: "G", vistas: [{ t: "ELEVAÇÃO (plano da travessa)", fn: v1 }, { t: "CORTE (perpendicular à travessa)", fn: v2 }], notas: n };
  }

  /* ---------------------------------------------------------------- LG06 — TERÇA SOBRE A V */
  function lg06(c) {
    var L = c.res.ligacoes, tv = L.tercaV, T = c.res.secoes.T, bT = T.b * 1000, hT = T.h * 1000, bV = c.res.secoes.V.b * 1000, dS = 8.2, Ls = 300, ang = Math.PI / 4, zh = 100, a1 = Math.max(80, Math.ceil(bordas(8.2 / 1000, 0).a1 * 1000 - 1e-6)), nP = Math.round(tv.porApoio / 2);
    var pWT = ponto(c, "wtt-eta", "LG03, LG06, LG11", "", ""), pPos = ponto(c, "tercav-pos", "LG06", "Posição dos 6 parafusos cruzados por apoio e altura do furo de entrada: o cálculo traz o número, o ângulo (45 gr) e lef = " + tv.lef_mm + " mm", "3 pares ao longo da terça (a1 = " + a1 + "), entrada a " + zh + " mm do fundo da terça", "RT");
    var xs = []; for (var i = 0; i < nP; i++) xs.push((i - (nP - 1) / 2) * a1);
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -280, x1: 280, z0: -240, z1: hT + 6 }, [12, 14, 4, 8], [5, 10]), x0 = -bT / 2, dd = Ls * Math.cos(ang);
      V.fundo(-275, -235, 550, 235); V.mad(-275, -235, 550, 235, { horiz: true });
      V.fundo(x0, 0, bT, hT); V.mad(x0, 0, bT, hT, { horiz: true });
      [-1, 1].forEach(function (sg) {
        var xa = sg * bT / 2, za = zh, xb = xa - sg * dd, zb = za - dd;
        V.lin(xa, za, xb, zb, "MAD-LIG"); V.lin(xa + sg * 0, za + dS / 2 * 1.4, xa - sg * 0, za - dS / 2 * 1.4, "MAD-LIG");
        V.lin(xa - sg * 5, za + 10, xa + sg * 8, za - 3, "MAD-FINA");
      });
      V.ch(-bT / 2, bT / 2, hT, 5, String(bT), { semExt: true }); V.cv(hT, 0, bT / 2 + 30, 6, String(hT), { semExt: true });
      V.cv(zh, 0, -bT / 2 - 10, -6, String(zh), { semExt: true });
      V.bal(bT / 2, zh, 34, -14, 1); V.bal(-bT / 2, zh, -34, -14, 2); V.bal(275, -120, 24, 0, 3);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -300, x1: 300, z0: -240, z1: hT + 6 }, [14, 14, 4, 8], [5, 10]);
      V.fundo(-bV / 2, -235, bV, 235); V.mad(-bV / 2, -235, bV, 235, { horiz: true });
      V.vis(-295, 0, 590, hT, "MAD-PECA");
      xs.forEach(function (x) { V.lin(x, zh, x, zh - Ls * Math.sin(ang), "MAD-OCULTA"); V.furo(x, zh, dS, true); });
      V.ch(-bV / 2, bV / 2, -235, -6, String(bV), { semExt: true }); V.cadH([xs[0]].concat(xs.slice(1)), zh + 30, 5, xs.slice(1).map(function () { return String(a1); }), { semExt: true });
      V.bal(xs[xs.length - 1], zh - 120, 34, 4, 1); V.bal(bV / 2, -150, 34, 0, 3);
      return V;
    }
    var n = [
      { t: "TL-01 sobre a VL-01 (LG06): terça " + I.cm(bT / 1000) + "x" + I.cm(hT / 1000) + " cm apoiada na V (" + I.cm(bV / 1000) + " cm) e presa por " + tv.porApoio + " parafusos de rosca total em pares cruzados a 45 gr." },
      "1 - " + tv.parafuso + ", " + tv.porApoio + " por apoio (" + nP + " pares, um de cada lado da terça), lef = " + tv.lef_mm + " mm de cada lado da interface; 2 - parafuso inclinado a 45 gr que entra pela face lateral da terça e cruza a interface; 3 - viga V.",
      "Posição: " + pPos + ". Mínimos a1-a4 do WT-T 8,2 pelo ETA: " + pWT + ".",
      etaLinha(tv, "LG06", "Arrancamento + corte lateral combinados:"),
      "Esforços por apoio: tração T = " + I.br(c.res.ligacoes.esforcos.tercaV.Tmax, 2) + " kN, compressão = " + I.br(c.res.ligacoes.esforcos.tercaV.Cmax, 2) + " kN, horizontal H = " + I.br(c.res.ligacoes.esforcos.tercaV.Hmax, 2) + " kN; Rax,d = " + I.br(tv.Rax_d, 2) + " kN por parafuso. Total na obra: 144 parafusos."
    ];
    return { cod: "LG06", titulo: "TERÇA SOBRE A V (WT-T CRUZADOS)", layout: "G", vistas: [{ t: "CORTE (perpendicular à terça)", fn: v1 }, { t: "ELEVAÇÃO (ao longo da terça)", fn: v2 }], notas: n };
  }

  /* ---------------------------------------------------------------- LG10 — ESCORA (mão-francesa) */
  function lg10a(c) {
    var L = c.res.ligacoes, es = L.escora, pe = pecaPor(c, /^ES\d/), bE = pe ? Math.round(pe.b * 1000) : 80, hE = pe ? Math.round(pe.h * 1000) : 140, Le = pe ? Math.round(pe.comp * 1000) : 744, tp = 4, dB = 16, mEsc = bordas(dB / 1000, 0), a3 = Math.ceil(mEsc.a3t * 1000 - 1e-6), a1 = Math.ceil(mEsc.a1 * 1000 - 1e-6), hPl = 100, xL = 136, lPl = xL + a3 + a1 + 32,
      np = es.parafusosPorPonta, lb = 120;
    var pFuro = ponto(c, "furos-aco", "LG01, LG02, LG03, LG10", "", ""), pEsc = ponto(c, "escora-chapa", "LG10", "Chapa de ligação da escora: altura, trecho livre para fixar no pilar/V e comprimento do parafuso Ø16 (o cálculo traz 2 chapas de 4 mm e 2 parafusos Ø16 por ponta)", "chapa " + lPl + "x" + hPl + "x" + tp + " (trecho livre de " + xL + " mm); parafuso M16 x " + lb, "RT");
    var pSv = ponto(c, "lig-sem-verif", "", "", "");
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -xL - 20, x1: 420, z0: -hE / 2 - 4, z1: hE / 2 + 4 }, [12, 14, 8, 14], [5, 10]);
      V.vis(0, -hE / 2, 400, hE, "MAD-PECA"); V.lin(404, -hE / 2 - 6, 392, hE / 2 + 6, "MAD-FINA"); V.lin(412, -hE / 2 - 6, 400, hE / 2 + 6, "MAD-FINA");
      V.fundo(-xL, -hPl / 2, lPl, hPl); V.acoV(-xL, -hPl / 2, lPl, hPl);
      for (var i = 0; i < np; i++) V.furo(a3 + i * a1, 0, dB, true);
      V.cadH([-xL, 0, a3, a3 + a1, a3 + a1 + 32], hE / 2, 5, [String(xL), String(a3), String(a1), "32"], { semExt: true });
      V.cv(hE / 2, -hE / 2, 416, 6, String(hE), { semExt: true }); V.cv(hPl / 2, -hPl / 2, -xL, -6, String(hPl), { semExt: true });
      V.cadV([hE / 2, 0, -hE / 2], a3 + a1, -10, [mmt(hE / 2), mmt(hE / 2)], { semExt: true });
      V.bal(-xL / 2, -hPl / 2, 0, 18, 1); V.bal(300, hE / 2, 0, -14, 2); V.bal(a3 + a1 / 2, -hE / 2, 0, 18, 3);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -60, x1: 60, z0: -hE / 2 - 6, z1: hE / 2 + 6 }, [14, 14, 6, 12], [2, 5]);
      V.fundo(-bE / 2, -hE / 2, bE, hE); V.mad(-bE / 2, -hE / 2, bE, hE, { horiz: true });
      [-1, 1].forEach(function (sg) { V.aco(sg * (bE / 2 + tp / 2) - tp / 2, -hPl / 2, tp, hPl); });
      V.fundo(-bE / 2 - tp - 15, -dB / 2, bE + 2 * tp + 28, dB); V.vis(-bE / 2 - tp - 3, -dB / 2, bE + 2 * tp + 6, dB, "MAD-LIG");
      V.vis(-bE / 2 - tp - 13, -dB / 2 - 4, 10, dB + 8, "MAD-LIG"); V.vis(bE / 2 + tp + 3, -dB / 2 - 4, 14, dB + 8, "MAD-LIG"); V.eixoH(-bE / 2 - tp - 20, bE / 2 + tp + 20, 0);
      V.ch(-bE / 2, bE / 2, hE / 2, 5, String(bE), { semExt: true }); V.cv(hE / 2, -hE / 2, bE / 2 + tp + 18, 6, String(hE), { semExt: true });
      V.bal(bE / 2 + tp, hPl / 2, 30, -10, 1); V.bal(-bE / 2, -hE / 2 + 20, -30, 8, 2);
      return V;
    }
    function v3(cc, r) {
      var V = vista(cc, r, { x0: -8, x1: lPl + 8, z0: -hPl / 2, z1: hPl / 2 }, [8, 14, 6, 12], [2, 5]);
      V.acoV(0, -hPl / 2, lPl, hPl); V.lin(xL, -hPl / 2 - 3, xL, hPl / 2 + 3, "MAD-OCULTA");
      for (var i = 0; i < np; i++) V.furo(xL + a3 + i * a1, 0, dB + 1, true);
      V.cadH([0, xL, xL + a3, xL + a3 + a1, lPl], -hPl / 2, -5, [String(xL), String(a3), String(a1), "32"], { semExt: true });
      V.cv(hPl / 2, -hPl / 2, lPl, 6, String(hPl), { semExt: true });
      return V;
    }
    var n = [
      { t: "ES-01 (LG10): escora MLC " + I.cm(bE / 1000) + "x" + I.cm(hE / 1000) + " cm, " + Le + " mm, com ligação aço-madeira-aço nas duas pontas (16 escoras, 32 ligações)." },
      "1 - CM-05 chapas laterais inox AISI 316 de " + tp + " mm, uma de cada lado (" + lPl + "x" + hPl + "x" + tp + "); 2 - escora ES-01; 3 - " + np + " parafusos passantes Ø" + dB + " inox A4-70 por ponta, furo da chapa Ø" + (dB + 1) + " (" + pFuro + "), arruela e porca.",
      "Chapa, trecho livre e comprimento do parafuso: " + pEsc + ".",
      "Espaçamentos real | mínimo (mm): a1 = " + a1 + " | " + I.br(mEsc.a1 * 1000, 0) + " (Tab. 14, motor de ligações: força ∥ à fibra), a3 = " + a3 + " | " + I.br(mEsc.a3t * 1000, 0) + ", a4 = " + (hE / 2) + " | " + I.br(mEsc.a4c * 1000, 0) + " (3d). Mínimo: " + FONTE_MIN + ".",
      etaLinha(es, "LG10-escora", "Aço-madeira-aço, Ø16:"),
      "Escora N = " + I.br(es.N_d, 2) + " kN; Rd por parafuso = " + I.br(es.Rd_parafuso, 2) + " kN."
    ];
    return { cod: "LG10", titulo: "ESCORA (MÃO-FRANCESA)", layout: "G", vistas: [{ t: "ELEVAÇÃO (face da chapa)", fn: v1 }, { t: "CORTE NO PARAFUSO", fn: v2 }, { t: "CHAPA CM-05 (peça isolada)", fn: v3 }], notas: n };
  }

  /* ---------------------------------------------------------------- LG10 — FITA METÁLICA EM X */
  function lg10b(c) {
    var ff = c.res.ligacoes.fita, T = c.res.secoes.T, bT = T.b * 1000, hT = T.h * 1000, fx = pecaPor(c, /^FX\d/), Lf = fx ? Math.round(fx.comp * 1000) : 2775, bF = 60, tF = 2, np = ff.parafusosPorPonta, dP = 5, Lp = 50, pit = 25, cl = 12.5, dx = 0;
    var th = fx ? Math.atan2(Math.abs(fx.p1[0] - fx.p0[0]), Math.abs(fx.p1[1] - fx.p0[1])) : Math.PI / 4;
    var pFita = ponto(c, "fita-pos", "LG10", "Furação da fita (posição e Ø dos " + np + " furos por ponta), cabeça do parafuso 5x50 e tensor", "furos Ø5,5 em 2 colunas alternadas (a2 = " + (2 * cl) + " mm, passo de " + pit + " mm por coluna alternada = a1 de " + (2 * pit) + " mm); tensor a definir", "fabricante/RT"), pRk = "Rk = " + I.br(ff.Rk_parafuso, 2) + " kN, " + (ff.fonteRk || "adotado pelo RT (24/10/2026)");
    function pos(i) { return { u: 20 + i * pit, v: (i % 2 ? 1 : -1) * cl }; }
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -170, x1: 170, z0: -250, z1: 250 }, [14, 22, 8, 8], [5, 10]), co = Math.cos(th), si = Math.sin(th);
      function P(u, v) { return [u * si - v * co, u * co + v * si]; }   /* fita: u ao longo, v através (x, y em planta) */
      V.fundo(-bT / 2, -250, bT, 500); V.vis(-bT / 2, -250, bT, 500, "MAD-PECA");
      var c0 = P(-60, -bF / 2), c1 = P(300, -bF / 2), c2 = P(300, bF / 2), c3 = P(-60, bF / 2);
      var poly = [c0, c1, c2, c3].map(function (q) { return [V.X(q[0] - 60 * si), V.Y(q[1] - 60 * co)]; });
      c.D.fundo(poly, "#fff"); c.D.poli(poly, "MAD-ACO", true);
      for (var i = 0; i < np; i++) { var p = pos(i), q = P(p.u, p.v); V.furo(q[0] - 60 * si, q[1] - 60 * co, dP + 0.5, false); }
      V.ch(-bT / 2, bT / 2, 250, 5, String(bT), { semExt: true });
      V.bal(-bT / 2, 150, -14, 0, 1);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -20, x1: 300, z0: hT / 2 - 150, z1: hT / 2 + 12 }, [12, 12, 8, 8], [2, 5, 10]);
      V.fundo(0, hT / 2 - 140, 300, 140); V.vis(0, hT / 2 - 140, 300, 140, "MAD-PECA"); V.quebra(0, hT / 2 - 140, 300);
      V.fundo(0, hT / 2, 300, tF * 3); V.acoV(0, hT / 2, 300, tF * 3);
      for (var i = 0; i < np; i++) { var p = pos(i); V.lin(p.u, hT / 2 + tF * 3, p.u, hT / 2 - Lp + tF * 3, "MAD-OCULTA"); }
      V.cadH([20, 20 + pit, 20 + 2 * pit], hT / 2 - 140, -8, [String(pit), String(pit)], { semExt: true });
      V.bal(150, hT / 2 + 4, 0, -12, 1);
      return V;
    }
    function v3(cc, r) {
      var V = vista(cc, r, { x0: -8, x1: 300, z0: -bF / 2, z1: bF / 2 }, [8, 16, 8, 12], [2, 5]);
      V.acoV(0, -bF / 2, 300, bF); V.quebra(296, 0, 4);
      for (var i = 0; i < np; i++) { var p = pos(i); V.furo(p.u, p.v, dP + 0.5, true); }
      V.cadH([0, 20, 20 + 2 * pit, 20 + 4 * pit], -bF / 2, -5, ["20", String(2 * pit), String(2 * pit)], { semExt: true });
      V.cadV([bF / 2, cl, -cl, -bF / 2], 300, 6, [mmt(bF / 2 - cl), String(2 * cl), mmt(bF / 2 - cl)], { semExt: true });
      return V;
    }
    var n = [
      { t: "TI-01 (LG10): fita metálica perfurada " + bF + " x " + tF + " mm em X sobre as terças (sob o lambri), comprimento do trecho " + Lf + " mm (folha E07), tensor em uma das pontas." },
      "1 - fita galvanizada a fogo (NBR 6323) ou inox; 2 - terça TL-01; " + np + " parafusos 5 x 50 por ponta, em duas colunas alternadas, cabeça sem saliência sobre a fita.",
      "Furação, cabeça do parafuso e tensor: " + pFita + ". Rk do parafuso: " + pRk + ".",
      etaLinha(ff, "LG10-fita", "Fita 60x2,0 (área líquida 75 %):"),
      "Esforço da fita N = " + I.br(ff.N_d, 2) + " kN."
    ];
    return { cod: "LG10", titulo: "FITA METÁLICA EM X", layout: "G", vistas: [{ t: "PLANTA (ponta da fita sobre a terça)", fn: v1 }, { t: "CORTE LONGITUDINAL NA TERÇA", fn: v2 }, { t: "FITA (peça isolada)", fn: v3 }], notas: n };
  }

  /* ---------------------------------------------------------------- LG11 — REFORÇO TRANSVERSAL NA V */
  function lg11(c) {
    var L = c.res.ligacoes, rv = L.reforcoV, bV = c.res.secoes.V.b * 1000, hV = numDe(rv.especificacao, /h = (\d+) mm/, 689), he = numDe(rv.especificacao, /he = (\d+) mm/, 395), Ls = 300, dS = 8.2, a1 = Math.max(70, Math.ceil(bordas(8.2 / 1000, 0).a1 * 1000 - 1e-6)), yo = 60, n2 = Math.ceil(rv.parafusos / 2), tc = 16, fenda = 18, hwV = Math.round(he + 20.5), a2V = 100, lado = (c.res.secoes.P.b || c.res.secoes.P.d) * 1000, tm = 16;
    var pPos = ponto(c, "reforco-pos", "LG11", "Posição em planta dos 6 parafusos verticais (afastamento do plano da chapa e passo): o cálculo traz o número e he/h", "3 de cada lado do eixo do pilar, passo a1 = " + a1 + " mm, a " + yo + " mm do plano da chapa (alternando os lados); lef = " + Ls + " mm a partir da face superior", "RT");
    var pWT = ponto(c, "wtt-eta", "LG03, LG06, LG11", "", "");
    var xs = []; for (var s = 0; s < 2; s++) for (var j = 0; j < n2; j++) xs.push((s ? 1 : -1) * (yo + j * a1));
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -300, x1: 300, z0: -140, z1: hV + 8 }, [16, 18, 6, 8], [5, 10, 20]);
      V.vis(-lado / 2, -130, lado, 130, "MAD-PECA"); V.quebra(-lado / 2 - 3, -130, lado + 6); V.acoV(-lado / 2 - 6, -tm, lado + 12, tm);
      V.fundo(-298, 0, 596, hV); V.mad(-298, 0, 596, hV, { horiz: true });
      V.fundo(-192, 0, 384, hwV); V.aco(-192, 0, 384, hwV);
      [0, 1].forEach(function (k) { [-80, 0, 80].forEach(function (x) { V.pino(x, he - k * a2V, 16, true); }); });
      xs.forEach(function (x) { V.oc(x - dS / 2, hV - Ls, dS, Ls); });
      V.cadV([hV, he, 0], 298, 10, [String(hV - he), String(he)], { semExt: true }); V.cv(hV, hV - Ls, -298, -6, String(Ls), { semExt: true });
      V.cadH([-yo - 2 * a1, -yo - a1, -yo, yo, yo + a1, yo + 2 * a1], hV, 5, [String(a1), String(a1), String(2 * yo), String(a1), String(a1)], { semExt: true });
      V.bal(-250, hV, 0, -12, 1); V.bal(192, he, 34, 0, 2);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -150, x1: 150, z0: -tm - 4, z1: hV + 8 }, [14, 16, 6, 8], [5, 10, 20]);
      V.fundo(-bV / 2, 0, bV, hV); V.mad(-bV / 2, 0, bV, hV, { horiz: true }); V.acoV(-bV / 2 - 6, -tm, bV + 12, tm);
      V.fundo(-fenda / 2, 0, fenda, hwV); V.vis(-fenda / 2, 0, fenda, hwV, "MAD-FINA"); V.aco(-tc / 2, 0, tc, hwV);
      [0, 1].forEach(function (k) { var z = he - k * a2V; V.fundo(-bV / 2, z - 8, bV, 16); V.vis(-bV / 2, z - 8, bV, 16, "MAD-LIG"); V.eixoH(-bV / 2 - 5, bV / 2 + 5, z); });
      [-1, 1].forEach(function (sg) { var x = sg * yo; V.fundo(x - dS / 2, hV - Ls, dS, Ls); V.vis(x - dS / 2, hV - Ls, dS, Ls, "MAD-LIG"); V.eixoV(x, hV + 4, hV - Ls - 4); });
      V.cadH([-bV / 2, -yo, -fenda / 2, fenda / 2, yo, bV / 2], hV, 5, [String(bV / 2 - yo), String(yo - fenda / 2), mmt(fenda), String(yo - fenda / 2), String(bV / 2 - yo)], { semExt: true });
      V.cv(hV, 0, bV / 2, 8, String(hV), { semExt: true }); V.bal(-yo, hV - 220, -24, 0, 1);
      return V;
    }
    var n = [
      { t: "VL-01 sobre PL-01 (LG11): reforço de rosca total contra a tração perpendicular às fibras da V (h = " + hV + " mm; pino mais alto a he = " + he + " mm do fundo, he/h = " + I.br(rv.he_h, 3) + "); a tração perpendicular vem do momento da ligação do topo (LG02)." },
      "1 - " + rv.parafusos + " parafusos SFS WT-T 8,2 x " + Ls + " (ETA-12/0063) verticais, a partir da face superior da V, " + n2 + " de cada lado do eixo do pilar, cruzando a linha dos pinos; 2 - chapa em T da ligação (CM-03).",
      "Posição: " + pPos + ". Mínimos a1-a4 pelo ETA: " + pWT + ".",
      etaLinha(rv, "LG11", "Tração perpendicular às fibras (EN 1995-1-1):"),
      "Ft,90 = " + I.br(rv.Ft90_d, 1) + " kN; Rax,d = " + I.br(rv.Rax_d, 2) + " kN por parafuso; mínimo adotado de " + rv.parafusos + " parafusos. Total na obra: 24 parafusos."
    ];
    return { cod: "LG11", titulo: "REFORÇO TRANSVERSAL NA V", layout: "G", vistas: [{ t: "CORTE LONGITUDINAL NA V", fn: v1 }, { t: "CORTE TRANSVERSAL NO PARAFUSO", fn: v2 }], notas: n };
  }

  /* ---------------------------------------------------------------- LG12 — APOIO DA VIGA DO DECK (acrescentado ao Padrão na v2.11) */
  function lg12(c) {
    var vd = pecaPor(c, /^DS-V/), bV = vd ? Math.round(vd.b * 1000) : 120, hV = vd ? Math.round(vd.h * 1000) : 240, tU = 6, folga = 6, hF = 120, tn = 5, lP = 160, dCh = 12, yc = bV / 2 + folga + tU + 33, wP = 2 * yc + 2 * 33, zV = tU + tn, hMur = 110;
    /* E4 r12: a quantidade de apoios vem das peças DS-APOIO do resultado (a folha dizia "33 apoios" fixo, contra 4 un na tabela de ferragens) */
    var nAp = 0; ((c.d && c.d.fonteTodos) || []).forEach(function (p) { if (p.id === "DS-APOIO") nAp += p.qtd == null ? 1 : p.qtd; });
    var txAp = nAp > 0 ? nAp + (nAp === 1 ? " apoio" : " apoios") : "quantidade na tabela de ferragens (E11)";
    var pSv = ponto(c, "lig-sem-verif", "", "", ""), pU = ponto(c, "apoio-deck", "LG12", "Geometria do apoio do deck: o orçamento traz só 'chapa inox em U 6 mm + 2 chumbadores M12 + calço de neoprene' (" + txAp + ")", "folga de " + folga + " mm por lado, abas de " + hF + " mm, base " + wP + "x" + lP + "x" + tU + ", calço de neoprene de " + tn + " mm, furos Ø14", "RT");
    var pEmb = ponto(c, "embutimento", "", "", "");
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -wP / 2 - 30, x1: wP / 2 + 30, z0: -hMur, z1: zV + hV + 6 }, [14, 18, 8, 8], [5, 10]);
      V.conc(-wP / 2 - 30, -hMur, wP + 60, hMur);
      V.fundo(-bV / 2, zV, bV, hV); V.mad(-bV / 2, zV, bV, hV, { horiz: true });
      V.aco(-wP / 2, 0, wP, tU); V.fundo(-bV / 2, tU, bV, tn); V.aco(-bV / 2, tU, bV, tn);
      [-1, 1].forEach(function (sg) { V.aco(sg * (bV / 2 + folga + tU / 2) - tU / 2, tU, tU, hF); V.oc(sg * yc - dCh / 2, -hMur + 8, dCh, hMur - 8); V.lin(sg * yc - dCh / 2, tU, sg * yc - dCh / 2, tU + 16, "MAD-LIG"); V.lin(sg * yc + dCh / 2, tU, sg * yc + dCh / 2, tU + 16, "MAD-LIG"); V.lin(sg * yc - dCh / 2, tU + 16, sg * yc + dCh / 2, tU + 16, "MAD-LIG"); });
      V.ch(-wP / 2, wP / 2, -hMur, -6, String(wP), { semExt: true }); V.ch(-yc, yc, -hMur, -12, String(2 * yc), { semExt: true });
      V.cadV([zV + hV, zV, tU, 0], wP / 2 + 30, 6, [String(hV), String(tn), String(tU)], { semExt: true });
      V.bal(-wP / 2, tU / 2, -16, 8, 1); V.bal(-bV / 2 - folga - tU, tU + hF / 2, -20, -6, 2); V.bal(bV / 2 + tn, tU + tn / 2, 28, 14, 3); V.bal(yc, tU + 12, 14, -26, 4);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -300, x1: 300, z0: -hMur, z1: zV + hV + 6 }, [8, 14, 8, 8], [5, 10]);
      V.conc(-300, -hMur, 600, hMur);
      V.fundo(-220, zV, 440, hV); V.mad(-220, zV, 440, hV, { horiz: true });
      V.aco(-lP / 2, 0, lP, tU); V.fundo(-lP / 2, tU, lP, tn); V.aco(-lP / 2, tU, lP, tn); V.oc(-lP / 2, tU + 0, lP, hF);
      V.ch(-lP / 2, lP / 2, -hMur, -6, String(lP), { semExt: true }); V.cv(zV + hV, zV, -290, -6, String(hV), { semExt: true });
      V.bal(lP / 2, tU / 2, 40, -9, 1); V.bal(lP / 2, tU + tn / 2, 40, -24, 3);
      return V;
    }
    function v3(cc, r) {
      var V = vista(cc, r, { x0: -wP / 2 - 6, x1: wP / 2 + 6, z0: -lP / 2 - 6, z1: lP / 2 + 6 }, [14, 14, 8, 12], [2, 5]);
      V.acoV(-wP / 2, -lP / 2, wP, lP); [-1, 1].forEach(function (sg) { V.lin(sg * (bV / 2 + folga), -lP / 2, sg * (bV / 2 + folga), lP / 2, "MAD-OCULTA"); V.lin(sg * (bV / 2 + folga + tU), -lP / 2, sg * (bV / 2 + folga + tU), lP / 2, "MAD-OCULTA"); V.furo(sg * yc, 0, dCh + 2, true); });
      V.cadH([-wP / 2, -yc, -bV / 2 - folga, bV / 2 + folga, yc, wP / 2], -lP / 2, -5, [mmt(wP / 2 - yc), mmt(yc - bV / 2 - folga), String(bV + 2 * folga), mmt(yc - bV / 2 - folga), mmt(wP / 2 - yc)], { semExt: true });
      V.cv(lP / 2, -lP / 2, wP / 2, 6, String(lP), { semExt: true });
      return V;
    }
    var n = [
      { t: "LG12 (Padrão v2.11): apoio direto da viga do deck DV-01 (" + I.cm(bV / 1000) + "x" + I.cm(hV / 1000) + " cm, tratada em autoclave) no bloco/mureta da fundação (outra empresa); " + txAp + "." },
      "1 - CM-06 chapa inox AISI 316 em U de " + tU + " mm (base " + wP + "x" + lP + ", duas abas de " + hF + " mm), folga de " + folga + " mm por lado; 2 - abas do U; 3 - calço de neoprene de " + tn + " mm entre a viga e a chapa; 4 - 2 chumbadores M12 A4-70 com arruela e porca, furo Ø14.",
      "Geometria adotada: " + pU + ". Embutimento e sistema do chumbador, e o nível da mureta: pela fundação (" + pEmb + ").",
      "A madeira não toca a chapa nem o concreto (calço de neoprene); topo da viga protegido; água escoa pela folga das abas.",
      "Sem verificação de resistência no cálculo: " + pSv + "."
    ];
    return { cod: "LG12", titulo: "APOIO DA VIGA DO DECK", layout: "G", vistas: [{ t: "CORTE (perpendicular à viga)", fn: v1 }, { t: "ELEVAÇÃO (ao longo da viga)", fn: v2 }, { t: "CHAPA CM-06 (planta, peça isolada)", fn: v3 }], notas: n };
  }

  /* ---------------------------------------------------------------- LG13 — GUARDA-CORPO (acrescentado ao Padrão na v2.11) */
  function lg13(c) {
    var vd = pecaPor(c, /^DS-V/), bV = vd ? Math.round(vd.b * 1000) : 120, hV = vd ? Math.round(vd.h * 1000) : 240, bM = 90, hGc = 1100, tU = 6, folga = 3, hF = 100, lP = 220, wP = bM + 2 * folga + 2 * tU, lF = 120, yb = 80, tCor = 40, bCor = 140, zTopo = hGc - tCor;
    var pSv = ponto(c, "lig-sem-verif", "", "", ""), pG = ponto(c, "guarda-geom", "LG13", "Geometria do suporte do montante e fixação do corrimão: o orçamento traz só 'montante 9x9 a cada 1,20 m em suporte inox em U (2 Ø12 passantes); corrimão 4x14'", "base " + lP + "x" + wP + "x" + tU + "; abas " + lF + "x" + hF + "x" + tU + "; passantes M12 a " + yb + " mm do eixo do montante; altura de " + hGc + " mm medida do topo da viga DV (o nível do piso do deck não vem do cálculo); fixação do corrimão por parafuso inox a definir", "RT");
    var pCarga = ponto(c, "guarda-carga", "LG13", c.res.deck ? "Carga horizontal do corrimão e flexão do montante na base verificadas no T7 (NBR 14718, Tab. 1, p. 6; NBR 6120, Tab. 12)" : "Carga horizontal de 1,0 kN/m no corrimão e a flexão do montante na base (NBR 14718): sem verificação neste cálculo", c.res.deck ? "verificadas" : "", "RT");
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -150, x1: 150, z0: -hV - 6, z1: hGc + 8 }, [10, 16, 6, 6], [10, 20]);
      V.fundo(-bV / 2, -hV, bV, hV); V.mad(-bV / 2, -hV, bV, hV, { horiz: true });
      V.aco(-wP / 2, 0, wP, tU); [-1, 1].forEach(function (sg) { V.aco(sg * (bM / 2 + folga + tU / 2) - tU / 2, tU, tU, hF); });
      V.fundo(-bM / 2, tU, bM, 360); V.mad(-bM / 2, tU, bM, 360, { horiz: false }); V.quebra(-bM / 2 - 3, tU + 360, bM + 6);
      V.fundo(-bM / 2, zTopo - 300, bM, 300); V.mad(-bM / 2, zTopo - 300, bM, 300, { horiz: false }); V.quebra(-bM / 2 - 3, zTopo - 300, bM + 6);
      V.fundo(-bCor / 2, zTopo, bCor, tCor); V.mad(-bCor / 2, zTopo, bCor, tCor, { horiz: true });
      V.cv(hGc, 0, wP / 2 + 30, 8, String(hGc), { semExt: true }); V.ch(-bCor / 2, bCor / 2, hGc, 5, String(bCor), { semExt: true });
      V.bal(bCor / 2, zTopo + tCor / 2, 20, 14, 1); V.bal(bM / 2, zTopo - 100, 30, 0, 2); V.bal(wP / 2, hF / 2, 24, -12, 3);
      return V;
    }
    function v2(cc, r) {
      var V = vista(cc, r, { x0: -300, x1: 300, z0: -hV - 24, z1: hGc + 8 }, [10, 14, 6, 6], [10, 20]);
      V.fundo(-290, -hV, 580, hV); V.mad(-290, -hV, 580, hV, { horiz: true });
      V.aco(-lP / 2, 0, lP, tU);
      [-1, 1].forEach(function (sg) { var x = sg * 80; V.oc(x - 6, -hV - 14, 12, hV + 14 + tU + 16); V.vis(x - 12, tU, 24, 3, "MAD-LIG"); V.vis(x - 10, -hV - 12, 20, 12, "MAD-LIG"); });
      V.fundo(-bM / 2, tU, bM, 360); V.mad(-bM / 2, tU, bM, 360, { horiz: false }); V.quebra(-bM / 2 - 3, tU + 360, bM + 6);
      V.fundo(-bM / 2, zTopo - 300, bM, 300); V.mad(-bM / 2, zTopo - 300, bM, 300, { horiz: false }); V.quebra(-bM / 2 - 3, zTopo - 300, bM + 6);
      V.fundo(-290, zTopo, 580, tCor); V.mad(-290, zTopo, 580, tCor, { horiz: true });
      V.ch(-80, 80, -hV - 14, -6, String(160), { semExt: true }); V.cv(0, -hV, -290, -6, String(hV), { semExt: true });
      V.tx(60, zTopo - 340, "montantes a cada 1200 mm", c.D.E.T.nota * 0.84);
      V.bal(-lP / 2, tU, -16, -20, 3); V.bal(80, -hV / 2, 40, 0, 4);
      return V;
    }
    function v3(cc, r) {
      var V = vista(cc, r, { x0: -lP / 2 - 6, x1: lP / 2 + 6, z0: -wP / 2 - 6, z1: wP / 2 + 6 }, [14, 14, 8, 12], [2, 5]);
      V.acoV(-lP / 2, -wP / 2, lP, wP); [-1, 1].forEach(function (sg) { V.furo(sg * 80, 0, 14, true); V.lin(-lF / 2, sg * (bM / 2 + folga), lF / 2, sg * (bM / 2 + folga), "MAD-OCULTA"); V.lin(-lF / 2, sg * (bM / 2 + folga + tU), lF / 2, sg * (bM / 2 + folga + tU), "MAD-OCULTA"); });
      V.cadH([-lP / 2, -80, -lF / 2, lF / 2, 80, lP / 2], -wP / 2, -5, [mmt(lP / 2 - 80), mmt(80 - lF / 2), String(lF), mmt(80 - lF / 2), mmt(lP / 2 - 80)], { semExt: true });
      V.cv(wP / 2, -wP / 2, lP / 2, 6, String(wP), { semExt: true });
      return V;
    }
    var n = [
      { t: "LG13 (Padrão v2.11): guarda-corpo de madeira, h = " + hGc + " mm, montantes " + I.cm(bM / 1000) + "x" + I.cm(bM / 1000) + " cm a cada 1200 mm presos à viga do deck DV-01 por suporte inox em U; corrimão " + I.cm(tCor / 1000) + "x" + I.cm(bCor / 1000) + " cm." },
      "1 - corrimão (4 x 14 cm); 2 - montante (9 x 9 cm); 3 - CM-07 suporte inox AISI 316 em U de " + tU + " mm (base " + lP + "x" + wP + ", abas de " + hF + " mm); 4 - 2 parafusos passantes M12 A4-70 com arruela e porca, atravessando a base e a viga.",
      "Geometria adotada: " + pG + ".",
      "Carga horizontal e flexão do montante: " + pCarga + ". " + (c.res.deck && c.res.deck.guardaCorpo ? "" : "Sem verificação de resistência neste cálculo: " + pSv + "."),
      c.res.deck && c.res.deck.guardaCorpo ? "VERIFICADO (T7): " + c.res.deck.guardaCorpo.dados.c.linha + "; montante η = " + I.br(c.res.deck.guardaCorpo.montante.eta, 2) + ", deslocamento do topo " + I.br(c.res.deck.guardaCorpo.deslocamento.mm, 1) + " mm (limite 25 mm, 5.1.1); fixação: tração de " + I.br(c.res.deck.guardaCorpo.fixacao.T, 1) + " kN no parafuso de cima, " + (c.res.deck.guardaCorpo.fixacao.lado === "3d" ? "arruela 3d" : "chapa de apoio " + Math.round(c.res.deck.guardaCorpo.fixacao.lado * 1000) + "x" + Math.round(c.res.deck.guardaCorpo.fixacao.lado * 1000) + "x8 mm do lado oposto da viga") + ", bloqueio entre barrotes com " + c.res.deck.guardaCorpo.fixacao.bloqueio.n + " parafusos de rosca total, η da fixação " + I.br(c.res.deck.guardaCorpo.fixacao.eta, 2) + "." : "",
      "Montante e corrimão com tratamento em autoclave quando de madeira serrada; topo protegido; corrimão sem aresta viva."
    ].filter(Boolean);
    return { cod: "LG13", titulo: "GUARDA-CORPO", layout: "G", vistas: [{ t: "CORTE (perpendicular à viga)", fn: v1 }, { t: "ELEVAÇÃO (ao longo da viga)", fn: v2 }, { t: "SUPORTE CM-07 (planta, peça isolada)", fn: v3 }], notas: n };
  }

  /* ---------------------------------------------------------------- LG02 (GARFO) — TOPO DO PILAR DUPLO: V ENTRE AS PEÇAS, PARAFUSOS PASSANTES (madeira-madeira) */
  function lg02g(c) {
    var L = c.res.ligacoes, t = L.topo, P = c.res.secoes.P, V0 = c.res.secoes.V, Vb = V0.b * 1000, Pb = P.b * 1000, Ph = P.h * 1000, d = Math.round(t.d * 1000), a1 = Math.round(t.a1 * 1000), a3 = Math.round(t.a3 * 1000), nr = t.nr, nc = t.nc || 2,
      a = Math.round((P.h / 2 - 4 * t.d) * 1000), hV = numDe(L.reforcoV && L.reforcoV.especificacao, /h = (\d+) mm/, 600), nRef = (L.reforcoV && L.reforcoV.parafusos) || 0, comp = Math.round((nr - 1) * a1 + 2 * a3);
    var grp = gruposPinos(c)[1];
    var pFuro = ponto(c, "furos-aco", "LG01, LG02, LG03, LG10", "Folga dos furos nas chapas (Ø do furo = d + folga do fabricante)", "d + 1 mm nos furos dos pinos (Ø17 para Ø16, Ø13 para Ø12); Ø22 para M20 na placa", "fabricante");
    function v1(cc, r) {
      var V = vista(cc, r, { x0: -(Vb / 2 + Pb + 30), x1: Vb / 2 + Pb + 30, z0: -Ph / 2 - 30, z1: Ph / 2 + 30 }, [16, 16, 12, 12], [5, 10]);
      V.fundo(-Vb / 2, -Ph / 2, Vb, Ph); V.mad(-Vb / 2, -Ph / 2, Vb, Ph, { horiz: true });
      [-1, 1].forEach(function (sg) { var x0 = sg < 0 ? -(Vb / 2 + Pb) : Vb / 2; V.fundo(x0, -Ph / 2, Pb, Ph); V.mad(x0, -Ph / 2, Pb, Ph, { horiz: false }); });
      [-1, 1].forEach(function (sy) { V.vis(-(Vb / 2 + Pb) - 4, sy * a - d / 2, Vb + 2 * Pb + 8, d, "MAD-LIG"); V.vis(-(Vb / 2 + Pb) - 5, sy * a - 18, 5, 36, "MAD-LIG"); V.vis(Vb / 2 + Pb, sy * a - 18, 5, 36, "MAD-LIG"); V.eixoV(0, -Ph / 2 - 6, Ph / 2 + 6); });
      V.ch(-(Vb / 2 + Pb), -Vb / 2, Ph / 2, 5, String(Math.round(Pb)), { semExt: true }); V.ch(-Vb / 2, Vb / 2, Ph / 2, 11, String(Math.round(Vb)), { semExt: true }); V.ch(Vb / 2, Vb / 2 + Pb, Ph / 2, 5, String(Math.round(Pb)), { semExt: true });
      V.bal(-(Vb / 2 + Pb / 2), Ph / 2 - 12, -9, 8, 1); V.bal(0, a, 0, -9, 2); V.bal(Vb / 2 + Pb / 2, -a, 9, 0, 3);
      return V;
    }
    function v2(cc, r) {
      var zb = -(comp + 40), V = vista(cc, r, { x0: -Ph / 2 - 40, x1: Ph / 2 + 40, z0: zb, z1: 90 }, [16, 18, 12, 14], [5, 10]);
      V.fundo(-Ph / 2, zb + 40, Ph, comp); V.mad(-Ph / 2, zb + 40, Ph, comp, { horiz: false });
      var zs = []; for (var j = 0; j < nr; j++) zs.push(-(a3 + j * a1));
      V.fundo(-Ph / 2, 0, Ph, 80); V.mad(-Ph / 2, 0, Ph, 80, { horiz: true }); V.quebra(-Ph / 2 - 3, 80, Ph + 6);
      zs.forEach(function (z) { [-1, 1].forEach(function (sg) { V.pino(sg * a, z, d, true); }); });
      V.cv(0, -a3, -Ph / 2, -6, String(a3), { semExt: true });
      V.ch(-a, a, 80, 6, String(2 * a), { semExt: true });          /* acima da quebra (a cota 312 ficava em cima do zigue-zague, E4 r3) */
      V.bal(-a, zs[Math.min(2, nr - 1)], -14, 0, 3); V.bal(0, 40, 0, 8, 2);
      return V;
    }
    var n = [
      "BA-01/TOPO (LG02): topo do pilar duplo em GARFO — a viga V (" + I.cm(Vb / 1000) + " cm) passa ENTRE as duas peças do pilar (" + I.cm(Pb / 1000) + "x" + I.cm(Ph / 1000) + " cm, " + c.classe + "): o garfo natural trava a torção da V. Ligação madeira-madeira.",
      "1 - " + t.n + " parafusos passantes inox A4 Ø" + d + " AJUSTADOS (furo = Ø" + d + ", sem folga) atravessando peça-V-peça (" + nc + " colunas x " + nr + " linhas), com arruela 3d e porca (" + pFuro + ").",
      "2 - parafusos de rosca total SFS WT-T 8,2 x 300 de reforço à tração normal na V: " + nRef + " no total, metade de cada lado (Ft,90 da NBR 7190-1:2022, 7.1.1).",
      "3 - V com h = " + hV + " mm sobre o pilar; a V apoia por contato no topo da face de fixação das peças; separador de EPDM entre madeira e aço.",
      "Espaçamentos real | mínimo (mm): " + esp2(grp) + ". Mínimo: " + FONTE_MIN + ".",
      etaLinha(t, "LG02", "Parafusos Ø" + d + " peça-V-peça (modo h: embutimento da V, NBR 7190-1:2022, 7.2, Tab. 19):"),
      etaLinha(L.reforcoV, "LG02-reforco", "Reforço à tração normal (F90):")
    ];
    return { cod: "LG02", titulo: "TOPO: V ENTRE AS PEÇAS DO GARFO", layout: "T", fracW: 0.40, frac: [0.45, 0.22], vistas: [{ t: "PLANTA (corte na fileira de parafusos)", fn: v1 }, { t: "ELEVAÇÃO DA PEÇA (VISTA DA FACE)", fn: v2 }], notas: n };
  }
  function lg02x(c) { return c.res.secoes.P.forma === "duplo" ? lg02g(c) : lg02(c); }
  var DETALHES = { LG01: lg01, LG02: lg02x, LG03: lg03, LG03b: lg03b, LG03c: lg03c, LG06: lg06, LG10a: lg10a, LG10b: lg10b, LG11: lg11, LG12: lg12, LG13: lg13 };


  /* ---------------------------------------------------------------- quadro a1–a4 e as folhas E06A/B/C */
  function quadroEspacos(c, x, y, w) {
    var D = c.D, T = D.E.T, pinos = gruposPinos(c), hT = I.tituloVista(D, x, y, "ESPAÇAMENTOS A1-A4 DOS PINOS (mm): REAL | MÍNIMO", null) + 1;
    var cols = [{ t: ["FIXADOR", "(Ø mm)"], al: "E" }, { t: "a1" }, { t: "a2" }, { t: "a3,t" }, { t: "a3,c" }, { t: "a4,t" }, { t: "a4,c" }, { t: "OK?" }];
    var lin = pinos.map(function (g) {
      var q = espacos(g), m = {}; q.forEach(function (e) { m[e.nome] = e; });
      function cel(n) { var e = m[n]; return e ? { t: Math.round(e.real) + " | " + I.br(e.min, 0), cor: e.ok ? null : VERMELHO } : "-"; }
      var ok = q.every(function (e) { return e.ok; });
      return [{ t: g.nome + " (Ø" + g.d + ")", al: "E" }, cel("a1"), cel("a2"), cel("a3,t"), cel("a3,c"), cel("a4,t"), cel("a4,c"), { t: ok ? "OK" : "NÃO ATENDE", cor: ok ? null : VERMELHO, attr: ' data-espacos-ok="' + (ok ? 1 : 0) + '"' }];
    });
    var tb = D.tabela(x, y + hT, cols, lin, { fs: T.tabela * 0.9, hl: 5.2 });
    return hT + tb.h;
  }
  var E06_FOLHAS = { "06A": ["LG01", "LG02", "LG03", "LG03b"], "06B": ["LG03c", "LG06", "LG10a", "LG10b"], "06C": ["LG11", "LG12", "LG13", "QUADRO"] };
  function folhaE06(c, qual) {
    var D = c.D, a = c.geo.area, T = D.E.T, gap = 6, ids = E06_FOLHAS[qual], cw = (a.w - 4 - gap) / 2, ch = (a.h - 4 - gap) / 2, escs = [];
    ids.forEach(function (id, i) {
      var x = a.x + 2 + (i % 2) * (cw + gap), y = a.y + 2 + Math.floor(i / 2) * (ch + gap);
      if (id === "QUADRO") {
        var hq = quadroEspacos(c, x + 2, y + 1, cw - 4), pLam = ponto(c, "lamela", "E06", "", "");
        var pwt = ponto(c, "wtt-eta", "LG03, LG06, LG11", "Mínimos a1–a4 dos parafusos de rosca total SFS WT-T 8,2 pelo ETA-12/0063 (texto não lido) e dos parafusos 5x50 da fita", "espaçamentos desenhados conferidos só pelo critério da EN 1995-1-1 para parafusos autoperfurantes (a1 >= 7d, a2 >= 5d); sem redução", "RT (ler o ETA)");
        var hu = D.textos(x + 2, y + hq + 4, [
          "Real = o desenhado nas vistas desta folha (o do cálculo); mínimo = " + FONTE_MIN + ". Nenhum espaçamento é reduzido em obra.",
          "Parafusos de rosca total (WT-T 8,2) e parafusos 5x50 da fita: mínimos pelo ETA do fabricante (" + pwt + ").",
          "Lamelas desenhadas por linhas (padrão engenharada: sem anel de crescimento); lamela de " + LAM + " mm é ilustrativa (" + pLam + ").",
          "Chapas de aço em corte: contorno 0,50 e hachura a 45 gr; pinos e parafusos 0,35 com eixo em traço-ponto; aço visto (sem corte) só em contorno.",
          "Furos e soldas das chapas: Ø do furo = d + 1 mm e filete a = 6 mm adotados; a solda chapa-placa da base é a do cálculo (ver o quadro de pontos a confirmar, ao lado).",
          "As folhas E06A, E06B e E06C trazem cada ligação com no mínimo duas vistas, a peça de aço isolada e cotada e a nota técnica ao lado."
        ], T.nota, { wmax: cw - 6 });
        c.pc.pos = { x: x + 2, y: y + hq + 4 + hu + 4, w: cw - 4, yb: y + ch - 2, rotulo: c.rotulo };
        return;
      }
      if (!DETALHES[id]) return;
      escs = escs.concat(celulaDet(c, x, y, cw, ch, DETALHES[id](c)));
    });
    var yy = a.y + 2 + ch + gap / 2; D.linha(a.x + 2, yy, a.x + a.w - 2, yy, "MAD-COTA");
    var xx = a.x + 2 + cw + gap / 2; D.linha(xx, a.y + 2, xx, a.y + a.h - 2, "MAD-COTA");
    var u = []; escs.sort(function (p, q) { return p - q; }).forEach(function (e) { if (u.indexOf(e) < 0) u.push(e); });
    return { escala: u.length ? u.map(function (e) { return "1:" + e; }).join(" e ") : "1:5 e 1:10" };
  }

  /* quadro único "PONTOS A CONFIRMAR": desenhado por último (depois de todas as folhas) na célula livre da E06C; nada de vermelho */
  function quadroPontos(c) {
    var P = c.pc.pos; if (!P || !c.pc.length) return;
    var D = c.D, T = D.E.T, ht = I.tituloVista(D, P.x, P.y, "PONTOS A CONFIRMAR (RT): valor adotado no desenho e quem decide", null) + 1, y0 = P.y + ht, avail = P.yb - y0, W = P.w, rec = 9;
    var par = c.pc.map(function (k) {
      return { t: "PC-" + k.n + "  (" + (k.onde || "-") + ")  " + k.texto + ". " + (k.adotado ? "Adotado: " + k.adotado + "." : "Sem valor adotado: decisão da RT/fornecedor.") + " Confirma: " + k.quem + ".", attr: ' data-pc="' + k.n + '"' };
    });
    var feito = false;
    [T.nota, T.minimo].forEach(function (hN) {
      if (feito) return;
      [1, 2].forEach(function (nc) {
        if (feito) return;
        var wc = (W - (nc - 1) * 5) / nc, cols = [[]], h = 0, ok = true;
        par.forEach(function (it) {
          var hh = D.alturaTextos([it], hN, wc, rec);
          if (h + hh > avail) { if (cols.length >= nc) { ok = false; return; } cols.push([]); h = 0; }
          cols[cols.length - 1].push(it); h += hh;
        });
        if (!ok) return;
        cols.forEach(function (g, i) { D.textos(P.x + i * (wc + 5), y0, g, hN, { wmax: wc, recuo: rec }); });
        feito = true;
      });
    });
    if (!feito) c.avisos.push("Folha " + P.rotulo + ": o quadro de pontos a confirmar não cabe na célula (" + c.pc.length + " pontos).");
  }

  /* ================================================================ E10 / E11 — TABELAS */
  function ferragens(c) {
    var L = c.res.ligacoes, itens = [], pecas = c.d.fonteTodos;
    function fq(id) { var p = pecas.filter(function (x) { return x.id === id; })[0]; return p ? p.qtd : null; }
    var nums = {}; c.d.pilares.forEach(function (p) { var m = /^P([0-9]+)/.exec(p.id); if (m) nums[m[1]] = 1; });
    var nBases = Object.keys(nums).length || c.d.pilares.length, P = c.res.secoes.P;          /* E4: no pilar duplo (garfo) são 2 peças + espaçadores por pilar — a base é UMA por pilar */
    var pbd = L.placaBase.dimensoes_mm, pbe = L.placaBase.espessura_mm, pbs = L.placaBase.solda || {};
    itens.push({ ferr: "Placa de base " + pbd[0] + "x" + pbd[1] + "x" + pbe + " mm, aço A36 galv. a fogo" + (pbs.tipo === "penetracao-total" ? " (solda chapa-placa de penetração total)" : ""), cod: "-", fab: "-", eta: "-", mat: "ASTM A36 galv. fogo (NBR 6323)", qtd: nBases, kg: nBases * pbd[0] / 1000 * pbd[1] / 1000 * pbe / 1000 * 7850, est: true, lig: "LG01", pend: true });
    /* E4 (correção a/b): diâmetro, quantidade e kg dos pinos da base vêm do RESULTADO da ligação (L.base.d, n), nunca fixos; todos os tipos de base (cruz e garfo) e topoV pode não existir (garfo) */
    var dB = Math.round(((L.base && L.base.d) || 0.016) * 1000), garfoB = P && P.forma === "duplo", nBase = (L.base && L.base.n) || 0, nTopo = (L.topo && L.topo.n) || 0, nTopoV = (L.topoV && L.topoV.n) || 0;
    if (!garfoB) {
      itens.push({ ferr: "Chapa em cruz t = 16 mm (" + (L.base.chapa ? L.base.chapa.largura_mm : 193) + " x " + Math.round(L.base.comprimento * 1000 + FOLGA_PE) + " mm: " + Math.round(L.base.comprimento * 1000) + " embutidos + " + FOLGA_PE + " de folga)", cod: "-", fab: "-", eta: "-", mat: "ASTM A36 galv. fogo", qtd: 2 * nBases, kg: 2 * nBases * 0.016 * (L.base.chapa ? L.base.chapa.largura_mm : 193) / 1000 * (L.base.comprimento + FOLGA_PE / 1000) * 7850, est: true, lig: "LG01", pend: true });
      itens.push({ ferr: "Pino liso inox Ø" + dB + " (base)", cod: "-", fab: "-", eta: "-", mat: "inox A4-70", qtd: 2 * nBase * nBases, kg: 2 * nBase * nBases * Math.PI * dB * dB / 4 * 280 * 7.9e-6 / 1, est: true, lig: "LG01", pend: true });
    } else {
      itens.push({ ferr: "Chapas externas t = 12 mm do garfo (4 por pilar, " + Math.round((L.base.comprimento + 0.10) * 1000) + " mm de comprimento)", cod: "-", fab: "-", eta: "-", mat: "ASTM A36 galv. fogo", qtd: 4 * nBases, kg: 4 * nBases * (P.h || 0) * (L.base.comprimento + 0.10) * 0.012 * 7850, est: true, lig: "LG01", pend: true });
      itens.push({ ferr: "Parafuso passante inox ajustado Ø" + dB + " (base do garfo)", cod: "-", fab: "-", eta: "-", mat: "inox A4-70", qtd: 2 * nBase * nBases, kg: null, est: false, lig: "LG01", pend: true });
    }
    itens.push({ ferr: "Chumbador químico M20 A4-70", cod: "-", fab: "-", eta: "pela fundação", mat: "inox A4-70", qtd: L.placaBase.chumbadores.total * nBases, kg: null, est: false, lig: "LG01", pend: true });
    if (!garfoB) itens.push({ ferr: "Chapa em T 16 mm com forquilha", cod: "-", fab: "-", eta: "-", mat: "ASTM A36 galv. fogo", qtd: nBases, kg: null, est: false, lig: "LG02", pend: true });
    itens.push({ ferr: (garfoB ? "Parafuso passante inox Ø16 (topo: " + nTopo + " na ligação da V)" : "Pino inox Ø16 (topo: " + nTopo + " no pilar + " + nTopoV + " na V)"), cod: "-", fab: "-", eta: "-", mat: "inox A4-70", qtd: (nTopo + nTopoV) * nBases, kg: null, est: false, lig: "LG02", pend: true });
    itens.push({ ferr: "Parafuso rosca total SFS WT-T 8,2 x 300 (terça-V)", cod: "WT-T-8,2x300", fab: "SFS", eta: "ETA-12/0063", mat: "aço c/ revestimento p/ classe de serviço", qtd: fq("WT-TV"), kg: null, est: false, lig: "LG06", pend: false });
    itens.push({ ferr: "Parafuso rosca total SFS WT-T 8,2 x 300 (reforço Ft,90)", cod: "WT-T-8,2x300", fab: "SFS", eta: "ETA-12/0063", mat: "idem", qtd: fq("WT-RV"), kg: null, est: false, lig: "LG11", pend: false });
    itens.push({ ferr: "Parafuso rosca total SFS WT-T 8,2 x 190 (bloqueador, escora, pendural)", cod: "WT-T-8,2x190", fab: "SFS", eta: "ETA-12/0063", mat: "idem", qtd: fq("WT-190"), kg: null, est: false, lig: "LG03", pend: false });
    itens.push({ ferr: "Ligação de escora: 2 chapas inox 4 mm + " + L.escora.parafusosPorPonta + " parafusos Ø16 por ponta", cod: "-", fab: "-", eta: "-", mat: "inox AISI 316 (A4)", qtd: fq("ESC-LIG"), kg: null, est: false, lig: "LG10", pend: true, un: "cj" });
    itens.push({ ferr: "Ligação da verga: chapa em T inox 8 mm, " + L.verga.pinos.n + " pinos Ø12 + " + L.verga.parafusosNaV + " parafusos Ø16", cod: "-", fab: "-", eta: "-", mat: "inox AISI 316 (A4)", qtd: fq("LIG-VG"), kg: null, est: false, lig: "LG03", pend: true, un: "cj" });
    var fx = pecas.filter(function (p) { return /^FX\d/.test(p.id); }), mFita = 0; fx.forEach(function (p) { mFita += (p.comprimento_m || 0) * (p.qtd || 1); });
    itens.push({ ferr: "Fita metálica perfurada 60 x 2,0 mm em X (" + fx.length + " trechos) + " + L.fita.parafusosPorPonta + " parafusos 5x50/ponta + tensor", cod: "-", fab: "-", eta: "-", mat: "ASTM A36 galv. fogo (ou inox)", qtd: r1(mFita * 100) / 100, kg: mFita * 0.06 * 0.002 * 7850, est: true, lig: "LG10", pend: true, un: "m" });
    itens.push({ ferr: "Apoio do deck: chapa inox em U 6 mm + 2 chumbadores M12 + calço de neoprene", cod: "-", fab: "-", eta: "-", mat: "inox AISI 316 (A4)", qtd: fq("DS-APOIO"), kg: null, est: false, lig: "LG12", pend: true, un: "un" });
    return itens;
  }
  function folhaE10(c) {
    var D = c.D, d = c.d, a = c.geo.area, T = D.E.T, tab = d.marcas.tab;
    var hT = I.tituloVista(D, a.x + 4, a.y + 2, "TABELA DE PEÇAS POR POSIÇÃO", "SEM ESCALA - uma linha por marca; volumes da fonte, sem perdas") + 2;
    var cols = [{ t: "MARCA" }, { t: "QTD" }, { t: ["CLASSE", "(GL/LVL)"] }, { t: ["b x h", "(cm)  |  h1>h2"] }, { t: ["L", "(cm)"] }, { t: ["VOLUME", "UNIT. (m3)"] }, { t: ["VOLUME", "TOTAL (m3)"] }, { t: ["TRATAMENTO", "(NBR 16143)"] }, { t: "ACABAMENTO" }, { t: "OBS.", al: "E" }];
    var tvol = 0, tq = 0, linhas = tab.map(function (m) {
      tvol += m.volTot; tq += m.qtd;
      var tr = m.trat ? m.trat : { t: "a definir (" + ponto(c, "tratamento", "E10", "Tratamento (NBR 16143) e acabamento de cada marca: a ficha das peças não os define", "", "RT") + ")", attr: ' data-pend="tratamento-' + m.marca + '"' };
      var obs = m.perfil ? (c.res.contraflechaV && c.res.contraflechaV.aplicada ? "perfil poligonal (E04); CF " + c.res.contraflechaV.max_mm + " mm na ponta" : "perfil poligonal (E04); volume pela área") : (m.prefixo === "DP" ? "faixa de 10 cm (corte pelo terreno)" : "");
      return [{ t: m.marca, attr: ' data-tab-marca="' + m.marca + '"' }, { t: String(m.qtd), attr: ' data-tab-qtd="' + m.marca + '|' + m.qtd + '"' }, m.classe, m.h1h2 ? m.sec.replace(" x var.", "") + " | " + I.br(m.h1h2[0] * 100, 1) + ">" + I.br(m.h1h2[1] * 100, 1) : m.sec, String(m.Lcm),
        I.br(m.volUnit, 4), { t: I.br(m.volTot, 3), attr: ' data-tab-vol="' + m.marca + '|' + Math.round(m.volTot * 1e6) / 1e6 + '"' }, tr, { t: "a definir (" + ponto(c, "tratamento", "E10", "", "") + ")" }, obs];
    });
    /* totais por classe */
    var porClasse = {}; tab.forEach(function (m) { var k = m.classe; (porClasse[k] = porClasse[k] || { q: 0, v: 0 }); porClasse[k].q += m.qtd; porClasse[k].v += m.volTot; });
    var linT = linhas.slice(); Object.keys(porClasse).sort().forEach(function (k) { linT.push({ total: [{ t: "TOTAL " + k }, String(porClasse[k].q), "", "", "", "", { t: I.br(porClasse[k].v, 3), attr: ' data-tab-classe="' + k + '|' + Math.round(porClasse[k].v * 1e6) / 1e6 + '"' }, "", "", ""] }); });
    linT.push({ total: [{ t: "TOTAL GERAL (MLC)" }, { t: String(tq), attr: ' data-tab-total-qtd="' + tq + '"' }, "", "", "", "", { t: I.br(tvol, 3), attr: ' data-tab-total-vol="' + Math.round(tvol * 1e6) / 1e6 + '"' }, "", "", ""] });
    var nColT = 2, gap = 8, porCol = Math.ceil(linT.length / nColT), hDisp = a.y + a.h - 4 - (a.y + 2 + hT) - 40;
    var hl = Math.max(4.0, Math.min(5.0, hDisp / (porCol + 2))), x = a.x + 4, ytab = a.y + 2 + hT, ws = D.larguras(cols, linT, { fs: T.tabela * 0.92 }), wT = ws.reduce(function (s, v) { return s + v; }, 0);
    if (wT * nColT + gap > a.w - 4) { nColT = 1; porCol = linT.length; hl = Math.max(3.6, Math.min(5.0, hDisp / (porCol + 2))); }
    var ht = 0;
    for (var i = 0; i < linT.length; i += porCol) {
      var tb = D.tabela(x, ytab, cols.map(function (cc, j) { return { t: cc.t, w: ws[j], al: cc.al }; }), linT.slice(i, i + porCol), { fs: T.tabela * 0.92, hl: hl });
      ht = Math.max(ht, tb.h); x += wT + gap;
    }
    if (ytab + ht > a.y + a.h) c.avisos.push("Folha E10: a tabela passa do pé da folha.");
    /* itens sem geometria */
    var sem = d.fonteTodos.filter(function (p) { return !p.secao && !/^(WT-|ESC-LIG|LIG-|DS-APOIO|FX)/.test(p.id) && !/^Ligações/.test(p.grupo); });
    var yy = ytab + ht + 6;
    var lin2 = sem.map(function (p) { return [p.id, p.descricao.slice(0, 70), { t: I.br(p.qtd, 2), attr: ' data-sem-geo="' + p.id + '"' }, p.unidade]; });
    I.tituloVista(D, a.x + 4, yy, "ITENS SEM GEOMETRIA (ÁREA/METRAGEM) - ver orçamento", null);
    D.tabela(a.x + 4, yy + 9, [{ t: "ID" }, { t: "DESCRIÇÃO", al: "E" }, { t: "QTD" }, { t: "UN." }], lin2, { fs: T.tabela * 0.86, hl: 3.9 });
    return { escala: "SEM ESCALA" };
  }
  function folhaE11(c) {
    var D = c.D, a = c.geo.area, T = D.E.T, it = ferragens(c);
    var hT = I.tituloVista(D, a.x + 4, a.y + 2, "TABELA DE FERRAGENS E CONECTORES", "SEM ESCALA - * kg estimado (Ø x L x 7.850 kg/m3 ou volume da chapa); a definir = sem código do fabricante/ETA (quadro de pontos a confirmar, E06C)") + 2;
    var cols = [{ t: "ITEM" }, { t: "FERRAGEM", al: "E" }, { t: ["CÓDIGO DO", "FABRICANTE"] }, { t: "FABRICANTE" }, { t: "ETA / FICHA" }, { t: ["MATERIAL /", "ACABAMENTO"], al: "E" }, { t: "QTD" }, { t: "UN." }, { t: "kg" }, { t: "LIGAÇÃO" }];
    var tk = 0, lin = it.map(function (f, i) {
      tk += f.kg || 0;
      var semCod = f.cod === "-";
      return [String(i + 1), { t: f.ferr, al: "E" }, semCod ? { t: "a definir (" + ponto(c, "ferragem-codigo", "E11", "Código do fabricante e ETA dos pinos, chapas, placa de base e chumbadores: vêm do dimensionamento (ligações), não de catálogo", "", "RT/fabricante") + ")", attr: ' data-pend="ferragem-' + (i + 1) + '"' } : f.cod, semCod ? { t: "-" } : f.fab, semCod ? { t: "a definir" } : f.eta,
        { t: f.mat, al: "E" }, { t: f.qtd == null ? "-" : I.br(f.qtd, f.un === "m" ? 2 : 0), attr: ' data-ferr-qtd="' + (i + 1) + '|' + f.qtd + '"' }, f.un || "un", f.kg ? I.br(f.kg, 1) + (f.est ? " *" : "") : "-", f.lig];
    });
    lin.push({ total: ["", { t: "TOTAL kg (itens com massa)" }, "", "", "", "", "", "", { t: I.br(tk, 1) }, ""] });
    var tb = D.tabela(a.x + 4, a.y + 2 + hT, cols, lin, { fs: T.tabela, hl: 5.6 });
    D.textos(a.x + 4, a.y + 2 + hT + tb.h + 6, [
      "Quantidade escrita uma vez por ligação e totalizada aqui. Conector de catálogo (SFS WT-T): conferir o relatório de avaliação ETA-12/0063, não a folha de venda.",
      "Alumínio nunca em contato com aço (galvânica); eletrolítico NÃO em área externa.",
      "Itens 'a definir': pinos, chapas, placa e chumbadores vêm do dimensionamento (ligações), não de catálogo; o código do fabricante e a ETA entram no quadro 'Pontos a confirmar' (folha E06C)."
    ], T.nota * 0.95, { wmax: a.w - 10 });
    return { escala: "SEM ESCALA" };
  }

  /* ================================================================ NOTAS, LISTA DE DESENHOS, GERAR */
  function blocosNotas(c) {
    var r = c.res, rev = c.rev, cl = c.classe;
    var lista = ["E01 - Locação, bases e reações", "E02 - Decks (piso)", "E03 - Planta de cobertura", "E04 - Pórticos: elevações e cortes", "E05 - Cortes gerais: NÃO SE APLICA (cobertos em E03/E04)", "E06A/B/C - Detalhes das ligações; pontos a confirmar (E06C)",
      "E07 - Contraventamento", "E08 - Oficina: por conta do fabricante a partir do IFC (nota)", "E09 - Painéis CLT: NÃO SE APLICA", "E10 - Tabela de peças", "E11 - Tabela de ferragens", "E12 - Manual de montagem: caderno A3 separado"];
    var notas = [
      "Cotas e seções de madeira em centímetros; ferragem e chapa em milímetros; níveis em metros. Não medir no desenho.",
      "Marca da peça: {marca} - {classe} - {b}x{h} x {L} (cm), igual em todas as folhas, na tabela e no IFC.",
      "MLC: classe " + cl + " (EN 14080), nunca inferior à do memorial; certificado do lote na entrega. Lamela máx. 45 mm (ficha); umidade de entrega 12 % +/- 2 %.",
      "Tratamento NBR 16143 e acabamento: conforme tabela E10; peça sem definição fica 'a definir' no quadro de pontos a confirmar. Proteção de topo em toda peça exposta.",
      "Ferragem inox A4 ou galvanizada a fogo em área externa/litorânea; alumínio não toca o aço. Mínimo de 2 fixadores onde o fixador é o caminho principal da carga.",
      "Espaçamentos a1-a4 cotados são os do cálculo (mínimo EN 1995-1-1 ao lado); não reduzir em obra. Madeira nunca em contato com o concreto.",
      "Tolerâncias EN 14080: largura +/- 2 mm; h <= 400 mm: +4/-2 mm; h > 400 mm: +1 %/-0,5 %; empenamento 4 mm em 2 m.",
      "Desenho de oficina por conta do fabricante a partir do IFC/BTLx, com aprovação da RT antes da fabricação (TFEC 061719).",
      "VERMELHO = o que impede emitir (ligação que não atende, achado aberto da auditoria): não fabricar nem comprar o item antes de resolver. Os pontos a confirmar e os valores adotados ficam em preto, no quadro da folha E06C.",
      "Projeto executivo - revisão " + rev + "."
    ];
    var imp = [];
    if (r.semSolucao) imp.push({ t: "O dimensionamento não encontrou solução: projeto NÃO EMITIDO para execução.", cor: VERMELHO });
    if (r.ligacoes && r.ligacoes.ok === false) imp.push({ t: "Há ligação que NÃO ATENDE: ver folha E06.", cor: VERMELHO });
    if (!r.deck && arr(r.fonte && r.fonte.pecas).some(function (p) { return /^D[SI]-/.test(p.id); })) imp.push({ t: "Deck e guarda-corpo sem verificação de resistência neste cálculo: ver o quadro 'Pontos a confirmar' (folha E06C).", cor: VERMELHO });
    arr(r.auditoria && r.auditoria.achados).slice(0, 3).forEach(function (a0) { imp.push({ t: "Auditoria: " + a0.mensagem.slice(0, 110), cor: VERMELHO }); });
    var bl = [];
    if (imp.length) bl.push({ titulo: "NÃO EMITIR PARA EXECUÇÃO", cor: VERMELHO, itens: imp });
    bl.push({ titulo: "LISTA DE DESENHOS", itens: lista }, { titulo: "NOTAS GERAIS", numerar: true, itens: notas },
      { titulo: "NORMAS", itens: ["NBR 7190-1:2022; NBR 7190:1997 Anexo A (desenho)", "EN 14080; EN 1995-1-1", "NBR 6123:2023, 6120:2019, 8681:2003", "NBR 16143 (preservação)"] });
    return bl;
  }
  var ORDEM = [["E01", "locacao", folhaE01], ["E02", "decks", folhaE02], ["E03", "cobertura", folhaE03], ["E04", "porticos", folhaE04], ["E06", "ligacoes-a", function (c) { return folhaE06(c, "06A"); }, "06A"],
    ["E06", "ligacoes-b", function (c) { return folhaE06(c, "06B"); }, "06B"], ["E06", "ligacoes-c", function (c) { return folhaE06(c, "06C"); }, "06C"], ["E07", "contraventamento", folhaE07], ["E10", "pecas", folhaE10], ["E11", "ferragens", folhaE11]];

  function gerar(res, opcoes) {
    opcoes = opcoes || {};
    var avisos = [];
    if (!MP || !I) return { ok: false, folhas: [], avisos: ["js/madpranchas.js não carregou."] };
    var P = PR();
    if (!P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    if (!res || !res.fonte || !arr(res.fonte.pecas).length || !res.ligacoes || !res.secoes) return { ok: false, folhas: [], avisos: ["Resultado do cálculo sem fonte de peças/ligações: não há pranchas."] };
    var E = I.estilo(opcoes.padrao);
    Object.keys(PADRAO_ENG.base).forEach(function (k) { var b = E.camadas[PADRAO_ENG.base[k]]; E.camadas[k] = { mm: b.mm, dash: b.dash, cor: b.cor }; });
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA");
    var codigo = txt(opcoes.codigo).trim() || "EST-MAD-ENG", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    var classe = txt(opcoes.classe) || (function () { var p = arr(res.fonte.pecas).filter(function (q) { return /GL\d/.test(q.material || ""); })[0]; return p ? classeDe(p.material) : "GL24h"; })();
    var ctx0 = { res: res, E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, classe: classe, pc: [], cels: [] };
    ctx0.d = contexto(res, opcoes); ctx0.pend = ctx0.d.pend;
    var feitas = [];
    ORDEM.forEach(function (def, i) {
      var D = new I.Desenho(E, opcoes.depurar ? [] : null), c = {}, resF = {};
      Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.rotulo = def[3] || def[0].slice(1);
      var titulo = PADRAO_ENG.folhas[def[0]] + (def[3] ? " (" + (def[3] === "06A" ? 1 : def[3] === "06B" ? 2 : 3) + "/3)" : "");
      try { resF = def[2](c) || {}; } catch (e) { avisos.push("Folha " + def[0] + ": " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      feitas.push({ def: def, D: D, escala: resF.escala || "INDICADA", rotulo: c.rotulo, titulo: titulo });
    });
    var f06c = feitas.filter(function (f) { return f.def[3] === "06C"; })[0];
    if (f06c) { var cq = {}; Object.keys(ctx0).forEach(function (k) { cq[k] = ctx0[k]; }); cq.D = f06c.D; cq.rotulo = "06C"; try { quadroPontos(cq); } catch (e) { avisos.push("Quadro de pontos a confirmar: " + (e && e.message ? e.message : String(e))); } }
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "madengpranchas", nome: "Estrutura de madeira engenharada - projeto executivo", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional), obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario),
        contratante: txt(opcoes.contratante), local: txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def[1], n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var blocos = blocosNotas(ctx0);
    var camadas = {}; Object.keys(MP.PADRAO_MAD.camadas).forEach(function (k) { camadas[k] = MP.PADRAO_MAD.camadas[k]; }); Object.keys(PADRAO_ENG.layers).forEach(function (k) { camadas[k] = PADRAO_ENG.layers[k]; });
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, H = geo.papel.h, M = geo.moldura, Fd = new I.Desenho(E, null);
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA");
      if (!I.colunaNotas(Fd, geo, blocos) && i === 0) avisos.push("As notas não cabem na coluna da direita com a letra mínima do padrão: conferir.");
      var rotuloFolha = f.rotulo + "/12";
      I.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, rotuloFolha);
      var numero = codigo + "-E" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + I.n(W) + 'mm" height="' + I.n(H) + 'mm" viewBox="0 0 ' + I.n(W) + " " + I.n(H) + '" font-family="' + I.FONTE + '" data-folha="' + f.def[1] + '" data-numero="' + I.esc(numero) + '">' +
        "<title>" + I.esc(numero + " - " + f.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + I.n(W) + '" height="' + I.n(H) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + '<text x="' + I.n(W / 2) + '" y="7" font-size="3" text-anchor="middle" fill="#c00000" data-faixa="1">' + I.esc(FAIXA) + "</text></svg>";
      var o = { id: f.def[1], rotulo: f.rotulo, numero: numero, titulo: f.titulo, formato: formato, escala: f.escala, svg: svg, rotuloCarimbo: rotuloFolha };
      o.dxf = { familia: "madeira", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: rotuloFolha, logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: camadas, tituloH: E.T.titulo, codigo: codigo };
      if (opcoes.depurar) o.caixasTexto = D.caixas;
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, tabela: ctx0.d.marcas.tab, ferragens: ferragens(ctx0), reacoes: ctx0.d.reac.linhas, marcas: ctx0.d.marcas.porId, desenhaveis: ctx0.d.pcs, celulas: ctx0.cels, pontos: ctx0.pc };
  }

  var MadEngPranchas = { FAIXA: FAIXA, PADRAO_ENG: PADRAO_ENG, gerar: gerar, desenhaveis: desenhaveis, marcar: marcar, ferragens: function (res) { return ferragens({ res: res, d: contexto(res, {}) }); }, espacos: espacos, gruposPinos: function (res) { return gruposPinos({ res: res, d: contexto(res, {}) }); }, bordas: bordas, prefixoDe: prefixoDe,
    /* E4 r3: utilidades internas reaproveitadas pelas pranchas da T2 (js/madengt2pranchas.js) — nada do que a T1 faz muda */
    _p: { I: I, PR: PR, PADRAO_ENG: PADRAO_ENG, FAIXA: FAIXA, VERMELHO: VERMELHO, PRETO: PRETO, LAM: LAM, FOLGA_PE: FOLGA_PE, FONTE_MIN: FONTE_MIN, MP: MP, num: num, arr: arr, txt: txt, mm: mm, mmt: mmt, r1: r1, r2: r2, dois: dois, hoje: hoje, pct: pct, sub: sub, dot: dot, mult: mult, unit: unit,
      desenhaveis: desenhaveis, marcar: marcar, classeDe: classeDe, tratDe: tratDe, secTxt: secTxt, planoXY: planoXY, planoXZ: planoXZ, planoYZ: planoYZ, desenharLista: desenharLista, rotular: rotular, limites: limites, caixaPontos: caixaPontos,
      eixosEmPlanta: eixosEmPlanta, lamelas: lamelas, chapa: chapa, pinoVista: pinoVista, legenda: legenda, tabMarcas: tabMarcas, plantaPecas: plantaPeças, tipoChamada: tipoChamada, baseElevacao: baseElevacao, basePlanta: basePlanta,
      vista: vista, celulaDet: celulaDet, ponto: ponto, etaLinha: etaLinha, espacos: espacos, linhaEspacos: linhaEspacos, esp2: esp2, quadroPontos: quadroPontos, nv: nv, lg01: lg01, ladoPilar: ladoPilar, aBase: aBase, chapaLarg: chapaLarg, ferragensT1: ferragens, folhaE10: folhaE10, hh: hh } };
  global.MadEngPranchas = MadEngPranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngPranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

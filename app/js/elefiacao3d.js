/* =====================================================================
 * elefiacao3d.js (EleFiacao3D) — FIOS EM 3D DENTRO DO ELETRODUTO (Elétrica v2, lote L4, 07/11/2026)
 *
 * Cada condutor sai com o Ø externo REAL da seção (catálogo L1: js/elecatalogodados.js, cabo_750v_*) e a cor da função (NBR 5410 6.1.5.3: neutro
 * azul-claro, PE verde-amarelo — aqui LISTRADO —, fase qualquer outra cor: preto/vermelho/branco pela fase A/B/C e retorno cinza, como em
 * js/elecircuitos.js CORES). Os fios formam um FEIXE dentro do DI do eletroduto (empacotamento circular), seguem o eixo REAL do tubo (a curva
 * contínua do corrugado, EleGeo.caminho) e, onde o trecho entra numa CAIXA, saem com uma SOBRA em laço (espiral) de ~15 cm (critério RA, sem-fonte-
 * conferir: a RA orça 30 cm por condutor em js/elecircuitos.js sobraPonto; aqui o laço é só o desenho, dentro do volume da caixa) e a ponta de
 * cobre desencapada.
 *
 * ⚠ NÃO define circuito: LÊ a fiação lógica por trecho. A fonte da tela (fiacaoDe) é a análise do EleCircuitos (circuitos[].cond, a mesma regra de
 *   js/elecircuitos.js condutoresPorTrecho e a mesma que orça o cabo), guardada enquanto o projeto não muda; fiacaoDeEstado(estado) lê só o que está
 *   GRAVADO (Projeto_eletrico do quadro + instalacoes.ligacoes[].fiacao do js/eletilum.js) e fica de reserva — é aproximada (ver o roteiro do defeito).
 *
 * Liga/desliga: "Mostrar fiação" (padrão DESLIGADO, para não pesar) — EleFiacao3D.ligar(true|false) / alternar() / ligada(). Ligada, o eletroduto fica
 * semitransparente. Os meshes entram na cena embrulhando BimInstUI.malhas (sem editar o biminst*), como elementos "marcador" (não entram no
 * quantitativo nem no IFC: o cabo já é orçado por js/elecircuitos.js/eletilum.js).
 *
 * API pura (Node): diametroCabo(secao), condutoresDe(cond, fases, secao, circuito), empacotar(diametros, diMM), ocupacao(conds, diMM), rotulo(conds),
 *   fiacaoDeAnalise(A), fiacaoDeEstado(estado), malhasTrecho(trecho, conds, opcoes), COR, MATERIAL_PBR.
 * Tela: ligar, alternar, ligada, malhas(estado, THREE), instalar.
 * ES5, global + module.exports. Teste: node tools/test-ele-fiacao3d.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  var MM = 0.001;
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function nrmz(a) { var l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
  function pv(p) { return Array.isArray(p) ? p : [num(p.x, 0), num(p.y, 0), num(p.z, 0)]; }
  function perp(d) { var ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return nrmz(cross(ref, d)); }
  function rodrigues(v, eixo, ang) { var c = Math.cos(ang), s = Math.sin(ang); return add(add(mul(v, c), mul(cross(eixo, v), s)), mul(eixo, dot(eixo, v) * (1 - c))); }
  function EG() { return dep("EleGeo", "./elegeo.js"); }
  function CAT() { return dep("EleCatalogoDados", "./elecatalogodados.js"); }
  function TB() { return dep("EleTabelas", "./eletabelas.js"); }

  /* ============================================================ AS CORES (nomes do js/elecircuitos.js CORES → material do FAM_PBR do js/bim.js) */
  var MATERIAL_PBR = {
    preto: "isolação preta", vermelho: "isolação vermelha", branco: "isolação branca", "azul-claro": "isolação azul", "verde-amarelo": "isolação verde-amarela", cinza: "isolação cinza", cobre: "cobre"
  };
  /* o tom de cada cor (os mesmos hex do FAM_PBR; o neutro azul-claro um pouco mais claro que o "isolação azul" da caixa, como é o cabo azul-claro) */
  var COR = { preto: "#1c1c1e", vermelho: "#c0282d", branco: "#eeeeea", "azul-claro": "#3d86d6", "verde-amarelo": "#4fa02a", "amarelo-pe": "#f2c400", cinza: "#8a8d90", cobre: "#b87333" };
  var FASE_COR = { A: "preto", B: "vermelho", C: "branco" };
  var FUNCAO_NOME = { F: "fase", N: "neutro", PE: "proteção (PE)", R: "retorno" };
  var ORDEM = { F: 0, N: 1, PE: 2, R: 3 };

  /* ============================================================ O Ø DO CABO */
  /* Ø externo (mm) do cabo flexível 750 V da seção: catálogo L1 (cabo_750v_<seção>); fora dele, a tabela do fabricante do js/eletabelas.js */
  function diametroCabo(secao) {
    var s = num(secao, 1.5), C = CAT(), id = "cabo_750v_" + String(s).replace(".", "_"), it = C ? C.item(id) : null;
    if (it && it.cotas.diametro_externo_mm) return { mm: it.cotas.diametro_externo_mm, fonte: "catalogo", id: id, nivel: (it.cotas_nivel && it.cotas_nivel.diametro_externo_mm) || it.fonte.nivel };
    var T = TB(), d = T && T.DIAMETRO_CABO && T.DIAMETRO_CABO.mm ? T.DIAMETRO_CABO.mm[s] : null;
    return d ? { mm: d, fonte: "eletabelas", id: null, nivel: "primaria-lida" } : { mm: 1.6 * Math.sqrt(s) + 1.4, fonte: "proporcao", id: null, nivel: "sem-fonte-conferir" };
  }

  /* ============================================================ OS CONDUTORES DE UM TRECHO */
  /* cond = { F, N, PE, R } (nº de condutores por função), fases = "A" | "AB" | "ABC"; devolve a lista, uma entrada por fio */
  function condutoresDe(cond, fases, secao, circuito) {
    var out = [], fz = txt(fases) || "A", d = diametroCabo(secao).mm, i;
    function p(funcao, cor, k) { out.push({ circuito: txt(circuito), secao: num(secao, 1.5), funcao: funcao, cor: cor, d_mm: d, pe: funcao === "PE", ordem: ORDEM[funcao] * 10 + k }); }
    for (i = 0; i < num(cond && cond.F, 0); i++) p("F", FASE_COR[fz.charAt(Math.min(i, fz.length - 1))] || "preto", i);
    for (i = 0; i < num(cond && cond.N, 0); i++) p("N", "azul-claro", i);
    for (i = 0; i < num(cond && cond.PE, 0); i++) p("PE", "verde-amarelo", i);
    for (i = 0; i < num(cond && cond.R, 0); i++) p("R", "cinza", i);
    return out;
  }

  /* ============================================================ A FIAÇÃO LÓGICA (sem recalcular o circuito) */
  function fiacaoDeAnalise(A) {
    var por = {};
    arr(A && A.circuitos).forEach(function (c) {
      var sec = c.dim ? c.dim.secao : null; if (sec == null) return;
      Object.keys(c.cond || {}).forEach(function (t) { (por[t] = por[t] || []).push.apply(por[t], condutoresDe(c.cond[t], c.fases, sec, c.id)); });
    });
    return { porTrecho: por, origem: "analise" };
  }
  function contarFio(c) { var o = { F: 0, N: 0, PE: 0, R: 0 }; txt(c).split(" ").forEach(function (k) { if (!k) return; if (k === "F") o.F++; else if (k === "N") o.N++; else if (k === "T" || k === "PE") o.PE++; else o.R++; }); return o; }
  function fiacaoDeEstado(estado) {
    var por = {}, I = estado && estado.instalacoes ? estado.instalacoes : {}, qd = arr(estado && estado.familias).filter(function (f) { return f && (f.famId === "ele-quadro" || f.famId === "ra-quadro-distribuicao"); })[0], proj = null;
    try { proj = qd && qd.inst && qd.inst.Projeto_eletrico ? JSON.parse(qd.inst.Projeto_eletrico) : null; } catch (e) { proj = null; }
    var circs = {}; arr(proj && proj.circuitos).forEach(function (c) { circs[c.id] = c; });
    var daLig = {};   /* circuito|trecho → { c, secao } do registro da ligação da iluminação (fiação exata do eletroduto da luz) */
    arr(I.ligacoes).forEach(function (r) {
      var cid = txt(r.circuito) || txt(r.id);
      Object.keys(r.fiacao || {}).forEach(function (t) { daLig[cid + "|" + t] = { c: r.fiacao[t].c, secao: num(r.secao, 1.5) }; });
    });
    if (proj && proj.eletrodutos) {
      /* com o projeto gravado, QUEM passa em cada eletroduto é o projeto (js/elecircuitos.js grava a atribuição); a ligação só detalha os condutores da luz */
      Object.keys(proj.eletrodutos).forEach(function (t) {
        var ids = proj.eletrodutos[t]; ids = Array.isArray(ids) ? ids : (ids && Array.isArray(ids.circuitos) ? ids.circuitos : []);
        ids.forEach(function (cid) {
          var c = circs[cid]; if (!c) return;
          var lg = daLig[cid + "|" + t], f2 = txt(c.fases).length === 2, cond = lg ? contarFio(lg.c) : { F: f2 ? 2 : 1, N: f2 ? 0 : 1, PE: 1, R: 0 };
          (por[t] = por[t] || []).push.apply(por[t], condutoresDe(cond, c.fases, c.secao, c.id));
        });
      });
    } else {
      Object.keys(daLig).forEach(function (k) {
        var p = k.split("|"), cid = p[0], t = p.slice(1).join("|"), cj = circs[cid];
        (por[t] = por[t] || []).push.apply(por[t], condutoresDe(contarFio(daLig[k].c), cj ? cj.fases : "A", daLig[k].secao, cid));
      });
    }
    return { porTrecho: por, origem: "estado", aproximada: true };
  }
  /* A FONTE DA TELA: a análise do EleCircuitos (a MESMA que o orçamento do cabo usa; só LÊ — não define circuito nenhum), guardada enquanto o projeto não mudar
     (analisar custa ~0,2 s numa casa). ⚠ Roteiro do defeito: o projeto gravado no quadro (eletrodutos{}) traz o eletroduto a que o circuito PODE ir — o que
     ele de fato usa só a análise diz (C10 aparecia em um eletroduto da cozinha onde só passa o C3). Sem a análise (sem famílias avaliáveis), cai na leitura do estado. */
  var ESTADO = { ligada: false, tubosOpacidade: 0.28, forcada: null };
  var MEMO = { chave: null, fia: null };
  function assinatura(estado) {
    var I = estado && estado.instalacoes ? estado.instalacoes : {}, qd = arr(estado && estado.familias).filter(function (f) { return f && (f.famId === "ele-quadro" || f.famId === "ra-quadro-distribuicao"); })[0];
    return JSON.stringify([arr(I.trechos).map(function (t) { return [t.id, t.dn, t.material, pv(t.p1), pv(t.p2)]; }), qd && qd.inst ? qd.inst.Projeto_eletrico : null,
      arr(estado && estado.familias).length, arr(I.pecas).length, arr(I.ligacoes).map(function (r) { return [r.id, r.circuito, r.fiacao]; })]);
  }
  function fiacaoDe(estado, famAval, opc) {
    opc = opc || {};
    if (opc.fiacao) return opc.fiacao;
    if (ESTADO.forcada) return ESTADO.forcada;
    var chave = null; try { chave = assinatura(estado); } catch (e) { chave = null; }
    if (chave && MEMO.chave === chave && MEMO.fia) return MEMO.fia;
    var EC = dep("EleCircuitos", "./elecircuitos.js"), fia = null;
    if (EC && typeof famAval === "function") { try { var A = EC.analisar({ estado: estado, avaliarFam: famAval }); if (A && A.ok) fia = fiacaoDeAnalise(A); } catch (e2) { fia = null; } }
    if (!fia) fia = fiacaoDeEstado(estado);
    MEMO.chave = chave; MEMO.fia = fia; return fia;
  }

  /* ============================================================ O FEIXE (empacotamento circular simples) */
  /* diametros (mm) na ordem dos fios → { pos:[{x,y,r}] (mm), contido (mm, raio do menor círculo centrado que cobre tudo), cabe, folga, escala } */
  function empacotar(ds, diMM) {
    var n = ds.length, dmax = 0, i, pos = [], R, ang0 = -Math.PI / 2;
    ds.forEach(function (d) { if (d > dmax) dmax = d; });
    function anel(m, raio, k0, fase) { for (var q = 0; q < m && pos.length < n; q++) { var a = ang0 + fase + 2 * Math.PI * q / m; pos.push({ x: raio * Math.cos(a), y: raio * Math.sin(a) }); } }
    if (n === 0) return { pos: [], contido: 0, cabe: true, folga: diMM / 2, escala: 1 };
    if (n === 1) pos.push({ x: 0, y: 0 });
    else if (n <= 6) { R = dmax / (2 * Math.sin(Math.PI / n)); anel(n, R, 0, 0); }
    else {
      pos.push({ x: 0, y: 0 });
      var m1 = Math.min(n - 1, n <= 7 ? 6 : (n <= 9 ? n - 1 : 6)), r1 = Math.max(dmax, dmax / (2 * Math.sin(Math.PI / m1)));
      anel(m1, r1, 0, 0);
      if (pos.length < n) { var resto = n - pos.length, r2 = Math.max(2 * dmax, dmax / (2 * Math.sin(Math.PI / resto)) + (resto > 12 ? dmax : 0)); anel(resto, r2, 0, Math.PI / resto); }
    }
    var cont = 0; for (i = 0; i < pos.length; i++) cont = Math.max(cont, len([pos[i].x, pos[i].y, 0]) + ds[i] / 2);
    var lim = diMM / 2, cabe = cont <= lim + 1e-9, escala = 1;
    if (!cabe) {   /* não cabe: comprime para dentro do DI (os fios se tocam e se sobrepõem) e avisa */
      var maxOff = 0; for (i = 0; i < pos.length; i++) maxOff = Math.max(maxOff, len([pos[i].x, pos[i].y, 0]) + ds[i] / 2);
      escala = Math.max(0.01, (lim - dmax / 2) / Math.max(1e-6, maxOff - dmax / 2));
      for (i = 0; i < pos.length; i++) { pos[i].x *= escala; pos[i].y *= escala; }
    }
    return { pos: pos.map(function (p, k) { return { x: p.x, y: p.y, r: ds[k] / 2 }; }), contido: cont, cabe: cabe, folga: lim - cont, escala: escala };
  }
  /* a ocupação do eletroduto: soma das áreas dos fios ÷ área do DI, contra a taxa da NBR 5410 6.2.11.1.6 a) (EleTabelas.ELETRODUTO.taxa_pct: 53/31/40 %) */
  function ocupacao(conds, diMM) {
    var T = TB(), tx = (T && T.ELETRODUTO && T.ELETRODUTO.taxa_pct) || { 1: 53, 2: 31, 3: 40 }, n = conds.length, a = 0;
    conds.forEach(function (c) { a += Math.PI * c.d_mm * c.d_mm / 4; });
    var A = Math.PI * diMM * diMM / 4, lim = tx[n >= 3 ? 3 : n] || 40;
    return { n: n, areaFios_mm2: a, areaDI_mm2: A, taxa_pct: n ? 100 * a / A : 0, limite_pct: lim, ok: n === 0 || 100 * a / A <= lim + 1e-9 };
  }

  /* o rótulo: "C3 · 2,5 mm² · F/N/PE" (vários circuitos no mesmo eletroduto: um depois do outro) */
  function rotulo(conds) {
    var grupos = [], porC = {};
    conds.forEach(function (c) { var k = c.circuito + "|" + c.secao; if (!porC[k]) { porC[k] = { circuito: c.circuito, secao: c.secao, f: {} }; grupos.push(porC[k]); } porC[k].f[c.funcao] = (porC[k].f[c.funcao] || 0) + 1; });
    return grupos.map(function (g) {
      var fs = Object.keys(g.f).sort(function (a, b) { return ORDEM[a] - ORDEM[b]; }).map(function (f) { return (g.f[f] > 1 ? g.f[f] : "") + f; }).join("/");
      return (g.circuito ? g.circuito + " · " : "") + String(g.secao).replace(".", ",") + " mm² · " + fs;
    }).join("  +  ");
  }

  /* ============================================================ A MALHA DO FIO */
  function Malha() { this.pos = []; this.nrm = []; this.idx = []; this.cascas = []; this.col = null; }
  Malha.prototype.v = function (p, n, c) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); if (c) { this.col = this.col || []; this.col.push(c[0], c[1], c[2]); } return this.pos.length / 3 - 1; };
  Malha.prototype.t = function (a, b, c) { this.idx.push(a, b, c); };
  Malha.prototype.tri = function () { return this.idx.length / 3; };
  Malha.prototype.juntar = function (o) {
    var base = this.pos.length / 3, i;
    for (i = 0; i < o.pos.length; i++) { this.pos.push(o.pos[i]); this.nrm.push(o.nrm[i]); }
    for (i = 0; i < o.idx.length; i++) this.idx.push(o.idx[i] + base);
    if (o.col) { this.col = this.col || []; for (i = 0; i < o.col.length; i++) this.col.push(o.col[i]); }
  };
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }

  /* varre um círculo de raio r ao longo de uma polilinha (transporte paralelo), sólido fechado (tampas planas); listra opcional (verde/amarelo) */
  function varrerPontos(m, pts, r, segs, listra) {
    var n = pts.length, ts = [], i, j;
    if (n < 2) return;
    for (i = 0; i < n; i++) { var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; ts.push(nrmz(sub(b, a))); }
    var us = [perp(ts[0])];
    for (i = 1; i < n; i++) {
      var tp = ts[i - 1], tc = ts[i], eixo = cross(tp, tc), s = len(eixo), c = Math.max(-1, Math.min(1, dot(tp, tc)));
      us.push(s > 1e-9 ? rodrigues(us[i - 1], mul(eixo, 1 / s), Math.acos(c)) : us[i - 1]);
    }
    var cs = [], sn = [];
    for (j = 0; j < segs; j++) { cs.push(Math.cos(2 * Math.PI * j / segs)); sn.push(Math.sin(2 * Math.PI * j / segs)); }
    function anel(k) { var u = us[k], v = cross(ts[k], u), L = []; for (var q = 0; q < segs; q++) { var rad = add(mul(u, cs[q]), mul(v, sn[q])); L.push({ p: add(pts[k], mul(rad, r)), n: rad }); } return L; }
    var rings = []; for (i = 0; i < n; i++) rings.push(anel(i));
    var dist = 0, cA = listra ? hexRgb(listra[0]) : null, cB = listra ? hexRgb(listra[1]) : null;
    for (i = 0; i < n - 1; i++) {
      var A = rings[i], B = rings[i + 1], seg = len(sub(pts[i + 1], pts[i])), cor = listra ? (Math.floor((dist + seg / 2) / (listra[2] * MM)) % 2 ? cB : cA) : null, ia = [], ib = [];
      for (j = 0; j < segs; j++) { ia.push(m.v(A[j].p, A[j].n, cor)); ib.push(m.v(B[j].p, B[j].n, cor)); }
      for (j = 0; j < segs; j++) { var j3 = (j + 1) % segs; m.t(ia[j], ia[j3], ib[j]); m.t(ia[j3], ib[j3], ib[j]); }
      dist += seg;
    }
    /* tampas planas */
    [[0, -1], [n - 1, 1]].forEach(function (q) {
      var k = q[0], R = rings[k], nn = mul(ts[k], q[1]), cc = listra ? cA : null, c0 = m.v(pts[k], nn, cc), ids = [];
      for (j = 0; j < segs; j++) ids.push(m.v(R[j].p, nn, cc));
      for (j = 0; j < segs; j++) { var j3 = (j + 1) % segs; if (q[1] < 0) m.t(c0, ids[j3], ids[j]); else m.t(c0, ids[j], ids[j3]); }
    });
  }

  function densificar(pts, passo) {
    var out = [pts[0]], i, k;
    for (i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], L = len(sub(b, a)), n = Math.max(1, Math.ceil(L / passo));
      for (k = 1; k <= n; k++) out.push(add(a, mul(sub(b, a), k / n)));
    }
    return out;
  }
  /* a SOBRA em laço (espiral) na ponta que entra na caixa: parte do fio (posição + deslocamento do feixe) e enrola em volta do eixo do tubo */
  function laco(Pend, tOut, off, U, V, idx, sobra) {
    var pts = [], n = 26, adv = 0.032, rho = 0.011 + 0.0021 * idx, phi0 = Math.atan2(dot(off, V), dot(off, U)), r0 = len(off);
    var turns = Math.sqrt(Math.max(0.0004, sobra * sobra - adv * adv)) / (2 * Math.PI * rho);
    for (var k = 1; k <= n; k++) {
      var sg = k / n, w = Math.min(1, sg * 4); w = w * w * (3 - 2 * w);
      var phi = phi0 + 2 * Math.PI * turns * sg, rr = (1 - w) * r0 + w * rho;
      pts.push(add(add(Pend, mul(tOut, adv * sg)), add(mul(U, rr * Math.cos(phi)), mul(V, rr * Math.sin(phi)))));
    }
    return pts;
  }

  /* ============================================================ OS FIOS DE UM TRECHO
     t = trecho do biminst { id, material, dn, p1, p2 }; conds = condutoresDe(...) (todos os circuitos do eletroduto).
     opcoes: { lod, sobra (m, 0,15), semLaco }. Devolve { id, rotulo, partes:[{cor, malha}], empacotamento, ocupacao, cotas, tris, lacos } */
  /* revisão 07/11/2026 (item 13): a fiação media +525 mil triângulos na casa de cenário com 10 lados no fio; 6 lados (hexágono) bastam para um fio de 1,5 a 6 mm² e a fiação tem teto (TETO_TRIS) */
  var SEGS_FIO = 6, TETO_TRIS = 150000, PARCIAL = { parcial: false, mostrados: 0, total: 0, tris: 0 };
  function malhasTrecho(t, conds, opcoes) {
    opcoes = opcoes || {};
    var G = EG(), cam = null, c = null, P1 = pv(t.p1), P2 = pv(t.p2);
    if (G) { try { cam = G.caminho(t, {}); c = G.cotas(t.material, t.dn); } catch (e) { cam = null; } }
    if (!cam && G) { cam = G._montarCaminho(P1, P2, null, null); }
    if (!cam) return null;
    var di = c ? c.di : num(t.dn, 20) * 0.8;
    conds = conds.slice().sort(function (a, b) { return a.ordem - b.ordem || (a.circuito < b.circuito ? -1 : (a.circuito > b.circuito ? 1 : 0)); });
    var emp = empacotar(conds.map(function (x) { return x.d_mm; }), di), oc = ocupacao(conds, di);
    var segs = SEGS_FIO, partes = {}, tris = 0, lacos = 0, sobra = num(opcoes.sobra, 0.15);
    function mal(cor) { return partes[cor] || (partes[cor] = new Malha()); }
    var cx0 = G && !opcoes.semLaco ? G.caixaEm(P1) : null, cx1 = G && !opcoes.semLaco ? G.caixaEm(P2) : null;
    conds.forEach(function (w, i) {
      var pp = emp.pos[i], r = pp.r * MM, off2 = [pp.x * MM, pp.y * MM], pts = [], k;
      var f0 = cam.em(0), fL = cam.em(cam.L);
      cam.marcas.forEach(function (s) { var f = cam.em(s); pts.push(add(f.p, add(mul(f.u, off2[0]), mul(f.v, off2[1])))); });
      var m = new Malha(), pesca = w.pe;
      var ini = null, fim = null;
      if (cx0) {
        var o0 = add(mul(f0.u, off2[0]), mul(f0.v, off2[1])), lc = laco(f0.p, mul(f0.t, -1), o0, f0.u, f0.v, i, sobra);
        pts = lc.slice().reverse().concat(pts); lacos++; ini = lc[lc.length - 1];
      }
      if (cx1) {
        var o1 = add(mul(fL.u, off2[0]), mul(fL.v, off2[1])), lc1 = laco(fL.p, fL.t, o1, fL.u, fL.v, i, sobra);
        pts = pts.concat(lc1); lacos++; fim = lc1[lc1.length - 1];
      }
      /* sem laço, o fio avança 8 mm para fora da boca do tubo? não: termina rente (o vizinho continua dele) */
      if (pesca) pts = densificar(pts, 0.025);   /* o PE listrado precisa de anéis a cada faixa */
      varrerPontos(m, pts, r, segs, pesca ? [COR["verde-amarelo"], COR["amarelo-pe"], 25] : null);
      var cor = pesca ? "verde-amarelo" : w.cor;
      mal(cor).juntar(m);
      /* a ponta de cobre desencapada no fim do laço */
      [[ini, 0], [fim, 1]].forEach(function (q) {
        if (!q[0]) return;
        var np = pts.length, a = q[1] ? pts[np - 2] : pts[1], b = q[1] ? pts[np - 1] : pts[0], dir = nrmz(sub(b, a)), mc = new Malha();
        varrerPontos(mc, [b, add(b, mul(dir, 0.007))], r * 0.55, 6, null); mal("cobre").juntar(mc);
      });
    });
    var out = [];
    Object.keys(partes).forEach(function (cor) { tris += partes[cor].tri(); out.push({ cor: cor, malha: partes[cor], listrado: cor === "verde-amarelo" }); });
    return { id: "fio-" + t.id, trecho: t.id, rotulo: rotulo(conds), partes: out, empacotamento: emp, ocupacao: oc, cotas: c, tris: tris, lacos: lacos, condutores: conds.length, cam: cam };
  }

  /* ============================================================ LIGAR / DESLIGAR */
  /* usa ESTA fiação lógica no lugar da lida do projeto (prova visual e testes); forcar(null) volta ao normal */
  function forcar(fia) { ESTADO.forcada = fia || null; return !!ESTADO.forcada; }
  function ligada() { return !!ESTADO.ligada; }
  function ligar(on) {
    ESTADO.ligada = on === undefined ? true : !!on;
    if (!ESTADO.ligada) { Object.keys(VIDRO).forEach(function (k) { try { if (VIDRO[k] && VIDRO[k].dispose) VIDRO[k].dispose(); } catch (e) {} }); VIDRO = {}; }
    try { var b = global.BIM; if (b && b.editarReconstruir) b.editarReconstruir(); } catch (e) {}
    return ESTADO.ligada;
  }
  function alternar() { return ligar(!ESTADO.ligada); }

  /* ============================================================ NA CENA (THREE) */
  var MATS = null, VIDRO = {};
  function material(THREE, cor, listrado) {
    var k = cor + (listrado ? "|v" : "");
    if (!MATS || MATS.THREE !== THREE) MATS = { THREE: THREE, m: {} };
    if (MATS.m[k]) return MATS.m[k];
    var o = cor === "cobre" ? { color: new THREE.Color(COR.cobre), roughness: 0.3, metalness: 1, side: THREE.DoubleSide }
                            : { color: new THREE.Color(listrado ? "#ffffff" : COR[cor]), roughness: 0.45, metalness: 0, side: THREE.DoubleSide };
    if (listrado) o.vertexColors = true;
    var M = new THREE.MeshStandardMaterial(o); M.name = "ele-fio:" + cor; M.userData.eleFio = true;
    MATS.m[k] = M; return M;
  }
  function geometria(THREE, ml) {
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ml.pos), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(ml.nrm), 3));
    if (ml.col) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(ml.col), 3));
    g.setIndex(ml.idx); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  /* os elementos da cena de TODOS os eletrodutos com fiação: [{ id, malhas:[Mesh], marcador:true, fiacao:true, nome }] */
  function malhas(estado, THREE, opcoes) {
    opcoes = opcoes || {};
    var G = EG(), R = opcoes.rede || (G && G.redeAtual && G.redeAtual()), out = [];
    if (!estado || !THREE || !R) return out;
    var fi = fiacaoDe(estado, opcoes.famAval, opcoes), porT = {};
    arr(R.trechos).forEach(function (t) { porT[t.id] = t; });
    /* TETO (item 13): os trechos mais perto do foco da vista (o ambiente selecionado, ou o alvo da câmera) entram primeiro; passou de TETO_TRIS, o resto não é desenhado e a tela avisa */
    var foco = opcoes.foco || focoDeVista(estado), teto = num(opcoes.teto, TETO_TRIS), usado = 0, ids = Object.keys(fi.porTrecho).filter(function (id) { return porT[id] && /^elet_/.test(porT[id].material || ""); });
    function dFoco(id) { var t = porT[id], a = pv(t.p1), b = pv(t.p2); return foco ? len(sub([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], foco)) : 0; }
    if (foco) ids.sort(function (x, y) { return dFoco(x) - dFoco(y); });
    PARCIAL = { parcial: false, mostrados: 0, total: ids.length, tris: 0 };
    ids.forEach(function (id) {
      var t = porT[id];
      if (usado >= teto) { PARCIAL.parcial = true; return; }
      var r = malhasTrecho(t, fi.porTrecho[id], { lod: opcoes.lod });
      if (!r || !r.partes.length) return;
      usado += r.tris; PARCIAL.mostrados++; PARCIAL.tris = usado;
      var ms = r.partes.map(function (p) {
        var m = new THREE.Mesh(geometria(THREE, p.malha), material(THREE, p.cor, p.listrado));
        m.name = "fio:" + id; m.userData.eleFiacao = { trecho: id, rotulo: r.rotulo, cor: p.cor }; m.userData.rotulo = "Fiação · " + r.rotulo; return m;
      });
      out.push({ id: "fio-" + id, malhas: ms, marcador: true, fiacao: true, ifc: "IFCCABLESEGMENT", disciplina: "eletrica", nome: "Fiação · " + r.rotulo + " (eletroduto " + id + ")", qto: {}, rotulo: r.rotulo, ocupacao: r.ocupacao });
    });
    if (PARCIAL.parcial) PARCIAL.aviso = "fiação mostrada só em parte (" + PARCIAL.mostrados + " de " + PARCIAL.total + " eletrodutos): selecione um ambiente";
    return out;
  }
  /* o foco da vista: o centro do ambiente selecionado (BIM.selecao) ou o alvo da câmera (BIM.cameraAtual); null = sem prioridade */
  function focoDeVista(estado) {
    try {
      var B = global.BIM, sel = B && B.selecao ? arr(B.selecao().uids) : [], amb = arr(estado && estado.ambientes).filter(function (a) { return a && sel.indexOf(a.id) >= 0 && arr(a.pts).length; })[0];
      if (amb) { var n = amb.pts.length, sx = 0, sz = 0; amb.pts.forEach(function (p) { sx += num(p[0], 0); sz += num(p[1], 0); }); return [sx / n, num(amb.base, 1.2) + 1, sz / n]; }
      var c = B && B.cameraAtual ? B.cameraAtual() : null, al = c && (c.alvo || c.target);
      if (al) return pv(al);
    } catch (e) {}
    return null;
  }
  /* o eletroduto semitransparente enquanto a fiação está ligada (clona o material: o cache do biminstui é compartilhado) */
  function tubosTransparentes(out) {
    var clones = VIDRO;   /* B3 (revisão): clonado UMA vez por material e reaproveitado; ligar(false) descarta */
    out.forEach(function (e) {
      if (e.marcador || e.ifc !== "IFCCABLECARRIERSEGMENT") return;
      (e.malhas || []).forEach(function (m) {
        var mt = m.material; if (!mt || !mt.clone) return;
        var c = clones[mt.uuid] || (clones[mt.uuid] = (function () { var q = mt.clone(); q.transparent = true; q.opacity = ESTADO.tubosOpacidade; q.depthWrite = false; q.userData = q.userData || {}; q.userData.eleTuboVidro = true; return q; })());
        m.material = c;
      });
    });
  }
  function instalar() {
    var U = global.BimInstUI; if (!U || typeof U.malhas !== "function" || U.malhas._eleFiacao) return false;
    var orig = U.malhas;
    var emb = function (st, famAval, THREE) {
      var out = orig.apply(this, arguments);
      if (ESTADO.ligada && out && out.length) { try { tubosTransparentes(out); malhas(st, THREE, { famAval: famAval }).forEach(function (e) { out.push(e); });
        if (PARCIAL.parcial && PARCIAL.aviso !== ESTADO.avisado) { ESTADO.avisado = PARCIAL.aviso; if (global.UI && global.UI.toast) global.UI.toast(PARCIAL.aviso, "warn"); } else if (!PARCIAL.parcial) ESTADO.avisado = null;
      } catch (e) {} }
      return out;
    };
    emb._eleFiacao = true; U.malhas = emb; return true;
  }

  var EleFiacao3D = { VERSAO: 1, COR: COR, MATERIAL_PBR: MATERIAL_PBR, FASE_COR: FASE_COR, FUNCAO_NOME: FUNCAO_NOME, diametroCabo: diametroCabo, condutoresDe: condutoresDe, empacotar: empacotar, ocupacao: ocupacao,
                      rotulo: rotulo, fiacaoDeAnalise: fiacaoDeAnalise, fiacaoDeEstado: fiacaoDeEstado, fiacaoDe: fiacaoDe, malhasTrecho: malhasTrecho, ligar: ligar, alternar: alternar, ligada: ligada, forcar: forcar,
                      malhas: malhas, instalar: instalar, parcial: function () { return PARCIAL; }, SEGS_FIO: SEGS_FIO, TETO_TRIS: TETO_TRIS, Malha: Malha, _varrerPontos: varrerPontos };
  global.EleFiacao3D = EleFiacao3D;
  if (typeof module !== "undefined" && module.exports) module.exports = EleFiacao3D;
  try { instalar(); } catch (eI) {}
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

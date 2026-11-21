/* =====================================================================
 * metalmontlista.js — LISTA DE MONTAGEM da estrutura metálica (motor PURO,
 * ES5, sem DOM, Node-testável). 21/11/2026.
 *
 * Pedido do Rogério: "faz os parafusos e a lista de montagem agora" — a lista
 * que vai para a fábrica e para a obra, agrupada por MARCA DE MONTAGEM (o
 * tipo do elemento: PT-1 pilar, TS-1 tesoura, TR-1 terça, CV-1 contravento…).
 *
 *   montar(estado, op) → { ok, marcas[], fixacao[], reserva[], soldas[],
 *                          fases[], totais, avisos }
 *     estado = { caixas } (o modelo); op = { reserva (fração, padrão 0,05),
 *                posicoes (z dos eixos, m), x0, vao }
 *   Por marca: quantidade (elementos), peças que a compõem (perfil,
 *   comprimento, massa), massa total, FASE de montagem e LOCALIZAÇÃO
 *   (eixo × fila).
 *   Fixação: parafuso, porca, arruela e chumbador — a MESMA conta da Relação
 *   fábrica: js/metalfab.js listas().parafusos → js/metalfixacao.js
 *   itensDoGrupo() (as duas listas não podem divergir: conferirRelacao()
 *   prova, teste tools/test-metal-parafusos.js [8]); total, por fase e por
 *   ligação; massa do catálogo (fabricante ou geometria, como lá).
 *   RESERVA DE OBRA: um acréscimo (5 % de partida, arredondado para cima)
 *   em lista SEPARADA e rotulada — não entra na quantidade do modelo nem na
 *   Relação fábrica.
 *
 * SEQUÊNCIA DE MONTAGEM (prática de montagem de galpão, editável):
 *   1 chumbadores → 2 pilares e colunas → 3 contraventos verticais e escoras
 *   → 4 tesouras → 5 contraventos da cobertura → 6 terças → 7 mãos-francesas
 *   → 8 correntes → 9 telhas e arremates.
 *
 * Teste: node tools/test-metal-parafusos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Fab() { return dep("BimMetalFab", "./metalfab.js"); }
  function FX() { return dep("BimMetalFixacao", "./metalfixacao.js"); }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), p = s.split("."); return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  var FASES = [
    { n: 1, nome: "Chumbadores" }, { n: 2, nome: "Pilares e colunas" }, { n: 3, nome: "Contraventos verticais e escoras" }, { n: 4, nome: "Tesouras" },
    { n: 5, nome: "Contraventos da cobertura" }, { n: 6, nome: "Terças" }, { n: 7, nome: "Mãos-francesas" }, { n: 8, nome: "Correntes" }, { n: 9, nome: "Telhas e arremates" }
  ];
  var ROT_SEQ = "sequência de montagem: prática de montagem de galpão (chumbadores → pilares → contraventos verticais → tesouras → contraventos de cobertura → terças → correntes → telhas), editável";
  var ROT_RES = "Reserva de obra";
  function faseNome(n) { for (var i = 0; i < FASES.length; i++) if (FASES[i].n === n) return FASES[i].nome; return "Outros"; }
  /* a fase de um elemento pela categoria (elemMetal.cat) e, no contravento, pelo papel da peça */
  function faseDe(cat, papel) {
    var p = txt(papel).toLowerCase();
    if (cat === "pilar" || cat === "tapamento" || cat === "coluna") return 2;
    if (cat === "escora") return 3;
    if (cat === "contravento") return /cobertura|telhado|treli/.test(p) ? 5 : 3;   /* o vertical ENTRE TRELIÇAS sobe com as tesouras (fase da cobertura) */
    if (cat === "tesoura" || cat === "viga") return 4;
    if (cat === "terca") return 6;
    if (cat === "maoFrancesa") return 7;
    if (cat === "corrente") return 8;
    return 9;
  }
  var LIG_NOME = { placaBase: "Placa de base", placaBaseColuna: "Placa de base da coluna", clipTerca: "Clip de terça", noTrelica: "Nó de treliça (chapa de nó)", maoFrancesa: "Mão-francesa", porcaBarra: "Ponta da barra redonda (contravento)", barraRedonda: "Contravento em barra redonda" };
  function ligNome(slot) { var k = txt(slot).replace(/^lig:/, ""); return LIG_NOME[k] || k || "Avulsa"; }
  function faseParafuso(c) {
    var m = c.metal, e = c.elemMetal || {}, sl = txt(e.slot);
    if (m.chumbador) return 1;
    if (/clipTerca/.test(sl)) return 6;
    if (/maoFrancesa/.test(sl)) return 7;
    if (/noTrelica/.test(sl)) return 4;
    if (/porcaBarra/.test(sl)) return faseDe("contravento", e.rot === "Contravento" ? "" : e.rot);
    return faseDe(e.cat, e.rot);
  }

  /* localização: eixo (pórtico, ao longo do comprimento) × fila (A à esquerda do vão, B à direita) */
  function eixosDe(z0, z1, pos) {
    var dentro = []; pos.forEach(function (z, i) { if (z >= z0 - 0.35 && z <= z1 + 0.35) dentro.push(i + 1);   /* 0,35 m: a placa e o chumbador ficam fora do eixo, na largura da coluna */ });
    if (dentro.length === 1) return "eixo " + dentro[0];
    if (dentro.length > 1) return "eixos " + dentro[0] + "–" + dentro[dentro.length - 1];
    var a = 0; pos.forEach(function (z, i) { if (z < z0) a = i + 1; }); return a && a < pos.length ? "entre eixos " + a + "–" + (a + 1) : "fora dos eixos";
  }
  function filaDe(x0, x1, X0, B) {
    if (!(B > 0)) return "";
    var m = X0 + B / 2;
    if (x0 < m - 0.3 && x1 > m + 0.3) return "filas A–B";
    return (x0 + x1) / 2 < m ? "fila A" : "fila B";
  }

  function grupoDe(c) {
    var m = c.metal;
    return { tipo: m.papel, diametro: m.id, comprimento: m.Lmm, classe: m.classe, quantidade: m.soPorca ? 0 : 1, porcas: m.soPorca ? num(m.soPorca, 1) : 1 + num(m.porcaNivel, 0), arruelas: num(m.arrCabeca, 0) + num(m.arrPorca, 0) };
  }

  function montar(estado, op) {
    op = op || {};
    var avisos = [], F = Fab(), X = FX();
    if (!F || !X) return { ok: false, motivo: "Os motores da fabricação (js/metalfab.js, js/metalfixacao.js) não carregaram." };
    var cx = arr(estado && estado.caixas).filter(function (c) { return c && !c.andaime; });
    var reserva = Math.max(0, num(op.reserva, 0.05));
    /* eixos e vão: do pórtico (porticoInfo) ou da opção */
    var pos = arr(op.posicoes), X0 = num(op.x0, NaN), B = num(op.vao, NaN), Z0 = num(op.z0, 0);
    if (!pos.length) cx.forEach(function (c) { var pi = c.porticoInfo && c.porticoInfo.par; if (!pos.length && pi) { pos = arr(pi.posicoes); X0 = num(pi.x0, 0); Z0 = num(pi.z0, 0); B = num(pi.vao, NaN); } });
    pos = pos.map(function (z) { return num(z, 0) + Z0; });
    if (!pos.length) { var zs = {}; cx.forEach(function (c) { if (c.elemMetal && /^k(\d+):/.test(txt(c.elemMetal.el))) { var k = +/^k(\d+):/.exec(c.elemMetal.el)[1]; zs[k] = zs[k] == null ? c.cz : zs[k]; } }); Object.keys(zs).sort(function (a, b) { return a - b; }).forEach(function (k) { pos.push(zs[k]); }); }
    if (!isFinite(X0) || !isFinite(B)) { var xs = []; cx.forEach(function (c) { if (c.elemMetal && c.elemMetal.cat === "pilar") xs.push(c.cx); }); if (xs.length) { X0 = Math.min.apply(null, xs); B = Math.max.apply(null, xs) - X0; } }

    /* ---------------- MARCAS DE MONTAGEM: elementos agrupados pelo tipo */
    var porTipo = {}, ordemT = [];
    cx.forEach(function (c) {
      if (c.tipo !== "metal" || !c.metal || c.metal.kind === "parafuso") return;
      var e = c.elemMetal; if (!e || !e.tipo) return;
      if (!porTipo[e.tipo]) { porTipo[e.tipo] = { marca: e.tipo, cat: e.cat, rot: e.rot, els: {}, ordem: [], massa: 0 }; ordemT.push(e.tipo); }
      var T = porTipo[e.tipo]; if (!T.els[e.el]) { T.els[e.el] = { pecas: [], x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; T.ordem.push(e.el); }
      var E = T.els[e.el]; E.pecas.push(c); T.massa += num(c.massa, 0);
      var hx = num(c.comprimento, 0) / 2, hz = num(c.espessura, 0) / 2;
      if (c.cx - hx < E.x0) E.x0 = c.cx - hx; if (c.cx + hx > E.x1) E.x1 = c.cx + hx; if (c.cz - hz < E.z0) E.z0 = c.cz - hz; if (c.cz + hz > E.z1) E.z1 = c.cz + hz;
      if (!T.papel && !e.anexo) T.papel = c.metal.papel;
    });
    var Bm = BM();
    var marcas = ordemT.map(function (k) {
      var T = porTipo[k], rep = T.els[T.ordem[0]], comp = {}, ordC = [];
      rep.pecas.forEach(function (c) {
        var m = c.metal, perfil = m.kind === "perfil" ? txt(m.perfil && (m.perfil.cat || m.perfil.forma)) : m.kind === "chapa" ? "Chapa " + br(num(m.t, 0) * 1000, 2) + " mm" : txt(m.papel);
        var L = m.kind === "perfil" ? num(m.L, 0) : m.kind === "chapa" && m.dim ? Math.max(num(m.dim.L, 0), num(m.dim.B, 0)) : 0;
        var kk = m.papel + "|" + perfil + "|" + Math.round(L * 1000);
        if (!comp[kk]) { comp[kk] = { papel: m.papel, perfil: perfil, comprimento: r3(L), qtd: 0, massaUn: r2(num(c.massa, 0)) }; ordC.push(kk); }
        comp[kk].qtd++;
      });
      var locs = {}, ordL = [];
      T.ordem.forEach(function (el) { var E = T.els[el], s = eixosDe(E.z0, E.z1, pos) + (filaDe(E.x0, E.x1, X0, B) ? ", " + filaDe(E.x0, E.x1, X0, B) : ""); if (!locs[s]) { locs[s] = 0; ordL.push(s); } locs[s]++; });
      var fase = faseDe(T.cat, T.papel);
      return { marca: T.marca, descricao: T.rot || T.papel || T.cat, cat: T.cat, quantidade: T.ordem.length, pecas: ordC.map(function (q) { return comp[q]; }), massaUn: r2(T.massa / T.ordem.length), massaTotal: r2(T.massa),
               fase: fase, faseNome: faseNome(fase), local: ordL.slice(0, 6).map(function (s) { return locs[s] > 1 ? s + " (" + locs[s] + ")" : s; }).join("; ") + (ordL.length > 6 ? "; …" : "") };
    });
    /* chumbadores: marca CH por diâmetro × comprimento (fase 1) */
    var ch = {}, ordCh = [];
    cx.forEach(function (c) { if (!c.metal || c.metal.kind !== "parafuso" || !c.metal.chumbador) return; var k = c.metal.id + "|" + c.metal.Lmm; if (!ch[k]) { ch[k] = { id: c.metal.id, L: c.metal.Lmm, n: 0, massa: 0, locs: {} }; ordCh.push(k); } ch[k].n++; ch[k].massa += num(c.massa, 0); ch[k].locs[eixosDe(c.cz, c.cz, pos) + ", " + filaDe(c.cx, c.cx, X0, B)] = 1; });
    ordCh.forEach(function (k, i) { var q = ch[k]; marcas.push({ marca: "CH-" + (i + 1), descricao: "Chumbador " + q.id + " × " + br(q.L, 1) + " mm (2 porcas + arruela)", cat: "chumbador", quantidade: q.n, pecas: [{ papel: "Chumbador", perfil: q.id, comprimento: r3(q.L / 1000), qtd: 1, massaUn: r2(q.massa / q.n) }], massaUn: r2(q.massa / q.n), massaTotal: r2(q.massa), fase: 1, faseNome: faseNome(1), local: Object.keys(q.locs).slice(0, 6).join("; ") + (Object.keys(q.locs).length > 6 ? "; …" : "") }); });
    /* telhas e arremates (fase 9) */
    var ved = {}, ordV = [];
    cx.forEach(function (c) { if (c.tipo !== "vedacao" || !c.vedacao) return; var k = txt(c.vedacao.papel); if (!ved[k]) { ved[k] = { n: 0, massa: 0, area: 0, nome: c.vedacao.telha && c.vedacao.telha.nome || "" }; ordV.push(k); } ved[k].n++; ved[k].massa += num(c.massa, 0); ved[k].area += num(c.vedacao.area, 0); });
    ordV.forEach(function (k, i) { var q = ved[k]; marcas.push({ marca: "TL-" + (i + 1), descricao: k + (q.nome ? " — " + q.nome : "") + (q.area ? " (" + br(q.area, 1) + " m²)" : ""), cat: "vedacao", quantidade: q.n, pecas: [], massaUn: r2(q.massa / q.n), massaTotal: r2(q.massa), fase: 9, faseNome: faseNome(9), local: "cobertura e fechamento" }); });
    var nat = function (m) { var q = /^(.*?)(\d+)$/.exec(m); return q ? [q[1], +q[2]] : [m, 0]; };
    marcas.sort(function (a, b) { var x = nat(a.marca), y = nat(b.marca); return a.fase - b.fase || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]); });

    /* ---------------- FIXAÇÃO: a conta da Relação fábrica (metalfab listas → metalfixacao itensDoGrupo) */
    var nm = F.numerar({ caixas: cx }), L = F.listas({ caixas: cx }, nm), fx = {}, ordF = [];
    function soma(it, q, fase, lig) {
      var k = it.chave; if (!fx[k]) { fx[k] = { chave: k, tipo: it.tipo, descricao: it.descricao, qtd: 0, massaUn: it.massa_kg, massaTotal: 0, estado: it.estado, obs: it.obs || "", porFase: {}, porLigacao: {} }; ordF.push(k); }
      if (fase == null) { fx[k].qtd += q; if (it.massa_kg != null) fx[k].massaTotal += it.massa_kg * q; }
      else { fx[k].porFase[fase] = (fx[k].porFase[fase] || 0) + q; fx[k].porLigacao[lig] = (fx[k].porLigacao[lig] || 0) + q; }
    }
    arr(L.parafusos).forEach(function (g) {
      if (/^Porca e arruela do tirante/.test(txt(g.tipo))) { if (g.porcas > 0) soma({ chave: "tirante|" + g.diametro, tipo: "porca", descricao: "PORCA SEXTAVADA " + txt(g.diametro), massa_kg: null, estado: "ok" }, g.porcas); return; }
      X.itensDoGrupo(g).forEach(function (it) { if (it.tipo !== "chumbador-acessorio" && it.qtd != null) soma(it, it.qtd); });
    });
    cx.forEach(function (c) {
      if (!c.metal || c.metal.kind !== "parafuso") return;
      var fs = faseNome(faseParafuso(c)), lg = ligNome(c.elemMetal && c.elemMetal.slot);
      X.itensDoGrupo(grupoDe(c)).forEach(function (it) { if (it.tipo !== "chumbador-acessorio" && it.qtd != null && fx[it.chave]) soma(it, it.qtd, fs, lg); });
    });
    var ordemTipo = { parafuso: 1, chumbador: 2, porca: 3, arruela: 4 };
    var fixacao = ordF.map(function (k) { var x = fx[k]; x.massaTotal = r3(x.massaTotal); return x; }).sort(function (a, b) { return (ordemTipo[a.tipo] || 9) - (ordemTipo[b.tipo] || 9) || (a.descricao < b.descricao ? -1 : 1); });
    var rotRes = ROT_RES + " (" + br(reserva * 100, 0) + " % sobre o modelo, arredondado para cima — prática de montagem, editável; NÃO entra na Relação fábrica)";
    var res = reserva > 0 ? fixacao.filter(function (x) { return x.qtd > 0; }).map(function (x) { return { chave: x.chave, tipo: x.tipo, descricao: x.descricao, qtd: Math.max(1, Math.ceil(x.qtd * reserva - 1e-9)), rotulo: rotRes }; }) : [];
    fixacao.forEach(function (x) { if (x.estado && x.estado !== "ok") avisos.push(x.descricao + ": " + x.estado + (x.obs ? " (" + x.obs + ")" : "")); });

    /* ---------------- SOLDAS (estrutura soldada: o cordão no lugar do parafuso) */
    var sd = {}, ordS = [], N = dep("BimMetalNorma", "./metalnorma.js");
    cx.forEach(function (c) {
      var m = c.metal; if (!m) return;
      [m.solda, m.soldaMont].forEach(function (s, i) {
        if (!s || !N) return;
        var k = (i ? "Clip soldado na terça" : txt(m.papel)) + "|" + N.soldaRotulo(s);
        if (!sd[k]) { sd[k] = { ligacao: i ? "Clip de terça soldado na terça" : txt(m.papel) + (m.soldadaEm ? " soldada no apoio" : ""), cordao: N.soldaRotulo(s), n: 0, comprimento: 0 }; ordS.push(k); }
        sd[k].n++; sd[k].comprimento += num(s.comprimento, 0) * (s.lados === "ambos" ? 2 : 1);
      });
    });
    var soldas = ordS.map(function (k) { var s = sd[k]; s.comprimento = r2(s.comprimento); return s; });

    var fasesR = FASES.map(function (f) { var ms = marcas.filter(function (m) { return m.fase === f.n; }); return { n: f.n, nome: f.nome, marcas: ms.map(function (m) { return m.marca; }), massa: r2(ms.reduce(function (s, m) { return s + m.massaTotal; }, 0)) }; }).filter(function (f) { return f.marcas.length; });
    var aco = marcas.filter(function (m) { return m.cat !== "vedacao"; }).reduce(function (s, m) { return s + (m.cat === "chumbador" ? 0 : m.massaTotal); }, 0);
    var fixKg = fixacao.reduce(function (s, x) { return s + x.massaTotal; }, 0);
    return { ok: true, marcas: marcas, fixacao: fixacao, reserva: res, soldas: soldas, fases: fasesR, rotuloSequencia: ROT_SEQ, rotuloReserva: rotRes,
             totais: { marcas: marcas.length, elementos: marcas.reduce(function (s, m) { return s + m.quantidade; }, 0), acoKg: r2(aco), fixacaoKg: r2(fixKg), parafusos: fixacao.filter(function (x) { return x.tipo === "parafuso"; }).reduce(function (s, x) { return s + x.qtd; }, 0) },
             avisos: avisos.concat(arr(L.avisos)) };
  }

  /* a fixação da lista = a da Relação fábrica (parte 2), linha a linha pela descrição */
  function conferirRelacao(lm, rel) {
    var a = {}, b = {}, dif = [], linhas = 0;
    arr(lm && lm.fixacao).forEach(function (x) { if (x.qtd > 0) a[x.descricao] = (a[x.descricao] || 0) + x.qtd; });
    arr(rel && rel.parte2).forEach(function (x) { if (/^(parafuso|chumbador|porca|arruela)$/.test(txt(x.tipo)) && x.qtd > 0) b[x.descricao] = (b[x.descricao] || 0) + x.qtd; });
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) { if (a[k] === undefined && b[k] === undefined) return; linhas++; if (a[k] !== b[k]) dif.push(k + ": montagem " + (a[k] || 0) + " × fábrica " + (b[k] || 0)); a[k] = b[k] = undefined; });
    return { ok: dif.length === 0 && linhas > 0, linhas: linhas, dif: dif };
  }

  /* ------------------------------------------------ tela e documento */
  function html(R, info) {
    info = info || {};
    var h = '<div data-mml="lista">';
    if (info.obra) h += '<p style="margin:0 0 6px"><b>' + esc(info.obra) + "</b></p>";
    h += '<p style="font-size:12px;margin:0 0 6px">' + R.totais.marcas + " marcas, " + R.totais.elementos + " elementos, " + br(R.totais.acoKg, 0) + " kg de aço, " + R.totais.parafusos + " parafusos (" + br(R.totais.fixacaoKg, 1) + " kg de fixação). <i>" + esc(R.rotuloSequencia) + "</i></p>";
    h += '<h4 style="margin:8px 0 4px;font-size:13px">Marcas de montagem (na ordem de montagem)</h4><table class="tbl tbl-compacta" data-mml="marcas"><thead><tr><th>Fase</th><th>Marca</th><th>Descrição</th><th class="num">Qtde</th><th>Peças (perfil × comprimento)</th><th class="num">Massa un. (kg)</th><th class="num">Massa total (kg)</th><th>Localização</th></tr></thead><tbody>' +
      R.marcas.map(function (m) { return '<tr data-marca="' + esc(m.marca) + '"><td>' + m.fase + " · " + esc(m.faseNome) + "</td><td><b>" + esc(m.marca) + "</b></td><td>" + esc(m.descricao) + '</td><td class="num">' + m.quantidade + "</td><td>" + m.pecas.slice(0, 6).map(function (p) { return p.qtd + "× " + esc(p.perfil) + (p.comprimento ? " × " + br(p.comprimento * 1000, 0) + " mm" : ""); }).join("<br>") + (m.pecas.length > 6 ? "<br>…" : "") + '</td><td class="num">' + br(m.massaUn, 1) + '</td><td class="num">' + br(m.massaTotal, 1) + "</td><td>" + esc(m.local) + "</td></tr>"; }).join("") + "</tbody></table>";
    var fasesF = []; R.fixacao.forEach(function (x) { Object.keys(x.porFase).forEach(function (f) { if (fasesF.indexOf(f) < 0) fasesF.push(f); }); });
    h += '<h4 style="margin:12px 0 4px;font-size:13px">Fixação — parafusos, porcas, arruelas e chumbadores (= Relação fábrica)</h4><table class="tbl tbl-compacta" data-mml="fixacao"><thead><tr><th>Item</th><th class="num">Qtde</th><th class="num">Massa un. (kg)</th><th class="num">Massa total (kg)</th><th>Por fase</th><th>Por ligação</th></tr></thead><tbody>' +
      R.fixacao.map(function (x) { return "<tr><td>" + esc(x.descricao) + '</td><td class="num">' + x.qtd + '</td><td class="num">' + (x.massaUn == null ? "—" : br(x.massaUn, 4)) + '</td><td class="num">' + br(x.massaTotal, 2) + "</td><td>" + Object.keys(x.porFase).map(function (f) { return esc(f) + ": " + x.porFase[f]; }).join("<br>") + "</td><td>" + Object.keys(x.porLigacao).map(function (f) { return esc(f) + ": " + x.porLigacao[f]; }).join("<br>") + "</td></tr>"; }).join("") + "</tbody></table>";
    if (R.reserva.length) h += '<h4 style="margin:12px 0 4px;font-size:13px">' + esc(R.rotuloReserva) + '</h4><table class="tbl tbl-compacta" data-mml="reserva"><thead><tr><th>Item</th><th class="num">Reserva</th></tr></thead><tbody>' + R.reserva.map(function (x) { return "<tr><td>" + esc(x.descricao) + '</td><td class="num">+' + x.qtd + "</td></tr>"; }).join("") + "</tbody></table>";
    if (R.soldas.length) h += '<h4 style="margin:12px 0 4px;font-size:13px">Soldas indicadas</h4><table class="tbl tbl-compacta" data-mml="soldas"><thead><tr><th>Ligação</th><th>Cordão</th><th class="num">Ocorrências</th><th class="num">Comprimento total (m)</th></tr></thead><tbody>' + R.soldas.map(function (s) { return "<tr><td>" + esc(s.ligacao) + "</td><td>" + esc(s.cordao) + '</td><td class="num">' + s.n + '</td><td class="num">' + br(s.comprimento, 2) + "</td></tr>"; }).join("") + "</tbody></table>";
    R.avisos.slice(0, 12).forEach(function (a) { h += '<p style="font-size:12px;margin:4px 0;color:#a86a10">' + esc(a) + "</p>"; });
    return h + "</div>";
  }
  function htmlDocumento(R, info) {
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de montagem — estrutura metálica</title><style>body{font:12px/1.4 Arial,sans-serif;margin:18px;color:#1d2733}table{border-collapse:collapse;width:100%;margin:4px 0 10px}th,td{border:1px solid #9aa7b4;padding:3px 5px;vertical-align:top}th{background:#dde5ee;text-align:left}.num{text-align:right}h1{font-size:16px}@media print{@page{size:A4 landscape;margin:10mm}}</style></head><body><h1>LISTA DE MONTAGEM — ESTRUTURA METÁLICA</h1>' + html(R, info) + "</body></html>";
  }
  function xlsx(R, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var ws = wb.addWorksheet("Marcas de montagem", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ header: "Fase", width: 30 }, { header: "Marca", width: 9 }, { header: "Descrição", width: 34 }, { header: "Qtde", width: 7 }, { header: "Peça", width: 26 }, { header: "Perfil", width: 34 }, { header: "Comprimento (mm)", width: 16 }, { header: "Qtde/marca", width: 11 }, { header: "Massa un. marca (kg)", width: 18 }, { header: "Massa total (kg)", width: 16 }, { header: "Localização", width: 46 }];
    ws.getRow(1).font = { bold: true };
    R.marcas.forEach(function (m) {
      var ps = m.pecas.length ? m.pecas : [{ papel: "", perfil: "", comprimento: 0, qtd: "" }];
      ps.forEach(function (p, i) { ws.addRow(i ? ["", "", "", "", p.papel, p.perfil, p.comprimento ? Math.round(p.comprimento * 1000) : "", p.qtd, "", "", ""] : [m.fase + " — " + m.faseNome, m.marca, m.descricao, m.quantidade, p.papel, p.perfil, p.comprimento ? Math.round(p.comprimento * 1000) : "", p.qtd, m.massaUn, m.massaTotal, m.local]); });
    });
    ws.addRow([]); ws.addRow([R.rotuloSequencia]);
    var wf = wb.addWorksheet("Fixação");
    wf.columns = [{ header: "Item", width: 62 }, { header: "Qtde (modelo)", width: 14 }, { header: "Massa un. (kg)", width: 14 }, { header: "Massa total (kg)", width: 16 }, { header: "Por fase", width: 48 }, { header: "Por ligação", width: 56 }, { header: "Situação", width: 18 }];
    wf.getRow(1).font = { bold: true };
    R.fixacao.forEach(function (x) { wf.addRow([x.descricao, x.qtd, x.massaUn == null ? "" : x.massaUn, x.massaTotal, Object.keys(x.porFase).map(function (f) { return f + ": " + x.porFase[f]; }).join("; "), Object.keys(x.porLigacao).map(function (f) { return f + ": " + x.porLigacao[f]; }).join("; "), x.estado || "ok"]); });
    wf.addRow([]); wf.addRow(["Quantidades = Relação fábrica (a mesma conta: js/metalfab.js + js/metalfixacao.js). Massa: fabricante onde existe, senão geometria."]);
    if (R.reserva.length) {
      var wr = wb.addWorksheet("Reserva de obra");
      wr.columns = [{ header: "Item", width: 62 }, { header: "Reserva (+)", width: 12 }, { header: "Rótulo", width: 90 }];
      wr.getRow(1).font = { bold: true };
      R.reserva.forEach(function (x) { wr.addRow([x.descricao, x.qtd, x.rotulo]); });
    }
    if (R.soldas.length) {
      var wsd = wb.addWorksheet("Soldas");
      wsd.columns = [{ header: "Ligação", width: 44 }, { header: "Cordão", width: 32 }, { header: "Ocorrências", width: 12 }, { header: "Comprimento total (m)", width: 20 }];
      wsd.getRow(1).font = { bold: true };
      R.soldas.forEach(function (s) { wsd.addRow([s.ligacao, s.cordao, s.n, s.comprimento]); });
    }
    var wl = wb.addWorksheet("Leia-me");
    ["OrçaPRO Modela — Metálica: lista de montagem por marca (fábrica e obra).", R.rotuloSequencia, R.rotuloReserva,
     "Parafusos: comprimento = pega + arruela + porca + 3 fios, arredondado ao passo comercial (regra prática de montagem). Número de parafusos por ligação: valor de partida, a conferir.",
     "Modelagem e montagem — não é cálculo estrutural."].concat(R.avisos).forEach(function (t) { wl.addRow([t]); });
    wl.getColumn(1).width = 140;
    return wb;
  }

  var MetalMontLista = { montar: montar, conferirRelacao: conferirRelacao, html: html, htmlDocumento: htmlDocumento, xlsx: xlsx, FASES: FASES, faseDe: faseDe, ROT_SEQ: ROT_SEQ };
  global.MetalMontLista = MetalMontLista;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalMontLista;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

/* =====================================================================
 * esqauto.js — "PORTAS E JANELAS AUTOMÁTICAS" (um clique) — motor PURO, ES5, Node-testável (20/10/2026).
 *
 * Pedido: lançar portas e janelas por AMBIENTE (o selecionado ou todos) com as regras da pesquisa
 * (docs/arquitetura/esquadrias/) — os números e o nível de fonte moram no js/esqregras.js.
 *
 *   EsqAuto.leitura(estado, avaliarFam) → { paredes, ambientes[{ …, tipo (classificado), trechos[] }], vaos, moveis, divisa }
 *     TRECHO = pedaço de parede reta que faz face com o ambiente: { paredeId, lado (±1, o lado do ambiente na normal da
 *     parede), t0, t1 (no eixo da parede: 0 = meio), vizinho (id do ambiente do outro lado | null = EXTERNO | "?" = espaço
 *     coberto sem ambiente) }. Parede EXTERNA = sem ambiente e sem piso do outro lado.
 *   EsqAuto.gerar({ estado, avaliarFam, ambientes: [ids] | null (todos), criterios: {troca}, acessivel: bool })
 *     → { ok, lote ({op:"lote"} — UM Ctrl+Z), ops, itens[], avisos[], pendencias[], criterios }
 *
 * JANELAS (só em parede EXTERNA): exigida = fração × área (1/6 prolongada, 1/8 transitória — Uberlândia, nível B,
 *   provisório); ventilação efetiva = Σ vão × fator do tipo ≥ 50 % da exigida. O que já existe conta (rodar de novo não
 *   duplica; o que o usuário pôs ou mexeu fica). Tipo por ambiente (correr em sala/quarto/cozinha/serviço, basculante em
 *   banheiro/lavabo); tamanho = o MENOR da grade comercial (js/esqregras.js CATALOGO) que atende; se nenhum couber, duas
 *   janelas. Centralizada no trecho livre, a ≥ distância do canto, fora da faixa a < 1,50 m da DIVISA (Código Civil
 *   art. 1.301, nível A) quando o lote existe no modelo. VERGA alinhada: todas as janelas de uma fachada com o topo na
 *   verga da fachada (a das janelas que já existem nela, senão o critério RA de 2,20 m); peitoril = verga − altura e tem
 *   de cair na faixa do ambiente (C). Cozinha: no trecho da bancada, se houver.
 * PORTAS: uma por ambiente que ainda não tem acesso, na parede que dá para o ambiente de acesso (circulação, sala…; a
 *   ordem por tipo está em ACESSO), largura pelo DESTINO privativo (C; acessível = vão livre ≥ 0,80, NBR 9050 6.11.2.4, A),
 *   boneca do critério no canto do lado da dobradiça, a folha abre para dentro do ambiente e encosta na parede do canto;
 *   a varredura (quarto de círculo) não pode cruzar outra porta, móvel/louça já modelado nem sair do ambiente — senão
 *   tenta a outra ponta, a outra mão, o meio do trecho. Banheiro acessível abre para FORA (NBR 9050 7.5, A).
 *   Sem porta para a rua no modelo: a entrada (folha 0,90, C) vai na sala/hall.
 * ORÇAMENTO: cada vão lançado leva a composição SINAPI do tamanho (EsqRegras.SINAPI) como camada da peça — o
 *   quantitativo da família não tem código, então nada conta em dobro; sem composição equivalente = pendente com o motivo.
 * Teste: node tools/test-esquadrias-auto.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function RG() { return dep("EsqRegras", "./esqregras.js"); }
  function AM() { return dep("ArqModelo", "./arqmodelo.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function VA() { return dep("BimVaoArr", "./bimvaoarr.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var EPS = 1e-6;

  /* ---------------------------------------------------------------- geometria plana ([x, z]) */
  function eixoU(r) { return [Math.cos(r), -Math.sin(r)]; }
  function eixoN(r) { return [Math.sin(r), Math.cos(r)]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
  function dentro(p, P) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1] + 1e-15) + a[0]) c = !c;
    }
    return c;
  }
  /* raio a partir de o na direção d (unitária) contra as arestas de P: a menor distância positiva (Infinity se não bate) */
  function raio(o, d, P) {
    var best = Infinity;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], e = sub(b, a), den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      var w = sub(a, o), t = (w[0] * e[1] - w[1] * e[0]) / den, s = (w[0] * d[1] - w[1] * d[0]) / den;
      if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t;
    }
    return best;
  }
  function paredePorId(L) { var m = {}; L.forEach(function (w) { m[w.id] = w; }); return m; }
  function ptParede(w, t, s) { var u = eixoU(w.rotY), n = eixoN(w.rotY); return [w.cx + u[0] * t + n[0] * s, w.cz + u[1] * t + n[1] * s]; }

  /* ---------------------------------------------------------------- LEITURA do modelo */
  function leitura(estado, avaliarFam) {
    var A = AM(), R = RG();
    var M = A.extrair({ estado: estado, avaliarFam: avaliarFam }, {});
    var paredes = M.paredes.filter(function (w) { return !w.muro && w.status !== "demolido" && !w.arco; });
    var ambs = M.ambientes.filter(function (a) { return a.status !== "demolido"; });
    var lajes = M.lajes.filter(function (l) { return l.piso && l.status !== "demolido"; });
    var famPorId = {}; arr(estado && estado.familias).forEach(function (f) { if (f && f.id != null) famPorId[String(f.id)] = f; });
    var vaos = M.vaos.filter(function (v) { return v.status !== "demolido"; }).map(function (v) {
      var f = famPorId[v.id] || {}, av = null;
      try { av = typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst) : null; } catch (e) { av = null; }
      var val = (av && av.valores) || {}, ins = f.inst || {};
      return { id: v.id, tipo: v.tipo, famId: v.famId, tipoId: v.tipoId, parede: v.parede, t: num(f.host && f.host.t, 0), largura: v.largura, altura: v.altura, peitoril: v.peitoril,
        topo: r4(v.peitoril + v.altura), folha: num(val.Largura, v.largura), abreFora: ins.Abre_para_fora === true || ins.Abre_para_fora === "true", maoDireita: ins.Mao_direita === true || ins.Mao_direita === "true",
        correr: /correr/.test(txt(v.famId)), pav: v.pav, auto: /^esq[pj]-/.test(v.id), fixo: !!f.fixo };
    });
    var porPar = paredePorId(paredes);
    var out = { paredes: paredes, porParede: porPar, ambientes: [], vaos: vaos, moveis: M.moveis.filter(function (m) { return m.status !== "demolido"; }), lajes: lajes,
      divisa: M.terreno && M.terreno.divisa ? M.terreno.divisa.pts : null, pavimentos: M.pavimentos, avisos: M.avisos };
    ambs.forEach(function (a) {
      var cls = R.classificar(a.nome);
      out.ambientes.push({ id: a.id, nome: a.nome, area: a.area, pts: a.pts, pav: a.pav, base: a.base, pe: a.pe, cx: a.cx, cz: a.cz, tipo: cls, trechos: [] });
    });
    function ambEm(p, pav, exc) {
      for (var i = 0; i < out.ambientes.length; i++) { var b = out.ambientes[i]; if (b.id !== exc && b.pav === pav && dentro(p, b.pts)) return b.id; }
      return null;
    }
    function naParede(p, pav, exc) { for (var i = 0; i < paredes.length; i++) if (paredes[i].id !== exc && paredes[i].pav === pav && dentro(p, paredes[i].pts)) return true; return false; }
    function piso(p, pav) { for (var i = 0; i < lajes.length; i++) if (lajes[i].pav === pav && dentro(p, lajes[i].pts)) return true; return false; }
    out.ambientes.forEach(function (a) {
      var P = a.pts;
      for (var i = 0; i < P.length; i++) {
        var p = P[i], q = P[(i + 1) % P.length], e = sub(q, p), Le = Math.sqrt(dot(e, e)); if (Le < 0.05) continue;
        var d = [e[0] / Le, e[1] / Le], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], pp = [-d[1], d[0]];
        var inw = dentro(add(mid, pp, 0.05), P) ? pp : [-pp[0], -pp[1]], achou = false;
        paredes.forEach(function (w) {
          if (w.pav !== a.pav) return;
          var u = eixoU(w.rotY), n = eixoN(w.rotY);
          if (Math.abs(d[0] * u[1] - d[1] * u[0]) > 0.02) return;
          var s = dot(sub(mid, [w.cx, w.cz]), n), h = w.espessura / 2;
          if (Math.abs(s) > h + 0.04) return;
          var lado = dot(inw, n) > 0 ? 1 : -1;
          var tp = dot(sub(p, [w.cx, w.cz]), u), tq = dot(sub(q, [w.cx, w.cz]), u), L2 = w.comprimento / 2;
          var t0 = Math.max(Math.min(tp, tq), -L2), t1 = Math.min(Math.max(tp, tq), L2);
          if (t1 - t0 < 0.05) return;
          achou = true;
          /* o outro lado, amostrado a cada 5 cm: os trechos por vizinho */
          var passo = 0.05, nAm = Math.max(2, Math.ceil((t1 - t0) / passo)), cur = null, ini = t0;
          for (var k = 0; k <= nAm; k++) {
            var tk = t0 + (t1 - t0) * k / nAm, pt = ptParede(w, Math.min(t1 - 0.01, Math.max(t0 + 0.01, tk)), -lado * (h + 0.15));
            var viz = ambEm(pt, a.pav, a.id); if (viz == null && ((lajes.length && piso(pt, a.pav)) || naParede(pt, a.pav, w.id))) viz = "?";
            var chave = viz == null ? "ext" : viz;
            if (k === 0) { cur = chave; continue; }
            if (chave !== cur || k === nAm) {
              var fim = chave !== cur ? tk : t1;
              if (fim - ini > 0.05) a.trechos.push({ paredeId: w.id, lado: lado, t0: r4(ini), t1: r4(fim), vizinho: cur === "ext" ? null : cur });
              ini = tk; cur = chave;
            }
          }
        });
        /* lado do contorno SEM parede (separador de ambiente): com outro ambiente do outro lado = integração aberta */
        if (!achou && Le > 0.3) { var fora = add(mid, inw, -0.15), viz2 = ambEm(fora, a.pav, a.id); if (viz2) { a.aberto = true; (a.abertos = a.abertos || []).push(viz2); } }
      }
    });
    return out;
  }

  /* os vãos de um trecho (centro dentro dele, na mesma parede) */
  function vaosDoTrecho(L, tr) { return L.vaos.filter(function (v) { return v.parede === tr.paredeId && v.t >= tr.t0 - 0.02 && v.t <= tr.t1 + 0.02; }); }
  /* trechos LIVRES do trecho (sem parede que cruza e sem vão, com a margem) — [[a, b]…] em t da parede */
  function livres(L, estado, avaliarFam, tr, margem, extras) {
    var V = VA(), R = V ? V.referencias(estado, avaliarFam, tr.paredeId) : null, base = R ? R.livres.map(function (s) { return [s.a, s.b]; }) : [[tr.t0, tr.t1]];
    var sp = [];
    base.forEach(function (s) { var a = Math.max(s[0], tr.t0), b = Math.min(s[1], tr.t1); if (b - a > 0.05) sp.push([a, b]); });
    var ocup = L.vaos.filter(function (v) { return v.parede === tr.paredeId; }).map(function (v) { return [v.t - v.largura / 2, v.t + v.largura / 2]; });
    arr(extras).forEach(function (x) { if (x.parede === tr.paredeId) ocup.push([x.t - x.largura / 2, x.t + x.largura / 2]); });
    ocup.forEach(function (o) {
      var nv = [];
      sp.forEach(function (s) {
        var a = o[0] - margem, b = o[1] + margem;
        if (b <= s[0] || a >= s[1]) { nv.push(s); return; }
        if (a > s[0]) nv.push([s[0], a]);
        if (b < s[1]) nv.push([b, s[1]]);
      });
      sp = nv;
    });
    return sp.filter(function (s) { return s[1] - s[0] > 0.05; });
  }

  /* distância da janela [x0, x1] (t da parede, face externa) à divisa — Código Civil art. 1.301:
       frente = a divisa que a janela VÊ (de frente ou OBLÍQUA: Súmula 414 do STF, STJ REsp 1.531.094/SP) → ≥ 1,50 m;
       lado   = a divisa PERPENDICULAR ao plano da janela (§ 1º: "visão não incida sobre a linha divisória") → ≥ 0,75 m.
     A medida é a MENOR distância em planta entre o vão (segmento na face externa) e o trecho da divisa à frente do plano da
     janela. Antes (até c945b02b) a "frente" era um raio na normal: com a divisa enviesada o raio media mais que a distância
     real (janela a 1,1 m da divisa oblíqua passava como 1,6 m) e o lado só era olhado no eixo da parede. */
  function distSeg(p, a, b) { var e = sub(b, a), l2 = dot(e, e), k = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), e) / l2)) : 0, q = add(a, e, k), d = sub(p, q); return Math.sqrt(dot(d, d)); }
  function cruza(a, b, c, d) {
    function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  }
  function distSegSeg(a, b, c, d) { if (cruza(a, b, c, d)) return 0; return Math.min(distSeg(a, c, d), distSeg(b, c, d), distSeg(c, a, b), distSeg(d, a, b)); }
  function distDivisa(L, w, lado, x0, x1, crit) {
    if (!L.divisa || L.divisa.length < 3) return { frente: Infinity, lado: Infinity };
    var R = RG(), C = crit || (R && R.CRITERIOS) || {}, tol = C.anguloPerpendicular ? C.anguloPerpendicular.valor : 15;
    var out = -lado, h = w.espessura / 2, nOut = eixoN(w.rotY), fr = Infinity, la = Infinity, P = L.divisa;
    nOut = [nOut[0] * out, nOut[1] * out];
    var oa = ptParede(w, x0, out * h), ob = ptParede(w, x1, out * h), cosTol = Math.cos(tol * Math.PI / 180);
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], e = sub(b, a), le = Math.sqrt(dot(e, e)); if (le < 1e-9) continue;
      /* o trecho da divisa à frente do plano da janela (s >= 0): o que fica atrás a janela não vê */
      var sa = dot(sub(a, oa), nOut), sb = dot(sub(b, oa), nOut);
      if (sa < 0 && sb < 0) continue;
      var a2 = a, b2 = b;
      if (sa < 0) a2 = add(a, e, sa / (sa - sb)); else if (sb < 0) b2 = add(a, e, sa / (sa - sb));
      var dd = distSegSeg(oa, ob, a2, b2), perp = Math.abs(dot(e, nOut)) / le >= cosTol;
      if (perp) la = Math.min(la, dd); else fr = Math.min(fr, dd);
    }
    return { frente: fr, lado: la };
  }

  /* ---------------------------------------------------------------- JANELAS */
  var ACESSO = {
    banheiro: ["circulacao", "suite", "dormitorio", "area_servico", "escritorio", "despensa", "cozinha", "sala_jantar", "sala_estar", "generico"],
    lavabo: ["circulacao", "sala_estar", "sala_jantar", "escritorio", "generico", "cozinha"],
    dormitorio: ["circulacao", "sala_estar", "sala_jantar", "escritorio", "generico", "cozinha"],
    suite: ["circulacao", "sala_estar", "sala_jantar", "generico"],
    escritorio: ["circulacao", "sala_estar", "sala_jantar", "generico"],
    despensa: ["cozinha", "circulacao", "area_servico", "dormitorio", "suite"],
    cozinha: ["sala_jantar", "sala_estar", "circulacao", "area_servico", "generico"],
    area_servico: ["cozinha", "circulacao", "garagem", "generico"],
    area_gourmet: ["sala_estar", "sala_jantar", "cozinha", "circulacao"],
    generico: ["circulacao", "sala_estar", "sala_jantar", "cozinha"],
    sala_jantar: ["sala_estar", "circulacao", "cozinha"],
    sala_estar: ["circulacao", "sala_jantar"]
  };

  function gerar(o) {
    o = o || {};
    var R = RG(), est = o.estado, aval = o.avaliarFam, C = R.criterios(o.criterios), L = leitura(est, aval);
    var ops = [], itens = [], avisos = [], pend = [], novos = [], idsUsados = {};
    arr(est && est.familias).forEach(function (f) { if (f) idsUsados[String(f.id)] = 1; });
    arr(est && est.caixas).forEach(function (c) { if (c) idsUsados[String(c.id)] = 1; });
    var sel = o.ambientes ? o.ambientes.map(String) : null;
    var alvo = L.ambientes.filter(function (a) { return !sel || sel.indexOf(String(a.id)) >= 0; });
    if (!L.ambientes.length) return { ok: false, motivo: "Não há ambiente delimitado no modelo: lance os ambientes (Arquitetura › Ambiente) e rode de novo.", ops: [], itens: [], avisos: [], pendencias: [], criterios: C };
    if (!alvo.length) return { ok: false, motivo: "Selecione um ambiente (ou use \"todos\").", ops: [], itens: [], avisos: [], pendencias: [], criterios: C };
    var porAmb = {}; L.ambientes.forEach(function (a) { porAmb[a.id] = a; });
    var dispo = {};
    function famDisponivel(famId) {
      if (dispo[famId] == null) { var t = R.CATALOGO.filter(function (c) { return c.famId === famId; })[0], av = null; try { av = typeof aval === "function" && t ? aval(famId, t.tipoId, {}) : null; } catch (e) { av = null; } dispo[famId] = !!(av && av.abertura); }
      return dispo[famId];
    }
    function novoId(pref) { var k = 1, id = pref; while (idsUsados[id]) id = pref + "-" + (++k); idsUsados[id] = 1; return id; }
    function acessivelAmb(a) { return !!o.acessivel || /\b(pne|pcd|acessivel)\b/.test(R.normalizar(a.nome)); }

    /* ---------------- PORTAS (primeiro: a janela evita o vão da porta) */
    var portasTodas = function () { return L.vaos.filter(function (v) { return v.tipo === "porta"; }).concat(novos.filter(function (v) { return v.tipo === "porta"; })); };
    function temAcesso(a) {
      return a.trechos.some(function (tr) { return portasTodas().some(function (v) { return v.parede === tr.paredeId && v.t >= tr.t0 - 0.02 && v.t <= tr.t1 + 0.02; }); });
    }
    function moveisPav(pav) { return L.moveis.filter(function (m) { return m.pav === pav && m.y < 2.0; }); }
    /* a varredura da folha: pontos do quarto de círculo (H = dobradiça na face, dF = folha fechada, dA = folha aberta) */
    function varredura(w, tVao, folha, maoDir, abreLado) {
      var u = eixoU(w.rotY), n = eixoN(w.rotY), sH = maoDir ? 1 : -1, tH = tVao + sH * folha / 2, H = ptParede(w, tH, abreLado * w.espessura / 2);
      var dF = [-sH * u[0], -sH * u[1]], dA = [abreLado * n[0], abreLado * n[1]], pts = [];
      for (var ir = 1; ir <= 5; ir++) for (var ia = 0; ia <= 9; ia++) {
        var r = folha * 0.98 * ir / 5, a = Math.PI / 180 * (3 + 87 * ia / 9);   /* 3°…90°: o ponto em cima da face da parede não decide "fora" */
        pts.push([H[0] + r * (Math.cos(a) * dF[0] + Math.sin(a) * dA[0]), H[1] + r * (Math.cos(a) * dF[1] + Math.sin(a) * dA[1])]);
      }
      return { H: H, dF: dF, dA: dA, R: folha, pts: pts };
    }
    function naVarredura(p, V) {
      var q = sub(p, V.H), x = dot(q, V.dF), y = dot(q, V.dA);
      return x >= -1e-3 && y >= 0.01 && x * x + y * y <= V.R * V.R;
    }
    function varreduraDe(v) {
      var w = L.porParede[v.parede]; if (!w || v.correr) return null;
      var lado = v.abreFora ? 1 : -1;
      return varredura(w, v.t, v.folha, v.maoDireita, lado);
    }
    function colisoes(V, amb, pav, ignorarId) {
      var c = [];
      if (amb && V.pts.some(function (p) { return !dentro(p, amb.pts) && foraDoLivre(p, pav); })) c.push({ tipo: "fora", id: amb.id });
      moveisPav(pav).forEach(function (m) {
        var hit = V.pts.some(function (p) { return dentro(p, m.pts); }) || m.pts.some(function (p) { return naVarredura(p, V); });
        if (hit) c.push({ tipo: "movel", id: m.id, nome: m.nome });
      });
      portasTodas().forEach(function (v) {
        if (v.id === ignorarId) return;
        var W = varreduraDe(v); if (!W) return;
        if (V.pts.some(function (p) { return naVarredura(p, W); }) || W.pts.some(function (p) { return naVarredura(p, V); })) c.push({ tipo: "porta", id: v.id });
      });
      return c;
    }
    /* o ponto da varredura está "fora": dentro de parede viva, ou fora de todo ambiente e de todo piso (a rua) */
    function foraDoLivre(p, pav) { return EsqAuto.foraDoLivre(L, p, pav); }
    function folhaPara(def, acc) {
      var cm = def && def.porta ? def.porta.folha : 80;
      if (acc) { var minF = Math.ceil((C.vaoLivreAcessivel.valor + C.descontoVaoLivre.valor) * 100 - 1e-6); if (cm < minF) cm = minF; }
      var p = R.PORTAS.filter(function (x) { return x.folha >= cm; })[0] || R.PORTAS[R.PORTAS.length - 1];
      return p;
    }
    /* põe UMA porta no trecho tr do ambiente "dono" (abre para dentro de abreEm, salvo regra) */
    function porPorta(dono, tr, viz, opc) {
      var w = L.porParede[tr.paredeId]; if (!w) return null;
      var acc = acessivelAmb(dono) || (viz && acessivelAmb(viz) && opc.entrada);
      var P = folhaPara(dono.tipo.def, acc), folha = P.folha / 100, larg = folha + 2 * R.BATENTE;
      var abreFora = dono.tipo.def.porta && dono.tipo.def.porta.abre === "fora";
      var banhoAcc = (dono.tipo.id === "banheiro" || dono.tipo.id === "lavabo") && acessivelAmb(dono);
      if (banhoAcc) abreFora = true;
      var ladoDono = tr.lado, abreLadoPref = abreFora ? -ladoDono : ladoDono, ambAbre = abreFora ? viz : dono;
      var sps = livres(L, est, aval, tr, C.entreBatentes.valor, novos), tent = [], bon = C.boneca.valor;
      sps.forEach(function (s) {
        if (s[1] - s[0] < larg + 2 * C.bonecaMinima.valor - EPS) return;
        var b = Math.min(bon, Math.max(C.bonecaMinima.valor, (s[1] - s[0] - larg) / 2));
        var tA = s[0] + b + larg / 2, tB = s[1] - b - larg / 2;
        [abreLadoPref, -abreLadoPref].forEach(function (lado, kl) {
          if (kl === 1 && (banhoAcc || opc.entrada)) return;   /* banheiro acessível: só para fora; entrada: para dentro */
          tent.push({ t: tA, mao: false, lado: lado, pen: kl * 10, bon: b }); tent.push({ t: tB, mao: true, lado: lado, pen: kl * 10 + 1, bon: b });
          tent.push({ t: tA, mao: true, lado: lado, pen: kl * 10 + 4, bon: b }); tent.push({ t: tB, mao: false, lado: lado, pen: kl * 10 + 5, bon: b });
          for (var tm = tA + 0.1; tm < tB - 0.05; tm += 0.1) { tent.push({ t: tm, mao: false, lado: lado, pen: kl * 10 + 6 }); tent.push({ t: tm, mao: true, lado: lado, pen: kl * 10 + 6 }); }
        });
      });
      if (!tent.length) return { ok: false, motivo: "a parede que dá para " + (viz ? "\"" + viz.nome + "\"" : "fora") + " não tem trecho livre de " + f2(larg + 2 * C.bonecaMinima.valor) + " m" };
      var melhor = null;
      tent.forEach(function (x) {
        var V = varredura(w, x.t, folha, x.mao, x.lado), alvoAmb = x.lado === ladoDono ? dono : viz;
        var col = colisoes(V, alvoAmb, dono.pav, null);
        var pen = x.pen + col.length * 100;
        if (!melhor || pen < melhor.pen) melhor = { x: x, pen: pen, col: col };
      });
      var x = melhor.x, id = opc.id;   /* o id definitivo sai no registrar (novoId) */
      var op = { op: "familia", id: id, famId: "ra-porta-giro", tipoId: P.tipoId, host: { id: w.id, t: r4(x.t) }, inst: { Abre_para_fora: x.lado === 1, Mao_direita: x.mao } };
      var vao = { id: id, tipo: "porta", famId: "ra-porta-giro", tipoId: P.tipoId, parede: w.id, t: r4(x.t), largura: r4(larg), altura: 2.15, peitoril: 0, folha: folha, abreFora: x.lado === 1, maoDireita: x.mao, correr: false, pav: dono.pav, auto: true };
      return { ok: true, op: op, vao: vao, colisoes: melhor.col, acessivel: acc, banhoAcc: banhoAcc, folha: folha, boneca: x.bon, abreEm: x.lado === ladoDono ? dono.nome : (viz ? viz.nome : "fora") };
    }
    /* obs: a janela leva no orçamento a marca da regra PROVISÓRIA (B) que a dimensionou — quem lê o orçamento sem a tela vê.
       O rótulo do serviço é cortado em 80 caracteres (BimEdit.limparServicos): texto curto, o longo fica na tela/regras. */
    function opOrcar(id, famId, tipoId, obs) {
      var s = R.sinapiDe(famId, tipoId);
      return s.codigo ? { op: "orcar", id: id, servicos: [{ codigo: s.codigo, medida: "quantidade", fator: 1, rotulo: "Esquadria auto — SINAPI " + s.codigo + (s.curta ? " " + s.curta : "") + (obs ? " · " + obs : "") }] } : null;
    }
    function registrarPorta(res, dono, viz, rot) {
      res.op.id = res.vao.id = novoId(res.op.id);
      ops.push(res.op); novos.push(res.vao);
      var oc = opOrcar(res.op.id, "ra-porta-giro", res.op.tipoId); if (oc) ops.push(oc);
      var it = { id: res.op.id, tipo: "porta", ambiente: dono.id, ambienteNome: dono.nome, vizinho: viz ? viz.id : null, rotulo: rot, folha: res.folha, tipoId: res.op.tipoId,
        abreFora: res.op.inst.Abre_para_fora, abreEm: res.abreEm, maoDireita: res.op.inst.Mao_direita, parede: res.op.host.id, sinapi: R.sinapiDe("ra-porta-giro", res.op.tipoId),
        regras: ["largura " + f2(res.folha) + " m (" + R.rotuloNivel("C") + (res.acessivel ? "; vão livre ≥ " + f2(C.vaoLivreAcessivel.valor) + " m — NBR 9050:2020 6.11.2.4" : "") + ")",
                 (res.boneca != null ? "boneca " + f2(res.boneca) + " m do canto" : "porta no meio do trecho") + ", dobradiça na boneca, abre para " + res.abreEm + " (" + R.rotuloNivel("C") + ")"].concat(res.banhoAcc ? ["banheiro acessível abre para fora (NBR 9050:2020 7.5)"] : []) };
      itens.push(it);
      if (res.colisoes.length) pend.push({ ambiente: dono.id, texto: "Porta " + res.op.id + " (" + dono.nome + "): não achei posição sem conflito — " + res.colisoes.map(function (c) { return c.tipo === "fora" ? "a folha sai do ambiente" : (c.tipo === "porta" ? "bate na porta " + c.id : "bate em " + (c.nome || c.id)); }).join(", ") + ". Confira no auditor." });
    }
    var donos = alvo.slice().sort(function (a, b) { return R.privacidade(a.tipo.id) - R.privacidade(b.tipo.id); });
    donos.forEach(function (a) {
      if (a.tipo.def.semPortaPropria || a.tipo.def.porta === null || a.tipo.def.externo) return;
      if (temAcesso(a) || a.aberto) return;   /* aberto = divisa com outro ambiente sem parede (separador): integrado, sem porta */
      var pref = ACESSO[a.tipo.id] || ACESSO.generico, cands = [];
      a.trechos.forEach(function (tr) {
        if (tr.vizinho == null || tr.vizinho === "?") return;
        var b = porAmb[tr.vizinho]; if (!b) return;
        var k = pref.indexOf(b.tipo.id);
        if (k < 0 && R.privacidade(b.tipo.id) < R.privacidade(a.tipo.id)) return;   /* o ambiente público não abre porta para dentro de um mais privativo (a sala não "pega" o quarto) */
        if (k < 0) k = 50;
        cands.push({ tr: tr, b: b, k: k + (tr.t1 - tr.t0 < 1 ? 5 : 0) });
      });
      cands.sort(function (x, y) { return x.k - y.k || (y.tr.t1 - y.tr.t0) - (x.tr.t1 - x.tr.t0); });
      var feito = false, motivos = [], reserva = null;
      for (var i = 0; i < cands.length && !feito; i++) {
        var c = cands[i], par = [String(a.id), String(c.b.id)].sort();
        var res = porPorta(a, c.tr, c.b, { id: "esqp-" + par[0] + "-" + par[1] });
        if (res && res.ok && !res.colisoes.length) { registrarPorta(res, a, c.b, "Porta " + a.nome + " ↔ " + c.b.nome); feito = true; }
        else if (res && res.ok) { if (!reserva) reserva = { res: res, b: c.b }; }
        else if (res) motivos.push(res.motivo);
      }
      /* nenhuma parede deu porta sem conflito: a melhor com conflito, com pendência (o auditor mostra) */
      if (!feito && reserva) { registrarPorta(reserva.res, a, reserva.b, "Porta " + a.nome + " ↔ " + reserva.b.nome); feito = true; }
      if (!feito && a.tipo.def.entrada) return;   /* sala/hall sem vizinho: a entrada resolve abaixo */
      if (!feito) pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\" ficou sem porta: " + (cands.length ? motivos.join("; ") : "nenhuma parede dá para outro ambiente") + "." });
    });
    /* a ENTRADA: nenhuma porta dá para fora no modelo */
    var temEntrada = L.ambientes.some(function (a) { return a.trechos.some(function (tr) { return tr.vizinho == null && portasTodas().some(function (v) { return v.parede === tr.paredeId && v.t >= tr.t0 - 0.02 && v.t <= tr.t1 + 0.02; }); }); });
    if (!temEntrada) {
      var ordemEnt = ["circulacao", "sala_estar", "sala_jantar", "cozinha", "area_servico"], ent = null;
      alvo.filter(function (a) { return ordemEnt.indexOf(a.tipo.id) >= 0 && a.trechos.some(function (tr) { return tr.vizinho == null; }); })
        .sort(function (x, y) { var kx = ordemEnt.indexOf(x.tipo.id), ky = ordemEnt.indexOf(y.tipo.id); if (x.tipo.id === "circulacao" && !/entrada|hall/.test(R.normalizar(x.nome))) kx = 9; if (y.tipo.id === "circulacao" && !/entrada|hall/.test(R.normalizar(y.nome))) ky = 9; return kx - ky; })
        .some(function (a) {
          var trs = a.trechos.filter(function (tr) { return tr.vizinho == null; }).sort(function (x, y) { return (y.t1 - y.t0) - (x.t1 - x.t0); });
          for (var i = 0; i < trs.length; i++) {
            var defE = { porta: { folha: 90, abre: "dentro" } }, aE = { id: a.id, nome: a.nome, pav: a.pav, pts: a.pts, tipo: { id: "entrada", def: defE } };
            var res = porPorta(aE, trs[i], null, { id: "esqp-" + a.id + "-entrada", entrada: true });
            if (res && res.ok && !res.colisoes.length) { res.vao.entrada = true; registrarPorta(res, a, null, "Entrada (" + a.nome + ")"); itens[itens.length - 1].regras.unshift("entrada social: folha 0,90 (" + R.rotuloNivel("C") + ")"); ent = a; return true; }
          }
          return false;
        });
      if (!ent && alvo.length === L.ambientes.length) pend.push({ ambiente: null, texto: "Não achei parede externa livre para a porta de entrada: lance-a à mão." });
    }

    /* ---------------- JANELAS */
    var fachadas = {};   /* verga por fachada (normal para fora, em graus) */
    function chaveFach(w, lado) { var nn = eixoN(w.rotY), ang = Math.round(Math.atan2(-lado * nn[1], -lado * nn[0]) * 180 / Math.PI / 5) * 5; return String((ang + 360) % 360); }
    L.ambientes.forEach(function (a) {
      a.trechos.forEach(function (tr) {
        if (tr.vizinho != null) return;
        var w = L.porParede[tr.paredeId]; if (!w) return;
        vaosDoTrecho(L, tr).forEach(function (v) { if (v.tipo === "janela") { var k = chaveFach(w, tr.lado); (fachadas[k] = fachadas[k] || []).push(v.topo); } });
      });
    });
    function vergaDe(k) { var l = fachadas[k]; if (!l || !l.length) return C.verga.valor; var c = {}; l.forEach(function (x) { var y = r3(x); c[y] = (c[y] || 0) + 1; }); return +Object.keys(c).sort(function (p, q) { return c[q] - c[p]; })[0]; }
    function areaJanelas(a) {
      var tot = 0, vent = 0, lista = [];
      a.trechos.forEach(function (tr) {
        if (tr.vizinho != null) return;
        vaosDoTrecho(L, tr).concat(novos.filter(function (v) { return v.parede === tr.paredeId && v.t >= tr.t0 - 0.02 && v.t <= tr.t1 + 0.02; })).forEach(function (v) {
          if (v.tipo === "janela" || (v.tipo === "porta" && v.correr)) { var ar = v.largura * v.altura; tot += ar * R.fatorIluminacao(v.famId, C); vent += ar * R.fatorVentilacao(v.famId, C); lista.push(v.id); }
        });
      });
      return { area: tot, vent: vent, ids: lista };
    }
    alvo.forEach(function (a) {
      var def = a.tipo.def, fr = R.fracaoIluminacao(def, C);
      if (!a.tipo.casou) avisos.push("\"" + a.nome + "\": nome sem tipo conhecido — usei a regra mais restritiva (prolongada, 1/6). Nomeie o ambiente (ex.: Sala, Quarto, Banheiro).");
      if (!fr || !def.janela || !def.janela.famId) return;
      var exigida = fr.valor * a.area, tem = areaJanelas(a);
      if (!def.janela.exige && tem.area <= 0) return;
      if (!def.janela.exige) return;
      if (tem.area >= exigida - 1e-6) { itens.push({ id: null, tipo: "janela-ok", ambiente: a.id, ambienteNome: a.nome, exigida: r4(exigida), existente: r4(tem.area), regras: ["já atende: " + f2(tem.area) + " m² ≥ " + f2(exigida) + " m²"] }); return; }
      var falta = exigida - tem.area;
      var ext = a.trechos.filter(function (tr) { return tr.vizinho == null; });
      if (!ext.length) {
        pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\" não tem parede externa: " + (def.ventIndireta ? "use ventilação mecânica ou indireta (duto/poço)." : "ambiente de permanência sem janela — reveja a planta.") });
        return;
      }
      var bancadas = /bancada|pia|cuba/i;
      var spans = [];
      ext.forEach(function (tr) {
        var w = L.porParede[tr.paredeId];
        livres(L, est, aval, tr, C.trechoCego.valor, novos).forEach(function (s) {
          var a0 = Math.max(s[0], tr.t0 + C.distanciaCanto.valor), b0 = Math.min(s[1], tr.t1 - C.distanciaCanto.valor);
          if (b0 - a0 < 0.4) return;
          /* tira a faixa a < 1,50 m da divisa (amostra a cada 10 cm) */
          var nA = Math.max(1, Math.ceil((b0 - a0) / 0.1)), ok = [], ini = null, motivo = null, motivoL = null;
          for (var k = 0; k <= nA; k++) {
            var t = a0 + (b0 - a0) * k / nA, d = distDivisa(L, w, tr.lado, t, t, C), bomF = d.frente >= C.divisaFrente.valor - 1e-6, bomL = d.lado >= C.divisaPerpendicular.valor - 1e-6, bom = bomF && bomL;
            if (!bomF) motivo = d.frente; else if (!bomL && motivo == null) motivoL = d.lado;
            if (bom && ini == null) ini = t;
            if ((!bom || k === nA) && ini != null) { var fim = bom ? t : t - (b0 - a0) / nA; if (fim - ini > 0.3) ok.push([ini, fim]); ini = null; }
          }
          if (motivo != null) avisos.push("\"" + a.nome + "\", parede " + w.id + ": trecho a " + f2(motivo) + " m da divisa — sem janela ali (Código Civil art. 1.301: ≥ " + f2(C.divisaFrente.valor) + " m).");
          else if (motivoL != null) avisos.push("\"" + a.nome + "\", parede " + w.id + ": ponta a " + f2(motivoL) + " m da divisa perpendicular — sem janela ali (Código Civil art. 1.301 § 1º: ≥ " + f2(C.divisaPerpendicular.valor) + " m).");
          ok.forEach(function (q) {
            var cx = ptParede(w, (q[0] + q[1]) / 2, 0), pBanc = 0;
            if (def.janela.bancada) L.moveis.forEach(function (m) { if (m.pav === a.pav && bancadas.test(m.nome + " " + m.famId) && dentro([m.x, m.z], a.pts)) { var dd = Math.hypot(m.x - cx[0], m.z - cx[1]); pBanc = Math.max(pBanc, 3 - Math.min(3, dd)); } });
            spans.push({ tr: tr, w: w, a: q[0], b: q[1], len: q[1] - q[0], fach: chaveFach(w, tr.lado), bancada: pBanc });
          });
        });
      });
      if (!spans.length) { pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": a parede externa não tem trecho livre para janela (portas, cantos ou divisa a < " + f2(C.divisaFrente.valor) + " m)." }); return; }
      var pf = def.janela.peitoril, famJ = def.janela.famId;
      /* a família do tipo não está na biblioteca deste aparelho (a basculante é da prévia do modelador): a de correr 0,60 × 0,60 */
      if (!famDisponivel(famJ)) { avisos.push("\"" + a.nome + "\": a família " + famJ + " não está na biblioteca deste aparelho — usei a janela de correr."); famJ = R.CORRER; }
      function tiposPara(sp) {
        var vg = vergaDe(sp.fach), l = R.CATALOGO.filter(function (c) { return c.famId === famJ && c.L <= sp.len + EPS; }).map(function (c) { return { c: c, peit: r3(vg - c.H), verga: vg }; })
          .filter(function (x) { return x.peit >= pf[0] - 1e-6 && x.peit <= pf[1] + 1e-6; });
        if (!l.length && Math.abs(vg - C.verga.valor) > 1e-6) {
          l = R.CATALOGO.filter(function (c) { return c.famId === famJ && c.L <= sp.len + EPS; }).map(function (c) { return { c: c, peit: r3(C.verga.valor - c.H), verga: C.verga.valor, vergaPropria: true }; })
            .filter(function (x) { return x.peit >= pf[0] - 1e-6 && x.peit <= pf[1] + 1e-6; });
        }
        return l;
      }
      var escolha = null;
      spans.sort(function (x, y) { return y.bancada - x.bancada || y.len - x.len; });
      spans.forEach(function (sp, ks) {
        tiposPara(sp).forEach(function (x) {
          var ar = x.c.L * x.c.H * R.fatorIluminacao(x.c.famId, C); if (ar < falta - 1e-6) return;
          var sc = ar * 10 + ks * 0.01;
          if (!escolha || sc < escolha.sc) escolha = { n: 1, lista: [{ sp: sp, x: x, t: (sp.a + sp.b) / 2 }], sc: sc, area: ar };
        });
      });
      if (!escolha) {
        /* duas janelas: em dois trechos, ou no mesmo trecho (em terços) */
        spans.forEach(function (s1, i1) {
          spans.forEach(function (s2, i2) {
            if (i2 < i1) return;
            tiposPara(s1).forEach(function (x1) {
              tiposPara(s2).forEach(function (x2) {
                if (i1 === i2 && x1.c.tipoId !== x2.c.tipoId) return;
                var ar = (x1.c.L * x1.c.H + x2.c.L * x2.c.H) * R.fatorIluminacao(x1.c.famId, C); if (ar < falta - 1e-6) return;
                var lst;
                if (i1 === i2) {
                  if (s1.len < 2 * x1.c.L + C.trechoCego.valor - EPS) return;
                  var gap = Math.max(C.trechoCego.valor, (s1.len - 2 * x1.c.L) / 3), tt1 = s1.a + (s1.len - 2 * x1.c.L - gap) / 2 + x1.c.L / 2;
                  lst = [{ sp: s1, x: x1, t: tt1 }, { sp: s1, x: x1, t: tt1 + x1.c.L + gap }];
                } else lst = [{ sp: s1, x: x1, t: (s1.a + s1.b) / 2 }, { sp: s2, x: x2, t: (s2.a + s2.b) / 2 }];
                var sc = ar * 10 + (i1 === i2 ? 0.5 : 0);
                if (!escolha || sc < escolha.sc) escolha = { n: 2, lista: lst, sc: sc, area: ar };
              });
            });
          });
        });
      }
      var insuf = false;
      if (!escolha) {
        var maior = null;
        spans.forEach(function (sp) { tiposPara(sp).forEach(function (x) { var ar = x.c.L * x.c.H * R.fatorIluminacao(x.c.famId, C); if (!maior || ar > maior.area) maior = { n: 1, lista: [{ sp: sp, x: x, t: (sp.a + sp.b) / 2 }], area: ar }; }); });
        escolha = maior; insuf = true;
      }
      if (!escolha) { pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": nenhum tamanho do catálogo cabe com o peitoril de " + f2(pf[0]) + "–" + f2(pf[1]) + " m." }); return; }
      escolha.lista.forEach(function (e, k) {
        var id = novoId("esqj-" + a.id + "-" + (k + 1)), c = e.x.c;
        var op = { op: "familia", id: id, famId: c.famId, tipoId: c.tipoId, host: { id: e.sp.w.id, t: r4(e.t) }, inst: { Peitoril: e.x.peit } };
        ops.push(op);
        var oc = opOrcar(id, c.famId, c.tipoId, fr.alterado ? "área: critério alterado (C)" : "área: regra PROVISÓRIA (B)"); if (oc) ops.push(oc);
        novos.push({ id: id, tipo: "janela", famId: c.famId, tipoId: c.tipoId, parede: e.sp.w.id, t: r4(e.t), largura: c.L, altura: c.H, peitoril: e.x.peit, topo: r4(e.x.peit + c.H), pav: a.pav, auto: true });
        (fachadas[e.sp.fach] = fachadas[e.sp.fach] || []).push(r4(e.x.peit + c.H));
        var d = distDivisa(L, e.sp.w, e.sp.tr.lado, e.t - c.L / 2, e.t + c.L / 2, C), fIlu = R.fatorIluminacao(c.famId, C), sAp = R.sinapiDe(c.famId, c.tipoId).aproximada;
        itens.push({ id: id, tipo: "janela", ambiente: a.id, ambienteNome: a.nome, famId: c.famId, tipoId: c.tipoId, largura: c.L, altura: c.H, peitoril: e.x.peit, verga: e.x.verga, parede: e.sp.w.id,
          exigida: r4(exigida), existente: r4(tem.area), lancada: r4(escolha.area), divisa: isFinite(d.frente) ? r3(d.frente) : null, sinapi: R.sinapiDe(c.famId, c.tipoId),
          regras: ["iluminação ≥ " + (a.tipo.classe === "transitoria" ? "1/8" : "1/6") + " da área: " + f2(exigida) + " m² (" + (fr.alterado ? "critério alterado" : "Uberlândia LC 524/2011 — provisório, conferir o texto consolidado") + ")",
                   (fIlu >= 1 - 1e-9 ? "área de iluminação contada pelo VÃO inteiro (" + R.rotuloNivel("C") + "; se o Código de Obras pedir só o vidro, ponha 0,80 em \"Critérios das esquadrias\" › fração do vão)" : "área de iluminação = " + f2(fIlu) + " × vão (fração envidraçada, " + R.rotuloNivel("C") + ")"),
                   "ventilação ≥ " + Math.round(C.ventilacaoDaIluminacao.valor * 100) + " % da iluminação: " + f2(exigida * C.ventilacaoDaIluminacao.valor) + " m² (efetiva " + f2((tem.vent + (escolha.area / fIlu) * R.fatorVentilacao(c.famId, C))) + " m²)",
                   "peitoril " + f2(e.x.peit) + " m / verga " + f2(e.x.verga) + " m (" + R.rotuloNivel("C") + (e.x.vergaPropria ? "; a verga da fachada não servia a este ambiente" : "") + ")"]
            .concat(isFinite(d.frente) ? ["divisa a " + f2(d.frente) + " m ≥ " + f2(C.divisaFrente.valor) + " m (Código Civil art. 1.301)"] : [])
            .concat(isFinite(d.lado) ? ["divisa perpendicular a " + f2(d.lado) + " m ≥ " + f2(C.divisaPerpendicular.valor) + " m (art. 1.301 § 1º)"] : [])
            .concat(sAp ? ["orçamento: " + sAp] : []) });
      });
      if (insuf) pend.push({ ambiente: a.id, texto: "\"" + a.nome + "\": a maior janela que cabe (" + f2(escolha.area) + " m²) não atinge a área exigida (" + f2(falta) + " m² faltando). Abra outra parede ou aumente o vão." });
    });

    var lote = ops.length ? { op: "lote", id: "esq-" + (o.loteId || Date.now().toString(36)), origem: "esquadrias-automaticas", pedido: "Portas e janelas automáticas", ops: ops } : null;
    return { ok: true, lote: lote, ops: ops, itens: itens, avisos: avisos, pendencias: pend, criterios: C, leitura: L,
      resumo: { portas: itens.filter(function (x) { return x.tipo === "porta"; }).length, janelas: itens.filter(function (x) { return x.tipo === "janela"; }).length, ambientes: alvo.length } };
  }

  function foraDoLivre(L, p, pav) {
    var i;
    for (i = 0; i < L.paredes.length; i++) if (L.paredes[i].pav === pav && dentro(p, L.paredes[i].pts)) return true;
    for (i = 0; i < L.ambientes.length; i++) if (L.ambientes[i].pav === pav && dentro(p, L.ambientes[i].pts)) return false;
    for (i = 0; i < L.lajes.length; i++) if (L.lajes[i].pav === pav && dentro(p, L.lajes[i].pts)) return false;
    return true;
  }
  var EsqAuto = { foraDoLivre: foraDoLivre, leitura: leitura, gerar: gerar, livres: livres, distDivisa: distDivisa, dentro: dentro, raio: raio, ptParede: ptParede, eixoU: eixoU, eixoN: eixoN, ACESSO: ACESSO };
  global.EsqAuto = EsqAuto;
  if (typeof module !== "undefined" && module.exports) module.exports = EsqAuto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

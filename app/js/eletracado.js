/* =====================================================================
 * eletracado.js — A REDE DE ELETRODUTOS (frente E2, 21/10/2026): o grafo, as rotas do quadro a cada ponto e o TRAÇADO
 * automático (quadro → laje/forro → descida na parede até a caixa). Motor PURO, ES5, Node-testável.
 *
 *   EleTracado.grafo(estado, quadro, pontos) → { nos, adj, trechos, pedacos, noQD, noDe(pontoId) }
 *       lê TODOS os eletrodutos do modelo (os do lançador e os feitos à mão): pontas a ≤ 3 cm viram o mesmo nó; ponta que cai no
 *       meio de outro eletroduto (tê) parte aquele eletroduto; a caixa (peça caixa_*) e o ponto ligam as pontas a ≤ 12 cm;
 *       o quadro liga as pontas a ≤ (meia diagonal + 15 cm) do centro.
 *   EleTracado.rotas(G, { pontos, permitido(trecho) }) → { [pontoId]: { comprimento, trechos: [ids], pedacos: [{trecho, L}] } }
 *       (Dijkstra a partir do quadro; o circuito só anda pelos eletrodutos que o projeto atribuiu a ele, ou pelos sem atribuição)
 *   EleTracado.tracar({ L, quadro, pontos, pesos, K, estado, grafoExistente }) → { ops, trechos[], caixas[], atribuicao, avisos, pendencias }
 *       liga SÓ o que ainda não chega ao quadro (o que o modelo já tem — à mão ou de uma rodada anterior — não é tocado):
 *         · HUB de cada ambiente = a caixa octogonal da luminária (sem luminária: uma caixa de passagem no teto);
 *         · os hubs se ligam ao quadro em árvore (Prim, distância em L pelo teto) COM CAPACIDADE: cada eletroduto leva no máximo
 *           K "pesos" de circuito (critério RA; o aparelho pesado ocupa o eletroduto sozinho); do quadro sai uma SUBIDA por ramal;
 *         · cada ponto de parede desce do hub do ambiente: um trecho no teto (em L) até em cima da caixa e a descida na parede;
 *         · trecho sem caixa maior que 15 m menos 3 m por curva, ou com mais de 3 curvas, ganha CAIXA DE PASSAGEM
 *           (NBR 5410:2004 6.2.11.1.6 b e 6.2.11.1.7 — sem a Errata 1/2008, conferir).
 *       Aplicação: no teto "laje" (corrugado REFORÇADO — a SINAPI 06/2026 só tem esse em laje) ou "forro" (ambiente com forro);
 *       na parede "parede" (corrugado). DN pelo número de condutores (fabricante — js/eletabelas.js OCUPACAO), decidido no
 *       js/elecircuitos.js depois do dimensionamento.
 * IDs: elec-… (eletroduto), elecp-… (caixa de passagem). Rodar de novo com tudo ligado = nenhuma op (idempotente).
 * ⚠ Números daqui são GEOMETRIA do traçado (tolerâncias de encontro, afastamento de eletrodutos paralelos), não norma.
 * Teste: node tools/test-ele-circuitos.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function TB() { return dep("EleTabelas", "./eletabelas.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function d3(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }
  function pt(p) { return p ? [num(p.x, 0), num(p.y, 0), num(p.z, 0)] : null; }
  function obj(p) { return { x: r4(p[0]), y: r4(p[1]), z: r4(p[2]) }; }
  var TOL = 0.03, CAPT = 0.12, PAR = 0.04;   /* geometria: encontro de pontas, captura da caixa/ponto, afastamento de eletrodutos lado a lado */

  /* ---------------------------------------------------------------- GRAFO */
  /* quadro = { id, p: [x, y, z] (centro), raio } · pontos = [{ id, no: [x, y, z] (centro da caixa ou do ponto), caixa: id|null }] */
  function grafo(estado, quadro, pontos) {
    var inst = (estado && estado.instalacoes) || {}, ts = arr(inst.trechos).filter(function (t) { return t && t.sistema === "eletrica" && t.p1 && t.p2; });
    var nos = [], adj = {}, pedacos = [], trechos = {};
    function novoNo(p, tipo, ref) { var k = nos.length; nos.push({ k: k, p: p, tipo: tipo, ref: ref }); adj[k] = []; return k; }
    function liga(a, b, L, trecho) { if (a === b) return; adj[a].push({ b: b, L: L, trecho: trecho }); adj[b].push({ b: a, L: L, trecho: trecho }); }
    /* as pontas (com união pela tolerância) */
    var pontas = [];
    ts.forEach(function (t) { trechos[String(t.id)] = t; pontas.push({ t: t, k: 0, p: pt(t.p1) }, { t: t, k: 1, p: pt(t.p2) }); });
    var noPonta = [];
    pontas.forEach(function (q, i) {
      var achou = null;
      for (var j = 0; j < i && achou == null; j++) if (d3(pontas[j].p, q.p) <= TOL) achou = noPonta[j];
      noPonta.push(achou != null ? achou : novoNo(q.p, "ponta"));
    });
    /* tês: a ponta que cai no MEIO de outro eletroduto parte o eletroduto ali */
    var cortes = {};
    ts.forEach(function (t) { cortes[t.id] = [{ s: 0, no: null }, { s: 1, no: null }]; });
    pontas.forEach(function (q, i) {
      ts.forEach(function (t) {
        if (t === q.t) return;
        var a = pt(t.p1), b = pt(t.p2), e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2]; if (!(l2 > 1e-9)) return;
        var s = ((q.p[0] - a[0]) * e[0] + (q.p[1] - a[1]) * e[1] + (q.p[2] - a[2]) * e[2]) / l2;
        if (s <= 1e-3 || s >= 1 - 1e-3) return;
        var c = [a[0] + e[0] * s, a[1] + e[1] * s, a[2] + e[2] * s];
        if (d3(c, q.p) <= TOL) cortes[t.id].push({ s: s, no: noPonta[i] });
      });
    });
    ts.forEach(function (t, it) {
      var C = cortes[t.id].slice(), a = pt(t.p1), b = pt(t.p2), L = d3(a, b);
      C[0].no = noPonta[it * 2]; C[1].no = noPonta[it * 2 + 1];
      C.sort(function (x, y) { return x.s - y.s; });
      for (var i = 0; i + 1 < C.length; i++) {
        var l = (C[i + 1].s - C[i].s) * L; if (C[i].no === C[i + 1].no) continue;
        pedacos.push({ trecho: String(t.id), a: C[i].no, b: C[i + 1].no, L: l });
        liga(C[i].no, C[i + 1].no, l, String(t.id));
      }
    });
    /* caixas e pontos: ligam as pontas próximas (sem comprimento) */
    var porCaixa = {};
    arr(inst.pecas).forEach(function (k) {
      if (!k || !/^caixa_/.test(String(k.peca))) return;
      var p = [num(k.x, 0), num(k.y, 0), num(k.z, 0)], n0 = novoNo(p, "caixa", String(k.id)), parede = /^caixa_4x/.test(String(k.peca)); porCaixa[String(k.id)] = n0;
      /* ⚠ a caixa de PAREDE só pega a ponta que chega nela (≤ 7 cm na horizontal): duas caixas costas com costas numa parede de
         10–15 cm ficavam a menos dos 12 cm da captura e uma "pegava" o eletroduto da outra — a rede passava pela parede e o
         chuveiro do banheiro chegava ao quadro pela descida do interruptor do corredor (13 m em vez de 7 m; integração n23) */
      nos.forEach(function (nd) { if (nd.tipo !== "ponta") return; var dh = Math.sqrt(Math.pow(nd.p[0] - p[0], 2) + Math.pow(nd.p[2] - p[2], 2)); if (parede ? dh <= 0.07 + 1e-9 && Math.abs(nd.p[1] - p[1]) <= CAPT + 1e-9 : d3(nd.p, p) <= CAPT + 1e-9) liga(n0, nd.k, 0, null); });
    });
    var noDePonto = {};
    arr(pontos).forEach(function (q) {
      if (q.caixa && porCaixa[q.caixa] != null) { noDePonto[q.id] = porCaixa[q.caixa]; return; }
      var n0 = novoNo(q.no, "ponto", q.id); noDePonto[q.id] = n0;
      nos.forEach(function (nd) { if (nd.tipo === "ponta" && d3(nd.p, q.no) <= CAPT + 1e-9) liga(n0, nd.k, 0, null); });
    });
    var noQD = null;
    if (quadro && quadro.p) {
      noQD = novoNo(quadro.p, "quadro", quadro.id);
      /* a ponta que chega no quadro: dentro da caixa do quadro, com folga (as subidas saem lado a lado pelo alto, ao longo da parede) */
      var u = quadro.u, dq = quadro.dir, lg = num(quadro.largura, 0.4), al = num(quadro.altura, 0.5);
      /* ⚠ a ponta que já chega numa CAIXA (a descida do interruptor ao lado do quadro) não é ponta do quadro: antes ela virava rota de
         comprimento 0 e a descida da ligação ficava sem fio no orçamento (integração n23, revisão adversarial) */
      var naCaixa = {}; Object.keys(porCaixa).forEach(function (cid) { adj[porCaixa[cid]].forEach(function (e) { if (!e.trecho) naCaixa[e.b] = 1; }); });
      nos.forEach(function (nd) {
        if (nd.tipo !== "ponta" || naCaixa[nd.k]) return;
        var dd = [nd.p[0] - quadro.p[0], nd.p[1] - quadro.p[1], nd.p[2] - quadro.p[2]], dentroQ;
        if (u && dq) dentroQ = Math.abs(dd[0] * u[0] + dd[2] * u[1]) <= lg / 2 + 0.3 + 1e-9 && Math.abs(dd[1]) <= al / 2 + 0.2 + 1e-9 && Math.abs(dd[0] * dq[0] + dd[2] * dq[1]) <= 0.25 + 1e-9;
        else dentroQ = d3(nd.p, quadro.p) <= num(quadro.raio, 0.3) + 1e-9;
        if (dentroQ) liga(noQD, nd.k, 0, null);
      });
    }
    return { nos: nos, adj: adj, trechos: trechos, pedacos: pedacos, noQD: noQD, noDePonto: noDePonto, noDeCaixa: porCaixa, noDe: function (id) { return noDePonto[id]; } };
  }

  /* ---------------------------------------------------------------- ROTAS (Dijkstra do quadro)
     opc = { pontos: [ids] (só estes), permitido: function (trechoId) → bool } — o circuito só passa pelos eletrodutos dele
     (o projeto grava qual circuito vai em qual eletroduto; o feito à mão, sem registro, serve a qualquer circuito) */
  function rotas(G, opc) {
    var out = {}; opc = opc || {}; if (!G || G.noQD == null) return out;
    var perm = typeof opc.permitido === "function" ? opc.permitido : null, pesoT = typeof opc.peso === "function" ? opc.peso : null;
    var dist = {}, ant = {}, feito = {}, fila = [G.noQD]; dist[G.noQD] = 0;
    while (fila.length) {
      var bi = 0; for (var i = 1; i < fila.length; i++) if (dist[fila[i]] < dist[fila[bi]]) bi = i;
      var u = fila.splice(bi, 1)[0]; if (feito[u]) continue; feito[u] = 1;
      G.adj[u].forEach(function (e) {
        if (e.trecho && perm && !perm(e.trecho)) return;
        var nd = dist[u] + e.L * (e.trecho && pesoT ? pesoT(e.trecho) : 1) + (e.trecho ? 0 : 1e-6); if (dist[e.b] == null || nd < dist[e.b] - 1e-9) { dist[e.b] = nd; ant[e.b] = { de: u, e: e }; fila.push(e.b); }
      });
    }
    (opc.pontos || Object.keys(G.noDePonto)).forEach(function (pid) {
      var n0 = G.noDePonto[pid]; if (n0 == null || dist[n0] == null) return;
      var ped = [], ids = [], x = n0, caixas = 0, passos = [];
      while (ant[x]) { var e = ant[x].e; if (e.trecho) { ped.push({ trecho: e.trecho, L: e.L }); if (ids.indexOf(e.trecho) < 0) ids.push(e.trecho); } passos.push({ de: ant[x].de, para: x, trecho: e.trecho || null }); if (G.nos[x].tipo === "caixa") caixas++; x = ant[x].de; }
      var Lr = 0; ped.forEach(function (q) { Lr += q.L; });
      /* passos: o caminho nó a nó (do quadro ao ponto) — o js/elecircuitos.js acha nele as DERIVAÇÕES sem caixa (6.2.11.1.9) */
      out[pid] = { comprimento: r4(Lr), trechos: ids.reverse(), pedacos: ped.reverse(), caixas: caixas, passos: passos.reverse() };
    });
    return out;
  }

  /* ---------------------------------------------------------------- TRAÇADO (liga o que falta)
     o = { L (EleAuto.leitura), quadro: { id, p, topo, u, raio }, pontos: [{ id, kind, amb, pav, caixa, caixaP, luminaria, circ }],
           pesos: { circ: peso }, K (capacidade de um eletroduto em "pesos" de circuito), estado, grafoExistente, criterios }
     → { ops, trechos[{ id, op, L, apl, circuitos[] }], caixas[], atribuicao { trechoId: [circuitos] }, avisos, pendencias } */
  function tracar(o) {
    var L = o.L, T = TB(), Q = o.quadro, ops = [], novosT = [], novosK = [], avisos = [], pend = [], usados = {}, atrib = {};
    var K = num(o.K, 3), pesos = o.pesos || {};
    arr(o.estado && o.estado.instalacoes && o.estado.instalacoes.trechos).forEach(function (t) { usados[String(t.id)] = 1; });
    arr(o.estado && o.estado.instalacoes && o.estado.instalacoes.pecas).forEach(function (k) { usados[String(k.id)] = 1; });
    arr(o.estado && o.estado.familias).forEach(function (f) { usados[String(f.id)] = 1; });
    function novoId(pref) { var id = pref, k = 1; while (usados[id]) id = pref + "-" + (++k); usados[id] = 1; return id; }
    var porAmb = {}; L.ambientes.forEach(function (a) { porAmb[a.id] = a; });
    function tetoDe(a) { return a ? num(a.base, 0) + num(a.pe, 2.6) : (Q ? Q.p[1] + 1.3 : 2.6); }
    function aplTeto(a) { return a && a.forro ? "forro" : "laje"; }
    function mat(apl) { return apl === "laje" ? "elet_corrugado_ref" : "elet_corrugado"; }
    function peso(c) { return num(pesos[c], 1); }
    function pesoDe(S) { var t = 0; Object.keys(S).forEach(function (c) { t += peso(c); }); return t; }
    function uniao(a, b) { var o2 = {}; Object.keys(a).forEach(function (k) { o2[k] = 1; }); Object.keys(b).forEach(function (k) { o2[k] = 1; }); return o2; }
    /* a rede que JÁ existe: o que chega ao quadro */
    var Rx = rotas(o.grafoExistente), ligado = {};
    Object.keys(Rx).forEach(function (k) { ligado[k] = true; });
    /* ⚠ FONTE ÚNICA (integração n23, 23/10/2026): as COMPONENTES da rede que existe. O ponto que já chega por eletroduto a uma caixa
       de luminária (a descida que a "Ligação da iluminação" fez até o interruptor) NÃO ganha outra descida; e as luminárias já
       ligadas entre si formam UM hub para o tronco do quadro. Antes só valia "chega ao quadro": com a ligação em espera, cada
       interruptor e cada luminária ganhavam um segundo eletroduto ao lado do primeiro. */
    var GE = o.grafoExistente, paiC = {};
    function raiz(x) { while (paiC[x] !== x) { paiC[x] = paiC[paiC[x]]; x = paiC[x]; } return x; }
    if (GE) { GE.nos.forEach(function (nd) { paiC[nd.k] = nd.k; }); Object.keys(GE.adj).forEach(function (a) { GE.adj[a].forEach(function (e) { var ra = raiz(Number(a)), rb = raiz(e.b); if (ra !== rb) paiC[rb] = ra; }); }); }
    function compDe(pid) { if (!GE) return null; var k = GE.noDePonto[pid]; return k == null ? null : raiz(k); }
    /* os HUBS por ambiente (a caixa octogonal das luminárias); ambiente sem luminária ganha caixa de passagem no teto */
    var hubs = [], hubDeAmb = {};
    arr(o.pontos).forEach(function (q) { if (q.luminaria && q.caixaP) { var h = { id: q.id, caixa: q.caixa, p: q.caixaP, amb: q.amb, pav: q.pav, ligado: !!ligado[q.id], S: {} }; hubs.push(h); (hubDeAmb[q.amb] = hubDeAmb[q.amb] || []).push(h); } });
    arr(o.pontos).forEach(function (q) {
      if (q.luminaria || hubDeAmb[q.amb] || !porAmb[q.amb] || ligado[q.id]) return;
      var a = porAmb[q.amb], c = [num(a.cx, 0), tetoDe(a), num(a.cz, 0)];
      var id = novoId("elecp-" + a.id);
      ops.push({ op: "peca", id: id, peca: "caixa_octogonal", sistema: "eletrica", material: "pvc", x: r4(c[0]), y: r4(c[1]), z: r4(c[2]), rotY: 0 });
      novosK.push({ id: id, motivo: "caixa de passagem no teto: o ambiente não tem luminária para servir de caixa de derivação (6.2.11.1.9 b)" });
      var h = { id: id, caixa: id, p: c, amb: a.id, pav: a.pav, ligado: false, passagem: true, S: {} }; hubs.push(h); hubDeAmb[a.id] = [h];
    });
    if (!Q) return { ops: ops, trechos: novosT, caixas: novosK, atribuicao: atrib, avisos: avisos, pendencias: [{ texto: "Sem quadro de distribuição: os eletrodutos não foram traçados." }] };
    /* o hub de cada ponto (o mais perto no ambiente) e os circuitos que cada hub recebe */
    var hubDoPonto = {}, servido = {};
    arr(o.pontos).forEach(function (q) {
      if (ligado[q.id] || !q.caixaP) return;
      var hs = hubDeAmb[q.amb]; if (!hs || !hs.length) return;
      var h0 = q.luminaria ? hs.filter(function (h) { return h.id === q.id; })[0] : hs.slice().sort(function (x, y) { return d3(x.p, q.caixaP) - d3(y.p, q.caixaP); })[0];
      if (!q.luminaria) {
        var cq = compDe(q.id), hc = cq != null ? hs.filter(function (h) { return compDe(h.id) === cq; })[0] : null;   /* só o hub da MESMA sala */
        if (hc) { servido[q.id] = true; h0 = hc; }
      }
      hubDoPonto[q.id] = h0;
      if (q.circ && !h0.ligado) h0.S[q.circ] = 1;
    });
    /* os eletrodutos da LIGAÇÃO DA ILUMINAÇÃO (lig-<amb>-…) e os circuitos que já levam (o de luz da sala) */
    var luzDeAmb = {}; arr(o.pontos).forEach(function (q) { if (q.luminaria && q.circ && q.amb) (luzDeAmb[q.amb] = luzDeAmb[q.amb] || {})[q.circ] = 1; });
    var LIG = arr(o.estado && o.estado.instalacoes && o.estado.instalacoes.trechos).filter(function (t) { return t && t.sistema === "eletrica" && /^lig-/.test(String(t.id)) && t.p1 && t.p2; }).map(function (t) {
      var m = /^lig-(.+)-el-\d+$/.exec(String(t.id)); return { s: [pt(t.p1), pt(t.p2)], amb: m ? m[1] : null, S: uniao({}, (m && luzDeAmb[m[1]]) || {}) };
    });
    /* as luminárias já ligadas entre si: UMA leva o tronco (a mais perto do quadro), as outras chegam por ela */
    /* (por sala: o eletroduto de uma sala que encosta no da vizinha não faz das duas um hub só — senão o chuveiro do banheiro
       chegava pela luz do corredor, 13 m em vez de 7 m) */
    var porComp = {};
    hubs.forEach(function (h) { var c0 = compDe(h.id); if (c0 != null) (porComp[c0 + "|" + h.amb] = porComp[c0 + "|" + h.amb] || []).push(h); });
    Object.keys(porComp).forEach(function (c0) {
      var Lh = porComp[c0]; if (Lh.length < 2) return;
      if (Lh.some(function (h) { return h.ligado; })) { Lh.forEach(function (h) { h.ligado = true; }); return; }
      Lh.sort(function (x, y) { return custoQD(x) - custoQD(y); });
      Lh.slice(1).forEach(function (h) { Lh[0].S = uniao(Lh[0].S, h.S); h.S = {}; h.ligado = true; h.viaHub = Lh[0].id; });
    });
    /* ⚠ CAPACIDADE do eletroduto da ligação ENTRE as luminárias (revisão adversarial n23, 23/10/2026): o ponto servido pela luminária
       que chega pela outra (viaHub) leva os condutores dele pelo eletroduto da ligação — no SOBRADO de teste, a tomada e o split do
       quarto entravam no tubo entre as duas luminárias junto da luz (10 condutores num DN 20, que nem no DN 32 cabem pela ficha). Passou
       da capacidade (K pesos, contando a luz da sala), o ponto desce da luminária que recebe o tronco. */
    var hubPorId = {}; hubs.forEach(function (h) { hubPorId[h.id] = h; });
    arr(o.pontos).forEach(function (q) {
      var h = hubDoPonto[q.id]; if (!h || !h.viaHub || q.luminaria || servido[q.id] || ligado[q.id] || !q.circ) return;
      /* (conservador: o caminho entre as luminárias pode ser qualquer eletroduto da ligação da sala — todos contam) */
      var ligs = LIG.filter(function (Lg) { return Lg.amb === h.amb; }), S1 = {}; S1[q.circ] = 1;
      if (ligs.every(function (Lg) { return pesoDe(uniao(Lg.S, S1)) <= K + 1e-9; })) { ligs.forEach(function (Lg) { Lg.S = uniao(Lg.S, S1); }); return; }
      if (hubPorId[h.viaHub]) hubDoPonto[q.id] = hubPorId[h.viaHub];
    });
    /* sobreposição no MESMO EIXO (um eletroduto por cima do outro) de [p, q] com os que já existem e os que este traçado já pôs */
    var POSTOS = arr(o.estado && o.estado.instalacoes && o.estado.instalacoes.trechos).filter(function (t) { return t && t.sistema === "eletrica" && t.p1 && t.p2 && !/^lig-/.test(String(t.id)); }).map(function (t) { return [pt(t.p1), pt(t.p2)]; });
    function sobreposto(p, q, lista, tol) {
      var L0 = d3(p, q); if (L0 < 0.01) return 0;
      var u = [(q[0] - p[0]) / L0, (q[1] - p[1]) / L0, (q[2] - p[2]) / L0], tot = 0;
      lista.forEach(function (s) {
        var w = [s[1][0] - s[0][0], s[1][1] - s[0][1], s[1][2] - s[0][2]], Lw = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]); if (Lw < 0.01) return;
        if (Math.abs(Math.abs((u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / Lw) - 1) > 1e-3) return;
        function pj(r) { var v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]], t = v[0] * u[0] + v[1] * u[1] + v[2] * u[2], x = [v[0] - u[0] * t, v[1] - u[1] * t, v[2] - u[2] * t]; return { t: t, d: Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]) }; }
        var a0 = pj(s[0]), a1 = pj(s[1]); if (a0.d > tol || a1.d > tol) return;
        tot += Math.max(0, Math.min(L0, Math.max(a0.t, a1.t)) - Math.max(0, Math.min(a0.t, a1.t)));
      });
      return tot;
    }
    /* ⚠ CAPACIDADE do eletroduto da ligação (revisão adversarial n23, 23/10/2026): o tronco só passa POR DENTRO do eletroduto da sala
       se o conjunto (o circuito de luz dela + os do tronco + os de outro tronco que já passou ali) cabe em K "pesos". Roteiro do
       defeito: na casa de teste (ordem pontos → ligação → circuitos) o tronco da área de serviço (C2, C5, C9) entrava no eletroduto
       do ponto de luz do quarto 2 (C10): 4 circuitos e 11 condutores num DN 20, que nem num DN 32 cabem pela ficha do fabricante
       (6.2.11.1.6 a) — o lançador deixava o DN 20 sem pendência e o auditor acusava "lotado". Acima da capacidade o tronco passa AO
       LADO (desvio de PAR, com entrada e saída em diagonal curta). */
    function cabeNoLig(Lg, circs) { return pesoDe(uniao(Lg.S, circs || {})) <= K + 1e-9; }
    function recortar(a, b, circs, simular) {
      var L0 = d3(a, b); if (!LIG.length || L0 < 0.01) return [[a, b]];
      var u = [(b[0] - a[0]) / L0, (b[1] - a[1]) / L0, (b[2] - a[2]) / L0], tiras = [];
      LIG.forEach(function (Lg) {
        var s = Lg.s, w = [s[1][0] - s[0][0], s[1][1] - s[0][1], s[1][2] - s[0][2]], Lw = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]); if (Lw < 0.01) return;
        if (Math.abs(Math.abs((u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / Lw) - 1) > 1e-3) return;
        function proj(p) { var q = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], t = q[0] * u[0] + q[1] * u[1] + q[2] * u[2], r = [q[0] - u[0] * t, q[1] - u[1] * t, q[2] - u[2] * t]; return { t: t, d: Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) }; }
        var p0 = proj(s[0]), p1 = proj(s[1]); if (p0.d > TOL || p1.d > TOL) return;
        var lo = Math.max(0, Math.min(p0.t, p1.t)), hi = Math.min(L0, Math.max(p0.t, p1.t)); if (hi - lo > 0.02) tiras.push({ lo: lo, hi: hi, lig: Lg, cabe: cabeNoLig(Lg, circs) });
      });
      if (!tiras.length) return [[a, b]];
      tiras.sort(function (x, y) { return x.lo - y.lo; });
      var out = [], cur = 0;
      function P(t) { return [a[0] + u[0] * t, a[1] + u[1] * t, a[2] + u[2] * t]; }
      /* a direção do desvio: horizontal, perpendicular ao eletroduto (na vertical, ao longo da parede do quadro) */
      var nH = Math.abs(u[1]) > 0.9 ? (Q && Q.u ? [Q.u[0], 0, Q.u[1]] : [1, 0, 0]) : [-u[2], 0, u[0]], ln = Math.sqrt(nH[0] * nH[0] + nH[2] * nH[2]) || 1; nH = [nH[0] / ln, 0, nH[2] / ln];
      tiras.forEach(function (ti) {
        if (ti.cabe) {
          if (ti.lo - cur > 0.005) out.push([P(cur), P(ti.lo)]);
          if (!simular) ti.lig.S = uniao(ti.lig.S, circs || {});
          cur = Math.max(cur, ti.hi); return;
        }
        if (ti.hi <= cur + 0.005) return;
        var A0 = Math.max(cur, ti.lo - 0.10), B0 = Math.min(L0, ti.hi + 0.10), sD = Math.min(0.10, (B0 - A0) / 3);
        var lados = [[1, 1], [-1, 1], [1, 2], [-1, 2]], esc = null;
        lados.forEach(function (lv) {
          if (esc) return;
          var dlt = lv[0] * lv[1] * PAR, off = [nH[0] * dlt, 0, nH[2] * dlt], q1 = P(A0 + sD), q2 = P(B0 - sD);
          q1 = [q1[0] + off[0], q1[1], q1[2] + off[2]]; q2 = [q2[0] + off[0], q2[1], q2[2] + off[2]];
          if (!sobreposto(q1, q2, LIG.map(function (x) { return x.s; }).concat(POSTOS), TOL)) esc = [q1, q2];
        });
        if (!esc) { var dl = PAR, q1b = P(A0 + sD), q2b = P(B0 - sD); esc = [[q1b[0] + nH[0] * dl, q1b[1], q1b[2] + nH[2] * dl], [q2b[0] + nH[0] * dl, q2b[1], q2b[2] + nH[2] * dl]]; }
        if (A0 - cur > 0.005) out.push([P(cur), P(A0)]);
        out.push([P(A0), esc[0]], [esc[0], esc[1]], [esc[1], P(B0)]);
        cur = B0;
      });
      if (L0 - cur > 0.005) out.push([P(cur), b]);
      return out;
    }
    /* um trecho do lançador (aplicação explícita: o método de instalação da Tabela 33 sai dela) */
    function trecho(pref, p1, p2, apl, circs) {
      if (d3(p1, p2) < 0.005) return null;
      var id = novoId(pref);
      var op = { op: "trecho", id: id, sistema: "eletrica", material: mat(apl), dn: 20, p1: obj(p1), p2: obj(p2), aplicacao: apl };
      ops.push(op); var reg = { id: id, op: op, L: d3(p1, p2), apl: apl, circuitos: Object.keys(circs || {}).sort() }; novosT.push(reg); POSTOS.push([p1, p2]);
      atrib[id] = reg.circuitos;
      return op;
    }
    /* uma corrida entre caixas: lista de pontos 3D (cada mudança de direção = uma curva de 90°) + aplicação de cada lado;
       caixa de passagem onde o trecho contínuo passa do limite da 6.2.11.1.6 b) ou das 3 curvas da 6.2.11.1.7 */
    var EL = T.ELETRODUTO;
    function corrida(pref, P, apls, circs) {
      function limite(c) { return EL.trechoInterno_m - EL.reducaoPorCurva_m * c; }
      function passagem(q, apl, motivo) {
        var idc = novoId("elecp-" + pref.replace(/^elec-/, ""));
        ops.push({ op: "peca", id: idc, peca: apl === "parede" ? "caixa_4x4" : "caixa_octogonal", sistema: "eletrica", material: "pvc", x: r4(q[0]), y: r4(q[1]), z: r4(q[2]), rotY: 0 });
        novosK.push({ id: idc, motivo: motivo });
      }
      var pedaco = [], acc = 0, nSeg = 0;
      /* ⚠ o pedaço que corre DENTRO de um eletroduto da ligação da iluminação (lig-) não é traçado de novo: o tronco usa o que já
         existe (o grafo liga as pontas pelo tê) — antes nascia outro tubo por baixo e o da ligação ficava sem circuito, cobrado e
         sem fio (revisão adversarial, integração n23) */
      function poe(a, b, apl) { recortar(a, b, circs).forEach(function (s) { var t = trecho(pref + "-" + (nSeg++), s[0], s[1], apl, circs); if (t) { pedaco.push(t); acc += d3(s[0], s[1]); } }); }
      for (var i = 0; i + 1 < P.length; i++) {
        var a = P[i], b = P[i + 1], Ls = d3(a, b), apl = apls[i], c = pedaco.length;   /* juntar este segmento = mais uma curva */
        if (Ls < 0.005) continue;
        if (pedaco.length && (acc + Ls > limite(c) + 1e-9 || c > EL.curvasMax)) {
          passagem(a, apl, "trecho contínuo de " + (Math.round((acc + Ls) * 100) / 100) + " m com " + c + " curva(s) passaria do limite (" + limite(c) + " m; no máximo " + EL.curvasMax + " curvas — " + T.n5410(EL.item) + ")");
          pedaco = []; acc = 0; c = 0;
        }
        if (Ls > limite(0) + 1e-9) {
          var n = Math.ceil(Ls / limite(0) - 1e-9), prev = a;
          if (pedaco.length) passagem(a, apl, "antes da reta longa (" + T.n5410(EL.item) + ")");
          for (var k = 1; k <= n; k++) {
            var q = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, a[2] + (b[2] - a[2]) * k / n];
            pedaco = []; acc = 0; poe(prev, q, apl);
            if (k < n) passagem(q, apl, "reta de " + (Math.round(Ls * 100) / 100) + " m sem caixa passaria de " + limite(0) + " m (" + T.n5410(EL.item) + ")");
            prev = q;
          }
          continue;
        }
        poe(a, b, apl);
      }
    }
    /* L em planta entre dois pontos no MESMO nível (primeiro x, depois z); off = deslocamento do eletroduto paralelo */
    function emL(a, b, y, off, ordem) {
      off = off || 0;
      var A = [a[0] + off, y, a[2] + off], B = [b[0], y, b[2]], L0;
      if (Math.abs(A[0] - B[0]) < 0.01 || Math.abs(A[2] - B[2]) < 0.01) L0 = [A, B];
      else if (ordem === "z") L0 = [A, [A[0], y, B[2]], B];
      else L0 = [A, [B[0] + off, y, A[2]], [B[0] + off, y, B[2]], B];
      return L0.filter(function (p, i) { return i === 0 || d3(p, L0[i - 1]) > 0.005; });
    }
    /* ⚠ das duas L (primeiro x ou primeiro z), a que NÃO corre no mesmo eixo de um eletroduto que já existe nem entra num da ligação
       acima da capacidade (revisão adversarial n23, 23/10/2026). Roteiro do defeito: só havia "primeiro x"; com o quadro numa parede
       ao longo de x, as subidas saíam lado a lado e as pernas deitadas caíam TODAS na mesma linha — na casa de teste, 68 pares de
       eletrodutos um por cima do outro (66 m de 208 m), e o grafo lia cada encontro como derivação (tê sem caixa) e passava fio de um
       tronco para o outro. Empate: primeiro x (o traçado de antes). */
    function emLmelhor(a, b, y, circs, antes) {
      var cs = [emL(a, b, y, 0, "x"), emL(a, b, y, 0, "z")], best = null;
      var acima = LIG.filter(function (Lg) { return !cabeNoLig(Lg, circs); }).map(function (Lg) { return Lg.s; });
      cs.forEach(function (Lc, i) {
        var P0 = (antes || []).concat(Lc), sc = 0;
        for (var k = 1; k < P0.length; k++) sc += sobreposto(P0[k - 1], P0[k], POSTOS, 0.02) + 10 * sobreposto(P0[k - 1], P0[k], acima, TOL);
        if (!best || sc < best.sc - 1e-6) best = { sc: sc, L: Lc, i: i };
      });
      return best.L;
    }
    /* ---------- a árvore dos hubs, com CAPACIDADE: cada eletroduto leva no máximo K "pesos" de circuito (critério RA; o aparelho
       pesado vai sozinho) — sem isso o tronco junto do quadro levava todos os circuitos (fator de agrupamento de 10 circuitos, 0,50,
       e 30 condutores num DN 32) */
    var arestas = [], ramais = 0;
    function caminho(h) { var L0 = []; var x = h; while (x && x.aresta) { L0.push(x.aresta); x = x.aresta.pai; } return L0; }
    var fora = hubs.filter(function (h) { return !h.ligado && Object.keys(h.S).length; });
    hubs.forEach(function (h) { if (!h.ligado && !Object.keys(h.S).length) h.semCircuito = true; });
    var naArvore = [];
    function custoQD(h) { return Math.abs(h.p[0] - Q.p[0]) + Math.abs(h.p[2] - Q.p[2]) + Math.abs(h.p[1] - Q.topo[1]) + 0.5; }
    while (fora.length) {
      var best = null;
      fora.forEach(function (h) {
        var c0 = custoQD(h); if (!best || c0 < best.c) best = { h: h, de: null, c: c0 };
        if (pesoDe(h.S) > K) return;
        naArvore.forEach(function (d) {
          if (d.terminal || d.pav !== h.pav) return;
          var cam = caminho(d), ok = cam.every(function (e) { return pesoDe(uniao(e.S, h.S)) <= K; });
          if (!ok) return;
          var c1 = Math.abs(h.p[0] - d.p[0]) + Math.abs(h.p[2] - d.p[2]) + Math.abs(h.p[1] - d.p[1]);
          if (c1 < best.c - 1e-9) best = { h: h, de: d, c: c1 };
        });
      });
      var h = best.h;
      if (best.de) {
        var e = { pai: best.de, filho: h, S: uniao({}, h.S) }; arestas.push(e); h.aresta = e;
        caminho(best.de).forEach(function (x) { x.S = uniao(x.S, h.S); });
      } else {
        /* direto do quadro; acima da capacidade: um ramal por pacote (empacotamento pelo peso) */
        var cs = Object.keys(h.S).sort(function (x, y) { return peso(y) - peso(x) || (x < y ? -1 : 1); }), pacotes = [];
        cs.forEach(function (c) { var alvo = pacotes.filter(function (p) { return pesoDe(p) + peso(c) <= K; })[0]; if (!alvo) { alvo = {}; pacotes.push(alvo); } alvo[c] = 1; });
        pacotes.forEach(function (S, i) { var e2 = { pai: null, filho: h, S: S, paralelo: i }; arestas.push(e2); if (i === 0) h.aresta = e2; });
        if (pacotes.length > 1) h.terminal = true;
      }
      h.ligado = true; naArvore.push(h); fora.splice(fora.indexOf(h), 1);
    }
    /* ---------- a geometria das arestas da árvore */
    arestas.forEach(function (e) {
      var h = e.filho, a0 = porAmb[h.amb], yT = h.p[1];
      if (!e.pai) {
        /* a SUBIDA do quadro (uma por ramal, lado a lado na parede) e o teto em L até o hub */
        /* a subida: lado a lado ao longo da parede, dentro da largura do quadro + 25 cm; passou disso, uma segunda fileira junto da parede */
        var u = Q.u || [1, 0], dq = Q.dir || [0, 1], porFila = Math.max(1, Math.floor((num(Q.largura, 0.4) / 2 + 0.25) / PAR) * 2 + 1), fila = Math.floor(ramais / porFila), kf = ramais % porFila;
        var off = (kf % 2 ? 1 : -1) * Math.ceil(kf / 2) * PAR, base = [Q.topo[0] + u[0] * off - dq[0] * PAR * fila, Q.topo[1], Q.topo[2] + u[1] * off - dq[1] * PAR * fila];
        var topoS = [base[0], yT, base[2]], P = [base, topoS].concat(emLmelhor(topoS, h.p, yT, e.S, [base]).slice(1)), apls = ["parede"];
        for (var k = 2; k < P.length; k++) apls.push(aplTeto(a0));
        corrida("elec-QD-" + h.id, P, apls, e.S);
        ramais++;
      } else {
        /* tetos de alturas diferentes (pé-direito de 2,60 num cômodo e 2,80 no vizinho): primeiro o degrau na vertical, na própria caixa */
        var P2 = emLmelhor(e.pai.p, h.p, yT, e.S), ap2 = [];
        if (Math.abs(e.pai.p[1] - yT) > 0.005) { P2.unshift([e.pai.p[0], e.pai.p[1], e.pai.p[2]]); ap2.push("parede"); }
        for (var k2 = ap2.length + 1; k2 < P2.length; k2++) ap2.push(aplTeto(a0));
        corrida("elec-" + e.pai.id + "-" + h.id, P2, ap2, e.S);
      }
    });
    /* ---------- cada ponto de parede: do hub do ambiente, pelo teto, e a descida na parede (leva só o circuito dele) */
    arr(o.pontos).forEach(function (q) {
      if (q.luminaria || ligado[q.id] || servido[q.id] || !q.caixaP) return;
      var h0 = hubDoPonto[q.id];
      if (!h0) { pend.push({ ponto: q.id, texto: "O ponto " + q.id + " está fora de ambiente delimitado: ligue o eletroduto à mão." }); return; }
      var a = porAmb[q.amb], yT = h0.p[1], S = {}; if (q.circ) S[q.circ] = 1;
      var acima = [q.caixaP[0], yT, q.caixaP[2]], P = emLmelhor(h0.p, acima, yT, S), apls = [];
      for (var k = 1; k < P.length; k++) apls.push(aplTeto(a));
      var topoCx = [q.caixaP[0], q.caixaP[1] + 0.026, q.caixaP[2]];
      if (q.caixaP[1] < yT - 0.05) { P.push(topoCx); apls.push("parede"); }
      corrida("elec-" + h0.id + "-" + q.id, P, apls, S);
    });
    return { ops: ops, trechos: novosT, caixas: novosK, atribuicao: atrib, avisos: avisos, pendencias: pend };
  }

  var EleTracado = { grafo: grafo, rotas: rotas, tracar: tracar, TOL: TOL, CAPT: CAPT, PAR: PAR };
  global.EleTracado = EleTracado;
  if (typeof module !== "undefined" && module.exports) module.exports = EleTracado;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

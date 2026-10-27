/* =====================================================================
 * bimapoiar.js — APOIAR EM… (motor PURO, ES5, sem DOM, Node-testável).
 * 27/10/2026, pedido do Rogério: "clicar na caixa d'água, identificou ela, aí eu clico agora onde vai ser o apoio dela,
 * aí ela pega e baixa para aquele apoio. Ou subir." (no print dele a caixa do Hidro flutua acima do telhado).
 *
 * O QUE ACONTECIA: o Mover é de planta (dx, dz) e o Elevar pede a distância digitada. Para encostar uma peça numa
 * superfície era preciso ler a cota do telhado, medir a base da peça e fazer a conta.
 *
 * A REGRA (decidida com o Rogério)
 *   1. o 1º clique escolhe a peça (ou vale a seleção); o 2º é em QUALQUER superfície: laje, forro, telhado, piso,
 *      estrado, terreno, outra peça;
 *   2. a peça só anda em Y: a face de BAIXO dela encosta na cota do apoio; X e Z ficam;
 *   3. superfície inclinada ou irregular (o telhado): vários raios para baixo sob a PEGADA da peça (centro, cantos e
 *      meios das arestas, em planta) e vale a cota MAIS ALTA atingida — a peça nunca entra no telhado. Quando as cotas
 *      da pegada diferem, o aviso diz "apoio inclinado: apoiada no ponto mais alto da pegada";
 *   4. só conta a superfície CLICADA (os raios do js/bim.js trazem tudo o que atravessam; aqui se fica com o elemento
 *      clicado). A própria peça e as ligadas a ela (tubos) nunca contam — senão a caixa "se apoiaria" em si mesma;
 *   5. é UMA operação do editor: a MESMA op `elevar` do Elevar (js/bimelevar.js), por isso as ligações, os vínculos
 *      (Alt = só a seleção) e o Ctrl+Z são os de hoje. Peça pronta (componente) leva as partes juntas.
 *
 * Aqui mora só a conta. A cena (raios, fantasma, cliques) é do js/bim.js e do js/bimapoiarui.js.
 * Teste: node tools/test-bim-apoiar.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function EL() { return dep("BimElevar", "./bimelevar.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function br(v) { return (Math.round(num(v, 0) * 100) / 100).toFixed(2).replace(".", ","); }

  /* acima disto as cotas da pegada "diferem": 2 cm cobre a dobra de uma laje e o arredondamento da malha, e não cobre telhado */
  var TOL_INCL = 0.02;
  /* menos que isto a peça já está na cota (meio milímetro de malha não é "subir") */
  var TOL_JA = 0.0005;
  var AVISO_INCLINADO = "apoio inclinado: apoiada no ponto mais alto da pegada";

  /* ---------------------------------------------------------------- a pegada
   * cx = { min:[x,y,z], max:[x,y,z] } (a caixa 3D da peça, em coordenadas do modelo). Devolve uma malha de n × n pontos em
   * planta (padrão 5 × 5 = 25), com o CENTRO primeiro, e sempre os 4 cantos e os meios das arestas. Por que 5 e não 3: numa
   * crista de telhado que cruza a pegada entre dois pontos, o erro é a inclinação × metade do passo — com 3 × 3 numa peça de
   * 1,2 m e 30° seriam 17 cm de a peça entrar no telhado; com 5 × 5, 9 cm. Peça mais fina que 2 cm numa direção
   * perde os pontos repetidos; sem área nenhuma vira um ponto só. */
  function pontosPegada(cx, n) {
    if (!cx || !arr(cx.min).length || !arr(cx.max).length) return [];
    var x0 = num(cx.min[0], NaN), x1 = num(cx.max[0], NaN), z0 = num(cx.min[2], NaN), z1 = num(cx.max[2], NaN);
    if (!(fin(x0) && fin(x1) && fin(z0) && fin(z1))) return [];
    n = Math.max(3, Math.min(9, Math.round(num(n, 5))));
    function passos(a, b) { if (b - a < 0.02) return [r4((a + b) / 2)]; var o = [], v; for (var i = 0; i < n; i++) { v = r4(a + (b - a) * i / (n - 1)); if (o.indexOf(v) < 0) o.push(v); } return o; }
    var xs = passos(x0, x1), zs = passos(z0, z1), xm = r4((x0 + x1) / 2), zm = r4((z0 + z1) / 2), out = [{ x: xm, z: zm }];
    xs.forEach(function (x) { zs.forEach(function (z) { if (x === xm && z === zm) return; out.push({ x: x, z: z }); }); });
    return out;
  }

  /* O CONTORNO da pegada a cada 1 cm + a malha interna de 9 × 9 (2ª etapa do pedido de 27/10: "nunca entrar no telhado").
   * Por que o contorno: a crista de um telhado de duas ou mais águas que cruza a pegada atravessa também a BORDA dela (a crista é a
   * linha mais alta e é reta), e na borda o passo de 1 cm limita o erro a inclinação × 0,5 cm (≈ 3 mm a 30°). A malha interna cobre o
   * ápice de uma água só em pirâmide, que fica dentro da pegada. O passo sobe sozinho em peça enorme, para não passar de ~2000 raios. */
  function pontosFinos(cx, passo) {
    var base = pontosPegada(cx, 9);
    if (!base.length) return base;
    var x0 = Number(cx.min[0]), x1 = Number(cx.max[0]), z0 = Number(cx.min[2]), z1 = Number(cx.max[2]);
    var per = 2 * ((x1 - x0) + (z1 - z0)), pa = Math.max(num(passo, 0.01), per / 1500), vistos = {}, out = base.slice();
    base.forEach(function (p) { vistos[p.x + "|" + p.z] = 1; });
    function add(x, z) { var q = { x: r4(x), z: r4(z) }, k = q.x + "|" + q.z; if (!vistos[k]) { vistos[k] = 1; out.push(q); } }
    var nx = Math.max(1, Math.ceil((x1 - x0) / pa)), nz = Math.max(1, Math.ceil((z1 - z0) / pa)), i;
    for (i = 0; i <= nx; i++) { var x = x0 + (x1 - x0) * i / nx; add(x, z0); add(x, z1); }
    for (i = 0; i <= nz; i++) { var z = z0 + (z1 - z0) * i / nz; add(x0, z); add(x1, z); }
    return out;
  }

  /* REFINO em volta do melhor ponto (o ápice de uma pirâmide dentro da pegada não está no contorno nem na malha): 5 × 5 pontos num
   * quadrado de lado 2 × passo em volta do melhor, cortado pela pegada. Quem chama repete com o passo cada vez menor (a metade) —
   * em 4 voltas, de 0,25 m a 1,5 cm. → { pontos, passo (o próximo) } */
  function vizinhos(melhor, passo, cx) {
    var x0 = Number(cx.min[0]), x1 = Number(cx.max[0]), z0 = Number(cx.min[2]), z1 = Number(cx.max[2]), out = [], i, j;
    for (i = -2; i <= 2; i++) for (j = -2; j <= 2; j++) {
      if (!i && !j) continue;
      var x = Math.min(x1, Math.max(x0, melhor.x + i * passo / 2)), z = Math.min(z1, Math.max(z0, melhor.z + j * passo / 2));
      out.push({ x: r4(x), z: r4(z) });
    }
    return { pontos: out, passo: passo / 2 };
  }

  /* ---------------------------------------------------------------- os raios → as cotas
   * raios = [{ x, z, hits:[{ y, uid }] }] (o que a cena devolveu: tudo o que o raio vertical atravessou).
   * o = { alvo: uid da superfície clicada (null = a de cima que não seja excluída), excluir: [uid…] (a peça e as ligadas) }.
   * → [{ x, z, y (null = o raio não acertou a superfície), uid }]
   * Por que filtrar aqui: o raio de cima para baixo bate no telhado ANTES da laje que está sob ele; só o elemento clicado define o apoio. */
  function amostrar(raios, o) {
    o = o || {};
    var fora = {}; arr(o.excluir).forEach(function (u) { fora[String(u)] = 1; });
    var alvo = o.alvo == null ? null : String(o.alvo);
    return arr(raios).map(function (r) {
      var hs = arr(r && r.hits).filter(function (h) { return h && fin(num(h.y, NaN)); }).slice().sort(function (a, b) { return b.y - a.y; });
      var ach = null;
      for (var i = 0; i < hs.length && !ach; i++) {
        var u = String(hs[i].uid == null ? "" : hs[i].uid);
        if (fora[u]) continue;
        if (alvo != null && u !== alvo) continue;
        ach = hs[i];
      }
      return { x: r && r.x, z: r && r.z, y: ach ? r4(ach.y) : null, uid: ach ? String(ach.uid) : null };
    });
  }

  /* a cota de apoio = a MAIS ALTA entre as amostras que acertaram.
   * o = { yClique } — a cota do ponto clicado, usada só quando NENHUM raio acerta (a pegada passou da borda da superfície).
   * → { ok, cota, usados, sem, ymin, ymax, spread, inclinado, deClique, avisos[], erro } */
  function cotaApoio(amostras, o) {
    o = o || {};
    var ys = arr(amostras).filter(function (a) { return a && fin(a.y); }).map(function (a) { return a.y; });
    var sem = arr(amostras).length - ys.length;
    if (!ys.length) {
      if (fin(num(o.yClique, NaN))) return { ok: true, cota: r4(Number(o.yClique)), usados: 0, sem: sem, spread: 0, inclinado: false, deClique: true, avisos: ["nenhum raio achou a superfície sob a pegada: usei a cota do ponto clicado"], erro: null };
      return { ok: false, cota: null, usados: 0, sem: sem, spread: 0, inclinado: false, deClique: false, avisos: [], erro: "Não achei a superfície sob a peça: clique numa laje, forro, telhado, piso ou outra peça." };
    }
    var ymax = Math.max.apply(null, ys), ymin = Math.min.apply(null, ys), spread = r4(ymax - ymin), inc = spread > TOL_INCL, avisos = [];
    if (inc) avisos.push(AVISO_INCLINADO);
    if (sem > 0 && ys.length) avisos.push(sem + (sem === 1 ? " ponto da pegada fica fora da superfície" : " pontos da pegada ficam fora da superfície"));
    return { ok: true, cota: r4(ymax), usados: ys.length, sem: sem, ymin: r4(ymin), ymax: r4(ymax), spread: spread, inclinado: inc, deClique: false, avisos: avisos, erro: null };
  }

  /* "base a 6,35 m (sobe 0,42)" */
  function rotulo(base, cota) {
    if (!fin(base) || !fin(cota)) return "";
    var dy = r4(cota - base), t = "base a " + br(cota) + " m";
    if (Math.abs(dy) <= TOL_JA) return t + " (já apoiada)";
    return t + " (" + (dy > 0 ? "sobe " : "desce ") + br(Math.abs(dy)) + ")";
  }

  /* ---------------------------------------------------------------- a peça no estado
   * As partes de uma PEÇA PRONTA (componente: `pronta` igual) vão todas, mesmo com uma só selecionada. Mesma regra do
   * BimElevarUI.expandirProntas, aqui pura para o teste. → { ids, expandiu: n } */
  function expandir(estado, ids) {
    var out = [], na = {};
    arr(ids).forEach(function (x) { var s = String(x).replace(/^edit:/, ""); if (!na[s]) { na[s] = 1; out.push(s); } });
    var chaves = {};
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.pronta != null && na[String(c.id)]) chaves[String(c.pronta)] = 1; });
    var n0 = out.length;
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.pronta != null && chaves[String(c.pronta)] && !na[String(c.id)]) { na[String(c.id)] = 1; out.push(String(c.id)); } });
    return { ids: out, expandiu: out.length - n0 };
  }

  /* a caixa 3D aproximada pelo ESTADO (o teste e o caso sem malha): caixa girada → o retângulo envolvente; família → só o ponto
   * (a altura dela vem do desenho, que o estado não tem). Na tela vale a malha (BIM.apoiarCaixa). */
  function caixaDoEstado(estado, ids) {
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], n = 0;
    function pt(x, y, z) { min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z); max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z); }
    var que = {}; arr(ids).forEach(function (i) { que[String(i).replace(/^edit:/, "")] = 1; });
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || !que[String(c.id)]) return;
      var L = num(c.comprimento, 0) / 2, E = num(c.espessura, 0) / 2, t = num(c.rotY, 0), co = Math.cos(t), si = Math.sin(t);
      var hx = Math.abs(L * co) + Math.abs(E * si), hz = Math.abs(L * si) + Math.abs(E * co), cy = num(c.cy, 0), h = num(c.altura, 0) / 2;
      pt(num(c.cx, 0) - hx, cy - h, num(c.cz, 0) - hz); pt(num(c.cx, 0) + hx, cy + h, num(c.cz, 0) + hz); n++;
    });
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || !que[String(f.id)]) return;
      pt(num(f.x, 0), num(f.y, 0), num(f.z, 0)); n++;
    });
    return n ? { min: min.map(r4), max: max.map(r4), n: n, aproximada: true } : null;
  }

  /* ---------------------------------------------------------------- o plano
   * A conta termina num `dy`; a gravação é a do Elevar (BimElevar.planoDelta → opFinal → BIM.editarLote), com os vínculos.
   * base = a cota da face de baixo da peça (a malha na tela; o estado no teste).
   * → { ok, dy, ids, plano, rotulo, ja?, erro } */
  function planejar(estado, ids, cota, base) {
    var E = EL();
    if (!E) return { ok: false, erro: "O motor do Elevar (js/bimelevar.js) não carregou." };
    if (!fin(num(cota, NaN)) || !fin(num(base, NaN))) return { ok: false, erro: "Sem a cota do apoio ou da base da peça." };
    var ex = expandir(estado, ids), dy = r4(Number(cota) - Number(base));
    if (!ex.ids.length) return { ok: false, erro: "Selecione a peça que vai subir ou descer." };
    var rot = rotulo(Number(base), Number(cota));
    if (Math.abs(dy) <= TOL_JA) return { ok: false, ja: true, dy: 0, ids: ex.ids, rotulo: rot, erro: "A peça já está apoiada nessa cota (base a " + br(cota) + " m)." };
    var plano = E.planoDelta(estado, ex.ids, dy);
    return { ok: !!plano.ok, dy: dy, ids: ex.ids, expandiu: ex.expandiu, plano: plano, rotulo: rot, erro: plano.ok ? null : (plano.erro || "Nada se moveu.") };
  }

  /* ---------------------------------------------------------------- a REDE LIGADA vai junto
   * Pedido do coordenador (27/10): "ficar com a peça ligada e os tubos para trás não serve — encaixe perfeito".
   * A regra (a do Alinhar para a família, js/bimalinharinst.js, mas em Y):
   *   · parte-se dos conectores da peça (na pose de ANTES) e dos tubos que têm uma ponta neles;
   *   · tubo NÃO vertical (barrilete, ramal): anda inteiro o dy, e a busca segue pelas pontas dele para os tubos vizinhos;
   *   · o PRIMEIRO tubo vertical do caminho (prumada, coluna, descida) só mexe a ponta que estava no nó que andou: estica ou
   *     encurta para absorver o dy, a outra ponta e tudo depois dele ficam onde estão — a busca PARA ali;
   *   · sem tubo vertical no caminho, a busca não para: a rede inteira ligada anda junto;
   *   · vertical que ficaria com menos de 5 cm (ou, fora da água, viraria do avesso) não absorve: anda inteiro e a busca segue por ele.
   * ctx = { I: BimInst, avaliar(famId, tipoId, inst) }.  → { ops[], ajustados, esticados, deslocados, avisos[] } — as ops são `trecho`
   * (a mesma que o arrastar da rede grava), para irem no MESMO lote do `elevar`: um Ctrl+Z desfaz tudo. */
  function levarRede(estado, ids, dy, ctx) {
    var out = { ops: [], ajustados: 0, esticados: 0, deslocados: 0, acessorios: 0, avisos: [] }, movidos = {};
    var I = ctx && ctx.I, trechos = arr(estado && estado.instalacoes && estado.instalacoes.trechos);
    if (!I || !fin(dy) || Math.abs(dy) < 1e-6 || !trechos.length) return out;
    var que = {}; arr(ids).forEach(function (x) { que[String(x).replace(/^edit:/, "")] = 1; });
    var TOLC = (num(I.TOL, 0.01) + num(I.TOL_CONECTOR, 0)) * 2, TOL = Math.max(num(I.TOL, 0.01), 0.005), MIN = 0.05, VERT = 0.02;
    function d3(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)); }
    var G = {};
    trechos.forEach(function (t) { G[t.id] = { t: t, p1: { x: t.p1.x, y: t.p1.y, z: t.p1.z }, p2: { x: t.p2.x, y: t.p2.y, z: t.p2.z }, mudou: false, feito: false, pontas: {} }; });
    function vertical(t) { return Math.sqrt(Math.pow(t.p2.x - t.p1.x, 2) + Math.pow(t.p2.z - t.p1.z, 2)) <= VERT && Math.abs(t.p2.y - t.p1.y) > VERT; }
    /* os nós de partida: os conectores das famílias que andam */
    var fila = [];
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || !que[String(f.id)] || !f.famId) return;
      var cs = []; try { cs = I.conectoresDe(ctx.avaliar ? ctx.avaliar(f.famId, f.tipoId, f.inst) : null, { id: f.id, x: f.x, y: f.y, z: f.z, rotY: f.rotY }) || []; } catch (e) { cs = []; }
      cs.forEach(function (k) { fila.push({ x: k.x, y: k.y, z: k.z, tol: TOLC }); });
    });
    /* o ponto q no INTERIOR do segmento a–b (longe das pontas): derivação (tê) no meio de um tubo */
    function noMeio(q, a, b) {
      var ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z; if (!(L2 > 1e-12)) return false;
      var s = ((q.x - a.x) * ab.x + (q.y - a.y) * ab.y + (q.z - a.z) * ab.z) / L2, L = Math.sqrt(L2);
      if (s * L <= TOL || (1 - s) * L <= TOL) return false;
      return d3(q, { x: a.x + ab.x * s, y: a.y + ab.y * s, z: a.z + ab.z * s }) <= TOL;
    }
    /* o tubo anda inteiro o dy; a busca segue pelas pontas dele, pelos ramais que chegam no MEIO dele e pelo tubo-tronco em que
       uma ponta dele chega no meio (se o tronco é uma prumada e a ponta continua dentro dela, a ponta só desliza nela) */
    function andar(t) {
      var g = G[t.id]; if (g.feito) return;
      g.p1 = { x: t.p1.x, y: r4(t.p1.y + dy), z: t.p1.z }; g.p2 = { x: t.p2.x, y: r4(t.p2.y + dy), z: t.p2.z };
      g.pontas.p1 = g.pontas.p2 = true; g.mudou = true; g.feito = true; out.deslocados++; out.ajustados++;
      [t.p1, t.p2].forEach(function (q) {
        fila.push({ x: q.x, y: q.y, z: q.z, tol: TOL });
        trechos.forEach(function (u) {
          var gu = G[u.id]; if (gu.feito || u === t) return;
          if (noMeio(q, u.p1, u.p2)) {
            var yMin = Math.min(u.p1.y, u.p2.y), yMax = Math.max(u.p1.y, u.p2.y), yN = q.y + dy;
            if (vertical(u) && yN > yMin + 0.02 && yN < yMax - 0.02) return;   /* a ponta desliza na prumada */
            andar(u);
          }
        });
      });
      trechos.forEach(function (v) {   /* ramais que chegam no meio dele */
        if (G[v.id].feito || v === t) return;
        ["p1", "p2"].forEach(function (k) { if (noMeio(v[k], t.p1, t.p2)) fila.push({ x: v[k].x, y: v[k].y, z: v[k].z, tol: TOL }); });
      });
    }
    /* o extravasor e a limpeza da caixa (saída livre, sem conector) estão fixados nas paredes dela: andam com ela */
    arr(estado.familias).forEach(function (f) {
      if (!f || !que[String(f.id)]) return;
      var id = String(f.id).replace(/[^A-Za-z0-9_-]/g, "\\$&"), re = new RegExp("^(extravasor|limpeza) da caixa " + id + "(\\W|$)");
      trechos.forEach(function (t) { if (re.test(String(t.saidaLivre || ""))) andar(t); });
    });
    while (fila.length) {
      var n = fila.shift(), tolN = n.tol || TOL;
      /* o registro (acessório) que tem uma face neste nó anda junto, e o nó segue pela outra face */
      arr(estado.instalacoes.acessorios).forEach(function (a) {
        if (!a || movidos[a.id] || !a.a || !a.b) return;
        if (d3(a.a, n) > tolN && d3(a.b, n) > tolN) return;
        movidos[a.id] = 1; out.acessorios++;
        out.ops.push({ op: "instAlterar", id: a.id, dy: dy });
        fila.push({ x: a.a.x, y: a.a.y, z: a.a.z, tol: TOL }); fila.push({ x: a.b.x, y: a.b.y, z: a.b.z, tol: TOL });
      });
      trechos.forEach(function (t) {
        var g = G[t.id], vert = vertical(t);
        if (g.feito && !vert) return;
        ["p1", "p2"].forEach(function (k) {
          if ((g.feito && !vert) || g.pontas[k] || d3(t[k], n) > tolN) return;   /* a posição ORIGINAL do tubo: o nó é um ponto de antes do movimento */
          var outro = k === "p1" ? "p2" : "p1";
          if (vert) {
            if (g.pontas[outro]) { g[k] = { x: t[k].x, y: r4(t[k].y + dy), z: t[k].z }; g.pontas[k] = true; return; }   /* as duas pontas andaram: é só um deslocamento */
            var novoY = t[k].y + dy, comp = Math.abs(novoY - t[outro].y), mesmoLado = (novoY - t[outro].y) * (t[k].y - t[outro].y) > 0;
            if (comp >= MIN && (mesmoLado || /^agua/.test(String(t.sistema)))) {   /* água: a descida pode inverter de sentido (a alimentação que vem de fora numa cota fixa) */
              g[k] = { x: t[k].x, y: r4(novoY), z: t[k].z }; g.pontas[k] = true; g.mudou = true; g.feito = true; out.esticados++; out.ajustados++; return;
            }
            out.avisos.push("a prumada " + t.id + " ficaria com menos de 5 cm: anda inteira");
          }
          andar(t);
        });
      });
    }
    trechos.forEach(function (t) {
      var g = G[t.id]; if (!g.mudou) return;
      var o = I.opDoTrecho(t); o.p1 = { x: r4(g.p1.x), y: r4(g.p1.y), z: r4(g.p1.z) }; o.p2 = { x: r4(g.p2.x), y: r4(g.p2.y), z: r4(g.p2.z) };
      ["juntaIni", "juntaFim", "juntaMotivo", "comentarios", "faseCriada", "faseDemolida", "saidaLivre", "predio", "piscLinha", "tomada", "aparente", "passantes"].forEach(function (k) { if (t[k] != null && t[k] !== "") o[k] = t[k]; });   /* o que a op `trecho` recria e o opDoTrecho esquece: sem a saidaLivre a espera da caixa vira ponta solta */
      out.ops.push(o);
    });
    return out;
  }

  var BimApoiar = {
    TOL_INCL: TOL_INCL, TOL_JA: TOL_JA, AVISO_INCLINADO: AVISO_INCLINADO,
    pontosPegada: pontosPegada, pontosFinos: pontosFinos, vizinhos: vizinhos, amostrar: amostrar, cotaApoio: cotaApoio, rotulo: rotulo,
    expandir: expandir, caixaDoEstado: caixaDoEstado, planejar: planejar, levarRede: levarRede
  };
  global.BimApoiar = BimApoiar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimApoiar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

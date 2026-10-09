/* =====================================================================
 * bimambiente.js — AMBIENTE, motor PURO (ES5).
 *
 * Fase P2, Frente A do plano do BIM (seções 3.1, 3.7, fase P2;
 * Anexo B "ambiente"). Pedido do Rogério (08/10/2026): comportamento,
 * nomes de parâmetro e regras de cálculo seguindo a convenção de mercado. Ambiente é o que
 * vira dinheiro na obra pequena: piso e contrapiso (Área), rodapé, soleira
 * e tabica (Perímetro), forro e pintura de teto (Área), ar-condicionado
 * (Volume) — as frentes C (acabamento) e D (tela, identificador na planta)
 * leem daqui; o IfcSpace (saída) também.
 *
 * REGRAS DO AMBIENTE
 *   · O ambiente nasce por um PONTO (op `ambiente`). O CONTORNO não é
 *     gravado: é recalculado no replay a partir das peças que delimitam
 *     ambiente — paredes com "Delimitação de ambientes" (padrão sim, como o
 *     parâmetro WALL_ATTR_ROOM_BOUNDING), pilares e SEPARADORES de ambiente
 *     (op `separador`, a "Linha de separação de ambiente"). Mexeu a parede →
 *     o contorno, a área e o perímetro mudam sozinhos.
 *   · "Cálculos de área e volume" — Limite de cálculo de área do ambiente
 *     (op `ambienteRegra`, uma por projeto):
 *        face         Na face da parede (acabamento)   ← PADRÃO
 *        centro       No centro da parede
 *        nucleo       No núcleo da camada
 *        centroNucleo No centro do núcleo
 *     O VOLUME é sempre pela face da parede (área na face × Altura não
 *     delimitada), qualquer que seja a regra da área — é a regra adotada
 *     (o volume é o sólido do ambiente, limitado pelas faces de
 *     acabamento). A coleta P2 confere (referencia_p2_ambientes.json).
 *     FORRO DELIMITADOR (medido 09/10/2026): o volume para na face de baixo
 *     do forro que está no ambiente — ver o bloco FORRO × VOLUME.
 *   · Altura não delimitada = (elevação do Limite superior + Deslocamento do
 *     limite) − (elevação do Nível + Deslocamento da base). Limite superior
 *     vazio = o próprio nível, como no ambiente recém-criado.
 *   · Estados: "não delimitado" (o ponto não está numa região fechada, ou
 *     está dentro de uma parede) e "redundante" (dois ambientes na mesma
 *     região: a região fica com o PRIMEIRO, o outro avisa). São AVISOS, não
 *     erro: Área/Perímetro/Volume ficam vazios (nada é contado duas vezes
 *     no orçamento) e a op continua na lista.
 *   · Número automático por ordem de criação (1, 2, 3…), pulando os números
 *     já dados à mão — nunca repete; número repetido à mão vira aviso.
 *
 * DIVERGÊNCIAS DECLARADAS (o teste e o cenário P2 dizem o porquê)
 *   · Deslocamento do limite padrão = 2,80 m (pé-direito RA). O padrão de
 *     mercado é 2438 mm (8 pés, herança imperial).
 *   · Pilar delimita ambiente (padrão sim): o piso não passa por dentro do
 *     pilar. O pilar ESTRUTURAL não tem "Delimitação de
 *     ambientes" (não está no inventário); o arquitetônico tem.
 *   · Altura de cálculo (ROOM_COMPUTATION_HEIGHT) = 0: o plano de corte é a
 *     base do ambiente; peça que corta esse plano delimita.
 *
 * COMO SE CALCULA (puro, sem DOM)
 *   As pegadas na planta (os prismas REAIS da parede, BimArq.pecasParede —
 *   cantos unidos; o pilar pela seção) e os separadores viram
 *   segmentos; os segmentos se cortam (arranjo plano) e se acham as faces.
 *   A região do ambiente é a MENOR face fechada que contém o ponto, menos as
 *   ilhas dentro dela (pilar solto). Isso dá a regra "face". As outras regras
 *   empurram cada lado da região para fora pela distância da face até o
 *   centro / o núcleo / o centro do núcleo DAQUELA parede (camadas do tipo,
 *   js/alvtipos.js via BimArq.tipoParede); lado de pilar, de separador e de
 *   ponta de parede fica onde está.
 *
 * OPS (forma conferida no BimEdit.sanear — gancho "P2-A" em js/bimedit.js;
 * sem lista dentro de lista: a nuvem recusa):
 *   {op:"ambiente", id, ponto:{x,z}, nivelId?, nome?, numero?, acabPiso?,
 *    acabBase?, acabParede?, acabForro?, ocupacao?, ocupante?, departamento?,
 *    comentarios?, imagem?, limiteSuperior?, deslocLimite?, deslocBase?,
 *    servicos? (P2-C: [{codigo, medida, fator, acab?}] — js/bimacabamento.js)}
 *   {op:"ajustarAmbiente", id, campos:{<os mesmos campos>, params?:{k: v}}}
 *       (null apaga o campo: volta ao automático/padrão)
 *   {op:"separador", id, x0, z0, x1, z1, nivelId?}
 *   {op:"delimitar", id (parede ou pilar), delimita: true|false}
 *   {op:"ambienteRegra", regra: "face"|"centro"|"nucleo"|"centroNucleo"}
 *   {op:"mover", id, cx, cz} (ou dx, dz) e {op:"apagar", id} — de ambiente
 *       e de separador.
 *
 * Teste: node tools/test-bimambiente.js
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
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function tem(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  /* "Cálculos de área e volume" — Limite de cálculo de área */
  var REGRAS = { face: "Na face da parede", centro: "No centro da parede", nucleo: "No núcleo da camada", centroNucleo: "No centro do núcleo" };
  var REGRA_PADRAO = "face";
  /* padrões da RA (ver DIVERGÊNCIAS no cabeçalho) */
  var PADRAO = { nome: "Ambiente", deslocLimite: 2.8, deslocBase: 0 };
  var ESTADOS = { delimitado: "Delimitado", naoDelimitado: "Não delimitado", redundante: "Redundante" };

  /* os campos do ambiente: a FORMA mora no js/bimedit.js (CAMPOS_AMBIENTE),
     para o sanear não jogar fora um ambiente numa tela sem este motor */
  var CAMPOS_FALLBACK = {
    nome: ["texto", 80], numero: ["texto", 24], acabPiso: ["texto", 120], acabBase: ["texto", 120], acabParede: ["texto", 120],
    acabForro: ["texto", 120], ocupacao: ["texto", 80], ocupante: ["texto", 80], departamento: ["texto", 80], comentarios: ["texto", 300],
    imagem: ["texto", 300], nivelId: ["nivel"], limiteSuperior: ["nivel"], deslocLimite: ["medida", 100], deslocBase: ["medida", 100],
    ponto: ["ponto"], params: ["mapa"], servicos: ["servicos", 16]
  };
  function campos() { var E = dep("BimEdit", "./bimedit.js"); return (E && E.CAMPOS_AMBIENTE) || CAMPOS_FALLBACK; }

  /* grava os campos na fonte do ambiente — cada um no seu formato */
  function gravarCampos(a, c) {
    var C = campos();
    Object.keys(c || {}).forEach(function (k) {
      var def = C[k], v = c[k]; if (!def) return;
      if (def[0] === "texto") { if (v == null || String(v).trim() === "") delete a[k]; else a[k] = String(v).trim().slice(0, def[1]); }
      else if (def[0] === "medida") { if (v == null || v === "") delete a[k]; else if (fin(Number(v)) && Math.abs(Number(v)) <= def[1]) a[k] = r6(Number(v)); }
      else if (def[0] === "nivel") { if (v == null || v === "") delete a[k]; else a[k] = String(v).slice(0, 120); }
      else if (def[0] === "ponto") { if (v && fin(Number(v.x)) && fin(Number(v.z))) a.ponto = { x: r6(Number(v.x)), z: r6(Number(v.z)) }; }
      else if (def[0] === "servicos") {
        /* P2-C: os serviços do acabamento (js/bimacabamento.js) — a lista SUBSTITUI a anterior, como a op "orcar" */
        var E = dep("BimEdit", "./bimedit.js"), l = E && E.limparServicosAmbiente ? E.limparServicosAmbiente(v) : [];
        if (l.length) a.servicos = l; else delete a.servicos;
      }
      else if (def[0] === "mapa" && v && typeof v === "object" && !Array.isArray(v)) {
        var pr = a.params || (a.params = {});
        Object.keys(v).forEach(function (q) { if (v[q] === null) delete pr[q]; else pr[q] = typeof v[q] === "string" ? v[q].slice(0, 300) : v[q]; });
        if (!Object.keys(pr).length) delete a.params;
      }
    });
    return a;
  }

  /* ================================================== geometria plana */
  function cross(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function areaSinal(p) { var s = 0; for (var i = 0, n = p.length; i < n; i++) { var a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function perim(p) { var s = 0; for (var i = 0, n = p.length; i < n; i++) { var a = p[i], b = p[(i + 1) % n]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); } return s; }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = a[0] + t * dx - p[0], qz = a[1] + t * dz - p[1];
    return Math.sqrt(qx * qx + qz * qz);
  }
  function naBorda(p, pts, tol) { for (var i = 0; i < pts.length; i++) if (distSeg(p, pts[i], pts[(i + 1) % pts.length]) <= tol) return true; return false; }
  /* raio horizontal; a borda NÃO decide (quem chama confere naBorda antes) */
  function dentroEstrito(p, pts) {
    var x = p[0], z = p[1], d = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) d = !d;
    }
    return d;
  }

  /* ================================================== as peças que delimitam */
  /* as distâncias da face (lado s = −1: w = −t/2; +1: w = +t/2) até a linha
     de cada regra, pelas camadas do tipo (de fora para dentro, na ordem
     física; com inverterFaces o "fora" fica do lado +) */
  function offsetsParede(c, s) {
    var t = num(c.espessura, 0), cam = arr(c.tipoParede && c.tipoParede.camadas).filter(function (k) { return k && num(k.e, 0) > 0; });
    var o = { face: 0, centro: t / 2, nucleo: 0, centroNucleo: t / 2 };
    var iN = -1; cam.forEach(function (k, i) { if (k.face === "nucleo" && iN < 0) iN = i; });
    if (iN < 0) return o;
    var seq = c.inverterFaces ? cam.slice().reverse() : cam;
    if (c.inverterFaces) iN = cam.length - 1 - iN;
    if (s > 0) { seq = seq.slice().reverse(); iN = seq.length - 1 - iN; }
    var antes = 0; for (var i = 0; i < iN; i++) antes += num(seq[i].e, 0);
    o.nucleo = antes; o.centroNucleo = antes + num(seq[iN].e, 0) / 2;
    return o;
  }
  var ZERO = { face: 0, centro: 0, nucleo: 0, centroNucleo: 0 };
  function cortaPlano(y0, y1, yc) { return y0 <= yc + 1e-4 && y1 > yc + 1e-4; }

  /* pegadas e segmentos de um plano (nível + cota de cálculo) */
  function montar(estado, nivelKey, yc) {
    var A = dep("BimArq", "./bimarq.js"), segs = [], pegadas = [];
    var BC = dep("BimCurva", "./bimcurva.js"), curvas = [];   /* CURVA */
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.delimitaAmbiente === false) return;
      if (c.tipo === "parede") {
        if (!(num(c.espessura, 0) > 0) || !(num(c.comprimento, 0) > 0)) return;
        var f = A ? A.frameDe(c) : null; if (!f) return;
        var yTopo = f.y1; arr(c.topo).forEach(function (sg) { yTopo = Math.max(yTopo, num(sg.a, 0) + Math.abs(num(sg.b, 0)) * f.L); });
        if (!cortaPlano(f.y0, yTopo, yc)) return;
        if (BC && BC.ehCurva(c)) { curvas.push(c); return; }   /* CURVA: a pegada com arco sai abaixo, junta */
        var r = A.pecasParede(c, []), oM = offsetsParede(c, -1), oP = offsetsParede(c, 1);
        var nomeFace = function (s) { return (s < 0) !== !!c.inverterFaces ? "fora" : "dentro"; };
        arr(r.pecas).forEach(function (pc) {
          var q = pc.pts; if (q.length !== 4) return;
          pegadas.push({ pts: q, fonte: { tipo: "parede", id: c.id } });
          var tags = [
            { tipo: "parede", id: c.id, s: -1, face: nomeFace(-1), off: oM, prio: 3 },
            { tipo: "parede", id: c.id, s: 0, face: "ponta", off: ZERO, prio: 2 },
            { tipo: "parede", id: c.id, s: 1, face: nomeFace(1), off: oP, prio: 3 },
            { tipo: "parede", id: c.id, s: 0, face: "ponta", off: ZERO, prio: 2 }
          ];
          for (var k = 0; k < 4; k++) segs.push({ a: q[k], b: q[(k + 1) % 4], tag: tags[k] });
        });
      } else if (c.tipo === "pilar") {
        var y0 = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - num(c.altura, 0) / 2;
        if (!cortaPlano(y0, y0 + num(c.altura, 0), yc) || !A) return;
        var fr = A.frameDe(c), s = c.perfil ? A.secao(c.perfil) : null, loc;
        if (s && s.ok && arr(s.contorno).length >= 3) loc = s.contorno;
        else { var hx = num(c.comprimento, 0) / 2, hz = num(c.espessura, 0) / 2; if (!(hx > 0 && hz > 0)) return; loc = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]; }
        var P = loc.map(function (q) { return A.aMundo(fr, q[0], q[1]); });
        pegadas.push({ pts: P, fonte: { tipo: "pilar", id: c.id } });
        var tg = { tipo: "pilar", id: c.id, s: 0, face: "pilar", off: ZERO, prio: 2 };
        for (var i = 0; i < P.length; i++) segs.push({ a: P[i], b: P[(i + 1) % P.length], tag: tg });
      }
    });
    /* CURVA: as paredes curvas (e as retas com ponta em arco) — cordas numa grade
       comum por círculo, cada aresta com o arco de onde veio (a área exata sai no
       medirCiclo do js/bimcurva.js) */
    if (curvas.length) BC.contornosAmbiente(curvas).forEach(function (x) {
      var c = x.c, oM = offsetsParede(c, -1), oP = offsetsParede(c, 1), tg = {};
      var nomeF = function (s) { return (s < 0) !== !!c.inverterFaces ? "fora" : "dentro"; };
      function tagDe(lado, arco) {
        var k = lado + "|" + (arco ? arco.k : "");
        if (!tg[k]) tg[k] = lado ? { tipo: "parede", id: c.id, s: lado, face: nomeF(lado), off: lado < 0 ? oM : oP, prio: 3 } : { tipo: "parede", id: c.id, s: 0, face: "ponta", off: ZERO, prio: 2 };
        if (arco) tg[k].arco = arco;
        return tg[k];
      }
      x.pecas.forEach(function (pc) {
        pegadas.push({ pts: pc.pts, fonte: { tipo: "parede", id: c.id } });
        pc.arestas.forEach(function (e) { segs.push({ a: e.a, b: e.b, tag: tagDe(e.lado || 0, e.arco) }); });
      });
    });
    arr(estado && estado.separadores).forEach(function (sp) {
      if (!sp || (sp.nivelId == null ? "" : String(sp.nivelId)) !== nivelKey) return;
      segs.push({ a: [sp.x0, sp.z0], b: [sp.x1, sp.z1], tag: { tipo: "separador", id: sp.id, s: 0, face: "separador", off: ZERO, prio: 1 } });
    });
    return { segs: segs, pegadas: pegadas };
  }

  /* ================================================== arranjo plano
   * Os segmentos se cortam uns nos outros (cruzamento, ponta encostando,
   * trecho colinear), viram um grafo plano e se acham os ciclos das faces:
   * a face fica sempre à ESQUERDA de quem percorre o ciclo — face fechada =
   * ciclo de área positiva; o contorno de fora de cada grupo = negativa. */
  /* TOLERÂNCIA de 1 mm para fechar a região: a caixa da parede guarda o
     giro arredondado (rotY com 4 casas, BimEdit.parede), então as pontas de
     duas paredes que se encontram ficam até ~0,3 mm afastadas numa parede
     de 10 m. Sem a tolerância o ambiente "vaza" por uma fresta de 10 µm
     (aconteceu no L do teste: canto reentrante dado como não delimitado). */
  var EPS = 1e-3, EPS_V = 1e-3;
  function registro() {
    var cel = {}, pts = [];
    return {
      pts: pts,
      id: function (p) {
        var i = Math.floor(p[0] / EPS_V), j = Math.floor(p[1] / EPS_V);
        for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) {
          var l = cel[(i + a) + "," + (j + b)]; if (!l) continue;
          for (var k = 0; k < l.length; k++) { var q = pts[l[k]]; if (Math.abs(q[0] - p[0]) <= EPS_V && Math.abs(q[1] - p[1]) <= EPS_V) return l[k]; }
        }
        pts.push([p[0], p[1]]); var ch = i + "," + j; (cel[ch] = cel[ch] || []).push(pts.length - 1);
        return pts.length - 1;
      }
    };
  }
  function arranjo(segsIn) {
    var S = [];
    segsIn.forEach(function (s) {
      var a = [Number(s.a[0]), Number(s.a[1])], b = [Number(s.b[0]), Number(s.b[1])];
      if (!fin(a[0]) || !fin(a[1]) || !fin(b[0]) || !fin(b[1])) return;
      var d = sub(b, a), L2 = d[0] * d[0] + d[1] * d[1]; if (!(L2 > 1e-12)) return;
      S.push({ a: a, b: b, d: d, L2: L2, L: Math.sqrt(L2), tag: s.tag, ts: [0, 1],
               x0: Math.min(a[0], b[0]) - EPS, x1: Math.max(a[0], b[0]) + EPS, z0: Math.min(a[1], b[1]) - EPS, z1: Math.max(a[1], b[1]) + EPS });
    });
    var i, j;
    for (i = 0; i < S.length; i++) for (j = i + 1; j < S.length; j++) {
      var p = S[i], q = S[j];
      if (p.x1 < q.x0 || q.x1 < p.x0 || p.z1 < q.z0 || q.z1 < p.z0) continue;
      var den = cross(p.d, q.d), w = sub(q.a, p.a);
      if (Math.abs(den) > 1e-9 * p.L * q.L) {
        var t = cross(w, q.d) / den, u = cross(w, p.d) / den, tp = EPS / p.L, tq = EPS / q.L;
        if (t >= -tp && t <= 1 + tp && u >= -tq && u <= 1 + tq) { p.ts.push(Math.max(0, Math.min(1, t))); q.ts.push(Math.max(0, Math.min(1, u))); }
      } else if (Math.abs(cross(w, p.d)) / p.L < EPS) {
        /* colineares: cada ponta que cai no miolo do outro o divide */
        [q.a, q.b].forEach(function (e) { var tt = ((e[0] - p.a[0]) * p.d[0] + (e[1] - p.a[1]) * p.d[1]) / p.L2; if (tt > 0 && tt < 1) p.ts.push(tt); });
        [p.a, p.b].forEach(function (e) { var uu = ((e[0] - q.a[0]) * q.d[0] + (e[1] - q.a[1]) * q.d[1]) / q.L2; if (uu > 0 && uu < 1) q.ts.push(uu); });
      }
    }
    var R = registro(), E = {}, ordemE = [];
    S.forEach(function (s) {
      s.ts.sort(function (x, y) { return x - y; });
      var ids = s.ts.map(function (t) { return R.id([s.a[0] + t * s.d[0], s.a[1] + t * s.d[1]]); });
      for (var k = 0; k + 1 < ids.length; k++) {
        var u = ids[k], v = ids[k + 1]; if (u === v) continue;
        var ch = u < v ? u + "|" + v : v + "|" + u;
        if (!E[ch]) { E[ch] = { u: u, v: v, tag: s.tag }; ordemE.push(ch); }
        else if (s.tag.prio > E[ch].tag.prio) E[ch].tag = s.tag;
      }
    });
    /* tira as pontas soltas (separador que não fecha nada, por exemplo) */
    var adj = {}, vivo = {};
    ordemE.forEach(function (ch) { var e = E[ch]; vivo[ch] = true; (adj[e.u] = adj[e.u] || []).push(e.v); (adj[e.v] = adj[e.v] || []).push(e.u); });
    function chave(u, v) { return u < v ? u + "|" + v : v + "|" + u; }
    var grau = {}, fila = [];
    Object.keys(adj).forEach(function (v) { grau[v] = adj[v].length; if (grau[v] === 1) fila.push(Number(v)); });
    while (fila.length) {
      var v0 = fila.pop(); if (grau[v0] !== 1) continue;
      for (var k = 0; k < adj[v0].length; k++) {
        var w0 = adj[v0][k], ch0 = chave(v0, w0); if (!vivo[ch0]) continue;
        vivo[ch0] = false; grau[v0]--; grau[w0]--; if (grau[w0] === 1) fila.push(w0);
        break;
      }
    }
    /* vizinhos em ordem de ângulo (anti-horário) */
    var P = R.pts, viz = {}, pos = {};
    ordemE.forEach(function (ch) { if (!vivo[ch]) return; var e = E[ch]; (viz[e.u] = viz[e.u] || []).push(e.v); (viz[e.v] = viz[e.v] || []).push(e.u); });
    Object.keys(viz).forEach(function (v) {
      var o = P[v];
      viz[v].sort(function (a, b) { return Math.atan2(P[a][1] - o[1], P[a][0] - o[0]) - Math.atan2(P[b][1] - o[1], P[b][0] - o[0]); });
      pos[v] = {}; viz[v].forEach(function (w, k) { pos[v][w] = k; });
    });
    /* os ciclos: de u→v, o próximo é o vizinho de v logo no sentido HORÁRIO
       de u (a face à esquerda) */
    var visto = {}, ciclos = [];
    ordemE.forEach(function (ch) {
      if (!vivo[ch]) return;
      var e = E[ch];
      [[e.u, e.v], [e.v, e.u]].forEach(function (par) {
        if (visto[par[0] + ">" + par[1]]) return;
        var vs = [], tags = [], cu = par[0], cv = par[1], guarda = 0;
        do {
          visto[cu + ">" + cv] = 1; vs.push(cu); tags.push(E[chave(cu, cv)].tag);
          var l = viz[cv], k = pos[cv][cu], nw = l[(k - 1 + l.length) % l.length];
          cu = cv; cv = nw;
        } while (!(cu === par[0] && cv === par[1]) && ++guarda < 100000);
        var pts = vs.map(function (id) { return P[id]; });
        ciclos.push({ ids: vs, pts: pts, tags: tags, area: areaSinal(pts) });
      });
    });
    return { ciclos: ciclos };
  }

  /* ================================================== contorno por regra */
  /* "na mesma reta": o seno do ângulo entre os lados abaixo de 1e-3 (a
     parede gravada com o giro arredondado fica torta de ~1e-5 rad) */
  var COLINEAR = 1e-3;
  function colinear(d1, d2) {
    var l1 = Math.sqrt(d1[0] * d1[0] + d1[1] * d1[1]), l2 = Math.sqrt(d2[0] * d2[0] + d2[1] * d2[1]);
    return l1 > 1e-12 && l2 > 1e-12 && Math.abs(cross(d1, d2)) / (l1 * l2) < COLINEAR && d1[0] * d2[0] + d1[1] * d2[1] > 0;
  }
  /* a PONTA de uma parede que fica na mesma reta da face de outra parede é
     continuação daquela face: no canto em topo (o L) a parede que
     passa mostra a ponta no canto de dentro do cômodo em L, alinhada com a
     face da outra — é a mesma superfície. Ela segue a regra da face vizinha
     (sem isso, "No centro da parede" deixava um dente de 7,5 × 7,5 cm). */
  function tagsDoCiclo(c) {
    var T = c.tags.slice(), n = T.length, P = c.pts;
    function dir(i) { return sub(P[(i + 1) % n], P[i]); }
    for (var volta = 0; volta < 2; volta++) for (var i = 0; i < n; i++) {
      var t = T[i]; if (t.tipo !== "parede" || t.s !== 0) continue;
      var ant = (i - 1 + n) % n, prox = (i + 1) % n;
      if (T[ant].tipo === "parede" && T[ant].s !== 0 && colinear(dir(ant), dir(i))) T[i] = T[ant];
      else if (T[prox].tipo === "parede" && T[prox].s !== 0 && colinear(dir(i), dir(prox))) T[i] = T[prox];
    }
    return T;
  }
  /* junta lados seguidos na mesma reta e com o mesmo deslocamento */
  function simplificar(pts, offs, tags) {
    var P = pts.slice(), O = offs.slice(), T = tags.slice(), mudou = true;
    while (mudou && P.length > 3) {
      mudou = false;
      for (var i = 0; i < P.length && P.length > 3; i++) {
        var a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length];
        var d1 = sub(b, a), d2 = sub(c, b), l1 = Math.sqrt(d1[0] * d1[0] + d1[1] * d1[1]), l2 = Math.sqrt(d2[0] * d2[0] + d2[1] * d2[1]);
        var ia = (i - 1 + P.length) % P.length;
        if (l1 < 1e-9 || l2 < 1e-9 || (colinear(d1, d2) && Math.abs(O[ia] - O[i]) < 1e-12 && T[ia] === T[i])) {
          P.splice(i, 1); O.splice(i, 1); T.splice(i, 1); mudou = true; i--;
        }
      }
    }
    return { pts: P, offs: O, tags: T };
  }
  /* empurra cada lado para FORA da região (a região fica à esquerda) pela
     sua distância; lados paralelos com distâncias diferentes viram degrau */
  function deslocar(pts, offs) {
    var n = pts.length, L = [], out = [];
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n], d = sub(b, a), l = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
      var u = [d[0] / l, d[1] / l], nr = [u[1], -u[0]];
      L.push({ p: [a[0] + nr[0] * offs[i], a[1] + nr[1] * offs[i]], u: u, n: nr, off: offs[i] });
    }
    for (var k = 0; k < n; k++) {
      var A = L[(k - 1 + n) % n], B = L[k], V = pts[k], den = cross(A.u, B.u);
      if (Math.abs(den) > COLINEAR) {
        var t = cross(sub(B.p, A.p), B.u) / den;
        out.push([A.p[0] + t * A.u[0], A.p[1] + t * A.u[1]]);
      } else if (Math.abs(A.off - B.off) < 1e-12 && A.u[0] * B.u[0] + A.u[1] * B.u[1] > 0) {
        out.push([V[0] + B.n[0] * B.off, V[1] + B.n[1] * B.off]);
      } else {
        out.push([V[0] + A.n[0] * A.off, V[1] + A.n[1] * A.off]);
        out.push([V[0] + B.n[0] * B.off, V[1] + B.n[1] * B.off]);
      }
    }
    return out;
  }
  function chaveTag(t) { return t.tipo + "|" + t.id + "|" + t.s + (t.arco ? "|" + t.arco.k : ""); }   /* CURVA: o arco separa */
  function medirCiclo(c, regra) {
    var T = tagsDoCiclo(c);
    /* CURVA: lado em arco — área de Green com o termo do arco, deslocamento concêntrico */
    var BCm = T.some(function (t) { return t && t.arco; }) ? dep("BimCurva", "./bimcurva.js") : null;
    if (BCm) return BCm.medirCiclo(c, regra, T);
    var offs = T.map(function (t) { return regra === "face" ? 0 : num(t.off && t.off[regra], 0); });
    var s = simplificar(c.pts, offs, T.map(function (t) { return regra === "face" ? "f" : String(t.off && t.off[regra]); }));
    var P = regra === "face" ? s.pts : deslocar(s.pts, s.offs);
    return { pts: P, area: areaSinal(P), perimetro: perim(P) };
  }
  /* os LADOS da região na face (para o acabamento: rodapé por parede, o
     revestimento de cada face): trechos seguidos da mesma peça viram um */
  function ladosDe(ciclos) {
    var out = [];
    ciclos.forEach(function (c) {
      var T = tagsDoCiclo(c);
      var s = simplificar(c.pts, T.map(function () { return 0; }), T.map(chaveTag));
      var porCh = {}; T.forEach(function (t) { porCh[chaveTag(t)] = t; });
      s.pts.forEach(function (a, i) {
        var b = s.pts[(i + 1) % s.pts.length], t = porCh[s.tags[i]] || {};
        var f = { tipo: t.tipo || "?", id: t.id != null ? t.id : null };
        if (t.tipo === "parede") f.face = t.face;
        var ld = { x0: r6(a[0]), z0: r6(a[1]), x1: r6(b[0]), z1: r6(b[1]), comprimento: r6(Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]))), fonte: f };
        if (t.arco) ld.arco = t.arco;   /* CURVA */
        out.push(ld);
      });
    });
    /* CURVA: as cordas do mesmo arco viram um lado, com o comprimento do arco */
    var BCl = out.some(function (x) { return x.arco; }) ? dep("BimCurva", "./bimcurva.js") : null;
    if (BCl) out = BCl.juntarLadosArco(out);
    return out;
  }
  function paraPts(P) { return P.map(function (q) { return { x: r6(q[0]), z: r6(q[1]) }; }); }

  /* ================================================== níveis */
  function mapaNiveis(niveis) {
    var M = {}, N = {};
    arr(niveis).forEach(function (n) { if (n && n.id != null && n.elevacao != null && n.elevacao !== "" && fin(Number(n.elevacao))) { M[String(n.id)] = Number(n.elevacao); N[String(n.id)] = txt(n.nome) || String(n.id); } });
    return { elev: M, nome: N, tem: Object.keys(M).length > 0 };
  }

  /* ================================================== numeração */
  function numeros(ambs) {
    var usados = {}, out = {}, avisos = [], n = 1;
    ambs.forEach(function (a) {
      var k = a && a.numero ? txt(a.numero) : ""; if (!k) return;
      if (usados[k]) avisos.push("Número \"" + k + "\" repetido em ambientes (" + usados[k] + " e " + a.id + ").");
      else usados[k] = a.id;
    });
    ambs.forEach(function (a) {
      if (!a || a.numero) return;
      while (usados[String(n)]) n++;
      out[a.id] = String(n); usados[String(n)] = a.id; n++;
    });
    return { numeros: out, avisos: avisos };
  }

  /* ================================================== calcular (puro) */
  function calcular(estado, opts) {
    opts = opts || {};
    var regra = REGRAS[opts.regra] ? opts.regra : (estado && REGRAS[estado.ambienteRegra] ? estado.ambienteRegra : REGRA_PADRAO);
    var NV = mapaNiveis(opts.niveis), ambs = arr(estado && estado.ambientes).filter(function (a) { return a && a.id != null; });
    var NUM = numeros(ambs), avisos = NUM.avisos.slice(), porId = {}, lista = [], planos = {}, ordemP = [], faces = {};
    ambs.forEach(function (a) {
      var nk = a.nivelId == null ? "" : String(a.nivelId), av = [];
      var eBase = 0;
      if (nk && tem(NV.elev, nk)) eBase = NV.elev[nk];
      else if (nk && NV.tem) av.push("O nível deste ambiente não existe mais na obra.");
      var dB = fin(a.deslocBase) ? a.deslocBase : PADRAO.deslocBase, dL = fin(a.deslocLimite) ? a.deslocLimite : PADRAO.deslocLimite;
      var lk = a.limiteSuperior != null && a.limiteSuperior !== "" ? String(a.limiteSuperior) : nk, eLim = eBase;
      if (lk !== nk) {
        if (tem(NV.elev, lk)) eLim = NV.elev[lk];
        else { av.push("O limite superior deste ambiente não existe mais na obra: vale o próprio nível."); lk = nk; }
      }
      var base = eBase + dB, topo = eLim + dL, H = topo - base;
      if (!(H >= 0.01)) { av.push("O limite superior fica abaixo da base do ambiente: a altura não delimitada não fecha."); H = null; }
      var c = {
        estado: "naoDelimitado", regra: regra, regraNome: REGRAS[regra], area: null, perimetro: null, volume: null, areaFace: null, perimetroFace: null,
        altura: H != null ? r6(H) : null, base: r6(base), topo: r6(topo), deslocBase: dB, deslocLimite: dL,
        limiteSuperior: lk || null, limiteSuperiorNome: lk ? (NV.nome[lk] || lk) : null, nivelNome: nk ? (NV.nome[nk] || nk) : null,
        numeroAuto: NUM.numeros[a.id] || null, contorno: [], furos: [], lados: [], avisos: av
      };
      porId[a.id] = c; lista.push(c);
      var pk = nk + "|" + r6(base);
      if (!planos[pk]) { planos[pk] = { nk: nk, yc: base, ambs: [] }; ordemP.push(pk); }
      planos[pk].ambs.push(a);
    });
    ordemP.forEach(function (pk) {
      var PL = planos[pk], G = montar(estado, PL.nk, PL.yc), AR = null, donos = {};
      PL.ambs.forEach(function (a) {
        var c = porId[a.id], p = a.ponto ? [num(a.ponto.x, NaN), num(a.ponto.z, NaN)] : [NaN, NaN];
        if (!fin(p[0]) || !fin(p[1])) { c.avisos.push("O ambiente não tem ponto de colocação válido."); return; }
        var peg = G.pegadas.filter(function (g) { return !naBorda(p, g.pts, 1e-7) && dentroEstrito(p, g.pts); })[0];
        if (peg) { c.avisos.push("O ponto do ambiente está dentro de " + (peg.fonte.tipo === "pilar" ? "um pilar" : "uma parede") + " (" + peg.fonte.id + "): ambiente não delimitado."); return; }
        if (!AR) AR = arranjo(G.segs);
        var cont = function (cy) { return naBorda(p, cy.pts, 1e-7) || dentroEstrito(p, cy.pts); };
        var R = null, iR = -1;
        AR.ciclos.forEach(function (cy, k) { if (cy.area > 1e-9 && cont(cy) && (!R || cy.area < R.area)) { R = cy; iR = k; } });
        if (!R) { c.avisos.push("Ambiente não delimitado: o ponto não está numa região fechada por paredes, pilares ou separadores de ambiente."); return; }
        if (tem(donos, iR)) { c.estado = "redundante"; c.avisos.push("Ambiente redundante: a região já é do ambiente " + donos[iR] + " (dois ambientes na mesma região fechada)."); return; }
        donos[iR] = a.id;
        /* as ilhas dentro da região (pilar solto, parede solta) */
        var cands = AR.ciclos.filter(function (cy) { return cy.area < -1e-9 && !cont(cy) && dentroEstrito(cy.pts[0], R.pts) && !naBorda(cy.pts[0], R.pts, 1e-7); });
        var furos = cands.filter(function (h) { return !cands.some(function (o) { return o !== h && Math.abs(o.area) > Math.abs(h.area) && dentroEstrito(h.pts[0], o.pts); }); });
        var mf = [R].concat(furos).map(function (cy) { return medirCiclo(cy, "face"); });
        var mr = regra === "face" ? mf : [R].concat(furos).map(function (cy) { return medirCiclo(cy, regra); });
        var soma = function (L, k) { return L.reduce(function (s, x) { return s + x[k]; }, 0); };
        c.estado = "delimitado";
        /* 4 casas (0,1 mm e 0,0001 m²), como a área e o volume da parede no
           BimArq: o giro gravado com 4 casas deixa ruído de 1e-5 no contorno */
        var aF = soma(mf, "area");
        c.areaFace = r4(aF); c.perimetroFace = r4(soma(mf, "perimetro"));
        c.area = r4(soma(mr, "area")); c.perimetro = r4(soma(mr, "perimetro"));
        c.volume = c.altura != null ? r4(aF * c.altura) : null;
        c.contorno = paraPts(mr[0].pts); c.furos = mr.slice(1).map(function (x) { return paraPts(x.pts); });
        c.lados = ladosDe([R].concat(furos));
        faces[a.id] = mf.map(function (x) { return x.pts; });
      });
    });
    volumeComForros(estado, ambs, porId, faces);
    lista.forEach(function (c) { if (!c.avisos.length) delete c.avisos; });
    return { regra: regra, porId: porId, avisos: avisos };
  }

  /* ================================================== FORRO × VOLUME
   * MEDIDO na referência (09/10/2026): sala 5 × 4 pelo eixo, paredes de
   * 15 cm, ambiente com Deslocamento do limite 2,80 e o cálculo de volume
   * ligado. Sem forro: Volume = 52,283 m³ (18,6725 × 2,80). Com um forro
   * (Ceiling) a 2,60 m — o "Delimitação de ambientes" do forro vale Sim por
   * padrão — o Volume cai para 48,5485 m³ = 18,6725 × 2,60. A ÁREA (18,6725)
   * e a ALTURA NÃO DELIMITADA (2,80) NÃO mudam: o forro delimitador só corta
   * o sólido do ambiente por cima.
   * A regra copiada:
   *   · conta o forro que ESTÁ no ambiente (o mesmo critério do
   *     BimForro.ligarAmbientes — o ponto do forro na região do ambiente, no
   *     mesmo nível), que deu certo (ok) e cuja "Delimitação de ambientes"
   *     não foi desligada (f.delimitaAmbiente !== false);
   *   · a parte do ambiente coberta pelo forro (a INTERSEÇÃO exata do
   *     contorno do forro, com furos, com a região do ambiente NA FACE)
   *     fica com a altura = cota da face de baixo do forro − base do
   *     ambiente, limitada à Altura não delimitada; o resto da área, com a
   *     altura cheia. Forro abaixo da base ou acima do topo não corta.
   *   · dois forros em alturas diferentes: por partes (Σ área_i × altura_i
   *     + o resto × altura cheia). Forros que se sobrepõem: o mais baixo
   *     fica com a parte dele primeiro e a soma das partes nunca passa da
   *     área do ambiente (aproximação: a sobreposição não é recortada).
   *   · forro inclinado: a altura varia no plano. A parte do forro em que a
   *     face de baixo fica ENTRE a base e o topo do ambiente (o contorno
   *     recortado pelas duas retas de nível, Sutherland–Hodgman) corta, com
   *     o volume exato do plano sobre ela (∫h dA = c0·A + gx·Σx + gz·Σz); a
   *     parte acima do topo fica com a altura cheia. Regra RA, ainda não
   *     medida na referência (o cenário medido é o forro plano).
   * Sai em calc: volume (cortado), alturaVolume (= volume ÷ área na face: a
   * altura do sólido equivalente — o IfcSpace sai extrudado nela) e
   * forrosVolume [{id, area, altura}] (altura = a média sobre a parte
   * coberta; só quando algum forro cortou). */
  /* recorta um laço pelo semiplano c0 + gx·x + gz·z ≤ lim (abaixo = true) ou ≥ lim (Sutherland–Hodgman;
     num laço côncavo o recorte pode deixar arestas de ida e volta sobre a reta — área zero, a integral não muda) */
  function recortar(P, c0, gx, gz, lim, abaixo) {
    function val(q) { var v = c0 + gx * q[0] + gz * q[1] - lim; return abaixo ? -v : v; }
    var out = [];
    for (var i = 0, n = P.length; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n], va = val(a), vb = val(b);
      if (va >= 0) out.push(a);
      if ((va >= 0) !== (vb >= 0)) { var t = va / (va - vb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    return out.length >= 3 && Math.abs(areaSinal(out)) > 1e-12 ? out : null;
  }
  function orientar(P, positivo) { return (areaSinal(P) > 0) === positivo ? P : P.slice().reverse(); }
  function regiaoDe(lacos) {
    var L = lacos.filter(function (P) { return P && P.length >= 3; });
    return L.length ? [orientar(L[0], true)].concat(L.slice(1).map(function (P) { return orientar(P, false); })) : [];
  }
  function dentroRegiao(p, R) {
    if (!R.length || !dentroEstrito(p, R[0])) return false;
    for (var i = 1; i < R.length; i++) if (dentroEstrito(p, R[i])) return false;
    return true;
  }
  /* o ponto p está na borda de R? → +1 (aresta no mesmo sentido de d), −1 (contrário), 0 (não) */
  var TOL_BORDA = 1e-5;
  function naBordaRegiao(p, d, R) {
    for (var i = 0; i < R.length; i++) for (var j = 0, P = R[i], n = P.length; j < n; j++) {
      var a = P[j], b = P[(j + 1) % n];
      if (distSeg(p, a, b) <= TOL_BORDA) { var e = sub(b, a); return e[0] * d[0] + e[1] * d[1] > 0 ? 1 : -1; }
    }
    return 0;
  }
  /* os parâmetros t em que a aresta a→b cruza a borda de R */
  function cortesAresta(a, b, R) {
    var d = sub(b, a), L = Math.sqrt(d[0] * d[0] + d[1] * d[1]), ts = [0, 1];
    R.forEach(function (P) {
      for (var j = 0, n = P.length; j < n; j++) {
        var c = P[j], e = sub(P[(j + 1) % n], c), Le = Math.sqrt(e[0] * e[0] + e[1] * e[1]); if (!(Le > 1e-12)) continue;
        var den = cross(d, e), w = sub(c, a), tu = TOL_BORDA / Le;
        if (Math.abs(den) > 1e-12 * L * Le) {
          /* a tolerância do outro lado é de COMPRIMENTO (10 µm): o canto do forro que encosta na face da
             parede gravada com o giro arredondado passa 1e-8 do fim da aresta e o corte não pode sumir
             (sumia um triângulo de 0,0146 m² na meia sala do teste) */
          var t = cross(w, e) / den, u = cross(w, d) / den;
          if (t > 0 && t < 1 && u >= -tu && u <= 1 + tu) ts.push(t);
        } else if (Math.abs(cross(w, d)) / L < TOL_BORDA) {
          [c, P[(j + 1) % n]].forEach(function (q) { var tt = ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / (L * L); if (tt > 0 && tt < 1) ts.push(tt); });
        }
        /* o vértice do outro que encosta nesta aresta (canto em T) também a divide */
        if (distSeg(c, a, b) <= TOL_BORDA) { var tv = ((c[0] - a[0]) * d[0] + (c[1] - a[1]) * d[1]) / (L * L); if (tv > 0 && tv < 1) ts.push(tv); }
      }
    });
    return ts.sort(function (x, y) { return x - y; });
  }
  /* área e momentos (Σx·dA, Σz·dA) da INTERSEÇÃO de duas regiões (contorno
     anti-horário + furos horários): pelo teorema de Green, a borda de A∩B =
     os trechos da borda de A dentro de B + os da borda de B dentro de A; o
     trecho comum às duas bordas conta UMA vez, e só se as duas regiões
     estão do mesmo lado dele (mesmo sentido) — o forro automático tem a
     borda igual à do ambiente. */
  function intersecao(RA, RB) {
    var m = { area: 0, sx: 0, sz: 0 };
    function somar(p, q) { var k = p[0] * q[1] - q[0] * p[1]; m.area += k / 2; m.sx += (p[0] + q[0]) * k / 6; m.sz += (p[1] + q[1]) * k / 6; }
    function passar(R1, R2, contaComum) {
      R1.forEach(function (P) {
        for (var i = 0, n = P.length; i < n; i++) {
          var a = P[i], b = P[(i + 1) % n], d = sub(b, a), ts = cortesAresta(a, b, R2);
          for (var k = 0; k + 1 < ts.length; k++) {
            if (ts[k + 1] - ts[k] < 1e-12) continue;
            var p = [a[0] + d[0] * ts[k], a[1] + d[1] * ts[k]], q = [a[0] + d[0] * ts[k + 1], a[1] + d[1] * ts[k + 1]], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
            var bd = naBordaRegiao(mid, d, R2);
            if (bd !== 0) { if (bd > 0 && contaComum) somar(p, q); continue; }
            if (dentroRegiao(mid, R2)) somar(p, q);
          }
        }
      });
    }
    passar(RA, RB, true); passar(RB, RA, false);
    return m;
  }
  function volumeComForros(estado, ambs, porId, faces) {
    var forros = arr(estado && estado.forros).filter(function (f) { return f && f.ok !== false && f.delimitaAmbiente !== false && arr(f.contorno).length >= 3; });
    if (!forros.length) return;
    var BF = dep("BimForro", "./bimforro.js"); if (!BF || !BF.ambienteDoForro) return;
    var lst = ambs.map(function (a) { return { id: a.id, nivelId: a.nivelId, calc: porId[a.id] }; });
    var cortes = {};
    forros.forEach(function (f) {
      var al = BF.ambienteDoForro(f, lst); if (!al) return;
      var c = porId[al.id], F = faces[al.id];
      if (!c || c.estado !== "delimitado" || c.altura == null || !F) return;
      var RF = regiaoDe([arr(f.contorno).map(function (q) { return [num(q.x, NaN), num(q.z, NaN)]; })].concat(arr(f.furos).map(function (fu) { return arr(fu && fu.pts).map(function (q) { return [num(q.x, NaN), num(q.z, NaN)]; }); })));
      if (!RF.length || RF.some(function (P) { return P.some(function (q) { return !fin(q[0]) || !fin(q[1]); }); })) return;
      /* a altura da face de baixo acima da base do ambiente, linear na planta: h = c0 + gx·x + gz·z */
      var th = num(f.inclinacao, 0) * Math.PI / 180, c0 = num(f.cota, NaN) - c.base, gx = 0, gz = 0;
      if (th > 0) {
        var dr = num(f.dirInclinacao, 0) * Math.PI / 180, tg = Math.tan(th);
        gx = Math.cos(dr) * tg; gz = Math.sin(dr) * tg; c0 -= num(f.projMin, 0) * tg;
      }
      if (!fin(c0)) return;
      var RFc = RF;
      if (th > 0) {
        /* só a faixa em que a face de baixo está entre a base e o topo do ambiente corta */
        RFc = [];
        for (var i = 0; i < RF.length; i++) {
          var q = recortar(RF[i], c0, gx, gz, 1e-6, false); q = q && recortar(q, c0, gx, gz, c.altura - 1e-9, true);
          if (q) RFc.push(q); else if (i === 0) return;
        }
      } else if (!(c0 > 1e-6) || !(c0 < c.altura - 1e-9)) return;   /* plano abaixo da base ou no topo/acima: não corta */
      var m = intersecao(regiaoDe(F), RFc); if (!(m.area > 1e-9)) return;
      var vol = c0 * m.area + gx * m.sx + gz * m.sz;
      if (!(vol > 0)) return;
      (cortes[al.id] = cortes[al.id] || []).push({ id: String(f.id), area: m.area, altura: vol / m.area });
    });
    Object.keys(cortes).forEach(function (id) {
      var c = porId[id], aF = num(c.areaFace, 0), resto = aF, vol = 0, usados = [];
      cortes[id].sort(function (x, y) { return x.altura - y.altura; }).forEach(function (k) {
        var a = Math.min(k.area, resto); if (!(a > 1e-9)) return;
        vol += a * k.altura; resto -= a; usados.push({ id: k.id, area: r4(a), altura: r6(k.altura) });
      });
      if (!usados.length) return;
      vol += Math.max(0, resto) * c.altura;
      c.volume = r4(vol); c.alturaVolume = aF > 0 ? r6(vol / aF) : c.altura; c.forrosVolume = usados;
    });
  }

  var OPS = { ambiente: 1, ajustarAmbiente: 1, separador: 1, delimitar: 1, ambienteRegra: 1 };

  var BimAmbiente = {
    REGRAS: REGRAS, REGRA_PADRAO: REGRA_PADRAO, PADRAO: PADRAO, ESTADOS: ESTADOS, OPS: OPS,

    /* ----------------------------------------------- replay (js/bimedit.js, "P2-A")
     * aplicarOp → true se a op é do ambiente e valeu; fim(ctx, saida, niveis)
     * publica estado.ambientes (cada um com .calc), estado.separadores e
     * estado.ambienteRegra — só quando há op de ambiente (ops antigas abrem
     * byte a byte iguais). */
    ehOp: function (op) { return !!OPS[op]; },
    aplicarOp: function (o, ctx) {
      if (!o || !ctx) return false;
      var S = ctx.amb;
      if (o.op === "mover" || o.op === "apagar") {
        if (!S || o.id == null) return false;
        if (S.ambs[o.id]) {
          if (o.op === "apagar") { delete S.ambs[o.id]; S.ordem.splice(S.ordem.indexOf(o.id), 1); return true; }
          var a = S.ambs[o.id], p = a.ponto || { x: 0, z: 0 };
          if (fin(o.dx) || fin(o.dz)) a.ponto = { x: r6(p.x + num(o.dx, 0)), z: r6(p.z + num(o.dz, 0)) };
          else a.ponto = { x: r6(num(o.cx, p.x)), z: r6(num(o.cz, p.z)) };
          return true;
        }
        if (S.seps[o.id]) {
          if (o.op === "apagar") { delete S.seps[o.id]; S.ordemS.splice(S.ordemS.indexOf(o.id), 1); return true; }
          var sp = S.seps[o.id], dx, dz;
          if (fin(o.dx) || fin(o.dz)) { dx = num(o.dx, 0); dz = num(o.dz, 0); }
          else { dx = num(o.cx, 0) - (sp.x0 + sp.x1) / 2; dz = num(o.cz, 0) - (sp.z0 + sp.z1) / 2; }
          sp.x0 = r6(sp.x0 + dx); sp.x1 = r6(sp.x1 + dx); sp.z0 = r6(sp.z0 + dz); sp.z1 = r6(sp.z1 + dz);
          return true;
        }
        return false;
      }
      if (!OPS[o.op]) return false;
      var E = dep("BimEdit", "./bimedit.js");
      if (E && E.opAmbienteValida && !E.opAmbienteValida(o)) return false;
      if (o.op === "delimitar") {
        var cx = ctx.caixas && ctx.caixas[o.id];
        if (!cx || (cx.tipo !== "parede" && cx.tipo !== "pilar")) return false;
        if (o.delimita === false) cx.delimitaAmbiente = false; else delete cx.delimitaAmbiente;
        return true;
      }
      S = ctx.amb || (ctx.amb = { ambs: {}, ordem: [], seps: {}, ordemS: [], regra: null });
      if (o.op === "ambienteRegra") { S.regra = o.regra; return true; }
      if (o.op === "ambiente") {
        var novo = { id: o.id }, c = {};
        Object.keys(o).forEach(function (k) { if (k !== "op" && k !== "id") c[k] = o[k]; });
        gravarCampos(novo, c);
        if (!novo.ponto) return false;
        S.ambs[o.id] = novo; if (S.ordem.indexOf(o.id) < 0) S.ordem.push(o.id);
        return true;
      }
      if (o.op === "ajustarAmbiente") {
        if (!S.ambs[o.id]) return false;
        gravarCampos(S.ambs[o.id], o.campos);
        return true;
      }
      if (o.op === "separador") {
        S.seps[o.id] = { id: o.id, x0: r6(o.x0), z0: r6(o.z0), x1: r6(o.x1), z1: r6(o.z1) };
        if (o.nivelId != null && o.nivelId !== "") S.seps[o.id].nivelId = String(o.nivelId);
        if (S.ordemS.indexOf(o.id) < 0) S.ordemS.push(o.id);
        return true;
      }
      return false;
    },
    fim: function (ctx, saida, niveis) {
      if (!ctx || !ctx.amb || !saida) return;
      var S = ctx.amb;
      saida.ambientes = S.ordem.map(function (id) { return clone(S.ambs[id]); });
      saida.separadores = S.ordemS.map(function (id) { return clone(S.seps[id]); });
      saida.ambienteRegra = S.regra || REGRA_PADRAO;
      var r = calcular(saida, { regra: saida.ambienteRegra, niveis: niveis });
      saida.ambientes.forEach(function (a) { a.calc = r.porId[a.id]; });
      if (r.avisos.length) saida.ambientesAvisos = r.avisos;
    },

    /* ----------------------------------------------- consulta (frentes C e D) */
    /* recalcula todos os ambientes do estado numa regra (sem mexer nele):
       { regra, porId: {id: calc}, avisos } — calc = { estado, area,
       perimetro, volume, areaFace, perimetroFace, altura, base, topo,
       limiteSuperior(+Nome), deslocBase, deslocLimite, numeroAuto,
       contorno:[{x,z}], furos:[[{x,z}]], lados:[{x0,z0,x1,z1,comprimento,
       fonte:{tipo,id,face}}], avisos? } */
    calcular: calcular,
    /* um ambiente numa regra qualquer (a tela compara as quatro) */
    medir: function (estado, id, regra, niveis) { return calcular(estado, { regra: regra, niveis: niveis }).porId[id] || null; },
    /* os lados do ambiente NA FACE, com a peça de cada um (rodapé, revestimento) */
    lados: function (estado, id, niveis) { var c = calcular(estado, { regra: "face", niveis: niveis }).porId[id]; return c ? c.lados : []; },
    /* o número que o ambiente mostra: o dado à mão ou o automático */
    numero: function (a) { return a ? (a.numero ? txt(a.numero) : (a.calc && a.calc.numeroAuto) || null) : null; },
    estadoTexto: function (a) { return a && a.calc ? ESTADOS[a.calc.estado] || "" : ""; },
    /* id novo para ambiente/separador, sem colidir com nada do estado */
    novoId: function (estado, pref) {
      var usados = {};
      ["caixas", "familias", "coberturas", "volumes", "ambientes", "separadores", "eixos", "anotacoes"].forEach(function (k) { arr(estado && estado[k]).forEach(function (x) { if (x && x.id != null) usados[String(x.id)] = 1; }); });
      var p = pref || "amb", n = 1; while (usados[p + n]) n++;
      return p + n;
    },
    /* a op de criar (ponto + campos), já conferida; {ok, op} ou {ok:false, motivo} */
    opAmbiente: function (estado, ponto, nivelId, camposIn) {
      if (!ponto || !fin(Number(ponto.x)) || !fin(Number(ponto.z))) return { ok: false, motivo: "Clique dentro da região do ambiente." };
      var o = { op: "ambiente", id: BimAmbiente.novoId(estado, "amb"), ponto: { x: r6(Number(ponto.x)), z: r6(Number(ponto.z)) } };
      if (nivelId != null && nivelId !== "") o.nivelId = String(nivelId);
      Object.keys(camposIn || {}).forEach(function (k) { if (k !== "ponto" && k !== "nivelId" && camposIn[k] != null) o[k] = camposIn[k]; });
      var E = dep("BimEdit", "./bimedit.js");
      if (E && E.opAmbienteValida && !E.opAmbienteValida(o)) return { ok: false, motivo: "Campo do ambiente com formato inválido." };
      return { ok: true, op: o };
    },
    /* utilidades expostas para o teste */
    arranjo: arranjo, offsetsParede: offsetsParede, deslocar: deslocar,
    /* a interseção de duas regiões ([contorno, furos…] em [x,z]) → { area, sx, sz } (FORRO × VOLUME) */
    intersecao: function (A, B) { return intersecao(regiaoDe(A), regiaoDe(B)); }
  };

  global.BimAmbiente = BimAmbiente;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAmbiente;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));

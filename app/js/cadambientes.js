/* =====================================================================
 * cadambientes.js — DO DESENHO CAD VINCULADO PARA O PROJETO (motor puro). 26/11/2026.
 *
 * O defeito que este arquivo resolve: com o DWG de arquitetura vinculado (já
 * separado por pavimento, js/cadsepara.js) e as louças lançadas, o "Traçado
 * automático" do hidro não saía tubo nenhum: o hidro só conhece como parede as
 * do editor e as IFCWALL de IFC aberto — as linhas do vínculo CAD não contavam
 * ("sem paredes no modelo para achar o lado de fora do ambiente…"). E sem
 * ambiente com nome o isométrico por ambiente não tinha por onde se dividir.
 *
 * O que o motor faz (sem tela, sem DOM, sem localStorage). Coordenadas: as da
 * PLANTA (X = x do 3D, Y = z do 3D), as mesmas de Bim2D._cadDesenho.
 *   paredes(segs)               paredes de REFERÊNCIA: eixo + espessura
 *   ambientes(segs, txts, par)  cômodos fechados pelas paredes, com o nome do texto do desenho
 *   loucas(ins, par, ambs)      louças pelos blocos: as de nome conhecido + as para conferir
 *   opsAmbientes / opLouca      as ops do editor (separadores + ambientes; família)
 *
 * ⚠ Nada aqui é norma: é leitura de desenho. O que não dá para afirmar (bloco
 * sem nome, cômodo aberto para fora) vai como pendência com o motivo — nunca
 * entra calado.
 * ===================================================================== */
(function (global) {
  "use strict";

  function P3() { return global.Planta3D || (typeof require === "function" ? require("./planta3d.js") : null); }
  function CS() { return global.CadSepara || (typeof require === "function" ? require("./cadsepara.js") : null); }
  function PC() { try { return global.ProjClass || (typeof require === "function" ? require("./projclass.js") : null); } catch (e) { return null; } }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function len(s) { var dx = s.x2 - s.x1, dy = s.y2 - s.y1; return Math.sqrt(dx * dx + dy * dy); }
  function norm(s) { var C = CS(); return C ? C.norm(s) : String(s || "").toUpperCase(); }

  /* ⚠ Os números abaixo são de DESENHO, não de norma. Mudou um? rode tools/test-cadambientes.js. */
  var RX_PAREDE = /PAREDE|ALVEN|WALL|REBOCO|REVEST|\bPAR\b|MURO/i;      /* camada de parede (padrões de mercado de nome de camada) */
  var RX_FECHA = /ESQUAD|JANELA|VIDRO|WINDOW|CAIXILH|GLAZ|SOLEIRA|PORTA|DOOR/i;   /* fecha o vão (janela, soleira, folha e arco da porta) na busca do cômodo */
  var MIN_SEGS_CAMADA = 12;   /* com menos linhas que isso nas camadas de parede, elas não bastam: usa o desenho todo */
  var CEL = 0.05;             /* m — malha da busca dos cômodos */
  var RAIO_PORTA = 0.42;      /* m — vão até 2 × isso (porta de 0,60 a 0,90) separa dois cômodos; vão maior (sala integrada) não */
  var MARGEM = 1.6;           /* m — folga em volta do desenho (o lado de fora precisa passar por ela) */

  /* ------------------------------------------------------------- paredes
   * segs: [{x1,y1,x2,y2,layer?,bloco?,curva?}] → { paredes:[{x1,y1,x2,y2,espessura,comprimento,layer}], criterio, camadas, stats }
   * ⚠ Medido no DWG que originou o recurso: a parede vem desenhada com núcleo (camada de parede) + reboco dos dois
   *   lados = TRÊS paralelas. O detector (Planta3D) marca isso como "duvidoso" (pode ser cadeia de cotas) e desliga —
   *   as 24 paredes de verdade saíam desligadas, e o que saía ligado era degrau de deck e marca de corte. Quando o
   *   desenho TEM camada de parede, a camada já responde a dúvida: tudo que pareou nela é parede. */
  function paredes(segs, o) {
    o = o || {};
    var P = P3(); if (!P) return { paredes: [], criterio: "sem detector", camadas: [], stats: {} };
    var cand = (segs || []).filter(function (s) { return s && !s.bloco && !s.curva && isFinite(s.x1) && isFinite(s.y2) && len(s) > 1e-6; });
    var naCamada = cand.filter(function (s) { return RX_PAREDE.test(String(s.layer || "")); });
    var porCamada = naCamada.length >= num(o.minSegs, MIN_SEGS_CAMADA), base = porCamada ? naCamada : cand;
    var f = P.filtrarFamilias(base), r = P.detectarParedes(f.segmentos);
    var camadas = {}; naCamada.forEach(function (s) { camadas[s.layer] = 1; });
    var out = [];
    r.paredes.forEach(function (p) {
      if (!(p.espessura >= 0.06 && p.espessura <= 0.40) || !(p.comprimento >= 0.3)) return;
      if (!porCamada && p.ligada === false) return;   /* sem camada de parede: só o que o detector afirma */
      if (p.provavelPilar && p.comprimento < 0.25) return;
      out.push({ x1: r3(p.x1), y1: r3(p.y1), x2: r3(p.x2), y2: r3(p.y2), espessura: r3(p.espessura), comprimento: r3(p.comprimento), layer: p.layer || "" });
    });
    return { paredes: out, criterio: porCamada ? "camada" : "geometria", camadas: Object.keys(camadas), stats: { linhas: cand.length, naCamada: naCamada.length, familias: f.removidos || 0, pares: r.paredes.length } };
  }

  /* ------------------------------------------------------------- nomes
   * o texto é nome de cômodo? (cota, área "A = 3,62 m²", nível "+3.42", etiqueta de porta "P1", título de desenho não são) */
  function nomeDeComodo(txt) {
    var t = String(txt == null ? "" : txt).replace(/\\P/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");
    if (t.length < 2 || t.length > 32) return null;
    var n = norm(t), C = CS();
    if (!n || !/[A-Z]{2}/.test(n)) return null;
    if (!/[A-ZÀ-Ý]/.test(t)) return null;   /* tudo minúsculo ("banheira", "projeção") é anotação, não nome de cômodo */
    if (/^A ?=|M²|M2\b|\bM\b$/.test(t.toUpperCase()) || /^A\s*=/.test(t)) return null;
    if (C && C.cotaDoTexto && C.cotaDoTexto(t) !== null) return null;
    if (/^[A-Z]{1,3} ?-? ?\d{1,3}[A-Z]?$/.test(n)) return null;                                   /* P1, PV2, J4, B1: etiqueta */
    if (/\d+[.,]\d+/.test(t) && !/[A-Za-z]{3}/.test(t)) return null;                              /* medida */
    if (C && C.classificar && C.classificar(t)) return null;                                     /* título de desenho */
    if (/^(SEC|SECC|SECAO|ELEVACAO|CORTE|ESC|ESCALA|SUBIR|SOBE|DESCE|DESCER|PROJ|PROJECAO|RUA|LOTE|QUADRA|AV|AVENIDA|NORTE|N|PROPRIETARIO|ENDERECO|DATA|FOLHA|PRANCHA|OBS|NOTA|ARQ|DES|RESP)\b/.test(n)) return null;
    if (/\b(RESIDENCE|RESIDENCIAL|CONDOMINIO|LTDA|PROJETO|PROJETISTA|DESENHO)\b/.test(n)) return null;
    return t;
  }
  /* área escrita no desenho ("A = 29.12 m²") → número, ou null */
  function areaDoTexto(txt) { var m = /A\s*=\s*(\d{1,4})[.,](\d{1,2})\s*m/i.exec(String(txt || "")); return m ? parseFloat(m[1] + "." + m[2]) : null; }

  /* ------------------------------------------------------------- malha
   * A busca dos cômodos é por MALHA (5 cm): paredes e janelas são obstáculo; o "miolo" é o que fica a mais de RAIO_PORTA
   * de qualquer obstáculo — nele a porta já fecha o cômodo. Cada nome de cômodo é uma semente; o lado de fora (a borda)
   * é outra. Os cômodos crescem juntos pelo miolo (sala e cozinha integradas se dividem a meio caminho) e depois voltam
   * a encostar na parede. Cômodo cujo miolo encosta no lado de fora é ABERTO (garagem sem portão desenhado, varanda):
   * não vira ambiente, vai para a lista com o motivo. */
  function Malha(x0, y0, x1, y1, cel) {
    this.cel = cel; this.x0 = x0; this.y0 = y0;
    this.nx = Math.max(1, Math.ceil((x1 - x0) / cel)); this.ny = Math.max(1, Math.ceil((y1 - y0) / cel));
    this.ob = new Uint8Array(this.nx * this.ny);
  }
  Malha.prototype.i = function (x, y) { var ix = Math.floor((x - this.x0) / this.cel), iy = Math.floor((y - this.y0) / this.cel); return ix < 0 || iy < 0 || ix >= this.nx || iy >= this.ny ? -1 : ix + this.nx * iy; };
  Malha.prototype.linha = function (ax, ay, bx, by) {
    var L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), n = Math.max(1, Math.ceil(L / (this.cel * 0.4))), k, t, i;
    for (k = 0; k <= n; k++) { t = k / n; i = this.i(ax + (bx - ax) * t, ay + (by - ay) * t); if (i >= 0) this.ob[i] = 1; }
  };
  Malha.prototype.retangulo = function (p) {   /* parede detectada: o retângulo cheio (o miolo dela não é cômodo) */
    var dx = p.x2 - p.x1, dy = p.y2 - p.y1, L = Math.sqrt(dx * dx + dy * dy); if (!(L > 0)) return;
    var nx = -dy / L, ny = dx / L, h = p.espessura / 2, k, n = Math.max(1, Math.ceil(p.espessura / (this.cel * 0.4)));
    for (k = 0; k <= n; k++) { var o = -h + p.espessura * k / n; this.linha(p.x1 + nx * o, p.y1 + ny * o, p.x2 + nx * o, p.y2 + ny * o); }
  };
  /* distância (m) de cada célula ao obstáculo mais perto — chanfro 3-4, duas passadas */
  Malha.prototype.distancias = function () {
    var nx = this.nx, ny = this.ny, N = nx * ny, d = new Float32Array(N), i, x, y, G = 1e9;
    for (i = 0; i < N; i++) d[i] = this.ob[i] ? 0 : G;
    for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) {
      i = x + nx * y; if (!d[i]) continue; var v = d[i];
      if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
      if (y > 0) { if (d[i - nx] + 3 < v) v = d[i - nx] + 3; if (x > 0 && d[i - nx - 1] + 4 < v) v = d[i - nx - 1] + 4; if (x < nx - 1 && d[i - nx + 1] + 4 < v) v = d[i - nx + 1] + 4; }
      d[i] = v;
    }
    for (y = ny - 1; y >= 0; y--) for (x = nx - 1; x >= 0; x--) {
      i = x + nx * y; if (!d[i]) continue; var w = d[i];
      if (x < nx - 1 && d[i + 1] + 3 < w) w = d[i + 1] + 3;
      if (y < ny - 1) { if (d[i + nx] + 3 < w) w = d[i + nx] + 3; if (x < nx - 1 && d[i + nx + 1] + 4 < w) w = d[i + nx + 1] + 4; if (x > 0 && d[i + nx - 1] + 4 < w) w = d[i + nx - 1] + 4; }
      d[i] = w;
    }
    for (i = 0; i < N; i++) d[i] = d[i] / 3 * this.cel;
    return d;
  };

  /* contorno da região `lab === k` (o laço externo, em metros), sem os degraus da malha */
  function contorno(M, lab, k) {
    var nx = M.nx, ny = M.ny, prox = {}, i, x, y;
    function v(ix, iy) { return ix + (nx + 1) * iy; }
    function aresta(a, b) { (prox[a] || (prox[a] = [])).push(b); }
    for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) {
      i = x + nx * y; if (lab[i] !== k) continue;
      /* a região fica à ESQUERDA de cada aresta (sentido anti-horário no sistema da malha) */
      if (y === 0 || lab[i - nx] !== k) aresta(v(x, y), v(x + 1, y));
      if (x === nx - 1 || lab[i + 1] !== k) aresta(v(x + 1, y), v(x + 1, y + 1));
      if (y === ny - 1 || lab[i + nx] !== k) aresta(v(x + 1, y + 1), v(x, y + 1));
      if (x === 0 || lab[i - 1] !== k) aresta(v(x, y + 1), v(x, y));
    }
    var melhor = null, mA = 0;
    Object.keys(prox).forEach(function (s0) {
      while (prox[s0] && prox[s0].length) {
        var laco = [], a = +s0, g = 0;
        while (prox[a] && prox[a].length && g++ < 1e6) { laco.push(a); var b = prox[a].pop(); if (!prox[a].length) delete prox[a]; a = b; if (a === +s0) break; }
        var pts = laco.map(function (q) { var qx = q % (nx + 1), qy = (q - qx) / (nx + 1); return [M.x0 + qx * M.cel, M.y0 + qy * M.cel]; });
        var A = areaPol(pts);
        if (Math.abs(A) > mA) { mA = Math.abs(A); melhor = pts; }
      }
    });
    return melhor ? simplificar(melhor, M.cel * 1.2) : null;
  }
  function menosUm(N) { var a = new Int32Array(N), i; for (i = 0; i < N; i++) a[i] = -1; return a; }
  function areaPol(p) { var a = 0, i, j; for (i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] * p[i][1] - p[i][0] * p[j][1]); return a / 2; }
  /* Douglas–Peucker no laço fechado (o canto mais longe do 1º ponto abre o laço em dois) */
  function simplificar(p, tol) {
    if (p.length < 4) return p;
    function dp(a, b, out) {
      var A = p[a], B = p[b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.sqrt(dx * dx + dy * dy) || 1e-9, mx = -1, mi = -1, i;
      for (i = a + 1; i < b; i++) { var d = Math.abs((p[i][0] - A[0]) * dy - (p[i][1] - A[1]) * dx) / L; if (d > mx) { mx = d; mi = i; } }
      if (mx > tol) { dp(a, mi, out); dp(mi, b, out); } else out.push(B);
    }
    var far = 0, dm = -1, i;
    for (i = 1; i < p.length; i++) { var d2 = (p[i][0] - p[0][0]) * (p[i][0] - p[0][0]) + (p[i][1] - p[0][1]) * (p[i][1] - p[0][1]); if (d2 > dm) { dm = d2; far = i; } }
    var q = p.concat([p[0]]), out = [p[0]];
    p = q; dp(0, far, out); dp(far, q.length - 1, out);
    out.pop();
    return out.map(function (z) { return [r3(z[0]), r3(z[1])]; });
  }
  function pontoNoPol(pt, P) {
    var x = pt[0], y = pt[1], d = false, i, j;
    for (i = 0, j = P.length - 1; i < P.length; j = i++) { var xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) d = !d; }
    return d;
  }

  /* ------------------------------------------------------------- ambientes
   * segs: as linhas do nível (com layer) · txts: [{x, y, txt}] · par: paredes() · o: { raio, celula }
   * → { ambientes:[{ id, nome, ponto:[x,y], poligono, area, areaDesenho }], abertos:[{nome, motivo}], semNome: n, stats } */
  function ambientes(segs, txts, par, o) {
    o = o || {};
    var cel = num(o.celula, CEL), raio = num(o.raio, RAIO_PORTA), W = (par && par.paredes) || [];
    if (!W.length) return { ambientes: [], abertos: [], semNome: 0, motivo: "nenhuma parede reconhecida no desenho deste nível" };
    var porCamada = par.criterio === "camada";
    /* ⚠ a porta FECHA o cômodo: soleira, folha e arco (camada de esquadria/soleira, dentro de bloco ou não). Sem isso a porta
       de entrada (1,0 m, mais que 2 × RAIO_PORTA) ligava a sala ao lado de fora e a sala inteira saía "aberta" (medido no
       DWG que originou o recurso: sala, cozinha e hall abertos). */
    var obst = (segs || []).filter(function (s) {
      if (!s) return false; var ly = String(s.layer || "");
      if (RX_FECHA.test(ly)) return true;
      return porCamada && !s.bloco && !s.curva && RX_PAREDE.test(ly);
    });
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    W.forEach(function (p) { x0 = Math.min(x0, p.x1, p.x2); x1 = Math.max(x1, p.x1, p.x2); y0 = Math.min(y0, p.y1, p.y2); y1 = Math.max(y1, p.y1, p.y2); });
    var M = new Malha(x0 - MARGEM, y0 - MARGEM, x1 + MARGEM, y1 + MARGEM, cel);
    if (M.nx * M.ny > 6e6) return { ambientes: [], abertos: [], semNome: 0, motivo: "o desenho do nível é grande demais para achar os cômodos (" + Math.round(x1 - x0) + " × " + Math.round(y1 - y0) + " m)" };
    W.forEach(function (p) { M.retangulo(p); });
    obst.forEach(function (s) { M.linha(s.x1, s.y1, s.x2, s.y2); });
    var D = M.distancias(), N = M.nx * M.ny, nx = M.nx, ny = M.ny, i;
    function viz(c, cb) { var cx = c % nx; if (cx > 0) cb(c - 1); if (cx < nx - 1) cb(c + 1); if (c >= nx) cb(c - nx); if (c < N - nx) cb(c + nx); }
    var areas = [], nomes = [];
    (txts || []).forEach(function (t) { var a = areaDoTexto(t.txt); if (a !== null) areas.push({ x: t.x, y: t.y, a: a, usada: false }); });
    (txts || []).forEach(function (t) {
      var nm = nomeDeComodo(t.txt); if (!nm || !isFinite(t.x) || !isFinite(t.y)) return;
      if (t.x < x0 - 0.5 || t.x > x1 + 0.5 || t.y < y0 - 0.5 || t.y > y1 + 0.5) return;   /* fora do prédio: nome de rua, de lote */
      var ic = M.i(t.x, t.y); if (ic < 0) return;
      nomes.push({ nome: nm, x: t.x, y: t.y, ic: ic, cel: -1, k: nomes.length });
    });
    /* ⚠ EM NÍVEIS DE RAIO (0,42 → 0,30 → 0,20 m). O banheiro de 1,15 m com duas portas para dentro não tem miolo a 0,42 m:
       a semente dele ia para o miolo mais perto em LINHA RETA, que era o da cozinha do outro lado da parede — e o "BHO"
       saía pintado na cozinha (medido no DWG que originou o recurso). Agora a semente só anda por onde não há parede, e o
       cômodo estreito é achado no raio seguinte, depois que os grandes já tomaram o lugar deles. */
    var lab = menosUm(N), abertos = [], vivos = [], raios = [raio, Math.min(raio, 0.30), Math.min(raio, 0.20)], fila = new Int32Array(N);
    raios.forEach(function (rr, nivel) {
      if (nivel && rr >= raios[nivel - 1] - 1e-9) return;
      var pend = nomes.filter(function (s) { return s.cel < 0 && !s.fim; }); if (!pend.length) return;
      var miolo = new Uint8Array(N); for (i = 0; i < N; i++) miolo[i] = D[i] >= rr && lab[i] < 0 ? 1 : 0;
      var comp = menosUm(N), nc = 0, fora = {};
      for (i = 0; i < N; i++) {
        if (!miolo[i] || comp[i] >= 0) continue;
        var pilha = [i]; comp[i] = nc;
        while (pilha.length) {
          var c = pilha.pop(), cx = c % nx, cy = (c - cx) / nx;
          if (cx === 0 || cy === 0 || cx === nx - 1 || cy === ny - 1) fora[nc] = 1;
          viz(c, function (q) { if (miolo[q] && comp[q] < 0) { comp[q] = nc; pilha.push(q); } });
        }
        nc++;
      }
      /* a semente: do texto, andando só por célula livre (sem parede e sem cômodo já achado), até o miolo — no máximo 1,5 m */
      var maxP = Math.ceil(1.5 / cel), vis = {};
      pend.forEach(function (s) {
        if (M.ob[s.ic] || lab[s.ic] >= 0) { if (lab[s.ic] >= 0) { s.dup = lab[s.ic]; s.fim = true; } return; }
        var q0 = [s.ic], dist = {}; dist[s.ic] = 0; var achou = -1;
        while (q0.length && achou < 0) {
          var c2 = q0.shift(); if (miolo[c2]) { achou = c2; break; }
          if (dist[c2] >= maxP) continue;
          viz(c2, function (q) { if (dist[q] == null && !M.ob[q] && lab[q] < 0) { dist[q] = dist[c2] + 1; q0.push(q); } });
        }
        if (achou < 0) return;
        if (fora[comp[achou]]) { s.fim = true; abertos.push({ nome: s.nome, motivo: "o cômodo não fecha: tem saída para o lado de fora sem parede nem porta desenhada (vão de mais de " + (2 * rr).toFixed(2).replace(".", ",") + " m)" }); return; }
        s.cel = achou; vivos.push(s);
      });
      var novos = pend.filter(function (s) { return s.cel >= 0; }), ini = 0, fim = 0;
      novos.forEach(function (s) { if (lab[s.cel] < 0) { lab[s.cel] = s.k; fila[fim++] = s.cel; } else s.dup = lab[s.cel]; });
      while (ini < fim) { var c0 = fila[ini++]; viz(c0, function (q) { if (miolo[q] && lab[q] < 0) { lab[q] = lab[c0]; fila[fim++] = q; } }); }
      /* volta a encostar na parede. ⚠ 2 × raio: o passo é em cruz (4 vizinhos) e o canto do cômodo fica a raio·√2 do miolo —
         com 1 × raio o contorno saía chanfrado em todo canto (e o banheiro perdia um terço da área) */
      var passo = new Int32Array(N), dono = {}; ini = 0; fim = 0;
      novos.forEach(function (s) { dono[s.k] = 1; });
      for (i = 0; i < N; i++) if (lab[i] >= 0 && dono[lab[i]]) fila[fim++] = i;
      var lim = Math.ceil(2 * rr / cel) + 2;
      while (ini < fim) { var c1 = fila[ini++]; if (passo[c1] >= lim) continue; viz(c1, function (q) { if (lab[q] < 0 && !M.ob[q]) { lab[q] = lab[c1]; passo[q] = passo[c1] + 1; fila[fim++] = q; } }); }
    });
    nomes.forEach(function (s) { if (s.cel < 0 && !s.fim) abertos.push({ nome: s.nome, motivo: "o nome não está dentro de um cômodo fechado (caiu em parede, móvel grande ou num vão menor que " + Math.round(2 * raios[2] * 100) + " cm)" }); });
    var porK = {}; nomes.forEach(function (s) { porK[s.k] = s; });
    /* BOLSOS: o banheiro com box e portas para dentro fica picado em pedaços (soleira do box, arco da porta). Pedaço sem
       nome, fechado (não toca a borda) e pequeno (até 6 m²) vai para o cômodo vizinho que mais o cerca; a linha fina
       (1–2 células) entre dois pedaços do MESMO cômodo também. Parede de verdade (3+ células) nunca é atravessada. */
    /* ⚠ e só se o bolso cabe na caixa do cômodo + 0,9 m: sem isso a faixa do deck (entre réguas) virava sala e a calçada
       (entre as linhas de piso) virava garagem — a sala ia de 25 para 39 m² (medido no DWG que originou o recurso) */
    var cxL = {}; for (i = 0; i < N; i++) { var lq = lab[i]; if (lq < 0) continue; var qx9 = i % nx, qy9 = (i - qx9) / nx, bq = cxL[lq] || (cxL[lq] = [qx9, qy9, qx9, qy9]); if (qx9 < bq[0]) bq[0] = qx9; if (qy9 < bq[1]) bq[1] = qy9; if (qx9 > bq[2]) bq[2] = qx9; if (qy9 > bq[3]) bq[3] = qy9; }
    var folgaB = Math.round(0.9 / cel);
    var bol = menosUm(N), maxCel = Math.round(6 / (cel * cel));
    for (i = 0; i < N; i++) {
      if (lab[i] >= 0 || M.ob[i] || bol[i] >= 0) continue;
      var pl = [i], cels = [], toca = false; bol[i] = i;
      while (pl.length) { var b0 = pl.pop(); cels.push(b0); var bx = b0 % nx, by = (b0 - bx) / nx; if (bx === 0 || by === 0 || bx === nx - 1 || by === ny - 1) toca = true;
        viz(b0, function (q) { if (lab[q] < 0 && !M.ob[q] && bol[q] < 0) { bol[q] = i; pl.push(q); } }); }
      if (toca || cels.length > maxCel) continue;
      var voto = {};
      cels.forEach(function (c3) { var cx3 = c3 % nx, cy3 = (c3 - cx3) / nx, a3, b3; for (b3 = -3; b3 <= 3; b3++) for (a3 = -3; a3 <= 3; a3++) { var qx3 = cx3 + a3, qy3 = cy3 + b3; if (qx3 < 0 || qy3 < 0 || qx3 >= nx || qy3 >= ny) continue; var l3 = lab[qx3 + nx * qy3]; if (l3 >= 0) voto[l3] = (voto[l3] || 0) + 1; } });
      var vk = -1, vm = 0; Object.keys(voto).forEach(function (k3) { if (voto[k3] > vm) { vm = voto[k3]; vk = +k3; } });
      var cb = cxL[vk], dentroCx = !!cb && cels.every(function (c3) { var x3 = c3 % nx, y3 = (c3 - x3) / nx; return x3 >= cb[0] - folgaB && x3 <= cb[2] + folgaB && y3 >= cb[1] - folgaB && y3 <= cb[3] + folgaB; });
      if (vk >= 0 && dentroCx) cels.forEach(function (c3) { lab[c3] = vk; });
    }
    var rep;
    for (rep = 0; rep < 2; rep++) for (i = 0; i < N; i++) {
      if (lab[i] >= 0 || !M.ob[i]) continue;
      var xi = i % nx, yi = (i - xi) / nx, d4;
      for (d4 = 1; d4 <= 2 && lab[i] < 0; d4++) {
        if (xi - d4 >= 0 && xi + d4 < nx && lab[i - d4] >= 0 && lab[i - d4] === lab[i + d4]) lab[i] = lab[i - d4];
        else if (yi - d4 >= 0 && yi + d4 < ny && lab[i - d4 * nx] >= 0 && lab[i - d4 * nx] === lab[i + d4 * nx]) lab[i] = lab[i - d4 * nx];
      }
    }

    var out = [];
    nomes.forEach(function (s) { if (s.dup != null) abertos.push({ nome: s.nome, motivo: "está no mesmo cômodo que \"" + porK[s.dup].nome + "\"" }); });
    vivos.forEach(function (s) {
      if (s.dup != null) return;
      var pol = contorno(M, lab, s.k); if (!pol || pol.length < 3) { abertos.push({ nome: s.nome, motivo: "não consegui fechar o contorno" }); return; }
      if (areaPol(pol) < 0) pol.reverse();
      var A = Math.abs(areaPol(pol));
      /* o ponto do ambiente: o nome, se cair dentro; senão a célula-semente */
      var pt = pontoNoPol([s.x, s.y], pol) ? [s.x, s.y] : [M.x0 + ((s.cel % nx) + 0.5) * cel, M.y0 + (Math.floor(s.cel / nx) + 0.5) * cel];
      /* a área escrita mais perto, logo abaixo do nome (até 1,2 m) */
      var aD = null, dm = 1.2;
      areas.forEach(function (q) { if (q.usada) return; var d = Math.sqrt((q.x - s.x) * (q.x - s.x) + (q.y - s.y) * (q.y - s.y)); if (d < dm && pontoNoPol([q.x, q.y], pol)) { dm = d; aD = q; } });
      if (aD) aD.usada = true;
      out.push({ id: "a" + (out.length + 1), nome: s.nome, ponto: [r3(pt[0]), r3(pt[1])], poligono: pol, area: Math.round(A * 100) / 100, areaDesenho: aD ? aD.a : null });
    });
    return { ambientes: out, abertos: abertos, semNome: 0, stats: { celulas: N, paredes: W.length, obstaculos: obst.length } };
  }

  /* ------------------------------------------------------------- louças
   * ins: [{ nome, layer, x, y, w, h, rot, espelhado }] (o centro da caixa do bloco, coordenadas da planta)
   * → { auto:[item], conferir:[item], ignorados: n } · item = { nome, sub, famId, sugestao?, confianca, regra, x, y, w, h, rot, espelhado, ambiente, parede }
   * Regra combinada com o Rogério (26/11): nome reconhecido entra automático; bloco SEM nome (anônimo) dentro de área
   * molhada vai para conferência com uma sugestão — nunca afirmada. */
  var FAM_DO_SUB = { bacia: "hid-bacia-caixa-acoplada", chuveiro: "hid-chuveiro", pia: "hid-pia-cozinha", tanque: "hid-tanque-lavar", lavatorio: "hid-lavatorio-suspenso", mictorio: null, bide: null, bebedouro: null };
  var ROT_SUB = { bacia: "Bacia sanitária", chuveiro: "Chuveiro", pia: "Pia de cozinha", tanque: "Tanque", lavatorio: "Lavatório" };
  var RX_MOLHADA = /BANH|BHO|WC|LAVABO|SANIT|COZ|GOURMET|SERV|LAVAND|AREA DE S|A S\b|CHURRAS|COPA/;
  function anonimo(nome) { return /^\*|^A\$C[0-9A-F]+$/i.test(String(nome || "")) || !/[A-Za-z]{3}/.test(String(nome || "")); }
  function ambienteDe(pt, ambs) { var r = null; (ambs || []).forEach(function (a) { if (!r && pontoNoPol(pt, a.poligono)) r = a; }); return r; }
  /* a parede mais perto do centro → a face do lado do centro (onde a louça encosta) */
  function paredeMaisPerto(pt, W) {
    var best = null;
    (W || []).forEach(function (p, k) {
      var dx = p.x2 - p.x1, dy = p.y2 - p.y1, L2 = dx * dx + dy * dy; if (!(L2 > 0)) return;
      var t = Math.max(0, Math.min(1, ((pt[0] - p.x1) * dx + (pt[1] - p.y1) * dy) / L2)), qx = p.x1 + dx * t, qy = p.y1 + dy * t;
      var d = Math.sqrt((pt[0] - qx) * (pt[0] - qx) + (pt[1] - qy) * (pt[1] - qy)) - p.espessura / 2;
      if (!best || d < best.d) {
        var L = Math.sqrt(L2), nx = -dy / L, ny = dx / L; if ((pt[0] - qx) * nx + (pt[1] - qy) * ny < 0) { nx = -nx; ny = -ny; }
        best = { k: k, d: d, face: [qx + nx * p.espessura / 2, qy + ny * p.espessura / 2], n: [nx, ny] };
      }
    });
    return best;
  }
  /* sala e cozinha integradas se dividem a meio caminho entre os dois nomes — e a pia caía na SALA. A peça de nome
     conhecido vai para o cômodo do tipo dela (pia → cozinha/gourmet/copa; tanque → serviço/lavanderia; bacia, chuveiro,
     lavatório → banho) se ele estiver a até 2,5 m; senão fica onde caiu. */
  var RX_SUB_AMB = { pia: /COZ|GOURMET|COPA|CHURRAS/, tanque: /SERV|LAVAND/, bacia: /BANH|BHO|WC|LAVABO|SANIT/, chuveiro: /BANH|BHO|WC|SANIT|DUCHA/, lavatorio: /BANH|BHO|WC|LAVABO|SANIT/ };
  function distPol(pt, P) { var m = Infinity, i, j; for (i = 0, j = P.length - 1; i < P.length; j = i++) { var ax = P[j][0], ay = P[j][1], dx = P[i][0] - ax, dy = P[i][1] - ay, L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / L2)) : 0, qx = ax + dx * t - pt[0], qy = ay + dy * t - pt[1], d = Math.sqrt(qx * qx + qy * qy); if (d < m) m = d; } return m; }
  function ambientePreferido(pt, amb, sub, ambs) {
    var rx = sub && RX_SUB_AMB[sub]; if (!rx || (amb && rx.test(norm(amb.nome)))) return amb;
    var best = null, dm = 2.5;
    (ambs || []).forEach(function (a) { if (!rx.test(norm(a.nome))) return; var d = pontoNoPol(pt, a.poligono) ? 0 : distPol(pt, a.poligono); if (d < dm) { dm = d; best = a; } });
    return best || amb;
  }
  function sugestaoAnonimo(it, amb) {
    var a = Math.min(it.w, it.h), b = Math.max(it.w, it.h), nm = amb ? norm(amb.nome) : "", PCx = PC(), s = "";
    try { if (PCx && global.ProjClassDados) { var D = global.ProjClassDados.tamanhoLouca || []; D.forEach(function (f) { if (!s && a >= f.min[0] && b >= f.min[1] && a <= f.max[0] && b <= f.max[1]) s = f.sub; }); } } catch (e) {}
    if (!s) {
      if (/COZ|GOURMET|COPA/.test(nm) && b >= 0.4) s = "pia";
      else if (/SERV|LAVAND/.test(nm) && b >= 0.4) s = "tanque";
      else if (/BANH|BHO|WC|LAVABO|SANIT/.test(nm)) s = b <= 0.62 && a <= 0.35 ? "lavatorio" : (b <= 0.95 && a >= 0.5 ? "chuveiro" : "lavatorio");
    }
    return s;
  }
  function loucas(ins, par, ambs, o) {
    o = o || {};
    var W = (par && par.paredes) || [], P = PC(), auto = [], conferir = [], ign = 0;
    (ins || []).forEach(function (b) {
      if (!b || !isFinite(b.x) || !isFinite(b.y)) { ign++; return; }
      var w = num(b.w, 0), h = num(b.h, 0), pt = [b.x, b.y], amb = ambienteDe(pt, ambs);
      var cl0 = null; if (!anonimo(b.nome) && P && P.classificarBloco) { try { cl0 = P.classificarBloco({ nome: String(b.nome), layer: b.layer || "", w: w, h: h, atribs: b.atribs }, {}, null); } catch (e0) { cl0 = null; } }
      amb = ambientePreferido(pt, amb, cl0 && cl0.sub, ambs);
      var it = { nome: String(b.nome || ""), layer: b.layer || "", x: r3(b.x), y: r3(b.y), w: r3(w), h: r3(h), rot: num(b.rot, 0), espelhado: !!b.espelhado, ambiente: amb ? amb.nome : "", ambienteId: amb ? amb.id : null };
      var cl = cl0;
      var pw = paredeMaisPerto(pt, W);
      if (pw) it.parede = { k: pw.k, d: r3(pw.d), face: [r3(pw.face[0]), r3(pw.face[1])], n: [r3(pw.n[0]), r3(pw.n[1])] };
      if (cl && cl.classe === "louca" && cl.sub && FAM_DO_SUB[cl.sub] && cl.fonte !== "camada+tamanho") {
        it.sub = cl.sub; it.famId = FAM_DO_SUB[cl.sub]; it.regra = cl.regra; it.confianca = "alta";
        if (!pw || pw.d > 1.2) { it.motivo = "sem parede a menos de 1,2 m para encostar"; conferir.push(it); return; }
        auto.push(it); return;
      }
      if (cl && cl.classe && cl.classe !== "louca") { ign++; return; }   /* porta, nível, norte, mobília: não é louça */
      /* sem nome: só interessa se for do tamanho de uma louça e estiver em área molhada */
      var a = Math.min(w, h), bb = Math.max(w, h);
      if (!(bb >= 0.15 && bb <= 1.3 && a >= 0.08)) { ign++; return; }
      if (!amb || !RX_MOLHADA.test(norm(amb.nome))) { ign++; return; }
      it.sub = ""; it.sugestao = sugestaoAnonimo(it, amb); it.famId = it.sugestao ? FAM_DO_SUB[it.sugestao] : null; it.confianca = "baixa";
      it.regra = "bloco sem nome (" + it.nome + "), " + a.toFixed(2).replace(".", ",") + " × " + bb.toFixed(2).replace(".", ",") + " m, em " + amb.nome + (it.sugestao ? ": parece " + ROT_SUB[it.sugestao].toLowerCase() + " pelo tamanho e pelo cômodo — confira" : ": não sei o que é");
      conferir.push(it);
    });
    return { auto: auto, conferir: conferir, ignorados: ign };
  }
  /* a op da família encostada na parede: a face de trás da peça na face da parede, centrada no bloco.
     med = { x0, x1, z0 } da caixa da família (js/hidequipar.js medidas); y = cota do piso + altura de instalação */
  function opLouca(it, id, famId, tipoId, y, med) {
    var pw = it.parede; if (!pw) return null;
    var n = pw.n, rot = Math.atan2(n[0], n[1]), ul = [Math.cos(rot), -Math.sin(rot)];
    var m = med || { x0: 0, x1: 0, z0: 0 }, lx = (num(m.x0, 0) + num(m.x1, 0)) / 2;
    /* o centro do bloco projetado na face: a peça fica onde o desenho a pôs, encostada */
    var t = (it.x - pw.face[0]) * ul[0] + (it.y - pw.face[1]) * ul[1], F0 = [pw.face[0] + ul[0] * t, pw.face[1] + ul[1] * t];
    var o = [F0[0] - n[0] * num(m.z0, 0) - ul[0] * lx, F0[1] - n[1] * num(m.z0, 0) - ul[1] * lx];
    return { op: "familia", id: id, famId: famId, tipoId: tipoId, x: r3(o[0]), y: r3(y), z: r3(o[1]), rotY: Math.round(rot * 1e4) / 1e4, inst: {}, cadBloco: String(it.nome).slice(0, 60) };
  }

  /* ------------------------------------------------------------- ops dos ambientes
   * Cada ambiente = os SEPARADORES do contorno (fecham a região sem parede modelada — o separador não é orçado) + a op
   * `ambiente` com o nome. Ids fixos por vínculo: rodar de novo apaga os do vínculo e põe os novos (um Ctrl+Z desfaz). */
  function opsAmbientes(ambs, nivelId, pref, existentes) {
    var ops = [], ex = existentes || [];
    ex.forEach(function (id) { if (String(id).indexOf(pref) === 0) ops.push({ op: "apagar", id: String(id) }); });
    (ambs || []).forEach(function (a, k) {
      var P = a.poligono;
      P.forEach(function (p, i) {
        var q = P[(i + 1) % P.length];
        var s = { op: "separador", id: pref + "s" + (k + 1) + "-" + (i + 1), x0: p[0], z0: p[1], x1: q[0], z1: q[1], acompanhar: false };
        if (nivelId != null) s.nivelId = nivelId;
        ops.push(s);
      });
      var am = { op: "ambiente", id: pref + "a" + (k + 1), ponto: { x: a.ponto[0], z: a.ponto[1] }, nome: String(a.nome).slice(0, 60) };
      if (nivelId != null) am.nivelId = nivelId;
      ops.push(am);
    });
    return ops;
  }

  var CadAmbientes = {
    RX_PAREDE: RX_PAREDE, RX_FECHA: RX_FECHA, CEL: CEL, RAIO_PORTA: RAIO_PORTA, FAM_DO_SUB: FAM_DO_SUB, ROT_SUB: ROT_SUB,
    paredes: paredes, nomeDeComodo: nomeDeComodo, areaDoTexto: areaDoTexto, ambientes: ambientes, loucas: loucas,
    opLouca: opLouca, opsAmbientes: opsAmbientes, pontoNoPol: pontoNoPol, areaPol: areaPol, anonimo: anonimo, paredeMaisPerto: paredeMaisPerto
  };
  global.CadAmbientes = CadAmbientes;
  if (typeof module !== "undefined" && module.exports) module.exports = CadAmbientes;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));

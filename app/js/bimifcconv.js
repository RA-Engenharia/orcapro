/* =====================================================================
 * bimifcconv.js — CONVERTER O IFC "GENÉRICO" EM ELEMENTOS EDITÁVEIS (motor PURO,
 * ES5, Node-testável: node tools/test-bimifcconv.js). 23/10/2026.
 *
 * O PEDIDO (Rogério): o IFC que sai do SketchUp chega com TUDO como
 * IfcBuildingElementProxy ("elemento genérico") — modelos de centenas de peças, todas
 * assim — e não dá para editar como parede, laje, porta, pilar ou viga. Ele quer o
 * modelo nativo do modelador, editável.
 *
 * COMO FUNCIONA (a régua inteira, para ninguém "melhorar" sem entender):
 *   1) A classe NÃO se confia: o SketchUp põe "Undefined" e "Componente#22" no
 *      nome. Quem decide é a GEOMETRIA — o quadro vertical da peça (retângulo de
 *      menor área na planta × altura), a fração da área que está nas faces da
 *      caixa, o contorno da seção. Nome, camada e material só ajudam a desempatar
 *      ou derrubam a confiança quando contradizem a geometria; nunca fabricam uma
 *      classe que a forma não sustenta.
 *   2) NUNCA CHUTAR. O que não bate com segurança fica genérico, com o motivo
 *      escrito. Cada item sai com confiança alta / média / baixa e o MOTIVO — a
 *      tela mostra e o usuário confirma por categoria.
 *   3) A saída é uma lista de operações do próprio editor (BimEdit): `criar` (parede,
 *      laje por contorno, pilar e viga por perfil), `familia` (porta/janela
 *      hospedada), `cobertura`, e `apagarIfc` para esconder o original. UM lote —
 *      um Ctrl+Z desfaz tudo e o IFC volta. O arquivo original nunca é alterado.
 *   4) Medidas em METROS no espaço da cena (Y para cima), o mesmo do web-ifc/BIM.
 *
 * ENTRADA de cada peça: { uid, id, nome, tipo, camada, material, tris: Float32Array }
 * (9 números por triângulo, já no mundo). SAÍDA: itens { uid, classe, conf, motivo, ... }.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------ util */
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function br(v, c) { return String(Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).replace(".", ","); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function BA() { return dep("BimArq", "./bimarq.js"); }
  function PA() { return dep("PerfisAco", "./perfisaco.js"); }

  /* limites — todos em metros, e cada um com o porquê */
  var LIM = {
    maxEdificio: 150,     /* maior lado em planta acima disso é terreno/entorno (o SketchUp exporta o terreno e até uma imagem de mapa de 355 m junto); galpão de 100 m passa */
    maxTri: 60000,        /* acima disso a malha é orgânica/escultura (pedra, árvore, mobiliário): não se classifica */
    minLado: 0.04,        /* abaixo de 4 cm no maior lado é miudeza (parafuso, etiqueta) */
    tolFace: 0.004,       /* 4 mm: um vértice "está no plano" da face da caixa */
    tolVert: 0.0005,      /* 0,5 mm: dois vértices são o mesmo ponto */
    cobCaixa: 0.88,       /* fração da área que cai nas 6 faces para chamar de caixa maciça */
    prismaMin: 0.97       /* fração da área só horizontal ou só vertical para chamar de extrusão vertical */
  };

  /* -------------------------------------------------- casco convexo 2D (planta) */
  function cruz(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  function casco(P) {
    var pts = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return pts;
    var lo = [], i, up = [];
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cruz(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cruz(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  function areaPoli(P) { var s = 0, n = P.length; for (var i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  /* o retângulo de MENOR ÁREA que envolve o casco: { cx, cz, ux, uz, a, b } com a >= b; (ux,uz) = direção do lado a */
  function retanguloMinimo(H) {
    var n = H.length, melhor = null;
    if (n < 3) return null;
    for (var i = 0; i < n; i++) {
      var p = H[i], q = H[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.sqrt(dx * dx + dz * dz);
      if (L < 1e-9) continue;
      var ux = dx / L, uz = dz / L, wx = -uz, wz = ux, u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
      for (var j = 0; j < n; j++) {
        var pu = H[j][0] * ux + H[j][1] * uz, pw = H[j][0] * wx + H[j][1] * wz;
        if (pu < u0) u0 = pu; if (pu > u1) u1 = pu; if (pw < w0) w0 = pw; if (pw > w1) w1 = pw;
      }
      var ar = (u1 - u0) * (w1 - w0);
      if (!melhor || ar < melhor.area - 1e-12) melhor = { area: ar, ux: ux, uz: uz, u0: u0, u1: u1, w0: w0, w1: w1 };
    }
    if (!melhor) return null;
    var cu = (melhor.u0 + melhor.u1) / 2, cw = (melhor.w0 + melhor.w1) / 2;
    var r = { cx: cu * melhor.ux + cw * (-melhor.uz), cz: cu * melhor.uz + cw * melhor.ux, ux: melhor.ux, uz: melhor.uz, a: melhor.u1 - melhor.u0, b: melhor.w1 - melhor.w0, area: melhor.area };
    if (r.b > r.a) { var t = r.a; r.a = r.b; r.b = t; var ox = r.ux; r.ux = -r.uz; r.uz = ox; }   /* o lado longo sempre é o `a` */
    return r;
  }

  /* ------------------------------------------- contornos (laços de borda) 2D
   * `tris` = lista de triângulos 2D [[x,y],[x,y],[x,y]]. A borda é a aresta que
   * só um triângulo usa; os laços saem dela. Devolve { lacos: [{ pts, area }], ok }.
   * ⚠ T-junction (face vizinha com mais vértices na mesma aresta) deixa a aresta
   *   sem par e cria "fendas": por isso quem usa isto CONFERE a área do contorno
   *   contra a soma dos triângulos (fechamento) antes de confiar. */
  function chaveP(p) { return Math.round(p[0] / LIM.tolVert) + "," + Math.round(p[1] / LIM.tolVert); }
  /* ⚠ T-JUNCTION: duas faces vizinhas (uma caixa que encosta pela metade na outra, ou polígonos coplanares com vértices
     diferentes na mesma aresta) deixam a aresta do lado maior SEM PAR — a borda sai com fendas e o contorno não fecha.
     Antes de contar, cada aresta é partida nos vértices que caem em cima dela (a 1 mm). */
  function arestasDivididas(tris) {
    var pts = {}, grade = {}, CEL = 0.5, TOL = 0.001, arestas = [], i, k;
    function cel(v) { return Math.floor(v / CEL); }
    for (i = 0; i < tris.length; i++) for (k = 0; k < 3; k++) {
      var p = tris[i][k], key = chaveP(p);
      if (!pts[key]) { pts[key] = p; var gk = cel(p[0]) + "," + cel(p[1]); (grade[gk] = grade[gk] || []).push(key); }
    }
    for (i = 0; i < tris.length; i++) for (k = 0; k < 3; k++) {
      var a = tris[i][k], b = tris[i][(k + 1) % 3], ka = chaveP(a), kb = chaveP(b);
      if (ka === kb) continue;
      var x0 = cel(Math.min(a[0], b[0]) - TOL), x1 = cel(Math.max(a[0], b[0]) + TOL), z0 = cel(Math.min(a[1], b[1]) - TOL), z1 = cel(Math.max(a[1], b[1]) + TOL), ins = [];
      if ((x1 - x0 + 1) * (z1 - z0 + 1) <= 600) {
        var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
        for (var gx = x0; gx <= x1; gx++) for (var gz = z0; gz <= z1; gz++) {
          var lst = grade[gx + "," + gz]; if (!lst) continue;
          for (var q = 0; q < lst.length; q++) {
            var kq = lst[q]; if (kq === ka || kq === kb) continue;
            var pq = pts[kq], t = ((pq[0] - a[0]) * dx + (pq[1] - a[1]) * dz) / L2;
            if (t <= 1e-6 || t >= 1 - 1e-6) continue;
            if (Math.abs((pq[0] - a[0]) * dz - (pq[1] - a[1]) * dx) / L < TOL) ins.push({ t: t, k: kq });
          }
        }
      }
      ins.sort(function (u, v) { return u.t - v.t; });
      var seq = [ka]; ins.forEach(function (x) { if (seq[seq.length - 1] !== x.k) seq.push(x.k); }); if (seq[seq.length - 1] !== kb) seq.push(kb);
      for (var s = 0; s + 1 < seq.length; s++) arestas.push([seq[s], seq[s + 1]]);
    }
    return { arestas: arestas, pts: pts };
  }
  function lacosDeTris(tris) {
    var cont = {}, i, k, AD = arestasDivididas(tris), pt = AD.pts;
    for (i = 0; i < AD.arestas.length; i++) {
      var a = AD.arestas[i][0], b = AD.arestas[i][1];
      if (a === b) continue;
      var e = a < b ? a + "|" + b : b + "|" + a;
      cont[e] = (cont[e] || 0) + 1;
    }
    var viz = {}, bordas = 0;
    Object.keys(cont).forEach(function (e) {
      if (cont[e] !== 1) return;
      var s = e.split("|"); (viz[s[0]] = viz[s[0]] || []).push(s[1]); (viz[s[1]] = viz[s[1]] || []).push(s[0]); bordas++;
    });
    var usada = {}, lacos = [];
    function uk(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
    Object.keys(viz).forEach(function (ini) {
      (viz[ini] || []).forEach(function (primeiro) {
        if (usada[uk(ini, primeiro)]) return;
        var seq = [ini], atual = primeiro, ant = ini; usada[uk(ini, primeiro)] = 1;
        var guarda = 0;
        while (atual !== ini && guarda++ < 100000) {
          seq.push(atual);
          var cand = (viz[atual] || []).filter(function (n) { return !usada[uk(atual, n)]; });
          if (!cand.length) { seq = null; break; }
          var prox = cand[0];
          usada[uk(atual, prox)] = 1; ant = atual; atual = prox;
        }
        if (!seq || seq.length < 3) return;
        var pts = seq.map(function (c) { return pt[c]; });
        lacos.push({ pts: simplificar(pts), area: 0 });
      });
    });
    lacos.forEach(function (l) { l.area = areaPoli(l.pts); });
    lacos = lacos.filter(function (l) { return l.pts.length >= 3 && Math.abs(l.area) > 1e-8; });
    return { lacos: lacos, bordas: bordas };
  }
  /* tira os pontos que estão (a menos de 0,5 mm) sobre a reta dos vizinhos */
  function simplificar(P) {
    var pts = P.slice(), mudou = true, guard = 0;
    while (mudou && pts.length > 3 && guard++ < 50) {
      mudou = false;
      var out = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        var dx = c[0] - a[0], dz = c[1] - a[1], L = Math.sqrt(dx * dx + dz * dz);
        var d = L < 1e-12 ? Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) : Math.abs((b[0] - a[0]) * dz - (b[1] - a[1]) * dx) / L;
        if (d < 0.0005 && out.length + (pts.length - i - 1) >= 3) { mudou = true; continue; }
        out.push(b);
      }
      pts = out;
    }
    return pts;
  }
  function dentroPoli(p, P) {
    var c = false, n = P.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      if (((P[i][1] > p[1]) !== (P[j][1] > p[1])) && (p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) c = !c;
    }
    return c;
  }
  /* separa o laço EXTERNO (o de maior área) dos FUROS (os que estão dentro dele) */
  function contornoComFuros(lacos) {
    if (!lacos.length) return null;
    var ls = lacos.slice().sort(function (a, b) { return Math.abs(b.area) - Math.abs(a.area); });
    var ext = ls[0], furos = [];
    for (var i = 1; i < ls.length; i++) {
      var p = ls[i].pts[0], m = [(ls[i].pts[0][0] + ls[i].pts[1][0]) / 2, (ls[i].pts[0][1] + ls[i].pts[1][1]) / 2];
      if (dentroPoli(m, ext.pts) || dentroPoli(p, ext.pts)) furos.push(ls[i]);
    }
    return { ext: ext, furos: furos, areaLiq: Math.abs(ext.area) - furos.reduce(function (s, f) { return s + Math.abs(f.area); }, 0) };
  }

  /* ----------------------------------------------------------------- medir */
  /* Lê o conjunto de triângulos UMA vez e devolve o que o classificador usa.
   * Quadro VERTICAL: o retângulo de menor área do casco na planta (XZ) + a faixa
   * de Y — é o mesmo molde das caixas do editor (centro, comprimento no eixo X
   * local, espessura em Z local, altura em Y, rotY). */
  function medir(T) {
    var n = (T.length / 9) | 0;
    if (n < 1) return null;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    var A = 0, Aup = 0, Adn = 0, Ah = 0, Av = 0, vistos = {}, P = [], i, k;
    for (i = 0; i < n; i++) {
      var o = i * 9, ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
      for (k = 0; k < 9; k += 3) {
        var x = T[o + k], y = T[o + k + 1], z = T[o + k + 2];
        if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x; if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y; if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z;
        var key = Math.round(x * 1000) * 4000000 + Math.round(z * 1000);
        if (!vistos[key]) { vistos[key] = 1; P.push([x, z]); }
      }
      var ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-12) continue;
      var ar = len / 2, nyn = ny / len;
      A += ar;
      if (nyn > 0.985) { Aup += ar; Ah += ar; } else if (nyn < -0.985) { Adn += ar; Ah += ar; } else if (Math.abs(nyn) < 0.12) Av += ar;
    }
    var H = casco(P), ret = retanguloMinimo(H);
    if (!ret && H.length === 2) {   /* planta degenerada (um painel vertical visto de cima é um segmento): retângulo de espessura zero */
      var dx0 = H[1][0] - H[0][0], dz0 = H[1][1] - H[0][1], l0 = Math.sqrt(dx0 * dx0 + dz0 * dz0);
      if (l0 > 1e-9) ret = { cx: (H[0][0] + H[1][0]) / 2, cz: (H[0][1] + H[1][1]) / 2, ux: dx0 / l0, uz: dz0 / l0, a: l0, b: 0, area: 0 };
    }
    if (!ret) return null;
    return {
      nTri: n, mn: mn, mx: mx, area: A, aUp: Aup, aDn: Adn, aH: Ah, aV: Av, areaCasco: Math.abs(areaPoli(H)), casco: H,
      ret: ret, y0: mn[1], y1: mx[1], h: mx[1] - mn[1],
      /* só horizontal ou só vertical: a extrusão vertical (pilar, parede, laje) */
      prismaY: A > 0 ? (Ah + Av) / A : 0,
      camada: Math.max(Aup, Adn)
    };
  }

  /* fração da área em cima das 6 faces da caixa do quadro vertical */
  function coberturaCaixa(T, m) {
    var r = m.ret, a2 = r.a / 2, b2 = r.b / 2, wx = -r.uz, wz = r.ux, tol = LIM.tolFace, n = m.nTri, soma = 0, tot = 0;
    for (var i = 0; i < n; i++) {
      var o = i * 9, pu = [0, 0, 0], pw = [0, 0, 0], py = [0, 0, 0], k;
      for (k = 0; k < 3; k++) {
        var x = T[o + k * 3] - r.cx, z = T[o + k * 3 + 2] - r.cz;
        pu[k] = x * r.ux + z * r.uz; pw[k] = x * wx + z * wz; py[k] = T[o + k * 3 + 1];
      }
      var ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, ar = Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
      tot += ar;
      function todos(v, alvo) { return Math.abs(v[0] - alvo) < tol && Math.abs(v[1] - alvo) < tol && Math.abs(v[2] - alvo) < tol; }
      if (todos(pu, a2) || todos(pu, -a2) || todos(pw, b2) || todos(pw, -b2) || todos(py, m.y0) || todos(py, m.y1)) soma += ar;
    }
    return tot > 0 ? soma / tot : 0;
  }

  /* --------------------------------------------- componentes conectados
   * Um IfcBuildingElementProxy do SketchUp costuma ser um GRUPO: vários sólidos
   * sem relação num elemento só (a estrutura metálica tem proxies de 555 e de
   * 123 peças). Cada pedaço ligado por vértices vira um candidato — o grupo só
   * é trocado se TODOS os pedaços forem reconhecidos (ver `analisar`). */
  function componentes(T) {
    var n = (T.length / 9) | 0;
    if (n <= 12) return [T];
    var pai = new Int32Array(n), i, k;
    for (i = 0; i < n; i++) pai[i] = i;
    function raiz(a) { while (pai[a] !== a) { pai[a] = pai[pai[a]]; a = pai[a]; } return a; }
    var dono = {}, q = 1 / LIM.tolVert;
    for (i = 0; i < n; i++) {
      for (k = 0; k < 3; k++) {
        var o = i * 9 + k * 3, key = Math.round(T[o] * q) + "," + Math.round(T[o + 1] * q) + "," + Math.round(T[o + 2] * q), j = dono[key];
        if (j === undefined) dono[key] = i; else { var a = raiz(i), b = raiz(j); if (a !== b) pai[a] = b; }
      }
    }
    var grupos = {}, ordem = [];
    for (i = 0; i < n; i++) { var r = raiz(i); if (!grupos[r]) { grupos[r] = []; ordem.push(r); } grupos[r].push(i); }
    if (ordem.length === 1) return [T];
    return ordem.map(function (r) {
      var L = grupos[r], out = new Float32Array(L.length * 9);
      for (var t = 0; t < L.length; t++) for (var c = 0; c < 9; c++) out[t * 9 + c] = T[L[t] * 9 + c];
      return out;
    });
  }

  /* ------------------------------------------- placa (fina) e seu plano
   * Normal dominante (área-ponderada, com o sinal virado para cima), achatamento,
   * espessura (vértices ao longo da normal) e as extensões no plano da placa:
   * e1 = horizontal (direção de nível do plano), e2 = linha de maior declive. */
  function placa(T, m) {
    var n = m.nTri, nx = 0, ny = 0, nz = 0, i, A = 0, rx = 0, ry = 1, rz = 0, rmax = -1;
    /* o sinal das normais: as duas faces de uma placa apontam para lados opostos e se cancelariam — todas são viradas para o lado da MAIOR face
       (virar só pelo Y não serve para o painel vertical, que tem cy = 0 nas duas) */
    for (i = 0; i < n; i++) {
      var o0 = i * 9, ax = T[o0 + 3] - T[o0], ay = T[o0 + 4] - T[o0 + 1], az = T[o0 + 5] - T[o0 + 2], bx = T[o0 + 6] - T[o0], by = T[o0 + 7] - T[o0 + 1], bz = T[o0 + 8] - T[o0 + 2];
      var qx = ay * bz - az * by, qy = az * bx - ax * bz, qz = ax * by - ay * bx, ql = qx * qx + qy * qy + qz * qz;
      if (ql > rmax) { rmax = ql; var l0 = Math.sqrt(ql) || 1; rx = qx / l0; ry = qy / l0; rz = qz / l0; }
    }
    for (i = 0; i < n; i++) {
      var o = i * 9, ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
      var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, cl = Math.sqrt(cx * cx + cy * cy + cz * cz), dp = cl > 0 ? (cx * rx + cy * ry + cz * rz) / cl : 0, s = dp < 0 ? -1 : 1;
      if (Math.abs(dp) < 0.7) continue;   /* as bordas (a espessura) não entram na normal: o sinal delas é ruído e puxaria o plano */
      nx += s * cx; ny += s * cy; nz += s * cz;   /* soma de normal×(2·área): a área já pesa */
    }
    if (ny < 0 || (ny === 0 && (nx < 0 || (nx === 0 && nz < 0)))) { nx = -nx; ny = -ny; nz = -nz; }   /* a normal final aponta para cima (ou, vertical, para +x/+z) */
    var L = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (L < 1e-9) return null;
    nx /= L; ny /= L; nz /= L;
    var plano = 0, d0 = Infinity, d1 = -Infinity, e1x, e1z, e1l;
    for (i = 0; i < n; i++) {
      var o2 = i * 9, ux2 = T[o2 + 3] - T[o2], uy2 = T[o2 + 4] - T[o2 + 1], uz2 = T[o2 + 5] - T[o2 + 2], vx2 = T[o2 + 6] - T[o2], vy2 = T[o2 + 7] - T[o2 + 1], vz2 = T[o2 + 8] - T[o2 + 2];
      var cx2 = uy2 * vz2 - uz2 * vy2, cy2 = uz2 * vx2 - ux2 * vz2, cz2 = ux2 * vy2 - uy2 * vx2, a2 = Math.sqrt(cx2 * cx2 + cy2 * cy2 + cz2 * cz2) / 2;
      if (a2 < 1e-12) continue;
      A += a2; plano += Math.abs((cx2 * nx + cy2 * ny + cz2 * nz) / (2 * a2)) * a2;
      for (var k = 0; k < 3; k++) { var d = T[o2 + k * 3] * nx + T[o2 + k * 3 + 1] * ny + T[o2 + k * 3 + 2] * nz; if (d < d0) d0 = d; if (d > d1) d1 = d; }
    }
    /* e1 = (n × Y) normalizado — a direção horizontal contida no plano; plano horizontal: eixo X */
    e1x = nz; e1z = -nx; e1l = Math.sqrt(e1x * e1x + e1z * e1z);
    if (e1l < 1e-6) { e1x = 1; e1z = 0; e1l = 1; }
    e1x /= e1l; e1z /= e1l;
    /* e2 = n × e1 (declive); e1 = (e1x,0,e1z) */
    var e2x = ny * e1z, e2y = nz * e1x - nx * e1z, e2z = -ny * e1x, u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (i = 0; i < n * 3; i++) {
      var x = T[i * 3], y = T[i * 3 + 1], z = T[i * 3 + 2], pu = x * e1x + z * e1z, pw = x * e2x + y * e2y + z * e2z;
      if (pu < u0) u0 = pu; if (pu > u1) u1 = pu; if (pw < w0) w0 = pw; if (pw > w1) w1 = pw;
    }
    return { n: [nx, ny, nz], achat: A > 0 ? plano / A : 0, esp: d1 - d0, d0: d0, d1: d1, e1: [e1x, 0, e1z], e2: [e2x, e2y, e2z], L1: u1 - u0, L2: w1 - w0, u0: u0, w0: w0,
             grau: Math.acos(Math.min(1, Math.abs(ny))) * 180 / Math.PI, area: A };
  }

  /* ------------------------------------------ seção de uma extrusão reta
   * eixo "Y": prisma vertical (pilar) — a seção é a tampa de cima projetada no
   *   quadro (u, w) do retângulo mínimo da planta;
   * eixo "U": prisma horizontal ao longo do lado longo da planta (viga) — a seção é
   *   a tampa da ponta projetada em (w, y).
   * Devolve { ext, furos, areaLiq, s: [s0,s1], t: [t0,t1] } ou null quando a tampa não fecha. */
  function secaoDe(T, m, eixo) {
    var r = m.ret, wx = -r.uz, wz = r.ux, n = m.nTri, tris = [], areaTris = 0, tol = LIM.tolFace, i, k;
    for (i = 0; i < n; i++) {
      var o = i * 9, P = [];
      for (k = 0; k < 3; k++) { var x = T[o + k * 3], y = T[o + k * 3 + 1], z = T[o + k * 3 + 2]; P.push([(x - r.cx) * r.ux + (z - r.cz) * r.uz, (x - r.cx) * wx + (z - r.cz) * wz, y]); }
      var ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-12) continue;
      if (eixo === "Y") {
        var yMax = P[0][2] >= m.y1 - tol && P[1][2] >= m.y1 - tol && P[2][2] >= m.y1 - tol && Math.abs(ny / len) > 0.985;   /* a tampa de cima, com a normal para qualquer lado: nem toda exportação orienta a malha */
        if (yMax) { tris.push([[P[0][0], P[0][1]], [P[1][0], P[1][1]], [P[2][0], P[2][1]]]); areaTris += len / 2; }
      } else {
        var nu = Math.abs((nx * r.ux + nz * r.uz) / len);   /* componente da normal ao longo do eixo da peça (sem o sinal, como a tampa de cima) */
        var fim = P[0][0] >= r.a / 2 - tol && P[1][0] >= r.a / 2 - tol && P[2][0] >= r.a / 2 - tol && nu > 0.985;
        if (fim) { tris.push([[P[0][1], P[0][2]], [P[1][1], P[1][2]], [P[2][1], P[2][2]]]); areaTris += len / 2; }
      }
    }
    if (!tris.length) return null;
    var L = lacosDeTris(tris), c = contornoComFuros(L.lacos);
    if (!c) return null;
    if (Math.abs(c.areaLiq - areaTris) > 0.03 * areaTris + 1e-7) return null;   /* a tampa não fecha (T-junction, quebrada): não se confia */
    var s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    c.ext.pts.forEach(function (p) { if (p[0] < s0) s0 = p[0]; if (p[0] > s1) s1 = p[0]; if (p[1] < t0) t0 = p[1]; if (p[1] > t1) t1 = p[1]; });
    return { ext: c.ext.pts, furos: c.furos.map(function (f) { return f.pts; }), areaLiq: c.areaLiq, s: [s0, s1], t: [t0, t1] };
  }
  function unicos(vals, tol) {
    var s = vals.slice().sort(function (a, b) { return a - b; }), out = [];
    s.forEach(function (v) { if (!out.length || v - out[out.length - 1] > tol) out.push(v); });
    return out;
  }
  function ehCirculo(P, tol) {
    if (P.length < 8) return null;
    var cs = 0, ct = 0; P.forEach(function (p) { cs += p[0]; ct += p[1]; }); cs /= P.length; ct /= P.length;
    var rs = P.map(function (p) { return Math.sqrt((p[0] - cs) * (p[0] - cs) + (p[1] - ct) * (p[1] - ct)); }), rm = 0; rs.forEach(function (v) { rm += v; }); rm /= rs.length;
    for (var i = 0; i < rs.length; i++) if (Math.abs(rs[i] - rm) > Math.max(tol, 0.012 * rm)) return null;
    return { cs: cs, ct: ct, r: rm };
  }
  /* reconhece a forma da seção: ret | circ | tubo-ret | tubo-circ | I — medidas em METROS.
     I devolve também `flange` ("s" ou "t"): em que eixo da seção fica a largura da mesa. */
  function reconhecerSecao(sec) {
    var W = sec.s[1] - sec.s[0], Hh = sec.t[1] - sec.t[0], P = sec.ext, tol = 0.0012, n = P.length;
    var cs = (sec.s[0] + sec.s[1]) / 2, ct = (sec.t[0] + sec.t[1]) / 2;
    function rect(Q) {
      if (Q.length !== 4) return null;
      var s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity; Q.forEach(function (p) { if (p[0] < s0) s0 = p[0]; if (p[0] > s1) s1 = p[0]; if (p[1] < t0) t0 = p[1]; if (p[1] > t1) t1 = p[1]; });
      var ok = Q.every(function (p) { return (Math.abs(p[0] - s0) < tol || Math.abs(p[0] - s1) < tol) && (Math.abs(p[1] - t0) < tol || Math.abs(p[1] - t1) < tol); });
      return ok ? { s0: s0, s1: s1, t0: t0, t1: t1 } : null;
    }
    if (!sec.furos.length) {
      var R = rect(P);
      if (R) return { forma: "ret", b: W, h: Hh, s: sec.s, t: sec.t };
      var C = ehCirculo(P, tol);
      if (C && Math.abs(W - Hh) < 0.01 * W + tol) return { forma: "circ", d: 2 * C.r };
      if (n === 12) {
        var us = unicos(P.map(function (p) { return p[0] - cs; }), tol), ut = unicos(P.map(function (p) { return p[1] - ct; }), tol);
        if (us.length === 4 && ut.length === 4) {
          var tryA = tentarI(P, cs, ct, us, ut, true), tryB = tentarI(P, cs, ct, ut, us, false);
          if (tryA) return tryA;
          if (tryB) return tryB;
        }
      }
      return null;
    }
    if (sec.furos.length === 1) {
      var Fh = sec.furos[0], Ro = rect(P), Ri = rect(Fh);
      if (Ro && Ri) {
        var wi = Ri.s1 - Ri.s0, hi = Ri.t1 - Ri.t0, tS = (W - wi) / 2, tT = (Hh - hi) / 2, cen = Math.abs((Ri.s0 + Ri.s1) / 2 - cs) < tol * 2 && Math.abs((Ri.t0 + Ri.t1) / 2 - ct) < tol * 2;
        if (cen && Math.abs(tS - tT) < tol * 2 && tS > 0.0005) return { forma: "tubo-ret", b: W, h: Hh, t: (tS + tT) / 2 };
        return null;
      }
      var Co = ehCirculo(P, tol), Ci = ehCirculo(Fh, tol);
      if (Co && Ci && Math.abs(Co.cs - Ci.cs) < tol * 2 && Math.abs(Co.ct - Ci.ct) < tol * 2) return { forma: "tubo-circ", D: 2 * Co.r, t: Co.r - Ci.r };
    }
    return null;
  }
  /* I: us = valores únicos da coordenada da LARGURA DA MESA, ut = os da ALTURA; confere os 12 vértices do gabarito */
  function tentarI(P, cs, ct, us, ut, flangeNoS) {
    var bf = us[3] - us[0], d = ut[3] - ut[0], tw = us[2] - us[1], tf = ut[1] - ut[0], tol = 0.0012;
    if (!(bf > 0 && d > 0 && tw > 0 && tf > 0) || !(tw < bf) || !(2 * tf < d)) return null;
    if (Math.abs(us[0] + us[3]) > tol * 2 || Math.abs(ut[0] + ut[3]) > tol * 2 || Math.abs((ut[3] - ut[2]) - tf) > tol * 2 || Math.abs(us[1] + us[2]) > tol * 2) return null;
    var G = [[us[0], ut[0]], [us[3], ut[0]], [us[3], ut[1]], [us[2], ut[1]], [us[2], ut[2]], [us[3], ut[2]], [us[3], ut[3]], [us[0], ut[3]], [us[0], ut[2]], [us[1], ut[2]], [us[1], ut[1]], [us[0], ut[1]]];
    var ok = G.every(function (g) { return P.some(function (p) { var a = flangeNoS ? p[0] - cs : p[1] - ct, b = flangeNoS ? p[1] - ct : p[0] - cs; return Math.abs(a - g[0]) < tol * 2 && Math.abs(b - g[1]) < tol * 2; }); });
    return ok ? { forma: "I", d: d, bf: bf, tw: tw, tf: tf, flange: flangeNoS ? "s" : "t" } : null;
  }

  /* ------------------------------------------------- catálogo de perfis de aço */
  var _cat = null;
  function indiceCatalogo() {
    if (_cat) return _cat;
    _cat = { I: [], "tubo-ret": [], "tubo-circ": [], U: [], L: [] };
    var PAc = PA();
    if (!PAc || !PAc.SERIES) return _cat;
    PAc.SERIES.forEach(function (s) {
      if (!_cat[s.forma]) return;
      PAc.listar(s.id).forEach(function (nome) {
        var o = PAc.obter(nome); if (!o) return;
        if (s.forma === "I" && o.d > 0 && o.bf > 0 && o.tw > 0 && o.tf > 0) _cat.I.push({ nome: nome, d: o.d, bf: o.bf, tw: o.tw, tf: o.tf });
        else if (s.forma === "tubo-ret" && o.b > 0 && o.h > 0 && o.t > 0) _cat["tubo-ret"].push({ nome: nome, b: o.b, h: o.h, t: o.t });
        else if (s.forma === "tubo-circ" && o.D > 0 && o.t > 0) _cat["tubo-circ"].push({ nome: nome, D: o.D, t: o.t });
      });
    });
    return _cat;
  }
  /* o perfil do catálogo que tem as MESMAS medidas (±1,5 mm ou 1,5 %): devolve { nome, perfil } ou null.
     ⚠ Sem igual não inventa: quem chama usa a seção medida e diz que ela está fora do catálogo. */
  function casarCatalogo(sec) {
    var idx = indiceCatalogo(), PAc = PA(), melhor = null, mm = function (v) { return v * 1000; };
    function tolMm(v) { return Math.max(1.5, 0.015 * v); }
    function teste(erro, nome) { if (!melhor || erro < melhor.erro) melhor = { erro: erro, nome: nome }; }
    if (sec.forma === "I") {
      idx.I.forEach(function (c) {
        var dd = Math.abs(c.d - mm(sec.d)), db = Math.abs(c.bf - mm(sec.bf)), dw = Math.abs(c.tw - mm(sec.tw)), df = Math.abs(c.tf - mm(sec.tf));
        if (dd <= tolMm(c.d) && db <= tolMm(c.bf) && dw <= Math.max(1.0, 0.1 * c.tw) && df <= Math.max(1.0, 0.1 * c.tf)) teste(dd / c.d + db / c.bf + dw / c.tw + df / c.tf, c.nome);
      });
    } else if (sec.forma === "tubo-ret") {
      idx["tubo-ret"].forEach(function (c) {
        var dir = Math.abs(c.b - mm(sec.b)) + Math.abs(c.h - mm(sec.h)), inv = Math.abs(c.b - mm(sec.h)) + Math.abs(c.h - mm(sec.b)), dt = Math.abs(c.t - mm(sec.t));
        if (Math.min(dir, inv) <= 2 * tolMm(c.b) && dt <= Math.max(0.6, 0.12 * c.t)) teste(Math.min(dir, inv) / c.b + dt / c.t, c.nome);
      });
    } else if (sec.forma === "tubo-circ") {
      idx["tubo-circ"].forEach(function (c) {
        var dD = Math.abs(c.D - mm(sec.D)), dt = Math.abs(c.t - mm(sec.t));
        if (dD <= tolMm(c.D) && dt <= Math.max(0.6, 0.12 * c.t)) teste(dD / c.D + dt / c.t, c.nome);
      });
    }
    if (!melhor || !PAc) return null;
    var p = PAc.paraPerfil(melhor.nome);
    return p ? { nome: melhor.nome, perfil: p } : null;
  }

  /* ------------------------------------------------ dicas (nome, camada, material)
   * ⚠ Só desempatam e rebaixam. "Componente#22" e "Undefined" não dizem nada, e
   * um nome bonito num elemento que a forma desmente NÃO cria a classe. */
  var PALAVRAS = [
    ["ignorar", /pedra|rock|stone|terreno|terrain|grama|gramado|vegeta|arvore|árvore|tree|folha|leaf|arbusto|jardim|cobertura vegetal|dimension|cota\b|texto|text\b|sombra|mobili|movel|móvel|sofa|sofá|cadeira|poltrona|mesa\b|banco\b|cortina|split|ar condicionado|vaso|sanit|subzero|geladeira|fogao|fogão|pessoa|human|carro|veiculo|veículo|piscina|agua|água/i],
    ["parede", /parede|wall|alvenaria|muro\b|vedacao|vedação|divisoria|divisória/i],
    ["laje", /laje|slab|piso|floor|deck|assoalho|forro|contrapiso|radier/i],
    ["pilar", /pilar|coluna|column|poste|pillar|pontalete/i],
    ["viga", /viga|beam|ter[cç]a|tesoura|caibro|ripa\b|barroto|travessa|bandeja|longarina|banzo/i],
    ["telhado", /telha|roof|cobertura|telhado|cumeeira/i],
    ["porta", /porta\b|door|portal/i],
    ["janela", /janela|window|esquadria|vidro|glass|caixilho|vitr[oô]/i]
  ];
  function dicasDe(el) {
    var s = [el && el.nome, el && el.camada, el && el.material, el && el.familia].filter(function (v) { return v != null && v !== ""; }).join(" | ");
    var r = {};
    PALAVRAS.forEach(function (p) { if (p[1].test(s)) r[p[0]] = true; });
    r.texto = s;
    return r;
  }
  /* o material provável das peças retangulares (pilar/viga): pelo texto do arquivo, das camadas e dos nomes */
  function materialProvavel(texto) {
    var t = String(texto || "");
    if (/madeira|wood|timber|\bdeck\b|ip[eê]\b|eucalipto|cumaru|garapa|pinus/i.test(t)) return "madeira";
    if (/met[aá]lic|metal|a[cç]o\b|steel|perfil|tubo|galvaniz|inox|alum[ií]nio/i.test(t)) return "aco";
    if (/concreto|concrete|alvenaria|c[ií]vil/i.test(t)) return "concreto";
    return null;
  }

  /* ------------------------------------------------ contorno de uma laje (planta)
   * As faces voltadas para CIMA (ou, se só houver as de baixo, estas) projetadas na
   * planta: o contorno externo e os furos. Piso ranhurado (deck) fecha igual: o topo
   * das ripas e o fundo das ranhuras se somam na mesma projeção e as arestas internas
   * se anulam. Devolve null quando a conta não fecha (3 %): nunca um contorno chutado. */
  function contornoLaje(T, m) {
    var lados = [1, -1];
    for (var li = 0; li < lados.length; li++) {
      var s = lados[li], tris = [], soma = 0;
      for (var i = 0; i < m.nTri; i++) {
        var o = i * 9, ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-12 || s * ny / len < 0.985) continue;
        tris.push([[T[o], T[o + 2]], [T[o + 3], T[o + 5]], [T[o + 6], T[o + 8]]]); soma += len / 2;
      }
      if (!tris.length) continue;
      var c = contornoComFuros(lacosDeTris(tris).lacos);
      if (c && Math.abs(c.areaLiq - soma) <= 0.03 * soma + 1e-7) return { ext: c.ext.pts, furos: c.furos.map(function (f) { return f.pts; }), area: c.areaLiq };
    }
    return null;
  }
  /* ------------------------------------------- a FACE de uma parede e os seus vãos
   * Os triângulos que estão no plano da face maior (pw = ±espessura/2) projetados em (pu, y).
   * Varredura por faixas verticais: em cada faixa entre dois vértices, o que sobra sem triângulo
   * entre a base e o topo é vazio; faixas vizinhas com o MESMO vazio juntam num retângulo = um vão.
   * fill = área coberta / (comprimento × altura): a parede com porta e janelas passa de 0,6; a
   * treliça ou a grade não. Vazio que encosta no topo ou numa ponta não é vão (é recorte). */
  function faceDaParede(T, m) {
    var r = m.ret, wx = -r.uz, wz = r.ux, tol = LIM.tolFace, lados = { "1": [], "-1": [] }, ar = { "1": 0, "-1": 0 }, i, k;
    for (i = 0; i < m.nTri; i++) {
      var o = i * 9, pu = [], pw = [], py = [];
      for (k = 0; k < 3; k++) { var x = T[o + k * 3] - r.cx, z = T[o + k * 3 + 2] - r.cz; pu.push(x * r.ux + z * r.uz); pw.push(x * wx + z * wz); py.push(T[o + k * 3 + 1]); }
      var s = 0;
      if (Math.abs(pw[0] - r.b / 2) < tol && Math.abs(pw[1] - r.b / 2) < tol && Math.abs(pw[2] - r.b / 2) < tol) s = 1;
      else if (Math.abs(pw[0] + r.b / 2) < tol && Math.abs(pw[1] + r.b / 2) < tol && Math.abs(pw[2] + r.b / 2) < tol) s = -1;
      if (!s) continue;
      lados[s].push([[pu[0], py[0]], [pu[1], py[1]], [pu[2], py[2]]]);
      ar[s] += Math.abs((pu[1] - pu[0]) * (py[2] - py[0]) - (pu[2] - pu[0]) * (py[1] - py[0])) / 2;
    }
    var lado = ar["1"] >= ar["-1"] ? 1 : -1, tris = lados[lado], A = r.a * m.h;
    if (!tris.length || !(A > 0)) return { fill: 0, vaos: [] };
    var bps = []; tris.forEach(function (t) { t.forEach(function (p) { bps.push(p[0]); }); });
    bps.push(-r.a / 2, r.a / 2);
    bps = unicos(bps, 0.001);
    var cob = 0, faixas = [];
    for (i = 0; i + 1 < bps.length; i++) {
      var a = bps[i], b = bps[i + 1]; if (b - a < 0.0015) continue;
      var xm = (a + b) / 2, iv = [];
      tris.forEach(function (t) {
        var xs = []; for (var e = 0; e < 3; e++) {
          var p = t[e], q = t[(e + 1) % 3];
          if ((p[0] <= xm && q[0] > xm) || (q[0] <= xm && p[0] > xm)) xs.push(p[1] + (q[1] - p[1]) * (xm - p[0]) / (q[0] - p[0]));
        }
        if (xs.length >= 2) iv.push([Math.min.apply(null, xs), Math.max.apply(null, xs)]);
      });
      iv.sort(function (u, v) { return u[0] - v[0]; });
      var un = [];
      iv.forEach(function (v) { var l = un[un.length - 1]; if (l && v[0] <= l[1] + 0.002) { if (v[1] > l[1]) l[1] = v[1]; } else un.push([v[0], v[1]]); });
      var gaps = [], cur = m.y0;
      un.forEach(function (v) { if (v[0] - cur > 0.02) gaps.push([cur, v[0]]); if (v[1] > cur) cur = v[1]; });
      if (m.y1 - cur > 0.02) gaps.push([cur, m.y1]);
      un.forEach(function (v) { cob += (b - a) * (Math.min(v[1], m.y1) - Math.max(v[0], m.y0)); });
      faixas.push({ a: a, b: b, gaps: gaps });
    }
    var vaos = [];
    faixas.forEach(function (f) {
      f.gaps.forEach(function (g) {
        var ex = vaos.filter(function (v) { return !v.fechado && Math.abs(v.y0 - g[0]) < 0.006 && Math.abs(v.y1 - g[1]) < 0.006 && Math.abs(v.x1 - f.a) < 0.003; })[0];
        if (ex) ex.x1 = f.b; else vaos.push({ x0: f.a, x1: f.b, y0: g[0], y1: g[1], fechado: false });
      });
      vaos.forEach(function (v) { if (!v.fechado && Math.abs(v.x1 - f.b) > 0.003) v.fechado = true; });
    });
    var fora = [], tolB = 0.003;
    var vs = vaos.filter(function (v) {
      var noTopo = Math.abs(v.y1 - m.y1) < 0.02, naPonta = v.x0 <= -r.a / 2 + tolB || v.x1 >= r.a / 2 - tolB, naBase = Math.abs(v.y0 - m.y0) < 0.02;
      if (noTopo || naPonta) { fora.push(v); return false; }
      return v.x1 - v.x0 >= 0.2 && v.y1 - v.y0 >= 0.3 && (naBase || v.y1 - v.y0 >= 0.2);
    });
    return { fill: cob / A, vaos: vs.map(function (v) { return { x0: v.x0, x1: v.x1, y0: v.y0, y1: v.y1 }; }), recortes: fora.length };
  }

  /* EXTRUSÃO DE VERDADE: toda face lateral (paralela ao eixo) tem de cair, projetada, em cima do contorno da seção — numa viga ou
     pilar de seção constante ela é a lateral do prisma; na treliça, na grade ou na peça com orelha existem faces laterais por DENTRO
     da seção (a face de dentro do banzo) e a seção lida na ponta é só uma sombra da peça. (Não uso o volume: o SketchUp exporta
     pilar sem a tampa de baixo, e a malha aberta não tem volume.) */
  function lateraisNoContorno(T, m, sec, eixo) {
    var r = m.ret, wx = -r.uz, wz = r.ux, loops = [sec.ext].concat(sec.furos || []), tol = 0.004;
    function dist(p, q, c) { var dx = c[0] - q[0], dz = c[1] - q[1], L2 = dx * dx + dz * dz, tt = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dz) / L2)) : 0, ex = q[0] + tt * dx - p[0], ez = q[1] + tt * dz - p[1]; return Math.sqrt(ex * ex + ez * ez); }
    function noContorno(p) { for (var l = 0; l < loops.length; l++) { var P = loops[l]; for (var i = 0; i < P.length; i++) if (dist(p, P[i], P[(i + 1) % P.length]) <= tol) return true; } return false; }
    for (var i = 0; i < m.nTri; i++) {
      var o = i * 9, ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-12) continue;
      var lateral = eixo === "Y" ? Math.abs(ny / len) < 0.12 : Math.abs((nx * r.ux + nz * r.uz) / len) < 0.12;
      if (!lateral) continue;
      var Q = [];
      for (var k = 0; k < 3; k++) {
        var x = T[o + k * 3] - r.cx, y = T[o + k * 3 + 1], z = T[o + k * 3 + 2] - r.cz;
        Q.push(eixo === "Y" ? [x * r.ux + z * r.uz, x * wx + z * wz] : [x * wx + z * wz, y]);
      }
      /* os vértices E o meio de cada aresta: uma face que atravessa a seção tem os vértices na borda e o meio dentro */
      var testar = Q.concat([[(Q[0][0] + Q[1][0]) / 2, (Q[0][1] + Q[1][1]) / 2], [(Q[1][0] + Q[2][0]) / 2, (Q[1][1] + Q[2][1]) / 2], [(Q[2][0] + Q[0][0]) / 2, (Q[2][1] + Q[0][1]) / 2]]);
      for (var k2 = 0; k2 < testar.length; k2++) if (!noContorno(testar[k2])) return false;
    }
    return true;
  }
  /* fração da área que é ao longo do eixo (u) ou perpendicular a ele: a extrusão horizontal (viga) */
  function prismaAoLongo(T, m) {
    var r = m.ret, A = 0, ok = 0;
    for (var i = 0; i < m.nTri; i++) {
      var o = i * 9, ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-12) continue;
      A += len / 2; var nu = Math.abs((nx * r.ux + nz * r.uz) / len);
      if (nu > 0.985 || nu < 0.12) ok += len / 2;
    }
    return A > 0 ? ok / A : 0;
  }

  /* ------------------------------------------------ o classificador de UM sólido
   * → { classe, conf, motivo, ... } ou { classe: null, motivo }.
   * classes: parede | laje | pilar | viga | esquadria (porta/janela, ver `casarEsquadrias`) | agua (plano de telhado, agrupado em `fitTelhados`). */
  function nulo(motivo) { return { classe: null, conf: null, motivo: motivo }; }
  function faixa(v, a, b) { return v >= a && v <= b; }

  function classificarSolido(T, ctx) {
    ctx = ctx || {};
    var m = medir(T);
    if (!m) return nulo("malha vazia");
    var p = m.ret.a, q = m.ret.b, h = m.h, dic = ctx.dicas || {};
    if (Math.max(p, h) < LIM.minLado) return nulo("miudeza (menor que 4 cm)");
    if (p > LIM.maxEdificio) return nulo("escala de terreno ou entorno (" + br(p, 0) + " m): não é elemento da edificação");
    if (dic.ignorar) return nulo("o nome/camada indica terreno, vegetação ou mobiliário");
    var cov = coberturaCaixa(T, m), caixa = cov >= LIM.cobCaixa, fillPlan = m.camada / (m.ret.area || 1), rectPlan = m.areaCasco / (m.ret.area || 1) >= 0.95;
    var prismaY = m.prismaY >= LIM.prismaMin;
    /* placa deitada com chanfro, ranhura ou V (o deck): as faces não são só horizontais/verticais, mas a horizontal manda */
    var chata = !prismaY && h <= 0.40 && m.area > 0 && m.aH / m.area >= 0.7;
    var base = { m: m, cobertura: cov, dims: { p: p, q: q, h: h } };
    function com(o) { for (var k in base) o[k] = base[k]; return o; }

    /* ---- 1. extrusão VERTICAL de planta retangular: caixa, parede (com ou sem vão), laje, pilar, viga ---- */
    var fino = q < 0.04;   /* sem espessura: painel/superfície — segue para a análise de placa (esquadria) lá embaixo */
    /* placa que parece deitada mas tem a ESPESSURA bem menor que a altura (h): está inclinada — água de telhado, não laje.
       (⚠ as faces de uma placa de 3° contam como "horizontais" na medida de prisma; quem separa é a espessura medida na normal) */
    var pl0 = (h <= 0.8 && q >= 0.4) ? placa(T, m) : null;
    var inclinada = !!(pl0 && pl0.grau > 1.5 && pl0.esp < 0.6 * h);
    var motivoFinal = "";

    /* ---- 1. extrusão VERTICAL de planta retangular: laje, parede (com ou sem vão), pilar e viga maciços ---- */
    if ((prismaY || chata) && rectPlan && !fino && !inclinada && (caixa || fillPlan >= (chata ? 0.7 : 0.88))) {
      var cx = m.ret.cx, cz = m.ret.cz, ux = m.ret.ux, uz = m.ret.uz, rotY = Math.atan2(-uz, ux);
      var geo = { cx: cx, cz: cz, rotY: rotY, ux: ux, uz: uz, y0: m.y0, y1: m.y1 };
      /* laje/piso: placa deitada. Com a área cheia é o retângulo; com menos de 97 % há furo ou recorte e o CONTORNO é lido */
      if (h <= 0.40 && q >= 0.40 && h <= 0.5 * q && p >= 0.6) {
        var altaL = faixa(h, 0.08, 0.30) && p * q >= 2, cl1 = null;
        if (fillPlan < 0.97) {
          cl1 = contornoLaje(T, m);
          if (!(cl1 && cl1.area >= 0.5)) {
            if (fillPlan < 0.9) return nulo("placa horizontal com recortes que não consegui ler (contorno não fecha): não converto sem certeza");
            cl1 = null; altaL = false;
          }
        }
        if (cl1) {
          var pol1 = cl1.ext;
          return com({ classe: "laje", conf: faixa(h, 0.08, 0.30) && pol1.length <= 24 ? "alta" : "media", forma: "contorno", contorno: pol1, furos: cl1.furos, areaLiquida: cl1.area, geo: geo,
            motivo: "placa horizontal com contorno de " + pol1.length + " lados" + (cl1.furos.length ? " e " + cl1.furos.length + " furo(s)" : "") + ", espessura " + br(h * 100, 1) + " cm, " + br(cl1.area) + " m²" });
        }
        return com({ classe: "laje", conf: altaL && !dic.pilar && !dic.viga ? "alta" : "media", forma: "retangulo", geo: geo,
          motivo: "placa horizontal de " + br(p) + " × " + br(q) + " m, espessura " + br(h * 100, 1) + " cm" + (altaL ? "" : (h < 0.08 ? " (fina: piso, deck ou revestimento)" : "")) });
      }
      /* parede (de 6 cm para cima: abaixo disso é painel — porta, vidro ou folha — e vai para a análise de esquadria) */
      if (q >= 0.06 && q <= 0.6 && p >= 3 * q && p >= 0.6 && ((h >= 1.0 && h >= 1.5 * q) || (h >= 0.5 && h < 1.0 && q <= 0.4 && p >= 1.0))) {
        var altaP = faixa(q, 0.07, 0.40) && faixa(h, 1.8, 6) && p >= 1.0 && !dic.viga && !dic.laje;
        var mureta = h < 1.0;
        /* a face pode ter vãos mesmo com 89 % da área nas faces da caixa (as laterais dos vãos são pequenas): a varredura da face roda sempre */
        var ff = faceDaParede(T, m);
        if (!caixa && ff.fill < 0.55) return nulo("não é parede: a face maior tem " + br((1 - ff.fill) * 100, 0) + " % de vazio (moldura, treliça ou grade)");
        var vaosP = ff.vaos;
        return com({ classe: "parede", conf: altaP ? "alta" : "media", forma: vaosP.length ? "com-vaos" : "caixa", geo: geo, vaos: vaosP,
          motivo: "prisma vertical de " + br(p) + " m × " + br(q * 100, 1) + " cm, altura " + br(h) + " m" + (mureta ? " (baixa: mureta ou viga — confira)" : "") + (vaosP.length ? "; " + vaosP.length + " vão(s) na face" : "") });
      }
      if (caixa) {
        /* pilar maciço: alto e esbelto */
        if (h >= 0.9 && h >= 2 * p && p <= 1.0) {
          if (q < 0.04) return nulo("seção de " + br(p * 100, 1) + " × " + br(q * 100, 1) + " cm: barra, corda ou haste — não é pilar");
          var pequeno = q < 0.08;
          return com({ classe: "pilar", conf: pequeno ? "baixa" : (faixa(q, 0.12, 0.8) && faixa(p, 0.12, 0.8) && h >= 2 && !dic.viga ? "alta" : "media"), forma: "ret", geo: geo, secao: { forma: "ret", b: p, h: q },
            motivo: "prisma vertical de seção " + br(p * 100, 1) + " × " + br(q * 100, 1) + " cm e " + br(h) + " m de altura" + (pequeno ? " (seção pequena demais para pilar)" : "") });
        }
        /* viga maciça: barra deitada (a seção é q de largura por h de altura) */
        if (h <= 0.8 && q <= 0.8 && p >= 3 * Math.max(q, h) && q >= 0.04 && h >= 0.04) {
          var esb = p / Math.max(q, h), pequenaV = Math.min(q, h) < 0.05;
          if (h < 0.5 * q) return nulo("barra chata (" + br(q * 100, 1) + " cm de largura × " + br(h * 100, 1) + " cm de espessura): chapa, ripa ou rodapé — sem equivalente seguro");
          return com({ classe: "viga", conf: esb >= 6 && !pequenaV && !dic.laje && !dic.pilar ? "alta" : "media", forma: "ret", geo: geo, secao: { forma: "ret", b: q, h: h },
            motivo: "barra horizontal de " + br(p) + " m, seção " + br(q * 100, 1) + " × " + br(h * 100, 1) + " cm" + (pequenaV ? " (seção pequena: ripa ou terça)" : "") });
        }
        if (q >= 0.06 && h >= 0.04) motivoFinal = "bloco de " + br(p) + " × " + br(q) + " × " + br(h) + " m sem equivalente (nem parede, laje, pilar ou viga)";
      }
    }

    /* ---- 2. extrusão vertical que NÃO é retângulo cheio: laje de contorno, ou pilar de perfil (tubo, I, círculo) ---- */
    if (prismaY && !fino && !inclinada) {
      if (h <= 0.40 && Math.min(p, q) >= 0.6) {
        var cl = contornoLaje(T, m);
        if (cl && cl.area >= 0.5) {
          var pol = cl.ext, area = Math.abs(areaPoli(pol));
          return com({ classe: "laje", conf: faixa(h, 0.08, 0.30) && pol.length <= 24 ? "alta" : "media", forma: "contorno", contorno: pol, furos: cl.furos, areaLiquida: cl.area,
            geo: { y0: m.y0, y1: m.y1 }, motivo: "placa horizontal com contorno de " + pol.length + " lados" + (cl.furos.length ? " e " + cl.furos.length + " furo(s)" : "") + ", espessura " + br(h * 100, 1) + " cm, " + br(area) + " m²" });
        }
        return nulo("placa horizontal de contorno irregular que não fecha (T-junction): não converto sem certeza");
      }
      if (h >= 0.9 && h >= 2 * Math.max(p, 0.1) && p <= 1.2) {
        var sec = secaoDe(T, m, "Y");
        if (!sec) return nulo("pilar de seção que não consegui ler (tampa do topo aberta ou irregular)");
        if (Math.abs((sec.s[1] - sec.s[0]) - p) > 0.004 || Math.abs((sec.t[1] - sec.t[0]) - q) > 0.004) return nulo("a tampa do topo é só uma parte da peça (peça composta, não um pilar de seção única)");
        if (!lateraisNoContorno(T, m, sec, "Y")) return nulo("há faces laterais por dentro da seção (treliça, grade ou peça composta): não é uma extrusão de seção constante");
        var rs = reconhecerSecao(sec);
        if (!rs) return nulo("seção de " + sec.ext.length + " vértices sem equivalente (não é retângulo, círculo, tubo nem I)");
        return com({ classe: "pilar", conf: "alta", forma: rs.forma, secaoLida: rs, geo: { cx: m.ret.cx, cz: m.ret.cz, ux: m.ret.ux, uz: m.ret.uz, y0: m.y0, y1: m.y1 }, secaoRef: sec,
          motivo: "prisma vertical de seção " + rotuloSecao(rs) + " e " + br(h) + " m" });
      }
      if (!motivoFinal) motivoFinal = "extrusão vertical sem equivalente (" + br(p) + " × " + br(q) + " × " + br(h) + " m)";
    }

    /* ---- 3. extrusão HORIZONTAL com seção de perfil (viga I, tubo) ---- */
    if (p >= 3 * Math.max(q, h) && q <= 0.8 && h <= 1.2 && Math.min(q, h) >= 0.04 && prismaAoLongo(T, m) >= LIM.prismaMin) {
      var secH = secaoDe(T, m, "U");
      if (secH && Math.abs((secH.s[1] - secH.s[0]) - q) <= 0.004 && Math.abs((secH.t[1] - secH.t[0]) - h) <= 0.004 && lateraisNoContorno(T, m, secH, "U")) {
        var rh = reconhecerSecao(secH);
        if (rh && !(rh.forma === "I" && rh.flange === "t")) {
          return com({ classe: "viga", conf: "alta", forma: rh.forma, secaoLida: rh, geo: { cx: m.ret.cx, cz: m.ret.cz, ux: m.ret.ux, uz: m.ret.uz, y0: m.y0, y1: m.y1 }, secaoRef: secH,
            motivo: "barra horizontal de " + br(p) + " m, seção " + rotuloSecao(rh) });
        }
      }
    }

    /* ---- 4. placa fina inclinada (água de telhado) ou vertical fina (esquadria) ---- */
    var pl = pl0 || placa(T, m);
    if (pl && pl.achat >= 0.85 && pl.esp <= Math.max(0.12, 0.08 * Math.max(pl.L1, pl.L2))) {
      if (pl.grau >= 80) {
        var lg = pl.L1, al = m.h, e1 = pl.e1;
        if (lg >= 0.4 && lg <= 4.5 && al >= 0.4 && al <= 3.3 && lg * al >= 0.25 && pl.esp <= 0.30) {
          var dicaE = !!(dic.janela || dic.porta);
          return com({ classe: "esquadria", conf: dicaE ? "media" : "baixa", forma: "painel", placa: pl,
            esq: { cx: (m.mn[0] + m.mx[0]) / 2, cz: (m.mn[2] + m.mx[2]) / 2, rotY: Math.atan2(-e1[2], e1[0]), largura: lg, altura: al, y0: m.y0, esp: pl.esp, dica: dic.porta ? "porta" : (dic.janela ? "janela" : null) },
            motivo: "painel vertical de " + br(lg) + " × " + br(al) + " m, espessura " + br(pl.esp * 100, 1) + " cm" + (dicaE ? " (o nome indica esquadria)" : " (sem nome de esquadria: só vale se estiver numa parede)") });
        }
        return nulo("painel vertical de " + br(lg) + " × " + br(al) + " m fora das medidas de porta ou janela");
      }
      if (pl.grau >= 2 && pl.grau <= 50 && pl.area >= 0.5) {
        if (pl.esp < 0.01 && !dic.telhado) return nulo("superfície inclinada de " + br(pl.grau, 1) + "° sem espessura e sem nome de telhado (pode ser terreno ou face solta)");
        return com({ classe: "agua", conf: "media", placa: pl, motivo: "placa inclinada " + br(pl.grau, 1) + "° de " + br(pl.L1) + " × " + br(pl.L2) + " m" });
      }
    }
    return nulo(motivoFinal || ("forma sem equivalente seguro (" + m.nTri + " triângulos, " + br(p) + " × " + br(q) + " × " + br(h) + " m)"));
  }
  /* classifica UM elemento: cada geometria colocada (parte) primeiro como sólido inteiro; a que não
   * classifica e é grande o bastante é partida em pedaços ligados (grupo do SketchUp) — até 300 pedaços:
   * mais que isso é malha orgânica (pedra, árvore, mobiliário) e o pedaço-a-pedaço só gera ruído.
   * el = { nome, camada, material, tris, partes?: [triângulos acumulados por parte] } → lista de { r, T } */
  function classificarElemento(el, ctx) {
    var T = el.tris, n = (T.length / 9) | 0, out = [];
    if (!n) return out;
    if (n > LIM.maxTri) return [{ r: nulo("malha pesada demais (" + n + " triângulos): escultura, pedra ou mobiliário — não classifico"), T: null, pesada: true }];
    var c2 = {}, k; for (k in (ctx || {})) c2[k] = ctx[k]; c2.dicas = dicasDe(el);
    var partes = el.partes && el.partes.length ? el.partes : [n], ini = 0;
    /* ⚠ O SketchUp parte UM sólido em várias geometrias quando ele tem mais de um material (topo de um lado, fundo de
       outro: a tábua do deck vinha em 2 partes). Classificar parte a parte NUNCA fecha o sólido. Por isso, se as partes
       formam UM corpo só (ligadas por vértices), o elemento inteiro é tentado primeiro; dois sólidos soltos no mesmo
       elemento (duas vigas lado a lado) continuam sendo duas peças. */
    if (partes.length > 1) {
      var comp1 = componentes(T);
      if (comp1.length === 1) {
        var rInt = classificarSolido(T, c2);
        if (rInt.classe) return [{ r: rInt, T: T }];
      }
    }
    partes.forEach(function (fim) {
      var sub = T.subarray(ini * 9, fim * 9); ini = fim;
      if (!sub.length) return;
      var r = classificarSolido(sub, c2);
      if (!r.classe && !r.motivoDefinitivo && (sub.length / 9) >= 24) {
        var comps = componentes(sub);
        if (comps.length > 1 && comps.length <= 300) {
          var rs = comps.map(function (c) { return { r: classificarSolido(c, c2), T: c }; });
          if (rs.some(function (x) { return x.r.classe; })) { rs.forEach(function (x) { out.push(x); }); return; }
        } else if (comps.length > 300) { out.push({ r: nulo("malha orgânica (" + comps.length + " pedaços soltos)"), T: sub }); return; }
      }
      out.push({ r: r, T: sub });
    });
    return out;
  }

  /* =====================================================================
   * A ANÁLISE DO MODELO TODO — peça por peça, depois o que depende de mais de uma peça
   *   estado = iniciar(opts) → acrescentar(estado, el) × N → fechar(estado)
   * A tela chama `acrescentar` em fatias (barra de progresso, botão cancelar): nada aqui trava a página.
   * opts: { arquivo: nome do .ifc (ajuda a escolher o material), materiais: { pilar, viga } (escolha do usuário) }
   * ===================================================================== */
  function iniciar(opts) {
    opts = opts || {};
    return { opts: opts, pecas: [], elementos: [], arquivoDica: String(opts.arquivo || ""), t0: Date.now() };
  }
  /* uma peça do modelo (elemento do IFC) entra na análise */
  function acrescentar(est, el) {
    var res = classificarElemento(el, { arquivo: est.arquivoDica }), idxs = [], areaTot = 0;
    res.forEach(function (x) {
      var a = x.r.m ? x.r.m.area : (x.T ? areaDe(x.T) : 0);
      areaTot += a;
      var p = { i: est.pecas.length, uid: el.uid, r: x.r, T: x.T, area: a, dic: dicasDe(el), nomeEl: el.nome || "", camada: el.camada || "" };
      est.pecas.push(p); idxs.push(p.i);
    });
    est.elementos.push({ uid: el.uid, id: el.id, arq: el.arq != null ? el.arq : null, nome: el.nome || "", camada: el.camada || "", pecas: idxs, area: areaTot, nTri: (el.tris.length / 9) | 0 });
    return res.length;
  }
  function areaDe(T) {
    var s = 0;
    for (var i = 0; i + 8 < T.length; i += 9) {
      var ux = T[i + 3] - T[i], uy = T[i + 4] - T[i + 1], uz = T[i + 5] - T[i + 2], vx = T[i + 6] - T[i], vy = T[i + 7] - T[i + 1], vz = T[i + 8] - T[i + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; s += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
    }
    return s;
  }
  function angDif(a, b) { var d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); }

  /* ------------------------------------------------------------ telhado: águas → telhado */
  function pontosDeTris(T, f) { for (var i = 0; i + 2 < T.length; i += 3) f(T[i], T[i + 1], T[i + 2]); }
  function fitTelhados(aguas) {
    var grupos = [];
    aguas.forEach(function (a) {
      var pl = a.r.placa, c = a.r.m, ctr = [(c.mn[0] + c.mx[0]) / 2, (c.mn[1] + c.mx[1]) / 2, (c.mn[2] + c.mx[2]) / 2], alvo = null;
      for (var g = 0; g < grupos.length && !alvo; g++) {
        var G = grupos[g], ang = Math.acos(Math.min(1, Math.max(-1, G.n[0] * pl.n[0] + G.n[1] * pl.n[1] + G.n[2] * pl.n[2]))) * 180 / Math.PI;
        var dist = Math.abs(G.n[0] * ctr[0] + G.n[1] * ctr[1] + G.n[2] * ctr[2] - G.off / G.peso);
        var gap = Math.max(a.r.m.mn[0] - G.mx[0], G.mn[0] - a.r.m.mx[0], a.r.m.mn[2] - G.mx[2], G.mn[2] - a.r.m.mx[2]);
        if (ang <= 2.5 && dist <= 0.3 && gap <= 0.6) alvo = G;
      }
      if (!alvo) { alvo = { n: pl.n.slice(), nSoma: [0, 0, 0], off: 0, peso: 0, mn: [Infinity, 0, Infinity], mx: [-Infinity, 0, -Infinity], membros: [] }; grupos.push(alvo); }
      alvo.membros.push(a);
      var w = pl.area || 1;
      alvo.nSoma[0] += pl.n[0] * w; alvo.nSoma[1] += pl.n[1] * w; alvo.nSoma[2] += pl.n[2] * w;
      var L = Math.sqrt(alvo.nSoma[0] * alvo.nSoma[0] + alvo.nSoma[1] * alvo.nSoma[1] + alvo.nSoma[2] * alvo.nSoma[2]);
      alvo.n = [alvo.nSoma[0] / L, alvo.nSoma[1] / L, alvo.nSoma[2] / L];
      alvo.off += (alvo.n[0] * ctr[0] + alvo.n[1] * ctr[1] + alvo.n[2] * ctr[2]) * w; alvo.peso += w;
      alvo.mn[0] = Math.min(alvo.mn[0], c.mn[0]); alvo.mn[2] = Math.min(alvo.mn[2], c.mn[2]); alvo.mx[0] = Math.max(alvo.mx[0], c.mx[0]); alvo.mx[2] = Math.max(alvo.mx[2], c.mx[2]);
    });
    var telhados = [];
    grupos.forEach(function (G) {
      var n = G.n, ny = n[1]; if (ny < 0.5) return;
      var gx = -n[0] / ny, gz = -n[2] / ny, tg = Math.sqrt(gx * gx + gz * gz);
      if (tg < 0.03) return;   /* menos de ~1,7°: é piso, não telhado */
      var uh = [gx / tg, gz / tg];
      /* o plano das placas do SketchUp costuma ter um ruído de décimos de grau fora do eixo (a normal de uma telha de 10 m
         sai 0,3° torta na outra direção): o declive vira, de fato, uma diagonal de 7° e o retângulo "do plano" fica torto
         em relação às placas. Se o declive está a menos de 15° do eixo das placas (ou da perpendicular), usa o eixo. */
      var maior = G.membros.slice().sort(function (a, b) { return b.r.placa.area - a.r.placa.area; })[0], rr = maior.r.m.ret;
      [[rr.ux, rr.uz], [-rr.uz, rr.ux]].some(function (ax) {
        var dp = uh[0] * ax[0] + uh[1] * ax[1];
        if (Math.abs(dp) >= 0.966) { var sg = dp >= 0 ? 1 : -1, ux2 = sg * ax[0], uz2 = sg * ax[1]; tg = gx * ux2 + gz * uz2; uh = [ux2, uz2]; return true; }
        return false;
      });
      if (tg < 0.03) return;
      var e1 = [-uh[1], uh[0]];
      var s0 = Infinity, s1 = -Infinity, v0 = Infinity, v1 = -Infinity, dMin = Infinity, dMax = -Infinity, hulls = [];
      G.membros.forEach(function (a) {
        var pts = [];
        pontosDeTris(a.T, function (x, y, z) {
          var s = x * e1[0] + z * e1[1], v = x * uh[0] + z * uh[1], d = x * n[0] + y * n[1] + z * n[2];
          if (s < s0) s0 = s; if (s > s1) s1 = s; if (v < v0) v0 = v; if (v > v1) v1 = v; if (d < dMin) dMin = d; if (d > dMax) dMax = d;
          pts.push([s, v]);
        });
        hulls.push(casco(pts));
      });
      var areaR = (s1 - s0) * (v1 - v0);
      if (!(areaR > 4) || (s1 - s0) < 1 || (v1 - v0) < 1) return;
      /* cobertura por amostragem: a fração do retângulo que algum membro cobre (sobreposição não conta duas vezes) */
      var passo = Math.max(0.25, Math.sqrt(areaR) / 60), nx = Math.max(1, Math.round((s1 - s0) / passo)), nv = Math.max(1, Math.round((v1 - v0) / passo)), dentro = 0, tot = 0;
      for (var iu = 0; iu < nx; iu++) for (var iv = 0; iv < nv; iv++) {
        var ps = s0 + (iu + 0.5) * (s1 - s0) / nx, pv = v0 + (iv + 0.5) * (v1 - v0) / nv; tot++;
        for (var h = 0; h < hulls.length; h++) if (hullContem(hulls[h], ps, pv)) { dentro++; break; }
      }
      var cobr = tot ? dentro / tot : 0;
      /* os cantos do retângulo (s, v) → planta (x, z); a aresta 0 é a de baixo (v0), a que define a inclinação */
      function xz(s, v) { return [s * e1[0] + v * uh[0], s * e1[1] + v * uh[1]]; }
      var A = xz(s0, v0), B = xz(s1, v0), C = xz(s1, v1), D = xz(s0, v1);
      var orient = (B[0] - A[0]) * (C[1] - B[1]) - (B[1] - A[1]) * (C[0] - B[0]);
      if (orient < 0) { var tA = A; A = B; B = tA; tA = C; C = D; D = tA; }
      var mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, yBeiral = (dMin - n[0] * mx - n[2] * mz) / ny;   /* a face de BAIXO na linha do beiral */
      telhados.push({ membros: G.membros, n: n, grau: Math.atan(tg) * 180 / Math.PI, inclinacao: tg * 100, contorno: [A, B, C, D], deslocBase: yBeiral,
                      espessura: Math.min(0.2, Math.max(0.01, (dMax - dMin))), cobertura: cobr, area: areaR, largura: s1 - s0, caimento: v1 - v0, cumeeiraY: yBeiral + (v1 - v0) * tg });
    });
    return telhados;
  }
  function hullContem(H, x, y) {
    if (H.length < 3) return false;
    for (var i = 0; i < H.length; i++) { var a = H[i], b = H[(i + 1) % H.length]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -1e-9) return false; }
    return true;
  }

  /* --------------------------------------- fechar: tudo que depende de mais de uma peça */
  function fechar(est) {
    var opts = est.opts || {}, itens = [], seq = 0, pecas = est.pecas;
    function novo(cls, conf, motivo, uids, dados) { var it = { id: cls.slice(0, 3) + (++seq), classe: cls, conf: conf, motivo: motivo, uids: uids, dados: dados, aplicavel: conf !== "baixa", pecas: [] }; itens.push(it); return it; }
    var matArq = materialProvavel(est.arquivoDica);
    function materialDe(p, forma, cls) {
      var escolha = opts.materiais && opts.materiais[cls];
      if (escolha) return { v: escolha, fonte: "escolha sua" };
      var byDica = materialProvavel(p.dic.texto);
      if (byDica) return { v: byDica, fonte: "nome/camada" };
      if (forma === "I" || forma === "tubo-ret" || forma === "tubo-circ") return { v: "aco", fonte: "perfil de aço" };
      if (matArq) return { v: matArq, fonte: "nome do arquivo" };
      return { v: "concreto", fonte: "padrão (confira)" };
    }
    /* 1) as peças isoladas */
    var paredes = [], esqs = [], aguas = [];
    pecas.forEach(function (p) {
      var r = p.r; if (!r || !r.classe) return;
      var g = r.geo, it = null;
      if (r.classe === "parede") {
        it = novo("parede", r.conf, r.motivo, [p.uid], { cx: g.cx, cz: g.cz, rotY: g.rotY, ux: g.ux, uz: g.uz, comprimento: r.dims.p, espessura: r.dims.q, altura: r.dims.h, base: g.y0, vaos: r.vaos || [] });
        paredes.push(it);
      } else if (r.classe === "laje") {
        var d = { espessura: r.dims.h, topo: g.y1 };
        if (r.forma === "retangulo") {
          var a2 = r.dims.p / 2, b2 = r.dims.q / 2, wx = -g.uz, wz = g.ux;
          d.contorno = [[-a2, -b2], [a2, -b2], [a2, b2], [-a2, b2]].map(function (q) { return [r4(g.cx + q[0] * g.ux + q[1] * wx), r4(g.cz + q[0] * g.uz + q[1] * wz)]; });
          d.furos = [];
        } else { d.contorno = r.contorno.map(function (q) { return [r4(q[0]), r4(q[1])]; }); d.furos = (r.furos || []).map(function (f) { return f.map(function (q) { return [r4(q[0]), r4(q[1])]; }); }); }
        it = novo("laje", r.conf, r.motivo, [p.uid], d);
      } else if (r.classe === "pilar" || r.classe === "viga") {
        var perfil = null, rotulo = "", cat = null, sl = r.secaoLida, dd = r.dims, mat;
        if (r.forma === "ret" && r.secao) {
          perfil = { forma: "ret", b: r4(r.secao.b), h: r4(r.secao.h) };
        } else if (sl && (sl.forma === "I" || sl.forma === "tubo-ret" || sl.forma === "tubo-circ")) {
          cat = casarCatalogo(sl);
          perfil = cat ? cat.perfil : (sl.forma === "I" ? { forma: "I", d: r4(sl.d), bf: r4(sl.bf), tw: r4(sl.tw), tf: r4(sl.tf) }
            : sl.forma === "tubo-ret" ? { forma: "tubo-ret", b: r4(sl.b), h: r4(sl.h), t: r4(sl.t) } : { forma: "tubo-circ", D: r4(sl.D), t: r4(sl.t) });
        } else if (sl && sl.forma === "circ") perfil = { forma: "circ", d: r4(sl.d) };
        else if (sl && sl.forma === "ret") perfil = { forma: "ret", b: r4(sl.b), h: r4(sl.h) };
        if (!perfil) { r.conf = "baixa"; }
        mat = materialDe(p, perfil && perfil.forma, r.classe);
        var rotulo2 = cat ? cat.nome : (sl ? rotuloSecao(sl) : rotuloSecao(r.secao));
        if (r.classe === "pilar") {
          var rot = g.ux != null ? Math.atan2(-g.uz, g.ux) : 0, secI = sl && sl.forma === "I" ? sl : null, h = g.y1 - g.y0;
          /* I: a mesa fica em s (eixo u) ou em t (eixo w) — o rotY aponta a LARGURA DA MESA */
          if (secI && secI.flange === "t") rot = Math.atan2(-g.ux, -g.uz);
          if (perfil && perfil.forma === "tubo-ret" && sl && sl.b < sl.h) { /* b é a largura em local x: a seção lida tem b ao longo de u */ }
          it = novo("pilar", perfil ? r.conf : "baixa", r.motivo + (cat ? " = " + cat.nome + " do catálogo" : (sl && sl.forma !== "ret" && sl.forma !== "circ" ? " (fora do catálogo: seção medida)" : "")),
                    [p.uid], { x: r4(g.cx), z: r4(g.cz), rotY: r4(rot), base: r4(g.y0), altura: r4(h), perfil: perfil, perfilRotulo: rotulo2, material: mat.v, materialFonte: mat.fonte });
        } else {
          var L = dd.p, ux = g.ux, uz = g.uz;
          it = novo("viga", perfil ? r.conf : "baixa", r.motivo + (cat ? " = " + cat.nome + " do catálogo" : ""), [p.uid],
                    { p1: [r4(g.cx - ux * L / 2), r4(g.cz - uz * L / 2)], p2: [r4(g.cx + ux * L / 2), r4(g.cz + uz * L / 2)], topo: r4(g.y1), comprimento: r4(L), perfil: perfil, perfilRotulo: rotulo2, material: mat.v, materialFonte: mat.fonte });
        }
      } else if (r.classe === "esquadria") {
        esqs.push({ p: p, r: r });
      } else if (r.classe === "agua") {
        aguas.push({ p: p, r: r, T: p.T });
      }
      if (it) { it.pecas.push(p.i); p.item = it; }
    });
    /* 2) os vãos das paredes viram porta/janela hospedadas; painéis de esquadria que caem numa parede entram junto */
    function tNaParede(w, x, z) { return (x - w.dados.cx) * w.dados.ux + (z - w.dados.cz) * w.dados.uz; }
    function dNaParede(w, x, z) { return (x - w.dados.cx) * (-w.dados.uz) + (z - w.dados.cz) * w.dados.ux; }
    var vaosItens = [];
    paredes.forEach(function (w) {
      w.dados.vaos.forEach(function (v) {
        var tipo = Math.abs(v.y0 - w.dados.base) < 0.05 && (v.y1 - v.y0) >= 1.8 ? "porta" : "janela";
        var it = novo(tipo, w.conf === "alta" ? "media" : w.conf, "vão de " + br(v.x1 - v.x0) + " × " + br(v.y1 - v.y0) + " m na face da parede (" + (tipo === "porta" ? "desce até a base" : "peitoril de " + br(v.y0 - w.dados.base) + " m") + ")",
                      w.uids, { host: w.id, t: r4((v.x0 + v.x1) / 2), largura: r4(v.x1 - v.x0), altura: r4(v.y1 - v.y0), peitoril: r4(Math.max(0, v.y0 - w.dados.base)), fonte: "vão" });
        vaosItens.push(it);
      });
    });
    esqs.forEach(function (e) {
      var q = e.r.esq, host = null;
      paredes.forEach(function (w) {
        if (host) return;
        var t = tNaParede(w, q.cx, q.cz), d = dNaParede(w, q.cx, q.cz), wd = w.dados;
        if (Math.abs(t) <= wd.comprimento / 2 + 0.05 && Math.abs(d) <= wd.espessura / 2 + 0.08 && angDif(q.rotY, wd.rotY) <= 0.14 && q.y0 >= wd.base - 0.1 && q.y0 + q.altura <= wd.base + wd.altura + 0.1) host = { w: w, t: t };
      });
      if (!host) {
        var it0 = novo(q.dica === "porta" ? "porta" : "janela", "baixa", e.r.motivo + " — sem parede por perto para hospedar (fica genérico)", [e.p.uid], { host: null, largura: r4(q.largura), altura: r4(q.altura), fonte: "painel" });
        e.p.item = it0; it0.pecas.push(e.p.i); return;
      }
      var wd2 = host.w.dados, jaTem = wd2.vaos.filter(function (v) { var m0 = (v.x0 + v.x1) / 2; return Math.abs(m0 - host.t) < Math.max(0.15, (v.x1 - v.x0) / 2); })[0];
      if (jaTem) {   /* o painel está dentro de um vão que a parede já tem: confirma o vão (e é consumido por ele) */
        var vi = vaosItens.filter(function (x) { return x.dados.host === host.w.id && Math.abs(x.dados.t - r4((jaTem.x0 + jaTem.x1) / 2)) < 0.01; })[0];
        if (vi) { vi.conf = "alta"; vi.aplicavel = true; vi.uids = vi.uids.concat([e.p.uid]); vi.pecas.push(e.p.i); e.p.item = vi; vi.motivo += "; confirmado pela peça de esquadria dentro dele"; }
        return;
      }
      var tipo2 = q.dica === "janela" ? "janela" : (Math.abs(q.y0 - wd2.base) < 0.05 && q.altura >= 1.8 ? "porta" : (q.dica === "porta" ? "porta" : "janela"));
      var it2 = novo(tipo2, "media", "painel de " + br(q.largura) + " × " + br(q.altura) + " m dentro da parede " + host.w.id + " (a parede está inteira: o vão é aberto por ele)", [e.p.uid], { host: host.w.id, t: r4(host.t), largura: r4(q.largura), altura: r4(q.altura), peitoril: r4(Math.max(0, q.y0 - wd2.base)), fonte: "painel" });
      it2.pecas.push(e.p.i); e.p.item = it2; vaosItens.push(it2);
    });
    /* 3) águas → telhados */
    var tels = fitTelhados(aguas);
    tels.forEach(function (t) {
      var bom = t.cobertura >= 0.7 && t.largura >= 2 && t.caimento >= 2 && t.largura * t.caimento >= 9;
      var it = novo("telhado", bom ? "media" : "baixa", (t.membros.length) + " placa(s) inclinada(s) " + br(t.grau, 1) + "° (" + br(t.inclinacao, 1) + " %), " + br(t.largura) + " × " + br(t.caimento) + " m em planta, " + br(t.cobertura * 100, 0) + " % do retângulo coberto" + (bom ? "" : " (pequeno ou incompleto demais para ser um telhado inteiro — uma telha solta não vira telhado)"),
                    t.membros.map(function (a) { return a.p.uid; }), { contorno: t.contorno.map(function (q) { return [r4(q[0]), r4(q[1])]; }), inclinacao: r4(t.inclinacao), deslocBase: r4(t.deslocBase), espessura: r4(t.espessura), grau: r4(t.grau), cumeeiraY: r4(t.cumeeiraY) });
      t.membros.forEach(function (a) { a.p.item = it; it.pecas.push(a.p.i); });
    });
    /* 3b) o editor tem a última palavra: cada item é fabricado de verdade (mesmas funções que gravam) — o que ele recusa
       (laje fina fora do eixo, seção absurda) deixa de ser "aplicável" ANTES de decidir se o elemento pode sair de cena */
    itens.forEach(function (it) {
      if (!it.aplicavel || it.classe === "porta" || it.classe === "janela") return;
      var f = fabricar(it, opts);
      if (f.erro) { it.aplicavel = false; it.bloqueio = f.erro; }
    });
    var porIdI = {}; itens.forEach(function (it) { porIdI[it.id] = it; });
    itens.forEach(function (it) {
      if (!it.aplicavel || (it.classe !== "porta" && it.classe !== "janela")) return;
      var w = it.dados.host ? porIdI[it.dados.host] : null;
      if (!w || !w.aplicavel) { it.aplicavel = false; it.bloqueio = "a parede que a hospeda não pode ser criada"; return; }
      var f = fabricar(it, opts);
      if (f.erro) { it.aplicavel = false; it.bloqueio = f.erro; }
    });
    /* 4) o elemento só é trocado se (quase) tudo o que há nele virou algo aplicável */
    var elementos = est.elementos.map(function (el) {
      var conv = 0, tot = 0, n = 0, naoConv = [];
      el.pecas.forEach(function (i) {
        var p = pecas[i], a = p.area; tot += a;
        if (p.item && p.item.aplicavel) { conv += a; n++; } else naoConv.push(p.r && p.r.motivo ? p.r.motivo : "sem equivalente");
      });
      var frac = tot > 0 ? conv / tot : 0;
      return { uid: el.uid, id: el.id, arq: el.arq, nome: el.nome, nPecas: el.pecas.length, nConv: n, fracao: frac, converte: n > 0 && frac >= 0.95, motivoNao: n > 0 && frac < 0.95 ? "só " + br(frac * 100, 0) + " % da geometria foi reconhecida — o original fica" : (n === 0 ? (naoConv[0] || "sem equivalente") : "") };
    });
    var porUid = {}; elementos.forEach(function (e) { porUid[e.uid] = e; });
    itens.forEach(function (it) {
      if (!it.aplicavel) return;
      var ok = it.uids.some(function (u) { return porUid[u] && porUid[u].converte; });
      if (!ok) { it.aplicavel = false; it.bloqueio = "o elemento original tem outras partes que não consegui converter"; }
    });
    return montarResultado(est, itens, elementos);
  }

  function montarResultado(est, itens, elementos) {
    var porClasse = {}, ORDEM = ["parede", "porta", "janela", "laje", "pilar", "viga", "telhado"];
    ORDEM.forEach(function (c) { porClasse[c] = { n: 0, alta: 0, media: 0, baixa: 0, aplicaveis: 0 }; });
    itens.forEach(function (it) { var c = porClasse[it.classe]; if (!c) return; c.n++; c[it.conf]++; if (it.aplicavel) c.aplicaveis++; });
    var el = { total: elementos.length, convertem: 0, parciais: 0, ficam: 0 };
    elementos.forEach(function (e) { if (e.converte) el.convertem++; else if (e.nConv > 0) el.parciais++; else el.ficam++; });
    var motivos = {}, motivosUids = {};
    est.pecas.forEach(function (p) {
      if (!(p.r && !p.r.classe && p.r.motivo)) return;
      var k = p.r.motivo.replace(/[0-9]+([,.][0-9]+)?/g, "#"); motivos[k] = (motivos[k] || 0) + 1;
      var L = motivosUids[k] || (motivosUids[k] = []);
      if (L.length < 3000 && L.indexOf(p.uid) < 0) L.push(p.uid);   /* para o "Mostrar no 3D" de cada motivo */
    });
    return { itens: itens, elementos: elementos, porClasse: porClasse, resumoElementos: el, motivosGenericos: motivos, motivosUids: motivosUids, ms: Date.now() - est.t0, nPecas: est.pecas.length, ORDEM: ORDEM };
  }

  var FAM_PORTA = { famId: "ra-porta-giro", tipoId: "p80", batente: 0.05 }, FAM_JANELA = { famId: "ra-janela-correr", tipoId: "j1210" };
  function alinhadoAosEixos(P) {
    /* retângulo de lados paralelos a X e Z (a laje simples do editor só existe assim) */
    if (!P || P.length !== 4) return null;
    var xs = P.map(function (q) { return q[0]; }), zs = P.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
    var ok = P.every(function (q) { return (Math.abs(q[0] - x0) < 0.004 || Math.abs(q[0] - x1) < 0.004) && (Math.abs(q[1] - z0) < 0.004 || Math.abs(q[1] - z1) < 0.004); });
    return ok ? { x0: x0, x1: x1, z0: z0, z1: z1 } : null;
  }
  /* o material que o usuário escolheu na prévia vale só para a seção retangular/circular (o perfil de aço do catálogo é aço) */
  function matEscolhido(it, opts) {
    var e = opts && opts.materiais && opts.materiais[it.classe], f = it.dados.perfil && it.dados.perfil.forma;
    if (e && (f === "ret" || (f === "circ" && e !== "aco"))) return e;
    return it.dados.material;
  }
  /* fabrica a caixa de UM item com as funções do próprio editor — a mesma chamada serve para VALIDAR (em `fechar`) e para gravar */
  function fabricar(it, opts) {
    var E = BE(), A = BA(), d = it.dados, c = null;
    if (!E || !A) return { erro: "o motor do editor (js/bimedit.js, js/bimarq.js) não carregou" };
    if (it.classe === "parede") {
      var h = d.comprimento / 2;
      c = E.parede({ x: d.cx - d.ux * h, z: d.cz - d.uz * h }, { x: d.cx + d.ux * h, z: d.cz + d.uz * h }, d.espessura, d.altura, d.base);
      if (!c) return { erro: "a parede não cabe nas medidas do editor" };
      A.marcarParede(c, { unir: !opts || opts.unir !== false, anexarTopo: false });
      return { caixa: A.paraOp(c) };
    }
    if (it.classe === "laje") {
      if (d.espessura >= 0.03) {
        c = A.lajeContorno(d.contorno, { topo: d.topo, espessura: d.espessura, furos: d.furos });
        if (!c) return { erro: "o contorno não virou laje (cruza a si mesmo ou espessura fora de 3 cm a 1 m)" };
        return { caixa: A.paraOp(c) };
      }
      var al = !d.furos.length ? alinhadoAosEixos(d.contorno) : null;
      if (!al) return { erro: "espessura de " + br(d.espessura * 100, 1) + " cm: o editor só cria laje por contorno a partir de 3 cm (e a laje fina só existe com lados paralelos aos eixos)" };
      c = E.laje({ x: al.x0, z: al.z0 }, { x: al.x1, z: al.z1 }, d.espessura, d.topo);
      if (!c) return { erro: "a placa fina não cabe nas medidas do editor" };
      return { caixa: c };
    }
    if (it.classe === "pilar") {
      c = A.pilarPerfil([d.x, d.z], { perfil: d.perfil, material: matEscolhido(it, opts), base: d.base, altura: d.altura, rotY: d.rotY });
      return c ? { caixa: A.paraOp(c) } : { erro: "a seção ou a altura do pilar fogem das medidas do editor" };
    }
    if (it.classe === "viga") {
      c = A.vigaPerfil(d.p1, d.p2, { perfil: d.perfil, material: matEscolhido(it, opts), topo: d.topo });
      return c ? { caixa: A.paraOp(c) } : { erro: "a seção ou o comprimento da viga fogem das medidas do editor" };
    }
    if (it.classe === "porta" || it.classe === "janela") {
      var lt = it.classe === "porta" ? r4(d.largura - 2 * FAM_PORTA.batente) : r4(d.largura), at = it.classe === "porta" ? r4(d.altura - FAM_PORTA.batente) : r4(d.altura);
      if (!(lt >= 0.25) || !(at >= 0.3)) return { erro: "vão pequeno demais para a família (" + br(d.largura) + " × " + br(d.altura) + " m)" };
      return { larg: lt, alt: at };
    }
    if (it.classe === "telhado") {
      return { op: { op: "telhado", contorno: d.contorno.map(function (q, k) { var x = { x: q[0], z: q[1] }; if (k > 0) x.d = false; return x; }),
                     inclinacao: d.inclinacao, beiral: 0, base: 0, deslocBase: d.deslocBase,
                     tipoTelhado: { id: "ifc-conv", rotulo: "Telhado (do IFC)", camadas: [{ rotulo: "Telhamento", material: "Telha", e: d.espessura }], espessura: d.espessura } } };
    }
    return { erro: "classe desconhecida" };
  }

  /* =====================================================================
   * AS OPERAÇÕES — o que o editor grava. UM lote (um Ctrl+Z), original escondido por `apagarIfc`.
   * opts: { aceitar: { parede: false, … } (por categoria; sem a chave = aplica), unir: paredes unidas nos cantos (padrão sim,
   *         como no editor), novoId(prefixo), arq: nome do modelo }
   * → { ops, lote, criadas: { classe: n }, ocultados, recusadas: [{ item, motivo }] }
   * ⚠ O elemento só some se TUDO o que há nele foi criado: item recusado (pelo usuário ou pelo editor) derruba o elemento,
   *   que derruba os outros itens dele — ponto fixo, para nunca haver peça nova em cima do original.
   * ===================================================================== */
  function gerarOps(res, opts) {
    opts = opts || {};
    var E = BE(), A = BA(), ops = [], recusadas = [], criadas = {}, contador = 0;
    if (!E || !A) return { ops: [], lote: null, criadas: {}, ocultados: 0, recusadas: [{ item: null, motivo: "o motor do editor (js/bimedit.js, js/bimarq.js) não carregou" }] };
    var nid = typeof opts.novoId === "function" ? opts.novoId : function (p) { return (p || "cv") + "x" + (++contador); };
    function aceita(it) { return it.aplicavel && (!opts.aceitar || opts.aceitar[it.classe] !== false); }
    var porId = {}; res.itens.forEach(function (it) { porId[it.id] = it; });
    var ativo = {}; res.elementos.forEach(function (e) { ativo[e.uid] = !!e.converte; });
    var criavel = {}, mudou = true, guarda = 0;
    function porElem(uid) { return res.itens.filter(function (it) { return it.aplicavel && it.uids.indexOf(uid) >= 0; }); }
    while (mudou && guarda++ < 30) {
      mudou = false;
      res.itens.forEach(function (it) {
        var ok = aceita(it) && it.uids.every(function (u) { return ativo[u]; });
        if (ok && (it.classe === "porta" || it.classe === "janela") && it.dados.host) ok = !!criavel[it.dados.host];
        if (criavel[it.id] !== ok) { criavel[it.id] = ok; mudou = true; }
      });
      res.elementos.forEach(function (e) {
        if (!ativo[e.uid]) return;
        var seus = porElem(e.uid);
        if (!seus.length || seus.some(function (it) { return !criavel[it.id]; })) { ativo[e.uid] = false; mudou = true; }
      });
    }
    var ids = {};
    function conta(c) { criadas[c] = (criadas[c] || 0) + 1; }
    var tiposCriados = {};
    ["parede", "porta", "janela", "laje", "pilar", "viga", "telhado"].forEach(function (cls) {
      res.itens.forEach(function (it) {
        if (it.classe !== cls || !criavel[it.id]) return;
        var f = fabricar(it, opts);
        if (f.erro) { recusadas.push({ item: it.id, classe: it.classe, motivo: f.erro }); return; }
        if (cls === "porta" || cls === "janela") {
          var wid = ids[it.dados.host]; if (!wid) { recusadas.push({ item: it.id, classe: cls, motivo: "a parede que a hospeda não foi criada" }); return; }
          var F = cls === "porta" ? FAM_PORTA : FAM_JANELA, fid = nid("fa"), tkey = cls + "|" + f.larg + "|" + f.alt, tid = tiposCriados[tkey], inst = {};
          if (cls === "janela") inst.Peitoril = r4(it.dados.peitoril);
          ops.push({ op: "familia", id: fid, famId: F.famId, tipoId: F.tipoId, inst: inst, host: { id: wid, t: r4(it.dados.t) } });
          if (!tid) {
            tid = "ifc-" + cls.slice(0, 1) + "-" + String(f.larg).replace(".", "_") + "x" + String(f.alt).replace(".", "_"); tiposCriados[tkey] = tid;
            var v = {}; v["fam:Largura"] = f.larg; v["fam:Altura"] = f.alt;
            ops.push({ op: "ajustarTipo", categoria: cls, tipoId: tid, nome: br(it.dados.largura) + " × " + br(it.dados.altura) + " (do IFC)", valores: v, ids: [fid] });
          } else ops.push({ op: "ajustarTipo", categoria: cls, tipoId: tid, ids: [fid] });
          ids[it.id] = fid; conta(cls); return;
        }
        if (cls === "telhado") { var o = f.op; o.id = nid("te"); ids[it.id] = o.id; ops.push(o); conta("telhado"); return; }
        var id = nid(cls === "parede" ? "pa" : cls === "laje" ? "la" : cls === "pilar" ? "pi" : "vi");
        ids[it.id] = id; ops.push({ op: "criar", id: id, caixa: f.caixa }); conta(cls);
      });
    });
    /* o original sai de cena (oculto, nunca apagado do arquivo): só o elemento 100 % trocado */
    var ocultados = 0;
    res.elementos.forEach(function (e) {
      if (!ativo[e.uid]) return;
      ops.push({ op: "apagarIfc", uid: e.uid, arq: e.arq != null ? e.arq : (opts.arq != null ? opts.arq : null), eid: e.id });
      ocultados++;
    });
    var lote = ops.length ? { op: "lote", id: nid("lcv"), origem: "ifc-converter", pedido: "Converter IFC em elementos editáveis", ops: ops } : null;
    return { ops: ops, lote: lote, criadas: criadas, ocultados: ocultados, recusadas: recusadas };
  }

  function rotuloSecao(s) {
    if (!s) return "";
    if (s.forma === "ret") return br(s.b * 100, 1) + " × " + br(s.h * 100, 1) + " cm";
    if (s.forma === "circ") return "Ø " + br(s.d * 100, 1) + " cm";
    if (s.forma === "tubo-ret") return "tubo " + br(s.b * 1000, 0) + " × " + br(s.h * 1000, 0) + " × " + br(s.t * 1000, 1) + " mm";
    if (s.forma === "tubo-circ") return "tubo Ø " + br(s.D * 1000, 0) + " × " + br(s.t * 1000, 1) + " mm";
    if (s.forma === "I") return "I " + br(s.d * 1000, 0) + " × " + br(s.bf * 1000, 0) + " (tw " + br(s.tw * 1000, 1) + ", tf " + br(s.tf * 1000, 1) + ") mm";
    return String(s.forma);
  }

  global.BimIfcConv = global.BimIfcConv || {};
  var X = global.BimIfcConv;
  X.classificarSolido = classificarSolido; X.classificarElemento = classificarElemento;
  X.iniciar = iniciar; X.acrescentar = acrescentar; X.fechar = fechar; X.gerarOps = gerarOps; X.fitTelhados = fitTelhados;
  X._sec = { faceDaParede: faceDaParede, secaoDe: secaoDe, reconhecerSecao: reconhecerSecao, casarCatalogo: casarCatalogo, contornoLaje: contornoLaje, rotuloSecao: rotuloSecao };
  X._dicas = { dicasDe: dicasDe, materialProvavel: materialProvavel };
  X._geo = { casco: casco, retanguloMinimo: retanguloMinimo, lacosDeTris: lacosDeTris, contornoComFuros: contornoComFuros, areaPoli: areaPoli, simplificar: simplificar, medir: medir, coberturaCaixa: coberturaCaixa, dentroPoli: dentroPoli, componentes: componentes, placa: placa };
  X.LIM = LIM;
  if (typeof module !== "undefined" && module.exports) module.exports = X;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
